/* FAR FIELD — ff-main.js: the game shell for Sequences 1 and 2 (index.html; one lane, no loading). Renderer + post, quality tiers (carried over from the
   look test, with the step-down held during danger, A22), the fixed 120 Hz loop, input (keyboard + gamepad), the mode
   machine (notice -> title -> play <-> pause -> end -> title), module wiring, checkpoint restart, the parent-page protocol,
   mute/music settings, teardown and the window.__ff test handle.
   OWNER: architect / integrator. The contract every module follows is docs/farfield/INTERFACES.md.
   Keys (Josh's playtest, 7 Oct §9.1): <- -> / A D move at the cautious walk (for as long as held; it never speeds up by
   itself), Shift + a direction runs, Space / Up / W jump (Up also climbs in), Down / S crouch (deliberate; crouch-walk),
   Esc or P pause (Esc on the notice or title: back to the arcade), M sound, N music, Q quality, F frame rate, O debug
   overlay (?debug=1). Gamepad: stick or d-pad move, X / RB / RT (buttons 2, 5, 7) run, A jump, Y or d-pad up climb in,
   B or d-pad down crouch, Start pause.
   URL: ?q=high|medium|low  ?mute=1 (no audio, no storage)  ?seed=n  ?cp=<checkpoint id> (skip notice + title, start there)
        ?start=works (review Sequence 2: the notice, then the title with "Begin at the Works" chosen)
        ?clean=1 (no hints, no fps)  ?debug=1  ?rabbit=procedural|<file under models/>
   Sequence 2 (THE WORKS, SEQUENCE-2.md §10-§11): its modules join the call orders below (Works first in the fixed step, so the
   presses move before the rabbit collides; Painter after Humans in the frame, so it poses its figure; Works before World, so it
   moves the props); the save is 'ff-progress' (courtyard -> search-arrive -> rest -> works-in -> works-line -> works-out ->
   completed) with a one-time migration from Sequence 1's 'ff-s1-progress' (its "completed" becomes "works-in"); the end card
   follows Sequence 2 (FF.WorksFlow calls endCard()). */
'use strict';
(function () {
const T = THREE, U = FF.util, Q = FF.Q, L0 = FF.LOOK;
const FIX = 1 / 120;
/* module call order (docs/farfield/INTERFACES.md §3). A missing module or method is skipped; every call is isolated. */
const INIT = ['Level', 'Works', 'World', 'Player', 'Humans', 'AI', 'Painter', 'Events', 'WorksFlow', 'Camera', 'Audio', 'UI'];
const RESET = ['Level', 'Works', 'World', 'Player', 'Humans', 'AI', 'Painter', 'Events', 'WorksFlow', 'Camera', 'Audio', 'UI'];
const STEP = ['Works', 'Player', 'Level', 'AI', 'Painter', 'Events', 'WorksFlow'];
const FRAME = ['Player', 'Humans', 'AI', 'Painter', 'Events', 'Works', 'World', 'Camera', 'Audio', 'UI'];
function call(name, fn, a, b, c) {
  const m = FF[name]; if (!m || typeof m[fn] !== 'function') return undefined;
  try { return m[fn](a, b, c); } catch (e) { FF.report(e, name + '.' + fn); return undefined; }
}
async function callAsync(name, fn, a) {
  const m = FF[name]; if (!m || typeof m[fn] !== 'function') return;
  try { await m[fn](a); } catch (e) { FF.report(e, name + '.' + fn); }
}

/* ---------------------------------------------------------------- shared state (§4) */
const G = FF.G = {
  mode: 'boot', t: 0, frameT: 0, control: false, paused: false, place: 'verge', checkpoint: 'verge-start',
  rabbit: null, box: null, searcher: null, flags: {}, fade: 1, tier: 'high', debug: Q.get('debug') === '1', clean: Q.get('clean') === '1',
  muted: false, music: true,
};

/* ---------------------------------------------------------------- renderer, scene, camera, post */
const canvas = document.getElementById('c');
const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; renderer.shadowMap.autoUpdate = true;
renderer.toneMapping = T.NoToneMapping; renderer.outputEncoding = T.LinearEncoding;
renderer.info.autoReset = false;
const scene = new T.Scene(); scene.background = new T.Color(0x0b0d10);
const camera = new T.PerspectiveCamera(L0.camera.fov, 16 / 9, 0.1, 260);
camera.position.set(FF.S1.spawn.x + 2, L0.camera.height, L0.camera.dist);
const post = FF.Post(renderer);
FF.applyShading(L0);

/* ---------------------------------------------------------------- tiers (look test) + the danger hold (A22) */
const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) && Math.min(screen.width, screen.height) < 820;
let tierName = FF.TIERS[Q.get('q')] ? Q.get('q') : (coarse ? 'low' : 'high');
let tierChosen = !!FF.TIERS[Q.get('q')], slowT = 0, slowN = 0, slowS = 0;
FF.tier = FF.TIERS[tierName]; G.tier = tierName;
function setTier(name) {
  if (!FF.TIERS[name]) return;
  tierName = name; FF.tier = FF.TIERS[name]; G.tier = name;
  for (const m of INIT) call(m, 'setTier', FF.tier);
  scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m.userData && m.userData.ff) m.needsUpdate = true; } });
  resize(true);
}
/* the automatic step-down never fires while the searcher is alert, a press is coming down over the rabbit, or a scripted beat
   or an ending runs (a recompile would hitch) */
