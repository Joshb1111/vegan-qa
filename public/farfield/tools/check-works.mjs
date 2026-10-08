// Far Field, Sequence 2: THE WORKS CHECKER (node, no browser). Must pass before any change to the Works' timings, geometry,
// shelters, checkpoints or the worker's routine ships (SEQUENCE-2.md §12, §18 C).
// A port of docs/farfield/checks/works-sim.mjs that keeps NO copy of the rules, the geometry or the machine: it loads the game's
// own data and code in node (ff-core, ff-rules, ff-rules-s2, ff-level-s1, ff-script-s1, ff-level-s2, ff-script-s2, ff-lane,
// ff-level, ff-ai, ff-works, ff-painter) and uses
//   - FF.Works.pressY / pressState / sluiceGap   the press grammar and the gate exactly as the game runs them,
//   - FF.Works itself (step, reset, the cut, the shove) on a stub rabbit, for the measured cut and the module's clocks,
//   - FF.Level                                   the merged lane's ground (one lane, FF.Lane),
//   - FF.AI.see                                  the ONE detection model (A6), with the worker's pose and his lamp's area,
//   - FF.Painter itself (step) on a stub rabbit  for the worker's look,
//   - FF.RULES / FF.S2                           every number (the rabbit's moves, the fairness targets, the routines).
// So the game and the checker cannot drift. It reproduces the design check's verdicts (works-sim.txt): the grammar, fairness
// under every press, first sight, the routes through the first press and the long hall, the checkpoints, the worker.
// Run (from anywhere):  node public/farfield/tools/check-works.mjs        exit code 0 = PASS, 1 = FAIL
// Options (env): REACT=0.6 (reaction s), OUT=<file> (writes the log), JS=<dir> (the game's js/)
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const HERE = path.dirname(new URL(import.meta.url).pathname), JS = process.env.JS || path.resolve(HERE, '../js');
globalThis.window = globalThis;
for (const f of ['ff-core.js', 'ff-rules.js', 'ff-rules-s2.js', 'ff-level-s1.js', 'ff-script-s1.js', 'ff-level-s2.js', 'ff-script-s2.js', 'ff-lane.js', 'ff-level.js', 'ff-ai.js', 'ff-works.js', 'ff-painter.js'])
  vm.runInThisContext(fs.readFileSync(path.join(JS, f), 'utf8'), { filename: f });
const FF = globalThis.FF, RU = FF.RULES, RB = RU.rabbit, W = RU.works, PR = W.press, SL = W.sluice, FAIR = W.fairness, S2 = FF.S2, WK = S2.works, WORKS = FF.Works, L = FF.Level;
FF.G = { mode: 'play', t: 0, control: true, flags: {}, rabbit: null, place: 'rest' };
L.init(); WORKS.init(); FF.Painter.init(null);
const DT = 1 / 120, HW = RB.hw, REACT = +(process.env.REACT || FAIR.reaction);
const lines = []; const log = (...a) => { const s = a.join(' '); lines.push(s); console.log(s); };
let fails = 0; const check = (ok, what) => { log((ok ? 'PASS ' : 'FAIL ') + what); if (!ok) fails++; return ok; };
const f2 = v => (v === Infinity ? 'inf' : v === -Infinity ? '-inf' : (+v).toFixed(2));

/* ------------------------------------------------------------------ the press grammar: the GAME's (FF.Works) */
const pressY = (m, marks, phase) => WORKS.pressY(m, marks, phase), pressState = (marks, phase) => WORKS.pressState(marks, phase), sluiceGap = p => WORKS.sluiceGap(p);
const mod = (a, n) => ((a % n) + n) % n;
/* the machines as one list: { id, x0, x1, upY, marks, period, offset, wallRight } with phase(tLine/tP1) */
const P1 = Object.assign({}, WK.P1, { offset: 0 }), LINE = WK.line;
const QS = LINE.platens.map(q => Object.assign({}, q, { marks: LINE.marks, period: LINE.period }));
const lethalH = (low) => (low ? PR.hLow : PR.hStand) + PR.lethalMargin;
function firstTime(fn, t0, t1, step) { for (let t = t0; t <= t1 + 1e-9; t += step || 0.0005) if (fn(t)) return t; return Infinity; }
/* lethal moment (phase) after the release for a rabbit whose floor is y (bed: 0) */
const lethalPhase = (m, y, low) => firstTime(p => pressY(m, m.marks, p) < y + lethalH(low), m.marks.descent, m.marks.contact);
const passPhase = (m) => firstTime(p => pressY(m, m.marks, p) >= PR.passClear, m.marks.rise, m.marks.up);

/* ------------------------------------------------------------------ the lane (FF.S2 only: Sequence 2's ground and solids) */
const groundY = x => L.groundY(x);                    // the merged lane (FF.Lane): Sequence 2's ground from x 126.0
const bedEnd = S2.solids.find(s => s.id === 'bed-end');
/* the floor under the body on the bed route (on top of the bed-end when coming along the bed surface) */
function floorAt(x, onTop) { let f = Math.max(groundY(x - HW), groundY(x), groundY(x + HW)); if (onTop && x + HW > bedEnd.x0 && x - HW < bedEnd.x1) f = Math.max(f, bedEnd.y1); return f; }
const sh = id => S2.shelters.find(s => s.id === id);
/* shelter cores: re-derive the pit cores from the ground and the shelter rule, and compare with the data */
function derivedPitCore(p) {
  let a = Infinity, b = -Infinity;
  for (let x = p.x0 - 0.5; x <= p.x1 + 0.5; x += 0.001) { if (floorAt(x, false) <= W.shelter.floorMax + 1e-9) { a = Math.min(a, x); b = Math.max(b, x); } }
  return [a, b];
}

