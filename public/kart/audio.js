/* SPROUT KART — audio.js (AUDIO). SK.Audio: every sound and tune is made with WebAudio in code, no files, all original.
   Graph: sfx voices, the drift skid, the engine hums → sfx bus ┐
          song (lead + echo → lowpass, drums) → music bus ─────┴→ master (mute) → compressor → limiter → trim → out
   With ?mute=1 every call is a no-op: no AudioContext is ever made and nothing is stored. Otherwise nothing is made before
   unlock() (call it from a user gesture). 'kart-mute' (all sound) and 'kart-music' (music only) are read at load and stored
   by mute(on) / musicOn(on); musicOn() with no argument just reports. Nothing here ever throws, with or without WebAudio.
     play(name, arg)          one-shots (SFX_NAMES; ALIASES map other names); play('drift', true | 1..3 | false) holds the soft
                              skid loop (1 green, 2 orange, 3 gold sparks: brighter, a ting on each step up; false stops it)
     engine(i, speed01[, near]) a soft putt-putt hum for kart i, pitch and volume by speed; engine(i, -1) silences it. At most 4
                              hums at once (the loudest win); call it each frame for the viewed karts (near omitted = 1), and
                              optionally for a CPU kart near the camera with near 0..1 as its volume. A hum not fed for 0.35 s
                              fades out by itself
     music(name | null[, v])  MUSIC_NAMES; v 1 on a race tune = the final lap (a little quicker, carries on from the same step)
     hidden(on)               silences everything (tab hidden / room closed) and suspends the context
   SK.Audio._render(ctx) builds the same graph in any (Offline)AudioContext, for tests. */
'use strict';
(function () {
const SK = window.SK = window.SK || {};
const SILENT = (() => { try { return /[?&]mute=1(?:&|$)/.test(String((window.location && window.location.search) || '')); } catch (e) { return false; } })();
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/* ---------- notes ---------- */
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const mid = s => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] ? -1 : 0) + (+m[3] + 1) * 12; };
const NH = s => hz(mid(s));

