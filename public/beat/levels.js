/* BEET BEAT — levels.js (LEVELS). The level data and its format. Loaded first; no other file needed (sim.js reads the shared
   constants below). An original one-button rhythm runner for understand-veganism.com's planet; every level is our own.

   LEVEL  { id, name, diff:'easy'|'normal'|'hard', world:'meadows'|'skyway'|'works', bpm, intro (bars of run-up), bars (bars of
            play after the intro), startSpeed (index into BEAT.SPEEDS), len (blocks: the finish line, where the music ends),
            track (an audio.js song name; main.js falls back to a song of the same tempo, else runs on its own clock),
            placeholder (true: a stand-in level, marked so on the title's level card),
            objects:[[type, x, y, a, b] ...] sorted by x, seeds:[[x,y] x3] (golden seeds: the CENTRE of each, in blocks),
            deco:[[kind, x, y] ...] (scenery only, drawn hazed behind the play layer: 'fence' 'sunflower' 'bush' 'tree' 'cloud'
            'lantern' 'chimney' 'balloon' 'kite'; 'cog' is an old name for 'lantern'), presses:[beat ...] (the designer's intended taps, on the beat), holds:[[fromBeat, toBeat]
            ...] (intended holding, for GLIDE stretches). The designed run (presses + holds, pressed exactly on time) must finish:
            the tests check it, the safe checkpoints of the two-player kind rule are taken from it, and the bot plays it. }
   UNITS  1 block = 1 grid unit (drawn 40 px at 720p). x grows to the right, y = 0 is the top of the floor, y grows upwards.
          The runner is a 1 x 1 block; its x is its CENTRE, its y its BOTTOM. At beat b it is at x = bx(b) (the run starts at x = 0
          on beat 0, the first beat of the music; the intro bars are empty run-up). Speed portals change blocks-per-beat from
          their beat on; bx() knows about the ones placed with speed().
   TYPES  (x, y = the object's lower-left corner, in blocks)
     'thorn'   a big bramble thorn, 1 wide, about 1 tall (its hurt box is smaller than its art). a: 1 = hangs point-down from y+1.
     'thornS'  a small thorn, half as tall (a: 1 = hangs).
     'crate'   a solid wooden crate: a = width (default 1), b = height (default 1). Safe to stand on (or under, upside down); its
               sides crash you (in GLIDE and FLIP the far side just stops you; in HOP a bump from below crashes).
     'planter' a solid terracotta planter with sprouts on top: a = width, b = height (default 1).
     'slab'    a solid half-height plank: a = width (default 1); 0.5 tall.
     'capY'    a yellow spring cap (a mushroom-cap jump pad, 0.4 tall): a small bounce (about 3.2 blocks). a: 1 = hangs from a ceiling.
     'capP'    a pink spring cap: a big bounce (about 5.2 blocks). a: 1 = hangs.
     'capB'    a blue spring cap: flips gravity (you fall to the ceiling / floor). a: 1 = hangs. Only inside a corridor.
     'ringY'   a yellow puff ring (a dandelion clock in the air): tap while touching it for a normal hop from mid-air.
     'ringP'   a pink puff ring: tap while touching it for a big hop.
     'ringB'   a blue puff ring: tap while touching it to flip gravity. Only inside a corridor.
     'portal'  a flower arch, about 3 tall; a full-height gate (you take it when your centre passes x, at any height):
               a = 'hop' | 'glide' | 'flip' (the mode; b = the corridor's ceiling height: default 9 for glide and flip, none for
               hop), 'gup' | 'gdown' (gravity up / down), 's0' | 's1' | 's2' | 's3' (speed: slow 8.4, normal 10.4, fast 12.9,
               faster 15.6 blocks a second). A corridor (a ceiling, drawn as a leafy canopy) lasts until the next mode portal.
   MODES  HOP: a press on a surface jumps 2.1 blocks (0.44 s); hold = hop again on landing. GLIDE (a sycamore-seed spinner): hold
          to rise, let go to sink, the floor and the ceiling are safe. FLIP (a rolling seed pod): a tap on a surface flips gravity.
   DESIGN Write each level on its beat grid with the helpers in make(): bx(beat) is where the runner is on that beat, and the
          pattern helpers place things so the press (or the landing) falls on the beat. glideY(beat) is the height of the designed
          GLIDE path (from the holds so far), so pillars and hanging thorns can be put around it. BEAT.Sim.validate(level) lists
          problems; BEAT.Sim.solve(level, {windows:true}) proves a level can be finished and reports the tightest timing window.
          The designer's kit below make() adds GLIDE gates around the designed path, crates by beat and scenery placement.
          Run node beat/test/logic.mjs and node beat/test/levels.mjs (the level checks: solver, margins around every designed
          input, golden seeds, a human-like bot with timing noise) after any edit.
   LEVELS 1. PATCHWORK PULSE (easy, 110 bpm, meadows), 2. CANDYFLOSS CLIMB (normal, 124 bpm, skyway), 3. CLATTER CRUNCH (hard,
          138 bpm, works); each 2 bars of run-up + 36 / 40 / 44 bars, the length of its song (track 'patchwork' / 'candyfloss' /
          'clatter'). */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, BEAT = G.BEAT = G.BEAT || {};
