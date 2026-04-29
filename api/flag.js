export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { question, answer } = req.body;
  if (!question) return res.status(400).json({ error: "Missing question" });

  if (process.env.DISCORD_WEBHOOK_URL) {
    try {
      await fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "⚑ FLAGGED FOR REVIEW",
            description: `**Question:** ${question}\n\n**Answer:** ${(answer || "").slice(0, 1500)}`,
            color: 0xff6b35,
          }],
        }),
      });
    } catch {}
  }

  return res.status(200).json({ ok: true });
}
