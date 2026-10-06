/* SPROUT KART — tracks.js (TRACKS). The three circuits as data: a closed centre line through control points (metres, the
   world is 256 x 256 m, x right, y down), a road width, an off-road band and what lies beyond it (a wall or the open sky).
   build() samples the spline every metre and bakes a surface grid (0.5 m cells: road / off / wall / boost / void) with the
   nearest centre-line sample per cell, plus the racing line, checkpoints, item-box rows, boost pads, start grid and the
   scenery list. trackTexture() paints the 2048 x 2048 floor (8 texels a metre) for render.js. Everything above the texture
   section is plain maths so node tests can load this file with sim.js.
   API: SK.TRACKS[i] = {id, name, theme, laps, points:[[x,y]..], width, off, edge, L, N, X, Y, TX, TY, K, LINE, HW, cpS,
   checkpoints, items:[{x,y}], boosts:[..], start:{x,y,dir}, grid:[{x,y,dir}x6], deco:[{k,x,y,..}]}, SK.surfaceAt(t,x,y),
   SK.progress(t,x,y) -> {s, f, i, d (metres right of the centre line), dist}, SK.locate(t,x,y,out) (no allocation),
   SK.trackTexture(t) -> canvas. */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, SK = G.SK = G.SK || {};
const WS = 256, CELL = 0.5, GN = WS / CELL, TS = 2048, TPM = TS / WS, TAU = Math.PI * 2;
const S_OFF = 0, S_ROAD = 1, S_WALL = 2, S_BOOST = 3, S_VOID = 4, SURF = ['off', 'road', 'wall', 'boost', 'void'];
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

/* ---------- the circuits (control points in metres; features name a control point and an offset along the road) ---------- */
const DEFS = [
  { id: 'meadows', name: 'PATCHWORK MEADOWS', short: 'MEADOWS', theme: 'meadows', laps: 3, width: 15, off: 6, edge: 'wall',
    pts: [[60, 222], [120, 225], [176, 221], [214, 204], [228, 168], [214, 136], [212, 106], [228, 72], [212, 36], [170, 28], [120, 30], [76, 34],
          [44, 58], [46, 94], [76, 112], [120, 112], [152, 122], [162, 146], [140, 166], [96, 170], [54, 176], [30, 198], [38, 218]],
    boxes: [[1, 10], [10, 0], [17, 22]], boosts: [[6, 6, 0, 7], [19, 10, 3, 7]], tunnel: [8, 22, 11, -6], greenhouse: [186, 150], arch: 0 },
  { id: 'skyway', name: 'CANDYFLOSS SKYWAY', short: 'SKYWAY', theme: 'skyway', laps: 3, width: 14, off: 3.5, edge: 'void',
    pts: [[64, 222], [128, 226], [184, 214], [222, 184], [226, 140], [200, 112], [160, 118], [128, 140], [96, 150], [70, 128], [72, 92],
          [104, 70], [150, 76], [186, 60], [206, 34], [170, 22], [110, 24], [54, 34], [28, 70], [30, 130], [30, 180], [40, 210]],
    boxes: [[2, 0], [9, 4], [16, 0]], boosts: [[11, 8, -2.5, 7], [19, 6, 2.5, 7], [1, 14, 0, 7]], rainbows: [[3, 0], [12, 0], [17, 10], [20, 0]], arch: 0 },
  { id: 'works', name: 'CLATTER WORKS', short: 'WORKS', theme: 'works', laps: 3, width: 14, off: 4, edge: 'wall',
    pts: [[60, 224], [140, 226], [196, 222], [226, 196], [222, 160], [196, 150], [170, 166], [146, 150], [122, 166], [98, 150], [80, 124],
          [96, 98], [134, 92], [176, 96], [214, 84], [224, 50], [196, 26], [130, 28], [70, 30], [34, 50], [28, 100], [30, 160], [36, 206]],
    boxes: [[1, 4], [11, 6], [18, 0]], conveyors: [[1, 22], [13, 4], [20, 10], [17, -8]], gears: [5, 6, 7, 8, 9], chimneys: [[110, 200], [180, 186], [60, 70], [158, 60], [116, 126], [196, 124], [60, 140]], arch: 0 }
];