/* ---------- songs (all original): 16 steps a bar, '-' holds, '.' rests; one or two chords a bar; every one loops ---------- */
const SONGS = {
  /* the title: a sunny lilt in D */
  title: { bpm: 116, wave: 'flute', lv: .15, lp: 4000, arp: 'box', bass: 'walk', drum: 'soft', echo: 3,
    ch: ['D', 'Bm', 'G', 'A', 'D', 'F#m', 'Em A', 'D', 'G', 'A', 'F#m', 'Bm', 'G', 'A', 'Em', 'A'],
    lead: ['F#5 - - A5 - - D6 - C#6 - B5 - A5 - - -', 'B5 - - D6 - - F#6 - E6 - D6 - B5 - . .',
           'G5 - - B5 - - D6 - - - B5 - G5 - A5 -', 'A5 - - - E5 - - - C#5 - E5 - A5 - . .',
           'F#5 - - A5 - - D6 - E6 - F#6 - E6 - D6 -', 'C#6 - - A5 - - F#5 - - - A5 - C#6 - . .',
           'B5 - - G5 - - E5 - C#5 - E5 - G5 - A5 -', 'D6 - - - A5 - F#5 - D5 - - - . . . .',
           'B4 - D5 - G5 - - - F#5 - G5 - B5 - - -', 'C#5 - E5 - A5 - - - G5 - A5 - C#6 - - -',
           'C#6 - B5 - A5 - F#5 - - - E5 - F#5 - A5 -', 'B5 - - - - - D6 - C#6 - B5 - F#5 - . .',
           'D6 - - B5 - - G5 - - - B5 - D6 - G6 -', 'F#6 - - E6 - - C#6 - - - A5 - B5 - C#6 -',
           'B5 - - - G5 - E5 - G5 - B5 - E6 - D6 -', 'C#6 - - - A5 - - - E5 . F#5 . G5 . . .'] },
  /* Patchwork Meadows: bright and bouncy, in F */
  meadows: { bpm: 144, wave: 'p25', lv: .12, lp: 3600, arp: 'eighth', bass: 'bounce', drum: 'pop', echo: 3,
    ch: ['F', 'Gm C', 'Bb', 'C', 'F', 'Dm', 'Gm', 'C', 'Bb', 'C', 'Am', 'Dm', 'Gm', 'C', 'F', 'C'],
    lead: ['C5 . F5 . A5 . F5 . C6 - - . A5 . . .', 'G5 . A5 . Bb5 . A5 . G5 - F5 - G5 - . .',
           'D6 . . D6 . . Bb5 . F5 - Bb5 - D6 - . .', 'C6 - - . G5 . E5 . G5 - - . C6 . . .',
           'A5 . C6 . F6 - C6 . A5 . F5 . A5 - . .', 'D6 . . A5 . . F5 . D5 - F5 - A5 - . .',
           'Bb5 - G5 - D5 - G5 - Bb5 - D6 - C6 - Bb5 -', 'A5 - - - G5 - - . E5 . G5 . C6 - . .',
           'D6 - - . F6 - D6 . Bb5 - - . F5 - . .', 'E6 - - . G6 - E6 . C6 - - . G5 - . .',
           'A5 . C6 . E6 - C6 . A5 . E5 . A5 - C6 -', 'D6 - - - A5 - F5 - D5 - - . F5 . A5 .',
           'Bb5 - - . D6 . Bb5 . G5 - - . Bb5 . D6 .', 'C6 - - . E6 . C6 . G5 - A5 - Bb5 - C6 -',
           'F6 - - - C6 - A5 - F5 - A5 - C6 - - -', 'G5 - - - . . E5 . G5 . Bb5 . C6 . . .'] },
  /* Candyfloss Skyway: dreamy and airy, long notes over a rolling arpeggio, in Bb (with a borrowed Ebm) */
  skyway: { bpm: 100, wave: 'tri', lv: .15, lp: 2500, arp: 'dream', bass: 'dream', drum: 'dream', echo: 6,
    ch: ['Bb', 'Dm', 'Eb', 'F', 'Bb', 'Gm', 'Eb', 'Ebm', 'Gm', 'Dm', 'Eb', 'Bb', 'Cm', 'F', 'Eb', 'F'],
    lead: ['D5 - - - - - F5 - Bb5 - - - - - A5 -', 'A5 - - - - - - - F5 - - - D5 - - -',
           'G5 - - - - - Bb5 - Eb6 - - - D6 - C6 -', 'C6 - - - - - - - A5 - - - . . . .',
           'F5 - - - Bb5 - - - D6 - - - F6 - - -', 'D6 - - - - - Bb5 - G5 - - - D5 - - -',
           'Eb5 - - - G5 - Bb5 - Eb6 - - - - - D6 -', 'Db6 - - - - - Bb5 - Gb5 - - - . . . .',
           'G5 - - - Bb5 - - - D6 - - - C6 - Bb5 -', 'A5 - - - - - - - D6 - - - A5 - - -',
           'Bb5 - - - - - G5 - Eb5 - - - G5 - Bb5 -', 'D6 - - - - - - - - - - - . . . .',
           'Eb6 - - - - - C6 - G5 - - - C6 - Eb6 -', 'F6 - - - - - - - C6 - - - A5 - - -',
           'G5 - - - Bb5 - - - Eb6 - - - D6 - - -', 'C6 - - - - - - - - - - - . . . .'] },
  /* Clatter Works: clanky and playful, swung, oom-pah under it and little spanner tinks, in G */
  works: { bpm: 132, swing: .28, wave: 'p25', lv: .11, lp: 3300, arp: 'pah', bass: 'oom', drum: 'clank', echo: 2,
    ch: ['G', 'G', 'C', 'D', 'G', 'E', 'Am', 'D', 'C', 'Cm', 'G', 'E', 'Am', 'D', 'G', 'D'],
    lead: ['G5 . G5 . B5 . D6 . B5 . G5 . A5 - B5 .', 'D6 . . B5 . . G5 . D5 . G5 . B5 - . .',
           'C6 . C6 . E6 . G6 . E6 . C6 . D6 - E6 .', 'F#6 - - . D6 . A5 . F#5 . A5 . D6 - . .',
           'B5 . A5 . G5 . A5 . B5 . D6 . G6 - . .', 'G#6 - - . E6 . B5 . G#5 . B5 . E6 - D6 .',
           'C6 . B5 . A5 . E5 . A5 . B5 . C6 - E6 .', 'D6 - - - A5 . F#5 . D5 . . . . . . .',
           'E5 . G5 . C6 . . . E5 . G5 . C6 . . .', 'Eb5 . G5 . C6 . . . Eb6 . D6 . C6 . . .',
           'B5 - - . D6 . B5 . G5 - - . D5 . G5 .', 'G#5 - - . B5 . E6 . G#6 - - . E6 . B5 .',
           'A5 . C6 . E6 . C6 . A5 . E5 . C6 - B5 .', 'A5 . F#5 . D5 . F#5 . A5 . D6 . F#6 - E6 .',
           'D6 - B5 - G5 - B5 - D6 - G6 - - - . .', 'F#6 . E6 . D6 . C6 . B5 . A5 . F#5 . . .'] },
  /* results: a happy cadence with claps, in C */
  results: { bpm: 120, wave: 'flute', lv: .15, lp: 4400, arp: 'roll', bass: 'bounce', drum: 'clap', echo: 3,
    ch: ['C', 'F', 'C', 'G', 'Am', 'F', 'D', 'G', 'C', 'E', 'Am', 'F', 'C', 'G', 'F G', 'C'],
    lead: ['E5 - G5 - C6 - - - B5 - C6 - D6 - E6 -', 'F6 - - - C6 - A5 - F5 - - - A5 - C6 -',
           'E6 - - - G5 - - - C6 - E6 - G6 - - -', 'F6 - - - D6 - B5 - G5 - - - . . . .',
           'A5 - C6 - E6 - - - D6 - C6 - B5 - A5 -', 'C6 - - - A5 - F5 - A5 - - - C6 - F6 -',
           'F#6 - - - D6 - A5 - F#5 - A5 - D6 - - -', 'D6 - - - B5 - - - G5 - - - . . . .',
           'G5 - C6 - E6 - G6 - - - E6 - C6 - - -', 'G#5 - B5 - E6 - G#6 - - - E6 - B5 - - -',
           'A5 - - - C6 - E6 - A6 - - - G6 - E6 -', 'F6 - - - C6 - - - A5 - C6 - F6 - - -',
           'E6 - - - - - D6 - C6 - - - G5 - - -', 'B5 - - - D6 - - - G6 - - - F6 - - -',
           'A6 - - - F6 - C6 - B5 - D6 - G6 - F6 -', 'E6 - - - - - - - C6 - - - . . . .'] }
};
/* the final lap (music(name, 1)): the same race tune a little quicker and brighter */
const VARIED = { meadows: [{}, { bpm: 156, lp: 3900 }], skyway: [{}, { bpm: 108, lp: 2800 }], works: [{}, { bpm: 144, lp: 3600 }] };
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
const vOf = (name, v) => has(VARIED, name) ? Math.max(0, Math.min(VARIED[name].length - 1, v | 0)) : 0;
function songDef(name, v) { if (!has(SONGS, name)) return null; return Object.assign({ tr: 0, swing: 0, loop: 1 }, SONGS[name], has(VARIED, name) ? VARIED[name][vOf(name, v)] : {}); }

