import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";

const SUGGESTIONS = [
  "What is veganism?",
  "Is reducetarianism veganism?",
  "Why welfare reform fails",
  "What about crop deaths?",
  "What changed in 1979?",
  "Why not single-issue campaigns?",
  "Is veganism about suffering?",
  "What is instrumentalisation?",
  "What is moral agency?",
];

const STORAGE_KEY = "vegan-qa-history";

function getSessionId() {
  let id = sessionStorage.getItem("vqa-session");
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem("vqa-session", id); }
  return id;
}

const CATEGORIES = [
  {
    label: "What is veganism",
    keywords: ["what is veganism", "define vegan", "definition", "meaning of vegan", "vegan mean", "vegan is", "principle of vegan"],
  },
  {
    label: "Outreach & activism",
    keywords: ["outreach", "activist", "activism", "street", "conversation", "advocacy", "persuade", "convince", "talk to", "discuss"],
  },
  {
    label: "Welfare & reform",
    keywords: ["welfare", "welfarist", "welfarism", "reform", "cage-free", "cage free", "single-issue", "single issue", "humane", "cruelty-free", "free range"],
  },
  {
    label: "Common arguments",
    keywords: ["crop death", "lab-grown", "lab grown", "cultured", "pesticide", "medical", "protein", "nutrient", "health", "survival", "desert island", "plants feel", "leather", "wool", "honey", "egg"],
  },
  {
    label: "History of veganism",
    keywords: ["1951", "1979", "history", "founded", "original", "leslie cross", "donald watson", "vegan society", "changed", "diluted", "betrayal"],
  },
  {
    label: "Philosophy",
    keywords: ["instrumentali", "moral agency", "moral patient", "deontic", "exploitation", "use", "objectif", "sentien", "rights", "justice", "principle", "property"],
  },
  {
    label: "Organisations & figures",
    keywords: ["earthling ed", "joey carbstrong", "gary francione", "peter singer", "anonymous for the voiceless", "av cube", "we the free", "we stand", "earthlings experience", "organisation", "organization", "peta", "hsus"],
  },
];

function categorise(question) {
  const q = (question || "").toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(k => q.includes(k))) return cat.label;
  }
  return "Other";
}

function groupByCategory(items) {
  const map = {};
  for (const item of items) {
    const cat = item.category || categorise(item.question || item.query || "");
    if (!map[cat]) map[cat] = [];
    map[cat].push(item);
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([label, items]) => ({ label, items }));
}

function groupHistory(items) {
  const now = Date.now();
  const DAY = 86400000;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const groups = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "This week", items: [] },
    { label: "Older", items: [] },
  ];
  for (const item of items) {
    const t = item.savedAt || 0;
    if (t >= todayStart) groups[0].items.push(item);
    else if (t >= todayStart - DAY) groups[1].items.push(item);
    else if (t >= now - 7 * DAY) groups[2].items.push(item);
    else groups[3].items.push(item);
  }
  return groups.filter(g => g.items.length > 0);
}

