/* Berry Breeze — content.js
   HEADER (lead, frozen): constants, type list, fruit table, seeded RNG. Do not change above the marker.
   BELOW THE MARKER (content engineer): BB.ENEMY definitions and behaviours, BB.STAGES timelines, BB.spawnWave.
   See /private/tmp/breeze/SPEC.md sections 1 and 3 for the rules every definition must follow. */
'use strict';
window.BB = window.BB || {};
BB.C = {
  W: 240, H: 320, TICK: 1000 / 60, SCROLL: 0.4, PROTO: 4,
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
    downTicks: 180, downRise: 0.2, downYMin: 120, reviveHp: 3, reviveR: 22, outTicks: 3600,   /* v4: an OUT (resting) ship comes back after 60 s */
    start: { solo: [120, 280], p1: [90, 280], p2: [150, 280] }
  },
  FRUIT: { g: 0.03, vMax: 0.5, drag: 0.98, bumpV: -1.5, bumpVX: 0.04, bumpVXMax: 0.6, hitsPer: 3, hitsTeam: 2,
           r: 9, ceil: 36, wallL: 10, wallR: 230, yOut: 330, sunPts: 300, maxPts: 500, heartPts: 200,
           basketEvery: 5, basketPts: 1000 },
  BUSH: { hp: 4, r: 12, score: 30, vy: 0.5, sway: 6, swayT: 180, popVy: -1.2 },
  BOSS: { coopHp: 1.5, enterTicks: 120, enterY: 72, tiredTicks: 5400, bonus: 5000, tiredBonus: 1000 },
  KIND: { mul: 0.95, min: 0.85, dropOuterAt: 2 },
  TALLY: { heart: 300, noBubble: 3000, ticks: 300 },
  STAGE: { bannerTicks: 120, warnTicks: 180, bossAt: 100 },
  /* v2: difficulty (EASY = MEDIUM's enemies with more health; HARD = faster bullets, tougher toys, extra bullets, no kind assist) */
  /* v3: HARD is a real challenge: 3 hearts, 3 lives then GAME OVER, fast dense bullets, tough toys, short invulnerability.
     MEDIUM keeps v2's enemies (only the later upgrades change it); shield = most shield layers a ship can hold (a Blueberry fills
     it, a bubble adds one): EASY 3, MEDIUM 1, HARD 1 */
  DIFF: [{ id: 'easy', name: 'EASY', hp: 8, heal: 3, reviveHp: 4, bMul: 1, eHp: 1, extra: 0, kind: true, lives: 0, invHit: 90, safeR: 40, superTicks: 720, dropMul: 1, shield: 3, weaponTicks: 1500, coopHp: 1, coopFire: 1, coopBoss: 1.5 },
         { id: 'medium', name: 'MEDIUM', hp: 5, heal: 2, reviveHp: 3, bMul: 1.2, eHp: 1.25, extra: 0, kind: true, lives: 0, invHit: 90, safeR: 40, superTicks: 600, dropMul: 0.85, shield: 1, weaponTicks: 900, powerCap: [2, 3, 3], coopHp: 1.3, coopFire: 0.85, coopBoss: 1.9 },
         { id: 'hard', name: 'HARD', hp: 3, heal: 1, reviveHp: 3, bMul: 1.45, eHp: 1.75, extra: 2, kind: false, lives: 3, invHit: 60, safeR: 26, superTicks: 420, dropMul: 0.6, shield: 1, weaponTicks: 900, coopHp: 1, coopFire: 1, coopBoss: 1.5 }],
  /* v7 (Josh: MEDIUM two-player too easy, guns a bit OP; HARD and EASY unchanged): MEDIUM weaponTicks 1200 → 900 (15 s),
     dropMul 1 → 0.85 (packets, starfruit, strawberries, blueberries a bit rarer; boss-fight help unchanged), powerCap [2, 3, 3].
     Co-op (two ships in play): coopHp = toy hp x (spawned while both fly), coopFire = toys' and bosses' fire intervals x
     (0.85: about 18 % more shots), coopBoss = boss hp x (was BOSS.coopHp 1.5 for every difficulty; MEDIUM 1.9). */
  /* v3: weapon power is capped per stage, so the big upgrades come later (stage 1: power 2, stage 2: 3, stage 3: 4);
     v7: a DIFF row's powerCap overrides it (MEDIUM [2, 3, 3]); read it through BB.powerCap(diff, stage) */
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
/* v7: the power cap for a difficulty (0-2) and stage (0-2): DIFF[d].powerCap if it has one, else C.POWER_CAP (world, guest, content) */
BB.powerCap = function (d, st) {
  const C = BB.C, D = C.DIFF[d] || C.DIFF[1], P = Array.isArray(D.powerCap) ? D.powerCap : C.POWER_CAP, M = C.SHIP.powerMax || 4;
  return P ? Math.max(0, Math.min(M, P[Math.max(0, Math.min(P.length - 1, st | 0))] | 0)) : M;
};
/* Enemies, bosses, stage timelines, the wave spawner and the random drop tables. Host-only simulation: everything random
   comes from w.rng(). 'a' byte: 0 idle, 1 telegraph (always ~20+ ticks before a shot), 2 alt (key spinning / live zap /
   phase B), 3 defeated. v2 (SPEC2): busier waves that ramp through each stage, HARD extras (DIFF.extra), 3-phase bosses,
   BB.dropKind, formation-clear drops and shield bubbles. v3 (SPEC3): later upgrades (no starfruit in stage 1, rarer packets,
   DIFF.dropMul), HARD fires about x0.7 as often (a faster cadence clock), aims from the start, extra HARD-only waves and one
   extra pattern per boss phase. v4 (SPEC4): stages reach the boss at 100 s (wave times x100/120), MEDIUM toys fire x0.9 as
   often (and stage 1 aims sooner), HARD toys x0.66 with more aimed fire (every glider, twice from stage 2; tinbots 3-4 shots;
   an aimed bolt from twirlies and a fan from tick-tocks instead of their biggest rings), one or two more HARD-only waves per
   stage (they leave 3 enemy slots free), so the waves are a danger of their own. Bosses: HARD clock x0.85 (v3 0.8).
   v6: boss-fight help (bossHelp: seed packets / strawberries from the sides every 15-20 s, HARD 19-25 s, sooner while nobody has
   an upgrade, one out of the boss at each phase break; a HARD shield bubble at 40 s), HARD Big Clanky x0.9 hp, a tired float-away
   says so (w.toast). MEDIUM a bit harder: cadence x0.8, boss clock x0.93 with HARD's extra pattern in phases B and C, the aimed
   HARD extras (double taps, twirlie bolt, tick-tock fan, +1 grumble / grumblet / boinger), 'M' waves and one bubble fewer. */
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
const MH = w => dif(w) > 0;                                // v4: MEDIUM and HARD (MEDIUM's stage 1 starts aiming and shooting sooner)
const XM = w => MH(w) ? 1 : 0;                             // v6: MEDIUM gets the aimed HARD extras too (double taps, the twirlie bolt, the tick-tock fan)
const prog = w => Math.min(1, w.tick / (((BB.STAGES[w.stage] || {}).bossAt || C.STAGE.bossAt) * 60));   // 0..1 through the stage
const aimOn = w => w.stage > 0 || XB(w) > 0 || prog(w) > (MH(w) ? 0.2 : 0.4);   // stage 1 fires straight down at first, aims later (MEDIUM sooner, HARD from the start)
/* telegraph helper: a = 1 for `len` ticks before `at`; true on the shot tick */
function tele(e, c, at, len) { if (c >= at - (len || 20) && c < at) e.a = 1; return c === at; }
/* tele, plus on HARD (v6: and MEDIUM) a second shot 10 ticks later (a double tap) */
function tele2(e, w, c, at) { return tele(e, c, at) || (XM(w) > 0 && c === at + 10); }   /* v6: MEDIUM too */
/* the toys' cadence clock: it runs 1/k as fast, so every interval is xk (v6: EASY 1, MEDIUM 0.8 (v4 0.9), HARD 0.66; v3 HARD 0.7).
   ck(w, c, L) → {k now, p last tick, f}, both mod L. tk() is tele() on that clock: the shot fires on the tick the clock passes
   `at`, the telegraph keeps its real length (len x f clock units). With f = 1 (EASY) it is exactly tele(e, c % L, at, len). */
