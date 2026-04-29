import { SYSTEM_PROMPT } from "./_prompt.js";

const MAX_HISTORY = 10; // 5 exchanges
const HISTORY_TTL = 60 * 60; // 1 hour

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query, mode, sessionId } = req.body;
  if (!query || typeof query !== "string") return res.status(400).json({ error: "Missing query" });

  const lengthInstruction = mode === "long"
    ? "Give a detailed, thorough answer of 5-8 paragraphs covering the topic fully."
    : "Keep the answer concise — 2-4 short paragraphs.";

  // Connect Redis
  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on("error", () => {});
    await redis.connect();
  } catch {}

  // Load conversation history for this session
  const historyKey = sessionId ? `conv:web:${sessionId}` : null;
  let history = [];
  if (redis && historyKey) {
    try {
      const data = await redis.get(historyKey);
      if (data) history = JSON.parse(data);
    } catch {}
  }

  const hasHistory = history.length > 0;

  // Use answer cache only for standalone questions (no prior conversation)
  const cacheKey = `${mode || "long"}:${query.toLowerCase().trim()}`;
  if (!hasHistory && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        await redis.disconnect();
        return res.status(200).json(JSON.parse(cached));
      }
    } catch {}
  }

  try {
    const messages = [...history, { role: "user", content: query }];

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
        messages
      })
    });

    if (!response.ok) throw new Error("Anthropic API error");

    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    // Save updated conversation history
    if (redis && historyKey) {
      try {
        const updated = [...history, { role: "user", content: query }, { role: "assistant", content: parsed.answer }];
        await redis.set(historyKey, JSON.stringify(updated.slice(-MAX_HISTORY)), { EX: HISTORY_TTL });
      } catch {}
    }

    // Cache standalone answers only
    if (!hasHistory && redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(parsed), { EX: 60 * 60 * 24 * 30 });
      } catch {}
    }

    try { if (redis) await redis.disconnect(); } catch {}

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
    try { if (redis) await redis.disconnect(); } catch {}
    return res.status(500).json({ error: "Failed to generate response" });
  }
}
