/* ROOTLIGHT — render.js (RENDER). Everything around the things: the rooms' terrain, backgrounds, colour, light, particles,
   the camera view, the HUD and every screen, in the Berry Breeze / Vine Line / Sprout Kart house style (thick dark-plum ink
   outlines, glossy two-tone shading, soft pastels, sticker text). The *things* (Sprig, Marigold, the Peddler, glooms,
   guardians, pickups, props, icons, portraits) come from RL.Art; anything art.js does not have yet gets a simple stand-in.
   TERRAIN   each room is baked lazily into 320 x 180 chunk canvases at min(R,3) (LRU-capped): every solid material (earth,
             stone, root) is one merged path of rounded tiles with lumpy bumps on exposed edges and filleted inner corners,
             inked, two-tone shaded (light top band, dark bottom band) and textured per area; then thorns, one-way ledges,
             grass / moss / mushrooms / crystals / bolts on top edges and roots or stalactites under ceilings, all from a tile
             hash. Crumbling ledges, briars, breakable walls and water are drawn live. A chunk is re-baked when a tile changes.
   COLOUR    backgrounds, terrain, glooms, guardians and hazards are drawn, then the colour is faded out by 1 - room.colour
             (one 'saturation' fill), then everything kind is drawn in full colour on top: a grey room fills with colour.
   LIGHT     dark rooms: a quarter-resolution light map (baked radial sprites, additive) multiplied over the view;
             other rooms: soft additive light pools and god-rays.
   RL.Render: init(R, low), room(sim), tick(sim), fx(sim, ev), frame(ctx, F), hud(ctx, H), screen(ctx, name, S),
   text(ctx, s, x, y, size, fill, align) -> width, UI (hit rects: rows, chips, back). Logical view 640 x 360. */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis;
const RL = G.RL = G.RL || {};
const TAU = Math.PI * 2, PI = Math.PI, TILE = 20, VW = 640, VH = 360, CHW = 320, CHH = 180, CPAD = 2;
const INK = '#2b2140';
const PAL = { ink: INK, plum: '#4a3a6b', cream: '#fff6e0', sun: '#ffd93b', gold: '#f5a623', orange: '#ff8a3d', leaf: '#4cc46a',
  lilac: '#e4d8ff', sky: '#7fd0ff', mint: '#9be8c4', dew: '#7fd8ff', rose: '#ff8ab0', soot: '#3e3650', wood: '#b9774a' };
const FONT = '"Arial Rounded MT Bold", ui-rounded, "Varela Round", "Trebuchet MS", system-ui, sans-serif';
const font = s => 'bold ' + s + 'px ' + FONT;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const h3 = (a, b, c) => hash(a * 7919 + c * 104729, b * 31 + c);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { if (t <= 0) return a; if (t >= 1) return b; const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const tint = (h, t) => mix(h, '#ffffff', t), shade = (h, t) => mix(h, INK, t);
const rgba = (h, a) => { const c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
const greyOf = h => { const [r, g, b] = rgb(h), l = Math.round(r * 0.3 + g * 0.59 + b * 0.11); return '#' + [l, l, l].map(v => v.toString(16).padStart(2, '0')).join(''); };
let R = 2, LOW = false, BS = 2, BGS = 2, TIME = 0;

/* ---------- small drawing helpers ---------- */
const POOL = [];   /* spare canvases, reused by size */
function canvas(w, h) { w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h)); for (let i = POOL.length - 1; i >= 0; i--) { const c = POOL[i]; if (c.width === w && c.height === h) { POOL.splice(i, 1); const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, w, h); return c; } } const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function recycle(c) { if (c && POOL.length < 12) POOL.push(c); }
function sprite(w, h, draw, dens) { const d = dens || R; const c = canvas(w * d, h * d); c.lw = w; c.lh = h; const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); return c; }
function rrect(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function rr(g, x, y, w, h, r) { g.beginPath(); rrect(g, x, y, w, h, r); }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0, r), 0, TAU); }
function STAR(g, cx, cy, r, ri, n, rot) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, q = i & 1 ? ri : r; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); }
function twinkle(g, x, y, r, rot, col) { g.fillStyle = col || '#fff'; STAR(g, x, y, r, r * 0.32, 4, rot || 0); g.fill(); }
function ball(g, x, y, r, m, lw) {
  g.fillStyle = INK; circle(g, x, y, r + (lw == null ? 2 : lw)); g.fill();
  g.fillStyle = m[1]; circle(g, x, y, r); g.fill();
  g.save(); circle(g, x, y, r); g.clip(); g.fillStyle = m[0]; circle(g, x - r * 0.16, y - r * 0.18, r * 0.92); g.fill(); g.restore();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.42, r * 0.34, r * 0.19, -0.6, 0, TAU); g.fill();
}
function leafPath(g, L, w) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.45, -w, L, 0); g.quadraticCurveTo(L * 0.45, w, 0, 0); g.closePath(); }
function leaf(g, x, y, a, L, m, lw) {
  g.save(); g.translate(x, y); g.rotate(a); const w = L * 0.42;
  leafPath(g, L, w); g.strokeStyle = INK; g.lineWidth = lw || 2.4; g.stroke(); g.fillStyle = m[0]; g.fill();
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.45, w, L, 0); g.closePath(); g.fillStyle = m[1]; g.globalAlpha *= 0.45; g.fill(); g.globalAlpha /= 0.45;
  g.strokeStyle = m[1]; g.lineWidth = (lw || 2.4) * 0.38; g.beginPath(); g.moveTo(L * 0.12, 0); g.lineTo(L * 0.78, 0); g.stroke();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(L * 0.42, -w * 0.38, L * 0.16, w * 0.16, 0, 0, TAU); g.fill();
  g.restore();
}
/* a closed blob made of circles, one merged ink outline */
function blobs(g, list, fill, lw, hi) {
  g.fillStyle = INK; for (const b of list) { circle(g, b[0], b[1], b[2] + lw); g.fill(); }
  g.fillStyle = fill; for (const b of list) { circle(g, b[0], b[1], b[2]); g.fill(); }
  if (hi) { g.fillStyle = hi; for (const b of list) { g.beginPath(); g.ellipse(b[0] - b[2] * 0.3, b[1] - b[2] * 0.4, b[2] * 0.42, b[2] * 0.22, -0.4, 0, TAU); g.fill(); } }
}
const M3 = { LEAF: ['#86dc5c', '#3f9a3a', '#e6ffd6'], SUN: ['#ffd93b', '#f5a623', '#fffbe0'], DEW: ['#8fe0ff', '#3f8fd8', '#eafaff'], WOOD: ['#b9774a', '#8a5530', '#ecc7a2'],
  PLUM: ['#5a4a7b', '#3a2c55', '#8a7ab0'], GOLD: ['#ffcf3f', '#e8941c', '#fff4c4'], ROSE: ['#ff9abb', '#e0607f', '#ffe2ec'], STONE: ['#a8a2b8', '#6f6984', '#dcd8e6'], CREAM: ['#fff6e0', '#d8cbb8', '#ffffff'] };

/* ---------- sticker text (cached per string, size and colour; LRU) ---------- */
let TXT = new Map(), txtB = 0; let mctx = null;
function mc() { if (!mctx) mctx = document.createElement('canvas').getContext('2d'); return mctx; }
function txtCanvas(s, size, fill) {
  const key = s + '|' + size + '|' + fill; let c = TXT.get(key);
  if (c) { TXT.delete(key); TXT.set(key, c); return c; }
  const m = mc(); m.font = font(size); const w = m.measureText(s).width, p = size * 0.3 + 1, lw = w + p * 2, lh = size * 1.25 + p * 2;
  c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(lw * R)); c.height = Math.max(1, Math.ceil(lh * R)); c.lw = c.width / R; c.lh = c.height / R; c.tw = w;
  const g = c.getContext('2d'); g.scale(R, R); g.font = font(size); g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.strokeStyle = INK; g.lineWidth = size * 0.3; const ty = lh / 2 - 0.5;
  g.strokeText(s, p, ty + size * 0.07); g.strokeText(s, p, ty); g.fillStyle = fill; g.fillText(s, p, ty);
  TXT.set(key, c); txtB += c.width * c.height * 4;
  while (TXT.size > 1 && (TXT.size > 260 || txtB > 10e6)) { const k = TXT.keys().next().value, o = TXT.get(k); txtB -= o.width * o.height * 4; TXT.delete(k); }
  return c;
}
function text(ctx, s, x, y, size, fill, align) {
  s = String(s == null ? '' : s).slice(0, 90); if (!s) return 0; size = Math.round(Math.max(5, Math.min(120, +size || 14)) * 2) / 2; fill = fill || '#fff'; align = align || 'center';
  const c = txtCanvas(s, size, fill), p = (c.lw - c.tw) / 2, x0 = align === 'center' ? x - c.lw / 2 : align === 'right' ? x - c.tw - p : x - p;
  ctx.drawImage(c, x0, y - c.lh / 2, c.lw, c.lh); return c.tw;
}
const TW = new Map();
function tw(s, z) { const k = z + '|' + s; let v = TW.get(k); if (v === undefined) { const m = mc(); m.font = font(z); v = m.measureText(s).width; if (TW.size > 3000) TW.clear(); TW.set(k, v); } return v; }
const WR = new Map();
function wrap(s, size, maxW) {
  const key = size + '|' + maxW + '|' + s; let L = WR.get(key); if (L) return L;
  L = []; for (const para of String(s || '').split('\n')) { let line = ''; for (const w of para.split(' ')) { const t2 = line ? line + ' ' + w : w; if (line && tw(t2, size) > maxW) { L.push(line); line = w; } else line = t2; } L.push(line); }
  if (WR.size > 400) WR.clear(); WR.set(key, L); return L;
}
/* wrapped sticker text; `reveal` (chars) clips a typewriter reveal without making new cache entries */
function para(ctx, s, x, y, maxW, size, fill, align, lh, reveal) {
  const L = wrap(s, size, maxW); lh = lh || size * 1.32; let n = reveal == null ? 1e9 : reveal;
  for (let i = 0; i < L.length; i++) {
    const ln = L[i], yy = y + i * lh; if (n <= 0) break;
    if (n >= ln.length) text(ctx, ln, x, yy, size, fill, align);
    else { const w = tw(ln.slice(0, n), size), full = tw(ln, size), x0 = align === 'center' ? x - full / 2 : align === 'right' ? x - full : x; ctx.save(); ctx.beginPath(); ctx.rect(x0 - size, yy - size, w + size * 0.6, size * 2); ctx.clip(); text(ctx, ln, x, yy, size, fill, align); ctx.restore(); }
    n -= ln.length + 1;
  }
  return L.length * lh;
}

/* ---------- RL.Art, feature-checked: anything missing gets a stand-in drawn here ---------- */
let artErr = 0;
function art(name) { const A = RL.Art; return A && typeof A[name] === 'function' ? A[name] : null; }
function callArt(name, stand, a, b, c, d, e, f, g2) {
  const fn = art(name);
  if (fn) { try { return fn.call(RL.Art, a, b, c, d, e, f, g2); } catch (er) { if (artErr++ < 5 && G.console) console.warn('RL.Art.' + name, er); } }
  return stand(a, b, c, d, e, f, g2);
}

/* =====================================================================================================================
   AREAS: each has its own look. earth/root/stone = [base, dark band, light band]; sk stone kind, tk top-edge kind,
   ck ceiling kind, lk one-way ledge kind; bg = [top, bottom] of the backdrop; amb = the dark-room ambient light.
   ===================================================================================================================== */
const AREA = {
  rootgate: { bg: ['#2a1a26', '#4f302c'], far: '#3c2733', mid: '#4a2f30', earth: ['#b98157', '#86553b', '#e3b386'], speck: ['#8e5d40', '#ecc49a'], strata: '#9b6645',
    root: ['#9a6440', '#6a3f28', '#cf9566'], stone: ['#9a8fa6', '#6a6079', '#cbc2d8'], sk: 'rock', top: ['#9fd862', '#5f9c3c', '#d8f7a0'], tk: 'grass', ck: 'roots', lk: 'plank',
    water: '#5ab8d8', light: '#ffc070', amb: '#2e2438', mote: '#ffdca0', shaft: '#ffd49a', fl: ['#ff8ab0', '#ffd93b', '#ffffff', '#b9a2ff'] },
  mossy: { bg: ['#10261f', '#244c3a'], far: '#1a3b30', mid: '#1f4536', earth: ['#a07b56', '#6f523a', '#cfa67c'], speck: ['#7f6044', '#dcc09a'], strata: '#866446',
    root: ['#8c643f', '#5e4029', '#bf9262'], stone: ['#8c9c8c', '#5f6f63', '#bccbbd'], sk: 'mossrock', top: ['#86d65e', '#459a42', '#cdf7a0'], tk: 'moss', ck: 'moss', lk: 'mossplank',
    water: '#5cd0b4', light: '#eaffb0', amb: '#1c3028', mote: '#eaffc0', shaft: '#f0ffb8', fl: ['#ffffff', '#ffd93b', '#ff9ac8', '#9fd0ff'] },
  glowcap: { bg: ['#0c0d26', '#221d4c'], far: '#171840', mid: '#1d1d4a', earth: ['#6b5fa3', '#463c78', '#988ccc'], speck: ['#544a8a', '#b3a8e0'], strata: '#574c8c',
    root: ['#7a5a90', '#4f3666', '#a988c0'], stone: ['#4466c4', '#2b4088', '#86a8f2'], sk: 'glow', top: ['#5fd6c4', '#2c8f90', '#bdfff2'], tk: 'glow', ck: 'stal', lk: 'shelf',
    water: '#5a86f0', light: '#8fe8ff', amb: '#24204a', mote: '#bff6ff', shaft: '#9fd8ff', fl: ['#8fe8ff', '#ff9ad8', '#c8a8ff', '#ffffff'] },
  pipes: { bg: ['#211619', '#3f2a25'], far: '#2e2023', mid: '#3a2824', earth: ['#9a6450', '#6a4034', '#c88e72'], speck: ['#7a4a3a', '#d8a88a'], strata: '#7f4f3e',
    root: ['#84583c', '#573822', '#b2845a'], stone: ['#cf7f44', '#8e4e2a', '#f6b882'], sk: 'metal', top: ['#b4c464', '#6e8a3c', '#e6f4a8'], tk: 'rust', ck: 'pipe', lk: 'pipe',
    water: '#6aa8a4', light: '#ffb070', amb: '#2a1e22', mote: '#ffe0b0', shaft: '#ffc890', fl: ['#ffd93b', '#ff8a5a', '#ffffff', '#ff9ac8'] },
  crystal: { bg: ['#0c2532', '#19475a'], far: '#14374a', mid: '#174256', earth: ['#6687a2', '#435f78', '#97b8d0'], speck: ['#4f6e88', '#c4def0'], strata: '#557591',
    root: ['#7f6f88', '#54485e', '#ad9cb8'], stone: ['#c4eef8', '#80c4dc', '#ffffff'], sk: 'crystal', top: ['#8fe4c8', '#46a88e', '#d4fff0'], tk: 'crystal', ck: 'crys', lk: 'crys',
    water: '#3fd4d0', light: '#a0f2ff', amb: '#122a38', mote: '#d4ffff', shaft: '#b8fbff', fl: ['#9fe6ff', '#ffffff', '#c8b2ff', '#ff9ac8'] },
  cloud: { bg: ['#8fcaff', '#e6f2ff'], far: '#c6d8f4', mid: '#b2c6e8', earth: ['#dccbb8', '#a9978b', '#f7eee2'], speck: ['#bfae9e', '#fffaf0'], strata: '#c3b2a2',
    root: ['#b28c6c', '#82624a', '#dcb48e'], stone: ['#f2f3ff', '#bfc3ea', '#ffffff'], sk: 'cloud', top: ['#bce892', '#78b662', '#ecffd4'], tk: 'fluff', ck: 'wisp', lk: 'cloud',
    water: '#8cd2ff', light: '#ffffff', amb: '#6f7aa0', mote: '#ffffff', shaft: '#ffffff', fl: ['#ffd93b', '#ff9ac8', '#9fd0ff', '#ffffff'] },
  heart: { bg: ['#1c0d24', '#41193b'], far: '#2b1430', mid: '#371a38', earth: ['#7f4d7f', '#55315d', '#ad7aae'], speck: ['#663e6a', '#cfa0d0'], strata: '#6a3f6e',
    root: ['#a2603c', '#6c3d27', '#d8946a'], stone: ['#7d4cae', '#542f84', '#b590e4'], sk: 'amethyst', top: ['#d48ad0', '#9a4f98', '#ffd0fa'], tk: 'gold', ck: 'groots', lk: 'groot',
    water: '#9a7cf0', light: '#ffd070', amb: '#26122c', mote: '#ffe08a', shaft: '#ffd890', fl: ['#ffd93b', '#ff9ac8', '#ffffff', '#ffb070'] }
};
const areaOf = id => AREA[id] || AREA.rootgate;

/* =====================================================================================================================
   TERRAIN: the room cache (RC) and baked chunks
   ===================================================================================================================== */
const LAY = new Int8Array(16).fill(-1); LAY[1] = 0; LAY[3] = 1; LAY[2] = 2; LAY[10] = 3;   /* earth, stone, root; breakable drawn live on top */
const LCODE = [1, 3, 2];
let RC = null;
const CHUNKS = new Map(); let serialN = 0; const SERIAL = new Map();
const chMax = () => LOW ? 14 : 26;
function tileAt(rc, x, y) { x = x < 0 ? 0 : x >= rc.w ? rc.w - 1 : x; y = y < 0 ? 0 : y >= rc.h ? rc.h - 1 : y; return rc.t[y * rc.w + x]; }
const conn = (L, c) => LAY[c] >= L;
const isSolidCode = c => LAY[c] >= 0;
function rr4(P, x, y, w, h, tl, tr, br, bl) {
  P.moveTo(x + tl, y); P.lineTo(x + w - tr, y); if (tr) P.arcTo(x + w, y, x + w, y + tr, tr); P.lineTo(x + w, y + h - br); if (br) P.arcTo(x + w, y + h, x + w - br, y + h, br);
  P.lineTo(x + bl, y + h); if (bl) P.arcTo(x, y + h, x, y + h - bl, bl); P.lineTo(x, y + tl); if (tl) P.arcTo(x, y, x + tl, y, tl); P.closePath();
}
function bump(P, cx, cy, r) { P.moveTo(cx + r, cy); P.arc(cx, cy, r, 0, TAU); }
function chamfer(P, x, y, w, h, tl, tr, br, bl) {
  P.moveTo(x + tl, y); P.lineTo(x + w - tr, y); P.lineTo(x + w, y + tr); P.lineTo(x + w, y + h - br); P.lineTo(x + w - br, y + h); P.lineTo(x + bl, y + h); P.lineTo(x, y + h - bl); P.lineTo(x, y + tl); P.closePath();
}
function tileShape(P, rc, tx, ty, L, ext) {
  const x = tx * TILE, y = ty * TILE, sk = L === 1 ? rc.A.sk : '';
  const cU = conn(L, tileAt(rc, tx, ty - 1)), cD = conn(L, tileAt(rc, tx, ty + 1)), cL = conn(L, tileAt(rc, tx - 1, ty)), cR = conn(L, tileAt(rc, tx + 1, ty));
  if (ext) { const r = 11, i = 0.6, a = cU ? 0 : i, b = cD ? 0 : i, l = cL ? 0 : i, q = cR ? 0 : i; rr4(P, x + l, y + a, TILE - l - q, TILE - a - b, !cU && !cL ? r : 0, !cU && !cR ? r : 0, !cD && !cR ? r : 0, !cD && !cL ? r : 0); return; }
  const crisp = sk === 'metal' || sk === 'crystal' || sk === 'amethyst', rad = sk === 'metal' ? 4 : crisp ? 6 : sk === 'cloud' ? 9.5 : 8.5;
  const tl = !cU && !cL ? rad : 0, tr = !cU && !cR ? rad : 0, br = !cD && !cR ? rad : 0, bl = !cD && !cL ? rad : 0;
  if (crisp && sk !== 'metal') chamfer(P, x, y, TILE, TILE, tl, tr, br, bl); else rr4(P, x, y, TILE, TILE, tl, tr, br, bl);
  const s = tx * 3 + 11, u = ty * 5 + 7, bs = sk === 'cloud' ? 1.6 : 1;
  if (!crisp) {
    if (!cU) for (let k = 0; k < 2; k++) { if (k ? tr : tl) continue; const h = hash(s + k, u), r = 5 + h * 3, b = (0.8 + hash(u + k, s) * 1.8) * bs; bump(P, x + 5 + k * 10 + (h - 0.5) * 3, y + r - b, r); }
    if (!cD) for (let k = 0; k < 2; k++) { if (k ? br : bl) continue; const h = hash(s + k, u + 1), r = 5 + h * 3, b = (0.6 + hash(u + k, s + 1) * 1.6) * bs; bump(P, x + 5 + k * 10 + (h - 0.5) * 3, y + TILE - r + b, r); }
    if (!cL) for (let k = 0; k < 2; k++) { if (k ? bl : tl) continue; const h = hash(s + 2, u + k), r = 5 + h * 3, b = (0.6 + hash(u, s + k + 2) * 1.6) * bs; bump(P, x + r - b, y + 5 + k * 10 + (h - 0.5) * 3, r); }
    if (!cR) for (let k = 0; k < 2; k++) { if (k ? br : tr) continue; const h = hash(s + 3, u + k), r = 5 + h * 3, b = (0.6 + hash(u, s + k + 3) * 1.6) * bs; bump(P, x + TILE - r + b, y + 5 + k * 10 + (h - 0.5) * 3, r); }
  }
  /* filleted inner corners in the empty diagonal neighbour */
  for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) {
    const a = tileAt(rc, tx + sx, ty), b = tileAt(rc, tx, ty + sy);
    if (!conn(L, a) || !conn(L, b) || conn(L, tileAt(rc, tx + sx, ty + sy)) || (LAY[a] !== L && LAY[b] !== L)) continue;
    const px = x + (sx > 0 ? TILE : 0), py = y + (sy > 0 ? TILE : 0), f = 9.5;
    if (sx * sy > 0) { P.moveTo(px, py); P.lineTo(px + sx * f, py); P.quadraticCurveTo(px, py, px, py + sy * f); }
    else { P.moveTo(px, py); P.lineTo(px, py + sy * f); P.quadraticCurveTo(px, py, px + sx * f, py); }
    P.closePath();
  }
}
let TMPF = null, TMPH = null;
function ensureTmp(w, h) {
  if (!TMPF || TMPF.width !== w || TMPF.height !== h) { TMPF = document.createElement('canvas'); TMPF.width = w; TMPF.height = h; TMPH = document.createElement('canvas'); TMPH.width = w; TMPH.height = h; }
}
/* a layer's shape: its own tiles, plus (inset, plain) the later-layer tiles it touches, so it fills in behind their rounded
   corners: earth fills behind everything solid, stone behind the roots and walls next to it, roots behind breakable walls */
