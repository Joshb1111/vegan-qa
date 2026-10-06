/* SPROUT KART — audio.js (AUDIO), v2. SK.Audio: every sound and tune is made with WebAudio in code, no files, all original.
   Graph: sfx voices, the drift skid, the petal tinkle, the engine hums → sfx bus ┐
          song (lead + echo → lowpass, drums, final-lap and giant layers) → music bus ─┴→ master (mute) → compressor → limiter → trim → out
   With ?mute=1 every call is a no-op: no AudioContext is ever made and nothing is read or stored. Otherwise nothing is made
   before unlock() (call it from a user gesture). 'kart-mute' (all sound) and 'kart-music' (music only) are read at load and
   stored by mute(on) / musicOn(on); musicOn() with no argument just reports. Nothing here ever throws, with or without WebAudio.
     play(name, arg[, vol])   one-shots (SFX_NAMES; ALIASES map other names). vol 0..1 (default 1) scales this one play, e.g. by
                              distance from your view. play('giant', 1 | 0) plays 'grow' | 'shrink'.
                              play('drift', true | 1..3 | false) holds the soft skid loop (1 green, 2 orange, 3 gold sparks:
                              brighter, a ting on each step up; false stops it).
                              play('orbit', n | false) holds a soft petal tinkle while YOUR DAISY SWIRL spins (n petals left, 1..5;
                              true = 5); feed it every frame, and unfed for 0.4 s it fades by itself (optional).
     engine(i, speed01[, near01[, pitchMul]])  a soft putt-putt hum for kart i, pitch and volume by speed; engine(i, -1) silences
                              it. pitchMul 1.6 tiny (higher, quicker putter), 0.7 giant (deeper, slower, a little louder). At most
                              4 hums at once (the loudest win); call it each frame for the viewed karts (near omitted = 1), and
                              optionally for a CPU kart near the camera with near 0..1 as its volume. A hum not fed for 0.35 s fades.
     music(name | null[, v])  MUSIC_NAMES; v is a bit field on a race tune: 1 = the final lap (quicker, brighter, a driving shaker
                              and bass), 2 = your kart is giant (a bouncy jingle layer). A change of v carries on in the same tune
                              from the same step, in the same graph (no gap).
     ahead(sec)               schedules the music up to sec (0.12..1) ahead right now: call it just before a known main-thread
                              stall (a track build), so the tune plays on through it. Stalls are also re-anchored (never burst).
     hidden(on)               silences everything (tab hidden / room closed) and suspends the context
     HAZARD_SOUNDS            { skin: { tell, act, spawn } } the names for the hazard events htell / hact / hspawn
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
/* the final lap (music(name, v | 1)): the same race tune quicker and brighter, with a driving shaker and an octave bass pump */
const VARIED = { meadows: [{}, { bpm: 156, lp: 3900, drive: 1 }], skyway: [{}, { bpm: 110, lp: 2900, drive: 1 }], works: [{}, { bpm: 144, lp: 3600, drive: 1 }] };
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
const vBits = (name, v) => has(VARIED, name) ? (v | 0) & 3 : 0; /* the bits that matter for this tune (title/results: none) */
function songDef(name, v) { if (!has(SONGS, name)) return null; return Object.assign({ tr: 0, swing: 0, loop: 1, drive: 0 }, SONGS[name], has(VARIED, name) ? VARIED[name][v & 1] : {}); }

/* ---------- sound effects: [voice length s, keep (never dropped first), fn(H, t, out, arg)]; cute and soft, nothing harsh ----------
   Args: start 1|2 · launch 'ramp'|'catapult'|'bounce'|'piston'|'steam'|'net' · land 0|1 (1 = a twirl landed: ta-da) · lucky 1|2 ·
   bluewarn closeness 0..1 (or metres > 1, 40 m = far) · turbo 1..3 · got item name or id (the giant gets a flourish). */
