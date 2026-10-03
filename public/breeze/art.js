/* Berry Breeze — art.js (ART). BB.Art draws everything in code (SPEC.md section 4, art bible design_art.md with the
   SPEC section 1 changes). Sprites are pre-rendered at render scale R into offscreen canvases, backgrounds are baked
   per stage at min(R,2) as tall scrolling tiles, and fx / rings / HUD / screens are drawn live (sticker text cached). */
'use strict';
(function () {
const TAU = Math.PI * 2, PI = Math.PI, DEG = PI / 180;
const PAL = { ink: '#2b2140', plum: '#4a3a6b', white: '#ffffff', cream: '#fff6e0', cloudSh: '#c9c3e6', metal: '#8a94b8',
  sky: '#7fd0ff', skyPale: '#d8f3ff', mint: '#9be8c4', leaf: '#4cc46a', leafDk: '#2f8f5a', teal: '#3fb8b0',
  sun: '#ffd93b', gold: '#f5a623', orange: '#ff8a3d', red: '#ff4f5e', redDk: '#c22d4f', purple: '#9b6bff',
  lilac: '#c8b2ff', blue: '#3f7bff', blueDk: '#2a4fb8', wood: '#b9774a', bullet: '#ff5aa8' };
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const tint = (h, t) => mix(h, '#ffffff', t);
const soft = (m, t) => m.map(c => mix(c, '#ffffff', t));
// material triples [base, dark, light]
const M = {
  SPRIG: ['#4cc46a', '#2f8f5a', '#c9f7c1'], MARI: ['#ff8a3d', '#d9622a', '#ffe0c4'], WINGG: ['#a8ec8c', '#45a85a', '#ecffe0'],
  LEAF: ['#4cc46a', '#2f8f5a', '#c9f7c1'], BUSH: [tint('#4cc46a', .2), '#2f8f5a', tint('#4cc46a', .65)],
  STORM: ['#b9b3d9', '#8a80b8', '#eeedfa'], BSTORM: ['#8f86b8', '#665c94', '#d9d5ef'], SMOG: ['#9a8fb0', '#6f6488', '#d5cfe3'],
  TIN: ['#6aa0ff', '#2a4fb8', '#d6e6ff'], GOLD: ['#ffd93b', '#f5a623', '#fffbe0'], BERRY: ['#3f7bff', '#2a4fb8', '#d6e6ff'],
  GRAPE: ['#9b6bff', '#6b44c9', '#e4d8ff'], STRAW: ['#ff4f5e', '#c22d4f', '#ffd0d5'], KIWI: ['#8fd14f', '#5a9a2c', '#e6f7c8'],
  PEACH: ['#ffb38a', '#f07f5a', '#ffe2cf'], MINT: ['#9be8c4', '#3fb8b0', '#e3fbf1'], CLOCK: ['#ff6b6b', '#c22d4f', '#ffd6d6'],
  METAL: ['#8a94b8', '#4a3a6b', '#dfe3f5'], PLUM: ['#4a3a6b', '#2b2140', '#8a7ab0'], CREAM: ['#fff6e0', '#c9c3e6', '#ffffff'],
  WOOD: ['#b9774a', '#8a5530', '#ecc7a2'], TEAL: ['#3fb8b0', '#24857f', '#c4f2ec'], LILAC: ['#c8b2ff', '#9b6bff', '#f1eaff'],
  WHITE: ['#ffffff', '#c9c3e6', '#ffffff'], APRI: ['#ffd99a', '#f0a24a', '#fff4dc'], BRICK: ['#c8604f', '#8a3a33', '#f2c0b0'],
  SUN: ['#ffd93b', '#f5a623', '#fffbe0'], BLUEDK: ['#2a4fb8', '#1c3480', '#7f9cf0']
};
const FONT = '"Arial Rounded MT Bold", ui-rounded, "Varela Round", "Trebuchet MS", system-ui, sans-serif';
const font = s => 'bold ' + s + 'px ' + FONT;
let R = 2, TR = 2, FLASH = false;
const PAD = 3;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;   // net-fed keys never reach the prototype
const clock = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

/* ---------- sprite helpers ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
function sprite(w, h, draw, sc) {
  sc = sc || R; const c = canvas((w + PAD * 2) * sc, (h + PAD * 2) * sc); c.lw = c.width / sc; c.lh = c.height / sc;
  const g = c.getContext('2d'); g.scale(sc, sc); g.translate(PAD, PAD); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); return c;
}
function flashOf(w, h, draw) { FLASH = true; try { return sprite(w, h, draw); } finally { FLASH = false; } }
function put(ctx, c, x, y) { ctx.drawImage(c, Math.round((x - c.lw / 2) * R) / R, Math.round((y - c.lh / 2) * R) / R, c.lw, c.lh); }
function putS(ctx, c, x, y, sx, sy, rot) { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sx, sy == null ? sx : sy); ctx.drawImage(c, -c.lw / 2, -c.lh / 2, c.lw, c.lh); ctx.restore(); }
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
const E = (cx, cy, rx, ry, rot) => g => g.ellipse(cx, cy, rx, ry, rot || 0, 0, TAU);
const C = (cx, cy, r) => g => g.arc(cx, cy, r, 0, TAU);
const RR = (x, y, w, h, r) => g => rrect(g, x, y, w, h, r);
const POLY = pts => g => { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
const LEAF = (cx, cy, l, w, rot) => g => {
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0), p = (x, y) => [cx + x * c - y * s, cy + x * s + y * c];
  const a = p(-l, 0), b = p(l, 0), u = p(0, -w * 1.9), d = p(0, w * 1.9);
  g.moveTo(a[0], a[1]); g.quadraticCurveTo(u[0], u[1], b[0], b[1]); g.quadraticCurveTo(d[0], d[1], a[0], a[1]); g.closePath();
};
const STAR = (cx, cy, r, ri, n, rot) => g => { for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, q = i & 1 ? ri : r; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); };
const HEARTP = (cx, cy, s) => g => { g.moveTo(cx, cy + 3 * s); g.bezierCurveTo(cx - 5 * s, cy - .5 * s, cx - 2.5 * s, cy - 4 * s, cx, cy - 1.5 * s); g.bezierCurveTo(cx + 2.5 * s, cy - 4 * s, cx + 5 * s, cy - .5 * s, cx, cy + 3 * s); g.closePath(); };
const PEACHP = g => { g.moveTo(9, 16); g.bezierCurveTo(1, 10, 3, 3, 9, 6.5); g.bezierCurveTo(15, 3, 17, 10, 9, 16); g.closePath(); };
// a part: material m, path, r (shade size), optional highlight centre
const P = (m, path, r, cx, cy) => ({ base: m[0], dark: m[1], lite: m[2], path, r: r || 4, cx, cy, hl: cx != null });
function outlined(g, parts, w) {
  w = w || 2; g.fillStyle = g.strokeStyle = PAL.ink; g.lineWidth = w * 2;
  for (const p of parts) { g.beginPath(); p.path(g); g.fill(); g.stroke(); }
  for (const p of parts) shade(g, p);
}
function shade(g, p) {
  g.save(); g.beginPath(); p.path(g); g.clip();
  if (FLASH) { g.fillStyle = '#fff'; g.fill(); g.restore(); return; }
  g.fillStyle = p.dark; g.fill();
  const k = p.r * 0.22; g.translate(-k, -k); g.beginPath(); p.path(g); g.fillStyle = p.base; g.fill(); g.translate(k, k);
  if (p.hl && p.lite) {
    g.fillStyle = p.lite;
    g.beginPath(); g.ellipse(p.cx - p.r * .38, p.cy - p.r * .42, p.r * .34, p.r * .18, -0.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(p.cx - p.r * .05, p.cy - p.r * .62, Math.max(.6, p.r * .07), 0, TAU); g.fill();
  }
  g.restore();
}
function lid(g, x, y, w, h, s, k, col, lw) {
  const yo = y - h * (.1 + .25 * k), yi = y - h * (.1 - .25 * k), yl = s < 0 ? yo : yi, yr = s < 0 ? yi : yo;
  g.save(); g.beginPath(); g.ellipse(x, y, w / 2 + .6, h / 2 + .6, 0, 0, TAU); g.clip();
  g.fillStyle = col; g.beginPath(); g.moveTo(x - w, y - h); g.lineTo(x + w, y - h); g.lineTo(x + w, yr); g.lineTo(x - w, yl); g.closePath(); g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = PAL.ink; g.beginPath(); g.moveTo(x - w, yl); g.lineTo(x + w, yr); g.stroke(); }
  g.restore();
}
// cartoon eye. mood: open (default), grumpy (lid colour o.lid, slant o.k), arc (happy closed), led, ledarc, dizzy
function eye(g, x, y, h, o) {
  o = o || {}; const w = h * .72, m = o.mood || 'open';
  g.save(); g.strokeStyle = PAL.ink; g.lineCap = 'round';
  if (m === 'arc' || m === 'ledarc') {
    g.lineWidth = Math.max(1.1, h * (m === 'ledarc' ? .2 : .17)); if (m === 'ledarc') g.strokeStyle = PAL.sun;
    g.beginPath(); g.arc(x, y + h * .2, w * .58, PI * 1.12, PI * 1.88); g.stroke(); g.restore(); return;
  }
  if (m === 'led') {
    g.fillStyle = PAL.sun; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - w * .15, y - h * .18, h * .16, 0, TAU); g.fill();
    if (o.k) lid(g, x, y, w, h, o.side || 1, o.k, PAL.ink, 0);
    g.restore(); return;
  }
  g.lineWidth = Math.max(1, h * .1); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); g.fill(); g.stroke();
  if (m === 'dizzy') {
    g.lineWidth = Math.max(.8, h * .1); g.beginPath();
    for (let i = 0; i < 22; i++) { const a = i * .55, q = (i / 22) * w * .42; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q * 1.2); }
    g.stroke(); g.restore(); return;
  }
  const lx = x + (o.look || 0) * w * .14;
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(lx, y + h * .08, w * .34, h * .38, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(lx - w * .13, y - h * .08, Math.max(.75, h * .14), 0, TAU); g.fill();
  g.beginPath(); g.arc(lx + w * .12, y + h * .22, Math.max(.4, h * .06), 0, TAU); g.fill();
  if (m === 'grumpy') lid(g, x, y, w, h, o.side || 1, o.k == null ? 1 : o.k, FLASH ? '#fff' : o.lid, Math.max(1.3, h * .1));
  g.restore();
}
function blush(g, pts, rx, ry) { if (FLASH) return; g.fillStyle = 'rgba(255,150,125,.8)'; for (const [x, y] of pts) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); } }
function mouth(g, x, y, r, kind, lw) { // kind: smile, frown, flat, half
  g.save(); g.strokeStyle = PAL.ink; g.lineWidth = lw || 1; g.lineCap = 'round'; g.beginPath();
  if (kind === 'smile') g.arc(x, y - r * .4, r, .2 * PI, .8 * PI);
  else if (kind === 'frown') g.arc(x, y + r * .9, r, 1.2 * PI, 1.8 * PI);
  else if (kind === 'half') { g.moveTo(x - r, y); g.quadraticCurveTo(x, y + r * .15, x + r, y - r * .5); }
  else { g.moveTo(x - r, y); g.quadraticCurveTo(x - r * .3, y - r * .3, x, y); g.quadraticCurveTo(x + r * .3, y + r * .3, x + r, y); }
  g.stroke(); g.restore();
}
function flower(g, x, y, s, petal, centre, stem) { // little flower that "pokes out" (un-grumping)
  if (stem) { g.strokeStyle = PAL.ink; g.lineWidth = 2.6 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + stem); g.stroke(); g.strokeStyle = PAL.leaf; g.lineWidth = 1.2 * s; g.stroke(); outlined(g, [P(M.LEAF, LEAF(x + 2.4 * s, y + stem * .6, 2.2 * s, 1 * s, -.5), 2)], .8 * s); }
  const parts = [];
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - PI / 2; parts.push(P(petal || M.SUN, C(x + Math.cos(a) * 2 * s, y + Math.sin(a) * 2 * s, 1.5 * s), 1.5 * s)); }
  parts.push(P(centre || M.WOOD, C(x, y, 1.2 * s), 1.2 * s));
  outlined(g, parts, .8 * s);
}
function starPath(g, x, y, r, ri, n, rot) { g.beginPath(); STAR(x, y, r, ri, n, rot)(g); }

/* ---------- heroes ---------- */
function drawSprout(g, who, f, face) {
  const s = [1, .55, .15, .55][f], body = who ? M.MARI : M.SPRIG;
  // root tuft
  const tuft = () => { g.beginPath(); g.moveTo(10.3, 21.6); g.lineTo(9.2, 24.6); g.moveTo(12, 22.2); g.lineTo(12, 25.4); g.moveTo(13.7, 21.6); g.lineTo(14.8, 24.6); g.stroke(); };
  g.strokeStyle = PAL.ink; g.lineWidth = 3; tuft(); g.strokeStyle = FLASH ? '#fff' : PAL.wood; g.lineWidth = 1.3; tuft();
  // wings: their own outline so they read against the body
  if (!who) outlined(g, [P(M.WINGG, LEAF(3.2, 15.6, 5, 2.2, -.55), 3), P(M.WINGG, LEAF(20.8, 15.6, 5, 2.2, .55), 3)]);
  else outlined(g, [P(M.SUN, E(3.4, 15.6, 4.4, 2.7, -.5), 3), P(M.SUN, E(20.6, 15.6, 4.4, 2.7, .5), 3)]);
  if (!FLASH) { g.strokeStyle = who ? M.SUN[1] : M.WINGG[1]; g.lineWidth = .7; g.beginPath(); g.moveTo(-.6, 17.8); g.lineTo(5.4, 14.4); g.moveTo(24.6, 17.8); g.lineTo(18.6, 14.4); g.stroke(); }
  const parts = who
    ? [P(M.SUN, E(12 - 4.4 * s, 4, 4.4 * s + .8, 2.4), 3), P(M.SUN, E(12 + 4.4 * s, 4, 4.4 * s + .8, 2.4), 3), P(M.WOOD, RR(11, 4, 2, 4, 1), 1)]
    : [P(M.LEAF, LEAF(12 - 4.6 * s, 4, 4.6 * s + .9, 1.15), 3), P(M.LEAF, LEAF(12 + 4.6 * s, 4, 4.6 * s + .9, 1.15), 3), P(M.LEAF, RR(11, 4, 2, 4, 1), 1)];
  parts.push(P(body, E(12, 14.5, 8.8, 8), 8.5, 12, 14.5));
  if (who) { for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - PI / 2; parts.push(P(M.CREAM, C(18.6 + Math.cos(a) * 1.7, 8.4 + Math.sin(a) * 1.7, 1.25), 1)); } parts.push(P(M.GOLD, C(18.6, 8.4, .95), 1)); }
  outlined(g, parts);
  const mood = face === 'dizzy' ? 'dizzy' : 'open';
  eye(g, 9.2, 13.6, 6.4, { mood }); eye(g, 14.8, 13.6, 6.4, { mood });
  blush(g, [[6.3, 17.4], [17.7, 17.4]], 1.7, 1.05);
  if (face === 'dizzy') mouth(g, 12, 18.4, 1.3, 'flat', 1); else mouth(g, 12, 17.6, 1.6, 'smile', 1);
}
function drawBuddy(g, who, f) {
  const r = f ? -.2 : -.5;
  outlined(g, [who ? P(M.SUN, E(9.6, 2.8, 2.6, 1.5, r), 2) : P(M.LEAF, LEAF(9.6, 2.7, 2.7, 1, r), 2), P(M.LEAF, RR(6.5, 2.6, 1.2, 2.6, .5), 1),
    P(who ? M.APRI : M.MINT, E(7, 8, 5, 4.6), 4.8, 7, 8)], 1.5);
  eye(g, 5.3, 7.6, 3.3); eye(g, 8.7, 7.6, 3.3);
  mouth(g, 7, 10.2, .9, 'smile', .7);
}
function drawDandelion(g) { // the downed sprout's parachute: a dandelion seed clock (hub at 12,14)
  const tips = []; for (let i = 0; i < 19; i++) { const a = PI - .25 + i * (PI + .5) / 18; tips.push([12 + Math.cos(a) * 10.5, 14 + Math.sin(a) * (8.5 + Math.sin(i * 1.7) * .6)]); }
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(74,58,107,.75)'; g.lineWidth = .55; g.beginPath(); for (const [x, y] of tips) { g.moveTo(12, 14); g.lineTo(x, y); } g.stroke();
  g.strokeStyle = 'rgba(74,58,107,.55)'; g.lineWidth = .45; g.beginPath();
  for (const [x, y] of tips) { const a = Math.atan2(y - 14, x - 12); for (const d of [-.7, .7]) { g.moveTo(x, y); g.lineTo(x + Math.cos(a + d) * 2.4, y + Math.sin(a + d) * 2.4); } } g.stroke();
  for (const [x, y] of tips) { g.fillStyle = PAL.cloudSh; g.beginPath(); g.arc(x + .3, y + .4, 1.45, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 1.3, 0, TAU); g.fill(); }
  g.strokeStyle = PAL.ink; g.lineWidth = 1.8; g.beginPath(); g.moveTo(12, 14); g.lineTo(12, 19.5); g.stroke(); g.strokeStyle = PAL.wood; g.lineWidth = .8; g.stroke();
  outlined(g, [P(M.WOOD, E(12, 14.2, 1.3, 1), 1)], .8);
}
/* ---------- shots, bullets ---------- */
function drawShot(g, who) {
  g.fillStyle = PAL.ink; g.beginPath(); rrect(g, 0, 0, 6, 12, 3); g.fill();
  g.fillStyle = PAL.cream; g.beginPath(); rrect(g, 1.1, 1.1, 3.8, 9.8, 1.9); g.fill();
  g.fillStyle = who ? '#ffb27a' : '#9ef0a0'; g.beginPath(); rrect(g, 1.1, 1.1, 3.8, 3.6, 1.9); g.fill();
  g.fillStyle = '#fff'; g.fillRect(2, 5, 1, 4);
}
function drawBShot(g) { g.fillStyle = PAL.ink; g.beginPath(); rrect(g, 0, 0, 4, 8, 2); g.fill(); g.fillStyle = PAL.mint; g.beginPath(); rrect(g, .9, .9, 2.2, 6.2, 1.1); g.fill(); g.fillStyle = '#fff'; g.fillRect(1.5, 2, .8, 2.5); }
function drawSeedlet(g) { outlined(g, [P(M.LEAF, LEAF(9.2, 2.6, 2.6, 1, -.6), 2), P(M.GOLD, C(7, 8, 4.5), 4.5, 7, 8)], 1.5); mouth(g, 7, 9.2, 1.2, 'smile', .7); }
function drawSunRays(g) {
  const parts = []; for (let i = 0; i < 8; i++) { const a = i * TAU / 8, c = Math.cos(a), s = Math.sin(a), q = Math.cos(a + PI / 2), w = Math.sin(a + PI / 2);
    parts.push(P(M.SUN, POLY([13 + c * 13, 13 + s * 13, 13 + c * 7.5 + q * 2.6, 13 + s * 7.5 + w * 2.6, 13 + c * 7.5 - q * 2.6, 13 + s * 7.5 - w * 2.6]), 2)); }
  outlined(g, parts, 1.5);
}
function drawSunFace(g) { outlined(g, [P(M.GOLD, C(13, 13, 8), 8, 13, 13)], 1.5); eye(g, 10.4, 12.4, 4.4, { mood: 'arc' }); eye(g, 15.6, 12.4, 4.4, { mood: 'arc' }); blush(g, [[8.6, 15], [17.4, 15]], 1.4, .9); mouth(g, 13, 16, 1.6, 'smile', 1); }
function drawBullet(g, big, f) {
  const c = big ? 6.5 : 5, r = big ? (f ? 4.6 : 4.2) : (f ? 3 : 2.6), ring = big ? 2.1 : 1.7;
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(c, c, r + ring, 0, TAU); g.fill();
  g.fillStyle = PAL.bullet; g.beginPath(); g.arc(c, c, r, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(c, c, r * .45, 0, TAU); g.fill();
}
/* ---------- fruit (no faces: gloss, sparkle, squash) ---------- */
function drawFruit(g, k) {
  if (k === 0) { outlined(g, [P(M.WOOD, RR(8.4, 2.4, 1.3, 3, .6), 1), P(M.LEAF, LEAF(12.2, 3.6, 3, 1.25, -.5), 2), P(M.GOLD, E(9, 10.2, 6.5, 6.2), 6.3, 9, 10.2)], 1.5);
    if (!FLASH) { g.fillStyle = '#fff3b8'; for (const [x, y] of [[11.6, 9.6], [8.4, 13.4], [12.2, 13]]) { g.beginPath(); g.arc(x, y, .55, 0, TAU); g.fill(); } } }
  else if (k === 1) { outlined(g, [P(M.BERRY, E(9, 10.4, 6.5, 6.1), 6.3, 9, 10.4), P(M.BLUEDK, STAR(9, 4.9, 3, 1.25, 5, -PI / 2), 2)], 1.5);
    if (!FLASH) { g.fillStyle = 'rgba(214,230,255,.45)'; g.beginPath(); g.ellipse(11.5, 13, 2, 1.2, -.5, 0, TAU); g.fill(); } }
  else if (k === 2) { const gp = [[4, 7.6], [9, 7.6], [14, 7.6], [6.5, 11.7], [11.5, 11.7], [9, 15.5]];
    outlined(g, [P(M.WOOD, RR(8.4, 1.4, 1.4, 3.4, .6), 1), P(M.LEAF, LEAF(12.4, 3, 2.7, 1.2, -.4), 2)].concat(gp.map(([x, y]) => P(M.GRAPE, C(x, y, 2.85), 2.85, x, y))), 1.5); }
  else if (k === 3) { const sp = g2 => { g2.moveTo(9, 17); g2.bezierCurveTo(1, 12, 2, 4, 9, 5); g2.bezierCurveTo(16, 4, 17, 12, 9, 17); g2.closePath(); };
    outlined(g, [P(M.STRAW, sp, 6.5, 9, 10), P(M.LEAF, LEAF(6.6, 4.6, 2.5, 1, -.6), 2), P(M.LEAF, LEAF(11.4, 4.6, 2.5, 1, .6), 2), P(M.LEAF, LEAF(9, 3.6, 2.4, 1, PI / 2), 2)], 1.5);
    if (!FLASH) { g.fillStyle = '#fff3c4'; for (const [x, y] of [[6, 9], [12, 9], [9, 11.3], [7, 13.3], [11, 13.3], [9, 7.8]]) { g.beginPath(); g.ellipse(x, y, .45, .7, 0, 0, TAU); g.fill(); } } }
  else if (k === 4) { outlined(g, [P(M.WOOD, C(9, 9, 7.2), 6)], 1.5);
    if (!FLASH) {
      g.fillStyle = '#8fd14f'; g.beginPath(); g.arc(9, 9, 5.9, 0, TAU); g.fill(); g.fillStyle = '#b6e57e'; g.beginPath(); g.arc(9, 9, 4.3, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .5; g.beginPath(); for (let i = 0; i < 12; i++) { const a = i * TAU / 12; g.moveTo(9 + Math.cos(a) * 2.4, 9 + Math.sin(a) * 2.4); g.lineTo(9 + Math.cos(a) * 5.4, 9 + Math.sin(a) * 5.4); } g.stroke();
      g.fillStyle = PAL.cream; g.beginPath(); g.ellipse(9, 9, 2.3, 2, 0, 0, TAU); g.fill();
      g.fillStyle = PAL.ink; for (let i = 0; i < 9; i++) { const a = i * TAU / 9 + .2; g.beginPath(); g.ellipse(9 + Math.cos(a) * 3.4, 9 + Math.sin(a) * 3.4, .45, .75, a, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(5.8, 5.6, 1.8, .9, -.7, 0, TAU); g.fill();
    } }
  else { outlined(g, [P(M.LEAF, LEAF(11.6, 4.2, 2.7, 1.15, -.5), 2), P(M.PEACH, PEACHP, 6.5, 9, 10)], 1.5);
    if (!FLASH && k === 6) {
      g.save(); g.beginPath(); PEACHP(g); g.clip(); g.globalAlpha = .85;
      ['#ff4f5e', '#ff8a3d', '#ffd93b', '#4cc46a', '#3f7bff'].forEach((c, i) => { g.fillStyle = c; g.fillRect(0, 4.4 + i * 2.4, 18, 2.5); });
      g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.4; g.beginPath(); PEACHP(g); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(5.6, 8.4, 1.6, .9, -.7, 0, TAU); g.fill(); g.restore();
    }
    if (!FLASH) { g.fillStyle = '#fff'; g.strokeStyle = PAL.ink; g.lineWidth = .8; g.beginPath(); STAR(15.4, 4.6, 2.4, .7, 4, 0)(g); g.stroke(); g.fill(); } }
}
/* ---------- the berry bush (fruit container) and the gift box ---------- */
function drawBush(g) {
  g.strokeStyle = PAL.ink; g.lineWidth = .9;
  g.beginPath(); g.moveTo(5.5, 10); g.lineTo(10, 17); g.moveTo(15, 8.6); g.lineTo(15, 15); g.moveTo(24.5, 10); g.lineTo(20, 17); g.stroke();
  outlined(g, [P(M.LEAF, g2 => { g2.moveTo(3.4, 10.4); g2.quadraticCurveTo(15, -4, 26.6, 10.4); g2.quadraticCurveTo(15, 6.4, 3.4, 10.4); g2.closePath(); }, 5, 15, 6)], 1.4);
  if (!FLASH) { g.strokeStyle = M.LEAF[1]; g.lineWidth = .7; g.beginPath(); g.moveTo(15, 3.4); g.lineTo(15, 8); g.moveTo(9, 7); g.lineTo(11.5, 8.4); g.moveTo(21, 7); g.lineTo(18.5, 8.4); g.stroke(); }
  const puffs = [[8.5, 25, 6], [15, 20.6, 7], [21.5, 25, 6], [15, 28, 6.6], [10.6, 30, 4.4], [19.4, 30, 4.4]];
  outlined(g, puffs.map(([x, y, r]) => P(M.BUSH, C(x, y, r), r, x, y)), 1.5);
  if (!FLASH) {
    g.strokeStyle = M.BUSH[1]; g.lineWidth = .8; g.beginPath();
    for (const [x, y, a] of [[7, 22, -.6], [12.5, 18.2, -.3], [20, 19.5, .4], [23, 27, .9], [6.4, 28, 2.4], [16.5, 31.5, 1.6], [13, 25.5, .2]]) { g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 2, y + Math.sin(a) * 2); }
    g.stroke();
  }
  outlined(g, [[10.6, 24, 2.4], [18.8, 22.6, 2.4], [15.4, 28.6, 2.4]].map(([x, y, r]) => P(M.GOLD, C(x, y, r), r, x, y)), 1);
}
function drawPresent(g) {
  outlined(g, [P(M.SUN, E(8, 5.6, 3.6, 2.3, -.4), 2), P(M.SUN, E(14, 5.6, 3.6, 2.3, .4), 2), P(M.LILAC, RR(3, 9, 16, 11, 2), 6, 11, 14), P(M.LILAC, RR(2, 7, 18, 4, 1.5), 3, 11, 9)]);
  if (FLASH) return;
  g.fillStyle = PAL.sun; g.fillRect(9.5, 7, 3, 13); g.fillRect(3, 13, 16, 2.6);
  g.fillStyle = PAL.gold; g.fillRect(11.6, 7, .9, 13); g.fillRect(3, 14.8, 16, .8);
  outlined(g, [P(M.GOLD, C(11, 7, 1.7), 1.7)], 1);
  g.fillStyle = '#fff'; g.beginPath(); STAR(5.6, 17.4, 1.6, .5, 4, 0)(g); g.fill();
}
/* ---------- enemies (all grumpy toys, clouds and smog; never animals) ---------- */
function drawSmudge(g, look, f) {
  const k = f ? 1.07 : 1, m = look === 3 ? M.WHITE : M.SMOG;
  outlined(g, [[5, 9.5, 4.2], [9, 6.5, 4.6], [13, 9.5, 3.8], [9, 11, 4]].map(([x, y, r]) => P(m, C(x, y, r * k), r, x, y)));
  if (look === 3) { eye(g, 7, 8.8, 3.6, { mood: 'arc' }); eye(g, 11, 8.8, 3.6, { mood: 'arc' }); mouth(g, 9, 11.8, 1.2, 'smile', .9); return; }
  eye(g, 7, 8.8, 3.9, { mood: 'grumpy', lid: m[0], side: -1 }); eye(g, 11, 8.8, 3.9, { mood: 'grumpy', lid: m[0], side: 1 });
  mouth(g, 9, 12.2, 1.3, 'frown', .9);
}
function drawGlider(g, look) { // a toy paper plane, nose down: white paper, ruled lines, centre fold, blue tip, stamp
  const body = POLY([10, 18, 19.5, 2, 10, 6, .5, 2]);
  outlined(g, [{ base: '#ffffff', dark: '#dcdaf0', path: body, r: 2 }]);
  if (FLASH) return;
  g.save(); g.beginPath(); body(g); g.clip();
  g.fillStyle = '#eceaf8'; g.beginPath(); g.moveTo(10, 18); g.lineTo(.5, 2); g.lineTo(10, 6); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(127,208,255,.9)'; g.lineWidth = .6; g.beginPath(); g.moveTo(0, 6.2); g.lineTo(20, 6.2); g.moveTo(0, 9.6); g.lineTo(20, 9.6); g.stroke();
  g.fillStyle = PAL.blue; g.beginPath(); g.moveTo(10, 18); g.lineTo(13.2, 12.6); g.lineTo(6.8, 12.6); g.closePath(); g.fill();
  g.fillStyle = '#9ac0ff'; g.beginPath(); g.moveTo(10, 18); g.lineTo(13.2, 12.6); g.lineTo(10, 12.6); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = PAL.ink; g.lineWidth = .9; g.beginPath(); g.moveTo(10, 6); g.lineTo(10, 18); g.stroke();
  g.fillStyle = PAL.ink; g.fillRect(14, 3.2, 3.6, 3.4); g.fillStyle = PAL.sun; g.fillRect(14.5, 3.7, 2.6, 2.4); g.fillStyle = PAL.purple; g.beginPath(); g.arc(15.8, 4.9, .7, 0, TAU); g.fill();
  if (look === 3) { eye(g, 7.6, 9, 3.2, { mood: 'arc' }); eye(g, 12.4, 9, 3.2, { mood: 'arc' }); return; }
  eye(g, 7.6, 9, 3.6, { mood: 'grumpy', lid: '#eceaf8', side: -1 }); eye(g, 12.4, 9, 3.6, { mood: 'grumpy', lid: '#ffffff', side: 1 });
}
function drawTinBot(g, look, f) { // look 1: arm raised, 3: happy (key stopped)
  const tin = M.TIN, keyW = [1, .5, .12, .5][f], parts = [
    P(M.METAL, RR(20, 16, 4, 2.4, 1), 2), P(M.GOLD, E(25, 14.2, 2.2 * keyW + .6, 2.4), 2), P(M.GOLD, E(25, 20.2, 2.2 * keyW + .6, 2.4), 2),
    P(M.PLUM, RR(6, 25, 5, 3.5, 1.5), 2), P(M.PLUM, RR(13, 25, 5, 3.5, 1.5), 2), P(tin, RR(5, 14.5, 14, 11, 2.5), 6, 12, 20),
    P(M.CLOCK, C(12, 3.2, 1.9), 1.9, 12, 3.2), P(M.METAL, RR(11.4, 3.5, 1.2, 3.5, .5), 1), P(tin, RR(2.5, 6, 19, 10, 4), 8, 12, 11)];
  if (look === 1) parts.unshift(P(M.METAL, RR(.6, 9, 3, 7, 1.2), 2), P(M.GOLD, C(2, 8.2, 2.3), 2.2, 2, 8.2));
  else parts.unshift(P(M.METAL, RR(1.6, 15.5, 3, 6, 1.2), 2));
  outlined(g, parts);
  g.fillStyle = PAL.ink; g.beginPath(); rrect(g, 5, 8.2, 14, 6, 3); g.fill();
  if (look === 3) { eye(g, 9, 11.4, 4, { mood: 'ledarc' }); eye(g, 15, 11.4, 4, { mood: 'ledarc' }); }
  else { eye(g, 9, 11.2, 4.2, { mood: 'led', k: .8, side: -1 }); eye(g, 15, 11.2, 4.2, { mood: 'led', k: .8, side: 1 }); }
  g.fillStyle = FLASH ? '#fff' : PAL.cream; g.strokeStyle = PAL.ink; g.lineWidth = 1; g.beginPath(); g.arc(12, 20.4, 2.6, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = PAL.red; g.beginPath(); g.moveTo(12, 20.4); g.lineTo(12 + 1.8 * Math.cos(f * 1.4), 20.4 - 1.8 * Math.abs(Math.sin(f * 1.4 + .5))); g.stroke();
  g.fillStyle = '#d6e6ff'; for (const [x, y] of [[7, 16.5], [17, 16.5], [7, 23.5], [17, 23.5]]) { g.beginPath(); g.arc(x, y, .7, 0, TAU); g.fill(); }
}
const GRUMP_PUFFS = [[8, 14, 6], [15, 9.5, 7.5], [22, 13, 6], [15, 15.5, 7], [4.5, 16.5, 4], [26, 16.5, 3.5]];
const BOLT = (ox, oy, s) => g => { const p = [15, 18, 12, 23, 15, 22.5, 13, 26, 18.5, 21, 15.5, 21.4, 17.5, 18]; g.moveTo(ox + p[0] * s, oy + p[1] * s); for (let i = 2; i < p.length; i += 2) g.lineTo(ox + p[i] * s, oy + p[i + 1] * s); g.closePath(); };
function drawGrumble(g, look, f, small) {
  const c = small ? ['#a49cc9', '#776da8', '#e6e3f6'] : M.STORM, k = f && look === 0 ? 1.04 : 1;
  if (look === 3) { // calm: white, no ink, happy
    g.globalAlpha = 1; for (const [x, y, r] of GRUMP_PUFFS) { g.fillStyle = PAL.cloudSh; g.beginPath(); g.arc(x + .8, y + 1.2, r, 0, TAU); g.fill(); }
    for (const [x, y, r] of GRUMP_PUFFS) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
    eye(g, 11.8, 12.6, 5, { mood: 'arc' }); eye(g, 18.2, 12.6, 5, { mood: 'arc' }); blush(g, [[9, 16], [21, 16]], 1.6, 1); mouth(g, 15, 17.4, 1.8, 'smile', 1); return;
  }
  const parts = [];
  if (look === 1 && !f) parts.push(P(M.SUN, BOLT(0, 0, 1), 3));
  for (const [x, y, r] of GRUMP_PUFFS) parts.push(P(c, C(x, y, r * k), r, x, y));
  outlined(g, parts);
  eye(g, 11.8, 12.6, 6, { mood: 'grumpy', lid: c[0], side: -1 }); eye(g, 18.2, 12.6, 6, { mood: 'grumpy', lid: c[0], side: 1 });
  mouth(g, 15, 18.4, 2, 'frown', 1.1);
}
function drawTwirlie(g, look, f) {
  const body = E(11, 11, 9.5, 6);
  outlined(g, [P(M.CLOCK, RR(10, 1, 2, 5, 1), 1), P(M.WOOD, POLY([7, 14, 15, 14, 11, 22.5]), 3), P(M.TEAL, body, 7, 11, 10)]);
  if (!FLASH) { g.save(); g.beginPath(); body(g); g.clip(); g.fillStyle = PAL.sun; const o = (f % 4) * 3;
    for (let i = -2; i < 4; i++) { const x = i * 6 + o; g.beginPath(); g.moveTo(x, 4); g.lineTo(x + 2.6, 4); g.lineTo(x + 4.4, 18); g.lineTo(x + 1.8, 18); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(7, 7.4, 3.4, 1.4, -.3, 0, TAU); g.fill(); g.restore(); }
  if (look === 3) { eye(g, 8.5, 10, 3.8, { mood: 'arc' }); eye(g, 13.5, 10, 3.8, { mood: 'arc' }); mouth(g, 11, 13, 1.1, 'smile', .9); return; }
  eye(g, 8.5, 10, 4.2, { mood: 'grumpy', lid: M.TEAL[0], side: -1 }); eye(g, 13.5, 10, 4.2, { mood: 'grumpy', lid: M.TEAL[0], side: 1 });
  mouth(g, 11, 13.6, 1.1, 'frown', .9);
}
function drawBoinger(g, look) { // jack-in-the-box: 0 shut (eyes peeking), 1 sprung, 3 sprung and happy
  const box = [P(M.STRAW, RR(3, 15, 18, 12, 2), 6, 12, 20)];
  if (look === 0) {
    outlined(g, box.concat([P(M.GRAPE, RR(2, 10.6, 20, 4, 1.5), 3, 12, 12)]));
    g.fillStyle = PAL.ink; g.fillRect(4.5, 14.2, 15, 2.6);
    eye(g, 9.6, 15.2, 2.8, { mood: 'grumpy', lid: PAL.ink, side: -1 }); eye(g, 14.4, 15.2, 2.8, { mood: 'grumpy', lid: PAL.ink, side: 1 });
  } else {
    outlined(g, [P(M.GRAPE, RR(-5, 13.5, 9, 3.6, 1.5), 3)].concat(box));
    g.strokeStyle = PAL.ink; g.lineWidth = 2.6; const zz = () => { g.beginPath(); g.moveTo(12, 15); g.lineTo(9.6, 13.8); g.lineTo(14.4, 12.6); g.lineTo(9.6, 11.4); g.lineTo(12, 10.4); g.stroke(); };
    zz(); g.strokeStyle = FLASH ? '#fff' : PAL.metal; g.lineWidth = 1.1; zz();
    outlined(g, [P(M.GRAPE, POLY([7.4, 3.6, 12, -2.2, 16.6, 3.6]), 3), P(M.CREAM, E(12, 6.4, 6, 5.4), 5.6, 12, 6.4)]);
    outlined(g, [P(M.STRAW, C(12, 8.4, 1.5), 1.5, 12, 8.4), P(M.GOLD, C(12, -2.2, 1.2), 1)], 1);
    if (look === 3) { eye(g, 9.8, 5.6, 3.2, { mood: 'arc' }); eye(g, 14.2, 5.6, 3.2, { mood: 'arc' }); blush(g, [[8, 8.6], [16, 8.6]], 1.2, .8); mouth(g, 12, 10, 1.4, 'smile', .9); }
    else { eye(g, 9.8, 5.4, 3.7, { mood: 'grumpy', lid: PAL.cream, side: -1 }); eye(g, 14.2, 5.4, 3.7, { mood: 'grumpy', lid: PAL.cream, side: 1 }); mouth(g, 12, 10.6, 1.3, 'frown', .9); }
  }
  if (!FLASH) { outlined(g, [P(M.SUN, POLY([12, 17.4, 15, 21, 12, 24.6, 9, 21]), 2)], 1); }
}
function drawVent(g, look, f) { // smog vent; look 3 = the cleaned flower pot decal
  const pot = [P(M.METAL, RR(6, 8, 10, 12, 2), 5, 11, 13), P(M.PLUM, RR(4, 6, 14, 4, 1.5), 2)];
  if (look === 3) {
    outlined(g, [P(M.WOOD, RR(6, 8, 10, 12, 2), 5, 11, 13), P(M.BRICK, RR(4, 6, 14, 4, 1.5), 2)]);
    g.strokeStyle = PAL.ink; g.lineWidth = 2.6; g.beginPath(); g.moveTo(11, 6); g.lineTo(11, 1.6); g.stroke(); g.strokeStyle = PAL.leaf; g.lineWidth = 1.2; g.stroke();
    outlined(g, [P(M.LEAF, LEAF(13.6, 3.8, 2.6, 1, -.5), 2), P(M.LEAF, LEAF(8.4, 4.4, 2.4, 1, .5), 2)], 1);
    const pp = []; for (let i = 0; i < 6; i++) { const a = i * TAU / 6; pp.push(P(M.SUN, C(11 + Math.cos(a) * 2.6, -1 + Math.sin(a) * 2.6, 1.9), 1.9)); }
    outlined(g, pp.concat([P(M.GOLD, C(11, -1, 1.9), 1.9, 11, -1)]), 1);
    eye(g, 10.2, -1.2, 1.6, { mood: 'arc' }); eye(g, 11.8, -1.2, 1.6, { mood: 'arc' });
    return;
  }
  const r = look === 1 ? 5 : f ? 4.5 : 3.5;
  const k = r / 3.5; outlined(g, [P(M.SMOG, C(8.4, 4.4, 2.4 * k), 2.4 * k), P(M.SMOG, C(13.4, 3.6, 2.6 * k), 2.6 * k), P(M.SMOG, C(11, 1.8 - (k - 1) * 1.5, 2.9 * k), 2.9 * k, 11, 1.8)].concat(pot));
  if (!FLASH) { g.fillStyle = M.METAL[1]; g.globalAlpha = .45; g.fillRect(6, 17, 10, 2); g.globalAlpha = 1; }
  eye(g, 9, 13, 3.4, { mood: 'grumpy', lid: M.METAL[0], side: -1 }); eye(g, 13, 13, 3.4, { mood: 'grumpy', lid: M.METAL[0], side: 1 });
}
const DOME = (cx, cy, r, rot) => g => { g.ellipse(cx, cy, r, r * .95, rot, PI, TAU); g.closePath(); };   // flat-based bell
function drawTicktock(g, look, f) { // an alarm clock: domed bells on stalks, a clapper post, splayed legs (never a round head with ears)
  const tl = look === 1 ? (f ? .2 : -.2) : 0, bells = [[5.6, 5.4, -.6 + tl], [20.4, 5.4, .6 + tl]];
  g.lineCap = 'round'; for (const [w, c] of [[3, PAL.ink], [1.3, FLASH ? '#fff' : M.METAL[0]]]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(6.6, 6.4); g.lineTo(8.8, 8.8); g.moveTo(19.4, 6.4); g.lineTo(17.2, 8.8); g.stroke(); }
  const parts = [P(M.PLUM, POLY([6.4, 21.6, 9.6, 23.2, 6.4, 27.6, 3, 27.6]), 2), P(M.PLUM, POLY([19.6, 21.6, 16.4, 23.2, 19.6, 27.6, 23, 27.6]), 2),
    P(M.METAL, RR(12.2, 1.6, 1.6, 4.6, .8), 1), P(M.GOLD, C(13, 1.6, 1.5), 1.5)];
  for (const [x, y, r] of bells) parts.push(P(M.METAL, DOME(x, y, 4.2, r), 3.5, x - 1, y - 2), P(M.METAL, C(x + 4.4 * Math.sin(r), y - 4.4 * Math.cos(r), .9), 1));
  parts.push(P(M.CLOCK, C(13, 15, 10), 10, 13, 15));
  outlined(g, parts);
  g.fillStyle = FLASH ? '#fff' : PAL.cream; g.beginPath(); g.arc(13, 15.4, 7, 0, TAU); g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = .9; g.stroke();   // the dial reads even in the hit flash
  if (!FLASH) { g.fillStyle = PAL.plum; for (let i = 0; i < 12; i++) { const a = i * TAU / 12; g.beginPath(); g.arc(13 + Math.cos(a) * 5.8, 15.4 + Math.sin(a) * 5.8, .45, 0, TAU); g.fill(); } }
  g.strokeStyle = PAL.ink; g.lineWidth = 1; g.beginPath(); g.moveTo(13, 17.6); g.lineTo(16.2, 19.2); g.moveTo(13, 17.6); g.lineTo(10.6, 20.4); g.stroke();
  if (look === 3) { eye(g, 10.5, 13.4, 3.8, { mood: 'arc' }); eye(g, 15.5, 13.4, 3.8, { mood: 'arc' }); mouth(g, 13, 16.4, 1.2, 'smile', .9); return; }
  eye(g, 10.5, 13.2, 4.2, { mood: 'grumpy', lid: PAL.cream, side: -1 }); eye(g, 15.5, 13.2, 4.2, { mood: 'grumpy', lid: PAL.cream, side: 1 });
}
// type table: box w,h; looks drawn; frame count per look; frame chooser
const EN = {
  smudge: { w: 18, h: 16, looks: [0, 3], n: l => l ? 1 : 2, draw: drawSmudge },
  glider: { w: 20, h: 20, looks: [0, 3], n: () => 1, draw: drawGlider },
  tinbot: { w: 28, h: 30, looks: [0, 1, 2, 3], n: l => l === 3 ? 1 : 4, fr: (t, l) => (t >> (l === 2 ? 1 : 3)) & 3, draw: drawTinBot },
  grumble: { w: 30, h: 28, looks: [0, 1, 3], n: l => l === 3 ? 1 : 2, fr: (t, l) => l === 1 ? (t >> 2) & 1 : (t >> 4) & 1, draw: (g, l, f) => drawGrumble(g, l, f) },
  grumblet: { w: 24, h: 23, looks: [0, 1, 3], n: l => l === 3 ? 1 : 2, fr: (t, l) => l === 1 ? (t >> 2) & 1 : (t >> 4) & 1, draw: (g, l, f) => { g.scale(.8, .8); drawGrumble(g, l, f, 1); } },
  twirlie: { w: 22, h: 24, looks: [0, 3], n: l => l ? 1 : 4, fr: t => (t >> 2) & 3, draw: drawTwirlie, rot: t => Math.sin(t * .2) * .07 },
  boinger: { w: 24, h: 28, looks: [0, 1, 3], n: () => 1, draw: drawBoinger, sq: (t, l) => l ? 1 + .07 * Math.sin(t * .5) : 1 },
  vent: { w: 22, h: 22, looks: [0, 1, 3], n: l => l ? 1 : 2, fr: t => (t >> 4) & 1, draw: drawVent },
  ticktock: { w: 26, h: 28, looks: [0, 1, 3], n: l => l === 1 ? 2 : 1, fr: t => (t >> 2) & 1, draw: drawTicktock, dx: (t, l) => l === 1 ? ((t >> 1) & 1 ? 1.5 : -1.5) : 0 },
  bush: { w: 30, h: 35, looks: [0], n: () => 1, draw: drawBush, rot: (t, l, fl) => fl ? ((t & 2) ? .09 : -.09) : Math.sin(t * .035) * .05 },
  present: { w: 22, h: 22, looks: [0], n: () => 1, draw: drawPresent, rot: (t, l, fl) => fl ? ((t & 2) ? .08 : -.08) : 0 }
};

/* ---------- bosses, drawn from parts ---------- */
function drawClanky(g, v) {
  const sit = v === 3, dy = sit ? 6 : 0, tin = v ? soft(M.TIN, [0, .15, .24, .3][v]) : M.TIN;
  const parts = sit ? [P(M.PLUM, E(32, 82, 11, 6.5), 5), P(M.PLUM, E(64, 82, 11, 6.5), 5)] : [P(M.PLUM, RR(26, 73, 16, 12, 5), 5), P(M.PLUM, RR(54, 73, 16, 12, 5), 5)];
  parts.push(P(M.METAL, E(8, 32 + dy, 4.5, 8), 4), P(M.METAL, E(88, 32 + dy, 4.5, 8), 4), P(tin, RR(24, 46 + dy, 48, 30, 10), 18, 48, 60 + dy), P(tin, RR(8, 12 + dy, 80, 40, 16), 28, 48, 30 + dy));
  outlined(g, parts, 3);
  g.fillStyle = PAL.ink; g.beginPath(); rrect(g, 17, 19 + dy, 62, 23, 11.5); g.fill();
  if (!FLASH) { g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); rrect(g, 21, 22 + dy, 54, 6, 3); g.fill(); }
  const ey = 30.5 + dy;
  if (v === 3) { eye(g, 36, ey + 1, 11, { mood: 'ledarc' }); eye(g, 60, ey + 1, 11, { mood: 'ledarc' }); }
  else if (v === 2) { eye(g, 36, ey + 1, 11, { mood: 'ledarc' }); eye(g, 60, ey, 13, { mood: 'led', k: .25, side: 1 }); }
  else { const k = v ? .4 : 1; eye(g, 36, ey, 13, { mood: 'led', k, side: -1 }); eye(g, 60, ey, 13, { mood: 'led', k, side: 1 }); }
  mouth(g, 48, 47 + dy, 4, ['frown', 'flat', 'half', 'smile'][v], 1.8);
  if (v === 3 || v === 2) blush(g, [[22, 46 + dy], [74, 46 + dy]], 3.4, 2);
  g.fillStyle = FLASH ? '#fff' : PAL.cream; g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.arc(48, 61 + dy, 8.5, 0, TAU); g.fill(); g.stroke();
  if (!FLASH) { g.fillStyle = PAL.plum; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.beginPath(); g.arc(48 + Math.cos(a) * 6.4, 61 + dy + Math.sin(a) * 6.4, .8, 0, TAU); g.fill(); } }
  g.fillStyle = FLASH ? '#fff' : tin[2]; for (const [x, y] of [[29, 51], [67, 51], [29, 71], [67, 71], [14, 18], [82, 18], [14, 46], [82, 46]]) { g.beginPath(); g.arc(x, y + dy, 1.4, 0, TAU); g.fill(); }
  if (v >= 1) flower(g, 21, 10 + dy, 1.2, M.SUN, M.WOOD, 5);
  if (v >= 2) flower(g, 78, 11 + dy, 1, M.LILAC, M.GOLD, 4);
  if (v === 3) flower(g, 49, 70.5, 1, M.SUN, M.WOOD, 0);
}
function drawClankyKey(g, f) { const k = [1, .55, .15, .55][f]; outlined(g, [P(M.METAL, RR(10, 8, 4, 8, 1.5), 2), P(M.GOLD, E(12 - 5.5 * k, 5, 5.5 * k + 1, 4.6), 4), P(M.GOLD, E(12 + 5.5 * k, 5, 5.5 * k + 1, 4.6), 4)], 2.4); }
function drawClankyArm(g) { outlined(g, [P(M.METAL, RR(0, 4.5, 21, 7, 3.5), 4), P(M.GOLD, C(23, 8, 6.5), 6.5, 23, 8)], 2.6); }
const TP = [[22, 46, 18], [40, 30, 22], [62, 24, 24], [84, 32, 20], [96, 48, 14], [16, 58, 12], [40, 54, 20], [64, 52, 22], [88, 58, 16]];
function drawThunder(g, v) {
  const m = v === 3 ? M.WHITE : v ? soft(M.BSTORM, v === 1 ? .15 : .28) : M.BSTORM;
  outlined(g, TP.map(([x, y, r], i) => P(m, C(x, y, r), r, i < 4 ? x : null, y)), 3);
  if (v >= 1) flower(g, 60, 3, 1.5, v === 3 ? M.SUN : M.LILAC, M.GOLD, 0);
  if (v === 3) { eye(g, 48, 42, 15, { mood: 'arc' }); eye(g, 74, 42, 15, { mood: 'arc' }); blush(g, [[38, 52], [84, 52]], 4, 2.4); mouth(g, 61, 56, 6, 'smile', 2.2); return; }
  g.strokeStyle = PAL.ink; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath();
  if (v === 0) { g.moveTo(38, 26); g.lineTo(55, 31); g.moveTo(67, 31); g.lineTo(84, 26); }
  else if (v === 1) { g.moveTo(39, 28); g.lineTo(55, 29.5); g.moveTo(67, 29.5); g.lineTo(83, 28); }
  else { g.moveTo(68, 29); g.quadraticCurveTo(75, 26, 82, 28); }
  g.stroke();
  if (v === 2) eye(g, 48, 43, 15, { mood: 'arc' }); else eye(g, 48, 42, 18, { mood: 'grumpy', lid: m[0], side: -1, k: v ? .4 : 1 });
  eye(g, 74, 42, 18, { mood: 'grumpy', lid: m[0], side: 1, k: v === 2 ? .2 : v ? .4 : 1 });
  mouth(g, 61, 60, 7, ['frown', 'flat', 'half'][v], 2.2);
  if (v === 2) blush(g, [[38, 53]], 3.4, 2);
}
function drawBolt(g) { outlined(g, [P(M.SUN, BOLT(-8, -16, 1.2), 3)], 1.5); }
function drawSmoggins(g, v) {
  const sit = v === 3, tin = v ? soft(M.TIN, [0, .15, .24, .3][v]) : M.TIN, sm = v ? soft(M.CLOCK, [0, .15, .24, .3][v]) : M.CLOCK;
  // crane arms (polylines)
  const arms = () => { g.beginPath(); g.moveTo(26, 58); g.lineTo(10, 42); g.lineTo(6, 56); g.moveTo(94, 58); g.lineTo(110, 42); g.lineTo(114, 56); };
  g.strokeStyle = PAL.ink; g.lineWidth = 12; arms(); g.stroke(); g.strokeStyle = FLASH ? '#fff' : M.METAL[0]; g.lineWidth = 6; arms(); g.stroke();
  if (!FLASH) { g.strokeStyle = M.METAL[2]; g.lineWidth = 1.6; g.beginPath(); g.moveTo(24, 55); g.lineTo(11, 42); g.moveTo(96, 55); g.lineTo(109, 42); g.stroke(); }
  outlined(g, [P(M.BRICK, RR(52, 0, 16, 32, 3), 6, 60, 12), P(M.PLUM, RR(10, 76, 100, 16, 8), 8), P(tin, RR(20, 44, 80, 36, 8), 24, 60, 58),
    P(M.WOOD, RR(24, 28, 30, 19, 4), 9, 39, 36), P(sm, RR(66, 26, 30, 21, 4), 9, 81, 35)], 3);
  if (!FLASH) {
    g.fillStyle = PAL.ink; g.fillRect(52, 7, 16, 2.4); g.fillRect(52, 17, 16, 2.4);
    g.strokeStyle = M.WOOD[1]; g.lineWidth = 1.2; g.beginPath(); g.moveTo(25, 34.5); g.lineTo(53, 34.5); g.moveTo(25, 40.5); g.lineTo(53, 40.5); g.moveTo(30, 29); g.lineTo(48, 46); g.stroke();
    g.fillStyle = sm[1]; for (let i = 0; i < 3; i++) g.fillRect(71 + i * 8, 31, 4, 11);
    g.fillStyle = M.METAL[0]; g.strokeStyle = PAL.ink; g.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(22 + i * 15.2, 84, 4.4, 0, TAU); g.fill(); g.stroke(); }
    g.fillStyle = tin[2]; for (const [x, y] of [[25, 49], [95, 49], [25, 75], [95, 75]]) { g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill(); }
  }
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(60, 57, 19, 16.5, 0, 0, TAU); g.fill();
  g.fillStyle = FLASH ? '#fff' : M.METAL[0]; g.beginPath(); g.ellipse(60, 57, 17, 14.5, 0, 0, TAU); g.fill();
  g.fillStyle = FLASH ? '#fff' : PAL.cream; g.beginPath(); g.ellipse(60, 57, 14, 11.6, 0, 0, TAU); g.fill();
  g.fillStyle = PAL.ink; g.beginPath(); rrect(g, 47, 49, 26, 10, 5); g.fill();
  if (v === 3) { eye(g, 54, 54.5, 7, { mood: 'ledarc' }); eye(g, 66, 54.5, 7, { mood: 'ledarc' }); }
  else if (v === 2) { eye(g, 54, 54.5, 7, { mood: 'ledarc' }); eye(g, 66, 54, 8, { mood: 'led', k: .25, side: 1 }); }
  else { const k = v ? .4 : 1; eye(g, 54, 54, 8, { mood: 'led', k, side: -1 }); eye(g, 66, 54, 8, { mood: 'led', k, side: 1 }); }
  // mouth grille
  g.save(); g.fillStyle = PAL.ink; g.strokeStyle = PAL.ink; g.lineWidth = 1.2;
  if (v >= 2) { g.lineWidth = 2.2; mouth(g, 60, 63.5, 5, v === 3 ? 'smile' : 'half', 2.2); }
  else { g.beginPath(); rrect(g, 52, 61, 16, 5, 2.5); g.fillStyle = PAL.plum; g.fill(); g.stroke(); g.beginPath(); for (let i = 1; i < 4; i++) { g.moveTo(52 + i * 4, 61); g.lineTo(52 + i * 4, 66); } g.stroke(); if (!v) { g.lineWidth = 1.4; g.beginPath(); g.moveTo(51, 68.5); g.lineTo(53, 67); g.moveTo(69, 68.5); g.lineTo(67, 67); g.stroke(); } }
  g.restore();
  if (v === 3) blush(g, [[50, 62], [70, 62]], 2.4, 1.4);
  if (v >= 1) flower(g, 32, 24, 1.1, M.SUN, M.WOOD, 4);
  if (v >= 2) flower(g, 90, 22, 1, M.LILAC, M.GOLD, 4);
  if (sit) for (const [x, y, s] of [[52, 7, 1.5], [60, 4, 1.7], [68, 7, 1.5]]) {
    g.strokeStyle = PAL.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 2); g.lineTo(60, 14); g.stroke(); g.strokeStyle = PAL.leaf; g.lineWidth = 1.4; g.stroke();
    const pp = []; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; pp.push(P(M.SUN, E(x + Math.cos(a) * 2.6 * s, y + Math.sin(a) * 2.6 * s, 1.7 * s, 1.1 * s, a), 1.5)); }
    outlined(g, pp.concat([P(M.WOOD, C(x, y, 1.6 * s), 1.6 * s, x, y)]), 1);
  }
}
function drawClaw(g, open) { const a = open ? .55 : .12; outlined(g, [P(M.METAL, LEAF(7 - 2.2, 5, 5, 1.6, PI / 2 - a), 3), P(M.METAL, LEAF(7 + 2.2, 5, 5, 1.6, PI / 2 + a), 3), P(M.PLUM, C(7, 1.5, 2.6), 2)], 1.8); }
function drawPuff(g, m) { outlined(g, [P(m, C(6, 6, 5), 5, 6, 6)], 1.5); }

const BOSS = {
  clanky: { w: 96, h: 88, body: drawClanky, parts: { key: [24, 16, f => g => drawClankyKey(g, f), 4], arm: [30, 16, () => drawClankyArm, 1] },
    draw(ctx, x, y, t, a, v, fl) {
      const ox = x - 48, oy = y - 44, sit = v === 3, dy = sit ? 6 : 0;
      put(ctx, part('clanky', 'key', sit ? 0 : (t >> (a === 2 ? 1 : 3)) & 3), x, oy + 5 + dy);
      const sw = Math.sin(t * .06) * .06, arm = part('clanky', 'arm', 0);
      const al = (a === 1 ? 232 : sit ? 140 : 100) * DEG + sw, ar = (a === 1 ? -52 : sit ? 40 : 80) * DEG - sw;
      for (const [px, ang] of [[ox + 9, al], [ox + 87, ar]]) { ctx.save(); ctx.translate(px, oy + 38 + dy); ctx.rotate(ang); ctx.drawImage(arm, -PAD - 2, -PAD - 8, arm.lw, arm.lh); ctx.restore(); }
      bodyAt(ctx, 'clanky', v, x, y, t, fl, 0);
      if (!sit) { const n = t * (a === 2 ? .12 : .045); ctx.strokeStyle = PAL.red; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, oy + 61); ctx.lineTo(x + Math.cos(n) * 6, oy + 61 + Math.sin(n) * 6); ctx.stroke(); }
      else for (let i = 0; i < 3; i++) { const p = ((t + i * 30) % 90) / 90; ctx.globalAlpha = Math.min(1, (1 - p) * 2.5); BB.Art.text(ctx, 'z', x + 30 + p * 14 + i * 3, oy + 12 - p * 26, 8 + i * 2, '#fff'); ctx.globalAlpha = 1; }
    } },
  thunderpuff: { w: 112, h: 80, body: drawThunder, parts: { bolt: [20, 22, () => drawBolt, 1] },
    draw(ctx, x, y, t, a, v, fl) {
      if (v !== 3) { // drizzle (grumpy) or sprinkles (ungrumped)
        ctx.lineCap = 'round';
        for (let i = 0; i < 9; i++) { const dx = -42 + i * 10.5 + ((i * 37) % 7), p = ((t * 1.1 + i * 23) % 40) / 40, py = y + 30 + p * 26;
          ctx.globalAlpha = 1 - p;
          if (v === 2) { ctx.strokeStyle = ['#ffd93b', '#9be8c4', '#c8b2ff', '#7fd0ff'][i & 3]; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + dx, py); ctx.lineTo(x + dx + 1.6, py + 2.6); ctx.stroke(); }
          else { ctx.strokeStyle = '#8fb8e8'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x + dx, py); ctx.lineTo(x + dx - .8, py + 4); ctx.stroke(); }
        }
        ctx.globalAlpha = 1;
      }
      if (a === 1 && (t >> 2) & 1) { const b = part('thunderpuff', 'bolt', 0); put(ctx, b, x - 22, y + 40); put(ctx, b, x + 24, y + 42); }
      bodyAt(ctx, 'thunderpuff', v, x, y, t, fl, Math.sin(t * .09) * .018);
    } },
  smoggins: { w: 120, h: 96, body: drawSmoggins, parts: { claw: [14, 12, o => g => drawClaw(g, o), 2], puff: [12, 12, f => g => drawPuff(g, f ? M.WHITE : M.SMOG), 2] },
    draw(ctx, x, y, t, a, v, fl) {
      const ox = x - 60, oy = y - 48, jig = v === 2 && !fl ? Math.sin(t * .9) * 1.2 : 0;
      if (v !== 3) for (let i = 0; i < 4; i++) { const p = ((t + i * 18) % 72) / 72, pf = part('smoggins', 'puff', v === 2 ? 1 : 0);
        ctx.globalAlpha = Math.min(1, (1 - p) * 1.6); putS(ctx, pf, ox + 60 + Math.sin(p * 5 + i) * 4 + p * 8, oy - 4 - p * 34, .7 + p * (a === 1 ? 1.4 : 1)); }
      ctx.globalAlpha = 1;
      const bob = Math.sin(t * .1) * 2, cl = part('smoggins', 'claw', a === 1 ? 1 : 0);
      put(ctx, cl, ox + 6 + jig, oy + 62 + bob); put(ctx, cl, ox + 114 + jig, oy + 62 - bob);
      bodyAt(ctx, 'smoggins', v, x + jig, y, t, fl, 0);
    } }
};

