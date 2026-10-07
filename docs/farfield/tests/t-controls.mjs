// Controls, crouch and gait (Josh's playtest, 7 Oct §9.1-9.3). Real input path: CDP key events -> the page's keydown/keyup ->
// FF.Input (Shift = the 'run' action). The game is stepped by hand (__ff.tick), sampled in-page. node t-controls.mjs
// (PORT as lib.mjs). Writes out/t-controls.json and out/controls-*.jpg (PROGRESS_DIR copies the progress shots).
import { boot, sleep, OUT } from './lib.mjs';
import fs from 'node:fs'; import path from 'node:path';
const PROG = process.env.PROGRESS_DIR || null;
const R = { checks: [] };
const ck = (name, ok, info) => { R.checks.push({ name, ok: !!ok, info }); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(info)); };
const b = await boot({ q: 'q=high&seed=1&mute=1' });
async function shot(name, prog) {
  const f = path.join(OUT, name + '.jpg'); await b.shot(f, 80);
  if (prog && PROG) { fs.mkdirSync(PROG, { recursive: true }); fs.copyFileSync(f, path.join(PROG, prog)); }
  return f;
}
/* in-page sampler: tick n steps, record every k */
await b.ev(`window.__T = {
  s() { const g = FF.G, r = g.rabbit, p = FF.Player.debug(), ui = FF.UI.debug();
    return { t: +g.t.toFixed(3), x: +r.x.toFixed(5), y: +r.y.toFixed(3), gr: !!r.grounded, vx: +r.vx.toFixed(3), run: p.run, crouch: !!r.crouch, held: p.crouchHeld, cF: p.crouchF, cR: p.crouchR, sq: p.sq,
      g: p.gait, pose: p.pose, mood: p.mood, low: p.low, hint: ui.hint, place: g.place, sr: g.searcher && g.searcher.active ? g.searcher.state : null, mode: g.mode, control: g.control }; },
  tick(n, k) { const out = []; for (let i = 0; i < n; i++) { __ff.tick(); if (!k || i % k === 0) out.push(this.s()); } __ff.flush(); __ff.draw(); return out; },
  until(pred, max, k) { const out = []; for (let i = 0; i < max; i++) { __ff.tick(); const s = this.s(); if (!k || i % k === 0) out.push(s); if (pred(s)) { out.push(s); break; } } __ff.flush(); __ff.draw(); return out; },
  steps: [], hints: [] };
FF.bus.on('rabbit:step', d => __T.steps.push({ t: FF.G.t, x: d.x, gait: d.gait, run: d.run }));
FF.bus.on('hint', d => __T.hints.push({ t: FF.G.t, arg: d.arg, x: d.x }));
true`);
const T = (n, k) => b.ev(`__T.tick(${n}, ${k || 0})`);
const U = (pred, max, k) => b.ev(`__T.until(s => (${pred}), ${max}, ${k || 0})`);
const down = k => b.key(k, 'down'), up = k => b.key(k, 'up');
try {
  /* ---- the notice -> the title: the controls line */
  await T(4); await down('Enter'); await up('Enter'); await T(30);
  R.title = await b.ev(`(() => { const e = document.querySelector('#ui .title .keys'); return { mode: __ff.G.mode, keys: e ? e.textContent.replace(/\\s+/g, ' ').trim() : null } })()`);
  ck('title shows the new controls line', R.title.mode === 'title' && /← ?→ move · Shift run · Space jump · ↓ crouch/.test(R.title.keys), R.title);
  await T(120); await shot('controls-title', 'controls-01-title-keys.jpg');

  /* ---- the first arrow starts play and walks: a direction alone never speeds up (6 s held) */
  await down('ArrowRight');
  const walk = await T(120 * 6, 6);
  const vmax = Math.max(...walk.map(s => s.vx)), plateau = walk.filter(s => s.t > walk[0].t + 1).map(s => s.vx);
  R.walk = { vmax, plateauMin: Math.min(...plateau), plateauMax: Math.max(...plateau), x0: walk[0].x, x1: walk.at(-1).x, mode: walk.at(-1).mode };
  ck('a held direction walks at the cautious pace and never ramps up (6 s)', R.walk.mode === 'play' && vmax <= 0.951 && R.walk.plateauMin >= 0.94, R.walk);
  const reach95 = walk.find(s => s.vx >= 0.9); R.walk.t90 = reach95 ? +(reach95.t - walk[0].t).toFixed(3) : null;
  ck('the walk is responsive (0.9 m/s within 0.25 s)', R.walk.t90 != null && R.walk.t90 <= 0.25, R.walk.t90);
  /* gait: the phase follows distance (dphase * stride == dx every fixed step: no sliding), one footstep per stride */
  const wfine = await T(120, 1);
  const wsteps = await b.ev(`__T.steps.filter(s => s.t > ${walk[0].t + 1}).length`), wdist = wfine.at(-1).x - walk.find(s => s.t > walk[0].t + 1).x;
  let worst = 0; for (let i = 1; i < wfine.length; i++) { const a = wfine[i - 1], c = wfine[i]; if (!a.g || !c.g || a.g.name !== 'walk' || c.g.name !== 'walk') continue; let dp = c.g.phase - a.g.phase; if (dp < 0) dp += 1; const dx = c.x - a.x; worst = Math.max(worst, Math.abs(dp * (a.g.stride + c.g.stride) / 2 - dx)); }
  R.walkGait = { stride: walk.at(-1).g.stride, cadence: walk.at(-1).g.cadence, stepsPerM: +(wsteps / wdist).toFixed(3), expectPerM: +(1 / walk.at(-1).g.stride).toFixed(3), phaseVsDistWorst: +worst.toFixed(5),
    liftMax: [Math.max(...walk.map(s => s.g.lift[0])), Math.max(...walk.map(s => s.g.lift[1]))], liftMin: [Math.min(...walk.map(s => s.g.lift[0])), Math.min(...walk.map(s => s.g.lift[1]))] };
  ck('walk gait: phase advances with distance (|dphase*stride - dx| < 1 mm)', worst < 0.001, R.walkGait);
  ck('walk gait: one footstep per stride', Math.abs(R.walkGait.stepsPerM - R.walkGait.expectPerM) < 0.35, R.walkGait);

  /* ---- on to the post: hop it, then into the safe stretch: the one Shift-run hint */
  /* a first-timer walks up to the post and hops it from there (a standing hop lands on its top; no precise timing) */
  let s = await U('s.x >= 10.6 && s.vx < 0.05', 120 * 8); R.post = { stoppedAt: s.at(-1).x, pose: s.at(-1).pose };
  await down('Space'); R.post.air = (await T(24, 4)).map(q => [q.x, q.y, q.vx, q.gr, q.mode, q.control].join(' ')); await up('Space');
  R.post.input = await b.ev(`({ jump: FF.Input.down('jump'), right: FF.Input.down('right'), ctl: __ff.G.control, mode: __ff.G.mode, rmode: __ff.G.rabbit.mode, inv: FF.Player.debug().inv, locked: FF.Player.debug().locked, frozen: FF.Player.debug().frozen })`);
  s = await U('s.x >= 11.4 && s.gr', 120 * 4); R.post.over = s.at(-1).x >= 11.4; R.post.after = s.filter((q, i) => i % 4 === 0).slice(0, 30).map(q => [q.x, q.y, q.vx, q.gr, q.pose].join(' '));
  ck('the post: walk into it, hop, over', R.post.over, R.post);
  const hint = await U("s.hint === 'run' || s.x >= 20.4", 120 * 12);
  R.hint = { shownAt: hint.at(-1).hint === 'run' ? hint.at(-1).x : null, events: await b.ev('__T.hints') };
  ck('the "Shift run" hint shows once in the safe stretch of the Verge (x 13-20.5)', R.hint.shownAt != null && R.hint.shownAt >= 13 && R.hint.shownAt <= 20.5, R.hint);
  R.hint.text = await b.ev(`document.querySelector('#ui .hint').textContent`);
  await T(40); await shot('controls-hint', 'controls-02-shift-run-hint.jpg');

  /* ---- Shift + direction runs; releasing Shift drops back to the walk at once */
  await down('ShiftLeft');
  const run = await U('s.x >= 15.6', 120 * 4, 1);
  await up('ShiftLeft');
  const back = await T(60, 1);
  const rmax = Math.max(...run.map(s => s.vx)), r95 = run.find(s => s.vx >= 2.6);
  R.run = { vmax: rmax, t95: r95 ? +(r95.t - run[0].t).toFixed(3) : null, backTo: back.at(-1).vx, backT: (() => { const q = back.find(s => s.vx <= 0.96); return q ? +(q.t - back[0].t).toFixed(3) : null; })(), gait: run.at(-1).g };
  ck('Shift + direction runs at 2.75 m/s (reached within 0.6 s)', Math.abs(rmax - 2.75) < 0.01 && R.run.t95 != null && R.run.t95 <= 0.6, R.run);
  ck('releasing Shift returns to the walk within 0.25 s', R.run.backTo <= 0.951 && R.run.backT != null && R.run.backT <= 0.25, R.run);
  R.hintAfterRun = await b.ev('FF.UI.debug().hint');
  ck('the "Shift run" hint goes once Shift has been used (v2 review)', R.hintAfterRun == null, R.hintAfterRun);
  let rworst = 0; for (let i = 1; i < run.length; i++) { const a = run[i - 1], c = run[i]; if (!a.g || !c.g || a.g.name !== 'run' || c.g.name !== 'run') continue; let dp = c.g.phase - a.g.phase; if (dp < 0) dp += 1; rworst = Math.max(rworst, Math.abs(dp * (a.g.stride + c.g.stride) / 2 - (c.x - a.x))); }
  R.runGait = { stride: R.run.gait.stride, cadence: R.run.gait.cadence, phaseVsDistWorst: +rworst.toFixed(5), liftMax: [Math.max(...run.map(s => s.g.lift[0])), Math.max(...run.map(s => s.g.lift[1]))], names: [...new Set(run.map(s => s.g.name))] };
  ck('run gait is a distinct cycle (longer stride, more lift) and follows distance', rworst < 0.002 && R.runGait.stride > 1.8 * R.walkGait.stride && R.runGait.liftMax[0] > 2 * R.walkGait.liftMax[0], R.runGait);

  /* ---- the hoarding (the first squeeze, 16.9-17.1) at the walk: no speed boost, head first, hips follow, rise after */
  const sqz = await U('s.x >= 17.9', 120 * 8, 1);
  const inSq = sqz.filter(s => s.sq);
  const phases = []; for (const q of sqz) if (q.sq && phases.at(-1) !== q.sq) phases.push(q.sq);
  const fIdx = sqz.findIndex(q => q.cF > 0.5), rIdx = sqz.findIndex(q => q.cR > 0.5);
  const fUp = sqz.findIndex((q, i) => i > fIdx && q.cF < 0.5), rUp = sqz.findIndex((q, i) => i > rIdx && q.cR < 0.5);
  R.squeeze = { vmax: Math.max(...sqz.map(q => q.vx)), phases, frontDownX: sqz[fIdx] && sqz[fIdx].x, rearDownX: sqz[rIdx] && sqz[rIdx].x, frontUpX: sqz[fUp] && sqz[fUp].x, rearUpX: sqz[rUp] && sqz[rUp].x,
    maxStepJump: Math.max(...sqz.slice(1).map((q, i) => Math.max(Math.abs(q.cF - sqz[i].cF), Math.abs(q.cR - sqz[i].cR)))), steps: inSq.length, poses: [...new Set(sqz.map(q => q.pose))] };
  ck('a squeeze never raises a walking speed (cap only)', R.squeeze.vmax <= 0.951, R.squeeze);
  ck('squeeze phases in -> (under) -> out (the hoarding is thinner than the body: in, then out)', /^in,(under,)?out$/.test(phases.join(',')), phases);
  ck('head and shoulders lower first, the hips follow; each rises after clearing', fIdx >= 0 && rIdx > fIdx && fUp > fIdx && rUp > fUp && R.squeeze.frontDownX < 16.9 && R.squeeze.frontUpX > 17.1, R.squeeze);
  ck('no snapping: the crouch amounts ease (< 0.11 per fixed step: 75 ms time constant at most)', R.squeeze.maxStepJump < 0.11, R.squeeze.maxStepJump);
  /* a shot in the middle of the duck-under (re-run the moment from the checkpoint) */

  /* ---- Down: the deliberate crouch (front first), crouch-walk 0.75, rise on release */
  await up('ArrowRight'); await T(60);
  await down('ArrowDown'); const cd = await T(40, 1);
  const cdF = cd.findIndex(q => q.cF > 0.5), cdR = cd.findIndex(q => q.cR > 0.5);
  await down('ArrowRight'); const cw = await T(240, 4); await shot('controls-crouchwalk', 'controls-03-down-crouch-walk.jpg');
  await up('ArrowRight'); await up('ArrowDown'); const cu = await T(120, 1);
  R.crouch = { frontDownT: cdF >= 0 ? +(cd[cdF].t - cd[0].t).toFixed(3) : null, rearDownT: cdR >= 0 ? +(cd[cdR].t - cd[0].t).toFixed(3) : null, walkV: Math.max(...cw.map(q => q.vx)), gait: cw.at(-1).g && cw.at(-1).g.name,
    risen: cu.at(-1).cF < 0.05 && cu.at(-1).cR < 0.05, crouchAfter: cu.at(-1).crouch };
  ck('Down: deliberate crouch, the shoulders before the hips', R.crouch.frontDownT != null && R.crouch.rearDownT > R.crouch.frontDownT, R.crouch);
  ck('Down + direction: crouch-walk at 0.75 m/s in the crouch gait', Math.abs(R.crouch.walkV - 0.75) < 0.01 && R.crouch.gait === 'crouch', R.crouch);
  ck('releasing Down rises (no ceiling)', R.crouch.risen && !R.crouch.crouchAfter, R.crouch);
  R.stepsTotal = await b.ev('__T.steps.length');

  /* ---- the gate glare: the reflex in the open is a freeze, never a flattening */
  await b.ev(`__ff.warp('verge-mid'); true`);
  await down('ArrowRight'); await U('s.x >= 29.0', 120 * 15); await up('ArrowRight');
  await U('FF.Player.debug().vehicle.stopped', 120 * 15); await T(120 * 4);
  await down('ArrowRight'); await U('s.x >= 32.6', 120 * 6); await up('ArrowRight');
  const gl = await T(120 * 3, 6);
  const glEnd = gl.at(-1);
  R.glare = { pose: glEnd.pose, low: glEnd.low, crouch: glEnd.crouch, cF: glEnd.cF, cR: glEnd.cR, mood: glEnd.mood, beamD: (await b.ev('FF.Player.debug().beamD')), poses: [...new Set(gl.map(q => q.pose))], anyFlat: gl.some(q => q.pose === 'hide' || q.cF > 0.05 || q.crouch) };
  ck('in the gate glare (open ground) it freezes, it does not flatten', R.glare.beamD === 0 && !R.glare.anyFlat && R.glare.pose === 'freeze', R.glare);
  await shot('controls-glare-freeze', 'controls-04-glare-freeze-not-flat.jpg');
  await down('ArrowDown'); const gd = await T(120 * 1.5, 6); await shot('controls-glare-down', 'controls-05-glare-down-deliberate-flat.jpg'); await up('ArrowDown'); await T(30);
  R.glareDown = { pose: gd.at(-1).pose, cF: gd.at(-1).cF, cR: gd.at(-1).cR };
  ck('Down in the glare flattens deliberately (hide pose)', R.glareDown.pose === 'hide' && R.glareDown.cF > 0.9, R.glareDown);

  /* ---- the hoarding again from verge-mid backwards? no: a mid-squeeze shot from a fresh warp just before it */
  await b.ev(`__ff.warp({ x: 15.6, y: 0, face: 1 }); true`); await T(4);
  await down('ArrowRight'); await U("s.sq === 'in' && s.cF > 0.8 && s.x > 16.85", 120 * 6); await T(2); await up('ArrowRight');
  await shot('controls-squeeze-in', 'controls-06-hoarding-head-first.jpg');
  await down('ArrowRight'); await U("s.sq === 'out'", 120 * 4); await up('ArrowRight'); await T(1);
  await shot('controls-squeeze-out', 'controls-07-hoarding-hips-follow.jpg');

  /* ---- the Search: spotted -> a direction alone stays the walk; Shift makes it the flee (3.6) */
  await b.ev(`__ff.warp('search-platform'); true`); await T(30);
  await down('ArrowRight'); await U('s.x >= 99.0', 120 * 8); await up('ArrowRight');
  const sp = await U("s.sr === 'spotted' || s.sr === 'aim' || s.sr === 'pursue' || s.sr === 'grab'", 120 * 12);
  R.search = { state: sp.at(-1).sr, x: sp.at(-1).x };
  await down('ArrowLeft'); const fl1 = await T(36, 2);
  await down('ShiftLeft'); const fl2 = await T(60, 2); await shot('controls-flee', 'controls-08-search-flee-shift.jpg'); await up('ShiftLeft'); await up('ArrowLeft');
  R.search.noShift = Math.max(...fl1.map(q => Math.abs(q.vx))); R.search.withShift = Math.max(...fl2.map(q => Math.abs(q.vx))); R.search.states = [...new Set([...fl1, ...fl2].map(q => q.sr))];
  ck('spotted: a direction alone stays the cautious walk (no automatic flee)', R.search.state && R.search.noShift <= 0.951, R.search);
  ck('spotted: Shift + direction flees at 3.6 m/s', R.search.withShift >= 3.0, R.search);
  await T(120 * 3);

  /* ---- v2 review fixes: a hop with a direction held leaps forward (it used to land short of the post from 0.35 m+) */
  R.hops = [];
  for (const d of [0.2, 0.35, 0.5, 0.7]) {
    await b.ev(`__ff.warp({ x: 9.4, y: 0, face: 1 }); true`); await T(10);
    await down('ArrowRight'); await U(`s.x + 0.16 >= ${10.8 - d}`, 120 * 4);
    await down('Space'); await T(12); await up('Space');
    const h = await U('s.x >= 11.4 && s.gr', 120 * 3); const blocked = await b.ev('FF.Player.debug().inv'); await up('ArrowRight'); await T(20);
    R.hops.push({ noseFromPost: d, cleared: h.at(-1).x >= 11.4, x: h.at(-1).x, t: +(h.at(-1).t - h[0].t).toFixed(2) });
  }
  ck('a walking hop (a tap of Space) clears the fallen post from 0.2, 0.35 and 0.5 m away (from 0.7 m it lands against it: hop again)', R.hops.filter(q => q.noseFromPost <= 0.5).every(q => q.cleared && q.t < 1.5), R.hops);
  await b.ev(`__ff.warp({ x: 60.0, y: 0, face: 1 }); true`); await T(10); await down('ArrowRight'); await T(120);
  const x0 = (await T(1)).at(-1).x; await down('Space'); await T(12); await up('Space'); const land = await U('s.gr', 120 * 2); await up('ArrowRight'); await T(60);
  R.walkHop = { distance: +(land.at(-1).x - x0).toFixed(3), peakVx: Math.max(...land.map(q => q.vx)) };
  ck('a walking hop carries about 0.6-0.7 m (not straight up)', R.walkHop.distance >= 0.58 && R.walkHop.distance <= 0.75, R.walkHop);

  /* ---- v2 review fixes: Shift held through a failure and the restart (a held modifier sends no new keydown): the next arrow
     press, carrying the Shift modifier as a real keyboard's does, runs at once; the same after pause and resume */
  await b.ev(`__ff.warp('search-platform'); true`); await T(30);
  await down('ShiftLeft'); await T(10); await b.ev("FF.Events.fail('caught'); true");
  const back2 = await U('s.control && s.mode === "play" && __ff.G.fade < 0.01', 120 * 4);
  R.shiftRestart = { controlBack: back2.at(-1).control, rawRun: await b.ev("FF.Input.raw('run')") };
  await down('ArrowLeft'); const sr = await T(96, 6); await up('ArrowLeft');
  R.shiftRestart.vmax = Math.max(...sr.map(q => Math.abs(q.vx)));
  ck('Shift held through a failure and restart: the next arrow runs (2.75 m/s)', R.shiftRestart.vmax >= 2.7, R.shiftRestart);
  await T(30);
  await down('ArrowLeft'); await T(30);
  await down('Escape'); await up('Escape'); await b.ev('__ff.step(1); true'); R.pauseKeys = await b.ev(`(() => { const e = document.querySelector('#ui .pause .keys'); return { mode: __ff.G.mode, text: e ? e.textContent.replace(/\\s+/g, ' ').trim() : null } })()`);
  await shot('controls-pause-keys', 'controls-v2-01-pause-shows-controls.jpg');
  await down('Escape'); await up('Escape'); await T(4);
  for (let i = 0; i < 18; i++) { await b.key('ArrowLeft', 'down', { autoRepeat: true }); await T(4); }
  const pr = await T(20, 4); await up('ArrowLeft'); await up('ShiftLeft');
  R.pauseResume = { vmax: Math.max(...pr.map(q => Math.abs(q.vx))), run: pr.at(-1).run };
  ck('the pause screen shows the controls line', R.pauseKeys.mode === 'pause' && /Shift run/.test(R.pauseKeys.text || ''), R.pauseKeys);
  ck('Shift + arrow held through pause and resume (the arrow auto-repeating) still runs', R.pauseResume.vmax >= 2.7, R.pauseResume);
  await T(60);

  /* ---- v2 review fixes: the Shift reminder on entering the Courtyard for a player who has not run for 60 s */
  await b.ev(`__ff.warp('courtyard'); __ff.G.t += 120; true`); await T(10);
  await down('ArrowRight'); const cr = await U("s.hint === 'run-again' || s.x >= 66", 120 * 12); await T(60); await up('ArrowRight');
  R.courtHint = { shownAt: cr.at(-1).hint === 'run-again' ? cr.at(-1).x : null, events: (await b.ev('__T.hints')).slice(-3) };
  await shot('controls-court-reminder', null);
  ck('a player who has not run for 60 s gets the Shift reminder once in the Courtyard', R.courtHint.shownAt != null && R.courtHint.shownAt <= 66, R.courtHint);
  await b.ev(`__ff.warp('courtyard'); __ff.G.t += 120; true`); await T(10); await down('ArrowRight'); const cr2 = await U("s.hint === 'run-again' || s.x >= 66", 120 * 12); await up('ArrowRight');
  ck('the reminder shows only once', cr2.at(-1).hint !== 'run-again', cr2.at(-1).hint);

  /* ---- the cautious walk sustained for 30 s (Josh: "slow movement should remain available indefinitely"): a direction
     held from past the post along the Verge, over the hoarding, past the van and the gate, into the culvert and the pipe */
  await b.ev(`__ff.warp({ x: 11.6, y: 0, face: 1 }); true`); await T(4);
  await down('ArrowRight'); const w30 = await T(120 * 30, 6); await up('ArrowRight'); await T(30);
  const open = w30.filter(q => q.gr && !q.sq && !q.crouch && q.y > -0.05 && q.place === 'verge'), late = open.filter(q => q.t > w30[0].t + 1);
  R.walk30 = { seconds: +(w30.at(-1).t - w30[0].t).toFixed(2), x0: w30[0].x, x1: w30.at(-1).x, vmax: Math.max(...w30.map(q => Math.abs(q.vx))), openSamples: late.length,
    openMin: late.length ? Math.min(...late.map(q => q.vx)) : null, openMax: late.length ? Math.max(...late.map(q => q.vx)) : null, lastPlace: w30.at(-1).place, gaits: [...new Set(w30.map(q => q.g && q.g.name))], control: w30.every(q => q.control) };
  ck('a direction held for 30 s stays the cautious walk (never above 0.95 m/s; 0.95 on open ground from 1 s on)', R.walk30.vmax <= 0.951 && R.walk30.openMin >= 0.94 && R.walk30.seconds >= 29.9, R.walk30);
} catch (e) { R.err = e.stack || e.message; console.log('ERR', R.err); }
R.errs = b.errs; R.pass = !R.err && R.checks.every(c => c.ok) && !b.errs.length;
fs.writeFileSync(path.join(OUT, 't-controls.json'), JSON.stringify(R, null, 1));
console.log('errs', JSON.stringify(b.errs.slice(0, 10)));
console.log(R.pass ? 'PASS' : 'FAIL', R.checks.filter(c => c.ok).length + '/' + R.checks.length);
b.close(); process.exit(0);