/* ---------- sound effects: [voice length s, keep (never dropped first), fn(H, t, out, arg)]; cute and soft, nothing harsh ---------- */
const SFX = {
  /* 3, 2, 1: a round little boop */
  count: [.25, 1, (H, t, o) => { H.tone('triangle', NH('E5'), 0, t, .16, .3, o); H.tone('sine', NH('E6'), 0, t, .1, .08, o); H.tone('sine', NH('B6'), 0, t + .005, .05, .025, o); }],
  /* GO: a quick bright roll up and a held chirp */
  go: [.6, 1, (H, t, o) => {
    ['E5', 'G#5', 'B5'].forEach((n, i) => H.tone('triangle', NH(n), 0, t + i * .035, .08, .2, o));
    H.tone('triangle', NH('E6'), 0, t + .1, .34, .24, o); H.tone('sine', NH('B6'), 0, t + .1, .3, .06, o);
    H.noise(t + .1, .35, .03, 'highpass', 5000, 9000, .7, o);
  }],
  /* a sunberry or a boost pad: a rising whoosh with a bright zing on top */
  boost: [.55, 1, (H, t, o) => {
    H.noise(t, .42, .09, 'bandpass', 500, 3800, 1.4, o);
    H.tone('triangle', 260, 780, t, .3, .16, o, .01); H.tone('sine', 880, 1760, t + .08, .22, .06, o);
  }],
  /* a mini-turbo let go: arg 1 green, 2 orange, 3 gold, each higher, longer and brighter */
  turbo: [.7, 1, (H, t, o, a) => {
    const k = Math.max(1, Math.min(3, a | 0 || 1)), f = [0, 330, 392, 494][k];
    H.tone('triangle', f, f * 2, t, .12 + .04 * k, .2, o); H.noise(t, .18 + .08 * k, .07, 'bandpass', 800, 2400 + 900 * k, 1.2, o);
    if (k >= 2) H.tone('sine', f * 2, f * 3, t + .06, .12, .06, o);
    if (k === 3) ['E6', 'G#6', 'B6', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .1 + i * .04, .08, .04, o));
  }],
  /* the little hop into a drift */
  hop: [.14, 0, (H, t, o) => { H.tone('triangle', 300, 620, t, .07, .1, o); H.noise(t, .04, .03, 'bandpass', 1800, 0, 1.5, o); }],
  /* the item roulette: a soft woody tick (arg: a tick count, it steps the pitch a little) */
  item: [.05, 0, (H, t, o, a) => { const f = 1250 + ((a | 0) & 3) * 120; H.tone('triangle', f, f * .85, t, .025, .07, o, .002); }],
  /* the roulette settles on an item */
  got: [.35, 1, (H, t, o) => { H.tone('triangle', NH('B5'), 0, t, .07, .18, o); H.tone('triangle', NH('E6'), 0, t + .07, .18, .18, o); H.tone('sine', NH('E7'), 0, t + .07, .12, .04, o); }],
  /* through an item box: a bubbly pop and a little sparkle */
  box: [.35, 0, (H, t, o) => {
    H.tone('sine', 420, 1100, t, .07, .22, o); H.noise(t, .05, .06, 'bandpass', 2400, 0, 2, o);
    ['G6', 'B6', 'D7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .06 + i * .045, .07, .05, o));
  }],
  /* an item thrown or dropped: a short swish */
  throw: [.2, 0, (H, t, o) => { H.noise(t, .12, .06, 'bandpass', 800, 2600, 1.2, o); H.tone('triangle', 500, 900, t, .08, .07, o); }],
  /* a juice splat: a juicy squelch */
  splat: [.4, 0, (H, t, o) => {
    H.noise(t, .18, .14, 'lowpass', 2400, 300, 1.2, o);
    const s = H.tone('sine', 520, 140, t, .22, .2, o, .004); H.wob(s, t, .22, 30, 40); H.tone('triangle', 900, 300, t + .02, .08, .05, o);
  }],
  /* a berry bomb landing: a soft whump and a puff of juice, never a bang */
  bomb: [.55, 1, (H, t, o) => {
    H.tone('sine', 130, 42, t, .32, .34, o, .006); H.tone('triangle', 220, 90, t, .12, .1, o);
    H.noise(t, .3, .12, 'lowpass', 900, 120, .7, o); H.noise(t + .06, .2, .03, 'bandpass', 1400, 600, 1, o);
  }],
  /* a seeker seed on its way: a slide whistle up and gently down */
  seeker: [.75, 1, (H, t, o) => {
    const s = H.osc('sine'), g = H.ac.createGain();
    s.frequency.setValueAtTime(900, t); s.frequency.exponentialRampToValueAtTime(1700, t + .25); s.frequency.exponentialRampToValueAtTime(1250, t + .6);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.09, t + .04); g.gain.setValueAtTime(.09, t + .45); g.gain.exponentialRampToValueAtTime(.0001, t + .66);
    s.connect(g); g.connect(o); s.start(t); s.stop(t + .7); H.wob(s, t, .66, 7, 25);
    H.noise(t, .6, .012, 'bandpass', 1500, 1300, 6, o);
  }],
  /* a bubble shield: bub-bub up and a shimmer */
  shield: [.6, 1, (H, t, o) => {
    [[300, 600], [450, 900]].forEach(([a, b], i) => { const s = H.tone('sine', a, b, t + i * .09, .1, .2, o, .006); H.wob(s, t + i * .09, .1, 18, 25); });
    ['E6', 'A6', 'C#7', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .18 + i * .04, .12, .04, o));
    H.noise(t + .18, .3, .02, 'highpass', 5000, 9000, .7, o);
  }],
  /* the shield takes a hit and pops */
  pop: [.25, 0, (H, t, o) => { H.tone('sine', 1000, 260, t, .1, .18, o); H.noise(t, .06, .06, 'highpass', 3000, 0, .7, o); H.tone('sine', NH('A6'), 0, t + .08, .1, .04, o); }],
  /* starfruit: a sparkle jingle */
  star: [.95, 1, (H, t, o) => {
    ['A5', 'B5', 'C#6', 'E6', 'F#6', 'A6', 'B6', 'C#7'].forEach((n, i) => { const f = NH(n), u = t + i * .04; H.tone('triangle', f, 0, u, .08, .13, o); H.tone(H.p12, f * 2, 0, u + .01, .04, .02, o); });
    for (let i = 0; i < 6; i++) H.tone('sine', 2700 + ((i * 1597) % 2100), 0, t + .1 + i * .07, .05, .03, o);
    for (const n of ['E6', 'A6', 'C#7']) H.tone('sine', NH(n), 0, t + .36, .45, .07, o, .01);
    H.noise(t + .34, .4, .025, 'highpass', 6000, 10000, .7, o);
  }],
  /* spun round: a cartoon boing and a whirly wind-down */
  hit: [.75, 1, (H, t, o) => {
    const b = H.tone('sine', 150, 330, t, .3, .3, o, .005); H.wob(b, t, .3, 13, 26);
    const w = H.tone('triangle', 700, 260, t + .12, .55, .1, o, .01); H.wob(w, t + .12, .55, 11, 60);
    H.tone('sine', 1200, 1600, t, .05, .05, o);
  }],
  /* a bump (a wall or another kart): a soft thud with a little spring */
  bump: [.22, 0, (H, t, o) => {
    H.tone('sine', 180, 90, t, .1, .22, o, .003); const s = H.tone('triangle', 330, 500, t + .01, .09, .07, o); H.wob(s, t + .01, .09, 22, 30);
    H.noise(t, .05, .05, 'lowpass', 1200, 400, .8, o);
  }],
  /* off the cloud road: a soft slide whistle down; then the balloon lifts you back on: a bubbly rise */
  fall: [.8, 1, (H, t, o) => { const s = H.tone('sine', 1400, 320, t, .7, .08, o, .02); H.wob(s, t, .7, 6, 20); }],
  lift: [.8, 1, (H, t, o) => {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => { const f = NH(n), s = H.tone('sine', f, f * 1.06, t + i * .1, .12, .14, o, .008); H.wob(s, t + i * .1, .12, 14, f * .02); });
    H.noise(t, .6, .02, 'bandpass', 600, 2400, 1, o);
  }],
  /* a lap done: a bright two-note chime */
  lap: [.5, 1, (H, t, o) => { H.tone('triangle', NH('A5'), 0, t, .1, .2, o); H.tone('triangle', NH('E6'), 0, t + .1, .3, .2, o); H.tone('sine', NH('E7'), 0, t + .1, .2, .04, o); }],
  /* the final lap: a short fanfare (the music dips under it) */
  final: [1.4, 1, (H, t, o) => {
    for (const [n, d, l] of [['C5', 0, .07], ['E5', .08, .07], ['G5', .16, .07], ['C6', .26, .2], ['A5', .5, .08], ['C6', .6, .08], ['E6', .72, .5]]) {
      H.tone(H.p25, NH(n), 0, t + d, l, .08, o, .006); H.tone('triangle', NH(n), 0, t + d, l, .14, o, .006);
    }
    for (const n of ['C5', 'G5', 'C6']) H.tone('triangle', NH(n), 0, t + .72, .55, .06, o, .02);
    H.noise(t + .72, .5, .025, 'highpass', 6000, 9000, .7, o);
  }],
  /* over the line: a run up, a chord bloom and twinkles (the music dips under it) */
  finish: [1.5, 1, (H, t, o) => {
    ['G5', 'C6', 'E6', 'G6'].forEach((n, i) => { H.tone('triangle', NH(n), 0, t + i * .06, .09, .2, o); H.tone('sine', NH(n) * 2, 0, t + i * .06, .05, .03, o); });
    for (const n of ['C6', 'E6', 'G6', 'C7']) H.tone('sine', NH(n), 0, t + .26, .8, .07, o, .01);
    H.tone('triangle', NH('C5'), 0, t + .26, .8, .14, o, .01);
    for (let i = 0; i < 7; i++) H.tone('sine', 2500 + ((i * 1777) % 2200), 0, t + .3 + i * .08, .05, .03, o);
  }],
  /* a new best time */
  best: [1, 1, (H, t, o) => {
    ['G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) => { H.tone('triangle', NH(n), 0, t + i * .06, .09, .14, o); H.tone(H.p12, NH(n), 0, t + .05 + i * .06, .05, .03, o); });
    H.noise(t + .3, .4, .025, 'highpass', 6000, 10000, .7, o);
  }],
  /* menus: move (a tiny blip) and choose */
  menu: [.05, 0, (H, t, o) => { H.tone('sine', 1000, 1180, t, .035, .1, o, .002); }],
  select: [.3, 1, (H, t, o) => { H.tone('triangle', NH('G5'), 0, t, .06, .18, o); H.tone('triangle', NH('D6'), 0, t + .06, .14, .18, o); H.tone('sine', NH('D7'), 0, t + .06, .08, .03, o); }]
};
/* other names the game may use for the same sounds */
const ALIAS = { beep: 'count', countdown: 'count', start: 'go', pad: 'boost', sunberry: 'boost', skid: 'drift', miniturbo: 'turbo', jump: 'hop',
  roulette: 'item', tick: 'item', itembox: 'box', puddle: 'splat', juice: 'splat', whistle: 'seeker', bubble: 'shield', unshield: 'pop',
  starfruit: 'star', spin: 'hit', wall: 'bump', balloon: 'lift', finalLap: 'final', goal: 'finish', blip: 'menu', move: 'menu', confirm: 'select' };