function layerPath(rc, L, tx0, ty0, tx1, ty1) {
  const code = LCODE[L], P = new Path2D(); let any = false;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const c = tileAt(rc, tx, ty);
    if (c === code) { any = true; tileShape(P, rc, tx, ty, L, false); }
    else if (LAY[c] > L && (L === 0 || tileAt(rc, tx - 1, ty) === code || tileAt(rc, tx + 1, ty) === code || tileAt(rc, tx, ty - 1) === code || tileAt(rc, tx, ty + 1) === code)) tileShape(P, rc, tx, ty, L, true);
  }
  return any ? P : null;
}
/* how deep inside the solid ground a tile is (0 at the surface), for the interior shading */
function depthAt(rc, x, y) {
  const cx = x < 0 ? 0 : x >= rc.w ? rc.w - 1 : x, cy = y < 0 ? 0 : y >= rc.h ? rc.h - 1 : y, d = rc.depth[cy * rc.w + cx];
  return d ? d + Math.max(Math.abs(x - cx), Math.abs(y - cy)) : 0;
}
function depthMap(rc) {
  const w = rc.w, h = rc.h, D = new Uint8Array(w * h), BIG = 60;
  for (let i = 0; i < w * h; i++) D[i] = isSolidCode(rc.t[i]) ? BIG : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!D[i]) continue; let m = D[i]; if (x > 0) m = Math.min(m, D[i - 1] + 1); if (y > 0) m = Math.min(m, D[i - w] + 1); if (x > 0 && y > 0) m = Math.min(m, D[i - w - 1] + 1); if (x < w - 1 && y > 0) m = Math.min(m, D[i - w + 1] + 1); D[i] = m; }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) { const i = y * w + x; if (!D[i]) continue; let m = D[i]; if (x < w - 1) m = Math.min(m, D[i + 1] + 1); if (y < h - 1) m = Math.min(m, D[i + w] + 1); if (x < w - 1 && y < h - 1) m = Math.min(m, D[i + w + 1] + 1); if (x > 0 && y < h - 1) m = Math.min(m, D[i + w - 1] + 1); D[i] = m; }
  return D;
}
let DMC = null;
function paintLayer(g, rc, L, P, tx0, ty0, tx1, ty1, T, pw, ph, A) {
  const m = L === 0 ? A.earth : L === 1 ? A.stone : A.root;
  /* ink */
  g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = 4.6; g.fill(P); g.stroke(P);
  /* fill with a dark bottom band, texture, deep shading, a light top band */
  const f = TMPF.getContext('2d'), hh = TMPH.getContext('2d');
  f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'source-over'; f.globalAlpha = 1; f.clearRect(0, 0, pw, ph);
  f.setTransform(T[0], 0, 0, T[3], T[4], T[5]); f.lineJoin = 'round'; f.lineCap = 'round';
  f.fillStyle = m[1]; f.fill(P);
  f.globalCompositeOperation = 'source-atop';
  f.translate(0, -5); f.fillStyle = m[0]; f.fill(P); f.translate(0, 5);
  texture(f, rc, L, tx0, ty0, tx1, ty1, A, m);
  /* deep inside the ground it gets darker: a tiny per-tile map, smoothly scaled up */
  const dw = tx1 - tx0 + 1, dh = ty1 - ty0 + 1;
  if (!DMC || DMC.width !== dw || DMC.height !== dh) { DMC = document.createElement('canvas'); DMC.width = dw; DMC.height = dh; }
  const dg = DMC.getContext('2d'), img = dg.createImageData(dw, dh), px = img.data, deep = rgb(A === AREA.cloud ? mix(m[1], '#8a8aa8', 0.3) : mix(m[1], A.bg[0], 0.55)), maxA = A === AREA.cloud ? 0.4 : 0.78;
  let anyD = false;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) { const d = depthAt(rc, tx0 + x, ty0 + y), a = d <= 1 ? 0 : Math.min(maxA, (d - 1) * 0.24), o = (y * dw + x) * 4; px[o] = deep[0]; px[o + 1] = deep[1]; px[o + 2] = deep[2]; px[o + 3] = Math.round(a * 255); if (a > 0) anyD = true; }
  if (anyD) { dg.putImageData(img, 0, 0); f.imageSmoothingEnabled = true; f.drawImage(DMC, tx0 * TILE, ty0 * TILE, dw * TILE, dh * TILE); }
  hh.setTransform(1, 0, 0, 1, 0, 0); hh.globalCompositeOperation = 'source-over'; hh.clearRect(0, 0, pw, ph);
  hh.setTransform(T[0], 0, 0, T[3], T[4], T[5]); hh.fillStyle = m[2]; hh.fill(P);
  hh.globalCompositeOperation = 'destination-out'; hh.translate(0, 4.5); hh.fill(P); hh.translate(0, -4.5); hh.globalCompositeOperation = 'source-over';
  f.setTransform(1, 0, 0, 1, 0, 0); f.globalAlpha = 0.9; f.drawImage(TMPH, 0, 0); f.globalAlpha = 1;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(TMPF, 0, 0); g.restore();
}
/* the inside of a material: pebbles, strata, grain, plates, crystal facets... (drawn source-atop, so it stays inside) */
function texture(f, rc, L, tx0, ty0, tx1, ty1, A, m) {
  const sk = A.sk;
  if (L === 0) {   /* earth: strata lines, pebbles, fibres */
    f.lineWidth = 1.7; f.strokeStyle = rgba(A.strata, 0.55); f.beginPath();
    for (let ty = ty0; ty <= ty1; ty++) { if (hash(ty, 77) > 0.42) continue; const y0 = ty * TILE + 6 + hash(ty, 78) * 8, ph = hash(ty, 79) * 9; for (let x = tx0 * TILE; x <= (tx1 + 1) * TILE; x += 4) { const y = y0 + Math.sin(x * 0.045 + ph) * 2.6; if (x === tx0 * TILE) f.moveTo(x, y); else f.lineTo(x, y); } }
    f.stroke();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tileAt(rc, tx, ty) !== 1) continue; const x = tx * TILE, y = ty * TILE, h = hash(tx, ty);
      const n = h < 0.35 ? 0 : h < 0.8 ? 1 : 2;
      for (let k = 0; k < n; k++) { const px = x + 3 + hash(tx + k * 9, ty + 3) * 14, py = y + 3 + hash(tx, ty + k * 7 + 5) * 14, r = 1.6 + hash(tx + k, ty + 11) * 1.8;
        f.fillStyle = A.speck[0]; f.beginPath(); f.ellipse(px, py, r * 1.25, r, 0, 0, TAU); f.fill(); f.fillStyle = rgba(A.speck[1], 0.75); f.beginPath(); f.ellipse(px - r * 0.35, py - r * 0.35, r * 0.5, r * 0.35, 0, 0, TAU); f.fill(); }
      if (hash(ty + 40, tx) < 0.12) { f.strokeStyle = rgba(A.root[1], 0.6); f.lineWidth = 1.1; f.beginPath(); const fx = x + hash(tx, ty + 2) * 20; f.moveTo(fx, y); f.bezierCurveTo(fx + 6, y + 6, fx - 5, y + 12, fx + 3, y + 20); f.stroke(); }
    }
  } else if (L === 2) {   /* root wood: grain along the run, knots */
    f.lineWidth = 1.3; f.strokeStyle = rgba(m[1], 0.6); f.beginPath();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tileAt(rc, tx, ty) !== 2) continue; const x = tx * TILE, y = ty * TILE;
      const hz = (tileAt(rc, tx - 1, ty) === 2 || tileAt(rc, tx + 1, ty) === 2) && !(tileAt(rc, tx, ty - 1) === 2 && tileAt(rc, tx, ty + 1) === 2);
      for (let k = 0; k < 3; k++) { const o = 4 + k * 6 + hash(k, hz ? ty : tx) * 2; if (hz) { f.moveTo(x, y + o); f.bezierCurveTo(x + 7, y + o - 1.5, x + 13, y + o + 1.5, x + 20, y + o); } else { f.moveTo(x + o, y); f.bezierCurveTo(x + o - 1.5, y + 7, x + o + 1.5, y + 13, x + o, y + 20); } }
    }
    f.stroke();
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tileAt(rc, tx, ty) !== 2 || hash(tx + 5, ty + 9) > 0.13) continue; const x = tx * TILE + 10, y = ty * TILE + 10;
      f.fillStyle = m[1]; f.beginPath(); f.ellipse(x, y, 4, 3, 0, 0, TAU); f.fill(); f.fillStyle = m[2]; f.beginPath(); f.ellipse(x, y, 2, 1.3, 0, 0, TAU); f.fill();
    }
  } else {   /* stone: by area */
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tileAt(rc, tx, ty) !== 3) continue; const x = tx * TILE, y = ty * TILE, h = hash(tx * 3, ty * 5 + 1), h2 = hash(tx + 17, ty * 7);
      if (sk === 'rock' || sk === 'mossrock') {
        f.fillStyle = rgba(m[2], 0.35); f.beginPath(); f.moveTo(x + 3 + h * 6, y + 3); f.lineTo(x + 15, y + 4 + h2 * 4); f.lineTo(x + 12 + h * 4, y + 12); f.lineTo(x + 4, y + 10 + h2 * 3); f.closePath(); f.fill();
        if (h2 < 0.3) { f.strokeStyle = rgba(m[1], 0.8); f.lineWidth = 1.1; f.beginPath(); f.moveTo(x + 4 + h * 10, y + 2); f.lineTo(x + 8 + h * 6, y + 9); f.lineTo(x + 5 + h * 9, y + 16); f.stroke(); }
        if (sk === 'mossrock' && h < 0.45) { f.fillStyle = rgba(A.top[0], 0.55); f.beginPath(); f.ellipse(x + 6 + h2 * 8, y + 4, 6, 3.5, 0, 0, TAU); f.fill(); }
      } else if (sk === 'glow') {
        f.strokeStyle = 'rgba(143,232,255,.75)'; f.lineWidth = 1.6; f.beginPath(); f.moveTo(x, y + 4 + h * 12); f.lineTo(x + 7, y + 6 + h2 * 8); f.lineTo(x + 13, y + 3 + h * 10); f.lineTo(x + 20, y + 5 + h2 * 10); f.stroke();
        f.strokeStyle = 'rgba(230,252,255,.8)'; f.lineWidth = 0.6; f.stroke();
        if (h < 0.4) { f.fillStyle = 'rgba(191,246,255,.9)'; circle(f, x + 4 + h2 * 12, y + 4 + h * 12, 1.4 + h2); f.fill(); }
      } else if (sk === 'metal') {
        const brass = hash((tx >> 1) * 5, (ty >> 1) * 3) < 0.25;
        if (brass) { f.fillStyle = 'rgba(232,184,64,.55)'; f.fillRect(x, y, TILE, TILE); }
        f.strokeStyle = rgba(m[1], 0.9); f.lineWidth = 1.3; f.beginPath();
        if (!(tx & 1)) { f.moveTo(x + 0.6, y); f.lineTo(x + 0.6, y + TILE); }
        if (!(ty & 1)) { f.moveTo(x, y + 0.6); f.lineTo(x + TILE, y + 0.6); }
        f.stroke();
        f.strokeStyle = rgba(m[2], 0.6); f.lineWidth = 1; f.beginPath(); if (!(ty & 1)) { f.moveTo(x, y + 2.2); f.lineTo(x + TILE, y + 2.2); } f.stroke();
        const rx = (tx & 1) ? x + 16 : x + 4, ry = (ty & 1) ? y + 16 : y + 4;
        f.fillStyle = m[1]; circle(f, rx, ry, 1.9); f.fill(); f.fillStyle = m[2]; circle(f, rx - 0.5, ry - 0.6, 0.9); f.fill();
        if (h < 0.18) { f.fillStyle = 'rgba(150,80,40,.35)'; f.beginPath(); f.ellipse(x + 10, y + 12, 3, 7, 0, 0, TAU); f.fill(); }
      } else if (sk === 'crystal') {
        f.fillStyle = 'rgba(255,255,255,.55)'; f.beginPath(); f.moveTo(x + 2 + h * 6, y + 2); f.lineTo(x + 11, y + 2 + h2 * 5); f.lineTo(x + 6 + h2 * 4, y + 13); f.closePath(); f.fill();
        f.fillStyle = rgba('#a8d8f0', 0.6); f.beginPath(); f.moveTo(x + 11, y + 9 + h * 4); f.lineTo(x + 19, y + 7); f.lineTo(x + 17, y + 18); f.lineTo(x + 9, y + 18); f.closePath(); f.fill();
        if (h2 < 0.3) { f.fillStyle = 'rgba(224,208,255,.5)'; f.fillRect(x + 3, y + 12, 6, 6); }
        if (h < 0.2) twinkle(f, x + 6 + h2 * 8, y + 6, 2.6, 0, '#fff');
      } else if (sk === 'cloud') {
        f.fillStyle = 'rgba(255,255,255,.75)'; circle(f, x + 6 + h * 8, y + 6 + h2 * 4, 4 + h2 * 3); f.fill();
        f.strokeStyle = rgba(m[1], 0.55); f.lineWidth = 1.1; f.beginPath(); f.arc(x + 10 + h2 * 4, y + 12, 3.5, PI * 0.1, PI * 1.3); f.stroke();
      } else if (sk === 'amethyst') {
        f.fillStyle = rgba(m[2], 0.45); f.beginPath(); f.moveTo(x + 2, y + 4 + h * 6); f.lineTo(x + 9 + h2 * 5, y + 2); f.lineTo(x + 14, y + 11); f.lineTo(x + 5, y + 14); f.closePath(); f.fill();
        if (h2 < 0.45) { f.strokeStyle = 'rgba(255,208,96,.85)'; f.lineWidth = 1.4; f.beginPath(); f.moveTo(x, y + 12 + h * 5); f.quadraticCurveTo(x + 10, y + 8 + h2 * 6, x + 20, y + 13 + h * 4); f.stroke(); }
      }
    }
  }
}
/* thorns: bramble stems with cream spikes, pointing away from what they grow on */
function bakeThorns(g, rc, tx0, ty0, tx1, ty1) {
  const list = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (tileAt(rc, tx, ty) === 6) list.push(tx, ty);
  if (!list.length) return;
  const solid = (x, y) => { const c = tileAt(rc, x, y); return isSolidCode(c) || c === 4 || c === 5; };
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < list.length; i += 2) {
    const tx = list[i], ty = list[i + 1], x = tx * TILE, y = ty * TILE;
    let dir = 0; if (solid(tx, ty + 1) || tileAt(rc, tx, ty + 1) === 6) dir = 0; else if (solid(tx, ty - 1)) dir = 2; else if (solid(tx - 1, ty)) dir = 1; else if (solid(tx + 1, ty)) dir = 3;
    g.save(); g.translate(x + 10, y + 10); g.rotate(dir * PI / 2); g.translate(-10, -10);
    const ph = (dir & 1 ? ty : tx) * 0.9;
    if (pass === 0) {
      /* stems: two wavy vines along the base */
      for (let k = 0; k < 2; k++) {
        g.beginPath(); for (let xx = -2; xx <= 22; xx += 3) { const yy = 15 - k * 4 + Math.sin(xx * 0.3 + ph * 3 + k * 2) * 2.6; if (xx === -2) g.moveTo(xx, yy); else g.lineTo(xx, yy); }
        g.strokeStyle = INK; g.lineWidth = 4.6; g.stroke(); g.strokeStyle = k ? '#7d9a48' : '#5f7f3a'; g.lineWidth = 2.4; g.stroke();
      }
      if (hash(tx, ty + 3) < 0.3) { g.fillStyle = INK; circle(g, 6 + hash(tx, ty) * 8, 12, 3.2); g.fill(); g.fillStyle = '#a04a7a'; circle(g, 6 + hash(tx, ty) * 8, 12, 2); g.fill(); }
    } else {
      for (let k = 0; k < 3; k++) {
        const sx = 3 + k * 7 + (hash(tx * 3 + k, ty) - 0.5) * 3, base = 13 - (k & 1) * 3 + Math.sin(sx * 0.3 + ph * 3) * 2, hgt = 7 + hash(tx + k, ty * 3) * 5, lean = (hash(ty, tx + k) - 0.5) * 4;
        g.beginPath(); g.moveTo(sx - 3, base); g.lineTo(sx + lean, base - hgt); g.lineTo(sx + 3, base); g.closePath();
        g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke(); g.fillStyle = '#f2e6c4'; g.fill();
        g.fillStyle = '#c9b48e'; g.beginPath(); g.moveTo(sx + 0.5, base); g.lineTo(sx + lean, base - hgt); g.lineTo(sx + 3, base); g.closePath(); g.fill();
      }
    }
    g.restore();
  }
}
/* one-way ledges: root planks, pipe tops, crystal shelves, cloud wisps */
function bakeLedges(g, rc, tx0, ty0, tx1, ty1, A) {
  for (let ty = ty0; ty <= ty1; ty++) {
    let tx = tx0 - 6;
    while (tx <= tx1 + 6) {
      if (tileAt(rc, tx, ty) !== 4) { tx++; continue; }
      const s = tx; while (tileAt(rc, tx, ty) === 4 && tx <= tx1 + 40) tx++;
      ledge(g, A, s * TILE, ty * TILE, (tx - s) * TILE, s, ty, isSolidCode(tileAt(rc, s - 1, ty)), isSolidCode(tileAt(rc, tx, ty)));
    }
  }
}
function ledge(g, A, x, y, w, sx, sy, wl, wr) {
  const k = A.lk, x0 = x - (wl ? 4 : 1), x1 = x + w + (wr ? 4 : 1);
  if (k === 'cloud') {
    const B = []; for (let xx = x + 5; xx <= x + w - 4; xx += 7) B.push([xx, y + 5 + hash(xx, sy) * 2, 5.5 + hash(sy, xx) * 2.5]);
    if (!B.length) B.push([x + w / 2, y + 5, 7]);
    blobs(g, B, '#f4f5ff', 2.2, null); g.fillStyle = '#d4d6f4'; for (const b of B) { g.beginPath(); g.ellipse(b[0], b[1] + b[2] * 0.45, b[2] * 0.8, b[2] * 0.4, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#ffffff'; for (const b of B) { g.beginPath(); g.ellipse(b[0] - b[2] * 0.3, b[1] - b[2] * 0.45, b[2] * 0.4, b[2] * 0.2, 0, 0, TAU); g.fill(); }
    return;
  }
  const th = 9;
  let m = A.root;
  if (k === 'pipe') m = ['#e2b24a', '#a8742a', '#fff0b0'];
  else if (k === 'crys') m = ['#bfe8f6', '#7fb6d4', '#ffffff'];
  else if (k === 'shelf') m = ['#8a6ab8', '#5a4488', '#c8b0f0'];
  g.fillStyle = INK; rr(g, x0 - 2.2, y - 2.2, x1 - x0 + 4.4, th + 4.4, 6.5); g.fill();
  g.fillStyle = m[1]; rr(g, x0, y, x1 - x0, th, 4.5); g.fill();
  g.fillStyle = m[0]; rr(g, x0, y, x1 - x0, th - 2.6, 4); g.fill();
  g.fillStyle = m[2]; rr(g, x0 + 3, y + 1.2, x1 - x0 - 6, 2, 1); g.fill();
  if (k === 'pipe') {
    for (let xx = x + 14; xx < x + w - 6; xx += 40) { g.fillStyle = INK; rr(g, xx - 4, y - 3.5, 8, th + 7, 2.5); g.fill(); g.fillStyle = '#c8902e'; rr(g, xx - 2.6, y - 2, 5.2, th + 4, 1.5); g.fill(); g.fillStyle = '#ffe9a0'; g.fillRect(xx - 1.6, y - 1.4, 1.4, th + 2); }
  } else if (k === 'crys') {
    g.fillStyle = 'rgba(255,255,255,.6)'; for (let xx = x + 4; xx < x + w - 8; xx += 13) { g.beginPath(); g.moveTo(xx, y + th - 3); g.lineTo(xx + 4, y + 1.5); g.lineTo(xx + 7, y + 1.5); g.lineTo(xx + 3, y + th - 3); g.closePath(); g.fill(); }
  } else {
    g.strokeStyle = rgba(m[1], 0.8); g.lineWidth = 1.1; g.beginPath();
    for (let xx = x0 + 5; xx < x1 - 8; xx += 13) { const yy = y + 4 + hash(xx, sy) * 2; g.moveTo(xx, yy); g.lineTo(xx + 6 + hash(sy, xx) * 4, yy); }
    g.stroke();
    if (k === 'shelf') for (let xx = x + 5; xx < x + w - 3; xx += 9) { g.fillStyle = 'rgba(191,246,255,.9)'; circle(g, xx + hash(xx, sy) * 3, y + 3, 1.2); g.fill(); }
    /* pegs where the plank meets a wall */
    if (wl) { g.fillStyle = INK; circle(g, x0 + 3, y + 4.5, 2.6); g.fill(); g.fillStyle = m[2]; circle(g, x0 + 3, y + 4.5, 1.3); g.fill(); }
    if (wr) { g.fillStyle = INK; circle(g, x1 - 3, y + 4.5, 2.6); g.fill(); g.fillStyle = m[2]; circle(g, x1 - 3, y + 4.5, 1.3); g.fill(); }
    if (k === 'mossplank' || k === 'groot') {
      const mc2 = k === 'groot' ? A.top : ['#86d65e', '#459a42', '#cdf7a0'];
      const B = []; for (let xx = x0 + 4; xx < x1 - 3; xx += 6) if (hash(xx, sy + 1) < 0.7) B.push([xx, y + 0.5, 2.6 + hash(sy, xx) * 1.6]);
      if (B.length) blobs(g, B, mc2[0], 1.6, mc2[2]);
    }
  }
}
/* decorations: grass / moss / mushrooms / crystals / bolts / cloud tufts on top edges; roots, stalactites, pipes under ceilings */
function bakeDecor(g, rc, tx0, ty0, tx1, ty1, A) {
  const tk = A.tk, ck = A.ck, airAt = (x, y) => tileAt(rc, x, y) === 0;
  const tops = [], ceils = [], sides = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const c = tileAt(rc, tx, ty); if (c !== 1 && c !== 2 && c !== 3) continue;
    if (airAt(tx, ty - 1)) tops.push(tx, ty);
    if (airAt(tx, ty + 1)) ceils.push(tx, ty);
    if (airAt(tx - 1, ty) && hash(tx * 7, ty + 31) < 0.16) sides.push(tx, ty, -1); else if (airAt(tx + 1, ty) && hash(tx * 7 + 1, ty + 31) < 0.16) sides.push(tx, ty, 1);
  }
  /* ceilings first (they hang behind nothing) */
  for (let i = 0; i < ceils.length; i += 2) {
    const tx = ceils[i], ty = ceils[i + 1], x = tx * TILE, y = (ty + 1) * TILE, h = hash(tx * 13 + 1, ty * 7 + 2), h2 = hash(tx + 99, ty * 3);
    if (ck === 'roots' || ck === 'moss' || ck === 'groots' || ck === 'wisp') {
      if (h < 0.42) {
        const rx = x + 4 + h2 * 12, len = 8 + hash(tx, ty + 50) * 22, cv = (hash(ty, tx + 5) - 0.5) * 12;
        g.beginPath(); g.moveTo(rx, y - 3); g.bezierCurveTo(rx + cv, y + len * 0.4, rx - cv, y + len * 0.7, rx + cv * 0.5, y + len);
        g.strokeStyle = INK; g.lineWidth = 4.4; g.stroke(); g.strokeStyle = ck === 'moss' ? '#6aa84a' : A.root[2]; g.lineWidth = 2.2; g.stroke();
        if (ck === 'groots' && h2 < 0.5) { g.fillStyle = INK; circle(g, rx + cv * 0.5, y + len, 2.8); g.fill(); g.fillStyle = '#ffd060'; circle(g, rx + cv * 0.5, y + len, 1.7); g.fill(); }
        if (ck === 'moss' && h2 < 0.5) leaf(g, rx + cv * 0.5, y + len, PI / 2 + (h - 0.2), 7, M3.LEAF, 1.6);
      } else if (ck === 'moss' && h < 0.7) {
        const B = [[x + 6 + h2 * 6, y + 1, 4], [x + 12 + h2 * 4, y + 2, 3]]; blobs(g, B, '#6cbc52', 1.8, null);
      } else if (ck === 'wisp' && h < 0.62) {
        blobs(g, [[x + 8, y + 1, 4.5], [x + 13, y + 2, 3.5]], '#f4f5ff', 1.8, null);
      }
    } else if (ck === 'stal' || ck === 'crys') {
      if (h < 0.45) {
        const sx = x + 4 + h2 * 12, len = 5 + hash(tx, ty + 50) * 8, wd = 3.5 + h * 3;
        const col = ck === 'crys' ? '#c4eef8' : A.earth[1], tip = Math.max(2.2, wd * 0.55);
        g.beginPath(); g.moveTo(sx - wd, y - 2); g.bezierCurveTo(sx - wd, y + len * 0.5, sx - tip, y + len - tip, sx, y + len); g.bezierCurveTo(sx + tip, y + len - tip, sx + wd, y + len * 0.5, sx + wd, y - 2); g.closePath();
        g.strokeStyle = INK; g.lineWidth = 2.2; g.stroke(); g.fillStyle = col; g.fill();
        g.fillStyle = ck === 'crys' ? 'rgba(255,255,255,.75)' : rgba(A.earth[2], 0.5); g.beginPath(); g.ellipse(sx - wd * 0.35, y + len * 0.3, wd * 0.25, len * 0.3, 0, 0, TAU); g.fill();
        if (ck === 'stal' && h2 < 0.5) { g.fillStyle = 'rgba(191,246,255,.95)'; circle(g, sx, y + len + 2.5, 1.5); g.fill(); }
      }
    } else if (ck === 'pipe') {
      if (h < 0.2) {
        const px = x + 6 + h2 * 6, len = 10 + hash(tx, ty + 9) * 12;
        g.fillStyle = INK; rr(g, px - 4.2, y - 3, 8.4, len + 3, 2); g.fill(); g.fillStyle = '#b87040'; rr(g, px - 2.4, y - 2, 4.8, len + 0.5, 1.5); g.fill(); g.fillStyle = '#f0b07a'; g.fillRect(px - 1.6, y - 2, 1.2, len);
        g.fillStyle = INK; rr(g, px - 5.5, y + len - 4, 11, 6, 2); g.fill(); g.fillStyle = '#e2b24a'; rr(g, px - 4, y + len - 2.8, 8, 3.6, 1.5); g.fill();
      } else if (h < 0.4) { g.fillStyle = INK; circle(g, x + 6 + h2 * 8, y - 3, 2.6); g.fill(); g.fillStyle = '#e2b24a'; circle(g, x + 6 + h2 * 8, y - 3, 1.5); g.fill(); }
    }
  }
  /* sides: little moss pads, glowing dots */
  for (let i = 0; i < sides.length; i += 3) {
    const tx = sides[i], ty = sides[i + 1], d = sides[i + 2], x = tx * TILE + (d > 0 ? TILE : 0), y = ty * TILE + 10;
    if (tk === 'moss' || tk === 'grass') blobs(g, [[x, y - 2, 3.2], [x + d, y + 3, 2.6]], tk === 'moss' ? '#7ccc58' : '#8cc458', 1.6, null);
    else if (tk === 'glow') { g.fillStyle = 'rgba(143,232,255,.9)'; circle(g, x - d * 2, y, 1.6); g.fill(); circle(g, x - d * 4, y + 5, 1.1); g.fill(); }
    else if (tk === 'crystal') { g.fillStyle = 'rgba(200,250,255,.85)'; circle(g, x - d * 2, y, 1.4); g.fill(); circle(g, x - d * 3, y + 6, 1); g.fill(); }
  }
  /* tops */
  const bare = (tx, ty) => tileAt(rc, tx, ty) === 3 && (A.sk === 'metal' || A.sk === 'crystal' || A.sk === 'amethyst');
  if (tk === 'grass' || tk === 'rust' || tk === 'fluff') {
    /* grass blades: all in one ink pass and one fill pass */
    const P = new Path2D(); let any = false;
    for (let i = 0; i < tops.length; i += 2) {
      const tx = tops[i], ty = tops[i + 1], x = tx * TILE, y = ty * TILE; if ((tk === 'rust' && hash(tx, ty + 5) < 0.45) || bare(tx, ty)) continue;
      const n = tk === 'grass' ? 3 + Math.floor(hash(tx, ty) * 3) : 2 + Math.floor(hash(tx, ty) * 2);
      for (let k = 0; k < n; k++) { const bx = x + 1.5 + (k + hash(tx * 5 + k, ty)) * (17 / n), hh = 3 + hash(tx + k * 3, ty + 1) * (tk === 'grass' ? 4.5 : 3), lean = (hash(ty + k, tx) - 0.5) * 6; P.moveTo(bx, y + 1.5); P.quadraticCurveTo(bx + lean * 0.2, y - hh * 0.6, bx + lean, y - hh); any = true; }
    }
    if (any) { g.strokeStyle = INK; g.lineWidth = 4.6; g.stroke(P); g.strokeStyle = A.top[1]; g.lineWidth = 2.4; g.stroke(P); g.strokeStyle = A.top[0]; g.lineWidth = 1.3; g.stroke(P); }
  }
  for (let i = 0; i < tops.length; i += 2) {
    const tx = tops[i], ty = tops[i + 1], x = tx * TILE, y = ty * TILE, h = hash(tx * 11 + 3, ty * 13 + 5), h2 = hash(tx + 51, ty + 17);
    if ((tk === 'moss' || tk === 'glow' || tk === 'gold' || tk === 'fluff' || tk === 'crystal') && !bare(tx, ty)) {
      const col = tk === 'fluff' ? ['#ffffff', '#d4d6f4', '#ffffff'] : A.top;
      const B = []; for (let k = 0; k < 4; k++) { const bx = x + 2.5 + k * 5 + (hash(tx * 4 + k, ty) - 0.5) * 2; if ((tk === 'fluff' || tk === 'crystal') && hash(tx + k, ty * 2) < 0.4) continue; B.push([bx, y + 1 + hash(tx, ty + k) * 1.2, (tk === 'moss' ? 3.4 : tk === 'fluff' ? 3.4 : 2.6) + hash(tx + k, ty + 2) * 1.6]); }
      if (B.length) blobs(g, B, col[0], 1.8, col[2]);
      if (tk === 'moss' && airAt(tx - 1, ty) && h < 0.6) blobs(g, [[x + 1, y + 5, 2.8], [x, y + 9, 2]], col[0], 1.6, null);
      if (tk === 'moss' && airAt(tx + 1, ty) && h2 < 0.6) blobs(g, [[x + 19, y + 5, 2.8], [x + 20, y + 9, 2]], col[0], 1.6, null);
    }
    /* features */
    if ((tk === 'moss') && h < 0.11) fern(g, x + 10, y + 1, h2 < 0.5 ? -1 : 1, 13 + h2 * 6);
    else if ((tk === 'grass' || tk === 'moss' || tk === 'fluff') && h < 0.2) miniFlower(g, x + 4 + h2 * 12, y, A.fl[Math.floor(h2 * 37) % A.fl.length], 5 + h * 20);
    if (tk === 'glow' && h2 < 0.2) glowShroom(g, x + 4 + h * 12, y + 1, 4 + h * 3, ['#8fe8ff', '#ff9ad8', '#c8a8ff'][Math.floor(h * 31) % 3]);
    if (tk === 'crystal' && h2 < 0.16) crystals(g, x + 10, y + 1, 0.7 + h * 0.5, h);
    if (tk === 'rust' && h2 < 0.16 && tileAt(rc, tx, ty) === 3) { g.fillStyle = INK; rr(g, x + 5, y - 5, 10, 6, 2); g.fill(); g.fillStyle = '#e2b24a'; rr(g, x + 6.5, y - 4, 7, 3.6, 1.5); g.fill(); g.fillStyle = '#fff0b0'; g.fillRect(x + 7.5, y - 3.5, 4, 1); }
    else if (tk === 'rust' && h2 < 0.08) { g.fillStyle = INK; circle(g, x + 10, y - 3, 4.4); g.fill(); g.fillStyle = '#9aa0b0'; circle(g, x + 10, y - 3, 3); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 8, y - 3); g.lineTo(x + 12, y - 3); g.stroke(); }
    if (tk === 'gold' && h < 0.3) { g.fillStyle = INK; circle(g, x + 4 + h2 * 12, y - 2, 2.4); g.fill(); g.fillStyle = '#ffd060'; circle(g, x + 4 + h2 * 12, y - 2, 1.5); g.fill(); }
    if (h > 0.93 && tk !== 'fluff') { const px = x + 5 + h2 * 10; g.fillStyle = INK; g.beginPath(); g.ellipse(px, y - 1.5, 4.2, 3.2, 0, 0, TAU); g.fill(); g.fillStyle = A.stone[0]; g.beginPath(); g.ellipse(px, y - 1.8, 2.8, 2, 0, 0, TAU); g.fill(); g.fillStyle = A.stone[2]; g.beginPath(); g.ellipse(px - 0.8, y - 2.6, 1.2, 0.7, 0, 0, TAU); g.fill(); }
  }
}
function fern(g, x, y, d, L) {
  g.save(); g.translate(x, y); g.scale(d, 1);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(2, -L * 0.7, 8, -L); g.strokeStyle = INK; g.lineWidth = 3.4; g.stroke(); g.strokeStyle = '#4a9a42'; g.lineWidth = 1.6; g.stroke();
  for (let k = 1; k < 6; k++) { const t = k / 6, px = 2 * 2 * t * (1 - t) + 8 * t * t, py = -L * 0.7 * 2 * t * (1 - t) - L * t * t, s = 6 * (1 - t * 0.6);
    leaf(g, px, py, -PI / 2 - 0.9, s, M3.LEAF, 1.3); leaf(g, px, py, -PI / 2 + 0.7, s * 0.9, M3.LEAF, 1.3); }
  g.restore();
}
function miniFlower(g, x, y, col, hgt) {
  hgt = Math.min(hgt, 9);
  g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x, y - hgt); g.stroke(); g.strokeStyle = '#5fa840'; g.lineWidth = 1.2; g.stroke();
  g.fillStyle = INK; circle(g, x, y - hgt, 3.6); g.fill();
  g.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p * TAU / 5; circle(g, x + Math.cos(a) * 1.7, y - hgt + Math.sin(a) * 1.7, 1.5); g.fill(); }
  g.fillStyle = '#ffd93b'; circle(g, x, y - hgt, 1); g.fill();
}
function glowShroom(g, x, y, s, col) {
  g.fillStyle = rgba(col, 0.25); circle(g, x, y - s * 1.4, s * 2.4); g.fill();
  g.fillStyle = INK; rr(g, x - s * 0.36 - 1.2, y - s * 1.3, s * 0.72 + 2.4, s * 1.3 + 1, 2); g.fill();
  g.fillStyle = '#e8f0ff'; rr(g, x - s * 0.36, y - s * 1.3, s * 0.72, s * 1.3, 1.5); g.fill();
  g.fillStyle = INK; g.beginPath(); g.ellipse(x, y - s * 1.3, s + 1.3, s * 0.75 + 1.3, 0, PI, TAU); g.closePath(); g.fill();
  g.fillStyle = col; g.beginPath(); g.ellipse(x, y - s * 1.3, s, s * 0.75, 0, PI, TAU); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; circle(g, x - s * 0.35, y - s * 1.65, s * 0.18); g.fill(); circle(g, x + s * 0.3, y - s * 1.5, s * 0.13); g.fill();
}
function crystals(g, x, y, s, h) {
  const sh = [[-4, 7, -0.3, 3.2], [1, 10, 0.05, 3.8], [5, 6, 0.38, 3]];
  for (const [dx, L, a, w] of sh) {
    g.save(); g.translate(x + dx * s, y + 1); g.rotate(a); const l = L * s, ww = w * s;
    g.beginPath(); g.moveTo(-ww, 0); g.lineTo(-ww, -l * 0.72); g.quadraticCurveTo(-ww, -l, 0, -l); g.quadraticCurveTo(ww, -l, ww, -l * 0.72); g.lineTo(ww, 0); g.closePath();
    g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = h < 0.5 ? '#bfeaf8' : '#d8ccff'; g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.moveTo(-ww * 0.6, -1); g.lineTo(-ww * 0.6, -l * 0.7); g.lineTo(0, -l * 0.9); g.lineTo(0, -1); g.closePath(); g.fill();
    g.restore();
  }
}
function bakeChunk(rc, kx, ky) {
  const W = CHW + CPAD * 2, H = CHH + CPAD * 2, pw = Math.ceil(W * BS), ph = Math.ceil(H * BS);
  const c = canvas(pw, ph), g = c.getContext('2d');
  const ox = kx * CHW - CPAD, oy = ky * CHH - CPAD, T = [BS, 0, 0, BS, -ox * BS, -oy * BS];
  g.setTransform(T[0], 0, 0, T[3], T[4], T[5]); g.lineJoin = 'round'; g.lineCap = 'round';
  const tx0 = Math.floor(ox / TILE) - 2, ty0 = Math.floor(oy / TILE) - 2, tx1 = Math.floor((ox + W) / TILE) + 2, ty1 = Math.floor((oy + H) / TILE) + 2;
  ensureTmp(pw, ph);
  const A = rc.A;
  const Ps = [layerPath(rc, 0, tx0, ty0, tx1, ty1), layerPath(rc, 1, tx0, ty0, tx1, ty1), layerPath(rc, 2, tx0, ty0, tx1, ty1)];
  /* a soft dark halo where the terrain meets the backdrop */
  if (!LOW) { const halo = new Path2D(); let any = false; for (const P of Ps) if (P) { halo.addPath(P); any = true; } if (any) { g.strokeStyle = 'rgba(16,10,30,.12)'; g.lineWidth = 26; g.stroke(halo); g.lineWidth = 14; g.stroke(halo); } }
  for (let L = 0; L < 3; L++) if (Ps[L]) paintLayer(g, rc, L, Ps[L], tx0, ty0, tx1, ty1, T, pw, ph, A);
  bakeThorns(g, rc, tx0, ty0, tx1, ty1);
  bakeLedges(g, rc, tx0, ty0, tx1, ty1, A);
  bakeDecor(g, rc, tx0, ty0, tx1, ty1, A);
  c.kx = kx; c.ky = ky;
  return c;
}
let bakeMs = 0, bakeN = 0, bakesThisFrame = 0;
function chunk(kx, ky, peek) {
  const key = RC.serial * 1e6 + (kx + 500) * 1000 + (ky + 500);
  let c = CHUNKS.get(key);
  if (c) { if (!peek) { CHUNKS.delete(key); CHUNKS.set(key, c); } return c; }
  if (peek) return null;
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  c = bakeChunk(RC, kx, ky); CHUNKS.set(key, c); RC.baked++; bakesThisFrame++;
  bakeMs += (typeof performance !== 'undefined' ? performance.now() : 0) - t0; bakeN++;
  while (CHUNKS.size > chMax()) { const k = CHUNKS.keys().next().value; recycle(CHUNKS.get(k)); CHUNKS.delete(k); }
  return c;
}
function dropChunks(serial, kx0, ky0, kx1, ky1) {
  for (const k of Array.from(CHUNKS.keys())) { const s = Math.floor(k / 1e6), kx = Math.floor((k % 1e6) / 1000) - 500, ky = k % 1000 - 500; if (s === serial && (kx0 == null || (kx >= kx0 && kx <= kx1 && ky >= ky0 && ky <= ky1))) { recycle(CHUNKS.get(k)); CHUNKS.delete(k); } }
}

/* =====================================================================================================================
   THE ROOM CACHE: what render needs to know about the current room, built once per room
   ===================================================================================================================== */
