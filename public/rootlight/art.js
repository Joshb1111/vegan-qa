/* ROOTLIGHT — art.js (ART). RL.Art draws every *thing* in code (docs/rootlight/INTERFACE.md, "Art"): SPRIG and MARIGOLD,
   the glooms, the four guardians, guardian hazards, shots, dew, pickups, flowers, buds, props, HUD icons and portraits.
   House style of the family (Berry Breeze / Vine Line / Sprout Kart): thick dark-plum ink outlines, two-tone shading with a
   glossy highlight, soft pastel colours, round chunky shapes; a little moodier underground. Glooms and guardians have NO
   faces (shape, soot, droop, scribbles and sparks only); flowers have no faces; nothing is an animal.
   Sprites are baked once into offscreen canvases at render scale R (keyed by kind / state / frame) and blitted; swing arcs,
   trails, glows, hazards and a few guardian parts (needles, doors, smoke, tendrils) are drawn live.
   Positions: players x,y = feet centre; foes, guardians, items, shots, drops = centre; rect things (gates, platforms,
   hazards) x,y = top-left with w,h; floor things (spot, npc, sign, lever, vent, cap, bud, flower, dew cluster) are drawn
   standing on the floor line under their cell (y snapped down to the 20 px grid), ceiling things hang from the line above.
   Small extras the sim may set (all optional): Gt.seals [knot, boiler, cloud] bools (or Gt.lit 0..3) = lit sockets on the
   'seal' door (a wide seal gate is a floor hatch with three sockets in a row, plus a big medallion on the wall above it);
   I.hurt (a cluster shakes); I.got (not drawn). Tells read their progress from Hz.tell (ramps over ~50 ticks) and Gd.t.
   Every warning (Hz.tell > 0) is loud: a pulsing warm fill, a thick warm outline over ink, arrows marching the way the attack
   comes and a ring on the floor where a column lands (a sweeping vine shows its whole lane). A 'tired' guardian glows
   pink-gold inside, breathes out a ring, sparkles and sighs: the moment to swing.
   Every entry point never throws (errors go to RL.Art.errors) and leaves ctx.globalAlpha / composite mode as it found them.
   Test sheet: docs/rootlight/test/art.html?sec=heroes|glooms|guardians|hazards|things|props|icons|portraits|busy&R=1..4 */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis;
const RL = G.RL = G.RL || {};
const TAU = Math.PI * 2, PI = Math.PI;
const PAL = { ink: '#2b2140', plum: '#4a3a6b', cream: '#fff6e0', cloudSh: '#c9c3e6', sun: '#ffd93b', gold: '#f5a623', leaf: '#4cc46a',
  leafDk: '#2f8f5a', wood: '#b9774a', sky: '#7fd0ff', dew: '#6fd0ff', soot: '#3e3650', pink: '#ff9abb', white: '#ffffff' };
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const mix = (a, b, t) => { if (t <= 0) return a; if (t >= 1) return b; const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const tint = (h, t) => mix(h, '#ffffff', t);
const mixM = (a, b, t) => a.map((c, i) => mix(c, b[i], t));
const rgba = (h, a) => { const c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - clamp01(t), 3);
const num = (v, d) => typeof v === 'number' && isFinite(v) ? v : d;
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function rng(seed) { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const floorY = y => Math.ceil(y / 20 - 1e-3) * 20;   // floor things stand on the floor line under their cell
const ceilY = y => Math.floor(y / 20 + 1e-3) * 20;   // ceiling things hang from the line above their cell
const FONT = '"Arial Rounded MT Bold", ui-rounded, "Varela Round", "Trebuchet MS", system-ui, sans-serif';
const font = s => 'bold ' + s + 'px ' + FONT;

// material triples [base, dark, light]
const M = {
  LEAF: ['#86dc5c', '#3f9a3a', '#e6ffd6'], LEAFD: ['#4cc46a', '#2f8f5a', '#c9f7c1'], FLUFF: ['#ffffff', '#d6d0ec', '#ffffff'],
  WOOD: ['#b9774a', '#8a5530', '#ecc7a2'], BARK: ['#9c6c4c', '#6a4430', '#d4ac8c'], SUN: ['#ffd93b', '#f5a623', '#fffbe0'],
  GOLD: ['#ffcf3f', '#e8941c', '#fff4c4'], CREAM: ['#fff6e0', '#d8cbb8', '#ffffff'], DEW: ['#7fd8ff', '#3f8fd8', '#e8f9ff'],
  ROSE: ['#ff9abb', '#e0607f', '#ffe2ec'], LILAC: ['#c8b2ff', '#9b6bff', '#f1eaff'], MOSS: ['#8fd16a', '#4f9a3f', '#dff7c8'],
  STONE: ['#a8a2b8', '#6f6984', '#dcd8e6'], METAL: ['#8a94b8', '#4a3a6b', '#dfe3f5'], TEAL: ['#5fd0c4', '#2a948a', '#d4f6f1'],
  STRAW: ['#f2cf6a', '#c99a32', '#fff1c0'], PLUM: ['#4a3a6b', '#2b2140', '#8a7ab0'], RED: ['#ff6b6b', '#c22d4f', '#ffd6d6'],
  CRYS: ['#9fe6ff', '#4fa8e0', '#f0fcff'], CLOUD: ['#ffffff', '#cfc9ea', '#ffffff'], COPPER: ['#e0905a', '#a65a34', '#ffd2b0'],
  // glooms: grey and soot, each with a hint of a sad colour
  SMOG: ['#a49db4', '#6b6484', '#dcd8e6'], BRAM: ['#8b8091', '#544c60', '#c2bacb'], BONE: ['#d8d0cc', '#9a908c', '#f6f2ee'],
  GOO: ['#97a0b4', '#5d667c', '#d6dce8'], RUST: ['#b08e7e', '#74574e', '#e0cabc'], IRON: ['#9d9dac', '#5c5c6e', '#dadae4'],
  POD: ['#a6af9c', '#68725f', '#dae0d2'], TIN: ['#a0a7b6', '#5e6578', '#dce0ea'], LID: ['#948e9c', '#5a5464', '#d0ccd6'],
  SOOT: ['#6f6880', '#463f56', '#a8a1b8'], VINEG: ['#7a6e7e', '#4a4252', '#b0a6b6']
};
let R = 2, LOW = false, FLASH = false, GA = 1;
const PAD = 3;
let SC = new Map();
const ERR = [];
function err(e) { if (ERR.length < 20) { ERR.push(String(e && e.stack || e)); if (G.console) console.warn('RL.Art', e); } }

/* ---------- sprites ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
// bake(key, w, h, ax, ay, draw, flash, density): a w x h logical box whose anchor (ax, ay) is the drawing origin
function bake(key, w, h, ax, ay, draw, fl, d) {
  let c = SC.get(key); if (c) return c;
  d = d || R; c = canvas((w + PAD * 2) * d, (h + PAD * 2) * d); c.lw = c.width / d; c.lh = c.height / d; c.ox = PAD + ax; c.oy = PAD + ay;
  const g = c.getContext('2d'); g.scale(d, d); g.translate(c.ox, c.oy); g.lineJoin = 'round'; g.lineCap = 'round';
  FLASH = !!fl; try { draw(g); } catch (e) { err(e); } finally { FLASH = false; }
  SC.set(key, c); return c;
}
function put(ctx, c, x, y) { ctx.drawImage(c, Math.round((x - c.ox) * R) / R, Math.round((y - c.oy) * R) / R, c.lw, c.lh); }
function putT(ctx, c, x, y, sx, sy, rot) {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(sx, sy == null ? Math.abs(sx) : sy); ctx.drawImage(c, -c.ox, -c.oy, c.lw, c.lh); ctx.restore();
}
function putA(ctx, c, x, y, a, sx, sy, rot) { if (a <= 0) return; const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * Math.min(1, a); if (sx == null) put(ctx, c, x, y); else putT(ctx, c, x, y, sx, sy, rot); ctx.globalAlpha = a0; }
// soft glow discs (gradient textures do not depend on R)
const GLW = new Map();
function glowTex(col) {
  let c = GLW.get(col); if (c) return c;
  c = canvas(64, 64); const g = c.getContext('2d'), q = rgb(col), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32), s = q.join(',');
  gr.addColorStop(0, 'rgba(' + s + ',1)'); gr.addColorStop(.3, 'rgba(' + s + ',.5)'); gr.addColorStop(.65, 'rgba(' + s + ',.14)'); gr.addColorStop(1, 'rgba(' + s + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); GLW.set(col, c); return c;
}
function glow(ctx, x, y, r, col, a) { if (!(a > 0) || !(r > 0)) return; const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * Math.min(1, a); ctx.drawImage(glowTex(col), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = a0; }

/* ---------- path builders and the outlined / shaded part system (as Berry Breeze) ---------- */
function rrect(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const E = (cx, cy, rx, ry, rot) => g => g.ellipse(cx, cy, Math.max(.01, rx), Math.max(.01, ry), rot || 0, 0, TAU);
const C = (cx, cy, r) => g => g.arc(cx, cy, Math.max(.01, r), 0, TAU);
const RR = (x, y, w, h, r) => g => rrect(g, x, y, w, h, r);
const POLY = pts => g => { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
// a leaf from its base (x, y) along angle a, length L, half-width w
const LF = (x, y, a, L, w) => g => {
  const c = Math.cos(a), s = Math.sin(a), p = (u, v) => [x + u * c - v * s, y + u * s + v * c], t = p(L, 0), c1 = p(L * .42, -w * 1.25), c2 = p(L * .42, w * 1.25);
  g.moveTo(x, y); g.quadraticCurveTo(c1[0], c1[1], t[0], t[1]); g.quadraticCurveTo(c2[0], c2[1], x, y); g.closePath();
};
const STAR = (cx, cy, r, ri, n, rot) => g => { for (let i = 0; i < n * 2; i++) { const a = rot + i * PI / n, q = i & 1 ? ri : r; g.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); } g.closePath(); };
const HEARTP = (cx, cy, s) => g => { g.moveTo(cx, cy + 3 * s); g.bezierCurveTo(cx - 5 * s, cy - .5 * s, cx - 2.6 * s, cy - 4.2 * s, cx, cy - 1.6 * s); g.bezierCurveTo(cx + 2.6 * s, cy - 4.2 * s, cx + 5 * s, cy - .5 * s, cx, cy + 3 * s); g.closePath(); };
// a body bean: flat-ish top, fuller bottom
const BEAN = (cx, cy, rx, ry) => g => { g.moveTo(cx, cy - ry); g.bezierCurveTo(cx + rx * 1.3, cy - ry, cx + rx * 1.4, cy + ry * .98, cx, cy + ry); g.bezierCurveTo(cx - rx * 1.4, cy + ry * .98, cx - rx * 1.3, cy - ry, cx, cy - ry); g.closePath(); };
// a seed / almond: pointed top
const SEED = (cx, cy, rx, ry) => g => { g.moveTo(cx, cy - ry); g.bezierCurveTo(cx + rx * .55, cy - ry * .8, cx + rx * 1.3, cy - ry * .1, cx + rx * .98, cy + ry * .45); g.bezierCurveTo(cx + rx * .7, cy + ry * 1.02, cx - rx * .7, cy + ry * 1.02, cx - rx * .98, cy + ry * .45); g.bezierCurveTo(cx - rx * 1.3, cy - ry * .1, cx - rx * .55, cy - ry * .8, cx, cy - ry); g.closePath(); };
const GEAR = (cx, cy, r, n, rot) => g => { const ri = r * .78; for (let i = 0; i < n; i++) { const a = rot + i * TAU / n, w = PI / n * .55; g.lineTo(cx + Math.cos(a - w * 1.15) * ri, cy + Math.sin(a - w * 1.15) * ri); g.lineTo(cx + Math.cos(a - w * .7) * r, cy + Math.sin(a - w * .7) * r); g.lineTo(cx + Math.cos(a + w * .7) * r, cy + Math.sin(a + w * .7) * r); g.lineTo(cx + Math.cos(a + w * 1.15) * ri, cy + Math.sin(a + w * 1.15) * ri); } g.closePath(); };
const Pt = (m, path, r, cx, cy) => ({ base: m[0], dark: m[1], lite: m[2], path, r: r || 4, cx, cy, hl: cx != null });
function outlined(g, parts, w) {
  w = w == null ? 2 : w; g.fillStyle = g.strokeStyle = PAL.ink; g.lineWidth = w * 2;
  for (const p of parts) { g.beginPath(); p.path(g); g.fill(); if (w > 0) g.stroke(); }
  for (const p of parts) shade(g, p);
}
function shade(g, p) {
  g.save(); g.beginPath(); p.path(g); g.clip();
  if (FLASH) { g.fillStyle = '#fff'; g.fill(); g.restore(); return; }
  g.fillStyle = p.dark; g.fill();
  const k = p.r * .22; g.translate(-k, -k); g.beginPath(); p.path(g); g.fillStyle = p.base; g.fill(); g.translate(k, k);
  if (p.hl && p.lite) {
    g.fillStyle = p.lite;
    g.beginPath(); g.ellipse(p.cx - p.r * .38, p.cy - p.r * .42, p.r * .34, p.r * .18, -.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(p.cx - p.r * .05, p.cy - p.r * .62, Math.max(.45, p.r * .07), 0, TAU); g.fill();
  }
  g.restore();
}
// a stroked line with an ink rim: path(g) builds it
function inkLine(g, path, w, col, hl) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); path(g); g.strokeStyle = PAL.ink; g.lineWidth = w + 2.2; g.stroke();
  g.strokeStyle = FLASH ? '#fff' : col; g.lineWidth = w; g.stroke();
  if (hl && !FLASH) { g.save(); g.translate(-w * .18, -w * .22); g.beginPath(); path(g); g.strokeStyle = hl; g.lineWidth = Math.max(.4, w * .3); g.stroke(); g.restore(); }
}
function lid(g, x, y, w, h, s, k, col, lw) {
  const yo = y - h * (.1 + .25 * k), yi = y - h * (.1 - .25 * k), yl = s < 0 ? yo : yi, yr = s < 0 ? yi : yo;
  g.save(); g.beginPath(); g.ellipse(x, y, w / 2 + .6, h / 2 + .6, 0, 0, TAU); g.clip();
  g.fillStyle = col; g.beginPath(); g.moveTo(x - w, y - h); g.lineTo(x + w, y - h); g.lineTo(x + w, yr); g.lineTo(x - w, yl); g.closePath(); g.fill();
  if (lw) { g.lineWidth = lw; g.strokeStyle = PAL.ink; g.beginPath(); g.moveTo(x - w, yl); g.lineTo(x + w, yr); g.stroke(); }
  g.restore();
}
// cartoon eye (heroes and the Peddler only). mood: open, shut (peaceful), happy (^), wince (> <), det (determined), sad, wow
function eye(g, x, y, h, o) {
  o = o || {}; const w = h * .72, m = o.mood || 'open';
  g.save(); g.strokeStyle = PAL.ink; g.lineCap = 'round'; g.lineJoin = 'round';
  if (m === 'shut') { g.lineWidth = Math.max(.8, h * .16); g.beginPath(); g.arc(x, y - h * .12, w * .48, PI * .18, PI * .82); g.stroke(); g.restore(); return; }
  if (m === 'happy') { g.lineWidth = Math.max(.8, h * .16); g.beginPath(); g.arc(x, y + h * .18, w * .52, PI * 1.15, PI * 1.85); g.stroke(); g.restore(); return; }
  if (m === 'wince') { const s = o.side || 1; g.lineWidth = Math.max(.8, h * .15); g.beginPath(); g.moveTo(x - s * w * .42, y - h * .28); g.lineTo(x + s * w * .38, y); g.lineTo(x - s * w * .42, y + h * .28); g.stroke(); g.restore(); return; }
  const hh = m === 'wow' ? h * 1.1 : h, ww = hh * .72;
  g.lineWidth = Math.max(.7, h * .1); g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, y, ww / 2, hh / 2, 0, 0, TAU); g.fill(); g.stroke();
  const lx = x + (o.look || 0) * ww * .14, ly = y + (o.lookY || 0) * hh * .12, ps = m === 'wow' ? .85 : 1;
  g.fillStyle = PAL.ink; g.beginPath(); g.ellipse(lx, ly + hh * .07, ww * .34 * ps, hh * .38 * ps, 0, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(lx - ww * .13, ly - hh * .08, Math.max(.45, hh * .14), 0, TAU); g.fill();
  g.beginPath(); g.arc(lx + ww * .12, ly + hh * .22, Math.max(.3, hh * .06), 0, TAU); g.fill();
  if (m === 'det') lid(g, x, y, ww, hh, o.side || 1, -.16, o.lid || '#fff', Math.max(.8, h * .1));
  if (m === 'sad') lid(g, x, y, ww, hh, o.side || 1, .26, o.lid || '#fff', Math.max(.8, h * .1));
  g.restore();
}
function blush(g, pts, rx, ry) { if (FLASH) return; g.fillStyle = 'rgba(255,140,125,.72)'; for (const [x, y] of pts) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); } }
function mouth(g, x, y, r, kind, lw) {
  g.save(); g.strokeStyle = PAL.ink; g.fillStyle = PAL.ink; g.lineWidth = lw || 1; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
  if (kind === 'open') { g.moveTo(x - r, y - r * .35); g.quadraticCurveTo(x, y - r * .15, x + r, y - r * .35); g.quadraticCurveTo(x + r * .9, y + r * 1.15, x, y + r * 1.15); g.quadraticCurveTo(x - r * .9, y + r * 1.15, x - r, y - r * .35); g.closePath(); g.fill();
    g.fillStyle = '#ff8a9a'; g.beginPath(); g.ellipse(x, y + r * .7, r * .48, r * .3, 0, 0, TAU); g.fill(); }
  else if (kind === 'o') { g.ellipse(x, y + r * .2, r * .5, r * .62, 0, 0, TAU); g.fill(); }
  else if (kind === 'frown') { g.arc(x, y + r * .9, r * .75, 1.25 * PI, 1.75 * PI); g.stroke(); }
  else if (kind === 'flat') { g.moveTo(x - r * .7, y); g.lineTo(x + r * .7, y); g.stroke(); }
  else if (kind === 'wave') { g.moveTo(x - r, y); g.quadraticCurveTo(x - r * .5, y - r * .5, x, y); g.quadraticCurveTo(x + r * .5, y + r * .5, x + r, y); g.stroke(); }
  else { g.arc(x, y - r * .4, r, .2 * PI, .8 * PI); g.stroke(); }
  g.restore();
}
// the "grumpy scribble": a messy spiral of soot (how glooms show their mood; never a face)
function scribble(g, x, y, r, rot, lw, col, sq) {
  if (FLASH) return;
  g.save(); g.strokeStyle = col || 'rgba(52,42,72,.82)'; g.lineWidth = lw || 1.2; g.lineCap = g.lineJoin = 'round'; g.beginPath();
  for (let i = 0; i <= 30; i++) { const a = rot + i * .66, q = r * (.22 + .78 * i / 30) * (1 + .2 * Math.sin(i * 2.3)); g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q * (sq || .85)); }
  g.stroke(); g.restore();
}
function twinkle(ctx, x, y, r, rot, col) { ctx.fillStyle = col || '#fff'; ctx.beginPath(); STAR(x, y, r, r * .3, 4, rot || 0)(ctx); ctx.fill(); }
function dots(g, pts, r, col) { g.fillStyle = col; for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } }
function rivets(g, pts, r, col) { if (FLASH) return; dots(g, pts, r, col || 'rgba(255,255,255,.55)'); }
function zImg() { return bake('z', 8, 9, 4, 4.5, g => { const z = g2 => { g2.moveTo(-2.4, -2.8); g2.lineTo(2.4, -2.8); g2.lineTo(-2.4, 2.8); g2.lineTo(2.4, 2.8); }; inkLine(g, z, 1.5, '#ffffff'); }); }
function fallback(ctx, x, y, r) { ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(num(x, 0), num(y, 0), r + 1.5, 0, TAU); ctx.fill(); ctx.fillStyle = '#a49db4'; ctx.beginPath(); ctx.arc(num(x, 0), num(y, 0), r, 0, TAU); ctx.fill(); }

/* =====================================================================================================================
   HEROES: SPRIG (a green sprout-bean, two perky leaves, big eyes, tiny feet) and MARIGOLD (same body, an orange marigold
   petal ruff). Facing right, origin at the feet centre. Body frames are baked; the DANDELION STAFF and the front hand are
   drawn live (they swing).
   ===================================================================================================================== */
const HERO = [
  { body: ['#66d47e', '#2f8f5a', '#d8fad0'], foot: ['#3f9f5e', '#23683f', '#a8e8b5'], leaf: ['#8ee05e', '#3f9a3a', '#e8ffd8'] },
  { body: ['#ffc45c', '#e6861c', '#fff2d0'], foot: ['#e0782e', '#9e4c1a', '#ffc896'], pet: [['#ff8a2a', '#cf531c', '#ffd2a4'], ['#ffad36', '#e0801c', '#fff0bc']] }
];
function sprigTop(g, x, top, o) {
  const H = HERO[0], sw = o.sway || 0, sp = o.spread || 0, sx = x + .4, sy = top - 2.6;
  g.lineCap = 'round'; g.strokeStyle = PAL.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(x, top + 1.5); g.lineTo(sx, sy); g.stroke();
  g.strokeStyle = FLASH ? '#fff' : H.leaf[1]; g.lineWidth = 1.2; g.stroke();
  const a1 = -PI / 2 - .78 - sp + sw, a2 = -PI / 2 + .78 + sp + sw, L = o.leafL || 7.4;
  outlined(g, [Pt(H.leaf, LF(sx, sy, a1, L, 3.1), 3, sx + Math.cos(a1) * L * .5, sy + Math.sin(a1) * L * .5), Pt(H.leaf, LF(sx, sy, a2, L, 3.1), 3, sx + Math.cos(a2) * L * .5, sy + Math.sin(a2) * L * .5)], 1.4);
  if (!FLASH) { g.strokeStyle = H.leaf[1]; g.lineWidth = .6; g.beginPath(); for (const a of [a1, a2]) { g.moveTo(sx + Math.cos(a) * 1.4, sy + Math.sin(a) * 1.4); g.lineTo(sx + Math.cos(a) * L * .72, sy + Math.sin(a) * L * .72); } g.stroke(); }
}
function mariRuff(g, x, y, rx, ry, o) {
  const H = HERO[1], sw = (o.sway || 0) * .5, sp = (o.spread || 0) * .3, lay = (n, d, m, l, w, off) => {
    const parts = [];
    for (let i = 0; i < n; i++) {
      const a = PI * (.86 - sp) + (PI * (1.28 + sp * 2)) * (i + off) / (n - 1) + sw, cx = x + Math.cos(a) * (rx + d), cy = y + Math.sin(a) * (ry + d) - 1;
      parts.push(Pt(m, E(cx, cy, l, w, a), 3, cx, cy));
    }
    outlined(g, parts, 1.3);
  };
  lay(9, 1.6, H.pet[0], 4.6, 2.7, 0); lay(8, .2, H.pet[1], 4, 2.3, .5);
}
function heroFace(g, cx, cy, o, s, who) {
  s = s || 1; const e = o.eyes || 'open', ex = 3 * s, ey = cy - 1.4 * s, eh = 6.8 * s, look = o.lookE == null ? .9 : o.lookE;
  const lidc = o.lidc || HERO[who || 0].body[0];
  if (e === 'shut' || e === 'happy') { eye(g, cx - ex, ey, eh, { mood: e }); eye(g, cx + ex, ey, eh, { mood: e }); }
  else if (e === 'wince') { eye(g, cx - ex, ey, eh, { mood: 'wince', side: 1 }); eye(g, cx + ex, ey, eh, { mood: 'wince', side: -1 }); }
  else { eye(g, cx - ex, ey, eh, { mood: e, look, lookY: o.lookY || 0, side: 1, lid: lidc }); eye(g, cx + ex, ey, eh, { mood: e, look, lookY: o.lookY || 0, side: -1, lid: lidc }); }
  blush(g, [[cx - 5.6 * s, cy + 2.2 * s], [cx + 5.6 * s, cy + 2.2 * s]], 1.6 * s, 1 * s);
  const mk = o.mouth || 'smile';
  mouth(g, cx, cy + (mk === 'open' || mk === 'o' ? 2.6 : 3.1) * s, (mk === 'open' ? 1.7 : 1.5) * s, mk, .95 * s);
}
// o: by (body centre y), sx, sy, tilt, feet, bh (back hand), spread, sway, eyes, mouth, look (face shift), staffB (a baked staff)
function drawHero(g, who, o) {
  const H = HERO[who], bx = o.bx || 0, by = o.by == null ? -11 : o.by, rx = 8.3 * (o.sx || 1), ry = 9 * (o.sy || 1);
  if (o.staffB && !o.staffFront) drawStaff(g, o.staffB[0], o.staffB[1], o.staffB[2], 1);
  if (o.feet) outlined(g, o.feet.map(([x, y]) => Pt(H.foot, E(x, y, 3.1, 2.1), 3, x, y - .4)), 1.4);
  g.save(); if (o.tilt) { g.translate(bx, by + ry); g.rotate(o.tilt); g.translate(-bx, -(by + ry)); }
  if (o.bh) outlined(g, [Pt(H.body, C(o.bh[0], o.bh[1], 2.3), 2.3, o.bh[0], o.bh[1])], 1.3);
  if (!who) sprigTop(g, bx, by - ry, o); else mariRuff(g, bx, by, rx, ry, o);
  outlined(g, [Pt(H.body, BEAN(bx, by, rx, ry), 9, bx - .6, by - 1)]);
  if (!FLASH) { g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(bx - 2.4, by + ry * .5, rx * .4, ry * .2, -.3, 0, TAU); g.fill(); }
  if (o.face !== false) heroFace(g, bx + (o.look == null ? 1.5 : o.look), by + .6, o, 1, who);
  if (o.fhB) outlined(g, [Pt(H.body, C(o.fhB[0], o.fhB[1], 2.3), 2.3, o.fhB[0], o.fhB[1])], 1.3);
  g.restore();
  if (o.staffB && o.staffFront) drawStaff(g, o.staffB[0], o.staffB[1], o.staffB[2], 1);
  if (o.tendrils && !FLASH) for (const [x, y, d] of o.tendrils) { // little vine tendrils gripping the wall
    inkLine(g, g2 => { g2.moveTo(x, y); g2.bezierCurveTo(x - 1.6, y + d * 1.2, x - 3.2, y - d * .4, x - 4.6, y + d * 1.4); }, .9, '#6fcf5a');
    outlined(g, [Pt(M.LEAF, LF(x - 2.6, y + d * .6, PI + d * .9, 2.8, 1.1), 1.5)], .8);
  }
}
// the dandelion staff: grip at (x, y), angle a (0 = head up, clockwise), scale s
function drawStaff(g, x, y, a, s) {
  g.save(); g.translate(x, y); if (a) g.rotate(a); if (s && s !== 1) g.scale(s, s);
  inkLine(g, g2 => { g2.moveTo(0, 6.5); g2.quadraticCurveTo(.9, -6, 0, -17.6); }, 1.5, '#72d05c', '#c8f5a8');
  outlined(g, [Pt(M.LEAF, LF(.5, -5.2, -.75, 4.4, 1.6), 2)], .9);
  seedPuff(g, 0, -22, 5.4);
  g.restore();
}
function seedPuff(g, x, y, r) {
  const parts = [Pt(M.FLUFF, C(x, y, r * .8), r)];
  for (let i = 0; i < 10; i++) { const a = i * TAU / 10 - PI / 2; parts.push(Pt(M.FLUFF, C(x + Math.cos(a) * r * .74, y + Math.sin(a) * r * .74, r * .38), r * .4)); }
  outlined(g, parts, .85);
  if (FLASH) return;
  g.strokeStyle = 'rgba(150,140,190,.55)'; g.lineWidth = .35; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = i * TAU / 10 - PI / 2 + .3; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r * .85, y + Math.sin(a) * r * .85); } g.stroke();
  g.fillStyle = '#c99a5a'; g.beginPath(); g.arc(x, y + .3, r * .2, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x - r * .35, y - r * .4, r * .32, r * .18, -.6, 0, TAU); g.fill();
}
const POSE = new Map();
function heroPose(name, f) {
  const key = name + (f | 0); let o = POSE.get(key); if (o) return o;
  o = { by: -11, sx: 1, sy: 1, tilt: 0, feet: [[-3.7, -2.1], [3.9, -2.1]], bh: [-8.6, -8.2], spread: 0, sway: 0, eyes: 'open', mouth: 'smile', fh: [8.4, -4.8], sa: .08 };
  switch (name) {
    case 'blink': o.eyes = 'shut'; break;
    case 'run': { const p = f / 8 * TAU, c = Math.cos(p), s = Math.sin(p), bob = (1 - Math.abs(c)) * 1.3;
      o.feet = [[-c * 4.4 - .3, -2.1 - Math.max(0, -s) * 2.6], [c * 4.4 + .6, -2.1 - Math.max(0, s) * 2.6]];
      o.by = -10.6 - bob; o.tilt = .1; o.bh = [-8.2 - c * 2, -8.2 - bob + s * .5]; o.sway = -.2 + s * .08; o.fh = [7.8 + c * 1.2, -4 - bob]; o.sa = -.55; break; }
    case 'jump': o.by = -12.4; o.sy = 1.07; o.sx = .94; o.feet = [[-2.8, -3.6], [3, -4.4]]; o.bh = [-9, -12.4]; o.spread = .55; o.mouth = 'open'; o.fh = [6.6, -12.6]; o.sa = -.35; break;
    case 'fall': o.by = -11.6; o.feet = [[-3.6, -1.2], [3.6, -.6]]; o.bh = [-9.4, -15.4 + f]; o.spread = -.4 + f * .12; o.sway = f ? .1 : -.08; o.mouth = 'o'; o.fh = [7.2, -15.4 + f]; o.sa = .25; o.lookY = .8; break;
    case 'cling': o.bx = -.6; o.by = -12 + f * .8; o.feet = [[-6.2, -3.2 + f * .6], [-4.4, -1.6]]; o.bh = null; o.fhB = [-8.2, -16 + f * .5]; o.look = 2.2; o.lookE = 1.4; o.sway = .12;
      o.staffB = [-1.5, -11, -.62]; o.tendrils = [[-8.2, -15.2 + f * .5, 1], [-7.6, -3.2 + f * .6, -1]]; o.fh = null; break;
    case 'dash': o.by = -10.4; o.sx = 1.12; o.sy = .9; o.tilt = .32; o.feet = [[-6.4, -3.2], [1.4, -2.4]]; o.bh = [-10.6, -8.2]; o.sway = -.7; o.spread = .1; o.eyes = 'det'; o.mouth = 'open'; o.fh = [3, -8.4]; o.sa = -1.85; break;
    case 'focus': o.eyes = 'shut'; o.spread = -.18; o.bh = [-7.4, -6.6]; o.fh = [5.4, -9]; o.sa = 0; o.mouth = 'smile'; break;
    case 'hurt': o.tilt = -.24; o.eyes = 'wince'; o.mouth = 'o'; o.feet = [[-4.6, -1.6], [2.8, -3.6]]; o.bh = [-9.8, -13.4]; o.spread = .3; o.fh = [8.6, -12.4]; o.sa = .75; break;
    case 'faint': o.by = -7.4; o.sx = 1.16; o.sy = .8; o.tilt = -.3; o.feet = [[6.6, -1.8], [9.6, -1.4]]; o.bh = [-9.6, -2.4]; o.fhB = [8.2, -4.2]; o.spread = .95; o.sway = -.55; o.eyes = 'shut'; o.mouth = 'wave'; o.lookE = 0; o.look = .6;
      o.staffB = [-4, -1.6, PI / 2 - .05]; o.staffFront = 1; o.fh = null; break;
    case 'sit': o.by = -8.8; o.sy = .95; o.feet = [[4.4, -1.8], [8.2, -2.2]]; o.bh = [-8.8, -4]; o.eyes = 'happy'; o.spread = -.1; o.staffB = [-9.2, -2, -.32]; o.fh = null; o.fhB = [7.4, -6.6]; break;
    case 'swim': o.by = -10.2 + f * .6; o.feet = null; o.bh = [-10.4, -10 + (f ? -1.4 : .6)]; o.fhB = [9.6, -10 + (f ? .6 : -1.4)]; o.spread = .1 + f * .08; o.staffB = [-3, -14.5, -.75]; o.fh = null; break;
  }
  POSE.set(key, o); return o;
}
const HFR = { idle: 1, blink: 1, run: 8, jump: 1, fall: 2, cling: 2, dash: 1, focus: 1, hurt: 1, faint: 1, sit: 1, swim: 2 };
function heroImg(who, name, f, fl) {
  return bake('h' + who + name + f + (fl ? '!' : ''), 46, 44, 23, 38, g => drawHero(g, who, heroPose(name, f)), fl);
}
function staffImg() { return bake('staff', 14, 34, 7, 28, g => drawStaff(g, 0, 0, 0, 1)); }
function handImg(who) { const H = HERO[who]; return bake('hand' + who, 6, 6, 3, 3, g => outlined(g, [Pt(H.body, C(0, 0, 2.3), 2.3, 0, 0)], 1.3)); }
function leafBitImg(who) { return bake('lbit' + who, 10, 8, 5, 4, g => who ? outlined(g, [Pt(HERO[1].pet[0], E(0, 0, 3.8, 2.2, 0), 3, 0, 0)], 1.1) : outlined(g, [Pt(HERO[0].leaf, LF(-3.6, 0, 0, 7.2, 2.6), 3, 0, 0)], 1.1)); }
function bubbleImg() {
  return bake('bubble', 40, 44, 20, 22, g => {
    const r = 17.5;
    g.fillStyle = 'rgba(200,230,255,.22)'; g.beginPath(); g.arc(0, 2, r, 0, TAU); g.fill();
    g.lineWidth = 1.6;
    for (const [col, a0, a1] of [['rgba(200,178,255,.8)', .2, 1.2], ['rgba(155,232,196,.8)', 1.2, 2.1], ['rgba(255,217,59,.7)', 2.1, 2.8], ['rgba(127,208,255,.85)', 4.7, 5.9]]) { g.strokeStyle = col; g.beginPath(); g.arc(0, 2, r - 2, a0, a1); g.stroke(); }
    g.strokeStyle = 'rgba(43,33,64,.55)'; g.lineWidth = 2.6; g.beginPath(); g.arc(0, 2, r, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.beginPath(); g.arc(0, 2, r - 3.4, PI * 1.08, PI * 1.4); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-6.5, -8, 1.1, 0, TAU); g.fill();
    // a dandelion-seed tuft on top: it is a seed bubble, floating
    g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = .6; g.beginPath();
    for (let i = 0; i < 7; i++) { const a = -PI / 2 + (i - 3) * .32; g.moveTo(0, -r + 1.6); g.lineTo(Math.cos(a) * 6, -r + 1.6 + Math.sin(a) * 5.4); } g.stroke();
    dots(g, [-3, -2, -1, 0, 1, 2, 3].map(i => { const a = -PI / 2 + i * .32; return [Math.cos(a) * 6, -r + 1.6 + Math.sin(a) * 5.4]; }), .9, '#fff');
    g.fillStyle = '#c99a5a'; g.beginPath(); g.arc(0, -r + 1.6, 1, 0, TAU); g.fill();
  });
}
function cloudPuffImg() { return bake('cpuff', 12, 10, 6, 5, g => outlined(g, [Pt(M.CLOUD, C(-2.6, 1, 3), 3, -2.6, 1), Pt(M.CLOUD, C(1.2, -.6, 3.6), 3.6, 1.2, -.6), Pt(M.CLOUD, C(3.8, 1.4, 2.4), 2.4)], 1)); }
function seedBitImg() { return bake('seedbit', 8, 8, 4, 4, g => { g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = .55; g.beginPath(); for (let i = -2; i <= 2; i++) { const a = -PI / 2 + i * .45; g.moveTo(0, 1); g.lineTo(Math.cos(a) * 3.4, 1 + Math.sin(a) * 3.4); } g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 1.2, .9, 0, TAU); g.fill(); g.fillStyle = '#c99a5a'; g.beginPath(); g.arc(0, 2.2, .5, 0, TAU); g.fill(); }); }
function moteImg() { return bake('mote', 6, 6, 3, 3, g => { g.fillStyle = '#fff4b0'; g.beginPath(); STAR(0, 0, 2.8, .9, 4, 0)(g); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, .8, 0, TAU); g.fill(); }); }

