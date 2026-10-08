/* SPROUT KART — tracks.js (SIM owns data, build and lookups; RENDER paints the v2 floor features via SK.Render.paintV2).
   The three circuits as data: a closed centre line through control points (metres; the world is 256 x 256 m, x right,
   y down), a road width, an off-road band and what lies beyond it (a wall or the open sky), plus the v2 extras:
   shortcuts ("cuts": open side roads with their own frame), floor features (ramps, gaps, a ford, rainbow rings,
   bumpers; on cuts also crate blocks and bounce clouds) and timed hazards (sprinklers, pumpkins, baskets, rain, gusts,
   steam, pistons, barrels) that are pure functions of the race clock.
   build() samples the spline every metre and bakes a surface grid (0.5 m cells) with the nearest centre-line sample per
   cell (main road) and per cut (T.cg / T.cnear / T.cdist). The main band always wins over a cut.
   API: SK.TRACKS[i] = {id, name, theme, laps, L, N, ds, X, Y, TX, TY, ANG, K, LINE, AHEAD, hw, off, edge, grid, near, dist,
   cg, cnear, cdist, cuts:[cut], feats:[feat], hazards:[haz], items:[{x,y,z,s,sky}], boosts:[{s,lat,len,w,kind}],
   rainbows:[s], checkpoints, NCP, slots, start, deco, pos(s, lat, out), at(cp, off)},
   cut = {id, name, i, sa, la, sb, lb, s0, s1, span, len, n, ds, hw, verge, edge, surf, rail, ai, X, Y, TX, TY, ANG, K,
   LINE, AHEAD, pos(u, lat, out), feats},
   feat = {k, on (-1 main | cut index), a0, a1 (metres along), l0, l1, quad:[[x,y]x4], ...def fields},
   haz = {k, skin, on, a (metres along), lat, ...def fields},
   SK.locate(T, x, y, out) (no allocation; fills ok, surf, i, s, f, d, dist, cx, cy, cut, u, hw, lim, ang),
   SK.hazState(T, h, clock, out), SK.surfaceAt, SK.progress, SK.trackTexture(T) -> canvas. */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, SK = G.SK = G.SK || {};
const WS = 256, CELL = 0.5, GN = WS / CELL, TS = 2048, TPM = TS / WS, TAU = Math.PI * 2;
const S_OFF = 0, S_ROAD = 1, S_WALL = 2, S_BOOST = 3, S_VOID = 4, S_BELT = 6, SURF = ['off', 'road', 'wall', 'boost', 'void', '', 'belt'];
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const wrapA = a => (a > Math.PI || a < -Math.PI) ? a - TAU * Math.floor((a + Math.PI) / TAU) : a;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- the circuits ---------- */
const DEFS = [
  { id: 'meadows', name: 'PATCHWORK MEADOWS', short: 'MEADOWS', theme: 'meadows', laps: 3, width: 15, off: 6, edge: 'wall',
    pts: [[60, 222], [120, 225], [176, 221], [214, 204], [228, 168], [214, 136], [212, 106], [228, 72], [212, 36], [170, 28], [120, 30], [76, 34],
          [44, 58], [46, 94], [76, 112], [120, 112], [152, 122], [162, 146], [140, 166], [96, 170], [54, 176], [30, 198], [38, 218]],
    tunnel: [8, 22, 11, -6], arch: 0,
    rows: [0.078, 0.360, 0.486, 0.600, 0.806],
    sky: [[0.112, 4, 1.4], [0.4695, -2.5, 1.4], [0.4695, 0, 1.4], [0.4695, 2.5, 1.4]],
    pads: [[0.301, 0, 7], [0.415, 3.5, 7], [0.432, -3.5, 7], [0.500, -4, 7], [0.876, 3, 7]],
    feats: [
      { k: 'ramp', skin: 'barrow', f: 0.100, len: 3, l0: 2, l1: 6, D: 16, vmin: 15 },
      { k: 'ramp', skin: 'hay', f: 0.455, len: 3, l0: -3.5, l1: 3.5, D: 20, vmin: 18 },
      { k: 'ramp', skin: 'log', f: 0.845, len: 3, l0: -4, l1: 4, D: 19, vmin: 17 },
      { k: 'ford', f0: 0.856, f1: 0.863 }],
    cuts: [
      { id: 'greenhouse', name: 'GREENHOUSE', sa: 0.512, la: -4, sb: 0.692, lb: -4, pts: [[84, 40], [74, 58], [73, 76], [80, 94]],
        hw: 4, verge: 1.5, edge: 'wall', surf: [[0.30, 0.48, 'rough']], ai: { needBoost: true } }],
    hazards: [
      { k: 'spray', skin: 'sprinkler', f: 0.205, lat: 10.5, half: 3, l0: -3.5, l1: 7.5, per: 240, off: 0, tell: 60, act: 100 },
      { k: 'spray', skin: 'sprinkler', f: 0.235, lat: -10.5, half: 3, l0: -7.5, l1: 2, per: 240, off: 80, tell: 60, act: 100 },
      { k: 'spray', skin: 'sprinkler', f: 0.265, lat: 10.5, half: 3, l0: -3.5, l1: 7.5, per: 240, off: 160, tell: 60, act: 100 },
      { k: 'mover', path: 'cross', skin: 'pumpkin', f: 0.312, l0: 14, l1: -14, sp: 6, every: 200, off: 0, r: 1.0 },
      { k: 'mover', path: 'cross', skin: 'pumpkin', f: 0.332, l0: 14, l1: -14, sp: 6, every: 200, off: 100, r: 1.0 },
      { k: 'mover', path: 'swing', skin: 'basket', on: 'greenhouse', u: 0.58, lat: 0, amp: 3, per: 150, off: 0, r: 0.9 },
      { k: 'mover', path: 'swing', skin: 'basket', on: 'greenhouse', u: 0.74, lat: 0, amp: 3, per: 150, off: 75, r: 0.9 }] },
  { id: 'skyway', name: 'CANDYFLOSS SKYWAY', short: 'SKYWAY', theme: 'skyway', laps: 3, width: 14, off: 3.5, edge: 'void',
    pts: [[64, 222], [128, 226], [184, 214], [222, 184], [226, 140], [200, 112], [160, 118], [128, 140], [96, 150], [70, 128], [72, 92],
          [104, 70], [150, 76], [186, 60], [206, 34], [170, 22], [110, 24], [54, 34], [28, 70], [30, 130], [30, 180], [40, 210]],
    arch: 0,
    rows: [0.125, 0.420, 0.585, 0.720, 0.905],
    sky: [[0.884, -2.5, 1.6], [0.884, 2.5, 1.6]],
    pads: [[0.080, 0, 7], [0.490, 3.5, 7], [0.894, 2.5, 7]],   /* fix round 1: the 0.49 pad is on the main line, not aimed into the bridge (30 m/s onto a narrow bridge) */
    rainbows: [0.176, 0.505, 0.790, 0.939],
    feats: [
      { k: 'ramp', skin: 'catapult', f: 0.116, len: 3, l0: -7, l1: -3, aim: 'hops', vmin: 13 },
      { k: 'ramp', skin: 'kicker', f: 0.872, len: 3, l0: -7, l1: 7, D: 22, vmin: 18 },
      { k: 'ramp', skin: 'kicker', f: 0.757, len: 3, l0: -6, l1: 0, D: 18, vmin: 15 },   /* fix round 1: SKY HOP, a half-width kicker after the windsocks */
      { k: 'gap', f0: 0.879, f1: 0.889, net: [0] },
      { k: 'bumper', f0: 0.14, f1: 0.32, side: 1, cls: [0] },
      { k: 'bumper', f0: 0.36, f1: 0.50, side: -1, cls: [0, 1] },
      { k: 'bumper', f0: 0.595, f1: 0.65, side: 1, cls: [0, 1] },
      { k: 'bumper', f0: 0.755, f1: 0.85, side: 1, cls: [0] },
      { k: 'bumper', f0: 0.948, f1: 0.999, side: 1, cls: [0] }],
    cuts: [
      { id: 'hops', name: 'CLOUD HOPS', sa: 0.118, la: -4.5, sb: 0.280, lb: -4, pts: [[190, 198], [200, 172], [197, 146]],
        hw: 4.5, verge: 0, edge: 'void', surf: [[0, 1, 'void']],
        feats: [{ k: 'bounce', u: 0.28 }, { k: 'bounce', u: 0.44 }, { k: 'bounce', u: 0.60 }, { k: 'bounce', u: 0.76, to: 'exit' }],
        ai: { minV: 16, avoidEasy: true } },
      { id: 'bridge', name: 'CANDYFLOSS BRIDGE', sa: 0.535, la: -4, sb: 0.690, lb: -4, pts: [[158, 62], [162, 46], [154, 32]],
        hw: 3.5, verge: 0, edge: 'void', rail: [0, 1], surf: [[0.15, 0.39, 'rough'], [0.58, 0.86, 'rough']],   /* fix round 1: 7 m wide with soft rails on EASY and MEDIUM too (a keyboard kid fell off the 6 m one on most passes); a candyfloss patch where the jump lands (it saved 2.9 s) */
        feats: [{ k: 'ramp', skin: 'fluff', u: 0.40, len: 2.5, D: 14, vmin: 13 }, { k: 'gap', u0: 0.45, u1: 0.55, net: [0] }],
        ai: { minV: 16, avoidEasy: true } }],
    hazards: [
      { k: 'spray', skin: 'rain', f: 0.205, lat: 0, r: 4.5, amp: 3, sway: 360, per: 240, off: 0, tell: 60, act: 90 },
      { k: 'spray', skin: 'rain', f: 0.452, lat: 0, r: 4, amp: 5, sway: 300, per: 240, off: 120, tell: 60, act: 90 },
      { k: 'gust', f: 0.705, half: 10, dir: -1, acc: 22, cap: 4, per: 300, off: 0, tell: 60, act: 90 },
      { k: 'gust', f: 0.745, half: 10, dir: 1, acc: 22, cap: 4, per: 300, off: 150, tell: 60, act: 90 },
      { k: 'gust', on: 'bridge', u0: 0.62, u1: 0.80, dir: 1, acc: 20, cap: 4, per: 240, off: 120, tell: 50, act: 70 }] },
  { id: 'works', name: 'CLATTER WORKS', short: 'WORKS', theme: 'works', laps: 3, width: 14, off: 4, edge: 'wall',
    pts: [[60, 224], [140, 226], [196, 222], [226, 196], [222, 160], [196, 150], [170, 166], [146, 150], [122, 166], [98, 150], [80, 124],
          [96, 98], [134, 92], [176, 96], [214, 84], [224, 50], [196, 26], [130, 28], [70, 30], [34, 50], [28, 100], [30, 160], [36, 206]],
    gears: [5, 6, 7, 8, 9], chimneys: [[110, 200], [180, 186], [60, 70], [158, 60], [116, 126], [196, 124], [60, 140]], arch: 0,
    rows: [0.086, 0.200, 0.441, 0.600, 0.765],
    belts: [0.104, 0.522, 0.695, 0.870],
    feats: [{ k: 'ramp', skin: 'crate', f: 0.879, len: 3, l0: -4, l1: 4, D: 32, vmin: 17 },
      { k: 'ramp', skin: 'crate', f: 0.718, len: 3, l0: -1, l1: 5, D: 18, vmin: 15 }],   /* fix round 1: a side crate ramp on the top straight */
    cuts: [
      { id: 'bay', name: 'LOADING BAY', sa: 0.120, la: -3, sb: 0.270, lb: -3, pts: [[198, 213], [209, 196], [205, 178]],
        hw: 3.5, verge: 1, edge: 'wall',
        feats: [{ k: 'ramp', skin: 'crate', u: 0.50, len: 2.5, D: 16, vmin: 16 }, { k: 'block', u0: 0.571, u1: 0.659, h: 0.6 }],
        ai: { minV: 18 } },
      { id: 'belt', name: 'EXPRESS BELT', sa: 0.520, la: -3, sb: 0.680, lb: -3, pts: [[194, 80], [200, 60], [190, 44], [172, 38]],
        hw: 3.5, verge: 1, edge: 'wall', surf: [[0.25, 0.75, 'belt']], ai: {} }],
    hazards: [
      { k: 'spray', skin: 'steam', f: 0.280, lat: 3.5, r: 2, lift: 3.5, per: 200, off: 0, tell: 45, act: 60 },
      { k: 'spray', skin: 'steam', f: 0.311, lat: -3.5, r: 2, lift: 3.5, per: 200, off: 66, tell: 45, act: 60 },
      { k: 'spray', skin: 'steam', f: 0.343, lat: 3.5, r: 2, lift: 3.5, per: 200, off: 133, tell: 45, act: 60 },
      { k: 'mover', path: 'cross', skin: 'barrel', f: 0.898, l0: 13, l1: -13, sp: 6, every: 90, off: 0, r: 0.95 },
      { k: 'piston', on: 'belt', u: 0.40, lat: 1.5, r: 1.6, per: 144, off: 0, tell: 30, act: 60 },
      { k: 'piston', on: 'belt', u: 0.60, lat: -1.5, r: 1.6, per: 144, off: 72, tell: 30, act: 60 }] }
];

