// Far Field, Sequence 1: THE SEARCH CHECKER (node, no browser). Must pass before any change to Search geometry or perception
// ships (SEQUENCE-1.md §9.8, §20.B; INTERFACES.md §12).
// A port of docs/farfield/checks/search-sim-amended.mjs that keeps NO copy of the rules or the geometry: it loads the game's own
// data and code in node (ff-core, ff-rules, ff-level-s1, ff-script-s1, ff-level, ff-ai) and uses
//   - FF.AI.see()          the ONE detection model (A6) the game runs, for every exposure test,
//   - FF.AI.track()        the game's test for seeing the rabbit once alert (aim, chase), in the pursuit model,
//   - FF.AI.build/sample() the searcher's entry and 47.85 s loop exactly as the game plays them,
//   - FF.Level             the occluders, covers, cores and squeezes from FF.S1,
//   - FF.RULES             every number (perception, reaction, aim, grab, touch, run speeds, the rabbit's moves).
// So the game and the checker cannot drift. It reproduces the amended run's verdicts (search-sim-amended.txt): the hide audit,
// the A1 / A2 / G route scans, the scenarios B-F, and the pursuit map with a first-timer's 0.6 s reaction.
// Run (from anywhere):  node public/farfield/tools/check-search.mjs        exit code 0 = PASS, 1 = FAIL
// Options (env): REACT=0.6 (reaction s), VERBOSE=1 (every scan run), OUT=<dir> (writes hides.json, pursuit.json), JS=<dir> (the game's js/)
// CONTROLS (Josh 7 Oct §9.1): a direction alone is the cautious walk (RB.walk) for as long as it is held; Shift + a direction is
// the run (RB.run), the flee (RB.flee) while he is chasing; Down the crouch-walk; a squeeze caps the speed asked for. There is no
// hold-to-run ramp any more. Plans return { dir, run, crouch }. The route scans run twice: RUN (Shift held: the verdicts, as the
// amended run modelled a running rabbit) and WALK (a direction alone: reported, with its own checks). The pursuit model flees
// with Shift held after the reaction (a first-timer met the "Shift run" hint in the Verge); a pursuit row without Shift is
// reported to show why the hint matters.
import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
const HERE = path.dirname(new URL(import.meta.url).pathname), JS = process.env.JS || path.resolve(HERE, '../js');
globalThis.window = globalThis;
for (const f of ['ff-core.js', 'ff-rules.js', 'ff-level-s1.js', 'ff-script-s1.js', 'ff-level.js', 'ff-guard.js', 'ff-ai.js']) vm.runInThisContext(fs.readFileSync(path.join(JS, f), 'utf8'), { filename: f });
const FF = globalThis.FF, L = FF.Level, AI = FF.AI, RU = FF.RULES, RB = RU.rabbit, SI = RU.sight, SR = RU.searcher;
const OUT = process.env.OUT || null, VERBOSE = !!process.env.VERBOSE, REACT = +(process.env.REACT || SR.firstTimerReaction || 0.6);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const log = (...a) => console.log(...a), vlog = (...a) => { if (VERBOSE) console.log(...a); };

/* ---------------- the searcher's routine: the game's own segments */
const ENTRY = AI.build(FF.S1.searcher.entry, 'N0'), LOOP = AI.build(FF.S1.searcher.loop, 'N1');
const ENTRY_T = AI.total(ENTRY), LOOP_T = AI.total(LOOP);
/* t = 0 is the start of the entry; the loop repeats after it (the sway runs on the absolute clock, as in the reference) */
function searcherAt(t) {
  let list = ENTRY, tt = t; if (t >= ENTRY_T) { list = LOOP; tt = (t - ENTRY_T) % LOOP_T; }
  const p = AI.sample(list, tt, t); return Object.assign(p, { crouch: p.kneel, loopT: list === LOOP ? tt : -1 });
}
const doorOpenAt = (() => { let t = 0; for (const s of ENTRY) { if (s.kind === 'doorway') return t; t += s.dur; } return 2.5; })();

