/* VINE LINE — game.js (ENGINE): the fixed 60 Hz loop, layout and render scale, input (keys, swipes, the phone D-pad),
   screens, sound and music, the title's attract mode, and the four ways to play: 1 player, 2 players on one keyboard
   (Sprig W A S D, Marigold arrows), online host (Sprig, runs the only simulation) and online guest (Marigold, sends its
   turns and draws the host's snapshots). Rules: sim.js. Wire checks: net.js. Debug: ?mute=1 ?bot=1 ?debug=1, window.__vl. */
'use strict';
(function () {
const VL = window.VL, C = VL.C, Sim = VL.Sim, A = VL.Art, NT = VL.Net || {};
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search), SILENT = Q.get('mute') === '1';
const DBG = { bot: Q.get('bot') === '1', debug: Q.get('debug') === '1' };
const W = 480, H = 560, now = () => performance.now(), clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} } };
const errors = [];
function report(e) { const m = String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '); if (errors.length < 40 && errors.indexOf(m) < 0) { errors.push(m); console.error('[vine]', e); } }

/* ---------- sound and music (with ?mute=1 nothing is ever touched: the chips still toggle, nothing is stored or posted) ---------- */
const AU = VL.Audio || {};
let muted = SILENT || store.get('vine-mute') === '1', musicOn = store.get('vine-music') !== '0', unlocked = false, mus = '';
function au(fn, a, b) { if (!SILENT && typeof AU[fn] === 'function') try { AU[fn](a, b); } catch (e) { report(e); } }
function unlock() { if (!SILENT && !unlocked) { unlocked = true; au('unlock'); } }
function sfx(n, a) { if (!muted) au('play', n, a); }
function music(n, v) { const k = n ? n + (v | 0) : ''; if (k !== mus) { mus = k; au('music', n || null, v | 0); } }
function post(o) { if (NT.post) NT.post(o); else try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} }
function setMute(on, quiet) { muted = !!on; if (SILENT) return; au('mute', muted); store.set('vine-mute', muted ? 1 : 0); if (!quiet) post({ ty: 'mute', on: muted }); }
function setMusic(on, quiet) { musicOn = !!on; if (SILENT) return; au('musicOn', musicOn); store.set('vine-music', musicOn ? 1 : 0); if (!quiet) post({ ty: 'music', on: musicOn }); }
au('mute', muted); au('musicOn', musicOn);

/* ---------- layout: 480 x 560 scaled to fit; a phone in portrait gets a D-pad band below ---------- */
const BUCK = [1, 1.5, 2, 2.5, 3, 4];
let S = 1, R = 0, LH = H, OX = 0, OY = 0, coarse = false, padMode = false;
const PAD = { x: 240, y: 0, r: 0 };
function layout() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = devicePixelRatio || 1;
  coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  S = Math.min(w / W, h / H);
  padMode = coarse && h / S - H >= 150;
  LH = padMode ? Math.min(h / S, H + 320) : H;
  PAD.y = H + (LH - H) / 2; PAD.r = Math.min(88, (LH - H) / 2 - 16);
  const want = S * dpr, cap = coarse ? 3 : 4;
  let r = BUCK[0]; for (const b of BUCK) if (b <= cap && Math.abs(b - want) <= Math.abs(r - want)) r = b;
  const cw = Math.round(W * r), ch = Math.round(LH * r);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.width = W * S + 'px'; cv.style.height = LH * S + 'px';
  OX = (w - W * S) / 2; OY = (h - LH * S) / 2; cv.style.left = OX + 'px'; cv.style.top = OY + 'px';
  if (r !== R || !A.ready) { R = r; try { A.init(R); } catch (e) { report(e); } }
}

/* ---------- state ---------- */
let state = 'title', mode = 'solo', online = false, m = null, ut = 0, titleUt = 0, paused = false, forceVis = false;
let phUt = 0, lastPh = -1, lastRound = 0, lastCount = -1, stepUt = 0, lastSteps = 0, toast = '', toastUt = -999;
let best = Math.max(0, +store.get('vine-best') | 0), newBest = false, touchMode = false, padPress = -1;
const dieUt = [-1, -1], gulpUt = [-99, -99], born = new Map(); let fx = [], demo = null, demoUt = 0;
/* online */
let opp = 'your friend', role = null, startAt = 0, heard = false, verBad = false, quiet = false, run = 0;
let lastSeq = 0, rtt = 0, rttPostAt = 0, lastSnapUt = -99; const sentT = new Int32Array(256).fill(-1), sentMs = new Float64Array(256);
let V = null, gRun = -1, gSeq = 0, gIn = [], gAck = 0, gLastSend = -99, gEchoUt = 0, lastSnapT = -1, waiting = false;

