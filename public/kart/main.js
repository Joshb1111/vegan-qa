/* SPROUT KART — main.js v2 (MAIN): the fixed 60 Hz loop, layout, render scale and dynamic resolution, input (keys, touch,
   mouse; presses are latched so a tap between two ticks still counts), the screens and the ways to play (ONE PLAYER Grand
   Prix / Single Race, TWO PLAYERS split-screen Grand Prix / Single Race), the classes (EASY MEDIUM HARD, and WILD once a HARD
   Grand Prix ends in the top 3), banners and hints, best times, sound and music hooks, the parent-page protocol and the
   window.__sk debug handle. Rules: sim.js. Tracks: tracks.js. Drawing: render.js. Online play is net.js's (feature-checked:
   SK.Net); see SK.Main at the bottom for its hooks. SPEC-kart-v2.md section 11.

   SK.Audio (feature-checked; with ?mute=1 it is never touched, and neither is localStorage). Sim events → play(name, arg):
     'count' (3|2|1) 'go' 'start' (1|2 SPROUT START) 'hop' 'drift' (true | 1..3 | false: the skid loop of your own kart)
     'turbo' (1..3) 'boost' ('pad'|'belt'|'berry') 'ring' 'tailwind' 'launch' (kind) 'twirl' 'land' (0|1) 'shortcut'
     'item' (roulette tick) 'got' (item id) 'box' 'lucky' (1|2) 'throw' (juice dropped or tossed) 'splat' (juice lands or is
     driven into) 'blue' 'bluewarn' 'splash' 'puff' 'puffwarn' 'puffpop' 'swirl' 'fling' 'petal' 'thyme' 'hopwarn' 'dodge'
     'grow' 'shrink' 'tiny' 'shield' 'pop' 'hit' (a spin) 'bonk' 'wobble' 'boing' 'immune' 'bounce' 'bump' 'fall' 'lift'
     'lap' 'final' 'finish' (place) 'best' 'menu' 'select', and the hazards within 40 m of a player: 'sprinkler' 'spray'
     'pumpkin' 'barrel' 'rain' 'shower' 'windsock' 'wind' 'steamtell' 'steam' 'pistontell' 'piston'.
   engine(i, speed01, near01, pitchMul) every frame for every kart (pitchMul 1.6 tiny, 0.7 giant; engine(i, -1) silences);
   music('title'|'meadows'|'skyway'|'works'|'results'|null, v) (v bits: 1 final lap, 2 your kart is giant), unlock(),
   mute(on), musicOn(on), hidden(on).
   Storage: 'kart-mute' 'kart-music' 'kart-diff' (0-3) 'kart-best' {trackId: ticks} 'kart-wild' ('1' = WILD unlocked);
   ?mute=1 reads and writes none of them; a bot race (?bot=1 or __sk.bot) never writes a best time or WILD.
   Debug: ?mute=1 ?bot=1 (CPU drives the players and screens advance) ?debug=1 (fps, R); window.__sk (see the bottom). */
