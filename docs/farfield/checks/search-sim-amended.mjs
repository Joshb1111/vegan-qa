// Far Field, Sequence 1: the Search checker AS AMENDED (7 Oct, docs/farfield/SEQUENCE-1.md A6, A7, A9-A11, A16).
// A design tool, not game code. Lineage: design/encounter/sim.mjs (encounter designer) -> the critic's sim-mod.mjs (squeeze
// speed, floodlight, first-timer reaction) -> this file (architect): the amended geometry (pallet B 101.0-103.4, the skip's
// rear door to 0.22), the 6.0 s deck look (loop 44.85 s), duck-under squeezes (1.6 m/s, 2.4 fleeing, 0.1 s duck), geometric
// detection with no "binary core" shortcut, darkness noticed within 1.75 m (fill 0.8 s), touch = line of sight + same floor
// with the 0.45 s lunge, every core a refuge, a first-timer reaction of 0.6 s, the floodlight as an area light, and fleeing
// only towards refuges on the far side from the searcher.
// It still keeps its own copy of the geometry and rules (constants below). The humans builder ports it to read FF.S1 + FF.RULES
// directly (public/farfield/tools/check-search.mjs, SEQUENCE-1.md §9.8 / §20.B) and it must pass before Search changes ship.
// Run: node search-sim-amended.mjs   (defaults = the amended rules; env overrides: REACT, LOOK, SQV, SQF, DUCK, CLOSE, TCLOSE, TWIND, LIPR, PX0/PX1, PC0/PC1, OUT)
// Output of the 7 Oct run: search-sim-amended.txt (next to this file).
for (const [k, v] of Object.entries({ FLOOD: '1', SQ: '1', DUCK: '0.1', REACT: '0.6', LIPR: '0.22' })) if (process.env[k] == null) process.env[k] = v;
// Far Field, Sequence 1: encounter-rules checker for THE SEARCH (design tool, not game code).
// Geometry = production draft FF.S1 (design/production/ff-level-s1.js, 7 Oct 12:39) + the amendments in encounter.md.
// Rules = encounter.md section 4. Run: node sim.mjs  -> prints checks, writes search-xt.svg and hides.json.
import fs from 'node:fs';
const OUT = process.env.OUT || (await import('node:os')).tmpdir() + '/';
const D2R = Math.PI / 180, clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;

/* ---------------- rules (encounter.md §4) */
export const RULES = {
  torch: { fwd: 0.32, h: 1.25, crouchFwd: 0.35, crouchH: 0.40, half: 13, range: 10.0, pitchWalk: -20, sway: 5, swayHz: 0.35, pitchLook: -18, aimHalf: 5 },
  eye: 1.62, close: +(process.env.CLOSE||1.75), closeBehind: 0.5, area: { range: 9.0, weight: 0.6 },
  fill: { tNear: 0.9, dNear: 3.0, tFar: 1.6, dFar: 10.0, tClose: +(process.env.TCLOSE||0.8), grace: 0.5, decay: 0.5, notice: 0.35 },
  alert: 0.6, aim: { min: 2.5, max: 10.0, raise: 0.5, hold: 1.0, lower: 0.5, breakLOS: 0.2 }, grab: { range: 2.5, wind: 0.45, reach: 0.7 }, touch: { front: 0.6, behind: 0.3, wind: +(process.env.TWIND||0.45) },
  reachDepth: 1.0, kneel: 1.0, reachT: 0.6, runSpeed: 2.6, runAccel: 5.0,
  rabbit: { walk: 1.15, run: 2.75, flee: 3.6, accel: 5.0, runAfter: 0.30, runRamp: 0.55, hw: 0.16 },
};
const R = RULES;