/* shared physics constants (sim.js uses these; change them here only) */
BEAT.SPEEDS = [8.4, 10.4, 12.9, 15.6];          /* blocks per second: slow, normal, fast, faster */
BEAT.JUMP = { h: 2.1, t: 0.44 };                 /* a hop: 2.1 blocks high, 0.44 s in the air (so a quarter turn takes 0.44 s) */
BEAT.GLIDE = { up: 44, down: 38, max: 8.4 };     /* GLIDE: climb / sink acceleration (blocks/s²), top climb or sink speed */
BEAT.FLIP = { grav: 72, v: 4, max: 22 };         /* FLIP: its gravity, the push off a surface, its top speed */
BEAT.DECO_P = 0.5;                               /* a level's scenery (deco) scrolls at this share of the play layer (render.js) */

const r2 = n => Math.round(n * 100) / 100;
function make(meta, script) {
  const spb = 60 / meta.bpm, v0 = BEAT.SPEEDS[meta.startSpeed], chg = [];   /* chg: [beat, speed] from speed() */
  const vAt = b => { let v = v0; for (const c of chg) if (c[0] < b) v = BEAT.SPEEDS[c[1]]; else break; return v; };
  const bx = b => { let x = 0, b0 = 0, v = v0; for (const c of chg) { if (c[0] >= b) break; x += (c[0] - b0) * spb * v; b0 = c[0]; v = BEAT.SPEEDS[c[1]]; } return x + (b - b0) * spb * v; };
  const AXb = b => vAt(b) * BEAT.JUMP.t / 2;      /* from a press to the top of the hop, in blocks */
  const AX = AXb(0);
  const objs = [], beats = [], holds = [], seeds = [], deco = [], glides = [], gravs = [];   /* gravs: [beat, 1 | -1] from grav() */
  const press = (...bs) => { for (const b of bs) beats.push(b); }, add = (t, x, y, a, b) => { const o = [t, r2(x), r2(y || 0)]; if (a != null || b != null) o.push(a == null ? 1 : a); if (b != null) o.push(b); objs.push(o); };
  const H = {
    bx, AX, AXb, vAt, spb, add, press,
    /* n thorns side by side, centred under the top of a hop pressed on beat b (from a surface at height y) */
    thorns(b, n, y, small) { press(b); const x0 = bx(b) + AXb(b) - n / 2; for (let i = 0; i < n; i++) add(small ? 'thornS' : 'thorn', x0 + i, y || 0); },
    /* the same, hanging from a ceiling at height top (for a runner upside down on it) */
    thornsDown(b, n, top, small) { press(b); const x0 = bx(b) + AXb(b) - n / 2; for (let i = 0; i < n; i++) add(small ? 'thornS' : 'thorn', x0 + i, top - 1, 1); },
    /* a row of thorns between two x positions (a thorn bed), on the floor or a surface; down: hanging from a ceiling at y + 1 */
    bed(x0, x1, y, small, down) { for (let x = x0; x <= x1 - 1 + 1e-6; x += 1) add(small ? 'thornS' : 'thorn', x, y || 0, down ? 1 : undefined); },
    /* a staircase of crates (or planters) pressed on beats bs[k], tops at hs[k]; each step runs on to the next one's edge,
       the last one is lastW wide. A step's left edge is 2.1 blocks past the press: the hop clears its side, lands on it. */
    stair(bs, hs, lastW, kind) { press(...bs); bs.forEach((b, k) => { const x = bx(b) + 2.1, w = k < bs.length - 1 ? bx(bs[k + 1]) + 2.1 - x : lastW; add(kind || 'crate', x, 0, r2(w), hs[k]); }); },
    /* a spring cap reached exactly on beat b, on a surface at height y (kind 'B' = blue; hang: under a ceiling at height y) */
    cap(b, pink, y, kind, hang) { const t = kind === 'B' ? 'capB' : pink ? 'capP' : 'capY'; if (hang) add(t, bx(b) + 0.4, (y || 0) - 0.4, 1); else add(t, bx(b) + 0.4, y || 0); },
    /* a puff ring centred where the runner is on beat b, at height y (its lower edge); kind 'B' = blue */
    ring(b, y, pink, kind) { press(b); add(kind === 'B' ? 'ringB' : pink ? 'ringP' : 'ringY', bx(b) - 0.5, y); },
    /* portals on beat b: a mode (with an optional ceiling), gravity, speed */
    mode(b, m, ceil, y) { add('portal', bx(b), y || 0, m, ceil); if (m === 'glide') glides.push([b, ceil || 9]); },
    grav(b, up, y) { add('portal', bx(b), y || 0, up ? 'gup' : 'gdown'); gravs.push([b, up ? -1 : 1]); },
    speed(b, s, y) { add('portal', bx(b), y || 0, 's' + s); chg.push([b, s]); chg.sort((p, q) => p[0] - q[0]); },
    /* GLIDE: hold from beat b0 to b1; glideY(b): the height of the designed path at beat b (entering at the last glide portal
       before b, from y0 = its height there, by default the floor), following gravity portals (grav()) inside the stretch:
       gravity up, holding pushes down (the sim's rule: half the speed is kept at the portal) */
    hold(b0, b1) { holds.push([b0, b1]); },
    glideY(b, y0) {
      const gl = glides.filter(g => g[0] <= b).pop(); if (!gl) return 0;
      const DT = 1 / 240, GL = BEAT.GLIDE, top = gl[1] - 1, n0 = Math.round(gl[0] * spb * 240), n1 = Math.round(b * spb * 240);
      const gf = gravs.map(g => [Math.round(g[0] * spb * 240), g[1]]).filter(g => g[0] <= n1).sort((p, q) => p[0] - q[0]);
      let y = y0 || 0, vy = 0, gr = 1; for (const g of gf) if (g[0] <= n0) gr = g[1];   /* the gravity the stretch starts with */
      for (let n = n0 + 1; n <= n1; n++) { const on = holds.some(h => n >= Math.round(h[0] * spb * 240) && n < Math.round(h[1] * spb * 240));
        vy += (on ? GL.up : -GL.down) * gr * DT; vy = Math.max(-GL.max, Math.min(GL.max, vy)); y += vy * DT; if (y < 0) { y = 0; if (vy < 0) vy = 0; } if (y > top) { y = top; if (vy > 0) vy = 0; }
        for (const g of gf) if (g[0] === n && g[1] !== gr) { gr = g[1]; vy *= 0.5; } }
      return y;
    },
    seed(x, y) { seeds.push([r2(x), r2(y)]); },
    deco(kind, x, y) { deco.push([kind, r2(x), r2(y || 0)]); }
  };
  script(H);
  objs.sort((p, q) => p[1] - q[1] || p[2] - q[2]);
  beats.sort((p, q) => p - q); holds.sort((p, q) => p[0] - q[0]);
  const lv = Object.assign({ seeds: [], deco: [] }, meta, { objects: objs, presses: beats, len: r2(bx((meta.intro + meta.bars) * 4)) });
  if (holds.length) lv.holds = holds;
  if (seeds.length) lv.seeds = seeds;
  if (deco.length) lv.deco = deco;
  return lv;
}
BEAT.makeLevel = make;