/* ---------- caches ---------- */
let GC = {}, SC = {}, BG = {}, curStage = -1, Q = [], PRE = null;   // Q: this stage's sprites still to build; PRE: next stage's bg, baked during the tally
const glob = (key, w, h, fn) => GC[key] || (GC[key] = sprite(w, h, fn));
function enemyImg(type, look, f, fl) {
  const D = EN[type], key = type + look + (fl ? 'F' : f);
  return SC[key] || (SC[key] = fl ? flashOf(D.w, D.h, g => D.draw(g, look, 0)) : sprite(D.w, D.h, g => D.draw(g, look, f)));
}
function bossBody(type, v) { const B = BOSS[type], key = 'B' + type + v; return SC[key] || (SC[key] = sprite(B.w, B.h, g => B.body(g, v))); }
// bosses never strobe white (a hit lands many times a second): the cue is a 2.5 % squash plus a small twinkle low on the body
function bodyAt(ctx, type, v, x, y, t, fl, s) {
  const q = s + (fl ? .025 : 0), c = bossBody(type, v); if (q) putS(ctx, c, x, y, 1 + q, 1 - q); else put(ctx, c, x, y);
  if (fl) { const B = BOSS[type], k = t >> 2, hx = x + (hash(k, 3) - .5) * B.w * .6, hy = y + B.h * (.1 + hash(k, 5) * .3); twinkle(ctx, hx, hy, 6, t * .3, PAL.sun); twinkle(ctx, hx, hy, 3, t * .3, '#fff'); }
}
function part(type, name, f) { const p = BOSS[type].parts[name], key = 'P' + type + name + f; return SC[key] || (SC[key] = sprite(p[0], p[1], p[2](f))); }
const shipImg = (who, f, face) => glob('ship' + who + f + (face || ''), 24, 26, g => drawSprout(g, who, f, face));
const fruitImg = k => glob('fruit' + k, 18, 18, g => drawFruit(g, k));
const iconImg = k => glob('ico' + k, 10, 10, g => { g.scale(.56, .56); drawFruit(g, k); });
function buildGlobal() {
  for (const who of [0, 1]) { for (let f = 0; f < 4; f++) shipImg(who, f); shipImg(who, 0, 'dizzy'); for (let f = 0; f < 2; f++) glob('bud' + who + f, 14, 14, g => drawBuddy(g, who, f)); glob('shot' + who, 6, 12, g => drawShot(g, who)); }
  glob('bshot', 4, 8, drawBShot); glob('seedlet', 14, 14, drawSeedlet); glob('sunrays', 26, 26, drawSunRays); glob('sunface', 26, 26, drawSunFace); glob('dand', 24, 20, drawDandelion);
  for (const big of [0, 1]) for (const f of [0, 1]) glob('bul' + big + f, big ? 13 : 10, big ? 13 : 10, g => drawBullet(g, big, f));
  for (let k = 0; k < 7; k++) { fruitImg(k); iconImg(k); }
  glob('heart1', 9, 8, g => { g.translate(4.5, 4.2); outlined(g, [P(M.STRAW, HEARTP(0, 0, .9), 3, -1, -1)], .9); });
  glob('heart0', 9, 8, g => { g.translate(4.5, 4.2); g.fillStyle = 'rgba(255,255,255,.28)'; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .8; g.beginPath(); HEARTP(0, 0, .9)(g); g.fill(); g.stroke(); });
}
function stageTypes(st) {
  const S = BB.STAGES && BB.STAGES[st], set = new Set(['bush', 'present', 'vent', 'smudge']);
  if (S) { for (const w of S.waves || []) if (EN[w[1]]) set.add(w[1]); if (S.boss) set.add(S.boss); }
  else set.add(['clanky', 'thunderpuff', 'smoggins'][st]);
  const boss = S ? S.boss : ['clanky', 'thunderpuff', 'smoggins'][st];
  if (boss === 'clanky') set.add('tinbot'); if (boss === 'thunderpuff') set.add('grumblet'); if (boss === 'smoggins') set.add('tinbot');
  return set;
}
// a stage start only swaps in its background (prefetched during the tally when it can be); the sprites are queued and
// pumped a few ms per frame (anything drawn sooner is built on demand). Its one-shot text (banner, tally) goes too.
function buildStage(st) {
  SC = {}; curStage = st; Q = []; TXT = new Map(); txtB = 0;
  if (PRE && PRE.st === st) { for (const [k, fn] of PRE.steps) PRE.B[k] = fn(); BG = PRE.B; } else BG = buildBg(st);
  PRE = null;
  for (const type of stageTypes(st)) {
    const D = own(EN, type), B = own(BOSS, type);
    if (D) for (const l of D.looks) { for (let f = 0; f < D.n(l); f++) Q.push(() => enemyImg(type, l, f)); if (l !== 3) Q.push(() => enemyImg(type, l, 0, 1)); }
    if (B) { for (const n in B.parts) for (let f = 0; f < B.parts[n][3]; f++) Q.push(() => part(type, n, f)); for (let v = 0; v < 4; v++) Q.push(() => bossBody(type, v)); }
  }
}
function pump(ms) { const t0 = clock(); while (Q.length && clock() - t0 < ms) Q.shift()(); }
function prefetch(st) { // tally / title: free the finished stage's sprites (rebuilt on demand if still drawn), then bake the next bg a piece per frame
  if (st === curStage || st > 2 || st < 0 || (BB.STAGES && !BB.STAGES[st])) return;
  if (!PRE || PRE.st !== st) { SC = {}; Q = []; PRE = { st, B: { kind: bgKind(st), st }, steps: bgSteps(st) }; return; }
  const s = PRE.steps.shift(); if (s) PRE.B[s[0]] = s[1]();
}