/* ------------------------------------------------------------------ the rabbit (1D along the lane) */
const SPEED = { walk: RB.walk, run: RB.run, crouch: RB.crouch, creep: RB.creep.speed };
function stepTo(st, target, gait) {               // accelerate (5) towards gait speed in the direction of target, stop on it
  const dir = Math.sign(target - st.x); const vmax = SPEED[gait] * (st.creepCap ? Math.min(1, RB.creep.speed / SPEED[gait]) : 1);
  if (!dir) { st.v = 0; return true; }
  const want = dir * vmax; const a = Math.sign(want - st.v) * Math.min(Math.abs(want - st.v), (Math.sign(want) === Math.sign(st.v) || !st.v ? RB.accel : RB.decel) * DT);
  st.v += a; let nx = st.x + st.v * DT;
  if ((target - st.x) * (target - nx) <= 0) { st.x = target; st.v = 0; return true; }
  st.x = nx; return false;
}
const inFoot = (m, x) => x >= m.x0 + PR.centreInset && x <= m.x1 - PR.centreInset;

/* ================================================================== 1. THE GRAMMAR */
log('FAR FIELD · Sequence 2 · THE WORKS · checker (check-works.mjs, the game\'s own modules) · reaction ' + REACT + ' s');
log('');
log('== 1. The press grammar (from the RELEASE cue; standing rabbit on the bed, y 0)');
const ALL = [P1, ...QS];
for (const m of ALL) {
  const lp = lethalPhase(m, 0, false) - m.marks.release, lpl = lethalPhase(m, 0, true) - m.marks.release, pp = passPhase(m);
  m.lethal = lp; m.pass = pp;
  log(`  ${m.id.padEnd(3)} ${f2(m.x1 - m.x0)} m  up ${f2(m.upY)} m  period ${m.period}  release->lethal ${lp.toFixed(3)} s (crouched ${lpl.toFixed(3)})  contact ${m.marks.contact}  passable from ${pp.toFixed(2)} (rising)  ` +
      `still (up) ${(m.period - m.marks.up).toFixed(1)} s  window under it ${(m.period + lp - pp).toFixed(2)} s`);
}
check(ALL.every(m => m.lethal >= 3.8), 'every press: >= 3.8 s from the unmistakable RELEASE cue to the cut (target >= 1.0-1.5 s, Sequence 1 A7)');
check(ALL.every(m => mod(m.marks.contact + (m.offset || 0), RU.works.beat) < 1e-9), 'every contact lands on the 4.0 s heartbeat');
{ const open = firstTime(p => sluiceGap(p) >= SL.passClear, WK.P1.marks.descent, WK.P1.marks.contact);
  const shut = firstTime(p => sluiceGap(p) < PR.hLow + PR.lethalMargin, WK.P1.marks.rise, WK.P1.marks.up);
  log(`  sluice: passable (gap >= ${SL.passClear}) from P1 phase ${open.toFixed(2)}; lethal band from ${shut.toFixed(2)} (closing); window ${f2(shut - open)} s; full open ${SL.open} m for ${WK.P1.marks.rise - WK.P1.marks.contact} s`);
  WK.sluiceOpen = open; WK.sluiceShut = shut;
  check(shut - open >= 5.0, 'the sluice window >= 5.0 s'); }

/* shelter cores re-derived */
for (const p of S2.shelters.filter(s => s.kind === 'pit')) {
  let [a, b] = derivedPitCore(p); if (p.sluice) b = Math.min(b, S2.solids.find(s => s.id === p.sluice).x0 - HW);
  const ok = p.core[0] >= a - 0.051 && p.core[1] <= b + 0.001;
  check(ok, `${p.id} core [${p.core.join(', ')}] lies inside the rule's core [${f2(a)}, ${f2(b)}] (whole body over floor <= ${W.shelter.floorMax})`);
}

/* ================================================================== 2. FAIRNESS UNDER EVERY PRESS */
log('');
log('== 2. Fairness: at the RELEASE, from every point under every press (step 0.02 m), react ' + REACT + ' s, go to the nearest safety');
function safeTargets(m) {                           // centre positions that are safe from this press: outside the footprint (not lethal), pit cores
  const t = [{ x: m.x0 + PR.centreInset - 0.001, kind: 'left end' }];
  if (!m.rightWall) t.push({ x: m.x1 - PR.centreInset + 0.001, kind: 'right end' });
  for (const p of S2.shelters.filter(s => s.kind === 'pit' && s.under === m.id)) t.push({ a: p.core[0], b: p.core[1], kind: p.id });
  return t;
}
function escape(m, x0, gait) {
  const tL = m.lethal;                          // seconds from the release cue; worst case: the bed (y 0)
  let best = null;
  for (const tg of safeTargets(m)) {
    const goal = tg.a != null ? (x0 < tg.a ? tg.a : x0 > tg.b ? tg.b : x0) : tg.x;
    if (tg.a == null && ((tg.kind === 'left end' && x0 <= goal) || (tg.kind === 'right end' && x0 >= goal))) return { t: 0, margin: tL, kind: tg.kind, d: 0 };
    const st = { x: x0, v: 0 }; let t = REACT;
    while (!stepTo(st, goal, gait)) { t += DT; if (t > 20) break; }
    const d = Math.abs(goal - x0);
    if (!best || t < best.t) best = { t, margin: tL - t, kind: tg.kind, d };
  }
  return best;
}
const fair = {};
for (const m of ALL) {
  let worstW = null, worstR = null, maxD = 0;
  for (let x = m.x0 + PR.centreInset; x <= m.x1 - PR.centreInset + 1e-9; x += 0.02) {
    const inPit = S2.shelters.some(p => p.kind === 'pit' && p.under === m.id && x >= p.core[0] && x <= p.core[1]);
    if (inPit) continue;
    const ew = escape(m, x, 'walk'), er = escape(m, x, 'run');
    if (!worstW || ew.margin < worstW.margin) worstW = Object.assign({ x }, ew);
    if (!worstR || er.margin < worstR.margin) worstR = Object.assign({ x }, er);
    maxD = Math.max(maxD, ew.d);
  }
  fair[m.id] = { walk: worstW, run: worstR, maxD };
  log(`  ${m.id.padEnd(3)} worst point x ${worstW.x.toFixed(2)}: nearest safety ${f2(worstW.d)} m (${worstW.kind}); walk margin ${f2(worstW.margin)} s; run margin ${f2(worstR.margin)} s (worst x ${worstR.x.toFixed(2)})`);
  check(worstW.margin >= FAIR.minMarginWalk, `${m.id}: the cautious walk always escapes with >= ${FAIR.minMarginWalk} s`);
  check(worstR.margin >= FAIR.minMarginRun, `${m.id}: a run always escapes with >= ${FAIR.minMarginRun} s`);
  check(maxD <= FAIR.maxDistToSafety + 1e-6, `${m.id}: the nearest safety is never more than ${FAIR.maxDistToSafety} m away (max ${f2(maxD)})`);
}

