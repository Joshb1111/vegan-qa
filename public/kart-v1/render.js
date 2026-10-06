/* SPROUT KART — render.js (RENDER). Everything you see, drawn in code in the Berry Breeze / Vine Line house style (thick ink
   outlines, glossy two-tone shading, sticker text). Per view: a parallax sky band, the track floor projected per pixel into an
   ImageData at a low internal resolution (one row = one distance, mip-mapped texture, no allocation in the loop) and scaled up
   smoothly, then depth-sorted sprites drawn crisp on top: karts (16 baked angles per racer; the kart you drive is painted
   live), scenery, surprise bubbles, items and little world-space effects. Then the HUD and the screens.
   SK.Render: init(R, low), setTrack(T), camera(slot, kart, snap), tick(sim), fxEvent(sim, e), drawView(ctx, rect, sim, ki, t, o),
   drawHUD(ctx, rect, sim, ki, t, o), screen(ctx, name, S), text(ctx, s, x, y, size, fill, align), UI (hit rects). */
'use strict';
(function () {
const SK = window.SK = window.SK || {};
const TAU = Math.PI * 2, PI = Math.PI;
const PAL = { ink: '#2b2140', plum: '#4a3a6b', cream: '#fff6e0', sun: '#ffd93b', gold: '#f5a623', orange: '#ff8a3d', leaf: '#4cc46a', lilac: '#e4d8ff', sky: '#7fd0ff' };
const FONT = '"Arial Rounded MT Bold", ui-rounded, "Varela Round", "Trebuchet MS", system-ui, sans-serif';
const font = s => 'bold ' + s + 'px ' + FONT;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const wrapA = a => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
let R = 2, LOW = false;

/* ---------- small drawing helpers ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function sprite(w, h, draw, dens) { const d = dens || R; const c = canvas(w * d, h * d); c.lw = w; c.lh = h; const g = c.getContext('2d'); g.scale(d, d); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); return c; }
function rrect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, TAU); }
const STAR = (g, cx, cy, r, ri, n, rot) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, q = i & 1 ? ri : r; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); };
function twinkle(g, x, y, r, rot, col) { g.fillStyle = col || '#fff'; STAR(g, x, y, r, r * 0.32, 4, rot || 0); g.fill(); }
function inkStar(g, x, y, r, rot, col, lw) { STAR(g, x, y, r, r * 0.45, 5, rot); g.fillStyle = col; g.strokeStyle = PAL.ink; g.lineWidth = lw || 1.4; g.stroke(); g.fill(); }
function ball(g, x, y, r, m, lw) {
  g.fillStyle = PAL.ink; circle(g, x, y, r + (lw || 2)); g.fill();
  g.fillStyle = m[1]; circle(g, x, y, r); g.fill();
  g.save(); circle(g, x, y, r); g.clip(); g.fillStyle = m[0]; circle(g, x - r * 0.16, y - r * 0.18, r * 0.92); g.fill(); g.restore();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.42, r * 0.34, r * 0.19, -0.6, 0, TAU); g.fill();
}
function leafPath(g, L, w) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.45, -w, L, 0); g.quadraticCurveTo(L * 0.45, w, 0, 0); g.closePath(); }
function leaf(g, x, y, a, L, m, lw) {
  g.save(); g.translate(x, y); g.rotate(a); const w = L * 0.42;
  leafPath(g, L, w); g.strokeStyle = PAL.ink; g.lineWidth = lw || 2.4; g.stroke(); g.fillStyle = m[0]; g.fill();
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.45, w, L, 0); g.closePath(); g.fillStyle = m[1]; g.globalAlpha *= 0.45; g.fill(); g.globalAlpha /= 0.45;
  g.strokeStyle = m[1]; g.lineWidth = (lw || 2.4) * 0.38; g.beginPath(); g.moveTo(L * 0.12, 0); g.lineTo(L * 0.78, 0); g.stroke();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(L * 0.42, -w * 0.38, L * 0.16, w * 0.16, 0, 0, TAU); g.fill();
  g.restore();
}
function eye(g, x, y, h, sx, mood, lw) {
  const w = h * 0.74 * sx; g.save(); g.strokeStyle = PAL.ink; g.lineCap = 'round';
  if (mood === 'shut' || mood === 'happy') { g.lineWidth = lw * 1.4; g.beginPath(); if (mood === 'shut') g.ellipse(x, y - h * 0.1, w * 0.5, w * 0.35, 0, PI * 0.15, PI * 0.85); else g.ellipse(x, y + h * 0.2, w * 0.55, w * 0.5, 0, PI * 1.12, PI * 1.88); g.stroke(); g.restore(); return; }
  g.lineWidth = lw; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(x, y + h * 0.06, w * 0.33, h * 0.36, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff'; circle(g, x - w * 0.12, y - h * 0.08, h * 0.13); g.fill();
  g.restore();
}
const mix = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const ch = s => Math.round(((A >> s) & 255) + (((B >> s) & 255) - ((A >> s) & 255)) * t); return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1); };

/* ---------- sticker text (cached per string, size and colour) ---------- */
let TXT = new Map(), txtB = 0; const mctx = canvas(4, 4).getContext('2d');
function txtCanvas(s, size, fill) {
  const key = s + '|' + size + '|' + fill; let c = TXT.get(key);
  if (c) { TXT.delete(key); TXT.set(key, c); return c; }
  mctx.font = font(size); const w = mctx.measureText(s).width, p = size * 0.3 + 1, lw = w + p * 2, lh = size * 1.25 + p * 2;
  c = canvas(lw * R, lh * R); c.lw = c.width / R; c.lh = c.height / R; c.tw = w;
  const g = c.getContext('2d'); g.scale(R, R); g.font = font(size); g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.strokeStyle = PAL.ink; g.lineWidth = size * 0.3; const ty = lh / 2 - 0.5;
  g.strokeText(s, p, ty + size * 0.07); g.strokeText(s, p, ty); g.fillStyle = fill; g.fillText(s, p, ty);
  TXT.set(key, c); txtB += c.width * c.height * 4;
  while (TXT.size > 1 && (TXT.size > 220 || txtB > 8e6)) { const k = TXT.keys().next().value, o = TXT.get(k); txtB -= o.width * o.height * 4; TXT.delete(k); }
  return c;
}
function text(ctx, s, x, y, size, fill, align) {
  s = String(s).slice(0, 70); if (!s) return 0; size = Math.round(Math.max(6, Math.min(110, +size || 14)) * 2) / 2; fill = fill || '#fff'; align = align || 'center';
  const c = txtCanvas(s, size, fill), p = (c.lw - c.tw) / 2, x0 = align === 'center' ? x - c.lw / 2 : align === 'right' ? x - c.tw - p : x - p;
  ctx.drawImage(c, x0, y - c.lh / 2, c.lw, c.lh); return c.tw;
}
const TW = {};
function tw(s, z) { const k = z + '|' + s; return TW[k] || (mctx.font = font(z), TW[k] = mctx.measureText(s).width); }

/* =====================================================================================================================
   THE RACERS: each kart is a handful of glossy ellipsoids (and a few leaves) projected from a little 3D model, painted far
   to near. Model space: x forward, y left, z up, metres; a = the kart's heading relative to the line of sight (0 = we see
   its back), pitch = how far above we look from.
   ===================================================================================================================== */
const PITCH = 0.36, SPI = Math.sin(PITCH), CPI = Math.cos(PITCH), LWM = 0.045;
const TYRE = ['#5a4f73', '#2b2140', '#8a80a3'];
function Proj(a, pitch) {
  const ca = Math.cos(a), sa = Math.sin(a), sp = Math.sin(pitch == null ? PITCH : pitch), cp = Math.cos(pitch == null ? PITCH : pitch);
  return { ca, sa, sp, cp, p(x, y, z) { const wx = x * ca - y * sa, wy = x * sa + y * ca; return [-wy, -(wx * sp + z * cp), wx * cp - z * sp]; } };
}
/* an ellipsoid with three (model-space) half-axis vectors → its screen ellipse */
function ellOf(pr, c, A, B, C) {
  const P = pr.p(c[0], c[1], c[2]), u = pr.p(A[0], A[1], A[2]), v = pr.p(B[0], B[1], B[2]), w = pr.p(C[0], C[1], C[2]);
  const a = u[0] * u[0] + v[0] * v[0] + w[0] * w[0], b = u[0] * u[1] + v[0] * v[1] + w[0] * w[1], d = u[1] * u[1] + v[1] * v[1] + w[1] * w[1];
  const m = (a + d) / 2, q = Math.sqrt(((a - d) / 2) ** 2 + b * b), l1 = m + q, l2 = Math.max(1e-6, m - q), rot = 0.5 * Math.atan2(2 * b, a - d);
  return { x: P[0], y: P[1], d: P[2], rx: Math.sqrt(l1), ry: Math.sqrt(l2), rot, ex: Math.sqrt(a), ey: Math.sqrt(d) };
}
function ballE(g, e, m, lw) {
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(e.x, e.y, e.rx + lw, e.ry + lw, e.rot, 0, TAU); g.fill();
  g.fillStyle = m[1]; g.beginPath(); g.ellipse(e.x, e.y, e.rx, e.ry, e.rot, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.ellipse(e.x, e.y, e.rx, e.ry, e.rot, 0, TAU); g.clip();
  g.fillStyle = m[0]; g.beginPath(); g.ellipse(e.x - e.ex * 0.15, e.y - e.ey * 0.19, e.rx * 0.93, e.ry * 0.93, e.rot, 0, TAU); g.fill(); g.restore();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(e.x - e.ex * 0.4, e.y - e.ey * 0.45, Math.max(0.01, e.ex * 0.26), Math.max(0.01, e.ey * 0.15), -0.5, 0, TAU); g.fill();
}
function ell(L, pr, c, ax, ay, az, m, after, bias) {   /* axis-aligned in model space */
  const e = ellOf(pr, c, [ax, 0, 0], [0, ay, 0], [0, 0, az]);
  L.push({ d: e.d + (bias || 0), f: g => { ballE(g, e, m, LWM); if (after) after(g, e); } });
  return e;
}
function ellV(L, pr, c, A, B, C, m, after, bias) { const e = ellOf(pr, c, A, B, C); L.push({ d: e.d + (bias || 0), f: g => { ballE(g, e, m, LWM * 0.8); if (after) after(g, e); } }); return e; }
/* points on an ellipsoid's surface that face us (seeds, kernels, ribs) */
function facing(pr, n) { return pr.p(n[0], n[1], n[2])[2] < -0.05; }
function surfDots(g, pr, c, ax, ay, az, list, col, r) {
  g.fillStyle = col;
  for (const [t, p] of list) {
    const nx = Math.cos(t), ny = Math.sin(t) * Math.cos(p), nz = Math.sin(t) * Math.sin(p);
    if (!facing(pr, [nx / ax, ny / ay, nz / az])) continue;
    const s = pr.p(c[0] + nx * ax, c[1] + ny * ay, c[2] + nz * az); g.beginPath(); g.ellipse(s[0], s[1], r, r * 0.8, 0, 0, TAU); g.fill();
  }
}
function ribs(g, pr, c, ax, ay, az, col, lw, psis) {
  g.strokeStyle = col; g.lineWidth = lw;
  for (const ps of psis) {
    g.beginPath(); let on = false;
    for (let k = 0; k <= 16; k++) {
      const t = k / 16 * PI, nx = Math.cos(t), ny = Math.sin(t) * Math.cos(ps), nz = Math.sin(t) * Math.sin(ps);
      const vis = facing(pr, [nx / ax, ny / ay, nz / az]), s = pr.p(c[0] + nx * ax, c[1] + ny * ay, c[2] + nz * az);
      if (vis) { if (on) g.lineTo(s[0], s[1]); else g.moveTo(s[0], s[1]); on = true; } else on = false;
    }
    g.stroke();
  }
}
function wheel(L, pr, x, y, r, hub) {
  const side = y > 0 ? 1 : -1, e = ell(L, pr, [x, y, r], r, 0.14, r, TYRE);
  const hubVis = side * pr.sa > 0.08;
  if (hubVis) { const h = ellOf(pr, [x, y + side * 0.15, r], [r * 0.5, 0, 0], [0, 0.001, 0], [0, 0, r * 0.5]); L.push({ d: e.d - 0.02, f: g => { g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(h.x, h.y, h.rx + 0.025, h.ry + 0.025, h.rot, 0, TAU); g.fill(); g.fillStyle = hub; g.beginPath(); g.ellipse(h.x, h.y, h.rx, h.ry, h.rot, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(h.x - h.rx * 0.25, h.y - h.ry * 0.3, h.rx * 0.35, h.ry * 0.25, 0, 0, TAU); g.fill(); } }); }
}
/* the face on a round head, turned with the kart */
function face(g, pr, hc, r, mood) {
  const vis = -pr.p(1, 0, 0)[2]; if (vis < 0.04) return;
  const lw = r * 0.09;
  for (const s of [-1, 1]) {
    const n = [0.9, s * 0.38, 0.12], ve = -pr.p(n[0], n[1], n[2])[2] / Math.hypot(n[0], n[1], n[2]); if (ve < 0.08) continue;
    const e = pr.p(hc[0] + n[0] * r, hc[1] + n[1] * r, hc[2] + n[2] * r), sq = Math.sqrt(ve);
    eye(g, e[0], e[1], r * 0.42, sq, mood, lw);
    const b = pr.p(hc[0] + r * 0.78, hc[1] + s * r * 0.58, hc[2] - r * 0.22);
    const vb = -pr.p(0.78, s * 0.58, -0.2)[2]; if (vb > 0.1) { g.fillStyle = 'rgba(255,130,120,.7)'; g.beginPath(); g.ellipse(b[0], b[1], r * 0.15 * Math.sqrt(vb), r * 0.09, 0, 0, TAU); g.fill(); }
  }
  const m = pr.p(hc[0] + r * 0.95, hc[1], hc[2] - r * 0.3), sq = Math.sqrt(vis);
  g.strokeStyle = PAL.ink; g.lineWidth = lw * 1.1; g.lineCap = 'round'; g.beginPath();
  if (mood === 'o') { g.fillStyle = PAL.ink; g.ellipse(m[0], m[1], r * 0.1 * sq, r * 0.12, 0, 0, TAU); g.fill(); }
  else { g.ellipse(m[0], m[1] - r * 0.1, r * 0.17 * sq, r * 0.14, 0, 0.2 * PI, 0.8 * PI); g.stroke(); }
}
/* leaves standing on a head: anchor in model space, a lean in screen space */
function headLeaf(L, pr, at, ang, len, m, bias) { const s = pr.p(at[0], at[1], at[2]); L.push({ d: s[2] + (bias || 0), f: g => leaf(g, s[0], s[1], ang, len, m, LWM * 0.9) }); }

const LEAF = ['#7ed957', '#3f9a3a', '#e2ffd2'], LEAFD = ['#4cb85a', '#2a7a3a', '#c8f5b0'];
const RA = [
  { /* SPRIG — green sprout in a pea-pod kart */
    head: ['#5cc85a', '#2f8f4a', '#d2f7c4'], torso: ['#ffd93b', '#e8a020', '#fff8d0'], hub: '#ffd93b',
    body(L, pr) {
      ell(L, pr, [0.02, 0, 0.5], 1.08, 0.6, 0.36, ['#7ed957', '#3f9a3a', '#e2ffd2']);
      ell(L, pr, [1.08, 0, 0.62], 0.22, 0.1, 0.1, ['#7ed957', '#3f9a3a', '#e2ffd2']);
      for (const x of [0.78, 0.52]) ell(L, pr, [x, 0, 0.8], 0.17, 0.17, 0.15, ['#b6f07a', '#5fae3a', '#f2ffe0']);
      headLeaf(L, pr, [-1.0, 0, 0.62], -PI / 2 - 0.9, 0.36, LEAF);
    },
    top(L, pr, hc, r) { const t = [hc[0], hc[1], hc[2] + r * 0.92]; headLeaf(L, pr, t, -PI / 2 - 0.55, 0.36, LEAF, -0.01); headLeaf(L, pr, t, -PI / 2 + 0.55, 0.36, LEAF, -0.01); }
  },
  { /* MARIGOLD — orange marigold in a pumpkin kart */
    head: ['#ffd65a', '#f0a020', '#fff3c0'], torso: ['#a4dc5c', '#5a9a2c', '#e6f7c8'], hub: '#fff6e0',
    body(L, pr) {
      const c = [0.04, 0, 0.52], ax = 0.98, ay = 0.74, az = 0.48;
      ell(L, pr, c, ax, ay, az, ['#ff9a45', '#d9622a', '#ffe2c8'], (g) => ribs(g, pr, c, ax, ay, az, '#d9622a', 0.035, [0.45, 1.1, 2.04, 2.69]));
      ell(L, pr, [0.86, 0, 0.92], 0.07, 0.07, 0.14, ['#8a6a3a', '#5a4020', '#c8a878']);
      headLeaf(L, pr, [0.86, 0, 1.0], -PI / 2 + 0.9, 0.3, LEAF);
    },
    top(L, pr, hc, r) {   /* a ring of petals round the face */
      const fx = [0, 0, 0];
      for (let k = 0; k < 12; k++) {
        const ph = k * TAU / 12, dy = Math.cos(ph), dz = Math.sin(ph), m = k & 1 ? ['#ffc23a', '#e8901c', '#fff0b8'] : ['#ff8a2a', '#d9622a', '#ffd0a0'];
        ellV(L, pr, [hc[0] - r * 0.45, hc[1] + dy * r * 1.08, hc[2] + dz * r * 1.08], [-r * 0.28, dy * r * 0.48, dz * r * 0.48], [0, -dz * r * 0.3, dy * r * 0.3], [r * 0.14, 0, 0], m, null, 0.02);
      }
      void fx;
    }
  },
  { /* BASIL — a basil sprite in an aubergine kart */
    head: ['#4cc08a', '#1f7a52', '#c8f5e0'], torso: ['#fff6e0', '#d8c8a8', '#ffffff'], hub: '#d2b8ff',
    body(L, pr) {
      ell(L, pr, [-0.04, 0, 0.5], 1.1, 0.6, 0.4, ['#9b6bd8', '#5e3a9a', '#ead8ff']);
      ell(L, pr, [0.92, 0, 0.6], 0.24, 0.42, 0.3, ['#6fcf6a', '#2f8f4a', '#d2f7c4']);
      ell(L, pr, [1.18, 0, 0.66], 0.18, 0.07, 0.07, ['#8a6a3a', '#5a4020', '#c8a878']);
    },
    top(L, pr, hc, r) {   /* big glossy basil leaves: two ears and a quiff */
      const B = ['#3fae5a', '#1f6f3a', '#c8f5b0'];
      for (const sd of [-1, 1]) ellV(L, pr, [hc[0] - r * 0.1, hc[1] + sd * r * 1.05, hc[2] + r * 0.35], [r * 0.3, 0, -r * 0.05], [0, sd * r * 0.55, r * 0.3], [0, 0, r * 0.06], B, null, 0.01);
      ellV(L, pr, [hc[0] - r * 0.2, hc[1], hc[2] + r * 1.05], [-r * 0.45, 0, r * 0.15], [0, r * 0.26, 0], [0, 0, r * 0.07], B, null, -0.01);
    }
  },
  { /* BLOSSOM — a plum blossom in a strawberry kart */
    head: ['#ffd8e8', '#e890b0', '#fff4f8'], torso: ['#b9a2ff', '#7a5cc8', '#ece4ff'], hub: '#fff3a0',
    body(L, pr) {
      const c = [0.02, 0, 0.52], ax = 0.98, ay = 0.7, az = 0.47;
      const D = []; for (let a = 0; a < 7; a++) for (let b = 0; b < 6; b++) D.push([0.3 + a * 0.38, b * 0.55 + (a & 1) * 0.27]);
      ell(L, pr, c, ax, ay, az, ['#ff5a66', '#c22d4f', '#ffd0d5'], g => surfDots(g, pr, c, ax, ay, az, D, '#fff3a0', 0.035));
      for (let k = 0; k < 6; k++) { const ph = k * TAU / 6; ellV(L, pr, [-0.95, Math.cos(ph) * 0.26, 0.55 + Math.sin(ph) * 0.24], [-0.06, Math.cos(ph) * 0.24, Math.sin(ph) * 0.2], [0, -Math.sin(ph) * 0.1, Math.cos(ph) * 0.1], [0.05, 0, 0], LEAF, null, 0.01); }
    },
    top(L, pr, hc, r) {
      for (let k = 0; k < 5; k++) { const ph = k * TAU / 5 + 0.3; ellV(L, pr, [hc[0] + Math.cos(ph) * r * 0.5, hc[1] + Math.sin(ph) * r * 0.5, hc[2] + r * 0.88], [Math.cos(ph) * r * 0.32, Math.sin(ph) * r * 0.32, r * 0.1], [-Math.sin(ph) * r * 0.24, Math.cos(ph) * r * 0.24, 0], [0, 0, r * 0.08], ['#ff9ac0', '#e0608e', '#ffe0ec']); }
      ell(L, pr, [hc[0], hc[1], hc[2] + r * 0.98], r * 0.16, r * 0.16, r * 0.1, ['#ffd93b', '#e8a020', '#fff8d0'], null, -0.03);
    }
  },
  { /* ZEST — a lemon bud in a blueberry kart */
    head: ['#ffe36b', '#e8b020', '#fffbe0'], torso: ['#9be8c4', '#4fb08a', '#e6fff4'], hub: '#ffe36b', tall: 1.14,
    body(L, pr) {
      ell(L, pr, [0.02, 0, 0.54], 0.94, 0.74, 0.52, ['#5f90ff', '#2a4fb8', '#dde9ff']);
      const s = pr.p(0.94, 0, 0.62); L.push({ d: s[2] - 0.01, f: g => { if (pr.ca < -0.15 || Math.abs(pr.sa) > 0.5) { g.fillStyle = '#1f3c8a'; STAR(g, s[0], s[1], 0.15, 0.07, 5, -PI / 2); g.fill(); } } });
    },
    top(L, pr, hc, r) { ell(L, pr, [hc[0], hc[1], hc[2] + r * 1.12], r * 0.18, r * 0.18, r * 0.2, ['#ffe36b', '#e8b020', '#fffbe0'], null, -0.01); headLeaf(L, pr, [hc[0], hc[1], hc[2] + r * 1.2], -PI / 2 + 0.7, 0.34, LEAF, -0.02); }
  },
  { /* SAVOY — a cabbage-leaf kid in a sweetcorn kart */
    head: ['#d4f2a8', '#7fbf5a', '#f2ffe2'], torso: ['#ff9a45', '#d9622a', '#ffe2c8'], hub: '#7ed957',
    body(L, pr) {
      const c = [0, 0, 0.5], ax = 1.06, ay = 0.56, az = 0.42, D = [];
      for (let a = 0; a < 10; a++) for (let b = 0; b < 9; b++) D.push([0.25 + a * 0.27, b * 0.7]);
      ell(L, pr, c, ax, ay, az, ['#ffd23a', '#e0a21a', '#fff3b0'], g => surfDots(g, pr, c, ax, ay, az, D, 'rgba(224,150,20,.65)', 0.05));
      for (const s of [-1, 1]) ellV(L, pr, [-0.1, s * 0.6, 0.48], [0.95, 0, 0.1], [0, s * 0.1, 0], [0, 0, 0.3], LEAF, null, 0);
    },
    top(L, pr, hc, r) {   /* a hood of three crinkly cabbage leaves */
      const m = ['#a8e080', '#4f9e3a', '#e2ffd0'], vein = (g, e) => { g.strokeStyle = 'rgba(70,140,50,.6)'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(e.x, e.y + e.ey * 0.8); g.lineTo(e.x, e.y - e.ey * 0.7); g.stroke(); };
      ellV(L, pr, [hc[0] - r * 0.62, hc[1], hc[2] + r * 0.12], [r * 0.12, 0, 0], [0, r * 0.98, 0], [0, 0, r * 1.02], m, vein, 0.02);
      for (const sd of [-1, 1]) ellV(L, pr, [hc[0] - r * 0.1, hc[1] + sd * r * 0.8, hc[2] + r * 0.22], [r * 0.72, 0, 0], [0, sd * r * 0.12, 0], [0, 0, r * 0.86], m, vein, 0.01);
    }
  }
];
/* the whole racer → a list of painter items (far first) */
function racerList(who, a, pitch, o) {
  const pr = Proj(a, pitch), L = [], A = RA[who];
  if (!(o && o.headOnly)) {
    for (const [x, y] of [[0.64, 0.68], [0.64, -0.68], [-0.62, 0.7], [-0.62, -0.7]]) wheel(L, pr, x, y, x < 0 ? 0.33 : 0.29, A.hub);
    A.body(L, pr);
    for (const sd of [-1, 1]) ell(L, pr, [-1.02, sd * 0.32, 0.4], 0.13, 0.085, 0.085, ['#d8d0e8', '#8a80a3', '#ffffff']);
    ell(L, pr, [-0.5, 0, 0.8], 0.12, 0.32, 0.2, ['#fff6e0', '#d8c8a8', '#ffffff']);
    ell(L, pr, [-0.18, 0, 0.88], 0.2, 0.26, 0.24, A.torso);
    ell(L, pr, [0.22, 0, 0.98], 0.05, 0.2, 0.13, TYRE);
  }
  const r = 0.43, hc = [-0.16, 0, 1.38], tall = A.tall || 1;
  const he = ell(L, pr, hc, r, r, r * tall, A.head, g => face(g, pr, hc, r, o && o.mood));
  A.top(L, pr, hc, r);
  L.sort((p, q) => q.d - p.d);
  return { L, pr, he };
}
/* paint a racer into g, model origin (ground under the kart's middle) at (x, y), s px per metre */
function paintRacer(g, who, a, x, y, s, o) {
  const { L } = racerList(who, a, o && o.pitch, o);
  g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  for (const it of L) it.f(g);
  g.restore();
}
const KANG = 16, KSW = 3.1, KSH = 2.95, KAY = 2.55;   /* sprite: 3.1 x 2.75 m, ground at 2.4 m from the top */
let KART = [], HEADS = [];
function bakeRacers() {
  KART = []; const dens = Math.round((LOW ? 50 : 70) * Math.min(2, R) / 2 * 1.4);
  for (let w = 0; w < RA.length; w++) {
    const fr = [];
    for (let k = 0; k < KANG; k++) fr.push(sprite(KSW, KSH, g => paintRacer(g, w, k * TAU / KANG, KSW / 2, KAY, 1), dens));
    KART.push(fr);
  }
  HEADS = RA.map((_, w) => sprite(1.7, 1.7, g => paintRacer(g, w, PI, 0.85, 2.24, 1, { headOnly: 1, pitch: 0.12 }), 40 * R));
}

/* =====================================================================================================================
   SCENERY, BUBBLES AND ITEMS (baked billboards, metres → px at a density that suits their size)
   ===================================================================================================================== */
let SPR = {}, THEME = '';
function bb(w, h, dens, fn) { const c = sprite(w, h, fn, dens * Math.min(2, R) / 2 * (LOW ? 0.7 : 1)); c.mw = w; c.mh = h; return c; }
function blobs(g, list, cols, lw) {   /* overlapping round blobs with one merged outline */
  g.fillStyle = PAL.ink; for (const [x, y, r] of list) { circle(g, x, y, r + lw); g.fill(); }
  g.fillStyle = cols[1]; for (const [x, y, r] of list) { circle(g, x, y, r); g.fill(); }
  g.fillStyle = cols[0]; for (const [x, y, r] of list) { circle(g, x - r * 0.14, y - r * 0.18, r * 0.84); g.fill(); }
  g.fillStyle = cols[2]; for (const [x, y, r] of list) { g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.4, r * 0.3, r * 0.16, -0.6, 0, TAU); g.fill(); }
}
function flowerDot(g, x, y, r, col) { g.fillStyle = PAL.ink; circle(g, x, y, r * 1.35); g.fill(); g.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p * TAU / 5; circle(g, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.5); g.fill(); } g.fillStyle = PAL.gold; circle(g, x, y, r * 0.4); g.fill(); }
function sunflowerHead(g, x, y, r, tilt) {
  g.save(); g.translate(x, y); g.rotate(tilt);
  g.fillStyle = PAL.ink; for (let k = 0; k < 14; k++) { const a = k * TAU / 14; g.beginPath(); g.ellipse(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.5, r * 0.24, a, 0, TAU); g.fill(); }
  for (let k = 0; k < 14; k++) { const a = k * TAU / 14; g.fillStyle = k & 1 ? '#ffc81e' : '#ffd93b'; g.beginPath(); g.ellipse(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.42, r * 0.17, a, 0, TAU); g.fill(); }
  ball(g, 0, 0, r * 0.6, ['#a8703a', '#6a4020', '#e0b080'], r * 0.08);
  g.fillStyle = 'rgba(60,30,10,.45)'; for (let k = 0; k < 18; k++) { const a = k * 2.4, d = Math.sqrt(k / 18) * r * 0.5; circle(g, Math.cos(a) * d, Math.sin(a) * d, r * 0.05); g.fill(); }
  g.restore();
}
const SCENERY = {
  bush: () => bb(3.6, 2.8, 40, g => { blobs(g, [[0.8, 1.9, 0.75], [1.8, 1.45, 1.0], [2.8, 1.9, 0.72], [1.3, 2.2, 0.6], [2.3, 2.2, 0.6]], ['#4cb85a', '#2f8f4a', '#9be88a'], 0.09); flowerDot(g, 1.4, 1.2, 0.13, '#fff'); flowerDot(g, 2.5, 1.6, 0.12, '#ffd0e0'); flowerDot(g, 0.8, 1.8, 0.11, '#fff3a0'); }),
  sunL: () => bb(5.2, 7.6, 30, g => sunStalk(g, -1)), sunR: () => bb(5.2, 7.6, 30, g => sunStalk(g, 1)),
  sunflower: () => bb(2.6, 5, 30, g => { g.strokeStyle = PAL.ink; g.lineWidth = 0.32; g.beginPath(); g.moveTo(1.3, 5); g.lineTo(1.3, 1.6); g.stroke(); g.strokeStyle = '#5fae3a'; g.lineWidth = 0.16; g.stroke(); leaf(g, 1.3, 3.4, -0.5, 0.9, LEAF, 0.08); leaf(g, 1.3, 3.0, PI + 0.5, 0.9, LEAF, 0.08); sunflowerHead(g, 1.3, 1.25, 0.9, 0.1); }),
  tree: () => bb(7, 8.6, 24, g => {
    g.fillStyle = PAL.ink; g.fillRect(3.0, 4.5, 1.0, 4.1); g.fillStyle = '#a8703a'; g.fillRect(3.15, 4.5, 0.7, 4.0); g.fillStyle = '#c8905a'; g.fillRect(3.2, 4.6, 0.2, 3.8);
    blobs(g, [[2.2, 3.6, 1.6], [3.5, 2.4, 2.0], [4.9, 3.5, 1.6], [3.5, 4.2, 1.6], [1.8, 2.4, 1.1], [5.2, 2.2, 1.1]], ['#5cc85a', '#2f8f4a', '#b6f07a'], 0.14);
    for (let k = 0; k < 7; k++) ball(g, 1.8 + hash(k, 2) * 3.6, 1.6 + hash(k, 3) * 3, 0.22, k & 1 ? ['#ff5a66', '#c22d4f', '#ffd0d5'] : ['#ffd93b', '#f0a020', '#fffbe0'], 0.07);
  }),
  pumpkin: () => bb(2.4, 1.9, 40, g => { ball(g, 1.2, 1.15, 0.72, ['#ff9a45', '#d9622a', '#ffe2c8'], 0.08); g.strokeStyle = '#d9622a'; g.lineWidth = 0.06; for (const k of [-0.35, 0, 0.35]) { g.beginPath(); g.ellipse(1.2 + k, 1.15, 0.2, 0.62, 0, 0, TAU); g.stroke(); } g.strokeStyle = PAL.ink; g.lineWidth = 0.2; g.beginPath(); g.moveTo(1.2, 0.5); g.lineTo(1.3, 0.25); g.stroke(); g.strokeStyle = '#6a8a3a'; g.lineWidth = 0.1; g.stroke(); leaf(g, 1.3, 0.4, -0.3, 0.6, LEAF, 0.07); }),
  cabbage: () => bb(2.2, 1.7, 40, g => { blobs(g, [[0.6, 1.1, 0.5], [1.6, 1.1, 0.5], [1.1, 0.9, 0.62]], ['#b8e890', '#5fae3a', '#eaffd8'], 0.08); g.strokeStyle = '#5fae3a'; g.lineWidth = 0.05; g.beginPath(); g.moveTo(1.1, 1.4); g.quadraticCurveTo(1.0, 0.9, 1.15, 0.45); g.stroke(); }),
  greenhouse: () => bb(22, 11.5, 16, g => {
    const x0 = 1, x1 = 21, yb = 11.2, ye = 5.2, yr = 1.2;
    g.lineJoin = 'round';
    const shape = () => { g.beginPath(); g.moveTo(x0, yb); g.lineTo(x0, ye); g.lineTo(11, yr); g.lineTo(x1, ye); g.lineTo(x1, yb); g.closePath(); };
    shape(); g.fillStyle = PAL.ink; g.strokeStyle = PAL.ink; g.lineWidth = 0.6; g.stroke();
    const gr = g.createLinearGradient(0, yr, 0, yb); gr.addColorStop(0, '#d8f3ff'); gr.addColorStop(1, '#9fd8f0'); g.fillStyle = gr; g.fill();
    blobs(g, [[4, 10, 1.4], [7, 10.2, 1.2], [10, 9.8, 1.6], [13.5, 10.2, 1.3], [17, 10, 1.5], [19.4, 10.4, 1]], ['#7ed957', '#3f9a3a', '#e2ffd2'], 0.12);
    for (let k = 0; k < 6; k++) flowerDot(g, 3 + k * 3.2, 9.2 + (k & 1) * 0.6, 0.28, ['#ff7a8a', '#ffd93b', '#fff', '#ffb27a', '#d7c4ff', '#ff9ac0'][k]);
    g.strokeStyle = '#fff6e0'; g.lineWidth = 0.32; shape(); g.stroke();
    for (let x = x0 + 2.5; x < x1; x += 2.5) { const yt = x < 11 ? ye - (x - x0) / (11 - x0) * (ye - yr) : ye - (x1 - x) / (x1 - 11) * (ye - yr); g.beginPath(); g.moveTo(x, yb); g.lineTo(x, yt); g.stroke(); }
    g.beginPath(); g.moveTo(x0, ye + 2.6); g.lineTo(x1, ye + 2.6); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let x = x0 + 0.6; x < x1 - 1; x += 5) { g.beginPath(); g.moveTo(x, yb - 0.6); g.lineTo(x + 0.7, yb - 0.6); g.lineTo(x + 1.8, ye + 0.4); g.lineTo(x + 1.1, ye + 0.4); g.closePath(); g.fill(); }
    g.fillStyle = PAL.ink; g.fillRect(9.6, 7.6, 2.8, 3.6); g.fillStyle = '#ffb27a'; g.fillRect(9.9, 7.9, 2.2, 3.3);
  }),
  arch: () => bb(20, 7.8, 20, g => archDraw(g, 20, 7.8)),
  puffP: () => bb(8, 5.6, 20, g => blobs(g, [[1.6, 3.8, 1.3], [3.2, 2.8, 1.8], [5.0, 3.0, 1.6], [6.5, 3.9, 1.2], [4.0, 4.3, 1.3]], ['#ffd0ec', '#f29ccf', '#ffffff'], 0.12)),
  puffB: () => bb(8, 5.6, 20, g => blobs(g, [[1.6, 3.8, 1.3], [3.2, 2.8, 1.8], [5.0, 3.0, 1.6], [6.5, 3.9, 1.2], [4.0, 4.3, 1.3]], ['#d8ecff', '#9cc8f2', '#ffffff'], 0.12)),
  lamp: () => bb(1.6, 5.6, 40, g => { g.fillStyle = PAL.ink; g.fillRect(0.62, 1.2, 0.36, 4.4); g.fillStyle = '#fff6e0'; g.fillRect(0.7, 1.2, 0.2, 4.3); g.fillStyle = '#ff9ac0'; for (let y = 1.5; y < 5.4; y += 0.6) g.fillRect(0.7, y, 0.2, 0.25); inkStar(g, 0.8, 0.85, 0.62, -PI / 2, PAL.sun, 0.09); twinkle(g, 0.55, 0.6, 0.18, 0, '#fff'); }),
  rainbow: () => bb(21, 10, 18, g => {
    const cols = ['#ff7a8a', '#ffb24a', '#ffe36b', '#8fe07a', '#7fd0ff', '#b9a2ff'], cx = 10.5, cy = 10, R0 = 9.6, bw = 0.62;
    g.lineCap = 'butt'; g.strokeStyle = PAL.ink; g.lineWidth = bw * 6 + 0.4; g.beginPath(); g.arc(cx, cy, R0 - bw * 2.5, PI, TAU); g.stroke();
    cols.forEach((c, k) => { g.strokeStyle = c; g.lineWidth = bw; g.beginPath(); g.arc(cx, cy, R0 - k * bw, PI, TAU); g.stroke(); });
    blobs(g, [[1.4, 9.0, 1.1], [2.8, 9.3, 0.9], [0.8, 9.6, 0.7]], ['#ffffff', '#f2d8ec', '#ffffff'], 0.1);
    blobs(g, [[19.6, 9.0, 1.1], [18.2, 9.3, 0.9], [20.2, 9.6, 0.7]], ['#ffffff', '#f2d8ec', '#ffffff'], 0.1);
  }),
  balloons: () => bb(3, 6, 30, g => balloonBunch(g, 1.5, 1.6, 1)),
  post: () => bb(1.4, 2.4, 40, g => { g.fillStyle = PAL.ink; rrect(g, 0.25, 0.3, 0.9, 2.1, 0.2); g.fill(); g.save(); rrect(g, 0.35, 0.4, 0.7, 1.95, 0.15); g.clip(); g.fillStyle = PAL.sun; g.fillRect(0, 0, 2, 3); g.fillStyle = PAL.plum; for (let y = 0; y < 3; y += 0.6) { g.beginPath(); g.moveTo(0, y); g.lineTo(1.4, y + 0.5); g.lineTo(1.4, y + 0.8); g.lineTo(0, y + 0.3); g.fill(); } g.restore(); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0.45, 0.5, 0.12, 1.6); }),
  chimney: () => bb(6, 18, 14, g => {
    g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(1.1, 18); g.lineTo(1.6, 2.0); g.lineTo(4.4, 2.0); g.lineTo(4.9, 18); g.closePath(); g.fill();
    g.fillStyle = '#c8645a'; g.beginPath(); g.moveTo(1.5, 18); g.lineTo(1.9, 2.4); g.lineTo(4.1, 2.4); g.lineTo(4.5, 18); g.closePath(); g.fill();
    g.fillStyle = '#a84a44'; for (let y = 3; y < 18; y += 0.8) for (let x = 1.6 + ((y * 1.25) | 0) % 2 * 0.5; x < 4.4; x += 1.0) g.fillRect(x, y, 0.5, 0.12);
    g.fillStyle = '#e8908a'; g.fillRect(2.0, 2.6, 0.3, 15.2);
    g.fillStyle = PAL.ink; rrect(g, 1.0, 1.2, 4.0, 1.4, 0.3); g.fill(); g.fillStyle = PAL.sun; rrect(g, 1.2, 1.4, 3.6, 1.0, 0.25); g.fill(); g.fillStyle = PAL.plum; for (let x = 1.4; x < 4.6; x += 0.8) g.fillRect(x, 1.5, 0.35, 0.8);
  }),
  gear: () => bb(9, 9, 18, g => gearDraw(g, 4.5, 4.5, 4.2, ['#a3abc8', '#6b7090', '#e4e8f8'])),
  crate: () => bb(2.6, 2.4, 40, g => { g.fillStyle = PAL.ink; g.fillRect(0.15, 0.15, 2.3, 2.15); g.fillStyle = '#d8a060'; g.fillRect(0.3, 0.3, 2.0, 1.85); g.fillStyle = '#b07838'; for (const y of [0.75, 1.3, 1.85]) g.fillRect(0.3, y, 2.0, 0.1); for (let k = 0; k < 4; k++) ball(g, 0.65 + k * 0.45, 0.42, 0.18, ['#ff9a45', '#d9622a', '#ffe2c8'], 0.05); leaf(g, 0.6, 0.2, -1.2, 0.3, LEAF, 0.05); leaf(g, 1.9, 0.2, -1.9, 0.3, LEAF, 0.05); }),
  pipe: () => bb(4, 3.4, 30, g => { g.fillStyle = PAL.ink; rrect(g, 0.1, 1.6, 3.8, 1.5, 0.4); g.fill(); g.fillStyle = '#7fb0c8'; rrect(g, 0.25, 1.75, 3.5, 1.2, 0.3); g.fill(); g.fillStyle = '#c8e8f8'; g.fillRect(0.4, 1.9, 3.2, 0.2); g.fillStyle = PAL.ink; g.fillRect(1.8, 0.7, 0.4, 1.0); gearDraw(g, 2, 0.75, 0.62, ['#ff7a8a', '#c22d4f', '#ffd0d5']); })
};
function sunStalk(g, side) {   /* the tunnel's giant sunflowers lean over the road */
  const bx = side < 0 ? 1.4 : 3.8, hx = side < 0 ? 3.7 : 1.5;
  g.strokeStyle = PAL.ink; g.lineWidth = 0.42; g.beginPath(); g.moveTo(bx, 7.6); g.quadraticCurveTo(bx, 3.2, hx, 1.9); g.stroke();
  g.strokeStyle = '#5fae3a'; g.lineWidth = 0.22; g.stroke();
  leaf(g, bx + 0.05, 5.6, side < 0 ? -0.6 : PI + 0.6, 1.3, LEAF, 0.1); leaf(g, bx + 0.1, 4.3, side < 0 ? PI + 0.5 : -0.5, 1.1, LEAF, 0.1);
  sunflowerHead(g, hx, 1.55, 1.25, side * 0.3);
}
function archDraw(g, w, h) {
  for (const x of [0.9, w - 0.9]) { g.fillStyle = PAL.ink; g.fillRect(x - 0.45, 1.2, 0.9, h - 1.2); g.fillStyle = '#8a6a3a'; g.fillRect(x - 0.3, 1.2, 0.6, h - 1.3); for (let y = 2; y < h; y += 1.2) leaf(g, x, y, (y * 3) % 2 ? -0.6 : PI + 0.6, 0.7, LEAF, 0.08); }
  g.fillStyle = PAL.ink; rrect(g, 0.2, 0.2, w - 0.4, 2.2, 0.5); g.fill();
  g.save(); rrect(g, 0.4, 0.4, w - 0.8, 1.8, 0.4); g.clip();
  for (let x = 0; x < w; x += 0.9) for (let r = 0; r < 2; r++) { g.fillStyle = ((x / 0.9 | 0) + r) & 1 ? PAL.plum : PAL.cream; g.fillRect(0.4 + x, 0.4 + r * 0.9, 0.9, 0.9); }
  g.restore();
  for (let k = 0; k < 7; k++) flowerDot(g, 1.6 + k * (w - 3.2) / 6, 0.3, 0.32, ['#ff7a8a', '#ffd93b', '#fff', '#ffb27a', '#d7c4ff', '#ff9ac0', '#b6f07a'][k]);
}
function gearDraw(g, cx, cy, r, m) {
  g.save(); g.translate(cx, cy);
  const teeth = 12, path = () => { g.beginPath(); for (let k = 0; k < teeth * 4; k++) { const a = k * TAU / (teeth * 4), q = (k % 4 < 2) ? r : r * 0.8; g.lineTo(Math.cos(a) * q, Math.sin(a) * q); } g.closePath(); };
  path(); g.lineJoin = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = r * 0.09; g.stroke(); g.fillStyle = m[1]; g.fill();
  g.fillStyle = m[0]; circle(g, -r * 0.05, -r * 0.06, r * 0.72); g.fill();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(-r * 0.3, -r * 0.36, r * 0.24, r * 0.11, -0.6, 0, TAU); g.fill();
  g.fillStyle = PAL.ink; circle(g, 0, 0, r * 0.26); g.fill(); g.fillStyle = m[1]; circle(g, 0, 0, r * 0.16); g.fill();
  for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + 0.3; g.fillStyle = PAL.ink; circle(g, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.09); g.fill(); }
  g.restore();
}
function balloonBunch(g, x, y, s) {
  const B = [[-0.55, 0.1, '#ff7a8a'], [0.55, 0.0, '#7fd0ff'], [0, -0.55, '#ffd93b'], [0.05, 0.55, '#b6f07a']];
  g.strokeStyle = PAL.ink; g.lineWidth = 0.06 * s; for (const b of B) { g.beginPath(); g.moveTo(x + b[0] * s, y + b[1] * s + 0.45 * s); g.quadraticCurveTo(x + b[0] * s * 0.3, y + 2.4 * s, x, y + 3.6 * s); g.stroke(); }
  for (const b of B) ball(g, x + b[0] * s, y + b[1] * s, 0.52 * s, [b[2], mix(b[2], '#2b2140', 0.3), '#ffffff'], 0.08 * s);
}
function bakeTheme(theme) {
  if (THEME === theme && SPR.ok) return;
  THEME = theme; const keep = { box: SPR.box, bomb: SPR.bomb, seed: SPR.seed, berry: SPR.berry, balloon: SPR.balloon, icons: SPR.icons, ok: false };
  SPR = keep;
  const need = { meadows: ['bush', 'sunL', 'sunR', 'sunflower', 'tree', 'pumpkin', 'cabbage', 'greenhouse', 'arch'], skyway: ['puffP', 'puffB', 'lamp', 'rainbow', 'balloons', 'arch'], works: ['post', 'chimney', 'gear', 'crate', 'pipe', 'arch'] }[theme] || [];
  for (const k of need) SPR[k] = SCENERY[k]();
  SPR.ok = true;
}
/* item art (baked once per scale) */
function itemIcon(g, kind, x, y, s) {
  if (kind === 'boost') berryGold(g, x, y, s);
  else if (kind === 'boost3') { berryGold(g, x - 9 * s, y + 5 * s, s * 0.7); berryGold(g, x + 9 * s, y + 5 * s, s * 0.7); berryGold(g, x, y - 6 * s, s * 0.7); }
  else if (kind === 'splat') { g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(x, y + 5 * s, 15 * s, 8 * s, 0, 0, TAU); g.fill(); g.fillStyle = '#9b4fd0'; g.beginPath(); g.ellipse(x, y + 5 * s, 13 * s, 6.4 * s, 0, 0, TAU); g.fill(); g.fillStyle = '#c88af0'; g.beginPath(); g.ellipse(x - 4 * s, y + 3 * s, 5 * s, 2 * s, 0, 0, TAU); g.fill(); ball(g, x + 2 * s, y - 7 * s, 6 * s, ['#7a5cff', '#4a2ab8', '#e0d8ff'], 1.8 * s); g.fillStyle = '#9b4fd0'; for (const [a, b] of [[-11, -2], [11, -1], [7, -11]]) { circle(g, x + a * s, y + b * s, 2 * s); g.fill(); } }
  else if (kind === 'bomb') { ball(g, x, y + 1 * s, 11 * s, ['#4f86ff', '#2a4fb8', '#d6e6ff'], 2.2 * s); g.fillStyle = '#1f3c8a'; STAR(g, x, y - 9 * s, 4 * s, 1.8 * s, 5, -PI / 2); g.fill(); leaf(g, x + 1 * s, y - 10 * s, -0.7, 9 * s, LEAF, 1.8 * s); }
  else if (kind === 'seed') { leaf(g, x - 2 * s, y - 2 * s, PI + 0.5, 11 * s, LEAF, 1.8 * s); leaf(g, x + 2 * s, y - 2 * s, -0.5, 11 * s, LEAF, 1.8 * s); g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(x, y + 2 * s, 7.5 * s, 10 * s, 0, 0, TAU); g.fill(); g.fillStyle = '#c8905a'; g.beginPath(); g.ellipse(x, y + 2 * s, 5.5 * s, 8 * s, 0, 0, TAU); g.fill(); g.fillStyle = '#f0c890'; g.beginPath(); g.ellipse(x - 2 * s, y - 1 * s, 1.8 * s, 3.5 * s, 0, 0, TAU); g.fill(); eye(g, x - 2.2 * s, y + 2 * s, 4 * s, 1, 'open', 0.8 * s); eye(g, x + 2.2 * s, y + 2 * s, 4 * s, 1, 'open', 0.8 * s); }
  else if (kind === 'shield') { g.fillStyle = 'rgba(160,220,255,.35)'; circle(g, x, y, 13 * s); g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = 2.6 * s; g.stroke(); g.strokeStyle = '#bfe8ff'; g.lineWidth = 1.4 * s; circle(g, x, y, 12.2 * s); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - 5 * s, y - 6 * s, 4 * s, 2 * s, -0.6, 0, TAU); g.fill(); twinkle(g, x + 6 * s, y + 5 * s, 2.5 * s, 0, '#fff'); }
  else if (kind === 'star') { g.lineJoin = 'round'; STAR(g, x, y + 1 * s, 13 * s, 7 * s, 5, -PI / 2); g.strokeStyle = PAL.ink; g.lineWidth = 2.6 * s; g.stroke(); g.fillStyle = '#ffd93b'; g.fill(); STAR(g, x, y + 1 * s, 6 * s, 3 * s, 5, -PI / 2); g.fillStyle = '#fff3a0'; g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - 4 * s, y - 3 * s, 2.5 * s, 1.2 * s, -0.6, 0, TAU); g.fill(); }
}
function berryGold(g, x, y, s) { ball(g, x, y + 1 * s, 10 * s, ['#ffd93b', '#f0a020', '#fffbe0'], 2.2 * s); leaf(g, x + 1 * s, y - 8 * s, -0.4, 8 * s, LEAF, 1.8 * s); twinkle(g, x + 7 * s, y - 6 * s, 3 * s, 0, '#fff'); }
function bakeItems() {
  SPR.box = bb(2.2, 2.2, 50, g => {
    const x = 1.1, y = 1.1, r = 0.92;
    const gr = g.createRadialGradient(x - 0.3, y - 0.3, 0.1, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.6, 'rgba(200,170,255,.45)'); gr.addColorStop(1, 'rgba(255,160,220,.6)');
    g.fillStyle = gr; circle(g, x, y, r); g.fill();
    const rb = ['#ff7a8a', '#ffb24a', '#ffe36b', '#8fe07a', '#7fd0ff', '#b9a2ff'];
    rb.forEach((c, k) => { g.strokeStyle = c; g.lineWidth = 0.07; g.beginPath(); g.arc(x, y, r - 0.04 - k * 0.055, PI * 0.6 + k * 0.08, PI * 1.5 - k * 0.04); g.stroke(); });
    g.strokeStyle = PAL.ink; g.lineWidth = 0.08; circle(g, x, y, r + 0.03); g.stroke();
    inkStar(g, x, y + 0.04, 0.42, -PI / 2, PAL.sun, 0.06); twinkle(g, x - 0.38, y - 0.42, 0.18, 0, '#fff');
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(x - 0.42, y - 0.5, 0.22, 0.1, -0.6, 0, TAU); g.fill();
  });
  SPR.bomb = bb(1.2, 1.4, 60, g => itemIcon(g, 'bomb', 0.6, 0.78, 0.045));
  SPR.seed = bb(1.2, 1.2, 60, g => itemIcon(g, 'seed', 0.6, 0.6, 0.042));
  SPR.balloon = bb(3, 6, 30, g => balloonBunch(g, 1.5, 1.6, 1));
  SPR.icons = {}; for (const k of ['boost', 'boost3', 'splat', 'bomb', 'seed', 'shield', 'star']) SPR.icons[k] = sprite(40, 40, g => itemIcon(g, k, 20, 20, 1.2));
}

