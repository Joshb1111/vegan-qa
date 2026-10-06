/* BEET BEAT — levels.js (LEVELS). The level data and its format. Loaded first; no other file needed (sim.js reads the shared
   constants below). An original one-button rhythm runner for understand-veganism.com's planet; every level is our own.

   LEVEL  { id, name, diff:'easy'|'normal'|'hard', world:'meadows'|'skyway'|'works', bpm, intro (bars of run-up), bars (bars of
            play after the intro), startSpeed (index into BEAT.SPEEDS), len (blocks: the finish line, where the music ends),
            objects:[[type, x, y, a, b] ...] sorted by x, seeds:[[x,y] x3], deco:[[type, x, y] ...],
            presses:[beat ...] (the designer's intended presses, on the beat: the tests check a run pressing exactly on them
            finishes, with a fair window around each; the bot plays them) }
   UNITS  1 block = 1 grid unit (drawn 40 px at 720p). x grows to the right, y = 0 is the top of the floor, y grows upwards.
          The runner is a 1 x 1 block; its x is its CENTRE, its y its BOTTOM. At beat b it is at x = bx(b) (the run starts at x = 0
          on beat 0, the first beat of the music; the intro bars are empty run-up).
   TYPES  (x, y = the object's lower-left corner, in blocks)
     'thorn'   a big bramble thorn, 1 wide, about 1 tall (its hurt box is smaller than its art). a: 1 = hangs point-down.
     'thornS'  a small thorn, half as tall.
     'crate'   a solid wooden crate: a = width (default 1), b = height (default 1). Safe to stand on; its sides crash you.
     'planter' a solid terracotta planter with sprouts on top: a = width, b = height (default 1).
     'slab'    a solid half-height plank: a = width (default 1); 0.5 tall.
     'capY'    a yellow spring cap (a mushroom-cap jump pad): touching it launches a small bounce (about 3.2 blocks).
     'capP'    a pink spring cap: a big bounce (about 5.2 blocks).
     'ringY'   a yellow puff ring (a dandelion clock in the air): tap while touching it for a normal hop from mid-air.
     'ringP'   a pink puff ring: tap while touching it for a big hop.
     Reserved for the next milestone (not in the sim yet): 'portal' (a: 'hop'|'glide'|'flip'|'gup'|'gdown'|'s0'..'s3'),
     'capB' (blue: gravity flip pad), 'ringB' (blue: gravity flip ring).
   DESIGN Each level is written on its beat grid with the little helpers in make(): bx(beat) is where the runner is on that beat,
          and the pattern helpers place things so that the press (or the landing) falls on the beat. BEAT.Sim.solve(level) proves a
          level can be finished and reports the tightest timing window (see sim.js); run it after any edit. */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, BEAT = G.BEAT = G.BEAT || {};
/* shared physics constants (sim.js uses these; change them here only) */
BEAT.SPEEDS = [8.4, 10.4, 12.9, 15.6];          /* blocks per second: slow, normal, fast, faster */
BEAT.JUMP = { h: 2.1, t: 0.44 };                 /* a hop: 2.1 blocks high, 0.44 s in the air (so a quarter turn takes 0.44 s) */

const r2 = n => Math.round(n * 100) / 100;
function make(meta, script) {
  const spb = 60 / meta.bpm, v = BEAT.SPEEDS[meta.startSpeed], bx = b => b * spb * v;
  const AX = v * BEAT.JUMP.t / 2;                /* from a press to the top of the hop, in blocks */
  const objs = [], beats = [], press = (...bs) => { for (const b of bs) beats.push(b); }, add = (t, x, y, a, b) => { const o = [t, r2(x), r2(y || 0)]; if (a != null || b != null) o.push(a == null ? 1 : a); if (b != null) o.push(b); objs.push(o); };
  const H = {
    bx, AX, add, press,
    /* n thorns side by side, centred under the top of a hop pressed on beat b (from a surface at height y) */
    thorns(b, n, y, small) { press(b); const x0 = bx(b) + AX - n / 2; for (let i = 0; i < n; i++) add(small ? 'thornS' : 'thorn', x0 + i, y || 0); },
    /* a row of thorns between two x positions (a thorn bed), on the floor or a surface */
    bed(x0, x1, y, small) { for (let x = x0; x <= x1 - 1 + 1e-6; x += 1) add(small ? 'thornS' : 'thorn', x, y || 0); },
    /* a staircase of crates (or planters) pressed on beats bs[k], tops at hs[k]; each step runs on to the next one's edge,
       the last one is lastW wide. A step's left edge is 2.1 blocks past the press: the hop clears its side, lands on it. */
    stair(bs, hs, lastW, kind) { press(...bs); bs.forEach((b, k) => { const x = bx(b) + 2.1, w = k < bs.length - 1 ? bx(bs[k + 1]) + 2.1 - x : lastW; add(kind || 'crate', x, 0, r2(w), hs[k]); }); },
    /* a spring cap reached exactly on beat b, on a surface at height y */
    cap(b, pink, y) { add(pink ? 'capP' : 'capY', bx(b) + 0.4, y || 0); },
    /* a puff ring centred where the runner is on beat b, at height y (its lower edge) */
    ring(b, y, pink) { press(b); add(pink ? 'ringP' : 'ringY', bx(b) - 0.5, y); }
  };
  script(H);
  objs.sort((p, q) => p[1] - q[1] || p[2] - q[2]);
  beats.sort((p, q) => p - q);
  return Object.assign({ seeds: [], deco: [] }, meta, { objects: objs, presses: beats, len: r2(bx((meta.intro + meta.bars) * 4)) });
}
BEAT.makeLevel = make;

