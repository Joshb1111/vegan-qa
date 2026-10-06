/* VINE LINE — art.js (ART). VL.Art draws everything in code in the Berry Breeze style: thick ink outlines, glossy two-tone
   shading, sticker text. The garden plot (soil checker + hedge) is baked once per render scale; berries are baked sprites;
   the vines, fx, HUD and screens are drawn live. Logical page 480 x 560: the board (24 x 24 cells of 19 px inside a 12 px
   hedge) fills the top 480, the HUD strip the last 80; a phone in portrait gets a D-pad band below (y >= 560). */
'use strict';
(function () {
const VL = window.VL = window.VL || {};
const TAU = Math.PI * 2, PI = Math.PI;
const W = 480, H = 560, BX = 12, BY = 12, CS = 19, N = 24;
const PAL = { ink: '#2b2140', plum: '#4a3a6b', cream: '#fff6e0', sun: '#ffd93b', gold: '#f5a623', orange: '#ff8a3d', leaf: '#4cc46a', lilac: '#e4d8ff', sky: '#7fd0ff', mint: '#9be8c4' };
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { if (t <= 0) return a; const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * Math.min(1, t)).toString(16).padStart(2, '0')).join(''); };
const FONT = '"Arial Rounded MT Bold", ui-rounded, "Varela Round", "Trebuchet MS", system-ui, sans-serif';
const font = s => 'bold ' + s + 'px ' + FONT;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
let R = 2;

/* ---------- colours of the two vines: [base, dark, light] ---------- */
const VC = [
  { st: ['#5cc85a', '#2f8f4a', '#d2f7c4'], lf: ['#8fe07a', '#3f9a3a', '#e2ffd2'], name: 'SPRIG', txt: '#b6f07a', pill: '#5cc85a' },
  { st: ['#ff9a45', '#d9622a', '#ffe2c8'], lf: ['#a4dc5c', '#5a9a2c', '#e6f7c8'], name: 'MARIGOLD', txt: '#ffb27a', pill: '#ff9a45' }
];
const WILT = ['#c4b07a', '#8a7448', '#efe2bc'];
const wm = (m, w) => w > 0 ? m.map((c, i) => mix(c, WILT[i], w)) : m;

/* ---------- helpers ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function sprite(w, h, draw) { const c = canvas(w * R, h * R); c.lw = w; c.lh = h; const g = c.getContext('2d'); g.scale(R, R); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); return c; }
function putS(ctx, c, x, y, s, r) { ctx.save(); ctx.translate(x, y); if (r) ctx.rotate(r); if (s !== 1) ctx.scale(s, s); ctx.drawImage(c, -c.lw / 2, -c.lh / 2, c.lw, c.lh); ctx.restore(); }
function rrect(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, TAU); }
const STAR = (g, cx, cy, r, ri, n, rot) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, q = i & 1 ? ri : r; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); };
function twinkle(g, x, y, r, rot, col) { g.fillStyle = col || '#fff'; STAR(g, x, y, r, r * .32, 4, rot || 0); g.fill(); }
function inkStar(g, x, y, r, rot, col, lw) { STAR(g, x, y, r, r * .45, 5, rot); g.fillStyle = col; g.strokeStyle = PAL.ink; g.lineWidth = lw || 1.4; g.stroke(); g.fill(); }
/* a glossy ball: ink ring, dark body, base offset up-left, a light gleam */
function ball(g, x, y, r, m, lw) {
  g.fillStyle = PAL.ink; circle(g, x, y, r + (lw || 2)); g.fill();
  g.fillStyle = m[1]; circle(g, x, y, r); g.fill();
  g.save(); circle(g, x, y, r); g.clip(); g.fillStyle = m[0]; circle(g, x - r * .16, y - r * .18, r * .92); g.fill(); g.restore();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(x - r * .38, y - r * .42, r * .34, r * .19, -.6, 0, TAU); g.fill();
  circle(g, x - r * .02, y - r * .64, Math.max(.6, r * .08)); g.fill();
}
function leafPath(g, L, w) { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * .45, -w, L, 0); g.quadraticCurveTo(L * .45, w, 0, 0); g.closePath(); }
function leaf(g, x, y, a, L, m, lw) {
  g.save(); g.translate(x, y); g.rotate(a); const w = L * .42;
  leafPath(g, L, w); g.strokeStyle = PAL.ink; g.lineWidth = lw || 2.4; g.stroke(); g.fillStyle = m[0]; g.fill();
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * .45, w, L, 0); g.closePath(); g.fillStyle = m[1]; g.globalAlpha *= .45; g.fill(); g.globalAlpha /= .45;
  g.strokeStyle = m[1]; g.lineWidth = .9; g.beginPath(); g.moveTo(L * .12, 0); g.lineTo(L * .78, 0); g.stroke();
  g.fillStyle = m[2]; g.beginPath(); g.ellipse(L * .42, -w * .38, L * .16, w * .16, 0, 0, TAU); g.fill();
  g.restore();
}
function eye(g, x, y, h, lx, ly, mood) {
  const w = h * .74; g.save(); g.strokeStyle = PAL.ink; g.lineCap = 'round';
  if (mood === 'shut' || mood === 'happy') {
    g.lineWidth = Math.max(1.2, h * .18); g.beginPath();
    if (mood === 'shut') g.arc(x, y - h * .1, w * .5, PI * .15, PI * .85); else g.arc(x, y + h * .2, w * .55, PI * 1.12, PI * 1.88);
    g.stroke(); g.restore(); return;
  }
  g.lineWidth = Math.max(1, h * .11); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); g.fill(); g.stroke();
  const px = x + lx * w * .16, py = y + h * .06 + ly * h * .12;
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(px, py, w * .33, h * .36, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff'; circle(g, px - w * .12, py - h * .13, Math.max(.7, h * .14)); g.fill(); circle(g, px + w * .12, py + h * .16, Math.max(.4, h * .06)); g.fill();
  g.restore();
}
function blush(g, x, y, rx, ry) { g.fillStyle = 'rgba(255,140,120,.75)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
function mouth(g, x, y, r, kind, lw) {
  g.save(); g.strokeStyle = PAL.ink; g.fillStyle = PAL.ink; g.lineWidth = lw || 1.2; g.lineCap = 'round'; g.beginPath();
  if (kind === 'o') { g.ellipse(x, y + r * .2, r * .6, r * .75, 0, 0, TAU); g.fill(); g.fillStyle = '#ff7a8a'; g.beginPath(); g.ellipse(x, y + r * .5, r * .35, r * .25, 0, 0, TAU); g.fill(); }
  else if (kind === 'wave') { g.moveTo(x - r, y + r * .3); g.quadraticCurveTo(x - r * .5, y - r * .2, x, y + r * .3); g.quadraticCurveTo(x + r * .5, y + r * .8, x + r, y + r * .3); g.stroke(); }
  else { g.arc(x, y - r * .4, r, .2 * PI, .8 * PI); g.stroke(); }
  g.restore();
}

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
  while (TXT.size > 1 && (TXT.size > 160 || txtB > 6e6)) { const k = TXT.keys().next().value, o = TXT.get(k); txtB -= o.width * o.height * 4; TXT.delete(k); }
  return c;
}
function text(ctx, s, x, y, size, fill, align) {
  s = String(s).slice(0, 60); if (!s) return 0; size = Math.round(Math.max(6, Math.min(90, +size || 14)) * 2) / 2; fill = fill || '#fff'; align = align || 'center';
  const c = txtCanvas(s, size, fill), p = (c.lw - c.tw) / 2, x0 = align === 'center' ? x - c.lw / 2 : align === 'right' ? x - c.tw - p : x - p;
  ctx.drawImage(c, x0, y - c.lh / 2, c.lw, c.lh); return c.tw;
}
const TW = {};
function tw(s, z) { const k = z + '|' + s; return TW[k] || (mctx.font = font(z), TW[k] = mctx.measureText(s).width); }

