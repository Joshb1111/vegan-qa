/* Integrator Search scenarios (in-page legs for BOT). Every scenario starts from a real checkpoint warp; the rabbit is moved
   only by key events (node). A watcher records the searcher's state changes, the fail, the restart and control timings. */
window.SCEN = (function () {
  const R = BOT.L, loopT = () => (FF.G.searcher && FF.G.searcher.loopT != null ? FF.G.searcher.loopT : -1);
  const st = () => FF.G.searcher.state;
  const W = { states: [], fail: null, restart: null, controlBack: null, fullPicture: null, after: null };
  let lastState = null, failT = null;
  function watch() {
    const g = FF.G, s = st();
    if (s !== lastState) { W.states.push([+g.t.toFixed(2), s, +(FF.G.searcher.x || 0).toFixed(2), g.rabbit ? +g.rabbit.x.toFixed(2) : null]); lastState = s; }
  }
  FF.bus.on('fail', d => { failT = FF.G.t; W.fail = { t: +FF.G.t.toFixed(3), kind: d.kind, x: d.x, state: d.state }; });
  FF.bus.on('restart', d => { if (failT != null && !W.restart) W.restart = { dt: +(FF.G.t - failT).toFixed(3), cp: d.cp, reason: d.reason }; });
  FF.bus.on('ai:aim', d => { if (!W.click) W.click = +FF.G.t.toFixed(3); });
  const watchLeg = (name, pred, keys, max) => ({ name, f: s => { watch(); if (pred(s)) return true; if (max && s.t > max) throw new Error('timeout ' + name + ' x=' + s.r.x.toFixed(2) + ' ai=' + st()); return keys ? keys(s) : {}; } });
  /* after a fail: wait for control and the full picture (fade 0), noting when */
  const afterFail = () => [
    watchLeg('cut', s => W.fail && s.g.fade >= 1, () => ({}), 30),
    /* the frame drawn right after the fail step must be black (R4: pixel mean < 2) */
    { name: 'cut-frame', f: s => { if (W.cutMean == null) { __ff.draw(); const gl = __ff.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let sum = 0, n = 0; for (let i = 0; i < px.length; i += 4 * 97) { sum += (px[i] + px[i + 1] + px[i + 2]) / 3; n++; } W.cutMean = +(sum / n).toFixed(2); W.cutAfter = +(s.g.t - W.fail.t).toFixed(3); } return true; } },
    { name: 'black', f: s => { watch(); if (W.fail && s.g.control && W.controlBack == null) W.controlBack = +(s.g.t - W.fail.t).toFixed(3); if (W.fail && s.g.fade <= 0.001 && W.fullPicture == null) W.fullPicture = +(s.g.t - W.fail.t).toFixed(3); if (W.controlBack != null && W.fullPicture != null) { W.after = { x: +s.r.x.toFixed(2), cp: s.g.checkpoint, ai: st(), loopT: +loopT().toFixed(2), crouch: s.r.crouch, pose: FF.Player.debug().pose }; return true; } if (s.t > 4) throw new Error('no restart'); return {}; } },
    R.wait('after', 0.3),
  ];
  const freeze = (name, secs) => watchLeg(name, s => s.t >= secs, () => ({}));
  const reactAndFlee = (name, fromState, react, toX) => [
    watchLeg(name + ':wait-' + fromState, s => st() === fromState || W.fail, () => ({}), 20),
    { name: name + ':react', f: s => { watch(); if (s.t >= react) return true; return {}; } },
    watchLeg(name + ':flee', s => W.fail || (toX < s.r.x ? s.r.x <= toX + 0.15 : s.r.x >= toX - 0.15), s => (toX < s.r.x ? { left: 1 } : { right: 1 }), 10),
    watchLeg(name + ':stop', s => W.fail || Math.abs(s.r.vx) < 0.05, () => ({}), 3),
  ];
  /* shots of the telegraphs, wherever they happen: NOTICE (0.3 s in: footsteps stopped, torch drifting) and the aim hold */
  const hook = () => { watch(); const a = st(), ai = FF.AI.debug();
    if (a === 'notice' && !W.noticeShot && ai.modeT > 0.3) { W.noticeShot = true; return 'alert-notice-' + W.name; }
    if (a === 'aim' && !W.aimShot && ai.modeT >= 0.9) { W.aimShot = true; return 'aim-hold-' + W.name; }
    return null; };
  return {
    W, hook,
    /* (c) caught: from the skip core, step out into his path as he comes back from the door, and freeze there */
    caught: () => [
      watchLeg('wait-door-side', s => loopT() >= 0.3 && loopT() < 1.2, () => ({}), 20),
      R.goto('step-out', 107.9, { max: 5 }),
      { name: 'freeze-shots', f: s => { watch(); const a = st(); if (a === 'notice' && !W.noticeShot) { W.noticeShot = true; return { done: true, shot: 'alert-notice-caught' }; } if (W.fail) return true; if (s.t > 10) throw new Error('not caught'); return {}; } },
      ...afterFail(),
    ],
    /* (d) shot: from the deck core, walk out in front of him as he walks towards the steps, and freeze in his torch */
    shot: () => [
      R.wait('settle', 0.2),
      R.goto('walk-out', 99.0, { max: 6 }),
      { name: 'freeze-shots', f: s => { watch(); const a = st(), ai = FF.AI.debug();
        if (a === 'notice' && !W.noticeShot && ai.modeT > 0.25) { W.noticeShot = true; return { done: true, shot: 'alert-notice' }; }
        if (a === 'aim' && !W.aimShot && ai.modeT >= 0.9) { W.aimShot = true; return { done: true, shot: 'aim-hold' }; }
        if (W.fail) return true; if (s.t > 12) throw new Error('not shot'); return {}; } },
      ...afterFail(),
    ],
    /* (b) detected and escape: walk out, get SPOTTED, react 0.6 s later (a first-timer), flee back into the deck core */
    escapeCore: () => [
      R.wait('settle', 0.2),
      R.goto('walk-out', 99.0, { max: 6 }),
      ...reactAndFlee('back-to-deck', 'spotted', 0.6, 95.0),
      watchLeg('hidden-until-calm', s => W.fail || ['patrol', 'wary'].includes(st()), () => ({}), 40),
      R.wait('linger', 1.0),
    ],
    /* (b2) detected near the fence with him behind: flee through the gap */
    escapeGap: () => [
      R.wait('settle', 0.2),
      ...reactAndFlee('to-gap', 'spotted', 0.6, 114.4),
      watchLeg('he-checks-the-gap', s => W.fail || ['return', 'patrol', 'wary'].includes(st()), () => ({}), 30),
    ],
    /* darkness never hides at close range: the rabbit slips out of the skip behind him as he walks to the door, then sits
       still in the dark 1.55 m from the spot where he turns round (the turn has the torch down: only the dark rule counts) */
    darkClose: () => [
      R.wait('settle', 0.05),
      R.goto('behind-him', 108.45, { max: 6 }),
      { name: 'freeze', f: s => { watch(); if (W.fail) return true; if (s.t > 10) throw new Error('never noticed'); return {}; } },
      ...afterFail(),
    ],
    watch,
  };
})();
true;
