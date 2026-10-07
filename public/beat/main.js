/* BEET BEAT — main.js (MAIN). The loop and its two clocks, layout (DPR-aware, letterboxed 16:9; split screen stacks two views),
   input (one button: SPACE / W / UP / click / tap, held = keep hopping), screens (title with level select and the practice
   switch, play, pause menu, results), golden seeds, and the three ways to play: one player (normal: a crash restarts from 0 %
   after 0.6 s; practice: back at your checkpoint, Z drops one, X takes it back), two on one keyboard (split screen; Ruby SPACE
   or W, Goldie UP or ENTER; kind rule: back at your last automatic checkpoint after 1 s, on the beat; first to 100 % wins, the
   same step is a tie), and online (each player's run is its own; the other is a ghost, always drawn under your own runner; a
   shared countdown; the level the start names; same kind rule; the winner by race times so both screens agree, a tie if equal;
   a hidden page stands still while its race time runs on, then 'Welcome back!' 2, 1, also race time: see 'away'; Esc twice leaves).
   Rules: sim.js. Level data: levels.js. Wire: net.js. Drawing: render.js. Sound: audio.js.
   THE CLOCK (every way to play). While the level's song plays, the sim is LOCKED to it: whenever the song is (re)started for
   the run (GO, a restart, a respawn, the end of a pause, the first unlock) it starts at the beat of the run's LEVEL TIME (p.lt,
   steps of the level's own timeline, so it holds after a respawn and through speed portals; two players: whoever is furthest
   along), always AFTER that frame's steps, and an anchor ties the song's time to the sim's step count (sim.t). Each frame the
   sim steps its own frame time plus a pull towards where the song as heard (Audio.time()) says it should be: gentle within a
   step (at most +-25 % speed, ~150 ms to settle: no stutter from the audio clock's jitter), quick beyond (~25 ms: a hitch, slow
   frames), so there is no drift over a whole level; more than 0.5 s behind, or 42 ms ahead (a late sound: device start-up, new
   headphones), or back from a stall off by more than a step, the song starts again at the run's beat (a long freeze is not
   skipped through unseen). Two on one keyboard: after a crash the song only has to be on the beat (both runners keep one beat
   grid), and on the leader's next bar line it is cut back to the leader's place in the level (barCut).
   Muted or with the music off the song keeps its clock, so the lock holds. No song clock (?mute=1, sound not yet unlocked, no
   song for the level, the tab hidden, the audio stalled for 150 ms or running more than 3 % off the wall clock): the fixed
   240 Hz clock (from the frames' own timestamps, so it is smooth), and the song (if any) is put back on the run's beat as soon
   as its clock is back.

   BEAT.Audio (audio.js; every call is feature-checked and wrapped, the game runs without it):
     unlock() on the first key or tap; play(name, arg) with jump land pad ring crash spawn cp seed win best count go select lose
     portal flip (when SFX_NAMES lacks a name: pad / jump stand in); music(id|null, atBeat) with the level's track (or
     another of SONGS with the same bpm), 'title', 'win', 'done'; time() (seconds into the song as heard, or null); mute(on);
     musicOn(on); hidden(on); cues(beats|null) (a soft tick on the designed presses, one-player runs). Read: SFX_NAMES,
     MUSIC_NAMES, SONGS[id].bpm.
   BEAT.Net (net.js; online only exists when it does): we call Net.init({onLink, onMsg, onPeerLeft, onEvent,
     onMute, onMusic}) once (the same object is BEAT.Main.hooks), then Net.send(state) (fields below), Net.event(type, arg, run)
     (0 crash, 1 finish, 2 out, 3 again), new Net.Ghost() with push(msg, run), view(L, now, rtt), clear(); Net.rtt,
     Net.silence(), Net.leave(), Net.post(msg), Net.setClock(fn|null) (virtual time in tests), Net.stats.
     State we send ~15 Hz while racing or counting down (4 Hz otherwise), always after the frame's steps (netOut), and right after a
     press, flip, ring, cap, portal, crash, respawn or finish (online.kick): {run, ph,
     lv (our level index: the guest switches to the host's), lh (Sim.levelHash of that level: a different one = "Refresh the
     page"), rt, x, y, vy (x64), mode (0 hop 1 glide 2 flip), grav (1|-1), rot (x1000), alive, gr, fin, pct (x10), att, cr, cp,
     lp}. The ghost (net.js) is placed in the state's mode and gravity with the speed and corridor of the portals behind it and
     stepped with Sim.stepPlayer.
   Parent protocol: posts {ty:'ready'} at boot, {ty:'exit'} (Esc on the title, the results and the quiet card online; Esc twice
     within 2.5 s in an online race: one says 'Esc again to leave the race'), {ty:'leave'}, {ty:'mute'|'music',
     on}, {ty:'rtt', ms}; the rest is net.js.
   Debug: ?mute=1 (never touches audio or storage) ?bot=1 ?debug=1 ?world=skyway; window.__beat {manual, step, render, key, tap,
   start(level, {players, practice, auto, world}), bot, crash, practice, cp, uncp, level, solve, validate, visible, state,
   log(on) (records each sim event with the song time as heard at that frame: tests measure beats against events), clock}. */
