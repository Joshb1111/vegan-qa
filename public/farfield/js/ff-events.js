/* FAR FIELD — ff-events.js: FF.Events, the staged beats and the flow around them.
   THE VERGE (no fail; A8: event-driven, nothing pushes the player, the staging waits or loops while they linger): from x 21
   an engine beyond the wall; the van's headlights travel along the wall and it stops at the gate (at min(6.0 s, the moment
   the rabbit reaches x 29), never before 3.5 s; its speed adapts invisibly); the glare floods under the gate; the door
   slams; boots walk up and stand in the glare; the chain rattles in bursts FOR AS LONG AS THE RABBIT STAYS (no give-up).
   Step into the glare: the rattle stops dead, the boots turn, 1.0 s of silence, then harder (at most every 4 s).
   The rabbit drops into the culvert -> the lock gives at max(drop + 0.6, stop + 4.0); the gate slides 0.8 m; the person
   walks to the culvert, kneels and waits (scraping, the torch on the grass) until the rabbit is 0.6 m into the squeeze pipe
   (A14); only then the torch comes down the crack for 3.0 s, lighting the chamber floor 38.5-39.0 and never the rabbit
   (withdrawn at once if it heads back past 39.3); an arm reaches in and falls short (A11); they stand, sweep the verge,
   go back through the gate, it shuts, the van reverses and leaves. Driven by the data FF.S1.verge (ff-script-s1.js).
   THE COURTYARD: the walkway worker (A4: unarmed, no torch; never notices anything): boots on steel, the amber lamp clicks
   on, the door opens, they walk out, stop at the rail looking AWAY, walk on, go in; the far Works thud starts (Audio keeps
   its 4 s cadence and emits the 'thud' fact). Starts at the earliest of: the first push, the first reach-fail, 6 s after
   the rabbit reaches x 71, 25 s after it enters the Courtyard (FF.S1.walkway).
   Checkpoints and saves; THE FAILURE FLOW (§10: cut to black on the step of the grab or shot, restart at the checkpoint at
   0.80 s, control at 1.00 s, picture at 1.25 s; nothing is counted, nothing rewards harm); THE END (settled -> held 4 s ->
   the pull-out 8 s -> fade 2 s -> 0.5 s -> the card -> the title).
   THE DOOR REVEAL (Josh's playtest, 7 Oct §9.5: "this particular reveal needs to complete reliably"): the ONE deliberate
   camera takeover in Sequence 1. It starts at the earlier of the searcher's door cue (1.5 s after the rabbit lands from the
   duct) and the rabbit's centre reaching REVEAL.triggerX (90.0, just out from under the A0 shelf's skirt), first time only:
     control off at once; the rabbit's own physics bring it to a natural stop (a run slides ~0.4 m; airborne, it lands first;
     nothing moves it but its momentum) -> the ears snap to the footsteps and, once still, it sits up to listen (under the
     shelf: it lifts its head and pricks its ears, 'prick') -> 0.85 s after it has stopped (v2 review: the reaction must be
     seen) the camera eases over 1.5 s to the establishing frame (the door light, the door, the man stepping out, the fence
     clatter, the aim at the fence that lights the gap) -> the camera eases back (1.3 s) while the gun lowers -> control
     returns as the ease ends, with every direction or jump key held WITHOUT A BREAK through the takeover latched (FF.Input
     .latch: a held key never carries the rabbit on; a key let go and pressed again during it acts at once; a direction still
     held 0.8 s later resumes as the cautious walk; a Shift held through it too runs again when pressed afresh or when the
     grace ends) -> a grace (G.flags.revealSafe stays set; FF.AI gives him no sight of
     the rabbit while it is) during which he turns away from the fence; his routine starts after it. Rain, sound and the
     world keep running throughout. About 6.4-6.5 s from the cue to control (the entry's timings: ff-script-s1.js).
     Retries: once control is back it never replays (a replayed entry, rare, gets only a 1 s lean of the camera). A retry
     after it was SEEN (the camera on the open door with the man in it) but before it finished (Pause -> Restart, Quit ->
     Continue) replays only the aim, briefly (~2.6 s, the camera already on the door under the restart's black). Facts:
     reveal {phase: start|pan|return|control|end, cause: cue|trigger|replay, x}.
   Phase facts emitted (Audio, Camera, World, Player listen): vehicle {phase: approach|stop|door|leave|gone, x, z},
   gate {phase: rattle (dur, hard)|lit-pause|jolt|lock|slide|close}, person {phase: out|kneel|wait|stand|sweep|back|in},
   torch-down {phase: on|reach|end (withdraw: true when the rabbit heads back)}, walkway {phase: boots|lamp|door-open|out|rail|rail-leave|door-r|shut|thud|done},
   lamp {id: 'amber', on}, checkpoint {id}, end {phase: pullout|fade|card}, reveal {phase, cause, x}. FF.Events.van is the van
   object (FF.Humans).
   OWNER: the humans + events builder. API contract: docs/farfield/INTERFACES.md §8.7 and §9. */
'use strict';
window.FF = window.FF || {};

