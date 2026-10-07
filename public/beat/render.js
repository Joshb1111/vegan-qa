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
  s = String(s).slice(0, 90); if (!s) return 0; size = Math.round(clamp(+size || 14, 6, 140) * 2) / 2; fill = fill || '#fff'; align = align || 'center';
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
  SPR.capB = cap('#7cc8ff', '#3a86d8', '#e6f6ff');
  /* the blue one (flips gravity): no spokes and no hub (in the works, next to the cogs, it must not read as a blade): a soft
     seed head of pale blue fluff with white flip arrows in it */
  SPR.ringB = sprite(80, 80, g => {
    const gr = g.createRadialGradient(40, 40, 6, 40, 40, 39); gr.addColorStop(0, '#5ab4ffaa'); gr.addColorStop(.55, '#5ab4ff55'); gr.addColorStop(1, '#5ab4ff00');
    g.fillStyle = gr; circle(g, 40, 40, 39); g.fill();
    const N = 16;
    for (let i = 0; i < N; i++) { const a = i / N * TAU, x = 40 + Math.cos(a) * 24, y = 40 + Math.sin(a) * 24; g.fillStyle = PAL.ink; circle(g, x, y, 6.6); g.fill(); }
    for (let i = 0; i < N; i++) { const a = i / N * TAU, x = 40 + Math.cos(a) * 24, y = 40 + Math.sin(a) * 24; g.fillStyle = i & 1 ? '#ffffff' : '#d6eeff'; circle(g, x, y, 5); g.fill(); }
    g.fillStyle = 'rgba(214,238,255,.92)'; circle(g, 40, 40, 17); g.fill();
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + .3, q = i % 3 ? 9 : 4; g.fillStyle = '#ffffff'; circle(g, 40 + Math.cos(a) * q, 40 + Math.sin(a) * q, 3.4); g.fill(); }
    for (const up of [true, false]) { const ax = up ? 33 : 47, ay = up ? 39 : 41, d = up ? -1 : 1; g.beginPath(); g.moveTo(ax, ay + d * 10); g.lineTo(ax + 6.5, ay); g.lineTo(ax + 2.6, ay); g.lineTo(ax + 2.6, ay - d * 6); g.lineTo(ax - 2.6, ay - d * 6); g.lineTo(ax - 2.6, ay); g.lineTo(ax - 6.5, ay); g.closePath(); g.lineWidth = 3.4; g.strokeStyle = PAL.ink; g.lineJoin = 'round'; g.stroke(); g.fillStyle = '#3a9ee8'; g.fill(); }
  });
  /* a golden seed: a plump striped seed with a shine (drawn 44 x 44, centred) */
  SPR.seed = sprite(44, 44, g => {
    g.translate(22, 22); g.rotate(-.35);
    const p = () => { g.beginPath(); g.moveTo(0, -17); g.bezierCurveTo(12, -14, 13, 6, 0, 17); g.bezierCurveTo(-13, 6, -12, -14, 0, -17); g.closePath(); };
    p(); g.lineWidth = 3.4; g.strokeStyle = PAL.ink; g.stroke(); g.fillStyle = '#f0a020'; g.fill();
    g.save(); p(); g.clip(); g.fillStyle = '#ffd93b'; g.beginPath(); g.ellipse(-2, -2, 9, 15, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(190,110,20,.55)'; g.lineWidth = 1.6; for (const x of [-5, 0, 5]) { g.beginPath(); g.moveTo(x, -15); g.quadraticCurveTo(x * 1.4, 0, x * .6, 15); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(-4, -7, 2.6, 6, .2, 0, TAU); g.fill(); g.restore();
  });
  /* the works' mid layer (fix round 2: no cogs: a toothed disc by the thorns read as a blade): a green water butt with a lid,
     two hoops and a tap, and a little pile of upturned terracotta flowerpots */
  SPR.butt = sprite(60, 72, g => {
    g.fillStyle = PAL.ink; rrect(g, 6, 8, 48, 64, 13); g.fill(); g.fillStyle = '#5a9a6a'; rrect(g, 9, 11, 42, 58, 11); g.fill();
    g.fillStyle = '#7fc48c'; rrect(g, 14, 15, 11, 48, 5.5); g.fill();
    g.fillStyle = 'rgba(43,33,64,.38)'; g.fillRect(9, 27, 42, 4); g.fillRect(9, 52, 42, 4);
    g.fillStyle = PAL.ink; rrect(g, 2, 2, 56, 13, 6.5); g.fill(); g.fillStyle = '#3f7a50'; rrect(g, 5, 5, 50, 7, 3.5); g.fill();
    g.fillStyle = PAL.ink; rrect(g, 42, 56, 15, 8, 3); g.fill(); g.fillStyle = '#d8d0e6'; rrect(g, 44, 58, 11, 4, 2); g.fill();
  });
  SPR.wall = sprite(68, 20, g => {   /* the works' low brick wall (baked: it was some 20 path calls a frame each) */
    g.fillStyle = PAL.ink; rrect(g, 0, 0, 68, 20, 4); g.fill(); g.fillStyle = '#a8584a'; rrect(g, 2, 2, 64, 18, 3); g.fill();
    g.strokeStyle = 'rgba(43,33,64,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(2, 11); g.lineTo(66, 11);
    for (let q = -24; q <= 24; q += 16) { g.moveTo(34 + q, 2); g.lineTo(34 + q, 11); g.moveTo(34 + q + 8, 11); g.lineTo(34 + q + 8, 20); } g.stroke();
  });
  SPR.pots = sprite(70, 66, g => {
    const pot = (x, y, w, h) => {   /* upside down: the rim at the bottom */
      g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(x - w * .34 - 3, y - h - 3); g.lineTo(x + w * .34 + 3, y - h - 3); g.lineTo(x + w / 2 + 3, y + 1); g.lineTo(x - w / 2 - 3, y + 1); g.closePath(); g.fill();
      g.fillStyle = '#e0814f'; g.beginPath(); g.moveTo(x - w * .34, y - h); g.lineTo(x + w * .34, y - h); g.lineTo(x + w / 2, y - 2); g.lineTo(x - w / 2, y - 2); g.closePath(); g.fill();
      g.fillStyle = '#b9563a'; g.fillRect(x - w / 2, y - 10, w, 8); g.fillStyle = 'rgba(255,255,255,.32)'; g.fillRect(x - w * .22, y - h + 4, 4, h - 16);
    };
    pot(19, 64, 32, 30); pot(51, 64, 32, 30); pot(35, 34, 28, 28);
  });
  /* a brick potting-shed chimney with a cap */
  SPR.chimney = sprite(70, 170, g => {
    g.fillStyle = PAL.ink; rrect(g, 9, 24, 52, 150, 6); g.fill(); g.fillStyle = '#c4613a'; g.fillRect(13, 28, 44, 146);
    g.strokeStyle = 'rgba(90,30,20,.45)'; g.lineWidth = 1.6; for (let y = 40; y < 170; y += 14) { g.beginPath(); g.moveTo(13, y); g.lineTo(57, y); g.stroke(); for (let x = (y / 14 & 1) ? 22 : 30; x < 57; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 14); g.stroke(); } }
    g.fillStyle = PAL.ink; rrect(g, 3, 12, 64, 18, 5); g.fill(); g.fillStyle = '#8a4a3a'; rrect(g, 6, 15, 58, 12, 4); g.fill(); g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(9, 16, 50, 3);
  });
  /* a striped hot-air balloon (no one in it, just a little basket of flowers) */
  SPR.balloon = sprite(90, 140, g => {
    const env = () => { g.beginPath(); g.moveTo(45, 6); g.bezierCurveTo(90, 6, 92, 60, 58, 92); g.lineTo(32, 92); g.bezierCurveTo(-2, 60, 0, 6, 45, 6); g.closePath(); };
    env(); g.lineWidth = 4; g.strokeStyle = PAL.ink; g.stroke(); g.fillStyle = '#ff9ac4'; g.fill();
    g.save(); env(); g.clip(); for (let i = 0; i < 5; i++) { if (i & 1) continue; g.fillStyle = ['#fff6e0', '#ffd93b', '#9be8ff'][i / 2 | 0]; g.beginPath(); g.ellipse(45, 50, 10 + (2 - i) * 0 + 8, 48, 0, 0, TAU); g.globalAlpha = 1; g.fillRect(14 + i * 13, 0, 11, 100); }
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(28, 28, 7, 14, -.3, 0, TAU); g.fill(); g.restore();
    g.strokeStyle = PAL.ink; g.lineWidth = 2; for (const [a, b] of [[34, 36], [56, 54]]) { g.beginPath(); g.moveTo(a, 92); g.lineTo(b, 116); g.stroke(); }
    g.fillStyle = PAL.ink; rrect(g, 31, 112, 28, 22, 5); g.fill(); g.fillStyle = '#c98a4e'; rrect(g, 34, 115, 22, 16, 3); g.fill();
    for (const [x, c] of [[37, '#ff7eb6'], [45, '#ffd93b'], [53, '#ffffff']]) { g.fillStyle = PAL.ink; circle(g, x, 112, 4.4); g.fill(); g.fillStyle = c; circle(g, x, 112, 3); g.fill(); }
  });
  /* a diamond kite with bows on its tail */
  SPR.kite = sprite(70, 130, g => {
    g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(35, 74); g.bezierCurveTo(20, 95, 50, 105, 30, 128); g.stroke();
    for (const [x, y] of [[30, 90], [38, 104], [30, 118]]) { g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(x - 7, y - 4); g.lineTo(x + 7, y + 4); g.lineTo(x + 7, y - 4); g.lineTo(x - 7, y + 4); g.closePath(); g.fill(); g.fillStyle = '#ffd93b'; circle(g, x, y, 2); g.fill(); }
    g.beginPath(); g.moveTo(35, 4); g.lineTo(64, 34); g.lineTo(35, 74); g.lineTo(6, 34); g.closePath(); g.lineWidth = 4; g.stroke(); g.fillStyle = '#7fd0ff'; g.fill();
    g.fillStyle = '#ff9ac4'; g.beginPath(); g.moveTo(35, 4); g.lineTo(64, 34); g.lineTo(35, 34); g.closePath(); g.fill(); g.beginPath(); g.moveTo(35, 34); g.lineTo(6, 34); g.lineTo(35, 74); g.closePath(); g.fill();
    g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(35, 6); g.lineTo(35, 72); g.moveTo(8, 34); g.lineTo(62, 34); g.stroke();
  });
  /* skyway far layer: floating cloud islands with little round trees (2560 wide, repeats) */
  SPR.isles = sprite(2560, 300, g => {
    for (let i = 0; i < 9; i++) {
      const x = 120 + i * 280 + hash(i, 4) * 90, y = 90 + hash(i, 8) * 130, w = 110 + hash(i, 2) * 90;
      g.fillStyle = 'rgba(150,120,200,.35)'; g.beginPath(); g.ellipse(x, y + 18, w * .55, 22, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; for (let k = 0; k < 5; k++) { circle(g, x - w * .4 + k * w * .2, y + 8 + (k & 1) * 6, 20 + (k % 3) * 5); g.fill(); }
      g.fillStyle = '#b5e48c'; g.beginPath(); g.ellipse(x, y - 4, w * .46, 12, 0, PI, 0); g.fill();
      for (let k = 0; k < 3; k++) { const tx = x - w * .25 + k * w * .25, th = 22 + hash(i, k) * 16; g.fillStyle = '#a8724a'; g.fillRect(tx - 2.5, y - 8 - th * .5, 5, th * .5); g.fillStyle = k & 1 ? '#5cc85a' : '#8fe07a'; circle(g, tx, y - 10 - th * .55, th * .42); g.fill(); }
    }
  });
  /* works far layer: greenhouses and potting sheds against the evening (2560 wide, repeats) */
  SPR.sheds = sprite(2560, 260, g => {
    g.fillStyle = '#b07aa0'; g.beginPath(); g.moveTo(0, 260); for (let x = 0; x <= 2560; x += 32) g.lineTo(x, 150 - 30 * Math.sin(x / 2560 * TAU * 4) - 14 * Math.sin(x / 2560 * TAU * 11)); g.lineTo(2560, 260); g.closePath(); g.fill();
    for (let i = 0; i < 10; i++) {
      const x = 80 + i * 256 + hash(i, 3) * 80, base = 200, kind = i % 3;
      if (kind === 0) { const w = 150, h = 70; g.fillStyle = '#8a5a8a'; g.beginPath(); g.moveTo(x, base); g.lineTo(x, base - h); g.lineTo(x + w / 2, base - h - 40); g.lineTo(x + w, base - h); g.lineTo(x + w, base); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,230,190,.55)'; g.lineWidth = 2; for (let k = 1; k < 6; k++) { g.beginPath(); g.moveTo(x + k * w / 6, base); g.lineTo(x + k * w / 6, base - h - (k < 3 ? k : 6 - k) * 13); g.stroke(); }
        g.fillStyle = 'rgba(255,220,150,.5)'; for (let k = 0; k < 5; k++) g.fillRect(x + 8 + k * 28, base - h + 14, 20, 26); }
      else if (kind === 1) { g.fillStyle = '#7a4a72'; g.fillRect(x, base - 80, 110, 80); g.beginPath(); g.moveTo(x - 10, base - 80); g.lineTo(x + 55, base - 120); g.lineTo(x + 120, base - 80); g.closePath(); g.fill(); g.fillRect(x + 76, base - 150, 18, 50); g.fillStyle = 'rgba(255,220,150,.55)'; g.fillRect(x + 20, base - 60, 24, 22); g.fillRect(x + 62, base - 60, 24, 22); }
      else { g.fillStyle = '#7a4a72'; g.fillRect(x + 30, base - 150, 22, 150); g.fillRect(x, base - 64, 90, 64); g.beginPath(); g.ellipse(x + 41, base - 150, 34, 18, 0, PI, 0); g.fill(); }
    }
  });
  /* the ground in the other two worlds */
  SPR.groundSky = sprite(160, 220, g => {
    g.fillStyle = '#c9b6f2'; g.fillRect(0, 0, 160, 220);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 4; x++) if ((x + y) & 1) { g.fillStyle = '#b9a3e8'; g.fillRect(x * 40, 14 + y * 40, 40, 40); }
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(255,255,255,.35)'; circle(g, hash(i, 3) * 160, 30 + hash(i, 9) * 180, i % 3 ? 1.6 : 2.6); g.fill(); }
    g.fillStyle = PAL.ink; g.fillRect(0, 0, 160, 16); for (let x = 0; x <= 160; x += 20) { circle(g, x, 15, 12.5); g.fill(); }
    g.fillStyle = '#ffffff'; g.fillRect(0, 3, 160, 11); for (let x = 0; x <= 160; x += 20) { circle(g, x, 13, 10); g.fill(); }
    g.fillStyle = '#e8eeff'; for (let x = 10; x <= 160; x += 20) { g.beginPath(); g.ellipse(x, 18, 8, 3, 0, 0, TAU); g.fill(); }
  });
  SPR.groundWorks = sprite(160, 220, g => {
    g.fillStyle = '#9a5a46'; g.fillRect(0, 0, 160, 220);
    g.strokeStyle = 'rgba(60,25,20,.45)'; g.lineWidth = 2; for (let y = 18; y < 220; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(160, y); g.stroke(); for (let x = ((y - 18) / 20 & 1) ? 20 : 0; x < 160; x += 40) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 20); g.stroke(); } }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,210,170,.18)'; g.fillRect(hash(i, 2) * 150, 22 + hash(i, 5) * 190, 14, 6); }
    g.fillStyle = PAL.ink; g.fillRect(0, 0, 160, 16); g.fillStyle = '#7a8f5a'; g.fillRect(0, 3, 160, 10); g.fillStyle = '#a3b86e'; g.fillRect(0, 3, 160, 3);
    for (let x = 6; x < 160; x += 22) { g.fillStyle = PAL.ink; circle(g, x, 13, 5); g.fill(); g.fillStyle = '#8fb060'; circle(g, x, 12, 3.4); g.fill(); }
  });
  /* the canopy over a corridor: a leafy hedge band with a scalloped lower edge (160 wide, repeats) */
  SPR.canopy = sprite(160, 70, g => {
    g.fillStyle = '#2f8f4a'; g.fillRect(0, 0, 160, 44);
    g.fillStyle = PAL.ink; for (let x = 0; x <= 160; x += 20) { circle(g, x, 44, 12.5); g.fill(); }
    g.fillStyle = '#3f9a4a'; for (let x = 0; x <= 160; x += 20) { circle(g, x, 42, 10); g.fill(); }
    g.fillStyle = '#5cc85a'; for (let x = 10; x <= 160; x += 20) { g.beginPath(); g.ellipse(x - 3, 36, 6, 3, 0, 0, TAU); g.fill(); }
    for (let k = 0; k < 4; k++) leaf(g, 18 + k * 40 + hash(k, 1) * 10, 52, PI / 2 + (hash(k, 2) - .5), 13, ['#6fd06a', '#2f8f4a', '#d2f7c4'], 1.8);
    g.fillStyle = 'rgba(255,255,255,.18)'; for (let k = 0; k < 8; k++) { circle(g, 10 + k * 20, 12 + (k & 1) * 10, 4); g.fill(); }
  });
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
    for (let i = 0; i < 5; i++) { const x = 10 + i * 34;   /* round-topped pickets (never a row of points) */
      g.fillStyle = PAL.ink; g.beginPath(); g.moveTo(x - 1.5, 80); g.lineTo(x - 1.5, 16); g.arc(x + 9, 16, 10.5, PI, 0); g.lineTo(x + 19.5, 80); g.closePath(); g.fill();
      g.fillStyle = '#fff6e0'; g.beginPath(); g.moveTo(x + 1.5, 80); g.lineTo(x + 1.5, 16); g.arc(x + 9, 16, 7.5, PI, 0); g.lineTo(x + 16.5, 80); g.closePath(); g.fill(); g.fillStyle = '#e8dcc0'; g.fillRect(x + 11, 16, 5, 64); }
  });
  SPR.bush = sprite(120, 70, g => {
    const B = [[30, 46, 22], [60, 34, 28], [92, 46, 22], [60, 52, 20]];
    g.fillStyle = PAL.ink; for (const [x, y, r] of B) { circle(g, x, y, r + 3); g.fill(); } g.fillRect(8, 50, 104, 20);
    g.fillStyle = '#3f9a4a'; for (const [x, y, r] of B) { circle(g, x, y, r); g.fill(); } g.fillRect(11, 50, 98, 17);
    g.fillStyle = '#5cc85a'; for (const [x, y, r] of B) { circle(g, x - r * .1, y - r * .16, r * .84); g.fill(); }
    for (const [x, y, c] of [[40, 30, '#fff3a0'], [70, 22, '#ffd0e0'], [88, 40, '#ffffff'], [52, 50, '#ffd0e0']]) { g.fillStyle = PAL.ink; circle(g, x, y, 4.2); g.fill(); g.fillStyle = c; for (let p = 0; p < 5; p++) { const a = p * TAU / 5; circle(g, x + Math.cos(a) * 1.9, y + Math.sin(a) * 1.9, 1.6); g.fill(); } g.fillStyle = PAL.gold; circle(g, x, y, 1.2); g.fill(); }
  });
  /* a paper lantern (the works' sky scenery: round, warm, still) */
  SPR.lantern = sprite(70, 96, g => {
    g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(35, 0); g.lineTo(35, 14); g.stroke();
    g.fillStyle = 'rgba(255,200,120,.35)'; circle(g, 35, 52, 34); g.fill();
    g.fillStyle = PAL.ink; rrect(g, 24, 12, 22, 9, 3); g.fill(); rrect(g, 24, 82, 22, 9, 3); g.fill();
    g.beginPath(); g.ellipse(35, 52, 27, 32, 0, 0, TAU); g.fill(); g.fillStyle = '#ff9a5a'; g.beginPath(); g.ellipse(35, 52, 24, 29, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffc48a'; g.beginPath(); g.ellipse(31, 46, 13, 20, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(160,60,40,.45)'; g.lineWidth = 1.6; for (const k of [-.55, 0, .55]) { g.beginPath(); g.ellipse(35, 52, Math.abs(k) * 24 + 1, 29, 0, 0, TAU); g.stroke(); }
    g.fillStyle = '#ffd36b'; g.fillRect(27, 91, 2, 5); g.fillRect(34, 91, 2, 5); g.fillRect(41, 91, 2, 5);
  });
  DECO = { fence: SPR.fence, sunflower: SPR.sunflower, bush: SPR.bush, tree: SPR.tree, cloud: SPR.cloud[0], lantern: SPR.lantern, cog: SPR.lantern, chimney: SPR.chimney, balloon: SPR.balloon, kite: SPR.kite };
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
const LEAVES = [[-2.25, .78, -.18, 1], [-PI / 2, .9, 0, -.6], [-.9, .78, .18, 1]], BANDS = [.35, .55];   /* angle, length, stem x, wiggle; the bulb's two bands */
function runner(g, who, cx, cy, s, rot, o) {
  o = o || {}; const C = RUN[who & 1], u = s / 2, lw = Math.max(1.6, s * .075);
  g.save(); g.translate(cx, cy);
  if (o.flipY) g.scale(1, -1);   /* upside down (gravity up): mirrored, standing on the ceiling */
  if (o.sq) { g.scale(1 + o.sq * .18, 1 - o.sq * .18); }
  g.rotate(rot || 0);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  /* leaves (behind the bulb) */
  const lv = C.leaf, wig = o.wig || 0;
  for (let j = 0; j < 3; j++) {
    const LF = LEAVES[j], a = LF[0] + wig * LF[3], L = LF[1], sx = LF[2];
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
  g.strokeStyle = C.body[1]; g.globalAlpha *= .5; g.lineWidth = lw * .6; for (const y of BANDS) { g.beginPath(); g.moveTo(-.5 * u, y * u); g.quadraticCurveTo(0, (y + .1) * u, .5 * u, y * u); g.stroke(); } g.globalAlpha /= .5;
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
const UI = { snd: [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }], b1: null, b2: null, prev: null, next: null, pause: null, again: null, back: null, prac: null, auto: null, cpAdd: null, cpDel: null, resTitle: null, msgBtn: null };
/* the sky gradients: made once per drawing context (they are in logical units, so a new render scale keeps them) */
const SKYG = new Map();
const SKY_STOPS = { meadows: [[0, '#79cdf5'], [.55, '#bfe8ff'], [.85, '#fff1d0'], [1, '#ffe7b8']], skyway: [[0, '#9fb8ff'], [.5, '#d9c8ff'], [.85, '#ffd9ec'], [1, '#ffe9d6']],
  works: [[0, '#6b5aa8'], [.45, '#e48aa0'], [.8, '#ffc48a'], [1, '#ffe0a8']] };
function skyGrad(g, k, stops) { let m = SKYG.get(g); if (!m) SKYG.set(g, m = {}); if (!m[k]) { const gr = m[k] = g.createLinearGradient(0, 0, 0, H); for (const [o, c] of stops) gr.addColorStop(o, c); } return m[k]; }
function sky(g, cam, t, pulse) {
  g.fillStyle = skyGrad(g, 'meadows', SKY_STOPS.meadows); g.fillRect(0, 0, W, H);
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
  const hx = Math.round(((cam.x * BS * .15) % 2560 + 2560) % 2560 * R) / R, hy = GY - 200 + cam.y * BS * .15;   /* on a device pixel, the two copies overlapping by one: no seam */
  g.drawImage(SPR.hills, -hx, hy, 2560, 260); g.drawImage(SPR.hills, 2560 - hx - 1, hy, 2561, 260);
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
    else if (h < .62) { const c = SPR.fence; g.drawImage(c, sx - 38, gy - c.lh * .45 + 16, c.lw * .45, c.lh * .45); }   /* low: its tops stay under a 1-block crate's top */
    else if (h < .8) { const c = SPR.bush; g.drawImage(c, sx - 34, gy - c.lh * .56 + 3, c.lw * .56, c.lh * .56); }
  }
}
function ground(g, cam, wd) {
  const gy = GY + cam.y * BS; if (gy > H + 20) return;
  const off = ((cam.x * BS) % 160 + 160) % 160, T = wd === 'skyway' ? SPR.groundSky : wd === 'works' ? SPR.groundWorks : SPR.ground;
  for (let x = -off; x < W; x += 160) g.drawImage(T, x, gy - 3, 161, 220);   /* 1 px overlap: no seams */
  if (gy + 217 < H) { g.fillStyle = wd === 'skyway' ? '#b9a3e8' : wd === 'works' ? '#9a5a46' : '#a96b3f'; g.fillRect(0, gy + 217, W, H - gy - 217); }
}
/* ---------- the skyway: a pastel sky, a rainbow, cloud islands, balloons and kites ---------- */
function skySkyway(g, cam, t, pulse) {
  g.fillStyle = skyGrad(g, 'skyway', SKY_STOPS.skyway); g.fillRect(0, 0, W, H);
  /* a soft rainbow, far away (it hardly moves) */
  const rx = W * .62 - ((cam.x * BS * .02) % 600), ry = GY + 120 + cam.y * BS * .03;
  ['rgba(255,126,182,.32)', 'rgba(255,211,107,.32)', 'rgba(155,232,138,.32)', 'rgba(127,208,255,.32)', 'rgba(185,140,255,.32)'].forEach((c, k) => { g.strokeStyle = c; g.lineWidth = 16; g.beginPath(); g.arc(rx, ry, 520 - k * 16 + pulse * 3, PI * 1.08, PI * 1.92); g.stroke(); });
  for (let i = 0; i < 8; i++) {
    const span = 2400, x = ((hash(i, 1) * span - (cam.x * BS * .05 + t * 10 * (1 + (i % 3) * .3))) % span + span) % span - 300, y = 30 + hash(i, 2) * 220 + cam.y * BS * .05;
    const c = SPR.cloud[i % 3], k = .9 + hash(i, 4) * .6; g.drawImage(c, x, y, c.lw * k, c.lh * k);
  }
  const hx = Math.round(((cam.x * BS * .12) % 2560 + 2560) % 2560 * R) / R, hy = 120 + cam.y * BS * .12;
  g.save(); g.globalAlpha = .45; g.drawImage(SPR.isles, -hx, hy, 2560, 300); g.drawImage(SPR.isles, 2560 - hx - 1, hy, 2561, 300); g.restore();   /* far and faint: never a ledge to land on */
}
function midSkyway(g, cam, t, pulse, lv) {   /* lv: a level is in view (the title keeps its big, low balloons) */
  const P = .4, gy = GY + cam.y * BS * P - 18, x0 = cam.x * P, cell = 4;
  g.fillStyle = '#ffffff'; for (let x = -((x0 * BS) % 60) - 60; x < W + 60; x += 60) { circle(g, x, gy + 6, 34); g.fill(); }
  g.fillStyle = '#efe6ff'; g.fillRect(0, gy + 10, W, H - gy);
  const k0 = Math.floor(x0 / cell) - 2, k1 = k0 + Math.ceil(W / BS / cell) + 5;
  for (let k = k0; k <= k1; k++) {
    const h = hash(k, 31), sx = (k * cell + hash(k, 5) * 2 - x0) * BS;
    if (h < .22) { const c = SPR.balloon, s = lv ? .5 + hash(k, 6) * .1 : .7 + hash(k, 6) * .3, y = lv ? skyTop(cam, c.lh * s, hash(k, 7)) : gy - 260 - hash(k, 7) * 160; if (y != null) { const cl = lv && skyClip(g, sx - c.lw * s / 2, sx + c.lw * s / 2); g.drawImage(c, sx - c.lw * s / 2, y + Math.sin(t * .8 + k) * (lv ? 4 : 10), c.lw * s, c.lh * s); if (cl) g.restore(); } }
    else if (h < .36) { const c = SPR.kite, s = lv ? .5 : .7, y = lv ? skyTop(cam, c.lh * s, hash(k, 8)) : gy - 300 - hash(k, 8) * 120; if (y != null) { const cl = lv && skyClip(g, sx - c.lw * s / 2 - 8, sx + c.lw * s / 2 + 8); g.save(); g.translate(sx, y + Math.sin(t * 1.6 + k) * (lv ? 4 : 8)); g.rotate(Math.sin(t * 1.3 + k) * .12); g.drawImage(c, -c.lw * s / 2, 0, c.lw * s, c.lh * s); g.restore(); if (cl) g.restore(); } }
    else if (h < .62) { const c = SPR.bush, s = .5; g.drawImage(c, sx - 30, gy - c.lh * s + 12, c.lw * s, c.lh * s); }
  }
}
/* ---------- the works: an evening sky, sheds and greenhouses, water butts and flowerpots, chimneys puffing steam ---------- */
function skyWorks(g, cam, t, pulse) {
  g.fillStyle = skyGrad(g, 'works', SKY_STOPS.works); g.fillRect(0, 0, W, H);
  const sx = W - 260, sy = 250 + cam.y * BS * .05, sr = 70 + pulse * 4;
  g.fillStyle = 'rgba(255,220,150,.35)'; circle(g, sx, sy, sr + 26); g.fill(); g.fillStyle = PAL.ink; circle(g, sx, sy, sr + 3); g.fill(); g.fillStyle = '#ffb35a'; circle(g, sx, sy, sr); g.fill(); g.fillStyle = '#ffd08a'; circle(g, sx - 12, sy - 12, sr * .7); g.fill();
  for (let i = 0; i < 5; i++) { const span = 2400, x = ((hash(i, 1) * span - (cam.x * BS * .05 + t * 6)) % span + span) % span - 300, y = 60 + hash(i, 2) * 140; const c = SPR.cloud[i % 3]; g.globalAlpha = .55; g.drawImage(c, x, y, c.lw, c.lh); g.globalAlpha = 1; }
  const hx = Math.round(((cam.x * BS * .15) % 2560 + 2560) % 2560 * R) / R, hy = GY - 210 + cam.y * BS * .15;
  g.drawImage(SPR.sheds, -hx, hy, 2560, 260); g.drawImage(SPR.sheds, 2560 - hx - 1, hy, 2561, 260);
  g.fillStyle = '#9a6a8a'; g.fillRect(0, hy + 258, W, H);
}
const PUFF = []; for (let i = 0; i <= 20; i++) PUFF.push('rgba(255,248,240,' + (.025 * i).toFixed(3) + ')');   /* chimney steam: 21 alpha steps, made once */
function midWorks(g, cam, t, pulse, beat) {
  /* kept well back from the play layer (small, hazed): water butts and flowerpots, nothing toothed or turning by the thorns */
  const P = .45, gy = GY + cam.y * BS * P - 24, x0 = cam.x * P, cell = 3, Z = .62;
  g.fillStyle = '#b98a7a'; g.fillRect(0, gy - 4, W, H - gy + 4); g.strokeStyle = 'rgba(43,33,64,.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, gy - 4); g.lineTo(W, gy - 4); g.stroke();
  const k0 = Math.floor(x0 / cell) - 2, k1 = k0 + Math.ceil(W / BS / cell) + 5;
  for (let k = k0; k <= k1; k++) {
    const h = hash(k, 53), sx = (k * cell + hash(k, 5) * 1.5 - x0) * BS;
    if (h < .22) { const c = h < .11 ? SPR.butt : SPR.pots, s = (.6 + hash(k, 6) * .15) * Z; g.drawImage(c, sx - c.lw * s / 2, gy - c.lh * s + 2, c.lw * s, c.lh * s); }
    else if (h < .38) { const c = SPR.chimney, s = (.6 + hash(k, 8) * .3) * Z; g.drawImage(c, sx - c.lw * s / 2, gy - c.lh * s + 6, c.lw * s, c.lh * s);
      for (let p = 0; p < 4; p++) { const a = ((t * .5 + p / 4 + hash(k, p)) % 1), px = sx + a * 30 + Math.sin(a * 6 + k) * 5, py = gy - c.lh * s - a * 100; g.fillStyle = PUFF[Math.round((1 - a) * 20)]; circle(g, px, py, 6 + a * 15); g.fill(); } }
    else if (h < .5) { const c = SPR.sunflower, s = .6 * Z; g.drawImage(c, sx - c.lw * s / 2, gy - c.lh * s + 2, c.lw * s, c.lh * s); }
    else if (h < .7) g.drawImage(SPR.wall, sx - 34, gy - 20, 68, 20);   /* a low brick wall (not a planter: nothing back here looks like something to land on) */
  }
}
/* a level's own scenery (deco): well behind the play layer (parallax BEAT.DECO_P = 0.5, smaller, faded, then hazed with the mid
   layer), standing on the mid layer's hedge line, or high in the sky (skyTop), never up in the HUD strip; nothing turns, nothing
   reads as a thorn or a ledge */
let DECO = null, TOPY = 78;   /* TOPY: the HUD strip's bottom in this view's rows (view()) */
const SKYK = { balloon: 1, kite: 1, cloud: 1, lantern: 1, cog: 1 };
/* where sky scenery (balloons, kites, clouds, lanterns: level deco and the skyway's mid layer) hangs: above the tallest corridor's
   canopy (9.5 blocks up: behind its leafy roof, never inside a corridor or down in the hop and ring band) and under the HUD
   strip; k 0..1 = how high. A trimmed split view has no sky left for it: null (not drawn) */
function skyTop(cam, h, k) {
  const B = GY - 9.5 * BS + cam.y * BS * .45, y = Math.max(TOPY, B - clamp01(k) * 40 - h);
  return y + h > B + 6 ? null : y;
}
/* the canopies' roofs are see-through (the sky shows through them): sky scenery is clipped out of their columns, so no balloon or
   kite hangs inside a hedge like a ghost; it goes behind the roof's edge as the canopy comes by */
let CUTV = 0; const CANS = [];
function canSpans(L, cam) {
  CANS.length = 0; if (!L || !L.zones) return;
  for (const z of L.zones) { const x0 = (z[0] - cam.x) * BS, x1 = (z[1] - cam.x) * BS, y = GY - (z[2] - cam.y) * BS; if (x1 < -60 || x0 > W + 60 || y < -80) continue; CANS.push([x0, x1]); }
  CANS.sort((a, b) => a[0] - b[0]);
}
/* clip to the sky outside the canopies' columns (true), or nothing to clip (false: nothing saved) */
function skyClip(g, a, b) {
  if (!CANS.length) return false;
  let hit = false; for (const c of CANS) if (c[1] > a && c[0] < b) hit = true;
  if (!hit) return false;
  g.save(); g.beginPath(); let x = -100;
  for (const c of CANS) { if (c[0] > x) g.rect(x, -100, c[0] - x, H + 200); x = Math.max(x, c[1]); }
  if (x < W + 100) g.rect(x, -100, W + 100 - x, H + 200);
  g.clip(); return true;
}
function decoLayer(g, L, cam, t, pulse) {
  const D = L && L.level && L.level.deco; if (!D || !D.length) return;
  const P = BEAT.DECO_P || .5, line = GY + cam.y * BS * .45 - 22;
  g.save(); g.globalAlpha = .62;
  for (const d of D) {
    const sx = (d[1] - cam.x * P) * BS; if (sx < -200 || sx > W + 200) continue;
    const c = DECO[d[0]]; if (!c) continue;
    const sky = SKYK[d[0]], s = sky ? .5 : .62;
    let y;
    if (sky) { y = skyTop(cam, c.lh * s, (d[2] - 5) / 6); if (y == null) continue; y += Math.sin(t * 1.2 + d[1]) * 4; }   /* the designer's height (5 - 11 blocks) picks the place in that band */
    else { y = line - d[2] * BS * P * 1.6 - c.lh * s; if (y < TOPY) y = TOPY; }
    const cl = sky && skyClip(g, sx - c.lw * s / 2, sx + c.lw * s / 2);
    g.drawImage(c, sx - c.lw * s / 2, y, c.lw * s, c.lh * s);
    if (cl) g.restore();
  }
  g.restore();
}
const HAZE = { meadows: 'rgba(214,236,255,.34)', skyway: 'rgba(240,232,255,.3)', works: 'rgba(255,214,196,.36)' };
/* the objects in view */
function objects(g, L, cam, t, pulse, used) {
  const x0 = cam.x - 2, x1 = cam.x + W / BS + 2, O = L.O;
  let i = lowerBound(O, x0 - 30);
  const sx = x => (x - cam.x) * BS, sy = y => GY - (y - cam.y) * BS;
  for (; i < O.length; i++) {
    const o = O[i]; if (o.x > x1) break; if (o.x + o.w < x0) continue;
    const X = sx(o.x), Y = sy(o.y);
    if (o.k === 's') {
      if (o.t === 'crate') {   /* whole tiles; a part-block width or height ends in a narrower (or shorter) crate, so the art is the hit box */
        for (let a = 0; a < o.w - .01; a++) { const cw = Math.min(1, o.w - a); if (cw < .05) continue;
          for (let b = 0; b < o.h - .01; b++) { const ch = Math.min(1, o.h - b); if (ch < .05) continue; g.drawImage(SPR.crate, X + a * BS - 2, Y - (b + ch) * BS - 2, cw * BS + 4, ch * BS + 4); } } }
      else if (o.t === 'planter') planter(g, X, Y, o.w, o.h, t, pulse);
      else plank(g, X, Y, o.w);
    } else if (o.k === 't') {
      const c = o.t === 'thorn' ? SPR.thorn : SPR.thornS;
      if (o.down) { g.save(); g.translate(X + 20, Y - 20); g.scale(1, -1); g.drawImage(c, -24, -24 - 2, 48, 48); g.restore(); }
      else g.drawImage(c, X - 4, Y - 46, 48, 48);
    } else if (o.k === 'p') {
      const c = SPR[o.t] || SPR.capY, u = used && used.pad === o.i ? clamp01(1 - used.padAge / .3) : 0, sq = 1 - u * .35 + pulse * .04;
      g.save(); if (o.down) { g.translate(0, 2 * Y - 16); g.scale(1, -1); }   /* hanging from a ceiling: mirrored about the cap's middle */
      g.fillStyle = (o.t === 'capB' ? 'rgba(90,180,255,' : o.t === 'capP' ? 'rgba(255,126,182,' : 'rgba(255,217,59,') + (.18 + pulse * .3).toFixed(3) + ')'; g.beginPath(); g.ellipse(X + 20, Y - 8, 30, 14, 0, 0, TAU); g.fill();
      g.drawImage(c, X - 4, Y - 26 * sq, 48, 28 * sq); g.restore();
    } else if (o.k === 'r') {
      const c = SPR[o.t] || SPR.ringY, u = used && used.ring === o.i ? clamp01(used.ringAge / .35) : 0;
      const s = (1 + pulse * .1) * (1 + u * .5), cx = X + 20, cy = Y - 20;
      g.save(); g.globalAlpha = 1 - u * .85; g.translate(cx, cy); g.rotate(Math.sin(t * 1.3 + o.x) * .1); g.drawImage(c, -40 * s, -40 * s, 80 * s, 80 * s); g.restore();
    }
  }
  /* the finish: a flower arch */
  const fx = sx(L.len); if (fx > -200 && fx < W + 200) finishArch(g, fx, sy(0), t, pulse);
}
/* portals: GARDEN GATES, never a coloured ring. A MODE gate is a flower arch on two posts (opening a corridor: a doorway up to
   its canopy) with a round sign hanging in it: a little beet (HOP), a spinner seed (GLIDE), a seed pod with its flip arrows (FLIP),
   its word over the arch. A GRAVITY gate is a bamboo trellis from the floor to the ceiling with arrow signs low and high (up: sky
   blue, down: deep blue). A SPEED gate is a pinwheel on a post: warmer and spinning faster the faster it makes you, with 1 - 4
   knots on its ribbon. Each stands on a soft glow on the ground; the runner takes it as its centre passes the post line. */
const PCOL = { hop: ['#5cc85a', '#ff7eb6', '#e2ffd8'], glide: ['#5ab8f0', '#ffffff', '#e0f6ff'], flip: ['#a77ae0', '#ffd93b', '#efe4ff'], gup: ['#36c3ff', '#bff0ff', '#e6f9ff'], gdown: ['#4a5ee0', '#c9cfff', '#e8eaff'],
  s0: ['#5cc88a', '#fff6e0'], s1: ['#ffc21a', '#fff6e0'], s2: ['#ff8a3d', '#fff6e0'], s3: ['#ff4f74', '#fff6e0'] };
const PWORD = { hop: 'HOP', glide: 'GLIDE', flip: 'FLIP' };
function zoneAt(L, x) { for (const z of L.zones) if (x >= z[0] - 1e-6 && x < z[1]) return z; return null; }
function post(g, x, y0, y1, w, col, light) { g.fillStyle = PAL.ink; rrect(g, x - w / 2 - 3, y1 - 3, w + 6, y0 - y1 + 6, (w + 6) / 2); g.fill(); g.fillStyle = col; rrect(g, x - w / 2, y1, w, y0 - y1 + 2, w / 2); g.fill(); g.fillStyle = light; g.fillRect(x - w / 2 + 2, y1 + 4, 2.5, Math.max(0, y0 - y1 - 8)); }
function bloom(g, x, y, r, col, t, k) { g.fillStyle = PAL.ink; circle(g, x, y, r + 2.4); g.fill(); g.fillStyle = col; for (let q = 0; q < 5; q++) { const b = q * TAU / 5 + t * .8 + k; circle(g, x + Math.cos(b) * r * .5, y + Math.sin(b) * r * .5, r * .5); g.fill(); } g.fillStyle = PAL.gold; circle(g, x, y, r * .32); g.fill(); }
/* the arrow on a gravity sign (a path, not a glyph) */
function arrow(g, x, y, up, s) { const d = up ? -1 : 1; g.beginPath(); g.moveTo(x, y + d * s); g.lineTo(x + s * .9, y); g.lineTo(x + s * .36, y); g.lineTo(x + s * .36, y - d * s * .9); g.lineTo(x - s * .36, y - d * s * .9); g.lineTo(x - s * .36, y); g.lineTo(x - s * .9, y); g.closePath(); }
function gravSign(g, X, y, up, c) { g.fillStyle = PAL.ink; rrect(g, X - 25, y - 25, 50, 50, 14); g.fill(); g.fillStyle = c[0]; rrect(g, X - 21.5, y - 21.5, 43, 43, 11); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; rrect(g, X - 17, y - 19, 34, 7, 3.5); g.fill();
  arrow(g, X, y + (up ? 2 : -2), up, 15); g.lineWidth = 5; g.strokeStyle = PAL.ink; g.lineJoin = 'round'; g.stroke(); g.fillStyle = '#fff'; g.fill(); }
function portals(g, L, cam, t, pulse) {
  const sx = x => (x - cam.x) * BS, sy = y => GY - (y - cam.y) * BS;
  for (const p of L.P) {
    const X = sx(p.x); if (X < -120 || X > W + 120) continue;
    const c = PCOL[p.kind] || PCOL.hop, z = zoneAt(L, p.x), fl = sy(0);
    g.fillStyle = c[0] + '50'; g.beginPath(); g.ellipse(X, fl, 44 + pulse * 6, 8, 0, 0, TAU); g.fill();   /* a soft glow where it stands */
    if (p.pk === 'm') {
      const base = sy(p.y), door = z && Math.abs(z[0] - p.x) < 1e-6 && z[2] <= 12, ay = door ? sy(z[2]) + 34 : base - 108, hw = 30;
      post(g, X - hw, base, ay, 13, '#6fbf5a', '#a6eb8f'); post(g, X + hw, base, ay, 13, '#6fbf5a', '#a6eb8f');
      g.lineCap = 'butt'; g.strokeStyle = PAL.ink; g.lineWidth = 20; g.beginPath(); g.arc(X, ay, hw, PI, 0); g.stroke(); g.strokeStyle = c[0]; g.lineWidth = 13; g.stroke(); g.lineCap = 'round';
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3; g.beginPath(); g.arc(X, ay, hw + 2, PI * 1.1, PI * 1.45); g.stroke();
      for (let i = 0; i <= 6; i++) { const a = PI + i / 6 * PI; bloom(g, X + Math.cos(a) * hw, ay + Math.sin(a) * hw, 6.5 + (i & 1) * 1.5 + pulse * 1.5, i & 1 ? c[1] : '#fff', t, i); }
      SIGNS.push({ m: 1, X, ay, door, kind: p.kind, c, px: p.x, hw });   /* its sign: drawn after the objects (never hidden by a crate) */
    } else if (p.pk === 'g') {
      const up = p.kind === 'gup', top = z && z[2] <= 12 ? sy(z[2]) + 8 : fl - 150, hw = 24;
      g.save(); g.beginPath(); g.rect(X - hw, top, hw * 2, fl - top); g.clip();   /* the trellis: a criss-cross between the canes */
      g.strokeStyle = c[0] + 'aa'; g.lineWidth = 3.4; g.beginPath(); for (let y = fl + 48; y > top - 48; y -= 24) { g.moveTo(X - hw, y); g.lineTo(X + hw, y - 48); g.moveTo(X + hw, y); g.lineTo(X - hw, y - 48); } g.stroke();
      g.fillStyle = c[0] + '22'; g.fillRect(X - hw, top, hw * 2, fl - top); g.restore();
      post(g, X - hw, fl, top, 8, '#d9b36a', '#f3dca0'); post(g, X + hw, fl, top, 8, '#d9b36a', '#f3dca0');
      bloom(g, X - hw, top + 2, 7, c[1], t, 1); bloom(g, X + hw, top + 2, 7, '#fff', t, 2);
      SIGNS.push({ g: 1, X, fl, top, up, c });
    } else {
      const k = +p.kind[1], base = sy(p.y), top = base - 128, spin = t * (2.2 + k * 2.6), r = 25 + k;
      post(g, X, base, top, 9, '#d9b36a', '#f3dca0');
      /* the ribbon with 1 - 4 knots */
      g.strokeStyle = PAL.ink; g.lineWidth = 6; g.beginPath(); g.moveTo(X + 4, top + 16); g.quadraticCurveTo(X + 16 + Math.sin(t * 5) * 4, top + 44, X + 10, top + 74); g.stroke(); g.strokeStyle = c[0]; g.lineWidth = 3; g.stroke();
      for (let q = 0; q <= k; q++) { const u = (q + 1) / (k + 2), qx = X + 4 + (12 + Math.sin(t * 5) * 2) * Math.sin(u * PI) * .9 + u * 6, qy = top + 16 + u * 58; g.fillStyle = PAL.ink; circle(g, qx, qy, 5); g.fill(); g.fillStyle = '#fff6e0'; circle(g, qx, qy, 3.2); g.fill(); }
      /* the pinwheel */
      g.save(); g.translate(X, top); g.rotate(spin);
      for (let b = 0; b < 4; b++) { g.rotate(PI / 2); g.beginPath(); g.moveTo(0, 0); g.lineTo(r, -r * .1); g.quadraticCurveTo(r * .9, -r * .75, r * .2, -r * .95); g.closePath(); g.lineWidth = 3.2; g.strokeStyle = PAL.ink; g.stroke(); g.fillStyle = b & 1 ? c[0] : '#fff6e0'; g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(r * .2, -r * .1); g.lineTo(r * .6, -r * .15); g.lineTo(r * .35, -r * .5); g.closePath(); g.fill(); }
      g.restore(); g.fillStyle = PAL.ink; circle(g, X, top, 6); g.fill(); g.fillStyle = PAL.sun; circle(g, X, top, 3.8); g.fill();
    }
  }
}
/* the gates' signs (after the objects, so a crate column never hides one): a mode gate's round sign and word, a gravity gate's arrows */
const SIGNS = [];
function portalSigns(g, t, pulse) {
  for (const S of SIGNS) {
    const { X, c } = S;
    if (S.g) { gravSign(g, X, S.fl - 62 - pulse * 2, S.up, c); if (S.fl - S.top > 200) gravSign(g, X, S.top + 62 + pulse * 2, S.up, c); continue; }   /* low, where the runner is (and high, in a corridor) */
    const { ay, door, hw } = S;
    const syn = ay + (door ? 46 : 36), sw = Math.sin(t * 2 + S.px) * .06;
    g.save(); g.translate(X, ay - 4); g.rotate(sw); g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(-8, 0); g.lineTo(-6, syn - ay - 16); g.moveTo(8, 0); g.lineTo(6, syn - ay - 16); g.stroke();
    g.translate(0, syn - ay + 4); g.fillStyle = PAL.ink; circle(g, 0, 0, 23); g.fill(); g.fillStyle = c[2]; circle(g, 0, 0, 19.5); g.fill(); g.strokeStyle = c[0]; g.lineWidth = 3; circle(g, 0, 0, 16.5); g.stroke();
    if (S.kind === 'hop') runner(g, 0, 0, 1, 24, 0, { mood: 'happy' });
    else if (S.kind === 'glide') { for (const d of [-1, 1]) { g.save(); g.scale(d, 1); g.beginPath(); g.moveTo(2, 3); g.quadraticCurveTo(9, -9, 17, -5); g.quadraticCurveTo(11, 3, 2, 6); g.closePath(); g.lineWidth = 2.4; g.strokeStyle = PAL.ink; g.stroke(); g.fillStyle = '#e9e2a8'; g.fill(); g.restore(); } g.fillStyle = PAL.ink; circle(g, 0, 5, 5.5); g.fill(); g.fillStyle = '#b5653a'; circle(g, 0, 5, 3.6); g.fill(); }
    else { g.fillStyle = PAL.ink; circle(g, 0, 0, 11); g.fill(); g.fillStyle = '#5cb85a'; circle(g, 0, 0, 8.6); g.fill(); g.strokeStyle = '#3f9a3a'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, 4, 8.6, 0, 0, TAU); g.stroke();
      for (const up of [true, false]) { arrow(g, up ? -14 : 14, up ? -6 : 6, up, 6); g.lineWidth = 2.6; g.strokeStyle = PAL.ink; g.stroke(); g.fillStyle = '#fff'; g.fill(); } }
    g.restore();
    text(g, PWORD[S.kind] || '', X, door ? syn + 44 : ay - hw - 26, 20, '#fff');   /* over the arch; in a doorway (high up) under its sign */
  }
  SIGNS.length = 0;
}
/* corridors: a leafy hedge canopy hanging over the stretch between two mode portals */
const CANG = new Map();   /* the canopies' roof gradient per context and canopy row (made once, not every frame) */
function canGrad(g, y) { let m = CANG.get(g); if (!m || m.size > 48) CANG.set(g, m = new Map()); let gr = m.get(y); if (!gr) { gr = g.createLinearGradient(0, y - 120, 0, -10); gr.addColorStop(0, 'rgba(63,154,74,.62)'); gr.addColorStop(1, 'rgba(63,154,74,.3)'); m.set(y, gr); } return gr; }
function canopies(g, L, cam, t, pulse) {
  for (const z of L.zones) {
    const x0 = (z[0] - cam.x) * BS, x1 = (z[1] - cam.x) * BS; if (x1 < -40 || x0 > W + 40) continue;
    const y = GY - (z[2] - cam.y) * BS; if (y < -80) continue;
    const a = Math.max(-40, x0), b = Math.min(W + 40, x1);
    /* above the hedge: a light leafy roof (the sky shows through), hanging vines swaying on the beat */
    g.fillStyle = canGrad(g, Math.round(y)); g.fillRect(a, -10, b - a, y - 36 + 10);
    g.save(); g.beginPath(); g.rect(a, -10, b - a, y + 40); g.clip();
    const off = ((cam.x * BS) % 160 + 160) % 160;
    g.strokeStyle = 'rgba(47,143,74,.55)'; g.lineWidth = 3;
    for (let x = -off; x < W + 160; x += 40) { const k = Math.round((x + off + cam.x * BS) / 40); g.beginPath(); g.moveTo(x + 10, -10); g.quadraticCurveTo(x + 10 + Math.sin(t * 1.5 + k) * 8 + pulse * 3, (y - 40) / 2, x + 14, y - 40); g.stroke(); }
    for (let x = -off; x < W; x += 160) if (x + 160 > a && x < b) g.drawImage(SPR.canopy, x, y - 44, 161, 70);
    g.restore();
    for (const e of [x0, x1]) if (e > -60 && e < W + 60) { g.fillStyle = PAL.ink; circle(g, e, y - 18, 24); g.fill(); g.fillStyle = '#3f9a4a'; circle(g, e, y - 18, 20); g.fill(); g.fillStyle = '#5cc85a'; circle(g, e - 5, y - 23, 9); g.fill(); }
  }
}
/* golden seeds: bobbing and twinkling; one you have found before is a pale outline; one you got this run is gone */
function seeds(g, L, cam, t, pulse, got, old) {
  for (const s of L.seeds) {
    if (got >> s.k & 1) continue;
    const X = (s.x - cam.x) * BS, Y = GY - (s.y - cam.y) * BS + Math.sin(t * 3 + s.k) * 4; if (X < -60 || X > W + 60) continue;
    const before = old >> s.k & 1, fade = CUTV ? clamp((Y - CUTV - 40) / 24, 0, 1) : 1;   /* a trimmed split view: a seed up in its slim HUD strip fades out, gone before it touches the bar (two players: only a sparkle) */
    if (fade <= 0) continue;
    g.save(); g.globalAlpha = (before ? .45 : 1) * fade;
    if (!before) { const gl = g.createRadialGradient(X, Y, 4, X, Y, 34 + pulse * 6); gl.addColorStop(0, 'rgba(255,230,120,.75)'); gl.addColorStop(1, 'rgba(255,230,120,0)'); g.fillStyle = gl; circle(g, X, Y, 34 + pulse * 6); g.fill(); }
    g.translate(X, Y); g.rotate(Math.sin(t * 2 + s.k) * .2); g.drawImage(SPR.seed, -22, -22, 44, 44); g.rotate(-Math.sin(t * 2 + s.k) * .2);
    if (!before) for (let i = 0; i < 3; i++) { const a = t * 2 + i * TAU / 3; g.fillStyle = '#fff'; STAR(g, Math.cos(a) * 26, Math.sin(a) * 22, 5, 1.8, 4, a); g.fill(); }
    g.restore();
  }
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
  const wd = o.world === 'skyway' || o.world === 'works' ? o.world : 'meadows', L = sim ? sim.L : o.L;
  TOPY = o.cut ? o.cut + 40 : 78;   /* under the HUD strip (a trimmed split view: its slim HUD) */
  CUTV = o.cut || 0; canSpans(L, cam);
  if (wd === 'skyway') { skySkyway(g, cam, t, pulse); midSkyway(g, cam, t, pulse, !!L); }
  else if (wd === 'works') { skyWorks(g, cam, t, pulse); midWorks(g, cam, t, pulse, o.beat); }
  else { sky(g, cam, t, pulse); midLayer(g, cam, t, pulse); }
  if (L) decoLayer(g, L, cam, t, pulse);
  g.fillStyle = HAZE[wd]; g.fillRect(0, 0, W, H);   /* a little air between the scenery (mid layer and deco) and the play layer */
  ground(g, cam, wd);
  if (L) canopies(g, L, cam, t, pulse);
  if (o.words) for (const w of o.words) { const X = (w.x - cam.x) * BS, Y = GY - (w.y - cam.y) * BS; if (X > -400 && X < W + 400) text(g, w.s, X, Y, w.z || 34, w.c || '#fff'); }
  if (L) { SIGNS.length = 0; portals(g, L, cam, t, pulse); objects(g, L, cam, t, pulse, o.used); portalSigns(g, t, pulse); seeds(g, L, cam, t, pulse, o.got | 0, o.old | 0); }
  if (o.fxUnder) o.fxUnder();
  /* the other runner (a ghost) is always drawn UNDER yours. Right on top of yours (a near tie) it is fainter and nudged back a
     little, and its name is left off (it would sit on your runner): o.neck = its name, for the HUD to say "neck and neck" */
  const over = gh => !!o.runners && o.runners.some(r => !r.hide && Math.abs(r.x - gh.x) < 1.1 && Math.abs(r.y - gh.y) < 1.1);
  o.neck = '';
  if (o.ghosts) for (const gh of o.ghosts) { if (gh.hide) continue; if (over(gh)) { o.neck = gh.name || 'them'; drawRunner(g, Object.assign({}, gh, { name: '', nudge: 1, alpha: (gh.alpha == null ? 1 : gh.alpha) * .78 }), cam, t, true); } else drawRunner(g, gh, cam, t, true); }
  if (o.runners) for (const r of o.runners) drawRunner(g, r, cam, t, false);
  if (o.fxOver) o.fxOver();
}
function drawRunner(g, r, cam, t, ghost) {
  if (!r || r.hide) return;
  const X = (r.x - cam.x) * BS - (r.nudge ? 7 : 0), Y = GY - (r.y + .5 - cam.y) * BS + (r.nudge ? 3 : 0);
  if (X < -60 || X > W + 60 || Y < -80 || Y > H + 80) { if (ghost && r.name && Y < -40) text(g, '▲ ' + r.name, clamp(X, 40, W - 40), 22, 16, RUN[r.who & 1].txt); return; }
  const fa = ghost && r.alpha != null ? r.alpha : 1;   /* a ghost's own alpha (fading, blinking before a respawn) */
  g.save(); if (ghost) { g.globalAlpha = .45 * fa; r = Object.assign({}, r, { alpha: null }); }
  const sq = r.sq || 0, up = r.grav < 0;
  if (!ghost && r.ground && r.mode !== 'glide') { g.fillStyle = 'rgba(43,33,64,.18)'; g.beginPath(); g.ellipse(X, up ? Y - 21 : Y + 21, 17, 4, 0, 0, TAU); g.fill(); }
  if (r.mode === 'glide') spinner(g, r.who, X, Y, r.rot, t, up, r);
  else if (r.mode === 'flip') pod(g, r.who, X, Y, r.rot, t, up, r);
  else runner(g, r.who, X, Y + (up ? -sq * 3 : sq * 3), 46, up ? -r.rot : r.rot, { sq, flipY: up, mood: r.mood, mouth: r.mouth, wig: Math.sin(t * 9) * .08, alpha: r.alpha });
  g.restore();
  if (r.name) { g.save(); g.globalAlpha = Math.max(.3, fa); text(g, r.name, X, Y - 40, r.nameZ || 15, RUN[r.who & 1].txt); g.restore(); }
}