/* ---------- backgrounds ---------- */
function rng(seed) { return BB.mulberry32 ? BB.mulberry32(seed) : () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
function tile(h, draw, opaque) { const c = canvas(240 * TR, h * TR); c.lw = 240; c.lh = h; const g = c.getContext('2d', { alpha: !opaque }); g.scale(TR, TR); g.lineJoin = g.lineCap = 'round'; draw(g); return c; }
function tileS(w, h, draw) { return sprite(w, h, draw, TR); }
let SOLID = null;   // 1×1 opaque: a full-frame opaque drawImage lets Chrome drop the frame's queued ops (split tiles stalled ~10 ms per wrap)
function scrollTile(ctx, c, s) {
  const TH = c.lh, sc = c.height / TH, y = ((s % TH) + TH) % TH, r0 = (TH - y) % TH, h1 = Math.min(320, TH - r0);
  if (h1 < 320) ctx.drawImage(SOLID || (SOLID = (() => { const k = canvas(1, 1), g = k.getContext('2d', { alpha: false }); g.fillStyle = '#e9f7d9'; g.fillRect(0, 0, 1, 1); return k; })()), 0, 0, 240, 320);
  ctx.drawImage(c, 0, r0 * sc, c.width, h1 * sc, 0, 0, 240, h1 + .3);
  if (h1 < 320) ctx.drawImage(c, 0, 0, c.width, (320 - h1) * sc, 0, h1, 240, 320 - h1);
}
function inst(ctx, img, list, s, L) { for (const [x, y0] of list) { const y = ((y0 + s) % L + L) % L - img.lh; if (y < 320 + img.lh / 2) put(ctx, img, x, y); } }
const bgKind = st => { const S = BB.STAGES && BB.STAGES[st]; return (S && S.bg) || ['meadow', 'sky', 'works'][st] || 'meadow'; };
function blob(g, x, y, r, c) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
function field(g, x, y, w, h, kind, rnd) {
  const base = { pumpkin: tint(PAL.leaf, .55), cabbage: tint(PAL.wood, .62), sunflower: tint(PAL.leaf, .5), lettuce: tint(PAL.leaf, .62), lavender: tint(PAL.lilac, .55), soil: tint(PAL.wood, .6), orchard: tint(PAL.leaf, .58), greenhouse: tint(PAL.leaf, .6), shed: tint(PAL.sun, .7) }[kind];
  g.fillStyle = mix(base, '#6a8a5a', .12); g.beginPath(); rrect(g, x, y, w, h, 7); g.fill();
  g.fillStyle = base; g.beginPath(); rrect(g, x + 1.5, y + 1.5, w - 3, h - 3, 6); g.fill();
  g.save(); g.beginPath(); rrect(g, x + 2, y + 2, w - 4, h - 4, 6); g.clip();
  if (kind === 'pumpkin') for (let ry = y + 9; ry < y + h - 4; ry += 13) { g.fillStyle = tint(PAL.leaf, .38); g.fillRect(x, ry - 1, w, 2); for (let rx = x + 6 + (rnd() * 6 | 0); rx < x + w - 4; rx += 11 + rnd() * 5) { blob(g, rx + 1, ry + 1, 3.6, tint(PAL.orange, .25)); blob(g, rx, ry, 3.4, tint(PAL.orange, .42)); blob(g, rx - 1, ry - 1, 1.1, tint(PAL.orange, .7)); } }
  else if (kind === 'cabbage') for (let ry = y + 8; ry < y + h - 4; ry += 10) for (let rx = x + 7; rx < x + w - 4; rx += 9) { blob(g, rx + .8, ry + 1, 3.8, tint(PAL.teal, .3)); blob(g, rx, ry, 3.7, tint(PAL.teal, .48)); blob(g, rx - .6, ry - .6, 1.8, tint(PAL.mint, .5)); }
  else if (kind === 'sunflower') for (let ry = y + 8; ry < y + h - 4; ry += 10) for (let rx = x + 6 + (ry & 4); rx < x + w - 4; rx += 9) { blob(g, rx, ry, 3.4, tint(PAL.sun, .3)); blob(g, rx, ry, 1.4, tint(PAL.wood, .45)); }
  else if (kind === 'lettuce') { for (let ry = y + 5; ry < y + h; ry += 7) { g.fillStyle = tint(PAL.leaf, .42); g.beginPath(); rrect(g, x + 4, ry, w - 8, 3.4, 1.7); g.fill(); } }
  else if (kind === 'lavender') for (let ry = y + 6; ry < y + h - 2; ry += 8) for (let rx = x + 5; rx < x + w - 3; rx += 5) blob(g, rx, ry + (rx & 2), 1.9, tint(PAL.purple, .45));
  else if (kind === 'soil') { g.strokeStyle = tint(PAL.wood, .45); g.lineWidth = 2; for (let ry = y + 6; ry < y + h; ry += 7) { g.beginPath(); g.moveTo(x, ry); g.lineTo(x + w, ry); g.stroke(); } for (let i = 0; i < w * h / 300; i++) blob(g, x + rnd() * w, y + rnd() * h, 1.4, tint(PAL.leaf, .4)); }
  else if (kind === 'orchard') for (let ry = y + 12; ry < y + h - 6; ry += 20) for (let rx = x + 12 + ((ry / 20 | 0) & 1) * 9; rx < x + w - 8; rx += 18) { blob(g, rx + 2, ry + 2.5, 7, tint(PAL.leafDk, .45)); blob(g, rx, ry, 7, tint(PAL.leaf, .32)); blob(g, rx - 2.4, ry - 2.4, 2.6, tint(PAL.leaf, .55)); for (let i = 0; i < 3; i++) blob(g, rx - 3 + i * 3, ry + 1 + (i & 1) * 2.2, 1.2, i === 1 ? tint(PAL.orange, .3) : tint(PAL.red, .35)); }
  else if (kind === 'greenhouse') { const gx = x + 8, gy = y + 8, gw = w - 16, gh = h - 16;
    g.fillStyle = tint(PAL.leafDk, .55); g.fillRect(gx + 3, gy + 3, gw, gh); g.fillStyle = tint(PAL.sky, .55); g.fillRect(gx, gy, gw, gh);
    g.fillStyle = tint(PAL.sky, .75); g.fillRect(gx, gy, gw / 2, gh); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1;
    g.beginPath(); for (let px = gx + 8; px < gx + gw; px += 8) { g.moveTo(px, gy); g.lineTo(px, gy + gh); } g.moveTo(gx + gw / 2, gy); g.lineTo(gx + gw / 2, gy + gh); g.stroke();
    g.lineWidth = 2; g.strokeRect(gx, gy, gw, gh); for (let i = 0; i < 4; i++) blob(g, gx + 6 + i * 9, gy + gh - 5, 2, tint(PAL.leaf, .4)); }
  else if (kind === 'shed') { for (let ry = y + 8; ry < y + h - 4; ry += 9) for (let rx = x + 7; rx < x + w / 2; rx += 8) blob(g, rx, ry, 2.6, tint(PAL.leaf, .38));
    const sx = x + w - 34, sy = y + h / 2 - 12; g.fillStyle = tint(PAL.plum, .6); g.fillRect(sx + 2, sy + 3, 26, 22); g.fillStyle = tint(PAL.teal, .4); g.fillRect(sx, sy, 26, 22);
    g.fillStyle = tint(PAL.teal, .15); g.fillRect(sx - 2, sy - 3, 30, 7); g.fillStyle = tint(PAL.teal, .6); g.fillRect(sx + 9, sy + 9, 8, 13); blob(g, sx - 8, sy + 16, 4, tint(PAL.blue, .5)); }
  g.restore();
}
function bakeMeadow(g) {
  const rnd = rng(77), H = 640;
  g.fillStyle = tint(PAL.mint, .35); g.fillRect(0, 0, 240, H);
  const kinds = ['pumpkin', 'cabbage', 'sunflower', 'lettuce', 'orchard', 'lavender', 'soil', 'pumpkin', 'cabbage', 'sunflower', 'orchard', 'lettuce'];
  const rx = y => 150 + 46 * Math.sin(y * TAU / H) + 16 * Math.sin(y * TAU * 2 / H + 1);
  const special = { 1: 'greenhouse', 5: 'greenhouse', 3: 'shed', 6: 'shed' }; let ki = 0;
  for (let row = 0; row < 8; row++) {
    const y = row * 80 + 5, cols = row & 1 ? [0.32, 0.36, 0.32] : [0.45, 0.55], ws = cols.map(fr => Math.round(fr * 230) - 5);
    let x = 5, far = 0, best = -1; ws.forEach((w, i) => { const d = Math.abs(x + w / 2 - rx(y + 35)); if (d > best) { best = d; far = i; } x += w + 5; });
    x = 5; ws.forEach((w, i) => { const kind = special[row] && i === far ? special[row] : kinds[ki++ % kinds.length]; field(g, x, y, w, 70, kind, rnd); x += w + 5; });
  }
  // a winding river, periodic over the tile height so the tile wraps cleanly
  const river = (w, c) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); for (let y = -20; y <= H + 20; y += 8) g.lineTo(rx(y), y); g.stroke(); };
  river(34, tint(PAL.leaf, .45)); river(26, tint(PAL.sky, .3)); g.globalAlpha = .6; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); for (let y = -20; y <= H + 20; y += 8) g.lineTo(rx(y) - 5, y); g.stroke(); g.globalAlpha = 1;
  for (const y of [70, 310, 540]) { g.fillStyle = tint(PAL.wood, .45); g.fillRect(rx(y) - 18, y - 4, 36, 8); g.fillStyle = tint(PAL.wood, .25); for (let i = -16; i < 18; i += 5) g.fillRect(rx(y) + i, y - 4, 1.4, 8); }
  for (let i = 0; i < 18; i++) { const x = rnd() * 240, y = rnd() * H; if (Math.abs(x - rx(y)) < 26) continue; blob(g, x + 1.5, y + 2, 5, tint(PAL.leafDk, .45)); blob(g, x, y, 5, tint(PAL.leaf, .3)); blob(g, x - 1.6, y - 1.6, 1.8, tint(PAL.leaf, .6)); }
}
function bakeIslands(g) {
  const H = 640, list = [[62, 80, 56], [182, 230, 50], [70, 390, 44], [176, 540, 58]];
  for (const [cx, cy, w] of list) for (const dy of [0, -H, H]) {
    const y = cy + dy; if (y < -80 || y > H + 80) continue;
    g.fillStyle = tint(PAL.wood, .45); g.beginPath(); g.moveTo(cx - w, y); g.quadraticCurveTo(cx - w * .5, y + 26, cx - 6, y + 46); g.quadraticCurveTo(cx + 4, y + 50, cx + 10, y + 38); g.quadraticCurveTo(cx + w * .6, y + 24, cx + w, y); g.closePath(); g.fill();
    g.fillStyle = tint(PAL.wood, .6); g.beginPath(); g.moveTo(cx - w * .8, y + 3); g.quadraticCurveTo(cx - w * .4, y + 20, cx - 6, y + 36); g.lineTo(cx - 10, y + 4); g.closePath(); g.fill();
    g.fillStyle = tint(PAL.leaf, .38); g.beginPath(); g.ellipse(cx, y, w, 15, 0, 0, TAU); g.fill();
    g.fillStyle = tint(PAL.leaf, .55); g.beginPath(); g.ellipse(cx - 4, y - 3, w * .9, 11, 0, 0, TAU); g.fill();
    for (let i = 0; i < 4; i++) { const tx = cx - w * .6 + i * w * .38, ty = y - 4 + (i & 1) * 5; blob(g, tx + 1.2, ty + 1.5, 4.6, tint(PAL.leafDk, .5)); blob(g, tx, ty, 4.6, tint(PAL.leaf, .32)); }
    const hx = cx + w * .3, hy = y - 6; g.fillStyle = tint(PAL.cream, .1); g.fillRect(hx, hy, 11, 8); g.fillStyle = tint(PAL.teal, .35); g.beginPath(); g.moveTo(hx - 2, hy); g.lineTo(hx + 5.5, hy - 6); g.lineTo(hx + 13, hy); g.fill(); g.fillStyle = tint(PAL.sky, .4); g.fillRect(hx + 4, hy + 3, 3, 3);
    for (let i = 0; i < 6; i++) blob(g, cx - w * .5 + i * w * .2, y + 6 + (i & 1) * 2, 1.2, i & 1 ? tint(PAL.sun, .2) : '#fff');
  }
}
function bakeWorks(g) {
  const H = 640, rnd = rng(5);
  for (let y = 0; y < H; y += 20) for (let x = 0; x < 240; x += 20) { g.fillStyle = ((x + y) / 20) & 1 ? tint(PAL.lilac, .6) : tint(PAL.sky, .66); g.fillRect(x, y, 20, 20); }
  g.fillStyle = 'rgba(255,255,255,.18)'; for (let y = 0; y < H; y += 20) for (let x = 0; x < 240; x += 20) g.fillRect(x + 1, y + 1, 18, 2);
  for (const bx of [30, 180]) {
    g.fillStyle = tint(PAL.sun, .45); g.fillRect(bx - 7, 0, 44, H); g.fillStyle = tint(PAL.plum, .62);
    for (let y = 0; y < H; y += 12) { g.beginPath(); g.moveTo(bx - 7, y); g.lineTo(bx - 7, y + 6); g.lineTo(bx - 1, y); g.fill(); g.beginPath(); g.moveTo(bx + 37, y + 6); g.lineTo(bx + 37, y + 12); g.lineTo(bx + 31, y + 6); g.fill(); }
    g.fillStyle = tint(PAL.plum, .35); g.fillRect(bx - 2, 0, 34, H); g.fillStyle = tint(PAL.plum, .5); g.fillRect(bx, 0, 30, H);
    for (let y = 6; y < H; y += 16) { blob(g, bx - .5, y, 1.6, tint(PAL.metal, .6)); blob(g, bx + 30.5, y, 1.6, tint(PAL.metal, .6)); }
  }
  const pipe = (x1, y1, x2, y2) => { for (const [w, c] of [[10, tint(PAL.metal, .35)], [7, tint(PAL.metal, .55)], [2, tint(PAL.metal, .85)]]) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); } };
  for (const y of [110, 430]) { pipe(66, y, 174, y); for (const x of [90, 150]) { blob(g, x, y, 6.5, tint(PAL.metal, .35)); blob(g, x, y, 4, tint(PAL.sun, .3)); blob(g, x, y, 1.5, tint(PAL.wood, .4)); } }
  pipe(100, 0, 100, 110); pipe(140, 430, 140, H); pipe(120, 230, 120, 330); for (const y of [230, 330]) blob(g, 120, y, 5.5, tint(PAL.metal, .35));
  for (const [x, y] of [[78, 180], [150, 520], [160, 260], [76, 590]]) { g.fillStyle = tint(PAL.plum, .45); g.fillRect(x, y, 22, 16); g.fillStyle = tint(PAL.plum, .6); for (let i = 0; i < 5; i++) g.fillRect(x + 2 + i * 4, y + 2, 2, 12); }
  g.fillStyle = 'rgba(255,255,255,.55)'; for (const [x, y] of [[120, 40], [120, 160], [120, 380], [120, 500]]) for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(x - 7, y + k * 9 + 6); g.lineTo(x, y + k * 9); g.lineTo(x + 7, y + k * 9 + 6); g.lineTo(x + 7, y + k * 9 + 9); g.lineTo(x, y + k * 9 + 3); g.lineTo(x - 7, y + k * 9 + 9); g.closePath(); g.fill(); }
  const toy = [tint(PAL.red, .4), tint(PAL.blue, .45), tint(PAL.sun, .35), tint(PAL.leaf, .4), tint(PAL.purple, .45)];
  for (let i = 0; i < 14; i++) { const x = 70 + rnd() * 96, y = rnd() * H, c = toy[i % 5];
    if (i % 3) { g.fillStyle = mix(c, '#4a3a6b', .2); g.fillRect(x + 1.5, y + 1.5, 11, 11); g.fillStyle = c; g.fillRect(x, y, 11, 11); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + 3, y + 3, 5, 5); }
    else { blob(g, x + 1, y + 1.5, 5.5, mix(c, '#4a3a6b', .2)); blob(g, x, y, 5.5, c); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x - 5.5, y - 1, 11, 2); } }
  for (let i = 0; i < 40; i++) blob(g, rnd() * 240, rnd() * H, .9, tint(PAL.plum, .5));
}
function softCloud(g, w, h, shadow) {
  const cs = [[.22, .62, .26], [.48, .42, .36], [.75, .6, .27], [.5, .7, .3]];
  if (shadow) for (const [x, y, r] of cs) blob(g, x * w + 2, y * h + 3, r * h, shadow);
  for (const [x, y, r] of cs) blob(g, x * w, y * h, r * h, '#fff');
}
// a vertical gradient is an OPAQUE 4 px strip drawn stretched to 240×320 (opaque matters: a full-frame opaque drawImage lets
// Chrome drop the frame's earlier queued ops; a translucent strip or a gradient fillRect brought back ~10 ms stalls every few s)
const gradTile = cs => { const c = canvas(4, 320 * TR), g = c.getContext('2d', { alpha: false }), gr = g.createLinearGradient(0, 0, 0, c.height); cs.forEach((v, i) => gr.addColorStop(i / 2, v)); g.fillStyle = gr; g.fillRect(0, 0, 4, c.height); return c; };
function bgSteps(st) { // [key, build] pieces of a stage's background
  const k = bgKind(st);
  if (k === 'meadow') return [['tile', () => tile(640, bakeMeadow, 1)], ['cloud', () => tileS(64, 30, g => { g.globalAlpha = .85; softCloud(g, 64, 30, tint(PAL.lilac, .4)); })]];
  if (k === 'sky') return [['grad', () => [gradTile(['#e9dcff', '#f3e6ff', '#d6ecff']), gradTile(['#bfe9ff', '#e6f6ff', '#fff3fb'])]], ['tile', () => tile(640, bakeIslands)],
    ['bank', () => tileS(120, 34, g => softCloud(g, 120, 34, null))], ['puff', () => tileS(70, 32, g => softCloud(g, 70, 32, tint(PAL.lilac, .5)))]];
  return [['tile', () => tile(640, bakeWorks, 1)],
    ['belt', () => tileS(30, 344, g => { g.fillStyle = tint(PAL.plum, .45); for (let y = 0; y < 344; y += 12) g.fillRect(0, y, 30, 4); g.fillStyle = 'rgba(255,255,255,.18)'; for (let y = 0; y < 344; y += 12) g.fillRect(0, y + 4, 30, 1); })],
    ['gear', () => tileS(90, 90, g => { g.fillStyle = tint(PAL.metal, .2); g.beginPath(); STAR(45, 45, 44, 36, 12, 0)(g); g.fill(); g.globalCompositeOperation = 'destination-out'; blob(g, 45, 45, 14, '#000'); for (let i = 0; i < 6; i++) blob(g, 45 + Math.cos(i * TAU / 6) * 25, 45 + Math.sin(i * TAU / 6) * 25, 6, '#000'); })],
    ['haze', () => tileS(240, 50, g => { for (let i = 0; i < 9; i++) blob(g, 10 + i * 28, 25 + Math.sin(i * 1.7) * 6, 18 + (i % 3) * 3, 'rgba(154,143,176,.35)'); })]];
}
function buildBg(st) { const B = { kind: bgKind(st), st }; for (const [k, fn] of bgSteps(st)) B[k] = fn(); return B; }