/* ---------------- geometry (lane x/y). occluders block light and sight; hides name the under-spaces */
const OCC = [
  { id: 'A0-shelf', x0: 88.0, x1: 89.8, y0: 0.30, y1: 0.42 }, { id: 'A0-skirtR', x0: 89.7, x1: 89.8, y0: 0.20, y1: 0.30 },
  { id: 'deck', x0: 92.0, x1: 98.0, y0: 0.67, y1: 0.85 }, { id: 'deck-skirtR', x0: 97.85, x1: 98.0, y0: 0.22, y1: 0.67 },
  { id: 'pallet', x0: +(process.env.PX0||101.0), x1: +(process.env.PX1||103.4), y0: 0.26, y1: 0.40 }, { id: 'pallet-skirtL', x0: +(process.env.PX0||101.0), x1: +(process.env.PX0||101.0)+0.1, y0: 0.20, y1: 0.26 }, { id: 'pallet-skirtR', x0: +(process.env.PX1||103.4)-0.1, x1: +(process.env.PX1||103.4), y0: 0.20, y1: 0.26 },
  { id: 'skip', x0: 105.0, x1: 107.2, y0: 0.32, y1: 1.55 }, { id: 'skip-skirtL', x0: 105.0, x1: 105.1, y0: 0.20, y1: 0.32 }, ...(process.env.LIPR ? [{ id: 'skip-lipR', x0: 107.1, x1: 107.2, y0: +process.env.LIPR, y1: 0.32 }] : []),
  { id: 'fence', x0: 113.0, x1: 113.5, y0: 0.20, y1: 3.2 },
];
const HIDES = [
  { id: 'A0 shelf (arrival, checkpoint)', x0: 88.0, x1: 89.8, clear: 0.30, core: [88.2, 88.95] },
  { id: 'deck-A (watching place, refuge)', x0: 92.0, x1: 98.0, clear: 0.67, core: [93.2, 96.3] },
  { id: 'pallet-B (skirted both ends)', x0: +(process.env.PX0||101.0), x1: +(process.env.PX1||103.4), clear: 0.26, core: [+(process.env.PC0||101.85), +(process.env.PC1||102.55)] },
  { id: 'skip-C (midpoint, checkpoint)', x0: 105.0, x1: 107.2, clear: 0.32, core: [105.8, 106.4] },
  { id: 'gap (fence corner)', x0: 113.0, x1: 113.5, clear: 0.20, core: [113.15, 113.5] },
];
const REFUGES = HIDES.map(h => ({ id: h.id.split(' ')[0], x0: h.core[0], x1: h.core[1] }));
const AREA = [{ id: 'door spill', x0: 108.6, x1: 111.4, on: [2.5, 1e9] }].concat(process.env.FLOOD === '1' ? [{ id: 'flood', x0: 101.0, x1: 106.0, on: [-1e9, 1e9] }] : []); // the open door's light on the floor
const DECK_Y = 0.85;

/* ---------------- the searcher's loop (encounter.md §4.3). Each step: [kind, dur, x0, x1, face, extra] */
const N0 = 110.0, N1 = 110.0, N2 = 108.2, N3 = 99.4, N4 = 98.0, N5 = 93.0;
function walk(x0, x1, v, kind = 'walk') { return { kind, dur: Math.abs(x1 - x0) / v, x0, x1, face: Math.sign(x1 - x0) }; }
const ENTRY = [
  { kind: 'cue', dur: 2.5, x0: N0, x1: N0, face: -1, off: true, note: 'light under the door, footsteps' },
  { kind: 'doorway', dur: 1.0, x0: N0, x1: N0, face: -1, note: 'silhouette in the door (back wall, z -3)' },
  { kind: 'step-in', dur: 2.45, x0: N0, x1: N1, face: -1, note: 'walks forward to the path (z -3 -> -0.55); torch aimed at the floor ahead of them' },
  { kind: 'sweep-left', dur: 2.0, x0: N1, x1: N1, face: -1, note: 'sweeps the yard floor near to far (pitch -35 -> -8)' },
  { kind: 'turn', dur: 0.6, x0: N1, x1: N1, face: 0 },
  { kind: 'aim-demo', dur: 2.0, x0: N1, x1: N1, face: 1, pitch: -22, half: 5, note: 'clatter at the fence: raise 0.5, hold 1.0 on the gap (click), lower 0.5; no shot' },
  { kind: 'turn', dur: 1.0, x0: N1, x1: N1, face: 0 },
];
const LOOP = [
  walk(N1, N2, 1.0),
  { kind: 'crouch-look', dur: 3.3, x0: N2, x1: N2, face: -1, note: 'stop 0.3, crouch 0.8, look 1.6, stand 0.6: torch under the skip from its open right end' },
  walk(N2, N3, 1.0),
  { kind: 'climb', dur: 1.4, x0: N3, x1: N4, face: -1, y0: 0, y1: DECK_Y },
  { ...walk(N4, N5, 1.0), y0: DECK_Y, y1: DECK_Y },
  { kind: 'look', dur: +(process.env.LOOK||6.0), x0: N5, x1: N5, face: -1, y0: DECK_Y, y1: DECK_Y, pitch: -32, note: 'at the duct mouth the rabbit came from' },
  { kind: 'turn', dur: 1.0, x0: N5, x1: N5, face: 0, y0: DECK_Y, y1: DECK_Y },
  { ...walk(N5, N4, 1.0), y0: DECK_Y, y1: DECK_Y },
  { kind: 'descend', dur: 1.4, x0: N4, x1: N3, face: 1, y0: DECK_Y, y1: 0 },
  walk(N3, N1, 1.3),
  { kind: 'turn-sweep', dur: 3.0, x0: N1, x1: N1, face: -1, note: 'turn 1.0 then sweep 2.0 (pitch -35 -> -8 -> -30)' },
];
const ENTRY_T = ENTRY.reduce((a, s) => a + s.dur, 0), LOOP_T = LOOP.reduce((a, s) => a + s.dur, 0);

