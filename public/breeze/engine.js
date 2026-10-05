/* Berry Breeze — engine.js (ENGINE): the fixed 60 Hz loop, layout and render scale, input (keys, touch pad, local P2
   drop-in), screens and render order, sound and music, one-time hints, and the four ways to play: solo, local co-op
   (host mode with a second local ship), online host (Sprig) and online guest (Marigold). Debug: ?stage ?t ?boss ?god
   ?bot ?mute ?debug, and window.__bb. Simulation: world.js (World, Ship). Online plumbing: net.js (BB.Net). SPEC 1, 5, 6.
   v2 (SPEC2 A, B, G): music on/off apart from sound (N), difficulty on the title (the host's applies online), weapon HUD.
   v3 (SPEC3): team lives and OUT ships on HARD, GAME OVER (ph 5: SPACE / tap tries the same stage again, Esc to the title),
   power capped per stage, ?bot=2 (a human-like autopilot for tuning; ?bot=1 is the old perfect dodger).
   v4 (SPEC4): an OUT ship rests 60 s then comes back ('resting · back in N'); no local join while lives are 0 or a ship is OUT;
   timed special weapons (HUD bar p.wtT, the ship flashes in the last 3 s, 'superEnd' + a 'wend' pop when one runs out). */
'use strict';
(function () {
const C = BB.C, SH = C.SHIP, NC = C.NET, FR = C.FRUIT, TICK = C.TICK, A = BB.Art, TCZ = BB.TC.zap;
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const Q = new URLSearchParams(location.search), qn = k => { const v = Q.get(k); return v != null && v !== '' && isFinite(+v) ? +v : null; };
const DBG = { stage: qn('stage'), t: qn('t'), boss: Q.get('boss') === '1', god: Q.get('god') === '1', bot: (v => v === '1' ? 1 : v === '2' ? 2 : 0)(Q.get('bot')), debug: Q.get('debug') === '1' };
const SILENT = Q.get('mute') === '1';
const clamp = BB.clamp, now = () => performance.now();
const store = { get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) {} } };
const errors = [];
function report(e) { const m = String((e && e.stack) || e).split('\n').slice(0, 3).join(' | '); if (errors.length < 40 && errors.indexOf(m) < 0) { errors.push(m); console.error('[breeze]', e); } }

/* ---------- sound and music (nothing is ever touched with ?mute=1: the title chips still toggle, nothing is stored or posted) ---------- */
const AU = BB.Audio || {};
let muted = SILENT || store.get('breeze-mute') === '1', musicOn = store.get('breeze-music') !== '0', unlocked = false, mus = '', chg = null;
function au(fn, a, b) { if (!SILENT && typeof AU[fn] === 'function') try { AU[fn](a, b); } catch (e) { report(e); } }
function unlock() { if (!SILENT && !unlocked) { unlocked = true; au('unlock'); } }
function sfx(n, a) { if (!muted) au('play', n, a); }
const AU_has = n => !!(BB.Audio && BB.Audio.SFX_NAMES && BB.Audio.SFX_NAMES.indexOf(n) >= 0);
function music(n, v) {   /* without BB.Audio.musicOn, music off simply asks for no song */
  if (!musicOn && typeof AU.musicOn !== 'function') n = null;
  const k = n ? n + (v | 0) : ''; if (k !== mus) { mus = k; au('music', n || null, v | 0); }
}
function chargeSnd(l) { if (l !== chg) { chg = l; au('charge', l); } }
function setMute(on, quiet) { muted = !!on; if (SILENT) return; au('mute', muted); store.set('breeze-mute', muted ? 1 : 0); if (!quiet) post({ ty: 'mute', on: muted }); }
function setMusic(on, quiet) { musicOn = !!on; if (SILENT) return; au('musicOn', musicOn); store.set('breeze-music', musicOn ? 1 : 0); if (!quiet) post({ ty: 'music', on: musicOn }); }
au('mute', muted); au('musicOn', musicOn);

/* ---------- net.js, with tiny local stand-ins only if a piece is missing ---------- */
const N = BB.Net || {};
class LInterp {   /* stand-in: fixed delay d behind the newest-offset clock, ≤ 100 ms extrapolation, then hold */
  constructor(d) { this.d = d; this.b = []; this.o = null; this.res = { a: null, b: null, k: 0, held: false, extra: 0 }; }
  push(r, s, at) { const b = this.b, t = at == null ? now() : at; if (b.length && r <= b[b.length - 1].r) return false; if (this.o === null || t - r < this.o) this.o = t - r; b.push({ r, s }); if (b.length > 32) b.shift(); return true; }
  at(t) {
    const b = this.b, n = b.length, o = this.res; if (!n) return null;
    const rc = (t == null ? now() : t) - this.o - this.d, nw = b[n - 1]; o.held = false; o.extra = 0;
    if (rc >= nw.r) { const x = rc - nw.r; o.extra = Math.min(x, 100); o.held = x > 100; if (n < 2) { o.a = o.b = nw.s; o.k = 0; } else { const p = b[n - 2]; o.a = p.s; o.b = nw.s; o.k = 1 + o.extra / (nw.r - p.r); } return o; }
    if (rc <= b[0].r) { o.a = o.b = b[0].s; o.k = 0; return o; }
    let i = n - 2; while (i > 0 && b[i].r > rc) i--;
    o.a = b[i].s; o.b = b[i + 1].s; o.k = (rc - b[i].r) / (b[i + 1].r - b[i].r); return o;
  }
  until() { return this.d; }
}
const LG = { seq: 0, list: [], ga: 0, add(c, a) { this.list.push([++this.seq, c, a | 0]); return this.seq; }, pending() { return this.list; }, ack(ga) { this.list = this.list.filter(g => g[0] > ga); },
  apply(l, fn) { if (Array.isArray(l)) for (const g of l) if (g[0] > this.ga) { this.ga = g[0]; fn(g[1], g[2], g[0]); } return this.ga; } };
const LE = { seq: 0, q: [], top: 0, add(c, ...a) { this.q.push([now(), [++this.seq, c].concat(a)]); }, pending(t) { while (this.q.length && t - this.q[0][0] > NC.evTtlRtc) this.q.shift(); return this.q.map(x => x[1]); },
  fresh(l, t) { if (l && !Array.isArray(l)) l = l.ev; const out = []; if (Array.isArray(l)) for (const e of l) if (e[0] > this.top) { this.top = e[0]; out.push(e); } return out; } };
const GR = N.grants && N.grants.apply ? N.grants : LG, EV = N.events && N.events.fresh ? N.events : LE;
function post(o) { if (N.post) N.post(o); else try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} }
const every = () => N.sendEvery ? N.sendEvery() : NC.everyRtc;
const mkInterp = kind => N.interp ? N.interp(kind) : N.Interp ? (kind === 'ship' ? new N.Interp(NC.dShipRtc, NC.dShipRtc) : new N.Interp(NC.dRtc[0], NC.dRtc[1])) : new LInterp(kind === 'ship' ? NC.dShipRtc : NC.dRtc[0]);

/* ---------- layout: playfield 240x320 scaled by S; touch pad band below in phone portrait; render scale R buckets ---------- */
const BUCK = [1.5, 2, 2.5, 3, 4];
let S = 1, R = 0, LH = C.H, OX = 0, OY = 0, coarse = false, padMode = false, upright = false, rCap = 4, band = '#bfe6ff';
function layout() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight), dpr = devicePixelRatio || 1;
  coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
  upright = coarse && w > h && h < 420;   /* a phone on its side; a tablet in landscape plays letterboxed */
  S = Math.min(w / C.W, h / C.H);
  padMode = coarse && !upright && h - C.H * S >= 120;
  LH = padMode ? Math.min(h / S, C.H + 240) : C.H;
  const want = S * dpr, cap = Math.min(coarse ? 3 : 4, rCap);
  let r = BUCK[0]; for (const b of BUCK) if (b <= cap && Math.abs(b - want) <= Math.abs(r - want)) r = b;
  const cw = Math.round(C.W * r), ch = Math.round(LH * r);
  if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
  cv.style.width = C.W * S + 'px'; cv.style.height = LH * S + 'px';
  OX = (w - C.W * S) / 2; OY = padMode ? 0 : (h - LH * S) / 2; cv.style.left = OX + 'px'; cv.style.top = OY + 'px';
  if (r !== R || !A.ready) { R = r; try { if (A.ready && A.rescale) A.rescale(R); else A.init(R); } catch (e) { report(e); } }
  fLast = 0; fSum = 0; fN = 0; wSum = 0;
}
function setBand(col) { band = col; document.body.style.background = col; }

