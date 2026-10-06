/* BEET BEAT — sim.js (SIM). Pure state, no drawing, no clocks: physics, collisions, checkpoints, progress, and the solver.
   new BEAT.Sim(level, {players:1|2, practice:bool, kind2p:bool}); sim.step(inputs) once per 1/240 s (inputs[i] = button held).
   sim.players[i] = {x, y, vy, mode, grav, speed, rot, alive, deadT, pct, att, cp, seedsGot, ...}; sim.events = [[name, player, arg]]
   (the caller empties it): 'jump' 'land' 'pad' 'ring' 'crash'(pct) 'restart' 'respawn' 'cp' 'finish'(run time in steps) 'seed'(k).
   Rules. Normal mode: a crash restarts the run from 0 % after 0.6 s (attempt + 1). Practice and kind 2-player mode: a crash puts
   you back at your last checkpoint after 1 s (practice 0.6 s). Automatic checkpoints (kind2p, practice auto): a level with designed
   presses gets SAFE SPOTS (spots(): the designed on-beat run, standing on solid ground with no press due for 0.45 s, about every
   5 s); passing one makes it your checkpoint, and you always come back in that safe state. A level without presses falls back to
   your own run: a moment on solid ground every ~6 s, kept once you have gone 0.5 s without pressing. Practice: sim.dropCp(i).
   Deterministic: the same inputs on the same steps always give the same run (plain arithmetic, no randomness, no clocks).
   BEAT.Sim.solve(level, opts) -> {ok, path (press steps), minWindowMs, windows, failAt}: a depth-first search over press
   moments (on the ground or inside a puff ring), memoised, used by the designers' check, the tests and the bot (main.js).
   HOP mode only in this milestone; mode/grav/speed are in the state for GLIDE / FLIP / portals later (levels.js lists them). */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, BEAT = G.BEAT = G.BEAT || {};
const SPEEDS = BEAT.SPEEDS || [8.4, 10.4, 12.9, 15.6], JUMP = BEAT.JUMP || { h: 2.1, t: 0.44 };
const HZ = 240, DT = 1 / HZ;
const GRAV = 8 * JUMP.h / (JUMP.t * JUMP.t), V0 = 4 * JUMP.h / JUMP.t;
const vFor = h => Math.sqrt(2 * GRAV * h);
const C = BEAT.C = {
  HZ, DT, GRAV, V0, MAXFALL: 26, ROT: (Math.PI / 2) / JUMP.t,
  PAD: { capY: vFor(3.2), capP: vFor(5.2) }, RING: { ringY: V0, ringP: vFor(3.4) },
  RESTART: Math.round(0.6 * HZ), RESPAWN: HZ, RESPAWN_PRACTICE: Math.round(0.6 * HZ),
  CP_EVERY: 6, CP_CLEAR: Math.round(0.5 * HZ), BUF: Math.round(0.1 * HZ), SPOT_EVERY: 5, SPOT_GAP: Math.round(0.45 * HZ),
  LB: { hw: 0.3, y0: 0.2, y1: 0.8 },           /* the runner's lethal box: 0.6 of its 1 x 1 size (also used for solid sides) */
  SNAP: 0.3,                                    /* falling onto a top: a bottom this far below it still lands */
  THORN: { hw: 0.12, h: 0.55, hs: 0.3 },        /* thorn hurt boxes: 0.24 wide, 0.55 tall (small 0.3); the art is 1 x 1 */
  RING_R: 0.75, PROTO: 1
};
const SOLID = { crate: 1, planter: 1, slab: 1 };

