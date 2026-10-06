/* SPROUT KART — sim.js (SIM). The race as pure data, stepped at a fixed 60 Hz and deterministic from its seed: driving
   (auto-accelerate, brake/reverse, steer, hop + drift with green/orange/gold mini-turbos, off-road, gentle wall bounces,
   kart bumps, falling off the sky road and the balloon back), item boxes and items, CPU drivers (racing line + their own
   lane, rubber band, items), checkpoints, laps, places, results, and the Grand Prix points. No drawing, no timers, no DOM.

   new SK.Sim({track, racers:[{who, cpu, diff}], seed, items})   track = object or id; who = SK.RACERS index; diff 0..2
   sim.step(inputs)   inputs[i] = bitmask per kart (SK.IN: LEFT 1, RIGHT 2, BRAKE 4, DRIFT 8, ITEM 16); CPU karts (and
                      karts with sim.bot[i] = true, or finished humans) are driven by SK.Sim.ai. Karts listed in sim.ext[i]
                      are not moved here (online: their state arrives from elsewhere); everything else still sees them.
   sim.phase 'count' (sim.cd ticks to GO) | 'race'; sim.clock = race ticks since GO; sim.done = every human has finished
   sim.karts[i] = {i, who, cpu, diff, x, y, z, dir, v, vd (visual yaw offset), st (steer -1..1), drift (-1|0|1), dc, mt (0..3),
                   boost, item (SK.ITEMS index), itemN, roll, cpc (checkpoints passed), lap, rp (race metres), s, lat, place,
                   finished, finishT, spin, inv, shield, star, fall, lift, slow, surf, wrong, ...}
   sim.items = [{id, k:'splat'|'bomb'|'burst'|'seed', x, y, z, own, age, ...}]; sim.boxes = [{x, y, t (ticks until back)}]
   sim.events = [[name, kartIndex|-1, arg]] for the step just taken (cleared at the start of every step)
   sim.results() -> [{i, who, place, time (ticks), est}]; SK.Sim.packKart / unpackKart: a compact integer array per kart. */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, SK = G.SK = G.SK || {};
const TAU = Math.PI * 2, DT = 1 / 60;
const IN = SK.IN = { LEFT: 1, RIGHT: 2, BRAKE: 4, DRIFT: 8, ITEM: 16 };
const S = SK.SURF || { OFF: 0, ROAD: 1, WALL: 2, BOOST: 3, VOID: 4 };

/* ---------- the racers: plant-people in fruit and vegetable karts ---------- */
SK.RACERS = [
  { id: 'sprig', name: 'SPRIG', kind: 'green sprout', kart: 'pea-pod kart', col: '#5cc85a', txt: '#b6f07a' },
  { id: 'marigold', name: 'MARIGOLD', kind: 'orange marigold', kart: 'pumpkin kart', col: '#ff9a45', txt: '#ffb27a' },
  { id: 'basil', name: 'BASIL', kind: 'basil sprite', kart: 'aubergine kart', col: '#9b6bd8', txt: '#d2b8ff' },
  { id: 'blossom', name: 'BLOSSOM', kind: 'plum blossom', kart: 'strawberry kart', col: '#ff6f8e', txt: '#ffb8c8' },
  { id: 'zest', name: 'ZEST', kind: 'lemon bud', kart: 'blueberry kart', col: '#4f86ff', txt: '#a8c8ff' },
  { id: 'savoy', name: 'SAVOY', kind: 'cabbage-leaf kid', kart: 'sweetcorn kart', col: '#ffd23a', txt: '#fff0a0' }
];
SK.ITEMS = ['', 'boost', 'boost3', 'splat', 'bomb', 'seed', 'shield', 'star'];
SK.ITEM_NAMES = ['', 'SUNBERRY BOOST', 'TRIPLE SUNBERRY', 'JUICE SPLAT', 'BERRY BOMB', 'SEEKER SEED', 'BUBBLE SHIELD', 'STARFRUIT'];
const I_BOOST = 1, I_BOOST3 = 2, I_SPLAT = 3, I_BOMB = 4, I_SEED = 5, I_SHIELD = 6, I_STAR = 7;
/* item odds by place (1st..6th): boost, triple, splat, bomb, seed, shield, starfruit */
const ODDS = [[22, 0, 34, 16, 0, 28, 0], [26, 6, 24, 20, 10, 14, 0], [24, 12, 16, 20, 18, 10, 0], [20, 22, 10, 14, 22, 6, 6], [14, 30, 6, 10, 24, 6, 10], [10, 34, 2, 6, 24, 6, 18]];

