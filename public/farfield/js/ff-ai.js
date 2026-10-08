/* FAR FIELD — ff-ai.js: FF.AI, the searcher (beat 3): the entry (first time only) and his fixed 47.85 s routine
   (FF.S1.searcher), perception by the ONE detection model (A6), suspicion, and every reaction, each telegraphed with a
   reaction window (docs/farfield/SEQUENCE-1.md §9 as amended):
     patrol / entry --(s >= 0.35)--> NOTICE: he stops dead, the footsteps stop, the head turns, the torch drifts onto the
       last lit point at 40 deg/s. s < 0.15 -> INVESTIGATE (walks to the point, sweeps 4 s, rejoins the loop).
     s = 1 -> SPOTTED: 0.6 s reaction (straightens, the torch snaps on, a sharp breath), then
       closer than 2.5 m -> GRAB (0.45 s lean, then a 0.7 m reach from a hand 0.4 m ahead) |
       2.5-10 m and visible -> AIM (0.5 s raise: the beam narrows 13 -> 5 deg and stops wobbling; the click; 1.0 s hold;
       the shot) | else PURSUE (runs 2.6 m/s to the last-seen point; re-aims only after 1.0 s of pursuit and 0.4 s of
       unbroken sight; grabs within 1.2 m after a 0.3 s lean).
     Line of sight broken for 0.2 s (in a core, behind a solid, beyond 10 m, through the gap) cancels the aim -> LOWER (0.5 s)
       -> pursue. A rabbit that went into a hide while seen gets the HIDE CHECK (kneel 1.0 s at the nearer end he can reach,
       reach 0.6 s an arm's depth: 0.65 m, 1.0 m under the deck); in a core the hand falls short (A11), a 1.5 s held breath,
       then LOST (sweeps 4 s) -> WARY for 20 s (slower, wider sweeps, an extra look back at each end) -> the loop.
     TOUCH (walking into his legs: same floor, 0.6 m in front / 0.3 m behind, a line of sight) -> GRAB with the normal 0.45 s
       wind-up (A6). The rabbit in the fence gap while he is alert -> GAP: he runs to 112.4, kneels, shines under the fence
       1.5 s, shakes the sheet once, walks back into the loop.
   'fail' {kind: 'caught'|'shot', x} is emitted on the exact step of the grab or the shot; he then freezes until the restart.
   The detection model FF.AI.see() is pure and shared with tools/check-search.mjs (so the game and the checker cannot drift).
   Debug: window.__ff.ai (FF.AI.debug()): state, s, lit, litBy, timers (reaction, aim, grab, hide check), lastSeen.
   OWNER: the humans + events builder. API contract: docs/farfield/INTERFACES.md §8.6. Loadable in node (no THREE at load). */
