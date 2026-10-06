/* ROOTLIGHT — sim.js (SIM). The rules of the roots, at a fixed 60 ticks a second, deterministic for a given input stream:
   the players (run, jump, swing, focus, Leaf Dash, Vine Grip, Puff Jump, Glow, Sunbeam), the rooms (tiles, doorways, water,
   wind, vents, glowcaps, crumbling ledges, briars, gates, levers, breakable walls), the six glooms, the four guardians, dew,
   pickups, Watering Spots, fainting and waking, local co-op (a shared camera, a gentle tether, seed bubbles) and the save.
   No drawing, no sound, no storage: main.js stores sim.save; render.js and audio.js read sim.events.
   The state other files read is documented in docs/rootlight/INTERFACE.md. Runs in node too (tests: docs/rootlight/tools). */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis;
const RL = G.RL = G.RL || {};
const TILE = 20;
const C = RL.C = { TILE, VW: 640, VH: 360, CW: 16, CH: 9 };
const IN = RL.IN = { L: 1, R: 2, U: 4, D: 8, JUMP: 16, SWING: 32, DASH: 64, FOCUS: 128 };
const T = RL.T = { AIR: 0, EARTH: 1, ROOT: 2, STONE: 3, ONEWAY: 4, CRUMBLE: 5, THORN: 6, WATER: 7, CURL: 8, CURR: 9, BREAK: 10, BRIAR: 11, GATE: 12 };
const CODE = { '.': 0, '#': 1, R: 2, K: 3, '=': 4, '-': 5, x: 6, '~': 7, '<': 8, '>': 9, '%': 10, '|': 11, g: 12 };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sgn = v => v < 0 ? -1 : v > 0 ? 1 : 0;
const ov = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;

/* ---------- tuning ---------- */
const PH = {
  W: 14, H: 26, RUN: 2.7, ACC: 0.55, DEC: 0.75, AACC: 0.42, ADEC: 0.22,
  JUMP: 6.6, GUP: 0.32, G: 0.62, FALL: 8.5, CUT: -1.8, COYOTE: 6, BUFFER: 8,
  DASH_V: 9.5, DASH_T: 10, DASH_CD: 30, DASH_CD_CHARM: 16,
  CLING_SLIDE: 1.3, WJ_VY: 6.4, WJ_VX: 2.4, WJ_LOCK: 6, PUFF: 5.6,
  SWING_T: 14, SWING_CD: 16, SWING_CD_CHARM: 10, REACH: 30, REACH_CHARM: 42,
  POGO: 6.4, POGO_CHARM: 7.6, CAP: 8.8, VENT_LIFT: 1.15, VENT_MAX: 5.4,
  INV: 75, INV_GENTLE: 100, HURT_T: 14, FOCUS_T: 60, FOCUS_T_CHARM: 36, SUN_COST: 33, SUN_HIT: 8, SUN_HIT_CHARM: 12,
  SWIM_G: 0.12, SWIM_FALL: 1.6, SWIM_RUN: 1.9, STROKE: 3.4, CURRENT: 1.1,
  BEAM_V: 10, MAGNET: 30, MAGNET_CHARM: 120
};
RL.PH = PH;

/* a small seeded random (mulberry32) */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- the save ---------- */
function newSave(slot, gentle) {
  return { v: 1, slot: slot | 0, gentle: !!gentle, time: 0, room: 'rg_fall', spot: null, dew: 0, puddle: null,
    ab: { dash: 0, grip: 0, puff: 0, glow: 0, beam: 0 }, life: 0, vessels: 0, notches: 3, leafSlots: 0,
    charms: {}, worn: [], maps: {}, visited: {}, seen: {}, got: {}, bloom: {}, buds: {}, open: {}, broke: {},
    calm: { knot: 0, boiler: 0, cloud: 0, heart: 0 }, shop: {}, talked: {}, done: 0, deaths: 0, started: 0 };
}
/* fills in anything an older or hand-edited save lacks */
function fixSave(s) {
  const d = newSave(s && s.slot, s && s.gentle); if (!s || typeof s !== 'object') return d;
  for (const k in d) if (s[k] === undefined || (typeof d[k] === 'object' && d[k] !== null && (typeof s[k] !== 'object' || s[k] === null))) s[k] = d[k];
  for (const k in d.ab) s.ab[k] = s.ab[k] ? 1 : 0;
  for (const k in d.calm) s.calm[k] = s.calm[k] ? 1 : 0;
  if (!Array.isArray(s.worn)) s.worn = [];
  s.worn = s.worn.filter(id => RL.World && RL.World.charms[id] && s.charms[id]);
  if (!RL.World || !RL.World.rooms[s.room]) s.room = 'rg_fall';
  return s;
}
function wears(save, id) { return save.worn.indexOf(id) >= 0; }
function stats(save) {
  const w = id => wears(save, id);
  return {
    maxLeaves: 5 + (save.gentle ? 2 : 0) + Math.floor(save.life / 2) + save.leafSlots + (w('bark') ? 1 : 0),
    bark: w('bark'), sunMax: 99 + 33 * save.vessels, reach: w('long') ? PH.REACH_CHARM : PH.REACH,
    swingCd: w('swift') ? PH.SWING_CD_CHARM : PH.SWING_CD, dashCd: w('breeze') ? PH.DASH_CD_CHARM : PH.DASH_CD,
    focusT: w('gentle') ? PH.FOCUS_T_CHARM : PH.FOCUS_T, sunHit: w('sip') ? PH.SUN_HIT_CHARM : PH.SUN_HIT,
    magnet: w('magnet') ? PH.MAGNET_CHARM : PH.MAGNET, pogo: w('bouncy') ? PH.POGO_CHARM : PH.POGO,
    coat: w('coat'), pouch: w('pouch'), beamDmg: w('sunny') ? 3 : 2, beamR: w('sunny') ? 14 : 9, compass: w('compass')
  };
}
function notchesUsed(save) { let n = 0; for (const id of save.worn) n += (RL.World.charms[id] || { cost: 0 }).cost; return n; }

/* ---------- the player ---------- */
function newPlayer(i) {
  return { i, who: i ? 'marigold' : 'sprig', x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: false, st: 'idle', at: 0, swing: null, swingCd: 0,
    leaves: 5, maxLeaves: 5, sun: 0, sunMax: 99, inv: 0, focus: 0, dashT: 0, dashCd: 0, airDash: true, puffT: 99, airPuff: true, wall: 0,
    glow: false, bubble: false, hurtT: 0, faintT: 0, sitT: 0, swim: false, alive: true, in: 0, prev: 0, coyote: 0, buffer: 0, lock: 0,
    dropT: 0, rise: 0, safe: null, safeT: 0, setback: 0, ride: null, prompt: null, near: null, bark: false, lastDir: 1, stepT: 0, off: 0, beamCd: 0 };
}

/* ======================================================================================================================
   ROOMS
   ====================================================================================================================== */
const FOE = {
  smog: { w: 24, h: 24, hp: 2, dew: 2, fl: 0 }, thorn: { w: 22, h: 22, hp: 3, dew: 2, fl: 1 }, drip: { w: 20, h: 20, hp: 2, dew: 2, fl: 2 },
  cog: { w: 26, h: 22, hp: 4, dew: 4, fl: 3 }, lantern: { w: 18, h: 24, hp: 3, dew: 3, fl: 4 }, knight: { w: 22, h: 34, hp: 6, dew: 6, fl: 5 }
};
const FOE_LETTER = { s: 'smog', t: 'thorn', d: 'drip', c: 'cog', l: 'lantern', k: 'knight' };
const GUARD = {
  knot: { w: 80, h: 80, hp: 22 }, boiler: { w: 120, h: 110, hp: 26 }, cloud: { w: 150, h: 70, hp: 28 }, heart: { w: 112, h: 112, hp: 42 }
};
RL.FOE = FOE; RL.GUARD = GUARD;