/* searcher state at time t (t = 0 is the start of the entry; the loop repeats after it) */
function searcherAt(t) {
  let list = ENTRY, tt = t;
  if (t >= ENTRY_T) { list = LOOP; tt = (t - ENTRY_T) % LOOP_T; }
  for (const s of list) {
    if (tt <= s.dur || s === list[list.length - 1]) {
      const u = clamp(tt / s.dur, 0, 1);
      const x = lerp(s.x0, s.x1, u), y = s.y0 != null ? lerp(s.y0, s.y1, u) : 0;
      let face = s.face, pitch = R.torch.pitchWalk + R.torch.sway * Math.sin(2 * Math.PI * R.torch.swayHz * t), half = R.torch.half, crouch = false, torchOn = !s.off;
      if (s.kind === 'turn') { torchOn = false; face = 0; }
      if (s.kind === 'look') pitch = s.pitch;
      if (s.kind === 'sweep-left') pitch = lerp(-35, -8, tt / s.dur);
      if (s.kind === 'aim-demo') { pitch = s.pitch; half = s.half; }
      if (s.kind === 'turn-sweep') { if (tt < 1.0) { torchOn = false; face = 0; } else { const k = (tt - 1.0) / 2.0; pitch = lerp(-35, -8, Math.sin(Math.PI * k)); } }
      if (s.kind === 'crouch-look') { if (tt < 0.3) pitch = -20; else if (tt < 1.1) { crouch = false; pitch = -24; } else if (tt < 2.7) { crouch = true; pitch = -12; } else pitch = -20; }
      return { x, y, face, pitch, half, crouch, torchOn, kind: s.kind, loopT: list === LOOP ? tt : -1 };
    }
    tt -= s.dur;
  }
}

/* ---------------- light and sight in the lane plane */
function segHitsBox(ax, ay, bx, by, b) { // Liang-Barsky
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy], q = [ax - b.x0, b.x1 - ax, ay - b.y0, b.y1 - ay];
  for (let i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return false; } else { const r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } }
  return t1 > t0 + 1e-6 && t1 > 1e-4 && t0 < 1 - 1e-4;
}
const blocked = (ax, ay, bx, by) => OCC.some(b => segHitsBox(ax, ay, bx, by, b));
const SQV = +(process.env.SQV||1.6), SQF = +(process.env.SQF||2.4); const SQ = process.env.SQ === '1', FLOOD = process.env.FLOOD === '1', REACT = +(process.env.REACT || 0.25), DUCK = +(process.env.DUCK || 0);
function clearAt(x) { let c = 9; for (const b of OCC) if (x + 0.16 > b.x0 && x - 0.16 < b.x1) c = Math.min(c, b.y0); return c; }
const squeezing = x => SQ && clearAt(x) < 0.24;
function torchOrigin(h) { return { x: h.x + (h.crouch ? R.torch.crouchFwd : R.torch.fwd) * (h.face || 1), y: h.y + (h.crouch ? R.torch.crouchH : R.torch.h) }; }
function pointLitByTorch(h, px, py) {
  if (!h.torchOn || !h.face) return false;
  const o = torchOrigin(h), dx = px - o.x, dy = py - o.y, dist = Math.hypot(dx, dy);
  if (dist > R.torch.range || dx * h.face <= 0) return false;
  const ang = Math.atan2(dy, Math.abs(dx)) / D2R; // negative = below horizontal
  if (Math.abs(ang - h.pitch) > h.half) return false;
  return !blocked(o.x, o.y, px, py);
}
function samples(x, f, crouched) { return crouched ? [[x + 0.13 * f, 0.10], [x, 0.12], [x - 0.12 * f, 0.07]] : [[x + 0.14 * f, 0.16], [x, 0.20], [x - 0.12 * f, 0.10]]; }
function exposure(h, x, f, crouched, t) {
  /* amended: no binary core; geometry only */
  return exposureRaw(h, x, f, crouched, t);
}
function exposureRaw(h, x, f, crouched, t) {
  // returns { w: seen weight 0..1, d: distance, src }
  const S = samples(x, f, crouched); let lit = 0;
  for (const [px, py] of S) if (pointLitByTorch(h, px, py)) lit++;
  const o = torchOrigin(h), d = Math.hypot(x - o.x, 0.12 - o.y);
  if (lit) return { w: lit / 3, d, src: 'torch' };
  const ex = h.x, ey = h.y + R.eye;
  for (const a of AREA) if (t >= a.on[0] && x >= a.x0 && x <= a.x1 && h.face && (x - h.x) * h.face > 0 && Math.abs(x - h.x) <= R.area.range && !blocked(ex, ey, x, 0.15)) return { w: R.area.weight, d: Math.abs(x - h.x), src: 'area' };
  if ((h.face && (x - h.x) * h.face < 0 ? Math.abs(x - h.x) <= R.closeBehind : Math.abs(x - h.x) <= R.close) && S.some(([px, py]) => !blocked(ex, ey, px, py))) return { w: 1, d: Math.abs(x - h.x), src: 'close' };
  return { w: 0, d, src: '' };
}
const tFill = (d, src) => src === 'close' ? R.fill.tClose : lerp(R.fill.tNear, R.fill.tFar, clamp((d - R.fill.dNear) / (R.fill.dFar - R.fill.dNear), 0, 1));

