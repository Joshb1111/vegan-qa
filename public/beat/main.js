/* BEET BEAT — main.js (MAIN). The loop and its two clocks, layout (DPR-aware, letterboxed 16:9; split screen stacks two views),
   input (one button: SPACE / W / UP / click / tap, held = keep hopping), screens, sound and music, and the three ways to play:
   one player (normal mode: a crash restarts from 0 % after 0.6 s), two on one keyboard (split screen; Ruby SPACE or W, Goldie
   UP or ENTER; kind rule: a crash puts you back at your last auto-checkpoint after 1 s; first to 100 % wins), and online
   (each player's run is its own; the other is a ghost; a shared countdown; same kind rule; first to the end wins, decided by
   race times so both screens agree). Rules: sim.js. Level data: levels.js. Wire: net.js. Drawing: render.js. Sound: audio.js.
   THE CLOCK. One-player runs are locked to the music: the sim is stepped to Audio.time() x 240 (the song as heard), so beats and
   obstacles stay together; with no music clock (?mute=1, sound not yet unlocked) it runs on its own fixed 240 Hz clock.
   Two-player and online runs use the fixed clock (respawns break the link to the song anyway); their song just plays from GO.
   Debug: ?mute=1 (never touches audio or storage) ?bot=1 ?debug=1; window.__beat {manual, step, render, key, start, bot, state}.
   Hooks for the next milestone are marked HOOK. */