/* =====================================================================================================================
   SKY BANDS (baked per theme, tile wraps; drawn so a full turn of the camera scrolls a full turn of sky)
   ===================================================================================================================== */
const THEMES = {
  meadows: { top: '#62bff5', hor: '#d8f3ff', haze: '#d6f0e0', border: [95, 176, 74] },
  skyway: { top: '#ff9fd6', hor: '#ffe8f6', haze: '#ffe6f4', border: [150, 205, 255] },
  works: { top: '#ff8f6a', hor: '#ffe0a8', haze: '#ffd9b0', border: [88, 92, 120] }
};
let SKY = null;
function bakeSky(theme) {
  const TWL = 1400, H = 150, SR = R * (LOW ? 0.5 : 0.75), far = canvas(TWL * SR, H * SR), near = canvas(TWL * SR, H * SR);
  for (const [c, layer] of [[far, 0], [near, 1]]) {
    const g = c.getContext('2d'); g.scale(SR, SR); g.lineJoin = 'round';
    const tile = (fn) => { for (const dx of [-TWL, 0, TWL]) { g.save(); g.translate(dx, 0); fn(); g.restore(); } };
    if (theme === 'meadows') {
      if (!layer) tile(() => { for (let k = 0; k < 9; k++) { const x = hash(k, 3) * TWL, y = 20 + hash(k, 4) * 40, s = 0.7 + hash(k, 5) * 0.8; g.globalAlpha = 0.95; blobs(g, [[x, y, 18 * s], [x + 22 * s, y - 8 * s, 22 * s], [x + 46 * s, y, 16 * s]], ['#ffffff', '#dceffa', '#ffffff'], 2.5); g.globalAlpha = 1; } hills(g, TWL, H, 104, 26, 5, ['#9fd6a0', '#7fbf88', '#c8f0c8'], 2); });
      else tile(() => { hills(g, TWL, H, 122, 20, 9, ['#5cb85a', '#3f9a3a', '#9be88a'], 3); for (let k = 0; k < 26; k++) { const x = hash(k, 9) * TWL, y = H - 22 - hash(k, 8) * 12; blobs(g, [[x, y - 9, 8], [x + 8, y - 13, 9], [x + 16, y - 8, 7]], ['#4cb85a', '#2f8f4a', '#9be88a'], 2); g.fillStyle = PAL.ink; g.fillRect(x + 6, y - 4, 4, 9); } });
    } else if (theme === 'skyway') {
      if (!layer) tile(() => {
        g.lineCap = 'butt'; ['#ff7a8a', '#ffb24a', '#ffe36b', '#8fe07a', '#7fd0ff', '#b9a2ff'].forEach((col, k) => { g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = 7; g.beginPath(); g.arc(700, 190, 170 - k * 7, PI * 1.08, PI * 1.92); g.stroke(); }); g.globalAlpha = 1;
        for (let k = 0; k < 8; k++) { const x = hash(k, 13) * TWL, y = 40 + hash(k, 14) * 50, s = 0.9 + hash(k, 15); blobs(g, [[x, y, 20 * s], [x + 26 * s, y - 10 * s, 26 * s], [x + 54 * s, y, 18 * s]], k & 1 ? ['#ffd0ec', '#f29ccf', '#ffffff'] : ['#e4d8ff', '#b9a2ff', '#ffffff'], 2.5); }
      });
      else tile(() => { for (let k = 0; k < 40; k++) { const x = k * TWL / 40 + hash(k, 2) * 20, y = H - 8 - hash(k, 3) * 14, r = 16 + hash(k, 4) * 14; blobs(g, [[x, y, r]], hash(k, 5) < 0.5 ? ['#ffffff', '#f2d8ec', '#ffffff'] : ['#ffe0f2', '#f2b8dc', '#ffffff'], 2.5); } });
    } else {
      if (!layer) tile(() => { g.fillStyle = 'rgba(255,240,200,.85)'; circle(g, 980, 92, 34); g.fill(); for (let k = 0; k < 7; k++) { const x = hash(k, 23) * TWL, y = 26 + hash(k, 24) * 40, s = 0.8 + hash(k, 25) * 0.7; g.globalAlpha = 0.8; blobs(g, [[x, y, 16 * s], [x + 20 * s, y - 7 * s, 20 * s], [x + 42 * s, y, 14 * s]], ['#ffe8d8', '#f2b8a8', '#ffffff'], 2); g.globalAlpha = 1; } });
      else tile(() => {
        g.fillStyle = PAL.plum; g.strokeStyle = PAL.ink; g.lineWidth = 3;
        for (let k = 0; k < 18; k++) { const x = k * TWL / 18, w = 50 + hash(k, 2) * 40, h = 26 + hash(k, 3) * 40; g.fillStyle = k & 1 ? '#5a4a7b' : PAL.plum; g.beginPath(); g.rect(x, H - h, w, h + 2); g.fill(); g.stroke(); g.fillStyle = '#ffd93b'; for (let wy = H - h + 8; wy < H - 8; wy += 12) for (let wx = x + 8; wx < x + w - 10; wx += 14) if (hash(wx | 0, wy | 0) < 0.6) g.fillRect(wx, wy, 6, 6); if (hash(k, 7) < 0.6) { g.fillStyle = '#7a5a8b'; g.beginPath(); g.rect(x + w * 0.6, H - h - 30, 12, 32); g.fill(); g.stroke(); } }
        for (let k = 0; k < 4; k++) gearDraw(g, 150 + k * 350, H - 40, 26, ['#8a7aa8', '#5a4a7b', '#c8b8e8']);
      });
    }
  }
  SKY = { theme, far, near, TWL, H };
}
function hills(g, TWL, H, base, amp, n, m, lw) {
  g.beginPath(); g.moveTo(-10, H + 10);
  for (let x = -10; x <= TWL + 10; x += 10) g.lineTo(x, base - amp * (0.5 + 0.5 * Math.sin(x / TWL * TAU * n + 0.3) * Math.cos(x / TWL * TAU * 2)));
  g.lineTo(TWL + 10, H + 10); g.closePath(); g.strokeStyle = PAL.ink; g.lineWidth = lw; g.stroke(); g.fillStyle = m[0]; g.fill();
}

