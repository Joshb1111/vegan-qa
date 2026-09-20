// Hands each player a signed Ably token request, so the Ably key itself never leaves the server.
// The token only allows the planet game's channels. GET /api/ably-token?clientId=<player id>
import crypto from "node:crypto";
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.ABLY_API_KEY || "";
  const i = key.indexOf(":");
  if (i < 1) return res.status(503).json({ error: "Realtime is not set up." });
  const keyName = key.slice(0, i), secret = key.slice(i + 1);
  const clientId = String((req.query && req.query.clientId) || "");
  if (!/^[a-z0-9]{8,20}$/.test(clientId)) return res.status(400).json({ error: "Bad id" });
  const ttl = 60 * 60 * 1000, timestamp = Date.now(), nonce = crypto.randomBytes(12).toString("hex");
  const capability = JSON.stringify({ "planet:*": ["publish", "subscribe", "presence"] });
  const text = [keyName, ttl, capability, clientId, timestamp, nonce].join("\n") + "\n";
  const mac = crypto.createHmac("sha256", secret).update(text).digest("base64");
  return res.status(200).json({ keyName, ttl, capability, clientId, timestamp, nonce, mac });
}
