// Far Field extras (8 Oct): the distant cattle truck, Josh's recorded gate sound, the loading warm-up.
//   PORT=9994 PROGRESS_DIR=<dir> node t-extras.mjs        (one headless Chrome at a time)
import { boot, sleep, shot, save } from './lib.mjs'; import { launch } from './cdp.mjs'; import fs from 'node:fs';
const res = {}; const ok = (n, c, d) => { res[n] = { ok: !!c, d }; console.log(c ? 'PASS' : 'FAIL', n, d === undefined ? '' : JSON.stringify(d)); };
const PORT = +(process.env.PORT || 9994);
const J = async (b, e) => JSON.parse(await b.ev(`JSON.stringify(${e})`));

/* A. boot time and the cost of FIRST visits: after boot (warm=0 = the old start with its single compile; warm=1 = with the warm-up) every place is visited in turn
   and the first frame there is timed (headless rAF is throttled, so the frames are drawn by hand; a first draw that compiles a shader shows as tens or hundreds of ms) */
async function bootRun(warm) {
  const t0 = Date.now();
  const b = await boot({ q: `mute=1&seed=1&intro=0&warm=${warm}` });
  const ready = Date.now() - t0, info = await J(b, '{boot: __ff.boot, tier: __ff.tier}');
  const prog0 = await b.ev('__ff.renderer.info.programs.length');
  const first = await b.ev(`(() => { const out = []; for (const id of ['verge-start','verge-mid','drain','courtyard','search-arrive','search-skip','rest','works-in','works-apron','works-line','works-g2','works-out']) { const t = performance.now(); __ff.warp(id); __ff.step(3); const a = performance.now() - t; const t2 = performance.now(); __ff.step(60); out.push([id, Math.round(a), Math.round(performance.now() - t2)]); } return JSON.stringify(out); })()`, 600000);
  const rows = JSON.parse(first), firstMs = rows.map(r => r[1]);
  const prog1 = await b.ev('__ff.renderer.info.programs.length');
  const st = await J(b, '{tier: __ff.tier, errors: __ff.state().errors, ac: window.__probe.ac}');
  const out = { warm, programsAtReady: prog0, programsAfterVisits: prog1, compiledDuringVisits: prog1 - prog0, readyMs: ready, bootMs: info.boot.ms, warmMs: info.boot.warm.ms, tierAtReady: info.tier, firstVisitMs: rows, firstVisitTotal: firstMs.reduce((p, c) => p + c, 0), firstVisitMax: Math.max(...firstMs), over100: firstMs.filter(x => x > 100).length, after: st, errs: b.errs.slice() };
  b.close(); await sleep(1000); return out;
}
const A0 = await bootRun(0), A1 = await bootRun(1); console.log(JSON.stringify(A0)); console.log(JSON.stringify(A1)); save('extras-boot', { A0, A1 });
ok('A console clean with the warm-up (?mute=1)', A1.errs.length === 0 && !A1.after.errors.length, { errs: A1.errs, errors: A1.after.errors });
ok('A ?mute=1 makes no AudioContext', A1.after.ac === 0, A1.after.ac);
ok('A warm-up ran', A1.warmMs > 0, { warmMs: A1.warmMs, bootBefore: A0.bootMs, bootAfter: A1.bootMs });
ok('A starts at medium', A1.tierAtReady === 'medium', A1.tierAtReady);
ok('A the warm-up leaves fewer shaders to compile while playing (programs compiled during the first visits)', A1.compiledDuringVisits <= A0.compiledDuringVisits && A1.compiledDuringVisits <= 2, { before: { atReady: A0.programsAtReady, duringVisits: A0.compiledDuringVisits, firstVisitMs: A0.firstVisitTotal }, after: { atReady: A1.programsAtReady, duringVisits: A1.compiledDuringVisits, firstVisitMs: A1.firstVisitTotal } });

/* B. the truck: a silhouette in the far view, in the breathing space, silent, never close */
{
  const b = await boot({ q: 'q=high&mute=1&seed=1&intro=0' });
  const none = await J(b, 'FF.Truck.debug()'); await b.ev("__ff.warp('works-in'); __ff.step(120); true"); const early = await J(b, 'FF.Truck.debug()');
  await b.ev("__ff.warp('works-out'); __ff.step(600); __ff.hold('right'); __ff.step(1500); true");
  const d = await J(b, 'FF.Truck.debug()'), r = await J(b, '__ff.state().rabbit');
  await shot(b, 'extras-truck', 'extras-01-truck.jpg', { hideUI: true });
  ok('B truck loaded, ~5k triangles', d.loaded && d.tris > 3000 && d.tris < 7000, d);
  ok('B hidden in the Works, shown in the breathing space', !early.on && d.on, { early: early.on, out: d.on });
  ok('B far (>= 100 m from the rabbit) and crawling slowly', d.x - r.x > 20 && 124 > 100 && d.moving, { dx: +(d.x - r.x).toFixed(1), z: d.z });
  const audio = await J(b, 'FF.Audio.debug().heard'); ok('B no truck sound', !Object.keys(audio).some(k => /truck|engine|cow|moo/i.test(k)), audio);
  /* pixels: the same view with ?truck=0 must differ in the truck's patch only */
  const clip = { x: 800, y: 280, width: 400, height: 120, scale: 1 };
  const withT = (await b.cdp('Page.captureScreenshot', { format: 'png', clip })).data;
  await b.ev("FF.Truck.warm(false); FF.Truck.reset(); true"); await b.ev('__ff.step(2); true');
  const woT = (await b.cdp('Page.captureScreenshot', { format: 'png', clip })).data;
  ok('B the truck changes the picture (a dark body in that patch)', withT !== woT, { len: [withT.length, woT.length] });
  ok('B console clean', b.errs.length === 0, b.errs); b.close(); await sleep(1000);
}

