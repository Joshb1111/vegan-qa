// Admin endpoint to inspect and delete cached answers.
// Cached answers live in Redis under keys like  short:<question>  /  long:<question>
// (lowercased + trimmed). They're created by /api/ask and expire after 30 days.
//
// Auth: pass ?key=<ADMIN_KEY> matching env var ADMIN_KEY.
//
// GET  /api/admin-cache?key=...                       → list all cached question keys
// GET  /api/admin-cache?key=...&q=is+veganism+about+suffering?
//        → show the cached answer for both modes
// DELETE /api/admin-cache?key=...&q=...               → delete both modes for that question
// DELETE /api/admin-cache?key=...&q=...&mode=long     → delete just one mode
// DELETE /api/admin-cache?key=...&all=1               → nuke ALL cached answers (use with care)

const ADMIN_KEY = process.env.ADMIN_KEY;

function normalize(q) {
  return (q || "").toLowerCase().trim();
}

export default async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const key = url.searchParams.get("key");
  if (!ADMIN_KEY || key !== ADMIN_KEY) return res.status(401).json({ error: "Unauthorized" });

  const question = url.searchParams.get("q");
  const mode = url.searchParams.get("mode"); // optional
  const all = url.searchParams.get("all") === "1";

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();

    if (req.method === "GET") {
      if (question) {
        const norm = normalize(question);
        const [shortAns, longAns] = await Promise.all([
          redis.get(`short:${norm}`),
          redis.get(`long:${norm}`),
        ]);
        return res.status(200).json({
          question: norm,
          short: shortAns ? JSON.parse(shortAns) : null,
          long: longAns ? JSON.parse(longAns) : null,
        });
      }

      // List all question cache keys (scan, not KEYS, to avoid blocking)
      const found = [];
      for await (const k of redis.scanIterator({ MATCH: "short:*", COUNT: 200 })) found.push(k);
      for await (const k of redis.scanIterator({ MATCH: "long:*", COUNT: 200 })) found.push(k);
      return res.status(200).json({ count: found.length, keys: found.sort() });
    }

    if (req.method === "DELETE") {
      if (all) {
        let deleted = 0;
        for (const prefix of ["short:", "long:"]) {
          for await (const k of redis.scanIterator({ MATCH: `${prefix}*`, COUNT: 200 })) {
            await redis.del(k);
            deleted++;
          }
        }
        return res.status(200).json({ deleted });
      }

      if (!question) return res.status(400).json({ error: "Pass ?q=<question> or ?all=1" });
      const norm = normalize(question);
      const targets = mode ? [`${mode}:${norm}`] : [`short:${norm}`, `long:${norm}`];
      const results = await Promise.all(targets.map(k => redis.del(k)));
      return res.status(200).json({
        question: norm,
        deletedKeys: targets.filter((_, i) => results[i] > 0),
      });
    }

    return res.status(405).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Cache admin failed" });
  } finally {
    try { await redis?.disconnect(); } catch {}
  }
}