/* ---------- sticker text (cached) ---------- */
let TXT = new Map(), txtB = 0, GL = new Map(); const mctx = canvas(4, 4).getContext('2d');
const TXT_MAX = () => 2.2e5 * R * R;   // LRU capped by bytes (2 MB at R 3; one screen needs well under half), not only by count
function txtCanvas(s, size, fill) {
  const key = s + '|' + size + '|' + fill; let c = TXT.get(key);
  if (c) { TXT.delete(key); TXT.set(key, c); return c; }
  mctx.font = font(size); const w = mctx.measureText(s).width, p = size * .3 + 1, lw = w + p * 2, lh = size * 1.25 + p * 2;
  c = canvas(lw * R, lh * R); c.lw = c.width / R; c.lh = c.height / R; c.tw = w;
  const g = c.getContext('2d'); g.scale(R, R); g.font = font(size); g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.strokeStyle = PAL.ink; g.lineWidth = size * .32; const ty = lh / 2 - .5;
  g.strokeText(s, p, ty + 1); g.strokeText(s, p, ty); g.fillStyle = fill; g.fillText(s, p, ty);
  TXT.set(key, c); txtB += c.width * c.height * 4;
  while (TXT.size > 1 && (TXT.size > 64 || txtB > TXT_MAX())) { const k = TXT.keys().next().value, o = TXT.get(k); txtB -= o.width * o.height * 4; TXT.delete(k); }
  return c;
}
function glyph(ch, size, fill) { // numbers are composed from per-glyph ink + fill layers so changing scores make no new canvases
  const key = ch + '|' + size + '|' + fill; let o = GL.get(key); if (o) return o;
  mctx.font = font(size); const adv = mctx.measureText(ch).width, p = size * .3 + 1, lw = adv + p * 2, lh = size * 1.25 + p * 2;
  const mk = ink => { const c = canvas(lw * R, lh * R); c.lw = c.width / R; c.lh = c.height / R; const g = c.getContext('2d'); g.scale(R, R); g.font = font(size); g.textBaseline = 'middle'; g.lineJoin = 'round'; const ty = lh / 2 - .5;
    if (ink) { g.strokeStyle = PAL.ink; g.lineWidth = size * .32; g.strokeText(ch, p, ty + 1); g.strokeText(ch, p, ty); } else { g.fillStyle = fill; g.fillText(ch, p, ty); } return c; };
  o = { ink: mk(1), fill: mk(0), adv, p }; GL.set(key, o); return o;
}
const NUMRE = /^[0-9+x×,.:%\-\/ ]+$/;
function text(ctx, s, x, y, size, fill, align) {
  s = String(s).slice(0, 90); size = Math.round(Math.max(4, Math.min(40, +size || 9)) * 2) / 2; fill = fill || '#fff'; align = align || 'center'; if (!s) return 0;   // net stickers: bounded size and length
  if (NUMRE.test(s)) {
    const gs = []; let w = 0; for (const ch of s) { const o = glyph(ch, size, fill); gs.push(o); w += o.adv; }
    let x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    for (const pass of ['ink', 'fill']) { let xx = x0; for (const o of gs) { const c = o[pass]; ctx.drawImage(c, xx - o.p, y - c.lh / 2, c.lw, c.lh); xx += o.adv; } }
    return w;
  }
  const c = txtCanvas(s, size, fill), p = (c.lw - c.tw) / 2;
  const x0 = align === 'center' ? x - c.lw / 2 : align === 'right' ? x - c.tw - p : x - p;
  ctx.drawImage(c, x0, y - c.lh / 2, c.lw, c.lh); return c.tw;
}

