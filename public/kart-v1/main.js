/* SPROUT KART — main.js (MAIN): the fixed 60 Hz loop, layout and render scale, input (keys, touch, mouse), the screens and
   the ways to play (ONE PLAYER Grand Prix / Single Race, TWO PLAYERS split-screen Grand Prix / Single Race), best times,
   sound and music hooks, the parent-page protocol and the window.__sk debug handle. Rules: sim.js. Tracks: tracks.js.
   Drawing: render.js. Online play is net.js's (feature-checked: SK.Net); see SK.Main at the bottom for the hooks.

   SK.Audio (feature-checked; with ?mute=1 it is never touched). The sim's events (sim.js) are mapped in sound() below to:
     play: 'count' (3|2|1)  'go'  'boost' ('rocket'|'pad'|'berry')  'hop'  'drift' (true | 1..3 spark colour | false: the held
     skid loop for your own kart)  'turbo' (1..3)  'item' (roulette tick)  'got' (item id)  'box'  'throw' (bomb thrown, juice
     dropped)  'splat' (a kart rolls into juice)  'bomb' (a berry bomb lands)  'seeker'  'shield'  'pop' (shield or seed pops)
     'star'  'hit'  'lap'  'final'  'finish' (place)  'bump'  'fall'  'lift' (the balloon)  'best' (new best time)
     'menu' (move)  'select' (choose)
   engine(i, speed01, near01) every frame for every kart (engine(i, -1) when a race ends or pauses)
   music('title'|'meadows'|'skyway'|'works'|'results'|null, v) (v 1 = final lap), unlock(), mute(on), musicOn(on), hidden(on).
   Debug: ?mute=1 ?bot=1 (CPU drives the players and screens advance) ?debug=1 (fps); window.__sk. */
'use strict';
(function () {
const SK = window.SK, RD = SK.Render, NT = SK.Net || {};
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search), SILENT = Q.get('mute') === '1';
const DBG = { bot: Q.get('bot') === '1', debug: Q.get('debug') === '1' };
const now = () => performance.now(), clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} } };
const errors = [];
function report(e) { const m = String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '); if (errors.length < 40 && errors.indexOf(m) < 0) { errors.push(m); console.error('[kart]', e); } }

/* ---------- sound and music ---------- */
const AU = () => SK.Audio || {};
let muted = SILENT || store.get('kart-mute') === '1', musicOn = store.get('kart-music') !== '0', unlocked = false, mus = '';
function au(fn, a, b, c) { if (SILENT) return; const A = AU(); if (typeof A[fn] === 'function') try { A[fn](a, b, c); } catch (e) { report(e); } }
function unlock() { if (!SILENT && !unlocked) { unlocked = true; au('unlock'); au('mute', muted); au('musicOn', musicOn); } }
function sfx(n, a) { if (!muted) au('play', n, a); }
function music(n, v) { const k = n ? n + (v | 0) : ''; if (k !== mus) { mus = k; au('music', n || null, v | 0); } }
function post(o) { if (NT.post) { try { NT.post(o); } catch (e) { report(e); } return; } try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} }
function setMute(on, quiet) { muted = !!on; if (SILENT) return; au('mute', muted); store.set('kart-mute', muted ? 1 : 0); if (!quiet) post({ ty: 'mute', on: muted }); }
function setMusic(on, quiet) { musicOn = !!on; if (SILENT) return; au('musicOn', musicOn); store.set('kart-music', musicOn ? 1 : 0); if (!quiet) post({ ty: 'music', on: musicOn }); }
au('mute', muted); au('musicOn', musicOn);

/* ---------- layout: a 400-high logical page, 560-760 wide to suit the window; phones in portrait get a control band ---------- */
const BUCK = [1, 1.5, 2, 2.5, 3];
let LW = 640, LH = 400, VH = 400, S = 1, R = 0, OX = 0, OY = 0, coarse = false, low = false, padMode = false;
function layout() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = devicePixelRatio || 1;
  coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  low = coarse && Math.min(w, h) < 560;
  VH = 400; LW = clamp(Math.round(VH * w / h), 560, coarse ? 880 : 800);
  padMode = coarse && h / w > 1.15;   /* a phone held upright: a taller view on top, the controls in a band below */
  if (padMode) { LW = 560; LH = Math.max(660, Math.round(LW * h / w)); VH = clamp(LH - 260, 400, 620); } else LH = VH;
  S = Math.min(w / LW, h / LH);
  const want = S * dpr, cap = coarse ? 2.5 : 3;
  let r = BUCK[0]; for (const b of BUCK) if (b <= cap && Math.abs(b - want) <= Math.abs(r - want)) r = b;
  const cw = Math.round(LW * r), ch = Math.round(LH * r);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.width = LW * S + 'px'; cv.style.height = LH * S + 'px';
  OX = (w - LW * S) / 2; OY = (h - LH * S) / 2; cv.style.left = OX + 'px'; cv.style.top = OY + 'px';
  if (r !== R || !RD.ready) { R = r; try { RD.init(R, low); } catch (e) { report(e); } }
}