/* ---------- input ---------- */
const keys = Object.create(null); let hits = [], touchMode = false;
const mkIn = () => ({ dx: 0, dy: 0, mx: 0, my: 0, fire: false, charge: false }), IN = [mkIn(), mkIn()];
addEventListener('keydown', e => {
  const c = e.code || e.key || '';
  if (/^(Arrow|Space$|Enter$|NumpadEnter$|Slash$)/.test(c)) e.preventDefault();
  unlock(); touchMode = false;
  if (e.repeat) return;
  keys[c] = 1; hits.push(c);
});
addEventListener('keyup', e => { keys[e.code || e.key || ''] = 0; });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
const T = { mv: -1, lx: 0, ly: 0, seed: -1 };
const seedXY = () => padMode ? [C.W - 38, C.H + (LH - C.H) / 2] : [212, 292];
document.addEventListener('pointerdown', e => {
  unlock(); try { cv.focus({ preventScroll: true }); } catch (_) {}
  if (e.pointerType !== 'mouse') touchMode = true;
  const x = (e.clientX - OX) / S, y = (e.clientY - OY) / S;
  if (state === 'title') { titleTap(x, y); return; }
  if (state === 'wait') { if (alone) flyAlone(false); return; }
  if (state !== 'play') return;
  if (paused) { setPause(false); return; }
  if (curPh() === 4) { if (ut - phUt > 60) endingGo(); return; }
  if (curPh() === 5) { if (ut - phUt > 60 && mode !== 'guest') tryAgain(); return; }
  const sp = seedXY();
  if (touchMode && ((x - sp[0]) ** 2 + (y - sp[1]) ** 2 < 32 * 32 || T.mv >= 0)) T.seed = e.pointerId;   /* the SEED button, or a second finger */
  else if (T.mv < 0) { T.mv = e.pointerId; T.lx = e.clientX; T.ly = e.clientY; }
  if (e.cancelable) e.preventDefault();
}, { passive: false });
document.addEventListener('pointermove', e => {
  if (e.pointerId !== T.mv) return;
  const k = 1.25 / S; IN[0].mx += (e.clientX - T.lx) * k; IN[0].my += (e.clientY - T.ly) * k; T.lx = e.clientX; T.ly = e.clientY;
}, { passive: true });
const pUp = e => { if (e.pointerId === T.mv) { T.mv = -1; IN[0].mx = IN[0].my = 0; } if (e.pointerId === T.seed) T.seed = -1; };
document.addEventListener('pointerup', pUp); document.addEventListener('pointercancel', pUp);
function readInput() {
  const k = c => !!keys[c], two = !!(p2 && p2.local), firing = state === 'play' && curPh() < 4, i0 = IN[0];
  const ax = (k('ArrowRight') ? 1 : 0) - (k('ArrowLeft') ? 1 : 0), ay = (k('ArrowDown') ? 1 : 0) - (k('ArrowUp') ? 1 : 0);
  const wx = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), wy = (k('KeyS') ? 1 : 0) - (k('KeyW') ? 1 : 0);
  i0.dx = two ? wx : clamp(wx + ax, -1, 1); i0.dy = two ? wy : clamp(wy + ay, -1, 1);
  i0.charge = k('Space') || T.seed >= 0;
  i0.fire = firing && (!touchMode || T.mv >= 0 || T.seed >= 0);
  const ent = k('Enter') || k('NumpadEnter') || k('Slash'); if (!ent) p2Lock = false;
  if (two) {
    const i1 = IN[1]; i1.dx = ax; i1.dy = ay; i1.charge = ent && !p2Lock; i1.fire = firing;   /* the joining press is not a charge */
    if (wx || wy || i0.charge || T.mv >= 0) lastIn[0] = ut; if (ax || ay || ent) lastIn[1] = ut;
  }
  if (upright) { i0.dx = i0.dy = i0.mx = i0.my = 0; i0.fire = i0.charge = false; }   /* behind the 'upright' card */
}

/* ---------- state ---------- */
let state = 'title', mode = 'solo', online = false, paused = false, alone = false, verBad = false, waitText = '', waitUt = 0, forceVis = false;
let w = null, p1 = null, p2 = null, me = null, gIt = null, run = 0, gtCarry = 0, opp = 'your friend', startAt = 0, waiting = false;
let joinT = 0, p2Lock = false; const lastIn = [0, 0], JOIN_HOLD = 30, IDLE_HOME = 900;   /* local P2: hold ENTER 0.5 s; 15 s idle flies home */
let ut = 0, titleUt = 0, curSt = -1, stUt = 0, lastPh = -1, phUt = 0, pauseUt = 0, tallyNow = null, calm = 0;
let best = clamp((+store.get('breeze-best') | 0) || 1, 1, 3);
let diff = (v => v === '0' || v === '1' || v === '2' ? +v : 1)(store.get('breeze-diff'));   /* the title's choice (0-2), MEDIUM by default */
function setDiff(d) { diff = ((d % 3) + 3) % 3; store.set('breeze-diff', diff); sfx('select'); }
const diffName = d => (C.DIFF[d] || C.DIFF[1]).name;
const hidden = () => !forceVis && !!document.hidden;
const curPh = () => mode === 'guest' ? V.ph : w ? w.ph : 0;
const stageName = st => (BB.STAGES[st] && BB.STAGES[st].name) || '';
const bossName = st => { const S0 = BB.STAGES[st], D = S0 && BB.ENEMY[S0.boss]; return D ? D.name || S0.boss : ''; };

function startRun(st, t, d) {
  const host = mode === 'host'; d = d == null ? diff : d;   /* d: a GAME OVER retry keeps the run's difficulty */
  w = new BB.World({ stage: st, t: t || 0, coop: host, auto: true, god: DBG.god, gt: gtCarry, diff: d, run });
  const sp = host ? SH.start.p1 : SH.start.solo;
  p1 = me = new BB.Ship(0, sp[0], sp[1], d); p1.local = true; w.ships.push(p1); p2 = null; p1.cap = w.powerCap();
  B2.reset(w.seed);
  if (host) { p2 = new BB.Ship(1, SH.start.p2[0], SH.start.p2[1], d); p2.remote = true; p2.away = true; w.ships.push(p2); if (!gIt) gIt = mkInterp('ship'); }
  state = 'play'; paused = false; curSt = -1; lastPh = -1; tallyNow = null; hint = null; hintNext = null; hintAt = null; IN[0].mx = IN[0].my = 0; joinT = 0; au('hidden', hidden());
  if (DBG.debug) console.log('[breeze] run', run, 'stage', st + 1, mode);
}
function titleGo(st) { if (online || st > best - 1) return; sfx('select'); mode = 'solo'; startRun(st, 0); }
function titleTap(x, y) {
  const inR = r => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h, SN = A.titleSnd || [], DF = A.titleDiff || [];
  if (inR(SN[0])) { setMute(!muted); sfx('select'); return; }
  if (inR(SN[1])) { setMusic(!musicOn); sfx('select'); return; }
  for (let i = 0; i < DF.length; i++) if (inR(DF[i])) { if (!(online && mode === 'guest')) setDiff(i); return; }   /* online: the host picks */
  if (online) return;
  const P = A.titlePips || [];
  for (let i = 0; i < P.length; i++) if ((x - P[i].x) ** 2 + (y - P[i].y) ** 2 < (P[i].r + 6) ** 2) { if (i <= best - 1) titleGo(i); return; }
  titleGo(0);
}
function toTitle() { state = 'title'; titleUt = ut; paused = false; w = null; p1 = p2 = null; setBand(A.stageColor ? A.stageColor(0) : band); }
function endingGo() {   /* fly again from stage 1 (local co-op stays two) */
  if (mode !== 'host' && mode !== 'solo') return;
  const two = !!(p2 && p2.local); run++; startRun(0, 0); if (two) joinP2();
}
function tryAgain() {   /* GAME OVER: the same stage at the same difficulty, full lives, score 0 (only the host / solo; the guest follows run) */
  if ((mode !== 'host' && mode !== 'solo') || !w) return;
  const two = !!(p2 && p2.local), st = w.stage, d = w.diff; run++; startRun(st, 0, d); if (two) joinP2(); sfx('select');
}
function overKey(c) {   /* keys on the GAME OVER card */
  if (ut - phUt <= 60) return;
  if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') { if (mode !== 'guest') tryAgain(); }
  else if (c === 'Escape') { if (online) post({ ty: 'exit' }); else toTitle(); }
}
function canPause() { return mode === 'solo' && state === 'play' && curPh() < 4; }
function setPause(on) {   /* banner / screen ages stand still while paused */
  on = !!on; if (on === paused) return;
  if (on) pauseUt = ut; else { const d = ut - pauseUt; stUt += d; phUt += d; }
  paused = on; au('hidden', paused || hidden());
}
const joinLock = () => !!w && w.lives != null && (w.lives <= 0 || w.ships.some(s => s && s.out));   /* v4: no fresh ship while the team has no lives / one is resting */
function joinP2() {
  if (mode !== 'solo' || state !== 'play' || paused || !w || p2 || w.ph >= 4 || joinLock()) return;
  const who = p1.who ? 0 : 1;
  p2 = new BB.Ship(who, clamp(p1.x + 30, SH.xMin, SH.xMax), clamp(p1.y, 200, SH.yMax), w.diff); p2.local = true; p2.inv = SH.invRevive;
  w.fxList = w.fxList.filter(f => f.s !== 'Hold ENTER to join!');
  w.ships.push(p2); w.coop = true; joinT = 0; p2Lock = true; lastIn[0] = lastIn[1] = ut;   /* boss HP x1.5 from the next boss */
  sfx('join'); w.fxl('sticker', p2.x, p2.y - 22, (who ? 'MARIGOLD' : 'SPRIG') + ' JOINED!');
}
function joinWatch() {   /* a deliberate join: ENTER held for 0.5 s after a fresh press in play; a tap only shows how */
  if (!joinT) return;
  if (p2 || mode !== 'solo' || w.ph >= 4 || joinLock()) { joinT = 0; return; }
  if (keys.Enter || keys.NumpadEnter || keys.Slash) { if (++joinT > JOIN_HOLD) joinP2(); }
  else { joinT = 0; w.pushFx({ k: 'sticker', x: 176, y: 42, s: 'Hold ENTER to join!', n: 8, life: 90, born: w.gt }); }
}
function idleWatch() {   /* two on one keyboard: a player idle for 15 s while the other plays flies home; the other keeps every key */
  if (!p2 || !p2.local || DBG.bot || w.ph > 2) return;
  if (p1.down) lastIn[0] = ut; if (p2.down) lastIn[1] = ut;   /* v4: a floating or resting (OUT) player is not idle, nor "the one still playing" */
  for (let i = 0; i < 2; i++) if (ut - lastIn[i] > IDLE_HOME && ut - lastIn[1 - i] < 120 && !(i ? p1 : p2).down) {
    const gone = i ? p2 : p1, stay = i ? p1 : p2;
    w.partnerLeft(gone); w.fxl('sticker', gone.x, gone.y - 22, (gone.who ? 'MARIGOLD' : 'SPRIG') + ' FLEW HOME');
    p1 = me = stay; p2 = null; stay.local = true; joinT = 0; return;
  }
}
function onKey(c) {
  if (c === 'KeyM') { setMute(!muted); return; }
  if (c === 'KeyN') { setMusic(!musicOn); return; }
  if (state === 'title') {
    if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') titleGo(0);
    else if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowRight' || c === 'KeyD') { if (!(online && mode === 'guest')) setDiff(diff + (c === 'ArrowLeft' || c === 'KeyA' ? -1 : 1)); }
    else if (c === 'Digit2' || c === 'Numpad2') titleGo(1); else if (c === 'Digit3' || c === 'Numpad3') titleGo(2);
    return;
  }
  if (state === 'wait') { if (alone && (c === 'Space' || c === 'Enter')) flyAlone(false); return; }
  if (state !== 'play') return;
  if (paused) { if (c === 'KeyP' || c === 'Escape' || c === 'Space') setPause(false); return; }
  if (curPh() === 4) { if ((c === 'Space' || c === 'Enter') && ut - phUt > 60) endingGo(); else if (c === 'Escape') post({ ty: 'exit' }); return; }
  if (curPh() === 5) { overKey(c); return; }
  if ((c === 'KeyP' || c === 'Escape') && canPause()) { setPause(true); return; }
  if ((c === 'Enter' || c === 'NumpadEnter' || c === 'Slash') && !p2 && mode === 'solo') joinT = 1;
}