/* ---------- live helpers ---------- */
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function twinkle(ctx, x, y, r, rot, col) { ctx.fillStyle = col || '#fff'; ctx.beginPath(); STAR(x, y, r, r * .32, 4, rot || 0)(ctx); ctx.fill(); }
function inkStar(ctx, x, y, r, rot, col, lw) { ctx.beginPath(); STAR(x, y, r, r * .45, 5, rot)(ctx); ctx.fillStyle = col; ctx.strokeStyle = PAL.ink; ctx.lineWidth = lw || 1; ctx.stroke(); ctx.fill(); }
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
function pop(ctx, cx, cy, t, s, cols) {
  const e = easeOut(t);
  if (t < .12) { ctx.fillStyle = PAL.ink; ctx.beginPath(); STAR(cx, cy, 15 * s, 6.5 * s, 5, .2)(ctx); ctx.fill(); ctx.fillStyle = PAL.sun; ctx.beginPath(); STAR(cx, cy, 13 * s, 5.5 * s, 5, .2)(ctx); ctx.fill(); ctx.fillStyle = '#fff'; circle(ctx, cx, cy, 5 * s); ctx.fill(); }
  ctx.globalAlpha = 1 - t; ctx.strokeStyle = '#fff'; ctx.lineWidth = (3 * (1 - t) + .5) * Math.sqrt(s); circle(ctx, cx, cy, (4 + 18 * e) * s); ctx.stroke(); ctx.globalAlpha = 1;
  const pr = Math.max(0, 5.5 * (1 - t * 1.15)) * s;
  if (pr > .8) {
    ctx.fillStyle = PAL.ink; for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .3, d = 11 * e * s; circle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, pr + Math.min(1.2, pr * .4)); ctx.fill(); }
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + .3, d = 11 * e * s; ctx.fillStyle = i & 1 ? (cols ? cols[0] : PAL.cream) : '#fff'; circle(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d, pr); ctx.fill(); }
  }
  for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + .8, d = 22 * e * s; inkStar(ctx, cx + Math.cos(a) * d, cy + Math.sin(a) * d - 6 * t * s, 3.5 * (1 - t * .6) * Math.sqrt(s), t * 4, [PAL.sun, PAL.sky, PAL.mint, PAL.lilac][i]); }
}
function confetti(ctx, x, y, age, n, seed, spread) {
  const cols = [PAL.sun, PAL.mint, PAL.sky, PAL.lilac, PAL.orange, '#fff'];
  for (let i = 0; i < n; i++) { const r1 = hash(seed, i), r2 = hash(seed + 7, i), a = -PI / 2 + (r1 - .5) * (spread || 2.6), v = 1.4 + r2 * 1.6;
    const px = x + Math.cos(a) * v * age, py = y + Math.sin(a) * v * age + .045 * age * age, rot = age * (.2 + r2 * .3) + i;
    ctx.save(); ctx.translate(px, py); ctx.rotate(rot); ctx.scale(1, Math.cos(age * .25 + i)); ctx.fillStyle = cols[i % 6]; ctx.fillRect(-2, -1.3, 4, 2.6); ctx.restore(); }
}
function heartAt(ctx, x, y, s) { putS(ctx, GC.heart1, x, y, s); }
function seedIcon(ctx, x, y, s, rot) { putS(ctx, GC.sunrays, x, y, s, s, rot); putS(ctx, GC.sunface, x, y, s); }
function typeOf(f) { const v = f.s != null ? f.s : f.arg != null ? f.arg : f.n; return typeof v === 'number' ? BB.TYPE_LIST[v] : v; }