/* ---------- state ---------- */
let screen = 'title', players = 1, gp = null, trackIx = 0, diff = clamp(+store.get('kart-diff') || 1, 0, 2);
let sim = null, ut = 0, scrUt = 0, paused = false, pauseSel = 0, titleSel = 0, trackSel = 0, forceVis = false;
let me = [0], doneUt = -1, results = null, resRows = null, newBest = '', touchMode = false;
let best = {}; try { best = JSON.parse(store.get('kart-best') || '{}') || {}; } catch (_) { best = {}; }
const banners = [null, null], placeUt = [0, 0], lastPlace = [0, 0];
let wasDrift = false, demo = null, demoK = 0, demoUt = 0, demoTrack = 0, seedBase = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
const hidden = () => !forceVis && !!document.hidden;
const TR = SK.TRACKS;

function goScreen(s) { screen = s; scrUt = ut; }
function toTitle() { endEngines(); sim = null; gp = null; paused = false; goScreen('title'); }
function endEngines() { for (let i = 0; i < 6; i++) au('engine', i, -1); au('play', 'drift', false); }
function startRace(ti, seed) {
  const NH = SK.Main && SK.Main.hooks;   /* NET HOOK (net.js): online, a guest only starts the races its host starts */
  if (NH && NH.canStart && NH.canStart() === false) return;
  trackIx = ((ti | 0) % TR.length + TR.length) % TR.length;
  const T = TR[trackIx], racers = [], cpus = [2, 3, 4, 5];
  /* grid: CPUs in front, players at the back (in a Grand Prix the CPU order follows the standings, leaders at the back) */
  const order = players === 1 ? cpus.concat([1]) : cpus.slice();   /* one player: MARIGOLD races as a CPU kart */
  if (gp && gp.round > 0) order.sort((a, b) => (gp.totals[a] || 0) - (gp.totals[b] || 0));
  for (const w of order) racers.push({ who: w, cpu: true, diff });
  racers.push({ who: 0, cpu: false, diff }); me = [racers.length - 1];
  if (players === 2) { racers.push({ who: 1, cpu: false, diff }); me.push(racers.length - 1); }
  /* NET HOOK (net.js): online, the link sets the grid (racers, edited in place), the kart this player drives (me), one view
     (players), the seed and the Grand Prix round and standings (gp, edited in place) */
  if (NH && NH.racers) { const o = { track: trackIx, racers, me, players, seed, gp }; NH.racers(o); me = o.me; players = o.players; seed = o.seed; }
  sim = new SK.Sim({ track: T, racers, seed: seed != null ? seed >>> 0 : (seedBase = (seedBase * 1664525 + 1013904223) >>> 0) });
  if (DBG.bot) for (const i of me) sim.bot[i] = true;
  RD.setTrack(T); me.forEach((i, s) => RD.camera(s, sim.karts[i], true));
  paused = false; doneUt = -1; results = resRows = null; newBest = ''; banners[0] = banners[1] = null; lastPlace[0] = lastPlace[1] = 0;
  goScreen('race');
}
function startMode(two, isGp, ti) {
  players = two ? 2 : 1;
  gp = isGp ? { round: 0, order: [0, 1, 2], totals: {} } : null;
  startRace(isGp ? 0 : ti | 0);
}
function finishRace() {
  results = sim.results(); const T = sim.track;
  newBest = '';
  for (const r of results) if (!r.cpu && !r.est) { const k = T.id; if (!best[k] || r.time < best[k]) { best[k] = r.time; newBest = 'NEW BEST TIME! ' + RD.fmtTime(r.time); } }
  if (newBest) { store.set('kart-best', JSON.stringify(best)); setTimeout(() => sfx('best'), 900); }
  if (gp) SK.GP.add(gp.totals, results.map(r => ({ i: r.who, place: r.place })));
  resRows = results.map(r => ({ place: r.place, who: r.who, time: r.est ? '–' : RD.fmtTime(r.time), me: !r.cpu, tag: !r.cpu && players === 2 ? (r.who === 0 ? '(P1)' : '(P2)') : '', pts: SK.GP.POINTS[r.place - 1] || 0, total: gp ? gp.totals[r.who] || 0 : 0 }));
  goScreen('results');
}
function nextFromResults() {
  const NH = SK.Main.hooks; if (NH.next && NH.next() === false) return;   /* NET HOOK (net.js): online, the host moves both players on */
  if (gp) { if (gp.round < 2) { gp.round++; startRace(gp.order[gp.round]); } else { goScreen('podium'); sfx('finish', 1); } }
  else startRace(trackIx);
}
function standings() { const o = []; for (let w = 0; w < 6; w++) o.push({ who: w, pts: (gp && gp.totals[w]) || 0 }); o.sort((a, b) => b.pts - a.pts || a.who - b.who); return o; }