const SIGS = new Map();
function room(sim) {
  const r = sim && sim.room; if (!r || !r.t) return;
  const A = areaOf(r.area);
  let serial = SERIAL.get(r.id), sig = SIGS.get(r.id);
  let same = !!sig && sig.length === r.t.length; if (same) for (let i = 0; i < sig.length; i++) if (sig[i] !== r.t[i]) { same = false; break; }
  if (!same || serial == null) { if (serial != null) dropChunks(serial); serial = ++serialN; SERIAL.set(r.id, serial); sig = new Uint8Array(r.t); SIGS.set(r.id, sig); }
  const rc = RC = { room: r, id: r.id, area: r.area, A, w: r.w, h: r.h, t: sig, serial, baked: 0, crumbles: [], briars: [], currents: [], surf: [], water: null, wbox: null, lights: [] };
  rc.depth = depthMap(rc);
  const w = r.w, h = r.h, wp = new Path2D(); let anyW = false, wx0 = 1e9, wy0 = 1e9, wx1 = -1e9, wy1 = -1e9;
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const c = sig[y * w + x];
      if (c === 5) rc.crumbles.push(y * w + x);
      else if (c === 11) rc.briars.push(y * w + x);
      if (c === 8 || c === 9) rc.currents.push(x, y, c === 8 ? -1 : 1);
      if (c === 7 || c === 8 || c === 9) {
        const s = x; x++;
        while (x < w && (sig[y * w + x] === 7 || sig[y * w + x] === 8 || sig[y * w + x] === 9)) { const cc = sig[y * w + x]; if (cc === 8 || cc === 9) rc.currents.push(x, y, cc === 8 ? -1 : 1); x++; }
        const surf = y === 0 ? false : (() => { for (let k = s; k < x; k++) { const a = sig[(y - 1) * w + k]; if (a !== 7 && a !== 8 && a !== 9) return true; } return false; })();
        const top = y * TILE + (surf ? 3 : 0);
        wp.rect(s * TILE, top, (x - s) * TILE, (y + 1) * TILE - top); anyW = true;
        if (surf) rc.surf.push(s * TILE, (x - s) * TILE, y * TILE);
        wx0 = Math.min(wx0, s * TILE); wx1 = Math.max(wx1, x * TILE); wy0 = Math.min(wy0, y * TILE); wy1 = Math.max(wy1, (y + 1) * TILE);
        continue;
      }
      x++;
    }
  }
  if (anyW) { rc.water = wp; rc.wbox = [wx0, wy0, wx1, wy1]; }
  /* static lights: crystals and glow-rock, glowing mushrooms on ledges, the heart's gold veins */
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = sig[y * w + x], air = y > 0 && sig[(y - 1) * w + x] === 0, airB = y < h - 1 && sig[(y + 1) * w + x] === 0;
    if (c === 3 && (air || airB) && hash(x * 3, y * 5 + 1) < (r.area === 'crystal' ? 0.5 : 0.3) && (r.area === 'crystal' || r.area === 'glowcap' || r.area === 'heart'))
      rc.lights.push(x * TILE + 10, y * TILE + (air ? 4 : 16), r.area === 'crystal' ? 62 : 48, r.area === 'crystal' ? 'cyan' : r.area === 'heart' ? 'gold' : 'cool', 0.75);
    if ((c === 1 || c === 2 || c === 3) && air && A.tk === 'glow' && hash(x + 51, y + 17) < 0.2) { const hh = hash(x * 11 + 3, y * 13 + 5), col = ['cyan', 'pink', 'violet'][Math.floor(hh * 31) % 3]; rc.lights.push(x * TILE + 4 + hh * 12, y * TILE - 6, 46, col, 0.8); }
    if ((c === 1 || c === 2 || c === 3) && air && A.tk === 'crystal' && hash(x + 51, y + 17) < 0.16) rc.lights.push(x * TILE + 10, y * TILE - 6, 44, 'cyan', 0.7);
    if ((c === 1 || c === 2 || c === 3) && air && A.tk === 'gold' && hash(x * 11 + 3, y * 13 + 5) < 0.3) rc.lights.push(x * TILE + 10, y * TILE - 2, 26, 'gold', 0.6);
  }
  bgFor(r.area);
  clearParts(); ambT = 0;
}
function checkTiles() {
  const rc = RC, r = rc && rc.room; if (!r || r.t.length !== rc.t.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < r.t.length; i++) if (r.t[i] !== rc.t[i]) { rc.t[i] = r.t[i]; const x = i % rc.w, y = (i / rc.w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return;
  rc.depth = depthMap(rc);
  dropChunks(rc.serial, Math.floor((x0 - 5) * TILE / CHW), Math.floor((y0 - 5) * TILE / CHH), Math.floor((x1 + 5) * TILE / CHW), Math.floor((y1 + 5) * TILE / CHH));
  rc.crumbles = rc.crumbles.filter(i => rc.t[i] === 5); rc.briars = rc.briars.filter(i => rc.t[i] === 11);
}

/* ---------- live terrain: crumbling ledges, shadow briars, breakable root walls ---------- */
const LIVE = new Map();
function liveSprite(key, w, h, fn) { let c = LIVE.get(key); if (!c) { c = sprite(w, h, fn); LIVE.set(key, c); if (LIVE.size > 80) LIVE.delete(LIVE.keys().next().value); } return c; }
function crumbleImg(A, v) {
  return liveSprite('cr|' + A.earth[0] + v, 24, 16, g => {
    g.translate(2, 2); const m = A.earth;
    g.fillStyle = INK; rr(g, -1.8, -1.8, 23.6, 13.6, 4.5); g.fill();
    g.fillStyle = m[1]; rr(g, 0, 0, 20, 10, 3.2); g.fill(); g.fillStyle = m[0]; rr(g, 0, 0, 20, 7.6, 3); g.fill(); g.fillStyle = m[2]; rr(g, 2.5, 1, 15, 1.8, 0.9); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.3; g.beginPath();
    if (v) { g.moveTo(7, 0); g.lineTo(9, 4); g.lineTo(7.5, 10); g.moveTo(9, 4); g.lineTo(13, 6); } else { g.moveTo(12, 0); g.lineTo(10.5, 5); g.lineTo(13, 10); g.moveTo(10.5, 5); g.lineTo(6, 7); }
    g.stroke();
    g.fillStyle = A.speck[0]; circle(g, v ? 15 : 4, 5, 1.4); g.fill();
  });
}
function briarImg(v) {
  return liveSprite('br' + v, 30, 30, g => {
    g.translate(15, 15);
    g.fillStyle = 'rgba(90,40,140,.22)'; circle(g, 0, 0, 14); g.fill();
    const rnd = k => hash(v * 31 + k, 17);
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < 5; k++) {
      const a = rnd(k) * TAU, b = a + 2 + rnd(k + 9) * 1.6, r0 = 10 + rnd(k + 3) * 3;
      g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.bezierCurveTo(Math.cos(a + 1.4) * 4, Math.sin(a + 1.4) * 4, Math.cos(b - 1.4) * 4, Math.sin(b - 1.4) * 4, Math.cos(b) * r0, Math.sin(b) * r0);
      if (pass === 0) { g.strokeStyle = INK; g.lineWidth = 4.8; g.stroke(); }
      else { g.strokeStyle = k & 1 ? '#4a3460' : '#3a2850'; g.lineWidth = 2.6; g.stroke(); }
    }
    for (let k = 0; k < 9; k++) {
      const a = rnd(k + 20) * TAU, d = 4 + rnd(k + 30) * 8, x = Math.cos(a) * d, y = Math.sin(a) * d, aa = a + (rnd(k + 40) - 0.5);
      g.beginPath(); g.moveTo(x + Math.cos(aa + 1.6) * 2, y + Math.sin(aa + 1.6) * 2); g.lineTo(x + Math.cos(aa) * 6, y + Math.sin(aa) * 6); g.lineTo(x + Math.cos(aa - 1.6) * 2, y + Math.sin(aa - 1.6) * 2); g.closePath();
      g.strokeStyle = INK; g.lineWidth = 1.6; g.stroke(); g.fillStyle = '#b9a2e0'; g.fill();
    }
    g.fillStyle = 'rgba(200,170,255,.55)'; circle(g, -3, -4, 1.4); g.fill(); circle(g, 4, 3, 1); g.fill();
  });
}
function breakImg(A, w, h, dmg) {
  return liveSprite('bk|' + A.earth[0] + '|' + w + 'x' + h + '|' + dmg, w + 8, h + 8, g => {
    g.translate(4, 4);
    const m = [mix(A.earth[0], A.root[0], 0.25), mix(A.earth[1], A.root[1], 0.25), mix(A.earth[2], A.root[2], 0.2)];
    g.fillStyle = INK; rr(g, -2.3, -2.3, w + 4.6, h + 4.6, 7); g.fill();
    g.fillStyle = m[1]; rr(g, 0, 0, w, h, 5); g.fill(); g.fillStyle = m[0]; rr(g, 0, 0, w, h - 4, 5); g.fill();
    g.save(); rr(g, 0, 0, w, h, 5); g.clip();
    for (let i = 0; i < w * h / 160; i++) { const px = hash(i, w) * w, py = hash(h, i) * h; g.fillStyle = A.speck[0]; g.beginPath(); g.ellipse(px, py, 2, 1.5, 0, 0, TAU); g.fill(); }
    /* root strands woven through it */
    for (let k = 0; k < Math.max(2, h / 14); k++) { const y = 6 + k * 14 + hash(k, 3) * 4; g.beginPath(); g.moveTo(-4, y); g.bezierCurveTo(w * 0.3, y + 7, w * 0.6, y - 7, w + 4, y + 3); g.strokeStyle = INK; g.lineWidth = 4.2; g.stroke(); g.strokeStyle = A.root[0]; g.lineWidth = 2.4; g.stroke(); g.strokeStyle = rgba(A.root[2], 0.7); g.lineWidth = 0.8; g.stroke(); }
    /* cracks: a hairline hint at first, then wider */
    g.strokeStyle = INK; g.lineWidth = 1 + dmg * 0.8; g.beginPath();
    const n = 1 + dmg * 2;
    for (let k = 0; k < n; k++) { const sx = w * (0.3 + 0.4 * hash(k, 7)), sy = h * (0.2 + 0.6 * hash(k, 8)), L = 6 + dmg * 5; g.moveTo(sx, sy); g.lineTo(sx + L * 0.4, sy + L * 0.5); g.lineTo(sx + L * 0.1, sy + L); g.moveTo(sx + L * 0.4, sy + L * 0.5); g.lineTo(sx + L, sy + L * 0.4); }
    g.stroke();
    if (dmg) { g.fillStyle = INK; for (let k = 0; k < dmg * 2; k++) { g.beginPath(); g.ellipse(w * hash(k, 9), h * hash(k, 10), 1.6 + dmg * 0.6, 1.2 + dmg * 0.5, 0.4, 0, TAU); g.fill(); } }
    g.restore();
    g.fillStyle = m[2]; rr(g, 4, 1.6, w - 8, 2.2, 1.1); g.fill();
  });
}

/* =====================================================================================================================
   BACKGROUNDS: per area a non-scrolling base (gradient, soft glows) and two torus-seamless parallax layers
   ===================================================================================================================== */
const BG = new Map();
function wrapAt(W, H, x, y, rad, fn) {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const xx = x + dx * W, yy = y + dy * H;
    if (xx + rad < 0 || xx - rad > W || yy + rad < 0 || yy - rad > H) continue;
    fn(xx, yy);
  }
}
function vroot(g, W, H, x, w, k, amp, ph, col, edge) {
  for (const dx of [-W, 0, W]) {
    if (x + dx + w + amp < -10 || x + dx - w - amp > W + 10) continue;
    g.beginPath();
    for (let y = -20; y <= H + 20; y += 10) { const xx = x + dx + Math.sin(y * TAU / H * k + ph) * amp - w / 2 * (1 + 0.25 * Math.sin(y * TAU / H * 2 + ph * 2)); if (y === -20) g.moveTo(xx, y); else g.lineTo(xx, y); }
    for (let y = H + 20; y >= -20; y -= 10) { const xx = x + dx + Math.sin(y * TAU / H * k + ph) * amp + w / 2 * (1 + 0.25 * Math.sin(y * TAU / H * 2 + ph * 2)); g.lineTo(xx, y); }
    g.closePath(); g.fillStyle = col; g.fill();
    if (edge) { g.strokeStyle = edge; g.lineWidth = 2; g.stroke(); }
  }
}
function softGlow(g, x, y, r, col, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
function puff(g, x, y, s, col, sh, ink) {
  const B = [[x - s, y + s * 0.15, s * 0.75], [x, y - s * 0.25, s], [x + s * 1.05, y + s * 0.1, s * 0.8], [x + s * 0.45, y + s * 0.35, s * 0.7], [x - s * 0.5, y + s * 0.4, s * 0.65]];
  if (ink) { g.fillStyle = ink; for (const b of B) { circle(g, b[0], b[1], b[2] + 2); g.fill(); } }
  g.fillStyle = col; for (const b of B) { circle(g, b[0], b[1], b[2]); g.fill(); }
  if (sh) { g.fillStyle = sh; g.beginPath(); g.ellipse(x + s * 0.1, y + s * 0.55, s * 1.6, s * 0.35, 0, 0, TAU); g.fill(); }
}
function bgFor(area) {
  const key = area + '|' + BGS; let B = BG.get(key); if (B) return B;
  const A = areaOf(area), W = VW, H = VH, rnd = (i, k) => hash(i * 13 + area.length * 7, k * 7 + area.charCodeAt(0));
  B = {};
  /* base */
  B.base = sprite(W, H, g => {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, A.bg[0]); gr.addColorStop(1, A.bg[1]); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (area === 'cloud') { softGlow(g, W * 0.78, H * 0.18, 220, '#fffbe0', 0.85); softGlow(g, W * 0.2, H * 0.9, 260, '#ffffff', 0.5); }
    else if (area === 'heart') { softGlow(g, W * 0.5, H * 0.45, 300, '#ffb050', 0.22); softGlow(g, W * 0.5, H * 0.5, 140, '#ffd070', 0.18); }
    else if (area === 'glowcap') { softGlow(g, W * 0.3, H * 0.7, 220, '#4a6aff', 0.16); softGlow(g, W * 0.8, H * 0.3, 200, '#c060ff', 0.12); }
    else if (area === 'crystal') { softGlow(g, W * 0.6, H * 0.35, 260, '#40e0e0', 0.16); }
    else if (area === 'mossy') { softGlow(g, W * 0.4, H * 0.1, 260, '#c8ff90', 0.12); }
    else if (area === 'pipes') { softGlow(g, W * 0.5, H * 0.8, 260, '#ff8040', 0.13); }
    else softGlow(g, W * 0.5, H * 0.3, 260, '#ffb070', 0.14);
  }, Math.min(1, BGS));
  /* far layer */
  B.l1 = sprite(W, H, g => {
    const far = A.far, edge = rgba(tint(far, 0.18), 0.6);
    if (area === 'cloud') {
      for (let i = 0; i < 9; i++) wrapAt(W, H, rnd(i, 1) * W, rnd(i, 2) * H, 90, (x, y) => puff(g, x, y, 22 + rnd(i, 3) * 26, 'rgba(255,255,255,.55)', null, null));
      for (let i = 0; i < 4; i++) wrapAt(W, H, rnd(i, 4) * W, rnd(i, 5) * H, 80, (x, y) => { g.fillStyle = '#c4c8ec'; g.beginPath(); g.ellipse(x, y, 46, 12, 0, 0, PI); g.fill(); g.beginPath(); g.moveTo(x - 40, y); g.quadraticCurveTo(x, y + 50, x + 40, y); g.fill(); puff(g, x, y - 6, 16, '#dfe2fa', null, null); g.strokeStyle = '#b8b0d8'; g.lineWidth = 2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(x + k * 9, y + 16); g.quadraticCurveTo(x + k * 9 + 5, y + 40, x + k * 8, y + 56 + rnd(i, k + 9) * 20); g.stroke(); } });
      return;
    }
    if (area === 'pipes') {
      for (let i = 0; i < 3; i++) wrapAt(W, H, rnd(i, 9) * W, rnd(i, 10) * H, 80, (x, y) => gearShape(g, x, y, 34 + rnd(i, 11) * 30, 10 + (i % 3) * 2, shade(far, 0.12), edge));
      const cyl = [far, shade(far, 0.25), tint(far, 0.12)];
      for (let i = 0; i < 4; i++) { const y = (i + 0.3 + rnd(i, 1) * 0.4) * H / 4, th = 12 + rnd(i, 2) * 12; hpipe(g, -4, W + 4, y, th, cyl, null, rnd(i, 3) * W, 4); }
      for (let i = 0; i < 4; i++) { const x = (i + rnd(i, 7)) * W / 4, th = 10 + rnd(i, 8) * 14; vpipe(g, x, -4, H + 4, th, cyl, null, rnd(i, 5) * H, 3); }
      return;
    }
    /* caves: far root / rock columns */
    for (let i = 0; i < 6; i++) vroot(g, W, H, (i + rnd(i, 1) * 0.6) * W / 6, 26 + rnd(i, 2) * 34, 1 + (i % 2), 10 + rnd(i, 3) * 16, rnd(i, 4) * TAU, far, edge);
    if (area === 'glowcap' || area === 'heart' || area === 'crystal') {
      const cols = area === 'glowcap' ? ['#8fe8ff', '#ff9ad8', '#c8a8ff'] : area === 'heart' ? ['#ffd070', '#ffb0e0'] : ['#a0f2ff', '#e0d0ff'];
      for (let i = 0; i < 40; i++) { const x = rnd(i, 20) * W, y = rnd(i, 21) * H, c = cols[i % cols.length], r = 0.6 + rnd(i, 22) * 1.1; g.fillStyle = rgba(c, 0.14); circle(g, x, y, r * 3.2); g.fill(); g.fillStyle = rgba(c, 0.7); circle(g, x, y, r); g.fill(); }
    }
    if (area === 'crystal') for (let i = 0; i < 6; i++) wrapAt(W, H, rnd(i, 30) * W, rnd(i, 31) * H, 70, (x, y) => spire(g, x, y, 14 + rnd(i, 32) * 14, 60 + rnd(i, 33) * 60, rgba('#7fc0d8', 0.35), rgba('#ffffff', 0.25)));
    if (area === 'rootgate') for (let i = 0; i < 5; i++) wrapAt(W, H, rnd(i, 40) * W, rnd(i, 41) * H, 40, (x, y) => softGlow(g, x, y, 30, '#ffb060', 0.22));
    if (area === 'mossy') for (let i = 0; i < 7; i++) wrapAt(W, H, rnd(i, 50) * W, rnd(i, 51) * H, 40, (x, y) => { g.fillStyle = rgba('#2c5a40', 0.8); for (let k = 0; k < 5; k++) { g.save(); g.translate(x, y); g.rotate(-PI / 2 + (k - 2) * 0.45); leafPath(g, 26 + rnd(i, k) * 12, 9); g.restore(); g.fill(); } });
  }, BGS);
  /* mid layer */
  B.l2 = sprite(W, H, g => {
    const mid = A.mid, ink = 'rgba(20,12,34,.45)', edge = rgba(tint(mid, 0.28), 0.7);
    if (area === 'cloud') {
      for (let i = 0; i < 3; i++) vroot(g, W, H, (i + 0.2 + rnd(i, 1) * 0.6) * W / 3, 10 + rnd(i, 2) * 10, 1, 14, rnd(i, 3) * TAU, '#a89078', 'rgba(90,60,50,.35)');
      for (let i = 0; i < 6; i++) wrapAt(W, H, rnd(i, 5) * W, rnd(i, 6) * H, 90, (x, y) => puff(g, x, y, 18 + rnd(i, 7) * 18, '#ffffff', 'rgba(200,200,236,.6)', 'rgba(150,150,200,.35)'));
      return;
    }
    if (area === 'pipes') {
      const cyl = ['#5e3e30', '#3e281f', '#86604a'];
      for (let i = 0; i < 2; i++) { const y = (i + 0.5) * H / 2 + (rnd(i, 1) - 0.5) * 60; hpipe(g, -4, W + 4, y, 16, cyl, ink, rnd(i, 4) * W, 3); }
      for (let i = 0; i < 3; i++) { const x = (i + 0.3 + rnd(i, 9) * 0.4) * W / 3; vpipe(g, x, -4, H + 4, 14, cyl, ink, rnd(i, 6) * H, 2); }
      for (let i = 0; i < 2; i++) wrapAt(W, H, rnd(i, 12) * W, rnd(i, 13) * H, 40, (x, y) => valve(g, x, y, 16));
      return;
    }
    if (area === 'glowcap') {
      for (let i = 0; i < 4; i++) wrapAt(W, H, (i + rnd(i, 1)) * W / 4, rnd(i, 2) * H, 110, (x, y) => bigShroom(g, x, y, 34 + rnd(i, 3) * 30, ['#8fe8ff', '#ff9ad8', '#c8a8ff'][i % 3], mid));
      return;
    }
    if (area === 'crystal') {
      for (let i = 0; i < 5; i++) wrapAt(W, H, rnd(i, 1) * W, rnd(i, 2) * H, 70, (x, y) => { for (let k = 0; k < 3; k++) spire(g, x + (k - 1) * 14, y + Math.abs(k - 1) * 8, 9 + rnd(i, k) * 6, 40 + rnd(i, k + 4) * 40, rgba('#5aa8c8', 0.55), rgba('#e8ffff', 0.45)); });
      for (let i = 0; i < 3; i++) vroot(g, W, H, (i + rnd(i, 5)) * W / 3, 18 + rnd(i, 6) * 10, 1, 12, rnd(i, 7) * TAU, mid, edge);
      return;
    }
    /* roots crossing, with a few area things */
    for (let i = 0; i < 3; i++) vroot(g, W, H, (i + 0.15 + rnd(i, 1) * 0.7) * W / 3, 20 + rnd(i, 2) * 22, 1, 18 + rnd(i, 3) * 14, rnd(i, 4) * TAU, mid, edge);
    if (area === 'rootgate') for (let i = 0; i < 4; i++) wrapAt(W, H, rnd(i, 5) * W, rnd(i, 6) * H, 40, (x, y) => lantern(g, x, y));
    if (area === 'mossy') for (let i = 0; i < 5; i++) wrapAt(W, H, rnd(i, 7) * W, rnd(i, 8) * H, 60, (x, y) => { for (let k = 0; k < 5; k++) { const L = 20 + rnd(i, k + 9) * 40; g.strokeStyle = rgba('#3f7a4a', 0.85); g.lineWidth = 3; g.beginPath(); g.moveTo(x + k * 6, y - 30); g.quadraticCurveTo(x + k * 6 + 4, y - 30 + L / 2, x + k * 6 - 2, y - 30 + L); g.stroke(); } });
    if (area === 'heart') for (let i = 0; i < 30; i++) { const x = rnd(i, 10) * W, y = rnd(i, 11) * H; g.fillStyle = 'rgba(255,208,96,.25)'; circle(g, x, y, 4); g.fill(); g.fillStyle = 'rgba(255,224,140,.9)'; circle(g, x, y, 1.3); g.fill(); }
  }, BGS);
  /* light shafts (not for dark rooms) */
  if (area !== 'glowcap' && area !== 'pipes') B.shaft = sprite(W, H, g => {
    for (let i = 0; i < 4; i++) {
      const x = (i + 0.2 + rnd(i, 60) * 0.6) * W / 4, w = 26 + rnd(i, 61) * 40, sl = 120;
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, rgba(A.shaft, 0.5)); gr.addColorStop(0.7, rgba(A.shaft, 0.12)); gr.addColorStop(1, rgba(A.shaft, 0));
      g.fillStyle = gr; g.beginPath(); g.moveTo(x, -4); g.lineTo(x + w, -4); g.lineTo(x + w + sl, H); g.lineTo(x + sl - w * 0.3, H); g.closePath(); g.fill();
    }
  }, Math.min(1, BGS));
  BG.set(key, B); if (BG.size > 3) BG.delete(BG.keys().next().value);
  return B;
}
function hpipe(g, x0, x1, y, th, m, ink, off, n) {
  if (ink) { g.fillStyle = ink; g.fillRect(x0, y - th / 2 - 2, x1 - x0, th + 4); }
  g.fillStyle = m[0]; g.fillRect(x0, y - th / 2, x1 - x0, th); g.fillStyle = m[1]; g.fillRect(x0, y + th * 0.18, x1 - x0, th * 0.32); g.fillStyle = m[2]; g.fillRect(x0, y - th * 0.32, x1 - x0, th * 0.16);
  for (let k = 0; k < n; k++) { const x = ((off + k * (x1 - x0) / n) % (x1 - x0)) + x0; if (ink) { g.fillStyle = ink; g.fillRect(x - 6, y - th / 2 - 5, 12, th + 10); } g.fillStyle = m[1]; g.fillRect(x - 4.5, y - th / 2 - 3, 9, th + 6); g.fillStyle = m[2]; g.fillRect(x - 3, y - th / 2 - 2, 2, th + 4); }
}
function vpipe(g, x, y0, y1, th, m, ink, off, n) {
  if (ink) { g.fillStyle = ink; g.fillRect(x - th / 2 - 2, y0, th + 4, y1 - y0); }
  g.fillStyle = m[0]; g.fillRect(x - th / 2, y0, th, y1 - y0); g.fillStyle = m[1]; g.fillRect(x + th * 0.18, y0, th * 0.32, y1 - y0); g.fillStyle = m[2]; g.fillRect(x - th * 0.32, y0, th * 0.16, y1 - y0);
  for (let k = 0; k < n; k++) { const y = ((off + k * (y1 - y0) / n) % (y1 - y0)) + y0; if (ink) { g.fillStyle = ink; g.fillRect(x - th / 2 - 5, y - 6, th + 10, 12); } g.fillStyle = m[1]; g.fillRect(x - th / 2 - 3, y - 4.5, th + 6, 9); g.fillStyle = m[2]; g.fillRect(x - th / 2 - 2, y - 3, th + 4, 2); }
}
function gearShape(g, x, y, r, n, col, edge) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = i * PI / n, q = i & 1 ? r * 0.82 : r; g.lineTo(x + Math.cos(a - 0.12) * q, y + Math.sin(a - 0.12) * q); g.lineTo(x + Math.cos(a + 0.12) * q, y + Math.sin(a + 0.12) * q); }
  g.closePath(); g.fill(); g.strokeStyle = edge; g.lineWidth = 2; g.stroke();
  g.globalCompositeOperation = 'destination-out'; circle(g, x, y, r * 0.35); g.fill(); g.globalCompositeOperation = 'source-over';
}
function spire(g, x, y, w, h, col, hi) {
  g.fillStyle = col; g.beginPath(); g.moveTo(x - w / 2, y + h / 2); g.lineTo(x - w / 2, y - h / 2 + w * 0.5); g.lineTo(x, y - h / 2); g.lineTo(x + w / 2, y - h / 2 + w * 0.5); g.lineTo(x + w / 2, y + h / 2); g.closePath(); g.fill();
  g.fillStyle = hi; g.beginPath(); g.moveTo(x - w / 2 + 2, y + h / 2); g.lineTo(x - w / 2 + 2, y - h / 2 + w * 0.5); g.lineTo(x, y - h / 2 + 2); g.lineTo(x, y + h / 2); g.closePath(); g.fill();
}
function valve(g, x, y, r) {
  g.strokeStyle = 'rgba(20,12,34,.5)'; g.lineWidth = 6; circle(g, x, y, r); g.stroke(); g.strokeStyle = '#8a5a3a'; g.lineWidth = 3.5; g.stroke();
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + 0.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); }
  g.fillStyle = '#a8784e'; circle(g, x, y, 3.5); g.fill();
}
function bigShroom(g, x, y, s, col, mid) {
  g.fillStyle = shade(mid, 0.1); rr(g, x - s * 0.18, y - s * 0.2, s * 0.36, s * 1.6, s * 0.15); g.fill();
  g.fillStyle = mix(mid, '#3a2a6a', 0.4); g.beginPath(); g.ellipse(x, y - s * 0.2, s, s * 0.55, 0, PI, TAU); g.closePath(); g.fill();
  g.strokeStyle = rgba(col, 0.75); g.lineWidth = 2.4; g.beginPath(); g.ellipse(x, y - s * 0.2, s, s * 0.55, 0, PI, TAU); g.stroke();
  g.fillStyle = rgba(col, 0.75); for (let k = 0; k < 5; k++) { circle(g, x + (k - 2) * s * 0.33, y - s * (0.42 + 0.12 * Math.cos((k - 2) * 0.8)), s * 0.06 + 1); g.fill(); }
  g.fillStyle = rgba(col, 0.18); g.beginPath(); g.ellipse(x, y - s * 0.12, s * 1.1, s * 0.25, 0, 0, TAU); g.fill();
}
function lantern(g, x, y) {
  g.strokeStyle = 'rgba(30,18,30,.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - 40); g.lineTo(x, y - 9); g.stroke();
  softGlow(g, x, y, 34, '#ffb050', 0.35);
  g.fillStyle = 'rgba(30,18,30,.8)'; rr(g, x - 8, y - 10, 16, 20, 6); g.fill();
  g.fillStyle = '#ffcf6a'; rr(g, x - 5.5, y - 7, 11, 14, 4.5); g.fill(); g.fillStyle = '#fff2c0'; rr(g, x - 3, y - 5, 4, 8, 2); g.fill();
}
/* the light sprites used by the light map and the glow pools */
const LCOL = { w: '#ffffff', warm: '#ffd9a0', cool: '#8fc8ff', cyan: '#8ff0ff', green: '#c8ff9a', pink: '#ffa8e0', violet: '#c8a8ff', gold: '#ffd870' };
let LS = null, VIG = null;
function lightSprites() {
  LS = {};
  for (const k in LCOL) { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, rgba(LCOL[k], 1)); gr.addColorStop(0.35, rgba(LCOL[k], 0.6)); gr.addColorStop(0.7, rgba(LCOL[k], 0.18)); gr.addColorStop(1, rgba(LCOL[k], 0)); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); LS[k] = c; }
  VIG = document.createElement('canvas'); VIG.width = 160; VIG.height = 90; const g = VIG.getContext('2d'), gr = g.createRadialGradient(80, 45, 30, 80, 45, 100);
  gr.addColorStop(0, 'rgba(12,6,24,0)'); gr.addColorStop(0.7, 'rgba(12,6,24,.12)'); gr.addColorStop(1, 'rgba(12,6,24,.5)'); g.fillStyle = gr; g.fillRect(0, 0, 160, 90);
}
let LM = null, LMG = null; const LMS = () => LOW ? 5 : 4;
let CAUS = null, CAUSP = null;
function causticTile() {
  CAUS = sprite(80, 80, g => {
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6;
    for (let i = 0; i < 9; i++) { const x = hash(i, 1) * 80, y = hash(i, 2) * 80, r = 8 + hash(i, 3) * 10; for (const dx of [-80, 0, 80]) for (const dy of [-80, 0, 80]) { g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k * TAU / 6 + hash(i, 4), q = r * (0.75 + 0.35 * Math.sin(k * 2.1 + i)); g.lineTo(x + dx + Math.cos(a) * q, y + dy + Math.sin(a) * q); } g.stroke(); } }
  }, Math.min(2, R));
  CAUSP = null;
}

/* =====================================================================================================================
   PARTICLES: a pooled list (no allocation once warm), advanced at 60 Hz by tick(), drawn by frame()
   ===================================================================================================================== */