/* ---------------- 1. hide audit: over a whole entry + 3 loops, which rabbit positions under each hide are ever lit */
const hides = [];
for (const hd of HIDES) {
  const res = [];
  for (let x = hd.x0 + R.rabbit.hw; x <= hd.x1 - R.rabbit.hw + 1e-9; x += 0.02) {
    let worst = null;
    let crouchLit = false;
    for (let t = 0; t < ENTRY_T + 3 * LOOP_T; t += 0.05) {
      const h = searcherAt(t);
      for (const f of [-1, 1]) for (const cr of [false, true]) {
        if (hd.clear < 0.245 && !cr) continue; // must crouch in a gap
        const e = exposureRaw(h, x, f, cr, t);
        if (e.w > 0 && e.src === 'torch') {
          if (h.crouch) { crouchLit = true; continue; } // the crouch-look is audited separately (its light is clipped at the core in the render)
          if (!worst || e.w > worst.w) worst = { t: +t.toFixed(2), kind: h.kind, hx: +h.x.toFixed(2), crouch: cr, w: +e.w.toFixed(2) }; }
      }
    }
    res.push({ x: +x.toFixed(2), lit: !!worst, worst, crouchLit });
  }
  const safe = res.filter(r => !r.lit).map(r => r.x);
  // contiguous safe core (centre positions)
  let best = null, cur = null;
  for (const r of res) { if (!r.lit) { if (!cur) cur = [r.x, r.x]; else cur[1] = r.x; if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur.slice(); } else cur = null; }
  const cl = res.filter(r => r.crouchLit).map(r => r.x);
  const coreOK = hd.core && best ? (hd.core[0] >= best[0] - 1e-6 && hd.core[1] <= best[1] + 1e-6) : false;
  const refugeDepth = hd.core ? +Math.min(hd.core[0] - R.rabbit.hw - hd.x0, hd.x1 - hd.core[1] - R.rabbit.hw).toFixed(2) : null;
  hides.push({ id: hd.id, span: [hd.x0, hd.x1], clear: hd.clear, core: hd.core, standingSafeCentres: best, coreInsideStandingSafe: coreOK,
    crouchLookLights: cl.length ? [cl[0], cl[cl.length - 1]] : null, coreBodyDepthFromNearerEnd: refugeDepth, refugeAfterAlert: refugeDepth != null && refugeDepth >= R.reachDepth,
    litBy: [...new Set(res.filter(r => r.lit).map(r => r.worst.kind))] });
}
fs.writeFileSync(OUT + 'hides.json', JSON.stringify(hides, null, 1));
console.log('ENTRY', ENTRY_T.toFixed(1), 's   LOOP', LOOP_T.toFixed(1), 's');
console.log('\nHIDE AUDIT (standing torch over entry + 3 loops; crouch-look reported separately)');
for (const h of hides) console.log(' ', h.id.padEnd(34), 'span', h.span.join('-'), '| core', JSON.stringify(h.core), '| standing-safe centres', h.standingSafeCentres ? h.standingSafeCentres.join('-') : 'NONE', '| core ok', h.coreInsideStandingSafe, '| crouch-look lights centres', JSON.stringify(h.crouchLookLights), '| body depth', h.coreBodyDepthFromNearerEnd, h.refugeAfterAlert ? 'REFUGE' : '', '| lit by', h.litBy.join(','));