/* ---------- hints (once per browser, 'breeze-hints') and toasts ---------- */
const HINT_Y = 40;   /* hints point only at things clear of the top HUD */
let hint = null, hintT = 0, hintNext = null, hintAt = null, hintSeen = store.get('breeze-hints') || '';
function hintTick(ph, sec, bush, fruit) {
  if (hint) {
    if (hintAt && !alive(hintAt)) hintT = Math.min(hintT, 1);
    if (--hintT <= 0) { hint = hintAt = null; if (hintNext) { hint = hintNext[0]; hintT = hintNext[1]; hintAt = hintNext[2]; hintNext = null; } }
    return;
  }
  if (ph !== 0 || DBG.bot) return;
  const seen = c => hintSeen.indexOf(c) >= 0, mark = c => { hintSeen += c; store.set('breeze-hints', hintSeen); };
  if (!seen('b') && bush) { mark('b'); hint = 'Shoot it!'; hintT = 300; hintAt = bush; }
  else if (!seen('f') && fruit) { mark('f'); hint = 'Shoot the fruit to change it ↻'; hintT = 240; hintAt = fruit; hintNext = ['Fly into it!', 200, fruit]; }
  else if (!seen('s') && sec >= 20) { mark('s'); hint = touchMode ? 'Hold the SEED button' : 'Hold SPACE for a sun seed'; hintT = 300; }
}
function alive(o) { return mode === 'guest' ? VE.get(o.id) === o || VI.get(o.id) === o : !o.dead && !o.taken && (w.enemies.indexOf(o) >= 0 || w.fruits.indexOf(o) >= 0); }
function firstOf(list, test) { for (const o of list) if (test(o)) return o; return null; }
function toastMsg(s) { const f = { k: 'sticker', x: 120, y: 112, s, n: 9, life: 200, born: 0 }; if (mode === 'guest' || !w) { f.born = ut; pushG(f); } else { f.born = w.gt; w.pushFx(f); } }

/* ---------- solo / local co-op / online host ---------- */
function hostTick() {
  readInput(); joinWatch(); idleWatch(); p1.input = IN[0]; if (p2 && p2.local) p2.input = IN[1];
  if (DBG.bot) botDrive(p1, IN[0], w.bullets, w.enemies, w.fruits);
  if (mode === 'host') mirrorGuest();
  p1.hidden = false;
  w.step();
  const L = w.sfxList; for (let i = 0; i < L.length; i++) sfx(L[i], w.sfxArg[i]);
  if (mode === 'host') { for (const e of w.events) EV.add.apply(EV, [e.code].concat(e.args)); for (const g of w.grantsOut) GR.add(g[0], g[1]); if (w.gt % every() === 0) sendSnap(); }
  gtCarry = w.gt;
  stageWatch(w.stage, w.ph);
  chargeSnd(p1.charging && !p1.down ? p1.charge : null);
  hintTick(w.ph, w.tick / 60, firstOf(w.enemies, e => e.type === 'bush' && e.y > HINT_Y), firstOf(w.fruits, f => f.k < 5 && f.y > HINT_Y));
  if (DBG.bot && w.ph === 4 && ut - phUt > 300) endingGo();
  if (DBG.bot && w.ph === 5 && ut - phUt > 300 && DBG.retry !== false) tryAgain();
}
/* the online guest's ship, as the host draws and simulates it: interpolated packs, its shots spawned here from the fire flag */
function mirrorGuest() {
  const g = p2; if (!g || !g.remote) return;
  const t = now(), r = gIt ? gIt.at(t) : null;
  if (!r || !r.b) { g.away = true; return; }
  const a = r.a, b = r.b, k = r.k;
  g.unpack(b);
  g.out = !!g.outH; if (g.outH) g.down = true;   /* OUT is the host's call (world.lifeLost → grant 'o'), never a (maybe stale) guest pack */
  if (a !== b && Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]) < 320) { g.x = (a[0] + (b[0] - a[0]) * k) / 4; g.y = (a[1] + (b[1] - a[1]) * k) / 4; }
  g.x = clamp(g.x, SH.xMin, SH.xMax); g.y = clamp(g.y, SH.yMin, SH.yMax);
  g.away = g.hidden || (N.silence ? N.silence(t) : 0) > 1500;   /* silent: a faded ghost, not targeted, not shooting */
  if (g.away) { g.firing = false; g.lastSn = -1; }
}
function sendSnap() {
  if (!N.send) return;
  const off = hidden() || upright; p1.hidden = off;   /* a hidden tab or a phone on its side: away, p=1 */
  const s = w.pack();
  s.k = 's'; s.v = C.PROTO; s.run = run; s.p = off ? 1 : 0; s.h = p1.pack(); s.g = GR.pending(); s.ev = EV.pending(now());
  N.send(s);
}

