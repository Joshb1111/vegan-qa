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

    // Already installed? Don't bother them.
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
        background: "rgba(0,0,0,0.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <div
        style={{
          background: "#1e1c1a",
          border: "3px solid #c0392b",
          padding: "26px 22px 22px",
          maxWidth: "360px",
          width: "100%",
          position: "relative",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          fontFamily: "ui-monospace, 'IBM Plex Mono', monospace",
          color: "#f7f3ee",
        }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          style={{
            position: "absolute",
            top: 8,
            right: 10,
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
          width={56}
          height={56}
          style={{ display: "block", margin: "0 auto 12px", borderRadius: 12 }}
        />

        <h3
          id="install-prompt-title"
          style={{
            fontFamily: "'Archivo Black', sans-serif",
            fontSize: "1.1rem",
            letterSpacing: "0.02em",
            color: "#f7f3ee",
            textAlign: "center",
            margin: "0 0 4px",
          }}
        >
          Install Vegan Chat
        </h3>
        <p
          style={{
            fontSize: "0.7rem",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(247,243,238,0.6)",
            textAlign: "center",
            margin: "0 0 16px",
          }}
        >
          Add it to your home screen in 3 steps:
        </p>
        <ol
          style={{
            fontSize: "0.82rem",
            lineHeight: 1.55,
            color: "rgba(247,243,238,0.85)",
            paddingLeft: "1.25rem",
            margin: "0 0 14px",
          }}
        >
          <li style={{ padding: "5px 0" }}>
            Tap the <strong style={{ color: "#fff" }}>Share</strong> icon at the
            bottom of Safari.
          </li>
          <li style={{ padding: "5px 0" }}>
            Scroll down and tap{" "}
            <strong style={{ color: "#fff" }}>Add to Home Screen</strong>.
          </li>
          <li style={{ padding: "5px 0" }}>
            Tap <strong style={{ color: "#fff" }}>Add</strong> in the top right.
          </li>
        </ol>
        <p
          style={{
            fontSize: "0.7rem",
            lineHeight: 1.5,
            color: "rgba(247,243,238,0.5)",
            textAlign: "center",
            borderTop: "1px solid rgba(247,243,238,0.1)",
            paddingTop: 10,
            margin: 0,
          }}
        >
          Make sure you're using <strong style={{ color: "#fff" }}>Safari</strong>{" "}
          — Chrome on iPhone can't install web apps.
        </p>
      </div>
    </div>
  );
}
