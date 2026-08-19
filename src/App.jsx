import { useState, useEffect, useRef, useCallback } from "react";
import "./App.css";
import ReplyHelper from "./ReplyHelper.jsx";
import InstallPrompt from "./InstallPrompt.jsx";

const STORAGE_KEY = "vegan-qa-history";
const HISTORY_VERSION_KEY = "vegan-qa-history-version";
// Bump this string to force-clear EVERY visitor's saved Recent/Topics history on their next
// visit. Used to purge answers that were captured before the prompt was hardened, so old
// (unwanted) answers can't be referenced from anyone's history.
const HISTORY_VERSION = "reset-2026-07-06-a";
const DAILY_IMAGE_LIMIT = 5;

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
  const [micError, setMicError] = useState(null);
  const supported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const toggle = useCallback(() => {
    if (!supported) return alert("Voice input isn't supported in this browser. Try Chrome or Safari.");
    if (listening) { recogRef.current?.stop(); setListening(false); return; }
    setMicError(null);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = "en-US";
    r.interimResults = false;
    r.onresult = e => { onResult(e.results[0][0].transcript); setListening(false); };
    r.onerror = e => {
      setListening(false);
      if (e.error === "not-allowed") setMicError("Microphone access was denied. Check your browser settings.");
      else if (e.error === "no-speech") setMicError("No speech detected. Try again.");
      else if (e.error === "network") setMicError("Network error — voice input needs an internet connection.");
      else setMicError("Voice input failed. Try again.");
    };
    r.onend = () => setListening(false);
    recogRef.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setMicError("Could not start microphone. Try again.");
    }
  }, [listening, onResult, supported]);

  return { listening, toggle, supported, micError, clearMicError: () => setMicError(null) };
}

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const mode = "long"; // answers are always detailed
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("recent");
  const [aboutOpen, setAboutOpen] = useState(false);
  // "qa" by default; the Reply helper is a hidden tool reachable only via ?view=reply
  const [view] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("view") === "reply" ? "reply" : "qa"; }
    catch { return "qa"; }
  });
  const [search, setSearch] = useState("");
  const [history, setHistory] = useState(() => {
    try {
      // One-time purge: if saved history predates the current HISTORY_VERSION, wipe it. Bumping
      // HISTORY_VERSION clears everyone's Recent/Topics history the next time they open the app.
      if (localStorage.getItem(HISTORY_VERSION_KEY) !== HISTORY_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(HISTORY_VERSION_KEY, HISTORY_VERSION);
        return [];
      }
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
  });
  const [clientCache] = useState(() => new Map());
  const [flagged, setFlagged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [textCopied, setTextCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const [image, setImage] = useState(null); // { dataUrl }
  const [imgNotice, setImgNotice] = useState(null);
  const contentRef = useRef(null);
  const progressTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const sessionId = getSessionId();

  const { listening, toggle: toggleMic, micError, clearMicError } = useSpeech(text => setInput(text));

  // Reset flag/copied state whenever a new answer arrives
  useEffect(() => { setFlagged(false); setCopied(false); setTextCopied(false); }, [result]);

  // Progress bar: eases toward ~88% over 12s, jumps to 100% on completion
  useEffect(() => {
    if (loading) {
      const start = Date.now();
      setProgress(0);
      progressTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - start) / 1000;
        const t = Math.min(elapsed / 14, 1);
        // Nearly linear — runs freely to 95% over 14s, only slows after that
        const eased = 1 - Math.pow(1 - t, 1.2);
        const base = eased * 95;
        // After 14s, crawl very slowly so it never fully stalls
        const extra = elapsed > 14 ? Math.min((elapsed - 14) * 0.2, 3) : 0;
        setProgress(Math.min(base + extra, 98));
      }, 80);
      return () => clearInterval(progressTimerRef.current);
    } else {
      clearInterval(progressTimerRef.current);
      setProgress(p => p > 0 ? 100 : 0);
      const t = setTimeout(() => setProgress(0), 500);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const flagAnswer = async () => {
    if (!result || flagged) return;
    try {
      await fetch("/api/flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: result.question || result.query, answer: result.answer }),
      });
    } catch {}
    setFlagged(true);
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history]);

  // Auto-ask from ?ask= URL param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ask = params.get("ask");
    if (ask) {
      window.history.replaceState({}, "", window.location.pathname);
      generate(ask, "long");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const exportHistory = () => {
    if (!history.length) return;
    const text = history.map(item =>
      `Q: ${item.question || item.query}\n\nA: ${item.answer}${item.key ? `\n\n— ${item.key}` : ""}`
    ).join("\n\n─────────────────────\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vegan-qa-history.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyAnswer = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.answer).then(() => {
      setTextCopied(true);
      setTimeout(() => setTextCopied(false), 2500);
    }).catch(() => prompt("Copy this answer:", result.answer));
  };

  const shareAnswer = () => {
    if (!result) return;
    const q = encodeURIComponent(result.question || result.query);
    const url = `${window.location.origin}${window.location.pathname}?ask=${q}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback for browsers without clipboard API
      prompt("Copy this link:", url);
    });
  };


  // Up to 5 image uploads per user per day (client-side guard; server enforces too)
  const imagesUsedToday = () => {
    try {
      const raw = JSON.parse(localStorage.getItem("vqa-image-day") || "{}");
      return raw.date === new Date().toISOString().slice(0, 10) ? (raw.count || 0) : 0;
    } catch { return 0; }
  };
  const imageLimitReached = () => imagesUsedToday() >= DAILY_IMAGE_LIMIT;

  const openImagePicker = () => {
    if (image || loading) return;
    if (imageLimitReached()) { setImgNotice(`You can upload up to ${DAILY_IMAGE_LIMIT} images per day. Try again tomorrow.`); return; }
    setImgNotice(null);
    fileInputRef.current?.click();
  };

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    if (!file.type.startsWith("image/")) { setImgNotice("Please choose an image file."); return; }
    if (imageLimitReached()) { setImgNotice(`You can upload up to ${DAILY_IMAGE_LIMIT} images per day. Try again tomorrow.`); return; }
    // Downscale client-side to keep the upload small and cheap
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1024;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      setImage({ dataUrl: canvas.toDataURL("image/jpeg", 0.85) });
      setImgNotice(null);
    };
    img.onerror = () => { URL.revokeObjectURL(url); setImgNotice("Could not read that image. Try another."); };
    img.src = url;
  };

  const generate = async (q, m) => {
    const query = (q || input).trim();
    const answerMode = m || mode;
    const hasImage = !!image;
    if ((!query && !hasImage) || loading) return;

    // Dismiss the on-screen keyboard on submit so the answer isn't hidden
    // behind it (especially on Android). The follow-up input intentionally
    // does not auto-focus, so the keyboard only opens when the user taps it.
    if (typeof document !== "undefined") document.activeElement?.blur?.();

    // Single-turn memory: carry the immediately-preceding Q&A as context for this question only.
    const prev = result;
    const cacheKey = `${answerMode}:${query.toLowerCase()}`;
    if (!hasImage && !prev && clientCache.has(cacheKey)) {
      setResult(clientCache.get(cacheKey));
      setInput("");
      setError(null);
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);
    // Fail loudly instead of spinning forever if the network stalls (common on
    // mobile). 58s stays just under the serverless function's 60s limit.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 58000);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query || "What can you tell me about this image, in relation to veganism?",
          mode: answerMode,
          sessionId,
          image: hasImage ? image.dataUrl : undefined,
          prev: prev ? { question: prev.question || prev.query, answer: prev.answer } : undefined,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.status === 429) {
        const d = await res.json().catch(() => ({}));
        // An image upload hitting its cap shows by the image control; a question
        // rate-limit shows as the main message.
        if (hasImage) {
          setImgNotice(d.error || `You can upload up to ${DAILY_IMAGE_LIMIT} images per day. Try again tomorrow.`);
        } else {
          setError(d.error || "You've reached today's question limit. Please come back tomorrow.");
        }
        setLoading(false);
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!hasImage && !prev) clientCache.set(cacheKey, data);
      setResult(data);
      setInput("");
      if (hasImage) {
        try {
          const today = new Date().toISOString().slice(0, 10);
          localStorage.setItem("vqa-image-day", JSON.stringify({ date: today, count: imagesUsedToday() + 1 }));
        } catch {}
        setImage(null);
      }
      setHistory(h => {
        const entry = { query: query || data.question, ...data, savedAt: Date.now(), category: categorise(data.question || query) };
        return [entry, ...h.filter(i => i.question !== data.question)].slice(0, 100);
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err?.name === "AbortError") {
        setError("That took too long — the server may be busy. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
    setLoading(false);
  };

  const newChat = () => {
    setResult(null);
    setInput("");
    setError(null);
    setImage(null);
    setImgNotice(null);
    sessionStorage.removeItem("vqa-session");
  };

  const filteredHistory = history.filter(h =>
    !search || h.question?.toLowerCase().includes(search.toLowerCase())
  );
  const grouped = groupHistory(filteredHistory);

  return (
    <div className={`layout ${sidebarOpen ? "sidebar-open" : ""}`}>

      <InstallPrompt />

      {/* Hidden file input for image upload (one per day) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleImagePick}
      />

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
          <div className="sidebar-footer">
            <button className="clear-history" onClick={exportHistory}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export history
            </button>
            <button className="clear-history" onClick={() => { setHistory([]); setResult(null); localStorage.removeItem(STORAGE_KEY); }}>
              Clear history
            </button>
          </div>
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
        </header>

        {/* About modal */}
        {aboutOpen && (
          <div className="modal-overlay" onClick={() => setAboutOpen(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setAboutOpen(false)}>✕</button>
              <h2 className="modal-title">About Vegan Q&A</h2>
              <p>This is an AI chatbot powered by a large language model (LLM), grounded in the work of abolitionist vegan thinkers.</p>
              <p>It is designed to help activists, advocates, and curious people explore questions about veganism, animal use, outreach, and the philosophy behind the movement.</p>
              <p>While every answer is shaped by carefully researched principles, this tool is still in beta — answers may not always be 100% accurate. The bot is continuously reviewed and updated by real humans who hold the abolitionist position.</p>
              <p className="modal-footer-note">If you notice an answer that feels off, use the <strong>Submit for review</strong> button at the bottom of the answer — it will be checked and updated by a real person.</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="content" ref={contentRef}>
          {view === "reply" ? (
            <ReplyHelper />
          ) : (<>
          {/* Hero — always visible at the top */}
          <div className={`empty-state ${result || loading || error ? "compact" : ""}`}>
            <h1 className="hero-title">Ask me anything<span className="hero-title-sub">(about veganism)</span></h1>

            {image && (
              <div className="img-attach">
                <img src={image.dataUrl} alt="Attached" />
                <span className="img-name">Image attached</span>
                <button onClick={() => setImage(null)} aria-label="Remove image">✕</button>
              </div>
            )}
            <div className="input-bar centered-input">
              <button
                className="icon-btn plus-btn"
                onClick={openImagePicker}
                disabled={loading}
                title="Upload an image (one per day)"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
              </button>
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
                disabled={loading || (!input.trim() && !image)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              </button>
            </div>

            {imgNotice && (
              <p className="img-notice" onClick={() => setImgNotice(null)}>{imgNotice}</p>
            )}
            {micError && (
              <p className="mic-error" onClick={clearMicError}>{micError}</p>
            )}
          </div>

          {loading && (
            <div className="thinking">
              <div className="thinking-dots">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </div>
              <p className="thinking-label">Thinking through your question…</p>
              <div className="thinking-progress-wrap">
                <div className="thinking-progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="thinking-pct">{Math.round(progress)}%</p>
            </div>
          )}

          {result && !loading && (
            <div className="answer-block">
              <p className="answer-question">{result.question || result.query}</p>
              <p className="answer-body">{result.answer}</p>
              {result.key && <div className="answer-key">{result.key}</div>}
              <div className="answer-actions">
                <button className={`flag-btn ${textCopied ? "flagged" : ""}`} onClick={copyAnswer}>
                  {textCopied ? "✓ Copied!" : "⎘ Copy answer"}
                </button>
                <button className={`flag-btn ${flagged ? "flagged" : ""}`} onClick={flagAnswer} disabled={flagged}>
                  {flagged ? "✓ Submitted for review" : "⚑ Submit for review"}
                </button>
                <button className={`flag-btn ${copied ? "flagged" : ""}`} onClick={shareAnswer}>
                  {copied ? "✓ Link copied!" : "🔗 Share answer"}
                </button>
              </div>
            </div>
          )}

          {error && <p className="error-text">{error}</p>}
          </>)}
        </div>

        {/* Follow-up bar removed — conversational memory is disabled, so there is no
            multi-turn context to follow up on. Ask a new question via the input at the top
            (always visible). This also removes the reserved black strip at the bottom that
            was covering the lower part of the answer. */}
      </div>
    </div>
  );
}