class Room {
  constructor(def, save, sim) {
    this.def = def; this.id = def.id; this.area = def.area; this.name = def.name; this.sim = sim;
    const w = this.w = def.cw * C.CW, h = this.h = def.ch * C.CH; this.pw = w * TILE; this.ph = h * TILE;
    this.wx = def.cx * C.CW; this.wy = def.cy * C.CH;   /* world tile origin */
    this.dark = def.dark ? 1 : 0;
    this.t = new Uint8Array(w * h); this.gateAt = new Int16Array(w * h).fill(-1); this.briar = new Float32Array(w * h);
    this.crumble = new Map(); this.breakAt = new Int16Array(w * h).fill(-1);
    this.foes = []; this.shots = []; this.drops = []; this.items = []; this.flowers = []; this.buds = []; this.gates = []; this.levers = [];
    this.switches = []; this.breaks = []; this.spots = []; this.npcs = []; this.signs = []; this.plats = []; this.vents = []; this.caps = [];
    this.hazards = []; this.wind = []; this.guard = null; this.start = null; this.colour = 0; this.total = 0; this.gotSun = new Set();
    const m = def.map, ents = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = (m[y] || '')[x] || '#';
      if (CODE[ch] !== undefined) this.t[y * w + x] = CODE[ch]; else { this.t[y * w + x] = 0; ents.push([ch, x, y]); }
    }
    /* gates: connected runs of g, numbered in reading order of their first cell */
    const kinds = def.gates || []; let gi = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (this.t[i] !== T.GATE || this.gateAt[i] >= 0) continue;
      const cells = [], st = [[x, y]]; this.gateAt[i] = gi;
      while (st.length) { const [a, b] = st.pop(); cells.push([a, b]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xa = a + dx, yb = b + dy; if (xa < 0 || yb < 0 || xa >= w || yb >= h) continue; const j = yb * w + xa; if (this.t[j] === T.GATE && this.gateAt[j] < 0) { this.gateAt[j] = gi; st.push([xa, yb]); } } }
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const [a, b] of cells) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
      const kind = kinds[gi] || 'lever';
      this.gates.push({ kind, x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE, shut: true, o: 0, vert: (y1 - y0) >= (x1 - x0), key: def.id + ':g' + gi, n: gi });
      gi++;
    }
    /* breakable walls: connected runs of % */
    let bi = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (this.t[i] !== T.BREAK || this.breakAt[i] >= 0) continue;
      const cells = [], st = [[x, y]]; this.breakAt[i] = bi;
      while (st.length) { const [a, b] = st.pop(); cells.push([a, b]); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xa = a + dx, yb = b + dy; if (xa < 0 || yb < 0 || xa >= w || yb >= h) continue; const j = yb * w + xa; if (this.t[j] === T.BREAK && this.breakAt[j] < 0) { this.breakAt[j] = bi; st.push([xa, yb]); } } }
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const [a, b] of cells) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, a); y1 = Math.max(y1, b); }
      const key = def.id + ':b' + bi, br = { x: x0 * TILE, y: y0 * TILE, w: (x1 - x0 + 1) * TILE, h: (y1 - y0 + 1) * TILE, hp: 3, hurt: 0, key, cells, n: bi };
      if (save.broke[key]) for (const [a, b] of cells) this.t[b * w + a] = T.AIR; else this.breaks.push(br);
      bi++;
    }
    /* things, in reading order */
    const cnt = {}; const nth = ch => (cnt[ch] = (cnt[ch] || 0) + 1) - 1;
    const bloomed = new Map(); for (const b of save.bloom[def.id] || []) bloomed.set(b[0], b);
    const budsOpen = new Set(save.buds[def.id] || []);
    let foeN = 0, budN = 0, levN = 0, swN = 0;
    const mRuns = [];
    for (const [ch, x, y] of ents) {
      const cx = x * TILE + TILE / 2, fy = (y + 1) * TILE, top = y * TILE;
      const solidBelow = this.solid(x, y + 1) || this.code(x, y + 1) === T.ONEWAY, solidAbove = this.solid(x, y - 1);
      if (FOE_LETTER[ch]) {
        const kind = FOE_LETTER[ch], F = FOE[kind], id = foeN++;
        if (bloomed.has(id)) { const b = bloomed.get(id); this.flowers.push({ x: b[1], y: b[2], kind: F.fl, ceil: !!b[3], t: 999, seed: id * 7 + 3 }); this.total++; continue; }
        const f = { id, kind, x: cx, y: fy - F.h / 2, vx: 0, vy: 0, face: -1, hp: F.hp, maxHp: F.hp, st: 'idle', t: 0, hurt: 0, ceil: false, alive: true, w: F.w, h: F.h, hx: cx, hy: 0, hit: -1, n: 0 };
        if (kind === 'smog') { f.y = top + TILE / 2; f.st = 'drift'; }
        else if (kind === 'drip') { f.y = top + F.h / 2; f.ceil = true; f.st = 'hang'; }
        else if (kind === 'lantern') { if (!solidBelow && solidAbove) { f.ceil = true; f.y = top + F.h / 2; } f.st = 'idle'; f.n = (id * 37) % 120; }
        else if (kind === 'thorn') f.st = 'roll';
        else if (kind === 'cog') f.st = 'walk';
        else if (kind === 'knight') f.st = 'walk';
        f.hy = f.y; f.face = (id & 1) ? 1 : -1;
        this.foes.push(f); this.total++;
      } else if (ch === 'b') {
        const id = budN++; const ceil = !solidBelow && solidAbove;
        if (budsOpen.has(id)) this.flowers.push({ x: cx, y: ceil ? top : fy, kind: 6, ceil, t: 999, seed: id * 11 + 5 });
        else this.buds.push({ id, x: cx, y: ceil ? top : fy, ceil, open: false, t: 0 });
        this.total++;
      } else if (ch === 'W') this.spots.push({ x: cx, y: fy, lit: false });
      else if (ch === 'P') this.npcs.push({ kind: 'peddler', x: cx, y: fy, talk: 0 });
      else if (ch === 'i') this.signs.push({ x: cx, y: fy, text: (def.signs || [])[nth('i')] || '' });
      else if (ch === '@') this.start = { x: cx, y: fy };
      else if (ch === '*') { const k = nth('*'), key = def.id + ':*' + k; if (!save.got[key]) this.items.push({ kind: 'cluster', id: key, x: cx, y: top + TILE / 2, hp: 4, got: false, hurt: 0 }); }
      else if (ch === 'o') this.caps.push({ x: cx, y: fy, squash: 0 });
      else if (ch === 'v') { const v = { x: cx, y: fy, h: 0, on: false, tell: 0, t: (x * 53 + y * 17) % 240 }; let yy = y; while (yy > 0 && !this.solid(x, yy - 1)) yy--; v.h = fy - yy * TILE; this.vents.push(v); }
      else if (ch === 'm') { const last = mRuns[mRuns.length - 1]; if (last && last.y === y && last.x1 === x - 1) last.x1 = x; else mRuns.push({ x0: x, x1: x, y }); }
      else if (ch === 'L' || ch === 'V' || ch === 'N' || ch === 'C' || ch === 'A') {
        const k = nth(ch), key = def.id + ':' + ch + k;
        const kind = { L: 'life', V: 'vessel', N: 'notch', C: 'charm', A: 'ability' }[ch];
        const id = ch === 'C' ? (def.charms || [])[k] : ch === 'A' ? def.ability : key;
        if (!save.got[key]) this.items.push({ kind, id, key, x: cx, y: top + TILE / 2, got: false, hp: 0, hurt: 0 });
      }
      else if (ch === 'h') this.levers.push({ x: cx, y: fy, on: false, t: 0, n: levN++ });
      else if (ch === 'y') this.switches.push({ x: cx, y: top + TILE / 2, on: false, t: 0, n: swN++ });
      else if (ch === 'G' && def.guardian) this.makeGuard(def.guardian, cx, top + TILE / 2, fy, save);
    }
    mRuns.forEach((r, k) => { const p = (def.plats || [])[k] || [0, 0, 240]; this.plats.push({ x: r.x0 * TILE, y: r.y * TILE, w: (r.x1 - r.x0 + 1) * TILE, h: 10, x0: r.x0 * TILE, y0: r.y * TILE, dx: p[0] * TILE, dy: p[1] * TILE, period: Math.max(60, p[2] | 0), vx: 0, vy: 0 }); });
    for (const wd of def.wind || []) this.wind.push({ x: wd[0] * TILE, y: wd[1] * TILE, w: wd[2] * TILE, h: wd[3] * TILE, dx: +wd[4] || 0, dy: +wd[5] || 0, gust: wd[6] ? 1 : 0, on: 1 });
    /* links: k-th lever -> k-th lever gate, k-th switch -> k-th sun gate */
    const lg = this.gates.filter(g => g.kind === 'lever'), sg = this.gates.filter(g => g.kind === 'sun');
    this.levers.forEach((l, k) => { l.gate = lg[k] || null; if (l.gate && save.open[l.gate.key]) l.on = true; });
    this.switches.forEach((s, k) => { s.gate = sg[k] || null; if (s.gate && save.open[s.gate.key]) s.on = true; });
    /* the puddle you left */
    if (save.puddle && save.puddle.room === def.id) this.items.push({ kind: 'puddle', id: 'puddle', x: save.puddle.x, y: save.puddle.y, v: save.puddle.v, got: false, hp: 0, hurt: 0 });
    this.updateGates(save, true);
    this.recolour(save, true);
  }
  idx(x, y) { return y * this.w + x; }
  code(x, y) { x = x < 0 ? 0 : x >= this.w ? this.w - 1 : x; y = y < 0 ? 0 : y >= this.h ? this.h - 1 : y; return this.t[y * this.w + x]; }
  /* outside the room the border cells carry on, so doorways stay open and walls stay solid */
  solid(x, y) {
    x = x < 0 ? 0 : x >= this.w ? this.w - 1 : x; y = y < 0 ? 0 : y >= this.h ? this.h - 1 : y;
    const i = y * this.w + x, c = this.t[i];
    if (c === 1 || c === 2 || c === 3 || c === 10) return true;
    if (c === 5) { const s = this.crumble.get(i); return !s || s.st !== 'gone'; }
    if (c === 11) return this.briar[i] < 0.7;
    if (c === 12) { const g = this.gates[this.gateAt[i]]; return !g || g.shut; }
    return false;
  }
  oneway(x, y) { return this.code(x, y) === T.ONEWAY; }
  water(px, py) { const c = this.code(Math.floor(px / TILE), Math.floor(py / TILE)); return c === 7 || c === 8 || c === 9 ? c : 0; }
  thornAt(x0, y0, x1, y1) {
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y1 - 0.01) / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x1 - 0.01) / TILE); tx++) {
      if (this.code(tx, ty) !== T.THORN) continue;
      /* the thorny part is the lower 3/4 of the tile when there is air above it (spikes stand on the ground) */
      const top = ty * TILE + (this.code(tx, ty - 1) === T.THORN || this.solid(tx, ty - 1) ? 0 : 6);
      if (y1 > top && y0 < (ty + 1) * TILE && x1 > tx * TILE + 3 && x0 < (tx + 1) * TILE - 3) return { x: tx * TILE + TILE / 2, y: top };
    }
    return null;
  }
  boxSolid(x0, y0, x1, y1) {
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y1 - 0.001) / TILE); ty++) for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x1 - 0.001) / TILE); tx++) if (this.solid(tx, ty)) return true;
    return false;
  }
  makeGuard(kind, x, y, floor, save) {
    const D = GUARD[kind], gentle = save.gentle;
    const hp = Math.round(D.hp * (gentle ? 0.75 : 1));
    const g = { kind, x, y, w: D.w, h: D.h, hp, maxHp: hp, phase: 1, st: 'sleep', t: 0, face: -1, hurt: 0, calm: 0, awake: false, ax: x, ay: y, floor, n: 0, combo: 0, last: '', squash: 0, spin: 0, heat: 0, door: 0, dark: 0, dir: -1, glow: 0, vx: 0, vy: 0, tx: x, done: !!save.calm[kind] };
    if (kind === 'knot' || kind === 'boiler') g.y = floor - D.h / 2;
    if (g.done) { g.st = 'calm'; g.calm = 1; g.hp = 0; }
    this.guard = g;
  }
  updateGates(save, now) {
    const g = this.guard, calmAll = save.calm.knot && save.calm.boiler && save.calm.cloud;
    for (const gt of this.gates) {
      let shut = true;
      if (gt.kind === 'lever' || gt.kind === 'sun') shut = !save.open[gt.key];
      else if (gt.kind === 'seal') shut = !(calmAll && save.open[gt.key]);
      else if (gt.kind === 'arena') shut = !!(g && g.awake && !g.done);
      else if (gt.kind === 'calm') shut = !(g && g.done);
      if (gt.shut !== shut && !now) this.sim.ev('gate', gt.kind, gt.x + gt.w / 2, gt.y + gt.h / 2, shut ? 0 : 1);
      gt.shut = shut; if (now) gt.o = shut ? 0 : 1;
    }
  }
  recolour(save, now) {
    const g = this.guard;
    let done = 0; for (const f of this.foes) if (!f.alive) done++;
    done += this.flowers.length - (this.flowers.filter(f => f.temp).length);
    const tot = this.total + (g ? 6 : 0); if (g && g.done) done += 6;
    const want = tot ? 0.12 + 0.88 * Math.min(1, done / tot) : (save.visited[this.id] ? 0.55 : 0.4);
    this.colourWant = want; if (now) this.colour = want;
  }
}

/* ======================================================================================================================
   THE SIM
   ====================================================================================================================== */
class Sim {
  constructor(o) {
    o = o || {};
    this.W = RL.World; this.save = fixSave(o.save || newSave(o.slot || 1, o.gentle));
    this.role = o.role || 'solo'; this.t = 0; this.events = []; this.freeze = false; this.fade = 1; this.fadeTo = 0; this.after = null;
    this.rand = rng((o.seed >>> 0) || 12345); this.ext = [false, false]; this.hooks = {}; this.cam = { x: 0, y: 0 }; this.shake = 0;
    this.players = []; const n = o.players === 2 ? 2 : 1; for (let i = 0; i < n; i++) this.players.push(newPlayer(i));
    this.room = null; this.st = stats(this.save); this.leader = 0; this.pending = null; this.ending = 0;
    this.applyStats(true);
    const s = this.save;
    if (!s.spot) { const hub = this.W.rooms.rg_hub; s.spot = { room: 'rg_hub', x: null, y: null }; if (hub) hub.map.forEach((row, y) => { const x = row.indexOf('W'); if (x >= 0) s.spot = { room: 'rg_hub', x: x * TILE + TILE / 2, y: (y + 1) * TILE }; }); }
    if (!s.started) { s.started = 1; this.enterRoom(this.W.start, null, null, { start: true }); }
    else this.enterRoom(s.spot.room, s.spot.x, s.spot.y, { spot: true });
    this.fade = 1;
  }
  ev(...a) { this.events.push(a); }
  applyStats(full) {
    const st = this.st = stats(this.save);
    for (const p of this.players) {
      p.maxLeaves = st.maxLeaves; p.sunMax = st.sunMax; p.bark = st.bark; p.glow = !!this.save.ab.glow;
      if (full) p.leaves = p.maxLeaves; p.leaves = Math.min(p.leaves, p.maxLeaves); p.sun = Math.min(p.sun, p.sunMax);
    }
  }
  /* ---------------- rooms ---------------- */
  enterRoom(id, x, y, how) {
    const def = this.W.rooms[id]; if (!def) return false;
    how = how || {};
    const s = this.save;
    this.room = new Room(def, s, this);
    s.room = id;
    const firstVisit = !s.visited[id]; s.visited[id] = 1;
    const r = this.room;
    if (how.start && r.start) { x = r.start.x; y = r.start.y; }
    if (how.spot) { const sp = r.spots[0]; if (sp && (x == null || Math.abs(sp.x - x) < 40)) { x = sp.x; y = sp.y; } }
    if (x == null) { x = r.pw / 2; y = r.ph / 2; }
    for (const p of this.players) {
      p.x = x + (p.i && this.players.length > 1 ? -18 * (p.face || 1) : 0); p.y = y; p.ride = null; p.swing = null; p.dashT = 0;
      if (how.spot || how.start) { p.vx = 0; p.vy = 0; }
      p.safe = { x: p.x, y: p.y }; p.off = 0;
      if (!this.okSpot(p.x, p.y)) p.x = x;
    }
    for (const sp of r.spots) sp.lit = !!(s.spot && s.spot.room === id && Math.abs(s.spot.x - sp.x) < 30);
    r.recolour(s, true);
    this.camSnap();
    this.ev('room', id);
    if (!s.seen[def.area]) { s.seen[def.area] = 1; this.ev('area', def.area); this.ev('autosave'); }
    else if (firstVisit) this.ev('newroom', id);
    return true;
  }
  okSpot(x, y) { return !this.room.boxSolid(x - PH.W / 2, y - PH.H, x + PH.W / 2, y - 0.01); }
  /* a player went past an edge: find the neighbour at that world position and go there (both players come along) */
  doorway(p) {
    const r = this.room, wx = r.wx * TILE + p.x, wy = r.wy * TILE + p.y - PH.H / 2;
    let dx = 0, dy = 0; if (p.x < 0) dx = -1; else if (p.x > r.pw) dx = 1; else if (p.y - PH.H / 2 < 0) dy = -1; else if (p.y - PH.H / 2 > r.ph) dy = 1;
    const px = wx + dx * 4, py = wy + dy * 4;
    let to = null;
    for (const d of this.W.list) { const x0 = d.cx * C.CW * TILE, y0 = d.cy * C.CH * TILE; if (px >= x0 && px < x0 + d.cw * C.CW * TILE && py >= y0 && py < y0 + d.ch * C.CH * TILE && d.id !== r.id) { to = d; break; } }
    if (!to) { p.x = clamp(p.x, 2, r.pw - 2); p.y = clamp(p.y, PH.H, r.ph); return false; }
    if (this.hooks.door && this.hooks.door(p, to.id) === false) return false;   /* NET HOOK: online, room changes go through the host */
    const nx = wx - to.cx * C.CW * TILE, ny = wy + PH.H / 2 - to.cy * C.CH * TILE;
    const vx = p.vx, vy = p.vy, face = p.face;
    this.changeRoom(to.id, nx + dx * 6, ny + dy * 2, p, { vx, vy, face, dy });
    return true;
  }
  changeRoom(id, x, y, lead, o) {
    o = o || {};
    const others = this.players.filter(q => q !== lead);
    this.enterRoom(id, x, y, {});
    for (const q of this.players) { q.vx = o.vx || 0; q.vy = o.vy || 0; q.face = o.face || q.face; }
    if (o.dy < 0) for (const q of this.players) { q.vy = Math.min(q.vy, -7.2); q.rise = 1; }   /* up through a floor hole: a little extra hop */
    for (const q of others) { q.x = lead.x - 16 * (lead.face || 1); q.y = lead.y; if (!this.okSpot(q.x, q.y)) q.x = lead.x; q.inv = Math.max(q.inv, 30); }
    this.fade = Math.max(this.fade, 0.85); this.fadeTo = 0;
  }
  camSnap() { this.camTarget(); this.cam.x = this.camT.x; this.cam.y = this.camT.y; }
  camTarget() {
    const r = this.room, ps = this.players.filter(p => p.alive || p.bubble);
    let cx, cy;
    const L = this.players[this.leader] || this.players[0];
    if (ps.length > 1) {
      const a = ps[0], b = ps[1];
      if (Math.abs(a.x - b.x) < C.VW - 120 && Math.abs(a.y - b.y) < C.VH - 100) { cx = (a.x + b.x) / 2; cy = (a.y + b.y) / 2 - 20; }
      else { cx = L.x; cy = L.y - 20; }
    } else { cx = L.x + L.face * 30; cy = L.y - 20; }
    this.camT = { x: clamp(cx - C.VW / 2, 0, Math.max(0, r.pw - C.VW)), y: clamp(cy - C.VH / 2 - 10, 0, Math.max(0, r.ph - C.VH)) };
    if (r.pw < C.VW) this.camT.x = (r.pw - C.VW) / 2; if (r.ph < C.VH) this.camT.y = (r.ph - C.VH) / 2;
  }
  camStep() {
    this.camTarget(); const c = this.cam, t = this.camT;
    c.x += (t.x - c.x) * 0.14; c.y += (t.y - c.y) * 0.12;
    if (Math.abs(t.x - c.x) < 0.05) c.x = t.x; if (Math.abs(t.y - c.y) < 0.05) c.y = t.y;
  }

