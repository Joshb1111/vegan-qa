import { useState, useEffect } from "react";
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

const STORAGE_KEY = "vegan-qa-history";

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("long");

  const [clientCache] = useState(() => new Map());

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  const generate = async (q, selectedMode) => {
    const query = (q || input).trim();
    const answerMode = selectedMode || mode;
    if (!query || loading) return;

    const key = `${answerMode}:${query.toLowerCase().trim()}`;
    if (clientCache.has(key)) {
      setResult(clientCache.get(key));
      setError(null);
      return;
    }

    setLoading(true);
    setResult(null);
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
      setHistory(h => {
        const entry = { query, ...data, savedAt: Date.now() };
        const filtered = h.filter(i => i.question !== data.question);
        return [entry, ...filtered].slice(0, 50);
      });
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const previousItems = result
    ? history.filter(h => h.question !== result.question)
    : history;

  return (
    <div className="wrap">
      <div className="hero">
        <span className="logo">Vegan Q&A</span>
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

      {previousItems.length > 0 && (
        <div className="history">
          <div className="history-header">
            <p className="history-label">Previous answers</p>
            <button className="clear-btn" onClick={clearHistory}>Clear</button>
          </div>
          {previousItems.map((h, i) => (
            <div key={i} className="card history-card">
              <p className="question">{h.question}</p>
              <div className="answer-wrap expanded">
                <p className="answer">{h.answer}</p>
              </div>
              {h.key && <div className="key">{h.key}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