/* ---------- the level designer's kit: a few more helpers on top of make()'s (all positions from the beat grid) ----------
   crate(b, w, h, dx, y)  a crate whose left edge is dx blocks past where the runner is on beat b (w, h whole blocks: crates
                          are drawn as tiles), on a surface at height y (default the floor).
   hang(b, w, h, top, dx) a crate column hanging from a ceiling at height top, h tall.
   path(b0, b1)           the designed GLIDE path's lowest and highest y between beats b0 and b1 (sampled every 1/32 beat).
   gate(b, w, clear, top) a GLIDE gate: a crate column from the floor and one hanging from the ceiling (top), with a gap of
                          `clear` blocks above and below the designed path (the runner is 1 tall) over the gate's width;
                          a column under 1 block tall is left out. Returns [floorTop, gapTop].
   floorCol(b, w, clear) / ceilCol(b, w, clear, top)  only the lower / upper half of a gate.
   glide(b, ceil) / hold(b0, b1) / grav(b, up)  make()'s mode / hold / grav, also noted here for path() (written before
                          make()'s glideY followed gravity portals too; kept as it is, so the levels stay exactly the same).
   scene(kind, b, y)      scenery behind where the runner is on beat b (deco scrolls at BEAT.DECO_P = 0.5 of the play layer, hazed:
                          well behind the play, so nothing back there reads as a thorn or a ledge). */
function kit(H) {
  const { bx, add, glideY } = H;
  const r2 = n => Math.round(n * 100) / 100;
  /* a GLIDE path that also knows about gravity portals: used when the glide stretch is written with K.glide / K.hold / K.grav */
  const gl = [], hl = [], gv = [];
  const gyAt = b => {
    const g0 = gl.filter(g => g[0] <= b).pop(); if (!g0) return null;
    const DT = 1 / 240, GL = BEAT.GLIDE, n0 = Math.round(g0[0] * H.spb * 240), n1 = Math.round(b * H.spb * 240), top = g0[1] - 1;
    let y = 0, vy = 0, gr = 1;
    for (let n = n0 + 1; n <= n1; n++) {
      const on = hl.some(h => n >= Math.round(h[0] * H.spb * 240) && n < Math.round(h[1] * H.spb * 240));
      vy += (on ? GL.up : -GL.down) * gr * DT; vy = Math.max(-GL.max, Math.min(GL.max, vy)); y += vy * DT;
      if (y <= 0) { y = 0; if (vy < 0) vy = 0; } if (y >= top) { y = top; if (vy > 0) vy = 0; }
      for (const g of gv) if (Math.round(g[0] * H.spb * 240) === n && g[1] !== gr) { gr = g[1]; vy *= 0.5; }
    }
    return y;
  };
  const yAt = (b, y0) => gl.length ? gyAt(b) : glideY(b, y0);
  const path = (b0, b1, y0) => { let lo = 1e9, hi = -1e9; for (let b = b0; b <= b1 + 1e-9; b += 1 / 32) { const y = yAt(b, y0); if (y < lo) lo = y; if (y > hi) hi = y; } return [lo, hi]; };
  const bAt = x => { let lo = -8, hi = 400; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (bx(m) < x) lo = m; else hi = m; } return (lo + hi) / 2; };
  const K = {
    bAt, path, yAt,
    glide(b, ceil) { gl.push([b, ceil]); H.mode(b, 'glide', ceil); },
    hold(b0, b1) { hl.push([b0, b1]); H.hold(b0, b1); },
    grav(b, up, y) { gv.push([b, up ? -1 : 1]); H.grav(b, up, y); },
    /* scenery (deco) that shows up behind where the runner is on beat b (deco parallax P: x = P * bx(b) + 1.5) */
    scene(kind, b, y) { H.deco(kind, BEAT.DECO_P * bx(b) + 1.5, y); },
    crate(b, w, h, dx, y) { add('crate', bx(b) + (dx || 0), y || 0, w || 1, h || 1); },
    hang(b, w, h, top, dx) { add('crate', bx(b) + (dx || 0), top - h, w || 1, h); },
    floorCol(b, w, clear, y0) { const x = bx(b), [lo] = path(bAt(x - 0.6), bAt(x + w + 0.6), y0), h = Math.floor(lo - clear + 1e-6); if (h >= 1) add('crate', x, 0, w, h); return h; },
    ceilCol(b, w, clear, top, y0) { const x = bx(b), [, hi] = path(bAt(x - 0.6), bAt(x + w + 0.6), y0), bot = Math.ceil(hi + 1 + clear - 1e-6), h = top - bot; if (h >= 1) add('crate', x, bot, w, h); return bot; },
    gate(b, w, clear, top, y0) { return [K.floorCol(b, w, clear, y0), K.ceilCol(b, w, clear, top, y0)]; }
  };
  return K;
}