const calm = () => G.mode === 'play' && !call('AI', 'danger') && !call('Events', 'scripted') && !call('Works', 'danger') && !call('WorksFlow', 'scripted');

/* ---------------------------------------------------------------- size */
let W = 1, H = 1;
function resize(force) {
  const w = Math.max(1, canvas.clientWidth | 0), h = Math.max(1, canvas.clientHeight | 0);
  if (!force && w === W && h === H) return; W = w; H = h;
  const pr = Math.min(window.devicePixelRatio || 1, FF.tier.dpr);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  camera.aspect = w / h;
  if (FF.Camera && FF.Camera.resize) call('Camera', 'resize', w, h); else { camera.updateProjectionMatrix(); }
  post.setSize(Math.round(w * pr), Math.round(h * pr), FF.tier);
}
addEventListener('resize', () => resize());

/* ---------------------------------------------------------------- input (§6) */
const KEYMAP = { ArrowLeft: ['left'], KeyA: ['left'], ArrowRight: ['right'], KeyD: ['right'], Space: ['jump'], ArrowUp: ['up', 'jump'], KeyW: ['up', 'jump'],
  ArrowDown: ['down'], KeyS: ['down'], ShiftLeft: ['run'], ShiftRight: ['run'] };
const keys = {}, pressed = {}, bot = {}, pad = {}, latched = {}, broke = {}, resumed = {};
let lastInputT = 0, offAt = -1, latchAt = -1, heldRun = false;
const rawDown = a => !!(keys[a] || bot[a] || pad[a]);
/* THE LATCH (the door reveal, Josh 7 Oct §9.5: "holding forward must not carry him beyond it"; v2 review fixes): when a
   takeover gives control back, every listed action HELD WITHOUT A BREAK since control went off counts as not held until it
   is let go and pressed again. A key let go or pressed afresh while control was off (broke[a]: a keyup, a keydown that is
   not an auto-repeat, a pad edge, a bot hold change) is the player's new intention: it is not latched, it acts at once. A
   held key on a real keyboard auto-repeats keydown without ever releasing (that is no new press), so clearing the input
   would not do. A fresh press after control is back ends the latch at once, even when the release and the press fall inside
   one fixed step; a release seen at the end of a step ends it too.
   And so a held key never looks broken (a child holding → through the reveal): a DIRECTION still held LATCH_RESUME s after
   control came back resumes as the cautious walk (resumed[a]), well after the camera has settled and still inside the
   reveal's grace. A latched jump never fires by itself.
   THE RUN AFTER IT (review, 7 Oct night: a child holding → through the reveal then pressing Shift + → only walked, and was
   caught): only a run (Shift, the pad's run button, a bot's run) that was ALREADY held when control came back, and is still
   that same unbroken hold, is held back while a resumed direction walks on (heldRun), so Shift + → held through the takeover
   never bolts the rabbit off. It ends at once with any Shift press or release after control is back (a keydown that is not
   an auto-repeat, a keyup, a pad edge, a bot hold change), and in any case when the takeover's grace ends (graceEnd(), from
   FF.Events): Shift always runs once the searcher can see the rabbit again. A Shift pressed after control is back runs as
   soon as the direction it goes with acts. */