const SFX = {
  /* 3, 2, 1: a round little boop */
  count: [.25, 1, (H, t, o) => { H.tone('triangle', NH('E5'), 0, t, .16, .3, o); H.tone('sine', NH('E6'), 0, t, .1, .08, o); H.tone('sine', NH('B6'), 0, t + .005, .05, .025, o); }],
  /* GO: a quick bright roll up and a held chirp */
  go: [.6, 1, (H, t, o) => {
    ['E5', 'G#5', 'B5'].forEach((n, i) => H.tone('triangle', NH(n), 0, t + i * .035, .08, .2, o));
    H.tone('triangle', NH('E6'), 0, t + .1, .34, .24, o); H.tone('sine', NH('B6'), 0, t + .1, .3, .06, o);
    H.noise(t + .1, .35, .03, 'highpass', 5000, 9000, .7, o);
  }],
  /* SPROUT START (at GO): 1 a sprout chime, a leaf curling up; 2 a bigger chime with a run and a whoosh (in GO's key) */
  start: [.9, 1, (H, t, o, a) => {
    const big = a === 2 || a === '2';
    H.tone('sine', 520, 1040, t, .16, .05, o, .01);
    H.tone('triangle', NH('B5'), 0, t + .02, .07, .13, o); H.tone('triangle', NH('E6'), 0, t + .08, big ? .14 : .26, .15, o);
    H.tone('sine', NH('E7'), 0, t + .08, .18, .035, o);
    if (big) {
      ['G#6', 'B6', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .18 + i * .05, .12, .05, o));
      H.tone('triangle', NH('E5'), 0, t + .18, .45, .09, o, .01); H.noise(t + .04, .4, .06, 'bandpass', 600, 4200, 1.3, o);
    }
  }],
  /* a sunberry or a boost pad: a rising whoosh with a bright zing on top */
  boost: [.55, 1, (H, t, o) => {
    H.noise(t, .42, .09, 'bandpass', 500, 3800, 1.4, o);
    H.tone('triangle', 260, 780, t, .3, .16, o, .01); H.tone('sine', 880, 1760, t + .08, .22, .06, o);
  }],
  /* a drift turbo let go: arg 1 green, 2 orange, 3 gold, each higher, longer and brighter */
  turbo: [.7, 1, (H, t, o, a) => {
    const k = Math.max(1, Math.min(3, a | 0 || 1)), f = [0, 330, 392, 494][k];
    H.tone('triangle', f, f * 2, t, .12 + .04 * k, .2, o); H.noise(t, .18 + .08 * k, .07, 'bandpass', 800, 2400 + 900 * k, 1.2, o);
    if (k >= 2) H.tone('sine', f * 2, f * 3, t + .06, .12, .06, o);
    if (k === 3) ['E6', 'G#6', 'B6', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .1 + i * .04, .08, .04, o));
  }],
  /* TAILWIND: a rising wind whoosh with a soft airy lift */
  tailwind: [.85, 1, (H, t, o) => {
    H.noise(t, .5, .08, 'bandpass', 350, 2600, 1.1, o, { att: .22 });
    H.noise(t + .1, .45, .025, 'highpass', 2500, 6000, .7, o, { att: .2 });
    H.tone('sine', 330, 660, t + .12, .35, .045, o, .12); H.tone('sine', 495, 990, t + .18, .3, .025, o, .1);
  }],
  /* the little hop into a drift */
  hop: [.14, 0, (H, t, o) => { H.tone('triangle', 300, 620, t, .07, .1, o); H.noise(t, .04, .03, 'bandpass', 1800, 0, 1.5, o); }],
  /* off a ramp (and other launches), by kind: a spring-up whoosh; a twangy catapult fling; a cloud or net bounce; a piston
     pop; a steam puff */
  launch: [.6, 0, (H, t, o, a) => {
    if (a === 'steam') { H.noise(t, .32, .07, 'highpass', 1800, 4200, .7, o); H.tone('sine', 300, 900, t, .28, .07, o, .01); return; }
    if (a === 'piston') { H.tone('triangle', 200, 120, t, .06, .14, o, .002); const s = H.tone('sine', 260, 780, t + .03, .26, .12, o, .005); H.wob(s, t + .03, .26, 16, 30); return; }
    if (a === 'catapult') { const s = H.tone('triangle', 140, 560, t, .38, .15, o, .004); H.wob(s, t, .38, 9, 40); H.noise(t + .05, .42, .06, 'bandpass', 500, 3000, 1.2, o); return; }
    if (a === 'bounce' || a === 'net') {
      const lo = a === 'net' ? 160 : 260, s = H.tone('sine', lo, lo * 2.7, t, .28, .15, o, .004); H.wob(s, t, .28, 14, 22);
      H.noise(t, .22, .03, 'bandpass', 1500, 3000, 1, o); return;
    }
    H.tone('triangle', 220, 700, t, .28, .13, o, .006); H.noise(t, .4, .07, 'bandpass', 400, 2800, 1.2, o); H.tone('sine', 660, 1320, t + .06, .2, .03, o);
  }],
  /* a TWIRL in the air: a spin sparkle round and up, with a swish */
  twirl: [.5, 0, (H, t, o) => {
    ['C6', 'E6', 'G6', 'B6', 'D7', 'G7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + i * .035, .07, .05, o));
    H.noise(t, .3, .05, 'bandpass', 1100, 3600, 2, o, { fmR: 10, fmD: 500 });
    H.tone('triangle', 400, 800, t, .24, .05, o);
  }],
  /* back on the ground: a soft thump; arg 1 (a twirl landed) adds a ta-da */
  land: [.7, 0, (H, t, o, a) => {
    H.tone('sine', 140, 60, t, .12, .14, o, .003); H.noise(t, .08, .045, 'lowpass', 900, 250, .8, o);
    if (a === 1 || a === '1') {
      H.tone('triangle', NH('G5'), 0, t + .05, .08, .13, o); H.tone(H.p25, NH('G5'), 0, t + .05, .06, .03, o);
      for (const n of ['C6', 'E6', 'G6']) H.tone('triangle', NH(n), 0, t + .14, .38, .07, o, .008);
      H.tone('sine', NH('C7'), 0, t + .14, .3, .03, o);
    }
  }],
  /* into a shortcut: a little curious discovery chime */
  shortcut: [.8, 1, (H, t, o) => {
    [['D6', 0], ['F#6', .08], ['A6', .16], ['C#7', .24]].forEach(([n, d]) => { H.tone('sine', NH(n), 0, t + d, .3, .07, o, .004); H.tone('triangle', NH(n) / 2, 0, t + d, .12, .04, o); });
    H.noise(t + .2, .4, .015, 'highpass', 6000, 9000, .7, o);
  }],
  /* through a rainbow ring: a shimmering run up over a whoosh */
  ring: [.8, 1, (H, t, o) => {
    ['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + i * .03, .1, .03 - i * .002, o));
    H.noise(t, .45, .07, 'bandpass', 500, 3600, 1.3, o); H.tone('triangle', 300, 900, t, .3, .1, o, .01);
    H.noise(t + .2, .45, .02, 'highpass', 6000, 10000, .7, o);
  }],
  /* the drift hop is 'hop'; the item roulette: a soft woody tick (arg: a tick count, it steps the pitch a little) */
  item: [.05, 0, (H, t, o, a) => { const f = 1250 + ((a | 0) & 3) * 120; H.tone('triangle', f, f * .85, t, .025, .07, o, .002); }],
  /* the roulette settles on an item (a GIANT SPROUT gets a little leafy flourish) */
  got: [.5, 1, (H, t, o, a) => {
    H.tone('triangle', NH('B5'), 0, t, .07, .18, o); H.tone('triangle', NH('E6'), 0, t + .07, .18, .18, o); H.tone('sine', NH('E7'), 0, t + .07, .12, .04, o);
    if (a === 'giant' || a === 10) ['G#6', 'B6', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .2 + i * .05, .1, .04, o));
  }],
  /* LUCKY: a clover sparkle after the roulette chime; 2 (SUPER LUCKY) a longer run and a chord bloom */
  lucky: [1.2, 1, (H, t, o, a) => {
    const big = a === 2 || a === '2', run = big ? ['B5', 'E6', 'G#6', 'B6', 'E7', 'G#7', 'B7'] : ['E6', 'G#6', 'B6', 'E7'], t0 = t + .12, L = big ? .065 : .11;
    run.forEach((n, i) => { H.tone('triangle', NH(n), 0, t0 + i * .055, .1, L, o); H.tone('sine', NH(n) * 2, 0, t0 + i * .055 + .01, .05, L * .2, o); });
    const e = t0 + run.length * .055;
    if (big) { for (const n of ['E6', 'G#6', 'B6', 'E7']) H.tone('sine', NH(n), 0, e, .55, .04, o, .01); H.tone('triangle', NH('E5'), 0, e, .55, .08, o, .01); }
    for (let i = 0; i < (big ? 6 : 3); i++) H.tone('sine', 3000 + ((i * 1373) % 2000), 0, e + i * .06, .05, .02, o);
  }],
  /* through an item bubble: a bubbly pop and a little sparkle */
  box: [.35, 0, (H, t, o) => {
    H.tone('sine', 420, 1100, t, .07, .22, o); H.noise(t, .05, .06, 'bandpass', 2400, 0, 2, o);
    ['G6', 'B6', 'D7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .06 + i * .045, .07, .05, o));
  }],
  /* juice dropped or tossed: a short swish */
  throw: [.2, 0, (H, t, o) => { H.noise(t, .12, .06, 'bandpass', 800, 2600, 1.2, o); H.tone('triangle', 500, 900, t, .08, .07, o); }],
  /* a juice splat: a juicy squelch */
  splat: [.4, 0, (H, t, o) => {
    H.noise(t, .18, .14, 'lowpass', 2400, 300, 1.2, o);
    const s = H.tone('sine', 520, 140, t, .22, .2, o, .004); H.wob(s, t, .22, 30, 40); H.tone('triangle', 900, 300, t + .02, .08, .05, o);
  }],
  /* BLUEBERRY BOUNCE away: three bouncy hops up */
  blue: [.6, 0, (H, t, o) => {
    [0, .12, .22].forEach((d, i) => H.tone('sine', 300 + i * 120, 600 + i * 240, t + d, .09, .13 - i * .025, o, .003));
    H.noise(t, .06, .05, 'lowpass', 1500, 500, .8, o); H.tone('triangle', NH('A5'), 0, t + .3, .12, .05, o);
  }],
  /* a blueberry is coming for YOU: rising boings, higher and louder the closer it is */
  bluewarn: [.5, 1, (H, t, o, a) => {
    const c = typeof a === 'number' && a === a ? (a > 1 ? 1 - Math.min(1, a / 40) : Math.max(0, a)) : .5, base = 360 + 300 * c;
    [0, .1, .2].forEach((d, i) => { const f = base * Math.pow(1.19, i), s = H.tone('sine', f, f * 1.7, t + d, .08, .08 + .04 * c, o, .003); H.wob(s, t + d, .08, 30, f * .05); });
  }],
  /* the blueberry gets there: a big juicy splash and droplets */
  splash: [.7, 1, (H, t, o) => {
    H.noise(t, .3, .15, 'lowpass', 3000, 260, 1, o); H.noise(t, .12, .05, 'bandpass', 2600, 1200, 1.5, o);
    const s = H.tone('sine', 600, 150, t, .25, .17, o, .003); H.wob(s, t, .25, 26, 50);
    for (let i = 0; i < 5; i++) H.drop(t + .1 + i * .06, 900 + ((i * 577) % 900), .05, o);
  }],
  /* WISH PUFF away: an airy float up */
  puff: [1.2, 0, (H, t, o) => {
    H.noise(t, .75, .045, 'bandpass', 900, 2400, 1, o, { att: .25 });
    const s = H.tone('sine', NH('E5'), NH('B5'), t + .05, .75, .06, o, .2); H.wob(s, t + .05, .8, 5, 8);
    H.tone('sine', NH('G#6'), 0, t + .45, .4, .02, o, .1);
  }],
  /* a puff is over YOU (LOOK UP!): two ploinks, up */
  puffwarn: [.45, 1, (H, t, o) => {
    H.tone('sine', 1500, 700, t, .08, .13, o, .002); H.tone('triangle', NH('E6'), 0, t, .12, .1, o);
    H.tone('sine', 1900, 950, t + .14, .08, .13, o, .002); H.tone('triangle', NH('A6'), 0, t + .14, .2, .1, o);
  }],
  /* the puff lands: a soft fluffy fwump and the seeds scatter (soft, never loud) */
  puffpop: [.9, 1, (H, t, o) => {
    H.noise(t, .25, .14, 'lowpass', 1600, 300, .7, o); H.tone('sine', 220, 90, t, .16, .15, o, .004);
    H.noise(t + .03, .6, .05, 'highpass', 3000, 7000, .7, o);
    ['B6', 'G#6', 'E6', 'B5'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .12 + i * .07, .1, .035, o));
  }],
  /* DAISY SWIRL starts: a petal tinkle going round twice over a swirling breeze */
  swirl: [1.4, 0, (H, t, o) => {
    const ring = ['G6', 'A6', 'C7', 'D7', 'E7'];
    for (let i = 0; i < 10; i++) H.tone('sine', NH(ring[i % 5]), 0, t + i * .1, .12, .05 * (1 - i / 14), o, .003);
    H.noise(t, 1, .03, 'bandpass', 1400, 2600, 2, o, { att: .2, fmR: 2.4, fmD: 700 });
    H.tone('triangle', NH('C5'), NH('G5'), t, .3, .06, o, .02);
  }],
  /* the petals flung ahead: a quick whoosh and a scatter of tinks */
  fling: [.6, 0, (H, t, o) => {
    H.noise(t, .35, .09, 'bandpass', 700, 4200, 1.2, o); H.tone('triangle', 400, 1200, t, .18, .07, o);
    ['E7', 'D7', 'C7', 'A6', 'G6'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .04 + i * .03, .08, .04, o));
  }],
  /* a petal touches someone: a soft pat */
  petal: [.25, 0, (H, t, o) => { H.noise(t, .05, .08, 'lowpass', 1800, 600, .7, o); H.tone('sine', 520, 380, t, .06, .1, o, .002); H.tone('sine', NH('E7'), 0, t + .02, .06, .02, o); }],
  /* a bubble shield: bub-bub up and a shimmer */
  shield: [.6, 1, (H, t, o) => {
    [[300, 600], [450, 900]].forEach(([a, b], i) => { const s = H.tone('sine', a, b, t + i * .09, .1, .2, o, .006); H.wob(s, t + i * .09, .1, 18, 25); });
    ['E6', 'A6', 'C#7', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .18 + i * .04, .12, .04, o));
    H.noise(t + .18, .3, .02, 'highpass', 5000, 9000, .7, o);
  }],
  /* the shield takes a hit and pops (also a blueberry or puff that pops harmlessly) */
  pop: [.25, 0, (H, t, o) => { H.tone('sine', 1000, 260, t, .1, .18, o); H.noise(t, .06, .06, 'highpass', 3000, 0, .7, o); H.tone('sine', NH('A6'), 0, t + .08, .1, .04, o); }],
  /* TINY THYME sent: a sparkle ribbon racing away (whole-tone twinkles over a breath of air) */
  thyme: [1.2, 1, (H, t, o) => {
    for (let i = 0; i < 12; i++) { const f = hz(76 + 2 * i); H.tone('sine', f, 0, t + i * .055, .12, .045, o); if (i & 1) H.tone(H.p12, f * 2, 0, t + i * .055, .03, .012, o); }
    H.noise(t, .85, .035, 'highpass', 3000, 9000, .8, o, { att: .3 });
    const s = H.tone('triangle', hz(64), hz(76), t, .8, .05, o, .2); H.wob(s, t, .8, 6, 6);
  }],
  /* the thyme ribbon is about to reach you: a two-note HOP cue */
  hopwarn: [.4, 1, (H, t, o) => { [['G5', 0], ['D6', .12]].forEach(([n, d]) => { H.tone(H.p25, NH(n), 0, t + d, .08, .05, o, .003); H.tone('triangle', NH(n), 0, t + d, .1, .14, o, .003); }); }],
  /* hopped over it: a happy yay arpeggio */
  dodge: [.6, 1, (H, t, o) => {
    ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => { H.tone('triangle', NH(n), 0, t + i * .05, .09, .14, o); H.tone(H.p25, NH(n), 0, t + i * .05, .05, .03, o); });
    H.tone('sine', NH('E7'), 0, t + .2, .25, .04, o); H.tone('sine', NH('G7'), 0, t + .25, .2, .03, o);
  }],
  /* gone TINY: a squeaky shrink up into little twinkles */
  tiny: [.7, 1, (H, t, o) => {
    const s = H.tone('sine', 700, 2200, t, .32, .1, o, .005); H.wob(s, t, .32, 22, 80); H.tone('triangle', 1400, 2600, t + .05, .25, .035, o);
    ['E7', 'G#7', 'B7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .34 + i * .05, .05, .025, o));
  }],
  /* GIANT SPROUT: a rising grow, leaves unfurling up a chord */
  grow: [1.3, 1, (H, t, o) => {
    const s = H.tone('triangle', 110, 440, t, .9, .16, o, .02); H.wob(s, t, .9, 7, 12);
    ['C5', 'G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .1 + i * .12, .18, .06, o, .005));
    H.noise(t, .9, .03, 'bandpass', 300, 2400, 1, o, { att: .3 });
    for (const n of ['C6', 'E6', 'G6']) H.tone('triangle', NH(n), 0, t + .85, .4, .05, o, .01);
  }],
  /* back to normal size: a falling slide and a little pop */
  shrink: [.7, 1, (H, t, o) => {
    const s = H.tone('triangle', 520, 160, t, .4, .14, o, .01); H.wob(s, t, .4, 9, 15);
    H.tone('sine', 900, 1500, t + .42, .06, .14, o, .002); H.noise(t + .42, .04, .05, 'bandpass', 2500, 0, 2, o);
  }],
  /* spun round (WHEEE!): a cartoon boing and a whirly wind-down */
  hit: [.75, 1, (H, t, o) => {
    const b = H.tone('sine', 150, 330, t, .3, .3, o, .005); H.wob(b, t, .3, 13, 26);
    const w = H.tone('triangle', 700, 260, t + .12, .55, .1, o, .01); H.wob(w, t + .12, .55, 11, 60);
    H.tone('sine', 1200, 1600, t, .05, .05, o);
  }],
  /* BONK!: a soft hollow cartoon bonk, a little hop up and two twinkles */
  bonk: [.6, 1, (H, t, o) => {
    H.tone('triangle', 620, 420, t, .09, .2, o, .002); H.noise(t, .05, .07, 'bandpass', 900, 0, 6, o); H.tone('sine', 310, 210, t, .12, .16, o, .002);
    const s = H.tone('sine', 400, 900, t + .1, .3, .07, o, .01); H.wob(s, t + .1, .3, 12, 40);
    ['A6', 'E7'].forEach((n, i) => H.tone('sine', NH(n), 0, t + .14 + i * .06, .06, .025, o));
  }],
  /* WIBBLE!: a wibbly bend */
  wobble: [.6, 1, (H, t, o) => {
    const s = H.tone('triangle', 420, 300, t, .5, .14, o, .01); H.wob(s, t, .5, 7, 60);
    const s2 = H.tone('sine', 840, 620, t, .45, .05, o, .01); H.wob(s2, t, .45, 7, 110);
    H.noise(t, .12, .03, 'bandpass', 1800, 900, 1.2, o);
  }],
  /* a tiny kart bumped by a bigger one: a big springy boing */
  boing: [.8, 1, (H, t, o) => {
    const s = H.tone('sine', 110, 380, t, .55, .22, o, .004); H.wob(s, t, .55, 16, 60);
    const s2 = H.tone('triangle', 220, 520, t, .35, .06, o, .004); H.wob(s2, t, .35, 16, 80);
  }],
  /* TOO BIG TO SPIN!: a deep rubbery bwoing */
  immune: [.7, 1, (H, t, o) => {
    const s = H.tone('sine', 70, 140, t, .45, .26, o, .006); H.wob(s, t, .45, 9, 14);
    const s2 = H.tone('triangle', 140, 200, t, .3, .08, o, .006); H.wob(s2, t, .3, 9, 20); H.tone('sine', NH('C6'), 0, t + .05, .15, .03, o);
  }],
  /* a bump (a wall or another kart): a soft thud with a little spring */
  bump: [.22, 0, (H, t, o) => {
    H.tone('sine', 180, 90, t, .1, .22, o, .003); const s = H.tone('triangle', 330, 500, t + .01, .09, .07, o); H.wob(s, t + .01, .09, 22, 30);
    H.noise(t, .05, .05, 'lowpass', 1200, 400, .8, o);
  }],
  /* a springy boing off a bumper, a crate stack or a piston: shorter and lighter than 'boing' */
  bounce: [.35, 0, (H, t, o) => { const s = H.tone('sine', 200, 480, t, .2, .15, o, .003); H.wob(s, t, .2, 20, 30); H.noise(t, .04, .04, 'lowpass', 1200, 400, .8, o); }],
  /* off the road: a soft slide whistle down; then the balloon lifts you back on: a bubbly rise */
  fall: [.8, 1, (H, t, o) => { const s = H.tone('sine', 1400, 320, t, .7, .08, o, .02); H.wob(s, t, .7, 6, 20); }],
  lift: [.8, 1, (H, t, o) => {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => { const f = NH(n), s = H.tone('sine', f, f * 1.06, t + i * .1, .12, .14, o, .008); H.wob(s, t + i * .1, .12, 14, f * .02); });
    H.noise(t, .6, .02, 'bandpass', 600, 2400, 1, o);
  }],
  /* ----- hazards (short and soft: they repeat every few seconds; the game plays them only near a human view) ----- */
  /* sprinkler tell: the head pops up, tk-tk-tk */
  sprinkler: [.6, 0, (H, t, o) => { for (let i = 0; i < 6; i++) { H.noise(t + i * .075, .018, .05, 'bandpass', 3200, 0, 5, o); H.tone('sine', 1700, 0, t + i * .075, .012, .02, o, .001); } }],
  /* sprinkler on: a fluttering water hiss with a few drips */
  spray: [1.4, 0, (H, t, o) => {
    H.noise(t, 1.1, .04, 'bandpass', 4200, 3000, .9, o, { att: .08, amR: 11, amD: .35 }); H.noise(t, .9, .018, 'highpass', 7000, 0, .7, o, { att: .05 });
    for (let i = 0; i < 4; i++) H.drop(t + .2 + i * .22, 1200 + ((i * 733) % 800), .03, o);
  }],
  /* a pumpkin rolls out: tok-tok rolling over a low roll */
  pumpkin: [.8, 0, (H, t, o) => {
    [0, .16, .3, .42, .52].forEach((d, i) => { H.tone('triangle', 330 - i * 12, 250 - i * 10, t + d, .05, .1 - i * .012, o, .002); H.noise(t + d, .025, .03, 'bandpass', 700, 0, 5, o); });
    H.noise(t, .6, .035, 'lowpass', 260, 180, 1, o, { att: .1, amR: 7, amD: .5 });
  }],
  /* a juice barrel rolls out: a wooden rumble */
  barrel: [.9, 0, (H, t, o) => {
    H.noise(t, .65, .07, 'lowpass', 300, 160, 1.2, o, { att: .08, amR: 9, amD: .5 });
    [0, .2, .38, .55].forEach((d, i) => H.tone('triangle', 200 - i * 8, 150, t + d, .06, .07, o, .002));
  }],
  /* rain tell: the first drops; then the shower: a soft patter */
  rain: [.8, 0, (H, t, o) => { [0, .17, .29, .47, .58].forEach((d, i) => H.drop(t + d, 900 + ((i * 911) % 900), .05, o)); H.noise(t + .3, .4, .01, 'highpass', 5000, 0, .7, o, { att: .2 }); }],
  shower: [1.3, 0, (H, t, o) => {
    H.noise(t, .95, .03, 'bandpass', 3500, 2500, .6, o, { att: .15 });
    for (let i = 0; i < 14; i++) H.drop(t + i * .07 + ((i * 37) % 7) * .006, 800 + ((i * 1231) % 1400), .028, o);
  }],
  /* gust tell: the windsock flutters; then the gust: a whoosh with a soft whistle in it */
  windsock: [.8, 0, (H, t, o) => { H.noise(t, .5, .05, 'bandpass', 900, 1300, 1.4, o, { att: .2, amR: 21, amD: .45 }); }],
  wind: [1.6, 0, (H, t, o) => {
    H.noise(t, 1, .07, 'bandpass', 300, 900, 1.3, o, { att: .35, fmR: .8, fmD: 150 }); H.noise(t + .1, .9, .02, 'highpass', 2000, 4000, .7, o, { att: .3 });
    const s = H.tone('sine', 220, 330, t + .2, .9, .02, o, .3); H.wob(s, t + .2, .9, 3, 15);
  }],
  /* steam tell: the grate rattles; then the steam: a hiss with a pff */
  steamtell: [.6, 0, (H, t, o) => { H.noise(t, .42, .045, 'bandpass', 2600, 3000, 6, o, { att: .03, amR: 26, amD: .5 }); [0, .15, .3].forEach(d => H.tone('sine', 2400, 0, t + d, .025, .025, o, .001)); }],
  steam: [.9, 0, (H, t, o) => { H.noise(t, .6, .065, 'highpass', 2500, 5000, .7, o, { att: .02 }); H.noise(t, .25, .05, 'bandpass', 700, 1500, 1, o); }],
  /* piston tell: the lamp blinks, three soft beeps; then the piston: a clunk and a hiss */
  pistontell: [.5, 0, (H, t, o) => { [0, .12, .24].forEach(d => { H.tone(H.p25, NH('A5'), 0, t + d, .05, .03, o, .002); H.tone('sine', NH('A5'), 0, t + d, .05, .05, o, .002); }); }],
  piston: [.6, 0, (H, t, o) => {
    H.tone('triangle', 180, 90, t, .1, .2, o, .002); H.noise(t, .04, .06, 'bandpass', 1400, 0, 4, o); H.tone('sine', 2100, 0, t + .01, .04, .03, o, .001);
    H.noise(t + .05, .32, .04, 'highpass', 3000, 6000, .7, o);
  }],
  /* ----- race flow and menus ----- */
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
/* other names the game may use for the same sounds (v1's, minus those of retired items; 'start' is now its own sound) */
const ALIAS = { beep: 'count', countdown: 'count', pad: 'boost', sunberry: 'boost', skid: 'drift', jump: 'hop',
  roulette: 'item', tick: 'item', itembox: 'box', puddle: 'splat', juice: 'splat', bubble: 'shield', unshield: 'pop',
  spin: 'hit', wall: 'bump', balloon: 'lift', finalLap: 'final', goal: 'finish', blip: 'menu', move: 'menu', confirm: 'select',
  /* v2 */
  sproutstart: 'start', draft: 'tailwind', ramp: 'launch', trick: 'twirl', rainbow: 'ring', clover: 'lucky', lob: 'throw',
  blueberry: 'blue', puffhover: 'puffwarn', lookup: 'puffwarn', daisy: 'swirl', wave: 'thyme', ribbon: 'thyme',
  bumper: 'bounce', gust: 'wind', wibble: 'wobble' };
/* the hazard sounds by skin (spray skins, mover skins, and the gust and piston kinds) for htell / hact / hspawn */
const HAZ = { sprinkler: { tell: 'sprinkler', act: 'spray' }, rain: { tell: 'rain', act: 'shower' }, steam: { tell: 'steamtell', act: 'steam' },
  gust: { tell: 'windsock', act: 'wind' }, piston: { tell: 'pistontell', act: 'piston' },
  pumpkin: { tell: 'pumpkin', spawn: 'pumpkin' }, barrel: { tell: 'barrel', spawn: 'barrel' }, basket: {} };
/* rate limits [max plays, per window s] */
const RATE = { item: [1, .045], menu: [2, .05], select: [2, .05], count: [1, .3], go: [1, .5], bump: [2, .1], box: [3, .08], splat: [2, .1], hop: [2, .08],
  throw: [2, .08], boost: [2, .12], turbo: [2, .15], hit: [2, .2], lap: [1, .3], final: [1, 1], finish: [1, .5],
  start: [2, .3], tailwind: [2, .3], launch: [2, .12], twirl: [2, .12], land: [2, .12], shortcut: [1, .4], ring: [2, .2], lucky: [1, .3],
  blue: [2, .15], bluewarn: [1, .45], splash: [2, .15], puff: [1, .3], puffwarn: [1, .5], puffpop: [1, .3], swirl: [2, .3], fling: [2, .2],
  petal: [2, .1], thyme: [1, .4], hopwarn: [1, .5], dodge: [2, .25], tiny: [2, .3], grow: [2, .4], shrink: [2, .4], bonk: [2, .2],
  wobble: [2, .2], boing: [2, .2], immune: [2, .25], bounce: [2, .12], sprinkler: [1, .5], spray: [1, .6], pumpkin: [1, .5], barrel: [1, .5],
  rain: [1, .5], shower: [1, .6], windsock: [1, .5], wind: [1, .8], steamtell: [1, .4], steam: [1, .4], pistontell: [1, .3], piston: [1, .3] },
  RATE_DEF = [2, .05], MAXV = 24;
/* level trims (×) from a loudness pass (K-weighted, loudest 400 ms; kart-review/v2-audio/levels.*): hits on you sit near v1's
   spin, warnings just under it, item uses and moves near a boost, the repeating hazards well below */
const TRIM = { tailwind: 1.33, ring: 1.25, bonk: 1.4, tiny: 1.4, shrink: 1.12, immune: .8, shortcut: .85, hopwarn: 1.4, puffwarn: 1.25,
  bluewarn: 1.25, puff: .8, sprinkler: 3.5, windsock: 4.5, steamtell: 2.5, pistontell: 1.3, rain: 1.4, barrel: 1.3, spray: .8, shower: .85,
  wind: .7, steam: .45, piston: .6 };
/* the music dips under these: [seconds, level] */
const DUCK = { final: [1.5, .35], finish: [1.6, .35], grow: [.9, .6] };
/* the drift skid by spark colour: band centre, flutter rate, spark crackle gap and level */
const DRF = [0, 1500, 2000, 2600], DLF = [0, 13, 16, 19], DSP = [0, .22, .14, .1], DSG = [0, .012, .016, .02], ENG_MAX = 4;
/* the petal tinkle: notes round the ring, one per petal slot (2.6 rad/s over 5 slots = a slot every 0.48 s) */
const ORB = [79, 81, 84, 86, 88], ORB_GAP = 2 * Math.PI / 5 / 2.6;

/* ---------- one audio graph + synth + sequencer in a given context ---------- */
function create(ac) {
  const I = { ac, rl: {}, vox: [], seq: null, key: '', dr: null, ob: null, eng: [], muted: false, musOn: true, noLimits: false, lastS: -1, lastT: -1, base: { master: .8, sfx: 1.4, mus: .4 } };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const dyn = (th, kn, ra, at, re) => { const c = ac.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = kn; c.ratio.value = ra; c.attack.value = at; c.release.value = re; return c; };
  const comp = dyn(-14, 6, 4, .003, .15), lim = dyn(-4, 0, 20, .001, .08), trim = gain(.8);
  I.master = gain(I.base.master); I.sfx = gain(I.base.sfx); I.mus = gain(I.base.mus);
  I.sfx.connect(I.master); I.mus.connect(I.master); I.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ac.destination);
  const pulse = d => { const n = 32, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * d); return ac.createPeriodicWave(re, im); };
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  /* synth helpers (H): exponential envelopes, glides, wobble LFOs, filtered noise (with an optional slow fade-in, a flutter
     (amR Hz, amD depth 0..1) and a swirl on the filter (fmR Hz, fmD Hz)), water drops */
  const H = { ac, p12: pulse(.125), p25: pulse(.25) };
  H.env = (g, t, pk, dur, att) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + att); g.gain.exponentialRampToValueAtTime(.0001, t + att + dur); };
  H.osc = w => { const o = ac.createOscillator(); if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w); return o; };
  /* every envelope gain starts at 0, not the default 1: if a source starts a frame before its envelope's first event (float
     rounding), that frame must be silent, not a full-level click */
  H.tone = (w, f0, f1, t, dur, pk, out, att = .003) => {
    const o = H.osc(w), g = gain(0);
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    H.env(g, t, pk, dur, att); o.connect(g); g.connect(out); o.start(t); o.stop(t + att + dur + .02); return o;
  };
  H.wob = (o, t, dur, rate, depth) => { const l = ac.createOscillator(), lg = gain(depth); l.frequency.value = rate; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); };
  H.noise = (t, dur, pk, type, f0, f1, q, out, x) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = gain(0), att = (x && x.att) || .002, end = t + att + dur + .03;
    s.buffer = nb; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + att + dur);
    H.env(g, t, pk, dur, att); s.connect(f);
    if (x && x.amR) { const am = gain(1 - x.amD), l = ac.createOscillator(), lg = gain(x.amD); l.frequency.value = x.amR; l.connect(lg); lg.connect(am.gain); f.connect(am); am.connect(g); l.start(t); l.stop(end); }
    else f.connect(g);
    if (x && x.fmR) { const l = ac.createOscillator(), lg = gain(x.fmD); l.frequency.value = x.fmR; l.connect(lg); lg.connect(f.frequency); l.start(t); l.stop(end); }
    g.connect(out); s.start(t, Math.random() * .5); s.stop(end); return f;
  };
  H.drop = (t, f, pk, out) => H.tone('sine', f, f * 1.9, t, .045, pk, out, .001); /* a water drop: a quick little bloop up */
  I.H = H;

  /* ----- sfx with rate limits and a voice cap (drop the oldest non-'keep' voice) ----- */
  function rateOk(name, t) {
    const r = RATE[name] || RATE_DEF, a = I.rl[name] || (I.rl[name] = []);
    while (a.length && a[0] <= t - r[1]) a.shift();
    if (a.length >= r[0]) return false; a.push(t); return true;
  }
  function voice(t, len, keep, vol) {
    const v = I.vox;
    for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= t) v.splice(i, 1);
    if (v.length >= MAXV) { let k = v.findIndex(x => !x.keep); if (k < 0) k = 0; const d = v.splice(k, 1)[0]; d.g.gain.setTargetAtTime(0, t, .006); }
    const g = gain(vol); g.connect(I.sfx); v.push({ g, end: t + len, keep }); return g;
  }
  I.play = (name, arg, t, vol) => {
    if (!has(SFX, name)) return false;
    vol = vol == null ? 1 : Math.min(1, +vol); if (!(vol > .001)) return false; /* omitted or null = full; 0, junk or NaN = nothing */
    if (!I.noLimits && !rateOk(name, t)) return false;
    SFX[name][2](H, t, voice(t, SFX[name][0], SFX[name][1], vol * (TRIM[name] || 1)), arg);
    I.last = name;
    const dk = DUCK[name];
    if (dk && vol > .5 && I.musOn && !I.muted) { const g = I.mus.gain; g.cancelScheduledValues(t); g.setTargetAtTime(I.base.mus * dk[1], t, .05); g.setTargetAtTime(I.base.mus, t + dk[0], .3); }
    return true;
  };
  I.setMute = (on, t) => { I.muted = !!on; const g = I.master.gain; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0 : I.base.master, t, .03); if (on) { I.drift(0, t); I.orbit(0, t); I.engAll(t); } };
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

  /* ----- the petal tinkle for your own DAISY SWIRL: a faint swirling breeze plus a soft note each time a petal slot comes
     round (a missing petal leaves a gap); n 0 stops ----- */
  I.orbit = (n, t) => {
    let b = I.ob;
    if (!n) {
      if (b) { I.ob = null; b.g.gain.cancelScheduledValues(t); b.g.gain.setTargetAtTime(0, t, .05); b.s.stop(t + .4); b.l.stop(t + .4); setTimeout(() => { try { b.g.disconnect(); } catch (e) {} }, 900); }
      return;
    }
    if (!b) {
      b = I.ob = { s: ac.createBufferSource(), f: ac.createBiquadFilter(), l: ac.createOscillator(), lg: gain(600), g: gain(0), n, last: t, nt: t + .05, j: 0 };
      b.s.buffer = nb; b.s.loop = true; b.f.type = 'bandpass'; b.f.Q.value = 3; b.f.frequency.value = 2200; b.l.frequency.value = 1 / ORB_GAP;
      b.s.connect(b.f); b.f.connect(b.g); b.g.connect(I.sfx); b.l.connect(b.lg); b.lg.connect(b.f.frequency);
      b.g.gain.setValueAtTime(0, t); b.g.gain.setTargetAtTime(.012, t, .1); b.s.start(t, Math.random() * .5); b.l.start(t);
    }
    b.n = n; b.last = t; b.sh = 0;
  };

  /* ----- engine hums: a soft buzzy wave → lowpass → a putt-putt tremolo; pitch, brightness, putter rate and level follow
     speed; pm (pitchMul) 1.6 tiny, 0.7 giant ----- */
  const EW = (() => { const n = 12, re = new Float32Array(n), im = new Float32Array(n); for (let k = 1; k < n; k++) im[k] = (k & 1 ? 1 : .55) / Math.pow(k, 1.2); return ac.createPeriodicWave(re, im); })();
  I.engine = (i, s, near, t, pm) => {
    let v = null; for (const x of I.eng) if (x.i === i) v = x;
    if (!(s >= 0) || !(near > 0)) { if (v) I.engOff(v, t); return; }
    s = Math.min(1.3, s); const vol = Math.min(1, near); pm = pm > 0 ? Math.max(.4, Math.min(2.5, pm)) : 1;
    if (!v) {
      if (I.eng.length >= ENG_MAX) { let w = I.eng[0]; for (const x of I.eng) if (x.vol < w.vol) w = x; if (w.vol >= vol) return; I.engOff(w, t); }
      const det = 1 + (((i * 5) % 7) - 3) * .025; /* each kart its own note */
      v = { i, det, s: -1, vol: -1, pm: -1, last: t, upd: -1, o: H.osc(EW), f: ac.createBiquadFilter(), am: gain(.72), l: ac.createOscillator(), lg: gain(.28), g: gain(0) };
      v.f.type = 'lowpass'; v.f.Q.value = 1.1; v.f.frequency.value = 600; v.o.frequency.value = 88 * det; v.l.frequency.value = 8;
      v.o.connect(v.f); v.f.connect(v.am); v.am.connect(v.g); v.g.connect(I.sfx); v.l.connect(v.lg); v.lg.connect(v.am.gain);
      v.o.start(t); v.l.start(t); I.eng.push(v);
    }
    v.last = t; v.sh = 0;
    if (t - v.upd < .045 && Math.abs(s - v.s) < .08 && Math.abs(vol - v.vol) < .1 && Math.abs(pm - v.pm) < .02) return; /* fed every frame: the params move ~20 times a second */
    v.upd = t; v.s = s; v.vol = vol; v.pm = pm;
    const big = pm < 1 ? 1.25 : pm > 1 ? .85 : 1; /* a giant hums a little louder, a tiny kart a little softer */
    v.o.frequency.setTargetAtTime((88 + 150 * s) * v.det * pm, t, .07);
    v.f.frequency.setTargetAtTime((600 + 1800 * s) * Math.sqrt(pm), t, .07);
    v.l.frequency.setTargetAtTime((8 + 22 * s) * (pm > 1 ? pm : .5 + .5 * pm), t, .07);
    v.g.gain.setTargetAtTime(vol * big * (.04 + .05 * Math.min(1, s)), t, .06);
  };
  I.engOff = (v, t) => {
    const k = I.eng.indexOf(v); if (k < 0) return; I.eng.splice(k, 1);
    v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, .05); v.o.stop(t + .4); v.l.stop(t + .4);
    setTimeout(() => { try { v.g.disconnect(); } catch (e) {} }, 900);
  };
  I.engAll = t => { while (I.eng.length) I.engOff(I.eng[0], t); };
  /* the held voices, from the pump: drift sparks crackle, petal notes come round, a drift not refreshed for 8 s stops, an
     unfed tinkle or hum fades. A pump gap over 0.1 s is a main-thread stall, not "unfed": a fed voice is let off once (sh),
     and must be fed again before it is let off again (so throttled background timers can't keep a hum alive forever) */
  I.tick = now => {
    const gap = I.lastT < 0 ? 0 : now - I.lastT; I.lastT = now;
    if (gap > .1) { const off = v => { if (v && !v.sh) { v.last += gap; v.sh = 1; } }; off(I.ob); for (const v of I.eng) off(v); }
    const d = I.dr;
    if (d) {
      if (now - d.last > 8) I.drift(0, now);
      else { if (d.spark < now) d.spark = now; while (d.spark < now + .1) { H.tone('sine', 2600 + Math.random() * 2400, 0, d.spark, .018, DSG[d.lv], I.sfx, .002); d.spark += DSP[d.lv] * (.6 + Math.random() * .8); } }
    }
    const b = I.ob;
    if (b) {
      if (now - b.last > .4) I.orbit(0, now);
      else { if (b.nt < now) b.nt = now + .01; while (b.nt < now + .1) { const k = b.j % 5; if (k < b.n) H.tone('sine', hz(ORB[k]), 0, b.nt, .14, .022, I.sfx, .004); b.nt += ORB_GAP; b.j++; } }
    }
    for (let k = I.eng.length - 1; k >= 0; k--) if (now - I.eng[k].last > .35) I.engOff(I.eng[k], now);
    return !!(I.dr || I.ob || I.eng.length);
  };

  /* ----- music: 16th-step sequencer; the caller pumps schedule(now, until) ----- */
  I.music = (name, v, t) => {
    const bits = vBits(name, v), key = name ? name + (has(VARIED, name) ? bits : '') : '';
    if (key === I.key) return; I.key = key;
    const d = songDef(name, bits);
    if (d && I.seq && I.seq.name === name) { /* the same tune with new bits (final lap, giant): carry on in the same graph from the same step */
      const q = I.seq; q.d = d; q.sd = 60 / d.bpm / 4; q.gi = !!(bits & 2);
      q.n.mel.frequency.setTargetAtTime(d.lp, t, .2); q.n.dl.delayTime.setTargetAtTime(Math.min(.95, q.sd * d.echo), t, .05);
      return;
    }
    if (I.seq) { const o = I.seq.n; o.out.gain.setTargetAtTime(0, t, .06); I.seq = null; setTimeout(() => { try { for (const k in o) o[k].disconnect(); } catch (e) {} }, 900); }
    if (!d) return;
    const sd = 60 / d.bpm / 4, n = { out: gain(1), mel: ac.createBiquadFilter(), drm: gain(1), lead: gain(1), dl: ac.createDelay(1), fb: gain(.26), wet: gain(.2) };
    n.mel.type = 'lowpass'; n.mel.frequency.value = d.lp; n.mel.Q.value = .5; n.dl.delayTime.value = Math.min(.95, sd * d.echo);
    n.out.connect(I.mus); n.mel.connect(n.out); n.drm.connect(n.out); n.lead.connect(n.mel);
    n.lead.connect(n.dl); n.dl.connect(n.fb); n.fb.connect(n.dl); n.dl.connect(n.wet); n.wet.connect(n.mel);
    I.seq = { name, d, n, sd, gi: !!(bits & 2), step: 0, next: t };
  };
  /* a pump gap over 0.1 s (a main-thread stall) re-anchors the next step just ahead of now: the missed notes are skipped,
     never burst out late */
  I.schedule = (now, until) => {
    const gap = I.lastS < 0 ? 0 : now - I.lastS; I.lastS = now;
    const q = I.seq; if (!q) return false;
    if ((gap > .1 && q.next < now + .03) || q.next < now) q.next = now + .03;
    while (I.seq === q && q.next < until) {
      const s = q.step, sw = (s & 3) === 2 ? q.d.swing * q.sd : (s & 3) === 3 ? q.d.swing * q.sd * .5 : 0;
      if (!I.muted && I.musOn) step(q, s, q.next + sw);
      q.next += q.sd; q.step++;
    }
    return !!I.seq;
  };
  I.resync = now => { if (I.seq) I.seq.next = now + .05; I.lastS = now; };

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
    /* the final lap: a driving shaker on the off-sixteenths, an octave bass pump between the beats and an open hat */
    if (d.drive) { if (i & 1) shk(.02); if ((i & 3) === 2) bt(12, sd * .7, .12); if (i === 6 || i === 14) H.noise(t, .08, .014, 'highpass', 6500, 0, .7, o); }
    /* your kart is giant: a bouncy jingle on top (a springy bass bounce on the beats, bell plinks on the chord, a little shaker) */
    if (q.gi) {
      if (i === 0 || i === 8) H.tone('sine', hz(b + 19), hz(b + 12), t, sd * 1.8, .14, n.mel, .003);
      if ((i & 3) === 2) H.tone('sine', hz(a + T[(i >> 2) & 3] + 24), 0, t, sd * 1.5, .05, n.mel, .002);
      if ((i & 7) === 6) H.tone('triangle', hz(a + 31), 0, t, sd, .03, n.mel, .002);
      if (i & 1) H.noise(t, .035, .009, 'bandpass', 8000, 0, 3, o);
    }
  }
  function lead(d, out, f, t, dur, len) {
    const o = H.osc(d.wave === 'p25' ? H.p25 : 'triangle'), g = gain(0), pk = d.lv;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + .012); g.gain.setTargetAtTime(pk * .6, t + .012, .12);
    g.gain.setTargetAtTime(0, t + dur * .92, .035);
    o.frequency.setValueAtTime(f, t); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .25);
    if (d.wave === 'flute') { const o2 = H.osc('sine'), g2 = gain(.3); o2.frequency.setValueAtTime(f * 2, t); o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + dur + .25); }
    if (len >= 4) H.wob(o, t + .15, Math.max(.05, dur - .1), 5.5, f * .008);
  }
  return I;
}