/* ================================================================== 3. FIRST SIGHT */
log('');
log('== 3. First sight: the first press releases as the rabbit starts the creep (trigger works-first)');
{ const tr = S2.triggers.find(t => t.id === 'works-first'), beam = S2.solids.find(s => s.id === 'fallen-beam');
  const goal = P1.x0 + PR.centreInset; let t = 0; const st = { x: tr.x0, v: SPEED.creep };
  // under the beam the creep caps the speed; out of it, a flat-out run (Shift), accelerating
  while (st.x < goal && t < 30) { const under = st.x + HW > beam.x0 && st.x - HW < beam.x1; st.creepCap = under; stepTo(st, goal, under ? 'creep' : 'run'); t += DT; }
  const tw = (() => { let tt = 0; const s = { x: tr.x0, v: SPEED.creep }; while (s.x < goal && tt < 60) { const under = s.x + HW > beam.x0 && s.x - HW < beam.x1; s.creepCap = under; stepTo(s, goal, under ? 'creep' : 'walk'); tt += DT; } return tt; })();
  log(`  from x ${tr.x0} (P1 phase 0): a flat-out rabbit's centre reaches the footprint (${goal.toFixed(2)}) at ${t.toFixed(2)} s; the first contact is at ${P1.marks.contact.toFixed(2)} s; lethal from ${P1.lethal.toFixed(2)} s; a walker arrives at ${tw.toFixed(2)} s`);
  check(t >= P1.marks.contact + W.firstSight.minLeadOverContact, `the first descent completes before the fastest rabbit can enter (lead ${f2(t - P1.marks.contact)} s >= ${W.firstSight.minLeadOverContact})`);
  WK.firstEnterRun = t; WK.firstEnterWalk = tw; }

/* ================================================================== 4a. ROUTES: THE FIRST PRESS AND THE SLUICE */
log('');
log('== 4a. Routes through the first press and the sluice, from every arrival phase (step 0.5 s), at the walk');
/* A bot that plays like a first-timer who has watched the press from the apron. It holds in safe places and leaves when the
   press is passable (rising past 0.30 m, or up) after its reaction (+ an optional delay: a hesitant player). Under the press
   at a RELEASE it reacts and goes to the nearest safety (the apron, pit A, pit B). Policies:
     'pits'   pit to pit: to pit A, wait there for the press to come down and rise again, then to pit B;
     'direct' straight to pit B;
     'wall'   hops up out of pit B onto the bed's end and waits against the dividing wall (a dead end, the worst place to be)
              and only moves when the release comes (back down into pit B: walking off a 0.40 m edge, no jump).
   In pit B it goes through the sluice once the gap is passable (+reaction). Through = past the drop into the culvert. */
