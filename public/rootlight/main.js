/* ROOTLIGHT — main.js (MAIN): the fixed 60 Hz loop, layout and render scale, input (keyboard for one or two, gamepads,
   touch), the screens (title, save slots, new game, story, play, pause, map, charms, the Peddler's shop, dialogs, the
   ability cards, the ending), saves in localStorage ('root-save-1..3'), sound and music settings ('root-mute', 'root-music'),
   the parent-page protocol and the window.__rl debug handle. Rules: sim.js. Rooms: world.js. Drawing: render.js + art.js.
   Online play is net.js's (feature-checked: RL.Net); it plugs into RL.Main.hooks (marked NET HOOK).
   ?mute=1 never touches audio or storage. ?debug=1 shows fps. ?bot=1 lets the test bot play. */
'use strict';
(function () {
const RL = window.RL = window.RL || {};
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search), SILENT = Q.get('mute') === '1', DEBUG = Q.get('debug') === '1';
const W = RL.World, IN = RL.IN, VW = 640, VH0 = 360;
const now = () => performance.now(), clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const store = { get(k) { if (SILENT) return null; try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { if (SILENT) return; try { localStorage.setItem(k, String(v)); } catch (_) {} }, del(k) { if (SILENT) return; try { localStorage.removeItem(k); } catch (_) {} } };
const errors = [];
function report(e) { const m = String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '); if (errors.length < 40 && errors.indexOf(m) < 0) { errors.push(m); console.error('[rootlight]', e); } }
const RD = () => RL.Render || {}, NT = () => RL.Net || {};

/* ---------- sound and music ---------- */
let muted = SILENT || store.get('root-mute') === '1', musicOn = store.get('root-music') !== '0', unlocked = false, curMusic = '', curV = -1;
function au(fn, a, b) { if (SILENT) return; const A = RL.Audio; if (A && typeof A[fn] === 'function') try { A[fn](a, b); } catch (e) { report(e); } }
function unlock() { if (!SILENT && !unlocked) { unlocked = true; au('unlock'); au('mute', muted); au('musicOn', musicOn); curMusic = ''; } }
function sfx(n, a) { if (!muted) au('play', n, a); }
function music(n, v) { v = v || 0; if (n === curMusic && Math.abs(v - curV) < 0.01) return; curMusic = n; curV = v; au('music', n || null, v); }
function post(o) { const N = NT(); if (N.post) { try { N.post(o); } catch (e) { report(e); } return; } try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} }
function setMute(on, quiet) { muted = !!on; if (SILENT) return; au('mute', muted); store.set('root-mute', muted ? 1 : 0); if (!quiet) post({ ty: 'mute', on: muted }); }
function setMusic(on, quiet) { musicOn = !!on; if (SILENT) return; au('musicOn', musicOn); store.set('root-music', musicOn ? 1 : 0); if (!quiet) post({ ty: 'music', on: musicOn }); }
au('mute', muted); au('musicOn', musicOn);

/* ---------- layout: a 640 x 360 view, letterboxed; a phone held upright gets a control band below ---------- */
const BUCK = [1, 1.5, 2, 2.5, 3, 4];
let LW = VW, LH = VH0, VH = VH0, S = 1, R = 2, OX = 0, OY = 0, coarse = false, low = false, padMode = false;
function layout() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = devicePixelRatio || 1;
  coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  low = coarse && Math.min(w, h) < 560;
  padMode = coarse && h / w > 1.15;
  LW = VW; VH = VH0; LH = padMode ? Math.max(560, Math.round(VW * h / w)) : VH0;
  S = Math.min(w / LW, h / LH);
  const want = S * dpr, cap = coarse ? 2.5 : 4;
  let r = BUCK[0]; for (const b of BUCK) if (b <= cap && Math.abs(b - want) <= Math.abs(r - want)) r = b;
  const cw = Math.round(LW * r), ch = Math.round(LH * r);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.width = LW * S + 'px'; cv.style.height = LH * S + 'px';
  OX = (w - LW * S) / 2; OY = (h - LH * S) / 2; cv.style.left = OX + 'px'; cv.style.top = OY + 'px';
  if (r !== R || !layout.done) { R = r; layout.done = 1; const D = RD(); if (D.init) try { D.init(R, low); } catch (e) { report(e); } if (RL.Art && RL.Art.init) try { RL.Art.init(R, low); } catch (e) { report(e); } }
  touchLayout();
}

/* ---------- state ---------- */
let screen = 'title', sel = 0, scrT = 0, ut = 0, sim = null, players = 1, slot = 1, over = null, overSel = 0, overT = 0, paused = false;
let touchMode = false, forceVis = false, areaCard = null, toastMsg = null, toastT = 0, pendingStart = null, eraseArm = -1, storyPage = 0, endT = 0, lastCalm = 0;
const queue = [];   /* overlays waiting their turn (a 'get' card after a dialog, ...) */
function go(s) { screen = s; sel = 0; scrT = 0; slotCache = null; endStats = null; }
let endStats = null;
function toast(text, ms) { toastMsg = text; toastT = Math.round((ms || 3200) / 1000 * 60); }

/* ---------- saves ---------- */
function loadSlot(n) { const v = store.get('root-save-' + n); if (!v) return null; try { const s = JSON.parse(v); return s && typeof s === 'object' ? s : null; } catch (_) { return null; } }
function writeSave() { if (!sim || sim.noSave) return; try { store.set('root-save-' + sim.save.slot, JSON.stringify(sim.save)); } catch (e) { report(e); } }
let slotCache = null;
function slotRows() {
  if (slotCache) return slotCache;
  const rows = [];
  for (let n = 1; n <= 3; n++) {
    const s = loadSlot(n);
    if (!s) { rows.push({ empty: true, n }); continue; }
    const fx = RL.Sim.fixSave(s), st = RL.Sim.stats(fx), d = W.rooms[fx.spot && fx.spot.room] || W.rooms[fx.room];
    let pct = 0; try { pct = RL.Sim.prototype.pct.call({ save: fx, W }); } catch (_) {}
    rows.push({ empty: false, n, name: d ? (W.areas[d.area] || {}).name : 'Rootgate', room: d ? d.name : '', pct, time: fmtTime(fx.time), leaves: st.maxLeaves, maxLeaves: st.maxLeaves, dew: fx.dew, gentle: fx.gentle, ab: Object.assign({}, fx.ab), done: !!fx.done });
  }
  return (slotCache = rows);
}
function fmtTime(t) { const s = Math.floor(t / 60), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? h + 'h ' + String(m).padStart(2, '0') + 'm' : m + 'm ' + String(s % 60).padStart(2, '0') + 's'; }

function startGame(n, o) {
  o = o || {};
  slot = n;
  let save = o.save || (o.fresh ? null : loadSlot(n));
  if (!save) { save = RL.Sim.newSave(n, !!o.gentle); }
  save.slot = n;
  const H = RL.Main.hooks;
  const opts = { save, players: o.players || players, seed: (Date.now() >>> 0) };
  if (H.simOpts) try { H.simOpts(opts); } catch (e) { report(e); }   /* NET HOOK: online roles */
  sim = new RL.Sim(opts);
  if (H.simMade) try { H.simMade(sim); } catch (e) { report(e); }
  if (o.noSave) sim.noSave = true;
  over = null; queue.length = 0; paused = false; areaCard = null;
  const D = RD(); if (D.room) try { D.room(sim); } catch (e) { report(e); }
  go('play');
  writeSave();
  if (o.fresh) { areaCard = { name: 'ROOTLIGHT', sub: 'the garden above has gone grey', t: 0 }; }
}
function quitToTitle() { if (sim) writeSave(); sim = null; over = null; queue.length = 0; paused = false; go('title'); music('title'); }

/* ---------- input: keyboard ---------- */
const held = new Set(); let hits = [], wasdAt = 0, arrowAt = 0;
const GAMEKEY = /^(Arrow|Space$|Tab$|Enter$|Slash$|Quote$|Semicolon$)/;
addEventListener('keydown', e => {
  const c = e.code || e.key || '';
  if (GAMEKEY.test(c) || (screen === 'play' && /^Key/.test(c))) e.preventDefault();
  unlock(); touchMode = false;
  if (/^Arrow/.test(c)) arrowAt = now(); else if (c === 'KeyW' || c === 'KeyS' || c === 'KeyD') wasdAt = now();
  held.add(c); if (!e.repeat) hits.push(c);
});
addEventListener('keyup', e => held.delete(e.code || e.key || ''));
addEventListener('blur', () => held.clear());
const any = (...ks) => ks.some(k => held.has(k));
/* one player: arrows + Z X C A, or WASD + J K L I (A means Left once you have used W, S or D, and Focus with the arrows).
   two on one keyboard: SPRIG = WASD + F jump, G swing, H dash, T focus; MARIGOLD = arrows + J jump, K swing, L dash, I focus */
function keyMask(p) {
  let m = 0;
  if (players === 1) {
    const aLeft = wasdAt > arrowAt;
    if (any('ArrowLeft') || (aLeft && any('KeyA'))) m |= IN.L; if (any('ArrowRight', 'KeyD')) m |= IN.R; if (any('ArrowUp', 'KeyW')) m |= IN.U; if (any('ArrowDown', 'KeyS')) m |= IN.D;
    if (any('KeyZ', 'KeyJ', 'Space')) m |= IN.JUMP; if (any('KeyX', 'KeyK')) m |= IN.SWING; if (any('KeyC', 'KeyL', 'ShiftLeft', 'ShiftRight')) m |= IN.DASH;
    if (any('KeyI') || (!aLeft && any('KeyA'))) m |= IN.FOCUS;
  } else if (p === 0) {
    if (any('KeyA')) m |= IN.L; if (any('KeyD')) m |= IN.R; if (any('KeyW')) m |= IN.U; if (any('KeyS')) m |= IN.D;
    if (any('KeyF', 'Space')) m |= IN.JUMP; if (any('KeyG')) m |= IN.SWING; if (any('KeyH')) m |= IN.DASH; if (any('KeyT')) m |= IN.FOCUS;
  } else {
    if (any('ArrowLeft')) m |= IN.L; if (any('ArrowRight')) m |= IN.R; if (any('ArrowUp')) m |= IN.U; if (any('ArrowDown')) m |= IN.D;
    if (any('KeyJ', 'Slash')) m |= IN.JUMP; if (any('KeyK', 'Period')) m |= IN.SWING; if (any('KeyL', 'Comma')) m |= IN.DASH; if (any('KeyI', 'Semicolon')) m |= IN.FOCUS;
  }
  return m;
}
/* ---------- gamepads (standard mapping): A jump, X swing, RB/RT dash, B focus (Up + B or Y: Sunbeam), Back map, Start pause ---------- */
const padPrev = [0, 0, 0, 0];
const PB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
let pads = [];
function readPads() {
  pads = [];
  let list = []; try { list = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []; } catch (_) {}
  list.forEach((g, k) => {
    const b = i => !!(g.buttons[i] && (g.buttons[i].pressed || g.buttons[i].value > 0.5)), ax = g.axes[0] || 0, ay = g.axes[1] || 0;
    let m = 0;
    if (b(PB.LEFT) || ax < -0.4) m |= IN.L; if (b(PB.RIGHT) || ax > 0.4) m |= IN.R; if (b(PB.UP) || ay < -0.5) m |= IN.U; if (b(PB.DOWN) || ay > 0.5) m |= IN.D;
    if (b(PB.A)) m |= IN.JUMP; if (b(PB.X)) m |= IN.SWING; if (b(PB.RB) || b(PB.RT) || b(PB.LT)) m |= IN.DASH; if (b(PB.B)) m |= IN.FOCUS;
    if (b(PB.Y)) m |= IN.FOCUS | IN.U;
    let bits = 0; for (let i = 0; i < 16; i++) if (b(i)) bits |= 1 << i;
    const pressed = bits & ~(padPrev[k] || 0); padPrev[k] = bits;
    if (pressed) { unlock(); touchMode = false; }
    pads.push({ m, pressed, bits });
  });
}
function padFor(p) { if (players === 1) return pads.reduce((m, q) => m | q.m, 0); if (pads.length >= 2) return pads[p] ? pads[p].m : 0; if (pads.length === 1) return p === 1 ? pads[0].m : 0; return 0; }
/* menu keys from pads: a press becomes a key code */
function padHits() {
  for (const q of pads) {
    const pr = q.pressed;
    if (pr & (1 << PB.A)) hits.push('Enter'); if (pr & (1 << PB.B)) hits.push('Backspace'); if (pr & (1 << PB.START)) hits.push('Escape'); if (pr & (1 << PB.BACK)) hits.push('Tab');
    if (pr & (1 << PB.UP)) hits.push('ArrowUp'); if (pr & (1 << PB.DOWN)) hits.push('ArrowDown'); if (pr & (1 << PB.LEFT)) hits.push('ArrowLeft'); if (pr & (1 << PB.RIGHT)) hits.push('ArrowRight');
  }
}
/* ---------- touch: a stick on the left, buttons on the right ---------- */
const TP = new Map(); let TL = null, stick = null;
function touchLayout() {
  const band = padMode ? { y: VH, h: LH - VH } : null;
  if (band) {
    const cy = VH + band.h * 0.5, r = Math.min(64, band.h * 0.28);
    TL = { band, stick: { x: 110, y: cy, r }, btn: [
      { id: 'jump', label: 'JUMP', x: LW - 80, y: cy + r * 0.55, r: r * 0.62 }, { id: 'swing', label: 'SWING', x: LW - 180, y: cy + r * 0.75, r: r * 0.55 },
      { id: 'dash', label: 'DASH', x: LW - 100, y: cy - r * 0.95, r: r * 0.48 }, { id: 'focus', label: 'FOCUS', x: LW - 200, y: cy - r * 0.6, r: r * 0.48 },
      { id: 'map', label: 'MAP', x: LW / 2 - 40, y: VH + 26, r: 20 }, { id: 'pause', label: 'II', x: LW / 2 + 40, y: VH + 26, r: 20 }] };
  } else {
    TL = { band: null, stick: { x: 86, y: VH - 80, r: 52 }, btn: [
      { id: 'jump', label: 'JUMP', x: LW - 62, y: VH - 58, r: 34 }, { id: 'swing', label: 'SWING', x: LW - 140, y: VH - 44, r: 28 },
      { id: 'dash', label: 'DASH', x: LW - 76, y: VH - 136, r: 25 }, { id: 'focus', label: 'FOCUS', x: LW - 150, y: VH - 116, r: 25 },
      { id: 'map', label: 'MAP', x: LW - 112, y: 22, r: 15 }, { id: 'pause', label: 'II', x: LW - 72, y: 22, r: 15 }] };
  }
}
function touchMask() {
  let m = 0;
  for (const z of TP.values()) {
    if (z.kind === 'stick') { const dx = z.x - z.ox, dy = z.y - z.oy, d = Math.hypot(dx, dy); if (d > 9) { if (dx < -d * 0.38) m |= IN.L; if (dx > d * 0.38) m |= IN.R; if (dy < -d * 0.5) m |= IN.U; if (dy > d * 0.6) m |= IN.D; } }
    else if (z.id === 'jump') m |= IN.JUMP; else if (z.id === 'swing') m |= IN.SWING; else if (z.id === 'dash') m |= IN.DASH; else if (z.id === 'focus') m |= IN.FOCUS;
  }
  return m;
}
const toL = e => [(e.clientX - OX) / S, (e.clientY - OY) / S];
function btnAt(x, y) { if (!TL) return null; for (const b of TL.btn) if (Math.hypot(x - b.x, y - b.y) < b.r + 8) return b; return null; }
document.addEventListener('pointerdown', e => {
  unlock(); try { cv.focus({ preventScroll: true }); } catch (_) {}
  if (e.pointerType !== 'mouse') touchMode = true;
  if (e.cancelable && e.pointerType !== 'mouse') e.preventDefault();
  const [x, y] = toL(e);
  if (screen === 'play' && !over && !paused && sim && e.pointerType !== 'mouse') {
    const b = btnAt(x, y);
    if (b && b.id === 'map') { openOver('map'); return; } if (b && b.id === 'pause') { openPause(); return; }
    if (b) { TP.set(e.pointerId, { kind: 'btn', id: b.id }); return; }
    if (x < LW * 0.45) { TP.set(e.pointerId, { kind: 'stick', ox: x, oy: y, x, y }); stick = TP.get(e.pointerId); return; }
    TP.set(e.pointerId, { kind: 'btn', id: 'jump' }); return;
  }
  tap(x, y);
}, { passive: false });
document.addEventListener('pointermove', e => { const z = TP.get(e.pointerId); if (z && z.kind === 'stick') { const [x, y] = toL(e); z.x = x; z.y = y; const d = Math.hypot(x - z.ox, y - z.oy), mx = (TL && TL.stick.r) || 50; if (d > mx * 1.4) { z.ox = x - (x - z.ox) * mx * 1.4 / d; z.oy = y - (y - z.oy) * mx * 1.4 / d; } } }, { passive: true });
const pUp = e => { const z = TP.get(e.pointerId); if (z === stick) stick = null; TP.delete(e.pointerId); };
document.addEventListener('pointerup', pUp); document.addEventListener('pointercancel', pUp);
document.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
function inR(r, x, y) { return !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
function tap(x, y) {
  const H = RL.Main.hooks; if (H.tap && H.tap(x, y)) return;   /* NET HOOK */
  const U = RD().UI || {};
  if (U.chips) { if (inR(U.chips[0], x, y)) { setMute(!muted); sfx('select'); return; } if (inR(U.chips[1], x, y)) { setMusic(!musicOn); sfx('select'); return; } }
  if (U.back && inR(U.back, x, y)) { onKey('Escape'); return; }
  const rows = U.rows || [];
  for (let i = 0; i < rows.length; i++) if (inR(rows[i], x, y)) { if (over) overSel = i; else sel = i; onKey('Enter'); return; }
  if (over && (over.name === 'dialog' || over.name === 'get' || over.name === 'map')) { onKey('Enter'); return; }
  if (screen === 'story' || screen === 'ending') onKey('Enter');
}

/* ---------- overlays over play ---------- */
function openOver(name, data) {
  if (over) { queue.push([name, data]); return; }
  over = Object.assign({}, data || {}, { name }); overSel = 0; overT = 0;
  if (sim) sim.freeze = !over.live && !liveNow();   /* online the garden never stops */
  if (name === 'map') sfx('map');
}
function closeOver() {
  const was = over; over = null; overT = 0;
  if (sim) sim.freeze = false;
  if (was && was.then) try { was.then(); } catch (e) { report(e); }
  if (queue.length) { const [n, d] = queue.shift(); openOver(n, d); }
}
function openPause() { if (over) return; paused = true; sel = 0; sfx('menu'); if (sim) sim.freeze = !liveNow(); }
function pauseRows() { return ['Resume', 'Map', 'Seed charms', 'Gentle: ' + (sim && sim.save.gentle ? 'on' : 'off'), 'Sound: ' + (muted ? 'off' : 'on'), 'Music: ' + (musicOn ? 'on' : 'off'), 'Save and go to the title', 'Leave the game']; }
function pauseChoose(i) {
  const H = RL.Main.hooks;
  if (i === 0) { paused = false; if (sim) sim.freeze = false; sfx('select'); }
  else if (i === 3 && liveNow() && RL.Net && RL.Net.role === 'guest') { sfx('nope'); }
  else if (i === 1) { paused = false; openOver('map'); }
  else if (i === 2) { paused = false; openOver('charms', { edit: isResting() }); }
  else if (i === 3) { if (sim) { sim.save.gentle = !sim.save.gentle; sim.applyStats(); writeSave(); } sfx('select'); }
  else if (i === 4) { setMute(!muted); sfx('select'); }
  else if (i === 5) { setMusic(!musicOn); sfx('select'); }
  else if (i === 6) { paused = false; if (H.quit) H.quit(); quitToTitle(); }
  else { paused = false; if (sim) writeSave(); post({ ty: 'exit' }); quitToTitle(); }
}
const isResting = () => !!(sim && sim.players.some(p => p.st === 'sit'));
function shopRows() { return sim ? sim.shopList() : []; }
function charmRows() { const s = sim.save; return W.charmOrder.map(id => ({ id, name: W.charms[id].name, desc: W.charms[id].desc, cost: W.charms[id].cost, owned: !!s.charms[id], worn: s.worn.indexOf(id) >= 0 })); }

/* ---------- keys ---------- */
const GO = c => c === 'Enter' || c === 'NumpadEnter' || c === 'Space' || c === 'KeyZ' || c === 'KeyJ' || c === 'KeyF';
const BACK = c => c === 'Escape' || c === 'Backspace' || c === 'KeyX' || c === 'KeyK';
const UPK = c => c === 'ArrowUp' || c === 'KeyW', DNK = c => c === 'ArrowDown' || c === 'KeyS', LFK = c => c === 'ArrowLeft' || c === 'KeyA', RTK = c => c === 'ArrowRight' || c === 'KeyD';
function titleRows() { return [{ label: 'Play', sub: 'one player' }, { label: 'Play together', sub: 'two on one keyboard or two pads' }, { label: 'Leave', sub: 'back to the arcade' }]; }
function onKey(c) {
  const H = RL.Main.hooks; if (H.key && H.key(c)) return;   /* NET HOOK */
  if (screen === 'title') {
    if (c === 'KeyM') { setMute(!muted); return; } if (c === 'KeyN') { setMusic(!musicOn); return; }
    const n = titleRows().length;
    if (c === 'Escape') { post({ ty: 'exit' }); return; }
    if (UPK(c)) { sel = (sel + n - 1) % n; sfx('menu'); } else if (DNK(c)) { sel = (sel + 1) % n; sfx('menu'); }
    else if (GO(c)) { sfx('select'); if (sel === 2) { post({ ty: 'exit' }); return; } players = sel === 1 ? 2 : 1; go('slots'); eraseArm = -1; }
    return;
  }
  if (screen === 'slots') {
    if (BACK(c) && c !== 'KeyX' && c !== 'KeyK') { sfx('back'); go('title'); return; }
    if (UPK(c)) { sel = (sel + 2) % 3; eraseArm = -1; sfx('menu'); } else if (DNK(c)) { sel = (sel + 1) % 3; eraseArm = -1; sfx('menu'); }
    else if (c === 'Delete' || c === 'KeyE' || c === 'KeyX') { const rows = slotRows(); if (!rows[sel].empty) { if (eraseArm === sel) { store.del('root-save-' + (sel + 1)); eraseArm = -1; slotCache = null; sfx('back'); } else { eraseArm = sel; sfx('menu'); } } }
    else if (GO(c)) { const rows = slotRows(); sfx('select'); eraseArm = -1; if (rows[sel].empty) { pendingStart = sel + 1; go('newgame'); } else startGame(sel + 1, { players }); }
    return;
  }
  if (screen === 'newgame') {
    if (BACK(c)) { sfx('back'); go('slots'); return; }
    if (UPK(c) || DNK(c) || LFK(c) || RTK(c)) { sel = 1 - sel; sfx('menu'); } else if (GO(c)) { sfx('select'); pendingStart = { n: pendingStart && pendingStart.n || pendingStart, gentle: sel === 1 }; storyPage = 0; go('story'); }
    return;
  }
  if (screen === 'story') {
    if (c === 'Escape') { beginFresh(); return; }
    if (GO(c) || RTK(c)) { if (scrT < 20) return; sfx('select'); storyPage++; scrT = 0; if (storyPage >= 3) beginFresh(); }
    return;
  }
  if (screen === 'ending') { if ((GO(c) || c === 'Escape') && scrT > 240) { sfx('select'); if (sim) { sim.save.done = 1; writeSave(); } quitToTitle(); } return; }
  if (screen !== 'play' || !sim) return;
  /* ---- play ---- */
  if (paused) {
    const rows = pauseRows();
    if (c === 'Escape' || c === 'KeyP' || c === 'Backspace') { paused = false; sim.freeze = !!over && !liveNow(); sfx('back'); return; }
    if (UPK(c)) { sel = (sel + rows.length - 1) % rows.length; sfx('menu'); } else if (DNK(c)) { sel = (sel + 1) % rows.length; sfx('menu'); }
    else if (GO(c)) pauseChoose(sel);
    else if (c === 'KeyM') { setMute(!muted); } else if (c === 'KeyN') setMusic(!musicOn);
    return;
  }
  if (over) return overKey(c);
  if (c === 'Escape' || c === 'KeyP') { openPause(); return; }
  if (c === 'Tab' || c === 'KeyM') { openOver('map'); return; }
  if (c === 'KeyN') { setMusic(!musicOn); toast(musicOn ? 'Music on' : 'Music off', 1200); return; }
}
function beginFresh() { const p = pendingStart || { n: 1 }; const n = typeof p === 'number' ? p : p.n || 1; startGame(n, { fresh: true, gentle: !!p.gentle, players }); }
function overKey(c) {
  const o = over, n = o.name;
  if (n === 'map') { if (c === 'Tab' || c === 'KeyM' || BACK(c) || GO(c)) { closeOver(); sfx('back'); } return; }
  if (n === 'dialog') {
    if (GO(c) || BACK(c) || UPK(c)) { if (overT < 12) return; o.i = (o.i || 0) + 1; overT = 0; sfx('talk'); if (o.i >= o.pages.length) closeOver(); }
    return;
  }
  if (n === 'get') { if ((GO(c) || BACK(c)) && overT > 50) { closeOver(); sfx('select'); } return; }
  if (n === 'shop') {
    const rows = shopRows(); const L = rows.length + 1;
    if (BACK(c)) { closeOver(); sfx('back'); return; }
    if (UPK(c)) { overSel = (overSel + L - 1) % L; sfx('menu'); } else if (DNK(c)) { overSel = (overSel + 1) % L; sfx('menu'); }
    else if (GO(c)) {
      if (overSel >= rows.length) { closeOver(); sfx('back'); return; }
      const r = sim.buy(rows[overSel].id);
      if (r === 'ok') { sfx('buy'); o.line = 'Thank you kindly! ' + (rows[overSel].kind === 'map' ? 'Press Tab or M to look at your map.' : rows[overSel].kind === 'charm' ? 'Wear it at a Watering Spot.' : 'There you go.'); writeSave(); }
      else if (r === 'poor') { sfx('nope'); o.line = W.peddler.poor; } else sfx('nope');
    }
    return;
  }
  if (n === 'charms') {
    const rows = charmRows(), cols = 4, N = rows.length;
    if (BACK(c) || c === 'Tab') { closeOver(); sfx('back'); writeSave(); return; }
    if (LFK(c)) overSel = (overSel + N - 1) % N; else if (RTK(c)) overSel = (overSel + 1) % N; else if (UPK(c)) overSel = (overSel + N - cols) % N; else if (DNK(c)) overSel = (overSel + cols) % N;
    if (LFK(c) || RTK(c) || UPK(c) || DNK(c)) { sfx('menu'); return; }
    if (GO(c)) {
      const r = rows[overSel]; if (!r || !r.owned) { sfx('nope'); return; }
      if (!o.edit) { sfx('nope'); o.line = 'Charms can be changed while resting at a Watering Spot.'; return; }
      if (sim.wear(r.id, !r.worn)) sfx(r.worn ? 'back' : 'charm'); else { sfx('nope'); o.line = 'Not enough notches for that one.'; }
    }
    return;
  }
}

/* ---------- sim events → sound, fx, overlays ---------- */
const SFX_EV = { jump: 'jump', swing: 'swing', hit: 'hit', bud: 'bud', heal: 'heal', dash: 'dash', cling: 'cling', walljump: 'walljump', puff: 'puff', beam: 'beam', pogo: 'pogo', crack: 'crack', break: 'break', lever: 'lever', switch: 'switch', splash: 'splash', vent: 'vent', crumble: 'crumble', spore: 'spore', charge: 'charge', rain: 'rain', zap: 'zap', slam: 'slam', ghit: 'ghit', revive: 'revive', bubble: 'bubble', block: 'clang', step: 'step', thorn: 'thorn', faint: 'faint', wind: 'wind', briar: 'gate' };
const KIND_FIRST = { hit: 1, bloom: 1, ghit: 1, gtell: 1, pop: 1, calm: 1, gstart: 1, gphase: 1, hazard: 1, bonk: 1, gate: 1 };
function netEv(e) { const n = e[1]; if (n === 'dew') return ['dew', 1, e[2], e[3]]; return KIND_FIRST[n] ? [n, n === 'calm' || n === 'gstart' ? '' : '', e[2], e[3], e[4]] : [n, e[2], e[3], e[4]]; }
function onEvents() {
  const s = sim; if (!s) return;
  for (let e of s.events) {
    if (e[0] === 'net') e = netEv(e);
    const D = RD(); if (D.fx) try { D.fx(s, e); } catch (er) { report(er); }
    const n = e[0];
    if (SFX_EV[n]) sfx(SFX_EV[n], e[1]);
    else if (n === 'land') { if (e[2] > 0.25) sfx('land', e[2]); }
    else if (n === 'bloom') sfx('bloom', e[4]);
    else if (n === 'hurt') sfx('hurt');
    else if (n === 'dew') sfx('dew');
    else if (n === 'bounce') sfx('bounce');
    else if (n === 'focus') sfx('focus', !!e[2]);
    else if (n === 'gate') sfx('gate');
    else if (n === 'pickup') sfx(e[1] === 'puddle' ? 'dewBig' : 'pickup');
    else if (n === 'gtell') sfx('gtell');
    else if (n === 'pop') sfx('hit');
    else if (n === 'calm') { sfx('calm'); music('calm'); lastCalm = ut; }
    else if (n === 'gstart') { sfx('rumble'); }
    if (n === 'talk') talkPeddler();
    else if (n === 'sign') openOver('dialog', { who: 'sign', pages: [String(e[1] || '')] });
    else if (n === 'rest') { sfx('save'); toast('Your leaves grew back. Your garden is saved.'); if (Object.keys(s.save.charms).length) openOver('charms', { edit: true }); }
    else if (n === 'get') getCard(e[1], e[2]);
    else if (n === 'area') { const a = W.areas[e[1]] || {}; areaCard = { name: a.name || '', sub: a.sub || '', t: 0 }; }
    else if (n === 'autosave') writeSave();
    else if (n === 'wake') { sfx('wake'); toast(s.save.puddle ? 'You woke up at the Watering Spot. Your dew is waiting where you nodded off.' : 'You woke up at the Watering Spot.', 4500); }
    else if (n === 'secret') { toast('A secret way!'); }
    else if (n === 'ending') { endT = ut; }
    else if (n === 'room') { const D2 = RD(); if (D2.room) try { D2.room(s); } catch (er) { report(er); } sfx('door'); }
  }
}
function talkPeddler() {
  const s = sim.save, P = W.peddler;
  if (!s.talked.peddler) {
    s.talked.peddler = 1; s.maps.rootgate = 1; writeSave();
    openOver('dialog', { who: 'peddler', pages: P.first, then: () => openOver('shop', { line: 'Have a look, little one. Everything is for dew drops.' }) });
  } else {
    const line = P.lines[(s.time / 600 | 0) % P.lines.length];
    openOver('shop', { line });
  }
  sfx('talk');
}
function getCard(kind, id) {
  const A = W.abilities[id], C = W.charms[id];
  let title = '', text = '', keys = [];
  if (kind === 'ability' && A) { title = A.name.toUpperCase(); text = (pads.length && A.pad) ? A.pad : A.how; sfx('ability'); }
  else if (kind === 'charm' && C) { title = C.name; text = C.desc + ' Wear seed charms at a Watering Spot.'; sfx('charm'); }
  else if (kind === 'life') { title = 'Life Seed'; text = id % 2 ? 'Find another and you will grow a new leaf.' : 'Two seeds together: you grew a new leaf!'; sfx('life'); }
  else if (kind === 'vessel') { title = 'Sun Vessel'; text = 'You can hold more Sunlight now.'; sfx('vessel'); }
  else if (kind === 'notch') { title = 'Charm Notch'; text = 'Room for another seed charm.'; sfx('notch'); }
  else return;
  openOver('get', { kind, id, title, text, keys });
}

/* ---------- the tick ---------- */
function masks() { const m = [0, 0]; for (let p = 0; p < players; p++) m[p] = keyMask(p) | padFor(p) | (p === 0 ? touchMask() : 0); return m; }
function tick() {
  ut++; scrT++; overT++;
  readPads(); padHits();
  const H = RL.Main.hooks;
  if (H.tick) try { H.tick(ut); } catch (e) { report(e); }   /* NET HOOK */
  const hk = hits; hits = [];
  for (const c of hk) onKey(c);
  if (toastT > 0) toastT--;
  if (areaCard) { areaCard.t++; if (areaCard.t > 220) areaCard = null; }
  if (screen === 'play' && sim) {
    const m = masks();
    if (over || paused) { m[0] = m[1] = 0; }
    if (H.masks) try { H.masks(m, !!(over || paused)); } catch (e) { report(e); }
    if (bot.on) bot.step(m);
    const D = RD();
    if (!sim.freeze || H.live && H.live()) { sim.step(m); onEvents(); if (D.tick) try { D.tick(sim); } catch (e) { report(e); } }
    if (sim.ending && !endT) endT = ut;
    if (endT && ut - endT > 300 && screen === 'play') { go('ending'); sim.save.done = 1; writeSave(); music('ending'); }
    musicWatch();
  } else if (screen === 'title' || screen === 'slots' || screen === 'newgame') music('title');
  else if (screen === 'story') music('rootgate');
}
function musicWatch() {
  const r = sim.room, g = r && r.guard;
  if (over && over.name === 'shop') return music('shop');
  if (ut - lastCalm < 420 && lastCalm) return;
  if (g && g.awake && !g.done) return music(g.kind === 'heart' ? 'final' : 'guardian', g.kind === 'heart' ? (g.phase - 1) / 2 : g.phase > 1 ? 0.7 : 0.2);
  music((W.areas[r.area] || {}).music || 'rootgate', 0);
}

/* ---------- drawing ---------- */
function frameF() { return { sim, cam: { x: sim.cam.x, y: sim.cam.y }, t: ut, fade: sim.fade, shake: sim.shake, flash: 0 }; }
function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.globalAlpha = 1;
  const D = RD(), t = ut;
  ctx.fillStyle = '#1b1530'; ctx.fillRect(0, 0, LW, LH);
  const scr = (name, S) => { if (D.screen) D.screen(ctx, name, S); else fallbackScreen(name, S); };
  if (screen === 'play' && sim) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, LW, VH); ctx.clip();
    if (D.frame) D.frame(ctx, frameF()); else fallbackFrame();
    const p0 = sim.players[0], pr = p0 && p0.prompt && !over && !paused ? { text: (touchMode ? '' : '↑ ') + p0.prompt, x: p0.near.x, y: p0.near.y - (p0.prompt === 'Talk' ? 70 : 44) } : null;
    if (D.hud) D.hud(ctx, { sim, t, touch: touchMode || coarse, two: players > 1, prompt: pr, msg: toastT > 0 ? toastMsg : null, cam: sim.cam }); else fallbackHud();
    if (areaCard) scr('area', { t: areaCard.t, name: areaCard.name, sub: areaCard.sub });
    ctx.restore();
    if (padMode) scr('band', { y: VH, h: LH - VH, W: LW });
    if ((touchMode || coarse) && !over && !paused) scr('touch', touchS());
    if (over) drawOver(scr);
    if (paused) scr('pause', { t: scrT, sel, rows: pauseRows(), gentle: sim.save.gentle });
  } else {
    if (padMode) scr('band', { y: VH, h: LH - VH, W: LW });
    if (screen === 'title') scr('title', { t: scrT + 200, sel, rows: titleRows(), sound: !muted, music: musicOn, touch: touchMode || coarse, keys: keysCard(), note: '' });
    else if (screen === 'slots') scr('slots', { t: scrT, sel, rows: slotRows(), erase: eraseArm, two: players > 1 });
    else if (screen === 'newgame') scr('newgame', { t: scrT, sel });
    else if (screen === 'story') scr('story', { t: scrT, page: storyPage });
    else if (screen === 'ending') { if (!endStats && sim) endStats = { time: fmtTime(sim.save.time), pct: sim.pct(), life: sim.save.life, charms: Object.keys(sim.save.charms).length }; scr('ending', { t: scrT, stats: endStats || {} }); }
  }
  if (RL.Main.hooks.draw) try { RL.Main.hooks.draw(ctx, LW, VH); } catch (e) { report(e); }   /* NET HOOK */
  if (DEBUG) { ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.fillText(fps + ' fps R' + R + ' ' + screen + (sim ? ' ' + sim.room.id : '') + (errors.length ? ' ERR ' + errors.length : ''), 6, LH - 6); }
}
function keysCard() {
  if (touchMode || coarse) return [['', 'Left side: move   ·   Right side: jump, swing, dash, focus']];
  return [['One player', 'Arrows + Z jump, X swing, C dash, A focus   or   WASD + J, K, L, I'], ['Two players', 'SPRIG: WASD + F G H T   ·   MARIGOLD: arrows + J K L I'], ['', 'Up at a Watering Spot: rest   ·   Tab or M: map   ·   Esc: pause']];
}
function touchS() { const m = touchMask(); const L = TL; return { band: L.band, stick: L.stick, knob: stick ? { x: stick.x, y: stick.y, ox: stick.ox, oy: stick.oy } : null, btn: L.btn.map(b => Object.assign({}, b, { down: (b.id === 'jump' && m & IN.JUMP) || (b.id === 'swing' && m & IN.SWING) || (b.id === 'dash' && m & IN.DASH) || (b.id === 'focus' && m & IN.FOCUS) })) }; }
function drawOver(scr) {
  const o = over, n = o.name, s = sim.save;
  if (n === 'map') { if (!o.data) o.data = mapS(); o.data.t = overT; scr('map', o.data); }
  else if (n === 'dialog') scr('dialog', { t: overT, who: o.who, name: o.name2 || (o.who === 'peddler' ? 'The Peddler' : ''), text: o.pages[o.i || 0] || '', more: (o.i || 0) < o.pages.length - 1 });
  else if (n === 'get') scr('get', { t: overT, kind: o.kind, id: o.id, title: o.title, text: o.text, keys: o.keys });
  else if (n === 'shop') scr('shop', { t: overT, sel: overSel, list: shopRows(), dew: s.dew, line: o.line || '' });
  else if (n === 'charms') { const used = RL.Sim.notchesUsed(s); scr('charms', { t: overT, sel: overSel, list: charmRows(), notches: s.notches, used, edit: !!o.edit, line: o.line || '' }); }
}
function mapS() {
  const s = sim.save, rooms = [];
  const P = RL.Plan || null; void P;
  for (const d of W.list) {
    if (!s.maps[d.area] || !s.visited[d.id]) continue;
    rooms.push({ id: d.id, name: d.name, x: d.cx * 16, y: d.cy * 9, w: d.cw * 16, h: d.ch * 9, area: d.area, here: d.id === sim.room.id, doors: mapDoors(d), spot: d.map.some(r => r.indexOf('W') >= 0), peddler: d.map.some(r => r.indexOf('P') >= 0), guard: d.guardian || null, calm: d.guardian ? !!s.calm[d.guardian] : false });
  }
  const r = sim.room, me = sim.st.compass && s.maps[r.area] ? sim.players.map(p => ({ x: r.wx + p.x / 20, y: r.wy + p.y / 20 })) : null;
  return { t: overT, rooms, areas: W.areas, me, puddle: s.puddle && W.rooms[s.puddle.room] && s.visited[s.puddle.room] ? { x: W.rooms[s.puddle.room].cx * 16 + s.puddle.x / 20, y: W.rooms[s.puddle.room].cy * 9 + s.puddle.y / 20 } : null, area: r.area, have: Object.assign({}, s.maps), here: { x: r.wx + r.pw / 40, y: r.wy + r.ph / 40 } };
}
const doorCache = {};
function mapDoors(d) {
  if (doorCache[d.id]) return doorCache[d.id];
  const out = [], m = d.map, w = m[0].length, h = m.length, solid = ch => '#RK%|-'.indexOf(ch) >= 0;
  const run = (side, len, at) => { let k = 0; while (k < len) { if (!solid(at(k))) { const s0 = k; while (k < len && !solid(at(k))) k++; out.push({ side, at: s0, len: k - s0 }); } else k++; } };
  run('N', w, k => m[0][k]); run('S', w, k => m[h - 1][k]); run('W', h, k => m[k][0]); run('E', h, k => m[k][w - 1]);
  return (doorCache[d.id] = out);
}

