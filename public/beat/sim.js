/* BEET BEAT — sim.js (SIM). Pure state, no drawing, no clocks: physics, collisions, modes, portals, checkpoints, progress, the
   level validator and the solver. Deterministic: the same inputs on the same steps always give the same run (plain arithmetic,
   no randomness, no clocks), so each online player can run their own race and the bot can replay a solution exactly.

   new BEAT.Sim(level, {players:1|2, practice:bool, auto:bool, kind2p:bool}); sim.step(inputs) once per 1/240 s (inputs[i] =
   button held). sim.players[i] = {x, y, vy, mode:'hop'|'glide'|'flip', grav:1|-1, speed (index into BEAT.SPEEDS), ceil (the
   corridor's ceiling height or null), rot, ground, alive, deadT, fin, pct, best, att, crashes, rt (steps since the run began,
   dead time included), lt (LEVEL TIME: steps of the level's own timeline at this spot; the song's beat here is lt/240/spb),
   cp (checkpoint snapshot or null), cps (practice checkpoint stack), seedsGot (bitmask), finRt}
   sim.events = [[name, player, arg]] (the caller empties it): 'jump' 'flip' 'land' 'pad' 'ring' 'portal'(kind) 'crash'(pct x10)
   'restart'(attempt) 'respawn' 'cp'(x x10) 'finish'(run time in steps) 'seed'(k).

   MODES. HOP: a press on a surface jumps 2.1 blocks (hold = hop again on landing). GLIDE (a sycamore-seed spinner): hold to rise,
   let go to sink, top and bottom of the corridor are solid. FLIP (a rolling seed pod): a tap on a surface flips gravity.
   Gravity can point up (grav -1): everything mirrors (you stand on ceilings and undersides). Portals are full-height gates: the
   runner takes a portal's effect when its centre passes the portal's x, whatever its height, so mode, speed and corridor are a
   function of x alone (the timeline: timeAt(x), xAt(steps)). Solid blocks: tops (undersides when upside down) are safe, sides
   crash. In HOP a bump into the far side of a block crashes; in GLIDE and FLIP it just stops you.

   RULES. Normal mode: a crash restarts the run from 0 % after 0.6 s (attempt + 1). Practice: a crash puts you back at your last
   checkpoint after 0.6 s (Z drops one anywhere, X takes the last one back; with auto on, safe ones drop by themselves); practice
   runs never count for best %. Kind two-player rule (local and online): back at your last automatic checkpoint after 1 s; two
   on one keyboard (players 2) a little later, on the first step where the checkpoint's level time is a whole number of beats
   from the race's own (lt = t mod one beat, at most one beat more, p.respD): both runners stay on one beat grid, so the one
   song both hear stays on the beat for the one behind too.
   Automatic checkpoints: a level with a designed run (levels.js presses / holds) gets SAFE SPOTS (the designed run standing on a
   surface, about every 5 s and never more than ~6 s apart where the run allows: picked for the most time before the next input,
   0.7 s or more where it can, at least 0.45 s, or 0.35 s riding a spinner or a seed pod); passing one makes it your checkpoint.
   Without a designed run: a moment on a surface every ~6 s, kept once you have gone 0.5 s without pressing.

   BEAT.Sim.solve(level, opts) -> {ok, path, holds, plan, presses, minWindowMs, windows, failAt}: a depth-first search over the
   moments where input matters (on a surface, inside a puff ring, every 50 ms while gliding), memoised; see solve() below.
   BEAT.Sim.validate(level) -> [problems] (empty = fine). BEAT.Sim.compile(level) -> the compiled level (objects, index, portals,
   timeline, corridors, safe spots, the designed plan). BEAT.Sim.levelHash(level) -> a 31-bit fingerprint (online: lh). */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, BEAT = G.BEAT = G.BEAT || {};
const SPEEDS = BEAT.SPEEDS || [8.4, 10.4, 12.9, 15.6], JUMP = BEAT.JUMP || { h: 2.1, t: 0.44 };
const HZ = 240, DT = 1 / HZ, TAU = Math.PI * 2;
const GRAV = 8 * JUMP.h / (JUMP.t * JUMP.t), V0 = 4 * JUMP.h / JUMP.t;
const vFor = h => Math.sqrt(2 * GRAV * h);
const MODES = ['hop', 'glide', 'flip'];
const C = BEAT.C = {
  HZ, DT, GRAV, V0, MAXFALL: 26, ROT: (Math.PI / 2) / JUMP.t,
  PAD: { capY: vFor(3.2), capP: vFor(5.2), capB: 7 }, RING: { ringY: V0, ringP: vFor(3.4), ringB: 9 },
  GL: { up: 44, down: 38, max: 8.4 },           /* GLIDE: climb / sink acceleration (blocks/s²) and top climb or sink speed */
  FL: { grav: 72, v: 4, max: 22 },              /* FLIP: its gravity, the push off a surface when it flips, top speed */
  CEIL: 9, SKY: 14,                             /* a corridor's default ceiling; the soft limit upside down without one */
  RESTART: Math.round(0.6 * HZ), RESPAWN: HZ, RESPAWN_PRACTICE: Math.round(0.6 * HZ),
  CP_EVERY: 6, CP_CLEAR: Math.round(0.5 * HZ), BUF: Math.round(0.1 * HZ), SPOT_EVERY: 5, SPOT_GAP: Math.round(0.45 * HZ),
  SPOT: { min: 3.5, max: 6, good: Math.round(0.7 * HZ), soft: Math.round(0.35 * HZ) },   /* safe spots: 3.5 - 6 s apart, 0.7 s before the next input where it can be */
  TAPH: Math.round(0.06 * HZ),                  /* the solver's window scan: a press this long before a landing, still held then, hops on it */
  LB: { hw: 0.3, y0: 0.2, y1: 0.8 },           /* the runner's lethal box: 0.6 of its 1 x 1 size (also used for solid sides) */
  SNAP: 0.3,                                    /* falling onto a top: a bottom this far below it still lands */
  THORN: { hw: 0.12, h: 0.55, hs: 0.3 },        /* thorn hurt boxes: 0.24 wide, 0.55 tall (small 0.3); the art is 1 x 1 */
  RING_R: 0.75, GLIDE_K: 12,
  PROTO: 2                                      /* the online wire's version (net.js): 2 = the three spec levels + lh (level hash) */
};
const SOLID = { crate: 1, planter: 1, slab: 1 };
const PORTAL = { hop: 'm', glide: 'm', flip: 'm', gup: 'g', gdown: 'g', s0: 's', s1: 's', s2: 's', s3: 's' };
const TYPES = { thorn: 1, thornS: 1, crate: 1, planter: 1, slab: 1, capY: 1, capP: 1, capB: 1, ringY: 1, ringP: 1, ringB: 1, portal: 1 };

