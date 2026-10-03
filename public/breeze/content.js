/* Berry Breeze — content.js
   HEADER (lead, frozen): constants, type list, fruit table, seeded RNG. Do not change above the marker.
   BELOW THE MARKER (content engineer): BB.ENEMY definitions and behaviours, BB.STAGES timelines, BB.spawnWave.
   See /private/tmp/breeze/SPEC.md sections 1 and 3 for the rules every definition must follow. */
'use strict';
window.BB = window.BB || {};
BB.C = {
  W: 240, H: 320, TICK: 1000 / 60, SCROLL: 0.4, PROTO: 3,
  MAX_EBUL: 44, MAX_ENEMY: 16, MAX_FRUIT: 8, MAX_BUSH: 4, MAX_PSHOT: 64, SAFE_R: 40, SAFE_R_GUEST: 60,
  OFF: { yMax: 340, yMin: -60, xMin: -40, xMax: 280 },
  SHIP: {
    speeds: [1.5, 1.9, 2.3], hurtR: 3, pickR: 14, magnetR: 40, magnetV: 2.2,
    xMin: 10, xMax: 230, yMin: 24, yMax: 308,
    fireEvery: 6, shotV: 6, shotR: 3, shotDx: 4, spreadDeg: [[0], [0, -10, 10], [0, -10, 10, -20, 20], [0, -10, 10, -20, 20], [0, -10, 10, -20, 20, -30, 30]], powerMax: 4,
    buddySlots: [[-14, 6], [14, 6]], buddyLerp: 0.25, buddyEvery: 10, buddyV: 5, buddyR: 2.5, buddyAngDeg: 5,
    chargeMax: 60, chargeHalf: 30, chargeCool: 30,
    sun: { r: 12, v: 4.5, dmg: 16, cancelR: 16, bossEvery: 20 },
    seedlet: { r: 6, v: 5, dmg: 6, cancelR: 8 },
    hpMax: 5, hpStageHeal: 2, invHit: 90, invRevive: 120, invBonk: 30, bonkDmg: 4, bonkPush: 12, bossPush: 8,
    downTicks: 180, downRise: 0.2, downYMin: 120, reviveHp: 3, reviveR: 22,
    start: { solo: [120, 280], p1: [90, 280], p2: [150, 280] }
  },
  FRUIT: { g: 0.03, vMax: 0.5, drag: 0.98, bumpV: -1.5, bumpVX: 0.04, bumpVXMax: 0.6, hitsPer: 3, hitsTeam: 2,
           r: 9, ceil: 36, wallL: 10, wallR: 230, yOut: 330, sunPts: 300, maxPts: 500, heartPts: 200,
           basketEvery: 5, basketPts: 1000 },
  BUSH: { hp: 4, r: 12, score: 30, vy: 0.5, sway: 6, swayT: 180, popVy: -1.2 },
  BOSS: { coopHp: 1.5, enterTicks: 120, enterY: 72, tiredTicks: 5400, bonus: 5000, tiredBonus: 1000 },
  KIND: { mul: 0.95, min: 0.85, dropOuterAt: 2 },
  TALLY: { heart: 300, noBubble: 3000, ticks: 300 },
  STAGE: { bannerTicks: 120, warnTicks: 180, bossAt: 120 },
  /* v2: difficulty (EASY = MEDIUM's enemies with more health; HARD = faster bullets, tougher toys, extra bullets, no kind assist) */
  /* v3: HARD is a real challenge: 3 hearts, 3 lives then GAME OVER, fast dense bullets, tough toys, short invulnerability.
     MEDIUM keeps v2's enemies (only the later upgrades change it); shield = most shield layers a ship can hold (a Blueberry fills
     it, a bubble adds one): EASY 3, MEDIUM 3, HARD 1 */
  DIFF: [{ id: 'easy', name: 'EASY', hp: 8, heal: 3, reviveHp: 4, bMul: 1, eHp: 1, extra: 0, kind: true, lives: 0, invHit: 90, safeR: 40, superTicks: 720, dropMul: 1, shield: 3 },
         { id: 'medium', name: 'MEDIUM', hp: 5, heal: 2, reviveHp: 3, bMul: 1, eHp: 1, extra: 0, kind: true, lives: 0, invHit: 90, safeR: 40, superTicks: 600, dropMul: 1, shield: 3 },
         { id: 'hard', name: 'HARD', hp: 3, heal: 1, reviveHp: 3, bMul: 1.35, eHp: 1.6, extra: 2, kind: false, lives: 3, invHit: 60, safeR: 26, superTicks: 420, dropMul: 0.6, shield: 1 }],
  /* v3: weapon power is capped per stage, so the big upgrades come later (stage 1: power 2, stage 2: 3, stage 3: 4) */
  POWER_CAP: [2, 3, 4],
  /* v2: weapon types (wt) x power 0..4. pea uses SHIP.spreadDeg (power 3: big twin shots, power 4: +-30 deg) */
  WEAPON: { names: ['PEA SHOT', 'PETAL FAN', 'SUNBEAM', 'SEEKERS'],
            pea: { every: 6, bigDmg: 1.5, bigR: 4 },
            fan: { every: 7, v: 5, n: [3, 5, 5, 7, 9], deg: [15, 30, 40, 45, 50], dmg: 1, r: 3 },
            beam: { every: 9, v: 9, dmg: [2, 2.5, 3, 3.5, 4], pierce: [2, 2, 3, 3, 4], r: [3, 3, 4, 4, 5], twinAt: 2 },
            seeker: { every: 10, v: 4.5, n: [2, 2, 3, 4, 4], turn: 0.12, dmg: 1, r: 3, peas: true } },
  SUPER: { ticks: 720, every: 4, n: 9, deg: 60, v: 6.5, dmg: 2, pierce: 2, r: 4 },
  PICK: { r: 10, packetVy: 0.45, sway: 10, swayT: 160, starVy: 0.35, bubbleVy: -0.45, bubbleSway: 16, bubbleTop: -24, maxPts: 500, bubblePts: 200 },
  NET: { everyRtc: 2, everyAbly: 3, dRtc: [60, 160], dAbly: [150, 400], dShipRtc: 70, dShipAbly: 200, dShipMaxRtc: 160, dShipMaxAbly: 400,
         evTtlRtc: 300, evTtlAbly: 800, evLate: 500, maxMsg: 6000, guestSilence: 30000, ignoreNewBulletTicks: 12 }
};
BB.TYPE_LIST = ['smudge', 'glider', 'tinbot', 'grumble', 'twirlie', 'boinger', 'vent', 'ticktock',
                'bush', 'present', 'zap', 'clanky', 'thunderpuff', 'smoggins', 'grumblet'];
