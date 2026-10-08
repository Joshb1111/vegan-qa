/* FAR FIELD — ff-audio-s2.js: FF.AudioS2, the sound of Sequence 2 (THE WORKS; docs/farfield/SEQUENCE-2.md §15, §16).
   An extension of FF.Audio (ff-audio.js, "EXTENSIONS"): it adds cues, loops, beds and reverbs to the same engine and derives
   what is heard from the game, exactly as Sequence 1's sound does. Synthesised, nothing to download; restrained: no music
   until the warm pad in the breathing space, no stings, no rabbit distress sounds, no words, no other animals. With
   ?mute=1 (FF.SILENT) the engine never exists, so this file never makes a sound or an AudioContext; the scene layer (what is
   heard, published on the bus for the rabbit's ears) still runs, as in Sequence 1.
   Load AFTER ff-audio.js and the Sequence 2 data (ff-rules-s2.js, ff-level-s2.js, ff-script-s2.js). It registers itself on
   FF.AUDIO_EXT at load (a definition only); FF.Audio.init() installs it. OWNER: the Sequence 2 audio builder.

   THE MACHINE, BY EAR (every press, the grammar of FF.RULES.works; state read from FF.Works.press(id) every frame):
     UP       stillness: rain drumming on the platen's top, drips off its edges; the machine itself silent. THE SAFE TIME.
     RELEASE  the clank (a pawl letting go, the 6 cm jolt landing 0.15 s later, a short rattle of teeth), a sheet of rainwater
              pouring off its front edge, the counterweight lurching high up (a chain clank, the cable singing), then a
              groan of stressed iron rising in pitch for 2 s.                                          THE WARNING (wind-up)
     DESCENT  the groan turns into a rushing roar that grows with the platen's speed, a sub-bass swell. THE MOTION
     CONTACT  THE THUD: sub-bass, a hard knock (with enough 60-200 Hz to read on laptop speakers), the frame ringing, water
              bursting out from under its edges, grit; the hall's 3.6 s tail.                          THE STOP
     DOWN     pressing: a hiss bleeding away, iron ticking, water trickling into the pits beneath.
     RISE     a ratchet (6 clicks/s, dry and even) and a low, steady groan of effort. Never dangerous, never the same sound
              as the descent.
     UP       a pawl catches with a clack (the latch): it hangs still again.
   The size of a press is heard: the walking presses Q1/Q2 are higher and lighter, the great press Q3 the lowest and heaviest
   thud in the game. The long hall's bar (clank, thud, thud, thud) pans left to right by position.
   THE GATE (the sluice in pit B): a light knock at P1's clank (it jumps 1 cm), a grinding scrape as it lifts through P1's
   descent, a draught that opens with its gap (always a hairline whistle, a broad cold rush when open), a slower scrape as it
   closes over P1's rise, a dull clunk when shut. The draught is published for the ears as a way-on sound.
   THE WORKER (FF.Painter, SEQUENCE-2.md §7): his wire scraper on the wall, stroke by stroke (1.5 strokes/s, 2.2 "harder"
   after the look), push and pull; the stroke stopping is the cue (silence, a soft tap of the scraper lowered); his boots
   turning, the rag from the trolley, the scraper dipped in the bucket, the lamp's bracket unhooked and hung back; the lamp's
   faint mains hum. He never speaks. If FF.Painter is absent there is no worker and no scraping.
   THE PLACES: the way on (the rain coming back with x over the slab, water running in the channel beneath it, the far beat
   growing louder: from the slab on it is a clank and three heavy steps, the long hall's bar), the intake (tight, the draught,
   the rain behind muffled), the press hall and the long hall (huge iron reverb, roof rain, rain shafts falling through the
   broken roof onto the apron and into the gaps G1 / G2 where it is safe, a broken gutter), the culvert (a trickle, wet and
   close, the machines muffled overhead, a faint scraping ahead), the passage (dry; a pipe ticking; the long hall heard
   through the door, louder near it), outside (a drizzle, wind, drips along the pipe's edge, the Works muffled behind; the
   breathing space behaves as Sequence 1's: breath, close miking, the warm pad at the groom). Walls between the places are
   modelled (X.walls), so each machine is heard as far, near, through the bed or through a door.
   THE RABBIT: paws on wet concrete, the steel bed (a faint dull ring: you are under a press), water in the pits and the
   culvert, grass outside; a splash dropping into the culvert; breath held (x0.3) and a heartbeat in a pit while the press
   above comes down (the strongest under the great press), in the worker's light, a quieter breath hiding under the pallet.
   THE JOIN: the far thud of Sequence 1 (every 4 s, from the walkway on) is taken over from x 124.0 (the S2 start, past the lean-to) and grows louder towards
   the intake; at works-start the machines' own contacts are the heartbeat (FF.Works starts both clocks in step). Leaving the
   Sequence 1 rest after its pull-out fades the pad out over the slab (no music in the Works).
   THE FAILURE (fail {kind: 'machine'}): Sequence 1's handler silences the world on the same frame; the only sound under the
   black is 'contact-muffled' (the thud low-passed, a 1.2 s tail); no rabbit sound. No S2 cue starts while the black lasts.

   READS: FF.Works.press(id) {state, phase, y}, FF.Works.sluice() {gap}, FF.Works.started (ff-works.js); FF.Painter.debug()
   {phase} and the bus fact 'painter' {phase} (ff-painter.js); FF.Humans figure 'painter' (position); FF.S2 data; G.rabbit,
   G.place; bus works-start, painter, restart, fail, rabbit:land (via X.land).
   PUBLISHES (bus 'sound', src 'audio', for the ears): press-clank (only where it is clearly heard), press-thud,
   sluice-scrape, wire-scrape, tool-down, lamp-unhook / lamp-hang, draught (loop, the intake's and the gate's).
   DEBUG: FF.Audio.debug().s2 (also FF.AudioS2.debug()); FF.AudioS2.log: the last 3000 S2 cues as {t, cue, id, lvl}. */
