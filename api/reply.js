// POST /api/reply
// Body: { comment: string }
// Returns: { variants: [{ angle: "direct"|"question"|"reframe", text: string }, ...] }
//
// Generates 3 short replies an activist can copy/paste into a social-media thread.
// Uses the same SYSTEM_PROMPT as /api/ask but with a reply-mode addendum that
// enforces brevity, variety, no buzzwords, and no manifesto-style openings.

import { SYSTEM_PROMPT } from "./_prompt.js";

const REPLY_SYSTEM_ADDENDUM = `
You are now in REPLY MODE. The user has pasted a comment from social media
(Instagram, YouTube, Reddit, X, etc.) and needs 3 short reply options they
can copy-paste in response.

OUTPUT FORMAT — STRICT JSON:
{"variants":[
  {"angle":"direct","text":"..."},
  {"angle":"question","text":"..."},
  {"angle":"reframe","text":"..."}
]}

Return ONLY that JSON. No markdown, no preamble, no commentary.

ANGLES — each variant must genuinely embody its angle:
- "direct"   — engage the specific claim head-on. State what is wrong with it, plainly.
- "question" — turn the logic back with a question they have to answer. No statement of position; just the question.
- "reframe"  — rename what they're describing. Show that what they call X is actually Y.

CONSTRAINTS — apply to EVERY variant:
- 2 to 4 sentences MAX. Cut anything that doesn't earn its place. A 1-sentence reply is fine if it lands.
- NEVER open with "Veganism is...", "The principle is...", or any other definition. Engage with what the commenter actually said.
- Do NOT recite the abolitionist framework. Do NOT say "means to an end," "instrumentalisation," "moral patient," "rejection of use" unless they fit so naturally a non-vegan reader would not flag them as jargon.
- Vary the OPENING WORDS across the three variants. Never start two variants with the same word or sentence shape.
- No condescension. Assume the commenter is sincere even when hostile. No "actually," no "you clearly," no "the problem with your argument."
- No call-to-action endings. Do not say "go vegan," "try plant-based," "watch Dominion." Let the argument land on its own.
- No emojis. No hashtags.
- Speak like a thoughtful person in a thread, not a leaflet.
- The principle (animals are not ours to use) should be PRESENT in the reasoning but rarely stated outright. Show it through the argument, do not announce it.

CONTENT — all replies must remain grounded in the abolitionist position from
the system prompt above. You may engage with welfare, suffering, or environmental
framings the commenter uses, but only to redirect toward use itself — never to
concede that regulating use is acceptable.

If the pasted text is not a comment, is empty, or is gibberish, return:
{"variants":[{"angle":"direct","text":"That doesn't look like a comment I can reply to — try pasting the message you want to respond to."},{"angle":"question","text":"What comment would you like a reply to?"},{"angle":"reframe","text":"Paste a comment above and I'll suggest three response angles."}]}
`.trim();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { comment } = req.body || {};
  if (!comment || typeof comment !== "string") {
    return res.status(400).json({ error: "Missing comment" });
  }
  if (comment.length > 2000) {
    return res.status(400).json({ error: "Comment too long — keep under 2000 characters." });
  }

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
        max_tokens: 800,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT + "\n\n" + REPLY_SYSTEM_ADDENDUM,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          { role: "user", content: `Comment to reply to:\n\n${comment}` },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText);
      return res.status(502).json({ error: "Reply service unavailable" });
    }

    const data = await anthropicRes.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(clean); } catch {
      console.error("Could not parse reply JSON:", clean);
      return res.status(502).json({ error: "Reply format error — try again" });
    }

    if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
      return res.status(502).json({ error: "Reply format error — try again" });
    }

    // Fire-and-forget Discord notification for visibility into how the feature is used
    if (process.env.DISCORD_WEBHOOK_URL) {
      fetch(process.env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: "Reply helper used",
            description: `**Comment:** ${comment.slice(0, 500)}\n\n**Variants:**\n${parsed.variants.map(v => `*${v.angle}*: ${v.text}`).join("\n\n")}`.slice(0, 4000),
            color: 0x60a5fa,
          }],
        }),
      }).catch(() => {});
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Reply generation failed" });
  }
}
