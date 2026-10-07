/* FAR FIELD — ff-player.js: FF.Player, the rabbit as a living individual (SEQUENCE-1.md §4 as amended; INTERFACES.md §8.4).
   OWNER: the rabbit builder (with ff-rabbit.js).
   MOVEMENT (the look test's feel, on FF.S1; controls revised after Josh's playtest, 7 Oct §9.1-9.3):
     - a direction alone (arrows, A D, the stick or d-pad) = the CAUTIOUS walk (0.95 m/s); it never speeds up by itself,
       however long it is held. Shift (the 'run' action; the pad's run button) + a direction = the run (2.75 m/s); while the
       searcher is SPOTTED / AIM / PURSUE / GRAB / LOWER within 15 m a run is the flee (3.6 m/s). No speed is ever raised
       unasked: a squeeze only caps the speed asked for (A9: a duck-under 1.6, 2.4 fleeing; the drain's pipe a creep at
       0.75 after a 0.2 s duck; the first squeeze ever, the hoarding, hesitates 0.35 s).
     - Down (↓ / S, the pad's B or d-pad down) = a deliberate crouch and crouch-walk (0.75 m/s). The rabbit lowers by itself
       ONLY under something low (a squeeze, or any ceiling below lowPoseUnder 0.35 m), head and shoulders first and the hips
       following, rising again as each part clears. The danger / glare reflex in the open is a freeze (ears back, a slight
       lowering), never a flattening.
     - jump (Space or Up; coyote, buffer, cut), step-up, the box (head-push only), the reach-fail (A15), the links (the
       culvert drop, the climb into the raised opening, the duct transit, the pop-out), the channel lip at 127.0 ("not yet").
     - GAIT TIMING (presentation, but it lives here so it follows the movement exactly): the stride phase advances with the
       distance actually travelled (phase += |dx| / stride), so a planted foot never slides; the cautious walk and the run
       are distinct cycles (GAITS below: stance windows per foot, stride length by speed), and the body's vertical motion is
       derived from that cycle (an end of the body rises only while its feet are off the ground, never higher or longer than
       gravity allows), so it never floats. ff-rabbit.js reads it from the anim input: anim.gait, anim.crouchFront/Rear,
       anim.squeeze (INTERFACES.md §8.3). The footstep event (rabbit:step) fires on the hind feet's touchdown in this cycle.
     - the one "Shift run" hint (bus 'hint' {arg: 'run'}): once, in a safe stretch early in the Verge (after the post, before
       the van), unless the player has already run; a second chance on entering the Courtyard (a Continue from a save).
   NO LISTEN ACTION (A2, Josh 7 Oct): Up jumps. The ears, head and posture react to sounds by themselves: every 'sound' event
     on the bus, the scripted cues (far boom, engine, gate, walkway, the searcher's door) and every visible human are
     weighed by salience (§4.2); the two strongest take one ear each; the head follows the strongest by 35% when still.
     An off-screen human is always "visible" in the ears; when his footsteps stop (NOTICE) the ears hold on him, upright.
   BEHAVIOUR: moods CALM / ALERT / AFRAID / FLEEING / RECOVERING / SETTLED drive breathing, ears, posture and which idles
     may play. They never change speed, collision or control. Expressive poses (sniff, groom, nibble, sit up, look up,
     look back, shake, freeze, hide, peek, look down at an edge, rear at the post) play only while the player gives no
     movement input, and any input ends them within 0.15 s. The only involuntary actions are §4.2's list: the ears and
     head snapping to sounds, the first squeeze's hesitation, the reach-fail, the duct pop-out, the rest's auto-stop after
     60 s, and the channel lip; plus the 0.15 s additive startle at SPOTTED (control kept). Caught / shot: a flinch only;
     the game cuts to black on the same step (ff-events.js), so nothing else of it is ever shown.
   THE SETTLE CHAIN (§11): still in the rest -> listen, sniff, nibble, groom, shake, lie into a loaf; input ends a step in
     0.25 s and the chain resumes from the next step after 1.5 s still; in the loaf -> emits end {phase:'settled'} and
     commits (input locked; ff-events.js holds loafHold 4.0 s, then the pull-out).
   Bus events emitted (payloads plain objects): transit {phase}, search-entry {id, arg, x}, rabbit:land {x, y, h, surface,
     place}, rabbit:jump {x, y}, rabbit:step {x, y, run, surface, place}, rabbit:squeeze {phase:'start'|'end', id, short, x},
     rabbit:reach-fail {x, n}, rabbit:pose {pose, kind, step, chain, x}, rabbit:mood {mood, from}, box {moving, v, x},
     end {phase:'settled'}.
   Determinism: behaviour timing runs in step() on a local seeded generator (never FF.rng, which play code shares). */