/* ---------- a level, compiled once: object records, a per-block index, portals, the timeline, corridors, safe spots ---------- */
function compile(level) {
  if (level._c) return level._c;
  const O = [], P = [];
  (level.objects || []).forEach((r, i) => {
    const t = r[0], x = +r[1], y = +r[2] || 0, a = r[3], b = r[4];
    const o = { i, t, x, y, w: 1, h: 1, k: '' };
    if (SOLID[t]) { o.k = 's'; o.w = +a || 1; o.h = t === 'slab' ? 0.5 : +b || 1; }
    else if (t === 'thorn' || t === 'thornS') { o.k = 't'; o.down = a === 1; o.hh = t === 'thorn' ? C.THORN.h : C.THORN.hs; }
    else if (t === 'capY' || t === 'capP' || t === 'capB') { o.k = 'p'; o.v = C.PAD[t]; o.h = 0.4; o.down = a === 1; o.flip = t === 'capB'; }
    else if (t === 'ringY' || t === 'ringP' || t === 'ringB') { o.k = 'r'; o.v = C.RING[t]; o.flip = t === 'ringB'; }
    else if (t === 'portal' && PORTAL[a]) { o.k = 'g'; o.kind = a; o.pk = PORTAL[a]; o.ceil = b != null ? +b : null; o.h = 3; P.push(o); return; }
    else return;   /* unknown: ignored (validate() reports it) */
    O.push(o);
  });
  P.sort((p, q) => p.x - q.x || p.i - q.i);
  const len = +level.len || 100, NB = Math.ceil(len) + 8, idx = [];
  for (let k = 0; k < NB; k++) idx.push([]);
  for (const o of O) { const a = Math.max(0, Math.floor(o.x - 1.5)), b = Math.min(NB - 1, Math.floor(o.x + o.w + 1.5)); for (let k = a; k <= b; k++) idx[k].push(o); }
  const seeds = (level.seeds || []).map((s, k) => ({ k, x: +s[0], y: +s[1] }));
  const speed0 = level.startSpeed == null ? 1 : level.startSpeed | 0;
  /* the timeline: speed segments (x where it starts, steps to get there, speed) */
  const segs = [{ x: 0, n: 0, v: SPEEDS[speed0] }];
  for (const p of P) if (p.pk === 's') { const s = segs[segs.length - 1], v = SPEEDS[+p.kind[1]]; if (v === s.v) continue; segs.push({ x: p.x, n: s.n + (p.x - s.x) / s.v * HZ, v }); }
  /* corridors (for drawing): stretches with a ceiling, from the mode portals */
  const zones = []; let zc = null, zx = 0;
  for (const p of P) if (p.pk === 'm') { const c = p.kind === 'hop' ? p.ceil : p.ceil != null ? p.ceil : C.CEIL; if (c !== zc) { if (zc != null) zones.push([zx, p.x, zc]); zc = c; zx = p.x; } }
  if (zc != null) zones.push([zx, len + 40, zc]);
  const L = level._c = { level, O, P, idx, NB, len, seeds, speed0, segs, zones, spots: null, plan: null, designed: null };
  L.designed = designedInputs(L);
  const d = designedRun(L); L.spots = d.spots; L.plan = d.plan; L.designedOk = d.ok;
  return L;
}
/* level time (steps) at x, and x at a level time; from the speed segments */
function timeAt(L, x) { let s = L.segs[0]; for (const q of L.segs) if (q.x <= x) s = q; else break; return s.n + (x - s.x) / s.v * HZ; }
function xAt(L, n) { let s = L.segs[0]; for (const q of L.segs) if (q.n <= n) s = q; else break; return s.x + (n - s.n) / HZ * s.v; }
/* the designer's intended input (levels.js presses: taps on beats; holds: [from, to] beats of holding, for GLIDE) as sorted
   step intervals [n0, n1) */