const hidden = () => !forceVis && !!document.hidden;
const curPh = () => mode === 'guest' ? (V ? V.ph : 0) : m ? m.ph : 0;
const myIdx = () => mode === 'guest' ? 1 : 0;

function resetPlay() { fx = []; born.clear(); dieUt[0] = dieUt[1] = -1; gulpUt[0] = gulpUt[1] = -99; lastPh = -1; lastRound = 0; lastCount = -1; lastSteps = 0; stepUt = ut; paused = false; newBest = false; padPress = -1; }
function botOn() { if (!m) return; const b = !!DBG.bot; m.ai[0] = b; m.ai[1] = b && mode === 'local'; }
function startGame(kind) {   /* 1: one player, 2: two on one keyboard */
  if (online) return;
  mode = kind === 2 ? 'local' : 'solo'; m = new Sim.Match({ two: kind === 2 }); botOn();
  state = 'play'; resetPlay(); sfx('start');
}
function startHost() { run++; mode = 'host'; m = new Sim.Match({ two: true }); botOn(); state = 'play'; resetPlay(); sfx('start'); sendSnap(); }
function again() {
  if (mode === 'solo') startGame(1); else if (mode === 'local') startGame(2);
  else if (mode === 'host') startHost(); else if (mode === 'guest') guestSend(1);
}
function toTitle() { state = 'title'; titleUt = ut; m = null; paused = false; if (!online) mode = 'solo'; }
function showToast(s) { toast = s; toastUt = ut; }
function titleTap(x, y) {
  const U = A.UI, inR = r => !!r && r.w > 0 && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  if (inR(U.snd[0])) { setMute(!muted); sfx('select'); return; }
  if (inR(U.snd[1])) { setMusic(!musicOn); sfx('select'); return; }
  if (online) return;
  if (inR(U.b2)) startGame(2); else if (y < W + 10) startGame(1);
}

/* ---------- input ---------- */
const KEYDIR = { KeyW: [0, 0], KeyD: [0, 1], KeyS: [0, 2], KeyA: [0, 3], ArrowUp: [1, 0], ArrowRight: [1, 1], ArrowDown: [1, 2], ArrowLeft: [1, 3] };
let hits = [];
addEventListener('keydown', e => {
  const c = e.code || e.key || '';
  if (/^(Arrow|Space$|Enter$|NumpadEnter$)/.test(c)) e.preventDefault();
  unlock(); touchMode = false;
  if (e.repeat) return;
  hits.push(c);
});
function turnInput(who, d) {
  if (state !== 'play' || paused) return;
  if (mode === 'guest') { guestTurn(d); return; }
  if (!m) return;
  const i = mode === 'local' ? who : 0;
  if (m.turn(i, d)) sfx('turn');
}
function onKey(c) {
  if (c === 'KeyM') { setMute(!muted); return; }
  if (c === 'KeyN') { setMusic(!musicOn); return; }
  const go = c === 'Space' || c === 'Enter' || c === 'NumpadEnter';
  if (online && (quiet || verBad)) { if (c === 'Space' || c === 'Enter') playAlone(); else if (c === 'Escape') post({ ty: 'exit' }); return; }   /* on the title too: a waiting guest was stuck behind them */
  if (state === 'title') { if (!online) { if (c === 'Space') { sfx('select'); startGame(1); } else if (c === 'Enter' || c === 'NumpadEnter') { sfx('select'); startGame(2); } } return; }
  if (state !== 'play') return;
  if (paused) { if (c === 'KeyP' || c === 'Space' || c === 'Escape') paused = false; return; }
  const kd = KEYDIR[c]; if (kd) { turnInput(kd[0], kd[1]); return; }
  if (c === 'KeyP' && (mode === 'solo' || mode === 'local') && curPh() <= 1) { paused = true; return; }
  if (c === 'Escape') { if (online) post({ ty: 'exit' }); else toTitle(); return; }
  if (go && curPh() === 3 && ut - phUt > 50) again();
}
const TP = new Map();
document.addEventListener('pointerdown', e => {
  unlock(); try { cv.focus({ preventScroll: true }); } catch (_) {}
  if (e.pointerType !== 'mouse') touchMode = true;
  const x = (e.clientX - OX) / S, y = (e.clientY - OY) / S;
  if (e.cancelable && e.pointerType !== 'mouse') e.preventDefault();
  if (online && (quiet || verBad) && (state === 'title' || state === 'play')) { playAlone(); return; }
  if (state === 'title') { titleTap(x, y); return; }
  if (state !== 'play') return;
  if (paused) { paused = false; return; }
  if (curPh() === 3) { if (ut - phUt > 50) again(); return; }
  if (padMode && mode !== 'local' && (x - PAD.x) ** 2 + (y - PAD.y) ** 2 <= (PAD.r + 14) ** 2) {
    const dx = x - PAD.x, dy = y - PAD.y; if (dx * dx + dy * dy < 64) return;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); padPress = d; turnInput(0, d); return;
  }
  TP.set(e.pointerId, { x: e.clientX, y: e.clientY, who: mode === 'local' ? (x < 240 ? 0 : 1) : 0 });
}, { passive: false });
document.addEventListener('pointermove', e => {
  const t = TP.get(e.pointerId); if (!t) return;
  const dx = (e.clientX - t.x) / S, dy = (e.clientY - t.y) / S;
  if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
  turnInput(t.who, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0)); t.x = e.clientX; t.y = e.clientY;
}, { passive: true });
const pUp = e => { TP.delete(e.pointerId); padPress = -1; };
document.addEventListener('pointerup', pUp); document.addEventListener('pointercancel', pUp);
document.addEventListener('touchmove', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });

/* ---------- events → sound and fx (the host / local game from the sim; the guest from snapshot changes) ---------- */
const kindOf = c => ((c * 7 + ((c / 24) | 0) * 3) % 3);
function addFx(f) { f.born = ut; if (fx.length > 220) fx.shift(); fx.push(f); }
function eatFx(i, cell, kind, n) {
  const x = A.cellX(cell), y = A.cellY(cell), col = A.berryCol(kind === 2 ? 3 : kindOf(cell));
  addFx({ k: 'ring', x, y });
  for (let j = 0; j < 7; j++) { const a = j * Math.PI * 2 / 7 + ut * .7, v = 1.9 + (j & 1) * .9; addFx({ k: 'leaf', u: 1, x: x + Math.cos(a) * 5, y: y + Math.sin(a) * 5, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: a, vr: (j & 1 ? 1 : -1) * .12, m: A.colors(i).leaf }); }
  for (let j = 0; j < 5; j++) { const a = j * Math.PI * 2 / 5 + .8 + ut, v = 2.4; addFx({ k: 'dot', x: x + Math.cos(a) * 9, y: y + Math.sin(a) * 9, vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: col }); }
  if (kind === 2) addFx({ k: 'spark', x, y });
  addFx({ k: 'txt', x, y: y - 14, s: kind === 2 ? '+50' : '+10', c: kind === 2 ? '#ffd93b' : '#fff', z: kind === 2 ? 22 : 16 });
  gulpUt[i] = ut; sfx(kind === 2 ? 'gold' : 'eat', Math.max(0, (n | 0) - 1) % 8);
}
function wiltFx(i, body) {
  dieUt[i] = ut; sfx('wilt');
  const cl = A.colors(i);
  for (let j = 0; j < 8; j++) { const c = body[0]; addFx({ k: 'petal', x: A.cellX(c) + (j - 3.5) * 2.5, y: A.cellY(c) - 6, vx: (j - 3.5) * .05, ph: j, r: j, round: i === 1, m: i === 1 ? cl.petal : cl.leaf, life: 70 + j * 4 }); }
  for (let j = 2; j < body.length && j < 26; j += 3) addFx({ k: 'petal', x: A.cellX(body[j]), y: A.cellY(body[j]), vx: 0, ph: j, r: j * .7, m: cl.leaf, life: 60 + (j % 5) * 6 });
}
function hostEvents() {
  for (const e of m.ev) {
    if (e[0] === 'go') { addFx({ k: 'go', y: m && m.two ? 236 : 150 }); sfx('go'); }
    else if (e[0] === 'eat') eatFx(e[1], e[2], e[3], m.vines[e[1]].eaten);
    else if (e[0] === 'gold') sfx('goldAppear');
    else if (e[0] === 'goldGone') { addFx({ k: 'ring', x: A.cellX(e[1]), y: A.cellY(e[1]) }); sfx('goldGone'); }
    else if (e[0] === 'die') wiltFx(e[1], m.vines[e[1]].body);
    else if (e[0] === 'round') roundSfx(e[1]);
  }
  m.ev.length = 0;
}
function roundSfx(w) { setTimeout(() => sfx(w < 0 ? 'draw' : (mode === 'host' || mode === 'guest') && w !== myIdx() ? 'draw' : 'win'), 420); }
function phaseWatch(ph, round, cd, two) {
  if (round !== lastRound) { lastRound = round; dieUt[0] = dieUt[1] = -1; born.clear(); fx = fx.filter(f => f.k === 'txt'); }
  if (ph !== lastPh) {
    const was = lastPh; lastPh = ph; phUt = ut;
    if (ph === 3 && was >= 0) {
      if (!two) { const sc = mode === 'guest' ? 0 : m.score[0]; if (sc > best) { best = sc; newBest = true; store.set('vine-best', best); } setTimeout(() => { sfx('gameover'); if (newBest) setTimeout(() => sfx('best'), 1500); }, 600); }
      else addFx({ k: 'confetti', x: 240, y: 0, seed: ut });
    }
  }
  if (ph === 0 && two) { const n = Math.ceil(cd / 60); if (n !== lastCount) { lastCount = n; sfx('count'); } } else lastCount = -1;
}
function musicWatch() {
  if (state === 'title') return music('title');
  const ph = curPh(), two = mode === 'guest' || (m && m.two), sp = mode === 'guest' ? (V ? V.sp : 7) : m ? m.rate() : 7;
  if (ph === 3) music(two ? 'win' : null);
  else music('play', sp >= 12 ? 2 : sp >= 9 ? 1 : 0);
}