/* ---------- online guest: the view, its own ship, cosmetic shots, self-hits, grants, events ---------- */
const VE = new Map(), VB = new Map(), VI = new Map(), V = { ok: false, t: 0, st: 0, ph: 0, sc: 0, bk: 0, bm: 0, sk: 0, df: 1, lv: null, held: false, extra: 0 };
const capOf = st => { const P = C.POWER_CAP; return P ? P[clamp(st | 0, 0, P.length - 1)] | 0 : SH.powerMax; };
let vIt = null, newest = null, hs = null, vs = 0, gfx = [], evQ = [], gShake = 0, gRun = -1, gSt = -1, gga = 0, quiet = 0, lastP = 0;
const gTal = { boss: false, cheer: false, toys: 0, gift: false, bk0: 0, hb0: 0, mb0: 0 };
function pushG(f) { if (gfx.length >= 128) gfx.shift(); gfx.push(f); }
const gfxAt = (k, x, y, n) => pushG({ k, x, y, n, born: ut });
const byId = l => { const m = new Map(); for (const e of l) m.set(e.id, e); return m; };
const near = (p, e) => p && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) < 80;
function guestSetup() {
  if (!vIt) vIt = mkInterp('view');
  if (!me || me.who !== 1) me = new BB.Ship(1, SH.start.p2[0], SH.start.p2[1]);
  me.local = true;
  if (!hs) { hs = new BB.Ship(0, SH.start.p1[0], SH.start.p1[1]); hs.remote = true; }
}
function enterGuestPlay() { guestSetup(); state = 'play'; paused = false; waiting = false; curSt = -1; lastPh = -1; tallyNow = null; }
function onSnap(o) {
  guestSetup();
  quiet = 0; lastP = o.p | 0;
  if (alone && state === 'wait') { alone = false; state = 'play'; }
  const sn = BB.World.unpack(o);
  if (me.diff !== sn.df) { const full = !me.down && me.hp >= me.hpMax; me.setDiff(sn.df); if (full) me.hp = me.hpMax; }   /* the host's difficulty: our hearts */
  if (hs.diff !== sn.df) hs.setDiff(sn.df);
  if (sn.run !== gRun) { if (gRun >= 0) { me.reset(SH.start.p2[0], SH.start.p2[1]); gfx.length = 0; evQ.length = 0; curSt = -1; lastPh = -1; tallyNow = null; } gRun = sn.run; gSt = sn.st; }   /* a new flight or a GAME OVER retry */
  else if (sn.st > gSt) { me.heal(me.healN); gfxAt('heart', me.x, me.y - 10); gSt = sn.st; }
  else if (sn.st < gSt) gSt = sn.st;
  vIt.push(o.t * TICK, sn, o._at);
  newest = sn;
  gga = GR.apply(o.g, applyGrant);
  const fr = EV.fresh(o, now());
  if (fr.length) { const at = now() + (vIt.until ? vIt.until(o.t * TICK) : 0); for (const e of fr) evQ.push([at, e]); }
  while (evQ.length > 256) playEvent(evQ.shift()[1], true);   /* a long-hidden tab: counted, not shown */
  if (state === 'title' && !verBad) enterGuestPlay();
}
function applyGrant(code, arg) {
  if (!me) return;
  if (code === 'f') { const k = arg | 0; if (k >= 1 && k <= 12 && k !== 6) me.grab(k); }   /* power-ups, hearts, super star, packets, bubbles */
  else if (code === 'h') { if (!me.down) me.hp = Math.min(me.hpMax, me.hp + 1); pushG({ k: 'heart', x: hs ? hs.x : me.x, y: hs ? hs.y : me.y, x2: me.x, y2: me.y, born: ut }); sfx('gift'); }
  else if (code === 'r') { if (me.down) { me.revive(); gfxAt('revive', me.x, me.y); sfx('revive'); } }
  else if (code === 'w') { me.hp = me.hpMax; me.shield = me.shMax || 3; }
  else if (code === 'o') { if (arg === Math.max(0, gRun) % 10000 && !me.out) { me.goOut(); sfx(AU_has('out') ? 'out' : 'bubble'); } }   /* v3: the host says we are OUT (this run only) */
}
function buildView() {
  const r = vIt ? vIt.at(now()) : null;
  if (!r || !r.b) { V.held = true; return V.ok; }
  const a = r.a, b = r.b, k = r.k; vs++;
  V.ok = true; V.held = !!r.held; V.extra = r.extra || 0; V.t = a.t + (b.t - a.t) * k;
  V.st = b.st; V.ph = b.ph; V.sc = b.sc; V.bk = b.bk; V.bm = b.bm; V.sk = b.sk; V.df = b.df; V.lv = b.lv;
  hs.unpack(b.h); me.cap = hs.cap = capOf(V.st);
  if (a !== b && Math.abs(b.h[0] - a.h[0]) + Math.abs(b.h[1] - a.h[1]) < 320) { hs.x = (a.h[0] + (b.h[0] - a.h[0]) * k) / 4; hs.y = (a.h[1] + (b.h[1] - a.h[1]) * k) / 4; }
  hs.away = hs.hidden || lastP === 1 || quiet > 90;
  if (hs.away) { hs.firing = false; hs.lastSn = -1; }
  const am = a.Em || (a.Em = byId(a.E));
  for (const e of b.E) {
    const p = am.get(e.id), ok = p && p.tc === e.tc && near(p, e), x = ok ? p.x + (e.x - p.x) * k : e.x, y = ok ? p.y + (e.y - p.y) * k : e.y;
    let v = VE.get(e.id);
    if (!v || v.tc !== e.tc) { v = { id: e.id, tc: e.tc, type: e.type, def: BB.ENEMY[e.type] || {}, x, y, vx: 0, vy: 0, a: e.a, hp: e.hp, age: 0, flash: 0, vs: 0 }; VE.set(e.id, v); }
    else { v.vx = x - v.x; v.vy = y - v.y; v.age++; if (v.flash > 0) v.flash--; }
    if (e.hp >= 0 && v.hp > e.hp) v.flash = 2;
    if (e.tc === TCZ && e.a === 2 && v.a !== 2) { sfx('zap'); gShake = Math.max(gShake, 0.6); }
    if (v.def.boss) { gTal.boss = true; if (e.a === 3) gTal.cheer = true; }
    v.x = x; v.y = y; v.a = e.a; v.hp = e.hp; v.vs = vs;
  }
  VE.forEach((v, id) => { if (v.vs !== vs) VE.delete(id); });
  const bm = a.Bm || (a.Bm = byId(a.B));
  for (const e of b.B) {
    const p = bm.get(e.id), ok = near(p, e), x = ok ? p.x + (e.x - p.x) * k : e.x, y = ok ? p.y + (e.y - p.y) * k : e.y;
    let v = VB.get(e.id);
    if (!v || Math.abs(v.x - x) + Math.abs(v.y - y) > 40) { v = { id: e.id, big: e.big, x, y, vx: 0, vy: 0, age: 0, gone: false, vs: 0 }; VB.set(e.id, v); }   /* new in the view: age 0 */
    else { v.vx = x - v.x; v.vy = y - v.y; v.age++; }
    v.x = x; v.y = y; v.vs = vs;
  }
  VB.forEach((v, id) => { if (v.vs !== vs) VB.delete(id); });
  const im = a.Im || (a.Im = byId(a.I));
  for (const e of b.I) {
    const p = im.get(e.id), ok = near(p, e), x = ok ? p.x + (e.x - p.x) * k : e.x, y = ok ? p.y + (e.y - p.y) * k : e.y;
    let v = VI.get(e.id);
    if (!v) { v = { id: e.id, k: e.k, x, y, h: e.h, fall: e.fall, sq: 0, vy: 0, vs: 0 }; VI.set(e.id, v); }
    else { if (e.h > v.h || (v.fall && !e.fall && e.k === v.k)) v.sq = 1; else if (v.sq > 0) v.sq = Math.max(0, v.sq - 0.1); v.vy = y - v.y; }
    v.k = e.k; v.x = x; v.y = y; v.h = e.h; v.fall = e.fall; v.vs = vs;
  }
  VI.forEach((v, id) => { if (v.vs !== vs) VI.delete(id); });
  return true;
}
/* shots in the guest's view are cosmetic: they vanish on an enemy, a bush or a falling fruit (the host decides the real hits) */
function viewShots(s, mine) {
  for (const sh of s.shots) {
    if (sh.dead) continue;
    if (mine && sh.cancelR) for (const b of VB.values()) if (!b.gone && (b.x - sh.x) ** 2 + (b.y - sh.y) ** 2 < sh.cancelR * sh.cancelR) { b.gone = true; gfxAt('cancel', b.x, b.y); }
    if (sh.kind === 'sun') continue;
    let hit = false;
    for (const v of VE.values()) {
      const d = v.def; if (!d.shootable || v.tc === TCZ || v.y < 4) continue; const rr = (d.r || 8) + sh.r;
      if ((v.x - sh.x) ** 2 + (v.y - sh.y) ** 2 >= rr * rr) continue;
      if (sh.hitIds) { if (sh.hitIds.indexOf(v.id) >= 0) continue; sh.hitIds.push(v.id); if (--sh.pierce > 0) { if (mine) gfxAt('spark', sh.x, sh.y - 2); continue; } }   /* bolts and stars pierce */
      hit = true; break;
    }
    if (!hit && sh.kind !== 'seedlet') for (const f of VI.values()) if (f.fall && f.k < 5 && (f.x - sh.x) ** 2 + (f.y - sh.y) ** 2 < (FR.r + sh.r) ** 2) { hit = true; if (mine) { f.sq = 1; sfx('bump', 1); } break; }
    if (hit) { sh.dead = true; if (mine) gfxAt('spark', sh.x, sh.y - 2); }
  }
}
function hurtMe() {
  const r = me.hurt(); if (!r) return;
  if (r === 1) { gfxAt('shield', me.x, me.y); sfx('shield'); }
  else if (r === 2) { gfxAt('hurt', me.x, me.y); sfx('hurt'); gShake = Math.max(gShake, 0.5); }
  else { gfxAt('bubble', me.x, me.y); sfx('bubble'); gShake = Math.max(gShake, 0.6); if (V.lv === 0) me.noRev = 600; }   /* v4: down at 0 lives: no self-revive, the host's OUT is coming (10 s safety) */
}
function viewHurt() {   /* each player checks their own ship against what they see; new bullets are ignored for 12 ticks */
  if (me.down || me.inv > 0) return;
  for (const b of VB.values()) {
    if (b.gone || b.age < NC.ignoreNewBulletTicks) continue;
    const rr = (b.big ? 4 : 2.5) + SH.hurtR;
    if ((b.x - me.x) ** 2 + (b.y - me.y) ** 2 < rr * rr) { b.gone = true; hurtMe(); return; }
  }
  for (const v of VE.values()) if (v.tc === TCZ && v.a === 2) { let on = Math.abs(me.x - v.x) < 10; try { if (v.def.hit) on = v.def.hit(v, me.x, me.y); } catch (_) {} if (on) { hurtMe(); return; } }
}
function viewBonk() {   /* the knock-back is ours; the 4 damage is dealt by the host from its view of us */
  if (me.down) return;
  for (const v of VE.values()) {
    const d = v.def;
    if (d.boss) { if (v.a !== 3 && BB.World.push(me, v.x, v.y, d.r || 30) && me.bonkT === 0) { me.bonkT = SH.invBonk; sfx('boing'); gfxAt('boinged', me.x, me.y - 6); } continue; }
    if (!d.contact || d.ground || me.bonkT > 0) continue;
    const dx = me.x - v.x, dy = me.y - v.y, rr = (d.r || 8) + 7;
    if (dx * dx + dy * dy < rr * rr) { BB.World.knock(me, dx, dy); gfxAt('boinged', (me.x + v.x) / 2, (me.y + v.y) / 2); sfx('boing'); }
  }
}
const FXOK = { pot: 1, sparkle: 1, sticker: 1, calm: 1, unwind: 1, pop: 1 }, EV_STALE = 300;   /* 'F' kinds the host's world sends; events older than 300 ms are not shown */
function playEvent(e, stale) {
  const c = e[1];
  if (stale) { if (c === 'K') { if (BB.TYPE_LIST[e[2]] === 'present') gTal.gift = true; else gTal.toys++; } else if (c === 'B' && gTal.cheer) gTal.toys++; return; }
  if (c === 'K') { const type = BB.TYPE_LIST[e[2]] || 'smudge', x = e[3] / 4, y = e[4] / 4, pts = e[5] | 0, D = BB.ENEMY[type];
    pushG(BB.World.killFx(type, x, y, ut)); if (pts >= 100) pushG({ k: 'sticker', x, y: y - 8, s: '+' + pts, born: ut });
    sfx(D && D.r >= 11 ? 'popBig' : 'pop'); if (type === 'present') gTal.gift = true; else gTal.toys++; }
  else if (c === 'P') { gfxAt('pop', e[2] / 4, e[3] / 4); sfx('pop'); }
  else if (c === 'C') { const f = VI.get(e[2]); if (f) gfxAt('ripen', f.x, f.y); sfx('ripen'); }
  else if (c === 'G') { const x = e[2] / 4, y = e[3] / 4, k = e[4] | 0, lab = BB.FRUITS[k] && BB.FRUITS[k].label;
    if (hs && (e[5] | 0) === hs.who && k >= 9 && k <= 11 && k - 8 === hs.wt) hs.wtT = hs.wtMax;   /* v4: the host's same packet: its timer is full again */
    gfxAt('grab', x, y); const gk = BB.World.grabFx(k); if (gk) gfxAt(gk, x, y, k >= 8 && k <= 11 ? k - 8 : undefined); if (lab) pushG({ k: 'sticker', x, y: y - 10, s: lab, born: ut }); sfx(BB.World.grabSnd(k)); }
  else if (c === 'Q') sfx('cancel');
  else if (c === 'S') sfx('start');
  else if (c === 'W') sfx('warning');
  else if (c === 'A') { if (e[2] === 'gift') sfx('gift'); }
  else if (c === 'B') { const x = e[2] / 4, y = e[3] / 4; gfxAt('pop', x, y); gfxAt('popBig', x, y, 2); sfx('bossDown'); gShake = 1; if (gTal.cheer) gTal.toys++; if (V.st >= 1 && gTal.cheer) gfxAt('rainbow', 120, 70); }
  else if (c === 'T') { pushG(BB.World.stickerFx(e[2] | 0, e[3] / 4, e[4] / 4, ut)); if ((e[2] | 0) === 1) sfx('basket'); }
  else if (c === 'F') {   /* never a peer-chosen kind or count: known kinds only, text for stickers only */
    const k = e[2]; if (typeof k !== 'string' || FXOK[k] !== 1) return;
    const f = { k, x: clamp(+e[3] / 4 || 0, -40, 280), y: clamp(+e[4] / 4 || 0, -40, 360), born: ut };
    if (k === 'sticker') { f.s = typeof e[5] === 'string' && e[5] ? e[5].slice(0, 24) : '!'; if (f.s.length > 12) f.life = 150; }   /* v6: a message (w.toast) stays a while */
    else if (k === 'unwind') { if (typeof e[5] !== 'string' || !Object.prototype.hasOwnProperty.call(BB.TC, e[5])) return; f.s = e[5]; }   /* a minion cheered up with its boss: a known toy type only */
    else if (k === 'pop') f.n = clamp(+e[5] | 0, 1, 2);
    pushG(f); }
}
function guestTally() {
  const hearts = Math.max(0, hs.hp | 0) + Math.max(0, me.hp | 0), noBub = hs.bub - gTal.hb0 + me.bub - gTal.mb0 === 0 ? C.TALLY.noBubble : 0, fruit = Math.max(0, V.bk - gTal.bk0);
  return { boss: gTal.boss ? (gTal.cheer ? C.BOSS.bonus : C.BOSS.tiredBonus) : 0, tired: !gTal.cheer, name: bossName(V.st), hearts, heartPts: hearts * C.TALLY.heart, noBub, fruit, toys: gTal.toys, gift: gTal.gift, stars: [true, fruit >= 10, gTal.gift] };
}
function guestTick() {
  quiet++;
  if (!buildView()) return;
  readInput();
  if (DBG.bot) botDrive(me, IN[0], Array.from(VB.values()), Array.from(VE.values()), Array.from(VI.values()));
  const wasDown = me.down, wasOut = me.out;
  if (wasOut && V.ph === 5) me.outT = 0;   /* v4: GAME OVER holds the 60 s rest */
  me.wtHold = hs.wtHold = V.ph >= 3;   /* v4: weapon timers wait during the tally */
  me.hidden = upright;   /* on its side: flagged hidden (16), so the host shows a ghost and nobody aims at it */
  me.step(IN[0], hs);
  if (wasDown && !me.down) { gfxAt('revive', me.x, me.y); sfx('revive'); if (wasOut) pushG({ k: 'sticker', x: me.x, y: me.y - 20, s: 'BACK!', born: ut }); }
  if (me.vol) sfx('shot');
  if (me.rel) { sfx(me.rel === 2 ? 'sun' : 'seedlet'); gfxAt('seedburst', me.x, me.y - 12, me.rel); }
  if (me.supEnd) sfx('superEnd');
  if (me.wEnd) { sfx('superEnd'); gfxAt('wend', me.x, me.y, me.wEnd); }   /* v4: our timed weapon ran out (the pack now says wt 0) */
  me.steer(VE.values()); me.moveShots(); hs.mirror(); if (hs.wEnd) gfxAt('wend', hs.x, hs.y, hs.wEnd); hs.steer(VE.values()); hs.moveShots();
  viewShots(me, true); viewShots(hs, false);
  if (!(V.held || V.extra > 50 || lastP || DBG.god || upright)) viewHurt();
  if (!upright) viewBonk();
  const t = now(); let j = 0;
  for (let i = 0; i < evQ.length; i++) { const q = evQ[i]; if (q[0] <= t) playEvent(q[1], t - q[0] > EV_STALE); else evQ[j++] = q; }
  evQ.length = j;
  if (quiet > NC.guestSilence / TICK && !lastP) { state = 'wait'; alone = true; waitText = opp + ' has gone quiet.\nSPACE or tap: fly on alone'; }
  if (ut % every() === 0) sendGuest();
  stageWatch(V.st, V.ph);
  chargeSnd(me.charging && !me.down ? me.charge : null);
  hintTick(V.ph, (V.t - V.sk) / 60, firstOf(VE.values(), v => v.type === 'bush' && v.y > HINT_Y), firstOf(VI.values(), f => f.k < 5 && f.y > HINT_Y));
  if (gShake > 0) gShake = Math.max(0, gShake - 0.05);
}
function sendGuest() { if (N.send && me) N.send({ k: 'g', v: C.PROTO, run: Math.max(0, gRun), t: ut, s: me.pack(), ga: gga | 0 }); }
/* the guest flies on as a solo host from the start of the current stage */
function flyAlone(fromPeer) {
  if (mode !== 'guest' && mode !== 'host') return;
  if (!fromPeer) { if (N.leave) N.leave(); else post({ ty: 'leave' }); }
  if (mode === 'host') { hostAlone('Flying on alone. Keep going!'); return; }
  online = false; mode = 'solo'; alone = false; lastP = 0; verBad = false;
  if (!newest || !me) { toTitle(); return; }
  w = new BB.World({ stage: newest.st, coop: false, auto: true, god: DBG.god, gt: ut, score: newest.sc, basket: newest.bk, diff: newest.df, lives: newest.lv, run });
  me.shots.length = 0; me.away = me.hidden = false; p1 = me; p2 = null; w.ships.push(p1); me.cap = w.powerCap();
  if (newest.ph === 4 || newest.ph === 5) w.setPh(newest.ph);
  state = 'play'; paused = false; curSt = -1; lastPh = -1; tallyNow = null;
  toastMsg(opp + ' flew home. Keep going!');
}