const LATCH_RESUME = 0.8, DIRS = { left: 1, right: 1 };
const fresh = a => { if (latched[a] && pressed[a]) latched[a] = false; };
/* a release or a fresh press: while control is off it marks the action broken (not latched); once control is back, a run
   edge ends the hold-back of a run held through the takeover */
const edge = a => { if (!G.control) broke[a] = true; else if (a === 'run') heldRun = false; };
const resumeCheck = a => { if (latched[a] && DIRS[a] && latchAt >= 0 && G.t - latchAt >= LATCH_RESUME && rawDown(a)) { latched[a] = false; resumed[a] = true; } };
FF.Input = {
  /* held now (keyboard, gamepad or a bot hold), unless latched; 'run' is not held while it is the run held through a
     takeover (heldRun) and a resumed direction walks on */
  down: a => { fresh(a); resumeCheck(a); if (a === 'run' && heldRun && (resumed.left || resumed.right)) return false; return !latched[a] && rawDown(a); },
  /* held now, ignoring the latch (tests, and the latch itself) */
  raw: rawDown,
  /* consume an edge press made since the last fixed step (presses are dropped after every step: modules buffer if they want) */
  took: a => { fresh(a); const p = !!pressed[a]; pressed[a] = false; return p && !latched[a]; },
  peek: a => { fresh(a); return !latched[a] && !!pressed[a]; },
  axis: () => (FF.Input.down('right') ? 1 : 0) - (FF.Input.down('left') ? 1 : 0),
  /* control is going off (a takeover): from now on a release or a fresh press of an action marks it as broken */
  off() { offAt = G.t; for (const k in broke) broke[k] = false; },
  /* latch every action in `list` held now without a break since off(); returns the ones latched. A run held now is the
     run held through the takeover (heldRun) until it is pressed or let go again, or the grace ends */
  latch(list) { const out = []; latchAt = G.t; heldRun = rawDown('run'); for (const a of list) if (rawDown(a) && !broke[a]) { latched[a] = true; out.push(a); } for (const k in broke) broke[k] = false; return out; },
  unlatch() { for (const k in latched) latched[k] = false; for (const k in resumed) resumed[k] = false; latchAt = -1; heldRun = false; },
  /* the takeover's grace is over (FF.Events): a run held through it is no longer held back */
  graceEnd() { heldRun = false; },
  get latched() { return Object.keys(latched).filter(k => latched[k]); },
  get resumed() { return Object.keys(resumed).filter(k => resumed[k]); },
  get heldRun() { return heldRun; },
  /* a restart, pause or resume drops every held key (a real keyboard sends no new keydown for a key already down), EXCEPT
     Shift ('run'): a held modifier never repeats on macOS, so dropping it made a player still holding Shift only walk, just as
     they tried to escape. Shift's state is also re-read from every key event's modifier (keydown / keyup below). */
  clear() { for (const k in keys) if (k !== 'run') keys[k] = false; for (const k in pressed) pressed[k] = false; for (const k in pad) pad[k] = false; for (const k in latched) latched[k] = false; for (const k in resumed) resumed[k] = false; heldRun = false; },
  endStep() { for (const k in pressed) pressed[k] = false; for (const k in latched) if (latched[k] && !rawDown(k)) latched[k] = false; for (const k in resumed) if (resumed[k] && !rawDown(k)) resumed[k] = false; if (heldRun && !rawDown('run')) heldRun = false; },
  get lastInputT() { return lastInputT; },
  /* bot hooks (also on __ff). Game.control(false) releases bot holds (sysRel): a plan that holds the same key again right
     after is the same unbroken hold, not a new press */
  hold(a, on) { const v = on !== false; if (!!bot[a] !== v && !(v && sysRel[a])) edge(a); if (v) sysRel[a] = false; bot[a] = v; if (v) lastInputT = G.t; },
  press(a) { pressed[a] = true; if (!sysRel[a]) edge(a); lastInputT = G.t; },
  release() { for (const k in bot) { if (bot[k]) sysRel[k] = true; bot[k] = false; } },
  edge,
};
const sysRel = {};
function pollPad() {
  for (const k in pad) pad[k] = false;
  if (!navigator.getGamepads || !document.hasFocus()) return;
  let gp = null; try { for (const p of navigator.getGamepads()) if (p && p.connected) { gp = p; break; } } catch (_) { return; }
  if (!gp) return;
  const b = i => !!(gp.buttons[i] && gp.buttons[i].pressed), ax = gp.axes[0] || 0;
  const was = Object.assign({}, padPrev);
  pad.left = ax < -0.35 || b(14); pad.right = ax > 0.35 || b(15); pad.jump = b(0) || b(3) || b(12); pad.up = b(3) || b(12); pad.down = b(1) || b(13);
  pad.run = b(2) || b(5) || b(7);           // X, RB or RT + a direction runs (a tilted stick alone is the cautious walk, like an arrow)
  for (const k of ['jump', 'up', 'down', 'left', 'right', 'run']) if (!!pad[k] !== !!was[k]) edge(k);    // a release or a press while control is off
  for (const k of ['jump', 'up', 'down', 'left', 'right', 'run']) if (pad[k] && !was[k]) { pressed[k] = true; lastInputT = G.t; if (G.mode !== 'play' && k !== 'run') onCommandKey(k === 'jump' ? 'Enter' : k === 'left' ? 'ArrowLeft' : k === 'right' ? 'ArrowRight' : k === 'up' ? 'ArrowUp' : 'ArrowDown'); }
  if (b(9) && !padPrev.start) onCommandKey('Escape');
  Object.assign(padPrev, pad); padPrev.start = b(9);
}
const padPrev = {};

