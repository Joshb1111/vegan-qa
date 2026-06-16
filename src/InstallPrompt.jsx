import { useEffect, useState } from "react";

/**
 * Shows iOS "Add to Home Screen" instructions when the visitor arrives
 * with ?install=1 — i.e. they tapped the Install button on
 * understand-veganism.com/chat from an iPhone, which redirected them here.
 *
 * Hidden if the visitor is already in standalone mode (PWA installed),
 * or after they tap dismiss.
 */
export default function InstallPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("install") !== "1") return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) return;

    setOpen(true);
  }, []);

  if (!open) return null;

  const close = () => setOpen(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-prompt-title"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          background: "#1e1c1a",
          border: "3px solid #c0392b",
          padding: "26px 22px 22px",
          maxWidth: "380px",
          width: "100%",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          fontFamily: "ui-monospace, 'IBM Plex Mono', monospace",
          color: "#f7f3ee",
          margin: "auto",
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          style={{
            position: "absolute",
            top: 6,
            right: 8,
            background: "none",
            border: 0,
            color: "rgba(247,243,238,0.6)",
            fontSize: "1.8rem",
            lineHeight: 1,
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ×
        </button>

        <img
          src="/icon-192.png"
          alt=""
          width={52}
          height={52}
          style={{ display: "block", margin: "0 auto 10px", borderRadius: 11 }}
        />

        <div
          id="install-prompt-title"
          style={{
            fontFamily: "'Archivo Black', sans-serif",
            fontSize: "1.05rem",
            letterSpacing: "0.02em",
            color: "#f7f3ee",
            textAlign: "center",
            margin: "0 0 3px",
          }}
        >
          Install Vegan Chat
        </div>
        <div
          style={{
            fontSize: "0.68rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(247,243,238,0.55)",
            textAlign: "center",
            margin: "0 0 18px",
          }}
        >
          Two taps in Safari to add it as an app
        </div>

        {/* ─── Step 1 ─── */}
        <Step
          number={1}
          label={<>Tap the <strong style={{ color: "#fff" }}>Share</strong> icon.</>}
        >
          <SafariToolbarSvg />
        </Step>

        {/* ─── Step 2 ─── */}
        <Step
          number={2}
          label={<>Tap <strong style={{ color: "#fff" }}>Add to Home Screen</strong>.</>}
        >
          <ShareSheetSvg />
        </Step>

        <p
          style={{
            fontSize: "0.66rem",
            lineHeight: 1.5,
            color: "rgba(247,243,238,0.5)",
            textAlign: "center",
            borderTop: "1px solid rgba(247,243,238,0.1)",
            paddingTop: 10,
            margin: "14px 0 0",
          }}
        >
          Make sure you're using <strong style={{ color: "#fff" }}>Safari</strong>
          {" "}— Chrome on iPhone can't install web apps.
        </p>
      </div>
    </div>
  );
}

function Step({ number, label, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderTop: number === 1 ? "1px solid rgba(247,243,238,0.08)" : "none",
        borderBottom: "1px solid rgba(247,243,238,0.08)",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          flex: "0 0 auto",
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "#c0392b",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Archivo Black', sans-serif",
          fontSize: "0.78rem",
        }}
      >
        {number}
      </div>
      <div style={{ fontSize: "0.78rem", lineHeight: 1.5, color: "rgba(247,243,238,0.85)", flex: 1 }}>
        {label}
      </div>
      <div style={{ flex: "0 0 auto" }}>{children}</div>
    </div>
  );
}

/**
 * Mock of Safari's bottom toolbar with the Share icon highlighted by a red
 * pulsing ring. Built as an SVG so it stays crisp at any density and
 * doesn't require an image asset.
 */
