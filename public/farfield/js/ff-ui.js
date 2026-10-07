/* FAR FIELD — ff-ui.js: FF.UI, every DOM screen, quiet and small, in the game's palette (charcoal, blue-grey, one pale ink):
   the content notice (the game's FIRST screen, every launch, SEQUENCE-1 §17), the title over the live scene (A5), pause
   (Resume / Restart from checkpoint / Sound / Music / Back to the arcade), the first-time control hints (small key caps
   that sit just above the rabbit and fade when used or after 4 s; never in the Search; none with ?clean=1), the end card
   ("to be continued", with the held chord), and messages (the picture was lost). No text in play beyond the hints; no
   counters, nothing that rewards harm.
   The cut to black is NOT here: it is post's in-pass fade (FF.Game.cut / fade), so it lands on the exact frame; the UI only
   makes sure nothing of its own shows over the black (a hint is dropped the instant a failure starts).
   OWNER: the audio + UI + room builder. API contract: docs/farfield/INTERFACES.md §8.9.
   Keys outside play come through key(code, mode) (main asks first): the notice and pause menus move with the arrows and
   act on Enter / Space; Esc on the notice or title is main's 'exit' (inside the arcade); a standalone page (no parent
   frame) shows no "Back to the arcade" and offers "Back to the title" in pause instead. */