/* v7: two ships in play (w.coopOn: co-op and the partner not away) → every interval x DIFF.coopFire (MEDIUM 0.85; EASY / HARD 1) */
const CO = w => !!w.coop && (typeof w.coopOn === 'function' ? w.coopOn() : true);
/* latched per stage and again when the boss arrives (the field is clear then): read live, a partner leaving or joining jumped every
   toy's fire clock and some shots came with almost no warning */
const CFIRE = w => { const s = w.sm, key = s.boss || null; if (s.cfL == null || s.cfKey !== key) { const f = DF(w).coopFire; s.cfKey = key; s.cfL = CO(w) && f > 0.5 && f < 1 ? 1 / f : 1; } return s.cfL; };
const CADF = [1, 1 / 0.8, 1 / 0.66], cf = w => (w.sm.boss && dif(w) === 2 ? 1 / 0.7 : CADF[dif(w)] || 1) * CFIRE(w);   // HARD boss minions keep v3's x0.7
function ck(w, c, L, f) { f = f || cf(w); L = L || 1e9; return { k: c * f % L, p: (c - 1) * f % L, f }; }
/* bosses: x0.85 on HARD (v3 0.8: v4's faster bullets and tougher bosses carry the boss danger; the toys' clock is x0.66) */
const BCAD = 1 / 0.85, bf = w => (dif(w) === 1 ? 1 / 0.93 : 1 + (BCAD - 1) * XB(w) / 2) * CFIRE(w), bk = (w, c, L) => ck(w, c, L, bf(w));   /* v6: MEDIUM x0.93; v7: x coopFire */
const past = (K, at) => K.p < K.k ? K.p < at && at <= K.k : K.p < at || at <= K.k;
function tk(e, K, at, len) { if (K.k >= at - (len || 20) * K.f && K.k < at) e.a = 1; return past(K, at); }
/* fires on every `step` from a up to b (a smoke spiral): the clock passed a + i*step */
function every(K, a, b, step) { if (K.k < a || K.k >= b) return false; const m = a + Math.floor((K.k - a) / step) * step; return K.p < m || K.p > K.k; }
const per = (w, P) => Math.round(P / cf(w));                // a fire period on the difficulty's cadence
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
   stage 1 only the lead plane after the first third (MEDIUM: every 3rd plane from the start), then every 3rd plane. HARD: every plane; from stage 2 (v4) a second aimed shot lower down. */
