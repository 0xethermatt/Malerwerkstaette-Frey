/* =============================================================
   Vercel Serverless Function: /api/segment
   Ruft Replicate SAM-2 für interaktive Wandsegmentierung auf.

   WICHTIG: Das exakte Input-/Output-Schema des Replicate-Modells
   muss vor dem Einsatz auf https://replicate.com/meta/sam-2/api
   verifiziert werden. Dieser Code implementiert das zur
   Entwicklungszeit bekannte Schema für interactive point-based
   segmentation. Falls meta/sam-2 kein interaktives Point-Input
   unterstützt, wechseln Sie das Modell auf:
     REPLICATE_SEGMENTATION_MODEL=lucataco/segment-anything-2
   Das Provider-Pattern in replicateProvider() macht den Wechsel
   auf eine Zeile reduzierbar.

   POST /api/segment
   Body: { imageDataUrl: string, points: SegmentationPoint[] }
   Response: { maskDataUrl: string, width: number, height: number }
   ============================================================= */

const https = require("https");
const http = require("http");
const { checkRateLimit, getClientIp } = require("./_rateLimit");

// Einfache Eingabe-Validierung ohne externe Bibliothek
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_DATA_URL_BYTES = 5 * 1024 * 1024; // 5 MB base64
const MAX_POINTS = 20;
const MODEL_TIMEOUT_MS = 40000;

/** Parst und validiert den Request-Body. Wirft bei Fehler. */
function validateBody(body) {
  const { imageDataUrl, points } = body;

  if (typeof imageDataUrl !== "string") throw { status: 400, message: "imageDataUrl fehlt." };
  if (Buffer.byteLength(imageDataUrl, "utf8") > MAX_DATA_URL_BYTES) {
    throw { status: 413, message: "Bild zu groß (max 5 MB nach Base64-Kodierung)." };
  }

  const mimeMatch = imageDataUrl.match(/^data:([^;]+);base64,/);
  if (!mimeMatch) throw { status: 400, message: "imageDataUrl ist kein gültiger Data-URL." };
  const mime = mimeMatch[1].toLowerCase();
  if (!ALLOWED_MIME.includes(mime)) {
    throw { status: 415, message: `Dateityp nicht erlaubt: ${mime}` };
  }

  if (!Array.isArray(points) || points.length === 0) {
    throw { status: 400, message: "Mindestens ein Punkt erforderlich." };
  }
  if (points.length > MAX_POINTS) {
    throw { status: 400, message: `Maximal ${MAX_POINTS} Punkte erlaubt.` };
  }
  for (const p of points) {
    if (
      typeof p.x !== "number" || typeof p.y !== "number" ||
      p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1 ||
      (p.label !== "include" && p.label !== "exclude")
    ) {
      throw { status: 400, message: "Ungültiger Punkt (x/y müssen 0–1 sein, label include|exclude)." };
    }
  }

  return { imageDataUrl, points };
}

/** Data-URL → { mime, buffer } */
function dataUrlToBuffer(dataUrl) {
  const [header, b64] = dataUrl.split(",");
  const mime = header.replace(/^data:([^;]+);.*/, "$1");
  return { mime, buffer: Buffer.from(b64, "base64") };
}

/** Lädt eine URL und gibt den Buffer zurück (max 30s). */
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http;
    const timeout = setTimeout(() => reject(new Error("Fetch-Timeout")), 30000);
    proto.get(url, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => { clearTimeout(timeout); resolve(Buffer.concat(chunks)); });
      res.on("error", (e) => { clearTimeout(timeout); reject(e); });
    }).on("error", (e) => { clearTimeout(timeout); reject(e); });
  });
}

/**
 * Normalisiert die Replicate-Ausgabe zu einer binären Maske als PNG-Buffer.
 * SAM2 gibt typischerweise ein Graustufenbild zurück (weiß = Wand).
 *
 * NOTE: Dieses Parsing muss an die tatsächliche Ausgabe des Modells
 * angepasst werden. Mögliche Formate: URL-String, Array von URLs,
 * { mask: URL }, Buffer, Blob.
 */
