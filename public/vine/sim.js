/* VINE LINE — sim.js (RULES). VL.Sim: the classic grow-and-don't-bump rules on a 24x24 garden plot, pure logic with no
   DOM, so node can run it. A Match is one game: 1 player (play until you crash) or 2 players (rounds, first to 3 wins).
   Time: tick() runs at a fixed 60 Hz; the vines take a step whenever the accumulator (+rate per tick) passes 60, so
   rate = steps per second (7 at the start, +1 every 5 berries of the longest-fed vine, 14 at most).
   Cells are y*24+x; directions 0 up, 1 right, 2 down, 3 left (so a reverse is d^2).
   Phases (ph): 0 countdown, 1 play, 2 round over (2 players, next round after a pause), 3 match / game over.
   Events (m.ev, the engine empties it): ['go'], ['eat', i, cell, kind 1|2], ['gold', cell], ['goldGone', cell],
   ['die', i, cell], ['round', winner -1 draw|0|1]. Also VL.Sim.botDir: a simple autopilot (tests, ?bot=1). */
'use strict';
(function () {
const VL = (typeof window !== 'undefined' ? window : globalThis).VL = (typeof window !== 'undefined' ? window : globalThis).VL || {};
const N = 24, NN = N * N, TPS = 60;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const C = VL.C = {
  N, NN, TPS, PROTO: 1, START_LEN: 3, RATE0: 7, RATE_MAX: 14, PER: 5, PTS: 10, GPTS: 50, GLEN: 3,
  GOLD_T: 360, GOLD_P: 0.14, GOLD_MIN: 3, COUNT2: 180, COUNT1: 75, OVER_T: 170, WINS: 3, QMAX: 2
};
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const cx = c => c % N, cy = c => (c / N) | 0;
const near = (a, b) => Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b)) === 1;
function dirOf(from, to) { const dx = cx(to) - cx(from), dy = cy(to) - cy(from); return dy < 0 ? 0 : dx > 0 ? 1 : dy > 0 ? 2 : 3; }

function mkVine(x, y, d, n) {
  const b = []; for (let i = 0; i < n; i++) b.push((y - DY[d] * i) * N + (x - DX[d] * i));
  return { body: b, prev: b.slice(), dir: d, q: [], dead: false, grow: 0, eaten: 0, deadAt: -1, ateAt: -99 };
}