'use strict';
window.FF = window.FF || {};
(function () {
const U = FF.util, D2R = Math.PI / 180;
const RS = () => FF.RULES.searcher, RT = () => FF.RULES.sight;
/* touch.stillBelow (a rabbit slower than this that HE walks into makes him stop dead first) is folded into ff-rules.js. */

/* ================================================================== the routine as timed segments (pure; shared with the checker) */
function build(list, startNode) {
  const N = FF.S1.searcher.nodes, segs = []; let at = N[startNode].slice(), t0 = 0;
  for (const a of list) {
    const kind = a[0]; let seg;
    if (typeof a[1] === 'string') {                           // a move: [kind, node, speed (walk-*) | seconds (climb, descend)]
      const to = N[a[1]].slice(), dx = to[0] - at[0];
      seg = { kind, dur: /^walk/.test(kind) ? Math.abs(dx) / a[2] : a[2], from: at, to, face: Math.sign(dx) || -1, speed: /^walk/.test(kind) ? a[2] : Math.abs(dx) / a[2], node: a[1] };
      at = to;
    } else {                                                  // in place: [kind, seconds, node (the entry: where) | 'left' | 'right', note]
      const dur = a[1], arg = a[2];
      if (arg && N[arg]) { const to = N[arg].slice(); seg = { kind, dur, from: at, to, face: -1, speed: Math.hypot(to[0] - at[0], to[2] - at[2]) / dur, node: arg }; at = to; }
      else seg = { kind, dur, from: at.slice(), to: at.slice(), face: arg === 'right' ? 1 : -1, speed: 0 };
    }
    seg.t0 = t0; t0 += seg.dur; segs.push(seg);
  }
  /* turns: the facing before and after (they swing through the camera side) */
  for (let i = 0; i < segs.length; i++) if (segs[i].kind === 'turn') { segs[i].fromFace = i > 0 ? (segs[i - 1].kind === 'aim-demo' ? 1 : segs[i - 1].face) : -1; segs[i].toFace = -segs[i].fromFace; }
  for (const s of segs) if (s.kind === 'turn-sweep') s.fromFace = 1;
  return segs;
}
const total = segs => segs.reduce((a, s) => a + s.dur, 0);
/* the searcher's pose at time t into a segment list. swayT: the clock for the torch's walking sway (default t).
   Returns the 2D pose for see() plus presentation hints (anim, speed, yaw, z). Mirrors the amended checker's searcherAt(). */
function sample(segs, t, swayT) {
  let tt = t; const R = FF.RULES.sight.torch, sw = swayT == null ? t : swayT;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (tt <= s.dur || i === segs.length - 1) {
      const u = U.clamp(tt / Math.max(1e-6, s.dur), 0, 1);
      const p = { kind: s.kind, seg: i, segT: tt, x: U.lerp(s.from[0], s.to[0], u), y: U.lerp(s.from[1], s.to[1], u), z: U.lerp(s.from[2], s.to[2], u), face: s.face,
        pitch: R.pitchWalk + R.sway * Math.sin(2 * Math.PI * R.swayHz * sw), half: R.half, kneel: false, torchOn: true, visible: true,
        anim: 'idle', speed: 0, yaw: null, aim: 0 };
      switch (s.kind) {
        case 'walk-search': p.anim = 'walk-search'; p.speed = s.speed; break;
        case 'walk-patrol': p.anim = 'walk'; p.speed = s.speed; break;
        case 'climb': p.anim = 'climb'; p.speed = 1.0; break;
        case 'descend': p.anim = 'descend'; p.speed = 1.0; break;
        case 'turn': { p.torchOn = false; p.face = 0; const k = U.ease.inOutSine(u); p.yaw = U.lerp(s.fromFace * Math.PI / 2, s.toFace * Math.PI / 2, k); p.anim = 'turn'; p.speed = 0.6; break; }
        case 'look': p.pitch = R.pitchLook; p.anim = 'idle'; break;
        case 'sweep-left': p.pitch = U.lerp(-35, -8, u); break;
        case 'aim-demo': {
          p.face = 1; p.pitch = -22; p.anim = 'aim';
          const raise = 0.5, hold = 1.0; p.aim = tt < raise ? tt / raise : tt < raise + hold ? 1 : Math.max(0, 1 - (tt - raise - hold) / 0.5);
          p.half = U.lerp(R.half, R.aimHalf, U.clamp(tt / raise, 0, 1)); if (tt > raise + hold) p.half = U.lerp(R.aimHalf, R.half, U.clamp((tt - raise - hold) / 0.5, 0, 1));
          p.half = R.aimHalf;   // the 2D model (checker) holds 5 deg through the whole demo
          break; }
        case 'turn-sweep':
          if (tt < 1.0) { p.torchOn = false; p.face = 0; p.yaw = U.lerp(Math.PI / 2, -Math.PI / 2, U.ease.inOutSine(tt)); p.anim = 'turn'; p.speed = 0.6; }
          else p.pitch = U.lerp(-35, -8, Math.sin(Math.PI * (tt - 1.0) / 2.0));
          break;
        case 'crouch-look':
          if (tt < 0.3) p.pitch = -20;
          else if (tt < 1.1) { p.pitch = -24; p.anim = 'crouch-look'; }
          else if (tt < 2.7) { p.kneel = true; p.pitch = R.pitchKneel; p.anim = 'crouch-look'; }
          else p.pitch = -20;
          break;
        case 'cue': p.torchOn = false; p.visible = false; break;
        case 'doorway': p.yaw = -0.75; p.anim = 'idle'; break;                 // three-quarters to the yard: the torch arm and the beam agree
        case 'step-in': p.anim = 'walk-search'; p.speed = s.speed; p.yaw = U.lerp(-0.75, -Math.PI / 2, U.sstep(0.0, 0.7, u)); break;
      }
      return p;
    }
    tt -= s.dur;
  }
  return null;
}

/* ================================================================== A6: the reference detection model (pure)
   pose { x, y, face (-1 | 0 turning | 1), kneel, torchOn, pitch (deg), half (deg) }; pts = the rabbit's 3 sight points [[x, y]];
   opts { doorOpen, floorY (the rabbit's floor), cx (rabbit centre x, default pts[1][0]), only: 'torch' (the checker's hide audit),
          areas (Sequence 2: the area lights to use instead of FF.S1.areaLights, e.g. the Works painter's lamp spill) }.
   -> { w (seen weight 0..1), src 'touch' | 'torch' | 'area' | 'dark' | '', d (m) }
   A sight point counts only if the straight line from the source (the lens for torch light, the eye for everything else)
   crosses no occluder: solid cover blocks completely, darkness only shortens the range (A6). While he turns (face 0) the
   torch lights nothing (it swings through the camera side) but close range and touch still count, in front distances. */
function see(pose, pts, opts) {
  opts = opts || {}; const S = FF.RULES.sight, R = S.torch, L = FF.Level;
  if (!pose || !pts || !pts.length) return { w: 0, src: '', d: 99 };
  const fy = opts.floorY || 0, cx = opts.cx != null ? opts.cx : pts[1][0], f = pose.face || 0, fs = f || 1;
  const lens = { x: pose.x + (pose.kneel ? R.kneelFwd : R.fwd) * fs, y: pose.y + (pose.kneel ? R.kneelH : R.h) };
  const eye = { x: pose.x, y: pose.y + (pose.kneel ? S.kneelEye : S.eye) };
  const d = Math.abs(cx - pose.x), behind = f !== 0 && (cx - pose.x) * f < 0;
  const losEye = pts.map(([px, py]) => !L.segmentBlocked(eye.x, eye.y, px, py)), anyLOS = losEye.some(Boolean);
  /* touch: walking into his legs (same floor, a line of sight) */
  if (!opts.only && anyLOS && Math.abs(fy - pose.y) < S.touch.sameFloor && d <= (behind ? S.touch.behind : S.touch.front)) return { w: 1, src: 'touch', d };
  /* every term that applies is a candidate; the one that fills suspicion fastest counts (being lit is never slower to notice
     than darkness at the same range) */
  let best = null; const take = c => { const r = c.w / fillTime(c.src, c.d); if (!best || r > best.r) best = Object.assign(c, { r }); };
  /* torch: in the beam, in range, unblocked from the lens */
  if (pose.torchOn && f) {
    let lit = 0;
    for (const [px, py] of pts) {
      const dx = px - lens.x, dy = py - lens.y;
      if (Math.hypot(dx, dy) > R.range || dx * f <= 0) continue;
      const ang = Math.atan2(dy, Math.abs(dx)) / D2R; if (Math.abs(ang - pose.pitch) > (pose.half || R.half)) continue;
      if (!L.segmentBlocked(lens.x, lens.y, px, py)) lit++;
    }
    if (lit) take({ w: lit / pts.length, src: 'torch', d: Math.hypot(cx - lens.x, fy + 0.12 - lens.y) });
  }
  if (opts.only === 'torch') return best ? { w: best.w, src: best.src, d: best.d } : { w: 0, src: '', d };
  /* area light (door spill, floodlight): he faces the rabbit within range, a clear line from the eye */
  if (f && (cx - pose.x) * f > 0 && d <= S.area.range && !L.segmentBlocked(eye.x, eye.y, cx, fy + 0.15)) for (const a of (opts.areas || FF.S1.areaLights)) {
    if ((a.on === 'always' || (a.on === 'door-open' && opts.doorOpen)) && cx >= a.x0 && cx <= a.x1) { take({ w: S.area.weight, src: 'area', d }); break; }
  }
  /* darkness at close range (A6): never ignored within dark.front in front of him (dark.behind behind); still telegraphed */
  if (anyLOS && d <= (behind ? S.dark.behind : S.dark.front)) take({ w: S.dark.weight, src: 'dark', d });
  if (best) return { w: best.w, src: best.src, d: best.d };
  return { w: 0, src: '', d };
}
/* once he is alert (SPOTTED, AIM, PURSUE, LOWER, the hide check): can he still see it to aim and chase? (pure; the checker's
   pursuit model uses this same function). Not in a core (every core is a refuge, A11), not through the gap, within the torch's
   10 m, and a clear line from his lens (turned towards the rabbit) to the body's centre sight point (A6's centre sample:
   standing (x, 0.20), crouched (x, 0.12)). pose { x, y, kneel }, r { x, y, crouch }. */
function seeAlert(pose, r) {
  const S = FF.RULES.sight, R = S.torch, RB = FF.RULES.rabbit, L = FF.Level;
  if (!pose || !r) return false;
  const gap = FF.S1.covers.find(c => c.exit), gx = gap ? gap.core[0] : 113.15;
  if (r.x >= gx || L.coreAt(r.x)) return false;
  if (Math.abs(r.x - pose.x) > R.range) return false;
  const low = r.crouch || L.ceilingAbove(r.x, RB.hw, r.y || 0) - (r.y || 0) < RB.lowPoseUnder;
  const cy = (r.y || 0) + (low ? RB.samples.crouch[1][1] : RB.samples.stand[1][1]), dir = Math.sign(r.x - pose.x) || 1;
  const lx = pose.x + (pose.kneel ? R.kneelFwd : R.fwd) * dir, ly = (pose.y || 0) + (pose.kneel ? R.kneelH : R.h);
  return !L.segmentBlocked(lx, ly, r.x, cy);
}
/* suspicion fill time for a seen weight: torch / area 0.9 s near -> 1.6 s at 10 m; darkness 0.8 s (NOTICE at 0.28 s) */
function fillTime(src, d) { const F = FF.RULES.sight.fill; if (src === 'dark') return FF.RULES.sight.dark.t; if (src === 'touch') return 1e-3; return U.lerp(F.tNear, F.tFar, U.clamp((d - F.dNear) / (F.dFar - F.dNear), 0, 1)); }

/* ================================================================== where he can go (the yard as three levels)
   floor (right): x 98.0 .. 112.6 (he cannot walk under the deck; the fence at 113) · deck: 92.0 .. 98.0 at y 0.85 (the steps
   98.0 <-> 99.4 behind the lane, 1.4 s) · floor (left strip): 90.0 .. 92.0, only by stepping down off the deck's left end
   (0.8 s; back up 1.2 s). Never the arrival nook (x < 90). */
const DECK_Y = 0.85;
const LV = { floorR: [98.0, 112.6], deck: [92.0, 98.0], floorL: [90.0, 92.0] };
const levelOf = (x, y) => y > 0.4 ? 'deck' : x < 92.5 ? 'floorL' : 'floorR';
const yOf = lv => lv === 'deck' ? DECK_Y : 0;
/* the reachable spot nearest a lane point (for chasing / investigating a point he cannot stand on) */
function reachFor(x) { if (x >= 98.0) return { x: Math.min(x, LV.floorR[1]), lv: 'floorR' }; if (x >= 92.0) return { x, lv: 'deck' }; return { x: Math.max(x, LV.floorL[0]), lv: 'floorL' }; }
/* path cost (seconds at speed v) from (x, lv) to (tx, tlv) */
function pathCost(x, lv, tx, tlv, v) {
  if (lv === tlv) return Math.abs(tx - x) / v;
  const leg = (a, b) => Math.abs(b - a) / v;
  if (lv === 'floorR' && tlv === 'deck') return leg(x, 99.4) + 1.4 + leg(98.0, tx);
  if (lv === 'deck' && tlv === 'floorR') return leg(x, 98.0) + 1.4 + leg(99.4, tx);
  if (lv === 'deck' && tlv === 'floorL') return leg(x, 92.0) + 0.8 + leg(91.6, tx);
  if (lv === 'floorL' && tlv === 'deck') return leg(x, 91.8) + 1.2 + leg(92.2, tx);
  if (lv === 'floorR' && tlv === 'floorL') return leg(x, 99.4) + 1.4 + leg(98.0, 92.0) + 0.8 + leg(91.6, tx);
  if (lv === 'floorL' && tlv === 'floorR') return leg(x, 91.8) + 1.2 + leg(92.2, 98.0) + 1.4 + leg(99.4, tx);
  return 99;
}

/* ================================================================== state */
let fig = null, entry = [], loop = [], LOOP_T = 47.85, ENTRY_T = 8.0, clock = 0;
const ST = { active: false, state: 'off', x: 110, y: 0, z: -1.15, face: -1, pitch: -20, half: 13, kneel: false, torchOn: false, kind: '', loopT: null, entryT: null,
  s: 0, lit: 0, litBy: '', aim: 0, wary: 0, startIn: -1 };
const I = {
  mode: 'off', modeT: 0, frozen: false, entryT: 0, loopT: 0,
  p: { x: 110, y: 0, z: -1.15, face: -1, yaw: null, anim: 'idle', speed: 0, pitch: -20, half: 13, kneel: false, torchOn: false, aim: 0, lean: 0, reach: 0, head: null, visible: false, torchPitchVis: null },
  grace: 0, lastLit: null, lastSeen: null, seenT: 99, visT: 0, losT: 0, pursueT: 0, v: 0,
  grabWind: 0.45, react: 0, hide: null, hidePhase: '', sweepT: 0, insert: null, ret: null, gapPhase: '', move: null, gait: 0, stepAcc: 0, lastX: null, lastY: 0,
  doorOpen: false, entryPhase: '', drift: 0, aimClicked: false, fails: 0, cueTimer: 0,
};
const DANGER = { notice: 1, spotted: 1, aim: 1, lower: 1, pursue: 1, grab: 1, hidecheck: 1 };

function setMode(m, why) {
  if (I.mode === m) return; const from = I.mode; I.mode = m; I.modeT = 0;
  const r = FF.G.rabbit; ST.state = m === 'patrol' && ST.wary > 0 ? 'wary' : m;
  FF.bus.emit('ai:state', { from, to: ST.state, x: +I.p.x.toFixed(2), d: r ? +Math.abs(r.x - I.p.x).toFixed(2) : null, why: why || '' });
}
const rabbit = () => FF.G.rabbit;
const rabbitStill = () => { const r = FF.G.rabbit; return !!r && Math.abs(r.vx || 0) < (RT().touch.stillBelow || 0.3); };
/* THE DOOR REVEAL (Josh's playtest, 7 Oct §9.5): while FF.Events has control off and through its grace (G.flags.revealSafe)
   the rabbit cannot be seen, touched, tracked or grabbed: he is given no sight points at all. Geometry already keeps the
   rabbit 19+ m from him throughout (tested: suspicion stays 0); this makes it a guarantee. */
const revealSafe = () => !!(FF.G && FF.G.flags && FF.G.flags.revealSafe);
function rabbitPts() { return !revealSafe() && FF.Player && FF.Player.sightPoints ? FF.Player.sightPoints() : null; }
/* can he see the rabbit at all right now (for tracking once alert)? Not in a core (every core is a refuge, A11), not through
   the gap, within 10 m, and a clear line from his eye or lens to any sight point. */
function trackVisible() {
  const r = rabbit(); if (!r || r.visible === false || (r.mode && r.mode !== 'play') || revealSafe()) return false;
  return seeAlert(I.p, r);
}
const gapCore = () => { const g = FF.S1.covers.find(c => c.exit); return g ? g.core[0] : 113.15; };
function pitchTo(px, py) { const p = I.p, lx = p.x + (p.kneel ? RT().torch.kneelFwd : RT().torch.fwd) * (p.face || 1), ly = p.y + (p.kneel ? RT().torch.kneelH : RT().torch.h); return Math.atan2(py - ly, Math.abs(px - lx) + 1e-3) / D2R; }
function faceToward(x) { const f = Math.sign(x - I.p.x); if (f && f !== I.p.face) { I.p.face = f; } }
function sound(cue, o) { FF.bus.emit('sound', Object.assign({ cue, x: +I.p.x.toFixed(2), y: +I.p.y.toFixed(2), z: +I.p.z.toFixed(2), who: 'searcher' }, o || {})); }
function prop(id) { return FF.World && FF.World.prop ? FF.World.prop(id) : null; }

/* ---------------------------------------------------------------- movement along the yard's levels */
function moveTo(tx, tlv, speed, dt, accel) {
  const p = I.p;
  if (I.move) {                                      // a transition in progress (steps, step-down, scramble up)
    const m = I.move; m.t += dt; const u = U.clamp(m.t / m.dur, 0, 1);
    p.x = U.lerp(m.x0, m.x1, u); p.y = U.lerp(m.y0, m.y1, m.kind === 'step-down' ? u * u : u); p.anim = m.kind; p.speed = Math.abs(m.x1 - m.x0) / m.dur + 0.4;
    p.face = Math.sign(m.x1 - m.x0) || p.face;
    if (u >= 1) I.move = null; return false;
  }
  const lv = levelOf(p.x, p.y);
  let wx = tx; let trans = null;
  if (lv !== tlv) {
    if (lv === 'floorR') { wx = 99.4; trans = { kind: 'climb', x1: 98.0, y1: DECK_Y, dur: 1.4 }; }
    else if (lv === 'floorL') { wx = 91.8; trans = { kind: 'climb', x1: 92.2, y1: DECK_Y, dur: 1.2 }; }
    else if (tlv === 'floorR' || (tlv === 'floorL' ? false : true)) { wx = 98.0; trans = { kind: 'descend', x1: 99.4, y1: 0, dur: 1.4 }; }
    if (lv === 'deck' && tlv === 'floorL') { wx = 92.0; trans = { kind: 'step-down', x1: 91.6, y1: 0, dur: FF.RULES.searcher.deckStepDown }; }
  }
  const range = LV[lv]; wx = U.clamp(wx, range[0], range[1]);
  const dx = wx - p.x, dir = Math.sign(dx);
  I.v = accel ? U.approach(I.v, speed, accel * dt) : speed;
  if (Math.abs(dx) <= I.v * dt + 1e-4) {
    p.x = wx;
    if (trans) { I.move = { kind: trans.kind, t: 0, dur: trans.dur, x0: p.x, y0: p.y, x1: trans.x1, y1: trans.y1 }; return false; }
    p.speed = 0; return true;
  }
  p.x += dir * I.v * dt; p.face = dir; p.speed = I.v;
  return false;
}

/* ---------------------------------------------------------------- footsteps (silence when he stops: the NOTICE cue) */
function footsteps(dt) {
  const p = I.p;
  if (I.lastX == null) { I.lastX = p.x; I.lastY = p.y; }
  const moved = Math.hypot(p.x - I.lastX, p.y - I.lastY) + (p.anim === 'turn' ? 0.6 * dt : 0); I.lastX = p.x; I.lastY = p.y;
  if (!p.visible && I.mode !== 'entry') return;
  const sp = p.anim === 'turn' ? 0.6 : Math.max(p.speed, 0.01), running = p.anim === 'run';
  const rate = running ? 2.8 : sp <= 1.0 ? 1.6 : sp <= 1.3 ? U.lerp(1.6, 1.9, (sp - 1.0) / 0.3) : U.lerp(1.9, 2.8, U.clamp((sp - 1.3) / 1.3, 0, 1));
  const stride = Math.max(0.2, sp / rate);
  if (moved > 0) { I.stepAcc += moved / stride; I.gait += moved / stride; }
  /* Audio derives his footsteps from G.searcher's movement (silent the moment he stops); the gait keeps the legs in step */
  if (I.stepAcc >= 1) I.stepAcc -= 1;
}

/* ---------------------------------------------------------------- the loop's anchors (where he can rejoin it) */
function anchors() {
  const out = [];
  loop.forEach((s, i) => { if (/^walk|crouch-look|look|turn-sweep|climb|descend/.test(s.kind)) out.push({ i, t: s.t0, x: s.from[0], lv: levelOf(s.from[0], s.from[1]), kind: s.kind }); });
  return out;
}
function planReturn() {
  const p = I.p, lv = levelOf(p.x, p.y); let best = null;
  for (const a of anchors()) { const c = pathCost(p.x, lv, a.x, a.lv, 1.0) + (a.kind === 'look' || a.kind === 'crouch-look' ? 1.5 : 0); if (!best || c < best.c) best = { c, a }; }
  I.ret = best ? best.a : { t: 0, x: 110, lv: 'floorR' };
}

/* ---------------------------------------------------------------- perception */
function perceive(dt, calm) {
  const r = rabbit(), pts = rabbitPts(); let e = { w: 0, src: '', d: 99 };
  const p = I.p;
  if (r && pts && r.visible !== false && (!r.mode || r.mode === 'play') && r.x < gapCore() && p.visible) {
    e = see({ x: p.x, y: p.y, face: p.face0 != null ? p.face0 : p.face, kneel: p.kneel, torchOn: p.torchOn, pitch: p.pitch, half: p.half }, pts, { doorOpen: I.doorOpen, floorY: r.y, cx: r.x });
  }
  /* TOUCH by his own movement: a rabbit sitting still that he walks into makes him stop dead (NOTICE at once), then the
     close-range rule fills with its telegraph. Only a rabbit that runs into his legs gets the lunge at once (A6). Tested: a
     first-timer could not react inside the bare 0.45 s when it was his movement, not theirs. The checker models the same. */
  if (calm && e.src === 'touch' && rabbitStill()) { e = { w: FF.RULES.sight.dark.weight, src: 'dark', d: e.d, still: true }; ST.s = Math.max(ST.s, RT().fill.notice); }
  ST.lit = e.w; ST.litBy = e.src;
  if (!calm) return e;
  const F = RT().fill;
  if (e.w > 0 && e.src !== 'touch') { ST.s = Math.min(1, ST.s + e.w * dt / fillTime(e.src, e.d)); I.grace = 0; I.lastLit = { x: r.x, y: r.y + 0.12 }; }
  else { I.grace += dt; if (I.grace > F.grace) ST.s = Math.max(0, ST.s - F.decay * dt); }
  return e;
}
function track(dt) {
  const r = rabbit(), vis = trackVisible();
  if (vis) { I.lastSeen = { x: r.x, y: r.y, t: 0 }; I.seenT = 0; I.visT += dt; I.losT = 0; I.hide = null; }
  else {
    I.seenT += dt; I.visT = 0; I.losT += dt;
    /* he saw it go in: a rabbit inside a hide within 1.0 s of last being seen gets the hide check there (A11) */
    if (!I.hide && r && I.seenT <= RS().hideCheck.seenWithin) { const c = FF.Level.coverAt(r.x, 0); if (c && c.kneelEnds && c.kneelEnds.length && !c.exit) I.hide = c; }
  }
  return vis;
}

/* ---------------------------------------------------------------- transitions into the alert states */
function toNotice() {
  I.p.speed = 0; I.drift = 0; I.p.face0 = null;
  /* the point is behind him (or he was mid-turn): a quick turn (0.35 s) through the camera side */
  if (I.lastLit) { const to = Math.sign(I.lastLit.x - I.p.x) || 1; if (!I.p.face || to !== I.p.face) I.qturn = { t: 0, from: I.p.face || -to, to }; }
  setMode('notice');
}
function toSpotted() {
  const r = rabbit(); I.react = 0; I.lastSeen = r ? { x: r.x, y: r.y, t: 0 } : I.lastSeen; I.seenT = 0; I.losT = 0; I.visT = 0; I.hide = null; I.pursueT = 0; I.move = null;
  if (r) faceToward(r.x); I.p.kneel = false;
  setMode('spotted');
}
function toGrab(wind, why) { I.grabWind = wind; I.p.speed = 0; I.v = 0; I.move = null; const r = rabbit(); if (r) faceToward(r.x); I.p.kneel = false; setMode('grab', why); }
function toAim() { I.aimClicked = false; I.p.speed = 0; I.v = 0; setMode('aim'); }
function toPursue() { I.pursueT = 0; setMode('pursue'); }
function toHideCheck(cover) {
  /* the nearer end he can reach (by path), kneel just outside it */
  const p = I.p, lv = levelOf(p.x, p.y); let best = null;
  for (const end of cover.kneelEnds) {
    const out = end >= (cover.x0 + cover.x1) / 2 ? 1 : -1, kx = end + out * 0.45, k = reachFor(kx);
    if (k.lv === 'deck') continue;
    const c = pathCost(p.x, lv, k.x, k.lv, 2.6); if (!best || c < best.c) best = { c, end, out, kx: k.x, lv: k.lv };
  }
  if (!best) { toLost(); return; }
  I.hc = { cover, end: best.end, out: best.out, kx: best.kx, lv: best.lv }; I.hide = null; I.hidePhase = 'go'; I.move = null;
  setMode('hidecheck');
}
function toLost() { I.sweepT = 0; I.p.kneel = false; ST.s = 0; I.grace = 0; setMode('lost'); }
function toGap() { I.gapPhase = 'go'; I.move = null; ST.s = 0; I.grace = 0; I.hide = null; I.hc = null; setMode('gap'); }
function toReturn(wary) { if (wary) ST.wary = RS().wary.time; planReturn(); I.move = null; setMode('return'); }
function fire(kind) {
  if (I.frozen) return; I.frozen = true; I.fails++;
  const r = rabbit(); FF.bus.emit('fail', { kind, x: r ? +r.x.toFixed(2) : null, by: 'searcher', state: I.mode });
}

/* ================================================================== per-state stepping */
function stepPatrol(dt) {
  /* WARY: walk-patrol at 1.0 instead of 1.3 (the clock slows in those segments), sweeps x1.5, an extra look back at each end */
  const wary = ST.wary > 0; let rate = 1;
  const cur = sample(loop, I.loopT, clock);
  if (wary && cur.kind === 'walk-patrol') rate = RS().wary.walk / RS().patrol;
  if (I.insert) {
    I.insert.t += dt; const it = I.insert, u = it.t;
    Object.assign(I.p, { anim: 'idle', speed: 0, torchOn: true, kneel: false, face0: null });
    if (u < 1.0) { I.p.face = 0; I.p.yaw = U.lerp(it.face * Math.PI / 2, -it.face * Math.PI / 2, U.ease.inOutSine(u)); I.p.anim = 'turn'; I.p.torchOn = false; }
    else if (u < 3.0) { I.p.face = -it.face; I.p.yaw = null; I.p.pitch = U.lerp(-35, -8, Math.sin(Math.PI * (u - 1.0) / 2.0)); }
    else if (u < 4.0) { I.p.face = 0; I.p.yaw = U.lerp(-it.face * Math.PI / 2, it.face * Math.PI / 2, U.ease.inOutSine(u - 3.0)); I.p.anim = 'turn'; I.p.torchOn = false; }
    else { I.insert = null; I.p.face = it.face; I.p.yaw = null; }
    return;
  }
  const prevSeg = cur.seg;
  I.loopT = (I.loopT + dt * rate) % LOOP_T;
  const p = sample(loop, I.loopT, clock);
  if (wary && p.seg !== prevSeg && (p.kind === 'turn-sweep' || p.kind === 'look')) I.insert = { t: 0, face: loop[prevSeg].face || 1 };
  applySample(p, wary);
}
function applySample(p, wary) {
  const P = I.p, R = RT().torch;
  P.x = p.x; P.y = p.y; P.z = p.z; P.face = p.face; P.face0 = null; P.yaw = p.yaw; P.anim = p.anim; P.speed = p.speed; P.half = p.half; P.kneel = p.kneel; P.torchOn = p.torchOn; P.aim = p.aim || 0; P.visible = p.visible !== false;
  P.pitch = wary && /walk|sweep/.test(p.kind) ? R.pitchWalk + (p.pitch - R.pitchWalk) * RS().wary.sweep : p.pitch;
  P.lean = 0; P.reach = 0; P.head = null; P.torchPitchVis = null;
  if (wary && p.kind === 'walk-patrol') P.speed = RS().wary.walk;
  /* the 2D model has the torch off while he turns; visibly it swings down past his own feet on the camera side (lights no lane) */
  if (!p.torchOn && (p.kind === 'turn' || p.kind === 'turn-sweep')) P.torchPitchVis = -68;
}
function stepEntry(dt) {
  I.entryT += dt; const t = I.entryT, p = sample(entry, t, clock); applySample(p, false);
  ST.entryT = t;
  /* the door: light under it and a torch moving behind its window, then it opens (the doorway segment) and stays open */
  const ph = p.kind;
  if (ph !== I.entryPhase) {
    I.entryPhase = ph;
    if (ph === 'doorway') { I.doorOpen = true; FF.G.flags.doorN0 = true; FF.bus.emit('entry', { phase: 'doorway' }); }
    if (ph === 'turn' && t < 9) { sound('fence-clatter', { x: 113.1, y: 0.6, z: 0, gain: 0.9, who: 'wind' }); fenceJolt(); }
  }
  if (ph === 'aim-demo') {
    const tt = p.segT;
    if (!I.entryRaise) { I.entryRaise = true; FF.bus.emit('entry', { phase: 'aim-raise' }); }
    if (tt >= 0.5 && !I.aimClicked) { I.aimClicked = true; sound('aim-click', { gain: 0.7 }); }
    /* the visible beam narrows over the raise and widens over the lowering (the 2D model holds 5 deg, as checked) */
    I.p.halfVis = tt < 0.5 ? U.lerp(RT().torch.half, RT().torch.aimHalf, tt / 0.5) : tt < 1.5 ? RT().torch.aimHalf : U.lerp(RT().torch.aimHalf, RT().torch.half, (tt - 1.5) / 0.5);
  } else I.p.halfVis = null;
  const aimSeg = entry.find(q => q.kind === 'aim-demo');
  if (!I.entryLowered && aimSeg && t >= aimSeg.t0 + aimSeg.dur) { I.entryLowered = true; FF.bus.emit('entry', { phase: 'aim-lowered' }); }
  if (t >= ENTRY_T) finishEntry(false);
}
function finishEntry(interrupted) {
  /* only a completed entry counts as seen: one cut short by an alert replays from the door light after a restart at
     search-arrive (the player has not yet seen the aim demonstration that shows the way out) */
  if (!interrupted) FF.G.flags.entryDone = true;
  I.doorOpen = true; FF.G.flags.doorN0 = true; ST.entryT = null;
  if (!I.entryLowered) { I.entryLowered = true; FF.bus.emit('entry', { phase: 'aim-lowered', interrupted }); }
  FF.bus.emit('entry', { phase: 'done', interrupted });
  if (!interrupted) { I.loopT = 0; setMode('patrol'); }
}
function fenceJolt() { const fp = prop('fenceSheet'); if (fp) { fp.userData.joltT = 0.5; } }

function stepNotice(dt, e) {
  const P = I.p, R = RT().torch;
  P.speed = 0; P.anim = P.kneel ? 'crouch-look' : 'notice'; P.yaw = null; P.aim = 0;       // he stops dead where he is (kneeling stays kneeling)
  if (I.qturn) { const q = I.qturn; q.t += dt; const u = U.clamp(q.t / RS().quickTurn, 0, 1); P.face = 0; P.yaw = U.lerp(q.from * Math.PI / 2, q.to * Math.PI / 2, U.ease.inOutSine(u)); P.anim = 'turn';
    if (u >= 1) { P.face = q.to; P.yaw = null; I.qturn = null; P.anim = 'notice'; } }
  if (I.lastLit) {
    const want = U.clamp(pitchTo(I.lastLit.x, I.lastLit.y), -60, 10);
    P.pitch = U.approach(P.pitch, want, RS().noticeDrift * dt);       // the torch drifts to the last lit point at 40 deg/s and steadies
    P.torchOn = true; P.half = R.half;
    P.head = { yaw: 0, pitch: U.clamp(-(want) * D2R * 0.5, -0.4, 0.6) };
  }
  if (e.src === 'touch') return toGrab(FF.RULES.sight.touch.wind, 'touch');
  if (ST.s >= 1) return toSpotted();
  if (ST.s < RT().fill.investigateBelow) { I.inv = { phase: 'go' }; setMode('investigate'); }
}
function stepInvestigate(dt, e) {
  const P = I.p, tgt = I.lastLit || I.lastSeen || { x: P.x };
  if (I.inv.phase === 'go') {
    const k = reachFor(tgt.x); P.anim = 'walk-search'; P.torchOn = true; P.kneel = false; P.half = RT().torch.half;
    P.pitch = RT().torch.pitchWalk + RT().torch.sway * Math.sin(2 * Math.PI * RT().torch.swayHz * clock);
    if (moveTo(k.x, k.lv, RS().investigate.walk, dt) || Math.abs(P.x - k.x) < 0.05) { I.inv.phase = 'sweep'; I.inv.t = 0; }
    if (I.inv.phase === 'go' && !I.move) P.anim = 'walk-search';
  } else {
    I.inv.t += dt; P.anim = 'idle'; P.speed = 0;
    P.pitch = U.lerp(-35, -8, 0.5 + 0.5 * Math.sin(I.inv.t * Math.PI / 1.0));        // sweeping there (never under hides)
    if (I.inv.t > 2.0 && !I.inv.flipped) { I.inv.flipped = true; P.face = -P.face; }
    if (I.inv.t >= RS().investigate.sweep) toReturn(false);
  }
  if (e.src === 'touch') return toGrab(FF.RULES.sight.touch.wind, 'touch');
  if (ST.s >= RT().fill.notice) toNotice();
}
function stepSpotted(dt) {
  const P = I.p, r = rabbit(), vis = track(dt);
  I.react += dt; P.anim = 'idle'; P.speed = 0; P.kneel = false; P.torchOn = true; P.half = RT().torch.half; P.aim = 0;
  if (r && vis) { faceToward(r.x); P.pitch = U.clamp(pitchTo(r.x, r.y + 0.12), -70, 10); }                 // the torch snaps onto the rabbit
  P.head = null;
  if (I.react >= RS().reaction) {
    const d = r ? Math.hypot(r.x - P.x, r.y - P.y) : 99;
    if (d < RS().grab.range) return toGrab(RS().grab.wind, 'close');
    if (vis && d <= RS().aim.max) return toAim();
    return toPursue();
  }
}
function stepGrab(dt) {
  const P = I.p, r = rabbit(), G = RS().grab;
  track(dt);
  P.anim = 'lunge'; P.speed = 0; P.lean = U.clamp(I.modeT / I.grabWind, 0, 1); P.torchOn = true;
  if (r) { faceToward(r.x); P.pitch = U.clamp(pitchTo(r.x, r.y + 0.12), -70, 10); }
  if (I.modeT >= I.grabWind) {
    /* the reach: a hand 0.4 m ahead of his feet, 0.7 m of reach, his floor, a clear line, never into a core */
    const hand = P.x + G.hand * (P.face || 1), pts = rabbitPts();
    const ok = r && pts && !FF.Level.coreAt(r.x) && r.x < gapCore() && Math.abs(r.y - P.y) < 0.3 && (!r.mode || r.mode === 'play') &&
      pts.some(([px, py]) => Math.abs(px - hand) <= G.reach && !FF.Level.segmentBlocked(P.x, P.y + 1.0, px, py));
    if (ok) { fire('caught'); return; }
    P.lean = 0; toPursue();
  }
}
function stepAim(dt) {
  const P = I.p, r = rabbit(), A = RS().aim, R = RT().torch, vis = track(dt);
  P.anim = 'aim'; P.speed = 0; P.torchOn = true; P.kneel = false;
  const t = I.modeT; P.aim = U.clamp(t / A.raise, 0, 1);
  P.half = U.lerp(R.half, R.aimHalf, P.aim);                                       // the beam narrows 13 -> 5 deg and goes still
  if (r && vis) { faceToward(r.x); P.pitch = U.clamp(pitchTo(r.x, r.y + 0.12), -70, 10); }
  if (t >= A.raise && !I.aimClicked) { I.aimClicked = true; sound('aim-click', { gain: 0.8 }); FF.bus.emit('ai:aim', { phase: 'hold' }); }
  if (I.losT >= A.breakLOS) { I.lowerT = 0; setMode('lower', 'los-broken'); return; }
  if (t >= A.raise + A.hold) fire('shot');
}
function stepLower(dt) {
  const P = I.p, R = RT().torch; track(dt);
  P.anim = 'aim'; P.aim = Math.max(0, 1 - I.modeT / RS().aim.lower); P.half = U.lerp(R.half, R.aimHalf, P.aim);
  if (I.modeT >= RS().aim.lower) { P.aim = 0; P.half = R.half; if (I.hide) return toHideCheck(I.hide); toPursue(); }
}
function stepPursue(dt) {
  const P = I.p, r = rabbit(), S = RS(), vis = track(dt);
  I.pursueT += dt;
  if (r && r.x >= gapCore() && I.seenT < 2.0) return toGap();
  if (!vis && I.hide) { I.v = 0; return toHideCheck(I.hide); }
  const tgt = vis && r ? { x: r.x } : I.lastSeen || { x: P.x };
  const k = reachFor(tgt.x);
  const arrived = moveTo(k.x, k.lv, S.run, dt, S.runAccel);
  if (!I.move) P.anim = I.v > 1.4 ? 'run' : 'walk';
  P.torchOn = true; P.half = RT().torch.half; P.kneel = false; P.aim = 0;
  const jolt = 3 * Math.sin(I.gait * Math.PI);
  P.pitch = (vis && r ? U.clamp(pitchTo(r.x, r.y + 0.12), -70, 10) : -18) + jolt;                // the torch jerking with the stride
  if (vis && r) {
    const d = Math.hypot(r.x - P.x, r.y - P.y);
    if (d < S.grab.runRange && Math.abs(r.y - P.y) < 0.3) return toGrab(S.grab.windRunning, 'run');
    if (I.pursueT >= S.aim.afterPursue && I.visT >= S.aim.needSight && d >= S.aim.min && d <= S.aim.max) return toAim();
  }
  if (!vis && (I.losT >= S.lost || arrived)) toLost();
}
function stepHideCheck(dt) {
  const P = I.p, H = I.hc, S = RS().hideCheck, r = rabbit();
  const vis = track(dt);
  /* the rabbit came out where he can see it: chase again */
  if (vis && r && !(r.x >= H.cover.x0 - 0.2 && r.x <= H.cover.x1 + 0.2)) return toSpotted();
  if (I.hidePhase === 'go') {
    P.torchOn = true; P.kneel = false;
    const arrived = moveTo(H.kx, H.lv, RS().run, dt, RS().runAccel);
    if (!I.move) P.anim = I.v > 1.4 ? 'run' : 'walk';
    P.pitch = -25;
    if (arrived) { I.hidePhase = 'kneel'; I.hideT = 0; P.face = -H.out; P.speed = 0; }
    return;
  }
  I.hideT += dt; P.face = -H.out; P.speed = 0; P.torchOn = true;
  /* kneeling, the torch goes under, steep (it lights the reachable end); then the arm */
  if (I.hidePhase === 'kneel') { P.anim = 'kneel'; P.kneel = I.hideT > 0.4; P.pitch = -32; if (I.hideT >= S.kneel) { I.hidePhase = 'reach'; I.hideT = 0; } return; }
  if (I.hidePhase === 'reach') {
    P.anim = 'reach'; P.kneel = true; P.reach = U.clamp(I.hideT / S.reach, 0, 1);
    if (I.hideT >= S.reach) {
      const c = H.cover, depth = c.y1 < S.deepAbove ? S.armShallow : S.armDeep, hw = FF.RULES.rabbit.hw;
      const inReach = r && (H.out > 0 ? r.x + hw >= H.end - depth : r.x - hw <= H.end + depth) && r.x >= c.x0 - 0.5 && r.x <= c.x1 + 0.5;
      if (r && inReach && !FF.Level.coreAt(r.x) && r.y < 0.3 && (!r.mode || r.mode === 'play')) { fire('caught'); return; }
      I.hidePhase = 'held'; I.hideT = 0;                                              // the hand falls short: a held breath
      FF.bus.emit('ai:hidecheck', { phase: 'short', cover: c.id });
    }
    return;
  }
  if (I.hidePhase === 'held') { P.anim = 'reach'; P.reach = U.clamp(1 - I.hideT / S.heldBreath * 0.3, 0, 1); if (I.hideT >= S.heldBreath) { P.reach = 0; I.hc = null; toLost(); } }
}
function stepLost(dt) {
  const P = I.p; I.sweepT += dt;
  P.anim = I.sweepT < 0.6 && P.kneel ? 'kneel' : 'idle'; if (I.sweepT >= 0.6) P.kneel = false; P.speed = 0; P.torchOn = true; P.reach = 0;
  P.pitch = U.lerp(-35, -8, 0.5 + 0.5 * Math.sin(I.sweepT * Math.PI / 1.0));
  if (I.sweepT > RS().search * 0.5 && !I.lostFlip) { I.lostFlip = true; P.face = -P.face || 1; }
  if (I.sweepT >= RS().search) { I.lostFlip = false; toReturn(true); }
}
function stepGap(dt) {
  const P = I.p, G = RS().gap, r = rabbit();
  /* it comes back out into the yard where he can see it: chase again (no suspicion build-up: he is already alert) */
  if (r && r.x < 112.9 && trackVisible()) return toSpotted();
  if (I.gapPhase === 'go') {
    const arrived = moveTo(G.runTo, 'floorR', RS().run, dt, RS().runAccel); if (!I.move) P.anim = I.v > 1.4 ? 'run' : 'walk';
    P.torchOn = true; P.pitch = -20;
    if (arrived) { I.gapPhase = 'kneel'; I.gapT = 0; P.face = 1; }
    return;
  }
  I.gapT += dt; P.speed = 0; P.face = 1;
  if (I.gapPhase === 'kneel') { P.anim = 'kneel'; P.kneel = I.gapT > 0.4; P.pitch = -14; if (I.gapT >= G.kneel + G.torch) { I.gapPhase = 'shake'; I.gapT = 0; } return; }
  if (I.gapPhase === 'shake') {
    P.anim = 'shake-sheet'; P.kneel = true;
    if (!I.shook && I.gapT > 0.25) { I.shook = true; sound('fence-shake', { x: 113.0, y: 1.0, z: -0.2, gain: 1.0 }); fenceJolt(); }
    if (I.gapT >= 0.8) { I.gapPhase = 'stand'; I.gapT = 0; I.shook = false; }
    return;
  }
  P.anim = 'idle'; P.kneel = false; if (I.gapT >= 0.6) toReturn(true);
}
function stepReturn(dt) {
  const P = I.p, a = I.ret; P.torchOn = true; P.kneel = false; P.half = RT().torch.half; P.reach = 0; P.lean = 0; P.aim = 0;
  P.pitch = RT().torch.pitchWalk + RT().torch.sway * Math.sin(2 * Math.PI * RT().torch.swayHz * clock) * (ST.wary > 0 ? RS().wary.sweep : 1);
  if (moveTo(a.x, a.lv, ST.wary > 0 ? RS().wary.walk : RS().walk, dt)) { I.loopT = a.t; I.v = 0; setMode('patrol'); ST.state = ST.wary > 0 ? 'wary' : 'patrol'; return; }
  if (!I.move) P.anim = 'walk-search';
}

/* ================================================================== the module */
const AI = FF.AI = {
  stub: false,
  see, track: seeAlert, fillTime, build, sample, total, reachFor, pathCost,
  init(c) {
    entry = build(FF.S1.searcher.entry, 'N0'); loop = build(FF.S1.searcher.loop, 'N1'); LOOP_T = total(loop); ENTRY_T = total(entry);
    fig = FF.Humans.create('searcher');
    const torch = FF.World && FF.World.spot && FF.World.spot('torch'); if (torch) fig.attachTorch(torch);
    FF.G.searcher = ST;
    FF.bus.on('search-entry', d => { if (!ST.active && !FF.G.flags.entryDone) { activate(); I.mode = ''; setMode('wait'); ST.startIn = (d && d.arg) || 1.5; } });
    FF.bus.on('safe', () => { if (DANGER[I.mode] && I.mode !== 'grab') toGap(); });
    /* door N0 (the light under it, the torch behind its glass, the leaf opening at entry t 2.5 and its spill) is drawn by the
       World from G.searcher.entryT / G.flags.entryDone; the 2D area light follows the same timing (I.doorOpen). */
  },
  get entryTotal() { return ENTRY_T; }, get loopTotal() { return LOOP_T; }, get entrySegs() { return entry; }, get loopSegs() { return loop; },
  reset(cp, opts) {
    const sc = cp && cp.searcher; const was = ST.active;
    Object.assign(ST, { s: 0, lit: 0, litBy: '', startIn: -1, wary: 0, aim: 0, entryT: null, loopT: null, replay: false });
    Object.assign(I, { frozen: false, grace: 0, lastLit: null, lastSeen: null, seenT: 99, visT: 0, losT: 0, pursueT: 0, v: 0, hide: null, hc: null, insert: null, ret: null, move: null, qturn: null,
      entryPhase: '', entryRaise: false, entryLowered: false, aimClicked: false, lastX: null, stepAcc: 0 });
    Object.assign(I.p, { lean: 0, reach: 0, aim: 0, head: null, kneel: false, face0: null, yaw: null, halfVis: null, torchPitchVis: null });
    if (!sc) { ST.active = false; I.mode = 'off'; ST.state = 'off'; I.p.visible = false; I.doorOpen = !!FF.G.flags.entryDone; return; }
    activate();
    if (sc.beforeEntryDone && !FF.G.flags.entryDone) {
      I.mode = ''; setMode('wait'); ST.startIn = 1.5; I.doorOpen = false; FF.G.flags.doorN0 = false; I.p.visible = false;
      /* a retry after the door reveal was seen but not finished (FF.Events decides): he is already outside, the entry resumes
         at the aim demonstration a moment after the restart (the camera is already on the door) */
      if (FF.Events && FF.Events.entryReplay && FF.Events.entryReplay(opts && opts.reason)) { ST.replay = true; ST.startIn = 0.02; I.doorOpen = true; FF.G.flags.doorN0 = true; }
    }
    else { I.doorOpen = true; FF.G.flags.doorN0 = true; I.loopT = (sc.after ? sc.after.loopT : sc.loopT) || 0; I.mode = ''; setMode('patrol'); applySample(sample(loop, I.loopT, clock), false); if (fig) fig.set({ snap: true }); }
  },
  /* test hook: the searcher at loop time t (patrolling, calm) */
  setLoopT(t) { activate(); FF.G.flags.entryDone = true; I.doorOpen = true; I.frozen = false; ST.s = 0; ST.wary = 0; I.insert = null; I.move = null; I.loopT = ((t % LOOP_T) + LOOP_T) % LOOP_T; I.mode = ''; setMode('patrol'); applySample(sample(loop, I.loopT, clock), false); if (fig) fig.set({ snap: true }); },
  danger() { return !!DANGER[I.mode] && ST.active; },
  step(dt) {
    if (!ST.active || I.frozen) return;
    clock += dt; I.modeT += dt; if (ST.wary > 0 && I.mode === 'patrol') { ST.wary = Math.max(0, ST.wary - dt); if (ST.wary === 0) ST.state = 'patrol'; }
    if (I.mode === 'wait') {
      ST.startIn -= dt; I.p.visible = false;
      if (ST.startIn <= 0) {
        if (ST.replay) { const a = entry.find(q => q.kind === 'aim-demo'); I.entryT = a ? a.t0 : 0; I.entryPhase = 'aim-demo'; I.doorOpen = true; FF.G.flags.doorN0 = true; setMode('entry'); FF.bus.emit('entry', { phase: 'replay' }); }
        else { I.entryT = 0; I.entryPhase = ''; I.doorOpen = false; FF.G.flags.doorN0 = false; setMode('entry'); FF.bus.emit('entry', { phase: 'cue' }); }
      }
      return;
    }
    const calm = I.mode === 'patrol' || I.mode === 'entry' || I.mode === 'return' || I.mode === 'investigate' || I.mode === 'notice' || I.mode === 'lost';
    switch (I.mode) {
      case 'entry': stepEntry(dt); break;
      case 'patrol': stepPatrol(dt); break;
      case 'return': stepReturn(dt); break;
    }
    /* perception on the pose of this step */
    const watching = calm && !(I.mode === 'entry' && I.p.visible === false);
    const e = perceive(dt, watching);
    if (watching) {
      /* TOUCH. A rabbit that runs into his legs gets the lunge at once (0.45 s wind-up, A6). A rabbit sitting still that HE walks
         into makes him stop dead first (NOTICE), then the close-range rule runs with its telegraph (tested: a first-timer could
         not react inside the bare 0.45 s when it was his movement, not theirs; the checker models the same rule). */
      if (e.src === 'touch' && I.mode !== 'notice' && I.mode !== 'investigate') { if (I.mode === 'entry') finishEntry(true); toGrab(FF.RULES.sight.touch.wind, 'touch'); }
      else if ((I.mode === 'patrol' || I.mode === 'entry' || I.mode === 'return' || I.mode === 'lost') && ST.s >= RT().fill.notice) { if (I.mode === 'entry') finishEntry(true); toNotice(); }
    }
    switch (I.mode) {
      case 'notice': stepNotice(dt, e); break;
      case 'investigate': stepInvestigate(dt, e); break;
      case 'spotted': stepSpotted(dt); break;
      case 'grab': stepGrab(dt); break;
      case 'aim': stepAim(dt); break;
      case 'lower': stepLower(dt); break;
      case 'pursue': stepPursue(dt); break;
      case 'hidecheck': stepHideCheck(dt); break;
      case 'lost': stepLost(dt); break;
      case 'gap': stepGap(dt); break;
    }
    if (I.frozen) return;
    if (I.mode !== 'wait') footsteps(dt);
    const P = I.p;
    Object.assign(ST, { x: P.x, y: P.y, z: P.z, face: P.face, pitch: P.pitch, half: P.half, kneel: P.kneel, torchOn: P.torchOn && P.visible, kind: I.mode === 'patrol' || I.mode === 'entry' ? (sample(I.mode === 'entry' ? entry : loop, I.mode === 'entry' ? I.entryT : I.loopT) || {}).kind : I.mode,
      loopT: I.mode === 'patrol' ? I.loopT : null, aim: P.aim || 0 });
  },
  frame(dt) {
    if (!fig) return;
    const P = I.p, vis = ST.active && P.visible && I.mode !== 'wait' && I.mode !== 'off';
    fig.set({ visible: vis, x: P.x, y: P.y, z: P.z, face: P.face, yaw: P.yaw, anim: P.anim, speed: P.speed, gait: I.gait, aim: P.aim || 0, aimPitch: P.pitch, lean: P.lean || 0, reach: P.reach || 0, head: P.head,
      torch: { on: vis && (P.torchOn || P.torchPitchVis != null), pitch: P.torchPitchVis != null ? P.torchPitchVis : P.pitch, half: P.halfVis || P.half, target: null } });
    /* the fence sheet jolts when the corner clatters (entry) or when he shakes it (the gap) */
    const fp = prop('fenceSheet'); if (fp && fp.userData.joltT > 0) { const ud = fp.userData; ud.joltT -= dt; fp.rotation.z = 0.03 * Math.sin(ud.joltT * 60) * Math.max(0, ud.joltT / 0.5); if (ud.joltT <= 0) fp.rotation.z = 0; }
  },
  dispose() {},
  debug() {
    const r = rabbit(), P = I.p;
    return { state: ST.state, mode: I.mode, active: ST.active, x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), face: P.face, kind: ST.kind, anim: P.anim,
      loopT: ST.loopT == null ? null : +ST.loopT.toFixed(2), entryT: ST.entryT == null ? null : +ST.entryT.toFixed(2), s: +ST.s.toFixed(3), lit: +ST.lit.toFixed(2), litBy: ST.litBy,
      pitch: +P.pitch.toFixed(1), half: +P.half.toFixed(1), aim: +(P.aim || 0).toFixed(2), wary: +ST.wary.toFixed(1), modeT: +I.modeT.toFixed(2),
      timers: { react: +I.react.toFixed(2), grabWind: I.mode === 'grab' ? I.grabWind : null, aimT: I.mode === 'aim' ? +I.modeT.toFixed(2) : null, seenT: +Math.min(99, I.seenT).toFixed(2), visT: +I.visT.toFixed(2), losT: +Math.min(99, I.losT).toFixed(2), pursueT: +I.pursueT.toFixed(2) },
      lastSeen: I.lastSeen && +I.lastSeen.x.toFixed(2), lastLit: I.lastLit && +I.lastLit.x.toFixed(2), hide: I.hide ? I.hide.id : null, hc: I.hc ? I.hc.cover.id + ':' + I.hidePhase + '@' + I.hc.end : null,
      d: r ? +Math.abs(r.x - P.x).toFixed(2) : null, frozen: I.frozen, door: I.doorOpen };
  },
};
function activate() { ST.active = true; I.p.z = FF.S1.searcher.pathZ; }
})();