function designedInputs(L) {
  const lv = L.level, spb = 60 / (lv.bpm || 120), out = [];
  for (const b of lv.presses || []) { const n = Math.round(b * spb * HZ); out.push([n, n + 1]); }
  for (const h of lv.holds || []) { const n0 = Math.round(h[0] * spb * HZ), n1 = Math.round(h[1] * spb * HZ); if (n1 > n0) out.push([n0, n1]); }
  if (!out.length) return null;
  out.sort((a, b) => a[0] - b[0]);
  return out;
}
/* play the designed run once: does it finish? its safe spots (standing on a surface, no input due for SPOT_GAP steps, at least
   SPOT_EVERY seconds apart) and its plan as x intervals (the bot plays it by position, so it works from any of its spots) */
function designedRun(L) {
  const D = L.designed; if (!D) return { ok: false, spots: null, plan: null };
  const p = newPlayer(L, 0), cand = [], plan = [], maxN = Math.ceil(L.len / SPEEDS[0] * HZ) + HZ * 4, SP = C.SPOT;
  let n = 0, k = 0, prev = false, open = null;
  while (n < maxN && p.alive && !p.fin) {
    while (k < D.length && D[k][1] <= n) k++;
    const held = k < D.length && D[k][0] <= n, nextIn = k < D.length ? Math.max(0, D[k][0] - n) : 1e9;
    /* a candidate: on a surface, nothing held, the next input 0.35 s off or more (graded: 0.7 s, 0.45 s, 0.35 s on a spinner or a
       pod, then 0.35 s hopping: only where nothing better is in reach) */
    if (p.ground && !held && n > 0 && nextIn >= SP.soft) cand.push({ n, q: nextIn >= SP.good ? 2 : nextIn >= C.SPOT_GAP ? 1 : p.mode !== 'hop' ? 0 : -1, s: snap(p) });
    if (held && !open) open = [p.x, p.x]; else if (!held && open) { plan.push(open); open = null; }
    if (open) open[1] = p.x;
    stepP(L, p, held, held && !prev, null, 0); prev = held; n++;
  }
  if (open) plan.push(open);
  if (!p.fin) return { ok: false, spots: null, plan: null };
  /* the spots: from the last one, the best candidate 3.5 - 6 s on (the most time before the next input; then the nearest to 5 s);
     none there: the best of the first 2 s after that */
  const spots = [], end = n - Math.round(1.5 * HZ);
  let last = 0, j = 0;
  for (;;) {
    while (j < cand.length && cand[j].n < last + SP.min * HZ) j++;
    if (j >= cand.length || cand[j].n > end) break;
    let hi = last + SP.max * HZ; if (cand[j].n > hi) hi = cand[j].n + 2 * HZ;
    let best = null;
    for (let i = j; i < cand.length && cand[i].n <= hi; i++) { const c = cand[i]; if (c.n > end) break; if (!best || c.q > best.q || (c.q === best.q && Math.abs(c.n - last - C.SPOT_EVERY * HZ) < Math.abs(best.n - last - C.SPOT_EVERY * HZ))) best = c; }
    if (!best) break;
    const s = best.s; s.k = spots.length; spots.push(s); last = best.n;
  }
  return { ok: true, spots, plan };
}
const near = (L, x) => { const k = Math.floor(x); return k >= 0 && k < L.NB ? L.idx[k] : EMPTY; };
const EMPTY = [];

/* ---------- the runner ---------- */
function newPlayer(L, i) {
  return { i, x: 0, y: 0, vy: 0, mode: 'hop', grav: 1, speed: L.speed0, ceil: null, pk: 0, rot: 0, ground: true, alive: true, deadT: 0, fin: false, finT: 0,
    pct: 0, best: 0, att: 1, crashes: 0, rt: 0, lt: 0, cp: null, cps: [], cpX: 0, cand: null, candT: 0, jumpT: -1e9, buf: 99, lastPad: -1, lastRing: -1, seedsGot: 0, spotK: 0, finRt: 0, respD: 0 };
}
function startState(L, p) {
  p.x = 0; p.y = 0; p.vy = 0; p.mode = 'hop'; p.grav = 1; p.speed = L.speed0; p.ceil = null; p.pk = 0; p.rot = 0; p.ground = true; p.alive = true; p.deadT = 0;
  p.fin = false; p.finT = 0; p.pct = 0; p.rt = 0; p.lt = 0; p.cp = null; p.cps = []; p.cpX = 0; p.cand = null; p.jumpT = -1e9; p.buf = 99; p.lastPad = -1; p.lastRing = -1; p.spotK = 0; p.finRt = 0; p.respD = 0;
}
const snap = p => ({ x: p.x, y: p.y, vy: p.ground ? 0 : p.vy, ground: p.ground, mode: p.mode, grav: p.grav, speed: p.speed, ceil: p.ceil, pk: p.pk, lt: p.lt,
  rot: p.mode === 'hop' && p.ground ? Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2) : p.rot });
function restore(p, s) {
  p.x = s.x; p.y = s.y; p.vy = s.vy || 0; p.mode = s.mode || 'hop'; p.grav = s.grav || 1; p.speed = s.speed; p.ceil = s.ceil == null ? null : s.ceil; p.pk = s.pk || 0;
  if (s.lt != null) p.lt = s.lt; p.rot = s.rot; p.ground = s.ground !== false; p.alive = true; p.deadT = 0; p.fin = false; p.buf = 99; p.lastPad = -1; p.lastRing = -1; p.cand = null; p.jumpT = -1e9;
}
const clone = p => Object.assign({}, p);