/* ---------- the garden plot (baked) ---------- */
let BOARD = null, SPR = {};
function bakeBoard() {
  BOARD = sprite(W, W, g => {
    g.fillStyle = '#3f8f45'; g.fillRect(0, 0, W, W);
    g.fillStyle = '#d9a66c'; g.fillRect(BX, BY, N * CS, N * CS);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const px = BX + x * CS, py = BY + y * CS;
      if ((x + y) & 1) { g.fillStyle = '#cf9a5f'; g.fillRect(px, py, CS, CS); }
      for (let k = 0; k < 3; k++) { const h = hash(x * 31 + k, y * 17 + k * 7); if (h < .55) { g.fillStyle = h < .2 ? 'rgba(120,70,30,.22)' : 'rgba(255,240,210,.22)'; circle(g, px + 3 + hash(x + k, y * 3) * (CS - 6), py + 3 + hash(y + k * 5, x * 7) * (CS - 6), h < .1 ? 1.3 : .8); g.fill(); } }
    }
    /* a few tiny sprouts and pebbles, never more than a speck */
    for (let i = 0; i < 26; i++) {
      const x = BX + 10 + hash(i, 3) * (N * CS - 20), y = BY + 10 + hash(i, 9) * (N * CS - 20);
      if (i % 3) { g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(x, y, 3.2, 2.4, 0, 0, TAU); g.fill(); g.fillStyle = i & 1 ? '#c9b8a6' : '#b8a48f'; g.beginPath(); g.ellipse(x, y - .3, 2.2, 1.5, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.6)'; circle(g, x - .8, y - .9, .6); g.fill(); }
      else { g.strokeStyle = 'rgba(70,110,40,.75)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y + 2); g.lineTo(x, y - 1); g.stroke(); g.fillStyle = '#7ec95a'; g.beginPath(); g.ellipse(x - 1.6, y - 2, 1.8, .9, -.5, 0, TAU); g.fill(); g.beginPath(); g.ellipse(x + 1.6, y - 2, 1.8, .9, .5, 0, TAU); g.fill(); }
    }
    /* a soft shadow under the hedge */
    const sh = (x0, y0, x1, y1, w, h) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(70,40,20,.28)'); gr.addColorStop(1, 'rgba(70,40,20,0)'); g.fillStyle = gr; g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h); };
    sh(0, BY, 0, BY + 10, W, 10); sh(BX, 0, BX + 8, 0, 8, W); sh(W - BX, 0, W - BX - 8, 0, 8, W); sh(0, W - BY, 0, W - BY - 6, W, 6);
    /* the hedge: overlapping round bushes with one merged outline */
    const B = [];
    for (let s = 0; s < 4; s++) for (let k = 0; k <= 32; k++) {
      const u = k * 15 + (s & 1 ? 7 : 0), j = hash(s * 41 + k, 5), r = 8.6 + j * 2.2, o = 5.5 + hash(k, s) * 1.5;
      if (u > W + 6) continue; B.push(s === 0 ? [u, o, r] : s === 1 ? [W - o, u, r] : s === 2 ? [W - u, W - o, r] : [o, W - u, r]);
    }
    for (const [x, y] of [[6, 6], [W - 6, 6], [6, W - 6], [W - 6, W - 6]]) B.push([x, y, 12.5]);
    g.fillStyle = PAL.ink; for (const [x, y, r] of B) { circle(g, x, y, r + 2.2); g.fill(); }
    g.fillStyle = '#2f8f4a'; for (const [x, y, r] of B) { circle(g, x, y, r); g.fill(); }
    g.fillStyle = '#4cb85a'; for (const [x, y, r] of B) { circle(g, x - r * .14, y - r * .18, r * .84); g.fill(); }
    g.fillStyle = '#9be88a'; for (const [x, y, r] of B) { g.beginPath(); g.ellipse(x - r * .38, y - r * .4, r * .3, r * .16, -.6, 0, TAU); g.fill(); }
    B.forEach(([x, y, r], i) => { const h = hash(i, 77); if (h < .22) { const fx = x + (hash(i, 3) - .5) * r, fy = y + (hash(i, 4) - .5) * r, col = h < .08 ? '#ffffff' : h < .15 ? '#ffd0e0' : '#fff3a0';
      g.fillStyle = PAL.ink; circle(g, fx, fy, 2.9); g.fill(); g.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p * TAU / 5; circle(g, fx + Math.cos(a) * 1.3, fy + Math.sin(a) * 1.3, 1.1); g.fill(); } g.fillStyle = PAL.gold; circle(g, fx, fy, .9); g.fill(); } });
  });
}

