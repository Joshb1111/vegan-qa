// shared helpers for the audio + UI + room tests (port 9914, devtools 10014)
import { launch, sleep } from './cdp.mjs';
export { sleep };
export const KEYS = { Enter: 13, Escape: 27, Space: 32, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, KeyM: 77, KeyN: 78, KeyP: 80, KeyR: 82, Tab: 9 };
export async function start(opts = {}) {
  const b = await launch({ w: opts.w || 1280, h: opts.h || 640, gpu: true, port: +(process.env.PORT || 9921), dport: +(process.env.PORT || 9921) + 100 });
  /* counters installed before any page script: AudioContexts made, storage writes */
  await b.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__probe = { ac: 0, oac: 0, set: [] };
    for (const n of ['AudioContext', 'webkitAudioContext']) { const C = window[n]; if (!C) continue; window[n] = class extends C { constructor(...a) { super(...a); window.__probe.ac++; } }; }
    if (window.OfflineAudioContext) { const O = window.OfflineAudioContext; window.OfflineAudioContext = class extends O { constructor(...a) { super(...a); window.__probe.oac++; } }; }
    if (${!!opts.visible}) {   /* headless Chrome marks the page hidden after a moment; the live-audio tests pin it visible */
      Object.defineProperty(Document.prototype, 'hidden', { get: () => false, configurable: true });
      Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true });
      document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
    }
    const si = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { window.__probe.set.push(k + '=' + v); return si.call(this, k, v); };
  ` });
  b.key = async (k, frame) => {
    const code = k, key = k === 'Space' ? ' ' : k.startsWith('Key') ? k.slice(3).toLowerCase() : k;
    const p = { code, key, windowsVirtualKeyCode: KEYS[k] || 0, nativeVirtualKeyCode: KEYS[k] || 0 };
    const text = k === 'Enter' ? '\r' : key.length === 1 ? key : '';
    await b.cdp('Input.dispatchKeyEvent', text ? { type: 'keyDown', text, unmodifiedText: text, ...p } : { type: 'rawKeyDown', ...p });
    await b.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...p });
  };
  b.click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await b.cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
  return b;
}