const isPass = (state, y) => state === 'up' || (state === 'rise' && y >= PR.passClear);
function runP1(ph0, policy, delay, gait) {
  gait = gait || 'walk'; delay = delay || 0;
  const sluice = S2.solids.find(s => s.id === 'sluice'), pitA = sh('pit-A'), pitB = sh('pit-B');
  const apronEnd = P1.x0 + PR.centreInset - 0.03, wallEnd = P1.x1 - HW - 0.01, mid = p => (p.core[0] + p.core[1]) / 2;
  const inCore = (p, x) => x >= p.core[0] && x <= p.core[1];
  const st = { x: 139.4, v: 0 }; let t = 0, mode = 'hold', where = 'apron', hold = st.x, ready = -1, react = -1, sawDown = false, target = st.x, seq = [], margin = Infinity; let usedDelay = false;
  for (let i = 0; i < 120 * 160; i++) {
    const ph = mod(ph0 + t, P1.period), y = pressY(P1, P1.marks, ph), state = pressState(P1.marks, ph), g = sluiceGap(ph);
    const sheltered = inCore(pitA, st.x) || inCore(pitB, st.x) || st.x < P1.x0 + PR.centreInset;
    if (state === 'descent' && !sheltered && (st.x < sluice.x0 || onTop) && y < floorAt(st.x, true) + lethalH(false)) return { ok: false, t, x: st.x, why: 'cut under P1', seq };
    const onTop = policy === 'wall' && (mode === 'go' || where === 'wall' || (mode === 'flee' && st.x > pitB.core[1]));
    if (!onTop && state === 'rise' && Math.abs(st.x - (sluice.x0 + sluice.x1) / 2) <= (sluice.x1 - sluice.x0) / 2 + SL.lethalBand && g < PR.hLow + PR.lethalMargin) return { ok: false, t, x: st.x, why: 'cut in the sluice', seq };
    if (st.x >= 146.2 + HW) return { ok: true, t, seq, margin };
    const danger = (state === 'release' || state === 'descent') && !sheltered;
    if (danger && mode !== 'flee') { if (react < 0) react = t + REACT;
      if (t >= react) { const opts = [{ x: apronEnd, k: 'apron' }, { x: st.x < pitA.core[0] ? pitA.core[0] + 0.05 : pitA.core[1] - 0.05, k: 'pit-A' }, { x: st.x < pitB.core[0] ? pitB.core[0] + 0.05 : pitB.core[1] - 0.05, k: 'pit-B' }]
          .sort((a, b) => Math.abs(a.x - st.x) - Math.abs(b.x - st.x)); target = opts[0].x; mode = 'flee'; seq.push(`release at x ${st.x.toFixed(2)} -> ${opts[0].k}`); } }
    if (mode === 'flee' && Math.abs(st.x - target) < 0.005) { mode = 'hold'; hold = st.x; where = inCore(pitA, st.x) ? 'pitA' : inCore(pitB, st.x) ? 'pitB' : 'apron'; react = -1; sawDown = false; ready = -1;
      if (state === 'release' || state === 'descent') { const m = P1.lethal - (ph - P1.marks.release); if (m < margin) { margin = m; seq.push(`safe with ${m.toFixed(2)} s to spare`); } } }
    if (mode === 'hold') {
      target = hold;
      if (!isPass(state, y)) sawDown = true;
      if (where === 'pitB') { if (g >= SL.passClear && state !== 'rise') { if (ready < 0) ready = t + REACT; if (t >= ready) { mode = 'go'; target = 146.2 + HW + 0.05; seq.push(`sluice @${t.toFixed(1)}`); } } else ready = -1; }
      else if (where === 'wall') { /* waits for the release (handled by danger) */ }
      else { const fresh = where === 'apron' ? true : (policy === 'pits' ? sawDown : true), pass = isPass(state, y);
        if (pass && fresh && ready < 0) { ready = t + REACT + (where === 'apron' && !usedDelay ? delay : 0); usedDelay = true; }
        if (ready >= 0 && t >= ready) { if (pass) { mode = 'go'; target = where === 'apron' ? (policy === 'pits' ? mid(pitA) : policy === 'direct' ? mid(pitB) : wallEnd) : mid(pitB); } ready = -1; } }
    }
    if (mode === 'go' && Math.abs(st.x - target) < 0.005) { mode = 'hold'; hold = st.x; ready = -1; sawDown = false;
      where = inCore(pitA, st.x) ? 'pitA' : inCore(pitB, st.x) ? 'pitB' : st.x > pitB.core[1] ? 'wall' : 'apron'; seq.push(`${where} @${t.toFixed(1)}`); }
    let tgt = target; if (!onTop && tgt > sluice.x0 - HW && st.x < sluice.x0 && g < RU.works.sluice.passClear - 0.02) tgt = Math.min(tgt, sluice.x0 - HW - 0.005);
    stepTo(st, tgt, gait); t += DT;
  }
  return { ok: false, t, x: st.x, why: 'timeout', seq };
}
{ let all = 0, ok = 0, worst = 0, best = Infinity, sum = 0, n = 0, failsList = [], minM = Infinity;
  let worstRun = null;
  for (const policy of ['pits', 'direct', 'wall']) for (const delay of [0, 2, 4, 6, 8, 10]) for (let ph = 0; ph < 24; ph += 0.5) {
    const r = runP1(ph, policy, delay); all++; if (r.ok) { ok++; worst = Math.max(worst, r.t); best = Math.min(best, r.t); sum += r.t; n++; if (r.margin < minM) { minM = r.margin; worstRun = `${policy} delay ${delay} ph ${ph}: ${r.seq.join('; ')}`; } } else failsList.push(`${policy} delay ${delay} ph ${ph}: ${r.why} at x ${f2(r.x)} [${r.seq.join('; ')}]`);
  }
  if (worstRun) log('  closest call: ' + worstRun);
  log(`  ${ok}/${all} runs get through the sluice alive (pit to pit, straight to pit B, on to the wall; leaving 0-10 s after it is passable)`);
  log(`  time from the apron to the culvert ${f2(best)}-${f2(worst)} s, mean ${f2(sum / Math.max(1, n))} s; least time to spare when a release caught a walker ${f2(minM)} s`);
  for (const f of failsList.slice(0, 8)) log('    ' + f);
  check(ok === all, 'the first press and the sluice: every walking route survives (no precise timing needed)'); }

/* ================================================================== 4b. ROUTES: THE LONG HALL */
log('');
log('== 4b. Routes through the long hall, from every arrival phase of the bar (step 0.25 s)');
/* The line bot arrives on the entry floor (x 168.9) at line phase ph0 and holds in safe places (the entry floor, G1, G2, pit C).
   It goes on when the press ahead (or above, in pit C) is passable, after its reaction (+ delay at the entry). Walking on, it
   stops at a gap if the press ahead is not passable. Under a press at its RELEASE it reacts and goes to the nearest safety
   (back, on, or the pit). 'cautious' always waits in each gap for a fresh rise of the press ahead. */
