/* SPROUT KART — render.js v2 (RENDER). Everything you see, drawn in code in the Berry Breeze / Vine Line house style (thick
   ink outlines, glossy two-tone shading, sticker text). Per view: a parallax sky band, the track floor projected per pixel into
   an ImageData at a low internal resolution (one row = one distance, mip-mapped texture, no allocation in the loop) and scaled
   up smoothly, a ground-decal pass (puddles, wet sprinkler arcs, ring shadows, the thyme ribbon, nets), then depth-sorted
   sprites drawn crisp on top: karts (16 baked angles per racer; the kart you drive is painted live) with their v2 states
   (giant, tiny, wobble, bonk, twirl, tailwind, daisy petals, shield, balloon), scenery, surprise bubbles, items, hazards and
   little world-space effects. Then the HUD (item slot, threat strip, banners, mini-map) and the screens.
   paintV2(g, T) paints the v2 floor features (cuts, ramps, the stream, gaps, grates, plates, ring glows, bounce clouds) into
   the track texture for tracks.js. No animals, no faces on items or hazards, nothing violent (SPEC-kart-v2.md section 9).
   SK.Render: init(R, low), setTrack(T), prefetch(T), camera(slot, kart, snap), tick(sim), fxEvent(sim, e),
   drawView(ctx, rect, sim, ki, t, o), drawHUD(ctx, rect, sim, ki, t, o), screen(ctx, name, S), paintV2(g, T),
   text(ctx, s, x, y, size, fill, align), UI (hit rects). */