/* a portal's effect */
function portal(p, o, ev, i) {
  if (o.pk === 's') p.speed = +o.kind[1];
  else if (o.pk === 'g') { const g = o.kind === 'gup' ? -1 : 1; if (g !== p.grav) { p.grav = g; p.vy *= 0.5; p.ground = false; } }
  else {
    const m = o.kind; p.ceil = m === 'hop' ? o.ceil : o.ceil != null ? o.ceil : C.CEIL;
    if (m !== p.mode) { p.mode = m; p.vy *= 0.5; if (m !== 'hop') p.ground = false; if (m === 'hop') p.rot = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2); }
  }
  if (ev) ev.push(['portal', i, o.kind]);
}

/* one step of one runner (shared by the Sim, the designed run, the solver and net.js's ghost). ev: an events array or null.
   A runner placed anywhere with pk = 0 (a ghost) takes every portal behind it on its first step, so it is in the right mode. */
function stepP(L, p, held, edge, ev, i) {
  if (!p.alive) return;
  p.rt++;
  const v = SPEEDS[p.speed];
  if (p.fin) {   /* past the arch: carry on, falling to the floor (or the ceiling, upside down: never further than it or the sky) */
    p.finT++; p.x += v * DT; if (p.mode === 'glide') { p.vy *= 0.98; p.y = Math.max(0, p.y + p.vy * DT); return; }
    p.vy -= GRAV * DT * p.grav; p.y = Math.max(p.ground ? p.y : 0, p.y + p.vy * DT); if (p.y <= 0) { p.y = 0; p.vy = 0; }
    const top = (p.ceil != null ? p.ceil : C.SKY) - 1; if (p.y > top) { p.y = top; p.vy = 0; }
    return;
  }
  p.lt++;
  if (edge) p.buf = 0; else if (p.buf < 99) p.buf++;
  const g = p.grav, mode = p.mode;
  if (mode === 'hop') {
    if (p.ground && held) { p.vy = V0 * g; p.ground = false; p.buf = 99; p.jumpT = p.rt; if (ev) ev.push(['jump', i, 0]); }
    p.vy -= GRAV * DT * g; if (g > 0 ? p.vy < -C.MAXFALL : p.vy > C.MAXFALL) p.vy = -C.MAXFALL * g;
  } else if (mode === 'glide') {
    p.vy += (held ? C.GL.up : -C.GL.down) * g * DT; if (p.vy > C.GL.max) p.vy = C.GL.max; else if (p.vy < -C.GL.max) p.vy = -C.GL.max;
    if (held) p.jumpT = p.rt;
  } else {
    if (p.ground && p.buf <= C.BUF) { p.grav = -g; p.vy = g * C.FL.v; p.ground = false; p.buf = 99; p.jumpT = p.rt; if (ev) ev.push(['flip', i, p.grav]); }
    const gg = p.grav; p.vy -= C.FL.grav * DT * gg; if (gg > 0 ? p.vy < -C.FL.max : p.vy > C.FL.max) p.vy = -C.FL.max * gg;
  }
  const gr = p.grav;
  p.x += v * DT; p.y += p.vy * DT;
  const was = p.ground; p.ground = false;
  /* the floor, and the ceiling (a corridor's, or the soft limit when upside down) */
  if (p.y <= 0) { p.y = 0; if (gr > 0) { if (p.vy <= 0) { p.vy = 0; p.ground = true; } } else if (p.vy < 0) p.vy = 0; }
  const top = p.ceil != null ? p.ceil : gr < 0 ? C.SKY : null;
  if (top != null && p.y + 1 >= top) { p.y = top - 1; if (gr < 0) { if (p.vy >= 0) { p.vy = 0; p.ground = true; } } else if (p.vy > 0) p.vy = 0; }
  const list = near(L, p.x), px = p.x, LB = C.LB, soft = mode !== 'hop';
  for (let j = 0; j < list.length; j++) {
    const o = list[j];
    if (o.k === 's') {
      if (o.x >= px + 0.5 || o.x + o.w <= px - 0.5 || o.y >= p.y + 1 || o.y + o.h <= p.y) continue;
      const tp = o.y + o.h;
      if (gr > 0) {
        if (p.vy <= 0 && p.y >= tp - C.SNAP) { p.y = tp; p.vy = 0; p.ground = true; continue; }
        if (soft && p.vy >= 0 && p.y + 1 <= o.y + C.SNAP) { p.y = o.y - 1; p.vy = 0; continue; }
      } else {
        if (p.vy >= 0 && p.y + 1 <= o.y + C.SNAP) { p.y = o.y - 1; p.vy = 0; p.ground = true; continue; }
        if (soft && p.vy <= 0 && p.y >= tp - C.SNAP) { p.y = tp; p.vy = 0; continue; }
      }
      if (o.x < px + LB.hw && o.x + o.w > px - LB.hw && o.y < p.y + LB.y1 && tp > p.y + LB.y0) { crash(p, ev, i); return; }
    } else if (o.k === 't') {
      const cx = o.x + 0.5, y0 = o.down ? o.y + 1 - o.hh : o.y, y1 = y0 + o.hh;
      if (cx - C.THORN.hw < px + LB.hw && cx + C.THORN.hw > px - LB.hw && y0 < p.y + LB.y1 && y1 > p.y + LB.y0) { crash(p, ev, i); return; }
    } else if (o.k === 'p') {
      if (p.lastPad === o.i || o.x + 0.1 >= px + 0.5 || o.x + 0.9 <= px - 0.5 || o.y >= p.y + 1 || o.y + o.h <= p.y) continue;
      if (o.flip) { p.grav = -p.grav; p.vy = -p.grav * o.v; } else p.vy = o.v * p.grav;
      p.ground = false; p.lastPad = o.i; if (ev) ev.push(['pad', i, o.i]);
    } else if (o.k === 'r') {
      if (p.buf > C.BUF || p.lastRing === o.i) continue;
      const cx = o.x + 0.5, cy = o.y + 0.5, dx = Math.max(Math.abs(cx - px) - 0.5, 0), dy = Math.max(Math.abs(cy - (p.y + 0.5)) - 0.5, 0);
      if (dx * dx + dy * dy > C.RING_R * C.RING_R) continue;
      if (o.flip) { p.grav = -p.grav; p.vy = -p.grav * o.v * 0.5; } else p.vy = o.v * p.grav;
      p.ground = false; p.buf = 99; p.lastRing = o.i; if (ev) ev.push(['ring', i, o.i]);
    }
  }
  if (mode === 'hop') { if (p.ground) { if (!was) { p.rot = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2); if (ev) ev.push(['land', i, 0]); } } else p.rot += C.ROT * DT * gr; }
  else if (mode === 'glide') { p.rot = -Math.atan2(p.vy, v) * 0.8; if (p.ground && !was && ev) ev.push(['land', i, 0]); }
  else { p.rot = (p.rot + v * DT / 0.48 * gr) % TAU; if (p.ground && !was && ev) ev.push(['land', i, 0]); }
  while (p.pk < L.P.length && L.P[p.pk].x <= px) portal(p, L.P[p.pk++], ev, i);
  for (const s of L.seeds) if (!(p.seedsGot >> s.k & 1) && Math.abs(s.x - px) < 0.8 && Math.abs(s.y - (p.y + 0.5)) < 0.8) { p.seedsGot |= 1 << s.k; if (ev) ev.push(['seed', i, s.k]); }
  p.pct = Math.min(100, Math.max(0, px / L.len * 100));
  if (p.pct > p.best) p.best = p.pct;
  if (px >= L.len) { p.fin = true; p.finRt = p.rt; p.pct = 100; p.best = 100; if (ev) ev.push(['finish', i, p.rt]); }
}
function crash(p, ev, i) { p.alive = false; p.deadT = 0; p.respD = 0; p.crashes++; p.vy = 0; if (ev) ev.push(['crash', i, Math.floor(p.pct * 10)]); }   /* the % as the HUD shows it (floored) */
/* is this a moment where input would change anything? (on a surface, inside an unused puff ring, or gliding) */
function decision(L, p) {
  if (!p.alive || p.fin) return false;
  if (p.mode === 'glide' || p.ground) return true;
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
    this.n = o.players === 2 ? 2 : 1; this.practice = !!o.practice; this.kind2p = !!o.kind2p;
    this.autoCp = this.practice ? o.auto !== false : o.autoCp !== false;
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
        else if (respawn && p.deadT >= (p.respD || (p.respD = this.respawnDelay(p)))) { const rt = p.rt, cps = p.cps; if (p.cp) restore(p, p.cp); else { const cs = p.cps, sk = p.seedsGot; startState(this.L, p); p.rt = rt; p.cps = cs; p.seedsGot = sk; } p.cps = cps; p.att++; p.respD = 0; ev.push(['respawn', i, p.cp ? 1 : 0]); }
        continue;
      }
      stepP(this.L, p, held, edge, ev, i);
      if (respawn && this.autoCp && p.alive && !p.fin) this.autoCheck(p, i);
    }
    let all = true; for (const p of this.players) if (!p.fin) all = false;
    this.finished = all;
  }
  /* how long a crash keeps you out (steps of deadT), worked out on the first step out: 1 s (practice 0.6 s); two on one keyboard,
     then on to the first step where the checkpoint's level time is a whole number of beats from the race's step count (this.t:
     at GO both are 0, and a runner that is never out keeps lt = t), within half a step; so it is never more than a beat longer */
  respawnDelay(p) {
    const base = this.practice ? C.RESPAWN_PRACTICE : C.RESPAWN;
    if (!(this.kind2p && this.n === 2) || this.practice) return base;
    const bs = HZ * 60 / (this.level.bpm || 120), cl = p.cp ? p.cp.lt : 0, at = this.t + base - p.deadT;   /* the race's step count when it would be back */
    const r = (((at - cl) % bs) + bs) % bs;
    return base + (r <= 0.5 ? 0 : Math.ceil(bs - r - 0.5));
  }
  /* automatic checkpoints: the level's safe spots as you pass them; without them, a moment on a surface every ~6 s, kept once
     you have gone 0.5 s from it without pressing */
  autoCheck(p, i) {
    const S = this.L.spots;
    if (S) { let got = null; while (p.spotK < S.length && S[p.spotK].x <= p.x) got = S[p.spotK++]; if (got && (!p.cp || got.x > p.cp.x)) this.setCp(p, i, got); return; }
    if (!p.cand) { if (p.ground && p.x - p.cpX >= C.CP_EVERY * SPEEDS[p.speed]) { p.cand = snap(p); p.candT = p.rt; } return; }
    if (p.jumpT > p.candT) { p.cand = null; return; }
    if (p.rt - p.candT >= C.CP_CLEAR) { const c = p.cand; p.cand = null; this.setCp(p, i, c); }
  }
  setCp(p, i, s) { p.cp = s; p.cpX = s.x; if (this.practice) { p.cps.push(s); if (p.cps.length > 64) p.cps.shift(); } this.events.push(['cp', i, Math.round(s.x * 10)]); }
  /* practice: drop a checkpoint here (anywhere you are alive); take the last one back */
  dropCp(i) { const p = this.players[i]; if (!p || !p.alive || p.fin) return false; this.setCp(p, i, snap(p)); return true; }
  removeCp(i) { const p = this.players[i]; if (!p || !p.cps.length) return false; p.cps.pop(); p.cp = p.cps.length ? p.cps[p.cps.length - 1] : null; p.cpX = p.cp ? p.cp.x : 0; this.events.push(['uncp', i, p.cps.length]); return true; }
  restartPlayer(i) { const p = this.players[i]; startState(this.L, p); p.att++; }
  get len() { return this.L.len; }
}
/* a level's fingerprint (31-bit FNV-1a of what makes the run: tempo, length, speed, objects, the designed run): online, each
   state carries the hash of its level (net.js lh), so two pages with different level files never race "level 2" unawares */
