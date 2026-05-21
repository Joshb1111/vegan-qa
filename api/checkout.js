// POST /api/checkout
// Body: { pack: "p3" | "p10" | "p25", existingUserId?: string }
// Returns: { url } — redirect the browser to this Stripe Checkout URL.

const PACKS = {
  p3:  { priceId: process.env.STRIPE_PRICE_3,  credits: 5,  label: "5 sessions" },
  p10: { priceId: process.env.STRIPE_PRICE_10, credits: 20, label: "20 sessions" },
  p25: { priceId: process.env.STRIPE_PRICE_25, credits: 60, label: "60 sessions" },
};

function getUserId(req) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)uid=([^;]+)/);
  return m ? m[1] : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { pack } = req.body || {};
  const config = PACKS[pack];
  if (!config) return res.status(400).json({ error: "Invalid pack" });

  const existingUserId = getUserId(req);
  const origin = req.headers.origin || `https://${req.headers.host}`;

  try {
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("line_items[0][price]", config.priceId);
    params.append("line_items[0][quantity]", "1");
    params.append("success_url", `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    params.append("cancel_url", `${origin}/?checkout=cancel`);
    params.append("metadata[credits]", String(config.credits));
    params.append("metadata[pack]", pack);
    if (existingUserId) params.append("metadata[existingUserId]", existingUserId);
    // Collect email so we can do account-restore later
    params.append("customer_creation", "always");

    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error("Stripe checkout error:", err);
      return res.status(502).json({ error: "Payment service unavailable" });
    }

    const session = await r.json();
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Checkout failed" });
  }
}
