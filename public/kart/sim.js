/* SPROUT KART — sim.js v2 (SIM). The race as pure data, stepped at a fixed 60 Hz and deterministic from its seed (items and
   hazards included): driving (auto-accelerate, brake/reverse, steer, hop + drift with green/orange/gold turbos, SPROUT START,
   TAILWIND drafting, off-road, walls, kart bumps), air (ramps, catapult, bounce clouds, steam, pistons, TWIRL tricks, the
   air-cut guard), shortcuts ("cuts", tracks.js), timed hazards (pure functions of the race clock), the surprise bubbles and
   the v2 items (SUNBERRY, JUICE SPLAT/TRIO, BLUEBERRY BOUNCE, DAISY SWIRL, BUBBLE SHIELD, WISH PUFF, TINY THYME, GIANT
   SPROUT) with friendly effects (spin, bonk, wobble, tiny, boing), item odds by place and gap (LUCKY, SUPER LUCKY, FINAL LAP
   FRENZY, leader pressure), CPU drivers (racing line, lanes, cuts, hazard reading, items, personalities, rubber band),
   checkpoints, laps, places, results, fun stats and the Grand Prix points. No drawing, no timers, no DOM. SPEC-kart-v2.md.

   new SK.Sim({track, racers:[{who, cpu, diff}], seed, cls, items, countdown})   track = object or id; diff/cls 0..3
   sim.step(inputs)   inputs[i] = SK.IN bits (LEFT 1, RIGHT 2, BRAKE 4, DRIFT 8, ITEM 16, FWD 32). CPU karts, karts with
                      sim.bot[i] (true = the class row, or a profile name from SK.Sim.PROFILES) and finished humans are driven
                      by SK.Sim.ai. Karts in sim.ext[i] are not moved or hit here (online: owned elsewhere; the victim decides).
   sim.phase 'count' | 'race'; sim.cd; sim.clock (race ticks since GO); sim.done (every human finished)
   sim.cls, sim.VT / AC / TR (class top speed, acceleration, turn), sim.thymeAt, sim.leadChanges, sim.placeChanges
   sim.karts[i] (fields: SPEC section 8), sim.items[] {id, k:'splat'|'lob'|'blue'|'puff'|'wave'|'petal', x, y, z, own, age, life…}
   sim.boxes[] {x, y, z, sky, t}; sim.events [[name, kart|-1, arg]] for the step just taken (the v2 list, SPEC section 8)
   sim.results(), sim.fastForward(max), sim.debugGive(k, id), sim.debugTeleport(k, f, lat, cut), sim.debugHit(k, kind, by)
   SK.Sim.petals(k, out), SK.Sim.packKart / unpackKart / KART_FIELDS, SK.Sim.PROFILES, SK.ODDS, SK.GP. */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, SK = G.SK = G.SK || {};
const TAU = Math.PI * 2, PI = Math.PI, DT = 1 / 60;
const IN = SK.IN = { LEFT: 1, RIGHT: 2, BRAKE: 4, DRIFT: 8, ITEM: 16, FWD: 32 };
const S_OFF = 0, S_ROAD = 1, S_WALL = 2, S_BOOST = 3, S_VOID = 4, S_BELT = 6;

/* ---------- the racers: plant-people in fruit and vegetable karts (ai: small CPU personality biases, SPEC 5.5) ---------- */
SK.RACERS = [
  { id: 'sprig', name: 'SPRIG', kind: 'green sprout', kart: 'pea-pod kart', col: '#5cc85a', txt: '#b6f07a', ai: {} },
  { id: 'marigold', name: 'MARIGOLD', kind: 'orange marigold', kart: 'pumpkin kart', col: '#ff9a45', txt: '#ffb27a', ai: { eager: 1 } },
  { id: 'basil', name: 'BASIL', kind: 'basil sprite', kart: 'aubergine kart', col: '#9b6bd8', txt: '#d2b8ff', ai: { cut: 0.25 } },
  { id: 'blossom', name: 'BLOSSOM', kind: 'plum blossom', kart: 'strawberry kart', col: '#ff6f8e', txt: '#ffb8c8', ai: { twirl: 0.2, mouth: 1 } },
  { id: 'zest', name: 'ZEST', kind: 'lemon bud', kart: 'blueberry kart', col: '#4f86ff', txt: '#a8c8ff', ai: { draft: 1, wait: 0.5, speed: 0.01 } },
  { id: 'savoy', name: 'SAVOY', kind: 'cabbage-leaf kid', kart: 'sweetcorn kart', col: '#ffd23a', txt: '#fff0a0', ai: { holdShield: 1, noSky: 1, speed: -0.01 } }
];

/* ---------- items (frozen ids, order and names) ---------- */
SK.ITEMS = ['', 'boost', 'boost3', 'splat', 'splat3', 'blue', 'swirl', 'shield', 'puff', 'thyme', 'giant'];
SK.ITEM_NAMES = ['', 'SUNBERRY BOOST', 'TRIPLE SUNBERRY', 'JUICE SPLAT', 'JUICE TRIO', 'BLUEBERRY BOUNCE', 'DAISY SWIRL', 'BUBBLE SHIELD', 'WISH PUFF', 'TINY THYME', 'GIANT SPROUT'];
SK.ITEM_USES = [0, 1, 3, 1, 3, 1, 2, 1, 1, 1, 1];   /* swirl: the 1st press starts it, the 2nd flings the petals */
SK.ITEM_HINTS = ['', 'a burst of speed', 'three bursts of speed',
  'drops a slippy puddle behind you · {fwd} + {item} tosses it ahead', 'three puddles: drop them or toss them ahead',
  'bounces after the racer just ahead, and always gets there', 'petals spin round you · {item} again flings them',
  'blocks one spin or bump', 'floats over everyone to whoever is 1st', 'everyone ahead goes tiny · hop over it!',
  'grow BIG, go fast, bump everyone aside'];
const I_BOOST = 1, I_BOOST3 = 2, I_SPLAT = 3, I_SPLAT3 = 4, I_BLUE = 5, I_SWIRL = 6, I_SHIELD = 7, I_PUFF = 8, I_THYME = 9, I_GIANT = 10;
/* odds by row (place 1st..6th, moved by the luck rules), columns = item ids 1..10; rows add up to 100 */
const ODDS = SK.ODDS = [
  [16, 0, 26, 8, 0, 20, 30, 0, 0, 0],
  [16, 4, 16, 8, 22, 14, 12, 4, 2, 2],
  [14, 10, 10, 6, 24, 12, 8, 8, 6, 2],
  [10, 16, 6, 4, 22, 8, 4, 12, 10, 8],
  [6, 20, 2, 2, 18, 6, 2, 14, 12, 18],
  [2, 18, 0, 0, 14, 4, 0, 16, 14, 32]];

/* ---------- classes: vmul is the race's speed class; the rest is CPU skill (SPEC 2.1) ---------- */
SK.DIFF = [
  { id: 'easy', name: 'EASY', vmul: 0.95, speed: 0.91, wobble: 2.2, drift: 0, aim: 0.35, start: 0.05, rbA: 0.10, rbB: 0.16, itemWait: [80, 420], err: 0.9, cut: 0.10, twirl: 0.3, read: 0.2, dodge: 0.2, hop: 0.1, hb: 0.6 },
  { id: 'medium', name: 'MEDIUM', vmul: 1.00, speed: 0.92, wobble: 1.4, drift: 1, aim: 0.7, start: 0.25, rbA: 0.04, rbB: 0.10, itemWait: [70, 330], err: 0.45, cut: 0.35, twirl: 0.65, read: 0.55, dodge: 0.5, hop: 0.3, hb: 1.2 },
  { id: 'hard', name: 'HARD', vmul: 1.10, speed: 0.94, wobble: 0.8, drift: 3, aim: 0.95, start: 0.55, rbA: 0.03, rbB: 0.10, itemWait: [40, 200], err: 0.15, cut: 0.45, twirl: 0.95, read: 0.85, dodge: 0.75, hop: 0.6, hb: 1.1 },
  { id: 'wild', name: 'WILD', vmul: 1.20, speed: 0.945, wobble: 0.6, drift: 3, aim: 1.0, start: 0.7, rbA: 0, rbB: 0.12, itemWait: [20, 110], err: 0.08, cut: 0.55, twirl: 1.0, read: 0.95, dodge: 0.9, hop: 0.8, hb: 1.2 }
];
/* driving profiles for players' bots and tests (sim.bot[i] = name); start/dodge are ours (not in the frozen list) */
const PROFILES = {
  goodkid: { drift: 3, aim: 0.8, twirl: 0.8, cut: 0.5, read: 0.6, hop: 0.6, err: 0.25, wobble: 0.8, itemWait: [30, 160], start: 0.6, dodge: 0.6 },
  casual: { drift: 0, aim: 0.4, twirl: 0.3, cut: 0.2, read: 0.2, hop: 0.1, err: 0.6, wobble: 1.6, itemWait: [60, 300], start: 0.25, dodge: 0.3 },
  clumsy: { drift: 0, aim: 0.2, twirl: 0.1, cut: 0.1, read: 0, hop: 0, err: 1.2, wobble: 2.6, itemWait: [90, 420], start: 0.05, dodge: 0.1 }
};

/* ---------- handling ---------- */
const K = SK.KART = {
  VMAX: 25, ACC: 12, BRAKE: 28, REV: 7, TURN: 2.35, R: 0.85, OFFMUL: 0.55, BOOSTMUL: 1.33,
  HOPV: 3.6, GRAV: 22, MT: [0, 36, 72, 115], MTT: [0, 40, 70, 105], SPIN: 60, BOX_R: 1.8, BOX_BACK: 90, BOX_FINAL: 45
};
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const wrapA = a => (a > PI || a < -PI) ? a - TAU * Math.floor((a + PI) / TAU) : a;   /* terminates on ±Infinity (NaN out), review E8 */
const pop = m => { let n = 0; while (m) { n += m & 1; m >>>= 1; } return n; };
const ITEM_BY = { splat: 1, lob: 1, blue: 1, petal: 1, puff: 1, thyme: 1, giant: 1 };
const LEAD_GAP = 70;   /* leader pressure starts when 1st leads 2nd by this many metres (spec 50; tuned) */
/* fix round 1 (kart-review/v2-fix-r1): a final-lap leader gets a breather between leader-targeted attacks (a wish puff, a
   thyme ribbon, a blueberry from 2nd): none is thrown at it within LEAD_COOL ticks of the last one (or while one is on its
   way); TINY THYME is dodged by a hop pressed within HOP_WIN ticks of the ribbon passing (the HOP! cue shows HOP_D m out, the
   ribbon closes at WAVE_CLOSE m/s near its target); at most GIANT_CAP giants grow in a race */
const FLING_SPREAD = 11 * PI / 180, PETAL_R2 = 1.6 * 1.6, FLUNG_R2 = 1.5 * 1.5;
/* TAILWIND: a cone 3.5-12 m long, charged at 0.6 a tick (0.9 within 8 m) to 60: about 1.2-1.7 s tucked in (spec 16 m, 1 / 1.5;
   fix round 1: it fired 2-3 times a lap and worked as a second rubber band for the pack) */
const DRAFT_FAR = 12, DRAFT_RATE = 0.6, DRAFT_NEAR = 0.9;
const LEAD_COOL = 480, HOP_WIN = 54, HOP_D = 16, WAVE_CLOSE = 22, WAVE_BACK = 25, GIANT_CAP = 3, LUCKY_T = 240, SUPER_GAP = 150;

function newKart(i, r, slot) {
  return {
    i, who: r.who | 0, cpu: !!r.cpu, diff: clamp(r.diff | 0, 0, 3), x: slot.x, y: slot.y, z: 0, vz: 0, dir: slot.dir, v: 0, vd: 0, st: 0,
    px: 0, py: 0, drift: 0, dc: 0, mt: 0, land: 99, hh: 0, boost: 0, item: 0, itemN: 0, roll: 0, rollSky: 0, cpc: 0, lap: 0, rp: 0, s: 0, lat: 0, lastS: 0,
    place: i + 1, finished: false, finishT: 0, spin: 0, inv: 0, shield: 0, fall: 0, lift: 0, slow: 0, surf: S_ROAD, wrong: 0, wrongT: 0,
    rs: 0, held: 0, wallT: 0, bumpT: 0, pad: false, stuck: 0, mul: 1, beltF: 1, onBand: 1,
    cut: -1, u: 0, toS: 0, toD: 0, toC: 0, air: 0, airN: 0, aim: 0, tx: 0, ty: 0, tw: 0, twirl: 0, bonk: 0, wob: 0, wobI: 0, tiny: 0, giant: 0, gmul: 1, gro: 0, scale: 1,
    swirl: 0, petals: 0, swA: 0, draft: 0, ringT: 0, boingT: 0, lastHit: -9999, lastItemHit: -9999, hopAt: -9999, atkAt: -9999, immT: -9999, rollLong: 0, pity: 0, superLap: -1, superG: 0, rolls: [0, 0], fxT: [-9999, -9999, -9999],
    cutLap: [-1, -1, -1, -1, -1, -1, -1, -1], lastPl: i + 1,
    stats: { got: { spin: 0, bonk: 0, wobble: 0, tiny: 0 }, gotBy: { item: 0, hazard: 0, bump: 0 }, gave: 0, items: 0, used: 0, launches: 0, twirls: 0, cuts: 0, tailwinds: 0, falls: 0, dodges: 0, shieldSaves: 0, golds: 0, worst: 0, best: 9, placeAtLap2: 0 },
    ai: { lane: 0, wf: 0.01, ph: 0, itemT: 0, holdT: 0, holdId: 0, dHold: false, dT: 0, dDir: 1, skill: 0.5, startAt: -1, steer: 0, pick: [0, 0, 0, 0], pickLap: [-1, -1, -1, -1], cu: 0, hzLap: [], hzRead: [], twAt: -1, hopW: 0, hopOk: false, ease: 0, blueT: 0, tl: 0 }
  };
}

