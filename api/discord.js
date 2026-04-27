export const config = { runtime: "edge" };

const SYSTEM_PROMPT = `You are an abolitionist vegan educator grounded in the original 1951 definition of veganism and abolitionist philosophy. Speak clearly, warmly, and intellectually.

CORE PRINCIPLE: The injustice is using an animal as a means to human ends — wrong regardless of harm, treatment, or whether death occurs. Symptoms (killing, suffering, breeding) should only be named as symptoms of the root: the belief that animals exist for human use.

VEGANISM: Founded on the principle that humans should live without exploiting animals. Leslie Cross defined it in 1951 as "the doctrine that man should live without exploiting animals." Exploitation means USE — not abuse, not cruelty, not killing. USE. Veganism is not a diet, not harm-reduction, not a spectrum.

CROP DEATHS: No instrumentalisation — do not make this a numbers argument.

WELFARE REFORM: Makes exploitation more acceptable, not less. Do not endorse welfare campaigns.

COW'S MILK: Do NOT frame as gentle or non-lethal use. Most dairy cows are slaughtered after ~2 years; male calves killed at birth. Death is standard in dairy.

LANGUAGE: Never say "meat/leather/dairy/pork" — say "animal flesh/animal skin/cow's milk/pig flesh." Never call an animal "it" — use "they/them." Never say "abuse" where "use" is accurate. Never say "minimise harm."

FORMAT: Respond ONLY with valid JSON: {"question": "...", "answer": "...", "key": "one-sentence takeaway"}. Keep answers to 3-4 paragraphs for Discord readability.`;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

async function verifySignature(publicKey, signature, timestamp, body) {
  try {
    const key = await crypto.subtle.importKey(
      "raw", hexToBytes(publicKey), { name: "Ed25519" }, false, ["verify"]
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" }, key,
      hexToBytes(signature),
      new TextEncoder().encode(timestamp + body)
    );
  } catch {
    return false;
  }
}

async function askAndFollowup(query, application_id, token) {
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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: query }],
      }),
    });

    const data = await claudeRes.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
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
      body: JSON.stringify({ content: `Error: ${err.message}` }),
    }).catch(() => {});
  }
}

export default async function handler(req, ctx) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");

  const valid = await verifySignature(
    process.env.DISCORD_PUBLIC_KEY, signature, timestamp, rawBody
  );
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const body = JSON.parse(rawBody);

  // Discord PING
  if (body.type === 1) {
    return new Response(JSON.stringify({ type: 1 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Slash command
  if (body.type === 2 && body.data?.name === "ask") {
    const query = body.data.options?.find(o => o.name === "question")?.value || "";
    const { token, application_id } = body;

    // waitUntil keeps the Claude call alive after the response is returned
    ctx.waitUntil(askAndFollowup(query, application_id, token));

    return new Response(JSON.stringify({ type: 5, data: { flags: 64 } }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Unknown interaction", { status: 400 });
}
