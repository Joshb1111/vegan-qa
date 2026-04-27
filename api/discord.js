import { InteractionType, InteractionResponseType } from "discord-interactions";
import { webcrypto } from "node:crypto";
import { SYSTEM_PROMPT } from "./_prompt.js";

export const config = { api: { bodyParser: false } };

async function verifySignature(publicKey, signature, timestamp, body) {
  try {
    const key = await webcrypto.subtle.importKey(
      "raw",
      Buffer.from(publicKey, "hex"),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await webcrypto.subtle.verify(
      { name: "Ed25519" },
      key,
      Buffer.from(signature, "hex"),
      Buffer.from(timestamp + body)
    );
  } catch {
    return false;
  }
}

async function askClaude(query, mode) {
  const lengthInstruction = mode === "short"
    ? "Keep the answer concise — 2-4 short paragraphs."
    : "Give a detailed, thorough answer of 5-8 paragraphs covering the topic fully.";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SYSTEM_PROMPT + "\n\n" + lengthInstruction,
      messages: [{ role: "user", content: query }],
    }),
  });

  const data = await response.json();
  const text = data.content?.find(b => b.type === "text")?.text || "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const rawBody = await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

  const signature = req.headers["x-signature-ed25519"];
  const timestamp = req.headers["x-signature-timestamp"];

  const valid = await verifySignature(
    process.env.DISCORD_PUBLIC_KEY,
    signature,
    timestamp,
    rawBody
  );
  if (!valid) return res.status(401).json({ error: "Invalid signature" });

  const body = JSON.parse(rawBody);

  // Discord PING
  if (body.type === InteractionType.PING) {
    return res.json({ type: InteractionResponseType.PONG });
  }

  // Slash command
  if (body.type === InteractionType.APPLICATION_COMMAND) {
    const query = body.data.options?.find(o => o.name === "question")?.value || "";
    const mode = body.data.options?.find(o => o.name === "mode")?.value || "long";
    const { token, application_id } = body;

    // Acknowledge immediately — Discord requires a response within 3 seconds
    res.json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

    const followupUrl = `https://discord.com/api/v10/webhooks/${application_id}/${token}/messages/@original`;

    try {
      const parsed = await askClaude(query, mode);

      await fetch(followupUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: parsed.question,
            description: parsed.answer.slice(0, 4000),
            color: 0x1a3a5c,
            footer: { text: parsed.key || "" },
          }],
        }),
      });
    } catch {
      await fetch(followupUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Something went wrong. Please try again." }),
      });
    }
  }
}