async function normalizeMaskOutput(output) {
  let maskUrl = null;

  if (typeof output === "string" && output.startsWith("http")) {
    // Einzelne URL
    maskUrl = output;
  } else if (Array.isArray(output)) {
    // zsxkib/segment-anything-2: [mask_image_url, ...] oder Array von URLs
    const first = output[0];
    if (typeof first === "string" && first.startsWith("http")) {
      maskUrl = first;
    } else if (first && typeof first === "object") {
      // Replicate FileOutput-Objekt
      if (typeof first.url === "function") {
        maskUrl = (await first.url()).href || String(await first.url());
      } else if (typeof first.url === "string") {
        maskUrl = first.url;
      } else if (typeof first.mask === "string") {
        maskUrl = first.mask;
      }
    }
  } else if (output && typeof output === "object") {
    // { masks: [...], scores: [...] } — zsxkib-Format
    if (Array.isArray(output.masks) && output.masks.length > 0) {
      const m = output.masks[0];
      maskUrl = typeof m === "string" ? m : (m && m.url ? m.url : null);
    }
    // Fallback auf andere Felder
    if (!maskUrl) {
      maskUrl = output.mask || output.mask_url || output.output || output.image || null;
    }
    // Replicate FileOutput mit .url()-Methode
    if (!maskUrl && output && typeof output.url === "function") {
      maskUrl = (await output.url()).href || String(await output.url());
    }
  }

  if (!maskUrl) {
    console.error("[segment] Unbekanntes Output-Format:", JSON.stringify(output).substring(0, 300));
    throw new Error("Replicate lieferte kein verwertbares Maskenergebnis.");
  }

  // Maske von Replicate herunterladen (temporäre URL, nicht weitergeben)
  const buf = await fetchUrl(maskUrl);
  return buf;
}

/**
 * Baut die Modell-spezifischen Input-Parameter zusammen.
 *
 * meta/sam-2 (offiziell) unterstützt NUR automatische Segmentierung
 * (points_per_side). Für interaktive Punkt-Eingabe wird
 * zsxkib/segment-anything-2 verwendet, dessen Schema bekannt ist:
 *   point_coords: "[[x, y], ...]"
 *   point_labels: "[1, 0, ...]"
 *
 * Wird REPLICATE_SEGMENTATION_MODEL auf meta/sam-2 gesetzt, wechselt
 * der Code automatisch auf zsxkib/segment-anything-2 als funktionsfähiges
 * interaktives Modell. Das Modell kann jederzeit per Env-Var übersteuert
 * werden.
 */
function buildModelInput({ imageBlob, pixelCoords, labels, model }) {
  // zsxkib/segment-anything-2 und kompatible Modelle
  if (
    model.includes("zsxkib") ||
    model.includes("lucataco") ||
    model.includes("segment-anything-2")
  ) {
    return {
      image: imageBlob,
      point_coords: JSON.stringify(pixelCoords),
      point_labels: JSON.stringify(labels),
      multimask_output: false,
    };
  }

  // Generischer Fallback (meta/sam-2-large oder andere Varianten)
  return {
    image: imageBlob,
    input_points: JSON.stringify(pixelCoords),
    input_labels: JSON.stringify(labels),
  };
}