/* ---------------- 2. scenario runner: a rabbit plan vs the searcher; suspicion per the rules */
function inCore(x) { // the binary rule: whole body inside a hide's designed dark core
  for (const h of HIDES) if (h.core && x >= h.core[0] - 1e-6 && x <= h.core[1] + 1e-6) return h.id; return null;
}
function run(name, plan, t0, x0, opts = {}) {
  // plan(t, s) -> { dir: -1|0|1, walk: bool, crouch: bool }
  const dt = 1 / 120; let x = x0, v = 0, holdT = 0, holdDir = 0, s = 0, graceT = 0, t = t0, f = 1, log = [], noticeAt = null, alertAt = null, firstLit = null, maxS = 0;
  const end = opts.until || (x => x >= 113.25);
  for (let i = 0; i < 120 * 90; i++, t += dt) {
    const p = plan(t, { x, s });
    const dir = p.dir || 0; if (dir !== holdDir) { holdDir = dir; holdT = 0; } else if (dir) holdT += dt;
    let top = R.rabbit.walk + (R.rabbit.run - R.rabbit.walk) * clamp((holdT - R.rabbit.runAfter) / R.rabbit.runRamp, 0, 1);
    if (p.walk) top = R.rabbit.walk; if (p.crouch) top = 0.75;
    const sqn = squeezing(x + dir * 0.02); if (sqn) { top = Math.min(top, SQV); if (!run._sq) { run._duck = DUCK; } }
    run._sq = sqn; if (run._duck > 0) { run._duck -= dt; top = 0; }
    v = v < dir * top ? Math.min(dir * top, v + R.rabbit.accel * dt) : Math.max(dir * top, v - 10 * dt);
    if (sqn && Math.abs(v) > SQV) v = Math.sign(v) * SQV;
    x += v * dt; if (dir) f = dir; p.crouch = p.crouch || sqn;
    const h = searcherAt(t), hidden = !samples(x, f, !!p.crouch).some(([px, py]) => !blocked(h.x, h.y + R.eye, px, py));
    const e = exposure(h, x, f, !!p.crouch, t);
    if (e.w > 0) { s += e.w / tFill(e.d, e.src) * dt; graceT = 0; if (firstLit == null) firstLit = { t: +(t - t0).toFixed(2), x: +x.toFixed(2), src: e.src, hx: +h.x.toFixed(2), kind: h.kind }; }
    else { graceT += dt; if (graceT > R.fill.grace) s = Math.max(0, s - R.fill.decay * dt); }
    maxS = Math.max(maxS, s);
    if (s >= R.fill.notice && noticeAt == null) noticeAt = { t: +(t - t0).toFixed(2), x: +x.toFixed(2) };
    const touch = !hidden && Math.abs(h.y) < 0.1 && (h.face && (x - h.x) * h.face < 0 ? Math.abs(x - h.x) <= R.touch.behind : Math.abs(x - h.x) <= R.touch.front);
    if ((s >= 1 || touch) && alertAt == null) { alertAt = { t: +(t - t0).toFixed(2), x: +x.toFixed(2), hx: +h.x.toFixed(2), d: +Math.abs(x - h.x).toFixed(2), by: touch ? 'touch' : 'light' };
      alertAt.thenFleeing = pursuit(x, h.x, opts.fleeTo ? { target: opts.fleeTo } : {}).out; break; }
    if (i % 12 === 0) log.push([+(t - t0).toFixed(2), +x.toFixed(2), +h.x.toFixed(2), h.kind, +s.toFixed(2)]);
    if (end(x)) break;
  }
  const r = { name, startT: +t0.toFixed(2), took: +(t - t0).toFixed(2), endX: +x.toFixed(2), maxSuspicion: +maxS.toFixed(2), firstLit, notice: noticeAt, alert: alertAt };
  console.log('\n' + name + '\n  ' + JSON.stringify(r));
  return { ...r, log };
}
/* loop phase helpers */
const loopStart = k => ENTRY_T + k * LOOP_T;
function phaseStart(kind, nth = 0, k = 1) { let tt = loopStart(k), n = 0; for (const s of LOOP) { if (s.kind === kind) { if (n === nth) return tt; n++; } tt += s.dur; } }
const L = LOOP.map((s, i) => ({ i, kind: s.kind, start: +(LOOP.slice(0, i).reduce((a, b) => a + b.dur, 0)).toFixed(2), dur: +s.dur.toFixed(2), x0: s.x0, x1: s.x1 }));
console.log('\nLOOP STEPS', JSON.stringify(L));

const S = [];
/* A. intended route, part 1: under the deck while the searcher looks left from above, then to the skip core */
{ const tLook = phaseStart('look', 0, 1);
  const scan = []; for (let k = -6; k <= 8; k += 1) { const r = run('  (scan) A1 leave ' + k, (t, st) => ({ dir: t > tLook + k && st.x < 106.1 ? 1 : 0 }), tLook - 8, 95.0, { until: x => x >= 106.1, fleeTo: 'gap' }); scan.push([k, r.alert ? r.alert.by + '->' + r.alert.thenFleeing : 'clean, max s ' + r.maxSuspicion]); }
  console.log('\nA1 scan (leave the deck core k s after the deck look starts -> outcome):', JSON.stringify(scan));
  S.push(run('A1  deck -> skip core during the deck look (leave 0.5 s into the look)', (t, st) => ({ dir: t > tLook + 0.5 && st.x < 106.1 ? 1 : 0 }), tLook, 95.0, { until: x => x >= 106.1 })); }
/* A2: intended route, part 2: from the skip core to the gap when the searcher walks away after the crouch-look */
{ const tW = phaseStart('walk', 1, 2); // N2 -> N3 walk starts
  const scan = []; for (let k = 0; k <= 8; k += 0.5) { const r = run('  (scan) leave ' + k + ' s after the crouch-look', (t) => ({ dir: t > tW + k ? 1 : 0 }), tW, 106.1, { fleeTo: 'gap' }); scan.push([k, r.alert ? r.alert.by + '->' + r.alert.thenFleeing : 'clean, max s ' + r.maxSuspicion]); }
  console.log('\nA2 scan (seconds after the crouch-look ends -> outcome):', JSON.stringify(scan));
  S.push(run('A2  skip core -> gap, leave 3.0 s after the crouch-look ends (searcher has walked past, back turned)', (t) => ({ dir: t > tW + 3.0 ? 1 : 0 }), tW, 106.1, { fleeTo: 'gap' })); }
/* B. impatient: leave the skip core for the gap DURING the turn-sweep at N1 */
{ const tS = phaseStart('turn-sweep', 0, 1);
  S.push(run('B   impatient: skip core -> gap as the N1 turn-sweep starts', (t) => ({ dir: 1 }), tS, 106.1, { fleeTo: 'gap' })); }
