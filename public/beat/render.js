/* BEET BEAT — render.js (RENDER). BEAT.Render draws everything in code in the family style (Berry Breeze, Vine Line, Sprout
   Kart): thick ink outlines, glossy two-tone shading, sticker text, bright pastels. A view is 1280 x 720 logical units (16:9),
   1 block = 40 units; the floor's top sits at y 560 when the camera is low; the runner runs 400 units from the left edge.
   Split screen = two views stacked (main.js translates). Sprites are baked once per render scale (init(R)).
   API: init(R), view(ctx, o) (sky, parallax meadow, ground, objects, runners, ghosts, fx, in-world texts), hud(ctx, o),
   screen(ctx, name, o) ('title' 'count' 'results' 'pause' 'msg' 'toast' 'newbest'), fx(ctx, f, age, cam), text(), UI (tap rects).
   Everything here is cosmetic: nothing in sim.js depends on it. */
'use strict';
(function () {
const BEAT = window.BEAT = window.BEAT || {};
const TAU = Math.PI * 2, PI = Math.PI;
const H = 720, BS = 40, GY = 560;
let W = 1280, PX = 400;   /* a view is W x 720: 1280 wide (16:9), or 800 on an upright phone (setView) */
const PAL = { ink: '#2b2140', plum: '#4a3a6b', cream: '#fff6e0', sun: '#ffd93b', gold: '#f5a623', orange: '#ff8a3d', leaf: '#4cc46a', lilac: '#e4d8ff', sky: '#7fd0ff', mint: '#9be8c4', pink: '#ff7eb6' };
const FONT = '"Arial Rounded MT Bold", ui-rounded, "Varela Round", "Trebuchet MS", system-ui, sans-serif';
const font = s => 'bold ' + s + 'px ' + FONT;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, clamp01 = v => clamp(v, 0, 1);
const easeOut = t => 1 - Math.pow(1 - clamp01(t), 3);
let R = 1;

/* ---------- the two runners: RUBY (red beetroot, player 1) and GOLDIE (golden beetroot, player 2) ---------- */
const RUN = [
  { name: 'RUBY', body: ['#e8436f', '#a3204f', '#ffc2d4'], stem: '#c8325a', leaf: ['#5cc85a', '#2f8f4a', '#d2f7c4'], txt: '#ff8fb0', bar: '#e8436f' },
  { name: 'GOLDIE', body: ['#ffc93b', '#e0901c', '#fff4c8'], stem: '#e58a2a', leaf: ['#7ed957', '#3f9a3a', '#e2ffd2'], txt: '#ffd36b', bar: '#ffb020' }
];

/* ---------- helpers ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function sprite(w, h, draw) { const c = canvas(w * R, h * R); c.lw = w; c.lh = h; const g = c.getContext('2d'); g.scale(R, R); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); return c; }
function rrect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
const STAR = (g, cx, cy, r, ri, n, rot) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, q = i & 1 ? ri : r; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); };
function leafPath(g, L, w) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * .45, -w, L, 0); g.quadraticCurveTo(L * .45, w, 0, 0); g.closePath(); }
function leaf(g, x, y, a, L, m, lw) {
  g.save(); g.translate(x, y); g.rotate(a); const w = L * .42;
  leafPath(g, L, w); g.strokeStyle = PAL.ink; g.lineWidth = lw || 2.4; g.stroke(); g.fillStyle = m[0]; g.fill();
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * .45, w, L, 0); g.closePath(); g.fillStyle = m[1]; g.globalAlpha *= .45; g.fill(); g.globalAlpha /= .45;
  g.strokeStyle = m[1]; g.lineWidth = Math.max(.8, L * .05); g.beginPath(); g.moveTo(L * .12, 0); g.lineTo(L * .78, 0); g.stroke();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(L * .42, -w * .38, L * .16, w * .16, 0, 0, TAU); g.fill();
  g.restore();
}
function eye(g, x, y, h, lx, ly, mood) {
  const w = h * .74; g.save(); g.strokeStyle = PAL.ink; g.lineCap = 'round';
  if (mood === 'shut' || mood === 'happy') {
    g.lineWidth = Math.max(1.2, h * .2); g.beginPath();
    if (mood === 'shut') g.arc(x, y - h * .1, w * .5, PI * .15, PI * .85); else g.arc(x, y + h * .2, w * .55, PI * 1.12, PI * 1.88);
    g.stroke(); g.restore(); return;
  }
  g.lineWidth = Math.max(1, h * .12); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); g.fill(); g.stroke();
  const px = x + lx * w * .16, py = y + h * .06 + ly * h * .12;
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(px, py, w * .33, h * .36, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff'; circle(g, px - w * .12, py - h * .13, Math.max(.7, h * .14)); g.fill(); circle(g, px + w * .12, py + h * .16, Math.max(.4, h * .06)); g.fill();
  g.restore();
}
function blush(g, x, y, rx, ry) { g.fillStyle = 'rgba(255,140,150,.7)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }

/* ---------- sticker text (cached per string, size and colour; LRU by bytes) ---------- */
let TXT = new Map(), txtB = 0; const mctx = canvas(4, 4).getContext('2d');
function txtCanvas(s, size, fill) {
  const key = s + '|' + size + '|' + fill; let c = TXT.get(key);
  if (c) { TXT.delete(key); TXT.set(key, c); return c; }
  mctx.font = font(size); const w = mctx.measureText(s).width, p = size * .3 + 1, lw = w + p * 2, lh = size * 1.25 + p * 2;
  c = canvas(lw * R, lh * R); c.lw = c.width / R; c.lh = c.height / R; c.tw = w;
  const g = c.getContext('2d'); g.scale(R, R); g.font = font(size); g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.strokeStyle = PAL.ink; g.lineWidth = size * .3; const ty = lh / 2 - .5;
  g.strokeText(s, p, ty + size * .07); g.strokeText(s, p, ty); g.fillStyle = fill; g.fillText(s, p, ty);
  TXT.set(key, c); txtB += c.width * c.height * 4;
  while (TXT.size > 1 && (TXT.size > 200 || txtB > 12e6)) { const k = TXT.keys().next().value, o = TXT.get(k); txtB -= o.width * o.height * 4; TXT.delete(k); }
  return c;
}
function text(ctx, s, x, y, size, fill, align) {
  s = String(s).slice(0, 70); if (!s) return 0; size = Math.round(clamp(+size || 14, 6, 140) * 2) / 2; fill = fill || '#fff'; align = align || 'center';
  const c = txtCanvas(s, size, fill), p = (c.lw - c.tw) / 2, x0 = align === 'center' ? x - c.lw / 2 : align === 'right' ? x - c.tw - p : x - p;
  ctx.drawImage(c, x0, y - c.lh / 2, c.lw, c.lh); return c.tw;
}
const TW = {};
function tw(s, z) { const k = z + '|' + s; return TW[k] || (mctx.font = font(z), TW[k] = mctx.measureText(s).width); }

/* ---------- baked sprites ---------- */
const SPR = {};
function bake() {
  /* thorns: a plum thistle spike with a leafy green collar (1 x 1 block; drawn 48 x 48 with a margin) */
  const thorn = (g, h) => {
    const b = 44, top = b - h * 40;
    g.beginPath(); g.moveTo(5, b); g.quadraticCurveTo(15, b - h * 14, 23.5, top); g.quadraticCurveTo(26, top + 2, 27.5, top + h * 4); g.quadraticCurveTo(33, b - h * 14, 43, b); g.closePath();
    g.lineWidth = 3.4; g.strokeStyle = PAL.ink; g.stroke(); g.fillStyle = '#7d4fb0'; g.fill();
    g.save(); g.clip(); g.fillStyle = '#a77ae0'; g.beginPath(); g.moveTo(9, b); g.quadraticCurveTo(17, b - h * 14, 23.5, top + 2); g.lineTo(24, b); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(18.5, b - h * 18, 1.8, h * 7, .25, 0, TAU); g.fill(); g.restore();
    /* leafy collar: three little leaves at the foot */
    const m = ['#6fd06a', '#2f8f4a', '#d2f7c4'];
    leaf(g, 22, b - 1, PI + .55, 13, m, 2); leaf(g, 26, b - 1, -.55, 13, m, 2);
    g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(24, b + .5, 12, 3.6, 0, 0, TAU); g.fill(); g.fillStyle = '#4cb85a'; g.beginPath(); g.ellipse(24, b - .3, 10.4, 2.4, 0, 0, TAU); g.fill();
  };
  SPR.thorn = sprite(48, 48, g => thorn(g, 1));
  SPR.thornS = sprite(48, 48, g => thorn(g, .52));
  /* a wooden crate (1 x 1 block) */
  SPR.crate = sprite(44, 44, g => {
    g.fillStyle = PAL.ink; rrect(g, 0, 0, 44, 44, 5); g.fill();
    g.fillStyle = '#c98a4e'; rrect(g, 2.5, 2.5, 39, 39, 3.5); g.fill();
    g.fillStyle = '#e6aa6a'; g.fillRect(6.5, 6.5, 31, 31);
    g.fillStyle = '#f2c48c'; g.fillRect(6.5, 6.5, 31, 4);
    g.strokeStyle = '#a86b3c'; g.lineWidth = 1.2; for (const y of [16.5, 27.5]) { g.beginPath(); g.moveTo(6.5, y); g.lineTo(37.5, y); g.stroke(); }
    g.strokeStyle = PAL.ink; g.lineWidth = 2.2; g.beginPath(); g.moveTo(7.5, 36.5); g.lineTo(36.5, 7.5); g.stroke();
    g.strokeStyle = '#c98a4e'; g.lineWidth = 4.2; g.beginPath(); g.moveTo(9, 35); g.lineTo(35, 9); g.stroke();
    g.fillStyle = '#7a4a2a'; for (const [x, y] of [[5, 5], [39, 5], [5, 39], [39, 39]]) { circle(g, x, y, 1.4); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(3.5, 3.5, 37, 2);
  });
  /* spring caps: a mushroom-cap jump pad (1 block wide, ~0.45 tall) */
  const cap = (body, dark, light) => sprite(48, 28, g => {
    g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(24, 23, 20.5, 5, 0, 0, TAU); g.fill(); g.fillStyle = '#f3e6c8'; g.beginPath(); g.ellipse(24, 22.5, 18, 3.2, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(4, 22); g.bezierCurveTo(4, 4, 44, 4, 44, 22); g.closePath(); g.lineWidth = 3.2; g.strokeStyle = PAL.ink; g.stroke(); g.fillStyle = dark; g.fill();
    g.save(); g.clip(); g.fillStyle = body; g.beginPath(); g.ellipse(22, 17, 19, 11, 0, 0, TAU); g.fill(); g.fillStyle = light; g.beginPath(); g.ellipse(16, 11, 6, 2.6, -.4, 0, TAU); g.fill(); g.restore();
    g.fillStyle = '#fff'; for (const [x, y, r] of [[13, 16, 2.6], [24, 11, 3], [34, 15, 2.4], [29, 19.5, 1.6]]) { circle(g, x, y, r); g.fill(); }
  });
  SPR.capY = cap('#ffd93b', '#f0a020', '#fffbe0');
  SPR.capP = cap('#ff8fc4', '#e0508e', '#ffe0ef');
  /* puff rings: a dandelion clock (radius ~0.65 block) with a tinted glow */
  const ring = (tint, core) => sprite(80, 80, g => {
    const gr = g.createRadialGradient(40, 40, 6, 40, 40, 39); gr.addColorStop(0, tint + 'aa'); gr.addColorStop(.55, tint + '55'); gr.addColorStop(1, tint + '00');
    g.fillStyle = gr; circle(g, 40, 40, 39); g.fill();
    const N = 18;
    for (let i = 0; i < N; i++) { const a = i / N * TAU, x = 40 + Math.cos(a) * 23, y = 40 + Math.sin(a) * 23; g.strokeStyle = 'rgba(43,33,64,.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(40 + Math.cos(a) * 6, 40 + Math.sin(a) * 6); g.lineTo(x, y); g.stroke(); }
    for (let i = 0; i < N; i++) { const a = i / N * TAU, x = 40 + Math.cos(a) * 24, y = 40 + Math.sin(a) * 24; g.fillStyle = PAL.ink; circle(g, x, y, 6.2); g.fill(); }
    for (let i = 0; i < N; i++) { const a = i / N * TAU, x = 40 + Math.cos(a) * 24, y = 40 + Math.sin(a) * 24; g.fillStyle = '#ffffff'; circle(g, x, y, 4.6); g.fill(); g.fillStyle = tint; circle(g, x + 1, y + 1.2, 2); g.fill(); }
    g.fillStyle = PAL.ink; circle(g, 40, 40, 7.5); g.fill(); g.fillStyle = core; circle(g, 40, 40, 5.5); g.fill(); g.fillStyle = 'rgba(255,255,255,.7)'; circle(g, 38, 38, 1.8); g.fill();
  });
  SPR.ringY = ring('#ffd93b', '#d9a066');
  SPR.ringP = ring('#ff7eb6', '#d98aa6');
  /* clouds */
  SPR.cloud = [0, 1, 2].map(k => sprite(200, 90, g => {
    const B = k === 0 ? [[50, 58, 26], [82, 44, 32], [120, 50, 30], [150, 62, 22], [100, 66, 24]] : k === 1 ? [[60, 58, 22], [90, 48, 27], [124, 56, 24], [96, 66, 20]] : [[44, 60, 18], [70, 50, 24], [100, 46, 28], [132, 54, 24], [158, 62, 16], [100, 66, 22]];
    g.fillStyle = 'rgba(120,150,200,.55)'; for (const [x, y, r] of B) { circle(g, x, y, r + 3); g.fill(); }
    g.fillStyle = '#ffffff'; for (const [x, y, r] of B) { circle(g, x, y, r); g.fill(); }
    g.fillStyle = '#e9f3ff'; for (const [x, y, r] of B) { g.beginPath(); g.ellipse(x + r * .1, y + r * .45, r * .8, r * .4, 0, 0, TAU); g.fill(); }
  }));
  /* far hills: a patchwork of little fields (2560 wide, repeats) */
  SPR.hills = sprite(2560, 260, g => {
    const ridge = (base, amp, seed, col, dark, fields) => {
      g.beginPath(); g.moveTo(0, 260);
      const pts = []; for (let x = 0; x <= 2560; x += 16) { const y = base - amp * (.55 * Math.sin(x / 2560 * TAU * 3 + seed) + .3 * Math.sin(x / 2560 * TAU * 7 + seed * 2) + .15 * Math.sin(x / 2560 * TAU * 13 + seed * 3)); pts.push([x, y]); g.lineTo(x, y); }
      g.lineTo(2560, 260); g.closePath(); g.fillStyle = col; g.fill();
      if (fields) { g.save(); g.clip(); for (let i = 0; i < 70; i++) { const x = i * 37 + hash(i, seed * 9 | 0) * 30, y = base - amp * .2 + hash(i, 7) * 90, w = 40 + hash(i, 3) * 60, h = 14 + hash(i, 5) * 18;
        g.fillStyle = ['#b5e48c', '#d9ed92', '#99d98c', '#f6e7a6', '#c7e9b0'][i % 5]; g.save(); g.translate(x, y); g.rotate((hash(i, 11) - .5) * .25); g.globalAlpha = .75; g.fillRect(0, 0, w, h); g.globalAlpha = .35; g.strokeStyle = dark; g.lineWidth = 1.5; g.strokeRect(0, 0, w, h); g.restore(); } g.restore(); }
      g.strokeStyle = dark; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    };
    ridge(120, 70, 1.3, '#a7d8a0', 'rgba(60,110,80,.6)', false);
    ridge(170, 55, 4.1, '#8fcf86', 'rgba(50,100,60,.75)', true);
  });
  /* mid scenery: a round tree, a sunflower, a picket fence piece, a bush, a windmill-free cottage chimney is left for later */
  SPR.tree = sprite(150, 210, g => {
    g.fillStyle = PAL.ink; rrect(g, 64, 110, 22, 100, 6); g.fill(); g.fillStyle = '#a8724a'; rrect(g, 67, 112, 16, 98, 4); g.fill(); g.fillStyle = '#c99068'; g.fillRect(69, 114, 4, 90);
    const B = [[75, 70, 52], [40, 92, 34], [110, 92, 34], [58, 50, 30], [96, 48, 32]];
    g.fillStyle = PAL.ink; for (const [x, y, r] of B) { circle(g, x, y, r + 3.4); g.fill(); }
    g.fillStyle = '#3f9a4a'; for (const [x, y, r] of B) { circle(g, x, y, r); g.fill(); }
    g.fillStyle = '#5cc85a'; for (const [x, y, r] of B) { circle(g, x - r * .12, y - r * .16, r * .84); g.fill(); }
    g.fillStyle = '#a6eb8f'; for (const [x, y, r] of B) { g.beginPath(); g.ellipse(x - r * .36, y - r * .4, r * .3, r * .15, -.6, 0, TAU); g.fill(); }
    g.fillStyle = PAL.ink; for (const [x, y] of [[52, 78], [98, 66], [80, 100], [116, 98]]) { circle(g, x, y, 5); g.fill(); } g.fillStyle = '#ff6b6b'; for (const [x, y] of [[52, 78], [98, 66], [80, 100], [116, 98]]) { circle(g, x, y, 3.4); g.fill(); }
  });
  SPR.sunflower = sprite(60, 150, g => {
    g.strokeStyle = PAL.ink; g.lineWidth = 7; g.beginPath(); g.moveTo(30, 150); g.quadraticCurveTo(26, 90, 30, 40); g.stroke(); g.strokeStyle = '#4cb85a'; g.lineWidth = 3.6; g.stroke();
    leaf(g, 29, 100, PI + .5, 22, ['#6fd06a', '#2f8f4a', '#d2f7c4'], 2.2); leaf(g, 30, 80, -.5, 20, ['#6fd06a', '#2f8f4a', '#d2f7c4'], 2.2);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.save(); g.translate(30, 34); g.rotate(a); g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(17, 0, 10.5, 5.6, 0, 0, TAU); g.fill(); g.fillStyle = i & 1 ? '#ffd93b' : '#ffc21a'; g.beginPath(); g.ellipse(17, 0, 8.5, 3.8, 0, 0, TAU); g.fill(); g.restore(); }
    g.fillStyle = PAL.ink; circle(g, 30, 34, 12); g.fill(); g.fillStyle = '#8a5a2b'; circle(g, 30, 34, 9.6); g.fill(); g.fillStyle = '#b07a40'; for (let i = 0; i < 9; i++) { circle(g, 26 + (i % 3) * 4, 30 + ((i / 3) | 0) * 4, 1.1); g.fill(); }
  });
  SPR.fence = sprite(170, 80, g => {
    g.fillStyle = PAL.ink; g.fillRect(0, 34, 170, 13); g.fillRect(0, 58, 170, 13); g.fillStyle = '#fff6e0'; g.fillRect(0, 37, 170, 7); g.fillRect(0, 61, 170, 7);
    for (let i = 0; i < 5; i++) { const x = 10 + i * 34; g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(x - 1.5, 80); g.lineTo(x - 1.5, 14); g.lineTo(x + 9, 2); g.lineTo(x + 19.5, 14); g.lineTo(x + 19.5, 80); g.closePath(); g.fill();
      g.fillStyle = '#fff6e0'; g.beginPath(); g.moveTo(x + 1.5, 80); g.lineTo(x + 1.5, 15); g.lineTo(x + 9, 6.5); g.lineTo(x + 16.5, 15); g.lineTo(x + 16.5, 80); g.closePath(); g.fill(); g.fillStyle = '#e8dcc0'; g.fillRect(x + 11, 16, 5, 64); }
  });
  SPR.bush = sprite(120, 70, g => {
    const B = [[30, 46, 22], [60, 34, 28], [92, 46, 22], [60, 52, 20]];
    g.fillStyle = PAL.ink; for (const [x, y, r] of B) { circle(g, x, y, r + 3); g.fill(); } g.fillRect(8, 50, 104, 20);
    g.fillStyle = '#3f9a4a'; for (const [x, y, r] of B) { circle(g, x, y, r); g.fill(); } g.fillRect(11, 50, 98, 17);
    g.fillStyle = '#5cc85a'; for (const [x, y, r] of B) { circle(g, x - r * .1, y - r * .16, r * .84); g.fill(); }
    for (const [x, y, c] of [[40, 30, '#fff3a0'], [70, 22, '#ffd0e0'], [88, 40, '#ffffff'], [52, 50, '#ffd0e0']]) { g.fillStyle = PAL.ink; circle(g, x, y, 4.2); g.fill(); g.fillStyle = c; for (let p = 0; p < 5; p++) { const a = p * TAU / 5; circle(g, x + Math.cos(a) * 1.9, y + Math.sin(a) * 1.9, 1.6); g.fill(); } g.fillStyle = PAL.gold; circle(g, x, y, 1.2); g.fill(); }
  });
  /* the ground: grass lip with a scalloped edge over a soil checker (160 wide = 4 blocks, 200 tall; repeats) */
  SPR.ground = sprite(160, 220, g => {
    g.fillStyle = '#b8794a'; g.fillRect(0, 0, 160, 220);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) if ((x + y) & 1) { g.fillStyle = '#a96b3f'; g.fillRect(x * 40, 14 + y * 40, 40, 40); }
    for (let i = 0; i < 26; i++) { const x = hash(i, 3) * 160, y = 26 + hash(i, 9) * 180; g.fillStyle = i % 3 ? 'rgba(255,230,190,.25)' : 'rgba(80,40,20,.25)'; circle(g, x, y, i % 4 ? 1.6 : 2.6); g.fill(); }
    for (let i = 0; i < 4; i++) { const x = 20 + i * 40 + hash(i, 5) * 10, y = 70 + hash(i, 6) * 110; g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(x, y, 6, 4.4, 0, 0, TAU); g.fill(); g.fillStyle = '#d6c2a8'; g.beginPath(); g.ellipse(x, y - .5, 4.4, 2.8, 0, 0, TAU); g.fill(); }
    g.fillStyle = PAL.ink; g.fillRect(0, 0, 160, 18);
    for (let x = 0; x <= 160; x += 20) { circle(g, x, 16, 11.5); g.fill(); }
    g.fillStyle = '#5cc85a'; g.fillRect(0, 3, 160, 12); for (let x = 0; x <= 160; x += 20) { circle(g, x, 14, 9); g.fill(); }
    g.fillStyle = '#8fe07a'; g.fillRect(0, 3, 160, 4); for (let x = 10; x <= 160; x += 20) { g.beginPath(); g.ellipse(x - 3, 9, 5, 2, 0, 0, TAU); g.fill(); }
  });
}

/* ---------- the runner (a beetroot): body bulb, little root, three leaves on red stems, a face ---------- */
function runner(g, who, cx, cy, s, rot, o) {
  o = o || {}; const C = RUN[who & 1], u = s / 2, lw = Math.max(1.6, s * .075);
  g.save(); g.translate(cx, cy);
  if (o.sq) { g.scale(1 + o.sq * .18, 1 - o.sq * .18); }
  g.rotate(rot || 0);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  /* leaves (behind the bulb) */
  const lv = C.leaf, wig = o.wig || 0;
  for (const [a, L, sx] of [[-2.25 + wig, .78, -.18], [-PI / 2 - wig * .6, .9, 0], [-.9 + wig, .78, .18]]) {
    const bx = sx * u, by = -.62 * u, ex = bx + Math.cos(a) * u * .45, ey = by + Math.sin(a) * u * .45;
    g.strokeStyle = PAL.ink; g.lineWidth = lw * 1.9; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
    g.strokeStyle = C.stem; g.lineWidth = lw * .9; g.stroke();
    leaf(g, ex, ey, a, L * u, lv, lw * .85);
  }
  /* bulb + root */
  g.beginPath(); g.moveTo(0, -.78 * u);
  g.bezierCurveTo(.62 * u, -.8 * u, .95 * u, -.3 * u, .88 * u, .18 * u);
  g.bezierCurveTo(.8 * u, .62 * u, .32 * u, .82 * u, .1 * u, .9 * u);
  g.quadraticCurveTo(.06 * u, 1.08 * u, .16 * u, 1.18 * u);
  g.quadraticCurveTo(-.06 * u, 1.12 * u, -.1 * u, .9 * u);
  g.bezierCurveTo(-.32 * u, .82 * u, -.8 * u, .62 * u, -.88 * u, .18 * u);
  g.bezierCurveTo(-.95 * u, -.3 * u, -.62 * u, -.8 * u, 0, -.78 * u);
  g.closePath(); g.strokeStyle = PAL.ink; g.lineWidth = lw * 1.6; g.stroke(); g.fillStyle = C.body[1]; g.fill();
  g.save(); g.clip(); g.fillStyle = C.body[0]; g.beginPath(); g.ellipse(-.1 * u, -.12 * u, .82 * u, .78 * u, 0, 0, TAU); g.fill();
  g.strokeStyle = C.body[1]; g.globalAlpha *= .5; g.lineWidth = lw * .6; for (const y of [.35, .55]) { g.beginPath(); g.moveTo(-.5 * u, y * u); g.quadraticCurveTo(0, (y + .1) * u, .5 * u, y * u); g.stroke(); } g.globalAlpha /= .5;
  g.fillStyle = C.body[2]; g.beginPath(); g.ellipse(-.42 * u, -.42 * u, .24 * u, .13 * u, -.6, 0, TAU); g.fill(); circle(g, -.12 * u, -.6 * u, Math.max(.6, .05 * u)); g.fill();
  g.restore();
  /* face */
  const mood = o.mood || 'open', eh = .36 * u;
  eye(g, -.3 * u, -.06 * u, eh, o.lx || .6, o.ly || 0, mood); eye(g, .3 * u, -.06 * u, eh, o.lx || .6, o.ly || 0, mood);
  blush(g, -.56 * u, .24 * u, .14 * u, .08 * u); blush(g, .56 * u, .24 * u, .14 * u, .08 * u);
  g.strokeStyle = PAL.ink; g.lineWidth = Math.max(1, lw * .75); g.lineCap = 'round'; g.beginPath();
  if (o.mouth === 'o') { g.fillStyle = PAL.ink; g.ellipse(0, .3 * u, .1 * u, .13 * u, 0, 0, TAU); g.fill(); }
  else { g.arc(0, .16 * u, .16 * u, .2 * PI, .8 * PI); g.stroke(); }
  g.restore();
}

/* ---------- the world ---------- */
const UI = { snd: [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }], b1: null, b2: null, pause: null, again: null, back: null };
function sky(g, cam, t, pulse) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#79cdf5'); gr.addColorStop(.55, '#bfe8ff'); gr.addColorStop(.85, '#fff1d0'); gr.addColorStop(1, '#ffe7b8');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  /* the sun, its rays turning slowly and swelling on the beat */
  const sx = W - 220, sy = 120 + cam.y * BS * .05, sr = 46 + pulse * 4;
  g.save(); g.translate(sx, sy); g.rotate(t * .15); g.fillStyle = 'rgba(255,236,150,.55)';
  for (let i = 0; i < 12; i++) { g.rotate(TAU / 12); g.beginPath(); g.moveTo(sr + 6, -7); g.lineTo(sr + 34 + pulse * 8, 0); g.lineTo(sr + 6, 7); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(255,240,170,.5)'; circle(g, sx, sy, sr + 10); g.fill();
  g.fillStyle = PAL.ink; circle(g, sx, sy, sr + 3); g.fill(); g.fillStyle = '#ffd93b'; circle(g, sx, sy, sr); g.fill(); g.fillStyle = '#ffe98a'; circle(g, sx - 8, sy - 8, sr * .72); g.fill();
  /* clouds (very slow parallax, drifting) */
  for (let i = 0; i < 7; i++) {
    const span = 2200, x = ((hash(i, 1) * span - (cam.x * BS * .06 + t * 8 * (1 + (i % 3) * .3))) % span + span) % span - 300, y = 40 + hash(i, 2) * 170 + cam.y * BS * .06;
    const c = SPR.cloud[i % 3]; g.drawImage(c, x, y, c.lw * (.8 + hash(i, 4) * .5), c.lh * (.8 + hash(i, 4) * .5));
  }
  /* patchwork hills */
  const hx = ((cam.x * BS * .15) % 2560 + 2560) % 2560, hy = GY - 200 + cam.y * BS * .15;
  g.drawImage(SPR.hills, -hx, hy, 2560, 260); g.drawImage(SPR.hills, 2560 - hx, hy, 2560, 260);
  g.fillStyle = '#8fcf86'; g.fillRect(0, hy + 258, W, H);
}
/* mid layer: trees, sunflowers, fences and bushes along a hedge line, placed by hash every 3 blocks of parallax space */
function midLayer(g, cam, t, pulse) {
  const P = .45, gy = GY + cam.y * BS * P - 22, x0 = cam.x * P, cell = 3, Z = .72;
  g.fillStyle = '#86cc78'; g.fillRect(0, gy - 4, W, H - gy + 4);
  g.strokeStyle = 'rgba(43,33,64,.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, gy - 4); g.lineTo(W, gy - 4); g.stroke();
  const k0 = Math.floor(x0 / cell) - 2, k1 = k0 + Math.ceil(W / BS / cell) + 5;
  for (let k = k0; k <= k1; k++) {
    const h = hash(k, 77), sx = (k * cell + hash(k, 5) * 1.5 - x0) * BS;
    if (h < .2) { const c = SPR.tree, s = (.8 + hash(k, 6) * .3) * Z; g.drawImage(c, sx - c.lw * s / 2, gy - c.lh * s + 4, c.lw * s, c.lh * s); }
    else if (h < .42) { const c = SPR.sunflower, s = (.75 + hash(k, 8) * .25) * Z, sw = Math.sin(t * 2 + k) * .03 + pulse * .02; g.save(); g.translate(sx, gy + 2); g.rotate(sw); g.drawImage(c, -c.lw * s / 2, -c.lh * s, c.lw * s, c.lh * s); g.restore(); }
    else if (h < .62) { const c = SPR.fence; g.drawImage(c, sx - 45, gy - c.lh * .52 + 2, c.lw * .52, c.lh * .52); }
    else if (h < .8) { const c = SPR.bush; g.drawImage(c, sx - 34, gy - c.lh * .56 + 3, c.lw * .56, c.lh * .56); }
  }
  g.fillStyle = 'rgba(214,236,255,.34)'; g.fillRect(0, 0, W, H);   /* a little air between the scenery and the play layer */
}
function ground(g, cam) {
  const gy = GY + cam.y * BS; if (gy > H + 20) return;
  const off = ((cam.x * BS) % 160 + 160) % 160, T = SPR.ground;
  for (let x = -off; x < W; x += 160) g.drawImage(T, x, gy - 3, 160, 220);
  if (gy + 217 < H) { g.fillStyle = '#a96b3f'; g.fillRect(0, gy + 217, W, H - gy - 217); }
}
/* the objects in view */
function objects(g, L, cam, t, pulse, used) {
  const x0 = cam.x - 2, x1 = cam.x + W / BS + 2, O = L.O;
  let i = lowerBound(O, x0 - 30);
  const sx = x => (x - cam.x) * BS, sy = y => GY - (y - cam.y) * BS;
  for (; i < O.length; i++) {
    const o = O[i]; if (o.x > x1) break; if (o.x + o.w < x0) continue;
    const X = sx(o.x), Y = sy(o.y);
    if (o.k === 's') {
      if (o.t === 'crate') { for (let a = 0; a < o.w - .01; a++) for (let b = 0; b < o.h - .01; b++) g.drawImage(SPR.crate, X + a * BS - 2, Y - (b + 1) * BS - 2, 44, 44); }
      else if (o.t === 'planter') planter(g, X, Y, o.w, o.h, t, pulse);
      else plank(g, X, Y, o.w);
    } else if (o.k === 't') {
      const c = o.t === 'thorn' ? SPR.thorn : SPR.thornS;
      if (o.down) { g.save(); g.translate(X + 20, Y - 20); g.scale(1, -1); g.drawImage(c, -24, -24 - 2, 48, 48); g.restore(); }
      else g.drawImage(c, X - 4, Y - 46, 48, 48);
    } else if (o.k === 'p') {
      const c = o.t === 'capY' ? SPR.capY : SPR.capP, u = used && used.pad === o.i ? clamp01(1 - used.padAge / .3) : 0, sq = 1 - u * .35 + pulse * .04;
      g.drawImage(c, X - 4, Y - 26 * sq, 48, 28 * sq);
    } else if (o.k === 'r') {
      const c = o.t === 'ringY' ? SPR.ringY : SPR.ringP, u = used && used.ring === o.i ? clamp01(used.ringAge / .35) : 0;
      const s = (1 + pulse * .1) * (1 + u * .5), cx = X + 20, cy = Y - 20;
      g.save(); g.globalAlpha = 1 - u * .85; g.translate(cx, cy); g.rotate(Math.sin(t * 1.3 + o.x) * .1); g.drawImage(c, -40 * s, -40 * s, 80 * s, 80 * s); g.restore();
    }
  }
  /* the finish: a flower arch */
  const fx = sx(L.len); if (fx > -200 && fx < W + 200) finishArch(g, fx, sy(0), t, pulse);
}
function lowerBound(O, x) { let lo = 0, hi = O.length; while (lo < hi) { const m = (lo + hi) >> 1; if (O[m].x < x) lo = m + 1; else hi = m; } return lo; }
function planter(g, X, Y, w, h, t, pulse) {
  const PW = w * BS, PH = h * BS, top = Y - PH;
  g.fillStyle = PAL.ink; rrect(g, X - 2, top - 2, PW + 4, PH + 4, 7); g.fill();
  g.fillStyle = '#c4613a'; rrect(g, X + 1, top + 1, PW - 2, PH - 2, 5); g.fill();
  g.fillStyle = '#e88a5c'; g.fillRect(X + 4, top + 12, PW - 8, PH - 16);
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(X + 6, top + 14, PW - 12, 5);
  g.strokeStyle = 'rgba(120,50,30,.35)'; g.lineWidth = 2; for (let k = 1; k < w; k++) { g.beginPath(); g.moveTo(X + k * BS, top + 14); g.lineTo(X + k * BS, Y - 4); g.stroke(); }
  g.fillStyle = PAL.ink; g.fillRect(X - 2, top - 2, PW + 4, 13); g.fillStyle = '#d97a4a'; g.fillRect(X + 1, top + 1, PW - 2, 8); g.fillStyle = '#6b4a2f'; g.fillRect(X + 3, top + 1, PW - 6, 3);
  for (let k = 0; k < w; k++) { const x = X + k * BS + 20, sw = Math.sin(t * 3 + k * 1.7) * .15 + pulse * .1;
    g.save(); g.translate(x, top + 1); g.rotate(sw); g.strokeStyle = PAL.ink; g.lineWidth = 3.6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -9); g.stroke(); g.strokeStyle = '#4cb85a'; g.lineWidth = 1.8; g.stroke();
    leaf(g, 0, -8, PI + .7, 10, ['#7ed957', '#3f9a3a', '#e2ffd2'], 1.6); leaf(g, 0, -8, -.7, 10, ['#7ed957', '#3f9a3a', '#e2ffd2'], 1.6); g.restore(); }
}
function plank(g, X, Y, w) {
  const PW = w * BS, top = Y - 20;
  g.fillStyle = PAL.ink; rrect(g, X - 2, top - 2, PW + 4, 24, 6); g.fill();
  g.fillStyle = '#c98a4e'; rrect(g, X + 1, top + 1, PW - 2, 18, 4); g.fill(); g.fillStyle = '#eab87e'; g.fillRect(X + 3, top + 3, PW - 6, 9);
  g.strokeStyle = 'rgba(120,70,40,.5)'; g.lineWidth = 1.3; for (let k = 0; k < w * 2; k++) { const x = X + 10 + k * 20 + hash(k, w) * 6; g.beginPath(); g.moveTo(x, top + 6); g.quadraticCurveTo(x + 8, top + 8, x + 14, top + 6); g.stroke(); }
  g.fillStyle = '#7a4a2a'; circle(g, X + 7, top + 10, 1.8); g.fill(); circle(g, X + PW - 7, top + 10, 1.8); g.fill();
}
function finishArch(g, X, Y, t, pulse) {
  const w = 120, h = 230;
  for (const s of [-1, 1]) { const px = X + s * w / 2; g.fillStyle = PAL.ink; rrect(g, px - 9, Y - h, 18, h + 4, 7); g.fill(); g.fillStyle = '#5cc85a'; rrect(g, px - 6, Y - h + 3, 12, h, 5); g.fill(); g.fillStyle = '#9be88a'; g.fillRect(px - 4, Y - h + 6, 3, h - 10); }
  g.strokeStyle = PAL.ink; g.lineWidth = 22; g.beginPath(); g.arc(X, Y - h, w / 2, PI, 0); g.stroke(); g.strokeStyle = '#4cb85a'; g.lineWidth = 15; g.stroke();
  const cols = ['#ff7eb6', '#ffd93b', '#ffffff', '#ff9a45', '#b98cff'];
  for (let i = 0; i <= 10; i++) { const a = PI + i / 10 * PI, x = X + Math.cos(a) * w / 2, y = Y - h + Math.sin(a) * w / 2, r = 8 + (i % 2) * 2 + pulse * 2;
    g.fillStyle = PAL.ink; circle(g, x, y, r + 2.5); g.fill(); g.fillStyle = cols[i % 5]; for (let p = 0; p < 5; p++) { const b = p * TAU / 5 + t; circle(g, x + Math.cos(b) * r * .45, y + Math.sin(b) * r * .45, r * .5); g.fill(); } g.fillStyle = PAL.gold; circle(g, x, y, r * .32); g.fill(); }
  text(g, 'FINISH', X, Y - h - w / 2 - 22, 26, '#fff');
}

/* ---------- a whole view ---------- */
function view(g, o) {
  const cam = o.cam, t = o.t, pulse = o.pulse || 0, sim = o.sim;
  sky(g, cam, t, pulse); midLayer(g, cam, t, pulse); ground(g, cam);
  const L = sim ? sim.L : o.L;
  if (o.words) for (const w of o.words) { const X = (w.x - cam.x) * BS, Y = GY - (w.y - cam.y) * BS; if (X > -400 && X < W + 400) text(g, w.s, X, Y, w.z || 34, w.c || '#fff'); }
  if (L) objects(g, L, cam, t, pulse, o.used);
  if (o.fxUnder) o.fxUnder();
  if (o.ghosts) for (const gh of o.ghosts) drawRunner(g, gh, cam, t, true);
  if (o.runners) for (const r of o.runners) drawRunner(g, r, cam, t, false);
  if (o.fxOver) o.fxOver();
}
function drawRunner(g, r, cam, t, ghost) {
  if (!r || r.hide) return;
  const X = (r.x - cam.x) * BS, Y = GY - (r.y + .5 - cam.y) * BS;
  if (X < -60 || X > W + 60 || Y < -80 || Y > H + 80) { if (ghost && r.name && Y < -40) text(g, '▲ ' + r.name, clamp(X, 40, W - 40), 22, 16, RUN[r.who & 1].txt); return; }
  g.save(); if (ghost) g.globalAlpha = .45;
  const sq = r.sq || 0;
  if (!ghost && r.ground) { g.fillStyle = 'rgba(43,33,64,.18)'; g.beginPath(); g.ellipse(X, Y + 21, 17, 4, 0, 0, TAU); g.fill(); }
  runner(g, r.who, X, Y + sq * 3, 46, r.rot, { sq, mood: r.mood, mouth: r.mouth, wig: Math.sin(t * 9) * .08, alpha: r.alpha });
  g.restore();
  if (r.name) text(g, r.name, X, Y - 40, 15, RUN[r.who & 1].txt);
}

/* ---------- fx (world coords in blocks; age in seconds) ---------- */
function fx(g, f, age, cam) {
  const sx = (f.x - cam.x) * BS, sy = GY - (f.y - cam.y) * BS;
  if (f.k === 'leaf' || f.k === 'petal') {
    const life = f.life || .9; if (age > life) return false;
    const x = sx + f.vx * age * BS, y = sy - (f.vy * age - 9 * age * age) * BS, a = 1 - clamp01((age - life * .6) / (life * .4));
    g.save(); g.globalAlpha = a; if (f.k === 'leaf') leaf(g, x, y, f.r + f.vr * age, f.s || 12, f.m || ['#6fd06a', '#2f8f4a', '#d2f7c4'], 1.6);
    else { g.translate(x, y); g.rotate(f.r + f.vr * age); g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(0, 0, 6.5, 4.5, 0, 0, TAU); g.fill(); g.fillStyle = f.c || '#ff9ac4'; g.beginPath(); g.ellipse(0, 0, 5, 3.2, 0, 0, TAU); g.fill(); }
    g.restore(); return true;
  }
  if (f.k === 'trail') { if (age > .5) return false; const a = 1 - age / .5; g.save(); g.globalAlpha = a * .8; leaf(g, sx - age * 20, sy - age * 14, f.r + age * 3, 8, f.m, 1.3); g.restore(); return true; }
  if (f.k === 'dust') { if (age > .35) return false; const a = 1 - age / .35; g.fillStyle = 'rgba(255,248,230,' + (a * .8).toFixed(3) + ')'; for (let i = 0; i < 3; i++) { circle(g, sx + (i - 1) * 10 - age * 30, sy - 4 - age * 18, 5 + age * 18); g.fill(); } return true; }
  if (f.k === 'ring') { if (age > .4) return false; const a = 1 - age / .4; g.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; g.lineWidth = 4 * a + 1; circle(g, sx, sy, 16 + age * 120); g.stroke(); return true; }
  if (f.k === 'txt') {
    const life = f.life || .9; if (age > life) return false;
    const s = age < .12 ? .6 + easeOut(age / .12) * .55 : 1.15 - Math.min(.15, (age - .12) * .6), a = 1 - clamp01((age - life * .7) / (life * .3));
    g.save(); g.globalAlpha = a; g.translate(sx, sy - age * 30); g.scale(s, s); text(g, f.s, 0, 0, f.z || 30, f.c || '#fff'); g.restore(); return true;
  }
  if (f.k === 'spark') { if (age > .6) return false; const a = 1 - age / .6; g.save(); g.globalAlpha = a; for (let i = 0; i < 6; i++) { const b = i / 6 * TAU + age * 3; g.fillStyle = i & 1 ? '#fff' : '#ffd93b'; STAR(g, sx + Math.cos(b) * (10 + age * 70), sy + Math.sin(b) * (10 + age * 70), 7, 2.4, 4, age * 5); g.fill(); } g.restore(); return true; }
  return false;
}

/* ---------- HUD ---------- */
function hud(g, o) {
  /* the progress bar, top centre: own fill, everyone's markers */
  const bw = 440, bx = (W - bw) / 2, by = 18, bh = 22, pct = clamp(o.pct || 0, 0, 100);
  g.fillStyle = PAL.ink; rrect(g, bx - 4, by - 4, bw + 8, bh + 8, 15); g.fill();
  g.fillStyle = 'rgba(255,246,224,.9)'; rrect(g, bx, by, bw, bh, 11); g.fill();
  if (pct > 0) { g.save(); rrect(g, bx, by, bw, bh, 11); g.clip(); const gr = g.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, '#8fe07a'); gr.addColorStop(1, '#3fae4f'); g.fillStyle = gr; g.fillRect(bx, by, bw * pct / 100, bh); g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(bx, by + 3, bw * pct / 100, 5); g.restore(); }
  if (o.best > 0 && o.best < 100) { const x = bx + bw * o.best / 100; g.fillStyle = PAL.ink; g.fillRect(x - 1.5, by - 2, 3, bh + 4); }
  if (o.marks) for (const m of o.marks) { const x = bx + bw * clamp(m.pct, 0, 100) / 100; g.fillStyle = PAL.ink; circle(g, x, by + bh + 9, 8); g.fill(); g.fillStyle = RUN[m.who & 1].bar; circle(g, x, by + bh + 9, 5.6); g.fill(); }
  text(g, Math.floor(pct) + '%', bx + bw + 46, by + bh / 2, 24, '#fff');
  if (o.left) text(g, o.left, bx - 16, by + bh / 2, 18, o.leftC || '#fff', 'right');
  if (o.sub) text(g, o.sub, W / 2, by + bh + (o.marks ? 34 : 24), 16, '#fff');
  if (o.pauseBtn) { const r = UI.pause = { x: W - 78, y: 12, w: 64, h: 64 }; g.fillStyle = PAL.ink; rrect(g, r.x, r.y, r.w, r.h, 16); g.fill(); g.fillStyle = 'rgba(255,246,224,.92)'; rrect(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 13); g.fill(); g.fillStyle = PAL.ink; rrect(g, r.x + 21, r.y + 18, 8, 28, 3); g.fill(); rrect(g, r.x + 35, r.y + 18, 8, 28, 3); g.fill(); }
  else UI.pause = null;
}