'use strict';
window.FF = window.FF || {};
(function () {
let root = null, el = {}, titleSel = 0, titleSave = null, pendingHint = null, hintNow = null, pauseSel = 0, endState = null, titleT = 0, noticeT = 0;
const seenHints = {};
const K = s => '<kbd>' + s + '</kbd>';
const HINTS = {
  move: K('←') + K('→') + ' move',
  run: K('Shift') + ' + ' + K('→') + ' run',
  jump: K('Space') + ' jump',
  push: K('→') + ' push',
  'go-in': K('↑') + ' go in',
};
const NOTICE = 'Far Field contains pursuit, capture and non-graphic violence towards the rabbit. If the rabbit is caught or shot, the screen cuts to black and you continue from nearby. No injury is shown.';
const SAVES = { courtyard: 'the Courtyard', 'search-arrive': 'the Search', rest: 'the breathing space' };
const inFrame = (() => { try { return window.parent !== window; } catch (_) { return true; } })();
const CSS = `
#ui{position:absolute;inset:0;pointer-events:none;z-index:2;font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#aab4be;letter-spacing:.02em;-webkit-font-smoothing:antialiased}
#ui .scr{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;text-align:center;opacity:0;transition:opacity .6s ease}
#ui .scr.on{display:flex}#ui .scr.vis{opacity:1}
#ui .cap{font-size:11.5px;font-weight:500;letter-spacing:.32em;text-transform:uppercase;color:#7f8b97}
#ui button{font:inherit;font-size:14px;letter-spacing:.04em;color:#c6ced6;background:rgba(12,15,18,.35);border:1px solid #39424b;border-radius:2px;padding:8px 18px;margin:0 6px;cursor:pointer;pointer-events:auto;transition:border-color .2s,color .2s,background .2s}
#ui button:hover,#ui button:focus-visible,#ui button.sel{border-color:#9aa6b2;color:#eef1f3;background:rgba(40,46,52,.35);outline:none}
#ui .foot{position:absolute;left:0;right:0;bottom:18px;font-size:12px;color:#7d8994;letter-spacing:.06em;text-shadow:0 1px 2px rgba(0,0,0,.85)}
#ui kbd{display:inline-block;min-width:1.55em;padding:0 .4em;margin:0 .14em;border:1px solid rgba(198,206,214,.42);border-bottom-width:2px;border-radius:3px;font:11.5px/1.65 ui-monospace,SFMono-Regular,Menlo,monospace;color:#dfe5ea;background:rgba(8,10,12,.32);text-align:center;vertical-align:1px}
#ui i{font-style:normal;color:#6e7a85;padding:0 .25em}
/* the content notice: plain text on near-black */
#ui .notice{background:#07090b;pointer-events:auto;transition:opacity .5s ease}
#ui .notice .cap{margin-bottom:18px}
#ui .notice p{max-width:33em;margin:0 24px 30px;color:#a3aeb9;font-size:15.5px;line-height:1.7}
#ui .notice .row{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
#ui .notice .row button{margin:0}
#ui .notice .small{margin-top:26px;font-size:12px;color:#5f6b76;letter-spacing:.05em}
/* the title over the live scene */
#ui .title{justify-content:flex-start;padding-top:15vh;background:radial-gradient(ellipse 62% 40% at 50% 26%,rgba(4,6,8,.62),rgba(4,6,8,.25) 55%,rgba(4,6,8,0) 80%);transition:opacity 1.5s ease}
#ui .title h1{font-weight:200;font-size:clamp(26px,5.2vw,58px);letter-spacing:.62em;margin:0 0 0 .62em;color:rgba(236,239,241,.72);text-shadow:0 2px 18px rgba(0,0,0,.45)}
#ui .title .keys{margin-top:26px;font-size:13px;color:#b4bec7;text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 10px rgba(0,0,0,.6)}
#ui .title .go{margin-top:14px;font-size:13.5px;color:#d3dae0;letter-spacing:.08em;text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 10px rgba(0,0,0,.6);animation:ffbreathe 3.2s ease-in-out infinite}
#ui .title .cont{margin-top:10px;font-size:13px;color:#9aa6b2;text-shadow:0 1px 2px rgba(0,0,0,.9),0 0 10px rgba(0,0,0,.6)}
#ui .title .cont.sel{color:#e6ebef}#ui .title .cont.sel:before{content:'› ';color:#9aa6b2}
#ui .title .go.dim{animation:none;opacity:.55}
@keyframes ffbreathe{0%,100%{opacity:.55}50%{opacity:1}}
/* pause */
#ui .pause{background:rgba(5,7,9,.68);pointer-events:auto;transition:opacity .2s ease}
#ui .pause .cap{margin-bottom:18px}
#ui .pause .menu{display:flex;flex-direction:column;gap:8px;min-width:240px}
#ui .pause .menu button{margin:0;text-align:left;padding:8px 16px}
#ui .pause .menu .set{display:flex;gap:8px}#ui .pause .menu .set button{flex:1;font-size:13px;color:#9aa6b2;white-space:nowrap}#ui .pause .menu button:disabled{opacity:.45;cursor:default}
#ui .pause .menu .set button.sel,#ui .pause .menu .set button:hover{color:#eef1f3}
/* the end card */
#ui .end{background:#000;transition:opacity .3s}
#ui .end span{font-size:14px;letter-spacing:.14em;color:#8e959c;opacity:0;transition:opacity 1s ease}
#ui .end span.vis{opacity:1}
/* hints: just above the rabbit */
#ui .hint{position:absolute;left:0;top:0;white-space:nowrap;font-size:12.5px;color:#d8dee3;letter-spacing:.04em;padding:3px 10px 4px;border-radius:13px;background:rgba(7,9,11,.5);box-shadow:0 0 14px 2px rgba(7,9,11,.28);text-shadow:0 1px 2px rgba(0,0,0,.8);opacity:0;transition:opacity .6s ease;will-change:transform}
#ui .hint.vis{opacity:.92}
#ui.paused .hint{opacity:0;transition:none}
#ui .msg{background:rgba(5,7,9,.85);pointer-events:auto;cursor:pointer;color:#c6ced6}
`;
function div(cls, html, parent) { const d = document.createElement('div'); d.className = cls; if (html != null) d.innerHTML = html; (parent || root).appendChild(d); return d; }
function btn(label, cmd, parent) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.cmd = cmd;
  b.addEventListener('click', e => { e.preventDefault(); act(cmd); }); if (parent) parent.appendChild(b); return b;
}
function act(cmd) {
  if (cmd === 'sound') { FF.Game.setMute(!FF.G.muted); return; }
  if (cmd === 'music') { FF.Game.setMusic(!FF.G.music); return; }
  const i = cmd.indexOf(':'); if (i > 0) FF.Game.command(cmd.slice(0, i), cmd.slice(i + 1)); else FF.Game.command(cmd);
}
const show = (e, on) => {
  clearTimeout(e._t);
  if (on) { e.classList.add('on'); void e.offsetWidth; e.classList.add('vis'); }
  else { e.classList.remove('vis'); const d = parseFloat(getComputedStyle(e).transitionDuration) || 0; e._t = setTimeout(() => e.classList.remove('on'), d * 1000 + 30); }
};
const focusGame = () => { try { const a = document.activeElement; if (a && a.blur && root.contains(a)) a.blur(); const c = document.getElementById('c'); if (c) c.focus({ preventScroll: true }); } catch (_) {} };
const noticeBtns = () => [...el.notice.querySelectorAll('button')].filter(b => !b.hidden);
const pauseBtns = () => [...el.pause.querySelectorAll('button')];
function markPause(i) { const b = pauseBtns(); pauseSel = (i + b.length) % b.length; b.forEach((x, k) => x.classList.toggle('sel', k === pauseSel)); }
function setLabels() {
  if (!el.snd) return;
  const silent = FF.SILENT;
  el.snd.textContent = 'Sound ' + (silent || FF.G.muted ? 'off' : 'on') + (silent ? '' : '  ·  M');
  el.mus.textContent = 'Music ' + (FF.G.music ? 'on' : 'off') + '  ·  N';
  el.mus.title = 'the music and the ambience (the sound cues stay)';
  el.snd.disabled = !!silent; el.snd.title = silent ? 'this page was opened muted (?mute=1)' : 'all sound';
}
/* where the rabbit is on screen (px), for the hints */
function rabbitScreen() {
  const r = FF.G.rabbit, cam = FF.Game && FF.Game.camera; if (!r || !cam || !window.THREE) return null;
  cam.updateMatrixWorld();   /* fresh matrices: the camera may have moved since the last draw */
  const v = new THREE.Vector3(r.x, r.y + 0.5, 0).project(cam), w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
  if (v.z > 1) return null;
  return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h, w, h };
}
function dropHint(now) { if (!hintNow) return; el.hint.classList.remove('vis'); hintNow = null; void now; }