(function () {
const U = FF.util, G = () => FF.G;
const st = { cp: 'verge-start', failing: null, beats: {} };
const searchCps = ['search-arrive', 'search-platform', 'search-skip'];
let person = null, worker = null, van = null;
const lit = {};                                          // light handles this module has switched on (put out on beat end / reset)
function spot(id) { return FF.World && FF.World.spot ? FF.World.spot(id) : null; }
function point(id) { return FF.World && FF.World.point ? FF.World.point(id) : null; }
function prop(id) { return FF.World && FF.World.prop ? FF.World.prop(id) : null; }
/* where the Verge person stands to rattle the chain: far enough behind the gate leaves (z -4.02, back face -4.11) that his
   hands and the slung gun stay behind the steel in the unlock pose (at -4.45 they poked through the gate; Josh, 7 Oct) */
const GATE_STAND_Z = -4.68;
/* move a set piece through the World's convention (gate leaves slide in metres; doors swing 0 shut .. 1 open) */
function openProp(id, v) { if (FF.World && FF.World.open) { prop(id); FF.World.open(id, v); return; } const p = prop(id); if (!p) return; const ud = p.userData; if (ud.bx == null) { ud.bx = p.position.x; ud.by = p.rotation.y; } if (/gateLeaf/.test(id)) p.position.x = ud.bx + (id === 'gateLeafL' ? -v : v); else p.rotation.y = ud.by + (id === 'walkwayDoorR' ? 1.55 : -1.55) * v; }
function lightOn(id, o) { const h = spot(id); if (!h) return; if (!lit[id]) { h.on(true); if (h.beam) h.beam(true); lit[id] = h; } h.set(o); }
function lightOff(id) { const h = lit[id]; if (!h) return; h.on(false); if (h.beam) h.beam(false); delete lit[id]; }
const emit = (n, d) => FF.bus.emit(n, d || {});
const rnd = (a, b) => a + (b - a) * FF.rng();

function setCheckpoint(id) {
  if (st.cp === id) return; st.cp = id; G().checkpoint = id;
  const cp = FF.Level.checkpoint(id); if (cp && cp.save) FF.Game.save(id);
  emit('checkpoint', { id });
}

/* ================================================================== THE VERGE */
const V = { on: false, t: 0, s: 0, v: 0, T: 6.0, stopped: false, stopT: null, phase: 'idle', dropT: null, outT: null, q: [], qi: 0, qt: 0, gone: false,
  rattle: { on: false, burst: 0, pause: 0, hard: 0, silence: 0, cool: 0, dur: 0 }, leaf: 0, leafTo: 0, door: 0, doorTo: 0, brake: 0, glance: 0, torchT: 0, scrapeT: 0,
  van: { x: -12, z: -8.5, yaw: Math.PI / 2 }, p: { x: 31.6, z: -5.6, yaw: 0, anim: 'idle', speed: 0, vis: false, kneel: false, torch: null }, leave: null };
const VAN_HALF_TO_FRONT = 0.8;                           // FF.S1.verge.vehicle.stop is 1.8 m behind the bumper (production blockout); the stand-in's origin is its centre
function vanPath() {
  const D = FF.S1.verge.vehicle, zc = D.stop[1] - VAN_HALF_TO_FRONT, P0 = [D.turnAtX, D.pathZ], P1 = [D.turnAtX + 2.0, D.pathZ], P2 = [D.stop[0], D.pathZ + 0.1], P3 = [D.stop[0], zc];
  const pts = []; let L = 0; const N = 24; let prev = P0;
  for (let i = 0; i <= N; i++) { const u = i / N, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3; const p = [a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0], a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1]]; L += Math.hypot(p[0] - prev[0], p[1] - prev[1]); pts.push({ p, L }); prev = p; }
  const L0 = D.turnAtX - D.fromX;
  return { L0, arc: pts, S: L0 + L, at(s) {
    if (s <= L0) return { x: D.fromX + s, z: D.pathZ, yaw: Math.PI / 2 };
    const r = s - L0; let i = 1; while (i < pts.length - 1 && pts[i].L < r) i++;
    const a = pts[i - 1], b = pts[i], k = U.clamp((r - a.L) / Math.max(1e-6, b.L - a.L), 0, 1), x = U.lerp(a.p[0], b.p[0], k), z = U.lerp(a.p[1], b.p[1], k);
    return { x, z, yaw: Math.atan2(b.p[0] - a.p[0], b.p[1] - a.p[1]) };
  } };
}
let VP = null;
function vergeReset(done) {
  Object.assign(V, { on: false, t: 0, s: 0, v: 0, T: FF.S1.verge.vehicle.stopAt.t, stopped: false, stopT: null, phase: done ? 'gone' : 'idle', dropT: null, outT: null, q: [], qi: 0, qt: 0, gone: !!done,
    leaf: 0, leafTo: 0, door: 0, doorTo: 0, brake: 0, glance: 0, torchT: 0, scrapeT: 0, leave: null, inPipe: false, back: false, slammed: false, closed: false, walk: null });
  Object.assign(V.rattle, { on: false, burst: 0, pause: 0, hard: 0, silence: 0, cool: 0, dur: 0 });
  Object.assign(V.van, { x: FF.S1.verge.vehicle.fromX, z: FF.S1.verge.vehicle.pathZ, yaw: Math.PI / 2 });
  Object.assign(V.p, { x: 31.6, z: -5.6, yaw: 0, anim: 'idle', speed: 0, vis: false, kneel: false, torch: null });
}
function vergeStart() {
  if (V.on || V.gone || G().flags.vergeDone) return;
  V.on = true; V.t = 0; V.phase = 'drive'; V.s = 0; V.v = 0; VP = VP || vanPath();
  emit('vehicle', { phase: 'approach' });                  // (no x: the camera follows the headlights while it drives)
}
function vergeStep(dt) {
  if (!V.on || V.gone) return;
  const D = FF.S1.verge, B = D.beforeDrop, r = G().rabbit; V.t += dt;
  /* ---- the van: drive, adapting its speed so it stops at min(6.0 s, rabbit at x 29), never before 3.5 s */
  if (V.phase === 'drive') {
    const S = D.vehicle.stopAt;
    if (r && r.x < S.orRabbitX) { const eta = V.t + (S.orRabbitX - r.x) / Math.max(1.2, Math.abs(r.vx || 0)); V.T = U.clamp(Math.min(V.T, eta), S.notBefore, S.t); }
    else if (r) V.T = U.clamp(Math.min(V.T, V.t), S.notBefore, S.t);
    if (V.t >= 0.5) {
      /* behind the wall only its light and sound are perceived, so the timing wins: it may hurry (a sprinting rabbit) */
      const rem = VP.S - V.s, left = Math.max(0.15, V.T - V.t);
      const vWant = Math.min(30, 1.9 * rem / left, Math.sqrt(2 * 9.0 * rem) + 0.4);
      V.v = U.approach(V.v, vWant, 40 * dt); V.s = Math.min(VP.S, V.s + V.v * dt);
      V.brake = U.clamp((V.v - vWant) / 3, 0, 1);
      if (VP.S - V.s < 0.02) { V.s = VP.S; V.v = 0; V.stopped = true; V.stopT = V.t; V.phase = 'stopped'; V.brake = 1; emit('vehicle', { phase: 'stop', x: V.van.x, z: V.van.z }); }
    }
    Object.assign(V.van, VP.at(V.s));
  }
  V.brake = U.approach(V.brake, 0, dt * 1.5);
  /* ---- before the drop: door, boots to the gate, the chain (looping), the glare reaction */
  if (V.stopped && !V.outT) {
    const ts = V.t - V.stopT;
    if (ts >= B.doorSlam - 0.4 && V.doorTo === 0 && !V.slammed) { V.doorTo = 1; }
    if (ts >= B.doorSlam && !V.slammed) { V.slammed = true; V.doorTo = 0; emit('vehicle', { phase: 'door' }); V.p.vis = true; Object.assign(V.p, { x: 31.55, z: -5.55, yaw: 0.6 }); }
    if (ts >= B.boots[0] && ts < B.boots[1]) {             // boots on gravel up to the gate: (31.55, -5.55) -> (33.7, GATE_STAND_Z)
      const k = U.clamp((ts - B.boots[0]) / (B.boots[1] - B.boots[0]), 0, 1); V.p.x = U.lerp(31.55, 33.7, k); V.p.z = U.lerp(-5.55, GATE_STAND_Z, k); V.p.anim = 'walk'; V.p.speed = 1.2; V.p.yaw = Math.atan2(2.15, 1.1);
    } else if (ts >= B.boots[1]) { V.p.x = 33.7; V.p.z = GATE_STAND_Z; V.p.speed = 0; V.p.anim = V.rattle.on && V.rattle.burst > 0 ? 'unlock' : 'unlock'; V.p.yaw = U.approach(V.p.yaw, V.glance, dt * 2.5); }
    if (ts >= B.rattleFrom && !V.rattle.on) { V.rattle.on = true; V.rattle.burst = 0; V.rattle.pause = 0.05; }
    if (V.rattle.on) rattleStep(dt);
    /* step into the glare (31-35, at the lane): the rattle stops dead, the boots turn, 1.0 s of silence, then harder */
    const R = V.rattle; R.cool = Math.max(0, R.cool - dt);
    if (r && R.on && r.x >= D.gate.x0 && r.x <= D.gate.x1 && r.y > -0.3 && R.cool <= 0 && R.silence <= 0) {
      R.silence = B.glareReaction.silence; R.cool = B.glareReaction.cooldown; R.burst = 0; R.hard = 1;
      V.glance = U.clamp(Math.atan2(r.x - V.p.x, -GATE_STAND_Z), -0.7, 0.7);
      emit('gate', { phase: 'lit-pause', x: r.x });
    }
  }
  /* ---- the drop: the lock gives at max(drop + 0.6, stop + 4.0), then the person's list (FF.S1.verge.afterDrop) */
  if (V.dropT != null && V.stopped && V.outT == null) { V.outT = Math.max(V.dropT + 0.6, V.stopT + 4.0); }
  if (V.outT != null && V.t >= V.outT && V.phase !== 'after') { V.phase = 'after'; V.q = D.afterDrop.slice(); V.qi = 0; V.qt = 0; V.rattle.on = false; V.rattle.burst = 0; startStep(); }
  if (V.phase === 'after') afterStep(dt);
  /* ---- the leaf and the van door ease */
  V.leaf = U.approach(V.leaf, V.leafTo, dt / 0.6 * 0.8);
  V.door = U.approach(V.door, V.doorTo, dt / 0.35);
}
function rattleStep(dt) {
  const R = V.rattle, B = FF.S1.verge.beforeDrop;
  if (R.silence > 0) { R.silence -= dt; V.p.shake = 0; if (R.silence <= 0) { R.pause = 0; } return; }
  V.glance = U.approach(V.glance, 0, dt * 0.5);
  if (R.burst > 0) { R.burst -= dt; V.p.shake = 1; if (R.burst <= 0) { R.pause = rnd(B.rattlePause[0], B.rattlePause[1]) * (R.hard > 0.3 ? 0.6 : 1); } }
  else { R.pause -= dt; V.p.shake = 0; if (R.pause <= 0) { R.burst = rnd(B.rattleBurst[0], B.rattleBurst[1]) * (R.hard > 0.3 ? 1.2 : 1); R.dur = R.burst; emit('gate', { phase: 'rattle', dur: +R.burst.toFixed(2), hard: R.hard > 0.3 }); } }
  R.hard = Math.max(0, R.hard - dt / 10);
}
/* the after-drop list, one step at a time */
function startStep() {
  const a = V.q[V.qi]; if (!a) return; V.qt = 0; const kind = a[0], P = V.p;
  switch (kind) {
    case 'lock-gives': emit('gate', { phase: 'lock' }); V.p.shake = 0; break;
    case 'gate-crack': V.leafTo = FF.S1.verge.gate.crack; emit('gate', { phase: 'slide' }); break;
    case 'step-out': emit('person', { phase: 'out' }); break;
    case 'walk': if (V.back) { V.walk = { x0: P.x, z0: P.z, x1: 33.4, z1: -3.3, v: a[2] }; } else V.walk = { x0: P.x, z0: P.z, x1: a[1] + 0.1, z1: -0.6, v: a[2] }; break;
    case 'kneel': emit('person', { phase: 'kneel' }); break;
    case 'wait-for': emit('person', { phase: 'wait' }); break;
    case 'torch-down': V.torchT = 0; emit('torch-down', { phase: 'on' }); break;
    case 'reach-in': emit('torch-down', { phase: 'reach' }); break;
    case 'stand': emit('torch-down', { phase: 'end' }); emit('person', { phase: 'stand' }); break;
    case 'walk-sweep': V.walk = { x0: P.x, z0: P.z, x1: a[1], z1: -0.9, v: a[2] }; emit('person', { phase: 'sweep' }); V.back = true; break;
    case 'gate-close': emit('person', { phase: 'in' }); break;
    case 'vehicle-leave': V.leave = { t: 0 }; emit('vehicle', { phase: 'leave' }); break;
  }
}
function nextStep() { V.qi++; startStep(); }
function afterStep(dt) {
  const a = V.q[V.qi], P = V.p, r = G().rabbit; if (!a) return;
  V.qt += dt; const kind = a[0], t = V.qt;
  P.torch = null; P.shake = 0;
  switch (kind) {
    case 'lock-gives': P.anim = 'unlock'; if (t >= 0.05) nextStep(); break;
    case 'gate-crack': P.anim = 'idle'; if (t >= a[1]) nextStep(); break;
    case 'step-out': P.anim = 'walk'; P.speed = 1.4; P.x = U.lerp(33.7, 33.4, U.clamp(t / a[1], 0, 1)); P.z = U.lerp(GATE_STAND_Z, -3.3, U.clamp(t / a[1], 0, 1)); P.yaw = 0; if (t >= a[1]) nextStep(); break;
    case 'walk': case 'walk-sweep': {
      /* timed by the x distance, as the design's numbers are (33 -> 38 at 1.8 m/s = 2.8 s); the path also crosses in z */
      const w = V.walk, Lx = Math.max(0.3, Math.abs(w.x1 - w.x0)), L = Math.hypot(w.x1 - w.x0, w.z1 - w.z0), k = U.clamp(t * w.v / Lx, 0, 1);
      P.x = U.lerp(w.x0, w.x1, k); P.z = U.lerp(w.z0, w.z1, k); P.anim = kind === 'walk-sweep' ? 'walk-search' : 'walk'; P.speed = w.v * L / Lx; P.yaw = Math.atan2(w.x1 - w.x0, w.z1 - w.z0);
      if (kind === 'walk-sweep') { const sx = P.x - 2.2 - 0.8 * Math.sin(V.t * 1.3); P.torch = { on: true, target: [sx, 0, -0.2 + 0.6 * Math.sin(V.t * 0.9)], half: 11, intensity: 18 }; }
      if (k >= 1) { if (kind === 'walk' && V.back) { V.inT = 0; V.qt = 0; V.q.splice(V.qi + 1, 0, ['through-gate', 1.6]); } nextStep(); }
      break; }
    case 'through-gate': {                                 // back through the gap and into the van (implicit in the data)
      const k = U.clamp(t / a[1], 0, 1); P.anim = 'walk'; P.speed = 1.3;
      if (k < 0.5) { P.x = 33.4; P.z = U.lerp(-3.3, -4.6, k * 2); P.yaw = Math.PI; } else { P.x = U.lerp(33.4, 31.6, (k - 0.5) * 2); P.z = U.lerp(-4.6, -5.6, (k - 0.5) * 2); P.yaw = -2.1; V.doorTo = 1; }
      if (k >= 1) { P.vis = false; V.doorTo = 0; nextStep(); }
      break; }
    case 'kneel': P.anim = 'kneel'; P.speed = 0; P.yaw = Math.PI / 2; P.torch = { on: true, target: [37.6, 0, -0.1], half: 12, intensity: 16 }; if (t >= a[1]) nextStep(); break;
    case 'wait-for': {                                     // A8 + A14: wait at the inlet, scraping, the torch searching the grass, until the rabbit is in the pipe
      P.anim = 'kneel'; P.speed = 0; P.yaw = Math.PI / 2;
      P.torch = { on: true, target: [37.4 + 0.9 * Math.sin(V.t * 0.7), 0, -0.35 + 0.55 * Math.sin(V.t * 0.43)], half: 12, intensity: 16 };
      if (r && r.x >= 40.2 && r.y < -0.5) nextStep();         // in-pipe (A14): checked directly, so it comes again after a withdrawal
      break; }
    case 'torch-down': {
      const o = a[2] || {}, sh = o.shaft || [38.5, 39.0];
      P.anim = 'torch-down'; P.yaw = Math.PI / 2;
      /* withdrawn at once if the rabbit heads back past 39.3: back to waiting (it comes down again when the rabbit is in the pipe) */
      if (r && r.x < (o.withdrawIfRabbitX || 39.3)) { emit('torch-down', { phase: 'end', withdraw: true }); V.qi--; startStep(); break; }
      V.torchT += dt; P.torch = { on: true, target: [(sh[0] + sh[1]) / 2 + 0.02, -1.0, -0.08], half: 6.5, intensity: 22, lens: [38.62, 0.22, -0.32] };
      if (V.torchT >= a[1]) nextStep();
      break; }
    case 'reach-in': { const sh = (V.q[V.qi - 1] && V.q[V.qi - 1][2] && V.q[V.qi - 1][2].shaft) || [38.5, 39.0];
      P.anim = 'reach'; P.reach = U.clamp(t / 0.6, 0, 1) * (t < a[1] - 0.3 ? 1 : (a[1] - t) / 0.3); P.torch = { on: true, target: [(sh[0] + sh[1]) / 2 + 0.02, -1.0, -0.08], half: 6.5, intensity: 22, lens: [38.62, 0.22, -0.32] };
      if (t >= a[1]) { P.reach = 0; nextStep(); } break; }
    case 'stand': P.anim = 'idle'; P.kneel = false; if (t >= a[1]) nextStep(); break;
    case 'gate-close': V.leafTo = 0; if (!V.closed) { V.closed = true; emit('gate', { phase: 'close' }); } if (t >= a[1]) nextStep(); break;
    case 'vehicle-leave': leaveStep(dt); break;
  }
}
/* the van reverses out (yaw 0 -> PI/2, 2.0 s) and drives away along +x; its lights pass over the slab gap at 46 */
function leaveStep(dt) {
  const L = V.leave, D = FF.S1.verge.vehicle; L.t += dt; const t = L.t;
  if (t < 0.6) { V.door = 0; return; }
  if (t < 2.6) { const k = U.ease.inOutSine((t - 0.6) / 2.0), zc = D.stop[1] - VAN_HALF_TO_FRONT; V.van.x = U.lerp(D.stop[0], D.stop[0] - 1.2, k); V.van.z = U.lerp(zc, D.pathZ, k); V.van.yaw = U.lerp(0, Math.PI / 2, k); L.v = 0; L.x = V.van.x; return; }
  L.v = Math.min(14, (L.v || 0) + 5 * dt); L.x += L.v * dt; V.van.x = L.x; V.van.z = D.pathZ; V.van.yaw = Math.PI / 2;
  if (V.van.x > 75) vergeFinish();
}
function vergeFinish() {
  if (V.gone) return; V.gone = true; V.on = false; V.phase = 'gone'; V.p.vis = false; G().flags.vergeDone = true;
  lightOff('headlights'); lightOff('worklight'); if (person && person.torchHandle) person.set({ torch: { on: false } });
  emit('vehicle', { phase: 'gone' });
}
function vergeFrame(dt) {
  if (!van) return;
  const place = G().place, active = V.on && !V.gone && (place === 'verge' || place === 'drain');
  if (V.on && !V.gone && !(place === 'verge' || place === 'drain')) vergeFinish();
  /* the van */
  const showVan = active || (V.gone && (place === 'search' || place === 'rest') && G().flags.vergeDone);
  if (active) {
    van.set({ visible: true, x: V.van.x, z: V.van.z, yaw: V.van.yaw, lights: true, markers: true, door: V.door, engine: true, brake: V.brake });
    /* K0 headlights: along the wall while driving (slivers through the joints are the world's), into the gate when stopped */
    const a = van.headlightAnchors(), pos = [(a[0].x + a[1].x) / 2, 0.82, (a[0].z + a[1].z) / 2], f = van.forward();
    const turned = V.van.yaw < 0.6;
    const tgt = V.leave && V.leave.t > 2.6 ? [pos[0] + 9, 0.0, -1.0] : turned ? [pos[0] + f.x * 6, 0.05, pos[2] + 6.0] : [pos[0] + f.x * 10, 0.4, pos[2] + 3.6];
    lightOn('headlights', { pos, target: tgt, angle: 24 * Math.PI / 180, penumbra: 0.5, intensity: 34, color: '#ffe3bd', distance: 26, decay: 1.2 });
    const w = van.workAnchor(); lightOn('worklight', { pos: [w.x, w.y, w.z], target: [w.x + f.x * 4, 2.2, w.z + f.z * 4], angle: 0.6, penumbra: 0.8, intensity: 6, color: '#e7edf2', distance: 7, decay: 2 });
  } else if (showVan) {
    /* the Search: the same van parked behind the gateway, lights off, markers on, engine ticking (Audio) */
    van.set({ visible: true, x: 101.5, z: -5.6, yaw: -Math.PI / 2, lights: false, markers: true, door: 0, engine: false, brake: 0 });
    lightOff('headlights'); lightOff('worklight');
  } else { van.set({ visible: false }); lightOff('headlights'); lightOff('worklight'); }
  /* the person */
  if (person) {
    const P = V.p, vis = active && P.vis;
    const tl = P.torch;
    person.set({ visible: vis, x: P.x, y: 0, z: P.z, yaw: P.yaw, face: 0, anim: P.anim, speed: P.speed, gait: (person.st.gait || 0) + (vis ? (P.speed || 0) * dt / 0.65 : 0), shakeAmt: P.shake || 0, reach: P.reach || 0,
      torch: tl ? { on: true, target: tl.target, half: tl.half, intensity: tl.intensity, color: '#e6ecf2', distance: 10 } : { on: false } });
    if (tl && tl.lens && person.torchHandle && vis) person.lensOverride = tl.lens; else person.lensOverride = null;
  }
  /* the gate leaves: jolt in bursts (prop offsets from their built position), one slides 0.8 m when the lock gives */
  const jolt = active && V.rattle.on && V.rattle.burst > 0 ? 0.006 * Math.sin(V.t * 47) * (1 + V.rattle.hard) : 0;
  if (active || V.leaf > 0 || V.jolted) { openProp('gateLeafL', -jolt); openProp('gateLeafR', V.leaf - jolt); V.jolted = active; }
}