function levelHash(level) {
  if (!level) return 0; if (level._lh != null) return level._lh;
  const s = JSON.stringify([level.id, level.bpm, level.len, level.startSpeed, level.intro, level.bars, level.objects, level.presses || [], level.holds || []]);
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (level._lh = (h >>> 1));
}
Object.assign(Sim, { compile, stepPlayer: stepP, newPlayer, isDecision: decision, snap, restore, startState, timeAt, xAt, MODES, levelHash,
  modeIx: m => Math.max(0, MODES.indexOf(m)) });

/* ---------- the validator: what a level designer must fix (an empty list = fine) ---------- */
function validate(level) {
  const out = [], obs = level.objects || [];
  for (const k of ['id', 'name', 'bpm', 'len']) if (level[k] == null) out.push('missing ' + k);
  if (!/^(easy|normal|hard)$/.test(level.diff || '')) out.push('diff must be easy|normal|hard');
  if (!/^(meadows|skyway|works)$/.test(level.world || '')) out.push('world must be meadows|skyway|works');
  obs.forEach((r, i) => {
    if (!Array.isArray(r) || !TYPES[r[0]]) out.push('object ' + i + ': unknown type ' + JSON.stringify(r && r[0]));
    else if (!(isFinite(r[1]) && isFinite(r[2] || 0))) out.push('object ' + i + ': bad x/y');
    else if (r[0] === 'portal' && !PORTAL[r[3]]) out.push('object ' + i + ': portal kind must be one of ' + Object.keys(PORTAL).join(' '));
    if (i && Array.isArray(r) && Array.isArray(obs[i - 1]) && r[1] < obs[i - 1][1]) out.push('object ' + i + ': not sorted by x');
  });
  if ((level.seeds || []).length !== 3) out.push('a level has 3 golden seeds (has ' + (level.seeds || []).length + ')');
  const L = compile(level);
  /* blue caps and rings (gravity flips) belong inside a corridor (a ceiling), so an upside-down runner has something to stand on */
  for (const o of L.O) if (o.flip) { const z = L.zones.find(z => o.x >= z[0] && o.x <= z[1]); if (!z) out.push((o.t) + ' at x ' + o.x + ' is outside a corridor (add a mode portal with a ceiling)'); }
  for (const p of L.P) if (p.kind === 'gup' && !L.zones.find(z => p.x >= z[0] && p.x <= z[1])) out.push('gup portal at x ' + p.x + ' is outside a corridor');
  if (L.designed && !L.designedOk) out.push('the designed run (presses/holds) does not finish');
  return out;
}
Sim.validate = validate;