/* ---------------- geometry from FF.S1 */
const HIDES = FF.S1.covers.filter(c => c.core).map(c => ({ id: c.id, x0: c.x0, x1: c.x1, clear: c.y1, core: c.core, kneelEnds: c.kneelEnds || [], exit: !!c.exit }));
const REFUGES = HIDES.map(h => ({ id: h.id, x0: (h.refuge || h.core)[0], x1: (h.refuge || h.core)[1] }));
const blocked = (ax, ay, bx, by) => L.segmentBlocked(ax, ay, bx, by);
const squeezing = x => !!L.squeezeAt(x, RB.hw, 0);
const inCore = x => HIDES.some(h => x >= h.core[0] - 1e-6 && x <= h.core[1] + 1e-6);
const samples = (x, f, crouched) => (crouched ? RB.samples.crouch : RB.samples.stand).map(([dx, dy]) => [x + dx * f, dy]);
const pose = h => ({ x: h.x, y: h.y, face: h.face, kneel: h.crouch, torchOn: h.torchOn, pitch: h.pitch, half: h.half });
/* the ONE detection model (FF.AI.see); only: 'torch' isolates the torch term for the hide audit */
const exposure = (h, x, f, crouched, t, only) => AI.see(pose(h), samples(x, f, crouched), { doorOpen: t >= doorOpenAt, floorY: 0, cx: x, only });
const tFill = (d, src) => AI.fillTime(src, d);
const torchOrigin = h => ({ x: h.x + (h.crouch ? SI.torch.kneelFwd : SI.torch.fwd) * (h.face || 1), y: h.y + (h.crouch ? SI.torch.kneelH : SI.torch.h) });

/* ================================================================== 1. hide audit (standing torch over the entry + 3 loops) */
const hides = [];
for (const hd of HIDES) {
  const res = [];
  for (let x = hd.x0 + RB.hw; x <= hd.x1 - RB.hw + 1e-9; x += 0.02) {
    let worst = null, crouchLit = false;
    for (let t = 0; t < ENTRY_T + 3 * LOOP_T; t += 0.05) {
      const h = searcherAt(t);
      for (const f of [-1, 1]) for (const cr of [false, true]) {
        if (hd.clear < 0.245 && !cr) continue;                  // must crouch in a gap
        const e = exposure(h, x, f, cr, t, 'torch');
        if (e.w > 0) { if (h.crouch) { crouchLit = true; continue; } if (!worst || e.w > worst.w) worst = { t: +t.toFixed(2), kind: h.kind, hx: +h.x.toFixed(2), crouch: cr, w: +e.w.toFixed(2) }; }
      }
    }
    res.push({ x: +x.toFixed(2), lit: !!worst, worst, crouchLit });
  }
  let best = null, cur = null;
  for (const r of res) { if (!r.lit) { if (!cur) cur = [r.x, r.x]; else cur[1] = r.x; if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur.slice(); } else cur = null; }
  const cl = res.filter(r => r.crouchLit).map(r => r.x);
  const coreOK = !!(best && hd.core[0] >= best[0] - 1e-6 && hd.core[1] <= best[1] + 1e-6);
  const crouchClear = !cl.length || cl[0] > hd.core[1] + 1e-6 || cl[cl.length - 1] < hd.core[0] - 1e-6;
  hides.push({ id: hd.id, span: [hd.x0, hd.x1], core: hd.core, standingSafe: best, coreOK, crouchLook: cl.length ? [cl[0], cl[cl.length - 1]] : null, crouchClear, exit: hd.exit, litBy: [...new Set(res.filter(r => r.lit).map(r => r.worst.kind))] });
}
log('FAR FIELD · Search checker (game data: FF.S1 + FF.RULES, detection: FF.AI.see, routine: FF.AI.sample)');
log('ENTRY', ENTRY_T.toFixed(2), 's   LOOP', LOOP_T.toFixed(2), 's   first-timer reaction', REACT, 's');
log('\nHIDE AUDIT (the standing torch over the entry + 3 loops; the crouch-look reported separately)');
for (const h of hides) log(' ', h.id.padEnd(9), 'span', h.span.join('-').padEnd(12), 'core', JSON.stringify(h.core).padEnd(16), 'standing-safe centres', (h.standingSafe ? h.standingSafe.join('-') : 'NONE').padEnd(14), 'core ok', String(h.coreOK).padEnd(5), 'crouch-look lights', JSON.stringify(h.crouchLook), h.exit ? '(exit)' : '', '| lit by', h.litBy.join(','));