class Match {
  constructor(o) {
    o = o || {};
    this.two = !!o.two; this.seed = (o.seed >>> 0) || ((Math.random() * 4294967296) >>> 0); this.rng = mulberry32(this.seed);
    this.wins = [0, 0]; this.score = [0, 0]; this.round = 0; this.ai = [false, false]; this.ev = []; this.t = 0;
    this.newRound();
  }
  newRound() {
    this.round++; this.ph = 0; this.cd = this.two ? C.COUNT2 : C.COUNT1; this.acc = 0; this.steps = 0; this.winner = -2; this.overT = 0;
    this.vines = this.two ? [mkVine(6, 7, 1, C.START_LEN), mkVine(17, 16, 3, C.START_LEN)] : [mkVine(8, 12, 1, C.START_LEN)];
    this.berries = this.two ? [7 * N + 12, 16 * N + 11] : [12 * N + 15]; this.gold = -1; this.goldT = 0; this.goldAt = -1;
  }
  get want() { return this.two ? 2 : 1; }
  rate() { let e = 0; for (const v of this.vines) if (v.eaten > e) e = v.eaten; return Math.min(C.RATE_MAX, C.RATE0 + Math.floor(e / C.PER)); }
  /* a turn: a 180 (or the same way) is ignored; up to QMAX turns wait for the next steps */
  turn(i, d) {
    const v = this.vines[i]; if (!v || v.dead || !Number.isInteger(d) || d < 0 || d > 3 || this.ph > 1) return false;
    const last = v.q.length ? v.q[v.q.length - 1] : v.dir;
    if (d === last || d === (last ^ 2) || v.q.length >= C.QMAX) return false;
    v.q.push(d); return true;
  }
  tick() {
    this.t++;
    if (this.ph === 0) { if (--this.cd <= 0) { this.cd = 0; this.ph = 1; this.ev.push(['go']); } return; }
    if (this.ph === 1) {
      if (this.gold >= 0 && --this.goldT <= 0) { this.ev.push(['goldGone', this.gold]); this.gold = -1; this.goldT = 0; }
      this.acc += this.rate();
      while (this.acc >= TPS && this.ph === 1) { this.acc -= TPS; this.step(); }
      return;
    }
    if (this.ph === 2 && --this.overT <= 0) this.newRound();
  }
  occ() {
    const o = new Uint8Array(NN);
    for (const v of this.vines) for (const c of v.body) o[c] = 1;
    for (const b of this.berries) o[b] = 2; if (this.gold >= 0) o[this.gold] = 2;
    return o;
  }
  spawn(occ) {
    let n = 0; for (let c = 0; c < NN; c++) if (!occ[c]) n++;
    if (!n) return -1;
    let k = Math.floor(this.rng() * n);
    for (let c = 0; c < NN; c++) if (!occ[c] && k-- === 0) { occ[c] = 2; return c; }
    return -1;
  }
  step() {
    this.steps++;
    const vs = this.vines, n = vs.length, nh = [], kind = [], grow = [];
    for (let i = 0; i < n; i++) {
      const v = vs[i]; v.prev = v.body.slice();
      if (v.dead) { nh[i] = -1; continue; }
      if (this.ai[i]) { const d = botDir(this, i); v.q.length = 0; if (d !== (v.dir ^ 2)) v.dir = d; }
      else if (v.q.length) v.dir = v.q.shift();
      const x = cx(v.body[0]) + DX[v.dir], y = cy(v.body[0]) + DY[v.dir];
      nh[i] = x < 0 || y < 0 || x >= N || y >= N ? -1 : y * N + x;
    }
    for (let i = 0; i < n; i++) {
      kind[i] = nh[i] < 0 ? 0 : nh[i] === this.gold ? 2 : this.berries.indexOf(nh[i]) >= 0 ? 1 : 0;
      grow[i] = vs[i].grow + (kind[i] === 2 ? C.GLEN : kind[i] === 1 ? 1 : 0);
    }
    const dead = vs.map((v, i) => !v.dead && nh[i] < 0);
    const live = i => !vs[i].dead && !dead[i];
    const moved = i => { const b = vs[i].body; return [nh[i]].concat(grow[i] > 0 ? b : b.slice(0, -1)); };
    for (let i = 0; i < n; i++) if (live(i) && moved(i).indexOf(nh[i], 1) > 0) dead[i] = true;   /* own vine */
    if (n === 2) {
      if (live(0) && live(1) && nh[0] === nh[1]) dead[0] = dead[1] = true;   /* head-on: both */
      for (let it = 0, ch = true; ch && it < 4; it++) {   /* the other vine, as it ends up (a crashed vine stays where it was) */
        ch = false;
        for (let i = 0; i < 2; i++) { if (!live(i)) continue; const j = 1 - i, ob = live(j) ? moved(j) : vs[j].body; if (ob.indexOf(nh[i]) >= 0) { dead[i] = true; ch = true; } }
      }
    }
    let fed = false;
    for (let i = 0; i < n; i++) {
      const v = vs[i]; if (v.dead) continue;
      if (dead[i]) { v.dead = true; v.deadAt = this.t; v.q.length = 0; v.prev = v.body.slice(); this.ev.push(['die', i, v.body[0]]); continue; }
      if (kind[i] === 1) { this.berries.splice(this.berries.indexOf(nh[i]), 1); this.score[i] += C.PTS; fed = true; }
      else if (kind[i] === 2) { this.gold = -1; this.goldT = 0; this.score[i] += C.GPTS; }
      if (kind[i]) { v.eaten++; v.ateAt = this.t; this.ev.push(['eat', i, nh[i], kind[i]]); }
      v.grow = grow[i]; v.body.unshift(nh[i]); if (v.grow > 0) v.grow--; else v.body.pop();
    }
    const occ = this.occ();
    while (this.berries.length < this.want) { const c = this.spawn(occ); if (c < 0) break; this.berries.push(c); }
    let all = 0; for (const v of vs) all += v.eaten;
    if (fed && this.gold < 0 && all >= C.GOLD_MIN && this.rng() < C.GOLD_P) {
      const c = this.spawn(occ); if (c >= 0) { this.gold = c; this.goldT = C.GOLD_T; this.goldAt = this.t; this.ev.push(['gold', c]); }
    }
    if (!this.two) { if (vs[0].dead) { this.ph = 3; this.winner = -1; } return; }
    if (vs[0].dead || vs[1].dead) {
      const w = vs[0].dead && vs[1].dead ? -1 : vs[0].dead ? 1 : 0;
      this.winner = w; if (w >= 0) this.wins[w]++;
      this.ph = this.wins[0] >= C.WINS || this.wins[1] >= C.WINS ? 3 : 2; this.overT = C.OVER_T;
      this.ev.push(['round', w]);
    }
  }
}