'use strict';
(function () {
const SK = window.SK, RD = SK.Render, NT = SK.Net || {};
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search), SILENT = Q.get('mute') === '1';
const DBG = { bot: Q.get('bot') === '1', debug: Q.get('debug') === '1' };
const now = () => performance.now(), clamp = (v, a, b) => v < a ? a : v > b ? b : v;
/* ?mute=1 never touches storage: no reads (defaults are used) and no writes */
const store = { get(k) { if (SILENT) return null; try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { if (SILENT) return; try { localStorage.setItem(k, String(v)); } catch (_) {} } };
const errors = [];
function report(e) { const m = String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '); if (errors.length < 40 && errors.indexOf(m) < 0) { errors.push(m); console.error('[kart]', e); } }
const TR = SK.TRACKS, IN = SK.IN, FWD = IN.FWD || 32;

/* ---------- sound and music ---------- */
const AU = () => SK.Audio || {};
let muted = SILENT || store.get('kart-mute') === '1', musicOn = store.get('kart-music') !== '0', unlocked = false, mus = '';
function au(fn, a, b, c, d) { if (SILENT) return; const A = AU(); if (typeof A[fn] === 'function') try { A[fn](a, b, c, d); } catch (e) { report(e); } }
function unlock() { if (!SILENT && !unlocked) { unlocked = true; au('unlock'); au('mute', muted); au('musicOn', musicOn); } }
function sfx(n, a, vol) { if (!muted) au('play', n, a, vol); }
function music(n, v) { const k = n ? n + (v | 0) : ''; if (k !== mus) { mus = k; au('music', n || null, v | 0); } }
function post(o) { if (NT.post) { try { NT.post(o); } catch (e) { report(e); } return; } try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} }
function setMute(on, quiet) { muted = !!on; if (SILENT) return; au('mute', muted); store.set('kart-mute', muted ? 1 : 0); if (!quiet) post({ ty: 'mute', on: muted }); }
function setMusic(on, quiet) { musicOn = !!on; if (SILENT) return; au('musicOn', musicOn); store.set('kart-music', musicOn ? 1 : 0); if (!quiet) post({ ty: 'music', on: musicOn }); }
au('mute', muted); au('musicOn', musicOn);

/* ---------- layout: a 400-high logical page, 560-800 wide to suit the window; phones held upright get a taller view over a
   control band (padMode). R = canvas pixels per logical unit, from BUCK, at most 2.5, and lowered by dynRes when slow ---------- */
const BUCK = [1, 1.5, 2, 2.5];
let LW = 640, LH = 400, VH = 400, S = 1, R = 0, OX = 0, OY = 0, coarse = false, low = false, padMode = false, rCap = 2.5;
function layout() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = devicePixelRatio || 1;
  coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  low = coarse && Math.min(w, h) < 560;
  VH = 400; LW = clamp(Math.round(VH * w / h), 560, coarse ? 880 : 800);
  padMode = coarse && h / w > 1.15;   /* a phone held upright: a taller view on top, the controls in a band below */
  if (padMode) { LW = 560; LH = Math.max(660, Math.round(LW * h / w)); VH = clamp(LH - 260, 400, 620); } else LH = VH;
  S = Math.min(w / LW, h / LH);
  const want = S * dpr, cap = Math.min(2.5, rCap);
  let r = BUCK[0]; for (const b of BUCK) if (b <= cap && Math.abs(b - want) <= Math.abs(r - want)) r = b;
  const cw = Math.round(LW * r), ch = Math.round(LH * r);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.width = LW * S + 'px'; cv.style.height = LH * S + 'px';
  OX = (w - LW * S) / 2; OY = (h - LH * S) / 2; cv.style.left = OX + 'px'; cv.style.top = OY + 'px';
  if (r !== R || !RD.ready) { R = r; try { RD.init(R, low); } catch (e) { report(e); } }
}

/* ---------- classes and saved things (validated: a bad value is dropped, never trusted) ---------- */
const WILD_HINT = 'Finish a HARD Grand Prix in the top 3 to unlock WILD';
let wild = store.get('kart-wild') === '1';
const NCLS = () => Math.min(4, (SK.DIFF && SK.DIFF.length) || 3);   /* 4 once the sim has WILD */
const maxDiff = () => wild ? NCLS() - 1 : Math.min(2, NCLS() - 1);
let diff = (v => v === '0' || v === '1' || v === '2' || (v === '3' && wild) ? +v : 1)(store.get('kart-diff'));
function loadBest() {
  const out = {};
  try {
    const o = JSON.parse(store.get('kart-best') || '{}');
    if (o && typeof o === 'object' && !Array.isArray(o)) for (const T of TR) {
      if (!Object.prototype.hasOwnProperty.call(o, T.id)) continue;
      const v = o[T.id]; if (typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 1e8) out[T.id] = v;
    }
  } catch (_) {}
  return out;
}
let best = loadBest();

/* ---------- state ---------- */
let screen = 'title', players = 1, gp = null, trackIx = 0, clsOv = null;
let sim = null, ut = 0, scrUt = 0, paused = false, pauseSel = 0, titleSel = 0, trackSel = 0, forceVis = false, ffwd = false;
let me = [0], doneUt = -1, results = null, resRows = null, newBest = '', touchMode = false, raceBot = false, podiumUnlock = false;
let note = null;   /* a one-line note on the title (the WILD lock), {text, ut} */
const banners = [null, null], placeUt = [0, 0], lastPlace = [0, 0];
/* per race: banner counters, the item hint, the threat sounds */
const twirlN = [0, 0], cutShown = [false, false], ringLap = [-1, -1], hint = [{ id: 0, text: '', why: '' }, { id: 0, text: '', why: '' }], hopOn = [false, false];
const hintSeen = [new Set(), new Set()];   /* this session only, never stored */
let blueWarned = new Set();
let wasDrift = false, demo = null, demoK = 0, demoUt = 0, demoTrack = 0, seedBase = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
const hidden = () => !forceVis && !!document.hidden;
const newGp = () => ({ round: 0, order: [0, 1, 2], totals: {}, cls: diff, bot: !!DBG.bot });

function goScreen(s) { screen = s; scrUt = ut; }
/* the room (kart-room.js) learns which screen is up and whether the race is paused: on an upright phone its tag sits in the
   control band, which the menus use (fix round 1) */
let postedScr = '';
function postScreen() { const k = screen + (paused ? '/p' : ''); if (k !== postedScr) { postedScr = k; post({ ty: 'screen', s: screen, paused: !!paused }); } }
/* back to the title: the attract demo restarts on the track that is already prepared, so nothing is rebuilt (review E2) */
function toTitle() { endEngines(); sim = null; gp = null; paused = false; demo = null; goScreen('title'); }
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
  sim = new SK.Sim({ track: T, racers, seed: seed != null ? seed >>> 0 : (seedBase = (seedBase * 1664525 + 1013904223) >>> 0), cls: clsOv != null ? clsOv : diff });
  raceBot = !!DBG.bot; if (gp && raceBot) gp.bot = true;
  if (DBG.bot) for (const i of me) sim.bot[i] = true;
  au('ahead', 0.7); RD.setTrack(T); me.forEach((i, s) => RD.camera(s, sim.karts[i], true));
  paused = false; doneUt = -1; results = resRows = null; newBest = ''; banners[0] = banners[1] = null; lastPlace[0] = lastPlace[1] = 0;
  for (let p = 0; p < 2; p++) { twirlN[p] = 0; cutShown[p] = false; ringLap[p] = -1; hint[p].id = 0; hint[p].text = ''; hint[p].why = ''; hopOn[p] = false; latch[p] = 0; }
  blueWarned = new Set();
  goScreen('race');
}
function startMode(two, isGp, ti) {
  players = two ? 2 : 1;
  gp = isGp ? newGp() : null;
  startRace(isGp ? 0 : ti | 0);
}
const ORD = n => n + (['th', 'st', 'nd', 'rd'][n] || 'th');
const num = v => typeof v === 'number' && isFinite(v) ? v : v && typeof v === 'object' ? Object.keys(v).reduce((a, k) => a + num(v[k]), 0) : 0;
/* a human row's fun line from k.stats, e.g. "Bumped 4 · Got bumped 3 · Twirls 7 · Shortcuts 2 · Comeback 6th→2nd" */
function funLine(k, place) {
  const s = k && k.stats; if (!s || typeof s !== 'object') return '';
  const parts = [], add = (lbl, v) => { v = num(v); if (v > 0 && parts.length < 4) parts.push(lbl + ' ' + v); };
  add('Bumped', s.gave); add('Got bumped', s.got); add('Twirls', s.twirls); add('Shortcuts', s.cuts); add('Tailwinds', s.tailwinds); add('Nice hops', s.dodges);
  const w = num(s.worst) | 0; if (w >= 1 && w <= 6 && w - place >= 2) parts.push('Comeback ' + ORD(w) + '→' + ORD(place));
  return parts.join(' · ');
}
function finishRace() {
  /* the CPUs still racing are driven home first, so every row has a real time and the Grand Prix points use the final
     order (review P4/A20). Online, net.js sees SK.Main.ffwd while this runs */
  if (typeof sim.fastForward === 'function') { ffwd = true; try { sim.fastForward(3600); } catch (e) { report(e); } ffwd = false; }
  results = sim.results(); const T = sim.track;
  newBest = '';
  try {   /* a broken best-time board can never stop the results (review E4) */
    if (!raceBot && !DBG.bot) for (const r of results) if (!r.cpu && !r.est && r.time > 0) { const k = T.id, t = Math.round(r.time); if (!best[k] || t < best[k]) { best[k] = t; newBest = 'NEW BEST TIME! ' + RD.fmtTime(t); } }
    if (newBest) { store.set('kart-best', JSON.stringify(best)); setTimeout(() => sfx('best'), 900); }
  } catch (e) { report(e); }
  if (gp) try { SK.GP.add(gp.totals, results.map(r => ({ i: r.who, place: r.place }))); } catch (e) { report(e); }
  resRows = results.map(r => {
    const k = sim.karts[r.i], est = !!r.est;
    return { place: r.place, who: r.who, time: (est ? '~' : '') + RD.fmtTime(r.time), est, me: !r.cpu, tag: !r.cpu && players === 2 ? (r.who === 0 ? '(P1)' : '(P2)') : '',
      pts: SK.GP.POINTS[r.place - 1] || 0, total: gp ? gp.totals[r.who] || 0 : 0, fun: !r.cpu ? funLine(k, r.place) : '' };
  });
  goScreen('results');
}
function nextFromResults() {
  const NH = SK.Main.hooks; if (NH.next && NH.next() === false) return;   /* NET HOOK (net.js): online, the host moves both players on */
  if (gp) { if (gp.round < 2) { gp.round++; startRace(gp.order[gp.round]); } else { podiumUnlock = checkWild(); goScreen('podium'); sfx('finish', 1); } }
  else startRace(trackIx);
}
function standings() { const o = []; for (let w = 0; w < 6; w++) o.push({ who: w, pts: (gp && gp.totals[w]) || 0 }); o.sort((a, b) => b.pts - a.pts || a.who - b.who); return o; }
/* WILD: a HARD Grand Prix with a player in the top 3 of the standings. Never under ?mute=1 or in a bot Grand Prix */
function checkWild() {
  if (wild || SILENT || DBG.bot || !gp || gp.bot || gp.cls !== 2 || !sim || NCLS() < 4) return false;
  const top = standings().slice(0, 3).map(o => o.who);
  if (!me.some(i => sim.karts[i] && !sim.karts[i].cpu && top.indexOf(sim.karts[i].who) >= 0)) return false;
  wild = true; store.set('kart-wild', 1); return true;
}