/* ---------- a level, compiled once: object records and a per-block index ---------- */
function compile(level) {
  if (level._c) return level._c;
  const O = [];
  (level.objects || []).forEach((r, i) => {
    const t = r[0], x = +r[1], y = +r[2] || 0, a = r[3], b = r[4];
    const o = { i, t, x, y, w: 1, h: 1, k: '' };
    if (SOLID[t]) { o.k = 's'; o.w = +a || 1; o.h = t === 'slab' ? 0.5 : +b || 1; }
    else if (t === 'thorn' || t === 'thornS') { o.k = 't'; o.down = a === 1; o.hh = t === 'thorn' ? C.THORN.h : C.THORN.hs; }
    else if (t === 'capY' || t === 'capP') { o.k = 'p'; o.v = C.PAD[t]; o.h = 0.4; }
    else if (t === 'ringY' || t === 'ringP') { o.k = 'r'; o.v = C.RING[t]; }
    else return;   /* reserved or unknown: ignored by this sim */
    O.push(o);
  });
  const len = +level.len || 100, NB = Math.ceil(len) + 8, idx = [];
  for (let k = 0; k < NB; k++) idx.push([]);
  for (const o of O) { const a = Math.max(0, Math.floor(o.x - 1.5)), b = Math.min(NB - 1, Math.floor(o.x + o.w + 1.5)); for (let k = a; k <= b; k++) idx[k].push(o); }
  const seeds = (level.seeds || []).map((s, k) => ({ k, x: +s[0], y: +s[1] }));
  level._c = { level, O, idx, NB, len, seeds, speed0: level.startSpeed == null ? 1 : level.startSpeed | 0, spots: null };
  level._c.spots = spots(level._c);
  return level._c;
}
/* the safe checkpoint spots: the designed on-beat run (levels.js presses) standing on solid ground with no press due for SPOT_GAP
   steps, at least SPOT_EVERY seconds apart. null when the level has no presses or its on-beat run does not finish */
function spots(L) {
  const lv = L.level; if (!lv.presses || !lv.presses.length) return null;
  const spb = 60 / (lv.bpm || 120), N = lv.presses.map(b => Math.round(b * spb * HZ)).sort((a, b) => a - b), set = new Set(N);
  const p = newPlayer(L, 0), out = [], maxN = Math.ceil(L.len / SPEEDS[0] * HZ) + HZ * 4; let n = 0, k = 0, lastX = -1e9;
  while (n < maxN && p.alive && !p.fin) {
    while (k < N.length && N[k] < n) k++;
    const gap = k < N.length ? N[k] - n : 1e9;
    if (p.ground && n > 0 && gap >= C.SPOT_GAP && p.x - lastX >= C.SPOT_EVERY * SPEEDS[p.speed]) { const s = snap(p); s.k = out.length; out.push(s); lastX = p.x; }
    const pr = set.has(n); stepP(L, p, pr, pr, null, 0); n++;
  }
  return p.fin ? out : null;
}
const near = (L, x) => { const k = Math.floor(x); return k >= 0 && k < L.NB ? L.idx[k] : EMPTY; };
const EMPTY = [];

/* ---------- the runner ---------- */
function newPlayer(L, i) {
  return { i, x: 0, y: 0, vy: 0, mode: 'hop', grav: 1, speed: L.speed0, rot: 0, ground: true, alive: true, deadT: 0, fin: false, finT: 0,
    pct: 0, best: 0, att: 1, crashes: 0, rt: 0, cp: null, cpX: 0, cand: null, candT: 0, jumpT: -1e9, buf: 99, lastPad: -1, lastRing: -1, seedsGot: 0, spotK: 0 };
}
function startState(L, p) {
  p.x = 0; p.y = 0; p.vy = 0; p.mode = 'hop'; p.grav = 1; p.speed = L.speed0; p.rot = 0; p.ground = true; p.alive = true; p.deadT = 0;
  p.fin = false; p.finT = 0; p.pct = 0; p.rt = 0; p.cp = null; p.cpX = 0; p.cand = null; p.jumpT = -1e9; p.buf = 99; p.lastPad = -1; p.lastRing = -1; p.spotK = 0;
}
const snap = p => ({ x: p.x, y: p.y, mode: p.mode, grav: p.grav, speed: p.speed, rot: Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2) });
function restore(p, s) { p.x = s.x; p.y = s.y; p.vy = 0; p.mode = s.mode; p.grav = s.grav; p.speed = s.speed; p.rot = s.rot; p.ground = true; p.alive = true; p.deadT = 0; p.buf = 99; p.lastPad = -1; p.lastRing = -1; p.cand = null; p.jumpT = -1e9; }
const clone = p => Object.assign({}, p);