/* ================================================================== 2. scenario runner: a rabbit plan vs the searcher */
function run(name, plan, t0, x0, opts = {}) {
  const dt = 1 / 120; let x = x0, v = 0, s = 0, graceT = 0, t = t0, f = 1, noticeAt = null, alertAt = null, firstLit = null, maxS = 0, sq = false, duck = 0;
  const end = opts.until || (x => x >= REFUGES.find(r => r.id === 'gap').x0 + 0.1);
  const logRows = [];
  for (let i = 0; i < 120 * 90; i++, t += dt) {
    const p = plan(t, { x, s });
    const dir = p.dir || 0, wantRun = p.run != null ? p.run : opts.run;
    let top = wantRun && dir ? RB.run : RB.walk;
    if (p.crouch) top = RB.crouch;
    const sqn = squeezing(x + dir * 0.02); if (sqn) { top = Math.min(top, RB.duckUnder.speed); if (!sq) duck = RB.duckUnder.duck; }
    sq = sqn; if (duck > 0) { duck -= dt; top = 0; }
    v = v < dir * top ? Math.min(dir * top, v + RB.accel * dt) : Math.max(dir * top, v - RB.decel * dt);
    if (sqn && Math.abs(v) > RB.duckUnder.speed) v = Math.sign(v) * RB.duckUnder.speed;
    x += v * dt; if (dir) f = dir; const crouched = !!(p.crouch || sqn);
    const h = searcherAt(t), e = FF.Guard.merge(exposure(h, x, f, crouched, t), FF.Guard.hear(pose(h), FF.Guard.noiseOf(v), x, { floorY: 0, lat: Math.abs(FF.S1.searcher.pathZ) }));   // polish pass: + SOUND (a run is loud)
    /* the game's touch rule: a rabbit sitting still (|v| < 0.3) that he walks into makes him stop dead (NOTICE) first, then the
       close-range fill (0.8 s) runs; a rabbit that runs into his legs gets the lunge at once */
    if (e.src === 'touch' && Math.abs(v) < (SI.touch.stillBelow || 0.3)) { s = Math.max(s, SI.fill.notice); s += dt / SI.dark.t; graceT = 0; if (noticeAt == null) noticeAt = { t: +(t - t0).toFixed(2), x: +x.toFixed(2) }; if (s >= 1) { alertAt = { t: +(t - t0).toFixed(2), x: +x.toFixed(2), hx: +h.x.toFixed(2), d: +Math.abs(x - h.x).toFixed(2), by: 'close' }; alertAt.thenFleeing = pursuit(x, h.x, opts.fleeTo ? { target: opts.fleeTo } : {}).out; break; } maxS = Math.max(maxS, s); continue; }
    if (e.src === 'touch') { alertAt = { t: +(t - t0).toFixed(2), x: +x.toFixed(2), hx: +h.x.toFixed(2), d: +Math.abs(x - h.x).toFixed(2), by: 'touch' }; alertAt.thenFleeing = pursuit(x, h.x, opts.fleeTo ? { target: opts.fleeTo } : {}).out; break; }
    if (e.w > 0) { s += e.w / tFill(e.d, e.src) * dt; graceT = 0; if (firstLit == null) firstLit = { t: +(t - t0).toFixed(2), x: +x.toFixed(2), src: e.src, hx: +h.x.toFixed(2), kind: h.kind }; }
    else { graceT += dt; if (graceT > SI.fill.grace) s = Math.max(0, s - SI.fill.decay * dt); }
    maxS = Math.max(maxS, s);
    if (s >= SI.fill.notice && noticeAt == null) noticeAt = { t: +(t - t0).toFixed(2), x: +x.toFixed(2) };
    if (s >= 1) { alertAt = { t: +(t - t0).toFixed(2), x: +x.toFixed(2), hx: +h.x.toFixed(2), d: +Math.abs(x - h.x).toFixed(2), by: 'light' }; alertAt.thenFleeing = pursuit(x, h.x, opts.fleeTo ? { target: opts.fleeTo } : {}).out; break; }
    if (i % 12 === 0) logRows.push([+(t - t0).toFixed(2), +x.toFixed(2), +h.x.toFixed(2), h.kind, +s.toFixed(2)]);
    if (end(x)) break;
  }
  const r = { name, startT: +t0.toFixed(2), took: +(t - t0).toFixed(2), endX: +x.toFixed(2), maxSuspicion: +maxS.toFixed(2), firstLit, notice: noticeAt, alert: alertAt };
  vlog('\n' + name + '\n  ' + JSON.stringify(r));
  return Object.assign(r, { log: logRows });
}
const loopStart = k => ENTRY_T + k * LOOP_T;
function phaseStart(kind, nth = 0, k = 1) { let tt = loopStart(k), n = 0; for (const s of LOOP) { const kk = /^walk/.test(s.kind) ? 'walk' : s.kind; if (kk === kind) { if (n === nth) return tt; n++; } tt += s.dur; } }
const outcome = r => r.alert ? r.alert.by + '->' + r.alert.thenFleeing : 'clean, max s ' + r.maxSuspicion;