/* ================================================================== THE COURTYARD: the walkway worker */
const W = { on: false, at: null, t: 0, done: false, sent: {}, x: 78, z: -15.3, yaw: 0, anim: 'idle', speed: 0, vis: false, doorL: 0, doorR: 0, enterT: null, x71: null };
function walkwayReset(done) { Object.assign(W, { on: false, at: null, t: 0, done: !!done, sent: {}, x: 78, z: -15.3, yaw: 0, anim: 'idle', speed: 0, vis: false, doorL: done ? 1 : 0, doorR: 0, enterT: null, x71: null }); }
function walkwaySchedule(delay, cause) {
  if (W.on || W.done || G().flags.walkwayDone) return;
  const at = G().t + Math.max(0, delay || 0); if (W.at == null || at < W.at) { W.at = at; W.cause = cause; }
}
function walkwayStep(dt) {
  if (W.done) return;
  const now = G().t, r = G().rabbit;
  if (!W.on) {
    if (r && G().place === 'courtyard' && W.enterT == null) { W.enterT = now; walkwaySchedule(25, 'courtyard+25s'); }
    if (r && r.x >= 71.0 && W.x71 == null && G().place === 'courtyard') { W.x71 = now; walkwaySchedule(6.0, 'x71+6s'); }
    if (W.at != null && now >= W.at) { W.on = true; W.t = 0; emit('walkway', { phase: 'boots', cause: W.cause }); }
    return;
  }
  W.t += dt; const T = FF.S1.walkway.t, WK = Object.assign({}, FF.S1.walkway), t = W.t;
  if (typeof WK.rail !== 'number') WK.rail = 81.0;           // (the data once named its note 'rail' too)
  const once = (k, f) => { if (!W.sent[k]) { W.sent[k] = true; f(); } };
  if (t >= T.doorOpen) once('door', () => { G().flags.amberOn = true; emit('lamp', { id: 'amber', on: true }); emit('walkway', { phase: 'lamp' }); emit('walkway', { phase: 'door-open' }); });
  if (t >= T.out) once('out', () => { W.vis = true; emit('walkway', { phase: 'out' }); });
  /* path: out of door L (z -15.3 -> walkway -14.45), right at 1.3 m/s, the rail (looking AWAY), on to door R, in */
  if (t < T.out) { W.x = WK.doorL; W.z = -15.3; }
  else if (t < T.out + 0.5) { W.x = WK.doorL; W.z = U.lerp(-15.3, WK.z, (t - T.out) / 0.5); W.anim = 'walk'; W.speed = 1.3; W.yaw = 0.4; }
  else if (t < T.atRail) { const k = U.clamp((t - T.out - 0.5) / (T.atRail - T.out - 0.5), 0, 1); W.x = U.lerp(WK.doorL, WK.rail, k); W.z = WK.z; W.anim = 'walk'; W.speed = WK.speed; W.yaw = Math.PI / 2; }
  else if (t < T.leaveRail) { W.x = WK.rail; W.anim = 'rail-look-out'; W.speed = 0; W.yaw = U.approach(W.yaw, Math.PI, dt * 3); once('rail', () => emit('walkway', { phase: 'rail' })); }
  else if (t < T.atDoorR) { const k = U.clamp((t - T.leaveRail) / (T.atDoorR - T.leaveRail), 0, 1); W.x = U.lerp(WK.rail, WK.doorR, k); W.anim = 'walk'; W.speed = WK.speed; W.yaw = U.approach(W.yaw, Math.PI / 2, dt * 4); once('rail-leave', () => emit('walkway', { phase: 'rail-leave' })); }
  else if (t < T.doorShut) { const k = U.clamp((t - T.atDoorR) / (T.doorShut - T.atDoorR), 0, 1); W.x = WK.doorR; W.z = U.lerp(WK.z, -15.4, k); W.anim = 'walk'; W.speed = 1.0; W.yaw = Math.PI; once('door-r', () => emit('walkway', { phase: 'door-r' })); }
  else { W.vis = false; once('shut', () => emit('walkway', { phase: 'shut' })); }
  if (t >= T.worksThud) once('thud', () => { emit('walkway', { phase: 'thud' }); });
  if (t >= T.worksThud + 0.5) { W.done = true; W.on = false; G().flags.walkwayDone = true; emit('walkway', { phase: 'done' }); }
}
function walkwayFrame(dt) {
  if (!worker) return;
  const place = G().place, here = place === 'courtyard' || place === 'drain';
  worker.set({ visible: here && W.vis && W.on, x: W.x, y: FF.S1.walkway.deckY, z: W.z, yaw: W.yaw, face: 0, anim: W.anim, speed: W.speed, gait: (worker.st.gait || 0) + (W.vis ? W.speed * dt / 0.68 : 0), torch: { on: false } });
  /* door R opens for them and clanks shut. Door L, its warm slab of light and the amber lamp are the World's, timed from the
     'walkway' {phase: 'boots'} fact and G.flags.amberOn / walkwayDone. */
  const wantR = W.sent['door-r'] && !W.sent.shut ? 1 : 0;
  if (W.on || W.doorR > 0) { W.doorR = U.approach(W.doorR, wantR, dt / (wantR ? 0.45 : 0.25)); openProp('walkwayDoorR', U.ease.inOutSine(W.doorR)); }
}