/* =====================================================================================================================
   THE TRACK FLOOR: mip-mapped texels as Uint32, one ImageData per view, per-row distance tables
   ===================================================================================================================== */
let TR = null;   /* {T, tex:[Uint32Array], size:[], shift:[], border, map} */
function prepTrack(T) {
  if (TR && TR.T === T) return TR;
  const c = SK.trackTexture(T), lv = [], size = [], shift = [];
  let src = c;
  for (let l = 0; l < 6; l++) {
    const sz = c.width >> l; let cv = src;
    if (l) { cv = canvas(sz, sz); const g = cv.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, sz, sz); }
    const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sz, sz);
    lv.push(new Uint32Array(d.data.buffer)); size.push(sz); shift.push(Math.round(Math.log2(sz)));
    src = cv;
  }
  const b = THEMES[T.theme].border, border = (255 << 24 | b[2] << 16 | b[1] << 8 | b[0]) >>> 0;
  const map = canvas(128, 128); map.getContext('2d').drawImage(c, 0, 0, 128, 128);
  T._tex = null; if (SK.dropTextures) SK.dropTextures(null);
  TR = { T, tex: lv, size, shift, border, map, mm: null };
  return TR;
}
function mkView() { return { vw: 0, vh: 0, split: -1, hz: 0, f: 0, camH: 0, dist: 0, cv: null, g: null, img: null, u32: null, cam: { x: 0, y: 0, dir: 0, ok: false, fx: 0, fy: 0 } }; }
const VIEWS = [mkView(), mkView(), mkView()];
function viewSetup(V, vw, vh, split) {
  if (V.vw === vw && V.vh === vh && V.split === split) return;
  V.vw = vw; V.vh = vh; V.split = split;
  V.f = split ? vh * 1.62 : vh * 1.12; V.hz = Math.round(vh * (split ? 0.3 : 0.35)); V.dist = split ? 9 : 7.4;
  V.camH = (vh * (split ? 0.9 : 0.89) - V.hz) * V.dist / V.f;
  V.cv = canvas(vw, vh); V.g = V.cv.getContext('2d'); V.img = V.g.createImageData(vw, vh); V.u32 = new Uint32Array(V.img.data.buffer);
  /* per-row tables: distance to the floor seen on that row, and which mip level suits it */
  V.rowK = new Float64Array(vh); V.rowLv = new Uint8Array(vh); const TPM = SK.WORLD.TPM;
  for (let y = V.hz + 1; y < vh; y++) { const k = V.camH / (y - V.hz + 0.5); let lv = 0; while (lv < 5 && k * TPM > (2 << lv) * 0.75) lv++; V.rowK[y] = k; V.rowLv[y] = lv; }
}
function drawFloor(V, M, cx, cy, dir) {
  const vw = V.vw, vh = V.vh, hz = V.hz, f = V.f, u32 = V.u32, TPM = SK.WORLD.TPM, cs = Math.cos(dir), sn = Math.sin(dir), border = M.border;
  const rowK = V.rowK, rowLv = V.rowLv;
  for (let y = hz + 1; y < vh; y++) {
    const k = rowK[y], z = k * f, lv = rowLv[y];
    const sc = TPM / (1 << lv), tex = M.tex[lv], sz = M.size[lv], sh = M.shift[lv];
    const off = (0.5 - vw / 2) * k;
    let u = (cx + cs * z - sn * off) * sc, v = (cy + sn * z + cs * off) * sc;
    const du = -sn * k * sc, dv = cs * k * sc;
    let o = y * vw;
    for (let x = 0; x < vw; x++) {
      const iu = u | 0, iv = v | 0;
      u32[o++] = (iu >>> 0) < sz && (iv >>> 0) < sz && u >= 0 && v >= 0 ? tex[(iv << sh) + iu] : border;
      u += du; v += dv;
    }
  }
  V.g.putImageData(V.img, 0, 0, 0, hz + 1, vw, vh - hz - 1);
}

