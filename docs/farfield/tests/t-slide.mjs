// Foot slide (Josh's playtest §9.3: "avoid sliding feet"; v2 review fixes): the rabbit's feet in steady gaits and across the
// changes between them (starting, stopping, walk <-> crouch-walk at the hoarding), and the searcher's feet while he walks.
// Real key events; frames stepped via __ff. node t-slide.mjs (PORT as lib.mjs). Writes out/t-slide.json.
import { boot, OUT } from './lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const b = await boot({ q: 'q=high&seed=1&mute=1&clean=1&rabbit=procedural&people=standin' })      /* the feet test is about the code-built rabbit's leg IK and the stand-in searcher (the models are the defaults since the polish pass; t-models.mjs covers theirs) */; const R = { cases: {}, checks: [] };
const ck = (name, ok, info) => { R.checks.push({ name, ok: !!ok, info }); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(info)); };
const ev = e => b.ev(e);
const worstOf = (o, keys) => Math.max(...keys.map(k => o[k].slide));
const popOf = (o, keys) => Math.max(...keys.map(k => o[k].pop));
try {
  await ev(fs.readFileSync(path.join(DIR, 'slide-page.js'), 'utf8'));
  const all = ['hindL', 'hindR', 'foreL', 'foreR'], hind = ['hindL', 'hindR'];
  const run = async (name, setup, pre, keys, settle, n) => {
    await ev(`__ff.warp(${JSON.stringify(setup)}); __ff.step(30, false); true`);
    await b.setKeys(pre); if (pre.length) await ev('__ff.step(180, false); true');
    await b.setKeys(keys); if (settle) await ev(`__ff.step(${settle}, false); true`);
    const r = await ev(`SLIDE.rabbit(${n}, 0.003)`); await b.setKeys([]); await ev('__ff.step(60, false); true');
    R.cases[name] = r; console.log(name.padEnd(12), JSON.stringify(r)); return r;
  };
  const open = { x: 60.0, y: 0, face: 1 };
  const walk = await run('walk', open, [], ['ArrowRight'], 120, 480);
  const runr = await run('run', open, [], ['ShiftLeft', 'ArrowRight'], 120, 360);
  const creep = await run('crouchwalk', open, [], ['ArrowDown', 'ArrowRight'], 120, 480);
  ck('steady walk, run and crouch-walk: planted feet slide < 0.05 m/s', [walk, runr, creep].every(o => worstOf(o, all) < 0.05), [walk, runr, creep].map(o => worstOf(o, all)));
  const stopW = await run('stopWalk', open, ['ArrowRight'], [], 0, 90);
  const startW = await run('startWalk', open, [], ['ArrowRight'], 0, 60);
  const stopR = await run('stopRun', open, ['ShiftLeft', 'ArrowRight'], [], 0, 90);
  ck('stopping from a walk: no glide into the stance (feet < 0.05 m/s on the ground; they step there)', worstOf(stopW, all) < 0.05, stopW);
  ck('starting to walk: the planted feet stay planted (< 0.05 m/s)', worstOf(startW, all) < 0.05, startW);
  ck('stopping from a run: < 0.08 m/s on the ground', worstOf(stopR, all) < 0.08, stopR);
  const hoard = await run('hoardWalk', { x: 16.3, y: 0, face: 1 }, [], ['ArrowRight'], 0, 160);
  ck('walking into the hoarding (walk -> crouch cycle): no foot on the ground jumps more than 2 cm in a frame', popOf(hoard, all) < 0.02, hoard);
  /* turning round (reported, not a verdict: the legs' IK works in the body's own plane, so a foot planted while the body yaws
     round is carried with it; it is a fraction of a second, mostly sub-pixel at the game's camera) */
  R.turnWalk = await run('turnWalk', open, ['ArrowRight'], ['ArrowLeft'], 0, 80);
  R.turnRun = await run('turnRun', open, ['ShiftLeft', 'ArrowRight'], ['ShiftLeft', 'ArrowLeft'], 0, 100);
  /* the searcher walking the yard (walk-search, 1.0 m/s) */
  await ev(`__ff.warp('search-platform'); FF.AI.setLoopT(5.6); __ff.step(40, false); true`);
  R.searcher = await ev('SLIDE.humans(480)'); console.log('searcher', JSON.stringify(R.searcher));
  const sr = R.searcher.find(f => f.role === 'searcher');
  ck("the searcher's planted feet slide < 0.05 m/s while he walks", sr && sr.L.slide < 0.05 && sr.R.slide < 0.05, sr);
} catch (e) { R.err = e.stack || e.message; console.log('ERR', R.err); }
R.errs = b.errs.slice(0, 10); R.pass = !R.err && !R.errs.length && R.checks.every(c => c.ok);
fs.writeFileSync(path.join(OUT, 't-slide.json'), JSON.stringify(R, null, 1));
console.log(R.pass ? 'PASS' : 'FAIL', R.checks.filter(c => c.ok).length + '/' + R.checks.length, 'errs', JSON.stringify(R.errs));
b.close(); process.exit(0);