'use strict';
(function () {
const B = window.BEAT, Sim = B.Sim, RD = B.Render, AU = B.Audio || {}, NT = B.Net || {};
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search), SILENT = Q.get('mute') === '1';
const DBG = { bot: Q.get('bot') === '1', debug: Q.get('debug') === '1', world: /^(meadows|skyway|works)$/.test(Q.get('world') || '') ? Q.get('world') : null };
const VH = 720, HZ = 240, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const store = { get(k) { if (SILENT) return null; try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { if (SILENT) return; try { localStorage.setItem(k, String(v)); } catch (_) {} } };
const errors = [];
function report(e) { const m = String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '); if (errors.length < 40 && errors.indexOf(m) < 0) { errors.push(m); console.error('[beat]', e); } }
const readJSON = k => { try { const o = JSON.parse(store.get(k) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (_) { return {}; } };

/* ---------- state ---------- */
let scr = 'title', mode = 'solo', sim = null, lvIx = 0, LV = B.LEVELS[0], paused = false, ut = 0, scrUt = 0, phase = 'race', goAt = 0, lastCount = -1;
let touchMode = false, forceVis = false, results = null, winner = -1, endAt = -1, toast = '', toastUt = -999, toastLen = 300, escUt = -999, newBestUt = -999, newBestPct = 0;
let practice = false, autoCp = true;
const best = readJSON('beat-best'), seedsGot = readJSON('beat-seeds');   /* best % per level; golden seeds found per level (bitmask) */
const V = [0, 1].map(() => ({ cam: { x: -10, y: 0 }, rv: 0, sqAt: -99, used: { pad: -1, padAt: -99, ring: -1, ringAt: -99 }, trailAt: 0, deadAt: -99, cps: [], attX: 0 }));
let fx = [], words = [];
let online = null;   /* {role, me, opp, who, run, startAt, myFin, myOut, oppFin, oppOut, decided, quiet, verBad, ghost, lastSend, oppPct, heard, oppRun, oppMode, oppGrav, wantLv} */
const spb = () => 60 / LV.bpm;
const hidden = () => !forceVis && !!document.hidden;
let manual = false, manualBase = 0;
const gnow = () => manual ? manualBase + ut * 1000 / 60 : performance.now();
let frameT = performance.now();   /* the newest frame's timestamp: effects, trails and the camera move per frame at any display rate (120 Hz too) */
const tsec = () => manual ? ut / 60 : frameT / 1000;
const worldOf = () => DBG.world || LV.world || 'meadows';

/* ---------- sound and music (with ?mute=1 nothing is ever touched: the chips still toggle, nothing is stored or posted) ---------- */
let muted = SILENT || store.get('beat-mute') === '1', musicOn = store.get('beat-music') !== '0', unlocked = false, curSong = '';
function au(fn, a, b) { if (!SILENT && typeof AU[fn] === 'function') try { return AU[fn](a, b); } catch (e) { report(e); } return null; }
function unlock() {
  if (SILENT) return;
  if (!unlocked) { unlocked = true; au('unlock'); if (sim && scr === 'play' && phase === 'race' && !paused) syncWant = 2; }   /* sound came on mid-run: the song joins at the run's beat */
  else au('unlock');
}
const SFX_ALT = { portal: 'pad', flip: 'jump' };
function sfx(n, a) { if (muted) return; if (Array.isArray(AU.SFX_NAMES) && AU.SFX_NAMES.indexOf(n) < 0) { n = SFX_ALT[n]; if (!n) return; } au('play', n, a); }
/* the level's song: its own track, else one of audio.js's songs at the same tempo, else none (then the fixed clock) */
function TRK() {
  const names = Array.isArray(AU.MUSIC_NAMES) ? AU.MUSIC_NAMES : null;
  if (!names || names.indexOf(LV.track) >= 0) return LV.track || null;
  const S = AU.SONGS || {}; return names.find(n => !/^(title|win|done)$/.test(n) && S[n] && S[n].bpm === LV.bpm) || null;
}
/* the anchor of THE CLOCK (see the top): the level's song was started at song time s0 when the sim stood at t0 steps (its
   continuous position: sim.t plus the part of a step not yet made, acc) */
const clk = { on: false, sim: null, t0: 0, s0: 0, src: 'own', err: 0, lastAt: null, lastWall: 0, rW: 0, rA: 0, rate: 1, bad: false, back: false, resyncs: 0 };
let acc = 0;   /* the part of a sim step not yet made (-0.5 .. 0.5): the run's continuous position is sim.t + acc */
function song(name, beat, force) {
  if (!force && name === curSong) return;
  curSong = name || ''; au('music', name || null, beat || 0);
  if (name && name === TRK() && sim && scr === 'play') { clk.on = true; clk.sim = sim; clk.t0 = sim.t + acc; clk.s0 = (beat || 0) * spb(); clk.lastAt = null; clk.rW = 0; clk.bad = false; }
  else clk.on = false;
}
/* the song's beat by the lock (where it is meant to be now), or null */
function songBeat() { return clk.on && clk.sim === sim && sim && curSong === TRK() ? (clk.s0 + (sim.t + acc - clk.t0) / HZ) / spb() : null; }
function leadP() { let l = null; if (sim) for (const p of sim.players) if (p.alive && !p.fin && (!l || p.lt > l.lt)) l = p; return l; }
/* the song follows the run: (re)started at the beat of the leader's level time AFTER the frame's steps (syncWant 2: always, at
   GO, a restart, an unlock; 1: after a respawn, when it is more than 0.12 beat off: two on one keyboard, the furthest along) */
let syncWant = 0;
function syncSong() {
  const w = syncWant; syncWant = 0;
  if (!sim || phase !== 'race' || paused || scr !== 'play' || !TRK()) return;
  const l = leadP(); if (!l) return;
  const now = songBeat();
  let d = now == null ? 0 : now - (l.lt + acc) / HZ / spb();
  if (mode === 'local') d -= Math.round(d);   /* two on one keyboard: both runners keep to one beat grid (sim.js respawnDelay), so the song need only be on the beat, not at the leader's bar: it never jumps back when the leader crashes */
  if (w > 1 || now == null || Math.abs(d) > 0.12) { acc = 0; song(TRK(), l.lt / HZ / spb(), true); }   /* from the runner's own step: the song and the run start level */
}
function followSong() { if (syncWant < 1) syncWant = 1; }
/* two on one keyboard: syncSong keeps the song on the beat grid through crashes, so after the leader crashes it runs whole beats
   ahead of where the runners are. On the leader's next bar line (its level time a whole bar) it is cut back to the leader's place:
   whole beats, on the beat, so the level's sections, breaks and the finish chord are where they were written. Never while a runner
   is out (it may come back in front), never after the first finish (the song ends there) */
let barAt = null;   /* [the leader, its bar] at the last frame */
function barCut() {
  if (mode !== 'local' || !sim || phase !== 'race' || paused || scr !== 'play' || winner >= 0 || !TRK()) { barAt = null; return; }
  const l = leadP(); if (!l) { barAt = null; return; }
  const li = sim.players.indexOf(l), bar = Math.floor(l.lt / (HZ * spb() * 4)), was = barAt; barAt = [li, bar];
  if (!was || was[0] !== li || bar !== was[1] + 1 || sim.players.some(p => !p.alive)) return;   /* only the same leader running over its next bar line */
  const now = songBeat(); if (now == null) return;
  if (Math.abs(now - (l.lt + acc) / HZ / spb()) > 0.5) { acc = 0; song(TRK(), l.lt / HZ / spb(), true); clk.bars = (clk.bars | 0) + 1; }
}
function post(o) { if (NT.post) NT.post(o); else try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} }
function setMute(on, quiet) { muted = !!on; if (SILENT) return; au('mute', muted); store.set('beat-mute', muted ? 1 : 0); if (!quiet) post({ ty: 'mute', on: muted }); }
function setMusic(on, quiet) { musicOn = !!on; if (SILENT) return; au('musicOn', musicOn); store.set('beat-music', musicOn ? 1 : 0); if (!quiet) post({ ty: 'music', on: musicOn }); }
au('mute', muted); au('musicOn', musicOn);

/* ---------- layout: 1280 x 720 per view (W x VV each, two stacked, in split screen), scaled to fit and centred ----------
   Split screen: each view is as wide as the window lets it be: VV (440 - 720) is picked so the two stacked views fill the window's
   shape, and a short view shows the 720-tall scene from row CUT down (the sky above the action is trimmed, at most 140 px; the
   floor and 20 px of ground stay at the bottom). A trimmed view draws a slim HUD (one line, ~32 px), so the canopy of a 9-high
   corridor (the tallest) and everything under it stays clear of it. An upright phone: 800 wide. */
const BUCK = [.5, .75, 1, 1.25, 1.5, 2];
let S = 1, R = 0, OX = 0, OY = 0, coarse = false, views = 1, LH = VH, W = 1280, VV = VH, CUT = 0, rCap = 2;
function layout() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = devicePixelRatio || 1;
  coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  views = mode === 'local' && (scr === 'play' || scr === 'results') ? 2 : 1;
  W = coarse && h > w * 1.1 ? 800 : 1280; RD.setView(W);   /* an upright phone: a narrower, closer view (two players too) */
  if (views === 2) { VV = clamp(Math.round(W * h / (2 * w)), 440, VH); CUT = clamp(580 - VV, 0, 140); } else { VV = VH; CUT = 0; }
  LH = VV * views;
  S = Math.min(w / W, h / LH);
  const want = S * dpr, cap = coarse ? 1.25 : rCap;   /* phones draw at a lower internal resolution; a desktop up to 2x (less if its frames are slow) */
  let r = BUCK[0]; for (const b of BUCK) if (b <= cap && Math.abs(b - want) <= Math.abs(r - want)) r = b;
  const cw = Math.round(W * r), ch = Math.round(LH * r);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.width = W * S + 'px'; cv.style.height = LH * S + 'px';
  OX = (w - W * S) / 2; OY = (h - LH * S) / 2; cv.style.left = OX + 'px'; cv.style.top = OY + 'px';
  if (r !== R || !RD.ready) { R = r; try { RD.init(R); } catch (e) { report(e); } }
}

/* the pause menu and the results card are drawn in a 1280 x 720 space centred on the canvas, scaled up a little in split screen
   (ovK); a point on the canvas in that space */
const ovK = () => views === 2 ? Math.min(1.5, W / 680, LH / VH) : 1;
function overlayXY(x, y) { const k = ovK(); return { x: (x - W / 2) / k + W / 2, y: (y - LH / 2) / k + VH / 2 }; }
function resetViews() { for (const v of V) { v.cam.x = -10; v.cam.y = 0; v.rv = 0; v.sqAt = -99; v.used = { pad: -1, padAt: -99, ring: -1, ringAt: -99 }; v.deadAt = -99; v.cps = []; v.attX = 0; } fx = []; words = []; }
function setScr(s) { scr = s; scrUt = ut; layout(); dropInput(); }   /* the key that changed the screen is not a hop */
function setLevel(ix) { if (!B.LEVELS[ix]) return; lvIx = ix; LV = B.LEVELS[ix]; }
function startSolo() {
  if (online) return;
  mode = 'solo'; soloWho = 0; sim = new Sim(LV, { players: 1, practice, auto: autoCp }); paused = false; phase = 'race'; results = null; winner = -1; endAt = -1; resetViews(); setScr('play');
  attemptWord(); au('cues', LV.presses || null); song(null); syncWant = 2; botReset();   /* the song starts at the run's beat after the first frame's steps */
}
function startLocal() {
  if (online) return;
  mode = 'local'; soloWho = 0; sim = new Sim(LV, { players: 2, kind2p: true }); paused = false; results = null; winner = -1; endAt = -1; resetViews(); setScr('play');
  au('cues', null); phase = 'count'; goAt = gnow() + 3000; lastCount = -1; song(null); botReset();
}
function toTitle() { if (online) return; mode = 'solo'; sim = null; paused = false; results = null; setScr('title'); au('cues', null); song('title', 0); }
function attemptWord() { const p = sim.players[0]; words = [{ x: p.x + 7, y: 6, s: practice ? 'PRACTICE' : 'ATTEMPT ' + p.att, z: 44 }]; }
function showToast(s, len) { toast = s; toastUt = ut; toastLen = len || 300; }
function pickLevel(d, host) { if ((online && !host) || B.LEVELS.length < 2) return; setLevel((lvIx + d + B.LEVELS.length) % B.LEVELS.length); sfx('select'); }   /* NET HOOK: host = the online host picking (see hostGo) */
function setPractice(on) {
  practice = !!on;
  if (scr !== 'play' || !sim || mode !== 'solo') return;
  if (practice) { sim.practice = true; sim.autoCp = autoCp; showToast('Practice: crash = back to your last ✿'); }
  else { paused = false; startSolo(); }   /* practice off: a proper run, from the top */
}
function setAuto(on) { autoCp = !!on; if (sim && sim.practice) sim.autoCp = autoCp; }
let cpByHand = false;
function dropCp() { if (!sim || !sim.practice || paused || phase !== 'race') return; cpByHand = true; const ok = sim.dropCp(0); flushEvents(); cpByHand = false; if (ok) sfx('cp'); }
function undoCp() { if (!sim || !sim.practice || paused) return; if (sim.removeCp(0)) sfx('select'); }

/* ---------- input: held keys per player. Each change of a player's button goes into a queue with its event time, and the sim
   replays it step by step inside the frame: a press lands on the step of the moment it was made (as the song was heard
   then), not on the frame's first step, so timing is fair at any frame rate (a phone at 30 fps too). A tap shorter than a
   step still counts (latch). Events without a usable time (tests, odd browsers) land on the frame's first step. ---------- */
const KEYS1 = { Space: 1, KeyW: 1, ArrowUp: 1 }, KEYS_L1 = { Space: 1, KeyW: 1 }, KEYS_L2 = { ArrowUp: 1, Enter: 1, NumpadEnter: 1 };
const down = new Set(), latch = [false, false], ptr = new Map();
const inQ = [], qHeld = [false, false], qLast = [false, false], repress = [false, false];
/* keys and pointers that were down when the input was dropped (the key that started a run, resumed from the pause menu, or was
   held through a countdown) are spent: they are not a hop until they are let go and pressed again */
const usedK = new Set(), usedP = new Set();
let hits = [];
const evT = e => { const t = e && e.timeStamp, n = performance.now(); return !manual && typeof t === 'number' && t > n - 1000 && t <= n + 5 ? t : -Infinity; };
/* fresh: the player whose button a NEW key or finger has just pressed while another was already held (two thumbs, SPACE then W):
   that is a press of its own (an edge: a puff ring takes it), not one long hold */
function noteInput(t, fresh) { for (let i = 0; i < 2; i++) { const h = heldBy(i); if (h !== qLast[i]) { qLast[i] = h; if (inQ.length < 64) inQ.push([t, i, h]); } else if (h && fresh === i && inQ.length < 64) inQ.push([t, i, 2]); } }
function applyInput(t) { while (inQ.length && inQ[0][0] <= t) { const e = inQ.shift(); if (e[2] === 2) { repress[e[1]] = latch[e[1]] = true; continue; } qHeld[e[1]] = e[2]; if (e[2]) latch[e[1]] = true; } }
function dropInput() { inQ.length = 0; for (const c of down) usedK.add(c); for (const id of ptr.keys()) usedP.add(id); qHeld[0] = qHeld[1] = qLast[0] = qLast[1] = false; latch[0] = latch[1] = repress[0] = repress[1] = false; }
const keyOf = c => mode === 'local' ? (KEYS_L1[c] ? 0 : KEYS_L2[c] ? 1 : -1) : KEYS1[c] ? 0 : -1;
/* the same for one player only: a button held through a respawn (kind rule, practice) is spent, so the first hop on the safe spot
   needs a fresh press (held, it hopped at once there; at two spots that landed on a thorn) */
function spendInput(i) {
  for (const c of down) if (keyOf(c) === i) usedK.add(c);
  for (const [id, v] of ptr) if (v === i) usedP.add(id);
  for (let k = inQ.length - 1; k >= 0; k--) if (inQ[k][1] === i) inQ.splice(k, 1);
  qHeld[i] = qLast[i] = latch[i] = repress[i] = false;
}
function heldBy(i) {
  if (mode === 'local') { const K = i ? KEYS_L2 : KEYS_L1; for (const c of down) if (K[c] && !usedK.has(c)) return true; for (const [id, v] of ptr) if (v === i && !usedP.has(id)) return true; return false; }
  if (i) return false;
  for (const c of down) if (KEYS1[c] && !usedK.has(c)) return true; for (const id of ptr.keys()) if (!usedP.has(id)) return true; return false;
}
function keyDown(c, t) { const k = keyOf(c), was = k >= 0 && heldBy(k); down.add(c); hits.push(c); noteInput(t == null ? -Infinity : t, was ? k : -1); }
function keyUp(c, t) { down.delete(c); usedK.delete(c); noteInput(t == null ? -Infinity : t); }
addEventListener('keydown', e => {
  const c = e.code || e.key || '';
  if (/^(Arrow|Space$|Enter$|NumpadEnter$)/.test(c)) e.preventDefault();
  unlock(); touchMode = false;
  if (e.repeat) return;
  keyDown(c, evT(e));
});
addEventListener('keyup', e => { keyUp(e.code || e.key || '', evT(e)); });
addEventListener('blur', () => { down.clear(); ptr.clear(); usedK.clear(); usedP.clear(); noteInput(-Infinity); });
const inR = (r, x, y) => !!r && r.w > 0 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
document.addEventListener('pointerdown', e => {
  unlock(); try { cv.focus({ preventScroll: true }); } catch (_) {}
  if (e.pointerType !== 'mouse') touchMode = true;
  if (e.cancelable && e.pointerType !== 'mouse') e.preventDefault();
  const x = (e.clientX - OX) / S, y = (e.clientY - OY) / S;
  pointer(x, y, e.pointerId, evT(e));
}, { passive: false });
function pointer(x, y, id, t) {
  const U = RD.UI;
  if (online && online.verBad) { playAlone(); return; }
  if (online && online.quiet) { if (ut - online.quietUt > 90 && inR(U.msgBtn, x, y)) playAlone(); return; }   /* only the button (after 1.5 s): a tap to the music is not a goodbye */
  if (scr === 'title') {
    if (inR(U.snd[0], x, y)) { setMute(!muted); sfx('select'); return; }
    if (inR(U.snd[1], x, y)) { setMusic(!musicOn); sfx('select'); return; }
    if (online && online.pick) { if (online.role === 'host') { const r = pickRects(); if (inR(r.prev, x, y)) pickLevel(-1, true); else if (inR(r.next, x, y)) pickLevel(1, true); else if (inR(r.card, x, y)) hostGo(); } return; }   /* NET HOOK: the host picks the level */
    if (online) return;
    if (inR(U.snd[2], x, y)) { setPractice(!practice); sfx('select'); return; }
    if (inR(U.prev, x, y)) { pickLevel(-1); return; }
    if (inR(U.next, x, y)) { pickLevel(1); return; }
    if (inR(U.b2, x, y)) { sfx('select'); startLocal(); } else { sfx('select'); startSolo(); }
    return;
  }
  if (scr === 'results') { const q = overlayXY(x, y); if (!online && inR(U.resTitle, q.x, q.y)) { sfx('select'); toTitle(); return; } if (ut - scrUt > 30) again(); return; }
  if (scr !== 'play') return;
  if (paused) {
    const q = overlayXY(x, y);
    if (inR(U.back, q.x, q.y)) toTitle();
    else if (inR(U.prac, q.x, q.y)) { setPractice(!practice); sfx('select'); }
    else if (inR(U.auto, q.x, q.y)) { setAuto(!autoCp); sfx('select'); }
    else unpause();
    return;
  }
  if (inR(U.pause, x, y) && mode !== 'online') { pause(); return; }
  if (inR(U.cpAdd, x, y)) { dropCp(); return; }
  if (inR(U.cpDel, x, y)) { undoCp(); return; }
  const who = mode === 'local' ? (y < VV ? 0 : 1) : 0, was = heldBy(who);
  ptr.set(id, who); noteInput(t == null ? -Infinity : t, was ? who : -1);
}
const pUp = e => { usedP.delete(e.pointerId); if (ptr.delete(e.pointerId)) noteInput(evT(e)); };
document.addEventListener('pointerup', pUp); document.addEventListener('pointercancel', pUp);
document.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

function pause() { if (mode === 'online' || scr !== 'play') return; paused = true; down.clear(); ptr.clear(); dropInput(); song(null); }
/* carry on: paused during the 3, 2, 1 (two on one keyboard), the countdown starts again from 3 */
function unpause() { if (!paused) return; paused = false; dropInput(); if (phase === 'count') { goAt = gnow() + 3000; lastCount = -1; } else resumeSong(); }
function resumeSong() { if (paused || !sim || phase === 'count') return; const l = leadP(); let lt = l ? l.lt : 0; if (!l) for (const p of sim.players) lt = Math.max(lt, p.lt); song(TRK(), lt / HZ / spb(), true); }
function onKey(c) {
  if (c === 'KeyM') { setMute(!muted); return; }
  if (c === 'KeyN') { setMusic(!musicOn); return; }
  const go = c === 'Space' || c === 'Enter' || c === 'NumpadEnter';
  if (online && online.verBad) { if (go) playAlone(); else if (c === 'Escape') post({ ty: 'exit' }); return; }
  if (online && online.quiet) { if ((c === 'Enter' || c === 'NumpadEnter') && ut - online.quietUt > 90) playAlone(); else if (c === 'Escape') post({ ty: 'exit' }); return; }   /* ENTER, not the hop keys */
  if (scr === 'title') {
    if (c === 'Escape') { post({ ty: 'exit' }); return; }   /* Esc on the title: back to the arcade's menu */
    if (online && online.pick && online.role === 'host') { if (c === 'ArrowLeft' || c === 'KeyA') pickLevel(-1, true); else if (c === 'ArrowRight' || c === 'KeyD') pickLevel(1, true); else if (go || c === 'KeyW' || c === 'ArrowUp') hostGo(); return; }   /* NET HOOK */
    if (online) return;
    if (c === 'ArrowLeft' || c === 'KeyA') { pickLevel(-1); return; }
    if (c === 'ArrowRight' || c === 'KeyD') { pickLevel(1); return; }
    if (c === 'KeyP') { setPractice(!practice); sfx('select'); return; }
    if (c === 'Space' || c === 'KeyW' || c === 'ArrowUp') { sfx('select'); startSolo(); } else if (c === 'Enter' || c === 'NumpadEnter') { sfx('select'); startLocal(); }
    return;
  }
  if (scr === 'results') {
    if (c === 'Escape') { if (online) post({ ty: 'exit' }); else toTitle(); return; }
    if (online && online.role === 'host' && B.LEVELS.length > 1 && /^(ArrowLeft|ArrowRight|KeyA|KeyD)$/.test(c)) {   /* NET HOOK: the host picks the next race's level (sent as lv; both switch at the rematch) */
      const n = B.LEVELS.length, cur = online.wantLv != null ? online.wantLv : lvIx; online.wantLv = (cur + (c === 'ArrowLeft' || c === 'KeyA' ? -1 : 1) + n) % n;
      if (online.wantLv === lvIx) online.wantLv = null; online.lastSend = -99; sfx('select'); return;
    }
    if (go && ut - scrUt > 30) again();
    return;
  }
  if (scr !== 'play') return;
  if (paused) {
    if (c === 'Escape') toTitle();
    else if (c === 'KeyR' && mode === 'solo') { setPractice(!practice); sfx('select'); }   /* (two players: no practice) */
    else if (c === 'KeyA' && mode === 'solo') { setAuto(!autoCp); sfx('select'); }
    else if (c === 'KeyP' || go) unpause();
    return;
  }
  if (c === 'Escape' || c === 'KeyP') {   /* online there is no pause (the other runner runs on): Esc twice leaves the race (one Esc, the habit
       from playing alone, only says so); one Esc still leaves from the title, the results and the quiet card */
    if (online) { if (c === 'Escape') { if (ut - escUt < 150) post({ ty: 'exit' }); else { escUt = ut; showToast('Esc again to leave the race', 150); } } } else pause();
    return;
  }
  if (c === 'KeyZ') dropCp(); else if (c === 'KeyX') undoCp();
}
function again() {
  if (online) { onlineAgain(); return; }
  if (mode === 'local') startLocal(); else startSolo();
}

/* ---------- the bot: the level's designed run (or the solver's line), played by position ---------- */
/* a plan is input held between x positions. x is a function of time alone, so a plan works from the start and from any of its
   safe spots; from anywhere else (an own-run checkpoint) the bot asks the solver again */
let botPlan = [null, null]; const botK = [0, 0];
function planFrom(p) { const L = sim.L; if (L.plan && !p.x) return L.plan; if (L.plan && L.spots && L.spots.some(s => s.x === p.x)) return L.plan; const r = Sim.solve(LV, p.x || p.y ? { from: p } : {}); return r.ok ? r.plan : L.plan || []; }
function botReset() { botPlan = [null, null]; botK[0] = botK[1] = 0; }
function botWants(i) {
  if (!DBG.bot || !sim) return false;
  if (mode === 'local' ? false : i > 0) return false;
  const p = sim.players[i]; if (!p.alive || p.fin) return false;
  if (!botPlan[i]) { botPlan[i] = planFrom(p); botK[i] = 0; }
  const P = botPlan[i]; let k = botK[i];
  if (k > 0 && k <= P.length && P[k - 1][0] > p.x + 1e-6) k = 0;   /* went back (a respawn): search again */
  while (k < P.length && P[k][1] < p.x - 1e-6) k++;
  botK[i] = k;
  return k < P.length && P[k][0] <= p.x + 1e-6;
}

/* ---------- the sim and its events ---------- */
const INP = [false, false];
function simStep() {
  for (let i = 0; i < sim.n; i++) { INP[i] = qHeld[i] || latch[i] || botWants(i); latch[i] = false; if (repress[i]) { repress[i] = false; sim.prev[i] = false; } }   /* a fresh press while held: an edge */
  sim.step(INP);
  flushEvents();
  outCheck();
}
let evLog = null;   /* __beat.log(true): [name, player, arg, lt, song time as heard (s), output latency (s), ut] for tests */
const KICK = { jump: 1, flip: 1, ring: 1, pad: 1, portal: 1, crash: 1, respawn: 1, finish: 1 };
function flushEvents() {
  if (!sim || !sim.events.length) return;
  const ev = sim.events.slice(); sim.events.length = 0;
  for (const e of ev) {
    if (evLog && evLog.length < 20000) { const q = sim.players[e[1]]; evLog.push([e[0], e[1], e[2], q ? q.lt : 0, au('time'), au('latency'), ut, sim.t]); }
    if (online && KICK[e[0]]) online.kick = true;   /* online: a press (or a crash) goes out with the very next frame, not up to 66 ms later */
    onEvent(e);
  }
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
const counts = () => mode === 'solo' && !sim.kind2p && !sim.practice;   /* a run that counts for best % and golden seeds */
const MODE_WORD = { glide: 'GLIDE!', flip: 'FLIP!', hop: 'HOP!' };
function onEvent(e) {
  const [n, i, a] = e, p = sim.players[i], v = V[i], who = whoOf(i);
  if (n === 'jump') { sfx('jump'); addFx({ k: 'dust', x: p.x - .3, y: p.grav < 0 ? p.y + 1 : p.y }); }
  else if (n === 'flip') { sfx('flip'); addFx({ k: 'spark', x: p.x, y: p.y + .5 }); }
  else if (n === 'land') { v.sqAt = tsec(); sfx('land'); }
  else if (n === 'pad') { sfx('pad'); v.used.pad = a; v.used.padAt = tsec(); addFx({ k: 'spark', x: p.x, y: p.y + .3 }); }
  else if (n === 'ring') { const o = sim.L.O.find(q => q.i === a); sfx('ring', o && o.t === 'ringP' ? 1 : 0); v.used.ring = a; v.used.ringAt = tsec(); addFx({ k: 'ring', x: p.x, y: p.y + .5 }); addFx({ k: 'spark', x: p.x, y: p.y + .5 }); }
  else if (n === 'portal') { sfx('portal'); addFx({ k: 'ring', x: p.x, y: p.y + .5 }); if (MODE_WORD[a]) addFx({ k: 'txt', x: p.x + 2.5, y: p.y + 2.2, s: MODE_WORD[a], z: 30, c: '#fff', life: .8 }); }
  else if (n === 'seed') {
    sfx('seed'); addFx({ k: 'spark', x: p.x, y: p.y + .5 });   /* kept only by a run that counts; practice says so; two players: just the sparkle */
    if (counts()) addFx({ k: 'txt', x: p.x + 1, y: p.y + 2, s: 'golden seed!', z: 28, c: '#ffd93b', life: 1.1 });
    else if (mode === 'solo' && sim.practice) addFx({ k: 'txt', x: p.x + 1, y: p.y + 2, s: 'golden seed (practice: not kept)', z: 22, c: '#ffd93b', life: 1.4 });
    if (counts()) { const m = seedsGot[LV.id] | 0; if (!(m >> a & 1)) { seedsGot[LV.id] = m | 1 << a; store.set('beat-seeds', JSON.stringify(seedsGot)); } }
  }
  else if (n === 'crash') {
    sfx('crash'); burst(p, who); v.deadAt = tsec();
    if (counts()) {
      const pct = a / 10, was = best[LV.id] || 0;
      if (pct > was) { best[LV.id] = Math.floor(pct * 10) / 10; store.set('beat-best', JSON.stringify(best)); if (was > 0 || pct >= 10) { newBestUt = ut; newBestPct = pct; sfx('best'); } }
      song(null);   /* the music stops with the crash; it starts again from the top with the next attempt */
    }
    if (online) NT.event(0, a, online.run);
  }
  else if (n === 'restart') { if (DBG.bot) botPlan[i] = null; sfx('spawn'); v.cam.x = p.x - RD.PX / RD.BS; v.cam.y = 0; v.rv = 0; v.cps = []; attemptWord(); syncWant = 2; }
  else if (n === 'respawn') { sfx('spawn'); spendInput(i); v.cam.x = p.x - RD.PX / RD.BS; v.rv = p.rot; addFx({ k: 'dust', x: p.x, y: p.y }); addFx({ k: 'spark', x: p.x, y: p.y + .5 }); if (DBG.bot) botPlan[i] = null; followSong(); }
  else if (n === 'cp') { v.cps.push([p.cp ? p.cp.x : p.x, p.cp ? p.cp.y : p.y, p.cp ? p.cp.grav : 1]); if (v.cps.length > 64) v.cps.shift(); if (sim.practice && !cpByHand) sfx('cp'); }   /* practice: an automatic ✿ chimes too (a dropped one chimes in dropCp) */
  else if (n === 'uncp') { v.cps.pop(); }
  else if (n === 'finish') {
    if (mode === 'solo' && sim.kind2p) {   /* an online race played on alone after the other left: kind rules, so it does not count for best % */
      sfx('win'); endAt = ut + 70; results = { title: 'FINISHED!', who: who, rows: [['Time', fmt(p.rt)], ['Crashes', String(p.crashes)]] };
    } else if (mode === 'solo' && sim.practice) {
      sfx('win'); endAt = ut + 70; results = { title: 'PRACTICE DONE!', who: 0, rows: [['Time', fmt(p.rt)], ['Crashes', String(p.crashes)], ['Checkpoints', String(p.cps.length)]], prompt2: 'Now for real? Turn practice off: Esc, then P', prompt2t: 'Ready for real? Tap Title, then switch Practice off' };
    } else if (mode === 'solo') {
      sfx('win'); const was = best[LV.id] || 0; best[LV.id] = 100; store.set('beat-best', JSON.stringify(best)); if (was < 100) { newBestUt = ut; newBestPct = 100; }
      const sk = seedsGot[LV.id] | 0, n3 = (sk & 1) + (sk >> 1 & 1) + (sk >> 2 & 1);
      endAt = ut + 70; results = { title: 'GARDEN CLEARED!', who: 0, rows: [['Attempts', String(p.att)], ['Time', fmt(p.rt)], ['Golden seeds', n3 + ' / 3']] };
    } else if (mode === 'local') {   /* both over the line on the same step (every clean run takes the same time): a tie, winner 2 */
      if (winner < 0) { winner = i; winT = sim.t; sfx('win'); endAt = ut + 75; } else if (winner < 2 && winner !== i && sim.t === winT) winner = 2;
    } else if (online) { online.myFin = a; NT.event(1, a, online.run); decide(); }
  }
}
/* a race time: '48.3 s', '1:22.9'; dp 2 (two times that would read the same): '1:22.93' */
const fmt = (steps, dp) => { dp = dp || 1; const q = Math.pow(10, dp), s = Math.round(steps / HZ * q) / q, m = Math.floor(s / 60), r = (s - m * 60).toFixed(dp); return m ? m + ':' + r.padStart(dp + 3, '0') : r + ' s'; };   /* rounded first, then split: 119.97 s is 2:00.0, not 1:60.0 */
const fmt2 = (a, b) => a != null && b != null && a !== b && fmt(a) === fmt(b) ? [fmt(a, 2), fmt(b, 2)] : [a != null ? fmt(a) : null, b != null ? fmt(b) : null];
let winT = -1;

/* ---------- online ---------- */
function onLink(L) {
  if (!L) return;
  if (online && !L.first) { online.opp = L.opp || online.opp; return; }   /* the room re-sends the link when the path changes (direct / relayed) */
  sim = null; paused = false; results = null; resetViews();
  mode = 'online'; practice = false;
  online = { role: L.role, me: L.me, opp: L.opp || 'your friend', who: L.role === 'host' ? 0 : 1, run: 0, startAt: 0, myFin: null, myOut: null, oppFin: null, oppOut: null,
    decided: null, quiet: false, verBad: false, ghost: new NT.Ghost(), lastSend: -99, oppPct: 0, heard: false, oppRun: 0, oppMode: 0, oppGrav: 1, wantLv: null };
  /* NET HOOK (host level choice): with more than one level the match opens on the title in run 0, the PICK phase: the host
     chooses (LEFT / RIGHT or the card's arrows; its states carry lv, so the guest's card follows) and starts it (SPACE or a tap
     on the card; by itself 20 s after the guest is heard); the guest sees "Waiting for <host> to choose…". The start is event
     3 (again) with run 1, so both count 3, 2, 1, never before the lobby's shared start (startIn). One level: straight in. */
  online.lobbyAt = gnow() + Math.max(0, L.startIn || 0); online.pick = B.LEVELS.length > 1; online.heardAt = 0;
  if (online.pick) startRun(0, Infinity); else startRun(1, gnow() + (L.startIn >= 3500 ? L.startIn : 3500));
  scr = 'title'; scrUt = ut; layout(); song('title', 0);
}
/* a race: the title counts down until 3 s before GO, then the level view counts 3, 2, 1. lv: the level its start named (the
   start event carries it, so both sides race the same one), else the host's pick heard so far */
function startRun(run, at, lv) {
  const o = online; o.run = run; o.startAt = at; o.myFin = o.myOut = o.oppFin = o.oppOut = null; o.decided = null; o.ghost.clear(); o.holdUntil = 0; o.holdOwn = o.away = null;   /* (a page still hidden is away again from this race's GO: simFrame) */
  if (lv != null && B.LEVELS[lv]) { setLevel(lv); o.wantLv = null; }   /* the host's newer pick, if any, gives way: its states name this race's level now */
  else if (o.wantLv != null) { setLevel(o.wantLv); o.wantLv = null; }
  sim = new Sim(LV, { players: 1, kind2p: true }); paused = false; results = null; winner = -1; endAt = -1; resetViews(); botReset();
  phase = 'count'; goAt = at; lastCount = -1; au('cues', null);
  if (run > 1) { setScr('play'); song(null); }
}
function onMsg(o) {
  if (!online) return;
  if (o.k === 'ver') { online.verBad = true; return; }
  if (!B.LEVELS[o.lv] || Sim.levelHash(B.LEVELS[o.lv]) !== o.lh) { online.verBad = true; if (online.badLv == null) { online.badLv = o.lv; online.lastSend = -99; } return; }   /* their level file is not ours (an old cached page): refresh, not a race on different levels; our states now name that level with OUR hash of it, so their page says so too */
  if (!online.heard) online.heardAt = gnow();   /* NET HOOK: the pick phase's auto start counts from here */
  online.heard = true; online.oppRun = o.run; online.oppMode = o.mode | 0; online.oppGrav = o.grav === -1 ? -1 : 1;
  if (online.role === 'guest' && B.LEVELS[o.lv] && o.run >= online.run) {   /* NET HOOK: else = the host picked this level again */
    if (o.lv !== lvIx && o.run === online.run && o.ph === 1 && phase === 'race' && sim && online.myFin == null && online.myOut == null && sim.players[0].rt < HZ * 5) { startRun(online.run, gnow() + 3000, o.lv); setScr('play'); song(null); showToast('Racing ' + online.opp + '’s level'); }   /* a start crossed with the host's: race the host's level (rt is our own) */
    else if (o.lv !== lvIx) hostLevel(o.lv); else if (o.run === online.run) online.wantLv = null;
  }
  if (o.run === online.run) { online.ghost.push(o, online.run); online.oppPct = o.pct / 10; }
  /* they are racing this run while we still count down to it: our start came late (a phone asleep through the start, a long
     outage). Our race time counts from THEIR GO (on our clock: when their state was true, minus its race time), as if we had
     been away through it: GO at once, at the start line, 2, 1 (uiTick), so the cards match the screens */
  if (o.run === online.run && online.run > 0 && o.ph >= 1 && phase === 'count' && sim) {
    const at = (o._tt != null ? o._tt : (o._at != null ? o._at : gnow()) - (NT.rtt || 0) / 2) - o.rt * 1000 / HZ;
    if (isFinite(at) && goAt - at > 1000) goAt = online.startAt = at;
  }
}
/* the guest races the host's level (lv in the host's states): switched before GO; a race already under way switches at the rematch */
function hostLevel(ix) {
  const o = online; if (!o) return;
  if (phase === 'count' || scr === 'title' || !sim) { setLevel(ix); sim = new Sim(LV, { players: 1, kind2p: true }); resetViews(); botReset(); }
  else o.wantLv = ix;
}
function onNetEvent(type, arg, run) {
  if (!online) return;
  if (type === 3) {   /* NET HOOK: a start (first = the host ended the pick phase), with the level it is on (lvOf: older pages send none) */
    const lv = lvOf(run);
    if (arg > online.run) {
      const first = online.pick, mine = online.role === 'host' && online.wantLv != null ? online.wantLv : lvIx; online.pick = false;
      startRun(arg, first ? Math.max(online.lobbyAt, gnow() + 3000) : gnow() + 3000, lv);
      if (!first) showToast(lv != null && lv !== mine && B.LEVELS[lv] ? online.opp + ' started ' + B.LEVELS[lv].name : online.opp + ' wants another go!');   /* a host's newer pick gave way to the start: say so */
    }
    else if (arg === online.run && online.role === 'guest' && lv != null && lv !== lvIx && B.LEVELS[lv]) hostLevel(lv);   /* both started this run at once: the host's level */
    return;
  }
  if (type === 0 && run === online.run && online.ghost.d) { burst(online.ghost.d, 1 - online.who); return; }   /* NET HOOK: the other runner's crash: its leaf puff where its ghost was */
  if (run !== online.run) return;
  if (type === 1) { online.oppFin = arg; decide(); }
  else if (type === 2) { online.oppOut = arg; decide(); }
}
/* the winner from race times only (each side's own, from its own GO), so both screens agree; the same time (steps of 1/240 s:
   two clean runs always take exactly as long) is a tie on both */
function decide() {
  const o = online; if (!o || o.decided) return;
  if (o.myFin != null && o.oppFin != null) o.decided = o.myFin < o.oppFin ? 'me' : o.myFin > o.oppFin ? 'opp' : 'tie';
  else if (o.myFin != null && o.oppOut != null) o.decided = 'me';
  else if (o.oppFin != null && o.myFin == null && sim && sim.players[0].rt > o.oppFin) { onlineOut(); return; }
  if (o.decided) { sfx(o.decided === 'opp' ? 'lose' : 'win'); }
  if (o.myFin != null || o.myOut != null) { if (scr === 'play' && endAt < 0) endAt = ut + 60; }
}
/* the other runner reached the end in less time than we have run: we are out (and say so) */
function onlineOut() {
  const o = online, p = sim.players[0]; if (o.myOut != null) return;
  o.myOut = p.rt; o.myOutPct = Math.round(p.pct * 10) / 10; NT.event(2, p.rt, o.run); o.decided = 'opp'; sfx('lose');   /* the % we stopped at is the one both cards show */
  if (endAt < 0) endAt = ut + 50;
}
function onlineAgain() {
  const o = online; if (!o) return;
  const meDone = o.myFin != null || o.myOut != null, oppDone = o.oppFin != null || o.oppOut != null;
  if (!o.decided || !meDone || !oppDone) return;
  const run = Math.max(o.run, o.oppRun) + 1, lv = o.wantLv != null && B.LEVELS[o.wantLv] ? o.wantLv : lvIx;
  NT.event(3, run, lvTag(lv, run)); o.lastSend = -99;   /* NET HOOK: the rematch (on the level we start it on) goes out with the very next state */
  startRun(run, gnow() + 3000 + Math.min(400, (NT.rtt || 0) / 2), lv);
}
/* event 3 (a start) names its level in its run field: 1000000 * (level + 1) + run (net.js; a plain run number = an older page) */
const lvTag = (lv, run) => 1000000 * (lv + 1) + run, lvOf = r => r >= 1000000 ? Math.floor(r / 1000000) - 1 : null;
/* NET HOOK (host level choice): the host ends the pick phase; the card's tap areas while picking (the title's level card is
   470 x 150 at y 270 when online: render.js screen('title')) */
function hostGo() {
  const o = online; if (!o || !o.pick || o.role !== 'host' || !o.heard) return;
  o.pick = false; NT.event(3, 1, lvTag(lvIx, 1)); sfx('select'); o.lastSend = -99;   /* the start goes out with the very next state, not up to 250 ms later */
  startRun(1, Math.max(o.lobbyAt, gnow() + 3000 + Math.min(400, (NT.rtt || 0) / 2)), lvIx);
}
function pickRects() { const cw = 470, cx = (W - cw) / 2, cy = 270; return { card: { x: cx, y: cy, w: cw, h: 150 }, prev: { x: cx, y: cy, w: 110, h: 105 }, next: { x: cx + cw - 110, y: cy, w: 110, h: 105 } }; }
function sendState() {
  const o = online, p = sim ? sim.players[0] : null;
  const lv = o.badLv != null ? o.badLv : o.role === 'host' && o.wantLv != null ? o.wantLv : lvIx;   /* NET HOOK: the host's pick for the next race (a level whose file differs: that one, so both pages say 'Refresh') */
  const m = { run: o.run, ph: !sim || phase === 'count' || o.away || o.holdUntil > gnow() ? 0 : (o.myFin != null || o.myOut != null) ? 2 : 1,   /* away or held (2, 1): 0, so the other side's ghost stands still, not run on and snap back */ lv, lh: B.LEVELS[lv] ? Sim.levelHash(B.LEVELS[lv]) : 0, rt: p ? p.rt : 0,
    x: p ? Math.round(p.x * 64) : 0, y: p ? clamp(Math.round(p.y * 64), -6400, 64000) : 0, vy: p ? clamp(Math.round(p.vy * 64), -64000, 64000) : 0, mode: p ? Sim.modeIx(p.mode) : 0, grav: p && p.grav < 0 ? -1 : 1, rot: p ? clamp(Math.round(p.rot * 1000), -1e9, 1e9) : 0,
    alive: p && p.alive ? 1 : 0, gr: p && p.ground ? 1 : 0, fin: p && p.fin ? 1 : 0, pct: p ? Math.round((o.myOut != null ? o.myOutPct : p.pct) * 10) : 0, att: p ? p.att : 1, cr: p ? p.crashes : 0,
    cp: p && p.cp ? Math.round(p.cp.x * 10) : -1, lp: p ? p.lastPad : -1 };
  NT.send(m); o.lastSend = ut; o.lastRt = m.rt;
}
function playAlone() {
  if (NT.leave) NT.leave(); else post({ ty: 'leave' });
  const was = online; if (was) soloWho = was.who; online = null; mode = 'solo';
  if (scr === 'play' && sim && was) { phase = 'race'; goLate = null; showToast('Playing on your own'); if (curSong !== TRK()) syncWant = 2; } else startSolo();   /* the song stopped with the quiet: back on the runner's beat */
}
function onPeerLeft() {
  if (!online) return;
  const who = online.opp, o = online; soloWho = o.who; online = null; mode = 'solo';
  const note = o.heard ? who + ' left. You can play on your own.' : who + ' couldn’t join. You can play on your own.';   /* never heard from: they never came */
  if (scr === 'play' && sim && phase !== 'count') { showToast(note); if (o.away) pause(); else if (curSong !== TRK()) syncWant = 2; }   /* gone while we were away (a hidden tab): the pause card on return, not a runner already running; held (2, 1): the song back at once */
  else if (scr === 'results') { const p = sim.players[0]; results = { title: o.decided === 'me' ? 'YOU WIN!' : o.decided === 'opp' ? who.toUpperCase().slice(0, 12) + ' WINS!' : o.decided === 'tie' ? 'NECK AND NECK!' : 'FINISHED!', titleC: o.decided === 'opp' ? '#ffd36b' : '#7ed957', who: o.decided === 'opp' ? 1 - o.who : o.who, both: o.decided === 'tie',
    rows: [['You', o.myFin != null ? fmt(o.myFin) : Math.floor(p.pct) + '%', RD.RUN[o.who].txt], [who, 'left the garden', RD.RUN[1 - o.who].txt]] }; }
  else { sim = null; setScr('title'); showToast(note); song('title', 0); }
}
const hooks = { onLink, onMsg, onPeerLeft, onEvent: onNetEvent, onMute: on => setMute(on, true), onMusic: on => setMusic(on, true) };
B.Main = { hooks, get sim() { return sim; }, get level() { return LV; } };
if (NT.init) NT.init(hooks);

/* ---------- online: away (a hidden page) and the 2, 1 holds ----------
   Leaving costs the same on every device. While our page is hidden mid-race (another app, a locked phone: iOS runs no timers at
   all, a desktop's hidden tab ticks about once a second) our runner stands still where it was and our RACE TIME RUNS ON with the
   wall clock (online.away: race time = rt0 + the time since t0; from GO if it came while away). We say so at once (a ph 0 state:
   the other side's ghost of us stands still there instead of running on and snapping back). Back after more than a second:
   'Welcome back!' 2, 1, and those 2 s are race time too (ownHold: online.holdOwn). So the race time on the cards is what both
   screens showed: away 6 s, you finish 8 s later and 8 s slower. When the OTHER player went quiet (no word for 10 s), our own run
   stands still under the card for free, and '<opp> is back!' 2, 1 is free as well (it is not our doing). Every hold stops the song
   with a count blip on each number, and at the end the song starts on the runner's own beat, as at GO. */
function ownHold(why) {
  const o = online, p = sim.players[0];
  o.holdUntil = gnow() + 2000; o.holdOwn = { t0: gnow(), rt0: p.rt }; o.holdWhy = why; o.holdN = 0; o.lastSend = -99; song(null); dropInput();
}
/* away or in our own 2, 1: the runner stands still, the race clock runs; past their finish time, we are out */
function countRt() {
  const o = online, p = sim && sim.players[0]; if (!o || !p || phase !== 'race' || o.myFin != null || o.myOut != null) return;
  const c = o.away || o.holdOwn; if (!c) return;
  const end = o.away ? gnow() : Math.min(gnow(), o.holdUntil), rt = c.rt0 + Math.round(Math.max(0, end - c.t0) * HZ / 1000);
  if (rt > p.rt) p.rt = rt;
  outCheck();
}
function outCheck() { const o = online; if (o && sim && o.oppFin != null && o.myFin == null && o.myOut == null && sim.players[0].rt > o.oppFin) onlineOut(); }
/* the hidden page (visibilitychange): the race stands still, its time runs on; the countdown goes on by the clock */
function goAway() {
  const o = online; if (!o || o.away || scr !== 'play' || !sim || o.myFin != null || o.myOut != null) return;
  const p = sim.players[0];
  if (o.holdOwn) countRt();   /* a 2, 1 of our own under way: what it counted so far stays */
  o.away = phase === 'count' ? { t0: goAt, rt0: 0 } : { t0: gnow(), rt0: p.rt };
  o.holdUntil = 0; o.holdOwn = null; song(null); dropInput();
  try { sendState(); sendState(); } catch (e) { report(e); }   /* ph 0 now: their ghost of us stops here (twice: a page going to sleep may send nothing more; the same t, so a copy that also arrives is dropped) */
}
function comeBack(ms) {
  const o = online; if (!o) return;
  if (NT.now) NT.lastIn = Math.max(NT.lastIn || 0, NT.now());   /* our own frozen time is not their silence: the link gets its full 10 s to come back */
  o.lastSend = -99;
  const a = o.away; if (!a) return;
  if (!sim || scr !== 'play' || (phase === 'count' && gnow() < goAt)) { o.away = null; return; }   /* back before GO: the 3, 2, 1 goes on */
  if (phase === 'count') { phase = 'race'; lastCount = 0; goLate = null; }   /* GO went by while we were away (no timers on a locked phone) */
  countRt(); o.away = null;
  if (o.myFin != null || o.myOut != null) return;
  if (ms > 1000 || a.rt0 === 0) ownHold('Welcome back!'); else syncWant = 2;   /* a blink: straight on, the song back on the runner's beat */
}
/* each UI tick online: a blip on each number of a 2, 1; at its end the race goes on from exactly then, the song on the runner's beat */
function holdTick(racing) {
  const o = online; if (!o || !o.holdUntil) return;
  const now = gnow();
  if (o.holdUntil > now) { const n = Math.ceil((o.holdUntil - now) / 1000); if (n !== o.holdN) { o.holdN = n; sfx('count'); } return; }
  if (o.holdOwn) { countRt(); o.holdOwn = null; }
  const late = now - o.holdUntil; o.holdUntil = 0;
  if (racing && sim && !o.quiet && !o.away) { goLate = late; syncWant = 2; sfx('go'); const p = sim.players[0]; addFx({ k: 'txt', x: p.x + 4, y: clamp(p.y + 3, 2, 8), s: 'GO!', z: 60, c: '#7ed957', life: .7 }); }
}

/* ---------- one UI tick (60 Hz): keys, countdowns, network, screen changes ---------- */
const PICK_MS = 20000;   /* NET HOOK: the pick phase starts by itself this long after the guest is heard */
function uiTick() {
  ut++;
  const hk = hits; hits = [];
  for (const c of hk) onKey(c);
  if (online) {
    const q = !!(NT.silence && NT.silence() > 10000 && (scr === 'play' || scr === 'title' || scr === 'results')), racing = scr === 'play' && phase === 'race' && online.myFin == null && online.myOut == null;
    if (q && !online.quiet) { online.quietUt = ut; if (racing) song(null); }   /* the run stands still under the card: so does the song */
    if (!q && online.quiet && racing && sim && !online.holdOwn) { online.holdUntil = gnow() + 2000; online.holdWhy = online.opp + ' is back!'; online.holdN = 0; }   /* they are back: 2, 1, then the race goes on (not mid-air at once); never over our own 'Welcome back!' */
    online.quiet = q;
    holdTick(racing);
    /* ~15 Hz while racing, counting down to a start, or while an event waits for its ack (a start lost once costs 66 ms, not 250);
       4 Hz otherwise. Sent after the frame's steps (netOut), so the state is the frame's newest */
    const fast = racing || (phase === 'count' && isFinite(online.startAt)) || !!(NT.E && NT.E.out && NT.E.out.length);
    if (ut - online.lastSend >= (fast ? 4 : 15) && !(racing && sim && sim.players[0].rt === online.lastRt && ut - online.lastSend < 15)) online.due = true;   /* several UI ticks in one slow frame: no repeats */
    if (ut % 120 === 0 && NT.rtt) post({ ty: 'rtt', ms: Math.round(NT.rtt) });
    if (scr === 'title' && gnow() >= online.startAt - 3000) { setScr('play'); song(null); }
    if (online && online.pick && online.role === 'host' && online.heard && gnow() - online.heardAt > PICK_MS) hostGo();   /* NET HOOK */
  }
  if (scr === 'play' && phase === 'count' && !paused) {
    const left = goAt - gnow(), n = Math.ceil(left / 1000);
    if (n !== lastCount && n <= 3 && n > 0) { lastCount = n; sfx('count'); }
    if (left <= 0 && online && sim && (online.away || hidden() || -left > 1000)) {   /* online, GO went by while we were away (a locked phone: no timers; a hidden tab) or stalled: race time runs from GO, the runner stands at the start */
      phase = 'race'; lastCount = 0; goLate = null;
      if (!online.away && hidden()) online.away = { t0: goAt, rt0: 0 };   /* the 2, 1 comes when we are back (comeBack) */
      if (!online.away) { sim.players[0].rt = Math.round(-left * HZ / 1000); ownHold(gnow() - backAt < 1000 ? 'Welcome back!' : 'Ready?'); }
    }
    else if (left <= 0) { phase = 'race'; lastCount = 0; sfx('go'); addFx({ k: 'txt', x: (sim ? sim.players[0].x : 0) + 4, y: 5, s: 'GO!', z: 70, c: '#7ed957', life: .8 }); goLate = -left; syncWant = 2; }   /* the first frame runs exactly the time since GO, then the song starts at that beat */
  }
  if (scr === 'play' && endAt >= 0 && ut >= endAt) toResults();
  if (scr === 'title' && !online && DBG.bot && ut - scrUt > 40) startSolo();
  if (scr === 'results' && DBG.bot && !online && ut - scrUt > 150) again();
  music();
}
function music() {
  if (scr === 'title') { if (curSong !== 'title' && !(online && gnow() >= online.startAt - 3000)) song('title', 0); }
  else if (scr === 'results') { const want = online ? (online.decided === 'opp' ? 'done' : 'win') : 'win'; if (curSong !== want) song(want, 0); }   /* a tie: the win tune for both */
}
function toResults() {
  endAt = -1;
  if (mode === 'local') {
    const ps = sim.players, w = winner, tie = w > 1, T = fmt2(ps[0].fin ? ps[0].finRt : null, ps[1].fin ? ps[1].finRt : null);
    results = { title: tie ? 'NECK AND NECK!' : (w ? 'GOLDIE' : 'RUBY') + ' WINS!', sub: tie ? 'over the line at the very same moment: a tie!' : '', titleC: tie ? '#fff6e0' : w ? '#ffd36b' : '#ff8fb0', who: tie ? 0 : w, both: tie,
      rows: ps.map((p, i) => [(i ? 'Goldie' : 'Ruby'), (p.fin ? T[i] : Math.floor(p.pct) + '%') + ' · ' + crashWord(p.crashes), RD.RUN[i].txt]) };
  } else if (online) {
    const o = online, p = sim.players[0];
    const mine = o.myFin != null ? fmt(o.myFin) : Math.floor(p.pct) + '%', theirs = o.oppFin != null ? fmt(o.oppFin) : (o.oppOut != null ? Math.floor(o.oppPct) + '%' : 'still hopping…');
    results = { online: true };
    results.rows = [['You', mine + ' · ' + p.crashes + ' crash' + (p.crashes === 1 ? '' : 'es'), RD.RUN[o.who].txt], [o.opp, theirs, RD.RUN[1 - o.who].txt]];
  }
  setScr('results');
}
const crashWord = n => n + ' crash' + (n === 1 ? '' : 'es');
function resultsView() {
  if (!results) return null;
  const tch = touchMode || coarse;
  if (!results.online || !online) return Object.assign({}, results, { prompt: tch ? 'Tap: play again' : 'SPACE: play again   ·   Esc: title', prompt2: tch && results.prompt2t ? results.prompt2t : results.prompt2 || '', titleBtn: tch && !online });   /* touch: a Title button on the card */
  const o = online;
  const p = sim.players[0], T = fmt2(o.myFin, o.oppFin), oc = o.ghost && o.ghost.s ? o.ghost.s.cr : null;   /* their crashes: from their newest state */
  const mine = o.myFin != null ? T[0] : Math.floor(o.myOut != null ? o.myOutPct : p.pct) + '%', theirs = (o.oppFin != null ? T[1] : o.oppOut != null ? Math.floor(o.oppPct) + '%' : 'still hopping… ' + Math.floor(o.oppPct) + '%') + (oc != null && (o.oppFin != null || o.oppOut != null) ? ' · ' + crashWord(oc) : '');
  const meDone = o.myFin != null || o.myOut != null, oppDone = o.oppFin != null || o.oppOut != null, tie = o.decided === 'tie';
  return { title: o.decided === 'me' ? 'YOU WIN!' : o.decided === 'opp' ? o.opp.toUpperCase().slice(0, 12) + ' WINS!' : tie ? 'NECK AND NECK!' : 'FINISHED!', titleC: o.decided === 'opp' ? '#ffd36b' : tie ? '#fff6e0' : '#7ed957',
    sub: tie ? 'over the line in exactly the same time: a tie!' : '', who: o.decided === 'opp' ? 1 - o.who : o.who, both: tie,   /* race times (each from its own GO): not 'the same moment' */
    rows: [['You', mine + ' · ' + crashWord(p.crashes), RD.RUN[o.who].txt], [o.opp, theirs, RD.RUN[1 - o.who].txt]],
    prompt: o.decided && meDone && oppDone ? (tch ? 'Tap: race again' : 'SPACE: race again   ·   ' + (o.role === 'host' && B.LEVELS.length > 1 ? '◀ ▶ level   ·   ' : '') + 'Esc: leave') : 'waiting for ' + o.opp + '…',
    prompt2: o.wantLv != null && B.LEVELS[o.wantLv] ? 'Next race: ' + B.LEVELS[o.wantLv].name + (o.role === 'host' ? '' : ' (' + o.opp + '’s pick)') : '' };   /* NET HOOK */
}

/* ---------- the clocks (THE CLOCK at the top) ---------- */
let goLate = null;
/* the song's time as heard, when the run may follow it: the level's song started for this sim, a clock that moves (not stalled
   for 150 ms) and keeps to the wall clock (within 3 % over 2 s windows); else null (our own clock) */
function songClock() {
  const was = clk.src; clk.back = false;
  if (SILENT || manual || !clk.on || clk.sim !== sim || !TRK() || curSong !== TRK()) { clk.src = 'own'; return null; }
  const at = au('time'); if (at == null || !isFinite(at)) { clk.src = 'own'; clk.lastAt = null; clk.rW = 0; return null; }   /* no time (suspended): the rate is measured afresh after */
  const wall = performance.now();
  if (clk.lastAt == null || at > clk.lastAt + 1e-4 || at < clk.lastAt - 1) { clk.lastAt = at; clk.lastWall = wall; }
  else if (wall - clk.lastWall > 150) { clk.src = 'stall'; clk.rW = 0; return null; }   /* a gap is not a slow clock: never measure the rate across it */
  if (!clk.rW || at < clk.rA) { clk.rW = wall; clk.rA = at; }
  else if (wall - clk.rW >= 2000) { clk.rate = (at - clk.rA) / ((wall - clk.rW) / 1000); clk.bad = Math.abs(clk.rate - 1) > 0.03; clk.rW = wall; clk.rA = at; }
  if (clk.bad) { clk.src = 'rate'; return null; }
  clk.back = was === 'stall' || was === 'rate';   /* back from a stall: put the song on the run at once (simFrame) */
  clk.src = 'song'; return at;
}
function simFrame(dtMs, tEnd) {
  if (online && !online.away && hidden()) goAway();   /* hidden however we got here (the race started while the tab was in the background) */
  if (scr !== 'play' || paused || !sim || phase === 'count') { acc = 0; goLate = null; dropInput(); return 0; }
  if (online && (online.quiet || online.verBad || online.away || online.holdUntil > gnow())) { countRt(); acc = 0; dropInput(); return 0; }   /* away or our own 2, 1: race time runs (countRt) */
  let adv = dtMs * HZ / 1000;
  if (goLate != null) { adv = clamp(goLate, 0, online ? 2000 : 250) * HZ / 1000; acc = 0; goLate = null; }   /* the GO frame: exactly the time since GO */
  const at = songClock(); clk.err = 0;
  if (at != null) {
    const e = clk.t0 + (at - clk.s0) * HZ - (sim.t + acc + adv);   /* steps the run would still be behind the song after our own frame */
    clk.err = e;
    if (e > 120 || e < -10 || (clk.back && Math.abs(e) > 3)) { syncWant = 2; clk.resyncs++; }   /* > 0.5 s behind, > 42 ms ahead (the sound came late: a device starting up, new headphones), or back from a stall off by more than a step: the song starts again at the run's beat, the runner never stops */
    else {   /* within a step or so (the audio clock's jitter): a gentle pull, at most +-25 % speed; more (a hitch, slow frames): ~25 ms, never slower than half speed */
      const big = Math.abs(e) > 3; let pull = e * (1 - Math.exp(-dtMs / (big ? 25 : 150)));
      pull = big ? Math.max(pull, -adv * 0.5) : clamp(pull, -adv * 0.25, adv * 0.25);
      adv = Math.max(0, adv + pull);
    }
  }
  const st0 = sim.t, pEnd = at != null ? clk.t0 + (at - clk.s0) * HZ : sim.t + acc + adv;   /* where the run should stand at tEnd */
  acc += adv; let n = Math.floor(acc + 0.5); acc -= n;   /* rounded: the run stands within half a step of the song (-2..+2 ms) */
  n = clamp(n, 0, at != null ? 240 : online ? 480 : 48);
  /* input: step k (from st0 + k to st0 + k + 1) takes what was pressed by the middle of it, in wall time: tEnd minus how far
     that is from where the run should stand at tEnd (so a press made exactly when a beat is heard lands on that beat's step) */
  const timed = typeof tEnd === 'number' && isFinite(tEnd);
  for (let k = 0; k < n && sim; k++) { applyInput(timed ? tEnd - (pEnd - (st0 + k + 0.5)) * 1000 / HZ : Infinity); simStep(); }
  if (!timed) applyInput(Infinity);
  if (syncWant && sim) syncSong();
  barCut();
  return n;
}
/* online: this frame's state goes out after its steps (due: the regular 15 Hz; kick: a press, crash ... in this frame) */
function netOut() { const o = online; if (!o) return; if (o.due || (o.kick && sim && ut - o.lastSend >= 2)) { o.due = o.kick = false; sendState(); } }

/* ---------- drawing ---------- */
const TAU = Math.PI * 2;
function beatNow() {
  if (scr === 'play' && sim && phase !== 'count') { let lt = 0; for (const p of sim.players) lt = Math.max(lt, p.lt); return lt / HZ / spb(); }
  const t = au('time'); return t != null ? t / (60 / 110) : ut / 60 / (60 / 110);
}
function camFollow(v, p, dt) {
  const tx = p.x - RD.PX / RD.BS; v.cam.x = Math.abs(tx - v.cam.x) > 6 ? tx : v.cam.x + (tx - v.cam.x) * Math.min(1, dt * 20);
  const ty = p.ceil != null && p.ceil <= 12 ? 0 : Math.max(0, p.y - 6.5); v.cam.y += (ty - v.cam.y) * (1 - Math.exp(-dt * 5));   /* a corridor fits the view: hold still */
}
function runnerOf(i, p, v, t) {
  const sq = clamp(1 - (t - v.sqAt) / .14, 0, 1);
  if (!p.alive && (sim.kind2p || sim.practice)) {   /* kind rule and practice: the last moments before a respawn show where you will be back, blinking */
    const left = (p.respD || (sim.practice ? B.C.RESPAWN_PRACTICE : B.C.RESPAWN)) - p.deadT;   /* respD: two on one keyboard, back on the beat */
    if (left > 0 && left < 108) { const c = p.cp || { x: 0, y: 0, rot: 0, mode: 'hop', grav: 1 }; return { x: c.x, y: c.y, rot: c.rot, mode: c.mode, grav: c.grav, ceil: c.ceil, who: whoOf(i), ground: true, alpha: (left / 14 | 0) % 2 ? .3 : .85, preview: true }; }
  }
  v.rv += (p.rot - v.rv) * Math.min(1, .45);
  if (p.mode !== 'hop') v.rv = p.rot;
  const up = p.grav < 0, rising = up ? p.vy < -15 : p.vy > 15, falling = up ? p.vy > 12 : p.vy < -12;
  return { x: p.x, y: p.y, rot: v.rv, mode: p.mode, grav: p.grav, who: whoOf(i), sq: p.ground ? sq : 0, ground: p.ground, hide: !p.alive, mood: p.fin ? 'happy' : (!p.ground && rising ? 'happy' : 'open'), mouth: !p.ground && falling ? 'o' : '' };
}
let lastDraw = 0;
function drawPlay(vi) {
  const i = mode === 'local' ? vi : 0, p = sim.players[i], v = V[i], t = tsec(), dt = clamp(t - lastDraw, 0, .1);
  if (vi === views - 1) lastDraw = t;
  const me = runnerOf(i, p, v, t);
  camFollow(v, me.preview ? Object.assign({ ceil: p.ceil }, me) : p, dt || 1 / 60);
  const bt = beatNow(), ph = ((bt % 1) + 1) % 1, pulse = Math.exp(-ph * 5);
  const runners = [me], ghosts = [];
  if (mode === 'local') { const j = 1 - i, q = sim.players[j]; if (Math.abs(q.x - p.x) < 20) ghosts.push(Object.assign(runnerOf(j, q, V[j], t), { name: j ? 'Goldie' : 'Ruby', nameZ: 19 })); }
  if (online) { const g = online.ghost.view(sim.L, manual ? gnow() : performance.now(), NT.rtt); if (g && online.oppRun === online.run) ghosts.push({ x: g.x, y: g.y, rot: g.rot, who: 1 - online.who, ground: g.ground, hide: !g.alive, name: online.opp, mode: g.mode || Sim.MODES[online.oppMode | 0], grav: g.grav || online.oppGrav || 1, alpha: g.fade }); }   /* NET HOOK: g.mode / g.grav = net.js's prediction (a portal or a blue cap since the last state); g.fade: an old state fades */
  /* the leaf trail */
  if (p.alive && p.ground && !p.fin && phase === 'race' && t - v.trailAt > .09) { v.trailAt = t; addFx({ k: 'trail', x: p.x - .45, y: p.grav < 0 ? p.y + .85 : p.y + .15, r: Math.random() * TAU, m: RD.RUN[whoOf(i)].leaf }); }
  const used = { pad: v.used.pad, padAge: t - v.used.padAt, ring: v.used.ring, ringAge: t - v.used.ringAt };
  const wl = mode === 'solo' ? words : [];
  const vo = { sim, cam: v.cam, t, pulse, beat: bt, used, runners, ghosts, world: worldOf(), got: p.seedsGot, old: mode === 'solo' ? seedsGot[LV.id] | 0 : 0,
    words: wl.concat(v.cps.map(c => ({ x: c[0], y: c[2] < 0 ? c[1] - .6 : c[1] + 1.6, s: '✿', z: 26, c: '#9be88a' }))), fxOver: () => drawFx(v.cam), cut: CUT };
  if (CUT) ctx.translate(0, -CUT);   /* a short split view: the sky above the action trimmed */
  RD.view(ctx, vo);
  if (CUT) ctx.translate(0, CUT);
  const outPct = online && online.myOut != null ? online.myOutPct : null;   /* out (the other got to the end first): the HUD keeps the % the cards show */
  const marks = mode === 'local' ? sim.players.map((q, j) => ({ pct: q.pct, who: j })) : online ? [{ pct: online.oppPct, who: 1 - online.who }, { pct: outPct != null ? outPct : p.pct, who: online.who }] : null;
  let sub = '';
  if (online && online.oppFin != null && online.myFin == null && !online.myOut) sub = online.opp + ' reached the end! Keep going…';
  else if (vo.neck && phase === 'race' && p.alive && !p.fin) sub = CUT && W < 1000 ? 'neck and neck!' : 'neck and neck with ' + vo.neck + '!';   /* a slim HUD on a narrow view: the short form */   /* the other runner is right on yours: drawn under it, said here */
  const solo = mode === 'solo' && !sim.kind2p, sk = seedsGot[LV.id] | 0;
  RD.hud(ctx, { pct: outPct != null ? outPct : p.pct, best: solo && !sim.practice ? best[LV.id] || 0 : 0, marks, sub, slim: CUT > 0,
    pauseBtn: vi === 0 ? (touchMode || coarse) && mode !== 'online' && !paused && scr === 'play' : undefined,   /* one pause button, in the top view */
    seeds: solo && LV.seeds && LV.seeds.length ? [0, 1, 2].map(k => p.seedsGot >> k & 1 ? (sim.practice ? 3 : 2) : sk >> k & 1 ? 1 : 0) : null,   /* 3: got in practice (not kept) */
    practice: solo && sim.practice, auto: sim.practice && sim.autoCp, cpBtn: solo && sim.practice && (touchMode || coarse) && !paused && scr === 'play',   /* not on the results card (a tap there is 'again') */
    left: mode === 'local' ? (i ? 'GOLDIE' : 'RUBY') : online ? 'vs ' + online.opp : '', leftC: mode === 'local' ? RD.RUN[i].txt : '#fff' });
  if (phase === 'count') { const left = goAt - gnow(), n = Math.ceil(left / 1000); if (n <= 3) RD.screen(ctx, 'count', { h: VV, n: Math.max(1, n), k: 1 - ((left / 1000) % 1 + 1) % 1, top: online ? LV.name : '', sub: online ? 'Race ' + online.opp + '! First to the end wins' : mode === 'local' ? (i ? (touchMode ? 'Goldie: tap the bottom half' : 'Goldie: UP or ENTER') : (touchMode ? 'Ruby: tap the top half' : 'Ruby: SPACE or W')) : '' }); }
  else if (online && online.holdUntil > gnow()) { const left = online.holdUntil - gnow(); RD.screen(ctx, 'count', { h: VV, n: Math.max(1, Math.ceil(left / 1000)), k: 1 - ((left / 1000) % 1 + 1) % 1, sub: online.holdWhy || online.opp + ' is back!' }); }
  if (mode === 'local' && winner >= 0 && scr === 'play') RD.screen(ctx, 'toast', { text: winner > 1 ? 'NECK AND NECK!' : (winner ? 'GOLDIE' : 'RUBY') + ' reached the end!', y: 110, c: winner > 1 ? '#fff6e0' : RD.RUN[winner].txt });
}
function drawFx(cam) { const t = tsec(); let j = 0; for (let k = 0; k < fx.length; k++) { const f = fx[k]; if (RD.fx(ctx, f, t - f.born, cam)) fx[j++] = f; } if (views === 1 || cam === V[1].cam) fx.length = j; }
let titleCam = { x: 0, y: 0 };
function drawTitle() {
  const t = tsec(); titleCam.x = t * 3;
  const bt = beatNow(), ph = ((bt % 1) + 1) % 1, pulse = Math.exp(-ph * 5);
  RD.view(ctx, { L: null, cam: titleCam, t, pulse, beat: bt, world: worldOf() });
  const left = online ? Math.max(0, Math.ceil((online.startAt - gnow()) / 1000)) : 0;
  const nar = W < 1000, rn = online && online.who ? ['GOLDIE', 'RUBY'] : ['RUBY', 'GOLDIE'];   /* an upright phone: the short role line (it runs over the beets' leaves otherwise), a long name cut */
  const oN = online ? (nar && online.opp.length > 10 ? online.opp.slice(0, 9).trim() + '…' : online.opp) : '';
  let cdText = online ? (left > 3 ? 'Racing ' + online.opp + ' · starting in ' + left + '…' : 'Here we go!') : '', vsText = online ? (nar ? 'You: ' + rn[0] + ' · ' + oN + ': ' + rn[1] : 'You are ' + rn[0] + ' · ' + online.opp + ' is ' + rn[1]) : '';
  const picking = online && online.pick, hostPick = picking && online.role === 'host';   /* NET HOOK: the pick phase's words */
  if (picking) {
    const tch = touchMode || coarse, auto = hostPick && online.heard ? Math.ceil((PICK_MS - (gnow() - online.heardAt)) / 1000) : 99;
    cdText = !online.heard ? 'Waiting for ' + online.opp + '…' : hostPick ? (tch ? 'Tap ◀ ▶ to choose · tap here to start' : '◀ ▶ choose a level · SPACE: start') : 'Waiting for ' + online.opp + ' to choose…';
    if (hostPick && online.heard && auto <= 10) vsText += ' · starting in ' + Math.max(1, auto);
  }
  if (online && (online.quiet || online.verBad)) cdText = vsText = '';   /* the card over the title says it all (its lines showed half cut under it) */
  RD.screen(ctx, 'title', { t, beat: bt, pulse, touch: touchMode || coarse, online: !!online, tip: coarse && W < 1000 && !online ? 'Turn your phone sideways for a wider view' : '', sound: !muted, music: musicOn, practice, level: LV.name, diff: LV.diff, best: best[LV.id] || 0,
    seeds: seedsGot[LV.id] | 0, levels: B.LEVELS.length, lvIx, placeholder: !!LV.placeholder, cdText, vsText });
  if (picking) {   /* NET HOOK: the host's arrows on the card's name row (render.js draws no level arrows online), the level count above it */
    const cx = W / 2, cy = 270;
    if (hostPick) { RD.text(ctx, '◀', cx - 205, cy + 36, 34, '#ff8fb0'); RD.text(ctx, '▶', cx + 205, cy + 36, 34, '#ff8fb0'); }
    RD.text(ctx, (lvIx + 1) + ' / ' + B.LEVELS.length + (LV.placeholder ? '  ·  placeholder' : ''), cx, cy - 16, 16, '#fff6e0');
  }
}
function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.globalAlpha = 1;
  if (scr === 'title') drawTitle();
  else if (sim) {
    for (let vi = 0; vi < views; vi++) { ctx.setTransform(R, 0, 0, R, 0, vi * VV * R); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, VV); ctx.clip(); drawPlay(vi); ctx.restore(); }
    ctx.setTransform(R, 0, 0, R, 0, (LH - VH) / 2 * R);
    if (views === 2) { ctx.save(); ctx.setTransform(R, 0, 0, R, 0, 0); ctx.fillStyle = '#2b2140'; ctx.fillRect(0, VV - 4, W, 8); ctx.restore(); }
    const ov = { k: ovK(), dimY: -(LH - VH) / 2, dimH: LH };   /* split screen: the dim covers both views, the card a little bigger */
    if (scr === 'results') { const r = resultsView(); if (r) RD.screen(ctx, 'results', Object.assign({ age: (ut - scrUt) / 60 }, ov, r)); }
    if (paused) RD.screen(ctx, 'pause', Object.assign({ touch: touchMode || coarse, practice: !!sim.practice, auto: autoCp, two: mode === 'local' }, ov));
    if (mode === 'solo' && ut - newBestUt < 110 && scr === 'play') RD.screen(ctx, 'toast', { text: 'NEW BEST! ' + Math.floor(newBestPct) + '%', y: 120, c: '#ffd36b', a: Math.min(1, (110 - (ut - newBestUt)) / 20) });
  }
  ctx.setTransform(R, 0, 0, R, 0, (LH - VH) / 2 * R);
  if (toast && ut - toastUt < toastLen) RD.screen(ctx, 'toast', { text: toast, y: scr === 'title' ? (W < 1000 ? 615 : 548) : 150, a: Math.min(1, (toastLen - (ut - toastUt)) / 30) });   /* on the title: under the card, clear of the logo */
  if (online && online.verBad) RD.screen(ctx, 'msg', { text: 'Refresh the page\nto play together\nSPACE or tap: play alone' });
  else if (online && online.quiet) RD.screen(ctx, 'msg', { text: (online.heard ? online.opp + ' went quiet' : online.opp + ' hasn’t arrived yet') + '\nstill waiting for them…', btn: touchMode || coarse ? 'Play alone' : 'ENTER: play alone', btnOn: ut - online.quietUt > 90 });
  else RD.UI.msgBtn = null;
  if (DBG.debug) RD.text(ctx, fps + ' fps R' + R + ' ' + mode + (online ? ' rtt ' + Math.round(NT.rtt || 0) : '') + (errors.length ? ' ERR ' + errors.length : ''), 12, VH - 20, 14, '#fff', 'left');
}

/* ---------- the loop: UI at 60 Hz, the sim at 240 Hz on its clock; a hidden online game keeps going from a timer ---------- */
let last = performance.now(), uacc = 0, fLast = 0, fN = 0, fSum = 0, fps = 0;
function safe(fn) { try { fn(); } catch (e) { report(e); } }
function advance(dt, t) {
  uacc = Math.min(online ? 2000 : 200, uacc + dt); let k = 0;
  while (uacc >= 1000 / 60 && k < (online ? 120 : 8)) { safe(uiTick); uacc -= 1000 / 60; k++; }
  safe(() => simFrame(dt, t)); safe(netOut);
  return k;
}
function frame(ts) {
  requestAnimationFrame(frame);
  const now = performance.now(), t = typeof ts === 'number' && ts > last - 1 && ts <= now + 1 ? ts : now; if (manual) { last = t; return; }   /* the frame's own timestamp: steadier than now() */
  const dt = clamp(t - last, 0, online ? 2000 : 100); last = t; frameT = t;
  advance(dt, t);
  try { render(); } catch (e) { report(e); for (let i = 0; i < 16; i++) ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; }
  if (fLast) { fSum += t - fLast; fN++; if (fSum > 1000) { fps = Math.round(1000 * fN / fSum); fSum = fN = 0; slowFps(); } } fLast = t;
}
/* a desktop draws at up to 2x (sharp on Retina); two slow seconds in a run (under 45 fps) step that down (1.5, then 1), for good */
let slowN = 0;
function slowFps() { if (manual || coarse || hidden() || scr !== 'play' || paused) { slowN = 0; return; } slowN = fps < 45 ? slowN + 1 : 0; if (slowN >= 2 && rCap > 1) { rCap = rCap > 1.5 ? 1.5 : 1; slowN = 0; layout(); } }
let hidAt = 0, hidWall = 0, backAt = -1e9;
/* a phone's monotonic clock (performance.now) may not count the time the device slept: whatever online waits on that clock (GO, the
   start, the pick's auto start, an away's or a hold's start) moves back by the sleep the wall clock saw, so the race time is right */
function slept(L) {
  const o = online; if (!o || !(L > 0)) return;
  goAt -= L; o.startAt -= L; o.lobbyAt -= L; if (o.heardAt) o.heardAt -= L;
  if (o.away) o.away.t0 -= L; if (o.holdOwn) { o.holdOwn.t0 -= L; o.holdUntil -= L; }
}
document.addEventListener('visibilitychange', () => {
  const hid = hidden(); au('hidden', hid);
  if (hid && scr === 'play' && !online) pause();
  if (hid) { hidAt = gnow(); hidWall = Date.now(); goAway(); }   /* online: the race stands still, its clock runs (see 'away' above) */
  else {
    last = performance.now();
    let ms = hidAt ? gnow() - hidAt : 0; const wms = hidWall ? Date.now() - hidWall : 0;
    if (!manual && online && wms > 2000 && ms < wms * 0.5) { slept(wms - ms); ms = wms; }   /* the page's own clock stood still while it slept: go by the wall clock */
    if (ms > 1000) backAt = gnow();
    comeBack(ms);   /* online, back after more than a second: 'Welcome back!' 2, 1 (race time) */
    hidAt = 0;
  }
});
/* a hidden tab gets no animation frames: an online game keeps ticking from a timer (browsers slow it to about 1 a second; each call
   catches up): the link, the countdown, the results; an away race stands still meanwhile, its clock running. Armed from the start,
   so a game that loads in a background tab ticks too. */
setInterval(() => { if (!manual && online && document.hidden && !forceVis) { const t = performance.now(); advance(clamp(t - last, 0, 2000), t); last = t; frameT = t; } }, 250);

/* ---------- boot ---------- */
addEventListener('resize', layout);
layout();
song('title', 0);
requestAnimationFrame(frame);
window.__beat = {
  get state() {
    const ps = sim ? sim.players.map(p => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), pct: +p.pct.toFixed(1), alive: p.alive, fin: p.fin, att: p.att, crashes: p.crashes, rt: p.rt, lt: p.lt,
      mode: p.mode, grav: p.grav, speed: p.speed, ceil: p.ceil, seeds: p.seedsGot, cps: p.cps.length, cp: p.cp ? +p.cp.x.toFixed(2) : null })) : [];
    const o = online;
    return { scr, mode, phase, paused, ut, level: LV.id, lvIx, world: worldOf(), practice, auto: autoCp, simPractice: !!(sim && sim.practice), views, R, S, W, players: ps, best: best[LV.id] || 0, seedsSaved: seedsGot[LV.id] | 0,
      errors: errors.slice(), muted, music: musicOn, winner, results: scr === 'results' ? resultsView() : null,
      online: o ? { role: o.role, opp: o.opp, run: o.run, oppRun: o.oppRun, myFin: o.myFin, myOut: o.myOut, oppFin: o.oppFin, oppOut: o.oppOut, decided: o.decided, quiet: o.quiet, verBad: o.verBad, heard: o.heard, oppPct: o.oppPct, rtt: Math.round(NT.rtt || 0),
        oppMode: o.oppMode, oppGrav: o.oppGrav, ghost: o.ghost.d ? { x: +o.ghost.d.x.toFixed(2), y: +o.ghost.d.y.toFixed(2), mode: o.ghost.d.mode, grav: o.ghost.d.grav } : null, pick: !!o.pick, startIn: Math.round(o.startAt - gnow()) } : null,
      net: NT.stats ? Object.assign({}, NT.stats) : null, song: curSong, songBeat: songBeat(), audioTime: au('time'),
      clock: { src: clk.src, errMs: +(clk.err * 1000 / HZ).toFixed(2), rate: +clk.rate.toFixed(5), resyncs: clk.resyncs, bars: clk.bars | 0, on: clk.on, t: sim ? sim.t : 0 } };
  },
  get sim() { return sim; }, get fx() { return fx; }, DBG,
  manual(on) { manual = on !== false; if (manual) manualBase = performance.now() - ut * 1000 / 60; else last = performance.now(); if (NT.setClock) NT.setClock(manual ? gnow : null); },
  visible(on) { forceVis = on !== false; },
  step(n) { for (let i = 0; i < (n || 1); i++) { safe(uiTick); safe(() => simFrame(1000 / 60)); safe(netOut); } return ut; },
  render() { try { render(); } catch (e) { report(e); } },
  key(c, isDown, t) { if (isDown === false) keyUp(c, t); else keyDown(c, t); },   /* t: an event time (performance.now ms), else the frame's first step */
  tap(x, y) { pointer(x, y, 99); usedP.delete(99); if (ptr.delete(99)) noteInput(-Infinity); },
  start(level, opts) {
    opts = opts || {}; const ix = typeof level === 'number' ? level : B.LEVELS.findIndex(l => l.id === level); if (ix >= 0) setLevel(ix);
    if ('world' in opts) DBG.world = opts.world || null; if ('practice' in opts) practice = !!opts.practice; if ('auto' in opts) autoCp = !!opts.auto;
    if (opts.players === 2) startLocal(); else startSolo();
  },
  level(ix) { if (!online) setLevel(ix); return lvIx; },
  practice(on) { setPractice(on !== false); return practice; },
  cp() { dropCp(); }, uncp() { undoCp(); },
  bot(on) { DBG.bot = on !== false && on !== 0; botReset(); },
  crash(i) { const p = sim && sim.players[i | 0]; if (p && p.alive && !p.fin) { p.alive = false; p.deadT = 0; p.respD = 0; p.crashes++; sim.events.push(['crash', i | 0, Math.floor(p.pct * 10)]); } },
  title: toTitle, layout, setMute, setMusic, get muted() { return muted; }, get music() { return musicOn; },
  solve(opts) { return Sim.solve(LV, opts); }, validate() { return Sim.validate(LV); },
  log(on) { if (on === false) { const l = evLog; evLog = null; return l; } if (on) evLog = []; return evLog; },
  get clock() { return Object.assign({}, clk, { sim: undefined }); }
};
post({ ty: 'ready' });
})();