/* ---------------------------------------------------------------- the mode machine (§3) */
/* progress saves (SEQUENCE-2.md §10): one key for both sequences; an old Sequence 1 save is migrated once */
const J = FF.S2 && FF.S2.join && FF.S2.join.saves;
const SAVE = J ? { key: J.key, order: J.order, from: J.migrate.from, map: J.migrate.map } : { key: 'ff-s1-progress', order: ['courtyard', 'search-arrive', 'rest', 'completed'], from: null, map: {} };
const START_WORKS = Q.get('start') === 'works' && !!(FF.S2 && FF.S2.join && FF.S1.checkpoints.some(c => c.id === FF.S2.join.start.checkpoint));
const setMode = m => { if (m === G.mode) return; const from = G.mode; G.mode = m; FF.Input.clear(); FF.bus.emit('mode', { from, to: m }); };
let fadeTo = null; /* { from, to, t, dur, resolve } */
const Game = FF.Game = {
  get mode() { return G.mode; },
  /* checkpoint object by id ({x,y} objects pass through) */
  cp(c) { if (!c) return FF.S1.checkpoints[0]; if (typeof c === 'object') return Object.assign({ id: c.id || 'warp', y: 0, face: 1 }, c); return FF.S1.checkpoints.find(k => k.id === c) || null; },
  /* put every module at checkpoint cp (§9). opts: { reason: 'fail'|'warp'|'continue'|'title'|'start', first } */
  restart(c, opts) {
    const cp = Game.cp(c); if (!cp) { FF.report(new Error('no checkpoint ' + c), 'Game.restart'); return null; }
    opts = Object.assign({ reason: 'warp' }, opts || {});
    G.checkpoint = cp.id;
    for (const m of RESET) call(m, 'reset', cp, opts);
    FF.Input.clear(); acc = 0;
    FF.bus.emit('restart', { cp: cp.id, reason: opts.reason });
    return cp;
  },
  /* the cut to black: the very next drawn frame is black (post's final pass), no DOM latency */
  cut() { fadeTo = null; G.fade = 1; },
  /* animate the fade (0 = picture, 1 = black) over dur seconds of presentation time */
  fade(to, dur) { return new Promise(res => { if (fadeTo && fadeTo.resolve) fadeTo.resolve(); if (!(dur > 0)) { G.fade = to; fadeTo = null; res(); return; } fadeTo = { from: G.fade, to, t: 0, dur, resolve: res }; }); },
  control(on) { G.control = !!on; if (!on) FF.Input.release(); },
  pause() { if (G.mode !== 'play') return; setMode('pause'); call('UI', 'showPause'); call('Audio', 'hidden', true); },
  resume() { if (G.mode !== 'pause') return; call('UI', 'hidePause'); call('Audio', 'hidden', false); setMode('play'); },
  /* notice -> title: the live Verge with the rabbit grooming beneath its shelter (A5) */
  toTitle() {
    call('UI', 'hideNotice'); call('UI', 'hidePause');
    Game.restart(FF.S1.checkpoints[0], { reason: 'title' });
    Game.control(false); setMode('title');
    call('Camera', 'shot', 'title');
    call('UI', 'showTitle', { save: Game.loadSave(), order: SAVE.order, works: FF.S2 && FF.S2.join ? FF.S2.join.start : null, startWorks: START_WORKS });
    Game.fade(0, G.fade > 0.5 ? 1.5 : 0);
  },
  /* title -> play (optionally continuing from a saved checkpoint) */
  play(cpId) {
    call('UI', 'hideTitle'); call('UI', 'hideNotice');
    if (cpId && cpId !== FF.S1.checkpoints[0].id) { Game.restart(cpId, { reason: 'continue' }); Game.fade(0, 0.8); call('Camera', 'snap'); }
    else call('Camera', 'toPlay', (FF.S1.camera.zones.find(z => z.id === 'title') || {}).toPlay || 2.5);
    setMode('play'); Game.control(true);
    FF.bus.emit('play:start', { cp: G.checkpoint });
  },
  /* the end (FF.WorksFlow calls this at the end of Sequence 2, after either ending's fade): the card, then the title */
  async endCard() { setMode('end'); Game.control(false); G.fade = 1; await Promise.resolve(call('UI', 'endCard')); Game.save('completed'); Game.toTitle(); },
  exit() { postParent({ ty: 'exit' }); },
  send: o => postParent(o),            /* a message to the parent page (the arcade room) */
  /* progress save: the furthest of courtyard, search-arrive, rest, works-in, works-line, works-out, completed (localStorage
     'ff-progress'; nothing with ?mute=1). An old 'ff-s1-progress' is read once and carried over ("completed" -> "works-in":
     Josh's finished Sequence 1 becomes "Continue from the Works") */
  save(id) { const cur = Game.loadSave(); if (SAVE.order.indexOf(id) > SAVE.order.indexOf(cur)) FF.store.set(SAVE.key, id); },
  loadSave() {
    let v = FF.store.get(SAVE.key);
    if (v == null && SAVE.from) { const old = FF.store.get(SAVE.from); if (old) { v = SAVE.map[old] || old; if (SAVE.order.indexOf(v) < 0) v = null; if (v) FF.store.set(SAVE.key, v); } }
    return v || null;
  },
  setTier, get tier() { return tierName; },
  setMute(on, quiet) { G.muted = !!on; call('Audio', 'mute', G.muted); FF.store.set('ff-mute', G.muted ? 1 : 0); if (!quiet) postParent({ ty: 'mute', on: G.muted }); FF.bus.emit('mute', { on: G.muted }); },
  setMusic(on, quiet) { G.music = !!on; call('Audio', 'music', G.music); FF.store.set('ff-music', G.music ? 1 : 0); if (!quiet) postParent({ ty: 'music', on: G.music }); FF.bus.emit('music', { on: G.music }); },
  scene, renderer, camera, postFX: post,
};