/* ---------- input ---------- */
const held = new Set(); let hits = [];
const GAMEKEY = /^(Arrow|Space$|Enter$|NumpadEnter$|Slash$|ShiftRight$|ShiftLeft$|Tab$)/;
addEventListener('keydown', e => {
  const c = e.code || e.key || '';
  if (GAMEKEY.test(c)) e.preventDefault();
  unlock(); touchMode = false;
  held.add(c); if (!e.repeat) hits.push(c);
});
addEventListener('keyup', e => { held.delete(e.code || e.key || ''); });
addEventListener('blur', () => held.clear());
const any = (...ks) => ks.some(k => held.has(k));
const IN = SK.IN;
function keyMask(p) {
  let m = 0;
  if (players === 1) {
    if (any('ArrowLeft', 'KeyA')) m |= IN.LEFT; if (any('ArrowRight', 'KeyD')) m |= IN.RIGHT; if (any('ArrowDown', 'KeyS')) m |= IN.BRAKE;
    if (any('Space')) m |= IN.DRIFT; if (any('ShiftLeft', 'ShiftRight', 'KeyE', 'Enter', 'NumpadEnter', 'KeyX')) m |= IN.ITEM;
  } else if (p === 0) {
    if (any('KeyA')) m |= IN.LEFT; if (any('KeyD')) m |= IN.RIGHT; if (any('KeyS')) m |= IN.BRAKE; if (any('Space')) m |= IN.DRIFT; if (any('KeyE', 'KeyQ')) m |= IN.ITEM;
  } else {
    if (any('ArrowLeft')) m |= IN.LEFT; if (any('ArrowRight')) m |= IN.RIGHT; if (any('ArrowDown')) m |= IN.BRAKE; if (any('ShiftRight', 'Slash')) m |= IN.DRIFT; if (any('Enter', 'NumpadEnter')) m |= IN.ITEM;
  }
  if (p === 0) m |= touchMask();
  return m;
}
/* touch: pointers held on the steer zones and buttons */
const TP = new Map();
function zoneAt(x, y) {
  const T = RD.UI.touch, inR = r => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inR(T.drift)) return 'drift'; if (inR(T.item)) return 'item'; if (inR(T.left)) return 'left'; if (inR(T.right)) return 'right';
  return x < LW / 2 ? 'left' : 'right';
}
function touchMask() {
  let m = 0, l = 0, r = 0;
  for (const z of TP.values()) { if (z === 'left') l = 1; else if (z === 'right') r = 1; else if (z === 'drift') m |= IN.DRIFT; else if (z === 'item') m |= IN.ITEM; }
  if (l && r) m |= IN.BRAKE; else if (l) m |= IN.LEFT; else if (r) m |= IN.RIGHT;
  return m;
}
const toL = e => [(e.clientX - OX) / S, (e.clientY - OY) / S];
document.addEventListener('pointerdown', e => {
  unlock(); try { cv.focus({ preventScroll: true }); } catch (_) {}
  if (e.pointerType !== 'mouse') touchMode = true;
  if (e.cancelable && e.pointerType !== 'mouse') e.preventDefault();
  const [x, y] = toL(e), PZ = RD.UI.touch.pause;
  if (screen === 'race' && !paused && PZ && x >= PZ.x && x <= PZ.x + PZ.w && y >= PZ.y && y <= PZ.y + PZ.h) { paused = true; pauseSel = 0; sfx('menu'); return; }
  if (screen === 'race' && !paused && sim && e.pointerType !== 'mouse') { TP.set(e.pointerId, zoneAt(x, y)); return; }
  tap(x, y - (screen === 'race' && !paused ? 0 : (VH - 400) / 2));
}, { passive: false });
document.addEventListener('pointermove', e => { if (TP.has(e.pointerId)) { const [x, y] = toL(e); TP.set(e.pointerId, zoneAt(x, y)); } }, { passive: true });
const pUp = e => TP.delete(e.pointerId);
document.addEventListener('pointerup', pUp); document.addEventListener('pointercancel', pUp);
document.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
function tap(x, y) {
  if (SK.Main.hooks.tap && SK.Main.hooks.tap(x, y)) return;   /* NET HOOK (net.js): online taps (a waiting guest, "race on alone") */
  const U = RD.UI, inR = r => !!r && r.w > 0 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (screen === 'title') {
    if (inR(U.snd[0])) { setMute(!muted); sfx('select'); return; }
    if (inR(U.snd[1])) { setMusic(!musicOn); sfx('select'); return; }
    U.diff.forEach((r, i) => { if (inR(r)) { diff = i; store.set('kart-diff', i); sfx('select'); } });
    U.btn.forEach((r, i) => { if (inR(r)) { titleSel = i; choose(i); } });
  } else if (screen === 'tracks') {
    let hit = false; U.tracks.forEach((r, i) => { if (inR(r)) { hit = true; trackSel = i; sfx('select'); startMode(players === 2, false, i); } });
    if (!hit && y > LH - 60) { sfx('menu'); goScreen('title'); }
  } else if (screen === 'race' && paused) { U.menu.forEach((r, i) => { if (inR(r)) pauseChoose(i); }); }
  else if (screen === 'results' && ut - scrUt > 40) { sfx('select'); nextFromResults(); }
  else if (screen === 'podium' && ut - scrUt > 60) { sfx('select'); toTitle(); }
}
function choose(i) { sfx('select'); const two = i >= 2, isGp = (i & 1) === 0; players = two ? 2 : 1; if (isGp) startMode(two, true); else { trackSel = trackIx; goScreen('tracks'); } }
function pauseChoose(i) { if (i === 0) { paused = false; sfx('select'); } else if (i === 1) { sfx('menu'); toTitle(); } else { sfx('menu'); post({ ty: 'exit' }); toTitle(); } }
function onKey(c) {
  if (c === 'KeyM') { setMute(!muted); return; }
  if (c === 'KeyN') { setMusic(!musicOn); return; }
  if (SK.Main.hooks.key && SK.Main.hooks.key(c)) return;   /* NET HOOK (net.js): online keys (a waiting guest, "race on alone") */
  const go = c === 'Space' || c === 'Enter' || c === 'NumpadEnter', up = c === 'ArrowUp' || c === 'KeyW', dn = c === 'ArrowDown' || c === 'KeyS', lf = c === 'ArrowLeft' || c === 'KeyA', rt = c === 'ArrowRight' || c === 'KeyD';
  if (screen === 'title') {
    if (c === 'Escape' || c === 'Backspace') { post({ ty: 'exit' }); return; }
    if (titleSel === 4) { if (lf || rt) { diff = clamp(diff + (rt ? 1 : -1), 0, 2); store.set('kart-diff', diff); sfx('menu'); } else if (up) titleSel = 2; else if (go) { titleSel = 0; sfx('select'); } return; }
    if (up && titleSel >= 2) titleSel -= 2; else if (dn) titleSel = titleSel >= 2 ? 4 : titleSel + 2; else if (lf) titleSel &= ~1; else if (rt) titleSel |= 1; else if (go) choose(titleSel);
    if (up || dn || lf || rt) sfx('menu');
    return;
  }
  if (screen === 'tracks') {
    if (lf) { trackSel = (trackSel + TR.length - 1) % TR.length; sfx('menu'); } else if (rt) { trackSel = (trackSel + 1) % TR.length; sfx('menu'); }
    else if (go) { sfx('select'); startMode(players === 2, false, trackSel); } else if (c === 'Escape' || c === 'Backspace') { sfx('menu'); goScreen('title'); }
    return;
  }
  if (screen === 'race') {
    if (paused) {
      if (up) pauseSel = (pauseSel + 2) % 3; else if (dn) pauseSel = (pauseSel + 1) % 3; else if (c === 'Escape' || c === 'KeyP') { paused = false; } else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') pauseChoose(pauseSel);
      return;
    }
    if (c === 'Escape' || c === 'KeyP') { paused = true; pauseSel = 0; sfx('menu'); }
    return;
  }
  if (screen === 'results') {
    if (c === 'Escape') { post({ ty: 'exit' }); return; }
    if (c === 'KeyT' || c === 'Backspace') { sfx('menu'); toTitle(); return; }
    if (go && ut - scrUt > 50) { sfx('select'); nextFromResults(); }
    return;
  }
  if (screen === 'podium') { if (c === 'Escape') { post({ ty: 'exit' }); return; } if (go && ut - scrUt > 60) { sfx('select'); toTitle(); } }
}

