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

  // Test 2: check meta/sam-2 model info
  try {
    const r = await httpsRequest({
      hostname: "api.replicate.com",
      path: "/v1/models/meta/sam-2",
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    results.meta_sam2 = { status: r.status, body: r.raw.substring(0, 600) };
  } catch (e) {
    results.meta_sam2 = { error: e.message };
  }

  // Test 3: try a minimal prediction with zsxkib model
  try {
    const inputBody = JSON.stringify({
      input: {
        image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/240px-PNG_transparency_demonstration_1.png",
        point_coords: "[[120,120]]",
        point_labels: "[1]",
        multimask_output: false,
      },
    });
    const r = await httpsRequest({
      hostname: "api.replicate.com",
      path: "/v1/models/zsxkib/segment-anything-2/predictions",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(inputBody),
        Prefer: "wait=5",
      },
    }, inputBody);
    results.zsxkib_prediction = { status: r.status, body: r.raw.substring(0, 800) };
  } catch (e) {
    results.zsxkib_prediction = { error: e.message };
  }

  return res.status(200).json(results);
};
