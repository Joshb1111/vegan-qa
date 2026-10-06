/* ROOTLIGHT render test driver (docs/rootlight/test/render.html). Builds a test room of its own per area with every tile
   kind and thing, runs a real RL.Sim in it and draws frames with RL.Render at 1280 x 720 (R = 2). Sets document.title to
   'ready' when the picture is done; window.__rt has the numbers (frame times, stats, errors). */
'use strict';
(function () {
const RL = window.RL, Q = new URLSearchParams(location.search), CASE = Q.get('case') || 'mossy';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const R = +(Q.get('r') || 2), out = window.__rt = { errors: [], case: CASE };
window.addEventListener('error', e => out.errors.push(String(e.message)));
cv.width = 640 * R; cv.height = 360 * R; const CSS = Q.get('full') ? R : 2; cv.style.width = 640 * CSS + 'px'; cv.style.height = 360 * CSS + 'px';
if (RL.Art && RL.Art.init) RL.Art.init(R, false);
RL.Render.init(R, !!Q.get('low'));

/* ---------- a test room: 48 x 27 tiles (3 x 3 cells) with every tile kind and thing ---------- */
function mk(area, o) {
  o = o || {};
  const W = 48, H = 27, g = []; for (let y = 0; y < H; y++) g.push(Array(W).fill('.'));
  const rect = (x0, y0, x1, y1, ch) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch; };
  const put = (x, y, ch) => { g[y][x] = ch; };
  rect(0, 0, 47, 1, '#'); rect(0, 0, 1, 26, '#'); rect(46, 0, 47, 26, '#'); rect(0, 24, 47, 26, '#');
  rect(46, 18, 47, 21, '.'); rect(46, 18, 46, 21, 'g');
  /* the ceiling: a stone shelf, a root beam and a hanging root column */
  rect(12, 2, 19, 3, 'K'); rect(24, 2, 31, 2, 'R'); rect(30, 3, 31, 8, 'R');
  /* the hill with a root band and a boulder */
  rect(2, 17, 10, 23, '#'); rect(4, 15, 8, 16, '#'); rect(2, 20, 10, 20, 'R'); rect(8, 13, 9, 14, 'K');
  put(5, 14, 'W'); put(3, 16, 'i'); put(9, 16, 'b');
  /* the thorn pit, a block with a glowcap, the pool with currents */
  rect(11, 23, 14, 23, 'x'); rect(15, 19, 23, 23, '#'); rect(33, 19, 33, 23, '#');
  rect(24, 20, 32, 23, '~'); rect(25, 22, 31, 22, '>'); rect(25, 23, 30, 23, '<');
  put(19, 18, 'o'); put(17, 18, 't'); put(21, 18, 'c'); put(16, 18, 'b'); put(23, 18, 'b');
  /* ledges */
  rect(11, 15, 16, 15, '='); rect(19, 12, 26, 12, '='); rect(26, 16, 30, 16, '-');
  rect(13, 10, 15, 10, 'm');
  /* the right side: a block with briars under it, a pillar with a breakable foot, a lever, the Peddler */
  rect(34, 14, 37, 17, '#'); rect(35, 18, 36, 23, '|'); rect(40, 10, 41, 19, 'K'); rect(40, 20, 41, 23, '%');
  put(36, 13, 'k'); put(34, 23, 'v'); put(43, 23, 'h'); put(38, 23, 'P'); put(44, 15, 'y');
  /* glooms and things in the air */
  put(12, 7, 's'); put(14, 4, 'd'); put(27, 3, 'l'); put(24, 11, '*'); put(33, 6, 'L'); put(42, 6, 'C'); put(5, 10, 'A'); put(20, 8, 'V'); put(28, 9, 'N');
  if (o.more) { put(22, 6, 's'); put(9, 6, 's'); put(38, 5, 's'); put(18, 6, 's'); put(30, 13, 's'); }
  const id = 'zz_' + area + (o.tag || '');
  const def = { id, area, name: 'Test ' + area, cx: 300, cy: 300, cw: 3, ch: 3, map: g.map(r => r.join('')), dark: o.dark ? 1 : 0,
    signs: ['Rest at Watering Spots: your leaves grow back.'], charms: ['long'], ability: 'glow', gates: ['lever'], plats: [[3, 0, 200]],
    wind: area === 'cloud' ? [[16, 4, 12, 6, 0.8, 0, 0]] : [] };
  RL.World.rooms[id] = def; if (!RL.World.list.includes(def)) RL.World.list.push(def);
  return def;
}
function mkSim(def, o) {
  o = o || {};
  const save = RL.Sim.newSave(1, false); save.started = 1; save.spot = { room: def.id, x: 110, y: 300 }; save.dew = o.dew == null ? 137 : o.dew;
  Object.assign(save.ab, o.ab || {}); if (o.vessels) save.vessels = o.vessels; if (o.worn) { save.charms.bark = 1; save.worn = ['bark']; }
  const s = new RL.Sim({ save, players: o.players || 1 }); s.enterRoom(def.id, 110, 300, { spot: true }); s.fade = 0; s.fadeTo = 0;
  RL.Render.room(s);
  return s;
}
function step(s, n, mask) { for (let i = 0; i < n; i++) { s.step([mask || 0, 0]); for (const e of s.events) RL.Render.fx(s, e); RL.Render.tick(s); } }
function setColour(s, c) { s.room.colour = c; s.room.colourWant = c; }
function draw(s, o) {
  o = o || {};
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 640, 360);
  const cam = o.cam || camQ() || { x: s.cam.x, y: s.cam.y };
  RL.Render.frame(ctx, { sim: s, cam, t: o.t || s.t, fade: 0, shake: 0, flash: 0 });
  if (o.hud !== false) RL.Render.hud(ctx, { sim: s, t: o.t || s.t, touch: !!o.touch, two: s.players.length > 1, prompt: o.prompt || null, msg: o.msg || null, cam });
}
function camQ() { const c = Q.get('cam'); if (!c) return null; const [x, y] = c.split(',').map(Number); return { x, y }; }
function bloomSome(s, n, kinds) { let k = 0; for (const f of s.room.foes) if (f.alive && (!kinds || kinds.includes(f.kind)) && k < n) { s.bloom(f); k++; } for (const e of s.events) RL.Render.fx(s, e); s.events = []; }
function openBuds(s) { for (const b of s.room.buds.slice()) s.openBud(b); for (const e of s.events) RL.Render.fx(s, e); s.events = []; }
const T0 = performance.now();
function done() { out.ms = +(performance.now() - T0).toFixed(1); out.stats = RL.Render.stats(); document.title = 'ready'; }