/* ================================================================== THE SEARCH: the door reveal (the one camera takeover) */
const REVEAL = {
  triggerX: 90.0,       // the rabbit's centre this far right (out from under the A0 shelf and its skirt, 89.7-89.8) starts it at the latest.
                        // From any speed it then stops before 91.0 (a run slides ~0.4 m; a running jump off the shelf top lands first:
                        // furthest measured x 90.8), left of the deck (92.0) and at least 19 m from him at the door
  /* v2 review fixes: the camera leaves only once the rabbit has stopped and its reaction has been seen (Josh §9.5: "briefly
     stop the rabbit ..., have him react to the sound, show the door") */
  panAfterStop: 0.85,   // the reaction (ears snapping to the footsteps, sitting up / lifting the head) shows this long before the camera moves
  panMin: 0.85,         // and never sooner than this after the cue
  panMax: 1.6,          // a safety: the camera goes by then even if the rabbit has not settled (it always has, in every test)
  panIn: 1.5,           // ease to the establishing frame (~20 m): the door light is in it before the door opens (the cue is 1.95 s)
  returnAtAim: 1.1,     // the camera starts back this far into the aim demonstration (gun up, beam narrowed on the gap, the click)
  returnTime: 1.3,      // ease back to the live play framing
  controlAfter: 1.3,    // control returns at the END of the ease back: the rabbit is in its normal place in the frame (>= 15% in)
  grace: 1.2,           // after control returns, still undetectable (G.flags.revealSafe); his routine starts after it
  maxTime: 12.0,        // a safety: no takeover lasts longer than this
  sitClear: 0.5,        // headroom for sitting up to listen (it stands 0.41 m to the ear tips, 0.45 sitting up)
  watchClear: 0.26,     // under the shelf (0.30): lifts its head and pricks its ears low ('prick'); lower than this (mid-squeeze) it keeps its crouch
  latch: ['left', 'right', 'up', 'jump'],
  glimpse: 1.0,         // a replayed entry after the reveal has run: no takeover, at most this long a lean of the camera
  seenAfterDoor: 0.3,   // the reveal counts as SEEN once the camera is on the door this long after it opened (the man in the doorway)
};
const RV = { phase: '', t: 0, cause: '', pose: '', poseAt: 0, shot: false, retT: 0, graceT: 0, done: false, glimpsed: false, held: false, log: null, maxX: null,
  seen: false, cueAt: null, stopAt: null, replay: false };