/* ---------- autopilot: the safe turn (room to live in) that gets nearest a berry; wary of the other head ---------- */
function flood(occ, from, cap) {
  const seen = new Uint8Array(NN), q = [from]; seen[from] = 1; let n = 0;
  while (q.length && n < cap) {
    const c = q.pop(); n++;
    const x = cx(c), y = cy(c);
    for (let d = 0; d < 4; d++) { const X = x + DX[d], Y = y + DY[d]; if (X < 0 || Y < 0 || X >= N || Y >= N) continue; const k = Y * N + X; if (!seen[k] && !occ[k]) { seen[k] = 1; q.push(k); } }
  }
  return n;
}
function dist(occ, from, tg) {
  if (!tg.length) return -1;
  const D = new Int16Array(NN).fill(-1), q = [from]; D[from] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h]; if (tg.indexOf(c) >= 0) return D[c];
    const x = cx(c), y = cy(c);
    for (let d = 0; d < 4; d++) { const X = x + DX[d], Y = y + DY[d]; if (X < 0 || Y < 0 || X >= N || Y >= N) continue; const k = Y * N + X; if (D[k] < 0 && !occ[k]) { D[k] = D[c] + 1; q.push(k); } }
  }
  return -1;
}
/* m: a Match or any view shaped like one ({vines:[{body, dir, dead, grow}], berries, gold}) */
function botDir(m, i) {
  const vs = m.vines, v = vs[i], h = v.body[0], occ = new Uint8Array(NN);
  for (const u of vs) for (const c of u.body) occ[c] = 1;
  if (!v.grow && v.body.length > 1) occ[v.body[v.body.length - 1]] = 0;
  const o = vs[1 - i], risky = new Uint8Array(NN);
  if (o && !o.dead) for (let d = 0; d < 4; d++) { const X = cx(o.body[0]) + DX[d], Y = cy(o.body[0]) + DY[d]; if (X >= 0 && Y >= 0 && X < N && Y < N) risky[Y * N + X] = 1; }
  let tg = (m.berries || []).slice(); if (m.gold >= 0) tg.push(m.gold);
  if (o && !o.dead && tg.length > 1) {   /* leave the other vine the berries it is nearer to (a tie goes to Sprig) */
    const md = (a, b) => Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b)), mine = tg.filter(c => { const a = md(h, c), b = md(o.body[0], c); return a < b || (a === b && i === 0); });
    if (mine.length) tg = mine;
  }
  let best = v.dir, bs = -1e9;
  for (let d = 0; d < 4; d++) {
    if (d === (v.dir ^ 2)) continue;
    const X = cx(h) + DX[d], Y = cy(h) + DY[d]; if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
    const c = Y * N + X; if (occ[c]) continue;
    occ[c] = 1; const need = v.body.length + 3, room = flood(occ, c, need * 2), far = dist(occ, c, tg); occ[c] = 0;
    let s = room < need ? -1000 + room : 0;
    if (risky[c]) s -= 12;
    s -= far >= 0 ? far : 40; if (d === v.dir) s += .5;
    s += (((Math.imul((m.t | 0) * 4 + d + i * 7919, 2654435761) >>> 0) % 100) / 100) * .9;   /* a little wobble breaks loops */
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

VL.Sim = { Match, botDir, mulberry32, DX, DY, cx, cy, near, dirOf, N, NN };
})();
