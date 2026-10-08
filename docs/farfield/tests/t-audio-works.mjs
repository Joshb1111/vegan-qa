// Far Field, Sequence 2: the sound of the Works (public/farfield/js/ff-audio-s2.js, the S2 extension of ff-audio.js), headless.
// From the repo root:   node docs/farfield/tests/t-audio-works.mjs        (PORT 9921 by default; one Chrome; ~2 min)
// Needs the integrated page (index.html loading the S2 data, ff-lane, ff-works, ff-painter, ff-works-flow and ff-audio-s2.js);
// PAGE=<path> tests another page (CDP=<driver module> to use another server). The checks (scene layer, ?mute=1):
//   1. the extension is installed; ?mute=1 makes no AudioContext and stores nothing; the console stays clean
//   2. the far thud of Sequence 1 continues every 4.0 s from the rest to the works-start, from the slab on as the long
//      hall's bar (a far clank, then thuds), and hands over to the machines at works-start; no beat is lost or doubled
//   3. the warm pad of Sequence 1's (optional) rest fades out over the slab: no music in the Works
//   4. the Works bot through the press hall and the long hall: every press contact has its thud and every release its clank
//      on the same frame (<= 1 frame), the gate scrapes as P1 comes down and as it rises
//   5. a machine failure: nothing of the Works starts in the black; the fail sound is the muffled contact
//   6. the worker's look: the lamp unhooked and hung back, the rabbit's heartbeat; the splash dropping into the culvert
// RENDER=1 adds an offline render (a real AudioContext) of the first press heard from pit A: a low-band onset within 60 ms
// of every contact, and the stillness quieter than the press's descent.
import fs from 'node:fs'; import path from 'node:path';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const { launch, sleep } = await import(process.env.CDP || './cdp.mjs');
const PORT = +(process.env.PORT || 9921), PAGE = process.env.PAGE || '/farfield/index.html';
let ok = true; const report = (name, pass, detail) => { console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); ok = ok && !!pass; };
const PROBE = `window.__probe = { ac: 0, oac: 0, set: [] };
  for (const n of ['AudioContext', 'webkitAudioContext']) { const C = window[n]; if (!C) continue; window[n] = class extends C { constructor(...a) { super(...a); window.__probe.ac++; } }; }
  if (window.OfflineAudioContext) { const O = window.OfflineAudioContext; window.OfflineAudioContext = class extends O { constructor(...a) { super(...a); window.__probe.oac++; } }; }
  Object.defineProperty(Document.prototype, 'hidden', { get: () => false, configurable: true });
  Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true });
  document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
  const si = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { window.__probe.set.push(k + '=' + v); return si.call(this, k, v); };`;
const HELP = `(() => { const A = ['left', 'right', 'up', 'down', 'jump', 'run'];
  window.__t = { log: [], listen(ns) { for (const n of ns) FF.bus.on(n, d => __t.log.push([n, +FF.G.t.toFixed(4), JSON.parse(JSON.stringify(d || {})), +FF.G.rabbit.x.toFixed(2)])); },
    hold(w) { w = w || {}; for (const a of A) { const on = !!w[a]; if (on && !FF.Input.raw(a)) FF.Input.press(a); FF.Input.hold(a, on); } },
    go(max, plan, pred) { let i = 0; for (; i < max; i++) { const r = FF.G.rabbit; if (pred && pred(r)) break; if (plan) __t.hold(plan(r)); __ff.tick(); } __ff.flush(); return i; } }; return true; })()`;
