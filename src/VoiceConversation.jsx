import { useState, useEffect, useRef, useCallback } from "react";

const PACKS = [
  { id: "p3",  price: "$3",  sessions: 5,  perSession: "$0.60" },
  { id: "p10", price: "$10", sessions: 20, perSession: "$0.50", recommended: true },
  { id: "p25", price: "$25", sessions: 60, perSession: "$0.42" },
];

export default function VoiceConversation({ open, onClose }) {
  const [account, setAccount] = useState(null); // { creditsRemaining, sessionsRemainingToday }
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | connecting | live | ended | error
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [transcript, setTranscript] = useState([]); // [{role, text}]
  const conversationRef = useRef(null);
  const countdownRef = useRef(null);

  // Load account state when modal opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/account", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(setAccount)
      .catch(() => setAccount(null));
  }, [open]);

  const endConversation = useCallback(() => {
    if (conversationRef.current) {
      try { conversationRef.current.endSession(); } catch {}
      conversationRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setStatus(s => (s === "live" || s === "connecting" ? "ended" : s));
  }, []);

  // Tear down on unmount or modal close
  useEffect(() => {
    if (!open) endConversation();
    return endConversation;
  }, [open, endConversation]);

  async function startConversation() {
    setError("");
    setTranscript([]);
    setStatus("connecting");
    setLoading(true);
    try {
      const r = await fetch("/api/convai-start", {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${r.status})`);
      }
      const { signedUrl, maxDurationSeconds, creditsRemaining, sessionsRemainingToday } = await r.json();
      setAccount(a => ({ ...(a || {}), creditsRemaining, sessionsRemainingToday }));
      setSecondsLeft(maxDurationSeconds);

      // Lazy-load the ElevenLabs SDK so it doesn't bloat the main bundle
      const { Conversation } = await import("@elevenlabs/client");
      const conversation = await Conversation.startSession({
        signedUrl,
        onConnect: () => setStatus("live"),
        onDisconnect: () => endConversation(),
        onError: (e) => { setError(String(e?.message || e)); setStatus("error"); },
        onMessage: (msg) => {
          // ElevenLabs message shape: { source: "user"|"ai", message: "text" }
          if (msg?.message) {
            setTranscript(t => [...t, { role: msg.source === "user" ? "user" : "assistant", text: msg.message }]);
          }
        },
      });
      conversationRef.current = conversation;

      // Local countdown — display only; the real cap is server-side
      countdownRef.current = setInterval(() => {
        setSecondsLeft(s => {
          if (s <= 1) { endConversation(); return 0; }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err.message);
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  async function buyPack(packId) {
    setLoading(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packId }),
      });
      const { url, error } = await r.json();
      if (error) throw new Error(error);
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  if (!open) return null;

  const credits = account?.creditsRemaining ?? 0;
  const sessionsLeftToday = account?.sessionsRemainingToday ?? 5;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(1, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal voice-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <h2 className="modal-title">Voice conversation</h2>

        {status === "idle" && (
          <>
            <p>Have a 5-minute back-and-forth with the bot using your voice. Conversations are capped at 5 minutes server-side.</p>
            <div className="credits-row">
              <strong>{credits}</strong> credits · <strong>{sessionsLeftToday}</strong> sessions left today
            </div>

            {credits > 0 ? (
              <button className="primary-btn" onClick={startConversation} disabled={loading || sessionsLeftToday <= 0}>
                {sessionsLeftToday <= 0 ? "Daily limit reached" : loading ? "Starting…" : "Start 5-min conversation"}
              </button>
            ) : (
              <div className="packs">
                <p className="packs-intro">You're out of credits. This is a non-profit project — your payment covers ElevenLabs + Anthropic API costs, not profit.</p>
                {PACKS.map(p => (
                  <button
                    key={p.id}
                    className={`pack ${p.recommended ? "recommended" : ""}`}
                    onClick={() => buyPack(p.id)}
                    disabled={loading}
                  >
                    <span className="pack-price">{p.price}</span>
                    <span className="pack-sessions">{p.sessions} sessions</span>
                    <span className="pack-per">{p.perSession} each</span>
                    {p.recommended && <span className="pack-badge">Best value</span>}
                  </button>
                ))}
                <p className="cost-breakdown">
                  Each session ≈ $0.30 ElevenLabs voice · $0.10 Claude · $0.30 Stripe fee (shared across pack).
                </p>
              </div>
            )}
          </>
        )}

        {(status === "connecting" || status === "live") && (
          <div className="convo-live">
            <div className="convo-status">
              {status === "connecting" ? "Connecting…" : "Listening — speak naturally"}
            </div>
            <div className="convo-timer">{mm}:{ss}</div>
            <div className="convo-transcript">
              {transcript.length === 0 ? (
                <p className="convo-hint">Your conversation will appear here as you speak.</p>
              ) : (
                transcript.map((t, i) => (
                  <div key={i} className={`convo-line ${t.role}`}>
                    <span className="convo-who">{t.role === "user" ? "You" : "Bot"}:</span> {t.text}
                  </div>
                ))
              )}
            </div>
            <button className="primary-btn end-btn" onClick={endConversation}>End conversation</button>
          </div>
        )}

        {status === "ended" && (
          <div className="convo-ended">
            <p>Conversation ended.</p>
            <p><strong>{credits}</strong> credits remaining · <strong>{sessionsLeftToday}</strong> sessions left today.</p>
            <button className="primary-btn" onClick={() => setStatus("idle")} disabled={credits <= 0 || sessionsLeftToday <= 0}>
              Start another
            </button>
          </div>
        )}

        {status === "error" && (
          <div className="convo-error">
            <p className="error-text">{error}</p>
            <button className="primary-btn" onClick={() => { setStatus("idle"); setError(""); }}>Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