/* commands from keys or the UI (§3): the UI's key() may return one of these strings */
function command(cmd, arg) {
  switch (cmd) {
    case 'continue': call('Audio', 'unlock'); Game.toTitle(); break;          // the notice's Continue (a user gesture: unlocks audio)
    case 'start': call('Audio', 'unlock'); Game.play(arg); break;
    case 'pause': Game.pause(); break;
    case 'resume': Game.resume(); break;
    case 'restart': Game.resume(); Game.cut(); Game.restart(G.checkpoint, { reason: 'restart' }); Game.fade(0, 0.45); break;
    case 'exit': Game.exit(); break;
    case 'title': Game.toTitle(); break;
  }
}
FF.Game.command = command;
function onCommandKey(code) {
  const r = call('UI', 'key', code, G.mode);
  if (typeof r === 'string') { const [c, a] = r.split(':'); command(c, a); return true; }
  if (r === true) return true;
  if (G.mode === 'notice') { if (code === 'Enter' || code === 'Space') { command('continue'); return true; } if (code === 'Escape') { command('exit'); return true; } }
  else if (G.mode === 'title') { if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Enter', 'Space'].includes(code)) { command('start'); return true; } if (code === 'Escape') { command('exit'); return true; } }
  else if (G.mode === 'play') { if (code === 'Escape' || code === 'KeyP') { command('pause'); return true; } }
  else if (G.mode === 'pause') { if (code === 'Escape' || code === 'KeyP' || code === 'Enter') { command('resume'); return true; } }
  return false;
}
addEventListener('keydown', e => {
  const shift = e.code === 'ShiftLeft' || e.code === 'ShiftRight', runWas = keys.run;
  keys.run = !!e.shiftKey || shift;   // Shift is read from every key event's modifier (a held modifier never repeats)
  if (keys.run !== runWas || (shift && !e.repeat)) edge('run');      // Shift pressed afresh (or found let go): a new intention
  if (e.code === 'KeyQ') { tierChosen = true; setTier(FF.TIER_ORDER[(FF.TIER_ORDER.indexOf(tierName) + 1) % 3]); return; }
  if (e.code === 'KeyF') { fpsEl.hidden = !fpsEl.hidden; return; }
  if (e.code === 'KeyM') { Game.setMute(!G.muted); return; }
  if (e.code === 'KeyN') { Game.setMusic(!G.music); return; }
  if (e.code === 'KeyO' && G.debug) { call('World', 'overlay'); FF.bus.emit('debug:overlay', {}); return; }
  const acts = KEYMAP[e.code];
  if (G.mode !== 'play' || e.code === 'Escape' || e.code === 'KeyP') {
    const was = G.mode, used = onCommandKey(e.code);
    if (used) e.preventDefault();
    /* "the first movement begins play" (§16): an arrow that started play also moves the rabbit at once; Space/Enter do not jump */
    const carry = was === 'title' && G.mode === 'play' && acts && (acts[0] === 'left' || acts[0] === 'right');
    if (!carry) return;
    if (e.shiftKey) keys.run = true;          // Shift held down on the title (its keydown was a title key): Shift + → runs at once
  }
  if (!acts) return; e.preventDefault();
  for (const a of acts) { if (!keys[a]) { pressed[a] = true; if (!e.repeat) edge(a); } keys[a] = true; }
  lastInputT = G.t;
});
addEventListener('keyup', e => { const acts = KEYMAP[e.code]; if (acts) for (const a of acts) { if (keys[a]) edge(a); keys[a] = false; } keys.run = !!e.shiftKey; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G.mode === 'play') Game.pause(); call('Audio', 'hidden', true); } else if (G.mode !== 'pause') call('Audio', 'hidden', false); });