BB.TC = {}; BB.TYPE_LIST.forEach((t, i) => { BB.TC[t] = i; });
BB.FRUITS = [
  { k: 0, id: 'sunberry', label: '+300', power: 'points' },
  { k: 1, id: 'blueberry', label: 'SHIELD!', power: 'shield' },
  { k: 2, id: 'grapes', label: 'BUDDY!', power: 'buddy' },
  { k: 3, id: 'strawberry', label: '+POWER', power: 'power' },
  { k: 4, id: 'kiwi', label: '+ZOOM', power: 'speed' },
  { k: 5, id: 'heartpeach', label: '♥', power: 'heart' },
  { k: 6, id: 'rainbowpeach', label: 'RAINBOW!', power: 'rainbow' },
  /* v2 pickups: never juggled (shots pass through), see SPEC2 F */
  { k: 7, id: 'starfruit', label: 'SUPER STAR!', power: 'super' },
  { k: 8, id: 'peapacket', label: 'PEA SHOT', power: 'weapon', wt: 0 },
  { k: 9, id: 'petalpacket', label: 'PETAL FAN', power: 'weapon', wt: 1 },
  { k: 10, id: 'sunpacket', label: 'SUNBEAM', power: 'weapon', wt: 2 },
  { k: 11, id: 'seekerpacket', label: 'SEEKERS', power: 'weapon', wt: 3 },
  { k: 12, id: 'bubble', label: 'BUBBLE!', power: 'bubble' }
];
BB.mulberry32 = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/* ===== CONTENT BELOW ===== */
/* Enemies, bosses, stage timelines, the wave spawner and the random drop tables. Host-only simulation: everything random
   comes from w.rng(). 'a' byte: 0 idle, 1 telegraph (always ~20+ ticks before a shot), 2 alt (key spinning / live zap /
   phase B), 3 defeated. v2 (SPEC2): busier waves that ramp through each stage, HARD extras (DIFF.extra), 3-phase bosses,
   BB.dropKind, formation-clear drops and shield bubbles. v3 (SPEC3): later upgrades (no starfruit in stage 1, rarer packets,
   DIFF.dropMul), HARD fires about x0.7 as often (a faster cadence clock), aims from the start, extra HARD-only waves and one
   extra pattern per boss phase. */
