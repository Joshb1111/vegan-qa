/* Berry Breeze — content.js
   HEADER (lead, frozen): constants, type list, fruit table, seeded RNG. Do not change above the marker.
   BELOW THE MARKER (content engineer): BB.ENEMY definitions and behaviours, BB.STAGES timelines, BB.spawnWave.
   See /private/tmp/breeze/SPEC.md sections 1 and 3 for the rules every definition must follow. */
'use strict';
window.BB = window.BB || {};
BB.C = {
  W: 240, H: 320, TICK: 1000 / 60, SCROLL: 0.4, PROTO: 1,
  MAX_EBUL: 36, MAX_ENEMY: 16, MAX_FRUIT: 6, MAX_BUSH: 4, MAX_PSHOT: 48, SAFE_R: 40, SAFE_R_GUEST: 60,
  OFF: { yMax: 340, yMin: -60, xMin: -40, xMax: 280 },
  SHIP: {
    speeds: [1.5, 1.9, 2.3], hurtR: 3, pickR: 14, magnetR: 40, magnetV: 2.2,
    xMin: 10, xMax: 230, yMin: 24, yMax: 308,
    fireEvery: 6, shotV: 6, shotR: 3, shotDx: 4, spreadDeg: [[0], [0, -10, 10], [0, -10, 10, -20, 20]],
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
  STAGE: { bannerTicks: 120, warnTicks: 180, bossAt: 150 },
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
  { k: 3, id: 'strawberry', label: '+SPREAD', power: 'spread' },
  { k: 4, id: 'kiwi', label: '+ZOOM', power: 'speed' },
  { k: 5, id: 'heartpeach', label: '♥', power: 'heart' },
  { k: 6, id: 'rainbowpeach', label: 'RAINBOW!', power: 'rainbow' }
];
BB.mulberry32 = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

/* ===== CONTENT BELOW ===== */
/* Enemies, bosses, stage timelines and the wave spawner. Host-only simulation: everything random comes from w.rng().
   'a' byte: 0 idle, 1 telegraph (always ~20+ ticks before a shot), 2 alt (key spinning / live zap / phase B), 3 defeated. */
(function () {
const C = BB.C, PI = Math.PI, TAU = PI * 2, DOWN = PI / 2, D2R = PI / 180;
const SPD = [1.3, 1.45, 1.6];                          // base enemy bullet speed per stage (px/t, before kind assist)
const sp = (w, m) => SPD[w.stage] * (m || 1);
const aim = (w, e) => w.ang(e.x, e.y, w.target(e));
const calm = w => { const b = w.sm.boss; return !!(b && (b.dying || b.dead)); };   // boss cheered up: nobody shoots any more
const may = (e, w) => !calm(w) && e.y > 36 && e.y < 232; // only shoot from the upper playfield, below the HUD pills (y < 30)
/* telegraph helper: a = 1 for `len` ticks before `at`; true on the shot tick */
function tele(e, c, at, len) { if (c >= at - (len || 20) && c < at) e.a = 1; return c === at; }
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

/* 1 Glider: toy paper plane; formations 'row' and 'col' (never a vee). The lead plane fires once from stage 2 on. */
E.glider = def({ hp: 1, r: 6, score: 60,
  init(e, w) { e.d.x0 = e.x; if (e.pat === 'swoopL' || e.pat === 'swoopR') swoopInit(e, e.pat === 'swoopL'); e.d.gun = w.stage >= 1 && (e.idx === 0 || (w.stage === 2 && e.idx === 3)); },
  tick(e, w) {
    const t = w.T(e); e.a = 0;
    if (e.pat === 'swoopL' || e.pat === 'swoopR') swoop(e, t, 240);
    else { e.y += e.pat === 'col' ? 1.1 : 1; e.x = e.d.x0 + 4 * Math.sin(TAU * t / 80); }
    if (e.d.gun && !e.d.shot && may(e, w)) {
      if (e.y >= 70) e.a = 1;
      if (e.y >= 92) { e.d.shot = 1; w.bullet(e.x, e.y + 4, sp(w), aim(w, e)); }
    }
  } }, 'glider');

/* 2 Tinbot (Clanker): wind-up tin walker. Stage 1 fires straight down; later stages aim. Stage 3 fires twice.
   Spawned at y -20: the first shot comes at y 50 (t 100), so the whole telegraph is below the HUD pills. */
E.tinbot = def({ hp: 4, r: 9, score: 100,
  init(e, w) { e.d.x0 = e.x; },
  tick(e, w) {
    const t = w.T(e); e.a = 0;
    e.y += 0.7; e.x = e.d.x0 + 10 * Math.sin(TAU * t / 90);
    if (may(e, w) && (tele(e, t, 100) || (w.stage === 2 && tele(e, t, 220))))
      w.bullet(e.x, e.y + 8, sp(w), w.stage === 0 ? DOWN : aim(w, e));
  } }, 'tinbot');

/* 3 Grumble Cloud: hovers, two 3-way fans (straight down in stage 1, aimed later) */
E.grumble = def({ hp: 10, r: 12, score: 250,
  init(e, w) { e.d.ty = 56 + w.rng() * 30; e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 240);
    if (h > 0 && may(e, w) && (tele(e, h, 70, 30) || tele(e, h, 170, 30)))
      w.fan(e.x, e.y + 8, 3, 30 * D2R, sp(w), w.stage === 0 ? DOWN : aim(w, e));
  } }, 'grumble');

/* 4 Twirlie: spinning top that bounces between the walls, one ring of 6 */
E.twirlie = def({ hp: 6, r: 9, score: 150,
  init(e, w) { e.vx = e.pat === 'bounceL' ? -1 : 1; e.vy = 0.8; e.d.off = w.rng() * 60 * D2R; },
  tick(e, w) {
    const t = w.T(e); e.a = t > 300 ? 2 : 0;
    e.x += e.vx; e.y += e.vy;
    if (t < 300) { if (e.x < 12) { e.x = 12; e.vx = 1; } else if (e.x > 228) { e.x = 228; e.vx = -1; } }
    else e.vy = 1.3;
    if (may(e, w) && tele(e, t, 120)) w.ring(e.x, e.y, 6, sp(w, 0.95), e.d.off);
  } }, 'twirlie');

/* 5 Boinger: jack-in-the-box on the ground (no contact). a=1 lid rattles, a=2 head popped up. */
E.boinger = def({ hp: 8, r: 10, score: 200, ground: true, contact: false,
  tick(e, w) {
    const t = w.T(e), P = w.stage === 0 ? 200 : 140, c = (t - 60 + P * 4) % P, two = w.stage > 0; e.a = 0;
    if (t < 40 || !may(e, w)) return;
    if (c >= P - 20) e.a = 1; else if (c < 26) e.a = 2;
    if (c === 0 || (two && c === 12)) w.bullet(e.x, e.y - 6, sp(w, 1.05), aim(w, e));
  } }, 'boinger');

/* 6 Smog Vent: chimney pot on the ground. Quiet in stage 1. Cleaning it leaves a flower pot; every 2nd one gives a Heart Peach. */
E.vent = def({ hp: 6, r: 9, score: 150, ground: true, contact: false,
  tick(e, w) {
    const t = w.T(e); e.a = (t >> 5) & 1 ? 2 : 0;    // alternate puff frames
    if (w.stage > 0 && t >= 40 && may(e, w)) { const c = (t - 60 + 640) % 160; if (c >= 140) e.a = 1; if (c === 0) w.bullet(e.x, e.y - 6, sp(w, 0.9), aim(w, e)); }
  },
  onDeath(e, w) {
    w.fx('pot', e.x, e.y);
    w.sm.vents = (w.sm.vents | 0) + 1;
    if (w.sm.vents % 2 === 0) w.fruit(e.x, e.y - 4, 5, 0, -1);
  } }, 'vent');

/* 7 Tick-Tock: alarm clock, hovers, rings twice (8 bullets, second ring offset) then leaves */
E.ticktock = def({ hp: 14, r: 11, score: 300,
  init(e, w) { e.d.ty = 64 + w.rng() * 16; e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 240);
    if (h > 0 && may(e, w)) {
      if (tele(e, h, 60, 40)) w.ring(e.x, e.y, 8, sp(w, 0.9), 0);
      if (tele(e, h, 190, 40)) w.ring(e.x, e.y, 8, sp(w, 0.9), 22.5 * D2R);
    }
  } }, 'ticktock');

/* 8 Berry Bush: floating leafy puff on a leaf parachute; popped → a Sunberry hops out */
E.bush = def({ hp: C.BUSH.hp, r: C.BUSH.r, score: C.BUSH.score, contact: false,
  init(e, w) { e.d.x0 = e.x; },
  tick(e, w) { e.y += C.BUSH.vy; e.x = e.d.x0 + C.BUSH.sway * Math.sin(TAU * w.T(e) / C.BUSH.swayT); },
  onDeath(e, w) { w.fruit(e.x, e.y, 0, 0, C.BUSH.popVy); } }, 'bush');

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

/* ---------- bosses ---------- */
function bossInit(e, w) { e.d.y0 = e.y; e.d.x0 = e.x; e.d.ph = 0; e.d.c = 0; e.d.p = 0; w.sm.boss = e; }
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
function drizzle(e, w) {    /* a row of straight-down drops across the sky with a wide gap */
  const gx = 50 + w.rng() * 140;
  for (let i = 0; i < 6; i++) { const x = 20 + i * 40; if (Math.abs(x - gx) >= 30) w.bullet(x, e.y + 26, sp(w, 0.85), DOWN); }
}
function zapAll(w) { for (const p of w.players()) { w.zap(p.x, 60, 24); w.fx('sticker', p.x + 16, p.y - 12, '!'); } w.sfx('warning'); w.event('W'); }  // 'W': the guest hears it too

/* 11 BIG CLANKY (stage 1): giant wind-up tin robot */
E.clanky = def({ hp: 440, r: 30, score: 0, boss: true, name: 'Big Clanky',
  init: bossInit,
  tick(e, w) {
    if (ending(e, w) || entering(e, w)) return true;
    const d = e.d, ph = phaseOf(e, 0.5, -1);
    if (ph !== d.ph) { d.ph = ph; d.c = 0; d.rot = 0; }
    d.p += ph ? 1.5 : 1; e.x = 120 + 60 * Math.sin(TAU * d.p / 300);
    const c = d.c++;
    if (ph === 0) {
      const k = c % 200; e.a = 0;
      if (tele(e, k, 40, 30)) w.fan(e.x, e.y + 22, 5, 50 * D2R, sp(w, 1.05), aim(w, e));
      if (k === 120 && w.count() < 10) { w.spawn('smudge', e.x - 20, e.y + 26, { pat: 'sineL' }); w.spawn('smudge', e.x + 20, e.y + 26, { pat: 'sineR' }); }
    } else {
      const k = c % 180; e.a = 2;
      if (tele(e, k, 40, 30)) { w.ring(e.x, e.y + 10, 8, sp(w, 0.9), d.rot, true); d.rot += 22.5 * D2R; }
      if (k === 125 && w.count('tinbot') < 4) { w.spawn('tinbot', 30, -20); w.spawn('tinbot', 210, -20); }
    }
    return true;
  } }, 'clanky');

/* 12 THUNDERPUFF (stage 2): sulky storm cloud. Zaps: one column per player, a '!' beside each ship. */
E.thunderpuff = def({ hp: 500, r: 34, score: 0, boss: true, name: 'Thunderpuff',
  init: bossInit,
  tick(e, w) {
    if (ending(e, w) || entering(e, w)) return true;
    const d = e.d, ph = phaseOf(e, 0.6, 0.25);
    if (ph !== d.ph) { d.ph = ph; d.c = 0; if (ph === 2) cough(e, w); }
    d.p++; e.x = 120 + 40 * Math.sin(TAU * d.p / 420);
    const c = d.c++; e.a = ph ? 2 : 0;
    if (ph === 0) {
      const k = c % 360;
      if (tele(e, k, 30) || tele(e, k, 110) || tele(e, k, 190)) drizzle(e, w);
      if (tele(e, k, 280, 24)) zapAll(w);
    } else {
      const m = ph === 2 ? 0.8 : 1, L = Math.round(300 * m), k = c % L;
      if (tele(e, k, Math.round(40 * m)) || tele(e, k, Math.round(250 * m))) w.fan(e.x, e.y + 24, 5, 60 * D2R, sp(w), aim(w, e));
      if (tele(e, k, Math.round(140 * m), 24)) zapAll(w);
      if (k === Math.round(190 * m)) drizzle(e, w);
      if (k === 0 && w.count('grumblet') === 0) { w.spawn('grumblet', 40, -20); w.spawn('grumblet', 200, -20); }
    }
    return true;
  } }, 'thunderpuff');

/* 13 OLD SMOGGINS (stage 3): junk-pile mech with a smokestack hat; grumblets puff out of his chimney */
E.smoggins = def({ hp: 540, r: 36, score: 0, boss: true, name: 'Old Smoggins',
  init(e, w) { bossInit(e, w); e.d.sa = 0; },
  tick(e, w) {
    if (ending(e, w) || entering(e, w)) return true;
    const d = e.d, ph = phaseOf(e, 0.55, 0.2);
    if (ph !== d.ph) { d.ph = ph; d.c = 0; if (ph === 2) cough(e, w); }
    d.p++; e.x = 120 + 50 * Math.sin(TAU * d.p / 360) + (ph === 2 ? 6 * Math.sin(d.c * 0.9) : 0);
    const c = d.c++; e.a = ph ? 2 : 0;
    const puff = () => w.fan(e.x, e.y + 26, 3, 24 * D2R, sp(w, 0.95), aim(w, e));
    if (ph === 0) {
      if (tele(e, c % 100, 60)) puff();
      if (c % 220 === 150 && w.count('grumblet') < 2) w.spawn('grumblet', e.x + (c % 440 < 220 ? -26 : 26), e.y - 20);
    } else if (ph === 1) {
      const k = c % 220;
      if (k >= 20 && k < 140) { if ((k - 20) % 16 === 0) { for (const s of [0, PI]) w.bullet(e.x, e.y + 10, sp(w, 0.8), d.sa + s, true); d.sa += 9 * D2R; } }
      else tele(e, k, 20, 20);
      if (tele(e, c % 180, 170)) puff();
    } else {
      if (tele(e, c % 150, 40)) w.ring(e.x, e.y + 10, 10, sp(w, 0.8), (c / 150 | 0) * 18 * D2R);
      if (tele(e, c % 150, 115)) puff();
    }
    return true;
  } }, 'smoggins');

/* 14 Grumblet: Smoggins' little smog puff (Thunderpuff borrows them too). One fan, then away. */
E.grumblet = def({ hp: 6, r: 10, score: 150,
  init(e, w) { e.d.ty = Math.max(e.y + 24, 92 + w.rng() * 26); e.d.st = 0; },
  tick(e, w) {
    e.a = 0; const h = hoverMove(e, w, 200);
    if (h > 0 && may(e, w) && tele(e, h, 60, 24)) w.fan(e.x, e.y + 6, 3, 28 * D2R, sp(w, 0.95), aim(w, e));
  } }, 'grumblet');

/* ---------- stage timelines: [sec, type, pattern, n, x, gapTicks] ---------- */
BB.STAGES = [
  { name: 'Patchwork Meadows', bg: 'meadow', music: 'stage', boss: 'clanky', bossAt: 150, waves: [
    [2, 'bush', 'drop', 1, 120], [5, 'smudge', 'sineR', 5, 60, 16], [10, 'smudge', 'sineL', 5, 180, 16], [13, 'bush', 'drop', 1, 170],
    [16, 'tinbot', 'row', 3], [21, 'bush', 'drop', 1, 70], [24, 'glider', 'row', 5], [28, 'vent', 'ground', 2, 120],
    [31, 'tinbot', 'col', 3, 60, 40], [32, 'bush', 'drop', 1, 120], [34, 'tinbot', 'col', 3, 180, 40], [39, 'grumble', 'hover', 1, 120],
    [43, 'bush', 'drop', 1, 170], [46, 'smudge', 'swoopL', 6, 0, 12], [51, 'smudge', 'swoopR', 6, 0, 12], [54, 'bush', 'drop', 1, 60],
    [56, 'tinbot', 'row', 4], [58, 'vent', 'ground', 3, 120], [61, 'present', 'ground', 1, 204], [64, 'grumble', 'hover', 2, 120],
    [69, 'bush', 'drop', 2, 120, 60], [73, 'boinger', 'ground', 2, 120], [78, 'glider', 'row', 6], [81, 'bush', 'drop', 1, 180],
    [85, 'smudge', 'sineR', 8, 120, 12], [90, 'tinbot', 'row', 5], [93, 'bush', 'drop', 1, 60], [98, 'grumble', 'hover', 1, 70],
    [100, 'smudge', 'sineL', 5, 190, 14], [104, 'bush', 'drop', 1, 170], [106, 'vent', 'ground', 3, 140], [108, 'boinger', 'ground', 1, 50],
    [114, 'glider', 'swoopL', 5, 0, 14], [116, 'glider', 'swoopR', 5, 0, 14], [121, 'bush', 'drop', 2, 120, 50], [128, 'glider', 'col', 4, 60, 18],
    [130, 'grumble', 'hover', 2, 120], [133, 'tinbot', 'row', 3], [135, 'bush', 'drop', 1, 60], [140, 'smudge', 'sineR', 10, 120, 10],
    [146, 'bush', 'drop', 1, 120]] },
  { name: 'Candyfloss Skies', bg: 'sky', music: 'stage', boss: 'thunderpuff', bossAt: 150, waves: [
    [2, 'bush', 'drop', 1, 120], [5, 'glider', 'col', 4, 80, 16], [7, 'glider', 'col', 4, 160, 16], [12, 'twirlie', 'bounceR', 2, 60, 40],
    [14, 'bush', 'drop', 1, 60], [16, 'smudge', 'sineL', 6, 180, 12], [20, 'bush', 'drop', 1, 170], [22, 'grumble', 'hover', 2, 120],
    [28, 'tinbot', 'row', 4], [30, 'bush', 'drop', 1, 120], [32, 'ticktock', 'hover', 1, 120], [38, 'bush', 'drop', 1, 60],
    [40, 'smudge', 'swoopL', 6, 0, 12], [43, 'smudge', 'swoopR', 6, 0, 12], [48, 'twirlie', 'bounceL', 3, 180, 30], [51, 'bush', 'drop', 1, 170],
    [54, 'vent', 'ground', 3, 120], [58, 'glider', 'row', 7], [62, 'bush', 'drop', 1, 120], [64, 'grumble', 'hover', 1, 60],
    [66, 'grumble', 'hover', 1, 180], [71, 'bush', 'drop', 2, 120, 50], [76, 'ticktock', 'hover', 2, 120], [83, 'bush', 'drop', 1, 60],
    [84, 'boinger', 'ground', 2, 120], [86, 'smudge', 'sineR', 6, 60, 12], [88, 'present', 'ground', 1, 36], [92, 'tinbot', 'row', 5],
    [95, 'bush', 'drop', 1, 120], [100, 'twirlie', 'bounceR', 4, 60, 30], [104, 'bush', 'drop', 1, 180], [108, 'glider', 'swoopL', 6, 0, 12],
    [110, 'glider', 'swoopR', 6, 0, 12], [116, 'bush', 'drop', 2, 120, 50], [124, 'ticktock', 'hover', 1, 120], [126, 'grumble', 'hover', 2, 120],
    [131, 'bush', 'drop', 1, 60], [134, 'vent', 'ground', 3, 120], [136, 'smudge', 'sineL', 8, 180, 10], [142, 'tinbot', 'row', 3],
    [146, 'bush', 'drop', 1, 120]] },
  { name: 'The Clatter Works', bg: 'works', music: 'stage', boss: 'smoggins', bossAt: 150, waves: [
    [2, 'bush', 'drop', 1, 120], [5, 'tinbot', 'col', 3, 60, 40], [7, 'tinbot', 'col', 3, 180, 40], [11, 'bush', 'drop', 1, 120],
    [13, 'smudge', 'sineR', 6, 80, 12], [17, 'boinger', 'ground', 1, 120], [22, 'bush', 'drop', 1, 60], [24, 'tinbot', 'row', 5],
    [30, 'glider', 'row', 7], [33, 'bush', 'drop', 1, 170], [36, 'twirlie', 'bounceL', 3, 180, 30], [40, 'grumble', 'hover', 2, 120],
    [45, 'bush', 'drop', 1, 180], [48, 'vent', 'ground', 3, 120], [50, 'boinger', 'ground', 2, 120], [55, 'bush', 'drop', 1, 60],
    [56, 'tinbot', 'col', 4, 120, 30], [62, 'ticktock', 'hover', 1, 120], [68, 'bush', 'drop', 2, 120, 50], [72, 'boinger', 'ground', 2, 120],
    [78, 'smudge', 'swoopL', 6, 0, 12], [80, 'smudge', 'swoopR', 6, 0, 12], [84, 'bush', 'drop', 1, 170], [86, 'tinbot', 'row', 4],
    [88, 'glider', 'col', 5, 120, 16], [94, 'bush', 'drop', 1, 120], [96, 'grumble', 'hover', 1, 70], [98, 'ticktock', 'hover', 1, 170],
    [100, 'present', 'ground', 1, 200], [104, 'bush', 'drop', 1, 60], [106, 'tinbot', 'col', 4, 120, 30], [112, 'twirlie', 'bounceR', 3, 60, 30],
    [118, 'bush', 'drop', 2, 120, 50], [126, 'boinger', 'ground', 1, 80], [128, 'vent', 'ground', 2, 170], [131, 'bush', 'drop', 1, 60],
    [134, 'glider', 'swoopL', 6, 0, 12], [136, 'smudge', 'sineR', 8, 120, 10], [140, 'bush', 'drop', 1, 180], [142, 'tinbot', 'row', 3],
    [146, 'bush', 'drop', 1, 120]] }
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
  const type = wave[1], pat = wave[2], n = wave[3] || 1, x0 = wave[4] == null ? 120 : wave[4], gap = wave[5] || 12;
  if (type === 'bush' || type === 'cloud' || pat === 'drop') { for (let i = 0; i < n; i++) w.later(gap * i, () => w.bush(x0, -20)); return; }
  if (pat === 'ground' && (BB.STAGES[w.stage] || {}).bg === 'sky') return isleWave(w, type, pat, n);
  for (let i = 0; i < n; i++) {
    let x = x0, dly = gap * i;
    if (pat === 'row') { x = n > 1 ? 40 + 160 * i / (n - 1) : 120; dly = 0; }
    else if (pat === 'hover') { x = x0 + 80 * (i - (n - 1) / 2); dly = 0; }
    else if (pat === 'ground') { x = x0 + 50 * (i - (n - 1) / 2); dly = 0; }
    w.later(dly, () => w.spawn(type, x, -20, { pat, idx: i }));
  }
};
})();