/* ---------- the cases ---------- */
const AREAS = ['rootgate', 'mossy', 'glowcap', 'pipes', 'crystal', 'cloud', 'heart'];
const SC = {};
function areaCase(area, colour, o) {
  o = o || {};
  const def = mk(area, o), s = mkSim(def, o);
  step(s, 40);
  if (o.bloom) { bloomSome(s, o.bloom); openBuds(s); step(s, 30); }
  setColour(s, colour);
  if (o.burst) { bloomSome(s, 2, ['smog', 'thorn', 'cog']); step(s, o.burst); setColour(s, colour); }
  draw(s, o);
  return s;
}
for (const a of AREAS) SC[a] = () => areaCase(a, 1, { bloom: 3 });
SC.grey = () => areaCase(Q.get('area') || 'mossy', 0.12);
SC.half = () => areaCase(Q.get('area') || 'mossy', 0.55, { bloom: 2 });
SC.bloom = () => areaCase(Q.get('area') || 'mossy', 0.6, { burst: +(Q.get('n') || 8) });
SC.states = () => {   /* crumbling, gone and regrowing ledges, briars shrinking, a cracked wall, a half-open gate */
  const def = mk(Q.get('area') || 'mossy', { tag: 's' }), s = mkSim(def); step(s, 20); const r = s.room;
  const w = r.w; r.crumble.set(16 * w + 27, { st: 'shake', t: 24 }); r.crumble.set(16 * w + 28, { st: 'gone', t: 40 }); r.crumble.set(16 * w + 29, { st: 'gone', t: 168 });
  for (let y = 18; y <= 23; y++) for (let x = 35; x <= 36; x++) r.briar[y * w + x] = (y - 18) / 5;
  if (r.breaks[0]) { r.breaks[0].hp = 1; r.breaks[0].hurt = 0; }
  if (r.gates[0]) { r.gates[0].o = 0.5; }
  setColour(s, 1); draw(s, { cam: camQ() || { x: 300, y: 180 }, t: 100 });
};
SC.burst = () => {   /* one bloom, n ticks later, close up */
  const def = mk('mossy', { tag: 'b' }), s = mkSim(def); step(s, 10); setColour(s, 0.5);
  const f = s.room.foes.find(q => q.kind === 'cog'); s.bloom(f); for (const e of s.events) RL.Render.fx(s, e); s.events = [];
  step(s, +(Q.get('n') || 6)); setColour(s, 0.5);
  draw(s, { cam: { x: f.x - 320, y: f.y - 200 } });
};
SC.guard = () => {   /* a guardian arena, awake, with a hazard warning; &calm=n: calmed n ticks ago */
  const area = Q.get('area') || 'mossy', def = mk(area, { tag: 'g' }); def.map = def.map.slice(); const row = def.map[22].split(''); row[30] = 'G'; def.map[22] = row.join(''); def.guardian = Q.get('g') || 'knot';
  const s = mkSim(def); step(s, 10); const g = s.room.guard; g.awake = true; g.st = 'idle'; s.hazard('spike', 380, 440, 60, 20, 30, 40); s.hazard('zap', 520, 300, 30, 160, 0, 40); s.room.hazards[1].live = true;
  if (Q.get('calm')) { s.calmGuard(g); for (const e of s.events) RL.Render.fx(s, e); s.events = []; step(s, +Q.get('calm')); }
  setColour(s, Q.get('calm') ? 1 : 0.3); draw(s, { cam: { x: g.x - 320, y: g.y - 200 } });
};
SC.dark = () => areaCase('glowcap', 1, { dark: 1, tag: 'd' });
SC.darkglow = () => areaCase('glowcap', 1, { dark: 1, tag: 'd', ab: { glow: 1 }, bloom: 2 });
SC.hud1 = () => { const s = areaCase('rootgate', 0.8, { vessels: 2, worn: 1, msg: 'Your leaves grew back. Your garden is saved.' }); const p = s.players[0]; p.sun = 80; p.leaves = 4; setColour(s, 0.8); draw(s, { prompt: { text: '↑ Rest', x: 110, y: 300 - 44 }, msg: 'Your leaves grew back. Your garden is saved.' }); };
SC.hud2 = () => { const def = mk('crystal'), s = mkSim(def, { players: 2 }); step(s, 30); s.players[1].leaves = 2; s.players[0].sun = 40; s.players[1].sun = 99; setColour(s, 1); draw(s, { prompt: { text: '↑ Talk', x: 38 * 20 + 10, y: 24 * 20 - 70 }, cam: { x: 320, y: 180 } }); };
SC.wide = () => {   /* the whole room at R = 1, four quadrants */
  RL.Render.init(1, false); if (RL.Art && RL.Art.init) RL.Art.init(1, false);
  const area = Q.get('area') || 'mossy', def = mk(area, { dark: Q.get('dark') ? 1 : 0, tag: 'w' }), s = mkSim(def, { ab: { glow: Q.get('glow') ? 1 : 0 } }); step(s, 40); bloomSome(s, 3); step(s, 20); setColour(s, +(Q.get('col') || 1));
  cv.width = 1280; cv.height = 720;
  for (const [qx, qy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { ctx.setTransform(1, 0, 0, 1, qx * 640, qy * 360); RL.Render.frame(ctx, { sim: s, cam: { x: qx * 640 - 160, y: qy * 360 - 90 }, t: s.t, fade: 0, shake: 0, flash: 0 }); }
};
SC.perf = () => {   /* a busy room: 120 frames timed in JS, then 120 real animation frames */
  const area = Q.get('area') || 'glowcap', def = mk(area, { dark: Q.get('dark') === '0' ? 0 : area === 'glowcap' ? 1 : 0, tag: 'p', more: 1 }), s = mkSim(def, { ab: { glow: 1 } }); step(s, 30);
  setColour(s, 0.5);
  const N = 120, tick = [], fr = [];
  const busy = i => { if (i % 15 === 0) { bloomSome(s, 1); s.room.foes.forEach(f => { if (!f.alive) { f.alive = true; f.hp = f.maxHp; } }); } };
  const cam = i => ({ x: 160 + Math.sin(i * 0.05) * 150, y: 120 + Math.cos(i * 0.04) * 60 });
  for (let i = 0; i < N; i++) { busy(i); const a = performance.now(); step(s, 1); const b = performance.now(); draw(s, { cam: cam(i) }); const c = performance.now(); tick.push(b - a); fr.push(c - b); }
  const avg = v => +(v.reduce((p, q) => p + q, 0) / v.length).toFixed(2), mx = v => +Math.max(...v).toFixed(2), med = v => +v.slice().sort((p, q) => p - q)[v.length >> 1].toFixed(2);
  out.perf = { R, frames: N, tickAvg: avg(tick), frameAvg: avg(fr), frameMed: med(fr), frameMax: mx(fr), parts: RL.Render.stats().parts };
  out.async = true; let i = 0, t0 = 0; const gaps = [], js = [];
  const loop = now => { if (i === 0) t0 = now; else gaps.push(now - t0), t0 = now; if (i++ >= N) { out.perf.rafAvg = avg(gaps); out.perf.rafMax = mx(gaps); out.perf.rafJs = avg(js); out.perf.over20 = gaps.filter(g => g > 20).length; done(); return; } busy(i); const a = performance.now(); step(s, 1); draw(s, { cam: cam(i) }); js.push(performance.now() - a); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
};
/* ---------- screens ---------- */
const scr = (name, S, under) => { ctx.setTransform(R, 0, 0, R, 0, 0); ctx.fillStyle = '#1b1530'; ctx.fillRect(0, 0, 640, 360); if (under) under(); RL.Render.screen(ctx, name, S); };
const playUnder = () => { const def = mk('mossy', { tag: 'u' }), s = mkSim(def); step(s, 20); bloomSome(s, 3); step(s, 10); setColour(s, 0.7); draw(s); return s; };
const T = +(Q.get('t') || 400);
SC.title = () => scr('title', { t: T, sel: 0, rows: [{ label: 'Play', sub: 'one player' }, { label: 'Play together', sub: 'two on one keyboard or two pads' }, { label: 'Leave', sub: 'back to the arcade' }], sound: true, music: false, touch: false, keys: [['One player', 'Arrows + Z jump, X swing, C dash, A focus   or   WASD + J, K, L, I'], ['Two players', 'SPRIG: WASD + F G H T   ·   MARIGOLD: arrows + J K L I'], ['', 'Up at a Watering Spot: rest   ·   Tab or M: map   ·   Esc: pause']], note: '' });
SC.slots = () => scr('slots', { t: T, sel: 1, erase: -1, rows: [{ empty: false, n: 1, name: 'Mossy Hollows', room: 'Fernway', pct: 23, time: '1h 04m', leaves: 6, maxLeaves: 6, dew: 212, gentle: false, ab: { dash: 1, grip: 0, puff: 0, glow: 0, beam: 0 } }, { empty: false, n: 2, name: 'Glowcap Caves', room: 'Dark Hollow', pct: 61, time: '3h 12m', leaves: 8, maxLeaves: 8, dew: 1043, gentle: true, ab: { dash: 1, grip: 1, puff: 0, glow: 1, beam: 0 } }, { empty: true, n: 3 }] });
SC.newgame = () => scr('newgame', { t: T, sel: 1 });
SC.story0 = () => scr('story', { t: T, page: 0 }); SC.story1 = () => scr('story', { t: T, page: 1 }); SC.story2 = () => scr('story', { t: 60, page: 2 });
SC.pause = () => scr('pause', { t: T, sel: 2, rows: ['Resume', 'Map', 'Seed charms', 'Gentle: off', 'Sound: on', 'Music: on', 'Save and go to the title', 'Leave the game'], gentle: false }, playUnder);
SC.map = () => { const W = RL.World, rooms = []; const fake = [['a', 'mossy', 12, 0, 4, 2, 1], ['b', 'mossy', 8, 0, 4, 2], ['c', 'mossy', 2, 0, 6, 2], ['d', 'mossy', 8, -2, 4, 2], ['e', 'mossy', 12, 2, 2, 4], ['f', 'mossy', 10, 4, 2, 2], ['g', 'mossy', 6, 4, 4, 2], ['h', 'mossy', 2, 4, 4, 2], ['i', 'rootgate', 16, 0, 4, 2], ['j', 'glowcap', 2, 6, 4, 2]];
  for (const [id, area, cx, cy, cw, ch, here] of fake) rooms.push({ id, x: cx * 16, y: cy * 9, w: cw * 16, h: ch * 9, area, here: !!here, doors: [{ side: 'W', at: 11, len: 4 }, { side: 'E', at: 11, len: 4 }, { side: 'S', at: 8, len: 4 }], spot: id === 'f', peddler: id === 'i', guard: id === 'h' ? 'knot' : null, calm: false });
  scr('map', { t: T, rooms, areas: W.areas, me: [{ x: 12 * 16 + 20, y: 13 }], puddle: { x: 8 * 16 + 30, y: 12 }, area: 'mossy' }, playUnder); };
SC.charms = () => { const s = RL.World; const list = s.charmOrder.map((id, i) => ({ id, name: s.charms[id].name, desc: s.charms[id].desc, cost: s.charms[id].cost, owned: i < 7, worn: i === 0 || i === 3 })); scr('charms', { t: T, sel: 0, list, notches: 4, used: 3, edit: true, line: '' }, playUnder); };
SC.shop = () => { const s = RL.World; const list = s.shop.slice(0, 9).map((it, i) => ({ id: it.id, name: it.name, desc: it.desc, price: it.price, kind: it.kind, charm: it.charm, sold: i === 1 })); scr('shop', { t: T, sel: 2, list, dew: 74, line: 'Have a look, little one. Everything is for dew drops.' }, playUnder); };
SC.dialog = () => scr('dialog', { t: T, who: 'peddler', name: 'The Peddler', text: 'Well now, a little sprout, all the way down here! The garden up top has gone grey, has it? Then the Heartseed must be poorly.', more: true }, playUnder);
SC.sign = () => scr('dialog', { t: T, who: 'sign', name: '', text: 'Swing at glooms to bloom them back into flowers. Every bloom brings a little colour home.', more: false }, playUnder);
SC.hearttalk = () => scr('dialog', { t: T, who: 'heart', name: 'The Heartseed', text: 'Thank you, little sprout. I feel warm again.', more: false }, playUnder);
SC.get = () => scr('get', { t: T, kind: 'ability', id: 'dash', title: 'LEAF DASH', text: 'Press C or L to dash, even in the air.', keys: ['C', 'L'] }, playUnder);
SC.area = () => scr('area', { t: +(Q.get('t') || 90), name: 'Mossy Hollows', sub: 'soft and green, once' }, playUnder);
SC.faint = () => scr('faint', { t: T }, playUnder);
SC.ending = () => scr('ending', { t: +(Q.get('t') || 700), stats: { time: '4h 31m', pct: 87, life: 5, charms: 9 } });
SC.msg = () => scr('msg', { text: 'A secret way!\nThe roots open up behind the wall.' }, playUnder);
SC.touch = () => { const s = playUnder(); RL.Render.hud(ctx, { sim: s, t: s.t, touch: true, two: false, msg: 'You can swing at glooms!', cam: s.cam }); RL.Render.screen(ctx, 'touch', { band: null, stick: { x: 86, y: 280, r: 52 }, knob: { x: 120, y: 270, ox: 86, oy: 280 }, btn: [{ id: 'jump', label: 'JUMP', x: 578, y: 302, r: 34, down: true }, { id: 'swing', label: 'SWING', x: 500, y: 316, r: 28 }, { id: 'dash', label: 'DASH', x: 564, y: 224, r: 25 }, { id: 'focus', label: 'FOCUS', x: 490, y: 244, r: 25 }, { id: 'map', label: 'MAP', x: 528, y: 22, r: 15 }, { id: 'pause', label: 'II', x: 568, y: 22, r: 15 }] }); };
SC.band = () => { cv.height = 560 * R; cv.style.height = 560 * 2 + 'px'; ctx.setTransform(R, 0, 0, R, 0, 0); ctx.fillStyle = '#1b1530'; ctx.fillRect(0, 0, 640, 560); const s = playUnder(); RL.Render.screen(ctx, 'band', { y: 360, h: 200, W: 640 }); RL.Render.screen(ctx, 'touch', { band: { y: 360, h: 200 }, stick: { x: 110, y: 460, r: 56 }, knob: null, btn: [{ id: 'jump', label: 'JUMP', x: 560, y: 491, r: 35 }, { id: 'swing', label: 'SWING', x: 460, y: 502, r: 31 }, { id: 'dash', label: 'DASH', x: 540, y: 407, r: 27 }, { id: 'focus', label: 'FOCUS', x: 440, y: 426, r: 27 }, { id: 'map', label: 'MAP', x: 280, y: 386, r: 20 }, { id: 'pause', label: 'II', x: 360, y: 386, r: 20, down: true }] }); void s; };

try { (SC[CASE] || SC.mossy)(); } catch (e) { out.errors.push(String(e && e.stack || e)); }
if (!out.async) done();
})();
