/* FAR FIELD — ff-main.js: renderer, camera, the rabbit's movement on the 2D lane, the crate, input, the loop.
   Keys: Left/Right or A/D move (hold to break into a run, Shift to keep to a walk), Space/Up/W jump, Down/S crouch,
   Up/W in front of the low opening goes through it, Q cycles quality (high/medium/low), F shows frame rate, H help.
   URL: ?q=high|medium|low  ?rabbit=procedural|<file under models/>  ?clean=1 (no help text)  ?mute=1 (no audio exists yet)
   Test handle: window.__ff (pause, step, hold/press keys, teleport, tier, stats). */
'use strict';
(function () {
const T = THREE, L = FF.LOOK, LV = FF.LEVEL, MV = LV.move;
const Q = new URLSearchParams(location.search);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const approach = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);

const canvas = document.getElementById('c');
const renderer = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; renderer.shadowMap.autoUpdate = true;
renderer.toneMapping = T.NoToneMapping; renderer.outputEncoding = T.LinearEncoding;
const scene = new T.Scene(); scene.background = new T.Color(0x0b0d10);
const camera = new T.PerspectiveCamera(L.camera.fov, 16 / 9, 0.1, 220);
const post = FF.Post(renderer);

FF.applyShading(L);
const world = FF.buildScene(scene, L);
world.apply(L);

/* ---------------------------------------------------------------- tiers */
const coarse = matchMedia && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
let tierName = FF.TIERS[Q.get('q')] ? Q.get('q') : (coarse ? 'low' : 'high');
FF.tier = FF.TIERS[tierName];
function setTier(name) {
  tierName = name; FF.tier = FF.TIERS[name];
  world.setTier(FF.tier);
  scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (m.userData && m.userData.ff) m.needsUpdate = true; } });
  resize(true);
  hudTier();
}

/* ---------------------------------------------------------------- camera with lens shift (eye level low in frame) */
function project() {
  camera.fov = L.camera.fov; camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[9] = 2 * L.camera.horizon - 1;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}
let W = 1, H = 1;
function resize(force) {
  const w = Math.max(1, canvas.clientWidth | 0), h = Math.max(1, canvas.clientHeight | 0);
  if (!force && w === W && h === H) return; W = w; H = h;
  const pr = Math.min(window.devicePixelRatio || 1, FF.tier.dpr);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  camera.aspect = w / h; project();
  post.setSize(Math.round(w * pr), Math.round(h * pr), FF.tier);
}
addEventListener('resize', () => resize());

/* ---------------------------------------------------------------- the rabbit + level state */
const S = {
  x: LV.spawn.x, y: 0, vx: 0, vy: 0, z: 0, grounded: true, face: LV.spawn.face, coyote: 0, buf: 0, crouch: false, push: false, effort: 0,
  holdT: 0, holdDir: 0, airT: 0, landed: false, cut: false, yaw: Math.PI / 2 * LV.spawn.face, mode: 'play', modeT: 0, onCrate: false,
};
const crate = { x: LV.crate.x, vx: 0, w: LV.crate.w, h: LV.crate.h };
let rig = null;
const camS = { x: LV.spawn.x + L.camera.lookAhead * LV.spawn.face, y: 0, lead: LV.spawn.face };