// the swing arc: a sweep of dandelion fluff and light. Staff angles: 0 = up, clockwise, facing right
const SWING = {
  f: { a0: -.7, a1: 2.2, sx: 3.6, sy: -9.4 },
  u: { a0: 1.75, a1: -1.8, sx: 0, sy: -13.4 },
  d: { a0: 1.2, a1: 4.9, sx: 0, sy: -9.6 }
};
function swingState(sw) {
  const S = SWING[sw.dir] || SWING.f, tt = num(sw.t, 0), lead = S.a0 + (S.a1 - S.a0) * ease(tt / 4.2);
  const back = tt > 8 ? ease((tt - 8) / 5) : 0;   // the staff eases back after the arc
  return { S, tt, lead, staff: lerp(lead, sw.dir === 'u' ? .1 : .3, back * .7) };
}
function swingArc(ctx, x, y, fx, sw, t) {
  const st = swingState(sw), S = st.S, tt = st.tt; if (tt > 8.5) return;
  const reach = Math.max(14, num(sw.reach, 30)), al = tt <= 4.5 ? 1 : Math.max(0, 1 - (tt - 4.5) / 4);
  const span = S.a1 - S.a0, tail = S.a0 + span * Math.pow(clamp01((tt - 1) / 7.5), 1.25), lead = st.lead, n = LOW ? 8 : 16, W = reach * .4;
  if (Math.abs(lead - tail) < .05) return;
  ctx.save(); ctx.translate(x + S.sx * fx, y + S.sy); ctx.scale(fx, 1);
  const pts = []; for (let i = 0; i <= n; i++) { const s = i / n, a = tail + (lead - tail) * s - PI / 2, w = W * Math.pow(s, .8) * (s > .92 ? .5 + (1 - s) * 6 : 1) + .5; pts.push([Math.cos(a), Math.sin(a), w]); }
  const outer = () => { for (const [c, s] of pts) ctx.lineTo(c * reach, s * reach); };
  const path = () => { ctx.beginPath(); outer(); for (let i = pts.length - 1; i >= 0; i--) { const [c, s, w] = pts[i]; ctx.lineTo(c * (reach - w), s * (reach - w)); } ctx.closePath(); };
  const a0 = ctx.globalAlpha;
  if (!LOW) { ctx.globalAlpha = a0 * al * .35; ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 4; ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath(); outer(); ctx.stroke(); }
  const gr = ctx.createRadialGradient(0, 0, Math.max(0, reach - W), 0, 0, reach);
  gr.addColorStop(0, 'rgba(255,214,120,0)'); gr.addColorStop(.5, 'rgba(255,226,150,.45)'); gr.addColorStop(.85, 'rgba(255,246,214,.9)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  ctx.globalAlpha = a0 * al; ctx.fillStyle = gr; ctx.globalCompositeOperation = 'lighter'; path(); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 1.1; ctx.beginPath(); outer(); ctx.stroke();
  if (!LOW) { // a fluffy dandelion edge and seeds drifting off it
    ctx.fillStyle = '#fff';
    for (let i = 2; i <= n; i += 2) { const [c, s, w] = pts[i]; ctx.beginPath(); ctx.arc(c * (reach - .4), s * (reach - .4), .7 + w * .12, 0, TAU); ctx.fill(); }
    const sb = seedBitImg(), done = (lead - S.a0) / span;
    for (let i = 0; i < 4; i++) { const s = (i + .5) / 4; if (s > done + .04 || tt < 2) continue; const a = S.a0 + span * s - PI / 2, q = reach + (tt - 2) * 1.1 + (i & 1) * 2;
      ctx.drawImage(sb, Math.cos(a) * q - sb.ox, Math.sin(a) * q - sb.oy - tt * .4, sb.lw, sb.lh); }
    const m = moteImg(), a = lead - PI / 2; ctx.drawImage(m, Math.cos(a) * (reach + .5) - m.ox, Math.sin(a) * (reach + .5) - m.oy, m.lw, m.lh);
  }
  ctx.globalAlpha = a0; ctx.restore();
}
function heroState(P, t) {
  const st = P.st || 'idle', at = num(P.at, 0) | 0, who = P.who === 'marigold' ? 1 : 0;
  let name = 'idle', f = 0, sx = 1, sy = 1, dy = 0;
  switch (st) {
    case 'run': case 'enter': name = 'run'; f = (at >> 1) & 7; break;
    case 'jump': name = 'jump'; break;
    case 'fall': name = 'fall'; f = (t >> 3) & 1; break;
    case 'cling': name = 'cling'; f = (t >> 3) & 1; break;
    case 'dash': name = 'dash'; break;
    case 'focus': name = 'focus'; break;
    case 'hurt': name = 'hurt'; break;
    case 'faint': case 'bubble': name = 'faint'; break;
    case 'sit': name = 'sit'; break;
    case 'swim': name = 'swim'; f = (t >> 4) & 1; dy = Math.sin(t * .1) * 1; break;
    default: { const b = ((t + who * 97) % 220); name = b < 7 ? 'blink' : 'idle'; const br = Math.sin(t * .07 + who * 2); sy = 1 + br * .025; sx = 1 - br * .012; }
  }
  if ((st === 'idle' || st === 'run') && at < 6) { const k = (6 - at) / 6 * .16; sx *= 1 + k; sy *= 1 - k; }
  return { name, f, sx, sy, dy };
}
function player(ctx, P, t) {
  if (!P || P.alive === false && P.st !== 'faint' && P.st !== 'bubble') return;
  t = num(t, 0) | 0;
  const who = P.who === 'marigold' ? 1 : 0, st = P.st || 'idle', at = num(P.at, 0) | 0, x = num(P.x, 0), y = num(P.y, 0);
  let fx = P.face < 0 ? -1 : 1;
  const S = heroState(P, t), pose = heroPose(S.name, S.f), a0 = ctx.globalAlpha;
  if (st === 'cling') fx = (P.wall || -fx) > 0 ? -1 : 1;
  if (P.inv > 0 && st !== 'faint' && st !== 'bubble' && ((P.inv >> 2) & 1)) ctx.globalAlpha = a0 * .35;
  // behind: glow halo, focus light, dash trail, puff cloud
  if (P.glow) glow(ctx, x, y - 13, LOW ? 26 : 32, '#fff1a8', .3 + .05 * Math.sin(t * .05));
  if (st === 'focus' || P.focus > .02) focusFx(ctx, x, y, clamp01(num(P.focus, st === 'focus' ? .3 : 0)), t);
  if (st === 'dash') dashFx(ctx, P, x, y, fx, who, t);
  if ((st === 'jump' || st === 'fall') && P.puffT != null && P.puffT >= 0 && P.puffT < 18) puffFx(ctx, x, y, P.puffT);
  if (st === 'bubble' || (P.bubble && st === 'faint')) {
    const by = y - 14 + Math.sin(t * .06) * 2.5, b = bubbleImg();
    putT(ctx, heroImg(who, 'faint', 0), x, by + 11, fx * .86, .86);
    put(ctx, b, x, by);
    zzz(ctx, x + 10 * fx, by - 14, t);
    ctx.globalAlpha = a0; return;
  }
  const body = heroImg(who, S.name, S.f);
  const sw = P.swing && num(P.swing.t, 99) <= 13 ? P.swing : null;
  let tilt = 0; if (sw && sw.dir === 'f' && st !== 'dash') tilt = .08 * (1 - clamp01((sw.t - 6) / 7));
  const yy = y + S.dy;
  // the staff (behind the body, in front while it swings) and the front hand
  let fh = pose.fh, sa = pose.sa;
  if (sw) { const ss = swingState(sw), A = ss.staff, Sx = ss.S.sx, Sy = ss.S.sy; sa = A; fh = [Sx + Math.sin(A) * 5.8, Sy - Math.cos(A) * 5.8]; }
  const hx = fh ? x + fh[0] * fx * S.sx : 0, hy = fh ? yy + fh[1] * S.sy : 0;
  if (fh && !sw) putT(ctx, staffImg(), hx, hy, fx, 1, sa * fx);
  const front = sw && sa > .9 && sa < PI + .6;
  if (sw && !front) { putT(ctx, staffImg(), hx, hy, fx, 1, sa * fx); put(ctx, handImg(who), hx, hy); }
  if (S.sx !== 1 || S.sy !== 1 || fx < 0 || tilt) putT(ctx, body, x, yy, fx * S.sx, S.sy, tilt * fx); else put(ctx, body, x, yy);
  if (fh && (!sw || front)) {
    if (sw) putT(ctx, staffImg(), hx, hy, fx, 1, sa * fx);
    put(ctx, handImg(who), hx, hy);
    if (st === 'focus' || P.focus > .05) { const k = clamp01(num(P.focus, .3)), px = hx + Math.sin(sa * fx) * 22, py = hy - Math.cos(sa) * 22; glow(ctx, px, py, 8 + k * 10, '#ffe27a', .35 + k * .5); }
  }
  if (sw) swingArc(ctx, x, yy, fx, sw, t);
  // over: a leaf (petal) flies off when hurt, Zzz when nodding off
  if (st === 'hurt' && at < 40) { const k = at, lb = leafBitImg(who); putA(ctx, lb, x - fx * (4 + k * 1.1), y - 24 - k * 1.3 + k * k * .045, 1 - k / 40, fx, 1, k * .25 * fx); }
  if (st === 'faint') zzz(ctx, x + 6 * fx, y - 16, t);
  ctx.globalAlpha = a0;
}
function zzz(ctx, x, y, t) {
  const z = zImg();
  for (let i = 0; i < 3; i++) { const p = ((t + i * 30) % 90) / 90; putA(ctx, z, x + p * 8 + i * 1.5, y - p * 16, Math.min(1, (1 - p) * 2.4), .55 + p * .5, .55 + p * .5); }
}
function focusFx(ctx, x, y, k, t) {
  glow(ctx, x, y - 13, 14 + k * 14, '#ffe27a', .2 + k * .45);
  if (LOW) return;
  const m = moteImg(), n = 7;
  for (let i = 0; i < n; i++) { const p = ((t * (.9 + k) + i * 37) % 60) / 60, a = i * TAU / n + t * .03, q = 26 * (1 - p) + 4;
    putA(ctx, m, x + Math.cos(a) * q, y - 13 + Math.sin(a) * q * .8, Math.min(1, p * 3) * (.4 + k * .6)); }
}
function dashFx(ctx, P, x, y, fx, who, t) {
  const k = num(P.dashT, 0), a0 = ctx.globalAlpha;
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
  ctx.beginPath(); for (let i = 0; i < 4; i++) { const yy = y - 6 - i * 5, l = 10 + ((i * 7 + t) % 9); ctx.moveTo(x - fx * (10 + i * 2), yy); ctx.lineTo(x - fx * (10 + i * 2 + l), yy); } ctx.stroke();
  const lb = leafBitImg(who);
  for (let i = 0; i < 3; i++) { const q = 14 + i * 9 + (k % 4); ctx.globalAlpha = a0 * (.85 - i * .25); putT(ctx, lb, x - fx * q, y - 12 + Math.sin(t * .4 + i * 2) * 3, fx * (.9 - i * .15), .9 - i * .15, (t * .3 + i) * fx); }
  ctx.globalAlpha = a0;
}
function puffFx(ctx, x, y, k) {
  const c = cloudPuffImg(), p = k / 18, a = 1 - p;
  putA(ctx, c, x - 5 - p * 6, y + 2 + p * 2, a, .8 + p * .5);
  putA(ctx, c, x + 5 + p * 6, y + 2 + p * 2, a, -.8 - p * .5, .8 + p * .5);
  putA(ctx, c, x, y + 4 + p * 4, a, .9 + p * .4);
}

/* =====================================================================================================================
   GLOOMS: grey, sooty and grumpy only through shape, droop, scribbly smog, sparks and posture. NO faces, NO eyes.
   Baked facing right around their centre; flipped by F.face. F.hurt > 0: a white flash.
   ===================================================================================================================== */
const BRASS = ['#c9ad6a', '#8a6d34', '#f0dfae'];
const SMOG_PUFFS = [[-6.4, 2, 6], [0, -3.4, 7.4], [6.6, 1.2, 6], [.4, 4.2, 6.4], [-10.2, 4.8, 3.6], [10.4, 5.2, 3.4], [-4.4, -7.2, 3.6], [5, -6.4, 3]];
function tintAtop(g, draw) { if (FLASH) return; g.save(); g.globalCompositeOperation = 'source-atop'; draw(); g.restore(); }
function drawSmog(g, f) {
  for (const [sx, sy, d] of [[-11, 6, -1], [11, 7, 1]]) inkLine(g, g2 => { g2.moveTo(sx, sy); g2.bezierCurveTo(sx + d * 4, sy + 3 + f * .4, sx + d * 6.6, sy - 1, sx + d * 5, sy - 3.4 + f * .3); }, 1.3, M.SMOG[1]);
  const parts = SMOG_PUFFS.map(([x, y, r], i) => { const k = 1 + .07 * Math.sin(f * PI / 2 + i * 1.9); return Pt(M.SMOG, C(x, y + .5 * Math.sin(f * PI / 2 + i), r * k), r, i === 1 ? x : null, y); });
  outlined(g, parts, 1.7);
  tintAtop(g, () => { g.fillStyle = 'rgba(96,74,140,.26)'; g.beginPath(); g.ellipse(0, 9.6, 16, 6, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(-3, -6, 9, 4, -.2, 0, TAU); g.fill(); });
  scribble(g, .4, 1.4, 5.4, f * PI / 2, 1.3);
  if (!FLASH) dots(g, [[-13.4 + f * .6, -3], [13.8, -1.4 - f * .7], [-1.4 + f * .6, -12.8], [8.6, 10.6]], .9, 'rgba(52,42,72,.75)');
}
function drawThorn(g) {
  const sp = [];
  for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + .15, c = Math.cos(a), s = Math.sin(a), L = i & 1 ? 12.2 : 11; sp.push(Pt(M.BONE, POLY([c * L, s * L, c * 6.6 - s * 2.3, s * 6.6 + c * 2.3, c * 6.6 + s * 2.3, s * 6.6 - c * 2.3]), 2)); }
  outlined(g, sp, 1.25);
  outlined(g, [Pt(M.BRAM, C(0, 0, 8.2), 8.2, 0, 0)], 1.6);
  tintAtop(g, () => { g.fillStyle = 'rgba(110,70,120,.18)'; g.beginPath(); g.arc(2, 3, 7, 0, TAU); g.fill(); });
  // vines wound round the ball like a ball of string: flat bands evenly turned by 60 degrees, each only its front half (no rings, no centre)
  for (let i = 0; i < 3; i++) inkLine(g, g2 => g2.ellipse(0, 0, 7.6, 3.4, .35 + i * PI / 3, .12 + (i === 1 ? PI : 0), PI - .12 + (i === 1 ? PI : 0)), 1.3, M.VINEG[0], M.VINEG[2]);
}
const DRIPP = g => { g.moveTo(0, -11); g.bezierCurveTo(2.4, -6, 9, -2, 9, 3.6); g.bezierCurveTo(9, 9.4, 4.6, 11.4, 0, 11.4); g.bezierCurveTo(-4.6, 11.4, -9, 9.4, -9, 3.6); g.bezierCurveTo(-9, -2, -2.4, -6, 0, -11); g.closePath(); };
function drawDrip(g, f) {
  outlined(g, [Pt(M.GOO, DRIPP, 9, 0, 3)], 1.8);
  tintAtop(g, () => { g.fillStyle = 'rgba(70,90,140,.22)'; g.beginPath(); g.ellipse(1, 9, 9, 4, 0, 0, TAU); g.fill(); });
  scribble(g, .3, 4.6, 4.2, f * 1.6, 1.1);
  if (FLASH) return;
  g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-4.6, 1.2, 1.2, 2.8, .3, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(4.6, 6.8 - f, .9, 0, TAU); g.fill(); g.beginPath(); g.arc(-2, 8.8, .6, 0, TAU); g.fill();
}
const OOZEP = f => g => { const k = f ? 1 : 0; g.moveTo(-13.5, 0); g.bezierCurveTo(-13.5, -5 + k, -9.5, -9 - k, -4, -9.6 + k); g.bezierCurveTo(-.5, -10.2 + k, 2.4, -7.4 - k, 6.4, -8.2); g.bezierCurveTo(11, -8.6 + k, 13.6, -4, 14, 0); g.closePath(); };
function drawOoze(g, f) {
  outlined(g, [Pt(M.GOO, OOZEP(f), 8, -1, -4)], 1.8);
  tintAtop(g, () => { g.fillStyle = 'rgba(70,90,140,.22)'; g.fillRect(-15, -3, 30, 4); });
  scribble(g, 0, -4, 3.6, f * 2, 1.1, null, .7);
  if (!FLASH) { g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.ellipse(-7, -6, 2.2, .9, -.3, 0, TAU); g.fill(); g.beginPath(); g.arc(8 - f * 2, -4.6, .8, 0, TAU); g.fill(); }
}
const CTIN = ['#b3a3a2', '#76646a', '#e4d8d6'];
function drawCog(g, f, dz) {
  const kw = dz ? .35 : [1, .55, .12, .55][f & 3];
  outlined(g, [Pt(M.IRON, RR(-11.4, -15, 4.6, 6.6, 1.2), 2), Pt(M.IRON, RR(-12.2, -16.2, 6.2, 2.6, 1), 1.5)], 1.3);
  if (dz) outlined(g, [Pt(M.IRON, RR(-.2, -15.6, 2.6, 6, 1), 1.5), Pt(BRASS, E(4.4, -15.4, 3.8, 3, .7), 3, 4, -16), Pt(BRASS, E(-2.4, -16.8, 3.4, 2.8, .7), 3)], 1.3);
  else outlined(g, [Pt(M.IRON, RR(-.2, -15.6, 2.6, 6, 1), 1.5), Pt(BRASS, E(1.1 - 5.2 * kw, -18, 5 * kw + .8, 3.8), 3, 1.1 - 5.2 * kw, -18.4), Pt(BRASS, E(1.1 + 5.2 * kw, -18, 5 * kw + .8, 3.8), 3, 1.1 + 5.2 * kw, -18.4)], 1.3);
  outlined(g, [Pt(M.SOOT, RR(-12.6, 2.4, 25, 4.4, 2), 2)], 1.3);
  outlined(g, [Pt(M.IRON, RR(10.4, -3.6, 4, 8, 1.8), 2.5), Pt(CTIN, E(-.6, -9.6, 9.4, 4.4), 6, -3, -11), Pt(CTIN, RR(-12.2, -10, 23.4, 13.6, 4), 9, -3, -5)], 1.7);
  tintAtop(g, () => {
    g.fillStyle = 'rgba(110,170,168,.55)'; g.fillRect(-13, -4.4, 26, 3.4);
    g.fillStyle = 'rgba(160,86,52,.55)'; for (const [x, y, r] of [[-9.4, 1.4, 2.6], [7.4, -8, 2.2], [8.4, 1.6, 1.8], [-4, -11.6, 1.6]]) { g.beginPath(); g.ellipse(x, y, r, r * .75, .4, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(150,80,50,.5)'; g.lineWidth = .8; g.beginPath(); g.moveTo(6, -1); g.lineTo(6.4, 2.6); g.moveTo(-7, -7); g.lineTo(-7.2, -3.6); g.stroke();
    g.fillStyle = 'rgba(40,30,50,.22)'; g.fillRect(-13, 0, 26, 4);
  });
  for (const x of [-6.6, 6.6]) { outlined(g, [Pt(M.SOOT, C(x, 7.4, 4), 4, x, 7.4)], 1.4); if (!FLASH) { g.strokeStyle = M.SOOT[2]; g.lineWidth = .9; g.beginPath(); for (const da of [0, PI / 2]) { const a = f * PI / 4 + da + x; g.moveTo(x - Math.cos(a) * 2.8, 7.4 - Math.sin(a) * 2.8); g.lineTo(x + Math.cos(a) * 2.8, 7.4 + Math.sin(a) * 2.8); } g.stroke(); g.fillStyle = M.SOOT[1]; g.beginPath(); g.arc(x, 7.4, 1, 0, TAU); g.fill(); } }
  outlined(g, [Pt(BRASS, GEAR(-1.4, -3, 5.4, 8, f * PI / 16), 5, -1.4, -3)], 1.15);
  if (!FLASH) { g.fillStyle = BRASS[1]; g.beginPath(); g.arc(-1.4, -3, 1.5, 0, TAU); g.fill(); rivets(g, [[-10.4, -7.6], [9, -7.6], [-10.4, 1], [9, 1]], .6); }
}
// spore lantern: a seed capsule on a stalk with a frilled crown; k 0 idle (dim), 1 glow (bright), 2 puff (squeezed)
function drawLantern(g, k) {
  const sx = k === 2 ? 1.16 : k === 1 ? 1.06 : 1, sy = k === 2 ? .84 : k === 1 ? 1.04 : 1, cy = -3.4, ry = 6.6 * sy, rx = 6.4 * sx;
  inkLine(g, g2 => { g2.moveTo(0, 12); g2.bezierCurveTo(-2.6, 8, 2, 5, 0, cy + ry - 1); }, 1.6, '#8e9a74', '#c4ccaa');
  outlined(g, [Pt(M.POD, LF(0, 11.4, -2.5, 6.6, 2.1), 2), Pt(M.POD, LF(0, 11.4, -.62, 6.2, 2), 2)], 1.1);
  const crown = STAR(0, cy - ry + .6, 4.4 * sx, 2.4 * sx, 7, -PI / 2);
  outlined(g, [Pt(M.POD, g2 => { g2.save(); g2.translate(0, cy - ry + .6); g2.scale(1, .45); g2.translate(0, -(cy - ry + .6)); crown(g2); g2.restore(); }, 3), Pt(M.POD, E(0, cy, rx, ry), 7, 0, cy)], 1.7);
  if (FLASH) return;
  const lit = k === 1 ? '#ffe680' : '#cfc79a';
  g.save(); g.beginPath(); E(0, cy, rx, ry)(g); g.clip();
  g.fillStyle = k === 1 ? 'rgba(255,230,128,.45)' : 'rgba(210,200,150,.18)'; g.beginPath(); g.ellipse(0, cy + 1, rx * .8, ry * .7, 0, 0, TAU); g.fill();
  g.fillStyle = lit; for (const q of [-.66, -.22, .22, .66]) { g.beginPath(); g.ellipse(q * rx * 1.02, cy + .3, .55 * sx, ry * (.78 - Math.abs(q) * .25), q * .45, 0, TAU); g.fill(); }
  g.strokeStyle = M.POD[1]; g.lineWidth = .8; g.beginPath();
  for (const q of [-.88, -.44, 0, .44, .88]) { g.moveTo(q * rx * .2, cy - ry); g.quadraticCurveTo(q * rx * 1.25, cy, q * rx * .2, cy + ry); } g.stroke();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(-rx * .55, cy - ry * .4, 1.1, 2.2, .3, 0, TAU); g.fill();
}
// gloom knight: hollow old garden armour — a dented watering-can helmet (no slot, no eyes, no face), a pot-lid shield
function drawKnight(g, o) {
  const f = o.f || 0, ph = f * PI / 2, L1 = o.legs ? o.legs[0] : [-3.2 + Math.sin(ph) * 2.6, 17 - Math.max(0, Math.cos(ph)) * 2.4], L2 = o.legs ? o.legs[1] : [3.4 - Math.sin(ph) * 2.6, 17 - Math.max(0, -Math.cos(ph)) * 2.4];
  const dy = o.dy || 0;
  for (const [x, y] of [L1, L2]) outlined(g, [Pt(M.TIN, RR(x - 2.2, 5 + dy, 4.4, y - 5 - dy, 1.6), 3), Pt(M.LID, E(x + 1, y - .8, 3.6, 2, 0), 2.5, x + 1, y - 1)], 1.4);
  outlined(g, [Pt(M.TIN, RR(-9.6, -2.6 + dy, 3.8, 9, 1.8), 3)], 1.3);   // the back arm, empty
  g.save(); g.translate(0, dy); if (o.helm) { g.translate(0, -5); g.rotate(o.helm); g.translate(0, 5); }
  // helmet: a watering can with its spout as a plume and a carrying handle
  inkLine(g, g2 => { g2.moveTo(-5, -14.6); g2.quadraticCurveTo(-9, -16.4, -12.6, -13.2); }, 2.4, M.TIN[0], M.TIN[2]);
  outlined(g, [Pt(M.LID, POLY([-12, -14.6, -15.6, -16.4, -15.6, -9.2, -12, -11.6]), 2)], 1.1);
  inkLine(g, g2 => { g2.moveTo(-2.6, -16.6); g2.bezierCurveTo(-2.6, -22.4, 4.2, -22.4, 4.2, -16.6); }, 1.6, M.TIN[0], M.TIN[2]);
  outlined(g, [Pt(M.TIN, RR(-6.4, -17, 12.6, 12, 4.4), 6, 0, -12)], 1.6);
  if (!FLASH) {
    // a big dent in the can (no slot, no face): a shaded hollow with a bright lower rim, and a soldered seam
    g.strokeStyle = 'rgba(70,66,92,.55)'; g.lineWidth = .9; g.beginPath(); g.arc(-1.6, -17.6, 3.4, .5, 2.4); g.stroke();   // a dent pressed into the top
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .6; g.beginPath(); g.arc(-1.6, -18.2, 3.6, .7, 2.2); g.stroke();
    g.strokeStyle = 'rgba(70,66,92,.5)'; g.lineWidth = .7; g.beginPath(); g.moveTo(-3.6, -16.2); g.lineTo(-3.4, -8.8); g.stroke();   // the soldered seam
    g.fillStyle = 'rgba(150,96,70,.4)'; g.beginPath(); g.ellipse(-4.6, -9.6, 1.4, 1, .4, 0, TAU); g.fill();   // a rust spot at the back
    g.fillStyle = 'rgba(80,70,100,.5)'; g.fillRect(-6, -8.2, 12, 1.2);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-3.2, -14.6, 1.8, .8, -.3, 0, TAU); g.fill();
  }
  g.restore();
  // breastplate: a battered bucket
  outlined(g, [Pt(M.TIN, g2 => { g2.moveTo(-7.4, -5 + dy); g2.lineTo(7, -5 + dy); g2.lineTo(5.6, 7 + dy); g2.quadraticCurveTo(0, 8.6 + dy, -6, 7 + dy); g2.closePath(); }, 7, -.5, 1 + dy)], 1.7);
  tintAtop(g, () => { g.fillStyle = 'rgba(70,80,120,.25)'; g.fillRect(-8, 3 + dy, 16, 6); g.fillStyle = 'rgba(120,80,60,.35)'; g.beginPath(); g.arc(-4, -1 + dy, 1.8, 0, TAU); g.fill(); });
  if (!FLASH) { g.strokeStyle = M.TIN[1]; g.lineWidth = .9; g.beginPath(); g.moveTo(-7, -2 + dy); g.lineTo(6.8, -2 + dy); g.stroke(); rivets(g, [[-5.6, -3.4 + dy], [5.2, -3.4 + dy]], .55); }
  // pot-lid shield
  const [sx, sy, sr] = o.shield || [8.6, 0, 0];
  outlined(g, [Pt(M.LID, E(sx, sy + dy, 3.8, 8.8, sr), 6, sx - 1, sy + dy - 2), Pt(M.LID, E(sx + 2.8 * Math.cos(sr), sy + dy + 2.8 * Math.sin(sr), 1.5, 2.4, sr), 2)], 1.6);
  if (!FLASH) { g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = .7; g.beginPath(); g.ellipse(sx - .3, sy + dy, 2.6, 7.2, sr, PI * .7, PI * 1.35); g.stroke(); }
}
const KN = {
  walk: f => ({ f }), block: () => ({ shield: [10, -3, -.12], legs: [[-4.6, 17], [4.4, 17]] }), ready: () => ({ shield: [4.6, 1.6, .18], legs: [[-6, 17], [3.4, 17]], helm: -.12 }),
  shove: () => ({ shield: [12, -.5, .06], legs: [[-7, 17], [4.6, 15.6]] }), rest: () => ({ shield: [6.4, 9.6, .95], legs: [[-3.4, 17], [3.6, 17]], helm: .22, dy: 1.6 })
};
function gimg(kind, key, w, h, draw, fl) { return bake('g' + kind + key + (fl ? '!' : ''), w, h, w / 2, h / 2, draw, fl); }
function speedLines(ctx, x, y, dir, n, len, t, col) {
  ctx.strokeStyle = col || 'rgba(230,226,240,.7)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i < n; i++) { const yy = y + (i - (n - 1) / 2) * 5, o = (t * 2 + i * 5) % 6; ctx.moveTo(x - dir * (2 + o), yy); ctx.lineTo(x - dir * (2 + o + len - i * 2), yy); }
  ctx.stroke();
}
function sootPuffImg(white) { return bake(white ? 'spW' : 'spS', 12, 10, 6, 5, g => outlined(g, [Pt(white ? M.CLOUD : M.SMOG, C(-2.4, 1, 3), 3, -2.4, 1), Pt(white ? M.CLOUD : M.SMOG, C(1.4, -.8, 3.6), 3.6, 1.4, -.8), Pt(white ? M.CLOUD : M.SMOG, C(3.8, 1.6, 2.2), 2.2)], 1)); }
function puffs(ctx, x, y, n, t, white, spread, rise, size, period) {
  const c = sootPuffImg(white); period = period || 40;
  for (let i = 0; i < n; i++) { const p = ((t + i * period / n) % period) / period; putA(ctx, c, x + Math.sin(p * 5 + i * 2) * (spread || 3) + p * (spread || 3) * (i & 1 ? 1 : -1), y - p * (rise || 16), Math.min(1, (1 - p) * 2.2), (size || .7) + p * .6); }
}
function sparks(ctx, x, y, r, t, n, col) {
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [lw, c] of [[2.6, PAL.ink], [1.2, col || '#fff3a0']]) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath();
    for (let i = 0; i < n; i++) { const k = (t >> 2) + i * 7, a = hash(k, i) * TAU, q = r * (.6 + hash(k, i + 9) * .5), sx = x + Math.cos(a) * q, sy = y + Math.sin(a) * q * .6, d = hash(k, i + 3) < .5 ? 1 : -1;
      ctx.moveTo(sx, sy); ctx.lineTo(sx + 2.4 * d, sy + 1.8); ctx.lineTo(sx + .6 * d, sy + 2.6); ctx.lineTo(sx + 3 * d, sy + 4.8); }
    ctx.stroke(); }
}
function dizzyStars(ctx, x, y, t, r) {
  for (let i = 0; i < 3; i++) { const a = t * .12 + i * TAU / 3; twinkle(ctx, x + Math.cos(a) * (r || 8), y + Math.sin(a) * (r || 8) * .35, 2.4, t * .1, i & 1 ? '#fff3a0' : '#ffffff'); }
}
const FOES = {
  smog(ctx, F, t, fl) {
    const f = ((t + F.id * 5) >> 3) & 3, c = gimg('smog', f, 34, 30, g => drawSmog(g, f), fl), dir = F.face < 0 ? -1 : 1, bob = Math.sin((t + F.id * 13) * .06) * 1.6;
    if (F.st === 'push') putT(ctx, c, F.x, F.y + bob, -dir * 1.08, .9, .22 * dir); else putT(ctx, c, F.x, F.y + bob, dir, 1);
  },
  thorn(ctx, F, t, fl) {
    const c = gimg('thorn', 0, 28, 28, drawThorn, fl), dir = F.face < 0 ? -1 : 1;
    if (F.st === 'rush') { speedLines(ctx, F.x - dir * 10, F.y - 2, dir, 3, 12, t); puffs(ctx, F.x - dir * 9, F.y + 9, 2, t, 0, 3, 6, .5, 16); }
    if (F.st === 'push') putT(ctx, c, F.x, F.y + 1, 1.1, .9, F.x / 11); else putT(ctx, c, F.x, F.y, 1, 1, F.x / 11);
  },
  drip(ctx, F, t, fl) {
    const st = F.st, dir = F.face < 0 ? -1 : 1, f = (t >> 4) & 1;
    if (st === 'ooze') { const c = gimg('ooze', f, 30, 14, g => drawOoze(g, f), fl); putT(ctx, c, F.x, F.y + 10, dir * (1 + Math.sin(t * .2) * .04), 1); return; }
    const c = gimg('drip', f, 22, 26, g => drawDrip(g, f), fl);
    if (st === 'fall') { putT(ctx, c, F.x, F.y, .82, 1.26); ctx.strokeStyle = 'rgba(200,210,230,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(F.x - 3, F.y - 18); ctx.lineTo(F.x - 3, F.y - 26); ctx.moveTo(F.x + 3, F.y - 16); ctx.lineTo(F.x + 3, F.y - 22); ctx.stroke(); return; }
    const top = F.ceil === 0 && F.ceil != null ? ceilY(F.y - 10) : ceilY(F.y - 10), shake = st === 'shake', wob = shake ? Math.sin(t * 1.3) * .14 : st === 'push' ? .25 * dir : Math.sin(t * .05 + F.id) * .04;
    const by = F.y - 9 + (shake ? Math.sin(t * .9) * .8 : 0);
    if (by - top > 1) dripNeck(ctx, F.x, top, by, wob, fl);
    putT(ctx, c, F.x, F.y + (shake ? Math.sin(t * .9) * .8 : 0), 1, 1 + (shake ? Math.sin(t * 1.7) * .05 : Math.sin(t * .06) * .02), wob);
    if (shake) { const p = (t % 20) / 20; ctx.fillStyle = M.GOO[0]; ctx.strokeStyle = PAL.ink; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(F.x + 3, F.y + 12 + p * 10, 1.4, 0, TAU); ctx.fill(); ctx.stroke(); glow(ctx, F.x, F.y + 3, 16, '#d8e4ff', .4 + .25 * Math.sin(t * .6)); twinkle(ctx, F.x - 5, F.y - 2, 2 + Math.sin(t * .7) * 1.2, 0, '#ffffff'); }
  },
  cog(ctx, F, t, fl) {
    const st = F.st, dir = F.face < 0 ? -1 : 1, fast = st === 'wind' || st === 'charge', dz = st === 'dizzy';
    const f = dz ? 0 : (t >> (fast ? 1 : 3)) & 3, c = gimg('cog', (dz ? 'dz' : f), 32, 40, g => drawCog(g, f, dz), fl);
    let x = F.x, y = F.y - .4, rot = 0;
    if (st === 'wind') { x += Math.sin(t * 2.1) * 1.1; y += Math.sin(t * 1.7) * .6; puffs(ctx, F.x - dir * 9.6, F.y - 19, 3, t * 2, 1, 2, 12, .55, 24); twinkle(ctx, F.x + dir * 1, F.y - 22, 2 + Math.sin(t * .8), t * .3, '#fff3c0'); }
    if (st === 'charge') { rot = .26 * dir; y += 1; speedLines(ctx, F.x - dir * 15, F.y - 2, dir, 3, 14, t); puffs(ctx, F.x - dir * 12, F.y + 8, 2, t, 0, 3, 6, .5, 14); }
    if (dz) rot = Math.sin(t * .25) * .12;
    if (st === 'push') rot = -.22 * dir;
    putT(ctx, c, x, y, dir, 1, rot);
    if (dz) dizzyStars(ctx, F.x, F.y - 20, t, 9);
  },
  lantern(ctx, F, t, fl) {
    const st = F.st, k = st === 'glow' ? 1 : st === 'puff' ? 2 : 0, c = gimg('lant', k, 22, 30, g => drawLantern(g, k), fl), sy = F.ceil ? -1 : 1, dir = F.face < 0 ? -1 : 1;
    const sway = Math.sin(t * .04 + F.id) * .05, py = F.y - 3.4 * sy;
    const gk = k === 1 ? .55 + .4 * clamp01(num(F.t, 0) / 40) + .1 * Math.sin(t * .5) : .22 + .06 * Math.sin(t * .05 + F.id);
    glow(ctx, F.x, py, k === 1 ? 20 : 13, '#ffe27a', gk);
    putT(ctx, c, F.x, F.y, dir, sy, sway * sy);
    if (k === 2) puffs(ctx, F.x, F.y - 11 * sy, 3, t * 2, 0, 4, 10 * sy, .6, 20);
  },
  knight(ctx, F, t, fl) {
    const st = KN[F.st] ? F.st : 'walk', dir = F.face < 0 ? -1 : 1, f = st === 'walk' ? (t >> 3) & 3 : 0;
    const c = gimg('kn', st + f, 36, 46, g => drawKnight(g, KN[st](f)), fl);
    let rot = 0, x = F.x;
    if (st === 'ready') { rot = -.26 * dir; x -= dir * (1 + Math.sin(t * .8) * .6); puffs(ctx, F.x - dir * 4, F.y + 15, 2, t, 0, 3, 5, .45, 16); }
    if (st === 'shove') { rot = .2 * dir; speedLines(ctx, F.x - dir * 12, F.y - 2, dir, 4, 12, t); }
    if (F.st === 'push') rot = -.2 * dir;
    putT(ctx, c, x, F.y, dir, 1, rot);
    if (st === 'block') { const p = clamp01(1 - num(F.t, 0) / 14); glow(ctx, F.x + dir * 10, F.y - 2, 14, '#ffffff', .4 + p * .5); twinkle(ctx, F.x + dir * 12, F.y - 9, 3 + p * 2, t * .2, '#fff'); }
    if (st === 'ready') twinkle(ctx, F.x + dir * 7, F.y - 6, 2.5 + Math.sin(t * .5) * 1, 0, '#fff3c0');
    if (st === 'rest') { puffs(ctx, F.x + dir * 3, F.y - 18, 2, t, 0, 2, 10, .4, 60); }
  }
};
function dripNeck(ctx, x, top, by, wob, fl) {
  const mid = (top + by) / 2, w = 2.2 + Math.sin(wob * 8) * .2, dx = Math.sin(wob) * (by - top) * .5;
  ctx.beginPath(); ctx.moveTo(x - 5, top); ctx.quadraticCurveTo(x - 3.2, top + 2.4, x - w + dx * .5, mid); ctx.quadraticCurveTo(x - 2.6 + dx, by - 1, x - 3.4 + dx, by + 2);
  ctx.lineTo(x + 3.4 + dx, by + 2); ctx.quadraticCurveTo(x + 2.6 + dx, by - 1, x + w + dx * .5, mid); ctx.quadraticCurveTo(x + 3.2, top + 2.4, x + 5, top); ctx.closePath();
  ctx.lineWidth = 2.6; ctx.strokeStyle = PAL.ink; ctx.lineJoin = 'round'; ctx.stroke(); ctx.fillStyle = fl ? '#fff' : M.GOO[1]; ctx.fill();
  if (!fl) { ctx.fillStyle = M.GOO[0]; ctx.fillRect(x - 1.6 + dx * .3, top + 1, 1.3, by - top - 1); }
}
function foe(ctx, F, t) {
  if (!F || F.alive === false) return;
  t = num(t, 0) | 0;
  const fn = FOES[F.kind]; if (!fn) { fallback(ctx, F.x, F.y, 9); return; }
  try { fn(ctx, F, t, F.hurt > 0); } catch (e) { err(e); }
}

/* =====================================================================================================================
   GUARDIANS: big and characterful through shape alone (no faces). Calm (0..1) crossfades baked levels 0, 1/3, 2/3, 1.
   ===================================================================================================================== */
function levels(c) { c = clamp01(c) * 3; const i = Math.min(2, Math.floor(c)); return [i, c - i]; }
function guardHit(ctx, Gd, x, y, w, h, t) {
  if (!(Gd.hurt > 0)) return;
  const k = t >> 2; for (let i = 0; i < 2; i++) { const hx = x + (hash(k, 3 + i) - .5) * w * .7, hy = y + (hash(k, 5 + i) - .5) * h * .6; glow(ctx, hx, hy, 12, '#fff3c0', .7); twinkle(ctx, hx, hy, 5, t * .3, '#fff'); }
}
// THE THORN KNOT: a huge bramble tangle (r 40) around a grey knotted core; calm unknots it into a blooming wild-rose bush
const KNOTL = (() => { const r = rng(11), L = []; for (let i = 0; i < 9; i++) L.push({ rot: i * PI / 9 + r() * .4, rx: 29 + r() * 9, ry: 11 + r() * 15, ox: (r() - .5) * 9, oy: (r() - .5) * 9, ph: r() * TAU }); return L; })();
function rose(g, x, y, s, m) {
  const pp = []; for (let i = 0; i < 5; i++) { const a = i * TAU / 5 - PI / 2; pp.push(Pt(m || M.ROSE, C(x + Math.cos(a) * 2.2 * s, y + Math.sin(a) * 2.2 * s, 1.9 * s), 1.9 * s, x + Math.cos(a) * 2.2 * s, y + Math.sin(a) * 2.2 * s)); }
  outlined(g, pp, .8 * Math.max(.8, s));
  outlined(g, [Pt(M.SUN, C(x, y, 1.15 * s), 1.2 * s)], .6 * s);
}
function drawKnot(g, c) {
  const vine = mixM(['#8f8088', '#56495a', '#c4b6be'], ['#6cc25a', '#3a8a3a', '#d4f5c0'], c), thornM = mixM(M.BONE, ['#b8e4a0', '#5a9a4a', '#ecffe0'], c);
  const sx = 1 + c * .2, sy = 1 - c * .3, dy = c * 11;
  if (c < .5) {
    outlined(g, [Pt(M.SOOT, C(0, 0, 30), 30, 0, 0)], 2.4);
    if (!FLASH) { const gr = g.createRadialGradient(0, 0, 2, 0, 0, 30); gr.addColorStop(0, c ? 'rgba(220,240,170,.55)' : 'rgba(196,176,236,.55)'); gr.addColorStop(1, 'rgba(60,50,80,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 29, 0, TAU); g.fill(); scribble(g, 0, 0, 13, 1, 2, 'rgba(40,32,58,.6)'); }
  } else {
    const mound = [[-30, 18, 15], [-14, 6, 20], [6, 0, 23], [26, 10, 18], [36, 22, 12], [-38, 26, 10], [0, 22, 22]];
    outlined(g, mound.map(([x, y, r]) => Pt(M.LEAFD, C(x, y + dy - 8, r), r, x, y + dy - 8)), 2.4);
    if (!FLASH) { const r = rng(9); g.strokeStyle = 'rgba(30,110,60,.55)'; g.lineWidth = 1; g.lineCap = 'round'; g.beginPath();
      for (let i = 0; i < 26; i++) { const [mx, my, mr] = mound[i % mound.length], a = r() * TAU, q = mr * (.35 + r() * .55), px = mx + Math.cos(a) * q, py = my + dy - 8 + Math.sin(a) * q, la = a + PI / 2; g.moveTo(px - Math.cos(la) * 2, py - Math.sin(la) * 2); g.quadraticCurveTo(px + Math.cos(a) * 1.4, py + Math.sin(a) * 1.4, px + Math.cos(la) * 2, py + Math.sin(la) * 2); }
      g.stroke(); }
  }
  KNOTL.forEach((L, i) => {
    const cx = L.ox * sx, cy = L.oy * sy + dy, rx = L.rx * sx, ry = L.ry * sy, rot = L.rot * (1 - c * .75);
    const a0 = PI * c * .92, a1 = TAU;   // calm unknots the loops into arching canes
    inkLine(g, g2 => g2.ellipse(cx, cy, rx, ry, rot, a0 + (c ? L.ph * .1 : 0), a1 + (c ? L.ph * .1 : 0)), 4.2 - c * 1.2, vine[0], vine[2]);
    const cr = Math.cos(rot), sr = Math.sin(rot), at = th => { const px = rx * Math.cos(th), py = ry * Math.sin(th); return [cx + px * cr - py * sr, cy + px * sr + py * cr]; };
    const thorns = [], leaves = [];
    for (let k = 0; k < 6; k++) {
      const th = c ? a0 + L.ph * .1 + (a1 - a0) * (k + .5) / 6 : L.ph + k * TAU / 6, [px, py] = at(th), [qx, qy] = at(th + .05), tx = qx - px, ty = qy - py, tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      const out = (px - cx) * nx + (py - cy) * ny > 0 ? 1 : -1, len = 5.4 * (1 - c * .85) + .8;
      if (c < 1) thorns.push(Pt(thornM, POLY([px + nx * out * len, py + ny * out * len, px - tx / tl * 1.8, py - ty / tl * 1.8, px + tx / tl * 1.8, py + ty / tl * 1.8]), 2));
      if (c > 0 && (k + i) % 2 === 0) leaves.push(Pt(M.LEAF, LF(px, py, Math.atan2(ny * out, nx * out) + .3, 4 + c * 3, 1.6 + c * .6), 2.5));
    }
    if (thorns.length) outlined(g, thorns, 1);
    if (leaves.length) outlined(g, leaves, .9);
  });
  for (const [a, l, d] of [[-2.2, 13, 1], [-.9, 11, -1], [.5, 12, 1], [2.5, 10, -1], [-1.55, 9, 1]]) {
    const r0 = 34 * (1 + c * .1), x0 = Math.cos(a) * r0 * sx, y0 = Math.sin(a) * r0 * sy + dy, x1 = Math.cos(a) * (r0 + l) * sx, y1 = Math.sin(a) * (r0 + l) * sy + dy, cx2 = x1 + Math.cos(a + d * 1.6) * 6, cy2 = y1 + Math.sin(a + d * 1.6) * 6;
    inkLine(g, g2 => { g2.moveTo(x0, y0); g2.bezierCurveTo(x1, y1, cx2, cy2, (x1 + cx2) / 2 + Math.cos(a + d * 3) * 2, (y1 + cy2) / 2 + Math.sin(a + d * 3) * 2); }, 2.4 - c * .4, vine[0], vine[2]);
    if (c < .5) outlined(g, [Pt(thornM, POLY([x1 + Math.cos(a - d * 1.2) * 5, y1 + Math.sin(a - d * 1.2) * 5, x1 - 1.6, y1 - 1.6, x1 + 1.6, y1 + 1.6]), 2)], .9);
    else outlined(g, [Pt(M.LEAF, LF(x1, y1, a - d * .8, 5.6, 2), 2.5)], .9);
  }
  if (c > .2) { const n = Math.round(c * 11), r = rng(5);
    for (let i = 0; i < n; i++) { const L = KNOTL[i % 9], th = PI * c * .92 + L.ph * .1 + r() * (TAU - PI * c * .92), cx = L.ox * sx, cy = L.oy * sy + dy, rot = L.rot * (1 - c * .75), px = L.rx * sx * Math.cos(th), py = L.ry * sy * Math.sin(th);
      rose(g, cx + px * Math.cos(rot) - py * Math.sin(rot), cy + px * Math.sin(rot) + py * Math.cos(rot), c < .5 ? .7 : 1 + r() * .3, i % 3 === 2 ? ['#ffc4d6', '#e88aa6', '#fff0f4'] : M.ROSE); } }
}
// a thorny vine from (x, y): curl 0 whips straight out along dir; curl 1 coils up and back over the top (a wind-up tell)
function tendril(ctx, x, y, dir, len, curl, t, lit, calm) {
  const n = 12, step = len / n, pts = [[x, y]];
  let h = curl > .5 ? -PI / 2 + dir * .7 : (dir > 0 ? -.12 : PI + .12), px = x, py = y;
  for (let i = 1; i <= n; i++) { h += -dir * curl * .42 + Math.sin(t * .2 + i * .9) * .06; px += Math.cos(h) * step; py += Math.sin(h) * step; pts.push([px, py]); }
  const col = calm ? '#6cc25a' : '#8f8088';
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [lw, c] of [[7, PAL.ink], [4.4, col], [1.2, calm ? '#d4f5c0' : '#c4b6be']]) { ctx.strokeStyle = c; ctx.lineWidth = lw * (lw < 2 ? 1 : 1); ctx.beginPath(); for (let i = 0; i <= n; i++) ctx.lineTo(pts[i][0] - (lw < 2 ? .8 : 0), pts[i][1] - (lw < 2 ? .8 : 0)); ctx.stroke(); }
  ctx.fillStyle = M.BONE[0]; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1;
  for (let i = 2; i < n; i += 2) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], tl = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / tl, uy = (by - ay) / tl, s = i & 2 ? 1 : -1, nx = -uy * s, ny = ux * s;
    ctx.beginPath(); ctx.moveTo(ax - ux * 2, ay - uy * 2); ctx.lineTo(ax + nx * 6 + ux * 1.4, ay + ny * 6 + uy * 1.4); ctx.lineTo(ax + ux * 2, ay + uy * 2); ctx.closePath(); ctx.stroke(); ctx.fill(); }
  const tip = pts[n]; if (lit) { glow(ctx, tip[0], tip[1], 11, '#ffb36a', lit); twinkle(ctx, tip[0], tip[1], 2.6, t * .2, '#fff3c0'); }
  return tip;
}
function knotG(ctx, Gd, t) {
  const c = clamp01(num(Gd.calm, 0)), st = Gd.st, dir = Gd.face < 0 ? -1 : 1, T = num(Gd.t, 0);
  let x = Gd.x, y = Gd.y, sq = num(Gd.squash, 0), spin = num(Gd.spin, 0) * (1 - c), sc = 1, ga = .22, gc = '#c4a8ff';
  if (st === 'sleep') { sc = 1 + Math.sin(t * .035) * .02; ga = .06; y += 2; }
  else if (st === 'wake') { x += Math.sin(t * 1.9) * 1.6; ga = .45 + .2 * Math.sin(t * .4); }
  else if (st === 'idle' || st === 'lash' || st === 'burr') y += Math.sin(t * .07) * 1.5;
  else if (st === 'hopTell') { sq = Math.max(sq, .3 + .06 * Math.sin(t * .9)); x += Math.sin(t * 2.3) * 1.2; ga = .55; gc = '#ffb36a'; }
  else if (st === 'hop') sq = Math.min(sq, -.18);
  else if (st === 'land') sq = Math.max(sq, .5 * (1 - clamp01(T / 14)));
  else if (st === 'burrTell') { sc = 1.05 + .03 * Math.sin(t * .8); ga = .6; gc = '#ffb36a'; }
  else if (st === 'tired') { sq = Math.max(sq, .36 + .04 * Math.sin(t * .06)); ga = 0; y += 8; }
  const base = y + 40;
  if (st === 'hopTell' || st === 'land') puffs(ctx, x, base - 2, 4, t, 0, 22, 10, .9, 24);
  if (st === 'burrTell') { ctx.fillStyle = M.BONE[0]; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.2; const n = 14, ext = 4 + 3 * Math.sin(t * .7);
    for (let i = 0; i < n; i++) { const a = i * TAU / n + t * .01, c1 = Math.cos(a), s1 = Math.sin(a); ctx.beginPath(); ctx.moveTo(x + c1 * (38 + ext), y + s1 * (38 + ext)); ctx.lineTo(x + c1 * 34 - s1 * 2.6, y + s1 * 34 + c1 * 2.6); ctx.lineTo(x + c1 * 34 + s1 * 2.6, y + s1 * 34 - c1 * 2.6); ctx.closePath(); ctx.stroke(); ctx.fill(); } }
  const [i, fr] = levels(c), draw = (lv, a) => {
    const img = bake('knot' + lv, 112, 112, 56, 56, g => drawKnot(g, lv / 3));
    const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * a; ctx.save(); ctx.translate(x, base); ctx.scale(sc * (1 + sq * .28), sc * (1 - sq * .28)); ctx.translate(0, -40); if (spin) ctx.rotate(spin);
    ctx.drawImage(img, -img.ox, -img.oy, img.lw, img.lh); ctx.restore(); ctx.globalAlpha = a0;
  };
  draw(i, 1); if (fr > .01) draw(i + 1, fr);
  if (c < .6) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y + sq * 8, 26, gc, ga * (1 - c)); ctx.globalCompositeOperation = 'source-over'; }
  if (st === 'lashTell' || st === 'lash') {
    const lash = st === 'lash', k = lash ? clamp01(T / 8) : 0, L = lash ? 36 + 24 * k : 40 + 3 * Math.sin(t * .3), lit = lash ? 0 : .55 + .3 * Math.sin(t * .5);
    tendril(ctx, x + dir * 32, y - 14, dir, L, lash ? .08 : .58, t, lit, c > .5);
    tendril(ctx, x + dir * 34, y + 10, dir, L * .85, lash ? .04 : .5, t + 9, lit, c > .5);
  }
  if (st === 'tired') tiredFx(ctx, x, y + sq * 10, 40, t, T, dir, c);
  if (st === 'sleep' && !LOW) puffs(ctx, x + 14, y - 34, 2, t, 0, 3, 14, .45, 90);
  if (c > 0) calmSparkles(ctx, x, y + 10 * c, 50, 30, t, c);
  guardHit(ctx, Gd, x, y, 80, 80, t);
}
// a guardian worn out (st 'tired'): the moment to swing. A pink-gold light glows inside, a soft ring breathes out from it,
// sparkles circle it and it lets out a big sigh puff now and then. r = about its radius; dir = the way the sigh goes.
function tiredFx(ctx, x, y, r, t, T, dir, c) {
  const a = 1 - clamp01(c || 0); if (a <= 0) return;
  const a0 = ctx.globalAlpha, p = .5 + .5 * Math.sin(t * .12);
  glow(ctx, x, y, r * 1.05, '#ffb0d6', a * (.32 + .16 * p));
  ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, r * .8, '#ffd95a', a * (.45 + .25 * p)); glow(ctx, x, y, r * .45, '#fff0c0', a * (.35 + .2 * p)); ctx.globalCompositeOperation = 'source-over';
  const q = (T % 56) / 56; ctx.globalAlpha = a0 * a * (1 - q) * .85; ctx.beginPath(); ctx.ellipse(x, y, r * (.75 + q * .6), r * (.75 + q * .6) * .8, 0, 0, TAU); ctx.lineWidth = 3.4 * (1 - q) + 2.6; ctx.strokeStyle = 'rgba(200,80,130,.45)'; ctx.stroke(); ctx.lineWidth = 3.4 * (1 - q) + .8; ctx.strokeStyle = '#ffd0e8'; ctx.stroke(); ctx.globalAlpha = a0;
  for (let i = 0; i < 4; i++) { const an = t * .03 + i * TAU / 4, rr = r * (1.02 + .06 * Math.sin(t * .1 + i)); ctx.globalAlpha = a0 * a; twinkle(ctx, x + Math.cos(an) * rr, y + Math.sin(an) * rr * .7, 3.2 + 1.4 * Math.sin(t * .2 + i * 2), t * .05 + i, i & 1 ? '#ffe9a0' : '#ffd0e8'); }
  const sq = (T % 90) / 90; if (sq < .7) { const k = sq / .7, c2 = sootPuffImg(1); for (let i = 0; i < 3; i++) { const kk = clamp01(k * 1.3 - i * .15); if (kk <= 0) continue; putA(ctx, c2, x + dir * (r * .8 + kk * r * .5 + i * 6), y - r * .25 - kk * r * .4 - i * 3, a * (1 - kk) * 1.1, (1.1 + kk * 1.2) * (1 - i * .25)); } }
  ctx.globalAlpha = a0;
}
function calmSparkles(ctx, x, y, w, h, t, c) {
  if (LOW) return;
  for (let i = 0; i < 6; i++) { const p = ((t * .6 + i * 23) % 80) / 80, sx = x + (hash(i, 7) - .5) * w * 2, sy = y + h - p * h * 2.2; ctx.globalAlpha = GA * (c * Math.sin(p * PI)); twinkle(ctx, sx, sy, 2 + (i & 1) * 1.5, t * .05 + i, i % 3 ? '#fff6c0' : '#ffd0e0'); }
  ctx.globalAlpha = GA;
}
// THE OLD BOILER: a clockwork boiler on stubby legs; chimney, a pressure gauge (heat), valves, a furnace door (door)
const BOIL_IRON = [['#88848f', '#4e4a5a', '#bdb8c6'], ['#a6dcd2', '#5aa89c', '#e4f8f3']];
function boilM(c) { return { iron: mixM(BOIL_IRON[0], BOIL_IRON[1], c), band: mixM(['#6c6878', '#3e3a4a', '#a29eae'], ['#f6bccb', '#c97e94', '#ffe6ee'], c), pipe: mixM(M.IRON, M.LILAC, c), dark: mixM(['#5a5664', '#34303e', '#8a8696'], ['#7cbfb4', '#3f8a80', '#c6ece6'], c) }; }
function drawBoilerBody(g, c) {
  const m = boilM(c);
  inkLine(g, g2 => { g2.moveTo(-48, 8); g2.lineTo(-61, 8); g2.lineTo(-61, -24); }, 6, m.pipe[0], m.pipe[2]);
  inkLine(g, g2 => { g2.moveTo(44, -14); g2.lineTo(57, -14); g2.lineTo(57, -26); }, 5, m.pipe[0], m.pipe[2]);
  outlined(g, [Pt(m.dark, RR(-35, -66, 22, 8, 3), 4), Pt(m.iron, RR(-32, -60, 16, 32, 3), 6, -26, -50), Pt(m.dark, RR(17.5, -40, 6, 12, 2), 2)], 2.2);
  outlined(g, [Pt(m.iron, RR(-52, -32, 104, 68, 30), 30, -20, -14)], 2.6);
  const drum = RR(-52, -32, 104, 68, 30);
  if (!FLASH) {
    g.save(); g.beginPath(); drum(g); g.clip();
    g.fillStyle = m.band[0]; g.fillRect(-32, -34, 7, 72); g.fillRect(24, -34, 7, 72); g.fillStyle = m.band[1]; g.fillRect(-26.5, -34, 1.5, 72); g.fillRect(29.5, -34, 1.5, 72);
    if (c < .9) { const k = 1 - c; g.fillStyle = 'rgba(40,32,50,' + (.38 * k) + ')'; g.beginPath(); g.ellipse(-24, -32, 16, 7, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(-6, -33, 9, 4, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(150,84,60,' + (.45 * k) + ')'; g.lineCap = 'round';
      for (const [x, y, l, w] of [[-40, -10, 9, 2.2], [-12, -20, 7, 1.6], [41, -6, 8, 2], [12, -26, 6, 1.6], [-20, 18, 6, 1.6]]) { g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + .6, y + l); g.stroke(); }
      g.fillStyle = 'rgba(40,32,50,' + (.3 * k) + ')'; g.fillRect(-52, 26, 104, 10); }
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(-26, -20, 18, 5, -.15, 0, TAU); g.fill();
    g.restore();
    rivets(g, [[-28.5, -24], [-28.5, -8], [-28.5, 8], [-28.5, 24], [27.5, -24], [27.5, -8], [27.5, 8], [27.5, 24]], 1.1);
  }
  outlined(g, [Pt(m.dark, RR(-1, -5, 34, 34, 10), 8)], 2);
  g.fillStyle = PAL.ink; g.beginPath(); rrect(g, 3, -1, 26, 26, 7); g.fill();
  if (!FLASH) { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(2, -3, 26, 1.4); }
  if (c > .25) { flowerHead(g, -24, -66, 1.3, 3, c > .6 ? 1 : .7); }
  if (c > .55) { flowerHead(g, -61, -27, 1, 6, 1); flowerHead(g, 57, -29, .9, 4, 1); }
  if (c > .9) { for (const [x, y, a] of [[-46, -12, -2.2], [-40, 26, 2.6], [46, 22, .5], [12, -33, -1.2]]) outlined(g, [Pt(M.LEAF, LF(x, y, a, 7, 2.6), 3)], 1.1); flowerHead(g, -40, 26, .8, 1, 1); flowerHead(g, 12, -34, .75, 0, 1); }
}
function drawBoilerDoor(g, c) {
  const m = boilM(c);
  outlined(g, [Pt(m.iron, RR(0, 0, 26, 26, 7), 8, 9, 8)], 1.6);
  if (FLASH) return;
  g.strokeStyle = m.dark[1]; g.lineWidth = 1; g.beginPath(); for (const y of [9, 13, 17]) { g.moveTo(6, y); g.lineTo(20, y); } g.stroke();
  outlined(g, [Pt(BRASS, RR(19.5, 10, 4, 6, 1.6), 2)], .9);
  rivets(g, [[3.4, 3.4], [22.6, 3.4], [3.4, 22.6], [22.6, 22.6]], .8);
}
function drawBoilerLeg(g, c) { const m = boilM(c); outlined(g, [Pt(m.dark, RR(-6, 0, 12, 14, 4), 5), Pt(m.dark, E(1, 15, 10, 4.6), 5, 0, 14)], 1.8); }
function drawGauge(g, c) {
  const m = boilM(c);
  outlined(g, [Pt(m.pipe, C(0, 0, 10), 10, 0, 0)], 1.8);
  g.fillStyle = FLASH ? '#fff' : PAL.cream; g.beginPath(); g.arc(0, 0, 7.4, 0, TAU); g.fill();
  if (FLASH) return;
  g.lineWidth = 2; g.lineCap = 'butt';
  for (const [a0, a1, col] of [[-2.3, -.8, '#7fd8a0'], [-.8, .7, '#ffd93b'], [.7, 2.3, '#ff7a6a']]) { g.strokeStyle = col; g.beginPath(); g.arc(0, 0, 5.8, a0 - PI / 2, a1 - PI / 2); g.stroke(); }
  g.strokeStyle = PAL.ink; g.lineWidth = .6; g.beginPath(); g.arc(0, 0, 7.4, 0, TAU); g.stroke();
}
function valveImg(c) { return bake('valve' + c, 12, 12, 6, 6, g => { const m = c ? M.LILAC : M.RED; outlined(g, [Pt(m, C(0, 0, 4.6), 4.6, 0, 0)], 1.3); g.fillStyle = PAL.ink; g.fillRect(-.6, -4.6, 1.2, 9.2); g.fillRect(-4.6, -.6, 9.2, 1.2); g.beginPath(); g.arc(0, 0, 1.4, 0, TAU); g.fill(); }); }
function boilerG(ctx, Gd, t) {
  const c = clamp01(num(Gd.calm, 0)), st = Gd.st, dir = Gd.face < 0 ? -1 : 1, T = num(Gd.t, 0);
  let heat = clamp01(num(Gd.heat, .3)), door = clamp01(num(Gd.door, 0)), x = Gd.x, y = Gd.y, bodyDy = 0, sqx = 1, sqy = 1, rot = 0, legL = 0, legR = 0, legS = 1, valveSpin = t * .02, smoke = 2;
  if (st === 'sleep') { bodyDy = 5; smoke = 1; heat = Math.min(heat, .1); }
  else if (st === 'wake') { x += Math.sin(t * 2) * 1.4; smoke = 4; }
  else if (st === 'idle' || st === 'calm') { bodyDy = Math.sin(t * .08) * 1.2; }
  else if (st === 'walk') { const p = t * .16; legL = Math.max(0, Math.sin(p)) * 6; legR = Math.max(0, -Math.sin(p)) * 6; bodyDy = -Math.abs(Math.sin(p)) * 2; rot = Math.sin(p) * .03; }
  else if (st === 'ventTell') { x += Math.sin(t * 2.2) * 1.3; valveSpin = t * .5; smoke = 3; }
  else if (st === 'vent') { valveSpin = t * .3; }
  else if (st === 'boltTell') { const k = clamp01(T / 32); x += Math.sin(t * 2.7) * (1.2 + k * 1.6); bodyDy = Math.sin(t * 3.3) * (.6 + k) - k * 3; rot = Math.sin(t * 1.9) * .025 * (1 + k); smoke = 3; heat = Math.max(heat, .6 + .4 * k); }
  else if (st === 'slamTell') { const k = clamp01(T / 30); bodyDy = -12 * k; legS = 1 + .8 * k; rot = Math.sin(t * .5) * .03; }
  else if (st === 'slam') { const k = clamp01(T / 10); bodyDy = 4 * (1 - k); sqx = 1 + .07 * (1 - k); sqy = 1 - .08 * (1 - k); }
  else if (st === 'tired') { bodyDy = 9 + Math.sin(t * .06) * 1; rot = .07 * dir; sqy = .95; sqx = 1.03; smoke = 1; heat = Math.min(heat, .2); }
  const by = y + bodyDy, foot = y + 55, [i, fr] = levels(c);
  // legs
  const leg = bake('bleg' + Math.round(c * 3), 26, 22, 13, 2, g => drawBoilerLeg(g, Math.round(c * 3) / 3));
  for (const [lx, lift] of [[-30, legL], [30, legR]]) { const top = by + 34, h = (foot - lift - top); ctx.save(); ctx.translate(x + lx * dir, top); ctx.scale(dir, Math.max(.4, h / 20) * (legS > 1 ? 1 : 1)); ctx.drawImage(leg, -leg.ox, -leg.oy, leg.lw, leg.lh); ctx.restore(); }
  if (st === 'slam') puffs(ctx, x, foot - 2, 5, t, 0, 40, 10, 1, 20);
  // smoke / steam from the chimney
  if (!LOW || smoke > 1) puffs(ctx, x - 24 * dir, by - 68, smoke + (st === 'calm' ? 1 : 0), t, c > .5, 5, 26, .9, st === 'sleep' ? 120 : 60);
  // body
  const body = (lv, a) => { const img = bake('boil' + lv, 136, 140, 68, 72, g => drawBoilerBody(g, lv / 3)); const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * a; ctx.save(); ctx.translate(x, by + 36); ctx.rotate(rot); ctx.scale(dir * sqx, sqy); ctx.translate(0, -36); ctx.drawImage(img, -img.ox, -img.oy, img.lw, img.lh); ctx.restore(); ctx.globalAlpha = a0; };
  body(i, 1); if (fr > .01) body(i + 1, fr);
  ctx.save(); ctx.translate(x, by + 36); ctx.rotate(rot); ctx.scale(dir * sqx, sqy); ctx.translate(0, -36);
  // the fire behind the furnace door, the door, the gauge needle, the valves
  const fire = Math.max(heat, door) * (1 - c * .8);
  if (fire > .02) { glow(ctx, 16, 12, 16 + fire * 8, '#ff9a4a', .5 + fire * .5); ctx.fillStyle = '#ffdf7a'; for (let k = 0; k < 4; k++) { const ex = 8 + k * 5, ey = 20 - ((t * .5 + k * 7) % 8); ctx.globalAlpha = GA * (fire); ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, TAU); ctx.fill(); } ctx.globalAlpha = GA; }
  const dimg = bake('bdoor' + Math.round(c * 3), 26, 26, 0, 0, g => drawBoilerDoor(g, Math.round(c * 3) / 3)), dk = Math.cos(door * 1.35);
  ctx.save(); ctx.translate(3, -1); ctx.scale(dk, 1); ctx.drawImage(dimg, -dimg.ox, -dimg.oy, dimg.lw, dimg.lh); ctx.restore();
  if (fire > .3 && door > .1) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, 22, 12, 22, '#ff8a3d', fire * .6); ctx.globalCompositeOperation = 'source-over'; }
  const gimgv = bake('gauge' + Math.round(c * 3), 22, 22, 11, 11, g => drawGauge(g, Math.round(c * 3) / 3)); ctx.drawImage(gimgv, 20.5 - gimgv.ox, -48 - gimgv.oy, gimgv.lw, gimgv.lh);
  const na = -2.3 + heat * 4.6 + (st === 'ventTell' || st === 'boltTell' ? Math.sin(t * 1.4) * .12 : 0);
  ctx.strokeStyle = '#d23a4a'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(20.5, -48); ctx.lineTo(20.5 + Math.sin(na) * 6.2, -48 - Math.cos(na) * 6.2); ctx.stroke(); ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(20.5, -48, 1.2, 0, TAU); ctx.fill();
  const vi = valveImg(c > .5 ? 1 : 0); putT(ctx, vi, -61, -27, 1, 1, valveSpin); putT(ctx, vi, 57, -29, 1, 1, -valveSpin * 1.3);
  if (c < .5 && heat > .55) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -6, 40, '#ff6a3a', (heat - .55) * .5); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  // steam hisses (tells) and jets (vent)
  if (st === 'ventTell') { puffs(ctx, x - 61 * dir, by - 30, 3, t * 3, 1, 2, 8, .45, 18); puffs(ctx, x + 57 * dir, by - 32, 3, t * 3 + 5, 1, 2, 8, .45, 18); }
  if (st === 'vent') { puffs(ctx, x - 64 * dir, by - 30, 5, t * 2, 1, 6, 30, 1, 20); puffs(ctx, x + 60 * dir, by - 32, 5, t * 2 + 7, 1, 6, 30, 1, 20); }
  if (st === 'tired') { puffs(ctx, x - 24 * dir, by - 70, 2, t, 1, 3, 12, .6, 80); tiredFx(ctx, x + 6 * dir, by + 2, 58, t, T, -dir, c); }
  if (st === 'boltTell' && c < .5) { // winding up to throw: the chimney glows hot and spits embers
    const k = clamp01(T / 32), chx = x - 24 * dir, chy = by - 66;
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,110,50,' + (.2 + .4 * k).toFixed(3) + ')'; ctx.beginPath(); rrect(ctx, chx - 8, chy + 6, 16, 30, 3); ctx.fill(); glow(ctx, chx, chy, 16 + k * 18, '#ff9a4a', .55 + .4 * k + .1 * Math.sin(t * .7)); glow(ctx, chx, chy - 4, 8 + k * 8, '#fff0a0', .5 + .4 * k); ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 5; i++) { const q = ((t * (1.2 + k) + i * 13) % 34) / 34; ctx.globalAlpha = GA * (1 - q); twinkle(ctx, chx + Math.sin(i * 2.3 + q * 5) * (4 + q * 10), chy - 4 - q * (18 + k * 16), 1.6 + (1 - q) * 2.2, t * .2 + i, i & 1 ? '#ffd24a' : '#ff9a4a'); }
    ctx.globalAlpha = GA;
  }
  if (st === 'slamTell') { ctx.globalAlpha = GA * (.35 + .2 * clamp01(T / 30)); ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(x, foot + 1, 56, 5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = GA; }
  if (c > 0) calmSparkles(ctx, x, by - 10, 60, 40, t, c);
  guardHit(ctx, Gd, x, by, 100, 70, t);
}
// THE GREY CLOUD: a big storm cloud; darker with Gd.dark; little sparks; calm: white and fluffy with a rainbow
const CLOUDP = [[-48, 10, 20], [-27, -7, 25], [0, -14, 29], [29, -7, 25], [51, 9, 19], [-24, 16, 20], [2, 15, 23], [27, 16, 20], [-62, 20, 11], [63, 20, 10]];
function drawCloud(g, k) {
  const m = [['#aaa4bc', '#77708f', '#dddae8'], ['#6c6587', '#433c5c', '#9a93b2'], ['#ffffff', '#d4cfee', '#ffffff']][k];
  outlined(g, CLOUDP.map(([x, y, r], i) => Pt(m, C(x, y, r), r, i === 1 || i === 2 ? x : null, y)), 2.6);
  if (FLASH) return;
  if (k < 2) {
    tintAtop(g, () => { const gr = g.createLinearGradient(0, 6, 0, 36); gr.addColorStop(0, 'rgba(50,38,80,0)'); gr.addColorStop(1, k ? 'rgba(26,18,44,.5)' : 'rgba(60,46,96,.42)'); g.fillStyle = gr; g.fillRect(-80, 6, 160, 32); });
    const sc = k ? 'rgba(28,20,44,.72)' : 'rgba(52,42,72,.62)';
    scribble(g, -34, 12, 7, .4, 1.6, sc); scribble(g, 2, -6, 11, 2.2, 1.9, sc); scribble(g, 36, 10, 6, 4.1, 1.5, sc);
  } else tintAtop(g, () => { const gr = g.createLinearGradient(0, 10, 0, 36); gr.addColorStop(0, 'rgba(255,190,220,0)'); gr.addColorStop(1, 'rgba(255,190,220,.4)'); g.fillStyle = gr; g.fillRect(-80, 10, 160, 28); });
}
function cloudG(ctx, Gd, t) {
  const c = clamp01(num(Gd.calm, 0)), st = Gd.st, T = num(Gd.t, 0), gd = num(Gd.dir, Gd.face || 1) < 0 ? -1 : 1;
  let dark = clamp01(num(Gd.dark, .3)), x = Gd.x, y = Gd.y + Math.sin(t * .05) * 3, sx = 1, sy = 1, ox = 0;
  if (st === 'sleep') { y += 4; dark *= .5; }
  else if (st === 'wake') x += Math.sin(t * 1.6) * 1.5;
  else if (st === 'rainTell') { sy = 1 + .04 * Math.sin(t * .4); dark = Math.max(dark, .5 + .3 * clamp01(T / 40)); }
  else if (st === 'zapTell') { x += Math.sin(t * 2.4) * .8; }
  else if (st === 'gustTell') { const k = .06 + .03 * Math.sin(t * .5); sx = 1 + k; sy = 1 + k; }
  else if (st === 'gust') { sx = 1.12; sy = .92; ox = gd * 6; }
  else if (st === 'tired') { sx = 1.06; sy = .84 + .02 * Math.sin(t * .06); y += 10; }
  if (c > 0) { // the rainbow behind
    const cols = ['#ff8a8a', '#ffb36a', '#ffe27a', '#8fe08a', '#7fd0ff', '#b49cff'];
    ctx.lineCap = 'butt'; for (let i = 0; i < 6; i++) { ctx.globalAlpha = GA * (c * .85); ctx.strokeStyle = cols[i]; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.arc(x, y + 34, 80 - i * 4, PI * 1.02, PI * 1.98); ctx.stroke(); } ctx.globalAlpha = GA;
  }
  if (st === 'rainTell' && c < .5) { // where the rain will fall: the whole strip under the cloud, down to the floor
    const k = clamp01(T / 42), rw = Math.max(60, num(Gd.w, 150) - 30), top = y + 34, fl = num(Gd.floor, y + 220);
    if (fl - top > 20) { warnBox(ctx, x - rw / 2, top, rw, fl - top, k, t); for (const dx of [-.3, .3]) marchArrows(ctx, x + dx * rw, top + 8, x + dx * rw, fl - 10, 8, k, t); warnRing(ctx, x, fl, rw * .5, k, t); }
  }
  if (st === 'rainTell' && c < 1) { ctx.fillStyle = 'rgba(170,180,210,.8)'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = .8; for (let i = 0; i < 7; i++) { const dx = -54 + i * 18, p = ((t + i * 11) % 30) / 30; ctx.beginPath(); ctx.ellipse(x + dx, y + 36 + p * 3, 1.4, 1.4 + p * 1.6, 0, 0, TAU); ctx.fill(); ctx.stroke(); } }
  if ((st === 'tired' || st === 'sleep') && c < 1) { ctx.strokeStyle = 'rgba(160,170,200,.6)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 5; i++) { const dx = -40 + i * 20, p = ((t * .8 + i * 13) % 30) / 30; ctx.moveTo(x + dx, y + 34 + p * 20); ctx.lineTo(x + dx - .6, y + 38 + p * 20); } ctx.stroke(); }
  const put3 = (k, a) => { if (a <= .01) return; const img = bake('cloud' + k, 160, 84, 80, 42, g => drawCloud(g, k)); const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * a; ctx.save(); ctx.translate(x + ox, y); ctx.scale(sx, sy); ctx.drawImage(img, -img.ox, -img.oy, img.lw, img.lh); ctx.restore(); ctx.globalAlpha = a0; };
  if (c < 1) { put3(0, 1); put3(1, dark * (1 - c)); }
  put3(2, c < 1 ? c : 1);
  if (c < .7) {
    const zap = st === 'zapTell' || st === 'zap', n = Math.round(1 + dark * 3 + (zap ? 4 : 0));
    if (zap) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, x + Math.sin(t * .9) * 30, y, 40, '#fff3a0', st === 'zap' ? .7 : .25 + .25 * ((t >> 2) & 1)); ctx.globalCompositeOperation = 'source-over'; }
    sparks(ctx, x, y + 6, 66, t, n, '#fff3a0');
  }
  if (st === 'gustTell' || st === 'gust') {
    ctx.strokeStyle = 'rgba(235,235,250,.75)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const yy = y - 18 + i * 12, p = ((t * (st === 'gust' ? 2 : .8) + i * 9) % 30) / 30, x0 = x + gd * (st === 'gust' ? 70 + p * 40 : 110 - p * 36);
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.quadraticCurveTo(x0 + gd * 10, yy - 6, x0 + gd * 22, yy - 1); ctx.stroke(); }
  }
  if (st === 'tired') tiredFx(ctx, x, y + 6, 66, t, T, gd, c);
  if (c > 0) calmSparkles(ctx, x, y - 10, 70, 30, t, c);
  guardHit(ctx, Gd, x, y, 130, 50, t);
}
// THE GLOOM HEART: a great grey seed wrapped in thorns and smog; phases shed the layers; glow = golden light inside; calm: the HEARTSEED
const HSEED = SEED(0, -2, 46, 56);
const CRACKS = [[[-6, -40], [-12, -26], [-6, -14], [-14, 0]], [[10, -30], [18, -16], [12, -4]], [[-24, 6], [-14, 16], [-20, 30]], [[20, 10], [28, 22], [20, 34], [26, 42]], [[2, 4], [-4, 18], [4, 30]], [[-30, -10], [-36, 4]], [[30, -20], [36, -6]]];
function drawHeartSeed(g, ph) {
  outlined(g, [Pt(['#958ea2', '#5c556e', '#ccc6d6'], HSEED, 46, -12, -18)], 2.8);
  if (FLASH) return;
  g.save(); g.beginPath(); HSEED(g); g.clip();
  g.strokeStyle = 'rgba(60,50,80,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -58); g.bezierCurveTo(8, -20, -8, 20, 2, 54); g.stroke();
  g.strokeStyle = 'rgba(60,50,80,.25)'; g.lineWidth = 1.4; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(0, 6 + i * 2, 40 - i * 5, 30 - i * 4, 0, PI * 1.1, PI * 1.9); g.stroke(); }
  g.fillStyle = 'rgba(40,30,58,.25)'; g.beginPath(); g.ellipse(14, 26, 36, 26, -.3, 0, TAU); g.fill();
  const n = ph >= 3 ? 7 : ph === 2 ? 3 : 0; g.strokeStyle = PAL.ink; g.lineWidth = 2.6; g.lineJoin = 'round';
  for (let i = 0; i < n; i++) { g.beginPath(); for (const [px, py] of CRACKS[i]) g.lineTo(px, py); g.stroke(); }
  g.restore();
}
function drawHeartCracks(g, ph) {
  const n = ph >= 3 ? 7 : ph === 2 ? 3 : 0; g.lineJoin = g.lineCap = 'round';
  for (const [w, col] of [[5, 'rgba(255,200,80,.35)'], [1.8, '#ffe27a'], [.7, '#fffbe0']]) { g.strokeStyle = col; g.lineWidth = w; for (let i = 0; i < n; i++) { g.beginPath(); for (const [px, py] of CRACKS[i]) g.lineTo(px, py); g.stroke(); } }
  g.fillStyle = 'rgba(255,214,90,.35)'; g.beginPath(); g.ellipse(0, 4, 10, 16, 0, 0, TAU); g.fill();
}
function drawHeartWrap(g, ph) {
  const bands = ph <= 1 ? [[-20, .32, 13], [8, -.26, 12], [30, .18, 10], [-38, -.12, 8]] : [[-14, .3, 13], [22, -.22, 11]];
  bands.forEach(([cy, rot, ry], bi) => {
    const rx = 47 * Math.sqrt(Math.max(.2, 1 - Math.pow((cy + 2) / 58, 2))) + 3, broken = ph === 2 && bi === 1;
    const a0 = broken ? .5 : .05, a1 = broken ? 2.3 : PI - .05, path = g2 => { g2.ellipse(0, cy, rx, ry, rot, a0, a1); };
    inkLine(g, path, 5, '#8f8088', '#c4b6be');
    const thorns = [];
    for (let k = 1; k < 9; k++) { const a = a0 + (a1 - a0) * k / 9, ex = rx * Math.cos(a), ey = ry * Math.sin(a), px = ex * Math.cos(rot) - ey * Math.sin(rot), py = cy + ex * Math.sin(rot) + ey * Math.cos(rot), tx = -rx * Math.sin(a), ty = ry * Math.cos(a), qx = tx * Math.cos(rot) - ty * Math.sin(rot), qy = tx * Math.sin(rot) + ty * Math.cos(rot), tl = Math.hypot(qx, qy) || 1, s = k & 1 ? 1 : -1, nx = -qy / tl * s, ny = qx / tl * s;
      thorns.push(Pt(M.BONE, POLY([px + nx * 6.4, py + ny * 6.4, px - qx / tl * 2.4, py - qy / tl * 2.4, px + qx / tl * 2.4, py + qy / tl * 2.4]), 2)); }
    outlined(g, thorns, 1);
    if (broken) for (const a of [a0, a1]) { const ex = rx * Math.cos(a), ey = ry * Math.sin(a); outlined(g, [Pt(M.BONE, C(ex * Math.cos(rot) - ey * Math.sin(rot), cy + ex * Math.sin(rot) + ey * Math.cos(rot), 2), 2)], .8); }
  });
}
function drawHeartGold(g) {
  inkLine(g, g2 => { g2.moveTo(0, -56); g2.quadraticCurveTo(-2, -64, 1, -70); }, 2.6, '#6fcf5a');
  outlined(g, [Pt(M.LEAF, LF(1, -70, -2.5, 15, 5.4), 5, -7, -74), Pt(M.LEAF, LF(1, -70, -.55, 16, 5.6), 5, 9, -76)], 1.6);
  outlined(g, [Pt(['#ffd95a', '#f0a020', '#fff6c8'], HSEED, 46, -12, -18)], 2.8);
  if (FLASH) return;
  g.save(); g.beginPath(); HSEED(g); g.clip();
  const gr = g.createRadialGradient(-4, 0, 4, 0, 0, 56); gr.addColorStop(0, 'rgba(255,255,230,.9)'); gr.addColorStop(.5, 'rgba(255,240,170,.35)'); gr.addColorStop(1, 'rgba(255,200,80,0)'); g.fillStyle = gr; g.fillRect(-60, -60, 120, 120);
  g.strokeStyle = 'rgba(224,140,30,.45)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -58); g.bezierCurveTo(8, -20, -8, 20, 2, 54); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-20, -22, 9, 18, .35, 0, TAU); g.fill();
  g.restore();
}
function heartG(ctx, Gd, t) {
  const c = clamp01(num(Gd.calm, 0)), st = Gd.st, T = num(Gd.t, 0), ph = Math.max(1, Math.min(3, num(Gd.phase, 1) | 0)), dir = Gd.face < 0 ? -1 : 1;
  let gl = clamp01(num(Gd.glow, 0)), x = Gd.x, y = Gd.y + Math.sin(t * .045) * 3, sc = 1 + Math.sin(t * .05) * .012, sx = 1, sy = 1;
  if (st === 'sleep') { sc = 1 + Math.sin(t * .03) * .02; y += 3; }
  else if (st === 'wake') x += Math.sin(t * 1.7) * 1.6;
  else if (st === 'dropTell') { y -= 6 * clamp01(T / 30); x += Math.sin(t * 2) * 1.2; }
  else if (st === 'drop') { sx = .9; sy = 1.1; }
  else if (st === 'tired') { y += 10; sc = .96; sy = .93 + .015 * Math.sin(t * .06); sx = 1.04; }
  const nsm = c >= 1 ? 0 : ph === 1 ? 9 : ph === 2 ? 6 : 3, rotS = t * (st === 'summon' || st === 'orbTell' ? .03 : .01), sm = wispImg();
  const ring = front => { for (let i = 0; i < nsm; i++) { const a = rotS + i * TAU / nsm, s = Math.sin(a); if ((s > 0) !== front) continue;
    const rr = st === 'orbTell' ? 70 - 14 * clamp01(T / 40) : st === 'summon' ? 66 + 6 * Math.sin(t * .2) : 64; putA(ctx, sm, x + Math.cos(a) * rr, y + 14 + s * 20, (1 - c) * (ph === 3 ? .55 : .85), (1 + .25 * s) * (i & 1 ? -1 : 1), 1 + .25 * s); } };
  ring(false);
  if (c > 0) { // radiant rays behind the Heartseed
    rays(ctx, x, y, 105, 14, t * .006, c * .5); glow(ctx, x, y, 95, '#ffe27a', c * .75);
  }
  if (gl > 0 || st === 'orbTell') glow(ctx, x, y, 70 + gl * 20, '#ffd95a', gl * .5);
  const S = (img, a) => { if (a <= .01) return; const a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * a; ctx.save(); ctx.translate(x, y); ctx.scale(sc * sx, sc * sy); ctx.drawImage(img, -img.ox, -img.oy, img.lw, img.lh); ctx.restore(); ctx.globalAlpha = a0; };
  if (c < 1) {
    S(bake('hseed' + ph, 104, 124, 52, 62, g => drawHeartSeed(g, ph)), 1);
    if (ph > 1 || gl > 0) S(bake('hcrack' + ph, 104, 124, 52, 62, g => drawHeartCracks(g, ph)), clamp01(.35 + gl * .65 + (ph === 3 ? .2 : 0)) * (.85 + .15 * Math.sin(t * .2)));
    if (ph < 3) S(bake('hwrap' + ph, 124, 124, 62, 62, g => drawHeartWrap(g, ph)), 1 - c);
  }
  if (c > 0) S(bake('hgold', 104, 150, 52, 88, drawHeartGold), c);
  ring(true);
  if (c < .5) {
    if (st === 'sweepTell' || st === 'sweep') { const sw = st === 'sweep', k = sw ? clamp01(T / 8) : 0; tendril(ctx, x + dir * 40, y + 10, dir, sw ? 40 + 30 * k : 30, sw ? .12 : .95, t, sw ? 0 : .6 + .3 * Math.sin(t * .5)); tendril(ctx, x - dir * 40, y + 14, -dir, sw ? 36 + 20 * k : 26, sw ? .12 : .9, t + 7, sw ? 0 : .6); }
    if (st === 'orbTell') { const k = clamp01(T / 40); glow(ctx, x + dir * 2, y + 6, 14 + k * 10, '#8a6ab8', .5 + k * .4); scribble(ctx, x, y + 6, 6 + k * 5, t * .3, 1.6, 'rgba(40,30,60,.85)'); }
    if (st === 'dropTell') { ctx.globalAlpha = GA * (.3 + .3 * clamp01(T / 30)); ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(x, y + 66, 40, 5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = GA; }
    if (st === 'tired') tiredFx(ctx, x, y + 4, 58, t, T, dir, c);
  }
  if (c > 0) calmSparkles(ctx, x, y, 60, 50, t, c);
  guardHit(ctx, Gd, x, y, 80, 100, t);
}
function smogImg(f) { return gimg('smog', f, 34, 30, g => drawSmog(g, f)); }
function wispImg() { return bake('wisp', 30, 18, 15, 9, g => outlined(g, [[-7, 2, 5.4], [0, -1.6, 6.6], [7.4, 2, 5], [1, 3.6, 5]].map(([x, y, r]) => Pt(M.SMOG, C(x, y, r), r)), 1.4)); }
// soft sun rays: a fan of thin tapered wedges with a gradient so they fade out
function rays(ctx, x, y, r, n, rot, a) {
  if (a <= 0) return; const a0 = ctx.globalAlpha, gr = ctx.createRadialGradient(x, y, r * .15, x, y, r);
  gr.addColorStop(0, 'rgba(255,240,170,.9)'); gr.addColorStop(1, 'rgba(255,214,90,0)');
  ctx.globalAlpha = a0 * a; ctx.fillStyle = gr; ctx.beginPath();
  for (let i = 0; i < n; i++) { const b = rot + i * TAU / n, w = i & 1 ? .05 : .09; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b - w) * r, y + Math.sin(b - w) * r); ctx.lineTo(x + Math.cos(b + w) * r, y + Math.sin(b + w) * r); ctx.closePath(); }
  ctx.fill(); ctx.globalAlpha = a0;
}
const GUARD = { knot: knotG, boiler: boilerG, cloud: cloudG, heart: heartG };
function guardian(ctx, Gd, t) {
  if (!Gd) return; t = num(t, 0) | 0;
  const fn = GUARD[Gd.kind]; if (!fn) { fallback(ctx, Gd.x, Gd.y, 30); return; }
  try { fn(ctx, Gd, t); } catch (e) { err(e); }
}
/* =====================================================================================================================
   HAZARDS (guardian attacks): x,y,w,h = the rect (top-left). tell > 0 = a harmless warning; live = the real thing.
   ===================================================================================================================== */