/* one step of one runner (shared by the Sim and the solver). ev: an events array or null */
function stepP(L, p, held, edge, ev, i) {
  if (!p.alive) return;
  p.rt++;
  const v = SPEEDS[p.speed];
  if (p.fin) { p.finT++; p.x += v * DT; p.vy -= GRAV * DT; p.y = Math.max(p.ground ? p.y : 0, p.y + p.vy * DT); if (p.y <= 0) { p.y = 0; p.vy = 0; } return; }
  if (edge) p.buf = 0; else if (p.buf < 99) p.buf++;
  if (p.ground && held) { p.vy = V0; p.ground = false; p.buf = 99; p.jumpT = p.rt; if (ev) ev.push(['jump', i, 0]); }
  p.vy -= GRAV * DT; if (p.vy < -C.MAXFALL) p.vy = -C.MAXFALL;
  p.x += v * DT; p.y += p.vy * DT;
  const was = p.ground; p.ground = false;
  if (p.y <= 0) { p.y = 0; if (p.vy <= 0) { p.vy = 0; p.ground = true; } }
  const list = near(L, p.x), px = p.x, LB = C.LB;
  for (let j = 0; j < list.length; j++) {
    const o = list[j];
    if (o.k === 's') {
      if (o.x >= px + 0.5 || o.x + o.w <= px - 0.5 || o.y >= p.y + 1 || o.y + o.h <= p.y) continue;
      const top = o.y + o.h;
      if (p.vy <= 0 && p.y >= top - C.SNAP) { p.y = top; p.vy = 0; p.ground = true; continue; }
      if (o.x < px + LB.hw && o.x + o.w > px - LB.hw && o.y < p.y + LB.y1 && top > p.y + LB.y0) { crash(p, ev, i); return; }
    } else if (o.k === 't') {
      const cx = o.x + 0.5, y0 = o.down ? o.y + 1 - o.hh : o.y, y1 = y0 + o.hh;
      if (cx - C.THORN.hw < px + LB.hw && cx + C.THORN.hw > px - LB.hw && y0 < p.y + LB.y1 && y1 > p.y + LB.y0) { crash(p, ev, i); return; }
    } else if (o.k === 'p') {
      if (p.lastPad === o.i || o.x + 0.1 >= px + 0.5 || o.x + 0.9 <= px - 0.5 || o.y >= p.y + 1 || o.y + o.h <= p.y) continue;
      p.vy = o.v; p.ground = false; p.lastPad = o.i; if (ev) ev.push(['pad', i, o.i]);
    } else if (o.k === 'r') {
      if (p.buf > C.BUF || p.lastRing === o.i) continue;
      const cx = o.x + 0.5, cy = o.y + 0.5, dx = Math.max(Math.abs(cx - px) - 0.5, 0), dy = Math.max(Math.abs(cy - (p.y + 0.5)) - 0.5, 0);
      if (dx * dx + dy * dy > C.RING_R * C.RING_R) continue;
      p.vy = o.v; p.ground = false; p.buf = 99; p.lastRing = o.i; if (ev) ev.push(['ring', i, o.i]);
    }
  }
  if (p.ground) { if (!was) { p.rot = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2); if (ev) ev.push(['land', i, 0]); } }
  else p.rot += C.ROT * DT;
  for (const s of L.seeds) if (!(p.seedsGot >> s.k & 1) && Math.abs(s.x - px) < 0.8 && Math.abs(s.y - (p.y + 0.5)) < 0.8) { p.seedsGot |= 1 << s.k; if (ev) ev.push(['seed', i, s.k]); }
  p.pct = Math.min(100, Math.max(0, px / L.len * 100));
  if (p.pct > p.best) p.best = p.pct;
  if (px >= L.len) { p.fin = true; p.pct = 100; p.best = 100; if (ev) ev.push(['finish', i, p.rt]); }
}
function crash(p, ev, i) { p.alive = false; p.deadT = 0; p.crashes++; p.vy = 0; if (ev) ev.push(['crash', i, Math.round(p.pct * 10)]); }
/* is this a moment where pressing would change anything? (on the ground, or inside an unused puff ring) */
function decision(L, p) {
  if (!p.alive || p.fin) return false;
  if (p.ground) return true;
  const list = near(L, p.x);
  for (let j = 0; j < list.length; j++) {
    const o = list[j]; if (o.k !== 'r' || p.lastRing === o.i) continue;
    const dx = Math.max(Math.abs(o.x + 0.5 - p.x) - 0.5, 0), dy = Math.max(Math.abs(o.y + 0.5 - (p.y + 0.5)) - 0.5, 0);
    if (dx * dx + dy * dy <= C.RING_R * C.RING_R) return true;
  }
  return false;
}