/* ---------- difficulty (CPU speed and how sharp they are) ---------- */
SK.DIFF = [
  { id: 'easy', name: 'EASY', speed: 0.86, wobble: 2.2, drift: 1, aim: 0.35, rocket: 0.05, rbA: 0.12, rbB: 0.08, itemWait: [80, 420], err: 0.9 },
  { id: 'medium', name: 'MEDIUM', speed: 0.925, wobble: 1.4, drift: 2, aim: 0.7, rocket: 0.25, rbA: 0.09, rbB: 0.1, itemWait: [50, 260], err: 0.45 },
  { id: 'hard', name: 'HARD', speed: 0.975, wobble: 0.8, drift: 3, aim: 0.95, rocket: 0.55, rbA: 0.05, rbB: 0.12, itemWait: [30, 160], err: 0.15 }
];

/* ---------- handling ---------- */
const K = SK.KART = {
  VMAX: 25, ACC: 12, BRAKE: 28, REV: 7, TURN: 2.35, R: 0.85, OFFMUL: 0.55, BOOSTMUL: 1.33, STARMUL: 1.18,
  HOPV: 3.6, GRAV: 22, MT: [0, 42, 92, 150], MTT: [0, 40, 66, 100], SPIN: 66, BOX_R: 1.8, BOX_BACK: 150
};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

function newKart(i, r, slot) {
  return {
    i, who: r.who | 0, cpu: !!r.cpu, diff: clamp(r.diff | 0, 0, 2), x: slot.x, y: slot.y, z: 0, vz: 0, dir: slot.dir, v: 0, vd: 0, st: 0,
    px: 0, py: 0, drift: 0, dc: 0, mt: 0, land: 99, hh: 0, boost: 0, item: 0, itemN: 0, roll: 0, cpc: 0, lap: 0, rp: 0, s: 0, lat: 0, lastS: 0,
    place: i + 1, finished: false, finishT: 0, spin: 0, inv: 0, shield: 0, star: 0, fall: 0, lift: 0, slow: 0, surf: S.ROAD, wrong: 0, wrongT: 0,
    rs: 0, pin: 0, held: 0, wallT: 0, bumpT: 0, pad: false, stuck: 0, mul: 1,
    ai: { lane: 0, wf: 0.01, ph: 0, itemT: 0, dHold: false, dT: 0, dDir: 1, skill: 0.5, rocketAt: -1, steer: 0 }
  };
}