const K = { PETAL: 0, SPARK: 1, RING: 2, DUST: 3, FLUFF: 4, LEAF: 5, DROP: 6, STEAM: 7, CHIP: 8, MOTE: 9, STREAK: 10, FLASH: 11, SHADOW: 12, BUBBLE: 13, STAR: 14, BLOSSOM: 15 };
const ACT = [], PP = [], BURSTS = [], SPLASH = [];
/* colour splashes: for a moment after a bloom the colour comes back in a soft circle around it */
const splashR = q => (q.big ? 70 : 30) + (q.big ? 260 : 90) + q.extra + 14;
function splash(x, y, big) {
  /* circles never overlap (the even-odd hole would cancel): a bloom near another one grows that circle to cover both */
  const n = { x, y, age: 0, life: big ? 200 : 110, big: !!big, extra: 0 };
  for (let i = SPLASH.length - 1; i >= 0; i--) { const q = SPLASH[i], d = Math.hypot(q.x - n.x, q.y - n.y); if (d < splashR(q) + splashR(n) + 4) { SPLASH.splice(i, 1); const big2 = q.big || n.big; n.extra = Math.max(q.extra, n.extra) + d / 2; n.x = (q.x + n.x) / 2; n.y = (q.y + n.y) / 2; n.big = big2; n.life = big2 ? 200 : 110; n.age = Math.min(q.age, 8); } }
  if (SPLASH.length > 3) SPLASH.shift(); SPLASH.push(n);
}
let ambT = 0;
const pcap = () => LOW ? 280 : 900;
const rnd = Math.random;
function spawn(k, x, y, vx, vy, life, s, c) {
  if (ACT.length >= pcap()) return DUMMY;
  const p = PP.pop() || {};
  p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.age = 0; p.s = s; p.c = c; p.c2 = c; p.g = 0; p.dr = 1; p.r = rnd() * TAU; p.vr = 0; p.gl = false; p.a = 1; p.w = rnd() * TAU; p.grow = 0;
  ACT.push(p); return p;
}
const DUMMY = {};
function clearParts() { while (ACT.length) PP.push(ACT.pop()); BURSTS.length = 0; SPLASH.length = 0; }
function burst(x, y, r, col, life) { if (BURSTS.length > 24) BURSTS.shift(); BURSTS.push({ x, y, r, col, life, age: 0 }); }
const PETAL = [['#8fa8ff', '#d4ddff'], ['#ff7aa8', '#ffd4e4'], ['#ffc8ea', '#ffffff'], ['#ffd23b', '#fff2a0'], ['#ff6b5a', '#ffc4b4'], ['#d27aff', '#f2d0ff'], ['#ffffff', '#ffe890']];
const PLIGHT = ['cool', 'pink', 'pink', 'gold', 'warm', 'violet', 'w'];
function petals(x, y, n, kind, sp, up) {
  const P = PETAL[kind] || PETAL[6]; if (LOW) n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (0.8 + rnd() * 1.4) * (sp || 2.4);
    const p = spawn(K.PETAL, x + Math.cos(a) * 4, y + Math.sin(a) * 4, Math.cos(a) * v, Math.sin(a) * v - (up == null ? 1.6 : up), 60 + rnd() * 70, 2.6 + rnd() * 2.4, P[i & 1]);
    p.g = 0.055; p.dr = 0.965; p.vr = (rnd() - 0.5) * 0.3; p.c2 = P[(i + 1) & 1]; }
}
function sparks(x, y, n, col, sp, gl) {
  if (LOW) n = Math.ceil(n * 0.6);
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (0.5 + rnd()) * (sp || 2.5); const p = spawn(K.SPARK, x, y, Math.cos(a) * v, Math.sin(a) * v - 0.5, 22 + rnd() * 24, 2.5 + rnd() * 3, col || '#fff8d0'); p.dr = 0.92; p.gl = gl !== false; p.vr = (rnd() - 0.5) * 0.2; }
}
function ring(x, y, s, grow, life, col, lw) { const p = spawn(K.RING, x, y, 0, 0, life, s, col); p.grow = grow; p.w = lw || 3; return p; }
function dust(x, y, n, col, sp, up) {
  if (LOW) n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) { const a = rnd() * PI, v = (0.3 + rnd()) * (sp || 1.2); const p = spawn(K.DUST, x + (rnd() - 0.5) * 8, y - rnd() * 3, Math.cos(a) * v * (rnd() < 0.5 ? -1 : 1), -Math.sin(a) * v * 0.5 - (up || 0.2), 18 + rnd() * 18, 2.5 + rnd() * 3, col || 'rgba(235,225,215,.8)'); p.dr = 0.9; p.a = 0.55; }
}
function chips(x, y, n, col, sp) {
  if (LOW) n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) { const a = -rnd() * PI, v = (0.6 + rnd()) * (sp || 2.5); const p = spawn(K.CHIP, x + (rnd() - 0.5) * 12, y + (rnd() - 0.5) * 10, Math.cos(a) * v, Math.sin(a) * v - 1, 30 + rnd() * 30, 1.6 + rnd() * 2, col); p.g = 0.25; p.vr = (rnd() - 0.5) * 0.5; }
}
function drops(x, y, n, col, sp) {
  if (LOW) n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) { const a = -PI * (0.15 + rnd() * 0.7), v = (0.6 + rnd()) * (sp || 2.6); const p = spawn(K.DROP, x + (rnd() - 0.5) * 8, y, Math.cos(a) * v, Math.sin(a) * v - 0.5, 26 + rnd() * 20, 1.4 + rnd() * 1.4, col || '#bff0ff'); p.g = 0.22; }
}
function blossoms(x, y, n, kind, sp) {
  const P = PETAL[kind] || PETAL[6]; if (LOW) n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) { const a = -PI * (0.1 + 0.8 * (i + rnd() * 0.6) / n), v = (1.4 + rnd() * 1.4) * (sp || 2.2); const p = spawn(K.BLOSSOM, x, y, Math.cos(a) * v, Math.sin(a) * v - 1.2, 70 + rnd() * 50, 3.2 + rnd() * 1.6, P[0]); p.g = 0.06; p.dr = 0.96; p.vr = (rnd() - 0.5) * 0.2; p.c2 = kind === 3 ? '#7a4a2a' : '#ffd93b'; }
}
function leaves(x, y, n) {
  for (let i = 0; i < n; i++) { const a = -PI * (0.2 + rnd() * 0.6), v = 1 + rnd() * 2; const p = spawn(K.LEAF, x, y, Math.cos(a) * v, Math.sin(a) * v, 50 + rnd() * 40, 6 + rnd() * 3, '#86dc5c'); p.g = 0.06; p.dr = 0.96; p.vr = (rnd() - 0.5) * 0.25; }
}
function fluff(x, y, n, sp) {
  if (LOW) n = Math.ceil(n * 0.5);
  for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (0.4 + rnd()) * (sp || 1.6); const p = spawn(K.FLUFF, x, y, Math.cos(a) * v, Math.sin(a) * v - 0.4, 40 + rnd() * 40, 2.4 + rnd() * 1.2, '#ffffff'); p.g = -0.01; p.dr = 0.94; p.vr = (rnd() - 0.5) * 0.12; }
}
function steam(x, y, n, sp) {
  for (let i = 0; i < n; i++) { const p = spawn(K.STEAM, x + (rnd() - 0.5) * 10, y, (rnd() - 0.5) * 0.6, -(0.8 + rnd()) * (sp || 1.5), 30 + rnd() * 26, 4 + rnd() * 4, '#ffffff'); p.dr = 0.97; p.a = 0.5; }
}
const PL = (sim, i) => (sim.players && sim.players[i | 0]) || null;
const SOOT = 'rgba(150,140,170,.7)';
function fx(sim, ev) {
  if (!ev || !sim) return;
  const n = ev[0], A = RC ? RC.A : AREA.rootgate;
  try {
    switch (n) {
      case 'jump': { const p = PL(sim, ev[1]); if (p) dust(p.x, p.y, 4, null, 1, 0.1); break; }
      case 'land': { const p = PL(sim, ev[1]); if (p) { const v = num(ev[2], 0.3); dust(p.x, p.y, 3 + Math.round(v * 7), null, 0.8 + v * 1.6, 0.1); } break; }
      case 'step': { const p = PL(sim, ev[1]); if (p && rnd() < 0.5) dust(p.x - p.face * 4, p.y, 1, null, 0.5, 0.1); break; }
      case 'hit': { const x = ev[2], y = ev[3]; fluff(x, y, 7, 2.2); sparks(x, y, 3, '#ffffff', 2.4); ring(x, y, 4, 14, 12, '#ffffff', 2.4); break; }
      case 'block': { sparks(ev[1], ev[2], 7, '#fff2a0', 3.2); ring(ev[1], ev[2], 3, 12, 10, '#ffffff', 2.5); break; }
      case 'bloom': {
        const x = ev[2], y = ev[3], kind = num(ev[4], 6), P = PETAL[kind] || PETAL[6];
        const f = spawn(K.FLASH, x, y, 0, 0, 20, 26, '#ffffff'); f.gl = true;
        ring(x, y, 6, 40, 26, P[0], 3.4); ring(x, y, 3, 24, 16, '#ffffff', 2.6);
        petals(x, y, 22, kind, 2.6); blossoms(x, y, 5, kind, 1.8); sparks(x, y, 9, '#fff4b0', 3); leaves(x, y, 2);
        burst(x, y, 120, PLIGHT[kind] || 'w', 50); splash(x, y, false);
        break;
      }
      case 'bud': { splash(ev[1], ev[2], false); blossoms(ev[1], ev[2], 3, 6, 1.4); petals(ev[1], ev[2], 14, 6, 2); sparks(ev[1], ev[2], 6, '#fff4b0', 2.2); ring(ev[1], ev[2], 4, 24, 18, '#ffffff', 2.6); burst(ev[1], ev[2], 80, 'w', 36); break; }
      case 'hurt': { const p = PL(sim, ev[1]); if (p) { leaves(p.x, p.y - 16, 4); sparks(p.x, p.y - 14, 4, '#ffffff', 2.2, false); ring(p.x, p.y - 14, 5, 18, 12, '#ffffff', 2.4); } break; }
      case 'thorn': { const p = PL(sim, ev[1]); if (p) leaves(p.x, p.y - 10, 2); break; }
      case 'faint': { const p = PL(sim, ev[1]); if (p) { leaves(p.x, p.y - 12, 5); dust(p.x, p.y, 6, null, 1.2); } break; }
      case 'wake': case 'revive': case 'setback': case 'tether': {
        const p = n === 'tether' ? { x: ev[2], y: ev[3] } : PL(sim, ev[1]); if (p && p.x != null) { sparks(p.x, p.y - 12, 8, '#fff4b0', 2); ring(p.x, p.y - 12, 4, 20, 16, '#ffffff', 2.2); } break;
      }
      case 'heal': { const p = PL(sim, ev[1]); if (p) { for (let i = 0; i < 8; i++) { const q = spawn(K.SPARK, p.x + (rnd() - 0.5) * 18, p.y - 6 - rnd() * 18, 0, -0.6 - rnd(), 30 + rnd() * 20, 2.5 + rnd() * 2, i & 1 ? '#c8ffa0' : '#fff4b0'); q.gl = true; } leaves(p.x, p.y - 20, 1); burst(p.x, p.y - 14, 70, 'green', 30); } break; }
      case 'dash': { const p = PL(sim, ev[1]); if (p) { dust(p.x, p.y - 4, 5, null, 1.4); ring(p.x - p.face * 6, p.y - 12, 4, 10, 10, 'rgba(255,255,255,.8)', 2); } break; }
      case 'cling': { const p = PL(sim, ev[1]); if (p) dust(p.x + (p.wall || p.face) * 7, p.y - 14, 3, null, 0.6); break; }
      case 'walljump': { const p = PL(sim, ev[1]); if (p) { dust(p.x - p.face * 8, p.y - 12, 5, null, 1.2); } break; }
      case 'puff': { const p = PL(sim, ev[1]); if (p) { for (let i = 0; i < 6; i++) { const a = PI * (0.1 + i * 0.16); const q = spawn(K.STEAM, p.x, p.y, Math.cos(a) * 1.6, Math.sin(a) * 0.8, 24, 4 + rnd() * 2, '#ffffff'); q.a = 0.85; q.dr = 0.9; } ring(p.x, p.y + 2, 4, 16, 14, '#ffffff', 2.2); } break; }
      case 'beam': { const p = PL(sim, ev[1]); if (p) { const f = spawn(K.FLASH, p.x + p.face * 14, p.y - 15, 0, 0, 14, 18, '#ffe890'); f.gl = true; sparks(p.x + p.face * 14, p.y - 15, 5, '#ffe890', 2); burst(p.x, p.y - 14, 90, 'gold', 20); } break; }
      case 'beamEnd': { sparks(ev[1], ev[2], 8, '#ffe890', 2.6); ring(ev[1], ev[2], 3, 16, 14, '#fff4b0', 2.4); burst(ev[1], ev[2], 70, 'gold', 20); break; }
      case 'bounce': { const p = PL(sim, ev[1]); if (p) { ring(p.x, p.y + 2, 6, 22, 16, ev[2] === 'cap' ? '#8ff0ff' : '#ffffff', 2.6); if (ev[2] === 'cap') { for (let i = 0; i < 8; i++) { const a = -PI * rnd(); const q = spawn(K.MOTE, p.x + Math.cos(a) * 12, p.y, Math.cos(a) * 1.2, -0.5 - rnd() * 1.5, 50 + rnd() * 30, 1.6 + rnd(), '#bff6ff'); q.gl = true; q.dr = 0.97; } burst(p.x, p.y, 80, 'cyan', 24); } } break; }
      case 'pogo': { const p = PL(sim, ev[1]); if (p) { ring(p.x, p.y + 4, 4, 14, 12, '#ffffff', 2.2); sparks(p.x, p.y + 4, 3, '#ffffff', 1.6, false); } break; }
      case 'dew': { const x = ev[2], y = ev[3]; for (let i = 0; i < 3; i++) { const q = spawn(K.SPARK, x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 8, (rnd() - 0.5) * 1.2, -0.6 - rnd(), 18 + rnd() * 10, 2.4 + rnd() * 1.6, '#bff0ff'); q.gl = true; } break; }
      case 'dewBig': { sparks(ev[1], ev[2], 14, '#bff0ff', 2.6); ring(ev[1], ev[2], 6, 30, 20, '#9fe6ff', 3); burst(ev[1], ev[2], 90, 'cyan', 30); break; }
      case 'pickup': { const p = PL(sim, 0); if (p) { sparks(p.x, p.y - 14, 12, '#fff4b0', 2.8); ring(p.x, p.y - 14, 6, 34, 24, '#ffe890', 3); burst(p.x, p.y - 14, 120, 'gold', 40); } break; }
      case 'get': { const p = PL(sim, 0); if (p) { petals(p.x, p.y - 16, 20, 3, 2.4); sparks(p.x, p.y - 16, 14, '#ffffff', 3.2); } break; }
      case 'crack': { chips(ev[1], ev[2], 6, A.root[0], 2.2); dust(ev[1], ev[2] + 6, 4, null, 1.2); break; }
      case 'break': { chips(ev[1], ev[2], 18, A.root[0], 3.2); chips(ev[1], ev[2], 8, A.earth[0], 2.6); dust(ev[1], ev[2] + 10, 10, null, 1.8, 0.3); sparks(ev[1], ev[2], 6, '#fff4b0', 2.4); break; }
      case 'lever': { sparks(ev[1], ev[2] - 10, 5, '#fff4b0', 1.8); dust(ev[1], ev[2], 3, null, 0.8); break; }
      case 'switch': { sparks(ev[1], ev[2], 12, '#ffe890', 2.8); ring(ev[1], ev[2], 6, 30, 22, '#ffe890', 3); burst(ev[1], ev[2], 110, 'gold', 40); break; }
      case 'gate': { const x = ev[2], y = ev[3]; dust(x, y + 10, 8, null, 1.8, 0.3); chips(x, y, 4, A.earth[0], 1.6); break; }
      case 'splash': { drops(ev[1], ev[2], 9, null, 2.6); ring(ev[1], ev[2] + 2, 4, 16, 16, 'rgba(220,250,255,.9)', 2); break; }
      case 'splat': { drops(ev[1], ev[2], 6, '#c0c8d8', 2); break; }
      case 'drip': { const q = spawn(K.DROP, ev[1] + (rnd() - 0.5) * 6, ev[2] + 8, 0, 0.5, 40, 1.6, '#c0c8d8'); q.g = 0.18; break; }
      case 'vent': { steam(ev[1], ev[2] - 4, 6, 2); break; }
      case 'crumble': { chips(ev[1], ev[2], 10, A.earth[0], 1.6); dust(ev[1], ev[2], 6, null, 1.2); break; }
      case 'crumbleTell': { for (let i = 0; i < 3; i++) { const q = spawn(K.CHIP, ev[1] + (rnd() - 0.5) * 16, ev[2] + 10, 0, 0.3, 30, 1.2 + rnd(), A.earth[0]); q.g = 0.15; } break; }
      case 'spore': { for (let i = 0; i < 6; i++) { const q = spawn(K.DUST, ev[1] + (rnd() - 0.5) * 10, ev[2], (rnd() - 0.5) * 1.4, -rnd() * 1.2, 30, 3 + rnd() * 2, 'rgba(190,220,160,.75)'); q.a = 0.6; } break; }
      case 'charge': case 'shove': case 'hop': case 'bonk': { dust(ev[ev.length - 2], ev[ev.length - 1] + 8, 5, null, 1.4); break; }
      case 'clunk': { for (let i = 0; i < 3; i++) { const q = spawn(K.STAR, ev[1], ev[2] - 10, (i - 1) * 1.2, -1.6, 34, 3, '#ffe890'); q.g = 0.08; q.vr = 0.2; } dust(ev[1], ev[2] + 8, 5, null, 1.6); break; }
      case 'ready': { sparks(ev[1], ev[2] - 10, 3, '#ffffff', 1.2, false); break; }
      case 'stomp': { dust(ev[1] - 30, ev[2], 4, null, 1.2); dust(ev[1] + 30, ev[2], 4, null, 1.2); break; }
      case 'slam': { dust(ev[1], ev[2], 18, null, 3, 0.4); chips(ev[1], ev[2] - 4, 10, A.earth[0], 3); ring(ev[1], ev[2], 8, 50, 20, 'rgba(255,255,255,.7)', 3); break; }
      case 'throw': case 'summon': { for (let i = 0; i < 8; i++) { const a = rnd() * TAU; const q = spawn(K.DUST, ev[1] + Math.cos(a) * 10, ev[2] + Math.sin(a) * 10, Math.cos(a) * 1.2, Math.sin(a) * 1.2, 30, 4 + rnd() * 3, SOOT); q.a = 0.6; } break; }
      case 'wind': { for (let i = 0; i < 4; i++) { const q = spawn(K.STREAK, ev[1] + (rnd() - 0.5) * 30, ev[2] + (rnd() - 0.5) * 20, (rnd() < 0.5 ? -1 : 1) * 3, 0, 20, 1, 'rgba(255,255,255,.7)'); q.a = 0.7; } break; }
      case 'petals': { petals(ev[1], ev[2], 18, 1, 3, 0.8); break; }
      case 'pop': { const kind = ev[1], x = ev[2], y = ev[3]; const col = kind === 'spore' ? 'rgba(190,220,160,.8)' : kind === 'drop' ? 'rgba(200,230,255,.8)' : kind === 'orb' ? 'rgba(230,200,255,.8)' : 'rgba(210,200,190,.8)'; for (let i = 0; i < 6; i++) { const a = rnd() * TAU; const q = spawn(K.DUST, x, y, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 22, 2.5 + rnd() * 2, col); q.a = 0.7; } ring(x, y, 3, 12, 12, '#ffffff', 2); break; }
      case 'sway': { for (let i = 0; i < 3; i++) { const q = spawn(K.SPARK, ev[1] + (rnd() - 0.5) * 12, ev[2] - 10 - rnd() * 8, 0, -0.8, 26, 2.4, '#ffe890'); q.gl = true; } break; }
      case 'briar': { for (let i = 0; i < 10; i++) { const a = rnd() * TAU; const q = spawn(K.SHADOW, ev[1] + Math.cos(a) * 10, ev[2] + Math.sin(a) * 10, Math.cos(a) * 0.8, Math.sin(a) * 0.8 - 0.4, 40, 4 + rnd() * 4, 'rgba(70,40,110,.7)'); q.a = 0.7; } break; }
      case 'ghit': { fluff(ev[2], ev[3], 9, 2.6); sparks(ev[2], ev[3], 5, '#ffffff', 2.8); ring(ev[2], ev[3], 8, 26, 14, '#ffffff', 3); break; }
      case 'gphase': { const g = sim.room && sim.room.guard; if (g) { ring(g.x, g.y, 20, 80, 30, '#ffffff', 4); sparks(g.x, g.y, 12, '#fff4b0', 3.5); } break; }
      case 'calm': { const g = sim.room && sim.room.guard; if (g) { const f = spawn(K.FLASH, g.x, g.y, 0, 0, 40, 90, '#ffffff'); f.gl = true; ring(g.x, g.y, 20, 180, 50, '#ffffff', 6); ring(g.x, g.y, 10, 120, 40, '#ffe890', 4); for (let k = 0; k < 7; k++) { petals(g.x + (rnd() - 0.5) * g.w * 0.6, g.y + (rnd() - 0.5) * g.h * 0.6, 10, k, 3.4); blossoms(g.x, g.y, 2, k, 3); } sparks(g.x, g.y, 24, '#fff4b0', 4); burst(g.x, g.y, 260, 'gold', 120); splash(g.x, g.y, true); } break; }
      case 'hazard': { const k = ev[1], x = ev[2], y = ev[3]; if (k === 'steam') steam(x, y, 8, 2.6); else if (k === 'zap' || k === 'shock') { sparks(x, y, 8, '#fff6a0', 3); burst(x, y, 90, 'w', 16); } else dust(x, y, 6, null, 1.6); break; }
      case 'bubble': { const p = PL(sim, ev[1]); if (p) ring(p.x, p.y - 14, 6, 20, 18, '#ffffff', 2.2); break; }
      case 'rest': { const p = PL(sim, ev[1]); if (p) { drops(p.x, p.y - 30, 10, '#bff0ff', 2); sparks(p.x, p.y - 20, 10, '#c8ffa0', 2); burst(p.x, p.y - 14, 120, 'warm', 60); } break; }
      case 'ending': { const p = PL(sim, 0); if (p) for (let k = 0; k < 7; k++) petals(p.x + (rnd() - 0.5) * 200, p.y - 100, 8, k, 2); break; }
      case 'room': clearParts(); break;
    }
  } catch (e) { void e; }
}
/* tick: particles, ambient motes, steam, wind, beams; at 60 Hz */
let dewShow = 0, dewSeen = -1;
const LEAFANIM = [[], []];
function tick(sim) {
  TIME++;
  const r = sim && sim.room; if (!r) return;
  if (!RC || RC.room !== r) room(sim);
  checkTiles();
  /* particles */
  for (let i = 0; i < ACT.length;) {
    const p = ACT[i]; p.age++;
    if (p.age >= p.life) { ACT[i] = ACT[ACT.length - 1]; ACT.pop(); PP.push(p); continue; }
    p.vy += p.g; p.vx *= p.dr; p.vy *= p.dr; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    if (p.k === K.PETAL || p.k === K.LEAF || p.k === K.BLOSSOM) { p.vx += Math.sin(p.age * 0.12 + p.w) * 0.05; if (p.vy > 0.9) p.vy = 0.9; }
    else if (p.k === K.FLUFF) { p.vx += Math.sin(p.age * 0.1 + p.w) * 0.03; }
    else if (p.k === K.MOTE) { p.vx += Math.sin(p.age * 0.03 + p.w) * 0.01; }
    i++;
  }
  for (let i = BURSTS.length - 1; i >= 0; i--) if (++BURSTS[i].age >= BURSTS[i].life) BURSTS.splice(i, 1);
  for (let i = SPLASH.length - 1; i >= 0; i--) if (++SPLASH[i].age >= SPLASH[i].life) SPLASH.splice(i, 1);
  /* ambient motes in view */
  const cam = sim.cam || { x: 0, y: 0 }, A = RC.A;
  ambT++;
  const rate = LOW ? 14 : 6;
  if (ambT % rate === 0 && ACT.length < pcap() * 0.6) {
    const x = cam.x + rnd() * VW, y = cam.y + rnd() * VH;
    if (r.area === 'cloud') { const q = spawn(K.STREAK, x, y, 1.2 + rnd(), 0, 60, 1, 'rgba(255,255,255,.9)'); q.a = 0.6; }
    else if (r.area === 'crystal' && RC.water && rnd() < 0.5) { const b = RC.wbox, bx = b[0] + rnd() * (b[2] - b[0]), by = b[1] + rnd() * (b[3] - b[1]); if (r.water && r.water(bx, by)) { const q = spawn(K.BUBBLE, bx, by, 0, -0.5 - rnd() * 0.4, 80, 1.5 + rnd() * 1.5, '#e0ffff'); q.a = 0.8; } }
    else { const q = spawn(K.MOTE, x, y, (rnd() - 0.5) * 0.3, -0.1 - rnd() * 0.25, 160 + rnd() * 120, 0.9 + rnd() * 1.1, A.mote); q.gl = true; q.a = 0.7; }
  }
  /* vents: steam while puffing, a little hiss when about to */
  for (const v of r.vents) {
    if (v.on) { if (TIME % 2 === 0) { const q = spawn(K.STEAM, v.x + (rnd() - 0.5) * 10, v.y - 8, (rnd() - 0.5) * 0.4, -(2.4 + rnd() * 1.6), Math.max(20, v.h / 3.2), 4 + rnd() * 3, '#ffffff'); q.a = 0.55; q.dr = 0.995; } }
    else if (v.tell && TIME % 6 === 0) { const q = spawn(K.STEAM, v.x + (rnd() - 0.5) * 6, v.y - 6, 0, -0.8, 20, 2.5, '#ffffff'); q.a = 0.4; }
  }
  /* wind zones */
  for (const w of r.wind) {
    if (w.on < 0.3 || TIME % (LOW ? 6 : 3)) continue;
    const x0 = Math.max(w.x, cam.x), x1 = Math.min(w.x + w.w, cam.x + VW), y0 = Math.max(w.y, cam.y), y1 = Math.min(w.y + w.h, cam.y + VH);
    if (x1 <= x0 || y1 <= y0) continue;
    const q = spawn(K.STREAK, x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), w.dx * 5, w.dy * 5, 26 + rnd() * 16, 1, r.area === 'cloud' ? 'rgba(120,150,215,.8)' : 'rgba(255,255,255,.7)'); q.a = 0.75 * w.on;
  }
  /* beams leave sparkles; glooms shed a little soot; spore lanterns breathe */
  for (const s of r.shots) if (s.kind === 'beam' && TIME % 2 === 0) { const q = spawn(K.SPARK, s.x - s.vx * 0.5, s.y + (rnd() - 0.5) * s.r * 1.4, -s.vx * 0.05, (rnd() - 0.5) * 0.6, 18, 2 + rnd() * 2, '#fff0a0'); q.gl = true; }
  if (TIME % 18 === 0) for (const f of r.foes) if (f.alive && rnd() < 0.5) { const q = spawn(K.DUST, f.x + (rnd() - 0.5) * f.w * 0.6, f.y - f.h * 0.3, (rnd() - 0.5) * 0.3, -0.4 - rnd() * 0.3, 40, 2 + rnd() * 2, SOOT); q.a = 0.45; }
  for (const h of r.hazards) if (h.kind === 'steam' && h.live && TIME % 2 === 0) { const q = spawn(K.STEAM, h.x + rnd() * h.w, h.y + h.h, 0, -2.5 - rnd() * 2, 26, 4 + rnd() * 3, '#ffffff'); q.a = 0.5; }
  for (const p of sim.players) if (p.swim && TIME % 20 === 0 && p.alive) { const q = spawn(K.BUBBLE, p.x + p.face * 5, p.y - 22, 0, -0.6, 50, 1.4 + rnd(), '#e0ffff'); q.a = 0.8; }
  /* the HUD's dew counter */
  const d = sim.save ? sim.save.dew | 0 : 0;
  if (dewSeen < 0 || Math.abs(d - dewShow) > 400) dewShow = d; else if (dewShow !== d) dewShow += Math.sign(d - dewShow) * Math.max(1, Math.round(Math.abs(d - dewShow) * 0.12));
  dewSeen = d;
}

/* =====================================================================================================================
   STAND-INS: drawn only for RL.Art functions that do not exist (yet). Simple, faceless except Sprig/Marigold/Peddler.
   ===================================================================================================================== */
