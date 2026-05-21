// POST /api/convai-start
// Debits one credit, enforces daily limit, returns short-lived ElevenLabs signed URL.

const MAX_SESSIONS_PER_DAY = 5;
const MAX_SESSION_SECONDS = 300;          // 5 minutes hard cap (also set on the agent)
const ACTIVE_SESSION_TTL = 320;           // 5 min + 20s grace for handshake
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function getUserId(req) {
  // httpOnly cookie set after Stripe checkout. Reject if missing.
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Not signed in. Buy credits to start." });

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();
  } catch {
    return res.status(503).json({ error: "Storage unavailable. Try again." });
  }

  try {
    // 1. Block concurrent sessions per user
    const active = await redis.get(`active_session:${userId}`);
    if (active) {
      return res.status(409).json({ error: "You already have a session running." });
    }

    // 2. Daily limit (per UTC day — switch to user TZ if you care)
    const dayKey = `sessions_today:${userId}:${today()}`;
    const usedToday = parseInt((await redis.get(dayKey)) || "0", 10);
    if (usedToday >= MAX_SESSIONS_PER_DAY) {
      return res.status(429).json({
        error: `Daily limit reached (${MAX_SESSIONS_PER_DAY} sessions). Resets at 00:00 UTC.`,
      });
    }

    // 3. Atomic credit debit — DECR returns the new value; if it goes negative, refund and reject.
    const newBalance = await redis.decr(`credits:${userId}`);
    if (newBalance < 0) {
      await redis.incr(`credits:${userId}`); // refund
      return res.status(402).json({ error: "Out of credits. Top up to continue." });
    }

    // 4. Mark session active BEFORE calling ElevenLabs, so a slow API can't double-spend
    const sessionId = crypto.randomUUID();
    await redis.set(
      `active_session:${userId}`,
      JSON.stringify({ sessionId, startedAt: Date.now() }),
      { EX: ACTIVE_SESSION_TTL }
    );
    await redis.set(
      `convai_session:${sessionId}`,
      JSON.stringify({ userId, billed: 1, startedAt: Date.now() }),
      { EX: 86400 }
    );

    // 5. Get short-lived signed URL from ElevenLabs.
    // Their agent should be configured with max_duration_seconds = 300 (defense in depth).
    let signedUrl;
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${ELEVENLABS_AGENT_ID}`,
        { headers: { "xi-api-key": ELEVENLABS_API_KEY } }
      );
      if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
      const data = await r.json();
      signedUrl = data.signed_url;
    } catch (err) {
      // Roll back: refund credit, clear active session
      await redis.incr(`credits:${userId}`);
      await redis.del(`active_session:${userId}`);
      await redis.del(`convai_session:${sessionId}`);
      return res.status(502).json({ error: "Voice service unavailable. Credit refunded." });
    }

    // 6. Increment daily counter (only after success)
    const newDayCount = await redis.incr(dayKey);
    if (newDayCount === 1) await redis.expire(dayKey, 90000); // ~25h

    return res.status(200).json({
      signedUrl,
      sessionId,
      maxDurationSeconds: MAX_SESSION_SECONDS,
      creditsRemaining: newBalance,
      sessionsRemainingToday: MAX_SESSIONS_PER_DAY - newDayCount,
    });
  } finally {
    try { await redis.disconnect(); } catch {}
  }
}
