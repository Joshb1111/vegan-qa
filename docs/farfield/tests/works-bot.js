/* Far Field, Sequence 2 (THE WORKS): a bot route for headless tests, injected into the game page (Runtime.evaluate).
   window.__worksBot(opts) -> plan(s) for window.__ff.run(n, plan) (or any loop that holds the returned keys before each fixed
   step): { left, right, run, down, jump }. It plays like a careful first-timer who reads the machines (FF.Works), never
   their future: it holds in safe places (the apron, the pits, the gaps, the entry floor), leaves when the press ahead is
   passable (rising past 0.30 m, or up) after its reaction, and under a press at the RELEASE it reacts and goes to the nearest
   safety. It never looks at a timer the player cannot see. Mirrors docs/farfield/checks/works-sim.mjs's bots.
   opts: react (s, 0.6) · p1: 'pits' (pit to pit) | 'direct' (straight to pit B) | 'wall' (on to the bed's end against the
   wall, back into pit B at the release) · line: 'continuous' | 'cautious' (waits in every gap for a fresh rise) | 'runner'
   (Shift, stops in each gap and goes when the press ahead has risen: a reader at run speed) | 'blind' (Shift + Right held from the entry floor, never reads anything: it must be caught) | 'fleeRun' (walks, runs when a release catches it) · delay (s, a hesitation once at each station) ·
   painter: 'wait' (waits in the dark, leaves 0.6 s after the scraping starts) | 'careless' (stands in his light until he has
   looked, then RUNS) | 'walk' (walks straight past; runs once he has looked) · end: 'leave' (down the embankment) | 'rest' (stops under the pipe) | 'none'
   (stops at 196) · stopAt (x: stop there and hold still).
   bot.state() -> {mode, where, log}. */