const LS = ['line-entry', 'G1', 'G2', 'pit-C'].map(sh);
function lineState(q, ph) { const p = mod(ph - q.offset, LINE.period); return { p, y: pressY(q, LINE.marks, p), s: pressState(LINE.marks, p) }; }
function runLine(ph0, policy) {
  const gait = policy.gait || 'walk', fleeGait = policy.fleeGait || gait, delay = policy.delay || 0;
  const pitC = sh('pit-C'), inPitC = x => x >= pitC.core[0] && x <= pitC.core[1], exitX = QS[2].x1 + HW + 0.02;
  const st = { x: 168.9, v: 0 }; let t = 0, mode = 'hold', where = 'line-entry', hold = st.x, ready = -1, react = -1, sawDown = false, target = st.x, seq = [], margin = Infinity; const waited = new Set(['Q1']); let usedDelay = false;
  for (let i = 0; i < 120 * 120; i++) {
    const ph = mod(ph0 + t, LINE.period);
    for (const q of QS) { const L = lineState(q, ph); if (L.s === 'descent' && inFoot(q, st.x) && !(q.id === 'Q3' && inPitC(st.x)) && L.y < floorAt(st.x, false) + lethalH(false)) return { ok: false, t, x: st.x, why: 'cut under ' + q.id, seq }; }
    if (st.x >= exitX) return { ok: true, t, seq, margin };
    const under = QS.find(q => inFoot(q, st.x)), uL = under ? lineState(under, ph) : null;
    const danger = under && (uL.s === 'release' || uL.s === 'descent') && !(under.id === 'Q3' && inPitC(st.x));
    if (danger && mode !== 'flee') { if (react < 0) react = t + REACT;
      if (t >= react) { const o = [{ x: under.x0 + PR.centreInset - 0.03, k: 'back' }, { x: under.x1 - PR.centreInset + 0.03, k: 'on' }];
        if (under.id === 'Q3') o.push({ x: st.x < pitC.core[0] ? pitC.core[0] + 0.05 : st.x > pitC.core[1] ? pitC.core[1] - 0.05 : st.x, k: 'pit-C' });
        o.sort((a, b) => Math.abs(a.x - st.x) - Math.abs(b.x - st.x)); target = o[0].x; mode = 'flee';
        seq.push(`release of ${under.id} at x ${st.x.toFixed(2)} -> ${o[0].k} ${f2(Math.abs(o[0].x - st.x))} m`); } }
    if (mode === 'flee' && Math.abs(st.x - target) < 0.005) { mode = 'hold'; hold = st.x; react = -1; ready = -1; sawDown = true;
      if (uL && (uL.s === 'release' || uL.s === 'descent')) margin = Math.min(margin, under.lethal - (uL.p - LINE.marks.release)); where = inPitC(st.x) ? 'pit-C' : 'gap'; }
    if (mode === 'hold') {
      target = hold;
      const nxt = inPitC(st.x) ? QS[2] : QS.find(q => q.x0 > st.x);
      if (!nxt) { mode = 'go'; target = exitX + 0.1; }
      else { const L = lineState(nxt, ph), pass = isPass(L.s, L.y); if (!pass) sawDown = true;
        const fresh = !policy.cautious || where === 'line-entry' || sawDown;
        /* ready: the reaction after it becomes passable (+ the hesitation, once, at the entry); if it is no longer passable
           by then, wait for the next time it is */
        if (pass && fresh && ready < 0) { ready = t + REACT + (where === 'line-entry' && !usedDelay ? delay : 0); usedDelay = true; }
        if (ready >= 0 && t >= ready) { if (pass) { mode = 'go'; target = exitX + 0.1; } ready = -1; } }
    }
    if (mode === 'go') {
      const nxt = QS.find(q => q.x0 > st.x + 1e-6);
      if (!under && nxt && st.x >= nxt.x0 - HW - 0.06 && !waited.has(nxt.id)) { const L = lineState(nxt, ph);
        if (!isPass(L.s, L.y) || (policy.cautious && nxt.id !== 'Q1')) { mode = 'hold'; waited.add(nxt.id); hold = Math.min(st.x, nxt.x0 - HW - 0.02); ready = -1; sawDown = !isPass(L.s, L.y); where = 'gap'; seq.push(`waits in ${LS.find(s => hold >= s.x0 - 0.2 && hold <= s.x1 + 0.2)?.id || 'x' + hold.toFixed(1)} @${t.toFixed(1)}`); } }
    }
    stepTo(st, target, mode === 'flee' ? fleeGait : gait); t += DT;
  }
  return { ok: false, t, x: st.x, why: 'timeout', seq };
}
const policies = [
  { name: 'continuous walker (walks on whenever the press ahead is up)', gait: 'walk' },
  { name: 'walker who runs when a release catches it', gait: 'walk', fleeGait: 'run' },
  { name: 'cautious walker (waits in every gap for a fresh rise)', gait: 'walk', cautious: true },
  { name: 'runner (Shift all the way)', gait: 'run' },
];
for (const pol of policies) {
  let n = 0, ok = 0, tmin = Infinity, tmax = 0, sum = 0, fl = [], pitCUsed = 0, minM = Infinity;
  for (let ph = 0; ph < LINE.period; ph += 0.25) { const r = runLine(ph, pol); n++; if (r.ok) { ok++; tmin = Math.min(tmin, r.t); tmax = Math.max(tmax, r.t); sum += r.t; minM = Math.min(minM, r.margin); if (r.seq.some(s => s.includes('pit-C'))) pitCUsed++; } else fl.push(`ph ${ph}: ${r.why} at x ${f2(r.x)} [${r.seq.join('; ')}]`); }
  log(`  ${pol.name}: ${ok}/${n} survive; entry floor -> out of the great press ${f2(tmin)}-${f2(tmax)} s (mean ${f2(sum / Math.max(1, ok))}); shelters in pit C in ${pitCUsed}; least time to spare at a release ${f2(minM)} s`);
  for (const f of fl.slice(0, 6)) log('    ' + f);
  check(ok === n, `long hall: the ${pol.name} survives from every arrival phase`);
}
/* the designed climax: a walker who leaves on Q1's first passable moment and keeps walking */
{ const r = runLine(mod(QS[0].pass - 0.001, LINE.period), { gait: 'walk' });
  log('  the designed flow (Q1 just passable, leave after the reaction, walk on): ' + (r.ok ? `out after ${f2(r.t)} s` : 'CUT') + ' · ' + r.seq.join(' · '));
  check(r.ok && r.seq.some(s => s.includes('Q3') && s.includes('pit-C')), 'the designed climax: the continuous walker meets the great press\'s release over pit C and shelters there'); }
{ let worst = null, fl = 0, n = 0;
  for (let k = 0; k <= 9; k += 0.25) for (let ph = 0; ph < 16; ph += 1) { n++; const r = runLine(ph, { gait: 'walk', delay: k }); if (!r.ok) { fl++; if (!worst) worst = `delay ${k} ph ${ph}: ${r.why} at ${f2(r.x)}`; } }
  log(`  late leavers (leaving 0-9 s after Q1 is passable, every arrival phase, ${n} runs): ${fl} cut` + (worst ? ' · first: ' + worst : ''));
  check(fl === 0, 'long hall: leaving late never matters to a walker who reacts to the release'); }

