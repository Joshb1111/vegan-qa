/* FAR FIELD — ff-player.js: FF.Player, the rabbit as a living individual: movement on the 2D lane against FF.S1 (ground
   profile, solids, the box), auto-squeeze (A9 duck-under / creep), head-push, jump, crouch, flee in the Search, the links
   (the culvert drop, the climb into the raised opening, the duct transit, the pop-out), and the behaviours (moods, ears that
   react to sounds by themselves (A2), breathing, sniff, groom, settle, hesitate, freeze, the settle chain) driving the rig.
   OWNER: the rabbit builder (with ff-rabbit.js). API contract: docs/farfield/INTERFACES.md §8.4. SKELETON: the look test's
   movement ported onto FF.S1 (ground, solids, step-up, squeeze speeds, box, jump), the duct link, flee speed; behaviours,
   the reach-fail, hesitation and every pose are the builder's. */
'use strict';
window.FF = window.FF || {};
(function () {
const U = FF.util, clamp = U.clamp, approach = U.approach;
let rig = null, ctx = null;
const S = {};                     // the rabbit's state; FF.G.rabbit points at it (read-only for other modules)
const box = { x: 0, vx: 0, w: 0.52, h: 0.44, d: 0.5, minX: -1e9, maxX: 1e9 };
const RB = () => FF.RULES.rabbit;
const FLEE_STATES = { spotted: 1, aim: 1, pursue: 1, grab: 1, lower: 1 };

function boxSpan() { return { x0: box.x - box.w / 2, x1: box.x + box.w / 2, y0: 0, y1: box.h }; }
function floorAt(x, y) {
  let f = FF.Level.floorUnder(x, RB().hw * 0.9, y, 0.03);
  const b = boxSpan(); if (x + RB().hw * 0.5 > b.x0 && x - RB().hw * 0.5 < b.x1 && y >= b.y1 - 0.03 && b.y1 > f) f = b.y1;
  return f;
}
function heightNow() { return S.crouch ? RB().hCrouch : RB().h; }
function fleeing() { const s = FF.G.searcher; return !!(s && FLEE_STATES[s.state] && Math.abs((s.x || 0) - S.x) <= RB().fleeWithin); }

const Player = FF.Player = {
  stub: true,
  async init(c) {
    ctx = c;
    rig = await FF.Rabbit.create(FF.LOOK, { file: FF.MODELS.rabbit });
    rig.object.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    c.scene.add(rig.object);
    FF.G.rabbit = S; FF.G.box = box;
  },
  get rig() { return rig; },
  reset(cp) {
    const p = FF.S1.pushables[0];
    Object.assign(box, { x: p.x, vx: 0, w: p.w, h: p.h, d: p.d, minX: p.minX, maxX: p.maxX });
    Object.assign(S, { x: cp.x, y: cp.y || 0, z: 0, vx: 0, vy: 0, face: cp.face || 1, grounded: true, crouch: cp.pose === 'hide', squeeze: null, onBox: false, push: false, effort: 0,
      holdT: 0, holdDir: 0, airT: 0, landed: false, cut: false, coyote: 0, buf: 0, yaw: Math.PI / 2 * (cp.face || 1), mode: 'play', modeT: 0,
      mood: cp.pose === 'hide' ? 'afraid' : 'calm', pose: cp.pose || null, still: 0, visible: true });
    S.y = floorAt(S.x, S.y + 0.05);
  },
  /* the 3 sight points in world x/y (FF.RULES.rabbit.samples; crouched set when crouched, squeezing or under a low ceiling) */
  sightPoints() {
    const low = S.crouch || FF.Level.ceilingAbove(S.x, RB().hw, S.y) - S.y < RB().lowPoseUnder;
    return (low ? RB().samples.crouch : RB().samples.stand).map(([dx, dy]) => [S.x + dx * S.face, S.y + dy]);
  },
  step(dt) {
    const G = FF.G, In = FF.Input, R = RB(); S.landed = false; S.modeT += dt;
    if (S.mode !== 'play') { stepLink(dt); return; }
    const ctl = G.control;
    const dir = ctl ? In.axis() : 0;
    const up = ctl && In.took('up'), jumpP = ctl && In.took('jump');
    /* the raised opening: Up or Space on the box under it climbs in */
    const duct = FF.S1.links.find(l => l.id === 'duct');
    if ((up || jumpP) && S.onBox && Math.abs(S.x - duct.from.x) < R.climbIn.maxDx) { S.mode = 'climb'; S.modeT = 0; S.vx = 0; G.control = false; FF.bus.emit('transit', { phase: 'climb' }); return; }

    /* crouch: held, or forced by a low ceiling; squeeze speeds (A9) */
    const sq = FF.Level.squeezeAt(S.x + dir * 0.03, R.hw, S.y); S.squeeze = sq;
    const want = ctl && In.down('down') && S.grounded;
    if (want || sq) S.crouch = true; else if (S.crouch && FF.Level.ceilingAbove(S.x, R.hw, S.y) - S.y >= R.h) S.crouch = false;

    if (dir !== S.holdDir) { S.holdDir = dir; S.holdT = 0; } else if (dir) S.holdT += dt;
    const flee = fleeing();
    let top = flee ? R.flee : R.walk + (R.run - R.walk) * clamp((S.holdT - R.runAfter) / R.runRamp, 0, 1);
    if (ctl && In.down('walk') && !flee) top = R.walk;
    if (S.crouch) top = R.crouch;
    if (sq) top = sq.short ? (flee ? R.duckUnder.fleeSpeed : R.duckUnder.speed) : R.creep.speed;
    const tgt = dir * top;
    const a = !S.grounded ? R.airAccel : dir === 0 ? R.decel : (S.vx * dir < -0.05 ? R.turn : (Math.abs(S.vx) > top ? R.decel : R.accel * (flee ? 1.2 : 1)));
    S.vx = approach(S.vx, tgt, a * dt); if (dir) S.face = dir;

    /* the box: slides only when pushed; friction stops it; it cannot climb a step >= maxStep (the lip and kerb) */
    const pushing = S.push && dir === Math.sign(box.x - S.x) && S.grounded;
    if (!pushing) box.vx = approach(box.vx, 0, FF.RULES.box.friction * dt);
    if (box.vx) {
      const nx = clamp(box.x + box.vx * dt, box.minX, box.maxX); const s = FF.Level.hitSolid(nx - box.w / 2, nx + box.w / 2, FF.RULES.box.maxStep, box.h);
      if (s || nx !== box.x + box.vx * dt) { box.vx = 0; if (!s) box.x = nx; } else box.x = nx;
      if (S.onBox) S.x += box.vx * dt;
    }

    /* move x against the solids (step up <= stepUp), the ground profile and the box */
    S.push = false;
    let nx = S.x + S.vx * dt; const h = heightNow();
    const hit = FF.Level.hitSolid(nx - R.hw, nx + R.hw, S.y + 0.001, S.y + h);
    if (hit) {
      if (S.grounded && hit.y1 - S.y <= R.stepUp && FF.Level.ceilingAbove(nx, R.hw, hit.y1) - hit.y1 >= R.hCrouch) S.y = hit.y1;
      else { nx = S.vx > 0 ? hit.x0 - R.hw - 1e-4 : hit.x1 + R.hw + 1e-4; S.vx = 0; }
    }
    const lead = nx + R.hw * Math.sign(S.vx || S.face);
    if (S.vx && FF.Level.groundY(lead) > S.y + R.stepUp + 1e-3) { nx = S.x; S.vx = 0; }
    const b = boxSpan();
    if (nx + R.hw > b.x0 && nx - R.hw < b.x1 && S.y + h > b.y0 + 0.001 && S.y < b.y1 - 0.02) {
      const side = S.x < box.x ? -1 : 1;
      nx = side < 0 ? b.x0 - R.hw - 1e-4 : b.x1 + R.hw + 1e-4;
      if (S.grounded && dir === -side && !S.crouch) { S.push = true; box.vx = approach(box.vx, dir * FF.RULES.box.push, FF.RULES.box.accel * dt); S.vx = box.vx; }
      else S.vx = 0;
    }
    S.x = nx;
    S.effort = approach(S.effort, S.push ? (Math.abs(box.vx) < 0.15 ? 1 : 0.5) : 0, 4 * dt);

    /* jump: buffered presses, coyote time, a cut when released early; no jumping while squeezed */
    if (jumpP || up) S.buf = R.buffer; else S.buf = Math.max(0, S.buf - dt);
    S.coyote = S.grounded ? R.coyote : Math.max(0, S.coyote - dt);
    if (S.buf > 0 && S.coyote > 0 && !S.crouch) { S.vy = Math.sqrt(2 * R.gravity * R.jumpHeight); S.grounded = false; S.coyote = 0; S.buf = 0; S.airT = 0; S.cut = false; S.onBox = false; }
    if (!S.grounded && S.vy > 0 && !(ctl && (In.down('jump') || In.down('up'))) && !S.cut) { S.vy *= R.jumpCut; S.cut = true; }

    /* move y: follow the ground down slopes, fall, land on floors and the box top, bump heads */
    const wasG = S.grounded;
    if (S.grounded && S.vy <= 0) { const f = floorAt(S.x, S.y + 0.02); if (f >= S.y - 0.12) { S.y = f; S.vy = 0; } else S.grounded = false; }
    if (!S.grounded) {
      S.vy -= R.gravity * (S.vy < 0 ? R.fallGravity : 1) * dt;
      let ny = S.y + S.vy * dt; const f = floorAt(S.x, S.y + 0.001);
      if (S.vy <= 0 && ny <= f) { ny = f; S.grounded = true; S.vy = 0; }
      const c = FF.Level.ceilingAbove(S.x, R.hw, S.y + 0.01); if (S.vy > 0 && ny + h > c) { ny = c - h - 1e-4; S.vy = 0; }
      S.y = ny;
    }
    const bb = boxSpan(); S.onBox = S.grounded && Math.abs(S.y - bb.y1) < 0.01 && S.x > bb.x0 - R.hw * 0.5 && S.x < bb.x1 + R.hw * 0.5;
    if (S.grounded && !wasG) { S.landed = true; FF.bus.emit('rabbit:land', { x: S.x, y: S.y }); }
    if (!S.grounded) S.airT += dt;
    S.still = Math.abs(S.vx) < 0.05 && S.grounded ? S.still + dt : 0;
  },
  frame(dt) {
    if (!rig) return;
    let yawT = Math.PI / 2 * S.face; if (S.mode === 'climb' && S.modeT > 0.12) yawT = Math.PI;
    S.yaw += (yawT - S.yaw) * (1 - Math.exp(-dt * 16));
    rig.object.visible = S.visible !== false;
    rig.object.position.set(S.x, S.y, S.z); rig.object.rotation.y = S.yaw;
    rig.update(dt, { speed: Math.abs(S.vx), vx: S.vx, vy: S.vy, grounded: S.grounded || S.mode !== 'play', crouch: S.crouch, push: S.push, effort: S.effort, landed: S.landed, airT: S.airT });
    if (FF.World && FF.World.prop) FF.World.prop('box').position.set(box.x, 0, 0);
    const L = FF.LOOK; FF.setAOBox(0, [box.x, box.h / 2, 0], [box.w / 2, box.h / 2, box.d / 2], L.ao.objects, L.ao.objectReach);
    const ground = floorAt(S.x, S.y + 0.02), air = Math.max(0, S.y - ground);
    FF.U.uFFRab.value.set(S.x, ground, S.z, S.visible === false ? 0 : L.ao.rabbit * Math.exp(-air * 7));
  },
  /* scripted poses other modules may ask for (the builder implements them): 'groom', 'hide', 'look-back', 'settle', ... */
  setPose(name) { S.pose = name; },
  dispose() {},
  debug() { return { stub: true, x: +S.x.toFixed(3), y: +S.y.toFixed(3), vx: +S.vx.toFixed(3), mode: S.mode, crouch: S.crouch, squeeze: S.squeeze ? S.squeeze.solid.id : null, onBox: S.onBox, box: +box.x.toFixed(3), mood: S.mood, pose: S.pose }; },
};

/* the duct link: climb in (0.8 s), inside the wall (3.8 s, the camera dollies), pop out, sniff, hop down; control returns */
function stepLink(dt) {
  const d = FF.S1.links.find(l => l.id === 'duct'), t = S.modeT;
  if (S.mode === 'climb') {
    S.x += (d.from.x - S.x) * Math.min(1, dt * 6); S.y = U.lerp(box.h, d.from.sill, U.clamp(t / d.climbIn, 0, 1)); S.z = -0.45 * U.clamp(t / d.climbIn, 0, 1);
    if (t >= d.climbIn) { S.mode = 'transit'; S.modeT = 0; S.visible = false; FF.bus.emit('transit', { phase: 'start' }); }
  } else if (S.mode === 'transit') {
    S.x = U.lerp(d.from.x, d.to.x, U.clamp(t / d.transit, 0, 1)); S.y = d.to.sill;
    if (t >= d.transit) { S.mode = 'popout'; S.modeT = 0; S.visible = true; S.x = d.to.x; S.z = -0.45; S.face = 1; S.yaw = Math.PI / 2; }
  } else if (S.mode === 'popout') {
    const k = U.clamp((t - d.popOut - d.sniff) / d.hopDown, 0, 1);
    S.z = U.lerp(-0.45, 0, U.clamp(t / d.popOut, 0, 1)); S.x = U.lerp(d.to.x, d.landX, k); S.y = d.to.sill * (1 - k) + Math.sin(Math.PI * k) * 0.1;
    if (t >= d.popOut + d.sniff + d.hopDown) {
      S.mode = 'play'; S.modeT = 0; S.y = 0; S.z = 0; S.grounded = true; S.vx = 0; FF.G.control = true;
      FF.bus.emit('transit', { phase: 'end' }); FF.bus.emit('search-entry', { id: 'arrive-yard', arg: 1.5, x: S.x });
    }
  }
}
})();