/* GLIDE: the beetroot riding a sycamore-seed spinner (two veined wings whirling on a seed nub), tilted with the climb */
function spinner(g, who, X, Y, rot, t, up, o) {
  g.save(); g.translate(X, Y); if (up) g.scale(1, -1); g.rotate(rot || 0); if (o.alpha != null) g.globalAlpha *= o.alpha;
  const spin = t * 26, wings = [0, 1].map(k => { const a = spin + k * PI; return { c: Math.cos(a), z: Math.sin(a) }; });
  const wing = w => { const L = 40 * (Math.abs(w.c) < .32 ? (w.c < 0 ? -.32 : .32) : w.c); g.save(); g.translate(0, 14);   /* never quite edge-on */
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * .5, -13, L, -4); g.quadraticCurveTo(L * .55, 6, 0, 3); g.closePath();
    g.lineWidth = 3; g.strokeStyle = PAL.ink; g.stroke(); g.fillStyle = w.z > 0 ? '#e9e2a8' : '#cfc68a'; g.fill();
    g.strokeStyle = 'rgba(140,120,60,.6)'; g.lineWidth = 1.2; for (const k of [.35, .6, .85]) { g.beginPath(); g.moveTo(L * .1, 0); g.quadraticCurveTo(L * k * .6, -8, L * k, -4 + k * 2); g.stroke(); }
    g.restore(); };
  for (const w of wings) if (w.z < 0) wing(w);
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(0, 15, 10, 7.5, 0, 0, TAU); g.fill(); g.fillStyle = '#b5653a'; g.beginPath(); g.ellipse(0, 14.5, 7.6, 5.4, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(-3, 12.5, 3, 1.5, 0, 0, TAU); g.fill();
  runner(g, who, 0, -6, 38, 0, { mood: 'happy', wig: Math.sin(t * 9) * .12 });
  for (const w of wings) if (w.z >= 0) wing(w);
  g.restore();
}
/* FLIP: the beetroot curled up in a rolling seed pod; the striped shell rolls, the face in its window stays the right way up */
function pod(g, who, X, Y, rot, t, up, o) {
  const C = RUN[who & 1];
  g.save(); g.translate(X, Y); if (o.alpha != null) g.globalAlpha *= o.alpha;
  g.save(); g.rotate(rot || 0);
  g.fillStyle = PAL.ink; circle(g, 0, 0, 24.5); g.fill(); g.fillStyle = '#5cb85a'; circle(g, 0, 0, 21.5); g.fill();
  g.save(); circle(g, 0, 0, 21.5); g.clip(); g.strokeStyle = '#3f9a3a'; g.lineWidth = 4; for (const k of [-1, 0, 1]) { g.beginPath(); g.ellipse(0, 0, 8 + Math.abs(k) * 7, 22, 0, 0, TAU); g.stroke(); } g.restore();
  for (let k = 0; k < 4; k++) { const a = k * PI / 2 + .4; g.fillStyle = PAL.ink; circle(g, Math.cos(a) * 21, Math.sin(a) * 21, 4); g.fill(); g.fillStyle = '#9be88a'; circle(g, Math.cos(a) * 21, Math.sin(a) * 21, 2.4); g.fill(); }
  g.restore();
  if (up) g.scale(1, -1);
  g.fillStyle = PAL.ink; circle(g, 0, 0, 14.5); g.fill(); g.fillStyle = C.body[0]; circle(g, 0, 0, 12); g.fill(); g.fillStyle = C.body[2]; g.beginPath(); g.ellipse(-4, -6, 4, 2, -.5, 0, TAU); g.fill();
  eye(g, -4.5, -1, 6.5, .6, 0, 'open'); eye(g, 4.5, -1, 6.5, .6, 0, 'open');
  g.strokeStyle = PAL.ink; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 4, 3, .2 * PI, .8 * PI); g.stroke();
  leaf(g, -2, -13, -PI / 2 - .5 + Math.sin(t * 9) * .1, 12, C.leaf, 1.6); leaf(g, 2, -13, -PI / 2 + .5 - Math.sin(t * 9) * .1, 12, C.leaf, 1.6);
  g.restore();
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
/* the bar's fill: made once per drawing context and bar shape (a gradient in logical units, like the sky's) */
const BARG = new Map();
function barGrad(g, by, bh) { let m = BARG.get(g); if (!m) BARG.set(g, m = {}); const k = by + '|' + bh; if (!m[k]) { const gr = m[k] = g.createLinearGradient(0, by, 0, by + bh); gr.addColorStop(0, '#8fe07a'); gr.addColorStop(1, '#3fae4f'); } return m[k]; }
function hud(g, o) {
  /* the progress bar, top centre: own fill, everyone's markers. o.slim (a trimmed split-screen view): one line about 32 px tall,
     the markers on the bar, the 'neck and neck' tag after the %, so a 9-high corridor's canopy and all under it stay clear */
  const sl = !!o.slim, bw = sl && W < 1000 ? 340 : 440, bx = (W - bw) / 2, by = sl ? 10 : 18, bh = sl ? 14 : 22, pct = clamp(o.pct || 0, 0, 100);
  g.fillStyle = PAL.ink; rrect(g, bx - 4, by - 4, bw + 8, bh + 8, sl ? 11 : 15); g.fill();
  g.fillStyle = 'rgba(255,246,224,.9)'; rrect(g, bx, by, bw, bh, bh / 2); g.fill();
  if (pct > 0) { g.save(); rrect(g, bx, by, bw, bh, bh / 2); g.clip(); g.fillStyle = barGrad(g, by, bh); g.fillRect(bx, by, bw * pct / 100, bh); g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(bx, by + 3, bw * pct / 100, sl ? 3 : 5); g.restore(); }
  if (o.best > 0 && o.best < 100) { const x = bx + bw * o.best / 100; g.fillStyle = PAL.ink; g.fillRect(x - 1.5, by - 2, 3, bh + 4); }
  const my = sl ? by + bh / 2 : by + bh + 9, mr = sl ? 7.5 : 8;
  if (o.marks) for (const m of o.marks) { const x = bx + bw * clamp(m.pct, 0, 100) / 100; g.fillStyle = PAL.ink; circle(g, x, my, mr); g.fill(); g.fillStyle = RUN[m.who & 1].bar; circle(g, x, my, mr - 2.4); g.fill(); }
  if (sl) text(g, Math.floor(pct) + '%', bx + bw + 14, by + bh / 2, 20, '#fff', 'left'); else text(g, Math.floor(pct) + '%', bx + bw + 46, by + bh / 2, 24, '#fff');   /* slim: left-aligned, clear of the bar's end marker at 100% */
  if (o.left) text(g, o.left, bx - 16, by + bh / 2, sl ? 17 : 18, o.leftC || '#fff', 'right');
  if (o.sub) { if (sl) text(g, o.sub, bx + bw + 72, by + bh / 2, 15, '#fff', 'left'); else text(g, o.sub, W / 2, by + bh + (o.marks ? 34 : 24), 16, '#fff'); }
  /* golden seeds (solo): three slots left of the bar: found this run (gold), found before (pale), got in practice (pale, in a
     lilac ring: not kept), not yet (a dashed outline over an ink one, so it shows on a light sky) */
  if (o.seeds) for (let k = 0; k < 3; k++) { const x = bx - 30 - (2 - k) * 30, y = by + bh / 2, st = o.seeds[k];
    if (st === 3) { g.strokeStyle = PAL.ink; g.lineWidth = 5; circle(g, x, y, 14); g.stroke(); g.strokeStyle = '#d6c2ff'; g.lineWidth = 2.6; g.stroke(); }
    if (st) { g.save(); g.globalAlpha = st === 2 ? 1 : st === 3 ? .6 : .4; g.drawImage(SPR.seed, x - 13, y - 13, 26, 26); g.restore(); }
    else { g.beginPath(); g.ellipse(x, y, 7, 10, -.35, 0, TAU); g.strokeStyle = 'rgba(43,33,64,.75)'; g.lineWidth = 5; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2.4; g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]); } }
  if (o.practice) text(g, o.auto ? 'PRACTICE · auto ✿' : 'PRACTICE', 24, H - 26, 20, '#9be88a', 'left');
  if (o.cpBtn) { const a = UI.cpAdd = { x: 16, y: H - 140, w: 84, h: 84 }, d = UI.cpDel = { x: 112, y: H - 124, w: 68, h: 68 };
    for (const [r, lab, col] of [[a, '✿+', '#5cc85a'], [d, '✿−', '#b98cff']]) { g.fillStyle = PAL.ink; rrect(g, r.x, r.y, r.w, r.h, 18); g.fill(); g.fillStyle = col; rrect(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 15); g.fill(); text(g, lab, r.x + r.w / 2, r.y + r.h / 2 + 1, r.w > 70 ? 30 : 24, '#fff'); } }
  else UI.cpAdd = UI.cpDel = null;
  if (o.pauseBtn) { const r = UI.pause = { x: W - 78, y: 12, w: 64, h: 64 };   /* (undefined: this view leaves the button as it is: split screen's lower view) */ g.fillStyle = PAL.ink; rrect(g, r.x, r.y, r.w, r.h, 16); g.fill(); g.fillStyle = 'rgba(255,246,224,.92)'; rrect(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 13); g.fill(); g.fillStyle = PAL.ink; rrect(g, r.x + 21, r.y + 18, 8, 28, 3); g.fill(); rrect(g, r.x + 35, r.y + 18, 8, 28, 3); g.fill(); }
  else if (o.pauseBtn === false) UI.pause = null;
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
  g.fillStyle = PAL.ink; g.font = font(14); g.textAlign = 'center'; g.textBaseline = 'middle'; rrect(g, x + 8, y + 8, 22, 22, 6); g.fill(); g.fillStyle = '#fff'; g.fillText('MNP'[i] || '', x + 19, y + 19.5);
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
      runner(g, i, W / 2 + (i ? 1 : -1) * (narrow ? 250 : 345), (narrow ? 548 : 470) - hy + sq * 4, narrow ? 96 : 120, Math.sin(clamp01(ph / .8) * PI) * .12 * (i ? 1 : -1), { sq, mood: ph < .8 && hy > 30 ? 'happy' : 'open', wig: Math.sin(t * 7 + i) * .1 }); }
    /* the level card */
    const cw = o.levels > 1 && !o.online ? 560 : 470, cx = (W - cw) / 2, cy = 270; panel(g, cx, cy, cw, 150);
    text(g, o.level || 'PATCHWORK PULSE', W / 2, cy + 36, 32, '#ff8fb0');
    const d = (o.diff || 'easy').toUpperCase(), dc = o.diff === 'hard' ? '#ff6b6b' : o.diff === 'normal' ? '#ffb020' : '#7ed957';
    text(g, d, W / 2 - 110, cy + 78, 20, dc); text(g, 'BEST ' + Math.floor(o.best || 0) + '%', W / 2 + 40, cy + 78, 20, '#ffd36b');
    face(g, W / 2 - 180, cy + 78, o.diff || 'easy');
    for (let k = 0; k < 3; k++) { const x = W / 2 + 128 + k * 26, y = cy + 78; if (o.seeds >> k & 1) g.drawImage(SPR.seed, x - 12, y - 12, 24, 24); else { g.strokeStyle = 'rgba(43,33,64,.45)'; g.lineWidth = 2.2; g.setLineDash([4, 3]); g.beginPath(); g.ellipse(x, y, 6.5, 9.5, -.35, 0, TAU); g.stroke(); g.setLineDash([]); } }
    if (o.levels > 1 && !o.online) {   /* level select: arrows either side of the card */
      const ar = (r, dir) => { g.fillStyle = PAL.ink; rrect(g, r.x, r.y, r.w, r.h, 16); g.fill(); g.fillStyle = 'rgba(255,246,224,.95)'; rrect(g, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 13); g.fill();
        g.fillStyle = PAL.ink; g.beginPath(); const mx = r.x + r.w / 2, my = r.y + r.h / 2; g.moveTo(mx + dir * 11, my); g.lineTo(mx - dir * 8, my - 13); g.lineTo(mx - dir * 8, my + 13); g.closePath(); g.fill(); };
      ar(UI.prev = { x: cx + 12, y: cy + 46, w: 50, h: 58 }, -1); ar(UI.next = { x: cx + cw - 62, y: cy + 46, w: 50, h: 58 }, 1);
      text(g, (o.lvIx + 1) + ' / ' + o.levels + (o.placeholder ? '  ·  placeholder' : ''), W / 2, cy - 16, 16, '#fff6e0');
    } else UI.prev = UI.next = null;
    text(g, o.online ? o.cdText || '' : o.touch ? 'Tap to play' : 'SPACE: play   ·   ENTER: 2 players', W / 2, cy + 120, 22, '#fff');
    UI.b1 = o.online ? null : { x: cx, y: cy, w: cw, h: 150 };
    if (!o.online && o.touch) { const r = UI.b2 = { x: W / 2 - 120, y: 600, w: 240, h: 60 }; button(g, r, '2 players', '#ffb020', 24); } else UI.b2 = null;
    if (o.online) text(g, o.vsText || '', W / 2, 470, narrow ? 22 : 26, '#fff');   /* an upright phone: a size that passes between the two beets' leaves */
    if (o.tip) text(g, o.tip, W / 2, 440, 18, '#fff6e0');   /* an upright phone: just under the card */
    if (!o.touch && !o.online) text(g, (o.levels > 1 ? '◀ ▶ level · ' : '') + 'P practice  ·  SPACE, W, UP or click: hop  ·  hold: keep hopping', W / 2, 640, 18, '#fff6e0');
    /* M / N chips, bottom right (the room's own buttons sit top left) */
    const w2 = tw('Music', 16) + 54; chip(g, 1, W - 24 - w2, H - 58, !!o.music, 'Music'); const w1 = tw('Sound', 16) + 54; chip(g, 0, W - 24 - w2 - 12 - w1, H - 58, !!o.sound, 'Sound');
    if (!o.online) chip(g, 2, 24, H - 58, !!o.practice, 'Practice'); else UI.snd[2] = { x: 0, y: 0, w: 0, h: 0 };
    return;
  }
  if (name === 'count') {   /* o.h: the view's height (a short split-screen view) */
    const n = o.n; if (n == null) return;
    const hh = o.h || H, s = n > 0 ? String(n) : 'GO!', k = o.k || 0, sc = (1.4 - easeOut(k) * .4) * (hh < 600 ? .8 : 1);
    g.save(); g.globalAlpha = 1 - clamp01((k - .7) / .3); g.translate(W / 2, hh / 2 - (hh < 600 ? 20 : 40)); g.scale(sc, sc); text(g, s, 0, 0, 120, n > 0 ? '#fff' : '#7ed957'); g.restore();
    if (o.sub) text(g, o.sub, W / 2, hh / 2 + (hh < 600 ? 72 : 60), 26, '#fff');
    if (o.top) text(g, o.top, W / 2, hh / 2 - (hh < 600 ? 110 : 150), 30, '#ffd36b');   /* online: the level both are racing */
    return;
  }
  if (name === 'results') {   /* o.k: scale (split screen: bigger); o.dimY / o.dimH: the dim's rows (split screen: both views) */
    const age = o.age || 0, k = easeOut(age / .35), w = 620, h = 380, x = (W - w) / 2, y = (H - h) / 2 + (1 - k) * 60;
    g.fillStyle = 'rgba(43,33,64,' + (.35 * k).toFixed(3) + ')'; g.fillRect(0, o.dimY || 0, W, o.dimH || H);
    g.save(); g.globalAlpha = k; if (o.k && o.k !== 1) { g.translate(W / 2, H / 2); g.scale(o.k, o.k); g.translate(-W / 2, -H / 2); }
    panel(g, x, y, w, h);
    text(g, o.title || 'GARDEN CLEARED!', W / 2, y + 50, 44, o.titleC || '#7ed957');
    if (o.sub) text(g, o.sub, W / 2, y + 88, 19, '#fff6e0');
    const bob = Math.abs(Math.sin(age * 5.76)) * 16;
    if (o.both) { runner(g, 0, x + w - 116, y + 252 - bob, 72, -.08, { mood: 'happy', wig: Math.sin(age * 8) * .12 }); runner(g, 1, x + w - 52, y + 252 - Math.abs(Math.sin(age * 5.76 + 1.6)) * 16, 72, .08, { mood: 'happy', wig: Math.sin(age * 8 + 1) * .12 }); }   /* a tie: both beets */
    else if (o.who != null) runner(g, o.who, x + w - 92, y + 196 - bob, 92, 0, { mood: 'happy', wig: Math.sin(age * 8) * .12 });
    let ry = y + 130;
    for (const row of o.rows || []) { text(g, row[0], x + 230, ry, 24, row[2] || '#fff', 'right'); text(g, row[1], x + 252, ry, 24, '#ffd36b', 'left'); ry += 42; }
    if (o.prompt2) text(g, o.prompt2, W / 2, y + h - (o.titleBtn ? 98 : 74), 19, '#fff6e0');   /* inside the card, over the prompt (and clear of the touch Title button) */
    if (o.prompt) text(g, o.prompt, W / 2, y + h - 34, 22, '#fff');
    if (o.titleBtn) { const r = UI.resTitle = { x: x + 18, y: y + h - 58, w: 92, h: 42 }; button(g, r, 'Title', '#b98cff', 20); } else UI.resTitle = null;   /* touch: back to the title (bottom left, clear of the words) */
    UI.again = { x, y, w, h };
    g.restore(); return;
  }
  if (name === 'pause') {
    g.fillStyle = 'rgba(43,33,64,.45)'; g.fillRect(0, o.dimY || 0, W, o.dimH || H);
    g.save(); if (o.k && o.k !== 1) { g.translate(W / 2, H / 2); g.scale(o.k, o.k); g.translate(-W / 2, -H / 2); }
    const nw = Math.min(600, W - 40), x0 = (W - nw) / 2, ph = o.two ? (o.touch ? 186 : 210) : o.touch ? 256 : o.practice ? 330 : 280;   /* touch: no key hint row under the buttons */ panel(g, x0, H / 2 - ph / 2, nw, ph); text(g, 'PAUSED', W / 2, H / 2 - ph / 2 + 52, 48, '#ffd36b');   /* two players: no practice buttons */
    const bw = (nw - 60) / 2, a = UI.again = { x: x0 + 20, y: H / 2 - ph / 2 + 100, w: bw, h: 64 }, b = UI.back = { x: x0 + 40 + bw, y: H / 2 - ph / 2 + 100, w: bw, h: 64 };
    button(g, a, 'Carry on', '#5cc85a', 26); button(g, b, 'Title', '#b98cff', 26);
    if (o.two) UI.prac = UI.auto = null;
    else { const p = UI.prac = { x: x0 + 20, y: a.y + 80, w: o.practice ? bw : nw - 40, h: 56 }; button(g, p, o.practice ? 'Practice: on' : 'Practice: off', o.practice ? '#3fae4f' : '#8a7aa8', 22);
      if (o.practice) button(g, UI.auto = { x: x0 + 40 + bw, y: a.y + 80, w: bw, h: 56 }, o.auto ? 'Auto ✿: on' : 'Auto ✿: off', o.auto ? '#3fae4f' : '#8a7aa8', 22); else UI.auto = null; }
    text(g, o.touch ? '' : o.two ? 'SPACE: carry on · Esc: title' : 'SPACE: carry on · R: practice · A: auto ✿ · Esc: title', W / 2, H / 2 + ph / 2 - 26, 17, '#fff'); g.restore(); return;
  }
  if (name === 'msg') {   /* o.btn: a button under the lines (UI.msgBtn; dimmed until o.btnOn) */
    const lines = String(o.text || '').split('\n'), h = 60 + lines.length * 40 + (o.btn ? 84 : 0), y = (o.y || H / 2) - h / 2;
    panel(g, W / 2 - 330, y, 660, h, '#4a3a6b'); lines.forEach((s, i) => text(g, s, W / 2, y + 48 + i * 40, 28, i ? '#fff6e0' : '#ffd36b'));
    if (o.btn) { const r = UI.msgBtn = { x: W / 2 - 150, y: y + h - 92, w: 300, h: 62 }; g.save(); g.globalAlpha = o.btnOn ? 1 : .45; button(g, r, o.btn, '#5cc85a', 24); g.restore(); } else UI.msgBtn = null;
    return;
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
  setView(w) { W = w; PX = w < 1000 ? 150 : 400; this.W = W; this.PX = PX; },   /* the narrow view: the runner further left, ~16 blocks ahead (1 s at the fastest speed) */
  view, hud, screen, fx, text, runner, tw, spinner, pod
};
})();
