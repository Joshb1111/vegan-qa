#!/usr/bin/env node
// Pre-generates the planet game's suggested-question answers so they never cost credits at play time.
// Reads public/planet-questions.json, asks the live API in "game" mode (which also fills the Redis
// cache), and writes public/planet-answers.json for the game to load.
//   node scripts/warm-planet.mjs                # against production
//   BASE=http://localhost:3000 node scripts/warm-planet.mjs
import fs from "node:fs";
const BASE = process.env.BASE || "https://vegan-qa.vercel.app";
const ADMIN = process.env.ADMIN_KEY || ""; // set to skip the per-IP rate limits (read from .env.vercel.local by the npm script)
const questions = JSON.parse(fs.readFileSync("public/planet-questions.json", "utf8"));
const out = fs.existsSync("public/planet-answers.json") ? JSON.parse(fs.readFileSync("public/planet-answers.json", "utf8")) : {};
const norm = q => q.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
for (const q of questions) {
  const k = norm(q);
  if (out[k]?.answer && !process.env.FORCE) { console.log("kept  ", q); continue; }
  const r = await fetch(`${BASE}/api/ask`, { method: "POST", headers: { "Content-Type": "application/json", ...(ADMIN ? { "x-admin-key": ADMIN } : {}) }, body: JSON.stringify({ query: q, mode: "game", sessionId: "warm-planet" }) });
  if (!r.ok) { console.log("FAILED", r.status, q); continue; }
  const j = await r.json();
  if (!j.answer) { console.log("EMPTY ", q); continue; }
  out[k] = { answer: j.answer, key: j.key || "" };
  console.log("done  ", q);
  await new Promise(res => setTimeout(res, ADMIN ? 1200 : 8500)); // stay under the burst limit unless we are admin
}
fs.writeFileSync("public/planet-answers.json", JSON.stringify(out, null, 1));
console.log(`\n${Object.keys(out).length} answers in public/planet-answers.json`);