/* =====================================================================================================================
   WORLD EFFECTS (render side only: sparks, puffs, dust, splashes, smoke)
   ===================================================================================================================== */
const PARTS = [];
function part(k, x, y, z, vx, vy, vz, life, c, s) { if (PARTS.length > 600) return; PARTS.push({ k, x, y, z, vx, vy, vz, age: 0, life, c, s }); }
const MTC = ['#ffffff', '#8fe07a', '#ffb24a', '#ffd93b'];
let fxT = 0;
function fxTick(sim) {
  fxT++;
  const T = sim.track;
  for (const k of sim.karts) {
    if (k.fall || k.lift) continue;
    const c = Math.cos(k.dir), s = Math.sin(k.dir), bx = k.x - c * 1.0, by = k.y - s * 1.0;
    if (k.drift && k.mt) for (const sd of [-1, 1]) { const wx = bx - s * sd * 0.7, wy = by + c * sd * 0.7; if (hash(fxT, k.i * 7 + sd) < 0.8) part('spark', wx, wy, 0.15, -c * 2 + (hash(fxT, k.i) - 0.5) * 4, -s * 2 + (hash(k.i, fxT) - 0.5) * 4, 2 + hash(fxT + 3, k.i) * 3, 14, MTC[k.mt], 0.12 + k.mt * 0.03); }
    else if (k.drift && fxT % 3 === 0) part('puff', bx, by, 0.2, -c, -s, 0.6, 18, '#ffffff', 0.25);
    if (k.boost) for (const sd of [-1, 1]) part('flame', bx - c * 0.2 - s * sd * 0.32, by - s * 0.2 + c * sd * 0.32, 0.42, -c * 2.5, -s * 2.5, 0.6, 7, (fxT + sd) & 2 ? '#ffb24a' : '#ffe36b', 0.13);
    if (k.surf === 0 && Math.abs(k.v) > 7 && fxT % 3 === 0 && T.theme !== 'skyway') part('puff', bx, by, 0.15, -c * 2, -s * 2, 1, 22, T.theme === 'works' ? '#b8b0c8' : '#d8c08a', 0.3);
    if (k.surf === 0 && Math.abs(k.v) > 7 && fxT % 3 === 0 && T.theme === 'skyway') part('puff', bx, by, 0.15, -c * 2, -s * 2, 1, 22, '#ffffff', 0.35);
    if (k.star && fxT % 2 === 0) part('twinkle', k.x + (hash(fxT, k.i) - 0.5) * 2, k.y + (hash(k.i, fxT) - 0.5) * 2, 0.5 + hash(fxT, 9) * 1.5, 0, 0, 1, 20, ['#ffd93b', '#ff9ac0', '#7fd0ff', '#b6f07a'][fxT % 4], 0.25);
  }
  if (T.theme === 'works' && fxT % 14 === 0) for (const d of T.deco) if (d.smoke) part('smoke', d.x + (hash(fxT, d.x | 0) - 0.5), d.y, 17.5, (hash(d.y | 0, fxT) - 0.5) * 0.8, 0.4, 2.2, 150, '#f4eef8', 1.2);
  let w = 0;
  for (let i = 0; i < PARTS.length; i++) {
    const p = PARTS[i]; p.age++; if (p.age >= p.life) continue;
    p.x += p.vx / 60; p.y += p.vy / 60; p.z += p.vz / 60;
    if (p.k === 'spark' || p.k === 'drop') { p.vz -= 18 / 60; if (p.z < 0) { p.z = 0; p.vz *= -0.3; } }
    p.vx *= 0.95; p.vy *= 0.95;
    PARTS[w++] = p;
  }
  PARTS.length = w;
}
function fxEvent(sim, e) {
  const k = e[1] >= 0 ? sim.karts[e[1]] : null, n = e[0];
  if (n === 'hit' && k) { for (let j = 0; j < 12; j++) { const a = j * TAU / 12; part('drop', k.x, k.y, 0.8, Math.cos(a) * 4, Math.sin(a) * 4, 3 + (j & 1) * 2, 34, e[2] === 'bomb' ? '#5f90ff' : e[2] === 'seed' ? '#8fe07a' : '#9b4fd0', 0.22); } for (let j = 0; j < 5; j++) part('twinkle', k.x, k.y, 1.6, Math.cos(j * 1.3) * 2, Math.sin(j * 1.3) * 2, 0.6, 30, '#fff', 0.3); }
  else if (n === 'box' && k) { for (let j = 0; j < 10; j++) { const a = j * TAU / 10; part('twinkle', k.x, k.y, 1.2, Math.cos(a) * 3, Math.sin(a) * 3, 2, 26, ['#ff7a8a', '#ffd93b', '#8fe07a', '#7fd0ff', '#b9a2ff'][j % 5], 0.25); } }
  else if (n === 'turbo' && k) { for (let j = 0; j < 6; j++) part('flame', k.x - Math.cos(k.dir), k.y - Math.sin(k.dir), 0.5, -Math.cos(k.dir) * 5 + (hash(j, 3) - 0.5) * 3, -Math.sin(k.dir) * 5 + (hash(j, 4) - 0.5) * 3, 0.8, 18, MTC[e[2]] || '#ffd93b', 0.5); }
  else if (n === 'shield' && e[2] === 'pop' && k) { for (let j = 0; j < 10; j++) { const a = j * TAU / 10; part('twinkle', k.x, k.y, 1, Math.cos(a) * 4, Math.sin(a) * 4, 1, 22, '#bfe8ff', 0.3); } }
  else if (n === 'pop' && e[2] === 'seed' && k) { for (let j = 0; j < 8; j++) { const a = j * TAU / 8; part('drop', k.x, k.y, 0.8, Math.cos(a) * 4, Math.sin(a) * 4, 3, 30, '#8fe07a', 0.2); } }
}