E.glider = def({ hp: 1, r: 6, score: 60,
  init(e, w) {
    e.d.x0 = e.x; if (e.pat === 'swoopL' || e.pat === 'swoopR') swoopInit(e, e.pat === 'swoopL');
    const x = XB(w), g = w.stage === 0 ? (x ? 3 - x : MH(w) ? 3 : prog(w) > 0.3 ? 4 : 0) : Math.max(1, 3 - Math.max(x, XM(w)));   // v6: MEDIUM every 2nd plane from stage 2
    e.d.gun = g > 0 && (e.idx | 0) % g === 0;
  },
  tick(e, w) {
    const t = w.T(e); e.a = 0;
    if (e.pat === 'swoopL' || e.pat === 'swoopR') swoop(e, t, 240);
    else { e.y += e.pat === 'col' ? 1.1 : 1; e.x = e.d.x0 + 4 * Math.sin(TAU * t / 80); }
    if (e.d.gun && !e.d.shot && may(e, w)) {
      if (e.y >= 70) e.a = 1;
      if (e.y >= 92) { e.d.shot = 1; w.bullet(e.x, e.y + 4, sp(w), aim(w, e)); }
    } else if (e.d.shot === 1 && XN(w) && w.stage > 0 && may(e, w)) {   // HARD from stage 2: a second aimed shot at y 150
      if (e.y >= 128) e.a = 1;
      if (e.y >= 150) { e.d.shot = 2; w.bullet(e.x, e.y + 4, sp(w), aim(w, e)); }
    }
  } }, 'glider');

/* 2 Tinbot (Clanker): wind-up tin walker. Stage 1 fires straight down (aimed later in the stage); a second shot late in
   stage 1 (MEDIUM: all through it) and from stage 2 on; HARD: the first shot is a double tap, aimed from the start, then two more every 73 ticks (110 x0.66),
   and from stage 2 (not in boss fights) a third. Spawned at y -20: the first shot is at y 50, the HARD last one at y 155 / 206. */
E.tinbot = def({ hp: 4, r: 9, score: 100,
  init(e, w) { e.d.x0 = e.x; },
  tick(e, w) {
    const t = w.T(e), st = w.stage; e.a = 0;
    e.y += 0.7; e.x = e.d.x0 + 10 * Math.sin(TAU * t / 90);
    const x = XN(w), P = per(w, 110);
    if (may(e, w) && (tele2(e, w, t, 100) || ((st > 0 || MH(w) || prog(w) > 0.75) && tele(e, t, x ? 100 + P : 210)) || (x && (tele(e, t, 100 + 2 * P) || (st > 0 && !w.sm.boss && tele(e, t, 100 + 3 * P))))))
      w.bullet(e.x, e.y + 8, sp(w), aimOn(w) ? aim(w, e) : DOWN);
  } }, 'tinbot');

/* 3 Grumble Cloud: hovers; two 3-way fans in stage 1 (straight down, aimed later; a third late in the stage), two 5-way
   aimed fans from stage 2 on. HARD: +4 bullets per fan (a little wider), cadence x0.66 and one more fan in the hover. */
E.grumble = def({ hp: 10, r: 12, score: 250,
  init(e, w) { e.d.ty = 56 + w.rng() * 30; e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 240);
    if (h <= 0 || !may(e, w)) return;
    const st = w.stage, three = st === 0 && prog(w) > 0.7, K = ck(w, h), x = Math.max(XB(w), XM(w));   // v6: MEDIUM as x 1
    if (three ? tk(e, K, 60, 30) || tk(e, K, 140, 30) || tk(e, K, 220, 24) || (x && tk(e, K, 300, 24))
              : tk(e, K, 70, 30) || tk(e, K, 170, 30) || (x && tk(e, K, 270, 24)))
      w.fan(e.x, e.y + 8, (st ? 5 : 3) + 2 * x, ((st ? 44 : 30) + 6 * x) * D2R, sp(w), aimOn(w) ? aim(w, e) : DOWN);
  } }, 'grumble');

/* 4 Twirlie: spinning top that bounces between the walls; one ring of 6 (stage 3: 8). HARD: +2 per ring, a second ring 84 ticks
   later and (v4) an aimed bolt between the two (fewer ring bullets, more aimed ones) */
