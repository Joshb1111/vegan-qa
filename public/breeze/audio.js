/* Berry Breeze — audio.js (AUDIO). BB.Audio: every sound and tune is synthesised with WebAudio, no files.
   Graph: sfx voices → sfx bus ┐
          song (lead+echo → lowpass, drums) → music bus ┴→ master (mute) → compressor → limiter → trim → out
   All tunes are original. Everything is a no-op before unlock() and never throws without WebAudio.
   BB.Audio._render(ctx) builds the same graph in any (Offline)AudioContext (used by test/audio.html). */
'use strict';
(function () {
const BB = window.BB = window.BB || {};
const AC = window.AudioContext || window.webkitAudioContext;

// ---------- notes ----------
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const mid = s => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] ? -1 : 0) + (+m[3] + 1) * 12; };
const NH = s => hz(mid(s));
const MAJ = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21];

// ---------- songs (original). Lead: 16 steps per bar, '-' hold, '.' rest. Chords: one or two per bar.
// Written in C major / A minor; 'stage' is transposed per variant.
const SONGS = {
  title: { bpm: 126, wave: 'flute', lv: .15, lp: 4200, arp: 'box', bass: 'walk', drum: 'soft', echo: 3, loop: 1,
    ch: ['C', 'Am', 'F', 'G', 'C', 'Em', 'F G', 'C'],
    lead: ['G4 - C5 - E5 - D5 C5 - - E5 - G5 - - -', 'A5 - G5 - E5 - C5 - D5 - E5 - - - . .',
           'F5 - A5 - C6 - A5 - G5 - F5 - A5 - - -', 'G5 - - - D5 - G5 - B5 - A5 - G5 - . .',
           'G4 - C5 - E5 - D5 C5 - - G5 - E5 - - -', 'B4 - E5 - G5 - B5 - A5 - G5 - E5 - . .',
           'F5 - E5 - D5 - F5 - E5 - D5 - B4 - G4 -', 'C5 - - - E5 - G5 - C6 - - - . . . .'] },
  stage: { wave: 'p25', lv: .13, lp: 3600, arp: 'eighth', bass: 'bounce', drum: 'pop', echo: 3, loop: 1,
    ch: ['C', 'Am', 'Dm', 'G', 'C', 'Am', 'F', 'G', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'G'],
    lead: ['C5 . E5 . G5 - E5 . C6 - B5 . G5 - . .', 'A5 . E5 . C5 - E5 . A5 - G5 . E5 - . .',
           'D5 . F5 . A5 - F5 . D6 - C6 . A5 - . .', 'B5 - - . G5 - D5 . G5 - A5 - B5 - - -',
           'C5 . E5 . G5 - E5 . C6 - B5 . G5 - . .', 'A5 . C6 . E6 - D6 . C6 - A5 . E5 - . .',
           'F5 - A5 - C6 - A5 - G5 - E5 - D5 - . .', 'G5 - - - D5 - E5 - F5 - E5 - D5 - . .',
           'A5 - - - C6 - A5 - F5 - G5 - A5 - - -', 'B5 - - - D6 - B5 - G5 - A5 - B5 - - -',
           'G5 - E5 - B4 - E5 - G5 - B5 - A5 - G5 -', 'A5 - - - . . E5 - A5 - C6 - B5 - A5 -',
           'F5 - A5 - D6 - - - C6 - A5 - F5 - - -', 'G5 - B5 - D6 - - - B5 - G5 - D5 - . .',
           'E5 - G5 - C6 - E6 - D6 - C6 - B5 - G5 -', 'A5 - B5 - - - . . D6 . B5 . G5 . . .'] },
  boss: { bpm: 164, wave: 'p25', lv: .12, lp: 4000, arp: 'stab', bass: 'drive', drum: 'drive', echo: 2, loop: 1,
    ch: ['Am', 'F', 'G', 'E', 'Am', 'F', 'Dm', 'E'],
    lead: ['A4 . A4 . C5 . E5 . A5 - G5 . E5 . C5 .', 'F5 - - . A5 - F5 . C5 - D5 . F5 - . .',
           'G5 . G5 . B5 . D6 . B5 - A5 . G5 . D5 .', 'E5 - G#5 - B5 - - . G#5 - E5 - B4 - . .',
           'A4 . A4 . C5 . E5 . A5 - B5 . C6 . A5 .', 'C6 - - . A5 - F5 . G5 - A5 . C6 - . .',
           'D6 - C6 . A5 - F5 . D5 - F5 . A5 - . .', 'G#5 - - . B5 - - . E6 - D6 . B5 - G#5 -'] },
  clear: { bpm: 150, wave: 'flute', lv: .16, lp: 5000, arp: 'pad', bass: 'pad', drum: 'fin', echo: 3, loop: 0,
    ch: ['C G', 'C'],
    lead: ['C5 . E5 . G5 . C6 - - . A5 . B5 - - .', 'C6 - - - - - - - - - - - . . . .'] }
};
// stage variants: 0 Patchwork Meadows (G, bouncy), 1 Candyfloss Skies (F, slow and dreamy), 2 Clatter Works (D, swung, clanks)
const STAGE_V = [
  { tr: -5, bpm: 148 },
  { tr: -7, bpm: 110, wave: 'tri', lv: .15, lp: 2600, arp: 'dream', bass: 'dream', drum: 'dream' },
  { tr: 2, bpm: 158, swing: .3, drum: 'swing', lp: 3400 }
];
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
function songDef(name, v) {
  const S = SONGS[name]; if (!S) return null;
  return Object.assign({ tr: 0, swing: 0 }, S, name === 'stage' ? STAGE_V[Math.max(0, Math.min(2, v | 0))] : {});
}

