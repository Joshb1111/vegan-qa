/* VINE LINE — audio.js (AUDIO). VL.Audio: every sound and tune is made with WebAudio, no files, all original.
   Graph: sfx voices → sfx bus ┐
          song (lead + echo → lowpass, drums) → music bus ┴→ master (mute) → compressor → limiter → out
   Nothing happens before unlock(); nothing throws without WebAudio. musicOn(on) fades only the music bus.
   VL.Audio._render(ctx) builds the same graph in any (Offline)AudioContext, for tests. */
'use strict';
(function () {
const VL = window.VL = window.VL || {};
const AC = window.AudioContext || window.webkitAudioContext;

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const mid = s => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] ? -1 : 0) + (+m[3] + 1) * 12; };
const NH = s => hz(mid(s));
const MAJ = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];

/* ---------- songs: 16 steps a bar, '-' holds, '.' rests; one or two chords a bar ---------- */
const SONGS = {
  title: { bpm: 112, wave: 'flute', lv: .15, lp: 4000, arp: 'box', bass: 'walk', drum: 'soft', echo: 3, loop: 1,
    ch: ['F', 'Dm', 'Bb', 'C', 'F', 'Am', 'Bb C', 'F'],
    lead: ['C5 - F5 - A5 - - G5 F5 - A5 - C6 - - -', 'D6 - C6 - A5 - F5 - G5 - A5 - F5 - . .',
           'Bb5 - A5 - G5 - F5 - D5 - F5 - G5 - - -', 'C5 - - - E5 - G5 - Bb5 - A5 - G5 - . .',
           'C5 - F5 - A5 - - G5 F5 - A5 - C6 - D6 -', 'E6 - - - C6 - A5 - E5 - A5 - C6 - . .',
           'D6 - C6 - Bb5 - A5 - G5 - - - E5 - G5 -', 'F5 - - - A5 - C6 - F6 - - - . . . .'] },
  play: { bpm: 128, wave: 'p25', lv: .12, lp: 3600, arp: 'eighth', bass: 'bounce', drum: 'pop', echo: 3, loop: 1,
    ch: ['G', 'Em', 'C', 'D', 'G', 'Em', 'Am', 'D', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'G', 'D'],
    lead: ['G5 . B5 . D6 - B5 . G5 . A5 . B5 - . .', 'E5 . G5 . B5 - G5 . E5 - - . D5 - . .',
           'C5 . E5 . G5 - C6 . B5 - A5 . G5 - . .', 'A5 - - . F#5 - D5 . F#5 - A5 - D6 - - -',
           'G5 . B5 . D6 - B5 . G5 . A5 . B5 - . .', 'B5 . D6 . E6 - D6 . B5 - G5 . E5 - . .',
           'A5 - C6 - E6 - C6 - A5 - G5 - E5 - . .', 'D5 - - - F#5 - A5 - D6 - C6 - A5 - . .',
           'E5 - G5 - C6 - - - G5 - E5 - G5 - - -', 'F#5 - A5 - D6 - - - A5 - F#5 - A5 - - -',
           'D6 - - - B5 - F#5 - D5 - F#5 - B5 - - -', 'E6 - D6 - B5 - G5 - E5 - G5 - B5 - . .',
           'C6 - B5 - A5 - G5 - E5 - G5 - C6 - - -', 'D6 - - . A5 - - . F#5 - A5 - C6 - B5 A5',
           'G5 - B5 - D6 - G6 - F#6 - D6 - B5 - G5 -', 'A5 - - - D6 - . . F#5 . A5 . D6 . . .'] },
  win: { bpm: 140, wave: 'flute', lv: .16, lp: 5000, arp: 'pad', bass: 'pad', drum: 'fin', echo: 3, loop: 0,
    ch: ['C G', 'C'],
    lead: ['E5 . G5 . C6 . E6 - - . D6 . E6 - - .', 'G6 - - - - - - - - - - - . . . .'] }
};
/* the garden tune quickens a little as the vines speed up */
const VARIED = { play: [{ tr: 0 }, { tr: 0, bpm: 140, lp: 3900 }, { tr: 2, bpm: 152, lp: 4200, drum: 'drive' }] };
const parseBar = s => {
  const k = s.trim().split(/\s+/), out = [];
  for (let i = 0; i < 16; i++) {
    const n = k[i];
    if (!n || n === '-' || n === '.') { out.push(null); continue; }
    let len = 1; while (i + len < 16 && k[i + len] === '-') len++;
    out.push([mid(n), len]);
  }
  return out;
};
const parseChord = s => { const m = /^([A-G])([#b]?)(m?)$/.exec(s); return [SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] ? -1 : 0), m[3] ? 3 : 4]; };
for (const k in SONGS) { const S = SONGS[k]; S.L = S.lead.map(parseBar); S.C = S.ch.map(c => c.split(' ').map(parseChord)); }
const clampV = v => Math.max(0, Math.min(2, v | 0));
function songDef(name, v) { const S = SONGS[name]; if (!S) return null; return Object.assign({ tr: 0, swing: 0 }, S, VARIED[name] ? VARIED[name][clampV(v)] : {}); }

/* ---------- sound effects: [voice length s, keep, fn(H, t, out, arg)] ---------- */
const SFX = {
  /* a berry: a juicy 'plip' + a sparkle; arg climbs the scale with each berry in a row */
  eat: [.25, 0, (H, t, o, a) => {
    const f = 440 * Math.pow(2, MAJ[Math.max(0, Math.min(14, a | 0))] / 12);
    H.tone('triangle', f * .75, f * 1.5, t, .06, .26, o); H.tone('sine', f * 2, f * 2.2, t + .045, .09, .1, o);
    H.noise(t, .03, .04, 'bandpass', 2500, 0, 2, o);
  }],
  /* the golden sunberry: a bright run up and a chord bloom */
  gold: [.8, 1, (H, t, o) => {
    ['C5', 'E5', 'G5', 'A5', 'C6', 'E6', 'G6'].forEach((n, i) => { const f = NH(n), u = t + i * .045; H.tone('triangle', f, 0, u, .09, .14, o); H.tone(H.p12, f * 2, 0, u + .01, .05, .025, o); });
    for (const n of ['C6', 'E6', 'G6', 'C7']) H.tone('sine', NH(n), 0, t + .34, .36, .07, o, .01);
    H.noise(t + .32, .3, .03, 'highpass', 6000, 10000, .7, o);
  }],
  goldAppear: [.4, 1, (H, t, o) => ['G6', 'C7', 'E7'].forEach((n, i) => { H.tone('sine', NH(n), 0, t + i * .06, .12, .07, o); H.tone('triangle', NH(n) / 2, 0, t + i * .06, .06, .04, o); })],
  goldGone: [.4, 0, (H, t, o) => ['E6', 'C6'].forEach((n, i) => H.tone('sine', NH(n), 0, t + i * .1, .18, .06, o, .005))],
  /* a very soft tick on a turn */
  turn: [.04, 0, (H, t, o) => { H.tone('sine', 1500, 1200, t, .022, .035, o, .002); }],
  /* a crash, kindly: the vine wilts with a slow wobbly sigh */
  wilt: [.9, 1, (H, t, o) => {
    const s = H.tone('triangle', 620, 210, t, .6, .2, o, .01); H.wob(s, t, .6, 6, 22);
    H.tone('sine', NH('E5'), NH('B4'), t + .1, .5, .07, o);
    H.noise(t, .25, .04, 'bandpass', 900, 400, 1.5, o);
  }],
  count: [.2, 1, (H, t, o) => { H.tone('triangle', NH('A5'), 0, t, .12, .32, o); H.tone('sine', NH('A6'), 0, t, .06, .08, o); }],
  go: [.45, 1, (H, t, o) => { ['D5', 'G5', 'B5', 'D6'].forEach((n, i) => H.tone('triangle', NH(n), 0, t + i * .05, .1, .18, o)); H.tone('sine', NH('G6'), 0, t + .2, .22, .06, o); }],
  win: [1.2, 1, (H, t, o) => {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => { H.tone('triangle', NH(n), 0, t + i * .08, .1, .2, o); H.tone('sine', NH(n) * 2, 0, t + i * .08, .06, .04, o); });
    for (const n of ['E6', 'G6', 'C7']) H.tone('sine', NH(n), 0, t + .36, .6, .07, o, .01);
    for (let i = 0; i < 5; i++) H.tone('sine', 2400 + ((i * 1777) % 1900), 0, t + .4 + i * .07, .05, .03, o);
  }],
  draw: [.8, 1, (H, t, o) => { [['G5', 0], ['E5', .14], ['G5', .28]].forEach(([n, d]) => H.tone('triangle', NH(n), 0, t + d, .16, .16, o)); H.tone('sine', NH('C6'), 0, t + .42, .3, .07, o); }],
  /* game over: a kind little lullaby that lands on a warm chord */
  gameover: [2, 1, (H, t, o) => {
    ['E5', 'D5', 'C5', 'G4'].forEach((n, i) => { H.tone('triangle', NH(n), 0, t + i * .2, .18, .17, o); H.tone('sine', NH(n) * 2, 0, t + i * .2, .12, .035, o); });
    for (const n of ['C4', 'E5', 'G5', 'C6']) H.tone('sine', NH(n), 0, t + .82, .9, n === 'C4' ? .2 : .07, o);
  }],
  best: [1, 1, (H, t, o) => {
    ['G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) => { H.tone('triangle', NH(n), 0, t + i * .06, .09, .14, o); H.tone(H.p12, NH(n), 0, t + .05 + i * .06, .05, .03, o); });
    H.noise(t + .3, .4, .025, 'highpass', 6000, 10000, .7, o);
  }],
  select: [.06, 0, (H, t, o) => { H.tone('triangle', 900, 1300, t, .04, .14, o); }],
  start: [.45, 1, (H, t, o) => { H.tone('triangle', NH('G5'), 0, t, .08, .2, o); H.tone('triangle', NH('D6'), 0, t + .09, .08, .2, o); H.tone('triangle', NH('G6'), 0, t + .18, .2, .18, o); }]
};
const RATE = { eat: [3, .06], turn: [2, .05], select: [2, .05], count: [1, .3] }, RATE_DEF = [2, .04], MAXV = 18;

function create(ac) {
  const I = { ac, rl: {}, vox: [], seq: null, key: '', muted: false, musOn: true, base: { master: .8, sfx: 1.4, mus: .4 } };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const dyn = (th, kn, ra, at, re) => { const c = ac.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = kn; c.ratio.value = ra; c.attack.value = at; c.release.value = re; return c; };
  const comp = dyn(-14, 6, 4, .003, .15), lim = dyn(-4, 0, 20, .001, .08), trim = gain(.8);
  I.master = gain(I.base.master); I.sfx = gain(I.base.sfx); I.mus = gain(I.base.mus);
  I.sfx.connect(I.master); I.mus.connect(I.master); I.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ac.destination);
  const pulse = d => { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * d); return ac.createPeriodicWave(re, im); };
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
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
    H.env(g, t, pk, dur, .002); s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * .5); s.stop(t + dur + .03);
  };
  I.H = H;
  function rateOk(name, t) {
    const r = RATE[name] || RATE_DEF, a = I.rl[name] || (I.rl[name] = []);
    while (a.length && a[0] <= t - r[1]) a.shift();
    if (a.length >= r[0]) return false; a.push(t); return true;
  }
  function voice(t, len, keep) {
    const v = I.vox;
    for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= t) v.splice(i, 1);
    if (v.length >= MAXV) { let k = v.findIndex(x => !x.keep); if (k < 0) k = 0; const d = v.splice(k, 1)[0]; d.g.gain.setTargetAtTime(0, t, .006); }
    const g = gain(1); g.connect(I.sfx); v.push({ g, end: t + len, keep }); return g;
  }
  I.play = (name, arg, t) => { const d = SFX[name]; if (!d || !rateOk(name, t)) return false; d[2](H, t, voice(t, d[0], d[1]), arg); return true; };
  I.setMute = (on, t) => { I.muted = !!on; const g = I.master.gain; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0 : I.base.master, t, .03); };
  I.setMusicOn = (on, t) => { I.musOn = !!on; const g = I.mus.gain; g.cancelScheduledValues(t); if (on) g.setTargetAtTime(I.base.mus, t, .03); else { g.setTargetAtTime(0, t, .018); g.setValueAtTime(0, t + .1); } };
  I.music = (name, v, t) => {
    const key = name ? (VARIED[name] ? name + clampV(v) : name) : '';
    if (key === I.key) return; I.key = key;
    let step0 = 0;
    if (I.seq) { const o = I.seq.n; if (name && I.seq.name === name) step0 = I.seq.step; o.out.gain.setTargetAtTime(0, t, .06); I.seq = null; setTimeout(() => { try { for (const k in o) o[k].disconnect(); } catch (e) {} }, 900); }
    const d = songDef(name, v); if (!d) return;
    const sd = 60 / d.bpm / 4, n = { out: gain(1), mel: ac.createBiquadFilter(), drm: gain(1), lead: gain(1), dl: ac.createDelay(1), fb: gain(.26), wet: gain(.2) };
    n.mel.type = 'lowpass'; n.mel.frequency.value = d.lp; n.mel.Q.value = .5; n.dl.delayTime.value = sd * d.echo;
    n.out.connect(I.mus); n.mel.connect(n.out); n.drm.connect(n.out); n.lead.connect(n.mel);
    n.lead.connect(n.dl); n.dl.connect(n.fb); n.fb.connect(n.dl); n.dl.connect(n.wet); n.wet.connect(n.mel);
    I.seq = { name, d, n, sd, step: step0, next: t };   /* a faster variant of the same tune carries on from the same step */
  };
  I.schedule = (now, until) => {
    const q = I.seq; if (!q) return false;
    if (q.next < now - .1) q.next = now + .03;
    while (I.seq === q && q.next < until) {
      if (!I.muted && I.musOn) step(q, q.step, q.next);
      q.next += q.sd; q.step++;
      if (!q.d.loop && q.step >= q.d.L.length * 16) I.seq = null;
    }
    return !!I.seq;
  };
  I.resync = now => { if (I.seq) I.seq.next = now + .05; };
  function step(q, s, t) {
    const d = q.d, nb = d.L.length, bar = (s >> 4) % nb, i = s & 15, pass = (s >> 4) / nb | 0, sd = q.sd, n = q.n;
    const cs = d.C[bar], c = cs[i >= 8 && cs.length > 1 ? 1 : 0], r = (c[0] + d.tr + 120) % 12, th = c[1];
    const rest = d.loop && pass % 3 === 2 && bar < 4;   /* every third time round the tune rests for four bars */
    const L = d.L[bar][i];
    if (L && !rest) { const m = L[0] + d.tr; lead(d, n.lead, hz(m), t, L[1] * sd, L[1]); if (d.loop && pass % 2 === 1 && nb > 8 && bar >= 8) H.tone('sine', hz(m + 12), 0, t, Math.min(.3, L[1] * sd), .022, n.mel, .01); }
    const a = 60 + r, T = [0, th, 7, 12], ag = rest ? 1.4 : 1;
    if (d.arp === 'eighth') { if (!(i & 1)) H.tone(H.p12, hz(a + T[[0, 1, 2, 1][(i >> 1) & 3]] + 12), 0, t, sd * 1.4, .038 * ag, n.mel); }
    else if (d.arp === 'box') { if (!(i & 1)) H.tone('sine', hz(a + T[[0, 2, 1, 2, 3, 2, 1, 2][i >> 1]] + 12), 0, t, sd * 2.5, .06 * ag, n.mel, .002); }
    else if (d.arp === 'pad') { if (i === 0 || (i === 8 && cs.length > 1)) for (let k = 0; k < 3; k++) H.tone('triangle', hz(a + T[k]), 0, t, sd * (nb === bar + 1 ? 14 : 7), .045, n.mel, .03); }
    const b = 40 + ((r + 8) % 12), bt = (iv, dur, g) => H.tone('triangle', hz(b + iv), 0, t, dur, g, n.mel, .005);
    if (d.bass === 'bounce') { if (!(i & 1)) bt([0, 12, 7, 12][(i >> 1) & 3], sd * 1.6, .22); }
    else if (d.bass === 'walk') { if (!(i & 3)) bt([0, 7, 12, 7][i >> 2], sd * 3, .21); }
    else if (d.bass === 'pad') { if (i === 0 || (i === 8 && cs.length > 1)) bt(0, sd * (cs.length > 1 ? 7 : 14), .22); }
    const o = n.drm, dr = d.drum;
    const kick = g => H.tone('sine', 150, 50, t, .12, g, o, .002);
    const snare = g => { H.noise(t, .1, g, 'bandpass', 1800, 0, .8, o); H.tone('triangle', 220, 160, t, .05, g * .4, o); };
    const hat = g => H.noise(t, .025, g, 'highpass', 7000, 0, .7, o);
    const shk = g => H.noise(t, .05, g, 'bandpass', 5200, 0, 3, o);   /* a seed-pod shaker */
    if (dr === 'pop') { if (i === 0 || i === 8) kick(.2); if (i === 4 || i === 12) snare(.08); if ((i & 3) === 2) shk(.035); else if (i & 1) hat(.01); }
    else if (dr === 'drive') { if (!(i & 3)) kick(.2); if (i === 4 || i === 12) snare(.09); if (i & 1) shk(.03); else hat(.012); }
    else if (dr === 'soft') { if (i === 0) kick(.15); if (i === 10) kick(.07); if (i === 4 || i === 12) shk(.04); if (!(i & 1)) hat(.01); }
    else if (dr === 'fin') { if (i === 0) kick(.16); if (bar === 1 && i === 0) H.noise(t, .8, .04, 'highpass', 6000, 9000, .7, o); }
  }
  function lead(d, out, f, t, dur, len) {
    const o = H.osc(d.wave === 'p25' ? H.p25 : 'triangle'), g = ac.createGain(), pk = d.lv;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + .012); g.gain.setTargetAtTime(pk * .6, t + .012, .12);
    g.gain.setTargetAtTime(0, t + dur * .92, .035);
    o.frequency.setValueAtTime(f, t); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .25);
    if (d.wave === 'flute') { const o2 = H.osc('sine'), g2 = gain(.3); o2.frequency.setValueAtTime(f * 2, t); o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + dur + .25); }
    if (len >= 4) H.wob(o, t + .15, Math.max(.05, dur - .1), 5.5, f * .008);
  }
  return I;
}

