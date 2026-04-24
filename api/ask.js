import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);
const CACHE_TTL = 60 * 60 * 24 * 30;

function cacheKey(query, mode) {
  return `${mode}:${query.toLowerCase().trim()}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { query, mode } = req.body;
  if (!query || typeof query !== "string") return res.status(400).json({ error: "Missing query" });

  const key = cacheKey(query, mode);
  try {
    const cached = await redis.get(key);
    if (cached) return res.status(200).json(JSON.parse(cached));
  } catch {}

  const lengthInstruction = mode === "long"
    ? "Give a detailed, thorough answer of 5-8 paragraphs covering the topic fully."
    : "Keep the answer concise — 2-4 short paragraphs.";

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
      await redis.set(key, JSON.stringify(parsed), "EX", CACHE_TTL);
    } catch {}
    res.status(200).json(parsed);
  } catch {
    res.status(500).json({ error: "Failed to generate response" });
  }
}