/* C. crouch-look margin: rabbit sitting in the skip's right margin (x 106.75) when the crouch-look starts, does not move */
{ const tC = phaseStart('crouch-look', 0, 1);
  S.push(run('C1  frozen in the skip margin (x 106.75) through the crouch-look', () => ({ dir: 0, crouch: true }), tC - 0.5, 106.75, { until: () => false }));
  S.push(run('C2  same, but shuffles left into the core when the searcher crouches (0.6 s after the stop)', (t, st) => ({ dir: t > tC + 0.3 + 0.6 && st.x > 106.2 ? -1 : 0, crouch: true }), tC - 0.5, 106.75, { until: () => false })); }
/* D. the first entry: rabbit lands at 87.6 and runs straight right (ignoring the cues) */
{ const d = run('D   ignores the door cue: lands 1.5 s before the cue, straight right at full run', () => ({ dir: 1 }), -1.5, 87.6, { fleeTo: 'gap' }); S.push(d); console.log('  D log (t, x, searcher x, step, s):', JSON.stringify(d.log.filter((r, i) => i % 3 === 0).slice(0, 40))); }
/* E. crosses arrival -> deck while the searcher is on the floor walking left from N2 (in range?) */
{ const tW = phaseStart('walk', 1, 1);
  S.push(run('E   arrival -> deck core while the searcher walks N2 -> N3 (facing it)', (t, st) => ({ dir: st.x < 94.5 ? 1 : 0 }), tW + 2.0, 88.9, { until: x => x >= 94.5 })); }
/* F. tailgating: follows 2 m behind the searcher walking N3 -> N1, until the N1 turn */
{ const tW = phaseStart('walk', 3, 1);
  S.push(run('F   tailgates 2-3 m behind the searcher walking N3 -> N1', (t, st) => { const h = searcherAt(t); return { dir: st.x < h.x - 2.4 ? 1 : 0 }; }, tW + 1.0, 97.0, { until: () => false })); }
/* G. arrival -> gap in one go during the deck look (too far?) */
{ const tLook = phaseStart('look', 0, 1);
  S.push(run('G   deck core -> gap in one run during the deck look', () => ({ dir: 1 }), tLook + 0.5, 95.0));
  const gs = []; for (let k = -4; k <= 4; k += 0.5) { const r = run('  (scan) G leave ' + k, (t) => ({ dir: t > tLook + k ? 1 : 0 }), tLook - 5, 95.0); gs.push([k, r.alert ? r.alert.by + '->' + r.alert.thenFleeing : 'clean, max s ' + r.maxSuspicion + ', ' + (r.took - (5 + k)).toFixed(1) + ' s']); }
  console.log('\nG scan (leave the deck core k s after the deck look starts, run to the gap):', JSON.stringify(gs)); }

/* ---------------- pursuit check: spotted at xr with the searcher at xh facing it; the rabbit flees (after 0.25 s) to the
   nearest REFUGE (deck core or the gap) that is not past the searcher, else away; returns the outcome */