/* ---------- berries (no faces): 0 blueberry, 1 strawberry, 2 raspberry, 3 golden sunberry ---------- */
const MB = { blue: ['#4f86ff', '#2a4fb8', '#d6e6ff'], red: ['#ff5a66', '#c22d4f', '#ffd0d5'], rasp: ['#ff5f93', '#c2306a', '#ffd3e4'], gold: ['#ffd93b', '#f0a020', '#fffbe0'], leaf: ['#7ed957', '#3f9a3a', '#e2ffd2'] };
function bakeBerries() {
  SPR.b0 = sprite(24, 24, g => { ball(g, 12, 13, 7.6, MB.blue, 2.2); g.fillStyle = PAL.ink; STAR(g, 12, 6.6, 3.6, 1.6, 5, -PI / 2); g.fill(); g.fillStyle = MB.blue[1]; STAR(g, 12, 6.6, 2.4, 1, 5, -PI / 2); g.fill(); g.fillStyle = 'rgba(214,230,255,.4)'; g.beginPath(); g.ellipse(15, 16.5, 2.4, 1.3, -.5, 0, TAU); g.fill(); });
  SPR.b1 = sprite(24, 24, g => {
    const sp = q => { q.beginPath(); q.moveTo(12, 21.5); q.bezierCurveTo(3, 15, 3.6, 6.4, 12, 7.6); q.bezierCurveTo(20.4, 6.4, 21, 15, 12, 21.5); q.closePath(); };
    sp(g); g.strokeStyle = PAL.ink; g.lineWidth = 4.4; g.stroke(); g.fillStyle = MB.red[1]; g.fill();
    g.save(); sp(g); g.clip(); g.fillStyle = MB.red[0]; g.beginPath(); g.ellipse(11, 12.4, 7.6, 8, 0, 0, TAU); g.fill(); g.restore();
    g.fillStyle = '#fff3c4'; for (const [x, y] of [[8.6, 11.6], [12, 11], [15.4, 11.6], [10.2, 14.6], [13.8, 14.6], [12, 17.6], [7.8, 14.2], [16.2, 14.2]]) { g.beginPath(); g.ellipse(x, y, .5, .8, 0, 0, TAU); g.fill(); }
    g.fillStyle = MB.red[2]; g.beginPath(); g.ellipse(8.4, 10.2, 1.8, 1, -.7, 0, TAU); g.fill();
    for (const a of [-1.1, 0, 1.1]) leaf(g, 12, 7.4, -PI / 2 + a * 1.1, 5, MB.leaf, 1.8);
  });
  SPR.b2 = sprite(24, 24, g => {
    const D = [[12, 8.6], [8.4, 10.6], [15.6, 10.6], [10.2, 13.6], [13.8, 13.6], [7.6, 14.2], [16.4, 14.2], [12, 17.4], [9.6, 17], [14.4, 17]];
    g.fillStyle = PAL.ink; for (const [x, y] of D) { circle(g, x, y, 4.6); g.fill(); }
    for (const [x, y] of D) { g.fillStyle = MB.rasp[1]; circle(g, x, y, 2.9); g.fill(); g.fillStyle = MB.rasp[0]; circle(g, x - .45, y - .5, 2.4); g.fill(); g.fillStyle = MB.rasp[2]; circle(g, x - 1, y - 1.1, .8); g.fill(); }
    leaf(g, 12, 6.8, -PI / 2 - .7, 4.6, MB.leaf, 1.7); leaf(g, 12, 6.8, -PI / 2 + .7, 4.6, MB.leaf, 1.7);
  });
  SPR.b3 = sprite(28, 28, g => {
    g.strokeStyle = PAL.ink; g.lineWidth = 3.6; g.beginPath(); g.moveTo(14, 7); g.quadraticCurveTo(14.5, 4, 16.5, 2.6); g.stroke(); g.strokeStyle = '#b9774a'; g.lineWidth = 1.5; g.stroke();
    leaf(g, 15.5, 4, -.25, 7, MB.leaf, 2);
    ball(g, 14, 15, 8.6, MB.gold, 2.3);
    g.fillStyle = '#fff3b8'; for (const [x, y] of [[17.4, 14.2], [12.4, 19.2], [17, 18.6], [10.6, 15.4]]) { circle(g, x, y, .7); g.fill(); }
    twinkle(g, 20.5, 9.5, 3.4, 0, '#fff');
  });
  /* little icons for the HUD and title */
  SPR.head0 = sprite(30, 30, g => headSprig(g, 15, 16, -PI / 2, 1, 0, 100, { look: [0, 0] }));
  SPR.head1 = sprite(34, 34, g => headMari(g, 17, 17, -PI / 2, 1, 0, 100, { look: [0, 0] }));
  SPR.leaf = sprite(16, 16, g => leaf(g, 2.5, 13, -PI / 4, 13, MB.leaf, 2));
}
const berryImg = k => SPR['b' + (k & 3)];

