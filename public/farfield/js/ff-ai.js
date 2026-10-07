/* FAR FIELD — ff-ai.js: FF.AI, the searcher (beat 3): his entry and fixed routine (FF.S1.searcher), perception by the ONE
   detection model (A6: lines of sight against FF.S1.occluders; torch, area light, darkness at close range, touch), suspicion,
   NOTICE / INVESTIGATE / SPOTTED / grab / aim / pursue / hide check / LOST / WARY / the gap, the telegraphs and reaction
   windows exactly per docs/farfield/SEQUENCE-1.md §9 as amended, and the 'fail' event. Exposes FF.G.searcher and debug().
   OWNER: the humans + events builder. API contract: docs/farfield/INTERFACES.md §8.6. SKELETON: the routine played from the data
   (entry then the 44.85 s loop) with the stand-in figure and its torch, and a REFERENCE implementation of the detection
   model (FF.AI.see) that the node checker can share; suspicion is measured but nothing reacts yet. */
'use strict';
window.FF = window.FF || {};
(function () {
const U = FF.util, D2R = Math.PI / 180;
let fig = null, entry = [], loop = [], entryT = 0, loopT = 0;
const ST = { active: false, state: 'off', x: 110, y: 0, z: -1.15, face: -1, pitch: -20, half: 13, kneel: false, torchOn: false, kind: '', loopT: null, entryT: null, s: 0, lit: 0, litBy: '', startIn: -1 };

/* the routine as timed segments (pure; also used by tests and the checker) */
function build(list, startNode) {
  const N = FF.S1.searcher.nodes, segs = []; let at = N[startNode].slice();
  for (const a of list) {
    const kind = a[0];
    if (typeof a[1] === 'string') {                          // loop move: [kind, node, speed (walk-*) | seconds (climb, descend)]
      const to = N[a[1]].slice(), dx = to[0] - at[0];
      segs.push({ kind, dur: /^walk/.test(kind) ? Math.abs(dx) / a[2] : a[2], from: at, to, face: Math.sign(dx) || -1 }); at = to;
    } else {                                                 // [kind, seconds, node (entry: where) | 'left' | 'right', note]
      const dur = a[1], arg = a[2];
      if (arg && N[arg]) { const to = N[arg].slice(); segs.push({ kind, dur, from: at, to, face: -1 }); at = to; }
      else segs.push({ kind, dur, from: at.slice(), to: at.slice(), face: arg === 'right' ? 1 : -1 });
    }
  }
  return segs;
}
function sample(segs, t) {
  let tt = t;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (tt <= s.dur || i === segs.length - 1) {
      const u = U.clamp(tt / Math.max(1e-6, s.dur), 0, 1), R = FF.RULES.sight.torch;
      const p = { kind: s.kind, x: U.lerp(s.from[0], s.to[0], u), y: U.lerp(s.from[1], s.to[1], u), z: U.lerp(s.from[2], s.to[2], u), face: s.face, pitch: R.pitchWalk + R.sway * Math.sin(2 * Math.PI * R.swayHz * t), half: R.half, kneel: false, torchOn: s.kind !== 'cue' };
      if (s.kind === 'turn') { p.torchOn = false; p.face = 0; }
      if (s.kind === 'look') p.pitch = R.pitchLook;
      if (s.kind === 'sweep-left') p.pitch = U.lerp(-35, -8, u);
      if (s.kind === 'aim-demo') { p.face = 1; p.pitch = -22; p.half = R.aimHalf; }
      if (s.kind === 'turn-sweep') { if (tt < 1.0) { p.torchOn = false; p.face = 0; } else p.pitch = U.lerp(-35, -8, Math.sin(Math.PI * (tt - 1.0) / 2.0)); }
      if (s.kind === 'crouch-look') { if (tt >= 1.1 && tt < 2.7) { p.kneel = true; p.pitch = R.pitchKneel; } else if (tt >= 0.3 && tt < 1.1) p.pitch = -24; }
      if (s.kind === 'cue' || s.kind === 'doorway') p.visible = s.kind === 'doorway';
      return p;
    }
    tt -= s.dur;
  }
}
const total = segs => segs.reduce((a, s) => a + s.dur, 0);

/* A6, the reference detection model. pose: { x, y, face, kneel, torchOn, pitch, half }, pts: [[x, y] x3] (rabbit sight points),
   opts: { doorOpen, floorY (rabbit floor) }. Returns { w (0..1 seen weight), src ('torch'|'area'|'dark'|'touch'|''), d } */
function see(pose, pts, opts) {
  opts = opts || {}; const S = FF.RULES.sight, R = S.torch, L = FF.Level;
  if (!pose || !pose.face) return { w: 0, src: '', d: 99 };
  const lens = { x: pose.x + (pose.kneel ? R.kneelFwd : R.fwd) * pose.face, y: pose.y + (pose.kneel ? R.kneelH : R.h) };
  const eye = { x: pose.x, y: pose.y + (pose.kneel ? S.kneelEye : S.eye) };
  const cx = pts[1][0], d = Math.abs(cx - pose.x), front = (cx - pose.x) * pose.face > 0;
  /* touch: same floor, at his legs, with a line of sight */
  const sameFloor = Math.abs((opts.floorY || 0) - pose.y) < S.touch.sameFloor;
  const anyLOS = pts.some(([px, py]) => !L.segmentBlocked(eye.x, eye.y, px, py));
  if (sameFloor && anyLOS && d <= (front ? S.touch.front : S.touch.behind)) return { w: 1, src: 'touch', d };
  /* torch: in the cone, in range, unblocked from the lens */
  if (pose.torchOn) {
    let lit = 0;
    for (const [px, py] of pts) {
      const dx = px - lens.x, dy = py - lens.y, dist = Math.hypot(dx, dy);
      if (dist > R.range || dx * pose.face <= 0) continue;
      const ang = Math.atan2(dy, Math.abs(dx)) / D2R; if (Math.abs(ang - pose.pitch) > (pose.half || R.half)) continue;
      if (!L.segmentBlocked(lens.x, lens.y, px, py)) lit++;
    }
    if (lit) return { w: lit / 3, src: 'torch', d: Math.hypot(cx - lens.x, pts[1][1] - lens.y) };
  }
  /* area light (door spill, floodlight): he faces the rabbit within range, a clear line from the eye */
  if (front && d <= S.area.range && anyLOS) for (const a of FF.S1.areaLights) {
    if ((a.on === 'always' || (a.on === 'door-open' && opts.doorOpen)) && cx >= a.x0 && cx <= a.x1) return { w: S.area.weight, src: 'area', d };
  }
  /* darkness at close range (A6): never ignored within dark.front in front of him (dark.behind behind), still telegraphed */
  if (anyLOS && d <= (front ? S.dark.front : S.dark.behind)) return { w: S.dark.weight, src: 'dark', d };
  return { w: 0, src: '', d };
}
/* fill time for a seen weight: torch/area 0.9 s near -> 1.6 s far; darkness S.dark.t; touch is instant (the lunge wind-up is the telegraph) */
function fillTime(src, d) { const F = FF.RULES.sight.fill; if (src === 'dark') return FF.RULES.sight.dark.t; if (src === 'touch') return 1e-3; return U.lerp(F.tNear, F.tFar, U.clamp((d - F.dNear) / (F.dFar - F.dNear), 0, 1)); }

const AI = FF.AI = {
  stub: true,
  see, fillTime, build, sample,
  init(c) {
    entry = build(FF.S1.searcher.entry, 'N0'); loop = build(FF.S1.searcher.loop, 'N1');
    fig = FF.Humans.create('searcher');
    const torch = FF.World && FF.World.spot && FF.World.spot('torch'); if (torch) fig.attachTorch(torch);
    FF.G.searcher = ST;
    FF.bus.on('search-entry', d => { if (!ST.active && !FF.G.flags.entryDone) { ST.active = true; ST.state = 'wait'; ST.startIn = (d && d.arg) || 1.5; } });
  },
  get entryTotal() { return total(entry); }, get loopTotal() { return total(loop); },
  reset(cp) {
    const sc = cp && cp.searcher;
    ST.s = 0; ST.lit = 0; ST.litBy = ''; ST.startIn = -1;
    if (!sc) { ST.active = false; ST.state = 'off'; return; }
    ST.active = true;
    if (sc.beforeEntryDone && !FF.G.flags.entryDone) { ST.state = 'wait'; ST.startIn = 1.5; entryT = 0; }
    else { ST.state = 'patrol'; loopT = (sc.after ? sc.after.loopT : sc.loopT) || 0; }
  },
  setLoopT(t) { ST.active = true; ST.state = 'patrol'; loopT = t; },
  danger() { return /notice|spotted|aim|pursue|grab|lower|hidecheck/.test(ST.state); },
  step(dt) {
    if (!ST.active) return;
    let p = null;
    if (ST.state === 'wait') { ST.startIn -= dt; if (ST.startIn <= 0) { ST.state = 'entry'; entryT = 0; FF.bus.emit('entry', { phase: 'cue' }); } return; }
    if (ST.state === 'entry') {
      entryT += dt; p = sample(entry, entryT); ST.entryT = entryT; ST.loopT = null;
      if (entryT >= total(entry)) { ST.state = 'patrol'; loopT = 0; FF.G.flags.entryDone = true; FF.bus.emit('entry', { phase: 'done' }); }
    } else { loopT = (loopT + dt) % total(loop); p = sample(loop, loopT); ST.loopT = loopT; ST.entryT = null; }
    if (!p) return;
    Object.assign(ST, { x: p.x, y: p.y, z: p.z, face: p.face, pitch: p.pitch, half: p.half, kneel: p.kneel, torchOn: p.torchOn, kind: p.kind });
    /* perception (measured only in the skeleton) */
    const r = FF.G.rabbit; if (r && FF.Player && FF.Player.sightPoints) {
      const e = see(ST, FF.Player.sightPoints(), { doorOpen: FF.G.flags.entryDone || (ST.entryT != null && ST.entryT > 2.5), floorY: r.y });
      ST.lit = e.w; ST.litBy = e.src;
      if (e.w > 0) ST.s = Math.min(1, ST.s + e.w * dt / fillTime(e.src, e.d)); else ST.s = Math.max(0, ST.s - FF.RULES.sight.fill.decay * dt);
    }
  },
  frame() {
    if (!fig) return;
    const vis = ST.active && ST.state !== 'wait' && !(ST.kind === 'cue');
    fig.set({ visible: vis, x: ST.x, y: ST.y, z: ST.z, face: ST.face, anim: ST.kneel ? 'kneel' : /walk/.test(ST.kind) ? 'walk-search' : 'idle', speed: /walk/.test(ST.kind) ? 1 : 0,
      torch: { on: vis && ST.torchOn, pitch: ST.pitch, half: ST.half } });
  },
  debug() { return { stub: true, state: ST.state, active: ST.active, x: +ST.x.toFixed(2), y: +ST.y.toFixed(2), face: ST.face, kind: ST.kind, loopT: ST.loopT == null ? null : +ST.loopT.toFixed(2), entryT: ST.entryT == null ? null : +ST.entryT.toFixed(2), s: +ST.s.toFixed(3), lit: +ST.lit.toFixed(2), litBy: ST.litBy, pitch: +ST.pitch.toFixed(1) }; },
};
})();