(function () {
const C = BB.C, PI = Math.PI, TAU = PI * 2, DOWN = PI / 2, D2R = PI / 180;
const SPD = [1.3, 1.45, 1.6];                          // base enemy bullet speed per stage (px/t, before kind assist / DIFF.bMul)
const sp = (w, m) => SPD[w.stage] * (m || 1);
const aim = (w, e) => w.ang(e.x, e.y, w.target(e));
const calm = w => { const b = w.sm.boss; return !!(b && (b.dying || b.dead)); };   // boss cheered up: nobody shoots any more
const may = (e, w) => !calm(w) && e.y > 36 && e.y < 232; // only shoot from the upper playfield, below the HUD pills (y < 30)
const dif = w => w.diff == null ? 1 : w.diff | 0;        // 0 easy, 1 medium (default, also an old world without w.diff), 2 hard
const DF = w => C.DIFF[dif(w)] || C.DIFF[1];
const XB = w => Math.max(0, Math.min(2, DF(w).extra | 0)); // extra bullets and waves (0 easy, 1 medium, 2 hard; clamped)
const XN = w => XB(w) > 0 ? 1 : 0;                         // extras yes/no (HARD and MEDIUM; for extras that must not scale with the number)
const HD = w => dif(w) === 2;                              // HARD only: fewer bubbles, bushes and Heart Peaches (v3 tuning)
const prog = w => Math.min(1, w.tick / (((BB.STAGES[w.stage] || {}).bossAt || C.STAGE.bossAt) * 60));   // 0..1 through the stage
const aimOn = w => w.stage > 0 || XB(w) > 0 || prog(w) > 0.4;   // stage 1 fires straight down at first, aims later (HARD: from the start)
/* telegraph helper: a = 1 for `len` ticks before `at`; true on the shot tick */
function tele(e, c, at, len) { if (c >= at - (len || 20) && c < at) e.a = 1; return c === at; }
/* tele, plus on HARD a second shot 10 ticks later (a double tap) */
function tele2(e, w, c, at) { return tele(e, c, at) || (XB(w) > 0 && c === at + 10); }
/* HARD cadence: a clock that runs 1/0.7 as fast, so every interval is x0.7. ck(w, c, L) → {k now, p last tick, f}, both mod L.
   tk() is tele() on that clock: the shot fires on the tick the clock passes `at`, the telegraph keeps its real length
   (len x f clock units). With f = 1 (EASY) it is exactly tele(e, c % L, at, len); MEDIUM runs half way (extra 1). */
const CAD = 1 / 0.7, cf = w => 1 + (CAD - 1) * XB(w) / 2;   // MEDIUM (extra 1): half way, about x0.82
function ck(w, c, L, f) { f = f || cf(w); L = L || 1e9; return { k: c * f % L, p: (c - 1) * f % L, f }; }
/* bosses: x0.8 on HARD (a boss fight with base weapons lasts up to 90 s, so its clock speeds up less than the toys' x0.7) */
const BCAD = 1 / 0.8, bf = w => 1 + (BCAD - 1) * XB(w) / 2, bk = (w, c, L) => ck(w, c, L, bf(w));
const past = (K, at) => K.p < K.k ? K.p < at && at <= K.k : K.p < at || at <= K.k;
function tk(e, K, at, len) { if (K.k >= at - (len || 20) * K.f && K.k < at) e.a = 1; return past(K, at); }
/* fires on every `step` from a up to b (a smoke spiral): the clock passed a + i*step */
function every(K, a, b, step) { if (K.k < a || K.k >= b) return false; const m = a + Math.floor((K.k - a) / step) * step; return K.p < m || K.p > K.k; }
const per = (w, P) => Math.round(P / cf(w));                // a fire period on HARD's cadence
const def = (o, type) => Object.assign({ tc: BB.TC[type], ground: false, boss: false, shootable: true, contact: true, score: 0 }, o);

/* movement helpers */
function swoopInit(e, left) { e.d.L = left ? 1 : -1; e.x = left ? -20 : 260; e.y = 40; }
function swoop(e, t, dur) {   /* quarter ellipse from the side at y 40, bulging up, to the far bottom corner */
  if (t > dur) { e.y += 2; return; }
  const th = t / dur * DOWN, s = e.d.L;
  e.x = 120 - s * 140 + s * 245 * Math.sin(th); e.y = 340 - 300 * Math.cos(th);
}
/* enter → hover → leave (grumble, grumblet, ticktock). Returns hover tick, or -1 when not hovering. */
function hoverMove(e, w, hold) {
  const d = e.d;
  if (calm(w) && d.st < 2) d.st = 2;
  if (d.st === 0) {
    const dy = d.ty - e.y; e.y += Math.min(1, Math.max(0.15, dy * 0.05));
    if (dy < 0.6) { d.st = 1; d.h = 0; d.hx = e.x; }
    return -1;
  }
  if (d.st === 1) {
    d.h++; e.x = d.hx + 5 * Math.sin(d.h * TAU / 150); e.y = d.ty + 2 * Math.sin(d.h * TAU / 90);
    if (d.h >= hold) d.st = 2;
    return d.h;
  }
  e.y -= 1; return -1;
}

const E = BB.ENEMY = {};

/* 0 Smudge: smog puff, no attack */
E.smudge = def({ hp: 1, r: 6, score: 50,
  init(e, w) { e.d.x0 = e.x; e.d.s = e.pat === 'sineL' ? -1 : 1; if (e.pat === 'swoopL' || e.pat === 'swoopR') swoopInit(e, e.pat === 'swoopL'); },
  tick(e, w) {
    const t = w.T(e);
    if (e.pat === 'swoopL' || e.pat === 'swoopR') swoop(e, t, 200);
    else if (e.pat === 'sineL' || e.pat === 'sineR') { e.y += 1.1; e.x = e.d.x0 + e.d.s * 50 * Math.sin(TAU * t / 120); }
    else { e.y += 1; e.x = e.d.x0 + 8 * Math.sin(TAU * t / 100); }
  } }, 'smudge');

/* 1 Glider: toy paper plane; formations 'row' and 'col' (never a vee). Some planes fire one aimed shot:
   stage 1 only the lead plane after the first third, then every 3rd plane. HARD: every 2nd plane in stage 1, every plane later. */
E.glider = def({ hp: 1, r: 6, score: 60,
  init(e, w) {
    e.d.x0 = e.x; if (e.pat === 'swoopL' || e.pat === 'swoopR') swoopInit(e, e.pat === 'swoopL');
    const x = XB(w), g = w.stage === 0 ? (x ? 4 - x : prog(w) > 0.3 ? 4 : 0) : Math.max(1, 3 - x);
    e.d.gun = g > 0 && (e.idx | 0) % g === 0;
  },
  tick(e, w) {
    const t = w.T(e); e.a = 0;
    if (e.pat === 'swoopL' || e.pat === 'swoopR') swoop(e, t, 240);
    else { e.y += e.pat === 'col' ? 1.1 : 1; e.x = e.d.x0 + 4 * Math.sin(TAU * t / 80); }
    if (e.d.gun && !e.d.shot && may(e, w)) {
      if (e.y >= 70) e.a = 1;
      if (e.y >= 92) { e.d.shot = 1; w.bullet(e.x, e.y + 4, sp(w), aim(w, e)); }
    }
  } }, 'glider');

/* 2 Tinbot (Clanker): wind-up tin walker. Stage 1 fires straight down (aimed later in the stage); a second shot late in
   stage 1 and from stage 2 on; HARD: the first shot is a double tap, aimed from the start, then shots every 77 ticks (x0.7).
   Spawned at y -20: the first shot is at y 50, the HARD third one at y 158. */
E.tinbot = def({ hp: 4, r: 9, score: 100,
  init(e, w) { e.d.x0 = e.x; },
  tick(e, w) {
    const t = w.T(e), st = w.stage; e.a = 0;
    e.y += 0.7; e.x = e.d.x0 + 10 * Math.sin(TAU * t / 90);
    const x = XN(w);
    if (may(e, w) && (tele2(e, w, t, 100) || ((st > 0 || x || prog(w) > 0.75) && tele(e, t, x ? 177 : 210)) || (x && tele(e, t, 254))))
      w.bullet(e.x, e.y + 8, sp(w), aimOn(w) ? aim(w, e) : DOWN);
  } }, 'tinbot');

/* 3 Grumble Cloud: hovers; two 3-way fans in stage 1 (straight down, aimed later; a third late in the stage), two 5-way
   aimed fans from stage 2 on. HARD: +4 bullets per fan (a little wider), cadence x0.7 and one more fan in the hover. */
E.grumble = def({ hp: 10, r: 12, score: 250,
  init(e, w) { e.d.ty = 56 + w.rng() * 30; e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 240);
    if (h <= 0 || !may(e, w)) return;
    const st = w.stage, three = st === 0 && prog(w) > 0.7, K = ck(w, h), x = XB(w);
    if (three ? tk(e, K, 60, 30) || tk(e, K, 140, 30) || tk(e, K, 220, 24) || (x && tk(e, K, 300, 24))
              : tk(e, K, 70, 30) || tk(e, K, 170, 30) || (x && tk(e, K, 270, 24)))
      w.fan(e.x, e.y + 8, (st ? 5 : 3) + 2 * x, ((st ? 44 : 30) + 6 * x) * D2R, sp(w), aimOn(w) ? aim(w, e) : DOWN);
  } }, 'grumble');

/* 4 Twirlie: spinning top that bounces between the walls; one ring of 6 (stage 3: 8). HARD: +4 per ring and a second ring 84 ticks later */
E.twirlie = def({ hp: 6, r: 9, score: 150,
  init(e, w) { e.vx = e.pat === 'bounceL' ? -1 : 1; e.vy = 0.8; e.d.off = w.rng() * 60 * D2R; },
  tick(e, w) {
    const t = w.T(e); e.a = t > 300 ? 2 : 0;
    e.x += e.vx; e.y += e.vy;
    if (t < 300) { if (e.x < 12) { e.x = 12; e.vx = 1; } else if (e.x > 228) { e.x = 228; e.vx = -1; } }
    else e.vy = 1.3;
    if (!may(e, w)) return;
    const n = (w.stage === 2 ? 8 : 6) + 2 * XB(w);
    if (tele(e, t, 120)) w.ring(e.x, e.y, n, sp(w, 0.95), e.d.off);
    else if (XN(w) && tele(e, t, 204)) w.ring(e.x, e.y, n, sp(w, 0.95), e.d.off + PI / n);
  } }, 'twirlie');

/* 5 Boinger: jack-in-the-box on the ground (no contact). a=1 lid rattles, a=2 head popped up. 1 shot per pop in stage 1, then 2.
   HARD: +2 shots (max 3 in stage 1, 4 later) and pops x0.7 as often. */
E.boinger = def({ hp: 8, r: 10, score: 200, ground: true, contact: false,
  tick(e, w) {
    const t = w.T(e), st = w.stage, P = per(w, st === 0 ? 180 : st === 1 ? 140 : 130), c = (t - 60 + P * 4) % P, n = Math.min(st ? 4 : 3, (st ? 2 : 1) + XB(w)); e.a = 0;
    if (t < 40 || !may(e, w)) return;
    if (c >= P - 20) e.a = 1; else if (c < 12 * n + 14) e.a = 2;
    if (c < 12 * n && c % 12 === 0) w.bullet(e.x, e.y - 6, sp(w, 1.05), aim(w, e));
  } }, 'boinger');

/* 6 Smog Vent: chimney pot on the ground. Quiet in early stage 1. Cleaning it leaves a flower pot; every 2nd one gives a Heart Peach. */
E.vent = def({ hp: 6, r: 9, score: 150, ground: true, contact: false,
  tick(e, w) {
    const t = w.T(e), st = w.stage; e.a = (t >> 5) & 1 ? 2 : 0;    // alternate puff frames
    if ((st > 0 || XB(w) || prog(w) > 0.5) && t >= 40 && may(e, w)) {
      const P = per(w, st === 0 ? 200 : st === 1 ? 160 : 140), c = (t - 60 + P * 4) % P, x = XB(w);
      if (c >= P - 20) e.a = 1;
      if (c === 0 || (x && c === 10) || (x > 1 && st > 0 && c === 20)) w.bullet(e.x, e.y - 6, sp(w, 0.9), aim(w, e));   // HARD: a double tap (triple from stage 2), x0.7 period
    }
  },
  onDeath(e, w) {
    w.fx('pot', e.x, e.y);
    w.sm.vents = (w.sm.vents | 0) + 1;
    if (w.sm.vents % (HD(w) && w.stage ? 4 : 2) === 0) w.fruit(e.x, e.y - 4, 5, 0, -1);   // a Heart Peach from every 2nd pot (HARD from stage 2: every 4th)
  } }, 'vent');

/* 7 Tick-Tock: alarm clock, hovers, rings twice (8 bullets, second ring offset; stage 3: a third ring) then leaves.
   HARD: +4 per ring, cadence x0.7 and one more ring in the hover. */
E.ticktock = def({ hp: 14, r: 11, score: 300,
  init(e, w) { e.d.ty = 64 + w.rng() * 16; e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 240);
    if (h <= 0 || !may(e, w)) return;
    const n = 8 + 2 * XB(w), K = ck(w, h);
    if (tk(e, K, 60, 40)) w.ring(e.x, e.y, n, sp(w, 0.9), 0);
    else if (w.stage === 2 && tk(e, K, 125, 30)) w.ring(e.x, e.y, n, sp(w, 0.9), PI / n * 0.5);
    else if (tk(e, K, 190, 40)) w.ring(e.x, e.y, n, sp(w, 0.9), PI / n);
    else if (XN(w) && tk(e, K, 320, 40)) w.ring(e.x, e.y, n, sp(w, 0.9), PI / n * 1.5);
  } }, 'ticktock');