function Sim(o) {
  this.track = typeof o.track === 'string' ? SK.trackById(o.track) : o.track || SK.TRACKS[0];
  this.seed = (o.seed >>> 0) || 1; this.rs = this.seed;
  this.t = 0; this.phase = 'count'; this.cd = o.countdown != null ? o.countdown | 0 : 210; this.clock = 0;
  this.items = []; this.events = []; this.nextId = 1; this.done = false; this.doneAt = -1; this.useItems = o.items !== false;
  const T = this.track;
  this.karts = (o.racers || []).slice(0, 6).map((r, i) => newKart(i, r, T.slots[i]));
  this.boxes = T.items.map(b => ({ x: b.x, y: b.y, t: 0 }));
  this.bot = this.karts.map(() => false); this.ext = this.karts.map(() => false);
  this.order = this.karts.map((k, i) => i);
  this.loc = { ok: false, surf: 0, i: 0, s: 0, f: 0, d: 0, dist: 0, cx: 0, cy: 0 };
  for (const k of this.karts) {
    const A = k.ai; A.skill = this.rand(); A.lane = (this.rand() - 0.5) * 2 * (1.5 + SK.DIFF[k.diff].wobble); A.wf = 0.006 + this.rand() * 0.01; A.ph = this.rand() * TAU;
    A.rocketAt = this.rand() < SK.DIFF[k.diff].rocket ? 18 + ((this.rand() * 14) | 0) : this.rand() < 0.1 ? 90 : -1;
    SK.locate(T, k.x, k.y, this.loc); k.s = k.lastS = this.loc.s; k.lat = this.loc.d;
  }
  this.updatePlaces();
}
SK.Sim = Sim;
const P = Sim.prototype;
P.rand = function () { let t = (this.rs = (this.rs + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
P.ev = function (n, i, a) { this.events.push([n, i, a === undefined ? 0 : a]); };
P.humans = function () { return this.karts.filter(k => !k.cpu); };

P.step = function (inputs) {
  this.events.length = 0; this.t++;
  const ks = this.karts, n = ks.length;
  if (this.phase === 'count') {
    this.cd--;
    if (this.cd > 0 && this.cd <= 180 && this.cd % 60 === 0) this.ev('count', -1, this.cd / 60);
    for (let i = 0; i < n; i++) {
      const k = ks[i]; if (this.ext[i]) continue;
      let held;
      if (k.cpu || this.bot[i]) held = k.ai.rocketAt >= 0 && this.cd === k.ai.rocketAt ? IN.DRIFT : 0;
      else held = (inputs && inputs[i]) | 0;
      if ((held & IN.DRIFT) && !(k.held & IN.DRIFT) && !k.rs && this.cd <= 120) k.rs = this.cd <= 36 ? 1 : 2;
      k.held = held;
    }
    if (this.cd <= 0) {
      this.phase = 'race'; this.ev('go', -1);
      for (const k of ks) {
        if (k.rs === 1) { k.boost = 70; k.v = K.VMAX * 0.75; this.ev('boost', k.i, 'rocket'); }
        else if (k.rs === 2) { k.slow = 50; this.ev('stall', k.i); }
      }
    }
    return;
  }
  this.clock++;
  for (let i = 0; i < n; i++) {
    const k = ks[i]; if (this.ext[i]) continue;
    const auto = k.cpu || this.bot[i] || k.finished;
    const held = auto ? Sim.ai(this, k) : ((inputs && inputs[i]) | 0);
    this.drive(k, held);
  }
  this.bumps();
  if (this.useItems) { this.stepItems(); this.stepBoxes(); }
  this.updatePlaces();
  if (!this.done) {
    const hs = this.humans(), all = hs.length ? hs.every(k => k.finished) : ks.every(k => k.finished);
    if (all) { this.done = true; this.doneAt = this.clock; }
  }
};

/* ---------- driving one kart for one tick ---------- */
P.drive = function (k, held) {
  const T = this.track, L = this.loc, i = k.i;
  const pressed = held & ~k.held; k.held = held;
  if (k.inv) k.inv--; if (k.shield) k.shield--; if (k.star) k.star--; if (k.slow) k.slow--; if (k.boost) k.boost--; if (k.wallT) k.wallT--; if (k.bumpT) k.bumpT--;
  if (k.roll) { k.roll--; if (!k.roll) { k.item = this.rollItem(k); k.itemN = k.item === I_BOOST3 ? 3 : 1; this.ev('item', i, SK.ITEMS[k.item]); } }
  /* off the edge of the sky road: drop, then a balloon brings you back */
  if (k.fall) {
    k.fall++; k.vz -= K.GRAV * DT; k.z += k.vz * DT; k.v *= 0.97;
    k.x += Math.cos(k.dir) * k.v * DT; k.y += Math.sin(k.dir) * k.v * DT;
    if (k.fall > 48) this.respawn(k);
    return;
  }
  if (k.lift) { k.lift--; k.z = Math.max(0, k.lift / 80 * 2.6); k.v = 0; k.vz = 0; if (!k.lift) { k.z = 0; k.inv = Math.max(k.inv, 40); } return; }
  const c = SK.DIFF[k.diff];
  let vbase = K.VMAX * (k.cpu ? k.mul : k.finished ? 0.8 : 1), vmax = vbase;
  if (k.surf === S.OFF && !k.star) vmax *= k.boost ? 0.85 : K.OFFMUL;
  if (k.boost) vmax *= K.BOOSTMUL;
  if (k.star) vmax *= K.STARMUL;
  if (k.slow) vmax *= 0.62;
  if (k.spin) vmax *= 0.35;
  const steerIn = k.spin ? 0 : ((held & IN.RIGHT) ? 1 : 0) - ((held & IN.LEFT) ? 1 : 0);
  const want = k.cpu || this.bot[i] || k.finished ? k.ai.steer : steerIn;
  k.st += clamp((k.spin ? 0 : want) - k.st, -0.16, 0.16);
  /* throttle: always on unless braking */
  if ((held & IN.BRAKE) && !k.spin) { if (k.v > 0.3) k.v = Math.max(0, k.v - K.BRAKE * DT); else k.v = Math.max(-K.REV, k.v - K.REV * 1.6 * DT); }
  else if (k.v < vmax) k.v = Math.min(vmax, k.v + K.ACC * DT * (1 - 0.55 * Math.max(0, k.v) / vbase) * (k.boost ? 2.6 : 1) * (k.v < 0 ? 2 : 1));
  else k.v = Math.max(vmax, k.v - ((k.v - vmax) * 2.2 + 3) * DT);
  /* hop and drift */
  if ((pressed & IN.DRIFT) && k.z <= 0 && !k.spin) { k.vz = K.HOPV; k.z = 0.001; k.hh = 1; this.ev('drift', i, 'hop'); }
  if (!(held & IN.DRIFT)) k.hh = 0;
  if (k.z > 0) { k.vz -= K.GRAV * DT; k.z += k.vz * DT; if (k.z <= 0) { k.z = 0; k.vz = 0; k.land = 0; } }
  else if (k.land < 99) k.land++;
  if (k.hh && !k.drift && !k.spin && k.z === 0 && Math.abs(k.st) > 0.3 && k.v > 9) { k.drift = k.st > 0 ? 1 : -1; k.dc = 0; k.mt = 0; this.ev('drift', i, 'start'); }
  if (k.drift) {
    if (!(held & IN.DRIFT) || k.v < 7 || k.spin) {
      if (k.mt && !k.spin && !(held & IN.DRIFT)) { k.boost = Math.max(k.boost, K.MTT[k.mt]); k.v = Math.max(k.v, vbase * (1 + k.mt * 0.04)); this.ev('turbo', i, k.mt); }
      k.drift = 0; k.dc = 0; k.mt = 0;
    } else {
      const a = k.st * k.drift; k.dc += (k.surf === S.OFF ? 0.35 : 1) * (a > 0.4 ? 1.35 : a < -0.4 ? 0.75 : 1);
      const lv = k.dc >= K.MT[3] ? 3 : k.dc >= K.MT[2] ? 2 : k.dc >= K.MT[1] ? 1 : 0;
      if (lv > k.mt) { k.mt = lv; this.ev('spark', i, lv); }
    }
  }
  /* steering */
  const sp = Math.abs(k.v), tr = K.TURN * Math.min(1, sp / 6.5) * (1 - 0.22 * Math.min(1.2, sp / K.VMAX));
  let turn;
  if (k.drift) turn = k.drift * tr * (0.85 + 0.4 * k.st * k.drift);
  else turn = k.st * tr * (k.v < 0 ? -1 : 1) * (k.z > 0 ? 0.75 : 1);
  if (k.spin) { k.spin--; turn = 0; }
  k.dir = wrapA(k.dir + turn * DT);
  k.vd += ((k.drift ? k.drift * 0.45 : k.st * 0.07) - k.vd) * 0.2;
  /* move */
  k.x += (Math.cos(k.dir) * k.v + k.px) * DT; k.y += (Math.sin(k.dir) * k.v + k.py) * DT;
  k.px *= 0.86; k.py *= 0.86; if (Math.abs(k.px) < 0.01) k.px = 0; if (Math.abs(k.py) < 0.01) k.py = 0;
  this.ground(k);
  /* items */
  if ((pressed & IN.ITEM) && k.item && !k.spin) this.useItem(k);
};

/* where the kart is: walls push back gently, the sky road's edge drops you, pads boost you, laps are counted */
P.ground = function (k) {
  const T = this.track, L = SK.locate(T, k.x, k.y, this.loc), lim = T.hw + T.off;
  if (!L.ok) { if (T.edge === 'void') { this.startFall(k); return; } this.respawn(k); return; }
  if (T.edge === 'void') { if (L.dist > lim + 0.2 && k.z < 0.5) { this.startFall(k); return; } }
  else {
    const over = L.dist + K.R - lim;
    if (over > 0 && L.dist > 1e-6) {
      const nx = (k.x - L.cx) / L.dist, ny = (k.y - L.cy) / L.dist;
      k.x -= nx * over; k.y -= ny * over;
      const vx = Math.cos(k.dir) * k.v, vy = Math.sin(k.dir) * k.v, vn = vx * nx + vy * ny;
      const pn = k.px * nx + k.py * ny; if (pn > 0) { k.px -= nx * pn * 1.5; k.py -= ny * pn * 1.5; }
      if (vn > 0.2) {
        const head = vn / Math.max(0.5, Math.abs(k.v));
        if (head > 0.82 && Math.abs(k.v) > 7) { k.v = -Math.min(6, Math.abs(k.v) * 0.3); k.drift = 0; k.dc = 0; k.mt = 0; }
        else {
          const tx = vx - vn * nx, ty = vy - vn * ny, ta = Math.atan2(ty, tx);
          const da = wrapA(ta - k.dir); k.dir = wrapA(k.dir + clamp(da, -0.1, 0.1) * (k.v < 0 ? 0 : 1));
          k.v *= 1 - 0.06 * head;
        }
        if (!k.wallT && Math.abs(k.v) > 4) { this.ev('bump', k.i, 'wall'); k.wallT = 24; }
      }
      SK.locate(T, k.x, k.y, L);
      if (!L.ok) return;
    }
  }
  k.surf = L.dist <= T.hw ? (L.surf === S.BOOST ? S.BOOST : S.ROAD) : S.OFF;
  if (k.surf === S.BOOST && k.z < 0.4) { if (!k.pad) this.ev('boost', k.i, 'pad'); k.pad = true; k.boost = Math.max(k.boost, 48); k.v = Math.max(k.v, K.VMAX * 1.05); }
  else k.pad = false;
  k.s = L.s; k.lat = L.d; if (L.dist <= T.hw) k.lastS = L.s;
  /* checkpoints and laps */
  const NCP = T.NCP, seg = T.L / NCP, nx = k.cpc % NCP, cs = T.checkpoints[nx], fwd = ((L.s - cs) % T.L + T.L) % T.L;
  if (fwd < 30 && !k.finished) {
    k.cpc++;
    if (nx === 0) {
      const lap = Math.floor((k.cpc - 1) / NCP) + 1;
      if (lap > T.laps) { k.finished = true; k.finishT = this.clock; k.cpc = T.laps * NCP + 1; this.ev('finish', k.i, 0); }
      else if (lap > 1) this.ev(lap === T.laps ? 'final' : 'lap', k.i, lap);
    }
  }
  k.lap = k.cpc === 0 ? 0 : Math.min(T.laps, Math.floor((k.cpc - 1) / NCP) + 1);
  const pi = ((k.cpc - 1) % NCP + NCP) % NCP; let along = ((L.s - T.checkpoints[pi]) % T.L + T.L) % T.L; if (along > T.L / 2) along -= T.L;
  k.rp = (k.cpc - 1) * seg + (k.finished ? 0 : clamp(along, -seg, seg * 1.6));
  /* wrong way (for the HUD) */
  const ta = T.ANG[L.i], fwdV = Math.cos(k.dir - ta) * k.v;
  if (fwdV < -1.5 || (Math.cos(k.dir - ta) < -0.3 && k.v > 3)) k.wrongT++; else k.wrongT = Math.max(0, k.wrongT - 3);
  k.wrong = k.wrongT > 50 ? 1 : 0;
};
P.startFall = function (k) { if (k.fall) return; k.fall = 1; k.vz = 0.5; k.drift = 0; k.dc = 0; k.mt = 0; this.ev('fall', k.i); };
P.respawn = function (k) {
  const T = this.track, p = T.pos(k.lastS - 3, clamp(T.LINE[Math.floor(((k.lastS - 3 + T.L) % T.L) / T.ds) % T.N] * 0.3, -2, 2));
  k.x = p.x; k.y = p.y; k.dir = p.dir; k.v = 0; k.vz = 0; k.px = k.py = 0; k.fall = 0; k.lift = 80; k.z = 2.6; k.spin = 0; k.drift = 0; k.dc = 0; k.mt = 0; k.boost = 0; k.stuck = 0;
  SK.locate(T, k.x, k.y, this.loc); if (this.loc.ok) { k.s = this.loc.s; k.lat = this.loc.d; }
  this.ev('balloon', k.i);
};

/* ---------- karts bumping into each other ---------- */
P.bumps = function () {
  const ks = this.karts, n = ks.length, R2 = K.R * 2;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const A = ks[a], B = ks[b];
    if (A.fall || B.fall || A.lift || B.lift || Math.abs(A.z - B.z) > 1) continue;
    const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy; if (d2 >= R2 * R2 || d2 < 1e-9) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = R2 - d;
    if (A.star && !B.star) { B.x += nx * ov; B.y += ny * ov; B.px += nx * 9; B.py += ny * 9; if (!B.inv && !B.shield) { B.slow = Math.max(B.slow, 24); } }
    else if (B.star && !A.star) { A.x -= nx * ov; A.y -= ny * ov; A.px -= nx * 9; A.py -= ny * 9; if (!A.inv && !A.shield) { A.slow = Math.max(A.slow, 24); } }
    else {
      const ext = this.ext; const fa = ext[a] ? 0 : ext[b] ? 1 : 0.5, fb = 1 - fa;   /* a kart owned elsewhere is not moved here */
      A.x -= nx * ov * fa; A.y -= ny * ov * fa; B.x += nx * ov * fb; B.y += ny * ov * fb;
      const rv = (Math.cos(A.dir) * A.v - Math.cos(B.dir) * B.v) * nx + (Math.sin(A.dir) * A.v - Math.sin(B.dir) * B.v) * ny;
      const imp = Math.max(2.5, Math.min(7, rv * 0.6));
      if (!ext[a]) { A.px -= nx * imp; A.py -= ny * imp; } if (!ext[b]) { B.px += nx * imp; B.py += ny * imp; }
      if (rv > 0) { if (!ext[a]) A.v *= 0.97; if (!ext[b]) B.v = Math.max(B.v, B.v * 0.99); }
    }
    if (!A.bumpT && !B.bumpT) { this.ev('bump', a, b); A.bumpT = B.bumpT = 30; }
  }
};

/* ---------- items ---------- */
P.rollItem = function (k) {
  const n = this.karts.length, row = ODDS[clamp(Math.round((k.place - 1) * 5 / Math.max(1, n - 1)), 0, 5)];
  let tot = 0; for (const w of row) tot += w;
  let r = this.rand() * tot; for (let j = 0; j < row.length; j++) { r -= row[j]; if (r < 0) return j + 1; }
  return I_BOOST;
};
P.useItem = function (k) {
  const i = k.i, c = Math.cos(k.dir), s = Math.sin(k.dir), it = k.item;
  if (it === I_BOOST || it === I_BOOST3) {
    k.boost = Math.max(k.boost, 72); k.v = Math.max(k.v, K.VMAX * 1.1); this.ev('boost', i, 'berry');
    if (--k.itemN <= 0) { k.item = 0; k.itemN = 0; }
    return;
  }
  k.item = 0; k.itemN = 0;
  if (it === I_SPLAT) { this.items.push({ id: this.nextId++, k: 'splat', x: k.x - c * 2.4, y: k.y - s * 2.4, z: 0, own: i, age: 0, life: 1800 }); this.ev('splat', i, 'drop'); }
  else if (it === I_BOMB) { const v = Math.max(0, k.v) + 15; this.items.push({ id: this.nextId++, k: 'bomb', x: k.x + c * 1.2, y: k.y + s * 1.2, z: 1.2, vx: c * v, vy: s * v, vz: 8.5, own: i, age: 0, life: 300 }); this.ev('bomb', i); }
  else if (it === I_SEED) {
    let tgt = -1; for (const o of this.karts) if (o.place === k.place - 1 && !o.finished) tgt = o.i;
    this.items.push({ id: this.nextId++, k: 'seed', x: k.x + c * 1.5, y: k.y + s * 1.5, z: 0.7, dir: k.dir, s: k.s + 1.5, lat: k.lat, tgt, own: i, age: 0, life: 720 }); this.ev('seed', i, tgt);
  }
  else if (it === I_SHIELD) { k.shield = 900; this.ev('shield', i); }
  else if (it === I_STAR) { k.star = 420; this.ev('star', i); }
};
/* a hit: a friendly spin and a moment of slowdown; a bubble shield or starfruit stops it */
P.hit = function (k, by) {
  if (k.star || k.inv || k.fall || k.lift || this.ext[k.i]) return false;
  if (k.shield) { k.shield = 0; k.inv = 30; this.ev('shield', k.i, 'pop'); return true; }
  k.spin = K.SPIN; k.drift = 0; k.dc = 0; k.mt = 0; k.boost = 0; k.inv = K.SPIN + 36; k.v = Math.min(k.v, K.VMAX * 0.7);
  this.ev('hit', k.i, by); return true;
};
P.stepItems = function () {
  const T = this.track, ks = this.karts, L = this.loc, its = this.items; let w = 0;
  for (let j = 0; j < its.length; j++) {
    const it = its[j]; it.age++; let keep = it.age < it.life;
    if (it.k === 'splat') {
      for (const k of ks) if (keep && !(k.i === it.own && it.age < 40) && k.z < 0.6 && (k.x - it.x) ** 2 + (k.y - it.y) ** 2 < 2.3) { if (this.hit(k, 'splat') || k.star) { keep = false; this.ev('splat', k.i, 'hit'); } }
    } else if (it.k === 'bomb') {
      it.vz -= K.GRAV * DT; it.x += it.vx * DT; it.y += it.vy * DT; it.z += it.vz * DT;
      SK.locate(T, it.x, it.y, L);
      const wall = T.edge === 'wall' && (!L.ok || L.dist > T.hw + T.off - 0.3);
      if (it.z <= 0 || wall) { it.k = 'burst'; it.age = 0; it.life = 24; it.z = 0; if (wall && L.ok) { it.x = L.cx + (it.x - L.cx) * 0.9; it.y = L.cy + (it.y - L.cy) * 0.9; } this.ev('pop', it.own, 'bomb'); }
    } else if (it.k === 'burst') {
      if (it.age <= 6) for (const k of ks) if (k.z < 2 && (k.x - it.x) ** 2 + (k.y - it.y) ** 2 < 11.5) this.hit(k, 'bomb');
    } else if (it.k === 'seed') {
      const tk = it.tgt >= 0 ? ks[it.tgt] : null, V = 34;
      if (tk && !tk.finished && !tk.fall && !tk.lift && (tk.x - it.x) ** 2 + (tk.y - it.y) ** 2 < 26 * 26) {
        const want = Math.atan2(tk.y - it.y, tk.x - it.x); it.dir = wrapA(it.dir + clamp(wrapA(want - it.dir), -0.09, 0.09));
        it.x += Math.cos(it.dir) * V * DT; it.y += Math.sin(it.dir) * V * DT;
        SK.locate(T, it.x, it.y, L); if (L.ok) { it.s = L.s; it.lat = L.d; }
        if (!L.ok || (T.edge === 'wall' && L.dist > T.hw + T.off)) { keep = false; this.ev('pop', -1, 'seed'); }
      } else {
        it.s = (it.s + V * DT) % T.L; it.lat += (0 - it.lat) * 0.04;
        const p = T.pos(it.s, it.lat, it.tp || (it.tp = {})); it.dir = Math.atan2(p.y - it.y, p.x - it.x); it.x = p.x; it.y = p.y;
      }
      for (const k of ks) if (keep && !(k.i === it.own && it.age < 90) && (k.x - it.x) ** 2 + (k.y - it.y) ** 2 < 2.4) { this.hit(k, 'seed'); keep = false; this.ev('pop', k.i, 'seed'); }
      for (const o of its) if (keep && o.k === 'splat' && o.age < o.life && (o.x - it.x) ** 2 + (o.y - it.y) ** 2 < 2.4) { o.life = 0; keep = false; this.ev('pop', -1, 'seed'); }
    }
    if (keep) its[w++] = it;
  }
  its.length = w;
};
P.stepBoxes = function () {
  for (const b of this.boxes) {
    if (b.t > 0) { b.t--; continue; }
    for (const k of this.karts) {
      if (k.fall || k.lift || k.z > 1.5) continue;
      if ((k.x - b.x) ** 2 + (k.y - b.y) ** 2 < K.BOX_R * K.BOX_R) { b.t = K.BOX_BACK; this.ev('box', k.i); if (!k.item && !k.roll) k.roll = 54; break; }
    }
  }
};

/* ---------- places and results ---------- */
P.updatePlaces = function () {
  const ks = this.karts, o = this.order;
  const better = (a, b) => a.finished !== b.finished ? a.finished : a.finished ? (a.finishT !== b.finishT ? a.finishT < b.finishT : a.i < b.i) : a.rp !== b.rp ? a.rp > b.rp : a.i < b.i;
  for (let x = 1; x < o.length; x++) { const v = o[x]; let y = x - 1; while (y >= 0 && better(ks[v], ks[o[y]])) { o[y + 1] = o[y]; y--; } o[y + 1] = v; }
  for (let r = 0; r < o.length; r++) ks[o[r]].place = r + 1;
};
P.results = function () {
  const T = this.track, total = T.laps * T.L, out = [];
  for (const i of this.order) {
    const k = this.karts[i];
    let time = k.finishT, est = false;
    if (!k.finished) { const avg = Math.max(8, k.rp / Math.max(1, this.clock) * 60) / 60; time = Math.round(this.clock + Math.max(0, total - k.rp) / avg); est = true; }
    out.push({ i, who: k.who, cpu: k.cpu, place: k.place, time, est });
  }
  for (let r = 1; r < out.length; r++) if (out[r].time <= out[r - 1].time) out[r].time = out[r - 1].time + 7 + r;   /* estimates never beat a real finish */
  return out;
};

/* ---------- the CPU driver (also drives finished players and the bot) ---------- */
Sim.ai = function (sim, k) {
  const T = sim.track, D = SK.DIFF[k.diff], A = k.ai, hw = T.hw;
  /* rubber band: CPU karts ease off when well ahead of the best human, push a little when behind */
  if (k.cpu) {
    let lead = -1e9; for (const h of sim.karts) if (!h.cpu && h.rp > lead) lead = h.rp;
    let rb = 1;
    if (lead > -1e8) { const gap = k.rp - lead; rb = gap > 0 ? 1 - Math.min(1, gap / 160) * D.rbA : 1 + Math.min(1, -gap / 160) * D.rbB; }
    k.mul = D.speed * rb * (0.985 + A.skill * 0.03);
  }
  const look = 6 + Math.max(0, k.v) * 0.4, s = k.s + look, idx = Math.floor(((s % T.L) + T.L) % T.L / T.ds) % T.N;
  let lane = A.lane * 0.5 + Math.sin(sim.t * A.wf + A.ph) * D.wobble;
  /* step round juice puddles lying ahead */
  if (D.aim > 0.5) for (const it of sim.items) if (it.k === 'splat') {
    const ahead = ((SK.locate(T, it.x, it.y, sim.loc).s - k.s) % T.L + T.L) % T.L;
    if (sim.loc.ok && ahead > 3 && ahead < 26 && Math.abs(sim.loc.d - (T.LINE[idx] + lane)) < 2.6) lane += sim.loc.d > T.LINE[idx] + lane ? -3.2 : 3.2;
  }
  const lat = clamp(T.LINE[idx] + lane, -(hw - 1.7), hw - 1.7), p = T.pos(s, lat, A.tp || (A.tp = {}));
  const want = Math.atan2(p.y - k.y, p.x - k.x), diff = wrapA(want - k.dir);
  let held = 0, steer = clamp(diff * 2.8, -1, 1);
  const ahead = T.AHEAD[Math.floor(k.s / T.ds) % T.N], vSafe = ahead > 0.001 ? 2.35 * (0.95 / ahead) / (1 + 0.0207 * 0.95 / ahead) + 2 : 99;
  if (Math.abs(diff) > 1.4 && k.v > 3) held |= IN.BRAKE;
  else if (!k.drift && k.v > vSafe + 1.5 && Math.abs(diff) > 0.15) held |= IN.BRAKE;
  /* drift through long bends */
  if (D.drift > 0) {
    const kb = T.K[idx], kb2 = T.K[(idx + 10) % T.N];
    if (!k.drift && !A.dHold && Math.abs(kb) > 0.032 && Math.abs(kb2) > 0.026 && kb * kb2 > 0 && k.v > 14 && k.z === 0 && A.dT <= 0 && sim.rand() < 0.35) { A.dHold = true; A.dT = 0; A.dDir = kb > 0 ? 1 : -1; }
    if (A.dHold) {
      A.dT++;
      const bendLeft = T.AHEAD[(idx + 6) % T.N] > 0.016, sign = k.drift || A.dDir;
      if (k.drift) steer = clamp((diff * sign * 3.2 - 0.1), -1, 1) * sign;
      else if (steer * sign > 0) steer = sign * Math.max(0.42, Math.abs(steer));
      const enough = k.mt >= D.drift && sim.rand() < 0.08;
      if ((k.drift && ((!bendLeft && (k.mt >= 1 || A.dT > 80)) || enough || diff * sign < -0.32)) || (!k.drift && A.dT > 26)) { A.dHold = false; A.dT = -40; }
      else held |= IN.DRIFT;
    } else if (A.dT < 0) A.dT++;
  }
  A.steer = clamp(steer + (sim.rand() - 0.5) * D.err * 0.2, -1, 1);
  held |= A.steer > 0.05 ? IN.RIGHT : A.steer < -0.05 ? IN.LEFT : 0;
  /* items */
  if (k.item && !k.roll && !k.spin) {
    if (!A.itemT) A.itemT = D.itemWait[0] + ((sim.rand() * (D.itemWait[1] - D.itemWait[0])) | 0);
    A.itemT--;
    let use = A.itemT <= 0;
    const it = k.item;
    if (!use && sim.rand() < D.aim * 0.2) {
      if (it === I_SHIELD || it === I_STAR) use = true;
      else if (it === I_BOOST || it === I_BOOST3) use = ahead < 0.012 && k.v > 14;
      else if (it === I_SEED) use = k.place > 1;
      else for (const o of sim.karts) {
        if (o === k || o.fall || o.lift) continue;
        const g = o.rp - k.rp;
        if (it === I_BOMB && g > 12 && g < 40 && Math.abs(wrapA(Math.atan2(o.y - k.y, o.x - k.x) - k.dir)) < 0.3) use = true;
        if (it === I_SPLAT && g < -2 && g > -14) use = true;
      }
    }
    if (use) { A.itemT = 0; if (!(k.held & IN.ITEM)) held |= IN.ITEM; }
  }
  /* stuck against something for a while: the balloon helps */
  if (k.v < 1.5 && !k.spin && !k.lift && !k.fall && sim.phase === 'race') { if (++k.stuck > 150) sim.respawn(k); } else k.stuck = 0;
  return held;
};

/* ---------- compact kart state (for the online engineer): integers only ---------- */
const KF = Sim.KART_FIELDS = ['x', 'y', 'z', 'dir', 'v', 'vd', 'st', 'drift', 'dc', 'mt', 'boost', 'spin', 'inv', 'shield', 'star', 'fall', 'lift', 'slow', 'item', 'itemN', 'roll', 'cpc', 'finishT', 'fin', 'place', 'lap'];
const KS = { x: 64, y: 64, z: 64, dir: 4096, v: 64, vd: 1024, st: 100 };
Sim.packKart = k => KF.map(f => f === 'fin' ? (k.finished ? 1 : 0) : Math.round((+k[f] || 0) * (KS[f] || 1)));
Sim.unpackKart = (k, a) => { KF.forEach((f, j) => { if (f === 'fin') k.finished = !!a[j]; else k[f] = (a[j] | 0) / (KS[f] || 1); }); return k; };

/* ---------- Grand Prix ---------- */
SK.GP = {
  POINTS: [10, 8, 6, 4, 2, 1],
  add(totals, results) { for (const r of results) totals[r.i] = (totals[r.i] || 0) + (SK.GP.POINTS[r.place - 1] || 0); return totals; },
  standings(totals, n) { const o = []; for (let i = 0; i < n; i++) o.push({ i, pts: totals[i] || 0 }); o.sort((a, b) => b.pts - a.pts || a.i - b.i); return o; }
};
})();