/* ---------- spline: centripetal Catmull-Rom through the control points, then resampled every ~1 m ---------- */
function spline(pts, per) {
  const n = pts.length, out = [], cpAt = [];
  const tj = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i < n; i++) {
    const P0 = pts[(i - 1 + n) % n], P1 = pts[i], P2 = pts[(i + 1) % n], P3 = pts[(i + 2) % n];
    const t0 = 0, t1 = t0 + tj(P0, P1), t2 = t1 + tj(P1, P2), t3 = t2 + tj(P2, P3);
    cpAt.push(out.length);
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

function build(def) {
  const T = Object.assign({}, def), hw = def.width / 2;
  T.points = def.pts; T.hw = hw;
  /* dense polyline, arc length, resample */
  const sp = spline(def.pts, 32), D = sp.P, nd = D.length, cum = new Float64Array(nd + 1);
  for (let i = 0; i < nd; i++) { const a = D[i], b = D[(i + 1) % nd]; cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]); }
  const Ltot = cum[nd], N = Math.round(Ltot), ds = Ltot / N;
  const X = new Float64Array(N), Y = new Float64Array(N);
  for (let i = 0, j = 0; i < N; i++) {
    const s = i * ds; while (cum[j + 1] < s) j++;
    const a = D[j], b = D[(j + 1) % nd], f = (s - cum[j]) / Math.max(1e-9, cum[j + 1] - cum[j]);
    X[i] = a[0] + (b[0] - a[0]) * f; Y[i] = a[1] + (b[1] - a[1]) * f;
  }
  const TX = new Float64Array(N), TY = new Float64Array(N), ANG = new Float64Array(N), K = new Float64Array(N), HW = new Float64Array(N).fill(hw);
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N, dx = X[b] - X[a], dy = Y[b] - Y[a], l = Math.hypot(dx, dy) || 1; TX[i] = dx / l; TY[i] = dy / l; ANG[i] = Math.atan2(dy, dx); }
  for (let i = 0; i < N; i++) K[i] = wrapA(ANG[(i + 1) % N] - ANG[(i - 1 + N) % N]) / (2 * ds);   /* + = turning right */
  const KS = blur(K, 6, 2);
  T.L = Ltot; T.N = N; T.ds = ds; T.X = X; T.Y = Y; T.TX = TX; T.TY = TY; T.ANG = ANG; T.K = KS; T.HW = HW;
  T.cpS = sp.cpAt.map(k => cum[k]);
  T.at = (k, off) => (((T.cpS[k % T.cpS.length] + (off || 0)) % Ltot) + Ltot) % Ltot;
  /* racing line: lean to the inside of the bends, smoothed so it starts early; CPU karts add their own lane */
  const raw = new Float64Array(N); for (let i = 0; i < N; i++) raw[i] = Math.max(-1, Math.min(1, KS[i] * 34));
  const lineO = blur(raw, 14, 3), LINE = new Float64Array(N);
  for (let i = 0; i < N; i++) LINE[i] = Math.max(-(hw - 2.4), Math.min(hw - 2.4, lineO[i] * hw * 0.7));
  T.LINE = LINE;
  /* how sharp the road gets in the next 30 m (for CPU braking and drifting) */
  const AH = new Float64Array(N); for (let i = 0; i < N; i++) { let m = 0; for (let k = 4; k < 34; k++) m = Math.max(m, Math.abs(KS[(i + k) % N])); AH[i] = m; }
  T.AHEAD = AH;
  /* surface grid: distance to the centre polyline and the nearest sample, stamped segment by segment */
  const dist = new Float32Array(GN * GN).fill(1e9), near = new Uint16Array(GN * GN), R = hw + def.off + 3;
  for (let i = 0; i < N; i++) {
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
  const grid = new Uint8Array(GN * GN), beyond = def.edge === 'void' ? S_VOID : S_WALL;
  for (let c = 0; c < GN * GN; c++) { const d = dist[c]; grid[c] = d <= hw ? S_ROAD : d <= hw + def.off ? S_OFF : beyond; }
  T.grid = grid; T.near = near; T.dist = dist; T.GN = GN; T.CELL = CELL; T.WS = WS;
  /* helpers in track space */
  T.pos = (s, lat, out) => { s = ((s % Ltot) + Ltot) % Ltot; const f = s / ds, i = Math.floor(f) % N, j = (i + 1) % N, u = f - Math.floor(f);
    const x = X[i] + (X[j] - X[i]) * u, y = Y[i] + (Y[j] - Y[i]) * u, tx = TX[i] + (TX[j] - TX[i]) * u, ty = TY[i] + (TY[j] - TY[i]) * u, tl = Math.hypot(tx, ty) || 1;
    out = out || {}; out.x = x - ty / tl * (lat || 0); out.y = y + tx / tl * (lat || 0); out.dir = Math.atan2(ty, tx); return out; };
  /* boost pads: [cp, offset, lateral, length] → rectangles stamped into the grid */
  T.boosts = [];
  const pads = (def.boosts || []).map(b => ({ s: T.at(b[0], b[1]), lat: b[2], len: b[3], w: 3.4, kind: 'pad' }));
  for (const c of def.conveyors || []) pads.push({ s: T.at(c[0], c[1]), lat: 0, len: 5, w: def.width - 1, kind: 'belt' });
  const tmp = {};
  for (const p of pads) {
    T.boosts.push(p);
    for (let a = 0; a <= p.len; a += 0.25) for (let b = -p.w / 2; b <= p.w / 2; b += 0.25) {
      T.pos(p.s + a, p.lat + b, tmp); const cx = (tmp.x / CELL) | 0, cy = (tmp.y / CELL) | 0;
      if (cx >= 0 && cy >= 0 && cx < GN && cy < GN && grid[cy * GN + cx] === S_ROAD) grid[cy * GN + cx] = S_BOOST;
    }
  }
  /* checkpoints, start, grid slots, item boxes */
  T.NCP = 16; T.checkpoints = []; for (let k = 0; k < T.NCP; k++) T.checkpoints.push(k * Ltot / T.NCP);
  const st = T.pos(0, 0); T.start = { x: st.x, y: st.y, dir: st.dir };
  T.slots = []; for (let j = 0; j < 6; j++) { const row = j >> 1, side = j & 1 ? 1 : -1, p = T.pos(Ltot - 6 - row * 7.5 - (j & 1) * 3.5, side * hw * 0.42); T.slots.push({ x: p.x, y: p.y, dir: p.dir }); }
  T.items = [];
  for (const b of def.boxes || []) { const s = T.at(b[0], b[1]); for (const f of [-0.6, -0.2, 0.2, 0.6]) { const p = T.pos(s, f * hw); T.items.push({ x: p.x, y: p.y, s }); } }
  T.deco = makeDeco(T);
  return T;
}