'use strict';
(function () {
const B = window.BEAT, Sim = B.Sim, RD = B.Render, AU = B.Audio || {}, NT = B.Net || {};
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search), SILENT = Q.get('mute') === '1';
const DBG = { bot: Q.get('bot') === '1', debug: Q.get('debug') === '1' };
const VH = 720, HZ = 240, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const store = { get(k) { if (SILENT) return null; try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { if (SILENT) return; try { localStorage.setItem(k, String(v)); } catch (_) {} } };
const errors = [];
function report(e) { const m = String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '); if (errors.length < 40 && errors.indexOf(m) < 0) { errors.push(m); console.error('[beat]', e); } }

/* ---------- sound and music (with ?mute=1 nothing is ever touched: the chips still toggle, nothing is stored or posted) ---------- */
let muted = SILENT || store.get('beat-mute') === '1', musicOn = store.get('beat-music') !== '0', unlocked = false, curSong = '';
function au(fn, a, b) { if (!SILENT && typeof AU[fn] === 'function') try { return AU[fn](a, b); } catch (e) { report(e); } return null; }
function unlock() { if (!SILENT && !unlocked) { unlocked = true; au('unlock'); } else if (!SILENT) au('unlock'); }
function sfx(n, a) { if (!muted) au('play', n, a); }
function song(name, beat, force) { if (!force && name === curSong) return; curSong = name || ''; au('music', name || null, beat || 0); }
function post(o) { if (NT.post) NT.post(o); else try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} }
function setMute(on, quiet) { muted = !!on; if (SILENT) return; au('mute', muted); store.set('beat-mute', muted ? 1 : 0); if (!quiet) post({ ty: 'mute', on: muted }); }
function setMusic(on, quiet) { musicOn = !!on; if (SILENT) return; au('musicOn', musicOn); store.set('beat-music', musicOn ? 1 : 0); if (!quiet) post({ ty: 'music', on: musicOn }); }
au('mute', muted); au('musicOn', musicOn);

/* ---------- layout: 1280 x 720 per view (two stacked in split screen), scaled to fit and centred ---------- */
const BUCK = [.5, .75, 1, 1.25, 1.5, 2];
let S = 1, R = 0, OX = 0, OY = 0, coarse = false, views = 1, LH = VH, W = 1280;
function layout() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = devicePixelRatio || 1;
  coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  views = mode === 'local' && (scr === 'play' || scr === 'results') ? 2 : 1; LH = VH * views;
  W = coarse && h > w * 1.1 && views === 1 ? 800 : 1280; RD.setView(W);   /* an upright phone: a narrower, closer view */
  S = Math.min(w / W, h / LH);
  const want = S * dpr, cap = coarse ? 1.25 : 1.5;   /* phones draw at a lower internal resolution */
  let r = BUCK[0]; for (const b of BUCK) if (b <= cap && Math.abs(b - want) <= Math.abs(r - want)) r = b;
  const cw = Math.round(W * r), ch = Math.round(LH * r);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.width = W * S + 'px'; cv.style.height = LH * S + 'px';
  OX = (w - W * S) / 2; OY = (h - LH * S) / 2; cv.style.left = OX + 'px'; cv.style.top = OY + 'px';
  if (r !== R || !RD.ready) { R = r; try { RD.init(R); } catch (e) { report(e); } }
}

/* ---------- state ---------- */
let scr = 'title', mode = 'solo', sim = null, lvIx = 0, LV = B.LEVELS[0], paused = false, ut = 0, scrUt = 0, phase = 'race', goAt = 0, lastCount = -1;
let touchMode = false, forceVis = false, results = null, winner = -1, endAt = -1, toast = '', toastUt = -999, newBestUt = -999, newBestPct = 0;
let best = {}; try { best = JSON.parse(store.get('beat-best') || '{}') || {}; } catch (_) { best = {}; }
const V = [0, 1].map(() => ({ cam: { x: -10, y: 0 }, rv: 0, sqAt: -99, used: { pad: -1, padAt: -99, ring: -1, ringAt: -99 }, trailAt: 0, deadAt: -99, cps: [], attX: 0 }));
let fx = [], words = [];
/* online */
let online = null;   /* {role, me, opp, who, run, startAt, myFin, myOut, oppFin, oppOut, decided, quiet, verBad, ghost, lastSend, oppPct, heard} */
const spb = () => 60 / LV.bpm;
const hidden = () => !forceVis && !!document.hidden;
let manual = false, manualBase = 0;
const gnow = () => manual ? manualBase + ut * 1000 / 60 : performance.now();
const tsec = () => ut / 60;

function resetViews() { for (const v of V) { v.cam.x = -10; v.cam.y = 0; v.rv = 0; v.sqAt = -99; v.used = { pad: -1, padAt: -99, ring: -1, ringAt: -99 }; v.deadAt = -99; v.cps = []; v.attX = 0; } fx = []; words = []; }
function setScr(s) { scr = s; scrUt = ut; layout(); }
function startSolo() {
  if (online) return;
  mode = 'solo'; soloWho = 0; sim = new Sim(LV, { players: 1 }); paused = false; phase = 'race'; results = null; winner = -1; endAt = -1; resetViews(); setScr('play');
  attemptWord(); au('cues', LV.presses); song(LV.track, 0, true); botReset();
}
function startLocal() {
  if (online) return;
  mode = 'local'; soloWho = 0; sim = new Sim(LV, { players: 2, kind2p: true }); paused = false; results = null; winner = -1; endAt = -1; resetViews(); setScr('play');
  au('cues', null); phase = 'count'; goAt = gnow() + 3000; lastCount = -1; song(null); botReset();
}
function toTitle() { if (online) return; mode = 'solo'; sim = null; paused = false; results = null; setScr('title'); au('cues', null); song('title', 0); }
function attemptWord() { const p = sim.players[0]; words = [{ x: p.x + 7, y: 6, s: 'ATTEMPT ' + p.att, z: 44 }]; }
function showToast(s) { toast = s; toastUt = ut; }

/* ---------- input: held keys per player, a latch so a tap shorter than a frame still counts ---------- */
const KEYS1 = { Space: 1, KeyW: 1, ArrowUp: 1 }, KEYS_L1 = { Space: 1, KeyW: 1 }, KEYS_L2 = { ArrowUp: 1, Enter: 1, NumpadEnter: 1 };
const down = new Set(), latch = [false, false], ptr = new Map();
let hits = [];
function heldBy(i) {
  if (mode === 'local') { const K = i ? KEYS_L2 : KEYS_L1; for (const c of down) if (K[c]) return true; for (const v of ptr.values()) if (v === i) return true; return false; }
  if (i) return false;
  for (const c of down) if (KEYS1[c]) return true; return ptr.size > 0;
}
addEventListener('keydown', e => {
  const c = e.code || e.key || '';
  if (/^(Arrow|Space$|Enter$|NumpadEnter$)/.test(c)) e.preventDefault();
  unlock(); touchMode = false;
  if (e.repeat) return;
  down.add(c); hits.push(c);
  if (scr === 'play' && !paused) { if (mode === 'local') { if (KEYS_L1[c]) latch[0] = true; if (KEYS_L2[c]) latch[1] = true; } else if (KEYS1[c]) latch[0] = true; }
});
addEventListener('keyup', e => { down.delete(e.code || e.key || ''); });
addEventListener('blur', () => { down.clear(); ptr.clear(); });
const inR = (r, x, y) => !!r && r.w > 0 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
document.addEventListener('pointerdown', e => {
  unlock(); try { cv.focus({ preventScroll: true }); } catch (_) {}
  if (e.pointerType !== 'mouse') touchMode = true;
  if (e.cancelable && e.pointerType !== 'mouse') e.preventDefault();
  const x = (e.clientX - OX) / S, y = (e.clientY - OY) / S;
  pointer(x, y, e.pointerId);
}, { passive: false });
function pointer(x, y, id) {
  const U = RD.UI;
  if (online && (online.quiet || online.verBad)) { playAlone(); return; }
  if (scr === 'title') {
    if (inR(U.snd[0], x, y)) { setMute(!muted); sfx('select'); return; }
    if (inR(U.snd[1], x, y)) { setMusic(!musicOn); sfx('select'); return; }
    if (online) return;
    if (inR(U.b2, x, y)) { sfx('select'); startLocal(); } else { sfx('select'); startSolo(); }
    return;
  }
  if (scr === 'results') { if (ut - scrUt > 30) again(); return; }
  if (scr !== 'play') return;
  if (paused) { if (inR(U.back, x, y)) toTitle(); else paused = false; resumeSong(); return; }
  if (inR(U.pause, x, y) && mode !== 'online') { pause(); return; }
  const who = mode === 'local' ? (y < VH ? 0 : 1) : 0;
  ptr.set(id, who); latch[who] = true;
}
const pUp = e => { ptr.delete(e.pointerId); };
document.addEventListener('pointerup', pUp); document.addEventListener('pointercancel', pUp);
document.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

function pause() { if (mode === 'online' || scr !== 'play') return; paused = true; down.clear(); ptr.clear(); song(null); }
function resumeSong() { if (paused || !sim || phase === 'count') return; let rt = 0; for (const p of sim.players) rt = Math.max(rt, p.rt); song(LV.track, rt / HZ / spb(), true); }
function onKey(c) {
  if (c === 'KeyM') { setMute(!muted); return; }
  if (c === 'KeyN') { setMusic(!musicOn); return; }
  const go = c === 'Space' || c === 'Enter' || c === 'NumpadEnter';
  if (online && (online.quiet || online.verBad)) { if (go) playAlone(); else if (c === 'Escape') post({ ty: 'exit' }); return; }
  if (scr === 'title') {
    if (c === 'Escape') { post({ ty: 'exit' }); return; }   /* Esc on the title: back to the arcade's menu */
    if (online) return;
    if (c === 'Space' || c === 'KeyW' || c === 'ArrowUp') { sfx('select'); startSolo(); } else if (c === 'Enter' || c === 'NumpadEnter') { sfx('select'); startLocal(); }
    return;
  }
  if (scr === 'results') {
    if (c === 'Escape') { if (online) post({ ty: 'exit' }); else toTitle(); return; }
    if (go && ut - scrUt > 30) again();
    return;
  }
  if (scr !== 'play') return;
  if (paused) { if (c === 'Escape') toTitle(); else if (c === 'KeyP' || go) { paused = false; resumeSong(); } return; }
  if (c === 'Escape' || c === 'KeyP') { if (online) { if (c === 'Escape') post({ ty: 'exit' }); } else pause(); return; }
}
function again() {
  if (online) { onlineAgain(); return; }
  if (mode === 'local') startLocal(); else startSolo();
}

/* ---------- the bot: presses where the designer's beats put the runner (levels.js presses), from any checkpoint ---------- */
let botX = null; const botK = [0, 0];
function botReset() { const v = B.SPEEDS[LV.startSpeed], s = spb(); botX = (LV.presses || []).map(b => b * s * v); botK[0] = botK[1] = 0; }
function botWants(i) {
  if (!DBG.bot || !sim || !botX) return false;
  if (mode === 'local' ? false : i > 0) return false;
  const p = sim.players[i]; if (!p.alive || p.fin) return false;
  const v = B.SPEEDS[p.speed] / HZ; let k = botK[i];
  if (k > 0 && botX[k - 1] >= p.x - 1e-6) k = 0;   /* went back (a respawn): search again */
  while (k < botX.length && botX[k] < p.x - 1e-6) k++;
  botK[i] = k;
  if (k < botX.length && botX[k] < p.x + v - 1e-9) { botK[i] = k + 1; return true; }
  return false;
}

/* ---------- the sim and its events ---------- */
const INP = [false, false];
function simStep() {
  for (let i = 0; i < sim.n; i++) { INP[i] = heldBy(i) || latch[i] || botWants(i); latch[i] = false; }
  sim.step(INP);
  if (sim.events.length) { const ev = sim.events.slice(); sim.events.length = 0; for (const e of ev) onEvent(e); }
  if (online && online.oppFin != null && online.myFin == null && !online.myOut && sim.players[0].rt > online.oppFin) onlineOut();
}
function addFx(f) { f.born = tsec(); if (fx.length > 260) fx.shift(); fx.push(f); }
function burst(p, who) {
  const cx = p.x, cy = p.y + .5, C = RD.RUN[who & 1];
  for (let j = 0; j < 10; j++) { const a = j / 10 * Math.PI * 2 + .3; addFx({ k: 'leaf', x: cx, y: cy, vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 5 + 4, r: a, vr: (j & 1 ? 1 : -1) * 6, s: 11 + (j % 3) * 2, life: .9, m: C.leaf }); }
  for (let j = 0; j < 7; j++) { const a = j / 7 * Math.PI * 2; addFx({ k: 'petal', x: cx, y: cy, vx: Math.cos(a) * 3.5, vy: Math.sin(a) * 3 + 5, r: a, vr: 5, c: j & 1 ? '#ff9ac4' : (who ? '#ffd36b' : '#ff7a9a'), life: 1 }); }
  addFx({ k: 'ring', x: cx, y: cy }); addFx({ k: 'txt', x: cx, y: cy + 1.6, s: 'boing!', z: 34, c: who ? '#ffd36b' : '#ff8fb0', life: .9 });
}
let soloWho = 0;   /* after an online race goes solo (the other left), you keep your colour */
function whoOf(i) { return online ? online.who : mode === 'local' ? i : soloWho; }
function onEvent(e) {
  const [n, i, a] = e, p = sim.players[i], v = V[i], who = whoOf(i);
  if (n === 'jump') { sfx('jump'); addFx({ k: 'dust', x: p.x - .3, y: p.y }); }
  else if (n === 'land') { v.sqAt = tsec(); sfx('land'); }
  else if (n === 'pad') { sfx('pad'); v.used.pad = a; v.used.padAt = tsec(); addFx({ k: 'spark', x: p.x, y: p.y + .3 }); }
  else if (n === 'ring') { sfx('ring', sim.L.O.find(o => o.i === a) && sim.L.O.find(o => o.i === a).t === 'ringP' ? 1 : 0); v.used.ring = a; v.used.ringAt = tsec(); addFx({ k: 'ring', x: p.x, y: p.y + .5 }); addFx({ k: 'spark', x: p.x, y: p.y + .5 }); }
  else if (n === 'crash') {
    sfx('crash'); burst(p, who); v.deadAt = tsec();
    if (mode === 'solo' && !sim.kind2p) {
      const pct = a / 10, was = best[LV.id] || 0;
      if (pct > was) { best[LV.id] = Math.floor(pct * 10) / 10; store.set('beat-best', JSON.stringify(best)); if (was > 0 || pct >= 10) { newBestUt = ut; newBestPct = pct; sfx('best'); } }
      song(null);   /* the music stops with the crash; it starts again from the top with the next attempt */
    }
    if (online) NT.event(0, a, online.run);
  }
  else if (n === 'restart') { sfx('spawn'); v.cam.x = p.x - RD.PX / RD.BS; v.cam.y = 0; v.rv = 0; attemptWord(); song(LV.track, 0, true); }
  else if (n === 'respawn') { sfx('spawn'); v.cam.x = p.x - RD.PX / RD.BS; v.rv = p.rot; addFx({ k: 'dust', x: p.x, y: p.y }); addFx({ k: 'spark', x: p.x, y: p.y + .5 }); }
  else if (n === 'cp') { if (mode !== 'online' || true) { v.cps.push([p.x, p.y]); if (v.cps.length > 12) v.cps.shift(); } }
  else if (n === 'finish') {
    if (mode === 'solo' && sim.kind2p) {   /* an online race played on alone after the other left: kind rules, so it does not count for best % */
      sfx('win'); endAt = ut + 70; results = { title: 'FINISHED!', who: who, rows: [['Time', fmt(p.rt)], ['Crashes', String(p.crashes)]] };
    } else if (mode === 'solo') {
      sfx('win'); const was = best[LV.id] || 0; best[LV.id] = 100; store.set('beat-best', JSON.stringify(best)); if (was < 100) { newBestUt = ut; newBestPct = 100; }
      endAt = ut + 70; results = { title: 'LEVEL COMPLETE!', who: 0, rows: [['Attempts', String(p.att)], ['Time', fmt(p.rt)], ['Best', '100%']] };
    } else if (mode === 'local') {
      if (winner < 0) { winner = i; sfx('win'); endAt = ut + 75; }
    } else if (online) { online.myFin = a; NT.event(1, a, online.run); decide(); }
  }
}
const fmt = steps => { const s = steps / HZ, m = Math.floor(s / 60); return (m ? m + ':' + String((s % 60).toFixed(1)).padStart(4, '0') : (s % 60).toFixed(1)) + ' s'; };

/* ---------- online ---------- */
function onLink(L) {
  if (!L) return;
  if (online && !L.first) { online.opp = L.opp || online.opp; return; }   /* the room re-sends the link when the path changes (direct / relayed) */
  sim = null; paused = false; results = null; resetViews();
  mode = 'online';
  online = { role: L.role, me: L.me, opp: L.opp || 'your friend', who: L.role === 'host' ? 0 : 1, run: 0, startAt: 0, myFin: null, myOut: null, oppFin: null, oppOut: null,
    decided: null, quiet: false, verBad: false, ghost: new NT.Ghost(), lastSend: -99, oppPct: 0, heard: false, oppRun: 0 };
  startRun(1, gnow() + (L.startIn >= 3500 ? L.startIn : 3500));
  scr = 'title'; scrUt = ut; layout(); song('title', 0);
}
/* a race: the title counts down until 3 s before GO, then the level view counts 3, 2, 1 */
function startRun(run, at) {
  const o = online; o.run = run; o.startAt = at; o.myFin = o.myOut = o.oppFin = o.oppOut = null; o.decided = null; o.ghost.clear();
  sim = new Sim(LV, { players: 1, kind2p: true }); paused = false; results = null; winner = -1; endAt = -1; resetViews(); botReset();
  phase = 'count'; goAt = at; lastCount = -1; au('cues', null);
  if (run > 1) { setScr('play'); song(null); }
}
function onMsg(o) {
  if (!online) return;
  if (o.k === 'ver') { online.verBad = true; return; }
  online.heard = true; online.oppRun = o.run;
  if (o.run === online.run) { online.ghost.push(o, online.run); online.oppPct = o.pct / 10; }
}
function onNetEvent(type, arg, run) {
  if (!online) return;
  if (type === 3) { if (arg > online.run) { startRun(arg, gnow() + 3000); showToast(online.opp + ' wants another go!'); } return; }
  if (run !== online.run) return;
  if (type === 1) { online.oppFin = arg; decide(); }
  else if (type === 2) { online.oppOut = arg; decide(); }
}
/* the winner from race times only (each side's own, from its own GO), so both screens agree; a tie goes to the host */
function decide() {
  const o = online; if (!o || o.decided) return;
  if (o.myFin != null && o.oppFin != null) o.decided = o.myFin < o.oppFin ? 'me' : o.myFin > o.oppFin ? 'opp' : (o.role === 'host' ? 'me' : 'opp');
  else if (o.myFin != null && o.oppOut != null) o.decided = 'me';
  else if (o.oppFin != null && o.myFin == null && sim && sim.players[0].rt > o.oppFin) { onlineOut(); return; }
  if (o.decided) { sfx(o.decided === 'me' ? 'win' : 'lose'); }
  if (o.myFin != null || o.myOut != null) { if (scr === 'play' && endAt < 0) endAt = ut + 60; }
}
/* the other runner reached the end in less time than we have run: we are out (and say so) */
function onlineOut() {
  const o = online, p = sim.players[0]; if (o.myOut != null) return;
  o.myOut = p.rt; o.myOutPct = p.pct; NT.event(2, p.rt, o.run); o.decided = 'opp'; sfx('lose');   /* the % we stopped at is the one both cards show */
  if (endAt < 0) endAt = ut + 50;
}
function onlineAgain() {
  const o = online; if (!o) return;
  const meDone = o.myFin != null || o.myOut != null, oppDone = o.oppFin != null || o.oppOut != null;
  if (!o.decided || !meDone || !oppDone) return;
  const run = Math.max(o.run, o.oppRun) + 1; NT.event(3, run, run);
  startRun(run, gnow() + 3000 + Math.min(400, (NT.rtt || 0) / 2));
}
function sendState() {
  const o = online, p = sim ? sim.players[0] : null;
  const m = { run: o.run, ph: !sim || phase === 'count' ? 0 : (o.myFin != null || o.myOut != null) ? 2 : 1, lv: lvIx, rt: p ? p.rt : 0,
    x: p ? Math.round(p.x * 64) : 0, y: p ? Math.round(p.y * 64) : 0, vy: p ? clamp(Math.round(p.vy * 64), -64000, 64000) : 0, mode: 0, grav: 1, rot: p ? Math.round(p.rot * 1000) : 0,
    alive: p && p.alive ? 1 : 0, gr: p && p.ground ? 1 : 0, fin: p && p.fin ? 1 : 0, pct: p ? Math.round((o.myOut != null ? o.myOutPct : p.pct) * 10) : 0, att: p ? p.att : 1, cr: p ? p.crashes : 0,
    cp: p && p.cp ? Math.round(p.cp.x * 10) : -1, lp: p ? p.lastPad : -1 };
  NT.send(m); o.lastSend = ut;
}
function playAlone() {
  if (NT.leave) NT.leave(); else post({ ty: 'leave' });
  const was = online; if (was) soloWho = was.who; online = null; mode = 'solo';
  if (scr === 'play' && sim && was) { phase = 'race'; showToast('Playing on your own'); } else startSolo();
}
function onPeerLeft() {
  if (!online) return;
  const who = online.opp, o = online; soloWho = o.who; online = null; mode = 'solo';
  if (scr === 'play' && sim && phase !== 'count') showToast(who + ' left. You can play on your own.');
  else if (scr === 'results') { const p = sim.players[0]; results = { title: o.decided === 'me' ? 'YOU WIN!' : o.decided === 'opp' ? who.toUpperCase().slice(0, 12) + ' WINS!' : 'FINISHED!', titleC: o.decided === 'opp' ? '#ffd36b' : '#7ed957', who: o.decided === 'opp' ? 1 - o.who : o.who,
    rows: [['You', o.myFin != null ? fmt(o.myFin) : Math.floor(p.pct) + '%', RD.RUN[o.who].txt], [who, 'left the garden', RD.RUN[1 - o.who].txt]] }; }
  else { sim = null; setScr('title'); showToast(who + ' left. You can play on your own.'); song('title', 0); }
}
if (NT.init) NT.init({ onLink, onMsg, onPeerLeft, onEvent: onNetEvent, onMute: on => setMute(on, true), onMusic: on => setMusic(on, true) });

/* ---------- one UI tick (60 Hz): keys, countdowns, network, screen changes ---------- */
function uiTick() {
  ut++;
  const hk = hits; hits = [];
  for (const c of hk) onKey(c);
  if (online) {
    online.quiet = NT.silence && NT.silence() > 10000 && (scr === 'play' || scr === 'title' || scr === 'results');
    const racing = scr === 'play' && phase === 'race' && online.myFin == null && online.myOut == null;
    if (ut - online.lastSend >= (racing ? 4 : 15)) sendState();
    if (ut % 120 === 0 && NT.rtt) post({ ty: 'rtt', ms: Math.round(NT.rtt) });
    if (scr === 'title' && gnow() >= online.startAt - 3000) { setScr('play'); song(null); }
  }
  if (scr === 'play' && phase === 'count') {
    const left = goAt - gnow(), n = Math.ceil(left / 1000);
    if (n !== lastCount && n <= 3 && n > 0) { lastCount = n; sfx('count'); }
    if (left <= 0) { phase = 'race'; lastCount = 0; sfx('go'); addFx({ k: 'txt', x: (sim ? sim.players[0].x : 0) + 4, y: 5, s: 'GO!', z: 70, c: '#7ed957', life: .8 }); song(LV.track, 0, true); }
  }
  if (scr === 'play' && endAt >= 0 && ut >= endAt) toResults();
  if (scr === 'title' && !online && DBG.bot && ut - scrUt > 40) startSolo();
  if (scr === 'results' && DBG.bot && !online && ut - scrUt > 150) again();
  music();
}
function music() {
  if (scr === 'title') { if (curSong !== 'title' && !(online && gnow() >= online.startAt - 3000)) song('title', 0); }
  else if (scr === 'results') { const want = online ? (online.decided === 'opp' ? 'done' : 'win') : 'win'; if (curSong !== want) song(want, 0); }
}
function toResults() {
  endAt = -1;
  if (mode === 'local') {
    const ps = sim.players, w = winner;
    results = { title: (w ? 'GOLDIE' : 'RUBY') + ' WINS!', titleC: w ? '#ffd36b' : '#ff8fb0', who: w,
      rows: ps.map((p, i) => [(i ? 'Goldie' : 'Ruby'), (p.fin ? fmt(p.rt) : Math.floor(p.pct) + '%') + ' · ' + p.crashes + ' crash' + (p.crashes === 1 ? '' : 'es'), RD.RUN[i].txt]) };
  } else if (online) {
    const o = online, p = sim.players[0];
    const mine = o.myFin != null ? fmt(o.myFin) : Math.floor(p.pct) + '%', theirs = o.oppFin != null ? fmt(o.oppFin) : (o.oppOut != null ? Math.floor(o.oppPct) + '%' : 'still hopping…');
    results = { online: true };
    results.rows = [['You', mine + ' · ' + p.crashes + ' crash' + (p.crashes === 1 ? '' : 'es'), RD.RUN[o.who].txt], [o.opp, theirs, RD.RUN[1 - o.who].txt]];
  }
  setScr('results');
}
function resultsView() {
  if (!results) return null;
  if (!results.online) return Object.assign({}, results, { prompt: touchMode || coarse ? 'Tap: play again' : 'SPACE: play again   ·   Esc: title' });
  const o = online; if (!o) return Object.assign({}, results, { prompt: touchMode || coarse ? 'Tap: play again' : 'SPACE: play again · Esc: title' });
  const p = sim.players[0];
  const mine = o.myFin != null ? fmt(o.myFin) : Math.floor(o.myOut != null ? o.myOutPct : p.pct) + '%', theirs = o.oppFin != null ? fmt(o.oppFin) : o.oppOut != null ? Math.floor(o.oppPct) + '%' : 'still hopping… ' + Math.floor(o.oppPct) + '%';
  const meDone = o.myFin != null || o.myOut != null, oppDone = o.oppFin != null || o.oppOut != null;
  return { title: o.decided === 'me' ? 'YOU WIN!' : o.decided === 'opp' ? o.opp.toUpperCase().slice(0, 12) + ' WINS!' : 'FINISHED!', titleC: o.decided === 'opp' ? '#ffd36b' : '#7ed957',
    who: o.decided === 'opp' ? 1 - o.who : o.who,
    rows: [['You', mine + ' · ' + p.crashes + ' crash' + (p.crashes === 1 ? '' : 'es'), RD.RUN[o.who].txt], [o.opp, theirs, RD.RUN[1 - o.who].txt]],
    prompt: o.decided && meDone && oppDone ? (touchMode || coarse ? 'Tap: race again' : 'SPACE: race again   ·   Esc: leave') : 'waiting for ' + o.opp + '…' };
}

/* ---------- the clocks ---------- */
let acc = 0;
function lockable() { return mode === 'solo' && !online && sim && !sim.kind2p && !SILENT && curSong === LV.track && sim.players[0].alive && !sim.players[0].fin; }
function simFrame(dtMs) {
  if (scr !== 'play' || paused || !sim || phase === 'count') { acc = 0; return 0; }
  if (online && (online.quiet || online.verBad)) { acc = 0; return 0; }
  let n = 0;
  const at = lockable() && !manual ? au('time') : null;
  if (at != null) {
    /* behind the song: catch up (up to 1 s of steps a frame); ahead of it by 0.5 s (the audio stalled) or 2 s behind (a very slow
       device): start the song again at the run's own beat instead */
    const p = sim.players[0], diff = Math.floor(at * HZ) - p.rt;
    if (diff < -120 || diff > 480) { song(LV.track, p.rt / HZ / spb(), true); n = 0; }
    else n = clamp(diff, 0, 240);
    acc = 0;
  } else { acc += dtMs * HZ / 1000; n = Math.floor(acc); acc -= n; n = Math.min(n, online ? 480 : 48); }
  for (let k = 0; k < n && sim; k++) simStep();
  return n;
}

/* ---------- drawing ---------- */
const TAU = Math.PI * 2;
function beatNow() {
  if (scr === 'play' && sim && phase !== 'count') { const p = sim.players[0]; return p.rt / HZ / spb(); }
  const t = au('time'); return t != null ? t / (60 / 110) : ut / 60 / (60 / 110);
}
function camFollow(v, p, dt) {
  const tx = p.x - RD.PX / RD.BS; v.cam.x = Math.abs(tx - v.cam.x) > 6 ? tx : v.cam.x + (tx - v.cam.x) * Math.min(1, dt * 20);
  const ty = Math.max(0, p.y - 6.5); v.cam.y += (ty - v.cam.y) * (1 - Math.exp(-dt * 5));
}
function runnerOf(i, p, v, t) {
  const sq = clamp(1 - (t - v.sqAt) / .14, 0, 1);
  if (!p.alive && sim.kind2p) {   /* kind rule: the last 0.45 s before a respawn shows where you will be back, blinking */
    const left = B.C.RESPAWN - p.deadT;
    if (left > 0 && left < 108) { const c = p.cp || { x: 0, y: 0, rot: 0 }; return { x: c.x, y: c.y, rot: c.rot, who: whoOf(i), ground: true, alpha: (left / 14 | 0) % 2 ? .3 : .85, preview: true }; }
  }
  v.rv += (p.rot - v.rv) * Math.min(1, .45);
  return { x: p.x, y: p.y, rot: v.rv, who: whoOf(i), sq: p.ground ? sq : 0, ground: p.ground, hide: !p.alive, mood: p.fin ? 'happy' : (!p.ground && p.vy > 15 ? 'happy' : 'open'), mouth: !p.ground && p.vy < -12 ? 'o' : '' };
}
let lastDraw = 0;
function drawPlay(vi) {
  const i = mode === 'local' ? vi : 0, p = sim.players[i], v = V[i], t = tsec(), dt = clamp(t - lastDraw, 0, .1);
  if (vi === views - 1) lastDraw = t;
  const me = runnerOf(i, p, v, t);
  camFollow(v, me.preview ? me : p, dt || 1 / 60);
  const bt = beatNow(), ph = ((bt % 1) + 1) % 1, pulse = Math.exp(-ph * 5);
  const runners = [me], ghosts = [];
  if (mode === 'local') { const j = 1 - i, q = sim.players[j]; if (Math.abs(q.x - p.x) < 20) ghosts.push(Object.assign(runnerOf(j, q, V[j], t), { name: j ? 'Goldie' : 'Ruby' })); }
  if (online) { const g = online.ghost.view(sim.L, manual ? gnow() : performance.now(), NT.rtt); if (g && online.oppRun === online.run) ghosts.push({ x: g.x, y: g.y, rot: g.rot, who: 1 - online.who, ground: g.ground, hide: !g.alive, name: online.opp }); }
  /* the leaf trail */
  if (p.alive && p.ground && !p.fin && phase === 'race' && t - v.trailAt > .09) { v.trailAt = t; addFx({ k: 'trail', x: p.x - .45, y: p.y + .15, r: Math.random() * TAU, m: RD.RUN[whoOf(i)].leaf }); }
  const used = { pad: v.used.pad, padAge: t - v.used.padAt, ring: v.used.ring, ringAge: t - v.used.ringAt };
  const wl = mode === 'solo' ? words : [];
  RD.view(ctx, { sim, cam: v.cam, t, pulse, used, runners, ghosts, words: wl.concat(v.cps.map(c => ({ x: c[0], y: c[1] + 1.6, s: '✿', z: 26, c: '#9be88a' }))),
    fxOver: () => drawFx(v.cam) });
  const marks = mode === 'local' ? sim.players.map((q, j) => ({ pct: q.pct, who: j })) : online ? [{ pct: online.oppPct, who: 1 - online.who }, { pct: p.pct, who: online.who }] : null;
  let sub = '';
  if (online && online.oppFin != null && online.myFin == null && !online.myOut) sub = online.opp + ' reached the end! Keep going…';
  RD.hud(ctx, { pct: p.pct, best: mode === 'solo' && !sim.kind2p ? best[LV.id] || 0 : 0, marks, sub, pauseBtn: (touchMode || coarse) && mode !== 'online' && !paused,
    left: mode === 'local' ? (i ? 'GOLDIE' : 'RUBY') : online ? 'vs ' + online.opp : '', leftC: mode === 'local' ? RD.RUN[i].txt : '#fff' });
  if (phase === 'count') { const left = goAt - gnow(), n = Math.ceil(left / 1000); if (n <= 3) RD.screen(ctx, 'count', { n: Math.max(1, n), k: 1 - ((left / 1000) % 1 + 1) % 1, sub: online ? 'Race ' + online.opp + '! First to the end wins' : mode === 'local' ? (i ? (touchMode ? 'Goldie: tap the bottom half' : 'Goldie: UP or ENTER') : (touchMode ? 'Ruby: tap the top half' : 'Ruby: SPACE or W')) : '' }); }
  else if (lastCount === 0 && ut - scrUt < 9999) { /* GO! is an fx */ }
  if (mode === 'local' && winner >= 0 && scr === 'play') RD.screen(ctx, 'toast', { text: (winner ? 'GOLDIE' : 'RUBY') + ' reached the end!', y: 110, c: RD.RUN[winner].txt });
}
function drawFx(cam) { const t = tsec(); let j = 0; for (let k = 0; k < fx.length; k++) { const f = fx[k]; if (RD.fx(ctx, f, t - f.born, cam)) fx[j++] = f; } if (views === 1 || cam === V[1].cam) fx.length = j; }
let titleCam = { x: 0, y: 0 };
function drawTitle() {
  const t = tsec(); titleCam.x = t * 3;
  const bt = beatNow(), ph = ((bt % 1) + 1) % 1, pulse = Math.exp(-ph * 5);
  RD.view(ctx, { L: null, cam: titleCam, t, pulse });
  const left = online ? Math.max(0, Math.ceil((online.startAt - gnow()) / 1000)) : 0;
  RD.screen(ctx, 'title', { t, beat: bt, pulse, touch: touchMode || coarse, online: !!online, sound: !muted, music: musicOn, level: LV.name, diff: LV.diff, best: best[LV.id] || 0,
    cdText: online ? (left > 3 ? 'Racing ' + online.opp + ' · starting in ' + left + '…' : 'Here we go!') : '', vsText: online ? (online.who ? 'You are GOLDIE · ' + online.opp + ' is RUBY' : 'You are RUBY · ' + online.opp + ' is GOLDIE') : '' });
}
function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.globalAlpha = 1;
  if (scr === 'title') drawTitle();
  else if (sim) {
    for (let vi = 0; vi < views; vi++) { ctx.setTransform(R, 0, 0, R, 0, vi * VH * R); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, VH); ctx.clip(); drawPlay(vi); ctx.restore(); }
    ctx.setTransform(R, 0, 0, R, 0, (LH - VH) / 2 * R);
    if (views === 2) { ctx.save(); ctx.setTransform(R, 0, 0, R, 0, 0); ctx.fillStyle = '#2b2140'; ctx.fillRect(0, VH - 4, W, 8); ctx.restore(); }
    if (scr === 'results') { const r = resultsView(); if (r) RD.screen(ctx, 'results', Object.assign({ age: (ut - scrUt) / 60 }, r)); }
    if (paused) RD.screen(ctx, 'pause', { touch: touchMode || coarse });
    if (mode === 'solo' && ut - newBestUt < 110 && scr === 'play') RD.screen(ctx, 'toast', { text: 'NEW BEST! ' + Math.floor(newBestPct) + '%', y: 120, c: '#ffd36b', a: Math.min(1, (110 - (ut - newBestUt)) / 20) });
  }
  ctx.setTransform(R, 0, 0, R, 0, (LH - VH) / 2 * R);
  if (toast && ut - toastUt < 300) RD.screen(ctx, 'toast', { text: toast, y: 150, a: Math.min(1, (300 - (ut - toastUt)) / 30) });
  if (online && online.verBad) RD.screen(ctx, 'msg', { text: 'Refresh the page\nto play together\nSPACE or tap: play alone' });
  else if (online && online.quiet) RD.screen(ctx, 'msg', { text: online.opp + ' went quiet\nSPACE or tap: play alone' });
  if (DBG.debug) RD.text(ctx, fps + ' fps R' + R + ' ' + mode + (online ? ' rtt ' + Math.round(NT.rtt || 0) : '') + (errors.length ? ' ERR ' + errors.length : ''), 12, VH - 20, 14, '#fff', 'left');
}