/* ================================================================== 3. the pursuit model (spotted at xr with him at xh; flee to the
   nearest refuge on the far side from him, after the reaction) */
function pursuit(xr, xh, opt = {}) {
  const dt = 1 / 120, A = SR.aim, Gb = SR.grab; let t = 0, v = 0, hv = 0, st = 'alert', stT = 0, losT = 0, visT = 0, pursueT = 0, lastSeen = xr, sq = false, duck = 0;
  const away = Math.sign(xr - xh) || 1;
  let target = null; for (const r of REFUGES) { const c = (r.x0 + r.x1) / 2; if (Math.sign(c - xr) === away) { if (!target || Math.abs(c - xr) < Math.abs((target.x0 + target.x1) / 2 - xr)) target = r; } }
  if (opt.target) target = REFUGES.find(r => r.id === opt.target);
  const goal = target ? (target.x0 + target.x1) / 2 : xr + away * 30, gdir = Math.sign(goal - xr);
  for (let i = 0; i < 120 * 20; i++, t += dt) {
    if (t > REACT) { const s2 = squeezing(xr + gdir * 0.02); if (s2 && !sq) duck = RB.duckUnder.duck; sq = s2; if (duck > 0) duck -= dt; else { const top = opt.noShift ? RB.walk : RB.flee; v = Math.min(s2 ? Math.min(top, RB.duckUnder.fleeSpeed) : top, v + RB.accel * 1.2 * dt); if (s2) v = Math.min(v, RB.duckUnder.fleeSpeed); xr += gdir * v * dt; } }
    if (target && xr >= target.x0 && xr <= target.x1) return { out: 'safe in ' + target.id, t: +t.toFixed(2), state: st };
    const inC = inCore(xr), d = Math.abs(xr - xh);
    const vis = AI.track({ x: xh, y: 0, kneel: false }, { x: xr, y: 0, crouch: false });      // the game's own tracking test
    if (vis) { visT += dt; losT = 0; lastSeen = xr; } else { visT = 0; losT += dt; }
    stT += dt;
    if (!inC && st !== 'grab' && d <= SI.touch.front) { st = 'grab'; stT = 0; }
    if (st === 'alert') { if (stT >= SR.reaction) { st = d < Gb.range ? 'grab' : (vis && d <= A.max ? 'aim' : 'pursue'); stT = 0; } }
    else if (st === 'grab') { if (stT >= Gb.wind) { const hand = xh + Gb.hand * Math.sign(xr - xh); if (Math.abs(xr - hand) <= Gb.reach && !inC) return { out: 'CAUGHT (grab)', t: +t.toFixed(2) }; st = 'pursue'; stT = 0; } }
    else if (st === 'aim') { if (losT >= A.breakLOS) { st = 'lower'; stT = 0; } else if (stT >= A.raise + A.hold) return { out: 'SHOT', t: +t.toFixed(2), d: +d.toFixed(2) }; }
    else if (st === 'lower') { if (stT >= A.lower) { st = 'pursue'; stT = 0; } }
    else if (st === 'pursue') { pursueT += dt; hv = Math.min(SR.run, hv + SR.runAccel * dt); xh += Math.sign(lastSeen - xh) * hv * dt;
      if (Math.abs(xr - xh) < Gb.runRange && !inC) { st = 'grab'; stT = Gb.wind - Gb.windRunning; hv = 0; }
      else if (pursueT >= A.afterPursue && visT >= A.needSight && d >= A.min && d <= A.max) { st = 'aim'; stT = 0; hv = 0; } }
  }
  return { out: 'still running', t: 20 };
}