/* the held-key latch lives in FF.Input (ff-main.js); the no-detection guard in FF.AI (ff-ai.js), both keyed on this takeover */
const latched = () => (FF.Input && FF.Input.latched) || [];
function entrySeg(kind) { const segs = FF.AI && FF.AI.entrySegs; return segs ? segs.find(s => s.kind === kind) || null : null; }
function headroom(r) { return FF.Level.ceilingAbove(r.x, FF.RULES.rabbit.hw, r.y) - r.y; }
const rlog = (k, extra) => { if (!RV.log || RV.log[k]) return; const g = G(), r = g.rabbit, s = g.searcher || {}; RV.log[k] = Object.assign({ t: +(g.t - RV.log.t0).toFixed(3), x: +r.x.toFixed(3), vx: +(r.vx || 0).toFixed(3), y: +r.y.toFixed(3), entryT: s.entryT != null ? +s.entryT.toFixed(3) : null }, extra || {}); };
function revealStart(cause) {
  const g = G(), r = g.rabbit;
  RV.phase = 'hold'; RV.t = 0; RV.cause = cause; RV.pose = ''; RV.shot = false; RV.retT = 0; RV.graceT = 0; RV.held = true; RV.maxX = r.x;
  RV.cueAt = null; RV.stopAt = null; RV.replay = cause === 'replay';
  RV.log = { t0: g.t, cause }; rlog('start', { grounded: !!r.grounded, ai: (g.searcher || {}).state });
  if (FF.Input && FF.Input.off) FF.Input.off();          // from now on a key let go or pressed afresh is a new intention, never latched
  FF.Game.control(false); g.flags.revealSafe = true;
  emit('reveal', { phase: 'start', cause, x: +r.x.toFixed(2) });
}
function revealPose(name) { if (RV.pose === name || !(FF.Player && FF.Player.setPose)) return; RV.pose = name; RV.poseAt = RV.t; FF.Player.setPose(name); rlog('pose:' + name); }
/* control back (the takeover's end, or a safety exit): latch what is held, end the scripted reaction, keep the grace */
function revealControl() {
  const g = G(); RV.phase = 'grace'; RV.graceT = 0; RV.held = false; RV.done = true; RV.seen = true;
  /* the aim at the gap has been shown: a restart from here on never replays his entry (the AI also sets this when it ends) */
  if (!RV.log || !RV.log.safetyExit) g.flags.entryDone = true;
  if (RV.pose && FF.Player && FF.Player.setPose) FF.Player.setPose(null); RV.pose = '';
  const held = FF.Input && FF.Input.latch ? FF.Input.latch(REVEAL.latch) : []; FF.Game.control(true);
  rlog('control', { latched: held.join(',') || '-' });
  emit('reveal', { phase: 'control', cause: RV.cause, x: +g.rabbit.x.toFixed(2) });
}
/* the grace is over: he can see the rabbit again, so a Shift held through the takeover runs again (FF.Input.graceEnd) */
function revealEnd() { const g = G(); RV.phase = ''; g.flags.revealSafe = false; if (FF.Input && FF.Input.graceEnd) FF.Input.graceEnd(); rlog('end'); emit('reveal', { phase: 'end', cause: RV.cause, x: +g.rabbit.x.toFixed(2) }); }
function revealStep(dt) {
  const g = G(), r = g.rabbit, s = g.searcher; if (!r) return;
  if (!RV.phase) {
    if (g.mode !== 'play' || !s || !s.active || g.flags.entryDone || g.place !== 'search') return;
    const st = s.state;
    if (RV.done) {           // a replayed entry after the reveal has run: no takeover, at most a 1 s lean towards the door
      if (st === 'entry' && !RV.glimpsed && (s.entryT || 0) > 0.2) { RV.glimpsed = true; if (FF.Camera && FF.Camera.attend) FF.Camera.attend('entry-glimpse', { x: 109.0, w: 0.5, t: REVEAL.glimpse }); }
      return;
    }
    if (st !== 'wait' && st !== 'entry') return;
    if (r.mode && r.mode !== 'play') return;
    if (st === 'entry') revealStart('cue');
    else if (r.x >= REVEAL.triggerX) revealStart('trigger');
    return;
  }
  RV.t += dt; RV.maxX = Math.max(RV.maxX, r.x);
  /* the takeover may only run while his entry does: if it ended or was cut short, give control back at once */
  const live = s && s.active && (s.state === 'wait' || s.state === 'entry');
  if (RV.held && (!live || RV.t > REVEAL.maxTime)) {
    if (RV.shot && FF.Camera && FF.Camera.shot) FF.Camera.shot(null, { release: 0.6 });
    RV.log && (RV.log.safetyExit = { t: +RV.t.toFixed(2), state: s && s.state });
    revealControl();
  }
  if (RV.phase === 'hold' || RV.phase === 'show') {
    const cue = s.state === 'entry' && s.entryT != null;
    if (cue) { rlog('cue'); if (RV.cueAt == null) RV.cueAt = g.t - (RV.replay ? 0 : s.entryT); }
    /* the stop: its own deceleration (and landing); once still, the reaction */
    const still = r.grounded && Math.abs(r.vx || 0) < 0.05;
    if (still) { rlog('stopped'); if (RV.stopAt == null) RV.stopAt = g.t; }
    if (still && cue && !RV.replay) {
      const h = headroom(r);
      if (h >= REVEAL.sitClear) { if (!RV.pose) revealPose('listen'); else if (RV.pose === 'listen' && RV.t - RV.poseAt > 2.0) revealPose('freeze'); }
      else if (h >= REVEAL.watchClear && !RV.pose) revealPose('prick');
    }
    /* the camera: to the door once the rabbit has stopped and its reaction has shown (never later than panMax after the cue) */
    if (cue && !RV.shot && RV.cueAt != null) {
      const ready = RV.stopAt != null && g.t >= Math.max(RV.cueAt + REVEAL.panMin, RV.stopAt + REVEAL.panAfterStop);
      if (ready || g.t >= RV.cueAt + REVEAL.panMax) {
        RV.shot = true; RV.phase = 'show'; rlog('pan');
        if (FF.Camera && FF.Camera.shot) FF.Camera.shot('search-entry-hold', { ease: REVEAL.panIn });
        emit('reveal', { phase: 'pan', cause: RV.cause, x: +r.x.toFixed(2) });
      }
    }
    /* SEEN: the camera has been on the open door with the man in it (a restart after this replays only the aim, briefly) */
    const dw = entrySeg('doorway');
    if (RV.shot && cue && !RV.seen && dw && s.entryT >= dw.t0 + REVEAL.seenAfterDoor) { RV.seen = true; rlog('seen'); }
    /* and back, while the gun lowers */
    const aim = entrySeg('aim-demo'), backAt = aim ? aim.t0 + REVEAL.returnAtAim : 5.2;
    if (RV.shot && cue && s.entryT >= backAt) {
      RV.phase = 'return'; RV.retT = 0; rlog('return');
      if (FF.Camera && FF.Camera.shot) FF.Camera.shot(null, { release: REVEAL.returnTime });
      emit('reveal', { phase: 'return', cause: RV.cause, x: +r.x.toFixed(2) });
    }
  } else if (RV.phase === 'return') {
    RV.retT += dt;
    if (RV.retT >= REVEAL.controlAfter - 1e-6) revealControl();
  } else if (RV.phase === 'grace') {
    RV.graceT += dt;
    if (RV.graceT >= REVEAL.grace) revealEnd();
  }
}
/* A RETRY AFTER THE REVEAL WAS SEEN but before it finished (Pause -> Restart in the middle of it, or Quit -> Continue from
   the Search): never the whole takeover again (Josh §9.5: "handle checkpoint retries without repeatedly forcing a long
   interruption"). The restart (under black) puts the camera straight on the door frame; he is already outside, the entry
   resumes at the aim demonstration (FF.AI asks entryReplay()), the camera eases back and control returns: about 2.6 s. */