/* ---------------------------------------------------------------- the parent page (the arcade room, §11) */
function postParent(o) { try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} }
addEventListener('message', e => {
  if (e.source !== parent || parent === window || e.origin !== location.origin) return;
  const d = e.data; if (!d || typeof d !== 'object') return;
  if (d.ty === 'mute') Game.setMute(!!d.on, true);
  else if (d.ty === 'music') Game.setMusic(!!d.on, true);
  else if (d.ty === 'leave') teardown();
});

/* ---------------------------------------------------------------- the loop: fixed 1/120 s steps, presentation per frame */
let acc = 0, last = performance.now(), loopPaused = false, frozen = false, time = 0, alive = true, booted = false;
const ft = new Float32Array(90); let fti = 0, fpsShown = 0;
const fpsEl = document.getElementById('fps');
const stepping = () => booted && (G.mode === 'notice' || G.mode === 'title' || G.mode === 'play');
function stepOnce() {
  G.t += FIX;
  for (const m of STEP) call(m, 'step', FIX);
  FF.Input.endStep();
}
function present(dt) {
  if (fadeTo) { fadeTo.t += dt; const k = U.clamp(fadeTo.t / fadeTo.dur, 0, 1); G.fade = U.lerp(fadeTo.from, fadeTo.to, k); if (k >= 1) { const r = fadeTo.resolve; fadeTo = null; if (r) r(); } }
  G.frameT += dt;
  for (const m of FRAME) call(m, 'frame', dt);
}
function draw() {
  resize(); renderer.info.reset(); FF.U.uFFTime.value = time;
  const look = (FF.World && FF.World.look) || L0;
  post.render(scene, camera, look, FF.tier, time, G.fade);
}
function frame(now) {
  if (!alive) return;
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  ft[fti++ % ft.length] = dt;
  if (!tierChosen && !loopPaused && now > 4000 && calm()) { slowS += dt; slowN++; slowT += dt; if (slowT > 2) { if (slowS / slowN > 0.021 && tierName !== 'low') setTier(FF.TIER_ORDER[FF.TIER_ORDER.indexOf(tierName) + 1]); slowT = slowS = 0; slowN = 0; } }
  else { slowT = slowS = 0; slowN = 0; }
  pollPad();
  if (!loopPaused) {
    if (stepping()) { acc += dt; let n = 0; while (acc >= FIX && n++ < 24) { stepOnce(); acc -= FIX; } if (acc > FIX) acc = 0; }
    if (G.mode !== 'pause') { present(dt); if (!frozen) time += dt; }
  }
  draw();
  if (!fpsEl.hidden && now - fpsShown > 250) { fpsShown = now; const s = stats(); fpsEl.textContent = `${s.fps.toFixed(0)} fps · ${s.ms.toFixed(1)} ms · ${tierName} · ${s.calls} draws · ${(s.tris / 1000).toFixed(0)}k tris · ${s.w}x${s.h} · ${G.mode} · x ${G.rabbit ? G.rabbit.x.toFixed(1) : '-'}`; }
}
function stats() {
  let s = 0, n = 0; for (let i = 0; i < ft.length; i++) if (ft[i] > 0) { s += ft[i]; n++; }
  const ms = n ? s / n * 1000 : 0; const ri = renderer.info.render;
  return { fps: ms ? 1000 / ms : 0, ms, calls: ri.calls, tris: ri.triangles, w: renderer.domElement.width, h: renderer.domElement.height, tier: tierName };
}