'use strict';
window.FF = window.FF || {};
(function () {
let X = null;                                   // the engine's extension interface (ff-audio.js), given at install
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const mod = (a, n) => ((a % n) + n) % n;
const GG = () => FF.G || {};
const rr = (a, b) => X.rr(a, b), rnd = () => X.rnd();

/* ================================================================== the cue synths (E, voice input, start time, opts) -> seconds */
const CUES2 = {
  /* RELEASE: the pawl lets go. size: Q1/Q2 0.82, P1 1.0, the great press 1.3 */
  'press-clank'(E, d, t, o) {
    const s = o.size || 1, k = 1 / Math.sqrt(s), w = Math.sqrt(s);
    E.burst(d, t, { kind: 'white', a: 0.0006, d: 0.018, peak: 0.55, bp: 2100 * k, q: 0.8 });
    E.partials(d, t + 0.002, [[112 * k, 1.1 * w, 1], [263 * k, 0.8 * w, 0.75], [437 * k, 0.55, 0.5], [692 * k, 0.4, 0.35], [1051 * k, 0.25, 0.22], [1517 * k, 0.15, 0.14]], 0.17);
    E.tone(d, t, { f: 78 * k, f1: 52 * k, a: 0.002, d: 0.32, peak: 0.5, lp: 420 });
    E.burst(d, t, { kind: 'pink', a: 0.001, d: 0.09, peak: 0.35, lp: 1300 });
    E.burst(d, t + 0.15, { kind: 'pink', a: 0.004, d: 0.14, peak: 0.28 * w, lp: 520 });              // the 6 cm jolt lands
    E.tone(d, t + 0.15, { f: 58 * k, f1: 44 * k, a: 0.004, d: 0.25, peak: 0.32 * w, lp: 300 });
    for (let i = 0; i < 6; i++) { const f = rr(1300, 2400) * k; E.partials(d, t + 0.03 + i * rr(0.018, 0.03), [[f, 0.035, 1], [f * 1.47, 0.025, 0.5]], 0.05 * (1 - i / 7)); }
    return 1.4 * w;
  },
  /* the sheet of rainwater collected on the platen's top pouring off its front edge onto the bed */
  'water-sheet'(E, d, t, o) {
    const w = Math.sqrt(o.size || 1);
    E.burst(d, t, { kind: 'white', a: 0.22, hold: 0.45 * w, d: 1.1, peak: 0.16, bp: 1500, q: 0.45 });
    E.burst(d, t + 0.05, { kind: 'pink', a: 0.2, hold: 0.4 * w, d: 0.9, peak: 0.16, lp: 650 });
    for (let i = 0; i < 18; i++) E.burst(d, t + rr(0.05, 1.5), { kind: 'white', a: 0.001, d: rr(0.008, 0.03), peak: rr(0.02, 0.07), bp: rr(1800, 5200), q: 2 });
    return 2.2;
  },
  /* the counterweight lurching high up: a chain clank, a cable singing */
  counterweight(E, d, t) {
    E.partials(d, t, [[203, 0.6, 1], [489, 0.4, 0.6], [871, 0.25, 0.4], [1390, 0.15, 0.25]], 0.09);
    E.burst(d, t, { kind: 'pink', a: 0.003, d: 0.12, peak: 0.18, lp: 900 });
    for (let i = 0; i < 7; i++) { const f = rr(1100, 2300); E.partials(d, t + 0.04 + i * rr(0.04, 0.08), [[f, 0.05, 1], [f * 1.5, 0.03, 0.5]], 0.04); }
    E.tone(d, t + 0.02, { f: 96, f1: 91, type: 'sawtooth', a: 0.01, d: 1.4, peak: 0.025, lp: 700 });
    return 1.6;
  },
  /* CONTACT: THE THUD */
  'press-thud'(E, d, t, o) {
    const s = o.size || 1, k = 1 / Math.sqrt(s), w = Math.sqrt(s);
    E.tone(d, t, { f: 47 * k, f1: 27 * k, a: 0.003, d: 1.3 * w, peak: 0.7, lp: 170 });                 // the sub
    E.burst(d, t, { kind: 'brown', a: 0.002, d: 0.9 * w, peak: 0.55, lp: 240 });                      // the body
    E.tone(d, t, { f: 92 * k, f1: 61 * k, a: 0.002, d: 0.42, peak: 0.45, lp: 600 });                  // its weight on small speakers
    E.burst(d, t, { kind: 'pink', a: 0.0008, d: 0.1, peak: 0.55, lp: 2400 });                         // iron on concrete
    E.burst(d, t, { kind: 'white', a: 0.0004, d: 0.016, peak: 0.25, bp: 1700, q: 0.7 });
    E.partials(d, t + 0.003, [[66 * k, 2.4 * w, 1], [141 * k, 1.7, 0.6], [247 * k, 1.1, 0.4], [389 * k, 0.7, 0.25]], 0.07);   // the frame rings
    E.burst(d, t + 0.01, { kind: 'white', a: 0.008, hold: 0.04, d: 0.6, peak: 0.2, bp: 1100, bp1: 2400, q: 0.6 });               // water bursts out
    for (let i = 0; i < 12; i++) E.burst(d, t + rr(0.04, 0.9), { kind: 'white', a: 0.001, d: rr(0.01, 0.035), peak: rr(0.02, 0.06), bp: rr(1500, 4500), q: 1.8 });
    E.burst(d, t + 0.12, { kind: 'pink', a: 0.06, d: 0.9, peak: 0.035, hp: 3000 });                  // grit off the frame
    return 2.6 * w;
  },
  /* the failure, under black: the thud, low-passed, a 1.2 s tail; nothing else */
  'contact-muffled'(E, d, t) {
    const lp = E.filt('lowpass', 260, 0.6, d);
    E.tone(lp, t, { f: 46, f1: 28, a: 0.004, d: 1.2, peak: 0.7 }); E.burst(lp, t, { kind: 'brown', a: 0.003, d: 1.0, peak: 0.6 }); E.tone(lp, t, { f: 88, f1: 60, a: 0.003, d: 0.35, peak: 0.35 });
    return 1.4;
  },
  /* UP again: a pawl catches. The stillness begins */
  'press-latch'(E, d, t, o) {
    const k = 1 / Math.sqrt(o.size || 1);
    E.partials(d, t, [[318 * k, 0.28, 1], [742 * k, 0.16, 0.5], [1287 * k, 0.09, 0.3]], 0.09); E.burst(d, t, { kind: 'pink', a: 0.001, d: 0.05, peak: 0.16, lp: 1100 }); E.tone(d, t, { f: 72 * k, f1: 55 * k, d: 0.16, peak: 0.2, lp: 300 });
    return 0.5;
  },
  /* RISE: one tooth of the ratchet (6 a second) */
  'ratchet-click'(E, d, t, o) {
    const k = 1 / Math.sqrt(o.size || 1);
    E.burst(d, t, { kind: 'white', a: 0.0004, d: 0.006, peak: 0.3, bp: 2900 * k, q: 1.4 }); E.partials(d, t, [[1630 * k, 0.04, 1], [2870 * k, 0.025, 0.5]], 0.05); E.tone(d, t + 0.004, { f: 150 * k, f1: 120 * k, d: 0.035, peak: 0.12, lp: 600 });
    return 0.12;
  },
  /* DOWN: iron ticking under load */
  'iron-tick'(E, d, t) { const f = rr(850, 1500); E.partials(d, t, [[f, 0.06, 1], [f * 2.31, 0.03, 0.4]], 0.035); E.burst(d, t, { kind: 'white', a: 0.0004, d: 0.003, peak: 0.05, hp: 2500 }); return 0.12; },
  /* the sluice */
  'sluice-knock'(E, d, t) { E.partials(d, t, [[236, 0.22, 1], [607, 0.12, 0.5], [1130, 0.07, 0.3]], 0.06); E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.04, peak: 0.1, lp: 900 }); return 0.4; },
  'sluice-scrape'(E, d, t, o) {
    const dur = o.dur || 2.0, up = o.dir !== 'down';
    E.burst(d, t, { kind: 'brown', a: 0.25, hold: Math.max(0, dur - 0.55), d: 0.3, peak: 0.22, lp: 320 });
    let tt = 0, n = 0;
    while (tt < dur && n < 90) { const k = tt / dur, f = (up ? lerp(900, 1500, k) : lerp(1400, 850, k)) * rr(0.85, 1.15); E.burst(d, t + tt, { kind: 'white', a: 0.003, d: rr(0.02, 0.06), peak: rr(0.04, 0.1) * Math.sin(Math.PI * clamp(k * 1.15, 0, 1)) + 0.02, bp: f, q: 2.2 }); tt += rr(0.02, 0.06); n++; }
    const os = E.ac.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(up ? 610 : 760, t); os.frequency.linearRampToValueAtTime(up ? 770 : 580, t + dur);
    const bp = E.filt('bandpass', 1300, 9), eg = E.envG(d, t + 0.2, 0.4, 0.35, 0.012, Math.max(0, dur - 0.95)); os.connect(bp); bp.connect(eg); os.start(t + 0.2); os.stop(t + dur + 0.1);
    return dur + 0.3;
  },
  'sluice-shut'(E, d, t) { E.tone(d, t, { f: 92, f1: 62, d: 0.25, peak: 0.32, lp: 420 }); E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.08, peak: 0.24, lp: 1000 }); E.partials(d, t, [[163, 0.55, 1], [381, 0.38, 0.6], [712, 0.22, 0.3]], 0.07); return 0.8; },
  /* the worker */
  'wire-scrape'(E, d, t, o) {
    const pull = !!o.pull, hard = o.hard ? 1.35 : 1, dur = (pull ? 0.26 : 0.34) / (o.hard ? 1.15 : 1);
    E.burst(d, t, { kind: 'white', a: 0.03, hold: dur - 0.09, d: 0.06, peak: (pull ? 0.07 : 0.11) * hard, bp: pull ? 3100 : 3900, q: 0.9 });
    E.burst(d, t, { kind: 'pink', a: 0.04, hold: dur - 0.1, d: 0.06, peak: (pull ? 0.04 : 0.06) * hard, bp: 850, q: 1.1 });
    let tt = 0.01; while (tt < dur - 0.02) { E.burst(d, t + tt, { kind: 'white', a: 0.001, d: rr(0.004, 0.012), peak: rr(0.03, 0.08) * hard, bp: rr(2400, 6000), q: 2.5 }); tt += rr(0.018, 0.04); }
    return dur + 0.1;
  },
  'tool-down'(E, d, t) { E.partials(d, t, [[1870, 0.08, 1], [2990, 0.05, 0.5]], 0.035); E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.04, peak: 0.07, bp: 1200, q: 1 }); E.tone(d, t + 0.09, { f: 410, d: 0.04, peak: 0.03 }); return 0.3; },
  rag(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.06, hold: 0.12, d: 0.2, peak: 0.06, hp: 1800 }); E.burst(d, t + 0.42, { kind: 'pink', a: 0.03, d: 0.15, peak: 0.04, hp: 2200 }); E.partials(d, t + 0.05, [[2210, 0.05, 1]], 0.012); return 0.7; },
  'lamp-unhook'(E, d, t) {
    E.burst(d, t, { kind: 'white', a: 0.0005, d: 0.014, peak: 0.12, bp: 2500, q: 1 }); E.partials(d, t, [[928, 0.13, 1], [1712, 0.08, 0.6], [2655, 0.05, 0.3]], 0.05);
    for (let i = 0; i < 3; i++) E.partials(d, t + 0.06 + i * rr(0.03, 0.06), [[rr(2200, 3400), 0.03, 1]], 0.02);
    return 0.5;
  },
  'lamp-hang'(E, d, t) { E.tone(d, t, { f: 300, f1: 240, d: 0.06, peak: 0.08 }); CUES2['lamp-unhook'](E, d, t + 0.02, {}); return 0.6; },
  'boot-turn'(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.03, hold: 0.08, d: 0.12, peak: 0.06, bp: 1100, q: 1 }); for (let i = 0; i < 4; i++) E.burst(d, t + rr(0.02, 0.2), { kind: 'white', a: 0.001, d: rr(0.005, 0.012), peak: rr(0.02, 0.05), bp: rr(2500, 5000), q: 2 }); return 0.4; },
  'bucket-dip'(E, d, t) { E.burst(d, t, { kind: 'white', a: 0.02, d: 0.25, peak: 0.06, bp: 1250, q: 0.8 }); E.partials(d, t + 0.01, [[478, 0.16, 1], [1131, 0.08, 0.5]], 0.035); for (let i = 0; i < 4; i++) E.tone(d, t + rr(0.15, 0.5), { f: rr(900, 1600), f1: 600, a: 0.001, d: 0.03, peak: 0.02 }); return 0.7; },
  /* the passage: a pipe ticking as it cools */
  'pipe-tick'(E, d, t) { const f = rr(1150, 1550); E.partials(d, t, [[f, 0.14, 1], [f * 2.76, 0.06, 0.35]], 0.03); return 0.25; },
};
/* reverb sends, priorities, distance roll-off (a press is a huge source: it carries) */
const OPT2 = {
  'press-clank': { send: 0.8, roll: 0.3 }, 'water-sheet': { send: 0.5, roll: 0.5 }, counterweight: { send: 0.9, roll: 0.3 }, 'press-thud': { send: 1.0, roll: 0.28, prio: 1 },
  'contact-muffled': { bus: 'over', prio: 1 }, 'press-latch': { send: 0.7, roll: 0.35 }, 'ratchet-click': { send: 0.5, roll: 0.7 }, 'iron-tick': { send: 0.5, roll: 1.0 },
  'sluice-knock': { send: 0.5 }, 'sluice-scrape': { send: 0.6, roll: 0.6 }, 'sluice-shut': { send: 0.6 },
  'wire-scrape': { send: 0.35 }, 'tool-down': { send: 0.3 }, rag: { send: 0.2 }, 'lamp-unhook': { send: 0.3 }, 'lamp-hang': { send: 0.3 }, 'boot-turn': { send: 0.2 }, 'bucket-dip': { send: 0.3 }, 'pipe-tick': { send: 0.6 },
};
/* per-cue trims (dB), calibrated with FF.Audio.lab() (tests/audio2): point-blank peaks: the great press's thud about -3 dBFS
   (as Sequence 1's shot, the loudest sounds in the game), P1's -4, the clank -7, the worker's stroke -13, the ratchet -17,
   the iron ticks and the pipe -26 (as the rabbit's own small sounds) */