function entryReplay(reason) { return RV.seen && !RV.done && (reason === 'restart' || reason === 'continue'); }
function replayStart() {
  const g = G(), s = g.searcher;
  if (!s || !s.active || s.state !== 'wait' || g.flags.entryDone || !s.replay) return;
  revealStart('replay'); RV.shot = true; RV.phase = 'show';
  if (FF.Camera && FF.Camera.shot) FF.Camera.shot('search-entry-hold', { ease: 0 });
  rlog('pan', { replay: true });
}
/* ================================================================== THE END: settled -> held 4 s -> the pull-out -> fade -> card */
const E = { phase: '', t: 0 };
function endStep(dt) {
  if (!E.phase) return;
  E.t += dt; const r = G().rabbit;
  if (E.phase === 'hold') {
    if (r && (Math.abs(r.vx || 0) > 0.05 || !r.grounded)) { E.phase = ''; return; }    // any movement before the pull-out cancels it
    if (E.t >= FF.RULES.behave.settle.loafHold) { E.phase = 'pullout'; E.t = 0; FF.Game.control(false); if (FF.Camera && FF.Camera.shot) FF.Camera.shot('pull-out'); emit('end', { phase: 'pullout' }); }
  } else if (E.phase === 'pullout') {
    const zone = (FF.S1.camera.zones.find(z => z.id === 'pull-out') || {}).time || 8.0;
    if (E.t >= zone) { E.phase = 'fade'; E.t = 0; FF.Game.fade(1, 2.0); emit('end', { phase: 'fade' }); }
  } else if (E.phase === 'fade') {
    if (E.t >= 2.5) { E.phase = ''; emit('end', { phase: 'card' }); FF.Game.endCard(); }
  }
}