/* =====================================================================================================================
   ONE VIEW: sky, floor, sprites
   ===================================================================================================================== */
const DL = []; for (let i = 0; i < 1400; i++) DL.push({ z: 0, t: 0, o: null, X: 0, Y: 0, s: 0 });
let dn = 0;
function camera(slot, k, snap) {
  const c = VIEWS[slot].cam; if (!k) return;
  if (k.fall) { c.ok = true; return; }
  const want = k.dir + k.vd * 0.3;
  if (snap || !c.ok || k.lift > 70) c.dir = want; else c.dir += wrapA(want - c.dir) * 0.12;
  c.zoom = (c.zoom || 1) + ((k.lift ? 1.5 : 1) - (c.zoom || 1)) * (snap ? 1 : 0.08);
  c.dir = wrapA(c.dir); c.fx = k.x; c.fy = k.y; c.ok = true;
}
function drawSky(ctx, rect, V, theme, dir, t) {
  const sx = rect.w / V.vw, hy = rect.y + (V.hz + 1) * sx, th = THEMES[theme];
  const gr = ctx.createLinearGradient(0, rect.y, 0, hy); gr.addColorStop(0, th.top); gr.addColorStop(1, th.hor);
  ctx.fillStyle = gr; ctx.fillRect(rect.x, rect.y, rect.w, hy - rect.y + 2);
  if (!SKY || SKY.theme !== theme) bakeSky(theme);
  const fl = V.f * sx, turn = TAU * fl;
  for (const [img, rep, drift] of [[SKY.far, 2, t * 0.06], [SKY.near, 2, 0]]) {
    const w = turn / rep, h = SKY.H * w / SKY.TWL, ox = ((-(dir / TAU) * turn - drift) % w + w) % w;
    for (let x = rect.x + ox - w; x < rect.x + rect.w; x += w) ctx.drawImage(img, x, hy - h + 1, w + 0.5, h);
  }
}
function push(z, t, o, X, Y, s) { if (dn >= DL.length) return; const d = DL[dn++]; d.z = z; d.t = t; d.o = o; d.X = X; d.Y = Y; d.s = s; }
function drawView(ctx, rect, sim, ki, t, o) {
  o = o || {};
  const T = sim.track, M = prepTrack(T), V = VIEWS[o.slot || 0], LOWV = LOW;
  const vw = Math.round(rect.w * (LOWV ? 0.375 : 0.5)), vh = Math.round(vw * rect.h / rect.w);
  viewSetup(V, vw, vh, rect.h < rect.w * 0.45 ? 1 : 0);
  bakeTheme(T.theme);
  const k = sim.karts[ki], C = V.cam;
  if (!C.ok && k) camera(o.slot || 0, k, true);
  const dir = C.dir, cs = Math.cos(dir), sn = Math.sin(dir), zd = V.dist * (C.zoom || 1), cx = C.fx - cs * zd, cy = C.fy - sn * zd;
  const S = rect.w / vw;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  drawSky(ctx, rect, V, T.theme, dir, t);
  drawFloor(V, M, cx, cy, dir);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
  const fy = V.hz + 1;
  ctx.drawImage(V.cv, 0, fy, vw, vh - fy, rect.x, rect.y + fy * S, rect.w, (vh - fy) * S);
  const th = THEMES[T.theme], hy = rect.y + fy * S, hg = ctx.createLinearGradient(0, hy - 2, 0, hy + rect.h * 0.09);
  hg.addColorStop(0, th.haze); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.fillRect(rect.x, hy - 2, rect.w, rect.h * 0.09 + 2);
  /* gather sprites */
  dn = 0;
  const f = V.f, half = vw / 2, camH = V.camH, far = LOWV ? 110 : 150;
  const P = (x, y, h, t2, ob, minZ) => {
    const rx = x - cx, ry = y - cy, z = rx * cs + ry * sn; if (z < (minZ || 1.2) || z > far) return;
    const xr = -rx * sn + ry * cs; if (Math.abs(xr) > z * half / f + 14) return;
    const sc = f / z * S; push(z, t2, ob, rect.x + (half + xr * f / z) * S, rect.y + (V.hz + 0.5 + (camH - h) * f / z) * S, sc);
  };
  for (const d of T.deco) P(d.x, d.y, d.z || 0, 1, d);
  for (const b of sim.boxes) if (b.t <= 0 || b.t < 24) P(b.x, b.y, 0, 2, b);
  for (const it of sim.items) P(it.x, it.y, it.k === 'bomb' ? 0 : 0, 3, it);
  for (const kk of sim.karts) P(kk.x, kk.y, 0, 4, kk, 0.8);
  for (const p of PARTS) P(p.x, p.y, 0, 5, p, V.dist * 0.62);
  /* far first */
  const L = DL; for (let a = 1; a < dn; a++) { const v = L[a]; let b = a - 1; while (b >= 0 && L[b].z < v.z) { L[b + 1] = L[b]; b--; } L[b + 1] = v; }
  for (let j = 0; j < dn; j++) { const d = L[j]; drawThing(ctx, d, sim, ki, t, dir, o); }
  ctx.restore();
}
function shadow(ctx, X, Y, w, s, a) { ctx.fillStyle = 'rgba(40,30,60,' + (a || 0.28) + ')'; ctx.beginPath(); ctx.ellipse(X, Y, w * s, w * s * 0.28, 0, 0, TAU); ctx.fill(); }
function drawThing(ctx, d, sim, ki, t, camDir, o) {
  const s = d.s, X = d.X, Y = d.Y, ob = d.o;
  if (d.t === 1) {   /* scenery */
    const img = SPR[ob.k]; if (!img) return;
    if (ob.gate && d.z < 4) return;
    const w = ob.w * s, h = ob.h * s; if (h < 1.5) return;
    const yy = Y - (ob.z ? ob.z * s : 0);
    if (ob.k === 'gear') { ctx.save(); ctx.translate(X, yy - h / 2); ctx.rotate(t * 0.02 * ob.spin); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore(); return; }
    if (ob.k === 'puffP' || ob.k === 'puffB' || ob.k === 'balloons') { const bob = Math.sin(t * 0.03 + ob.x) * 0.3 * s; ctx.drawImage(img, X - w / 2, yy - h + bob, w, h); return; }
    ctx.drawImage(img, X - w / 2, yy - h + s * 0.15, w, h); return;
  }
  if (d.t === 2) {   /* a surprise bubble */
    const grow = ob.t > 0 ? 1 - ob.t / 24 : 1, bob = Math.sin(t * 0.08 + ob.x) * 0.18, sz = 1.5 * grow;
    shadow(ctx, X, Y, 0.6, s, 0.2);
    const img = SPR.box; ctx.drawImage(img, X - sz * s / 2, Y - (1.0 + bob) * s - sz * s / 2, sz * s, sz * s); return;
  }
  if (d.t === 3) {   /* items */
    if (ob.k === 'splat') { const r = 1.25 * s, ry = r * Math.min(0.5, (VIEWS[o.slot || 0].camH) / Math.max(1, d.z) * 1.4); ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(X, Y, r + 2, ry + 1.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#9b4fd0'; ctx.beginPath(); ctx.ellipse(X, Y, r, ry, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#c88af0'; ctx.beginPath(); ctx.ellipse(X - r * 0.3, Y - ry * 0.3, r * 0.35, ry * 0.3, 0, 0, TAU); ctx.fill(); return; }
    if (ob.k === 'bomb') { shadow(ctx, X, Y, 0.45, s, 0.25); const img = SPR.bomb, z = ob.z * s; ctx.drawImage(img, X - 0.55 * s, Y - z - 1.3 * s, 1.1 * s, 1.3 * s); return; }
    if (ob.k === 'burst') { const a = ob.age / 24, r = (1 + a * 2.6) * s; ctx.globalAlpha = 1 - a; ctx.strokeStyle = '#5f90ff'; ctx.lineWidth = Math.max(1, 0.5 * s * (1 - a)); ctx.beginPath(); ctx.ellipse(X, Y - 0.2 * s, r, r * 0.4, 0, 0, TAU); ctx.stroke(); for (let j = 0; j < 8; j++) { const an = j * TAU / 8; ctx.fillStyle = j & 1 ? '#5f90ff' : '#b9a2ff'; circle(ctx, X + Math.cos(an) * r, Y - 0.6 * s - Math.sin(an) * r * 0.4 - (1 - a) * s, 0.25 * s); ctx.fill(); } ctx.globalAlpha = 1; return; }
    if (ob.k === 'seed') { shadow(ctx, X, Y, 0.35, s, 0.22); const img = SPR.seed, wob = Math.sin(t * 0.5) * 0.15; ctx.save(); ctx.translate(X, Y - ob.z * s - 0.4 * s); ctx.rotate(wob); ctx.drawImage(img, -0.55 * s, -0.55 * s, 1.1 * s, 1.1 * s); ctx.restore(); if (t % 4 < 2) twinkle(ctx, X - 0.5 * s, Y - 0.3 * s, 0.15 * s, t * 0.2, '#b6f07a'); return; }
    return;
  }
  if (d.t === 4) { drawKart(ctx, d, sim, ki, t, camDir, o); return; }
  if (d.t === 5) {   /* particles */
    const p = ob, a = p.age / p.life, Yp = Y - p.z * s, r = p.s * s;
    if (r < 0.4) return;
    if (p.k === 'spark') { ctx.fillStyle = PAL.ink; circle(ctx, X, Yp, r * 1.5); ctx.fill(); twinkle(ctx, X, Yp, r * 2.2, t * 0.3, p.c); return; }
    if (p.k === 'twinkle') { ctx.globalAlpha = 1 - a; twinkle(ctx, X, Yp, r * 1.6, t * 0.2 + p.x, p.c); ctx.globalAlpha = 1; return; }
    if (p.k === 'drop') { ctx.fillStyle = PAL.ink; circle(ctx, X, Yp, r * 1.3); ctx.fill(); ctx.fillStyle = p.c; circle(ctx, X, Yp, r); ctx.fill(); return; }
    if (p.k === 'flame') { const rr = r * (1 - a * 0.6); ctx.globalAlpha = 1 - a * 0.7; ctx.fillStyle = PAL.ink; circle(ctx, X, Yp, rr + Math.max(0.8, rr * 0.25)); ctx.fill(); ctx.fillStyle = p.c; circle(ctx, X, Yp, rr); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; circle(ctx, X - rr * 0.3, Yp - rr * 0.3, rr * 0.3); ctx.fill(); ctx.globalAlpha = 1; return; }
    if (p.k === 'puff' || p.k === 'smoke') { ctx.globalAlpha = (1 - a) * (p.k === 'smoke' ? 0.85 : 0.7); ctx.fillStyle = p.c; circle(ctx, X, Yp, r * (0.6 + a)); ctx.fill(); ctx.globalAlpha = 1; return; }
  }
}
function kartYaw(k, t) {
  let a = k.dir + k.vd;
  if (k.spin) { const e = 1 - k.spin / 66; a += TAU * 2 * (1 - (1 - e) * (1 - e)); }
  return a;
}
function drawKart(ctx, d, sim, ki, t, camDir, o) {
  const k = d.o, s = d.s, X = d.X, Y = d.Y, V = VIEWS[o.slot || 0];
  const z = k.fall ? k.z : k.z + (k.lift ? 0 : 0);
  shadow(ctx, X, Y, k.fall ? 0.9 * Math.max(0, 1 + k.z / 4) : 0.95, s, k.fall ? 0.15 : 0.3);
  const zd = V.dist * (V.cam.zoom || 1), bear = Math.atan2(k.y - (V.cam.fy - Math.sin(camDir) * zd), k.x - (V.cam.fx - Math.cos(camDir) * zd));
  const rel = wrapA(kartYaw(k, t) - bear);
  const Yk = Y - z * s;
  if (k.star) { ctx.fillStyle = 'rgba(255,230,120,' + (0.3 + 0.2 * Math.sin(t * 0.5)).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(X, Yk - 1.0 * s, 1.5 * s, 1.3 * s, 0, 0, TAU); ctx.fill(); }
  if (k.i === ki && !o.cached) paintRacer(ctx, k.who, -rel, X, Yk, s);
  else {
    const fr = ((Math.round(-rel / TAU * KANG) % KANG) + KANG) % KANG, img = KART[k.who][fr];
    ctx.drawImage(img, X - KSW / 2 * s, Yk - KAY * s, KSW * s, KSH * s);
  }
  if (k.shield) { const r = 1.45 * s, cyy = Yk - 1.0 * s, fl = k.shield < 120 && (t >> 2) & 1; if (!fl) { ctx.fillStyle = 'rgba(170,225,255,.28)'; circle(ctx, X, cyy, r); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, 0.06 * s); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(X - r * 0.45, cyy - r * 0.5, r * 0.25, r * 0.12, -0.6, 0, TAU); ctx.fill(); } }
  if (k.lift) { const img = SPR.balloon; ctx.drawImage(img, X - 0.9 * s, Yk - 4.5 * s, 1.8 * s, 3.6 * s); }
  if (k.spin && (t >> 2) & 1) twinkle(ctx, X + Math.cos(t * 0.3) * s, Yk - 2.0 * s, 0.25 * s, t * 0.2, '#fff');
}

/* =====================================================================================================================
   HUD
   ===================================================================================================================== */
const ORD = ['', 'st', 'nd', 'rd', 'th', 'th', 'th'];
const PCOL = ['#fff', '#ffd93b', '#e9e3ff', '#ffb27a', '#ffffff', '#ffffff', '#ffffff'];
function fmtTime(ticks) { const cs = Math.floor(ticks * 100 / 60), m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = cs % 100; return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c; }
function minimap(ctx, sim, x, y, size, me) {
  const T = sim.track;
  if (!TR || TR.T !== T) prepTrack(T);
  if (!TR.mm || TR.mm.sz !== size) {
    const c = sprite(size, size, g => {
      const sc = size / 256, path = () => { g.beginPath(); for (let i = 0; i <= T.N; i += 3) { const j = i % T.N; g.lineTo(T.X[j] * sc, T.Y[j] * sc); } g.closePath(); };
      path(); g.strokeStyle = PAL.ink; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#fff6e0'; g.lineWidth = 3.6; g.stroke();
      const p = T.pos(0, 0); g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo((p.x - T.TY[0] * 6) * sc, (p.y + T.TX[0] * 6) * sc); g.lineTo((p.x + T.TY[0] * 6) * sc, (p.y - T.TX[0] * 6) * sc); g.stroke();
    });
    c.sz = size; TR.mm = c;
  }
  ctx.drawImage(TR.mm, x, y, size, size);
  const sc = size / 256;
  for (let pass = 0; pass < 2; pass++) for (const k of sim.karts) {
    const mine = me.indexOf(k.i) >= 0; if ((pass === 1) !== mine) continue;
    const r = mine ? 4.6 : 3.4; ctx.fillStyle = PAL.ink; circle(ctx, x + k.x * sc, y + k.y * sc, r + 1.6); ctx.fill(); ctx.fillStyle = SK.RACERS[k.who].col; circle(ctx, x + k.x * sc, y + k.y * sc, r); ctx.fill();
  }
}
function drawHUD(ctx, rect, sim, ki, t, o) {
  o = o || {};
  const k = sim.karts[ki], T = sim.track, u = clamp(rect.h / 400, 0.6, 1.25), pad = 10 * u;
  /* item slot */
  const bx = rect.x + pad + (o.itemX || 0), by = rect.y + pad, bs = 58 * u;
  ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, bx - 3, by - 3 + 2, bs + 6, bs + 6, 14 * u); ctx.fill();
  ctx.fillStyle = 'rgba(74,58,107,.85)'; ctx.beginPath(); rrect(ctx, bx, by, bs, bs, 12 * u); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.beginPath(); rrect(ctx, bx + 4, by + 4, bs - 8, bs - 8, 9 * u); ctx.stroke();
  let ik = k.roll ? SK.ITEMS[1 + ((t >> 2) % 7)] : SK.ITEMS[k.item];
  if (k.item === 2 && k.itemN < 3) ik = k.itemN === 2 ? 'boost3' : 'boost';
  if (ik && SPR.icons) { const ic = SPR.icons[ik], z = bs * 0.82; ctx.globalAlpha = k.roll ? 0.85 : 1; ctx.drawImage(ic, bx + (bs - z) / 2, by + (bs - z) / 2, z, z); ctx.globalAlpha = 1; if (k.item === 2 && k.itemN === 2) text(ctx, 'x2', bx + bs - 8 * u, by + bs - 8 * u, 12 * u, '#fff'); }
  if (o.itemKey && (k.item || k.roll)) text(ctx, o.itemKey, bx + bs / 2, by + bs + 12 * u, 10 * u, '#fff');
  /* lap and time */
  const rx = rect.x + rect.w - pad, lap = Math.max(1, k.lap);
  text(ctx, 'LAP', rx - 62 * u, by + 14 * u, 14 * u, '#e9e3ff', 'right');
  text(ctx, lap + '/' + T.laps, rx, by + 14 * u, 26 * u, lap === T.laps ? '#ffb27a' : '#fff', 'right');
  text(ctx, fmtTime(k.finished ? k.finishT : sim.clock), rx, by + 42 * u, 17 * u, PAL.sun, 'right');
  /* place */
  if (sim.phase === 'race' || sim.clock) {
    const pl = k.place, pop = o.placeAge != null ? 1 + Math.max(0, 1 - o.placeAge / 12) * 0.3 : 1, py = rect.y + rect.h - (o.touchUp ? 150 : 40) * u, px = rect.x + rect.w - 44 * u;
    ctx.save(); ctx.translate(px - 18 * u, py); ctx.scale(pop, pop); text(ctx, String(pl), 0, 0, 62 * u, PCOL[pl] || '#fff'); ctx.restore();
    text(ctx, ORD[pl] || 'th', px + 6 * u, py - 12 * u, 20 * u, PCOL[pl] || '#fff', 'left');
  }
  if (o.map) { const ms = o.mapSize || (o.touchUp ? 90 : 112) * u, my = o.touchUp ? by + bs + 26 * u : rect.y + rect.h - ms - pad; ctx.fillStyle = 'rgba(43,33,64,.35)'; ctx.beginPath(); rrect(ctx, rect.x + pad - 4, my - 4, ms + 8, ms + 8, 12); ctx.fill(); minimap(ctx, sim, rect.x + pad, my, ms, o.me || [ki]); }
  /* banners */
  const B = o.banner;
  if (B && B.age < (B.life || 110)) {
    const a = B.age, sc = a < 8 ? 0.5 + 0.7 * easeOut(a / 8) : 1.2 - 0.2 * Math.min(1, (a - 8) / 10), al = a > (B.life || 110) - 20 ? ((B.life || 110) - a) / 20 : 1;
    ctx.globalAlpha = clamp01(al); ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h * 0.52); ctx.scale(sc, sc); text(ctx, B.text, 0, 0, (B.size || 40) * u, B.col || '#fff'); if (B.sub) text(ctx, B.sub, 0, 34 * u, 16 * u, PAL.sun); ctx.restore(); ctx.globalAlpha = 1;
  }
  if (k.wrong && !k.finished && (t >> 4) & 1) text(ctx, 'WRONG WAY!', rect.x + rect.w / 2, rect.y + rect.h * 0.42, 30 * u, '#ff9a8a');
  if (sim.phase === 'count') {
    const n = Math.ceil(sim.cd / 60), f = (sim.cd % 60) / 60;
    if (n >= 1 && n <= 3) { const sc = 1 + (f > 0.8 ? (f - 0.8) * 2.5 : 0); ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h * 0.34); ctx.scale(sc, sc); text(ctx, String(n), 0, 0, 84 * u, n === 1 ? PAL.sun : '#fff'); ctx.restore(); }
    if (o.hint) text(ctx, o.hint, rect.x + rect.w / 2, rect.y + rect.h * 0.52, 15 * u, '#fff');
  } else if (sim.clock < 50) { const a = sim.clock, sc = a < 8 ? 0.6 + 0.8 * easeOut(a / 8) : 1.4 - 0.2 * Math.min(1, (a - 8) / 10); ctx.globalAlpha = a > 34 ? (50 - a) / 16 : 1; ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h * 0.3); ctx.scale(sc, sc); text(ctx, 'GO!', 0, 0, 64 * u, '#8fe07a'); ctx.restore(); ctx.globalAlpha = 1; }
  if (k.finished) { ctx.fillStyle = 'rgba(43,33,64,.18)'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); const bob = Math.sin(t * 0.08) * 3; text(ctx, 'FINISHED ' + k.place + (ORD[k.place] || 'th') + '!', rect.x + rect.w / 2, rect.y + rect.h * 0.3 + bob, 36 * u, k.place === 1 ? PAL.sun : '#fff'); }
}