const TRIM2 = { 'press-clank': -1, 'water-sheet': 6, counterweight: 5, 'press-thud': -2, 'contact-muffled': -2.5, 'press-latch': 2, 'ratchet-click': 4, 'iron-tick': 4,
  'sluice-knock': 4, 'sluice-scrape': 6, 'sluice-shut': 2, 'wire-scrape': 15, 'tool-down': 9, rag: 3, 'lamp-unhook': 8, 'lamp-hang': 6, 'boot-turn': 16, 'bucket-dip': 9, 'pipe-tick': 6 };
/* salience for the ears (published as 'sound'); the Player classifies them by name (clank: a door-like cue, thud: ambient) */
const SAL2 = { 'press-clank': 0.9, 'press-thud': 1.0, 'sluice-scrape': 0.6, 'wire-scrape': 0.7, 'tool-down': 0.5, 'lamp-unhook': 0.8, 'lamp-hang': 0.6 };

/* ================================================================== loops (created on first hold, levelled every frame) */
function osc(E, srcs, type, f) { const o = E.ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(); srcs.push(o); return o; }
function noise(E, srcs, kind, dest, rate) { const s = E.src(kind, E.ac.currentTime, null, dest, rate); srcs.push(s); return s; }
function lfo2(E, srcs, f, depth, param) { const o = osc(E, srcs, 'sine', f), g = E.g(depth); o.connect(g); g.connect(param); return o; }
const LOOPS2 = {
  /* one press's continuous voice: the groan (body + stressed iron), the roar, the hiss, the rain on its top.
     params {state, u (0..1 through the state), tIn (s into it), size} */
  press(E, out) {
    const srcs = [];
    const bodyG = E.g(0, out), bodyLP = E.filt('lowpass', 230, 0.9, bodyG);
    const b1 = osc(E, srcs, 'sawtooth', 34), b2 = osc(E, srcs, 'sawtooth', 34.6); b1.connect(E.g(0.5, bodyLP)); b2.connect(E.g(0.5, bodyLP));
    const strG = E.g(0, out), exc = E.g(1), res = [[1, 1], [1.53, 0.6], [2.37, 0.35]].map(([m, a]) => { const f = E.filt('bandpass', 230 * m, 22, E.g(a, strG)); exc.connect(f); return { f, m }; });
    noise(E, srcs, 'pink', exc); lfo2(E, srcs, 0.7, 4, res[0].f.frequency);
    const roarG = E.g(0, out), roarHP = E.filt('highpass', 130, 0.6, roarG), roarLP = E.filt('lowpass', 200, 0.7, roarHP); noise(E, srcs, 'brown', roarLP);
    const airG = E.g(0, out); noise(E, srcs, 'pink', E.filt('bandpass', 480, 0.8, airG));
    const subG = E.g(0, out), sub = osc(E, srcs, 'sine', 31); sub.connect(subG);
    const hissG = E.g(0, out); noise(E, srcs, 'white', E.filt('highpass', 3800, 0.7, hissG));
    const drumG = E.g(0, out), drumLP = E.filt('lowpass', 5200, 0.6, drumG); let drum = null;
    const attach = () => { if (!drum && E.buf.tin) drum = noise(E, srcs, E.buf.tin, drumLP); };
    attach();
    return { srcs, set(p) {
      attach();
      const k = 1 / Math.sqrt(p.size || 1), u = clamp(p.u || 0, 0, 1), tIn = p.tIn || 0;
      let body = 0, bodyF = 33, str = 0, strF = 210, roar = 0, roarF = 180, air = 0, subA = 0, hiss = 0, drm = 1, tc = 0.06;
      if (p.state === 'release') { body = 0.12 + 0.3 * u; bodyF = 33 * (1 + 0.3 * u); str = 0.45 + 0.8 * u; strF = 200 * (1 + 0.7 * u); drm = 0.8; }
      else if (p.state === 'descent') { body = 0.42 - 0.15 * u; bodyF = 43 * (1 + 0.3 * u); str = 1.25 * (1 - 0.6 * u); strF = 340 * (1 + 0.4 * u); roar = Math.pow(u, 1.3); roarF = 180 + 1100 * u * u; air = 0.6 * u * u; subA = u * u; drm = 0.6; tc = 0.04; }
      else if (p.state === 'down') { hiss = 0.5 * Math.exp(-tIn / 1.4); drm = 0.7; tc = tIn < 0.12 ? 0.012 : 0.1; }
      else if (p.state === 'rise') { body = 0.18; bodyF = 27; str = 0.25; strF = 170 * (1 + 0.1 * Math.sin(tIn * 2.3)); drm = 0.8; tc = 0.15; }
      E.to(bodyG.gain, body * 0.5, tc); E.to(b1.frequency, bodyF * k, 0.08); E.to(b2.frequency, bodyF * k * 1.017, 0.08);
      E.to(strG.gain, str * 0.9, tc); res.forEach(r => E.to(r.f.frequency, strF * k * r.m, 0.08));
      E.to(roarG.gain, roar * 0.7, tc); E.to(roarLP.frequency, roarF * k, 0.05); E.to(airG.gain, air * 0.3, tc); E.to(subG.gain, subA * 0.12, tc); E.to(sub.frequency, 31 * k, 0.5);
      E.to(hissG.gain, hiss * 0.12, tc); E.to(drumG.gain, drm * 0.32 * (p.rain == null ? 1 : p.rain), 0.4);
    } };
  },
  /* rain falling through a gap in the roof onto concrete */
  rainshaft(E, out) {
    const srcs = [], hp = E.filt('highpass', 600, 0.6, out), lp = E.filt('lowpass', 8000, 0.5); lp.connect(hp);
    noise(E, srcs, 'pink', E.filt('bandpass', 520, 0.6, E.g(0.18, out)));
    let rain = null; const attach = () => { if (!rain && E.buf.rain) rain = noise(E, srcs, E.buf.rain, lp); };
    attach();
    return { srcs, set() { attach(); } };
  },
  /* running water: the channel under the slab, a broken gutter, the culvert, the pits after a contact. params {f, body} */
  water(E, out) {
    const srcs = [], am = E.g(0.5, out), bp = E.filt('bandpass', 1600, 1.3, am); noise(E, srcs, 'pink', bp);
    const m = E.g(0.9, am.gain); noise(E, srcs, 'brown', E.filt('lowpass', 14, 0.7, m), 1);
    const lo = E.g(0, out), lbp = E.filt('bandpass', 420, 0.9, lo); noise(E, srcs, 'brown', lbp);
    noise(E, srcs, 'pink', E.filt('bandpass', 3300, 3, E.g(0.22, out)));
    return { srcs, set(p) { E.to(bp.frequency, 1600 * (p.f || 1), 0.3); E.to(lbp.frequency, 420 * (p.f || 1), 0.3); E.to(lo.gain, p.body || 0, 0.3); } };
  },
  /* air pulled through an opening. params {f, k (0 a hairline .. 1 wide open)} */
  draught(E, out) {
    const srcs = [], nb = E.filt('bandpass', 900, 1.4, E.g(0.6, out)), wh = E.filt('bandpass', 1100, 7, E.g(0.45, out)), exc = E.g(1);
    exc.connect(nb); exc.connect(wh); noise(E, srcs, 'pink', exc); noise(E, srcs, 'brown', E.filt('lowpass', 300, 0.7, E.g(0.3, out)));
    lfo2(E, srcs, 0.13, 60, wh.frequency);
    return { srcs, set(p) { const k = clamp(p.k == null ? 1 : p.k, 0, 1), f = p.f || 1000; E.to(wh.frequency, lerp(f * 2.1, f, k), 0.2); E.to(wh.Q, lerp(10, 5, k), 0.2); E.to(nb.frequency, lerp(f * 1.6, f * 0.8, k), 0.2); } };
  },
};