/* 8 Berry Bush: floating leafy puff on a leaf parachute; popped → a random pickup hops out (BB.dropKind) */
E.bush = def({ hp: C.BUSH.hp, r: C.BUSH.r, score: C.BUSH.score, contact: false,
  init(e, w) { e.d.x0 = e.x; },
  tick(e, w) { e.y += C.BUSH.vy; e.x = e.d.x0 + C.BUSH.sway * Math.sin(TAU * w.T(e) / C.BUSH.swayT); },
  onDeath(e, w) { w.fruit(e.x, e.y, BB.dropKind(w, 'bush'), 0, C.BUSH.popVy); } }, 'bush');

/* 9 Gift Box: secret, harmless, on the ground. Opened → Rainbow Peach (one each in co-op) */
E.present = def({ hp: 12, r: 10, score: 0, ground: true, contact: false,
  tick(e, w) { e.a = e.flash ? 2 : 0; },
  onDeath(e, w) {
    if (w.coop) { w.fruit(e.x - 8, e.y, 6, -0.3, -1); w.fruit(e.x + 8, e.y, 6, 0.3, -1); } else w.fruit(e.x, e.y, 6, 0, -1);
    w.sm.gift = 1; w.sfx('gift'); w.event('A', 'gift'); w.fx('sticker', e.x, e.y - 16, 'SURPRISE!');
  } }, 'present');

/* 10 Zap column (Thunderpuff): warn (a=1) then live (a=2); full-height stripe, never shot */
E.zap = def({ hp: 1, r: 12, score: 0, shootable: false, contact: false,
  init(e, w) { e.d.warn = e.d.warn | 0; e.d.live = e.d.live | 0; },
  tick(e, w) {
    const d = e.d;
    if (calm(w)) return false;                         // the boss is cheering up / floating off: no stripes left
    if (d.warn > 0) { d.warn--; e.a = 1; return true; }
    if (d.live > 0) { if (e.a !== 2) { w.sfx('zap'); w.shake(0.6); } d.live--; e.a = 2; return true; }
    return false;
  },
  hit(e, px, py) { return e.a === 2 && Math.abs(px - e.x) < 10; } }, 'zap');

/* ---------- bosses: three phases each (66 % / 33 %), every attack telegraphed (a = 1), harder stage by stage ----------
   HARD: every phase cycle runs on the x0.8 boss clock (bk), and each phase adds one pattern; Thunderpuff and Smoggins also
   get +2 bullets per fan / ring. */
function bossInit(e, w) { e.d.y0 = e.y; e.d.x0 = e.x; e.d.ph = 0; e.d.c = 0; e.d.p = 0; e.d.bb = 0; w.sm.boss = e; }
function entering(e, w) {   /* slide in from above; cannot be un-grumped yet (any damage is undone) */
  const t = w.T(e), n = C.BOSS.enterTicks;
  if (t >= n) { e.d.inv = 0; return false; }
  const k = t / n, s = 1 - (1 - k) * (1 - k) * (1 - k);
  e.y = e.d.y0 + (C.BOSS.enterY - e.d.y0) * s; e.x = e.d.x0 + (120 - e.d.x0) * s;
  e.hp = e.maxHp; e.d.inv = 1; e.a = 0; return true;
}
function ending(e, w) {     /* world set e.dying: cheer-up hop (a=3) or the tired float-away; never shoots */
  if (!e.dying) return false;
  const d = e.d;
  if (d.dt == null) { d.dt = 0; d.ey = e.y; if (d.tired) w.fx('sticker', e.x, e.y - e.r - 6, 'Zzz...'); else cheerAll(w); }
  const k = ++d.dt;
  if (d.tired) {
    e.a = 0; e.y -= Math.min(1.5, 0.15 + k * 0.015); e.x += (120 - e.x) * 0.02;
    if (!d.done && (e.y < -e.r - 50 || k > 300)) { d.done = 1; w.bossDone(e, true); }
  } else {
    e.a = 3; e.y = d.ey - (k < 72 ? 14 * Math.abs(Math.sin(k * PI / 36)) * (1 - k / 90) : 0);
    if (k === 36 || k === 72) w.fx('sparkle', e.x, e.y + e.r);
    if (!d.done && k >= 90) { d.done = 1; w.bossDone(e, false); }
  }
  return true;
}
function cheerAll(w) {      /* the boss cheers up, so do its leftover minions: each unwinds / calms where it is (no score) */
  for (const o of w.enemies) {
    const D = BB.ENEMY[o.type]; if (o.dead || D.boss || o.type === 'zap' || o.type === 'bush') continue;
    const k = BB.KILLFX[o.type] || 'pop'; o.a = 3; o.dead = true;
    w.fx(k, o.x, o.y, k === 'pop' ? (o.r >= 11 ? 2 : 1) : o.type);
  }
}
function phaseOf(e, a, b) { const f = e.hp / e.maxHp; return f <= b ? 2 : f <= a ? 1 : 0; }
function cough(e, w) { if (e.d.cough) return; e.d.cough = 1; w.fruit(e.x, e.y + e.r * 0.6, 5, 0, -0.8); w.fx('sticker', e.x, e.y + e.r, 'cough!'); }
function bubbleUp(w) { return w.fruit(30 + w.rng() * 180, 334, 12, 0, C.PICK.bubbleVy); }   // a shield bubble rises from below
function bossBubble(e, w) { /* during the fight a shield bubble floats up now and then (EASY more often); HARD: none */
  const n = ++e.d.bb;
  if (HD(w)) return;
  const P = dif(w) === 0 ? 1200 : 1680;
  if (n % P === P >> 1) bubbleUp(w);
}
function drizzle(e, w, n, v) {   /* a row of straight-down drops across the sky with one wide gap */
  const gx = 50 + w.rng() * 140, dx = 200 / (n - 1);
  for (let i = 0; i < n; i++) { const x = 20 + i * dx; if (Math.abs(x - gx) >= 30) w.bullet(x, e.y + 26, sp(w, v), DOWN); }
}
function hands(e, w, v) {   /* Big Clanky's two hands each throw one aimed bolt (HARD: a 3-way fan) */
  for (let s = -1; s <= 1; s += 2) { const hx = e.x + s * 26, hy = e.y + 18; w.fan(hx, hy, 1 + 2 * XN(w), 22 * D2R, sp(w, v), w.ang(hx, hy, w.target(e))); }
}
function zapAll(w) { for (const p of w.players()) { w.zap(p.x, 60, 24); w.fx('sticker', p.x + 16, p.y - 12, '!'); } w.sfx('warning'); w.event('W'); }  // 'W': the guest hears it too

/* 11 BIG CLANKY (stage 1): giant wind-up tin robot. A: fan + hand bolts; B: big rings + hand bolts + tinbots; C: rings + fans + smudges.
   HARD (stage 1 stays learnable): the x0.8 boss clock, aimed fans +2, rings as MEDIUM, hand bolts become 3-fans, and each phase
   adds one pattern, A: a slow ring, B: a narrow aimed fan, C: a small spin of big bolts. */