/* ---------- fx: return false when finished ---------- */
let fxErr = 0;
const FX = {
  pop(ctx, f, a) { const big = (f.n || 1) >= 2, L = big ? 36 : 24; pop(ctx, f.x, f.y, a / L, big ? 2 : Math.max(.3, f.n || 1)); return a < L; },
  popBig(ctx, f, a) { pop(ctx, f.x, f.y, a / 36, 2); return a < 36; },
  unwind(ctx, f, a) {
    const type = typeOf(f), D = typeof type === 'string' ? own(EN, type) : null;
    if (a < 22 && D) { const hop = Math.sin(a / 22 * PI) * 9, sq = a < 4 ? 1 - a * .04 : 1; putS(ctx, enemyImg(type, D.looks.indexOf(3) >= 0 ? 3 : 0, 0), f.x, f.y - hop, 2 - sq, sq); }
    if (a >= 18) { const b = a - 18; if (b < 14) pop(ctx, f.x, f.y - 6, b / 14, .7); confetti(ctx, f.x, f.y - 6, b, 12, (f.x * 7 + f.y) | 0);
      const fy = f.y - 6 - b * .5; ctx.globalAlpha = Math.max(0, Math.min(1, (60 - b) / 20)); putS(ctx, enemyImg('vent', 3, 0), f.x, fy, Math.min(1, b / 6) * .7); ctx.globalAlpha = 1; }
    return a < 78;
  },
  calm(ctx, f, a) { const L = 60; ctx.globalAlpha = .75 * Math.min(1, (L - a) / 20); put(ctx, enemyImg('grumble', 3, 0), f.x, f.y - a); ctx.globalAlpha = 1; if (a < 16) twinkle(ctx, f.x + 14, f.y - 8 - a, 3 * (1 - a / 16), a * .2); return a < L; },
  sparkle(ctx, f, a) { const L = 14, s = Math.sin(a / L * PI) * 6; twinkle(ctx, f.x, f.y, s + .5, a * .15, PAL.sun); twinkle(ctx, f.x, f.y, s * .5, a * .15, '#fff'); return a < L; },
  spark(ctx, f, a) { const L = 7, e = easeOut(a / L); for (let i = 0; i < 3; i++) { const an = -PI / 2 + (i - 1) * .9; twinkle(ctx, f.x + Math.cos(an) * 6 * e, f.y + Math.sin(an) * 6 * e, 3 * (1 - a / L) + .4, a * .3, i === 1 ? '#fff' : PAL.sun); } return a < L; },
  tink(ctx, f, a) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.globalAlpha = 1 - a / 8; circle(ctx, f.x, f.y, 2 + a * .7); ctx.stroke(); ctx.globalAlpha = 1; return a < 8; },
  sticker(ctx, f, a) {
    const L = f.life || 50, s = f.s != null ? f.s : f.arg != null ? f.arg : '', size = f.n || 9, sc = a < 4 ? .6 + a * .15 : a < 8 ? 1.2 - (a - 4) * .05 : 1;
    ctx.globalAlpha = Math.min(1, (L - a) / 14); ctx.save(); ctx.translate(f.x, f.y - a * .5); ctx.scale(sc, sc);
    text(ctx, s, 0, 0, size, f.c || (NUMRE.test(String(s)) ? PAL.sun : '#fff')); ctx.restore(); ctx.globalAlpha = 1; return a < L;
  },
  heart(ctx, f, a) {
    if (f.x2 != null) { const L = 20; if (a < L) { const t = a / L, mx = (f.x + f.x2) / 2, my = Math.min(f.y, f.y2) - 40, u = 1 - t;
        const px = u * u * f.x + 2 * u * t * mx + t * t * f.x2, py = u * u * f.y + 2 * u * t * my + t * t * f.y2; heartAt(ctx, px, py, 1.4); twinkle(ctx, px - 6 * u, py + 4, 2, a * .3, PAL.sun); }
      else { const b = a - L; ctx.globalAlpha = 1 - b / 12; for (let i = 0; i < 6; i++) { const an = i * TAU / 6; heartAt(ctx, f.x2 + Math.cos(an) * b * 1.4, f.y2 + Math.sin(an) * b * 1.4, .7); } ctx.globalAlpha = 1; }
      return a < L + 12; }
    ctx.globalAlpha = Math.min(1, (40 - a) / 12); heartAt(ctx, f.x - 4, f.y - 8 - a * .5, 1.3 + Math.sin(a * .4) * .1); text(ctx, '+', f.x + 4, f.y - 9 - a * .5, 9, '#9ef0a0'); ctx.globalAlpha = 1; return a < 40;
  },
  pot(ctx, f, a) { const y = f.y + a * (BB.C ? BB.C.SCROLL : .4); if (y > 345) return false; put(ctx, enemyImg('vent', 3, 0), f.x, y); return a < 1200; },
  rainbow(ctx, f, a) {
    const L = 300, grow = easeOut(a / 40), al = .6 * Math.min(1, (L - a) / 60), cols = ['#ff4f5e', '#ff8a3d', '#ffd93b', '#4cc46a', '#3f7bff'];
    ctx.globalAlpha = al; ctx.lineWidth = 6; ctx.lineCap = 'butt';
    cols.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(f.x, f.y + 170, 124 - i * 6, PI, PI + PI * grow); ctx.stroke(); });
    ctx.globalAlpha = 1; ctx.lineCap = 'round'; return a < L;
  },
  zapwarn(ctx, f, a) { const L = f.n || 60; if (((a >> 2) & 1) || a > L - 6) { const b = Math.abs(Math.sin(a * .3)) * 3; ctx.fillStyle = PAL.ink; circle(ctx, f.x + 14, f.y - 14 - b, 6.4); ctx.fill(); ctx.fillStyle = PAL.sun; circle(ctx, f.x + 14, f.y - 14 - b, 5); ctx.fill(); text(ctx, '!', f.x + 14, f.y - 13.6 - b, 9, '#fff'); } return a < L; },
  zaplive(ctx, f, a) { const L = 14; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.globalAlpha = 1 - a / L; ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i * TAU / 6 + a * .3, r = 4 + a * 1.2; ctx.moveTo(f.x + Math.cos(an) * r * .4, f.y + Math.sin(an) * r * .4); ctx.lineTo(f.x + Math.cos(an + .3) * r, f.y + Math.sin(an + .3) * r); } ctx.stroke(); twinkle(ctx, f.x, f.y, 6 * (1 - a / L), a * .2, PAL.sun); ctx.globalAlpha = 1; return a < L; },
  seedburst(ctx, f, a) { const big = (f.n || 2) >= 2, L = big ? 20 : 14, s = big ? 1 : .55, e = easeOut(a / L);
    ctx.globalAlpha = 1 - a / L; ctx.strokeStyle = PAL.sun; ctx.lineWidth = 3 * s + 1; circle(ctx, f.x, f.y, (6 + 20 * e) * s); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + .2; ctx.moveTo(f.x + Math.cos(an) * (8 + 14 * e) * s, f.y + Math.sin(an) * (8 + 14 * e) * s); ctx.lineTo(f.x + Math.cos(an) * (12 + 20 * e) * s, f.y + Math.sin(an) * (12 + 20 * e) * s); } ctx.stroke(); ctx.globalAlpha = 1; return a < L; },
  basket(ctx, f, a) {
    const L = 64, y = f.y - Math.min(a, 20) * .6; ctx.globalAlpha = Math.min(1, (L - a) / 14);
    for (let i = 0; i < 5; i++) { const an = -PI / 2 + (i - 2) * .5, d = easeOut(a / 24) * 22; putS(ctx, iconImg(i), f.x + Math.cos(an) * d, y - 6 + Math.sin(an) * d, 1.2); }
    putS(ctx, glob('basket', 16, 12, drawBasket), f.x, y + 4, a < 6 ? .6 + a * .1 : 1.2);
    text(ctx, 'BASKET!', f.x, y + 18, 10, PAL.sun); text(ctx, '+1000', f.x, y + 29, 8, '#fff'); ctx.globalAlpha = 1; return a < L;
  },
  boinged(ctx, f, a) { const L = 18, e = easeOut(a / L); ctx.globalAlpha = 1 - a / L; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) { const an = -PI / 2 + (i - 1) * .7; ctx.beginPath(); ctx.arc(f.x, f.y, 6 + 6 * e + i, an - .25, an + .25); ctx.stroke(); }
    inkStar(ctx, f.x, f.y, 3.5 * (1 - e) + 1, a * .2, PAL.sun); text(ctx, 'boing!', f.x, f.y - 12 - a * .6, 8, '#fff'); ctx.globalAlpha = 1; return a < L; },
  ripen(ctx, f, a) { const L = 14, e = easeOut(a / 12); ctx.globalAlpha = 1 - a / L; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; circle(ctx, f.x, f.y, 6 + 10 * e); ctx.stroke();
    for (let i = 0; i < 4; i++) { const an = i * TAU / 4 + .78; inkStar(ctx, f.x + Math.cos(an) * 14 * e, f.y + Math.sin(an) * 14 * e, 2.6, a * .3, PAL.sun, .8); } ctx.globalAlpha = 1; return a < L; },
  grab(ctx, f, a) { const L = 12, e = 1 - easeOut(a / L); for (let i = 0; i < 6; i++) { const an = i * TAU / 6 + a * .2; twinkle(ctx, f.x + Math.cos(an) * 16 * e, f.y + Math.sin(an) * 16 * e, 2.4, an, i & 1 ? '#fff' : PAL.sun); } return a < L; },
  revive(ctx, f, a) { const L = 30, e = easeOut(a / L); ctx.globalAlpha = 1 - a / L; for (let i = 0; i < 8; i++) { const an = i * TAU / 8 + a * .05; heartAt(ctx, f.x + Math.cos(an) * 24 * e, f.y + Math.sin(an) * 24 * e, .9); } ctx.globalAlpha = 1; return a < L; },
  shield(ctx, f, a) { const L = 16, e = easeOut(a / L); ctx.globalAlpha = 1 - a / L; ctx.strokeStyle = PAL.blue; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const an = i * TAU / 6; ctx.beginPath(); ctx.arc(f.x, f.y, 16 + 8 * e, an, an + .5); ctx.stroke(); } ctx.globalAlpha = 1; return a < L; },
  bubble(ctx, f, a) { const L = 24; ctx.globalAlpha = 1 - a / L; for (let i = 0; i < 8; i++) { const an = i * TAU / 8, d = easeOut(a / L) * 18; ctx.fillStyle = '#fff'; circle(ctx, f.x + Math.cos(an) * d, f.y + Math.sin(an) * d - a * .3, 2); ctx.fill(); } ctx.globalAlpha = 1; return a < L; },
  hurt(ctx, f, a) { const L = 10; if (a < 4) { ctx.fillStyle = PAL.ink; ctx.beginPath(); STAR(f.x, f.y, 11, 5, 6, .3)(ctx); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); STAR(f.x, f.y, 9, 4, 6, .3)(ctx); ctx.fill(); } else FX.tink(ctx, f, a - 4); return a < L; },
  confetti(ctx, f, a) { confetti(ctx, f.x, f.y, a, Math.min(40, f.n || 16), (f.x * 3 + f.y) | 0, 3.4); return a < 50; },
  zz(ctx, f, a) { for (let i = 0; i < 3; i++) { const p = ((a + i * 20) % 60) / 60; ctx.globalAlpha = 1 - p; text(ctx, 'z', f.x + p * 10 + i * 3, f.y - p * 20, 7 + i, '#fff'); } ctx.globalAlpha = 1; return a < (f.n || 120); },
  flower(ctx, f, a) { ctx.globalAlpha = Math.min(1, (50 - a) / 15); putS(ctx, enemyImg('vent', 3, 0), f.x, f.y - a * .4, Math.min(1, a / 6) * .8); ctx.globalAlpha = 1; return a < 50; }
};
const LIFE = { pop: f => (f.n || 1) >= 2 ? 36 : 24, popBig: 36, unwind: 78, calm: 60, sparkle: 14, spark: 7, tink: 8, sticker: f => f.life || 50, heart: f => f.x2 != null ? 32 : 40,
  pot: 1200, rainbow: 300, zapwarn: f => f.n || 60, zaplive: 14, seedburst: f => (f.n || 2) >= 2 ? 20 : 14, basket: 64, boinged: 18, ripen: 14, grab: 12, revive: 30, shield: 16,
  bubble: 24, hurt: 10, confetti: 50, zz: f => f.n || 120, flower: 50 };
['cancel', 'text', 'score', 'gift', 'heal'].forEach((k, i) => { LIFE[k] = [LIFE.sparkle, LIFE.sticker, LIFE.sticker, LIFE.heart, LIFE.heart][i]; });
FX.cancel = FX.sparkle; FX.text = FX.sticker; FX.score = FX.sticker; FX.gift = FX.heart; FX.heal = FX.heart;
function drawBasket(g) { outlined(g, [P(M.WOOD, g2 => { g2.moveTo(1, 4); g2.lineTo(15, 4); g2.lineTo(13, 11.5); g2.lineTo(3, 11.5); g2.closePath(); }, 5, 8, 7)], 1.2);
  if (!FLASH) { g.strokeStyle = M.WOOD[1]; g.lineWidth = .7; g.beginPath(); for (let x = 4; x < 14; x += 3) { g.moveTo(x, 4.5); g.lineTo(x + .4, 11); } g.moveTo(2, 7.5); g.lineTo(14, 7.5); g.stroke(); }
  g.strokeStyle = PAL.ink; g.lineWidth = 2.4; g.beginPath(); g.arc(8, 4, 5, PI, TAU); g.stroke(); g.strokeStyle = PAL.wood; g.lineWidth = 1; g.stroke(); }