/* ===================== 1. PATCHWORK PULSE: easy, 110 bpm, 2 bars intro + 36 bars (82.9 s), the meadows =====================
   Laid on the song's sections (audio.js): VERSE 1 (bars 3-10) thorns and crates; DROP 1 (11-18) spring caps, then puff rings;
   BREAK (19-22) the one short, gentle GLIDE; VERSE 2 (23-30) planks, caps and rings; DROP 2 (31-38) the finale, its last two
   bars a climb up three planters and a pink-cap leap over the last thorns to the finish (beat 152, on the song's home chord).
   Teach, then test, with a rest after each idea. Every press is on a beat or a half beat ("P48.5" = press on beat 48.5). At this
   tempo a hop lasts 0.81 of a beat and a yellow cap's bounce one beat. Puff rings sit just ahead of and below the hop's path, so
   a tap on the beat is in the middle of the ring's window (about +-150 ms); their beds are small thorns. Golden seeds: a hop from
   the top step (P30), above the free puff ring (tap it on 56.5), low in the GLIDE (hold again early, about 81.5, to float up to
   it). Scenery only in the sky, the run-up and the run-out, so nothing stands behind a thorn. */
const PATCHWORK = make({ id: 'patchwork', name: 'PATCHWORK PULSE', diff: 'easy', world: 'meadows', bpm: 110, intro: 2, bars: 36, startSpeed: 1, track: 'patchwork' }, H => {
  const { bx, add, press, thorns, bed, stair, cap, mode, hold, seed } = H, K = kit(H);
  const r2 = n => Math.round(n * 100) / 100;
  /* a hop on b - 0.5 and a tap on the puff ring on b, over a bed of small thorns */
  const ringHop = (b, pink, end) => { press(b - 0.5, b); add(pink ? 'ringP' : 'ringY', bx(b) + 0.1, 1.2); bed(bx(b - 0.5) + 1.8, bx(b - 0.5) + (end || 7.3), 0, true); };
  /* VERSE 1, bars 3-10 (HOP only). Bars 3-4: hello, thorns: two small ones P8 P10, two big ones P12 P14 */
  thorns(8, 1, 0, true); thorns(10, 1, 0, true); thorns(12, 1); thorns(14, 1);
  /* bars 5-6: three on consecutive beats P16 P17 P18, then P20 P22 */
  thorns(16, 1); thorns(17, 1); thorns(18, 1); thorns(20, 1, 0, true); thorns(22, 1);
  /* bars 7-8: up on a crate P24, a small thorn on it P26, step off; two steps up P28 P29, along the top, step off */
  stair([24], [1], 15); thorns(26, 1, 1, true);
  stair([28, 29], [1, 2], Math.round(bx(31) - bx(29) - 2.1));
  seed(bx(30) + 2.3, 4.5);   /* golden seed 1: an extra hop from the top step on 30 */
  /* bars 9-10: singles P32 P33, the first (small) double P35, a single P38 */
  thorns(32, 1); thorns(33, 1); thorns(35, 2, 0, true); thorns(38, 1);
  /* DROP 1, bars 11-18. Bars 11-12: a yellow spring cap on 40 with nothing to clear (feel the bounce), a single P42; a cap on 44
     over three thorns, a single P46 */
  cap(40); thorns(42, 1); cap(44); bed(bx(44) + 1.6, bx(44) + 4.6); thorns(46, 1);
  /* bars 13-14: the pink cap on 48 throws you up onto a planter terrace; a thorn up there P50; drop off; a small single P53 */
  cap(48, true); add('planter', bx(48) + 2.5, 0, Math.round(bx(50) + 6 - bx(48) - 2.5), 3); thorns(50, 1, 3); thorns(53, 1, 0, true);
  /* bars 15-18: puff rings. P56 over a small thorn with a free ring on 56.5 (tap it for a higher hop, or don't); then P59.5 + the
     ring on 60 over a bed, a single P62; P63.5 + 64, a small double P66; a pink one P67.5 + 68 over a longer bed */
  thorns(56, 1, 0, true); add('ringY', bx(56.5) + 0.1, 1.2);
  seed(bx(56.9) + 0.6, 4.4);   /* golden seed 2: tap the free ring */
  ringHop(60); thorns(62, 1); ringHop(64); thorns(66, 2, 0, true); ringHop(68, true, 8.3);
  /* BREAK, bars 19-22: GLIDE in a corridor 7 high. Slide along the floor under a hanging column; hold 74-76 up to the canopy over
     a low wall; let go on 76 and slide under the next; hold 78.5-80.5 over another; two short holds (82.5, 85) over two more
     walls; down to the floor for the HOP arch on 88 */
  mode(72, 'glide', 7);
  hold(74, 76); hold(78.5, 80.5); hold(82.5, 83.5); hold(85, 86);
  K.ceilCol(73, 2, 2, 7); K.floorCol(75.75, 2, 2); K.ceilCol(78, 2, 2, 7); K.floorCol(80.25, 2, 2);
  K.floorCol(83.75, 1, 1.2); K.floorCol(86.25, 1, 1.2);
  seed(bx(82.3), 3.6);   /* golden seed 3: low over the floor stretch: hold again early (about 81.5) to float up to it */
  mode(88, 'hop');
  /* VERSE 2, bars 23-30. Bars 23-24: back on your feet: singles P90 P92, a small double P94 */
  thorns(90, 1); thorns(92, 1); thorns(94, 2, 0, true);
  /* bars 25-26: stepping planks over small thorns P96 P97 P98, off the end; singles P101 P102 */
  press(96, 97, 98);
  const pl = (b0, b1, y) => add('slab', bx(b0) + 2.2, y, r2(bx(b1) + 1 - bx(b0) - 2.2));
  pl(96, 97, 0.5); pl(97, 98, 1); add('slab', bx(98) + 2.2, 1.5, 4);
  bed(bx(96) + 1.3, bx(98) + 5.7, 0, true); thorns(101, 1); thorns(102, 1);
  /* bars 27-30: two rings in a row P105.5 + 106, P107.5 + 108; a single P110; P111.5 + 112; a single P114; a yellow cap on 116
     over a bed, a small double P118 */
  ringHop(106); ringHop(108); thorns(110, 1); ringHop(112); thorns(114, 1); cap(116); bed(bx(116) + 1.6, bx(116) + 4.6); thorns(118, 2, 0, true);
  /* DROP 2, bars 31-38: the finale. Planter steps P120 P121, hop off the top P122 and tap the pink ring on 122.5; a small double
     P125, a single P127; a yellow cap on 128 over a bed, a single P130; the pink cap on 132 up a terrace, a thorn on it P134 */
  stair([120, 121], [1, 2], r2(bx(122) + 1 - bx(121) - 2.1), 'planter'); press(122, 122.5); add('ringP', bx(122.5), 3.4); bed(bx(122) + 1.6, bx(122.5) + 5.6);
  thorns(125, 2, 0, true); thorns(127, 1);
  cap(128); bed(bx(128) + 1.6, bx(128) + 4.6); thorns(130, 1);
  cap(132, true); add('planter', bx(132) + 2.5, 0, Math.round(bx(134) + 6 - bx(132) - 2.5), 3); thorns(134, 1, 3);
  /* four singles on the beat P136-P139, a yellow cap on 140 over a bed, a small double P142; bars 37-38, the climb to the finish:
     planter steps P144 P145 P146, along the top, and the pink cap on 148 up there throws you over the last thorns to the arch */
  thorns(136, 1); thorns(137, 1); thorns(138, 1); thorns(139, 1); cap(140); bed(bx(140) + 1.6, bx(140) + 4.6); thorns(142, 2, 0, true);
  stair([144, 145, 146], [1, 2, 3], r2(bx(148) + 1.6 - bx(146) - 2.1), 'planter'); cap(148, true, 3); bed(bx(148) + 2, bx(149.2), 0, true);
  /* scenery: a fence and sunflowers in the run-up and at the finish, clouds and kites high above the play */
  K.scene('fence', 0.5); K.scene('sunflower', 2.5); K.scene('fence', 4); K.scene('sunflower', 6);
  for (const b of [12, 34, 58, 92, 110, 128]) K.scene('cloud', b, 9.5 + (b % 3) * 0.4);
  for (const b of [24, 46, 100, 124]) K.scene('kite', b, 8.6);
  K.scene('sunflower', 151); K.scene('sunflower', 152.5); K.scene('fence', 154); K.scene('sunflower', 155.5);
});