/* ---------- online: host ---------- */
function sendSnap() {
  if (!m || !NT.send) return;
  const vs = m.vines;
  NT.send({ k: 's', v: C.PROTO, run, t: ut, ph: m.ph, cd: m.cd, a: vs[0].body, b: vs[1].body, f: m.berries, g: [m.gold, m.gold >= 0 ? m.goldT : 0], sc: m.score, w: m.wins,
    dead: [vs[0].dead ? 1 : 0, vs[1].dead ? 1 : 0], lastSeq, sp: m.rate(), r: Math.min(60000, Math.round(rtt)), rd: Math.min(9999, m.round), wn: m.winner });
  sentT[ut & 255] = ut; sentMs[ut & 255] = now(); lastSnapUt = ut;
}
function onHostMsg(o) {
  if (o.k === 'e') { if (sentT[o.t & 255] === o.t) { const s = now() - sentMs[o.t & 255] - (o.h | 0); if (s >= 0 && s < 20000) rtt = rtt ? rtt * .8 + s * .2 : s; } return; }
  heard = true;
  const q = o.q.slice().sort((x, y) => x[0] - y[0]);
  for (const [s, d] of q) if (s > lastSeq) { lastSeq = s; if (m && o.run === run && state === 'play') m.turn(1, d); }   /* each new seq once; old runs are only acked */
  if (o.go && m && o.run === run && m.ph === 3 && ut - phUt > 50) again();
}
/* ---------- online: guest ---------- */
function guestSend(go) {
  if (!NT.send) return;
  NT.send(go ? { k: 'i', v: C.PROTO, run: Math.max(0, gRun), q: gIn.slice(-4), go: 1 } : { k: 'i', v: C.PROTO, run: Math.max(0, gRun), q: gIn.slice(-4) }); gLastSend = ut;
}
const pendingDir = () => gIn.length && gIn[gIn.length - 1][0] > gAck ? gIn[gIn.length - 1][1] : -1;
function guestTurn(d) {
  if (!V || V.ph > 1 || V.dead[1]) return;
  if (d === pendingDir()) return;
  gIn.push([++gSeq, d]); if (gIn.length > 4) gIn.shift();
  guestSend(0); sfx('turn');
}
const dirOfBody = b => b.length > 1 ? Sim.dirOf(b[1], b[0]) : 1;
function onSnap(o) {
  if (o.run === gRun && o.t <= lastSnapT && lastSnapT - o.t < 3600) return;   /* old or repeated (a jump back by a minute: the host restarted) */
  if (o.run !== gRun) { gRun = o.run; V = null; resetPlay(); }
  lastSnapT = o.t; gAck = Math.max(gAck, o.lastSeq);
  const t = now(), nv = { ph: o.ph, cd: o.cd, a: o.a, b: o.b, f: o.f, g: o.g, sc: o.sc, w: o.w, dead: o.dead, sp: o.sp, rd: o.rd, wn: o.wn, t: o.t, at: t, pa: o.a, pb: o.b, stepAt: 0 };
  if (V) {
    const moved = V.a[0] !== o.a[0] || V.b[0] !== o.b[0] || V.a.length !== o.a.length || V.b.length !== o.b.length;
    if (V.rd === o.rd) { if (moved) { nv.pa = V.a; nv.pb = V.b; nv.stepAt = t; } else { nv.pa = V.pa; nv.pb = V.pb; nv.stepAt = V.stepAt; } }
    if (V.rd === o.rd) {
      for (let i = 0; i < 2; i++) {
        const d = o.sc[i] - V.sc[i], b = i ? o.b : o.a;
        if (d > 0) eatFx(i, b[0], d >= C.GPTS ? 2 : 1, 0);
        if (o.dead[i] && !V.dead[i]) wiltFx(i, b);
      }
      if (V.g[0] < 0 && o.g[0] >= 0) sfx('goldAppear');
      else if (V.g[0] >= 0 && o.g[0] !== V.g[0] && o.sc[0] - V.sc[0] < C.GPTS && o.sc[1] - V.sc[1] < C.GPTS) { addFx({ k: 'ring', x: A.cellX(V.g[0]), y: A.cellY(V.g[0]) }); sfx('goldGone'); }
      if (V.ph === 0 && o.ph === 1) { addFx({ k: 'go', y: V.two ? 236 : 150 }); sfx('go'); }
      if (V.ph <= 1 && (o.ph === 2 || o.ph === 3)) roundSfx(o.wn);
    }
  }
  V = nv; noteBorn(o.f, o.g[0]);
  if (state !== 'play') { state = 'play'; waiting = false; paused = false; }
  if (o.r && now() - rttPostAt > 2000) { rttPostAt = now(); post({ ty: 'rtt', ms: o.r }); }
}
function guestTick() {
  if (!V) return;
  if (DBG.bot && V.ph <= 1 && !V.dead[1]) {
    const view = { vines: [{ body: V.a, dir: dirOfBody(V.a), dead: !!V.dead[0], grow: 0 }, { body: V.b, dir: dirOfBody(V.b), dead: !!V.dead[1], grow: 0 }], berries: V.f, gold: V.g[0], t: ut };
    const p = pendingDir(), d = Sim.botDir(view, 1); if (d !== (p >= 0 ? p : view.vines[1].dir)) guestTurn(d);
  }
  if (DBG.bot && V.ph === 3 && ut - phUt > 120 && ut - gLastSend > 30) guestSend(1);
}
function guestKeepAlive() {
  if (pendingDir() >= 0 ? ut - gLastSend >= 6 : ut - gLastSend >= 30) guestSend(0);   /* resend unacked turns; otherwise a hello now and then */
  if (V && ut - gEchoUt >= 60 && NT.send) { gEchoUt = ut; NT.send({ k: 'e', v: C.PROTO, t: V.t, h: Math.min(60000, Math.round(now() - V.at)) }); }   /* h: how long we held it */
}
/* ---------- the parent link ---------- */
function onLink(L) {
  if (!L || (L.role !== 'host' && L.role !== 'guest')) return;
  opp = L.opp || opp;
  if (online && !L.first) return;
  online = true; role = L.role; mode = role; verBad = quiet = false; heard = false; m = null; V = null; gRun = -1; lastSnapT = -1;
  state = 'title'; titleUt = ut; paused = false; waiting = role === 'guest'; startAt = now() + (L.startIn || 0);
}
function onMsg(o) {
  if (!o) return;
  if (o.k === 'ver') { if (online) verBad = true; return; }
  if (mode === 'host' && (o.k === 'i' || o.k === 'e')) onHostMsg(o);
  else if (mode === 'guest' && o.k === 's') onSnap(o);
}
function playAlone() { if (NT.leave) NT.leave(); else post({ ty: 'leave' }); online = false; role = null; quiet = verBad = false; mode = 'solo'; startGame(1); }
function onPeerLeft() { const who = opp; online = false; role = null; quiet = verBad = false; mode = 'solo'; toTitle(); showToast(who + ' left the garden'); }
if (NT.init) NT.init({ onLink, onMsg, onPeerLeft, onMute: on => setMute(on, true), onMusic: on => setMusic(on, true) });