/* ---------- input: held keys and touches, plus a latch of fresh presses so a tap between two ticks still counts (E7) ---------- */
const held = new Set(); let hits = [];
/* keys a menu used (CARRY ON with ENTER or SPACE, a race started from the title...) do nothing in the race until they are let go
   (review: ENTER on CARRY ON also fired the held item, SPACE hopped) */
const swallow = new Set();
function eat(c) { let b = 0; for (const n in KMAP) b |= KMAP[n].get(c) | 0; latch[0] &= ~b; latch[1] &= ~b; if (held.has(c)) swallow.add(c); }
const latch = [0, 0], LATCH = IN.DRIFT | IN.ITEM | FWD;   /* only presses are latched: steering is held */
const GAMEKEY = /^(Arrow|Space$|Enter$|NumpadEnter$|Slash$|ShiftRight$|ShiftLeft$|Tab$)/;
const KEYS = {
  one: [[IN.LEFT, 'ArrowLeft', 'KeyA'], [IN.RIGHT, 'ArrowRight', 'KeyD'], [IN.BRAKE, 'ArrowDown', 'KeyS'], [IN.DRIFT, 'Space'], [IN.ITEM, 'ShiftLeft', 'ShiftRight', 'KeyE', 'Enter', 'NumpadEnter', 'KeyX'], [FWD, 'KeyW', 'ArrowUp']],
  p1: [[IN.LEFT, 'KeyA'], [IN.RIGHT, 'KeyD'], [IN.BRAKE, 'KeyS'], [IN.DRIFT, 'Space'], [IN.ITEM, 'KeyE', 'KeyQ'], [FWD, 'KeyW']],
  p2: [[IN.LEFT, 'ArrowLeft'], [IN.RIGHT, 'ArrowRight'], [IN.BRAKE, 'ArrowDown'], [IN.DRIFT, 'ShiftRight', 'Slash'], [IN.ITEM, 'Enter', 'NumpadEnter'], [FWD, 'ArrowUp']]
};
const KMAP = {}; for (const n in KEYS) { const m = KMAP[n] = new Map(); for (const [bit, ...codes] of KEYS[n]) for (const c of codes) m.set(c, (m.get(c) | 0) | bit); }
const kmapOf = p => players === 1 ? KMAP.one : p ? KMAP.p2 : KMAP.p1;
function latchKey(c) { for (let p = 0; p < players && p < 2; p++) latch[p] |= (kmapOf(p).get(c) | 0) & LATCH; }
addEventListener('keydown', e => {
  const c = e.code || e.key || '';
  /* Tab is the game's only during a race (so P1's Q never jumps out); on the menus it reaches the room's buttons */
  if (GAMEKEY.test(c) && (c !== 'Tab' || (screen === 'race' && !paused))) e.preventDefault();
  unlock(); touchMode = false;
  held.add(c); if (!e.repeat) { hits.push(c); latchKey(c); }
});
addEventListener('keyup', e => { const c = e.code || e.key || ''; held.delete(c); swallow.delete(c); });
/* focus lost (the planet page or another window clicked): let go of everything, and offline pause the race unless the focus
   is back within 300 ms (the room's own Sound/Music buttons hand it straight back) (E9) */
