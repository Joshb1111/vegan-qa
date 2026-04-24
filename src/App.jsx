import { useState } from "react";
import "./App.css";

const SUGGESTIONS = [
  "Why welfare reform fails",
  "What did Leslie Cross define?",
  "Is reducetarianism veganism?",
  "What is instrumentalisation?",
  "Why not single-issue campaigns?",
  "What about crop deaths?",
  "Is veganism about suffering?",
  "What changed in 1979?"
];

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  const generate = async (q) => {
    const query = (q || input).trim();
    if (!query || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setResult(data);
      setHistory(h => [{ query, ...data }, ...h].slice(0, 20));
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div className="wrap">
      <p className="label">Vegan Q&A</p>
      <h1 className="heading">Ask anything</h1>
      <p className="sub">Grounded in the original 1951 definition and abolitionist philosophy.</p>

      <div className="input-row">
        <input
          className="input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && generate()}
          placeholder="Type a question or topic..."
        />
        <button
          className="btn-primary"
          onClick={() => generate()}
          disabled={loading || !input.trim()}
        >
          {loading ? "…" : "Ask"}
        </button>
      </div>

      <div className="pills">
        {SUGGESTIONS.map(sug => (
          <button key={sug} className="pill" onClick={() => { setInput(sug); generate(sug); }}>
            {sug}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {loading && <p className="thinking">Thinking…</p>}

      {result && !loading && (
        <div className="card">
          <p className="question">{result.question}</p>
          <p className="answer">{result.answer}</p>
          {result.key && <div className="key">{result.key}</div>}
        </div>
      )}

      {history.length > 1 && (
        <div className="history">
          <p className="history-label">Previous</p>
          {history.slice(1).map((h, i) => (
            <button key={i} className="history-item" onClick={() => { setResult(h); setInput(h.query); }}>
              {h.question}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}