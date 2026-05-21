// POST /api/convai-webhook
// ElevenLabs calls this when a conversation ends. Reconciles active_session, records actual duration.
// Configure in ElevenLabs dashboard with a webhook secret.

import crypto from "node:crypto";

const WEBHOOK_SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET;

// Vercel needs the raw body to verify the HMAC signature
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function verifySignature(raw, header) {
  if (!header || !WEBHOOK_SECRET) return false;
  // ElevenLabs signature header format: "t=<timestamp>,v0=<hex>"
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));
  if (!parts.t || !parts.v0) return false;
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(`${parts.t}.${raw}`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v0));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const raw = await readRawBody(req);
  if (!verifySignature(raw, req.headers["elevenlabs-signature"])) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).end(); }

  // Only care about end-of-conversation events
  if (event.type !== "post_call_transcription" && event.type !== "conversation_ended") {
    return res.status(200).json({ ok: true });
  }

  const sessionId = event.data?.metadata?.session_id || event.data?.conversation_id;
  const durationSec = event.data?.metadata?.call_duration_secs || 0;

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();

    const sessionRaw = await redis.get(`convai_session:${sessionId}`);
    if (!sessionRaw) return res.status(200).json({ ok: true }); // unknown — ignore

    const session = JSON.parse(sessionRaw);

    // Clear the active-session lock so they can start their next session
    await redis.del(`active_session:${session.userId}`);

    // Update record with actual duration for analytics
    await redis.set(
      `convai_session:${sessionId}`,
      JSON.stringify({ ...session, actualSeconds: durationSec, endedAt: Date.now() }),
      { EX: 86400 * 30 }
    );

    return res.status(200).json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Webhook processing failed" });
  } finally {
    try { await redis?.disconnect(); } catch {}
  }
}