/* ================================================================== the module */
const Events = FF.Events = {
  stub: false,
  get van() { return van; },
  init() {
    const on = (n, f) => FF.bus.on(n, f);
    if (FF.Humans && FF.Humans.create) {
      person = FF.Humans.create('verge'); const vt = spot('vergeTorch'); if (vt) person.attachTorch(vt);
      worker = FF.Humans.create('worker');
      van = FF.Humans.createVan();
      /* the culvert torch: the light sits over the crack, not at the standing lens (the 2D rule only governs the Search) */
      const base = person.torchLens; person.torchLens = () => person.lensOverride ? { x: person.lensOverride[0], y: person.lensOverride[1], z: person.lensOverride[2] } : base();
    }
    VP = vanPath();
    /* the failure flow (§9): the AI emits 'fail' { kind: 'shot' | 'caught' } on the step of the shot or the grab */
    on('fail', d => Events.fail(d.kind));
    on('vehicle-arrive', () => vergeStart());
    on('person-out', () => { if (V.on && V.dropT == null) V.dropT = V.t; });
    on('rabbit-in-pipe', () => { V.inPipe = true; });
    /* the walkway: the earliest of its four causes (Level may announce the start itself) */
    on('walkway-start', d => walkwaySchedule(0, d && d.cause));
    on('walkway-timer', d => walkwaySchedule(d && d.arg != null ? +d.arg : 6.0, (d && d.cause) || 'x71+6s'));
    on('box', d => { if (d && d.moving) walkwaySchedule(0, 'first-push'); });
    on('first-push', () => walkwaySchedule(0, 'first-push'));
    on('rabbit:reach-fail', () => walkwaySchedule(0, 'reach-fail'));
    on('reach-fail', () => walkwaySchedule(0, 'reach-fail'));
    /* the door reveal's short replay (a retry after it was seen): set up once every module has reset (the restart is under
       black), and kept off when the title's Continue hands control back */
    on('restart', () => replayStart());
    on('play:start', () => { if (RV.held) FF.Game.control(false); });
    /* the end */
    /* with Sequence 2 loaded, FF.WorksFlow owns every settle: Sequence 1's rest becomes an optional pull-out that comes back
       to the player, and the card moves to the end of Sequence 2 (SEQUENCE-2.md §10; ff-works-flow.js) */
    on('end', d => { if (d && d.phase === 'settled' && !E.phase && !(FF.WorksFlow && FF.WorksFlow.ownsEnd)) { E.phase = 'hold'; E.t = 0; } });
    for (const n of ['vehicle-arrive', 'gate-lit', 'person-out', 'rabbit-in-pipe', 'walkway-timer', 'shake-off', 'safe', 'rest', 'sound-cue', 'camera-shot'])
      on(n, () => { st.beats[n] = (st.beats[n] || 0) + 1; });
  },
  reset(cp, opts) {
    st.cp = cp.id; G().checkpoint = cp.id; st.failing = null; timers.length = 0;
    if (!opts || opts.reason !== 'fail') st.beats = {};
    const f = G().flags;
    if (opts && (opts.reason === 'title' || opts.reason === 'start')) for (const k in f) delete f[k];
    /* progress flags implied by where we start (a warp or continue skips earlier beats) */
    if (cp.x > 38.5) f.vergeDone = true;
    if (cp.x > 86.0) { f.walkwayDone = true; f.amberOn = true; }
    if (cp.id !== 'search-arrive' && cp.x > 89.0) f.entryDone = true;
    /* stop any beat; restart the ones that belong after cp */
    vergeReset(!!f.vergeDone); walkwayReset(!!f.walkwayDone);
    for (const id of Object.keys(lit)) lightOff(id);
    E.phase = ''; E.t = 0;
    /* the door reveal: a restart in the middle of it (Pause -> Restart) gives control back (the failure flow and the title
       set control themselves); a new game forgets that it has run; retries never replay it (RV.done) */
    const reason = (opts && opts.reason) || 'warp';
    if (RV.held && reason !== 'fail' && reason !== 'title' && reason !== 'start') FF.Game.control(true);
    if (reason === 'title' || reason === 'start') RV.done = false;
    if (reason === 'warp') RV.seen = false;          // a warp (tests, ?cp=) starts the reveal's story afresh; a restart or a Continue does not
    Object.assign(RV, { phase: '', t: 0, cause: '', pose: '', shot: false, retT: 0, graceT: 0, held: false, glimpsed: false, cueAt: null, stopAt: null, replay: false });
    delete f.revealSafe; if (FF.Input && FF.Input.unlatch) FF.Input.unlatch();
  },
  step(dt) {
    const r = G().rabbit; if (!r) return;
    if (!st.failing) {
      vergeStep(dt); walkwayStep(dt); endStep(dt); revealStep(dt);
      /* progress checkpoints: passing x; Search checkpoints: the centre in that cover's core and the searcher not alert
         (the last core reached undetected is the restart point, in any order) */
      const list = FF.S1.checkpoints, cur = list.findIndex(k => k.id === st.cp), court = list.findIndex(k => k.id === 'courtyard'), rest = list.findIndex(k => k.id === 'rest') < 0 ? Infinity : list.findIndex(k => k.id === 'rest');
      for (let i = 0; i < list.length; i++) {
        const c = list[i]; if (c.id === st.cp) continue;
        if (searchCps.includes(c.id)) {
          const cover = FF.S1.covers.find(k => k.checkpoint === c.id);
          if (cover && cover.core && r.x >= cover.core[0] && r.x <= cover.core[1] && (!r.mode || r.mode === 'play') && !(FF.AI && FF.AI.danger && FF.AI.danger()) && cur >= court && cur < rest) setCheckpoint(c.id);   // review fixes 8 Oct: never back from the rest or the Works to a Search cover
        } else if (i > cur && r.x >= c.x && (c.y == null || Math.abs(r.y - c.y) < 0.6)) setCheckpoint(c.id);
      }
      /* search-arrive on landing from the duct (SEQUENCE-1.md §9.7; 7 Oct v2): a pause -> Restart right after the drop, or
         in the middle of the door reveal, restarts in the A0 shelf, never back at the Courtyard's box puzzle */
      const arrive = list.findIndex(k => k.id === 'search-arrive');
      if (G().place === 'search' && cur < arrive && cur >= court && (!r.mode || r.mode === 'play') && r.grounded && !(FF.AI && FF.AI.danger && FF.AI.danger())) setCheckpoint('search-arrive');
    }
  },
  /* cut to black on this step, the report or the scuff under black (Audio listens to 'fail'), restart at the checkpoint after
     FF.RULES.fail.black, the picture back over fadeIn, control at controlAt. Nothing is counted, nothing rewards harm. */
  fail(kind) {
    if (st.failing) return; const F = FF.RULES.fail;
    st.failing = { kind, t: 0 };
    FF.Game.cut(); FF.Game.control(false);
    setTimeoutSim(F.black, () => {
      FF.Game.restart(st.cp, { reason: 'fail', kind });
      FF.Game.control(false); st.failing = { kind, t: F.black, back: true };
      FF.Game.fade(0, F.fadeIn);
      setTimeoutSim(F.controlAt - F.black, () => { FF.Game.control(true); st.failing = null; });
    });
  },
  /* true while a staged beat or the failure flow runs (main holds the automatic quality step-down) */
  scripted() {
    const s = G().searcher;
    return !!st.failing || (V.on && !V.gone) || (W.on && !W.done) || !!E.phase || !!RV.phase || !!(s && s.active && (s.state === 'entry' || s.state === 'wait'));
  },
  frame(dt) {
    tickTimers(dt);
    vergeFrame(dt); walkwayFrame(dt);
  },
  /* the door reveal's state (tests and the integrator): phase '' | hold | show | return | grace; log = timings from its start */
  reveal() { return { phase: RV.phase, cause: RV.cause, done: RV.done, seen: RV.seen, held: RV.held, pose: RV.pose, t: +RV.t.toFixed(3), maxX: RV.maxX == null ? null : +RV.maxX.toFixed(3), latched: latched(), resumed: (FF.Input && FF.Input.resumed) || [], log: RV.log }; },
  /* FF.AI asks on reset: replay only the end of his entry (from the aim), briefly (see entryReplay above) */
  entryReplay,
  /* Sequence 2 (ff-works-flow.js): the shelter checkpoints, reached in any order, set the restart point here */
  setCheckpoint(id) { if (FF.Level.checkpoint(id)) setCheckpoint(id); },
  dispose() { for (const id of Object.keys(lit)) lightOff(id); },
  debug() {
    return { cp: st.cp, failing: st.failing && st.failing.kind, beats: Object.assign({}, st.beats), flags: Object.assign({}, G().flags),
      verge: { on: V.on, gone: V.gone, phase: V.phase, t: +V.t.toFixed(2), T: +V.T.toFixed(2), stopT: V.stopT == null ? null : +V.stopT.toFixed(2), van: { x: +V.van.x.toFixed(2), z: +V.van.z.toFixed(2) }, dropT: V.dropT == null ? null : +V.dropT.toFixed(2), outT: V.outT == null ? null : +V.outT.toFixed(2),
        step: V.phase === 'after' && V.q[V.qi] ? V.q[V.qi][0] : null, rattle: { on: V.rattle.on, burst: +V.rattle.burst.toFixed(2), silence: +V.rattle.silence.toFixed(2), hard: +V.rattle.hard.toFixed(2) }, person: { x: +V.p.x.toFixed(2), z: +V.p.z.toFixed(2), vis: V.p.vis, anim: V.p.anim }, torchT: +V.torchT.toFixed(2) },
      walkway: { on: W.on, done: W.done, t: +W.t.toFixed(2), at: W.at == null ? null : +W.at.toFixed(2), cause: W.cause || null, x: +W.x.toFixed(2), vis: W.vis },
      end: E.phase || null, lights: Object.keys(lit), reveal: { phase: RV.phase, cause: RV.cause, done: RV.done, seen: RV.seen, held: RV.held, pose: RV.pose, latched: latched() } };
  },
};

/* timers on presentation time (they keep running under the black, where steps are still taken) */
const timers = [];
function setTimeoutSim(sec, fn) { timers.push({ t: sec, fn }); }
function tickTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { if (!timers[i]) continue; timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { FF.report(e, 'Events.timer'); } } } }
})();