let blurT = 0;
addEventListener('blur', () => {
  held.clear(); swallow.clear(); TP.clear(); latch[0] = latch[1] = 0; clearTimeout(blurT); blurT = 0;
  if (screen === 'race' && sim && !sim.done && !paused && !live() && !forceVis) blurT = setTimeout(() => {
    blurT = 0; if (!document.hasFocus() && screen === 'race' && sim && !sim.done && !paused && !live()) { paused = true; pauseSel = 0; }
  }, 300);
});
addEventListener('focus', () => { clearTimeout(blurT); blurT = 0; });
function keyMask(p) { const M = kmapOf(p); let m = 0; for (const c of held) if (!swallow.has(c)) m |= M.get(c) | 0; if (p === 0) m |= touchMask(); return m; }
/* touch: pointers held on the steer zones and buttons (no FWD on touch: juice is dropped, never tossed) */
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
  if (screen === 'race' && SK.Main.hooks.tap && SK.Main.hooks.tap(x, y)) return;   /* NET HOOK: online, the "went quiet" note takes its tap first (fix round 1) */
  if (screen === 'race' && !paused && PZ && x >= PZ.x && x <= PZ.x + PZ.w && y >= PZ.y && y <= PZ.y + PZ.h) { paused = true; pauseSel = 0; sfx('menu'); return; }
  if (screen === 'race' && !paused && sim && e.pointerType !== 'mouse') { const z = zoneAt(x, y); TP.set(e.pointerId, z); if (z === 'drift') latch[0] |= IN.DRIFT; else if (z === 'item') latch[0] |= IN.ITEM; return; }
  tap(x, y);   /* the screens are drawn over the full page height (LH), so page units are their units */
}, { passive: false });
document.addEventListener('pointermove', e => { if (TP.has(e.pointerId)) { const [x, y] = toL(e); TP.set(e.pointerId, zoneAt(x, y)); } }, { passive: true });
const pUp = e => TP.delete(e.pointerId);
document.addEventListener('pointerup', pUp); document.addEventListener('pointercancel', pUp);
document.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
function showNote(text) { note = { text, ut }; }
function pickDiff(i) {
  if (i < 0 || i >= NCLS()) return false;
  if (i > maxDiff()) { showNote(WILD_HINT); sfx('menu'); return false; }   /* WILD, still locked */
  diff = i; store.set('kart-diff', diff); return true;
}
function tap(x, y) {
  if (SK.Main.hooks.tap && SK.Main.hooks.tap(x, y)) return;   /* NET HOOK (net.js): online taps (a waiting guest, "race on alone") */
  const U = RD.UI, inR = r => !!r && r.w > 0 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (screen === 'title') {
    if (inR(U.snd[0])) { setMute(!muted); sfx('select'); return; }
    if (inR(U.snd[1])) { setMusic(!musicOn); sfx('select'); return; }
    U.diff.forEach((r, i) => { if (inR(r) && pickDiff(i)) sfx('select'); });
    U.btn.forEach((r, i) => { if (inR(r)) { titleSel = i; choose(i); } });
  } else if (screen === 'tracks') {
    if (U.back ? inR(U.back) : y > LH - 50) { sfx('menu'); goScreen('title'); return; }   /* the BACK pill (A3) */
    U.tracks.forEach((r, i) => { if (inR(r) && screen === 'tracks') { trackSel = i; sfx('select'); startMode(players === 2, false, i); } });
  } else if (screen === 'race' && paused) { U.menu.forEach((r, i) => { if (inR(r)) pauseChoose(i); }); }
  else if (screen === 'results' && ut - scrUt > 40) { sfx('select'); nextFromResults(); }
  else if (screen === 'podium' && ut - scrUt > 60) { sfx('select'); toTitle(); }
}
function choose(i) { sfx('select'); const two = i >= 2, isGp = (i & 1) === 0; players = two ? 2 : 1; if (isGp) startMode(two, true); else { trackSel = trackIx; goScreen('tracks'); } }
function pauseChoose(i) { if (i === 0) { paused = false; sfx('select'); } else if (i === 1) { sfx('menu'); toTitle(); } else { sfx('menu'); post({ ty: 'exit' }); toTitle(); } }
function onKey(c) {
  if (c === 'KeyM') { setMute(!muted); return; }
  if (c === 'KeyN') { setMusic(!musicOn); return; }
  if (SK.Main.hooks.key && SK.Main.hooks.key(c)) return true;   /* NET HOOK (net.js): online keys (a waiting guest, "race on alone"); the key is then eaten */
  const go = c === 'Space' || c === 'Enter' || c === 'NumpadEnter', up = c === 'ArrowUp' || c === 'KeyW', dn = c === 'ArrowDown' || c === 'KeyS', lf = c === 'ArrowLeft' || c === 'KeyA', rt = c === 'ArrowRight' || c === 'KeyD';
  if (screen === 'title') {
    if (c === 'Escape' || c === 'Backspace') { post({ ty: 'exit' }); return; }
    if (titleSel === 4) { if (lf || rt) { if (pickDiff(diff + (rt ? 1 : -1))) sfx('menu'); } else if (up) titleSel = 2; else if (go) { titleSel = 0; sfx('select'); } return; }
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

/* ---------- events → sound, banners ---------- */
const nearHuman = k => { let d = 1e9; for (const i of me) { const h = sim.karts[i]; if (h) d = Math.min(d, Math.hypot(h.x - k.x, h.y - k.y)); } return d; };
function onEvents(s) {
  for (const e of s.events) {
    const n = e[0], i = e[1], a = e[2];
    try { RD.fxEvent(s, e); } catch (er) { report(er); }
    if (s !== sim) continue;
    if (i < 0) { worldEvent(n, a); continue; }
    const k = s.karts[i]; if (!k) continue;
    const slot = me.indexOf(i), mine = slot >= 0;   /* a kart on one of our views */
    if (mine && slot < 2) banner(slot, n, a, k);
    const d = mine ? 0 : nearHuman(k);
    if (mine || d < 28) sound(n, a, mine, slot, mine ? 1 : Math.max(0.3, 1 - d / 40));
  }
}
/* banners: one at a time per view; a new one replaces the current one if its priority is at least as high, or the current one
   is older than 30 ticks */
const SUB = {
  spin: { splat: 'a juicy spin', lob: 'a juice toss', blue: 'a blueberry splash', giant: 'a giant bump', petal: 'daisy petals' },
  bonk: { pumpkin: 'a rolling pumpkin', barrel: 'a juice barrel', puff: 'a wish puff landed' },
  wobble: { sprinkler: 'sprinkler splash', steam: 'a puff of steam', rain: 'a rain shower', petal: 'daisy petals', basket: 'a hanging basket', blue: 'a splash', puff: 'a splash' }
};
function setBanner(p, pri, text, sub, col, size, life) {
  const c = banners[p];
  if (c && c.age < (c.life || 110) && c.age <= 30 && (c.pri | 0) > pri) return;
  banners[p] = { text, sub: sub || '', col: col || '#fff', size: size || 40, life: life || 90, pri, age: 0 };
}
function banner(p, n, a, k) {
  switch (n) {
    case 'spin': return setBanner(p, 3, 'WHEEE!', SUB.spin[a], '#ffb8c8', 34, 80);
    case 'bonk': return setBanner(p, 3, 'BONK!', SUB.bonk[a], '#ffd0a0', 36, 80);
    case 'wobble': return setBanner(p, 3, 'WIBBLE!', SUB.wobble[a], '#bfe8ff', 32, 70);
    case 'tiny': return setBanner(p, 3, 'TINY!', 'a thyme sparkle', '#e4d8ff', 36, 90);
    case 'shield': if (a === 'pop') setBanner(p, 3, 'SAVED BY THE BUBBLE!', '', '#bfe8ff', 26, 70); return;
    case 'immune': return k.giant > 0 ? setBanner(p, 3, 'TOO BIG TO SPIN!', '', '#b6f07a', 28, 60) : setBanner(p, 3, 'SAFE!', 'still dizzy from the last one', '#bfe8ff', 30, 60);
    case 'lucky': if (a === 2) setBanner(p, 2, 'SUPER LUCKY!', 'a GIANT SPROUT for you', '#8fe07a', 34, 80); return;   /* LUCKY is a flash on the item slot (render) */
    case 'giant': if (a) setBanner(p, 2, 'GIANT SPROUT!', '', '#8fe07a', 34, 90); return;
    case 'dodge': return setBanner(p, 2, 'NICE HOP!', '', '#ffd93b', 30, 60);
    case 'start': return setBanner(p, 1, a === 2 ? 'SUPER SPROUT START!' : 'SPROUT START!', '', '#ffd93b', a === 2 ? 30 : 32, 80);
    case 'turbo': if (a === 3) setBanner(p, 1, 'GOLDEN TURBO!', '', '#ffd93b', 26, 50); return;
    case 'tailwind': return setBanner(p, 1, 'TAILWIND!', '', '#e9f6ff', 28, 60);
    case 'land': if (a === 1 && twirlN[p] < 3) { twirlN[p]++; setBanner(p, 1, 'TWIRL!', '', '#ffc8f0', 30, 50); } return;
    case 'shortcut': if (!cutShown[p]) { cutShown[p] = true; setBanner(p, 1, 'SHORTCUT!', '', '#b6f07a', 30, 70); } return;
    case 'boost': if (a === 'ring' && ringLap[p] !== k.lap) { ringLap[p] = k.lap; setBanner(p, 1, 'RAINBOW RUSH!', '', '#ffd93b', 30, 60); } return;
    case 'lap': return setBanner(p, 1, 'LAP ' + a, '', '#fff', 40, 90);
    case 'final': return setBanner(p, 1, 'FINAL LAP!', 'surprise bubbles come back faster', '#ffb27a', 40, 110);
  }
}
/* sim events → the audio names (see the header) */
function sound(n, a, mine, slot, vol) {
  const play = (nm, ar) => sfx(nm, ar, vol);
  switch (n) {
    case 'drift': if (a === 'hop') play('hop'); else if (mine && slot === 0) play('drift', true); return;
    case 'spark': if (mine && slot === 0) play('drift', a); return;
    case 'turbo': play('turbo', a); if (mine && slot === 0) play('drift', false); return;
    case 'item': if (mine) play('got', a); return;
    case 'use': { const id = typeof a === 'number' ? SK.ITEMS[a] : a; if (id === 'splat' || id === 'splat3') play('throw'); return; }
    case 'splat': if (a !== 'drop') play('splat', a); return;   /* a drop already sounded as its 'use' */
    case 'boost': if (a === 'ring') play('ring'); else play('boost', a); return;
    case 'shield': play(a === 'pop' ? 'pop' : 'shield'); return;
    case 'balloon': play('lift'); return;
    case 'giant': play(a ? 'grow' : 'shrink'); return;
    case 'spin': play('hit', a); return;
    case 'puffhover': if (mine) play('puffwarn'); return;
    case 'lap': case 'final': case 'finish': if (mine) play(n, a); return;
    case 'start': case 'lucky': case 'shortcut': case 'tailwind': case 'dodge': case 'tiny': case 'immune': if (mine) play(n, a); return;   /* your own kart only */
    case 'launch': case 'twirl': case 'land': case 'blue': case 'splash':
    case 'puff': case 'puffpop': case 'swirl': case 'fling': case 'petal': case 'thyme': case 'bonk':
    case 'wobble': case 'boing': case 'bounce': case 'box': case 'bump': case 'fall':
      play(n, a); return;
  }
}
/* events of the world (kart -1): the countdown, items popping, and the hazards (heard only within 40 m of a player) */
const HZS = { sprinkler: ['sprinkler', 'spray'], rain: ['rain', 'shower'], gust: ['windsock', 'wind'], steam: ['steamtell', 'steam'], piston: ['pistontell', 'piston'] };
const hzOut = { ph: 0, fr: 0, n: 0, x: [0, 0, 0, 0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0, 0, 0, 0], z: [0, 0, 0, 0, 0, 0, 0, 0], lat: [0, 0, 0, 0, 0, 0, 0, 0], rot: [0, 0, 0, 0, 0, 0, 0, 0] };
function worldEvent(n, a) {
  if (n === 'count' || n === 'go') { sfx(n, a); return; }
  if (n === 'pop') { sfx('pop', a); return; }
  if (n !== 'htell' && n !== 'hact' && n !== 'hspawn') return;
  const H = sim.track.hazards && sim.track.hazards[a]; if (!H) return;
  const skin = H.k === 'gust' || H.k === 'piston' ? H.k : H.skin;
  const name = n === 'hspawn' ? (skin === 'pumpkin' || skin === 'barrel' ? skin : '') : HZS[skin] ? HZS[skin][n === 'htell' ? 0 : 1] : '';
  const hd = name ? hazDist(H) : 1e9; if (hd <= 40) sfx(name, 0, Math.max(0.3, 1 - hd / 40));
}
function hazDist(H) {
  let d = 1e9;
  if (typeof SK.hazState !== 'function') return d;
  try { SK.hazState(sim.track, H, sim.clock, hzOut); } catch (e) { report(e); return d; }
  for (let j = 0; j < Math.min(8, hzOut.n | 0); j++) for (const i of me) { const k = sim.karts[i]; if (k) d = Math.min(d, Math.hypot(hzOut.x[j] - k.x, hzOut.y[j] - k.y)); }
  return d;
}
/* after every race tick: the threat cues of our own karts (a blueberry within 40 m, "HOP!" showing) and the first-time item hint */
function afterRaceTick() {
  for (let p = 0; p < me.length && p < 2; p++) {
    const i = me[p], k = sim.karts[i]; if (!k) continue;
    let hop = false;
    for (const it of sim.items) {
      if (it.k === 'blue' && it.tgt === i && !blueWarned.has(it.id) && Math.hypot(it.x - k.x, it.y - k.y) < 40) { blueWarned.add(it.id); sfx('bluewarn'); }
      else if (it.k === 'wave' && ((it.mask >> i) & 1) && !((it.done >> i) & 1)) { if (SK.Sim.hopCue ? SK.Sim.hopCue(it, k) : (k.rp - it.rp > 0 && k.rp - it.rp < 16)) hop = true; }
    }
    if (hop && !hopOn[p]) sfx('hopwarn');
    hopOn[p] = hop;
    const H = hint[p];
    if (k.item && !k.roll) { if (H.id !== k.item) { H.id = k.item; H.text = hintSeen[p].has(k.item) ? '' : (hintSeen[p].add(k.item), hintText(k.item, p)); } }
    else { H.id = 0; H.text = ''; }
    H.why = k.item && !k.roll && typeof sim.whyNot === 'function' ? sim.whyNot(k) : '';   /* a puff while one floats: "a wish puff is already floating" */
  }
}
/* the first time each item is held this session: SK.ITEM_HINTS with that player's keys (touch: no toss, so no toss clause) */
function hintText(id, p) {
  let s = String((SK.ITEM_HINTS || [])[id] || ''); if (!s) return '';
  if (p === 0 && players === 1 && (touchMode || coarse)) return s.split(' · ').filter(x => x.indexOf('{fwd}') < 0).join(' · ').replace(' or toss them ahead', ' behind you').replace(/\{item\}/g, 'ITEM');
  const K = players === 1 ? ['W/↑', 'SHIFT'] : p ? ['↑', 'ENTER'] : ['W', 'E'];
  return s.replace(/\{fwd\}/g, K[0]).replace(/\{item\}/g, K[1]);
}

/* ---------- tick ---------- */
function newDemo(ti) {
  demoTrack = ti;
  demo = new SK.Sim({ track: TR[ti], racers: [2, 3, 4, 5, 1, 0].map((w, j) => ({ who: w, cpu: true, diff: j % 3 })), seed: 777 + ut, countdown: 1, cls: 1 });
  demoK = 5; demoUt = ut; RD.setTrack(TR[ti]); RD.camera(2, demo.karts[demoK], true);
}
/* the attract demo stays on the prepared track (a new track would rebuild its texture and stall the title music, review E2) */
function demoTick() {
  if (!demo || (demo.done && ut - demoUt > 200) || demo.clock > 60 * 150) newDemo(demo ? demoTrack : trackIx);
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
  for (const c of hk) { const menu = screen !== 'race' || paused; if (onKey(c) === true || menu || paused) eat(c); }
  if (screen === 'title' || screen === 'tracks') {
    demoTick(); if (DBG.bot && ut - scrUt > 40 && screen === 'title') startMode(false, false, trackIx);
    /* build the track a race would start on ahead, in idle slices (fix round 1: a cold build froze the picker on slow phones):
       the highlighted one on the picker, the first Grand Prix track while a GRAND PRIX button is chosen */
    if (ut % 20 === 0 && typeof RD.prefetch === 'function') try { if (screen === 'tracks') RD.prefetch(TR[trackSel]); else if ((titleSel & 1) === 0 && titleSel < 4) RD.prefetch(TR[0]); } catch (e) { report(e); }
  }
  else if (sim) {
    if (!paused || live()) {
      const inp = sim.karts.map(() => 0);
      me.forEach((i, p) => { inp[i] = paused ? 0 : keyMask(p) | (p < 2 ? latch[p] : 0); });
      const prevRoll = me.map(i => sim.karts[i].roll);
      const H = SK.Main.hooks;
      if (H.beforeStep) try { H.beforeStep(sim, inp); } catch (e) { report(e); }
      sim.step(inp); onEvents(sim);
      if (H.afterStep) try { H.afterStep(sim); } catch (e) { report(e); }
      me.forEach((i, p) => {
        const k = sim.karts[i]; if (k.roll && (k.roll % 6) === 0 && k.roll !== prevRoll[p]) sfx('item', k.roll / 6);
        if (p === 0 && wasDrift && !k.drift) sfx('drift', false); if (p === 0) wasDrift = !!k.drift;
        if (p === 0 && k.swirl > 0 && k.petals) { let n = 0; for (let b = k.petals; b; b >>= 1) n += b & 1; sfx('orbit', n); }
        if (k.place !== lastPlace[p]) { lastPlace[p] = k.place; placeUt[p] = ut; } RD.camera(p, k); if (banners[p]) banners[p].age++;
      });
      try { afterRaceTick(); } catch (e) { report(e); }
      RD.tick(sim);
      if (sim.done && doneUt < 0) doneUt = ut;
      if (screen === 'race' && doneUt >= 0 && ut - doneUt > 150) finishRace();
    }
    if (paused && wasDrift) { au('play', 'drift', false); wasDrift = false; }
    /* build the next Grand Prix track while the results card is up, not when the next race starts (E2) */
    if (screen === 'results' && ut - scrUt === 30 && gp && gp.round < 2 && typeof RD.prefetch === 'function') try { au('ahead', 0.7); RD.prefetch(TR[gp.order[gp.round + 1]]); } catch (e) { report(e); }
    if (DBG.bot && screen === 'results' && ut - scrUt > 120) nextFromResults();
    if (DBG.bot && screen === 'podium' && ut - scrUt > 150) toTitle();
  }
  latch[0] = latch[1] = 0;
  musicWatch(); postScreen();
}
function musicWatch() {
  if (screen === 'title' || screen === 'tracks') return music('title');
  if (screen === 'results' || screen === 'podium') return music('results');
  if (sim) music(sim.track.theme, (me.some(i => sim.karts[i].lap >= sim.track.laps) ? 1 : 0) | (me.some(i => sim.karts[i].giant > 0) ? 2 : 0));
}

/* ---------- drawing ---------- */
function viewRects() {
  if (players === 2) return [{ x: 0, y: 0, w: LW, h: VH / 2 }, { x: 0, y: VH / 2, w: LW, h: VH / 2 }];
  return [{ x: 0, y: 0, w: LW, h: VH }];
}
function engines() {
  if (!sim || screen === 'title' || screen === 'tracks' || SILENT || muted) return;
  const VT = sim.VT || SK.KART.VMAX;
  for (const k of sim.karts) {
    const mine = me.indexOf(k.i) >= 0, d = mine ? 0 : nearHuman(k), vol = mine ? 1 : Math.max(0, 1 - d / 40);
    if (paused || screen === 'podium' || vol <= 0) au('engine', k.i, -1);
    else au('engine', k.i, Math.min(1.3, Math.abs(k.v) / VT), vol, k.tiny > 0 ? 1.6 : k.giant > 0 ? 0.7 : 1);
  }
}
const noteFor = () => note && ut - note.ut < 180 ? { text: note.text, age: ut - note.ut } : null;
function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.globalAlpha = 1;
  if (LH > VH) RD.screen(ctx, 'band', { W: LW, y: VH, h: LH - VH });
  const W = LW, H = VH, t = ut, touch = touchMode || coarse, oy = (VH - 400) / 2;
  /* the menus get the whole page: W x LH (an upright phone dims and uses its band too, A4); S.VH is the view's height */
  const over = (name, O) => { O.W = W; O.H = LH; O.VH = VH; O.pad = padMode; if (SK.Main.hooks.screen) SK.Main.hooks.screen(name, O); /* NET HOOK (net.js): online wording */ RD.screen(ctx, name, O); };
  if (screen === 'title' || screen === 'tracks') {
    if (demo) RD.drawView(ctx, { x: 0, y: 0, w: W, h: H }, demo, demoK, t, { slot: 2, cached: true });
    if (screen === 'title') over('title', { t: ut - scrUt + 200, touch, sound: !muted, music: musicOn, sel: titleSel, diff, diffs: (SK.DIFF || []).slice(0, NCLS()).map(d => d.name), wild, note: noteFor(), wildHint: WILD_HINT, best, tracks: TR });
    else over('tracks', { t, sel: trackSel, tracks: TR, best, two: players === 2, touch });
  } else if (sim) {
    const rs = screen === 'podium' ? [] : viewRects();
    if (screen === 'podium') RD.drawView(ctx, { x: 0, y: 0, w: W, h: H }, sim, me[0], t, { slot: 0, podium: true });
    rs.forEach((r, p) => {
      const i = me[p]; RD.drawView(ctx, r, sim, i, t, { slot: p });
      const keyHint = touch ? '' : players === 1 ? 'SHIFT' : p ? 'ENTER' : 'E';
      const cdHint = sim.phase === 'count' ? (touch ? 'Tap DRIFT on 1 for a SPROUT START!' : players === 1 ? 'Tap SPACE when the 1 shows for a SPROUT START!' : (p ? 'RIGHT SHIFT' : 'SPACE') + ' on 1: SPROUT START!') : '';
      RD.drawHUD(ctx, r, sim, i, t, { banner: banners[p], placeAge: ut - placeUt[p], map: players === 1 && !padMode, touchUp: touch && !padMode && players === 1, pauseGap: touch && !padMode && players === 1 && screen === 'race' ? 52 : 0, me, itemKey: keyHint, hint: cdHint, itemX: players === 2 && p === 1 ? 92 : 0, itemHint: p < 2 ? hint[p].text : '', itemWhy: p < 2 ? hint[p].why : '' });
    });
    if (players === 2 && screen !== 'podium') { ctx.fillStyle = '#2b2140'; ctx.fillRect(0, VH / 2 - 2, W, 4); ctx.fillStyle = 'rgba(43,33,64,.45)'; ctx.beginPath(); ctx.rect(4, VH / 2 - 44, 88, 88); ctx.fill(); RD.minimap(ctx, sim, 8, VH / 2 - 40, 80, me); }
    if (padMode && screen !== 'podium') { const ms = Math.min(150, (LH - VH) * 0.3 - 20); RD.minimap(ctx, sim, W / 2 - ms / 2, VH + 14, ms, me); }
    if (screen === 'race' && touch && !paused) RD.screen(ctx, 'touch', { W, H: VH, band: padMode ? { y: VH, h: LH - VH } : null, pressed: touchPressed() });
    if (screen === 'results') {
      const T = sim.track, gpT = gp ? 'RACE ' + (gp.round + 1) + ' OF 3 · ' : '';
      over('results', { age: ut - scrUt, rows: resRows, title: gpT + T.name, sub: newBest || (gp ? 'Grand Prix points' : ''), points: !!gp,
        prompt: touch ? 'Tap to ' + (gp ? (gp.round < 2 ? 'start the next race' : 'see the podium') : 'race again') : 'SPACE: ' + (gp ? (gp.round < 2 ? 'next race' : 'the podium') : 'race again'), prompt2: touch ? '' : 'T: title   Esc: leave' });
    } else if (screen === 'podium') over('podium', { age: ut - scrUt, t, standings: standings(), unlock: podiumUnlock, prompt: touch ? 'Tap to finish' : 'SPACE: back to the title' });
    if (paused) over('pause', { sel: pauseSel });
  }
  if (SK.Main.hooks.draw) { ctx.save(); ctx.translate(0, oy); SK.Main.hooks.draw(ctx, W, 400, { LH, VH, pad: padMode }); ctx.restore(); }   /* NET HOOK (net.js): online notes on top (a 400-high block centred in the view; the layout lets it find the menus' own block on an upright phone) */
  engines();
  if (DBG.debug) RD.text(ctx, fps + ' fps R' + R + ' ' + screen + (errors.length ? ' ERR ' + errors.length : ''), 8, H - 12, 11, '#fff', 'left');
}
function touchPressed() { const m = touchMask(); return { left: !!(m & IN.LEFT) || !!(m & IN.BRAKE), right: !!(m & IN.RIGHT) || !!(m & IN.BRAKE), drift: !!(m & IN.DRIFT), item: !!(m & IN.ITEM) }; }

/* ---------- the loop: fixed 60 Hz ticks, at most 4 a frame ---------- */
let acc = 0, last = now(), manual = false, fLast = 0, fN = 0, fSum = 0, wSum = 0, fps = 0;
function safeTick() { try { tick(); } catch (e) { report(e); } }
function safeRender() { try { render(); } catch (e) { report(e); for (let i = 0; i < 16; i++) ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; } }
function run1(t) { const on = live(); acc = Math.min(on ? 2000 : 100, acc + Math.max(0, Math.min(on ? 2000 : 1000, t - last))); last = t; let n = 0; while (acc >= 1000 / 60 && n < (on ? 120 : 4)) { safeTick(); acc -= 1000 / 60; n++; } return n; }   /* online (NET HOOK live): catch up after a stall */
let bgId = 0;
function frame() {
  requestAnimationFrame(frame);
  const t = now(); if (manual) { last = t; return; }
  if (!run1(t)) return;
  safeRender();
  if (fLast) { const d = t - fLast; if (d < 250) { fSum += d; fN++; wSum += now() - t; } }
  fLast = t;
  if (fSum >= 2000) { const mean = fSum / fN, work = wSum / fN; fps = Math.round(1000 / mean); fSum = fN = wSum = 0; if (!hidden()) dynRes(mean, work); }
}
/* dynamic resolution (E5, Berry Breeze's rule), judged over 2 s: if our own work (ticks + drawing) fills half the frame, one
   bucket down; if not (the GPU, or a 30 Hz screen), TRY one down for 2 s and keep it only if frames got 15% quicker, else go
   back and stop trying. 30 s of easy frames → one bucket up (twice at most) */
let probe = null, noProbe = false, cheap = 0, raises = 0;
function dynRes(mean, work) {
  if (probe) { if (!(mean <= probe.mean * 0.85 || work > mean * 0.6)) { rCap = probe.cap; noProbe = true; layout(); } probe = null; cheap = 0; return; }
  const i = BUCK.indexOf(R), busy = work > mean * 0.5;
  if (mean > 20) { cheap = 0; if (i > 0 && (busy || !noProbe)) { probe = busy ? null : { cap: rCap, mean }; rCap = BUCK[i - 1]; layout(); } }
  else if (mean < 18 && work < mean * 0.3 && ++cheap >= 15 && rCap < 2.5 && raises < 2) { cheap = 0; raises++; rCap = BUCK[Math.min(BUCK.length - 1, BUCK.indexOf(rCap) + 1)]; layout(); }
}
document.addEventListener('visibilitychange', () => {
  const hid = hidden(); au('hidden', hid);
  if (hid && screen === 'race' && sim && !sim.done && !live()) { paused = true; pauseSel = 0; }
  /* NET HOOK (live): online, a hidden tab keeps the race (and the link) going from a timer, as rAF stops */
  if (hid && live()) { if (!bgId) bgId = setInterval(() => { if (!manual && hidden()) run1(now()); }, 250); }
  else if (bgId) { clearInterval(bgId); bgId = 0; }
  if (!hid) { acc = 0; last = now(); fLast = 0; }
});

/* ---------- boot ---------- */
addEventListener('resize', layout);
layout();
requestAnimationFrame(frame);
const parseMode = m => { const s = String(m == null ? 'single' : m).toLowerCase(); return { two: /2/.test(s), gp: /gp|grand|prix/.test(s) }; };
const parseTrack = t => { if (t == null) return 0; if (typeof t === 'number') return t; const i = TR.findIndex(T => T.id === t || T.name === t); return i < 0 ? 0 : i; };
/* a class given from outside (online: the host's, which a guest needs no unlock for; tests) */
const parseDiff = d => { if (d == null) return diff; if (typeof d === 'number') return clamp(d | 0, 0, NCLS() - 1); const i = SK.DIFF.findIndex(x => x.id === String(d).toLowerCase()); return i < 0 ? diff : i; };
SK.Main = {
  get sim() { return sim; }, get screen() { return screen; }, get players() { return players; }, get me() { return me; },
  startRace(o) { o = o || {}; players = o.players === 2 ? 2 : 1; diff = parseDiff(o.diff); gp = o.gp ? newGp() : null; startRace(parseTrack(o.track), o.seed); },
  toTitle, post, setMute, setMusic, sfx,
  get gp() { return gp; }, get paused() { return paused; }, get diff() { return diff; },
  /* true while finishRace drives the unfinished CPUs home with sim.fastForward (a host should not send those ticks) */
  get ffwd() { return ffwd; },
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
/* debug handle. Player p = 0 (P1) or 1 (P2). give(p, 'giant'|id), tp(p, f, lat, cutId), clock(n), cls(n|null) (the class of the
   next race starts, until cls(null)), fx(p, kind, by) (a hit, for art checks: kind 'spin'|'bonk'|'wobble'|'tiny'|…),
   wild(on) (WILD unlocked for this page only, nothing stored) */
const pk = p => sim ? sim.karts[me[p | 0] != null ? me[p | 0] : me[0]] : null;
const FXBY = { spin: 'splat', bonk: 'pumpkin', wobble: 'sprinkler', tiny: 'thyme', boing: 'giant', SPIN: 'splat', BONK: 'pumpkin', WOBBLE: 'sprinkler', TINY: 'thyme', BOING: 'giant' };
window.__sk = {
  get state() {
    return { screen, players, gp: gp ? { round: gp.round, cls: gp.cls, totals: Object.assign({}, gp.totals) } : null, track: TR[trackIx].id, diff, wild, cls: sim ? sim.cls : null, paused, ut, titleSel, trackSel,
      phase: sim ? sim.phase : null, clock: sim ? sim.clock : 0, done: sim ? sim.done : false, me: me.slice(),
      karts: sim ? sim.karts.map(k => ({ who: k.who, cpu: k.cpu, lap: k.lap, place: k.place, finished: k.finished, x: +k.x.toFixed(2), y: +k.y.toFixed(2), z: +(k.z || 0).toFixed(2), v: +k.v.toFixed(2), item: SK.ITEMS[k.item], itemN: k.itemN, scale: k.scale != null ? +(+k.scale).toFixed(2) : 1, cut: k.cut != null ? k.cut : -1, giant: k.giant | 0, tiny: k.tiny | 0, spin: k.spin | 0 })) : [],
      banners: banners.map(b => b && b.age < (b.life || 110) ? b.text + (b.sub ? ' / ' + b.sub : '') : null), itemHint: hint.map(h => h.text), note: noteFor(), podiumUnlock,
      rows: resRows ? resRows.map(r => ({ place: r.place, who: r.who, time: r.time, est: r.est, fun: r.fun, pts: r.pts, total: r.total })) : null,
      best: Object.assign({}, best), errors: errors.slice(), muted, music: musicOn, fps, R, rCap, LW, LH, VH, padMode };
  },
  get sim() { return sim; }, get demo() { return demo; }, DBG,
  manual(on) { manual = on !== false; },
  visible(on) { forceVis = on !== false; },
  step(n) { for (let i = 0; i < (n || 1); i++) safeTick(); return ut; },
  render() { safeRender(); },
  key(code, down) { if (down === false) { held.delete(code); swallow.delete(code); } else { held.add(code); hits.push(code); latchKey(code); } },
  start(mode, track, d, seed) { const m = parseMode(mode); diff = parseDiff(d); players = m.two ? 2 : 1; gp = m.gp ? newGp() : null; startRace(m.gp ? 0 : parseTrack(track), seed); return this.state; },
  bot(on) { DBG.bot = on !== false && on !== 0; if (sim) { for (const i of me) sim.bot[i] = DBG.bot; if (DBG.bot) { raceBot = true; if (gp) gp.bot = true; } } },
  give(p, id) { const k = pk(p); if (!k || typeof sim.debugGive !== 'function') return null; sim.debugGive(k, id); return SK.ITEMS[k.item]; },
  tp(p, f, lat, cut) { const k = pk(p); if (!k || typeof sim.debugTeleport !== 'function') return null; sim.debugTeleport(k, f, lat, cut); const s = me.indexOf(k.i); RD.camera(s >= 0 ? s : 0, k, true); return { x: k.x, y: k.y, cut: k.cut }; },
  clock(n) { if (sim && n != null) sim.clock = n | 0; return sim ? sim.clock : 0; },
  cls(n) { clsOv = n == null ? null : clamp(n | 0, 0, 3); return clsOv; },
  fx(p, kind, by) { const k = pk(p); if (!k || typeof sim.debugHit !== 'function') return null; return sim.debugHit(k, kind, by || FXBY[kind] || ''); },
  wild(on) { wild = on !== false; if (!wild && diff > 2) diff = 2; return wild; },
  tap(x, y) { tap(x, y); }, title: toTitle, layout, finish() { if (sim) finishRace(); }
};
post({ ty: 'ready' });
})();