/* ---------- tick ---------- */
function demoTick() {
  if (!demo || (demo.ph >= 2 && ut - demoUt > 80)) { demo = new Sim.Match({ two: true }); demo.ai = [true, true]; demo.cd = 1; demoUt = ut; }
  const ph = demo.ph; demo.tick(); demo.ev.length = 0; if (demo.ph >= 2 && ph < 2) demoUt = ut;
}
function tick() {
  ut++;
  const hk = hits; hits = [];
  for (const c of hk) onKey(c);
  if (online) {
    quiet = (state === 'play' || (mode === 'guest' && waiting)) && NT.silence && NT.silence() > 10000;
    if (mode === 'guest') guestKeepAlive();
    if (mode === 'host' && ut - rttPostAt > 120 && rtt) { rttPostAt = ut; post({ ty: 'rtt', ms: Math.round(rtt) }); }
  }
  if (state === 'title') {
    demoTick();
    if (online && mode === 'host' && (heard || now() >= startAt)) startHost();
    if (DBG.bot && !online && ut - titleUt > 40) startGame(1);
  } else if (state === 'play') {
    if (mode === 'guest') { guestTick(); if (V) phaseWatch(V.ph, V.rd, V.cd, true); }
    else if (m && !paused && !(online && (quiet || verBad))) {
      m.tick(); hostEvents(); noteBorn(m.berries, m.gold);
      if (m.steps !== lastSteps) { lastSteps = m.steps; stepUt = ut; }
      phaseWatch(m.ph, m.round, m.cd, m.two);
      if (mode === 'host' && (m.steps !== lastSnapSteps || ut - lastSnapUt >= 6)) { lastSnapSteps = m.steps; sendSnap(); }
      if (DBG.bot && m.ph === 3 && ut - phUt > 120 && mode !== 'host') again();
      if (DBG.bot && m.ph === 3 && ut - phUt > 150 && mode === 'host') again();
    }
  }
  musicWatch();
}
let lastSnapSteps = -1;