const FLC = [['#8fa8ff', '#5a72e0'], ['#ff7aa8', '#d84a7c'], ['#ffd0ec', '#e890c0'], ['#ffd23b', '#e8941c'], ['#ff6b5a', '#c8402e'], ['#d27aff', '#9a44d0'], ['#ffffff', '#d8cbb8']];
const SI = {
  player(ctx, P, t) {
    if (P.inv > 0 && (t >> 2) & 1) return;
    const x = P.x, y = P.y, f = P.face || 1, m = P.who === 'marigold' ? ['#ffa04a', '#d9622a', '#ffe0c4'] : ['#7ed957', '#3f9a3a', '#e2ffd2'];
    if (P.st === 'faint') { ctx.save(); ctx.translate(x, y - 6); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = m[0]; ctx.beginPath(); ctx.ellipse(0, 0, 10, 5.4, 0, 0, TAU); ctx.fill(); ctx.restore(); text(ctx, 'z', x + 10, y - 20 - (t % 40) / 4, 9, '#fff'); return; }
    ctx.fillStyle = INK; rr(ctx, x - 9, y - 27, 18, 27, 8); ctx.fill(); ctx.fillStyle = m[1]; rr(ctx, x - 7, y - 25, 14, 23, 6.5); ctx.fill(); ctx.fillStyle = m[0]; rr(ctx, x - 7, y - 25, 12, 19, 6); ctx.fill();
    leaf(ctx, x, y - 26, -PI / 2 - 0.6, 9, M3.LEAF, 1.8); leaf(ctx, x, y - 26, -PI / 2 + 0.6, 8, M3.LEAF, 1.8);
    ctx.fillStyle = INK; circle(ctx, x + f * 2, y - 16, 1.6); ctx.fill(); circle(ctx, x + f * 6, y - 16, 1.6); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x + f * 7, y - 6); ctx.lineTo(x + f * 11, y - 26); ctx.stroke(); ctx.strokeStyle = '#8fd060'; ctx.lineWidth = 1.2; ctx.stroke();
    fluffBall(ctx, x + f * 11, y - 28, 4);
    if (P.swing && P.swing.t < 9) { const d = P.swing.dir, a0 = d === 'u' ? -PI * 0.9 : d === 'd' ? PI * 0.1 : -PI * 0.55, a1 = d === 'u' ? -PI * 0.1 : d === 'd' ? PI * 0.9 : PI * 0.35, rr2 = P.swing.reach || 30; ctx.save(); ctx.translate(x, y - 14); if (f < 0 && d === 'f') ctx.scale(-1, 1); ctx.globalAlpha = 0.8 * (1 - P.swing.t / 9); ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, rr2 * 0.8, a0, a1); ctx.stroke(); ctx.restore(); }
  },
  foe(ctx, F, t) {
    const x = F.x, y = F.y, w = F.w || 22, h = F.h || 22, k = F.kind, c = F.hurt > 0 ? ['#ffffff', '#e0e0f0', '#ffffff'] : ['#a49db4', '#6b6484', '#dcd8e6'];
    const bob = Math.sin(t * 0.08 + (F.id || 0)) * 1.5;
    if (k === 'smog') { blobs(ctx, [[x - 6, y + bob, 8], [x + 5, y - 3 + bob, 9], [x + 2, y + 5 + bob, 7]], c[0], 2.2, c[2]); for (let i = 0; i < 3; i++) { ctx.strokeStyle = 'rgba(60,50,80,.5)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x - 4 + i * 4, y + bob, 3, t * 0.1 + i, t * 0.1 + i + 4); ctx.stroke(); } }
    else if (k === 'thorn') { ctx.save(); ctx.translate(x, y); ctx.rotate(x / 11); STAR(ctx, 0, 0, 13, 8, 9, 0); ctx.fillStyle = INK; ctx.fill(); STAR(ctx, 0, 0, 11, 6.5, 9, 0); ctx.fillStyle = c[0]; ctx.fill(); ctx.restore(); }
    else if (k === 'drip') { ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.quadraticCurveTo(x + 13, y + 6, x, y + 11); ctx.quadraticCurveTo(x - 13, y + 6, x, y - 12); ctx.fill(); ctx.fillStyle = c[0]; ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.quadraticCurveTo(x + 10, y + 5, x, y + 9); ctx.quadraticCurveTo(x - 10, y + 5, x, y - 9); ctx.fill(); }
    else if (k === 'lantern') { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y, 11, 13, 0, 0, TAU); ctx.fill(); ctx.fillStyle = F.st === 'glow' ? '#d8e8b0' : c[0]; ctx.beginPath(); ctx.ellipse(x, y, 9, 11, 0, 0, TAU); ctx.fill(); }
    else { ctx.fillStyle = INK; rr(ctx, x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4, 6); ctx.fill(); ctx.fillStyle = c[1]; rr(ctx, x - w / 2, y - h / 2, w, h, 5); ctx.fill(); ctx.fillStyle = c[0]; rr(ctx, x - w / 2, y - h / 2, w, h - 4, 5); ctx.fill(); if (k === 'cog') { ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y - h / 2 - 7); ctx.stroke(); ctx.save(); ctx.translate(x, y - h / 2 - 8); ctx.rotate(t * (F.st === 'wind' ? 0.5 : 0.08)); ctx.fillStyle = c[2]; ctx.fillRect(-6, -1.5, 12, 3); ctx.restore(); } }
  },
  guardian(ctx, G, t) {
    const x = G.x, y = G.y, w = G.w, h = G.h, calm = clamp01(G.calm || 0), base = mix(G.hurt > 0 ? '#ffffff' : '#8a8298', G.kind === 'cloud' ? '#ffffff' : G.kind === 'heart' ? '#ffd060' : G.kind === 'boiler' ? '#8fc8e8' : '#ff9ab8', calm);
    const sq = G.squash || 0;
    ctx.save(); ctx.translate(x, y + h / 2); ctx.scale(1 + sq * 0.12, 1 - sq * 0.12); ctx.translate(0, -h / 2);
    if (G.kind === 'cloud') puff(ctx, 0, 0, w * 0.28, base, 'rgba(80,70,110,.25)', INK);
    else if (G.kind === 'boiler') { ctx.fillStyle = INK; rr(ctx, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 18); ctx.fill(); ctx.fillStyle = base; rr(ctx, -w / 2, -h / 2, w, h, 15); ctx.fill(); ctx.fillStyle = INK; rr(ctx, -w * 0.12 - 3, -h / 2 - 30, w * 0.24 + 6, 34, 4); ctx.fill(); ctx.fillStyle = base; rr(ctx, -w * 0.12, -h / 2 - 27, w * 0.24, 30, 3); ctx.fill(); ctx.fillStyle = INK; circle(ctx, 0, 6, 20); ctx.fill(); ctx.fillStyle = mix('#ff8040', '#80d0ff', calm); circle(ctx, 0, 6, 15); ctx.fill(); }
    else { ball(ctx, 0, 0, Math.min(w, h) / 2, [base, shade(base, 0.25), tint(base, 0.6)], 3); if (G.kind === 'knot' || G.kind === 'heart') { ctx.strokeStyle = 'rgba(43,33,64,.55)'; ctx.lineWidth = 3; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, w * 0.3, i * 1.6 + t * 0.01, i * 1.6 + 1.2 + t * 0.01); ctx.stroke(); } } }
    ctx.restore();
  },
  hazard(ctx, Hz, t) {
    if (Hz.tell > 0) { ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 0.5); ctx.fillStyle = '#fff2c0'; ctx.fillRect(Hz.x, Hz.y, Hz.w, Hz.h); ctx.globalAlpha = 1; ctx.setLineDash([4, 4]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(Hz.x, Hz.y, Hz.w, Hz.h); ctx.setLineDash([]); return; }
    ctx.fillStyle = Hz.kind === 'zap' || Hz.kind === 'shock' ? 'rgba(255,240,140,.85)' : Hz.kind === 'steam' ? 'rgba(255,255,255,.75)' : 'rgba(150,130,170,.8)'; ctx.fillRect(Hz.x, Hz.y, Hz.w, Hz.h);
  },
  shot(ctx, S, t) {
    if (S.kind === 'beam') { ctx.fillStyle = 'rgba(255,230,120,.35)'; rr(ctx, S.x - 26, S.y - S.r - 3, 52, S.r * 2 + 6, S.r + 3); ctx.fill(); ctx.fillStyle = INK; rr(ctx, S.x - 18, S.y - S.r, 36, S.r * 2, S.r); ctx.fill(); ctx.fillStyle = '#ffe36a'; rr(ctx, S.x - 16, S.y - S.r + 2, 32, S.r * 2 - 4, S.r - 2); ctx.fill(); ctx.fillStyle = '#fffbe0'; rr(ctx, S.x - 12, S.y - 2, 24, 3, 1.5); ctx.fill(); return; }
    const m = S.kind === 'spore' ? ['#c8dca0', '#8aa060', '#f0ffd8'] : S.kind === 'drop' ? ['#b8c8e0', '#7088b0', '#ffffff'] : S.kind === 'orb' ? ['#c0a0e0', '#7a5aa8', '#f0e0ff'] : S.kind === 'petal' ? ['#ff9ac8', '#d05a90', '#fff'] : ['#a49db4', '#6b6484', '#dcd8e6'];
    ball(ctx, S.x, S.y, S.r * 0.8, m, 1.8);
  },
  drop(ctx, D, t) { const s = 3.2; ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(D.x, D.y - s * 1.9); ctx.quadraticCurveTo(D.x + s * 1.6, D.y + s * 0.4, D.x, D.y + s * 1.3); ctx.quadraticCurveTo(D.x - s * 1.6, D.y + s * 0.4, D.x, D.y - s * 1.9); ctx.fill(); ctx.fillStyle = '#8fe0ff'; circle(ctx, D.x, D.y + 0.2, s * 0.9); ctx.fill(); ctx.fillStyle = '#fff'; circle(ctx, D.x - 0.9, D.y - 0.6, 0.8); ctx.fill(); },
  item(ctx, I, t) {
    const x = I.x, y = I.y + Math.sin(t * 0.07) * 2;
    if (I.kind === 'cluster') { for (let k = 0; k < 4; k++) { const a = -PI / 2 + (k - 1.5) * 0.5; ctx.save(); ctx.translate(x, y + 8); ctx.rotate(a + PI / 2); ctx.fillStyle = INK; rr(ctx, -4, -16, 8, 16, 4); ctx.fill(); ctx.fillStyle = I.hurt > 0 ? '#fff' : '#9fe6ff'; rr(ctx, -2.5, -14.5, 5, 13, 2.5); ctx.fill(); ctx.restore(); } return; }
    if (I.kind === 'puddle') { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(I.x, I.y + 6, 13, 5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#7fd8ff'; ctx.beginPath(); ctx.ellipse(I.x, I.y + 6, 11, 3.5, 0, 0, TAU); ctx.fill(); return; }
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(LS.gold, x - 22, y - 22, 44, 44); ctx.globalCompositeOperation = 'source-over';
    const m = I.kind === 'life' ? M3.LEAF : I.kind === 'vessel' ? M3.SUN : I.kind === 'notch' ? M3.STONE : I.kind === 'charm' ? M3.ROSE : M3.GOLD;
    ctx.save(); ctx.translate(x, y); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, 8.5, 10.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = m[0]; ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 8.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = m[2]; ctx.beginPath(); ctx.ellipse(-2, -3, 2, 3, -0.4, 0, TAU); ctx.fill(); ctx.restore();
    twinkle(ctx, x + 8, y - 8, 3 + Math.sin(t * 0.2), t * 0.05, '#fff');
  },
  flower(ctx, Fl, t) {
    const k = Fl.kind | 0, c = FLC[k] || FLC[6], d = Fl.ceil ? -1 : 1, x = Fl.x, y = Fl.y, grow = clamp01((Fl.t == null ? 999 : Fl.t) / 20), sway = Math.sin(t * 0.04 + (Fl.seed || 0)) * 0.12, hgt = (12 + ((Fl.seed || 0) % 5)) * grow;
    if (grow <= 0) return;
    const hx = x + Math.sin(sway) * hgt, hy = y - d * Math.cos(sway) * hgt;
    ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x, y - d * hgt * 0.5, hx, hy); ctx.stroke(); ctx.strokeStyle = '#5fb048'; ctx.lineWidth = 1.6; ctx.stroke();
    leaf(ctx, x, y - d * hgt * 0.35, d > 0 ? -0.5 : 0.5, 6 * grow, M3.LEAF, 1.4);
    const pr = 4.2 * grow; ctx.fillStyle = INK; for (let p = 0; p < 5; p++) { const a = p * TAU / 5 + sway; circle(ctx, hx + Math.cos(a) * pr * 0.75, hy + Math.sin(a) * pr * 0.75, pr * 0.62 + 1.3); ctx.fill(); }
    ctx.fillStyle = c[0]; for (let p = 0; p < 5; p++) { const a = p * TAU / 5 + sway; circle(ctx, hx + Math.cos(a) * pr * 0.75, hy + Math.sin(a) * pr * 0.75, pr * 0.62); ctx.fill(); }
    ctx.fillStyle = k === 3 ? '#7a4a2a' : '#ffd93b'; circle(ctx, hx, hy, pr * 0.42); ctx.fill();
  },
  bud(ctx, B, t) { const d = B.ceil ? -1 : 1, x = B.x, y = B.y; ctx.strokeStyle = INK; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - d * 9); ctx.stroke(); ctx.strokeStyle = '#5fb048'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y - d * 12, 5.5, 6.5, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#7ec860'; ctx.beginPath(); ctx.ellipse(x, y - d * 12, 3.8, 4.8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffe2ec'; ctx.beginPath(); ctx.ellipse(x, y - d * 15, 1.6, 2, 0, 0, TAU); ctx.fill(); },
  gate(ctx, Gt, t, area) {
    const o = clamp01(Gt.o || 0); if (o >= 0.999) return;
    const x = Gt.x, y = Gt.y, w = Gt.w, h = Gt.h, A = areaOf(area), m = Gt.kind === 'sun' ? M3.GOLD : Gt.kind === 'seal' ? ['#c8a0ff', '#8a5ad8', '#f0e0ff'] : A.root;
    ctx.save(); ctx.beginPath(); ctx.rect(x - 4, y - 4, w + 8, h + 8); ctx.clip();
    if (Gt.vert) { const yy = y - h * o; for (let bx = x + 3; bx < x + w; bx += 7) { ctx.fillStyle = INK; rr(ctx, bx - 1.5, yy, 7, h, 3.5); ctx.fill(); ctx.fillStyle = m[0]; rr(ctx, bx, yy + 1.5, 4, h - 3, 2); ctx.fill(); ctx.fillStyle = m[2]; ctx.fillRect(bx + 0.8, yy + 3, 1.2, h - 8); } }
    else { const xx = x - w * o; for (let by = y + 3; by < y + h; by += 7) { ctx.fillStyle = INK; rr(ctx, xx, by - 1.5, w, 7, 3.5); ctx.fill(); ctx.fillStyle = m[0]; rr(ctx, xx + 1.5, by, w - 3, 4, 2); ctx.fill(); } }
    ctx.restore();
  },
  lever(ctx, Lv, t) { const x = Lv.x, y = Lv.y; ctx.fillStyle = INK; rr(ctx, x - 9, y - 7, 18, 8, 3); ctx.fill(); ctx.fillStyle = '#8a7a9a'; rr(ctx, x - 7, y - 5.5, 14, 5, 2); ctx.fill(); const a = Lv.on ? 0.6 : -0.6; ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + Math.sin(a) * 15, y - 5 - Math.cos(a) * 15); ctx.stroke(); ctx.strokeStyle = '#b9774a'; ctx.lineWidth = 2.2; ctx.stroke(); ball(ctx, x + Math.sin(a) * 15, y - 5 - Math.cos(a) * 15, 3.5, Lv.on ? M3.LEAF : M3.ROSE, 1.8); },
  switch(ctx, Sw, t) { ctx.globalCompositeOperation = 'lighter'; if (Sw.on) ctx.drawImage(LS.gold, Sw.x - 24, Sw.y - 24, 48, 48); ctx.globalCompositeOperation = 'source-over'; ball(ctx, Sw.x, Sw.y, 8, Sw.on ? M3.SUN : M3.STONE, 2.2); ctx.fillStyle = INK; STAR(ctx, Sw.x, Sw.y, 4.5, 2, 6, t * 0.02); ctx.fill(); },
  spot(ctx, Sp, t) { const x = Sp.x, y = Sp.y; ctx.fillStyle = INK; rr(ctx, x - 13, y - 12, 26, 13, 5); ctx.fill(); ctx.fillStyle = '#8a7aa8'; rr(ctx, x - 11, y - 10, 22, 10, 4); ctx.fill(); ctx.fillStyle = Sp.lit ? '#7fe0ff' : '#6aa8c8'; ctx.beginPath(); ctx.ellipse(x, y - 9, 9, 2.5, 0, 0, TAU); ctx.fill(); if (Sp.lit) { for (let i = 0; i < 3; i++) { const p = ((t + i * 20) % 60) / 60; ctx.globalAlpha = 1 - p; ctx.fillStyle = '#bff0ff'; circle(ctx, x + (i - 1) * 5, y - 12 - p * 14, 1.6); ctx.fill(); } ctx.globalAlpha = 1; } leaf(ctx, x - 8, y - 11, -PI / 2 - 0.5, 7, M3.LEAF, 1.4); },
  npc(ctx, N, t) { const x = N.x, y = N.y; ctx.fillStyle = INK; rr(ctx, x - 22, y - 22, 44, 22, 5); ctx.fill(); ctx.fillStyle = '#b9774a'; rr(ctx, x - 20, y - 20, 40, 18, 4); ctx.fill(); ctx.fillStyle = INK; circle(ctx, x - 13, y, 6); ctx.fill(); circle(ctx, x + 13, y, 6); ctx.fill(); ctx.fillStyle = '#8a5530'; circle(ctx, x - 13, y, 4); ctx.fill(); circle(ctx, x + 13, y, 4); ctx.fill(); portraitSI(ctx, 'peddler', x, y - 38, 34, t); },
  sign(ctx, Sg, t) { const x = Sg.x, y = Sg.y; ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 18); ctx.stroke(); ctx.strokeStyle = '#8a5530'; ctx.lineWidth = 2.6; ctx.stroke(); ctx.fillStyle = INK; rr(ctx, x - 12, y - 30, 24, 15, 3.5); ctx.fill(); ctx.fillStyle = '#d29a62'; rr(ctx, x - 10, y - 28, 20, 11, 2.5); ctx.fill(); ctx.strokeStyle = '#8a5530'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 6, y - 24.5); ctx.lineTo(x + 6, y - 24.5); ctx.moveTo(x - 6, y - 21); ctx.lineTo(x + 3, y - 21); ctx.stroke(); },
  plat(ctx, Pl, t, area) { ledge(ctx, areaOf(area), Pl.x, Pl.y, Pl.w, 0, 0, false, false); },
  vent(ctx, Vt, t) { const x = Vt.x, y = Vt.y; ctx.fillStyle = INK; rr(ctx, x - 12, y - 9, 24, 10, 3); ctx.fill(); ctx.fillStyle = Vt.tell ? '#ffb070' : '#b87040'; rr(ctx, x - 10, y - 7.5, 20, 7, 2); ctx.fill(); ctx.fillStyle = INK; for (let k = -1; k <= 1; k++) ctx.fillRect(x + k * 6 - 1, y - 6, 2, 4); },
  cap(ctx, Cp, t) { const sq = Cp.squash || 0; glowShroom(ctx, Cp.x, Cp.y, 9 * (1 + sq * 0.3), '#8ff0ff'); },
  icon(ctx, name, x, y, s, t) { iconSI(ctx, name, x, y, s, t); },
  portrait(ctx, who, x, y, s, t, mood) { portraitSI(ctx, who, x, y, s, t, mood); }
};
function fluffBall(ctx, x, y, r) { ctx.fillStyle = 'rgba(255,255,255,.9)'; circle(ctx, x, y, r); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); for (let k = 0; k < 8; k++) { const a = k * TAU / 8; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5); } ctx.stroke(); }
function iconSI(ctx, name, x, y, s, t) {
  const n = String(name || ''), h = s / 2;
  if (n === 'leaf' || n === 'leafBark' || n === 'leafEmpty') {
    const m = n === 'leaf' ? M3.LEAF : n === 'leafBark' ? ['#c8945e', '#8a5a34', '#f0d0a8'] : ['#4a3f62', '#3a3050', '#5a4f74'];
    ctx.save(); ctx.translate(x - h * 0.75, y + h * 0.6); ctx.rotate(-0.75); leafPath(ctx, s * 1.1, s * 0.42); ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.6, s * 0.13); ctx.stroke(); ctx.fillStyle = m[0]; ctx.fill(); if (n !== 'leafEmpty') { ctx.fillStyle = m[2]; ctx.beginPath(); ctx.ellipse(s * 0.45, -s * 0.12, s * 0.18, s * 0.08, 0, 0, TAU); ctx.fill(); } ctx.strokeStyle = m[1]; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(s * 0.1, 0); ctx.lineTo(s * 0.85, 0); ctx.stroke(); ctx.restore(); return;
  }
  if (n === 'dew' || n === 'puddle') { ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x, y - h * 1.05); ctx.quadraticCurveTo(x + h * 0.95, y + h * 0.25, x, y + h * 0.85); ctx.quadraticCurveTo(x - h * 0.95, y + h * 0.25, x, y - h * 1.05); ctx.fill(); ctx.fillStyle = '#8fe0ff'; ctx.beginPath(); ctx.moveTo(x, y - h * 0.72); ctx.quadraticCurveTo(x + h * 0.7, y + h * 0.25, x, y + h * 0.62); ctx.quadraticCurveTo(x - h * 0.7, y + h * 0.25, x, y - h * 0.72); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x - h * 0.2, y + h * 0.05, h * 0.12, h * 0.2, 0.3, 0, TAU); ctx.fill(); return; }
  if (n.startsWith('key:')) { const lb = n.slice(4), w = Math.max(s, tw(lb, s * 0.5) + s * 0.5); ctx.fillStyle = INK; rr(ctx, x - w / 2, y - h, w, s, s * 0.22); ctx.fill(); ctx.fillStyle = '#5a4a7b'; rr(ctx, x - w / 2 + 1.5, y - h + 1.5, w - 3, s - 5, s * 0.18); ctx.fill(); text(ctx, lb, x, y - 1.5, s * 0.5, PAL.sun); return; }
  if (n === 'notch' || n === 'notchFull') { ctx.fillStyle = INK; circle(ctx, x, y, h * 0.8); ctx.fill(); ctx.fillStyle = n === 'notchFull' ? '#ffd93b' : '#5a4f74'; circle(ctx, x, y, h * 0.55); ctx.fill(); return; }
  if (n === 'sun' || n === 'vessel') { ball(ctx, x, y, h * 0.75, M3.SUN, 1.6); return; }
  if (n === 'life' || n === 'lifeHalf') { ball(ctx, x, y, h * 0.7, M3.LEAF, 1.6); return; }
  if (n === 'lock') { ctx.fillStyle = INK; rr(ctx, x - h * 0.7, y - h * 0.2, h * 1.4, h * 1.1, 3); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = h * 0.3; ctx.beginPath(); ctx.arc(x, y - h * 0.2, h * 0.45, PI, TAU); ctx.stroke(); return; }
  if (n.startsWith('charm:')) { const id = n.slice(6), hh = hash(id.length * 31 + id.charCodeAt(0), id.charCodeAt(id.length - 1)); const c = ['#ff9abb', '#8fe0ff', '#ffd93b', '#9be87a', '#c8a8ff', '#ffb070'][Math.floor(hh * 6)]; ctx.save(); ctx.translate(x, y); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, h * 0.72, h * 0.9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, h * 0.56, h * 0.74, 0, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(-h * 0.18, -h * 0.3, h * 0.15, h * 0.24, -0.3, 0, TAU); ctx.fill(); ctx.restore(); text(ctx, id.slice(0, 1).toUpperCase(), x, y + 1, s * 0.42, '#fff'); return; }
  if (n.startsWith('ability:')) { ball(ctx, x, y, h * 0.8, M3.GOLD, 2); text(ctx, n.slice(8, 9).toUpperCase(), x, y + 1, s * 0.5, '#fff'); return; }
  if (n === 'spot') { ctx.fillStyle = INK; rr(ctx, x - h * 0.8, y - h * 0.4, h * 1.6, h, 3); ctx.fill(); ctx.fillStyle = '#7fe0ff'; rr(ctx, x - h * 0.6, y - h * 0.25, h * 1.2, h * 0.6, 2); ctx.fill(); return; }
  if (n === 'peddler') { portraitSI(ctx, 'peddler', x, y, s, t); return; }
  if (n === 'guardian') { ctx.fillStyle = INK; STAR(ctx, x, y, h, h * 0.55, 7, 0); ctx.fill(); ctx.fillStyle = '#a49db4'; STAR(ctx, x, y, h * 0.75, h * 0.4, 7, 0); ctx.fill(); return; }
  ball(ctx, x, y, h * 0.6, M3.STONE, 1.6);
}
function portraitSI(ctx, who, x, y, s, t, mood) {
  const h = s / 2;
  if (who === 'peddler') {
    ball(ctx, x, y, h * 0.62, ['#f2cf6a', '#c99a32', '#fff1c0'], Math.max(1.6, s * 0.04));
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y - h * 0.5, h * 0.95, h * 0.2, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#b9774a'; ctx.beginPath(); ctx.ellipse(x, y - h * 0.5, h * 0.88, h * 0.14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = INK; rr(ctx, x - h * 0.45, y - h * 1.05, h * 0.9, h * 0.6, h * 0.15); ctx.fill(); ctx.fillStyle = '#c88a5a'; rr(ctx, x - h * 0.38, y - h * 0.98, h * 0.76, h * 0.5, h * 0.12); ctx.fill();
    ctx.fillStyle = INK; circle(ctx, x - h * 0.22, y - h * 0.05, h * 0.07); ctx.fill(); circle(ctx, x + h * 0.22, y - h * 0.05, h * 0.07); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.03); ctx.beginPath(); ctx.arc(x, y + h * 0.1, h * 0.18, 0.3, PI - 0.3); ctx.stroke();
    return;
  }
  if (who === 'heart') { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(LS.gold, x - s, y - s, s * 2, s * 2); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x, y, h * 0.55, h * 0.7, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.ellipse(x, y, h * 0.47, h * 0.62, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff4c4'; ctx.beginPath(); ctx.ellipse(x - h * 0.15, y - h * 0.25, h * 0.12, h * 0.2, -0.3, 0, TAU); ctx.fill(); return; }
  const m = who === 'marigold' ? ['#ffa04a', '#d9622a', '#ffe0c4'] : ['#7ed957', '#3f9a3a', '#e2ffd2'];
  if (who === 'marigold') { ctx.fillStyle = INK; for (let p = 0; p < 10; p++) { const a = p * TAU / 10; circle(ctx, x + Math.cos(a) * h * 0.62, y - h * 0.1 + Math.sin(a) * h * 0.62, h * 0.3); ctx.fill(); } ctx.fillStyle = '#ffb030'; for (let p = 0; p < 10; p++) { const a = p * TAU / 10; circle(ctx, x + Math.cos(a) * h * 0.62, y - h * 0.1 + Math.sin(a) * h * 0.62, h * 0.24); ctx.fill(); } }
  else { leaf(ctx, x, y - h * 0.5, -PI / 2 - 0.55, h * 0.75, M3.LEAF, Math.max(1.6, s * 0.035)); leaf(ctx, x, y - h * 0.5, -PI / 2 + 0.55, h * 0.65, M3.LEAF, Math.max(1.6, s * 0.035)); }
  ball(ctx, x, y, h * 0.5, m, Math.max(1.6, s * 0.035));
  ctx.fillStyle = INK; circle(ctx, x - h * 0.17, y - h * 0.02, h * 0.07); ctx.fill(); circle(ctx, x + h * 0.17, y - h * 0.02, h * 0.07); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, s * 0.025); ctx.beginPath(); ctx.arc(x, y + h * 0.12, h * 0.13, 0.3, PI - 0.3); ctx.stroke();
  ctx.fillStyle = 'rgba(255,140,120,.6)'; ctx.beginPath(); ctx.ellipse(x - h * 0.32, y + h * 0.12, h * 0.09, h * 0.05, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(x + h * 0.32, y + h * 0.12, h * 0.09, h * 0.05, 0, 0, TAU); ctx.fill();
}
const icon = (ctx, name, x, y, s, t) => callArt('icon', SI.icon, ctx, name, x, y, s, t || TIME);
const portrait = (ctx, who, x, y, s, t, mood) => callArt('portrait', SI.portrait, ctx, who, x, y, s, t || TIME, mood);

/* =====================================================================================================================
   THE FRAME: the whole 640 x 360 world view
   ===================================================================================================================== */
const CAM = { x: 0, y: 0 };
let lastFrameMs = 0;
function drawBg(ctx, cx, cy, r, t) {
  const B = bgFor(r.area);
  ctx.drawImage(B.base, 0, 0, VW, VH);
  layer(ctx, B.l1, cx * 0.16, cy * 0.12);
  if (B.shaft && !r.dark && !LOW) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.45 + 0.12 * Math.sin(t * 0.013); layer(ctx, B.shaft, cx * 0.06, 0, true); ctx.restore(); }
  layer(ctx, B.l2, cx * 0.36, cy * 0.3);
}
function layer(ctx, c, ox, oy, noY) {
  const x0 = -(((ox % VW) + VW) % VW), y0 = noY ? 0 : -(((oy % VH) + VH) % VH);
  for (let x = x0; x < VW; x += VW) for (let y = y0; y < VH; y += VH) ctx.drawImage(c, Math.round(x * R) / R, Math.round(y * R) / R, VW, VH);
}
function frame(ctx, F) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const sim = F && F.sim, r = sim && sim.room; if (!r) return;
  if (!LS) lightSprites();
  if (!RC || RC.room !== r) room(sim);
  const t = num(F.t, TIME), A = RC.A, dark = !!r.dark;
  let cx = num(F.cam && F.cam.x, 0), cy = num(F.cam && F.cam.y, 0);
  const sh = num(F.shake, 0); if (sh > 0) { cx += Math.sin(t * 1.9) * sh * 0.5; cy += Math.cos(t * 2.7) * sh * 0.45; }
  cx = Math.round(cx * R) / R; cy = Math.round(cy * R) / R; CAM.x = cx; CAM.y = cy;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawBg(ctx, cx, cy, r, t);
  ctx.save(); ctx.translate(-cx, -cy);
  /* terrain */
  const kx0 = Math.floor(cx / CHW), kx1 = Math.floor((cx + VW - 0.01) / CHW), ky0 = Math.floor(cy / CHH), ky1 = Math.floor((cy + VH - 0.01) / CHH);
  for (let ky = ky0; ky <= ky1; ky++) for (let kx = kx0; kx <= kx1; kx++) { const c = chunk(kx, ky); ctx.drawImage(c, CPAD * BS, CPAD * BS, CHW * BS, CHH * BS, kx * CHW, ky * CHH, CHW, CHH); }
  drawLive(ctx, r, t, cx, cy);
  ctx.restore();
  /* the colour fades out by 1 - room.colour */
  const col = clamp01(num(r.colour, 1));
  if (col < 0.995) greyOut(ctx, r, col, cx, cy);
  /* everything kind, in full colour */
  ctx.save(); ctx.translate(-cx, -cy);
  const inV = (x, y, m) => x > cx - m && x < cx + VW + m && y > cy - m && y < cy + VH + m;
  /* the gloomy things are grey by their own art; drawn after the fade so their tells (glows, sparks, warnings) keep their colour */
  for (const f of r.foes) if (f.alive && inV(f.x, f.y, 60)) callArt('foe', SI.foe, ctx, f, t);
  if (r.guard) callArt('guardian', SI.guardian, ctx, r.guard, t);
  for (const h of r.hazards) callArt('hazard', SI.hazard, ctx, h, t);
  for (const f of r.flowers) if (inV(f.x, f.y, 40)) callArt('flower', SI.flower, ctx, f, t);
  for (const b of r.buds) if (inV(b.x, b.y, 30)) callArt('bud', SI.bud, ctx, b, t);
  for (const sp of r.spots) if (inV(sp.x, sp.y, 60)) callArt('spot', SI.spot, ctx, sp, t);
  for (const n of r.npcs) if (inV(n.x, n.y, 90)) callArt('npc', SI.npc, ctx, n, t);
  for (const s of r.signs) if (inV(s.x, s.y, 40)) callArt('sign', SI.sign, ctx, s, t);
  for (const l of r.levers) if (inV(l.x, l.y, 40)) callArt('lever', SI.lever, ctx, l, t);
  for (const s of r.switches) if (inV(s.x, s.y, 40)) callArt('switch', SI.switch, ctx, s, t);
  for (const g of r.gates) if (g.x < cx + VW + 20 && g.x + g.w > cx - 20 && g.y < cy + VH + 20 && g.y + g.h > cy - 20) callArt('gate', SI.gate, ctx, g, t, r.area);
  for (const p of r.plats) callArt('plat', SI.plat, ctx, p, t, r.area);
  for (const v of r.vents) if (inV(v.x, v.y, 40)) callArt('vent', SI.vent, ctx, v, t);
  for (const c of r.caps) if (inV(c.x, c.y, 40)) callArt('cap', SI.cap, ctx, c, t);
  for (const it of r.items) if (inV(it.x, it.y, 50)) callArt('item', SI.item, ctx, it, t);
  for (const d of r.drops) if (inV(d.x, d.y, 20)) callArt('drop', SI.drop, ctx, d, t);
  for (let i = sim.players.length - 1; i >= 0; i--) callArt('player', SI.player, ctx, sim.players[i], t);
  for (const s of r.shots) if (inV(s.x, s.y, 60)) callArt('shot', SI.shot, ctx, s, t);
  drawWater(ctx, r, t, cx, cy, col);
  drawParts(ctx, cx, cy, false, dark);
  ctx.restore();
  /* light */
  if (dark) darkLight(ctx, sim, r, t, cx, cy, A);
  else poolLight(ctx, sim, r, t, cx, cy, A);
  if (dark) { ctx.save(); ctx.translate(-cx, -cy); drawParts(ctx, cx, cy, true, dark); ctx.restore(); }
  ctx.globalAlpha = dark ? 0.85 : 0.6; ctx.drawImage(VIG, 0, 0, VW, VH); ctx.globalAlpha = 1;
  const fl = clamp01(num(F.flash, 0)); if (fl > 0) { ctx.globalAlpha = fl; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
  const fd = clamp01(num(F.fade, 0)); if (fd > 0) { ctx.globalAlpha = fd; ctx.fillStyle = '#0c0818'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
  ctx.restore();
  /* when nothing was baked this frame, bake one chunk next to the view so walking on never waits */
  if (!bakesThisFrame && CHUNKS.size < chMax() - 2) {
    const rx0 = Math.floor(-CHW / 2 / CHW), rx1 = Math.floor((r.pw + CHW / 2) / CHW), ry0 = Math.floor(-CHH / 2 / CHH), ry1 = Math.floor((r.ph + CHH / 2) / CHH);
    let best = null, bd = 1e9;
    for (let ky = ky0 - 1; ky <= ky1 + 1; ky++) for (let kx = kx0 - 1; kx <= kx1 + 1; kx++) {
      if (kx < rx0 || kx > rx1 || ky < ry0 || ky > ry1 || chunk(kx, ky, true)) continue;
      const d = Math.abs((kx + 0.5) * CHW - (cx + VW / 2)) + Math.abs((ky + 0.5) * CHH - (cy + VH / 2)); if (d < bd) { bd = d; best = [kx, ky]; }
    }
    if (best) chunk(best[0], best[1]);
  }
  bakesThisFrame = 0;
  lastFrameMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
}
/* fade the colour out by 1 - colour (one 'saturation' fill and a little soot), except, for a moment, around a fresh bloom */
function greyOut(ctx, r, col, cx, cy) {
  const A = 1 - col, soot = r.area === 'cloud' ? '#d8d4e4' : '#a8a0b8';
  const H = []; for (const q of SPLASH) { const x = q.x - cx, y = q.y - cy, rad = (q.big ? 70 : 30) + (q.big ? 260 : 90) * easeOut(q.age / 26) + q.extra, k = clamp01((q.age - q.life * 0.45) / (q.life * 0.55)); if (k < 1 && x > -rad - 20 && x < VW + rad + 20 && y > -rad - 20 && y < VH + rad + 20) H.push(x, y, rad, k); }
  ctx.save(); ctx.fillStyle = '#808080';
  for (let pass = 0; pass < 2; pass++) {
    ctx.globalCompositeOperation = pass ? 'multiply' : 'saturation'; if (pass) ctx.fillStyle = soot;
    const a = pass ? A * 0.3 : A;
    if (!H.length) { ctx.globalAlpha = a; ctx.fillRect(0, 0, VW, VH); continue; }
    ctx.beginPath(); ctx.rect(0, 0, VW, VH); for (let i = 0; i < H.length; i += 4) { ctx.moveTo(H[i] + H[i + 2] + 14, H[i + 1]); ctx.arc(H[i], H[i + 1], H[i + 2] + 14, 0, TAU); }
    ctx.globalAlpha = a; ctx.fill('evenodd');
    for (let i = 0; i < H.length; i += 4) {
      const k = H[i + 3];
      ctx.beginPath(); ctx.arc(H[i], H[i + 1], H[i + 2] + 14, 0, TAU); ctx.moveTo(H[i] + H[i + 2] + 7, H[i + 1]); ctx.arc(H[i], H[i + 1], H[i + 2] + 7, 0, TAU, true); ctx.globalAlpha = a * (0.7 + 0.3 * k); ctx.fill();
      ctx.beginPath(); ctx.arc(H[i], H[i + 1], H[i + 2] + 7, 0, TAU); ctx.moveTo(H[i] + H[i + 2], H[i + 1]); ctx.arc(H[i], H[i + 1], H[i + 2], 0, TAU, true); ctx.globalAlpha = a * (0.4 + 0.6 * k); ctx.fill();
      if (k > 0) { ctx.beginPath(); ctx.arc(H[i], H[i + 1], H[i + 2], 0, TAU); ctx.globalAlpha = a * k; ctx.fill(); }
    }
  }
  ctx.restore();
}
/* crumbling ledges, shadow briars and breakable walls, drawn every frame */
function drawLive(ctx, r, t, cx, cy) {
  const rc = RC, A = rc.A, w = rc.w;
  for (const i of rc.crumbles) {
    const x = (i % w) * TILE, y = ((i / w) | 0) * TILE; if (x < cx - 30 || x > cx + VW + 10 || y < cy - 30 || y > cy + VH + 10) continue;
    const s = r.crumble && r.crumble.get(i); let dx = 0, dy = 0, a = 1;
    if (s) { if (s.st === 'shake') { const k = Math.min(1, s.t / 30); dx = Math.sin(t * 1.9 + i) * (0.6 + k * 1.4); dy = k * 1.5; } else if (s.st === 'gone') { if (s.t < 150) continue; a = (s.t - 150) / 30 * 0.6; } }
    ctx.globalAlpha = a; const c = crumbleImg(A, (i * 7) & 1); ctx.drawImage(c, x - 2 + dx, y - 2 + dy, c.lw, c.lh); ctx.globalAlpha = 1;
  }
  for (const i of rc.briars) {
    const x = (i % w) * TILE + 10, y = ((i / w) | 0) * TILE + 10; if (x < cx - 30 || x > cx + VW + 30 || y < cy - 30 || y > cy + VH + 30) continue;
    const b = r.briar ? r.briar[i] : 0; if (b > 0.985) continue;
    const s = 1 - b * 0.82, tx = (i % w), ty = (i / w) | 0;
    let ax = 0, ay = 0; if (isSolidCode(tileAt(rc, tx, ty + 1))) ay = 10; else if (isSolidCode(tileAt(rc, tx, ty - 1))) ay = -10; else if (isSolidCode(tileAt(rc, tx - 1, ty))) ax = -10; else if (isSolidCode(tileAt(rc, tx + 1, ty))) ax = 10;
    const c = briarImg(i % 3);
    ctx.save(); ctx.globalAlpha = 1 - b * 0.55; ctx.translate(x + ax, y + ay); ctx.rotate(Math.sin(t * 0.05 + i) * 0.05 * (1 + b * 3)); ctx.scale(s, s); ctx.translate(-ax, -ay);
    ctx.drawImage(c, -15, -15, 30, 30); ctx.restore();
  }
  for (const br of r.breaks) {
    if (br.x > cx + VW + 10 || br.x + br.w < cx - 10 || br.y > cy + VH + 10 || br.y + br.h < cy - 10) continue;
    const dmg = clamp(3 - (br.hp == null ? 3 : br.hp), 0, 2), c = breakImg(A, br.w, br.h, dmg), j = br.hurt > 0 ? Math.sin(br.hurt * 2.2) * br.hurt * 0.25 : 0;
    ctx.drawImage(c, br.x - 4 + j, br.y - 4, c.lw, c.lh);
  }
}
function drawWater(ctx, r, t, cx, cy, col) {
  const rc = RC; if (!rc.water) return;
  const b = rc.wbox; if (b[2] < cx || b[0] > cx + VW || b[3] < cy || b[1] > cy + VH) return;
  const base = mix('#8aa0b4', rc.A.water, col);
  ctx.save();
  ctx.globalAlpha = 0.42; ctx.fillStyle = base; ctx.fill(rc.water);
  if (!LOW) {
    if (!CAUS) causticTile();
    if (!CAUSP) { CAUSP = ctx.createPattern(CAUS, 'repeat'); if (CAUSP && CAUSP.setTransform && typeof DOMMatrix !== 'undefined') CAUSP.setTransform(new DOMMatrix().scale(1 / Math.min(2, R))); }
    if (CAUSP) { ctx.clip(rc.water); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.16 + 0.05 * Math.sin(t * 0.03); ctx.fillStyle = CAUSP; const ox = Math.sin(t * 0.011) * 20, oy = (t * 0.15) % 80; ctx.translate(ox, oy); ctx.fillRect(cx - ox - 10, cy - oy - 10, VW + 20, VH + 20); ctx.translate(-ox, -oy); ctx.globalCompositeOperation = 'source-over'; }
  }
  ctx.restore();
  /* the surface: a bright wavy line */
  ctx.save(); ctx.strokeStyle = 'rgba(235,255,255,.85)'; ctx.lineWidth = 1.8; ctx.beginPath();
  const S = rc.surf;
  for (let i = 0; i < S.length; i += 3) { const x0 = S[i], wdt = S[i + 1], y = S[i + 2] + 3; if (x0 > cx + VW || x0 + wdt < cx || y < cy - 10 || y > cy + VH + 10) continue; for (let x = Math.max(x0, cx - 4); x <= Math.min(x0 + wdt, cx + VW + 4); x += 4) { const yy = y + Math.sin(x * 0.13 + t * 0.07) * 1.1 + Math.sin(x * 0.05 - t * 0.045) * 0.8; if (x === Math.max(x0, cx - 4)) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } }
  ctx.stroke();
  /* currents: streaks drifting with the flow */
  const C = rc.currents; if (C.length) {
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let i = 0; i < C.length; i += 3) { const tx = C[i], ty = C[i + 1], d = C[i + 2], x = tx * TILE, y = ty * TILE; if (x < cx - 20 || x > cx + VW || y < cy - 20 || y > cy + VH) continue;
      for (let k = 0; k < 2; k++) { const ph = (((t * 1.4 * d + hash(tx, ty + k) * 20 + k * 10) % 20) + 20) % 20, yy = y + 5 + k * 8 + hash(ty, tx + k) * 3; ctx.moveTo(x + ph, yy); ctx.lineTo(x + ph + d * 6, yy); } }
    ctx.stroke();
  }
  ctx.restore();
}
function drawParts(ctx, cx, cy, glowPass, dark) {
  const x0 = cx - 20, x1 = cx + VW + 20, y0 = cy - 20, y1 = cy + VH + 20;
  for (let i = 0; i < ACT.length; i++) {
    const p = ACT[i]; if (dark && p.gl !== glowPass) continue; if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    const k = p.k, q = p.age / p.life, fade = q > 0.7 ? (1 - q) / 0.3 : 1;
    ctx.globalAlpha = p.a * fade;
    if (k === K.PETAL) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.age * 0.15 + p.w))); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, p.s + 0.9, p.s * 0.6 + 0.9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = p.c; ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = p.c2; ctx.beginPath(); ctx.ellipse(-p.s * 0.3, -p.s * 0.15, p.s * 0.4, p.s * 0.2, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    else if (k === K.SPARK) { const s = p.s * (1 - q * 0.6); if (p.gl) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(LS.warm, p.x - s * 2.5, p.y - s * 2.5, s * 5, s * 5); ctx.globalCompositeOperation = 'source-over'; } twinkle(ctx, p.x, p.y, s, p.r, p.c); }
    else if (k === K.RING) { ctx.strokeStyle = p.c; ctx.lineWidth = p.w * (1 - q) + 0.4; circle(ctx, p.x, p.y, p.s + easeOut(q) * p.grow); ctx.stroke(); }
    else if (k === K.DUST || k === K.SHADOW) { ctx.fillStyle = p.c; circle(ctx, p.x, p.y, p.s * (0.6 + q * 0.8)); ctx.fill(); }
    else if (k === K.FLUFF) { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 0.8; ctx.beginPath(); for (let j = 0; j < 5; j++) { const a = p.r + j * TAU / 5; ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(a) * p.s * 1.6, p.y + Math.sin(a) * p.s * 1.6); } ctx.stroke(); ctx.fillStyle = '#fff'; circle(ctx, p.x, p.y, p.s * 0.5); ctx.fill(); }
    else if (k === K.LEAF) leaf(ctx, p.x, p.y, p.r, p.s, M3.LEAF, 1.3);
    else if (k === K.DROP) { ctx.fillStyle = p.c; circle(ctx, p.x, p.y, p.s); ctx.fill(); }
    else if (k === K.STEAM) { ctx.fillStyle = '#ffffff'; ctx.globalAlpha = p.a * (1 - q); circle(ctx, p.x, p.y, p.s * (1 + q * 1.6)); ctx.fill(); }
    else if (k === K.CHIP) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = INK; ctx.fillRect(-p.s - 0.8, -p.s - 0.8, p.s * 2 + 1.6, p.s * 2 + 1.6); ctx.fillStyle = p.c; ctx.fillRect(-p.s, -p.s, p.s * 2, p.s * 2); ctx.restore(); }
    else if (k === K.MOTE) { const tw2 = 0.6 + 0.4 * Math.sin(p.age * 0.1 + p.w); ctx.globalAlpha = p.a * fade * Math.min(1, p.age / 30) * tw2; if (p.gl) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(LS.w, p.x - p.s * 4, p.y - p.s * 4, p.s * 8, p.s * 8); ctx.globalCompositeOperation = 'source-over'; } ctx.fillStyle = p.c; circle(ctx, p.x, p.y, p.s); ctx.fill(); }
    else if (k === K.STREAK) { ctx.strokeStyle = p.c; ctx.lineWidth = 1.8; ctx.globalAlpha = p.a * Math.sin(q * PI); const wv = Math.sin(p.age * 0.3 + p.w) * 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x - p.vx * 3, p.y - p.vy * 3 + wv, p.x - p.vx * 6, p.y - p.vy * 6); ctx.stroke(); }
    else if (k === K.FLASH) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - q) * 0.9; const s = p.s * (0.6 + q); ctx.drawImage(LS.w, p.x - s, p.y - s, s * 2, s * 2); ctx.globalCompositeOperation = 'source-over'; }
    else if (k === K.BUBBLE) { ctx.strokeStyle = 'rgba(230,255,255,.85)'; ctx.lineWidth = 1; circle(ctx, p.x + Math.sin(p.age * 0.15 + p.w) * 1.5, p.y, p.s); ctx.stroke(); }
    else if (k === K.BLOSSOM) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); const s2 = p.s; ctx.fillStyle = INK; for (let j = 0; j < 5; j++) { const a = j * TAU / 5; circle(ctx, Math.cos(a) * s2 * 0.62, Math.sin(a) * s2 * 0.62, s2 * 0.55 + 0.9); ctx.fill(); } ctx.fillStyle = p.c; for (let j = 0; j < 5; j++) { const a = j * TAU / 5; circle(ctx, Math.cos(a) * s2 * 0.62, Math.sin(a) * s2 * 0.62, s2 * 0.55); ctx.fill(); } ctx.fillStyle = p.c2; circle(ctx, 0, 0, s2 * 0.38); ctx.fill(); ctx.restore(); }
    else if (k === K.STAR) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); STAR(ctx, 0, 0, p.s + 1.4, (p.s + 1.4) * 0.45, 5, 0); ctx.fillStyle = INK; ctx.fill(); STAR(ctx, 0, 0, p.s, p.s * 0.45, 5, 0); ctx.fillStyle = p.c; ctx.fill(); ctx.restore(); }
  }
  ctx.globalAlpha = 1;
}
function darkLight(ctx, sim, r, t, cx, cy, A) {
  const s = LMS(), lw = Math.ceil(VW / s), lh = Math.ceil(VH / s);
  if (!LM || LM.width !== lw || LM.height !== lh) { LM = document.createElement('canvas'); LM.width = lw; LM.height = lh; LMG = LM.getContext('2d'); }
  const g = LMG; g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = A.amb; g.fillRect(0, 0, lw, lh);
  g.globalCompositeOperation = 'lighter';
  const L = (x, y, rad, key, a) => { const X = (x - cx) / s, Y = (y - cy) / s, q = rad / s; if (X + q < 0 || X - q > lw || Y + q < 0 || Y - q > lh || a <= 0) return; g.globalAlpha = Math.min(1, a); g.drawImage(LS[key] || LS.w, X - q, Y - q, q * 2, q * 2); };
  const fl = 1 + Math.sin(t * 0.09) * 0.03;
  for (const p of sim.players) { if (!p.alive && !p.bubble && p.st !== 'faint') continue; const rad = (p.glow ? 140 : 44) * fl; L(p.x, p.y - 14, rad, 'warm', 1); L(p.x, p.y - 14, rad * 0.6, 'w', 0.9); if (p.glow) { L(p.x, p.y - 14, rad * 0.8, 'warm', 0.8); L(p.x, p.y - 14, rad * 1.3, 'warm', 0.45); } }
  const S = RC.lights; for (let i = 0; i < S.length; i += 5) L(S[i], S[i + 1], S[i + 2] * (1 + Math.sin(t * 0.04 + i) * 0.06), S[i + 3], S[i + 4]);
  for (const c of r.caps) L(c.x, c.y - 10, 60, 'cyan', 0.9 + c.squash * 0.4);
  for (const sp of r.spots) L(sp.x, sp.y - 10, sp.lit ? 110 : 80, 'warm', 0.9);
  for (const f of r.foes) if (f.alive && f.kind === 'lantern') L(f.x, f.y, f.st === 'glow' ? 80 : 50, 'green', 0.85);
  for (const it of r.items) L(it.x, it.y, it.kind === 'cluster' ? 50 : 70, it.kind === 'cluster' ? 'cyan' : 'gold', 0.9);
  for (const fl2 of r.flowers) L(fl2.x, fl2.y - (fl2.ceil ? -12 : 12), 34, 'pink', 0.55);
  for (const n of r.npcs) L(n.x, n.y - 30, 80, 'warm', 0.8);
  for (const sw of r.switches) L(sw.x, sw.y, sw.on ? 70 : 30, 'gold', 0.8);
  for (const sh of r.shots) L(sh.x, sh.y, sh.kind === 'beam' ? 80 : sh.kind === 'orb' ? 36 : 22, sh.kind === 'beam' ? 'gold' : sh.kind === 'spore' ? 'green' : 'violet', 0.8);
  if (r.drops.length < 40) for (const d of r.drops) L(d.x, d.y, 14, 'cyan', 0.6);
  for (const b of BURSTS) L(b.x, b.y, b.r * (0.7 + 0.3 * (1 - b.age / b.life)), b.col, 1 - b.age / b.life);
  if (r.guard && r.guard.glow) L(r.guard.x, r.guard.y, 160, 'gold', r.guard.glow);
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(LM, 0, 0, lw * s, lh * s); ctx.restore();
  /* the bright things glow on top */
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(-cx, -cy);
  const H = (x, y, rad, key, a) => { if (x < cx - rad || x > cx + VW + rad || y < cy - rad || y > cy + VH + rad) return; ctx.globalAlpha = a; ctx.drawImage(LS[key], x - rad, y - rad, rad * 2, rad * 2); };
  for (let i = 0; i < S.length; i += 5) H(S[i], S[i + 1], 14, S[i + 3], 0.35);
  for (const c of r.caps) H(c.x, c.y - 12, 20, 'cyan', 0.4);
  ctx.restore();
}
function poolLight(ctx, sim, r, t, cx, cy, A) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(-cx, -cy);
  const H = (x, y, rad, key, a) => { if (x < cx - rad || x > cx + VW + rad || y < cy - rad || y > cy + VH + rad) return; ctx.globalAlpha = a; ctx.drawImage(LS[key] || LS.w, x - rad, y - rad, rad * 2, rad * 2); };
  const S = RC.lights; for (let i = 0; i < S.length; i += 5) H(S[i], S[i + 1], S[i + 2] * 0.8, S[i + 3], 0.16);
  for (const sp of r.spots) H(sp.x, sp.y - 12, 70, 'warm', sp.lit ? 0.32 : 0.2);
  for (const c of r.caps) H(c.x, c.y - 10, 40, 'cyan', 0.22);
  for (const n of r.npcs) H(n.x, n.y - 30, 70, 'warm', 0.16);
  for (const it of r.items) if (it.kind !== 'cluster' && it.kind !== 'puddle') H(it.x, it.y, 40, 'gold', 0.3);
  for (const f of r.foes) if (f.alive && f.kind === 'lantern' && f.st === 'glow') H(f.x, f.y, 50, 'green', 0.3);
  for (const sh of r.shots) if (sh.kind === 'beam') H(sh.x, sh.y, 50, 'gold', 0.45);
  for (const b of BURSTS) H(b.x, b.y, b.r * 0.6, b.col, 0.4 * (1 - b.age / b.life));
  if (r.guard && r.guard.glow) H(r.guard.x, r.guard.y, 140, 'gold', r.guard.glow * 0.5);
  ctx.restore();
}