/* ---------- lookups (no allocation in locate) ---------- */
function locate(T, x, y, out) {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  out.surf = T.edge === 'void' ? S_VOID : S_WALL; out.ok = false;
  if (cx < 0 || cy < 0 || cx >= GN || cy >= GN) return out;
  const c = cy * GN + cx; out.surf = T.grid[c];
  if (T.dist[c] > 1e8) return out;
  const N = T.N, X = T.X, Y = T.Y, i0 = T.near[c];
  let best = 1e18, bi = i0, bt = 0;
  for (let k = -3; k <= 2; k++) {
    const a = (i0 + k + N) % N, b = (a + 1) % N, dx = X[b] - X[a], dy = Y[b] - Y[a], l2 = dx * dx + dy * dy || 1e-9;
    let t = ((x - X[a]) * dx + (y - Y[a]) * dy) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = X[a] + dx * t - x, ey = Y[a] + dy * t - y, d = ex * ex + ey * ey;
    if (d < best) { best = d; bi = a; bt = t; }
  }
  const j = (bi + 1) % N, px = X[bi] + (X[j] - X[bi]) * bt, py = Y[bi] + (Y[j] - Y[bi]) * bt, tx = TX(T, bi), ty = TY(T, bi);
  out.ok = true; out.i = bi; out.s = (bi + bt) * T.ds; out.f = out.s / T.L; out.dist = Math.sqrt(best);
  out.d = (x - px) * -ty + (y - py) * tx; out.cx = px; out.cy = py;
  return out;
}
const TX = (T, i) => T.TX[i], TY = (T, i) => T.TY[i];
SK.locate = locate;
SK.surfaceAt = (T, x, y) => SURF[locate(T, x, y, {}).surf];
SK.progress = (T, x, y) => { const o = locate(T, x, y, {}); return o.ok ? { s: o.s, f: o.f, i: o.i, d: o.d, dist: o.dist } : null; };
SK.SURF = { OFF: S_OFF, ROAD: S_ROAD, WALL: S_WALL, BOOST: S_BOOST, VOID: S_VOID, names: SURF };
SK.WORLD = { WS, CELL, GN, TS, TPM };