/* WARNINGS: every tell (tell > 0) gets the same loud language a 10-year-old reads at a glance: a pulsing warm fill over the
   danger zone, a thick warm outline over an ink under-stroke, arrows marching the way the attack will come, and (for columns)
   a ring on the floor where it lands. k = 0..1 how close it is (from Hz.tell, ~50 ticks). */
const WARM = '255,198,44';
function warnBox(ctx, x, y, w, h, k, t, rad) {
  const p = .5 + .5 * Math.sin(t * (.16 + k * .24));
  rad = rad == null ? Math.min(7, w / 2, h / 2) : Math.min(rad, w / 2, h / 2);
  ctx.beginPath(); rrect(ctx, x, y, w, h, rad);
  ctx.fillStyle = 'rgba(' + WARM + ',' + ((.12 + .18 * k) * (.72 + .28 * p)).toFixed(3) + ')'; ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(43,33,64,' + (.5 + .3 * k).toFixed(3) + ')'; ctx.lineWidth = 4.8; ctx.stroke();
  const q = p * (.4 + .6 * k); ctx.strokeStyle = 'rgba(255,' + (205 + 40 * q | 0) + ',' + (58 + 100 * q | 0) + ',' + (.88 + .07 * k).toFixed(3) + ')'; ctx.lineWidth = 2.5; ctx.stroke();
}
// a ring on the floor where a column lands: it closes in on the spot as the attack gets near
function warnRing(ctx, cx, fy, rw, k, t) {
  const s = 1 + (1 - k) * .55, p = .5 + .5 * Math.sin(t * .3), rh = 4.5 + 1.5 * k;
  ctx.fillStyle = 'rgba(' + WARM + ',' + (.22 + .28 * k * (.6 + .4 * p)).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(cx, fy - 1, rw * .62, rh * .62, 0, 0, TAU); ctx.fill();
  for (const [lw, col] of [[4.8, 'rgba(43,33,64,.65)'], [2.5, 'rgba(255,' + (210 + 35 * p * k | 0) + ',' + (60 + 90 * p * k | 0) + ',' + (.88 + .07 * k).toFixed(3) + ')']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(cx, fy - 1, rw * s, rh * s, 0, 0, TAU); ctx.stroke(); }
}
// arrows marching from a to b (pointing at b): the way the attack will travel
function marchArrows(ctx, ax, ay, bx, by, size, k, t, n) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  n = n || Math.max(1, Math.min(7, Math.floor(L / 44)));
  const q0 = t * (.9 + k * 1.6) / L, a0 = ctx.globalAlpha; ctx.lineCap = ctx.lineJoin = 'round';
  for (const [lw, col] of [[5, PAL.ink], [2.6, '#ffd24a']]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    for (let i = 0; i < n; i++) { const q = (q0 + i / n) % 1, px = ax + dx * q, py = ay + dy * q; ctx.globalAlpha = a0 * Math.sin(q * PI) * (.6 + .4 * k);
      ctx.beginPath(); ctx.moveTo(px - ux * size * .7 + nx * size, py - uy * size * .7 + ny * size); ctx.lineTo(px, py); ctx.lineTo(px - ux * size * .7 - nx * size, py - uy * size * .7 - ny * size); ctx.stroke(); }
  }
  ctx.globalAlpha = a0;
}
// a column warning: box, arrows (dir 1 = coming down, -1 = coming up), floor ring
function warnColumn(ctx, x, y, w, h, k, t, dir) {
  const cx = x + w / 2, by = y + h;
  warnBox(ctx, x, y, w, h, k, t);
  if (h > 30) marchArrows(ctx, cx, dir > 0 ? y + 8 : by - 8, cx, dir > 0 ? by - 10 : y + 12, Math.min(9, w * .3), k, t);
  warnRing(ctx, cx, by, w * .62, k, t);
}
function dashedRect(ctx, x, y, w, h, col, t) { ctx.save(); ctx.setLineDash([3, 3]); ctx.lineDashOffset = -t * .3; ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); rrect(ctx, x, y, w, h, Math.min(4, w / 2, h / 2)); ctx.stroke(); ctx.restore(); }
function cracks(ctx, x, y, w, k, t, col) {
  ctx.strokeStyle = col || PAL.ink; ctx.lineWidth = 1.3; ctx.lineCap = ctx.lineJoin = 'round'; ctx.beginPath();
  const n = Math.max(2, Math.round(w / 14));
  for (let i = 0; i < n; i++) { const cx = x + (i + .5) * w / n, l = 3 + k * 6; ctx.moveTo(cx - l, y - .5); ctx.lineTo(cx - l * .3, y - 1.6); ctx.lineTo(cx + l * .2, y - .3); ctx.lineTo(cx + l, y - 1.4); }
  ctx.stroke();
  if (!LOW) { ctx.fillStyle = '#8a7a6a'; for (let i = 0; i < n; i++) { const p = ((t * 1.3 + i * 11) % 14) / 14, cx = x + (i + .3) * w / n; ctx.beginPath(); ctx.arc(cx, y - 1 - Math.sin(p * PI) * 4 * k, .9, 0, TAU); ctx.fill(); } }
}
const HZ = {
  spike(ctx, H, t, tell) {
    const { x, y, w, h } = H, by = y + h, n = Math.max(1, Math.round(w / 11)), sw = w / n;
    if (tell) { const k = clamp01(1 - H.tell / 50); glow(ctx, x + w / 2, by, w * .7, '#ffb36a', .25 + k * .4); warnColumn(ctx, x, y, w, h, k, t, -1); cracks(ctx, x, by, w, k, t, '#2b2140');
      const up = 1.5 + k * 5; ctx.fillStyle = M.BONE[0]; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.4; ctx.lineJoin = 'round';   // thorn tips peeking out of the ground
      for (let i = 0; i < n; i++) { const tx = x + i * sw + sw / 2 + Math.sin(t * .9 + i) * .4 * k; ctx.beginPath(); ctx.moveTo(tx - 3.4, by); ctx.lineTo(tx, by - up); ctx.lineTo(tx + 3.4, by); ctx.closePath(); ctx.stroke(); ctx.fill(); }
      return; }
    const g = ease(num(H.t, 9) / 6), top = by - h * g;
    ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) { // curved thorns, leaning alternately, like giant rose thorns
      const x0 = x + i * sw, lean = (i & 1 ? 1 : -1) * sw * .35, tip = top + (i & 1) * h * .12 * g, tx = x0 + sw / 2 + lean * g, hh = by - tip;
      const path = () => { ctx.beginPath(); ctx.moveTo(x0 + .4, by); ctx.quadraticCurveTo(x0 + sw * .3, by - hh * .45, tx, tip); ctx.quadraticCurveTo(x0 + sw * .78, by - hh * .4, x0 + sw - .4, by); ctx.closePath(); };
      path(); ctx.lineWidth = 2.4; ctx.strokeStyle = PAL.ink; ctx.stroke(); ctx.fillStyle = M.BRAM[1]; ctx.fill();
      ctx.save(); path(); ctx.clip(); ctx.fillStyle = M.BRAM[0]; ctx.beginPath(); ctx.moveTo(x0, by); ctx.quadraticCurveTo(x0 + sw * .26, by - hh * .45, tx - 1, tip); ctx.lineTo(tx - 1, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = M.BRAM[2]; ctx.fillRect(x0 + sw * .3, by - hh * .5, 1, hh * .3); ctx.restore();
      ctx.fillStyle = M.BONE[0]; ctx.beginPath(); ctx.arc(tx, tip + 1.2, .9, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(x, by - 3); ctx.bezierCurveTo(x + w * .3, by - 7 * g, x + w * .6, by + 1, x + w, by - 4 * g); ctx.stroke(); ctx.strokeStyle = M.VINEG[0]; ctx.lineWidth = 1.8; ctx.stroke();
  },
  zap(ctx, H, t, tell) {
    const { x, y, w, h } = H, cx = x + w / 2;
    if (tell) { const k = clamp01(1 - H.tell / 50); glow(ctx, cx, y + h, 14 + k * 12, '#ffe27a', .3 + k * .4); warnColumn(ctx, x, y, w, h, k, t, 1); sparks(ctx, cx, y + 6, 8, t, 2 + Math.round(k * 2), '#fff3a0'); return; }
    const seg = Math.max(3, Math.round(h / 14)), pts = []; for (let i = 0; i <= seg; i++) pts.push([cx + (i && i < seg ? (hash(t >> 1, i) - .5) * w * .9 : 0), y + h * i / seg]);
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, cx, y + h / 2, Math.max(w, 20), '#fff3a0', .45); ctx.globalCompositeOperation = 'source-over';
    ctx.lineJoin = ctx.lineCap = 'round'; for (const [lw, col] of [[5.4, PAL.ink], [3.2, '#ffe27a'], [1.2, '#ffffff']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); for (const p of pts) ctx.lineTo(p[0], p[1]); ctx.stroke(); }
    sparks(ctx, cx, y + h - 2, 8, t, 3, '#fff3a0');
  },
  steam(ctx, H, t, tell) {
    const { x, y, w, h } = H, cx = x + w / 2, up = h >= w;
    if (tell) { const k = clamp01(1 - H.tell / 50); if (up) warnColumn(ctx, x, y, w, h, k, t, -1); else { warnBox(ctx, x, y, w, h, k, t); marchArrows(ctx, x + 8, y + h / 2, x + w - 8, y + h / 2, Math.min(8, h * .3), k, t); } puffs(ctx, up ? cx : x, up ? y + h : y + h / 2, 3, t * 2, 1, 3, 8 + k * 8, .55, 20); return; }
    const c = sootPuffImg(1), n = LOW ? 6 : 10;
    ctx.globalAlpha = GA * (.35); ctx.fillStyle = '#ffffff'; ctx.beginPath(); rrect(ctx, x + w * .15, y, w * .7, h, w * .35); ctx.fill(); ctx.globalAlpha = GA;
    for (let i = 0; i < n; i++) { const p = ((t * 2.2 + i * 100 / n) % 100) / 100, s = .8 + p * (w / 14);
      if (up) putA(ctx, c, cx + Math.sin(p * 9 + i) * w * .2, y + h - p * h, Math.min(1, (1 - p) * 3), s * (i & 1 ? -1 : 1), s);
      else putA(ctx, c, x + p * w, y + h / 2 + Math.sin(p * 9 + i) * h * .2, Math.min(1, (1 - p) * 3), s, s); }
  },
  slam(ctx, H, t, tell) {
    const { x, y, w, h } = H, by = y + h, cx = x + w / 2;
    if (tell) { const k = clamp01(1 - H.tell / 50); glow(ctx, cx, by - 2, w * .55, '#ffb36a', .3 + k * .4); ctx.globalAlpha = GA * (.25 + k * .45); ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.ellipse(cx, by - 1, w * (.3 + k * .25), 2.6 + k * 1.6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = GA; warnColumn(ctx, x, y, w, h, k, t, 1); cracks(ctx, x + w * .15, by, w * .7, k, t); return; }
    const k = ease(num(H.t, 9) / 5), wh = Math.min(30, h * .35), wy = y + (h - wh) * k, img = bake('slam' + Math.round(w), w, 34, w / 2, 0, g => drawWeight(g, w, wh));
    ctx.strokeStyle = PAL.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx, y - 4); ctx.lineTo(cx, wy); ctx.stroke(); ctx.strokeStyle = M.IRON[0]; ctx.lineWidth = 1.4; ctx.stroke();
    put(ctx, img, cx, wy);
    if (k > .95) { puffs(ctx, cx - w * .4, by - 2, 2, t, 0, 4, 8, .7, 16); puffs(ctx, cx + w * .4, by - 2, 2, t + 8, 0, 4, 8, .7, 16); if (num(H.t, 9) < 14) for (let i = 0; i < 4; i++) twinkle(ctx, cx + (i - 1.5) * w * .32, by - 4 - (i & 1) * 4, 3, t * .2, '#fff3c0'); }
  },
  rain(ctx, H, t, tell) {
    const { x, y, w, h } = H, n = Math.max(3, Math.round(w / 9));
    if (tell) { const k = clamp01(1 - H.tell / 50); warnColumn(ctx, x, y, w, h, k, t, 1); ctx.fillStyle = 'rgba(120,150,210,.9)'; for (let i = 0; i < Math.ceil(n * k); i++) { const p = ((t + i * 13) % 30) / 30; ctx.beginPath(); ctx.ellipse(x + (i + .5) * w / n, y + 4 + p * 6, 1.4, 2.1, 0, 0, TAU); ctx.fill(); } return; }
    ctx.strokeStyle = 'rgba(150,160,190,.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const p = ((t * 2.6 + i * 37) % 100) / 100, rx = x + ((i * 53) % w); ctx.moveTo(rx, y + p * h); ctx.lineTo(rx - 1.2, y + p * h + 7); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,200,225,.7)'; for (let i = 0; i < n; i++) { const p = ((t + i * 7) % 12) / 12; ctx.beginPath(); ctx.ellipse(x + (i + .5) * w / n, y + h - 1, 1 + p * 3, .8, 0, 0, TAU); ctx.fill(); }
  },
  vine(ctx, H, t, tell) {
    const { x, y, w, h } = H, cy = y + h / 2;
    if (tell) { // the whole lane the vine will sweep along, with arrows marching the way it comes (render.js adds an arrow at the screen edge)
      const k = clamp01(1 - H.tell / 50), d = H.vx < 0 ? -1 : 1, run = Math.abs(H.vx || 0) * (H.dur || 0) || 640, x0 = d > 0 ? x : x - run, x1 = d > 0 ? x + w + run : x + w;
      warnBox(ctx, x0, y, x1 - x0, h, k, t, h / 2); marchArrows(ctx, d > 0 ? x0 + 10 : x1 - 10, cy, d > 0 ? x1 - 10 : x0 + 10, cy, Math.min(9, h * .34), k, t, Math.max(3, Math.round((x1 - x0) / 70)));
      glow(ctx, d > 0 ? x + w : x, cy, 12 + k * 10, '#ffb36a', .45 + k * .4); return; }
    const pts = [], n = Math.max(6, Math.round(w / 10)); for (let i = 0; i <= n; i++) pts.push([x + w * i / n, cy + Math.sin(i * .9 + t * .25) * h * .3]);
    ctx.lineCap = ctx.lineJoin = 'round'; for (const [lw, col] of [[Math.min(h, 9) + 2.4, PAL.ink], [Math.min(h, 9), '#8f8088'], [1.2, '#c4b6be']]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); for (const p of pts) ctx.lineTo(p[0], p[1] - (lw < 2 ? 1.5 : 0)); ctx.stroke(); }
    ctx.fillStyle = M.BONE[0]; ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) { const [px, py] = pts[i], s = i & 1 ? -1 : 1, e = Math.min(h, 9) / 2; ctx.beginPath(); ctx.moveTo(px - 2, py + s * e * .6); ctx.lineTo(px + 1, py + s * (e + 4.5)); ctx.lineTo(px + 2.4, py + s * e * .6); ctx.closePath(); ctx.stroke(); ctx.fill(); }
  },
  shock(ctx, H, t, tell) {
    const { x, y, w, h } = H, by = y + h;
    if (tell) { const k = clamp01(1 - H.tell / 50); glow(ctx, x + w / 2, by, w * .5, '#c4a8ff', .2 + k * .4); cracks(ctx, x, by, w, k, t, '#5a3a8a'); return; }
    const n = Math.max(2, Math.round(w / 16)), p = (num(H.t, 0) * .06) % 1, top = s => by - Math.pow(Math.max(0, Math.sin((s * n - p * 2) * PI)), 2) * Math.min(h, 16);
    glow(ctx, x + w / 2, by - 2, w * .45, '#c4a8ff', .35);
    ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(x, by + 1); for (let i = 0; i <= 40; i++) ctx.lineTo(x + w * i / 40, top(i / 40)); ctx.lineTo(x + w, by + 1); ctx.closePath();
    ctx.fillStyle = '#7a5e50'; ctx.fill(); ctx.strokeStyle = PAL.ink; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.strokeStyle = '#d8c4ff'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= 40; i++) ctx.lineTo(x + w * i / 40, top(i / 40) + 1.4); ctx.stroke();
    if (!LOW) for (let i = 0; i < n; i++) { const s = (i + .5 + p * 2) / n % 1; puffs(ctx, x + s * w, by - 3, 1, t + i * 9, 0, 3, 8, .5, 14); }
  }
};
function drawWeight(g, w, h) {
  outlined(g, [Pt(M.IRON, RR(-w / 2 + 2, 4, w - 4, h - 4, 4), h * .6, -w / 4, h / 2), Pt(M.IRON, RR(-5, 0, 10, 6, 2), 3)], 2);
  if (FLASH) return;
  g.fillStyle = 'rgba(60,50,80,.35)'; g.fillRect(-w / 2 + 4, h - 6, w - 8, 2.4);
  rivets(g, [[-w / 2 + 6, 8], [w / 2 - 6, 8], [-w / 2 + 6, h - 4], [w / 2 - 6, h - 4]], .9);
}
function hazard(ctx, H, t) {
  if (!H) return; t = num(t, 0) | 0; const fn = HZ[H.kind]; if (!fn) { dashedRect(ctx, num(H.x, 0), num(H.y, 0), Math.max(2, num(H.w, 20)), Math.max(2, num(H.h, 20)), 'rgba(255,230,190,.6)', t); return; }
  const h = { x: num(H.x, 0), y: num(H.y, 0), w: Math.max(2, num(H.w, 20)), h: Math.max(2, num(H.h, 20)), t: num(H.t, 0), tell: num(H.tell, 0), vx: num(H.vx, 0), dur: num(H.dur, 0) };
  try { fn(ctx, h, t, h.tell > 0 && !H.live); } catch (e) { err(e); }
}