/* =====================================================================================================================
   SCREENS
   ===================================================================================================================== */
function card(ctx, x, y, w, h, fill) {
  ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x - 3, y - 3 + 3, w + 6, h + 6, 20); ctx.fill();
  ctx.fillStyle = fill || 'rgba(74,58,107,.92)'; ctx.beginPath(); rrect(ctx, x, y, w, h, 17); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.beginPath(); rrect(ctx, x + 4, y + 4, w - 8, h - 8, 13); ctx.stroke();
}
function pill(ctx, x, y, w, h, col, sel) {
  ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x - 2.5, y - 2.5 + (sel ? 3 : 2), w + 5, h + 5, h / 2 + 2.5); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); rrect(ctx, x + h * 0.35, y + 3, w - h * 0.7, h * 0.2, h * 0.1); ctx.fill();
  if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); rrect(ctx, x - 5, y - 5, w + 10, h + 10, h / 2 + 5); ctx.stroke(); }
}
function sndIcon(ctx, x, y, music, on) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.7, 1.7);
  ctx.fillStyle = ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
  if (music) { ctx.beginPath(); ctx.ellipse(-1.4, 2.4, 1.7, 1.3, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(-0.1, -3.6, 1, 6); ctx.beginPath(); ctx.moveTo(0.4, -3.6); ctx.quadraticCurveTo(3.4, -2.4, 2.6, 0.2); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-3.4, -1.3); ctx.lineTo(-1.6, -1.3); ctx.lineTo(0.6, -3.4); ctx.lineTo(0.6, 3.4); ctx.lineTo(-1.6, 1.3); ctx.lineTo(-3.4, 1.3); ctx.closePath(); ctx.fill(); if (on) { ctx.beginPath(); ctx.arc(1, 0, 2.4, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(1, 0, 4.2, -0.8, 0.8); ctx.stroke(); } }
  if (!on) { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-3.4, 3.6); ctx.lineTo(3.6, -3.6); ctx.stroke(); ctx.strokeStyle = '#ffb27a'; ctx.lineWidth = 1.2; ctx.stroke(); }
  ctx.restore();
}
const UI = { snd: [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }], btn: [], diff: [], tracks: [], menu: [], touch: {} };
function sndChip(ctx, r, x, right, key, music, on, touch) {
  const lbl = (music ? 'MUSIC ' : 'SOUND ') + (on ? 'ON' : 'OFF'), w = (touch ? 0 : 24) + 26 + tw(lbl, 13) + 12, x0 = right ? x - w : x, y0 = 8, h = 28;
  ctx.fillStyle = 'rgba(43,33,64,.55)'; ctx.beginPath(); rrect(ctx, x0, y0, w, h, 14); ctx.fill();
  let cx = x0 + 8;
  if (!touch) { ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, cx, y0 + 5, 18, 18, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.stroke(); text(ctx, key, cx + 9, y0 + 14, 11, PAL.sun); cx += 24; }
  sndIcon(ctx, cx + 8, y0 + 14, music, on); text(ctx, lbl, cx + 20, y0 + 14.5, 13, on ? '#fff' : '#d9d3f0', 'left');
  r.x = x0 - 4; r.y = 0; r.w = w + 8; r.h = y0 + h + 8;
}
function keycap(ctx, x, y, s, w) { w = w || 22; ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x - w / 2, y - 11, w, 22, 5); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.2; ctx.stroke(); text(ctx, s, x, y, 12, PAL.sun); }
function head(ctx, who, x, y, px) { const c = HEADS[who]; if (c) ctx.drawImage(c, x - px / 2, y - px / 2, px, px); }
function setR(r, x, y, w, h) { r.x = x; r.y = y; r.w = w; r.h = h; return r; }
function logo(ctx, cx, y, t, s) {
  const word = (w, yy, cols, d, x0) => { let x = x0; for (let i = 0; i < w.length; i++) { const by = yy + Math.sin(t * 0.08 + i * 0.8 + d) * 3; ctx.save(); ctx.translate(x, by); ctx.rotate(Math.sin(t * 0.05 + i + d) * 0.05); text(ctx, w[i], 0, 0, 62 * s, cols[i & 1]); ctx.restore(); x += 46 * s; } };
  word('SPROUT', y, ['#8fe07a', '#c9f7a0'], 0, cx - 46 * s * 4.3);
  word('KART', y, ['#ffb24a', '#ffd93b'], 2, cx + 46 * s * 2.2);
  leaf(ctx, cx - 46 * s * 4.3 - 2, y - 30 * s + Math.sin(t * 0.08) * 3, -PI / 2 - 0.5 + Math.sin(t * 0.06) * 0.1, 18 * s, LEAF, 2.4);
  leaf(ctx, cx - 46 * s * 4.3 - 2, y - 30 * s + Math.sin(t * 0.08) * 3, -PI / 2 + 0.5 + Math.sin(t * 0.06) * 0.1, 15 * s, LEAF, 2.4);
}
const SCREENS = {
  title(ctx, S) {
    const W = S.W, H = S.H, t = S.t | 0, cx = W / 2, touch = !!S.touch;
    const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,246,224,.15)'); gr.addColorStop(1, 'rgba(43,33,64,.35)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    logo(ctx, cx, 74, t, 1);
    sndChip(ctx, UI.snd[0], 8, 0, 'M', 0, S.sound !== false, touch); const ga = ctx.globalAlpha; if (S.sound === false) ctx.globalAlpha = 0.6; sndChip(ctx, UI.snd[1], W - 8, 1, 'N', 1, S.music !== false, touch); ctx.globalAlpha = ga;
    text(ctx, 'Race your sprout kart round the garden!', cx, 124, 15, '#fff');
    if (S.online) { card(ctx, cx - 190, 150, 380, 120); text(ctx, S.onlineText || 'Waiting for your friend…', cx, 196, 20, PAL.sun); if (S.onlineSub) text(ctx, S.onlineSub, cx, 230, 14, '#fff'); UI.btn.length = 0; UI.diff.length = 0; return; }
    const bw = 172, bh = 42, gx = 16, x0 = cx - bw - gx / 2 + 40, rows = [['1 PLAYER', '#5cc85a'], ['2 PLAYERS', '#ff9a45']], sel = S.sel | 0;
    card(ctx, cx - 250, 146, 500, 186, 'rgba(74,58,107,.88)');
    UI.btn.length = 0;
    rows.forEach((r, ri) => {
      const y = 162 + ri * 56;
      text(ctx, r[0], cx - 238, y + bh / 2, 15, ri ? '#ffb27a' : '#b6f07a', 'left');
      ['GRAND PRIX', 'SINGLE RACE'].forEach((lb, bi) => { const x = x0 + bi * (bw + gx), id = ri * 2 + bi, on = sel === id; pill(ctx, x, y, bw, bh, on ? (ri ? '#ff9a45' : '#5cc85a') : 'rgba(255,255,255,.18)', on); text(ctx, lb, x + bw / 2, y + bh / 2 + 1, 17, '#fff'); UI.btn.push(setR({}, x - 4, y - 4, bw + 8, bh + 8)); });
    });
    const dy = 280; text(ctx, 'CPU', cx - 238, dy + 15, 15, '#e9e3ff', 'left'); UI.diff.length = 0;
    (S.diffs || ['EASY', 'MEDIUM', 'HARD']).forEach((d, i) => { const w = 108, x = x0 + 10 + i * (w + 12), on = (S.diff | 0) === i; pill(ctx, x, dy, w, 30, on ? ['#8fe07a', '#ffd93b', '#ff8a8a'][i] : 'rgba(255,255,255,.14)', sel === 4 && on); text(ctx, d, x + w / 2, dy + 15.5, 14, on ? '#fff' : '#d9d3f0'); UI.diff.push(setR({}, x - 3, dy - 3, w + 6, 36)); });
    const best = S.best || {}, tr = S.tracks || [];
    let bx = cx - 240; text(ctx, 'BEST', bx, 346, 13, PAL.sun, 'left'); bx += 46;
    tr.forEach(T => { const v = best[T.id]; const s = T.short + ' ' + (v ? fmtTime(v) : '–'); text(ctx, s, bx, 346, 12.5, '#fff', 'left'); bx += tw(s, 12.5) + 18; });
    if (touch) text(ctx, 'Tap a button to race', cx, H - 22, 14, '#fff');
    else {
      if (sel === 2 || sel === 3) { text(ctx, 'SPRIG: W A S D · SPACE drift · E item', cx, H - 40, 12.5, '#b6f07a'); text(ctx, 'MARIGOLD: arrows · RIGHT SHIFT or / drift · ENTER item', cx, H - 22, 12.5, '#ffb27a'); }
      else { text(ctx, 'Steer: arrows or W A S D · brake ↓ · drift SPACE · item SHIFT', cx, H - 40, 12.5, '#e9ffe0'); text(ctx, '↑ ↓ ← → choose   SPACE / ENTER race   M sound   N music', cx, H - 22, 12.5, '#fff'); }
    }
  },
  tracks(ctx, S) {
    const W = S.W, H = S.H, t = S.t | 0, cx = W / 2, sel = S.sel | 0, list = S.tracks || [];
    ctx.fillStyle = 'rgba(43,33,64,.45)'; ctx.fillRect(0, 0, W, H);
    text(ctx, S.two ? 'PICK A TRACK (2 PLAYERS)' : 'PICK A TRACK', cx, 46, 30, PAL.sun);
    UI.tracks.length = 0;
    const cw = Math.min(190, (W - 60) / 3), gap = 14, x0 = cx - (cw * 3 + gap * 2) / 2;
    list.forEach((T, i) => {
      const on = i === sel, x = x0 + i * (cw + gap), y = 80 + (on ? -6 : 0), h = 262;
      card(ctx, x, y, cw, h, on ? 'rgba(92,72,135,.97)' : 'rgba(74,58,107,.85)');
      if (on) { ctx.strokeStyle = PAL.sun; ctx.lineWidth = 3; ctx.beginPath(); rrect(ctx, x - 6, y - 6, cw + 12, h + 12, 22); ctx.stroke(); }
      const ms = Math.min(cw - 40, 150); ctx.save(); ctx.translate(x + (cw - ms) / 2, y + 14);
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.beginPath(); for (let j = 0; j <= T.N; j += 4) { const q = j % T.N; ctx.lineTo(T.X[q] / 256 * ms, T.Y[q] / 256 * ms); } ctx.closePath(); ctx.stroke(); ctx.strokeStyle = ['#e8cc9c', '#d6c8ff', '#a3abc8'][i % 3]; ctx.lineWidth = 4.5; ctx.stroke(); ctx.restore();
      text(ctx, T.name.split(' ')[0], x + cw / 2, y + ms + 36, 17, '#fff'); text(ctx, T.name.split(' ').slice(1).join(' '), x + cw / 2, y + ms + 58, 17, '#fff');
      const b = (S.best || {})[T.id]; text(ctx, b ? 'BEST ' + fmtTime(b) : 'no best time yet', x + cw / 2, y + h - 22, 12.5, b ? PAL.sun : '#d9d3f0');
      UI.tracks.push(setR({}, x, y, cw, h));
    });
    text(ctx, S.touch ? 'Tap a track to race · tap here to go back' : '← → choose   SPACE / ENTER race   Esc back', cx, H - 26, 13, '#fff');
    void t;
  },
  results(ctx, S) {
    const W = S.W, H = S.H, a = S.age | 0, k = easeOut(a / 18), cx = W / 2, rows = S.rows || [];
    ctx.fillStyle = 'rgba(43,33,64,' + (0.4 * k).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 40);
    const cw = Math.min(W - 40, 470), ch = 74 + rows.length * 38 + 50, x = cx - cw / 2, y = Math.max(10, H / 2 - ch / 2);
    card(ctx, x, y, cw, ch);
    text(ctx, S.title || 'RESULTS', cx, y + 28, 24, PAL.sun); if (S.sub) text(ctx, S.sub, cx, y + 52, 13, '#e9e3ff');
    rows.forEach((r, i) => {
      const ry = y + 80 + i * 38, q = clamp01((a - 8 - i * 4) / 10); if (q <= 0) return; ctx.globalAlpha = k * q;
      if (r.me) { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); rrect(ctx, x + 12, ry - 17, cw - 24, 34, 12); ctx.fill(); }
      text(ctx, String(r.place), x + 34, ry, 22, PCOL[r.place] || '#fff'); head(ctx, r.who, x + 74, ry, 40);
      text(ctx, SK.RACERS[r.who].name + (r.tag ? ' ' + r.tag : ''), x + 100, ry, 16, SK.RACERS[r.who].txt, 'left');
      text(ctx, r.time, x + cw - (S.points ? 130 : 24), ry, 15, '#fff', 'right');
      if (S.points) { text(ctx, '+' + r.pts, x + cw - 78, ry, 14, PAL.sun, 'right'); text(ctx, String(r.total), x + cw - 24, ry, 18, '#fff', 'right'); }
    });
    ctx.globalAlpha = k;
    if (a > 40) { ctx.globalAlpha = k * (0.6 + 0.4 * Math.abs(Math.sin(a * 0.06))); text(ctx, S.prompt || 'SPACE: race again', cx, y + ch - 30, 16, PAL.sun); ctx.globalAlpha = k; if (S.prompt2) text(ctx, S.prompt2, cx, y + ch - 10, 12, '#e9e3ff'); }
    ctx.restore(); ctx.globalAlpha = 1;
  },
  podium(ctx, S) {
    const W = S.W, H = S.H, a = S.age | 0, t = S.t | 0, cx = W / 2, st = S.standings || [];
    const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(43,33,64,.72)'); gr.addColorStop(1, 'rgba(43,33,64,.4)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    text(ctx, 'GRAND PRIX', cx, 30, 22, '#fff');
    const win = st[0]; if (win) text(ctx, SK.RACERS[win.who].name + ' WINS THE CUP!', cx, 62, 30, SK.RACERS[win.who].txt);
    const base = H - 52, steps = [[0, 0, 128], [1, -150, 96], [2, 150, 70]];
    for (const [rank, dx, h] of steps) {
      const r = st[rank]; if (!r) continue; const q = easeOut((a - 10 - rank * 12) / 20); if (q <= 0) continue;
      const x = cx + dx - 66, top = base - h * q;
      ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x - 3, top - 3, 138, h * q + 6, 10); ctx.fill();
      ctx.fillStyle = ['#ffd93b', '#e9e3ff', '#ffb27a'][rank]; ctx.beginPath(); rrect(ctx, x, top, 132, h * q, 8); ctx.fill();
      text(ctx, String(rank + 1), x + 66, top + 26, 30, '#fff');
      const img = KART[r.who] && KART[r.who][8]; const s = 40, bob = Math.sin(t * 0.1 + rank) * 3 * (rank === 0 ? 1.6 : 1);
      if (img) ctx.drawImage(img, x + 66 - KSW / 2 * s, top - KAY * s + bob, KSW * s, KSH * s);
      text(ctx, SK.RACERS[r.who].name, x + 66, top + 52, 14, '#fff');
      text(ctx, r.pts + ' pts', x + 66, top + 70, 13, '#fff');
    }
    for (let i = 0; i < 26; i++) { const h = hash(i, 5), x = (h * W + Math.sin(t * 0.03 + i) * 20) % W, y = ((t * (1 + hash(i, 3)) + hash(i, 9) * H) % (H + 40)) - 20; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.05 + i); ctx.fillStyle = PAL.ink; ctx.fillRect(-4, -3, 8, 6); ctx.fillStyle = ['#ff7a8a', '#ffd93b', '#8fe07a', '#7fd0ff', '#b9a2ff'][i % 5]; ctx.fillRect(-3, -2, 6, 4); ctx.restore(); }
    let ly = H - 20; if (a > 60) { ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(a * 0.06)); text(ctx, S.prompt || 'SPACE: back to the title', cx, ly, 16, PAL.sun); ctx.globalAlpha = 1; }
  },
  pause(ctx, S) {
    const W = S.W, H = S.H, cx = W / 2, sel = S.sel | 0, opts = S.opts || ['CARRY ON', 'BACK TO TITLE', 'LEAVE'];
    ctx.fillStyle = 'rgba(43,33,64,.5)'; ctx.fillRect(0, 0, W, H);
    card(ctx, cx - 150, H / 2 - 120, 300, 70 + opts.length * 52);
    text(ctx, 'PAUSED', cx, H / 2 - 88, 32, '#fff');
    UI.menu.length = 0;
    opts.forEach((o, i) => { const y = H / 2 - 54 + i * 52; pill(ctx, cx - 110, y, 220, 40, i === sel ? '#5cc85a' : 'rgba(255,255,255,.16)', i === sel); text(ctx, o, cx, y + 21, 17, '#fff'); UI.menu.push(setR({}, cx - 114, y - 4, 228, 48)); });
  },
  msg(ctx, S) {
    const W = S.W, H = S.H, L = String(S.text || '').split('\n'), h = L.length * 30 + 34, cy = S.y || H / 2;
    ctx.fillStyle = 'rgba(43,33,64,.42)'; ctx.fillRect(0, 0, W, H); card(ctx, W / 2 - 200, cy - h / 2, 400, h);
    L.forEach((s, i) => text(ctx, s, W / 2, cy - h / 2 + 32 + i * 30, i ? 15 : 20, i ? '#fff' : PAL.sun));
  },
  band(ctx, S) {   /* the control band under the view on an upright phone */
    const gr = ctx.createLinearGradient(0, S.y, 0, S.y + S.h); gr.addColorStop(0, '#5aa84f'); gr.addColorStop(1, '#3f8f45'); ctx.fillStyle = gr; ctx.fillRect(0, S.y, S.W, S.h);
    ctx.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < S.W; x += 28) ctx.fillRect(x, S.y, 14, S.h);
    ctx.fillStyle = PAL.ink; ctx.fillRect(0, S.y, S.W, 3);
  },
  touch(ctx, S) {   /* phone controls: steer bottom-left, DRIFT and ITEM bottom-right (in the band on an upright phone) */
    const W = S.W, P = S.pressed || {}, B = S.band, T = UI.touch;
    const r = B ? 52 : 34, y = B ? B.y + B.h - Math.min(B.h * 0.42, 200) : S.H - r - 16, top = B ? B.y + Math.min(B.h * 0.3, 170) : S.H * 0.45, bot = B ? B.y + B.h : S.H;
    const btn = (x, yy, rr, lbl, on, col) => { ctx.globalAlpha = 0.88; ctx.fillStyle = PAL.ink; circle(ctx, x, yy + 3, rr + 3); ctx.fill(); ctx.fillStyle = on ? PAL.sun : col; circle(ctx, x, yy + (on ? 2 : 0), rr); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(x - rr * 0.3, yy - rr * 0.4, rr * 0.4, rr * 0.2, -0.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; text(ctx, lbl, x, yy + (on ? 2 : 0), rr * 0.42, '#fff'); };
    const lx = 16 + r + 4, rx = 16 + r * 3 + 22, dx = W - 16 - r - 8, ix = W - 16 - r * 3 - 26;
    btn(lx, y, r, '◀', P.left, 'rgba(74,58,107,.8)'); btn(rx, y, r, '▶', P.right, 'rgba(74,58,107,.8)');
    btn(dx, y - 4, r + 6, 'DRIFT', P.drift, '#5cc85a'); btn(ix, y + 6, r - 4, 'ITEM', P.item, '#ff9a45');
    const mid = (lx + rx) / 2, gap = (dx + ix) / 2;
    T.left = setR(T.left || {}, 0, top, mid, bot - top); T.right = setR(T.right || {}, mid, top, (ix - r) - mid, bot - top);
    T.item = setR(T.item || {}, ix - r, top, gap - (ix - r), bot - top); T.drift = setR(T.drift || {}, gap, top, W - gap, bot - top);
    const px = W / 2, py = B ? B.y + B.h - 40 : 24; ctx.globalAlpha = 0.8; ctx.fillStyle = PAL.ink; circle(ctx, px, py, 17); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(px - 6, py - 7, 4, 14); ctx.fillRect(px + 2, py - 7, 4, 14); ctx.globalAlpha = 1;
    T.pause = setR(T.pause || {}, px - 24, py - 24, 48, 48);
    if (B) text(ctx, 'hold ◀ ▶ to steer · DRIFT to hop and slide · ITEM to use', W / 2, y - r - 26, 12, '#e9ffe0');
  }
};

