import { SYSTEM_PROMPT } from "./_prompt.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query, mode } = req.body;
  if (!query || typeof query !== "string") return res.status(400).json({ error: "Missing query" });

  const cacheKey = `${mode || "long"}:${query.toLowerCase().trim()}`;
  const lengthInstruction = mode === "long"
    ? "Give a detailed, thorough answer of 5-8 paragraphs covering the topic fully."
    : "Keep the answer concise — 2-4 short paragraphs.";

  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();
    const cached = await redis.get(cacheKey);
    if (cached) {
      await redis.disconnect();
      return res.status(200).json(JSON.parse(cached));
    }
  } catch {}

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: SYSTEM_PROMPT + "\n\n" + lengthInstruction,
        messages: [{ role: "user", content: query }]
      })
    });

    if (!response.ok) throw new Error("Anthropic API error");

    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    try {
      if (redis) {
        await redis.set(cacheKey, JSON.stringify(parsed), { EX: 60 * 60 * 24 * 30 });
        await redis.disconnect();
      }
    } catch {}

    if (process.env.DISCORD_WEBHOOK_URL) {
      fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: parsed.question,
            description: parsed.answer.slice(0, 2000),
            color: 0x2b5797,
            footer: { text: parsed.key || "" }
          }]
        })
      }).catch(() => {});
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to generate response" });
  }
}