/* ---------------------------------------------------------------- input */
const keys = {}, pressed = {}, hold = {};
const MAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ShiftLeft: 'walk', ShiftRight: 'walk' };
addEventListener('keydown', e => {
  if (e.code === 'KeyQ') { setTier(FF.TIER_ORDER[(FF.TIER_ORDER.indexOf(tierName) + 1) % 3]); return; }
  if (e.code === 'KeyF') { fpsEl.hidden = !fpsEl.hidden; return; }
  if (e.code === 'KeyH') { showHelp(); return; }
  if (e.code === 'Escape') { if (parent !== window) try { parent.postMessage({ ty: 'exit' }, location.origin); } catch (_) {} return; }
  const k = MAP[e.code]; if (!k) return; e.preventDefault(); if (!keys[k]) pressed[k] = true; keys[k] = true;
});
addEventListener('keyup', e => { const k = MAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const down = k => !!(keys[k] || hold[k]);
const took = k => { const p = !!pressed[k]; pressed[k] = false; return p; };

/* ---------------------------------------------------------------- collision (data only: LV.solids + the crate) */
const RB = LV.rabbit;
function rabbitH() { return S.crouch ? RB.hCrouch : RB.h; }
function hitsStatic(x0, x1, y0, y1) { for (const s of LV.solids) if (x1 > s.x0 && x0 < s.x1 && y1 > s.y0 && y0 < s.y1) return s; return null; }
function crateBox() { return { x0: crate.x - crate.w / 2, x1: crate.x + crate.w / 2, y0: 0, y1: crate.h }; }
const ov = (a, b) => a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;
const nearOpening = () => S.grounded && !S.onCrate && Math.abs(S.x - L.opening.x) < 0.2;

function step(dt) {
  S.landed = false;
  const dir = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
  if (S.mode !== 'play') { stepScripted(dt); return; }
  if (took('up') && nearOpening()) { S.mode = 'enter'; S.modeT = 0; S.vx = 0; took('jump'); return; }
  const jp = took('jump') || pressed.up && (pressed.up = false, true);

  /* crouch: only on the ground; stays crouched while something is overhead */
  const wantC = down('down') && S.grounded;
  if (wantC) S.crouch = true; else if (S.crouch && !hitsStatic(S.x - RB.hw, S.x + RB.hw, S.y, S.y + RB.h)) S.crouch = false;

  /* horizontal speed: taps hop, holding opens into a run, Shift holds a walk */
  if (dir !== S.holdDir) { S.holdDir = dir; S.holdT = 0; } else if (dir) S.holdT += dt;
  let top = MV.walk + (MV.run - MV.walk) * clamp((S.holdT - MV.runAfter) / 0.55, 0, 1);
  if (down('walk')) top = MV.walk; if (S.crouch) top = MV.crouch;
  const tgt = dir * top;
  let a = !S.grounded ? MV.airAccel : dir === 0 ? MV.decel : (S.vx * dir < -0.05 ? MV.turn : (Math.abs(S.vx) > top ? MV.decel : MV.accel));
  S.vx = approach(S.vx, tgt, a * dt);
  if (dir) S.face = dir;

  /* the crate slides only when pushed; friction stops it */
  const pushing = S.push && dir === Math.sign(crate.x - S.x) && S.grounded;
  if (!pushing) crate.vx = approach(crate.vx, 0, MV.crateFriction * dt);
  if (crate.vx) {
    const nx = crate.x + crate.vx * dt, s = hitsStatic(nx - crate.w / 2, nx + crate.w / 2, 0.001, crate.h);
    if (s) { crate.x = crate.vx > 0 ? s.x0 - crate.w / 2 - 1e-4 : s.x1 + crate.w / 2 + 1e-4; crate.vx = 0; } else crate.x = nx;
    if (S.onCrate) S.x += crate.vx * dt;
  }

  /* move x, collide with the static world and the crate's sides */
  S.push = false;
  let nx = S.x + S.vx * dt; const h = rabbitH();
  const box = { x0: nx - RB.hw, x1: nx + RB.hw, y0: S.y + 0.001, y1: S.y + h };
  const s = hitsStatic(box.x0, box.x1, box.y0, box.y1);
  if (s) { nx = S.vx > 0 ? s.x0 - RB.hw - 1e-4 : s.x1 + RB.hw + 1e-4; S.vx = 0; }
  const cb = crateBox(); box.x0 = nx - RB.hw; box.x1 = nx + RB.hw;
  if (ov(box, cb)) {
    const side = S.x < crate.x ? -1 : 1;
    nx = side < 0 ? cb.x0 - RB.hw - 1e-4 : cb.x1 + RB.hw + 1e-4;
    if (S.grounded && dir === -side && !S.crouch) {
      S.push = true;
      crate.vx = approach(crate.vx, dir * MV.push, MV.crateAccel * dt);
      S.vx = crate.vx;
    } else S.vx = 0;
  }
  S.x = nx;
  S.effort = approach(S.effort, S.push ? (Math.abs(crate.vx) < 0.15 ? 1 : 0.5) : 0, 4 * dt);

  /* jump: buffered presses, coyote time, a cut when released early */
  if (jp) S.buf = MV.buffer; else S.buf = Math.max(0, S.buf - dt);
  S.coyote = S.grounded ? MV.coyote : Math.max(0, S.coyote - dt);
  if (S.buf > 0 && S.coyote > 0 && !S.crouch) {
    S.vy = Math.sqrt(2 * MV.gravity * MV.jumpHeight); S.grounded = false; S.coyote = 0; S.buf = 0; S.airT = 0; S.cut = false; S.onCrate = false;
  }
  if (!S.grounded && S.vy > 0 && !down('jump') && !down('up') && !S.cut) { S.vy *= MV.jumpCut; S.cut = true; }

  /* move y: land on the floor or the crate's lid, bump heads */
  S.vy -= MV.gravity * (S.vy < 0 ? MV.fallGravity : 1) * dt;
  let ny = S.y + S.vy * dt; const wasG = S.grounded; S.grounded = false; S.onCrate = false;
  const vb = { x0: S.x - RB.hw + 0.002, x1: S.x + RB.hw - 0.002, y0: ny, y1: ny + h };
  const sv = hitsStatic(vb.x0, vb.x1, vb.y0, vb.y1);
  if (sv) { if (S.vy <= 0) { ny = sv.y1; S.grounded = true; } else ny = sv.y0 - h - 1e-4; S.vy = 0; }
  const cbv = crateBox(); vb.y0 = ny; vb.y1 = ny + h;
  if (ov(vb, cbv)) { if (S.vy <= 0 && S.y >= cbv.y1 - 0.02) { ny = cbv.y1; S.grounded = true; S.onCrate = true; S.vy = 0; } }
  S.y = ny;
  if (S.grounded && !wasG) S.landed = true;
  if (!S.grounded) S.airT += dt;
}

/* going through the low opening: turn to it, creep in, fade, come back to the start */
function stepScripted(dt) {
  S.modeT += dt; const t = S.modeT, O = L.opening;
  if (S.mode === 'enter') {
    S.crouch = t > 0.25; S.x += (O.x - S.x) * Math.min(1, dt * 6);
    if (t > 0.25) S.z = Math.max(-1.05, S.z - dt * 0.75);
    fade(clamp((t - 1.05) / 0.8, 0, 1));
    if (t > 2.2) { S.mode = 'back'; S.modeT = 0; reset(); note('Beyond the opening comes next.'); }
  } else if (S.mode === 'back') { fade(1 - clamp((t - 0.5) / 0.9, 0, 1)); if (t > 1.4) S.mode = 'play'; }
}
function reset() {
  Object.assign(S, { x: LV.spawn.x, y: 0, vx: 0, vy: 0, z: 0, grounded: true, face: LV.spawn.face, crouch: false, push: false, effort: 0, holdT: 0, yaw: Math.PI / 2 * LV.spawn.face });
  crate.x = LV.crate.x; crate.vx = 0; camS.x = S.x + L.camera.lookAhead * S.face; camS.lead = S.face;
}

/* ---------------------------------------------------------------- per-frame presentation */
const tmpV = new T.Vector3();
function present(dt) {
  /* rabbit placement and turn: yaw goes through facing the lens (0), so a turn shows the face, not the tail */
  let yawT = Math.PI / 2 * S.face; if (S.mode === 'enter' && S.modeT > 0.12) yawT = Math.PI;
  S.yaw += (yawT - S.yaw) * (1 - Math.exp(-dt * (S.mode === 'enter' ? 7 : 16)));
  if (rig) {
    rig.object.position.set(S.x, S.y, S.z); rig.object.rotation.y = S.yaw;
    rig.update(dt, { speed: S.mode === 'enter' && S.modeT > 0.25 && S.z > -1.0 ? 0.6 : Math.abs(S.vx), vx: S.vx, vy: S.vy, grounded: S.grounded || S.mode !== 'play', crouch: S.crouch, push: S.push, effort: S.effort, landed: S.landed, airT: S.airT });
  }
  world.crate.position.set(crate.x, 0, 0);
  FF.setAOBox(0, [crate.x, crate.h / 2, 0], [crate.w / 2, crate.h / 2, LV.crate.d / 2], L.ao.objects, L.ao.objectReach);
  const ground = S.onCrate ? crate.h : 0, air = Math.max(0, S.y - ground);
  FF.U.uFFRab.value.set(S.x, ground, S.z, L.ao.rabbit * Math.exp(-air * 7));
  FF.U.uFFRabAx.value.set(S.mode === 'enter' ? 0.12 : 0.24, S.mode === 'enter' ? 0.2 : 0.12);

  /* camera: gentle follow with look-ahead, rising a little with jumps */
  camS.lead += (S.face - camS.lead) * (1 - Math.exp(-dt * 1.6));
  const tx = clamp(S.x + L.camera.lookAhead * camS.lead + 0.12 * S.vx, L.camera.minX, L.camera.maxX);
  camS.x += (tx - camS.x) * (1 - Math.exp(-dt * L.camera.follow));
  camS.y += (L.camera.jumpFollow * Math.max(0, S.y) - camS.y) * (1 - Math.exp(-dt * 3));
  camera.position.set(camS.x, L.camera.height + camS.y, L.camera.dist); camera.rotation.set(0, 0, 0);
}

/* ---------------------------------------------------------------- HUD */
const fpsEl = document.getElementById('fps'), helpEl = document.getElementById('help'), fadeEl = document.getElementById('fade'), noteEl = document.getElementById('note');
const clean = Q.get('clean') === '1';
function fade(a) { fadeEl.style.opacity = a.toFixed(3); }
let noteT = 0; function note(t) { noteEl.textContent = t; noteEl.style.opacity = 1; clearTimeout(noteT); noteT = setTimeout(() => { noteEl.style.opacity = 0; }, 2600); }
let helpT = 0; function showHelp() { if (clean) return; helpEl.style.opacity = 1; clearTimeout(helpT); helpT = setTimeout(() => { helpEl.style.opacity = 0; }, 7000); }
function hudTier() { if (!fpsEl.hidden) fpsEl.dataset.tier = tierName; }

/* ---------------------------------------------------------------- loop */
const FIX = 1 / 120; let acc = 0, last = performance.now(), paused = false, frozen = false, time = 0, alive = true;
const ft = new Float32Array(90); let fti = 0, fpsShown = 0;
function frame(now) {
  if (!alive) return;
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  ft[fti++ % ft.length] = dt;
  if (!paused) { acc += dt; let n = 0; while (acc >= FIX && n++ < 24) { step(FIX); acc -= FIX; } present(dt); if (!frozen) time += dt; }
  draw();
  if (!fpsEl.hidden && now - fpsShown > 250) { fpsShown = now; const s = stats(); fpsEl.textContent = `${s.fps.toFixed(0)} fps · ${s.ms.toFixed(1)} ms · ${tierName} · ${s.calls} draws · ${(s.tris / 1000).toFixed(0)}k tris · ${s.w}x${s.h}`; }
}
function draw() {
  resize(); FF.U.uFFTime.value = time; world.update(0, time, renderer.getPixelRatio());
  post.render(scene, camera, L, FF.tier, time);
}
function stats() {
  let s = 0, n = 0; for (let i = 0; i < ft.length; i++) if (ft[i] > 0) { s += ft[i]; n++; }
  const ms = n ? s / n * 1000 : 0; const ri = renderer.info.render;
  return { fps: ms ? 1000 / ms : 0, ms, calls: ri.calls, tris: ri.triangles, w: renderer.domElement.width, h: renderer.domElement.height, tier: tierName };
}

/* ---------------------------------------------------------------- start */
async function start() {
  rig = await FF.Rabbit.create(L);
  scene.add(rig.object);
  rig.object.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  setTier(tierName);
  present(0); draw();
  if (!clean) showHelp();
  requestAnimationFrame(t => { last = t; frame(t); });
  window.__ff.ready = true;
  if (parent !== window) try { parent.postMessage({ ty: 'ready' }, location.origin); } catch (_) {}
}

/* the game will live in an iframe in the planet's arcade: free the GPU the moment the page goes away */
function teardown() {
  if (!alive) return; alive = false;
  scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } } });
  if (world.lights.key.shadow.map) world.lights.key.shadow.map.dispose();
  post.dispose(); renderer.dispose();
  try { const ext = renderer.getContext().getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (_) {}
}
addEventListener('pagehide', teardown);
addEventListener('message', e => { if (e.source !== parent || e.origin !== location.origin) return; const d = e.data || {}; if (d.ty === 'leave') teardown(); });