/* =====================================================================================================================
   SHOTS, DEW DROPS, ITEMS
   ===================================================================================================================== */
const SHOTI = {
  spore: g => { outlined(g, [Pt(['#c4ccb0', '#7e8a6a', '#eef2e2'], C(0, 0, 3.6), 3.6, 0, 0)], 1.1); if (!FLASH) { g.strokeStyle = 'rgba(80,90,60,.6)'; g.lineWidth = .5; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.moveTo(Math.cos(a) * 3.8, Math.sin(a) * 3.8); g.lineTo(Math.cos(a) * 5.6, Math.sin(a) * 5.6); } g.stroke(); } },
  burr: g => { const sp = []; for (let i = 0; i < 8; i++) { const a = i * TAU / 8, c = Math.cos(a), s = Math.sin(a); sp.push(Pt(M.BONE, POLY([c * 6.4, s * 6.4, c * 3 - s * 1.6, s * 3 + c * 1.6, c * 3 + s * 1.6, s * 3 - c * 1.6]), 1.5)); } outlined(g, sp, .9); outlined(g, [Pt(M.BRAM, C(0, 0, 3.8), 3.8, 0, 0)], 1.1); scribble(g, 0, 0, 2.4, 0, .7); },
  bolt: g => { outlined(g, [Pt(['#ffb36a', '#e0602a', '#fff0c0'], C(0, 0, 3.6), 3.6, 0, 0)], 1.1); if (!FLASH) { g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(-.6, -.6, 1.5, 0, TAU); g.fill(); } },
  drop: g => outlined(g, [Pt(M.GOO, g2 => { g2.moveTo(0, -5); g2.bezierCurveTo(1.6, -2.4, 3.6, -.4, 3.6, 1.6); g2.bezierCurveTo(3.6, 4, 1.8, 5, 0, 5); g2.bezierCurveTo(-1.8, 5, -3.6, 4, -3.6, 1.6); g2.bezierCurveTo(-3.6, -.4, -1.6, -2.4, 0, -5); g2.closePath(); }, 3.6, 0, 1.6)], 1),
  orb: g => { outlined(g, [Pt(M.SOOT, C(0, 0, 6), 6, 0, 0)], 1.4); scribble(g, 0, 0, 4.4, 0, 1.2, 'rgba(20,14,34,.8)'); if (!FLASH) { g.fillStyle = 'rgba(200,180,255,.45)'; g.beginPath(); g.ellipse(-2.2, -2.4, 2, 1, -.6, 0, TAU); g.fill(); } },
  petal: g => outlined(g, [Pt(M.ROSE, g2 => { g2.moveTo(0, -4.6); g2.bezierCurveTo(3.6, -2, 3, 4.4, 0, 4.4); g2.bezierCurveTo(-3, 4.4, -3.6, -2, 0, -4.6); g2.closePath(); }, 3.6, 0, 0)], 1)
};
function shot(ctx, S, t) {
  if (!S) return; t = num(t, 0) | 0; const x = num(S.x, 0), y = num(S.y, 0), vx = num(S.vx, 0), vy = num(S.vy, 0), r = num(S.r, 4), k = S.kind;
  try {
    if (k === 'beam') { beam(ctx, x, y, vx, vy, r, t, S); return; }
    const draw = SHOTI[k]; if (!draw) { fallback(ctx, x, y, r); return; }
    const img = bake('shot' + k, 16, 16, 8, 8, draw), sc = k === 'orb' ? r / 6 : k === 'spore' || k === 'bolt' ? r / 3.6 : 1;
    if (k === 'spore') { const s2 = sc * 1.25; glow(ctx, x, y, 11 * s2, '#d8e0a0', .4); putT(ctx, img, x, y, s2, s2, t * .05); return; }
    if (k === 'bolt') { const a = Math.atan2(vy, vx); ctx.strokeStyle = 'rgba(255,150,70,.55)'; ctx.lineWidth = 3 * sc; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(a) * 9, y - Math.sin(a) * 9); ctx.stroke(); glow(ctx, x, y, 11 * sc, '#ff9a4a', .6); putT(ctx, img, x, y, sc, sc); return; }
    if (k === 'orb') { glow(ctx, x, y, 12 * sc, '#8a6ab8', .45); putT(ctx, img, x, y, sc, sc, t * .08); return; }
    if (k === 'drop') { putT(ctx, img, x, y, 1, 1 + Math.min(.4, Math.abs(vy) * .05), vx ? -Math.atan2(vx, vy) * .5 : 0); return; }
    if (k === 'burr') { const s2 = Math.max(1, r / 4); putT(ctx, img, x, y, s2, s2, t * .2 * (vx < 0 ? -1 : 1)); return; }
    putT(ctx, img, x, y, 1.25, 1.25, t * .15 + num(S.life, 0));
  } catch (e) { err(e); }
}
function beam(ctx, x, y, vx, vy, r, t, S) { // the player's Sunbeam: a warm golden ray, long, trailing back from its head
  const a = Math.atan2(vy, vx || (S.face || 1)), L = Math.min(70, 26 + num(S.t, 30) * 6), w = Math.max(3, r);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.globalCompositeOperation = 'lighter';
  const gr = ctx.createLinearGradient(-L, 0, 0, 0); gr.addColorStop(0, 'rgba(255,200,80,0)'); gr.addColorStop(.6, 'rgba(255,214,90,.45)'); gr.addColorStop(1, 'rgba(255,236,150,.8)');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-L, -w * .4); ctx.lineTo(0, -w * 1.5); ctx.arc(0, 0, w * 1.5, -PI / 2, PI / 2); ctx.lineTo(-L, w * .4); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const g2 = ctx.createLinearGradient(-L * .8, 0, 0, 0); g2.addColorStop(0, 'rgba(255,255,240,0)'); g2.addColorStop(1, '#ffffff');
  ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(-L * .8, -w * .18); ctx.lineTo(0, -w * .6); ctx.arc(0, 0, w * .6, -PI / 2, PI / 2); ctx.lineTo(-L * .8, w * .18); ctx.closePath(); ctx.fill();
  ctx.restore();
  glow(ctx, x, y, w * 4, '#ffe27a', .7);
  if (!LOW) for (let i = 0; i < 3; i++) { const p = ((t * 2 + i * 13) % 26) / 26, d = p * L * .9; twinkle(ctx, x - Math.cos(a) * d + Math.sin(i * 3) * 3, y - Math.sin(a) * d + Math.cos(i * 3) * 3, 2.4 * (1 - p) + .5, t * .2, '#fff8d0'); }
}
const DROPP = s => g => { g.moveTo(0, -6 * s); g.bezierCurveTo(1.8 * s, -3 * s, 4.4 * s, -.6 * s, 4.4 * s, 1.8 * s); g.bezierCurveTo(4.4 * s, 4.6 * s, 2.2 * s, 6 * s, 0, 6 * s); g.bezierCurveTo(-2.2 * s, 6 * s, -4.4 * s, 4.6 * s, -4.4 * s, 1.8 * s); g.bezierCurveTo(-4.4 * s, -.6 * s, -1.8 * s, -3 * s, 0, -6 * s); g.closePath(); };
function drawDew(g, s) {
  outlined(g, [Pt(M.DEW, DROPP(s), 4.4 * s, 0, 2 * s)], s > 1 ? 1.3 : 1);
  if (FLASH) return;
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-1.6 * s, .4 * s, .9 * s, 1.8 * s, .3, 0, TAU); g.fill(); g.beginPath(); g.arc(1.6 * s, 3.4 * s, .5 * s, 0, TAU); g.fill();
}
function drop(ctx, D, t) {
  if (!D) return; t = num(t, 0) | 0; const v = num(D.v, 1), k = v >= 25 ? 3 : v >= 10 ? 2 : v >= 5 ? 1 : 0, s = [.72, .95, 1.15, 1.35][k];
  const img = bake('dew' + k, 12 * s, 14 * s, 6 * s, 7 * s, g => drawDew(g, s)), x = num(D.x, 0), y = num(D.y, 0), ph = (t + num(D.t, 0) * 7 + x) | 0;
  if (k >= 2) glow(ctx, x, y, 9 * s, '#9fe6ff', .35);
  put(ctx, img, x, y);
  if ((ph % 90) < 8) twinkle(ctx, x + 2 * s, y - 2 * s, 2 + (ph % 90) * .2, 0, '#ffffff');
}
// items: life seed, sun vessel, notch, charm, ability shrine seed, dew cluster, the puddle you left
function drawLifeSeed(g, s) {
  inkLine(g, g2 => { g2.moveTo(0, -5.2 * s); g2.quadraticCurveTo(-.6 * s, -7.4 * s, .6 * s, -9 * s); }, .9 * s, '#6fcf5a');
  outlined(g, [Pt(M.LEAF, LF(.6 * s, -9 * s, -.5, 4 * s, 1.5 * s), 2 * s)], .8 * s);
  outlined(g, [Pt(['#ff8fa8', '#d9506e', '#ffe0e8'], HEARTP(0, 0, 1.75 * s), 6 * s, -2.6 * s, -1.4 * s)], 1.2 * s);
  if (FLASH) return;
  g.strokeStyle = 'rgba(190,60,90,.45)'; g.lineWidth = .7 * s; g.beginPath(); g.moveTo(0, -2.6 * s); g.quadraticCurveTo(1 * s, 1 * s, 0, 4.6 * s); g.stroke();
}
function drawVessel(g, s, fill) {
  const jar = g2 => { rrect(g2, -5 * s, -4.4 * s, 10 * s, 11 * s, 3.6 * s); };
  outlined(g, [Pt(M.WOOD, RR(-3.4 * s, -7.6 * s, 6.8 * s, 3.6 * s, 1.2 * s), 2 * s, -1 * s, -6 * s), Pt(['#e8f4ff', '#a8c0e0', '#ffffff'], jar, 6 * s)], 1.2 * s);
  if (FLASH) return;
  g.save(); g.beginPath(); jar(g); g.clip();
  const top = 6.6 * s - 10.4 * s * (fill == null ? .78 : fill);
  g.fillStyle = '#ffd93b'; g.fillRect(-6 * s, top, 12 * s, 14 * s); g.fillStyle = '#f5a623'; g.fillRect(-6 * s, 4 * s, 12 * s, 4 * s); g.fillStyle = '#fff6b0'; g.fillRect(-6 * s, top, 12 * s, 1.1 * s);
  g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(-3.6 * s, -3 * s, 1.4 * s, 7 * s);
  g.restore();
  g.strokeStyle = PAL.ink; g.lineWidth = .9 * s; g.beginPath(); jar(g); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); STAR(1.4 * s, 1.6 * s, 2 * s, .6 * s, 4, 0)(g); g.fill();
}
function drawNotch(g, s, full) {
  outlined(g, [Pt(M.WOOD, C(0, 0, 5.4 * s), 5.4 * s, 0, 0)], 1.2 * s);
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(0, 0, 2.8 * s, 0, TAU); g.fill();
  if (full && !FLASH) outlined(g, [Pt(M.GOLD, SEED(0, .3 * s, 2.3 * s, 2.7 * s), 2.4 * s, 0, 0)], .5 * s);
  if (!FLASH) { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = .7 * s; g.beginPath(); g.arc(0, 0, 4.3 * s, PI * 1.1, PI * 1.6); g.stroke(); }
}
const CHARM_COL = { long: ['#8fe07a', '#3f9a3a', '#e6ffd6'], sip: ['#ffd95a', '#e8941c', '#fff4c4'], bark: ['#c99a72', '#7a5236', '#f0d8c0'], breeze: ['#9fe6e0', '#3fa8a0', '#e6fbf8'],
  magnet: ['#8fd0ff', '#3f7fd8', '#e4f4ff'], compass: ['#ffb38a', '#e06a3a', '#ffe8da'], swift: ['#c8b2ff', '#8a5ae0', '#f1eaff'], gentle: ['#ffc4d6', '#e07a9a', '#fff0f4'],
  coat: ['#ff9a9a', '#c84a5a', '#ffe0e0'], bouncy: ['#b8ec8a', '#5aa83a', '#effde0'], pouch: ['#e8c890', '#a87a40', '#fbf0d8'], sunny: ['#ffe27a', '#f0a020', '#fffbe0'] };
