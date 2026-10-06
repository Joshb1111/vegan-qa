/* BEET BEAT — audio.js (AUDIO). BEAT.Audio: every sound and tune made with WebAudio, no files, all original.
   Graph: sfx voices → sfx bus ┐
          song (lead + echo → lowpass, arp, bass, drums, press cues) → music bus ┴→ master (mute) → compressor → limiter → out
   THE CLOCK. A song is scheduled on the audio clock from t0 (its beat 0). time() = seconds into the current song AS HEARD (from
   getOutputTimestamp, else currentTime - outputLatency), or null when no song runs on a running context. main.js steps the
   game to time() while a level song plays, so beats and obstacles stay in sync. The song keeps its clock while muted or with
   the music off (notes are just not played), so sound can come back in time. Nothing happens before unlock(); nothing throws
   without WebAudio. music(id, atBeat) (re)starts a song from a beat; cues(beats) adds a soft wood-block tick on those beats
   (the level's presses: a first-timer hears when to hop; main.js turns it on in one-player normal runs only). */
'use strict';
(function () {
const BEAT = window.BEAT = window.BEAT || {};
const AC = window.AudioContext || window.webkitAudioContext;
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const mid = s => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] ? -1 : 0) + (+m[3] + 1) * 12; };
const NH = s => hz(mid(s));

