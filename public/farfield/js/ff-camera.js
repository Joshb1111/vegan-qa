/* FAR FIELD — ff-camera.js: FF.Camera directs the one THREE.PerspectiveCamera made by ff-main.js: side-on, low, a narrow
   26° lens with eye level shifted low in the frame (projectionMatrix.elements[9]; verticals stay vertical), never a cut in play.
   How a frame is made (SEQUENCE-1.md §12 as amended, A12, A13):
     1. PLAY: the zones of FF.S1.camera at the rabbit's x (and y in the drain), blended over 1.5 m; each sets dist, height above
        the floor (or an absolute y, or a ramp), horizon, look-ahead (turning with facing; more when running), follow, min/max x,
        a held span (hold / softHold), spans fitted to the aspect (16:9 and 2:1 show the same things).
        Then, eased in and out: attention (the van, the walkway worker, the searcher, Camera.attend()), search-watch, the held
        breath, the danger framing (A13: fit the rabbit and the searcher, the rabbit >= 15% from the edge), rest-intimate.
        The edge rule last: in play the rabbit never sits in the outer 15% of the frame width.
        The play framing is followed with exponential damping and keeps running underneath any shot.
     2. SHOTS blend over it: title, courtyard-reveal, search-entry-hold (A12), duct-transit (scripted dolly), pull-out (scripted),
        each eased in and released into the live play framing (toPlay / release), so nothing ever jumps.
   Listens on the bus: camera-shot (Level trigger), transit, entry, ai:state, vehicle-arrive, walkway-start / walkway,
   torch-down, end, restart. OWNER: the world builder. API contract: docs/farfield/INTERFACES.md §8.2. */
