/* Integrator bot (in-page half). The node half (play.mjs) turns BOT's wanted actions into REAL key events through CDP
   (Input.dispatchKeyEvent -> the page's keydown/keyup listeners -> FF.Input), then calls BOT.adv() which steps the game one
   fixed step at a time (__ff.tick) until the plan wants a different set of keys. Nothing here touches FF.Input directly. */
window.BOT = (function () {
  /* 7 Oct (Josh's playtest): a direction alone is the cautious walk; Shift (the 'run' action) + a direction runs */
  const CODE = { right: 'ArrowRight', left: 'ArrowLeft', jump: 'Space', up: 'ArrowUp', down: 'ArrowDown', run: 'ShiftLeft' };
  const ACT = { ArrowRight: 'right', ArrowLeft: 'left', Space: 'jump', ArrowUp: 'up', ArrowDown: 'down', ShiftLeft: 'run' };
  const G = () => __ff.G, AI = () => FF.AI.debug();
  const B = { plan: null, legs: [], leg: 0, mem: {}, marks: [], log: [], done: false, err: null, steps: 0, shots: [] };
  B.mark = (name, extra) => { const g = G(), r = g.rabbit; const m = Object.assign({ name, t: +g.t.toFixed(2), x: r ? +r.x.toFixed(2) : null, place: g.place, mode: g.mode }, extra || {}); B.marks.push(m); return m; };
  /* leg helpers */
  B.use = function (legs, hook) { B.hook = hook || null; B.legs = legs; B.leg = 0; B.mem = {}; B.done = false; B.err = null; B.marks = []; B.legT = 0; B.shots = []; };
  function want() {
    if (B.hook) { let h = null; try { h = B.hook(); } catch (e) { B.err = 'hook: ' + e.message; B.done = true; return {}; } if (h) { B.shots.push(h); B.pendingShot = h; return null; } }
    for (;;) {
      if (B.leg >= B.legs.length) { B.done = true; return {}; }
      const L = B.legs[B.leg]; const s = { g: G(), r: G().rabbit, ai: FF.G.searcher, t: B.legT, m: B.mem };
      let out; try { out = L.f(s); } catch (e) { B.err = L.name + ': ' + e.message; B.done = true; return {}; }
      if (out === true || (out && out.done)) { B.mark('leg-done:' + L.name); B.leg++; B.legT = 0; if (out && out.shot) { B.shots.push(out.shot); B.pendingShot = out.shot; return null; } continue; }
      return out || {};
    }
  }
  /* step until the wanted key set differs from `held` (codes held by node), a leg asks for a screenshot, or max steps */
  B.adv = function (held, max) {
    held = held || []; max = max || 120 * 600;
    for (let i = 0; i < max; i++) {
      const w = want(); if (B.done) { __ff.flush(); return { done: true, err: B.err, steps: B.steps }; }
      if (w === null) { const sh = B.pendingShot; B.pendingShot = null; __ff.flush(); return { shot: sh, steps: B.steps }; }
      const codes = Object.keys(w).filter(k => w[k]).map(k => CODE[k]);
      const same = codes.length === held.length && codes.every(c => held.includes(c));
      /* a held key the page dropped (mode change / restart clear input): re-press it. FF.Input.raw: a key the door reveal
         latched is still held (a player holding forward), not dropped */
      const dropped = held.filter(c => !(FF.Input.raw ? FF.Input.raw(ACT[c]) : FF.Input.down(ACT[c])));
      if (!same || dropped.length) { __ff.flush(); return { keys: codes, repress: dropped, steps: B.steps }; }
      __ff.tick(); B.steps++; B.legT += 1 / 120;
    }
    __ff.flush(); return { timeout: true, steps: B.steps };
  };
  /* --------------------------------------------------------------- reusable leg makers */
  B.L = {
    wait: (name, secs) => ({ name, f: s => s.t >= secs ? true : {} }),
    until: (name, pred, keys, max) => ({ name, f: s => { if (pred(s)) return true; if (max && s.t > max) throw new Error('timeout ' + name + ' x=' + s.r.x.toFixed(2)); return keys ? keys(s) : {}; } }),
    shot: (name, file) => ({ name, f: () => ({ done: true, shot: file }) }),
    /* go to x and stop there (release early by the decel distance) */
    goto: (name, x, opts) => ({ name, f: s => { opts = opts || {}; const r = s.r, dx = x - r.x; const tol = opts.tol || 0.12;
      if (Math.abs(dx) < tol && Math.abs(r.vx) < 0.05) return true;
      if (s.t > (opts.max || 60)) throw new Error('goto timeout ' + name + ' x=' + r.x.toFixed(2));
      if (!s.g.control) return {};     /* a takeover (the door reveal): let go, press again when control is back */
      const stop = (r.vx * r.vx) / (2 * 10.0) + 0.03;   // decel 10 m/s^2
      if (Math.abs(dx) <= stop || Math.abs(dx) < tol) return {};
      const k = dx > 0 ? { right: 1 } : { left: 1 }; if (opts.run && Math.abs(dx) > 1.0) k.run = 1; return k; } }),   /* Shift = run; a direction alone is the cautious walk */
  };
  return B;
})();
true;