/* =====================================================================================================================
   HUD: leaves, the sun-seed jar, dew, the interaction prompt, toasts
   ===================================================================================================================== */
const LV = [{ n: -1, t: 0, d: 0 }, { n: -1, t: 0, d: 0 }];
function sunJar(ctx, x, y, r, p, t) {
  const k = clamp01(num(p.sun, 0) / Math.max(1, num(p.sunMax, 99))), ready = num(p.sun, 0) >= 33;
  if (ready) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 + 0.12 * Math.sin(t * 0.08); ctx.drawImage(LS.gold, x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4); ctx.restore(); }
  /* cork and sprout */
  ctx.fillStyle = INK; rr(ctx, x - r * 0.42 - 2, y - r - 7, r * 0.84 + 4, 10, 3.5); ctx.fill(); ctx.fillStyle = '#c88a5a'; rr(ctx, x - r * 0.42, y - r - 5.5, r * 0.84, 7, 2.5); ctx.fill();
  leaf(ctx, x + 1, y - r - 6, -PI / 2 + 0.7 + Math.sin(t * 0.05) * 0.1, 8, M3.LEAF, 1.5); leaf(ctx, x - 1, y - r - 6, -PI / 2 - 0.8 + Math.sin(t * 0.05 + 1) * 0.1, 6.5, M3.LEAF, 1.5);
  ctx.fillStyle = INK; circle(ctx, x, y, r + 2.6); ctx.fill();
  ctx.fillStyle = '#4a3f78'; circle(ctx, x, y, r); ctx.fill(); ctx.fillStyle = '#3a3064'; circle(ctx, x + 1.5, y + 2, r - 3); ctx.fill();
  ctx.save(); circle(ctx, x, y, r - 1.2); ctx.clip();
  const top = y + r - k * r * 2;
  if (k > 0) {
    ctx.fillStyle = '#f0a020'; ctx.fillRect(x - r, top, r * 2, r * 2);
    ctx.fillStyle = '#ffcf3f'; ctx.beginPath(); ctx.moveTo(x - r, y + r); for (let xx = -r; xx <= r; xx += 2) ctx.lineTo(x + xx, top + Math.sin(xx * 0.4 + t * 0.12) * 1.1); ctx.lineTo(x + r, y + r); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,200,.85)'; ctx.fillRect(x - r, top - 0.6 + Math.sin(t * 0.12) * 0.5, r * 2, 1.4);
    for (let i = 0; i < 3; i++) { const q = ((t * 0.6 + i * 23) % 40) / 40, bx = x + (i - 1) * r * 0.45; if (top < y + r - 4) { ctx.fillStyle = 'rgba(255,250,210,.7)'; circle(ctx, bx, y + r - 3 - q * (y + r - top - 4), 1); ctx.fill(); } }
  }
  /* a tick for each Focus worth of sunlight */
  const n = Math.round(num(p.sunMax, 99) / 33);
  ctx.strokeStyle = 'rgba(43,33,64,.5)'; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let i = 1; i < n; i++) { const yy = y + r - (i / n) * r * 2, hw = Math.sqrt(Math.max(0, r * r - (yy - y) * (yy - y))); ctx.moveTo(x - hw, yy); ctx.lineTo(x - hw + 5, yy); ctx.moveTo(x + hw - 5, yy); ctx.lineTo(x + hw, yy); }
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.45, r * 0.26, r * 0.14, -0.7, 0, TAU); ctx.fill();
  if (p.focus > 0.01) { ctx.strokeStyle = INK; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.arc(x, y, r + 5.5, -PI / 2, -PI / 2 + TAU * p.focus); ctx.stroke(); ctx.strokeStyle = '#c8ffa0'; ctx.lineWidth = 2.4; ctx.stroke(); }
}
function playerHud(ctx, p, side, t, sim) {
  const L = LV[side]; if (L.n < 0) L.n = p.leaves; if (p.leaves !== L.n) { L.d = p.leaves - L.n; L.t = t; L.i = p.leaves < L.n ? p.leaves : p.leaves - 1; L.n = p.leaves; }
  const R0 = 18, jx = side ? VW - 30 : 30, jy = 32, dir = side ? -1 : 1;
  sunJar(ctx, jx, jy, R0, p, t);
  const n = Math.max(1, num(p.maxLeaves, 5)), sp = n > 9 ? 14 : 17, s = n > 9 ? 13 : 15;
  for (let i = 0; i < n; i++) {
    const x = jx + dir * (32 + i * sp), y = 20; let name = i < p.leaves ? 'leaf' : 'leafEmpty';
    if (p.bark && i === n - 1 && i < p.leaves) name = 'leafBark';
    let sc = 1, dy = 0, a = 1; const age = t - L.t;
    if (i === L.i && age < 24) { if (L.d < 0) { sc = 1 + Math.sin(age / 24 * PI) * 0.4; } else { sc = 0.4 + easeOut(age / 14) * 0.6 + Math.sin(clamp01(age / 24) * PI) * 0.25; } }
    if (sc !== 1) { ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); icon(ctx, name, 0, 0, s, t); ctx.restore(); } else icon(ctx, name, x, y + dy, s, t);
    if (i === L.i && L.d < 0 && age < 40) { const q = age / 40; ctx.save(); ctx.globalAlpha = a * (1 - q); ctx.translate(x + Math.sin(q * 6) * 6, y + q * 26); ctx.rotate(q * 3); icon(ctx, 'leaf', 0, 0, s * 0.9, t); ctx.restore(); }
  }
  if (side === 0) {
    const d = Math.round(dewShow), pop = dewShow !== dewSeen ? 1.12 : 1, x = jx + 32 + 2, y = 44;
    icon(ctx, 'dew', x, y, 13, t);
    ctx.save(); ctx.translate(x + 10, y + 1); ctx.scale(pop, pop); text(ctx, String(d), 0, 0, 14, '#dff6ff', 'left'); ctx.restore();
  }
}
function hud(ctx, H) {
  const sim = H && H.sim; if (!sim || !sim.players) return;
  if (!LS) lightSprites();
  const t = num(H.t, TIME);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (sim.players[0]) playerHud(ctx, sim.players[0], 0, t, sim);
  if (H.two && sim.players[1]) playerHud(ctx, sim.players[1], 1, t, sim);
  const pr = H.prompt;
  if (pr && pr.text) {
    const cam = H.cam || CAM, x = Math.round((num(pr.x, 0) - num(cam.x, 0)) * 2) / 2, y = num(pr.y, 0) - num(cam.y, 0) + Math.sin(t * 0.08) * 1.5, w = tw(pr.text, 12) + 18, hh = 22;
    if (x > -40 && x < VW + 40 && y > -20 && y < VH + 20) {
      const bx = clamp(x - w / 2, 4, VW - w - 4);
      ctx.fillStyle = INK; rr(ctx, bx - 2, y - hh / 2 - 2, w + 4, hh + 4, 12); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 6, y + hh / 2); ctx.lineTo(x, y + hh / 2 + 7); ctx.lineTo(x + 6, y + hh / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a4a7b'; rr(ctx, bx, y - hh / 2, w, hh, 10); ctx.fill(); ctx.beginPath(); ctx.moveTo(x - 4, y + hh / 2 - 1); ctx.lineTo(x, y + hh / 2 + 4); ctx.lineTo(x + 4, y + hh / 2 - 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; rr(ctx, bx + 5, y - hh / 2 + 2, w - 10, 4, 2); ctx.fill();
      text(ctx, pr.text, bx + w / 2, y + 0.5, 12, '#fff');
    }
  }
  const msg = H.msg && (typeof H.msg === 'string' ? H.msg : H.msg.text);
  if (msg) {
    const L = wrap(msg, 13, 420), w = Math.min(460, Math.max(...L.map(s => tw(s, 13))) + 34), hh = L.length * 17 + 14, y = H.touch ? 64 : VH - 18 - hh;
    ctx.globalAlpha = 0.95; ctx.fillStyle = INK; rr(ctx, VW / 2 - w / 2 - 2, y - 2, w + 4, hh + 4, 14); ctx.fill(); ctx.fillStyle = 'rgba(74,58,107,.95)'; rr(ctx, VW / 2 - w / 2, y, w, hh, 12); ctx.fill(); ctx.globalAlpha = 1;
    leaf(ctx, VW / 2 - w / 2 + 2, y + 4, -2.4, 9, M3.LEAF, 1.5);
    L.forEach((s, i) => text(ctx, s, VW / 2, y + 7 + 8.5 + i * 17, 13, '#fff'));
  }
  ctx.restore();
}

/* =====================================================================================================================
   SCREENS
   ===================================================================================================================== */