(function () {
const SK = window.SK = window.SK || {};
const TAU = Math.PI * 2, PI = Math.PI;
const PAL = { ink: '#2b2140', plum: '#4a3a6b', cream: '#fff6e0', sun: '#ffd93b', gold: '#f5a623', orange: '#ff8a3d', leaf: '#4cc46a', lilac: '#e4d8ff', sky: '#7fd0ff' };
const FONT = '"Arial Rounded MT Bold", ui-rounded, "Varela Round", "Trebuchet MS", system-ui, sans-serif';
const font = s => 'bold ' + s + 'px ' + FONT;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const wrapA = a => (a > PI || a < -PI) ? a - TAU * Math.floor((a + PI) / TAU) : a;   /* terminates on ±Infinity (NaN out) */
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
  s = String(s).slice(0, 120); if (!s) return 0; size = Math.round(Math.max(6, Math.min(110, +size || 14)) * 2) / 2; fill = fill || '#fff'; align = align || 'center';
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
  { /* SPRIG — green sprout in a pea-pod kart (the peas sit half-sunk in the pod's open seam: review A10) */
    head: ['#5cc85a', '#2f8f4a', '#d2f7c4'], torso: ['#ffd93b', '#e8a020', '#fff8d0'], hub: '#ffd93b',
    body(L, pr) {
      const c = [0.02, 0, 0.5];
      ell(L, pr, c, 1.08, 0.6, 0.36, ['#7ed957', '#3f9a3a', '#e2ffd2'], g => {   /* the seam: a dark split along the top with the peas sunk into it */
        if (pr.ca < -0.55) return;   /* not drawn head-on (it would read as a stripe down the front) */
        const a = pr.p(0.3, 0, 0.84), b = pr.p(1.0, 0, 0.66), m = pr.p(0.66, 0, 0.82);
        g.strokeStyle = '#2a6a2a'; g.lineWidth = 0.11; g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(m[0], m[1] - 0.02, b[0], b[1]); g.stroke();
        for (const x of [0.48, 0.66, 0.84]) { const p = pr.p(x, 0, 0.83 - (x - 0.48) * 0.35); g.fillStyle = '#7ec850'; g.beginPath(); g.ellipse(p[0], p[1] + 0.005, 0.06, 0.03, 0, PI, TAU); g.fill(); }
      });
      ell(L, pr, [1.08, 0, 0.62], 0.22, 0.1, 0.1, ['#7ed957', '#3f9a3a', '#e2ffd2']);
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
      for (let k = 0; k < 12; k++) {
        const ph = k * TAU / 12, dy = Math.cos(ph), dz = Math.sin(ph), m = k & 1 ? ['#ffc23a', '#e8901c', '#fff0b8'] : ['#ff8a2a', '#d9622a', '#ffd0a0'];
        ellV(L, pr, [hc[0] - r * 0.45, hc[1] + dy * r * 1.08, hc[2] + dz * r * 1.08], [-r * 0.28, dy * r * 0.48, dz * r * 0.48], [0, -dz * r * 0.3, dy * r * 0.3], [r * 0.14, 0, 0], m, null, 0.02);
      }
    }
  },
  { /* BASIL — a basil sprite in an aubergine kart */
    head: ['#4cc08a', '#1f7a52', '#c8f5e0'], torso: ['#fff6e0', '#d8c8a8', '#ffffff'], hub: '#d2b8ff',
    body(L, pr) {
      ell(L, pr, [-0.04, 0, 0.5], 1.1, 0.6, 0.4, ['#9b6bd8', '#5e3a9a', '#ead8ff']);
      ell(L, pr, [0.92, 0, 0.6], 0.24, 0.42, 0.3, ['#6fcf6a', '#2f8f4a', '#d2f7c4']);
      ell(L, pr, [1.18, 0, 0.66], 0.18, 0.07, 0.07, ['#8a6a3a', '#5a4020', '#c8a878']);
    },
    top(L, pr, hc, r) {   /* big glossy basil leaves: two at the sides and a quiff */
      const B = ['#3fae5a', '#1f6f3a', '#c8f5b0'];
      /* a sprout tuft: two leaves nearly upright (about 0.3 rad out) and a taller one in the middle (fix round 1: two outward
         tips on a round face read as ears) */
      for (const sd of [-1, 1]) ellV(L, pr, [hc[0] - r * 0.1, hc[1] + sd * r * 0.3, hc[2] + r * 1.12], [0, sd * r * 0.11, r * 0.36], [0, r * 0.17, -sd * r * 0.05], [r * 0.06, 0, 0], B, null, -0.005);
      ellV(L, pr, [hc[0] - r * 0.12, hc[1], hc[2] + r * 1.3], [0, 0, r * 0.5], [0, r * 0.2, 0], [r * 0.07, 0, 0], B, null, -0.01);
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
  { /* ZEST — a lemon bud in a blueberry kart (its crown is a soft notched ring, not a star) */
    head: ['#ffe36b', '#e8b020', '#fffbe0'], torso: ['#9be8c4', '#4fb08a', '#e6fff4'], hub: '#ffe36b', tall: 1.14,
    body(L, pr) {
      ell(L, pr, [0.02, 0, 0.54], 0.94, 0.74, 0.52, ['#5f90ff', '#2a4fb8', '#dde9ff']);
      const s = pr.p(0.94, 0, 0.62); L.push({ d: s[2] - 0.01, f: g => { if (pr.ca < -0.15 || Math.abs(pr.sa) > 0.5) { g.fillStyle = '#1f3c8a'; g.beginPath(); g.ellipse(s[0], s[1], 0.13, 0.09, 0, 0, TAU); g.fill(); g.fillStyle = '#5f90ff'; g.beginPath(); g.ellipse(s[0], s[1], 0.06, 0.04, 0, 0, TAU); g.fill(); } } });
    },
    top(L, pr, hc, r) { ell(L, pr, [hc[0], hc[1], hc[2] + r * 1.12], r * 0.18, r * 0.18, r * 0.2, ['#ffe36b', '#e8b020', '#fffbe0'], null, -0.01); headLeaf(L, pr, [hc[0], hc[1], hc[2] + r * 1.2], -PI / 2 + 0.7, 0.34, LEAF, -0.02); }
  },
  { /* SAVOY — a cabbage-leaf kid in a sweetcorn kart: a cabbage hood (low rounded side leaves wrap the cheeks, crinkled
       edges and veins, a top leaf over the crown, no tips: review A9) */
    head: ['#d4f2a8', '#7fbf5a', '#f2ffe2'], torso: ['#ff9a45', '#d9622a', '#ffe2c8'], hub: '#7ed957',
    body(L, pr) {
      const c = [0, 0, 0.5], ax = 1.06, ay = 0.56, az = 0.42, D = [];
      for (let a = 0; a < 10; a++) for (let b = 0; b < 9; b++) D.push([0.25 + a * 0.27, b * 0.7]);
      ell(L, pr, c, ax, ay, az, ['#ffd23a', '#e0a21a', '#fff3b0'], g => surfDots(g, pr, c, ax, ay, az, D, 'rgba(224,150,20,.65)', 0.05));
      for (const s of [-1, 1]) ellV(L, pr, [-0.1, s * 0.6, 0.48], [0.95, 0, 0.1], [0, s * 0.1, 0], [0, 0, 0.3], LEAF, null, 0);
    },
    top(L, pr, hc, r) {
      const m = ['#a8e080', '#4f9e3a', '#e2ffd0'];
      const crinkle = (g, e) => {   /* veins and a scalloped rim */
        g.strokeStyle = 'rgba(70,140,50,.65)'; g.lineWidth = 0.022;
        g.beginPath(); g.moveTo(e.x, e.y + e.ey * 0.7); g.lineTo(e.x, e.y - e.ey * 0.6); g.stroke();
        for (const k of [-1, 1]) { g.beginPath(); g.moveTo(e.x, e.y + e.ey * 0.1); g.lineTo(e.x + k * e.ex * 0.55, e.y - e.ey * 0.35); g.stroke(); g.beginPath(); g.moveTo(e.x, e.y + e.ey * 0.45); g.lineTo(e.x + k * e.ex * 0.6, e.y + e.ey * 0.1); g.stroke(); }
        g.fillStyle = m[0]; for (let k = 0; k < 9; k++) { const a = PI + k * PI / 8; g.beginPath(); g.ellipse(e.x + Math.cos(a) * e.ex * 0.92, e.y + Math.sin(a) * e.ey * 0.92, e.ex * 0.13, e.ey * 0.11, 0, 0, TAU); g.fill(); }
      };
      ellV(L, pr, [hc[0] - r * 0.55, hc[1], hc[2] + r * 0.05], [r * 0.12, 0, 0], [0, r * 1.02, 0], [0, 0, r * 0.95], m, crinkle, 0.02);
      for (const sd of [-1, 1]) ellV(L, pr, [hc[0] - r * 0.05, hc[1] + sd * r * 0.82, hc[2] + r * 0.14], [r * 0.62, 0, 0], [0, sd * r * 0.16, 0], [0, 0, r * 0.42], m, crinkle, 0.01);   /* cheek-high (fix round 1: hanging leaves read as floppy ears) */
      ellV(L, pr, [hc[0] - r * 0.1, hc[1], hc[2] + r * 0.78], [r * 0.78, 0, 0], [0, r * 0.82, 0], [0, 0, r * 0.26], m, crinkle, -0.02);
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
    /* the steering wheel: a lighter plum ring, not a dark blob under the chin (review A16) */
    const w = ellOf(pr, [0.26, 0, 0.82], [0.03, 0, -0.02], [0, 0.19, 0], [0, 0, 0.12]), front = -pr.p(1, 0, 0)[2] > 0.25, col = pr.p(0.5, 0, 0.66);
    L.push({ d: w.d, f: g => {   /* the steering wheel: lower, in plum, on a short column; head-on only its lower rim shows (fix round 1) */
      g.strokeStyle = PAL.ink; g.lineWidth = 0.06; g.beginPath(); g.moveTo(w.x, w.y); g.lineTo(col[0], col[1]); g.stroke();
      const a0 = front ? 0.1 * PI : 0, a1 = front ? 0.9 * PI : TAU;
      g.strokeStyle = PAL.ink; g.lineWidth = 0.075; g.beginPath(); g.ellipse(w.x, w.y, w.rx, w.ry, w.rot, a0, a1); g.stroke(); g.strokeStyle = '#6a5a90'; g.lineWidth = 0.04; g.stroke(); } });
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
   SCENERY, BUBBLES, ITEMS AND HAZARDS (baked billboards, metres → px at a density that suits their size)
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
/* a little painted signboard on two posts (sticker text fitted to the board) */
function signDraw(g, w, h, txt, col) {
  g.fillStyle = PAL.ink; g.fillRect(w * 0.22 - 0.14, h * 0.45, 0.28, h * 0.55); g.fillRect(w * 0.78 - 0.14, h * 0.45, 0.28, h * 0.55);
  g.fillStyle = '#a8703a'; g.fillRect(w * 0.22 - 0.07, h * 0.45, 0.14, h * 0.55); g.fillRect(w * 0.78 - 0.07, h * 0.45, 0.14, h * 0.55);
  g.fillStyle = PAL.ink; rrect(g, 0.1, 0.1, w - 0.2, h * 0.52, 0.3); g.fill();
  g.fillStyle = col || '#fff6e0'; rrect(g, 0.22, 0.22, w - 0.44, h * 0.52 - 0.24, 0.22); g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(0.4, 0.3, w - 0.8, 0.08);
  let z = 0.9; g.font = 'bold ' + z + 'px ' + FONT; const tw0 = g.measureText(txt).width; if (tw0 > w - 0.8) { z *= (w - 0.8) / tw0; g.font = 'bold ' + z + 'px ' + FONT; }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = z * 0.28; g.strokeText(txt, w / 2, 0.22 + (h * 0.52 - 0.24) / 2); g.fillStyle = '#ffd93b'; g.fillText(txt, w / 2, 0.22 + (h * 0.52 - 0.24) / 2);
}
const SCENERY = {
  bush: () => bb(3.6, 2.8, 40, g => { blobs(g, [[0.8, 1.9, 0.75], [1.8, 1.45, 1.0], [2.8, 1.9, 0.72], [1.3, 2.2, 0.6], [2.3, 2.2, 0.6]], ['#4cb85a', '#2f8f4a', '#9be88a'], 0.09); flowerDot(g, 1.4, 1.2, 0.13, '#fff'); flowerDot(g, 2.5, 1.6, 0.12, '#ffd0e0'); flowerDot(g, 0.8, 1.8, 0.11, '#fff3a0'); }),
  /* the tunnel's sunflowers, baked at 6.2 x 8.0 m with the head moved in and down so nothing is cut flat (review A5) */
  sunL: () => bb(6.2, 8.0, 28, g => sunStalk(g, -1)), sunR: () => bb(6.2, 8.0, 28, g => sunStalk(g, 1)),
  sunflower: () => bb(2.6, 5, 30, g => { g.strokeStyle = PAL.ink; g.lineWidth = 0.32; g.beginPath(); g.moveTo(1.3, 5); g.lineTo(1.3, 1.6); g.stroke(); g.strokeStyle = '#5fae3a'; g.lineWidth = 0.16; g.stroke(); leaf(g, 1.3, 3.4, -0.5, 0.9, LEAF, 0.08); leaf(g, 1.3, 3.0, PI + 0.5, 0.9, LEAF, 0.08); sunflowerHead(g, 1.3, 1.25, 0.9, 0.1); }),
  tree: () => bb(7, 8.6, 24, g => {
    g.fillStyle = PAL.ink; g.fillRect(3.0, 4.5, 1.0, 4.1); g.fillStyle = '#a8703a'; g.fillRect(3.15, 4.5, 0.7, 4.0); g.fillStyle = '#c8905a'; g.fillRect(3.2, 4.6, 0.2, 3.8);
    blobs(g, [[2.2, 3.6, 1.6], [3.5, 2.4, 2.0], [4.9, 3.5, 1.6], [3.5, 4.2, 1.6], [1.8, 2.4, 1.1], [5.2, 2.2, 1.1]], ['#5cc85a', '#2f8f4a', '#b6f07a'], 0.14);
    for (let k = 0; k < 7; k++) ball(g, 1.8 + hash(k, 2) * 3.6, 1.6 + hash(k, 3) * 3, 0.22, k & 1 ? ['#ff5a66', '#c22d4f', '#ffd0d5'] : ['#ffd93b', '#f0a020', '#fffbe0'], 0.07);
  }),
  pumpkin: () => bb(2.4, 1.9, 40, g => pumpkinDraw(g, 1.2, 1.15, 0.72)),
  cabbage: () => bb(2.2, 1.7, 40, g => { blobs(g, [[0.6, 1.1, 0.5], [1.6, 1.1, 0.5], [1.1, 0.9, 0.62]], ['#b8e890', '#5fae3a', '#eaffd8'], 0.08); g.strokeStyle = '#5fae3a'; g.lineWidth = 0.05; g.beginPath(); g.moveTo(1.1, 1.4); g.quadraticCurveTo(1.0, 0.9, 1.15, 0.45); g.stroke(); }),
  arch: () => bb(20, 7.8, 20, g => archDraw(g, 20, 7.8)),
  puffP: () => bb(8, 5.6, 20, g => blobs(g, [[1.6, 3.8, 1.3], [3.2, 2.8, 1.8], [5.0, 3.0, 1.6], [6.5, 3.9, 1.2], [4.0, 4.3, 1.3]], ['#ffd0ec', '#f29ccf', '#ffffff'], 0.12)),
  puffB: () => bb(8, 5.6, 20, g => blobs(g, [[1.6, 3.8, 1.3], [3.2, 2.8, 1.8], [5.0, 3.0, 1.6], [6.5, 3.9, 1.2], [4.0, 4.3, 1.3]], ['#d8ecff', '#9cc8f2', '#ffffff'], 0.12)),
  /* sky lamps with a round paper-lantern top (no star: review A17) */
  lamp: () => bb(1.6, 5.6, 40, g => lampDraw(g, '#ff9ac0')), lampB: () => bb(1.6, 5.6, 40, g => lampDraw(g, '#b9a2ff')),
  /* the rainbow gate, baked 10.6 m tall so its cloud feet have their outline (review A11) */
  rainbow: () => bb(21, 10.6, 18, g => {
    const cols = ['#ff7a8a', '#ffb24a', '#ffe36b', '#8fe07a', '#7fd0ff', '#b9a2ff'], cx = 10.5, cy = 9.8, R0 = 9.6, bw = 0.62;
    g.lineCap = 'butt'; g.strokeStyle = PAL.ink; g.lineWidth = bw * 6 + 0.4; g.beginPath(); g.arc(cx, cy, R0 - bw * 2.5, PI, TAU); g.stroke();
    cols.forEach((c, k) => { g.strokeStyle = c; g.lineWidth = bw; g.beginPath(); g.arc(cx, cy, R0 - k * bw, PI, TAU); g.stroke(); });
    blobs(g, [[1.4, 9.0, 1.1], [2.8, 9.3, 0.9], [0.9, 9.5, 0.65]], ['#ffffff', '#f2d8ec', '#ffffff'], 0.1);
    blobs(g, [[19.6, 9.0, 1.1], [18.2, 9.3, 0.9], [20.1, 9.5, 0.65]], ['#ffffff', '#f2d8ec', '#ffffff'], 0.1);
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
  crate: () => bb(2.6, 2.4, 40, g => crateDraw(g, 0.15, 0.15, 2.3, 2.15)),
  /* Works pipes now stand on two legs (review A19) */
  pipe: () => bb(4, 3.4, 30, g => { for (const x of [0.8, 3.0]) { g.fillStyle = PAL.ink; g.fillRect(x - 0.2, 2.6, 0.4, 0.8); g.fillStyle = '#8a8eaa'; g.fillRect(x - 0.1, 2.6, 0.2, 0.75); } g.fillStyle = PAL.ink; rrect(g, 0.1, 1.4, 3.8, 1.5, 0.4); g.fill(); g.fillStyle = '#7fb0c8'; rrect(g, 0.25, 1.55, 3.5, 1.2, 0.3); g.fill(); g.fillStyle = '#c8e8f8'; g.fillRect(0.4, 1.7, 3.2, 0.2); g.fillStyle = PAL.ink; g.fillRect(1.8, 0.5, 0.4, 1.0); gearDraw(g, 2, 0.55, 0.62, ['#ff7a8a', '#c22d4f', '#ffd0d5']); }),
  /* v2 kinds */
  glass: () => bb(3.2, 5.0, 30, g => {   /* a greenhouse frame bay: glass panes in a white frame */
    g.fillStyle = PAL.ink; rrect(g, 0.15, 0.4, 2.9, 4.6, 0.2); g.fill();
    const gr = g.createLinearGradient(0, 0.5, 0, 5); gr.addColorStop(0, 'rgba(216,243,255,.95)'); gr.addColorStop(1, 'rgba(159,216,240,.85)'); g.fillStyle = gr; g.fillRect(0.35, 0.6, 2.5, 4.3);
    g.fillStyle = '#fff6e0'; g.fillRect(1.52, 0.6, 0.16, 4.3); g.fillRect(0.35, 2.3, 2.5, 0.14);
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.moveTo(0.5, 4.6); g.lineTo(0.8, 4.6); g.lineTo(1.3, 0.9); g.lineTo(1.0, 0.9); g.closePath(); g.fill();
    blobs(g, [[0.8, 4.55, 0.4], [2.3, 4.6, 0.36]], ['#7ed957', '#3f9a3a', '#e2ffd2'], 0.06);
    g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(0, 0.6); g.lineTo(1.6, 0); g.lineTo(3.2, 0.6); g.lineTo(3.2, 0.85); g.lineTo(1.6, 0.25); g.lineTo(0, 0.85); g.closePath(); g.fill();
  }),
  beam: () => bb(10, 5.4, 18, g => {   /* a wooden beam across the greenhouse path, the basket hangs from it */
    for (const x of [0.5, 9.5]) { g.fillStyle = PAL.ink; g.fillRect(x - 0.3, 0.6, 0.6, 4.8); g.fillStyle = '#c8905a'; g.fillRect(x - 0.18, 0.6, 0.36, 4.75); }
    g.fillStyle = PAL.ink; rrect(g, 0, 0.2, 10, 0.8, 0.2); g.fill(); g.fillStyle = '#c8905a'; rrect(g, 0.12, 0.32, 9.76, 0.56, 0.15); g.fill(); g.fillStyle = '#e0b080'; g.fillRect(0.3, 0.38, 9.4, 0.12);
    for (let k = 0; k < 5; k++) leaf(g, 1.2 + k * 1.9, 0.9, PI / 2 + (k & 1 ? 0.4 : -0.4), 0.7, LEAF, 0.07);
  }),
  pumpkinpile: () => bb(5, 2.8, 30, g => { pumpkinDraw(g, 1.2, 2.0, 0.7); pumpkinDraw(g, 3.8, 2.05, 0.66); pumpkinDraw(g, 2.5, 1.35, 0.72); pumpkinDraw(g, 2.5, 2.25, 0.52); }),
  windsock: () => bb(2.4, 5.0, 36, g => { g.fillStyle = PAL.ink; g.fillRect(0.25, 0.4, 0.3, 4.6); g.fillStyle = '#fff6e0'; g.fillRect(0.31, 0.4, 0.18, 4.55); ball(g, 0.4, 0.4, 0.22, ['#ffd93b', '#f0a020', '#fffbe0'], 0.06); }),
  crates: () => bb(7, 1.6, 30, g => { for (let k = 0; k < 4; k++) crateDraw(g, 0.1 + k * 1.72, 0.25, 1.65, 1.3); crateDraw(g, 1.0, -0.6, 1.5, 0.9); }),
  rampSide: null
};
function pumpkinDraw(g, x, y, r) { ball(g, x, y, r, ['#ff9a45', '#d9622a', '#ffe2c8'], r * 0.11); g.strokeStyle = '#d9622a'; g.lineWidth = r * 0.08; for (const k of [-0.48, 0, 0.48]) { g.beginPath(); g.ellipse(x + k * r, y, r * 0.28, r * 0.86, 0, 0, TAU); g.stroke(); } g.strokeStyle = PAL.ink; g.lineWidth = r * 0.28; g.beginPath(); g.moveTo(x, y - r * 0.9); g.lineTo(x + r * 0.14, y - r * 1.25); g.stroke(); g.strokeStyle = '#6a8a3a'; g.lineWidth = r * 0.14; g.stroke(); leaf(g, x + r * 0.14, y - r * 1.1, -0.3, r * 0.8, LEAF, r * 0.1); }
function crateDraw(g, x, y, w, h) { g.fillStyle = PAL.ink; g.fillRect(x, y, w, h); g.fillStyle = '#d8a060'; g.fillRect(x + w * 0.065, y + h * 0.07, w * 0.87, h * 0.86); g.fillStyle = '#b07838'; for (const f of [0.28, 0.54, 0.8]) g.fillRect(x + w * 0.065, y + h * f, w * 0.87, h * 0.05); for (let k = 0; k < 4; k++) ball(g, x + w * (0.22 + k * 0.19), y + h * 0.16, w * 0.075, ['#ff9a45', '#d9622a', '#ffe2c8'], w * 0.02); }
function lampDraw(g, col) {
  g.fillStyle = PAL.ink; g.fillRect(0.62, 1.4, 0.36, 4.2); g.fillStyle = '#fff6e0'; g.fillRect(0.7, 1.4, 0.2, 4.1); g.fillStyle = col; for (let y = 1.7; y < 5.4; y += 0.6) g.fillRect(0.7, y, 0.2, 0.25);
  g.fillStyle = PAL.ink; rrect(g, 0.15, 0.25, 1.3, 1.25, 0.55); g.fill(); g.fillStyle = '#fff3b0'; rrect(g, 0.25, 0.35, 1.1, 1.05, 0.48); g.fill();
  g.strokeStyle = '#ffb24a'; g.lineWidth = 0.06; for (const x of [0.55, 0.8, 1.05]) { g.beginPath(); g.moveTo(x, 0.4); g.quadraticCurveTo(x + (x - 0.8) * 0.4, 0.88, x, 1.35); g.stroke(); }
  g.fillStyle = PAL.ink; g.fillRect(0.45, 0.1, 0.7, 0.22); g.fillRect(0.45, 1.36, 0.7, 0.2); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(0.55, 0.65, 0.12, 0.2, 0, 0, TAU); g.fill();
}
/* the sides of a ramp, by skin (a billboard each side) */
function rampSideDraw(g, skin) {
  if (skin === 'hay') { g.fillStyle = PAL.ink; rrect(g, 0.05, 0.1, 1.7, 1.15, 0.25); g.fill(); g.fillStyle = '#f2d65a'; rrect(g, 0.15, 0.2, 1.5, 0.95, 0.2); g.fill(); g.strokeStyle = '#c8a030'; g.lineWidth = 0.05; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0.3 + k * 0.24, 0.25); g.lineTo(0.25 + k * 0.24, 1.1); g.stroke(); } g.fillStyle = '#d24a3a'; g.fillRect(0.55, 0.2, 0.08, 0.95); g.fillRect(1.15, 0.2, 0.08, 0.95); }
  else if (skin === 'log') { g.fillStyle = PAL.ink; rrect(g, 0.05, 0.3, 1.7, 0.95, 0.45); g.fill(); g.fillStyle = '#a8703a'; rrect(g, 0.15, 0.4, 1.5, 0.75, 0.37); g.fill(); g.fillStyle = '#e0b080'; g.beginPath(); g.ellipse(1.45, 0.77, 0.2, 0.33, 0, 0, TAU); g.fill(); g.strokeStyle = '#a8703a'; g.lineWidth = 0.04; g.beginPath(); g.ellipse(1.45, 0.77, 0.1, 0.18, 0, 0, TAU); g.stroke(); leaf(g, 0.4, 0.4, -1.2, 0.35, LEAF, 0.05); }
  else if (skin === 'barrow') { g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(0.1, 0.3); g.lineTo(1.7, 0.3); g.lineTo(1.4, 0.95); g.lineTo(0.3, 0.95); g.closePath(); g.fill(); g.fillStyle = '#5f90ff'; g.beginPath(); g.moveTo(0.22, 0.4); g.lineTo(1.58, 0.4); g.lineTo(1.32, 0.86); g.lineTo(0.38, 0.86); g.closePath(); g.fill(); ball(g, 0.85, 1.0, 0.22, TYRE, 0.05); blobs(g, [[0.5, 0.3, 0.18], [0.9, 0.22, 0.22], [1.3, 0.3, 0.18]], ['#7ed957', '#3f9a3a', '#e2ffd2'], 0.04); }
  else if (skin === 'crate') crateDraw(g, 0.15, 0.1, 1.5, 1.15);
  else if (skin === 'catapult') { g.fillStyle = PAL.ink; rrect(g, 0.1, 0.5, 1.6, 0.6, 0.2); g.fill(); g.fillStyle = '#ffd93b'; rrect(g, 0.2, 0.6, 1.4, 0.4, 0.15); g.fill(); g.fillStyle = PAL.ink; for (let x = 0.3; x < 1.5; x += 0.35) g.fillRect(x, 0.6, 0.15, 0.4); blobs(g, [[0.4, 0.4, 0.3], [0.9, 0.3, 0.36], [1.4, 0.42, 0.28]], ['#ffffff', '#f2d8ec', '#ffffff'], 0.05); }
  else blobs(g, [[0.45, 0.75, 0.42], [0.95, 0.6, 0.5], [1.4, 0.8, 0.38]], skin === 'fluff' ? ['#ffd0ec', '#f29ccf', '#ffffff'] : ['#ffffff', '#f2d8ec', '#ffffff'], 0.06);
}
function sunStalk(g, side) {   /* the tunnel's giant sunflowers lean over the road */
  const bx = side < 0 ? 1.5 : 4.7, hx = side < 0 ? 3.9 : 2.3;
  g.strokeStyle = PAL.ink; g.lineWidth = 0.42; g.beginPath(); g.moveTo(bx, 8.0); g.quadraticCurveTo(bx, 3.6, hx, 2.4); g.stroke();
  g.strokeStyle = '#5fae3a'; g.lineWidth = 0.22; g.stroke();
  leaf(g, bx + 0.05, 6.0, side < 0 ? -0.6 : PI + 0.6, 1.3, LEAF, 0.1); leaf(g, bx + 0.1, 4.7, side < 0 ? PI + 0.5 : -0.5, 1.1, LEAF, 0.1);
  sunflowerHead(g, hx, 1.95, 1.25, side * 0.3);
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
  g.strokeStyle = m[2]; g.lineWidth = r * 0.06; g.beginPath(); g.arc(0, 0, r * 0.62, PI * 1.05, PI * 1.45); g.stroke();
  g.fillStyle = PAL.ink; circle(g, 0, 0, r * 0.22); g.fill(); g.fillStyle = m[1]; circle(g, 0, 0, r * 0.12); g.fill();
  for (let k = 0; k < 6; k++) { const a = k * TAU / 6; g.fillStyle = m[1]; circle(g, Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.07); g.fill(); }
  g.restore();
}
function balloonBunch(g, x, y, s) {
  const B = [[-0.55, 0.1, '#ff7a8a'], [0.55, 0.0, '#7fd0ff'], [0, -0.55, '#ffd93b'], [0.05, 0.55, '#b6f07a']];
  g.strokeStyle = PAL.ink; g.lineWidth = 0.06 * s; for (const b of B) { g.beginPath(); g.moveTo(x + b[0] * s, y + b[1] * s + 0.45 * s); g.quadraticCurveTo(x + b[0] * s * 0.3, y + 2.4 * s, x, y + 3.6 * s); g.stroke(); }
  for (const b of B) ball(g, x + b[0] * s, y + b[1] * s, 0.52 * s, [b[2], mix(b[2], '#2b2140', 0.3), '#ffffff'], 0.08 * s);
}
function bakeTheme(theme) {
  if (THEME === theme && SPR.ok) return;
  const keep = {}; for (const k of KEEP) keep[k] = SPR[k]; keep.ok = false;
  THEME = theme; SPR = keep;
  const need = { meadows: ['bush', 'sunL', 'sunR', 'sunflower', 'tree', 'pumpkin', 'cabbage', 'arch', 'glass', 'beam', 'pumpkinpile'], skyway: ['puffP', 'puffB', 'lamp', 'lampB', 'rainbow', 'balloons', 'arch', 'windsock'], works: ['post', 'chimney', 'gear', 'crate', 'pipe', 'arch', 'crates'] }[theme] || [];
  for (const k of need) SPR[k] = SCENERY[k]();
  SPR.ramp = {}; for (const sk of ['barrow', 'hay', 'log', 'catapult', 'kicker', 'fluff', 'crate']) SPR.ramp[sk] = bb(1.8, 1.3, 40, g => rampSideDraw(g, sk));
  SPR.signs = {};
  SPR.ok = true;
}
function signSprite(txt) { const c = SPR.signs && SPR.signs[txt]; if (c) return c; return (SPR.signs[txt] = bb(6.4, 5.0, 34, g => signDraw(g, 6.4, 5.0, txt))); }   /* fix round 1: readable from further back (was 4.2 x 3.4 m) */

/* ---------- item art: HUD icons (40 px) and world sprites ---------- */
function berryGold(g, x, y, s) { ball(g, x, y + 1 * s, 10 * s, ['#ffd93b', '#f0a020', '#fffbe0'], 2.2 * s); leaf(g, x + 1 * s, y - 8 * s, -0.4, 8 * s, LEAF, 1.8 * s); twinkle(g, x + 7 * s, y - 6 * s, 3 * s, 0, '#fff'); }
function puddle(g, x, y, rx, ry, s) { g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(x, y, rx + 2 * s, ry + 1.8 * s, 0, 0, TAU); g.fill(); g.fillStyle = '#9b4fd0'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); g.fillStyle = '#c88af0'; g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.38, ry * 0.32, 0, 0, TAU); g.fill(); }
function blueberry(g, x, y, r) {   /* glossy blueberry with a dark crown ring (5 soft notches) and a white highlight; no spikes */
  ball(g, x, y, r, ['#6f8ff0', '#33449e', '#e4ebff'], r * 0.2);
  const cy = y - r * 0.62, rx = r * 0.36, ry = r * 0.17;
  g.fillStyle = '#1c2460'; g.beginPath(); g.ellipse(x, cy, rx, ry, 0, 0, TAU); g.fill();
  for (let k = 0; k < 5; k++) { const a = PI + k * PI / 4; g.beginPath(); g.ellipse(x + Math.cos(a) * rx * 0.95, cy + Math.sin(a) * ry * 0.95 - ry * 0.25, rx * 0.2, ry * 0.42, 0, 0, TAU); g.fill(); }
  g.fillStyle = '#4a5ab8'; g.beginPath(); g.ellipse(x, cy + ry * 0.1, rx * 0.5, ry * 0.45, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.15, r * 0.16, r * 0.26, -0.4, 0, TAU); g.fill();
}
function daisy(g, x, y, r) {   /* a whole flower: 10 petals round a yellow centre */
  for (let k = 0; k < 10; k++) { const a = k * TAU / 10; g.save(); g.translate(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55); g.rotate(a); g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(0, 0, r * 0.52, r * 0.2, 0, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, 0, r * 0.44, r * 0.13, 0, 0, TAU); g.fill(); g.restore(); }
  ball(g, x, y, r * 0.32, ['#ffd93b', '#f0a020', '#fffbe0'], r * 0.07);
}
function dandelion(g, x, y, r, a) {   /* a dandelion clock: thin radial seed lines with tuft dots, on a short green stem */
  g.strokeStyle = PAL.ink; g.lineWidth = r * 0.14; g.beginPath(); g.moveTo(x, y + r * 0.3); g.quadraticCurveTo(x + r * 0.1, y + r * 1.0, x - r * 0.05, y + r * 1.45); g.stroke();
  g.strokeStyle = '#6fbf52'; g.lineWidth = r * 0.07; g.stroke();
  g.fillStyle = 'rgba(255,255,255,' + (0.55 * (a == null ? 1 : a)) + ')'; circle(g, x, y, r); g.fill();
  g.strokeStyle = 'rgba(120,110,150,.55)'; g.lineWidth = r * 0.035;
  for (let k = 0; k < 22; k++) { const t = k * 2.39996, q = r * 0.92; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(t) * q, y + Math.sin(t) * q); g.stroke(); }
  g.fillStyle = '#fff'; for (let k = 0; k < 22; k++) { const t = k * 2.39996, q = r * 0.92; circle(g, x + Math.cos(t) * q, y + Math.sin(t) * q, r * 0.1); g.fill(); }
  g.fillStyle = '#c8b890'; circle(g, x, y, r * 0.16); g.fill();
}
function sprigDraw(g, x, y, s) {   /* a thyme sprig with lilac sparkles */
  g.strokeStyle = PAL.ink; g.lineWidth = 2.6 * s; g.beginPath(); g.moveTo(x - 6 * s, y + 12 * s); g.quadraticCurveTo(x + 2 * s, y, x + 2 * s, y - 13 * s); g.stroke(); g.strokeStyle = '#7a8a4a'; g.lineWidth = 1.2 * s; g.stroke();
  for (let k = 0; k < 6; k++) { const t = k / 6, px = x - 6 * s + (8 * t) * s, py = y + 12 * s - 25 * t * s, sd = k & 1 ? 1 : -1; g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(px + sd * 3.4 * s, py, 3.4 * s, 2 * s, sd * 0.5, 0, TAU); g.fill(); g.fillStyle = k & 1 ? '#8fbf6a' : '#a8d880'; g.beginPath(); g.ellipse(px + sd * 3.4 * s, py, 2.5 * s, 1.3 * s, sd * 0.5, 0, TAU); g.fill(); }
  twinkle(g, x + 9 * s, y - 8 * s, 4 * s, 0.3, '#d8c4ff'); twinkle(g, x - 9 * s, y - 3 * s, 3 * s, 0, '#b9a2ff'); twinkle(g, x + 8 * s, y + 7 * s, 2.6 * s, 0.6, '#e4d8ff');
}
function sproutDraw(g, x, y, s) {   /* a big two-leaf sprout */
  g.strokeStyle = PAL.ink; g.lineWidth = 4 * s; g.beginPath(); g.moveTo(x, y + 13 * s); g.quadraticCurveTo(x - 2 * s, y + 3 * s, x, y - 3 * s); g.stroke(); g.strokeStyle = '#5fae3a'; g.lineWidth = 2 * s; g.stroke();
  leaf(g, x, y - 2 * s, PI + 0.35, 13 * s, LEAF, 2 * s); leaf(g, x, y - 2 * s, -0.35, 13 * s, LEAF, 2 * s);
  g.fillStyle = '#a8703a'; g.strokeStyle = PAL.ink; g.lineWidth = 1.6 * s; g.beginPath(); g.ellipse(x, y + 13 * s, 7 * s, 2.6 * s, 0, 0, TAU); g.fill(); g.stroke();
}
function itemIcon(g, kind, x, y, s) {
  if (kind === 'boost') berryGold(g, x, y, s);
  else if (/^boost3/.test(kind)) {   /* one, two or three berries for the uses left (review A13) */
    const n = +(kind.slice(-1)) || 3;
    if (n === 1) berryGold(g, x, y, s);
    else if (n === 2) { berryGold(g, x - 7 * s, y + 3 * s, s * 0.74); berryGold(g, x + 7 * s, y + 3 * s, s * 0.74); }
    else { berryGold(g, x - 9 * s, y + 5 * s, s * 0.7); berryGold(g, x + 9 * s, y + 5 * s, s * 0.7); berryGold(g, x, y - 6 * s, s * 0.7); }
  }
  else if (kind === 'splat') { puddle(g, x, y + 5 * s, 13 * s, 6.4 * s, s); ball(g, x + 2 * s, y - 7 * s, 6 * s, ['#7a5cff', '#4a2ab8', '#e0d8ff'], 1.8 * s); g.fillStyle = '#9b4fd0'; for (const [a, b] of [[-11, -2], [11, -1], [7, -11]]) { circle(g, x + a * s, y + b * s, 2 * s); g.fill(); } }
  else if (kind === 'splat3') { puddle(g, x - 8 * s, y + 8 * s, 7 * s, 3.6 * s, s); puddle(g, x + 8 * s, y + 8 * s, 7 * s, 3.6 * s, s); puddle(g, x, y - 3 * s, 7.5 * s, 3.8 * s, s); ball(g, x, y - 11 * s, 3.6 * s, ['#7a5cff', '#4a2ab8', '#e0d8ff'], 1.2 * s); }
  else if (kind === 'blue') blueberry(g, x, y + 1 * s, 11.5 * s);
  else if (kind === 'swirl') daisy(g, x, y, 14 * s);
  else if (kind === 'shield') { g.fillStyle = 'rgba(160,220,255,.35)'; circle(g, x, y, 13 * s); g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = 2.6 * s; g.stroke(); g.strokeStyle = '#bfe8ff'; g.lineWidth = 1.4 * s; circle(g, x, y, 12.2 * s); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - 5 * s, y - 6 * s, 4 * s, 2 * s, -0.6, 0, TAU); g.fill(); twinkle(g, x + 6 * s, y + 5 * s, 2.5 * s, 0, '#fff'); }
  else if (kind === 'puff') { g.fillStyle = PAL.ink; circle(g, x, y - 3 * s, 12.6 * s); g.fill(); g.fillStyle = '#5a7ab8'; circle(g, x, y - 3 * s, 11.4 * s); g.fill(); dandelion(g, x, y - 3 * s, 10.5 * s, 1.6); }
  else if (kind === 'thyme') sprigDraw(g, x, y, s);
  else if (kind === 'giant') sproutDraw(g, x, y, s);
}
const KEEP = ['box', 'icons', 'balloon', 'blue', 'puff', 'lob', 'haz'];
function bakeItems() {
  /* the surprise bubble: a leaf swirl inside (no star: review A17) */
  SPR.box = bb(2.2, 2.2, 50, g => {
    const x = 1.1, y = 1.1, r = 0.92;
    const gr = g.createRadialGradient(x - 0.3, y - 0.3, 0.1, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(0.65, 'rgba(214,190,255,.5)'); gr.addColorStop(1, 'rgba(184,150,250,.7)');
    g.fillStyle = gr; circle(g, x, y, r); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 0.08; g.beginPath(); g.arc(x, y, r - 0.1, PI * 0.65, PI * 1.35); g.stroke();   /* one lilac tint and a white sheen (fix round 1: no rainbow band) */
    g.strokeStyle = PAL.ink; g.lineWidth = 0.08; circle(g, x, y, r + 0.03); g.stroke();
    for (let k = 0; k < 3; k++) leaf(g, x, y + 0.02, -PI / 2 + k * TAU / 3, 0.44, LEAF, 0.05);
    ball(g, x, y + 0.02, 0.09, ['#ffd93b', '#f0a020', '#fffbe0'], 0.03);
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(x - 0.42, y - 0.5, 0.22, 0.1, -0.6, 0, TAU); g.fill();
  });
  SPR.balloon = bb(3, 6, 30, g => balloonBunch(g, 1.5, 1.6, 1));
  SPR.blue = bb(1.4, 1.4, 70, g => blueberry(g, 0.7, 0.72, 0.55));
  SPR.puff = bb(2.4, 3.2, 50, g => dandelion(g, 1.2, 1.2, 0.95, 1));
  SPR.lob = bb(1.0, 1.0, 70, g => { ball(g, 0.5, 0.52, 0.34, ['#b06ae8', '#6a2ab0', '#f0d8ff'], 0.06); });
  SPR.icons = {};
  for (const k of ['boost', 'boost3_1', 'boost3_2', 'boost3_3', 'splat', 'splat3', 'blue', 'swirl', 'shield', 'puff', 'thyme', 'giant']) SPR.icons[k] = sprite(40, 40, g => itemIcon(g, k, 20, 20, 1.2));
  SPR.icons.boost3 = SPR.icons.boost3_3;
  SPR.haz = {
    sprUp: bb(1.6, 1.6, 50, g => { g.fillStyle = PAL.ink; g.fillRect(0.62, 0.6, 0.36, 1.0); g.fillStyle = '#8a8eaa'; g.fillRect(0.7, 0.6, 0.2, 1.0); ball(g, 0.8, 0.55, 0.3, ['#ffd93b', '#f0a020', '#fffbe0'], 0.06); g.fillStyle = PAL.ink; g.fillRect(0.5, 0.25, 0.6, 0.14); }),
    sprDown: bb(1.6, 1.6, 50, g => { ball(g, 0.8, 1.35, 0.3, ['#ffd93b', '#f0a020', '#fffbe0'], 0.06); }),
    pumpkin: bb(2.2, 2.2, 50, g => pumpkinDraw(g, 1.1, 1.15, 0.9)),
    barrel: bb(2.4, 2.4, 50, g => {   /* a wooden juice barrel with a fruit label (no face) */
      g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(1.2, 1.2, 1.12, 1.12, 0, 0, TAU); g.fill();
      g.fillStyle = '#b07838'; g.beginPath(); g.ellipse(1.2, 1.2, 1.0, 1.0, 0, 0, TAU); g.fill();
      g.strokeStyle = '#8a5a28'; g.lineWidth = 0.07; for (let x = 0.45; x < 2.0; x += 0.3) { const hh = Math.sqrt(Math.max(0, 1 - (x - 1.2) ** 2)); g.beginPath(); g.moveTo(x, 1.2 - hh); g.lineTo(x, 1.2 + hh); g.stroke(); }
      g.strokeStyle = '#c8c8d8'; g.lineWidth = 0.1; circle(g, 1.2, 1.2, 0.97); g.stroke();
      g.fillStyle = '#fff6e0'; rrect(g, 1.35, 0.55, 0.52, 0.42, 0.08); g.fill(); ball(g, 1.6, 0.78, 0.13, ['#ff5a66', '#c22d4f', '#ffd0d5'], 0.03); leaf(g, 1.63, 0.66, -0.8, 0.14, LEAF, 0.02);
    }),
    basket: bb(2.2, 2.0, 50, g => {   /* a hanging flower basket */
      g.strokeStyle = PAL.ink; g.lineWidth = 0.06; for (const x of [0.4, 1.1, 1.8]) { g.beginPath(); g.moveTo(x, 0.9); g.lineTo(1.1, 0.05); g.stroke(); }
      blobs(g, [[0.6, 0.95, 0.38], [1.1, 0.85, 0.44], [1.6, 0.95, 0.38]], ['#7ed957', '#3f9a3a', '#e2ffd2'], 0.05);
      for (const [x, y, c] of [[0.6, 0.8, '#ff7a8a'], [1.15, 0.65, '#ffd93b'], [1.55, 0.85, '#b9a2ff']]) flowerDot(g, x, y, 0.13, c);
      g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(0.25, 1.0); g.lineTo(1.95, 1.0); g.quadraticCurveTo(1.85, 1.9, 1.1, 1.92); g.quadraticCurveTo(0.35, 1.9, 0.25, 1.0); g.fill();
      g.fillStyle = '#c8905a'; g.beginPath(); g.moveTo(0.36, 1.08); g.lineTo(1.84, 1.08); g.quadraticCurveTo(1.74, 1.8, 1.1, 1.82); g.quadraticCurveTo(0.46, 1.8, 0.36, 1.08); g.fill();
      g.strokeStyle = '#8a5a28'; g.lineWidth = 0.05; for (let y = 1.25; y < 1.8; y += 0.18) { g.beginPath(); g.moveTo(0.42, y); g.lineTo(1.78, y); g.stroke(); }
    }),
    cloud: [0, 1].map(d => bb(6, 3.6, 24, g => blobs(g, [[1.4, 2.2, 1.1], [2.7, 1.5, 1.4], [4.2, 1.8, 1.2], [5.0, 2.4, 0.8], [3.0, 2.5, 1.0]], d ? ['#b8acd8', '#8a7aac', '#d8d0f0'] : ['#ece6ff', '#c8bce8', '#ffffff'], 0.12))),
    sock: [0, 1, 2].map(f => bb(3.4, 1.6, 40, g => {   /* the sock of a windsock: limp, filling, full */
      const L = 1.2 + f * 0.9, droop = [0.7, 0.3, 0.04][f];
      g.save(); g.translate(0.15, 0.4);
      for (let k = 0; k < 4; k++) { const x0 = k * L / 4, x1 = (k + 1) * L / 4, w0 = 0.42 - k * 0.07, w1 = 0.42 - (k + 1) * 0.07, y0 = droop * (x0 / L) ** 2, y1 = droop * (x1 / L) ** 2;
        g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(x0, y0 - w0 - 0.05); g.lineTo(x1 + 0.03, y1 - w1 - 0.05); g.lineTo(x1 + 0.03, y1 + w1 + 0.05); g.lineTo(x0, y0 + w0 + 0.05); g.closePath(); g.fill();
        g.fillStyle = k & 1 ? '#fff6e0' : '#ff7a8a'; g.beginPath(); g.moveTo(x0, y0 - w0); g.lineTo(x1, y1 - w1); g.lineTo(x1, y1 + w1); g.lineTo(x0, y0 + w0); g.closePath(); g.fill(); }
      g.restore();
    })),
    piston: [0, 1].map(on => bb(2.4, 2.0, 50, g => {   /* a round yellow-and-black bumper on a post, with its lamp */
      g.fillStyle = PAL.ink; g.fillRect(1.0, 1.0, 0.4, 1.0); g.fillStyle = '#a3abc8'; g.fillRect(1.08, 1.0, 0.24, 1.0);
      g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(1.2, 0.95, 1.12, 0.55, 0, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.ellipse(1.2, 0.95, 1.0, 0.45, 0, 0, TAU); g.clip(); g.fillStyle = PAL.sun; g.fillRect(0, 0, 2.4, 2); g.fillStyle = PAL.ink; for (let x = -1; x < 3; x += 0.5) { g.beginPath(); g.moveTo(x, 0.4); g.lineTo(x + 0.25, 0.4); g.lineTo(x + 0.55, 1.5); g.lineTo(x + 0.3, 1.5); g.closePath(); g.fill(); } g.restore();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(0.8, 0.75, 0.3, 0.08, -0.2, 0, TAU); g.fill();
      ball(g, 1.2, 0.35, 0.18, on ? ['#ffe36b', '#ffb24a', '#ffffff'] : ['#8a80a3', '#5a4f73', '#c8c0d8'], 0.05);
    })),
    bump: bb(2.2, 1.6, 40, g => blobs(g, [[0.6, 1.0, 0.5], [1.15, 0.75, 0.62], [1.65, 1.02, 0.46]], ['#ffe0f2', '#f2b8dc', '#ffffff'], 0.06)),
    rail: bb(0.8, 1.6, 40, g => { g.fillStyle = PAL.ink; g.fillRect(0.28, 0.4, 0.24, 1.2); g.fillStyle = '#fff6e0'; g.fillRect(0.33, 0.4, 0.14, 1.15); ball(g, 0.4, 0.4, 0.18, ['#ff9ac0', '#e0608e', '#ffe0ec'], 0.05); }),
    bcloud: bb(7.2, 3.4, 24, g => blobs(g, [[1.5, 2.2, 1.1], [3.0, 1.6, 1.5], [4.6, 1.8, 1.3], [5.8, 2.3, 0.9], [3.4, 2.5, 1.1]], ['#ffffff', '#e8dcf8', '#ffffff'], 0.12))
  };
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
      if (!layer) tile(() => { for (let k = 0; k < 9; k++) { const x = hash(k, 3) * TWL, y = 20 + hash(k, 4) * 40, s = 0.7 + hash(k, 5) * 0.8; g.globalAlpha = 0.95; blobs(g, [[x, y, 18 * s], [x + 22 * s, y - 8 * s, 22 * s], [x + 46 * s, y, 16 * s]], ['#ffffff', '#dceffa', '#ffffff'], 2.5); g.globalAlpha = 1; } });
      if (!layer) hills(g, TWL, H, 104, 26, 5, ['#9fd6a0', '#7fbf88', '#c8f0c8'], 2);
      else { hills(g, TWL, H, 122, 20, 9, ['#5cb85a', '#3f9a3a', '#9be88a'], 3); tile(() => { for (let k = 0; k < 26; k++) { const x = hash(k, 9) * TWL, y = H - 22 - hash(k, 8) * 12; blobs(g, [[x, y - 9, 8], [x + 8, y - 13, 9], [x + 16, y - 8, 7]], ['#4cb85a', '#2f8f4a', '#9be88a'], 2); g.fillStyle = PAL.ink; g.fillRect(x + 6, y - 4, 4, 9); } }); }
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
/* a hill band: filled across the whole wrapped tile, then only its top curve is inked (no side or bottom edges: review A7) */
function hills(g, TWL, H, base, amp, n, m, lw) {
  const y = x => base - amp * (0.5 + 0.5 * Math.sin(x / TWL * TAU * n + 0.3) * Math.cos(x / TWL * TAU * 2));
  g.beginPath(); g.moveTo(-TWL - 10, H + 10);
  for (let x = -TWL - 10; x <= 2 * TWL + 10; x += 10) g.lineTo(x, y(x));
  g.lineTo(2 * TWL + 10, H + 10); g.closePath(); g.fillStyle = m[0]; g.fill();
  g.beginPath(); for (let x = -TWL - 10; x <= 2 * TWL + 10; x += 10) { if (x === -TWL - 10) g.moveTo(x, y(x)); else g.lineTo(x, y(x)); }
  g.strokeStyle = PAL.ink; g.lineWidth = lw; g.stroke();
}

/* =====================================================================================================================
   THE TRACK FLOOR: mip-mapped texels as Uint32, one ImageData per view, per-row distance tables.
   The grain noise is added here to the level-0 texels (one read-back, no extra round trip: review E2); two prepared
   tracks are kept, and prefetch(T) builds the next one ahead (during the results).
   ===================================================================================================================== */
let TR = null; const TRC = [];   /* TR = the current {T, tex:[Uint32Array], size:[], shift:[], border, map}; TRC = the cache (2) */
/* the build in steps (a generator): the texture, its read-back, the grain noise in 128-row slices, the mips one by one. prefetch()
   runs it in idle slices of about 6 ms (fix round 1: a cold build blocked the page for up to 0.8 s on a slow phone); prepTrack()
   finishes it at once if it is needed now */
function* buildSteps(T) {
  const c = SK.trackTexture(T), lv = [], size = [], shift = [];
  yield 0;
  const g0 = c.getContext('2d', { willReadFrequently: true }), d0 = g0.getImageData(0, 0, c.width, c.height), u0 = new Uint32Array(d0.data.buffer), W = c.width;
  const amt = T.theme === 'skyway' ? 7 : 12, seed = T.theme.length * 13;
  yield 0;
  for (let y0 = 0; y0 < W; y0 += 128) {
    for (let y = y0; y < Math.min(W, y0 + 128); y++) {
      let o = y * W;
      for (let x = 0; x < W; x++, o++) {
        let h = Math.imul(x + seed, 374761393) + Math.imul(y, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
        let h2 = Math.imul((x >> 2) + 77, 374761393) + Math.imul((y >> 2) + seed, 668265263) | 0; h2 = Math.imul(h2 ^ (h2 >>> 13), 1274126177); h2 ^= h2 >>> 16;
        const n = (((h >>> 0) & 1023) / 1023 - 0.5) * amt + (((h2 >>> 0) & 1023) / 1023 - 0.5) * amt * 0.8 | 0;
        const p = u0[o], r = (p & 255) + n, gg = ((p >>> 8) & 255) + n, b = ((p >>> 16) & 255) + n;
        u0[o] = (p & 0xff000000) | ((b < 0 ? 0 : b > 255 ? 255 : b) << 16) | ((gg < 0 ? 0 : gg > 255 ? 255 : gg) << 8) | (r < 0 ? 0 : r > 255 ? 255 : r);
      }
    }
    yield 0;
  }
  g0.putImageData(d0, 0, 0);
  lv.push(u0); size.push(W); shift.push(Math.round(Math.log2(W)));
  yield 0;
  let src = c;
  for (let l = 1; l < 6; l++) {
    const sz = W >> l, cv = canvas(sz, sz), g = cv.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, sz, sz);
    lv.push(new Uint32Array(g.getImageData(0, 0, sz, sz).data.buffer)); size.push(sz); shift.push(Math.round(Math.log2(sz)));
    src = cv;
    yield 0;
  }
  const b = THEMES[T.theme].border, border = (255 << 24 | b[2] << 16 | b[1] << 8 | b[0]) >>> 0;
  const map = canvas(128, 128); map.getContext('2d').drawImage(c, 0, 0, 128, 128);
  T._tex = null;
  return { T, tex: lv, size, shift, border, map, mm: null };
}
const PEND = new Map();   /* T → {gen, timer}: builds running in idle slices */
function finish(gen) { let r; do { r = gen.next(); } while (!r.done); return r.value; }
function buildTrack(T) { const job = PEND.get(T); if (job) { clearTimeout(job.timer); PEND.delete(T); return finish(job.gen); } return finish(buildSteps(T)); }
function cacheAdd(e) { TRC.push(e); while (TRC.length > 2) { const old = TRC.shift(); if (old === TR) { TRC.push(old); if (TRC.length > 2) TRC.shift(); } } }
function prepTrack(T) {
  if (TR && TR.T === T) return TR;
  let e = TRC.find(q => q.T === T);
  if (!e) { e = buildTrack(T); TRC.push(e); while (TRC.length > 2) TRC.shift(); }
  else { TRC.splice(TRC.indexOf(e), 1); TRC.push(e); }
  TR = e; return TR;
}
/* build T ahead, in idle slices (the results card, the track picker, a GRAND PRIX button) */
function prefetch(T) {
  if (!T || TRC.some(q => q.T === T) || PEND.has(T)) return;
  const job = { gen: buildSteps(T), timer: 0 }; PEND.set(T, job);
  const run = () => {
    job.timer = 0; if (PEND.get(T) !== job) return;
    const t0 = performance.now(); let r;
    do { r = job.gen.next(); } while (!r.done && performance.now() - t0 < 6);
    if (r.done) { PEND.delete(T); if (!TRC.some(q => q.T === T)) cacheAdd(r.value); } else job.timer = setTimeout(run, 0);
  };
  job.timer = setTimeout(run, 0);
}
function mkView() { return { vw: 0, vh: 0, split: -1, hz: 0, f: 0, camH: 0, dist: 0, cv: null, g: null, img: null, u32: null, cam: { x: 0, y: 0, dir: 0, ok: false, fx: 0, fy: 0, zoom: 1 } }; }
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
function drawFloor(V, M, cx, cy, dir, camH) {
  const vw = V.vw, vh = V.vh, hz = V.hz, f = V.f, u32 = V.u32, TPM = SK.WORLD.TPM, cs = Math.cos(dir), sn = Math.sin(dir), border = M.border;
  const rowK = V.rowK, rowLv = V.rowLv, hs = camH / V.camH;
  for (let y = hz + 1; y < vh; y++) {
    const k = rowK[y] * hs, z = k * f, lv = rowLv[y];
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
   paintV2(g, T): the v2 floor features, painted into the track texture (g is in metres). Cut roads are painted on their
   own layer and masked to the cut's cells (the main road always wins), then ramps, the stream, gaps, grates, plates,
   ring glows and the bounce clouds go on top.
   ===================================================================================================================== */
function cutPath(c, lat) { const p = new Path2D(); for (let i = 0; i < c.n; i++) { const x = c.X[i] - c.TY[i] * (lat || 0), y = c.Y[i] + c.TX[i] * (lat || 0); if (i) p.lineTo(x, y); else p.moveTo(x, y); } return p; }
function cutRange(c, u0, u1, lat) { const p = new Path2D(); const i0 = Math.max(0, Math.floor(u0 * (c.n - 1))), i1 = Math.min(c.n - 1, Math.ceil(u1 * (c.n - 1))); for (let i = i0; i <= i1; i++) { const x = c.X[i] - c.TY[i] * (lat || 0), y = c.Y[i] + c.TX[i] * (lat || 0); if (i > i0) p.lineTo(x, y); else p.moveTo(x, y); } return p; }
function inFrame(g, T, f, a, lat, fn) { const C = f.on >= 0 ? T.cuts[f.on] : null, p = C ? C.pos(a, lat || 0) : T.pos(a, lat || 0); g.save(); g.translate(p.x, p.y); g.rotate(p.dir); fn(g); g.restore(); }
function paintV2(g, T) {
  const TPM = SK.WORLD.TPM, WS = SK.WORLD.WS, GN = T.GN, sky = T.edge === 'void', theme = T.theme;
  g.lineJoin = 'round'; g.lineCap = 'round';
  /* 1. the cuts: each on a small layer over its own bounding box, masked to its cells, then laid on the floor */
  for (const c of T.cuts) {
    const pad0 = c.hw + c.verge + 3; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let i = 0; i < c.n; i++) { x0 = Math.min(x0, c.X[i]); y0 = Math.min(y0, c.Y[i]); x1 = Math.max(x1, c.X[i]); y1 = Math.max(y1, c.Y[i]); }
    const cx0 = Math.max(0, Math.floor((x0 - pad0) / T.CELL)), cy0 = Math.max(0, Math.floor((y0 - pad0) / T.CELL)), cx1 = Math.min(GN, Math.ceil((x1 + pad0) / T.CELL)), cy1 = Math.min(GN, Math.ceil((y1 + pad0) / T.CELL));
    const bw = cx1 - cx0, bh = cy1 - cy0; if (bw <= 0 || bh <= 0) continue;
    const ox = cx0 * T.CELL, oy = cy0 * T.CELL;
    const L = canvas(bw * T.CELL * TPM, bh * T.CELL * TPM), q = L.getContext('2d', { willReadFrequently: true }); q.scale(TPM, TPM); q.translate(-ox, -oy); q.lineJoin = 'round'; q.lineCap = 'round';
    {
      const C0 = cutPath(c, 0), allVoid = c.surf.some(r => r[0] <= 0 && r[1] >= 1 && r[2] === 'void');
      if (theme === 'meadows') {
        q.strokeStyle = '#2f8f4a'; q.lineWidth = (c.hw + c.verge + 1.6) * 2; q.stroke(C0);
        for (const side of [-1, 1]) for (let i = 0; i < c.n; i += 2) { const lat = side * (c.hw + c.verge + 0.8 + hash(i, side + 3) * 0.6), x = c.X[i] - c.TY[i] * lat, y = c.Y[i] + c.TX[i] * lat; q.fillStyle = hash(i, side) < 0.5 ? '#3fa356' : '#287a40'; circle(q, x, y, 0.9 + hash(i, 9) * 0.5); q.fill(); }
        q.strokeStyle = '#8ad460'; q.lineWidth = (c.hw + c.verge) * 2; q.stroke(C0);
        q.strokeStyle = '#c99c66'; q.lineWidth = c.hw * 2 + 0.6; q.stroke(C0); q.strokeStyle = '#e8cc9c'; q.lineWidth = c.hw * 2 - 0.4; q.stroke(C0);
        for (let i = 0; i < c.n * 3; i++) { const u = hash(i, 51), p = c.pos(u * c.len, (hash(i, 52) - 0.5) * (c.hw * 2 - 1.5)); q.fillStyle = hash(i, 53) < 0.5 ? '#d8b882' : '#f4dcae'; circle(q, p.x, p.y, 0.12 + hash(i, 54) * 0.15); q.fill(); }
        for (const r of c.surf) if (r[2] === 'rough') {   /* the veg patch: soil with cabbage rows */
          q.strokeStyle = '#a8784a'; q.lineWidth = (c.hw + c.verge) * 2; q.stroke(cutRange(c, r[0], r[1], 0));
          for (let u = r[0] * c.len; u <= r[1] * c.len; u += 1.6) for (let lat = -c.hw + 0.9; lat <= c.hw - 0.6; lat += 1.8) { const p = c.pos(u, lat + ((u * 1.3) % 0.6)); q.fillStyle = PAL.ink; circle(q, p.x, p.y, 0.58); q.fill(); q.fillStyle = '#9fd870'; circle(q, p.x, p.y, 0.48); q.fill(); q.fillStyle = '#d8f5b8'; circle(q, p.x - 0.12, p.y - 0.12, 0.2); q.fill(); }
        }
        /* the greenhouse floor: tiles (u .50-.85) */
        if (c.id === 'greenhouse') for (let u = 0.5 * c.len; u < 0.85 * c.len; u += 1.2) for (let lat = -c.hw; lat < c.hw; lat += 1.2) { const p = c.pos(u, lat + 0.6); q.save(); q.translate(p.x, p.y); q.rotate(p.dir); q.fillStyle = ((u / 1.2 | 0) + (lat / 1.2 | 0) + 9) & 1 ? '#e8d8c0' : '#d0b898'; q.fillRect(-0.58, -0.58, 1.16, 1.16); q.restore(); }
      } else if (theme === 'skyway') {
        if (allVoid) {   /* the hops: open sky with a dotted line of little clouds showing the way */
          for (let u = 2; u < c.len; u += 4) { const p = c.pos(u, 0); q.globalAlpha = 0.5; q.fillStyle = '#ffffff'; circle(q, p.x, p.y, 0.7); q.fill(); q.globalAlpha = 1; }
        } else {
          q.strokeStyle = 'rgba(120,90,200,.25)'; q.lineWidth = (c.hw + c.verge) * 2 + 1.6; q.stroke(C0);
          q.strokeStyle = PAL.plum; q.lineWidth = c.hw * 2 + 0.5; q.stroke(C0);
          q.strokeStyle = '#ffffff'; q.lineWidth = c.hw * 2 + 0.1; q.stroke(C0); q.setLineDash([1.6, 1.6]); q.strokeStyle = '#ff8fc8'; q.stroke(C0); q.setLineDash([]);
          q.strokeStyle = '#d6c8ff'; q.lineWidth = c.hw * 2 - 1.6; q.stroke(C0);
          for (let i = 0; i < c.n * 3; i++) { const p = c.pos(hash(i, 61) * c.len, (hash(i, 62) - 0.5) * (c.hw * 2 - 2)); q.fillStyle = hash(i, 63) < 0.5 ? '#c6b4ff' : '#ece4ff'; circle(q, p.x, p.y, 0.1 + hash(i, 64) * 0.12); q.fill(); }
          for (const r of c.surf) if (r[2] === 'rough') {   /* sticky candyfloss: pink fluff mounds */
            for (let u = r[0] * c.len; u <= r[1] * c.len; u += 0.9) for (let k = 0; k < 3; k++) { const p = c.pos(u + hash(u * 10 | 0, k) * 0.6, (hash(k, u * 10 | 0) - 0.5) * (c.hw * 2 - 1)); q.fillStyle = k & 1 ? '#ffc8e8' : '#ffb0dc'; circle(q, p.x, p.y, 0.5 + hash(k, u | 0) * 0.4); q.fill(); q.fillStyle = 'rgba(255,255,255,.7)'; circle(q, p.x - 0.15, p.y - 0.15, 0.2); q.fill(); }
          }
        }
      } else {   /* works: steel plates with yellow-black edges, belts with chevrons */
        q.strokeStyle = PAL.plum; q.lineWidth = (c.hw + c.verge + 1.2) * 2; q.stroke(C0);
        q.setLineDash([1.6, 1.6]); q.strokeStyle = '#ffd93b'; q.stroke(C0); q.setLineDash([]);
        q.strokeStyle = '#8c879a'; q.lineWidth = (c.hw + c.verge) * 2; q.stroke(C0);
        q.strokeStyle = '#4a4d66'; q.lineWidth = c.hw * 2 + 0.5; q.stroke(C0); q.strokeStyle = '#b4bcd4'; q.lineWidth = c.hw * 2 - 0.4; q.stroke(C0);
        for (let u = 0; u < c.len; u += 2.4) { const p = c.pos(u, 0); q.save(); q.translate(p.x, p.y); q.rotate(p.dir); q.fillStyle = 'rgba(74,77,102,.45)'; q.fillRect(-0.05, -c.hw + 0.2, 0.1, c.hw * 2 - 0.4); for (const l of [-c.hw + 0.6, c.hw - 0.6]) { q.fillStyle = '#8a8eaa'; circle(q, 0.4, l, 0.13); q.fill(); } q.restore(); }
        for (const r of c.surf) if (r[2] === 'belt') {
          q.strokeStyle = '#34324a'; q.lineWidth = c.hw * 2; q.stroke(cutRange(c, r[0], r[1], 0));
          for (let u = r[0] * c.len + 0.5; u < r[1] * c.len - 1; u += 2.2) { const p = c.pos(u, 0); q.save(); q.translate(p.x, p.y); q.rotate(p.dir); q.fillStyle = '#4c4966'; q.fillRect(-0.9, -c.hw, 0.25, c.hw * 2); q.fillStyle = '#ffd93b'; q.beginPath(); q.moveTo(-0.4, -c.hw + 0.6); q.lineTo(0.5, 0); q.lineTo(-0.4, c.hw - 0.6); q.lineTo(0.15, c.hw - 0.6); q.lineTo(1.05, 0); q.lineTo(0.15, -c.hw + 0.6); q.closePath(); q.fill(); q.restore(); }
        }
      }
    }
    /* the mask: this cut's own cells (and the main verge cells its road crosses at the mouths) */
    const m = canvas(bw, bh), mg = m.getContext('2d', { willReadFrequently: true }), im = mg.createImageData(bw, bh), md = new Uint32Array(im.data.buffer), lim = T.hw + T.off, pad = c.edge === 'void' ? 0.3 : 1.7;
    for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) {
      const cell = (cy0 + yy) * GN + cx0 + xx; if (T.cg[cell] - 1 !== c.i) continue;
      const d = T.dist[cell], e = T.cdist[cell];
      if ((d > lim && e <= c.hw + c.verge + pad) || (d > T.hw && T.grid[cell] === 1)) md[yy * bw + xx] = 0xffffffff;
    }
    mg.putImageData(im, 0, 0);
    q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'destination-in'; q.imageSmoothingEnabled = true; q.drawImage(m, 0, 0, L.width, L.height);
    g.drawImage(L, ox, oy, bw * T.CELL, bh * T.CELL);
  }
  /* 2. features */
  for (const f of T.feats) {
    const C = f.on >= 0 ? T.cuts[f.on] : null;
    if (f.k === 'ramp') {
      const len = f.a1 - f.a0, w = f.l1 - f.l0, ml = (f.l0 + f.l1) / 2;
      const col = { barrow: ['#c8905a', '#e0b080'], hay: ['#e8c050', '#f6dc80'], log: ['#a8703a', '#c8905a'], catapult: ['#ffd93b', '#fff3a0'], kicker: ['#ff9ac0', '#ffd0ec'], fluff: ['#ffb0dc', '#ffe0f2'], crate: ['#d8a060', '#f0c890'] }[f.skin] || ['#c8905a', '#e0b080'];
      inFrame(g, T, f, f.a0, ml, q => {
        q.fillStyle = PAL.ink; q.fillRect(-0.15, -w / 2 - 0.15, len + 0.3, w + 0.3);
        for (let x = 0; x < len; x += 0.5) { q.fillStyle = (x / 0.5 | 0) & 1 ? col[0] : col[1]; q.fillRect(x, -w / 2, 0.5, w); }
        q.fillStyle = 'rgba(43,33,64,.35)'; for (let x = 0.5; x < len; x += 0.5) q.fillRect(x - 0.03, -w / 2, 0.06, w);
        q.fillStyle = '#fff'; for (let l = -w / 2 + 0.8; l < w / 2 - 0.4; l += 1.6) { q.beginPath(); q.moveTo(0.3, l - 0.5); q.lineTo(1.0, l); q.lineTo(0.3, l + 0.5); q.lineTo(0.6, l + 0.5); q.lineTo(1.3, l); q.lineTo(0.6, l - 0.5); q.closePath(); q.fill(); }
        q.fillStyle = PAL.ink; q.fillRect(len - 0.25, -w / 2, 0.25, w); q.fillStyle = f.aim ? '#ff7a8a' : '#fff6e0'; q.fillRect(len - 0.2, -w / 2 + 0.05, 0.12, w - 0.1);
      });
    } else if (f.k === 'ford') {   /* the stream: blue water, white ripples and stepping stones */
      const len = f.a1 - f.a0, w = T.hw + T.off;
      inFrame(g, T, f, f.a0, 0, q => {
        q.fillStyle = '#4a9ad8'; q.fillRect(-0.4, -w, len + 0.8, w * 2); q.fillStyle = '#6fb8e8'; q.fillRect(0, -w, len, w * 2);
        q.strokeStyle = 'rgba(255,255,255,.75)'; q.lineWidth = 0.18; for (let l = -w + 1; l < w; l += 1.4) { q.beginPath(); q.moveTo(len * 0.2, l); q.quadraticCurveTo(len * 0.5, l + 0.4, len * 0.8, l); q.stroke(); }
        for (let k = 0; k < 7; k++) { const x = len * (0.25 + 0.5 * hash(k, 71)), l = -w + 1.2 + k * (w * 2 - 2.4) / 6; q.fillStyle = PAL.ink; circle(q, x, l, 0.55); q.fill(); q.fillStyle = '#b8b0c8'; circle(q, x, l, 0.45); q.fill(); q.fillStyle = '#e0dcea'; circle(q, x - 0.12, l - 0.12, 0.16); q.fill(); }
      });
    } else if (f.k === 'gap') {   /* the sky through the gap, with fluffy torn edges */
      const len = f.a1 - f.a0, w = C ? C.hw + 0.6 : T.hw + T.off + 0.4;
      inFrame(g, T, f, f.a0, 0, q => {
        const gr = q.createLinearGradient(0, -w, 0, w); gr.addColorStop(0, '#8fd0ff'); gr.addColorStop(1, '#a8d4ff'); q.fillStyle = gr; q.fillRect(0, -w, len, w * 2);
        for (const x of [0, len]) for (let l = -w; l <= w; l += 0.7) { q.fillStyle = '#ffffff'; circle(q, x + (x ? 0.2 : -0.2) + (hash(l * 10 | 0, x | 0) - 0.5) * 0.3, l, 0.42 + hash(l * 7 | 0, 3) * 0.3); q.fill(); }
        for (let k = 0; k < 4; k++) { q.globalAlpha = 0.6; q.fillStyle = '#fff'; circle(q, len * (0.3 + 0.15 * k), -w + 1 + hash(k, 5) * (w * 2 - 2), 0.6 + hash(k, 6) * 0.5); q.fill(); q.globalAlpha = 1; }
      });
    } else if (f.k === 'ring') {   /* a rainbow glow under each gate */
      inFrame(g, T, f, f.a0, 0, q => { q.globalAlpha = 0.85; for (let k = 0; k < 3; k++) { const x = k * 0.5; q.fillStyle = k & 1 ? '#ffffff' : '#ffd93b'; q.beginPath(); q.moveTo(x, -3.2); q.lineTo(x + 0.55, 0); q.lineTo(x, 3.2); q.lineTo(x + 0.3, 3.2); q.lineTo(x + 0.85, 0); q.lineTo(x + 0.3, -3.2); q.closePath(); q.fill(); } q.globalAlpha = 1; });
    } else if (f.k === 'bounce') {   /* a fluffy cloud disc on the open sky */
      g.fillStyle = 'rgba(120,90,200,.25)'; circle(g, f.x + 0.3, f.y + 0.4, f.r + 0.5); g.fill();
      for (let k = 0; k < 9; k++) { const a = k * TAU / 9; g.fillStyle = '#ffffff'; circle(g, f.x + Math.cos(a) * f.r * 0.7, f.y + Math.sin(a) * f.r * 0.7, f.r * 0.45); g.fill(); }
      g.fillStyle = '#ffffff'; circle(g, f.x, f.y, f.r * 0.8); g.fill(); g.fillStyle = '#f2e6ff'; circle(g, f.x + 0.4, f.y + 0.4, f.r * 0.45); g.fill();
    } else if (f.k === 'block') {
      inFrame(g, T, f, f.a0, 0, q => { q.fillStyle = 'rgba(43,33,64,.35)'; q.fillRect(-0.5, -C.hw, f.a1 - f.a0 + 1, C.hw * 2); });
    }
  }
  /* 3. hazard floor marks: steam grates, piston plates, the pumpkin lanes */
  for (const H of T.hazards) {
    const C = H.on >= 0 ? T.cuts[H.on] : null, P = (a, l) => C ? C.pos(a, l) : T.pos(a, l);
    if (H.skin === 'steam') { const p = P(H.a, H.lat); g.fillStyle = PAL.ink; circle(g, p.x, p.y, H.r + 0.25); g.fill(); g.fillStyle = '#5a5e78'; circle(g, p.x, p.y, H.r); g.fill(); g.save(); g.translate(p.x, p.y); g.rotate(p.dir); g.fillStyle = '#2f3046'; for (let x = -H.r + 0.4; x < H.r - 0.2; x += 0.45) { const hh = Math.sqrt(Math.max(0, H.r * H.r - x * x)) - 0.2; g.fillRect(x, -hh, 0.2, hh * 2); } g.restore(); }
    else if (H.k === 'piston') { const p = P(H.a, H.lat); g.fillStyle = PAL.ink; circle(g, p.x, p.y, H.r + 0.35); g.fill(); g.fillStyle = PAL.sun; circle(g, p.x, p.y, H.r + 0.2); g.fill(); g.fillStyle = PAL.ink; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(p.x, p.y); g.arc(p.x, p.y, H.r + 0.2, k * TAU / 8, k * TAU / 8 + TAU / 16); g.closePath(); g.fill(); } g.fillStyle = '#6b7090'; circle(g, p.x, p.y, H.r - 0.15); g.fill(); g.fillStyle = '#8a8eaa'; circle(g, p.x - 0.2, p.y - 0.2, H.r * 0.5); g.fill(); }
    else if (H.path === 'cross') { const a = P(H.a, H.l0), b = P(H.a, H.l1); g.strokeStyle = 'rgba(160,100,40,.28)'; g.lineWidth = H.r * 1.6; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  }
}

/* =====================================================================================================================
   WORLD EFFECTS (render side only: sparks, puffs, dust, juice drops, fluff, petals, wisps, streaks, smoke)
   ===================================================================================================================== */
const PARTS = [];
function part(k, x, y, z, vx, vy, vz, life, c, s) { if (PARTS.length > 600) return; PARTS.push({ k, x, y, z, vx, vy, vz, age: 0, life, c, s }); }
const MTC = ['#ffffff', '#8fe07a', '#ffb24a', '#ffd93b'];
const BOUNCED = new Map();   /* bounce cloud → tick it last bounced (for its squash) */
let fxT = 0, VIEWED = [-1, -1, -1];
function fxTick(sim) {
  fxT++;
  const T = sim.track;
  for (const k of sim.karts) {
    if (k.fall || k.lift) continue;
    const c = Math.cos(k.dir), s = Math.sin(k.dir), sc = k.scale || 1, bx = k.x - c * sc, by = k.y - s * sc, own = VIEWED.indexOf(k.i) >= 0;
    if (k.drift && k.mt) for (const sd of [-1, 1]) { const wx = bx - s * sd * 0.7 * sc, wy = by + c * sd * 0.7 * sc; if (hash(fxT, k.i * 7 + sd) < 0.8) part('spark', wx, wy, own ? 0.5 : 0.15, -c * 2 + (hash(fxT, k.i) - 0.5) * 4, -s * 2 + (hash(k.i, fxT) - 0.5) * 4, 2 + hash(fxT + 3, k.i) * 3, 14, MTC[k.mt], 0.12 + k.mt * 0.03); }
    else if (k.drift && fxT % 3 === 0) part('puff', bx, by, 0.2, -c, -s, 0.6, 18, '#ffffff', 0.25);
    if (k.boost) for (const sd of [-1, 1]) part('flame', bx - c * 0.2 - s * sd * 0.32 * sc, by - s * 0.2 + c * sd * 0.32 * sc, 0.42 * sc, -c * 2.5, -s * 2.5, 0.6, 7, (fxT + sd) & 2 ? '#ffb24a' : '#ffe36b', 0.13 * sc);
    if (k.surf === 0 && Math.abs(k.v) > 7 && fxT % 3 === 0 && !k.air) part('puff', bx, by, 0.15, -c * 2, -s * 2, 1, 22, T.theme === 'skyway' ? '#ffffff' : T.theme === 'works' ? '#b8b0c8' : '#d8c08a', 0.3);
    if (k.wob && fxT % 3 === 0) part(k.wobBy === 'steam' ? 'puff' : 'drop', k.x + (hash(fxT, k.i) - 0.5), k.y + (hash(k.i, fxT) - 0.5), 1.3 * sc, (hash(fxT, 3) - 0.5) * 3, (hash(fxT, 4) - 0.5) * 3, 1.5, 20, k.wobBy === 'steam' ? '#ffffff' : '#9fd8ff', 0.15);
    if (k.twirl && fxT % 2 === 0) part('twinkle', k.x, k.y, (k.z || 0) + 0.8, (hash(fxT, k.i) - 0.5) * 3, (hash(k.i, fxT) - 0.5) * 3, -0.5, 22, ['#ffd93b', '#ff9ac0', '#7fd0ff', '#b6f07a'][fxT % 4], 0.22);
    if (k.tiny && fxT % 6 === 0) part('twinkle', k.x + (hash(fxT, k.i) - 0.5) * 1.2, k.y + (hash(k.i, fxT) - 0.5) * 1.2, 1.3, 0, 0, 0.6, 24, fxT & 8 ? '#d8c4ff' : '#b9a2ff', 0.16);
    if (k.giant && fxT % 4 === 0) part('leafp', k.x + (hash(fxT, k.i) - 0.5) * 3, k.y + (hash(k.i, fxT) - 0.5) * 3, 2.4, 0, 0, 0.8, 30, '#8fe07a', 0.25);
  }
  /* hazard bits: sprinkler spray, steam wisps, rain drops */
  if (T.hazards) for (let h = 0; h < T.hazards.length; h++) {
    const H = T.hazards[h]; if (H.k !== 'spray') continue;
    SK.hazState(T, H, sim.clock, HS); if (!HS.n) continue;
    if (H.skin === 'sprinkler' && HS.ph === 2 && fxT % 2 === 0) { const lat = H.l0 + hash(fxT, h) * (H.l1 - H.l0), C = H.on >= 0 ? T.cuts[H.on] : null, p = C ? C.pos(H.a + (hash(h, fxT) - 0.5) * H.half * 2, lat) : T.pos(H.a + (hash(h, fxT) - 0.5) * H.half * 2, lat); part('drop', p.x, p.y, 1.5, 0, 0, 1, 18, '#9fd8ff', 0.12); }
    else if (H.skin === 'steam' && HS.ph >= 1 && fxT % (HS.ph === 2 ? 1 : 4) === 0) part('puff', HS.x[0] + (hash(fxT, h) - 0.5) * H.r, HS.y[0] + (hash(h, fxT) - 0.5) * H.r, 0.2, 0, 0, HS.ph === 2 ? 6 : 1.5, HS.ph === 2 ? 34 : 24, '#ffffff', HS.ph === 2 ? 0.7 : 0.35);
    else if (H.skin === 'rain' && HS.ph >= 1 && fxT % (HS.ph === 2 ? 1 : 6) === 0) for (let j = 0; j < (HS.ph === 2 ? 3 : 1); j++) { const a = hash(fxT + j * 97, h) * TAU, r = Math.sqrt(hash(h + j * 31, fxT)) * H.r; part('rain', HS.x[0] + Math.cos(a) * r, HS.y[0] + Math.sin(a) * r, 5.5, 0, 0, -14, 24, '#9fc8ff', HS.ph === 2 ? 0.2 : 0.1); }   /* raining: dense and heavy; the tell: a first drop now and then */
  }
  if (T.theme === 'works' && fxT % 14 === 0) for (const d of T.deco) if (d.smoke) part('smoke', d.x + (hash(fxT, d.x | 0) - 0.5), d.y, 17.5, (hash(d.y | 0, fxT) - 0.5) * 0.8, 0.4, 2.2, 150, '#f4eef8', 1.2);
  let w = 0;
  for (let i = 0; i < PARTS.length; i++) {
    const p = PARTS[i]; p.age++; if (p.age >= p.life) continue;
    p.x += p.vx / 60; p.y += p.vy / 60; p.z += p.vz / 60;
    if (p.k === 'spark' || p.k === 'drop') { p.vz -= 18 / 60; if (p.z < 0) { p.z = 0; p.vz *= -0.3; } }
    if (p.k === 'rain' && p.z < 0) continue;
    p.vx *= 0.95; p.vy *= 0.95;
    PARTS[w++] = p;
  }
  PARTS.length = w;
}
const DROPC = { splat: '#9b4fd0', lob: '#9b4fd0', blue: '#5f7fe8', giant: '#8fe07a' };
/* a dandelion burst: seeds start on a ring round the kart and fly outward with their stalks pointing in (fix round 1: spawned on
   one spot they merged into a white blob with tips) */
function fluffRing(k, nn, z) { for (let j = 0; j < nn; j++) { const an = j * TAU / nn + 0.2, r0 = 0.6 + 0.4 * hash(j, 7); part('fluff', k.x + Math.cos(an) * r0, k.y + Math.sin(an) * r0, z + (hash(j, 5) - 0.5) * 0.6, Math.cos(an) * 3.5, Math.sin(an) * 3.5, 1 + hash(j, 2) * 1.5, 56, an, 0.18); } }
const LUCK = [];   /* per kart: the last LUCKY roll {t: fxT, a: 1|2} (the HUD flashes the item slot) */
function fxEvent(sim, e) {
  const k = e[1] >= 0 ? sim.karts[e[1]] : null, n = e[0], a = e[2];
  if (!k) return;
  if (n === 'lucky') { LUCK[k.i] = { t: fxT, a }; return; }
  const own = VIEWED.indexOf(k.i) >= 0, c = Math.cos(k.dir), s = Math.sin(k.dir);
  /* juice for hits; for a kart on a view the drops spray sideways and away from the camera (review A8) */
  const spray = (col, nn) => { for (let j = 0; j < nn; j++) { const sd = j & 1 ? 1 : -1, an = own ? k.dir + sd * (0.9 + 0.5 * hash(j, fxT)) : j * TAU / nn; part('drop', k.x, k.y, 0.8, Math.cos(an) * 4 + (own ? c * 2 : 0), Math.sin(an) * 4 + (own ? s * 2 : 0), 3 + (j & 1) * 2, 34, col, 0.2); } };
  if (n === 'spin') { spray(DROPC[a] || '#9b4fd0', 10); for (let j = 0; j < 5; j++) part('twinkle', k.x, k.y, 1.6, Math.cos(j * 1.3) * 2, Math.sin(j * 1.3) * 2, 0.6, 30, '#fff', 0.3); }
  else if (n === 'bonk') { if (a === 'puff') fluffRing(k, 12, 1.5); else for (let j = 0; j < 6; j++) part('twinkle', k.x, k.y, 1.8, Math.cos(j * 1.05) * 2.5, Math.sin(j * 1.05) * 2.5, 1, 26, '#fff', 0.3); }
  else if (n === 'wobble') { k.wobBy = a; spray(a === 'steam' ? '#ffffff' : '#9fd8ff', 6); }
  else if (n === 'tiny') { for (let j = 0; j < 10; j++) part('twinkle', k.x, k.y, 1.2, Math.cos(j * 0.63) * 2.5, Math.sin(j * 0.63) * 2.5, 1, 30, j & 1 ? '#d8c4ff' : '#b6f07a', 0.25); }
  else if (n === 'giant') { for (let j = 0; j < 14; j++) part('leafp', k.x, k.y, 1.5, Math.cos(j * 0.45) * 4, Math.sin(j * 0.45) * 4, 2, 40, '#8fe07a', 0.3); }
  else if (n === 'box') { for (let j = 0; j < 10; j++) { const an = j * TAU / 10; part('twinkle', k.x, k.y, 1.2, Math.cos(an) * 3, Math.sin(an) * 3, 2, 26, ['#ff7a8a', '#ffd93b', '#8fe07a', '#7fd0ff', '#b9a2ff'][j % 5], 0.25); } }
  else if (n === 'turbo') { for (let j = 0; j < 6; j++) part('flame', k.x - c, k.y - s, 0.5, -c * 5 + (hash(j, 3) - 0.5) * 3, -s * 5 + (hash(j, 4) - 0.5) * 3, 0.8, 18, MTC[a] || '#ffd93b', 0.5); }
  else if (n === 'shield' && a === 'pop') { for (let j = 0; j < 10; j++) { const an = j * TAU / 10; part('twinkle', k.x, k.y, 1, Math.cos(an) * 4, Math.sin(an) * 4, 1, 22, '#bfe8ff', 0.3); } }
  else if (n === 'splash') { spray('#5f7fe8', 12); }
  else if (n === 'puffpop') fluffRing(k, 14, 1.6);
  else if (n === 'immune' && !(k.giant > 0)) { for (let j = 0; j < 8; j++) { const an = j * TAU / 8; part('twinkle', k.x + Math.cos(an) * 1.2, k.y + Math.sin(an) * 1.2, 1.4, Math.cos(an) * 1.5, Math.sin(an) * 1.5, 0.8, 30, j & 1 ? '#fff6b0' : '#bfe8ff', 0.26); } }   /* SAFE!: a sparkle ring (still dizzy from the last hit) */
  else if (n === 'tailwind') { for (let j = 0; j < 10; j++) part('streak', k.x + (hash(j, 5) - 0.5) * 2.5, k.y + (hash(5, j) - 0.5) * 2.5, 0.5 + hash(j, 6) * 1.2, -c * 8, -s * 8, 0, 18, '#ffffff', 0.12); }
  else if (n === 'launch' && a === 'bounce') { let best = null, bd = 1e9; for (const C of sim.track.cuts) for (const f of C.feats) if (f.k === 'bounce') { const d = (f.x - k.x) ** 2 + (f.y - k.y) ** 2; if (d < bd) { bd = d; best = f; } } if (best) BOUNCED.set(best, fxT); }
  else if (n === 'petal') { for (let j = 0; j < 4; j++) part('petal', k.x, k.y, 1, (hash(j, fxT) - 0.5) * 4, (hash(fxT, j) - 0.5) * 4, 1.5, 30, '#ffffff', 0.18); }
  else if (n === 'land' && a === 1) { for (let j = 0; j < 8; j++) { const an = j * TAU / 8; part('twinkle', k.x, k.y, 0.6, Math.cos(an) * 3, Math.sin(an) * 3, 1.5, 24, ['#ffd93b', '#ff9ac0', '#7fd0ff'][j % 3], 0.24); } }
}

/* =====================================================================================================================
   ONE VIEW: sky, floor, ground decals, sprites
   ===================================================================================================================== */
const DL = []; for (let i = 0; i < 1400; i++) DL.push({ z: 0, t: 0, o: null, X: 0, Y: 0, s: 0, j: 0 });
let dn = 0;
const HS = { ph: 0, fr: 0, n: 0, x: [0, 0, 0, 0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0, 0, 0, 0], z: [0, 0, 0, 0, 0, 0, 0, 0], lat: [0, 0, 0, 0, 0, 0, 0, 0], rot: [0, 0, 0, 0, 0, 0, 0, 0] };
const HZP = []; for (let i = 0; i < 64; i++) HZP.push({ h: 0, H: null, j: 0, ph: 0, fr: 0, x: 0, y: 0, z: 0, rot: 0, lat: 0 });
let hzN = 0;
const PET = [];
function camera(slot, k, snap) {
  const c = VIEWS[slot].cam; if (!k) return;
  VIEWED[slot] = k.i;
  if (k.fall) { c.ok = true; return; }
  const want = k.dir + k.vd * 0.3;
  if (snap || !c.ok || k.lift > 70) c.dir = want; else c.dir += wrapA(want - c.dir) * 0.12;
  const zt = k.lift ? 1.5 : Math.max(k.gro > 0 ? 1 + 0.25 * k.gro / 20 : 1, k.boost ? 1.12 : 1, k.air ? 1.1 : 1);
  c.zoom = (c.zoom || 1) + (zt - (c.zoom || 1)) * (snap ? 1 : 0.08);
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
function push(z, t, o, X, Y, s, j) { if (dn >= DL.length) return; const d = DL[dn++]; d.z = z; d.t = t; d.o = o; d.X = X; d.Y = Y; d.s = s; d.j = j || 0; }
/* the view's projection, shared by the decals and the sprites */
const PJ = { cx: 0, cy: 0, cs: 1, sn: 0, f: 1, half: 1, S: 1, hz: 0, camH: 1, rx: 0, ry: 0, far: 150 };
function pj(x, y, h, out) { const rx = x - PJ.cx, ry = y - PJ.cy, z = rx * PJ.cs + ry * PJ.sn, xr = -rx * PJ.sn + ry * PJ.cs; out.z = z; if (z <= 0.05) return out; out.X = PJ.rx + (PJ.half + xr * PJ.f / z) * PJ.S; out.Y = PJ.ry + (PJ.hz + 0.5 + (PJ.camH - (h || 0)) * PJ.f / z) * PJ.S; return out; }
/* a ground polygon (world x,y pairs) clipped to z ≥ 0.8 and filled */
const PQ = { X: 0, Y: 0, z: 0 }, POLY = [];
function groundPoly(ctx, pts, h) {
  const n = pts.length >> 1, NEAR = 0.8; let m = 0;
  const at = i => { const x = pts[i * 2], y = pts[i * 2 + 1]; return [x, y, (x - PJ.cx) * PJ.cs + (y - PJ.cy) * PJ.sn]; };
  for (let i = 0; i < n; i++) {
    const A = at(i), B = at((i + 1) % n);
    if (A[2] >= NEAR) POLY[m++] = A;
    if ((A[2] >= NEAR) !== (B[2] >= NEAR)) { const t = (NEAR - A[2]) / (B[2] - A[2]); POLY[m++] = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, NEAR]; }
  }
  if (m < 3) return false;
  ctx.beginPath();
  for (let i = 0; i < m; i++) { pj(POLY[i][0], POLY[i][1], h || 0, PQ); if (i) ctx.lineTo(PQ.X, PQ.Y); else ctx.moveTo(PQ.X, PQ.Y); }
  ctx.closePath(); return true;
}
const RING = []; for (let i = 0; i < 24; i++) RING.push(0, 0);
function ellPts(x, y, ra, rb, rot, n) { const c = Math.cos(rot), s2 = Math.sin(rot); for (let i = 0; i < n; i++) { const a = i * TAU / n, ex = Math.cos(a) * ra, ey = Math.sin(a) * rb; RING[i * 2] = x + ex * c - ey * s2; RING[i * 2 + 1] = y + ex * s2 + ey * c; } RING.length = n * 2; return RING; }
function ringPts(x, y, r, n) { n = n || 16; for (let i = 0; i < n; i++) { const a = i * TAU / n; RING[i * 2] = x + Math.cos(a) * r; RING[i * 2 + 1] = y + Math.sin(a) * r; } RING.length = n * 2; return RING; }
function bandPts(T, C, a0, a1, l0, l1, out) {   /* a strip in a road frame → world points (along the edges) */
  out.length = 0; const P = (a, l) => C ? C.pos(a, l, PQ2) : T.pos(a, l, PQ2), st = Math.max(1, (a1 - a0) / 6);
  for (let a = a0; a <= a1 + 1e-6; a += st) { const p = P(a, l0); out.push(p.x, p.y); }
  for (let a = a1; a >= a0 - 1e-6; a -= st) { const p = P(a, l1); out.push(p.x, p.y); }
  return out;
}
const PQ2 = {}, BP = [];
function drawDecals(ctx, sim, t) {
  const T = sim.track;
  ctx.save();
  /* juice puddles */
  for (const it of sim.items) {
    if (it.k !== 'splat') continue;
    const fade = Math.min(1, (it.life - it.age) / 60);
    if (!groundPoly(ctx, ringPts(it.x, it.y, 1.5, 14))) continue;
    ctx.globalAlpha = fade; ctx.fillStyle = PAL.ink; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = PAL.ink; ctx.stroke();
    if (groundPoly(ctx, ringPts(it.x, it.y, 1.32, 14))) { ctx.fillStyle = '#9b4fd0'; ctx.fill(); }
    if (groundPoly(ctx, ringPts(it.x - 0.35, it.y - 0.3, 0.5, 10))) { ctx.fillStyle = '#c88af0'; ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  /* hazards on the floor: wet sprinkler arcs, rain ring shadows, piston rings, gust streaks */
  if (T.hazards) for (let h = 0; h < T.hazards.length; h++) {
    const H = T.hazards[h], C = H.on >= 0 ? T.cuts[H.on] : null;
    SK.hazState(T, H, sim.clock, HS); if (!HS.n) continue;
    if (H.skin === 'sprinkler' && HS.ph >= 1) {   /* soft wet patches under the jets, with ripples (fix round 1: a hard-edged mat read as a debug box) */
      const wet = HS.ph === 2 ? 0.34 : 0.14 * HS.fr, span = H.l1 - H.l0;
      for (let k2 = 0; k2 < 4; k2++) {
        const lat = H.l0 + span * (0.15 + 0.25 * k2), al = H.a + (k2 - 1.5) * H.half * 0.4, p = C ? C.pos(al, lat, PQ2) : T.pos(al, lat, PQ2), rr = Math.min(2.2, span * 0.17 + 0.6);
        if (groundPoly(ctx, ellPts(p.x, p.y, rr * 1.25, rr, p.dir, 14))) { ctx.fillStyle = 'rgba(80,170,255,' + wet.toFixed(3) + ')'; ctx.fill(); }
        if (HS.ph === 2 && groundPoly(ctx, ellPts(p.x, p.y, rr * (0.5 + 0.7 * ((t * 0.03 + k2 * 0.25) % 1)), rr * 0.8 * (0.5 + 0.7 * ((t * 0.03 + k2 * 0.25) % 1)), p.dir, 14))) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * (1 - ((t * 0.03 + k2 * 0.25) % 1))).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
    } else if (H.skin === 'rain' && HS.ph >= 1) {   /* tell: a shadow that darkens; raining: a wet ring with a bright rim and splash ripples */
      const act = HS.ph === 2;
      if (groundPoly(ctx, ringPts(HS.x[0], HS.y[0], H.r, 18))) { ctx.fillStyle = act ? 'rgba(70,120,220,.42)' : 'rgba(70,55,130,' + (0.12 + 0.25 * HS.fr).toFixed(3) + ')'; ctx.fill(); if (act) { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 3; ctx.stroke(); } }
      if (act) for (let j = 0; j < 3; j++) { const q = (t * 0.04 + j / 3) % 1, a2 = hash(j + ((t * 0.04 + j / 3) | 0) * 3, 11) * TAU, rr2 = Math.sqrt(hash(j, ((t * 0.04 + j / 3) | 0) + 7)) * (H.r - 0.8); if (groundPoly(ctx, ringPts(HS.x[0] + Math.cos(a2) * rr2, HS.y[0] + Math.sin(a2) * rr2, 0.3 + q * 0.9, 10))) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - q)).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.stroke(); } }
    } else if (H.k === 'piston' && HS.ph >= 1) {
      if (groundPoly(ctx, ringPts(HS.x[0], HS.y[0], H.r + 0.6, 16))) { ctx.strokeStyle = HS.ph === 2 ? 'rgba(255,217,59,.9)' : (t >> 2) & 1 ? 'rgba(255,217,59,.8)' : 'rgba(255,217,59,.2)'; ctx.lineWidth = 3; ctx.stroke(); }
    } else if (H.k === 'gust' && HS.ph >= 1) {
      const n = HS.ph === 2 ? 14 : 5, ang = H.dir;
      for (let j = 0; j < n; j++) {
        const along = H.a + (hash(j, h) - 0.5) * 2 * (H.half || 8), lim = C ? C.hw : T.hw + T.off, l = ((t * 0.35 * (HS.ph === 2 ? 1 : 0.4) + j * 4.3) % (lim * 2)) - lim, l2 = l + 4.5;
        const P = (a, q) => C ? C.pos(a, q * ang, PQ2) : T.pos(a, q * ang, PQ2);
        const hh = 0.4 + (j % 3) * 0.7, p1 = P(along, l); pj(p1.x, p1.y, hh, PQ); if (PQ.z < 1.5) continue; const X1 = PQ.X, Y1 = PQ.Y; const p2 = P(along, l2); pj(p2.x, p2.y, hh, PQ); if (PQ.z < 1.5) continue;
        ctx.strokeStyle = 'rgba(255,255,255,' + (HS.ph === 2 ? 0.9 : 0.45) + ')'; ctx.lineWidth = Math.max(1.5, Math.min(6, 0.25 * PJ.f * PJ.S / PQ.z)); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.quadraticCurveTo((X1 + PQ.X) / 2, (Y1 + PQ.Y) / 2 - 4, PQ.X, PQ.Y); ctx.stroke();
      }
    }
  }
  /* EASY nets over the gaps */
  if (sim.cls === 0) for (const f of T.feats) if (f.k === 'gap' && f.net && f.net.indexOf(0) >= 0) {
    const C = f.on >= 0 ? T.cuts[f.on] : null, w = C ? C.hw : T.hw + T.off;
    if (groundPoly(ctx, bandPts(T, C, f.a0, f.a1, -w, w, BP))) { ctx.fillStyle = 'rgba(255,240,250,.35)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,150,200,.8)'; ctx.lineWidth = 1.5; ctx.stroke(); }
    for (let a = f.a0; a <= f.a1; a += 1.5) { const P = l => C ? C.pos(a, l, PQ2) : T.pos(a, l, PQ2); const p1 = P(-w); pj(p1.x, p1.y, 0, PQ); if (PQ.z < 1) continue; const X1 = PQ.X, Y1 = PQ.Y; const p2 = P(w); pj(p2.x, p2.y, 0, PQ); if (PQ.z < 1) continue; ctx.strokeStyle = 'rgba(255,150,200,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X1, Y1); ctx.lineTo(PQ.X, PQ.Y); ctx.stroke(); }
  }
  /* wish puff ring shadows and the thyme ribbon */
  for (const it of sim.items) {
    if (it.k === 'puff' && it.ph >= 1) {
      const tk = sim.karts[it.tgt]; if (!tk) continue;
      const g0 = it.ph === 1 ? 1.2 + it.pt / 50 * 1.3 : 2.5 + it.pt / 12;
      if (groundPoly(ctx, ringPts(tk.x, tk.y, g0, 20))) { ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(60,40,110,.18)'; ctx.fill(); }
    } else if (it.k === 'wave') {
      const hw = T.hw + 1.5;
      if (groundPoly(ctx, bandPts(T, null, it.s - 2.6, it.s, -hw, hw, BP))) { ctx.fillStyle = 'rgba(200,180,255,.55)'; ctx.fill(); }
      if (groundPoly(ctx, bandPts(T, null, it.s - 1.2, it.s, -hw, hw, BP))) { ctx.fillStyle = 'rgba(170,140,255,.9)'; ctx.fill(); ctx.strokeStyle = '#8fe07a'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.stroke(); }
    }
  }
  ctx.restore();
}
function drawView(ctx, rect, sim, ki, t, o) {
  o = o || {};
  const T = sim.track, M = prepTrack(T), V = VIEWS[o.slot || 0], LOWV = LOW;
  const vw = Math.round(rect.w * (LOWV ? 0.375 : 0.5)), vh = Math.round(vw * rect.h / rect.w);
  viewSetup(V, vw, vh, rect.h < rect.w * 0.45 ? 1 : 0);
  bakeTheme(T.theme);
  const k = sim.karts[ki], C = V.cam;
  if (!C.ok && k) camera(o.slot || 0, k, true);
  const zoom = C.zoom || 1, dir = C.dir, cs = Math.cos(dir), sn = Math.sin(dir), zd = V.dist * zoom, cx = C.fx - cs * zd, cy = C.fy - sn * zd;
  const camH = V.camH * (1 + 0.6 * (zoom - 1));
  const S = rect.w / vw;
  ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  drawSky(ctx, rect, V, T.theme, dir, t);
  drawFloor(V, M, cx, cy, dir, camH);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
  const fy = V.hz + 1;
  ctx.drawImage(V.cv, 0, fy, vw, vh - fy, rect.x, rect.y + fy * S, rect.w, (vh - fy) * S);
  const th = THEMES[T.theme], hy = rect.y + fy * S, hg = ctx.createLinearGradient(0, hy - 2, 0, hy + rect.h * 0.09);
  hg.addColorStop(0, th.haze); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.fillRect(rect.x, hy - 2, rect.w, rect.h * 0.09 + 2);
  const f = V.f, half = vw / 2, far = LOWV ? 110 : 150;
  Object.assign(PJ, { cx, cy, cs, sn, f, half, S, hz: V.hz, camH, rx: rect.x, ry: rect.y, far });
  /* ground decals right after the floor, before the sorted sprites (review A6) */
  drawDecals(ctx, sim, t);
  /* gather sprites */
  dn = 0;
  const P = (x, y, h, t2, ob, minZ, j) => {
    const rx = x - cx, ry = y - cy, z = rx * cs + ry * sn; if (z < (minZ || 1.2) || z > far) return;
    const xr = -rx * sn + ry * cs; if (Math.abs(xr) > z * half / f + 14) return;
    const sc = f / z * S; push(z, t2, ob, rect.x + (half + xr * f / z) * S, rect.y + (V.hz + 0.5 + (camH - h) * f / z) * S, sc, j);
  };
  for (const d of T.deco) P(d.x, d.y, d.z || 0, 1, d, 1.0);
  for (const b of sim.boxes) if (b.t <= 0 || b.t < 24) P(b.x, b.y, b.z || 0, 2, b, 1.0);
  for (const it of sim.items) if (it.k !== 'splat') P(it.x, it.y, 0, 3, it, 1.0);
  for (const kk of sim.karts) if (!(o.podium && kk.i === ki)) P(kk.x, kk.y, 0, 4, kk, 0.8);
  for (const p of PARTS) P(p.x, p.y, 0, 5, p, V.dist * 0.62);
  /* hazards, bumpers, rails, bounce clouds */
  hzN = 0;
  if (T.hazards) for (let h = 0; h < T.hazards.length; h++) {
    const H = T.hazards[h]; SK.hazState(T, H, sim.clock, HS);
    const n = Math.max(1, HS.n);
    for (let j = 0; j < n && hzN < HZP.length; j++) {
      const q = HZP[hzN++]; q.h = h; q.H = H; q.j = j; q.ph = HS.ph; q.fr = HS.fr; q.x = HS.x[j]; q.y = HS.y[j]; q.z = HS.z[j]; q.rot = HS.rot[j]; q.lat = HS.lat[j];
      if (H.k === 'gust' || (H.path === 'cross' && !HS.n)) continue;
      P(q.x, q.y, 0, 6, q, 1.0);
    }
  }
  for (const f2 of T.feats) {
    if (f2.k === 'bumper' && f2.cls.indexOf(sim.cls) >= 0) for (let a = f2.a0; a < f2.a1; a += 5) { const p = T.pos(a, f2.side * (T.hw + T.off + 0.3), PQ2); P(p.x, p.y, 0, 7, f2, 1.5, 0); }
    else if (f2.k === 'bounce') P(f2.x, f2.y, 0, 7, f2, 1.5, 1);
  }
  if (sim.cls === 0) for (const Cc of T.cuts) if (Cc.rail.indexOf(0) >= 0) for (let u = 3; u < Cc.len - 3; u += 3) for (const sd of [-1, 1]) { const p = Cc.pos(u, sd * (Cc.hw + 0.3), PQ2); P(p.x, p.y, 0, 7, Cc, 1.5, 2); }
  /* far first */
  const L = DL; for (let a = 1; a < dn; a++) { const v = L[a]; let b = a - 1; while (b >= 0 && L[b].z < v.z) { L[b + 1] = L[b]; b--; } L[b + 1] = v; }
  /* your own kart's screen box: another kart between it and the camera that covers it is drawn see-through (fix round 1: a
     giant right behind you hid your kart completely) */
  OWNB.z = -1; if (!o.podium && !o.cached) for (let j = 0; j < dn; j++) { const d = L[j]; if (d.t === 4 && d.o.i === ki) { const sc2 = d.o.scale > 1 ? 1 + (d.o.scale - 1) * 0.5 / 0.7 : 1, s2 = d.s * sc2; OWNB.z = d.z; OWNB.x0 = d.X - KSW / 2 * s2; OWNB.x1 = d.X + KSW / 2 * s2; OWNB.y0 = d.Y - KAY * s2; OWNB.y1 = d.Y; break; } }
  for (let j = 0; j < dn; j++) { const d = L[j]; drawThing(ctx, d, sim, ki, t, dir, o, far); }
  /* speed streaks at the view edges: fast on HARD and WILD, or boosting */
  if (k && !o.podium && !k.fall && !k.lift && ((sim.cls >= 2 && Math.abs(k.v) > 0.95 * (sim.VT || 25)) || k.boost > 0)) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    for (let j = 0; j < 8; j++) { const side = j & 1 ? 1 : -1, y = rect.y + rect.h * (0.45 + 0.5 * hash(j, (t >> 2) + j)), x = side < 0 ? rect.x + 6 + hash(t, j) * rect.w * 0.12 : rect.x + rect.w - 6 - hash(j, t) * rect.w * 0.12, l = 18 + hash(j, t) * 26; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - side * l * 0.6, y + l * 0.5); ctx.stroke(); }
  }
  ctx.restore();
}
const OWNB = { z: -1, x0: 0, x1: 0, y0: 0, y1: 0 };
function shadow(ctx, X, Y, w, s, a) { ctx.fillStyle = 'rgba(40,30,60,' + (a || 0.28) + ')'; ctx.beginPath(); ctx.ellipse(X, Y, w * s, w * s * 0.28, 0, 0, TAU); ctx.fill(); }
/* sprites fade over the last 15 m before the far plane; big billboards fade out near the camera (review A15) */
function fadeOf(d, far) { let a = d.z > far - 15 ? (far - d.z) / 15 : 1; return a < 0 ? 0 : a; }
function drawThing(ctx, d, sim, ki, t, camDir, o, far) {
  const s = d.s, X = d.X, Y = d.Y, ob = d.o, fa = fadeOf(d, far);
  if (fa <= 0.01) return;
  ctx.globalAlpha = fa;
  if (d.t === 1) {   /* scenery */
    let img = ob.k === 'sign' ? signSprite(ob.text) : ob.k === 'rampSide' ? SPR.ramp && SPR.ramp[ob.skin] : SPR[ob.k]; if (!img) { ctx.globalAlpha = 1; return; }
    const w = ob.w * s, h = ob.h * s; if (h < 1.5) { ctx.globalAlpha = 1; return; }
    const nearA = ob.gate || ob.k === 'beam' ? clamp01((d.z - 3) / 3) : h > 120 ? clamp01((d.z - 1.5) / 1.5) : 1;
    ctx.globalAlpha = fa * nearA; if (ctx.globalAlpha <= 0.01) { ctx.globalAlpha = 1; return; }
    const yy = Y - (ob.z ? ob.z * s : 0);
    if (ob.k === 'gear') { ctx.save(); ctx.translate(X, yy - h / 2); ctx.rotate(t * 0.02 * ob.spin); ctx.drawImage(img, -w / 2, -h / 2, w, h); ctx.restore(); }
    else if (ob.k === 'puffP' || ob.k === 'puffB' || ob.k === 'balloons') { const bob = Math.sin(t * 0.03 + ob.x) * 0.3 * s; ctx.drawImage(img, X - w / 2, yy - h + bob, w, h); }
    else if (ob.k === 'windsock') {
      ctx.drawImage(img, X - w / 2, yy - h + s * 0.15, w, h);
      const H = sim.track.hazards[ob.haz]; SK.hazState(sim.track, H, sim.clock, HS);
      const st = HS.ph === 2 ? 2 : HS.ph === 1 ? 1 : 0, sk = SPR.haz.sock[st], sw = 3.4 * s, sh = 1.6 * s, flap = Math.sin(t * (st ? 0.6 : 0.15)) * (st ? 0.06 : 0.02);
      const TT = sim.track, HC = H.on >= 0 ? TT.cuts[H.on] : null, ang = HC ? HC.ANG[Math.max(0, Math.min(HC.n - 1, Math.floor(H.a / HC.ds)))] : TT.ANG[Math.floor(H.a / TT.ds) % TT.N], side = (H.dir || 1) * Math.cos(ang - camDir) < 0 ? -1 : 1;
      ctx.save(); ctx.translate(X - w / 2 + 0.4 * s, yy - h + 0.4 * s); ctx.scale(side, 1); ctx.rotate(flap); ctx.drawImage(sk, -0.15 * s, -0.4 * s, sw, sh); ctx.restore();
    } else ctx.drawImage(img, X - w / 2, yy - h + s * 0.15, w, h);
    ctx.globalAlpha = 1; return;
  }
  if (d.t === 2) {   /* a surprise bubble (sky bubbles float higher) */
    const grow = ob.t > 0 ? 1 - ob.t / 24 : 1, bob = Math.sin(t * 0.08 + ob.x) * 0.18, sz = 1.5 * grow;
    const nearA = clamp01((d.z - 1.2) / 1.4); ctx.globalAlpha = fa * nearA;
    shadow(ctx, X, Y, 0.6, s, 0.2);
    ctx.drawImage(SPR.box, X - sz * s / 2, Y - (1.0 + bob + (ob.z || 0)) * s - sz * s / 2, sz * s, sz * s);
    if (ob.sky) twinkle(ctx, X + 0.7 * s, Y - (1.6 + (ob.z || 0)) * s, 0.22 * s, t * 0.1, '#fff');
    ctx.globalAlpha = 1; return;
  }
  if (d.t === 3) { drawItem(ctx, ob, X, Y, s, t, sim); ctx.globalAlpha = 1; return; }
  if (d.t === 4) {
    if (OWNB.z > 0 && ob.i !== ki && d.z < OWNB.z) { const sc2 = ob.scale || 1, hw2 = KSW / 2 * d.s * sc2; if (d.X + hw2 > OWNB.x0 && d.X - hw2 < OWNB.x1 && d.Y > OWNB.y0 && d.Y - KAY * d.s * sc2 < OWNB.y1) ctx.globalAlpha = fa * 0.5; }
    drawKart(ctx, d, sim, ki, t, camDir, o); ctx.globalAlpha = 1; return; }
  if (d.t === 5) {   /* particles: capped on screen and faded near the camera (review A8) */
    const p = ob, a = p.age / p.life, Yp = Y - p.z * s, r = Math.min(6, p.s * s), nearA = clamp01((d.z - VIEWS[o.slot || 0].dist * 0.62) / 1.6);
    if (r < 0.4) { ctx.globalAlpha = 1; return; }
    ctx.globalAlpha = fa * nearA;
    if (p.k === 'spark') { ctx.fillStyle = PAL.ink; circle(ctx, X, Yp, r * 1.5); ctx.fill(); twinkle(ctx, X, Yp, r * 2.2, t * 0.3, p.c); }
    else if (p.k === 'twinkle') { ctx.globalAlpha *= 1 - a; twinkle(ctx, X, Yp, r * 1.6, t * 0.2 + p.x, p.c); }
    else if (p.k === 'drop') { ctx.fillStyle = PAL.ink; circle(ctx, X, Yp, r * 1.3); ctx.fill(); ctx.fillStyle = p.c; circle(ctx, X, Yp, r); ctx.fill(); }
    else if (p.k === 'flame') { const rr = r * (1 - a * 0.6); ctx.globalAlpha *= 1 - a * 0.7; ctx.fillStyle = PAL.ink; circle(ctx, X, Yp, rr + Math.max(0.8, rr * 0.25)); ctx.fill(); ctx.fillStyle = p.c; circle(ctx, X, Yp, rr); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; circle(ctx, X - rr * 0.3, Yp - rr * 0.3, rr * 0.3); ctx.fill(); }
    else if (p.k === 'puff' || p.k === 'smoke') { ctx.globalAlpha *= (1 - a) * (p.k === 'smoke' ? 0.85 : 0.7); ctx.fillStyle = p.c; circle(ctx, X, Yp, Math.min(p.k === 'smoke' ? 60 : 14, p.s * s * (0.6 + a))); ctx.fill(); }
    else if (p.k === 'fluff') {   /* a seed: a white tuft on a thin stalk that points back in towards where it came from */
      ctx.globalAlpha *= 1 - a; const num = typeof p.c === 'number', an = num ? p.c - camDir : 0, sx = num ? -Math.sin(an) : 0, sy = num ? Math.cos(an) * 0.45 + 0.35 : 1, sl = Math.hypot(sx, sy) || 1;
      ctx.strokeStyle = 'rgba(120,110,150,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X, Yp); ctx.lineTo(X - sx / sl * r * 2, Yp + sy / sl * r * 2); ctx.stroke(); ctx.fillStyle = '#fff'; circle(ctx, X, Yp, r); ctx.fill(); }
    else if (p.k === 'leafp') { ctx.globalAlpha *= 1 - a; ctx.save(); ctx.translate(X, Yp); ctx.rotate(t * 0.1 + p.x); ctx.fillStyle = '#8fe07a'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.2, r * 0.6, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    else if (p.k === 'petal') { ctx.globalAlpha *= 1 - a; petalDraw(ctx, X, Yp, r * 2.2, t * 0.2 + p.x); }
    else if (p.k === 'rain') { const big = p.s > 0.15; ctx.strokeStyle = big ? 'rgba(190,225,255,.95)' : 'rgba(160,200,255,.85)'; ctx.lineWidth = big ? 3 : 1.5; ctx.beginPath(); ctx.moveTo(X, Yp); ctx.lineTo(X, Yp + Math.min(big ? 26 : 10, (big ? 1.6 : 0.6) * s)); ctx.stroke(); }
    else if (p.k === 'streak') { ctx.globalAlpha *= 1 - a; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X - r * 3, Yp); ctx.lineTo(X + r * 3, Yp); ctx.stroke(); }
    ctx.globalAlpha = 1; return;
  }
  if (d.t === 6) { drawHazard(ctx, ob, X, Y, s, t, sim); ctx.globalAlpha = 1; return; }
  if (d.t === 7) {
    ctx.globalAlpha = fa * clamp01((d.z - 2.5) / 3);
    if (d.j === 0) { const w = 2.2 * s; ctx.drawImage(SPR.haz.bump, X - w / 2, Y - 1.5 * s, w, 1.6 * s); }
    else if (d.j === 1) { const last = BOUNCED.get(ob), q = last != null ? clamp01((fxT - last) / 18) : 1, sq = 1 - 0.25 * (1 - q) * Math.sin(q * PI + PI / 2), w = 7.2 * s * (2 - sq), h = 3.4 * s * sq; ctx.globalAlpha *= 0.9; ctx.drawImage(SPR.haz.bcloud, X - w / 2, Y - h * 0.75, w, h); }
    else { const w = 0.8 * s; ctx.drawImage(SPR.haz.rail, X - w / 2, Y - 1.5 * s, w, 1.6 * s); }
    ctx.globalAlpha = 1;
  }
}
function petalDraw(ctx, X, Y, L, a) {   /* a single white daisy petal with a yellow base (never in pairs) */
  ctx.save(); ctx.translate(X, Y); ctx.rotate(a);
  ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.55 + 1, L * 0.2 + 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, L * 0.55, L * 0.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#ffd93b'; ctx.beginPath(); ctx.ellipse(-L * 0.42, 0, L * 0.14, L * 0.13, 0, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawItem(ctx, it, X, Y, s, t, sim) {
  if (it.k === 'lob') { const z = it.z * s; shadow(ctx, X, Y, 0.4, s, 0.22); const w = 1.0 * s * (1 + 0.12 * Math.sin(it.age * 0.6)), h = 1.0 * s * (1 - 0.1 * Math.sin(it.age * 0.6)); ctx.drawImage(SPR.lob, X - w / 2, Y - z - h * 0.6, w, h); for (let j = 1; j <= 3; j++) { ctx.fillStyle = '#9b4fd0'; circle(ctx, X - Math.cos(it.age * 0.3) * j * 0.25 * s, Y - z + j * 0.18 * s, Math.max(1, 0.12 * s * (1 - j * 0.2))); ctx.fill(); } return; }
  if (it.k === 'blue') {   /* bounces: squash and stretch on each hop, a juice trail */
    const z = it.z * s, ph = Math.abs(Math.sin(it.age * PI / 15)), sx = 1 + 0.18 * (1 - ph), sy = 1 - 0.15 * (1 - ph), w = 1.3 * s * sx, h = 1.3 * s * sy;
    shadow(ctx, X, Y, 0.5, s, 0.25);
    for (let j = 1; j <= 3; j++) { ctx.fillStyle = '#5f7fe8'; circle(ctx, X, Y - z + j * 0.25 * s, Math.max(1, 0.1 * s)); ctx.fill(); }
    ctx.drawImage(SPR.blue, X - w / 2, Y - z - h * 0.9, w, h); return;
  }
  if (it.k === 'puff') {
    const z = it.z * s, w = 2.0 * s, h = 2.7 * s, sway = Math.sin(t * 0.07 + it.id) * 0.1;
    ctx.save(); ctx.translate(X, Y - z); ctx.rotate(sway); ctx.drawImage(SPR.puff, -w / 2, -h * 0.4, w, h); ctx.restore();
    if ((t + it.id) % 9 === 0) part('fluff', it.x, it.y, it.z, (hash(t, it.id) - 0.5) * 2, (hash(it.id, t) - 0.5) * 2, -0.5, 60, '#fff', 0.14);
    return;
  }
  if (it.k === 'wave') {   /* floating thyme leaves and lilac twinkles above the ribbon */
    const T = sim.track, hw = T.hw;
    for (let j = 0; j < 9; j++) { const l = -hw + j * hw / 4, p = T.pos(it.s - 0.6, l, PQ2); pj(p.x, p.y, 0.7 + 0.4 * Math.sin(t * 0.2 + j), PQ); if (PQ.z < 1) continue; const r = Math.min(9, 0.35 * PJ.f * PJ.S / PQ.z); if (j & 1) twinkle(ctx, PQ.X, PQ.Y, r, t * 0.15 + j, '#e4d8ff'); else { ctx.fillStyle = '#8fbf6a'; ctx.beginPath(); ctx.ellipse(PQ.X, PQ.Y, r, r * 0.5, t * 0.1 + j, 0, TAU); ctx.fill(); } }
    return;
  }
  if (it.k === 'petal') { petalDraw(ctx, X, Y - it.z * s, 0.9 * s, Math.atan2(it.vy, it.vx) + t * 0.3); }
}
function drawHazard(ctx, q, X, Y, s, t, sim) {
  const H = q.H, Z = SPR.haz;
  if (H.skin === 'sprinkler') {   /* the head pops up in its tell and sprays while active */
    const up = q.ph >= 1, w = 1.6 * s, img = up ? Z.sprUp : Z.sprDown, dribble = q.ph === 1 ? Math.sin(t * 0.8) * 0.06 * s : 0;
    ctx.drawImage(img, X - w / 2, Y - w + dribble, w, w);
    if (q.ph === 2) {   /* water jets arcing from the head out over its stretch of road */
      const T = sim.track, C = H.on >= 0 ? T.cuts[H.on] : null, hx = X, hy = Y - 0.95 * s;
      for (let k2 = 0; k2 < 4; k2++) {
        const lat = H.l0 + (H.l1 - H.l0) * (0.15 + 0.25 * k2 + 0.06 * Math.sin(t * 0.3 + k2)), al = H.a + (k2 - 1.5) * H.half * 0.4, p = C ? C.pos(al, lat, PQ2) : T.pos(al, lat, PQ2);
        pj(p.x, p.y, 0, PQ); if (PQ.z < 0.8) continue;
        const mx = (hx + PQ.X) / 2, my = Math.min(hy, PQ.Y) - (1.6 + 0.4 * k2) * s;
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(2, 0.22 * s); ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(mx, my, PQ.X, PQ.Y); ctx.stroke();
        ctx.strokeStyle = 'rgba(110,190,255,.9)'; ctx.lineWidth = Math.max(1, 0.11 * s); ctx.stroke();
        for (let j = 1; j < 4; j++) { const u = ((t * 0.05 + j / 4 + k2 * 0.13) % 1), bx = (1 - u) * (1 - u) * hx + 2 * u * (1 - u) * mx + u * u * PQ.X, by2 = (1 - u) * (1 - u) * hy + 2 * u * (1 - u) * my + u * u * PQ.Y; ctx.fillStyle = '#e8f6ff'; circle(ctx, bx, by2, Math.max(1.2, 0.1 * s)); ctx.fill(); }
      }
    }
    else if (q.ph === 1 && (t >> 3) & 1) { ctx.fillStyle = '#9fd8ff'; circle(ctx, X + 0.2 * s, Y - 1.2 * s, Math.max(1, 0.1 * s)); ctx.fill(); }
    return;
  }
  if (H.path === 'cross') { const r = H.r * 1.1 * s, img = H.skin === 'barrel' ? Z.barrel : Z.pumpkin; shadow(ctx, X, Y, H.r * 0.9, s, 0.3); ctx.save(); ctx.translate(X, Y - r); ctx.rotate(-q.rot * Math.sign(H.l1 - H.l0)); ctx.drawImage(img, -r, -r, r * 2, r * 2); ctx.restore(); return; }
  if (H.path === 'swing') {   /* a hanging basket swinging under its beam (the beam is scenery) */
    const yTop = Y - 5.0 * s, yb = Y - 1.2 * s; ctx.strokeStyle = PAL.ink; ctx.lineWidth = Math.max(1, 0.08 * s); const p0 = H.on >= 0 ? sim.track.cuts[H.on].pos(H.a, 0, PQ2) : sim.track.pos(H.a, 0, PQ2); pj(p0.x, p0.y, 5.0, PQ); ctx.beginPath(); ctx.moveTo(PQ.z > 0.5 ? PQ.X : X, PQ.z > 0.5 ? PQ.Y : yTop); ctx.lineTo(X, yb - 0.6 * s); ctx.stroke();
    shadow(ctx, X, Y, 0.8, s, 0.22); const w = 2.2 * s, h = 2.0 * s; ctx.drawImage(Z.basket, X - w / 2, yb - h * 0.6, w, h); return;
  }
  if (H.skin === 'rain') {   /* a lilac-grey cloud that darkens in its tell (no face, no lightning) */
    const w = 6 * s, h = 3.6 * s, img = Z.cloud[q.ph >= 1 ? 1 : 0]; ctx.globalAlpha *= q.ph === 0 ? 0.75 : 1; ctx.drawImage(img, X - w / 2, Y - 6.6 * s - h / 2, w, h); return;
  }
  if (H.skin === 'steam') {
    if (q.ph === 1) { ctx.fillStyle = 'rgba(255,255,255,.55)'; circle(ctx, X + Math.sin(t * 1.3) * 0.15 * s, Y - 0.3 * s, Math.min(24, 0.55 * s)); ctx.fill(); }
    else if (q.ph === 2) { const h = (H.lift || 3.5) * Math.min(1, q.fr * 4); for (let j = 0; j < 6; j++) { const f = j / 5, r = (0.7 + f * 0.9) * s * 0.9, wob = Math.sin(t * 0.4 + j) * 0.25 * s; ctx.fillStyle = 'rgba(255,255,255,' + (0.75 - f * 0.45).toFixed(2) + ')'; circle(ctx, X + wob, Y - (0.3 + f * h) * s, Math.min(70, r)); ctx.fill(); } }
    return;
  }
  if (H.k === 'piston') {   /* the bumper rises when active; its lamp blinks in the tell */
    const up = q.ph === 2 ? Math.min(1, q.fr * 6) : 0, shake = q.ph === 1 ? Math.sin(t * 1.7) * 0.05 * s : 0, w = 2.4 * s * (H.r / 1.2), h = 2.0 * s * (H.r / 1.2);
    ctx.drawImage(Z.piston[q.ph === 1 ? (t >> 3) & 1 : q.ph === 2 ? 1 : 0], X - w / 2 + shake, Y - h * (0.55 + 0.45 * up), w, h); return;
  }
}
function kartYaw(k) {
  let a = k.dir + k.vd;
  if (k.spin) { if (!(k._spN >= k.spin)) k._spN = k.spin; const e = 1 - k.spin / Math.max(k._spN, 1); a += TAU * (k._spN > 40 ? 2 : 1) * (1 - (1 - e) * (1 - e)); } else k._spN = 0;   /* a short petal spin turns once */
  if (k.bonk) { const e = clamp01(1 - k.bonk / 48); a += PI * (1 - (1 - e) * (1 - e) * (1 - e)); }
  if (k.twirl) a += TAU * (1 - k.twirl / 24);
  if (k.wob) a += 0.2 * Math.sin(TAU * 3 * k.wob / 60) * Math.min(1, k.wob / 12);
  return a;
}
function drawKart(ctx, d, sim, ki, t, camDir, o) {
  const k = d.o, V = VIEWS[o.slot || 0], X = d.X, Y = d.Y, own = k.i === ki && !o.cached;
  let sc = k.scale || 1; if (own && sc > 1) sc = 1 + (sc - 1) * 0.5 / 0.7;   /* your own giant kart draws at 1.5x */
  const s = d.s * sc, z = k.z;
  shadow(ctx, X, Y, k.fall ? 0.9 * Math.max(0, 1 + k.z / 4) : 0.95, s, k.fall ? 0.15 : 0.3);
  const zd = V.dist * (V.cam.zoom || 1), bear = Math.atan2(k.y - (V.cam.fy - Math.sin(camDir) * zd), k.x - (V.cam.fx - Math.cos(camDir) * zd));
  const rel = wrapA(kartYaw(k) - bear), Yk = Y - z * d.s;
  const blink = k.giant > 0 && k.giant < 60 && (t >> 2) & 1;
  if (k.gro > 0) {   /* GIANT: a soft green glow and two big sprout leaves unfurling behind the driver */
    const g = k.gro / 20, lz = own ? 0.62 : 1; ctx.fillStyle = 'rgba(143,224,122,' + ((own ? 0.12 : 0.25) * g).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(X, Yk - 0.6 * s, 1.6 * s, 0.9 * s, 0, 0, TAU); ctx.fill();
    if (!blink) { leaf(ctx, X, Yk - 2.0 * s, -PI / 2 - 0.75 * g, 1.6 * s * g * lz, LEAF, Math.max(1, 0.06 * s)); leaf(ctx, X, Yk - 2.0 * s, -PI / 2 + 0.75 * g, 1.5 * s * g * lz, LEAF, Math.max(1, 0.06 * s)); }
  }
  if (!blink) {
    if (own) paintRacer(ctx, k.who, -rel, X, Yk, s);
    else { const fr = ((Math.round(-rel / TAU * KANG) % KANG) + KANG) % KANG, img = KART[k.who][fr]; ctx.drawImage(img, X - KSW / 2 * s, Yk - KAY * s, KSW * s, KSH * s); }
  }
  if (k.tiny > 0) { const sp = Math.max(1, 0.04 * s); ctx.save(); ctx.translate(X + 0.5 * s, Yk - 2.3 * s); ctx.strokeStyle = PAL.ink; ctx.lineWidth = sp * 2; ctx.beginPath(); ctx.moveTo(0, 0.4 * s); ctx.lineTo(0, -0.3 * s); ctx.stroke(); ctx.fillStyle = '#8fbf6a'; for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.ellipse((j & 1 ? 0.12 : -0.12) * s, (0.25 - j * 0.22) * s, 0.12 * s, 0.06 * s, 0, 0, TAU); ctx.fill(); } ctx.restore(); twinkle(ctx, X - 0.5 * s, Yk - 2.6 * s - Math.sin(t * 0.2) * 0.2 * s, 0.25 * s, t * 0.1, '#d8c4ff'); }
  if (k.draft >= 20) { ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, 0.06 * s); for (let j = 0; j < 3; j++) { const ph = (t * 0.2 + j * 2.1) % TAU; ctx.beginPath(); ctx.arc(X, Yk - 1.0 * s, (1.5 + 0.2 * j) * s, PI + 0.2 + ph * 0.1, PI + 0.9 + ph * 0.1); ctx.stroke(); ctx.beginPath(); ctx.arc(X, Yk - 1.0 * s, (1.5 + 0.2 * j) * s, -0.9 - ph * 0.1, -0.2 - ph * 0.1); ctx.stroke(); } }
  if (k.shield) { const r = 1.45 * s, cyy = Yk - 1.0 * s, fl = k.shield < 120 && (t >> 2) & 1; if (!fl) { ctx.fillStyle = 'rgba(170,225,255,.28)'; circle(ctx, X, cyy, r); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, 0.06 * s); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(X - r * 0.45, cyy - r * 0.5, r * 0.25, r * 0.12, -0.6, 0, TAU); ctx.fill(); } }
  if (k.lift) ctx.drawImage(SPR.balloon, X - 0.9 * s, Yk - 4.5 * s, 1.8 * s, 3.6 * s);
  if ((k.spin || k.bonk) && (t >> 2) & 1) twinkle(ctx, X + Math.cos(t * 0.3) * s, Yk - 2.0 * s, 0.25 * s, t * 0.2, '#fff');
  /* DAISY SWIRL: the petals that orbit the kart */
  if (k.swirl && k.petals) {
    const pts = SK.Sim && SK.Sim.petals ? SK.Sim.petals(k, PET) : [];
    for (let j = 0; j < pts.length; j++) { const p = pts[j]; if (!p.alive) continue; pj(p.x, p.y, p.z, PQ); if (PQ.z < 0.8) continue; const L2 = Math.min(40, 0.9 * PJ.f * PJ.S / PQ.z); pj(p.x + Math.cos(p.a + PI / 2) * 0.4, p.y + Math.sin(p.a + PI / 2) * 0.4, p.z, PQ2); const ang = Math.atan2(PQ2.Y - PQ.Y, PQ2.X - PQ.X); petalDraw(ctx, PQ.X, PQ.Y, L2, ang); }
  }
  /* your own drift charge: three pips just above the kart (review P10) */
  if (own && k.drift && !o.podium) {
    const cols = ['#8fe07a', '#ffb24a', '#ffd93b'], py = Yk - 2.6 * d.s * Math.min(1.3, sc);
    for (let j = 0; j < 3; j++) { const px = X + (j - 1) * 13; ctx.fillStyle = PAL.ink; circle(ctx, px, py, 6); ctx.fill(); ctx.fillStyle = k.mt > j ? cols[j] : 'rgba(255,255,255,.35)'; circle(ctx, px, py, 4.4); ctx.fill(); }
  }
}

/* =====================================================================================================================
   HUD
   ===================================================================================================================== */
const ORD = ['', 'st', 'nd', 'rd', 'th', 'th', 'th'];
const PCOL = ['#fff', '#ffd93b', '#e9e3ff', '#ffb27a', '#ffffff', '#ffffff', '#ffffff'];
function fmtTime(ticks) { const cs = Math.floor(ticks * 100 / 60), m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = cs % 100; return m + ':' + (s < 10 ? '0' : '') + s + '.' + (c < 10 ? '0' : '') + c; }
/* changing numbers from a cached glyph strip per size and colour (no new canvas per frame: review E6) */
const GLY = new Map();
function glyphs(size, fill) {
  const key = size + '|' + fill; let G = GLY.get(key); if (G) return G;
  G = { w: 0, c: {} }; mctx.font = font(size); for (const ch of '0123456789') G.w = Math.max(G.w, mctx.measureText(ch).width);
  for (const ch of '0123456789:.~/x') G.c[ch] = txtCanvas(ch, size, fill);
  if (GLY.size > 24) GLY.clear(); GLY.set(key, G); return G;
}
function numText(ctx, s, x, y, size, fill, align) {
  size = Math.round(Math.max(6, Math.min(110, size)) * 2) / 2; const G = glyphs(size, fill), adv = ch => /\d/.test(ch) ? G.w : G.c[ch] ? G.c[ch].tw : G.w * 0.5;
  let W = 0; for (const ch of s) W += adv(ch);
  let x0 = align === 'right' ? x - W : align === 'left' ? x : x - W / 2;
  for (const ch of s) { const c = G.c[ch]; if (c) { const p = (c.lw - c.tw) / 2, a = adv(ch); ctx.drawImage(c, x0 + (a - c.tw) / 2 - p, y - c.lh / 2, c.lw, c.lh); } x0 += adv(ch); }
  return W;
}
function minimap(ctx, sim, x, y, size, me) {
  const T = sim.track;
  if (!TR || TR.T !== T) prepTrack(T);
  if (!TR.mm || TR.mm.sz !== size) {
    const c = sprite(size, size, g => {
      const sc = size / 256, path = () => { g.beginPath(); for (let i = 0; i <= T.N; i += 3) { const j = i % T.N; g.lineTo(T.X[j] * sc, T.Y[j] * sc); } g.closePath(); };
      path(); g.strokeStyle = PAL.ink; g.lineWidth = 7; g.stroke(); g.strokeStyle = '#fff6e0'; g.lineWidth = 3.6; g.stroke();
      for (const C of T.cuts) { g.beginPath(); for (let i = 0; i < C.n; i += 3) g.lineTo(C.X[i] * sc, C.Y[i] * sc); g.lineTo(C.X[C.n - 1] * sc, C.Y[C.n - 1] * sc); g.setLineDash([3, 3]); g.strokeStyle = PAL.ink; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = '#b6f07a'; g.lineWidth = 1.8; g.stroke(); g.setLineDash([]); }
      const p = T.pos(0, 0); g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo((p.x - T.TY[0] * 6) * sc, (p.y + T.TX[0] * 6) * sc); g.lineTo((p.x + T.TY[0] * 6) * sc, (p.y - T.TX[0] * 6) * sc); g.stroke();
    });
    c.sz = size; TR.mm = c;
  }
  ctx.drawImage(TR.mm, x, y, size, size);
  const sc = size / 256;
  for (const it of sim.items) {
    if (it.k === 'blue' || it.k === 'puff') { ctx.fillStyle = PAL.ink; circle(ctx, x + it.x * sc, y + it.y * sc, 3.2); ctx.fill(); ctx.fillStyle = it.k === 'blue' ? '#6f8ff0' : '#ffffff'; circle(ctx, x + it.x * sc, y + it.y * sc, 2.2); ctx.fill(); }
    else if (it.k === 'wave') { const p = T.pos(it.s, 0, PQ2), tx = T.TX[Math.floor(it.s / T.ds) % T.N], ty = T.TY[Math.floor(it.s / T.ds) % T.N]; ctx.strokeStyle = '#b9a2ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + (p.x - ty * 8) * sc, y + (p.y + tx * 8) * sc); ctx.lineTo(x + (p.x + ty * 8) * sc, y + (p.y - tx * 8) * sc); ctx.stroke(); }
  }
  for (let pass = 0; pass < 2; pass++) for (const k of sim.karts) {
    const mine = me.indexOf(k.i) >= 0; if ((pass === 1) !== mine) continue;
    const r = (mine ? 4.6 : 3.4) * (k.giant > 0 ? 1.5 : k.tiny > 0 ? 0.75 : 1); ctx.fillStyle = PAL.ink; circle(ctx, x + k.x * sc, y + k.y * sc, r + 1.6); ctx.fill(); ctx.fillStyle = SK.RACERS[k.who].col; circle(ctx, x + k.x * sc, y + k.y * sc, r); ctx.fill();
  }
}
const HUDST = [{ item: -1, t0: 0, gmax: 1, tmax: 1 }, { item: -1, t0: 0, gmax: 1, tmax: 1 }, { item: -1, t0: 0, gmax: 1, tmax: 1 }];
function backPill(ctx, x, y, w, h) { ctx.fillStyle = 'rgba(43,33,64,.42)'; ctx.beginPath(); rrect(ctx, x, y, w, h, h / 2); ctx.fill(); }
function drawHUD(ctx, rect, sim, ki, t, o) {
  o = o || {};
  const k = sim.karts[ki], T = sim.track, u = clamp(rect.h / 400, 0.75, 1.25), pad = 10 * u, st = HUDST[o.slot != null ? o.slot : (o.itemX ? 1 : 0)] || HUDST[0];
  /* item slot */
  const bx = rect.x + pad + (o.itemX || 0), by = rect.y + pad, bs = 58 * u;
  ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, bx - 3, by - 3 + 2, bs + 6, bs + 6, 14 * u); ctx.fill();
  ctx.fillStyle = 'rgba(74,58,107,.85)'; ctx.beginPath(); rrect(ctx, bx, by, bs, bs, 12 * u); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.beginPath(); rrect(ctx, bx + 4, by + 4, bs - 8, bs - 8, 9 * u); ctx.stroke();
  let ik = k.roll ? SK.ITEMS[1 + ((t >> 2) % 10)] : SK.ITEMS[k.item];
  if (!k.roll && ik === 'boost3') ik = 'boost3_' + Math.max(1, Math.min(3, k.itemN | 0));
  const ic = ik && SPR.icons ? SPR.icons[ik] : null;
  if (ic) { const z = bs * 0.82; ctx.globalAlpha = k.roll ? 0.85 : 1; ctx.drawImage(ic, bx + (bs - z) / 2, by + (bs - z) / 2, z, z); ctx.globalAlpha = 1; }
  if (!k.roll && k.item === 4 && k.itemN > 0) { ctx.fillStyle = PAL.ink; circle(ctx, bx + bs - 6 * u, by + bs - 6 * u, 10 * u); ctx.fill(); numText(ctx, String(k.itemN), bx + bs - 6 * u, by + bs - 6 * u, 13 * u, '#fff'); }
  if (k.swirl && k.petals) { for (let j = 0; j < 5; j++) { const a = -PI / 2 + j * TAU / 5, px = bx + bs / 2 + Math.cos(a) * bs * 0.56, py = by + bs / 2 + Math.sin(a) * bs * 0.56; ctx.fillStyle = PAL.ink; circle(ctx, px, py, 4.5 * u); ctx.fill(); ctx.fillStyle = (k.petals >> j) & 1 ? '#fff' : 'rgba(255,255,255,.25)'; circle(ctx, px, py, 3.2 * u); ctx.fill(); } }
  /* a timer ring round the slot: GIANT green, TINY lilac */
  if (k.giant > 0) st.gmax = Math.max(st.gmax, k.giant); else st.gmax = 1;
  if (k.tiny > 0) st.tmax = Math.max(st.tmax, k.tiny); else st.tmax = 1;
  for (const [v, mx, col] of [[k.giant, st.gmax, '#8fe07a'], [k.tiny, st.tmax, '#c8b4ff']]) if (v > 0) { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 7 * u; ctx.beginPath(); ctx.arc(bx + bs / 2, by + bs / 2, bs * 0.62, -PI / 2, -PI / 2 + TAU * v / mx); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 4 * u; ctx.stroke(); }
  if (o.itemKey && (k.item || k.roll)) text(ctx, o.itemKey, bx + bs / 2, by + bs + 12 * u, 10 * u, '#fff');
  /* LUCKY: a gold flash round the slot and a small label under it (fix round 1: it was a banner on half the rolls) */
  const la = fxT - (LUCK[k.i] ? LUCK[k.i].t : -999);
  if (la >= 0 && la < 80) { const L2 = LUCK[k.i], q = 1 - la / 80; ctx.globalAlpha = Math.min(1, q * 2); ctx.strokeStyle = '#ffd93b'; ctx.lineWidth = (3 + 3 * Math.abs(Math.sin(la * 0.25))) * u; ctx.beginPath(); rrect(ctx, bx - 5, by - 5, bs + 10, bs + 10, 15 * u); ctx.stroke(); for (let j = 0; j < 4; j++) { const an = la * 0.08 + j * PI / 2; twinkle(ctx, bx + bs / 2 + Math.cos(an) * bs * 0.62, by + bs / 2 + Math.sin(an) * bs * 0.62, 5 * u, la * 0.2, '#fff6b0'); } text(ctx, L2.a === 2 ? 'SUPER LUCKY!' : 'LUCKY!', bx + bs / 2, by + bs + (o.itemKey ? 26 : 13) * u, 12 * u, '#8fe07a'); ctx.globalAlpha = 1; }
  /* lap and time on soft pills (split screen: review A18) */
  const rx = rect.x + rect.w - pad, lap = Math.max(1, k.lap);
  backPill(ctx, rx - 112 * u, by - 2 * u, 116 * u, 54 * u);
  text(ctx, 'LAP', rx - 62 * u, by + 14 * u, 14 * u, '#e9e3ff', 'right');
  numText(ctx, lap + '/' + T.laps, rx, by + 14 * u, 26 * u, lap === T.laps ? '#ffb27a' : '#fff', 'right');
  numText(ctx, fmtTime(k.finished ? k.finishT : sim.clock), rx, by + 40 * u, 17 * u, PAL.sun, 'right');
  /* the threat strip: what is coming for you; the item's name and hint give way to it (fix round 1: they printed over each
     other). A landscape phone's pause button sits left of the LAP pill (o.pauseGap) */
  const sx1 = rx - 118 * u - (o.pauseGap ? o.pauseGap * u : 0), TH = threats(ctx, rect, sim, k, t, u, bx + bs + 14 * u, sx1, by);
  /* the item's name for 1.5 s after the roulette, then its hint (from MAIN) for 3 s, or why it can't go yet (o.itemWhy) */
  const curItem = k.roll ? -2 : k.item;
  if (curItem !== st.item) { st.item = curItem; st.t0 = t; }
  if (k.item && !k.roll && !TH.n) {
    const age = t - st.t0, nx = bx + bs + 12 * u, mw = sx1 - nx;
    const fit = (s2, z, col) => { if (!s2 || mw < 60 * u) return; const w = tw(s2, z); text(ctx, s2, nx, by + 16 * u, w > mw ? Math.max(8, z * mw / w) : z, col, 'left'); };
    if (o.itemWhy) fit(o.itemWhy, 12 * u, '#e4d8ff');
    else if (age < 90) fit(SK.ITEM_NAMES[k.item] || '', 14 * u, PAL.sun);
    else if (age < 270 && o.itemHint) fit(o.itemHint, 12 * u, '#fff');
  }
  /* HOP! big, just above your kart, as the thyme ribbon closes in (the strip's word alone was too small, too late) */
  if (TH.hop && !k.finished) { const hy = rect.y + rect.h * (rect.h < rect.w * 0.45 ? 0.4 : 0.56), p = 1 + 0.12 * Math.sin(t * 0.5); ctx.save(); ctx.translate(rect.x + rect.w / 2, hy); ctx.scale(p, p); text(ctx, 'HOP!', 0, 0, 46 * u, '#e4d8ff'); ctx.restore(); if (SPR.icons.thyme) ctx.drawImage(SPR.icons.thyme, rect.x + rect.w / 2 - 92 * u, hy - 20 * u, 40 * u, 40 * u); }
  /* a wish puff over you peeks in at the top of the view while it hovers, then drops */
  if (TH.puff) { const it = TH.puff, f2 = it.ph === 2 ? Math.min(1, it.pt / 12) : 0, w = 64 * u, h = w * 1.33, px = rect.x + rect.w / 2 + Math.sin(t * 0.07) * 6 * u, py = rect.y + 58 * u + f2 * rect.h * 0.3 + Math.sin(t * 0.11) * 3 * u; ctx.save(); ctx.translate(px, py); ctx.rotate(Math.sin(t * 0.07) * 0.1); ctx.drawImage(SPR.puff, -w / 2, -h * 0.4, w, h); ctx.restore(); }
  /* place */
  if (sim.phase === 'race' || sim.clock) {
    const pl = k.place, pop = o.placeAge != null ? 1 + Math.max(0, 1 - o.placeAge / 12) * 0.3 : 1, py = rect.y + rect.h - (o.touchUp ? 150 : 40) * u, px = rect.x + rect.w - 44 * u;
    backPill(ctx, px - 52 * u, py - 30 * u, 92 * u, 56 * u);
    ctx.save(); ctx.translate(px - 18 * u, py); ctx.scale(pop, pop); text(ctx, String(pl), 0, 0, 62 * u, PCOL[pl] || '#fff'); ctx.restore();
    text(ctx, ORD[pl] || 'th', px + 6 * u, py - 12 * u, 20 * u, PCOL[pl] || '#fff', 'left');
  }
  if (o.map) { const ms = o.mapSize || (o.touchUp ? 90 : 112) * u, my = o.touchUp ? by + bs + 26 * u : rect.y + rect.h - ms - pad; ctx.fillStyle = 'rgba(43,33,64,.35)'; ctx.beginPath(); rrect(ctx, rect.x + pad - 4, my - 4, ms + 8, ms + 8, 12); ctx.fill(); minimap(ctx, sim, rect.x + pad, my, ms, o.me || [ki]); }
  /* banners (one at a time; MAIN sets them) */
  const B = o.banner;
  /* high in the view and smaller, so the road ahead stays clear (fix round 1: at 0.52 they covered the next hazard) */
  if (B && B.age < (B.life || 110) && !k.finished && !TH.hop) {
    const a = B.age, sc = a < 8 ? 0.5 + 0.7 * easeOut(a / 8) : 1.2 - 0.2 * Math.min(1, (a - 8) / 10), al = a > (B.life || 110) - 20 ? ((B.life || 110) - a) / 20 : 1;
    let size = (B.size || 40) * u * 0.8; const wmax = rect.w - 40, wt = tw(B.text, size); if (wt > wmax) size *= wmax / wt;
    const yb = rect.y + rect.h * (sim.clock < 50 ? 0.46 : 0.27) + (TH.puff ? 40 * u : 0);
    ctx.globalAlpha = clamp01(al); ctx.save(); ctx.translate(rect.x + rect.w / 2, yb); ctx.scale(sc, sc); text(ctx, B.text, 0, 0, size, B.col || '#fff'); if (B.sub) text(ctx, B.sub, 0, 24 * u, 13 * u, PAL.sun); ctx.restore(); ctx.globalAlpha = 1;
  }
  if (k.wrong && !k.finished && (t >> 4) & 1) text(ctx, 'WRONG WAY!', rect.x + rect.w / 2, rect.y + rect.h * 0.42, 30 * u, '#ff9a8a');
  if (sim.phase === 'count') {
    const n = Math.ceil(sim.cd / 60), f = ((sim.cd - 1) % 60) / 60;   /* the pop starts on the number's first frame (review P9) */
    if (n >= 1 && n <= 3) { const sc = 1 + (f > 0.8 ? (f - 0.8) * 2.5 : 0); ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h * 0.34); ctx.scale(sc, sc); text(ctx, String(n), 0, 0, 84 * u, n === 1 ? PAL.sun : '#fff'); ctx.restore(); }
    if (o.hint) text(ctx, o.hint, rect.x + rect.w / 2, rect.y + rect.h * 0.52, 15 * u, '#fff');
  } else if (sim.clock < 50) { const a = sim.clock, sc = a < 8 ? 0.6 + 0.8 * easeOut(a / 8) : 1.4 - 0.2 * Math.min(1, (a - 8) / 10); ctx.globalAlpha = a > 34 ? (50 - a) / 16 : 1; ctx.save(); ctx.translate(rect.x + rect.w / 2, rect.y + rect.h * 0.3); ctx.scale(sc, sc); text(ctx, 'GO!', 0, 0, 64 * u, '#8fe07a'); ctx.restore(); ctx.globalAlpha = 1; }
  if (k.finished) {   /* the place shows from half a second after the line (online, a photo finish settles first: fix round 1) */
    ctx.fillStyle = 'rgba(43,33,64,.18)'; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); const bob = Math.sin(t * 0.08) * 3, early = sim.clock - k.finishT < 30;
    text(ctx, early ? 'FINISHED!' : 'FINISHED ' + k.place + (ORD[k.place] || 'th') + '!', rect.x + rect.w / 2, rect.y + rect.h * 0.3 + bob, 36 * u, !early && k.place === 1 ? PAL.sun : '#fff'); }
}
/* the threat strip (top centre): a blueberry or a wish puff coming for you, and the thyme ribbon's "HOP!" */
const THR = { n: 0, hop: false, puff: null }, THL = [];
function threats(ctx, rect, sim, k, t, u, x0, x1, y) {
  const list = THL; list.length = 0; THR.n = 0; THR.hop = false; THR.puff = null;
  const hopCue = SK.Sim && SK.Sim.hopCue;
  for (const it of sim.items) {
    if (it.k === 'blue' && it.tgt === k.i) { const d = Math.hypot(it.x - k.x, it.y - k.y); list.push(['blue', clamp01(1 - d / 80), d < 26 ? 'WATCH OUT!' : '']); }
    else if (it.k === 'puff' && it.tgt === k.i) { list.push(['puff', it.ph ? 1 : clamp01(1 - (k.rp - it.rp) / 200), it.ph ? 'LOOK UP!' : '']); if (it.ph) THR.puff = it; }
    else if (it.k === 'wave' && (it.mask >> k.i) & 1 && !((it.done >> k.i) & 1)) { const d = k.rp - it.rp, hop = hopCue ? hopCue(it, k) : d > 0 && d < 16; if (hop) THR.hop = true; list.push(['thyme', clamp01(1 - d / 120), hop ? 'HOP!' : '']); }
  }
  THR.n = list.length;
  if (!list.length) return THR;
  const w = Math.min(150 * u, (x1 - x0) / list.length - 8);
  if (w < 50) return THR;
  let x = (x0 + x1) / 2 - (list.length * (w + 8) - 8) / 2;
  for (const [kind, near, msg] of list) {
    const pulse = near > 0.67 && (t >> 3) & 1;
    ctx.fillStyle = 'rgba(43,33,64,.6)'; ctx.beginPath(); rrect(ctx, x, y, w, 34 * u, 17 * u); ctx.fill();
    if (pulse) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    const ic = SPR.icons[kind]; if (ic) ctx.drawImage(ic, x + 2 * u, y + 1 * u, 32 * u, 32 * u);
    const bw = w - 44 * u; ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); rrect(ctx, x + 38 * u, y + 22 * u, bw, 6 * u, 3 * u); ctx.fill();
    ctx.fillStyle = kind === 'thyme' ? '#c8b4ff' : kind === 'puff' ? '#ffffff' : '#7f9fff'; ctx.beginPath(); rrect(ctx, x + 38 * u, y + 22 * u, Math.max(6 * u, bw * near), 6 * u, 3 * u); ctx.fill();
    if (msg) { const mz = Math.min(13 * u, 13 * u * bw / Math.max(1, tw(msg, 13 * u))); text(ctx, msg, x + 38 * u + bw / 2, y + 11 * u, mz, msg === 'HOP!' ? '#e4d8ff' : PAL.sun); }
    x += w + 8;
  }
  return THR;
}