function pursuit(xr, xh, opt = {}) {
  const dt = 1 / 120; let t = 0, v = 0, hv = 0, st = 'alert', stT = 0, losT = 0, visT = 0, pursueT = 0, lastSeen = xr;
  const away = Math.sign(xr - xh) || 1;
  let target = null; for (const r of REFUGES) { const c = (r.x0 + r.x1) / 2; if (Math.sign(c - xr) === away) { if (!target || Math.abs(c - xr) < Math.abs((target.x0 + target.x1) / 2 - xr)) target = r; } }
  if (opt.target) target = REFUGES.find(r => r.id === opt.target);
  const goal = target ? (target.x0 + target.x1) / 2 : xr + away * 30, gdir = Math.sign(goal - xr);
  for (let i = 0; i < 120 * 20; i++, t += dt) {
    if (opt.trace && i % 12 === 0) console.log('  tr', t.toFixed(2), 'xr', xr.toFixed(2), 'xh', xh.toFixed(2), st, 'v', v.toFixed(2), 'hv', hv.toFixed(2), target && target.id);
    if (t > REACT) { const sq = squeezing(xr + gdir * 0.02); if (sq && !pursuit._sq) pursuit._duck = DUCK; pursuit._sq = sq; if (pursuit._duck > 0) { pursuit._duck -= dt; } else { v = Math.min(sq ? SQF : R.rabbit.flee, v + R.rabbit.accel * 1.2 * dt); if (sq) v = Math.min(v, SQF); xr += gdir * v * dt; } }
    if (target && xr >= target.x0 && xr <= target.x1) return { out: 'safe in ' + target.id, t: +t.toFixed(2), state: st };
    const inC = HIDES.some(hd => hd.core && xr >= hd.core[0] && xr <= hd.core[1]);
    const o = { x: xh + R.torch.fwd * Math.sign(xr - xh), y: R.torch.h }, d = Math.abs(xr - xh);
    const vis = !inC && d <= R.torch.range && !blocked(o.x, o.y, xr, 0.2);
    if (vis) { visT += dt; losT = 0; lastSeen = xr; } else { visT = 0; losT += dt; }
    stT += dt;
    const ahead = (xr - xh) * Math.sign(lastSeen - xh || 1);
    if (!inC && st !== 'grab' && (d <= R.touch.front)) { st = 'grab'; stT = R.grab.wind - R.touch.wind; }
    if (st === 'alert') { if (stT >= R.alert) { st = d < R.grab.range ? 'grab' : (vis && d <= R.aim.max ? 'aim' : 'pursue'); stT = 0; } }
    else if (st === 'grab') { if (stT >= R.grab.wind) { const hand = xh + 0.4 * Math.sign(xr - xh); if (Math.abs(xr - hand) <= R.grab.reach && !inC) return { out: 'CAUGHT (grab)', t: +t.toFixed(2) }; st = 'pursue'; stT = 0; } }
    else if (st === 'aim') { if (losT >= R.aim.breakLOS) { st = 'lower'; stT = 0; } else if (stT >= R.aim.raise + R.aim.hold) return { out: 'SHOT', t: +t.toFixed(2), d: +d.toFixed(2) }; }
    else if (st === 'lower') { if (stT >= R.aim.lower) { st = 'pursue'; stT = 0; } }
    else if (st === 'pursue') { pursueT += dt; hv = Math.min(R.runSpeed, hv + R.runAccel * dt); xh += Math.sign(lastSeen - xh) * hv * dt;
      if (Math.abs(xr - xh) < 1.2 && !inC) { st = 'grab'; stT = R.grab.wind - 0.3; hv = 0; }
      else if (pursueT >= 1.0 && visT >= 0.4 && d >= R.aim.min && d <= R.aim.max) { st = 'aim'; stT = 0; hv = 0; } }
  }
  return { out: 'still running', t: 20 };
}
const PM = [];
for (const [lbl, dxh] of [['searcher 2 m behind', -2], ['searcher 4 m behind', -4], ['searcher 7 m behind', -7], ['searcher 3 m ahead (rabbit runs back)', 3]]) {
  const row = []; for (let xr = 89; xr <= 112; xr += 1) { if (HIDES.some(hd => hd.core && xr >= hd.core[0] && xr <= hd.core[1])) { row.push([xr, 'core']); continue; } const r = pursuit(xr, xr + dxh); row.push([xr, r.out.startsWith('safe') ? 'ok' : r.out]); }
  PM.push({ lbl, row }); console.log('\nPURSUIT from x (spotted, flees at once):', lbl, '\n  ' + row.map(([x, o]) => x + ':' + (o === 'ok' ? 'ok' : o === 'core' ? '·' : o.replace('CAUGHT (grab)', 'GRAB'))).join(' '));
}
fs.writeFileSync(OUT + 'pursuit.json', JSON.stringify(PM, null, 1));
if (process.env.TR) { const [a,b]=process.env.TR.split(',').map(Number); console.log('TRACE', JSON.stringify(pursuit(a,b,{trace:1}))); }
console.log('\nexample: spotted at 109 with the searcher at 106, flees to the gap:', JSON.stringify(pursuit(109, 106)));
console.log('example: spotted at 100 with the searcher at 104 (ahead), flees back to the deck:', JSON.stringify(pursuit(100, 104)));
console.log('example: spotted at 100, searcher 4 m behind at 96, flees to the gap 13 m:', JSON.stringify(pursuit(100, 96)));
console.log('example: frozen (does not flee) at 103, searcher at 98:', JSON.stringify((() => { const save = R.rabbit.flee; R.rabbit.flee = 0; const r = pursuit(103, 98); R.rabbit.flee = save; return r; })()));

/* worst-case fairness numbers */
const fair = {
  cueToTorch_entry: 2.5 + 1.0,
  litToNotice_near: +(R.fill.notice * R.fill.tNear).toFixed(2), litToAlert_near: R.fill.tNear, litToAlert_far: R.fill.tFar,
  alertToShot: +(R.alert + R.aim.raise + R.aim.hold).toFixed(2), alertToGrab: +(R.alert + R.grab.wind).toFixed(2),
  fleeVsRun: [R.rabbit.flee, R.runSpeed],
};
console.log('\nFAIRNESS NUMBERS', JSON.stringify(fair));
fs.writeFileSync(OUT + 'scenarios.json', JSON.stringify(S.map(({ log, ...r }) => r), null, 1));

