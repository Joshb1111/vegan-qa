import { useState } from "react";
import "./App.css";

const SUGGESTIONS = [
  "What is veganism?",
  "When did veganism start being diluted?",
  "Why welfare reform fails",
  "Is reducetarianism veganism?",
  "What is instrumentalisation?",
  "What about crop deaths?",
  "Is veganism about suffering?",
  "What changed in 1979?",
  "Why not single-issue campaigns?",
  "What did Leslie Cross define?"
];

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("long");
  const [expanded, setExpanded] = useState(false);

  const [clientCache] = useState(() => new Map());

  const generate = async (q, selectedMode) => {
    const query = (q || input).trim();
    const answerMode = selectedMode || mode;
    if (!query || loading) return;

    const key = `${answerMode}:${query.toLowerCase().trim()}`;
    if (clientCache.has(key)) {
      setResult(clientCache.get(key));
      setExpanded(false);
      setError(null);
      return;
    }

    setLoading(true);
    setResult(null);
    setExpanded(false);
    setError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, mode: answerMode })
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      clientCache.set(key, data);
      setResult(data);
      setHistory(h => [{ query, ...data }, ...h].slice(0, 20));
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="wrap">
      <div className="hero">
        <span className="logo">Vegan Q&A</span>
        <div className="hero-rule"></div>
        <p className="sub">Grounded in the work of abolitionist vegan thinkers and the original vegan ethical framework.</p>

        <div className="search-box">
          <input
            className="search-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && generate()}
            placeholder="Ask me anything..."
            autoFocus
          />
          <div className="search-controls">
            <div className="mode-toggle">
              <button
                className={`mode-btn ${mode === "short" ? "active" : ""}`}
                onClick={() => setMode("short")}
              >{mode === "short" ? "Short Answer" : "Short"}</button>
              <button
                className={`mode-btn ${mode === "long" ? "active" : ""}`}
                onClick={() => setMode("long")}
              >{mode === "long" ? "Detailed Answer" : "Detailed"}</button>
            </div>
            <button
              className="search-btn"
              onClick={() => generate()}
              disabled={loading || !input.trim()}
            >
              {loading ? "Please wait" : "Ask"}
            </button>
          </div>
        </div>

        <div className="pills-wrapper">
          <div className="pills">
            {SUGGESTIONS.map(sug => (
              <button key={sug} className="pill" onClick={() => { setInput(sug); generate(sug); }}>
                {sug}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && (
        <div className="thinking-box">
          <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
          <p className="thinking-text">Finding your answer…</p>
        </div>
      )}

      {result && !loading && (
        <div className="card">
          <p className="question">{result.question}</p>
          <div className="answer-wrap expanded">
            <p className="answer">{result.answer}</p>
          </div>
          {result.key && <div className="key">{result.key}</div>}
        </div>
      )}

      {history.length > 1 && (
        <div className="history">
          <p className="history-label">Previous</p>
          {history.slice(1).map((h, i) => (
            <button key={i} className="history-item" onClick={() => { setResult(h); setInput(h.query); setExpanded(false); }}>
              {h.question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}