/* ---------- scenery (billboards); none of it stands where a kart can drive ---------- */
function makeDeco(T) {
  const out = [], hw = T.hw, edgeD = hw + T.off, tmp = {};
  const freeAt = (x, y, need) => { const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL); if (cx < 1 || cy < 1 || cx >= GN - 1 || cy >= GN - 1) return x > -30 && y > -30 && x < WS + 30 && y < WS + 30; return T.dist[cy * GN + cx] >= need; };
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
        if (tun) add({ k: side < 0 ? 'sunL' : 'sunR', x: p.x, y: p.y, w: 5.2, h: 7.5, side });
        else if (((s / 3.5) | 0) % 2 === 0) add({ k: 'bush', x: p.x, y: p.y, w: 3.6 + hash(s | 0, side) * 0.9, h: 2.6 });
      }
    }
    for (let i = 0; i < 140 && out.length < 420; i++) {
      const x = 6 + hash(i, 11) * 244, y = 6 + hash(i, 23) * 244;
      if (!freeAt(x, y, edgeD + 6)) continue;
      const r = hash(i, 31); add(r < 0.55 ? { k: 'tree', x, y, w: 7, h: 8.5 } : r < 0.75 ? { k: 'pumpkin', x, y, w: 2.4, h: 1.8 } : r < 0.9 ? { k: 'cabbage', x, y, w: 2.2, h: 1.6 } : { k: 'sunflower', x, y, w: 2.6, h: 5 });
    }
    if (T.greenhouse) add({ k: 'greenhouse', x: T.greenhouse[0], y: T.greenhouse[1], w: 22, h: 11 });
  } else if (T.theme === 'skyway') {
    for (let s = 0; s < T.L; s += 9) for (const side of [-1, 1]) {
      const h = hash(s | 0, side + 9); if (h < 0.35) continue;
      const lamp = h > 0.8, p = T.pos(s, side * (edgeD + (lamp ? 1.2 : 4.5 + h * 3)), tmp); if (!freeAt(p.x, p.y, edgeD + (lamp ? 0.8 : 3.5))) continue;
      add(lamp ? { k: 'lamp', x: p.x, y: p.y, w: 1.6, h: 5.5 } : { k: h > 0.58 ? 'puffP' : 'puffB', x: p.x, y: p.y, w: 3.6 + h * 2, h: 2.5 + h * 1.4 });
    }
    for (const r of T.rainbows || []) { const p = T.pos(T.at(r[0], r[1]), 0, tmp); add({ k: 'rainbow', x: p.x, y: p.y, w: T.width + 7, h: 9.5, gate: 1 }); }
    for (let i = 0; i < 40; i++) { const x = hash(i, 5) * 256, y = hash(i, 6) * 256; if (freeAt(x, y, edgeD + 10)) add({ k: hash(i, 7) < 0.5 ? 'balloons' : 'puffP', x, y, w: hash(i, 7) < 0.5 ? 3 : 9, h: hash(i, 7) < 0.5 ? 6 : 6, z: 2 + hash(i, 8) * 6 }); }
  } else {
    for (let s = 0; s < T.L; s += 8) for (const side of [-1, 1]) {
      const p = T.pos(s, side * (edgeD + 1.0), tmp); if (!freeAt(p.x, p.y, edgeD + 0.6)) continue;
      add({ k: 'post', x: p.x, y: p.y, w: 1.4, h: 2.4 });
    }
    for (const c of T.chimneys || []) if (freeAt(c[0], c[1], edgeD + 3)) add({ k: 'chimney', x: c[0], y: c[1], w: 6, h: 18, smoke: 1 });
    for (const g of T.gears || []) {   /* a big gear on the inside of every chicane bend */
      const s = T.at(g, 0), k = T.K[Math.floor(s / T.ds) % T.N], side = k > 0 ? 1 : -1, p = T.pos(s, side * (edgeD + 5), tmp);
      if (freeAt(p.x, p.y, edgeD + 1)) add({ k: 'gear', x: p.x, y: p.y, w: 9, h: 9, spin: side });
    }
    for (let i = 0; i < 90; i++) { const x = hash(i, 15) * 256, y = hash(i, 16) * 256; if (freeAt(x, y, edgeD + 5)) add({ k: hash(i, 17) < 0.6 ? 'crate' : 'pipe', x, y, w: hash(i, 17) < 0.6 ? 2.6 : 4, h: hash(i, 17) < 0.6 ? 2.4 : 3.2 }); }
  }
  const a = T.pos(T.at(T.arch || 0, 0), 0, tmp); add({ k: 'arch', x: a.x, y: a.y, w: T.width + 5, h: 7.5, gate: 1 });
  return out;
}