/* ================================================================== 4. the routes and scenarios */
const tLook = phaseStart('look', 0, 1), tW = phaseStart('walk', 1, 2);
function routes(mode) {
  const o = { run: mode === 'RUN' }, R = (name, plan, t0, x0, op) => run(name, plan, t0, x0, Object.assign({}, o, op || {}));
  const S = [];
  log('\n================ ' + mode + (mode === 'RUN' ? ' (Shift + a direction: ' + RB.run + ' m/s)' : ' (a direction alone, the cautious walk: ' + RB.walk + ' m/s)'));
  const a1 = []; for (let k = -6; k <= 8; k += 1) { const r = R('(scan) A1 leave ' + k, (t, st) => ({ dir: t > tLook + k && st.x < 106.1 ? 1 : 0 }), tLook - 8, 95.0, { until: x => x >= 106.1, fleeTo: 'gap' }); a1.push([k, outcome(r), r.alert ? r.alert.d : null]); }
  log('\nA1 scan (leave the deck core k s after the deck look starts -> outcome):', JSON.stringify(a1));
  S.push(R('A1  deck -> skip core during the deck look (leave 0.5 s into the look)', (t, st) => ({ dir: t > tLook + 0.5 && st.x < 106.1 ? 1 : 0 }), tLook, 95.0, { until: x => x >= 106.1 }));
  const a2 = []; for (let k = 0; k <= 8; k += 0.5) { const r = R('(scan) A2 leave ' + k, t => ({ dir: t > tW + k ? 1 : 0 }), tW, 106.1, { fleeTo: 'gap' }); a2.push([k, outcome(r), r.alert ? r.alert.d : null]); }
  log('\nA2 scan (seconds after the crouch-look ends -> outcome):', JSON.stringify(a2));
  S.push(R('A2  skip core -> gap, leave 3.0 s after the crouch-look ends', t => ({ dir: t > tW + 3.0 ? 1 : 0 }), tW, 106.1, { fleeTo: 'gap' }));
  { const tS = phaseStart('turn-sweep', 0, 1); S.push(R('B   impatient: skip core -> gap as the N1 turn-sweep starts', () => ({ dir: 1 }), tS, 106.1, { fleeTo: 'gap' })); }
  { const tC = phaseStart('crouch-look', 0, 1);
    S.push(R('C1  frozen in the skip margin (x 106.75) through the crouch-look', () => ({ dir: 0, crouch: true }), tC - 0.5, 106.75, { until: () => false }));
    S.push(R('C2  same, but shuffles left into the core when he crouches', (t, st) => ({ dir: t > tC + 0.3 + 0.6 && st.x > 106.2 ? -1 : 0, crouch: true }), tC - 0.5, 106.75, { until: () => false })); }
  S.push(R('D   ignores the door cue: lands 1.5 s before the cue, straight right', () => ({ dir: 1 }), -1.5, 87.6, { fleeTo: 'gap' }));
  { const tw = phaseStart('walk', 1, 1); S.push(R('E   arrival -> deck core while he walks N2 -> N3 (facing it)', (t, st) => ({ dir: st.x < 94.5 ? 1 : 0 }), tw + 2.0, 88.9, { until: x => x >= 94.5 })); }
  { const tw = phaseStart('walk', 3, 1); S.push(R('F   tailgates 2-3 m behind him walking N3 -> N1', (t, st) => { const h = searcherAt(t); return { dir: st.x < h.x - 2.4 ? 1 : 0 }; }, tw + 1.0, 97.0, { until: () => false })); }
  S.push(R('G   deck core -> gap in one go during the deck look', () => ({ dir: 1 }), tLook + 0.5, 95.0));
  /* v2 review fixes: the short stepping stone at the cautious pace, deck core -> pallet core (5.55 m), leaving k s into his look */
  const dp = []; for (let k = 0; k <= 4; k += 0.5) { const r = R('(scan) deck -> pallet leave ' + k, (t, st) => ({ dir: t > tLook + k && st.x < 102.2 ? 1 : 0 }), tLook - 2, 95.0, { until: x => x >= 102.2, fleeTo: 'pallet-B' }); dp.push([k, outcome(r) + (r.notice ? ' (NOTICE)' : ''), r.alert ? r.alert.d : null]); }
  log('\nDECK -> PALLET scan (leave the deck core k s after the deck look starts, stop in the pallet core):', JSON.stringify(dp));
  const gs = []; for (let k = -4; k <= 4; k += 0.5) { const r = R('(scan) G leave ' + k, t => ({ dir: t > tLook + k ? 1 : 0 }), tLook - 5, 95.0); gs.push([k, r.alert ? outcome(r) : 'clean, max s ' + r.maxSuspicion + ', ' + (r.took - (5 + k)).toFixed(1) + ' s', r.alert ? r.alert.d : null]); }
  log('\nG scan (leave the deck core k s after the deck look starts, go to the gap):', JSON.stringify(gs));
  log('\nSCENARIOS (' + mode + ')'); for (const r of S) log(' ', r.name.padEnd(78), '|', outcome(r), r.notice ? '(NOTICE at ' + r.notice.t + ' s)' : '', '| took', r.took, 's');
  return { a1, a2, gs, dp, S };
}
const RUNR = routes('RUN'), WALKR = routes('WALK');
const { a1, a2, gs, S } = RUNR;