// a seed charm badge: a round seed with a coloured rim and a picture
function drawCharm(g, id, s) {
  const m = CHARM_COL[id] || M.STONE;
  outlined(g, [Pt(m, SEED(0, .4 * s, 8.2 * s, 9.4 * s), 8 * s, 0, 0)], 1.3 * s);
  if (FLASH) return;
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(0, 1.6 * s, 5.6 * s, 0, TAU); g.fill();
  g.strokeStyle = m[1]; g.lineWidth = .7 * s; g.stroke();
  charmPic(g, id, 0, 1.6 * s, s);
}
function charmPic(g, id, x, y, s) {
  const S = s * .85, lw = .7 * s;
  g.save(); g.translate(x, y); g.scale(S, S); g.lineCap = g.lineJoin = 'round';
  const ink = (w, col, path) => inkLine(g, path, w, col);
  switch (id) {
    case 'long': ink(.9, '#6fcf5a', g2 => { g2.moveTo(-3.6, 3.6); g2.lineTo(2.4, -2.4); }); seedPuff(g, 2.8, -2.8, 2.2); break;
    case 'sip': outlined(g, [Pt(M.SUN, C(0, .6, 2.8), 2.8, 0, .6)], .7); ink(.6, '#ff8a9a', g2 => { g2.moveTo(1.4, -.6); g2.lineTo(3, -4); g2.lineTo(4.2, -4); }); break;
    case 'bark': outlined(g, [Pt(M.BARK, LF(-3.6, 3, -.8, 8, 2.8), 3, 0, 0)], .7); g.strokeStyle = M.BARK[1]; g.lineWidth = .5; g.beginPath(); g.moveTo(-2, 1); g.lineTo(1.6, -2.2); g.stroke(); break;
    case 'breeze': g.strokeStyle = PAL.ink; g.lineWidth = 1; g.beginPath(); g.moveTo(-4, -1); g.quadraticCurveTo(1, -1, 2, -3); g.moveTo(-4, 1.6); g.quadraticCurveTo(3, 1.6, 3.6, -.4); g.stroke(); outlined(g, [Pt(M.LEAF, LF(-1, 3.6, -.3, 4, 1.4), 2)], .6); break;
    case 'magnet': outlined(g, [Pt(M.DEW, DROPP(.62), 3, 0, 1)], .6); g.strokeStyle = M.DEW[1]; g.lineWidth = .6; g.beginPath(); g.arc(0, .8, 4.4, -2.4, -.7); g.stroke(); g.beginPath(); g.arc(0, .8, 4.4, PI - .7 + PI, PI + .7 + PI); g.stroke(); break;
    case 'compass': for (let i = 0; i < 4; i++) { const a = i * PI / 2; outlined(g, [Pt(i ? M.CREAM : M.RED, LF(0, 0, a - PI / 2, 4.2, 1.2), 2)], .5); } outlined(g, [Pt(M.GOLD, C(0, 0, 1.2), 1.2)], .4); break;
    case 'swift': ink(.8, '#6fcf5a', g2 => { g2.moveTo(-1, 3.8); g2.lineTo(2.2, -2); }); seedPuff(g, 2.6, -2.6, 1.8); g.strokeStyle = PAL.ink; g.lineWidth = .6; g.beginPath(); for (const k of [0, 1, 2]) { g.moveTo(-4.4, -1.6 + k * 1.8); g.lineTo(-2.2, -1.6 + k * 1.8); } g.stroke(); break;
    case 'gentle': outlined(g, [Pt(M.LEAF, LF(-4, 3.4, -.7, 7, 2.4), 3)], .7); outlined(g, [Pt(['#ff8fa8', '#d9506e', '#ffe0e8'], HEARTP(2.4, -1.6, .5), 1.6)], .5); break;
    case 'coat': { const sp = []; for (let i = 0; i < 6; i++) { const a = i * TAU / 6, c = Math.cos(a), sn = Math.sin(a); sp.push(Pt(M.BONE, POLY([c * 4.6, sn * 4.6, c * 2.6 - sn, sn * 2.6 + c, c * 2.6 + sn, sn * 2.6 - c]), 1)); } outlined(g, sp, .5); rose(g, 0, 0, .75); break; }
    case 'bouncy': g.strokeStyle = PAL.ink; g.lineWidth = .8; g.beginPath(); g.moveTo(-2.6, 4); g.lineTo(2.6, 3); g.lineTo(-2.6, 2); g.lineTo(2.6, 1); g.stroke(); outlined(g, [Pt(M.LEAF, SEED(0, -1.8, 2.4, 2.8), 2.4, 0, -2)], .6); break;
    case 'pouch': outlined(g, [Pt(M.STRAW, g2 => { g2.moveTo(-2.6, -2.4); g2.quadraticCurveTo(-5, 4.4, 0, 4.4); g2.quadraticCurveTo(5, 4.4, 2.6, -2.4); g2.closePath(); }, 3, 0, 1)], .7); g.strokeStyle = PAL.ink; g.lineWidth = .6; g.beginPath(); g.moveTo(-2.6, -2.2); g.lineTo(2.6, -2.2); g.moveTo(0, -2.4); g.lineTo(-1.4, -4.4); g.moveTo(0, -2.4); g.lineTo(1.6, -4.2); g.stroke(); break;
    case 'sunny': { const r = []; for (let i = 0; i < 8; i++) { const a = i * TAU / 8, c = Math.cos(a), sn = Math.sin(a); r.push(Pt(M.SUN, POLY([c * 5, sn * 5, c * 3 - sn * .9, sn * 3 + c * .9, c * 3 + sn * .9, sn * 3 - c * .9]), 1)); } outlined(g, r, .5); outlined(g, [Pt(['#ff8fa8', '#d9506e', '#ffe0e8'], HEARTP(0, .2, .62), 2, -1, -1)], .5); break; }
    default: g.fillStyle = PAL.ink; g.beginPath(); g.arc(0, 0, 1.6, 0, TAU); g.fill();
  }
  g.restore();
}
const ABIL = { dash: ['#8fe07a', '#3f9a3a', '#e6ffd6'], grip: ['#7fe0c8', '#2f9a88', '#dcfbf2'], puff: ['#e8f0ff', '#9aa8d8', '#ffffff'], glow: ['#fff1a8', '#e8b83a', '#fffbe0'], beam: ['#ffd95a', '#f0a020', '#fff6c8'] };
function abilityPic(g, id, s) {
  g.save(); g.scale(s, s);
  switch (id) {
    case 'dash': outlined(g, [Pt(M.LEAF, LF(-3.4, 2, -.45, 8, 2.6), 3)], .7); g.strokeStyle = PAL.ink; g.lineWidth = .7; g.beginPath(); for (const k of [0, 1]) { g.moveTo(-5.6, -1.8 + k * 2.4); g.lineTo(-3.6, -1.8 + k * 2.4); } g.stroke(); break;
    case 'grip': inkLine(g, g2 => { g2.moveTo(-3, 4); g2.bezierCurveTo(-3, -1, 3, -1, 2.4, -3); g2.bezierCurveTo(2, -4.6, .2, -4.4, .4, -3); }, .9, '#4fcf9a'); outlined(g, [Pt(M.LEAF, LF(-1.6, 1.4, -2.6, 3, 1.1), 1.6)], .5); break;
    case 'puff': outlined(g, [Pt(M.CLOUD, C(-2, 1.6, 2.4), 2.4), Pt(M.CLOUD, C(1, .4, 3), 3, 1, .4), Pt(M.CLOUD, C(3.2, 2, 2), 2)], .7); g.strokeStyle = PAL.ink; g.lineWidth = .8; g.beginPath(); g.moveTo(.4, -3); g.lineTo(.4, -5.6); g.moveTo(-.8, -4.4); g.lineTo(.4, -5.8); g.lineTo(1.6, -4.4); g.stroke(); break;
    case 'glow': { g.strokeStyle = PAL.ink; g.lineWidth = .7; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * TAU / 8; g.moveTo(Math.cos(a) * 4.2, Math.sin(a) * 4.2); g.lineTo(Math.cos(a) * 5.9, Math.sin(a) * 5.9); } g.stroke();
      outlined(g, [Pt(['#fff6c0', '#f0c040', '#ffffff'], SEED(0, .4, 3, 3.6), 3, 0, 0)], .7); outlined(g, [Pt(M.LEAF, LF(0, -3.2, -2.3, 2.6, 1), 1.5), Pt(M.LEAF, LF(0, -3.2, -.8, 2.6, 1), 1.5)], .5); break; }
    case 'beam': { g.fillStyle = '#fff6c0'; g.strokeStyle = PAL.ink; g.lineWidth = .7; g.beginPath(); g.moveTo(-1.6, -1.6); g.lineTo(6, -3.6); g.lineTo(6, 1.8); g.lineTo(-1.6, 1.6); g.closePath(); g.stroke(); g.fill();
      const r = []; for (let i = 0; i < 8; i++) { const a = i * TAU / 8, c = Math.cos(a), sn = Math.sin(a); r.push(Pt(M.SUN, POLY([-3 + c * 3.8, sn * 3.8, -3 + c * 2.2 - sn * .7, sn * 2.2 + c * .7, -3 + c * 2.2 + sn * .7, sn * 2.2 - c * .7]), 1)); }
      outlined(g, r, .45); outlined(g, [Pt(M.SUN, C(-3, 0, 2.2), 2.2, -3, 0)], .5); break; }
    default: g.fillStyle = PAL.ink; g.beginPath(); g.arc(0, 0, 1.6, 0, TAU); g.fill();
  }
  g.restore();
}
function drawAbilitySeed(g, id) { // the glowing shrine seed
  const m = ABIL[id] || M.STONE;
  outlined(g, [Pt(m, SEED(0, 0, 8.6, 11), 9, -2, -3)], 1.5);
  if (FLASH) return;
  g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(0, 1.6, 5.6, 5.6, 0, 0, TAU); g.fill();
  abilityPic(g, id, .95);
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-4, -5, 1.4, 2.6, .4, 0, TAU); g.fill();
}
function drawPedestal(g) { outlined(g, [Pt(M.BARK, RR(-9, 0, 18, 6, 3), 4, -3, 2), Pt(M.MOSS, E(0, .4, 9.4, 2.4), 3)], 1.4); if (!FLASH) { g.strokeStyle = M.BARK[1]; g.lineWidth = .7; g.beginPath(); g.moveTo(-5, 3); g.lineTo(-5, 6); g.moveTo(2, 3.4); g.lineTo(2, 6); g.stroke(); } }
function drawCluster(g, hp) {
  const cr = [[-6, 0, 4, 12, -.25], [0, 0, 5, 17, 0], [6.4, 0, 4, 11, .3], [-2.6, 0, 3, 8, -.6], [3.4, 0, 3, 7, .55]], parts = [];
  for (const [x, y, w, h, r] of cr) { const c = Math.cos(r), s = Math.sin(r), p = (u, v) => [x + u * c - v * s, y + u * s + v * c], a = p(-w / 2, 0), b = p(w / 2, 0), tp = p(0, -h), m1 = p(-w / 2, -h * .75), m2 = p(w / 2, -h * .75);
    parts.push(Pt(M.CRYS, POLY([a[0], a[1], m1[0], m1[1], tp[0], tp[1], m2[0], m2[1], b[0], b[1]]), w, x - 1, y - h * .6)); }
  outlined(g, [Pt(M.STONE, E(0, 0, 10.5, 3), 3)], 1.2);
  outlined(g, parts, 1.3);
  if (FLASH) return;
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = .7; g.beginPath(); g.moveTo(-.8, -2); g.lineTo(-.8, -13); g.moveTo(-6.6, -2); g.lineTo(-7.6, -9); g.stroke();
  const n = hp >= 3 ? 0 : hp === 2 ? 2 : 4; g.strokeStyle = PAL.ink; g.lineWidth = .8; g.beginPath();
  const C2 = [[0, -14, 2, -9, -1, -6], [-6, -9, -4.6, -5, -6.4, -3], [6, -8, 4.6, -4.6, 6.6, -2.4], [1.4, -6, 3.6, -3, 1.6, -1.6]];
  for (let i = 0; i < n; i++) { const c = C2[i]; g.moveTo(c[0], c[1]); g.lineTo(c[2], c[3]); g.lineTo(c[4], c[5]); } g.stroke();
}
function drawPuddle(g) {
  outlined(g, [Pt(M.DEW, E(0, 0, 11, 3.2), 4, -3, -1), Pt(M.DEW, E(7, .8, 4.6, 2), 2.4)], 1.1);
  if (FLASH) return;
  g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(-4, -.8, 4, .9, 0, 0, TAU); g.fill();
}
function item(ctx, I, t) {
  if (!I || I.got) return; t = num(t, 0) | 0;
  const x = num(I.x, 0), y = num(I.y, 0), bob = Math.sin(t * .06 + x * .1) * 1.6;
  try {
    switch (I.kind) {
      case 'life': glow(ctx, x, y + bob, 16, '#ff9ab0', .4 + .1 * Math.sin(t * .1)); put(ctx, bake('ilife', 16, 22, 8, 12, g => drawLifeSeed(g, 1.5)), x, y + bob); sparkleRing(ctx, x, y + bob, 12, t); break;
      case 'vessel': glow(ctx, x, y + bob, 16, '#ffe27a', .45 + .1 * Math.sin(t * .1)); put(ctx, bake('ivessel', 16, 20, 8, 10, g => drawVessel(g, 1.3)), x, y + bob); sparkleRing(ctx, x, y + bob, 12, t); break;
      case 'notch': glow(ctx, x, y + bob, 12, '#ffe27a', .3); put(ctx, bake('inotch', 16, 16, 8, 8, g => drawNotch(g, 1.3, 0)), x, y + bob); sparkleRing(ctx, x, y + bob, 10, t); break;
      case 'charm': glow(ctx, x, y + bob, 15, '#fff1a8', .4); put(ctx, bake('icharm' + I.id, 20, 22, 10, 11, g => drawCharm(g, I.id, 1.05)), x, y + bob); sparkleRing(ctx, x, y + bob, 12, t); break;
      case 'ability': { const fy = floorY(y), sy = fy - 16 + Math.sin(t * .05) * 2.4, m = ABIL[I.id] || M.STONE;
        glow(ctx, x, sy, 30, m[0], .5 + .15 * Math.sin(t * .08)); put(ctx, bake('iped', 20, 8, 10, 0, drawPedestal), x, fy - 6);
        ctx.save(); ctx.translate(x, sy); ctx.rotate(t * .01); ctx.globalAlpha = GA * (.35); for (let i = 0; i < 8; i++) { ctx.fillStyle = i & 1 ? '#ffffff' : m[0]; ctx.beginPath(); const a = i * TAU / 8; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - .12) * 22, Math.sin(a - .12) * 22); ctx.lineTo(Math.cos(a + .12) * 22, Math.sin(a + .12) * 22); ctx.closePath(); ctx.fill(); } ctx.restore(); ctx.globalAlpha = GA;
        put(ctx, bake('iabil' + I.id, 22, 26, 11, 13, g => drawAbilitySeed(g, I.id)), x, sy); sparkleRing(ctx, x, sy, 16, t); break; }
      case 'cluster': { const fy = floorY(y), hp = Math.max(0, Math.min(3, num(I.hp, 3) | 0)), hurt = I.hurt > 0; glow(ctx, x, fy - 8, 16, '#9fe6ff', .35);
        const img = bake('iclus' + hp, 26, 22, 13, 19, g => drawCluster(g, hp)); if (hurt) putT(ctx, img, x + Math.sin(t * 2) * 1, fy, 1, 1); else put(ctx, img, x, fy);
        if ((t % 70) < 10) twinkle(ctx, x - 2, fy - 13, 1.6 + (t % 70) * .25, 0, '#fff'); break; }
      case 'puddle': { glow(ctx, x, y - 2, 14, '#9fe6ff', .35); put(ctx, bake('ipud', 26, 8, 13, 4, drawPuddle), x, y - 2); const p = (t % 60) / 60; twinkle(ctx, x + 3, y - 6 - p * 3, 2.6 * Math.sin(p * PI) + .4, t * .05, '#fff'); break; }
      default: fallback(ctx, x, y + bob, 5);
    }
  } catch (e) { err(e); }
}
function sparkleRing(ctx, x, y, r, t) {
  if (LOW) return;
  for (let i = 0; i < 3; i++) { const a = t * .03 + i * TAU / 3, p = Math.sin(t * .1 + i * 2); twinkle(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * .7, 1.2 + Math.max(0, p) * 1.4, 0, i ? '#fff6c0' : '#ffffff'); }
}