/* ---------------- 3. x-t diagram (SVG): lit lane per time over entry + one loop, hides, routes */
{
  const X0 = 85.5, X1 = 114.5, T1 = ENTRY_T + LOOP_T, W = 1100, H = 1400, ml = 70, mr = 260, mt = 70, mb = 40;
  const sx = x => ml + (x - X0) / (X1 - X0) * (W - ml - mr), st = t => mt + t / T1 * (H - mt - mb);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica,Arial,sans-serif" font-size="12">\n<rect width="100%" height="100%" fill="#14181c"/>\n`;
  svg += `<text x="${ml}" y="26" fill="#e4e8ec" font-size="17" font-weight="bold">The Search: where the searcher's light reaches the lane, over time</text>\n`;
  svg += `<text x="${ml}" y="46" fill="#9aa6b2" font-size="12">x = position along the lane (m), time runs down (s). Amber = a standing rabbit there would be lit by the torch. Grey bands = hides; green = audited safe cores.</text>\n`;
  for (const hd of hides) { svg += `<rect x="${sx(hd.span[0])}" y="${mt}" width="${sx(hd.span[1]) - sx(hd.span[0])}" height="${H - mt - mb}" fill="#3a4450" opacity="0.55"/>\n`;
    if (hd.core) svg += `<rect x="${sx(hd.core[0] - 0.16)}" y="${mt}" width="${sx(hd.core[1] + 0.16) - sx(hd.core[0] - 0.16)}" height="${H - mt - mb}" fill="#5f9e72" opacity="0.30"/>\n`; }
  const dt = 0.1, dx = 0.1;
  for (let t = 0; t < T1; t += dt) { const h = searcherAt(t); let runStart = null;
    for (let x = X0; x <= X1 + 1e-9; x += dx) { const e = exposure(h, x, 1, x > 112.9, t), lit = e.w > 0 && e.src === 'torch';
      const insideHide = HIDES.some(hd => x >= hd.x0 && x <= hd.x1);
      if (lit && runStart == null) runStart = x; if ((!lit || x + dx > X1) && runStart != null) { svg += `<rect x="${sx(runStart)}" y="${st(t)}" width="${Math.max(1, sx(x) - sx(runStart))}" height="${st(t + dt) - st(t) + 0.3}" fill="${insideHide ? '#ffb347' : '#e8b860'}" opacity="${insideHide ? 0.95 : 0.55}"/>`; runStart = null; } }
    svg += '\n'; }
  // searcher path
  let path = ''; for (let t = 0; t < T1; t += 0.1) { const h = searcherAt(t); path += (path ? 'L' : 'M') + sx(h.x).toFixed(1) + ' ' + st(t).toFixed(1); }
  svg += `<path d="${path}" stroke="#f0f0f0" stroke-width="2.2" fill="none"/>\n`;
  // phase labels
  let tt = 0; for (const s of [...ENTRY, ...LOOP]) { svg += `<line x1="${W - mr + 6}" y1="${st(tt)}" x2="${W - 10}" y2="${st(tt)}" stroke="#39424c"/><text x="${W - mr + 10}" y="${st(tt) + 14}" fill="#c6ced6" font-size="11">${tt.toFixed(1)} s  ${s.kind}${s.kind.startsWith('walk') ? ' ' + s.x0 + '→' + s.x1 : ''}</text>\n`; tt += s.dur; }
  // axis
  for (let x = 86; x <= 114; x += 2) svg += `<line x1="${sx(x)}" y1="${mt - 6}" x2="${sx(x)}" y2="${H - mb}" stroke="#2a3138" stroke-width="0.6"/><text x="${sx(x) - 9}" y="${mt - 10}" fill="#9aa6b2" font-size="10">${x}</text>\n`;
  for (let t = 0; t <= T1; t += 5) svg += `<text x="${ml - 40}" y="${st(t) + 4}" fill="#9aa6b2" font-size="10">${t} s</text><line x1="${ml - 6}" y1="${st(t)}" x2="${ml}" y2="${st(t)}" stroke="#9aa6b2"/>\n`;
  // labels for hides
  const lab = [['A0', 88.9], ['deck-A', 95.0], ['pallet-B', 102.0], ['skip-C', 106.1], ['gap', 113.25]];
  for (const [n, x] of lab) svg += `<text x="${sx(x) - n.length * 3.2}" y="${H - mb + 16}" fill="#c6ced6" font-size="11">${n}</text>\n`;
  // the intended route (A1 then A2) drawn on the loop's timeline
  const route = (sc, col) => { let p = ''; for (const [rt, rx] of sc.log) { const T = sc.startT + rt - ENTRY_T - LOOP_T + ENTRY_T; const tl = T; if (tl < 0 || tl > T1) continue; p += (p ? 'L' : 'M') + sx(rx).toFixed(1) + ' ' + st(tl).toFixed(1); } return p ? `<path d="${p}" stroke="${col}" stroke-width="3" fill="none" stroke-dasharray="6 3"/>\n` : ''; };
  svg += route(S[0], '#7fe0a0'); svg += route(S[1].startT - LOOP_T > 0 ? { ...S[1], startT: S[1].startT - LOOP_T } : S[1], '#7fe0a0');
  svg += `<text x="${ml}" y="${H - 8}" fill="#7fe0a0" font-size="12">green dashes: the intended route (deck → skip core during the deck look; skip core → gap after the crouch-look). White: the searcher.</text>\n`;
  svg += '</svg>\n';
  fs.writeFileSync(OUT + 'search-xt.svg', svg);
  console.log('\nwrote', OUT + 'search-xt.svg');
}
