/* the door reveal tests, in-page half: steps the game by fixed steps (__ff.tick) and records what happens. Keys come from node
   (real CDP key events). Nothing here touches FF.Input. */
window.RT = (function () {
  const g = () => __ff.G;
  const W = { ev: [], landT: null, maxS: 0, maxSTake: 0, litTake: 0, minDist: 99, states: [], after: null, xs: [], camN: 0, camLast: null, camMaxDx: 0, camMaxDd: 0, camMaxAcc: 0, camPath: [], frames: [], lastFT: null };
  const rec = (name, d) => W.ev.push([+g().t.toFixed(3), name, d]);
  for (const n of ['reveal', 'entry', 'ai:state', 'fail', 'restart', 'search-entry', 'transit', 'rabbit:land', 'rabbit:jump'])
    FF.bus.on(n, d => { d = d || {}; rec(n, n === 'ai:state' ? d.to : n === 'rabbit:land' ? { x: d.x, h: d.h } : n === 'rabbit:jump' ? { x: d.x, y: d.y } : (d.phase || d.kind || d.cp || d.reason || d.arg || '')); if (n === 'search-entry') W.landT = g().t; });
  function tick() {
    __ff.tick();
    const G = g(), r = G.rabbit, s = G.searcher || {}, rv = FF.Events.reveal();
    W.maxS = Math.max(W.maxS, s.s || 0);
    if (rv.phase || G.flags.revealSafe) { W.maxSTake = Math.max(W.maxSTake, s.s || 0); W.litTake = Math.max(W.litTake, s.lit || 0); if (s.active && s.state !== 'wait') W.minDist = Math.min(W.minDist, Math.abs((s.x || 0) - r.x)); }
    if (W.states[W.states.length - 1] !== s.state) W.states.push(s.state);
    /* the lens path while the reveal runs: per presented frame (every 2nd step), the jump in x / dist and the acceleration */
    if (rv.phase && G.frameT !== W.lastFT) { W.lastFT = G.frameT; W.frames.push([+G.frameT.toFixed(4), +FF.Camera.state.x.toFixed(4), +FF.Camera.state.dist.toFixed(4), rv.phase]); }
    if (false) { const c = FF.Camera.state; const p = W.camLast; if (p) { const dx = c.x - p.x, dd = c.dist - p.dist; W.camMaxDx = Math.max(W.camMaxDx, Math.abs(dx)); W.camMaxDd = Math.max(W.camMaxDd, Math.abs(dd)); if (p.dx != null) W.camMaxAcc = Math.max(W.camMaxAcc, Math.abs(dx - p.dx)); W.camLast = { x: c.x, dist: c.dist, dx }; } else W.camLast = { x: c.x, dist: c.dist, dx: null }; W.camPath.push([+G.t.toFixed(3), +c.x.toFixed(3), +c.dist.toFixed(3), rv.phase]); }
  }
  /* the rabbit's place across the frame (0 left edge .. 1 right edge) */
  function scr() { const r = g().rabbit, v = new THREE.Vector3(r.x, r.y + 0.15, 0).project(__ff.camera); return +((v.x + 1) / 2).toFixed(3); }
  /* where the fence gap sits across the frame (the door reveal's framing at this aspect) */
  function gapShare() { const v = new THREE.Vector3(113.3, 0.2, 0).project(__ff.camera), d = new THREE.Vector3(110.0, 1.0, -3.0).project(__ff.camera); return { gap: +((v.x + 1) / 2).toFixed(3), door: +((d.x + 1) / 2).toFixed(3) }; }
  function state() {
    const G = g(), r = G.rabbit, s = G.searcher || {}, rv = FF.Events.reveal(), c = FF.Camera.debug();
    return { t: +G.t.toFixed(3), sinceLand: W.landT == null ? null : +(G.t - W.landT).toFixed(3), x: +r.x.toFixed(3), y: +r.y.toFixed(3), vx: +(r.vx || 0).toFixed(3), grounded: !!r.grounded, mode: r.mode,
      control: G.control, rv: rv.phase, cause: rv.cause, pose: FF.Player.debug().pose, latched: rv.latched, resumed: rv.resumed, seen: rv.seen, run: !!r.run, scr: scr(), ai: s.state, entryT: s.entryT != null ? +s.entryT.toFixed(2) : null, loopT: s.loopT != null ? +s.loopT.toFixed(2) : null, s: +(s.s || 0).toFixed(3),
      cam: { shot: c.shot, x: c.x, dist: c.dist, releasing: c.releasing }, fade: +G.fade.toFixed(2), cp: G.checkpoint, place: G.place };
  }
  function until(expr, maxSec) {
    const f = new Function('G', 'r', 's', 'R', 'W', 'return (' + expr + ');');
    for (let i = 0; i < maxSec * 120; i++) { const G = g(); if (f(G, G.rabbit, G.searcher || {}, FF.Events.reveal(), W)) { __ff.flush(); return Object.assign({ ok: true }, state()); } tick(); }
    __ff.flush(); return Object.assign({ ok: false }, state());
  }
  /* set up: the rabbit on the box under the raised opening in the Courtyard (test shortcut for the box puzzle) */
  function toBox() {
    __ff.warp('courtyard'); const G = g();
    G.box.x = 76.0; G.rabbit.x = 76.0; G.rabbit.y = 0.44; G.rabbit.vy = 0; G.rabbit.grounded = true;
    __ff.step(4); return state();
  }
  return { W, tick, state, until, toBox, gapShare, log: () => FF.Events.reveal().log };
})();
true;