/* =====================================================================================================================
   FLOWERS (no faces): 0 bluebell, 1 wild rose, 2 water lily, 3 sunflower, 4 tulip, 5 hollyhock, 6 daisy. Baked per kind, base
   at the root point; grow in over ~30 ticks, then sway. Ceiling flowers hang (flipped).
   ===================================================================================================================== */
const FLM = { blue: ['#8aa6ff', '#4a5fc9', '#e2eaff'], rose: M.ROSE, lily: ['#fff0f6', '#f0a6c4', '#ffffff'], sun: M.SUN, seedC: ['#a8683a', '#6a3a20', '#d89a6a'],
  tulip: ['#ff7a6a', '#c93d4a', '#ffd6cc'], holly: ['#eaa8ff', '#b060d8', '#faeaff'], daisy: ['#ffffff', '#d4cfee', '#ffffff'], pad: ['#6fcf7a', '#2f8f5a', '#d0f5d0'] };
function stem(g, pts, w, col) { inkLine(g, g2 => { g2.moveTo(pts[0], pts[1]); if (pts.length === 4) g2.lineTo(pts[2], pts[3]); else g2.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); }, w || 1.3, col || '#5cbf5a'); }
function flowerHead(g, x, y, s, kind, k) { // a flower head on its own (used by guardians' calm forms)
  g.save(); g.translate(x, y); g.scale(s * (k || 1), s * (k || 1));
  if (kind === 3) { const pp = []; for (let i = 0; i < 10; i++) { const a = i * TAU / 10; pp.push(Pt(FLM.sun, E(Math.cos(a) * 3.6, Math.sin(a) * 3.6, 2.6, 1.3, a), 2)); } outlined(g, pp, .7); outlined(g, [Pt(FLM.seedC, C(0, 0, 2.6), 2.6, 0, 0)], .7); }
  else if (kind === 4) outlined(g, [Pt(FLM.tulip, g2 => { g2.moveTo(-3.4, -3); g2.lineTo(-1.6, -1); g2.lineTo(0, -3.6); g2.lineTo(1.6, -1); g2.lineTo(3.4, -3); g2.quadraticCurveTo(3.8, 3.4, 0, 3.4); g2.quadraticCurveTo(-3.8, 3.4, -3.4, -3); g2.closePath(); }, 3.4, 0, 0)], .8);
  else if (kind === 1) rose(g, 0, 0, 1);
  else { const pp = []; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; pp.push(Pt(FLM.daisy, E(Math.cos(a) * 3, Math.sin(a) * 3, 2.2, 1.1, a), 1.6)); } outlined(g, pp, .6); outlined(g, [Pt(M.SUN, C(0, 0, 1.5), 1.5)], .5); }
  g.restore();
}
function drawFlower(g, k) {
  switch (k) {
    case 0: { // bluebell: an arched stem with three hanging bells
      outlined(g, [Pt(M.LEAF, LF(0, 0, -2.2, 8, 1.6), 2), Pt(M.LEAF, LF(0, 0, -1.05, 7, 1.5), 2)], 1);
      stem(g, [0, 0, 1, -16, 7, -13], 1.1);
      const bell = (x, y, s) => Pt(FLM.blue, g2 => { g2.moveTo(x - 2.2 * s, y); g2.quadraticCurveTo(x - 2.4 * s, y + 3.6 * s, x - 3 * s, y + 4.4 * s); g2.lineTo(x - 1.2 * s, y + 3.8 * s); g2.lineTo(x, y + 4.6 * s); g2.lineTo(x + 1.2 * s, y + 3.8 * s); g2.lineTo(x + 3 * s, y + 4.4 * s); g2.quadraticCurveTo(x + 2.4 * s, y + 3.6 * s, x + 2.2 * s, y); g2.quadraticCurveTo(x, y - 1.4 * s, x - 2.2 * s, y); g2.closePath(); }, 2.6 * s, x - .6, y + 1);
      outlined(g, [bell(2, -14.4, .85), bell(5.2, -13.6, .95), bell(7.4, -11.2, 1)], .9); break; }
    case 1: { // wild rose
      stem(g, [0, 0, -1, -7, .4, -12], 1.3, '#4fae4f');
      outlined(g, [Pt(M.LEAF, LF(-.4, -5, -2.5, 5.4, 2), 2.5), Pt(M.LEAF, LF(.2, -8, -.4, 5, 1.9), 2.5)], .9);
      rose(g, .4, -13.6, 1.25); break; }
    case 2: { // water lily on its pad
      outlined(g, [Pt(FLM.pad, g2 => { g2.moveTo(0, -1.2); g2.lineTo(3.6, -3.2); g2.bezierCurveTo(9, -3.4, 10, 1, 0, 1.4); g2.bezierCurveTo(-10, 1, -9, -3.4, -2, -3.2); g2.closePath(); }, 5, -3, -1.6)], 1.1);
      const pp = []; for (const [a, l] of [[-2.6, 6], [-.55, 6], [-2.05, 7], [-1.1, 7], [-1.57, 7.6]]) pp.push(Pt(FLM.lily, LF(0, -2.6, a, l, 2), 3, Math.cos(a) * 3, -2.6 + Math.sin(a) * 3));
      outlined(g, pp, .9); outlined(g, [Pt(M.SUN, E(0, -4.6, 1.6, 1.2), 1.4)], .6); break; }
    case 3: { // sunflower: tall, two big leaves, a big head (no face)
      stem(g, [0, 0, -1.4, -12, .6, -21], 1.6, '#4fae4f');
      outlined(g, [Pt(M.LEAF, LF(-.6, -8, -2.7, 7.4, 2.8), 3), Pt(M.LEAF, LF(-.2, -12, -.35, 7, 2.6), 3)], 1);
      const pp = []; for (let i = 0; i < 12; i++) { const a = i * TAU / 12; pp.push(Pt(FLM.sun, E(.6 + Math.cos(a) * 5.4, -23 + Math.sin(a) * 5.4, 3.4, 1.6, a), 2.4, .6 + Math.cos(a) * 5.4, -23 + Math.sin(a) * 5.4)); }
      outlined(g, pp, .85); outlined(g, [Pt(FLM.seedC, C(.6, -23, 3.6), 3.6, .6, -23)], .9);
      if (!FLASH) dots(g, [[-.6, -24], [1.6, -23.4], [.2, -21.6], [2, -21.8], [-1, -22.2]], .45, 'rgba(60,30,10,.5)'); break; }
    case 4: { // tulip
      outlined(g, [Pt(M.LEAF, LF(0, 0, -2.1, 10, 1.8), 2.5), Pt(M.LEAF, LF(0, 0, -1, 9, 1.7), 2.5)], .9);
      stem(g, [0, 0, .8, -8, 0, -13], 1.2);
      flowerHead(g, 0, -15.6, 1.25, 4); break; }
    case 5: { // hollyhock: a tall spike of round blossoms
      stem(g, [0, 0, -.6, -14, 0, -27], 1.4, '#4fae4f');
      outlined(g, [Pt(M.LEAF, LF(0, -3, -2.6, 6, 2.6), 3), Pt(M.LEAF, LF(0, -5, -.5, 6, 2.6), 3)], .9);
      const bl = [[-.8, -9, 3.4], [1, -14, 3.1], [-.8, -18.6, 2.7], [.6, -22.6, 2.3], [-.2, -26, 1.8]], parts = [];
      for (const [x, y, r] of bl) parts.push(Pt(FLM.holly, C(x, y, r), r, x, y));
      outlined(g, parts.slice(3), .8); outlined(g, parts.slice(0, 3), .8);
      if (!FLASH) dots(g, bl.slice(0, 4).map(([x, y]) => [x + .2, y + .2]), .7, '#fff3a0');
      outlined(g, [Pt(M.LEAF, SEED(-.2, -28.4, 1.2, 1.8), 1.4)], .6); break; }
    default: { // 6 daisy
      stem(g, [0, 0, -1, -5, .2, -9], 1.1);
      outlined(g, [Pt(M.LEAF, LF(-.4, -3, -2.6, 4.6, 1.6), 2)], .8);
      const pp = []; for (let i = 0; i < 9; i++) { const a = i * TAU / 9; pp.push(Pt(FLM.daisy, E(.2 + Math.cos(a) * 3.2, -10.4 + Math.sin(a) * 3.2, 2.4, 1.15, a), 1.8)); }
      outlined(g, pp, .7); outlined(g, [Pt(M.SUN, C(.2, -10.4, 1.7), 1.7, .2, -10.4)], .6); }
  }
}
function flowerImg(k) { return bake('fl' + k, 26, 36, 13, 33, g => drawFlower(g, k)); }
function flower(ctx, Fl, t) {
  if (!Fl) return; t = num(t, 0) | 0;
  const k = Math.max(0, Math.min(6, num(Fl.kind, 6) | 0)), ceil = !!Fl.ceil, x = num(Fl.x, 0), y = ceil ? ceilY(num(Fl.y, 0)) : floorY(num(Fl.y, 0)), age = num(Fl.t, 999), seed = num(Fl.seed, x);
  const img = flowerImg(k), sd = ceil ? -1 : 1;
  const sway = Math.sin(t * .03 + seed * 1.7) * .07;
  if (age < 32) { const p = age / 32, s = p < .7 ? ease(p / .7) * 1.15 : 1.15 - .15 * ease((p - .7) / .3); if (s <= .02) return; putT(ctx, img, x, y, (seed & 1 ? -1 : 1) * s, sd * s, sway * sd); return; }
  putT(ctx, img, x, y, seed & 1 ? -1 : 1, sd, sway * sd);
}
function drawBud(g) {
  stem(g, [0, 0, -1.2, -5, 0, -9], 1.3);
  outlined(g, [Pt(M.LEAF, LF(-.2, -2.6, -2.7, 5.4, 1.8), 2), Pt(M.LEAF, LF(0, -4.6, -.35, 5, 1.7), 2)], .9);
  outlined(g, [Pt(['#fff0f4', '#e8b0c4', '#ffffff'], SEED(0, -13.4, 3.4, 5.4), 3.4, 0, -14)], 1.1);
  outlined(g, [Pt(M.LEAF, LF(0, -8.6, -2.05, 5.4, 1.7), 2), Pt(M.LEAF, LF(0, -8.6, -1.09, 5.4, 1.7), 2)], .9);
}
function bud(ctx, B, t) {
  if (!B) return; t = num(t, 0) | 0;
  const ceil = !!B.ceil, x = num(B.x, 0), y = ceil ? ceilY(num(B.y, 0)) : floorY(num(B.y, 0)), sd = ceil ? -1 : 1;
  if (B.open) { flower(ctx, { x, y, kind: 6, ceil, t: num(B.t, 99), seed: x | 0 }, t); return; }
  const img = bake('bud', 14, 24, 7, 21, drawBud), w = Math.sin(t * .05 + x) * .06;
  glow(ctx, x, y - 14 * sd, 9, '#fff0f4', .18 + .08 * Math.sin(t * .07 + x));
  putT(ctx, img, x, y, 1 + Math.sin(t * .07 + x) * .03, sd, w * sd);
}
/* =====================================================================================================================
   PROPS: gates, levers, sun switches, Watering Spots, the Peddler, signs, moving platforms, steam vents, glowcaps
   ===================================================================================================================== */
