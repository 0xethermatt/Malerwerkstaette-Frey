/* =============================================================
   Vercel Serverless Function: /api/segment
   Verwendet die Replicate HTTP API direkt (kein SDK) für maximale
   Kompatibilität in serverlosen Node.js-Umgebungen.

   Ablauf:
   1. Bild per Multipart an https://api.replicate.com/v1/files hochladen
   2. Erhaltene CDN-URL an zsxkib/segment-anything-2 übergeben
   3. Maske als Data-URL zurückgeben
   ============================================================= */

"use strict";

const https = require("https");
const { checkRateLimit, getClientIp } = require("./_rateLimit");

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_DATA_URL_BYTES = 5 * 1024 * 1024;
const MAX_POINTS = 20;
const PREDICTION_TIMEOUT_MS = 40000;

// Modell mit bekanntem interaktivem Point-Input-Schema
const INTERACTIVE_MODEL = "zsxkib/segment-anything-2";

/* ----------------------------------------------------------------
   Eingabe-Validierung
---------------------------------------------------------------- */
function validateBody(body) {
  const { imageDataUrl, points } = body;

  if (typeof imageDataUrl !== "string")
    throw { status: 400, message: "imageDataUrl fehlt." };
  if (Buffer.byteLength(imageDataUrl, "utf8") > MAX_DATA_URL_BYTES)
    throw { status: 413, message: "Bild zu groß (max 5 MB nach Base64-Kodierung)." };

  const mimeMatch = imageDataUrl.match(/^data:([^;]+);base64,/);
  if (!mimeMatch)
    throw { status: 400, message: "imageDataUrl ist kein gültiger Data-URL." };
  const mime = mimeMatch[1].toLowerCase();
  if (!ALLOWED_MIME.includes(mime))
    throw { status: 415, message: `Dateityp nicht erlaubt: ${mime}` };

  if (!Array.isArray(points) || points.length === 0)
    throw { status: 400, message: "Mindestens ein Punkt erforderlich." };
  if (points.length > MAX_POINTS)
    throw { status: 400, message: `Maximal ${MAX_POINTS} Punkte erlaubt.` };
  for (const p of points) {
    if (
      typeof p.x !== "number" || typeof p.y !== "number" ||
      p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 ||
      (p.label !== "include" && p.label !== "exclude")
    ) throw { status: 400, message: "Ungültiger Punkt." };
  }

  return { imageDataUrl, points, mime };
}

/* ----------------------------------------------------------------
   HTTPS-Helfer
---------------------------------------------------------------- */
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw), raw });
        } catch {
          resolve({ status: res.statusCode, body: null, raw });
        }
      });
      res.on("error", reject);
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/* ----------------------------------------------------------------
   Bild zu Replicate Files API hochladen → CDN-URL erhalten
   POST https://api.replicate.com/v1/files  (multipart/form-data)
---------------------------------------------------------------- */
async function uploadImageToReplicate(imageBuffer, mime, token) {
  const boundary = "frey" + Date.now().toString(36);
  const ext = mime === "image/png" ? "png" : "jpg";
  const filename = `room.${ext}`;

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="content"; filename="${filename}"\r\n` +
    `Content-Type: ${mime}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const bodyBuf = Buffer.concat([header, imageBuffer, footer]);

  const res = await httpsRequest(
    {
      hostname: "api.replicate.com",
      path: "/v1/files",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": bodyBuf.length,
      },
    },
    bodyBuf
  );

  console.log(`[segment] File upload status: ${res.status}, body: ${res.raw.substring(0, 300)}`);

  if (res.status !== 201 || !res.body || !res.body.urls) {
    throw new Error(
      `Replicate File-Upload fehlgeschlagen (${res.status}): ${res.raw.substring(0, 300)}`
    );
  }

  // Replicate gibt { urls: { get: "https://..." } } zurück
  const cdnUrl = res.body.urls.get;
  console.log(`[segment] File uploaded, CDN URL: ${cdnUrl}`);
  return cdnUrl;
}

/* ----------------------------------------------------------------
   Prediction starten und auf Ergebnis warten
   Wir nutzen "Prefer: wait=55" — Replicate antwortet synchron.
---------------------------------------------------------------- */
async function runPrediction(token, imageUrl, pixelCoords, labels) {
  // Community models use /v1/models/{owner}/{name}/predictions endpoint
  const inputBody = JSON.stringify({
    input: {
      image: imageUrl,
      point_coords: JSON.stringify(pixelCoords),
      point_labels: JSON.stringify(labels),
      multimask_output: false,
    },
  });

  const res = await httpsRequest(
    {
      hostname: "api.replicate.com",
      path: `/v1/models/${INTERACTIVE_MODEL}/predictions`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(inputBody),
        Prefer: "wait=55",
      },
    },
    inputBody
  );

  console.log(`[segment] Replicate response status: ${res.status}`);
  console.log(`[segment] Replicate response body: ${res.raw.substring(0, 500)}`);

  if (!res.body) {
    throw new Error(`Replicate antwortete mit Status ${res.status}: ${res.raw.substring(0, 300)}`);
  }

  const pred = res.body;

  // Wenn "wait" greift, ist status direkt "succeeded" oder "failed"
  if (pred.status === "succeeded") return pred.output;
  if (pred.status === "failed") {
    throw new Error(`Replicate-Modell fehlgeschlagen: ${pred.error || "kein Detail"}`);
  }

  // Fallback: manuell pollen (falls Prefer: wait nicht unterstützt)
  if (pred.id) {
    return pollPrediction(token, pred.id);
  }

  throw new Error(`Unerwarteter Replicate-Status: ${pred.status || "unbekannt"}, Body: ${res.raw.substring(0, 200)}`);
}