const UI = { rows: [], chips: [], back: null, ok: null };
function resetUI() { UI.rows.length = 0; UI.chips.length = 0; UI.back = null; UI.ok = null; }
const setR = (x, y, w, h) => ({ x, y, w, h });
function card(ctx, x, y, w, h, fill, rad) {
  rad = rad || 18;
  ctx.fillStyle = INK; rr(ctx, x - 3, y - 3 + 3, w + 6, h + 6, rad + 3); ctx.fill();
  ctx.fillStyle = fill || 'rgba(64,48,98,.95)'; rr(ctx, x, y, w, h, rad); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 2; rr(ctx, x + 4, y + 4, w - 8, h - 8, rad - 4); ctx.stroke();
}
function sprigCorner(ctx, x, y, s, t) { leaf(ctx, x, y, -2.3 + Math.sin(t * 0.04) * 0.06, 13 * s, M3.LEAF, 1.8); leaf(ctx, x, y, -0.9 + Math.sin(t * 0.04 + 1) * 0.06, 10 * s, M3.LEAF, 1.8); }
function pill(ctx, x, y, w, h, col, sel) {
  ctx.fillStyle = INK; rr(ctx, x - 2.5, y - 2.5 + (sel ? 3 : 2), w + 5, h + 5, h / 2 + 2.5); ctx.fill();
  ctx.fillStyle = col; rr(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.4)'; rr(ctx, x + h * 0.35, y + 3, w - h * 0.7, Math.max(2, h * 0.16), h * 0.08); ctx.fill();
  if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; rr(ctx, x - 5, y - 5, w + 10, h + 10, h / 2 + 5); ctx.stroke(); }
}
function dim(ctx, a) { ctx.fillStyle = 'rgba(20,12,36,' + a + ')'; ctx.fillRect(0, 0, VW, VH); }
function keycap(ctx, x, y, s, w) { w = Math.max(w || 22, tw(s, 12) + 12); ctx.fillStyle = INK; rr(ctx, x - w / 2, y - 11, w, 22, 5); ctx.fill(); ctx.fillStyle = '#4a3a6b'; rr(ctx, x - w / 2 + 1.5, y - 9.5, w - 3, 17, 4); ctx.fill(); text(ctx, s, x, y - 1, 12, PAL.sun); return w; }
function backBtn(ctx, touch, t) {
  const x = 12, y = VH - 40, w = touch ? 86 : 104;
  pill(ctx, x, y, w, 28, 'rgba(90,72,130,.95)', false); text(ctx, touch ? '◀ Back' : 'Esc  Back', x + w / 2, y + 14.5, 13, '#fff');
  UI.back = setR(x - 6, y - 6, w + 12, 40);
}
function sndIcon(ctx, x, y, music, on) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.6, 1.6);
  ctx.fillStyle = ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
  if (music) { ctx.beginPath(); ctx.ellipse(-1.4, 2.4, 1.7, 1.3, -0.4, 0, TAU); ctx.fill(); ctx.fillRect(-0.1, -3.6, 1, 6); ctx.beginPath(); ctx.moveTo(0.4, -3.6); ctx.quadraticCurveTo(3.4, -2.4, 2.6, 0.2); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-3.4, -1.3); ctx.lineTo(-1.6, -1.3); ctx.lineTo(0.6, -3.4); ctx.lineTo(0.6, 3.4); ctx.lineTo(-1.6, 1.3); ctx.lineTo(-3.4, 1.3); ctx.closePath(); ctx.fill(); if (on) { ctx.beginPath(); ctx.arc(1, 0, 2.4, -0.8, 0.8); ctx.stroke(); ctx.beginPath(); ctx.arc(1, 0, 4.2, -0.8, 0.8); ctx.stroke(); } }
  if (!on) { ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-3.4, 3.6); ctx.lineTo(3.6, -3.6); ctx.stroke(); ctx.strokeStyle = '#ffb27a'; ctx.lineWidth = 1.2; ctx.stroke(); }
  ctx.restore();
}
function sndChip(ctx, x, right, key, music, on, touch) {
  const lbl = (music ? 'MUSIC ' : 'SOUND ') + (on ? 'ON' : 'OFF'), w = (touch ? 0 : 24) + 26 + tw(lbl, 12) + 12, x0 = right ? x - w : x, y0 = 8, h = 26;
  ctx.fillStyle = 'rgba(30,20,48,.6)'; rr(ctx, x0, y0, w, h, 13); ctx.fill();
  let cx = x0 + 7;
  if (!touch) { ctx.fillStyle = INK; rr(ctx, cx, y0 + 4, 18, 18, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; rr(ctx, cx, y0 + 4, 18, 18, 4); ctx.stroke(); text(ctx, key, cx + 9, y0 + 13, 10.5, PAL.sun); cx += 24; }
  sndIcon(ctx, cx + 8, y0 + 13, music, on); text(ctx, lbl, cx + 19, y0 + 13.5, 12, on ? '#fff' : '#d9d3f0', 'left');
  UI.chips.push(setR(x0 - 4, 0, w + 8, y0 + h + 8));
}
const AREACOL = { rootgate: '#f0c08e', mossy: '#aee68e', glowcap: '#b0a8f6', pipes: '#f4ae80', crystal: '#a4ecf4', cloud: '#eef0ff', heart: '#e8a8e6' };
/* the title: a cosy cross-section of the roots, the grey garden above */
let TBG = null;
function titleBg() {
  if (TBG && TBG.R === R) return TBG;
  TBG = sprite(VW, VH, g => {
    const gr = g.createLinearGradient(0, 0, 0, VH); gr.addColorStop(0, '#2a1d3a'); gr.addColorStop(0.45, '#3a2440'); gr.addColorStop(1, '#22162a'); g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
    softGlow(g, 320, 80, 260, '#ffb060', 0.16); softGlow(g, 160, 260, 200, '#7fd0ff', 0.08);
    /* far roots */
    for (let i = 0; i < 9; i++) { const x = 30 + i * 72 + hash(i, 3) * 30; g.strokeStyle = 'rgba(70,44,60,.9)'; g.lineWidth = 10 + hash(i, 4) * 12; g.beginPath(); g.moveTo(x, 20); g.bezierCurveTo(x + 40 * (hash(i, 5) - 0.5), 120, x - 50 * (hash(i, 6) - 0.5), 220, x + 30 * (hash(i, 7) - 0.5), 380); g.stroke(); }
    /* the grey garden above */
    g.fillStyle = '#b4b0c0'; g.fillRect(0, 0, VW, 22);
    for (let i = 0; i < 4; i++) puff(g, 60 + i * 170 + hash(i, 4) * 40, 6, 12 + hash(i, 5) * 6, '#c8c4d2', null, null);
    for (let i = 0; i < 16; i++) { const x = 14 + i * 41 + hash(i, 1) * 18, h = 12 + hash(i, 6) * 8; g.strokeStyle = INK; g.lineWidth = 3.4; g.beginPath(); g.moveTo(x, 34); g.lineTo(x + (hash(i, 7) - 0.5) * 6, 34 - h); g.stroke(); g.strokeStyle = '#8a8698'; g.lineWidth = 1.6; g.stroke(); const fx = x + (hash(i, 7) - 0.5) * 6, fy = 34 - h; g.fillStyle = INK; circle(g, fx, fy, 5.6); g.fill(); g.fillStyle = '#a8a4b4'; for (let k = 0; k < 5; k++) { const a = k * TAU / 5; circle(g, fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 2.3); g.fill(); } g.fillStyle = '#7a7688'; circle(g, fx, fy, 1.6); g.fill(); }
    g.fillStyle = INK; g.fillRect(0, 30, VW, 30); g.fillStyle = '#7c788a'; g.fillRect(0, 33, VW, 6);
    g.fillStyle = '#9a96a8'; for (let x = 0; x < VW; x += 5) { const h = 3 + hash(x, 9) * 6; g.beginPath(); g.moveTo(x - 2, 35); g.lineTo(x + 1, 35 - h); g.lineTo(x + 4, 35); g.fill(); }
    /* soil band */
    g.fillStyle = '#5a3a34'; g.fillRect(0, 39, VW, 20); g.fillStyle = INK; g.fillRect(0, 58, VW, 3);
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(140,96,70,.8)'; g.beginPath(); g.ellipse(hash(i, 2) * VW, 44 + hash(i, 3) * 11, 2.5, 1.8, 0, 0, TAU); g.fill(); }
    /* big roots coming down, inked */
    const root = (pts, w) => { g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 6) g.bezierCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]); g.strokeStyle = INK; g.lineWidth = w + 5; g.stroke(); g.strokeStyle = '#8a5a3c'; g.lineWidth = w; g.stroke(); g.strokeStyle = '#b07a52'; g.lineWidth = w * 0.35; g.stroke(); };
    root([40, 56, 60, 120, 10, 180, 30, 260], 18); root([110, 58, 120, 90, 90, 130, 70, 170], 9);
    root([600, 56, 580, 130, 640, 200, 610, 300], 20); root([520, 58, 520, 100, 560, 130, 570, 170], 8);
    root([250, 58, 246, 74, 232, 84, 220, 100], 5); root([410, 58, 414, 76, 436, 86, 446, 104], 5);
    /* the root Sprig sits on */
    g.fillStyle = INK; rr(g, -20, 274, 330, 34, 17); g.fill(); g.fillStyle = '#8a5a3c'; rr(g, -18, 277, 324, 28, 14); g.fill(); g.fillStyle = '#b07a52'; rr(g, -10, 279, 300, 9, 4.5); g.fill();
    g.strokeStyle = 'rgba(80,50,34,.7)'; g.lineWidth = 1.5; g.beginPath(); for (let x = 0; x < 290; x += 22) { g.moveTo(x, 292 + hash(x, 1) * 6); g.lineTo(x + 14, 292 + hash(x, 2) * 6); } g.stroke();
    blobs(g, [[40, 276, 5], [52, 275, 6], [64, 276, 4.5], [190, 276, 5], [202, 275, 4], [250, 276, 5.5]], '#86d65e', 1.8, '#cdf7a0');
    miniFlower(g, 222, 276, '#ff9ac8', 9); miniFlower(g, 30, 276, '#ffd93b', 7);
  });
  TBG.R = R; return TBG;
}
function logo(ctx, cx, y, t, s) {
  const word = 'ROOTLIGHT', sz = 60 * s, cols = ['#b8ec7a', '#d6f7a0', '#b8ec7a', '#d6f7a0', '#ffe27a', '#fff2b0', '#ffe27a', '#fff2b0', '#ffe27a'];
  const ws = []; let total = 0; for (const ch of word) { const w = tw(ch, sz) + 2 * s; ws.push(w); total += w; }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.06 * Math.sin(t * 0.05); ctx.drawImage(LS.gold, cx + total * 0.05 - 150 * s, y - 120 * s, 300 * s, 240 * s); ctx.restore();
  let x = cx - total / 2, ox = 0;
  for (let i = 0; i < word.length; i++) {
    const w = ws[i], lx = x + w / 2, by = y + Math.sin(t * 0.07 + i * 0.75) * 3 * s;
    if (i === 1) ox = lx;
    ctx.save(); ctx.translate(lx, by); ctx.rotate(Math.sin(t * 0.045 + i * 1.3) * 0.045); text(ctx, word[i], 0, 0, sz, cols[i]); ctx.restore();
    x += w;
  }
  /* a little sprout growing out of the O */
  const sy = y - sz * 0.42 + Math.sin(t * 0.07 + 0.75) * 3 * s, sw = Math.sin(t * 0.05) * 0.12;
  ctx.save(); ctx.translate(ox, sy); ctx.rotate(sw);
  ctx.strokeStyle = INK; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(0, 4 * s); ctx.quadraticCurveTo(-3 * s, -8 * s, 1 * s, -18 * s); ctx.stroke(); ctx.strokeStyle = '#5fb048'; ctx.lineWidth = 2.6 * s; ctx.stroke();
  leaf(ctx, 1 * s, -17 * s, -PI / 2 - 0.85, 15 * s, M3.LEAF, 2.2 * s); leaf(ctx, 1 * s, -17 * s, -PI / 2 + 0.75, 13 * s, M3.LEAF, 2.2 * s);
  ctx.restore();
}
function seeds(ctx, t, n, area) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) { const x = (hash(i, 31) * VW + Math.sin(t * 0.004 + i) * 30 + VW) % VW, y = (hash(i, 32) * VH - t * (0.08 + hash(i, 33) * 0.15) % VH + VH * 2) % VH, a = 0.35 + 0.35 * Math.sin(t * 0.05 + i * 1.7), s = 6 + hash(i, 34) * 8;
    ctx.globalAlpha = a; ctx.drawImage(i % 3 ? LS.warm : LS.green, x - s, y - s, s * 2, s * 2); }
  ctx.restore();
}
function pctFmt(v) { return Math.round(num(v, 0)) + '%'; }
const SCREENS = {
  title(ctx, S) {
    resetUI(); const t = num(S.t, 0), touch = !!S.touch;
    ctx.drawImage(titleBg(), 0, 0, VW, VH);
    seeds(ctx, t, 26);
    logo(ctx, VW / 2, 98, t, 1);
    text(ctx, 'a little sprout, a long way down', VW / 2, 142, 14, '#ffe9c8');
    portrait(ctx, 'sprig', 150, 236, 104, t, 'happy');
    sndChip(ctx, 8, 0, 'M', 0, S.sound !== false, touch); const ga = ctx.globalAlpha; if (S.sound === false) ctx.globalAlpha = 0.6; sndChip(ctx, VW - 8, 1, 'N', 1, S.music !== false, touch); ctx.globalAlpha = ga;
    const rows = S.rows || [], sel = S.sel | 0, x0 = 318, w = 270, rh = 38;
    rows.forEach((r, i) => {
      const y = 164 + i * (rh + 8), on = i === sel, lbl = typeof r === 'string' ? r : r.label, sub = typeof r === 'string' ? '' : r.sub;
      pill(ctx, x0, y, w, rh, on ? ['#5cc85a', '#ff9a45', '#8a7ab8'][i % 3] : 'rgba(255,255,255,.14)', on);
      text(ctx, lbl, x0 + 22, y + (sub ? 14 : 19.5), 16, '#fff', 'left'); if (sub) text(ctx, sub, x0 + 22, y + 28.5, 10.5, on ? '#fffbe8' : '#d9d3f0', 'left');
      if (on) { const bx = x0 + w - 22 + Math.sin(t * 0.15) * 2; leaf(ctx, bx, y + rh / 2, 0, 11, M3.LEAF, 1.6); }
      UI.rows.push(setR(x0 - 4, y - 4, w + 8, rh + 8));
    });
    const keys = S.keys || [];
    if (keys.length) {
      const h = 10 + keys.length * 15, y = VH - h - 8;
      ctx.fillStyle = 'rgba(30,20,48,.72)'; rr(ctx, 312, y, 320, h, 10); ctx.fill();
      keys.forEach((k, i) => { const who = k[0] || '', line = k[1] || '', yy = y + 12 + i * 15, col = /two/i.test(who) ? '#ffb27a' : /one/i.test(who) ? '#b6f07a' : '#e9e3ff'; let x = 322; if (who) x += text(ctx, who, x, yy, 10.5, col, 'left') + 6; ctx.save(); const avail = 632 - 8 - x, ww = tw(line, 10); if (ww > avail) { ctx.translate(x, yy); ctx.scale(avail / ww, 1); text(ctx, line, 0, 0, 10, '#fff', 'left'); } else text(ctx, line, x, yy, 10, '#fff', 'left'); ctx.restore(); });
    }
    if (S.note) text(ctx, S.note, 10, VH - 12, 10, '#d9d3f0', 'left');
  },
  slots(ctx, S) {
    resetUI(); const t = num(S.t, 0), rows = S.rows || [], sel = S.sel | 0;
    ctx.drawImage(titleBg(), 0, 0, VW, VH); dim(ctx, 0.35); seeds(ctx, t, 14);
    text(ctx, 'Choose a garden', VW / 2, 34, 26, PAL.sun);
    rows.forEach((r, i) => {
      const x = 70, y = 62 + i * 84, w = 500, h = 72, on = i === sel, er = S.erase === i;
      card(ctx, x, y, w, h, er ? 'rgba(130,60,80,.95)' : on ? 'rgba(92,72,135,.97)' : 'rgba(58,44,88,.92)', 16);
      if (on) { ctx.strokeStyle = er ? '#ffb0b0' : PAL.sun; ctx.lineWidth = 3; rr(ctx, x - 6, y - 6, w + 12, h + 12, 22); ctx.stroke(); }
      ctx.fillStyle = INK; circle(ctx, x + 30, y + 36, 19); ctx.fill(); ctx.fillStyle = r.empty ? '#5a4a7b' : '#7ed957'; circle(ctx, x + 30, y + 36, 16); ctx.fill(); text(ctx, String(r.n || i + 1), x + 30, y + 37, 18, '#fff');
      if (r.empty) { text(ctx, 'New garden', x + 64, y + 28, 19, '#fff', 'left'); text(ctx, 'Start a fresh adventure under the roots', x + 64, y + 50, 12, '#d9d3f0', 'left'); }
      else {
        text(ctx, r.name || 'Rootgate', x + 64, y + 22, 17, '#fff', 'left'); if (r.room) text(ctx, r.room, x + 64 + tw(r.name || 'Rootgate', 17) + 10, y + 23, 11.5, '#d9d3f0', 'left');
        let lx = x + 72; const ml = Math.min(12, num(r.maxLeaves, 5)); for (let k = 0; k < ml; k++) icon(ctx, 'leaf', lx + k * 12, y + 47, 11, t);
        lx += ml * 12 + 12; icon(ctx, 'dew', lx, y + 47, 11, t); text(ctx, String(r.dew | 0), lx + 9, y + 47.5, 12, '#dff6ff', 'left');
        let ax = x + w - 20; const ab = r.ab || {}; for (const id of ['beam', 'glow', 'puff', 'grip', 'dash']) if (ab[id]) { icon(ctx, 'ability:' + id, ax, y + 22, 16, t); ax -= 20; }
        text(ctx, pctFmt(r.pct), x + w - 20, y + 49, 16, PAL.sun, 'right'); text(ctx, String(r.time || ''), x + w - 66, y + 49, 12, '#e9e3ff', 'right');
        if (r.gentle) { pill(ctx, x + w - 150 - tw(String(r.time || ''), 12), y + 40, 54, 17, '#7ac8a0', false); text(ctx, 'Gentle', x + w - 123 - tw(String(r.time || ''), 12), y + 49, 10, '#fff'); }
        if (r.done) text(ctx, '✿ in bloom', x + 64 + 260, y + 22, 12, '#ffb0e0', 'left');
      }
      if (er) text(ctx, 'Press Delete again to clear this garden', x + w / 2, y + h + 9, 11, '#ffd0d0');
      UI.rows.push(setR(x, y, w, h));
    });
    text(ctx, S.touch ? 'Tap a garden to play' : '↑ ↓ choose   Enter play   Delete clear', VW / 2, VH - 16, 12, '#fff');
    backBtn(ctx, S.touch, t);
  },
  newgame(ctx, S) {
    resetUI(); const t = num(S.t, 0), sel = S.sel | 0;
    ctx.drawImage(titleBg(), 0, 0, VW, VH); dim(ctx, 0.4); seeds(ctx, t, 14);
    text(ctx, 'How would you like to play?', VW / 2, 44, 24, PAL.sun);
    const opts = [['Normal', 'The roots as they are.', 'Five leaves, lively guardians.', '#5cc85a'], ['Gentle', 'More leaves and calmer guardians.', 'Just as much to find and bloom.', '#7ac8d8']];
    opts.forEach((o, i) => {
      const w = 250, h = 190, x = VW / 2 - w - 12 + i * (w + 24), y = 82 + (i === sel ? -4 : 0), on = i === sel;
      card(ctx, x, y, w, h, on ? 'rgba(92,72,135,.97)' : 'rgba(58,44,88,.9)');
      if (on) { ctx.strokeStyle = PAL.sun; ctx.lineWidth = 3; rr(ctx, x - 6, y - 6, w + 12, h + 12, 24); ctx.stroke(); }
      const n = i ? 7 : 5; for (let k = 0; k < n; k++) icon(ctx, 'leaf', x + w / 2 - (n - 1) * 9 + k * 18, y + 50 + (k % 2) * 2, 16, t);
      pill(ctx, x + w / 2 - 70, y + 82, 140, 34, on ? o[3] : 'rgba(255,255,255,.15)', false); text(ctx, o[0], x + w / 2, y + 99.5, 18, '#fff');
      text(ctx, o[1], x + w / 2, y + 140, 12.5, '#fff'); text(ctx, o[2], x + w / 2, y + 160, 12, '#d9d3f0');
      UI.rows.push(setR(x, y, w, h));
    });
    text(ctx, 'You can change this later from the pause menu.', VW / 2, 300, 12, '#e9e3ff');
    backBtn(ctx, S.touch, t);
  },
  story(ctx, S) {
    resetUI(); const t = num(S.t, 0), pg = clamp(S.page | 0, 0, 2);
    ctx.drawImage(titleBg(), 0, 0, VW, VH); dim(ctx, 0.5);
    const x = 70, y = 22, w = 500, h = 316;
    ctx.fillStyle = INK; rr(ctx, x - 4, y - 1, w + 8, h + 8, 18); ctx.fill();
    ctx.fillStyle = '#f6ead0'; rr(ctx, x, y, w, h, 15); ctx.fill(); ctx.strokeStyle = 'rgba(200,170,120,.5)'; ctx.lineWidth = 2; rr(ctx, x + 7, y + 7, w - 14, h - 14, 11); ctx.stroke();
    const ix = x + 20, iy = y + 18, iw = w - 40, ih = 178;
    ctx.save(); rr(ctx, ix, iy, iw, ih, 12); ctx.clip(); storyPic(ctx, pg, ix, iy, iw, ih, t); ctx.restore();
    ctx.strokeStyle = INK; ctx.lineWidth = 3; rr(ctx, ix, iy, iw, ih, 12); ctx.stroke();
    const P = STORY[pg];
    ctx.save(); para(ctx, P, VW / 2, iy + ih + 26, iw - 20, 15, '#fff', 'center', 21, Math.floor(t * 1.4)); ctx.restore();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = INK; circle(ctx, VW / 2 - 16 + i * 16, y + h - 14, 5); ctx.fill(); ctx.fillStyle = i === pg ? '#7ed957' : '#cbbf9f'; circle(ctx, VW / 2 - 16 + i * 16, y + h - 14, 3.4); ctx.fill(); }
    if (t * 1.4 > P.length + 10) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.1); text(ctx, S.touch ? 'Tap to turn the page' : 'Press Jump to turn the page', x + w - 18, y + h - 14, 11, '#ffe9a0', 'right'); ctx.globalAlpha = 1; }
    UI.ok = setR(0, 0, VW, VH);
  },
  pause(ctx, S) {
    resetUI(); const t = num(S.t, 0), rows = S.rows || [], sel = S.sel | 0;
    dim(ctx, 0.55);
    const rh = 27, w = 270, h = 64 + rows.length * (rh + 5), x = VW / 2 - w / 2, y = Math.max(8, VH / 2 - h / 2);
    card(ctx, x, y, w, h); sprigCorner(ctx, x + 18, y + 22, 1, t);
    text(ctx, 'Taking a rest', VW / 2, y + 26, 20, '#fff');
    if (S.gentle) { pill(ctx, x + w - 72, y + 15, 56, 18, '#7ac8a0', false); text(ctx, 'Gentle', x + w - 44, y + 24.5, 10, '#fff'); }
    rows.forEach((r, i) => { const yy = y + 50 + i * (rh + 5), on = i === sel; pill(ctx, x + 20, yy, w - 40, rh, on ? '#5cc85a' : 'rgba(255,255,255,.13)', on); text(ctx, typeof r === 'string' ? r : r.label, VW / 2, yy + rh / 2 + 0.5, 13.5, '#fff'); UI.rows.push(setR(x + 16, yy - 2, w - 32, rh + 4)); });
  },
  map(ctx, S) { resetUI(); mapScreen(ctx, S); },
  charms(ctx, S) { resetUI(); charmScreen(ctx, S); },
  shop(ctx, S) { resetUI(); shopScreen(ctx, S); },
  dialog(ctx, S) { resetUI(); dialogScreen(ctx, S); },
  get(ctx, S) { resetUI(); getScreen(ctx, S); },
  area(ctx, S) {
    const t = num(S.t, 0), a = t < 30 ? easeOut(t / 30) : t > 160 ? clamp01(1 - (t - 160) / 45) : 1; if (a <= 0) return;
    ctx.save(); ctx.globalAlpha = a;
    const y = 132 - (1 - a) * 10, w = Math.max(tw(S.name || '', 32), 200) + 80;
    const gr = ctx.createLinearGradient(VW / 2 - w / 2 - 60, 0, VW / 2 + w / 2 + 60, 0); gr.addColorStop(0, 'rgba(20,12,36,0)'); gr.addColorStop(0.2, 'rgba(20,12,36,.55)'); gr.addColorStop(0.8, 'rgba(20,12,36,.55)'); gr.addColorStop(1, 'rgba(20,12,36,0)');
    ctx.fillStyle = gr; ctx.fillRect(VW / 2 - w / 2 - 60, y - 34, w + 120, 82);
    ctx.strokeStyle = 'rgba(255,233,180,.8)'; ctx.lineWidth = 1.6; const lw = w / 2 * easeOut(t / 50);
    ctx.beginPath(); ctx.moveTo(VW / 2 - lw, y + 22); ctx.lineTo(VW / 2 + lw, y + 22); ctx.stroke();
    leaf(ctx, VW / 2 - lw - 2, y + 22, PI + 0.4, 10, M3.LEAF, 1.5); leaf(ctx, VW / 2 + lw + 2, y + 22, -0.4, 10, M3.LEAF, 1.5);
    text(ctx, S.name || '', VW / 2, y, 32, '#fff4d8');
    if (S.sub) text(ctx, S.sub, VW / 2, y + 38, 14, '#e9e3ff');
    ctx.restore();
  },
  faint(ctx, S) {
    resetUI(); const t = num(S.t, 0), a = clamp01(t / 40);
    ctx.fillStyle = 'rgba(24,14,40,' + (0.7 * a).toFixed(3) + ')'; ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = a; text(ctx, 'You nodded off...', VW / 2, VH / 2 - 8, 26, '#e9e3ff');
    for (let i = 0; i < 3; i++) { const q = ((t + i * 25) % 75) / 75; ctx.globalAlpha = a * Math.sin(q * PI); text(ctx, 'z', VW / 2 + 110 + q * 24 + i * 6, VH / 2 - 20 - q * 30, 14 + i * 4, '#fff'); }
    ctx.globalAlpha = a * clamp01((t - 40) / 30); text(ctx, 'Your leaves will grow back at the Watering Spot.', VW / 2, VH / 2 + 28, 13, '#d9d3f0');
    ctx.globalAlpha = 1;
  },
  ending(ctx, S) { resetUI(); endingScreen(ctx, S); UI.ok = setR(0, 0, VW, VH); },
  msg(ctx, S) {
    resetUI(); const L = wrap(S.text || '', 15, 380), h = L.length * 22 + 34, w = 420, y = VH / 2 - h / 2;
    dim(ctx, 0.4); card(ctx, VW / 2 - w / 2, y, w, h);
    L.forEach((s, i) => text(ctx, s, VW / 2, y + 27 + i * 22, i ? 14 : 16, i ? '#fff' : PAL.sun));
    UI.ok = setR(0, 0, VW, VH);
  },
  touch(ctx, S) { touchScreen(ctx, S); },
  band(ctx, S) { bandScreen(ctx, S); }
};
const STORY = [
  'Up above, the Great Garden was full of colour. Then one quiet morning a tired grey gloom drifted over it, and every petal went still and grey.',
  'Deep in the soil, a little sprout called SPRIG woke up. Beside it lay a dandelion staff, as soft as a wish.',
  'Far down through the roots, the Heartseed was waiting. "Let\'s bring the colour back," said Sprig, and down it went.'
];
function storyPic(ctx, pg, x, y, w, h, t) {
  if (pg === 0) {
    const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#9fd8ff'); gr.addColorStop(1, '#e8f6ff'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
    softGlow(ctx, x + w * 0.8, y + 30, 70, '#fff6c0', 0.9);
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * 0.62); ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.42, x + w * 0.6, y + h * 0.6); ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.7, x + w, y + h * 0.55); ctx.lineTo(x + w, y + h); ctx.fill();
    ctx.fillStyle = '#8fd860'; ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + h * 0.64); ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.44, x + w * 0.6, y + h * 0.62); ctx.quadraticCurveTo(x + w * 0.8, y + h * 0.72, x + w, y + h * 0.57); ctx.lineTo(x + w, y + h); ctx.fill();
    for (let i = 0; i < 16; i++) { const fx = x + 14 + i * (w - 28) / 15, fy = y + h * 0.78 + hash(i, 2) * h * 0.14; miniFlower(ctx, fx, fy, ['#ff8ab0', '#ffd93b', '#ffffff', '#b9a2ff', '#ff9a5a'][i % 5], 14); }
    /* the grey creeps in from the right */
    const edge = x + w * (0.97 - 0.62 * easeInOut(clamp01((t - 30) / 300)));
    ctx.save(); ctx.beginPath(); ctx.rect(edge, y, x + w - edge, h); ctx.clip(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(edge, y, x + w - edge, h); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#b0a8c0'; ctx.fillRect(edge, y, x + w - edge, h); ctx.restore();
    for (let i = 0; i < 4; i++) puff(ctx, edge + 10 + i * 40, y + 26 + (i % 2) * 18 + Math.sin(t * 0.02 + i) * 4, 14, '#9a94a8', null, INK);
  } else if (pg === 1) {
    const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#5a3a34'); gr.addColorStop(1, '#3a2428'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 30; i++) { ctx.fillStyle = 'rgba(150,100,70,.7)'; ctx.beginPath(); ctx.ellipse(x + hash(i, 1) * w, y + hash(i, 2) * h, 3, 2, 0, 0, TAU); ctx.fill(); }
    softGlow(ctx, x + w / 2, y + h * 0.55, 110, '#ffd890', 0.35);
    const sx = x + w / 2 + 70, sy = y + h * 0.6;
    for (let i = 0; i < 9; i++) { const a = t * 0.01 + i * 0.7, fx = sx + 40 + Math.cos(a) * (40 + i * 6), fy = sy - 60 + Math.sin(a * 1.3) * 30 - ((t * 0.3 + i * 20) % 60); ctx.globalAlpha = 0.8; fluffBall(ctx, fx, fy, 1.6); } ctx.globalAlpha = 1;
    portrait(ctx, 'sprig', x + w / 2, y + h * 0.58, 126, t, 'happy');
  } else {
    const gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#3a2440'); gr.addColorStop(1, '#1c0d24'); ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
    for (let i = 0; i < 7; i++) { const rx = x + 30 + i * (w - 60) / 6; ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(rx, y - 4); ctx.bezierCurveTo(rx + 30 * Math.sin(i), y + h * 0.4, rx - 20, y + h * 0.6, x + w / 2 + (i - 3) * 14, y + h * 0.86); ctx.stroke(); ctx.strokeStyle = '#8a5a3c'; ctx.lineWidth = 7; ctx.stroke(); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7 + 0.2 * Math.sin(t * 0.06); ctx.drawImage(LS.gold, x + w / 2 - 70, y + h * 0.86 - 70, 140, 140); ctx.restore();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.86, 15, 19, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h * 0.86, 12, 16, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff4c4'; ctx.beginPath(); ctx.ellipse(x + w / 2 - 4, y + h * 0.86 - 6, 3, 5, -0.3, 0, TAU); ctx.fill();
    portrait(ctx, 'sprig', x + 70, y + 46 + Math.sin(t * 0.05) * 3, 56, t, 'happy');
  }
}
function mapScreen(ctx, S) {
  const t = num(S.t, 0), rooms = S.rooms || [], area = S.area || (rooms.find(r => r.here) || {}).area;
  dim(ctx, 0.6);
  const px = 20, py = 44, pw = VW - 40, ph = VH - 92;
  card(ctx, px, py, pw, ph, '#f4e6c8', 16);
  const A = (S.areas || (RL.World && RL.World.areas) || {})[area] || {};
  text(ctx, A.name || 'Map', VW / 2, 24, 22, PAL.sun);
  if (!rooms.length) { text(ctx, 'No map of this place yet.', VW / 2, py + ph / 2 - 10, 16, '#8a6a4a'); text(ctx, 'The Peddler in Rootgate sells maps for dew.', VW / 2, py + ph / 2 + 14, 12, '#8a6a4a'); backBtn(ctx, S.touch, t); return; }
  let list = rooms.filter(r => r.area === area); if (!list.length) list = rooms;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9; for (const r of list) { bx0 = Math.min(bx0, r.x); by0 = Math.min(by0, r.y); bx1 = Math.max(bx1, r.x + r.w); by1 = Math.max(by1, r.y + r.h); }
  const sc = Math.min(4.2, (pw - 50) / Math.max(1, bx1 - bx0), (ph - 50) / Math.max(1, by1 - by0));
  const ox = px + pw / 2 - (bx0 + bx1) / 2 * sc, oy = py + ph / 2 - (by0 + by1) / 2 * sc;
  ctx.save(); rr(ctx, px + 4, py + 4, pw - 8, ph - 8, 12); ctx.clip();
  ctx.strokeStyle = 'rgba(160,130,90,.25)'; ctx.lineWidth = 1; ctx.beginPath(); for (let gx = ((ox % 32) + 32) % 32; gx < VW; gx += 32) { ctx.moveTo(gx, py); ctx.lineTo(gx, py + ph); } for (let gy = ((oy % 32) + 32) % 32; gy < VH; gy += 32) { ctx.moveTo(px, gy); ctx.lineTo(px + pw, gy); } ctx.stroke();
  for (const r of rooms) {
    const x = ox + r.x * sc, y = oy + r.y * sc, w = r.w * sc, h = r.h * sc; if (x > VW || y > VH || x + w < 0 || y + h < 0) continue;
    const fill = AREACOL[r.area] || '#eee', rad = Math.min(8, w / 4, h / 4);
    ctx.fillStyle = INK; rr(ctx, x - 1.5, y - 1.5, w + 3, h + 3, rad + 1); ctx.fill();
    ctx.fillStyle = r.area === area ? fill : mix(fill, '#f4e6c8', 0.55); rr(ctx, x + 1, y + 1, w - 2, h - 2, rad); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(ctx, x + 3, y + 3, w - 6, Math.min(5, h * 0.2), 2); ctx.fill();
    for (const d of r.doors || []) {
      const side = String(d.side || '').toUpperCase()[0], at = num(d.at, 0) * sc, len = Math.max(2, num(d.len, 1) * sc);
      ctx.fillStyle = r.area === area ? fill : mix(fill, '#f4e6c8', 0.55);
      if (side === 'N' || side === 'T' || side === 'U') ctx.fillRect(x + at, y - 2, len, 5); else if (side === 'S' || side === 'B' || side === 'D') ctx.fillRect(x + at, y + h - 3, len, 5);
      else if (side === 'W' || side === 'L') ctx.fillRect(x - 2, y + at, 5, len); else if (side === 'E' || side === 'R') ctx.fillRect(x + w - 3, y + at, 5, len);
    }
    if (r.here) { ctx.strokeStyle = PAL.sun; ctx.lineWidth = 2.5 + Math.sin(t * 0.12); rr(ctx, x - 4, y - 4, w + 8, h + 8, rad + 3); ctx.stroke(); }
    const ic = []; if (r.spot) ic.push('spot'); if (r.peddler) ic.push('peddler'); if (r.guard) ic.push(r.calm ? 'flower' : 'guardian');
    ic.forEach((n, k) => { const ix = x + w / 2 + (k - (ic.length - 1) / 2) * 16, iy = y + h / 2; if (n === 'flower') SI.flower(ctx, { x: ix, y: iy + 7, kind: 1, ceil: false, t: 999, seed: 0 }, 0); else icon(ctx, n, ix, iy, 13, t); });
  }
  if (S.puddle) { const x = ox + S.puddle.x * sc, y = oy + S.puddle.y * sc; icon(ctx, 'puddle', x, y, 12, t); }
  if (S.me) S.me.forEach((m, i) => { const x = ox + m.x * sc, y = oy + m.y * sc, b = Math.sin(t * 0.15) * 2; ctx.fillStyle = 'rgba(255,217,59,.35)'; circle(ctx, x, y, 9 + b); ctx.fill(); portrait(ctx, i ? 'marigold' : 'sprig', x, y - 2, 18, t); });
  ctx.restore();
  /* legend */
  let lx = 150; const ly = VH - 26;
  for (const [n, l] of [['spot', 'Watering Spot'], ['peddler', 'Peddler'], ['guardian', 'Guardian']]) { icon(ctx, n, lx, ly, 13, t); lx += 12 + text(ctx, l, lx + 10, ly, 11, '#fff', 'left') + 18; }
  if (S.me) { portrait(ctx, 'sprig', lx, ly - 1, 16, t); text(ctx, 'You', lx + 11, ly, 11, '#fff', 'left'); }
  text(ctx, S.touch ? '' : 'Tab / M: close', VW - 16, ly, 11, '#d9d3f0', 'right');
  backBtn(ctx, S.touch, t);
}
function charmScreen(ctx, S) {
  const t = num(S.t, 0), list = S.list || [], sel = S.sel | 0, notches = num(S.notches, 3), used = num(S.used, 0);
  dim(ctx, 0.55);
  card(ctx, 16, 12, VW - 32, VH - 24);
  text(ctx, 'Seed charms', 36, 36, 22, PAL.sun, 'left');
  /* notch bar */
  text(ctx, 'Notches', VW - 40 - notches * 18, 37, 12, '#e9e3ff', 'right');
  for (let i = 0; i < notches; i++) icon(ctx, i < used ? 'notchFull' : 'notch', VW - 40 - (notches - 1 - i) * 18, 36, 14, t);
  const cols = 4, cs = 66, gx = 36, gy = 66;
  list.forEach((c, i) => {
    const x = gx + (i % cols) * (cs + 6), y = gy + Math.floor(i / cols) * (cs + 6), on = i === sel;
    ctx.fillStyle = INK; rr(ctx, x - 2, y - 2, cs + 4, cs + 4, 14); ctx.fill();
    ctx.fillStyle = c.worn ? '#6a8a5a' : c.owned ? '#5a4a7b' : '#3a3050'; rr(ctx, x, y, cs, cs, 12); ctx.fill();
    if (c.worn) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.4; ctx.drawImage(LS.green, x - 6, y - 6, cs + 12, cs + 12); ctx.restore(); }
    if (c.owned) icon(ctx, 'charm:' + c.id, x + cs / 2, y + cs / 2 - 4, 36, t); else { ctx.globalAlpha = 0.5; icon(ctx, 'lock', x + cs / 2, y + cs / 2 - 4, 18, t); ctx.globalAlpha = 1; }
    if (c.owned) for (let k = 0; k < c.cost; k++) icon(ctx, 'notch', x + cs / 2 - (c.cost - 1) * 6 + k * 12, y + cs - 9, 9, t);
    if (c.worn) { ctx.fillStyle = INK; circle(ctx, x + cs - 9, y + 9, 7.5); ctx.fill(); ctx.fillStyle = '#7ed957'; circle(ctx, x + cs - 9, y + 9, 5.6); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x + cs - 12, y + 9); ctx.lineTo(x + cs - 9.5, y + 11.5); ctx.lineTo(x + cs - 5.5, y + 6.5); ctx.stroke(); }
    if (on) { ctx.strokeStyle = PAL.sun; ctx.lineWidth = 3; rr(ctx, x - 5, y - 5, cs + 10, cs + 10, 16); ctx.stroke(); }
    UI.rows.push(setR(x, y, cs, cs));
  });
  /* the chosen charm */
  const c = list[sel], dx = gx + cols * (cs + 6) + 14, dw = VW - 32 - dx, dy = 66;
  ctx.fillStyle = 'rgba(30,20,48,.5)'; rr(ctx, dx, dy, dw, 210, 14); ctx.fill();
  if (c) {
    if (c.owned) {
      icon(ctx, 'charm:' + c.id, dx + 36, dy + 36, 44, t);
      text(ctx, c.name, dx + 70, dy + 26, 17, '#fff', 'left');
      for (let k = 0; k < c.cost; k++) icon(ctx, 'notchFull', dx + 76 + k * 15, dy + 48, 12, t); text(ctx, c.cost + (c.cost === 1 ? ' notch' : ' notches'), dx + 76 + c.cost * 15, dy + 48.5, 11, '#e9e3ff', 'left');
      para(ctx, c.desc || '', dx + 16, dy + 86, dw - 32, 13, '#fff', 'left', 18);
      text(ctx, c.worn ? 'Wearing it' : S.edit ? (S.touch ? 'Tap to wear it' : 'Enter: wear it') : '', dx + 16, dy + 188, 12.5, c.worn ? '#b6f07a' : PAL.sun, 'left');
    } else { text(ctx, 'Not found yet', dx + dw / 2, dy + 90, 16, '#d9d3f0'); text(ctx, 'Somewhere in the roots...', dx + dw / 2, dy + 114, 12, '#bdb3d6'); }
  }
  const line = S.line || (S.edit ? '' : 'Rest at a Watering Spot to change your charms.');
  if (line) text(ctx, line, dx + dw / 2, dy + 232, 11.5, S.line ? '#ffd0a0' : '#e9e3ff');
  backBtn(ctx, S.touch, t);
}
function shopScreen(ctx, S) {
  const t = num(S.t, 0), list = S.list || [], sel = S.sel | 0, N = list.length + 1;
  dim(ctx, 0.55);
  /* the Peddler and his line */
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.drawImage(LS.warm, 10, 90, 200, 200); ctx.restore();
  portrait(ctx, 'peddler', 108, 206, 140, t, 'happy');
  const line = S.line || 'Have a look, little one.', L = wrap(line, 12.5, 190), bh = L.length * 17 + 18, by = 64 - bh / 2 + 20;
  ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(86, by + bh); ctx.lineTo(100, by + bh + 17); ctx.lineTo(116, by + bh); ctx.fill();
  card(ctx, 16, by, 206, bh, 'rgba(92,72,135,.98)', 14);
  ctx.fillStyle = 'rgba(92,72,135,.98)'; ctx.beginPath(); ctx.moveTo(90, by + bh - 1); ctx.lineTo(100, by + bh + 12); ctx.lineTo(111, by + bh - 1); ctx.fill();
  L.forEach((s, i) => text(ctx, s, 119, by + 17 + i * 17, 12.5, '#fff'));
  text(ctx, 'The Peddler\'s Cart', 110, 312, 15, PAL.sun);
  /* the wares */
  const x = 240, w = VW - 256, rh = 31, vis = 6, top = 54;
  card(ctx, x - 6, 12, w + 12, VH - 24);
  text(ctx, 'Wares', x + 12, 32, 17, '#fff', 'left');
  icon(ctx, 'dew', x + w - 70, 32, 14, t); text(ctx, String(num(S.dew, 0)), x + w - 58, 32.5, 16, '#dff6ff', 'left');
  const first = clamp(sel - 2, 0, Math.max(0, N - vis));
  for (let i = 0; i < N; i++) {
    if (i < first || i >= first + vis) { UI.rows.push(setR(0, 0, 0, 0)); continue; }
    const y = top + (i - first) * (rh + 4), on = i === sel, it = list[i];
    if (!it) { pill(ctx, x + 8, y, w - 16, rh, on ? '#ff9a45' : 'rgba(255,255,255,.13)', on); text(ctx, 'Say goodbye', x + w / 2, y + rh / 2 + 0.5, 13.5, '#fff'); UI.rows.push(setR(x + 4, y - 2, w - 8, rh + 4)); continue; }
    pill(ctx, x + 8, y, w - 16, rh, it.sold ? 'rgba(255,255,255,.07)' : on ? '#5cc85a' : 'rgba(255,255,255,.13)', on);
    const ic = it.kind === 'map' ? 'map' : it.kind === 'charm' ? 'charm:' + (it.charm || it.id) : it.kind === 'notch' ? 'notch' : it.kind === 'leaf' ? 'leaf' : 'dew';
    ctx.globalAlpha = it.sold ? 0.5 : 1; icon(ctx, ic, x + 28, y + rh / 2, 16, t);
    const nm = it.name || it.id, maxw = w - 130; let nw = tw(nm, 13);
    ctx.save(); ctx.translate(x + 44, y + rh / 2 + 0.5); if (nw > maxw) ctx.scale(maxw / nw, 1); text(ctx, nm, 0, 0, 13, '#fff', 'left'); ctx.restore();
    if (it.sold) text(ctx, 'Sold', x + w - 24, y + rh / 2 + 0.5, 12, '#d9d3f0', 'right');
    else { const pr = String(it.price), cant = num(S.dew, 0) < it.price; text(ctx, pr, x + w - 24, y + rh / 2 + 0.5, 13, cant ? '#ffb0a0' : '#dff6ff', 'right'); icon(ctx, 'dew', x + w - 32 - tw(pr, 13), y + rh / 2, 11, t); }
    ctx.globalAlpha = 1;
    UI.rows.push(setR(x + 4, y - 2, w - 8, rh + 4));
  }
  if (first > 0) text(ctx, '▲', x + w / 2, top - 8, 10, '#e9e3ff'); if (first + vis < N) text(ctx, '▼', x + w / 2, top + vis * (rh + 4) - 2, 10, '#e9e3ff');
  const it = list[sel];
  ctx.fillStyle = 'rgba(30,20,48,.5)'; rr(ctx, x + 8, VH - 72, w - 16, 52, 10); ctx.fill();
  para(ctx, it ? (it.sold ? 'Already yours. ' : '') + (it.desc || '') : 'Off you go then. Mind the roots!', x + 18, VH - 56, w - 36, 12, '#fff', 'left', 16);
  backBtn(ctx, S.touch, t);
}
function dialogScreen(ctx, S) {
  const t = num(S.t, 0), who = S.who || 'sign', txt = String(S.text || ''), rev = Math.floor(t * 1.5), done = rev >= txt.length;
  if (who === 'sign') {
    const L = wrap(txt, 15, 420), h = Math.max(96, L.length * 21 + 46), w = 470, x = VW / 2 - w / 2, y = VH - h - 26;
    ctx.fillStyle = INK; rr(ctx, VW / 2 - 9, y + h - 4, 18, 30, 4); ctx.fill(); ctx.fillStyle = '#8a5530'; rr(ctx, VW / 2 - 6, y + h - 4, 12, 28, 3); ctx.fill();
    ctx.fillStyle = INK; rr(ctx, x - 3, y - 3 + 3, w + 6, h + 6, 12); ctx.fill();
    ctx.fillStyle = '#c88e5a'; rr(ctx, x, y, w, h, 10); ctx.fill();
    for (let k = 1; k < 3; k++) { ctx.fillStyle = 'rgba(120,70,40,.35)'; ctx.fillRect(x + 6, y + k * h / 3 - 1, w - 12, 2); }
    ctx.strokeStyle = 'rgba(120,70,40,.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); for (let k = 0; k < 6; k++) { const yy = y + 10 + hash(k, 3) * (h - 20); ctx.moveTo(x + 20 + hash(k, 4) * 200, yy); ctx.lineTo(x + 60 + hash(k, 5) * 300, yy + 1); } ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,210,.35)'; rr(ctx, x + 8, y + 4, w - 16, 4, 2); ctx.fill();
    for (const [nx, ny] of [[x + 10, y + 10], [x + w - 10, y + 10], [x + 10, y + h - 10], [x + w - 10, y + h - 10]]) { ctx.fillStyle = INK; circle(ctx, nx, ny, 3); ctx.fill(); ctx.fillStyle = '#d8d0e0'; circle(ctx, nx - 0.5, ny - 0.5, 1.6); ctx.fill(); }
    para(ctx, txt, VW / 2, y + 26, 420, 15, '#fff8e8', 'center', 21, rev);
    if (done) more(ctx, x + w - 22, y + h - 14, t, S.more);
    UI.ok = setR(0, 0, VW, VH); return;
  }
  const x = 16, w = VW - 32, h = 112, y = VH - h - 12, heart = who === 'heart';
  card(ctx, x, y, w, h, heart ? 'rgba(96,48,96,.97)' : 'rgba(64,48,98,.96)');
  const px = x + 62, py = y + h / 2;
  ctx.fillStyle = INK; circle(ctx, px, py, 46); ctx.fill(); ctx.fillStyle = heart ? '#ffe8a8' : '#f6e6c4'; circle(ctx, px, py, 43); ctx.fill();
  ctx.save(); circle(ctx, px, py, 43); ctx.clip(); portrait(ctx, heart ? 'heart' : who, px, py + 8, 90, t, 'talk'); ctx.restore();
  if (S.name) { const nw = tw(S.name, 13) + 22; pill(ctx, x + 116, y - 12, nw, 22, heart ? '#ffb030' : '#ff9a45', false); text(ctx, S.name, x + 116 + nw / 2, y - 0.5, 13, '#fff'); }
  para(ctx, txt, x + 122, y + 30, w - 150, 14.5, '#fff', 'left', 20, rev);
  if (done) more(ctx, x + w - 22, y + h - 16, t, S.more);
  UI.ok = setR(0, 0, VW, VH);
}
function more(ctx, x, y, t, m) { const b = Math.sin(t * 0.15) * 2.5; ctx.fillStyle = INK; ctx.beginPath(); if (m) { ctx.moveTo(x - 7, y - 4 + b); ctx.lineTo(x + 7, y - 4 + b); ctx.lineTo(x, y + 5 + b); } else { ctx.arc(x, y + b * 0.4, 5.5, 0, TAU); } ctx.closePath(); ctx.fill(); ctx.fillStyle = PAL.sun; ctx.beginPath(); if (m) { ctx.moveTo(x - 4.5, y - 2.5 + b); ctx.lineTo(x + 4.5, y - 2.5 + b); ctx.lineTo(x, y + 3 + b); } else ctx.arc(x, y + b * 0.4, 3.5, 0, TAU); ctx.closePath(); ctx.fill(); }
function getScreen(ctx, S) {
  const t = num(S.t, 0), a = easeOut(t / 18), k = S.kind;
  dim(ctx, 0.62 * a);
  const name = k === 'ability' ? 'ability:' + S.id : k === 'charm' ? 'charm:' + S.id : k === 'life' ? 'life' : k === 'vessel' ? 'vessel' : k === 'notch' ? 'notchFull' : k === 'map' ? 'map' : String(k || 'life');
  const cx = VW / 2, cy = 108;
  ctx.save(); ctx.globalAlpha = a;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.01); ctx.fillStyle = 'rgba(255,230,140,.16)'; for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 150, i * TAU / 12, i * TAU / 12 + 0.14); ctx.closePath(); ctx.fill(); } ctx.restore();
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * (0.6 + 0.15 * Math.sin(t * 0.08)); ctx.drawImage(LS.gold, cx - 90, cy - 90, 180, 180); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a;
  const sc = 0.4 + 0.6 * easeOut(t / 24) + Math.sin(clamp01(t / 30) * PI) * 0.15;
  ctx.save(); ctx.translate(cx, cy + Math.sin(t * 0.06) * 3); ctx.scale(sc, sc); icon(ctx, name, 0, 0, 64, t); ctx.restore();
  for (let i = 0; i < 6; i++) { const an = t * 0.03 + i * TAU / 6, rr2 = 54 + Math.sin(t * 0.05 + i) * 6; twinkle(ctx, cx + Math.cos(an) * rr2, cy + Math.sin(an) * rr2 * 0.8, 3 + Math.sin(t * 0.2 + i) * 1.4, an, '#fff8d0'); }
  text(ctx, S.title || '', cx, 196, 28, PAL.sun);
  const h = para(ctx, S.text || '', cx, 230, 440, 14, '#fff', 'center', 19);
  const keys = Array.isArray(S.keys) ? S.keys : S.keys ? [S.keys] : [];
  if (keys.length) { const lab = keys.map(kk => String(Array.isArray(kk) ? kk[0] : kk)), ws = lab.map(l => Math.max(28, tw(l, 12) + 16)), tot = ws.reduce((p, v) => p + v + 10, -10); let kx = cx - tot / 2; lab.forEach((l, i) => { icon(ctx, 'key:' + l, kx + ws[i] / 2, 240 + h + 8, 24, t); kx += ws[i] + 10; }); }
  if (t > 50) { ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 0.1)); text(ctx, S.touch ? 'Tap to carry on' : 'Press Jump to carry on', cx, VH - 22, 12, '#e9e3ff'); }
  ctx.restore();
  UI.ok = setR(0, 0, VW, VH);
}
let EGARD = null;
function endingScreen(ctx, S) {
  const t = num(S.t, 0);
  if (!EGARD || EGARD.R !== R) {
    const scene = g => {
      const gr = g.createLinearGradient(0, 0, 0, VH); gr.addColorStop(0, '#8fd0ff'); gr.addColorStop(0.7, '#e8f6ff'); gr.addColorStop(1, '#fff8e0'); g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
      for (let i = 0; i < 5; i++) puff(g, 60 + i * 140, 50 + (i % 2) * 30, 18 + (i % 3) * 6, '#ffffff', 'rgba(200,210,240,.5)', null);
      const hill = (y0, a, col) => { g.fillStyle = INK; g.beginPath(); g.moveTo(0, VH); for (let x = 0; x <= VW; x += 10) g.lineTo(x, y0 + Math.sin(x * 0.01 + a) * 16 - 3); g.lineTo(VW, VH); g.fill(); g.fillStyle = col; g.beginPath(); g.moveTo(0, VH); for (let x = 0; x <= VW; x += 10) g.lineTo(x, y0 + Math.sin(x * 0.01 + a) * 16); g.lineTo(VW, VH); g.fill(); };
      hill(250, 1, '#a8e070'); hill(290, 3, '#86d060');
      for (let i = 0; i < 34; i++) { const x = 10 + i * 18.6 + hash(i, 1) * 8, y = 300 + hash(i, 2) * 46; miniFlower(g, x, y, ['#ff8ab0', '#ffd93b', '#ffffff', '#b9a2ff', '#ff9a5a', '#8fa8ff'][i % 6], 10 + hash(i, 3) * 8); }
      for (let i = 0; i < 6; i++) { const x = 30 + i * 118, y = 268 + (i % 2) * 8; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y + 30); g.lineTo(x, y - 20); g.stroke(); g.strokeStyle = '#5fb048'; g.lineWidth = 3; g.stroke(); g.fillStyle = INK; circle(g, x, y - 24, 14); g.fill(); g.fillStyle = '#ffd23b'; for (let p = 0; p < 10; p++) { const a = p * TAU / 10; circle(g, x + Math.cos(a) * 8, y - 24 + Math.sin(a) * 8, 5); g.fill(); } g.fillStyle = '#7a4a2a'; circle(g, x, y - 24, 6); g.fill(); }
    };
    EGARD = { R, col: sprite(VW, VH, scene) };
    EGARD.grey = sprite(VW, VH, g => { g.drawImage(EGARD.col, 0, 0, VW, VH); g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, VW, VH); g.globalCompositeOperation = 'multiply'; g.fillStyle = '#b8b0c8'; g.fillRect(0, 0, VW, VH); });
  }
  ctx.drawImage(EGARD.grey, 0, 0, VW, VH);
  const hx = VW / 2, hy = 210 - easeOut(t / 200) * 90, rad = easeInOut(clamp01((t - 50) / 300)) * 760;
  if (rad > 0) { ctx.save(); circle(ctx, hx, hy, rad); ctx.clip(); ctx.drawImage(EGARD.col, 0, 0, VW, VH); ctx.restore(); ctx.strokeStyle = 'rgba(255,240,180,.7)'; ctx.lineWidth = 6 * (1 - rad / 760); if (rad < 740) { circle(ctx, hx, hy, rad); ctx.stroke(); } }
  /* the golden Heartseed */
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75 + 0.2 * Math.sin(t * 0.06); ctx.drawImage(LS.gold, hx - 110, hy - 110, 220, 220); ctx.restore();
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(Math.sin(t * 0.03) * 0.08);
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, 25, 31, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#f0a020'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 28, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.ellipse(-2, -2, 19, 24, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff4c4'; ctx.beginPath(); ctx.ellipse(-8, -12, 5, 8, -0.4, 0, TAU); ctx.fill();
  leaf(ctx, 0, -28, -PI / 2 - 0.7, 16, M3.LEAF, 2); leaf(ctx, 0, -28, -PI / 2 + 0.6, 14, M3.LEAF, 2);
  ctx.restore();
  for (let i = 0; i < 40; i++) { const x = (hash(i, 7) * VW + Math.sin(t * 0.02 + i) * 30), y = ((t * (0.5 + hash(i, 8)) + hash(i, 9) * VH) % (VH + 40)) - 20; if (rad < Math.hypot(x - hx, y - hy)) continue; const P = PETAL[i % 7]; ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.04 + i); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 0, 4.4, 2.8, 0, 0, TAU); ctx.fill(); ctx.fillStyle = P[0]; ctx.beginPath(); ctx.ellipse(0, 0, 3.4, 2, 0, 0, TAU); ctx.fill(); ctx.restore(); }
  const a = clamp01((t - 280) / 40); if (a <= 0) return;
  ctx.save(); ctx.globalAlpha = a;
  text(ctx, 'The Great Garden is in colour again!', VW / 2, 34, 24, '#fff');
  const st = S.stats || {}; const w = 420, x = VW / 2 - w / 2, y = 228;
  card(ctx, x, y, w, 96, 'rgba(64,48,98,.92)');
  const cells = [['Time', String(st.time == null ? '' : st.time)], ['Garden', pctFmt(st.pct)], ['Life seeds', String(num(st.life, 0))], ['Charms', String(num(st.charms, 0))]];
  cells.forEach((c, i) => { const cx2 = x + 52 + i * 105; text(ctx, c[1], cx2, y + 34, 18, PAL.sun); text(ctx, c[0], cx2, y + 58, 11, '#e9e3ff'); });
  ctx.globalAlpha = a * clamp01((t - 340) / 40); text(ctx, 'Every gloom you met is a flower now. Thank you for being so kind.', VW / 2, y + 82, 11.5, '#fff');
  if (t > 520) { ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 0.08)); text(ctx, S.touch ? 'Tap to go back to the title' : 'Press Jump to go back to the title', VW / 2, VH - 14, 12, '#fff'); }
  ctx.restore();
}
function touchScreen(ctx, S) {
  const L = S.L || S, stick = L.stick || S.stick, knob = L.knob !== undefined ? L.knob : S.knob, band = S.band;
  const al = band ? 0.95 : 0.6;
  ctx.save();
  if (stick) {
    const bx = knob && knob.ox != null ? knob.ox : stick.x, by = knob && knob.oy != null ? knob.oy : stick.y, r = stick.r || 50;
    ctx.globalAlpha = al * (knob ? 1 : 0.75);
    ctx.fillStyle = 'rgba(30,20,48,.45)'; circle(ctx, bx, by, r); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2.5; circle(ctx, bx, by, r); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; for (let k = 0; k < 4; k++) { const a = k * PI / 2; ctx.beginPath(); ctx.moveTo(bx + Math.cos(a) * (r - 6), by + Math.sin(a) * (r - 6)); ctx.lineTo(bx + Math.cos(a + 0.18) * (r - 14), by + Math.sin(a + 0.18) * (r - 14)); ctx.lineTo(bx + Math.cos(a - 0.18) * (r - 14), by + Math.sin(a - 0.18) * (r - 14)); ctx.closePath(); ctx.fill(); }
    let kx = bx, ky = by; if (knob) { const dx = knob.x - bx, dy = knob.y - by, d = Math.hypot(dx, dy), m = Math.min(d, r * 0.62); if (d > 0.01) { kx = bx + dx / d * m; ky = by + dy / d * m; } }
    ctx.globalAlpha = al; ball(ctx, kx, ky, r * 0.42, knob ? ['#9be87a', '#4cc46a', '#e6ffd6'] : ['#8a7ab8', '#5a4a7b', '#c8b8f0'], 2.5);
  }
  const COL = { jump: '#5cc85a', swing: '#ffb030', dash: '#4cc0c8', focus: '#ff8ab0', map: '#8a7ab8', pause: '#8a7ab8' };
  for (const b of (L.btn || S.btn || [])) {
    const on = !!b.down, y = b.y + (on ? 2 : 0);
    ctx.globalAlpha = al; ctx.fillStyle = INK; circle(ctx, b.x, b.y + 3, b.r + 3); ctx.fill();
    ctx.fillStyle = on ? PAL.sun : (COL[b.id] || '#8a7ab8'); circle(ctx, b.x, y, b.r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(b.x - b.r * 0.3, y - b.r * 0.42, b.r * 0.42, b.r * 0.2, -0.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = Math.min(1, al + 0.3); text(ctx, b.label || b.id, b.x, y + 0.5, clamp(b.r * 0.42, 8, 15), '#fff');
  }
  ctx.restore();
}
let BAND = null;
function bandScreen(ctx, S) {
  const W = num(S.W, num(S.w, VW)), y = num(S.y, VH), h = num(S.h, 200); if (h <= 0) return;
  if (!BAND || BAND.R !== R || BAND.W !== W || BAND.H !== h) {
    BAND = sprite(W, h, g => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a3a30'); gr.addColorStop(0.5, '#43292a'); gr.addColorStop(1, '#2a1a22'); g.fillStyle = gr; g.fillRect(0, 0, W, h);
      for (let i = 0; i < 60; i++) { const x = hash(i, 1) * W, yy = 14 + hash(i, 2) * (h - 20), r = 1.5 + hash(i, 3) * 3; g.fillStyle = INK; g.beginPath(); g.ellipse(x, yy, r * 1.3 + 1, r + 1, 0, 0, TAU); g.fill(); g.fillStyle = ['#8a6450', '#9a7a62', '#6f5a64'][i % 3]; g.beginPath(); g.ellipse(x, yy, r * 1.3, r, 0, 0, TAU); g.fill(); }
      for (let i = 0; i < 6; i++) { const x0 = hash(i, 5) * W, wv = 8 + hash(i, 6) * 10; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, -4); g.bezierCurveTo(x0 + 80 * (hash(i, 7) - 0.5), h * 0.3, x0 + 120 * (hash(i, 8) - 0.5), h * 0.6, x0 + 60 * (hash(i, 9) - 0.5), h + 6); g.strokeStyle = INK; g.lineWidth = wv + 4; g.stroke(); g.strokeStyle = '#8a5a3c'; g.lineWidth = wv; g.stroke(); g.strokeStyle = '#b07a52'; g.lineWidth = wv * 0.3; g.stroke(); }
      g.fillStyle = INK; g.fillRect(0, 0, W, 4);
      blobs(g, Array.from({ length: Math.ceil(W / 9) }, (_, i) => [i * 9 + hash(i, 11) * 4, 3, 4 + hash(i, 12) * 2.5]), '#86d65e', 1.8, '#cdf7a0');
      for (let i = 0; i < 6; i++) miniFlower(g, 30 + i * W / 6 + hash(i, 13) * 30, 4, ['#ff8ab0', '#ffd93b', '#ffffff'][i % 3], 8);
    });
    BAND.R = R; BAND.W = W; BAND.H = h;
  }
  ctx.drawImage(BAND, num(S.x, 0), y, W, h);
}