SK.TRACKS = DEFS.map(build);
SK.trackById = id => SK.TRACKS.find(t => t.id === id) || SK.TRACKS[0];

/* ================= the floor texture (browser only) ================= */
const PAL = { ink: '#2b2140', plum: '#4a3a6b', cream: '#fff6e0', sun: '#ffd93b' };
function centrePath(T, lat) {   /* the closed centre line (lat = 0) or an offset of it, in metres */
  const p = new Path2D(), tmp = {};
  for (let i = 0; i <= T.N; i++) { const k = i % T.N, x = T.X[k] - T.TY[k] * (lat || 0), y = T.Y[k] + T.TX[k] * (lat || 0); if (i) p.lineTo(x, y); else p.moveTo(x, y); }
  p.closePath(); return p;
}
function runs(T, test) { const r = []; let st = -1; for (let i = 0; i <= T.N; i++) { const on = i < T.N && test(i); if (on && st < 0) st = i; if (!on && st >= 0) { r.push([st, i]); st = -1; } } return r; }
function offsetLine(g, T, i0, i1, lat) { g.beginPath(); for (let i = i0; i <= i1; i++) { const k = i % T.N; const x = T.X[k] - T.TY[k] * lat, y = T.Y[k] + T.TX[k] * lat; if (i === i0) g.moveTo(x, y); else g.lineTo(x, y); } }
function across(g, T, s, fn) {   /* local frame at s: x along the road, y to the right */
  const p = T.pos(s, 0); g.save(); g.translate(p.x, p.y); g.rotate(p.dir); fn(g); g.restore();
}
function blob(g, x, y, r, col) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function noise(g, amt, seed) {
  const im = g.getImageData(0, 0, TS, TS), d = im.data;
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const o = (y * TS + x) * 4, n = (hash(x + seed, y) - 0.5) * amt + (hash((x >> 2) + 77, (y >> 2) + seed) - 0.5) * amt * 0.8;
    d[o] = Math.max(0, Math.min(255, d[o] + n)); d[o + 1] = Math.max(0, Math.min(255, d[o + 1] + n)); d[o + 2] = Math.max(0, Math.min(255, d[o + 2] + n));
  }
  g.putImageData(im, 0, 0);
}
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
const PAINT = {
  meadows(g, T) {
    const hw = T.hw, ed = hw + T.off;
    g.fillStyle = '#6fbf52'; g.fillRect(0, 0, WS, WS);
    /* the patchwork: little fields of crops between hedgerows */
    const crops = [['#b98a5a', '#7cc65a', 'rows'], ['#f2d65a', '#9fd36a', 'dots'], ['#b9a2e8', '#8f78c8', 'rows'], ['#e8d68a', '#d2b45e', 'lines'], ['#86cf5e', '#ffffff', 'dots'], ['#a8d870', '#ff9a45', 'dots'], ['#c79a68', '#5fb04a', 'rows']];
    for (let fy = 0; fy < 8; fy++) for (let fx = 0; fx < 8; fx++) {
      const c = crops[Math.floor(hash(fx, fy + 40) * crops.length)], x = fx * 32 + 1.5, y = fy * 32 + 1.5, w = 29, h = 29;
      g.fillStyle = c[0]; g.fillRect(x, y, w, h); g.fillStyle = c[1];
      if (c[2] === 'rows') for (let k = 1.5; k < w; k += 3) { g.fillRect(x + k, y + 1, 1, h - 2); }
      else if (c[2] === 'lines') for (let k = 1; k < h; k += 1.6) g.fillRect(x + 0.5, y + k, w - 1, 0.35);
      else for (let k = 0; k < 160; k++) { blob(g, x + 1 + hash(k, fx * 9 + fy) * (w - 2), y + 1 + hash(k + 400, fy * 9 + fx) * (h - 2), 0.35 + hash(k, 3) * 0.3, c[1]); g.fillStyle = c[1]; }
    }
    g.fillStyle = '#3d9a4a'; for (let k = 0; k <= 8; k++) { g.fillRect(k * 32 - 1.5, 0, 3, WS); g.fillRect(0, k * 32 - 1.5, WS, 3); }
    /* hedge band, grass verge, road */
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
    /* the sunflower tunnel's shade */
    const t0 = T.at(T.tunnel[0], T.tunnel[1]), t1 = T.at(T.tunnel[2], T.tunnel[3]);
    for (let s = t0; s < (t1 < t0 ? t1 + T.L : t1); s += 3.5) across(g, T, s, q => { q.fillStyle = 'rgba(60,90,30,.16)'; q.beginPath(); q.ellipse(0, 0, 1.3, hw + 1.5, 0, 0, TAU); q.fill(); });
    for (const b of T.boosts) chevrons(g, T, b, '#ffd93b', '#ff8a3d');
    startLine(g, T, PAL.cream, PAL.plum);
    if (T.greenhouse) { g.fillStyle = '#d9c9a8'; g.fillRect(T.greenhouse[0] - 13, T.greenhouse[1] - 6, 26, 12); }
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
    const rb = ['#ff7a8a', '#ffb24a', '#ffe36b', '#8fe07a', '#7fd0ff', '#b9a2ff'];
    rb.forEach((c, k) => { g.strokeStyle = c; g.lineWidth = hw * 2 + 0.2 - k * 0.42; g.stroke(C); });
    g.strokeStyle = '#d6c8ff'; g.lineWidth = hw * 2 - 2.6; g.stroke(C);
    for (let i = 0; i < 1600; i++) { const p = T.pos(hash(i, 21) * T.L, (hash(i, 22) - 0.5) * (hw * 2 - 3)); blob(g, p.x, p.y, 0.1 + hash(i, 23) * 0.14, hash(i, 24) < 0.5 ? '#c6b4ff' : '#ece4ff'); }
    g.setLineDash([2.4, 2.4]); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.45; g.stroke(C); g.setLineDash([]);
    for (const b of T.boosts) chevrons(g, T, b, '#ffffff', '#ff7ac0');
    startLine(g, T, '#ffffff', PAL.plum);
  },
  works(g, T) {
    const hw = T.hw, ed = hw + T.off;
    g.fillStyle = '#5f6380'; g.fillRect(0, 0, WS, WS);
    for (let y = 0; y < WS; y += 8) for (let x = 0; x < WS; x += 8) { g.fillStyle = hash(x, y) < 0.5 ? '#666a88' : '#585c78'; g.fillRect(x + 0.2, y + 0.2, 7.6, 7.6); g.fillStyle = '#8a8eaa'; for (const [a, b] of [[0.9, 0.9], [7.1, 0.9], [0.9, 7.1], [7.1, 7.1]]) blob(g, x + a, y + b, 0.25, '#8a8eaa'); }
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
SK.trackTexture = function (T) {
  if (T._tex) return T._tex;
  const c = document.createElement('canvas'); c.width = c.height = TS;
  const g = c.getContext('2d', { willReadFrequently: true }); g.save(); g.scale(TPM, TPM); PAINT[T.theme](g, T); g.restore();
  noise(g, T.theme === 'skyway' ? 7 : 12, T.theme.length * 13);
  T._tex = c; return c;
};
SK.dropTextures = keep => { for (const T of SK.TRACKS) if (T !== keep) { T._tex = null; T._mips = null; } };
})();
