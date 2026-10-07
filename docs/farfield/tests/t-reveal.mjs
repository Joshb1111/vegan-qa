// The door reveal (Josh's playtest, 7 Oct §9.5) through the REAL input path (CDP key events into the page's own listeners),
// frames stepped via __ff. node t-reveal.mjs [scenario ...] (PORT as lib.mjs). Writes out/t-reveal.json, out/reveal-*.jpg;
// SHOTS=1 takes the shots, PROGRESS_DIR (+ PROGRESS_LABEL, default 'reveal') copies them as progress shots.
// Scenarios: still, cautious, hold (forward held from inside the duct: the son's case), run (Shift), jump (a running jump into
// the trigger), hops, fullpath (box, climb, forward held), smooth (the lens path), unseen (the no-detection guarantee),
// autorepeat, midskirt, quickrepress, retry (caught after it: no replay), restartMid, restartGrace (pause -> Restart).
import { boot, sleep, OUT as OUT0 } from './lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname), OUT = OUT0;
const PROG = process.env.PROGRESS_DIR || null, PLABEL = process.env.PROGRESS_LABEL || 'reveal';
const q = process.env.Q || 'q=high&seed=1&mute=1&clean=1';
const b = await boot({ q });
const ev = (e, to) => b.ev(e, to);
const U = (expr, sec) => ev(`RT.until(${JSON.stringify(expr)}, ${sec || 20})`);
const K = keys => b.setKeys(keys);
const tap = async k => { await b.key(k, 'down'); await ev('__ff.step(1, false); true'); await b.key(k, 'up'); };
let shotN = 0;
async function SH(scen, name, progress) {
  await ev('__ff.draw(); true'); const f = path.join(OUT, `reveal-${scen}-${name}.jpg`); await b.shot(f, 80);
  if (progress && PROG) { fs.mkdirSync(PROG, { recursive: true }); const dst = path.join(PROG, `${PLABEL}-${String(++shotN).padStart(2, '0')}-${progress}.jpg`); fs.copyFileSync(f, dst); console.log('  shot', path.basename(dst), fs.statSync(dst).size); }
  return f;
}
async function fresh() {
  await b.nav('/farfield/index.html?' + q, 'window.__ff && __ff.ready === true', 120000); await sleep(200);
  await ev('__ff.pause(); true'); b.held = new Set();
  await ev(fs.readFileSync(path.join(DIR, 'reveal-page.js'), 'utf8'));
  return ev('RT.toBox()');
}
/* climb in from the box with Up (holding `during` through the duct), then step until the rabbit has landed in the yard */
async function arrive(during) {
  await tap('ArrowUp');
  if (during && during.length) { await U("r.mode === 'transit'", 3); await K(during); }
  return U("W.landT != null && r.mode === 'play'", 12);
}
/* after control is back: does a key held through the takeover move the rabbit? then let go and press again */
async function afterControl(R, onHeld) {
  const a = await U("R.phase === 'grace' || (R.phase === '' && R.done)", 15); R.controlState = a;
  const b1 = await U('false', 1.0); if (onHeld) await onHeld(); R.heldOneSecondLater = { x: b1.x, vx: b1.vx, latched: b1.latched, rv: b1.rv, s: b1.s };
  R.heldMoved = +(b1.x - a.x).toFixed(3);
  await K([]); await U('false', 0.25);
  await K(['ArrowRight']); const c = await U('false', 0.6); R.repress = { x: c.x, vx: c.vx, moved: +(c.x - b1.x).toFixed(3) };
  await K([]); await U('Math.abs(r.vx) < 0.02', 2);
}
async function summary(R) {
  R.log = await ev('RT.log()'); R.W = await ev('({ ev: RT.W.ev.filter(e => !/rabbit:jump/.test(e[1])), maxS: RT.W.maxS, maxSTake: RT.W.maxSTake, litTake: RT.W.litTake, minDist: RT.W.minDist, states: RT.W.states, landT: RT.W.landT, cam: { maxDxPerFrame: +RT.W.camMaxDx.toFixed(4), maxDdistPerFrame: +RT.W.camMaxDd.toFixed(4), maxAccPerFrame: +RT.W.camMaxAcc.toFixed(4) }, camPath: RT.W.camPath.filter((_, i) => i % 6 === 0) })');
  R.reveal = await ev('FF.Events.reveal()'); R.errors = await ev('FF.errors.slice()'); R.errs = b.errs.splice(0);
  const L = R.log || {}, t0 = L.t0, land = R.W.landT;
  const rel = k => L[k] ? L[k].t : null;
  R.timing = { cause: L.cause, startAfterLanding: t0 != null && land != null ? +(t0 - land).toFixed(3) : null, startX: L.start && L.start.x, startVx: L.start && L.start.vx, startGrounded: L.start && L.start.grounded,
    cue: rel('cue'), stopped: rel('stopped'), stopX: L.stopped && L.stopped.x, maxX: R.reveal.maxX, pan: rel('pan'), ret: rel('return'), control: rel('control'), end: rel('end'),
    controlFromCue: L.control && L.cue ? +(L.control.t - L.cue.t).toFixed(3) : null, pose: Object.keys(L).filter(k => k.startsWith('pose:')).join(','), latched: L.control && L.control.latched };
}
const SC = {
  /* no input at all: the cue starts it */
  async still(R) { await fresh(); await arrive(); R.cpAfterLanding = await ev('__ff.G.checkpoint'); await afterControl(R); },
  /* a cautious walk: arrow only from 0.3 s after landing until the takeover starts (then lets go, as a careful player would) */
  async cautious(R) {
    await fresh(); await arrive(); await U('false', 0.3); await K(['ArrowRight']);
    await U("R.phase !== ''", 10); await K([]);
    const a = await U("R.phase === 'grace'", 15); R.controlState = a;
    await K(['ArrowRight']); const c = await U('false', 0.6); R.repress = { moved: +(c.x - a.x).toFixed(3) }; await K([]);
  },
  /* the son: forward held from inside the duct, continuously, through the takeover and 1 s past control returning */
  async hold(R, shots) {
    await fresh(); const ar = await arrive(['ArrowRight']); R.landing = ar;
    if (shots) {
      await U("R.phase !== ''", 5); await U("Math.abs(r.vx) < 0.05 && r.grounded", 2);
      await U("s.entryT != null && s.entryT >= 0.12", 3); await SH('hold', 'a-stopped-listens', 'stopped-listens');
      await U("s.entryT >= 0.55", 3); await SH('hold', 'a2-pan-starts', null);
      await U("s.entryT >= 1.28", 3); await SH('hold', 'b-door-light', 'door-light');
      await U("s.entryT >= 1.8", 3); await SH('hold', 'c-doorway', 'man-in-doorway');
      await U("s.entryT >= 2.75", 3); await SH('hold', 'd-steps-out', 'man-steps-out');
      await U("s.entryT >= 4.6", 3); await SH('hold', 'e-aim-gap', 'aim-lights-gap');
      await U("R.phase === 'return' && FF.Camera.debug().x < 100", 3); await SH('hold', 'f-return', 'camera-returns');
    }
    await afterControl(R, shots ? () => SH('hold', 'g-control-back', 'control-back-1s-forward-still-held-latched') : null);
  },
  /* Shift + forward from inside the duct: a run into the trigger */
  async run(R, shots) {
    await fresh(); await arrive(['ShiftLeft', 'ArrowRight']);
    if (shots) { await U("R.phase !== ''", 5); await U("s.entryT != null && s.entryT >= 0.25", 3); await SH('run', 'a-stopped-sits-up', 'run-stops-sits-up-to-listen'); }
    await afterControl(R);
  },
  /* a running jump into the trigger: Shift + forward, Space just as it clears the shelf's skirt, everything kept held */
  async jump(R) {
    await fresh(); await arrive(['ShiftLeft', 'ArrowRight']);
    const j = await U("r.x >= 89.97 || R.phase !== ''", 4); R.jumpAt = j;
    await K(['ShiftLeft', 'ArrowRight', 'Space']);
    await afterControl(R);
  },
  /* forward held and Space tapped every 0.35 s from landing to 1 s after control returns */
  async hops(R) {
    await fresh(); await arrive(['ArrowRight', 'ShiftLeft']);
    for (let i = 0; i < 40; i++) { await K(['ArrowRight', 'ShiftLeft', 'Space']); await U('false', 0.12); await K(['ArrowRight', 'ShiftLeft']); const s = await U('false', 0.23); if (s.rv === 'grace') break; }
    await afterControl(R);
  },
  /* the whole real path from the Courtyard checkpoint: push the box to the kerb, hop on, Up into the duct, then forward held
     from inside the duct through the reveal (the son's case, without the test shortcut onto the box) */
  async fullpath(R) {
    await fresh(); await ev("__ff.warp('courtyard'); true");
    await K(['ArrowRight']); const p = await U('G.box.x >= 76.05', 40); R.pushed = { ok: p.ok, t: p.t };
    await K([]); await U('false', 0.3);
    await K(['ArrowRight', 'Space']); await U('false', 0.22); await K(['ArrowRight']); const on = await U('r.onBox && r.grounded', 3); R.onBox = on.ok;
    await K([]); await U('false', 0.2);
    await tap('ArrowUp'); const c = await U("r.mode === 'climb' || r.mode === 'transit'", 3); R.climb = c.ok;
    await K(['ArrowRight']); await U("W.landT != null && r.mode === 'play'", 12);
    R.walkway = await ev('FF.Events.debug().walkway');
    await afterControl(R);
  },
  /* the lens path, presented frame by presented frame, through one uninterrupted takeover (speed and acceleration) */
  async smooth(R) {
    await fresh(); await arrive(['ShiftLeft', 'ArrowRight']); await U("R.phase === 'grace'", 15);
    const F = await ev('RT.W.frames'); let vmax = 0, amax = 0, prev = null, jumps = 0;
    for (let i = 1; i < F.length; i++) { const dt = F[i][0] - F[i - 1][0]; if (dt <= 0) continue; const v = (F[i][1] - F[i - 1][1]) / dt; if (prev != null) { const a = Math.abs(v - prev.v) / dt; amax = Math.max(amax, a); if (Math.abs(v - prev.v) > 3) jumps++; } vmax = Math.max(vmax, Math.abs(v)); prev = { v }; }
    R.smooth = { frames: F.length, peakSpeed: +vmax.toFixed(2), peakAccel: +amax.toFixed(1), velocityJumpsOver3: jumps, dtFrames: [...new Set(F.slice(1).map((f, i) => +(f[0] - F[i][0]).toFixed(4)))] };
  },
  /* the guarantee: with G.flags.revealSafe set, a rabbit standing in his torch 3 m in front of him is not seen; cleared, it is */
  async unseen(R) {
    await fresh(); await ev("__ff.warp({ id: 't', x: 104.0, y: 0, face: 1 }); FF.AI.setLoopT(5.6); __ff.G.flags.revealSafe = true; true");
    const a = await U('false', 3.0); R.protected3s = { s: a.s, ai: a.ai, x: a.x, pts: await ev('FF.Player.sightPoints()') };
    await ev('delete __ff.G.flags.revealSafe; true'); const b2 = await U("s.state !== 'patrol'", 3.0); R.unprotected = { s: b2.s, ai: b2.ai, t: b2.t - a.t };
  },
  /* a run-up from the left and a jump onto the shelf top, then a run along it and off the end (the highest, fastest approach) */
  async shelf(R) {
    await fresh(); await arrive();
    await K(['ArrowLeft']); await U('r.x <= 86.35', 4); await K([]); await U('Math.abs(r.vx) < 0.02', 1);
    await K(['ShiftLeft', 'ArrowRight']); const a = await U("r.x >= 87.45 || R.phase !== ''", 3); R.jumpAt = a;
    await K(['ShiftLeft', 'ArrowRight', 'Space']); await U('false', 0.2); await K(['ShiftLeft', 'ArrowRight']);
    const top = await U("r.x >= 89.75 || R.phase !== ''", 3); R.shelfEnd = top;
    await K(['ShiftLeft', 'ArrowRight', 'Space']);
    await afterControl(R);
  },
  /* a real keyboard's auto-repeat while forward is held: repeated keydown events must not undo the latch */
  async autorepeat(R) {
    await fresh(); await arrive(['ArrowRight']);
    await U("R.phase === 'grace'", 15); const a = await ev('RT.state()');
    for (let i = 0; i < 30; i++) { await b.cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'ArrowRight', key: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39, autoRepeat: true }); await U('false', 1 / 30); }
    const c = await ev('RT.state()'); R.autoRepeat = { moved: +(c.x - a.x).toFixed(3), latched: c.latched, vx: c.vx };
    await K([]);
  },
  /* the cue lands while the rabbit is ducking under the shelf's skirt (0.20 m): it stops there, crouched, no pose forced */
  async midskirt(R) {
    R.tries = [];
    for (const d of [0.3, 0.4, 0.5, 0.6]) {
      await fresh(); await arrive(); await U('false', d); await K(['ShiftLeft', 'ArrowRight']);
      const a = await U("R.phase !== ''", 4); const sq = await ev('({ sq: FF.Player.debug().squeeze, crouch: __ff.G.rabbit.crouch })');
      const c = await U("R.phase === 'grace'", 15); await K([]); await U('false', 0.2);
      await K(['ArrowRight']); const m = await U('false', 0.8); await K([]);
      const L = await ev('RT.log()');
      R.tries.push({ delay: d, cause: a.cause, startX: a.x, squeeze: sq.sq, crouch: sq.crouch, stopX: L.stopped && L.stopped.x, pose: Object.keys(L).filter(k => k.startsWith('pose:')).join(',') || '-', controlFromCue: L.control && L.cue ? +(L.control.t - L.cue.t).toFixed(2) : null, movedAfter: +(m.x - c.x).toFixed(3) });
    }
  },
  /* a release and a fresh press that land inside one fixed step (a bot, or very fast fingers) end the latch too */
  async quickrepress(R) {
    await fresh(); await arrive(['ArrowRight']); await U("R.phase === 'grace'", 15); const a = await U('false', 0.5);
    await b.key('ArrowRight', 'up'); await b.key('ArrowRight', 'down');      // no step in between
    const c = await U('false', 0.5); R.quick = { latchedBefore: a.latched, moved: +(c.x - a.x).toFixed(3), latchedAfter: c.latched };
    await b.key('ArrowRight', 'up'); b.held = new Set();
  },
  /* after the reveal: walk out from the deck into his torch, get caught or shot, restart: the reveal must not replay */
  async retry(R) {
    await fresh(); await arrive(); await U("R.phase === '' && R.done", 15);
    await K(['ArrowRight']); await U('r.x >= 99.5', 15); await K([]);
    const f = await U("W.ev.some(e => e[1] === 'fail')", 40); R.failState = f;
    const fT = await ev("RT.W.ev.find(e => e[1] === 'fail')[0]");
    const back = await U('G.control && G.fade < 0.01', 5); R.after = back; R.controlAfterFail = +(back.t - fT).toFixed(3);
    await U('false', 6); R.later = await ev('RT.state()');
    R.revealStartsAfterFail = await ev(`RT.W.ev.filter(e => e[1] === 'reveal' && e[0] > ${fT}).length`);
    R.entryReplayed = await ev(`RT.W.ev.filter(e => e[1] === 'entry' && e[2] === 'cue' && e[0] > ${fT}).length`);
  },
  /* the pause menu's Restart in the middle of the takeover: control comes back, the reveal plays once more in full (never seen) */
  async restartMid(R) {
    await fresh(); await arrive(); await K(['ArrowRight']); await U('r.x >= 88.45', 3); await K([]); R.cpBefore = (await U("G.checkpoint === 'search-arrive'", 1)).cp;
    await U("s.entryT != null && s.entryT >= 2.0", 6);
    await b.key('Escape'); await ev('__ff.step(1); true'); R.paused = await ev('__ff.G.mode');
    await ev("__ff.command('restart'); true"); const a = await U('false', 0.2); R.afterRestart = a;
    const c = await U("R.phase === 'grace'", 15); R.second = { ok: c.ok, cause: c.cause, cp: c.cp, controlFromCue: (await ev('RT.log()')).control && +((await ev('RT.log()')).control.t - (await ev('RT.log()')).cue.t).toFixed(2) };
  },
  /* the pause menu's Restart during the grace (entry not yet finished): the entry replays with NO takeover, a 1 s lean only */
  async restartGrace(R) {
    await fresh(); await arrive(); await K(['ArrowRight']); await U('r.x >= 88.45', 3); await K([]); R.cpBefore = (await U("G.checkpoint === 'search-arrive'", 1)).cp;
    await U("R.phase === 'grace'", 15); await U('false', 0.3);
    await b.key('Escape'); await ev('__ff.step(1); true'); await ev("__ff.command('restart'); true");
    const t0 = (await ev('RT.state()')).t;
    let maxCtlOff = 0, ctlOffT = 0, maxCamDx = 0;
    for (let i = 0; i < 80; i++) { const s = await U('false', 0.1); if (!s.control) ctlOffT += 0.1; maxCamDx = Math.max(maxCamDx, Math.abs(s.cam.x - s.x)); }
    R.replay = { controlOffSeconds: +ctlOffT.toFixed(2), maxCameraLeadFromRabbit: +maxCamDx.toFixed(2), reveals: await ev(`RT.W.ev.filter(e => e[1] === 'reveal' && e[0] > ${t0}).map(e => e[2])`), cues: await ev(`RT.W.ev.filter(e => e[1] === 'entry' && e[0] > ${t0}).map(e => e[2])`) };
  },
};
const names = process.argv.slice(2).filter(n => SC[n]); if (!names.length) names.push(...Object.keys(SC).filter(n => n !== 'shelf'));
const ALL = {};
for (const n of names) {
  const R = ALL[n] = {};
  try { await SC[n](R, !!process.env.SHOTS && (n === 'hold' || n === 'run')); } catch (e) { R.err = e.message; }
  try { await K([]); await summary(R); } catch (e) { R.err = (R.err || '') + ' | ' + e.message; }
  console.log('\n==', n, JSON.stringify({ timing: R.timing, heldMoved: R.heldMoved, held1s: R.heldOneSecondLater, repress: R.repress, maxSTake: R.W && R.W.maxSTake, cam: R.W && R.W.cam, minDist: R.W && R.W.minDist, err: R.err, errors: R.errors, errs: R.errs, extra: { cpBefore: R.cpBefore, afterRestart: R.afterRestart && [R.afterRestart.cp, R.afterRestart.control, R.afterRestart.ai], jumpAt: R.jumpAt && R.jumpAt.x, shelfEnd: R.shelfEnd && [R.shelfEnd.x, R.shelfEnd.y], autoRepeat: R.autoRepeat, controlAfterFail: R.controlAfterFail, revealStartsAfterFail: R.revealStartsAfterFail, entryReplayed: R.entryReplayed, after: R.after && [R.after.cp, R.after.ai, R.after.loopT], second: R.second, tries: R.tries, quick: R.quick, replay: R.replay, protected3s: R.protected3s, pushed: R.pushed, onBox: R.onBox, climb: R.climb, walkway: R.walkway, smooth: R.smooth, unprotected: R.unprotected } }));
}
fs.writeFileSync(path.join(OUT, 't-reveal.json'), JSON.stringify(ALL, null, 1));
b.close(); process.exit(0);
