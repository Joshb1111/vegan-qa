/* FAR FIELD — ff-events.js: FF.Events, the staged beats and the flow around them: the Verge (the van stopping beyond the
   wall, headlights, door, boots, the gate's chain, the glare reaction, the lock giving, the person at the culvert, the torch
   down the crack, the reach that falls short; A8 + A14: event-driven, looping while the player lingers, never pushing), the
   Courtyard walkway worker (A4: unarmed, indifferent) with the amber lamp and the far thud, checkpoints and saves, the
   failure flow (cut to black -> restart at the checkpoint, §10), and the end (settle -> pull-out -> card -> title).
   OWNER: the humans + events builder. API contract: docs/farfield/INTERFACES.md §8.7 and §9. SKELETON: checkpoint tracking,
   the complete failure flow, flags, and placeholders that log each beat's trigger; the staging is the builder's. */
'use strict';
window.FF = window.FF || {};
(function () {
const G = () => FF.G;
const st = { cp: 'verge-start', failing: null, scripted: 0, beats: {} };
const searchCps = ['search-arrive', 'search-platform', 'search-skip'];

function setCheckpoint(id) {
  if (st.cp === id) return; st.cp = id; G().checkpoint = id;
  const cp = FF.Level.checkpoint(id); if (cp && cp.save) FF.Game.save(id);
  FF.bus.emit('checkpoint', { id });
}

const Events = FF.Events = {
  stub: true,
  init() {
    const on = (n, f) => FF.bus.on(n, f);
    /* the failure flow (§9): AI emits 'fail' { kind: 'shot' | 'caught' } on the frame of the shot or the grab */
    on('fail', d => Events.fail(d.kind));
    /* beats (SKELETON: recorded only; the builder stages them from FF.S1.verge / .walkway) */
    for (const n of ['vehicle-arrive', 'gate-lit', 'person-out', 'rabbit-in-pipe', 'walkway-timer', 'shake-off', 'safe', 'rest', 'sound-cue', 'camera-shot'])
      on(n, d => { st.beats[n] = (st.beats[n] || 0) + 1; });
  },
  reset(cp, opts) {
    st.cp = cp.id; G().checkpoint = cp.id; st.failing = null; st.scripted = 0;
    if (opts && opts.reason !== 'fail') st.beats = {};
    /* progress flags implied by where we start (a warp or continue skips earlier beats) */
    const f = G().flags;
    if (cp.x > 38.5) f.vergeDone = true;
    if (cp.x > 86.0) f.walkwayDone = true;
    if (cp.id !== 'search-arrive' && cp.x > 89.0) f.entryDone = true;
    if (opts && (opts.reason === 'title' || opts.reason === 'start')) for (const k in f) delete f[k];
  },
  step(dt) {
    const r = G().rabbit; if (!r || st.failing) return;
    /* progress checkpoints: passing x; Search checkpoints: the whole body in that cover's core and the searcher not alert */
    for (const c of FF.S1.checkpoints) {
      if (c.id === st.cp) continue;
      const idx = FF.S1.checkpoints.indexOf(c), cur = FF.S1.checkpoints.findIndex(k => k.id === st.cp);
      if (searchCps.includes(c.id)) {
        const cover = FF.S1.covers.find(k => k.checkpoint === c.id);
        /* the last hide core reached undetected is the restart point (in any order) */
        if (cover && cover.core && r.x >= cover.core[0] && r.x <= cover.core[1] && !(FF.AI && FF.AI.danger && FF.AI.danger()) && cur >= FF.S1.checkpoints.findIndex(k => k.id === 'courtyard')) setCheckpoint(c.id);
      } else if (idx > cur && r.x >= c.x && (c.y == null || Math.abs(r.y - c.y) < 0.6)) setCheckpoint(c.id);
    }
  },
  /* cut to black on this frame, the report or scuff under black (audio listens to 'fail'), restart at the checkpoint after
     FF.RULES.fail.black, picture back over fadeIn, control at controlAt. Nothing is counted, nothing rewards harm. */
  fail(kind) {
    if (st.failing) return; const F = FF.RULES.fail;
    st.failing = { kind, t: 0 };
    FF.Game.cut(); FF.Game.control(false);
    setTimeoutSim(F.black, () => {
      FF.Game.restart(st.cp, { reason: 'fail', kind });
      FF.Game.fade(0, F.fadeIn);
      setTimeoutSim(F.controlAt - F.black, () => { FF.Game.control(true); st.failing = null; });
    });
  },
  /* true while a scripted beat runs (main holds the automatic quality step-down) */
  scripted() { return st.scripted > 0 || !!st.failing; },
  frame(dt) { tickTimers(dt); },
  debug() { return { stub: true, cp: st.cp, failing: st.failing && st.failing.kind, beats: Object.assign({}, st.beats), flags: Object.assign({}, G().flags) }; },
};

/* timers on presentation time (they keep running under the black, where steps are still taken) */
const timers = [];
function setTimeoutSim(sec, fn) { timers.push({ t: sec, fn }); }
function tickTimers(dt) { for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { FF.report(e, 'Events.timer'); } } } }
})();
