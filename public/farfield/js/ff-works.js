/* FAR FIELD — ff-works.js: FF.Works, the machines of Sequence 2 (THE WORKS; docs/farfield/SEQUENCE-2.md §3, §5, §8, §11).
   The first press P1 (24 s cycle) and the sluice gate hung on its counterweight; the long hall's three walking presses Q1, Q2
   and the great press Q3 (one 16 s bar, a beat apart, left to right). Every press speaks one grammar (FF.RULES.works.press):
     UP (stillness, the safe interval) -> RELEASE at 0 (the clank: a jolt of 6 cm, the telegraph, 2.0 s) -> DESCENT (2.0 s,
     slow then slamming) -> CONTACT at 4.0 (THE THUD, on the 4 s heartbeat) -> DOWN (pressing) -> RISE (never lethal) -> UP.
   Both clocks start at the bus event 'works-start' (Level's trigger works-first, the rabbit starting the creep out of the
   intake) at phase 0; before it P1 and the line hang up and still. A restart sets the clocks from the checkpoint's `works`
   ({P1} or {line}); a checkpoint past the trigger without one starts them at 0; before the trigger they are stopped.
   THE CUT (the non-graphic failure, as Sequence 1 §10): on the fixed step when a DESCENDING press's underside comes within
   lethalMargin of the rabbit's back as drawn (standing hStand 0.24 .. fully crouched hLow 0.15, by the Player's eased crouch) while the rabbit's CENTRE is inside its
   footprint (inset centreInset) and it is not in a pit core under that press (grounded or not): bus 'fail' {kind: 'machine',
   by, x}. ff-events.js runs the flow (black on the next drawn frame, the restart at 0.80 s, control at 1.00, picture at 1.25).
   Measured from the clank: 3.89 s (P1, Q1, Q2), 3.91 s (Q3) standing on the bed.
   THE CHAMFER SHOVE (fairness at the edges, involuntary, 0.12 s, no harm): a body that overlaps a descending footprint while
   its centre is outside it, in the last shove.time before contact, is pushed clear to the side its centre is on, with the
   startle (FF.Player.shove(toX, t) when the Player has it; otherwise this module moves G.rabbit.x itself before the Player
   steps). If that side is blocked by a solid, the cut applies instead.
   THE RAMP SLIDE (review fixes 8 Oct; the same path, kind 'ramp'): a rabbit whose centre is in a slot's visible notch but
   outside its core (on a ramp, where the ground dips below the bed) and whose back would meet the platen slides down into the
   core in the last moments of the descent (ramp.lead s before contact, or as the iron comes within ramp.margin), 0.12-0.25 s.
   The whole dark notch is a shelter, as it reads.
   THE SLUICE: its gap above pit B's floor follows P1 (lifts while P1 comes down, held open 0.30 while it presses, closes over
   its rise). Closing, it never cuts (review fixes 8 Oct): as its lower edge reaches the back of a rabbit under it, the rabbit
   is carried clear to the side its centre is on (slot B or the sill), kind 'gate'.
   DYNAMIC SOLIDS: FF.S2.solids 'P1', 'Q1'-'Q3' (kind 'press': y0 = underside, y1 = underside + thick) and 'sluice' (y0 =
   floorY + gap, y1 = top) are set on every fixed step BEFORE the Player steps (main's STEP order: Works first), so the
   Player's collision and the cut use this step's positions. The objects are shared with the merged lane (ff-lane.js), so
   FF.Level's queries see them move. Nothing caches them.
   THE REFERENCE: pressY(), pressState() and sluiceGap() below must equal those in docs/farfield/checks/works-sim.mjs;
   public/farfield/tools/check-works.mjs re-runs the design check on THIS module (node).
   PRESENTATION HOOKS (frame): World props 'P1', 'Q1', 'Q2', 'Q3', 'sluice', 'counterweight' are moved by their OFFSET from
   the rest position the World built them at (the data's y0: up / shut): a press by (underside - upY), the sluice by +gap,
   the counterweight by (upY - P1 underside) (it rises as the press falls). FF.Works.press(id) / sluice() give the World what
   it needs for lamps and water (state, phase, y, k).
   FACTS (bus; listeners decide what to do: Audio, Camera, Player, World):
     works-start {id: 'works-first'} (Level's trigger: the clocks start here; the S1 far thud hands over to the machines);
                 {cause: 'test'} from start() / setPhase() in tests. A reset starts the clocks silently.
     press  {id, phase: release|descent|contact|down|rise|up, x0, x1, x (centre), d (rabbit to footprint, m), great}
            'contact' is THE THUD (then 'down' on the same step); d <= FF.RULES.works.press.shake.within: shake + flinch
     sluice {phase: lift|open|close|shut, gap}
     works:shove {id, from, to, dur, kind: edge|ramp|gate} a shove started: the chamfer, the ramp slide, the gate (Player: the startle)
     fail   {kind: 'machine', by, x}                       the cut (Events: the failure flow; Audio: the muffled thud)
   Debug: FF.Works.debug() (window.__ff.works): {started, P1 {phase, y, state}, line {phase, Q1.., Q3}, sluice {gap, state},
     cut, shove, danger}. Test hooks: setPhase('P1'|'line', t), start(), stop().
   Loadable in node (no THREE, no DOM at load). OWNER: the Sequence 2 mechanism builder. */