/* ================================================================== beds and rooms (keyed by the S2 look names, FF.S2.looks) */
const BEDS2 = {
  'works-approach': { rain: 0.17, rainLP: 6500, wind: 0.2, hum: 0.06, hall: 0.0, drips: 0.25, mach: 0, verb: 'open' },
  tunnel:           { rain: 0.05, rainLP: 520,  wind: 0.0, hum: 0.05, hall: 0.03, drips: 0.3, mach: 0, verb: 'tight' },
  hall:             { rain: 0.09, rainLP: 2600, wind: 0.03, hum: 0.06, hall: 0.06, drips: 0.55, mach: 0, verb: 'works' },
  culvert:          { rain: 0.03, rainLP: 450,  wind: 0.0, hum: 0.06, hall: 0.0, drips: 0.6, mach: 0, verb: 'wet' },
  passage:          { rain: 0.015, rainLP: 600, wind: 0.0, hum: 0.07, hall: 0.0, drips: 0.12, mach: 0, verb: 'passage' },
  line:             { rain: 0.1, rainLP: 3000,  wind: 0.03, hum: 0.06, hall: 0.07, drips: 0.45, mach: 0, verb: 'works' },
  'works-out':      { rain: 0.07, rainLP: 5200, wind: 0.16, hum: 0.02, hall: 0.0, drips: 0.15, mach: 0, verb: 'soft' },
};
/* lazy: made ahead of need as the rabbit nears the Works (X.prepare, one a frame), not when sound is unlocked */
const VERB2 = {
  works:   { dur: 3.6, bright: 3000, early: 0.07, ret: 0.9, amt: 1.0, lazy: true },     // the press hall and the long hall: iron, huge
  tight:   { dur: 0.5, bright: 3600, early: 0.38, ret: 0.6, amt: 0.75, lazy: true },    // the intake
  passage: { dur: 1.15, bright: 3800, early: 0.28, ret: 0.55, amt: 0.65, lazy: true },  // the service passage
};