/* =====================================================================================================================
   RL.Render
   ===================================================================================================================== */
RL.Render = {
  ready: false, UI, AREA, PAL,
  get R() { return R; },
  init(r, low) {
    r = clamp(+r || 2, 1, 4); low = !!low;
    if (this.ready && r === R && low === LOW) return;
    R = r; LOW = low; BS = Math.min(R, LOW ? 2 : 3); BGS = Math.min(R, LOW ? 1.5 : 2);
    TXT = new Map(); txtB = 0; WR.clear();
    for (const c of CHUNKS.values()) recycle(c); CHUNKS.clear(); LIVE.clear(); BG.clear(); POOL.length = 0;
    TBG = null; EGARD = null; BAND = null; CAUS = null; CAUSP = null; TMPF = TMPH = null; LM = null;
    lightSprites();
    if (RC) { const r0 = RC.room; RC = null; if (r0) room({ room: r0 }); }
    this.ready = true;
  },
  room(sim) { if (!LS) lightSprites(); room(sim); },
  tick(sim) { tick(sim); },
  fx(sim, ev) { fx(sim, ev); },
  frame(ctx, F) { resetUI(); frame(ctx, F); },
  hud(ctx, H) { hud(ctx, H); },
  screen(ctx, name, S) {
    const fn = SCREENS[name]; if (!fn) return;
    if (!LS) lightSprites();
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    try { fn(ctx, S || {}); } finally { ctx.restore(); }
  },
  text(ctx, s, x, y, size, fill, align) { return text(ctx, s, x, y, size, fill, align); },
  /* debug: what is cached and how long the last frame took */
  stats() { return { chunks: CHUNKS.size, baked: RC ? RC.baked : 0, bakeAvg: bakeN ? +(bakeMs / bakeN).toFixed(2) : 0, parts: ACT.length, bursts: BURSTS.length, text: TXT.size, ms: +lastFrameMs.toFixed(2), R, BS, low: LOW }; },
  clearChunks() { for (const c of CHUNKS.values()) recycle(c); CHUNKS.clear(); }
};
})();