/* ---------- splines: centripetal Catmull-Rom ---------- */
function crSeg(P0, P1, P2, P3, per, out) {
  const tj = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const t0 = 0, t1 = t0 + tj(P0, P1), t2 = t1 + tj(P1, P2), t3 = t2 + tj(P2, P3);
  for (let k = 0; k < per; k++) {
    const t = t1 + (t2 - t1) * k / per, r = [0, 0];
    for (let c = 0; c < 2; c++) {
      const A1 = ((t1 - t) * P0[c] + (t - t0) * P1[c]) / (t1 - t0), A2 = ((t2 - t) * P1[c] + (t - t1) * P2[c]) / (t2 - t1), A3 = ((t3 - t) * P2[c] + (t - t2) * P3[c]) / (t3 - t2);
      const B1 = ((t2 - t) * A1 + (t - t0) * A2) / (t2 - t0), B2 = ((t3 - t) * A2 + (t - t1) * A3) / (t3 - t1);
      r[c] = ((t2 - t) * B1 + (t - t1) * B2) / (t2 - t1);
    }
    out.push(r);
  }
}
function spline(pts, per) {   /* closed */
  const n = pts.length, out = [], cpAt = [];
  for (let i = 0; i < n; i++) { cpAt.push(out.length); crSeg(pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n], per, out); }
  return { P: out, cpAt };
}
function blur(a, rad, passes) {   /* circular box blur */
  const n = a.length; let src = Float64Array.from(a), dst = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    let acc = 0; for (let k = -rad; k <= rad; k++) acc += src[(k + n) % n];
    for (let i = 0; i < n; i++) { dst[i] = acc / (2 * rad + 1); acc += src[(i + rad + 1) % n] - src[(i - rad + n) % n]; }
    const t = src; src = dst; dst = t;
  }
  return src;
}
function blurOpen(a, rad, passes) {   /* open box blur (ends clamped) */
  const n = a.length; let src = Float64Array.from(a), dst = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) { let acc = 0; for (let k = -rad; k <= rad; k++) acc += src[clamp(i + k, 0, n - 1)]; dst[i] = acc / (2 * rad + 1); }
    const t = src; src = dst; dst = t;
  }
  return src;
}
/* resample a dense polyline every ~1 m: {X, Y, n (samples), ds, len}; closed loops drop the duplicate end */
function resample(D, closed) {
  const nd = D.length, segs = closed ? nd : nd - 1, cum = new Float64Array(segs + 1);
  for (let i = 0; i < segs; i++) { const a = D[i], b = D[(i + 1) % nd]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const len = cum[segs], N = Math.max(2, Math.round(len)), ds = len / N, cnt = closed ? N : N + 1;
  const X = new Float64Array(cnt), Y = new Float64Array(cnt);
  for (let i = 0, j = 0; i < cnt; i++) {
    const s = Math.min(len, i * ds); while (j < segs - 1 && cum[j + 1] < s) j++;
    const a = D[j], b = D[(j + 1) % nd], f = clamp((s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]), 0, 1);
    X[i] = a[0] + (b[0] - a[0]) * f; Y[i] = a[1] + (b[1] - a[1]) * f;
  }
  return { X, Y, N, ds, len, cum };
}