(function () {
  window.__worksBot = function (opts) {
    opts = Object.assign({ react: 0.6, p1: 'pits', line: 'continuous', delay: 0, painter: 'wait', end: 'leave', stopAt: null }, opts || {});
    const W = FF.Works, RB = FF.RULES.rabbit, HW = RB.hw, INSET = FF.RULES.works.press.centreInset, S2 = FF.S2;
    const sh = id => S2.shelters.find(s => s.id === id), pitA = sh('pit-A'), pitB = sh('pit-B'), pitC = sh('pit-C');
    const mid = p => (p.core[0] + p.core[1]) / 2, inCore = (p, x) => x >= p.core[0] && x <= p.core[1];
    const Q = ['Q1', 'Q2', 'Q3'].map(id => W.machine(id)), P1 = W.machine('P1');
    const B = { mode: 'go', where: '', target: null, ready: -1, react: -1, sawDown: false, waited: {}, used: {}, log: [], flee: false, jumpT: -1, look0: 0 };
    const log = (t, m) => { B.log.push(+t.toFixed(2) + ' ' + m); if (B.log.length > 60) B.log.shift(); };
    const pass = id => W.press(id).passable;
    const dangerOf = id => { const p = W.press(id); return p.state === 'release' || p.state === 'descent'; };
    function holdAt(x, where, t) { B.mode = 'hold'; B.target = x; B.where = where; B.ready = -1; B.sawDown = false; B.flee = false; log(t, 'hold ' + where + ' @' + x.toFixed(2)); }
    function goTo(x, why, t) { B.mode = 'go'; B.target = x; B.ready = -1; B.flee = false; log(t, 'go ' + x.toFixed(2) + ' ' + (why || '')); }
    function readyAfter(t, extraKey) { if (B.ready < 0) { B.ready = t + opts.react + (extraKey && !B.used[extraKey] ? opts.delay : 0); if (extraKey) B.used[extraKey] = true; } return t >= B.ready; }
    function plan(s) {
      const G = FF.G, r = G.rabbit, t = G.t, x = r.x;
      let run = false, down = false, jump = false;
      if (!G.control) return {};
      if (opts.stopAt != null && x >= opts.stopAt) return {};
      /* ---------------- danger: under a press at its release (not in a pit core under it): react, then the nearest safety */
      const under = [P1, ...Q].find(m => x + HW > m.x0 && x - HW < m.x1 && x > m.x0 - 0.02 && x < m.x1 + 0.02);
      const pit = under && under.id === 'P1' ? (inCore(pitA, x) ? pitA : inCore(pitB, x) ? pitB : null) : under && under.id === 'Q3' && inCore(pitC, x) ? pitC : null;
      if (under && dangerOf(under.id) && !pit && !B.flee && r.y > -0.5) {
        if (B.react < 0) B.react = t + opts.react;
        if (t >= B.react) {
          const o = [{ x: under.x0 - HW - 0.03, k: 'back' }];
          if (!under.wallRight) o.push({ x: under.x1 + HW + 0.03, k: 'on' });
          for (const p of (under.id === 'P1' ? [pitA, pitB] : under.id === 'Q3' ? [pitC] : [])) o.push({ x: x < p.core[0] ? p.core[0] + 0.05 : x > p.core[1] ? p.core[1] - 0.05 : x, k: p.id });
          o.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
          B.mode = 'go'; B.target = o[0].x; B.flee = true; B.react = -1; log(t, 'release of ' + under.id + ' at ' + x.toFixed(2) + ' -> ' + o[0].k);
        }
      } else if (!(under && dangerOf(under.id))) B.react = -1;
      if (B.flee) {
        if (Math.abs(x - B.target) < 0.03) { const p = [pitA, pitB, pitC].find(q => inCore(q, x)); holdAt(x, p ? p.id : 'gap', t); B.sawDown = true; }
        else return dirTo(B.target, opts.line === 'fleeRun' || opts.line === 'runner', false);
      }
      /* ---------------- the way on and the apron */
      if (x < 139.3 && !(B.mode === 'hold' && B.where === 'apron')) {
        if (x >= 139.2) holdAt(139.4, 'apron', t); else return { right: true };
      }
      if (B.mode === 'hold' && B.where === 'apron') {
        if (!pass('P1')) B.sawDown = true;
        if (pass('P1') && B.sawDown) { if (readyAfter(t, 'apron')) { if (pass('P1')) goTo(opts.p1 === 'pits' ? mid(pitA) : opts.p1 === 'direct' ? mid(pitB) : P1.x1 - HW - 0.02, 'P1 up', t); else B.ready = -1; } }
        else B.ready = -1;
        return dirTo(B.target);
      }
      /* ---------------- under P1: pit A, pit B, the bed's end, the sluice */
      if (x >= 139.3 && x < 146.3 && r.y > -0.7) {
        if (B.mode === 'go' && Math.abs(x - B.target) < 0.03) holdAt(x, inCore(pitA, x) ? 'pit-A' : inCore(pitB, x) ? 'pit-B' : x > pitB.core[1] ? 'wall' : 'bed', t);
        if (B.mode === 'hold') {
          if (B.where === 'pit-A') { if (!pass('P1')) B.sawDown = true; if (pass('P1') && B.sawDown) { if (readyAfter(t)) goTo(mid(pitB), 'to pit B', t); } else B.ready = -1; }
          else if (B.where === 'pit-B') { const g = W.sluice(); if (g.passable && g.state !== 'close') { if (readyAfter(t)) goTo(147.2, 'the gate', t); } else B.ready = -1; }
          else if (B.where === 'wall') { /* waits for the release (the danger branch takes it back down into pit B) */ }
          else if (B.where === 'bed') goTo(mid(pitB), 'to pit B', t);
        }
        /* the bed's end is reached only by a hop out of pit B */
        if (B.mode === 'go' && B.target > pitB.x1 && x > pitB.core[0] && x < pitB.x1 && r.grounded && r.y < -0.3 && Math.abs(r.vx) < 0.05 && opts.p1 === 'wall' && B.target < 147) jump = true;
        return Object.assign(dirTo(B.target), jump ? { jump: true } : {});
      }
      /* ---------------- the culvert */
      if (x >= 146.0 && x < 153.0) { B.mode = 'go'; return { right: true }; }
      /* ---------------- the passage and the worker */
      if (x >= 153.0 && x < 166.4) {
        const P = FF.Painter.debug();
        /* polish pass 8 Oct: he hears, watches with his lamp and pursues. Any first-timer who is looked at RUNS (Shift) after a 0.6 s reaction:
           he is slower than a run, and the door at 166.2 stops him */
        if (P.looks > 0 && B.used.noticedAt == null) B.used.noticedAt = t;
        const fleeNow = B.used.noticedAt != null && t >= B.used.noticedAt + opts.react;
        if (opts.painter === 'walk') return fleeNow ? { right: true, run: true } : { right: true };
        if (opts.painter === 'careless') {
          if (B.used.noticedAt == null) { if (x < 159.6) return { right: true }; return {}; }
          return fleeNow ? { right: true, run: true } : {};
        }
        /* wait in the dark at 158.1 until the scraping has started again (0.6 s after) */
        if (!B.used.painterGo) {
          if (x < 158.05) return { right: true };
          if (P.mode === 'loop' && P.loopT >= 0.6 && P.loopT < 1.2) { B.used.painterGo = true; log(t, 'past the worker, loopT ' + P.loopT); return { right: true }; }
          return {};
        }
        return { right: true };
      }
      /* ---------------- the long hall */
      if (x >= 166.4 && x < 190.5) {
        const runner = opts.line === 'runner';
        if (opts.line === 'blind') return { right: true, run: true };     // polish pass 8 Oct: holds Shift + Right, reads nothing
        if (x < 168.9 && !(B.mode === 'hold' && B.where === 'line-entry') && !B.used.lineEntry) { if (x >= 168.8) { holdAt(168.9, 'line-entry', t); B.used.lineEntry = true; } else return { right: true }; }
        if (B.mode === 'go' && B.target != null && B.target < 190 && Math.abs(x - B.target) < 0.03) holdAt(x, inCore(pitC, x) ? 'pit-C' : 'gap', t);
        if (B.mode === 'hold') {
          const nxt = B.where === 'pit-C' ? Q[2] : Q.find(q => q.x0 > x);
          if (!nxt) { goTo(191.5, 'out', t); return dirTo(B.target, runner); }
          if (!pass(nxt.id)) B.sawDown = true;
          const fresh = opts.line !== 'cautious' || B.where === 'line-entry' || B.sawDown;
          if (pass(nxt.id) && fresh) { if (readyAfter(t, B.where === 'line-entry' ? 'line' : null)) { if (pass(nxt.id)) goTo(191.5, 'on past ' + nxt.id, t); else B.ready = -1; } }
          else B.ready = -1;
          return dirTo(B.target, runner);
        }
        /* walking on: stop at a gap's edge if the press ahead is not passable (the cautious one always waits once per gap) */
        const nxt = Q.find(q => q.x0 > x + 1e-6), inside = Q.find(q => x + HW > q.x0 && x - HW < q.x1);
        /* a runner starts to stop one stopping distance before the edge (decel 10 m/s2) */
        const stopD = runner ? r.vx * r.vx / (2 * RB.decel) + 0.25 : 0;
        if (!inside && nxt && x >= nxt.x0 - HW - 0.06 - stopD && !B.waited[nxt.id]) {
          if (!pass(nxt.id) || (opts.line === 'cautious' && nxt.id !== 'Q1')) { B.waited[nxt.id] = true; holdAt(Math.min(x + (runner ? r.vx * r.vx / (2 * RB.decel) : 0), nxt.x0 - HW - 0.02), 'gap', t); B.sawDown = !pass(nxt.id); return {}; }
        }
        return dirTo(B.target != null ? B.target : 191.5, runner);
      }
      /* ---------------- out: the end door, the pipe, the embankment */
      if (opts.end === 'rest') return x < 202.5 ? { right: true } : {};
      if (opts.end === 'none') return x < 196 ? { right: true } : {};
      return { right: true };
    }
    function dirTo(tx, run, down) { const d = tx - FF.G.rabbit.x; if (Math.abs(d) < 0.03) return {}; return d > 0 ? { right: true, run: !!run, down: !!down } : { left: true, run: !!run, down: !!down }; }
    plan.state = () => ({ mode: B.mode, where: B.where, target: B.target, flee: B.flee, log: B.log.slice() });
    return plan;
  };
})();