/* ---------- a plain fallback view, used only when render.js is missing ---------- */
function fallbackFrame() {
  const r = sim.room, cx = Math.round(sim.cam.x), cy = Math.round(sim.cam.y);
  ctx.fillStyle = '#2a2340'; ctx.fillRect(0, 0, VW, VH);
  ctx.save(); ctx.translate(-cx, -cy);
  const tx0 = Math.max(0, Math.floor(cx / 20)), ty0 = Math.max(0, Math.floor(cy / 20)), tx1 = Math.min(r.w, tx0 + 34), ty1 = Math.min(r.h, ty0 + 20);
  const col = ['', '#7a5a3a', '#9b6b3f', '#6f7590', '#c9a26b', '#a08060', '#8a3a5a', '#3a7ad0', '#3a6ad0', '#3a8ad0', '#b07a4a', '#3a2a4a', '#c0a040'];
  for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) { const c = r.t[y * r.w + x]; if (!c) continue; if (c === 11 && r.briar[y * r.w + x] > 0.7) continue; if (c === 12 && !r.gates[r.gateAt[y * r.w + x]].shut) continue; ctx.fillStyle = col[c]; ctx.fillRect(x * 20, y * 20 + (c === 4 ? 0 : 0), 20, c === 4 ? 6 : 20); }
  for (const f of r.flowers) { ctx.fillStyle = '#ff8ad0'; ctx.beginPath(); ctx.arc(f.x, f.y - (f.ceil ? -6 : 6), 5, 0, 7); ctx.fill(); }
  for (const f of r.foes) if (f.alive) { ctx.fillStyle = f.hurt ? '#fff' : '#8a8a9a'; ctx.fillRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h); }
  for (const it of r.items) { ctx.fillStyle = '#ffd93b'; ctx.fillRect(it.x - 6, it.y - 6, 12, 12); }
  for (const sp of r.spots) { ctx.fillStyle = '#4cc46a'; ctx.fillRect(sp.x - 10, sp.y - 16, 20, 16); }
  const g = r.guard; if (g) { ctx.fillStyle = g.done ? '#ffb0d0' : g.hurt ? '#fff' : '#6a6a7a'; ctx.fillRect(g.x - g.w / 2, g.y - g.h / 2, g.w, g.h); }
  for (const h of r.hazards) { ctx.fillStyle = h.live ? 'rgba(255,80,80,.6)' : 'rgba(255,255,255,.2)'; ctx.fillRect(h.x, h.y, h.w, h.h); }
  for (const s of r.shots) { ctx.fillStyle = s.kind === 'beam' ? '#ffe070' : '#9a8aa0'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
  for (const d of r.drops) { ctx.fillStyle = '#7ad0ff'; ctx.fillRect(d.x - 2, d.y - 2, 4, 4); }
  for (const p of sim.players) { ctx.fillStyle = p.inv && (ut >> 2) & 1 ? '#fff' : p.i ? '#ff8a3d' : '#4cc46a'; ctx.fillRect(p.x - 7, p.y - 26, 14, 26); if (p.swing && p.swing.t < 8) { const b = sim.swingBox(p); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(b[0], b[1], b[2], b[3]); } }
  ctx.restore();
  if (sim.fade > 0) { ctx.fillStyle = 'rgba(0,0,0,' + sim.fade + ')'; ctx.fillRect(0, 0, VW, VH); }
}
function fallbackHud() { const p = sim.players[0]; ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText('leaves ' + p.leaves + '/' + p.maxLeaves + '  sun ' + p.sun + '  dew ' + sim.save.dew + '  ' + sim.room.name, 8, 16); if (toastT > 0) ctx.fillText(toastMsg, 8, 34); }
function fallbackScreen(name, S) { ctx.fillStyle = 'rgba(20,16,36,.85)'; ctx.fillRect(0, 0, LW, VH); ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.fillText(name.toUpperCase(), 20, 30); let y = 60; for (const r of (S.rows || S.list || [])) { ctx.fillText((typeof r === 'string' ? r : r.label || r.name || (r.empty ? 'New garden' : r.name)) || '', 30, y); y += 22; } if (S.text) ctx.fillText(S.text, 20, y + 20); }