/* ---------- drawing ---------- */
const PT = [[], []];
function pts(out, body, prev, e) {
  out.length = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i], p = i < prev.length ? prev[i] : prev[prev.length - 1];
    let x = A.cellX(c), y = A.cellY(c);
    if (e < 1 && p !== c && p != null && Sim.near(p, c)) { const px = A.cellX(p), py = A.cellY(p); x = px + (x - px) * e; y = py + (y - py) * e; }
    out.push(x, y);
  }
  return out;
}
const ease = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };
function view() {   /* what to draw, from the match or from the guest's snapshots */
  if (mode === 'guest') {
    if (!V) return null;
    const e = V.stepAt ? ease((now() - V.stepAt) / (1000 / V.sp) * 2.2) : 1;
    return { two: true, ph: V.ph, cd: V.cd, bodies: [V.a, V.b], prevs: [V.pa, V.pb], e, dead: [V.dead[0], V.dead[1]], dirs: [dirOfBody(V.a), dirOfBody(V.b)], f: V.f, gold: V.g[0], goldT: V.g[1], sc: V.sc, w: V.w, round: V.rd, winner: V.wn };
  }
  if (!m) return null;
  const vs = m.vines, e = ease((ut - stepUt) * m.rate() / 60 * 2.2);
  return { two: m.two, ph: m.ph, cd: m.cd, bodies: vs.map(v => v.body), prevs: vs.map(v => v.prev), e, dead: vs.map(v => v.dead), dirs: vs.map(v => v.dir), f: m.berries, gold: m.gold, goldT: m.goldT, sc: m.score, w: m.wins, round: m.round, winner: m.winner };
}
function noteBorn(f, g) { for (const c of f) if (!born.has(c)) born.set(c, ut); if (g >= 0 && !born.has(g)) born.set(g, ut); if (born.size > 64) born.clear(); }
const ageOf = (c, t) => born.has(c) ? t - born.get(c) : 99;
function drawFx(under) { let j = 0; for (let i = 0; i < fx.length; i++) { const f = fx[i]; if (!!f.u !== under) { fx[j++] = f; continue; } if (A.fx(ctx, f, ut - f.born)) fx[j++] = f; } fx.length = j; }
function drawBoardThings(v, t, live) {
  for (const c of v.f) A.berry(ctx, kindOf(c), A.cellX(c), A.cellY(c), { t, age: ageOf(c, t) });
  if (v.gold >= 0) A.berry(ctx, 3, A.cellX(v.gold), A.cellY(v.gold), { t, age: ageOf(v.gold, t), frac: v.goldT / C.GOLD_T });
  if (live) drawFx(true);
  const n = v.bodies.length, me = myIdx(), order = n === 2 ? (v.dead[0] && !v.dead[1] ? [0, 1] : v.dead[1] && !v.dead[0] ? [1, 0] : [1 - me, me]) : [0];
  for (const i of order) {
    const body = v.bodies[i]; if (!body.length) continue;
    const wl = v.dead[i] ? (dieUt[i] >= 0 ? clamp((t - dieUt[i]) / 40, 0, 1) : 1) : 0;
    A.vine(ctx, i, pts(PT[i], body, v.prevs[i], v.e), { t: t + i * 50, wilt: wl, gulp: Math.max(0, 1 - (t - gulpUt[i]) / 14), dir: v.dirs[i], arrow: mode === 'guest' && i === 1 ? pendingDir() : -1, happy: v.ph >= 2 && !v.dead[i] && v.two });
  }
}
function drawTitle() {
  A.board(ctx);
  if (demo) drawBoardThings({ two: true, ph: demo.ph, bodies: demo.vines.map(v => v.body), prevs: demo.vines.map(v => v.prev), e: 1, dead: demo.vines.map(v => v.dead), dirs: demo.vines.map(v => v.dir), f: demo.berries, gold: demo.gold, goldT: demo.goldT }, ut);
  const st = Math.max(0, Math.ceil((startAt - now()) / 1000));
  A.screen(ctx, 'title', { t: ut - titleUt, touch: touchMode || coarse, online, role, opp, waiting: online && mode === 'guest', best, sound: !muted, music: musicOn,
    cdText: mode === 'guest' ? opp + ' starts the game' : heard || !st ? 'Here we go!' : 'Starting in ' + st + '…' });
  if (toast && ut - toastUt < 300) { ctx.globalAlpha = Math.min(1, (300 - (ut - toastUt)) / 30); A.screen(ctx, 'msg', { text: toast + '\nPick a game below', y: 96 }); ctx.globalAlpha = 1; }   /* up top: it covered the 1 PLAYER button */
  if (online && verBad) A.screen(ctx, 'msg', { text: 'Refresh the page\nto play together\nSPACE or tap: play alone' });
  else if (online && quiet) A.screen(ctx, 'msg', { text: opp + ' went quiet\nSPACE or tap: play alone' });
}
function drawPlay() {
  A.board(ctx);
  const v = view();
  if (!v) { A.screen(ctx, 'msg', { text: 'Joining…' }); return; }
  drawBoardThings(v, ut, true);
  drawFx(false);
  const age = ut - phUt, touch = touchMode || coarse;
  if (v.ph === 0) A.screen(ctx, 'count', { cd: v.cd, two: v.two, round: v.round, t: ut, touch, labels: mode === 'local' ? (touch ? ['left half', 'right half'] : ['W A S D', 'ARROWS']) : online ? (myIdx() ? ['', 'YOU'] : ['YOU', '']) : null });
  else if (v.ph === 2) A.screen(ctx, 'round', { age, winner: v.winner, w: v.w });
  else if (v.ph === 3) {
    if (v.two) A.screen(ctx, 'match', { age, winner: v.winner, w: v.w, prompt: touch ? 'Tap: play again' : 'SPACE: play again', sub: online ? 'either of you can start' : touch ? '' : 'Esc: menu' });
    else A.screen(ctx, 'over', { age, score: v.sc[0], len: v.bodies[0].length, best, newBest, touch });
  }
  A.screen(ctx, 'hud', { two: v.two, sc: v.sc, w: v.w, round: v.round, len: v.bodies.map(b => b.length), best, newBest: newBest || (!v.two && v.sc[0] > best && best > 0), you: online ? myIdx() : -1 });
  if (paused) A.screen(ctx, 'pause');
  if (online && verBad) A.screen(ctx, 'msg', { text: 'Refresh the page\nto play together\nSPACE or tap: play alone' });
  else if (online && quiet) A.screen(ctx, 'msg', { text: opp + ' went quiet\nSPACE or tap: play alone' });
}
function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.globalAlpha = 1;
  if (LH > H) { ctx.fillStyle = '#3f8f45'; ctx.fillRect(0, H, W, LH - H); }
  if (state === 'title') drawTitle(); else drawPlay();
  if (padMode && state === 'play' && mode !== 'local') A.screen(ctx, 'pad', { x: PAD.x, y: PAD.y, r: PAD.r, pressed: padPress, col: mode === 'guest' ? '#ff9a45' : '#5cc85a' });
  else if (padMode && state === 'play') A.text(ctx, 'Swipe on your half: Sprig left, Marigold right', 240, PAD.y, 15, '#fff');
  if (DBG.debug) A.text(ctx, fps + ' fps R' + R + ' ' + mode + (online ? ' rtt ' + Math.round(rtt) : '') + (errors.length ? ' ERR ' + errors.length : ''), 8, 470, 11, '#fff', 'left');
}