function SafariToolbarSvg() {
  return (
    <svg
      width="120"
      height="50"
      viewBox="0 0 240 100"
      aria-hidden="true"
      role="img"
    >
      {/* Toolbar background */}
      <rect x="2" y="2" width="236" height="96" rx="18" fill="#2a2a2a" stroke="rgba(255,255,255,0.08)" />
      {/* Back arrow */}
      <polyline points="32,50 22,42 22,58 32,50" fill="rgba(255,255,255,0.55)" />
      <line x1="22" y1="50" x2="42" y2="50" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeLinecap="round" />
      {/* Forward arrow (disabled-ish) */}
      <polyline points="68,50 78,42 78,58 68,50" fill="rgba(255,255,255,0.22)" />
      <line x1="58" y1="50" x2="78" y2="50" stroke="rgba(255,255,255,0.22)" strokeWidth="3" strokeLinecap="round" />
      {/* SHARE button — highlighted */}
      <g>
        <rect x="105" y="38" width="30" height="30" rx="5" fill="none" stroke="#fff" strokeWidth="3" />
        <line x1="120" y1="20" x2="120" y2="55" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <polyline points="110,30 120,20 130,30" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* Red highlight ring */}
      <circle cx="120" cy="48" r="32" fill="none" stroke="#c0392b" strokeWidth="4">
        <animate attributeName="r" values="28;36;28" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.4;1" dur="1.6s" repeatCount="indefinite" />
      </circle>
      {/* Bookmark */}
      <path d="M 168 36 L 168 64 L 178 56 L 188 64 L 188 36 Z" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeLinejoin="round" />
      {/* Tabs */}
      <rect x="208" y="38" width="18" height="22" rx="2" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="3" />
      <rect x="214" y="44" width="18" height="22" rx="2" fill="#2a2a2a" stroke="rgba(255,255,255,0.55)" strokeWidth="3" />
    </svg>
  );
}

/**
 * Mock of Safari's share-sheet menu with "Add to Home Screen" highlighted
 * by a red pulsing ring on the + icon.
 */
function ShareSheetSvg() {
  return (
    <svg
      width="120"
      height="86"
      viewBox="0 0 240 170"
      aria-hidden="true"
      role="img"
    >
      {/* Sheet background */}
      <rect x="2" y="2" width="236" height="166" rx="16" fill="#f0eee9" stroke="rgba(0,0,0,0.08)" />
      {/* Row: Copy */}
      <g opacity="0.55">
        <rect x="22" y="18" width="20" height="18" rx="2" fill="none" stroke="#222" strokeWidth="2.4" />
        <rect x="28" y="24" width="20" height="18" rx="2" fill="#f0eee9" stroke="#222" strokeWidth="2.4" />
        <text x="62" y="34" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontWeight="500" fontSize="14" fill="#222">Copy</text>
      </g>
      <line x1="22" y1="52" x2="220" y2="52" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      {/* Row: Add to Bookmarks */}
      <g opacity="0.55">
        <path d="M 24 58 L 24 80 L 34 72 L 44 80 L 44 58 Z" fill="none" stroke="#222" strokeWidth="2.4" strokeLinejoin="round" />
        <text x="62" y="74" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontWeight="500" fontSize="14" fill="#222">Add to Bookmarks</text>
      </g>
      <line x1="22" y1="92" x2="220" y2="92" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      {/* Row: Add to Home Screen — highlighted */}
      <g>
        <rect x="22" y="100" width="24" height="24" rx="5" fill="none" stroke="#222" strokeWidth="2.6" />
        <line x1="34" y1="106" x2="34" y2="118" stroke="#222" strokeWidth="2.6" strokeLinecap="round" />
        <line x1="28" y1="112" x2="40" y2="112" stroke="#222" strokeWidth="2.6" strokeLinecap="round" />
        <text x="62" y="116" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontWeight="700" fontSize="14" fill="#000">Add to Home Screen</text>
      </g>
      {/* Red highlight ring around the row */}
      <rect x="14" y="96" width="212" height="34" rx="8" fill="none" stroke="#c0392b" strokeWidth="3">
        <animate attributeName="stroke-width" values="2;4;2" dur="1.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;0.5;1" dur="1.6s" repeatCount="indefinite" />
      </rect>
      {/* Row: Markup */}
      <line x1="22" y1="142" x2="220" y2="142" stroke="rgba(0,0,0,0.1)" strokeWidth="1" />
      <g opacity="0.4">
        <circle cx="34" cy="156" r="11" fill="none" stroke="#222" strokeWidth="2.4" />
        <path d="M 30 156 L 38 152" stroke="#222" strokeWidth="2.4" strokeLinecap="round" />
        <text x="62" y="161" fontFamily="-apple-system, BlinkMacSystemFont, sans-serif" fontWeight="500" fontSize="14" fill="#222">Markup</text>
      </g>
    </svg>
  );
}