/* =====================================================================================================================
   SCREENS (drawn in a 400-high block; on an upright phone the block is centred over the full page height and the dim covers
   all of it: review A4)
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
function padlock(ctx, x, y, s) { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3.2 * s; ctx.beginPath(); ctx.arc(x, y - 3 * s, 3.6 * s, PI, TAU); ctx.stroke(); ctx.strokeStyle = '#e9e3ff'; ctx.lineWidth = 1.6 * s; ctx.stroke(); ctx.fillStyle = PAL.ink; rrect(ctx, x - 5.5 * s, y - 3.5 * s, 11 * s, 9 * s, 2 * s); ctx.fill(); ctx.fillStyle = '#ffd93b'; rrect(ctx, x - 4.3 * s, y - 2.3 * s, 8.6 * s, 6.6 * s, 1.5 * s); ctx.fill(); ctx.fillStyle = PAL.ink; circle(ctx, x, y + 0.6 * s, 1.2 * s); ctx.fill(); }
function sndIcon(ctx, x, y, music, on) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.7, 1.7);
  ctx.fillStyle = ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
  if (music) { ctx.beginPath(); ctx.ellipse(-1.4, 2.4, 1.7, 1.3, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(-0.1, -3.6, 1, 6); ctx.beginPath(); ctx.moveTo(0.4, -3.6); ctx.quadraticCurveTo(3.4, -2.4, 2.6, 0.2); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-3.4, -1.3); ctx.lineTo(-1.6, -1.3); ctx.lineTo(0.6, -3.4); ctx.lineTo(0.6, 3.4); ctx.lineTo(-1.6, 1.3); ctx.lineTo(-3.4, 1.3); ctx.closePath(); ctx.fill(); if (on) { ctx.beginPath(); ctx.arc(1, 0, 2.4, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(1, 0, 4.2, -0.8, 0.8); ctx.stroke(); } }
  if (!on) { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-3.4, 3.6); ctx.lineTo(3.6, -3.6); ctx.stroke(); ctx.strokeStyle = '#ffb27a'; ctx.lineWidth = 1.2; ctx.stroke(); }
  ctx.restore();
}
const UI = { snd: [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }], btn: [], diff: [], tracks: [], menu: [], back: null, touch: {} };
let UIY = 0;   /* the screens' vertical offset (an upright phone centres the 400-high block); hit rects include it */
function setR(r, x, y, w, h) { r.x = x; r.y = y + UIY; r.w = w; r.h = h; return r; }
function sndChip(ctx, r, x, right, key, music, on, touch) {
  const lbl = (music ? 'MUSIC ' : 'SOUND ') + (on ? 'ON' : 'OFF'), w = (touch ? 0 : 24) + 26 + tw(lbl, 13) + 12, x0 = right ? x - w : x, y0 = 8, h = 28;
  ctx.fillStyle = 'rgba(43,33,64,.55)'; ctx.beginPath(); rrect(ctx, x0, y0, w, h, 14); ctx.fill();
  let cx = x0 + 8;
  if (!touch) { ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, cx, y0 + 5, 18, 18, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.stroke(); text(ctx, key, cx + 9, y0 + 14, 11, PAL.sun); cx += 24; }
  sndIcon(ctx, cx + 8, y0 + 14, music, on); text(ctx, lbl, cx + 20, y0 + 14.5, 13, on ? '#fff' : '#d9d3f0', 'left');
  setR(r, x0 - 4, 0, w + 8, y0 + h + 8);
}
function head(ctx, who, x, y, px) { const c = HEADS[who]; if (c) ctx.drawImage(c, x - px / 2, y - px / 2, px, px); }
function logo(ctx, cx, y, t, s) {
  const word = (w, yy, cols, d, x0) => { let x = x0; for (let i = 0; i < w.length; i++) { const by = yy + Math.sin(t * 0.08 + i * 0.8 + d) * 3; ctx.save(); ctx.translate(x, by); ctx.rotate(Math.sin(t * 0.05 + i + d) * 0.05); text(ctx, w[i], 0, 0, 62 * s, cols[i & 1]); ctx.restore(); x += 46 * s; } };
  word('SPROUT', y, ['#8fe07a', '#c9f7a0'], 0, cx - 46 * s * 4.3);
  word('KART', y, ['#ffb24a', '#ffd93b'], 2, cx + 46 * s * 2.2);
  leaf(ctx, cx - 46 * s * 4.3 - 2, y - 30 * s + Math.sin(t * 0.08) * 3, -PI / 2 - 0.5 + Math.sin(t * 0.06) * 0.1, 18 * s, LEAF, 2.4);
  leaf(ctx, cx - 46 * s * 4.3 - 2, y - 30 * s + Math.sin(t * 0.08) * 3, -PI / 2 + 0.5 + Math.sin(t * 0.06) * 0.1, 15 * s, LEAF, 2.4);
}
/* dim the whole page, then (on an upright phone) centre the 400-high block */
function frame(ctx, S, dim, fn) {
  const H = S.H || 400, oy = S.pad ? Math.max(0, (H - 400) / 2) : 0;
  if (dim) { if (typeof dim === 'string') { ctx.fillStyle = dim; ctx.fillRect(0, 0, S.W, H); } else dim(H); }
  UIY = oy; ctx.save(); ctx.translate(0, oy); try { fn(Object.assign({}, S, { H: 400 })); } finally { ctx.restore(); UIY = 0; }
}
const CLSCOL = ['#8fe07a', '#ffd93b', '#ff8a8a', '#c89aff'];
const SCREENS = {
  title(ctx, S0) {
    frame(ctx, S0, H => { const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, S0.pad ? 'rgba(43,33,64,.25)' : 'rgba(255,246,224,.15)'); gr.addColorStop(1, S0.pad ? 'rgba(43,33,64,.55)' : 'rgba(43,33,64,.35)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, S0.W, H); }, S => {
      const W = S.W, H = S.H, t = S.t | 0, cx = W / 2, touch = !!S.touch;
      logo(ctx, cx, 70, t, 1);
      sndChip(ctx, UI.snd[0], 8, 0, 'M', 0, S.sound !== false, touch); const ga = ctx.globalAlpha; if (S.sound === false) ctx.globalAlpha = 0.6; sndChip(ctx, UI.snd[1], W - 8, 1, 'N', 1, S.music !== false, touch); ctx.globalAlpha = ga;
      text(ctx, 'Race your sprout kart round the garden!', cx, 116, 15, '#fff');
      if (S.online) { card(ctx, cx - 190, 150, 380, 120); text(ctx, S.onlineText || 'Waiting for your friend…', cx, 196, 20, PAL.sun); if (S.onlineSub) text(ctx, S.onlineSub, cx, 230, 14, '#fff'); UI.btn.length = 0; UI.diff.length = 0; return; }
      const bw = 172, bh = 40, gx = 16, x0 = cx - bw - gx / 2 + 40, rows = [['1 PLAYER', '#5cc85a'], ['2 PLAYERS', '#ff9a45']], sel = S.sel | 0;
      card(ctx, cx - 250, 134, 500, 200, 'rgba(74,58,107,.88)');
      UI.btn.length = 0;
      rows.forEach((r, ri) => {
        const y = 148 + ri * 52;
        text(ctx, r[0], cx - 238, y + bh / 2, 15, ri ? '#ffb27a' : '#b6f07a', 'left');
        ['GRAND PRIX', 'SINGLE RACE'].forEach((lb, bi) => { const x = x0 + bi * (bw + gx), id = ri * 2 + bi, on = sel === id; pill(ctx, x, y, bw, bh, on ? (ri ? '#ff9a45' : '#5cc85a') : 'rgba(255,255,255,.18)', on); text(ctx, lb, x + bw / 2, y + bh / 2 + 1, 17, '#fff'); UI.btn.push(setR({}, x - 4, y - 4, bw + 8, bh + 8)); });
      });
      /* the classes: EASY MEDIUM HARD, and WILD padlocked until a HARD Grand Prix ends in the top 3 */
      const dy = 254, names = S.diffs || ['EASY', 'MEDIUM', 'HARD'], n = names.length, pw = n > 3 ? 80 : 108, gap = n > 3 ? 8 : 12;
      text(ctx, 'CLASS', cx - 238, dy + 15, 15, '#e9e3ff', 'left'); UI.diff.length = 0;
      names.forEach((d, i) => {
        const x = x0 + 10 + i * (pw + gap), on = (S.diff | 0) === i, locked = i === 3 && !S.wild;
        pill(ctx, x, dy, pw, 30, on ? CLSCOL[i] : locked ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.14)', sel === 4 && on);
        text(ctx, d, x + pw / 2 + (locked ? 7 : 0), dy + 15.5, 14, on ? '#fff' : locked ? '#a89cc8' : '#d9d3f0'); if (locked) padlock(ctx, x + 14, dy + 16, 0.95);
        UI.diff.push(setR({}, x - 3, dy - 3, pw + 6, 36));
      });
      /* BEST inside the card (review A14) */
      const best = S.best || {}, tr = S.tracks || []; let bx = cx - 238; text(ctx, 'BEST', bx, 312, 13, PAL.sun, 'left'); bx += 46;
      tr.forEach(T => { const v = best[T.id]; const s = T.short + ' ' + (v ? fmtTime(v) : '–'); text(ctx, s, bx, 312, 12.5, '#fff', 'left'); bx += tw(s, 12.5) + 18; });
      if (S.note && S.note.text) { const a = S.note.age | 0; ctx.globalAlpha = a > 150 ? (180 - a) / 30 : 1; ctx.fillStyle = 'rgba(43,33,64,.85)'; const w = tw(S.note.text, 14) + 30; ctx.beginPath(); rrect(ctx, cx - w / 2, 340, w, 26, 13); ctx.fill(); text(ctx, S.note.text, cx, 353, 14, PAL.sun); ctx.globalAlpha = 1; }
      else if (touch) text(ctx, 'Tap a button to race', cx, H - 26, 14, '#fff');
      else {
        if (sel === 2 || sel === 3) { text(ctx, 'SPRIG: W A S D · SPACE drift · E item', cx, H - 46, 12.5, '#b6f07a'); text(ctx, 'MARIGOLD: arrows · RIGHT SHIFT or / drift · ENTER item', cx, H - 22, 12.5, '#ffb27a'); }
        else { text(ctx, 'Steer: arrows or W A S D · drift SPACE · item SHIFT', cx, H - 46, 12.5, '#e9ffe0'); text(ctx, '↑ ↓ ← → choose   SPACE / ENTER race   M sound   N music', cx, H - 22, 12.5, '#fff'); }
      }
    });
  },
  tracks(ctx, S0) {
    frame(ctx, S0, 'rgba(43,33,64,.45)', S => {
      const W = S.W, H = S.H, cx = W / 2, sel = S.sel | 0, list = S.tracks || [];
      text(ctx, S.two ? 'PICK A TRACK (2 PLAYERS)' : 'PICK A TRACK', cx, 40, 30, PAL.sun);
      UI.tracks.length = 0;
      const cw = Math.min(190, (W - 60) / 3), gap = 14, x0 = cx - (cw * 3 + gap * 2) / 2;
      list.forEach((T, i) => {
        const on = i === sel, x = x0 + i * (cw + gap), y = 72 + (on ? -6 : 0), h = 252;
        card(ctx, x, y, cw, h, on ? 'rgba(92,72,135,.97)' : 'rgba(74,58,107,.85)');
        if (on) { ctx.strokeStyle = PAL.sun; ctx.lineWidth = 3; ctx.beginPath(); rrect(ctx, x - 6, y - 6, cw + 12, h + 12, 22); ctx.stroke(); }
        const ms = Math.min(cw - 40, 150); ctx.save(); ctx.translate(x + (cw - ms) / 2, y + 14);
        ctx.strokeStyle = PAL.ink; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.beginPath(); for (let j = 0; j <= T.N; j += 4) { const q = j % T.N; ctx.lineTo(T.X[q] / 256 * ms, T.Y[q] / 256 * ms); } ctx.closePath(); ctx.stroke(); ctx.strokeStyle = ['#e8cc9c', '#d6c8ff', '#a3abc8'][i % 3]; ctx.lineWidth = 4.5; ctx.stroke();
        for (const C of T.cuts || []) { ctx.beginPath(); for (let j = 0; j < C.n; j += 3) ctx.lineTo(C.X[j] / 256 * ms, C.Y[j] / 256 * ms); ctx.setLineDash([3, 3]); ctx.strokeStyle = '#b6f07a'; ctx.lineWidth = 2.4; ctx.stroke(); ctx.setLineDash([]); }
        ctx.restore();
        text(ctx, T.name.split(' ')[0], x + cw / 2, y + ms + 34, 17, '#fff'); text(ctx, T.name.split(' ').slice(1).join(' '), x + cw / 2, y + ms + 56, 17, '#fff');
        const b = (S.best || {})[T.id]; text(ctx, b ? 'BEST ' + fmtTime(b) : 'no best time yet', x + cw / 2, y + h - 20, 12.5, b ? PAL.sun : '#d9d3f0');
        UI.tracks.push(setR({}, x, y, cw, h));
      });
      /* a real BACK pill (review A3) */
      const bw = 110, by = H - 46; pill(ctx, 16, by, bw, 32, 'rgba(255,255,255,.2)', false); text(ctx, '◀ BACK', 16 + bw / 2, by + 16.5, 15, '#fff'); UI.back = setR(UI.back || {}, 10, by - 6, bw + 12, 44);
      text(ctx, S.touch ? 'Tap a track to race' : '← → choose   SPACE / ENTER race   Esc back', cx + 50, H - 30, 13, '#fff');
    });
  },
  results(ctx, S0) {
    const a = S0.age | 0, k = easeOut(a / 18);
    frame(ctx, S0, 'rgba(43,33,64,' + (0.4 * k).toFixed(3) + ')', S => {
      const W = S.W, H = S.H, cx = W / 2, rows = S.rows || [];
      ctx.save(); ctx.globalAlpha = k; ctx.translate(0, (1 - k) * 40);
      const FX = S0.pad ? 34 : 14, extra = rows.reduce((n, r) => n + (r.fun ? FX : 0), 0), rh = rows.length > 5 && extra ? 34 : 38;   /* an upright phone: the fun line on two bigger lines (fix round 1) */
      const cw = Math.min(W - 40, 480), ch = Math.min(H - 8, 74 + rows.length * rh + extra + 50), x = cx - cw / 2, y = Math.max(4, H / 2 - ch / 2);
      card(ctx, x, y, cw, ch);
      /* the title fits the card (review A12) */
      let tz = 24; const tt = S.title || 'RESULTS', tw0 = tw(tt, tz); if (tw0 > cw - 40) tz *= (cw - 40) / tw0;
      text(ctx, tt, cx, y + 26, tz, PAL.sun); if (S.sub) text(ctx, S.sub, cx, y + 50, 13, '#e9e3ff');
      let ry = y + 78;
      rows.forEach((r, i) => {
        const q = clamp01((a - 8 - i * 4) / 10); if (q <= 0) { ry += rh + (r.fun ? FX : 0); return; } ctx.globalAlpha = k * q;
        const hh = rh - 4 + (r.fun ? FX : 0);
        if (r.me) { ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); rrect(ctx, x + 12, ry - rh / 2 + 2, cw - 24, hh, 12); ctx.fill(); }
        const grey = r.est ? '#a89cc8' : null;
        text(ctx, String(r.place), x + 34, ry, 22, grey || PCOL[r.place] || '#fff'); head(ctx, r.who, x + 74, ry, 38);
        text(ctx, SK.RACERS[r.who].name + (r.tag ? ' ' + r.tag : ''), x + 100, ry, 16, grey || SK.RACERS[r.who].txt, 'left');
        text(ctx, r.time, x + cw - (S.points ? 130 : 24), ry, 15, grey || '#fff', 'right');
        if (S.points) { text(ctx, '+' + r.pts, x + cw - 78, ry, 14, PAL.sun, 'right'); text(ctx, String(r.total), x + cw - 24, ry, 18, '#fff', 'right'); }
        if (r.fun && S0.pad) {   /* split near the middle at a ' · ' */
          const parts = r.fun.split(' · '), h2 = Math.ceil(parts.length / 2), l1 = parts.slice(0, h2).join(' · '), l2 = parts.slice(h2).join(' · ');
          for (const [ln, dy2] of [[l1, 18], [l2, 36]]) if (ln) { let fz = 16; const fw = tw(ln, fz); if (fw > cw - 110) fz *= (cw - 110) / fw; text(ctx, ln, x + 96, ry + dy2, fz, '#bfe8a8', 'left'); }
        } else if (r.fun) { let fz = 11.5; const fw = tw(r.fun, fz); if (fw > cw - 120) fz *= (cw - 120) / fw; text(ctx, r.fun, x + 100, ry + 17, fz, '#bfe8a8', 'left'); }
        ry += rh + (r.fun ? FX : 0);
      });
      ctx.globalAlpha = k;
      if (a > 40) { ctx.globalAlpha = k * (0.6 + 0.4 * Math.abs(Math.sin(a * 0.06))); text(ctx, S.prompt || 'SPACE: race again', cx, y + ch - 30, 16, PAL.sun); ctx.globalAlpha = k; if (S.prompt2) text(ctx, S.prompt2, cx, y + ch - 10, 12, '#e9e3ff'); }
      ctx.restore(); ctx.globalAlpha = 1;
    });
  },
  podium(ctx, S0) {
    frame(ctx, S0, H => { const gr = ctx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(43,33,64,.72)'); gr.addColorStop(1, 'rgba(43,33,64,.4)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, S0.W, H); }, S => {
      const W = S.W, H = S.H, a = S.age | 0, t = S.t | 0, cx = W / 2, st = S.standings || [];
      text(ctx, 'GRAND PRIX', cx, 28, 22, '#fff');
      const win = st[0]; if (win) text(ctx, SK.RACERS[win.who].name + ' WINS THE CUP!', cx, 60, 30, SK.RACERS[win.who].txt);
      if (S.unlock) { const p = 0.85 + 0.15 * Math.sin(a * 0.12); ctx.save(); ctx.translate(cx, 94); ctx.scale(p, p); text(ctx, 'WILD unlocked!', 0, 0, 22, '#c89aff'); ctx.restore(); }
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
      if (a > 60) { ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(a * 0.06)); text(ctx, S.prompt || 'SPACE: back to the title', cx, H - 20, 16, PAL.sun); ctx.globalAlpha = 1; }
    });
  },
  pause(ctx, S0) {
    frame(ctx, S0, 'rgba(43,33,64,.5)', S => {
      const W = S.W, H = S.H, cx = W / 2, sel = S.sel | 0, opts = S.opts || ['CARRY ON', 'BACK TO TITLE', 'LEAVE'];
      card(ctx, cx - 150, H / 2 - 120, 300, 70 + opts.length * 52);
      text(ctx, 'PAUSED', cx, H / 2 - 88, 32, '#fff');
      UI.menu.length = 0;
      opts.forEach((o, i) => { const y = H / 2 - 54 + i * 52; pill(ctx, cx - 110, y, 220, 40, i === sel ? '#5cc85a' : 'rgba(255,255,255,.16)', i === sel); text(ctx, o, cx, y + 21, 17, '#fff'); UI.menu.push(setR({}, cx - 114, y - 4, 228, 48)); });
    });
  },
  msg(ctx, S0) {
    frame(ctx, S0, 'rgba(43,33,64,.42)', S => {
      const W = S.W, H = S.H, L = String(S.text || '').split('\n'), h = L.length * 30 + 34, cy = S.y || H / 2;
      card(ctx, W / 2 - 200, cy - h / 2, 400, h);
      L.forEach((s, i) => { let z = i ? 15 : 20; const w = tw(s, z); if (w > 370) z *= 370 / w; text(ctx, s, W / 2, cy - h / 2 + 32 + i * 30, z, i ? '#fff' : PAL.sun); });
    });
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
    const uu = clamp(S.H / 400, 0.75, 1.25), px = B ? W / 2 : W - 10 - 112 * uu - 30, py = B ? B.y + B.h - 40 : 10 + 24 * uu; ctx.globalAlpha = 0.8;   /* landscape: left of the LAP pill, clear of the threat strip (fix round 1) */ ctx.fillStyle = PAL.ink; circle(ctx, px, py, 17); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(px - 6, py - 7, 4, 14); ctx.fillRect(px + 2, py - 7, 4, 14); ctx.globalAlpha = 1;
    T.pause = setR(T.pause || {}, px - 24, py - 24, 48, 48);
    if (B) { text(ctx, 'hold ◀ ▶ to steer', W / 2, y - r - 46, 16, '#e9ffe0'); text(ctx, 'DRIFT: hop and slide · ITEM: use it', W / 2, y - r - 24, 16, '#e9ffe0'); }   /* two lines, readable on a phone (fix round 1) */
  }
};