/* ---------- the loop: fixed 60 Hz ticks, at most 4 a frame; a hidden online game keeps ticking from a timer ---------- */
let acc = 0, last = now(), manual = false, fLast = 0, fN = 0, fSum = 0, fps = 0, bgId = 0;
function safeTick() { try { tick(); } catch (e) { report(e); } }
function safeRender() { try { render(); } catch (e) { report(e); for (let i = 0; i < 16; i++) ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; } }
function run1(t) { acc = Math.min(online ? 2000 : 100, acc + Math.max(0, Math.min(2000, t - last))); last = t; let n = 0; while (acc >= 1000 / 60 && n < (online ? 120 : 4)) { safeTick(); acc -= 1000 / 60; n++; } return n; }
function frame() {
  requestAnimationFrame(frame);
  const t = now(); if (manual) { last = t; return; }
  if (!run1(t)) return;
  safeRender();
  if (fLast) { fSum += t - fLast; fN++; if (fSum > 1000) { fps = Math.round(1000 * fN / fSum); fSum = fN = 0; } } fLast = t;
}
document.addEventListener('visibilitychange', () => {
  const hid = hidden(); au('hidden', hid);
  if (hid && state === 'play' && (mode === 'solo' || mode === 'local') && curPh() <= 1) paused = true;
  if (hid && online) { if (!bgId) bgId = setInterval(() => { if (!manual && hidden()) run1(now()); }, 250); }
  else if (bgId) { clearInterval(bgId); bgId = 0; }
  if (!hid) { acc = 0; last = now(); }
});