/* ---------- parent link (via net.js) ---------- */
function onLink(L) {
  if (!L || (L.role !== 'host' && L.role !== 'guest')) return;
  opp = L.opp || opp;
  if (!online || L.first) {
    online = true; mode = L.role; verBad = false;
    if (mode === 'guest') { w = null; p1 = p2 = null; guestSetup(); }
    if (state === 'title' || state === 'wait') { state = 'title'; titleUt = ut; waiting = false; startAt = now() + (L.startIn || 0); }
    else if (mode === 'host' && w) {   /* linked while already flying: carry on as host */
      if (p2 && p2.local) w.ships.splice(w.ships.indexOf(p2), 1);
      p2 = new BB.Ship(1, SH.start.p2[0], SH.start.p2[1], w.diff); p2.remote = true; p2.away = true; w.ships.push(p2); w.coop = true; if (!gIt) gIt = mkInterp('ship');
    } else if (mode === 'guest') { state = 'title'; titleUt = ut; waiting = true; startAt = 0; }
  } else if (state === 'title' && startAt) startAt = now() + (L.startIn || 0);   /* startIn is honoured only on the title */
}
function onMsg(o) {
  if (!o) return;
  if (o.k === 'ver') { if (!verBad && online) { verBad = true; state = 'wait'; alone = true; waitUt = ut; waitText = 'Refresh the page\nto play together\nSPACE or tap: fly on alone'; } return; }
  if (mode === 'host' && o.k === 'g') { if (!gIt) gIt = mkInterp('ship'); gIt.push(o.t * TICK, o.s, o._at); GR.ack(o.ga | 0); }
  else if (mode === 'guest' && o.k === 's') onSnap(o);
}
function onPeerLeft() {
  if (mode === 'host') hostAlone(opp + ' flew home. Keep going!');
  else if (mode === 'guest') flyAlone(true);
}
function hostAlone(msg) {   /* the host carries on solo: the partner left, or a version mismatch and SPACE */
  if (w) w.partnerLeft(); if (p2 && p2.remote) p2 = null;
  mode = 'solo'; online = false; startAt = 0; alone = verBad = false;
  if (state === 'wait') { if (w) state = 'play'; else toTitle(); }
  if (state === 'play') toastMsg(msg);
}
if (N.init) N.init({ onLink, onMsg, onPeerLeft, onMute: on => setMute(on, true), onMusic: on => setMusic(on, true) });

