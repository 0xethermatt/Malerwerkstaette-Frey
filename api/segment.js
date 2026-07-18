/* =============================================================
   Vercel Serverless Function: /api/segment
   Runs meta/sam-2 automatic segmentation on an uploaded image.
   Returns a combined_mask where each detected segment has a unique color.
   The client then extracts wall segments locally by reading pixel colors.
   ============================================================= */

"use strict";

const https = require("https");
const { checkRateLimit, getClientIp } = require("./_rateLimit");

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_DATA_URL_BYTES = 5 * 1024 * 1024;
const PREDICTION_TIMEOUT_MS = 55000;

// meta/sam-2 version — automatic segmentation, returns combined_mask
const SAM2_VERSION = "fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83";

/* ----------------------------------------------------------------
   Eingabe-Validierung
---------------------------------------------------------------- */
function validateBody(body) {
  const { imageDataUrl } = body;

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

  return { imageDataUrl, mime };
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

  console.log(`[segment] File upload status: ${res.status}`);

  if (res.status !== 201 || !res.body || !res.body.urls) {
    throw new Error(
      `Replicate File-Upload fehlgeschlagen (${res.status}): ${res.raw.substring(0, 300)}`
    );
  }

  const cdnUrl = res.body.urls.get;
  console.log(`[segment] Uploaded to: ${cdnUrl}`);
  return cdnUrl;
}

/* ----------------------------------------------------------------
   Auto-Segmentierung mit meta/sam-2
   Gibt combined_mask zurück: farbiges Bild, jedes Segment = eigene Farbe
---------------------------------------------------------------- */
async function runAutoSegmentation(token, imageUrl) {
  const inputBody = JSON.stringify({
    version: SAM2_VERSION,
    input: {
      image: imageUrl,
      points_per_side: 32,       // 32×32 = 1024 prompt points — feinere Segmente
      pred_iou_thresh: 0.88,
      stability_score_thresh: 0.95,
      use_m2m: true,
    },
  });

  const res = await httpsRequest(
    {
      hostname: "api.replicate.com",
      path: "/v1/predictions",
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

  console.log(`[segment] Prediction status: ${res.status}`);
  console.log(`[segment] Prediction body: ${res.raw.substring(0, 600)}`);

  if (!res.body) {
    throw new Error(`Replicate status ${res.status}: ${res.raw.substring(0, 300)}`);
  }

  const pred = res.body;
  if (pred.status === "succeeded") return pred.output;
  if (pred.status === "failed") {
    throw new Error(`Modell fehlgeschlagen: ${pred.error || "kein Detail"}`);
  }
  if (pred.id) return pollPrediction(token, pred.id);

  throw new Error(`Unerwarteter Status: ${pred.status || "unbekannt"}, Body: ${res.raw.substring(0, 200)}`);
}

async function pollPrediction(token, predictionId) {
  const deadline = Date.now() + PREDICTION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

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
      throw new Error(`Modell fehlgeschlagen: ${pred.error || "kein Detail"}`);
    }
  }
  throw new Error("TIMEOUT");
}

/* ----------------------------------------------------------------
   Output → combined_mask Buffer
   meta/sam-2 gibt { combined_mask: URL, ... } zurück
---------------------------------------------------------------- */
async function downloadCombinedMask(output) {
  let maskUrl = null;

  if (output && typeof output === "object" && !Array.isArray(output)) {
    maskUrl = output.combined_mask || output.mask || output.image || null;
    // FileOutput objects have a .url property
    if (!maskUrl && output.combined_mask && typeof output.combined_mask === "object") {
      maskUrl = output.combined_mask.url || null;
    }
  } else if (typeof output === "string") {
    maskUrl = output;
  } else if (Array.isArray(output) && output.length > 0) {
    maskUrl = typeof output[0] === "string" ? output[0] : (output[0] && output[0].url);
  }

  if (!maskUrl) {
    const preview = JSON.stringify(output).substring(0, 400);
    console.error("[segment] Unbekanntes Output-Format:", preview);
    throw new Error("Replicate lieferte kein combined_mask. Output: " + preview);
  }

  console.log(`[segment] Downloading combined_mask: ${maskUrl}`);

  const buf = await new Promise((resolve, reject) => {
    https.get(maskUrl, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });

  if (!buf || buf.length < 500) {
    throw new Error("Combined-Mask-Bild ist leer oder zu klein.");
  }

  return buf;
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

  const b64 = validated.imageDataUrl.replace(/^data:[^;]+;base64,/, "");
  const imageBuffer = Buffer.from(b64, "base64");
  const imageWidth  = Number(body.imageWidth)  || 1024;
  const imageHeight = Number(body.imageHeight) || 768;

  try {
    const imageUrl = await uploadImageToReplicate(imageBuffer, validated.mime, token);

    const predTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), PREDICTION_TIMEOUT_MS)
    );
    const output = await Promise.race([
      runAutoSegmentation(token, imageUrl),
      predTimeout,
    ]);

    const maskBuffer = await downloadCombinedMask(output);
    const combinedMaskDataUrl = "data:image/png;base64," + maskBuffer.toString("base64");

    return res.status(200).json({ combinedMaskDataUrl, width: imageWidth, height: imageHeight });

  } catch (err) {
    const msg = String(err.message || "");
    console.error("[segment] Fehler:", msg.substring(0, 800));

    if (msg === "TIMEOUT") {
      return res.status(504).json({
        error: "Die Bildanalyse hat zu lange gedauert. Bitte versuchen Sie es erneut.",
      });
    }
    return res.status(502).json({
      error: "Die Bilderkennung ist momentan nicht erreichbar. Sie können die Auswahl manuell mit dem Pinsel bearbeiten.",
      _debug: msg.substring(0, 500),
    });
  }
};