/* ---------- the zap column (Thunderpuff): a<2 telegraph, a=2 live ---------- */
function drawZap(ctx, x, a, t) {
  if (a < 2) {
    ctx.fillStyle = 'rgba(255,217,59,' + (.18 + .12 * Math.sin(t * .3)).toFixed(3) + ')'; ctx.fillRect(x - 12, 0, 24, 320);
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -t * .5;
    ctx.beginPath(); ctx.moveTo(x - 12, 0); ctx.lineTo(x - 12, 320); ctx.moveTo(x + 12, 0); ctx.lineTo(x + 12, 320); ctx.stroke(); ctx.setLineDash([]);
    const b = Math.abs(Math.sin(t * .2)) * 2; ctx.fillStyle = PAL.ink; circle(ctx, x, 54 - b, 8); ctx.fill(); ctx.fillStyle = PAL.sun; circle(ctx, x, 54 - b, 6.4); ctx.fill(); text(ctx, '!', x, 54.5 - b, 11, '#fff');
    return;
  }
  ctx.fillStyle = 'rgba(255,217,59,.55)'; ctx.fillRect(x - 12, 0, 24, 320); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x - 5, 0, 10, 320);
  const seed = (t / 3) | 0, path = () => { ctx.beginPath(); ctx.moveTo(x, 0); for (let y = 16; y <= 336; y += 16) ctx.lineTo(x + (hash(seed, y) - .5) * 10, y); };
  ctx.lineJoin = 'round'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3.4; path(); ctx.stroke(); ctx.strokeStyle = PAL.sun; ctx.lineWidth = 1.6; path(); ctx.stroke();
}

/* ---------- HUD bits ---------- */
const PCOL = ['#a6f2a0', '#ffbe8a'];
let coopT = -1;
function pill(ctx, x, y, w, h) { ctx.fillStyle = 'rgba(43,33,64,.38)'; ctx.beginPath(); rrect(ctx, x, y, w, h, 8); ctx.fill(); }
function drawPlayerPill(ctx, p, x, y, t) {
  const ga = ctx.globalAlpha; pill(ctx, x, y, 94, 27);
  text(ctx, p.name || (p.who ? 'MARIGOLD' : 'SPRIG'), x + 5, y + 7.5, 8, PCOL[p.who ? 1 : 0], 'left');
  const h1 = GC.heart1, h0 = GC.heart0;
  for (let i = 0; i < 5; i++) put(ctx, i < (p.hp | 0) ? h1 : h0, x + 54 + i * 8.2, y + 7.5);
  if (p.down) { putS(ctx, GC.dand, x + 47, y + 17, .45); text(ctx, 'floating…', x + 56, y + 18, 8, '#fff', 'left'); }
  else {
    let ix = x + 7; const iy = y + 18;
    for (let i = 0; i < 3; i++) { ctx.lineWidth = 1; ctx.strokeStyle = i < p.shield ? '#cfeaff' : 'rgba(255,255,255,.3)'; ctx.fillStyle = i < p.shield ? PAL.blue : 'rgba(255,255,255,.08)'; circle(ctx, ix + i * 5.4, iy, 2.2); ctx.fill(); ctx.stroke(); }
    ix += 19;
    for (let i = 0; i < 2; i++) { ctx.globalAlpha = ga * (i < p.buddies ? 1 : .28); putS(ctx, GC['bud' + (p.who ? 1 : 0) + '0'], ix + i * 7.5, iy, .52); } ctx.globalAlpha = ga;
    ix += 18; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) { ctx.strokeStyle = i <= (p.spd | 0) ? '#b6f07a' : 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(ix + i * 4, iy - 2.4); ctx.lineTo(ix + 2 + i * 4, iy); ctx.lineTo(ix + i * 4, iy + 2.4); ctx.stroke(); }
    ix += 17;
    for (let i = 0; i < 3; i++) { const an = (i - 1) * .5; ctx.strokeStyle = i <= (p.spread | 0) ? '#ff8a96' : 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.moveTo(ix + 4, iy + 3); ctx.lineTo(ix + 4 + Math.sin(an) * 5.5, iy + 3 - Math.cos(an) * 5.5); ctx.stroke(); }
  }
  const ch = p.charge | 0;
  if (ch > 0) { const w = 84 * Math.min(1, ch / 60), full = ch >= 60; ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x + 4, y + 23.5, 86, 3.4, 1.7); ctx.fill();
    ctx.fillStyle = full ? ((t >> 2) & 1 ? '#fff' : PAL.sun) : ch >= 30 ? PAL.sun : '#fff1a8'; ctx.beginPath(); rrect(ctx, x + 5, y + 24.2, Math.max(2, w), 2, 1); ctx.fill(); }
}

/* ---------- screens ---------- */
let titleBg = null;
function skyBack(ctx, t, calm) {
  if (!titleBg || titleBg.R !== R) { titleBg = { R, grad: (() => { const c = canvas(4, 160), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#8fd8ff'); gr.addColorStop(.6, '#d8f3ff'); gr.addColorStop(1, '#f3fbe8'); g.fillStyle = gr; g.fillRect(0, 0, 4, 160); return c; })(), cloud: sprite(70, 32, g => softCloud(g, 70, 32, tint(PAL.lilac, .45))) }; }
  ctx.drawImage(titleBg.grad, 0, 0, 240, 320);
  for (const [x, y, s, v] of [[40, 40, 1, .12], [190, 120, .8, .08], [70, 250, 1.1, .1], [200, 290, .7, .14]]) putS(ctx, titleBg.cloud, ((x + t * v) % 320 + 320) % 320 - 40, y, s);
}
function card(ctx, x, y, w, h, fill) { ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, x - 2, y - 2 + 2, w + 4, h + 4, 14); ctx.fill(); ctx.fillStyle = fill || 'rgba(255,255,255,.92)'; ctx.beginPath(); rrect(ctx, x, y, w, h, 12); ctx.fill(); }
function lines(s) { return String(s || '').split('\n'); }
const POWER_ICON = { 0: 'points', 1: 'shield', 2: 'buddy', 3: 'spread', 4: 'zoom' };
function powerIcon(ctx, k, x, y) {
  ctx.lineCap = 'round';
  if (k === 0) { inkStar(ctx, x, y, 4.4, -PI / 2, PAL.sun, 1); }
  else if (k === 1) { ctx.fillStyle = 'rgba(127,208,255,.5)'; ctx.strokeStyle = PAL.blue; ctx.lineWidth = 1.6; circle(ctx, x, y, 4.6); ctx.fill(); ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 3, PI * 1.1, PI * 1.5); ctx.stroke(); }
  else if (k === 2) { putS(ctx, GC.bud00, x - 3, y, .55); putS(ctx, GC.bud00, x + 3.5, y, .55); }
  else if (k === 3) { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; for (const an of [-.5, 0, .5]) { ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + Math.sin(an) * 7, y + 4 - Math.cos(an) * 7); ctx.stroke(); } ctx.strokeStyle = PAL.cream; ctx.lineWidth = 1.4; for (const an of [-.5, 0, .5]) { ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x + Math.sin(an) * 7, y + 4 - Math.cos(an) * 7); ctx.stroke(); } }
  else { for (const pass of [0, 1]) { ctx.strokeStyle = pass ? '#b6f07a' : PAL.ink; ctx.lineWidth = pass ? 1.6 : 3.4; ctx.beginPath(); for (let i = 0; i < 2; i++) { ctx.moveTo(x - 4 + i * 4.5, y - 4); ctx.lineTo(x + i * 4.5, y); ctx.lineTo(x - 4 + i * 4.5, y + 4); } ctx.stroke(); } }
}
const PIPS = [{ x: 90, y: 248, r: 11 }, { x: 120, y: 248, r: 11 }, { x: 150, y: 248, r: 11 }];
const SCREENS = {
  title(ctx, S) {
    const t = S.t | 0; skyBack(ctx, t); prefetch(0);
    const word = (w, y, d) => { let x = 120 - (w.length - 1) * 11.5; for (let i = 0; i < w.length; i++) { text(ctx, w[i], x, y + Math.sin(t * .1 + i * .7 + d) * 2, 30, i % 2 ? '#ffe36b' : PAL.sun); x += 23; } };
    word('BERRY', 52, 0); word('BREEZE', 86, 2);
    putS(ctx, fruitImg(0), 36, 62 + Math.sin(t * .08) * 3, 1.4, 1.4, Math.sin(t * .05) * .15); putS(ctx, fruitImg(3), 206, 92 + Math.sin(t * .08 + 2) * 3, 1.4, 1.4, Math.sin(t * .05 + 1) * .15);
    const dy = S.online ? 10 : 0;   // online: room for the start countdown under the logo (no stage pips: a duo starts at stage 1)
    put(ctx, shipImg(0, (t / 5 | 0) & 3), 96, 136 + dy + Math.sin(t * .084) * 2); put(ctx, shipImg(1, ((t / 5 | 0) + 2) & 3), 144, 138 + dy + Math.sin(t * .084 + 1.5) * 2);
    text(ctx, 'SPRIG', 96, 158 + dy, 8, PCOL[0]); text(ctx, 'MARIGOLD', 144, 158 + dy, 8, PCOL[1]);
    card(ctx, 14, 172 + dy, 212, 52);
    text(ctx, 'shoot fruit to change it, fly in to grab', 120, 181 + dy, 8, '#fff');
    for (let k = 0; k < 5; k++) { const x = 34 + k * 43, y = 198 + dy; putS(ctx, fruitImg(k), x - 7, y + Math.sin(t * .1 + k) * 1.2, 1); powerIcon(ctx, k, x + 9, y); text(ctx, POWER_ICON[k], x + 1, y + 16, 8, '#fff'); if (k < 4) text(ctx, '›', x + 22, y, 8, '#fff'); }
    const best = Math.max(0, S.best | 0);
    if (!S.online) text(ctx, 'STAGE', 54, 248, 8, '#fff');
    if (!S.online) PIPS.forEach((p, i) => { const ok = i <= best; ctx.fillStyle = PAL.ink; circle(ctx, p.x, p.y + 1, p.r + 1.6); ctx.fill(); ctx.fillStyle = ok ? ['#8fe08a', '#c8b2ff', '#7fd0ff'][i] : 'rgba(255,255,255,.55)'; circle(ctx, p.x, p.y, p.r); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(p.x - 3.5, p.y - 4.5, 4, 2, -.5, 0, TAU); ctx.fill(); text(ctx, ok ? String(i + 1) : '·', p.x, p.y + .5, 11, ok ? '#fff' : PAL.cloudSh); });
    if (best > 0 && !S.online) text(ctx, S.touch ? 'tap a stage' : 'press ' + (best > 1 ? '2 or 3' : '2'), 190, 248, 8, '#fff');
    const msg = S.waiting ? 'Waiting for ' + (S.opp || 'your friend') + '…' : S.online ? 'Flying with ' + (S.opp || 'a friend') + '!' : S.touch ? 'Tap to fly!' : 'Press SPACE to fly!';
    ctx.globalAlpha = .6 + .4 * Math.abs(Math.sin(t * .06)); text(ctx, msg, 120, 281, 12, PAL.sun); ctx.globalAlpha = 1;
    if (!S.online && !S.touch) { text(ctx, 'Two players? Start, then Marigold holds ENTER', 120, 299, 8, '#fff'); text(ctx, 'Sprig: W A S D + SPACE   Marigold: arrows + ENTER', 120, 311, 8, '#e4d8ff'); }
  },
  banner(ctx, S) {
    const a = S.age | 0, slide = a < 12 ? 1 - easeOut(a / 12) : 0, out = a > 100 ? easeOut((a - 100) / 16) : 0, dx = -260 * slide + 280 * out;
    ctx.save(); ctx.translate(dx, 0); card(ctx, 20, 128, 200, 46);
    putS(ctx, fruitImg(0), 36, 151, 1); putS(ctx, fruitImg(4), 204, 151, 1);
    text(ctx, 'STAGE ' + ((S.stage | 0) + 1), 120, 140, 9, PAL.sun); text(ctx, S.name || '', 120, 159, 16, '#fff'); ctx.restore();
  },
  warning(ctx, S) {
    const a = S.age | 0;
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillRect(0, 132, 240, 40);
    for (const by of [126, 172]) { ctx.save(); ctx.beginPath(); ctx.rect(0, by, 240, 7); ctx.clip(); ctx.fillStyle = PAL.ink; ctx.fillRect(0, by, 240, 7); ctx.fillStyle = PAL.sun;
      for (let x = -20 + ((a * .8) % 16); x < 250; x += 16) { ctx.beginPath(); ctx.moveTo(x, by + 7); ctx.lineTo(x + 7, by); ctx.lineTo(x + 13, by); ctx.lineTo(x + 6, by + 7); ctx.fill(); } ctx.restore(); }
    ctx.globalAlpha = (a >> 3) & 1 ? .55 : 1; text(ctx, 'HERE COMES', 120, 141, 9, '#fff'); text(ctx, String(S.name || '').toUpperCase(), 120, 159, 16, PAL.sun); ctx.globalAlpha = 1;
  },
  tally(ctx, S) {
    const a = S.age | 0, rows = S.rows || [], nst = Array.isArray(S.stars) ? S.stars.filter(Boolean).length : (S.stars | 0);
    if (a > 20 && curStage >= 0) prefetch(curStage + 1);   // the next stage's background, a piece per frame
    ctx.fillStyle = 'rgba(43,33,64,.25)'; ctx.fillRect(0, 0, 240, 320);
    card(ctx, 22, 60, 196, 76 + rows.length * 16);
    text(ctx, 'STAGE CLEAR!', 120, 78, 16, PAL.sun);
    rows.forEach((r, i) => { const t0 = 14 + i * 22; if (a < t0) return; const y = 102 + i * 16, v = r[1], k = Math.min(1, (a - t0) / 18);
      text(ctx, String(r[0]).replace(/ x(\d+)$/, ' ×$1'), 36, y, 9, '#fff', 'left'); text(ctx, typeof v === 'number' ? String(Math.round(v * k)) : String(v), 204, y, 9, PAL.sun, 'right'); });
    const sy = 102 + rows.length * 16 + 18, t1 = 14 + rows.length * 22;
    for (let i = 0; i < 3; i++) { const on = i < nst && a > t1 + i * 12, b = on ? Math.max(0, 1 - (a - t1 - i * 12) / 10) : 0, s = on ? 1 + b * .5 : .8;
      ctx.save(); ctx.translate(96 + i * 24, sy); ctx.scale(s, s); inkStar(ctx, 0, 0, 9, -PI / 2, on ? PAL.sun : 'rgba(201,195,230,.8)', 1.6); ctx.restore(); }
  },
  ending(ctx, S) {
    const a = S.age | 0; skyBack(ctx, a, 1);
    ctx.globalAlpha = .55; ctx.lineWidth = 6; ['#ff4f5e', '#ff8a3d', '#ffd93b', '#4cc46a', '#3f7bff'].forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(120, 170, 110 - i * 6, PI, TAU); ctx.stroke(); }); ctx.globalAlpha = 1;
    if (BOSS.smoggins) putS(ctx, bossBody('smoggins', 3), 120, 120, .62);
    const duo = S.duo !== false, solo = S.who | 0;   /* solo: only the ship that flew (a guest who flew on alone is Marigold) */
    if (duo) { put(ctx, shipImg(0, (a / 5 | 0) & 3), 70, 172 + Math.sin(a * .1) * 3); put(ctx, shipImg(1, ((a / 5 | 0) + 1) & 3), 170, 172 + Math.sin(a * .1 + 1) * 3); }
    else put(ctx, shipImg(solo, (a / 5 | 0) & 3), solo ? 170 : 70, 172 + Math.sin(a * .1) * 3);
    confetti(ctx, 120, 20, (a % 90) + 10, 18, 3, 6);
    card(ctx, 16, 200, 208, 96);
    text(ctx, 'The smog is gone and the sky is clear!', 120, 214, 8, '#fff'); text(ctx, 'Old Smoggins planted a garden on his chimney.', 120, 228, 8, '#fff');
    text(ctx, 'SCORE ' + (S.score | 0), 120, 248, 13, PAL.sun); text(ctx, 'Thanks for flying, ' + (duo ? 'Sprig & Marigold' : solo ? 'Marigold' : 'Sprig') + '!', 120, 267, 8, '#fff');
    // the guest cannot restart (the engine shows '<opp> can start a new flight'); everyone else flies again from stage 1
    const guest = S.guest != null ? !!S.guest : duo && solo === 1, go = 'fly again';
    if (!guest) { ctx.globalAlpha = .6 + .4 * Math.abs(Math.sin(a * .06)); text(ctx, 'SPACE / tap: ' + go, 120, 284, 9, PAL.sun); ctx.globalAlpha = 1; }
  },
  pause(ctx) { ctx.fillStyle = 'rgba(43,33,64,.45)'; ctx.fillRect(0, 0, 240, 320); text(ctx, 'Paused', 120, 150, 20, '#fff'); text(ctx, 'P to carry on', 120, 172, 9, PAL.sun); },
  wait(ctx, S) { ctx.fillStyle = 'rgba(43,33,64,.35)'; ctx.fillRect(0, 0, 240, 320); const L = lines(S.text || 'Waiting…'); card(ctx, 20, 150 - L.length * 8 - 10, 200, L.length * 16 + 20); L.forEach((s, i) => text(ctx, s, 120, 150 - L.length * 8 + 8 + i * 16, 10, i ? '#fff' : PAL.sun)); },
  upright(ctx, S) {
    const t = (S && S.t) | 0; skyBack(ctx, t); const an = Math.min(1, ((t % 120) / 60)) * PI / 2;
    ctx.save(); ctx.translate(120, 140); ctx.rotate(-PI / 2 + an); ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, -22, -36, 44, 72, 8); ctx.fill(); ctx.fillStyle = PAL.skyPale; ctx.beginPath(); rrect(ctx, -18, -30, 36, 60, 4); ctx.fill(); put(ctx, shipImg(0, 0), 0, 4); ctx.restore();
    text(ctx, 'Turn your phone upright', 120, 210, 12, '#fff'); text(ctx, 'Berry Breeze plays standing tall', 120, 228, 8, '#fff');
  }
};