async function pollPrediction(token, predictionId) {
  const deadline = Date.now() + PREDICTION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));

    const res = await httpsRequest({
      hostname: "api.replicate.com",
      path: `/v1/predictions/${predictionId}`,
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const pred = res.body;
    if (!pred) continue;
    if (pred.status === "succeeded") return pred.output;
    if (pred.status === "failed") {
      throw new Error(`Replicate-Modell fehlgeschlagen: ${pred.error || "kein Detail"}`);
    }
  }
  throw new Error("TIMEOUT");
}

/* ----------------------------------------------------------------
   Ausgabe normalisieren → Masken-Buffer
   zsxkib/segment-anything-2 gibt ein Array zurück:
   [ mask_image_url, iou_scores_url, low_res_logits_url ]
---------------------------------------------------------------- */
async function normalizeMaskOutput(output) {
  let maskUrl = null;

  if (typeof output === "string" && output.startsWith("http")) {
    maskUrl = output;
  } else if (Array.isArray(output)) {
    // Erstes Element = beste Maske
    const first = output[0];
    if (typeof first === "string" && first.startsWith("http")) {
      maskUrl = first;
    } else if (first && typeof first === "object") {
      maskUrl = first.url || first.mask || null;
    }
  } else if (output && typeof output === "object") {
    maskUrl = output.masks?.[0] || output.mask || output.image || null;
  }

  if (!maskUrl) {
    const preview = JSON.stringify(output).substring(0, 400);
    console.error("[segment] Unbekanntes Output-Format:", preview);
    throw new Error("Replicate lieferte kein verwertbares Maskenergebnis.");
  }

  const buf = await new Promise((resolve, reject) => {
    https.get(maskUrl, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });

  return buf;
}

/* ----------------------------------------------------------------
   Maske validieren
---------------------------------------------------------------- */
function validateMaskBuffer(buf) {
  if (!buf || buf.length < 500) {
    throw { status: 422, message: "Die erkannte Maske ist leer oder zu klein." };
  }
}

/* ----------------------------------------------------------------
   Handler
---------------------------------------------------------------- */
module.exports = async function handler(req, res) {
  if (process.env.FARBDESIGNER_ENABLED === "false") {
    return res.status(503).json({ error: "Farbdesigner ist aktuell deaktiviert." });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Nur POST erlaubt." });
  }

  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Remaining", rate.remaining);
  if (!rate.allowed) {
    return res.status(429).json({
      error: "Zu viele Anfragen. Bitte warten Sie einige Minuten.",
    });
  }

  // Body lesen
  let body = req.body;
  if (!body) {
    try {
      body = await new Promise((resolve, reject) => {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          try { resolve(JSON.parse(raw)); } catch { reject(new Error("Ungültiges JSON.")); }
        });
        req.on("error", reject);
      });
    } catch {
      return res.status(400).json({ error: "Request-Body konnte nicht gelesen werden." });
    }
  }

  let validated;
  try {
    validated = validateBody(body);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return res.status(503).json({
      error: "Bilderkennung momentan nicht konfiguriert. Bitte kontaktieren Sie uns direkt.",
    });
  }

  // Bild dekodieren
  const b64 = validated.imageDataUrl.replace(/^data:[^;]+;base64,/, "");
  const imageBuffer = Buffer.from(b64, "base64");

  const imageWidth  = Number(body.imageWidth)  || 1024;
  const imageHeight = Number(body.imageHeight) || 768;

  const pixelCoords = validated.points.map((p) => [
    Math.round(p.x * imageWidth),
    Math.round(p.y * imageHeight),
  ]);
  const labels = validated.points.map((p) => (p.label === "include" ? 1 : 0));

  try {
    // 1. Bild hochladen
    const imageUrl = await uploadImageToReplicate(imageBuffer, validated.mime, token);

    // 2. Segmentierung ausführen
    const predTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), PREDICTION_TIMEOUT_MS)
    );
    const output = await Promise.race([
      runPrediction(token, imageUrl, pixelCoords, labels),
      predTimeout,
    ]);

    // 3. Maske normalisieren
    const maskBuffer = await normalizeMaskOutput(output);
    validateMaskBuffer(maskBuffer);

    // Masken-Größenprüfung (zu leer / zu voll) geschieht im Browser nach Canvas-Decode
    const maskDataUrl = "data:image/png;base64," + maskBuffer.toString("base64");

    return res.status(200).json({ maskDataUrl, width: imageWidth, height: imageHeight });

  } catch (err) {
    const msg = String(err.message || "");
    console.error("[segment] Fehler:", msg.substring(0, 800));

    if (err.status === 422) {
      return res.status(422).json({ error: err.message });
    }
    if (msg === "TIMEOUT") {
      return res.status(504).json({
        error: "Die Bilderkennung hat zu lange gedauert. Bitte versuchen Sie es erneut.",
      });
    }
    return res.status(502).json({
      error: "Die Bilderkennung ist momentan nicht erreichbar. Sie können es erneut versuchen oder die Auswahl manuell bearbeiten.",
    });
  }
};