function useSpeech(onResult) {
  const recogRef = useRef(null);
  const [listening, setListening] = useState(false);
  const supported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggle = useCallback(() => {
    if (!supported) return alert("Voice input isn't supported in this browser. Try Chrome.");
    if (listening) { recogRef.current?.stop(); setListening(false); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = e => { onResult(e.results[0][0].transcript); setListening(false); };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    recogRef.current = r;
    r.start();
    setListening(true);
  }, [listening, onResult, supported]);

  return { listening, toggle, supported };
}

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("long");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState("recent");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  });
  const [clientCache] = useState(() => new Map());
  const sessionId = getSessionId();

  const { listening, toggle: toggleMic } = useSpeech(text => setInput(text));

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  // Close sidebar on small screens by default
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, []);

  const generate = async (q, m) => {
    const query = (q || input).trim();
    const answerMode = m || mode;
    if (!query || loading) return;

    const cacheKey = `${answerMode}:${query.toLowerCase()}`;
    if (clientCache.has(cacheKey)) {
      setResult(clientCache.get(cacheKey));
      setInput("");
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
        body: JSON.stringify({ query, mode: answerMode, sessionId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      clientCache.set(cacheKey, data);
      setResult(data);
      setInput("");
      setHistory(h => {
        const entry = { query, ...data, savedAt: Date.now(), category: categorise(data.question || query) };
        return [entry, ...h.filter(i => i.question !== data.question)].slice(0, 100);
      });
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const newChat = () => {
    setResult(null);
    setInput("");
    setError(null);
    sessionStorage.removeItem("vqa-session");
  };

  const filteredHistory = history.filter(h =>
    !search || h.question?.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupHistory(filteredHistory);

  return (
    <div className={`layout ${sidebarOpen ? "sidebar-open" : ""}`}>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="new-chat" onClick={newChat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New conversation
          </button>
          <div className="sidebar-search-wrap">
            <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              className="sidebar-search"
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="sidebar-tabs">
          <button className={`sidebar-tab ${sidebarTab === "recent" ? "active" : ""}`} onClick={() => setSidebarTab("recent")}>Recent</button>
          <button className={`sidebar-tab ${sidebarTab === "topics" ? "active" : ""}`} onClick={() => setSidebarTab("topics")}>Topics</button>
        </div>

        <nav className="sidebar-nav">
          {sidebarTab === "recent" && (
            grouped.length === 0
              ? <p className="sidebar-empty">No previous questions</p>
              : grouped.map(({ label, items }) => (
                <div key={label} className="nav-group">
                  <p className="nav-group-label">{label}</p>
                  {items.map((item, i) => (
                    <button key={item.question + i} className={`nav-item ${result?.question === item.question ? "active" : ""}`} onClick={() => setResult(item)} title={item.question}>
                      {item.question}
                    </button>
                  ))}
                </div>
              ))
          )}
          {sidebarTab === "topics" && (
            groupByCategory(filteredHistory).length === 0
              ? <p className="sidebar-empty">No previous questions</p>
              : groupByCategory(filteredHistory).map(({ label, items }) => (
                <div key={label} className="nav-group">
                  <p className="nav-group-label">{label}</p>
                  {items.map((item, i) => (
                    <button key={item.question + i} className={`nav-item ${result?.question === item.question ? "active" : ""}`} onClick={() => setResult(item)} title={item.question}>
                      {item.question}
                    </button>
                  ))}
                </div>
              ))
          )}
        </nav>

        {history.length > 0 && (
          <button className="clear-history" onClick={() => { setHistory([]); setResult(null); localStorage.removeItem(STORAGE_KEY); }}>
            Clear history
          </button>
        )}
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="main">
        {/* Topbar */}
        <header className="topbar">
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(o => !o)} title="Toggle sidebar">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <span className="topbar-brand">Vegan Q&A</span>
          <button className="about-btn" onClick={() => setAboutOpen(true)}>About</button>
          <div className="topbar-right">
            <div className="mode-toggle">
              <button className={`mode-btn ${mode === "short" ? "active" : ""}`} onClick={() => setMode("short")}>{mode === "short" ? "Short answers" : "Short"}</button>
              <button className={`mode-btn ${mode === "long" ? "active" : ""}`} onClick={() => setMode("long")}>{mode === "long" ? "Detailed answers" : "Detailed"}</button>
            </div>
          </div>
        </header>

        {/* About modal */}
        {aboutOpen && (
          <div className="modal-overlay" onClick={() => setAboutOpen(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setAboutOpen(false)}>✕</button>
              <h2 className="modal-title">About Vegan Q&A</h2>
              <p>This is an AI chatbot powered by a large language model (LLM), grounded in the work of abolitionist vegan thinkers and the original vegan ethical framework as defined in 1951.</p>
              <p>It is designed to help activists, advocates, and curious people explore questions about veganism, animal use, outreach, and the philosophy behind the movement.</p>
              <p>While every answer is shaped by carefully researched principles, this tool is still in beta — answers may not always be 100% accurate. The bot is continuously reviewed and updated by real humans who hold the abolitionist position.</p>
              <p className="modal-footer-note">If you notice an answer that feels off, treat it as a starting point for your own thinking — not a final authority.</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="content">
          {/* Hero — always visible at the top */}
          <div className={`empty-state ${result || loading || error ? "compact" : ""}`}>
            <h1 className="hero-title">Vegan Q&A</h1>
            <p className="hero-sub">Not generic AI. Grounded in the work of abolitionist vegan thinkers and the original vegan ethical framework.</p>

            <div className="input-bar centered-input">
              <input
                className="chat-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && generate()}
                placeholder="Ask me anything..."
                autoFocus={!result}
              />
              <button
                className={`icon-btn mic-btn ${listening ? "active" : ""}`}
                onClick={toggleMic}
                title={listening ? "Stop" : "Voice input"}
              >
                {listening ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                )}
              </button>
              <button
                className="icon-btn send-btn"
                onClick={() => generate()}
                disabled={loading || !input.trim()}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </button>
            </div>

            <div className="pills-row">
              {SUGGESTIONS.map(s => (
                <button key={s} className="pill" onClick={() => { setInput(s); generate(s); }}>{s}</button>
              ))}
            </div>
          </div>

          {loading && (
            <div className="thinking">
              <span className="dot" /><span className="dot" /><span className="dot" />
            </div>
          )}

          {result && !loading && (
            <div className="answer-block">
              <p className="answer-question">{result.question || result.query}</p>
              <p className="answer-body">{result.answer}</p>
              {result.key && <div className="answer-key">{result.key}</div>}
            </div>
          )}

          {error && <p className="error-text">{error}</p>}
        </div>

        {/* Floating follow-up bar — only when answer is active */}
        {(result || loading) && (
          <div className="input-area floating">
            <div className="input-bar">
              <input
                className="chat-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && generate()}
                placeholder="Ask a follow-up..."
                autoFocus={!!result}
              />
              <button
                className={`icon-btn mic-btn ${listening ? "active" : ""}`}
                onClick={toggleMic}
                title={listening ? "Stop" : "Voice input"}
              >
                {listening ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                )}
              </button>
              <button
                className="icon-btn send-btn"
                onClick={() => generate()}
                disabled={loading || !input.trim()}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </button>
            </div>
            <p className="input-disclaimer">Grounded in abolitionist vegan philosophy · Not affiliated with any organisation</p>
          </div>
        )}
      </div>
    </div>
  );
}