/* ================================================================== 5. the pursuit map */
const PM = [];
for (const [lbl, dxh] of [['searcher 2 m behind', -2], ['searcher 4 m behind', -4], ['searcher 7 m behind', -7], ['searcher 3 m ahead (rabbit runs back)', 3]]) {
  const row = []; for (let xr = 89; xr <= 112; xr += 1) { if (inCore(xr)) { row.push([xr, 'core']); continue; } const r = pursuit(xr, xr + dxh); row.push([xr, r.out.startsWith('safe') ? 'ok' : r.out]); }
  PM.push({ lbl, row }); log('\nPURSUIT from x (spotted, flees at once after ' + REACT + ' s):', lbl, '\n  ' + row.map(([x, o]) => x + ':' + (o === 'ok' ? 'ok' : o === 'core' ? '·' : o.replace('CAUGHT (grab)', 'GRAB'))).join(' '));
}
{ const row = []; for (let xr = 89; xr <= 112; xr += 1) { if (inCore(xr)) { row.push([xr, 'core']); continue; } const r = pursuit(xr, xr - 4, { noShift: true }); row.push([xr, r.out.startsWith('safe') ? 'ok' : r.out]); }
  log('\nPURSUIT WITHOUT SHIFT (reported, not a verdict: spotted, the player reacts after ' + REACT + ' s with a direction alone, the cautious walk), searcher 4 m behind\n  ' + row.map(([x, o]) => x + ':' + (o === 'ok' ? 'ok' : o === 'core' ? '·' : o.replace('CAUGHT (grab)', 'GRAB'))).join(' ')); }