/* ---------- the loop: fixed 60 Hz ticks, at most 4 a frame ---------- */
let acc = 0, last = now(), manual = false, fLast = 0, fN = 0, fSum = 0, fps = 0;
const liveNow = () => { const H = RL.Main.hooks; return !!(H.live && H.live()); };
function safeTick() { try { tick(); } catch (e) { report(e); } }
function safeRender() { try { render(); } catch (e) { report(e); for (let i = 0; i < 16; i++) ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; } }
function run1(t) { const on = liveNow(); acc = Math.min(on ? 2000 : 100, acc + Math.max(0, Math.min(on ? 2000 : 1000, t - last))); last = t; let n = 0; while (acc >= 1000 / 60 && n < (on ? 120 : 4)) { safeTick(); acc -= 1000 / 60; n++; } return n; }
let bgId = 0;
function frame() {
  requestAnimationFrame(frame);
  const t = now(); if (manual) { last = t; return; }
  if (!run1(t)) return;
  safeRender();
  if (fLast) { fSum += t - fLast; fN++; if (fSum > 1000) { fps = Math.round(1000 * fN / fSum); fSum = fN = 0; } } fLast = t;
}
const hiddenNow = () => !forceVis && !!document.hidden;
document.addEventListener('visibilitychange', () => {
  const hid = hiddenNow(); au('hidden', hid);
  if (hid && screen === 'play' && sim && !liveNow() && !paused && !over) openPause();
  if (hid && liveNow()) { if (!bgId) bgId = setInterval(() => { if (!manual && hiddenNow()) run1(now()); }, 250); }
  else if (bgId) { clearInterval(bgId); bgId = 0; }
  if (!hid) { acc = 0; last = now(); }
});