/* ---------- screens ---------- */
function panel(g, x, y, w, h, col) {
  g.fillStyle = 'rgba(43,33,64,.35)'; rrect(g, x + 6, y + 8, w, h, 26); g.fill();
  g.fillStyle = PAL.ink; rrect(g, x - 4, y - 4, w + 8, h + 8, 28); g.fill();
  g.fillStyle = col || '#fff6e0'; rrect(g, x, y, w, h, 24); g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)'; rrect(g, x + 10, y + 8, w - 20, 10, 5); g.fill();
}
function button(g, r, label, col, z) {
  g.fillStyle = PAL.ink; rrect(g, r.x - 3, r.y - 3, r.w + 6, r.h + 6, 18); g.fill();
  g.fillStyle = col; rrect(g, r.x, r.y, r.w, r.h, 15); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; rrect(g, r.x + 8, r.y + 5, r.w - 16, 7, 4); g.fill();
  text(g, label, r.x + r.w / 2, r.y + r.h / 2 + 1, z || 24, '#fff');
}
function chip(g, i, x, y, on, label) {
  const w = tw(label, 16) + 54, h = 38, r = UI.snd[i] = { x, y, w, h };
  g.fillStyle = PAL.ink; rrect(g, x, y, w, h, 19); g.fill(); g.fillStyle = on ? 'rgba(255,246,224,.95)' : 'rgba(200,190,215,.9)'; rrect(g, x + 3, y + 3, w - 6, h - 6, 16); g.fill();
  g.fillStyle = PAL.ink; g.font = font(14); g.textAlign = 'center'; g.textBaseline = 'middle'; rrect(g, x + 8, y + 8, 22, 22, 6); g.fill(); g.fillStyle = '#fff'; g.fillText(i ? 'N' : 'M', x + 19, y + 19.5);
  g.fillStyle = PAL.ink; g.font = font(16); g.textAlign = 'left'; g.fillText(label, x + 38, y + 20); if (!on) { g.strokeStyle = PAL.ink; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x + 36, y + 20); g.lineTo(x + w - 12, y + 20); g.stroke(); }
  return w;
}
function screen(g, name, o) {
  o = o || {};
  if (name === 'title') {
    const t = o.t || 0, beat = o.beat || 0, pulse = o.pulse || 0;
    g.fillStyle = 'rgba(43,33,64,.18)'; g.fillRect(0, 0, W, H);
    /* the logo: BEET BEAT, each letter hopping on its beat */
    const word = 'BEET BEAT', z = 104, cols = ['#ff6f96', '#ffd36b'];
    let x = W / 2 - tw(word, z) / 2;
    for (let i = 0; i < word.length; i++) { const ch = word[i], w = tw(ch, z); if (ch !== ' ') { const ph = (beat + i * .125) % 1, hop = Math.max(0, Math.sin(clamp01(ph * 2) * PI)) * 14 * (1 - ph), c = i < 4 ? cols[0] : cols[1]; text(g, ch, x + w / 2, 132 - hop, z, c); } x += w; }
    text(g, 'a one-button garden rhythm run', W / 2, 212, 24, '#fff6e0');
    /* Ruby and Goldie hopping on the beat */
    const narrow = W < 1000;
    for (let i = 0; i < 2; i++) { const ph = (beat + i * .5) % 1, hy = Math.sin(clamp01(ph / .8) * PI) * 46, sq = ph > .8 ? (1 - (ph - .8) / .2) * .6 : 0;
      runner(g, i, W / 2 + (i ? 1 : -1) * (narrow ? 250 : 300), (narrow ? 548 : 470) - hy + sq * 4, narrow ? 96 : 120, Math.sin(clamp01(ph / .8) * PI) * .12 * (i ? 1 : -1), { sq, mood: ph < .8 && hy > 30 ? 'happy' : 'open', wig: Math.sin(t * 7 + i) * .1 }); }
    /* the level card */
    const cw = 470, cx = (W - cw) / 2, cy = 270; panel(g, cx, cy, cw, 150);
    text(g, o.level || 'PATCHWORK PULSE', W / 2, cy + 36, 32, '#ff8fb0');
    const d = (o.diff || 'easy').toUpperCase(); text(g, d, W / 2 - 110, cy + 78, 20, '#7ed957'); text(g, 'BEST ' + Math.floor(o.best || 0) + '%', W / 2 + 70, cy + 78, 20, '#ffd36b');
    face(g, W / 2 - 180, cy + 78, o.diff || 'easy');
    text(g, o.online ? o.cdText || '' : o.touch ? 'Tap to play' : 'SPACE: play   ·   ENTER: 2 players', W / 2, cy + 120, 22, '#fff');
    UI.b1 = o.online ? null : { x: cx, y: cy, w: cw, h: 150 };
    if (!o.online && o.touch) { const r = UI.b2 = { x: W / 2 - 120, y: 600, w: 240, h: 60 }; button(g, r, '2 players', '#ffb020', 24); } else UI.b2 = null;
    if (o.online) text(g, o.vsText || '', W / 2, 470, 26, '#fff');
    if (!o.touch && !o.online) text(g, 'tap, click, SPACE, W or UP to hop · hold to keep hopping · Esc: back', W / 2, 640, 18, '#fff6e0');
    /* M / N chips, bottom right (the room's own buttons sit top left) */
    const w2 = tw(o.music ? 'Music' : 'Music', 16) + 54; chip(g, 1, W - 24 - w2, H - 58, !!o.music, 'Music'); const w1 = tw('Sound', 16) + 54; chip(g, 0, W - 24 - w2 - 12 - w1, H - 58, !!o.sound, 'Sound');
    return;
  }
  if (name === 'count') {
    const n = o.n; if (n == null) return;
    const s = n > 0 ? String(n) : 'GO!', k = o.k || 0, sc = 1.4 - easeOut(k) * .4;
    g.save(); g.globalAlpha = 1 - clamp01((k - .7) / .3); g.translate(W / 2, H / 2 - 40); g.scale(sc, sc); text(g, s, 0, 0, 120, n > 0 ? '#fff' : '#7ed957'); g.restore();
    if (o.sub) text(g, o.sub, W / 2, H / 2 + 60, 26, '#fff');
    return;
  }
  if (name === 'results') {
    const age = o.age || 0, k = easeOut(age / .35), w = 620, h = 380, x = (W - w) / 2, y = (H - h) / 2 + (1 - k) * 60;
    g.fillStyle = 'rgba(43,33,64,' + (.35 * k).toFixed(3) + ')'; g.fillRect(0, 0, W, H);
    g.save(); g.globalAlpha = k; panel(g, x, y, w, h);
    text(g, o.title || 'LEVEL COMPLETE!', W / 2, y + 50, 44, o.titleC || '#7ed957');
    if (o.who != null) runner(g, o.who, x + w - 92, y + 196 - Math.abs(Math.sin(age * 5.76)) * 16, 92, 0, { mood: 'happy', wig: Math.sin(age * 8) * .12 });
    let ry = y + 130;
    for (const row of o.rows || []) { text(g, row[0], x + 230, ry, 24, row[2] || '#fff', 'right'); text(g, row[1], x + 252, ry, 24, '#ffd36b', 'left'); ry += 42; }
    if (o.prompt) text(g, o.prompt, W / 2, y + h - 34, 22, '#fff');
    if (o.prompt2) text(g, o.prompt2, W / 2, y + h + 34, 20, '#fff6e0');
    UI.again = { x, y, w, h };
    g.restore(); return;
  }
  if (name === 'pause') {
    g.fillStyle = 'rgba(43,33,64,.45)'; g.fillRect(0, 0, W, H);
    panel(g, W / 2 - 260, H / 2 - 130, 520, 260); text(g, 'PAUSED', W / 2, H / 2 - 70, 48, '#ffd36b');
    const a = UI.again = { x: W / 2 - 230, y: H / 2 - 20, w: 220, h: 64 }, b = UI.back = { x: W / 2 + 10, y: H / 2 - 20, w: 220, h: 64 };
    button(g, a, 'Carry on', '#5cc85a', 26); button(g, b, 'Title', '#b98cff', 26);
    text(g, o.touch ? '' : 'SPACE / P: carry on   ·   Esc: title', W / 2, H / 2 + 90, 18, '#fff'); return;
  }
  if (name === 'msg') {
    const lines = String(o.text || '').split('\n'), h = 60 + lines.length * 40, y = (o.y || H / 2) - h / 2;
    panel(g, W / 2 - 330, y, 660, h, '#4a3a6b'); lines.forEach((s, i) => text(g, s, W / 2, y + 48 + i * 40, 28, i ? '#fff6e0' : '#ffd36b')); return;
  }
  if (name === 'toast') { const a = clamp01(o.a == null ? 1 : o.a); g.save(); g.globalAlpha = a; text(g, o.text || '', W / 2, o.y || 96, 26, o.c || '#fff'); g.restore(); return; }
}
/* a difficulty face: a little round smiley in the level's colour */
function face(g, x, y, diff) {
  const col = diff === 'hard' ? '#ff6b6b' : diff === 'normal' ? '#ffb020' : '#7ed957';
  g.fillStyle = PAL.ink; circle(g, x, y, 17); g.fill(); g.fillStyle = col; circle(g, x, y, 14); g.fill(); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(x - 5, y - 6, 5, 2.6, -.5, 0, TAU); g.fill();
  eye(g, x - 5, y - 1, 7, 0, 0, diff === 'easy' ? 'happy' : 'open'); eye(g, x + 5, y - 1, 7, 0, 0, diff === 'easy' ? 'happy' : 'open');
  g.strokeStyle = PAL.ink; g.lineWidth = 1.8; g.beginPath(); g.arc(x, y + 3, 5, .2 * PI, .8 * PI); g.stroke();
}

BEAT.Render = {
  W, H, BS, GY, PX, RUN, UI, ready: false,
  init(r) { R = r || 1; TXT = new Map(); txtB = 0; bake(); this.ready = true; },
  setView(w) { W = w; PX = w < 1000 ? 250 : 400; this.W = W; this.PX = PX; },
  view, hud, screen, fx, text, runner, tw
};
})();
