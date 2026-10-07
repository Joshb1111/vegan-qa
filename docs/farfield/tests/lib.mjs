// Far Field test helpers: ONE headless Chrome on $PORT (default 9921; devtools $PORT + 100). The game is driven through window.__ff
// (frames stepped by hand: headless rAF is throttled) and, for the "real input path", CDP key events.
import { launch, sleep } from './cdp.mjs'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
export { sleep };
export const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out'); fs.mkdirSync(OUT, { recursive: true });
export const PROGRESS = process.env.PROGRESS_DIR || null;   // copy chosen shots there (progress shots for Josh)
export const KEYS = { Enter: 13, Escape: 27, Space: 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, KeyM: 77, KeyN: 78, KeyP: 80, KeyQ: 81, ShiftLeft: 16 };
export async function waitLoad() { for (let i = 0; i < 10; i++) { const l = os.loadavg()[0]; if (l <= 25) return; console.log('load', l.toFixed(1), 'waiting 60 s'); await sleep(60000); } }
export async function boot(opts = {}) {
  await waitLoad();
  const b = await launch({ w: opts.w || 1280, h: opts.h || 640, gpu: true, port: +(process.env.PORT || 9921), dport: +(process.env.PORT || 9921) + 100 });
  await b.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__probe = { ac: 0, set: [] };
    for (const n of ['AudioContext', 'webkitAudioContext']) { const C = window[n]; if (!C) continue; window[n] = class extends C { constructor(...a) { super(...a); window.__probe.ac++; } }; }
    Object.defineProperty(Document.prototype, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true });
    document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
    /* tests step the game faster than real time: UI screen fades (CSS, real time) would linger over later frames */
    if (!window.__keepFades) document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#ui .scr{transition:none!important}'; document.head.appendChild(st); });
    const si = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { window.__probe.set.push(k + '=' + v); return si.call(this, k, v); };
  ` });
  await b.nav('/farfield/index.html' + (opts.q != null ? '?' + opts.q : '?q=high&mute=1&seed=1'), 'window.__ff && __ff.ready === true', 120000);
  await sleep(300);
  if (opts.pause !== false) await b.ev('__ff.pause(); true');
  b.held = new Set();
  b.key = async (k, type) => {   /* type: 'down' | 'up' | undefined (tap) */
    const code = k, key = k === 'Space' ? ' ' : k.startsWith('Key') ? k.slice(3).toLowerCase() : k;
    const p = { code, key, windowsVirtualKeyCode: KEYS[k] || 0, nativeVirtualKeyCode: KEYS[k] || 0 };
    const text = k === 'Enter' ? '\r' : key.length === 1 ? key : '';
    if (type !== 'up') await b.cdp('Input.dispatchKeyEvent', text ? { type: 'keyDown', text, unmodifiedText: text, ...p } : { type: 'rawKeyDown', ...p });
    if (type !== 'down') await b.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  };
  /* make the held key set equal `want` (array of codes) via real key events */
  b.setKeys = async want => { const w = new Set(want); for (const k of [...b.held]) if (!w.has(k)) { await b.key(k, 'up'); b.held.delete(k); } for (const k of w) if (!b.held.has(k)) { await b.key(k, 'down'); b.held.add(k); } };
  return b;
}
export function save(name, obj) { fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(obj, null, 1)); }
export async function shot(b, name, progress, opts = {}) {
  if (opts.hideUI) await b.ev("(() => { const u = document.getElementById('ui'); if (u) u.style.visibility = 'hidden'; return true })()");
  const f = path.join(OUT, name + '.jpg'); await b.shot(f, opts.q || 84);
  if (opts.hideUI) await b.ev("(() => { const u = document.getElementById('ui'); if (u) u.style.visibility = ''; return true })()");
  if (progress && PROGRESS) { fs.mkdirSync(PROGRESS, { recursive: true }); const dst = path.join(PROGRESS, progress); fs.copyFileSync(f, dst); const sz = fs.statSync(dst).size; if (sz > 400000) console.log('WARN big shot', dst, sz); }
  return f;
}