/* ---------- BB.Art ---------- */
BB.Art = {
  ready: false, R: 2, titlePips: PIPS,
  init(r) { r = Math.max(1, Math.min(4, +r || 2)); if (this.ready && r === R) return; this.rescale(r); },
  rescale(r) {
    r = Math.max(1, Math.min(4, +r || 2)); if (this.ready && r === R) return;
    R = this.R = r; TR = Math.min(R, 2); GC = {}; TXT = new Map(); txtB = 0; GL = new Map(); titleBg = null; PRE = null; Q = [];
    buildGlobal(); const st = curStage; SC = {}; BG = {}; curStage = -1; if (st >= 0) buildStage(st);
    this.ready = true;
  },
  setStage(st) { st = st | 0; if (!this.ready) this.init(R); if (st !== curStage) buildStage(st); },
  flush() { pump(1e9); if (PRE) for (const [k, fn] of PRE.steps.splice(0)) PRE.B[k] = fn(); return Q.length; },   // tests: build everything queued now
  ship(ctx, who, x, y, o) {
    o = o || {}; const t = o.t | 0; who = who ? 1 : 0;
    if (o.ghost) ctx.globalAlpha = .35;
    if (o.down) {
      const sw = Math.sin(t * .05) * .14, py = y - 22;
      put(ctx, GC.dand, x + Math.sin(t * .05) * 2, py - 2);
      ctx.save(); ctx.translate(x + Math.sin(t * .05) * 2, py + 4); ctx.rotate(sw);
      ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, 11); ctx.stroke(); ctx.strokeStyle = PAL.wood; ctx.lineWidth = .7; ctx.stroke();
      ctx.scale(.85, .85); ctx.drawImage(shipImg(who, 0, 'dizzy'), -GC.ship00.lw / 2, 9, GC.ship00.lw, GC.ship00.lh); ctx.restore();
      for (let i = 0; i < 3; i++) { const an = t * .08 + i * TAU / 3; inkStar(ctx, x + Math.cos(an) * 10, y - 3 + Math.sin(an) * 3, 2.4, an, PAL.sun, .8); }
      ctx.globalAlpha = 1; return;
    }
    if (o.blink && ((t >> 2) & 1)) { ctx.globalAlpha = 1; return; }
    const tilt = Math.max(-1, Math.min(1, o.tilt || 0)), bob = Math.sin(t * .084) * 1.5, img = shipImg(who, (t / 5 | 0) & 3);
    if (tilt) putS(ctx, img, x, y - 1.5 + bob, 1 - .08 * Math.abs(tilt), 1, tilt * .14); else put(ctx, img, x, y - 1.5 + bob);
    const ch = o.charge | 0;
    if (ch > 0) { const full = ch >= 60, r = full ? 15 + Math.sin(t * .3) : 15, sw = Math.min(1, ch / 60) * TAU;
      ctx.lineCap = 'round'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.arc(x, y + bob, r, -PI / 2, -PI / 2 + sw); ctx.stroke();
      ctx.strokeStyle = ch >= 30 ? PAL.sun : '#fff1a8'; ctx.lineWidth = 2.2; ctx.stroke();
      if (full) for (let i = 0; i < 4; i++) { const an = t * .12 + i * PI / 2; twinkle(ctx, x + Math.cos(an) * r, y + bob + Math.sin(an) * r, 2.6, an, '#fff'); } }
    const sh = o.shield | 0;
    if (sh > 0) { const r = 16 + Math.sin(t * .15) * .5; ctx.fillStyle = 'rgba(127,208,255,.28)'; circle(ctx, x, y + bob, r); ctx.fill();
      ctx.strokeStyle = sh > 1 ? PAL.blue : '#7fb0ff'; ctx.lineWidth = sh === 3 ? 2.4 : sh === 2 ? 1.6 : 1.2; if (sh === 1) ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y + bob, r - 3.5, PI * 1.08, PI * 1.42); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
  buddy(ctx, who, x, y, t) { put(ctx, GC['bud' + (who ? 1 : 0) + (((t | 0) >> 3) & 1)], x, y + Math.sin((t | 0) * .12) * 1); },
  shot(ctx, kind, x, y, ang, t, who) {
    t = t | 0; if (ang == null) ang = -PI / 2;
    if (kind === 'sun') { for (let i = 1; i <= 3; i++) { ctx.globalAlpha = .7 - i * .18; twinkle(ctx, x + Math.sin(t * .4 + i) * 3, y + 8 + i * 7, 3.4 - i * .6, t * .2 + i, i & 1 ? PAL.sun : '#fff'); } ctx.globalAlpha = 1; seedIcon(ctx, x, y, 1, t * .08); return; }
    const img = kind === 'seedlet' ? GC.seedlet : kind === 'b' ? GC.bshot : GC['shot' + (who ? 1 : 0)];
    if (kind === 'seedlet') { putS(ctx, img, x, y, 1, 1, Math.sin(t * .3) * .3); return; }
    const d = ang + PI / 2; if (Math.abs(d) < .02) put(ctx, img, x, y); else putS(ctx, img, x, y, 1, 1, d);
  },
  enemy(ctx, type, x, y, o) {
    o = o || {}; const t = o.t | 0, a = o.a | 0;
    if (type === 'zap') return drawZap(ctx, x, a, t);
    const B = own(BOSS, type);
    if (B) { const hpf = o.hpf == null || o.hpf < 0 ? 1 : o.hpf; const v = a === 3 ? 3 : hpf < .25 ? 2 : hpf < .5 ? 1 : 0; B.draw(ctx, x, y, t, a, v, !!o.flash && a !== 3); return; }
    const D = own(EN, type); if (!D) { ctx.fillStyle = PAL.lilac; circle(ctx, x, y, 8); ctx.fill(); return; }
    const look = D.looks.indexOf(a) >= 0 ? a : (a === 2 && D.looks.indexOf(1) >= 0 ? 1 : 0), n = D.n(look);
    const f = n > 1 ? ((D.fr ? D.fr(t, look) : (t >> 3)) % n + n) % n : 0, img = enemyImg(type, look, f, !!o.flash);
    const rot = D.rot ? D.rot(t, look, !!o.flash) : 0, dx = D.dx ? D.dx(t, look) : 0, sq = D.sq ? D.sq(t, look) : 1;
    const ang = type === 'glider' && (o.vx || o.vy) ? Math.atan2(o.vy, o.vx) - PI / 2 : 0;
    if (rot || ang || sq !== 1) putS(ctx, img, x + dx, y + (1 - sq) * D.h / 2, 1 / Math.sqrt(sq), sq, rot + ang); else put(ctx, img, x + dx, y);
    if (type === 'ticktock' && look === 1) { ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.1; for (const s of [-1, 1]) for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(x + s * 7 + dx, y - 9, 6 + i * 3 + ((t >> 2) & 1), s < 0 ? PI * 1.05 : PI * 1.6, s < 0 ? PI * 1.4 : PI * 1.95); ctx.stroke(); } }
  },
  bullet(ctx, x, y, big, t) { put(ctx, GC['bul' + (big ? 1 : 0) + (((t | 0) >> 3) & 1)], x, y); },
  fruit(ctx, k, x, y, o) {
    o = o || {}; const t = o.t | 0, sq = o.squash || 0, bob = Math.sin(t * TAU / 40) * 1, img = fruitImg(k | 0);
    if (sq) putS(ctx, img, x, y + bob, 1 + .25 * sq, 1 - .2 * sq); else if (k >= 5) putS(ctx, img, x, y + bob, 1, 1, Math.sin(t * .08) * .12); else put(ctx, img, x, y + bob);
    if (k === 6 || ((t + k * 13) % 48) < 8) { const p = ((t + k * 13) % 48) / 8; twinkle(ctx, x - 4, y - 4 + bob, 2.6 * Math.sin(Math.min(1, p) * PI) + (k === 6 ? 1 : 0), t * .1, '#fff'); }
    if (k < 5) {
      const h = Math.max(0, Math.min(3, o.h | 0));
      ctx.lineCap = 'round'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(43,33,64,.35)'; circle(ctx, x, y + bob, 11); ctx.stroke();
      if (h) { ctx.strokeStyle = h >= 2 ? PAL.sun : '#fff'; ctx.beginPath(); ctx.arc(x, y + bob, 11, -PI / 2, -PI / 2 + h / 3 * TAU); ctx.stroke(); }
      const nk = o.next == null ? (k + 1) % 5 : o.next, ix = x + 9.5, iy = y + bob - 9.5;
      ctx.fillStyle = PAL.ink; circle(ctx, ix, iy, 5.2); ctx.fill(); ctx.fillStyle = '#fff'; circle(ctx, ix, iy, 4.3); ctx.fill(); put(ctx, iconImg(nk), ix, iy);
    }
  },
  bg(ctx, stage, s, t, o) {
    stage = stage | 0; t = t | 0; const calm = (o && o.calm) || 0;
    if (!this.ready) this.init(R); if (stage !== curStage || !BG.tile) buildStage(stage); if (Q.length) pump(2);
    if (BG.kind === 'meadow') { scrollTile(ctx, BG.tile, s); inst(ctx, BG.cloud, [[46, 0], [196, 190], [110, 380]], s * 1.6, 560); }
    else if (BG.kind === 'sky') {
      ctx.drawImage(BG.grad[0], 0, 0, 240, 320); if (calm > 0) { ctx.globalAlpha = calm; ctx.drawImage(BG.grad[1], 0, 0, 240, 320); ctx.globalAlpha = 1; }
      ctx.globalAlpha = .55; inst(ctx, BG.bank, [[60, 0], [200, 220]], s * .3, 440); ctx.globalAlpha = .7; inst(ctx, BG.puff, [[30, 40], [170, 160], [100, 300]], s * .6, 420); ctx.globalAlpha = 1;
      scrollTile(ctx, BG.tile, s); ctx.globalAlpha = .6; inst(ctx, BG.puff, [[200, 0], [40, 260]], s * 1.4, 520); ctx.globalAlpha = 1;
    } else {
      scrollTile(ctx, BG.tile, s);
      const bo = ((s + t * .6) % 12 + 12) % 12; for (const bx of [45, 195]) ctx.drawImage(BG.belt, bx - 15 - PAD, bo - 12 - PAD, BG.belt.lw, BG.belt.lh);
      ctx.globalAlpha = .25; for (const [gx, gy, d] of [[18, 60, 1], [226, 260, -1], [120, 470, 1]]) { const y = ((gy + s) % 640 + 640) % 640 - 60; if (y < 380) putS(ctx, BG.gear, gx, y, 1, 1, t * .01 * d); }
      ctx.globalAlpha = .4 * (1 - calm); if (calm < 1) inst(ctx, BG.haze, [[120, 0], [120, 300]], s * 1.3, 600);
      ctx.globalAlpha = 1; if (calm > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (.15 * calm).toFixed(3) + ')'; ctx.fillRect(0, 0, 240, 320); }
    }
  },
  fx(ctx, f, age) { // an fx that throws (e.g. odd net args) is dropped, and its canvas state never leaks
    age = age | 0; if (age < 0) return true; ctx.save();
    try { const k = String(f.k), fn = own(FX, k) || FX.spark, L = own(LIFE, k) || 7, life = typeof L === 'function' ? L(f) : L; return age < life && fn(ctx, f, age) !== false; }
    catch (e) { if (!fxErr) { fxErr = 1; console.warn('BB.Art.fx', f && f.k, e); } return false; }
    finally { ctx.restore(); }
  },
  hud(ctx, H) {
    H = H || {}; const t = H.t | 0, ps = H.p || [];
    const un = H.under || [];   // a pill fades while a ship or fruit is under it (engine sets H.under = [left, right])
    if (ps[0]) { ctx.globalAlpha = un[0] ? .45 : 1; drawPlayerPill(ctx, ps[0], 2, 2, t); ctx.globalAlpha = 1; }
    if (ps[1] && ps[1].joined !== false) { ctx.globalAlpha = un[1] ? .45 : 1; drawPlayerPill(ctx, ps[1], 144, 2, t); ctx.globalAlpha = 1; }
    else if (!H.touch) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); rrect(ctx, 144.5, 2.5, 93, 26, 8); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = .55 + .45 * Math.abs(Math.sin(t * .05)); text(ctx, 'Hold ENTER', 191, 10, 8, PCOL[1]); text(ctx, 'to join!', 191, 21, 8, '#fff'); ctx.globalAlpha = 1; }
    text(ctx, String(H.score | 0), 120, 9, 10, '#fff');
    const bk = H.basket | 0; putS(ctx, glob('basket', 16, 12, drawBasket), 107, 22, .7);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = PAL.ink; circle(ctx, 116 + i * 5.5, 22.5, 2.2); ctx.fill(); ctx.fillStyle = i < bk % 5 ? PAL.sun : 'rgba(255,255,255,.4)'; circle(ctx, 116 + i * 5.5, 22.5, 1.5); ctx.fill(); }
    // local co-op: who flies with which keys, for 7 s after the second player joins
    const co = !H.touch && ps[0] && ps[1] && ps[1].joined !== false && ps[0].local && ps[1].local;
    if (!co) coopT = -1; else if (coopT < 0 || t < coopT) coopT = t;
    if (co && t - coopT < 420) { ctx.globalAlpha = Math.min(1, (420 - (t - coopT)) / 60);
      for (const [x, s] of [[49, 'W A S D + SPACE'], [191, 'arrows + ENTER']]) { pill(ctx, x - 44, 32, 88, 13); text(ctx, s, x, 38.5, 8, PCOL[x < 120 ? 0 : 1]); } ctx.globalAlpha = 1; }
    if (H.boss) { // the GRUMP bar runs along the bottom, clear of the boss's head and the fruit ceiling; it leaves the SEED button's corner free
      const f = Math.max(0, Math.min(1, H.boss.hpf < 0 ? 1 : H.boss.hpf == null ? 1 : H.boss.hpf)), y = 313, x1 = H.touch ? 182 : H.net ? 172 : 236;
      const bx = 6 + text(ctx, String(H.boss.name || '').slice(0, 16), 5, y, 8, '#fff', 'left') + 4, bw = Math.max(30, x1 - text(ctx, 'GRUMP', x1, y, 8, '#e4d8ff', 'right') - 4 - bx);
      ctx.fillStyle = PAL.ink; ctx.beginPath(); rrect(ctx, bx, y - 3.5, bw, 7, 3.5); ctx.fill(); ctx.fillStyle = '#fff3b0'; ctx.beginPath(); rrect(ctx, bx + 1.2, y - 2.3, bw - 2.4, 4.6, 2.3); ctx.fill();
      if (f > 0) { const fw = (bw - 2.4) * f; ctx.fillStyle = mix(PAL.purple, PAL.gold, 1 - f); ctx.beginPath(); rrect(ctx, bx + 1.2, y - 2.3, Math.max(4.6, fw), 4.6, 2.3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillRect(bx + 3, y - 1.6, Math.max(0, fw - 5), 1.1); } }
    if (H.hint) { const b = Math.sin(t * .1) * 1.5; text(ctx, H.hint, 120, 262 + b, 9, '#fff'); }
    if (H.net) { ctx.globalAlpha = .85; text(ctx, H.net, 237, 313, 8, '#fff', 'right'); ctx.globalAlpha = 1; }
  },
  text(ctx, s, x, y, size, fill, align) { return text(ctx, s, x, y, size, fill, align); },
  screen(ctx, kind, S) { const fn = SCREENS[kind]; if (fn) fn(ctx, S || {}); },
  touchPad(ctx, o) {
    o = o || {}; const r = o.rect;
    if (r) { ctx.fillStyle = 'rgba(43,33,64,.08)'; ctx.beginPath(); rrect(ctx, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 14); ctx.fill();
      ctx.fillStyle = 'rgba(43,33,64,.12)'; for (let y = r.y + 14; y < r.y + r.h - 8; y += 12) for (let x = r.x + 14; x < r.x + r.w - 60; x += 12) { circle(ctx, x, y, 1); ctx.fill(); }
      text(ctx, 'drag here to fly', r.x + (r.w - 50) / 2, r.y + r.h / 2, 9, '#fff'); }
    const sx = o.seedX == null ? 212 : o.seedX, sy = o.seedY == null ? 292 : o.seedY, s = o.seedDown ? .92 : 1;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(s, s); ctx.fillStyle = o.seedDown ? 'rgba(255,217,59,.85)' : 'rgba(255,217,59,.55)'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 2; circle(ctx, 0, 0, 22); ctx.fill(); ctx.stroke();
    seedIcon(ctx, 0, -3, .62, 0); text(ctx, 'SEED', 0, 13, 8, '#fff'); ctx.restore();
  },
  stageColor(st) { return { meadow: '#e9f7d9', sky: '#ece4fb', works: '#e6e9f5' }[bgKind(st | 0)] || '#e9f7d9'; },
  mem(main) { let n = 0; const add = c => { if (c && c.width) n += c.width * c.height * 4; }; for (const k in GC) add(GC[k]); for (const k in SC) add(SC[k]); add(main);   // main: the game canvas, if given
    for (const B of [BG, PRE && PRE.B]) for (const k in B) { const v = B[k]; if (Array.isArray(v)) v.forEach(add); else add(v); } TXT.forEach(add); GL.forEach(o => { add(o.ink); add(o.fill); }); if (titleBg) { add(titleBg.grad); add(titleBg.cloud); } return n; }
};
})();