/* ===================== 2. CANDYFLOSS CLIMB: normal, 124 bpm, 2 bars intro + 40 bars (81.3 s), the skyway =====================
   On the song's sections: VERSE (bars 3-10) hops, a climb up four planters, spring caps; DROP 1 (11-18) puff rings, a cap that
   throws you through a ring, a terrace, another climb; FLOAT (19-24) GLIDE through the cloud gaps (gaps 0.9 of a block above and
   below the designed path, more over the floor stretches); FLIP (25-32) two FLIP stretches (a corridor 7 high, then 6), the second
   ending on bar 32's build; DROP 2 (33-40) the speed-up portal on beat 128 and a fast climb to a high terrace; FINALE (41-42) a
   last climb and a pink-cap leap to the finish (beat 168). At this tempo a hop lasts 0.91 of a beat, so presses on flat ground
   are at least 1.5 beats apart (stairs going up can be a beat apart). Golden seeds: in the GLIDE (start the long hold a touch
   LATE, about 40 - 230 ms after beat 88 (88.1 - 88.45): on the beat it is missed, later than ~88.5 crashes at 90.3), on the canopy in the first FLIP
   stretch (stay up a little longer: flip down about half a beat late, 100.1 - 100.7, not on 100 and not as late as 101), and
   above the high terrace (an extra hop on 146). */
