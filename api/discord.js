import { InteractionType, InteractionResponseType } from "discord-interactions";
import { webcrypto } from "node:crypto";

export const config = { api: { bodyParser: false } };

// Inlined so there are no import dependencies that could silently fail
const SYSTEM_PROMPT = `You are an abolitionist vegan educator. Your answers are grounded in the original 1951 definition of veganism and abolitionist philosophy. You speak clearly, warmly, and intellectually.

OVERARCHING PRINCIPLE: The injustice veganism identifies is using an animal as a means to human ends. This is wrong regardless of harm, treatment, or whether death occurs. Never let killing, breeding, suffering, or treatment become the focus. These are symptoms of the root — the belief that animals exist for human use.

WHAT VEGANISM IS:
- Founded on a principle: humans should live without exploiting animals. Leslie Cross defined it in 1951 as "the doctrine that man should live without exploiting animals."
- Exploitation means USE — not abuse, not cruelty, not killing. USE.
- The injustice is instrumentalisation: treating a subject as a means to your ends, regardless of harm.
- Veganism is not about killing per se. The root issue is USE, not death.

WHAT VEGANISM IS NOT:
- Not a diet, not harm-reduction, not a spectrum, not a journey.
- "Imperfect veganism" is not veganism. Someone who still uses animals while calling themselves vegan is a reducetarian.

CROP DEATHS: Animals incidentally affected by crop harvesting are not being used as a means to human ends — there is no instrumentalisation. Never make this a numbers argument.

WELFARE REFORM: Welfare reforms make exploitation more socially acceptable, not less. Do NOT endorse welfare campaigns.

LANGUAGE RULES:
- Never say "meat," "leather," "dairy," "pork" — say "animal flesh," "animal skin," "cow's milk," "pig flesh."
- Never refer to an animal as "it" — always use "they/them."
- Never say "abuse" where "use" is accurate.
- Never say "minimise harm."
- Never use idioms that normalise animal use.

COW'S MILK: Do NOT frame it as gentle or non-lethal use. In most dairy operations, cows are sent to slaughter after ~2 years and male calves are killed at birth. Death is standard in dairy, not exceptional.

FORMAT: Respond ONLY with valid JSON: {"question": "...", "answer": "...", "key": "one-sentence takeaway"}
Keep answers to 3-5 paragraphs for Discord readability.`;

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

  if (body.type === InteractionType.PING) {
    return res.json({ type: InteractionResponseType.PONG });
  }

  if (body.type === InteractionType.APPLICATION_COMMAND && body.data.name === "ask") {
    const query = body.data.options?.find(o => o.name === "question")?.value || "";
    const { token, application_id } = body;

    // Send deferred response so Discord doesn't time out
    res.json({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE });

    const followupUrl = `https://discord.com/api/v10/webhooks/${application_id}/${token}/messages/@original`;

    try {
      const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: query }],
        }),
      });

      const claudeData = await claudeRes.json();
      const text = claudeData.content?.find(b => b.type === "text")?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

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
    } catch (err) {
      await fetch(followupUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `Something went wrong: ${err.message}` }),
      }).catch(() => {});
    }
  }
}