/* ================================================================== 5. CHECKPOINTS */
log('');
log('== 5. Checkpoints: restart safe, the danger seen operating, the window 2.5-7 s after the restart');
for (const c of S2.checkpoints.filter(k => k.works)) {
  const shel = S2.shelters.find(s => s.checkpoint === c.id) || S2.shelters.find(s => c.x >= s.x0 && c.x <= s.x1);
  const inCore = shel && c.x >= shel.core[0] && c.x <= shel.core[1];
  let ahead, ph, period, window, contact;
  if (c.works.P1 != null) {
    ph = c.works.P1; period = P1.period;
    if (c.id === 'works-pitB') { window = firstTime(t => { const p = mod(ph + t, period); return sluiceGap(p) >= SL.passClear && pressState(P1.marks, p) !== 'rise'; }, 0, 40, 0.01); }
    else window = firstTime(t => { const p = mod(ph + t, period); const s = pressState(P1.marks, p); return (s === 'rise' && pressY(P1, P1.marks, p) >= PR.passClear) || (s === 'up' && t > 0.01 && pressState(P1.marks, mod(ph + t - 0.02, period)) !== 'up'); }, 0, 40, 0.01);
    contact = firstTime(t => pressState(P1.marks, mod(ph + t, period)) === 'down', 0, 40, 0.01);
  } else {
    ph = c.works.line; period = LINE.period; ahead = c.id === 'works-pitC' ? QS[2] : QS.find(q => q.x0 > c.x);
    window = firstTime(t => { const L = lineState(ahead, mod(ph + t, period)); return L.s === 'rise' && L.y >= PR.passClear; }, 0, 40, 0.01);
    contact = firstTime(t => lineState(ahead, mod(ph + t, period)).s === 'down', 0, 40, 0.01);
  }
  const pic = RU.fail.black + RU.fail.fadeIn;
  log(`  ${c.id.padEnd(14)} x ${c.x} in ${shel ? shel.id : '?'} core: ${inCore}; contact seen ${f2(contact)} s after the restart (picture back at ${f2(pic)}); the way on opens ${f2(window)} s after`);
  check(inCore && window >= 2.5 && window <= 7.0, `${c.id}: restart in a shelter, the window 2.5-7 s after the restart`);
}

