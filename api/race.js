// The skate park race leaderboard: fastest laps, kept in the same Redis the chatbot uses.
// GET  -> { top: [{name, ms}, ...] }  (fastest ten)
// POST { name, ms } -> adds a lap and returns the new top ten
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  let redis = null;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3000, reconnectStrategy: false } });
    redis.on("error", () => {});
    await redis.connect();
  } catch { redis = null; }
  if (!redis) return res.status(503).json({ error: "The leaderboard is not available right now." });
  try {
    if (req.method === "POST") {
      const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const name = String(b.name || "").replace(/[^\w \-'.]/g, "").trim().slice(0, 16) || "Someone";
      const ms = Math.round(Number(b.ms));
      if (!(ms >= 8000 && ms <= 900000)) return res.status(400).json({ error: "That time does not look right." });
      await redis.zAdd("race:times", { score: ms, value: `${name}|${Date.now()}` });
      await redis.zRemRangeByRank("race:times", 200, -1); // keep the store small
    } else if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    const rows = await redis.zRangeWithScores("race:times", 0, 9);
    return res.status(200).json({ top: rows.map((r) => ({ name: String(r.value).split("|")[0], ms: r.score })) });
  } catch {
    return res.status(500).json({ error: "The leaderboard hiccuped." });
  } finally {
    try { await redis.quit(); } catch { /* ignore */ }
  }
}
