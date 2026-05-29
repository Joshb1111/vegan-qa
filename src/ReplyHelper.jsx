import { useState, useRef } from "react";

// Display "Answer 1" / "Answer 2" rather than the internal register names —
// keeps the UI neutral so the reader compares them without being pre-judged.

export default function ReplyHelper() {
  const [comment, setComment] = useState("");
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(-1);
  const textareaRef = useRef(null);

  async function generate() {
    const trimmed = comment.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError("");
    setReplies([]);
    setCopiedIndex(-1);
    try {
      const r = await fetch("/api/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: trimmed }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to generate replies");
      setReplies(data.replies || []);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  function copy(text, index) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(-1), 1800);
    }).catch(() => {
      prompt("Copy this reply:", text);
    });
  }

  function clear() {
    setComment("");
    setReplies([]);
    setError("");
    setCopiedIndex(-1);
    textareaRef.current?.focus();
  }

  return (
    <div className="reply-helper">
      <div className="reply-header">
        <h1 className="reply-title">Reply Helper</h1>
        <p className="reply-sub">
          Paste a comment from social media. You'll get two short, principled replies in different registers — pick whichever fits your voice.
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
              {loading ? "Generating…" : replies.length > 0 ? "Regenerate" : "Generate replies"}
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

      {replies.length > 0 && !loading && (
        <div className="reply-results">
          {replies.map((r, i) => (
            <div key={i} className="reply-result">
              <div className="reply-result-head">
                <span className="reply-register">Answer {i + 1}</span>
                <button
                  className={`reply-copy ${copiedIndex === i ? "copied" : ""}`}
                  onClick={() => copy(r.text, i)}
                >
                  {copiedIndex === i ? "✓ Copied" : "Copy"}
                </button>
              </div>
              <p className="reply-text">{r.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