function Sim(o) {
  this.track = typeof o.track === 'string' ? SK.trackById(o.track) : o.track || SK.TRACKS[0];
  this.seed = (o.seed >>> 0) || 1; this.rs = this.seed;
  this.cls = o.cls != null ? clamp(o.cls | 0, 0, 3) : clamp(((o.racers || []).find(r => !r.cpu) || { diff: 1 }).diff | 0, 0, 3);
  const vm = SK.DIFF[this.cls].vmul;
  this.VT = K.VMAX * vm; this.AC = K.ACC * vm; this.TR = K.TURN * (1 + 0.4 * (vm - 1));
  this.thymeAt = -9999; this.puffAt = -9999; this.leadChanges = 0; this.placeChanges = 0; this.lastLead = -1; this.giantsUsed = 0;
  this.t = 0; this.phase = 'count'; this.cd = o.countdown != null ? o.countdown | 0 : 210; this.clock = 0;
  this.items = []; this.events = []; this.nextId = 1; this.done = false; this.doneAt = -1; this.useItems = o.items !== false;
  const T = this.track;
  this.karts = (o.racers || []).slice(0, 6).map((r, i) => newKart(i, r, T.slots[i]));
  this.boxes = T.items.map(b => ({ x: b.x, y: b.y, z: b.z || 0, sky: b.sky || 0, long: b.long || 0, t: 0 }));
  this.bot = this.karts.map(() => false); this.ext = this.karts.map(() => false);
  this.order = this.karts.map((k, i) => i);
  this.loc = { ok: false, surf: 0, i: 0, s: 0, f: 0, d: 0, dist: 0, cx: 0, cy: 0, cut: -1, u: 0, hw: 0, lim: 0, ang: 0 };
  this.loc2 = { ok: false, surf: 0, i: 0, s: 0, f: 0, d: 0, dist: 0, cx: 0, cy: 0, cut: -1, u: 0, hw: 0, lim: 0, ang: 0 };
  this.hs = { ph: 0, fr: 0, n: 0, x: [0, 0, 0, 0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0, 0, 0, 0], z: [0, 0, 0, 0, 0, 0, 0, 0], lat: [0, 0, 0, 0, 0, 0, 0, 0], rot: [0, 0, 0, 0, 0, 0, 0, 0] };
  this.hph = (T.hazards || []).map(() => 0);
  this.pt = []; this.tp = {};
  /* features by frame (-1 main, else cut index) */
  this.fr = { '-1': [] }; for (const c of T.cuts || []) this.fr[c.i] = [];
  for (const f of T.feats || []) (this.fr[f.on] || (this.fr[f.on] = [])).push(f);
  this.rings = (T.feats || []).filter(f => f.k === 'ring');
  this.gaps = (T.feats || []).filter(f => f.k === 'gap' && f.on < 0);
  this.cat = (T.feats || []).find(f => f.k === 'ramp' && f.aim && f.on < 0) || null;   /* the main road's catapult (the CPU driver reads it every tick) */
  this.hum = this.karts.filter(k => !k.cpu);
  this._prof = {};
  /* where each cut leaves the main band (for the CPU's "missed it" rule) */
  for (const c of T.cuts || []) if (c.uOut == null) { c.uOut = c.len * 0.3; for (let j = 0; j < c.n; j++) { const q = Math.floor(c.Y[j] / T.CELL) * T.GN + Math.floor(c.X[j] / T.CELL); if (T.dist[q] > T.hw + T.off) { c.uOut = j * c.ds; break; } } }
  for (const k of this.karts) {
    const A = k.ai, D = SK.DIFF[k.diff]; A.skill = this.rand(); A.lane = (this.rand() - 0.5) * 2 * (1.5 + D.wobble); A.wf = 0.006 + this.rand() * 0.01; A.ph = this.rand() * TAU;
    A.startAt = this.rand() < D.start ? 5 + ((this.rand() * 46) | 0) : -1;
    SK.locate(T, k.x, k.y, this.loc); k.s = k.lastS = this.loc.s; k.lat = this.loc.d;
  }
  this.updatePlaces();
}
SK.Sim = Sim;
Sim.PROFILES = PROFILES;
const P = Sim.prototype;
P.rand = function () { let t = (this.rs = (this.rs + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
P.ev = function (n, i, a) { this.events.push([n, i, a === undefined ? 0 : a]); };
P.humans = function () { const h = this.hum; for (let j = 0; j < h.length; j++) if (h[j].cpu) return (this.hum = this.karts.filter(q => !q.cpu)); return h; };   /* cached (online, a player who leaves becomes a CPU) */
/* the CPU row a kart is driven with: its class row, or a bot profile laid over it */
P.rowOf = function (k) {
  const b = this.bot[k.i], D = SK.DIFF[clamp(k.diff, 0, 3)];
  if (typeof b === 'string' && PROFILES[b]) { const key = b + k.diff; return this._prof[key] || (this._prof[key] = Object.assign({}, D, PROFILES[b])); }
  return D;
};
P.auto = function (k) { return k.cpu || !!this.bot[k.i] || k.finished; };
/* drive everyone home with the CPU brain (results with real times; review P4) */
P.fastForward = function (max) {
  max = max == null ? 3600 : max; let n = 0; const sb = this.bot.slice();
  for (let i = 0; i < this.karts.length; i++) if (!this.bot[i]) this.bot[i] = true;
  while (n < max && !this.karts.every((k, i) => k.finished || this.ext[i])) { this.step(null); n++; }
  this.bot = sb; this.events.length = 0; return n;
};
P.debugGive = function (k, id) { k = typeof k === 'number' ? this.karts[k] : k; if (typeof id === 'string') id = SK.ITEMS.indexOf(id); id = clamp(id | 0, 0, 10); k.item = id; k.itemN = SK.ITEM_USES[id] || 0; k.roll = 0; if (k.swirl && id !== I_SWIRL) { k.swirl = 0; k.petals = 0; } };
P.debugTeleport = function (k, f, lat, cut) {
  k = typeof k === 'number' ? this.karts[k] : k; const T = this.track;
  let C = null; if (cut != null && cut !== -1) C = typeof cut === 'number' ? T.cuts[cut] : T.cuts.find(c => c.id === cut);
  const p = C ? C.pos(clamp(f, 0, 1) * C.len, lat || 0) : T.pos(f * T.L, lat || 0);
  k.x = p.x; k.y = p.y; k.dir = p.dir; k.v = 0; k.z = 0; k.vz = 0; k.fall = 0; k.lift = 0; k.air = 0; k.aim = 0; k.px = k.py = 0; k.drift = 0; k.spin = 0; k.bonk = 0;
  SK.locate(T, k.x, k.y, this.loc); if (this.loc.ok) { k.s = this.loc.s; k.lat = this.loc.d; k.cut = this.loc.cut; k.u = this.loc.u; k.lastS = k.s; }
};
P.debugHit = function (k, kind, by) {
  k = typeof k === 'number' ? this.karts[k] : k; kind = String(kind || 'spin').toLowerCase();
  if (kind === 'giant') { k.giant = 300; k.gmul = 1.32; this.ev('giant', k.i, 1); return 'hit'; }
  if (kind === 'boing') { k.px += Math.cos(k.dir + PI / 2) * 9; k.py += Math.sin(k.dir + PI / 2) * 9; k.slow = Math.max(k.slow, 24); k.boingT = 60; this.ev('boing', k.i, -1); return 'hit'; }
  if (kind === 'twirl') { k.twirl = 24; this.ev('twirl', k.i, 0); return 'hit'; }
  const saved = k.inv; k.inv = 0; const f = k.fxT; k.fxT = [-9999, -9999, -9999]; const r = this.hit(k, kind, by || '', -1); if (r === 'none') { k.inv = saved; k.fxT = f; } return r;
};

/* ---------- one tick ---------- */
P.step = function (inputs) {
  this.events.length = 0; this.t++;
  const ks = this.karts, n = ks.length;
  if (this.phase === 'count') {
    this.cd--;
    if (this.cd > 0 && this.cd <= 180 && this.cd % 60 === 0) this.ev('count', -1, this.cd / 60);
    for (let i = 0; i < n; i++) {
      const k = ks[i]; if (this.ext[i]) continue;
      let held;
      if (k.cpu || this.bot[i]) { const at = k.cpu ? k.ai.startAt : (k.ai.botStart != null ? k.ai.botStart : (k.ai.botStart = this.rand() < this.rowOf(k).start ? 5 + ((this.rand() * 46) | 0) : -1)); held = at >= 0 && this.cd === at ? IN.DRIFT : 0; }
      else held = (inputs && inputs[i]) | 0;
      /* SPROUT START: the first fresh DRIFT press during the "1" (cd 60..1); presses during "3" and "2" are ignored */
      if ((held & IN.DRIFT) && !(k.held & IN.DRIFT) && !k.rs && this.cd >= 1 && this.cd <= 60) k.rs = this.cd >= 25 ? 1 : 2;
      k.held = held;
    }
    if (this.cd <= 0) {
      this.phase = 'race'; this.ev('go', -1);
      for (const k of ks) {
        if (k.rs === 1) { k.boost = 40; k.v = 0.6 * this.VT; this.ev('start', k.i, 1); }
        else if (k.rs === 2) { k.boost = 75; k.v = 0.75 * this.VT; this.ev('start', k.i, 2); }
      }
    }
    return;
  }
  this.clock++;
  for (let i = 0; i < n; i++) {
    const k = ks[i]; if (this.ext[i]) continue;
    /* NaN guard (E8): a non-finite kart is lifted back by the balloon before anything reads it (the AI included) */
    if (!(isFinite(k.x) && isFinite(k.y) && isFinite(k.v) && isFinite(k.z) && isFinite(k.dir) && isFinite(k.vz) && isFinite(k.st) && isFinite(k.vd) && isFinite(k.px) && isFinite(k.py))) { this.unNaN(k); continue; }
    const auto = this.auto(k);
    const held = auto ? Sim.ai(this, k) : ((inputs && inputs[i]) | 0);
    this.drive(k, held, auto);
  }
  this.bumps();
  this.stepDraft();
  this.stepHazards();
  if (this.useItems) { this.stepSwirl(); this.stepItems(); this.stepBoxes(); }
  this.updatePlaces();
  this.bookkeep();
  if (!this.done) {
    const hs = this.humans(), L = hs.length ? hs : ks; let all = true;
    for (let j = 0; j < L.length; j++) if (!L[j].finished) { all = false; break; }
    if (all) { this.done = true; this.doneAt = this.clock; }
  }
};

/* ---------- driving one kart for one tick ---------- */
P.unNaN = function (k) { if (!isFinite(k.lastS)) k.lastS = 0; k.z = 0; k.vz = 0; k.v = 0; k.dir = 0; k.st = 0; k.vd = 0; k.px = k.py = 0; k.x = isFinite(k.x) ? k.x : 0; k.y = isFinite(k.y) ? k.y : 0; this.respawn(k); };
P.drive = function (k, held, auto) {
  const i = k.i, VT = this.VT;
  const pressed = held & ~k.held; k.held = held;
  if (k.inv) k.inv--; if (k.shield) k.shield--; if (k.slow) k.slow--; if (k.boost) k.boost--; if (k.wallT) k.wallT--; if (k.bumpT) k.bumpT--;
  if (k.ringT) k.ringT--; if (k.boingT) k.boingT--; if (k.wobI) k.wobI--; if (k.wob) k.wob--; if (k.twirl) k.twirl--; if (k.tiny) k.tiny--;
  if (k.draft < 0) k.draft++;
  /* GIANT: grows over 20 ticks; it never ends in the air or off the road band, then shrinks back */
  if (k.giant > 0) {
    if (k.gro < 20) k.gro++;
    if (!(k.giant === 1 && (k.air || k.fall || k.lift || !k.onBand))) { k.giant--; if (!k.giant) { k.inv = Math.max(k.inv, 40); this.ev('giant', i, 0); } }
  } else if (k.gro > 0) k.gro--;
  const tScale = k.tiny > 0 ? 0.55 : 1 + 0.7 * k.gro / 20;
  k.scale += (tScale - k.scale) * (k.tiny > 0 || k.scale < 1 ? 0.25 : 1); if (Math.abs(k.scale - tScale) < 0.01) k.scale = tScale;
  if (k.roll) { k.roll--; if (!k.roll) this.giveItem(k); }
  /* off the edge: drop, then a balloon brings you back */
  if (k.fall) {
    k.fall++; k.vz -= K.GRAV * DT; k.z += k.vz * DT; k.v *= 0.97;
    k.x += Math.cos(k.dir) * k.v * DT; k.y += Math.sin(k.dir) * k.v * DT;
    if (k.fall > 48) this.respawn(k);
    return;
  }
  if (k.lift) { k.lift--; k.z = Math.max(0, k.lift / 80 * 2.6); k.v = 0; k.vz = 0; if (!k.lift) { k.z = 0; k.inv = Math.max(k.inv, 60); k.v = 0.5 * VT; } return; }
  const air = k.air > 0;
  let vbase = VT * (k.cpu ? k.mul : k.finished ? 0.8 : 1), vmax = vbase, acc = this.AC;
  if (k.surf === S_OFF && !k.giant && !air) vmax *= k.boost ? 0.85 : K.OFFMUL;
  if (k.giant) { vmax *= Math.max(k.gmul, k.boost ? K.BOOSTMUL : 1); acc *= 1.6; }
  else if (k.boost) vmax *= K.BOOSTMUL;
  if (k.tiny) { vmax *= 0.8; acc *= 0.9; }
  if (k.surf === S_BELT && !air) { if (k.beltF) { vmax *= 1.15; acc *= 1.3; } else vmax *= 0.85; }
  if (k.slow) vmax *= 0.62;
  if (k.spin) vmax *= 0.35;
  if (k.bonk > 24) vmax *= 0.5;
  if (k.wob) vmax *= 0.78;
  if (k.draft >= 20) vmax *= 1.03;
  if (auto && k.ai.ease > 0) { vmax *= 0.9; k.ai.ease--; }
  /* steering */
  const lock = k.spin || k.bonk > 24;
  const steerIn = lock ? 0 : ((held & IN.RIGHT) ? 1 : 0) - ((held & IN.LEFT) ? 1 : 0);
  const want = auto ? k.ai.steer : steerIn;
  k.st += clamp((lock ? 0 : want) - k.st, -0.16, 0.16);
  /* throttle: always on unless braking; an aimed flight keeps its speed */
  if (air) { /* a launch flies at its takeoff speed: no throttle in the air (a slow kart falls short of a gap) */ }
  else if ((held & IN.BRAKE) && !k.spin) { if (k.v > 0.3) k.v = Math.max(0, k.v - K.BRAKE * DT); else k.v = Math.max(-K.REV, k.v - K.REV * 1.6 * DT); }
  else if (k.v < vmax) k.v = Math.min(vmax, k.v + acc * DT * (1 - 0.55 * Math.max(0, k.v) / Math.max(1, vbase)) * (k.boost ? 2.6 : 1) * (k.v < 0 ? 2 : 1));
  else k.v = Math.max(vmax, k.v - ((k.v - vmax) * 2.2 + 3) * DT);
  /* DRIFT: a hop on the ground, a TWIRL in the air (never a hop in the air) */
  if (pressed & IN.DRIFT) {
    if (air) { if (k.air <= 0.75 * k.airN && !k.tw && !k.spin) { k.tw = 1; k.twirl = 24; k.hh = 1; this.ev('twirl', i, 0); } }
    else if (k.z <= 0 && !k.spin && !k.bonk) { k.vz = K.HOPV; k.z = 0.001; k.hh = 1; k.hopAt = this.clock; this.ev('drift', i, 'hop'); }
  }
  if (!(held & IN.DRIFT)) k.hh = 0;
  if (k.hh && !k.drift && !k.spin && !k.bonk && !air && k.z === 0 && Math.abs(k.st) > 0.3 && k.v > 9) { k.drift = k.st > 0 ? 1 : -1; k.dc = 0; k.mt = 0; this.ev('drift', i, 'start'); }
  if (k.drift) {
    if (!(held & IN.DRIFT) || k.v < 7 || k.spin || k.bonk || air) {
      if (k.mt && !k.spin && !k.bonk && !air && !(held & IN.DRIFT)) { k.boost = Math.max(k.boost, K.MTT[k.mt]); k.v = Math.max(k.v, VT * (1 + k.mt * 0.04)); this.ev('turbo', i, k.mt); if (k.mt === 3) k.stats.golds++; }
      k.drift = 0; k.dc = 0; k.mt = 0;
    } else {
      const a = k.st * k.drift; k.dc += (k.surf === S_OFF ? 0.35 : 1) * (a > 0.4 ? 1.35 : a < -0.4 ? 0.75 : 1);
      const lv = k.dc >= K.MT[3] ? 3 : k.dc >= K.MT[2] ? 2 : k.dc >= K.MT[1] ? 1 : 0;
      if (lv > k.mt) { k.mt = lv; this.ev('spark', i, lv); }
    }
  }
  const sp = Math.abs(k.v); let tr = this.TR * Math.min(1, sp / 6.5) * (1 - 0.22 * Math.min(1.2, sp / VT));
  if (k.giant) tr *= 1.15;
  const stE = k.wob ? clamp(k.st + 0.25 * Math.sin(TAU * k.wob / 12), -1.25, 1.25) : k.st;
  let turn;
  if (k.drift) turn = k.drift * tr * (0.55 + 0.5 * stE * k.drift);
  else turn = stE * tr * (k.v < 0 ? -1 : 1) * (k.z > 0 && !air ? 0.75 : 1);
  if (air) turn *= k.aim ? 0.3 : 0.6;   /* aimed flights: about ±3 m of correction, so steering hard the wrong way can miss a cloud */
  if (k.spin) { k.spin--; turn = 0; }
  if (k.bonk) k.bonk--;
  k.dir = wrapA(k.dir + turn * DT);
  k.vd += ((k.drift ? k.drift * 0.45 : k.st * 0.07) - k.vd) * 0.2;
  /* move */
  k.x += (Math.cos(k.dir) * k.v + k.px) * DT; k.y += (Math.sin(k.dir) * k.v + k.py) * DT;
  k.px *= 0.86; k.py *= 0.86; if (Math.abs(k.px) < 0.01) k.px = 0; if (Math.abs(k.py) < 0.01) k.py = 0;
  /* up and down: a launch flies (k.air counts its ticks), a hop or a bonk just bobs */
  if (air) { k.air++; k.vz -= K.GRAV * DT; k.z += k.vz * DT; }
  else if (k.z > 0) { k.vz -= K.GRAV * DT; k.z += k.vz * DT; if (k.z <= 0) { k.z = 0; k.vz = 0; k.land = 0; } }
  else if (k.land < 99) k.land++;
  this.ground(k);
  /* items */
  if ((pressed & IN.ITEM) && k.item && !k.roll && !k.spin && !k.bonk && !k.fall && !k.lift) this.useItem(k, !!(held & IN.FWD));
};

/* ---------- air ---------- */
P.launch = function (k, D, vmin, kind) {
  const v = Math.max(1, Math.abs(k.v)), vz = Math.min(11, Math.max(6.8, D * 22 / (2 * Math.max(v, vmin)))) * Math.min(1, v / vmin);
  this.takeoff(k, vz, v * 2 * vz / 22, kind);
};
P.launchV = function (k, vz, kind) { const v = Math.max(0, Math.abs(k.v)); this.takeoff(k, vz, v * 2 * vz / 22, kind); };
P.aimLaunch = function (k, tx, ty, kind) {
  const d = Math.hypot(tx - k.x, ty - k.y), t = clamp(d / 22, 0.6, 1.0);
  k.dir = Math.atan2(ty - k.y, tx - k.x); k.v = d / t; k.px = k.py = 0; k.aim = 1; k.tx = tx; k.ty = ty;
  this.takeoff(k, 11 * t, d, kind);
};
P.takeoff = function (k, vz, toD, kind) {
  if (k.drift) { if (k.mt) k.boost = Math.max(k.boost, K.MTT[k.mt]); k.drift = 0; k.dc = 0; k.mt = 0; }
  if (k.cut >= 0) { const C = this.track.cuts[k.cut]; if (C) toD *= C.span / C.len; }   /* a cut maps its metres onto more (or fewer) main-road metres */
  k.vz = vz; k.z = Math.max(k.z, 0.01); k.air = 1; k.airN = Math.round(2 * vz / K.GRAV * 60); k.tw = 0; k.toS = k.s; k.toD = toD; k.toC = k.cpc; k.ai.dHold = false;
  if (kind !== 'aim') k.stats.launches++;
  this.ev('launch', k.i, kind);
};
/* where an aimed landing finds a bounce cloud (within r + 0.5) */
P.discAt = function (k) {
  const T = this.track;
  for (const c of T.cuts) for (const f of c.feats) if (f.k === 'bounce') { const dx = k.x - f.x, dy = k.y - f.y; if (dx * dx + dy * dy < (f.r + 0.5) * (f.r + 0.5)) return f; }
  return null;
};

/* ---------- where the kart is: walls, edges, gaps, pads, ramps, rings, laps ---------- */
const ws = (T, x, y) => { const cx = Math.floor(x / T.CELL), cy = Math.floor(y / T.CELL); if (cx < 0 || cy < 0 || cx >= T.GN || cy >= T.GN) return -1; return T.grid[cy * T.GN + cx]; };
P.edgePush = function (k, L, over, mode) {   /* mode 0 wall, 1 springy (bumper, rail), 2 giant slide */
  const nx = (k.x - L.cx) / L.dist, ny = (k.y - L.cy) / L.dist;
  k.x -= nx * over; k.y -= ny * over;
  const vx = Math.cos(k.dir) * k.v, vy = Math.sin(k.dir) * k.v, vn = vx * nx + vy * ny;
  const pn = k.px * nx + k.py * ny; if (pn > 0) { k.px -= nx * pn * 1.5; k.py -= ny * pn * 1.5; }
  if (vn > 0.2) {
    const head = vn / Math.max(0.5, Math.abs(k.v));
    if (mode === 1) {
      const rx = vx - 2 * vn * nx, ry = vy - 2 * vn * ny, ra = Math.atan2(ry, rx);
      k.dir = wrapA(k.dir + clamp(wrapA(ra - k.dir), -0.35, 0.35)); k.v *= 0.95; k.px -= nx * 3; k.py -= ny * 3;
      if (!k.wallT) { this.ev('bounce', k.i, 'bumper'); k.wallT = 24; }
      return;
    }
    if (mode === 0 && head > 0.82 && Math.abs(k.v) > 7) { k.v = -Math.min(6, Math.abs(k.v) * 0.3); k.drift = 0; k.dc = 0; k.mt = 0; }
    else {
      const tx = vx - vn * nx, ty = vy - vn * ny, ta = Math.atan2(ty, tx);
      k.dir = wrapA(k.dir + clamp(wrapA(ta - k.dir), -0.1, 0.1) * (k.v < 0 ? 0 : 1));
      k.v *= mode === 2 ? 0.97 : 1 - 0.06 * head;
    }
    if (!k.wallT && Math.abs(k.v) > 4) { this.ev('bump', k.i, 'wall'); k.wallT = 24; }
  }
};
/* is there a soft edge (EASY bumper / rail) at this point of the band? */
P.softEdge = function (k, L) {
  const T = this.track, cls = this.cls;
  if (L.cut >= 0) { const C = T.cuts[L.cut]; return C.rail.indexOf(cls) >= 0; }
  for (const f of this.fr[-1]) if (f.k === 'bumper' && f.cls.indexOf(cls) >= 0 && (L.d > 0) === (f.side > 0)) { if (inA(L.s, f.a0, f.a1, T.L)) return true; }
  return false;
};
const inA = (s, a0, a1, L) => { const d = ((s - a0) % L + L) % L; return d <= ((a1 - a0) % L + L) % L; };
const wrapS = (d, L) => { d = ((d % L) + L) % L; return d > L / 2 ? d - L : d; };
P.ground = function (k) {
  const T = this.track, L = SK.locate(T, k.x, k.y, this.loc), i = k.i, VT = this.VT;
  const air = k.air > 0, R = K.R * (k.tiny ? 0.6 : k.giant ? Math.max(1, k.scale) : 1);
  if (!L.ok) {   /* far from every road */
    if (air && k.z > 0) return;
    if (T.edge === 'void' || k.air) { k.air = 0; k.aim = 0; this.startFall(k); return; }
    this.respawn(k); return;
  }
  /* edges: walls push (at any height), soft edges bounce, the giant slides along void edges; beyond a void edge you fall */
  let over = L.dist + R - L.lim;
  if (over > 0 && L.dist > 1e-6) {
    const nx = (k.x - L.cx) / L.dist, ny = (k.y - L.cy) / L.dist, beyond = ws(T, L.cx + nx * (L.lim + 0.35), L.cy + ny * (L.lim + 0.35));
    const here = L.surf;
    if (beyond === S_WALL || beyond < 0 || here === S_WALL) { this.edgePush(k, L, over, k.giant ? 2 : 0); SK.locate(T, k.x, k.y, L); if (!L.ok) return; }
    else if (beyond === S_VOID && !air) {
      if (this.softEdge(k, L)) { this.edgePush(k, L, over, 1); SK.locate(T, k.x, k.y, L); if (!L.ok) return; }
      else if (k.giant) { this.edgePush(k, L, over, 2); SK.locate(T, k.x, k.y, L); if (!L.ok) return; }
    }
  }
  const inBand = L.dist <= L.lim, cell = L.surf;
  k.onBand = inBand ? 1 : 0;
  /* landing from a launch */
  if (air && k.z <= 0) {
    k.z = 0; k.vz = 0; k.air = 0; k.aim = 0;
    const disc = this.discAt(k);
    if (disc) { k.lastS = L.s; k.s = L.s; this.aimLaunch(k, disc.tx, disc.ty, 'bounce'); k.exitAim = disc.exit ? 1 : 0; return; }
    if (k.exitAim) { k.exitAim = 0; k.dir = L.ang; k.v = Math.max(k.v, VT); }   /* the last cloud sets you down facing along the road */
    k.tx = k.ty = 0;
    if ((cell === S_VOID && !(k.giant && inBand)) || (!inBand && T.edge === 'void' && cell !== S_ROAD && cell !== S_OFF && cell !== S_BOOST && cell !== S_BELT)) {
      if (!this.netAt(k, L)) { this.startFall(k); return; }
      return;
    }
    const ds = wrapS(L.s - k.toS, T.L);
    if (ds < -15 || ds > k.toD + 25) { k.cpc = k.toC; this.respawnAt(k, k.toS + k.toD); return; }
    if (k.tw) { k.boost = Math.max(k.boost, 50); k.v = Math.max(k.v, 1.08 * VT); this.ev('land', i, 1); k.stats.twirls++; }
    else this.ev('land', i, 0);
    k.tw = 0;
  }
  if (!air || k.z <= 0) {
    /* the void: off a sky edge, into a gap, or onto the open sky of the hops */
    if (cell === S_VOID && !(k.giant && inBand) && (L.dist <= L.lim - 0.45 || L.dist > L.lim + 0.2) && k.z < 0.5) {
      if (this.netAt(k, L)) return;
      this.startFall(k); return;
    }
    if (cell === S_WALL && T.edge !== 'wall' && !k.giant) { this.startFall(k); return; }
  }
  /* surface */
  const onAir = k.air > 0;
  k.surf = (cell === S_OFF || L.dist > L.lim) ? S_OFF : cell === S_BOOST ? S_BOOST : cell === S_BELT ? S_BELT : S_ROAD;
  const face = Math.cos(k.dir - L.ang);
  k.beltF = face > 0 ? 1 : 0;
  if (!onAir) {
    if ((k.surf === S_BOOST || k.surf === S_BELT) && k.z < 0.4 && face > 0) {
      if (k.surf === S_BOOST) { if (!k.pad) this.ev('boost', i, this.beltAt(L) ? 'belt' : 'pad'); k.boost = Math.max(k.boost, 48); k.v = Math.max(k.v, VT * 1.05); }
      else if (!k.pad) this.ev('boost', i, 'belt');
      k.pad = true;
    } else k.pad = false;
    k.cut = L.cut; k.u = L.u;
    if (L.dist <= L.hw && cell !== S_VOID) k.lastS = L.s;
    this.features(k, L, face);
    if (k.air) return;   /* a ramp just fired */
  }
  /* a shortcut entered this lap */
  if (L.cut >= 0 && (cell !== S_VOID || k.aim) && k.cutLap[L.cut] !== k.lap && k.lap > 0) { k.cutLap[L.cut] = k.lap; k.stats.cuts++; this.ev('shortcut', i, L.cut); }
  k.s = L.s; k.lat = L.d; if (L.cut === k.cut) k.u = L.u;
  /* checkpoints and laps (cuts map their s continuously onto the main road, so the lap code is the same) */
  const NCP = T.NCP, seg = T.L / NCP, nx = k.cpc % NCP, cs = T.checkpoints[nx], fwd = ((L.s - cs) % T.L + T.L) % T.L;
  if (fwd < 30 && !k.finished) {
    k.cpc++;
    if (nx === 0) {
      const lap = Math.floor((k.cpc - 1) / NCP) + 1;
      if (lap > T.laps) { k.finished = true; k.finishT = this.clock; k.cpc = T.laps * NCP + 1; this.ev('finish', i, k.place); }
      else if (lap > 1) { this.ev(lap === T.laps ? 'final' : 'lap', i, lap); if (lap === 2) k.stats.placeAtLap2 = k.place; }
    }
  }
  k.lap = k.cpc === 0 ? 0 : Math.min(T.laps, Math.floor((k.cpc - 1) / NCP) + 1);
  const pi = ((k.cpc - 1) % NCP + NCP) % NCP; let along = ((L.s - T.checkpoints[pi]) % T.L + T.L) % T.L; if (along > T.L / 2) along -= T.L;
  k.rp = (k.cpc - 1) * seg + (k.finished ? 0 : clamp(along, -seg, seg * 1.6));
  /* wrong way: only when facing backwards (P7) */
  if (Math.cos(k.dir - L.ang) < -0.3 && k.v > 3 && !k.air) k.wrongT++; else k.wrongT = Math.max(0, k.wrongT - 3);
  k.wrong = k.wrongT > 50 ? 1 : 0;
};
P.beltAt = function (L) { if (L.cut >= 0) return true; for (const b of this.track.boosts) if (b.kind === 'belt' && inA(L.s, b.s - 0.5, b.s + b.len + 0.5, this.track.L)) return true; return false; };
/* EASY nets: a grounded kart over a netted gap is carried across */
P.netAt = function (k, L) {
  if (k.giant) return false;
  const T = this.track;
  for (const f of this.fr[L.cut] || []) {
    if (f.k !== 'gap' || !f.net || f.net.indexOf(this.cls) < 0) continue;
    const a = L.cut < 0 ? L.s : L.u, da = L.cut < 0 ? ((a - f.a0) % T.L + T.L) % T.L : a - f.a0;
    if (da < -2 || da > f.a1 - f.a0 + 2) continue;
    const lat = clamp(L.d, -L.hw + 1, L.hw - 1), p = L.cut < 0 ? T.pos(f.a1 + 4, lat, this.tp) : T.cuts[L.cut].pos(f.a1 + 4, lat, this.tp);
    k.z = Math.max(k.z, 0.05); this.aimLaunch(k, p.x, p.y, 'net'); return true;
  }
  return false;
};
/* ramps, catapult, rings, crate blocks (the features of the frame the kart is on) */
P.features = function (k, L, face) {
  const T = this.track, list = this.fr[L.cut], VT = this.VT;
  if (!list) return;
  const a = L.cut < 0 ? L.s : L.u, lat = L.d;
  for (const f of list) {
    if (f.k === 'ramp') {
      const d = L.cut < 0 ? wrapS(a - f.a1, T.L) : a - f.a1;
      if (d < -1.2 || d > 0.4 || lat < f.l0 - 0.3 || lat > f.l1 + 0.3 || k.z >= 0.2 || k.air || face <= 0.5 || k.spin) continue;
      if (f.aim) {
        if (k.giant || k.v < f.vmin) continue;
        if (Math.abs(wrapA(Math.atan2(f.ty - k.y, f.tx - k.x) - k.dir)) > 35 * PI / 180) continue;
        this.aimLaunch(k, f.tx, f.ty, 'catapult'); return;
      }
      this.launch(k, f.D, f.vmin, 'ramp'); return;
    } else if (f.k === 'ring') {
      if (k.ringT || face <= 0 || Math.abs(lat) >= 3.5 || k.z >= 2.5) continue;
      const d = wrapS(a - f.a0, T.L); if (d < 0 || d > f.a1 - f.a0) continue;
      k.boost = Math.max(k.boost, 40); k.v = Math.max(k.v, 1.05 * VT); k.ringT = 30; this.ev('boost', k.i, 'ring');
    } else if (f.k === 'block') {
      const R = K.R * (k.tiny ? 0.6 : 1);
      if (k.z >= (f.h || 0.6) || a < f.a0 - R || a > f.a1 + R) continue;
      const C = T.cuts[L.cut], p = C.pos(f.a0 - R - 0.3, lat, this.tp); k.x = p.x; k.y = p.y; k.v = -0.3 * Math.abs(k.v); k.drift = 0; k.dc = 0; k.mt = 0;
      this.ev('bounce', k.i, 'block');
      /* too slow for the jump and boxed in: after a third bump in 5 s the balloon lifts you over the crates */
      if (this.clock - (k.blockT || -9999) > 300) { k.blockT = this.clock; k.blockN = 0; }
      if (++k.blockN >= 3) { k.blockN = 0; k.blockT = -9999; this.respawn(k); }
      return;
    }
  }
};
P.startFall = function (k) { if (k.fall) return; k.fall = 1; k.vz = 0.5; k.drift = 0; k.dc = 0; k.mt = 0; k.air = 0; k.aim = 0; k.stats.falls++; this.ev('fall', k.i, 0); };
P.respawn = function (k) {
  const T = this.track; let s = k.lastS - 3;
  for (const g of this.gaps) { if (inA(((s % T.L) + T.L) % T.L, g.a0 - 30, g.a1, T.L)) s = g.a1 + 6; }
  this.respawnAt(k, s);
};
P.respawnAt = function (k, s) {
  const T = this.track; s = ((s % T.L) + T.L) % T.L;
  const p = T.pos(s, clamp(T.LINE[Math.floor(s / T.ds) % T.N] * 0.3, -2, 2), this.tp);
  k.x = p.x; k.y = p.y; k.dir = p.dir; k.v = 0; k.vz = 0; k.st = 0; k.vd = 0; k.px = k.py = 0; k.fall = 0; k.lift = 80; k.z = 2.6; k.spin = 0; k.bonk = 0; k.wob = 0; k.drift = 0; k.dc = 0; k.mt = 0; k.boost = 0; k.stuck = 0;
  k.air = 0; k.aim = 0; k.tw = 0; k.cut = -1; k.ai.pick.fill(0); k.ai.pickLap.fill(k.lap); k.ai.dHold = false;
  SK.locate(T, k.x, k.y, this.loc); if (this.loc.ok) { k.s = k.lastS = this.loc.s; k.lat = this.loc.d; }
  this.ev('balloon', k.i, 0);
};

/* ---------- karts bumping into each other (giants shove, tiny karts boing) ---------- */
P.bumps = function () {
  const ks = this.karts, n = ks.length, ext = this.ext;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const A = ks[a], B = ks[b];
    if (A.fall || B.fall || A.lift || B.lift || Math.abs(A.z - B.z) > 1 || A.aim || B.aim) continue;
    const ra = K.R * (A.tiny ? 0.6 : A.giant ? A.scale : 1), rb = K.R * (B.tiny ? 0.6 : B.giant ? B.scale : 1), R2 = ra + rb;
    const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy; if (!(d2 < R2 * R2) || d2 < 1e-9) continue;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = R2 - d;
    const ga = A.giant > 0, gb = B.giant > 0;
    if (ga !== gb) {   /* a giant: the other kart is shoved aside and spins (the shield blocks it) */
      const Gk = ga ? A : B, V = ga ? B : A, s = ga ? 1 : -1;
      if (!ext[V.i]) {
        V.x += nx * ov * s; V.y += ny * ov * s; V.px += nx * 7 * s; V.py += ny * 7 * s;
        if (!V.boingT) { V.boingT = 30; this.hit(V, 'spin', 'giant', Gk.i); }
      }
      continue;
    }
    if ((A.tiny > 0) !== (B.tiny > 0)) {   /* a full-size kart touching a tiny one: the tiny one boings away (nobody is squashed) */
      const Tn = A.tiny ? A : B, O = A.tiny ? B : A, s = A.tiny ? -1 : 1;
      if (!ext[Tn.i]) { Tn.x += nx * ov * s; Tn.y += ny * ov * s; if (!Tn.boingT) this.boing(Tn, O); }
      continue;
    }
    const fa = ext[a] ? 0 : ext[b] ? 1 : 0.5, fb = 1 - fa;
    A.x -= nx * ov * fa; A.y -= ny * ov * fa; B.x += nx * ov * fb; B.y += ny * ov * fb;
    const rv = (Math.cos(A.dir) * A.v - Math.cos(B.dir) * B.v) * nx + (Math.sin(A.dir) * A.v - Math.sin(B.dir) * B.v) * ny;
    const imp = Math.max(2.5, Math.min(7, rv * 0.6));
    if (!ext[a]) { A.px -= nx * imp; A.py -= ny * imp; } if (!ext[b]) { B.px += nx * imp; B.py += ny * imp; }
    if (rv > 0) { if (!ext[a]) A.v *= 0.97; }
    if (!A.bumpT && !B.bumpT) { this.ev('bump', a, b); A.bumpT = B.bumpT = 30; }
  }
};
P.boing = function (k, src) {
  const dx = k.x - src.x, dy = k.y - src.y, d = Math.hypot(dx, dy) || 1;
  k.px += dx / d * 9; k.py += dy / d * 9; k.slow = Math.max(k.slow, 24); k.boingT = 60; this.ev('boing', k.i, src.i);
};

/* ---------- TAILWIND: tuck in behind a kart to charge a wind boost ---------- */
P.stepDraft = function () {
  const ks = this.karts, VT = this.VT;
  for (const k of ks) {
    if (this.ext[k.i] || k.draft < 0 || k.finished && !this.auto(k)) continue;
    let inCone = 0;
    if (!k.giant && !k.air && k.z < 0.2 && k.v > 0.6 * VT && !k.fall && !k.lift) {
      const c = Math.cos(k.dir), s = Math.sin(k.dir);
      for (const o of ks) {
        if (o === k || o.giant || o.air || o.z > 0.2 || o.v <= 0.6 * VT || o.fall || o.lift) continue;
        const dx = o.x - k.x, dy = o.y - k.y, al = dx * c + dy * s; if (al < 3.5 || al > DRAFT_FAR) continue;
        if (Math.abs(-dx * s + dy * c) >= 1.6 || Math.abs(wrapA(o.dir - k.dir)) >= 0.5) continue;
        inCone = al < 8 ? DRAFT_NEAR : DRAFT_RATE; break;
      }
    }
    if (inCone) k.draft = Math.min(60, k.draft + inCone * (k.tiny ? 1.5 : 1)); else k.draft = Math.max(0, k.draft - 2);
    if (k.draft >= 60) { k.boost = Math.max(k.boost, 45); k.v = Math.max(k.v, 1.08 * VT); k.draft = -90; k.stats.tailwinds++; this.ev('tailwind', k.i, 0); }
  }
};

/* ---------- effects: spin, bonk, wobble, tiny, boing (SPEC 4) ---------- */
P.hit = function (k, kind, by, own, o) {
  if (!k || this.ext[k.i] || k.fall || k.lift) return 'none';
  kind = kind === 'hit' ? 'spin' : kind;
  if (kind === 'boing') { if (k.boingT || k.giant) return 'none'; this.boing(k, o && o.src ? o.src : { x: k.x - Math.cos(k.dir), y: k.y - Math.sin(k.dir), i: own }); return 'hit'; }
  if (k.giant > 0) { if (ITEM_BY[by] || this.clock - k.immT >= 60) { k.immT = this.clock; this.ev('immune', k.i, by); } return 'immune'; }   /* a hazard's: once a second, not every tick */
  if (k.inv > 0) return 'none';
  if (kind === 'wobble' && k.wobI > 0) return 'none';
  if (this.clock - k.fxT[0] < 600) return 'none';   /* the frustration guard: never more than 3 effects in 10 s */
  if (k.shield && kind !== 'wobble') { k.shield = 0; k.inv = 30; k.stats.shieldSaves++; this.ev('shield', k.i, 'pop'); return 'shield'; }
  const VT = this.VT, push = (dx, dy, m) => { const l = Math.hypot(dx, dy) || 1; k.px += dx / l * m; k.py += dy / l * m; };
  if (kind === 'spin') {
    const short = o && o.short;   /* daisy petals: a short twirl-spin (fix round 1: a wobble cost almost nothing) */
    k.spin = short ? 36 : K.SPIN; k.drift = 0; k.dc = 0; k.mt = 0; k.boost = 0; k.inv = this.cls === 0 ? 144 : 96; k.v = Math.min(k.v, (short ? 0.8 : 0.7) * VT);
    if ((by === 'blue' || by === 'lob') && o && o.dir != null) push(Math.cos(o.dir), Math.sin(o.dir), this.cls === 0 ? 2.5 : 4);
    if (by === 'petal' && o && o.src) push(k.x - o.src.x, k.y - o.src.y, 4);
  } else if (kind === 'bonk') {
    k.bonk = 48; if (!k.air) { k.vz = Math.max(k.vz, 5); k.z = Math.max(k.z, 0.01); } k.v = Math.min(k.v * 0.6, 0.6 * VT); k.drift = 0; k.dc = 0; k.mt = 0; k.inv = this.cls === 0 ? 135 : 90;
  } else if (kind === 'wobble') {
    k.wob = 36; k.dc *= 0.5; k.wobI = this.cls === 0 ? 240 : 120;   /* one wobble at a time through a row of sprinklers, vents or petals (EASY: longer) */
    if (by === 'petal' && o && o.src) push(k.x - o.src.x, k.y - o.src.y, 4);
  } else if (kind === 'tiny') {
    k.tiny = k.place === 1 ? 300 : 240;
  } else return 'none';
  this.ev(kind, k.i, by);
  k.lastHit = this.clock; k.fxT[0] = k.fxT[1]; k.fxT[1] = k.fxT[2]; k.fxT[2] = this.clock;
  const st = k.stats; st.got[kind] = (st.got[kind] | 0) + 1;
  if (ITEM_BY[by]) { k.lastItemHit = this.clock; st.gotBy.item++; if (own >= 0 && own !== k.i && this.karts[own]) this.karts[own].stats.gave++; } else st.gotBy.hazard++;
  return 'hit';
};

/* ---------- items ---------- */
P.giveItem = function (k) {
  const id = this.rollItem(k);
  k.item = id; k.itemN = SK.ITEM_USES[id] || 1; k.rolls[0] = k.rolls[1]; k.rolls[1] = id; k.stats.items++;
  this.ev('item', k.i, SK.ITEMS[id]);
  if (k._lucky) this.ev('lucky', k.i, k._lucky);
};
P.inFlight = function (kind) { let n = 0; for (const it of this.items) if (it.k === kind) n++; return n; };
/* is this kart a final-lap leader having a breather from leader attacks (fix round 1)? A puff or ribbon on its way to it counts */
P.leadCool = function (L) {
  if (!L || L.finished || L.lap !== this.track.laps) return false;
  if (this.clock - L.atkAt < LEAD_COOL) return true;
  for (const it of this.items) if ((it.k === 'puff' && it.tgt === L.i) || (it.k === 'wave' && ((it.mask >> L.i) & 1) && !((it.done >> L.i) & 1)) || (it.k === 'blue' && it.tgt === L.i)) return true;
  return false;
};
/* a leader-targeted attack thrown at L now (it starts the breather) */
P.leadHit = function (L) { if (L && L.place === 1) L.atkAt = this.clock; };
P.rollItem = function (k) {
  const ks = this.karts, n = ks.length, T = this.track, ord = this.order;
  const base = Math.round((k.place - 1) * 5 / Math.max(1, n - 1));
  const lead = ks[ord[0]], second = ks[ord[1]], gapL = lead && lead !== k ? Math.max(0, lead.rp - k.rp) : 0;
  /* luck moves the row down the table: the biggest of far-behind (+1 / +2), LUCKY (an item hit you in the last 4 s: +1) and
     FINAL LAP FRENZY (+1), not their sum; a long-way bubble (+1) and a sky bubble (+2) add; never more than +2 in all
     (fix round 1: the shifts stacked into a giant-heavy catch-up that made mid-race mistakes cost nothing) */
  let shift = 0, lucky = 0;
  if (k.place >= 2 && k.place <= 5 && lead) shift = gapL > 200 ? 2 : gapL > 100 ? 1 : 0;
  if (this.clock - k.lastItemHit < LUCKY_T) { if (shift < 1) shift = 1; lucky = 1; }
  const frenzy = k.lap === T.laps && k.place >= 2;
  const shiftNF = shift;
  if (frenzy && shift < 1) shift = 1;
  let add = 0;
  if (k.rollLong) { add += 1; k.rollLong = 0; }
  if (k.rollSky) { add += 2; lucky = 1; k.rollSky = 0; }
  /* EASY: a player's own rolls start from the 3rd row, so the fun items reach a kid who is always in front */
  const r0 = !k.cpu && this.cls === 0 ? Math.max(base, 2) : base;
  const row = Math.min(5, r0 + Math.min(2, shift + add)), rowNF = Math.min(5, r0 + Math.min(2, shiftNF + add));
  const w = ODDS[row].slice();
  /* the frenzy lifts the boosts and the giant, not the leader attacks */
  if (rowNF !== row) { w[I_PUFF - 1] = ODDS[rowNF][I_PUFF - 1]; w[I_THYME - 1] = ODDS[rowNF][I_THYME - 1]; }
  /* leader pressure by the leader's lead, not by place: a big lead draws more attacks, a close race at the front fewer */
  if (lead && !lead.finished && second && k.place >= 2) {
    const lg = lead.rp - second.rp;
    if (lg > LEAD_GAP) { w[I_PUFF - 1] *= 2; w[I_BLUE - 1] *= 1.3; w[I_THYME - 1] *= 1.3; }
    else if (lg < 20) { w[I_PUFF - 1] *= 0.5; w[I_THYME - 1] *= 0.6; }
  }
  if (k.cpu && lead && !lead.cpu) { const hb = this.rowOf(k).hb; w[I_BLUE - 1] *= hb; w[I_PUFF - 1] *= hb; w[I_THYME - 1] *= hb; }
  let giants = 0, held = 0; for (const o of ks) { if (o.giant > 0 || o.item === I_GIANT) giants++; if (o.item === I_GIANT) held++; }
  const giantRoom = giants < 2 && this.giantsUsed + held < GIANT_CAP, giantOk = giantRoom && !(k.lap <= 1 && this.clock < 1200);
  /* the giant is the catch-up leaf: for karts well behind the leader (50 m: none, 100 m and more: the table's odds) */
  w[I_GIANT - 1] *= giantOk ? clamp((gapL - 50) / 50, 0, 1) : 0;
  if (this.inFlight('puff') || this.clock < 900 || this.clock - this.puffAt < 720 || k.place === 1) w[I_PUFF - 1] = 0;
  if (this.inFlight('wave') || this.clock - this.thymeAt < 720 || k.place === 1) w[I_THYME - 1] = 0;
  if (k.place === 1 || this.inFlight('blue') >= 3) w[I_BLUE - 1] = 0;
  /* a final-lap leader's breather: nothing more for it from behind for a while */
  if (lead && lead !== k && this.leadCool(lead)) { w[I_PUFF - 1] = 0; w[I_THYME - 1] = 0; if (k.place === 2) w[I_BLUE - 1] = 0; }
  if (k.cpu && k.diff === 0) { w[I_PUFF - 1] = 0; w[I_THYME - 1] *= 0.15; w[I_BLUE - 1] *= 0.25; }   /* EASY CPUs: a hoppable ribbon now and then, fewer berries (fix round 1: they race closer now) */
  if (this.inFlight('splat') >= 8) { w[I_SPLAT - 1] *= 0.3; w[I_SPLAT3 - 1] *= 0.3; }
  /* SUPER LUCKY: a GIANT SPROUT for a kart left far behind (once a lap) */
  if (k.place >= 5 && k.superLap !== k.lap) {
    const ahead = ks[ord[k.place - 2]], far = ahead && ahead.rp - k.rp > SUPER_GAP;
    const CU = [I_BOOST3, I_PUFF, I_THYME, I_GIANT], dry = CU.indexOf(k.rolls[0]) < 0 && CU.indexOf(k.rolls[1]) < 0;
    if (far || (k.pity > 1200 && dry)) { k.superLap = k.lap; k._lucky = 2; k.superG = 1; return giantRoom ? I_GIANT : I_BOOST3; }
  }
  k._lucky = lucky;
  let tot = 0; for (const x of w) tot += x;
  if (tot <= 0) return I_BOOST;
  let r = this.rand() * tot; for (let j = 0; j < w.length; j++) { r -= w[j]; if (r < 0) return j + 1; }
  return I_BOOST;
};
P.clearItem = function (k) { k.item = 0; k.itemN = 0; };
P.addItem = function (o) { if (this.items.length >= 40) return null; o.id = this.nextId++; o.age = 0; this.items.push(o); return o; };
P.puddleCap = function () {
  let n = 0, old = null; for (const it of this.items) if (it.k === 'splat' && it.age < it.life) { n++; if (!old || it.age > old.age) old = it; }
  if (n > 8 && old) old.life = old.age;
};
/* why an item can't go now ('' = it can): a wish puff while another floats, a puff or a ribbon with nobody to go after. Such an
   item is kept, never wasted, and the HUD says why (fix round 1) */
P.whyNot = function (k) {
  const it = k.item;
  if (it === I_PUFF) { if (this.inFlight('puff')) return 'a wish puff is already floating'; const t = this.puffTgt(k); if (!t) return 'nobody to float to'; }
  else if (it === I_THYME) { if (this.inFlight('wave')) return 'a thyme ribbon is already out'; if (!this.thymeMask(k)) return 'nobody ahead of you'; }
  return '';
};
P.puffTgt = function (k) { const ks = this.karts; let t = ks[this.order[0]]; if (t === k) t = ks[this.order[1]]; return t && t !== k && !t.finished ? t : null; };
P.thymeMask = function (k) { let m = 0; for (const o of this.karts) if (!o.finished && o.place < k.place) m |= 1 << o.i; return m; };
P.useItem = function (k, fwd) {
  const i = k.i, it = k.item, c = Math.cos(k.dir), s = Math.sin(k.dir), VT = this.VT, T = this.track;
  if (!it) return;
  if ((it === I_PUFF || it === I_THYME) && this.whyNot(k)) return;   /* kept for later */
  this.ev('use', i, it); k.stats.used++;
  if (it === I_BOOST || it === I_BOOST3) {
    k.boost = Math.max(k.boost, 72); k.v = Math.max(k.v, VT * 1.1); this.ev('boost', i, 'berry');
    if (--k.itemN <= 0) this.clearItem(k); return;
  }
  if (it === I_SPLAT || it === I_SPLAT3) {
    if (fwd) {
      const v = Math.max(0, k.v) + 12;
      this.addItem({ k: 'lob', x: k.x + c * 1.5, y: k.y + s * 1.5, z: 0.8 + k.z, vx: c * v, vy: s * v, vz: 7, own: i, life: 300, dir: k.dir });
    } else {
      const sc = k.scale || 1, p = this.addItem({ k: 'splat', x: k.x - c * 2.4 * sc, y: k.y - s * 2.4 * sc, z: 0, own: i, life: 1500, s: 0, lat: 0, dg: 0, dy: 0 });
      if (p) { SK.locate(T, p.x, p.y, this.loc2); p.s = this.loc2.s; p.lat = this.loc2.d; p.cut = this.loc2.cut; this.puddleCap(); }
      this.ev('splat', i, 'drop');
    }
    if (--k.itemN <= 0) this.clearItem(k); return;
  }
  if (it === I_BLUE) {
    let tgt = -1; for (const o of this.karts) if (o.place === k.place - 1 && !o.finished) tgt = o.i;
    if (this.inFlight('blue') >= 3) { let old = null; for (const q of this.items) if (q.k === 'blue' && (!old || q.age > old.age)) old = q; if (old) old.life = 0; }
    this.addItem({ k: 'blue', x: k.x + c * 1.5, y: k.y + s * 1.5, z: 0.6, s: k.s + 1.5, rp: k.rp + 1.5, lat: k.cut < 0 ? clamp(k.lat, -T.hw, T.hw) : 0, dir: k.dir, tgt, ph: 0, own: i, life: tgt < 0 ? 240 : 600, wait: 0 });
    if (tgt >= 0) this.leadHit(this.karts[tgt]);
    this.ev('blue', i, tgt); this.clearItem(k); return;
  }
  if (it === I_SWIRL) {
    if (!k.swirl) { k.swirl = 600; k.petals = 31; k.swA = 0; k.itemN = 1; this.ev('swirl', i, 0); return; }
    const pts = Sim.petals(k, this.pt); let nf = 0;
    for (let j = 0; j < 5; j++) {
      if (!pts[j].alive) continue; const a = k.dir + (j - 2) * FLING_SPREAD, v = Math.max(0, k.v) + 18;
      this.addItem({ k: 'petal', x: pts[j].x, y: pts[j].y, z: 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, own: i, life: 45 }); nf++;
    }
    this.ev('fling', i, nf); k.swirl = 0; k.petals = 0; this.clearItem(k); return;
  }
  if (it === I_SHIELD) { k.shield = 900; this.ev('shield', i, ''); this.clearItem(k); return; }
  if (it === I_PUFF) {
    const tgt = this.puffTgt(k);
    this.addItem({ k: 'puff', rp: k.rp, s: k.s, tgt: tgt.i, ph: 0, pt: 0, x: k.x, y: k.y, z: 1, own: i, life: 1200 }); this.leadHit(tgt);
    this.ev('puff', i, tgt.i); this.clearItem(k); return;
  }
  if (it === I_THYME) {
    /* the ribbon starts at least WAVE_BACK m behind the nearest kart it goes after, so even the racer just ahead sees HOP! coming */
    const mask = this.thymeMask(k); let near = 1e9; for (const o of this.karts) if ((mask >> o.i) & 1) { near = Math.min(near, o.rp); if (o.place === 1) this.leadHit(o); }
    const rp = Math.min(k.rp, near - WAVE_BACK), s0 = k.s - (k.rp - rp), p = T.pos(s0, 0, this.tp);
    this.addItem({ k: 'wave', rp, s: ((s0 % T.L) + T.L) % T.L, mask, done: 0, x: p.x, y: p.y, z: 0, own: i, life: 480, V: 45 });
    this.thymeAt = this.clock; this.ev('thyme', i, pop(mask)); this.clearItem(k); return;
  }
  if (it === I_GIANT) {
    const pl = k.superG ? 6 : k.place, G = pl <= 3 ? [240, 1.25] : pl === 4 ? [300, 1.32] : pl === 5 ? [360, 1.38] : [420, 1.38];
    k.giant = G[0]; k.gmul = G[1]; k.tiny = 0; k.superG = 0; k.drift = 0; k.dc = 0; k.mt = 0; this.giantsUsed++; this.ev('giant', i, 1); this.clearItem(k); return;
  }
};
/* DAISY SWIRL: the petals that orbit their kart */
P.stepSwirl = function () {
  const ks = this.karts, pts = this.pt;
  for (const k of ks) {
    if (!k.swirl) continue;
    if (!this.ext[k.i]) { k.swirl--; k.swA++; }
    Sim.petals(k, pts);
    for (let j = 0; j < 5; j++) {
      const p = pts[j]; if (!p.alive) continue;
      for (const o of ks) {
        if (o === k || o.fall || o.lift || this.ext[o.i]) continue;
        const dx = o.x - p.x, dy = o.y - p.y; if (dx * dx + dy * dy >= PETAL_R2 || Math.abs(o.z + 0.4 - p.z) >= 1.2) continue;
        const r = this.hit(o, 'spin', 'petal', k.i, { src: k, short: 1 });
        if (r !== 'none') { k.petals &= ~(1 << j); this.ev('petal', o.i, k.i * 8 + j); break; }
      }
      if (!((k.petals >> j) & 1)) continue;
      for (const it of this.items) if (it.k === 'splat' && it.age < it.life && (it.x - p.x) ** 2 + (it.y - p.y) ** 2 < 1.44) { it.life = it.age; k.petals &= ~(1 << j); this.ev('splat', k.i, 'soak'); break; }
    }
    if (!this.ext[k.i] && (!k.swirl || !k.petals)) { k.swirl = 0; k.petals = 0; if (k.item === I_SWIRL) this.clearItem(k); }
  }
};
P.stepItems = function () {
  const T = this.track, ks = this.karts, L = this.loc2, its = this.items, VT = this.VT; let w = 0;
  for (let j = 0; j < its.length; j++) {
    const it = its[j]; it.age++; let keep = it.age < it.life;
    if (!keep) { if (it.k === 'blue') this.ev('pop', -1, 'blue'); else if (it.k === 'puff') this.ev('pop', -1, 'puff'); }
    else if (it.k === 'splat') {
      for (const k of ks) {
        if (!keep || (k.i === it.own && it.age < 40) || k.z >= 0.6 || this.ext[k.i] || k.fall || k.lift) continue;
        const r2 = 2.89 * Math.max(1, k.scale * k.scale * 0.6); if ((k.x - it.x) ** 2 + (k.y - it.y) ** 2 >= r2) continue;
        if (k.giant) { keep = false; this.ev('splat', k.i, 'squash'); continue; }
        const r = this.hit(k, 'spin', 'splat', it.own); if (r !== 'none') { keep = false; this.ev('splat', k.i, 'hit'); }
      }
    } else if (it.k === 'lob') {
      it.vz -= K.GRAV * DT; it.x += it.vx * DT; it.y += it.vy * DT; it.z += it.vz * DT;
      SK.locate(T, it.x, it.y, L);
      let land = it.z <= 0;
      if (L.ok && T.edge === 'wall' && L.dist > L.lim - 0.3) { const f = (L.lim - 0.3) / Math.max(1e-6, L.dist); it.x = L.cx + (it.x - L.cx) * f; it.y = L.cy + (it.y - L.cy) * f; land = true; }
      else if (!L.ok && T.edge === 'wall') land = true;
      if (land) {
        const cell = ws(T, it.x, it.y);
        if (!L.ok || cell === S_VOID || cell < 0) keep = false;   /* over the sky: it falls away */
        else {
          it.k = 'splat'; it.z = 0; it.age = 0; it.life = 1500; it.s = L.s; it.lat = L.d; it.cut = L.cut; it.dg = 0; it.dy = 0; this.ev('splat', it.own, 'land');
          for (const k of ks) if (!this.ext[k.i] && k.z < 1.2 && (k.x - it.x) ** 2 + (k.y - it.y) ** 2 < 2.56) { const r = this.hit(k, 'spin', 'lob', it.own, { dir: Math.atan2(it.vy, it.vx) }); if (r === 'hit') { keep = false; this.ev('splat', k.i, 'hit'); break; } }
          if (keep) this.puddleCap();
        }
      }
    } else if (it.k === 'blue') keep = this.stepBlue(it);
    else if (it.k === 'puff') keep = this.stepPuff(it);
    else if (it.k === 'wave') keep = this.stepWave(it);
    else if (it.k === 'petal') {
      this.petalHome(it);
      it.x += it.vx * DT; it.y += it.vy * DT;
      SK.locate(T, it.x, it.y, L);
      if (!L.ok || ws(T, it.x, it.y) === S_WALL) keep = false;
      else for (const k of ks) {
        if (k.i === it.own || this.ext[k.i] || k.fall || k.lift || Math.abs(k.z + 0.4 - it.z) >= 1.2) continue;
        if ((k.x - it.x) ** 2 + (k.y - it.y) ** 2 < FLUNG_R2) { const o = ks[it.own]; this.hit(k, 'spin', 'petal', it.own, { src: o || it, short: 1 }); this.ev('petal', k.i, it.own * 8 + 7); keep = false; break; }
      }
    }
    if (keep) its[w++] = it;
  }
  its.length = w;
};
/* a flung petal leans a little towards the nearest kart in front of it (within 25 m and 25 degrees): up to 2.4 degrees a tick */
P.petalHome = function (it) {
  const a = Math.atan2(it.vy, it.vx), v = Math.hypot(it.vx, it.vy); let best = null, bd = 625;
  for (const k of this.karts) {
    if (k.i === it.own || k.fall || k.lift) continue;
    const dx = k.x - it.x, dy = k.y - it.y, d2 = dx * dx + dy * dy; if (d2 >= bd || d2 < 0.01) continue;
    if (Math.abs(wrapA(Math.atan2(dy, dx) - a)) > 0.44) continue; bd = d2; best = k;
  }
  if (!best) return;
  const na = a + clamp(wrapA(Math.atan2(best.y - it.y, best.x - it.x) - a), -0.042, 0.042); it.vx = Math.cos(na) * v; it.vy = Math.sin(na) * v;
};
/* BLUEBERRY BOUNCE: bounces along the road after the racer just ahead, then homes in; it always gets there */
P.stepBlue = function (it) {
  const T = this.track, ks = this.karts, own = ks[it.own];
  let tk = it.tgt >= 0 ? ks[it.tgt] : null;
  if (tk && tk.finished) {
    let nt = -1; if (own) for (const o of ks) if (o.place === own.place - 1 && !o.finished && o !== own) nt = o.i;
    if (nt < 0) { this.ev('pop', -1, 'blue'); return false; }
    it.tgt = nt; tk = ks[nt]; it.ph = 0;
  }
  const V = Math.max(40, (tk ? tk.v : 0) + 10 + Math.max(0, it.age - 240) * 0.1);   /* after 4 s it closes faster, so even a target on a long boost is reached */
  if (tk && it.age >= it.life - 1 && it.age < 1200) it.life = it.age + 2;   /* it always gets there: no running out of life while its target is still racing */
  if (tk && (tk.fall || tk.lift)) { it.z = 1.2 + 0.3 * Math.sin(it.age * 0.2); return true; }   /* waits for its target */
  if (it.ph === 0) {
    it.s = (it.s + V * DT) % T.L; it.rp += V * DT;
    if (tk && tk.rp - it.rp < 40) it.lat += ((tk.cut < 0 ? tk.lat : 0) - it.lat) * 0.08;
    const p = T.pos(it.s, it.lat, it.tp || (it.tp = {})); it.dir = Math.atan2(p.y - it.y, p.x - it.x) || it.dir; it.x = p.x; it.y = p.y;
    it.z = 1.2 * Math.abs(Math.sin(it.age * PI / 15));
    if (tk && ((tk.x - it.x) ** 2 + (tk.y - it.y) ** 2 < 26 * 26 || it.rp > tk.rp + 5)) it.ph = 1;
    if (!tk) {   /* thrown by the leader: it hits the first kart it meets on the road */
      for (const k of ks) if (k.i !== it.own && !k.fall && !k.lift && (k.x - it.x) ** 2 + (k.y - it.y) ** 2 < 2.25 && Math.abs(k.z - it.z) < 2.5) {
        if (this.ext[k.i]) continue;
        this.blueHit(it, k); return false;
      }
    }
  } else {
    /* still dizzy from a hit a moment ago: it bobs just behind its target for up to a second, then lands (fix round 1: it used
       to splash on a kart that could not be hit, and nothing on screen said why) */
    const d2 = (tk.x - it.x) ** 2 + (tk.y - it.y) ** 2;
    if (tk.inv > 0 && !tk.giant && it.wait < 60 && d2 < 36) {
      it.wait = (it.wait | 0) + 1; it.dir = tk.dir;
      it.x += (tk.x - Math.cos(tk.dir) * 2.2 - it.x) * 0.35; it.y += (tk.y - Math.sin(tk.dir) * 2.2 - it.y) * 0.35; it.rp = tk.rp - 2.2;
      it.z = tk.z + 1.1 + 0.4 * Math.abs(Math.sin(it.age * PI / 15));
      return true;
    }
    const want = Math.atan2(tk.y - it.y, tk.x - it.x); it.dir = wrapA(it.dir + clamp(wrapA(want - it.dir), -0.15, 0.15));
    it.x += Math.cos(it.dir) * V * DT; it.y += Math.sin(it.dir) * V * DT; it.rp += V * DT;
    it.z += (tk.z + 0.7 + 0.5 * Math.abs(Math.sin(it.age * PI / 15)) - it.z) * 0.25;
  }
  if (tk && !this.ext[tk.i]) {
    const sc = Math.max(0.6, tk.scale || 1);
    if ((tk.x - it.x) ** 2 + (tk.y - it.y) ** 2 < (1.5 * sc) ** 2 && Math.abs(tk.z - it.z) < 2.5) { this.blueHit(it, tk); return false; }
  }
  return true;
};
P.blueHit = function (it, tk) {
  const r = this.hit(tk, 'spin', 'blue', it.own, { dir: it.dir });
  if (r === 'none') this.ev('immune', tk.i, 'blue');   /* SAFE!: still dizzy from the last hit (or the 3-in-10-s guard) */
  for (const o of this.karts) if (o !== tk && o.i !== it.own && !this.ext[o.i] && (o.x - tk.x) ** 2 + (o.y - tk.y) ** 2 < 9) this.hit(o, 'wobble', 'blue', it.own);
  this.ev('splash', tk.i, 'blue');
};
/* WISH PUFF: floats along the road over everyone to whoever is 1st, hovers ("LOOK UP!"), then drops */
P.stepPuff = function (it) {
  const T = this.track, tk = this.karts[it.tgt];
  if (!tk || tk.finished) { this.ev('pop', -1, 'puff'); return false; }
  if (it.ph === 0) {
    it.rp += 50 * DT; it.s = (it.s + 50 * DT) % T.L;
    const p = T.pos(it.s, 0, it.tp || (it.tp = {})); it.x = p.x; it.y = p.y; it.z = Math.min(7, 1 + 6 * it.age / 30);
    if (tk.rp - it.rp < 15) { it.ph = 1; it.pt = 0; this.ev('puffhover', tk.i, 0); }
    return true;
  }
  if (!tk.fall && !tk.lift) it.pt++;
  it.x += (tk.x - Math.cos(tk.dir) - it.x) * 0.3; it.y += (tk.y - Math.sin(tk.dir) - it.y) * 0.3;
  if (it.ph === 1) { it.z = 7; if (it.pt >= 50) { it.ph = 2; it.pt = 0; } return true; }
  it.z = 7 - (7 - 0.8) * Math.min(1, it.pt / 12);
  if (it.pt >= 12) {
    if (this.ext[tk.i]) { this.ev('puffpop', tk.i, 0); return false; }
    if (this.hit(tk, 'bonk', 'puff', it.own) === 'none') this.ev('immune', tk.i, 'puff');
    for (const o of this.karts) if (o !== tk && !this.ext[o.i] && (o.x - tk.x) ** 2 + (o.y - tk.y) ** 2 < 25) this.hit(o, 'wobble', 'puff', it.own);
    this.puffAt = this.clock; this.ev('puffpop', tk.i, 0); return false;
  }
  return true;
};
/* TINY THYME: a sparkle ribbon races up the road; everyone ahead goes tiny unless they hop it. Near its next target it closes at
   WAVE_CLOSE m/s (about 0.7 s from the HOP! cue to the ribbon), far away it races at up to 100 m/s; a hop pressed in the last
   HOP_WIN ticks before it passes (or being in the air) dodges it (fix round 1: the old window was shorter than a kid's
   reaction time). An online guest's kart (ext) is ranked where it is now (sim.extRp, net.js) and stays the target until the
   guest says hit or dodge */
P.stepWave = function (it) {
  const T = this.track, ks = this.karts, ex = this.extRp;
  let dNext = 1e9, vNext = 0, vNear = -1;
  for (const k of ks) {
    const b = 1 << k.i; if (!(it.mask & b) || (it.done & b)) continue;
    if (k.finished) { it.done |= b; continue; }
    const rp = this.ext[k.i] && ex ? ex(k) : k.rp, d = rp - it.rp, v = Math.max(0, k.v);
    if (this.ext[k.i] && d < 0) { dNext = 0; vNear = Math.max(vNear, v); continue; }   /* passed here, not yet told there: keep closing on it */
    if (d >= 0 && d < dNext) { dNext = d; vNext = v; }
    if (d >= 0 && d < 40) vNear = Math.max(vNear, v);   /* closes at WAVE_CLOSE on the fastest target near it, so HOP! always leads by 0.4-0.75 s */
  }
  if ((it.done & it.mask) === it.mask) return false;
  const V = it.V = Math.min(100, (vNear >= 0 ? vNear : vNext) + WAVE_CLOSE + Math.max(0, Math.min(1e3, dNext) - 40) * 2);
  it.rp += V * DT; it.s = (it.s + V * DT) % T.L;
  const p = T.pos(it.s, 0, it.tp || (it.tp = {})); it.x = p.x; it.y = p.y;
  for (const k of ks) {
    const b = 1 << k.i; if (!(it.mask & b) || (it.done & b) || it.rp < k.rp) continue;
    if (this.ext[k.i]) continue;   /* online: the victim decides */
    it.done |= b;
    if (k.fall || k.lift) continue;
    if (k.z > 0.15 || this.clock - k.hopAt <= HOP_WIN) { k.stats.dodges++; this.ev('dodge', k.i, 'thyme'); }
    else this.hit(k, 'tiny', 'thyme', it.own);
  }
  return (it.done & it.mask) !== it.mask;
};
/* the thyme ribbon's HOP! cue for kart k (render, main, net): the ribbon is coming and within HOP_D m */
Sim.hopCue = (it, k) => { const d = k.rp - it.rp; return d > 0 && d < HOP_D; };
Sim.HOP_WIN = HOP_WIN; Sim.HOP_D = HOP_D; Sim.LEAD_COOL = LEAD_COOL;
P.stepBoxes = function () {
  const bx = this.boxes, ks = this.karts, laps = this.track.laps, R2 = K.BOX_R * K.BOX_R;
  for (let j = 0; j < bx.length; j++) {
    const b = bx[j];
    if (b.t > 0) { b.t--; continue; }
    for (let q = 0; q < ks.length; q++) {
      const k = ks[q], dx = k.x - b.x, dy = k.y - b.y;
      if (dx * dx + dy * dy >= R2 || k.fall || k.lift || Math.abs(k.z - b.z) >= 1.0) continue;
      if (k.item || k.roll || k.swirl) continue;   /* a kart that already has an item passes through (v2: bubbles are not wasted in a pack) */
      b.t = k.lap === laps ? K.BOX_FINAL : K.BOX_BACK; this.ev('box', k.i, 0); k.roll = 54; k.rollSky = b.sky; k.rollLong = b.long; break;
    }
  }
};

/* ---------- hazards: pure functions of the race clock (tracks.js SK.hazState) ---------- */
P.stepHazards = function () {
  const T = this.track, HZ = T.hazards; if (!HZ || !HZ.length || !SK.hazState) return;
  const hs = this.hs, ks = this.karts, clock = this.clock;
  for (let h = 0; h < HZ.length; h++) {
    const H = HZ[h]; SK.hazState(T, H, clock, hs);
    if (H.k === 'mover') {
      if (H.path === 'cross' && clock >= (SK.HAZ_START || 480) && ((clock + H.off) % H.every + H.every) % H.every === 0) this.ev('hspawn', -1, h);
    } else if (hs.ph !== this.hph[h]) { if (hs.ph === 1) this.ev('htell', -1, h); else if (hs.ph === 2) this.ev('hact', -1, h); this.hph[h] = hs.ph; }
    if (!hs.n || (hs.ph !== 2 && H.k !== 'mover')) continue;
    const C = H.on >= 0 ? T.cuts[H.on] : null;
    for (const k of ks) {
      if (this.ext[k.i] || k.fall || k.lift || k.aim) continue;
      if (H.k === 'spray') {
        if (k.z >= 1.5) continue;
        let inside;
        if (H.half != null && H.l0 != null) { if (k.cut !== H.on) continue; const a = H.on < 0 ? k.s : k.u, d = H.on < 0 ? wrapS(a - H.a, T.L) : a - H.a; inside = Math.abs(d) < H.half && k.lat >= H.l0 && k.lat <= H.l1; }
        else inside = (k.x - hs.x[0]) ** 2 + (k.y - hs.y[0]) ** 2 < (H.r + 0.4 * k.scale) ** 2;
        if (!inside) continue;
        if (H.skin === 'steam' && !k.air && k.z <= 0) { this.hit(k, 'wobble', 'steam', -1); this.launchV(k, H.lift || 3.5, 'steam'); }
        else this.hit(k, 'wobble', H.skin, -1);
      } else if (H.k === 'mover') {
        const r = H.r + 0.85 * k.scale;
        for (let j = 0; j < hs.n; j++) {
          const dx = k.x - hs.x[j], dy = k.y - hs.y[j]; if (dx * dx + dy * dy >= r * r) continue;
          if (H.path === 'cross') { if (k.z < 2 * H.r) this.hit(k, 'bonk', H.skin, -1); }
          else if (Math.abs(k.z - 1.2 + 0.6) < 1.4) this.hit(k, 'wobble', 'basket', -1);
        }
      } else if (H.k === 'gust') {
        if (k.giant || k.cut !== H.on) continue;
        const a = H.on < 0 ? k.s : k.u, d = H.on < 0 ? wrapS(a - H.a, T.L) : a - H.a; if (Math.abs(d) >= H.half) continue;
        const ang = H.on < 0 ? T.ANG[Math.floor(((k.s % T.L) + T.L) % T.L / T.ds) % T.N] : C.ANG[clamp(Math.floor(k.u / C.ds), 0, C.n - 1)];
        const nx = -Math.sin(ang) * H.dir, ny = Math.cos(ang) * H.dir, m = (this.cls === 0 ? 0.6 : 1) * (k.tiny ? 1.5 : 1);
        if (k.px * nx + k.py * ny < H.cap * m) { k.px += nx * H.acc * m * DT; k.py += ny * H.acc * m * DT; }
      } else if (H.k === 'piston') {
        if (k.giant || k.air) continue;
        const dx = k.x - hs.x[0], dy = k.y - hs.y[0], d2 = dx * dx + dy * dy, r = H.r + K.R * 0.6;
        if (d2 >= r * r) continue;
        if (hs.fr * H.act < 1) { this.launchV(k, 8, 'piston'); continue; }
        const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d; k.x = hs.x[0] + nx * r; k.y = hs.y[0] + ny * r;
        if (Math.cos(k.dir) * nx + Math.sin(k.dir) * ny < 0) { k.v = -0.3 * Math.abs(k.v); k.slow = Math.max(k.slow, 30); if (!k.wallT) { this.ev('bounce', k.i, 'piston'); k.wallT = 24; } }   /* a bounce off a piston costs more than the long way (fix round 1) */
      }
    }
  }
};

/* ---------- places, results, the fun bookkeeping ---------- */
const better = (a, b) => a.finished !== b.finished ? a.finished : a.finished ? (a.finishT !== b.finishT ? a.finishT < b.finishT : a.i < b.i) : a.rp !== b.rp ? a.rp > b.rp : a.i < b.i;
P.updatePlaces = function () {
  const ks = this.karts, o = this.order;
  for (let x = 1; x < o.length; x++) { const v = o[x]; let y = x - 1; while (y >= 0 && better(ks[v], ks[o[y]])) { o[y + 1] = o[y]; y--; } o[y + 1] = v; }
  for (let r = 0; r < o.length; r++) ks[o[r]].place = r + 1;
};
P.bookkeep = function () {
  const ks = this.karts;
  for (const k of ks) {
    if (k.place >= 5 && !k.finished) k.pity++; else if (k.place <= 4) k.pity = 0;
    if (k.lap >= 2 && !k.finished) { k.stats.worst = Math.max(k.stats.worst, k.place); k.stats.best = Math.min(k.stats.best, k.place); }
  }
  /* lead and place changes, sampled every half second so side-by-side jitter is not counted */
  if (this.clock % 30 === 0) {
    const lead = this.order[0];
    if (this.lastLead >= 0 && lead !== this.lastLead && !ks[lead].finished) this.leadChanges++;
    this.lastLead = lead;
    for (const k of ks) { if (!k.finished && k.place < k.lastPl) this.placeChanges += k.lastPl - k.place; k.lastPl = k.place; }
  }
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

/* ---------- the CPU driver (also the bots, finished players and fastForward) ---------- */
const HS = { ph: 0, fr: 0, n: 0, x: [0, 0, 0, 0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0, 0, 0, 0], z: [0, 0, 0, 0, 0, 0, 0, 0], lat: [0, 0, 0, 0, 0, 0, 0, 0], rot: [0, 0, 0, 0, 0, 0, 0, 0] };
/* per main-road sample: the signed length (m) of the bend that carries on from here (+ right, - left; 0 on a straight) */
function bendRuns(T) {
  const N = T.N, out = new Float64Array(N);
  for (let i = N - 1 + N; i >= 0; i--) { const j = i % N, k = T.K[j], sg = Math.abs(k) > 0.011 ? Math.sign(k) : 0, nx = out[(j + 1) % N]; out[j] = sg === 0 ? 0 : Math.sign(nx) === sg ? nx + sg * T.ds : sg * T.ds; }
  return out;
}
/* hazard danger lanes for the CPU driver: pairs [lo, hi] in a reused array (no closures per tick) */
const IVS = [];
function inIV(q) { for (let j = 0; j < IVS.length; j += 2) if (q > IVS[j] && q < IVS[j + 1]) return true; return false; }
/* another kart g metres ahead in race metres (lo < g < hi), or null */
function nearRp(sim, k, lo, hi) { const ks = sim.karts; for (let j = 0; j < ks.length; j++) { const o = ks[j]; if (o === k || o.fall || o.lift || o.finished) continue; const g = o.rp - k.rp; if (g > lo && g < hi) return o; } return null; }
const inCone = (k, o, ang) => Math.abs(wrapA(Math.atan2(o.y - k.y, o.x - k.x) - k.dir)) < ang;
const vSafeOf = (sim, ahead) => { if (!(ahead > 0.001)) return 99; const Rr = 0.95 / ahead; return sim.TR * Rr / (1 + (0.22 * sim.TR / sim.VT) * Rr) + 2; };
function nearestU(C, x, y, guess) {   /* metres along a cut nearest to (x, y), searched around a guess */
  let bi = clamp(Math.round(guess / C.ds), 0, C.n - 1), bd = 1e18;
  for (let k = -10; k <= 10; k++) { const j = bi + k; if (j < 0 || j >= C.n) continue; const d = (C.X[j] - x) ** 2 + (C.Y[j] - y) ** 2; if (d < bd) { bd = d; bi = j; } }
  return bi * C.ds;
}
Sim.ai = function (sim, k) {
  const T = sim.track, D = sim.rowOf(k), A = k.ai, VT = sim.VT, PE = k.cpu ? (SK.RACERS[k.who].ai || {}) : {};
  let held = 0;
  /* rubber band (CPUs only): ease off when well ahead of the best human, push a little when behind */
  if (k.cpu) {
    let lead = -1e9; for (const h of sim.karts) if (!h.cpu && h.rp > lead) lead = h.rp;
    let rb = 1;
    if (lead > -1e8) { const gap = k.rp - lead; rb = gap > 0 ? 1 - Math.min(1, gap / 160) * D.rbA : 1 + Math.min(1, -gap / 160) * D.rbB; }
    k.mul = D.speed * rb * (0.985 + A.skill * 0.03) * (1 + (PE.speed || 0));
  } else k.mul = 1;
  const v = Math.max(0, k.v), look = 6 + v * 0.4;
  /* in the air: TWIRL (rolled once per launch), aimed flights steer at their target */
  if (k.air > 0) {
    if (k.air === 2) A.twAt = sim.rand() < D.twirl + (PE.twirl || 0) ? 6 + ((sim.rand() * 9) | 0) : -1;
    if (A.twAt > 0 && k.air === A.twAt && !k.tw) held |= IN.DRIFT;
    let st = 0;
    if (k.aim) st = clamp(wrapA(Math.atan2(k.ty - k.y, k.tx - k.x) - k.dir) * 3, -1, 1);
    else {
      let p;
      if (k.cut >= 0) { const C = T.cuts[k.cut]; p = k.u + look <= C.len ? C.pos(k.u + look, C.LINE[clamp(Math.floor((k.u + look) / C.ds), 0, C.n - 1)] * 0.5, A.tp || (A.tp = {})) : T.pos(C.s1 + (k.u + look - C.len), C.lb, A.tp || (A.tp = {})); }
      else p = T.pos(k.s + look, T.LINE[Math.floor(((k.s % T.L) + T.L) % T.L / T.ds) % T.N], A.tp || (A.tp = {}));
      st = clamp(wrapA(Math.atan2(p.y - k.y, p.x - k.x) - k.dir) * 2.5, -1, 1);
    }
    A.steer = st; held |= st > 0.05 ? IN.RIGHT : st < -0.05 ? IN.LEFT : 0;
    return held;
  }
  /* shortcuts: decide once per lap per cut, 15-45 m before its mouth */
  for (const C of T.cuts) {
    const ci = C.i, d = wrapS(C.s0 - k.s, T.L);
    if (A.pickLap[ci] !== k.lap && d >= 15 && d <= 45 && k.cut < 0) {
      A.pickLap[ci] = k.lap;
      let ok = true; const ai = C.ai || {};
      if (ai.needBoost) ok = k.boost > 0 || k.item === I_BOOST || k.item === I_BOOST3 || k.item === I_GIANT || sim.cls >= 2;
      if (ai.minV) ok = ok && k.v >= ai.minV + 3 && !k.spin && !k.wob && !k.bonk;
      if (ai.avoidEasy && (sim.cls === 0 || k.diff === 0)) ok = false;
      if (C.id === 'hops' && (k.giant || k.item === I_GIANT)) ok = false;
      if (PE.noSky && C.edge === 'void') ok = false;
      if (k.tiny && C.edge === 'void') ok = false;
      A.pick[ci] = ok && sim.rand() < D.cut + (PE.cut || 0) ? 1 : 0;
    }
    if (A.pick[ci] && k.cut < 0 && (d < -C.span || d > 60)) A.pick[ci] = 0;
  }
  let route = -1; for (const C of T.cuts) if (A.pick[C.i]) route = C.i;
  const onCut = k.cut >= 0 ? T.cuts[k.cut] : null;
  if (onCut) route = onCut.i;
  /* the lane: own offset + wander; drafting; puddles; hazards */
  let lane = A.lane * 0.5 + Math.sin(sim.t * A.wf + A.ph) * D.wobble, tx, ty, ahead, hwF, tl, fixed = false;
  const sIdx = Math.floor(((k.s % T.L) + T.L) % T.L / T.ds) % T.N;
  if (onCut) {
    const C = onCut, u = k.u, iu = clamp(Math.floor((u + look) / C.ds), 0, C.n - 1);
    hwF = C.hw; tl = clamp(C.LINE[iu] + lane * 0.3, -(C.hw - 1.4), C.hw - 1.4);
    if (u + look <= C.len) { const p = C.pos(u + look, tl, A.tp || (A.tp = {})); tx = p.x; ty = p.y; }
    else { const p = T.pos(C.s1 + (u + look - C.len), C.lb, A.tp || (A.tp = {})); tx = p.x; ty = p.y; }
    ahead = C.AHEAD[clamp(Math.floor(u / C.ds), 0, C.n - 1)];
    A.cu = u;
  } else {
    const idx = Math.floor(((k.s + look) % T.L + T.L) % T.L / T.ds) % T.N;
    hwF = T.hw; tl = T.LINE[idx] + lane;
    ahead = T.AHEAD[sIdx];
    /* a drifter takes long bends wide (the drift itself tightens the line) */
    if (D.drift > 0) { const BL = T._bend || (T._bend = bendRuns(T)), ia = Math.floor(((k.s + 12) % T.L + T.L) % T.L / T.ds) % T.N; if (A.dHold || Math.abs(BL[ia]) >= 40) tl = T.LINE[idx] * 0.2 - Math.sign(BL[ia] || A.dDir) * 1.2 + lane * 0.3; }
    /* drafting: tuck in behind a kart ahead on the straights (MEDIUM+, and ZEST on every class) */
    if ((sim.cls >= 1 || PE.draft) && ahead < 0.012 && !k.giant) {
      for (const o of sim.karts) { if (o === k || o.cut >= 0) continue; const g = wrapS(o.s - k.s, T.L); if (g > 6 && g < 25 && Math.abs(o.lat - tl) < 4) { tl += (o.lat - tl) * 0.75; break; } }
    }
    /* ramps are fun: line up with one coming up (not the catapult, unless the hops are picked) */
    for (const f of sim.fr[-1]) { if (f.k !== 'ramp' || f.aim) continue; const dl = wrapS(f.a1 - k.s, T.L); if (dl > 6 && dl < 40 && !k.giant) { const mid = (f.l0 + f.l1) / 2, half = (f.l1 - f.l0) / 2 - 0.8; if (Math.abs(tl - mid) > half) tl = mid + clamp(tl - mid, -half, half); } }
    /* step round juice puddles (decided once per CPU per puddle) */
    for (const it of sim.items) if (it.k === 'splat' && it.cut === -1) {
      const g = wrapS(it.s - k.s, T.L); if (g < 3 || g > 26 || Math.abs(it.lat - tl) > 2.6) continue;
      const b = 1 << k.i; if (!(it.dg & b)) { it.dg |= b; if (sim.rand() < D.dodge) it.dy |= b; }
      if (it.dy & b) tl += it.lat > tl ? -3.2 : 3.2;
    }
    /* not going to the hops: keep off the catapult */
    { const cat = sim.cat; if (cat && !(route >= 0 && T.cuts[route].id === 'hops')) { const dl = wrapS(cat.a1 - k.s, T.L); if (dl > -1 && dl < 35) { const edge = cat.l1 + 1.6; if (cat.l0 < 0 && tl < edge) tl = edge; } } }
    /* a picked cut: ease over to its mouth, then onto it */
    if (route >= 0) {
      const C = T.cuts[route], d = wrapS(C.s0 - k.s, T.L), cat = C.id === 'hops' ? sim.cat : null;
      if (cat) {
        const dl = wrapS(cat.a1 - k.s, T.L);
        if (dl > 0 && dl < 40) tl = tl + (-5 - tl) * clamp(1 - (dl - 15) / 25, 0, 1);
        if (dl > 0 && dl < 15) { const p = T.pos(cat.a1 + 2, (cat.l0 + cat.l1) / 2 + 0.5, A.tp || (A.tp = {})); tx = p.x; ty = p.y; fixed = true; }   /* straight over the middle of the catapult (it faces the first cloud) */
        if (dl < -2 && k.cut < 0 && !k.air) A.pick[route] = 0;   /* missed it: drive on */
      } else {
        if (d > 0 && d < 40) tl = tl + (C.la - tl) * clamp(1 - d / 40, 0, 1);
        if (d <= -(C.uOut * C.span / C.len + 12) && k.cut < 0 && !k.air) A.pick[route] = 0;   /* drove past the mouth (or the balloon put us back on the road) */
        else if (d <= 3) { const u = nearestU(C, k.x, k.y, Math.max(0, A.cu || -d)); A.cu = u;
          if (d < -2 && (C.X[Math.round(u / C.ds)] - k.x) ** 2 + (C.Y[Math.round(u / C.ds)] - k.y) ** 2 > (C.hw + 5) ** 2) A.pick[route] = 0;   /* nowhere near it: drive on */
          const iu = clamp(Math.floor((u + look) / C.ds), 0, C.n - 1); const p = C.pos(u + look, C.LINE[iu] * 0.5, A.tp || (A.tp = {})); tx = p.x; ty = p.y; fixed = true; ahead = Math.max(ahead, C.AHEAD[clamp(Math.floor(u / C.ds), 0, C.n - 1)]); }
        else A.cu = 0;
      }
    }
    tl = clamp(tl, -(hwF - 1.7), hwF - 1.7);
  }
  /* hazards on the route: read once per lap (D.read), then move out of the danger lane or ease off to time it */
  const HZ = T.hazards || [];
  let near = 1e9, dodge = null;
  for (let h = 0; h < HZ.length; h++) {
    const H = HZ[h]; if (H.k === 'gust') continue;
    let d;
    if (H.on < 0) { if (onCut) continue; d = wrapS(H.a - k.s, T.L); }
    else { if (route !== H.on) continue; d = H.a - (onCut ? k.u : (A.cu || 0)); if (!onCut && wrapS(T.cuts[H.on].s0 - k.s, T.L) > 3) d += wrapS(T.cuts[H.on].s0 - k.s, T.L); }
    if (d < 4 || d > 45 || d > near) continue;
    if (A.hzLap[h] !== k.lap) { A.hzLap[h] = k.lap; A.hzRead[h] = sim.rand() < D.read; }
    if (!A.hzRead[h]) continue;
    const eta = Math.round(d / Math.max(6, v) * 60);
    SK.hazState(T, H, sim.clock + eta, HS);
    const IV = IVS; IV.length = 0;
    if (H.k === 'spray') {
      let on = HS.ph === 2; if (!on) { SK.hazState(T, H, sim.clock + eta - 10, HS); on = HS.ph === 2; } if (!on) { SK.hazState(T, H, sim.clock + eta + 10, HS); on = HS.ph === 2; }
      if (!on) continue;
      if (H.half != null && H.l0 != null) IV.push(H.l0 - 1.3, H.l1 + 1.3); else IV.push(HS.lat[0] - H.r - 1.5, HS.lat[0] + H.r + 1.5);
    } else if (H.path === 'cross') {
      for (let j = 0; j < HS.n; j++) IV.push(HS.lat[j] - H.r - 1.7, HS.lat[j] + H.r + 1.7);
      /* a ramp just before the rolling lane jumps it: ride the ramp */
      if (!onCut) for (const f of sim.fr[-1]) if (f.k === 'ramp' && !f.aim) { const dl = wrapS(f.a1 - k.s, T.L); if (dl > 0 && dl < d && d - dl < (f.D || 0) - 4) { IV.length = 0; tl = clamp(tl, f.l0 + 1, f.l1 - 1); } }
    }
    else if (H.k === 'piston') { let on = HS.ph >= 1; if (!on) { SK.hazState(T, H, sim.clock + eta - 8, HS); on = HS.ph >= 1; } if (!on) { SK.hazState(T, H, sim.clock + eta + 8, HS); on = HS.ph >= 1; } if (!on) continue; IV.push(H.lat - H.r - 1.5, H.lat + H.r + 1.5); }
    else if (H.path === 'swing') { for (let dt = -6; dt <= 6; dt += 12) { SK.hazState(T, H, sim.clock + eta + dt, HS); IV.push(HS.lat[0] - H.r - 1.5, HS.lat[0] + H.r + 1.5); } }
    const inside = inIV;
    if (!IV.length || !inside(tl)) continue;
    near = d; dodge = H;
    /* the nearest safe lane on the road */
    const lim = hwF - 1.5; let best = null, bd = 1e9;
    for (let j = 0; j < IV.length; j++) { const q = IV[j] + (j & 1 ? 0.3 : -0.3); if (q < -lim || q > lim || inside(q)) continue; const dd = Math.abs(q - tl); if (dd < bd) { bd = dd; best = q; } }
    if (best != null) tl = best; else if ((H.k === 'piston' || H.path === 'swing' || H.path === 'cross') && d < 20) A.ease = 10;
    if ((H.k === 'piston' || H.path === 'swing') && Math.abs(tl - (HS.lat[0] || H.lat)) < H.r + 1 && d < 20) A.ease = 10;
  }
  /* the point to steer at: on a cut its own line; entering a cut or lining up the catapult it was set above; else the road */
  if (dodge && near < look + 2 && near > 1.5) {   /* steer at the hazard itself, in the safe lane (a far look-ahead would cut the bend) */
    const C = dodge.on >= 0 ? T.cuts[dodge.on] : null, ea = dodge.a + (dodge.half ? dodge.half * 0.6 : 0.5), p = C ? C.pos(Math.min(ea, C.len), tl, A.tp || (A.tp = {})) : T.pos(ea, tl, A.tp || (A.tp = {})); tx = p.x; ty = p.y;
  }
  else if (onCut) { if (k.u + look <= onCut.len) { const p = onCut.pos(k.u + look, tl, A.tp || (A.tp = {})); tx = p.x; ty = p.y; } }
  else if (!fixed) { const p = T.pos(k.s + look, tl, A.tp || (A.tp = {})); tx = p.x; ty = p.y; }
  A.tl = tl;
  const want = Math.atan2(ty - k.y, tx - k.x), diff = wrapA(want - k.dir);
  let steer = clamp(diff * 2.8, -1, 1);
  const vSafe = vSafeOf(sim, ahead);
  if (Math.abs(diff) > 1.4 && k.v > 3) held |= IN.BRAKE;
  else if (!k.drift && k.v > vSafe + 1.5 && Math.abs(diff) > 0.15) held |= IN.BRAKE;
  /* drifting through long bends: start at the entry from the outside half, ride the line, release at the class's spark level,
     when the bend ends, or before running wide or inside off the road */
  if (D.drift > 0 && !onCut) {
    const BL = T._bend || (T._bend = bendRuns(T)), idx = Math.floor(((k.s + 4) % T.L + T.L) % T.L / T.ds) % T.N, kb = T.K[idx], dir = kb > 0 ? 1 : -1;
    const dodgeOut = dodge && near < 35 && Math.abs(tl - k.lat) > 1;
    if (!k.drift && !A.dHold && !dodgeOut && Math.abs(kb) > 0.02 && BL[idx] * dir >= 40 && k.lat * dir < T.hw - 2.5 && k.v > 14 && k.z === 0 && A.dT <= 0 && sim.rand() < 0.5 && route < 0) { A.dHold = true; A.dT = 0; A.dDir = dir; }
    if (A.dHold) {
      A.dT++;
      const sign = k.drift || A.dDir, here = Math.floor(((k.s % T.L) + T.L) % T.L / T.ds) % T.N, bendLeft = BL[(here + 8) % T.N] * sign > 0 || T.AHEAD[(sIdx + 6) % T.N] > 0.02;
      if (k.drift) steer = clamp((diff * sign * 3.2 - 0.1), -1, 1) * sign;
      else if (steer * sign > 0) steer = sign * Math.max(0.42, Math.abs(steer));
      const offIn = k.lat * sign > T.hw - 0.9, offOut = k.lat * sign < -(T.hw - 0.6);
      const mustDodge = dodgeOut && (tl - k.lat) * sign < -1;   /* the drift turns the wrong way for a hazard ahead: cash it in */
      if ((k.drift && (k.mt >= D.drift || !bendLeft || diff * sign < -0.45 || offIn || offOut || mustDodge || A.dT > 300)) || (!k.drift && A.dT > 26)) { A.dHold = false; A.dT = -30; }
      else held |= IN.DRIFT;
    } else if (A.dT < 0) A.dT++;
  } else if (A.dHold) { A.dHold = false; }
  A.steer = clamp(steer + (sim.rand() - 0.5) * D.err * 0.2, -1, 1);
  held |= A.steer > 0.05 ? IN.RIGHT : A.steer < -0.05 ? IN.LEFT : 0;
  /* TINY THYME: hop the ribbon (rolled once per ribbon) */
  for (const it of sim.items) if (it.k === 'wave' && (it.mask >> k.i) & 1 && !((it.done >> k.i) & 1)) {
    if (A.hopW !== it.id) { A.hopW = it.id; A.hopOk = sim.rand() < D.hop; A.hopEta = 6 + ((sim.rand() * 30) | 0); }
    const d = k.rp - it.rp, cl = Math.max(1, (it.V || 45) - Math.max(0, k.v));
    if (A.hopOk && d > 0 && d / cl * 60 <= A.hopEta && sim.clock - k.hopAt > 20 && k.z === 0 && !(k.held & IN.DRIFT)) held |= IN.DRIFT;
  }
  /* items */
  if (k.item && !k.roll && !k.spin && !k.bonk) {
    if (A.holdId !== k.item) { A.holdId = k.item; A.holdT = 0; A.itemT = 0; A.blueT = 20 + ((sim.rand() * 70) | 0); }
    A.holdT++;
    if (!A.itemT) A.itemT = Math.max(1, Math.round((D.itemWait[0] + sim.rand() * (D.itemWait[1] - D.itemWait[0])) * (PE.wait || 1)));
    A.itemT--;
    const it = k.item, timer = A.itemT <= 0, aimed = PE.eager || sim.rand() < D.aim * 0.2;
    let use = false, fwd = false;
    const near2 = (lo, hi) => nearRp(sim, k, lo, hi), cone = (o, ang) => inCone(k, o, ang);   /* (only while holding an item) */
    /* a final-lap leader's breather: hold leader attacks (a puff, a ribbon, a berry from 2nd) until it is over (fix round 1) */
    const lk = sim.karts[sim.order[0]], wait = k.cpu && lk && lk !== k && sim.leadCool(lk) && (it === I_PUFF || it === I_THYME || (it === I_BLUE && k.place === 2));
    if (it === I_BOOST || it === I_BOOST3) {
      let cutSoon = false; for (const C of T.cuts) if (A.pick[C.i] && C.ai && C.ai.needBoost) { const d = wrapS(C.s0 - k.s, T.L); if (d > 0 && d < 30) cutSoon = true; }
      use = cutSoon || (aimed && ahead < 0.012 && k.v > 14) || (timer && ahead < 0.02) || (!k.cpu && A.holdT > 25 && ahead < 0.03);   /* players' bots mash their berries */
    } else if (it === I_SPLAT || it === I_SPLAT3) {
      if (aimed && near2(-14, -2)) use = true;
      else if ((D.aim >= 0.7 || PE.eager) && aimed) { const o = near2(18, 30); if (o && cone(o, 0.25)) { use = true; fwd = true; } }
      if (!use && PE.mouth) for (const C of T.cuts) { const d = wrapS(k.s - C.s0, T.L); if (d > -10 && d < 10 && near2(-40, -2)) use = true; }
      if (!use && timer) use = true;
    } else if (it === I_BLUE) use = A.holdT >= (PE.eager || !k.cpu ? 20 : A.blueT) && !(wait && A.holdT < 900);
    else if (it === I_SWIRL) {
      if (!k.swirl) use = !!near2(-15, 15) || timer;
      else if (pop(k.petals) >= 3) { const o = near2(5, 20); use = !!(o && cone(o, 12 * PI / 180)); }
      if (k.swirl && k.swirl < (k.cpu ? 240 : 420)) use = true;   /* fling the petals before they wilt */
    } else if (it === I_SHIELD) {
      const hold = k.cpu && ((sim.cls >= 1 && k.diff >= 1) || PE.holdShield);   /* bots (players) use it straight away */
      if (!hold) use = true;
      else {
        for (const q of sim.items) if ((q.k === 'blue' || q.k === 'puff') && q.tgt === k.i || q.k === 'wave' && (q.mask >> k.i) & 1 && !((q.done >> k.i) & 1)) use = true;
        for (const o of sim.karts) if (o !== k && o.giant && (o.x - k.x) ** 2 + (o.y - k.y) ** 2 < 100) use = true;
        if (A.holdT > 900) use = true;
      }
    } else if (it === I_PUFF) use = !sim.whyNot(k) && !wait && (k.place > 1 || !k.cpu ? A.holdT > 4 : A.holdT > 600);
    else if (it === I_THYME) {
      let n = 0; for (const o of sim.karts) if (o !== k && !o.finished && o.rp > k.rp && o.rp - k.rp < 250) n++;
      const lead = sim.karts[sim.order[0]];
      if (A.holdT === 1) A.thH = sim.rand() < 0.5;   /* a human leader: thrown at once only half the time (rolled once per item) */
      use = !sim.whyNot(k) && !wait && (n >= 2 || (k.diff >= 1 && lead && !lead.cpu && lead !== k && A.thH) || timer);
    } else if (it === I_GIANT) {
      let cutSoon = false; for (const C of T.cuts) if (A.pick[C.i]) { const d = wrapS(C.s0 - k.s, T.L); if (d > 0 && d < 25) cutSoon = true; }
      use = ahead < 0.02 || cutSoon || A.holdT > 300;
    }
    if (use && !(k.held & IN.ITEM)) { held |= IN.ITEM; if (fwd) held |= IN.FWD; A.itemT = 0; }
  } else if (!k.item) A.holdId = 0;
  /* stuck against something for a while: the balloon helps */
  if (k.v < 1.5 && !k.spin && !k.lift && !k.fall && !k.bonk && sim.phase === 'race') { if (++k.stuck > 150) sim.respawn(k); } else k.stuck = 0;
  return held;
};

/* ---------- compact kart state (for the online engineer): integers only ---------- */
const KF = Sim.KART_FIELDS = ['x','y','z','dir','v','vd','st','drift','dc','mt','boost','spin','bonk','wob','inv','shield','giant','gro','tiny',
 'swirl','petals','swA','twirl','air','draft','fall','lift','slow','item','itemN','roll','cpc','finishT','fin','place','lap','cut'];
Sim.petals = function (k, out) {
  out = out || [];
  for (let j = 0; j < 5; j++) {
    const a = k.swA * 2.6 / 60 + j * TAU / 5, r = 1.9 * (k.scale || 1), o = out[j] || (out[j] = {});
    o.x = k.x + Math.cos(a) * r; o.y = k.y + Math.sin(a) * r; o.z = 0.6 + (k.z || 0); o.a = a; o.alive = !!(k.swirl && (k.petals >> j) & 1);
  }
  return out;
};
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