/* ---------- the loop: UI at 60 Hz, the sim at 240 Hz on its clock; a hidden online game keeps going from a timer ---------- */
let last = performance.now(), uacc = 0, fLast = 0, fN = 0, fSum = 0, fps = 0, bgId = 0;
function safe(fn) { try { fn(); } catch (e) { report(e); } }
function advance(dt) {
  uacc = Math.min(online ? 2000 : 200, uacc + dt); let k = 0;
  while (uacc >= 1000 / 60 && k < (online ? 120 : 8)) { safe(uiTick); uacc -= 1000 / 60; k++; }
  safe(() => simFrame(dt));
  return k;
}
function frame() {
  requestAnimationFrame(frame);
  const t = performance.now(); if (manual) { last = t; return; }
  const dt = clamp(t - last, 0, online ? 2000 : 100); last = t;
  advance(dt);
  try { render(); } catch (e) { report(e); for (let i = 0; i < 16; i++) ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; }
  if (fLast) { fSum += t - fLast; fN++; if (fSum > 1000) { fps = Math.round(1000 * fN / fSum); fSum = fN = 0; } } fLast = t;
}
document.addEventListener('visibilitychange', () => {
  const hid = hidden(); au('hidden', hid);
  if (hid && scr === 'play' && !online) pause();
  if (hid && online) { if (!bgId) bgId = setInterval(() => { if (!manual && hidden()) { const t = performance.now(); advance(clamp(t - last, 0, 2000)); last = t; } }, 250); }
  else if (bgId) { clearInterval(bgId); bgId = 0; }
  if (!hid) last = performance.now();
});