log('\nexamples: spotted at 109, him at 106 ->', JSON.stringify(pursuit(109, 106)), '| at 100, him ahead at 104 ->', JSON.stringify(pursuit(100, 104)), '| at 100, him behind at 96 ->', JSON.stringify(pursuit(100, 96)));

/* ================================================================== 6. warning times (A7) for a rabbit that does not move */
const F = SI.fill, near = F.notice * F.tNear, dark = F.notice * SI.dark.t;
const fair = { noticeToGrab_near: +(F.tNear - near + SR.reaction + SR.grab.wind).toFixed(2), noticeToGrab_dark: +(SI.dark.t - dark + SR.reaction + SR.grab.wind).toFixed(2),
  noticeToShot_near: +(F.tNear - near + SR.reaction + SR.aim.raise + SR.aim.hold).toFixed(2), aimItself: +(SR.aim.raise + SR.aim.hold).toFixed(2), touchWindUp: SI.touch.wind, fleeVsRun: [RB.flee, SR.run] };
log('\nWARNING TIMES (A7: first unmistakable cue = NOTICE):', JSON.stringify(fair));

/* ================================================================== 7. verdicts */
const checks = [];
const ck = (name, ok, info) => checks.push({ name, ok: !!ok, info });
for (const h of hides) { if (h.exit) continue; ck('hide core dark: ' + h.id, h.coreOK, h.standingSafe); ck('crouch-look stops short of the core: ' + h.id, h.crouchClear, h.crouchLook); }
ck('A1 clean for k -6..+3', a1.filter(([k]) => k >= -6 && k <= 3).every(([, o]) => o.startsWith('clean')), a1.filter(([k]) => k <= 3).map(a => a[1]));
ck('A1 never SPOTTED for k +4..+8 (NOTICE at most)', a1.filter(([k]) => k >= 4).every(([, o]) => o.startsWith('clean')), a1.filter(([k]) => k >= 4).map(a => a[1]));
ck('A2 leaving at once runs into his legs', a2[0][1].startsWith('touch'), a2[0][1]);
ck('A2 clean from 0.5 s after the crouch-look', a2.filter(([k]) => k >= 0.5).every(([, o]) => o.startsWith('clean')), a2.filter(([k]) => k >= 0.5).map(a => a[1]).filter(o => !o.startsWith('clean')));
ck('G clean leaving -4 .. +3.5 s', gs.filter(([k]) => k <= 3.5).every(([, o]) => o.startsWith('clean')), gs.filter(([k]) => k <= 3.5 && !gs.find(g => g[0] === k)[1].startsWith('clean')));
ck('G takes <= 9.0 s (R2)', S.find(r => r.name.startsWith('G ')).took <= 9.0, S.find(r => r.name.startsWith('G ')).took);
ck('pursuit map: fleeing at once survives everywhere', PM.every(p => p.row.every(([, o]) => o === 'ok' || o === 'core')), PM.map(p => p.row.filter(([, o]) => o !== 'ok' && o !== 'core')));
/* the cautious walk (a direction alone) must stay fair too. A slower crossing has shorter windows, so it may be SPOTTED where
   a run is not: what must hold is that the long window still works at the walking pace, and that every alert beyond the
   close-range rule (A6: within dark.front he notices it even in darkness) can be survived by running (Shift) at once.
   Alerts within dark.front are the walk-into-his-legs cases the design already punishes when running (A2 leaving at once). */
