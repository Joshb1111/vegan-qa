// Two-step account-restore flow for users who cleared cookies.
//
// POST /api/account-restore         { email }               → emails them a one-time link
// GET  /api/account-restore?t=...                           → verifies token, sets uid cookie, redirects to /

import crypto from "node:crypto";

const TOKEN_TTL = 15 * 60; // 15 minutes
const RATE_LIMIT = 5;       // requests per email per hour
const RATE_TTL = 3600;

async function sendEmail(to, link) {
  // Bring-your-own-provider. Resend is cheapest for low volume:
  if (!process.env.RESEND_API_KEY) {
    console.log("DEV: would email", to, "with link", link);
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "no-reply@yourdomain.org",
      to,
      subject: "Restore your account",
      text: `Click to restore your conversation credits:\n\n${link}\n\nThis link expires in 15 minutes. If you did not request this, ignore this email.`,
    }),
  });
}

export default async function handler(req, res) {
  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();

    if (req.method === "POST") {
      const { email } = req.body || {};
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Valid email required" });
      }
      const e = email.toLowerCase();

      // Rate limit per email
      const rateKey = `restore_rate:${e}`;
      const attempts = await redis.incr(rateKey);
      if (attempts === 1) await redis.expire(rateKey, RATE_TTL);
      if (attempts > RATE_LIMIT) {
        return res.status(429).json({ error: "Too many attempts. Try again in an hour." });
      }

      const userId = await redis.get(`email:${e}`);
      // Always return success to avoid leaking which emails exist
      if (userId) {
        const token = crypto.randomBytes(32).toString("hex");
        await redis.set(`restore_token:${token}`, userId, { EX: TOKEN_TTL });
        const origin = req.headers.origin || `https://${req.headers.host}`;
        const link = `${origin}/api/account-restore?t=${token}`;
        await sendEmail(e, link);
      }
      return res.status(200).json({ ok: true, message: "If that email has an account, a link has been sent." });
    }

    if (req.method === "GET") {
      const token = req.query?.t || new URL(req.url, "http://x").searchParams.get("t");
      if (!token) return res.status(400).send("Missing token");

      const userId = await redis.get(`restore_token:${token}`);
      if (!userId) return res.status(400).send("Invalid or expired link");

      // One-shot
      await redis.del(`restore_token:${token}`);

      res.setHeader("Set-Cookie", `uid=${userId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`);
      res.setHeader("Location", "/?restored=1");
      return res.status(302).end();
    }

    return res.status(405).end();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Restore failed" });
  } finally {
    try { await redis?.disconnect(); } catch {}
  }
}
