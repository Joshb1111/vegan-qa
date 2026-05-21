// POST /api/convai-llm
// OpenAI-compatible chat-completions endpoint that ElevenLabs Conversational AI calls.
// Internally translates to Anthropic so the voice bot uses the same SYSTEM_PROMPT as /api/ask.
//
// Configure in ElevenLabs agent dashboard:
//   Custom LLM URL:  https://<your-domain>/api/convai-llm
//   API key:         <CONVAI_LLM_SHARED_SECRET>  (any random string; we verify it below)
//   Model:           ignored on our side, but set something like "claude-via-bridge"
//
// We strip out the JSON-mode wrapper used by /api/ask — voice answers should be plain prose,
// short (2-4 sentences max), and conversational.

import { SYSTEM_PROMPT } from "./_prompt.js";

const VOICE_SYSTEM_ADDENDUM = `
You are now answering in VOICE conversational mode. Critical formatting rules:
- Respond in plain prose only. Do NOT use JSON, markdown, lists, or code blocks.
- Keep answers SHORT: 2-4 sentences. The user can ask follow-ups.
- Speak naturally, as if in conversation. Avoid headings and bullet structure.
- Do not include citations, URLs, or footnotes — they cannot be spoken.
- If a question needs a long answer, give the core point in 2 sentences and offer to elaborate.
`.trim();

function verifyAuth(req) {
  const expected = process.env.CONVAI_LLM_SHARED_SECRET;
  if (!expected) return false;
  const header = req.headers.authorization || "";
  return header === `Bearer ${expected}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAuth(req)) return res.status(401).json({ error: "Unauthorized" });

  const { messages = [], stream = false } = req.body || {};

  // ElevenLabs sends OpenAI-format messages: [{role: "system"|"user"|"assistant", content: "..."}]
  // We use our own SYSTEM_PROMPT (with the voice addendum) and pass the conversational turns to Anthropic.
  const conversation = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" }));

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT + "\n\n" + VOICE_SYSTEM_ADDENDUM,
            cache_control: { type: "ephemeral" }, // prompt cache the big system block
          },
        ],
        messages: conversation,
        stream,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText);
      return res.status(502).json({ error: { message: "Upstream LLM error" } });
    }

    if (stream) {
      // Pipe Anthropic SSE → OpenAI SSE format that ElevenLabs expects
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const reader = anthropicRes.body.getReader();
      const decoder = new TextDecoder();
      const id = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      let buffer = "";

      const writeChunk = (delta, finish = null) => {
        const payload = {
          id, object: "chat.completion.chunk", created, model: "claude-via-bridge",
          choices: [{ index: 0, delta, finish_reason: finish }],
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      writeChunk({ role: "assistant", content: "" });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
              writeChunk({ content: evt.delta.text });
            }
          } catch {}
        }
      }
      writeChunk({}, "stop");
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // Non-streaming path
    const data = await anthropicRes.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";

    return res.status(200).json({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "claude-via-bridge",
      choices: [{
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: data.usage?.input_tokens || 0,
        completion_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: { message: "Bridge error" } });
  }
}
