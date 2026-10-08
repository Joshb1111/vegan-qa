// Far Field polish pass (8 Oct): the guard perception module (FF.Guard) in the game (the searcher, the gate guard's entry, the Works
// painter), the presses against a held Shift + Right, the opening (creeping out of the hole in the wall) and its light, "1951", the door, the jump. In the browser.
//   node docs/farfield/tests/t-polish.mjs        (PROGRESS_DIR=<dir> saves the chosen shots there; ONLY=A,B for a subset)
import { boot, save, shot, sleep } from './lib.mjs';
const only = process.env.ONLY ? process.env.ONLY.split(',') : null, want = n => !only || only.includes(n);
const out = []; let pass = 0, fail = 0;
const R = (n, ok, d) => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); out.push({ n, ok: !!ok, d }); ok ? pass++ : fail++; };
const P = (n) => process.env.PROGRESS_DIR ? n : null;
const HELP = `(() => { window.__p = { log: [], listen(names) { for (const n of names) __ff.bus.on(n, d => __p.log.push([n, +__ff.G.t.toFixed(3), JSON.parse(JSON.stringify(d || {}))])); },
  hold(w) { w = w || {}; for (const a of ['left', 'right', 'up', 'down', 'jump', 'run']) { const on = !!w[a]; if (on && !FF.Input.raw(a)) FF.Input.press(a); FF.Input.hold(a, on); } },
  go(n, plan, pred) { let i = 0; for (; i < n; i++) { const r = __ff.G.rabbit, s = { t: __ff.G.t, x: r.x, y: r.y, vx: r.vx }; if (pred && pred(s)) break; if (plan) __p.hold(plan(s)); __ff.tick(); } __ff.flush(); return i; } };
  __p.listen(['fail', 'painter', 'painter:noticed', 'ai:state', 'sound', 'intro', 'entry', 'reveal', 'works:shove', 'press', 'rabbit:jump', 'rabbit:land', 'opening:puff', 'restart']); return true; })()`;
