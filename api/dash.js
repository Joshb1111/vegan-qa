// The multiplayer race (Downhill Dash): a lobby of up to five, a shared start time, and everyone's progress.
// One Redis hash per race, dash:r:<rid>: field "meta" = {startAt}, fields "p:<player id>" = {n, k, t, prog, fin, j}.
// dash:open names the race that is still taking players.
// POST {a:'join', id, n, k}            -> joins the open race (or opens a new one, starting 30 s after the first player)
// POST {a:'go', id, rid}               -> a player in the lobby starts it now (4 s countdown)
// POST {a:'tick', id, rid, prog, fin}  -> reports progress (metres) and the finish time (ms), gets everyone back
// POST {a:'leave', id, rid}
// every reply: {now, rid, startAt, players:[{id, n, k, prog, fin, j}]}
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
const MAXP = 5, WAIT = 30000, QUICK = 4000, TTL = 900;
const rkey = (rid) => "dash:r:" + rid;
function view(rid, h, now) {
  let meta = null; try { meta = JSON.parse(h.meta || "null"); } catch { /* none */ }
  const players = [];
  for (const [f, raw] of Object.entries(h)) {
    if (!f.startsWith("p:")) continue;
    let p = null; try { p = JSON.parse(raw); } catch { continue; }
    if (!p) continue;
    const started = meta && now >= meta.startAt;
    if (!p.fin && now - p.t > (started ? 20000 : 9000)) continue; // dropped out
    players.push({ id: f.slice(2), n: p.n, k: p.k, prog: p.prog || 0, fin: p.fin || 0, j: p.j || 0 });
  }
  players.sort((a, b) => a.j - b.j || (a.id < b.id ? -1 : 1));
  return { now, rid, startAt: meta ? meta.startAt : 0, players };
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  let b;
  try { b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch { return res.status(400).json({ error: "Bad request" }); }
  const id = String(b.id || ""), a = String(b.a || "");
  if (!/^[a-z0-9]{8,20}$/.test(id)) return res.status(400).json({ error: "Bad id" });
  const n = String(b.n || "").replace(/[^\w \-'.]/g, "").trim().slice(0, 16);
  const k = String(b.k || "").replace(/[^0-9.]/g, "").slice(0, 16);
  let redis;
  try { redis = await getRedis(); } catch { return res.status(503).json({ error: "The race is not available right now." }); }
  try {
    const now = Date.now();
    if (a === "join") {
      let rid = await redis.get("dash:open"), h = rid ? await redis.hGetAll(rkey(rid)) : null, ok = false;
      if (h && h.meta) { const v = view(rid, h, now); ok = now < v.startAt - 2500 && (v.players.length < MAXP || v.players.some((p) => p.id === id)); }
      if (!ok) { rid = Math.random().toString(36).slice(2, 10); await redis.hSet(rkey(rid), "meta", JSON.stringify({ startAt: now + WAIT })); await redis.set("dash:open", rid, { EX: 120 }); }
      const old = h && ok && h["p:" + id] ? JSON.parse(h["p:" + id]) : null;
      await redis.hSet(rkey(rid), "p:" + id, JSON.stringify({ n, k, t: now, prog: 0, fin: 0, j: old ? old.j : now }));
      await redis.expire(rkey(rid), TTL);
      const v = view(rid, await redis.hGetAll(rkey(rid)), now);
      if (v.players.length >= MAXP && v.startAt - now > QUICK + 1000) { v.startAt = now + QUICK + 1000; await redis.hSet(rkey(rid), "meta", JSON.stringify({ startAt: v.startAt })); }
      return res.status(200).json(v);
    }
    const rid = String(b.rid || "");
    if (!/^[a-z0-9]{4,12}$/.test(rid)) return res.status(400).json({ error: "Bad race" });
    const h = await redis.hGetAll(rkey(rid));
    if (!h || !h.meta) return res.status(404).json({ error: "That race is over." });
    if (a === "leave") { await redis.hDel(rkey(rid), "p:" + id); return res.status(200).json(view(rid, {}, now)); }
    let me = null; try { me = JSON.parse(h["p:" + id] || "null"); } catch { /* none */ }
    if (!me) return res.status(404).json({ error: "You are not in that race." });
    if (a === "go") { const meta = JSON.parse(h.meta); if (meta.startAt - now > QUICK) { meta.startAt = now + QUICK; h.meta = JSON.stringify(meta); await redis.hSet(rkey(rid), "meta", h.meta); } }
    me.t = now;
    const prog = Number(b.prog); if (Number.isFinite(prog)) me.prog = Math.max(0, Math.min(2000, Math.round(prog)));
    const fin = Math.round(Number(b.fin)); if (!me.fin && fin >= 5000 && fin <= 900000) me.fin = fin;
    h["p:" + id] = JSON.stringify(me);
    await redis.hSet(rkey(rid), "p:" + id, h["p:" + id]);
    return res.status(200).json(view(rid, h, now));
  } catch {
    client = null;
    return res.status(500).json({ error: "The race hiccuped." });
  }
}
