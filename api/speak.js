import { createHash } from "crypto";
import { VOICES, VOICE_MODEL, OUTPUT_FORMAT } from "./_voices.js";

// Turns a resident's answer into speech with ElevenLabs. Audio is cached in Redis for 30 days, so
// any answer is only ever synthesised once; the daily per-IP limit only counts cache misses.
const MAX_CHARS = 1200;
const DAILY_LIMIT = 40; // fresh syntheses per IP per day
const TTL = 60 * 60 * 24 * 30;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { who, text } = req.body || {};
  const voice = VOICES[who];
  if (!voice) return res.status(404).json({ error: "No hosted voice for this character" });
  if (!text || typeof text !== "string") return res.status(400).json({ error: "Missing text" });
  if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: "Voice service not configured" });
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS);
  const key = `tts:${VOICE_MODEL}:${voice}:${createHash("sha1").update(clean).digest("hex")}`;

  let redis = null;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3000, reconnectStrategy: false } });
    redis.on("error", () => {});
    await redis.connect();
  } catch { redis = null; }

  const send = (buf, cached) => {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    res.setHeader("X-Voice-Cache", cached ? "hit" : "miss");
    return res.status(200).send(buf);
  };

  if (redis) {
    try {
      const hit = await redis.get(key);
      if (hit) { await redis.disconnect(); return send(Buffer.from(hit, "base64"), true); }
    } catch {}
  }

  const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const dayKey = `ttsday:${clientIp}:${new Date().toISOString().slice(0, 10)}`;
  if (redis) {
    try {
      const n = parseInt(await redis.get(dayKey) || "0", 10);
      if (n >= DAILY_LIMIT) { await redis.disconnect(); return res.status(429).json({ error: "Voice limit reached for today" }); }
    } catch {}
  }

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=${OUTPUT_FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: clean, model_id: VOICE_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!r.ok) {
      console.error("ElevenLabs error", r.status, (await r.text()).slice(0, 300));
      try { if (redis) await redis.disconnect(); } catch {}
      return res.status(502).json({ error: "Voice service failed" });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (redis) {
      try {
        await redis.set(key, buf.toString("base64"), { EX: TTL });
        const n = await redis.incr(dayKey); if (n === 1) await redis.expire(dayKey, 86400);
      } catch {}
      try { await redis.disconnect(); } catch {}
    }
    return send(buf, false);
  } catch (err) {
    console.error(err);
    try { if (redis) await redis.disconnect(); } catch {}
    return res.status(500).json({ error: "Voice service failed" });
  }
}