  /* ---------------- the tick ---------------- */
  step(masks) {
    this.events = [];
    if (this.freeze) return;
    this.t++; this.save.time++;
    if (this.fade > this.fadeTo) this.fade = Math.max(this.fadeTo, this.fade - 0.08); else if (this.fade < this.fadeTo) this.fade = Math.min(this.fadeTo, this.fade + 0.05);
    if (this.after && this.fade >= this.fadeTo && this.fadeTo === 1) { const f = this.after; this.after = null; f(); return; }
    const r = this.room;
    for (const p of this.players) { p.prev = p.in; p.in = (masks && masks[p.i]) | 0; }
    if (this.hooks.pre) this.hooks.pre(this);
    this.stepTiles();
    this.stepPlats();
    for (const p of this.players) if (!this.ext[p.i]) this.stepPlayer(p);
    if (this.room !== r) { this.camStep(); return; }   /* someone went through a doorway */
    if (this.role !== 'guest') { this.stepFoes(); this.stepGuard(); }
    this.stepShots(); this.stepHazards(); this.stepDrops(); this.stepItems();
    if (this.players.length > 1) this.coop();
    r.recolour(this.save); r.colour += (r.colourWant - r.colour) * 0.03;
    this.camStep();
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 0.5);
    if (this.hooks.post) this.hooks.post(this);
  }

  /* tiles that change: crumbling ledges, briars, gates opening, vents, wind gusts, caps, levers */
  stepTiles() {
    const r = this.room;
    for (const [i, s] of r.crumble) {
      s.t++;
      if (s.st === 'shake' && s.t > 30) { s.st = 'gone'; s.t = 0; this.ev('crumble', (i % r.w) * TILE + TILE / 2, Math.floor(i / r.w) * TILE + TILE / 2); }
      else if (s.st === 'gone' && s.t > 180) {
        const x = (i % r.w) * TILE, y = Math.floor(i / r.w) * TILE;
        if (!this.players.some(p => ov(p.x - PH.W / 2, p.y - PH.H, PH.W, PH.H, x, y, TILE, TILE))) r.crumble.delete(i);
      }
    }
    if (r.briarN === undefined) { r.briarN = 0; for (let i = 0; i < r.t.length; i++) if (r.t[i] === T.BRIAR) r.briarN++; }
    if (r.briarN) {
      const glows = this.players.filter(p => p.glow && (p.alive || p.bubble));
      for (let i = 0; i < r.t.length; i++) {
        if (r.t[i] !== T.BRIAR) continue;
        const x = (i % r.w) * TILE + TILE / 2, y = Math.floor(i / r.w) * TILE + TILE / 2;
        let want = 0; for (const p of glows) { const d = Math.hypot(p.x - x, p.y - 13 - y); if (d < 92) want = 1; }
        const v = r.briar[i]; r.briar[i] = want ? Math.min(1, v + 0.06) : Math.max(0, v - 0.025);
        if (v < 0.7 && r.briar[i] >= 0.7 && !this.briarSnd) { this.briarSnd = 1; this.ev('briar', x, y); }
      }
      this.briarSnd = 0;
    }
    for (const g of r.gates) g.o = clamp(g.o + (g.shut ? -0.06 : 0.025), 0, 1);
    for (const v of r.vents) {
      v.t = (v.t + 1) % 260; const was = v.on; v.on = v.t >= 130; v.tell = !v.on && v.t >= 100 ? 1 : 0;
      if (v.on && !was) this.ev('vent', v.x, v.y);
    }
    for (const w of r.wind) w.on = w.gust ? clamp(Math.sin(this.t * Math.PI * 2 / 330) * 2.2 + 0.6, 0, 1) : 1;
    for (const c of r.caps) c.squash = Math.max(0, c.squash - 0.08);
    for (const l of r.levers) if (l.t > 0) l.t--;
    for (const s of r.switches) if (s.t > 0) s.t--;
    for (const n of r.npcs) n.talk = Math.max(0, n.talk - 0.02);
  }
  stepPlats() {
    for (const p of this.room.plats) {
      const k = 0.5 - 0.5 * Math.cos(this.t * Math.PI * 2 / p.period), nx = p.x0 + p.dx * k, ny = p.y0 + p.dy * k;
      p.vx = nx - p.x; p.vy = ny - p.y; p.x = nx; p.y = ny;
    }
  }

  /* ---------------- players ---------------- */
  pressed(p, b) { return (p.in & b) && !(p.prev & b); }
  stepPlayer(p) {
    const r = this.room, st = this.st, s = this.save;
    p.at++; if (p.inv > 0) p.inv--; if (p.swingCd > 0) p.swingCd--; if (p.dashCd > 0) p.dashCd--; if (p.puffT < 99) p.puffT++; if (p.dropT > 0) p.dropT--; if (p.beamCd > 0) p.beamCd--;
    if (p.st === 'faint') return this.stepFaint(p);
    if (p.st === 'bubble') return this.stepBubble(p);
    if (p.st === 'sit') { if (p.in & (IN.L | IN.R | IN.JUMP | IN.D | IN.SWING | IN.DASH)) this.setSt(p, 'idle'); else { p.vx = 0; return; } }
    if (p.setback > 0) { p.setback--; p.vx *= 0.8; if (p.setback === 0 && p.safe) { p.x = p.safe.x; p.y = p.safe.y; p.vx = p.vy = 0; this.ev('setback', p.i); } else { p.vy = Math.min(p.vy + PH.G, PH.FALL); this.move(p); } return; }
    const L = !!(p.in & IN.L), R = !!(p.in & IN.R), U = !!(p.in & IN.U), D = !!(p.in & IN.D);
    const hx = (R ? 1 : 0) - (L ? 1 : 0);
    const inWater = r.water(p.x, p.y - 10), wet = !!r.water(p.x, p.y - 2);
    p.swim = !!inWater;
    if (p.st === 'hurt') { if (p.at >= PH.HURT_T) this.setSt(p, p.ground ? 'idle' : 'fall'); }
    const ctl = p.st !== 'hurt' && p.st !== 'focus';
    /* buffers */
    if (this.pressed(p, IN.JUMP)) p.buffer = PH.BUFFER; else if (p.buffer > 0) p.buffer--;
    if (p.ground) { p.coyote = PH.COYOTE; p.airDash = true; p.airPuff = true; } else if (p.coyote > 0) p.coyote--;
    /* ----- Leaf Dash ----- */
    if (p.dashT > 0) {
      p.dashT++; p.vy = 0; p.vx = p.face * PH.DASH_V;
      if (p.dashT > PH.DASH_T) { p.dashT = 0; p.vx = p.face * PH.RUN; this.setSt(p, p.ground ? 'run' : 'fall'); }
    } else if (s.ab.dash && ctl && this.pressed(p, IN.DASH) && p.dashCd <= 0 && (p.ground || p.airDash || p.wall)) {
      if (p.wall) { p.face = -p.wall; p.wall = 0; } else if (hx) p.face = hx;
      p.dashT = 1; p.dashCd = st.dashCd; if (!p.ground) p.airDash = false; p.vy = 0; p.vx = p.face * PH.DASH_V; p.swing = null;
      this.setSt(p, 'dash'); this.ev('dash', p.i);
    }
    const dashing = p.dashT > 0;
    /* ----- run ----- */
    if (!dashing) {
      const max = inWater ? PH.SWIM_RUN : PH.RUN;
      if (p.lock > 0) p.lock--;
      if (ctl && hx && p.lock <= 0) {
        const acc = p.ground ? PH.ACC : PH.AACC;
        p.vx += clamp(hx * max - p.vx, -acc, acc) * (Math.abs(p.vx) > max && sgn(p.vx) === hx ? 0.15 : 1);
        if (!p.swing || p.swing.dir !== 'f' || p.swing.t > 8) p.face = hx;
      } else if (p.lock <= 0 || !ctl) {
        const dec = p.ground ? PH.DEC : PH.ADEC; p.vx -= clamp(p.vx, -dec, dec);
      }
    }
    /* ----- Vine Grip: cling ----- */
    if (s.ab.grip && !p.ground && !dashing && ctl && !inWater) {
      const side = p.wall || hx;
      if (side && p.vy > -1.5 && this.wallAt(p, side)) {
        if (!p.wall) { p.wall = side; this.ev('cling', p.i); this.setSt(p, 'cling'); p.airDash = true; p.airPuff = true; }
        if (hx === -p.wall) p.wall = 0;
      } else if (p.wall && !this.wallAt(p, p.wall)) p.wall = 0;
    } else p.wall = 0;
    if (p.wall) { p.face = -p.wall; p.vx = p.wall * 0.5; if (p.vy > PH.CLING_SLIDE) p.vy = PH.CLING_SLIDE; }
    /* ----- jumping ----- */
    if (ctl && p.buffer > 0 && !dashing) {
      if (inWater && !this.headOut(p)) { p.vy = -PH.STROKE; p.buffer = 0; this.ev('splash', p.x, p.y - 10); this.setSt(p, 'swim'); }
      else if (p.ground && D && this.standOneway(p)) { p.dropT = 12; p.buffer = 0; p.ground = false; p.y += 1; }
      else if (p.ground || p.coyote > 0 || (wet && this.headOut(p))) { p.vy = -PH.JUMP; p.ground = false; p.coyote = 0; p.buffer = 0; p.rise = 1; p.ride = null; this.setSt(p, 'jump'); this.ev('jump', p.i); }
      else if (p.wall) { p.vy = -PH.WJ_VY; p.vx = -p.wall * PH.WJ_VX; p.face = -p.wall; p.lock = PH.WJ_LOCK; p.wall = 0; p.buffer = 0; p.rise = 1; this.setSt(p, 'jump'); this.ev('walljump', p.i); }
      else if (s.ab.puff && p.airPuff && p.buffer === PH.BUFFER) { p.vy = -PH.PUFF; p.airPuff = false; p.buffer = 0; p.rise = 1; p.puffT = 0; this.setSt(p, 'jump'); this.ev('puff', p.i); }
    }
    /* ----- gravity ----- */
    if (!dashing) {
      if (inWater) { p.vy = Math.min(p.vy + PH.SWIM_G, PH.SWIM_FALL); if (p.vy < -PH.STROKE) p.vy += 0.3; }
      else {
        if (p.rise && p.vy < 0 && !(p.in & IN.JUMP) && p.rise === 1) { p.vy = Math.max(p.vy, PH.CUT); p.rise = 0; }
        const g = p.rise && p.vy < 0 ? PH.GUP : PH.G;
        p.vy = Math.min(p.vy + g, p.wall ? PH.CLING_SLIDE : PH.FALL);
        if (p.vy >= 0) p.rise = 0;
      }
    }
    /* ----- water currents and wind ----- */
    let pushX = 0;
    if (inWater === T.CURL) pushX -= PH.CURRENT; else if (inWater === T.CURR) pushX += PH.CURRENT;
    for (const w of r.wind) if (w.on > 0 && ov(p.x - 7, p.y - 26, 14, 26, w.x, w.y, w.w, w.h)) { pushX += w.dx * w.on; if (!dashing) p.vy = Math.min(p.vy + w.dy * 0.55 * w.on, PH.FALL); }
    /* ----- vents: a steam column carries you up ----- */
    for (const v of r.vents) if (v.on && Math.abs(p.x - v.x) < 16 && p.y > v.y - v.h - 4 && p.y <= v.y + 2) { p.vy = Math.max(p.vy - PH.VENT_LIFT - PH.G, -PH.VENT_MAX); p.rise = 2; p.airDash = true; p.airPuff = true; if (p.ground) { p.ground = false; p.y -= 1; } }
    /* ----- swing ----- */
    if (p.swing) { p.swing.t++; if (p.swing.t === 1 || p.swing.t === 3 || p.swing.t === 5) this.swingHits(p); if (p.swing.t >= PH.SWING_T) p.swing = null; }
    if (ctl && !dashing && this.pressed(p, IN.SWING) && p.swingCd <= 0 && !p.wall) {
      const dir = U ? 'u' : (D && !p.ground) ? 'd' : 'f';
      p.swing = { dir, t: 0, reach: st.reach, hit: new Set() }; p.swingCd = st.swingCd; this.ev('swing', p.i, dir);
      this.swingHits(p);
    } else if (ctl && p.wall && this.pressed(p, IN.SWING) && p.swingCd <= 0) {
      p.swing = { dir: 'f', t: 0, reach: st.reach, hit: new Set() }; p.face = -p.wall; p.swingCd = st.swingCd; this.ev('swing', p.i, 'f'); this.swingHits(p);
    }
    /* ----- focus (hold) and Sunbeam (Up + tap) ----- */
    if (this.pressed(p, IN.FOCUS) && U && s.ab.beam && p.sun >= PH.SUN_COST && p.beamCd <= 0 && ctl) {
      p.sun -= PH.SUN_COST; p.beamCd = 24;
      r.shots.push({ kind: 'beam', x: p.x + p.face * 10, y: p.y - 14, vx: p.face * PH.BEAM_V, vy: 0, r: st.beamR, t: 0, life: 70, own: p.i, hit: new Set(), dmg: st.beamDmg });
      this.ev('beam', p.i);
    }
    const canFocus = (p.in & IN.FOCUS) && !U && p.ground && !hx && !dashing && p.sun >= PH.SUN_COST && p.leaves < p.maxLeaves && (p.st === 'focus' || ctl) && !inWater;
    if (canFocus) {
      if (p.st !== 'focus') { this.setSt(p, 'focus'); this.ev('focus', p.i, true); }
      p.focus += 1 / st.focusT; p.vx = 0;
      if (p.focus >= 1) { p.focus = 0; p.sun -= PH.SUN_COST; p.leaves = Math.min(p.maxLeaves, p.leaves + 1); this.ev('heal', p.i); if (p.leaves >= p.maxLeaves || p.sun < PH.SUN_COST) { this.ev('focus', p.i, false); this.setSt(p, 'idle'); } }
    } else if (p.st === 'focus') { p.focus = 0; this.ev('focus', p.i, false); this.setSt(p, 'idle'); }
    /* ----- move ----- */
    const wasGround = p.ground, vyBefore = p.vy;
    p.x += pushX * (p.ground && !inWater ? 0.6 : 1);
    this.move(p);
    if (p.ground && !wasGround) { this.ev('land', p.i, clamp(vyBefore / PH.FALL, 0, 1)); p.rise = 0; p.wall = 0; if (p.st === 'jump' || p.st === 'fall' || p.st === 'cling') this.setSt(p, 'idle'); }
    /* ----- state for the art ----- */
    if (p.st !== 'hurt' && p.st !== 'focus' && !dashing) {
      const ns = p.wall ? 'cling' : inWater && !p.ground ? 'swim' : !p.ground ? (p.vy < 0 ? 'jump' : 'fall') : Math.abs(p.vx) > 0.4 ? 'run' : 'idle';
      if (ns !== p.st) this.setSt(p, ns);
    }
    if (p.st === 'run') { p.stepT++; if (p.stepT % 16 === 0) this.ev('step', p.i); }
    /* ----- touching the world ----- */
    this.touch(p);
    /* ----- a safe spot to come back to after thorns ----- */
    if (p.ground && !p.ride && !r.thornAt(p.x - 30, p.y - PH.H, p.x + 30, p.y + 2) && !inWater) { if (++p.safeT > 8) p.safe = { x: p.x, y: p.y }; } else p.safeT = 0;
    /* ----- doorways ----- */
    if (p.x < 0 || p.x > r.pw || p.y - PH.H / 2 < 0 || p.y - PH.H / 2 > r.ph) this.doorway(p);
  }
  setSt(p, st) { if (p.st !== st) { p.st = st; p.at = 0; } }
  headOut(p) { return !this.room.water(p.x, p.y - PH.H + 4); }
  standOneway(p) { const ty = Math.floor((p.y + 1) / TILE); for (let tx = Math.floor((p.x - 6) / TILE); tx <= Math.floor((p.x + 6) / TILE); tx++) if (this.room.solid(tx, ty)) return false; return this.room.oneway(Math.floor(p.x / TILE), ty) || this.room.oneway(Math.floor((p.x - 6) / TILE), ty) || this.room.oneway(Math.floor((p.x + 6) / TILE), ty); }
  wallAt(p, side) { const x = side > 0 ? p.x + PH.W / 2 + 1 : p.x - PH.W / 2 - 1; return this.room.solid(Math.floor(x / TILE), Math.floor((p.y - 8) / TILE)) && this.room.solid(Math.floor(x / TILE), Math.floor((p.y - 20) / TILE)); }
  /* box movement against tiles, one-way ledges, moving platforms and glowcaps; feet at (p.x, p.y) */
  move(p) {
    const r = this.room, w = PH.W, h = PH.H;
    /* riding a platform */
    if (p.ride) { p.x += p.ride.vx; p.y += p.ride.vy; }
    /* x */
    let nx = p.x + p.vx;
    if (r.boxSolid(nx - w / 2, p.y - h + 0.5, nx + w / 2, p.y - 0.5)) {
      if (p.vx > 0) nx = Math.floor((nx + w / 2) / TILE) * TILE - w / 2 - 0.01; else if (p.vx < 0) nx = Math.ceil((nx - w / 2) / TILE) * TILE + w / 2 + 0.01;
      if (r.boxSolid(nx - w / 2, p.y - h + 0.5, nx + w / 2, p.y - 0.5)) nx = p.x;
      if (p.dashT) { p.dashT = 0; this.setSt(p, p.ground ? 'idle' : 'fall'); }
      p.vx = 0;
    }
    p.x = nx;
    /* y */
    const oldB = p.y; let ny = p.y + p.vy, landed = false;
    if (p.vy < 0) {
      if (r.boxSolid(p.x - w / 2, ny - h, p.x + w / 2, ny - h + 1)) {
        /* corner nudge: slip round a ceiling corner by a few px */
        let fixed = false;
        for (let k = 1; k <= 6 && !fixed; k++) for (const d of [-1, 1]) if (!fixed && !r.boxSolid(p.x + d * k - w / 2, ny - h, p.x + d * k + w / 2, p.y - 0.5)) { p.x += d * k; fixed = true; }
        if (!fixed) { ny = Math.ceil((ny - h) / TILE) * TILE + h + 0.01; p.vy = 0; p.rise = 0; }
      }
      p.ground = false; p.ride = null;
    } else {
      /* falling or standing: tiles */
      const ty0 = Math.floor((oldB - 0.01) / TILE), ty1 = Math.floor((ny + 0.01) / TILE);
      for (let ty = ty0 + 1; ty <= ty1 && !landed; ty++) {
        for (let tx = Math.floor((p.x - w / 2 + 0.5) / TILE); tx <= Math.floor((p.x + w / 2 - 0.5) / TILE); tx++) {
          const top = ty * TILE;
          if (r.solid(tx, ty) || (r.oneway(tx, ty) && p.dropT <= 0 && oldB <= top + 0.5)) { ny = top; landed = true; break; }
        }
      }
      if (!landed && r.boxSolid(p.x - w / 2, ny - h + 0.5, p.x + w / 2, ny)) { ny = Math.floor(ny / TILE) * TILE; landed = true; }
      p.ride = null;
      /* moving platforms (solid on top) */
      for (const pl of r.plats) {
        if (p.x + w / 2 > pl.x && p.x - w / 2 < pl.x + pl.w && oldB <= pl.y - pl.vy + 1 && ny >= pl.y - 0.5 && p.dropT <= 0) { ny = pl.y; landed = true; p.ride = pl; }
      }
      /* glowcaps bounce */
      for (const c of r.caps) {
        const top = c.y - 12;
        if (Math.abs(p.x - c.x) < 22 && oldB <= top + 1 && ny >= top && p.vy >= 0) { ny = top; p.vy = -PH.CAP; p.rise = 2; p.airDash = p.airPuff = true; c.squash = 1; this.ev('bounce', p.i, 'cap'); this.setSt(p, 'jump'); p.ground = false; p.y = ny; return; }
      }
      if (landed) { p.vy = 0; p.ground = true; } else p.ground = false;
      /* crumbling ledges start to go when you stand on them */
      if (p.ground && !p.ride) for (let tx = Math.floor((p.x - w / 2 + 0.5) / TILE); tx <= Math.floor((p.x + w / 2 - 0.5) / TILE); tx++) {
        const ty = Math.floor((ny + 1) / TILE); if (r.code(tx, ty) === T.CRUMBLE) { const i = r.idx(clamp(tx, 0, r.w - 1), clamp(ty, 0, r.h - 1)); if (!r.crumble.has(i)) { r.crumble.set(i, { st: 'shake', t: 0 }); this.ev('crumbleTell', tx * TILE + 10, ty * TILE); } }
      }
    }
    p.y = ny;
  }
  /* thorns, glooms, shots, hazards, pickups, things to talk to */
  touch(p) {
    const r = this.room, x0 = p.x - PH.W / 2, y0 = p.y - PH.H, s = this.save;
    if (p.setback <= 0 && p.st !== 'faint') {   /* thorns always set you back to safe ground; they take a leaf unless you are still blinking */
      const th = r.thornAt(x0 + 2, y0 + 4, p.x + PH.W / 2 - 2, p.y);
      if (th) { if (p.inv <= 0) this.hurt(p, th.x, 'thorn'); if (p.alive && p.st !== 'faint') { p.setback = 26; p.vx *= 0.3; p.vy = -2; this.ev('thorn', p.i); } }
    }
    if (p.inv <= 0) {
      for (const f of r.foes) if (f.alive && ov(x0, y0, PH.W, PH.H, f.x - f.w / 2 + 2, f.y - f.h / 2 + 2, f.w - 4, f.h - 4)) { if (this.foeHurts(f, p)) { this.hurt(p, f.x, f.kind); break; } }
      const g = r.guard;
      if (g && g.awake && !g.done && this.guardHurts(g) && ov(x0, y0, PH.W, PH.H, g.x - g.w / 2 + 8, g.y - g.h / 2 + 8, g.w - 16, g.h - 16)) this.hurt(p, g.x, g.kind);
    }
    /* pickups */
    for (const it of r.items) {
      if (it.got || it.kind === 'cluster') continue;
      if (!ov(x0 - 4, y0 - 4, PH.W + 8, PH.H + 8, it.x - 10, it.y - 10, 20, 20)) continue;
      this.pickup(p, it);
    }
    /* revive a partner's seed bubble */
    for (const q of this.players) if (q !== p && q.st === 'bubble' && p.alive && Math.hypot(q.x - p.x, q.y - 14 - p.y + 13) < 26) this.revive(q);
    /* Up near a Watering Spot, the Peddler or a sign */
    p.prompt = null; p.near = null;
    if (p.ground && p.alive) {
      for (const sp of r.spots) if (Math.abs(sp.x - p.x) < 24 && Math.abs(sp.y - p.y) < 30) { p.prompt = 'Rest'; p.near = sp; }
      for (const n of r.npcs) if (Math.abs(n.x - p.x) < 40 && Math.abs(n.y - p.y) < 40) { p.prompt = 'Talk'; p.near = n; }
      if (!p.near) for (const sg of r.signs) if (Math.abs(sg.x - p.x) < 20 && Math.abs(sg.y - p.y) < 30) { p.prompt = 'Read'; p.near = sg; }
      if (p.near && this.pressed(p, IN.U) && !(p.in & IN.FOCUS)) {
        if (p.prompt === 'Rest') this.rest(p, p.near);
        else if (p.prompt === 'Talk') { p.near.talk = 1; this.ev('talk', 'peddler'); }
        else this.ev('sign', p.near.text);
      }
    }
  }
  rest(p, sp) {
    const s = this.save, r = this.room;
    s.spot = { room: r.id, x: sp.x, y: sp.y };
    for (const o of r.spots) o.lit = o === sp;
    for (const q of this.players) { if (q.st === 'bubble' || q.st === 'faint') this.revive(q, true); q.leaves = q.maxLeaves; q.sun = Math.max(q.sun, 0); q.inv = 0; if (q === p || Math.abs(q.x - sp.x) < 60) { this.setSt(q, 'sit'); q.vx = 0; } }
    this.ev('rest', p.i); this.ev('autosave');
  }

  /* ---------------- hurting, fainting, waking ---------------- */
  hurt(p, fromX, kind) {
    if (p.inv > 0 || !p.alive || p.st === 'faint' || p.st === 'bubble' || p.st === 'sit') return false;
    if (this.hooks.hurt && this.hooks.hurt(p, kind) === false) return false;   /* NET HOOK */
    p.leaves--; p.focus = 0; p.swing = null; p.dashT = 0; p.wall = 0;
    this.ev('hurt', p.i, kind); this.shake = Math.max(this.shake, 4);
    if (this.st.coat) this.petalBurst(p);
    if (p.leaves <= 0) { this.faint(p); return true; }
    p.inv = this.save.gentle ? PH.INV_GENTLE : PH.INV;
    const d = sgn(p.x - fromX) || -p.face;
    p.vx = d * 3.2; p.vy = -3.6; p.ground = false; p.rise = 0; this.setSt(p, 'hurt');
    return true;
  }
  petalBurst(p) {
    for (const f of this.room.foes) if (f.alive && Math.hypot(f.x - p.x, f.y - p.y + 13) < 90) this.hitFoe(f, 1, p, p.x);
    this.ev('petals', p.x, p.y - 13);
  }
  faint(p) {
    p.leaves = 0; p.alive = false; p.vx = 0; p.swing = null; this.setSt(p, 'faint'); p.faintT = 0; p.inv = 0;
    this.ev('faint', p.i);
  }
  stepFaint(p) {
    p.faintT++; p.vy = Math.min(p.vy + PH.G, PH.FALL); p.vx *= 0.9; this.move(p);
    if (p.faintT === 70) {
      const other = this.players.find(q => q !== p && q.alive);
      if (other) { this.setSt(p, 'bubble'); p.bubble = true; p.vy = -1; this.ev('bubble', p.i); }
      else this.wakeAtSpot(p);
    }
  }
  stepBubble(p) {
    const other = this.players.find(q => q !== p && q.alive);
    if (!other) { if (!this.after) this.wakeAtSpot(p); return; }
    /* drift gently to the partner, through anything */
    const dx = other.x - p.x, dy = other.y - 30 - p.y, d = Math.hypot(dx, dy) || 1;
    const sp = d > 120 ? 1.6 : 0.6; p.vx += (dx / d * sp - p.vx) * 0.05; p.vy += (dy / d * sp - p.vy) * 0.05 + Math.sin(this.t / 20 + p.i) * 0.02;
    p.x += p.vx; p.y += p.vy;
    p.x = clamp(p.x, 10, this.room.pw - 10); p.y = clamp(p.y, 40, this.room.ph);
  }
  revive(p, quiet) {
    p.alive = true; p.bubble = false; p.leaves = Math.max(p.leaves, Math.min(p.maxLeaves, 2)); p.inv = 90; p.vy = -3; this.setSt(p, 'fall');
    if (!this.okSpot(p.x, p.y)) { const o = this.players.find(q => q !== p); if (o) { p.x = o.x; p.y = o.y; } }
    if (!quiet) this.ev('revive', p.i);
  }
  /* everyone nodded off: the dew is left in a puddle, you wake at the last Watering Spot */
  wakeAtSpot(p) {
    if (this.after) return;
    this.fadeTo = 1;
    const s = this.save, r = this.room;
    this.after = () => {
      s.deaths++;
      if (!this.st.pouch && s.dew > 0) {
        const sp = p.safe || { x: p.x, y: p.y };
        s.puddle = { room: r.id, x: Math.round(sp.x), y: Math.round(sp.y - 10), v: s.dew }; s.dew = 0;
      }
      const spot = s.spot || { room: 'rg_hub', x: null, y: null };
      if (r.guard && !r.guard.done) { /* the guardian settles down again */ }
      for (const q of this.players) { q.alive = true; q.bubble = false; q.leaves = q.maxLeaves; q.inv = 60; q.vx = q.vy = 0; q.sun = Math.min(q.sun, q.sunMax); this.setSt(q, 'sit'); q.focus = 0; q.setback = 0; }
      this.enterRoom(spot.room, spot.x, spot.y, { spot: true });
      this.fade = 1; this.fadeTo = 0;
      this.ev('wake'); this.ev('autosave');
    };
  }

  /* ---------------- the staff ---------------- */
  swingBox(p) {
    const sw = p.swing, R = sw.reach;
    if (sw.dir === 'u') return [p.x - 16 - (R - 30) * 0.3, p.y - PH.H - R + 2, 32 + (R - 30) * 0.6, R + 4];
    if (sw.dir === 'd') return [p.x - 15 - (R - 30) * 0.3, p.y - 8, 30 + (R - 30) * 0.6, R + 4];
    return p.face > 0 ? [p.x + 2, p.y - PH.H - 4, R + 4, PH.H + 6] : [p.x - R - 6, p.y - PH.H - 4, R + 4, PH.H + 6];
  }
  swingHits(p) {
    const sw = p.swing; if (!sw || sw.t > 6) return;
    const r = this.room, [bx, by, bw, bh] = this.swingBox(p), s = this.save;
    let bounce = false, recoil = false;
    const hitOnce = key => { if (sw.hit.has(key)) return false; sw.hit.add(key); return true; };
    for (const f of r.foes) {
      if (!f.alive || !ov(bx, by, bw, bh, f.x - f.w / 2 - 2, f.y - f.h / 2 - 2, f.w + 4, f.h + 4) || !hitOnce(f)) continue;
      if (this.hooks.swingFoe && this.hooks.swingFoe(p, f, sw) === false) { bounce = bounce || sw.dir === 'd'; continue; }   /* NET HOOK: a guest asks the host */
      if (f.kind === 'knight' && sw.dir === 'f' && f.st !== 'rest' && f.face === -p.face && Math.abs(f.y - (p.y - 13)) < 30) {
        f.st = 'block'; f.t = 0; f.vx = -f.face * 1.5; p.vx -= p.face * 2.6; this.ev('block', f.x - f.face * 10, f.y); recoil = true; continue;
      }
      this.hitFoe(f, 1, p, p.x); p.sun = Math.min(p.sunMax, p.sun + this.st.sunHit);
      if (sw.dir === 'd') bounce = true; else if (sw.dir === 'f') recoil = true;
    }
    const g = r.guard;
    if (g && g.awake && !g.done && g.st !== 'wake' && ov(bx, by, bw, bh, g.x - g.w / 2, g.y - g.h / 2, g.w, g.h) && hitOnce(g)) {
      if (!(this.hooks.swingGuard && this.hooks.swingGuard(p, g) === false)) { this.hitGuard(g, 1, p); p.sun = Math.min(p.sunMax, p.sun + this.st.sunHit); }
      if (sw.dir === 'd') bounce = true; else if (sw.dir === 'f') recoil = true;
    }
    for (const sh of r.shots) if (sh.kind !== 'beam' && sh.kind !== 'drop' && !sh.dead && ov(bx, by, bw, bh, sh.x - sh.r - 3, sh.y - sh.r - 3, sh.r * 2 + 6, sh.r * 2 + 6) && hitOnce(sh)) {
      sh.dead = true; this.ev('pop', sh.kind, sh.x, sh.y); if (sw.dir === 'd') bounce = true;
    }
    for (const b of r.buds) if (!b.open && ov(bx, by, bw, bh, b.x - 10, b.y - (b.ceil ? 0 : 20), 20, 20) && hitOnce(b)) this.openBud(b);
    for (const fl of r.flowers) if (!fl.temp && !r.gotSun.has(fl) && ov(bx, by, bw, bh, fl.x - 8, fl.y - (fl.ceil ? 0 : 18), 16, 18)) { r.gotSun.add(fl); p.sun = Math.min(p.sunMax, p.sun + 3); this.ev('sway', fl.x, fl.y); }
    for (const it of r.items) if (it.kind === 'cluster' && !it.got && ov(bx, by, bw, bh, it.x - 12, it.y - 12, 24, 24) && hitOnce(it)) {
      if (this.hooks.swingItem && this.hooks.swingItem(p, it) === false) { if (sw.dir === 'd') bounce = true; continue; }
      this.hitCluster(it); if (sw.dir === 'd') bounce = true; else recoil = true;
    }
    for (const br of r.breaks) if (br.hp > 0 && ov(bx, by, bw, bh, br.x - 2, br.y - 2, br.w + 4, br.h + 4) && hitOnce(br)) {
      if (this.hooks.swingBreak && this.hooks.swingBreak(p, br) === false) continue;
      this.hitBreak(br); recoil = true;
    }
    for (const l of r.levers) if (!l.on && ov(bx, by, bw, bh, l.x - 10, l.y - 24, 20, 24) && hitOnce(l)) {
      if (this.hooks.swingLever && this.hooks.swingLever(p, l) === false) continue;
      this.pullLever(l);
    }
    for (const c of r.caps) if (sw.dir === 'd' && ov(bx, by, bw, bh, c.x - 22, c.y - 16, 44, 16) && hitOnce(c)) { c.squash = 1; bounce = true; p.vy = -PH.CAP; p.rise = 2; this.ev('bounce', p.i, 'cap'); }
    /* thorns: a down-swing bounces off them (no hurt) */
    if (sw.dir === 'd' && !bounce && r.thornAt(bx, by + 6, bx + bw, by + bh)) { bounce = true; this.ev('pogo', p.i, 'thorn'); }
    if (bounce && p.vy > -this.st.pogo) { p.vy = -this.st.pogo; p.rise = 2; p.airDash = true; p.airPuff = true; this.ev('pogo', p.i); }
    if (recoil && sw.dir === 'f' && !sw.rec) { sw.rec = 1; p.vx = -p.face * (p.ground ? 1.8 : 1.4); }
  }
  hitFoe(f, dmg, p, fromX) {
    if (!f.alive) return;
    f.hp -= dmg; f.hurt = 8; this.ev('hit', f.kind, f.x, f.y);
    const d = sgn(f.x - fromX) || 1;
    if (f.hp <= 0) { this.bloom(f); return; }
    if (f.kind === 'smog') { f.vx = d * 3.2; f.vy = -0.6; f.st = 'push'; f.t = 0; }
    else if (f.kind === 'thorn' || f.kind === 'cog') { if (f.st !== 'charge') { f.vx = d * 2.6; f.st = 'push'; f.t = 0; } else { f.st = 'dizzy'; f.t = 0; f.vx = 0; } }
    else if (f.kind === 'drip') { if (f.st === 'hang' || f.st === 'shake') { f.st = 'fall'; f.t = 0; f.vy = 0; } else { f.vx = d * 2.4; f.st = 'push'; f.t = 0; } }
    else if (f.kind === 'knight') { f.vx = d * 1.6; }
  }
  bloom(f) {
    const r = this.room, s = this.save;
    f.alive = false; f.hp = 0;
    /* the flower settles on the nearest surface: the floor below, or the ceiling for hanging glooms */
    let fx = Math.round(f.x), fy = Math.round(f.y), ceil = false;
    const tx = clamp(Math.floor(fx / TILE), 0, r.w - 1);
    if (f.ceil && f.st !== 'ooze') { let ty = Math.floor(f.y / TILE); while (ty > 0 && !r.solid(tx, ty - 1)) ty--; fy = ty * TILE; ceil = true; }
    else { let ty = Math.floor(f.y / TILE), n = 0; while (ty < r.h - 1 && !r.solid(tx, ty + 1) && !r.oneway(tx, ty + 1) && n < 14) { ty++; n++; } if (n < 14 && ty < r.h - 1 && !r.water(fx, ty * TILE + 10)) fy = (ty + 1) * TILE; else { ceil = false; fy = Math.round(f.y + 10); } }
    r.flowers.push({ x: fx, y: fy, kind: FOE[f.kind].fl, ceil, t: 0, seed: f.id * 7 + 3, temp: !!f.temp });
    if (!f.temp) { (s.bloom[r.id] = s.bloom[r.id] || []).push([f.id, fx, fy, ceil ? 1 : 0]); }
    this.ev('bloom', f.kind, f.x, f.y, FOE[f.kind].fl);
    const n = f.temp ? 1 : FOE[f.kind].dew; for (let i = 0; i < n; i++) this.dropDew(f.x, f.y, 1);
    r.recolour(s);
  }
  openBud(b) {
    const r = this.room, s = this.save;
    b.open = true; r.buds.splice(r.buds.indexOf(b), 1);
    r.flowers.push({ x: b.x, y: b.y, kind: 6, ceil: b.ceil, t: 0, seed: b.id * 11 + 5 });
    (s.buds[r.id] = s.buds[r.id] || []).push(b.id);
    this.ev('bud', b.x, b.y - (b.ceil ? -10 : 10)); r.recolour(s);
  }
  hitCluster(it) {
    it.hp--; it.hurt = 8; this.ev('crack', it.x, it.y);
    const n = it.hp > 0 ? 3 : 6; for (let i = 0; i < n; i++) this.dropDew(it.x, it.y, 1);
    if (it.hp <= 0) { it.got = true; this.save.got[it.id] = 1; this.ev('break', it.x, it.y); this.room.items.splice(this.room.items.indexOf(it), 1); }
  }
  hitBreak(br) {
    const r = this.room;
    br.hp--; br.hurt = 10; this.ev('crack', br.x + br.w / 2, br.y + br.h / 2);
    if (br.hp <= 0) {
      for (const [a, b] of br.cells) r.t[b * r.w + a] = T.AIR;
      this.save.broke[br.key] = 1; r.breaks.splice(r.breaks.indexOf(br), 1); this.ev('break', br.x + br.w / 2, br.y + br.h / 2); this.ev('secret');
    }
  }
  pullLever(l) {
    l.on = true; l.t = 20; this.ev('lever', l.x, l.y);
    if (l.gate) { this.save.open[l.gate.key] = 1; this.room.updateGates(this.save); this.ev('autosave'); }
  }
  dropDew(x, y, v) {
    const a = this.rand() * Math.PI - Math.PI, sp = 1.5 + this.rand() * 2.5;
    this.room.drops.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, t: 0, v });
  }

  /* ---------------- pickups ---------------- */
  pickup(p, it) {
    if (this.hooks.pickup && this.hooks.pickup(p, it) === false) return;   /* NET HOOK */
    const s = this.save, W = this.W, r = this.room;
    it.got = true; r.items.splice(r.items.indexOf(it), 1);
    if (it.kind === 'puddle') { s.dew += it.v; s.puddle = null; this.ev('pickup', 'puddle', it.v); this.ev('dewBig', it.x, it.y, it.v); return; }
    s.got[it.key] = 1;
    if (it.kind === 'life') { s.life++; const before = this.st.maxLeaves; this.applyStats(); for (const q of this.players) if (this.st.maxLeaves > before) q.leaves = q.maxLeaves; this.ev('get', 'life', s.life); }
    else if (it.kind === 'vessel') { s.vessels++; this.applyStats(); for (const q of this.players) q.sun = q.sunMax; this.ev('get', 'vessel', s.vessels); }
    else if (it.kind === 'notch') { s.notches++; this.ev('get', 'notch', s.notches); }
    else if (it.kind === 'charm') { s.charms[it.id] = 1; this.ev('get', 'charm', it.id); }
    else if (it.kind === 'ability') { s.ab[it.id] = 1; this.applyStats(); for (const q of this.players) { q.leaves = q.maxLeaves; q.glow = !!s.ab.glow; } this.ev('get', 'ability', it.id); }
    this.ev('pickup', it.kind, it.id); this.ev('autosave');
    void W;
  }

  /* ---------------- glooms ---------------- */
  near(f, range) {
    let best = null, bd = range;
    for (const p of this.players) { if (!p.alive) continue; const d = Math.hypot(p.x - f.x, p.y - 13 - f.y); if (d < bd) { bd = d; best = p; } }
    return best;
  }
  foeHurts() { return true; }
  /* ground movement for rollers and walkers: turn at walls and ledge edges */
  walk(f, speed) {
    const r = this.room, hw = f.w / 2;
    f.vy = Math.min(f.vy + PH.G, PH.FALL);
    let nx = f.x + f.vx;
    const fx = nx + sgn(f.vx) * hw, foot = f.y + f.h / 2;
    const ground = this.groundUnder(f);
    if (r.boxSolid(nx - hw, f.y - f.h / 2 + 1, nx + hw, foot - 1) || (ground && speed && !r.solid(Math.floor(fx / TILE), Math.floor((foot + 4) / TILE)) && !r.oneway(Math.floor(fx / TILE), Math.floor((foot + 4) / TILE))) || nx < hw || nx > r.pw - hw) { f.vx = 0; nx = f.x; f.turned = true; } else f.turned = false;
    f.x = nx;
    let ny = f.y + f.vy;
    if (f.vy > 0) { const tyb = Math.floor((ny + f.h / 2) / TILE); for (let tx = Math.floor((f.x - hw + 1) / TILE); tx <= Math.floor((f.x + hw - 1) / TILE); tx++) if (r.solid(tx, tyb) || (r.oneway(tx, tyb) && f.y + f.h / 2 <= tyb * TILE + 1)) { ny = tyb * TILE - f.h / 2; f.vy = 0; break; } }
    else if (f.vy < 0 && r.boxSolid(f.x - hw, ny - f.h / 2, f.x + hw, ny - f.h / 2 + 1)) { f.vy = 0; ny = f.y; }
    f.y = ny;
  }
  groundUnder(f) { const r = this.room, ty = Math.floor((f.y + f.h / 2 + 1) / TILE); for (let tx = Math.floor((f.x - f.w / 2 + 1) / TILE); tx <= Math.floor((f.x + f.w / 2 - 1) / TILE); tx++) if (r.solid(tx, ty) || r.oneway(tx, ty)) return true; return false; }
  fly(f) {
    const r = this.room, hw = f.w / 2, hh = f.h / 2;
    let nx = f.x + f.vx; if (r.boxSolid(nx - hw, f.y - hh, nx + hw, f.y + hh) || nx < hw || nx > r.pw - hw) { f.vx = -f.vx * 0.3; nx = f.x; }
    f.x = nx;
    let ny = f.y + f.vy; if (r.boxSolid(f.x - hw, ny - hh, f.x + hw, ny + hh) || ny < hh || ny > r.ph - hh) { f.vy = -f.vy * 0.3; ny = f.y; }
    f.y = ny;
  }
  stepFoes() {
    const r = this.room, gk = this.save.gentle ? 0.85 : 1;
    for (const f of r.foes) {
      if (!f.alive) continue;
      f.t++; if (f.hurt > 0) f.hurt--;
      const k = f.kind;
      if (k === 'smog') {
        if (f.st === 'push') { f.vx *= 0.9; f.vy *= 0.9; if (f.t > 18) { f.st = 'drift'; f.t = 0; } this.fly(f); continue; }
        const p = this.near(f, 170);
        if (p) { const dx = p.x - f.x, dy = p.y - 14 - f.y, d = Math.hypot(dx, dy) || 1, sp = 0.75 * gk; f.vx += (dx / d * sp - f.vx) * 0.03; f.vy += (dy / d * sp - f.vy) * 0.03; f.face = sgn(dx) || f.face; }
        else { const dx = f.hx - f.x, dy = f.hy + Math.sin(f.t / 40 + f.id) * 10 - f.y; f.vx += (clamp(dx * 0.02, -0.4, 0.4) - f.vx) * 0.04; f.vy += (clamp(dy * 0.03, -0.4, 0.4) - f.vy) * 0.05; }
        f.vy += Math.sin(f.t / 18 + f.id * 2) * 0.012;
        this.fly(f);
      } else if (k === 'thorn') {
        if (f.st === 'push') { f.vx *= 0.92; this.walk(f, 0); if (f.t > 20) { f.st = 'roll'; f.t = 0; } continue; }
        const p = this.near(f, 150);
        if (f.st === 'roll') {
          f.vx = f.face * 0.9 * gk; this.walk(f, 1); if (f.turned) f.face = -f.face;
          if (p && Math.abs(p.y - (f.y + f.h / 2)) < 26 && sgn(p.x - f.x) === f.face && f.t > 40) { f.st = 'rush'; f.t = 0; }
        } else if (f.st === 'rush') {
          if (f.t < 20) { f.vx = 0; this.walk(f, 0); }
          else { f.vx = f.face * 2.3 * gk; this.walk(f, 1); if (f.turned || f.t > 110) { f.face = f.turned ? -f.face : f.face; f.st = 'roll'; f.t = 0; } }
        } else { f.st = 'roll'; f.t = 0; }
      } else if (k === 'drip') {
        if (f.st === 'hang') {
          f.y = f.hy + Math.sin(f.t / 30 + f.id) * 1.2;
          for (const p of this.players) if (p.alive && Math.abs(p.x - f.x) < 30 && p.y > f.y && p.y - f.y < 260) { f.st = 'shake'; f.t = 0; this.ev('drip', f.x, f.y); break; }
        } else if (f.st === 'shake') { if (f.t > 36 / gk) { f.st = 'fall'; f.t = 0; f.vy = 0; } }
        else if (f.st === 'fall') { f.vx = 0; this.walk(f, 0); if (this.groundUnder(f)) { f.st = 'ooze'; f.t = 0; f.ceil = false; this.ev('splat', f.x, f.y + f.h / 2); } }
        else if (f.st === 'ooze' || f.st === 'push') {
          if (f.st === 'push') { f.vx *= 0.9; if (f.t > 16) { f.st = 'ooze'; f.t = 0; } this.walk(f, 0); continue; }
          const p = this.near(f, 200); if (p && f.t % 30 === 0) f.face = sgn(p.x - f.x) || f.face;
          f.vx = f.face * 0.7 * gk; this.walk(f, 1); if (f.turned) f.face = -f.face;
        }
      } else if (k === 'cog') {
        const p = this.near(f, 190);
        if (f.st === 'walk') {
          f.vx = f.face * 0.6 * gk; this.walk(f, 1); if (f.turned) f.face = -f.face;
          if (p && Math.abs(p.y - (f.y + f.h / 2)) < 30 && f.t > 30) { f.face = sgn(p.x - f.x) || f.face; f.st = 'wind'; f.t = 0; this.ev('wind', f.x, f.y); }
        } else if (f.st === 'wind') { f.vx = 0; this.walk(f, 0); if (f.t > 46 / gk) { f.st = 'charge'; f.t = 0; this.ev('charge', f.x, f.y); } }
        else if (f.st === 'charge') { f.vx = f.face * 3.4 * gk; this.walk(f, 1); if (f.turned || f.t > 80) { f.st = 'dizzy'; f.t = 0; f.vx = 0; this.ev('clunk', f.x, f.y); } }
        else if (f.st === 'dizzy') { f.vx = 0; this.walk(f, 0); if (f.t > 60) { f.st = 'walk'; f.t = 0; f.face = -f.face; } }
        else if (f.st === 'push') { f.vx *= 0.9; this.walk(f, 0); if (f.t > 18) { f.st = 'walk'; f.t = 0; } }
      } else if (k === 'lantern') {
        const p = this.near(f, 230);
        if (f.st === 'idle') { f.n++; if (p && f.n > 150) { f.st = 'glow'; f.t = 0; f.n = 0; } }
        else if (f.st === 'glow') { if (f.t > 50 / gk) { f.st = 'puff'; f.t = 0; const tgt = p || this.players[0]; const a0 = Math.atan2(tgt.y - 14 - f.y, tgt.x - f.x); for (const da of [-0.45, 0, 0.45]) r.shots.push({ kind: 'spore', x: f.x, y: f.y + (f.ceil ? 6 : -6), vx: Math.cos(a0 + da) * 0.95 * gk, vy: Math.sin(a0 + da) * 0.95 * gk, r: 6, t: 0, life: 300, own: -1 }); this.ev('spore', f.x, f.y); } }
        else if (f.st === 'puff') { if (f.t > 22) { f.st = 'idle'; f.t = 0; } }
      } else if (k === 'knight') {
        const p = this.near(f, 230);
        if (f.st === 'walk') {
          if (p) { f.face = sgn(p.x - f.x) || f.face; f.vx = f.face * 0.7 * gk; } else { f.vx = f.face * 0.4 * gk; }
          this.walk(f, 1); if (f.turned && !p) f.face = -f.face;
          if (p && Math.abs(p.x - f.x) < 75 && Math.abs(p.y - (f.y + f.h / 2)) < 34 && f.t > 40) { f.st = 'ready'; f.t = 0; f.vx = 0; this.ev('ready', f.x, f.y); }
        } else if (f.st === 'block') { f.vx *= 0.85; this.walk(f, 0); if (f.t > 14) { f.st = 'walk'; f.t = 0; } }
        else if (f.st === 'ready') { f.vx = 0; this.walk(f, 0); if (f.t > 40 / gk) { f.st = 'shove'; f.t = 0; this.ev('shove', f.x, f.y); } }
        else if (f.st === 'shove') { f.vx = f.face * 3.2 * gk; this.walk(f, 1); if (f.t > 22 || f.turned) { f.st = 'rest'; f.t = 0; f.vx = 0; } }
        else if (f.st === 'rest') { f.vx = 0; this.walk(f, 0); if (f.t > 60) { f.st = 'walk'; f.t = 0; } }
        else f.st = 'walk';
      }
    }
  }

  /* ---------------- shots, hazards, dew, items ---------------- */
  stepShots() {
    const r = this.room;
    for (const s of r.shots) {
      s.t++; if (s.t > s.life) s.dead = true;
      if (s.kind === 'beam') {
        s.x += s.vx;
        if (r.solid(Math.floor((s.x + sgn(s.vx) * 6) / TILE), Math.floor(s.y / TILE)) || s.x < -20 || s.x > r.pw + 20) { s.dead = true; this.ev('beamEnd', s.x, s.y); }
        if (this.role !== 'guest') for (const f of r.foes) if (f.alive && !s.hit.has(f) && ov(s.x - 12, s.y - s.r, 24, s.r * 2, f.x - f.w / 2, f.y - f.h / 2, f.w, f.h)) { s.hit.add(f); this.hitFoe(f, s.dmg, this.players[s.own] || this.players[0], s.x - s.vx * 3); }
        const g = r.guard; if (this.role !== 'guest' && g && g.awake && !g.done && !s.hit.has(g) && ov(s.x - 12, s.y - s.r, 24, s.r * 2, g.x - g.w / 2, g.y - g.h / 2, g.w, g.h)) { s.hit.add(g); this.hitGuard(g, s.dmg, null); }
        for (const sw of r.switches) if (!sw.on && Math.abs(s.x - sw.x) < 14 && Math.abs(s.y - sw.y) < 16 + s.r) this.flipSwitch(sw);
        for (const b of r.buds) if (!b.open && Math.abs(s.x - b.x) < 12 && Math.abs(s.y - b.y) < 20) this.openBud(b);
        for (const sh of r.shots) if (sh !== s && sh.kind !== 'beam' && !sh.dead && Math.abs(sh.x - s.x) < 14 && Math.abs(sh.y - s.y) < s.r + sh.r) { sh.dead = true; this.ev('pop', sh.kind, sh.x, sh.y); }
        continue;
      }
      if (s.kind === 'spore') { s.vy += Math.sin(s.t / 14) * 0.012; s.x += s.vx; s.y += s.vy; if (r.solid(Math.floor(s.x / TILE), Math.floor(s.y / TILE))) { s.dead = true; this.ev('pop', 'spore', s.x, s.y); } }
      else if (s.kind === 'drop') { s.y += s.vy; s.x += s.vx; if (r.solid(Math.floor(s.x / TILE), Math.floor((s.y + 4) / TILE)) || s.y > r.ph) { s.dead = true; this.ev('splash', s.x, s.y); } }
      else {   /* burr, bolt, orb: lobbed, they bounce a few times */
        s.vy = Math.min(s.vy + (s.g || 0.18), 7); s.x += s.vx;
        if (r.solid(Math.floor((s.x + sgn(s.vx) * s.r) / TILE), Math.floor(s.y / TILE))) { s.vx = -s.vx * 0.7; s.x += s.vx * 2; }
        s.y += s.vy;
        if (s.vy > 0 && r.solid(Math.floor(s.x / TILE), Math.floor((s.y + s.r) / TILE))) { s.y = Math.floor((s.y + s.r) / TILE) * TILE - s.r; s.vy = -s.vy * 0.62; s.bn = (s.bn || 0) + 1; this.ev('bonk', s.kind, s.x, s.y); if (s.bn > (s.bounces || 2)) { s.dead = true; this.ev('pop', s.kind, s.x, s.y); } }
        if (s.vy < 0 && r.solid(Math.floor(s.x / TILE), Math.floor((s.y - s.r) / TILE))) s.vy = Math.abs(s.vy) * 0.5;
      }
      if (s.own < 0 && !s.dead) for (const p of this.players) if (p.alive && p.inv <= 0 && !this.ext[p.i] && ov(p.x - 6, p.y - PH.H + 2, 12, PH.H - 2, s.x - s.r + 1, s.y - s.r + 1, s.r * 2 - 2, s.r * 2 - 2)) { if (this.hurt(p, s.x, s.kind) && s.kind !== 'drop') s.dead = true; }
    }
    if (r.shots.some(s => s.dead)) r.shots = r.shots.filter(s => !s.dead);
  }
  stepHazards() {
    const r = this.room;
    for (const h of r.hazards) {
      if (h.tell > 0) { h.tell--; if (h.tell === 0) { h.live = true; this.ev('hazard', h.kind, h.x + h.w / 2, h.y + h.h / 2); } continue; }
      h.t++; if (h.vx) h.x += h.vx; if (h.t >= h.dur) h.dead = true;
      if (h.live) for (const p of this.players) if (p.alive && !this.ext[p.i] && ov(p.x - 6, p.y - PH.H + 3, 12, PH.H - 3, h.x, h.y, h.w, h.h)) this.hurt(p, h.x + h.w / 2, h.kind);
    }
    if (r.hazards.some(h => h.dead)) r.hazards = r.hazards.filter(h => !h.dead);
  }
  stepDrops() {
    const r = this.room, s = this.save, mag = this.st.magnet;
    for (const d of r.drops) {
      d.t++;
      let best = null, bd = 1e9; for (const p of this.players) if (p.alive) { const dd = Math.hypot(p.x - d.x, p.y - 13 - d.y); if (dd < bd) { bd = dd; best = p; } }
      if (best && (bd < mag || d.t > 70)) { const dx = best.x - d.x, dy = best.y - 13 - d.y, l = Math.hypot(dx, dy) || 1, sp = Math.min(9, 2 + d.t * 0.04); d.vx += (dx / l * sp - d.vx) * 0.2; d.vy += (dy / l * sp - d.vy) * 0.2; d.x += d.vx; d.y += d.vy; }
      else {
        d.vy = Math.min(d.vy + 0.25, 6); d.vx *= 0.98; d.x += d.vx;
        if (r.solid(Math.floor(d.x / TILE), Math.floor(d.y / TILE))) { d.x -= d.vx; d.vx = -d.vx * 0.5; }
        d.y += d.vy; if (r.solid(Math.floor(d.x / TILE), Math.floor((d.y + 3) / TILE)) || r.oneway(Math.floor(d.x / TILE), Math.floor((d.y + 3) / TILE)) && d.vy > 0) { d.y = Math.floor((d.y + 3) / TILE) * TILE - 3; d.vy = -d.vy * 0.4; d.vx *= 0.7; }
      }
      if (best && bd < 14) { d.got = true; s.dew += d.v; this.ev('dew', d.v, d.x, d.y); }
    }
    if (r.drops.some(d => d.got)) r.drops = r.drops.filter(d => !d.got);
  }
  stepItems() {
    for (const it of this.room.items) if (it.hurt > 0) it.hurt--;
    for (const b of this.room.breaks) if (b.hurt > 0) b.hurt--;
    for (const fl of this.room.flowers) if (fl.t < 999) fl.t++;
  }
  flipSwitch(sw) {
    sw.on = true; sw.t = 30; this.ev('switch', sw.x, sw.y);
    if (sw.gate) { this.save.open[sw.gate.key] = 1; this.room.updateGates(this.save); this.ev('autosave'); }
  }

  /* ---------------- local co-op: the tether ---------------- */
  coop() {
    const [a, b] = this.players, cam = this.cam;
    if (!a.alive && !b.alive) return;
    this.leader = a.alive || !b.alive ? 0 : 1;
    const L = this.players[this.leader], F = this.players[1 - this.leader];
    if (!F.alive && F.st !== 'bubble') return;
    const out = F.x < cam.x - 10 || F.x > cam.x + C.VW + 10 || F.y < cam.y - 20 || F.y - PH.H > cam.y + C.VH + 10;
    if (out) {
      F.off++;
      if (F.alive && F.off > 20 && F.ground && !F.dashT) { const d = sgn(L.x - F.x); F.x += d * 0.8; }
      if (F.off > 75) { F.x = L.x - 14 * L.face; F.y = L.y; F.vx = L.vx; F.vy = Math.min(0, L.vy); F.inv = Math.max(F.inv, 40); F.off = 0; this.ev('tether', F.i, F.x, F.y); }
    } else F.off = 0;
  }

  /* ---------------- guardians ---------------- */
  guardHurts(g) { return !(g.st === 'tired' || g.st === 'sleep' || g.st === 'wake' || g.st === 'calm' || (g.kind === 'cloud') || (g.kind === 'boiler' && g.st !== 'walk') || (g.kind === 'heart' && g.st !== 'drop')); }
  gs(g, st) { g.st = st; g.t = 0; }
  hitGuard(g, dmg, p) {
    if (g.done || !g.awake || g.st === 'wake' || g.st === 'calm') return;
    g.hp -= dmg; g.hurt = 10; this.ev('ghit', g.kind, g.x, g.y);
    if (g.kind === 'heart') { const ph = g.hp > g.maxHp * 2 / 3 ? 1 : g.hp > g.maxHp / 3 ? 2 : 3; if (ph !== g.phase && g.hp > 0) { g.phase = ph; this.gs(g, 'shed'); this.ev('gphase', g.kind, ph); this.room.hazards = []; } }
    else if (g.phase === 1 && g.hp <= g.maxHp / 2) { g.phase = 2; this.ev('gphase', g.kind, 2); }
    if (g.hp <= 0) this.calmGuard(g);
    void p;
  }
  calmGuard(g) {
    const s = this.save, r = this.room;
    g.hp = 0; g.done = true; this.gs(g, 'calm'); g.calm = 0; s.calm[g.kind] = 1;
    r.hazards = []; r.shots = r.shots.filter(x => x.kind === 'beam');
    for (const f of r.foes) if (f.alive && f.temp) this.bloom(f);
    this.ev('calm', g.kind); this.shake = 10;
    r.updateGates(s); r.recolour(s);
  }
  stepGuard() {
    const g = this.room.guard; if (!g) return;
    g.t++; if (g.hurt > 0) g.hurt--;
    const r = this.room, gentle = this.save.gentle, slow = gentle ? 1.3 : 1, spd = gentle ? 0.8 : 1;
    if (g.st === 'calm') {
      if (g.calm < 1) {
        g.calm = Math.min(1, g.calm + 1 / 200);
        if (g.kind === 'knot' || g.kind === 'boiler') g.y += (g.floor - g.h / 2 - g.y) * 0.1;
        if (g.calm >= 1 && g.kind === 'heart') { this.ending = 1; this.ev('ending'); }
        if (g.t === 140 && g.kind !== 'heart') {
          const ab = { knot: 'dash', boiler: 'grip', cloud: 'puff' }[g.kind];
          if (ab && !this.save.ab[ab]) r.items.push({ kind: 'ability', id: ab, key: r.id + ':A' + ab, x: g.x, y: Math.min(g.y, g.floor - 40), got: false, hp: 0, hurt: 0, rise: 1 });
          /* flowers spring up all over the arena floor */
          for (let k = 0; k < 14; k++) { const x = 40 + this.rand() * (r.pw - 80), tx = Math.floor(x / TILE); let ty = 1; while (ty < r.h - 1 && !r.solid(tx, ty + 1)) ty++; if (ty < r.h - 1) r.flowers.push({ x: Math.round(x), y: (ty + 1) * TILE, kind: k % 7, ceil: false, t: -k * 6, seed: 900 + k, temp: true }); }
        }
      }
      return;
    }
    if (g.done) return;
    const ps = this.players.filter(p => p.alive);
    if (!ps.length) return;
    const tgt = ps.reduce((a, b) => Math.abs(b.x - g.x) < Math.abs(a.x - g.x) ? b : a);
    if (g.st === 'sleep') {
      const inside = ps.find(p => Math.abs(p.x - g.ax) < 360 && p.y > g.ay - 240 && !r.gates.some(gt => gt.kind === 'arena' && Math.abs(p.x - (gt.x + gt.w / 2)) < 90 && Math.abs(p.y - (gt.y + gt.h)) < 120));
      if (inside) { g.awake = true; this.gs(g, 'wake'); r.updateGates(this.save); this.ev('gstart', g.kind); }
      return;
    }
    if (g.st === 'wake') { if (g.t > (g.kind === 'heart' ? 150 : 80)) this.gs(g, 'idle'); return; }
    if (g.kind === 'knot') this.knot(g, tgt, slow, spd);
    else if (g.kind === 'boiler') this.boiler(g, tgt, slow, spd);
    else if (g.kind === 'cloud') this.cloud(g, tgt, slow, spd);
    else if (g.kind === 'heart') this.heart(g, tgt, slow, spd);
  }
  pick(g, opts) {   /* the next move: never the same three times running; every third move it gets tired */
    g.combo++;
    if (g.combo > 3) { g.combo = 0; return 'tired'; }
    let o = opts.filter(x => x !== g.last || this.rand() < 0.25); if (!o.length) o = opts;
    const m = o[Math.floor(this.rand() * o.length)]; g.last = m; return m;
  }
  hazard(kind, x, y, w, h, tell, dur, vx) { this.room.hazards.push({ kind, x, y, w, h, t: 0, tell: Math.round(tell), live: false, dur: Math.round(dur), vx: vx || 0 }); }
  knot(g, p, slow, spd) {
    const r = this.room, ph2 = g.phase > 1, fl = g.floor;
    g.spin += g.vx / 40;
    if (g.st === 'idle') { g.squash *= 0.9; g.vx *= 0.9; g.face = sgn(p.x - g.x) || g.face; if (g.t > (ph2 ? 34 : 54) * slow) { const m = this.pick(g, ph2 ? ['hop', 'lash', 'burr', 'hop'] : ['hop', 'lash', 'hop']); this.gs(g, m === 'tired' ? 'tired' : m + 'Tell'); this.ev('gtell', g.kind, g.st); } }
    else if (g.st === 'hopTell') { g.squash = Math.min(1, g.t / 30); if (g.t > 34 * slow) { const tx = clamp(p.x, 80, r.pw - 80); g.vx = (tx - g.x) / 52; g.vy = -9.6; this.gs(g, 'hop'); this.ev('hop', g.x, g.y); g.squash = 0; } }
    else if (g.st === 'hop') {
      g.vy += 0.37; g.x += g.vx; g.y += g.vy; g.x = clamp(g.x, 40, r.pw - 40);
      if (g.vy > 0 && g.y >= fl - g.h / 2) { g.y = fl - g.h / 2; g.vy = 0; g.vx = 0; this.gs(g, 'land'); this.shake = 8; this.ev('slam', g.x, fl); g.squash = 1;
        if (ph2) for (const d of [-1, 1]) this.hazard('shock', g.x + d * 44 - 9, fl - 14, 18, 14, 0, 60, d * 3 * spd); }
    }
    else if (g.st === 'land') { g.squash *= 0.9; if (g.t > 46 * slow) this.gs(g, 'idle'); }
    else if (g.st === 'lashTell') {
      if (g.t === 1) { const xs = ph2 ? [0, -110, 110, -220, 220] : [0, -120, 120]; for (const dx of xs) { const x = clamp(p.x + dx, 30, r.pw - 30); this.hazard('spike', x - 18, fl - 64, 36, 64, 52 * slow, 28); } }
      g.squash = 0.4 + Math.sin(g.t / 3) * 0.1;
      if (g.t > 52 * slow) this.gs(g, 'lash');
    }
    else if (g.st === 'lash') { if (g.t > 34) this.gs(g, 'idle'); }
    else if (g.st === 'burrTell') { g.squash = 0.6; if (g.t > 32 * slow) { this.gs(g, 'burr'); for (let k = 0; k < 5; k++) { const a = -Math.PI * (0.18 + 0.16 * k); r.shots.push({ kind: 'burr', x: g.x, y: g.y - 20, vx: Math.cos(a) * 3.6 * spd, vy: Math.sin(a) * 4.2 * spd - 1, r: 8, t: 0, life: 200, own: -1, g: 0.17, bounces: 1 }); } this.ev('throw', g.x, g.y); } }
    else if (g.st === 'burr') { g.squash *= 0.9; if (g.t > 40) this.gs(g, 'idle'); }
    else if (g.st === 'tired') { g.squash = 0.7 + Math.sin(g.t / 12) * 0.05; if (g.t > 120 * slow) { this.gs(g, 'idle'); g.squash = 0; } }
    else this.gs(g, 'idle');
  }
  boiler(g, p, slow, spd) {
    const r = this.room, ph2 = g.phase > 1, fl = g.floor;
    g.heat = clamp(1 - g.hp / g.maxHp * 0.7 + (g.st.endsWith('Tell') ? 0.15 : 0), 0, 1);
    g.door += ((g.st === 'tired' ? 1 : 0) - g.door) * 0.1;
    if (g.st === 'idle') { g.face = sgn(p.x - g.x) || g.face; if (g.t > (ph2 ? 30 : 46) * slow) { const m = this.pick(g, ['walk', 'vent', 'bolt', 'slam']); this.gs(g, m === 'tired' ? 'tired' : m === 'walk' ? 'walk' : m + 'Tell'); if (m !== 'walk' && m !== 'tired') this.ev('gtell', g.kind, g.st); } }
    else if (g.st === 'walk') {
      const dir = sgn(p.x - g.x) || g.face; g.face = dir; g.x += dir * (ph2 ? 1.2 : 0.85) * spd; g.x = clamp(g.x, g.w / 2 + 30, r.pw - g.w / 2 - 30);
      if (g.t % 30 === 0) this.ev('stomp', g.x, fl);
      if (g.t > (ph2 ? 110 : 140)) this.gs(g, 'idle');
    }
    else if (g.st === 'ventTell') {
      if (g.t === 1) { const xs = []; const n = ph2 ? 4 : 3; let x0 = clamp(p.x, 40, r.pw - 40); for (let k = 0; k < n; k++) { const x = clamp(x0 + (k - (n - 1) / 2) * 150, 30, r.pw - 30); if (Math.abs(x - g.x) > g.w / 2) xs.push(x); } for (const x of xs) this.hazard('steam', x - 16, 20, 32, fl - 20, 46 * slow, 52); }
      if (g.t > 46 * slow) { this.gs(g, 'vent'); this.ev('vent', g.x, g.y); }
    }
    else if (g.st === 'vent') { if (g.t > 54) this.gs(g, 'idle'); }
    else if (g.st === 'boltTell') { if (g.t > 32 * slow) { this.gs(g, 'bolt'); const n = ph2 ? 5 : 3; for (let k = 0; k < n; k++) { const tx = p.x + (k - (n - 1) / 2) * 70, t = 70; r.shots.push({ kind: 'bolt', x: g.x, y: g.y - g.h / 2, vx: (tx - g.x) / t * spd, vy: -7 * spd, r: 7, t: 0, life: 260, own: -1, g: 0.2 * spd * spd, bounces: 2 }); } this.ev('throw', g.x, g.y); } }
    else if (g.st === 'bolt') { if (g.t > 40) this.gs(g, 'idle'); }
    else if (g.st === 'slamTell') { if (g.t === 1) { g.tx = clamp(p.x, 40, r.pw - 40); this.hazard('slam', g.tx - 30, 0, 60, fl, 48 * slow, 18); } if (g.t > 48 * slow) { this.gs(g, 'slam'); this.shake = 9; this.ev('slam', g.tx, fl); } }
    else if (g.st === 'slam') { if (g.t > 36) this.gs(g, 'idle'); }
    else if (g.st === 'tired') { if (g.t === 1) this.ev('vent', g.x, g.y); if (g.t > 130 * slow) this.gs(g, 'idle'); }
    else this.gs(g, 'idle');
  }
  cloud(g, p, slow, spd) {
    const r = this.room, ph2 = g.phase > 1, fl = g.floor, hiY = g.ay, loY = fl - 100;
    g.dark += ((g.st.endsWith('Tell') || g.st === 'rain' || g.st === 'zap' ? 1 : 0.3) - g.dark) * 0.05;
    const drift = (sp) => { const tx = clamp(p.x, g.w / 2 + 20, r.pw - g.w / 2 - 20); g.x += clamp(tx - g.x, -sp, sp); };
    if (g.st !== 'tired') g.y += (hiY + Math.sin(g.t / 40) * 8 - g.y) * 0.04;
    if (g.st === 'idle') { drift(1.3 * spd); if (g.t > (ph2 ? 40 : 60) * slow) { const m = this.pick(g, ['rain', 'zap', 'gust']); this.gs(g, m === 'tired' ? 'tired' : m + 'Tell'); if (m !== 'tired') this.ev('gtell', g.kind, g.st); } }
    else if (g.st === 'rainTell') { drift(0.6); if (g.t > 42 * slow) this.gs(g, 'rain'); }
    else if (g.st === 'rain') { drift((ph2 ? 0.9 : 0.6) * spd); if (g.t % 6 === 0) r.shots.push({ kind: 'drop', x: g.x + (this.rand() - 0.5) * (g.w - 30), y: g.y + g.h / 2 - 4, vx: g.dir * 0, vy: 3.4 * spd, r: 4, t: 0, life: 200, own: -1 }); if (g.t % 30 === 1) this.ev('rain', g.x, g.y); if (g.t > 130) this.gs(g, 'idle'); }
    else if (g.st === 'zapTell') { if (g.t === 1) { const xs = ph2 ? [0, -150, 150, -300, 300] : [0, -170, 170]; for (const dx of xs) { const x = clamp(p.x + dx, 30, r.pw - 30); this.hazard('zap', x - 15, g.y + g.h / 2, 30, fl - g.y - g.h / 2, 56 * slow, 20); } } if (g.t > 56 * slow) { this.gs(g, 'zap'); this.ev('zap', g.x, g.y); } }
    else if (g.st === 'zap') { if (g.t > 30) this.gs(g, 'idle'); }
    else if (g.st === 'gustTell') { if (g.t === 1) g.dir = sgn(p.x - g.x) || 1; if (g.t > 40 * slow) { this.gs(g, 'gust'); r.wind.push({ x: 0, y: 0, w: r.pw, h: r.ph, dx: g.dir * 1.5 * spd, dy: 0, gust: 0, on: 1, temp: 1 }); this.ev('wind', g.x, g.y); } }
    else if (g.st === 'gust') { if (ph2 && g.t % 7 === 0) r.shots.push({ kind: 'drop', x: g.x + (this.rand() - 0.5) * (g.w - 30), y: g.y + g.h / 2 - 4, vx: g.dir * 1.2, vy: 3.2 * spd, r: 4, t: 0, life: 200, own: -1 }); if (g.t > 100) { r.wind = r.wind.filter(w => !w.temp); this.gs(g, 'idle'); } }
    else if (g.st === 'tired') { g.y += (loY - g.y) * 0.05; if (g.t > 150 * slow) this.gs(g, 'idle'); }
    else this.gs(g, 'idle');
  }
  heart(g, p, slow, spd) {
    const r = this.room, ph = g.phase, fl = g.floor, hiY = g.ay, loY = fl - 130;
    g.glow = 1 - g.hp / g.maxHp;
    if (g.st !== 'tired' && g.st !== 'drop') { g.y += (hiY + Math.sin(g.t / 50) * 10 - g.y) * 0.04; g.x += (g.ax + Math.sin(this.t / 160) * 140 * (ph > 1 ? 1 : 0.5) - g.x) * 0.02; }
    const k = ph === 3 ? 0.75 : ph === 2 ? 0.88 : 1;
    if (g.st === 'shed') { if (g.t === 1) this.shake = 12; if (g.t > 90) this.gs(g, 'idle'); }
    else if (g.st === 'idle') { if (g.t > 50 * k * slow) { const m = this.pick(g, ph === 1 ? ['sweep', 'orb', 'sweep'] : ph === 2 ? ['sweep', 'orb', 'summon', 'sweep'] : ['sweep', 'orb', 'summon', 'drop']); this.gs(g, m === 'tired' ? 'tired' : m === 'summon' ? 'summon' : m + 'Tell'); if (m !== 'tired' && m !== 'summon') this.ev('gtell', g.kind, g.st); } }
    else if (g.st === 'sweepTell') {
      if (g.t === 1) { g.dir = this.rand() < 0.5 ? -1 : 1; g.high = ph > 1 && this.rand() < 0.4; const y = g.high ? fl - 92 : fl - 26, x = g.dir > 0 ? -60 : r.pw; this.hazard('vine', x, y, 60, g.high ? 40 : 26, 50 * slow, 120, g.dir * 4.4 * spd * (ph === 3 ? 1.15 : 1)); }
      if (g.t > 50 * slow) this.gs(g, 'sweep');
    }
    else if (g.st === 'sweep') { if (g.t > 60 * k) this.gs(g, 'idle'); }
    else if (g.st === 'orbTell') { if (g.t > 40 * slow) { this.gs(g, 'orb'); const n = ph === 1 ? 3 : 4; for (let i = 0; i < n; i++) r.shots.push({ kind: 'orb', x: g.x + (i - (n - 1) / 2) * 30, y: g.y + 40, vx: (i - (n - 1) / 2) * 1.6 * spd + sgn(p.x - g.x) * 0.6, vy: -1.5, r: 10, t: 0, life: 360, own: -1, g: 0.13, bounces: 3 }); this.ev('throw', g.x, g.y); } }
    else if (g.st === 'orb') { if (g.t > 50) this.gs(g, 'idle'); }
    else if (g.st === 'summon') { if (g.t === 30) { const alive = r.foes.filter(f => f.alive && f.temp).length; for (let i = 0; i < Math.min(2, 4 - alive); i++) { const F = FOE.smog; r.foes.push({ id: 1000 + this.t + i, kind: 'smog', x: g.x + (i ? 70 : -70), y: g.y + 50, vx: 0, vy: 0, face: 1, hp: 1, maxHp: 1, st: 'drift', t: 0, hurt: 0, ceil: false, alive: true, w: F.w, h: F.h, hx: g.x + (i ? 120 : -120), hy: g.y + 120, temp: true }); } this.ev('summon', g.x, g.y); } if (g.t > 60) this.gs(g, 'idle'); }
    else if (g.st === 'dropTell') { if (g.t === 1) { g.tx = clamp(p.x, 100, r.pw - 100); this.hazard('slam', g.tx - 56, g.y, 112, fl - g.y, 50 * slow, 16); } g.x += (g.tx - g.x) * 0.06; if (g.t > 50 * slow) { this.gs(g, 'drop'); g.vy = 2; } }
    else if (g.st === 'drop') { g.vy += 0.5; g.y += g.vy; if (g.y >= fl - g.h / 2) { g.y = fl - g.h / 2; this.shake = 12; this.ev('slam', g.x, fl); for (const d of [-1, 1]) this.hazard('shock', g.x + d * 60 - 9, fl - 14, 18, 14, 0, 70, d * 3.2 * spd); this.gs(g, 'tired'); g.combo = 0; } }
    else if (g.st === 'tired') { g.y += (Math.max(loY, g.y) - g.y) * 0.05; if (g.y < loY) g.y += (loY - g.y) * 0.05; if (g.t > 160 * slow) this.gs(g, 'idle'); }
    else this.gs(g, 'idle');
  }

  /* ---------------- the Peddler and charms (called from main) ---------------- */
  shopList() {
    const s = this.save, W = this.W;
    return W.shop.filter(it => !it.after || s.ab[it.after]).map(it => ({ id: it.id, name: it.name, desc: it.desc, price: it.price, kind: it.kind, sold: !!s.shop[it.id] }));
  }
  buy(id) {
    const s = this.save, it = this.W.shop.find(x => x.id === id);
    if (!it || s.shop[id]) return 'sold'; if (s.dew < it.price) return 'poor';
    s.dew -= it.price; s.shop[id] = 1;
    if (it.kind === 'map') s.maps[it.area] = 1;
    else if (it.kind === 'charm') s.charms[it.charm] = 1;
    else if (it.kind === 'notch') s.notches++;
    else if (it.kind === 'leaf') { s.leafSlots++; this.applyStats(); for (const p of this.players) p.leaves = p.maxLeaves; }
    this.ev('buy', id); this.ev('autosave');
    return 'ok';
  }
  wear(id, on) {
    const s = this.save, c = this.W.charms[id]; if (!c || !s.charms[id]) return false;
    const i = s.worn.indexOf(id);
    if (on && i < 0) { if (notchesUsed(s) + c.cost > s.notches) return false; s.worn.push(id); }
    else if (!on && i >= 0) s.worn.splice(i, 1);
    this.applyStats(); return true;
  }
  /* how much of the garden is back: glooms bloomed, buds opened, guardians calmed, things found */
  pct() {
    const s = this.save; let got = 0, tot = 0;
    for (const def of this.W.list) {
      let foes = 0, buds = 0; for (const row of def.map) for (const ch of row) { if (FOE_LETTER[ch]) foes++; else if (ch === 'b') buds++; }
      tot += foes + buds; got += (s.bloom[def.id] || []).length + (s.buds[def.id] || []).length;
    }
    const extra = (s.calm.knot + s.calm.boiler + s.calm.cloud + s.calm.heart) * 25 + s.life * 5 + s.vessels * 5 + Object.keys(s.charms).length * 4;
    return Math.min(100, Math.round(((tot ? got / tot : 0) * 60 + extra / (100 + 30 + 15 + 48) * 40)));
  }
}
Sim.newSave = newSave; Sim.fixSave = fixSave; Sim.stats = stats; Sim.notchesUsed = notchesUsed; Sim.Room = Room; Sim.PH = PH;
RL.Sim = Sim;
})();