/* ---------- events → sound, fx, banners ---------- */
const nearHuman = k => { let d = 1e9; for (const i of me) { const h = sim.karts[i]; d = Math.min(d, Math.hypot(h.x - k.x, h.y - k.y)); } return d; };
function onEvents(s) {
  for (const e of s.events) {
    const [n, i, a] = e, k = i >= 0 ? s.karts[i] : null, mine = k && !k.cpu, slot = mine ? me.indexOf(i) : -1;
    try { RD.fxEvent(s, e); } catch (er) { report(er); }
    if (s !== sim) continue;
    if (i < 0) { if (n === 'count' || n === 'go') sfx(n, a); else if (n === 'pop') sound(n, a, false, -1); continue; }
    const near = mine || nearHuman(k) < 28;
    if (!near) continue;
    sound(n, a, mine, slot);
    if (slot >= 0) {
      if (n === 'lap') banners[slot] = { text: 'LAP ' + a, age: 0, life: 90 };
      else if (n === 'final') banners[slot] = { text: 'FINAL LAP!', age: 0, life: 110, col: '#ffb27a' };
      else if (n === 'boost' && a === 'rocket') banners[slot] = { text: 'ROCKET START!', age: 0, life: 80, col: '#ffd93b', size: 34 };
      else if (n === 'stall') banners[slot] = { text: 'Whoops, too early!', age: 0, life: 70, size: 26 };
      else if (n === 'item') banners[slot] = null;
      else if (n === 'hit') banners[slot] = { text: 'WHEEE!', sub: a === 'splat' ? 'a juicy spin' : a === 'bomb' ? 'a berry splash' : 'a seed bonk', age: 0, life: 70, size: 34, col: '#ffb8c8' };
      else if (n === 'shield' && a === 'pop') banners[slot] = { text: 'SAVED BY THE BUBBLE!', age: 0, life: 70, size: 26, col: '#bfe8ff' };
      else if (n === 'turbo' && a === 3) banners[slot] = { text: 'GOLDEN TURBO!', age: 0, life: 50, size: 26, col: '#ffd93b' };
    }
  }
}