const CANDYFLOSS = make({ id: 'candyfloss', name: 'CANDYFLOSS CLIMB', diff: 'normal', world: 'skyway', bpm: 124, intro: 2, bars: 40, startSpeed: 1, track: 'candyfloss' }, H => {
  const { bx, add, press, thorns, bed, stair, cap, mode, speed, hold, seed } = H, K = kit(H);
  const r2 = n => Math.round(n * 100) / 100;
  const ringHop = (b, pink, end, small) => { press(b - 0.5, b); add(pink ? 'ringP' : 'ringY', bx(b) + 0.1, 1.2); bed(bx(b - 0.5) + 1.8, bx(b - 0.5) + (end || 7.3), 0, small); };
  /* FLIP: taps on beats bs from the floor (up, down, up ...) in a corridor top high; the surface you leave on each tap gets a bed
     from d0 blocks after the tap to d1 blocks after the next one (where you are not). d0 about 2 blocks at normal speed (2.4 - 2.5
     fast): a flip ~100 ms late still clears the bed's first thorn, so the window sits on the beat, not before it */
  const flips = (bs, top, d0, d1, small) => { press(...bs); for (let k = 0; k < bs.length - 1; k++) { const x0 = bx(bs[k]) + d0, x1 = bx(bs[k + 1]) + d1; if (x1 - x0 >= 1) bed(x0, x1, k % 2 ? top - 1 : 0, small, k % 2 === 1); } };
  /* VERSE, bars 3-10. Bars 3-6: singles P8 P10, small doubles P11.5 P13, doubles P15 P16.5, a single P18, a double P19.5, a small double P21 */
  thorns(8, 1); thorns(10, 1); thorns(11.5, 2, 0, true); thorns(13, 2, 0, true); thorns(15, 2);
  thorns(16.5, 2); thorns(18, 1); thorns(19.5, 2); thorns(21, 2, 0, true);
  /* bars 7-8: the climb: planters P24 P25 P26, a thorn on the top P28, one more step P29.5, step off */
  stair([24, 25, 26, 29.5], [1, 2, 3, 4], Math.round(bx(31.5) - bx(29.5) - 2.1), 'planter'); thorns(28, 1, 3);
  /* bars 9-10: a yellow cap on 32.5 over a bed, a double P35; the pink cap on 36 up a terrace, a thorn on it P38 */
  cap(32.5); bed(bx(32.5) + 1.6, bx(32.5) + 4.6); thorns(35, 2);
  cap(36, true); add('planter', bx(36) + 2.5, 0, Math.round(bx(38) + 4.8 - bx(36) - 2.5), 4); thorns(38, 1, 4);
  /* DROP 1, bars 11-18: P41.5 + ring 42, a double P44, P45.5 + pink ring 46; a cap on 48 throws you through a ring (tap it on
     48.5) over a long bed; a double P51.5, a small double P53; the pink cap on 56 up a terrace, a thorn on it P58; P61.5 + ring 62;
     the second climb P64 P65 P66, a thorn on top P68, step off */
  ringHop(42); thorns(44, 2); ringHop(46, true, 8.3);
  cap(48); press(48.5); add('ringY', bx(48.5) + 0.1, 2.6); bed(bx(48) + 1.6, bx(48) + 8);
  thorns(51.5, 2); thorns(53, 2, 0, true);
  cap(56, true); add('planter', bx(56) + 2.5, 0, Math.round(bx(58) + 4.8 - bx(56) - 2.5), 4); thorns(58, 1, 4);
  ringHop(62);
  stair([64, 65, 66], [1, 2, 3], Math.round(bx(69) - bx(66) - 2.1), 'planter'); thorns(68, 1, 3);
  /* FLOAT, bars 19-24: GLIDE through the cloud gaps (a corridor 9 high): under a hanging column, up over a wall on a long hold,
     four waves through gaps (each from the floor), a ride along the canopy over a tall wall, down under the last column */
  mode(72, 'glide', 9);
  hold(74, 75.5); hold(78, 79.5); hold(82, 82.5); hold(85, 86); hold(88, 91);
  const C = 0.9, CL = 1.4;
  K.ceilCol(73, 2, CL, 9); K.gate(75.8, 1, C, 9); K.ceilCol(77.85, 1, CL, 9); K.gate(79.9, 1, C, 9); K.ceilCol(81.75, 1, CL, 9);
  K.gate(82.85, 1, C, 9); K.ceilCol(84.6, 2, CL, 9); K.gate(86.45, 1, C, 9); K.ceilCol(87.85, 1, CL, 9); K.floorCol(90.4, 3, C); K.ceilCol(93.4, 2, CL, 9);
  seed(bx(89.6), 4.5);   /* golden seed 1: start the long hold on 88 a touch LATE (about 40 - 230 ms after the beat) */
  mode(94, 'hop');
  /* FLIP, bars 25-32: a corridor 7 high: two free flips P98 P100, then thorn beds where you are not: P102 P103.5 P105 P106 P107
     P108.5 P110 P111 P112 P113.5 P115 P116; the corridor drops to 6: P119 P120 P121.5 P122.5 P123.5 P125 (bar 32's build) */
  mode(96, 'flip', 7);
  flips([98, 100], 7, 99, 0); seed(bx(100.6), 5.5);   /* golden seed 2: stay up there a little longer (flip down at about 100.1 - 100.7) */
  flips([102, 103.5, 105, 106, 107, 108.5, 110, 111, 112, 113.5, 115, 116], 7, 2, 2.6);
  mode(118, 'flip', 6);
  flips([119, 120, 121.5, 122.5, 123.5, 125], 6, 2, 2.4);
  mode(126.5, 'hop');
  /* DROP 2, bars 33-40: the speed-up portal on 128; doubles P129.5 P131, P132.5 + ring 133; the fast climb P136 P137 P138, a thorn
     on top P140, a step up P141.5, the pink cap on 143 up to a terrace 6 high, a thorn up there P145; P148.5 + ring 149,
     P150.5 + pink ring 151, a double P153, a single P154.5, a small triple P156, a single P158 */
  speed(128, 2); thorns(129.5, 2); thorns(131, 2); ringHop(133);
  stair([136, 137, 138, 141.5], [1, 2, 3, 4], Math.round(bx(143) + 1.6 - bx(141.5) - 2.1), 'planter'); thorns(140, 1, 3);
  cap(143, true, 4); add('planter', bx(143) + 2.5, 0, Math.round(bx(147) - bx(143) - 2.5), 6); thorns(145, 1, 6);
  seed(bx(146) + 2.9, 8.6);   /* golden seed 3: an extra hop on the high terrace on 146 */
  ringHop(149); ringHop(151, true, 8.3); thorns(153, 2); thorns(154.5, 1); thorns(156, 3, 0, true); thorns(158, 1);
  /* FINALE, bars 41-42: planters P160 P161 P162, along the top, and the pink cap on 164 throws you over the last thorns to the arch */
  stair([160, 161, 162], [1, 2, 3], r2(bx(164) + 1.6 - bx(162) - 2.1), 'planter'); cap(164, true, 3); bed(bx(164) + 2, bx(165.2));
  /* scenery: balloons and kites high over the open stretches (none over the corridors: the canopy covers the sky there) */
  K.scene('balloon', 1, 6); K.scene('kite', 5, 7.5);
  for (const b of [14, 30, 46, 62, 130, 146]) K.scene('balloon', b, 9 + (b % 4) * 0.5);
  for (const b of [22, 38, 54, 138, 154]) K.scene('kite', b, 9.5);
  for (const b of [10, 34, 58, 134, 158]) K.scene('cloud', b, 11);
  K.scene('balloon', 169, 5); K.scene('kite', 171, 7);
});