const UI = FF.UI = {
  stub: false,
  init() {
    root = document.getElementById('ui'); if (!root) { root = document.createElement('div'); root.id = 'ui'; document.body.appendChild(root); }
    const s = document.createElement('style'); s.id = 'ff-ui-css'; s.textContent = CSS; document.head.appendChild(s);
    /* the content notice */
    el.notice = div('scr notice', `<div class="cap">Content notice</div><p>${NOTICE}</p>`);
    el.notice.setAttribute('role', 'dialog'); el.notice.setAttribute('aria-label', 'Content notice');
    const row = div('row', null, el.notice); btn('Continue', 'continue', row); const back = btn('Back to the arcade', 'exit', row); back.hidden = !inFrame;
    const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);
    div('small', (coarse ? 'Far Field needs a keyboard or a gamepad. ' : '') + 'Enter to continue' + (inFrame ? ' · Esc to go back' : '') + (FF.SILENT ? '' : ' · best with sound (M)'), el.notice);
    /* the title */
    el.title = div('scr title', `<h1>FAR FIELD</h1><div class="keys">${K('←')}${K('→')} move <i>·</i> ${K('Shift')} run <i>·</i> ${K('Space')} jump <i>·</i> ${K('↓')} crouch</div><div class="go">press ${K('→')} to begin</div><div class="cont"></div>`);
    div('foot', (FF.SILENT ? '' : 'M sound <i>·</i> N music <i>·</i> ') + 'Esc pause' + (inFrame ? ' <i>·</i> Esc here: back to the arcade' : ''), el.title);
    el.title.querySelector('.cont').addEventListener('click', () => { if (titleSave) act('start:' + titleSave); });
    /* pause */
    el.pause = div('scr pause', '<div class="cap">Paused</div>');
    const menu = div('menu', null, el.pause);
    btn('Resume', 'resume', menu); btn('Restart from checkpoint', 'restart', menu);
    const set = div('set', null, menu); el.snd = btn('Sound', 'sound', set); el.mus = btn('Music', 'music', set);
    btn(inFrame ? 'Back to the arcade' : 'Back to the title', inFrame ? 'exit' : 'title', menu);
    pauseBtns().forEach((b, i) => b.addEventListener('mouseenter', () => markPause(i)));
    div('foot', 'Esc or P to resume <i>·</i> ↑ ↓ and Enter', el.pause);
    /* the end card, messages, the hint */
    el.end = div('scr end', '<span>to be continued</span>');
    el.msg = div('scr msg', '');
    el.hint = div('hint', '');
    /* hints come from Level triggers; never over the black, never in the Search */
    FF.bus.on('hint', d => UI.hint(d && d.arg));
    FF.bus.on('play:start', () => { if (pendingHint) { const h = pendingHint; pendingHint = null; UI.hint(h); } });
    FF.bus.on('place', d => { if (d && d.id === 'search') dropHint(); });
    FF.bus.on('fail', () => { el.hint.style.transition = 'none'; dropHint(); void el.hint.offsetWidth; el.hint.style.transition = ''; });
    FF.bus.on('transit', () => dropHint());
    FF.bus.on('mute', setLabels); FF.bus.on('music', setLabels);
    setLabels();
  },
  showNotice() { show(el.notice, true); noticeT = performance.now(); const b = noticeBtns()[0]; if (b) try { b.focus({ preventScroll: true }); } catch (_) {} },
  hideNotice() { if (el.notice.classList.contains('on')) { show(el.notice, false); focusGame(); } },
  showTitle(o) {
    titleSave = o && o.save && SAVES[o.save] ? o.save : null; titleSel = 0; titleT = performance.now();
    const c = el.title.querySelector('.cont');
    c.innerHTML = titleSave ? 'Continue from ' + SAVES[titleSave] + ' <i>' + K('↓') + '</i>' : ''; c.classList.remove('sel'); c.style.pointerEvents = titleSave ? 'auto' : 'none'; c.style.cursor = 'pointer';
    el.title.querySelector('.go').classList.remove('dim');
    show(el.title, true);
  },
  hideTitle() { if (el.title.classList.contains('on')) show(el.title, false); },
  showPause() { setLabels(); markPause(0); show(el.pause, true); root.classList.add('paused'); },
  hidePause() { root.classList.remove('paused'); if (el.pause.classList.contains('on')) { show(el.pause, false); focusGame(); } },
  /* keys outside play: a command string ('continue', 'start', 'start:<cp>', 'resume', 'restart', 'exit', 'title'), true
     (consumed) or null (main's default) */
  key(code, mode) {
    if (mode === 'notice') {
      const b = noticeBtns(), i = b.indexOf(document.activeElement);
      if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Tab)$/.test(code)) { const n = b[((i < 0 ? 0 : i) + (/Left|Up/.test(code) ? -1 : 1) + b.length) % b.length]; if (n) try { n.focus({ preventScroll: true }); } catch (_) {} return true; }
      if (code === 'Enter' || code === 'Space') return i >= 0 ? b[i].dataset.cmd : 'continue';
      if (code === 'Escape') return inFrame ? 'exit' : true;
      return null;
    }
    if (mode === 'title') {
      if (titleSave && /^(ArrowDown|ArrowUp|KeyS|KeyW)$/.test(code)) { titleSel = titleSel ? 0 : 1; el.title.querySelector('.cont').classList.toggle('sel', !!titleSel); el.title.querySelector('.go').classList.toggle('dim', !!titleSel); return true; }
      if ((code === 'Enter' || code === 'Space') && titleSel && titleSave) return 'start:' + titleSave;
      if (code === 'Escape' && !inFrame) return true;
      return null;
    }
    if (mode === 'pause') {
      if (/^(ArrowDown|ArrowUp|KeyS|KeyW|Tab)$/.test(code)) { markPause(pauseSel + (/Up|KeyW/.test(code) ? -1 : 1)); return true; }
      if (/^(ArrowLeft|ArrowRight)$/.test(code)) { const b = pauseBtns()[pauseSel]; if (b && (b === el.snd || b === el.mus)) markPause(pauseSel + (b === el.snd ? 1 : -1)); return true; }
      if (code === 'Enter' || code === 'Space') { const b = pauseBtns()[pauseSel]; if (!b) return null; if (b === el.snd || b === el.mus) { act(b.dataset.cmd); return true; } return b.dataset.cmd; }
      if (code === 'KeyR') return 'restart';
      return null;
    }
    if (mode === 'end') { if (endState && performance.now() - endState.t0 > 1000) endState.skip(); return true; }
    return null;
  },
  /* first time only; never in the Search; none with ?clean=1; shown once play has started */
  hint(id) {
    const G = FF.G;
    if (!id || G.clean || seenHints[id] || !HINTS[id] || G.place === 'search' || G.place === 'rest') return;
    if (G.mode !== 'play') { pendingHint = id; return; }
    seenHints[id] = true;
    const r = G.rabbit, b = G.box;
    hintNow = { id, t0: G.frameT || 0, x0: r ? r.x : 0, bx: b ? b.x : 0, sx: null, sy: null };
    el.hint.innerHTML = HINTS[id]; void el.hint.offsetWidth;
    UI.frame(0); el.hint.classList.add('vis');
  },
  /* the end card: 0.5 s of black and silence, then "to be continued" fades in 1.0 s with the held chord, holds 3.5 s, fades
     out 1.0 s. Any key skips after 1 s. Resolves when done (main then returns to the title). */
  endCard() {
    dropHint();
    return new Promise(res => {
      const sp = el.end.querySelector('span'), T = [];
      const finish = () => { T.forEach(clearTimeout); sp.classList.remove('vis'); endState = null; T.push(setTimeout(() => { el.end.classList.remove('on', 'vis'); res(); }, 1000)); };
      endState = { t0: performance.now(), skip: () => { if (endState) { endState.skip = () => {}; finish(); } } };
      el.end.classList.add('on', 'vis'); sp.classList.remove('vis');
      T.push(setTimeout(() => { void sp.offsetWidth; sp.classList.add('vis'); if (FF.Audio && FF.Audio.endChord) FF.Audio.endChord(); }, 500));
      T.push(setTimeout(() => { if (endState) endState.skip(); }, 500 + 1000 + 3500));
    });
  },
  message(text, onClick) { el.msg.textContent = text; show(el.msg, true); el.msg.onclick = () => { show(el.msg, false); if (onClick) onClick(); }; },
  reset(cp, opts) { if (opts && opts.reason !== 'title') dropHint(); },
  /* the hint follows the rabbit (just above it, inside the frame) and goes once it has been used or after 4 s */
  frame() {
    if (!hintNow) return;
    const G = FF.G, r = G.rabbit, now = G.frameT || 0, age = now - hintNow.t0, h = hintNow;
    if (G.mode !== 'play' && G.mode !== 'pause') { dropHint(); return; }
    let used = false;
    if (r) {
      if (h.id === 'move') used = Math.abs(r.x - h.x0) > 1.6;
      else if (h.id === 'jump') used = !r.grounded && (r.vy || 0) > 0.2;
      else if (h.id === 'push') used = !!(G.box && Math.abs(G.box.x - h.bx) > 0.25);
      else if (h.id === 'go-in') used = r.mode === 'climb' || r.mode === 'transit';
    }
    if (age > 4.0 || (used && age > 1.2) || G.place === 'search') { dropHint(); return; }
    const p = rabbitScreen(); if (!p) return;
    const w = el.hint.offsetWidth || 120, hh = el.hint.offsetHeight || 20, m = 16;
    const tx = clampN(p.x - w / 2, m, p.w - w - m), ty = clampN(p.y - hh - 10, m, p.h - hh - m);
    h.sx = h.sx == null ? tx : h.sx + (tx - h.sx) * 0.25; h.sy = h.sy == null ? ty : h.sy + (ty - h.sy) * 0.25;
    el.hint.style.transform = `translate(${h.sx.toFixed(1)}px,${h.sy.toFixed(1)}px)`;
  },
  dispose() { const s = document.getElementById('ff-ui-css'); if (s) s.remove(); },
  debug() {
    return { stub: false, screens: Object.keys(el).filter(k => el[k] && el[k].classList && el[k].classList.contains('on')), hint: hintNow && hintNow.id, hints: Object.keys(seenHints), pending: pendingHint,
      titleSave, titleSel, pauseSel, inFrame };
  },
};
const clampN = (v, a, b) => v < a ? a : v > b ? Math.max(a, b) : v;
})();