/* ================================================================== the places and their walls */
const SX = { tunnel: 131.0, hall: 136.0, culvert: 145.7, wall: 147.0, passage: 153.0, line: 167.0, out: 193.8, lineDoor: 166.8, endDoor: 193.6 };
function zoneOf(x, y) {
  if (x < SX.tunnel) return 'yard';
  if (x < SX.hall) return 'tunnel';
  if (x < SX.culvert || (x < SX.wall && y > -0.45)) return 'hall';
  if (x < SX.passage) return 'culvert';
  if (x < SX.line) return 'passage';
  if (x < SX.out) return 'line';
  return 'out';
}
/* [low-pass cap Hz, gain] between two places; symmetric; anything unlisted is far and through several walls */
const WALL = {
  'tunnel|yard': [1800, 0.75], 'hall|tunnel': [3200, 0.85], 'hall|yard': [650, 0.5], 'culvert|passage': [2200, 0.8], 'hall|passage': [480, 0.4],
  'hall|line': [380, 0.38], 'culvert|line': [420, 0.42], 'culvert|tunnel': [400, 0.35], 'out|yard': [300, 0.25],
};
function wallBetween(a, b, L, p) {
  if (a === b) return null;
  const key = a < b ? a + '|' + b : b + '|' + a;
  if (key === 'line|passage') { const k = clamp(1 - Math.abs(L.x - SX.lineDoor) / (a === 'passage' ? 9 : 6), 0, 1); return [lerp(650, 3200, k), lerp(0.5, 0.92, k)]; }
  if (key === 'line|out') { const k = clamp(1 - Math.abs(L.x - SX.endDoor) / 7, 0, 1); return [lerp(420, 2000, k), lerp(0.45, 0.85, k)]; }
  if (key === 'culvert|hall') { const k = clamp(S.gap / 0.3, 0, 1); return [lerp(1100, 2600, k), lerp(0.6, 0.85, k)]; }
  return WALL[key] || [340, 0.3];
}
function walls(p, L, o) {
  const lz = zoneOf(L.x, L.y), pz = p.zone === 'gate' ? (lz === 'culvert' ? 'culvert' : 'hall') : zoneOf(p.x, p.y || 0);
  const w = wallBetween(lz, pz, L, p); if (!w) return;
  o.lp = Math.min(o.lp, w[0]); o.g *= w[1];
}

/* ================================================================== the scene */
let MACH = [], PITS = [], GAPS = [], PALLET = null, PAINTER = null, SLUICE = null, PIPE = null;
const S = { mem: {}, gap: 0, sluice: '', justStarted: false, startedFlag: false, beat: { mine: false, next: 0, n: 0 }, pub: {}, padFade: null,
  wk: { cls: '', raw: '', src: 'none', since: 0, next: 0, pull: false, hard: false, look: false, n: 0 },
  rab: { breathNext: 0, heartNext: 0, afterRise: -9 }, tickNext: 0, pipeNext: 0, dripNext: 0, black: false };
const LOG = [];
function log(cue, id, lvl) { LOG.push({ t: +((GG().t || 0).toFixed(3)), cue, id: id || '', lvl: lvl == null ? undefined : +lvl.toFixed(3) }); if (LOG.length > 3000) LOG.splice(0, LOG.length - 3000); }
const P = (x, y, z, extra) => Object.assign({ x, y, z, s2: true }, extra || {});
function build() {
  const S2 = FF.S2, WK = S2 && S2.works; if (!WK) return false;
  const one = (m, station, size, offset, marks, period, cw) => ({ id: m.id, station, x0: m.x0, x1: m.x1, cx: (m.x0 + m.x1) / 2, upY: m.upY, thick: m.thick, size, offset: offset || 0, marks, period, cw });
  MACH = [one(WK.P1, 'P1', 1.0, 0, WK.P1.marks, WK.P1.period, P(137.5, 9.5, -4.2))]
    .concat(WK.line.platens.map(q => one(q, 'line', q.id === 'Q3' ? 1.3 : 0.82, q.offset, WK.line.marks, WK.line.period, P((q.x0 + q.x1) / 2, 11, -4.6))));
  const sh = S2.shelters || [];
  PITS = sh.filter(s => s.kind === 'pit'); GAPS = sh.filter(s => s.kind === 'gap'); PALLET = sh.find(s => s.id === 'paint-pallet') || null;
  PAINTER = S2.painter || null; SLUICE = WK.sluice || null;
  PIPE = (S2.solids || []).find(s => s.id === 'pipe') || null;
  return true;
}
function reset(cp, reason) {
  S.mem = {}; S.justStarted = false; S.black = false; S.pub = {};
  S.startedFlag = !!(cp && cp.x >= 133.9);
  S.wk = { cls: '', raw: '', src: 'none', since: 0, next: 0, pull: false, hard: false, look: false, n: 0 };
  S.rab = { breathNext: 0, heartNext: 0, afterRise: -9 };
  S.beat.mine = false; S.beat.bar0 = null;
  if (worksStarted() && X.D.thud) X.D.thud.on = false;          // the machines are the heartbeat now
  if (reason !== 'fail') S.padFade = null;
}
function worksStarted() { const W = FF.Works; if (W && !W.stub && W.started != null) return !!W.started; return S.startedFlag; }
/* one press now: {state, ph, y, tIn, u} from FF.Works (up and still when there is no machine module or it has not started) */
function pressNow(m) {
  const W = FF.Works; let st = 'up', ph = null, y = m.upY;
  if (W && !W.stub && typeof W.press === 'function') { try { const p = W.press(m.id); if (p && p.phase != null && !p.idle) { st = p.state; ph = p.phase; y = p.y; } } catch (_) {} }
  const M = m.marks; let a = M.up, b = m.period;
  if (st === 'release') { a = M.release; b = M.descent; } else if (st === 'descent') { a = M.descent; b = M.contact; } else if (st === 'down') { a = M.contact; b = M.rise; } else if (st === 'rise') { a = M.rise; b = M.up; }
  const tIn = ph == null ? 0 : Math.max(0, ph - a);
  return { state: st, ph, y, tIn, u: ph == null ? 0 : clamp(tIn / (b - a), 0, 1) };
}
/* was `mark` passed going from phase a to phase b (b may have wrapped)? A jump of more than 1 s is a reset, not a passage */
function crossed(a, b, mark, period) { const d = mod(b - a, period); if (d <= 0 || d > 1.0) return false; let r = mod(mark - a, period); if (r === 0) r = period; return r <= d; }
const lvlAt = (pos, L, roll) => X.spatial(pos, L, roll).g;
const SMALL = { 'ratchet-click': 1, 'iron-tick': 1, 'sluice-knock': 1, 'pipe-tick': 1, 'wire-scrape': 1, 'tool-down': 1, rag: 1, 'boot-turn': 1, 'bucket-dip': 1, drip: 1 };
function play(cue, pos, o, L, id) {
  if (S.black) return 0;
  const lvl = pos ? lvlAt(pos, L, OPT2[cue] && OPT2[cue].roll) : 1;
  if (lvl < (SMALL[cue] ? 0.012 : 0.003) && !(o && o.always)) return 0;           // too far or behind too many walls to matter
  const opts = Object.assign({}, o || {}); if (!(SAL2[cue] != null && lvl >= 0.12)) opts.noPub = true;
  X.cue(cue, pos, opts); log(cue, id, lvl); return lvl;
}