E.clanky = def({ hp: 520, r: 30, score: 0, boss: true, name: 'Big Clanky',
  init: bossInit,
  tick(e, w) {
    if (ending(e, w) || entering(e, w)) return true;
    const d = e.d, ph = phaseOf(e, 0.66, 0.33), x = HD(w);
    if (ph !== d.ph) { d.ph = ph; d.c = 0; d.rot = 0; }
    bossBubble(e, w);
    d.p += ph === 0 ? 1 : ph === 1 ? 1.3 : 1.6; e.x = 120 + 60 * Math.sin(TAU * d.p / 300);
    const c = d.c++; e.a = ph ? 2 : 0;
    if (ph === 0) {
      const K = bk(w, c, 180);
      if (tk(e, K, 40, 30)) w.fan(e.x, e.y + 22, 5 + 2 * XN(w), (50 + 6 * XN(w)) * D2R, sp(w, 1.05), aim(w, e));
      if (x && tk(e, K, 85, 24)) w.ring(e.x, e.y + 10, 10, sp(w, 0.75), c * 0.37);         // HARD: a slow ring
      if (tk(e, K, 120, 24)) hands(e, w, 1);
      if (past(K, 150) && w.count() < 10) { w.spawn('smudge', e.x - 20, e.y + 26, { pat: 'sineL' }); w.spawn('smudge', e.x + 20, e.y + 26, { pat: 'sineR' }); }
    } else if (ph === 1) {
      const K = bk(w, c, 200);
      if (tk(e, K, 40, 30)) { w.ring(e.x, e.y + 10, 8, sp(w, 0.95), d.rot, true); d.rot += 22.5 * D2R; }
      if (x && tk(e, K, 90, 24)) w.fan(e.x, e.y + 22, 3, 16 * D2R, sp(w, 1.1), aim(w, e));  // HARD: a narrow aimed fan
      if (tk(e, K, 135, 24)) hands(e, w, 1.05);
      if (past(bk(w, c, 400), 170) && w.count('tinbot') < 4) { w.spawn('tinbot', 30, -20); w.spawn('tinbot', 210, -20); }
    } else {
      const K = bk(w, c, 200);
      if (tk(e, K, 30, 26)) { w.ring(e.x, e.y + 10, 8, sp(w, 1), d.rot, true); d.rot += 15 * D2R; }
      if (x && tk(e, K, 75, 20)) hands(e, w, 1.1);                                   // HARD: hand bolts on top
      if (tk(e, K, 115, 24)) w.fan(e.x, e.y + 22, 5 + 2 * XN(w), (56 + 6 * XN(w)) * D2R, sp(w, 1.1), aim(w, e));
      if (past(K, 160) && w.count() < 10) { w.spawn('smudge', 40, -20, { pat: 'sineR' }); w.spawn('smudge', 200, -20, { pat: 'sineL' }); }
      if (x && tk(e, K, 180, 24)) { w.ring(e.x, e.y + 10, 6, sp(w, 0.9), -d.rot, true); }  // HARD: a small spin of big bolts
    }
    return true;
  } }, 'clanky');

/* 12 THUNDERPUFF (stage 2): sulky storm cloud. Zaps: one column per player, a '!' beside each ship.
   A: drizzle + fan + zap; B: fans + zap + drizzle + a slow ring + grumblets; C (cough): faster, denser, rings and 7-fans.
   HARD adds A: a slow ring, B: a narrow aimed fan, C: a second narrow aimed fan. Drizzle +1 drop (it keeps its wide gap). */
E.thunderpuff = def({ hp: 760, r: 34, score: 0, boss: true, name: 'Thunderpuff',
  init: bossInit,
  tick(e, w) {
    if (ending(e, w) || entering(e, w)) return true;
    const d = e.d, ph = phaseOf(e, 0.66, 0.33), x = HD(w), dn = 6 + XN(w);
    if (ph !== d.ph) { d.ph = ph; d.c = 0; d.rot = 0; if (ph === 2) cough(e, w); }
    bossBubble(e, w);
    d.p += ph === 0 ? 1 : ph === 1 ? 1.3 : 1.6; e.x = 120 + 40 * Math.sin(TAU * d.p / 420);
    const c = d.c++; e.a = ph ? 2 : 0;
    if (ph === 0) {
      const K = bk(w, c, 300);
      if (tk(e, K, 30) || tk(e, K, 110)) drizzle(e, w, dn, 0.85);
      if (x && tk(e, K, 150, 24)) w.ring(e.x, e.y + 12, 10, sp(w, 0.75), c * 0.29);          // HARD: a slow ring
      if (tk(e, K, 190, 24)) w.fan(e.x, e.y + 24, 5 + 2 * XN(w), (56 + 4 * XN(w)) * D2R, sp(w), aim(w, e));
      if (tk(e, K, 260, 24)) zapAll(w);
    } else if (ph === 1) {
      const K = bk(w, c, 270);
      if (tk(e, K, 40, 24)) w.fan(e.x, e.y + 24, 5 + 2 * XN(w), (60 + 4 * XN(w)) * D2R, sp(w), aim(w, e));
      if (tk(e, K, 110, 24)) zapAll(w);
      if (tk(e, K, 150)) drizzle(e, w, dn, 0.9);
      if (x && tk(e, K, 185, 24)) w.fan(e.x, e.y + 24, 5, 24 * D2R, sp(w, 1.1), aim(w, e));  // HARD: a narrow aimed fan
      if (tk(e, K, 220, 26)) { w.ring(e.x, e.y + 12, 8 + 2 * XN(w), sp(w, 0.8), d.rot); d.rot += 20 * D2R; }
      if (past(K, 0) && w.count('grumblet') === 0) { w.spawn('grumblet', 40, -20); w.spawn('grumblet', 200, -20); }
    } else {
      const K = bk(w, c, 240);
      if (tk(e, K, 20)) drizzle(e, w, dn + 1, 0.95);
      if (tk(e, K, 70, 24)) w.fan(e.x, e.y + 24, 7 + 2 * XN(w), (70 + 4 * XN(w)) * D2R, sp(w, 1.05), aim(w, e));
      if (tk(e, K, 120, 24)) zapAll(w);
      if (tk(e, K, 170, 26)) { w.ring(e.x, e.y + 12, 10 + 2 * XN(w), sp(w, 0.85), d.rot, true); d.rot += 18 * D2R; }
      if (past(K, 200) && w.count('grumblet') < 2) w.spawn('grumblet', c % 480 < 240 ? 50 : 190, -20);
      if (x && tk(e, K, 225, 20)) w.fan(e.x, e.y + 24, 5, 24 * D2R, sp(w, 1.15), aim(w, e)); // HARD: a second narrow aimed fan
    }
    return true;
  } }, 'thunderpuff');

/* 13 OLD SMOGGINS (stage 3): junk-pile mech with a smokestack hat; grumblets puff out of his chimney.
   A: puffs + a ring + grumblets; B: double smoke spiral + 5-way puffs; C (cough): rings + a short spiral + puffs, jittery.
   HARD adds A: big slow smoke balls, B: a slow ring, C: smoke balls again. Spirals get +1 arm (not +2: they stay dodgeable). */
