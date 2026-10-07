/* FAR FIELD — ff-camera.js: FF.Camera directs the one THREE.PerspectiveCamera made by ff-main.js: side-on, low, narrow lens
   with the horizon shifted low in the frame (projectionMatrix.elements[9], verticals stay vertical), zones from
   FF.S1.camera (blended over 1.5 m), spans fitted to the aspect, holds, attention requests, scripted shots (title,
   courtyard-reveal, search-entry-hold, duct-transit, pull-out), the danger framing (A13). Never cuts in play.
   OWNER: the world builder. API contract: docs/farfield/INTERFACES.md §8.2. SKELETON: follows the rabbit with the base numbers
   and per-zone dist/height; title shot and toPlay ease; attend() stored but only lightly applied. */
'use strict';
window.FF = window.FF || {};
(function () {
const U = FF.util;
let cam = null, aspect = 16 / 9;
const st = { x: 0, y: 1.15, dist: 8.2, horizon: 0.57, lead: 1, shot: null, shotT: 0, toPlay: 0, toPlayDur: 0, zone: '' };
const attends = {};
const base = () => FF.S1.camera.base;
function zoneAt(x, y) {
  let z = null; for (const k of FF.S1.camera.zones) if (k.x0 != null && x >= k.x0 && x < k.x1 && (k.yBelow == null || y < k.yBelow)) z = k; return z;
}
function target() {
  const B = base(), r = FF.G.rabbit || { x: FF.S1.spawn.x, y: 0, face: 1, vx: 0 };
  const z = zoneAt(r.x, r.y) || {};
  let dist = z.dist || B.dist, horizon = z.horizon || B.horizon, lookAhead = z.lookAhead || B.lookAhead;
  if (z.span) dist = U.clamp((z.span[1] - z.span[0]) / (2 * aspect * Math.tan(13 * Math.PI / 180)), dist, B.maxDist);
  let x = z.hold && z.span ? (z.span[0] + z.span[1]) / 2 : r.x + lookAhead * st.lead + 0.12 * (r.vx || 0);
  if (z.minX != null) x = Math.max(x, z.minX); if (z.maxX != null) x = Math.min(x, z.maxX);
  const floor = FF.Level ? FF.Level.groundY(r.x) : 0;
  let y = z.y != null ? z.y : floor + (z.height || B.height) + B.jumpFollow * Math.max(0, r.y - floor);
  for (const k in attends) { const a = attends[k]; if (a && a.w) x = U.lerp(x, a.x, a.w); }
  st.zone = z.id || 'base';
  return { x, y, dist, horizon, follow: z.follow || B.follow };
}
function shotTarget(id) { const z = FF.S1.camera.zones.find(k => k.id === id) || {}; return { x: z.x != null ? z.x : st.x, y: z.y != null ? z.y : 1.6, dist: z.dist || 11, horizon: z.horizon || 0.6 }; }

const Camera = FF.Camera = {
  stub: true,
  init(c) { cam = c.camera; Camera.project(); },
  resize(w, h) { aspect = w / Math.max(1, h); if (cam) { cam.aspect = aspect; Camera.project(); } },
  /* apply fov and the lens shift that puts eye level `horizon` of the way down the frame */
  project() { if (!cam) return; cam.fov = base().fov; cam.updateProjectionMatrix(); cam.projectionMatrix.elements[9] = 2 * st.horizon - 1; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); },
  reset(cp) { st.shot = null; st.toPlay = 0; for (const k in attends) delete attends[k]; Camera.snap(); },
  /* jump straight to the current play framing (warps, continues) */
  snap() { const t = target(); Object.assign(st, { x: t.x, y: t.y, dist: t.dist, horizon: t.horizon }); st.lead = (FF.G.rabbit && FF.G.rabbit.face) || 1; apply(); },
  /* a scripted shot or held zone by id ('title', 'courtyard-reveal', 'search-entry-hold', 'duct-transit', 'pull-out'); null ends it */
  shot(id, opts) { st.shot = id ? { id, opts: opts || {}, t: 0 } : null; if (id === 'title') { Object.assign(st, shotTarget('title')); apply(); } },
  /* ease from the current shot to the play framing over `seconds` */
  toPlay(seconds) { st.shot = null; st.toPlay = st.toPlayDur = seconds || 2.5; },
  /* attention request: Camera.attend('vehicle', { x, w }) ... Camera.attend('vehicle', null) */
  attend(key, a) { if (a) attends[key] = a; else delete attends[key]; },
  frame(dt) {
    if (!cam) return;
    const r = FF.G.rabbit; if (r && r.face) st.lead = U.damp(st.lead, r.face, 1.6, dt);
    let t = st.shot ? shotTarget(st.shot.id) : target(), k = st.shot ? 1.2 : t.follow;
    if (st.toPlay > 0) { st.toPlay -= dt; k = U.lerp(4, 0.6, st.toPlay / st.toPlayDur); }
    st.x = U.damp(st.x, t.x, k, dt); st.y = U.damp(st.y, t.y, k * 0.8, dt); st.dist = U.damp(st.dist, t.dist, 1.5, dt); st.horizon = U.damp(st.horizon, t.horizon, 1.5, dt);
    apply();
  },
  debug() { return { stub: true, zone: st.zone, shot: st.shot && st.shot.id, x: +st.x.toFixed(2), y: +st.y.toFixed(2), dist: +st.dist.toFixed(2), horizon: +st.horizon.toFixed(3), attends: Object.keys(attends) }; },
};
function apply() { cam.position.set(st.x, st.y, st.dist); cam.rotation.set(0, 0, 0); Camera.project(); }
})();
