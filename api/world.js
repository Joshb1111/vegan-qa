// Who else is on the planet. Each player posts where they are about twice a second and gets everyone else back.
// One Redis hash, world:p, field = player id, value = JSON {t, s, n, k}. Entries older than 12 s are dropped.
// POST { id, s: [ux,uy,uz, fx,fy,fz, v, mode], n: name, k: look } -> { now, players: [{ id, t, s, n, k }] }
let client = null, connecting = null;
async function getRedis() {
  if (client && client.isOpen) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const { createClient } = await import("redis");
    const c = createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3000, reconnectStrategy: false } });
    c.on("error", () => {});
    c.on("end", () => { if (client === c) client = null; });
    await c.connect();
    client = c;
    return c;
  })();
  try { return await connecting; } finally { connecting = null; }
}
const KEY = "world:p", STALE = 12000, MAX = 40;
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let b;
  try { b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch { return res.status(400).json({ error: "Bad request" }); }
  const id = String(b.id || "");
  if (!/^[a-z0-9]{8,20}$/.test(id)) return res.status(400).json({ error: "Bad id" });
  const s = Array.isArray(b.s) ? b.s.slice(0, 8).map((x) => Math.round(Number(x) * 10000) / 10000) : null;
  if (!s || s.length < 8 || s.some((x) => !Number.isFinite(x))) return res.status(400).json({ error: "Bad state" });
  const n = String(b.n || "").replace(/[^\w \-'.]/g, "").trim().slice(0, 16);
  const k = String(b.k || "").replace(/[^0-9a-z.,:-]/gi, "").slice(0, 40);
  let redis;
  try { redis = await getRedis(); } catch { return res.status(503).json({ error: "The world is not available right now." }); }
  try {
    const now = Date.now();
    if (b.bye) { await redis.hDel(KEY, id); return res.status(200).json({ now, players: [] }); }
    const [, all] = await Promise.all([redis.hSet(KEY, id, JSON.stringify({ t: now, s, n, k })), redis.hGetAll(KEY)]);
    const players = [], dead = [];
    for (const [pid, raw] of Object.entries(all || {})) {
      if (pid === id) continue;
      let p = null; try { p = JSON.parse(raw); } catch { /* drop it */ }
      if (!p || now - p.t > STALE) { dead.push(pid); continue; }
      players.push({ id: pid, t: p.t, s: p.s, n: p.n, k: p.k });
    }
    if (dead.length) redis.hDel(KEY, dead).catch(() => {});
    players.sort((x, y) => y.t - x.t);
    return res.status(200).json({ now, players: players.slice(0, MAX) });
  } catch {
    client = null;
    return res.status(500).json({ error: "The world hiccuped." });
  }
}