'use strict';
window.FF = window.FF || {};
(function () {
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeIO = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const TAN13x2 = 2 * Math.tan(13 * Math.PI / 180);      // frame height per metre of distance at the lane (0.4617)
let cam = null, aspect = 16 / 9, offs = [];
const out = { x: 4.6, y: 1.6, dist: 11, horizon: 0.62 };            // what the lens shows
const play = { x: 4.6, y: 1.15, dist: 8.2, horizon: 0.57, ok: false }; // the damped play framing (always running)
const st = { lead: 1, zone: '', shot: null, w: 0, rel: null, mods: { watch: 0, held: 0, danger: 0, intimate: 0 }, torchDown: false, torchT: -1, entryHeld: false, lastIdeal: null };
const attends = {};      // key -> { x, y?, w, t (seconds left or Infinity), k (eased weight), still (only while the rabbit is still), fn }
const base = () => FF.S1.camera.base;
const zones = () => FF.S1.camera.zones;
const zoneById = id => zones().find(z => z.id === id) || {};
const G = () => FF.G;
const widthAt = d => TAN13x2 * aspect * d;
const fitDist = w => w / (TAN13x2 * aspect);

/* ------------------------------------------------------------------------------------------- play: zones */
function zoneWeight(z, r) {
  if (z.x0 == null) return 0;
  let x1 = z.x1; if (z.extendTo && st.torchDown) x1 = Math.max(x1, z.extendTo.x1);
  const h = (base().blend || 1.5) / 2;
  let w = sstep(z.x0 - h, z.x0 + h, r.x) * (1 - sstep(x1 - h, x1 + h, r.x));
  if (z.x0 <= -5 && r.x < z.x0) w = 1;
  if (z.yBelow != null) w *= 1 - sstep(z.yBelow - 0.25, z.yBelow + 0.25, r.y);
  else if (r.y < -0.5 && r.x > 38.4 && r.x < 53.4) w *= 0;        // the open zones never frame the rabbit below ground
  return w;
}
function zoneParams(z, r) {
  const B = base(), floor = Math.max(-1.0, FF.Level.groundY(r.x));
  let dist = z.dist || B.dist; if (z.span) dist = clamp(fitDist(z.span[1] - z.span[0]), dist, B.maxDist);
  const speed = Math.abs(r.vx || 0);
  let la = z.lookAhead != null ? z.lookAhead : B.lookAhead; if (z.runAhead) la = lerp(la, z.runAhead, sstep(1.6, 2.6, speed));
  let x = z.hold && z.span ? (z.span[0] + z.span[1]) / 2 : r.x + la * st.lead + 0.12 * (r.vx || 0);
  if (z.softHold) x = clamp(x, z.softHold[0], z.softHold[1]);
  if (z.minX != null) x = Math.max(x, z.minX); if (z.maxX != null) x = Math.min(x, z.maxX);
  let y;
  if (z.y != null) y = z.y;
  else if (z.yRamp) y = lerp(z.yRamp[0], z.yRamp[1], clamp((r.x - z.x0) / (z.x1 - z.x0), 0, 1));
  else y = floor + (z.height != null ? z.height : B.height) + B.jumpFollow * Math.max(0, r.y - floor);
  return { x, y, dist, horizon: z.horizon || B.horizon, follow: z.follow || B.follow };
}
function baseParams(r) { return zoneParams({}, r); }
function rabbit() { return (G() && G().rabbit) || { x: FF.S1.spawn.x, y: 0, vx: 0, face: 1, grounded: true, still: 0 }; }
/* standing attention from the zone data: the Search zone leans 35% towards the searcher while he is within 12 m */
function standingAttends() {
  const z = zones().find(k => k.attend && k.attend.who === 'searcher');
  if (z) attends.searcher = { w: z.attend.w, t: Infinity, k: 0, keep: true, within: z.attend.within, fn: () => {
    const s = G().searcher, r = rabbit(); if (!s || !s.active || s.state === 'off' || s.state === 'wait' || r.x < z.x0 || r.x > z.x1) return null; return s.x; } };
}

function ideal(dt) {
  const r = rabbit(), s = G().searcher, B = base();
  /* 1. zones */
  const acc = { x: 0, y: 0, dist: 0, horizon: 0, follow: 0 }; let wsum = 0, best = null, bestW = 0;
  for (const z of zones()) { const w = zoneWeight(z, r); if (w <= 1e-4) continue; const p = zoneParams(z, r); for (const k in acc) acc[k] += p[k] * w; wsum += w; if (w > bestW) { bestW = w; best = z; } }
  if (wsum < 1) { const p = baseParams(r), w = 1 - wsum; for (const k in acc) acc[k] += p[k] * w; wsum = 1; }
  for (const k in acc) acc[k] /= wsum;
  st.zone = best ? best.id : 'base';
  let { x, y, dist, horizon, follow } = acc;
  const floor = Math.max(-1.0, FF.Level.groundY(r.x));
  /* 2. attention: leans the frame towards a point of interest, never pushing the rabbit out (the edge rule follows) */
  const halfW = widthAt(dist) / 2;
  for (const key in attends) {
    const a = attends[key]; let ax = a.fn ? a.fn() : a.x; const live = ax != null && (a.t > 0) && (!a.still || (r.still || 0) > 0.4) && (!a.within || Math.abs(ax - r.x) < a.within) && !(key === 'searcher' && (st.mods.watch > 0.5 || st.mods.danger > 0.5));
    a.k = damp(a.k || 0, live ? 1 : 0, 1 / 0.9, dt); if (a.t !== Infinity) a.t -= dt;
    if (a.k < 1e-3 || ax == null) { if (a.t <= 0 && a.k < 1e-3 && !a.keep) delete attends[key]; continue; }
    x += clamp((ax - x) * a.w * a.k, -halfW * 0.55, halfW * 0.55);
  }
  /* 3. the Search's states */
  const inSearch = r.x > 86 && r.x < 113.6 && s && s.active && s.state !== 'off' && s.state !== 'wait';
  const sd = inSearch ? Math.abs(s.x - r.x) : 99, hidden = !!(FF.Level.coreAt(r.x)) && inSearch;
  const dangerOn = inSearch && /notice|spotted|aim|pursue|grab|lower/.test(s.state || '') && sd <= 10;
  const heldOn = inSearch && !dangerOn && ((s.y > 0.5 && r.x > 92 && r.x < 98 && sd < 3.5) || (s.kneel && sd < 3.0));
  const watchOn = inSearch && !dangerOn && sd < 16 && ((r.still || 0) > 0.6 || hidden);
  const intimateOn = r.x >= 116 && r.x < 127.2 && (((r.still || 0) > 1.5) || r.mood === 'settled') && !(s && s.active && s.x > 112 && Math.abs(s.x - r.x) < 6);
  const M = st.mods;
  M.danger = damp(M.danger, dangerOn ? 1 : 0, dangerOn ? 3.0 : 1.2, dt);
  M.held = damp(M.held, heldOn ? 1 : 0, 1.5, dt);
  M.watch = damp(M.watch, watchOn ? 1 : 0, 1.2, dt);
  M.intimate = damp(M.intimate, intimateOn ? 1 : 0, 1.0, dt);
  if (M.watch > 1e-3) {
    const wz = zoneById('search-watch'), maxD = hidden ? (wz.maxDistHidden || 12.5) : (wz.maxDist || 11.0);
    const dW = clamp(fitDist(sd + 2.5), dist, maxD), xW0 = lerp(r.x, s.x, wz.bias || 0.4), hw = widthAt(dW) / 2 * (wz.keepRabbitIn || 0.7);
    const xW = clamp(xW0, r.x - hw, r.x + hw);
    x = lerp(x, xW, M.watch); dist = lerp(dist, dW, M.watch);
  }
  if (M.held > 1e-3) { const hz = zoneById('search-held-breath'); dist = lerp(dist, hz.dist || 9.2, M.held); y = lerp(y, floor + (hz.height || 1.1), M.held); }
  if (M.danger > 1e-3) {
    const dz = zoneById('danger'), edge = dz.edge || 0.15;
    const dD = clamp(fitDist((sd + 2.0) / (1 - 2 * edge)), dist, dz.maxDist || 12.5);   // only ever widens: the way out stays in view
    const hw = widthAt(dD) / 2, la = (dz.lookAhead || 1.8) * (r.face || 1);
    let xD = lerp((r.x + s.x) / 2, r.x + la, 0.35); xD = clamp(xD, r.x - hw * (1 - 2 * edge), r.x + hw * (1 - 2 * edge));
    x = lerp(x, xD, M.danger); dist = lerp(dist, dD, M.danger); horizon = lerp(horizon, dz.horizon || 0.58, M.danger); follow = lerp(follow, dz.follow || 3.5, M.danger);
  }
  if (M.intimate > 1e-3) {
    const iz = zoneById('rest-intimate');
    x = lerp(x, r.x + (iz.lookAhead || 0.3) * st.lead, M.intimate); dist = lerp(dist, iz.dist || 5.8, M.intimate); y = lerp(y, floor + (iz.height || 0.62), M.intimate);
    horizon = lerp(horizon, iz.horizon || 0.58, M.intimate); follow = lerp(follow, iz.follow || 1.2, M.intimate);
  }
  /* 4. the edge rule (in play): the rabbit >= 15% of the frame width from either edge */
  { const hw = widthAt(dist) / 2, e = B.edge || 0.15; x = clamp(x, r.x - hw * (1 - 2 * e), r.x + hw * (1 - 2 * e)); }
  return { x, y, dist, horizon, follow };
}

/* ------------------------------------------------------------------------------------------- shots */
const SHOTS = {
  title:              { ease: 0, release: 2.5 },
  'courtyard-reveal': { ease: 1.2, release: 1.5 },
  'search-entry-hold':{ ease: 1.0, release: 0.6 },
  'duct-transit':     { ease: 0, release: 1.0, scripted: true },
  'pull-out':         { ease: 0, release: 2.0, scripted: true },
};
function shotParams(sh, dt) {
  const z = zoneById(sh.id), r = rabbit();
  if (sh.id === 'title') return { x: z.x != null ? z.x : 4.6, y: z.y != null ? z.y : 1.6, dist: z.dist || 11, horizon: z.horizon || 0.62 };
  if (sh.id === 'courtyard-reveal') return { x: z.x != null ? z.x : 58.5, y: (z.height || base().height) + Math.max(0, FF.Level.groundY(r.x)), dist: z.dist || 10.5, horizon: z.horizon || 0.64 };
  if (sh.id === 'search-entry-hold') return { x: z.x != null ? z.x : 109.0, y: 1.3, dist: z.dist || 12.5, horizon: z.horizon || 0.60 };
  if (sh.id === 'duct-transit') { const to = z.to || { x: 90.4, dist: 10.6, height: 1.3, horizon: 0.6 }, k = easeIO(sh.t / (z.time || 3.6)), f = sh.from;
    return { x: lerp(f.x, to.x, k), y: lerp(f.y, to.height, k), dist: lerp(f.dist, to.dist, k), horizon: lerp(f.horizon, to.horizon, k) }; }
  if (sh.id === 'pull-out') { const to = z.to || { dist: 22, height: 3.5, horizon: 0.52, driftX: 2.5 }, k = easeIO(sh.t / (z.time || 8.0)), f = sh.from, floor = Math.max(0, FF.Level.groundY(f.x));
    return { x: f.x + (to.driftX || 0) * k, y: lerp(f.y, floor + to.height, k), dist: lerp(f.dist, to.dist, k), horizon: lerp(f.horizon, to.horizon, k) }; }
  return { x: z.x != null ? z.x : out.x, y: z.y != null ? z.y : out.y, dist: z.dist || out.dist, horizon: z.horizon || out.horizon };
}
function startShot(id, opts) {
  const def = SHOTS[id] || { ease: 1.0, release: 1.0 }, r = rabbit();
  st.shot = { id, t: 0, opts: opts || {}, def, from: { x: out.x, y: out.y, dist: out.dist, horizon: out.horizon }, rx0: r.x };
  st.rel = null; st.w = def.ease ? 0 : 1;          // eased shots blend from the frame showing now (out) to the shot
}
function releaseShot(seconds) {
  if (!st.shot) return;
  const sh = st.shot, last = { x: out.x, y: out.y, dist: out.dist, horizon: out.horizon };   // from the frame showing now
  st.rel = { from: last, t: 0, dur: seconds != null ? seconds : (sh.def.release || 1.0) };
  st.shot = null;
}

/* ------------------------------------------------------------------------------------------- API */
const Camera = FF.Camera = {
  stub: false,
  init(c) {
    cam = c.camera; Camera.project();
    for (const off of offs) off(); offs = [];
    const on = (n, f) => offs.push(FF.bus.on(n, f));
    standingAttends();
    /* Level trigger: { arg: 'courtyard-reveal' } (held 3 s or until the rabbit moves 1.5 m) */
    on('camera-shot', d => { if (d && d.arg && G().mode === 'play') Camera.shot(d.arg); });
    /* the duct: dolly over the divide wall while the rabbit is inside it; release after the pop-out */
    on('transit', d => { if (!d) return; if (d.phase === 'start' || d.phase === 'climb') { if (!st.shot || st.shot.id !== 'duct-transit') { if (d.phase === 'start') Camera.shot('duct-transit'); } } else if (d.phase === 'end') { if (st.shot && st.shot.id === 'duct-transit') releaseShot(); } });
    /* A12: the establishing frame holds from the door light until the gun lowers */
    on('entry', d => {
      if (!d) return; const r = rabbit();
      if (d.phase === 'cue' && r.x < 91) { Camera.shot('search-entry-hold'); st.entryHeld = true; }
      if ((d.phase === 'aim-lowered' || d.phase === 'done') && st.shot && st.shot.id === 'search-entry-hold') releaseShot();
    });
    /* attention: the van beyond the wall (35% for 6 s from the trigger), the walkway worker (30%, only while the rabbit is still) */
    on('vehicle-arrive', () => { const z = zones().find(k => k.attend && k.attend.event === 'vehicle-arrive') || { attend: { w: 0.35, t: 6 } }; st.vehicleT = G().frameT;
      attends.vehicle = { w: z.attend.w, t: z.attend.t, k: 0, fn: vehicleX }; });
    on('vehicle', d => { if (d && d.x != null) st.vehicleX = d.x; });
    const walkway = () => { const z = zones().find(k => k.attend && k.attend.event === 'walkway') || { attend: { x: 81.5, w: 0.3 } }; if (!attends.walkway) attends.walkway = { x: z.attend.x, w: z.attend.w, t: 11.5, k: 0, still: !!z.attend.onlyWhenStill }; };
    on('walkway-start', walkway); on('walkway', d => { if (d && (d.phase === 'start' || d.phase === 'boots')) walkway(); });
    /* the drain hold extends to 45 while the torch is down the crack */
    on('torch-down', d => { st.torchDown = !!(d && d.phase !== 'end' && d.phase !== 'up' && d.on !== false); });
    /* the end: the pull-out (Events emits end { phase: 'pullout' } or calls Camera.shot('pull-out')) */
    on('end', d => { if (d && (d.phase === 'pullout' || d.phase === 'pull-out')) Camera.shot('pull-out'); });
  },
  resize(w, h) { aspect = w / Math.max(1, h); if (cam) { cam.aspect = aspect; Camera.project(); } },
  /* apply fov and the lens shift that puts eye level `horizon` of the way down the frame */
  project() { if (!cam) return; cam.fov = base().fov; cam.updateProjectionMatrix(); cam.projectionMatrix.elements[9] = 2 * out.horizon - 1; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert(); },
  reset(cp) {
    st.shot = null; st.rel = null; st.w = 0; st.torchDown = false; st.entryHeld = false;
    for (const k in st.mods) st.mods[k] = 0; for (const k in attends) delete attends[k]; standingAttends();
    st.vehicleT = -1; st.vehicleX = null;
    Camera.snap();
  },
  /* jump straight to the current play framing (warps, continues, restarts) */
  snap() {
    const r = rabbit(); st.lead = r.face || 1;
    const t = ideal(0); Object.assign(play, { x: t.x, y: t.y, dist: t.dist, horizon: t.horizon, ok: true });
    if (!st.shot) { st.w = 0; st.rel = null; Object.assign(out, { x: play.x, y: play.y, dist: play.dist, horizon: play.horizon }); }
    apply();
  },
  /* a scripted shot or held frame: 'title', 'courtyard-reveal', 'search-entry-hold', 'duct-transit', 'pull-out'; null ends it */
  shot(id, opts) {
    if (!id) { releaseShot(opts && opts.release); return; }
    if (st.shot && st.shot.id === id) return;
    startShot(id, opts);
    if (id === 'title') { Object.assign(out, shotParams(st.shot, 0)); apply(); }
  },
  /* ease from the current shot to the play framing over `seconds` (the title's first input) */
  toPlay(seconds) { if (st.shot) releaseShot(seconds || 2.5); else { st.rel = { from: { x: out.x, y: out.y, dist: out.dist, horizon: out.horizon }, t: 0, dur: seconds || 2.5 }; } },
  /* attention request: Camera.attend('vehicle', { x, w, t }) ... Camera.attend('vehicle', null). t in seconds (default: until removed) */
  attend(key, a) { if (a) attends[key] = Object.assign({ k: attends[key] ? attends[key].k : 0, t: Infinity, w: 0.3 }, a); else if (attends[key]) attends[key].t = 0; },
  frame(dt) {
    if (!cam) return;
    const r = rabbit(), g = G();
    if (r.face) st.lead = damp(st.lead, r.face, 1.6, dt);
    /* the torch down the crack (fallback when Events does not announce it): the Verge torch pointing down into the chamber */
    if (FF.World && FF.World.spot) { const h = FF.World.spot('vergeTorch'); if (h && h.st && h.st.on && h.st.intensity > 0) { const p = h.st.pos, t = h.st.target; if (p[0] > 37.5 && p[0] < 40 && t[1] < p[1] - 0.3 && t[1] < -0.3) st.torchT = g.frameT; } }
    if (st.torchT >= 0 && g.frameT - st.torchT < 0.5) st.torchDown = true; else if (st.torchT >= 0) { st.torchDown = false; st.torchT = -1; }
    /* the live play framing, always damped (it runs under shots so releases land on a moving, settled frame) */
    const t = ideal(dt);
    if (!play.ok) { Object.assign(play, t, { ok: true }); }
    play.x = damp(play.x, t.x, t.follow, dt); play.y = damp(play.y, t.y, t.follow * 0.8, dt);
    play.dist = damp(play.dist, t.dist, 1.5, dt); play.horizon = damp(play.horizon, t.horizon, 1.5, dt);
    /* shots */
    let o = { x: play.x, y: play.y, dist: play.dist, horizon: play.horizon };
    if (st.shot) {
      const sh = st.shot; sh.t += dt;
      if (sh.def.ease > 0) st.w = Math.min(1, st.w + dt / sh.def.ease);
      const sp = shotParams(sh, dt), k = sh.def.ease > 0 ? easeIO(st.w) : 1, f = sh.from;
      o = { x: lerp(f.x, sp.x, k), y: lerp(f.y, sp.y, k), dist: lerp(f.dist, sp.dist, k), horizon: lerp(f.horizon, sp.horizon, k) };
      /* releases: the reveal after 3 s or 1.5 m of movement; the entry hold if the rabbit leaves the nook (x > 91) or the gun is down */
      if (sh.id === 'courtyard-reveal') { const z = zoneById('courtyard-reveal'); if (sh.t >= (z.hold || 3.0) || Math.abs(r.x - sh.rx0) >= (z.releaseOnMove || 1.5)) releaseShot(); }
      else if (sh.id === 'search-entry-hold') { const s = g.searcher || {}; if (r.x > 91.0 || (s.entryT != null && s.entryT >= 10.55) || (g.flags && g.flags.entryDone) || (s.state && s.state !== 'entry' && s.state !== 'wait')) releaseShot(); }
      else if (sh.id === 'duct-transit' && r.mode === 'play' && sh.t > 1.0) releaseShot();
    } else if (st.rel) {
      const R = st.rel; R.t += dt; const k = easeIO(R.t / R.dur);
      o = { x: lerp(R.from.x, o.x, k), y: lerp(R.from.y, o.y, k), dist: lerp(R.from.dist, o.dist, k), horizon: lerp(R.from.horizon, o.horizon, k) };
      if (R.t >= R.dur) st.rel = null;
    }
    Object.assign(out, o);
    apply();
  },
  /* the current lens state (others may read it: the world culls places and moves rain with it) */
  get state() { return { x: out.x, y: out.y, dist: out.dist, horizon: out.horizon, shot: st.shot && st.shot.id, zone: st.zone }; },
  debug() {
    const a = {}; for (const k in attends) a[k] = +(attends[k].k || 0).toFixed(2);
    const m = {}; for (const k in st.mods) if (st.mods[k] > 0.01) m[k] = +st.mods[k].toFixed(2);
    return { stub: false, zone: st.zone, shot: st.shot && st.shot.id, releasing: !!st.rel, x: +out.x.toFixed(2), y: +out.y.toFixed(2), dist: +out.dist.toFixed(2), horizon: +out.horizon.toFixed(3), attends: a, mods: m, torchDown: st.torchDown };
  },
  dispose() { for (const off of offs) off(); offs = []; },
};
function vehicleX() {
  if (st.vehicleX != null) return st.vehicleX;
  const h = FF.World && FF.World.spot && FF.World.spot('headlights');
  if (h && h.st && h.st.on && h.st.intensity > 0) return h.st.pos[0];
  const v = FF.S1.verge && FF.S1.verge.vehicle, t = G().frameT - (st.vehicleT || 0);
  return v ? lerp(v.fromX, v.stop[0], clamp(t / 6.0, 0, 1)) : null;
}
function apply() { cam.position.set(out.x, out.y, out.dist); cam.rotation.set(0, 0, 0); cam.updateMatrixWorld(); Camera.project(); }
})();