/* ---------- the solver ----------
   A depth-first search over the moments where input matters (decision()): on a surface or inside an unused ring, 'wait' is
   tried before 'press' (so it finds the latest presses; a press is held for one step); while gliding, every GLIDE_K steps it
   chooses to hold or let go for the next GLIDE_K steps (the side that heads for the middle of the corridor first). States that
   cannot reach the finish are remembered (bad), and so are those that can (good), so the search and the window scans stay quick
   (gliding states are remembered on a coarse grid, which keeps the search small; a found line is always a true one).
   opts: from (a runner state to start from; default the level start), windows (true: measure each press's timing window),
   maxSteps, budget (max simulated steps, default 4e6), need (a bitmask of golden seeds the line must collect: proves they can be got).
   Returns {ok, path:[steps from the start of each press or hold], holds:[[from, to) steps held], plan:[[x0, x1] held between],
   presses, minWindowMs, windows:[{step, x, kind, lo, hi, ms, tapMs, holdMs, chain}], failAt (the furthest x reached)}.
   HOLD CHAINS. A press on the very step of a landing straight after a press (only mid-air moments in between, left alone) is
   what HOLDING the button does by itself (hold = hop again on landing), so a run of them is also measured as one input: hold
   from the first press to the last, the whole hold shifted earlier or later. A tap-by-tap window there is tiny (a one-step
   press must land on the landing step) while holding is easy; each press of a chain reports tapMs (tapping), holdMs (holding
   the chain) and ms = the better of the two (minWindowMs uses ms), kind 'hold' and chain (its index). */