/* ---------- the Sim ---------- */
class Sim {
  constructor(level, o) {
    o = o || {};
    this.level = level; this.L = compile(level);
    this.n = o.players === 2 ? 2 : 1; this.practice = !!o.practice; this.kind2p = !!o.kind2p; this.autoCp = o.autoCp !== false;
    this.players = []; for (let i = 0; i < this.n; i++) this.players.push(newPlayer(this.L, i));
    this.events = []; this.t = 0; this.finished = false; this.prev = [false, false];
  }
  step(inputs) {
    this.t++;
    const ev = this.events, respawn = this.practice || this.kind2p;
    for (let i = 0; i < this.n; i++) {
      const p = this.players[i], held = !!(inputs && inputs[i]), edge = held && !this.prev[i]; this.prev[i] = held;
      if (!p.alive) {
        p.deadT++; p.rt++;
        if (!respawn && p.deadT >= C.RESTART) { startState(this.L, p); p.att++; ev.push(['restart', i, p.att]); }
        else if (respawn && p.deadT >= (this.practice ? C.RESPAWN_PRACTICE : C.RESPAWN)) { const rt = p.rt; if (p.cp) restore(p, p.cp); else { startState(this.L, p); p.rt = rt; } p.att++; ev.push(['respawn', i, p.cp ? 1 : 0]); }
        continue;
      }
      stepP(this.L, p, held, edge, ev, i);
      if (respawn && this.autoCp && p.alive && !p.fin) this.autoCheck(p, i);
    }
    let all = true; for (const p of this.players) if (!p.fin) all = false;
    this.finished = all;
  }
  /* a checkpoint every ~6 s of running: a moment on solid ground, kept once you have gone 0.5 s from it without pressing */
  autoCheck(p, i) {
    const S = this.L.spots;
    if (S) { let got = null; while (p.spotK < S.length && S[p.spotK].x <= p.x) got = S[p.spotK++]; if (got) { p.cp = got; p.cpX = got.x; this.events.push(['cp', i, Math.round(got.x * 10)]); } return; }
    if (!p.cand) { if (p.ground && p.x - p.cpX >= C.CP_EVERY * SPEEDS[p.speed]) { p.cand = snap(p); p.candT = p.rt; } return; }
    if (p.jumpT > p.candT) { p.cand = null; return; }
    if (p.rt - p.candT >= C.CP_CLEAR) { p.cp = p.cand; p.cpX = p.cand.x; p.cand = null; this.events.push(['cp', i, Math.round(p.cp.x * 10)]); }
  }
  dropCp(i) { const p = this.players[i]; if (!p || !p.alive || p.fin || !p.ground) return false; p.cp = snap(p); p.cpX = p.x; this.events.push(['cp', i, Math.round(p.x * 10)]); return true; }
  restartPlayer(i) { const p = this.players[i]; startState(this.L, p); p.att++; }
  get len() { return this.L.len; }
}
Sim.compile = compile; Sim.stepPlayer = stepP; Sim.newPlayer = newPlayer; Sim.isDecision = decision; Sim.snap = snap; Sim.restore = restore;

/* ---------- the solver ----------
   A depth-first search over the moments where a press matters (decision(): on the ground, or inside an unused ring); at each,
   'wait' is tried before 'press' (so it finds the latest presses). A press is held for one step. Decision states that cannot
   reach the finish are remembered (bad), and so are those that can (good), so the search and the window scans stay quick.
   opts: from (a runner state to start from; default the level start), windows (true: measure each press's timing window),
   maxSteps (default: enough for the level), budget (max simulated steps, default 4e6).
   Returns {ok, path:[steps from the start at which to press], presses, minWindowMs, windows:[{step, x, lo, hi, ms}], failAt (x)}. */