E.smoggins = def({ hp: 1000, r: 36, score: 0, boss: true, name: 'Old Smoggins',
  init(e, w) { bossInit(e, w); e.d.sa = 0; },
  tick(e, w) {
    if (ending(e, w) || entering(e, w)) return true;
    const d = e.d, ph = phaseOf(e, 0.66, 0.33), x = HD(w);
    if (ph !== d.ph) { d.ph = ph; d.c = 0; if (ph === 2) cough(e, w); }
    bossBubble(e, w);
    d.p += ph === 0 ? 1 : ph === 1 ? 1.25 : 1.5; e.x = 120 + 50 * Math.sin(TAU * d.p / 360) + (ph === 2 ? 6 * Math.sin(d.c * 0.9) : 0);
    const c = d.c++; e.a = ph ? 2 : 0;
    const puff = n => w.fan(e.x, e.y + 26, n + 2 * XN(w), ((n > 3 ? 44 : 24) + 4 * XN(w)) * D2R, sp(w, 0.95), aim(w, e));
    const balls = () => w.fan(e.x, e.y + 26, 3, 40 * D2R, sp(w, 0.75), aim(w, e), true);   // HARD: big slow smoke balls
    const spiral = (arms, v) => { for (let i = 0; i < arms; i++) w.bullet(e.x, e.y + 10, sp(w, v), d.sa + TAU * i / arms, true); d.sa += (arms > 2 ? 11 : 9) * D2R; };
    const f = bf(w), cy = L => (c * f / L | 0);                 // cycle count (ring offsets)
    if (ph === 0) {
      const K = bk(w, c, 230);
      if (tk(e, K, 50, 24) || tk(e, K, 190, 24)) puff(3);
      if (tk(e, K, 120, 30)) w.ring(e.x, e.y + 10, 8 + 2 * XN(w), sp(w, 0.8), cy(230) * 22.5 * D2R);
      if (x && tk(e, K, 160, 20)) balls();
      if (past(bk(w, c, 220), 150) && w.count('grumblet') < 2) w.spawn('grumblet', e.x + (c % 440 < 220 ? -26 : 26), e.y - 20);
    } else if (ph === 1) {
      const K = bk(w, c, 240);
      if (K.k >= 20 && K.k < 140) { if (every(K, 20, 140, 15)) spiral(2 + XN(w), 0.8); }
      else tk(e, K, 20, 20);
      if (x && tk(e, K, 160, 20)) w.ring(e.x, e.y + 10, 12, sp(w, 0.75), d.sa);           // HARD: a slow ring
      if (tk(e, K, 190, 24)) puff(5);
      if (past(bk(w, c, 300), 250) && w.count('grumblet') < 2) w.spawn('grumblet', e.x + (c % 600 < 300 ? -26 : 26), e.y - 20);
    } else {
      const K = bk(w, c, 200);
      if (tk(e, K, 30, 26)) w.ring(e.x, e.y + 10, 8 + 2 * XN(w), sp(w, 0.85), cy(200) * 18 * D2R);
      if (K.k >= 80 && K.k < 140) { if (every(K, 80, 140, 15)) spiral(3 + XN(w), 0.9); }
      else tk(e, K, 80, 20);
      if (tk(e, K, 170, 24)) puff(5);
      if (x && tk(e, K, 196, 20)) balls();
    }
    return true;
  } }, 'smoggins');

/* 14 Grumblet: Smoggins' little smog puff (Thunderpuff borrows them too). One fan, then away. HARD: two 5-way fans (x0.7 apart). */
E.grumblet = def({ hp: 6, r: 10, score: 150,
  init(e, w) { e.d.ty = Math.max(e.y + 24, 92 + w.rng() * 26); e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 200), x = XB(w), K = ck(w, h);
    if (h > 0 && may(e, w) && (tk(e, K, 60, 24) || (x && tk(e, K, 140, 24))))
      w.fan(e.x, e.y + 6, 3 + 2 * XN(w), (28 + 4 * x) * D2R, sp(w, 0.95), aim(w, e));
  } }, 'grumblet');

/* formation clear: every member of a wave of 4+ shot down → 20 % chance (HARD x DIFF.dropMul: 12 %) of a seed packet or a
   strawberry at the last one (stage 1: only a strawberry or a pea / petal packet, see BB.dropKind) */
function formation(e, w) {
  const r = e.d.wv; if (!r || r.bad || ++r.k < r.n) return;
  w.sm.cleared = (w.sm.cleared | 0) + 1;
  if (w.rng() < 0.2 * DM(w)) w.fruit(e.x, e.y, BB.dropKind(w, 'wave'), 0, -1);
}
for (const t in E) {
  const D = E[t]; if (D.boss || t === 'zap' || t === 'bush' || t === 'present') continue;
  const od = D.onDeath; D.onDeath = od ? function (e, w) { od(e, w); formation(e, w); } : formation;
}

/* ---------- random drops (SPEC2 F) ---------- */
/* packet types unlock by stage: 1 pea + petal, 2 + sunbeam, 3 + seekers. Bushes: mostly Sunberries early in stage 1; power fruit
   and packets get likelier through each stage and from stage to stage. v3 (SPEC3 1): upgrades come later: NO starfruit in
   stage 1, then about 1.5 % / 3 % of bushes; stage-1 packets about half the v2 rate; on HARD every packet / starfruit /
   strawberry chance x DIFF.dropMul (0.6), and the blueberry (shield) too. BB.C.POWER_CAP (world) stops early overpowering. */
const PACKS = [[8, 9], [8, 9, 10], [8, 9, 10, 11]], STAR = [0, 0.015, 0.03];
const DM = w => { const m = DF(w).dropMul; return m >= 0 && m <= 1 ? m : 1; };
BB.dropKind = function (w, src) {
  const st = Math.max(0, Math.min(2, w.stage | 0)), A = PACKS[st], m = DM(w);
  const pack = () => A[Math.min(A.length - 1, Math.floor(w.rng() * A.length))];
  if (src === 'wave') return w.rng() < 0.6 ? pack() : 3;
  const p = prog(w);
  let q = w.rng();
  if ((q -= STAR[st] * m) < 0) return 7;                                         // never in stage 1 (q >= 0)
  if ((q -= (st ? 0.06 + 0.05 * st + 0.10 * p : 0.03 + 0.05 * p) * m) < 0) return pack();
  if ((q -= (0.06 + 0.03 * st + 0.08 * p) * m) < 0) return 3;                   // strawberry: +POWER
  if ((q -= (0.05 + 0.02 * st + 0.04 * p) * m) < 0) return 1;  // blueberry: shield (3 layers; HARD x dropMul too: shields decide risk)
  if ((q -= 0.04 + 0.02 * st + 0.04 * p) < 0) return 2;     // grapes: buddy
  if ((q -= 0.04 + 0.01 * st + 0.03 * p) < 0) return 4;     // kiwi: zoom
  return 0;                                                 // sunberry (78 % at the start of stage 1, ~19 % at the end of stage 3)
};

/* ---------- stage timelines: [sec, type, pattern, n, x, gapTicks, flag] ----------
   v1 times x0.8 plus extra waves; bigger formations. flag 'H': HARD only, 'E': EASY only, 'N': not on HARD (v3: HARD gets
   2 shield bubbles per stage, MEDIUM 4, EASY 7, and 6 fewer Berry Bushes: juggled Sunberries ripen into 3-layer shields).
   type 'bubble' (pattern 'rise'): a shield bubble rising from below the screen (x null = random). */