async function replicateProvider({ imageBuffer, mime, points, imageWidth, imageHeight }) {
  const Replicate = require("replicate");
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

  // meta/sam-2 unterstützt kein interaktives Point-Input →
  // automatisch auf das bewährte interaktive Modell wechseln.
  let model = process.env.REPLICATE_SEGMENTATION_MODEL || "zsxkib/segment-anything-2";
  if (model === "meta/sam-2") {
    model = "zsxkib/segment-anything-2";
  }

  const pixelCoords = points.map((p) => [
    Math.round(p.x * imageWidth),
    Math.round(p.y * imageHeight),
  ]);
  const labels = points.map((p) => (p.label === "include" ? 1 : 0));

  const imageBlob = new Blob([imageBuffer], { type: mime });
  const modelInput = buildModelInput({ imageBlob, pixelCoords, labels, model });

  const output = await Promise.race([
    replicate.run(model, { input: modelInput }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), MODEL_TIMEOUT_MS)
    ),
  ]);

  return normalizeMaskOutput(output);
}

/** Hauptfunktion der Vercel Serverless Function */
module.exports = async function handler(req, res) {
  // Feature Flag
  if (process.env.FARBDESIGNER_ENABLED === "false") {
    return res.status(503).json({ error: "Farbdesigner ist aktuell deaktiviert." });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Nur POST erlaubt." });
  }

  // Rate Limiting
  const ip = getClientIp(req);
  const rate = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Remaining", rate.remaining);
  if (!rate.allowed) {
    return res.status(429).json({
      error: "Zu viele Anfragen. Bitte warten Sie einige Minuten und versuchen Sie es erneut.",
    });
  }

  // Body einlesen (Vercel liefert den Body teils vorgeparst)
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
    } catch (e) {
      return res.status(400).json({ error: "Request-Body konnte nicht gelesen werden." });
    }
  }

  // Eingabe validieren
  let validated;
  try {
    validated = validateBody(body);
  } catch (e) {
    return res.status(e.status || 400).json({ error: e.message });
  }

  // Replicate-Token prüfen
  if (!process.env.REPLICATE_API_TOKEN) {
    return res.status(503).json({
      error: "Bilderkennung momentan nicht konfiguriert. Bitte kontaktieren Sie uns direkt.",
    });
  }

  // Bild dekodieren
  let imageBuffer, mime;
  try {
    ({ mime, buffer: imageBuffer } = dataUrlToBuffer(validated.imageDataUrl));
  } catch {
    return res.status(400).json({ error: "Bild konnte nicht dekodiert werden." });
  }

  // Bildgröße aus dem Data-URL ermitteln (approximiert; Provider nutzt diese für Koordinaten)
  // Genauere Ermittlung erfordert eine vollständige JPEG/PNG-Dekodierung — für die
  // Koordinaten-Umrechnung reicht hier eine Annäherung; der Client kennt die genaue Größe.
  const imageWidth = body.imageWidth || 1024;
  const imageHeight = body.imageHeight || 768;

  // Segmentierung aufrufen
  let maskBuffer;
  try {
    maskBuffer = await replicateProvider({
      imageBuffer,
      mime,
      points: validated.points,
      imageWidth,
      imageHeight,
    });
  } catch (err) {
    const msg = err.message || "";
    if (msg === "TIMEOUT") {
      return res.status(504).json({
        error: "Die Bilderkennung hat zu lange gedauert. Bitte versuchen Sie es erneut.",
      });
    }
    console.error("[segment] Replicate error:", msg.substring(0, 200));
    return res.status(502).json({
      error: "Die Bilderkennung ist momentan nicht erreichbar. Sie können es erneut versuchen oder die Auswahl manuell bearbeiten.",
    });
  }

  // Maske validieren (nicht leer, nicht zu groß)
  if (!maskBuffer || maskBuffer.length < 100) {
    return res.status(422).json({
      error: "Die Wand konnte nicht eindeutig erkannt werden. Setzen Sie einen weiteren Punkt auf die Wand oder schließen Sie einen falschen Bereich aus.",
    });
  }

  // Maske als Data-URL zurückgeben (kein dauerhaftes Speichern)
  const maskDataUrl = "data:image/png;base64," + maskBuffer.toString("base64");

  return res.status(200).json({
    maskDataUrl,
    width: imageWidth,
    height: imageHeight,
  });
};