/* ---------------------------------------------------------------- boot */
async function loadManifest() {
  try { const r = await fetch('models/models.json', { cache: 'no-cache' }); if (r.ok) { const j = await r.json(); for (const k in FF.MODELS) if (typeof j[k] === 'string' && j[k]) FF.MODELS[k] = j[k]; } } catch (_) {}
}
async function boot() {
  G.muted = FF.SILENT || FF.store.get('ff-mute') === '1'; G.music = FF.store.get('ff-music') !== '0';
  await loadManifest();
  const ctx = { THREE: T, scene, renderer, camera, post, G, bus: FF.bus, rules: FF.RULES, level: FF.S1, look: L0, tier: FF.tier, Q, silent: FF.SILENT };
  FF.ctx = ctx;
  for (const m of INIT) await callAsync(m, 'init', ctx);
  call('Audio', 'mute', G.muted); call('Audio', 'music', G.music);
  setTier(tierName);
  Game.restart(FF.S1.checkpoints[0], { reason: 'title', first: true });
  Game.control(false);
  for (let i = 0; i < 2; i++) { stepOnce(); present(FIX); }
  try { renderer.compile(scene, camera); } catch (e) { FF.report(e, 'compile'); }   /* warm the start tier behind the notice */
  booted = true;
  const cpQ = Q.get('cp');
  if (cpQ && Game.cp(cpQ)) { G.mode = 'title'; Game.restart(cpQ, { reason: 'warp' }); call('Camera', 'snap'); setMode('play'); Game.control(true); G.fade = 0; }
  else { setMode('notice'); call('Camera', 'shot', 'title'); call('UI', 'showNotice'); G.fade = 0; }
  present(0); draw();
  requestAnimationFrame(t => { last = t; frame(t); });
  window.__ff.ready = true;
  postParent({ ty: 'ready' });
}

/* ---------------------------------------------------------------- teardown: free the GPU the moment the page goes away */
function teardown() {
  if (!alive) return; alive = false;
  for (const m of INIT) call(m, 'dispose');
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } } if (o.isLight && o.shadow && o.shadow.map) o.shadow.map.dispose(); });
  post.dispose(); renderer.dispose();
  try { const ext = renderer.getContext().getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (_) {}
  FF.bus.clear();
}
addEventListener('pagehide', teardown);
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); if (!alive) return; call('UI', 'message', 'The picture was lost. Click to continue.', () => location.reload()); }, false);

/* ---------------------------------------------------------------- test handle (§10) */
/* test stepping: one fixed step; presentation every second step with the exact time that passed (so frame-driven timers
   run at the same rate as the simulation however a test chunks its steps) */