BB.STAGES = [
  { name: 'Patchwork Meadows', bg: 'meadow', music: 'stage', boss: 'clanky', bossAt: 120, waves: [
    [1.5, 'bush', 'drop', 1, 120], [4, 'smudge', 'sineR', 5, 60, 16], [8, 'smudge', 'sineL', 5, 180, 16], [10.5, 'bush', 'drop', 1, 170, 0, 'N'],
    [13, 'tinbot', 'row', 3], [17, 'bush', 'drop', 1, 70], [19, 'glider', 'row', 6],
    [21, 'bubble', 'rise', 1, null, 0, 'N'], [22.5, 'vent', 'ground', 2, 120], [25, 'tinbot', 'col', 3, 60, 40], [25.5, 'bush', 'drop', 1, 120, 0, 'N'],
    [27, 'tinbot', 'col', 3, 180, 40], [31, 'grumble', 'hover', 1, 120], [32, 'bubble', 'rise', 1, null, 0, 'E'],
    [33, 'glider', 'row', 6, 0, 0, 'H'], [34.5, 'bush', 'drop', 1, 170], [37, 'smudge', 'swoopL', 6, 0, 12], [41, 'smudge', 'swoopR', 6, 0, 12],
    [43, 'bush', 'drop', 1, 60, 0, 'N'], [44, 'bubble', 'rise', 1], [45, 'tinbot', 'row', 5], [46.5, 'vent', 'ground', 3, 120],
    [48, 'glider', 'col', 5, 180, 18], [49, 'present', 'ground', 1, 204], [51, 'grumble', 'hover', 2, 120], [55, 'bush', 'drop', 2, 120, 60],
    [58.5, 'boinger', 'ground', 2, 120], [60, 'tinbot', 'row', 4, 0, 0, 'H'], [62.5, 'glider', 'row', 7],
    [65, 'bush', 'drop', 1, 180, 0, 'N'], [66, 'tinbot', 'col', 4, 60, 30], [68, 'smudge', 'sineR', 8, 120, 12], [69, 'bubble', 'rise', 1, null, 0, 'N'],
    [72, 'tinbot', 'row', 5], [74.5, 'bush', 'drop', 1, 60], [76, 'twirlie', 'bounceR', 2, 60, 40], [78.5, 'grumble', 'hover', 1, 70],
    [80, 'smudge', 'sineL', 6, 190, 14], [81, 'bubble', 'rise', 1, null, 0, 'E'], [83, 'bush', 'drop', 1, 170, 0, 'N'], [85, 'vent', 'ground', 3, 140],
    [86.5, 'boinger', 'ground', 1, 50], [88, 'tinbot', 'col', 4, 180, 30], [91, 'glider', 'swoopL', 6, 0, 14], [93, 'glider', 'swoopR', 6, 0, 14],
    [94, 'bubble', 'rise', 1], [96, 'twirlie', 'bounceR', 2, 60, 40, 'H'], [97, 'bush', 'drop', 2, 120, 50], [99, 'grumble', 'hover', 1, 170],
    [102.5, 'glider', 'col', 5, 60, 18], [104, 'grumble', 'hover', 2, 120], [106, 'bubble', 'rise', 1, null, 0, 'E'], [106.5, 'tinbot', 'row', 4],
    [108, 'bush', 'drop', 1, 60, 0, 'N'], [112, 'smudge', 'sineR', 10, 120, 10], [114, 'grumble', 'hover', 1, 60, 0, 'H'],
    [117, 'bush', 'drop', 1, 120],
    /* v3 HARD-only: denser, on top of the waves above */
    [16, 'tinbot', 'col', 3, 180, 40, 'H'], [53, 'glider', 'swoopR', 5, 0, 14, 'H'], [84, 'grumble', 'hover', 1, 60, 0, 'H'], [108.5, 'twirlie', 'bounceL', 2, 180, 40, 'H']] },
  { name: 'Candyfloss Skies', bg: 'sky', music: 'stage', boss: 'thunderpuff', bossAt: 120, waves: [
    [1.5, 'bush', 'drop', 1, 120], [4, 'glider', 'col', 5, 80, 16], [5.5, 'glider', 'col', 5, 160, 16], [9.5, 'twirlie', 'bounceR', 2, 60, 40],
    [11, 'bush', 'drop', 1, 60, 0, 'N'], [13, 'smudge', 'sineL', 6, 180, 12], [16, 'bush', 'drop', 1, 170], [17.5, 'grumble', 'hover', 2, 120],
    [20, 'bubble', 'rise', 1, null, 0, 'N'], [22.5, 'tinbot', 'row', 5], [24, 'bush', 'drop', 1, 120, 0, 'N'],
    [25.5, 'ticktock', 'hover', 1, 120], [27, 'twirlie', 'bounceL', 2, 180, 40, 'H'], [30.5, 'bush', 'drop', 1, 60],
    [32, 'smudge', 'swoopL', 6, 0, 12], [33, 'bubble', 'rise', 1, null, 0, 'E'], [34.5, 'smudge', 'swoopR', 6, 0, 12], [38.5, 'twirlie', 'bounceL', 3, 180, 30],
    [41, 'bush', 'drop', 1, 170, 0, 'N'], [43, 'vent', 'ground', 3, 120], [44, 'bubble', 'rise', 1], [46.5, 'glider', 'row', 7],
    [49.5, 'bush', 'drop', 1, 120], [51, 'grumble', 'hover', 1, 60], [53, 'grumble', 'hover', 1, 180], [55, 'tinbot', 'col', 4, 120, 30],
    [57, 'bush', 'drop', 2, 120, 50], [59, 'grumble', 'hover', 1, 120, 0, 'H'], [61, 'ticktock', 'hover', 2, 120], [64, 'twirlie', 'bounceR', 3, 60, 30],
    [66.5, 'bush', 'drop', 1, 60, 0, 'N'], [67, 'boinger', 'ground', 2, 120], [69, 'smudge', 'sineR', 6, 60, 12], [70, 'bubble', 'rise', 1, null, 0, 'N'],
    [70.5, 'present', 'ground', 1, 36], [73.5, 'tinbot', 'row', 5], [76, 'bush', 'drop', 1, 120], [78, 'glider', 'col', 5, 180, 16],
    [80, 'twirlie', 'bounceR', 4, 60, 30], [82, 'bubble', 'rise', 1, null, 0, 'E'], [83, 'bush', 'drop', 1, 180, 0, 'N'], [84, 'ticktock', 'hover', 1, 60, 0, 'H'],
    [86.5, 'glider', 'swoopL', 7, 0, 12], [88, 'glider', 'swoopR', 7, 0, 12], [93, 'bush', 'drop', 2, 120, 50],
    [95, 'bubble', 'rise', 1], [97, 'tinbot', 'row', 5], [99, 'ticktock', 'hover', 1, 120], [101, 'grumble', 'hover', 2, 120],
    [104, 'tinbot', 'row', 5, 0, 0, 'H'], [105, 'bush', 'drop', 1, 60, 0, 'N'], [107, 'vent', 'ground', 3, 120], [107.5, 'bubble', 'rise', 1, null, 0, 'E'],
    [109, 'smudge', 'sineL', 8, 180, 10], [113.5, 'tinbot', 'row', 4], [117, 'bush', 'drop', 1, 120],
    /* v3 HARD-only */
    [8, 'grumblet', 'hover', 2, 120, 0, 'H'], [19, 'tinbot', 'col', 4, 60, 30, 'H'], [36, 'grumble', 'hover', 1, 120, 0, 'H'], [48, 'twirlie', 'bounceL', 2, 180, 40, 'H'],
    [74.5, 'grumblet', 'hover', 2, 120, 0, 'H'], [91, 'grumble', 'hover', 1, 60, 0, 'H'], [111, 'twirlie', 'bounceR', 2, 60, 40, 'H']] },
  { name: 'The Clatter Works', bg: 'works', music: 'stage', boss: 'smoggins', bossAt: 120, waves: [
    [1.5, 'bush', 'drop', 1, 120], [4, 'tinbot', 'col', 4, 60, 40], [5.5, 'tinbot', 'col', 4, 180, 40], [9, 'bush', 'drop', 1, 120, 0, 'N'],
    [10.5, 'smudge', 'sineR', 6, 80, 12], [13.5, 'boinger', 'ground', 1, 120], [17.5, 'bush', 'drop', 1, 60],
    [19, 'tinbot', 'row', 5], [20, 'bubble', 'rise', 1, null, 0, 'N'], [22, 'grumblet', 'hover', 2, 120], [24, 'glider', 'row', 7],
    [26.5, 'bush', 'drop', 1, 170, 0, 'N'], [27, 'grumblet', 'hover', 2, 120, 0, 'H'], [29, 'twirlie', 'bounceL', 3, 180, 30], [32, 'grumble', 'hover', 2, 120],
    [33, 'bubble', 'rise', 1, null, 0, 'E'], [36, 'bush', 'drop', 1, 180], [38.5, 'vent', 'ground', 3, 120],
    [40, 'boinger', 'ground', 2, 120], [43, 'bubble', 'rise', 1], [44, 'bush', 'drop', 1, 60, 0, 'N'], [45, 'tinbot', 'col', 5, 120, 30],
    [47, 'twirlie', 'bounceR', 3, 60, 30], [49.5, 'ticktock', 'hover', 1, 120], [54.5, 'bush', 'drop', 2, 120, 50],
    [57.5, 'boinger', 'ground', 2, 120], [58, 'glider', 'row', 7, 0, 0, 'H'], [60, 'tinbot', 'row', 5], [62.5, 'smudge', 'swoopL', 6, 0, 12],
    [64, 'smudge', 'swoopR', 6, 0, 12], [67, 'bush', 'drop', 1, 170, 0, 'N'], [67.5, 'bubble', 'rise', 1, null, 0, 'N'], [69, 'tinbot', 'row', 5],
    [70.5, 'glider', 'col', 6, 120, 16], [75, 'bush', 'drop', 1, 120], [77, 'grumble', 'hover', 1, 70], [78.5, 'ticktock', 'hover', 1, 170],
    [80, 'present', 'ground', 1, 200], [80.5, 'bubble', 'rise', 1, null, 0, 'E'], [81, 'tinbot', 'row', 5, 0, 0, 'H'], [83, 'bush', 'drop', 1, 60, 0, 'N'],
    [85, 'tinbot', 'col', 5, 120, 30], [87, 'grumblet', 'hover', 2, 120], [89.5, 'twirlie', 'bounceR', 3, 60, 30], [92, 'bubble', 'rise', 1],
    [94.5, 'bush', 'drop', 2, 120, 50], [101, 'boinger', 'ground', 1, 80],
    [102.5, 'vent', 'ground', 2, 170], [104, 'ticktock', 'hover', 1, 60, 0, 'H'], [104.5, 'bubble', 'rise', 1, null, 0, 'E'], [105, 'bush', 'drop', 1, 60, 0, 'N'],
    [107, 'glider', 'swoopL', 7, 0, 12], [109, 'smudge', 'sineR', 9, 120, 10], [111, 'grumble', 'hover', 1, 120], [112, 'bush', 'drop', 1, 180],
    [113.5, 'tinbot', 'row', 4], [117, 'bush', 'drop', 1, 120],
    /* v3 HARD-only */
    [7, 'grumble', 'hover', 1, 120, 0, 'H'], [15, 'ticktock', 'hover', 1, 60, 0, 'H'], [34, 'tinbot', 'col', 5, 60, 30, 'H'], [51, 'grumblet', 'hover', 2, 120, 0, 'H'],
    [65, 'twirlie', 'bounceL', 3, 180, 30, 'H'], [73, 'grumble', 'hover', 1, 190, 0, 'H'], [97, 'grumblet', 'hover', 2, 120, 0, 'H'], [115, 'twirlie', 'bounceR', 2, 60, 40, 'H']] }
];