/* ---------- boot ---------- */
addEventListener('resize', layout);
layout();
song('title', 0);
requestAnimationFrame(frame);
window.__beat = {
  get state() {
    const ps = sim ? sim.players.map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), pct: +p.pct.toFixed(1), alive: p.alive, fin: p.fin, att: p.att, crashes: p.crashes, rt: p.rt, cp: p.cp ? +p.cp.x.toFixed(2) : null })) : [];
    const o = online;
    return { scr, mode, phase, paused, ut, level: LV.id, views, R, S, players: ps, best: best[LV.id] || 0, errors: errors.slice(), muted, music: musicOn, winner, results: scr === 'results' ? resultsView() : null,
      online: o ? { role: o.role, opp: o.opp, run: o.run, oppRun: o.oppRun, myFin: o.myFin, myOut: o.myOut, oppFin: o.oppFin, oppOut: o.oppOut, decided: o.decided, quiet: o.quiet, verBad: o.verBad, heard: o.heard, oppPct: o.oppPct, rtt: Math.round(NT.rtt || 0),
        ghost: o.ghost.d ? { x: +o.ghost.d.x.toFixed(2), y: +o.ghost.d.y.toFixed(2) } : null, startIn: Math.round(o.startAt - gnow()) } : null,
      net: NT.stats ? Object.assign({}, NT.stats) : null, song: curSong, audioTime: au('time') };
  },
  get sim() { return sim; }, get fx() { return fx; }, DBG,
  manual(on) { manual = on !== false; if (manual) manualBase = performance.now() - ut * 1000 / 60; else last = performance.now(); if (NT.setClock) NT.setClock(manual ? gnow : null); },
  visible(on) { forceVis = on !== false; },
  step(n) { for (let i = 0; i < (n || 1); i++) { safe(uiTick); safe(() => simFrame(1000 / 60)); } return ut; },
  render() { try { render(); } catch (e) { report(e); } },
  key(c, isDown) { if (isDown === false) { down.delete(c); return; } down.add(c); hits.push(c); if (scr === 'play' && !paused) { if (mode === 'local') { if (KEYS_L1[c]) latch[0] = true; if (KEYS_L2[c]) latch[1] = true; } else if (KEYS1[c]) latch[0] = true; } },
  tap(x, y) { pointer(x, y, 99); ptr.delete(99); },
  start(level, opts) { opts = opts || {}; const ix = typeof level === 'number' ? level : B.LEVELS.findIndex(l => l.id === level); if (ix >= 0) { lvIx = ix; LV = B.LEVELS[ix]; } if (opts.players === 2) startLocal(); else startSolo(); },
  bot(on) { DBG.bot = on !== false && on !== 0; botReset(); },
  crash(i) { const p = sim && sim.players[i | 0]; if (p && p.alive && !p.fin) { p.alive = false; p.deadT = 0; p.crashes++; sim.events.push(['crash', i | 0, Math.round(p.pct * 10)]); } },
  title: toTitle, layout, setMute, setMusic, get muted() { return muted; }, get music() { return musicOn; },
  solve(opts) { return Sim.solve(LV, opts); }
};
post({ ty: 'ready' });
})();