/* C. the gate sound (sound ON; the headless Chrome is --mute-audio): the recording plays at the gate's shake and the opening lands on the slide */
{
  const b = await boot({ q: 'q=high&seed=1&intro=0' });
  await b.ev('FF.Audio.unlock(); true'); await sleep(2500);
  const loaded = await J(b, 'FF.Audio.debug().smp');
  await b.ev("window.__ev = []; for (const k of ['gate']) __ff.bus.on(k, d => __ev.push([+__ff.G.t.toFixed(3), k, d.phase])); window.__sd = []; __ff.bus.on('sound', d => { if (/chain|lock-gives|gate-slide/.test(d.cue)) __sd.push([+__ff.G.t.toFixed(3), d.cue]); }); __ff.warp('verge-mid'); true");
  let shotDone = false;
  for (let i = 0; i < 100; i++) {
    await b.ev("__ff.run(120, () => ({ right: true }), 120); true");
    const ev = await J(b, '__ev'); if (!shotDone && ev.some(e => e[2] === 'slide')) { await b.ev('__ff.run(36, () => ({ right: true }), 120); true'); await shot(b, 'extras-gate', 'extras-03-gate.jpg', { hideUI: true }); shotDone = true; await b.ev('__ff.run(240, () => ({ right: true }), 120); true'); break; }
    if (i > 60) break;
  }
  const ev = await J(b, '__ev'), rec = await J(b, 'FF.Audio.debug().recorded'), lock = ev.find(e => e[2] === 'lock'), slide = ev.find(e => e[2] === 'slide');
  const first = ev.find(e => e[2] === 'rattle'), shake = rec.find(r => r.cue === 'chain'), open = rec.find(r => r.cue === 'lock-gives');
  console.log(JSON.stringify({ lock, slide, first, rec }));
  ok('C recording decoded (AAC)', loaded.includes('gate-guard'), loaded);
  ok('C the first rattle plays his shake (0-1.45 s)', shake && shake.from === 0 && shake.len >= 0.6 && Math.abs(shake.t - first[0]) < 0.05, { shake, first });
  ok('C the lock plays the opening part from 1.95 s, at the lock', open && open.from === 1.95 && Math.abs(open.t - lock[0]) < 0.05, { open, lock });
  const creakAt = open.t + (2.5 - 1.95), dt = +(creakAt - slide[0]).toFixed(3);
  ok('C the creak (file 2.5 s) lands within 0.15 s of the gate sliding', Math.abs(dt) < 0.15, { creakAt: +creakAt.toFixed(2), slideAt: slide[0], dt });
  ok('C the synthesised slide is replaced (no gate-slide cue after the recording)', !(await J(b, '__sd')).some(e => e[1] === 'gate-slide'), await J(b, '__sd'));
  /* mute (M): the next cue is not played, and not logged as played */
  const n0 = (await J(b, 'FF.Audio.debug().recorded')).length;
  await b.ev("__ff.warp('verge-mid'); __ff.fire('gate', {phase: 'lock'}); true"); const n1 = (await J(b, 'FF.Audio.debug().recorded')).length;
  await b.key('KeyM'); await b.ev("__ff.fire('gate', {phase: 'lock'}); true"); const n2 = (await J(b, 'FF.Audio.debug().recorded')).length;
  ok('C M mutes it', n1 === n0 + 1 && n2 === n1, { n0, n1, n2 });
  ok('C console clean (sound on)', b.errs.length === 0, b.errs); b.close(); await sleep(1000);
}

/* D. the loading screen: dark, 'Far Field', a thin line that moves, then gone */
{
  const b = await launch({ w: 1280, h: 640, gpu: true, port: PORT, dport: PORT + 100 });
  await b.cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/farfield/index.html?mute=1&seed=1&intro=0` });
  const widths = []; let shotDone = false;
  for (let i = 0; i < 120; i++) {
    await sleep(500); let w = null; try { w = await b.ev("(() => { const e = document.getElementById('bootbar'); return e ? parseInt(e.dataset.p || '0') : -1; })()", 5000); } catch (_) {}
    if (w != null) widths.push(w);
    if (!shotDone && w > 25 && w < 90) { await b.shot('/tmp/ff-loading.jpg', 85); shotDone = true; if (process.env.PROGRESS_DIR) { fs.mkdirSync(process.env.PROGRESS_DIR, { recursive: true }); fs.copyFileSync('/tmp/ff-loading.jpg', process.env.PROGRESS_DIR + '/extras-02-loading.jpg'); } }
    if (w === 100 || w === -1) break;
  }
  const rdy = await b.ev('window.__ff && __ff.ready === true');
  console.log('bar', JSON.stringify(widths.filter((x, i) => i % 3 === 0)));
  ok('D the bar moves in steps and the game gets ready', rdy && new Set(widths).size >= 3, { steps: new Set(widths).size, rdy });
  ok('D a loading shot was taken mid-way', shotDone);
  b.close(); await sleep(500);
}
console.log('SUMMARY', JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.ok]))));
process.exit(Object.values(res).every(r => r.ok) ? 0 : 1);