/* ---------- ticks ---------- */
function stageWatch(st, ph) {
  if (st !== curSt) {
    curSt = st; stUt = ut; lastPh = -1;
    try { if (A.setStage) A.setStage(st); } catch (e) { report(e); }
    setBand(A.stageColor ? A.stageColor(st) : band);
    if (st + 1 > best) { best = st + 1; store.set('breeze-best', best); }
    if (mode === 'guest') { gTal.boss = gTal.cheer = gTal.gift = false; gTal.toys = 0; gTal.bk0 = V.bk; gTal.hb0 = hs.bub; gTal.mb0 = me.bub; }
  }
  if (ph !== lastPh) {
    lastPh = ph; phUt = ut;
    if (ph === 3) { tallyNow = mode === 'guest' ? guestTally() : w.tally; if (tallyNow) tallyNow.rows = tallyRows(tallyNow); }
  }
}
function tallyRows(t) {
  const rows = [];
  if (t.boss) rows.push([t.tired ? t.name + ' got sleepy' : t.name + ' cheered up!', t.boss]);
  if (t.boss && t.tired) rows.push(['(not cheered up this time)', '']);   /* v6: a tired exit is not a win */
  rows.push(['Hearts left ×' + t.hearts, t.heartPts]);
  if (t.noBub) rows.push(['No bubbles!', t.noBub]);
  rows.push(['Fruit grabbed', t.fruit]);
  rows.push(['Toys cheered up', t.toys]);
  return rows;
}
function musicWatch() {
  if (state === 'title') return music('title');
  if (state !== 'play') return;
  const ph = curPh();
  if (ph <= 1) music('stage', Math.max(0, curSt));
  else if (ph === 2) music((mode === 'guest' ? V.bm === 0 : w.doneT >= 0) ? null : 'boss', Math.max(0, curSt));
  else if (ph === 5) music(AU.MUSIC_NAMES && AU.MUSIC_NAMES.indexOf('gameover') >= 0 ? 'gameover' : null);   /* GAME OVER: its own tune, or quiet */
  else music(ph === 3 ? 'clear' : 'title');
}
function tick() {
  ut++;
  const hk = hits; hits = [];
  for (const c of hk) onKey(c);
  if (state === 'title') {
    if (online && startAt && now() >= startAt) { startAt = 0; if (mode === 'host') startRun(0, 0); else waiting = true; }
    if (DBG.bot && !online && ut - titleUt > 40) titleGo(0);
  } else if (state === 'play') {
    if (mode === 'guest') guestTick();
    else if (!paused && !upright) hostTick();
    else if (upright && mode === 'host' && w && ut % every() === 0) sendSnap();   /* on its side online: the world waits, like a hidden tab */
  } else if (state === 'wait' && ut % 30 === 0 && !(verBad && ut - waitUt > 300)) {   /* keep the other side informed (version screen: 5 s, quiet host) */
    if (mode === 'host' && w) sendSnap(); else if (mode === 'guest' && me) sendGuest();
  }
  const ph = curPh(), tc = (state === 'play' && curSt >= 1 && (ph >= 3 || (ph === 2 && (mode === 'guest' ? V.bm === 0 : w.doneT >= 0)))) ? 1 : 0;
  calm += (tc - calm) * 0.02;
  musicWatch();
}

/* ---------- render (SPEC order): bg, ground, bushes, fruit, air + boss, partner shots, my shots, buddies, ships (mine on
   top), enemy bullets, fx, HUD, overlay. Only the world layer shakes. ---------- */