/* ---------- build ---------- */
function build(def) {
  const T = Object.assign({}, def), hw = def.width / 2;
  T.points = def.pts; T.hw = hw;
  const sp = spline(def.pts, 32), R0 = resample(sp.P, true), N = R0.N, ds = R0.ds, Ltot = R0.len, X = R0.X, Y = R0.Y;
  const TX = new Float64Array(N), TY = new Float64Array(N), ANG = new Float64Array(N), K = new Float64Array(N);
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N, dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1; TX[i] = dx / l; TY[i] = dy / l; ANG[i] = Math.atan2(dy, dx); }
  for (let i = 0; i < N; i++) K[i] = wrapA(ANG[(i + 1) % N] - ANG[(i - 1 + N) % N]) / (2 * ds);   /* + = turning right */
  const KS = blur(K, 6, 2);
  T.L = Ltot; T.N = N; T.ds = ds; T.X = X; T.Y = Y; T.TX = TX; T.TY = TY; T.ANG = ANG; T.K = KS;
  T.cpS = sp.cpAt.map(k => R0.cum[k]);
  T.at = (k, off) => (((T.cpS[k % T.cpS.length] + (off || 0)) % Ltot) + Ltot) % Ltot;
  const raw = new Float64Array(N); for (let i = 0; i < N; i++) raw[i] = clamp(KS[i] * 34, -1, 1);
  const lineO = blur(raw, 14, 3), LINE = new Float64Array(N);
  for (let i = 0; i < N; i++) LINE[i] = clamp(lineO[i] * hw * 0.7, -(hw - 2.4), hw - 2.4);
  T.LINE = LINE;
  const AH = new Float64Array(N); for (let i = 0; i < N; i++) { let m = 0; for (let k = 4; k < 34; k++) m = Math.max(m, Math.abs(KS[(i + k) % N])); AH[i] = m; }
  T.AHEAD = AH;
  T.pos = (s, lat, out) => { s = ((s % Ltot) + Ltot) % Ltot; const f = s / ds, i = Math.floor(f) % N, j = (i + 1) % N, u = f - Math.floor(f);
    const x = X[i] + (X[j] - X[i]) * u, y = Y[i] + (Y[j] - Y[i]) * u, tx = TX[i] + (TX[j] - TX[i]) * u, ty = TY[i] + (TY[j] - TY[i]) * u, tl = Math.hypot(tx, ty) || 1;
    out = out || {}; out.x = x - ty / tl * (lat || 0); out.y = y + tx / tl * (lat || 0); out.dir = Math.atan2(ty, tx); return out; };
  /* main distance field */
  const dist = new Float32Array(GN * GN).fill(1e9), near = new Uint16Array(GN * GN);
  stampLine(X, Y, N, true, hw + def.off + 3, dist, near);
  T.dist = dist; T.near = near; T.GN = GN; T.CELL = CELL; T.WS = WS;
  /* shortcuts */
  T.cuts = (def.cuts || []).map((cd, ci) => buildCut(T, cd, ci));
  const cdist = new Float32Array(GN * GN).fill(1e9), cnear = new Uint16Array(GN * GN), cg = new Uint8Array(GN * GN);
  for (const c of T.cuts) {
    const d2 = new Float32Array(GN * GN).fill(1e9), n2 = new Uint16Array(GN * GN);
    stampLine(c.X, c.Y, c.n, false, c.hw + c.verge + 3, d2, n2);
    for (let q = 0; q < GN * GN; q++) if (d2[q] < cdist[q]) { cdist[q] = d2[q]; cnear[q] = n2[q]; cg[q] = c.i + 1; }
  }
  T.cg = cg; T.cnear = cnear; T.cdist = cdist;
  /* the surface grid: the main band always wins, then cuts, then wall or void */
  const grid = new Uint8Array(GN * GN), beyond = def.edge === 'void' ? S_VOID : S_WALL;
  for (let q = 0; q < GN * GN; q++) {
    const d = dist[q];
    if (d <= hw + def.off) {
      grid[q] = d <= hw ? S_ROAD : S_OFF;
      /* a cut's road carries on across the main verge at its mouths (the cell stays main; only its surface is road) */
      if (grid[q] === S_OFF && cg[q]) { const c = T.cuts[cg[q] - 1]; if (cdist[q] <= c.hw) { const u = cnear[q] / (c.n - 1); if (!c.surf.some(r => u >= r[0] && u <= r[1] && r[2] === 'void')) grid[q] = S_ROAD; } }
      continue;
    }
    const ci = cg[q] - 1;
    if (ci >= 0) {
      const c = T.cuts[ci], e = cdist[q];
      if (e <= c.hw + c.verge) {
        let g = e <= c.hw ? S_ROAD : S_OFF; const u = cnear[q] / (c.n - 1);
        for (const r of c.surf) if (u >= r[0] && u <= r[1]) g = r[2] === 'rough' ? S_OFF : r[2] === 'belt' ? (e <= c.hw ? S_BELT : S_OFF) : S_VOID;
        grid[q] = g; continue;
      }
    }
    grid[q] = beyond;
  }
  T.grid = grid;
  /* boost pads and belts (main road) */
  T.boosts = [];
  const pads = (def.pads || []).map(p => ({ s: p[0] * Ltot, lat: p[1], len: p[2], w: 3.4, kind: 'pad' }));
  for (const f of def.belts || []) pads.push({ s: f * Ltot, lat: 0, len: 5, w: def.width - 1, kind: 'belt' });
  const tmp = {};
  for (const p of pads) {
    T.boosts.push(p);
    for (let a = 0; a <= p.len; a += 0.25) for (let b = -p.w / 2; b <= p.w / 2; b += 0.25) {
      T.pos(p.s + a, p.lat + b, tmp); const cx = (tmp.x / CELL) | 0, cy = (tmp.y / CELL) | 0;
      if (cx >= 0 && cy >= 0 && cx < GN && cy < GN && grid[cy * GN + cx] === S_ROAD) grid[cy * GN + cx] = S_BOOST;
    }
  }
  /* features */
  T.feats = [];
  const quadMain = (a0, a1, l0, l1) => [[a0, l0], [a0, l1], [a1, l1], [a1, l0]].map(([a, l]) => { const p = T.pos(a, l); return [p.x, p.y]; });
  for (const fd of def.feats || []) {
    const f = Object.assign({}, fd, { on: -1 });
    if (fd.k === 'ramp') { f.a0 = fd.f * Ltot; f.a1 = f.a0 + fd.len; }
    else if (fd.k === 'gap' || fd.k === 'ford' || fd.k === 'bumper') { f.a0 = fd.f0 * Ltot; f.a1 = fd.f1 * Ltot; f.l0 = f.l0 != null ? f.l0 : -(hw + def.off); f.l1 = f.l1 != null ? f.l1 : hw + def.off; }
    if (fd.k === 'gap' || fd.k === 'ford') { f.l0 = -(hw + def.off); f.l1 = hw + def.off; }
    if (fd.k === 'bumper') { f.l0 = fd.side < 0 ? -(hw + def.off) : hw; f.l1 = fd.side < 0 ? -hw : hw + def.off; }
    f.quad = quadMain(f.a0, f.a1, f.l0, f.l1);
    T.feats.push(f);
  }
  T.rainbows = (def.rainbows || []).map(f => f * Ltot);
  for (const s of T.rainbows) T.feats.push({ k: 'ring', on: -1, f: s / Ltot, a0: s - 0.5, a1: s + 0.8, l0: -3.5, l1: 3.5, quad: quadMain(s - 0.5, s + 0.8, -3.5, 3.5) });
  for (const c of T.cuts) for (const fd of c.def.feats || []) {
    const f = Object.assign({}, fd, { on: c.i });
    if (fd.k === 'ramp') { f.a0 = fd.u * c.len; f.a1 = f.a0 + fd.len; f.l0 = fd.l0 != null ? fd.l0 : -c.hw; f.l1 = fd.l1 != null ? fd.l1 : c.hw; }
    else if (fd.k === 'gap' || fd.k === 'block') { f.a0 = fd.u0 * c.len; f.a1 = fd.u1 * c.len; f.l0 = -(c.hw + c.verge); f.l1 = c.hw + c.verge; }
    else if (fd.k === 'bounce') { f.r = fd.r || 3.5; f.a0 = fd.u * c.len - f.r; f.a1 = fd.u * c.len + f.r; f.l0 = -f.r; f.l1 = f.r; const p = c.pos(fd.u * c.len, 0); f.x = p.x; f.y = p.y; }
    f.quad = [[f.a0, f.l0], [f.a0, f.l1], [f.a1, f.l1], [f.a1, f.l0]].map(([a, l]) => { const p = c.pos(a, l); return [p.x, p.y]; });
    c.feats.push(f); T.feats.push(f);
  }
  /* bounce targets (each cloud aims at the next one; the last at the main road) and the catapult's target */
  for (const c of T.cuts) {
    const discs = c.feats.filter(f => f.k === 'bounce');
    discs.forEach((f, j) => {
      if (f.to === 'exit' || j === discs.length - 1) { const p = T.pos(c.s1 + 16, c.lb); f.tx = p.x; f.ty = p.y; f.ts = (c.s1 + 16) % Ltot; f.exit = 1; }   /* spec sb·L + 4; +16 so the hops save their 1.4-2.2 s against the drifting main line */
      else { f.tx = discs[j + 1].x; f.ty = discs[j + 1].y; f.ts = c.mapS(discs[j + 1].a0 + discs[j + 1].r); }
    });
  }
  for (const f of T.feats) if (f.k === 'ramp' && f.aim) {
    const c = T.cuts.find(q => q.id === f.aim), d = c && c.feats.find(q => q.k === 'bounce');
    if (d) { f.tx = d.x; f.ty = d.y; f.ts = c.mapS(d.a0 + d.r); f.cut = c.i; }
  }
  /* stamp gaps (VOID over the band) and fords (OFF over the road) */
  const L1 = { ok: false };
  for (const f of T.feats) {
    if (f.k !== 'gap' && f.k !== 'ford') continue;
    const xs = f.quad.map(p => p[0]), ys = f.quad.map(p => p[1]);
    const x0 = Math.max(0, Math.floor((Math.min(...xs) - 2) / CELL)), x1 = Math.min(GN - 1, Math.ceil((Math.max(...xs) + 2) / CELL));
    const y0 = Math.max(0, Math.floor((Math.min(...ys) - 2) / CELL)), y1 = Math.min(GN - 1, Math.ceil((Math.max(...ys) + 2) / CELL));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const q = cy * GN + cx; locate(T, (cx + 0.5) * CELL, (cy + 0.5) * CELL, L1);
      if (!L1.ok || L1.cut !== f.on) continue;
      const a = f.on < 0 ? L1.s : L1.u; let da = a - f.a0; if (f.on < 0) da = ((da % Ltot) + Ltot) % Ltot;
      if (da < 0 || da > f.a1 - f.a0) continue;
      if (f.k === 'gap') { if (grid[q] !== S_WALL && L1.dist <= L1.lim) grid[q] = S_VOID; }
      else if (grid[q] === S_ROAD || grid[q] === S_BOOST) grid[q] = S_OFF;
    }
  }
  /* hazards: resolved onto their frame */
  T.hazards = (def.hazards || []).map(hd => {
    const h = Object.assign({}, hd), c = hd.on ? T.cuts.find(q => q.id === hd.on) : null;
    h.on = c ? c.i : -1;
    if (c) { if (hd.u0 != null) { h.a = (hd.u0 + hd.u1) / 2 * c.len; h.half = (hd.u1 - hd.u0) / 2 * c.len; } else h.a = hd.u * c.len; }
    else h.a = hd.f * Ltot;
    h.lat = hd.lat || 0;
    if (h.k === 'gust') h.src = -h.dir * (c ? c.hw + 2 : hw + def.off + 1.5);
    return h;
  });
  /* checkpoints, start, grid slots, surprise bubbles */
  T.NCP = 16; T.checkpoints = []; for (let k = 0; k < T.NCP; k++) T.checkpoints.push(k * Ltot / T.NCP);
  const st = T.pos(0, 0); T.start = { x: st.x, y: st.y, dir: st.dir };
  T.slots = []; for (let j = 0; j < 6; j++) { const row = j >> 1, side = j & 1 ? 1 : -1, p = T.pos(Ltot - 6 - row * 7.5 - (j & 1) * 3.5, side * hw * 0.42); T.slots.push({ x: p.x, y: p.y, dir: p.dir }); }
  T.items = [];
  /* a row on the main road beside a shortcut (the long way) gives +1 row of luck: the long way's reward (fix round 1) */
  const longWay = s => T.cuts.some(c => { const d = ((s - c.s0) % Ltot + Ltot) % Ltot; return d > 15 && d < c.span - 15; });
  for (const f of def.rows || []) { const s = f * Ltot, lw = longWay(s) ? 1 : 0; for (const q of [-0.6, -0.2, 0.2, 0.6]) { const p = T.pos(s, q * hw); T.items.push({ x: p.x, y: p.y, z: 0, s, sky: 0, long: lw }); } }
  for (const b of def.sky || []) { const s = b[0] * Ltot, p = T.pos(s, b[1]); T.items.push({ x: p.x, y: p.y, z: b[2], s, sky: 1 }); }
  T.deco = makeDeco(T);
  delete T.def;
  return T;
}

