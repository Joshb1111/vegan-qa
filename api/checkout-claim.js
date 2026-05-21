// GET /api/checkout-claim?session_id=cs_...
// Called by the success page after Stripe redirects back.
// Sets the uid httpOnly cookie so the user is now "signed in" for future requests.

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const sessionId = req.query?.session_id || new URL(req.url, "http://x").searchParams.get("session_id");
  if (!sessionId) return res.status(400).json({ error: "Missing session_id" });

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();

    const userId = await redis.get(`checkout_claim:${sessionId}`);
    if (!userId) return res.status(404).json({ error: "Unknown or expired session" });

    // One-shot — clear the claim so a leaked session_id can't be reused
    await redis.del(`checkout_claim:${sessionId}`);

    const balance = parseInt((await redis.get(`credits:${userId}`)) || "0", 10);

    // 1 year cookie, httpOnly, SameSite=Lax so the redirect flow works
    res.setHeader("Set-Cookie", `uid=${userId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`);
    return res.status(200).json({ ok: true, creditsRemaining: balance });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Claim failed" });
  } finally {
    try { await redis?.disconnect(); } catch {}
  }
}