/* rate limits [max plays, per window s]; the music dips under these for the given seconds */
const RATE = { item: [1, .045], menu: [2, .05], select: [2, .05], count: [1, .3], go: [1, .5], bump: [2, .1], box: [3, .08], splat: [2, .1], hop: [2, .08],
  throw: [2, .08], boost: [2, .12], turbo: [2, .15], hit: [2, .2], lap: [1, .3], final: [1, 1], finish: [1, .5] }, RATE_DEF = [2, .05], MAXV = 20;
const DUCK = { final: 1.5, finish: 1.6 };
/* the drift skid by spark colour: band centre, flutter rate, spark crackle gap and level */
const DRF = [0, 1500, 2000, 2600], DLF = [0, 13, 16, 19], DSP = [0, .22, .14, .1], DSG = [0, .012, .016, .02], ENG_MAX = 4;

/* ---------- one audio graph + synth + sequencer in a given context ---------- */
function create(ac) {
  const I = { ac, rl: {}, vox: [], seq: null, key: '', dr: null, eng: [], muted: false, musOn: true, noLimits: false, base: { master: .8, sfx: 1.4, mus: .4 } };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const dyn = (th, kn, ra, at, re) => { const c = ac.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = kn; c.ratio.value = ra; c.attack.value = at; c.release.value = re; return c; };
  const comp = dyn(-14, 6, 4, .003, .15), lim = dyn(-4, 0, 20, .001, .08), trim = gain(.8);
  I.master = gain(I.base.master); I.sfx = gain(I.base.sfx); I.mus = gain(I.base.mus);
  I.sfx.connect(I.master); I.mus.connect(I.master); I.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ac.destination);
  const pulse = d => { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * d); return ac.createPeriodicWave(re, im); };
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  /* synth helpers (H): exponential envelopes, glides, wobble LFOs, filtered noise */
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

  /* ----- sfx with rate limits and a voice cap (drop the oldest non-'keep' voice) ----- */
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
  I.play = (name, arg, t) => {
    if (!has(SFX, name)) return false;
    if (!I.noLimits && !rateOk(name, t)) return false;
    SFX[name][2](H, t, voice(t, SFX[name][0], SFX[name][1]), arg);
    if (DUCK[name] && I.musOn && !I.muted) { const g = I.mus.gain; g.cancelScheduledValues(t); g.setTargetAtTime(I.base.mus * .35, t, .05); g.setTargetAtTime(I.base.mus, t + DUCK[name], .3); }
    return true;
  };
  I.setMute = (on, t) => { I.muted = !!on; const g = I.master.gain; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0 : I.base.master, t, .03); if (on) { I.drift(0, t); I.engAll(t); } };
  /* music only: the bus reaches 0 by t+0.1; schedule() stops making notes but keeps counting */
  I.setMusicOn = (on, t) => { I.musOn = !!on; const g = I.mus.gain; g.cancelScheduledValues(t); if (on) g.setTargetAtTime(I.base.mus, t, .03); else { g.setTargetAtTime(0, t, .018); g.setValueAtTime(0, t + .1); } };

  /* ----- the drift skid: one held voice (band-passed noise with a flutter), lv 1..3 by spark colour, 0 stops ----- */
  I.drift = (lv, t) => {
    let d = I.dr;
    if (!lv) {
      if (d) { I.dr = null; d.g.gain.cancelScheduledValues(t); d.g.gain.setTargetAtTime(0, t, .04); d.s.stop(t + .4); d.l.stop(t + .4); setTimeout(() => { try { d.g.disconnect(); } catch (e) {} }, 900); }
      return;
    }
    if (!d) {
      d = I.dr = { s: ac.createBufferSource(), f: ac.createBiquadFilter(), am: gain(.7), l: ac.createOscillator(), lg: gain(.3), g: gain(0), lv, last: t, spark: t + .05 };
      d.s.buffer = nb; d.s.loop = true; d.f.type = 'bandpass'; d.f.Q.value = 1.6; d.f.frequency.value = DRF[lv]; d.l.frequency.value = DLF[lv];
      d.s.connect(d.f); d.f.connect(d.am); d.am.connect(d.g); d.g.connect(I.sfx); d.l.connect(d.lg); d.lg.connect(d.am.gain);
      d.g.gain.setValueAtTime(0, t); d.g.gain.setTargetAtTime(.05, t, .03); d.s.start(t, Math.random() * .5); d.l.start(t);
    } else if (lv !== d.lv) {
      if (lv > d.lv) { H.tone('sine', NH(lv === 3 ? 'B6' : 'E6'), 0, t, .1, .05, I.sfx); H.tone('triangle', NH(lv === 3 ? 'B5' : 'E5'), 0, t, .06, .05, I.sfx); } /* the sparks change colour */
      d.lv = lv; d.f.frequency.setTargetAtTime(DRF[lv], t, .05); d.l.frequency.setTargetAtTime(DLF[lv], t, .05);
    }
    d.last = t;
  };

  /* ----- engine hums: a soft buzzy wave → lowpass → a putt-putt tremolo; pitch, brightness, putter rate and level follow speed ----- */
  const EW = (() => { const n = 12, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) im[k] = (k & 1 ? 1 : .55) / Math.pow(k, 1.2); return ac.createPeriodicWave(re, im); })();
  I.engine = (i, s, near, t) => {
    let v = null; for (const x of I.eng) if (x.i === i) v = x;
    if (!(s >= 0) || !(near > 0)) { if (v) I.engOff(v, t); return; }
    s = Math.min(1.3, s); const vol = Math.min(1, near);
    if (!v) {
      if (I.eng.length >= ENG_MAX) { let w = I.eng[0]; for (const x of I.eng) if (x.vol < w.vol) w = x; if (w.vol >= vol) return; I.engOff(w, t); }
      const det = 1 + (((i * 5) % 7) - 3) * .025; /* each kart its own note */
      v = { i, det, s: -1, vol: -1, last: t, upd: -1, o: H.osc(EW), f: ac.createBiquadFilter(), am: gain(.72), l: ac.createOscillator(), lg: gain(.28), g: gain(0) };
      v.f.type = 'lowpass'; v.f.Q.value = 1.1; v.f.frequency.value = 600; v.o.frequency.value = 88 * det; v.l.frequency.value = 8;
      v.o.connect(v.f); v.f.connect(v.am); v.am.connect(v.g); v.g.connect(I.sfx); v.l.connect(v.lg); v.lg.connect(v.am.gain);
      v.o.start(t); v.l.start(t); I.eng.push(v);
    }
    v.last = t;
    if (t - v.upd < .045 && Math.abs(s - v.s) < .08 && Math.abs(vol - v.vol) < .1) return; /* fed every frame: the params move ~20 times a second */
    v.upd = t; v.s = s; v.vol = vol;
    v.o.frequency.setTargetAtTime((88 + 150 * s) * v.det, t, .07);
    v.f.frequency.setTargetAtTime(600 + 1800 * s, t, .07);
    v.l.frequency.setTargetAtTime(8 + 22 * s, t, .07);
    v.g.gain.setTargetAtTime(vol * (.04 + .05 * Math.min(1, s)), t, .06);
  };
  I.engOff = (v, t) => {
    const k = I.eng.indexOf(v); if (k < 0) return; I.eng.splice(k, 1);
    v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, .05); v.o.stop(t + .4); v.l.stop(t + .4);
    setTimeout(() => { try { v.g.disconnect(); } catch (e) {} }, 900);
  };
  I.engAll = t => { while (I.eng.length) I.engOff(I.eng[0], t); };
  /* the held voices, from the pump: drift sparks crackle, a drift not refreshed for 8 s stops, unfed hums fade */
  I.tick = now => {
    const d = I.dr;
    if (d) {
      if (now - d.last > 8) I.drift(0, now);
      else { if (d.spark < now) d.spark = now; while (d.spark < now + .1) { H.tone('sine', 2600 + Math.random() * 2400, 0, d.spark, .018, DSG[d.lv], I.sfx, .002); d.spark += DSP[d.lv] * (.6 + Math.random() * .8); } }
    }
    for (let k = I.eng.length - 1; k >= 0; k--) if (now - I.eng[k].last > .35) I.engOff(I.eng[k], now);
    return !!(I.dr || I.eng.length);
  };

  /* ----- music: 16th-step sequencer; the caller pumps schedule(now, until) ----- */
  I.music = (name, v, t) => {
    const key = name ? (has(VARIED, name) ? name + vOf(name, v) : name) : '';
    if (key === I.key) return; I.key = key;
    let step0 = 0, t0 = t;
    if (I.seq) {
      const o = I.seq.n; if (name && I.seq.name === name) { step0 = I.seq.step; t0 = Math.max(t, I.seq.next); } /* the final-lap variant carries on from the same step */
      o.out.gain.setTargetAtTime(0, t, .06); I.seq = null; setTimeout(() => { try { for (const k in o) o[k].disconnect(); } catch (e) {} }, 900);
    }
    const d = songDef(name, v); if (!d) return;
    const sd = 60 / d.bpm / 4, n = { out: gain(1), mel: ac.createBiquadFilter(), drm: gain(1), lead: gain(1), dl: ac.createDelay(1), fb: gain(.26), wet: gain(.2) };
    n.mel.type = 'lowpass'; n.mel.frequency.value = d.lp; n.mel.Q.value = .5; n.dl.delayTime.value = Math.min(.95, sd * d.echo);
    n.out.connect(I.mus); n.mel.connect(n.out); n.drm.connect(n.out); n.lead.connect(n.mel);
    n.lead.connect(n.dl); n.dl.connect(n.fb); n.fb.connect(n.dl); n.dl.connect(n.wet); n.wet.connect(n.mel);
    I.seq = { name, d, n, sd, step: step0, next: t0 };
  };
  I.schedule = (now, until) => {
    const q = I.seq; if (!q) return false;
    if (q.next < now - .1) q.next = now + .03; /* fell behind (a throttled timer): skip ahead, never burst */
    while (I.seq === q && q.next < until) {
      const s = q.step, sw = (s & 3) === 2 ? q.d.swing * q.sd : (s & 3) === 3 ? q.d.swing * q.sd * .5 : 0;
      if (!I.muted && I.musOn) step(q, s, q.next + sw);
      q.next += q.sd; q.step++;
    }
    return !!I.seq;
  };
  I.resync = now => { if (I.seq) I.seq.next = now + .05; };

  function step(q, s, t) {
    const d = q.d, nb = d.L.length, bar = (s >> 4) % nb, i = s & 15, pass = (s >> 4) / nb | 0, sd = q.sd, n = q.n;
    const cs = d.C[bar], c = cs[i >= 8 && cs.length > 1 ? 1 : 0], r = (c[0] + d.tr + 120) % 12, th = c[1];
    const rest = pass % 3 === 2 && bar < 4; /* every third time round the tune rests for four bars and the backing steps up */
    const L = d.L[bar][i];
    if (L && !rest) {
      const m = L[0] + d.tr; lead(d, n.lead, hz(m), t, L[1] * sd, L[1]);
      if (pass % 2 === 1 && nb > 8 && bar >= 8) H.tone('sine', hz(m + 12), 0, t, Math.min(.3, L[1] * sd), .022, n.mel, .01); /* a soft octave sparkle on the second time round */
    }
    /* arpeggio / chord layer */
    const a = 60 + r, T = [0, th, 7, 12], ag = rest ? 1.4 : 1;
    if (d.arp === 'eighth') { if (!(i & 1)) H.tone(H.p12, hz(a + T[[0, 1, 2, 1][(i >> 1) & 3]] + 12), 0, t, sd * 1.4, .038 * ag, n.mel); }
    else if (d.arp === 'box') { if (!(i & 1)) H.tone('sine', hz(a + T[[0, 2, 1, 2, 3, 2, 1, 2][i >> 1]] + 12), 0, t, sd * 2.5, .06 * ag, n.mel, .002); }
    else if (d.arp === 'roll') { if (!(i & 1)) H.tone('triangle', hz(a + T[[0, 1, 2, 1, 3, 1, 2, 1][i >> 1]] + 12), 0, t, sd * 1.8, .04 * ag, n.mel, .004); }
    else if (d.arp === 'dream') H.tone('triangle', hz(a + T[[0, 1, 2, 3, 2, 1, 2, 1][i & 7]] + 12), 0, t, sd * 3, .04 * ag, n.mel, .006);
    else if (d.arp === 'pah') { if (i === 4 || i === 12) { for (let k = 0; k < 3; k++) H.tone('triangle', hz(a + T[k] + 12), 0, t, sd * 1.2, .032 * ag, n.mel, .004); } else if (i === 14 && (bar & 1)) H.tone('sine', hz(a + 24), 0, t, sd * 1.5, .03 * ag, n.mel, .002); }
    /* bass (gentle triangle, E2..D#3 roots) */
    const b = 40 + ((r + 8) % 12), bt = (iv, dur, g) => H.tone('triangle', hz(b + iv), 0, t, dur, g, n.mel, .005);
    if (d.bass === 'bounce') { if (!(i & 1)) bt([0, 12, 7, 12][(i >> 1) & 3], sd * 1.6, .22); }
    else if (d.bass === 'walk') { if (!(i & 3)) bt([0, 7, 12, 7][i >> 2], sd * 3, .21); }
    else if (d.bass === 'dream') { if (i === 0) bt(0, sd * 7, .21); else if (i === 8) bt(7, sd * 7, .19); }
    else if (d.bass === 'oom') { if (i === 0) bt(0, sd * 3, .24); else if (i === 8) bt(7, sd * 3, .22); else if (i === 14 && !(bar & 1)) bt(12, sd * .9, .14); }
    /* light percussion, all from noise and short tones */
    const o = n.drm, dr = d.drum;
    const kick = g => H.tone('sine', 150, 50, t, .12, g, o, .002);
    const snare = g => { H.noise(t, .1, g, 'bandpass', 1800, 0, .8, o); H.tone('triangle', 220, 160, t, .05, g * .4, o); };
    const hat = g => H.noise(t, .025, g, 'highpass', 7000, 0, .7, o);
    const rim = g => H.noise(t, .03, g, 'bandpass', 2500, 0, 4, o);
    const shk = g => H.noise(t, .05, g, 'bandpass', 5200, 0, 3, o); /* a seed-pod shaker */
    const clap = g => { H.noise(t, .03, g, 'bandpass', 1500, 0, 1.2, o); H.noise(t + .014, .07, g * .8, 'bandpass', 1400, 0, 1.2, o); };
    const tink = g => { H.tone('sine', 2100, 0, t, .05, g, o, .001); H.tone('sine', 5800, 0, t, .02, g * .35, o, .001); }; /* a little spanner on a pipe */
    const clonk = g => { H.tone('triangle', 700, 520, t, .06, g, o, .002); H.noise(t, .02, g * .5, 'bandpass', 1600, 0, 6, o); };
    if (dr === 'pop') { if (i === 0 || i === 8) kick(.2); if (i === 4 || i === 12) snare(.08); if ((i & 3) === 2) shk(.035); else if (i & 1) hat(.01); }
    else if (dr === 'soft') { if (i === 0) kick(.15); if (i === 10) kick(.07); if (i === 4 || i === 12) rim(.045); if (!(i & 1)) hat(.01); }
    else if (dr === 'dream') { if (i === 0) kick(.12); if (i === 8) rim(.03); if ((i & 3) === 2) hat(.011); if (i === 0 && !(bar & 3)) H.noise(t, 1.6, .016, 'bandpass', 2500, 5000, .6, o); }
    else if (dr === 'clank') { if (i === 0 || i === 8) kick(.2); if (i === 4 || i === 12) snare(.07); if (i === 6 || i === 14) tink(.05); if (i === 10 && (bar & 1)) clonk(.08); if (i & 1) hat(.012); }
    else if (dr === 'clap') { if (i === 0 || i === 8) kick(.18); if (i === 4 || i === 12) clap(.07); if (!(i & 1)) hat(.012); if ((i & 3) === 2) shk(.02); }
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

/* ---------- live wrapper (with ?mute=1 every call returns at once) ---------- */
let I = null, muted = false, musOn = true, hid = false, want = null, timer = 0;
if (!SILENT) { try { const ls = window.localStorage; muted = ls.getItem('kart-mute') === '1'; musOn = ls.getItem('kart-music') !== '0'; } catch (e) {} }
const store = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) {} };
const quiet = p => { if (p && typeof p.catch === 'function') p.catch(() => {}); };
const now = () => I.ac.currentTime;
function pump() {
  timer = 0; if (!I || hid) return;
  const t = now(); let more = false;
  try { more = I.schedule(t, t + .12); } catch (e) {}
  try { more = I.tick(t) || more; } catch (e) {}
  if (more) run();
}
function run() { if (!timer && I && !hid && (I.seq || I.dr || I.eng.length)) timer = setTimeout(pump, 25); }
const A = SK.Audio = {
  ready: false, silent: SILENT,
  SFX_NAMES: Object.keys(SFX).concat('drift'), MUSIC_NAMES: Object.keys(SONGS), ALIASES: ALIAS,
  unlock() {
    if (SILENT) return;
    try {
      if (!I) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        I = create(new AC()); A.ready = true; I.setMute(muted, 0); I.setMusicOn(musOn, 0);
        const b = I.ac.createBuffer(1, 1, 22050), s = I.ac.createBufferSource(); s.buffer = b; s.connect(I.ac.destination); s.start(0); /* iOS wake */
        if (want) I.music(want[0], want[1], now() + .06);
      }
      if (!hid && I.ac.state !== 'running' && I.ac.resume) quiet(I.ac.resume());
      run();
    } catch (e) {}
  },
  play(name, arg) {
    if (SILENT) return;
    if (has(ALIAS, name)) name = ALIAS[name];
    if (name === 'drift') { /* true (or no arg): on, keeping its colour; 1..3: on at that colour; false, 0 or null: off */
      if (!I) return;
      const lv = arg === undefined ? -1 : typeof arg === 'number' ? (arg > 0 ? Math.max(1, Math.min(3, Math.round(arg))) : 0) : arg ? -1 : 0;
      try { const t = now(); if (!lv || muted || hid) I.drift(0, t); else { I.drift(lv < 0 ? (I.dr ? I.dr.lv : 1) : lv, t); run(); } } catch (e) {}
      return;
    }
    if (!I || muted || hid) return;
    try { I.play(name, arg, now() + .002); } catch (e) {}
  },
  engine(i, speed, near) {
    if (SILENT || !I) return;
    i = i | 0; if (i < 0 || i > 7) return;
    try {
      const t = now();
      if (muted || hid || !(speed >= 0)) { I.engine(i, -1, 0, t); return; }
      I.engine(i, +speed, near === undefined ? 1 : +near || 0, t); run();
    } catch (e) {}
  },
  music(name, v) {
    if (SILENT) return;
    const ok = has(SONGS, name); want = ok ? [name, v | 0] : null;
    if (!I) return;
    try { I.music(ok ? name : null, v | 0, now() + .06); run(); } catch (e) {}
  },
  mute(on) {
    if (SILENT) return;
    muted = !!on; store('kart-mute', muted ? '1' : '0');
    if (I) try { I.setMute(muted, now()); } catch (e) {}
  },
  /* music only (sound effects stay). Remembered before unlock; musicOn() with no argument just reports */
  musicOn(on) {
    if (on === undefined || SILENT) return musOn;
    musOn = !!on; store('kart-music', musOn ? '1' : '0');
    if (I) try { I.setMusicOn(musOn, now()); } catch (e) {}
    return musOn;
  },
  hidden(on) {
    if (SILENT) return;
    hid = !!on; if (!I) return;
    try {
      const t = now();
      if (hid) { clearTimeout(timer); timer = 0; I.drift(0, t); I.engAll(t); if (I.ac.suspend) quiet(I.ac.suspend()); }
      else { if (I.ac.resume) quiet(I.ac.resume()); I.resync(t); run(); }
    } catch (e) {}
  },
  isMuted() { return SILENT || muted; },
  isMusicOn() { return musOn; },
  /* debug: what is live right now */
  _state() { return I ? { ctx: I.ac.state, song: I.key, voices: I.vox.length, engines: I.eng.map(v => v.i), drift: I.dr ? I.dr.lv : 0, muted, musOn, hidden: hid } : { ctx: null, muted: SILENT || muted, musOn, hidden: hid }; },
  /* test hook: the same graph/synth/sequencer in any context (e.g. an OfflineAudioContext); nothing is played live */
  _render(ctx) { return create(ctx); }
};
})();