/* distance field of a polyline into (dist, near) within R of it */
function stampLine(X, Y, N, closed, R, dist, near) {
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % N, ax = X[i], ay = Y[i], bx = X[j], by = Y[j], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - R) / CELL)), x1 = Math.min(GN - 1, Math.ceil((Math.max(ax, bx) + R) / CELL));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - R) / CELL)), y1 = Math.min(GN - 1, Math.ceil((Math.max(ay, by) + R) / CELL));
    for (let cy = y0; cy <= y1; cy++) {
      const py = (cy + 0.5) * CELL;
      for (let cx = x0; cx <= x1; cx++) {
        const px = (cx + 0.5) * CELL; let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + dx * t - px, ey = ay + dy * t - py, d = Math.sqrt(ex * ex + ey * ey), c = cy * GN + cx;
        if (d < dist[c]) { dist[c] = d; near[c] = t < 0.5 ? i : j; }
      }
    }
  }
}

/* a shortcut: an open spline from a mouth on the main road to another, with phantom ends along the road tangent */
function buildCut(T, cd, ci) {
  const L = T.L, A = T.pos(cd.sa * L, cd.la), B = T.pos(cd.sb * L, cd.lb);
  const P = [[A.x, A.y], ...cd.pts, [B.x, B.y]];
  const Q = [[A.x - Math.cos(A.dir) * 10, A.y - Math.sin(A.dir) * 10], ...P, [B.x + Math.cos(B.dir) * 10, B.y + Math.sin(B.dir) * 10]];
  const dense = []; for (let i = 1; i < Q.length - 2; i++) crSeg(Q[i - 1], Q[i], Q[i + 1], Q[i + 2], 32, dense);
  dense.push([B.x, B.y]);
  const R = resample(dense, false), n = R.N + 1, X = R.X, Y = R.Y, ds = R.ds, len = R.len;
  const TX = new Float64Array(n), TY = new Float64Array(n), ANG = new Float64Array(n), K = new Float64Array(n);
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1; TX[i] = dx / l; TY[i] = dy / l; ANG[i] = Math.atan2(dy, dx); }
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); K[i] = b > a ? wrapA(ANG[b] - ANG[a]) / ((b - a) * ds) : 0; }
  const KS = blurOpen(K, 4, 2), raw = new Float64Array(n); for (let i = 0; i < n; i++) raw[i] = clamp(KS[i] * 34, -1, 1);
  const lineO = blurOpen(raw, 8, 3), LINE = new Float64Array(n), lim = Math.max(0, cd.hw - 1.6);
  for (let i = 0; i < n; i++) LINE[i] = clamp(lineO[i] * cd.hw * 0.6, -lim, lim);
  const AH = new Float64Array(n); for (let i = 0; i < n; i++) { let m = 0; for (let k = 4; k < 34; k++) m = Math.max(m, Math.abs(KS[Math.min(n - 1, i + k)])); AH[i] = m; }
  const span = ((cd.sb - cd.sa) * L % L + L) % L, s0 = cd.sa * L, s1 = cd.sb * L;
  const c = { id: cd.id, name: cd.name, i: ci, def: cd, sa: cd.sa, la: cd.la, sb: cd.sb, lb: cd.lb, s0, s1, span, len, n, ds, hw: cd.hw, verge: cd.verge || 0,
    edge: cd.edge || T.edge, surf: cd.surf || [], rail: cd.rail || [], ai: cd.ai || {}, X, Y, TX, TY, ANG, K: KS, LINE, AHEAD: AH, feats: [] };
  c.pos = (u, lat, out) => { const f = clamp(u / ds, 0, n - 1.000001), i = Math.floor(f), j = Math.min(n - 1, i + 1), w = f - i;
    const x = X[i] + (X[j] - X[i]) * w, y = Y[i] + (Y[j] - Y[i]) * w, tx = TX[i] + (TX[j] - TX[i]) * w, ty = TY[i] + (TY[j] - TY[i]) * w, tl = Math.hypot(tx, ty) || 1;
    out = out || {}; out.x = x - ty / tl * (lat || 0); out.y = y + tx / tl * (lat || 0); out.dir = Math.atan2(ty, tx); return out; };
  c.mapS = u => ((s0 + clamp(u, 0, len) / len * span) % L + L) % L;
  return c;
}

