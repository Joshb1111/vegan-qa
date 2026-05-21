// GET /api/account
// Returns the signed-in user's credit balance and today's session count.

const MAX_SESSIONS_PER_DAY = 5;

function getUserId(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
  return m ? m[1] : null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const userId = getUserId(req);
  if (!userId) {
    return res.status(200).json({
      signedIn: false,
      creditsRemaining: 0,
      sessionsRemainingToday: MAX_SESSIONS_PER_DAY,
    });
  }

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();

    const [credits, usedToday] = await Promise.all([
      redis.get(`credits:${userId}`),
      redis.get(`sessions_today:${userId}:${today()}`),
    ]);

    return res.status(200).json({
      signedIn: true,
      creditsRemaining: parseInt(credits || "0", 10),
      sessionsRemainingToday: Math.max(0, MAX_SESSIONS_PER_DAY - parseInt(usedToday || "0", 10)),
    });
  } catch {
    return res.status(500).json({ error: "Account lookup failed" });
  } finally {
    try { await redis?.disconnect(); } catch {}
  }
}
