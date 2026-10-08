/* FAR FIELD — ff-works-flow.js: FF.WorksFlow, the flow around Sequence 2's machines (SEQUENCE-2.md §9, §10, §11 FF.Events):
   SHELTER CHECKPOINTS: the last shelter reached is the restart point, in any order (like the Search's cores): while playing,
   grounded and in control, the rabbit's centre in the core of a shelter that has a checkpoint (FF.S2.shelters: the apron,
   pits A and B, the line's entry floor, G1, G2, pit C) makes it the checkpoint (FF.Events.setCheckpoint). The progress
   checkpoints (works-in, works-passage, works-out) are passed by x as before (ff-events.js). The failure flow is Sequence
   1's (ff-events.js, on the bus 'fail' {kind: 'machine'}): black on the next frame, the restart at 0.80 s with FF.Works
   setting the machines from the checkpoint's phase, control at 1.00 s, picture at 1.25 s.
   SEQUENCE 1's REST, JOINED (FF.S2.join; Josh 7 Oct: no invisible wall): the settle chain under the lean-to still ends in
   'end' {phase: 'settled'} -> held 4.0 s -> the pull-out to the Works (Camera.shot('pull-out'), 8 s, held 3 s, eased back
   4 s); control is never taken; any input brings it back at once. No fade, no card: the way on is the slab. (ff-events.js
   hands every settle to this module while it is loaded: FF.WorksFlow.ownsEnd.)
   THE END OF SEQUENCE 2 (FF.S2.end; Josh 7 Oct: the end of a section must never feel like an invisible wall). Two ways, either
   one ends it, neither locks the player before it commits:
     (a) REST under the pipe: the Player's settle chain there ends in 'end' {phase: 'settled'} -> held loafHold 4.0 s (any
         movement cancels) -> the pull-out (Camera.shot('out-pullout'), 8 s; control is kept: any input before the fade eases
         the camera back and the rabbit gets up) -> commit: control off, fade 2.0 s, 0.5 s black -> the card.
     (b) WALK ON down the embankment: from x 209.0 the camera stops following (the out-leave zone's holdX, FF.Camera); at
         x 211.0, or 4.0 s after 209.0 while still moving on, the fade starts (2.5 s) and commits; turning back below 208.5
         before then cancels it. The player keeps control through the fade (the rabbit walks on into the fog).
     The card: FF.Game.endCard() ("to be continued", then the title; the save becomes "completed").
   FACTS: pullout {phase: start|return, seq: 1 (Sequence 1's rest) | 2 (the pipe), cause: input|time}  ending {phase: hold|leave|cancel|fade, way: rest|leave}
          end {phase: 'card', way}  (only at the card: the Player locks input on any end phase but 'settled')
   Debug: FF.WorksFlow.debug() (window.__ff.flow). OWNER: the Sequence 2 events builder. */