const b = await boot({ q: 'q=high&seed=1&mute=1&intro=1' });
const ev = (s, to) => b.ev(s, to || 300000);
try {
  await ev(HELP);
  /* ================================================================ A. THE OPENING (creeping out of the hole in the wall, light shaft) */
  if (want('A')) {
    await ev('__ff.step(240); true'); await sleep(800); await ev('__ff.step(2); true');   // no notice any more: the loading screen goes straight to the title
    const t0 = await ev('({ mode: __ff.G.mode, vis: FF.G.rabbit.visible, k: FF.Opening.debug().k, notice: document.querySelector("#ui .notice").classList.contains("on") })');
    R('A no content notice: the game opens on the title; the empty scene and its light (the rabbit is not there yet), the shaft is up', t0.mode === 'title' && t0.vis === false && t0.k > 0.9 && !t0.notice, JSON.stringify(t0));
    await shot(b, 'polish-00-title', null);
    await ev("__p.log.length = 0; __ff.command('start'); true");
    const tl = []; let last = 0;
    for (const T of [0.2, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.4, 3.65]) {
      await ev(`__ff.step(${Math.round((T - last) * 120)}); true`); last = T;
      tl.push(await ev('({ t: +__ff.G.t.toFixed(2), mode: FF.G.rabbit.mode, x: +FF.G.rabbit.x.toFixed(2), y: +FF.G.rabbit.y.toFixed(2), z: +FF.G.rabbit.z.toFixed(2), ctl: __ff.G.control })'));
      if (T === 0.2) await shot(b, 'opening2-01', P('opening2-01.jpg'));
    }
    await ev('__ff.step(60); true');
    const ev1 = await ev('({ intro: __p.log.filter(e => e[0] === "intro").map(e => e[2].phase + "@" + e[1]), mode: FF.G.rabbit.mode, ctl: __ff.G.control, x: +FF.G.rabbit.x.toFixed(2), z: FF.G.rabbit.z, y: FF.G.rabbit.y })');
    await shot(b, 'opening2-02', P('opening2-02.jpg'));
    R('A the opening: he is in the hole (z behind the wall) first, comes out into the lane, control is off while it plays, then passes at about x 2.5 inside the light', tl[0].z < -1.5 && tl[0].x > 0.75 && tl[0].x < 1.55 && tl[4].z > tl[1].z && tl.slice(0, 8).every(q => q.mode === 'tumble' && !q.ctl) && ev1.mode === 'play' && ev1.ctl === true && ev1.x > 2.2 && ev1.x < 2.9 && ev1.z === 0 && ev1.y < 0.05, JSON.stringify({ tl, ev1 }));
    const dur = ev1.intro.map(s => s.split('@')), tEnd = +(dur.find(d => d[0] === 'end') || [0, 99])[1], tSt = +(dur.find(d => d[0] === 'start') || [0, 0])[1];
    R('A short: control passes between 3 and 4.2 s from the start', tEnd - tSt <= 4.2 && tEnd - tSt >= 3.0, 'start ' + tSt + ' end ' + tEnd);
    /* nothing but the wall stops him going back left, and he cannot get back through the hole (it is behind the lane) */
    const back = await ev(`(() => { __p.hold({ left: true }); __ff.step(120 * 6); __p.hold({}); const r = FF.G.rabbit; return { x: +r.x.toFixed(2), z: r.z, solidX1: FF.S1.solids.find(s => s.id === 'thicket').x1 }; })()`);
    R('A going back left he stops at the wall block (x 0.6 + his half width); the hole stays out of reach (z 0, not -1.7)', back.x >= back.solidX1 - 0.01 && back.x < 0.9 && back.z === 0, JSON.stringify(back));
    /* after the opening the rabbit stays where it is until the player moves (nothing carried through) */
    await ev("__ff.release(); __ff.command('title'); __ff.step(5); __ff.command('start'); __ff.step(120 * 4.4); true");
    const held = await ev(`(() => { const x0 = FF.G.rabbit.x; __ff.step(60); return { x0: +x0.toFixed(2), x1: +FF.G.rabbit.x.toFixed(2), mode: FF.G.rabbit.mode, ctl: __ff.G.control }; })()`);
    R('A after the opening he stays where he is until the player moves', held.mode === 'play' && held.ctl && Math.abs(held.x1 - held.x0) < 0.05, JSON.stringify(held));
    /* checkpoints and a restart after the opening are unaffected: the first checkpoint is still the grooming title spot */
    const rs = await ev(`(() => { FF.Game.restart('verge-start', { reason: 'fail' }); FF.Game.control(true); __ff.step(30); const r = FF.G.rabbit; return { mode: r.mode, x: r.x, z: r.z, vis: r.visible }; })()`);
    R('A a restart at the first checkpoint puts him in the lane in play (no re-run of the opening)', rs.mode === 'play' && rs.z === 0 && rs.vis === true, JSON.stringify(rs));
    /* ?intro=0 skips it (tests, a retry): the old start */
  }
  /* ================================================================ B. "1951" */
  if (want('B')) {
    await ev("__ff.warp({ id: 't-pipe', x: 201.2, y: 0, face: 1 }); __ff.step(180); true");
    await shot(b, 'polish-03-1951', P('polish-03-1951.jpg'));
    const w = await ev("({ mesh: !!FF.Game.scene.getObjectByName('pipe1951'), place: __ff.G.place })");
    R('B the colossal pipe carries the "1951" decal (built, in the open section)', w.mesh === true, JSON.stringify(w));
  }
  /* ================================================================ C. PRESSES: a held Shift + Right from the hall entry */
  if (want('C')) {
    await ev("__ff.release(); FF.Game.restart('works-line', { reason: 'fail' }); FF.Game.control(false); __ff.G.fade = 0; __p.log.length = 0; __p.go(120 * 1.05); FF.Game.control(true); true");
    /* the blind run: Shift + Right held from the restart's control, nothing else */
    await ev("__ff.release(); __p.go(120 * 6, () => ({ right: true, run: true }), s => __p.log.some(e => e[0] === 'fail') || s.x > 190); true");
    const r = await ev("({ fails: __p.log.filter(e => e[0] === 'fail').map(e => e[2].by + '@' + e[1]), x: +FF.G.rabbit.x.toFixed(2) })");
    R('C the blind run (Shift + Right held from the entry floor after a restart) is caught by the presses', r.fails.length >= 1, JSON.stringify(r));
    /* a mid-slam shot: Q1 about to land (a press at 3.8 s of its fall), the player in the entry floor */
    await ev("__ff.release(); FF.Game.restart('works-line', { reason: 'fail' }); FF.Game.control(true); __ff.G.fade = 0; FF.Works.setPhase('line', 3.55); __ff.step(1); true");
    await ev("__p.go(120 * 0.2); true");
    await shot(b, 'polish-04-press-mid-slam', P('polish-04-press-mid-slam.jpg'));
  }
  /* ================================================================ D. THE PAINTER: hearing, the lamp, the chase */
  if (want('D')) {
    await ev("__ff.release(); __ff.warp('works-passage'); __ff.G.rabbit.x = 158.5; FF.Painter.setLoopT(8.2); __p.log.length = 0; true");
    let n = 0; while (!(await ev("FF.Painter.debug().seg === 'hold' || FF.Painter.debug().mode === 'chase'")) && n++ < 400) await ev('__ff.step(3); true');
    await ev('__ff.step(6); true');
    await shot(b, 'polish-05-painter-detects', P('polish-05-painter-detects.jpg'));
    const d1 = await ev('FF.Painter.debug()');
    n = 0; while (!(await ev("FF.Painter.debug().mode === 'chase'")) && n++ < 400) await ev('__ff.step(3); true');
    await ev('__ff.step(30); true');
    await shot(b, 'polish-06-painter-chase', P('polish-06-painter-chase.jpg'));
    const d2 = await ev('FF.Painter.debug()');
    R('D the painter looked, held the lamp on the rabbit, then went after it (chase)', (d1.mode === 'look' || d1.mode === 'chase') && d2.mode === 'chase', JSON.stringify({ d1: d1.seg, d2: d2.mode, px: d2.px }));
    await ev('__ff.step(240); true');
    const f = await ev("({ fail: __p.log.find(e => e[0] === 'fail') || null })");
    R('D the standing rabbit is caught (a "caught" failure by the painter)', f.fail && f.fail[2].kind === 'caught' && f.fail[2].by === 'painter', JSON.stringify(f));
  }
  /* ================================================================ E. THE SEARCHER: the door, the gate guard, sound */
  if (want('E')) {
    await ev("__ff.release(); FF.G.flags.entryDone = false; FF.G.flags.doorN0 = false; __ff.warp('search-arrive'); __p.log.length = 0; true");
    let k = 0; while (!(await ev("(FF.AI.debug().entryT || 0) >= 1.95 + 0.08")) && k++ < 400) await ev('__ff.step(3); true');
    await ev('__ff.step(3); true');
    await shot(b, 'polish-07-door-bursts-open', P('polish-07-door-bursts-open.jpg'));
    const door = await ev("({ rot: +FF.World.prop('doorN0').rotation.y.toFixed(2), kind: FF.AI.debug().kind, entryT: FF.AI.debug().entryT })");
    R('E the door has burst open within 0.1 s of the doorway segment (not a 0.5 s swing)', Math.abs(door.rot) > 1.0, JSON.stringify(door));
    /* the reveal takes ~6.4 s from the cue to control */
    await ev('__ff.step(120 * 12); true');
    const rv = await ev("({ rv: __p.log.filter(e => e[0] === 'reveal').map(e => e[2].phase + '@' + e[1]), ctl: __ff.G.control })");
    R('E the reveal still hands control back (about 6-7 s after the cue)', rv.ctl === true && rv.rv.some(s => /^control@/.test(s)), JSON.stringify(rv));
    /* the gate guard (the entry's guard, now on patrol) stays dangerous: a rabbit standing in his beam is caught; never blind after the door */
    const res = [];
    for (const [x, k2] of [[103.0, 0.5], [104.0, 36.0], [100.5, 36.0]]) {
      await ev(`__ff.release(); __ff.warp({ id: 't-guard', x: ${x}, y: 0, face: 1 }); FF.G.flags.entryDone = true; FF.G.flags.revealSafe = false; FF.AI.setLoopT(${k2}); __p.log.length = 0; true`);
      const q = await ev(`(() => { let maxS = 0, spotted = null, notice = null; for (let i = 0; i < 120 * 14; i++) { __ff.tick(); const s = FF.G.searcher; maxS = Math.max(maxS, s.s); if (s.state === 'notice' && notice == null) notice = +(i / 120).toFixed(2); if ((s.state === 'spotted' || s.state === 'grab' || s.state === 'aim' || s.state === 'pursue') && spotted == null) spotted = +(i / 120).toFixed(2); if (__p.log.some(e => e[0] === 'fail')) break; } return { x: ${x}, loopT: ${k2}, maxS: +maxS.toFixed(2), notice, spotted, fail: __p.log.some(e => e[0] === 'fail') }; })()`);
      res.push(q);
    }
    R('E the searcher is not blind in the open: a still rabbit in his routine\'s beam fills suspicion to a NOTICE', res.some(q => q.notice != null), JSON.stringify(res));
    /* sound: a run behind his back alerts him (nothing else can: the torch is away, the dark range behind is 0.5 m), the cautious walk does not */
    const snd = [];
    for (const run of [false, true]) {
      await ev(`__ff.release(); __ff.warp({ id: 't-snd', x: 96.0, y: 0, face: 1 }); FF.G.flags.entryDone = true; FF.G.flags.revealSafe = false; FF.AI.setLoopT(38.0); __ff.step(2); (() => { const sx = FF.G.searcher.x; FF.G.rabbit.x = sx - 2.6; FF.G.rabbit.y = 0; })(); __p.log.length = 0; true`);
      const q = await ev(`(() => { let maxS = 0, sound = 0, notice = null; const sx0 = FF.G.searcher.x; for (let i = 0; i < 120 * 1.6; i++) { __p.hold({ right: true, run: ${run} }); __ff.tick(); const s = FF.G.searcher; maxS = Math.max(maxS, s.s); if (s.litBy === 'sound') sound++; if (s.state === 'notice' && notice == null) notice = +(i / 120).toFixed(2); } FF.Input.release();
        return { run: ${run}, gap0: +(sx0 - FF.G.rabbit.x + 2.6).toFixed(2), d: +Math.abs(FF.G.searcher.x - FF.G.rabbit.x).toFixed(2), maxS: +maxS.toFixed(2), soundFrames: sound, notice, state: FF.G.searcher.state }; })()`);
      snd.push(q);
    }
    save('t-polish-sound', snd);
    R('E sound: a run behind his back is heard (litBy "sound", a NOTICE); the cautious walk in the same place is not', snd[1].soundFrames > 20 && snd[1].notice != null && snd[0].soundFrames === 0 && snd[0].maxS < 0.1, JSON.stringify(snd));
    await shot(b, 'polish-09-searcher-hears-a-run', P('polish-09-searcher-hears-a-run.jpg'));
  }
  /* ================================================================ F. THE JUMP: the wind-up, the arc, the settle */
  if (want('F')) {
    await ev("__ff.release(); __ff.warp({ id: 't-jump', x: 6.0, y: 0, face: 1 }); __ff.step(60); __p.log.length = 0; true");
    const j = await ev(`(() => { FF.Input.press('jump'); const t0 = __ff.G.t; let up = null, apex = 0, land = null, pitchMax = 0;
      for (let i = 0; i < 120 * 2; i++) { FF.Input.hold('jump', i < 8); FF.Input.hold('right', true); __ff.tick(); const r = FF.G.rabbit; if (up == null && r.vy > 0.5) up = __ff.G.t - t0; apex = Math.max(apex, r.y); pitchMax = Math.max(pitchMax, Math.abs(r.pitchA || 0)); if (up != null && land == null && r.grounded && __ff.G.t - t0 > up + 0.2) land = __ff.G.t - t0; }
      FF.Input.release(); return { takeoffAfter: up && +up.toFixed(3), apex: +apex.toFixed(2), landAt: land && +land.toFixed(2), x: +FF.G.rabbit.x.toFixed(2), pitchMax: +pitchMax.toFixed(2) }; })()`);
    R('F the jump: a 65 ms wind-up before take-off, the usual height (~0.5 m), a forward arc (the body pitched), lands', j.takeoffAfter >= 0.05 && j.takeoffAfter <= 0.12 && j.apex > 0.4 && j.apex < 0.6 && j.pitchMax > 0.08 && j.x > 6.4, JSON.stringify(j));
  }
  /* ================================================================ G. THE VERGE GATE: the torch is put away while he rattles the chain */
  if (want('G')) {
    await ev("__ff.release(); FF.G.flags.vergeDone = false; FF.G.flags.entryDone = false; FF.G.flags.walkwayDone = false; __ff.warp('verge-mid'); FF.Input.hold('right', true); for (let i = 0; i < 1800 && __ff.G.rabbit.x < 29.0; i++) __ff.tick(); FF.Input.release(); true");
    const gseen = { rattle: [], other: [] };
    for (let i = 0; i < 80 && gseen.rattle.length < 3; i++) { await ev('__ff.step(30); true'); const v = await ev('FF.Events.debug().verge'); if (v.person.anim === 'unlock') gseen.rattle.push(v.person.torchProp); else if (v.person.vis) gseen.other.push(v.person.torchProp); }
    R('G the Verge person rattles the chain with the torch put away (props.torch 0), not poking through the gate', gseen.rattle.length >= 1 && gseen.rattle.every(t => t === 0), JSON.stringify(gseen));
  }
} catch (e) { R('test run', false, e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join(' | ')); }
const errs = await ev('FF.errors.slice()').catch(() => []);
R('console clean (no module errors, no exceptions)', errs.length === 0 && b.errs.length === 0, JSON.stringify(errs.slice(0, 3)) + ' ' + JSON.stringify(b.errs.slice(0, 5)));
save('t-polish', out);
console.log(`\n${fail ? 'FAIL' : 'PASS'} (${pass}/${pass + fail})`);
b.close(); process.exit(fail ? 1 : 0);