const GSTY = { rootgate: 'root', mossy: 'moss', glowcap: 'glow', pipes: 'iron', crystal: 'crys', cloud: 'cloud', heart: 'thorn' };
const GMAT = { root: M.BARK, moss: M.BARK, glow: ['#8a7a9a', '#584a6a', '#c0b4d0'], iron: ['#7f8aa0', '#48506a', '#c6cee0'], crys: M.CRYS, cloud: ['#e2def4', '#a8a2cc', '#ffffff'], thorn: ['#8f8088', '#56495a', '#c4b6be'] };
// a gate drawn along its length L (the way it retracts) and breadth B, in local coords x: 0..B, y: 0..L (the free end at y = L)
function drawGateBars(g, B, L, sty, kind) {
  const m = GMAT[sty] || M.BARK, n = Math.max(1, Math.round(B / 9)), bw = B / n;
  if (sty === 'iron' || sty === 'crys' || sty === 'cloud') {
    const parts = [];
    for (let i = 0; i < n; i++) { const x = i * bw + bw / 2; parts.push(Pt(m, sty === 'crys' ? POLY([x - bw * .3, 0, x + bw * .3, 0, x + bw * .3, L - 5, x, L, x - bw * .3, L - 5]) : RR(x - bw * .28, -4, bw * .56, L + 4 - (sty === 'cloud' ? 0 : 1), sty === 'cloud' ? bw * .28 : 1.5), bw * .5, x - 1, L * .3)); }
    outlined(g, parts, 1.4);
    for (let y = 12; y < L - 6; y += 22) outlined(g, [Pt(m, RR(-1, y, B + 2, 4.4, 2), 3, B / 2, y + 1)], 1.3);
    if (!FLASH && sty === 'iron') for (let y = 12; y < L - 6; y += 22) rivets(g, Array.from({ length: n }, (_, i) => [i * bw + bw / 2, y + 2.2]), .8);
    if (!FLASH && sty === 'crys') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = .7; g.beginPath(); for (let i = 0; i < n; i++) { const x = i * bw + bw * .38; g.moveTo(x, 2); g.lineTo(x, L - 8); } g.stroke(); }
  } else {
    for (let i = 0; i < n; i++) {
      const x = i * bw + bw / 2, ph = i * 1.7, path = g2 => { g2.moveTo(x, -6); for (let y = 0; y <= L - 4; y += 6) g2.lineTo(x + Math.sin(y * .25 + ph) * bw * .14, y); g2.lineTo(x, L - 1); };
      inkLine(g, path, Math.max(3, bw * .5), m[0], m[2]);
      if (sty === 'thorn' && !FLASH) { const th = []; for (let y = 6; y < L - 4; y += 9) { const s = (y / 9) & 1 ? 1 : -1, bx = x + Math.sin(y * .25 + ph) * bw * .14 + s * bw * .25; th.push(Pt(M.BONE, POLY([bx + s * 3.6, y - 1, bx, y - 2.6, bx, y + 1.4]), 1.5)); } outlined(g, th, .8); }
    }
    for (let y = 10; y < L - 6; y += 16) inkLine(g, g2 => { g2.moveTo(-1, y); g2.bezierCurveTo(B * .3, y - 4, B * .7, y + 4, B + 1, y); }, 2.2, m[1], m[0]);
    if (!FLASH) {
      if (sty === 'moss') for (let y = 10; y < L - 6; y += 16) for (let i = 0; i < n; i++) outlined(g, [Pt(M.MOSS, C(i * bw + bw / 2 + 1, y - 1.6, 2), 2)], .7);
      if (sty === 'glow') for (let y = 18; y < L - 6; y += 32) { g.fillStyle = 'rgba(127,240,224,.5)'; g.beginPath(); g.arc(B / 2, y, 3.2, 0, TAU); g.fill(); g.fillStyle = '#c4fff6'; g.beginPath(); g.arc(B / 2, y, 1.4, 0, TAU); g.fill(); }
    }
  }
  if (kind === 'sun' || kind === 'lever' || kind === 'arena' || kind === 'calm') { // a little plate showing what opens it
    const cy = Math.min(L * .5, L - 12), cx = B / 2;
    outlined(g, [Pt(M.WOOD, C(cx, cy, 5.2), 5, cx, cy)], 1.2);
    if (!FLASH) { if (kind === 'sun') { outlined(g, [Pt(M.SUN, STAR(cx, cy, 3.6, 2, 8, 0), 3)], .6); }
      else if (kind === 'lever') { g.strokeStyle = PAL.ink; g.lineWidth = 1.1; g.beginPath(); g.moveTo(cx - 1.6, cy + 2.6); g.lineTo(cx + 1.6, cy - 2.6); g.stroke(); g.fillStyle = M.LEAF[0]; g.beginPath(); g.arc(cx + 1.6, cy - 2.6, 1.3, 0, TAU); g.fill(); }
      else scribble(g, cx, cy, 3.2, 0, .9, 'rgba(43,33,64,.85)'); }
  }
}
const SEALC = [M.ROSE, ['#a6dcd2', '#5aa89c', '#e4f8f3'], ['#ffffff', '#c9c3e6', '#ffffff']];   // knot, boiler, cloud
// the seal medallion: three sockets round a seed; mask bit i = socket i lit (0 knot, 1 boiler, 2 cloud)
function drawSeal(g, D, mask) {
  const r = D / 2, all = (mask & 7) === 7;
  outlined(g, [Pt(M.STONE, C(0, 0, r), r, -r * .3, -r * .3)], 2.2);
  outlined(g, [Pt(M.BARK, C(0, 0, r * .74), r * .7, -r * .2, -r * .25)], 1.6);
  if (!FLASH) {
    g.strokeStyle = M.BARK[1]; g.lineWidth = 1.2; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(0, 0, r * .74 * i / 4, PI * (.1 + i * .3), PI * (1.6 + i * .3)); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1.4; g.beginPath(); g.arc(0, 0, r - 3, PI * 1.05, PI * 1.45); g.stroke();
  }
  outlined(g, [Pt(all ? ['#ffd95a', '#f0a020', '#fff6c8'] : ['#958ea2', '#5c556e', '#ccc6d6'], SEED(0, 1, r * .2, r * .26), r * .2, -1, -1)], 1.1);
  for (let i = 0; i < 3; i++) { const a = -PI / 2 + i * TAU / 3, sx = Math.cos(a) * r * .87, sy = Math.sin(a) * r * .87;
    g.fillStyle = PAL.ink; g.beginPath(); g.arc(sx, sy, r * .15, 0, TAU); g.fill();
    if (mask & (1 << i) && !FLASH) { outlined(g, [Pt(SEALC[i], C(sx, sy, r * .11), r * .11, sx, sy)], .7); } }
}
// the floor hatch of a wide seal gate: a round-ended stone slab with a carved seed and three sockets in a row; half = -1 / 1 draws one half
function drawSealHatch(g, w, h, mask) {
  const r = h / 2;
  outlined(g, [Pt(M.STONE, RR(-w / 2, -h / 2, w, h, r), r, -w * .3, -r * .3)], 2);
  if (!FLASH) {
    g.strokeStyle = M.STONE[1]; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, -h / 2 + 1); g.lineTo(0, h / 2 - 1); g.stroke();   // the seam it opens along
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(-w / 2 + r, -h / 2 + 2, w - h, 1.4);
    g.strokeStyle = 'rgba(90,80,110,.5)'; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, 0, w * .38, h * .3, 0, 0, TAU); g.stroke();   // the carved seed
  }
  for (let i = 0; i < 3; i++) { const sx = (i - 1) * w * .3;
    outlined(g, [Pt(M.BARK, C(sx, 0, r * .62), r * .6, sx - 1, -1)], 1);
    g.fillStyle = PAL.ink; g.beginPath(); g.arc(sx, 0, r * .4, 0, TAU); g.fill();
    if (mask & (1 << i) && !FLASH) outlined(g, [Pt(SEALC[i], C(sx, 0, r * .3), r * .3, sx, 0)], .6); }
}
function sealMask(Gt, o) {
  if (Array.isArray(Gt.seals)) return (Gt.seals[0] ? 1 : 0) | (Gt.seals[1] ? 2 : 0) | (Gt.seals[2] ? 4 : 0);
  const lit = Math.max(0, Math.min(3, num(Gt.lit, o > 0 ? 3 : 0) | 0)); return (1 << lit) - 1;
}
function sealGate(ctx, Gt, x, y, w, h, o, t) {
  const mask = sealMask(Gt, o), n = (mask & 1) + (mask >> 1 & 1) + (mask >> 2 & 1), all = n === 3 || o > 0;
  if (w > h * 2) {
    // the big medallion on the wall above the hatch (not clipped to the gate)
    const D = 56, mx = x + w / 2, my = y - D / 2 - 8, img = bake('sealM' + (all ? 7 : mask), D, D, D / 2, D / 2, g => drawSeal(g, D, all ? 7 : mask));
    if (all) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, mx, my, D * (1.25 + o * .5), '#ffe27a', .75 + .2 * Math.sin(t * .08)); ctx.globalCompositeOperation = 'source-over'; }
    for (let i = 0; i < 3; i++) if (all || mask & (1 << i)) { const a = -PI / 2 + i * TAU / 3; glow(ctx, mx + Math.cos(a) * D * .43, my + Math.sin(a) * D * .43, D * .2, '#ffe27a', .6 + .2 * Math.sin(t * .1 + i)); }
    put(ctx, img, mx, my);
    if (o >= .999) return;
    // the hatch: two halves slide apart into the floor
    const himg = bake('sealH' + Math.round(w) + 'x' + Math.round(h) + '_' + mask, w, h, w / 2, h / 2, g => drawSealHatch(g, w, h, mask));
    if (o < .02) for (let i = 0; i < 3; i++) if (mask & (1 << i)) glow(ctx, x + w / 2 + (i - 1) * w * .3, y + h / 2, h * .7, '#ffe27a', .55 + .2 * Math.sin(t * .1 + i));
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 4, w + 4, h + 8); ctx.clip();
    const sl = o * w / 2;
    for (const side of [-1, 1]) { ctx.save(); ctx.beginPath(); if (side < 0) ctx.rect(x - 2 - sl, y - 4, w / 2 + 2, h + 8); else ctx.rect(x + w / 2 + sl, y - 4, w / 2 + 2, h + 8); ctx.clip(); put(ctx, himg, x + w / 2 + side * sl, y + h / 2); ctx.restore(); }
    ctx.restore();
    return;
  }
  if (o >= .999) return;
  const D = Math.min(w, h), img = bake('seal' + Math.round(D) + '_' + mask, D, D, D / 2, D / 2, g => drawSeal(g, D, mask));
  ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y, w + 4, h); ctx.clip();
  for (let i = 0; i < 3; i++) if (mask & (1 << i)) { const a = -PI / 2 + i * TAU / 3; glow(ctx, x + w / 2 + Math.cos(a) * D * .43, y + h / 2 - o * h + Math.sin(a) * D * .43, D * .16, '#ffe27a', .6 + .2 * Math.sin(t * .1 + i)); }
  put(ctx, img, x + w / 2, y + h / 2 - o * h);
  ctx.restore();
}
function gate(ctx, Gt, t, area) {
  if (!Gt) return; t = num(t, 0) | 0;
  const x = num(Gt.x, 0), y = num(Gt.y, 0), w = Math.max(4, num(Gt.w, 20)), h = Math.max(4, num(Gt.h, 20)), o = clamp01(num(Gt.o, Gt.shut === false ? 1 : 0));
  if (Gt.kind === 'seal') { sealGate(ctx, Gt, x, y, w, h, o, t); return; }
  if (o >= .999) return;
  try {
    ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y, w + 4, h); ctx.clip();
    const sty = GSTY[area] || 'root', vert = Gt.vert != null ? !!Gt.vert : h >= w, B = vert ? w : h, L = vert ? h : w;
    const img = bake('gate' + sty + (Gt.kind || '') + '_' + Math.round(B) + 'x' + Math.round(L), B, L + 8, 0, 6, g => drawGateBars(g, B, L, sty, Gt.kind));
    const shake = Gt.shut === false && o < .05 ? Math.sin(t * 1.5) * .6 : 0;
    if (vert) ctx.drawImage(img, x - img.ox + shake, y - img.oy - o * L, img.lw, img.lh);
    else { ctx.translate(x, y + h); ctx.rotate(-PI / 2); ctx.drawImage(img, -img.ox, -img.oy - o * L + shake, img.lw, img.lh); }
    ctx.restore();
  } catch (e) { try { ctx.restore(); } catch (_) {} err(e); }
}
function drawLever(g) { outlined(g, [Pt(M.BARK, g2 => { g2.moveTo(-9, 0); g2.quadraticCurveTo(-7, -7, 0, -7.4); g2.quadraticCurveTo(7, -7, 9, 0); g2.closePath(); }, 7, -2, -4)], 1.6); outlined(g, [Pt(M.MOSS, E(-3, -6.6, 4, 1.6), 2)], .9); if (!FLASH) { g.strokeStyle = M.BARK[1]; g.lineWidth = .7; g.beginPath(); g.moveTo(-5, -1); g.lineTo(-4, -4); g.moveTo(4, -1); g.lineTo(3, -3.6); g.stroke(); } }
function drawLeverArm(g, on) {
  inkLine(g, g2 => { g2.moveTo(0, 0); g2.lineTo(0, -15); }, 2.2, M.WOOD[0], M.WOOD[2]);
  if (on) flowerHead(g, 0, -16.4, 1, 6); else outlined(g, [Pt(['#fff0f4', '#e8b0c4', '#ffffff'], SEED(0, -17, 2.4, 3.6), 2.4, 0, -17), Pt(M.LEAF, LF(0, -14.6, -2.2, 3.4, 1.2), 1.5), Pt(M.LEAF, LF(0, -14.6, -.9, 3.4, 1.2), 1.5)], .8);
}
function lever(ctx, Lv, t) {
  if (!Lv) return; t = num(t, 0) | 0;
  const x = num(Lv.x, 0), y = floorY(num(Lv.y, 0)), on = !!Lv.on, k = ease(num(Lv.t, 99) / 8);
  const ang = on ? lerp(-.62, .62, k) : lerp(.62, -.62, k);
  putT(ctx, bake('lvarm' + (on ? 1 : 0), 10, 24, 5, 21, g => drawLeverArm(g, on)), x, y - 6, 1, 1, ang);
  put(ctx, bake('lvbase', 20, 10, 10, 9, drawLever), x, y);
  if (num(Lv.t, 99) < 16) { const p = num(Lv.t, 0) / 16; for (let i = 0; i < 3; i++) twinkle(ctx, x + Math.sin(ang) * 18 + (i - 1) * 6 * p, y - 6 - Math.cos(ang) * 18 - p * 6, 2.4 * (1 - p) + .4, 0, '#fff6c0'); }
}
function drawCrystal(g, on) {
  const m = on ? ['#ffe27a', '#f0a020', '#fffbe0'] : ['#b8c4d8', '#7884a0', '#e8eef8'];
  outlined(g, [Pt(M.BARK, g2 => { g2.moveTo(-7, 6); g2.quadraticCurveTo(-8, 1, -4, 2.4); g2.lineTo(4, 2.4); g2.quadraticCurveTo(8, 1, 7, 6); g2.closePath(); }, 4)], 1.3);
  outlined(g, [Pt(m, POLY([0, -10, 5, -4, 4, 4, 0, 6, -4, 4, -5, -4]), 6, -1, -3)], 1.4);
  if (FLASH) return;
  g.strokeStyle = on ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.6)'; g.lineWidth = .7; g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 6); g.moveTo(-5, -4); g.lineTo(0, -1); g.lineTo(5, -4); g.stroke();
  if (on) { g.fillStyle = '#fff'; g.beginPath(); STAR(-1.6, -3.6, 2.4, .7, 4, 0)(g); g.fill(); }
}
function sunSwitch(ctx, Sw, t) {
  if (!Sw) return; t = num(t, 0) | 0;
  const x = num(Sw.x, 0), y = num(Sw.y, 0), on = !!Sw.on, k = on ? ease(num(Sw.t, 99) / 20) : 0;
  if (on) { ctx.save(); ctx.translate(x, y - 2); ctx.rotate(t * .01); ctx.globalAlpha = GA * (.3 * k); for (let i = 0; i < 8; i++) { ctx.fillStyle = i & 1 ? '#fffbe0' : '#ffd95a'; ctx.beginPath(); const a = i * TAU / 8; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - .14) * 22, Math.sin(a - .14) * 22); ctx.lineTo(Math.cos(a + .14) * 22, Math.sin(a + .14) * 22); ctx.closePath(); ctx.fill(); } ctx.restore(); ctx.globalAlpha = GA; glow(ctx, x, y - 2, 20, '#ffe27a', .6 * k); }
  else glow(ctx, x, y - 2, 12, '#c8d8ff', .15 + .08 * Math.sin(t * .06));
  put(ctx, bake('sw' + (on ? 1 : 0), 20, 24, 10, 13, g => { g.scale(1.25, 1.25); drawCrystal(g, on); }), x, y);
}
function drawSpot(g, lit) {
  // the sprout bed on the ground
  outlined(g, [Pt(['#8a6a4a', '#5a4030', '#b89a78'], E(-10, -1.2, 7.6, 2.6), 3)], 1.2);
  for (const [x, h, a] of [[-14, lit ? 6 : 3.4, -.25], [-10, lit ? 8 : 4.4, .05], [-6.4, lit ? 6.4 : 3.6, .3]]) {
    stem(g, [x, -1.6, x + Math.sin(a) * h, -1.6 - h], .8, lit ? '#6fcf5a' : '#8aa07a');
    outlined(g, [Pt(lit ? M.LEAF : ['#a6b896', '#6a7a5e', '#dce4d2'], LF(x + Math.sin(a) * h, -1.6 - h, -2.4, 2.8, 1.1), 1.5), Pt(lit ? M.LEAF : ['#a6b896', '#6a7a5e', '#dce4d2'], LF(x + Math.sin(a) * h, -1.6 - h, -.7, 2.8, 1.1), 1.5)], .6);
  }
  if (lit) flowerHead(g, -10 + Math.sin(.05) * 8, -11, .7, 6);
  // the mossy stump
  outlined(g, [Pt(M.BARK, RR(1, -11, 14, 11, 3), 7, 6, -7), Pt(['#d8b48a', '#a07a52', '#f4dcc0'], E(8, -11, 7, 2.4), 3)], 1.4);
  outlined(g, [Pt(M.MOSS, g2 => { g2.moveTo(1, -11); g2.quadraticCurveTo(4, -14.4, 9, -12.6); g2.quadraticCurveTo(13, -14, 15, -10.6); g2.quadraticCurveTo(13, -9, 9, -10.4); g2.quadraticCurveTo(4, -8.6, 1, -11); g2.closePath(); }, 3)], 1);
  if (!FLASH) { g.strokeStyle = M.BARK[1]; g.lineWidth = .7; g.beginPath(); g.moveTo(4, -7); g.lineTo(4.6, -2); g.moveTo(11, -8); g.lineTo(11.4, -3); g.stroke(); }
  // the little watering can, tipped toward the sprouts
  g.save(); g.translate(8, -13); g.rotate(-.2);
  inkLine(g, g2 => { g2.moveTo(-3, -3); g2.lineTo(-10, -8); }, 1.5, M.TEAL[0], M.TEAL[2]);
  outlined(g, [Pt(M.TEAL, E(-11, -8.6, 1.6, 2.2, -.9), 1.5), Pt(M.TEAL, RR(-4, -8, 9, 8, 2.4), 5, 0, -5)], 1.2);
  inkLine(g, g2 => { g2.moveTo(4.6, -6.6); g2.quadraticCurveTo(8, -6, 5, -1.4); }, .9, M.TEAL[0]);
  inkLine(g, g2 => { g2.moveTo(-2, -8); g2.quadraticCurveTo(.5, -11.6, 3, -8); }, .9, M.TEAL[0]);
  if (!FLASH) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-2.6, -6.6, 1.2, 4); }
  g.restore();
}
function spot(ctx, Sp, t) {
  if (!Sp) return; t = num(t, 0) | 0;
  const x = num(Sp.x, 0), y = floorY(num(Sp.y, 0)), lit = !!Sp.lit;
  if (lit) glow(ctx, x, y - 10, 30, '#bff5a8', .35 + .08 * Math.sin(t * .05));
  put(ctx, bake('spot' + (lit ? 1 : 0), 40, 36, 17, 32, g => { g.scale(1.2, 1.2); drawSpot(g, lit); }), x, y);
  if (lit) { ctx.fillStyle = '#9fe6ff'; ctx.strokeStyle = PAL.ink; ctx.lineWidth = .6; for (let i = 0; i < 3; i++) { const p = ((t + i * 12) % 36) / 36; ctx.beginPath(); ctx.ellipse(x - 6 - i * 2.4 - p * 3.6, y - 24 + p * 17, .9, 1.3, 0, 0, TAU); ctx.fill(); ctx.stroke(); } sparkleRing(ctx, x - 5, y - 16, 16, t); }
}
// the PEDDLER: a tall kindly scarecrow gardener in a patched coat and a straw hat, with a little cart of seeds and jars
function drawCart(g) {
  inkLine(g, g2 => { g2.moveTo(10, -16); g2.lineTo(1, -13); }, 1.6, M.WOOD[0], M.WOOD[2]);
  outlined(g, [Pt(['#e8f4ff', '#a8c0e0', '#ffffff'], RR(14, -30, 6, 9, 2), 4, 16, -27), Pt(['#e8f4ff', '#a8c0e0', '#ffffff'], RR(22, -31.5, 6, 10, 2), 4, 24, -28), Pt(['#d8b483', '#a07a4a', '#f4e2c4'], E(32.6, -24, 5.6, 5.4), 5, 31, -27), Pt(M.WOOD, RR(28, -21, 6, 5, 1.6), 3)], 1.3);
  if (!FLASH) { g.fillStyle = '#ffd93b'; g.fillRect(14.8, -26.6, 4.4, 5); g.fillStyle = '#7fd8ff'; g.fillRect(22.8, -27.4, 4.4, 5.6); outlined(g, [Pt(M.WOOD, RR(14.6, -31.6, 4.8, 2, .8), 1), Pt(M.WOOD, RR(22.6, -33, 4.8, 2, .8), 1)], .7); stem(g, [32.6, -29, 33, -33], .8); outlined(g, [Pt(M.LEAF, LF(33, -33, -2.4, 3.6, 1.3), 1.5), Pt(M.LEAF, LF(33, -33, -.6, 3.6, 1.3), 1.5)], .6); }
  outlined(g, [Pt(M.WOOD, RR(9, -22, 31, 12, 2.4), 8, 18, -18)], 1.6);
  if (!FLASH) { g.strokeStyle = M.WOOD[1]; g.lineWidth = .8; g.beginPath(); g.moveTo(10, -16); g.lineTo(39, -16); g.moveTo(18, -22); g.lineTo(18, -10); g.moveTo(30, -22); g.lineTo(30, -10); g.stroke(); }
  outlined(g, [Pt(M.WOOD, C(32, -7, 6.4), 6, 31, -8)], 1.5);
  if (!FLASH) { g.strokeStyle = M.WOOD[1]; g.lineWidth = .9; g.beginPath(); for (let i = 0; i < 3; i++) { const a = i * PI / 3; g.moveTo(32 + Math.cos(a) * 5, -7 + Math.sin(a) * 5); g.lineTo(32 - Math.cos(a) * 5, -7 - Math.sin(a) * 5); } g.stroke(); g.fillStyle = M.BARK[1]; g.beginPath(); g.arc(32, -7, 1.4, 0, TAU); g.fill(); }
}
function drawPeddler(g, o) {
  const coat = ['#7fb894', '#3f7a5a', '#cdeed8'], pants = ['#8a9ed0', '#4f5f96', '#d4ddf4'], straw = M.STRAW, sack = ['#ecd8aa', '#b8986a', '#fff4dc'];
  // legs and boots, straw at the ankles
  outlined(g, [Pt(pants, RR(-5.4, -15, 4.2, 13, 1.6), 3), Pt(pants, RR(1.2, -15, 4.2, 13, 1.6), 3)], 1.4);
  for (const x of [-3.3, 3.3]) { inkLine(g, g2 => { g2.moveTo(x - 2, -3); g2.lineTo(x - 3, -.6); g2.moveTo(x + 1.8, -3); g2.lineTo(x + 3, -.8); }, .7, straw[0]); }
  outlined(g, [Pt(M.BARK, E(-3.6, -1.2, 3.4, 1.8), 2), Pt(M.BARK, E(3.8, -1.2, 3.4, 1.8), 2)], 1.1);
  // the back arm resting on the cart handle
  inkLine(g, g2 => { g2.moveTo(5, -26); g2.quadraticCurveTo(9, -20, 8.4, -15.6); }, 2.8, coat[1]);
  outlined(g, [Pt(['#e8c890', '#a87a40', '#fbf0d8'], C(8.6, -15, 2), 2)], .9);
  // the patched coat
  outlined(g, [Pt(coat, g2 => { g2.moveTo(-6.4, -27.6); g2.lineTo(6.4, -27.6); g2.quadraticCurveTo(8.8, -18, 8, -11.6); g2.lineTo(-8, -11.6); g2.quadraticCurveTo(-8.8, -18, -6.4, -27.6); g2.closePath(); }, 9, -1, -22)], 1.6);
  if (!FLASH) {
    g.fillStyle = '#e8a07a'; g.fillRect(-6.4, -17.4, 4, 3.6); g.fillStyle = '#c8b2ff'; g.fillRect(2.6, -23.4, 3.4, 3);
    g.strokeStyle = PAL.ink; g.lineWidth = .45; g.setLineDash([.8, .8]); g.strokeRect(-6.4, -17.4, 4, 3.6); g.strokeRect(2.6, -23.4, 3.4, 3); g.setLineDash([]);
    g.strokeStyle = coat[1]; g.lineWidth = .8; g.beginPath(); g.moveTo(0, -27); g.lineTo(0, -12); g.stroke();
    dots(g, [[1.3, -24], [1.3, -20], [1.3, -16]], .7, '#f6d68a');
    g.strokeStyle = straw[0]; g.lineWidth = .8; g.beginPath(); g.moveTo(-6, -11.8); g.lineTo(-6.6, -10); g.moveTo(-3, -11.8); g.lineTo(-3.2, -9.8); g.moveTo(3.4, -11.8); g.lineTo(3.8, -10); g.stroke();
  }
  // the front arm, a little wave
  inkLine(g, g2 => { g2.moveTo(-5.6, -26); g2.quadraticCurveTo(-11, -22, -11.6, o.wave ? -30 : -17); }, 2.8, coat[0], coat[2]);
  const hy = o.wave ? -31 : -16;
  inkLine(g, g2 => { g2.moveTo(-12.6, hy + 1.4); g2.lineTo(-14, hy + 2.6); g2.moveTo(-11, hy + 1.8); g2.lineTo(-11.4, hy + 3.4); }, .6, straw[0]);
  outlined(g, [Pt(['#e8c890', '#a87a40', '#fbf0d8'], C(-11.8, hy, 2.1), 2)], .9);
  // a little scarf
  outlined(g, [Pt(M.RED, RR(-5, -29.4, 10, 3, 1.4), 2), Pt(M.RED, RR(1.4, -28, 2.6, 5.4, 1.2), 2)], 1);
  // head: a soft burlap face, kind
  outlined(g, [Pt(sack, E(0, -35.4, 7.2, 7.6), 7, -1, -37)], 1.6);
  if (!FLASH) { g.strokeStyle = 'rgba(160,120,70,.35)'; g.lineWidth = .5; g.beginPath(); for (let i = -2; i <= 2; i++) { g.moveTo(-6 + .4 * i, -35.4 + i * 2.4); g.lineTo(6 + .4 * i, -35.4 + i * 2.4); } g.stroke(); }
  // straw hair under the brim
  inkLine(g, g2 => { g2.moveTo(-6.4, -39); g2.lineTo(-9.2, -36.4); g2.moveTo(-6.6, -38); g2.lineTo(-8.6, -34); g2.moveTo(6.4, -39); g2.lineTo(9.2, -36.6); g2.moveTo(6.6, -38); g2.lineTo(8.8, -34.4); }, .8, straw[0]);
  const ey = -35.6, eyes = o.eyes || 'open';
  if (eyes === 'open' || eyes === 'wow' || eyes === 'sad') { eye(g, -2.6, ey, 3.6, { mood: eyes === 'sad' ? 'sad' : eyes, look: .4, lid: sack[0] }); eye(g, 2.6, ey, 3.6, { mood: eyes === 'sad' ? 'sad' : eyes, look: .4, side: -1, lid: sack[0] }); }
  else { eye(g, -2.6, ey, 3.6, { mood: eyes }); eye(g, 2.6, ey, 3.6, { mood: eyes }); }
  blush(g, [[-4.8, -32.4], [4.8, -32.4]], 1.3, .8);
  mouth(g, 0, -31.6, 1.7, o.mouth || 'smile', .8);
  if (!FLASH && (o.mouth || 'smile') === 'smile') { g.strokeStyle = PAL.ink; g.lineWidth = .4; g.beginPath(); for (const x of [-1.2, 0, 1.2]) { g.moveTo(x, -31.2); g.lineTo(x, -30.2); } g.stroke(); }
  // straw hat with a band and a flower
  outlined(g, [Pt(straw, E(0, -41.6, 12.4, 3.2), 5, -3, -42.6), Pt(straw, g2 => { g2.moveTo(-6.2, -41.6); g2.quadraticCurveTo(-6, -49.4, 0, -49.6); g2.quadraticCurveTo(6, -49.4, 6.2, -41.6); g2.closePath(); }, 6, -2, -46)], 1.5);
  if (!FLASH) { g.fillStyle = '#e06a6a'; g.fillRect(-6, -44.2, 12, 2); g.strokeStyle = straw[1]; g.lineWidth = .5; g.beginPath(); g.moveTo(-10, -41); g.lineTo(-4, -40.6); g.moveTo(4, -40.6); g.lineTo(10, -41); g.stroke(); }
  flowerHead(g, 5, -44, .55, 6);
}
function npc(ctx, N, t) {
  if (!N) return; t = num(t, 0) | 0;
  const x = num(N.x, 0), y = floorY(num(N.y, 0)), talk = clamp01(num(N.talk, 0)), blink = ((t + 40) % 260) < 7;
  const mo = talk > .3 ? ((t >> 3) & 1 ? 'open' : 'smile') : 'smile', wave = talk > .3 && ((t >> 5) & 1);
  put(ctx, bake('cart', 44, 40, 4, 37, drawCart), x, y);
  const img = bake('ped' + (blink ? 's' : 'o') + mo + (wave ? 'w' : ''), 30, 54, 15, 51, g => drawPeddler(g, { eyes: blink ? 'shut' : 'open', mouth: mo, wave }));
  const bob = talk > 0 ? Math.abs(Math.sin(t * .15)) * 1.6 * talk : Math.sin(t * .04) * .4;
  putT(ctx, img, x, y, 1, 1 + bob * .015, Math.sin(t * .03) * .02);
}
function drawSign(g) {
  outlined(g, [Pt(M.WOOD, RR(-1.8, -14, 3.6, 14, 1.2), 2)], 1.2);
  outlined(g, [Pt(M.WOOD, RR(-9.6, -21, 19.2, 10, 2.6), 8, -3, -18)], 1.5);
  if (!FLASH) { g.strokeStyle = M.WOOD[1]; g.lineWidth = .9; g.beginPath(); g.moveTo(-6, -18.4); g.lineTo(5, -18.4); g.moveTo(-6, -15.4); g.lineTo(2, -15.4); g.stroke(); }
  stem(g, [6.6, -21, 7.6, -24.4], .7);
  outlined(g, [Pt(M.LEAF, LF(7.6, -24.4, -2.3, 3.6, 1.3), 1.5), Pt(M.LEAF, LF(7.6, -24.4, -.6, 3.6, 1.3), 1.5)], .6);
  outlined(g, [Pt(M.MOSS, E(-1, 0, 5, 1.4), 2)], .9);
}
function sign(ctx, Sg, t) { if (!Sg) return; put(ctx, bake('sign', 22, 30, 11, 27, drawSign), num(Sg.x, 0), floorY(num(Sg.y, 0))); }
const PSTY = { rootgate: 'wood', mossy: 'moss', glowcap: 'glow', pipes: 'metal', crystal: 'crys', cloud: 'cloud', heart: 'root' };
function drawPlat(g, w, h, sty) {
  if (sty === 'cloud') { const n = Math.max(2, Math.round(w / 9)), parts = []; for (let i = 0; i < n; i++) { const x = (i + .5) * w / n, r = h * .55 + (i & 1) * 1.4; parts.push(Pt(M.CLOUD, C(x, h * .45 - (i & 1), r), r, i < 3 ? x : null, h * .45)); } outlined(g, parts, 1.6); return; }
  const m = sty === 'metal' ? ['#8ea0b8', '#50607a', '#d0dcec'] : sty === 'crys' ? M.CRYS : sty === 'glow' ? ['#8a7a9a', '#584a6a', '#c0b4d0'] : sty === 'root' ? ['#8f7a80', '#56485a', '#c4b4ba'] : M.BARK;
  outlined(g, [Pt(m, RR(0, 0, w, h, sty === 'metal' ? 2 : 4), h * .8, w * .2, h * .3)], 1.6);
  if (FLASH) return;
  if (sty === 'metal') { rivets(g, [[3, h / 2], [w - 3, h / 2], [w / 2, h / 2]], .9); g.fillStyle = 'rgba(40,50,70,.3)'; g.fillRect(1, h - 2.4, w - 2, 1.4); }
  else if (sty === 'crys') { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = .7; g.beginPath(); for (let x = 6; x < w; x += 9) { g.moveTo(x, 1); g.lineTo(x - 3, h - 1); } g.stroke(); }
  else { g.strokeStyle = m[1]; g.lineWidth = .8; g.beginPath(); g.moveTo(3, h * .55); g.lineTo(w - 5, h * .55); g.stroke(); g.fillStyle = m[1]; for (const x of [w * .3, w * .72]) { g.beginPath(); g.ellipse(x, h * .55, 1.6, 1, 0, 0, TAU); g.fill(); }
    if (sty === 'moss' || sty === 'wood') { const parts = []; for (let x = 2; x < w - 1; x += 5) parts.push(Pt(M.MOSS, C(x + 1, .6, 2.2 + ((x / 5) & 1) * .6), 2)); outlined(g, parts, .8); }
    if (sty === 'glow') for (const x of [w * .25, w * .7]) { outlined(g, [Pt(['#8ff0e0', '#2fb8a8', '#e0fffa'], g2 => { g2.moveTo(x - 3, 0); g2.quadraticCurveTo(x, -4.4, x + 3, 0); g2.closePath(); }, 2)], .8); } }
}
function plat(ctx, Pl, t, area) {
  if (!Pl) return; t = num(t, 0) | 0;
  const w = Math.max(6, num(Pl.w, 40)), h = Math.max(4, num(Pl.h, 10)), sty = PSTY[area] || 'wood';
  try { if (sty === 'glow') glow(ctx, num(Pl.x, 0) + w / 2, num(Pl.y, 0), w * .6, '#8ff0e0', .2);
    put(ctx, bake('plat' + sty + Math.round(w) + 'x' + Math.round(h), w, h + 6, 0, 4, g => drawPlat(g, w, h, sty)), num(Pl.x, 0), num(Pl.y, 0)); } catch (e) { err(e); }
}
function drawVentGrate(g) {
  outlined(g, [Pt(M.IRON, RR(-11, -5, 22, 6, 2), 4, -4, -3)], 1.4);
  g.fillStyle = PAL.ink; g.fillRect(-8, -3.6, 16, 2.6);
  if (!FLASH) { g.fillStyle = M.IRON[0]; for (let x = -7; x < 8; x += 3) g.fillRect(x, -3.6, 1.1, 2.6); rivets(g, [[-9.4, -2.2], [9.4, -2.2]], .6); }
}
function vent(ctx, Vt, t) {
  if (!Vt) return; t = num(t, 0) | 0;
  const x = num(Vt.x, 0), y = floorY(num(Vt.y, 0)), H = Math.max(10, num(Vt.h, 60));
  if (Vt.on) {
    const c = sootPuffImg(1), n = LOW ? 6 : Math.min(16, 5 + Math.round(H / 14)), T = num(Vt.t, t);
    ctx.globalAlpha = GA * (.28); ctx.fillStyle = '#ffffff'; ctx.beginPath(); rrect(ctx, x - 7, y - H, 14, H, 7); ctx.fill(); ctx.globalAlpha = GA;
    for (let i = 0; i < n; i++) { const p = ((T * 2.4 + i * 100 / n) % 100) / 100, s = .8 + p * .9; putA(ctx, c, x + Math.sin(p * 8 + i) * 3, y - 3 - p * H, Math.min(1, (1 - p) * 4, p * 8), s * (i & 1 ? -1 : 1), s); }
  } else if (Vt.tell > 0) { puffs(ctx, x, y - 4, 3, t * 2, 1, 3, 10, .5, 18); }
  put(ctx, bake('vent', 24, 8, 12, 6, drawVentGrate), x + (Vt.tell > 0 && !Vt.on ? Math.sin(t * 2) * .5 : 0), y);
}
function drawCap(g) {
  const m = ['#8ff0e0', '#2fb8a8', '#e4fffb'];
  outlined(g, [Pt(['#f4ecd8', '#c8b898', '#ffffff'], g2 => { g2.moveTo(-4.4, 0); g2.quadraticCurveTo(-5, -5, -3.6, -8.4); g2.lineTo(3.6, -8.4); g2.quadraticCurveTo(5, -5, 4.4, 0); g2.closePath(); }, 4, -1, -4)], 1.4);
  outlined(g, [Pt(m, g2 => { g2.moveTo(-15.6, -6.6); g2.bezierCurveTo(-15, -22, 15, -22, 15.6, -6.6); g2.quadraticCurveTo(8, -9.6, 0, -9); g2.quadraticCurveTo(-8, -9.6, -15.6, -6.6); g2.closePath(); }, 14, -3, -15)], 1.8);
  if (FLASH) return;
  for (const [x, y, r] of [[-8, -12, 2.4], [1, -16.4, 2.8], [8.6, -11.6, 2], [-2.6, -11, 1.4]]) { g.fillStyle = '#e4fffb'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(30,120,110,.5)'; g.lineWidth = .7; g.beginPath(); for (let i = -3; i <= 3; i++) { g.moveTo(i * 3.4, -9.2); g.lineTo(i * 3.8, -7.4); } g.stroke();
}
function cap(ctx, Cp, t) {
  if (!Cp) return; t = num(t, 0) | 0;
  const x = num(Cp.x, 0), y = floorY(num(Cp.y, 0)), s = clamp01(num(Cp.squash, 0)), pulse = .5 + .1 * Math.sin(t * .05 + x);
  glow(ctx, x, y - 12, 28, '#8ff0e0', pulse);
  putT(ctx, bake('cap', 34, 26, 17, 23, drawCap), x, y, 1 + s * .32, 1 - s * .38);
  if (!LOW && ((t + (x | 0)) % 120) < 30) { const p = ((t + (x | 0)) % 120) / 30; ctx.fillStyle = 'rgba(200,255,248,' + (1 - p) + ')'; ctx.beginPath(); ctx.arc(x - 6 + p * 3, y - 20 - p * 10, 1, 0, TAU); ctx.fill(); }
}

/* =====================================================================================================================
   ICONS (HUD and menus): drawn in a 20 x 20 design box around (0,0), baked at the asked size. x,y = the icon's centre.
   ===================================================================================================================== */
function drawLeafIcon(g, kind) {
  const m = kind === 'bark' ? M.BARK : M.LEAF, path = LF(-7.6, 6.4, -.72, 18, 5.6);
  if (kind === 'empty') { g.fillStyle = 'rgba(20,14,36,.5)'; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.3; g.beginPath(); path(g); g.fill(); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = .9; g.beginPath(); g.moveTo(-6, 4.8); g.lineTo(4.2, -5.4); g.stroke(); return; }
  outlined(g, [Pt(m, path, 9, -1, -1)], 1.5);
  if (FLASH) return;
  g.strokeStyle = m[1]; g.lineWidth = .9; g.beginPath(); g.moveTo(-6, 4.8); g.lineTo(5, -6.2); for (const k of [.3, .55, .78]) { const px = -6 + 11 * k, py = 4.8 - 11 * k; g.moveTo(px, py); g.lineTo(px - 2.6, py - 1.2); g.moveTo(px, py); g.lineTo(px + 1.2, py + 2.6); } g.stroke();
  if (kind === 'bark') { g.strokeStyle = 'rgba(255,240,220,.4)'; g.lineWidth = .7; g.beginPath(); g.moveTo(-2, 5); g.lineTo(-1, 2); g.moveTo(3, 0); g.lineTo(4.4, -1.6); g.stroke(); }
}
// the Sunlight meter: a straight-sided glass jar with a neck and a lid; full = 1 draws it brimming (the fill is clipped live)
const SUNJAR = g => { g.moveTo(-4.6, -6.4); g.lineTo(-4.6, -5.2); g.quadraticCurveTo(-7.4, -5, -7.4, -2.2); g.lineTo(-7.4, 7); g.quadraticCurveTo(-7.4, 10, -4.4, 10); g.lineTo(4.4, 10); g.quadraticCurveTo(7.4, 10, 7.4, 7); g.lineTo(7.4, -2.2); g.quadraticCurveTo(7.4, -5, 4.6, -5.2); g.lineTo(4.6, -6.4); g.closePath(); };
const SUNJ_B = 9.2, SUNJ_T = -5.6;
function drawSunJar(g, full) {
  g.fillStyle = PAL.ink; g.beginPath(); rrect(g, -6.8, -11.2, 13.6, 6, 2.2); g.fill();
  g.fillStyle = FLASH ? '#fff' : '#b874d8'; g.beginPath(); rrect(g, -5.8, -10.2, 11.6, 4, 1.4); g.fill();
  if (!FLASH) { g.fillStyle = '#d9a8f0'; g.fillRect(-4.8, -9.8, 9.6, 1.1); }
  g.beginPath(); SUNJAR(g); g.fillStyle = FLASH ? '#fff' : full ? '#ffd93b' : 'rgba(236,230,255,.82)'; g.fill();
  if (!FLASH) {
    g.save(); g.beginPath(); SUNJAR(g); g.clip();
    if (full) { const gr = g.createLinearGradient(0, -6, 0, 10); gr.addColorStop(0, '#fff3a0'); gr.addColorStop(.4, '#ffd93b'); gr.addColorStop(1, '#f5a623'); g.fillStyle = gr; g.fillRect(-9, -7, 18, 18); g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); STAR(2.4, 3.4, 2.6, .8, 4, 0)(g); g.fill(); }
    else { g.fillStyle = 'rgba(176,160,226,.4)'; g.fillRect(2.6, -7, 6, 18); }
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); rrect(g, -6, -3, 1.8, 9.4, .9); g.fill();
    g.restore();
  }
  g.strokeStyle = PAL.ink; g.lineWidth = 1.3; g.lineJoin = 'round'; g.beginPath(); SUNJAR(g); g.stroke();
}
function drawMap(g) {
  outlined(g, [Pt(M.CREAM, POLY([-9, -6, -3, -8, 3, -6, 9, -8, 9, 7, 3, 9, -3, 7, -9, 9]), 8, -3, -3)], 1.3);
  if (FLASH) return;
  g.fillStyle = 'rgba(160,130,90,.25)'; g.beginPath(); g.moveTo(-3, -8); g.lineTo(3, -6); g.lineTo(3, 9); g.lineTo(-3, 7); g.closePath(); g.fill();
  g.strokeStyle = '#c0605a'; g.lineWidth = 1; g.setLineDash([1.6, 1.4]); g.beginPath(); g.moveTo(-6, 5); g.quadraticCurveTo(-2, -4, 5, -3); g.stroke(); g.setLineDash([]);
  outlined(g, [Pt(M.LEAF, LF(4.4, -2.6, -.9, 4.4, 1.5), 2)], .6);
}
function drawCompass(g) {
  outlined(g, [Pt(M.GOLD, C(0, 0, 8.6), 8, -2, -2)], 1.4);
  g.fillStyle = FLASH ? '#fff' : PAL.cream; g.beginPath(); g.arc(0, 0, 6.4, 0, TAU); g.fill();
  if (FLASH) return;
  outlined(g, [Pt(M.RED, POLY([0, -5.6, 1.8, 0, -1.8, 0]), 2), Pt(['#9aa8c8', '#5a6a8a', '#e0e8f4'], POLY([0, 5.6, 1.8, 0, -1.8, 0]), 2)], .6);
  g.fillStyle = PAL.ink; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
}
function drawCan(g) {
  inkLine(g, g2 => { g2.moveTo(-3, 1); g2.lineTo(-9.4, -5); }, 1.8, M.TEAL[0], M.TEAL[2]);
  outlined(g, [Pt(M.TEAL, E(-10, -5.6, 1.8, 2.6, -.8), 2), Pt(M.TEAL, RR(-4.6, -4, 12, 11, 3), 7, 0, 0)], 1.3);
  inkLine(g, g2 => { g2.moveTo(7, -2); g2.quadraticCurveTo(11, -1, 7.4, 5); }, 1.1, M.TEAL[0]);
  inkLine(g, g2 => { g2.moveTo(-2, -4); g2.quadraticCurveTo(1.4, -9, 4.6, -4); }, 1.1, M.TEAL[0]);
  if (!FLASH) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-2.6, -2, 1.4, 6); }
}
function drawHat(g) { outlined(g, [Pt(M.STRAW, E(0, 3, 10, 3.4), 5, -3, 2), Pt(M.STRAW, g2 => { g2.moveTo(-5.6, 3); g2.quadraticCurveTo(-5.4, -6, 0, -6.2); g2.quadraticCurveTo(5.4, -6, 5.6, 3); g2.closePath(); }, 6, -2, -2)], 1.3); if (!FLASH) { g.fillStyle = '#e06a6a'; g.fillRect(-5.4, -.6, 10.8, 2); flowerHead(g, 4.4, -.4, .5, 6); } }
function drawLock(g) {
  inkLine(g, g2 => { g2.moveTo(-4.4, -1); g2.lineTo(-4.4, -4); g2.arc(0, -4, 4.4, PI, 0); g2.lineTo(4.4, -1); }, 1.8, M.IRON[0], M.IRON[2]);
  outlined(g, [Pt(M.WOOD, RR(-7, -1.6, 14, 10.6, 2.6), 7, -2, 1)], 1.4);
  if (!FLASH) { g.fillStyle = PAL.ink; g.beginPath(); g.arc(0, 2.6, 1.6, 0, TAU); g.fill(); g.fillRect(-.7, 2.6, 1.4, 3.6); stem(g, [-7, 6, -9.4, 3], .6); outlined(g, [Pt(M.LEAF, LF(-9.4, 3, -1.9, 3.2, 1.2), 1.5)], .5); }
}
function drawGuardIcon(g) {
  const sp = []; for (let i = 0; i < 9; i++) { const a = i * TAU / 9, c = Math.cos(a), s = Math.sin(a); sp.push(Pt(M.BONE, POLY([c * 9.4, s * 9.4, c * 5.6 - s * 2, s * 5.6 + c * 2, c * 5.6 + s * 2, s * 5.6 - c * 2]), 2)); }
  outlined(g, sp, .9); outlined(g, [Pt(['#a89cb0', '#6a5f78', '#d8d0de'], C(0, 0, 6.6), 6.6, 0, 0)], 1.3);
  for (const [rx, ry, rot] of [[6, 2.6, .5], [5.8, 2.4, -1]]) inkLine(g, E(0, 0, rx, ry, rot), 1, M.VINEG[0]);
}
function drawKey(g, label, w) {
  outlined(g, [Pt(['#5a4a7a', '#2b2140', '#8a7ab0'], RR(-w / 2, -9, w, 18, 4.4), 8)], 1.1);
  g.fillStyle = FLASH ? '#fff' : '#6a5a8c'; g.beginPath(); rrect(g, -w / 2 + 1.6, -8, w - 3.2, 13.6, 3.4); g.fill();
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-w / 2 + 3, -7, w - 6, 1.2);
  g.font = font(label.length > 2 ? 7.6 : 9.6); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = PAL.sun; g.fillText(label, 0, -1.4);
}
const ICONS = {
  leaf: g => drawLeafIcon(g, ''), leafEmpty: g => drawLeafIcon(g, 'empty'), leafBark: g => drawLeafIcon(g, 'bark'),
  dew: g => drawDew(g, 1.45), life: g => { g.translate(0, 3); drawLifeSeed(g, 1.45); },
  lifeHalf: g => { g.translate(0, 3); g.save(); g.beginPath(); g.rect(-12, -16, 12, 28); g.clip(); drawLifeSeed(g, 1.45); g.restore(); g.save(); g.beginPath(); g.rect(0, -6, 12, 18); g.clip(); g.fillStyle = 'rgba(20,14,36,.5)'; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.1; g.beginPath(); HEARTP(0, 0, 1.75 * 1.45)(g); g.fill(); g.stroke(); g.restore(); },
  vessel: g => drawVessel(g, 1.35), notch: g => drawNotch(g, 1.6, 0), notchFull: g => drawNotch(g, 1.6, 1), map: drawMap, compass: drawCompass, spot: drawCan, peddler: drawHat,
  puddle: g => { g.translate(0, 3); drawPuddle(g); g.fillStyle = '#fff'; g.beginPath(); STAR(4, -6, 3.4, 1, 4, 0)(g); g.fill(); }, guardian: drawGuardIcon, lock: drawLock
};
let ICN = 0;
function icon(ctx, name, x, y, size, t) {
  name = String(name || ''); size = Math.max(4, num(size, 16)); x = num(x, 0); y = num(y, 0); t = num(t, 0) | 0;
  const px = Math.max(4, Math.round(size * R)), d = px / 20, k = size / 20;
  const mk = (key, w, h, draw) => { if (ICN > 3000) { for (const kk of SC.keys()) if (kk[0] === '~') SC.delete(kk); ICN = 0; } const had = SC.has(key); const c = bake(key, w, h, w / 2, h / 2, draw, 0, d); if (!had) ICN++; return c; };
  const blit = c => ctx.drawImage(c, x - c.ox * k, y - c.oy * k, c.lw * k, c.lh * k);
  try {
    if (name === 'sun' || name.startsWith('sun:')) {
      const f = name === 'sun' ? 1 : clamp01(parseFloat(name.slice(4)) || 0), e = mk('~sun0|' + px, 20, 22, g => drawSunJar(g, 0)), fu = mk('~sun1|' + px, 20, 22, g => drawSunJar(g, 1));
      blit(e); if (f > 0) { const top = SUNJ_B - (SUNJ_B - SUNJ_T) * f, sy = (fu.oy + top) * d, sh = fu.height - sy; if (sh > 0) ctx.drawImage(fu, 0, sy, fu.width, sh, x - fu.ox * k, y + top * k, fu.lw * k, sh / d * k); }
      if (f >= 1 && !LOW && ((t % 80) < 12)) twinkle(ctx, x + 4 * k, y - 2 * k, (2 + (t % 80) * .3) * k, 0, '#fff');
      return;
    }
    if (name.startsWith('charm:')) { const id = name.slice(6); blit(mk('~ch' + id + '|' + px, 20, 22, g => drawCharm(g, id, 1.05))); return; }
    if (name.startsWith('ability:')) { const id = name.slice(8); blit(mk('~ab' + id + '|' + px, 22, 26, g => { g.scale(.82, .82); drawAbilitySeed(g, id); })); return; }
    if (name.startsWith('key:')) { const lab = name.slice(4) || '?'; mctx().font = font(lab.length > 2 ? 7.6 : 9.6); const w = Math.max(18, mctx().measureText(lab).width + 9); blit(mk('~key' + lab + '|' + px, w + 2, 20, g => drawKey(g, lab, w))); return; }
    const fn = ICONS[name]; if (!fn) { ctx.fillStyle = PAL.ink; ctx.beginPath(); ctx.arc(x, y, size * .3, 0, TAU); ctx.fill(); return; }
    blit(mk('~' + name + '|' + px, 24, 26, fn));
  } catch (e) { err(e); }
}
let MC = null; function mctx() { return MC || (MC = canvas(4, 4).getContext('2d')); }