/* ---- the machines */
function machines(now, r, L) {
  const started = worksStarted(), near = L.x >= 124.0;
  for (const m of MACH) {
    const s = pressNow(m), was = S.mem[m.id]; S.mem[m.id] = Object.assign(s, { click: was ? was.click : -1 });
    const nx = clamp(L.x, m.x0 + 0.4, m.x1 - 0.4), bodyPos = P(lerp(m.cx, nx, 0.55), s.y + m.thick * 0.5, -1.0);
    /* transitions: the one-shots, on the frame the phase passes each mark */
    if (started && s.ph != null && ((was && was.ph != null) || S.justStarted)) {
      const a = was && was.ph != null ? was.ph : mod(-0.001, m.period), b = s.ph, M = m.marks;
      if (crossed(a, b, M.release, m.period)) onRelease(m, s, L);
      if (crossed(a, b, M.descent, m.period)) onDescent(m, s, L);
      if (crossed(a, b, M.contact, m.period)) onContact(m, s, L, now);
      if (crossed(a, b, M.rise, m.period)) onRise(m, s, L, now);
      if (crossed(a, b, M.up, m.period)) onUp(m, s, L);
    }
    /* the ratchet: 6 teeth a second through the rise */
    if (s.state === 'rise') {
      const k = Math.floor(s.tIn * 6);
      if (was && was.state === 'rise' && k !== was.click && !S.black) play('ratchet-click', P(m.cx + (m.id === 'P1' ? -2.2 : 0), s.y + m.thick + 0.5, -2.4), { size: m.size, gain: m.id === 'Q3' ? 1.0 : 0.85 }, L, m.id);
      S.mem[m.id].click = k;
    } else S.mem[m.id].click = -1;
    /* pressing: iron ticks, sparse and fading */
    if (s.state === 'down' && !S.black && rnd() < 3.0 * Math.exp(-s.tIn / 2) / 60) play('iron-tick', P(rr(m.x0, m.x1), rr(0.3, m.thick), rr(-2.5, 0.3)), {}, L, m.id);
    /* the continuous voice, where it can be heard */
    if (near) {
      const g = lvlAt(bodyPos, L);
      if (g > 0.002) X.hold('s2:' + m.id, 'press', bodyPos, 1.0, { state: s.state, u: s.u, tIn: s.tIn, size: m.size, rain: 1 });
    }
  }
}
function onRelease(m, s, L) {
  const front = P(lerp(m.cx, clamp(L.x, m.x0, m.x1), 0.6), 0.6, 0.55);
  play('press-clank', P(lerp(m.cx, clamp(L.x, m.x0, m.x1), 0.5), m.upY + 0.2, -0.6), { size: m.size }, L, m.id);
  play('water-sheet', front, { size: m.size, delay: 0.12 }, L, m.id);
  play('counterweight', m.cw, { delay: 0.15, gain: m.id === 'P1' ? 1 : 0.7 }, L, m.id);
  if (m.id === 'P1' && SLUICE) play('sluice-knock', sluicePos(), { delay: 0.04 }, L, 'sluice');
}
function onDescent(m, s, L) { if (m.id === 'P1' && SLUICE) play('sluice-scrape', sluicePos(), { dir: 'up', dur: 2.0 }, L, 'sluice'); }
function onContact(m, s, L, now) {
  play('press-thud', P(lerp(m.cx, clamp(L.x, m.x0, m.x1), 0.6), 0.2, -0.4), { size: m.size }, L, m.id);
  for (const p of PITS) if (p.under === m.id) S.mem['trickle:' + p.id] = now;
}
function onRise(m, s, L, now) {
  if (m.id === 'P1' && SLUICE) play('sluice-scrape', sluicePos(), { dir: 'down', dur: 3.6, gain: 0.85 }, L, 'sluice');
  S.rab.afterRise = now;
}
function onUp(m, s, L) {
  play('press-latch', P(m.cx + (m.id === 'P1' ? -2.2 : 0), m.upY + m.thick + 0.6, -2.4), { size: m.size }, L, m.id);
  if (m.id === 'P1' && SLUICE) play('sluice-shut', sluicePos(), {}, L, 'sluice');
}
const sluicePos = () => P((SLUICE.x0 + SLUICE.x1) / 2, (SLUICE.floorY || -0.4) + 0.15, -0.1, { zone: 'gate' });

/* ---- the gate's draught and the water in the pits */
function sluiceAndPits(now, L) {
  const W = FF.Works; let gap = 0;
  if (W && !W.stub && typeof W.sluice === 'function') { try { const s = W.sluice(); if (s) gap = s.gap || 0; } catch (_) {} }
  S.gap = gap;
  if (SLUICE && L.x > 134 && L.x < 156) {
    const k = clamp(gap / 0.3, 0, 1), pos = sluicePos();
    X.hold('s2:sluice', 'draught', pos, 0.08 + 1.1 * k, { f: 1050, k });
    publishLoop('s2:sluice', 'draught', pos, k > 0.15 ? lvlAt(pos, L) * k : 0, now);
  } else if (S.pub['s2:sluice'] && SLUICE) publishLoop('s2:sluice', 'draught', sluicePos(), 0, now);
  for (const p of PITS) {
    const t0 = S.mem['trickle:' + p.id];
    if (t0 == null) continue;
    const age = now - t0; if (age > 9 || age < 0) { delete S.mem['trickle:' + p.id]; continue; }
    const g = (age < 0.4 ? age / 0.4 : 1) * Math.exp(-Math.max(0, age - 2) / 2.5) * 0.7, pos = P((p.core[0] + p.core[1]) / 2, -0.3, 0.1);
    if (lvlAt(pos, L) > 0.01) X.hold('s2:trickle:' + p.id, 'water', pos, g, { f: 1.25, body: 0.05 });
  }
}
/* a loop published for the ears (Sequence 1 publishes the engine and torches the same way): refreshed every 0.5 s, stopped */
function publishLoop(id, cue, pos, lvl, now) {
  const on = lvl > 0.06, was = S.pub[id];
  if (on && (!was || now - was >= 0.5)) { S.pub[id] = now; FF.bus.emit('sound', { cue, id, loop: true, x: +pos.x.toFixed(2), y: +(pos.y || 0).toFixed(2), z: +(pos.z || 0).toFixed(2), gain: +clamp(lvl, 0, 1).toFixed(2), src: 'audio' }); }
  else if (!on && was) { delete S.pub[id]; FF.bus.emit('sound', { cue, id, stop: true, gain: 0, x: +pos.x.toFixed(2), src: 'audio' }); }
}