/* ---------------------------------------------------------------- test handle */
window.__ff = {
  ready: false, look: L, level: LV, S, crate, renderer, scene, camera, world, three: T,
  get rig() { return rig; }, get tier() { return tierName; },
  setTier, stats, reset, project,
  apply() { FF.applyShading(L); world.apply(L); project(); },
  pause(on) { paused = on !== false; }, freeze(on) { frozen = on !== false; },
  /* advance the simulation n fixed steps (1/120 s each) and draw once */
  step(n, render) { n = n || 1; for (let i = 0; i < n; i++) { step(FIX); if (i % 2 === 1 || i === n - 1) present(FIX * 2); } if (render !== false) draw(); return { x: S.x, y: S.y, vx: S.vx, vy: S.vy, grounded: S.grounded, push: S.push, crate: crate.x, mode: S.mode }; },
  hold(k, on) { hold[k] = on !== false; }, press(k) { pressed[k] = true; }, release() { for (const k in hold) hold[k] = false; },
  teleport(x, face) { S.x = x; S.vx = 0; if (face) S.face = face; camS.x = clamp(x + L.camera.lookAhead * S.face, L.camera.minX, L.camera.maxX); camS.lead = S.face; S.yaw = Math.PI / 2 * S.face; },
  draw, teardown,
};
start().catch(e => { console.error(e); document.getElementById('note').textContent = 'Could not start: ' + e.message; document.getElementById('note').style.opacity = 1; });
})();