const SO = { t: 0, blink: false, down: false, out: false, shield: 0, charge: 0, tilt: 0, ghost: false, super: 0, wt: 0, wfl: 0 }, EO = { a: 0, t: 0, flash: 0, hpf: 1, vx: 0, vy: 0 }, FO = { t: 0, h: 0, next: 0, squash: 0 };
const PH = [{}, {}], BO = { name: '', hpf: 1 }, UND = [false, false], HUD = { t: 0, score: 0, basket: 0, p: PH, boss: null, touch: false, net: null, hint: null, diff: '', under: UND, lives: null };
const isBoss = t => { const D = BB.ENEMY[t]; return !!(D && D.boss); };
function drawEnemy(type, x, y, a, t, flash, hpf, vx, vy) { EO.a = a; EO.t = t; EO.flash = flash; EO.hpf = hpf; EO.vx = vx; EO.vy = vy; A.enemy(ctx, type, x, y, EO); }
function drawFruit(k, x, y, h, sq) { FO.t = ut; FO.h = h; FO.next = k < 5 ? (k + 1) % 5 : 0; FO.squash = sq || 0; A.fruit(ctx, k, x, y, FO); }
function drawShots(s) { if (s) for (const sh of s.shots) if (!sh.dead) A.shot(ctx, sh.kind, sh.x, sh.y, sh.ang, ut, sh.who); }
function drawBuddies(s) { if (s && !s.down) for (let i = 0; i < s.buddies; i++) A.buddy(ctx, s.who, s.bx[i], s.by[i], ut + i * 4); }
function drawShip(s) {
  if (!s) return; SO.t = ut + s.who * 17; SO.blink = s.inv > 0 && !s.down; SO.down = s.down; SO.out = !!s.out; SO.shield = s.shield; SO.charge = s.charging ? s.charge : 0; SO.tilt = s.tilt || 0; SO.ghost = !!(s.away || s.hidden); SO.super = s.superT > 0 && !s.down ? Math.min(1, s.superT / (s.superMax || C.SUPER.ticks)) : 0;
  SO.wt = s.wt | 0; SO.wfl = s.wt > 0 && !s.down && !(s.superT > 0) && s.wtT > 0 && s.wtT <= 180 ? s.wtT : 0;   /* v4: the last 3 s of a timed weapon */
  const fade = s.out && !artV3(); if (fade) ctx.globalAlpha = 0.4;   /* an older art.js: OUT is simply faded */
  A.ship(ctx, s.who, s.x, s.y, SO); if (fade) ctx.globalAlpha = 1;
}
/* does BB.Art draw the v3 pieces (GAME OVER card, lives in the HUD, the grey OUT dandelion)? Asked once with a counting stand-in ctx */
let artOk = null;
function artV3() {
  if (artOk !== null) return artOk;
  let n = 0; const fake = new Proxy({}, { get(t, k) { n++; return k === 'canvas' ? cv : k === 'measureText' ? () => ({ width: 0 }) : () => {}; }, set() { n++; return true; } });
  try { A.screen(fake, 'gameover', { age: 60, stage: 0, score: 0, guest: false, opp: '' }); } catch (_) { n++; }
  return (artOk = n > 0);
}
function drawFx(list, age0) { let j = 0; for (let i = 0; i < list.length; i++) { const f = list[i], age = age0 - f.born; if (age < 900 && A.fx(ctx, f, age)) list[j++] = f; } list.length = j; }
function drawWorld() {
  const E = w.enemies;
  A.bg(ctx, w.stage, w.tick * C.SCROLL, ut, { calm });
  for (let pass = 0; pass < 4; pass++) {   /* ground, bushes (then fruit), air + boss, zap columns */
    for (const e of E) {
      if (e.dead) continue;
      const D = BB.ENEMY[e.type] || {}, layer = D.ground ? 0 : e.type === 'bush' ? 1 : e.type === 'zap' ? 3 : 2;
      if (layer === pass) drawEnemy(e.type, e.x, e.y, e.a, e.t, e.flash, D.boss ? (e.d.inv ? 1 : e.hp / e.maxHp) : 1, e.x - (e.ox == null ? e.x : e.ox), e.y - (e.oy == null ? e.y : e.oy));
    }
    if (pass === 1) for (const f of w.fruits) if (!f.taken) drawFruit(f.k, f.x, f.y, f.h, f.sq);
  }
  drawShots(p2); drawShots(p1); drawBuddies(p2); drawBuddies(p1); drawShip(p2); drawShip(p1);
  for (const b of w.bullets) if (!b.dead) A.bullet(ctx, b.x, b.y, b.big, ut);
  drawFx(w.fxList, w.gt);
}
function drawView() {
  A.bg(ctx, V.st, (V.t - V.sk) * C.SCROLL, ut, { calm });
  const bmax = V.bm || 1;
  for (let pass = 0; pass < 4; pass++) {
    for (const v of VE.values()) {
      const layer = v.def.ground ? 0 : v.type === 'bush' ? 1 : v.tc === TCZ ? 3 : 2;
      if (layer === pass) drawEnemy(v.type, v.x, v.y, v.a, v.age, v.flash, v.def.boss ? (v.hp < 0 ? 1 : v.hp / bmax) : 1, v.vx, v.vy);
    }
    if (pass === 1) for (const f of VI.values()) drawFruit(f.k, f.x, f.y, f.h, f.sq);
  }
  drawShots(hs); drawShots(me); drawBuddies(hs); drawBuddies(me); drawShip(hs); drawShip(me);
  for (const b of VB.values()) if (!b.gone) A.bullet(ctx, b.x, b.y, b.big, ut);
  drawFx(gfx, ut);
}
/* v4: whole seconds until an OUT ship is back (Ship.outT: exact for our own ships, from when we first saw it resting for a remote one) */
const outLeft = s => s.out ? Math.max(1, Math.ceil(((SH.outTicks || 3600) - (s.outT | 0)) / 60)) : 0;
function fillP(P, s, joined) {
  P.name = s.who ? 'MARIGOLD' : 'SPRIG'; P.who = s.who; P.hp = s.hp; P.hpMax = s.hpMax; P.shield = s.shield; P.shMax = s.shMax || 3; P.buddies = s.buddies; P.spd = s.spd;
  P.wt = s.wt; P.wtT = s.wt > 0 && s.wtT > 0 ? Math.min(1, s.wtT / (s.wtMax || 1200)) : 0; P.spread = s.spread; P.super = s.superT > 0 ? Math.min(1, s.superT / (s.superMax || C.SUPER.ticks)) : 0; P.charge = s.charging ? s.charge : 0; P.down = s.down; P.out = !!s.out; P.outS = outLeft(s); P.joined = joined; P.local = !s.remote;
  if (s.y < 36 && !s.down) { if (s.x < 104) UND[0] = true; if (s.x > 136) UND[1] = true; }   /* a ship under a pill: the pill fades */
}
function hud() {
  const H = HUD; H.t = ut; H.touch = touchMode; H.net = DBG.debug && online && N.meter ? N.meter() : null; H.boss = null; UND[0] = UND[1] = false;
  H.diff = diffName(mode === 'guest' ? V.df : w.diff);
  H.lives = mode === 'guest' ? (V.lv == null ? null : V.lv) : w.lives;   /* v3: team lives (null: off) */
  if (mode === 'guest') {
    H.score = V.sc; H.basket = V.bk; fillP(PH[0], hs, true); fillP(PH[1], me, true); PH[0].local = false;
    for (const v of VE.values()) if (v.def.boss) { BO.name = v.def.name || v.type; BO.hpf = v.hp < 0 ? 1 : v.hp / (V.bm || 1); H.boss = BO; }
  } else {
    H.score = w.score; H.basket = w.basket; fillP(PH[0], p1, true);
    if (p2) fillP(PH[1], p2, true); else { PH[1].joined = false; PH[1].who = p1.who ? 0 : 1; PH[1].name = ''; }
    const b = w.boss; if (b && !b.dead) { BO.name = (BB.ENEMY[b.type] || {}).name || b.type; BO.hpf = b.d.inv ? 1 : Math.max(0, b.hp / b.maxHp); H.boss = BO; }
  }
  H.hint = hint && !(hintAt && alive(hintAt)) ? hint : null;
  return H;
}
function overlays() {
  if (paused) { A.screen(ctx, 'pause', {}); return; }
  const ph = curPh(), age = ut - phUt;
  if (hint && hintAt && alive(hintAt)) A.text(ctx, hint, clamp(hintAt.x, 70, 170), clamp(hintAt.y - 24 + Math.sin(ut * 0.1) * 1.5, 46, 296), 9, '#fff');
  if (ph === 0 && ut - stUt < C.STAGE.bannerTicks) A.screen(ctx, 'banner', { stage: curSt, name: stageName(curSt), age: ut - stUt });
  else if (ph === 1) A.screen(ctx, 'warning', { name: bossName(curSt), age });
  else if (ph === 3 && tallyNow) A.screen(ctx, 'tally', { rows: tallyNow.rows, stars: tallyNow.stars, age, title: tallyNow.boss && tallyNow.tired ? 'ON YOU GO!' : '' });
  else if (ph === 4) {
    A.screen(ctx, 'ending', { age, score: mode === 'guest' ? V.sc : w.score, toys: mode === 'guest' ? 0 : w.runToys, duo: mode === 'guest' || !!p2, who: me ? me.who : 0, guest: mode === 'guest' });
    if (mode === 'guest') A.text(ctx, opp + ' can start a new flight', 120, 303, 8, '#fff');
  } else if (ph === 5) {
    const st = mode === 'guest' ? V.st : w.stage, sc = mode === 'guest' ? V.sc : w.score;
    if (artV3()) A.screen(ctx, 'gameover', { age, stage: st, score: sc, guest: mode === 'guest', opp, duo: mode === 'guest' || !!p2, who: me ? me.who : 0, touch: touchMode });
    else {   /* an older art.js: a plain card */
      ctx.fillStyle = 'rgba(43,33,64,.72)'; ctx.fillRect(20, 110, 200, 100);
      A.text(ctx, 'GAME OVER', 120, 130, 16, '#ffd93b'); A.text(ctx, 'Stage ' + (st + 1) + '   Score ' + sc, 120, 154, 9, '#fff');
      A.text(ctx, mode === 'guest' ? opp + ' can try again' : (touchMode ? 'Tap' : 'SPACE') + ': try again', 120, 178, 9, '#fff');
      if (mode !== 'guest') A.text(ctx, 'Esc: title', 120, 196, 8, '#e4d8ff');
    }
  }
  if (HUD.lives != null && !artV3()) A.text(ctx, 'LIVES ×' + HUD.lives, 120, 40, 7, '#fff');   /* an older art.js: lives as text */
  if (mode === 'guest' && lastP) A.screen(ctx, 'wait', { text: 'Waiting for ' + opp + '…' });
}
function render() {
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.globalAlpha = 1;
  if (LH > C.H) { ctx.fillStyle = band; ctx.fillRect(0, C.H, C.W, LH - C.H); }
  const world = state !== 'title' && (mode === 'guest' ? V.ok && !!hs : !!w);
  if (!world) {
    A.screen(ctx, 'title', { t: ut, best: online ? 0 : best - 1, online, opp, waiting: online && (waiting || mode === 'guest' && !startAt), touch: touchMode,
      diff, diffBy: online && mode === 'guest' ? opp : null, sound: !muted, music: musicOn });
    if (online && startAt) { const n = Math.ceil((startAt - now()) / 1000); if (n > 0) A.text(ctx, String(n), 120, 116, 24, '#ffd93b'); }
    if (state === 'wait') A.screen(ctx, 'wait', { text: waitText });
  } else {
    const sh = mode === 'guest' ? gShake : w.shakeAmt;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, C.W, C.H); ctx.clip();
    try {
      if (sh > 0) ctx.translate(Math.sin(ut * 1.7) * sh * 3, Math.cos(ut * 2.3) * sh * 3);
      if (mode === 'guest') drawView(); else drawWorld();
    } finally { ctx.restore(); }   /* never leave the playfield clip on (the pad band and SEED button live below it) */
    A.hud(ctx, hud());
    overlays();
    if (state === 'wait') A.screen(ctx, 'wait', { text: waitText });
    if (touchMode && state === 'play' && curPh() < 4) { const sp = seedXY(); A.touchPad(ctx, { rect: padMode ? { x: 0, y: C.H, w: C.W, h: LH - C.H } : null, seedDown: T.seed >= 0, seedX: sp[0], seedY: sp[1] }); }
  }
  if (upright) A.screen(ctx, 'upright', { t: ut });
  if (DBG.debug) A.text(ctx, fps + ' fps ' + tpf + 't/f R' + R + (mode === 'guest' ? ' D' + Math.round((vIt && vIt.D) || 0) : '') + (errors.length ? ' ERR ' + errors.length : ''), 4, 304, 8, '#fff', 'left');
}

/* ---------- the loop: fixed 60 Hz ticks, ≤ 4 per frame, ≤ 100 ms backlog; draw only when a tick ran ---------- */
let acc = 0, last = now(), manual = false, fLast = 0, fSum = 0, fN = 0, fps = 0, tpf = 0;
function safeTick() { try { tick(); } catch (e) { report(e); } }
function safeRender() { try { render(); } catch (e) { report(e); for (let i = 0; i < 16; i++) ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; } }   /* unwind any save() an art call left open */
function frame() {
  requestAnimationFrame(frame);
  const t = now();
  if (manual) { last = t; return; }
  acc = Math.min(100, acc + Math.max(0, Math.min(100, t - last))); last = t;
  let n = 0;
  while (acc >= TICK && n < 4) { safeTick(); acc -= TICK; n++; }
  if (!n) return;
  safeRender(); tpf = n;
  if (fLast) { const d = t - fLast; if (d < 250) { fSum += d; fN++; wSum += now() - t; } }
  fLast = t;
  if (fSum >= 2000) {
    const mean = fSum / fN, work = wSum / fN; fps = Math.round(1000 / mean); fSum = fN = wSum = 0;
    if (!hidden()) dynRes(mean, work);
  }
}
/* dynamic resolution, slow for 2 s: if our own work (ticks + drawing) fills half the frame, one bucket down; if not (the
   GPU, or a 30 Hz screen), TRY one down for 2 s and keep it only if frames got 15% quicker, else go back and stop trying.
   30 s of easy frames → one bucket up (twice at most). */
let probe = null, noProbe = false, cheap = 0, raises = 0, wSum = 0;
function dynRes(mean, work) {
  if (probe) { if (!(mean <= probe.mean * 0.85 || work > mean * 0.6)) { rCap = probe.cap; noProbe = true; layout(); } probe = null; cheap = 0; return; }
  const i = BUCK.indexOf(R), busy = work > mean * 0.5;
  if (mean > 20) { cheap = 0; if (i > 0 && (busy || !noProbe)) { probe = busy ? null : { cap: rCap, mean }; rCap = BUCK[i - 1]; layout(); } }
  else if (mean < 18 && work < mean * 0.3 && ++cheap >= 15 && rCap < 4 && raises < 2) { cheap = 0; raises++; rCap = BUCK[BUCK.indexOf(rCap) + 1]; layout(); }
}
document.addEventListener('visibilitychange', () => {
  const hid = hidden();
  au('hidden', hid || paused);
  if (hid && canPause()) setPause(true);
  if (mode === 'host' && hid && w && state === 'play') { if (!pumpId) pumpId = setInterval(() => { if (mode === 'host' && w && hidden()) sendSnap(); }, 500); }   /* hidden host keeps sending, p=1 */
  if (!hid) { if (pumpId) { clearInterval(pumpId); pumpId = 0; } acc = 0; last = now(); fLast = 0; }
});
let pumpId = 0;