/* ================================================================== 6. THE MAINTENANCE WORKER */
log('');
log('== 6. The maintenance worker (Sequence 1\'s detection model A6; he sees only while turned along the lane)');
const PN = S2.painter, SI = RU.sight;
const faceAt = lt => (lt >= PN.sightFacing.from && lt < PN.sightFacing.to) ? PN.sightFacing.face : 0;
function pts(x, crouch, face) { const s = crouch ? RB.samples.crouch : RB.samples.stand; return s.map(([px, py]) => [x + px * face, py]); }
const SPILL = S2.areaLights.find(a => a.id === PN.lamp.spill), AREAS = [{ id: SPILL.id, x0: SPILL.x0, x1: SPILL.x1, on: 'always' }];
function seeP(lt, x, crouch) {   // { w, src, d, r } at loop time lt: FF.AI.see with his pose, as FF.Painter calls it ('touch' = close darkness)
  const f = faceAt(lt); if (!f) return { w: 0 };
  let e = FF.AI.see({ x: PN.x, y: 0, face: f, kneel: false, torchOn: false, pitch: 0, half: 0 }, pts(x, crouch, 1), { floorY: 0, cx: x, areas: AREAS });
  if (e.src === 'touch') e = { w: SI.dark.weight, src: 'dark', d: e.d };
  if (!(e.w > 0)) return { w: 0 };
  return Object.assign(e, { r: e.w / FF.AI.fillTime(e.src, e.d) });
}
/* walk the rabbit past him: start at xs in the dark at loop time lt0, walk right to 165 at gait; suspicion as Sequence 1 §9.2 */
function passBy(xs, lt0, gait, crouch) {
  let s = 0, grace = 0, x = xs, t = 0, maxS = 0, noticedAt = null; const v = SPEED[gait];
  while (x < 165 && t < 40) { const lt = mod(lt0 + t, PN.loopT), r = seeP(lt, x, crouch);
    if (r.w > 0) { s = Math.min(1, s + r.w * DT / (r.r ? r.w / r.r : 1)); grace = SI.fill.grace; } else if (grace > 0) grace -= DT; else s = Math.max(0, s - SI.fill.decay * DT);
    maxS = Math.max(maxS, s); if (s >= SI.fill.notice && noticedAt == null) noticedAt = x;
    const under = x + HW > 155.6 && x - HW < 156.8; x += (under ? Math.min(v, RB.duckUnder.speed) : v) * DT; t += DT; }
  return { maxS, noticedAt };
}
{ const darkEdge = Math.min(S2.areaLights[0].x0, PN.x - SI.dark.front) - HW - 0.05;
  const r = passBy(darkEdge, 0 + REACT, 'walk'); log(`  waiting in the dark (x ${f2(darkEdge)}), leaving ${REACT} s after the scraping starts, at the cautious walk: max suspicion ${f2(r.maxS)} -> ${r.noticedAt == null ? 'never noticed' : 'NOTICED at ' + f2(r.noticedAt)}`);
  check(r.noticedAt == null, 'the worker never notices a rabbit that passes while he scrapes');
  let worstLeave = null; const noticed = [];
  for (let k = 0; k < PN.loopT; k += 0.25) { const q = passBy(darkEdge, k, 'walk'); if (q.noticedAt != null) noticed.push(k); }
  const safeK = []; for (let k = 0; k < PN.loopT; k += 0.25) if (!noticed.includes(k)) safeK.push(k);
  const ranges = (arr) => { const out = []; let a = null, p = null; for (const k of arr) { if (a == null) a = k; else if (k - p > 0.26) { out.push([a, p]); a = k; } p = k; } if (a != null) out.push([a, p]); return out.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)}`).join(', '); };
  log(`  leaving the dark at loop time k (walk): never noticed for k in ${ranges(safeK)}; noticed (the look, no failure) for k in ${ranges(noticed) || 'none'}`);
  const run = passBy(darkEdge, 5.0, 'run'); log(`  running past at k 5.0 (Shift): ${run.noticedAt == null ? 'never noticed' : 'noticed'} (noise never matters)`);
  check(safeK.length >= 20, 'the safe window to pass him at a walk is at least 5 s of his 12 s loop');
  let palletSeen = false; for (let lt = 0; lt < PN.loopT; lt += 0.05) { const q = seeP(lt, 156.2, true); if (q.w > 0) palletSeen = true; }
  check(!palletSeen, 'under the paint pallet (crouched, x 156.2) he never sees the rabbit, at any moment of his loop');
  let s = 0, t = 0, at = null; for (; t < PN.loopT * 2; t += DT) { const q = seeP(mod(t, PN.loopT), 159.6, false); if (q.w > 0) s = Math.min(1, s + q.w * DT / (q.w / q.r)); if (s >= SI.fill.notice) { at = mod(t, PN.loopT); break; } }
  log(`  standing in his light at x 159.6 (careless): NOTICE at loop time ${at == null ? 'never' : f2(at)} (the scraping stopped at 8.00, he turned at 8.50): the look, 2.0 s, then he goes back to the wall; no failure`);
  check(at != null, 'a careless rabbit in his light when he turns IS noticed (so the moment can happen)'); }

/* ================================================================== 7. THE MODULES THEMSELVES (FF.Works, FF.Painter on a stub rabbit) */
log('');
log('== 7. The game modules on a stub rabbit: FF.Works (clocks, solids, the cut, the shove), FF.Painter (the look)');
const G = FF.G, events = []; FF.bus.on('*', (n, d) => events.push([n, G.t, d]));
const stubRabbit = (x, y, o) => Object.assign({ x, y: y || 0, vx: 0, vy: 0, face: 1, grounded: true, crouch: false, low: false, crouchF: 0, crouchR: 0, mode: 'play', visible: true }, o || {});
const cpOf = id => L.checkpoint(id);
{ /* the dynamic solids follow the grammar on every step, through a whole P1 cycle and a whole bar */
  G.rabbit = stubRabbit(100, 0); WORKS.reset(cpOf('works-apron')); WORKS.setPhase('P1', 0); WORKS.setPhase('line', 0);
  const solids = id => FF.S1.solids.find(s => s.id === id);
  let worst = 0, n = 0;
  for (let i = 0; i < 120 * 48; i++) { G.t += DT; WORKS.step(DT); n++;
    for (const m of WORKS.machines) { const ph = m.clock === 'P1' ? WORKS.clock('P1') : ((WORKS.clock('line') - m.offset) % m.period + m.period) % m.period;
      const y = WORKS.pressY(m, m.marks, ph), s = solids(m.solid); worst = Math.max(worst, Math.abs(s.y0 - y), Math.abs(s.y1 - y - m.thick)); }
    const g = WORKS.sluiceGap(WORKS.clock('P1')), sl = solids('sluice'); worst = Math.max(worst, Math.abs(sl.y0 - Math.min(WK.sluice.top, WK.sluice.floorY + g))); }
  check(worst < 1e-9, `the lane's dynamic solids (P1, Q1-Q3, the gate) equal the grammar on all ${n} steps (max error ${worst.toExponential(1)})`);
}
{ /* the cut, measured on the module: a stub rabbit standing / crouched on each bed, from the clank */
  const rows = [];
  for (const m of WORKS.machines) for (const low of [false, true]) {
    const x = m.id === 'P1' ? 143.6 : m.id === 'Q3' ? 183.0 : (m.x0 + m.x1) / 2;
    G.rabbit = stubRabbit(x, 0, low ? { crouch: true, crouchF: 1, crouchR: 1 } : {}); WORKS.reset(cpOf('works-in')); WORKS.setPhase(m.clock, (m.offset || 0) + m.period - 0.25);
    events.length = 0; let rel = null, cut = null;
    for (let i = 0; i < 120 * 6 && cut == null; i++) { G.t += DT; WORKS.step(DT);
      for (const e of events) { if (e[0] === 'press' && e[2].id === m.id && e[2].phase === 'release' && rel == null) rel = e[1]; if (e[0] === 'fail' && cut == null) cut = e[1]; } events.length = 0; }
    const exp = (low ? lethalPhase(m, 0, true) : lethalPhase(m, 0, false)) - m.marks.release, got = cut - rel;
    rows.push(`${m.id}${low ? ' crouched' : ''} ${got.toFixed(3)} (grammar ${exp.toFixed(3)})`);
    check(cut != null && got >= exp - 1e-6 && got <= exp + DT + 1e-6, `FF.Works cuts ${m.id}${low ? ' (crouched)' : ''} on the step: ${got.toFixed(3)} s after the clank (the grammar's ${exp.toFixed(3)} s, within one step)`);
  }
  log('  measured cuts: ' + rows.join(' · '));
}
{ /* the shove on the module: a body over each outer edge, centre outside -> pushed clear, no cut; centre 0.03 inside -> the cut */
  for (const [id, side] of [['P1', -1], ['Q1', -1], ['Q1', 1], ['Q2', 1], ['Q3', -1], ['Q3', 1]]) {
    const m = WORKS.machine(id), x = side < 0 ? m.x0 - RB.hw + 0.10 : m.x1 + RB.hw - 0.10;
    G.rabbit = stubRabbit(x, 0); WORKS.reset(cpOf('works-in')); WORKS.setPhase(m.clock, (m.offset || 0) + m.period - 0.25); events.length = 0;
    for (let i = 0; i < 120 * 5; i++) { G.t += DT; WORKS.step(DT); }
    const sh = events.filter(e => e[0] === 'works:shove'), f = events.filter(e => e[0] === 'fail'), clear = side < 0 ? G.rabbit.x <= m.x0 - RB.hw : G.rabbit.x >= m.x1 + RB.hw;
    check(sh.length === 1 && f.length === 0 && clear, `${id}: a body 0.10 m under its ${side < 0 ? 'left' : 'right'} edge is shoved clear (to ${G.rabbit.x.toFixed(3)}), no cut`);
  }
  const m = WORKS.machine('P1'); G.rabbit = stubRabbit(m.x0 + 0.05, 0); WORKS.reset(cpOf('works-in')); WORKS.setPhase('P1', 23.75); events.length = 0;
  for (let i = 0; i < 120 * 5; i++) { G.t += DT; WORKS.step(DT); }
  check(events.some(e => e[0] === 'fail'), 'P1: a centre 0.05 m inside its edge is the cut (no shove)');
}
{ /* the gate on the module: standing in it as it closes is the cut at the grammar's moment */
  G.rabbit = stubRabbit((WK.sluice.x0 + WK.sluice.x1) / 2, WK.sluice.floorY, { low: true, crouchF: 1, crouchR: 1 }); WORKS.reset(cpOf('works-in')); WORKS.setPhase('P1', 7.0); events.length = 0;
  let at = null; for (let i = 0; i < 120 * 5 && at == null; i++) { G.t += DT; WORKS.step(DT); if (events.some(e => e[0] === 'fail')) at = WORKS.clock('P1'); }
  check(at != null && Math.abs(at - WK.sluiceShut) <= DT + 1e-6, `the gate cuts a rabbit standing in it as it closes at P1 phase ${at == null ? '-' : at.toFixed(3)} (the grammar's ${WK.sluiceShut.toFixed(3)})`);
}
{ /* the checkpoints on the module: each restart puts its station at the data's phase */
  let ok = true; for (const c of S2.checkpoints.filter(k => k.works)) { G.rabbit = stubRabbit(c.x, c.y); WORKS.reset(c); const k = c.works.P1 != null ? 'P1' : 'line'; if (Math.abs(WORKS.clock(k) - c.works[k]) > 1e-9) ok = false; }
  G.rabbit = stubRabbit(124.4, 0); WORKS.reset(cpOf('works-in')); const idle = !WORKS.started;
  check(ok && idle, 'FF.Works.reset: every checkpoint sets its station\'s phase; before the trigger (works-in) the machines hang still');
}
{ /* the worker on the module: FF.Painter's own loop and sight, a stub rabbit walking past at the walk */
  FF.Player = { sightPoints: () => pts(G.rabbit.x, false, G.rabbit.face) };
  const run = (k, x0, gait) => { G.rabbit = stubRabbit(x0, 0); FF.Painter.reset(cpOf('works-passage')); FF.Painter.setLoopT(k); events.length = 0; let looked = false;
    for (let i = 0; i < 120 * 14 && G.rabbit.x < 165; i++) { G.t += DT; G.rabbit.x += SPEED[gait] * DT; G.rabbit.vx = SPEED[gait]; FF.Painter.step(DT); if (events.some(e => e[0] === 'painter:noticed')) looked = true; }
    return { looked, fails: events.filter(e => e[0] === 'fail').length }; };
  const darkEdge = Math.min(SPILL.x0, PN.x - SI.dark.front) - RB.hw - 0.05, safe = [], seen = []; let fails = 0;
  for (let k = 0; k < PN.loopT; k += 0.25) { const q = run(k, darkEdge, 'walk'); (q.looked ? seen : safe).push(k); fails += q.fails; }
  log(`  FF.Painter, walking past from the dark at loop time k: never noticed for ${safe.length} of ${safe.length + seen.length} starts (k ${safe[0]}..); the look for k in ${seen.length ? seen[0].toFixed(2) + '-' + seen[seen.length - 1].toFixed(2) : 'none'}`);
  check(fails === 0, 'FF.Painter never emits a failure');
  check(!run(REACT, darkEdge, 'walk').looked, `FF.Painter: leaving the dark ${REACT} s after the scraping starts, walking, is never noticed`);
  G.rabbit = stubRabbit(159.6, 0); FF.Painter.reset(cpOf('works-passage')); FF.Painter.setLoopT(0); events.length = 0;
  const L2 = []; for (let i = 0; i < 120 * 30; i++) { G.t += DT; FF.Painter.step(DT); }
  for (const e of events) if (e[0] === 'painter') L2.push([e[1], e[2].step]);
  const hold = L2.find(e => e[1] === 'hold'), lower = L2.find(e => e[1] === 'lower'), resume = L2.find(e => e[1] === 'scrape-hard');
  check(!!hold && !!lower && Math.abs(lower[0] - hold[0] - RU.painter.look.hold) < 1e-6 && !!resume, `FF.Painter: standing in his light at his turn -> the look, the lamp held ${hold && lower ? (lower[0] - hold[0]).toFixed(2) : '-'} s, then back to the wall, harder`);
  delete FF.Player;
}