let tpend = 0;
function tstep() { if (stepping()) stepOnce(); if (++tpend >= 2) flush(); }
function flush() { if (!tpend) return; const dt = FIX * tpend; tpend = 0; present(dt); if (!frozen) time += dt; }
const lite = () => ({ t: +G.t.toFixed(3), mode: G.mode, place: G.place, cp: G.checkpoint, control: G.control, fade: +G.fade.toFixed(3),
  rabbit: G.rabbit ? { x: +G.rabbit.x.toFixed(3), y: +G.rabbit.y.toFixed(3), vx: +(G.rabbit.vx || 0).toFixed(3), face: G.rabbit.face, grounded: !!G.rabbit.grounded, crouch: !!G.rabbit.crouch, mode: G.rabbit.mode, mood: G.rabbit.mood } : null,
  box: G.box ? { x: +G.box.x.toFixed(3) } : null,
  searcher: G.searcher ? { x: +(G.searcher.x || 0).toFixed(2), state: G.searcher.state, loopT: G.searcher.loopT != null ? +G.searcher.loopT.toFixed(2) : null, s: G.searcher.s != null ? +G.searcher.s.toFixed(3) : null } : null });
window.__ff = {
  ready: false, G, look: L0, rules: FF.RULES, level: FF.S1, renderer, scene, camera, three: T, bus: FF.bus,
  get tier() { return tierName; }, setTier, stats,
  apply() { FF.applyShading((FF.World && FF.World.look) || L0); call('World', 'apply'); call('Camera', 'project'); },
  pause(on) { loopPaused = on !== false; }, freeze(on) { frozen = on !== false; },
  /* advance n fixed steps (1/120 s each; presentation every 2 steps) and draw once */
  step(n, render) { n = n || 1; for (let i = 0; i < n; i++) tstep(); if (render !== false) { flush(); draw(); } return lite(); },
  draw, tick: tstep, flush,
  hold: (a, on) => FF.Input.hold(a, on), press: a => FF.Input.press(a), release: () => FF.Input.release(),
  /* run n steps; plan(state, i) returns { left, right, jump, up, down, run } holds (true/false) before each step (a plan
     holding through the door reveal stays latched, as a held key does) */
  run(n, plan, every) {
    const log = []; every = every || 60;
    for (let i = 0; i < n; i++) {
      const s = lite(); if (plan) { const want = plan(s, i) || {}; for (const a of ['left', 'right', 'up', 'down', 'jump', 'run']) { const on = !!want[a]; if (on && !FF.Input.raw(a)) FF.Input.press(a); FF.Input.hold(a, on); } }
      tstep();
      if (i % every === 0) log.push(s);
    }
    flush(); draw(); return log;
  },
  until(pred, max, plan) { for (let i = 0; i < (max || 12000); i++) { const s = lite(); if (pred(s)) { draw(); return { ok: true, steps: i, state: s }; } this.run(1, plan ? (st) => plan(st, i) : null); } draw(); return { ok: false, steps: max, state: lite() }; },
  /* jump straight into play at a checkpoint id (or {x, y, face}) */
  warp(c) { call('UI', 'hideNotice'); call('UI', 'hideTitle'); call('UI', 'hidePause'); if (G.mode !== 'play') { G.mode = 'play'; FF.bus.emit('mode', { from: 'warp', to: 'play' }); } const cp = Game.restart(c, { reason: 'warp' }); call('Camera', 'snap'); Game.control(true); G.fade = 0; fadeTo = null; draw(); return cp ? cp.id : null; },
  start() { command('continue'); command('start'); return lite(); },
  command, state() {
    return Object.assign(lite(), { tier: tierName, errors: FF.errors.slice(),
      modules: Object.fromEntries(INIT.map(m => [m, FF[m] ? (FF[m].stub ? 'stub' : 'live') : 'missing'])),
      player: call('Player', 'debug'), ai: call('AI', 'debug'), events: call('Events', 'debug'), camera: call('Camera', 'debug'), world: call('World', 'debug'), audio: call('Audio', 'debug'), ui: call('UI', 'debug'),
      works: call('Works', 'debug'), painter: call('Painter', 'debug'), flow: call('WorksFlow', 'debug'),
      bus: FF.bus.log.slice(-20) });
  },
  get ai() { return call('AI', 'debug'); },
  get works() { return call('Works', 'debug'); }, get painter() { return call('Painter', 'debug'); },
  seed: n => FF.seed(n), fire: (name, data) => FF.bus.emit(name, data),
  teardown, Game,
};
boot().catch(e => { FF.report(e, 'boot'); try { call('UI', 'message', 'Could not start: ' + e.message); } catch (_) {} });
})();