'use strict';
window.FF = window.FF || {};
(function () {
const G = () => FF.G || {}, E2 = () => FF.S2.end;
const emit = (n, d) => { if (FF.bus) FF.bus.emit(n, d || {}); };
const A = { phase: '', t: 0 };                    // ending (a): '' | hold | pullout | fade
const R1 = { phase: '', t: 0 };                   // Sequence 1's rest: '' | hold | pullout (optional, returns)
const L = { on: false, t: 0, committed: false, ft: 0 };   // ending (b)
const st = { set: [], cpSet: 0 };
const inS2 = x => x >= FF.S2.sections[0].x0;
function input() { const I = FF.Input; if (!I || !I.raw) return false; return ['left', 'right', 'up', 'down', 'jump'].some(a => I.raw(a)); }
function moving(r) { return !!r && (Math.abs(r.vx || 0) > 0.05 || r.grounded === false); }
function card(way) { emit('end', { phase: 'card', way }); if (FF.Game && FF.Game.endCard) FF.Game.endCard(); }

/* ---------------------------------------------------------------- shelter checkpoints */
function shelterCps() {
  const g = G(), r = g.rabbit; if (!r || g.mode !== 'play' || !g.control || (r.mode && r.mode !== 'play') || r.grounded === false) return;
  if (!inS2(r.x) || !FF.Events || !FF.Events.setCheckpoint) return;
  if (FF.Works && FF.Works.cutting) return;
  for (const s of FF.S2.shelters || []) {
    if (!s.checkpoint || !s.core || r.x < s.core[0] || r.x > s.core[1]) continue;
    const cp = FF.Level && FF.Level.checkpoint ? FF.Level.checkpoint(s.checkpoint) : null;
    if (cp && cp.y != null && Math.abs(r.y - cp.y) > 0.3) continue;
    if (g.checkpoint !== s.checkpoint) { FF.Events.setCheckpoint(s.checkpoint); st.cpSet++; st.set.push(s.checkpoint); if (st.set.length > 12) st.set.shift(); }
    return;
  }
}

/* ---------------------------------------------------------------- ending (a): rest under the pipe */
function restStep(dt) {
  if (!A.phase) return;
  const r = G().rabbit, R = E2().rest; A.t += dt;
  if (A.phase === 'hold') {
    if (moving(r) || input()) { A.phase = ''; emit('ending', { phase: 'cancel', way: 'rest' }); return; }
    if (A.t >= R.loafHold) { A.phase = 'pullout'; A.t = 0; if (FF.Camera && FF.Camera.shot) FF.Camera.shot(R.pullout); emit('pullout', { phase: 'start', seq: 2 }); }
  } else if (A.phase === 'pullout') {
    const z = (FF.S2.camera.zones.find(k => k.id === R.pullout) || {}), T = z.time || 8.0;
    if (input() || moving(r)) { A.phase = ''; if (FF.Camera && FF.Camera.shot) FF.Camera.shot(null, { release: 2.0 }); emit('pullout', { phase: 'return', seq: 2, cause: 'input' }); return; }
    if (A.t >= T) { A.phase = 'fade'; A.t = 0; if (FF.Game) { FF.Game.control(false); FF.Game.fade(1, R.fade); } emit('ending', { phase: 'fade', way: 'rest' }); }
  } else if (A.phase === 'fade') {
    if (A.t >= R.fade + R.black) { A.phase = 'done'; card('rest'); }
  }
}
/* ---------------------------------------------------------------- Sequence 1's rest: the optional pull-out */
function s1Step(dt) {
  if (!R1.phase) return;
  const r = G().rabbit; R1.t += dt;
  const z = (FF.S1.camera.zones.find(k => k.id === 'pull-out') || {}), T = z.time || 8.0;
  const back = (cause, rel) => { R1.phase = ''; if (FF.Camera && FF.Camera.shot) FF.Camera.shot(null, { release: rel }); emit('pullout', { phase: 'return', seq: 1, cause }); };
  if (R1.phase === 'hold') {
    if (moving(r) || input()) { R1.phase = ''; return; }
    if (R1.t >= ((FF.RULES.behave && FF.RULES.behave.settle && FF.RULES.behave.settle.loafHold) || 4.0)) { R1.phase = 'pullout'; R1.t = 0; if (FF.Camera && FF.Camera.shot) FF.Camera.shot('pull-out'); emit('pullout', { phase: 'start', seq: 1 }); }
  } else if (R1.phase === 'pullout') {
    if (input() || moving(r)) return back('input', 1.5);
    if (R1.t >= T + (z.holdAfter != null ? z.holdAfter : 3.0)) back('time', z.returnTime || 4.0);
  }
}
/* ---------------------------------------------------------------- ending (b): walk on into the fog */
function leaveStep(dt) {
  const r = G().rabbit, V = E2().leave; if (!r || G().mode !== 'play') return;
  if (L.committed) { L.ft += dt; if (L.ft >= V.fade && !L.done) { L.done = true; card('leave'); } return; }
  if (A.phase === 'fade' || A.phase === 'done') return;
  if (!L.on) { if (r.x >= V.holdAt) { L.on = true; L.t = 0; emit('ending', { phase: 'leave', way: 'leave', x: +r.x.toFixed(2) }); } return; }
  if (r.x < V.cancelBelowX) { L.on = false; L.t = 0; emit('ending', { phase: 'cancel', way: 'leave', x: +r.x.toFixed(2) }); return; }
  L.t += dt;
  if (r.x >= V.fadeAtX || (L.t >= V.fadeAfter && (r.vx || 0) > 0.05)) {
    L.committed = true; L.ft = 0; if (A.phase) A.phase = '';
    if (FF.Game && FF.Game.fade) FF.Game.fade(1, V.fade);
    emit('ending', { phase: 'fade', way: 'leave', x: +r.x.toFixed(2) });
  }
}

const Flow = FF.WorksFlow = {
  stub: false,
  init() {
    if (FF.bus) FF.bus.on('end', d => {
      if (!d || d.phase !== 'settled' || A.phase || R1.phase || L.committed) return;
      const x = d.x != null ? d.x : (G().rabbit ? G().rabbit.x : 0);
      if (!inS2(x)) { R1.phase = 'hold'; R1.t = 0; return; }  // Sequence 1's rest: the optional pull-out
      A.phase = 'hold'; A.t = 0; emit('ending', { phase: 'hold', way: 'rest', x });
    });
    try { if (typeof window !== 'undefined' && window.__ff && !Object.getOwnPropertyDescriptor(window.__ff, 'flow')) Object.defineProperty(window.__ff, 'flow', { get: () => Flow.debug(), configurable: true }); } catch (_) {}
  },
  /* ff-events.js leaves every settle to this module (Sequence 1's own end flow, the card after its pull-out, is off) */
  ownsEnd: true,
  reset() { A.phase = ''; A.t = 0; R1.phase = ''; R1.t = 0; Object.assign(L, { on: false, t: 0, committed: false, ft: 0, done: false }); },
  step(dt) { shelterCps(); s1Step(dt); restStep(dt); leaveStep(dt); },
  /* true while an ending runs (main may hold the tier step-down) */
  scripted() { return !!A.phase || !!R1.phase || L.committed; },
  debug() { return { cp: G().checkpoint, set: st.set.slice(), s1: { phase: R1.phase, t: +R1.t.toFixed(2) }, rest: { phase: A.phase, t: +A.t.toFixed(2) }, leave: { on: L.on, t: +L.t.toFixed(2), committed: L.committed } }; },
};
})();