/* sim events → the audio engineer's names (see the header) */
function sound(n, a, mine, slot) {
  if (n === 'drift') { if (a === 'hop') sfx('hop'); else if (mine && slot === 0) sfx('drift', true); return; }
  if (n === 'spark') { if (mine && slot === 0) sfx('drift', a); return; }
  if (n === 'turbo') { sfx('turbo', a); if (mine && slot === 0) sfx('drift', false); return; }
  if (n === 'item') { if (mine) sfx('got', a); return; }
  if (n === 'splat') { sfx(a === 'drop' ? 'throw' : 'splat'); return; }
  if (n === 'bomb') { sfx('throw'); return; }
  if (n === 'pop') { sfx(a === 'bomb' ? 'bomb' : 'pop'); return; }
  if (n === 'seed') { sfx('seeker'); return; }
  if (n === 'shield') { sfx(a === 'pop' ? 'pop' : 'shield'); return; }
  if (n === 'balloon') { sfx('lift'); return; }
  if (n === 'stall') { sfx('bump'); return; }
  if (!mine && (n === 'lap' || n === 'final' || n === 'finish')) return;
  sfx(n, a);
}

/* ---------- tick ---------- */
function demoTick() {
  if (!demo || (demo.done && ut - demoUt > 200) || demo.clock > 60 * 150) {
    demoTrack = demo ? (demoTrack + 1) % TR.length : 0;
    demo = new SK.Sim({ track: TR[demoTrack], racers: [2, 3, 4, 5, 1, 0].map((w, j) => ({ who: w, cpu: true, diff: j % 3 })), seed: 777 + ut, countdown: 1 });
    demoK = 5; demoUt = ut; RD.setTrack(TR[demoTrack]); RD.camera(2, demo.karts[demoK], true);
  }
  demo.step(null); onEvents(demo);
  if (demo.done && demoUt >= 0 && !demo._d) { demo._d = 1; demoUt = ut; }
  if ((ut - demoUt) % 600 === 599) { demoK = (demoK + 1) % demo.karts.length; RD.camera(2, demo.karts[demoK], true); }
  RD.camera(2, demo.karts[demoK]); RD.tick(demo);
}
/* NET HOOK (net.js): while online the race never stops (the pause menu shows over a running race, a hidden tab keeps ticking) */
const live = () => { const H = SK.Main && SK.Main.hooks; return !!(H && H.live && H.live()); };
function tick() {
  ut++;
  if (SK.Main.hooks.tick) try { SK.Main.hooks.tick(ut); } catch (e) { report(e); }   /* NET HOOK (net.js): messages in and out, every tick */
  const hk = hits; hits = [];
  for (const c of hk) onKey(c);
  if (screen === 'title' || screen === 'tracks') { demoTick(); if (DBG.bot && ut - scrUt > 40 && screen === 'title') startMode(false, false, trackIx); }
  else if (sim) {
    if (!paused || live()) {
      const inp = [0, 0, 0, 0, 0, 0];
      me.forEach((i, p) => { inp[i] = paused ? 0 : keyMask(p); });
      const prevRoll = me.map(i => sim.karts[i].roll);
      const H = SK.Main.hooks;
      if (H.beforeStep) try { H.beforeStep(sim, inp); } catch (e) { report(e); }
      sim.step(inp); onEvents(sim);
      if (H.afterStep) try { H.afterStep(sim); } catch (e) { report(e); }
      me.forEach((i, p) => {
        const k = sim.karts[i]; if (k.roll && (k.roll % 6) === 0 && k.roll !== prevRoll[p]) sfx('item', k.roll / 6);
        if (p === 0 && wasDrift && !k.drift) sfx('drift', false); if (p === 0) wasDrift = !!k.drift;
        if (k.place !== lastPlace[p]) { lastPlace[p] = k.place; placeUt[p] = ut; } RD.camera(p, k); if (banners[p]) banners[p].age++;
      });
      RD.tick(sim);
      if (sim.done && doneUt < 0) doneUt = ut;
      if (screen === 'race' && doneUt >= 0 && ut - doneUt > 150) finishRace();
    }
    if (paused && wasDrift) { au('play', 'drift', false); wasDrift = false; }
    if (DBG.bot && screen === 'results' && ut - scrUt > 120) nextFromResults();
    if (DBG.bot && screen === 'podium' && ut - scrUt > 150) toTitle();
  }
  musicWatch();
}
function musicWatch() {
  if (screen === 'title' || screen === 'tracks') return music('title');
  if (screen === 'results' || screen === 'podium') return music('results');
  if (sim) music(sim.track.theme, me.some(i => sim.karts[i].lap >= sim.track.laps) ? 1 : 0);
}