// ---------- sfx table: [voice length s, keep (never dropped first), fn(H, t, out, arg)] ----------
const SFX = {
  // auto-fire: a tiny soft 'pip' (plays every 6 ticks, so it stays very quiet)
  shot: [.06, 0, (H, t, o) => { const j = 1 + (Math.random() - .5) * .06; H.tone('triangle', 1500 * j, 950 * j, t, .035, .06, o); }],
  hit: [.06, 0, (H, t, o) => { H.noise(t, .025, .11, 'bandpass', 3200, 0, 3, o); H.tone('triangle', 520, 330, t, .03, .1, o); }],
  pop: [.14, 0, (H, t, o, a) => {
    const f = 330 * (a || 1); H.tone('triangle', f, f * 4, t, .07, .3, o); H.tone('sine', f * 2, f * 6, t + .01, .05, .09, o);
    H.noise(t + .02, .06, .05, 'highpass', 2000, 0, .7, o);
  }],
  popBig: [.5, 0, (H, t, o) => {
    for (let i = 0; i < 3; i++) SFX.pop[2](H, t + i * .06, o, 1 + i * .3);
    H.tone('sine', 170, 55, t, .22, .24, o); H.noise(t, .25, .1, 'lowpass', 1800, 300, .8, o);
  }],
  // juggle bump: a springy 'bwip' (sine glides up then settles) + a soft plip; n climbs the major scale
  bump: [.22, 0, (H, t, o, n) => {
    const f = 392 * Math.pow(2, MAJ[Math.max(0, Math.min(12, n | 0))] / 12), ac = H.ac, s = ac.createOscillator(), g = ac.createGain();
    s.type = 'sine'; s.frequency.setValueAtTime(f * .7, t); s.frequency.exponentialRampToValueAtTime(f * 1.3, t + .035);
    s.frequency.exponentialRampToValueAtTime(f, t + .12); H.env(g, t, .24, .16, .004); s.connect(g); g.connect(o);
    s.start(t); s.stop(t + .2); H.wob(s, t + .03, .14, 24, f * .03);
    H.tone('triangle', f * 2, f * 3, t, .03, .06, o);
  }],
  // contact bonk: a soft low 'boing' with a wobble
  boing: [.32, 0, (H, t, o) => { const s = H.tone('sine', 140, 250, t, .26, .3, o, .005); H.wob(s, t, .27, 14, 22); H.tone('triangle', 280, 480, t, .07, .07, o); }],
  ripen: [.3, 0, (H, t, o) => ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => { H.tone('sine', NH(n), 0, t + i * .035, .09, .11, o); H.tone('triangle', NH(n) / 2, 0, t + i * .035, .07, .05, o); })],
  grab: [.16, 0, (H, t, o) => { H.tone('triangle', 520, 1040, t, .07, .2, o); H.tone('sine', 1560, 0, t + .05, .08, .08, o); }],
  power: [.45, 1, (H, t, o) => ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => {
    H.tone('triangle', NH(n), 0, t + i * .045, .08, .2, o); H.tone(H.p12, NH(n), 0, t + .07 + i * .045, .06, .04, o);
  })],
  shield: [.3, 1, (H, t, o) => {
    const s = H.tone('sine', 300, 900, t, .18, .22, o); H.wob(s, t, .18, 9, 40);
    H.noise(t, .15, .05, 'bandpass', 1200, 3000, 2, o); H.tone('sine', 1200, 1500, t + .12, .1, .07, o);
  }],
  heart: [.35, 1, (H, t, o) => { H.tone('triangle', NH('G5'), 0, t, .09, .2, o); H.tone('triangle', NH('C6'), 0, t + .09, .2, .2, o); H.tone('sine', NH('C7'), 0, t + .09, .15, .05, o); }],
  gift: [.35, 1, (H, t, o) => { ['E6', 'G6', 'C7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + i * .07, .1, .12, o)); H.tone('triangle', NH('C5'), 0, t, .25, .1, o); }],
  basket: [.6, 1, (H, t, o) => {
    ['C5', 'E5', 'G5'].forEach((n, i) => H.tone('triangle', NH(n), 0, t + i * .06, .07, .2, o));
    for (const n of ['C6', 'E6']) { H.tone('triangle', NH(n), 0, t + .18, .3, .14, o); H.tone(H.p12, NH(n) * 2, 0, t + .2, .2, .03, o); }
  }],
  // ouch, gently: a wobbly downward 'bwoo'
  hurt: [.38, 1, (H, t, o) => { const s = H.tone('triangle', 700, 300, t, .3, .3, o); H.wob(s, t, .3, 16, 30); H.tone(H.p25, 350, 150, t, .25, .05, o); }],
  bubble: [.45, 1, (H, t, o) => [[900, 500], [700, 380], [520, 260]].forEach(([a, b], i) => { const s = H.tone('sine', a, b, t + i * .12, .12, .2, o); H.wob(s, t + i * .12, .12, 20, 30); })],
  revive: [.6, 1, (H, t, o) => {
    ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => H.tone(H.p25, NH(n), 0, t + i * .07, .07, .08, o));
    const s = H.tone(H.p25, NH('C7'), 0, t + .28, .25, .08, o); H.wob(s, t + .34, .2, 7, 18); H.tone('triangle', NH('C4'), 0, t + .28, .3, .25, o);
  }],
  seedlet: [.2, 0, (H, t, o) => { H.noise(t, .15, .1, 'bandpass', 1500, 4000, 1.5, o); H.tone('triangle', 500, 1100, t, .1, .15, o); }],
  sun: [.5, 1, (H, t, o) => {
    H.noise(t, .3, .14, 'lowpass', 600, 5000, 1, o); H.tone('triangle', 300, 1200, t, .25, .2, o);
    for (const n of ['C6', 'E6', 'G6']) H.tone('sine', NH(n), 0, t + .1, .25, .05, o);
  }],
  cancel: [.05, 0, (H, t, o) => { H.tone('sine', 2700 + Math.random() * 600, 0, t, .03, .07, o); }],
  warning: [.9, 1, (H, t, o) => { for (let i = 0; i < 6; i++) { const f = NH(i % 2 ? 'E5' : 'A5'); H.tone('triangle', f, 0, t + i * .14, .11, .16, o); H.tone(H.p12, f * 2, 0, t + i * .14, .08, .03, o); } }],
  zap: [.22, 0, (H, t, o) => { const s = H.tone(H.p12, 880, 220, t, .18, .1, o); H.wob(s, t, .18, 40, 60); H.noise(t, .12, .08, 'bandpass', 2500, 1200, 2, o); }],
  bossDown: [1.4, 1, (H, t, o) => {
    for (let i = 0; i < 8; i++) SFX.pop[2](H, t + i * .07, o, 1 + i * .12);
    H.tone('triangle', 300, 1500, t + .1, .55, .14, o);
    for (const n of ['C5', 'E5', 'G5', 'C6']) H.tone('sine', NH(n), 0, t + .62, .6, .07, o);
  }],
  clear: [.6, 1, (H, t, o) => { H.tone('triangle', 400, 1600, t, .2, .14, o); [1800, 2400, 3000].forEach((f, i) => H.tone('sine', f, 0, t + .12 + i * .07, .1, .06, o)); }],
  start: [.45, 1, (H, t, o) => { H.tone('triangle', NH('C5'), 0, t, .08, .2, o); H.tone('triangle', NH('G5'), 0, t + .09, .08, .2, o); H.tone('triangle', NH('C6'), 0, t + .18, .22, .2, o); H.tone('sine', NH('E6'), 0, t + .18, .2, .06, o); }],
  join: [.35, 1, (H, t, o) => { H.tone('triangle', NH('E5'), NH('A5'), t, .12, .2, o); H.tone('sine', NH('E6'), 0, t + .12, .15, .08, o); }],
  select: [.06, 0, (H, t, o) => { H.tone('triangle', 900, 1300, t, .04, .14, o); }]
};
// rate limits: [max plays, per window s]
const RATE = { shot: [1, .075], hit: [2, .05], pop: [4, .06], popBig: [2, .1], bump: [2, .06], cancel: [1, .07], boing: [1, .1], grab: [2, .06], seedlet: [1, .1], zap: [2, .1] };
const RATE_DEF = [2, .04], MAXV = 20;

// ---------- one audio graph + synth + sequencer in a given context ----------
function create(ac) {
  const I = { ac, rl: {}, vox: [], seq: null, key: '', ch: null, muted: false, noLimits: false, dropped: 0, base: { master: .8, sfx: 1.5, mus: .42 } };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const dyn = (th, kn, ra, at, re) => { const c = ac.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = kn; c.ratio.value = ra; c.attack.value = at; c.release.value = re; return c; };
  const comp = dyn(-14, 6, 4, .003, .15), lim = dyn(-4, 0, 20, .001, .08), trim = gain(.8);
  I.master = gain(I.base.master); I.sfx = gain(I.base.sfx); I.mus = gain(I.base.mus);
  I.sfx.connect(I.master); I.mus.connect(I.master); I.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ac.destination);
  const pulse = d => { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * d); return ac.createPeriodicWave(re, im); };
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // synth helpers (H): exponential envelopes, glides, wobble LFOs, filtered noise
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

  // ----- sfx with rate limits and a voice cap (drop the oldest non-'keep' voice) -----
  function rateOk(name, t) {
    const r = RATE[name] || RATE_DEF, a = I.rl[name] || (I.rl[name] = []);
    while (a.length && a[0] <= t - r[1]) a.shift();
    if (a.length >= r[0]) return false;
    a.push(t); return true;
  }
  function voice(t, len, keep) {
    const v = I.vox;
    for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= t) v.splice(i, 1);
    if (v.length >= MAXV) {
      let k = v.findIndex(x => !x.keep); if (k < 0) k = 0;
      const d = v.splice(k, 1)[0]; d.g.gain.setTargetAtTime(0, t, .006); I.dropped++;
    }
    const g = gain(1); g.connect(I.sfx); v.push({ g, end: t + len, keep }); return g;
  }
  I.play = (name, arg, t) => {
    const d = SFX[name]; if (!d) return false;
    if (!I.noLimits && !rateOk(name, t)) return false;
    d[2](H, t, voice(t, d[0], d[1]), arg);
    if (name === 'warning') { const g = I.mus.gain; g.setTargetAtTime(I.base.mus * .6, t, .08); g.setTargetAtTime(I.base.mus, t + 3, .3); }
    return true;
  };
  I.setMute = (on, t) => { I.muted = !!on; const g = I.master.gain; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0 : I.base.master, t, .03); if (on) I.charge(null, t); };

  // ----- charge: one held voice, pitch and shimmer follow the level -----
  I.charge = (lv, t) => {
    let c = I.ch;
    if (lv == null || lv <= 0) {
      if (c) { c.g.gain.cancelScheduledValues(t); c.g.gain.setTargetAtTime(0, t, .025); for (const o of c.os) o.stop(t + .2); I.ch = null; }
      return;
    }
    const q = Math.min(60, lv) >> 2; // 16 steps
    if (!c) {
      c = I.ch = { q: -1, g: gain(0), tg: gain(1), o: H.osc('triangle'), o2: H.osc('sine'), l: ac.createOscillator(), lg: gain(0) };
      c.os = [c.o, c.o2, c.l]; c.g2 = gain(0);
      c.o.connect(c.tg); c.o2.connect(c.g2); c.g2.connect(c.tg); c.tg.connect(c.g); c.g.connect(I.sfx);
      c.l.connect(c.lg); c.lg.connect(c.tg.gain);
      for (const o of c.os) o.start(t);
    }
    if (q === c.q) return; c.q = q;
    const k = q / 15, f = 220 * Math.pow(2, k * 1.6), full = q >= 15;
    c.o.frequency.setTargetAtTime(f, t, .03); c.o2.frequency.setTargetAtTime(f * 3, t, .03);
    c.g.gain.setTargetAtTime(.025 + .035 * k, t, .04); c.g2.gain.setTargetAtTime(full ? .35 : .08 * k, t, .04);
    c.l.frequency.setTargetAtTime(full ? 12 : 4 + 6 * k, t, .05); c.lg.gain.setTargetAtTime(full ? .45 : .2 * k, t, .05);
  };

  // ----- music: 16th-step sequencer; the caller pumps schedule(now, until) -----
  I.music = (name, v, t) => {
    const key = name ? (name === 'stage' ? name + (v | 0) : name) : '';
    if (key === I.key) return; I.key = key;
    if (I.seq) { const o = I.seq.n; o.out.gain.setTargetAtTime(0, t, .06); I.seq = null; setTimeout(() => { try { for (const k in o) o[k].disconnect(); } catch (e) {} }, 900); }
    const d = songDef(name, v); if (!d) return;
    const sd = 60 / d.bpm / 4, n = { out: gain(1), mel: ac.createBiquadFilter(), drm: gain(1), lead: gain(1), dl: ac.createDelay(1), fb: gain(.28), wet: gain(.22) };
    n.mel.type = 'lowpass'; n.mel.frequency.value = d.lp; n.mel.Q.value = .5; n.dl.delayTime.value = sd * d.echo;
    n.out.connect(I.mus); n.mel.connect(n.out); n.drm.connect(n.out); n.lead.connect(n.mel);
    n.lead.connect(n.dl); n.dl.connect(n.fb); n.fb.connect(n.dl); n.dl.connect(n.wet); n.wet.connect(n.mel);
    I.seq = { d, n, sd, step: 0, next: t };
  };
  I.schedule = (now, until) => {
    const q = I.seq; if (!q) return false;
    if (q.next < now - .1) q.next = now + .03; // fell behind (throttled timer): skip ahead, never burst
    while (I.seq === q && q.next < until) {
      const s = q.step, sw = (s & 3) === 2 ? q.d.swing * q.sd : (s & 3) === 3 ? q.d.swing * q.sd * .5 : 0;
      if (!I.muted) step(q, s, q.next + sw);
      q.next += q.sd; q.step++;
      if (!q.d.loop && q.step >= q.d.L.length * 16) I.seq = null; // jingle done; key stays so it won't restart
    }
    return !!I.seq;
  };
  I.resync = now => { if (I.seq) I.seq.next = now + .05; };

  function step(q, s, t) {
    const d = q.d, nb = d.L.length, bar = (s >> 4) % nb, i = s & 15, pass = (s >> 4) / nb | 0, sd = q.sd, n = q.n;
    const cs = d.C[bar], c = cs[i >= 8 && cs.length > 1 ? 1 : 0], r = (c[0] + d.tr + 120) % 12, th = c[1];
    const breather = d.loop && pass % 3 === 2 && bar < 4; // every 3rd time round, the lead rests for 4 bars
    const L = d.L[bar][i];
    if (L && !breather) {
      const m = L[0] + d.tr; lead(d, n.lead, hz(m), t, L[1] * sd, L[1]);
      if (d.loop && pass % 2 === 1 && nb > 8 && bar >= 8) H.tone('sine', hz(m + 12), 0, t, Math.min(.3, L[1] * sd), .025, n.mel, .01);
    }
    // arpeggio / chord layer
    const a = 60 + r, T = [0, th, 7, 12], ag = breather ? 1.4 : 1;
    if (d.arp === 'eighth') { if (!(i & 1)) H.tone(H.p12, hz(a + T[[0, 1, 2, 1][(i >> 1) & 3]] + 12), 0, t, sd * 1.4, .04 * ag, n.mel); }
    else if (d.arp === 'dream') H.tone('triangle', hz(a + T[[0, 1, 2, 3, 2, 1, 2, 1][i & 7]] + 12), 0, t, sd * 3, .045 * ag, n.mel, .006);
    else if (d.arp === 'box') { if (!(i & 1)) H.tone('sine', hz(a + T[[0, 2, 1, 2, 3, 2, 1, 2][i >> 1]] + 12), 0, t, sd * 2.5, .06 * ag, n.mel, .002); }
    else if (d.arp === 'stab') { if ((i & 3) === 2) for (let k = 0; k < 3; k++) H.tone(H.p25, hz(a + T[k]), 0, t, sd * .9, .022 * ag, n.mel); }
    else if (d.arp === 'pad') { if (i === 0 || (i === 8 && cs.length > 1)) for (let k = 0; k < 3; k++) H.tone('triangle', hz(a + T[k]), 0, t, sd * (nb === bar + 1 ? 14 : 7), .045, n.mel, .03); }
    // bass (gentle triangle, E2..D#3)
    const b = 40 + ((r + 8) % 12), bt = (iv, dur, g) => H.tone('triangle', hz(b + iv), 0, t, dur, g, n.mel, .005);
    if (d.bass === 'bounce') { if (!(i & 1)) bt([0, 12, 7, 12][(i >> 1) & 3], sd * 1.6, .24); }
    else if (d.bass === 'walk') { if (!(i & 3)) bt([0, 7, 12, 7][i >> 2], sd * 3, .22); }
    else if (d.bass === 'dream') { if (i === 0) bt(0, sd * 7, .22); else if (i === 8) bt(7, sd * 7, .2); }
    else if (d.bass === 'drive') { if (!(i & 1)) bt([0, 0, 12, 0][(i >> 1) & 3], sd * 1.4, .22); }
    else if (d.bass === 'pad') { if (i === 0 || (i === 8 && cs.length > 1)) bt(0, sd * (cs.length > 1 ? 7 : 14), .22); }
    // light percussion from noise
    const o = n.drm, dr = d.drum;
    const kick = g => H.tone('sine', 150, 50, t, .12, g, o, .002);
    const snare = g => { H.noise(t, .1, g, 'bandpass', 1800, 0, .8, o); H.tone('triangle', 220, 160, t, .05, g * .4, o); };
    const hat = g => H.noise(t, .025, g, 'highpass', 7000, 0, .7, o);
    const rim = g => H.noise(t, .03, g, 'bandpass', 2500, 0, 4, o);
    if (dr === 'pop') { if (i === 0 || i === 8) kick(.22); if (i === 4 || i === 12) snare(.09); if ((i & 3) === 2) hat(.03); }
    else if (dr === 'soft') { if (i === 0) kick(.16); if (i === 10) kick(.08); if (i === 4 || i === 12) rim(.05); if (!(i & 1)) hat(.012); }
    else if (dr === 'swing') { if (i === 0 || i === 8) kick(.22); if (i === 4 || i === 12) snare(.08); if ((i & 3) === 2) H.noise(t, .04, .05, 'bandpass', 3000, 0, 8, o); }
    else if (dr === 'drive') { if (!(i & 3)) kick(.2); if (i === 4 || i === 12) snare(.09); if (i & 1) hat(.022); else hat(.012); }
    else if (dr === 'dream') { if (i === 0) kick(.12); if (i === 8) rim(.03); if ((i & 3) === 2) hat(.012); }
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

// ---------- live wrapper ----------
let I = null, muted = /[?&]mute=1/.test((window.location && window.location.search) || ''), hid = false, want = null, timer = 0;
const now = () => I.ac.currentTime;
function pump() { timer = 0; if (!I || hid) return; try { if (I.schedule(now(), now() + .12)) run(); } catch (e) {} }
function run() { if (!timer && I && !hid && I.seq) timer = setTimeout(pump, 25); }
const A = BB.Audio = {
  ready: false,
  SFX_NAMES: Object.keys(SFX), MUSIC_NAMES: Object.keys(SONGS),
  unlock() {
    if (!AC) return;
    try {
      if (!I) {
        I = create(new AC()); A.ready = true; I.setMute(muted, 0);
        const b = I.ac.createBuffer(1, 1, 22050), s = I.ac.createBufferSource(); s.buffer = b; s.connect(I.ac.destination); s.start(0); // iOS wake
        if (want) I.music(want[0], want[1], now() + .06);
      }
      if (!hid && I.ac.state !== 'running' && I.ac.resume) I.ac.resume().catch(() => {});
      run();
    } catch (e) {}
  },
  play(name, arg) { if (!I || muted || hid) return; try { I.play(name, arg, now() + .002); } catch (e) {} },
  charge(level) { if (!I) return; try { I.charge(muted || hid ? null : level, now()); } catch (e) {} },
  music(name, variant) {
    const v = variant | 0;
    if (want ? want[0] !== name || want[1] !== v : name) want = name ? [name, v] : null;
    if (!I) return;
    try { I.music(name, variant, now() + .06); run(); } catch (e) {}
  },
  mute(on) { muted = !!on; if (!I) return; try { I.setMute(muted, now()); } catch (e) {} },
  hidden(on) {
    hid = !!on; if (!I) return;
    try {
      if (hid) { clearTimeout(timer); timer = 0; I.charge(null, now()); if (I.ac.suspend) I.ac.suspend().catch(() => {}); }
      else { if (I.ac.resume) I.ac.resume().catch(() => {}); I.resync(now()); run(); }
    } catch (e) {}
  },
  // test hook: the same graph/synth/sequencer in any context (e.g. an OfflineAudioContext); nothing is played live
  _render(ctx) { return create(ctx); }
};
})();
