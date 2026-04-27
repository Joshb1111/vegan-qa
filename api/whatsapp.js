import { SYSTEM_PROMPT } from "./_prompt.js";

const WELCOME_MESSAGE =
  "Welcome to Vegan Q&A — a bot grounded in the work of abolitionist vegan thinkers and the original vegan ethical framework. Ask me anything about veganism, animal use, common arguments, or the history of the movement. Just type your question and I'll answer it.";

const GREETINGS = new Set(["hi", "hello", "hey", "start", "help", "hiya", "yo", "sup"]);

async function sendWhatsAppMessage(phoneNumberId, to, text) {
  await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

async function getClaudeReply(query) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      system: SYSTEM_PROMPT + "\n\nKeep the answer concise — 2-4 short paragraphs. Plain text only, no markdown.",
      messages: [{ role: "user", content: query }],
    }),
  });

  const data = await response.json();
  const text = data.content?.find((b) => b.type === "text")?.text || "";
  const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
  return `${parsed.answer}\n\n_${parsed.key}_`;
}

export default async function handler(req, res) {
  // Webhook verification (Meta sends a GET when you first set up the webhook)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  }

  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const body = req.body;

  // Ignore status updates (delivery receipts, read receipts)
  if (!body?.entry?.[0]?.changes?.[0]?.value?.messages) {
    return res.status(200).send("OK");
  }

  const value = body.entry[0].changes[0].value;
  const message = value.messages[0];
  const phoneNumberId = value.metadata.phone_number_id;
  const from = message.from;

  // Only handle text messages
  if (message.type !== "text") {
    await sendWhatsAppMessage(
      phoneNumberId,
      from,
      "Please send a text question and I'll answer it."
    );
    return res.status(200).send("OK");
  }

  const query = message.text.body.trim();

  if (GREETINGS.has(query.toLowerCase())) {
    await sendWhatsAppMessage(phoneNumberId, from, WELCOME_MESSAGE);
    return res.status(200).send("OK");
  }

  try {
    const reply = await getClaudeReply(query);
    await sendWhatsAppMessage(phoneNumberId, from, reply);

    if (process.env.DISCORD_WEBHOOK_URL) {
      fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: query,
            description: reply.split("\n\n_")[0].slice(0, 2000),
            color: 0x25d366,
            footer: { text: "via WhatsApp" },
          }],
        }),
      }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    await sendWhatsAppMessage(
      phoneNumberId,
      from,
      "Sorry, something went wrong. Please try again."
    );
  }

  return res.status(200).send("OK");
}