SK.Render = {
  ready: false, UI, PAL, THEMES, fmtTime, text, KANG,
  get R() { return R; },
  init(r, low) { r = Math.max(1, Math.min(4, +r || 2)); if (this.ready && r === R && !!low === LOW) return; R = r; LOW = !!low; TXT = new Map(); txtB = 0; GLY.clear(); const th = THEME; THEME = ''; SPR = {}; bakeItems(); bakeRacers(); if (th) bakeTheme(th); SKY = null; this.ready = true; },
  setTrack(T) { bakeTheme(T.theme); prepTrack(T); if (!SKY || SKY.theme !== T.theme) bakeSky(T.theme); PARTS.length = 0; BOUNCED.clear(); for (const V of VIEWS) V.cam.ok = false; },
  prefetch, paintV2,
  camera, tick: fxTick, fxEvent, drawView, drawHUD,
  screen(ctx, name, S) { const F = SCREENS[name]; if (F) F(ctx, S || {}); },
  head, minimap, paintRacer, itemIcon(ctx, k, x, y, s) { itemIcon(ctx, k, x, y, s); }, logo,
  get parts() { return PARTS.length; },
  _dl() { return DL.slice(0, dn).filter(d => d.z < 12).map(d => [d.t, +d.z.toFixed(1), d.o.k || ('kart' + d.o.i), Math.round(d.X), Math.round(d.Y)]); }
};
})();
