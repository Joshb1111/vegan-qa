import { SYSTEM_PROMPT } from "./_prompt.js";
import { createHash } from "crypto";

// The answer cache is namespaced by a fingerprint of the system prompt. Any edit to the prompt
// changes this hash, so every previously cached answer is automatically bypassed (the old keys
// are never read again and simply expire) and fresh answers are cached under the new version.
// This means a rules/prompt change self-invalidates the cache — no manual flush is ever needed.
const PROMPT_VERSION = createHash("sha1").update(SYSTEM_PROMPT).digest("hex").slice(0, 10);

const MAX_HISTORY = 10; // 5 exchanges
const HISTORY_TTL = 60 * 60; // 1 hour
const DAILY_IMAGE_LIMIT = 5; // image uploads per user per day
const DAILY_QUESTION_LIMIT = 30; // API-answered questions per IP per day (cached answers are free and uncounted)
const BURST_LIMIT = 8; // max questions per BURST_WINDOW seconds — stops scripted floods
const BURST_WINDOW = 60; // seconds

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query, mode, sessionId, image } = req.body;
  if (!query || typeof query !== "string") return res.status(400).json({ error: "Missing query" });
  if (image && typeof image !== "string") return res.status(400).json({ error: "Invalid image" });

  const lengthInstruction = mode === "long"
    ? "Give a detailed, thorough answer of 5-8 paragraphs covering the topic fully."
    : "Keep the answer concise — 2-4 short paragraphs.";

  // Connect Redis — fail fast so a slow/unreachable Redis on a cold start never
  // hangs the request. If it can't connect quickly we just proceed without it.
  let redis;
  try {
    const { createClient } = await import("redis");
    redis = createClient({
      url: process.env.REDIS_URL,
      socket: { connectTimeout: 3000, reconnectStrategy: false },
    });
    redis.on("error", () => {});
    await redis.connect();
  } catch { redis = null; }

  // Conversational memory is intentionally DISABLED. Every question is answered standalone,
  // with no prior turns sent to the model. This closes the multi-turn attack where an
  // interlocutor incrementally pressures the bot across a conversation into conceding a stance
  // (e.g. that "end animal use" is insufficient) that it would never agree to on its own.
  const history = [];
  const hasHistory = false;

  // Daily image-upload limit — one per user per day, enforced best-effort by IP
  const clientIp = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || req.socket?.remoteAddress || "unknown";
  const dayStr = new Date().toISOString().slice(0, 10);
  const imgLimitKey = `imglimit:${clientIp}:${dayStr}`;
  if (image && redis) {
    try {
      const used = parseInt(await redis.get(imgLimitKey) || "0", 10);
      if (used >= DAILY_IMAGE_LIMIT) {
        await redis.disconnect();
        return res.status(429).json({ error: `You can upload up to ${DAILY_IMAGE_LIMIT} images per day. Please try again tomorrow.` });
      }
    } catch {}
  }

  // Use answer cache only for standalone questions (no prior conversation, no image)
  const cacheKey = `${PROMPT_VERSION}:${mode || "long"}:${query.toLowerCase().trim()}`;
  if (!hasHistory && !image && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        await redis.disconnect();
        return res.status(200).json(JSON.parse(cached));
      }
    } catch {}
  }

  // Rate limit — only reached on a cache MISS, i.e. a question that will actually hit the
  // (paid) API. Cached answers above are always served free and never counted. Enforced
  // best-effort by IP: a generous daily cap plus a short burst window that stops scripts.
  const qDayKey = `qday:${clientIp}:${dayStr}`;
  const qBurstKey = `qburst:${clientIp}`;
  if (redis) {
    try {
      // Daily cap: read-only check here; the counter is only bumped after a successful
      // answer (below), so failed calls never burn a user's quota.
      const dayCount = parseInt(await redis.get(qDayKey) || "0", 10);
      if (dayCount >= DAILY_QUESTION_LIMIT) {
        await redis.disconnect();
        return res.status(429).json({ error: `You've reached the daily limit of ${DAILY_QUESTION_LIMIT} questions. Please come back tomorrow — and thanks for your curiosity.` });
      }
      // Burst cap: increment-then-check so it's atomic and concurrent floods can't race past
      // the check. Counts attempts within the short window, which is exactly what stops scripts.
      const burstCount = await redis.incr(qBurstKey);
      if (burstCount === 1) await redis.expire(qBurstKey, BURST_WINDOW);
      if (burstCount > BURST_LIMIT) {
        await redis.disconnect();
        return res.status(429).json({ error: "You're asking very quickly — give it a few seconds and try again." });
      }
    } catch {}
  }

  try {
    // Build the user turn — attach the image as a vision block when present
    let userContent = query;
    if (image) {
      const m = /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,(.+)$/i.exec(image);
      if (m) {
        const mediaType = m[1].toLowerCase() === "image/jpg" ? "image/jpeg" : m[1].toLowerCase();
        userContent = [
          { type: "image", source: { type: "base64", media_type: mediaType, data: m[2] } },
          { type: "text", text: query },
        ];
      }
    }
    const messages = [...history, { role: "user", content: userContent }];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: mode === "long" ? 2600 : 1000,
        // The large, static system prompt is marked for prompt caching so repeat calls read it
        // at a fraction of the input cost. The short length instruction varies (short/long) and
        // stays as a separate, uncached block after the cached prefix.
        system: [
          { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
          { type: "text", text: lengthInstruction },
        ],
        messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText.slice(0, 500));
      throw new Error("Anthropic API error");
    }

    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json\n?|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = null;
    }
    // Malformed or truncated JSON (e.g. the model hit the token limit mid-object): pull the
    // "answer" field out with a tolerant regex so we NEVER leak the raw
    // {"question":...,"answer":"..." scaffold into the user-facing answer.
    if (!parsed || typeof parsed.answer !== "string") {
      console.error("JSON not clean, extracting answer field. Preview:", clean.slice(0, 200));
      const unescape = (s) => s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      const am = clean.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)/);
      const qm = clean.match(/"question"\s*:\s*"((?:\\.|[^"\\])*)"/);
      const km = clean.match(/"key"\s*:\s*"((?:\\.|[^"\\])*)"/);
      parsed = {
        question: qm ? unescape(qm[1]) : query,
        answer: am ? unescape(am[1]).replace(/"\s*[,}\]]*\s*$/, "").trim() : clean.trim(),
        key: km ? unescape(km[1]) : "",
      };
    }

    // Normalise any literal "\n" escape sequences the model may emit into real newlines, so
    // answers render as paragraphs (the UI uses white-space: pre-line) instead of showing a
    // stray "\n\n" in the text.
    if (typeof parsed.answer === "string") parsed.answer = parsed.answer.replace(/\\r\\n|\\n/g, "\n");
    if (typeof parsed.key === "string") parsed.key = parsed.key.replace(/\\r\\n|\\n/g, "\n");

    // Conversational memory disabled — nothing is persisted per session (see note above).

    // Cache standalone answers only (never image-based ones)
    if (!hasHistory && !image && redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(parsed), { EX: 60 * 60 * 24 * 30 });
      } catch {}
    }

    // Count this question against the DAILY cap — only now, after a successful API answer, so
    // failed calls and cache hits never consume a user's daily quota. (The burst counter was
    // already bumped atomically before the call.)
    if (redis) {
      try {
        const dn = await redis.incr(qDayKey);
        if (dn === 1) await redis.expire(qDayKey, 60 * 60 * 24);
      } catch {}
    }

    // Record the daily image use only after a successful answer
    if (image && redis) {
      try {
        const n = await redis.incr(imgLimitKey);
        if (n === 1) await redis.expire(imgLimitKey, 60 * 60 * 24);
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