'use strict';
window.FF = window.FF || {};
(function () {
const U = FF.util, clamp = U.clamp, approach = U.approach, lerp = U.lerp, sstep = U.sstep;
const D2R = Math.PI / 180;
let rig = null, ctx = null, hlHandle = null, ductLink = null;
const S = {};                     // the rabbit's state; FF.G.rabbit points at it (read-only for other modules)
const box = { x: 0, vx: 0, w: 0.52, h: 0.44, d: 0.5, minX: -1e9, maxX: 1e9 };
const RB = () => FF.RULES.rabbit, BH = () => FF.RULES.behave;
const FLEE_STATES = { spotted: 1, aim: 1, pursue: 1, grab: 1, lower: 1 };

/* behaviour tuning that is presentation, not a game rule (game rules stay in FF.RULES). No RULES OVERRIDE is needed. */
const P = {
  reachBoxGap: 0.5,        // A15: a box edge nearer than this to the body = "a box top within jump reach" -> an ordinary jump
  jumpHeadroom: 0.36,      // no jump under a ceiling lower than this (the hides): it would only bump its head
  jumpCutAfter: (FF.RULES.rabbit && FF.RULES.rabbit.jumpCutAfter) != null ? FF.RULES.rabbit.jumpCutAfter : 0.15,   // folded into FF.RULES.rabbit
  lipLook: 1.6, lipCool: 2.0,
  boxSniff: 0.8,           // §7.1: sniffs the box within 0.8 m
  edgeDrop: 0.35,          // a drop deeper than this ahead = an edge (look down when stopped there)
  rearAfter: 0.15,         // pressed against the post this long -> rears and sniffs its top
  srcMin: 0.12,            // salience below this is ignored by the ears
  afraidNear: 8, alertCue: 0.45,
  rimEase: 2.5,
  /* crouch transitions (7 Oct): the head and shoulders go first, the hips follow; each part rises once it has cleared */
  crouchLead: 0.05, crouchLeadPerV: 0.12,     // the front looks this far ahead of the head (m, + per m/s): it dips just before the edge
  crouchDown: [0.075, 0.13],                  // ease time constants going down: [front, rear] (s)
  crouchUp: [0.15, 0.2],                      // and rising: [front, rear]
  crouchFollow: 0.06,                         // a deliberate crouch (Down): the hips follow the shoulders this much later (s)
  runHint: { x0: 13.0, x1: 20.5, court: [57.5, 66.0], ranBefore: 1.0, remindAfter: 60 },   // where the "Shift run" hint may show; skipped once the player has run this long;
                                                                         // shown once more on entering the Courtyard if the player has not run for remindAfter s
};

/* ------------------------------------------------------------------ the gaits (timing only; ff-rabbit.js draws them)
   phase 0 = the hind feet touch down. Each foot's stance window [on, off] is in phase units (it may run past 1). The stride
   (m per cycle) grows with speed as stride * (v / ref)^exp, so the cadence rises a little and the stride a lot as it speeds
   up. lift: [front, rear] fraction of the ballistic arc an end of the body may make while its feet are off the ground (never
   more than gravity allows in that time), capped at `cap` m; dip = the legs flexing under load during a stance. */
const GAITS = {
  /* the cautious walk: a slow, deliberate half-bound. The forefeet are placed one after the other, the hind feet land
     together behind them; the hips swing up over the planted forefeet, the shoulders lift a little off the hind push. */
  walk:   { ref: 0.95, stride: 0.34, exp: 0.6, hindL: [0.00, 0.46], hindR: [0.01, 0.47], foreL: [0.38, 0.86], foreR: [0.46, 0.94], lift: [0.25, 0.35], cap: 0.018, dip: 0.004 },
  /* the run (and the flee, longer): a bound with two flights, extended after the hind push and gathered after the forefeet */
  run:    { ref: 2.75, stride: 0.78, exp: 0.6, hindL: [0.00, 0.24], hindR: [0.03, 0.27], foreL: [0.50, 0.64], foreR: [0.56, 0.70], lift: [0.55, 0.6], cap: 0.05, dip: 0.012 },
  /* low: the crouch-walk, the creep and the duck-under; the feet move one by one, the body stays level */
  crouch: { ref: 0.75, stride: 0.20, exp: 0.5, hindL: [0.00, 0.62], hindR: [0.50, 1.12], foreL: [0.25, 0.87], foreR: [0.75, 1.37], lift: [0.06, 0.06], cap: 0.004, dip: 0.0015 },
  /* pushing the box with the head: short treading steps, the feet one by one */
  push:   { ref: 0.62, stride: 0.16, exp: 0.5, hindL: [0.00, 0.66], hindR: [0.50, 1.16], foreL: [0.20, 0.86], foreR: [0.70, 1.36], lift: [0.04, 0.04], cap: 0.003, dip: 0.002 },
};
const FEET = ['hindL', 'hindR', 'foreL', 'foreR'];
const GRAV = 9.81;
const strideOf = (g, v) => Math.max(0.05, g.stride * Math.pow(Math.max(v, 0.01) / g.ref, g.exp));
/* is phase p inside the window [a, b] (b may run past 1)? */
const inWin = (w, p) => (p >= w[0] && p < w[1]) || (p + 1 >= w[0] && p + 1 < w[1]);
/* the interval around p (in unwrapped phase, a <= p < b) during which none of the windows `ws` holds: null if one holds */
function gapAround(ws, p) {
  if (ws.some(w => inWin(w, p))) return null;
  let a = -Infinity, b = Infinity;
  for (const w of ws) for (const k of [-1, 0, 1]) { const on = w[0] + k, off = w[1] + k; if (off <= p && off > a) a = off; if (on > p && on < b) b = on; }
  return [a, b];
}
/* local deterministic generator for behaviour timing */
let rs = 1; const rnd = () => { let t = (rs += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/* behaviour state */
const B = { src: new Map(), seen: {}, add: {}, ears: { pL: 0.06, pR: 0.06, yL: -0.45, yR: 0.45, w: 1 }, head: { yaw: 0, pitch: 0 }, queue: [] };
function freshB(keepSeen) {
  const seen = keepSeen ? B.seen : {};
  Object.assign(B, {
    t: 0, mood: 'calm', moodT: 0, cueT: 99, safeT: 0, recoverT: 0, searchT: 99, hz: 1, amp: 1, held: 0,
    pose: null, out: 0.2, queue: [], inv: null, locked: false, frozen: false, hideHold: false, autoStop: false,
    chain: null, restT: 0, restArrive: -1, settledT: 0, settledSent: false,
    reachFails: 0, lookedAtBox: false, lipCool: 0, idleNext: rr(0.6, 1.2), twitchNext: rr(2, 5), sniffNext: rr(3, 8), groomCool: 0, sniffCool: 0, edgeCool: 0,
    pushBlockT: 0, boxSniffCool: 0, beamD: 99, vehicleT: -1, vehicleStopped: false, gateOpen: false, personOutT: -1, torchDownT: -1,
    srPrevX: null, srMoving: false, holdWant: null, holdWantT: 0, srWasMoving: false, aimK: 0, grabK: 0, noticeT: -1, flinchK: 0, wasBoxMoving: false, firstSqueezeId: null,
    drainRecovered: false, escaped: false, lastPlace: null, walkwayT: -1, ranT: 0,
  });
  B.seen = seen; B.src.clear();
  B.add = { startle: 9, shake: 9, splash: 9, sniff: 9, twitchL: 9, twitchR: 9, look: 9, lookDir: -1, snap: 9 };
  B.ears = { pL: 0.06, pR: 0.06, yL: -0.45, yR: 0.45, w: 1 }; B.head = { yaw: 0, pitch: 0 };
}

function link(id) { return FF.S1.links.find(l => l.id === id); }
function boxSpan() { return { x0: box.x - box.w / 2, x1: box.x + box.w / 2, y0: 0, y1: box.h }; }
function floorAt(x, y) {
  let f = FF.Level.floorUnder(x, RB().hw * 0.9, y, 0.03);
  const b = boxSpan(); if (x + RB().hw * 0.5 > b.x0 && x - RB().hw * 0.5 < b.x1 && y >= b.y1 - 0.03 && b.y1 > f) f = b.y1;
  return f;
}
function heightNow() { return S.crouch ? RB().hCrouch : RB().h; }
function fleeing() { const s = FF.G.searcher; return !!(s && FLEE_STATES[s.state] && Math.abs((s.x || 0) - S.x) <= RB().fleeWithin); }
function figs() { try { return (FF.Humans && FF.Humans.figures) || []; } catch (_) { return []; } }
function surface() {
  if (S.onBox) return 'wood'; const p = FF.G.place;
  return p === 'verge' ? 'grass' : p === 'drain' ? 'water' : p === 'search' ? 'wet-concrete' : p === 'rest' ? (S.x > 116 ? 'grass' : 'wet-concrete') : 'concrete';
}
function boxGap() { const b = boxSpan(); return Math.max(0, b.x0 - (S.x + RB().hw), (S.x - RB().hw) - b.x1); }

/* ------------------------------------------------------------------ poses */
function setPose(name, o) {
  o = o || {};
  B.pose = { name, t: 0, dur: o.dur || 0, loop: !!o.loop, kind: o.kind || 'idle', cancel: o.cancel || 'any', out: o.out != null ? o.out : 0.2, step: o.step || null, data: o.data || null, dir: o.dir || 0 };
  S.pose = name;
  FF.bus.emit('rabbit:pose', { pose: name, kind: B.pose.kind, step: B.pose.step, chain: B.pose.kind === 'chain', x: +S.x.toFixed(2) });
}
/* a pose ran its course */
function finishPose() {
  const p = B.pose; if (!p) return; B.out = p.out; B.pose = null; S.pose = null;
  if (p.kind === 'chain' && B.chain) { B.chain.i++; if (B.chain.i < CHAIN.length) startChain(); }
  if (p.kind === 'lip') { S.face = -S.face; B.lipCool = P.lipCool; B.inv = null; B.lipHold = -S.face; }
}
/* a pose ended early (input, a new danger): eases out over `out` seconds */
function cancelPose(out) {
  const p = B.pose; if (!p) return; B.out = out != null ? out : p.out; B.pose = null; S.pose = null;
  if (p.kind === 'chain' && B.chain) { if (CHAIN[B.chain.i] !== 'lie') B.chain.i++; B.chain.wait = true; if (B.mood === 'settled') setMood('calm'); }
  if (p.kind === 'title') B.add.shake = 0;               // breaks off mid-wipe and shakes its head
  if (p.kind === 'lip') { B.inv = null; B.lipCool = P.lipCool; }
}

/* the settle chain (§11) */
const CHAIN = ['listen', 'sniff', 'nibble', 'groom', 'shake', 'lie'];
function startChain() {
  const c = BH().settle.chain, n = CHAIN[Math.min(B.chain.i, CHAIN.length - 1)];
  const map = { listen: ['sit', c.listen], sniff: ['sniff', c.sniff], nibble: ['nibble', c.nibble], groom: ['groom', c.groom], shake: ['shake', c.shake], lie: ['loaf', 0] };
  const [name, dur] = map[n];
  setPose(name, { dur, kind: 'chain', cancel: 'any', loop: n === 'lie', out: BH().settle.interrupt, step: n });
  S.settle = n;
  if (n === 'lie') { setMood('settled'); B.settledT = 0; }
}

/* ------------------------------------------------------------------ moods */
function setMood(m) { if (B.mood === m) return; const from = B.mood; B.mood = m; B.moodT = 0; S.mood = m; if (m === 'recover') B.recoverT = 0; FF.bus.emit('rabbit:mood', { mood: m, from }); }

/* ------------------------------------------------------------------ sound sources (what the ears weigh) */
const KIND = [
  [/step|boot|foot|walk|run/, 'steps', 1.0, 0.7], [/torch|click/, 'torch', 0.9, 1.5], [/door|latch|gate|lock|clank|relay|lamp|slam/, 'door', 0.9, 2.0],
  [/engine|van|brake|idle|tyre|vehicle|motor/, 'engine', 0.8, 1.2], [/chain|rattle|scrape/, 'chain', 0.9, 1.6], [/fence|clatter|shake|sheet/, 'door', 0.9, 2.0],
  [/breath|cloth|scuff|reach/, 'steps', 0.9, 1.0], [/boom|horn|machin/, 'boom', 0.7, 2.5], [/draught|gurgle|trickle|whistle/, 'wayOn', 0.3, 1.5],
  [/thud|drip|hum|rain|wind|buzz|tick/, 'ambient', 0.1, 1.0],
];
function classify(cue) { for (const [re, kind, w, life] of KIND) if (re.test(cue)) return { kind, w, life }; return { kind: 'other', w: 0.5, life: 1.2 }; }
function addSrc(key, o) {
  let s = B.src.get(key); const fresh = !s || s.age > s.life;
  if (!s) { s = { d: null, dPrev: null, appr: 0 }; B.src.set(key, s); }
  Object.assign(s, o); s.age = 0; if (s.life == null) s.life = 1;
  /* a new, strong, non-ambient sound is a cue: the ears snap, the mood lifts to ALERT */
  if (fresh && s.kind !== 'ambient' && s.kind !== 'wayOn' && (s.w || 0) >= P.alertCue && !o.quiet) { B.cueT = 0; if (s.kind !== 'human') B.add.snap = 0; }
  return s;
}
function salience(s) {
  const dx = s.x - S.x, dy = (s.y || 0) - (S.y + 0.2), dz = (s.z || 0) - S.z, d = Math.hypot(dx, dy, dz);
  const fall = s.far ? 1 : 1 / (1 + Math.max(0, d - 4) / 14);
  const fade = s.decay ? Math.max(0, 1 - s.age / s.life) : (s.age < s.life - 0.3 ? 1 : Math.max(0, (s.life - s.age) / 0.3));
  if (s.kind === 'wayOn' && B.mood !== 'calm') return 0;
  return (s.w + (s.appr > 0 ? 0.5 * s.appr : 0)) * fall * fade;
}
function tickSources(dt) {
  for (const [k, s] of B.src) {
    s.age += dt; if (s.age > s.life + 0.05) { B.src.delete(k); continue; }
    const d = Math.hypot(s.x - S.x, (s.z || 0) - S.z); s.d = d;
    s.tq = (s.tq || 0) + dt; if (s.tq >= 0.25) { s.appr = s.dPrev != null && d < s.dPrev - 0.05 ? 1 : 0; s.dPrev = d; s.tq = 0; }
  }
}
/* the live emitters: every visible human, the searcher (also unseen), the van's headlights, the way-on draughts */
function pollSources(dt) {
  const G = FF.G, sr = G.searcher;
  for (const f of figs()) {
    const st = f.st; if (!st || !st.visible || (f.role === 'searcher' && sr && sr.active)) continue;
    const moving = (st.speed || 0) > 0.05;
    addSrc('fig:' + f.role, { x: st.x, y: (st.y || 0) + 1.0, z: st.z || 0, w: moving ? 1.0 : 0.6, life: 0.3, kind: 'human', role: f.role, moving, quiet: !moving });
  }
  if (sr && sr.active && sr.state !== 'off' && sr.state !== 'wait') {
    const moving = B.srPrevX != null && Math.abs(sr.x - B.srPrevX) > 0.0004; B.srPrevX = sr.x; B.srMoving = moving;
    addSrc('searcher', { x: sr.x, y: (sr.y || 0) + 1.0, z: sr.z != null ? sr.z : -1.15, w: moving ? 1.0 : 0.7, life: 0.3, kind: 'human', role: 'searcher', moving, quiet: true });
    if (sr.torchOn && B.beamD < 3) addSrc('torch', { x: sr.x + 0.3 * (sr.face || 0), y: (sr.y || 0) + 1.25, z: sr.z || -1.15, w: 0.9, life: 0.3, kind: 'torch', quiet: true });
  } else B.srPrevX = null;
  /* the van behind the wall: its headlights (the K0 rig light while the Verge owns it) */
  if (B.vehicleT >= 0 && !B.vehicleGone && (G.place === 'verge' || G.place === 'drain')) {
    let p = null, live = false;
    try { if (!hlHandle && FF.World && FF.World.spot && !FF.World.stub) hlHandle = FF.World.spot('headlights'); if (hlHandle && hlHandle.light) { live = true; if (hlHandle.light.intensity > 0) p = hlHandle.light.position; } } catch (_) {}
    if (p) addSrc('engine', { x: p.x, y: 1.0, z: p.z, w: 0.8, life: 0.3, kind: 'engine', wall: true, quiet: B.vehicleT > 0.2 });
    else if (!live && (B.vehicleT < 14 || !B.gateOpen)) addSrc('engine', { x: B.vehicleT < 6 ? lerp(-12, 33, clamp(B.vehicleT / (B.vehicleStopped ? Math.max(0.1, B.stopAt) : 6), 0, 1)) : 33, y: 1.0, z: -8.5, w: 0.8, life: 0.3, kind: 'engine', wall: true, quiet: B.vehicleT > 0.2 });
  }
  /* the Verge person, if the humans module shows no figure for them yet: behind the gate from the door slam until the lock
     gives, then out to the culvert and kneeling there (the scripted timings of FF.S1.verge) */
  if (B.vehicleStopped && !figs().some(f => f.role === 'verge' && f.st && f.st.visible)) {
    const since = B.vehicleT - (B.stopAt || 0);
    if (!B.gateOpen && since > 1.4) addSrc('verge-person', { x: 33.0, y: 0.9, z: -4.6, w: since < 3.4 ? 1.0 : 0.6, life: 0.3, kind: 'human', role: 'verge', moving: since < 3.4, quiet: true });
    else if (B.personOutT >= 1.2 && B.personOutT < 14) { const u = clamp((B.personOutT - 1.2) / 2.8, 0, 1); addSrc('verge-person', { x: lerp(33.0, 38.0, u), y: 0.9, z: lerp(-3.6, -0.9, u), w: u < 1 ? 1.0 : 0.7, life: 0.3, kind: 'human', role: 'verge', moving: u < 1, quiet: true }); }
  }
  /* the Verge person's gate and chain while the van waits (until the lock gives) */
  if (B.vehicleStopped && !B.gateOpen && G.place === 'verge' && B.vehicleT > (B.stopAt || 0) + 3.5) addSrc('chain', { x: 33.0, y: 0.9, z: -4.1, w: 0.9, life: 0.3, kind: 'chain', quiet: true });
  /* the way on: a draught from the raised opening (Courtyard), the culvert's gurgle (Verge), the fence corner (Search) */
  if (G.place === 'courtyard' && Math.abs(S.x - 76.0) < 3.2) addSrc('draught', { x: 76.0, y: 0.98, z: -0.45, w: 0.3, life: 0.3, kind: 'wayOn', quiet: true });
  if (G.place === 'verge' && S.x > 28) addSrc('gurgle', { x: 38.75, y: -0.4, z: -0.5, w: 0.3, life: 0.3, kind: 'wayOn', quiet: true });
  /* the settle chain's listen: the ears swivel to the fence (nothing is left there), then forward to the drip */
  if (B.pose && B.pose.step === 'listen') {
    if (B.pose.t < 1.3) addSrc('fence-mem', { x: 113.2, y: 0.5, z: 0, w: 0.7, life: 0.2, kind: 'other', quiet: true });
    else addSrc('drip', { x: S.x + 1.4 * S.face, y: 1.4, z: -0.9, w: 0.7, life: 0.2, kind: 'other', quiet: true });
  }
}
/* the 2D distance from the rabbit to the searcher's torch beam (0 = inside the cone) */
function beamDist() {
  const sr = FF.G.searcher; let d = 99;
  if (sr && sr.active && sr.torchOn && sr.face) {
    const T = FF.RULES.sight.torch, k = sr.kneel, lx = sr.x + (k ? T.kneelFwd : T.fwd) * sr.face, ly = (sr.y || 0) + (k ? T.kneelH : T.h);
    const dx = S.x - lx, dy = S.y + 0.12 - ly, dist = Math.hypot(dx, dy);
    if (dist < T.range + 2) {
      if (dx * sr.face <= 0) d = dist;
      else { const off = Math.abs(Math.atan2(dy, Math.abs(dx)) / D2R - (sr.pitch || 0)) - (sr.half || T.half); d = off <= 0 ? 0 : dist * Math.sin(Math.min(90, off) * D2R); }
    }
  }
  /* the Verge: the headlight glare under the gate while the van waits; the person's torch down the culvert crack */
  if (B.vehicleStopped && !B.gateOpen && FF.G.place === 'verge' && S.x >= 30.8 && S.x <= 35.2) d = 0;
  if (B.torchDownT >= 0 && B.torchDownT < 3.2 && S.y < -0.5) d = Math.min(d, Math.max(0, Math.abs(S.x - 38.75) - 0.25));
  return d;
}

/* ------------------------------------------------------------------ assessment: threat -> mood, breathing */
function assess(dt) {
  const G = FF.G, H = BH(), sr = G.searcher;
  B.beamD = beamDist();
  let near = 99, searching = false, human = false, humanStill = false;
  for (const s of B.src.values()) if (s.kind === 'human' && s.age <= s.life) {
    const d = Math.hypot(s.x - S.x, (s.z || 0) - S.z); human = true; if (!s.moving) humanStill = true;
    if (s.role !== 'worker') { near = Math.min(near, d); if (s.role === 'searcher' || s.role === 'verge') searching = true; }
  }
  if (G.place === 'search' && sr && sr.active && sr.state !== 'off') B.searchT = 0; else B.searchT += dt;
  B.humanVisible = human; B.humanStill = humanStill; B.near = near;
  const flee = S.fleeing;
  const afraid = (G.place === 'search' && sr && sr.active && sr.state !== 'off') || B.searchT < 5 || (searching && near < P.afraidNear) || B.beamD < 2;
  B.cueT += dt; B.moodT += dt;
  const m = B.mood;
  if (flee) { setMood('flee'); B.safeT = 0; }
  else if (m === 'flee') { B.safeT += dt; if (B.safeT >= 2) setMood(afraid && !B.escaped ? 'afraid' : 'recover'); }
  else if (m === 'settled') { /* held until input ends the loaf */ }
  else if (afraid && !(m === 'recover' && B.escaped && G.place !== 'search')) setMood('afraid');
  else if (m === 'afraid') setMood(B.escaped ? 'recover' : 'alert');
  else if (m === 'recover') { B.recoverT += dt; if (B.recoverT >= H.breathHz.recover[2]) setMood('calm'); }
  else if (B.cueT < H.calmAfter || human || (B.vehicleT >= 0 && !B.vehicleGone && G.place === 'verge')) { if (m === 'calm') setMood('alert'); }
  else if (m === 'alert' && B.cueT >= H.calmAfter) setMood('calm');
  /* breathing: rate by mood; held (shallow) while a beam is within 1.0 m */
  const hz = H.breathHz, mm = B.mood;
  let tHz = mm === 'alert' ? hz.alert : mm === 'afraid' ? hz.afraid : mm === 'flee' ? hz.flee : mm === 'recover' ? lerp(hz.recover[0], hz.recover[1], clamp(B.recoverT / hz.recover[2], 0, 1)) :
    mm === 'settled' ? lerp(H.settle.breath[0], H.settle.breath[1], clamp(B.settledT / 3, 0, 1)) : hz.calm;
  let amp = mm === 'afraid' ? 1.35 : mm === 'flee' ? 1.5 : mm === 'alert' ? 1.1 : mm === 'settled' ? 0.8 : mm === 'recover' ? lerp(1.35, 1, clamp(B.recoverT / 12, 0, 1)) : 1;
  const held = B.beamD <= H.heldBreath.within; B.held = held;
  if (held) amp *= H.heldBreath.amp;
  B.hz = tHz; B.amp = amp;
}

/* ------------------------------------------------------------------ ears and head (the HUD, §4.2) */
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
function azimuth(s) {
  const dx = s.x - S.x, dz = (s.z || 0) - S.z, lz = dx * S.face, lx = -dz * S.face;
  return Math.atan2(lx, lz);              // 0 ahead, +pi/2 the rabbit's left, +-pi behind
}
function earsAndHead(dt) {
  const H = BH(), mm = B.mood;
  /* AFRAID ears lie flat while it moves, under anything low, or with a human within 4 m; watching from cover with him
     further off they rise half-way and keep turning to him, so the ears still say where he is */
  const watching = mm === 'afraid' && S.still > 0.4 && !S.low && B.near > 4;
  const base = mm === 'alert' ? 0.18 : mm === 'afraid' ? (watching ? -0.35 : -1.05) : mm === 'flee' ? -1.25 : mm === 'settled' ? -0.9 : mm === 'recover' ? lerp(-1.0, 0.05, clamp(B.recoverT / 6, 0, 1)) : 0.05;
  const list = [];
  for (const [k, s] of B.src) { const v = salience(s); if (v >= P.srcMin) list.push({ k, s, v }); }
  list.sort((a, b) => b.v - a.v);
  const top = list.slice(0, 2).map(e => ({ e, phi: azimuth(e.s), elev: Math.atan2((e.s.y || 0) - (S.y + 0.25), Math.hypot(e.s.x - S.x, (e.s.z || 0) - S.z)) }));
  let yL = -0.45, yR = 0.45, pL = base, pR = base;
  const flat = (mm === 'afraid' && !watching) || mm === 'flee' || B.aimK > 0.5 ? 0.35 : 1;
  const aim = (t, side) => {
    const phi = t.phi, y = side > 0 ? clamp(wrap(phi - Math.PI / 2), -1.75, 1.9) : clamp(wrap(phi + Math.PI / 2), -1.9, 1.75);
    let p = base; if (Math.abs(phi) > 2.2) p += -0.25; if (t.e.s.wall) p += -0.45; if (t.elev > 0.35) p += 0.1;
    if (mm === 'alert' || mm === 'calm') p = Math.max(p, base - 0.5);
    return [y * flat + (side > 0 ? -0.45 : 0.45) * (1 - flat), p];
  };
  if (top.length === 1) { [yL, pL] = aim(top[0], 1); [yR, pR] = aim(top[0], -1); }
  else if (top.length >= 2) { const [a, b] = top[0].phi >= top[1].phi ? [top[0], top[1]] : [top[1], top[0]]; [yL, pL] = aim(a, 1); [yR, pR] = aim(b, -1); }
  /* when his footsteps stop (NOTICE, or simply standing) the ears hold on him, upright and still */
  if (B.noticeT >= 0 && B.noticeT < 3 && (mm === 'afraid' || mm === 'alert')) { pL = Math.max(pL, 0.1); pR = Math.max(pR, 0.1); }
  if (B.aimK > 0.3) { pL = lerp(pL, -1.25, B.aimK); pR = lerp(pR, -1.25, B.aimK); }
  const run = clamp((Math.abs(S.vx) - 0.9) / 1.5, 0, 1);
  B.ears = { pL, pR, yL, yR, w: S.grounded ? 1 - 0.65 * run : 0.4 };
  /* the head follows the strongest source by 35% when still (a glance when moving) */
  let hy = 0, hp = 0;
  if (top.length && top[0].e.v > 0.25) {
    let phi = top[0].phi; const f = S.still > 0.25 ? H.ears.headFollow : 0.12;
    hy = clamp(phi * f, -1.1, 1.1); hp = clamp(top[0].elev * (S.still > 0.25 ? 0.55 : 0.2), -0.3, 0.6);
  }
  if (mm === 'flee') { hy = 0; hp = 0; }
  B.head = { yaw: hy, pitch: hp }; B.top = top.map(t => t.e.k + ':' + t.e.v.toFixed(2));
}

/* ------------------------------------------------------------------ what the rabbit does by itself when the player lets it */
function queue(name, o) { B.queue.push(Object.assign({ name, t: 0, within: 3, needStill: true }, o)); }
function schedule(dt, dir) {
  const G = FF.G, R = RB(), still = S.still, mm = B.mood;
  /* a queued reaction waits for stillness until its window closes; if the rabbit never stopped, the additive version plays */
  B.queue = B.queue.filter(q => { q.t += dt; if (q.t <= q.within + (q.delay || 0)) return true; if (q.moving) q.moving(); return false; });
  if (!(G.mode === 'play' && G.control) || S.mode !== 'play' || B.inv) return;
  const free = !B.pose || B.pose.kind === 'idle' || B.pose.kind === 'hold';
  const calmish = mm === 'calm' || mm === 'alert' || mm === 'recover';
  /* 1. queued reactions (the far boom's sit-up, shakes after the squeeze / drain / dry ground, the rest's look back) */
  for (let i = 0; i < B.queue.length; i++) {
    const q = B.queue[i]; if (q.t < (q.delay || 0)) continue;
    if (dir || !S.grounded || still < 0.1) continue;
    if (!free && B.pose && B.pose.kind !== 'idle' && B.pose.kind !== 'hold') continue;
    if (B.pose) cancelPose(0.15);
    setPose(q.name, { dur: q.dur, kind: 'react', data: q.data }); B.queue.splice(i, 1); return;
  }
  /* 2. the settle chain (the breathing space) */
  if (chainStep(dt)) return;
  if (!free) return;
  if (dir || !S.grounded || S.push) return;
  /* 3. danger: freeze in the open, flatten only under something low or when the player holds Down, peek at a cover's edge */
  const danger = mm === 'afraid' || mm === 'flee' || (B.humanVisible && mm !== 'calm');
  if (danger && still > 0.15) {
    /* flat ONLY under anything low (§4.2) or when the player holds Down (Josh 7 Oct §9.2: it must not flatten by itself in
       open space); watching (ears live) from cover that is not low (under the deck); peeking at a cover's reachable end;
       anywhere else, a beam, the gate's glare or a far human who stops included, it freezes: ears back, a slight lowering */
    let want = 'freeze'; const c = FF.Level.coverAt(S.x, 0), inCore = c && c.core && S.x >= c.core[0] && S.x <= c.core[1];
    if (S.low || S.crouchHeld) want = 'hide';
    else if (inCore || B.hideHold) want = 'watch';
    else if (G.place === 'search' && c && c.core) want = 'peek';
    /* a short hysteresis so a beam or a shadow edge hovering at a threshold cannot flicker the posture */
    if (want !== B.holdWant) { B.holdWant = want; B.holdWantT = 0; } else B.holdWantT += dt;
    if (!B.pose || (B.pose.name !== want && (B.pose.kind !== 'hold' || B.holdWantT >= 0.3))) { if (B.pose) cancelPose(0.25); setPose(want, { loop: true, kind: 'hold' }); }
    return;
  }
  if (B.pose && B.pose.kind === 'hold') cancelPose(0.4);
  if (B.pose) return;
  if (!calmish) return;
  /* 4. calm and alert idles */
  if (B.pushBlockT >= P.rearAfter) return;
  B.idleNext -= dt; if (B.idleNext > 0) return;
  B.idleNext = rr(0.3, 0.8);
  const place = G.place, safe = mm === 'calm' && (place === 'courtyard' || place === 'rest' || (place === 'verge' && B.vehicleT < 0));
  /* the hall: a long look up, the first time it is still there */
  if (place === 'courtyard' && !B.seen.lookUp && S.x > 57 && S.x < 70 && still > 1.5) { B.seen.lookUp = true; setPose('lookup', { dur: 2.5 }); return; }
  /* after two reach-fails, a look over at the box */
  if (B.reachFails >= 2 && !B.lookedAtBox && still > 0.6) { B.lookedAtBox = true; const dx = box.x - S.x; setPose('look', { dur: 1.2, data: { yaw: Math.sign(dx * S.face) >= 0 ? 0.25 : 1.1, pitch: -0.15 } }); return; }
  /* the box: sniffs it within 0.8 m */
  if (place === 'courtyard' && B.boxSniffCool <= 0 && boxGap() < P.boxSniff && Math.sign(box.x - S.x) === S.face && still > 0.3) { B.boxSniffCool = 8; setPose('sniff', { dur: 1.6 }); return; }
  /* an edge ahead: leans and looks down */
  if (B.edgeCool <= 0 && still > 0.6 && dropAhead()) { B.edgeCool = 7; setPose('lookdown', { dur: 1.8 }); return; }
  if (still < 1.2) return;
  const r = rnd();
  if (safe && still > BH().idles.groomAfter && B.groomCool <= 0 && r < 0.35) { B.groomCool = 12; setPose('groom', { dur: 4.0 }); return; }
  if (safe && surface() === 'grass' && still > 4 && r < 0.5) { setPose('nibble', { dur: rr(2.5, 3.5) }); return; }
  if (still > BH().idles.sitUpListen && r < 0.25) { setPose('sit', { dur: rr(2.0, 3.5) }); return; }
  if (B.sniffCool <= 0 && r < 0.45) { B.sniffCool = 5; setPose('sniff', { dur: 2.0 }); return; }
}
function dropAhead() { const R = RB(), ax = S.x + S.face * (R.hw + 0.12); return S.y - floorAt(ax, S.y + 0.05) > P.edgeDrop || (FF.Level.hitSolid(ax - 0.02, ax + 0.02, S.y + 0.01, S.y + 0.2) || {}).kind === 'edge'; }
function chainStep(dt) {
  const G = FF.G, H = BH().settle;
  if (G.place !== 'rest' || B.settledSent) return false;
  if (!B.chain) {
    const sr = G.searcher, guard = sr && sr.active && /gap/.test(sr.state || '') && Math.abs(sr.x - S.x) < 4;
    const ok = !S.fleeing && !guard && S.grounded && ((S.x >= 120.2 && S.x <= 122.8 && S.still >= H.still) || (S.x >= 116 && S.still >= H.stillElsewhere));
    if (!ok) return false;
    if (B.pose) cancelPose(0.2);
    B.chain = { i: 0, wait: false }; startChain(); return true;
  }
  if (B.chain.wait && !B.pose && S.still >= H.resumeStill) { B.chain.wait = false; startChain(); }
  return true;
}

/* the solid a horizontal move to nx runs into. A solid the body already overlapped in x before the move is not a wall to
   it (it is over or under it, or dropping past its edge): the floor and fall logic own that one. Fix (7 Oct): walking off
   the fallen post's far edge at the cautious walk, the body still overlaps the post by ~2 cm as it starts to drop, and the
   old test (any overlap, resolved by the direction of travel) snapped the rabbit back to the post's near side. */
function xHit(nx, y0, y1) {
  const hw = RB().hw, ox0 = S.x - hw, ox1 = S.x + hw;
  for (const s of FF.Level.solidsIn(nx - hw, nx + hw, y0, y1)) if (!(ox1 > s.x0 + 1e-6 && ox0 < s.x1 - 1e-6)) return s;
  return null;
}

/* ------------------------------------------------------------------ the run input */
/* Shift / the pad's run button (X, RB, RT): ff-main.js maps them to the 'run' action. */
function runHeld() { return !!FF.Input.down('run'); }

/* the one quiet "Shift run" hint (Josh 7 Oct §9.1): a first-timer meets it in a safe stretch early in the Verge (after the
   post, before the van comes), while moving; skipped if the player has already found Shift; a second chance on entering
   the Courtyard (a Continue from a save). UI shows each hint once per session (and never in the Search). */
function runHint(dt, ctl) {
  if (S.run && Math.abs(S.vx) > 1.6) { B.ranT += dt; B.seen.ranAt = FF.G.t; }
  if (!ctl || S.mode !== 'play' || !S.grounded || S.squeeze || Math.abs(S.vx) < 0.3) return;
  const H = P.runHint, place = FF.G.place;
  const verge = place === 'verge' && S.x >= H.x0 && S.x <= H.x1 && B.vehicleT < 0, court = place === 'courtyard' && S.x >= H.court[0] && S.x <= H.court[1];
  if (!B.seen.runHint && B.ranT < H.ranBefore && (verge || court)) {
    B.seen.runHint = true; if (court) B.seen.runHint2 = true;
    FF.bus.emit('hint', { id: 'hint-run', arg: 'run', x: +S.x.toFixed(2) });
    return;
  }
  /* v2 review fixes: the reminder before the Search. A player who has not run (Shift) for remindAfter seconds is shown the
     same quiet hint once more as they walk into the Courtyard (once per session; never in the Search) */
  if (court && !B.seen.runHint2 && FF.G.t - (B.seen.ranAt != null ? B.seen.ranAt : -1e9) > H.remindAfter) {
    B.seen.runHint2 = true;
    FF.bus.emit('hint', { id: 'hint-run-again', arg: 'run-again', x: +S.x.toFixed(2) });
  }
}

/* ------------------------------------------------------------------ crouch transitions (presentation of the crouch) */
const ease = (k, t, tau, dt) => k + (t - k) * (1 - Math.exp(-dt / tau));
/* is anything lower than lowPoseUnder over the lane span [x0, x1] (either order) at the rabbit's floor? */
function lowOver(x0, x1) { const a = Math.min(x0, x1), b = Math.max(x0, x1); return FF.Level.ceilingAbove((a + b) / 2, (b - a) / 2, S.y) - S.y < RB().lowPoseUnder; }
/* the front (centre to nose, looking a little ahead) lowers as it reaches something low; the rear (tail to centre, a shorter
   look ahead) follows; each rises once its own part has cleared. Down lowers the front at once, the hips 0.06 s later. The
   collision crouch (S.crouch) is unchanged: this is only how the body gets there. */
function crouchStep(dt) {
  const R = RB(), f = S.face || 1, v = Math.abs(S.vx), lead = P.crouchLead + P.crouchLeadPerV * v;
  const held = !!(S.crouchHeld || B.hideHold || (S.mode !== 'play' && S.crouch));
  S.crouchHeldT = held ? S.crouchHeldT + dt : 0;
  const frontLow = lowOver(S.x, S.x + f * (R.hw + lead)), rearLow = lowOver(S.x - f * R.hw, S.x + f * lead * 0.8);
  const tf = held || frontLow ? 1 : 0, tr = (held && S.crouchHeldT >= P.crouchFollow) || rearLow ? 1 : 0;
  S.crouchF = ease(S.crouchF, tf, tf > S.crouchF ? P.crouchDown[0] : P.crouchUp[0], dt);
  S.crouchR = ease(S.crouchR, tr, tr > S.crouchR ? P.crouchDown[1] : P.crouchUp[1], dt);
  /* the squeeze, for the animation: 'in' while the hips have not reached it yet (head and shoulders first), 'under' while
     the nose has not passed its far side, 'out' while the hips are still under it; k = progress across it */
  const q = S.squeeze;
  if (!q) { S.sq = null; return; }
  const s = q.solid, near = f > 0 ? s.x0 : s.x1, far = f > 0 ? s.x1 : s.x0, past = (x, e) => (x - e) * f >= 0;
  const nose = S.x + f * R.hw, tail = S.x - f * R.hw;
  const phase = !past(tail, near) ? 'in' : !past(nose, far) ? 'under' : 'out';
  S.sq = { phase, id: s.id, short: q.short, clear: +q.clear.toFixed(3), k: clamp((S.x - near) * f / Math.max(0.05, s.x1 - s.x0), 0, 1) };
}

/* ------------------------------------------------------------------ the gait (timing only; see GAITS) */
function freshGait() { return { name: 'idle', phase: 0, stride: GAITS.walk.stride, cadence: 0, speed: 0, runK: 0, feet: { hindL: true, hindR: true, foreL: true, foreR: true }, stance: null, lift: { front: 0, rear: 0 } }; }
/* the stance windows of the gait now (walk and run blend by speed) */
function windowsOf(name, runK) {
  if (name === 'crouch' || name === 'push') return GAITS[name];
  const W = GAITS.walk, Rn = GAITS.run, o = {};
  for (const k of FEET) o[k] = [lerp(W[k][0], Rn[k][0], runK), lerp(W[k][1], Rn[k][1], runK)];
  o.lift = [lerp(W.lift[0], Rn.lift[0], runK), lerp(W.lift[1], Rn.lift[1], runK)]; o.cap = lerp(W.cap, Rn.cap, runK); o.dip = lerp(W.dip, Rn.dip, runK);
  return o;
}
/* the support interval of an end around p (the union of its two feet's windows), unwrapped */
function supportAround(ws, p) {
  let iv = null; for (const w of ws) for (const k of [-1, 0]) if (p >= w[0] + k && p < w[1] + k) iv = iv ? [Math.min(iv[0], w[0] + k), Math.max(iv[1], w[1] + k)] : [w[0] + k, w[1] + k];
  if (!iv) return null;
  for (let n = 0; n < 2; n++) for (const w of ws) for (const k of [-1, 0, 1]) { const a = w[0] + k, b = w[1] + k; if (b > iv[0] && a < iv[1]) iv = [Math.min(iv[0], a), Math.max(iv[1], b)]; }
  return iv;
}
/* the vertical offset of one end of the body at phase p: off the ground it follows a parabola no higher than gravity allows
   in the time it is up (k of the ballistic apex, capped); on the ground the legs flex a little under the load */
function endLift(ws, p, cad, k, cap, dip, on) {
  const gap = gapAround(ws, p);
  if (gap) {
    const T = (gap[1] - gap[0]) / Math.max(cad, 1e-3), h = Math.min(cap, k * GRAV * T * T / 8) * on, u = (p - gap[0]) / (gap[1] - gap[0]);
    return h * 4 * u * (1 - u);
  }
  const iv = supportAround(ws, p); if (!iv) return 0;
  return -dip * on * Math.sin(Math.PI * clamp((p - iv[0]) / (iv[1] - iv[0]), 0, 1));
}
/* v2 review fixes: when the cycle changes under a moving rabbit (walk <-> crouch-walk going under something, walk <-> push at
   the box), the phase is remapped to the point of the new cycle where every foot is closest to where it is now (planted or
   swinging, and how far along), so no foot jumps from planted to mid-swing in one frame (it popped ~10 cm at the hoarding).
   footRel: one foot's body-space z (relative to its stance centre) and lift at phase p, as ff-rabbit.js draws it. */
const smoother = u => u * u * u * (u * (u * 6 - 15) + 10);
function footRel(w, p, stride) {
  const dur = Math.max(0.02, w[1] - w[0]), zTd = stride * dur / 2;
  for (const j of [0, 1, -1]) { const q = p + j; if (q >= w[0] && q < w[1]) return [zTd - stride * (q - w[0]), 0]; }
  for (const j of [0, 1, -1]) { const q = p + j; if (q >= w[1] && q < w[0] + 1) { const u = (q - w[1]) / Math.max(0.02, w[0] + 1 - w[1]); return [-zTd + 2 * zTd * smoother(u), 0.025 * Math.sin(Math.PI * u)]; } }
  return [0, 0];
}
function remapPhase(Wa, sa, Wb, sb, p) {
  const A = FEET.map(f => footRel(Wa[f], p, sa));
  let best = p, bc = Infinity;
  for (let i = 0; i < 100; i++) {
    const q = i / 100; let c = 0;
    for (let k = 0; k < 4; k++) { const b = footRel(Wb[FEET[k]], q, sb); c += (b[0] - A[k][0]) ** 2 + 4 * (b[1] - A[k][1]) ** 2; }
    if (c < bc - 1e-12) { bc = c; best = q; }
  }
  return best;
}
function gaitTakeoff() { const g = S.gait; if (!g) return; const w = windowsOf(g.name === 'crouch' || g.name === 'push' ? g.name : 'walk', g.runK); g.phase = Math.max(w.hindL[1], w.hindR[1]) % 1; }
/* every fixed step: which cycle, the stride for this speed, the phase from the distance moved, the feet, the body's lift */
function gaitStep(dt) {
  const g = S.gait; if (!g) return;
  const v = Math.abs(S.vx), lowNow = S.crouch || S.low || S.crouchF > 0.5 || !!S.squeeze;
  let name;
  if (S.mode !== 'play') name = 'idle';
  else if (!S.grounded) name = 'air';
  else if (S.push) name = 'push';
  else if (lowNow) name = v > 0.02 ? 'crouch' : 'idle';
  else name = v > 0.02 ? 'walk' : 'idle';
  const runK = name === 'walk' ? sstep(1.35, 2.1, v) : 0;
  const cyc = name === 'crouch' || name === 'push' ? name : 'walk';
  const stride = cyc === 'walk' ? lerp(strideOf(GAITS.walk, v), strideOf(GAITS.run, v), runK) : strideOf(GAITS[cyc], v);
  const W = windowsOf(cyc, runK);
  if (name !== 'air' && name !== 'idle') {
    if (g.cyc && g.cyc !== cyc && g.cycW) { const from = g.phase; g.phase = remapPhase(g.cycW, g.cycStride, W, stride, g.phase); g.remap = { from: g.cyc, to: cyc, p0: +from.toFixed(3), p1: +g.phase.toFixed(3) }; }
    g.cyc = cyc; g.cycW = W; g.cycStride = stride;
  }
  /* the phase moves only with the rabbit's own travel over the ground (not while riding the box, not in the air) */
  if (name !== 'air' && name !== 'idle') {
    g.phase += v * dt / stride;
    if (g.phase >= 1) {
      g.phase -= 1;
      /* the hind feet touch down: the footstep (none crouched: the creep and the squeeze are silent, as before) */
      if (v > 0.3 && name !== 'crouch' && S.mode === 'play') FF.bus.emit('rabbit:step', { x: +S.x.toFixed(2), y: +S.y.toFixed(2), run: +clamp((v - 0.9) / 1.5, 0, 1).toFixed(2), gait: runK > 0.5 ? 'run' : name, surface: surface(), place: FF.G.place });
    }
  }
  const cad = name === 'air' || name === 'idle' ? 0 : v / stride, on = name === 'air' || name === 'idle' ? 0 : sstep(0.12, 0.5, v);
  g.name = name === 'walk' && runK > 0.5 ? 'run' : name; g.runK = runK; g.stride = stride; g.cadence = cad; g.speed = v; g.stance = W;
  for (const k of FEET) g.feet[k] = name === 'idle' ? true : name === 'air' ? false : inWin(W[k], g.phase);
  g.lift.front = cad ? endLift([W.foreL, W.foreR], g.phase, cad, W.lift[0], W.cap, W.dip, on) : 0;
  g.lift.rear = cad ? endLift([W.hindL, W.hindR], g.phase, cad, W.lift[1], W.cap, W.dip, on) : 0;
}

/* ------------------------------------------------------------------ the module */
const Player = FF.Player = {
  GAITS,
  stub: false,
  async init(c) {
    ctx = c; freshB(false); ductLink = link('duct');
    rig = await FF.Rabbit.create(FF.LOOK, { file: FF.MODELS.rabbit, seed: 5 });
    rig.object.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    c.scene.add(rig.object);
    FF.G.rabbit = S; FF.G.box = box;
    const on = (n, f) => FF.bus.on(n, d => { try { f(d || {}); } catch (e) { FF.report(e, 'Player.' + n); } });
    /* every sound anyone plays: the ears weigh it (the rabbit's own sounds are ignored) */
    on('sound', d => {
      if (!d.cue || /^rabbit/.test(d.cue) || d.x == null) return;
      const c = classify(String(d.cue)), gain = d.gain == null ? 1 : clamp(d.gain, 0, 1.5);
      if (d.stop || gain === 0) { B.src.delete('snd:' + (d.id || d.cue)); return; }
      addSrc('snd:' + (d.id || d.cue), { x: d.x, y: d.y || 0, z: d.z || 0, w: c.w * Math.max(0.5, gain), life: d.loop ? 6 : c.life, kind: c.kind, decay: c.kind === 'door', wall: (d.z || 0) < -4.0 && FF.G.place === 'verge', quiet: c.kind === 'ambient' });
    });
    on('sound-cue', d => {
      if (d.arg === 'far-boom') {
        addSrc('boom', { x: S.x + 40, y: 9, z: -26, w: 0.95, life: 2.8, kind: 'boom', wall: true, decay: true, far: true });
        queue('sit', { dur: FF.RULES.listen.auto.firstBoom || 1.2, within: 1.0 });   // A2: sits up only if standing still
      }
    });
    on('vehicle-arrive', () => { if (B.vehicleT < 0) { B.vehicleT = 0; B.cueT = 0; B.add.snap = 0; } });
    on('vehicle', d => { const ph = String(d.phase || ''); if (/stop/.test(ph)) { B.vehicleStopped = true; B.stopAt = B.vehicleT; } if (/leave|gone|away/.test(ph)) B.vehicleGone = /gone/.test(ph) || B.vehicleGone; if (d.x != null) addSrc('engine', { x: d.x, y: 1, z: d.z != null ? d.z : -8.5, w: 0.8, life: 1.5, kind: 'engine', wall: true }); });
    on('gate-lit', () => { B.vehicleStopped = B.vehicleStopped || B.vehicleT >= 3.5; });
    on('gate', d => { if (/open|crack|slide|give/.test(String(d.phase || ''))) B.gateOpen = true; addSrc('gate', { x: 33.0, y: 0.8, z: -4.0, w: 0.9, life: 2, kind: 'door', decay: true }); });
    on('person-out', () => { if (B.personOutT < 0) B.personOutT = 0; });
    on('person', d => { if (d.phase === 'out' && B.personOutT < 0) B.personOutT = 0; });
    on('torch-down', d => {
      const ph = String(d.phase || 'start'); if (/end|up|off|withdraw/.test(ph)) { B.torchDownT = -1; return; } if (/reach/.test(ph)) return;
      B.torchDownT = 0; addSrc('vtorch', { x: 38.75, y: 0.2, z: -0.5, w: 0.9, life: 3, kind: 'torch' });
      /* a look back towards the crack (it is already in the pipe, A14) */
      if (S.x > 39.6 && S.y < -0.5) { B.add.look = 0; B.add.lookDir = S.face > 0 ? -1 : 1; }
    });
    on('walkway', d => {
      const ph = String(d.phase || ''); if (/thud|done/.test(ph)) return; B.walkwayT = 0;
      addSrc('walkway', { x: d.x != null ? d.x : 78.0, y: 3.9, z: -14.45, w: 0.9, life: 2.5, kind: /boot|step|walk/.test(ph) ? 'steps' : 'door', decay: true });
      if (/lamp|amber|click|relay|open/.test(ph)) { B.add.snap = 0; B.cueT = 0; }
    });
    on('entry', d => {
      const ph = String(d.phase || '');
      if (ph === 'cue') addSrc('door-steps', { x: 110.0, y: 0.5, z: -3.1, w: 1.0, life: 2.6, kind: 'steps' });
      else if (ph === 'doorway') addSrc('door', { x: 110.0, y: 1.0, z: -3.0, w: 0.9, life: 2, kind: 'door', decay: true });
      else if (/aim/.test(ph)) addSrc('click', { x: (FF.G.searcher && FF.G.searcher.x) || 110, y: 1.3, z: -1.15, w: 0.9, life: 1.5, kind: 'torch', decay: true });
    });
    on('ai:state', d => {
      const to = String(d.to || '');
      if (to === 'spotted') B.add.startle = 0;          // the 0.15 s additive startle (control kept)
      if (to === 'notice') { B.noticeT = 0; B.cueT = 0; }
    });
    on('shake-off', () => { if (!B.seen.dryShake) { B.seen.dryShake = true; queue('shake', { dur: 0.8, within: 3, moving: () => { B.add.shake = 0; } }); } });
    on('safe', () => { if (B.mood === 'flee' || B.mood === 'afraid') { B.escaped = true; } });
    on('mode', d => { if (d.to === 'play' && B.pose && B.pose.kind === 'title') cancelPose(0.25); });
    on('fail', () => { B.frozen = true; S.vx = 0; if (B.pose) cancelPose(0.05); setPose('flinch', { loop: true, kind: 'script', cancel: 'none' }); });
    on('end', d => { if (d.phase && d.phase !== 'settled') B.locked = true; });
  },
  get rig() { return rig; },
  reset(cp, opts) {
    opts = opts || {};
    const p = FF.S1.pushables[0];
    Object.assign(box, { x: p.x, vx: 0, w: p.w, h: p.h, d: p.d, minX: p.minX, maxX: p.maxX });
    const newGame = opts.reason === 'title' || opts.reason === 'start' || opts.first;
    rs = (hash(String(cp.id || 'warp') + ':' + (FF.Q.get('seed') || 1)) || 1) >>> 0;
    freshB(!newGame);
    Object.assign(S, { x: cp.x, y: cp.y || 0, z: 0, vx: 0, vy: 0, face: cp.face || 1, grounded: true, crouch: cp.pose === 'hide', squeeze: null, onBox: false, push: false, effort: 0,
      run: false, hop: false, crouchHeld: false, crouchHeldT: 0, crouchF: cp.pose === 'hide' ? 1 : 0, crouchR: cp.pose === 'hide' ? 1 : 0, gait: freshGait(), sq: null, airT: 0, landed: false, cut: false, coyote: 0, buf: 0, yaw: Math.PI / 2 * (cp.face || 1), mode: 'play', modeT: 0,
      mood: 'calm', pose: cp.pose || null, still: 0, visible: true, low: false, inCore: false, hidden: false, fleeing: false, settle: null, duckT: 0, peakY: cp.y || 0,
      blockedBy: null, ears: B.ears, breath: 1 });
    S.y = floorAt(S.x, S.y + 0.05);
    if (cp.pose === 'groom') setPose('groom', { loop: true, kind: 'title', cancel: 'any', out: 0.25 });
    else if (cp.pose === 'hide') { B.hideHold = true; setMood('afraid'); S.mood = 'afraid'; setPose(FF.Level.ceilingAbove(S.x, RB().hw, S.y) - S.y < RB().lowPoseUnder ? 'hide' : 'watch', { loop: true, kind: 'hold' }); }
    if (FF.Level.section(S.x, S.y) === 'search' || opts.reason === 'fail') { setMood('afraid'); B.searchT = 0; }
    S.mood = B.mood;
  },
  /* the 3 sight points in world x/y (FF.RULES.rabbit.samples; crouched set when crouched, squeezing or under a low ceiling) */
  sightPoints() {
    const low = S.crouch || FF.Level.ceilingAbove(S.x, RB().hw, S.y) - S.y < RB().lowPoseUnder;
    return (low ? RB().samples.crouch : RB().samples.stand).map(([dx, dy]) => [S.x + dx * S.face, S.y + dy]);
  },
  step(dt) {
    const G = FF.G, In = FF.Input, R = RB(); S.landed = false; S.modeT += dt;
    tickTimers(dt);
    if (S.mode !== 'play') { stepLink(dt); crouchStep(dt); gaitStep(dt); behave(dt, 0, false); return; }
    if (B.frozen) { S.vx = 0; crouchStep(dt); gaitStep(dt); behave(dt, 0, false); return; }
    const ctl = G.control && !B.locked;
    let dir = ctl ? In.axis() : 0;
    let up = ctl && In.took('up'), jumpP = ctl && In.took('jump');
    /* involuntary holds: the reach-fail; the channel lip (only movement towards the edge is held); the rest's auto-stop */
    if (B.inv && B.inv.kind === 'reach') { dir = 0; up = jumpP = false; }
    if (B.inv && B.inv.kind === 'lip' && dir === B.inv.dir) dir = 0;
    if (B.lipHold && dir === B.lipHold) dir = 0; else if (B.lipHold && dir !== B.lipHold) B.lipHold = 0;
    if (B.autoStop) { if (In.axis() === 0) B.autoStop = false; dir = 0; }
    /* any movement input or jump ends an expressive pose within 0.15 s (involuntary and scripted ones excepted) */
    if (B.pose && (dir || up || jumpP)) {
      const c = B.pose.cancel;
      if (c === 'any' || (c === 'away' && dir !== B.pose.dir)) cancelPose(B.pose.kind === 'chain' ? BH().settle.interrupt : B.pose.kind === 'title' ? 0.25 : 0.15);
    }
    if (B.hideHold && (dir || up || jumpP)) B.hideHold = false;

    /* the raised opening: Up or Space on the box under it climbs in */
    if ((up || jumpP) && S.onBox && Math.abs(S.x - ductLink.from.x) < R.climbIn.maxDx) {
      S.mode = 'climb'; S.modeT = 0; S.vx = 0; G.control = false; S.onBox = false; S.push = false;
      if (B.pose) cancelPose(0.1); setPose('climb', { dur: ductLink.climbIn, kind: 'script', cancel: 'none' });
      FF.bus.emit('transit', { phase: 'climb' }); behave(dt, 0, false); return;
    }
    /* A15: a jump under the opening from the floor, with no box top within reach, is the reach-fail */
    if ((up || jumpP) && S.grounded && !S.onBox && S.y < 0.1 && Math.abs(S.x - ductLink.from.x) < R.climbIn.maxDx && boxGap() > P.reachBoxGap) {
      B.reachFails++; B.inv = { kind: 'reach', t: 0, dur: R.reachFail };
      if (B.pose) cancelPose(0.08); setPose('reach', { dur: R.reachFail, kind: 'invol', cancel: 'none' });
      S.vy = Math.sqrt(2 * R.gravity * R.jumpHeight); S.grounded = false; S.vx = 0; S.airT = 0; S.cut = true; up = jumpP = false; dir = 0;
      FF.bus.emit('rabbit:reach-fail', { x: +S.x.toFixed(2), n: B.reachFails });
    }

    /* crouch: held, or forced by a low ceiling; squeezes (A9): a duck, then the duck-under or creep speed */
    const sq = FF.Level.squeezeAt(S.x + dir * 0.03, R.hw, S.y);
    if (sq && !S.squeeze) {
      /* the hesitation belongs to the hoarding only (A9: the first squeeze, a safe place). Integration fix: after a warp, a
         Continue or a restart the "first" squeeze in a session could be a Search skirt, where a 0.45 s stall under pressure
         was unfair (and not what the checker models). */
      const first = !B.seen.firstSqueeze && sq.short && sq.solid.id === 'hoarding';
      S.duckT = (sq.short ? R.duckUnder.duck : R.creep.duck) + (first ? R.firstSqueezeHesitate : 0);
      if (first) { B.seen.firstSqueeze = true; B.firstSqueezeId = sq.solid.id; if (B.pose) cancelPose(0.1); setPose('hesitate', { dur: R.firstSqueezeHesitate, kind: 'invol', cancel: 'none' }); }
      FF.bus.emit('rabbit:squeeze', { phase: 'start', id: sq.solid.id, short: sq.short, x: +S.x.toFixed(2) });
    } else if (!sq && S.squeeze) {
      FF.bus.emit('rabbit:squeeze', { phase: 'end', id: S.squeeze.solid.id, short: S.squeeze.short, x: +S.x.toFixed(2) });
      /* out the other side of the first squeeze (the hoarding): a shake */
      if (S.squeeze.solid.id === B.firstSqueezeId && !B.seen.firstShake) { B.seen.firstShake = true; queue('shake', { dur: 0.8, within: 2.5, moving: () => { B.add.shake = 0; } }); }
    }
    S.squeeze = sq;
    const want = ctl && In.down('down') && S.grounded;
    S.crouchHeld = !!want;
    if (want || sq || B.hideHold) S.crouch = true; else if (S.crouch && FF.Level.ceilingAbove(S.x, R.hw, S.y) - S.y >= R.h) S.crouch = false;

    /* the speed is only what the player asks for (Josh 7 Oct §9.1): a direction alone = the cautious walk, for as long as it
       is held; Shift + a direction = the run, which is the flee while he is chasing (fleeRunsAtOnce: no ramp); Down = the
       crouch-walk (also the speed while stuck under something lower than the standing height). A squeeze only CAPS it. */
    const flee = fleeing(); S.fleeing = flee;
    const run = !!(ctl && dir && runHeld()); S.run = run;
    let top = run ? (flee ? R.flee : R.run) : R.walk;
    if (want || B.hideHold || (S.crouch && !sq)) top = R.crouch;
    let sqTop = 0;
    if (sq) { sqTop = sq.short ? (flee ? R.duckUnder.fleeSpeed : R.duckUnder.speed) : R.creep.speed; top = Math.min(top, sqTop); }
    if (S.duckT > 0) { S.duckT -= dt; top = 0; }
    const tgt = dir * top;
    const hopCarry = !S.grounded && S.hop && dir && S.vx * dir > top;          // a forward hop keeps its leap, easing off (hopDrag)
    const a = hopCarry ? (R.hopDrag || R.airAccel) : !S.grounded ? R.airAccel : dir === 0 ? R.decel : (S.vx * dir < -0.05 ? R.turn : (Math.abs(S.vx) > top ? R.decel : R.accel * (flee && run ? 1.2 : 1)));
    S.vx = approach(S.vx, tgt, a * dt);
    if (sq && sqTop && Math.abs(S.vx) > sqTop) S.vx = Math.sign(S.vx) * sqTop;        // the Search checker's squeeze clamp
    if (dir) S.face = dir;

    /* the box: slides only when pushed; friction stops it; it cannot climb a step >= maxStep (the lip and kerb) */
    const pushing = S.push && dir === Math.sign(box.x - S.x) && S.grounded;
    if (!pushing) box.vx = approach(box.vx, 0, FF.RULES.box.friction * dt);
    if (box.vx) {
      const nx = clamp(box.x + box.vx * dt, box.minX, box.maxX); const s = FF.Level.hitSolid(nx - box.w / 2, nx + box.w / 2, FF.RULES.box.maxStep, box.h);
      if (s || nx !== box.x + box.vx * dt) { box.vx = 0; if (!s) box.x = nx; } else box.x = nx;
      if (S.onBox) S.x += box.vx * dt;
    }

    /* move x against the solids (step up <= stepUp), the ground profile and the box */
    S.push = false; S.blockedBy = null;
    let nx = S.x + S.vx * dt; const h = heightNow();
    const hit = xHit(nx, S.y + 0.001, S.y + h);
    if (hit) {
      if (S.grounded && hit.y1 - S.y <= R.stepUp && FF.Level.ceilingAbove(nx, R.hw, hit.y1) - hit.y1 >= R.hCrouch) S.y = hit.y1;
      else { nx = S.vx > 0 ? hit.x0 - R.hw - 1e-4 : hit.x1 + R.hw + 1e-4; S.vx = 0; S.blockedBy = hit; }
    } else if (dir && S.grounded) {
      /* pressed against something while standing still (the post, the channel edge) */
      const ahead = FF.Level.hitSolid(S.x + dir * R.hw - (dir < 0 ? 0.004 : 0), S.x + dir * R.hw + (dir > 0 ? 0.004 : 0), S.y + 0.001, S.y + h);
      if (ahead && Math.abs(S.vx) < 0.05) S.blockedBy = ahead;
    }
    const lead = nx + R.hw * Math.sign(S.vx || S.face);
    if (S.vx && FF.Level.groundY(lead) > S.y + R.stepUp + 1e-3) { nx = S.x; S.vx = 0; }
    const b = boxSpan();
    if (nx + R.hw > b.x0 && nx - R.hw < b.x1 && S.y + h > b.y0 + 0.001 && S.y < b.y1 - 0.02) {
      const side = S.x < box.x ? -1 : 1;
      nx = side < 0 ? b.x0 - R.hw - 1e-4 : b.x1 + R.hw + 1e-4;
      if (S.grounded && dir === -side && !S.crouch) { S.push = true; box.vx = approach(box.vx, dir * FF.RULES.box.push, FF.RULES.box.accel * dt); S.vx = box.vx; if (B.pose) cancelPose(0.12); }
      else if (S.grounded || S.vx * side > 0) S.vx = 0;     /* in the air, pressing towards the box keeps its speed, so a hop from beside it lands on top */
    }
    S.x = nx;
    S.effort = approach(S.effort, S.push ? (Math.abs(box.vx) < 0.15 ? 1 : 0.5) : 0, 4 * dt);
    const moving = Math.abs(box.vx) > 0.02; if (moving !== B.wasBoxMoving) { B.wasBoxMoving = moving; FF.bus.emit('box', { moving, v: +box.vx.toFixed(3), x: +box.x.toFixed(3) }); }

    /* the post (and any low wall) walked into: rears a little and sniffs its top; the channel lip: "not yet" */
    const blk = S.blockedBy;
    if (blk && blk.kind === 'kerb' && blk.y1 - S.y > R.stepUp && dir) B.pushBlockT += dt; else B.pushBlockT = 0;
    if (B.pushBlockT >= P.rearAfter && (!B.pose || B.pose.kind === 'idle') && !B.inv) setPose('rear', { loop: true, kind: 'react', cancel: 'away', dir });
    if (B.pose && B.pose.name === 'rear' && (!blk || dir !== B.pose.dir)) cancelPose(0.2);
    if (blk && blk.kind === 'edge' && dir && B.lipCool <= 0 && !B.inv && S.grounded) {
      B.inv = { kind: 'lip', dir, t: 0 }; if (B.pose) cancelPose(0.1); setPose('lookdown', { dur: P.lipLook, kind: 'lip', cancel: 'away', dir });
    }

    /* jump: buffered presses, coyote time, a cut when released early; not while squeezed or under a low hide */
    if (jumpP || up) S.buf = R.buffer; else S.buf = Math.max(0, S.buf - dt);
    S.coyote = S.grounded ? R.coyote : Math.max(0, S.coyote - dt);
    if (S.buf > 0 && S.coyote > 0 && !S.crouch && FF.Level.ceilingAbove(S.x, R.hw, S.y) - S.y > P.jumpHeadroom) {
      S.vy = Math.sqrt(2 * R.gravity * R.jumpHeight); S.grounded = false; S.coyote = 0; S.buf = 0; S.airT = 0; S.cut = false; S.onBox = false;
      /* a hop with a direction held leaps forward like a rabbit (v2 review: at the walk it went nearly straight up and landed
         short of the post): at least hopMin at take-off, easing off in the air (hopDrag) */
      if (dir && R.hopMin) { S.vx = dir * Math.max(dir * S.vx, R.hopMin); S.hop = true; }
      if (B.pose && B.pose.cancel !== 'none') cancelPose(0.1);
      gaitTakeoff();
      FF.bus.emit('rabbit:jump', { x: +S.x.toFixed(2), y: +S.y.toFixed(2) });
    }
    /* the early-release cut (a lower hop on a quick tap) is for hops on the spot; a forward hop is a whole leap however briefly
       Space was pressed (v2 review: a tapped walking hop fell short of the post) */
    if (!S.grounded && S.vy > 0 && !S.hop && !(ctl && (In.down('jump') || In.down('up'))) && !S.cut && S.airT >= P.jumpCutAfter) { S.vy *= R.jumpCut; S.cut = true; }

    /* move y: follow the ground down slopes, fall, land on floors and the box top, bump heads */
    const wasG = S.grounded;
    if (S.grounded && S.vy <= 0) { const f = floorAt(S.x, S.y + 0.02); if (f >= S.y - 0.12) { S.y = f; S.vy = 0; } else { S.grounded = false; S.peakY = S.y; } }
    if (!S.grounded) {
      S.vy -= R.gravity * (S.vy < 0 ? R.fallGravity : 1) * dt;
      let ny = S.y + S.vy * dt; const f = floorAt(S.x, S.y + 0.001);
      if (S.vy <= 0 && ny <= f) { ny = f; S.grounded = true; S.vy = 0; }
      const c = FF.Level.ceilingAbove(S.x, R.hw, S.y + 0.01); if (S.vy > 0 && ny + h > c) { ny = c - h - 1e-4; S.vy = 0; }
      S.y = ny; if (S.y > S.peakY) S.peakY = S.y;
    } else S.peakY = S.y;
    const bb = boxSpan(); S.onBox = S.grounded && Math.abs(S.y - bb.y1) < 0.01 && S.x > bb.x0 - R.hw * 0.5 && S.x < bb.x1 + R.hw * 0.5;
    if (S.grounded && !wasG) {
      S.landed = true; S.hop = false; const fall = Math.max(0, S.peakY - S.y);
      FF.bus.emit('rabbit:land', { x: +S.x.toFixed(2), y: +S.y.toFixed(2), h: +fall.toFixed(2), surface: S.y < -0.5 ? 'water' : surface(), place: G.place });
      if (S.y < -0.5 && fall > 0.5) B.add.splash = 0;    // into the culvert's chamber: a splash and recover
    }
    if (!S.grounded) S.airT += dt;
    S.still = Math.abs(S.vx) < 0.05 && S.grounded && !dir ? S.still + dt : 0;
    crouchStep(dt); gaitStep(dt);
    runHint(dt, ctl);
    behave(dt, dir, up || jumpP);
  },
  frame(dt) {
    if (!rig) return;
    let yawT = Math.PI / 2 * S.face;
    if (S.mode === 'climb' && S.modeT > 0.1) yawT = Math.PI * (S.face >= 0 ? 1 : -1);          // turns to face the opening (away from the lens)
    else if (S.mode === 'popout') yawT = S.modeT < 0.75 ? 0 : Math.PI / 2;                      // comes out towards the lens, then turns right
    else if (B.inv && B.inv.kind === 'reach') yawT = Math.PI * (S.face >= 0 ? 1 : -1) * 0.82;   // stretched up at the wall
    S.yaw += (yawT - S.yaw) * (1 - Math.exp(-dt * (S.mode === 'climb' || S.mode === 'popout' ? 10 : 16)));
    rig.object.visible = S.visible !== false;
    rig.object.position.set(S.x, S.y, S.z); rig.object.rotation.y = S.yaw;
    rig.update(dt, animInput());
    /* the footsteps (rabbit:step) now come from the gait cycle in step(): the hind feet's touchdown */
    if (FF.World && FF.World.prop) FF.World.prop('box').position.set(box.x, 0, 0);
    const L = FF.LOOK, look = (FF.World && FF.World.look) || L;
    FF.setAOBox(0, [box.x, box.h / 2, 0], [box.w / 2, box.h / 2, box.d / 2], L.ao.objects, L.ao.objectReach);
    const ground = floorAt(S.x, S.y + 0.02), air = Math.max(0, S.y - ground);
    FF.U.uFFRab.value.set(S.x, ground, S.z, S.visible === false ? 0 : L.ao.rabbit * Math.exp(-air * 7));
    const lowK = S.crouch || S.low || S.pose === 'loaf' || S.pose === 'hide' || S.pose === 'watch';
    FF.U.uFFRabAx.value.set(lowK ? 0.26 : 0.24, lowK ? 0.14 : 0.12);
    /* the readability floor from the live look (the world sets look.rabbit per place); in a hide core the rim drops to
       behave.hideRim (never to zero, §4.2) */
    const RU = FF.Rabbit.uniforms;
    if (RU) {
      const lr = (look && look.rabbit) || L.rabbit; RU.lift.value = lr.lift != null ? lr.lift : L.rabbit.lift;
      const want = S.hidden ? Math.min(1, BH().hideRim / Math.max(0.05, lr.rimStrength || L.rabbit.rimStrength)) : 1;
      RU.rimK.value += (want - RU.rimK.value) * (1 - Math.exp(-dt * P.rimEase));
    }
  },
  /* scripted poses other modules may ask for: 'groom', 'hide', 'look-back', 'settle', 'sniff', 'sit', 'shake', 'freeze',
     'peek', 'lookup', 'nibble', 'flinch', or null to end the current one */
  setPose(name) {
    if (!name) { cancelPose(0.2); return; }
    const alias = { 'look-back': 'lookback', settle: 'loaf', listen: 'sit' }, n = alias[name] || name;
    if (!FF.Rabbit.POSES || !FF.Rabbit.POSES[n]) return;
    if (B.pose) cancelPose(0.15);
    if (n === 'loaf') { B.chain = { i: CHAIN.length - 1, wait: false }; startChain(); return; }
    const dur = { lookback: 1.2, shake: 0.8, sniff: 2.0, sit: 2.0, lookup: 2.5, nibble: 3.0 }[n];
    setPose(n, dur ? { dur, kind: 'react', data: n === 'lookback' ? { dir: S.face > 0 ? -1 : 1, dur: 1.2 } : null } : { loop: true, kind: 'react' });
  },
  dispose() {},
  debug() {
    return { stub: false, x: +S.x.toFixed(3), y: +S.y.toFixed(3), vx: +S.vx.toFixed(3), mode: S.mode, crouch: S.crouch, low: S.low, squeeze: S.squeeze ? S.squeeze.solid.id : null,
      onBox: S.onBox, box: +box.x.toFixed(3), mood: B.mood, pose: B.pose ? B.pose.name : null, poseKind: B.pose ? B.pose.kind : null, poseT: B.pose ? +B.pose.t.toFixed(2) : null,
      settle: S.settle, chain: B.chain ? Object.assign({}, B.chain) : null, breath: { hz: +B.hz.toFixed(2), amp: +B.amp.toFixed(2), held: B.held }, beamD: +B.beamD.toFixed(2),
      fleeing: S.fleeing, inCore: S.inCore, hidden: S.hidden, ears: { pL: +B.ears.pL.toFixed(2), pR: +B.ears.pR.toFixed(2), yL: +B.ears.yL.toFixed(2), yR: +B.ears.yR.toFixed(2) },
      head: { yaw: +B.head.yaw.toFixed(2), pitch: +B.head.pitch.toFixed(2) }, top: B.top || [], reachFails: B.reachFails, inv: B.inv ? B.inv.kind : null, locked: B.locked, frozen: B.frozen,
      seen: Object.keys(B.seen), queue: B.queue.map(q => q.name), add: Object.fromEntries(Object.entries(B.add).map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(2) : v])),
      aimK: +B.aimK.toFixed(2), flinchK: +B.flinchK.toFixed(2), vehicle: { t: +B.vehicleT.toFixed(2), stopped: B.vehicleStopped, gateOpen: B.gateOpen },
      run: !!S.run, crouchHeld: !!S.crouchHeld, crouchF: +S.crouchF.toFixed(3), crouchR: +S.crouchR.toFixed(3), sq: S.sq ? S.sq.phase : null, ranT: +B.ranT.toFixed(2),
      gait: S.gait ? { name: S.gait.name, phase: +S.gait.phase.toFixed(3), stride: +S.gait.stride.toFixed(3), cadence: +S.gait.cadence.toFixed(2), runK: +S.gait.runK.toFixed(2),
        feet: FEET.filter(k => S.gait.feet[k]).join(','), lift: [+S.gait.lift.front.toFixed(4), +S.gait.lift.rear.toFixed(4)] } : null };
  },
};

/* timers shared by step and the links */
function tickTimers(dt) {
  for (const k of ['startle', 'shake', 'splash', 'sniff', 'twitchL', 'twitchR', 'look', 'snap']) B.add[k] += dt;
  if (B.vehicleT >= 0) { B.vehicleT += dt; if (!B.vehicleStopped && (B.vehicleT >= 6.0 || (B.vehicleT >= 3.5 && S.x >= 29.0))) { B.vehicleStopped = true; B.stopAt = B.vehicleT; } }
  if (B.personOutT >= 0) { B.personOutT += dt; if (B.personOutT > 0.6) B.gateOpen = true; }
  if (B.torchDownT >= 0) { B.torchDownT += dt; if (B.torchDownT > 4.5) B.torchDownT = -1; }
  if (B.noticeT >= 0) { B.noticeT += dt; if (B.noticeT > 3) B.noticeT = -1; }
  if (B.walkwayT >= 0) B.walkwayT += dt;
  if (B.inv) { B.inv.t += dt; if (B.inv.kind === 'reach' && B.inv.t >= B.inv.dur && S.grounded) B.inv = null; }
  B.lipCool = Math.max(0, B.lipCool - dt); B.groomCool -= dt; B.sniffCool -= dt; B.edgeCool -= dt; B.boxSniffCool -= dt;
}

/* everything the rabbit does by itself, every fixed step */
function behave(dt, dir, act) {
  const G = FF.G, R = RB();
  B.t += dt;
  S.low = FF.Level.ceilingAbove(S.x, R.hw, S.y) - S.y < R.lowPoseUnder;
  S.inCore = !!FF.Level.coreAt(S.x) && G.place === 'search'; S.hidden = S.inCore && (S.low || S.crouch || !!FF.Level.coverAt(S.x, R.hw));
  if (G.place !== B.lastPlace) {
    if (G.place === 'rest' && B.lastPlace === 'search') { B.restArrive = 0; if (B.mood === 'flee' || B.mood === 'afraid') B.escaped = true; }
    B.lastPlace = G.place;
  }
  tickSources(dt); pollSources(dt); assess(dt);
  /* the drain: once past the person's reach, the fear eases (RECOVERING); the gap: the same */
  if (G.place === 'drain' && S.x > 46 && !B.drainRecovered && (B.mood === 'afraid' || B.mood === 'alert')) { B.drainRecovered = true; B.escaped = true; setMood('recover'); }
  if (G.place === 'courtyard' && B.escaped && B.mood !== 'recover') B.escaped = false;
  if (B.escaped && G.place === 'rest' && B.mood === 'afraid') setMood('recover');
  /* the rest: +1.5 s a look back at the gap, +4 s a shake */
  if (B.restArrive >= 0) {
    const was = B.restArrive; B.restArrive += dt;
    if (was < 1.5 && B.restArrive >= 1.5) queue('lookback', { dur: 1.2, within: 1.5, data: { dir: S.face > 0 ? -1 : 1, dur: 1.2 }, moving: () => { B.add.look = 0; B.add.lookDir = S.face > 0 ? -1 : 1; } });
    if (was < 4.0 && B.restArrive >= 4.0) { queue('shake', { dur: 0.8, within: 2.5, moving: () => { B.add.shake = 0; } }); B.restArrive = -1; }
  }
  if (G.place === 'rest' && S.x >= 116 && !B.chain && !B.settledSent) { B.restT += dt; if (B.restT >= BH().settle.autoStop && Math.abs(S.vx) > 0.05) { B.autoStop = true; B.restT = 0; } }
  /* poses run their course */
  if (B.pose) { B.pose.t += dt; if (!B.pose.loop && B.pose.dur && B.pose.t >= B.pose.dur) finishPose(); }
  if (B.inv && B.inv.kind === 'lip' && !B.pose) B.inv = null;
  /* settled: once it has lain down into the loaf (1.0 s) it is settled; ff-events.js holds 4.0 s (loafHold), then the
     pull-out. It commits here: from now on only pause works (§11) */
  if (B.mood === 'settled' && B.pose && B.pose.name === 'loaf') {
    B.settledT += dt;
    if (!B.settledSent && B.settledT >= BH().settle.chain.lie) { B.settledSent = true; B.locked = true; FF.bus.emit('end', { phase: 'settled', x: +S.x.toFixed(2) }); }
  }
  schedule(dt, dir);
  /* small life: ear twitches, the nose working (calm and alert only; frozen when afraid) */
  if (S.mode === 'play' && (B.mood === 'calm' || B.mood === 'alert' || B.mood === 'recover' || B.mood === 'settled')) {
    B.twitchNext -= dt; if (B.twitchNext <= 0) { B.twitchNext = rr(...BH().idles.earTwitch); if (rnd() < 0.5) B.add.twitchL = 0; else B.add.twitchR = 0; }
    B.sniffNext -= dt; if (B.sniffNext <= 0) { B.sniffNext = rr(...BH().idles.sniff); if (S.still > 0.3 || Math.abs(S.vx) < 1.3) B.add.sniff = 0; }
  }
  /* reflexes: the ears flatten at the aim; a flinch through the lunge's wind-up (control kept) */
  const st = (G.searcher && G.searcher.active && G.searcher.state) || '';
  B.aimK = approach(B.aimK, /aim/.test(st) ? 1 : 0, dt / 0.2);
  B.flinchK = approach(B.flinchK, /grab|lunge/.test(st) ? 0.7 : /aim/.test(st) ? 0.35 : 0, dt / 0.12);
  earsAndHead(dt);
  S.ears = B.ears; S.breath = B.hz; S.mood = B.mood; S.pose = B.pose ? B.pose.name : null; S.settle = B.pose && B.pose.kind === 'chain' ? B.pose.step : (B.mood === 'settled' ? 'lie' : null);
}

/* the anim input for the rig (presentation). 7 Oct: plus the gait and the crouch transitions (INTERFACES.md §8.3):
     gait {name ('idle'·'walk'·'run'·'crouch'·'push'·'air'), phase (0..1, 0 = the hind feet touch down; it advances with the
       distance travelled, |dx| / stride), stride (m per cycle), cadence (Hz), speed (m/s), runK (0 walk .. 1 run, by speed),
       feet {hindL, hindR, foreL, foreR} (planted now), stance {hindL: [on, off], …, lift, cap, dip} (the windows in use),
       lift {front, rear} (m: the shoulders' and the hips' rise from the hop cycle; add to the body, it never floats)},
     crouchFront, crouchRear (0..1: head and shoulders lead, the hips follow; each rises once it has cleared), crouchK (their
     mean), crouchHeld (Down), run (Shift held while moving), squeeze ({phase 'in'·'under'·'out', id, short, clear, k} or null).
     The old fields keep their meaning (crouch = the collision crouch or under something low). */
function env(t, dur) { return t < dur ? Math.sin(Math.PI * t / dur) : 0; }
function animInput() {
  const A = B.add;
  return {
    gait: S.gait, crouchFront: S.crouchF, crouchRear: S.crouchR, crouchK: (S.crouchF + S.crouchR) / 2, crouchHeld: !!S.crouchHeld, run: !!S.run, squeeze: S.sq,
    speed: S.mode === 'climb' || S.mode === 'popout' ? 0 : Math.abs(S.vx), vx: S.mode === 'climb' || S.mode === 'popout' ? 0 : S.vx, yaw: S.yaw, vy: S.vy, grounded: S.grounded || S.mode !== 'play', crouch: S.crouch || S.low,
    push: S.push, effort: S.effort, landed: S.landed, airT: S.airT, driven: true,
    pose: B.pose ? B.pose.name : null, poseT: B.pose ? B.pose.t : null, poseOut: B.out, poseData: B.pose ? B.pose.data : null,
    ears: B.ears, head: B.head, breath: { hz: B.hz, amp: B.amp }, flee: (S.fleeing && Math.abs(S.vx) > 1.6) || (B.mood === 'afraid' && Math.abs(S.vx) > 2.0), low: S.low, near: S.face > 0 ? 'R' : 'L',
    add: { startle: env(A.startle, 0.15) + 0.5 * env(A.snap, 0.18), flinch: B.flinchK, shake: env(A.shake, 0.5), shakeT: A.shake, splash: env(A.splash, 0.4), sniff: env(A.sniff, 0.9),
      twitchL: env(A.twitchL, 0.32), twitchR: env(A.twitchR, 0.32), lookBack: A.look < 1.2 ? sstep(0, 0.3, A.look) * (1 - sstep(0.9, 1.2, A.look)) : 0, lookDir: A.lookDir },
  };
}

/* the links: climb in (0.8 s: coil, spring onto the sill, creep in), inside the wall (3.8 s, the camera dollies), pop out
   towards the lens (0.4 s), sniff the night air (0.3 s), hop down and turn right (0.5 s); control returns */
function stepLink(dt) {
  const d = ductLink, t = S.modeT;
  if (S.mode === 'climb') {
    S.x += (d.from.x - S.x) * Math.min(1, dt * 8);
    const u = clamp((t - 0.25) / 0.3, 0, 1);
    S.y = t < 0.25 ? box.h : t < 0.55 ? lerp(box.h, d.from.sill, u) + Math.sin(Math.PI * u) * 0.08 : d.from.sill;
    S.z = t < 0.25 ? 0 : t < 0.55 ? lerp(0, -0.3, u) : lerp(-0.3, -0.66, clamp((t - 0.55) / 0.25, 0, 1));
    S.crouch = t > 0.55; S.grounded = true;
    if (t >= d.climbIn) { S.mode = 'transit'; S.modeT = 0; S.visible = false; if (B.pose) finishPose(); FF.bus.emit('transit', { phase: 'start' }); }
  } else if (S.mode === 'transit') {
    S.x = lerp(d.from.x, d.to.x, clamp(t / d.transit, 0, 1)); S.y = d.to.sill;
    if (t >= d.transit) {
      S.mode = 'popout'; S.modeT = 0; S.visible = true; S.x = d.to.x; S.z = -0.66; S.face = 1; S.yaw = 0; S.crouch = true;
      setPose('popout', { dur: d.popOut + d.sniff + d.hopDown, kind: 'script', cancel: 'none' }); B.escaped = false; setMood('afraid');
    }
  } else if (S.mode === 'popout') {
    const k = clamp((t - d.popOut - d.sniff) / d.hopDown, 0, 1);
    S.z = t < d.popOut ? lerp(-0.66, -0.28, t / d.popOut) : lerp(-0.28, 0, k);
    S.x = lerp(d.to.x, d.landX, k); S.y = d.to.sill * (1 - k) + Math.sin(Math.PI * k) * 0.12; S.crouch = t < d.popOut;
    S.grounded = k <= 0 || k >= 1; S.vy = k > 0 && k < 1 ? (k < 0.5 ? 1 : -1) : 0;
    if (t >= d.popOut + d.sniff + d.hopDown) {
      S.mode = 'play'; S.modeT = 0; S.y = 0; S.z = 0; S.grounded = true; S.vx = 0; S.vy = 0; S.crouch = false; S.landed = true; FF.G.control = true;
      if (B.pose && B.pose.name === 'popout') finishPose();
      FF.bus.emit('rabbit:land', { x: +S.x.toFixed(2), y: 0, h: d.to.sill, surface: 'wet-concrete', place: 'search' });
      FF.bus.emit('transit', { phase: 'end' }); FF.bus.emit('search-entry', { id: 'arrive-yard', arg: 1.5, x: S.x });
    }
  }
}
})();