/* ================================================================== summary */
log('');
log('== Timing estimate for a first play (walking; distances from the data; waits from the bots above)');
{ const seg = (a, b, v) => (b - a) / v;
  const join = seg(124.4, 133.9, RB.walk), creep = seg(133.9, 136.2, RB.creep.speed);
  const p1 = (() => { let s = 0, n = 0; for (let ph = 0; ph < 24; ph += 0.5) { const r = runP1(ph, 'pits', 1.5); if (r.ok) { s += r.t; n++; } } return s / n; })();
  const culvert = seg(146.2, 153.0, RB.walk) + 2, passage = seg(153.0, 166.6, RB.walk) + 12 + 4;
  const line = (() => { let s = 0, n = 0; for (let ph = 0; ph < 16; ph += 0.25) { const r = runLine(ph, { gait: 'walk', cautious: true }); if (r.ok) { s += r.t; n++; } } return s / n; })();
  const out = seg(193.8, 201.0, RB.walk) + 12.8 + 4 + 8 + 2.5, look = 25;
  const tot = join + creep + p1 + culvert + passage + 8 + line + out + look;
  log(`  join ${f2(join)} + creep ${f2(creep)} + first press & sluice (pit to pit, mean) ${f2(p1)} + culvert ${f2(culvert)} + passage & worker ${f2(passage)} + watching the line ${f2(8)} + long hall (cautious, mean) ${f2(line)} + rest & ending (a) ${f2(out)} + looking around ${look}`);
  log(`  = about ${Math.floor(tot / 60)}:${String(Math.round(tot % 60)).padStart(2, '0')} with no failure; each failure +15-25 s`);
  check(tot >= 180 && tot <= 300, 'a first play lands in 3-5 minutes'); }
log('');
log(fails ? `FAIL (${fails} check${fails > 1 ? 's' : ''} failed)` : 'PASS (every check)');
if (process.env.OUT) fs.writeFileSync(process.env.OUT, lines.join('\n') + '\n');
process.exit(fails ? 1 : 0);