/* ===================== 3. CLATTER CRUNCH: hard, 138 bpm, 2 bars intro + 44 bars (80.0 s), the works =====================
   On the song's sections: VERSE 1 (bars 3-10) doubles and steps at normal speed, then fast: a cap through a ring, rings, a small
   triple; DROP 1 (11-18) a corridor with gravity flips: upside-down hops under hanging thorns, blue caps that drop you, blue rings
   that lift you; BREAK 1 (19-22) a fast GLIDE with tight gaps (0.8 of a block) and a stretch with gravity up (hold to sink);
   VERSE 2 (23-30) a fast FLIP stretch, then a slow stretch with awkward doubles; DROP 2 (31-38) the faster HOP, a pink-cap
   terrace, then FLIP again; BUILD (39-42) the hard run-in at the faster speed; FINAL DROP (43-46) the big climb: three steps, a
   pink-cap leap over a long bed, a last ring and the finish (beat 184). At this tempo a hop lasts a whole beat, so presses on
   flat ground are at least 1.5 beats apart; steps are 1.5 apart with their edges further out at higher speeds. Golden seeds: an
   extra hop from the top step (P23.75), high in the GLIDE's gravity-up stretch (let go of the hold on 83.5 early), and above the
   final leap (tap the free ring at its top). */