SK.Render = {
  ready: false, UI, PAL, THEMES, fmtTime, text, KANG,
  get R() { return R; },
  init(r, low) { r = Math.max(1, Math.min(4, +r || 2)); if (this.ready && r === R && !!low === LOW) return; R = r; LOW = !!low; TXT = new Map(); txtB = 0; const th = THEME; THEME = ''; SPR = {}; bakeItems(); bakeRacers(); if (th) bakeTheme(th); SKY = null; this.ready = true; },
  setTrack(T) { bakeTheme(T.theme); prepTrack(T); if (!SKY || SKY.theme !== T.theme) bakeSky(T.theme); PARTS.length = 0; for (const V of VIEWS) V.cam.ok = false; },
  camera, tick: fxTick, fxEvent, drawView, drawHUD,
  screen(ctx, name, S) { const F = SCREENS[name]; if (F) F(ctx, S || {}); },
  head, minimap, paintRacer, itemIcon(ctx, k, x, y, s) { itemIcon(ctx, k, x, y, s); }, logo,
  get parts() { return PARTS.length; },
  _dl() { return DL.slice(0, dn).filter(d => d.z < 12).map(d => [d.t, +d.z.toFixed(1), d.o.k || ('kart' + d.o.i), Math.round(d.X), Math.round(d.Y)]); }
};
})();