E.twirlie = def({ hp: 6, r: 9, score: 150,
  init(e, w) { e.vx = e.pat === 'bounceL' ? -1 : 1; e.vy = 0.8; e.d.off = w.rng() * 60 * D2R; },
  tick(e, w) {
    const t = w.T(e); e.a = t > 300 ? 2 : 0;
    e.x += e.vx; e.y += e.vy;
    if (t < 300) { if (e.x < 12) { e.x = 12; e.vx = 1; } else if (e.x > 228) { e.x = 228; e.vx = -1; } }
    else e.vy = 1.3;
    if (!may(e, w)) return;
    const n = (w.stage === 2 ? 8 : 6) + 2 * XN(w);
    if (tele(e, t, 120)) w.ring(e.x, e.y, n, sp(w, 0.95), e.d.off);
    else if (XM(w) && tele(e, t, 162)) w.bullet(e.x, e.y + 6, sp(w, 1.05), aim(w, e));   // v6: MEDIUM too
    else if (XN(w) && tele(e, t, 204)) w.ring(e.x, e.y, n, sp(w, 0.95), e.d.off + PI / n);
  } }, 'twirlie');

/* 5 Boinger: jack-in-the-box on the ground (no contact). a=1 lid rattles, a=2 head popped up. 1 shot per pop in stage 1, then 2.
   HARD: +2 shots (max 3 in stage 1, 4 later) and pops x0.66 as often (MEDIUM x0.9). */
E.boinger = def({ hp: 8, r: 10, score: 200, ground: true, contact: false,
  tick(e, w) {
    const t = w.T(e), st = w.stage, P = per(w, st === 0 ? 180 : st === 1 ? 140 : 130), c = (t - 60 + P * 4) % P, n = Math.min(st ? 4 : 3, (st ? 2 : 1) + Math.max(XB(w), XM(w))); e.a = 0;   // v6: MEDIUM +1 shot
    if (t < 40 || !may(e, w)) return;
    if (c >= P - 20) e.a = 1; else if (c < 12 * n + 14) e.a = 2;
    if (c < 12 * n && c % 12 === 0) w.bullet(e.x, e.y - 6, sp(w, 1.05), aim(w, e));
  } }, 'boinger');

/* 6 Smog Vent: chimney pot on the ground. Quiet in early stage 1 (EASY only). Cleaning it leaves a flower pot; every 2nd one gives a Heart Peach. */
E.vent = def({ hp: 6, r: 9, score: 150, ground: true, contact: false,
  tick(e, w) {
    const t = w.T(e), st = w.stage; e.a = (t >> 5) & 1 ? 2 : 0;    // alternate puff frames
    if ((st > 0 || MH(w) || prog(w) > 0.5) && t >= 40 && may(e, w)) {
      const P = per(w, st === 0 ? 200 : st === 1 ? 160 : 140), c = (t - 60 + P * 4) % P, x = XB(w);
      if (c >= P - 20) e.a = 1;
      if (c === 0 || ((x || XM(w)) && c === 10) || (x > 1 && st > 0 && c === 20)) w.bullet(e.x, e.y - 6, sp(w, 0.9), aim(w, e));   // HARD: a double tap (triple from stage 2), x0.66 period
    }
  },
  onDeath(e, w) {
    w.fx('pot', e.x, e.y);
    w.sm.vents = (w.sm.vents | 0) + 1;
    if (w.sm.vents % (HD(w) && w.stage ? 4 : 2) === 0) w.fruit(e.x, e.y - 4, 5, 0, -1);   // a Heart Peach from every 2nd pot (HARD from stage 2: every 4th)
  } }, 'vent');

/* 7 Tick-Tock: alarm clock, hovers, rings twice (8 bullets, second ring offset; stage 3: a third ring) then leaves.
   HARD: +2 per ring, cadence x0.66, one more ring in the hover and (v4) an aimed 5-fan between the last two rings. */