/* ---------- live wrapper (the engine never calls any of this with ?mute=1) ---------- */
let I = null, muted = false, hid = false, want = null, timer = 0, musOn = true;
const now = () => I.ac.currentTime;
function pump() { timer = 0; if (!I || hid) return; try { if (I.schedule(now(), now() + .12)) run(); } catch (e) {} }
function run() { if (!timer && I && !hid && I.seq) timer = setTimeout(pump, 25); }
VL.Audio = {
  ready: false, SFX_NAMES: Object.keys(SFX), MUSIC_NAMES: Object.keys(SONGS),
  unlock() {
    if (!AC) return;
    try {
      if (!I) {
        I = create(new AC()); this.ready = true; I.setMute(muted, 0); I.setMusicOn(musOn, 0);
        const b = I.ac.createBuffer(1, 1, 22050), s = I.ac.createBufferSource(); s.buffer = b; s.connect(I.ac.destination); s.start(0);
        if (want) I.music(want[0], want[1], now() + .06);
      }
      if (!hid && I.ac.state !== 'running' && I.ac.resume) I.ac.resume().catch(() => {});
      run();
    } catch (e) {}
  },
  play(name, arg) { if (!I || muted || hid) return; try { I.play(name, arg, now() + .002); } catch (e) {} },
  music(name, v) { want = name ? [name, v | 0] : null; if (!I) return; try { I.music(name, v | 0, now() + .06); run(); } catch (e) {} },
  mute(on) { muted = !!on; if (I) try { I.setMute(muted, now()); } catch (e) {} },
  musicOn(on) { if (on === undefined) return musOn; musOn = !!on; if (I) try { I.setMusicOn(musOn, now()); } catch (e) {} return musOn; },
  hidden(on) {
    hid = !!on; if (!I) return;
    try {
      if (hid) { clearTimeout(timer); timer = 0; if (I.ac.suspend) I.ac.suspend().catch(() => {}); }
      else { if (I.ac.resume) I.ac.resume().catch(() => {}); I.resync(now()); run(); }
    } catch (e) {}
  },
  _render(ctx) { return create(ctx); }
};
})();