const CLATTER = make({ id: 'clatter', name: 'CLATTER CRUNCH', diff: 'hard', world: 'works', bpm: 138, intro: 2, bars: 44, startSpeed: 1, track: 'clatter' }, H => {
  const { bx, AXb, add, press, thorns, thornsDown, bed, cap, mode, grav, speed, seed } = H, K = kit(H);
  const r2 = n => Math.round(n * 100) / 100;
  const ringHop = (b, pink, end, small) => { press(b - 0.5, b); add(pink ? 'ringP' : 'ringY', bx(b) + 0.1, 1.2); bed(bx(b - 0.5) + 1.8, bx(b - 0.5) + (end || 7.3), 0, small); };
  /* steps up, a press every 1.5 beats or more: each step's edge `off` blocks past the press (2.9 at normal speed, 4 faster) */
  const steps = (bs, hs, lastW, off, kind) => { press(...bs); bs.forEach((b, k) => { const x = bx(b) + off, w = k < bs.length - 1 ? bx(bs[k + 1]) + off - x : lastW; add(kind || 'crate', x, 0, r2(w), hs[k]); }); };
  /* FLIP: taps on beats bs from the floor (up, down, up ...); thorn beds where you are not (see CANDYFLOSS CLIMB) */
  const flips = (bs, top, d0, d1, small) => { press(...bs); for (let k = 0; k < bs.length - 1; k++) { const x0 = bx(bs[k]) + d0, x1 = bx(bs[k + 1]) + d1; if (x1 - x0 >= 1) bed(x0, x1, k % 2 ? top - 1 : 0, small, k % 2 === 1); } };

  /* VERSE 1, bars 3-10. Normal speed: a double P8, a single P10, a double P11.5, singles P13 P15, doubles P16.5 P18; steps P21 P22.5 */
  thorns(8, 2); thorns(10, 1); thorns(11.5, 2); thorns(13, 1); thorns(15, 1); thorns(16.5, 2); thorns(18, 2);
  steps([21, 22.5], [1, 2], r2(bx(25) - bx(22.5) - 2.9), 2.9);
  seed(bx(23.75) + AXb(23.75), 4.5);   /* golden seed 1: an extra hop from the top step on 23.75 */
  /* fast from 25.5: a cap on 27 throws you through a ring (tap it on 27.5) over a long bed; P32 + ring 32.5, P34 + pink ring 34.5;
     a small triple P36.5, a double P38 */
  speed(25.5, 2);
  cap(27); press(27.5); add('ringY', bx(27.5) + 0.1, 2.6); bed(bx(27) + 1.6, bx(27) + 9);
  ringHop(32.5); ringHop(34.5, true, 8.3); thorns(36.5, 3, 0, true); thorns(38, 2);
  /* DROP 1, bars 11-18: a corridor 7 high, normal speed. Gravity up on 41: upside-down hops P43 P45 P47 under hanging thorns; a
     hanging blue cap on 49 drops you; a double P51; P52.5 + a blue ring on 53 lifts you over a floor bed; upside down P55; gravity
     down on 56.5; a double P58; a yellow cap on 60 over a bed; P62.5 + a blue ring on 63 up again; P65 P67 upside down; a hanging
     blue cap on 69 drops you for the GLIDE */
  speed(39.5, 1); mode(40, 'hop', 7); grav(41, true, 4);
  thornsDown(43, 1, 7); thornsDown(45, 2, 7); thornsDown(47, 1, 7);
  cap(49, false, 7, 'B', true);
  thorns(51, 2); press(52.5, 53); add('ringB', bx(53) + 0.1, 1.2); bed(bx(52.5) + 1.8, bx(56.5) + 1);
  thornsDown(55, 2, 7); grav(56.5, false, 4);
  thorns(58, 2); cap(60); bed(bx(60) + 1.6, bx(60) + 4.6);
  press(62.5, 63); add('ringB', bx(63) + 0.1, 1.2); bed(bx(62.5) + 1.8, bx(69) + 3);
  thornsDown(65, 1, 7); thornsDown(67, 2, 7); cap(69, false, 7, 'B', true);
  /* BREAK 1, bars 19-22: a fast GLIDE (a corridor 9 high): up over a wall, a wave, gravity up on 80.5 (hold to sink: dip under a
     column, then up to the canopy over a tall wall, a dip through a gap), gravity down on 85, down to the floor */
  speed(71.5, 2); K.glide(72, 9);
  K.hold(73.5, 75); K.hold(77.5, 78.5);
  K.grav(80.5, true); K.hold(81, 81.5); K.hold(83.5, 84.5); K.grav(85, false);
  const C = 0.8, CL = 1.2;
  K.ceilCol(72.9, 2, CL, 9); K.gate(75.45, 1, C, 9); K.ceilCol(77.35, 1, CL, 9); K.gate(78.95, 1, C, 9); K.ceilCol(80.3, 1, CL, 9);
  K.gate(81.4, 1, C, 9); K.floorCol(83.55, 1, 2.1); K.ceilCol(87.3, 1, CL, 9);
  seed(bx(84.9) - 1.4, 7);   /* golden seed 2: let go of the hold on 83.5 early (gravity is up: you stay high), then down after 85; 2 blocks before the gravity trellis, clear of its sign (fix round 2) */
  mode(88, 'flip', 6);
  /* VERSE 2, bars 23-30: FLIP, fast, a corridor 6 high: free flips P89 P90, then beds where you are not */
  flips([89, 90], 6, 99, 0);
  flips([91, 92, 93.5, 94.5, 95.5, 97, 98, 99, 100.5, 101.5, 102.5, 104, 105, 106, 107.5, 108.5], 6, 2.5, 2.6);
  mode(110, 'hop');
  /* slow from 111: a double P113, a small double P115, a single P116.5, a double P118 */
  speed(111, 0); thorns(113, 2); thorns(115, 2, 0, true); thorns(116.5, 1); thorns(118, 2);
  /* DROP 2, bars 31-38: faster from 119.5: a double P121, P122.5 + ring 123, a small quad P125, steps P127 P128.5, a thorn on the top
     step P130.5, the pink cap on 133 up a terrace 4 high, a thorn on it P135; then FLIP (fast, a corridor 7 high) from 137.5 */
  speed(119.5, 3); thorns(121, 2); ringHop(123); thorns(125, 4, 0, true);
  steps([127, 128.5], [1, 2], r2(bx(132) - bx(128.5) - 4), 4); thorns(130.5, 1, 2);
  cap(133, true); add('planter', bx(133) + 3.5, 0, Math.round(bx(136) - bx(133) - 3.5), 4); thorns(135, 1, 4);
  speed(137, 2); mode(137.5, 'flip', 7);
  flips([139, 140, 141.5, 143, 144, 145.5, 147, 148, 149.5, 150.5], 7, 2.4, 2.6);
  mode(152, 'hop');
  /* BUILD, bars 39-42: faster from 152.5: a double P154, a triple P155.5, a double P157, a small quad P158.5, steps P160 P161.5,
     a thorn on the top step P163.5, a triple P165.5 */
  speed(152.5, 3); thorns(154, 2); thorns(155.5, 3); thorns(157, 2); thorns(158.5, 4, 0, true);
  steps([160, 161.5], [1, 2], r2(bx(164.5) - bx(161.5) - 4), 4); thorns(163.5, 1, 2); thorns(165.5, 3);
  /* FINAL DROP, bars 43-46: the big climb: steps P168 P169.5 P171, a thorn on the top P173, the pink cap on 175 throws you high over
     a long bed (a free ring at the top: the third golden seed); P178.5 + ring 179, a double P181, the arch */
  steps([168, 169.5, 171], [1, 2, 3], r2(bx(175) + 1.6 - bx(171) - 4), 4); thorns(173, 1, 3);
  cap(175, true, 3); bed(bx(175) + 2.5, bx(175) + 13);
  add('ringY', bx(175.75) - 0.5, 7.4); seed(bx(175.75) + 3.4, 10.2);   /* golden seed 3: tap the free ring at the top of the leap */
  ringHop(179); thorns(181, 2);
  /* scenery: a chimney and paper lanterns by the run-up and the finish, lanterns high above the open stretches */
  K.scene('chimney', 1.5); K.scene('lantern', 4, 6);
  for (const b of [12, 20, 30, 116, 124, 158, 166]) K.scene('lantern', b, 10 + (b % 3) * 0.5);
  K.scene('chimney', 185); K.scene('lantern', 187, 6);
});

BEAT.LEVELS = [PATCHWORK, CANDYFLOSS, CLATTER];
})();
