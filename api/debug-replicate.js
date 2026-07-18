"use strict";

const https = require("https");

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

module.exports = async function handler(req, res) {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return res.status(503).json({ error: "no token" });

  const results = {};

  // Test 1: check zsxkib/segment-anything-2 model info
  try {
    const r = await httpsRequest({
      hostname: "api.replicate.com",
      path: "/v1/models/zsxkib/segment-anything-2",
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    results.model_info = { status: r.status, body: r.raw.substring(0, 600) };
  } catch (e) {
    results.model_info = { error: e.message };
  }

  // Test 2: get meta/sam-2 versions list
  try {
    const r = await httpsRequest({
      hostname: "api.replicate.com",
      path: "/v1/models/meta/sam-2/versions",
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    results.meta_sam2_versions = { status: r.status, body: r.raw.substring(0, 800) };
  } catch (e) {
    results.meta_sam2_versions = { error: e.message };
  }

  // Test 3: search for SAM models on Replicate
  try {
    const r = await httpsRequest({
      hostname: "api.replicate.com",
      path: "/v1/models?query=segment+anything",
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    results.search_sam = { status: r.status, body: r.raw.substring(0, 1200) };
  } catch (e) {
    results.search_sam = { error: e.message };
  }

  // Test 4: try meta/sam-2 with version-based prediction (automatic mode)
  // First need version from Test 2 — try with a known version hash if available
  if (results.meta_sam2_versions && results.meta_sam2_versions.status === 200) {
    try {
      const versionsBody = JSON.parse(
        results.meta_sam2_versions.body.replace(/\n$/, "")
      );
      const latestVersion = versionsBody.results && versionsBody.results[0] && versionsBody.results[0].id;
      results.latest_version_id = latestVersion || "not_found";

      if (latestVersion) {
        const inputBody = JSON.stringify({
          version: latestVersion,
          input: {
            image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/240px-PNG_transparency_demonstration_1.png",
            points_per_side: 16,
          },
        });
        const r = await httpsRequest({
          hostname: "api.replicate.com",
          path: "/v1/predictions",
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(inputBody),
            Prefer: "wait=5",
          },
        }, inputBody);
        results.version_prediction = { status: r.status, body: r.raw.substring(0, 800) };
      }
    } catch (e) {
      results.version_prediction = { error: e.message };
    }
  }

  return res.status(200).json(results);
};