/* ---------- songs: 16 steps a bar ('-' holds, '.' rests); a bar = [chord(s), lead, drums] ---------- */
const parseBar = s => {
  const k = (s || '').trim().split(/\s+/), out = [];
  for (let i = 0; i < 16; i++) {
    const n = k[i]; if (!n || n === '-' || n === '.') { out.push(null); continue; }
    let len = 1; while (i + len < 16 && k[i + len] === '-') len++;
    out.push([mid(n), len]);
  }
  return out;
};
const parseChord = s => { const m = /^([A-G])([#b]?)(m?)$/.exec(s); return [SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] ? -1 : 0), m[3] ? 3 : 4]; };
/* PATCHWORK PULSE: C major, 110 bpm. 2 intro bars, A (8), B (8), A' (6) = 24 bars = the level; then it loops from bar 3 */
const A = [
  ['C', 'E5 - G5 - C6 - - - B5 - G5 - E5 - - -'], ['Am', 'A5 - - - G5 - E5 - C5 - - - D5 - E5 -'],
  ['F', 'F5 - A5 - C6 - - - A5 - F5 - A5 - - -'], ['G', 'G5 - - - B5 - D6 - B5 - - - . . . .'],
  ['C', 'E5 - G5 - C6 - - - D6 - C6 - G5 - - -'], ['Am', 'A5 - C6 - E6 - - - D6 - C6 - A5 - - -'],
  ['F G', 'F5 - A5 - C6 - A5 - G5 - B5 - D6 - - -'], ['C', 'C6 - - - G5 - E5 - C5 - - - . . . .']];
const B = [
  ['F', 'A5 . A5 . C6 - A5 - F5 - - - G5 - A5 -'], ['G', 'B5 . B5 . D6 - B5 - G5 - - - A5 - B5 -'],
  ['Em', 'G5 - B5 - E6 - - - D6 - B5 - G5 - - -'], ['Am', 'A5 - - - C6 - E6 - A6 - - - . . . .'],
  ['F', 'A6 - G6 - F6 - - - C6 - - - A5 - C6 -'], ['G', 'B5 - D6 - G6 - - - F6 - D6 - B5 - - -'],
  ['Dm', 'D6 - F6 - A6 - - - F6 - D6 - A5 - - -'], ['G', 'G5 - B5 - D6 - - - G6 - - - . . . .']];
const END = [['F G', 'F5 - A5 - C6 - - - D6 - - - B5 - - -'], ['C', 'C6 - - - - - - - G5 - E5 - C6 - - -']];
const bars = (list, drum) => list.map(([c, l]) => [c, l, drum]);
const SONGS = {
  patchwork: { bpm: 110, lv: .13, wave: 'p25', lp: 3800, echo: 3, loopFrom: 2,
    bars: [['C', '', 'intro'], ['C', '. . . . . . . . . . . . G5 - B5 -', 'intro2']].concat(bars(A, 'pulse'), bars(B, 'drive'), bars(A.slice(0, 4), 'pulse'), bars(END, 'pulse')) },
  title: { bpm: 110, lv: .12, wave: 'flute', lp: 3200, echo: 3, loopFrom: 0, bars: bars(A, 'soft') },
  win: { bpm: 132, lv: .15, wave: 'flute', lp: 5000, echo: 2, loopFrom: -1,
    bars: [['C G', 'E5 . G5 . C6 . E6 - - . D6 . E6 - - .', 'fin'], ['C', 'G6 - - - - - - - - - - - . . . .', 'end']] },
  done: { bpm: 120, lv: .14, wave: 'flute', lp: 4200, echo: 2, loopFrom: -1,
    bars: [['F G', 'A5 . C6 . F6 - - . E6 . D6 - - .', 'fin'], ['C', 'E6 - - - - - - - - - - - . . . .', 'end']] }
};
for (const k in SONGS) { const S = SONGS[k]; S.L = S.bars.map(b => parseBar(b[1])); S.C = S.bars.map(b => b[0].split(' ').map(parseChord)); S.spb = 60 / S.bpm; }

/* ---------- sound effects: [voice length s, keep, fn(H, t, out, arg)] ---------- */
const SFX = {
  jump: [.12, 0, (H, t, o) => { H.tone('triangle', 520, 880, t, .07, .09, o, .002); H.tone('sine', 1040, 1500, t + .01, .05, .03, o); }],
  land: [.05, 0, (H, t, o) => { H.noise(t, .03, .03, 'bandpass', 1400, 0, 1.4, o); }],
  pad: [.45, 1, (H, t, o) => { const s = H.tone('triangle', 260, 760, t, .32, .2, o, .004); H.wob(s, t, .32, 18, 40); H.tone('sine', 520, 1200, t + .03, .2, .05, o); }],
  ring: [.6, 1, (H, t, o, a) => { const f = a ? NH('A6') : NH('E6'); H.tone('sine', f, 0, t, .45, .12, o, .002); H.tone('sine', f * 1.5, 0, t + .005, .3, .05, o, .002); H.tone('triangle', f * 2, 0, t, .08, .03, o); H.noise(t, .12, .02, 'highpass', 7000, 0, .7, o); }],
  /* a crash, kindly: a springy "boing!" and a puff of leaves (a dry rustle) */
  crash: [.8, 1, (H, t, o) => {
    const s = H.tone('triangle', 720, 190, t, .42, .22, o, .004); H.wob(s, t, .42, 14, 60);
    H.tone('sine', 360, 140, t + .02, .3, .08, o);
    H.noise(t + .02, .32, .07, 'bandpass', 3200, 1600, 1.1, o); H.noise(t + .08, .25, .035, 'highpass', 5000, 0, .7, o);
  }],
  spawn: [.25, 0, (H, t, o) => { H.tone('sine', NH('C6'), NH('G6'), t, .12, .07, o, .004); H.tone('triangle', NH('G5'), 0, t + .05, .1, .05, o); }],
  cp: [.6, 1, (H, t, o) => { H.tone('sine', NH('E6'), 0, t, .25, .07, o); H.tone('sine', NH('B6'), 0, t + .1, .35, .06, o); H.tone('triangle', NH('E5'), 0, t, .12, .05, o); }],
  seed: [.6, 1, (H, t, o) => { ['E6', 'G6', 'B6', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + i * .04, .14, .06, o)); H.noise(t + .1, .3, .02, 'highpass', 7000, 10000, .7, o); }],
  win: [1.3, 1, (H, t, o) => {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => { H.tone('triangle', NH(n), 0, t + i * .08, .1, .2, o); H.tone('sine', NH(n) * 2, 0, t + i * .08, .06, .04, o); });
    for (const n of ['E6', 'G6', 'C7']) H.tone('sine', NH(n), 0, t + .36, .6, .07, o, .01);
    for (let i = 0; i < 5; i++) H.tone('sine', 2400 + ((i * 1777) % 1900), 0, t + .4 + i * .07, .05, .03, o);
  }],
  best: [1, 1, (H, t, o) => {
    ['G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) => { H.tone('triangle', NH(n), 0, t + i * .06, .09, .14, o); H.tone(H.p12, NH(n), 0, t + .05 + i * .06, .05, .03, o); });
    H.noise(t + .3, .4, .025, 'highpass', 6000, 10000, .7, o);
  }],
  count: [.2, 1, (H, t, o) => { H.tone('triangle', NH('A5'), 0, t, .12, .26, o); H.tone('sine', NH('A6'), 0, t, .06, .06, o); }],
  go: [.45, 1, (H, t, o) => { ['C5', 'G5', 'C6', 'E6'].forEach((n, i) => H.tone('triangle', NH(n), 0, t + i * .05, .1, .16, o)); H.tone('sine', NH('G6'), 0, t + .2, .22, .06, o); }],
  select: [.06, 0, (H, t, o) => { H.tone('triangle', 900, 1300, t, .04, .12, o); }],
  lose: [.9, 1, (H, t, o) => { [['E5', 0], ['D5', .14], ['C5', .28]].forEach(([n, d]) => H.tone('triangle', NH(n), 0, t + d, .16, .14, o)); H.tone('sine', NH('G5'), 0, t + .42, .35, .06, o); }]
};
const RATE = { jump: [3, .05], land: [2, .06], select: [2, .05], count: [1, .3] }, RATE_DEF = [2, .04], MAXV = 18;

function create(ac) {
  const I = { ac, rl: {}, vox: [], seq: null, muted: false, musOn: true, base: { master: .8, sfx: 1.3, mus: .42 }, cues: null };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const dyn = (th, kn, ra, at, re) => { const c = ac.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = kn; c.ratio.value = ra; c.attack.value = at; c.release.value = re; return c; };
  const comp = dyn(-14, 6, 4, .003, .15), lim = dyn(-4, 0, 20, .001, .08), trim = gain(.8);
  I.master = gain(I.base.master); I.sfx = gain(I.base.sfx); I.mus = gain(I.base.mus);
  I.sfx.connect(I.master); I.mus.connect(I.master); I.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ac.destination);
  const pulse = d => { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * d); return ac.createPeriodicWave(re, im); };
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
  let seed = 12345; for (let i = 0; i < nd.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; nd[i] = seed / 0x3fffffff - 1; }
  const H = { ac, p12: pulse(.125), p25: pulse(.25) };
  H.env = (g, t, pk, dur, att) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + att); g.gain.exponentialRampToValueAtTime(.0001, t + att + dur); };
  H.osc = w => { const o = ac.createOscillator(); if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w); return o; };
  H.tone = (w, f0, f1, t, dur, pk, out, att = .003) => {
    const o = H.osc(w), g = ac.createGain();
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    H.env(g, t, pk, dur, att); o.connect(g); g.connect(out); o.start(t); o.stop(t + att + dur + .02); return o;
  };
  H.wob = (o, t, dur, rate, depth) => { const l = ac.createOscillator(), lg = gain(depth); l.frequency.value = rate; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); };
  H.noise = (t, dur, pk, type, f0, f1, q, out) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nb; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    H.env(g, t, pk, dur, .002); s.connect(f); f.connect(g); g.connect(out); s.start(t, (t * 7.31) % .5); s.stop(t + dur + .03);
  };
  function rateOk(name, t) { const r = RATE[name] || RATE_DEF, a = I.rl[name] || (I.rl[name] = []); while (a.length && a[0] <= t - r[1]) a.shift(); if (a.length >= r[0]) return false; a.push(t); return true; }
  function voice(t, len, keep) {
    const v = I.vox; for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= t) v.splice(i, 1);
    if (v.length >= MAXV) { let k = v.findIndex(x => !x.keep); if (k < 0) k = 0; const d = v.splice(k, 1)[0]; d.g.gain.setTargetAtTime(0, t, .006); }
    const g = gain(1); g.connect(I.sfx); v.push({ g, end: t + len, keep }); return g;
  }
  I.play = (name, arg, t) => { const d = SFX[name]; if (!d || !rateOk(name, t)) return false; d[2](H, t, voice(t, d[0], d[1]), arg); return true; };
  I.setMute = (on, t) => { I.muted = !!on; const g = I.master.gain; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0 : I.base.master, t, .03); };
  I.setMusicOn = (on, t) => { I.musOn = !!on; const g = I.mus.gain; g.cancelScheduledValues(t); if (on) g.setTargetAtTime(I.base.mus, t, .03); else { g.setTargetAtTime(0, t, .018); g.setValueAtTime(0, t + .1); } };
  /* (re)start a song so that its beat `beat` sounds at time t */
  I.music = (name, beat, t) => {
    if (I.seq) { const o = I.seq.n; o.out.gain.setTargetAtTime(0, t, .03); I.seq = null; setTimeout(() => { try { for (const k in o) o[k].disconnect(); } catch (e) {} }, 900); }
    const d = SONGS[name]; if (!d) return;
    const sd = d.spb / 4, n = { out: gain(1), mel: ac.createBiquadFilter(), drm: gain(1), lead: gain(1), dl: ac.createDelay(1), fb: gain(.24), wet: gain(.18) };
    n.mel.type = 'lowpass'; n.mel.frequency.value = d.lp; n.mel.Q.value = .5; n.dl.delayTime.value = sd * d.echo;
    n.out.connect(I.mus); n.mel.connect(n.out); n.drm.connect(n.out); n.lead.connect(n.mel);
    n.lead.connect(n.dl); n.dl.connect(n.fb); n.fb.connect(n.dl); n.dl.connect(n.wet); n.wet.connect(n.mel);
    const b = Math.max(0, beat || 0), s0 = Math.ceil(b * 4 - 1e-6), t0 = t - b * d.spb;   /* exact: t0 is beat 0; the first step is the next 16th */
    I.seq = { name, d, n, sd, step: s0, next: t0 + s0 * sd, t0 };
  };
  I.schedule = (now, until) => {
    const q = I.seq; if (!q) return false;
    if (q.next < now - .2) { const skip = Math.ceil((now - q.next) / q.sd); q.step += skip; q.next += skip * q.sd; }   /* came back from a stall: skip ahead, keep t0 */
    while (I.seq === q && q.next < until) {
      if (!I.muted && I.musOn) step(q, q.step, q.next);
      if (I.cues && !I.muted && I.musOn && I.cues.has(q.step)) cue(q.next, q.n.drm);
      q.next += q.sd; q.step++;
      if (q.d.loopFrom < 0 && q.step >= q.d.L.length * 16) { const o = q.n; setTimeout(() => { try { for (const k in o) o[k].disconnect(); } catch (e) {} }, 2500); I.seq = null; }
    }
    return !!I.seq;
  };
  const barOf = (d, s) => { const nb = d.L.length, b = s >> 4; if (b < nb || d.loopFrom < 0) return Math.min(b, nb - 1); const lf = d.loopFrom, span = nb - lf; return lf + (b - lf) % span; };
  function cue(t, o) { H.tone('sine', 1250, 900, t, .05, .09, o, .001); H.noise(t, .03, .05, 'bandpass', 2600, 0, 4, o); }
  function step(q, s, t) {
    const d = q.d, bar = barOf(d, s), i = s & 15, sd = q.sd, n = q.n, row = d.bars[bar], kind = row[2];
    const cs = d.C[bar], c = cs[i >= 8 && cs.length > 1 ? 1 : 0], r = (c[0] + 120) % 12, th = c[1];
    const L = d.L[bar][i];
    if (L) lead(d, n.lead, hz(L[0]), t, L[1] * sd, L[1]);
    const a = 60 + r, T = [0, th, 7, 12];
    if (kind === 'pulse' || kind === 'drive') { if (!(i & 1)) H.tone(H.p12, hz(a + T[[0, 1, 2, 1, 3, 2, 1, 2][i >> 1]] + 12), 0, t, sd * 1.4, .032, n.mel); }
    else if (kind === 'soft') { if (!(i & 3)) H.tone('sine', hz(a + T[[0, 2, 1, 3][i >> 2]] + 12), 0, t, sd * 3, .05, n.mel, .002); }
    else if (kind === 'fin' || kind === 'end') { if (i === 0 || (i === 8 && cs.length > 1)) for (let k = 0; k < 3; k++) H.tone('triangle', hz(a + T[k]), 0, t, sd * (kind === 'end' ? 14 : 7), .045, n.mel, .03); }
    const b = 40 + ((r + 8) % 12), bt = (iv, dur, g) => H.tone('triangle', hz(b + iv), 0, t, dur, g, n.mel, .005);
    if (kind === 'intro' || kind === 'intro2') { if (!(i & 3)) bt(0, sd * 2, .2); }
    else if (kind === 'pulse' || kind === 'drive') { if (!(i & 1)) bt([0, 12, 7, 12][(i >> 1) & 3], sd * 1.5, .21); }
    else if (kind === 'soft') { if (i === 0 || i === 8) bt(i ? 7 : 0, sd * 6, .17); }
    else if ((kind === 'fin' || kind === 'end') && i === 0) bt(0, sd * 12, .2);
    const o = n.drm;
    const kick = g => H.tone('sine', 150, 48, t, .13, g, o, .002);
    const clap = g => { H.noise(t, .09, g, 'bandpass', 1500, 0, .9, o); H.noise(t + .012, .06, g * .7, 'bandpass', 2200, 0, 1.2, o); };
    const hat = g => H.noise(t, .025, g, 'highpass', 7600, 0, .7, o);
    const shk = g => H.noise(t, .045, g, 'bandpass', 5200, 0, 3, o);   /* a seed-pod shaker */
    if (kind === 'intro') { if (!(i & 3)) kick(.2); if (i & 1) hat(.008); else if (i & 2) shk(.03); }
    else if (kind === 'intro2') { if (!(i & 3)) kick(.2); if (i === 12 || i === 14) clap(.07); if (i & 1) hat(.01); }
    else if (kind === 'pulse') { if (!(i & 3)) kick(.21); if (i === 4 || i === 12) clap(.08); if ((i & 3) === 2) shk(.03); else if (i & 1) hat(.009); }
    else if (kind === 'drive') { if (!(i & 3)) kick(.22); if (i === 4 || i === 12) clap(.09); if (i & 1) shk(.028); else hat(.012); }
    else if (kind === 'soft') { if (i === 0 || i === 8) kick(.13); if (i === 4 || i === 12) shk(.035); if (!(i & 1)) hat(.008); }
    else if (kind === 'fin') { if (i === 0) kick(.16); }
    else if (kind === 'end' && i === 0) H.noise(t, .8, .035, 'highpass', 6000, 9000, .7, o);
  }
  function lead(d, out, f, t, dur, len) {
    const o = H.osc(d.wave === 'p25' ? H.p25 : 'triangle'), g = ac.createGain(), pk = d.lv;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + .01); g.gain.setTargetAtTime(pk * .6, t + .01, .1);
    g.gain.setTargetAtTime(0, t + dur * .9, .03);
    o.frequency.setValueAtTime(f, t); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .25);
    if (d.wave === 'flute') { const o2 = H.osc('sine'), g2 = gain(.3); o2.frequency.setValueAtTime(f * 2, t); o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + dur + .25); }
    if (len >= 4) H.wob(o, t + .12, Math.max(.05, dur - .1), 5.5, f * .007);
  }
  return I;
}