function solve(level, opts) {
  opts = opts || {};
  const L = compile(level), bad = new Set(), good = new Set();
  const p0 = opts.from ? clone(opts.from) : newPlayer(L, 0);
  if (opts.from) { p0.cand = null; }
  const maxSteps = opts.maxSteps || Math.ceil((L.len - p0.x) / SPEEDS[0] * HZ) + HZ * 4;
  let budget = opts.budget || 4e6, failAt = p0.x;
  const key = (p, n) => n + ':' + Math.round(p.y * 4096) + ':' + (p.ground ? 'g' : Math.round(p.vy * 1024) + ':' + Math.min(p.buf, C.BUF + 1) + ':' + p.lastRing) + ':' + p.lastPad;
  /* advance from a decision state with or without a press, to the next decision state (or the end) */
  function adv(p, n, press) {
    const q = clone(p); stepP(L, q, press, press, null, 0); n++; budget--;
    while (q.alive && !q.fin && !decision(L, q) && n < maxSteps) { stepP(L, q, false, false, null, 0); n++; budget--; if (q.x > failAt) failAt = q.x; }
    if (q.x > failAt) failAt = q.x;
    return { q, n };
  }
  /* can this decision state reach the finish? returns the frames of a winning line from it, or null */
  function search(pS, nS, boolOnly) {
    const st = [{ p: pS, n: nS, c: -1 }];
    while (st.length) {
      if (budget <= 0) return null;
      const f = st[st.length - 1];
      if (f.c === -1) {
        if (f.p.fin) { for (const g of st) good.add(key(g.p, g.n)); return st; }
        const k = key(f.p, f.n);
        if (!f.p.alive || f.n >= maxSteps || bad.has(k)) { st.pop(); continue; }
        if (boolOnly && good.has(k)) return st;
      }
      if (f.c >= 1) { bad.add(key(f.p, f.n)); st.pop(); continue; }
      f.c++;
      const r = adv(f.p, f.n, f.c === 1);
      if (!r.q.alive) continue;
      st.push({ p: r.q, n: r.n, c: -1 });
    }
    return null;
  }
  const line = decision(L, p0) ? search(p0, 0) : (() => { const r = adv(p0, 0, false); return r.q.fin ? [{ p: r.q, n: r.n, c: -1 }] : r.q.alive ? search(r.q, r.n) : null; })();
  if (!line) return { ok: false, path: [], presses: 0, minWindowMs: 0, windows: [], failAt: Math.round(failAt * 100) / 100, budgetLeft: budget };
  const path = [], tapAt = [];
  for (let j = 0; j < line.length; j++) if (line[j].c === 1) { path.push(line[j].n); tapAt.push(j); }
  const out = { ok: true, path, presses: path.length, minWindowMs: 0, windows: [], failAt: Math.round(L.len * 100) / 100 };
  if (opts.windows) {
    const okFrom = (p, n, press) => { const r = adv(p, n, press); if (r.q.fin) return true; if (!r.q.alive) return false; return !!search(r.q, r.n, true); };
    let mn = 1e9;
    for (const j of tapAt) {
      const f = line[j]; let lo = 0, hi = 0;
      /* earlier: the decision frames just before on the same stretch (waited through) */
      for (let k = j - 1; k >= 0; k--) { const g = line[k]; if (g.c !== 0 || g.n !== f.n - (j - k) || g.p.ground !== f.p.ground) break; if (!okFrom(g.p, g.n, true)) break; lo = g.n - f.n; }
      /* later: wait on from f, then press */
      let q = f.p, n = f.n;
      for (let d = 1; d < 120; d++) { const r = adv(q, n, false); if (!r.q.alive || r.q.fin || r.n !== n + 1 || r.q.ground !== f.p.ground) break; q = r.q; n = r.n; if (!okFrom(q, n, true)) break; hi = d; }
      const ms = (hi - lo + 1) * 1000 / HZ; if (ms < mn) mn = ms;
      out.windows.push({ step: f.n, x: Math.round(f.p.x * 100) / 100, kind: f.p.ground ? 'hop' : 'ring', lo, hi, ms: Math.round(ms) });
    }
    out.minWindowMs = path.length ? Math.round(mn) : 0;
  }
  out.budgetLeft = budget;
  return out;
}
Sim.solve = solve;
BEAT.Sim = Sim;
})();
