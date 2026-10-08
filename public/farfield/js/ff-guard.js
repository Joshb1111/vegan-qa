/* FAR FIELD — ff-guard.js: FF.Guard, ONE reusable perception module for every guard (polish pass, 8 Oct; Josh's priority 1).
   Used by the searcher (ff-ai.js: the door entry, the patrol, every reaction), and by the Works painter (ff-painter.js). The same
   three senses, the same short sustained threshold, the same telegraphs, for everybody:
     SIGHT        a clear line from his eye (darkness only shortens the range; solid cover blocks completely).
     TORCH BEAM   a rabbit inside his lit cone is "exposed": it fills his suspicion in 0.9 s (near) .. 1.6 s (10 m), never
                  instantly; leaving the beam lets it decay (after a 0.5 s grace). Staying in the beam fills it.
     AREA LIGHT   a floodlight / door spill / the painter's lamp: the same fill, weight 0.6.
     SOUND        what the rabbit's feet make, scaled by distance: a RUN is loud (heard to FF.RULES.sight.hear.range m, fills
                  suspicion in about 1.1 s at point blank), the cautious walk is quiet (nothing: it is slower than
                  hear.floorSpeed), a crouch-walk / creep / standing still is silent. Sound needs no line of sight and works behind
                  his back; it fills the same suspicion, so running near a guard alerts him, he stops and turns to where it came
                  from (NOTICE), and if you keep running there he locates and pursues (SPOTTED).
   Pure functions (loadable in node; the checkers and the game call these same functions):
     see(pose, pts, opts)                       A6, moved here from ff-ai.js; -> { w, src: touch|torch|area|dark|'', d }
     fillTime(src, d)                           seconds to fill suspicion 0 -> 1 at weight 1
     noiseOf(speed)                             0 .. 1 from the rabbit's speed (rabbit.vx), 0 for anything slower than hear.floorSpeed
     hear(pose, noise, cx, opts)                -> { w, d }: noise x (1 - distance / range); opts.lat = the lane's depth from him, y
     merge(sight, sound)                        the term that fills suspicion fastest (a touch always wins)
     sense(pose, pts, subject, opts)            see + hear merged: -> { w, src: ..|sound, d, sound (the heard weight) }
     accumulate(state, e, dt)                   the sustained threshold: state { s, grace } rises with e.w / fillTime, decays after
                                                the grace; returns true while exposed
   The gate guard is the searcher in his entry mode (ff-ai.js): the same sense() runs on every step he is outside the door,
   including the aim demonstration and the turn-sweep after it; nothing about his torch or his pose makes him blind.
   OWNER: the guards. Loadable in node (no THREE, no DOM). */
'use strict';
window.FF = window.FF || {};
(function () {
const U = FF.util, D2R = Math.PI / 180;
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

/* suspicion fill time for a seen weight: torch / area 0.9 s near -> 1.6 s at 10 m; darkness 0.8 s (NOTICE at 0.28 s) */
function fillTime(src, d) { const F = FF.RULES.sight.fill; if (src === 'dark') return FF.RULES.sight.dark.t; if (src === 'touch') return 1e-3; if (src === 'sound') return FF.RULES.sight.hear.t; return U.lerp(F.tNear, F.tFar, U.clamp((d - F.dNear) / (F.dFar - F.dNear), 0, 1)); }

/* ================================================================== SOUND (new, polish pass)
   noiseOf: the loudness of a rabbit moving at `speed` m/s (|vx|): 0 below hear.floorSpeed (the cautious walk 0.95, the crouch-walk
   0.75, the creep), rising to 1 at hear.fullSpeed (the run 2.75). A hop or landing adds hear.landing for a moment (the caller). */
function noiseOf(speed) { const H = FF.RULES.sight.hear; return U.clamp((Math.abs(speed || 0) - H.floorSpeed) / (H.fullSpeed - H.floorSpeed), 0, 1); }
/* the heard weight at distance: noise x (1 - d / range); d is the 3D distance (along the lane, up, and the lane's depth `lat`) */
function hear(pose, noise, cx, opts) {
  opts = opts || {}; const H = FF.RULES.sight.hear;
  if (!pose || !(noise > 0)) return { w: 0, d: 99 };
  const dx = cx - pose.x, dy = (opts.floorY || 0) - (pose.y || 0), d = Math.hypot(dx, dy, opts.lat || 0);
  const range = H.range * (opts.rangeScale || 1);
  return { w: noise * U.clamp(1 - d / range, 0, 1), d };
}
/* merge: the candidate that fills suspicion fastest counts (a touch is the lunge and always wins) */
function merge(e, h) {
  if (!e) e = { w: 0, src: '', d: 99 };
  if (e.src === 'touch' || !h || !(h.w > 0)) return e;
  const re = e.w > 0 ? e.w / fillTime(e.src, e.d) : 0, rh = h.w / fillTime('sound', h.d);
  return rh > re ? { w: h.w, src: 'sound', d: h.d, sound: h.w } : Object.assign({}, e, { sound: h.w });
}
/* sight and sound together. subject { x, vx (or noise), y?, floorY? }; opts as see() plus lat (depth of the lane from him) */
function sense(pose, pts, subject, opts) {
  opts = opts || {}; const sub = subject || {};
  const e = see(pose, pts, opts);
  const noise = sub.noise != null ? sub.noise : noiseOf(sub.vx);
  const h = hear(pose, noise, sub.x != null ? sub.x : (opts.cx != null ? opts.cx : pts && pts[1] ? pts[1][0] : 0), { floorY: opts.floorY, lat: opts.lat, rangeScale: opts.rangeScale });
  return merge(e, h);
}
/* THE SUSTAINED THRESHOLD: suspicion s fills with the seen weight over fillTime (never instantly), holds through a short grace
   when the exposure breaks, then decays. state { s, grace }; returns true while exposed (a touch is handled by the caller). */
function accumulate(st, e, dt) {
  const F = FF.RULES.sight.fill;
  if (e && e.w > 0 && e.src !== 'touch') { st.s = Math.min(1, st.s + e.w * dt / fillTime(e.src, e.d)); st.grace = 0; return true; }
  st.grace = (st.grace || 0) + dt; if (st.grace > F.grace) st.s = Math.max(0, st.s - F.decay * dt);
  return false;
}

FF.Guard = { see, fillTime, noiseOf, hear, merge, sense, accumulate };
})();
