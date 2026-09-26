import { createHash } from "crypto";
import { VOICES, VOICE_MODEL, OUTPUT_FORMAT } from "./_voices.js";
import { TALKS, TALK_VOICE } from "./_talks.js";

// A house talk: Kofi reads one of the fixed scripts in _talks.js, with word timings so the screen can
// light each word as he says it. Only those scripts can be synthesised. The result is cached in Redis for
// a year, so each talk costs one synthesis ever; the daily per-IP limit only counts cache misses.
const DAILY_LIMIT = 30;
const TTL = 60 * 60 * 24 * 365;

function wordsFrom(al) {
  const chars = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds;
  const out = []; let w = "", s = 0, e = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) { if (w) out.push([w, +s.toFixed(2), +e.toFixed(2)]); w = ""; continue; }
    if (!w) s = st[i];
    w += c; e = en[i];
  }
  if (w) out.push([w, +s.toFixed(2), +e.toFixed(2)]);
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const slug = String(req.query.slug || "");
  const talk = TALKS[slug];
  if (!talk) return res.status(404).json({ error: "No such talk" });
  const voice = VOICES[TALK_VOICE];
  const plain = { slug, title: talk.title, page: talk.page, text: talk.text, words: null, audio: null };
  if (!voice || !process.env.ELEVENLABS_API_KEY) return res.status(200).json(plain);
  const key = `talk:1:${VOICE_MODEL}:${voice}:${createHash("sha1").update(talk.text).digest("hex")}`;

  let redis = null;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3000, reconnectStrategy: false } });
    redis.on("error", () => {});
    await redis.connect();
  } catch { redis = null; }
  const bye = async () => { try { if (redis) await redis.disconnect(); } catch {} };
  const send = (obj, cached) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "public, max-age=604800");
    res.setHeader("X-Talk-Cache", cached ? "hit" : "miss");
    return res.status(200).json(obj);
  };

  if (redis) {
    try { const hit = await redis.get(key); if (hit) { await bye(); return send(JSON.parse(hit), true); } } catch {}
  }
  const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const dayKey = `talkday:${clientIp}:${new Date().toISOString().slice(0, 10)}`;
  if (redis) {
    try { const n = parseInt(await redis.get(dayKey) || "0", 10); if (n >= DAILY_LIMIT) { await bye(); return res.status(200).json(plain); } } catch {}
  }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=${OUTPUT_FORMAT}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text: talk.text, model_id: VOICE_MODEL, voice_settings: { stability: 0.55, similarity_boost: 0.75 } }),
    });
    if (!r.ok) { console.error("ElevenLabs error", r.status, (await r.text()).slice(0, 300)); await bye(); return res.status(200).json(plain); }
    const j = await r.json();
    const al = j.alignment || j.normalized_alignment;
    const out = { ...plain, words: al ? wordsFrom(al) : null, audio: j.audio_base64 || null };
    if (redis && out.audio) {
      try { await redis.set(key, JSON.stringify(out), { EX: TTL }); const n = await redis.incr(dayKey); if (n === 1) await redis.expire(dayKey, 86400); } catch {}
    }
    await bye();
    return send(out, false);
  } catch (err) { console.error(err); await bye(); return res.status(200).json(plain); }
}