/* ---------- live wrapper (main.js never calls any of this with ?mute=1) ---------- */
let I = null, muted = false, hid = false, want = null, timer = 0, musOn = true, cueList = null;
const nowA = () => I.ac.currentTime;
function pump() { timer = 0; if (!I || hid) return; try { if (I.schedule(nowA(), nowA() + .14)) run(); } catch (e) {} }
function run() { if (!timer && I && !hid && I.seq) timer = setTimeout(pump, 25); }
function heard() {   /* the audio clock as heard now, in context seconds */
  const ac = I.ac;
  try { if (ac.getOutputTimestamp) { const ts = ac.getOutputTimestamp(); if (ts && ts.contextTime > 0 && ts.performanceTime > 0) return ts.contextTime + Math.max(0, Math.min(.2, (performance.now() - ts.performanceTime) / 1000)); } } catch (e) {}
  return ac.currentTime - (ac.outputLatency || ac.baseLatency || 0);
}
function setCues(beats) { if (!I) return; I.cues = beats && beats.length ? new Set(beats.map(b => Math.round(b * 4))) : null; }
BEAT.Audio = {
  ready: false, SFX_NAMES: Object.keys(SFX), MUSIC_NAMES: Object.keys(SONGS), SONGS,
  unlock() {
    if (!AC) return;
    try {
      if (!I) {
        I = create(new AC({ latencyHint: 'interactive' })); this.ready = true; I.setMute(muted, 0); I.setMusicOn(musOn, 0); setCues(cueList);
        const b = I.ac.createBuffer(1, 1, 22050), s = I.ac.createBufferSource(); s.buffer = b; s.connect(I.ac.destination); s.start(0);
        if (want) I.music(want[0], want[1], nowA() + .08);
      }
      if (!hid && I.ac.state !== 'running' && I.ac.resume) I.ac.resume().catch(() => {});
      run();
    } catch (e) {}
  },
  play(name, arg) { if (!I || muted || hid) return; try { I.play(name, arg, nowA() + .002); } catch (e) {} },
  /* (re)start a song from a beat (null stops). The first note sounds ~80 ms from now; time() is negative until then */
  music(name, atBeat) { want = name ? [name, +atBeat || 0] : null; if (!I) return; try { if (name) I.music(name, +atBeat || 0, nowA() + .08); else I.music(null, 0, nowA()); run(); } catch (e) {} },
  cues(beats) { cueList = beats || null; setCues(cueList); },
  /* seconds into the current song as heard (negative before its first beat), or null (no song, or the context is not running) */
  time() { if (!I || !I.seq || hid || I.ac.state !== 'running') return null; return heard() - I.seq.t0; },
  song() { return I && I.seq ? I.seq.name : null; },
  mute(on) { muted = !!on; if (I) try { I.setMute(muted, nowA()); } catch (e) {} },
  musicOn(on) { musOn = !!on; if (I) try { I.setMusicOn(musOn, nowA()); } catch (e) {} },
  hidden(on) {
    hid = !!on; if (!I) return;
    try { if (hid) { if (I.ac.suspend) I.ac.suspend().catch(() => {}); } else { if (I.ac.resume) I.ac.resume().catch(() => {}); run(); } } catch (e) {}
  },
  isMuted() { return muted; }, isMusicOn() { return musOn; },
  state() { return I ? I.ac.state : 'none'; }
};
})();