/* ===================== 1. PATCHWORK PULSE — easy, 110 bpm, 2 bars intro + 22 bars (about 52 s) =====================
   Thorns on the beat, then crate steps, spring caps, planks over a thorn bed, puff rings, and a bouncy finale.
   Every press falls on a beat or a half beat (the comments name them: "P48.5" = press on beat 48.5). At this speed a hop
   lasts 0.81 of a beat, a yellow cap's bounce exactly one beat, and a puff ring tapped at the top of a hop carries you one
   more beat (so a ring is placed half a beat after the hop that reaches it); a pink ring there, a beat and a quarter. */
const PATCHWORK = make({ id: 'patchwork', name: 'PATCHWORK PULSE', diff: 'easy', world: 'meadows', bpm: 110, intro: 2, bars: 22, startSpeed: 1, track: 'patchwork' }, H => {
  const { bx, add, press, thorns, bed, stair, cap, ring } = H;
  /* bars 3-4: single thorns: P8 P10 P12 P14 P15 */
  thorns(8, 1); thorns(10, 1); thorns(12, 1); thorns(14, 1); thorns(15, 1);
  /* bars 5-6: a small thorn P16, a double P18, up onto a crate P20 (walk off its end), singles P22 P23 */
  thorns(16, 1, 0, true); thorns(18, 2); stair([20], [1], 4); thorns(22, 1); thorns(23, 1);
  /* bars 7-8: a crate staircase P24 P25, along the top, drop; a double P28, a single P30 */
  stair([24, 25], [1, 2], 6); thorns(28, 2); thorns(30, 1);
  /* bars 9-10: a yellow cap on 32 bounces you over three thorns (one beat), a single P34; again on 36, a double P38 */
  cap(32); bed(bx(32) + 1.6, bx(32) + 4.6); thorns(34, 1); cap(36); bed(bx(36) + 1.6, bx(36) + 4.6); thorns(38, 2);
  /* bars 11-12: planks rising over a bed of small thorns: P40 P41 P42, drop off; singles P45 P46 */
  press(40, 41, 42); add('slab', bx(40) + 2.4, 1, r2(bx(41) + 1 - bx(40) - 2.4)); add('slab', bx(41) + 1.8, 1.5, r2(bx(42) + 1 - bx(41) - 1.8)); add('slab', bx(42) + 1.8, 2, 4.2);
  bed(bx(40) + 1.2, bx(42) + 9, 0, true); thorns(45, 1); thorns(46, 1);
  /* bars 13-14: puff rings: hop P48.5, tap the ring on 49 to clear the bed (land on 50); again P51.5 + ring 52; a double P54 */
  press(48.5, 51.5); ring(49, 2); bed(bx(48.5) + 1.3, bx(48.5) + 7.3); ring(52, 2); bed(bx(51.5) + 1.3, bx(51.5) + 7.3); thorns(54, 2);
  /* bars 15-16: the pink cap on 56 throws you onto a high planter terrace; a thorn up there P58; drop; singles P61 P62 */
  cap(56, true); add('planter', bx(56) + 2.5, 0, r2(bx(58) + 6 - bx(56) - 2.5), 3); thorns(58, 1, 3); thorns(61, 1); thorns(62, 1);
  /* bars 17-18: hop-and-ring twice as quickly: P64.5 + ring 65 (land on 66), P66.5 + a pink ring 67 for a big arc; a double P70 */
  press(64.5, 66.5); ring(65, 2); bed(bx(64.5) + 1.3, bx(64.5) + 7.3); ring(67, 2, true); bed(bx(66.5) + 1.3, bx(66.5) + 8.3); thorns(70, 2);
  /* bars 19-20: up on a long crate P72, a thorn on top P73.5, down; small doubles P76 P78 */
  stair([72], [1], r2(bx(75) + 0.5 - bx(72) - 2.1)); thorns(73.5, 1, 1); thorns(76, 2, 0, true); thorns(78, 2, 0, true);
  /* bars 21-22: planter steps P80 P81, hop off the top P82 and tap the pink ring on 82.5 for a big arc; a double P85, a single P87 */
  stair([80, 81], [1, 2], r2(bx(82) + 1 - bx(81) - 2.1), 'planter'); press(82); ring(82.5, 4, true); bed(bx(82) + 1.6, bx(82.5) + 5.6); thorns(85, 2); thorns(87, 1);
  /* bars 23-24: the finale: four singles on the beat P88-P91, a yellow cap on 92 over a bed, a last single P94, the finish arch */
  thorns(88, 1); thorns(89, 1); thorns(90, 1); thorns(91, 1); cap(92); bed(bx(92) + 1.6, bx(92) + 4.6); thorns(94, 1);
});

BEAT.LEVELS = [PATCHWORK];
})();