/* ---------- wave spawner ---------- */
/* Candyfloss Skies has no ground, so there 'ground' waves stand on the floating islands (their x is ignored). BB.ISLES mirrors
   art.js bakeIslands: [cx, cy, half width] in a 640 px tile that scrolls with the ground (screen y = cy + tick * SCROLL, wrapped). */
const ISLES = BB.ISLES = [[62, 80, 56], [182, 230, 50], [70, 390, 44], [176, 540, 58]], SLOTS = [-0.62, -0.02, 0.85]; // left, middle, past the cottage
const isleY = (i, tick) => ((ISLES[i][1] + tick * C.SCROLL + 60) % 640 + 640) % 640 - 60;   // -60..580
function isleWave(w, type, pat, n) {
  /* the island that soonest sits just above the screen (y -48..-12) with free slots; up to 3 toys per island */
  const u = w.sm.isles || (w.sm.isles = {});
  let at = 0, i = -1, lap = 0;
  for (let j = 0; j < ISLES.length; j++) {
    const y = isleY(j, w.tick), dt = y >= -48 && y <= -12 ? 0 : Math.ceil(((y < -48 ? -40 : 600) - y) / C.SCROLL), L = Math.floor((ISLES[j][1] + (w.tick + dt) * C.SCROLL + 60) / 640);
    if ((u[j + ':' + L] | 0) + Math.min(n, 3) <= 3 && (i < 0 || dt < at)) { at = dt; i = j; lap = L; }
  }
  if (i < 0) return;
  const key = i + ':' + lap, s0 = u[key] | 0; u[key] = Math.min(3, s0 + n);
  w.later(at, () => {
    if (w.ph) return;                                 // the boss warning came first
    const [cx, , hw] = ISLES[i], y = isleY(i, w.tick) - C.SCROLL - BB.ENEMY[type].r + 2;   // feet on the grass; the world adds this tick's scroll next
    for (let k = 0; k < Math.min(n, 3 - s0); k++) w.spawn(type, Math.max(14, Math.min(226, cx + SLOTS[s0 + k] * hw)), y, { pat, idx: k });
  });
}
BB.spawnWave = function (w, wave) {
  const type = wave[1], pat = wave[2], n = wave[3] || 1, gap = wave[5] || 12, fl = wave[6];
  if ((fl === 'H' && !XB(w)) || (fl === 'E' && dif(w) !== 0) || (fl === 'N' && HD(w))) return;   // HARD + MEDIUM extras / EASY-only / not-HARD waves
  if (type === 'bubble') { for (let i = 0; i < n; i++) w.later(gap * i, () => { if (wave[4] == null) bubbleUp(w); else w.fruit(wave[4], 334, 12, 0, C.PICK.bubbleVy); }); return; }
  const x0 = wave[4] == null ? 120 : wave[4];
  if (type === 'bush' || type === 'cloud' || pat === 'drop') { for (let i = 0; i < n; i++) w.later(gap * i, () => w.bush(x0, -20)); return; }
  if (pat === 'ground' && (BB.STAGES[w.stage] || {}).bg === 'sky') return isleWave(w, type, pat, n);
  const rec = n >= 4 ? { n, k: 0 } : null;                                       // a formation: drop on a full clear (see formation)
  for (let i = 0; i < n; i++) {
    let x = x0, dly = gap * i;
    if (pat === 'row') { x = n > 1 ? 40 + 160 * i / (n - 1) : 120; dly = 0; }
    else if (pat === 'hover') { x = x0 + 80 * (i - (n - 1) / 2); dly = 0; }
    else if (pat === 'ground') { x = x0 + 50 * (i - (n - 1) / 2); dly = 0; }
    w.later(dly, () => { const e = w.spawn(type, x, -20, { pat, idx: i }); if (e && rec) e.d.wv = rec; else if (rec) rec.bad = 1; });   // one missing (enemy cap): no clear drop
  }
};
})();