/* ---------- autopilots. ?bot=1: dodges bullets and zap columns perfectly, juggles toward the fruit it wants, seeds now and then.
   ?bot=2 (SPEC3 4, for tuning): HUMAN-LIKE. It sees bullets 12 ticks late (as they were then, so it reacts late), misjudges
   their distance a little (a per-bullet error of up to 3 px and a smaller, varying caution radius), moves only at normal key
   speed, skips about 40% of the pickups it could take, and now and then holds still for a moment. Seeded per run. ---------- */
const B2 = {
  DELAY: 12, ring: [], rng: Math.random, hold: 0, skip: new Map(),
  reset(seed) { this.rng = BB.mulberry32(((seed | 0) ^ 0x2b2b2b) >>> 0); this.ring.length = 0; this.hold = 0; this.skip.clear(); },
  /* what the bot has seen: the bullets of DELAY ticks ago (positions + per-tick velocity) */
  see(bullets) {
    const snap = []; for (const b of bullets) if (!b.gone && !b.dead) snap.push(b.x, b.y, b.vx || 0, b.vy || 0, b.id | 0);
    this.ring.push(snap); if (this.ring.length > this.DELAY + 1) this.ring.shift();
    return this.ring.length > this.DELAY ? this.ring[0] : [];
  },
  takes(f) {   /* a stable yes/no per pickup: about 6 in 10 */
    const key = f.id * 16 + (f.k | 0); let v = this.skip.get(key);
    if (v === undefined) { if (this.skip.size > 256) this.skip.clear(); v = this.rng() < 0.6; this.skip.set(key, v); }
    return v;
  }
};
const err = (id, s) => (((Math.imul(id + s, 2654435761) >>> 0) % 7) - 3);   /* the misjudged distance for one bullet, px */
let botT = 0;
function botDrive(s, inp, bullets, enemies, fruits) {
  const H2 = DBG.bot === 2;
  botT++; inp.mx = inp.my = 0; inp.fire = curPh() < 4;
  const seen = H2 ? B2.see(bullets) : null;
  if (s.down) { inp.dx = inp.dy = 0; inp.charge = false; return; }
  const cap = s.pcap ? s.pcap() : SH.powerMax;
  const want = s.shield < Math.min(2, s.shMax || 3) ? 1 : s.buddies < 2 ? 2 : s.spread < cap ? 3 : 0;   /* pickups 5-12 are always wanted (below) */
  let gx = 120, gy = 272, tf = null, td = 1e9, boss = null;
  for (const f of fruits) { if (f.taken || f.y < 8 || f.y > 300) continue; const d = Math.abs(f.x - s.x) + Math.abs(f.y - s.y) * 0.4; if (d < td) { td = d; tf = f; } }
  for (const e of enemies) if (!e.dead && isBoss(e.type)) boss = e;
  if (tf && H2 && !B2.takes(tf)) tf = null;
  if (tf) {
    if (tf.k === want || tf.k >= 5 || (s.hp <= 2 && tf.k === 0)) {   /* grab (hearts, rainbow, starfruit, packets, bubbles too): come in from the side so our shots do not bump it on */
      const side = Math.abs(s.y - tf.y) < 12; gx = side ? tf.x : tf.x + (s.x < tf.x ? -22 : 22); gy = tf.y;
      if (gx < SH.xMin + 4) gx = tf.x + 22; else if (gx > SH.xMax - 4) gx = tf.x - 22;
    } else if (H2) tf = null;   /* bot 2 does not juggle */
    else { gx = tf.x + (tf.x < 120 ? 3 : -3); gy = clamp(tf.y + 80, 150, 300); }
  }
  if (!tf) {
    if (boss) { gx = boss.x + Math.sin(botT / 60) * 30; gy = 276; }
    else { let bd = 1e9; for (const e of enemies) { const D = BB.ENEMY[e.type]; if (!D || !D.shootable || e.dead || e.y < 0 || e.y > s.y - 30) continue; const d = Math.abs(e.x - s.x); if (d < bd) { bd = d; gx = e.x; } } }
  }
  let rx = 0, ry = 0;
  if (H2) {
    const R0 = 15 + (B2.rng() * 4 - 2);   /* how close it lets a bullet come (px), a little off each tick (bot 1: 22) */
    for (let j = 0; j < seen.length; j += 5) {
      const id = seen[j + 4], bx = seen[j] + err(id, 1), by = seen[j + 1] + err(id, 7), vx = seen[j + 2], vy = seen[j + 3];
      for (let k = 0; k <= 30; k += 5) { const dx = s.x - (bx + vx * k), dy = s.y - (by + vy * k), d2 = dx * dx + dy * dy; if (d2 < R0 * R0) { const d = Math.sqrt(d2) || 0.5, wt = (R0 - d) / R0 * (1 - k / 40); rx += dx / d * wt; ry += dy / d * wt; } }
    }
  } else for (const b of bullets) {
    if (b.gone || b.dead) continue;
    const vx = b.vx || 0, vy = b.vy || 0;
    for (let k = 0; k <= 30; k += 5) { const dx = s.x - (b.x + vx * k), dy = s.y - (b.y + vy * k), d2 = dx * dx + dy * dy; if (d2 < 484) { const d = Math.sqrt(d2) || 0.5, wt = (22 - d) / 22 * (1 - k / 40); rx += dx / d * wt; ry += dy / d * wt; } }
  }
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.type === 'zap') { if (Math.abs(e.x - s.x) < 26) { let dir = s.x >= e.x ? 1 : -1; if ((dir > 0 && s.x > 205) || (dir < 0 && s.x < 35)) dir = -dir; rx += dir * 3; } continue; }
    const D = BB.ENEMY[e.type]; if (!D || D.ground) continue;
    const dx = s.x - e.x, dy = s.y - e.y, rr = (D.r || 8) + 16;
    if (dx * dx + dy * dy < rr * rr) { const d = Math.sqrt(dx * dx + dy * dy) || 1; rx += dx / d; ry += dy / d; }
  }
  const mx = clamp((gx - s.x) / 10, -1, 1) + rx * 2.5, my = clamp((gy - s.y) / 10, -1, 1) + ry * 2.5;
  inp.dx = mx > 0.3 ? 1 : mx < -0.3 ? -1 : 0; inp.dy = my > 0.3 ? 1 : my < -0.3 ? -1 : 0;
  inp.charge = botT % (H2 ? 480 : 300) < 70;
  if (H2) {   /* now and then a human just holds still for a moment (about every 5 s, for 0.25-0.75 s) */
    if (B2.hold > 0) { B2.hold--; inp.dx = inp.dy = 0; }
    else if (B2.rng() < 1 / 300) B2.hold = 15 + (B2.rng() * 30 | 0);
  }
}

/* ---------- boot ---------- */
addEventListener('resize', layout);
layout();
setBand(A.stageColor ? A.stageColor(0) : band);
if (DBG.stage != null || DBG.t != null || DBG.boss || DBG.bot) {
  const st = clamp((DBG.stage || 1) - 1, 0, BB.STAGES.length - 1), S0 = BB.STAGES[st] || {};
  if (DBG.stage != null) best = Math.max(best, st + 1);
  if (DBG.stage != null || DBG.t != null || DBG.boss) startRun(st, DBG.boss ? (S0.bossAt || C.STAGE.bossAt) : DBG.t || 0);
}
requestAnimationFrame(frame);
window.__bb = {
  get w() { return w; }, get p1() { return p1; }, get p2() { return p2; }, get me() { return me; }, get hs() { return hs; },
  get state() { return state; }, get mode() { return mode; }, get ph() { return curPh(); }, get ut() { return ut; }, get errors() { return errors; },
  get view() { return { V, VE, VB, VI, gfx, evQ, quiet, lastP }; }, get tally() { return tallyNow; }, get hint() { return hint; }, get best() { return best; },
  IN, keys, DBG,
  step(n) { for (let i = 0; i < (n || 1); i++) safeTick(); return ut; },
  render() { safeRender(); },
  manual(on) { manual = on !== false; },
  visible(on) { forceVis = on !== false; },
  key(c, down) { if (down === false) keys[c] = 0; else { keys[c] = 1; hits.push(c); } },
  tap(x, y) { titleTap(x, y); },
  start(st, t) { mode = online ? mode : 'solo'; startRun(st | 0, t || 0); },
  join: joinP2, flyAlone: () => flyAlone(false), layout, frame, get R() { return R; }, get dyn() { return { rCap, probe, noProbe, raises }; }, get pad() { return { padMode, upright, LH, S, coarse }; },
  bot(on) { DBG.bot = on === 2 || on === '2' ? 2 : on === false || on === 0 ? 0 : 1; }, retry(on) { DBG.retry = on !== false; }, god(on) { DBG.god = on !== false; if (w) w.god = DBG.god; },
  get diff() { return diff; }, set diff(d) { diff = clamp(d | 0, 0, 2); }, get music() { return musicOn; }, get muted() { return muted; }, setMusic, setMute
};
post({ ty: 'ready' });
})();