/* ---- the worker (FF.Painter): his phase, the strokes, the small sounds of his work */
function painterPhase() {
  const Pm = FF.Painter; let raw = null, hard = false, src = 'none';
  if (Pm && !Pm.stub && typeof Pm.debug === 'function') { try { const d = Pm.debug(); if (d) { raw = d.phase || d.seg || d.kind || d.state || null; hard = !!d.hard; src = 'debug'; } } catch (_) {} }
  if (raw == null && S.wk.fact) { raw = S.wk.fact; src = 'fact'; }
  return { raw: raw == null ? '' : String(raw), hard, src, present: !!Pm || !!S.wk.fact };
}
function classify(raw) {
  if (/hard|resume/.test(raw)) return 'scrape-hard';
  if (/scrap/.test(raw)) return 'scrape';
  if (/still/.test(raw)) return 'still';
  if (/stop/.test(raw)) return 'stop';
  if (/lift/.test(raw)) return 'lift';
  if (/hang/.test(raw)) return 'hang';
  if (/hold|look/.test(raw)) return 'hold';
  if (/lower/.test(raw)) return 'lower';
  if (/turn/.test(raw)) return 'turn';
  if (/reach|rag/.test(raw)) return 'reach';
  if (/dip/.test(raw)) return 'dip';
  return '';
}
function painterPos() {
  const f = X.figure('painter'); if (f && f.st && f.st.visible !== false && f.st.x != null) return { x: f.st.x, z: f.st.z != null ? f.st.z : PAINTER.z, visible: true };
  return { x: PAINTER.x, z: PAINTER.z, visible: !!(f && f.st && f.st.visible) };
}
function worker(now, L) {
  if (!PAINTER || L.x < 145.0 || L.x > 172.0) return;            // from beside the gate to just inside the long hall
  const ph = painterPhase(); if (!ph.present) return;
  const W = S.wk, pp = painterPos();
  let cls = classify(ph.raw);
  if (!cls) cls = 'scrape';                        // before his loop starts he is already at it (heard faintly from the culvert)
  if (cls !== W.cls) { onWorkerPhase(cls, W.cls, now, L, pp); W.cls = cls; W.since = now; W.raw = ph.raw; }
  W.src = ph.src;
  if (/hold|lift|lower|still/.test(cls)) W.look = true; else if (/scrape/.test(cls)) W.look = false;
  W.hard = cls === 'scrape-hard' || ph.hard;
  /* the strokes */
  if (/scrape/.test(cls) && !X.xp('wire-scrape')) {
    const hz = (FF.RULES.painter && (W.hard ? FF.RULES.painter.hardStrokeHz : FF.RULES.painter.strokeHz)) || 1.5;
    if (now >= W.next) {
      W.pull = !W.pull; W.n++;
      play('wire-scrape', P(pp.x + (W.pull ? -0.12 : 0.14), 1.15, (PAINTER.wallZ || -2.0) + 0.08), { pull: W.pull, hard: W.hard, id: 'painter' }, L, 'painter');
      W.next = now + (1 / hz) * rr(0.94, 1.06);
    }
  }
  /* his work lamp's faint mains hum */
  const lp = PAINTER.lamp && PAINTER.lamp.stand;
  if (lp && L.x > 148 && L.x < 172) X.hold('s2:worklamp', 'mains', P(lp[0], lp[1], lp[2]), 0.1);
}
function onWorkerPhase(cls, from, now, L, pp) {
  const W = S.wk, wz = PAINTER.wallZ || -2.0, lamp = PAINTER.lamp && PAINTER.lamp.stand ? P(...PAINTER.lamp.stand) : P(159.0, 1.5, -1.0);
  if (/scrape/.test(cls)) { W.next = now + (from === 'dip' || from === 'hang' || from === 'turn' ? 0.05 : 0.0); return; }
  if (cls === 'stop') play('tool-down', P(pp.x + 0.2, 0.35, wz + 0.1), { delay: 0.12 }, L, 'painter');
  else if (cls === 'turn') play('boot-turn', P(pp.x, 0.02, pp.z), {}, L, 'painter');
  else if (cls === 'reach') play('rag', P(158.0, 0.9, -0.6), { delay: 0.2 }, L, 'painter');
  else if (cls === 'dip') play('bucket-dip', P(161.4, 0.3, -0.9), {}, L, 'painter');
  else if (cls === 'lift') play('lamp-unhook', lamp, {}, L, 'painter');
  else if (cls === 'hang') play('lamp-hang', lamp, {}, L, 'painter');
}

/* ---- the rabbit in the Works: breath held in a pit while the press comes down, a heartbeat there and in his light */
const pitAt = r => { if (!r || r.y > -0.2) return null; for (const p of PITS) if (r.x >= p.core[0] - 0.05 && r.x <= p.core[1] + 0.05) return p; return null; };
function rabbit(now, r, L) {
  if (!r || r.mode !== 'play' || r.x < 127.2 || X.restLike(GG().place)) return;
  const R = S.rab, place = GG().place;
  let ctx = 0, held = false, heart = 0;
  const pit = pitAt(r), over = pit ? S.mem[pit.under] : null;
  if (over && /release|descent|down/.test(over.state)) { ctx = 0.9; held = true; heart = pit.under === 'Q3' ? 0.85 : over.state === 'release' ? 0.45 : 0.7; }
  else if (pit) ctx = now - R.afterRise < 4 ? 0.8 : 0.5;
  else if (place === 'culvert') ctx = 0.55;
  else if (place === 'passage' && S.wk.look) { ctx = 0.8; held = true; heart = 0.5; }
  else if (place === 'passage' && PALLET && r.x >= PALLET.core[0] && r.x <= PALLET.core[1]) ctx = 0.6;
  if (ctx > 0 && now >= R.breathNext && !S.black) {
    const hz = { calm: 1.0, alert: 1.6, afraid: 2.4, fleeing: 2.8, flee: 2.8, recovering: 1.6, recover: 1.6, settled: 0.6 }[r.mood || 'calm'] || 1.6;
    X.cue('rbreath', { x: r.x, y: r.y, z: 0 }, { rate: held ? Math.max(hz, 2.0) : hz, w: ctx * (held ? 0.3 : 1) }); R.breathNext = now + 1 / (held ? Math.max(hz, 2.0) : hz);
  }
  if (heart > 0 && now >= R.heartNext && !S.black) { X.cue('heart', null, { w: heart }); R.heartNext = now + 1 / lerp(1.3, 2.2, heart); }
}
function surface(r) {
  if (!r || r.x < 124.0) return null;
  const x = r.x;
  if (r.y < -0.2) return 'water';                      // the pits and the culvert
  if (x < 127.0) return 'grass';
  if (x < 131.0) return 'wet';                         // the slab and the far bank, in the rain
  if (x < 136.0) return 'concrete';                    // the dry intake
  if (x < 140.0) return 'wet';                         // the apron under the rain shafts
  if (x < 147.0) return 'steel';                       // the press bed
  if (x < 153.0) return 'wet';                         // the silt ramp
  if (x < 167.0) return 'concrete';                    // the dry passage
  if (x < 169.4) return 'wet';
  if (x < 189.0) { for (const g of GAPS) if (x >= g.x0 && x <= g.x1) return 'wet'; return 'steel'; }
  if (x < 194.6) return 'wet';
  return 'grass';
}
function land(d) { if (!d || d.x == null || d.x < 145.6 || d.x > 148.6 || !(d.y < -0.7)) return false; X.cue('splash', { x: d.x, y: d.y, z: 0 }); log('splash', 'culvert'); return true; }
/* closed in: in a pit with the press over it down (or nearly), the rain and the hall drop away */
function mix(o, G, x) {
  if (x < 140) return;
  const pit = pitAt(G.rabbit), s = pit ? S.mem[pit.under] : null;
  if (s && (s.state === 'down' || (s.state === 'descent' && s.u > 0.7))) { o.rain *= 0.3; o.rainLP = Math.min(o.rainLP, 650); o.hall *= 0.4; o.drips *= 0.4; o.wind *= 0.3; }
}

/* ---- the join: Sequence 1's far thud taken over from x 124.0 (JOIN_X: past the lean-to, so Sequence 1's rest is untouched) (louder towards the Works; from the slab on, the long hall's
   bar: a far clank, then three heavy steps), until the machines start */