E.ticktock = def({ hp: 14, r: 11, score: 300,
  init(e, w) { e.d.ty = 64 + w.rng() * 16; e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 240);
    if (h <= 0 || !may(e, w)) return;
    const n = 8 + 2 * XN(w), K = ck(w, h);
    if (tk(e, K, 60, 40)) w.ring(e.x, e.y, n, sp(w, 0.9), 0);
    else if (w.stage === 2 && tk(e, K, 125, 30)) w.ring(e.x, e.y, n, sp(w, 0.9), PI / n * 0.5);
    else if (tk(e, K, 190, 40)) w.ring(e.x, e.y, n, sp(w, 0.9), PI / n);
    else if (XM(w) && tk(e, K, 255, 30)) w.fan(e.x, e.y + 8, 5, 30 * D2R, sp(w), aim(w, e));   // v6: MEDIUM too
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
   v6: MEDIUM bosses add HARD's extra pattern in phases B and C (not A), on a x0.93 clock.
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
  if (d.dt == null) {
    d.dt = 0; d.ey = e.y;
    if (d.tired) { w.fx('sticker', e.x, e.y - e.r - 6, 'Zzz...'); const m = (BB.ENEMY[e.type].name || 'The boss') + ' got sleepy'; if (w.toast) w.toast(m, 140, 104); else w.fx('sticker', 120, 104, m); }   /* v6: not a win */
    else cheerAll(w);
  }
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
function bossBubble(e, w) { /* during the fight a shield bubble floats up now and then (EASY more often); v6: HARD one at 40 s, then every 45 s */
  const n = ++e.d.bb;
  if (HD(w)) { if (n % 2700 === 2400) bubbleUp(w); }
  else { const P = dif(w) === 0 ? 1200 : 1680; if (n % P === P >> 1) bubbleUp(w); }
  bossHelp(e, w);
}
/* v6 (Josh: weapon upgrades to grab during the boss fight). Every 15-20 s (HARD 19-25 s) a seed packet (now and then a
   strawberry) glides in from a side of the sky; within 8 s while no ship has any upgrade; and the boss shakes one out of
   itself when a phase breaks (66 % / 33 %). Below the stage's power cap: +1 power (pea packet / strawberry, never past the cap,
   see Ship.maxed); at the cap: a timed weapon packet of this stage (the same type refills its timer). Host-only, w.rng(). */
const HELP = [[900, 1200], [900, 1200], [1140, 1500]];
function helpNeed(w) {   /* 0: every ship at the cap, 1: someone below it, 2: nobody has any upgrade (power 0, pea) */
  const cap = BB.powerCap(dif(w), w.stage);   /* v7: the difficulty's cap (MEDIUM stage 3: 3) */
  let n = 0, low = false, none = true;
  for (const s of w.ships || []) {
    if (!s || s.spread == null || s.out || s.away) continue; n++;
    if ((s.spread | 0) < cap) low = true;
    if ((s.spread | 0) > 0 || (s.wt | 0) > 0 || s.superT > 0) none = false;
  }
  return !n ? 1 : none ? 2 : low ? 1 : 0;
}
function helpKind(w, need, side) {
  const A = PACKS[Math.max(0, Math.min(2, w.stage | 0))], T = A.filter(k => k !== 8);
  if (need === 0) return T[Math.min(T.length - 1, Math.floor(w.rng() * T.length))];   /* at the cap: a timed weapon */
  return side && w.rng() < 0.3 ? 3 : 8;                                             /* +1 power: a pea packet (never juggled), sometimes a strawberry */
}
function helpGap(w) { const H = HELP[dif(w)] || HELP[1]; return H[0] + Math.floor(w.rng() * (H[1] - H[0])); }
function bossHelp(e, w) {
  const d = e.d, c = d.hc = (d.hc | 0) + 1;
  if (d.hn == null) { d.hn = helpGap(w); d.hph = 0; }
  const need = helpNeed(w);
  if (need === 2 && d.hn - c > 480) d.hn = c + 480;                                  /* nobody has anything: help comes sooner */
  const ph = phaseOf(e, 0.66, 0.33);
  if (ph > d.hph) {                                                                  /* a phase broke: one shakes out of the boss */
    d.hph = ph;
    if (w.fruit(e.x + (w.rng() * 2 - 1) * 12, e.y + e.r * 0.5, helpKind(w, need, false), (w.rng() * 2 - 1) * 0.8, -1.2)) { w.fx('sparkle', e.x, e.y + e.r * 0.5); d.hn = Math.max(d.hn, c + (helpGap(w) >> 1)); }
  }
  if (c < d.hn) return;
  const L = w.rng() < 0.5, x = L ? 12 : 228, y = 150 + w.rng() * 60, k = helpKind(w, need, true);
  if (w.fruit(x, y, k, L ? 2.2 : -2.2, k === 3 ? -0.6 : 0)) { w.fx('sparkle', x, y); d.hn = c + helpGap(w); }
  else d.hn = c + 60;                                                                /* no room for it yet: try again in a second */
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
const CLANKY_HARD = 0.9;   /* v6: HARD Big Clanky has x0.9 of the HARD hp (x1.575 instead of DIFF.eHp 1.75: 819 solo) */
E.clanky = def({ hp: 520, r: 30, score: 0, boss: true, name: 'Big Clanky',
  init(e, w) { if (HD(w)) { e.hp = e.maxHp = Math.max(1, Math.round(e.maxHp * CLANKY_HARD)); } bossInit(e, w); },
  tick(e, w) {
    if (ending(e, w) || entering(e, w)) return true;
    const d = e.d, ph = phaseOf(e, 0.66, 0.33), x = HD(w) || (dif(w) === 1 && ph > 0);
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
    const d = e.d, ph = phaseOf(e, 0.66, 0.33), x = HD(w) || (dif(w) === 1 && ph > 0), dn = 6 + XN(w);
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
    const d = e.d, ph = phaseOf(e, 0.66, 0.33), x = HD(w) || (dif(w) === 1 && ph > 0);
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

/* 14 Grumblet: Smoggins' little smog puff (Thunderpuff borrows them too). One fan, then away. HARD: two 5-way fans (x0.66 apart). */
E.grumblet = def({ hp: 6, r: 10, score: 150,
  init(e, w) { e.d.ty = Math.max(e.y + 24, 92 + w.rng() * 26); e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 200), x = Math.max(XB(w), XM(w)), K = ck(w, h);   // v6: MEDIUM as x 1
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
   v1 times x0.8 plus extra waves; bigger formations; v4: every time x100/120 (rounded to 0.5 s), boss at 100 s. flag 'H': HARD only, 'M' (v6): MEDIUM and HARD
   (the four v2 extras of each stage), 'E': EASY only, 'N': not on HARD (v3: HARD gets
   2 shield bubbles per stage, MEDIUM 4 (v6: 3), EASY 7, and 6 fewer Berry Bushes: juggled Sunberries ripen into 3-layer shields).
   type 'bubble' (pattern 'rise'): a shield bubble rising from below the screen (x null = random). */
BB.STAGES = [
  { name: 'Patchwork Meadows', bg: 'meadow', music: 'stage', boss: 'clanky', bossAt: 100, waves: [
    [1.5, 'bush', 'drop', 1, 120], [3.5, 'smudge', 'sineR', 5, 60, 16], [6.5, 'smudge', 'sineL', 5, 180, 16], [9, 'bush', 'drop', 1, 170, 0, 'N'],
    [11, 'tinbot', 'row', 3], [14, 'bush', 'drop', 1, 70], [16, 'glider', 'row', 6],
    [17.5, 'bubble', 'rise', 1, null, 0, 'N'], [19, 'vent', 'ground', 2, 120], [21, 'tinbot', 'col', 3, 60, 40], [21.5, 'bush', 'drop', 1, 120, 0, 'N'],
    [22.5, 'tinbot', 'col', 3, 180, 40], [26, 'grumble', 'hover', 1, 120], [26.5, 'bubble', 'rise', 1, null, 0, 'E'],
    [27.5, 'glider', 'row', 6, 0, 0, 'M'], [29, 'bush', 'drop', 1, 170], [31, 'smudge', 'swoopL', 6, 0, 12], [34, 'smudge', 'swoopR', 6, 0, 12],
    [36, 'bush', 'drop', 1, 60, 0, 'N'], [36.5, 'bubble', 'rise', 1], [37.5, 'tinbot', 'row', 5], [39, 'vent', 'ground', 3, 120],
    [40, 'glider', 'col', 5, 180, 18], [41, 'present', 'ground', 1, 204], [42.5, 'grumble', 'hover', 2, 120], [46, 'bush', 'drop', 2, 120, 60],
    [49, 'boinger', 'ground', 2, 120], [50, 'tinbot', 'row', 4, 0, 0, 'M'], [52, 'glider', 'row', 7],
    [54, 'bush', 'drop', 1, 180, 0, 'N'], [55, 'tinbot', 'col', 4, 60, 30], [56.5, 'smudge', 'sineR', 8, 120, 12], [57.5, 'bubble', 'rise', 1, null, 0, 'E'],
    [60, 'tinbot', 'row', 5], [62, 'bush', 'drop', 1, 60], [63.5, 'twirlie', 'bounceR', 2, 60, 40], [65.5, 'grumble', 'hover', 1, 70],
    [66.5, 'smudge', 'sineL', 6, 190, 14], [67.5, 'bubble', 'rise', 1, null, 0, 'E'], [69, 'bush', 'drop', 1, 170, 0, 'N'], [71, 'vent', 'ground', 3, 140],
    [72, 'boinger', 'ground', 1, 50], [73.5, 'tinbot', 'col', 4, 180, 30], [76, 'glider', 'swoopL', 6, 0, 14], [77.5, 'glider', 'swoopR', 6, 0, 14],
    [78.5, 'bubble', 'rise', 1], [80, 'twirlie', 'bounceR', 2, 60, 40, 'M'], [81, 'bush', 'drop', 2, 120, 50], [82.5, 'grumble', 'hover', 1, 170],
    [85.5, 'glider', 'col', 5, 60, 18], [86.5, 'grumble', 'hover', 2, 120], [88.5, 'bubble', 'rise', 1, null, 0, 'E'], [89, 'tinbot', 'row', 4],
    [90, 'bush', 'drop', 1, 60, 0, 'N'], [93.5, 'smudge', 'sineR', 10, 120, 10], [95, 'grumble', 'hover', 1, 60, 0, 'M'],
    [97.5, 'bush', 'drop', 1, 120],
    /* v3 HARD-only: denser, on top of the waves above */
    [13.5, 'tinbot', 'col', 3, 180, 40, 'H'], [44, 'glider', 'swoopR', 5, 0, 14, 'H'], [70, 'grumble', 'hover', 1, 60, 0, 'H'], [90.5, 'twirlie', 'bounceL', 2, 180, 40, 'H'],
    /* v4 HARD-only */
    [33, 'boinger', 'ground', 2, 120, 0, 'H']] },
  { name: 'Candyfloss Skies', bg: 'sky', music: 'stage', boss: 'thunderpuff', bossAt: 100, waves: [
    [1.5, 'bush', 'drop', 1, 120], [3.5, 'glider', 'col', 5, 80, 16], [4.5, 'glider', 'col', 5, 160, 16], [8, 'twirlie', 'bounceR', 2, 60, 40],
    [9, 'bush', 'drop', 1, 60, 0, 'N'], [11, 'smudge', 'sineL', 6, 180, 12], [13.5, 'bush', 'drop', 1, 170], [14.5, 'grumble', 'hover', 2, 120],
    [16.5, 'bubble', 'rise', 1, null, 0, 'N'], [19, 'tinbot', 'row', 5], [20, 'bush', 'drop', 1, 120, 0, 'N'],
    [21.5, 'ticktock', 'hover', 1, 120], [22.5, 'twirlie', 'bounceL', 2, 180, 40, 'M'], [25.5, 'bush', 'drop', 1, 60],
    [26.5, 'smudge', 'swoopL', 6, 0, 12], [27.5, 'bubble', 'rise', 1, null, 0, 'E'], [29, 'smudge', 'swoopR', 6, 0, 12], [32, 'twirlie', 'bounceL', 3, 180, 30],
    [34, 'bush', 'drop', 1, 170, 0, 'N'], [36, 'vent', 'ground', 3, 120], [36.5, 'bubble', 'rise', 1], [39, 'glider', 'row', 7],
    [41.5, 'bush', 'drop', 1, 120], [42.5, 'grumble', 'hover', 1, 60], [44, 'grumble', 'hover', 1, 180], [46, 'tinbot', 'col', 4, 120, 30],
    [47.5, 'bush', 'drop', 2, 120, 50], [49, 'grumble', 'hover', 1, 120, 0, 'M'], [51, 'ticktock', 'hover', 2, 120], [53.5, 'twirlie', 'bounceR', 3, 60, 30],
    [55.5, 'bush', 'drop', 1, 60, 0, 'N'], [56, 'boinger', 'ground', 2, 120], [57.5, 'smudge', 'sineR', 6, 60, 12], [58.5, 'bubble', 'rise', 1, null, 0, 'E'],
    [59, 'present', 'ground', 1, 36], [61.5, 'tinbot', 'row', 5], [63.5, 'bush', 'drop', 1, 120], [65, 'glider', 'col', 5, 180, 16],
    [66.5, 'twirlie', 'bounceR', 4, 60, 30], [68.5, 'bubble', 'rise', 1, null, 0, 'E'], [71, 'bush', 'drop', 1, 180, 0, 'N'], [70, 'ticktock', 'hover', 1, 60, 0, 'M'],
    [72, 'glider', 'swoopL', 7, 0, 12], [73.5, 'glider', 'swoopR', 7, 0, 12], [77.5, 'bush', 'drop', 2, 120, 50],
    [79, 'bubble', 'rise', 1], [81, 'tinbot', 'row', 5], [82.5, 'ticktock', 'hover', 1, 120], [84, 'grumble', 'hover', 2, 120],
    [86.5, 'tinbot', 'row', 5, 0, 0, 'M'], [87.5, 'bush', 'drop', 1, 60, 0, 'N'], [89, 'vent', 'ground', 3, 120], [89.5, 'bubble', 'rise', 1, null, 0, 'E'],
    [91, 'smudge', 'sineL', 8, 180, 10], [94.5, 'tinbot', 'row', 4], [97.5, 'bush', 'drop', 1, 120],
    /* v3 HARD-only */
    [6.5, 'grumblet', 'hover', 2, 120, 0, 'H'], [16, 'tinbot', 'col', 4, 60, 30, 'H'], [30, 'grumble', 'hover', 1, 120, 0, 'H'], [40, 'twirlie', 'bounceL', 2, 180, 40, 'H'],
    [62, 'grumblet', 'hover', 2, 120, 0, 'H'], [76, 'grumble', 'hover', 1, 60, 0, 'H'], [92.5, 'twirlie', 'bounceR', 2, 60, 40, 'H'],
    /* v4 HARD-only */
    [33, 'grumblet', 'hover', 2, 120, 0, 'H'], [54.5, 'grumble', 'hover', 1, 60, 0, 'H']] },
  { name: 'The Clatter Works', bg: 'works', music: 'stage', boss: 'smoggins', bossAt: 100, waves: [
    [1.5, 'bush', 'drop', 1, 120], [3.5, 'tinbot', 'col', 4, 60, 40], [4.5, 'tinbot', 'col', 4, 180, 40], [7.5, 'bush', 'drop', 1, 120, 0, 'N'],
    [9, 'smudge', 'sineR', 6, 80, 12], [11.5, 'boinger', 'ground', 1, 120], [14.5, 'bush', 'drop', 1, 60],
    [16, 'tinbot', 'row', 5], [16.5, 'bubble', 'rise', 1, null, 0, 'N'], [18.5, 'grumblet', 'hover', 2, 120], [20, 'glider', 'row', 7],
    [22, 'bush', 'drop', 1, 170, 0, 'N'], [22.5, 'grumblet', 'hover', 2, 120, 0, 'M'], [24, 'twirlie', 'bounceL', 3, 180, 30], [26.5, 'grumble', 'hover', 2, 120],
    [27.5, 'bubble', 'rise', 1, null, 0, 'E'], [30, 'bush', 'drop', 1, 180], [32, 'vent', 'ground', 3, 120],
    [33.5, 'boinger', 'ground', 2, 120], [36, 'bubble', 'rise', 1], [36.5, 'bush', 'drop', 1, 60, 0, 'N'], [37.5, 'tinbot', 'col', 5, 120, 30],
    [39, 'twirlie', 'bounceR', 3, 60, 30], [41.5, 'ticktock', 'hover', 1, 120], [45.5, 'bush', 'drop', 2, 120, 50],
    [48, 'boinger', 'ground', 2, 120], [48.5, 'glider', 'row', 7, 0, 0, 'M'], [50, 'tinbot', 'row', 5], [52, 'smudge', 'swoopL', 6, 0, 12],
    [53.5, 'smudge', 'swoopR', 6, 0, 12], [56, 'bush', 'drop', 1, 170, 0, 'N'], [56.5, 'bubble', 'rise', 1, null, 0, 'E'], [57.5, 'tinbot', 'row', 5],
    [59, 'glider', 'col', 6, 120, 16], [62.5, 'bush', 'drop', 1, 120], [64, 'grumble', 'hover', 1, 70], [65.5, 'ticktock', 'hover', 1, 170],
    [66.5, 'present', 'ground', 1, 200], [67, 'bubble', 'rise', 1, null, 0, 'E'], [67.5, 'tinbot', 'row', 5, 0, 0, 'M'], [69, 'bush', 'drop', 1, 60, 0, 'N'],
    [71, 'tinbot', 'col', 5, 120, 30], [72.5, 'grumblet', 'hover', 2, 120], [74.5, 'twirlie', 'bounceR', 3, 60, 30], [76.5, 'bubble', 'rise', 1],
    [79, 'bush', 'drop', 2, 120, 50], [84, 'boinger', 'ground', 1, 80],
    [85.5, 'vent', 'ground', 2, 170], [86.5, 'ticktock', 'hover', 1, 60, 0, 'M'], [87, 'bubble', 'rise', 1, null, 0, 'E'], [87.5, 'bush', 'drop', 1, 60, 0, 'N'],
    [89, 'glider', 'swoopL', 7, 0, 12], [91, 'smudge', 'sineR', 9, 120, 10], [92.5, 'grumble', 'hover', 1, 120], [93.5, 'bush', 'drop', 1, 180],
    [94.5, 'tinbot', 'row', 4], [97.5, 'bush', 'drop', 1, 120],
    /* v3 HARD-only */
    [6, 'grumble', 'hover', 1, 120, 0, 'H'], [12.5, 'ticktock', 'hover', 1, 60, 0, 'H'], [28.5, 'tinbot', 'col', 5, 60, 30, 'H'], [42.5, 'grumblet', 'hover', 2, 120, 0, 'H'],
    [54, 'twirlie', 'bounceL', 3, 180, 30, 'H'], [61, 'grumble', 'hover', 1, 190, 0, 'H'], [81, 'grumblet', 'hover', 2, 120, 0, 'H'], [96, 'twirlie', 'bounceR', 2, 60, 40, 'H'],
    /* v4 HARD-only: shooters on top of busy moments */
    [46.5, 'grumble', 'hover', 1, 60, 0, 'H'], [79.5, 'tinbot', 'row', 5, 0, 0, 'H']] }
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
  if ((fl === 'H' && !XB(w)) || (fl === 'M' && !MH(w)) || (fl === 'E' && dif(w) !== 0) || (fl === 'N' && HD(w))) return;   // HARD extras / v6 'M': MEDIUM and HARD / EASY-only / not-HARD waves
  if (type === 'bubble') { for (let i = 0; i < n; i++) w.later(gap * i, () => { if (wave[4] == null) bubbleUp(w); else w.fruit(wave[4], 334, 12, 0, C.PICK.bubbleVy); }); return; }
  const x0 = wave[4] == null ? 120 : wave[4];
  if (type === 'bush' || type === 'cloud' || pat === 'drop') { for (let i = 0; i < n; i++) w.later(gap * i, () => w.bush(x0, -20)); return; }
  if (pat === 'ground' && (BB.STAGES[w.stage] || {}).bg === 'sky') return isleWave(w, type, pat, n);
  const rec = n >= 4 ? { n, k: 0 } : null;                                       // a formation: drop on a full clear (see formation)
  const room = fl === 'H' || fl === 'M' ? C.MAX_ENEMY - 3 : 1e9;   // v4: HARD-only members leave 3 slots free, so bushes, the Gift Box and the regular waves still fit
  for (let i = 0; i < n; i++) {
    let x = x0, dly = gap * i;
    if (pat === 'row') { x = n > 1 ? 40 + 160 * i / (n - 1) : 120; dly = 0; }
    else if (pat === 'hover') { x = x0 + 80 * (i - (n - 1) / 2); dly = 0; }
    else if (pat === 'ground') { x = x0 + 50 * (i - (n - 1) / 2); dly = 0; }
    w.later(dly, () => { const e = w.count() < room ? w.spawn(type, x, -20, { pat, idx: i }) : null; if (e && rec) e.d.wv = rec; else if (rec) rec.bad = 1; });   // one missing (enemy cap): no clear drop
  }
};
})();