function solve(level, opts) {
  opts = opts || {};
  const L = compile(level), bad = new Set(), good = new Set(), GK = C.GLIDE_K;
  const p0 = opts.from ? clone(opts.from) : newPlayer(L, 0);
  if (opts.from) { p0.cand = null; p0.cps = []; }
  const maxSteps = opts.maxSteps || Math.ceil((L.len - p0.x) / SPEEDS[0] * HZ) + HZ * 4;
  let budget = opts.budget || 4e6, failAt = p0.x; const need = opts.need | 0;
  const key = (p, n) => (need ? (p.seedsGot & need) + '|' : '') + (p.mode === 'glide'
    ? n + 'G' + Math.round(p.y * 8) + ':' + Math.round(p.vy) + ':' + p.grav + ':' + p.lastPad + ':' + p.lastRing
    : n + ':' + Math.round(p.y * 4096) + ':' + p.grav + ':' + (p.ground ? 'g' : Math.round(p.vy * 1024) + ':' + Math.min(p.buf, C.BUF + 1) + ':' + p.lastRing) + ':' + p.lastPad);
  /* from a decision state, act (a = 1 press / hold, 0 not), then run on to the next decision state (or the end).
     q.hd: the input held on the last step (so an edge is a press after a let-go) */
  function adv(p, n, a) {
    const q = clone(p), on = !!a;
    if (q.mode === 'glide') {
      for (let k = 0; k < GK && q.alive && !q.fin && q.mode === 'glide' && n < maxSteps; k++) { stepP(L, q, on, on && !q.hd, null, 0); q.hd = on; n++; budget--; }
    } else { stepP(L, q, on, on && !q.hd, null, 0); q.hd = on; n++; budget--; }
    while (q.alive && !q.fin && !decision(L, q) && n < maxSteps) { stepP(L, q, false, false, null, 0); q.hd = false; n++; budget--; if (q.x > failAt) failAt = q.x; }
    if (q.x > failAt) failAt = q.x;
    return { q, n };
  }
  /* glide: which action first (towards the middle of the corridor) */
  const first = p => { if (p.mode !== 'glide') return 0; const top = p.ceil != null ? p.ceil : C.CEIL, mid = (top - 1) / 2; return (p.y < mid) === (p.grav > 0) ? 1 : 0; };
  /* can this decision state reach the finish? returns the frames of a winning line from it, or null */
  function search(pS, nS, boolOnly) {
    const st = [{ p: pS, n: nS, c: -1, f: first(pS) }];
    while (st.length) {
      if (budget <= 0) return null;
      const f = st[st.length - 1];
      if (f.c === -1) {
        if (f.p.fin && (f.p.seedsGot & need) === need) { for (const g of st) good.add(key(g.p, g.n)); return st; }
        if (f.p.fin) { st.pop(); continue; }
        const k = key(f.p, f.n);
        if (!f.p.alive || f.n >= maxSteps || bad.has(k)) { st.pop(); continue; }
        if (boolOnly && good.has(k)) return st;
      }
      if (f.c >= 1) { bad.add(key(f.p, f.n)); st.pop(); continue; }
      f.c++;
      const act = f.c === 0 ? f.f : 1 - f.f; f.a = act;
      const r = adv(f.p, f.n, act);
      if (!r.q.alive) continue;
      st.push({ p: r.q, n: r.n, c: -1, f: first(r.q) });
    }
    return null;
  }
  const line = decision(L, p0) ? search(p0, 0) : (() => { const r = adv(p0, 0, 0); return r.q.fin ? [{ p: r.q, n: r.n, c: -1 }] : r.q.alive ? search(r.q, r.n) : null; })();
  if (!line) return { ok: false, path: [], holds: [], plan: [], presses: 0, minWindowMs: 0, windows: [], failAt: Math.round(failAt * 100) / 100, budgetLeft: budget };
  /* the line's inputs: held steps as intervals (and as x intervals, replaying it) */
  const holds = [], path = [], tapAt = [];
  for (let j = 0; j < line.length; j++) {
    const f = line[j]; if (f.c < 0 || !f.a) continue;
    const len = f.p.mode === 'glide' ? Math.min(GK, line[j + 1] ? line[j + 1].n - f.n : GK) : 1;
    const last = holds[holds.length - 1];
    if (last && last[1] === f.n) last[1] = f.n + len; else { holds.push([f.n, f.n + len]); path.push(f.n); }
    if (f.p.mode !== 'glide') tapAt.push(j);
  }
  const plan = [];
  { const q = clone(p0); q.hd = false; let n = 0, k = 0, open = null;
    while (q.alive && !q.fin && n < maxSteps) { while (k < holds.length && holds[k][1] <= n) k++; const on = k < holds.length && holds[k][0] <= n;
      if (on && !open) { open = [q.x, q.x]; plan.push(open); } else if (!on) open = null; if (open) open[1] = q.x;
      stepP(L, q, on, on && !q.hd, null, 0); q.hd = on; n++; } }
  const out = { ok: true, path, holds, plan, presses: path.length, minWindowMs: 0, windows: [], failAt: Math.round(L.len * 100) / 100 };
  if (opts.windows) {
    const okFrom = (p, n, a) => { const r = adv(p, n, a); if (r.q.fin) return (r.q.seedsGot & need) === need; if (!r.q.alive) return false; return !!search(r.q, r.n, true); };
    /* hold `len` steps from the state p at step n (a press on its first step), let go, and see if the finish can be reached */
    const okHold = (p, n, len) => {
      const q = clone(p); let m = n;
      for (let k = 0; k < len && q.alive && !q.fin && m < maxSteps; k++) { stepP(L, q, true, !q.hd, null, 0); q.hd = true; m++; budget--; }
      if (q.alive && !q.fin) { stepP(L, q, false, false, null, 0); q.hd = false; m++; budget--; }
      while (q.alive && !q.fin && !decision(L, q) && m < maxSteps) { stepP(L, q, false, false, null, 0); m++; budget--; }
      if (q.fin) return (q.seedsGot & need) === need; if (!q.alive) return false; return !!search(q, m, true);
    };
    /* the runner of the line at step n (between line[k] and line[k + 1]): line[k]'s state with its action replayed */
    const stateAt = (k, n) => {
      const f = line[k], q = clone(f.p); q.hd = false;
      for (let m = f.n; m < n && q.alive && !q.fin; m++) { const on = !!f.a && (f.p.mode === 'glide' ? m < f.n + GK : m === f.n); stepP(L, q, on, on && !q.hd, null, 0); q.hd = on; }
      return q;
    };
    /* where an earlier press could be: the wait frames just before line[j] on the same surface (one step apart), then the air
       before the landing: HOP up to TAPH steps (a press then, still held at the landing, hops on the landing step), FLIP up to
       BUF steps (the game keeps a press for that long) */
    const before = j => { const f = line[j], out = []; for (let k = j - 1; k >= 0; k--) { const g = line[k]; if (g.c < 0 || g.a || g.n !== f.n - (j - k) || g.p.ground !== f.p.ground || g.p.mode !== f.p.mode) break; out.push(g); } return out; };
    const early = (j, ok, okAir) => {
      const f = line[j], gs = before(j); let lo = 0;
      for (const g of gs) { if (!ok(g.p, g.n)) return lo; lo = g.n - f.n; }
      const e = j - gs.length, k = e - 1, land = line[e];   /* line[e]: the first moment on this surface */
      const m = land.p.mode, D = m === 'hop' ? C.TAPH : m === 'flip' ? C.BUF : 0;   /* FLIP: a press in the air is kept for BUF steps */
      if (!land.p.ground || !D || k < 0) return lo;
      for (let d = 1; d <= D; d++) { const n = land.n - d; if (n <= line[k].n) break; const q = stateAt(k, n); if (!q.alive || q.ground || q.mode !== m) break; if (!okAir(q, n, d + 1)) break; lo = n - f.n; }
      return lo;
    };
    const late = (j, ok) => {
      const f = line[j]; let q = f.p, n = f.n, hi = 0;
      for (let d = 1; d < 120; d++) { const r = adv(q, n, 0); if (!r.q.alive || r.q.fin || r.n !== n + 1 || r.q.ground !== f.p.ground || r.q.mode !== f.p.mode) break; q = r.q; n = r.n; if (!ok(q, n)) break; hi = d; }
      return hi;
    };
    const tapWin = j => { const lo = early(j, (p, n) => okFrom(p, n, 1), (q, n, len) => okHold(q, n, len)), hi = late(j, (p, n) => okFrom(p, n, 1)); return { lo, hi, ms: (hi - lo + 1) * 1000 / HZ }; };
    /* hold chains (see above): tap b continues the chain of tap a when both are HOP presses on a surface and b is on the first
       surface after a's hop (only unpressed mid-air frames between, then at most BUF steps on it) */
    const chains = []; let cur = null;
    for (let i = 0; i < tapAt.length; i++) {
      const a = tapAt[i], b = tapAt[i + 1], fa = line[a]; let linked = b != null && fa.p.ground && fa.p.mode === 'hop' && line[b].p.ground && line[b].p.mode === 'hop';
      if (linked) { const gs = before(b).length; for (let k = a + 1; k < b - gs; k++) if (line[k].p.ground || line[k].a) linked = false; if (gs > C.BUF) linked = false; }
      if (linked) { if (!cur) chains.push(cur = [a]); cur.push(b); } else cur = null;
    }
    const chainOf = new Map(), chainWin = [];
    chains.forEach((ch, ci) => {
      const f = line[ch[0]], len = line[ch[ch.length - 1]].n + 1 - f.n;
      let w = { lo: 0, hi: 0, ms: 0 };
      if (okHold(f.p, f.n, len)) {   /* holding through the chain works at all: how much earlier or later can it start (and end)? */
        const lo = early(ch[0], (p, n) => okHold(p, n, len + (f.n - n)), (q, n, l) => okHold(q, n, len + (f.n - n))), hi = late(ch[0], (p, n) => okHold(p, n, len));
        w = { lo, hi, ms: (hi - lo + 1) * 1000 / HZ };
      }
      chainWin.push(w); for (const j of ch) chainOf.set(j, ci);
    });
    let mn = 1e9;
    for (const j of tapAt) {
      const f = line[j], w = tapWin(j), ci = chainOf.get(j), cw = ci != null ? chainWin[ci] : null;
      const ms = cw ? Math.max(w.ms, cw.ms) : w.ms; if (ms < mn) mn = ms;
      const e = { step: f.n, x: Math.round(f.p.x * 100) / 100, kind: cw && cw.ms > w.ms ? 'hold' : f.p.ground ? f.p.mode : 'ring', lo: w.lo, hi: w.hi, ms: Math.round(ms), tapMs: Math.round(w.ms) };
      if (cw) { e.holdMs = Math.round(cw.ms); e.chain = ci; }
      out.windows.push(e);
    }
    out.chains = chains.length;
    out.minWindowMs = out.windows.length ? Math.round(mn) : 0;
  }
  out.budgetLeft = budget;
  return out;
}
Sim.solve = solve;
BEAT.Sim = Sim;
})();