/* ---------- boot ---------- */
addEventListener('resize', layout);
layout();
document.body.style.background = '#3f8f45';
requestAnimationFrame(frame);
window.__vl = {
  get state() { return state; }, get mode() { return mode; }, get m() { return m; }, get V() { return V; }, get ut() { return ut; }, get errors() { return errors; },
  get best() { return best; }, get online() { return online; }, get quiet() { return quiet; }, get verBad() { return verBad; }, get fx() { return fx; },
  get net() { return { run, gRun, lastSeq, gSeq, gAck, rtt: Math.round(rtt), heard, pending: pendingDir() }; }, get pad() { return { padMode, LH, S, R, PAD }; },
  DBG,
  manual(on) { manual = on !== false; },
  visible(on) { forceVis = on !== false; },
  step(n) { for (let i = 0; i < (n || 1); i++) safeTick(); return ut; },
  render() { safeRender(); },
  key(c, down) { if (down !== false) hits.push(c); },
  tap(x, y) { const ev = { clientX: OX + x * S, clientY: OY + y * S }; if (state === 'title') titleTap(x, y); else if (curPh() === 3) again(); return ev; },
  start(k) { startGame(k === 2 || k === '2' || k === '2p' ? 2 : 1); },
  bot(on) { DBG.bot = on !== false && on !== 0; botOn(); },
  title: toTitle, layout, setMute, setMusic, get muted() { return muted; }, get music() { return musicOn; }
};
post({ ty: 'ready' });
})();