const WALL = [...WALKR.a1, ...WALKR.a2, ...WALKR.gs].map(([k, o, d]) => ({ k, o, d })).concat(WALKR.S.map(r => ({ k: r.name, o: outcome(r), d: r.alert ? r.alert.d : null })));
const RALL = [...RUNR.a1, ...RUNR.a2, ...RUNR.gs].map(([k, o, d]) => ({ k, o, d })).concat(RUNR.S.map(r => ({ k: r.name, o: outcome(r), d: r.alert ? r.alert.d : null })));
const bad = L => L.filter(e => /->(CAUGHT|SHOT)/.test(e.o));
ck('WALK: A2 clean from 0.5 s after the crouch-look (the long window works at the cautious pace)', WALKR.a2.filter(([k]) => k >= 0.5).every(([, o]) => o.startsWith('clean')), WALKR.a2.filter(([k]) => k >= 0.5 && !WALKR.a2.find(a => a[0] === k)[1].startsWith('clean')));
/* v2 review fixes (the deck look is 9.0 s): at the cautious walk, the main window works as staged. Leaving the deck core 0.5-2 s
   into his look reaches the pallet core without even a NOTICE, and the deck -> skip crossing (A1, leaving 0.5 s in) is never
   SPOTTED (a NOTICE at most) */
ck('WALK: deck -> pallet core leaving 0.5-2 s into the look: no NOTICE', WALKR.dp.filter(([k]) => k >= 0.5 && k <= 2).every(([, o]) => o.startsWith('clean') && !/NOTICE/.test(o)), WALKR.dp);
ck('WALK: A1 deck -> skip leaving 0.5 s into the look is never SPOTTED', outcome(WALKR.S.find(r => r.name.startsWith('A1 '))).startsWith('clean'), outcome(WALKR.S.find(r => r.name.startsWith('A1 '))));
ck('WALK: E arrival -> deck core clean', outcome(WALKR.S.find(r => r.name.startsWith('E '))).startsWith('clean'), outcome(WALKR.S.find(r => r.name.startsWith('E '))));
ck('WALK: every alert beyond the close-range rule (> ' + SI.dark.front + ' m) is survivable by running (Shift) at once', bad(WALL).every(e => e.d != null && e.d <= SI.dark.front), bad(WALL).filter(e => !(e.d != null && e.d <= SI.dark.front)));
log('\nFAILURES (both modes; each is a deliberate mistake the design punishes: walking or running into his legs within the close-range rule, or leaving as he turns):');
for (const [m, L] of [['RUN', RALL], ['WALK', WALL]]) for (const e of bad(L)) log(' ', m.padEnd(5), String(e.k).slice(0, 60).padEnd(60), e.o, 'at', e.d, 'm');
ck('A7: NOTICE -> grab >= 1.5 s (near, in light)', fair.noticeToGrab_near >= 1.5, fair.noticeToGrab_near);
ck('A7: NOTICE -> grab >= 1.5 s (darkness)', fair.noticeToGrab_dark >= 1.5, fair.noticeToGrab_dark);
ck('A7: NOTICE -> shot >= 2.6 s', fair.noticeToShot_near >= 2.6, fair.noticeToShot_near);
log('\nVERDICTS'); for (const c of checks) log(' ', c.ok ? 'PASS' : 'FAIL', c.name, c.ok ? '' : JSON.stringify(c.info));
const pass = checks.every(c => c.ok);
log('\n' + (pass ? 'PASS' : 'FAIL') + ' (' + checks.filter(c => c.ok).length + '/' + checks.length + ')');
if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'hides.json'), JSON.stringify(hides, null, 1)); fs.writeFileSync(path.join(OUT, 'pursuit.json'), JSON.stringify(PM, null, 1)); fs.writeFileSync(path.join(OUT, 'scenarios.json'), JSON.stringify(S.map(({ log, ...r }) => r), null, 1)); }
process.exitCode = pass ? 0 : 1;
