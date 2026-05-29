import { useState, useRef } from "react";

export default function ReplyHelper() {
  const [comment, setComment] = useState("");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);

  async function generate() {
    const trimmed = comment.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    setReply("");
    setCopied(false);
    try {
      const r = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: trimmed }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to generate reply");
      setReply(data.reply || "");
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  function copy() {
    navigator.clipboard.writeText(reply).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {
      prompt("Copy this reply:", reply);
    });
  }

  function clear() {
    setComment("");
    setReply("");
    setError("");
    setCopied(false);
    textareaRef.current?.focus();
  }

  return (
    <div className="reply-helper">
      <div className="reply-header">
        <h1 className="reply-title">Reply Helper</h1>
        <p className="reply-sub">
          Paste a comment from social media. You'll get a short, principled reply you can copy.
        </p>
        <p className="reply-caveat">
          These are starting points — edit before sending. Your own voice matters more than the wording.
        </p>
      </div>

      <div className="reply-input-wrap">
        <textarea
          ref={textareaRef}
          className="reply-textarea"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder='Paste a comment here — e.g., "Lab-grown meat is the solution, it reduces suffering, why would you oppose it?"'
          rows={5}
          maxLength={2000}
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
          }}
        />
        <div className="reply-actions">
          <span className="reply-counter">{comment.length}/2000</span>
          <div className="reply-buttons">
            {comment && (
              <button className="reply-clear" onClick={clear} disabled={loading}>
                Clear
              </button>
            )}
            <button
              className="reply-generate"
              onClick={generate}
              disabled={loading || !comment.trim()}
              title="Cmd/Ctrl+Enter"
            >
              {loading ? "Generating…" : reply ? "Regenerate" : "Generate reply"}
            </button>
          </div>
        </div>
      </div>

      {error && <p className="error-text reply-error">{error}</p>}

      {loading && (
        <div className="thinking reply-thinking">
          <span className="dot" /><span className="dot" /><span className="dot" />
        </div>
      )}

      {reply && !loading && (
        <div className="reply-result">
          <p className="reply-text">{reply}</p>
          <div className="reply-result-actions">
            <button
              className={`reply-copy ${copied ? "copied" : ""}`}
              onClick={copy}
            >
              {copied ? "✓ Copied" : "Copy reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
