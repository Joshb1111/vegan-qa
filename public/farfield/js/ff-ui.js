/* FAR FIELD — ff-ui.js: FF.UI, every DOM screen, all quiet and small: the content notice (the game's FIRST screen, every
   launch, §17), the title over the live scene (A5), pause (Resume / Restart from checkpoint / Back to the arcade), the
   first-time control hints near the bottom-left (never in the Search; none with ?clean=1), the end card ("to be continued"),
   and messages (context lost). No text in play beyond the hints; no counters, nothing that rewards harm.
   The cut to black itself is NOT here: it is post's in-pass fade (FF.Game.cut / fade), so it lands on the exact frame.
   OWNER: the audio + UI + room builder. API contract: docs/farfield/INTERFACES.md §8.9. SKELETON: plain working screens. */
'use strict';
window.FF = window.FF || {};
(function () {
let root = null, el = {}, titleSel = 0, titleSave = null, pendingHint = null;
const seenHints = {};
const HINTS = { move: '← →  move · hold to run', jump: 'Space or ↑  jump', push: '→  push', 'go-in': '↑  go in' };
const NOTICE = 'Far Field contains pursuit, capture and non-graphic violence towards the rabbit. If the rabbit is caught or shot, the screen cuts to black and you continue from nearby. No injury is shown.';
const CSS = `
#ui{position:absolute;inset:0;pointer-events:none;font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:#aab4be;letter-spacing:.02em}
#ui .scr{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;text-align:center;pointer-events:auto}
#ui .scr.on{display:flex}
#ui .notice{background:#07090b}
#ui .notice h2{font-weight:500;font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:#c6ced6;margin:0 0 14px}
#ui .notice p{max-width:520px;margin:0 22px 22px;color:#9aa6b2}
#ui button{font:inherit;color:#c6ced6;background:transparent;border:1px solid #3a434c;border-radius:3px;padding:7px 16px;margin:0 6px;cursor:pointer}
#ui button:focus-visible,#ui button.sel{border-color:#9aa6b2;outline:none}
#ui .title{background:transparent;pointer-events:none;justify-content:flex-start;padding-top:16vh}
#ui .title h1{font-weight:200;font-size:clamp(28px,5vw,54px);letter-spacing:.55em;margin:0 0 0 .55em;color:rgba(236,238,240,.7)}
#ui .title .keys{margin-top:18px;font-size:13px;color:#8a96a2}
#ui .title .go{margin-top:8px;font-size:13px;color:#aab4be}
#ui .title .cont{margin-top:10px;font-size:13px;color:#8a96a2}
#ui .title .cont.sel{color:#dfe4e8}
#ui .pause{background:rgba(6,8,10,.62)}
#ui .pause .row{display:flex;gap:6px;margin-top:12px}
#ui .end{background:#000;color:#9aa0a6;font-size:14px;letter-spacing:.08em;opacity:0;transition:opacity 1s}
#ui .hint{position:absolute;left:18px;bottom:16px;opacity:0;transition:opacity .8s;text-shadow:0 1px 2px #000;color:#b8c2cc;font-size:13px}
#ui .msg{background:rgba(6,8,10,.8);cursor:pointer}
`;
function div(cls, html) { const d = document.createElement('div'); d.className = cls; if (html != null) d.innerHTML = html; root.appendChild(d); return d; }
const btn = (label, cmd) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = () => FF.Game.command(cmd); return b; };

const UI = FF.UI = {
  stub: true,
  init() {
    root = document.getElementById('ui'); if (!root) { root = document.createElement('div'); root.id = 'ui'; document.body.appendChild(root); }
    const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
    el.notice = div('scr notice', `<h2>Content notice</h2><p>${NOTICE}</p>`);
    const row = document.createElement('div'); row.append(btn('Continue', 'continue'), btn('Back to the arcade', 'exit')); el.notice.appendChild(row);
    el.title = div('scr title', `<h1>FAR FIELD</h1><div class="keys">← → move · hold to run · Space or ↑ jump · ↓ crouch</div><div class="go">press → to begin</div><div class="cont"></div>`);
    el.pause = div('scr pause', '<div>Paused</div>'); const pr = document.createElement('div'); pr.className = 'row'; pr.append(btn('Resume', 'resume'), btn('Restart from checkpoint', 'restart'), btn('Back to the arcade', 'exit')); el.pause.appendChild(pr);
    el.end = div('scr end', 'to be continued');
    el.msg = div('scr msg', '');
    el.hint = div('hint', '');
    FF.bus.on('hint', d => UI.hint(d.arg));
    FF.bus.on('play:start', () => { if (pendingHint) { const h = pendingHint; pendingHint = null; seenHints[h] = false; UI.hint(h); } });
    FF.bus.on('place', d => { if (d.id === 'search') el.hint.style.opacity = 0; });
  },
  showNotice() { el.notice.classList.add('on'); const b = el.notice.querySelector('button'); if (b) try { b.focus({ preventScroll: true }); } catch (_) {} },
  hideNotice() { el.notice.classList.remove('on'); },
  showTitle(o) {
    titleSave = o && o.save && o.save !== 'completed' ? o.save : null;
    titleSel = 0; const c = el.title.querySelector('.cont');
    c.textContent = titleSave ? 'Continue from ' + ({ courtyard: 'the Courtyard', 'search-arrive': 'the Search', rest: 'the breathing space' }[titleSave] || titleSave) + ' (↓)' : '';
    c.classList.remove('sel'); el.title.classList.add('on');
  },
  hideTitle() { el.title.classList.remove('on'); },
  showPause() { el.pause.classList.add('on'); },
  hidePause() { el.pause.classList.remove('on'); },
  /* keys outside play: return a command string ('start', 'start:<cp>', 'continue', 'resume', 'restart', 'exit'), true, or null */
  key(code, mode) {
    if (mode === 'title' && titleSave) {
      if (code === 'ArrowDown' || code === 'ArrowUp') { titleSel = titleSel ? 0 : 1; el.title.querySelector('.cont').classList.toggle('sel', !!titleSel); return true; }
      if ((code === 'Enter' || code === 'Space') && titleSel) return 'start:' + titleSave;
    }
    if (mode === 'pause' && code === 'KeyR') return 'restart';
    if (mode === 'end') return true;
    return null;
  },
  /* first time only; never in the Search */
  hint(id) {
    if (FF.G.clean || seenHints[id] || !HINTS[id] || FF.G.place === 'search') return;
    if (FF.G.mode !== 'play') { pendingHint = id; return; }   // shown once play starts, never over the notice or the title
    seenHints[id] = true;
    el.hint.textContent = HINTS[id]; el.hint.style.opacity = 1; clearTimeout(el.hint._t); el.hint._t = setTimeout(() => { el.hint.style.opacity = 0; }, 4000);
  },
  /* the end card: fades in 1.0 s, holds 3.5 s, fades out 1.0 s; resolves when done */
  endCard() { return new Promise(res => { el.end.classList.add('on'); requestAnimationFrame(() => { el.end.style.opacity = 1; }); setTimeout(() => { el.end.style.opacity = 0; setTimeout(() => { el.end.classList.remove('on'); res(); }, 1000); }, 4500); }); },
  message(text, onClick) { el.msg.textContent = text; el.msg.classList.add('on'); el.msg.onclick = () => { el.msg.classList.remove('on'); if (onClick) onClick(); }; },
  reset() {},
  frame() {},
  debug() { return { stub: true, screens: Object.keys(el).filter(k => el[k].classList && el[k].classList.contains('on')), hints: Object.keys(seenHints) }; },
};
})();