'use strict';
window.FF = window.FF || {};
(function () {
const mod = (a, n) => ((a % n) + n) % n;
const RW = () => FF.RULES.works, PR = () => FF.RULES.works.press, SLR = () => FF.RULES.works.sluice;
const emit = (n, d) => { if (FF.bus) FF.bus.emit(n, d || {}); };
const G = () => FF.G || {};

/* ================================================================== THE GRAMMAR (pure; = works-sim.mjs) */
function pressY(m, marks, phase) {
  const P = PR(), H = m.upY - P.jolt;
  if (phase < marks.descent) return m.upY - P.jolt * Math.min(1, (phase - marks.release) / P.joltTime);
  if (phase < marks.contact) { const u = (phase - marks.descent) / (marks.contact - marks.descent); return H * (1 - u * u); }
  if (phase < marks.rise) return 0;
  if (phase < marks.up) { const v = (phase - marks.rise) / (marks.up - marks.rise); return m.upY * (1 - Math.cos(Math.PI * v)) / 2; }
  return m.upY;
}
function pressState(marks, phase) { return phase < marks.descent ? 'release' : phase < marks.contact ? 'descent' : phase < marks.rise ? 'down' : phase < marks.up ? 'rise' : 'up'; }
function sluiceGap(p1phase) {
  const S = SLR(), P = PR(), M = FF.S2.works.P1.marks;
  if (p1phase < M.descent) return S.jolt * Math.min(1, (p1phase - M.release) / P.joltTime);
  if (p1phase < M.contact) { const u = (p1phase - M.descent) / (M.contact - M.descent); return S.jolt + (S.open - S.jolt) * u * u; }
  if (p1phase < M.rise) return S.open;
  if (p1phase < M.up) { const v = (p1phase - M.rise) / (M.up - M.rise); return S.open * (1 + Math.cos(Math.PI * v)) / 2; }
  return 0;
}
function sluiceState(p1phase) { const M = FF.S2.works.P1.marks; return p1phase < M.descent ? 'lift' : p1phase < M.contact ? 'lift' : p1phase < M.rise ? 'open' : p1phase < M.up ? 'close' : 'shut'; }
const passableY = (state, y) => state === 'up' || (state === 'rise' && y >= PR().passClear);

/* ================================================================== the machines (from FF.S2.works) */
let M = null, MI = {}, SLU = null;
function build() {
  const WK = FF.S2.works, solid = id => (FF.S2.solids || []).find(s => s.id === id) || null;
  M = [Object.assign({}, WK.P1, { offset: 0, clock: 'P1', marks: WK.P1.marks, period: WK.P1.period })]
    .concat(WK.line.platens.map(q => Object.assign({}, q, { clock: 'line', marks: WK.line.marks, period: WK.line.period })));
  MI = {}; for (const m of M) { m.solidRef = solid(m.solid); m.great = m.id === 'Q3'; m.pits = (FF.S2.shelters || []).filter(s => s.kind === 'pit' && s.under === m.id); m.wallRight = !!m.rightWall; MI[m.id] = m; }
  SLU = Object.assign({}, WK.sluice, { solidRef: solid(WK.sluice.solid) });
}
const C = { P1: { on: false, base: 0, t: 0 }, line: { on: false, base: 0, t: 0 } };
const periodOf = k => k === 'P1' ? FF.S2.works.P1.period : FF.S2.works.line.period;
function clockPhase(k) { const c = C[k]; return c.on ? mod(c.base + c.t, periodOf(k)) : null; }
/* a machine's phase in its own cycle (null = the clocks have not started: hanging up and still) */
function phaseOf(m) { const p = clockPhase(m.clock); return p == null ? null : mod(p - (m.offset || 0), m.period); }
function stateOf(m) { const p = phaseOf(m); return p == null ? { phase: null, y: m.upY, state: 'up', idle: true } : { phase: p, y: pressY(m, m.marks, p), state: pressState(m.marks, p) }; }

const st = { cut: null, shove: null, prev: {}, started: false, lastRestart: null, contactN: 0 };

/* move the dynamic solids to this step's positions */
function place() {
  for (const m of M) { const s = stateOf(m), b = m.solidRef; m.cur = s; if (b) { b.y0 = s.y; b.y1 = s.y + m.thick; } }
  const p1 = phaseOf(MI.P1), g = p1 == null ? 0 : sluiceGap(p1), b = SLU.solidRef;
  SLU.cur = { gap: g, state: p1 == null ? 'shut' : sluiceState(p1), phase: p1 };
  if (b) { b.y0 = Math.min(SLU.top, SLU.floorY + g); b.y1 = SLU.top; }
}
/* emit the facts for state changes (silent on a reset: prev is synced) */
function facts(silent) {
  const r = G().rabbit;
  for (const m of M) {
    const s = m.cur.state, was = st.prev[m.id];
    if (silent || was === s) { st.prev[m.id] = s; continue; }
    st.prev[m.id] = s;
    const d = r ? Math.max(0, m.x0 - r.x, r.x - m.x1) : 99, base = { id: m.id, x0: m.x0, x1: m.x1, x: (m.x0 + m.x1) / 2, d: +d.toFixed(2), great: m.great };
    if (s === 'down') { st.contactN++; emit('press', Object.assign({ phase: 'contact', n: st.contactN }, base)); emit('press', Object.assign({ phase: 'down' }, base)); }
    else emit('press', Object.assign({ phase: s }, base));
  }
  const ss = SLU.cur.state, sw = st.prev.sluice;
  if (silent || sw === ss) st.prev.sluice = ss;
  else { st.prev.sluice = ss; emit('sluice', { phase: ss, gap: +SLU.cur.gap.toFixed(3), x: (SLU.x0 + SLU.x1) / 2 }); }
}

/* ================================================================== the cut and the shove */
/* the rabbit's back height as DRAWN: the Player's eased crouch (head-and-shoulders and hips; both must be down for the low
   height), so the last frame before the cut never shows the iron inside a rabbit that had no time to flatten (the low pose
   the Player takes by itself under a descending press is too slow to count). Without those fields: crouch / low. */
function rabbitH(r) {
  const P = PR();
  if (r.crouchF != null && r.crouchR != null) { const k = Math.max(0, Math.min(1, Math.min(r.crouchF, r.crouchR))); return P.hStand + (P.hLow - P.hStand) * k; }
  return (r.crouch || r.low) ? P.hLow : P.hStand;
}
function inPitCore(m, x) { for (const p of m.pits) if (x >= p.core[0] - 1e-9 && x <= p.core[1] + 1e-9) return p; return null; }
/* the slot's visible notch outside its core: the ramps (and, in slot B, the floor up to the gate), where the ground under the
   centre dips below the bed (FF.RULES.works.press.ramp.notchBelow). Review fixes 8 Oct: the notch the player reads as the
   shelter is twice as wide as the core, so a rabbit standing there slides down into the core instead of being cut. */
function inNotch(m, x) {
  const RP = PR().ramp; if (!RP || !FF.Level) return null;
  for (const p of m.pits) if (x >= p.x0 && x <= p.x1 && !(x >= p.core[0] - 1e-9 && x <= p.core[1] + 1e-9) && FF.Level.groundY(x) < RP.notchBelow) return p;
  return null;
}
function blockedAt(x, r, ignore) {
  const L = FF.Level, hw = FF.RULES.rabbit.hw, h = rabbitH(r);
  if (!L || !L.solidsIn) return false;
  for (const s of L.solidsIn(x - hw, x + hw, r.y + 0.002, r.y + h)) if (s !== ignore && s.kind !== 'press' && s.kind !== 'sluice') return true;
  return Math.abs(L.groundY(x) - r.y) > FF.RULES.rabbit.stepUp + 0.02 && L.groundY(x) > r.y;
}
function cut(by, r) {
  if (st.cut) return;
  st.cut = { by, x: +r.x.toFixed(3), y: +r.y.toFixed(3), t: +(G().t || 0).toFixed(3), phase: by === 'sluice' ? +(phaseOf(MI.P1) || 0).toFixed(3) : +(phaseOf(MI[by]) || 0).toFixed(3) };
  st.shove = null;
  emit('fail', { kind: 'machine', by, x: +r.x.toFixed(2) });
}
function startShove(id, r, to, dur, kind) {
  dur = dur || PR().shove.time; kind = kind || 'edge';
  st.shove = { id, from: r.x, to, t: 0, dur, kind };
  if (FF.Player && typeof FF.Player.shove === 'function') { try { FF.Player.shove(to, dur); st.shove.player = true; } catch (e) { FF.report(e, 'Works.shove'); } }
  emit('works:shove', { id, from: +r.x.toFixed(3), to: +to.toFixed(3), dur: +dur.toFixed(3), kind });
}
function shoveStep(dt, r) {
  const s = st.shove; if (!s) return;
  s.t += dt; const k = Math.min(1, s.t / s.dur), e = k * k * (3 - 2 * k);
  if (!s.player) { r.x = s.from + (s.to - s.from) * e; r.vx = 0; }
  if (k >= 1) st.shove = null;
}
function hazards(dt) {
  const g = G(), r = g.rabbit;
  if (!r || st.cut || g.mode !== 'play') return;
  if (r.mode && r.mode !== 'play') return;
  shoveStep(dt, r);
  const P = PR(), hw = FF.RULES.rabbit.hw, h = rabbitH(r);
  for (const m of M) {
    const c = m.cur; if (c.state !== 'descent') continue;
    const overlap = r.x + hw > m.x0 && r.x - hw < m.x1; if (!overlap) continue;
    const centreIn = r.x > m.x0 + P.centreInset && r.x < m.x1 - P.centreInset;
    if (centreIn) {
      /* a pit core: the platen stops at y 0, over its back. Review fixes 8 Oct: airborne too (a startled hop in the slot); the
         Player holds a rabbit in the air under the descending platen (it is a ceiling there) */
      if (inPitCore(m, r.x)) continue;
      /* the slot's ramps (the rest of the visible notch): sliding down into the core (involuntary, like the chamfer shove) */
      if (st.shove && st.shove.kind === 'ramp' && st.shove.id === m.id) continue;
      const notch = inNotch(m, r.x);
      if (notch && r.y + h + P.lethalMargin > 0) {
        const RP = P.ramp, tc = m.marks.contact - c.phase;
        if (tc <= RP.lead + 1e-9 || c.y < r.y + h + P.lethalMargin + RP.margin) {
          const to = r.x < notch.core[0] ? notch.core[0] + RP.inset : notch.core[1] - RP.inset;
          startShove(m.id, r, to, Math.max(RP.minTime, Math.min(RP.maxTime, Math.abs(to - r.x) / RP.speed)), 'ramp');
          continue;
        }
      }
      if (c.y < r.y + h + P.lethalMargin) { cut(m.id, r); return; }
    } else if (!st.shove) {
      const tc = m.marks.contact - c.phase;
      if (tc <= P.shove.time + 1e-9 || c.y < r.y + h + P.lethalMargin) {
        const left = r.x < (m.x0 + m.x1) / 2, to = left ? m.x0 - hw - P.shove.clear : m.x1 + hw + P.shove.clear;
        if (blockedAt(to, r, m.solidRef)) { if (c.y < r.y + h + P.lethalMargin) { cut(m.id, r); return; } }
        else startShove(m.id, r, to);
      }
    }
  }
  /* the sluice, closing over P1's rise. Review fixes 8 Oct: it never cuts. The press is rising (the grammar's "never dangerous"),
     and the gate's closing is a small motion the player can hardly see, so as its lower edge comes down to the rabbit's back the
     gate's own weight on its counterweight cable stops being enough and the rabbit is carried clear, to the side its centre is
     on (slot B or the sill), with the startle: the chamfer shove's path. Only if both sides were blocked would it cut (they
     never are). */
  const s = SLU.cur; if (s.state === 'close' && !st.shove) {
    const xc = (SLU.x0 + SLU.x1) / 2;
    const near = r.y < SLU.top - 0.05 && r.y > SLU.floorY - 0.2;           // at the gate's level (not on the bed above, not in the culvert below)
    if (near && r.x + hw > SLU.x0 && r.x - hw < SLU.x1 && SLU.floorY + s.gap < r.y + h + P.lethalMargin) {
      const left = r.x < xc, a = SLU.x0 - hw - P.shove.clear, b = SLU.x1 + hw + P.shove.clear;
      const to = left ? a : b, alt = left ? b : a;
      if (!blockedAt(to, r, SLU.solidRef)) startShove('sluice', r, to, null, 'gate');
      else if (!blockedAt(alt, r, SLU.solidRef)) startShove('sluice', r, alt, null, 'gate');
      else { cut('sluice', r); return; }
    }
  }
}

/* ================================================================== clocks */
function startClocks(p1, line, cause) {
  C.P1.on = true; C.P1.base = mod(p1 || 0, periodOf('P1')); C.P1.t = 0;
  C.line.on = true; C.line.base = mod(line == null ? (p1 || 0) : line, periodOf('line')); C.line.t = 0;
  st.started = true;
  place();
  /* the trigger's own bus event is the fact (Level emits 'works-start' {id: 'works-first'}); a test start announces itself */
  if (cause === 'test') emit('works-start', { cause, P1: C.P1.base, line: C.line.base });
  facts(cause === 'reset');
}
function stopClocks() { C.P1.on = false; C.line.on = false; C.P1.t = C.line.t = 0; st.started = false; }

const Works = FF.Works = {
  stub: false,
  /* the reference functions (the checker port and the World use these) */
  pressY, pressState, sluiceGap, sluiceState,
  get machines() { if (!M) build(); return M; },
  machine(id) { if (!M) build(); return MI[id] || null; },
  init() {
    build(); stopClocks(); place(); facts(true);
    if (FF.bus) FF.bus.on('works-start', d => { if (d && d.cause) return; if (!st.started) startClocks(0, 0, 'trigger'); });
    /* the debug handle: __ff.works (main owns __ff; this only adds getters) */
    try { if (typeof window !== 'undefined' && window.__ff && !Object.getOwnPropertyDescriptor(window.__ff, 'works')) Object.defineProperty(window.__ff, 'works', { get: () => Works.debug(), configurable: true }); } catch (_) {}
  },
  /* put the machines at checkpoint cp: cp.works {P1} | {line}; past the trigger without one: started at 0; else stopped */
  reset(cp) {
    if (!M) build();
    st.cut = null; st.shove = null; st.lastRestart = cp ? cp.id : null;
    const w = cp && cp.works, tr = (FF.S2.triggers || []).find(t => t.id === 'works-first'), past = cp && tr && cp.x > tr.x0 - 0.01;
    if (w && (w.P1 != null || w.line != null)) startClocks(w.P1 != null ? w.P1 : w.line, w.line != null ? w.line : w.P1, 'reset');
    else if (past) startClocks(0, 0, 'reset');
    else { stopClocks(); place(); facts(true); }
  },
  /* FIRST in the fixed step: advance, move the solids, emit the facts, then the cut and the shove */
  step(dt) {
    if (!M) build();
    if (C.P1.on) C.P1.t += dt; if (C.line.on) C.line.t += dt;
    place(); facts(false); hazards(dt);
  },
  /* presentation: move the World's props by their offset from rest (never resized, never re-created) */
  frame() {
    if (!M || !FF.World || !FF.World.prop) return;
    for (const m of M) moveProp(m.id, m.cur.y - m.upY);
    moveProp('sluice', SLU.cur.gap);
    moveProp('counterweight', MI.P1.upY - MI.P1.cur.y);
  },
  /* ---- queries */
  /* a press's live state for the World and tests: {id, phase, y, state, k (0 up .. 1 down), passable, idle} */
  press(id) { if (!M) build(); const m = MI[id]; if (!m) return null; const c = m.cur || stateOf(m); return { id, phase: c.phase, y: c.y, state: c.state, k: 1 - c.y / m.upY, passable: passableY(c.state, c.y), idle: !!c.idle, x0: m.x0, x1: m.x1, upY: m.upY }; },
  sluice() { if (!M) build(); const s = SLU.cur || { gap: 0, state: 'shut' }; return { gap: s.gap, state: s.state, passable: s.gap >= SLR().passClear, x0: SLU.x0, x1: SLU.x1, floorY: SLU.floorY }; },
  /* the shelter whose core holds x (pits, gaps, safe floors; FF.S2.shelters) */
  shelterAt(x) { for (const s of FF.S2.shelters || []) if (s.core && x >= s.core[0] - 1e-9 && x <= s.core[1] + 1e-9) return s; return null; },
  /* the press whose footprint holds the rabbit's centre (inset), or null */
  over(x) { if (!M) build(); for (const m of M) if (x > m.x0 + PR().centreInset && x < m.x1 - PR().centreInset) return m.id; return null; },
  /* true while the rabbit is under a press that is releasing or descending and not in a pit core (main may hold the tier step-down) */
  danger() {
    const r = G().rabbit; if (!r || !M || !st.started) return false;
    for (const m of M) { const c = m.cur; if ((c.state === 'release' || c.state === 'descent') && r.x + FF.RULES.rabbit.hw > m.x0 && r.x - FF.RULES.rabbit.hw < m.x1 && !inPitCore(m, r.x)) return true; }
    return false;
  },
  get started() { return st.started; },
  /* the cut has happened (until the restart): {by, x, y, t, phase} or null */
  get cutting() { return st.cut; },
  clock(k) { return clockPhase(k); },
  /* ---- test hooks */
  setPhase(k, t) { if (!M) build(); if (!st.started) startClocks(0, 0, 'test'); C[k].base = mod(t, periodOf(k)); C[k].t = 0; place(); facts(true); },
  start(p1, line) { startClocks(p1 || 0, line == null ? p1 || 0 : line, 'test'); },
  stop() { stopClocks(); place(); facts(true); },
  debug() {
    if (!M) build();
    const f = v => v == null ? null : +v.toFixed(3), one = id => { const c = MI[id].cur || stateOf(MI[id]); return { phase: f(c.phase), y: f(c.y), state: c.state }; };
    return { started: st.started, P1: one('P1'), line: { phase: f(clockPhase('line')), Q1: one('Q1'), Q2: one('Q2'), Q3: one('Q3') },
      sluice: { gap: f(SLU.cur ? SLU.cur.gap : 0), state: SLU.cur ? SLU.cur.state : 'shut' }, cut: st.cut, shove: st.shove ? { id: st.shove.id, to: f(st.shove.to), t: f(st.shove.t) } : null,
      danger: Works.danger(), contacts: st.contactN, restart: st.lastRestart };
  },
  dispose() {},
};
function moveProp(id, off) {
  const p = FF.World.prop(id); if (!p || !p.position) return; const ud = p.userData || (p.userData = {});
  if (ud.worksBaseY == null) ud.worksBaseY = p.position.y;
  p.position.y = ud.worksBaseY + off;
}
})();