/* =====================================================================================================================
   PORTRAITS: big SPRIG / MARIGOLD / PEDDLER / the HEARTSEED ('heart' too) / a 'sign'. x,y = the centre of a size x size box. mood: happy (default),
   talk, wow, sad, sleep, calm (eyes shut, smiling), det (determined).
   ===================================================================================================================== */
const MOODS = { happy: ['open', 'open'], talk: ['open', 'smile'], wow: ['wow', 'o'], sad: ['sad', 'frown'], sleep: ['shut', 'wave'], calm: ['happy', 'smile'], det: ['det', 'smile'] };
function portrait(ctx, who, x, y, size, t, mood) {
  t = num(t, 0) | 0; size = Math.max(8, num(size, 64)); x = num(x, 0); y = num(y, 0);
  const md = MOODS[mood] ? mood : 'happy', mm = MOODS[md], blink = md !== 'sleep' && md !== 'calm' && ((t + (who === 'marigold' ? 70 : 0)) % 200) < 7;
  let eyes = blink ? 'shut' : mm[0], mo = mm[1]; if (md === 'talk') mo = (t >> 3) & 1 ? 'open' : 'smile';
  const px = Math.round(size * R), d = px / 48, k = size / 48;
  const mk = (key, draw) => bake('~p' + key + '|' + px, 48, 48, 24, 24, draw, 0, d);
  const blit = c => ctx.drawImage(c, x - c.ox * k, y - c.oy * k, c.lw * k, c.lh * k);
  try {
    if (who === 'sign') { blit(mk('sign', g => { g.translate(0, 21); g.scale(1.55, 1.55); drawSign(g); })); return; }
    if (who === 'heartseed' || who === 'heart') {
      rays(ctx, x, y, size * .52, 12, t * .006, .7); glow(ctx, x, y, size * .5, '#ffe27a', .75);
      blit(mk('heart', g => { g.translate(0, 6); g.scale(.3, .3); drawHeartGold(g); }));
      calmSparkles(ctx, x, y, size * .32, size * .3, t, 1); return;
    }
    if (who === 'peddler') {
      blit(mk('ped' + eyes + mo, g => { g.save(); g.beginPath(); g.rect(-24, -24, 48, 48); g.clip(); g.translate(0, 58); g.scale(1.55, 1.55); drawPeddler(g, { eyes, mouth: mo, wave: md === 'happy' || md === 'wow' }); g.restore(); fadeBottom(g); }));
      return;
    }
    const wi = who === 'marigold' ? 1 : 0;
    blit(mk('h' + wi + eyes + mo, g => {
      const o = Object.assign({}, heroPose('idle', 0), { eyes, mouth: mo, lookE: .5, staffB: [9, 1, .12], staffFront: 1, fhB: [9, -6.2] });
      g.translate(-4, 22); g.scale(1.45, 1.45); drawHero(g, wi, o);
    }));
    if (md === 'sleep') zzz(ctx, x + size * .2, y - size * .2, t);
  } catch (e) { err(e); }
}
function fadeBottom(g) { g.save(); g.globalCompositeOperation = 'destination-out'; const gr = g.createLinearGradient(0, 14, 0, 24); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(-26, 14, 52, 12); g.restore(); }

/* =====================================================================================================================
   API
   ===================================================================================================================== */
// every entry point: never throws, and leaves the caller's globalAlpha / composite mode as they were (GA = the caller's alpha)
function safeCall(fn) {
  return function (ctx) {
    if (!ctx) return; const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation; GA = ga;
    try { return fn.apply(null, arguments); } catch (e) { err(e); } finally { ctx.globalAlpha = ga; ctx.globalCompositeOperation = op; GA = 1; }
  };
}
RL.Art = {
  init(r, low) { r = Math.max(.5, Math.min(6, +r || 2)); if (r !== R) { SC = new Map(); ICN = 0; } R = r; LOW = !!low; },
  player: safeCall(player), foe: safeCall(foe), guardian: safeCall(guardian), hazard: safeCall(hazard),
  shot: safeCall(shot), drop: safeCall(drop), item: safeCall(item), flower: safeCall(flower), bud: safeCall(bud),
  gate: safeCall(gate), lever: safeCall(lever), switch: safeCall(sunSwitch), spot: safeCall(spot), npc: safeCall(npc), sign: safeCall(sign),
  plat: safeCall(plat), vent: safeCall(vent), cap: safeCall(cap), icon: safeCall(icon), portrait: safeCall(portrait),
  errors: ERR
};
})();