/* ---------- live wrapper (with ?mute=1 every call returns at once) ---------- */
let I = null, muted = false, musOn = true, hid = false, want = null, timer = 0, inPump = false;
if (!SILENT) { try { const ls = window.localStorage; muted = ls.getItem('kart-mute') === '1'; musOn = ls.getItem('kart-music') !== '0'; } catch (e) {} }
const store = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) {} };
const quiet = p => { if (p && typeof p.catch === 'function') p.catch(() => {}); };
const now = () => I.ac.currentTime;
function pump() {
  timer = 0; if (!I || hid) return;
  const t = now(); let more = false; inPump = true;
  try { more = I.schedule(t, t + .12); } catch (e) {}
  try { more = I.tick(t) || more; } catch (e) {}
  if (more) run(); inPump = false;
}
/* (re)start the 25 ms pump; starting it from idle resets the gap clocks, so a quiet spell is never mistaken for a stall */
function run() {
  if (timer || !I || hid || !(I.seq || I.dr || I.ob || I.eng.length)) return;
  if (!inPump) try { I.lastT = I.lastS = now(); } catch (e) {}
  timer = setTimeout(pump, 25);
}
const A = SK.Audio = {
  ready: false, silent: SILENT,
  SFX_NAMES: Object.keys(SFX).concat('drift', 'orbit'), MUSIC_NAMES: Object.keys(SONGS), ALIASES: ALIAS, HAZARD_SOUNDS: HAZ,
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
  play(name, arg, vol) {
    if (SILENT) return;
    if (name === 'giant') name = arg === 0 || arg === false || arg === '0' ? 'shrink' : 'grow';
    if (has(ALIAS, name)) name = ALIAS[name];
    if (name === 'drift') { /* true (or no arg): on, keeping its colour; 1..3: on at that colour; false, 0 or null: off */
      if (!I) return;
      const lv = arg === undefined ? -1 : typeof arg === 'number' ? (arg > 0 ? Math.max(1, Math.min(3, Math.round(arg))) : 0) : arg ? -1 : 0;
      try { const t = now(); if (!lv || muted || hid) I.drift(0, t); else { I.drift(lv < 0 ? (I.dr ? I.dr.lv : 1) : lv, t); run(); } } catch (e) {}
      return;
    }
    if (name === 'orbit') { /* true (or no arg): 5 petals; 1..5 petals left; false, 0 or null: off */
      if (!I) return;
      const n = arg === undefined || arg === true ? 5 : +arg > 0 ? Math.max(1, Math.min(5, Math.round(+arg))) : 0;
      try { const t = now(); if (!n || muted || hid) I.orbit(0, t); else { I.orbit(n, t); run(); } } catch (e) {}
      return;
    }
    if (!I || muted || hid) return;
    try { I.play(name, arg, now() + .002, vol); } catch (e) {}
  },
  engine(i, speed, near, pitchMul) {
    if (SILENT || !I) return;
    i = i | 0; if (i < 0 || i > 7) return;
    try {
      const t = now();
      if (muted || hid || !(speed >= 0)) { I.engine(i, -1, 0, t); return; }
      I.engine(i, +speed, near === undefined ? 1 : +near || 0, t, pitchMul === undefined ? 1 : +pitchMul || 1); run();
    } catch (e) {}
  },
  music(name, v) {
    if (SILENT) return;
    const ok = has(SONGS, name); want = ok ? [name, v | 0] : null;
    if (!I) return;
    try { I.music(ok ? name : null, v | 0, now() + .06); run(); } catch (e) {}
  },
  /* schedule the music further ahead now (before a known stall); the normal pump carries on from there */
  ahead(sec) {
    if (SILENT || !I || hid) return;
    try { const t = now(); I.schedule(t, t + Math.max(.12, Math.min(1, +sec || .6))); run(); } catch (e) {}
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
      if (hid) { clearTimeout(timer); timer = 0; I.drift(0, t); I.orbit(0, t); I.engAll(t); if (I.ac.suspend) quiet(I.ac.suspend()); }
      else { if (I.ac.resume) quiet(I.ac.resume()); I.resync(t); I.lastT = t; run(); }
    } catch (e) {}
  },
  isMuted() { return SILENT || muted; },
  isMusicOn() { return musOn; },
  /* debug: what is live right now */
  _state() { return I ? { ctx: I.ac.state, song: I.key, giantLayer: !!(I.seq && I.seq.gi), voices: I.vox.length, engines: I.eng.map(v => v.i), drift: I.dr ? I.dr.lv : 0, orbit: I.ob ? I.ob.n : 0, last: I.last || '', muted, musOn, hidden: hid } : { ctx: null, muted: SILENT || muted, musOn, hidden: hid }; },
  /* test hook: the same graph/synth/sequencer in any context (e.g. an OfflineAudioContext); nothing is played live */
  _render(ctx) { return create(ctx); }
};
})();