/* ---------- vines ---------- */
function headSprig(g, x, y, ang, s, wl, t, o) {
  const st = wm(VC[0].st, wl), lf = wm(VC[0].lf, wl);
  g.save(); g.translate(x, y); g.scale(s, s);
  for (const k of [-1, 1]) leaf(g, Math.cos(ang + PI) * 3, Math.sin(ang + PI) * 3, ang + PI + k * (.8 + wl * .5), 10, lf, 2.2);   /* sepals, behind */
  const tip = -PI / 2 + Math.sin((t | 0) * .07) * .12 * (1 - wl) + wl * .9;   /* two little top leaves (like Berry Breeze's Sprig) */
  leaf(g, 0, -7.6, tip - .55, 7.5, lf, 2); leaf(g, 0, -7.6, tip + .55, 7.5, lf, 2);
  ball(g, 0, 0, 10.6, st, 2.4);
  face(g, 0, .6, 1, wl, t, o, 0);
  g.restore();
}
function headMari(g, x, y, ang, s, wl, t, o) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const left = Math.max(0, 12 - Math.round(wl * 7)), spin = ang * .25, P1 = wm(['#ff8a2a', '#d9622a', '#ffd0a0'], wl), P2 = wm(['#ffc23a', '#e8901c', '#fff0b8'], wl);
  const petals = r => { for (let i = 0; i < 12; i++) { if ((i * 5) % 12 >= left) continue; const a = spin + i * TAU / 12; g.save(); g.rotate(a); r(i); g.restore(); } };
  g.fillStyle = PAL.ink; petals(() => { g.beginPath(); g.ellipse(10.6, 0, 6.6, 4.5, 0, 0, TAU); g.fill(); });
  petals(i => { const m = i & 1 ? P2 : P1; g.fillStyle = m[1]; g.beginPath(); g.ellipse(10.6, 0, 4.7, 2.7, 0, 0, TAU); g.fill(); g.fillStyle = m[0]; g.beginPath(); g.ellipse(10.2, -.5, 4.1, 2.1, 0, 0, TAU); g.fill(); g.fillStyle = m[2]; g.beginPath(); g.ellipse(9.4, -1.2, 1.6, .7, 0, 0, TAU); g.fill(); });
  ball(g, 0, 0, 9.4, wm(['#ffd65a', '#f0a020', '#fff3c0'], wl), 2.3);
  face(g, 0, .5, .92, wl, t, o, 1);
  g.restore();
}
function face(g, x, y, k, wl, t, o, who) {
  const L = (o && o.look) || [0, 0], blink = !wl && ((((t | 0) + who * 97) % 230) < 7);
  const mood = wl > .05 ? 'shut' : blink ? 'shut' : o && o.happy ? 'happy' : 'open';
  eye(g, x - 3.9 * k, y - 1.6 * k, 7 * k, L[0], L[1], mood); eye(g, x + 3.9 * k, y - 1.6 * k, 7 * k, L[0], L[1], mood);
  blush(g, x - 6.6 * k, y + 2.6 * k, 1.9 * k, 1.1 * k); blush(g, x + 6.6 * k, y + 2.6 * k, 1.9 * k, 1.1 * k);
  if (wl > .05) mouth(g, x, y + 4.4 * k, 1.6 * k, 'wave', 1.1); else if (o && o.gulp > .25) mouth(g, x, y + 4 * k, 1.7 * k, 'o'); else mouth(g, x, y + 3.6 * k, 2 * k, 'smile', 1.2);
}
/* P: [x0, y0, x1, y1, …] head first. o: {t, wilt 0..1, gulp 0..1, arrow -1|0..3, dir} */
const DXY = [[0, -1], [1, 0], [0, 1], [-1, 0]];
function vine(ctx, who, P, o) {
  const n = P.length >> 1; if (!n) return; o = o || {};
  const wl = clamp01(o.wilt || 0), t = o.t | 0, st = wm(VC[who].st, wl), lf = wm(VC[who].lf, wl), BR = 6.4, SW = 7.5;
  const rad = i => { const k = n - 1 - i; return k >= 3 ? BR : BR * (.5 + k * .16); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  /* soft shadow */
  ctx.strokeStyle = 'rgba(80,40,10,.2)'; ctx.lineWidth = SW + 9; ctx.beginPath(); for (let i = 0; i < n; i++) ctx.lineTo(P[2 * i] + 2.5, P[2 * i + 1] + 3.5); if (n === 1) ctx.lineTo(P[0] + 2.6, P[1] + 3.5); ctx.stroke();
  /* leaves and tendrils on the waists between beads */
  for (let i = 1; i < n; i++) {
    const x = P[2 * i], y = P[2 * i + 1], px = P[2 * i - 2], py = P[2 * i - 1], mx = (x + px) / 2, my = (y + py) / 2;
    if (Math.abs(px - x) + Math.abs(py - y) < .5) continue;
    const ang = Math.atan2(py - y, px - x), side = (i >> 1) & 1 ? 1 : -1, sway = Math.sin(t * .06 + i * .9) * .14 * (1 - wl);
    if (i < n - 1 && i % 3 !== 0) {
      const sd = i & 1 ? 1 : -1;
      let la = ang + sd * (1.9 + sway); if (wl) { const d = Math.atan2(Math.sin(PI / 2 - la), Math.cos(PI / 2 - la)); la += d * wl * .65; }
      leaf(ctx, mx, my, la, (i >= n - 3 ? 10.5 : 15) * (i === 1 ? .85 : 1), lf, 2.3);
    } else if (i % 6 === 3 && i < n - 2) {
      const a = ang - side * 1.6, ex = mx + Math.cos(a) * 7, ey = my + Math.sin(a) * 7, cw = side > 0;
      for (const [c, w] of [[PAL.ink, 3.2], [lf[0], 1.4]]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(mx + Math.cos(a) * 4 + Math.cos(ang) * 2, my + Math.sin(a) * 4 + Math.sin(ang) * 2, ex, ey); ctx.arc(ex + Math.cos(ang) * 2.3, ey + Math.sin(ang) * 2.3, 2.3, ang + PI, ang + PI + (cw ? -1 : 1) * 4.2, cw); ctx.stroke(); }
    }
  }
  /* the stem: one ink outline for stem and beads, then the colours */
  ctx.strokeStyle = PAL.ink; ctx.fillStyle = PAL.ink;
  for (let i = 0; i < n - 1; i++) { ctx.lineWidth = Math.min(SW, rad(i + 1) * 1.6) + 4.6; ctx.beginPath(); ctx.moveTo(P[2 * i], P[2 * i + 1]); ctx.lineTo(P[2 * i + 2], P[2 * i + 3]); ctx.stroke(); }
  for (let i = 1; i < n; i++) { circle(ctx, P[2 * i], P[2 * i + 1], rad(i) + 2.3); ctx.fill(); }
  ctx.strokeStyle = st[1];
  for (let i = 0; i < n - 1; i++) { ctx.lineWidth = Math.min(SW, rad(i + 1) * 1.6); ctx.beginPath(); ctx.moveTo(P[2 * i], P[2 * i + 1]); ctx.lineTo(P[2 * i + 2], P[2 * i + 3]); ctx.stroke(); }
  for (let i = n - 1; i >= 1; i--) {
    const x = P[2 * i], y = P[2 * i + 1], r = rad(i);
    ctx.fillStyle = st[1]; circle(ctx, x, y, r); ctx.fill();
    ctx.fillStyle = st[0]; circle(ctx, x - r * .14, y - r * .17, r * .83); ctx.fill();
    ctx.fillStyle = st[2]; ctx.beginPath(); ctx.ellipse(x - r * .36, y - r * .4, r * .32, r * .17, -.6, 0, TAU); ctx.fill();
  }
  /* the head */
  const hx = P[0], hy = P[1] + wl * 2.5, ang = n > 1 && (P[0] !== P[2] || P[1] !== P[3]) ? Math.atan2(P[1] - P[3], P[0] - P[2]) : ((o.dir | 0) - 1) * PI / 2;
  const s = (1 + (o.gulp || 0) * .2) * (1 - wl * .08), look = [Math.cos(ang), Math.sin(ang)];
  if (who) headMari(ctx, hx, hy, ang, s, wl, t, { look, gulp: o.gulp, happy: o.happy }); else headSprig(ctx, hx, hy, ang, s, wl, t, { look, gulp: o.gulp, happy: o.happy });
  if (o.arrow >= 0 && o.arrow <= 3) {   /* the guest's own turn, not yet acked */
    const d = DXY[o.arrow], ax = hx + d[0] * 17, ay = hy + d[1] * 17, a = Math.atan2(d[1], d[0]);
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3, -5.5); ctx.lineTo(-3, 5.5); ctx.closePath();
    ctx.lineJoin = 'round'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  }
}

/* ---------- berries on the board ---------- */
function berry(ctx, k, x, y, o) {
  o = o || {}; const t = o.t | 0, born = o.age == null ? 99 : o.age, pop = born < 12 ? easeOut(born / 12) * (1 + .25 * Math.sin(born / 12 * PI)) : 1;
  const bob = Math.sin(t * .09 + x * .1 + y * .07) * 1.1, sq = 1 + Math.sin(t * .09 + x * .1 + y * .07 + 1.2) * .03;
  ctx.fillStyle = 'rgba(80,40,10,.22)'; ctx.beginPath(); ctx.ellipse(x + 1.5, y + 7.5, 7 * pop, 2.6 * pop, 0, 0, TAU); ctx.fill();
  if (k === 3) {
    const f = clamp01(o.frac == null ? 1 : o.frac), blink = f < .3 && ((t >> 3) & 1);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.arc(x, y, 13.5, -PI / 2, -PI / 2 + f * TAU); ctx.stroke();
    ctx.strokeStyle = blink ? '#fff' : PAL.sun; ctx.lineWidth = 2.4; ctx.stroke();
    for (let i = 0; i < 3; i++) { const a = t * .05 + i * TAU / 3; twinkle(ctx, x + Math.cos(a) * 17, y + Math.sin(a) * 17, 2.2 + Math.sin(t * .2 + i) * .8, a, i & 1 ? '#fff' : '#fff3a0'); }
  }
  ctx.save(); ctx.translate(x, y + bob - 1); ctx.scale(pop / sq, pop * sq); const c = berryImg(k); ctx.drawImage(c, -c.lw / 2, -c.lh / 2, c.lw, c.lh); ctx.restore();
}

