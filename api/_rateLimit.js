/* =============================================================
   Einfaches In-Memory Rate Limiting für Vercel Serverless Functions.

   WICHTIG: In-Memory funktioniert NICHT zuverlässig als globales
   Rate Limit auf serverless Plattformen, da jede Function-Instanz
   ihren eigenen Speicher hat. Dieser Adapter verhindert Missbrauch
   in Einzelinstanzen und ist für Entwicklungsumgebungen ausreichend.

   Für globales Rate Limiting in Produktion: Redis/Upstash einbinden.
   Beispiel-Stub: createRateLimiter({ store: upstashStore }) ergänzen.
   ============================================================= */

// store: ip → { count, resetAt }
const store = new Map();

const WINDOW_MS = 10 * 60 * 1000; // 10 Minuten
const MAX_REQUESTS = 10;

/**
 * Prüft ob die gegebene IP das Limit überschreitet.
 * @param {string} ip
 * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
 */
function checkRateLimit(ip) {
  const now = Date.now();

  // Abgelaufene Einträge bereinigen (lazy cleanup)
  if (store.size > 1000) {
    for (const [key, val] of store) {
      if (val.resetAt < now) store.delete(key);
    }
  }

  let entry = store.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(ip, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= MAX_REQUESTS,
    remaining: Math.max(0, MAX_REQUESTS - entry.count),
    resetAt: entry.resetAt,
  };
}

/**
 * Extrahiert die Client-IP aus dem Vercel/Node-Request.
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

module.exports = { checkRateLimit, getClientIp, WINDOW_MS, MAX_REQUESTS };