const JOIN_X = 124.0;
function join(now, r, L) {
  const D = X.D, B = S.beat;
  if (worksStarted()) { if (D.thud && D.thud.on) D.thud.on = false; B.mine = false; return; }
  if (!r || !D.thud) return;
  if (L.x >= JOIN_X) {
    if (!B.mine) { B.mine = true; B.next = D.thud.on ? D.thud.next : now + 1.0; B.n = D.thud.n || 0; D.thud.on = false; }
    if (now >= B.next) {
      B.next = now - B.next > 1.0 ? now + 4.0 : B.next + 4.0; B.n++;              // on the 4 s grid, no drift
      const k = clamp((L.x - JOIN_X) / (133.9 - JOIN_X), 0, 1), bar = L.x >= 126.0, pos = { x: L.x + lerp(70, 30, k), y: lerp(14, 6, k), z: lerp(-55, -24, k) };
      if (bar && B.bar0 == null) B.bar0 = B.n;                                  // the first beat heard from the slab is the bar's clank
      if (!bar) B.bar0 = null;
      const inBar = bar ? (B.n - B.bar0) % 4 : -1;
      if (inBar === 0) { if (!S.black) { X.cue('press-clank', pos, { size: 0.9, gain: 0.55 + 0.6 * k, noPub: true }); log('press-clank', 'far', k); } }
      else { X.cue('thud', pos, { gain: 0.7 * (1 + 1.3 * k) * (inBar === 3 ? 1.3 : 1), id: 'works' }); log('thud', 'far', k); }
    }
  } else if (B.mine) { B.mine = false; D.thud.on = true; D.thud.next = B.next; D.thud.n = B.n; }
}
/* the warm pad of Sequence 1's rest (its optional pull-out) fades out over the slab: no music in the Works. While it fades
   this module holds the pad (Sequence 1's D.end.pad is cleared, so the two never fight over its level); walking back into
   the rest gives it back */
function padFade(now, L) {
  const D = X.D; if (!D.end) return;
  const restHere = X.restLike(GG().place);
  if (D.end.pad && !restHere && L.x >= 127.0) { D.end.pad = false; S.padFade = { off: -1 }; }
  if (!S.padFade) return;
  if (restHere && L.x < 127.0) { D.end.pad = true; S.padFade = null; return; }
  const k = clamp((130.0 - L.x) / 3.0, 0, 1), fade = 1 - clamp(GG().fade || 0, 0, 1);
  X.hold('pad', 'pad', null, 1.4 * k * fade, null, 'music');
  if (k <= 0) { if (S.padFade.off < 0) S.padFade.off = now + 4.0; if (now >= S.padFade.off) S.padFade = null; }
}

/* ---- the places: water, rain through the roof, gutters, draughts, a pipe ticking, drips along the outside pipe */
function places(now, L) {
  const x = L.x;
  if (x > 121 && x < 135) X.hold('s2:channel', 'water', P(128.3, -1.3, 0.3), 0.9, { f: 0.85, body: 0.12 }, 'amb');
  if (x > 124 && x < 141) { const pos = P(135.2, 0.3, -0.2); X.hold('s2:intake', 'draught', pos, 0.35, { f: 520, k: 1 }); publishLoop('s2:intake', 'draught', pos, x < 131 ? lvlAt(pos, L) : 0, now); }
  else if (S.pub['s2:intake']) publishLoop('s2:intake', 'draught', P(135.2, 0.3, -0.2), 0, now);
  if (x > 129 && x < 156) { X.hold('s2:shaftA', 'rainshaft', P(138.2, 0.1, -1.6), 0.12); X.hold('s2:gutterH', 'water', P(138.6, 3.4, -4.0), 0.7, { f: 0.55, body: 0.35 }, 'amb'); }
  if (x > 144 && x < 155) X.hold('s2:culvert', 'water', P(clamp(x + 1.0, 146.5, 152.5), -0.95, -0.2), 1.0, { f: 1.2, body: 0.05 }, 'amb');
  if (x > 150 && x < 168 && now >= S.pipeNext) { if (S.pipeNext > 0) play('pipe-tick', P(rr(154, 166), 2.6, -1.8), {}, L, 'pipe'); S.pipeNext = now + rr(2.5, 7.0); }
  if (x > 160 && x < 196) { for (const g of GAPS) X.hold('s2:shaft' + g.id, 'rainshaft', P((g.x0 + g.x1) / 2, 0.1, -1.2), 0.16); X.hold('s2:gutterL', 'water', P(191.2, 4.0, -4.0), 0.6, { f: 0.6, body: 0.3 }, 'amb'); }
  if (PIPE && x > 193 && x < 214 && now >= S.dripNext) { play('drip', P(rr(PIPE.x0, PIPE.x1), PIPE.y0, rr(0.2, 0.8)), { big: rnd() < 0.5, gain: 0.8 }, L, 'pipe'); S.dripNext = now + rr(0.25, 0.9); }
}

/* ================================================================== the module */
const A2 = FF.AudioS2 = {
  name: 's2', stub: false,
  get log() { return LOG; },
  install(x) {
    X = x;
    Object.assign(X.CUES, CUES2); Object.assign(X.CUE_OPT, OPT2); Object.assign(X.TRIM, TRIM2); Object.assign(X.SAL, SAL2);
    Object.assign(X.LOOPS, LOOPS2); Object.assign(X.BEDS, BEDS2); Object.assign(X.VERB, VERB2);
    /* paws on the steel bed: the base pats plus a faint dull ring */
    const paw = X.CUES.paw;
    X.CUES.paw = function (E, d, t, o) { const dur = paw(E, d, t, o); if (o && o.surface === 'steel') E.partials(d, t + 0.04, [[640, 0.07, 1], [1530, 0.04, 0.5]], 0.022 * (o.w || 0.6)); return dur; };
    X.failCue.machine = (FF.RULES.fail && FF.RULES.fail.machine && FF.RULES.fail.machine.sound) || 'contact-muffled';
    if (X.rest.indexOf('out') < 0) X.rest.push('out');
    X.walls.push(walls); X.mix.push(mix); X.surface.push(surface); X.land.push(land);
    if (!build()) return;                       // no Sequence 2 data: nothing else to do
    X.derive.push(derive);
    const on = (n, f) => FF.bus.on(n, f);
    on('works-start', () => { S.justStarted = true; S.startedFlag = true; });
    on('painter', d => { if (d && d.phase) S.wk.fact = String(d.phase); });
    on('fail', () => { S.black = true; });
    on('restart', d => { const cp = FF.Game && FF.Game.cp ? FF.Game.cp(d && d.cp) : null; reset(cp, d && d.reason); });
    on('mode', d => { if (d && d.to === 'title') { reset(null, 'title'); S.wk.fact = null; } });
  },
  debug() {
    const mem = {}; for (const m of MACH) { const s = S.mem[m.id]; if (s) mem[m.id] = s.state + (s.ph != null ? '@' + s.ph.toFixed(2) : ''); }
    const L = X ? X.listener() : null;
    return { started: worksStarted(), zone: L ? zoneOf(L.x, L.y) : null, presses: mem, gap: +S.gap.toFixed(3), beat: { mine: S.beat.mine, n: S.beat.n },
      painter: { cls: S.wk.cls, raw: S.wk.raw, src: S.wk.src, strokes: S.wk.n, look: S.wk.look }, black: S.black, pub: Object.keys(S.pub), last: LOG.slice(-6).map(e => e.t + ' ' + e.cue + (e.id ? ':' + e.id : '')) };
  },
};
function derive(now, r) {
  const L = X.listener();
  if (S.black && !X.D.black) S.black = false;
  if (L.x > 116.0 && X.prepare) for (const k in VERB2) if (X.prepare(k)) break;      // the Works' rooms, ahead of need
  join(now, r, L);
  padFade(now, L);
  if (L.x < 113.5 && !worksStarted()) { S.justStarted = false; return; }   // Sequence 1 ground, nothing of the Works running yet
  machines(now, r, L);
  sluiceAndPits(now, L);
  worker(now, L);
  rabbit(now, r, L);
  places(now, L);
  S.justStarted = false;
}
(FF.AUDIO_EXT = FF.AUDIO_EXT || []).push(A2);
})();