/* ---------- drawing ---------- */
function viewRects() {
  if (players === 2) return [{ x: 0, y: 0, w: LW, h: VH / 2 }, { x: 0, y: VH / 2, w: LW, h: VH / 2 }];
  return [{ x: 0, y: 0, w: LW, h: VH }];
}
function engines() {
  if (!sim || screen === 'title' || screen === 'tracks' || SILENT || muted) return;
  for (const k of sim.karts) { const mine = !k.cpu, d = mine ? 0 : nearHuman(k), vol = mine ? 1 : Math.max(0, 1 - d / 40); if (paused || screen === 'podium' || vol <= 0) au('engine', k.i, -1); else au('engine', k.i, Math.min(1.3, Math.abs(k.v) / SK.KART.VMAX), vol); }
}
function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.globalAlpha = 1;
  if (LH > VH) RD.screen(ctx, 'band', { W: LW, y: VH, h: LH - VH });
  const W = LW, H = VH, t = ut, touch = touchMode || coarse, oy = (VH - 400) / 2;
  const over = (name, S) => { S.W = W; S.H = 400; if (SK.Main.hooks.screen) SK.Main.hooks.screen(name, S); /* NET HOOK (net.js): online wording */ ctx.save(); ctx.translate(0, oy); RD.screen(ctx, name, S); ctx.restore(); };
  if (screen === 'title' || screen === 'tracks') {
    if (demo) RD.drawView(ctx, { x: 0, y: 0, w: W, h: H }, demo, demoK, t, { slot: 2, cached: true });
    if (screen === 'title') over('title', { t: ut - scrUt + 200, touch, sound: !muted, music: musicOn, sel: titleSel, diff, best, tracks: TR });
    else over('tracks', { t, sel: trackSel, tracks: TR, best, two: players === 2, touch });
  } else if (sim) {
    const rs = screen === 'podium' ? [] : viewRects();
    if (screen === 'podium') RD.drawView(ctx, { x: 0, y: 0, w: W, h: H }, sim, me[0], t, { slot: 0 });
    rs.forEach((r, p) => {
      const i = me[p]; RD.drawView(ctx, r, sim, i, t, { slot: p });
      const keyHint = touch ? '' : players === 1 ? 'SHIFT' : p ? 'ENTER' : 'E';
      const hint = sim.phase === 'count' ? (touch ? 'Tap DRIFT on 1 for a rocket start!' : players === 1 ? 'Press SPACE on 1 for a rocket start!' : (p ? 'RIGHT SHIFT' : 'SPACE') + ' on 1: rocket start!') : '';
      RD.drawHUD(ctx, r, sim, i, t, { banner: banners[p], placeAge: ut - placeUt[p], map: players === 1 && !padMode, touchUp: touch && !padMode && players === 1, me, itemKey: keyHint, hint, itemX: players === 2 && p === 1 ? 92 : 0 });
    });
    if (players === 2 && screen !== 'podium') { ctx.fillStyle = '#2b2140'; ctx.fillRect(0, VH / 2 - 2, W, 4); ctx.fillStyle = 'rgba(43,33,64,.45)'; ctx.beginPath(); ctx.rect(4, VH / 2 - 44, 88, 88); ctx.fill(); RD.minimap(ctx, sim, 8, VH / 2 - 40, 80, me); }
    if (padMode && screen !== 'podium') { const ms = Math.min(150, (LH - VH) * 0.3 - 20); RD.minimap(ctx, sim, W / 2 - ms / 2, VH + 14, ms, me); }
    if (screen === 'race' && touch && !paused) RD.screen(ctx, 'touch', { W, H: VH, band: padMode ? { y: VH, h: LH - VH } : null, pressed: touchPressed() });
    if (screen === 'results') {
      const T = sim.track, gpT = gp ? 'RACE ' + (gp.round + 1) + ' OF 3 · ' : '';
      over('results', { age: ut - scrUt, rows: resRows, title: gpT + T.name, sub: newBest || (gp ? 'Grand Prix points' : ''), points: !!gp,
        prompt: touch ? 'Tap to ' + (gp ? (gp.round < 2 ? 'start the next race' : 'see the podium') : 'race again') : 'SPACE: ' + (gp ? (gp.round < 2 ? 'next race' : 'the podium') : 'race again'), prompt2: touch ? '' : 'T: title   Esc: leave' });
    } else if (screen === 'podium') over('podium', { age: ut - scrUt, t, standings: standings(), prompt: touch ? 'Tap to finish' : 'SPACE: back to the title' });
    if (paused) over('pause', { sel: pauseSel });
  }
  if (SK.Main.hooks.draw) { ctx.save(); ctx.translate(0, oy); SK.Main.hooks.draw(ctx, W, 400); ctx.restore(); }   /* NET HOOK (net.js): online notes on top */
  engines();
  if (DBG.debug) RD.text(ctx, fps + ' fps R' + R + ' ' + screen + (errors.length ? ' ERR ' + errors.length : ''), 8, H - 12, 11, '#fff', 'left');
}
function touchPressed() { const m = touchMask(); return { left: !!(m & IN.LEFT) || !!(m & IN.BRAKE), right: !!(m & IN.RIGHT) || !!(m & IN.BRAKE), drift: !!(m & IN.DRIFT), item: !!(m & IN.ITEM) }; }