/* ---------- a simple test bot: walks right, jumps at walls and gaps, swings at glooms ---------- */
const bot = { on: Q.get('bot') === '1', t: 0, step(m) {
  if (!sim) return; const p = sim.players[0], r = sim.room; this.t++;
  let k = IN.R; const f = r.foes.find(f => f.alive && Math.abs(f.x - p.x) < 60 && Math.abs(f.y - p.y + 13) < 50);
  if (f) { k = f.x < p.x ? IN.L : IN.R; if (this.t % 18 < 2) k |= IN.SWING; if (f.y < p.y - 40) k |= IN.U; }
  if (p.vx === 0 && p.ground && this.t % 30 < 12) k |= IN.JUMP; if (!p.ground && p.vy < 0) k |= IN.JUMP;
  m[0] = k;
} };

/* ---------- boot ---------- */
addEventListener('resize', layout);
layout();
requestAnimationFrame(frame);
RL.Main = {
  get sim() { return sim; }, get screen() { return screen; }, get players() { return players; }, set players(n) { players = n === 2 ? 2 : 1; },
  startGame, quitToTitle, post, setMute, setMusic, sfx, toast, go, writeSave,
  /* NET HOOKS (net.js, all optional): tick(ut) each tick; key(code)/tap(x,y) return true to take an input; masks(m) may edit the
     inputs; simOpts(o) edits the Sim options (role, players); simMade(sim) after a Sim is made; draw(ctx, W, H) draws on top;
     live() true = online (no pausing the game, a hidden tab keeps ticking); quit() when the player goes back to the title */
  hooks: { tick: null, key: null, tap: null, masks: null, simOpts: null, simMade: null, draw: null, live: null, quit: null }
};
if (NT().init) { try { NT().init({ onMute: on => setMute(on, true), onMusic: on => setMusic(on, true), main: RL.Main }); } catch (e) { report(e); } }
else addEventListener('message', e => {
  if (e.source !== parent || parent === window || e.origin !== location.origin) return;
  const d = e.data; if (!d || typeof d !== 'object') return;
  if (d.ty === 'mute') setMute(!!d.on, true); else if (d.ty === 'music') setMusic(!!d.on, true);
});
window.__rl = {
  get state() {
    const s = sim; return { screen, over: over && over.name, paused, players, ut, fps, R, LW, LH, errors: errors.slice(), muted, music: musicOn,
      room: s ? s.room.id : null, area: s ? s.room.area : null, p: s ? s.players.map(p => ({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), st: p.st, leaves: p.leaves, max: p.maxLeaves, sun: p.sun, ground: p.ground })) : [],
      save: s ? { dew: s.save.dew, ab: Object.assign({}, s.save.ab), calm: Object.assign({}, s.save.calm), life: s.save.life, spot: s.save.spot, charms: Object.keys(s.save.charms), worn: s.save.worn.slice(), pct: s.pct() } : null,
      foes: s ? s.room.foes.filter(f => f.alive).length : 0, guard: s && s.room.guard ? { kind: s.room.guard.kind, st: s.room.guard.st, hp: s.room.guard.hp, done: s.room.guard.done } : null };
  },
  get sim() { return sim; }, RL,
  manual(on) { manual = on !== false; }, visible(on) { forceVis = on !== false; },
  step(n) { for (let i = 0; i < (n || 1); i++) safeTick(); return ut; },
  render() { safeRender(); },
  key(code, down) { if (down === false) held.delete(code); else { held.add(code); hits.push(code); } },
  start(n, o) { players = (o && o.players) || 1; startGame(n || 1, Object.assign({ fresh: true, noSave: true }, o || {})); return this.state; },
  warp(id, x, y) { if (!sim || !W.rooms[id]) return false; sim.enterRoom(id, x == null ? null : x, y == null ? null : y, x == null ? { spot: true } : {}); sim.fade = 0; const D = RD(); if (D.room) D.room(sim); return true; },
  give(a) { if (!sim) return; const ab = sim.save.ab; if (a === 'all') { for (const k in ab) ab[k] = 1; } else ab[a] = 1; sim.applyStats(); },
  bot(on) { bot.on = on !== false; }, over: () => over, close: closeOver, layout, tap
};
post({ ty: 'ready' });
})();