/* ---------- lookups (no allocation in locate) ---------- */
function locate(T, x, y, out) {
  out.surf = T.edge === 'void' ? S_VOID : S_WALL; out.ok = false; out.cut = -1; out.u = 0; out.hw = T.hw; out.lim = T.hw + T.off; out.ang = 0;
  if (!(x === x && y === y)) return out;
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  if (cx < 0 || cy < 0 || cx >= GN || cy >= GN) return out;
  const c = cy * GN + cx, md = T.dist[c], ci = T.cg ? T.cg[c] - 1 : -1;
  out.surf = T.grid[c];
  let useCut = false;
  if (ci >= 0 && md > T.hw + T.off) {
    const C = T.cuts[ci], cd = T.cdist[c];
    if (cd <= C.hw + C.verge) useCut = true;
    else if (md > 1e8 || cd - (C.hw + C.verge) < md - (T.hw + T.off)) useCut = true;   /* wall / void cell: the nearer band */
  }
  if (useCut) {
    const C = T.cuts[ci], X = C.X, Y = C.Y, n = C.n, i0 = T.cnear[c];
    let best = 1e18, bi = 0, bt = 0;
    for (let k = -3; k <= 2; k++) {
      const a = i0 + k; if (a < 0 || a >= n - 1) continue;
      const b = a + 1, dx = X[b] - X[a], dy = Y[b] - Y[a], l2 = dx * dx + dy * dy || 1e-9;
      let t = ((x - X[a]) * dx + (y - Y[a]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = X[a] + dx * t - x, ey = Y[a] + dy * t - y, d = ex * ex + ey * ey;
      if (d < best) { best = d; bi = a; bt = t; }
    }
    const j = bi + 1, px = X[bi] + (X[j] - X[bi]) * bt, py = Y[bi] + (Y[j] - Y[bi]) * bt, tx = C.TX[bi], ty = C.TY[bi];
    out.ok = true; out.cut = ci; out.u = (bi + bt) * C.ds; out.hw = C.hw; out.lim = C.hw + C.verge; out.ang = C.ANG[bi];
    out.dist = Math.sqrt(best); out.d = (x - px) * -ty + (y - py) * tx; out.cx = px; out.cy = py;
    out.s = C.mapS(out.u); out.f = out.s / T.L; out.i = Math.floor(out.s / T.ds) % T.N;
    return out;
  }
  if (md > 1e8) return out;
  const N = T.N, X = T.X, Y = T.Y, i0 = T.near[c];
  let best = 1e18, bi = i0, bt = 0;
  for (let k = -3; k <= 2; k++) {
    const a = (i0 + k + N) % N, b = (a + 1) % N, dx = X[b] - X[a], dy = Y[b] - Y[a], l2 = dx * dx + dy * dy || 1e-9;
    let t = ((x - X[a]) * dx + (y - Y[a]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = X[a] + dx * t - x, ey = Y[a] + dy * t - y, d = ex * ex + ey * ey;
    if (d < best) { best = d; bi = a; bt = t; }
  }
  const j = (bi + 1) % N, px = X[bi] + (X[j] - X[bi]) * bt, py = Y[bi] + (Y[j] - Y[bi]) * bt, tx = T.TX[bi], ty = T.TY[bi];
  out.ok = true; out.i = bi; out.s = (bi + bt) * T.ds; out.f = out.s / T.L; out.dist = Math.sqrt(best);
  out.d = (x - px) * -ty + (y - py) * tx; out.cx = px; out.cy = py; out.ang = T.ANG[bi];
  return out;
}
SK.locate = locate;
SK.surfaceAt = (T, x, y) => SURF[locate(T, x, y, {}).surf] || 'void';
SK.progress = (T, x, y) => { const o = locate(T, x, y, {}); return o.ok ? { s: o.s, f: o.f, i: o.i, d: o.d, dist: o.dist, cut: o.cut, u: o.u } : null; };
SK.SURF = { OFF: S_OFF, ROAD: S_ROAD, WALL: S_WALL, BOOST: S_BOOST, VOID: S_VOID, BELT: S_BELT, names: SURF };
SK.WORLD = { WS, CELL, GN, TS, TPM };

/* ---------- hazards: pure functions of the race clock ---------- */
const HAZ_START = 480;
function hazState(T, h, clock, out) {
  out = out || { ph: 0, fr: 0, n: 0, x: [0, 0, 0, 0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0, 0, 0, 0], z: [0, 0, 0, 0, 0, 0, 0, 0], lat: [0, 0, 0, 0, 0, 0, 0, 0], rot: [0, 0, 0, 0, 0, 0, 0, 0] };
  const C = h.on >= 0 ? T.cuts[h.on] : null, P = hazState.p || (hazState.p = {});   /* no closure per call (fix round 1: the sim calls this often) */
  out.ph = 0; out.fr = 0; out.n = 0;
  const live = clock >= HAZ_START;
  if (h.k === 'mover' && h.path === 'cross') {
    const span = Math.abs(h.l1 - h.l0), life = span / h.sp * 60, dir = h.l1 > h.l0 ? 1 : -1;
    if (!live) return out;
    /* object m spawns at T_m = m*every - off; alive while it is between l0 and l1 */
    const m1 = Math.floor((clock + h.off) / h.every), m0 = Math.max(0, Math.ceil((clock + h.off - life) / h.every));
    for (let m = m1; m >= m0 && out.n < 8; m--) {
      const t0 = m * h.every - h.off; if (t0 < HAZ_START) continue;
      const age = clock - t0; if (age < 0 || age > life) continue;
      const lat = h.l0 + dir * h.sp * age / 60, p = (C ? C.pos(h.a, lat, P) : T.pos(h.a, lat, P)), j = out.n++;
      out.x[j] = p.x; out.y[j] = p.y; out.z[j] = h.r; out.lat[j] = lat; out.rot[j] = h.sp * age / 60 / h.r;
    }
    out.ph = out.n ? 2 : 0; out.fr = 0;
    return out;
  }
  if (h.k === 'mover' && h.path === 'swing') {
    const lat = h.lat + h.amp * Math.sin(TAU * (clock + h.off) / h.per), p = (C ? C.pos(h.a, lat, P) : T.pos(h.a, lat, P));
    out.n = 1; out.x[0] = p.x; out.y[0] = p.y; out.z[0] = 1.2; out.lat[0] = lat; out.rot[0] = Math.cos(TAU * (clock + h.off) / h.per) * 0.5;
    out.ph = live ? 2 : 0; out.fr = 0;
    return out;
  }
  if (live) {
    const t = ((clock + h.off) % h.per + h.per) % h.per;
    if (t < h.tell) { out.ph = 1; out.fr = t / h.tell; }
    else if (t < h.tell + h.act) { out.ph = 2; out.fr = (t - h.tell) / h.act; }
    else { out.ph = 0; out.fr = (t - h.tell - h.act) / Math.max(1, h.per - h.tell - h.act); }
  }
  let lat = h.lat, z = 0;
  if (h.skin === 'rain') { lat = h.lat + h.amp * Math.sin(TAU * clock / h.sway); z = 6; }
  else if (h.k === 'gust') lat = h.src;
  else if (h.k === 'piston') z = out.ph === 2 ? Math.min(1, out.fr * 6) * 0.8 : 0;
  const p = (C ? C.pos(h.a, lat, P) : T.pos(h.a, lat, P));
  out.n = 1; out.x[0] = p.x; out.y[0] = p.y; out.z[0] = z; out.lat[0] = lat; out.rot[0] = 0;
  return out;
}
SK.hazState = hazState;
SK.HAZ_START = HAZ_START;

/* ---------- scenery (billboards); none of it stands where a kart can drive ---------- */
function makeDeco(T) {
  const out = [], hw = T.hw, edgeD = hw + T.off, tmp = {}, GNn = GN;
  const cutClear = (c, need) => { if (!T.cg[c]) return true; const C = T.cuts[T.cg[c] - 1]; return T.cdist[c] >= C.hw + C.verge + need; };
  const freeAt = (x, y, need, cneed) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 1 || cy < 1 || cx >= GNn - 1 || cy >= GNn - 1) return x > -30 && y > -30 && x < WS + 30 && y < WS + 30;
    const c = cy * GNn + cx; return T.dist[c] >= need && cutClear(c, cneed != null ? cneed : 0.6);
  };
  const add = o => { out.push(o); return o; };
  const inRange = (s, a, b) => a <= b ? s >= a && s <= b : s >= a || s <= b;
  if (T.theme === 'meadows') {
    const t0 = T.at(T.tunnel[0], T.tunnel[1]), t1 = T.at(T.tunnel[2], T.tunnel[3]);
    for (let s = 0; s < T.L; s += 3.5) {
      const tun = inRange(s, t0, t1);
      for (const side of [-1, 1]) {
        if (!tun && hash(s * 7 | 0, side + 5) < 0.12) continue;
        const lat = side * (edgeD + (tun ? 0.9 : 1.6)), p = T.pos(s, lat, tmp);
        if (!freeAt(p.x, p.y, edgeD + 0.7)) continue;
        if (tun) add({ k: side < 0 ? 'sunL' : 'sunR', x: p.x, y: p.y, w: 6.2, h: 8.0, side });
        else if (((s / 3.5) | 0) % 2 === 0) add({ k: 'bush', x: p.x, y: p.y, w: 3.6 + hash(s | 0, side) * 0.9, h: 2.6 });
      }
    }
    for (let i = 0; i < 140 && out.length < 420; i++) {
      const x = 6 + hash(i, 11) * 244, y = 6 + hash(i, 23) * 244;
      if (!freeAt(x, y, edgeD + 6, 5)) continue;
      const r = hash(i, 31); add(r < 0.55 ? { k: 'tree', x, y, w: 7, h: 8.5 } : r < 0.75 ? { k: 'pumpkin', x, y, w: 2.4, h: 1.8 } : r < 0.9 ? { k: 'cabbage', x, y, w: 2.2, h: 1.6 } : { k: 'sunflower', x, y, w: 2.6, h: 5 });
    }
  } else if (T.theme === 'skyway') {
    for (let s = 0; s < T.L; s += 9) for (const side of [-1, 1]) {
      const h = hash(s | 0, side + 9); if (h < 0.35) continue;
      const lamp = h > 0.8, p = T.pos(s, side * (edgeD + (lamp ? 1.2 : 4.5 + h * 3)), tmp); if (!freeAt(p.x, p.y, edgeD + (lamp ? 0.8 : 3.5), lamp ? 0.8 : 3)) continue;
      add(lamp ? { k: 'lamp', x: p.x, y: p.y, w: 1.6, h: 5.5 } : { k: h > 0.58 ? 'puffP' : 'puffB', x: p.x, y: p.y, w: 3.6 + h * 2, h: 2.5 + h * 1.4 });
    }
    for (const s of T.rainbows) { const p = T.pos(s, 0, tmp); add({ k: 'rainbow', x: p.x, y: p.y, w: T.width + 7, h: 10.6, gate: 1 }); }
    for (let i = 0; i < 40; i++) { const x = hash(i, 5) * 256, y = hash(i, 6) * 256; if (freeAt(x, y, edgeD + 10, 8)) add({ k: hash(i, 7) < 0.5 ? 'balloons' : 'puffP', x, y, w: hash(i, 7) < 0.5 ? 3 : 9, h: 6, z: 2 + hash(i, 8) * 6 }); }
  } else {
    for (let s = 0; s < T.L; s += 8) for (const side of [-1, 1]) {
      const p = T.pos(s, side * (edgeD + 1.0), tmp); if (!freeAt(p.x, p.y, edgeD + 0.6)) continue;
      add({ k: 'post', x: p.x, y: p.y, w: 1.4, h: 2.4 });
    }
    for (const c of T.chimneys || []) if (freeAt(c[0], c[1], edgeD + 3, 3)) add({ k: 'chimney', x: c[0], y: c[1], w: 6, h: 18, smoke: 1 });
    for (const g of T.gears || []) {
      const s = T.at(g, 0), k = T.K[Math.floor(s / T.ds) % T.N], side = k > 0 ? 1 : -1, p = T.pos(s, side * (edgeD + 5), tmp);
      if (freeAt(p.x, p.y, edgeD + 1, 4.5)) add({ k: 'gear', x: p.x, y: p.y, w: 9, h: 9, spin: side });
    }
    for (let i = 0; i < 90; i++) { const x = hash(i, 15) * 256, y = hash(i, 16) * 256; if (freeAt(x, y, edgeD + 5, 4)) add({ k: hash(i, 17) < 0.6 ? 'crate' : 'pipe', x, y, w: hash(i, 17) < 0.6 ? 2.6 : 4, h: hash(i, 17) < 0.6 ? 2.4 : 3.2 }); }
  }
  /* v2: the shortcuts' dressing */
  for (const c of T.cuts) {
    const ce = c.hw + c.verge;
    /* the barrier between the cut and the main road (where it is narrower than 5 m), and the cut's own walls */
    if (c.edge === 'wall') {
      const kind = T.theme === 'works' ? 'post' : 'bush', step = T.theme === 'works' ? 4 : 3.5;
      for (let u = 0; u <= c.len; u += step) for (const side of [-1, 1]) {
        c.pos(u, side * (ce + 0.7), tmp); const cx = Math.floor(tmp.x / CELL), cy = Math.floor(tmp.y / CELL); if (cx < 0 || cy < 0 || cx >= GN || cy >= GN) continue;
        const q = cy * GN + cx, md = T.dist[q] - edgeD;
        if (md < 0.4) continue;
        if (T.cg[q] && T.cg[q] - 1 !== c.i) continue;
        if (T.cdist[q] < ce + 0.4) continue;
        if (md < 5) {   /* barrier: put the deco in its middle */
          const bx = tmp.x, by = tmp.y, mid = Math.min(md / 2, 2.2); c.pos(u, side * (ce + 0.3 + mid), tmp);
          if (T.dist[Math.floor(tmp.y / CELL) * GN + Math.floor(tmp.x / CELL)] < edgeD + 0.3) { tmp.x = bx; tmp.y = by; }
        }
        add(kind === 'post' ? { k: 'post', x: tmp.x, y: tmp.y, w: 1.4, h: 2.4 } : { k: 'bush', x: tmp.x, y: tmp.y, w: 3.0 + hash(u | 0, side + c.i) * 0.8, h: 2.4 });
      }
    }
    /* a sign at the mouth: on the nose between the cut and the main road */
    let su = -1; for (let u = 4; u < c.len * 0.5; u += 1) { c.pos(u, 0, tmp); const q = Math.floor(tmp.y / CELL) * GN + Math.floor(tmp.x / CELL); if (T.dist[q] - edgeD - ce > 2.2) { su = u; break; } }
    if (su > 0) {   /* the nose lies on the main-road side of the cut */
      const side = c.la < 0 ? 1 : -1, q = c.pos(su, side * (ce + 1.2));
      add({ k: 'sign', x: q.x, y: q.y, w: 6.4, h: 5.0, text: c.id === 'bridge' ? 'BRIDGE' : c.name, cut: c.i });   /* fix round 1: bigger boards */
    }
  }
  if (T.id === 'meadows') {
    const c = T.cuts[0];
    for (let u = 0.50 * c.len; u <= 0.79 * c.len; u += 6) for (const side of [-1, 1]) { const p = c.pos(u, side * (c.hw + c.verge + 0.5)); if (freeAt(p.x, p.y, edgeD + 2.5, 0)) add({ k: 'glass', x: p.x, y: p.y, w: 3.2, h: 5.0, side }); }   /* not right by the main road */
    for (const h of T.hazards) if (h.skin === 'basket') { const p = c.pos(h.a, 0); add({ k: 'beam', x: p.x, y: p.y, w: 2 * (c.hw + c.verge) + 1.6, h: 5.2, haz: T.hazards.indexOf(h) }); }
    for (const r of c.surf) if (r[2] === 'rough') for (let u = r[0] * c.len; u <= r[1] * c.len; u += 3) for (const side of [-1, 1]) { const p = c.pos(u, side * (c.hw + c.verge + 0.9)); if (freeAt(p.x, p.y, edgeD + 0.8, 0.3)) add({ k: 'cabbage', x: p.x, y: p.y, w: 2.0, h: 1.5 }); }
    T.hazards.forEach((h, j) => { if (h.skin === 'pumpkin') { const p = T.pos(h.a, 15); add({ k: 'pumpkinpile', x: p.x, y: p.y, w: 5, h: 2.8, haz: j }); } });
    const pp = T.hazards.find(h => h.skin === 'pumpkin'); if (pp) { const p = T.pos(pp.a - 14, hw + T.off + 1.4); add({ k: 'sign', x: p.x, y: p.y, w: 6.4, h: 5.0, text: 'PUMPKINS!' }); }
  }
  if (T.id === 'skyway') {
    T.hazards.forEach((h, j) => { if (h.k === 'gust') { const C = h.on >= 0 ? T.cuts[h.on] : null, p = C ? C.pos(h.a, h.src) : T.pos(h.a, h.src); add({ k: 'windsock', x: p.x, y: p.y, w: 2.4, h: 5.0, dir: h.dir, haz: j }); } });
    const br = T.cuts.find(c => c.id === 'bridge');
    /* lamps at the bridge's ends: searched inwards from each mouth to the first spot well clear of the main road (fix round 1:
       two stood on the main road at u 3 and len - 3, where the bridge still overlaps it) */
    if (br) for (const end of [0, 1]) for (const side of [-1, 1]) for (let j = 3; j < br.len * 0.4; j += 0.5) {
      const u = end ? br.len - j : j, p = br.pos(u, side * (br.hw + 0.6)), cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
      if (cx < 0 || cy < 0 || cx >= GN || cy >= GN) continue;
      if (T.dist[cy * GN + cx] - edgeD > 1.5) { add({ k: 'lampB', x: p.x, y: p.y, w: 1.6, h: 5.5 }); break; }
    }
  }
  for (const f of T.feats) {
    if (f.k === 'ramp') {
      const C = f.on >= 0 ? T.cuts[f.on] : null, P = (a, l) => C ? C.pos(a, l) : T.pos(a, l);
      for (const side of [-1, 1]) { const p = P((f.a0 + f.a1) / 2, side < 0 ? f.l0 - 0.6 : f.l1 + 0.6); add({ k: 'rampSide', x: p.x, y: p.y, w: 1.8, h: 1.3, skin: f.skin, side }); }
    } else if (f.k === 'block') {
      const C = T.cuts[f.on], p = C.pos((f.a0 + f.a1) / 2, 0); add({ k: 'crates', x: p.x, y: p.y, w: 2 * C.hw, h: 0.9 });
    }
  }
  const a = T.pos(T.at(T.arch || 0, 0), 0, tmp); add({ k: 'arch', x: a.x, y: a.y, w: T.width + 5, h: 7.5, gate: 1 });
  return out;
}

SK.TRACKS = DEFS.map(build);
SK.trackById = id => SK.TRACKS.find(t => t.id === id) || SK.TRACKS[0];

/* ================= the floor texture (browser only) ================= */
const PAL = { ink: '#2b2140', plum: '#4a3a6b', cream: '#fff6e0', sun: '#ffd93b' };
function centrePath(T, lat) {
  const p = new Path2D();
  for (let i = 0; i <= T.N; i++) { const k = i % T.N, x = T.X[k] - T.TY[k] * (lat || 0), y = T.Y[k] + T.TX[k] * (lat || 0); if (i) p.lineTo(x, y); else p.moveTo(x, y); }
  p.closePath(); return p;
}
function runs(T, test) { const r = []; let st = -1; for (let i = 0; i <= T.N; i++) { const on = i < T.N && test(i); if (on && st < 0) st = i; if (!on && st >= 0) { r.push([st, i]); st = -1; } } return r; }
function offsetLine(g, T, i0, i1, lat) { g.beginPath(); for (let i = i0; i <= i1; i++) { const k = i % T.N; const x = T.X[k] - T.TY[k] * lat, y = T.Y[k] + T.TX[k] * lat; if (i === i0) g.moveTo(x, y); else g.lineTo(x, y); } }
function across(g, T, s, fn) { const p = T.pos(s, 0); g.save(); g.translate(p.x, p.y); g.rotate(p.dir); fn(g); g.restore(); }
function blob(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function startLine(g, T, a, b) {
  across(g, T, 0, q => { const hw = T.hw; for (let r = 0; r < 2; r++) for (let k = 0; k < Math.ceil(hw * 2); k++) { q.fillStyle = (k + r) & 1 ? a : b; q.fillRect(-1 + r, -hw + k, 1, Math.min(1, hw * 2 - k)); } });
  for (const sl of T.slots) { const p = SK.progress(T, sl.x, sl.y); if (!p) continue; across(g, T, p.s, q => { q.strokeStyle = 'rgba(255,255,255,.85)'; q.lineWidth = 0.28; q.beginPath(); q.moveTo(1.6, p.d - 1.1); q.lineTo(2.2, p.d - 1.1); q.lineTo(2.2, p.d + 1.1); q.lineTo(1.6, p.d + 1.1); q.stroke(); }); }
}
function chevrons(g, T, b, c1, c2) {
  across(g, T, b.s, q => {
    q.fillStyle = c2; q.fillRect(0, b.lat - b.w / 2, b.len, b.w);
    q.fillStyle = c1; const n = Math.max(2, Math.round(b.len / 1.6));
    for (let k = 0; k < n; k++) { const x = 0.3 + k * (b.len - 0.6) / n; q.beginPath(); q.moveTo(x, b.lat - b.w / 2 + 0.3); q.lineTo(x + 0.9, b.lat); q.lineTo(x, b.lat + b.w / 2 - 0.3); q.lineTo(x + 0.6, b.lat + b.w / 2 - 0.3); q.lineTo(x + 1.5, b.lat); q.lineTo(x + 0.6, b.lat - b.w / 2 + 0.3); q.closePath(); q.fill(); }
    q.strokeStyle = PAL.ink; q.lineWidth = 0.22; q.strokeRect(0, b.lat - b.w / 2, b.len, b.w);
  });
}
function kerbs(g, T, a, b, wid) {
  const hw = T.hw, list = runs(T, i => Math.abs(T.K[i]) > 0.011);
  for (const [i0, i1] of list) for (const side of [-1, 1]) {
    offsetLine(g, T, Math.max(0, i0 - 3), i1 + 3, side * (hw - wid / 2));
    g.lineWidth = wid; g.setLineDash([]); g.strokeStyle = b; g.stroke(); g.setLineDash([1.4, 1.4]); g.strokeStyle = a; g.stroke(); g.setLineDash([]);
  }
}
/* a plain stand-in for the v2 floor features, used only until SK.Render.paintV2 exists */
function paintV2Fallback(g, T) {
  const sky = T.edge === 'void';
  for (const c of T.cuts) {
    const p = new Path2D(); for (let i = 0; i < c.n; i++) { if (i) p.lineTo(c.X[i], c.Y[i]); else p.moveTo(c.X[i], c.Y[i]); }
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (c.verge) { g.strokeStyle = sky ? '#fff4fb' : T.theme === 'works' ? '#8c879a' : '#8ad460'; g.lineWidth = (c.hw + c.verge) * 2; g.stroke(p); }
    const allVoid = c.surf.some(r => r[0] <= 0 && r[1] >= 1 && r[2] === 'void');
    if (!allVoid) { g.strokeStyle = sky ? '#d6c8ff' : T.theme === 'works' ? '#a3abc8' : '#e8cc9c'; g.lineWidth = c.hw * 2; g.stroke(p); }
  }
  for (const f of T.feats) {
    if (!f.quad) continue;
    const col = f.k === 'gap' ? '#9cc8ff' : f.k === 'ford' ? '#6fb8e8' : f.k === 'ramp' ? '#c8935a' : f.k === 'bounce' ? '#ffffff' : f.k === 'block' ? '#8a6a4a' : null;
    if (!col) continue;
    g.fillStyle = col;
    if (f.k === 'bounce') { g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.fill(); continue; }
    g.beginPath(); f.quad.forEach((q, j) => j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); g.fill();
  }
}
const PAINT = {
  meadows(g, T) {
    const hw = T.hw, ed = hw + T.off;
    g.fillStyle = '#6fbf52'; g.fillRect(0, 0, WS, WS);
    const crops = [['#b98a5a', '#7cc65a', 'rows'], ['#f2d65a', '#9fd36a', 'dots'], ['#b9a2e8', '#8f78c8', 'rows'], ['#e8d68a', '#d2b45e', 'lines'], ['#86cf5e', '#ffffff', 'dots'], ['#a8d870', '#ff9a45', 'dots'], ['#c79a68', '#5fb04a', 'rows']];
    for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
      const c = crops[Math.floor(hash(fx, fy + 40) * crops.length)], x = fx * 32 + 1.5, y = fy * 32 + 1.5, w = 29, h = 29;
      g.fillStyle = c[0]; g.fillRect(x, y, w, h); g.fillStyle = c[1];
      if (c[2] === 'rows') for (let k = 1.5; k < w; k += 3) { g.fillRect(x + k, y + 1, 1, h - 2); }
      else if (c[2] === 'lines') for (let k = 1; k < h; k += 1.6) g.fillRect(x + 0.5, y + k, w - 1, 0.35);
      else for (let k = 0; k < 160; k++) { blob(g, x + 1 + hash(k, fx * 9 + fy) * (w - 2), y + 1 + hash(k + 400, fy * 9 + fx) * (h - 2), 0.35 + hash(k, 3) * 0.3, c[1]); g.fillStyle = c[1]; }
    }
    g.fillStyle = '#3d9a4a'; for (let k = 0; k <= 8; k++) { g.fillRect(k * 32 - 1.5, 0, 3, WS); g.fillRect(0, k * 32 - 1.5, WS, 3); }
    g.lineJoin = 'round'; g.lineCap = 'round';
    const C = centrePath(T, 0);
    g.strokeStyle = '#2f8f4a'; g.lineWidth = (ed + 3.4) * 2; g.stroke(C);
    for (const side of [-1, 1]) for (let i = 0; i < T.N; i += 2) { const lat = side * (ed + 1.6 + hash(i, side + 3) * 1.4), x = T.X[i] - T.TY[i] * lat, y = T.Y[i] + T.TX[i] * lat; blob(g, x, y, 1.5 + hash(i, 9) * 0.8, hash(i, side) < 0.5 ? '#3fa356' : '#287a40'); }
    g.strokeStyle = '#8ad460'; g.lineWidth = ed * 2; g.stroke(C);
    for (let i = 0; i < 2600; i++) { const s = hash(i, 1) * T.L, side = hash(i, 2) < 0.5 ? -1 : 1, lat = side * (hw + 0.8 + hash(i, 3) * (T.off - 1.3)), p = T.pos(s, lat); const col = ['#ffffff', '#fff3a0', '#ffd0e0', '#b6f07a', '#d7c4ff'][i % 5]; blob(g, p.x, p.y, 0.16 + hash(i, 4) * 0.12, col); }
    g.strokeStyle = '#c99c66'; g.lineWidth = hw * 2 + 0.7; g.stroke(C);
    g.strokeStyle = '#e8cc9c'; g.lineWidth = hw * 2 - 0.5; g.stroke(C);
    for (let i = 0; i < 1400; i++) { const p = T.pos(hash(i, 21) * T.L, (hash(i, 22) - 0.5) * (hw * 2 - 2)); blob(g, p.x, p.y, 0.12 + hash(i, 23) * 0.18, hash(i, 24) < 0.5 ? '#d8b882' : '#f4dcae'); }
    kerbs(g, T, '#ff7a8a', PAL.cream, 1.0);
    const t0 = T.at(T.tunnel[0], T.tunnel[1]), t1 = T.at(T.tunnel[2], T.tunnel[3]);
    for (let s = t0; s < (t1 < t0 ? t1 + T.L : t1); s += 3.5) across(g, T, s, q => { q.fillStyle = 'rgba(60,90,30,.16)'; q.beginPath(); q.ellipse(0, 0, 1.3, hw + 1.5, 0, 0, TAU); q.fill(); });
    for (const b of T.boosts) chevrons(g, T, b, '#ffd93b', '#ff8a3d');
    startLine(g, T, PAL.cream, PAL.plum);
  },
  skyway(g, T) {
    const hw = T.hw, ed = hw + T.off, gr = g.createLinearGradient(0, 0, WS, WS);
    gr.addColorStop(0, '#8fd0ff'); gr.addColorStop(0.5, '#9cc8ff'); gr.addColorStop(1, '#a8d4ff'); g.fillStyle = gr; g.fillRect(0, 0, WS, WS);
    for (let i = 0; i < 90; i++) { const x = hash(i, 1) * WS, y = hash(i, 2) * WS, r = 3 + hash(i, 3) * 9; g.globalAlpha = 0.45; for (let k = 0; k < 5; k++) blob(g, x + (k - 2) * r * 0.6, y + Math.sin(k * 2.1) * r * 0.25, r * (0.6 + 0.2 * Math.cos(k)), '#ffffff'); g.globalAlpha = 1; }
    g.lineJoin = 'round'; g.lineCap = 'round';
    const C = centrePath(T, 0);
    g.strokeStyle = 'rgba(120,90,200,.25)'; g.lineWidth = ed * 2 + 3; g.stroke(C);
    g.strokeStyle = '#fff4fb'; g.lineWidth = ed * 2; g.stroke(C);
    for (const side of [-1, 1]) for (let i = 0; i < T.N; i++) { const lat = side * (ed - 0.6 - hash(i, side) * 0.8), x = T.X[i] - T.TY[i] * lat, y = T.Y[i] + T.TX[i] * lat; blob(g, x, y, 1.0 + hash(i, 3) * 0.9, hash(i, side + 7) < 0.4 ? '#ffd6ec' : '#ffffff'); }
    /* candyfloss kerbs: pink and white, all the way round (v1's rainbow edge stripes are gone, review A17) */
    g.strokeStyle = PAL.plum; g.lineWidth = hw * 2 + 0.5; g.stroke(C);
    g.strokeStyle = '#ffffff'; g.lineWidth = hw * 2 + 0.1; g.stroke(C);
    g.setLineDash([1.6, 1.6]); g.strokeStyle = '#ff8fc8'; g.stroke(C); g.setLineDash([]);
    g.strokeStyle = '#d6c8ff'; g.lineWidth = hw * 2 - 1.8; g.stroke(C);
    for (let i = 0; i < 1600; i++) { const p = T.pos(hash(i, 21) * T.L, (hash(i, 22) - 0.5) * (hw * 2 - 3)); blob(g, p.x, p.y, 0.1 + hash(i, 23) * 0.14, hash(i, 24) < 0.5 ? '#c6b4ff' : '#ece4ff'); }
    g.setLineDash([2.4, 2.4]); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.45; g.stroke(C); g.setLineDash([]);
    for (const b of T.boosts) chevrons(g, T, b, '#ffffff', '#ff7ac0');
    startLine(g, T, '#ffffff', PAL.plum);
  },
  works(g, T) {
    const hw = T.hw, ed = hw + T.off;
    g.fillStyle = '#5f6380'; g.fillRect(0, 0, WS, WS);
    for (let y = 0; y < WS; y += 8) for (let x = 0; x < WS; x += 8) { g.fillStyle = hash(x, y) < 0.5 ? '#666a88' : '#585c78'; g.fillRect(x + 0.2, y + 0.2, 7.6, 7.6); for (const [a, b] of [[0.9, 0.9], [7.1, 0.9], [0.9, 7.1], [7.1, 7.1]]) blob(g, x + a, y + b, 0.25, '#8a8eaa'); }
    g.lineJoin = 'round'; g.lineCap = 'round';
    const C = centrePath(T, 0);
    g.strokeStyle = PAL.plum; g.lineWidth = (ed + 2) * 2; g.stroke(C);
    g.setLineDash([1.6, 1.6]); g.strokeStyle = '#ffd93b'; g.stroke(C); g.setLineDash([]);
    g.strokeStyle = '#8c879a'; g.lineWidth = ed * 2; g.stroke(C);
    for (let i = 0; i < 2600; i++) { const s = hash(i, 1) * T.L, side = hash(i, 2) < 0.5 ? -1 : 1, p = T.pos(s, side * (hw + 0.6 + hash(i, 3) * (T.off - 1))); blob(g, p.x, p.y, 0.12 + hash(i, 4) * 0.2, hash(i, 5) < 0.5 ? '#77728a' : '#a29db0'); }
    g.strokeStyle = '#4a4d66'; g.lineWidth = hw * 2 + 0.6; g.stroke(C);
    g.strokeStyle = '#a3abc8'; g.lineWidth = hw * 2 - 0.6; g.stroke(C);
    for (let i = 0; i < 1400; i++) { const p = T.pos(hash(i, 21) * T.L, (hash(i, 22) - 0.5) * (hw * 2 - 2)); blob(g, p.x, p.y, 0.1 + hash(i, 23) * 0.15, hash(i, 24) < 0.5 ? '#949cba' : '#b8c0da'); }
    kerbs(g, T, '#ffd93b', PAL.plum, 0.9);
    g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255,246,224,.7)'; g.lineWidth = 0.4; g.stroke(centrePath(T, -hw / 3)); g.stroke(centrePath(T, hw / 3)); g.setLineDash([]);
    for (const b of T.boosts) {
      if (b.kind === 'belt') across(g, T, b.s, q => { q.fillStyle = '#34324a'; q.fillRect(-0.3, -b.w / 2 - 0.3, b.len + 0.6, b.w + 0.6); q.fillStyle = '#4c4966'; for (let k = 0; k < b.len; k += 0.5) q.fillRect(k, -b.w / 2, 0.22, b.w); q.fillStyle = '#ffd93b'; for (let k = -b.w / 2 + 1.5; k < b.w / 2 - 1; k += 3) { q.beginPath(); q.moveTo(0.8, k - 1); q.lineTo(2.4, k + 0.2); q.lineTo(0.8, k + 1.4); q.lineTo(1.6, k + 1.4); q.lineTo(3.2, k + 0.2); q.lineTo(1.6, k - 1); q.closePath(); q.fill(); } });
      else chevrons(g, T, b, '#ffd93b', '#ff8a3d');
    }
    for (const d of T.deco) if (d.k === 'gear') { g.save(); g.translate(d.x, d.y); g.fillStyle = 'rgba(40,36,60,.35)'; g.beginPath(); for (let k = 0; k < 24; k++) { const a = k * TAU / 24, r = k & 1 ? 5.2 : 6.4; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.restore(); }
    startLine(g, T, '#ffd93b', PAL.plum);
  }
};
/* the base theme, then the v2 floor features (RENDER's paintV2); the grain noise is applied by render's prepTrack (E2) */
SK.trackTexture = function (T) {
  if (T._tex) return T._tex;
  const c = document.createElement('canvas'); c.width = c.height = TS;
  const g = c.getContext('2d', { willReadFrequently: true }); g.save(); g.scale(TPM, TPM); PAINT[T.theme](g, T);
  if (SK.Render && SK.Render.paintV2) SK.Render.paintV2(g, T); else paintV2Fallback(g, T);
  g.restore();
  T._tex = c; return c;
};
SK.dropTextures = keep => { for (const T of SK.TRACKS) if (T !== keep) T._tex = null; };
})();