/* ---------- the loop: fixed 60 Hz ticks, at most 4 a frame ---------- */
let acc = 0, last = now(), manual = false, fLast = 0, fN = 0, fSum = 0, fps = 0;
function safeTick() { try { tick(); } catch (e) { report(e); } }
function safeRender() { try { render(); } catch (e) { report(e); for (let i = 0; i < 16; i++) ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; } }
function run1(t) { const on = live(); acc = Math.min(on ? 2000 : 100, acc + Math.max(0, Math.min(on ? 2000 : 1000, t - last))); last = t; let n = 0; while (acc >= 1000 / 60 && n < (on ? 120 : 4)) { safeTick(); acc -= 1000 / 60; n++; } return n; }   /* online (NET HOOK live): catch up after a stall */
let bgId = 0;
function frame() {
  requestAnimationFrame(frame);
  const t = now(); if (manual) { last = t; return; }
  if (!run1(t)) return;
  safeRender();
  if (fLast) { fSum += t - fLast; fN++; if (fSum > 1000) { fps = Math.round(1000 * fN / fSum); fSum = fN = 0; } } fLast = t;
}
document.addEventListener('visibilitychange', () => {
  const hid = hidden(); au('hidden', hid);
  if (hid && screen === 'race' && sim && !sim.done && !live()) { paused = true; pauseSel = 0; }
  /* NET HOOK (live): online, a hidden tab keeps the race (and the link) going from a timer, as rAF stops */
  if (hid && live()) { if (!bgId) bgId = setInterval(() => { if (!manual && hidden()) run1(now()); }, 250); }
  else if (bgId) { clearInterval(bgId); bgId = 0; }
  if (!hid) { acc = 0; last = now(); }
});