/* ---------- fx: return false when done ---------- */
const FX = {
  leaf(ctx, f, a) {   /* the tiny burst of leaves when a berry is eaten */
    const L = 30; if (a > L) return false; const k = a / L, d = (1 - Math.pow(.88, a)) / .12;
    ctx.globalAlpha = k < .6 ? 1 : 1 - (k - .6) / .4;
    leaf(ctx, f.x + f.vx * d, f.y + f.vy * d + a * a * .006, f.r + a * f.vr, 7 * (1 - k * .4), f.m || MB.leaf, 1.6);
    ctx.globalAlpha = 1; return true;
  },
  dot(ctx, f, a) {
    const L = 24; if (a > L) return false; const k = a / L, d = (1 - Math.pow(.87, a)) / .13;
    ctx.fillStyle = PAL.ink; circle(ctx, f.x + f.vx * d, f.y + f.vy * d, 3.4 * (1 - k)); ctx.fill(); ctx.fillStyle = f.c; circle(ctx, f.x + f.vx * d, f.y + f.vy * d, 2.2 * (1 - k)); ctx.fill(); return true;
  },
  ring(ctx, f, a) { const L = 16; if (a > L) return false; const k = easeOut(a / L); ctx.globalAlpha = 1 - a / L; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * (1 - k) + .6; circle(ctx, f.x, f.y, 5 + 16 * k); ctx.stroke(); ctx.globalAlpha = 1; return true; },
  petal(ctx, f, a) {   /* wilting: petals and leaves drift down and fade */
    const L = f.life || 90; if (a > L) return false; const k = a / L;
    ctx.globalAlpha = k < .5 ? 1 : 1 - (k - .5) / .5;
    const x = f.x + Math.sin(a * .07 + f.ph) * 7 + f.vx * a, y = f.y + a * .32 + (a < 10 ? -a * .3 : -3);
    if (f.round) { ctx.save(); ctx.translate(x, y); ctx.rotate(f.r + Math.sin(a * .1 + f.ph) * .8); ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(0, 0, 5.4, 3.4, 0, 0, TAU); ctx.fill(); ctx.fillStyle = f.m[0]; ctx.beginPath(); ctx.ellipse(0, 0, 3.8, 2, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    else leaf(ctx, x, y, f.r + Math.sin(a * .1 + f.ph) * .8, 7, f.m, 1.6);
    ctx.globalAlpha = 1; return true;
  },
  spark(ctx, f, a) { const L = 32; if (a > L) return false; const k = easeOut(a / L); for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + .3, d = 26 * k; ctx.globalAlpha = 1 - a / L; inkStar(ctx, f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, 4.5 * (1 - a / L * .6), a * .15, i & 1 ? PAL.sun : '#fff', 1.2); } ctx.globalAlpha = 1; return true; },
  txt(ctx, f, a) {
    const L = f.life || 46; if (a > L) return false; const k = a / L, s = a < 6 ? .6 + .5 * Math.sin(a / 6 * PI / 2) : 1;
    ctx.globalAlpha = k < .7 ? 1 : 1 - (k - .7) / .3; ctx.save(); ctx.translate(f.x, f.y - easeOut(k) * 26); ctx.scale(s, s); text(ctx, f.s, 0, 0, f.z || 16, f.c || '#fff'); ctx.restore(); ctx.globalAlpha = 1; return true;
  },
  go(ctx, f, a) { const L = 44; if (a > L) return false; const s = a < 8 ? .4 + .9 * easeOut(a / 8) : 1.3 - .3 * Math.min(1, (a - 8) / 10); ctx.globalAlpha = a < 30 ? 1 : 1 - (a - 30) / 14; ctx.save(); ctx.translate(240, f.y || 236); ctx.scale(s, s); text(ctx, 'GO!', 0, 0, 64, PAL.sun); ctx.restore(); ctx.globalAlpha = 1; return true; },
  confetti(ctx, f, a) {
    const L = 150; if (a > L) return false; const ga = a > L - 30 ? (L - a) / 30 : 1;
    for (let i = 0; i < 24; i++) { const h = hash(i, f.seed | 0), x = f.x + (h - .5) * 360 + Math.sin(a * .05 + i) * 12, y = f.y - 40 + a * (1.2 + hash(i, 3) * 1.4) - 60 * hash(i, 9); ctx.globalAlpha = ga;
      if (i % 3) leaf(ctx, x, y, a * .08 * (h - .5) * 3 + i, 8, i % 3 === 1 ? MB.leaf : ['#ffd93b', '#f0a020', '#fff8c0'], 1.6); else { ctx.fillStyle = PAL.ink; circle(ctx, x, y, 4.4); ctx.fill(); ctx.fillStyle = ['#ff5a66', '#4f86ff', '#ff5f93'][i % 3 === 0 ? (i / 3) % 3 : 0]; circle(ctx, x, y, 3); ctx.fill(); } }
    ctx.globalAlpha = 1; return true;
  }
};

/* ---------- cards, HUD, chips ---------- */
function card(ctx, x, y, w, h, fill) {
  ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x - 3, y - 3 + 3, w + 6, h + 6, 20); ctx.fill();
  ctx.fillStyle = fill || 'rgba(74,58,107,.92)'; ctx.beginPath(); rrect(ctx, x, y, w, h, 17); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.beginPath(); rrect(ctx, x + 4, y + 4, w - 8, h - 8, 13); ctx.stroke();
}
function pill(ctx, x, y, w, h, col, sel) {
  ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x - 2.5, y - 2.5 + (sel ? 3 : 2), w + 5, h + 5, h / 2 + 2.5); ctx.fill();
  ctx.fillStyle = col; ctx.beginPath(); rrect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); rrect(ctx, x + h * .35, y + 3, w - h * .7, h * .2, h * .1); ctx.fill();
}
function keycap(ctx, x, y, s, w) { w = w || 22; ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x - w / 2, y - 11, w, 22, 5); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.2; ctx.stroke(); text(ctx, s, x, y, 12, PAL.sun); }
function sndIcon(ctx, x, y, music, on) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1.7, 1.7);
  ctx.fillStyle = ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.75)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
  if (music) { ctx.beginPath(); ctx.ellipse(-1.4, 2.4, 1.7, 1.3, -.4, 0, TAU); ctx.fill(); ctx.fillRect(-.1, -3.6, 1, 6); ctx.beginPath(); ctx.moveTo(.4, -3.6); ctx.quadraticCurveTo(3.4, -2.4, 2.6, .2); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-3.4, -1.3); ctx.lineTo(-1.6, -1.3); ctx.lineTo(.6, -3.4); ctx.lineTo(.6, 3.4); ctx.lineTo(-1.6, 1.3); ctx.lineTo(-3.4, 1.3); ctx.closePath(); ctx.fill(); if (on) { ctx.beginPath(); ctx.arc(1, 0, 2.4, -.8, .8); ctx.stroke(); ctx.beginPath(); ctx.arc(1, 0, 4.2, -.8, .8); ctx.stroke(); } }
  if (!on) { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-3.4, 3.6); ctx.lineTo(3.6, -3.6); ctx.stroke(); ctx.strokeStyle = '#ffb27a'; ctx.lineWidth = 1.2; ctx.stroke(); }
  ctx.restore();
}
const UI = { snd: [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }], b1: { x: 0, y: 0, w: 0, h: 0 }, b2: { x: 0, y: 0, w: 0, h: 0 } };
function sndChip(ctx, r, x, right, key, music, on, touch) {
  const lbl = (music ? 'MUSIC ' : 'SOUND ') + (on ? 'ON' : 'OFF'), w = (touch ? 0 : 24) + 26 + tw(lbl, 13) + 12, x0 = right ? x - w : x, y0 = 8, h = 28;
  ctx.fillStyle = 'rgba(43,33,64,.55)'; ctx.beginPath(); rrect(ctx, x0, y0, w, h, 14); ctx.fill();
  let cx = x0 + 8;
  if (!touch) { ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, cx, y0 + 5, 18, 18, 4); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1; ctx.stroke(); text(ctx, key, cx + 9, y0 + 14, 11, PAL.sun); cx += 24; }
  sndIcon(ctx, cx + 8, y0 + 14, music, on); text(ctx, lbl, cx + 20, y0 + 14.5, 13, on ? '#fff' : '#d9d3f0', 'left');
  r.x = x0 - 4; r.y = 0; r.w = w + 8; r.h = y0 + h + 8;
}
function hudStrip(ctx) {
  const gr = ctx.createLinearGradient(0, W, 0, H); gr.addColorStop(0, '#5aa84f'); gr.addColorStop(1, '#3f8f45'); ctx.fillStyle = gr; ctx.fillRect(0, W, W, H - W);
  ctx.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < W; x += 24) ctx.fillRect(x, W, 12, H - W);
  ctx.fillStyle = PAL.ink; ctx.fillRect(0, W, W, 3);
}
function stat(ctx, x, y, w, lbl, val, icon, col) {
  ctx.fillStyle = 'rgba(43,33,64,.55)'; ctx.beginPath(); rrect(ctx, x, y, w, 50, 16); ctx.fill();
  if (icon) putS(ctx, icon, x + 24, y + 25, icon === SPR.b3 ? .95 : 1.05);
  text(ctx, lbl, x + 46, y + 15, 11, '#e9e3ff', 'left'); text(ctx, String(val), x + 46, y + 33, 20, col || '#fff', 'left');
}
function winPips(ctx, x, y, n, who, dir) {
  for (let i = 0; i < 3; i++) { const px = x + dir * i * 22, on = i < n; ctx.globalAlpha = on ? 1 : .45; if (on) putS(ctx, berryImg(who ? 1 : 0), px, y, .78); else { ctx.fillStyle = PAL.ink; circle(ctx, px, y + 1, 7.5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; circle(ctx, px, y + 1, 5.5); ctx.fill(); } ctx.globalAlpha = 1; }
}

/* ---------- screens ---------- */
const SCREENS = {
  hud(ctx, S) {
    hudStrip(ctx); const y = W + 17;
    if (!S.two) {
      stat(ctx, 12, y, 148, 'SCORE', S.sc[0] | 0, berryImg(0), PAL.sun);
      stat(ctx, 166, y, 148, 'LENGTH', S.len[0] | 0, SPR.leaf, '#c9f7c1');
      stat(ctx, 320, y, 148, S.newBest ? 'NEW BEST!' : 'BEST', Math.max(S.best | 0, S.sc[0] | 0), berryImg(3), S.newBest ? '#ffb27a' : '#fff');
      return;
    }
    for (let i = 0; i < 2; i++) {
      const x = i ? 268 : 12, hd = SPR['head' + i];
      ctx.fillStyle = 'rgba(43,33,64,.55)'; ctx.beginPath(); rrect(ctx, x, y, 200, 50, 16); ctx.fill();
      putS(ctx, hd, i ? x + 176 : x + 24, y + 25, i ? .9 : 1);
      const tx = i ? x + 152 : x + 48, al = i ? 'right' : 'left';
      text(ctx, VC[i].name + (S.you === i ? ' (you)' : ''), tx, y + 15, 12, VC[i].txt, al);
      text(ctx, String(S.sc[i] | 0), tx, y + 34, 18, '#fff', al);
      winPips(ctx, i ? x + 30 : x + 170, y + 34, S.w[i] | 0, i, i ? 1 : -1);
    }
    text(ctx, 'ROUND', 240, y + 15, 11, '#e9e3ff'); text(ctx, String(S.round | 0), 240, y + 35, 22, PAL.sun);
  },
  count(ctx, S) {   /* ph 0: 3-2-1 (2 players) or READY? (1 player) */
    const cd = S.cd | 0;
    if (S.two) {
      const n = Math.ceil(cd / 60), f = (60 - (cd - (n - 1) * 60)) / 60, s = f < .2 ? .5 + 2.5 * f * 1.2 : 1.1 - .1 * f;
      text(ctx, 'ROUND ' + (S.round | 0), 240, 196, 20, PAL.sun);
      ctx.save(); ctx.translate(240, 250); ctx.scale(s, s); text(ctx, String(n), 0, 0, 72, n === 1 ? PAL.sun : '#fff'); ctx.restore();
      const L = S.labels; if (L) { const b = Math.sin((S.t | 0) * .15) * 2; if (L[0]) text(ctx, L[0], 136, 116 + b, 15, VC[0].txt); if (L[1]) text(ctx, L[1], 344, 356 - b, 15, VC[1].txt); }
    } else {
      const s = 1 + Math.sin((S.t | 0) * .2) * .04; ctx.save(); ctx.translate(240, 150); ctx.scale(s, s); text(ctx, 'READY?', 0, 0, 52, '#fff'); ctx.restore();
      text(ctx, S.touch ? 'swipe to steer' : 'arrow keys or W A S D', 240, 196, 16, PAL.sun);
    }
  },
  round(ctx, S) {   /* ph 2: a round won (or a draw) */
    const a = S.age | 0; if (a < 24) return; const k = easeOut((a - 24) / 14), w = S.winner;
    ctx.save(); ctx.translate(240, 236 + (1 - k) * 40); ctx.globalAlpha = k;
    card(ctx, -160, -78, 320, 156);
    const col = w === 0 ? VC[0].txt : w === 1 ? VC[1].txt : PAL.sun, msg = w === 0 ? 'SPRIG WINS!' : w === 1 ? 'MARIGOLD WINS!' : 'DRAW!';
    const s = 1 + Math.max(0, 1 - (a - 24) / 10) * .3; ctx.save(); ctx.translate(0, -40); ctx.scale(s, s); text(ctx, msg, 0, 0, 34, col); ctx.restore();
    if (w < 0) text(ctx, 'heads together: nobody scores', 0, -8, 13, '#e9e3ff');
    for (let i = 0; i < 2; i++) putS(ctx, SPR['head' + i], i ? 100 : -100, 26, 1.1);
    for (let i = 0; i < 2; i++) { const x0 = i ? 100 : -100; for (let j = 0; j < 3; j++) { const on = j < (S.w[i] | 0); ctx.globalAlpha = k * (on ? 1 : .45); const px = x0 - 22 + j * 22; if (on) putS(ctx, berryImg(i ? 1 : 0), px, 60, .72); else { ctx.fillStyle = PAL.ink; circle(ctx, px, 59, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; circle(ctx, px, 59, 5); ctx.fill(); } } }
    ctx.globalAlpha = k; text(ctx, (S.w[0] | 0) + ' – ' + (S.w[1] | 0), 0, 28, 26, '#fff');
    ctx.restore(); ctx.globalAlpha = 1;
  },
  match(ctx, S) {   /* ph 3, 2 players: the match is won */
    const a = S.age | 0; if (a < 24) return; const k = easeOut((a - 24) / 16), w = S.winner;
    ctx.fillStyle = 'rgba(43,33,64,' + (.3 * k).toFixed(3) + ')'; ctx.fillRect(0, 0, W, W);
    ctx.save(); ctx.translate(240, 228 + (1 - k) * 50); ctx.globalAlpha = k;
    card(ctx, -180, -122, 360, 244);
    const who = w === 1 ? 1 : 0;
    putS(ctx, SPR['head' + who], 0, -78 + Math.sin(a * .12) * 3, 1.7);
    const s = 1 + Math.max(0, 1 - (a - 24) / 12) * .3; ctx.save(); ctx.translate(0, -26); ctx.scale(s, s); text(ctx, VC[who].name, 0, 0, 42, VC[who].txt); ctx.restore();
    text(ctx, 'WINS THE MATCH!', 0, 12, 24, '#fff');
    text(ctx, (S.w[0] | 0) + ' – ' + (S.w[1] | 0), 0, 46, 20, PAL.sun);
    if (a > 60) { ctx.globalAlpha = k * (.6 + .4 * Math.abs(Math.sin(a * .06))); text(ctx, S.prompt || 'SPACE: play again', 0, 82, 16, PAL.sun); ctx.globalAlpha = k; if (S.sub) text(ctx, S.sub, 0, 104, 12, '#e9e3ff'); }
    ctx.restore(); ctx.globalAlpha = 1;
  },
  over(ctx, S) {   /* ph 3, 1 player: GAME OVER, kindly */
    const a = S.age | 0; if (a < 30) return; const b = a - 30, k = easeOut(b / 18);
    ctx.fillStyle = 'rgba(43,33,64,' + (.3 * k).toFixed(3) + ')'; ctx.fillRect(0, 0, W, W);
    ctx.save(); ctx.translate(240, 232 + (1 - k) * 50); ctx.globalAlpha = k;
    card(ctx, -170, -118, 340, 236);
    const Wd = 'GAME OVER'; let x = -Wd.length * 15 + 15;
    for (let i = 0; i < Wd.length; i++) { const q = clamp01((b - 4 - i * 2) / 10), c = Wd[i]; if (c !== ' ' && q > 0) { ctx.globalAlpha = k * q; text(ctx, c, x, -84 - (1 - easeOut(q)) * 14 + Math.sin(a * .08 + i * .7) * 1.5, 38, i & 1 ? '#ffe36b' : PAL.sun); } x += 30; }
    ctx.globalAlpha = k;
    text(ctx, 'Good growing! Your vine needs a rest.', 0, -48, 13, '#e9e3ff');
    const q = clamp01((b - 16) / 30);
    text(ctx, 'SCORE ' + Math.round((S.score | 0) * easeOut(q)), 0, -12, 28, '#fff');
    text(ctx, 'length ' + (S.len | 0), 0, 18, 14, '#c9f7c1');
    if (S.newBest) { const z = 1 + Math.sin(a * .15) * .06; ctx.save(); ctx.translate(0, 46); ctx.scale(z, z); text(ctx, 'NEW BEST!', 0, 0, 22, '#ffb27a'); ctx.restore(); }
    else text(ctx, 'BEST ' + (S.best | 0), 0, 46, 16, PAL.sun);
    if (b > 40) { ctx.globalAlpha = k * (.6 + .4 * Math.abs(Math.sin(a * .06))); text(ctx, S.touch ? 'Tap to try again' : 'SPACE or tap: try again', 0, 80, 16, PAL.sun); ctx.globalAlpha = k; if (!S.touch) text(ctx, 'Esc: menu', 0, 102, 12, '#e9e3ff'); }
    ctx.restore(); ctx.globalAlpha = 1;
  },
  msg(ctx, S) {   /* a waiting / quiet / version card */
    ctx.fillStyle = 'rgba(43,33,64,.42)'; ctx.fillRect(0, 0, W, W);
    const L = String(S.text || '').split('\n'), h = L.length * 30 + 34, cy = S.y || 236; card(ctx, 50, cy - h / 2, 380, h);
    L.forEach((s, i) => text(ctx, s, 240, cy - h / 2 + 32 + i * 30, i ? 15 : 20, i ? '#fff' : PAL.sun));
  },
  pause(ctx) { ctx.fillStyle = 'rgba(43,33,64,.45)'; ctx.fillRect(0, 0, W, W); text(ctx, 'PAUSED', 240, 220, 44, '#fff'); text(ctx, 'P or SPACE to carry on', 240, 266, 16, PAL.sun); },
  title(ctx, S) {
    const t = S.t | 0, touch = !!S.touch, on = !!S.online;
    ctx.fillStyle = 'rgba(255,246,224,.42)'; ctx.fillRect(0, 0, W, W);
    hudStrip(ctx);
    /* the logo: VINE in leaf greens, LINE in marigold oranges, letters bobbing */
    const word = (w, y, cols, d) => { let x = 240 - (w.length - 1) * 31; for (let i = 0; i < w.length; i++) { const yy = y + Math.sin(t * .08 + i * .8 + d) * 3; ctx.save(); ctx.translate(x, yy); ctx.rotate(Math.sin(t * .05 + i + d) * .05); text(ctx, w[i], 0, 0, 76, cols[i & 1]); ctx.restore(); x += 62; } };
    word('VINE', 98, ['#8fe07a', '#c9f7a0'], 0); word('LINE', 172, ['#ffb24a', '#ffd93b'], 2);
    leaf(ctx, 246, 52 + Math.sin(t * .08 + .8) * 3, -PI / 2 - .5 + Math.sin(t * .06) * .1, 18, MB.leaf, 2.4);   /* a sprout on the I of VINE */
    leaf(ctx, 246, 52 + Math.sin(t * .08 + .8) * 3, -PI / 2 + .5 + Math.sin(t * .06) * .1, 15, MB.leaf, 2.4);
    putS(ctx, berryImg(0), 92, 172 + Math.sin(t * .08) * 3, 1.5, Math.sin(t * .05) * .15); putS(ctx, berryImg(3), 388, 98 + Math.sin(t * .08 + 2) * 3, 1.5, Math.sin(t * .05 + 1) * .15);
    if (S.sound != null) { sndChip(ctx, UI.snd[0], 8, 0, 'M', 0, S.sound !== false, touch); const ga = ctx.globalAlpha; if (S.sound === false) ctx.globalAlpha = .6; sndChip(ctx, UI.snd[1], 472, 1, 'N', 1, S.music !== false, touch); ctx.globalAlpha = ga; }
    text(ctx, 'Eat berries, grow long, don’t bump!', 240, 226, 17, '#fff');
    if (on) {
      card(ctx, 70, 262, 340, 120);
      text(ctx, S.waiting ? 'Waiting for ' + (S.opp || 'your friend') + '…' : 'Playing with ' + (S.opp || 'a friend') + '!', 240, 294, 20, PAL.sun);
      text(ctx, S.role === 'guest' ? 'You are MARIGOLD' : 'You are SPRIG', 240, 326, 15, VC[S.role === 'guest' ? 1 : 0].txt);
      text(ctx, S.cdText || 'Get ready…', 240, 354, 15, '#fff');
      UI.b1.w = UI.b2.w = 0;
    } else {
      const pul = 1 + Math.sin(t * .1) * .02;
      ctx.save(); ctx.translate(240, 288); ctx.scale(pul, pul); pill(ctx, -130, -22, 260, 44, '#5cc85a', 1); if (!touch) keycap(ctx, -88, 0, 'SPACE', 58); text(ctx, '1 PLAYER', touch ? 0 : 34, 1, 22, '#fff'); ctx.restore();
      pill(ctx, 110, 322, 260, 44, '#ff9a45', 0); if (!touch) keycap(ctx, 152, 344, 'ENTER', 58); text(ctx, '2 PLAYERS', touch ? 240 : 274, 345, 22, '#fff');
      UI.b1.x = 110; UI.b1.y = 262; UI.b1.w = 260; UI.b1.h = 52; UI.b2.x = 110; UI.b2.y = 318; UI.b2.w = 260; UI.b2.h = 52;
      if (!touch) {
        ctx.fillStyle = 'rgba(43,33,64,.55)'; ctx.beginPath(); rrect(ctx, 40, 384, 400, 64, 18); ctx.fill();
        putS(ctx, SPR.head0, 68, 404, .78); text(ctx, 'SPRIG', 88, 404, 14, VC[0].txt, 'left'); text(ctx, 'W A S D', 186, 404, 14, '#fff', 'left');
        putS(ctx, SPR.head1, 68, 430, .7); text(ctx, 'MARIGOLD', 88, 430, 14, VC[1].txt, 'left'); text(ctx, 'arrow keys', 186, 430, 14, '#fff', 'left');
        text(ctx, '1 player: either', 424, 404, 12, '#e9e3ff', 'right'); text(ctx, 'P pause  Esc back', 424, 430, 12, '#e9e3ff', 'right');
      } else text(ctx, 'Swipe to steer your vine', 240, 410, 16, '#fff');
    }
    const y = W + 40;
    putS(ctx, berryImg(1), 30, y, 1.1); text(ctx, '+10', 46, y, 15, '#fff', 'left');
    putS(ctx, berryImg(3), 116, y, 1.05); text(ctx, '+50, quick before it fades!', 134, y, 15, PAL.sun, 'left');
    text(ctx, 'BEST ' + (S.best | 0), 466, y, 17, '#fff', 'right');
  },
  pad(ctx, S) {   /* the phone D-pad, in the band under the HUD */
    const cx = S.x, cy = S.y, r = S.r, pr = S.pressed;
    ctx.fillStyle = 'rgba(43,33,64,.35)'; circle(ctx, cx, cy, r + 8); ctx.fill();
    for (let d = 0; d < 4; d++) {
      const v = DXY[d], bx = cx + v[0] * r * .58, by = cy + v[1] * r * .58, br = r * .36, p = pr === d;
      ctx.fillStyle = PAL.ink; circle(ctx, bx, by + 3, br + 3); ctx.fill();
      ctx.fillStyle = p ? '#ffd93b' : S.col || '#5cc85a'; circle(ctx, bx, by + (p ? 2 : 0), br); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.ellipse(bx - br * .3, by - br * .4 + (p ? 2 : 0), br * .4, br * .2, -.5, 0, TAU); ctx.fill();
      const a = Math.atan2(v[1], v[0]); ctx.save(); ctx.translate(bx, by + (p ? 2 : 0)); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(br * .45, 0); ctx.lineTo(-br * .25, -br * .4); ctx.lineTo(-br * .25, br * .4); ctx.closePath(); ctx.lineJoin = 'round'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
    }
  }
};

VL.Art = {
  ready: false, R: 2, W, H, BX, BY, CS, N, UI, VC, PAL,
  cellX: c => BX + (c % N) * CS + CS / 2, cellY: c => BY + ((c / N) | 0) * CS + CS / 2,
  init(r) { r = Math.max(1, Math.min(4, +r || 2)); if (this.ready && r === R) return; R = this.R = r; TXT = new Map(); txtB = 0; SPR = {}; bakeBoard(); bakeBerries(); this.ready = true; },
  board(ctx) { ctx.drawImage(BOARD, 0, 0, W, W); },
  berry, vine, text, leaf: (ctx, x, y, a, L, who) => leaf(ctx, x, y, a, L, who == null ? MB.leaf : VC[who].lf),
  head(ctx, who, x, y, s) { putS(ctx, SPR['head' + (who ? 1 : 0)], x, y, s || 1); },
  fx(ctx, f, age) { const F = FX[f.k]; return F ? F(ctx, f, age) : false; },
  screen(ctx, name, S) { const F = SCREENS[name]; if (F) F(ctx, S || {}); },
  colors: who => ({ leaf: VC[who].lf, stem: VC[who].st, petal: who ? ['#ff8a2a', '#d9622a', '#ffd0a0'] : VC[0].lf }),
  berryCol: k => [MB.blue, MB.red, MB.rasp, MB.gold][k & 3][0]
};
})();
