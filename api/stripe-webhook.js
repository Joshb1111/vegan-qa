// POST /api/stripe-webhook
// Handles checkout.session.completed → creates/updates user, grants credits, sets uid cookie via redirect-side handoff.
// Idempotent: processing the same event twice does not double-grant credits.

import crypto from "node:crypto";

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function verifyStripeSignature(raw, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));
  if (!parts.t || !parts.v1) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parts.t}.${raw}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const raw = await readRawBody(req);
  const sig = req.headers["stripe-signature"];
  if (!verifyStripeSignature(raw, sig, process.env.STRIPE_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).end(); }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const credits = parseInt(session.metadata?.credits || "0", 10);
  const existingUserId = session.metadata?.existingUserId;
  const email = session.customer_details?.email || session.customer_email;
  const stripeCustomerId = session.customer;

  if (credits <= 0) return res.status(400).json({ error: "Missing credits metadata" });

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();

    // Idempotency — only grant once per Stripe event
    const processedKey = `stripe_event:${event.id}`;
    const alreadyProcessed = await redis.set(processedKey, "1", { NX: true, EX: 86400 * 30 });
    if (!alreadyProcessed) return res.status(200).json({ received: true, duplicate: true });

    // Resolve user: existing cookie user wins, else look up by stripe customer, else create
    let userId = existingUserId;
    if (!userId && stripeCustomerId) {
      userId = await redis.get(`stripe_customer:${stripeCustomerId}`);
    }
    if (!userId && email) {
      userId = await redis.get(`email:${email.toLowerCase()}`);
    }
    if (!userId) userId = crypto.randomUUID();

    // Persist mappings
    await redis.set(`user:${userId}`, JSON.stringify({
      email: email?.toLowerCase(),
      stripeCustomerId,
      createdAt: Date.now(),
    }));
    if (email) await redis.set(`email:${email.toLowerCase()}`, userId);
    if (stripeCustomerId) await redis.set(`stripe_customer:${stripeCustomerId}`, userId);

    // Grant credits
    await redis.incrBy(`credits:${userId}`, credits);

    // Store userId on the checkout session so the success-page can claim the cookie
    await redis.set(`checkout_claim:${session.id}`, userId, { EX: 3600 });

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  } finally {
    try { await redis?.disconnect(); } catch {}
  }
}