/* ---------- boot ---------- */
addEventListener('resize', layout);
layout();
requestAnimationFrame(frame);
const parseMode = m => { const s = String(m == null ? 'single' : m).toLowerCase(); return { two: /2/.test(s), gp: /gp|grand|prix/.test(s) }; };
const parseTrack = t => { if (t == null) return 0; if (typeof t === 'number') return t; const i = TR.findIndex(T => T.id === t || T.name === t); return i < 0 ? 0 : i; };
const parseDiff = d => { if (d == null) return diff; if (typeof d === 'number') return clamp(d | 0, 0, 2); const i = SK.DIFF.findIndex(x => x.id === String(d).toLowerCase()); return i < 0 ? diff : i; };
SK.Main = {
  get sim() { return sim; }, get screen() { return screen; }, get players() { return players; }, get me() { return me; },
  startRace(o) { o = o || {}; players = o.players === 2 ? 2 : 1; gp = o.gp ? { round: 0, order: [0, 1, 2], totals: {} } : null; diff = parseDiff(o.diff); startRace(parseTrack(o.track), o.seed); },
  toTitle, post, setMute, setMusic, sfx,
  get gp() { return gp; }, get paused() { return paused; },
  /* NET (net.js): end the race now and show the results (an online guest, once its host's results are in) */
  finish() { if (sim && screen === 'race') finishRace(); },
  /* for net.js: hooks.beforeStep(sim, inputs) may edit inputs or mark sim.ext[i]; hooks.afterStep(sim) runs after every race tick.
     NET HOOKS (added for online play, all optional): tick(ut) every tick; canStart() === false refuses a race start; racers(o)
     edits the grid / me / players / seed / gp before the sim is made; next() === false keeps the results up; key(code) and
     tap(x, y) return true to take an input; screen(name, S) edits a screen's options; draw(ctx, W, H) draws on top;
     live() true = online (the race runs on under the pause menu and in a hidden tab) */
  hooks: { beforeStep: null, afterStep: null, tick: null, canStart: null, racers: null, next: null, key: null, tap: null, screen: null, draw: null, live: null }
};

/* ---------- the parent page (the planet's kart room): same origin only; net.js takes this over when it is present ---------- */
if (NT.init) { try { NT.init({ onMute: on => setMute(on, true), onMusic: on => setMusic(on, true), main: SK.Main }); } catch (e) { report(e); } }
else addEventListener('message', e => {
  if (e.source !== parent || parent === window || e.origin !== location.origin) return;
  const d = e.data; if (!d || typeof d !== 'object') return;
  if (d.ty === 'mute') setMute(!!d.on, true); else if (d.ty === 'music') setMusic(!!d.on, true);
});
window.__sk = {
  get state() { return { screen, players, gp: gp ? { round: gp.round, totals: Object.assign({}, gp.totals) } : null, track: TR[trackIx].id, diff, paused, ut, titleSel, trackSel, phase: sim ? sim.phase : null, clock: sim ? sim.clock : 0, done: sim ? sim.done : false, me: me.slice(), karts: sim ? sim.karts.map(k => ({ who: k.who, cpu: k.cpu, lap: k.lap, place: k.place, finished: k.finished, x: +k.x.toFixed(2), y: +k.y.toFixed(2), v: +k.v.toFixed(2), item: SK.ITEMS[k.item] })) : [], best: Object.assign({}, best), errors: errors.slice(), muted, music: musicOn, fps, R, LW, LH }; },
  get sim() { return sim; }, get demo() { return demo; }, DBG,
  manual(on) { manual = on !== false; },
  visible(on) { forceVis = on !== false; },
  step(n) { for (let i = 0; i < (n || 1); i++) safeTick(); return ut; },
  render() { safeRender(); },
  key(code, down) { if (down === false) held.delete(code); else { held.add(code); hits.push(code); } },
  start(mode, track, d, seed) { const m = parseMode(mode); diff = parseDiff(d); players = m.two ? 2 : 1; gp = m.gp ? { round: 0, order: [0, 1, 2], totals: {} } : null; startRace(m.gp ? 0 : parseTrack(track), seed); return this.state; },
  bot(on) { DBG.bot = on !== false && on !== 0; if (sim) for (const i of me) sim.bot[i] = DBG.bot; },
  tap(x, y) { tap(x, y); }, title: toTitle, layout, finish() { if (sim) finishRace(); }
};
post({ ty: 'ready' });
})();