async function boot(q) {
  const b = await launch({ w: 1280, h: 640, gpu: true, port: PORT, dport: PORT + 100 });
  await b.cdp('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
  await b.nav(PAGE + '?' + q, 'window.__ff && __ff.ready === true', 120000); await sleep(300);
  await b.ev('__ff.pause(); true'); await b.ev(HELP); return b;
}
const b = await boot('cp=rest&seed=1&q=low&mute=1');
try {
  const inst = await b.ev('({ ext: !!FF.AudioS2, s2: FF.Audio.debug().s2, works: !!FF.Works, painter: !!FF.Painter })');
  report('the Sequence 2 sound is installed', inst.ext && inst.s2 && inst.works && inst.painter, JSON.stringify(inst));
  /* 2, 3: the join */
  const J = await b.ev(`(() => { __t.listen(['sound', 'works-start']); FF.AudioS2.log.length = 0;
    __t.go(120 * 8, () => ({}), null); FF.bus.emit('rabbit:pose', { pose: 'groom' }); __t.go(30, () => ({}), null);
    const padRest = FF.Audio.debug().loops.indexOf('pad') >= 0;
    __t.go(120 * 40, () => ({ right: true }), r => r.x > 133.6); __t.go(120 * 6, () => ({ right: true }), null);
    const padGone = FF.Audio.debug().loops.indexOf('pad') < 0;
    const thuds = __t.log.filter(e => e[0] === 'sound' && e[2].src === 'audio' && e[2].cue === 'thud').map(e => e[1]);
    const far = FF.AudioS2.log.filter(e => e.id === 'far').map(e => [e.t, e.cue]), start = __t.log.find(e => e[0] === 'works-start');
    return { padRest, padGone, thuds, far, start: start && start[1], s2: FF.Audio.debug().s2 }; })()`);
  const beats = [...new Set(J.thuds.concat(J.far.map(f => f[0])).map(t => +t.toFixed(2)))].sort((p, q) => p - q), dts = beats.slice(1).map((t, i) => +(t - beats[i]).toFixed(3));
  report('the far beat every 4.0 s from the rest to the works-start', beats.length >= 6 && dts.every(d => Math.abs(d - 4.0) < 0.02), beats.join(' '));
  report('from the slab on it is the long hall\'s bar (a far clank)', J.far.some(f => f[1] === 'press-clank'), JSON.stringify(J.far));
  report('handed over to the machines at works-start', J.start != null && J.s2.started && !J.s2.beat.mine && beats[beats.length - 1] < J.start + 0.01, 'start ' + J.start);
  report('the pad of Sequence 1\'s rest fades out over the slab', J.padRest && J.padGone);
  /* 4: the Works bot through the halls: thuds and clanks on the contacts and releases */
  const bot = fs.readFileSync(path.join(HERE, 'works-bot.js'), 'utf8');
  await b.ev(bot + '; true');
  const M = await b.ev(`(() => { __t.log.length = 0; FF.AudioS2.log.length = 0; __t.listen(['press', 'sluice']); __ff.warp('works-in');
    const plan = __worksBot({ painter: 'wait', line: 'continuous', end: 'none' }); __t.go(120 * 200, r => plan(r), r => r.x > 195.5);
    const P = __t.log.filter(e => e[0] === 'press'), L = FF.AudioS2.log, near = (cue, id, t) => L.some(e => e.cue === cue && e.id === id && Math.abs(e.t - t) <= 0.0171);
    const heard = (cue, id, t) => !L.some(e => e.id === id && Math.abs(e.t - t) < 0.05) || near(cue, id, t);    /* a cue gated as inaudible (too far) is fine */
    const contacts = P.filter(e => e[2].phase === 'contact'), releases = P.filter(e => e[2].phase === 'release');
    const missT = contacts.filter(e => !near('press-thud', e[2].id, e[1]) && FF.AudioS2.log.some(x => x.cue === 'press-thud')).filter(e => Math.abs(e[3] - (e[2].x)) < 30).map(e => e[2].id + '@' + e[1]);
    const missC = releases.filter(e => !near('press-clank', e[2].id, e[1])).filter(e => Math.abs(e[3] - e[2].x) < 30).map(e => e[2].id + '@' + e[1]);
    const sl = L.filter(e => e.cue === 'sluice-scrape').length;
    return { x: FF.G.rabbit.x, contacts: contacts.length, releases: releases.length, missT, missC, sl, thuds: L.filter(e => e.cue === 'press-thud').length, errors: FF.errors }; })()`);
  report('every press contact within earshot has its thud on the same frame', M.contacts >= 6 && M.missT.length === 0, JSON.stringify({ x: M.x, contacts: M.contacts, thuds: M.thuds, miss: M.missT }));
  report('every release within earshot has its clank on the same frame', M.releases >= 6 && M.missC.length === 0, JSON.stringify({ releases: M.releases, miss: M.missC }));
  report('the gate scrapes as P1 comes down and as it rises', M.sl >= 2, 'sluice scrapes ' + M.sl);
  /* 5: a machine failure (frozen on the bed under P1) */
  const F = await b.ev(`(() => { __t.log.length = 0; __t.listen(['fail', 'restart']); FF.AudioS2.log.length = 0; __ff.warp('works-apron');
    __t.go(120 * 30, () => ({}), () => FF.Works.press('P1').state === 'up' && FF.Works.press('P1').phase > 12.4);
    __t.go(120 * 10, r => ({ right: r.x < 143.9 }), r => r.x >= 143.9); __t.go(120 * 30, () => ({}), () => !!FF.Works.debug().cut);
    const cut = __t.log.find(e => e[0] === 'fail'); __t.go(120 * 3, () => ({}), null); const rs = cut && __t.log.find(e => e[0] === 'restart' && e[1] > cut[1]);
    const inBlack = cut && rs ? FF.AudioS2.log.filter(e => e.t > cut[1] && e.t < rs[1]) : null;
    return { cut: cut && [cut[1], cut[2].kind, cut[2].by], restart: rs && rs[1], inBlack, failCue: FF.Audio.debug().heard['contact-muffled'] || 0 }; })()`);
  report('a machine failure: the muffled contact, and nothing of the Works starts in the black', F.cut && F.cut[1] === 'machine' && F.restart && F.inBlack && F.inBlack.length === 0 && F.failCue >= 1, JSON.stringify(F));
  /* 6: the worker's look; the splash */
  const W = await b.ev(`(() => { FF.AudioS2.log.length = 0; __ff.warp({ x: 160.0, y: 0 }); FF.Painter.setLoopT(6.5); const h0 = FF.Audio.debug().heard.heart || 0;
    __t.go(120 * 9, () => ({}), null); const cues = FF.AudioS2.log.filter(e => e.id === 'painter').map(e => e.cue), looks = FF.Painter.debug().looks;
    const s0 = FF.Audio.debug().heard.splash || 0; __ff.warp({ x: 145.95, y: -0.4 }); FF.Works.setPhase('P1', 6.0); __t.go(120 * 3, () => ({ right: true }), r => r.x > 147.2); __t.go(60, () => ({}), null);
    return { looks, cues, heart: (FF.Audio.debug().heard.heart || 0) - h0, splash: (FF.Audio.debug().heard.splash || 0) - s0 }; })()`);
  report('the worker\'s look: the lamp unhooked and hung back, a heartbeat', W.looks >= 1 && W.cues.includes('lamp-unhook') && W.cues.includes('lamp-hang') && W.heart > 0, JSON.stringify(W));
  report('dropping into the culvert splashes', W.splash >= 1);
  const fin = await b.ev('({ probe: window.__probe, errors: FF.errors })');
  report('?mute=1: no AudioContext, nothing stored; console clean', fin.probe.ac === 0 && fin.probe.oac === 0 && fin.probe.set.length === 0 && fin.errors.length === 0 && b.errs.length === 0, JSON.stringify({ probe: fin.probe, errors: fin.errors, errs: b.errs.slice(0, 4) }));
} finally { b.close(); }
if (process.env.RENDER) {
  const r = await boot('cp=works-in&seed=1&q=low');
  try {
    await r.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39 }); await r.cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39 });
    const R = await r.ev(`(async () => { __t.log.length = 0; __t.listen(['press']); __ff.warp('works-pitA'); const st = [];
      const buf = await FF.Audio.renderOffline(30, () => { __t.hold({}); __ff.step(4, false); st.push([FF.G.t, FF.Works.press('P1').state]); }, 32000);
      const d = buf.getChannelData(0), sr = buf.sampleRate, t0 = st[0][0] - 1 / 30, a = Math.exp(-2 * Math.PI * 120 / sr); let l1 = 0, l2 = 0; const low = new Float32Array(d.length);
      for (let i = 0; i < d.length; i++) { l1 = a * l1 + (1 - a) * d[i]; l2 = a * l2 + (1 - a) * l1; low[i] = l2; }
      const rms = (x, i0, i1) => { let s = 0; for (let i = Math.max(0, i0); i < Math.min(x.length, i1); i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
      const hop = Math.round(sr * 0.02), on = __t.log.filter(e => e[2].id === 'P1' && e[2].phase === 'contact').map(e => { const i = Math.round((e[1] - t0) * sr); const before = rms(low, i - 8 * hop, i - hop); let k = -2; for (; k < 4; k++) if (rms(low, i + k * hop, i + (k + 1) * hop) > before * 2) break; return k < 4 ? k * 20 : null; });
      const lv = s => { const xs = st.filter(q => q[1] === s).map(q => Math.round((q[0] - t0) * sr)); let ss = 0; for (const i of xs) ss += rms(d, i, i + Math.round(sr / 30)) ** 2; return xs.length ? 20 * Math.log10(Math.sqrt(ss / xs.length)) : null; };
      return { onsets: on, up: lv('up'), descent: lv('descent') }; })()`, 600000);
    report('render: a thud onset within 60 ms of every contact', R.onsets.length >= 1 && R.onsets.every(o => o != null && o >= -20 && o <= 60), JSON.stringify(R.onsets));
    report('render: the stillness is quieter than the descent', R.up != null && R.descent != null && R.up < R.descent, 'up ' + (R.up && R.up.toFixed(1)) + ' dB, descent ' + (R.descent && R.descent.toFixed(1)) + ' dB');
  } finally { r.close(); }
}
console.log(ok ? 'ALL PASS' : 'SOME FAILED'); process.exit(ok ? 0 : 1);
