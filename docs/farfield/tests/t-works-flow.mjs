// Far Field, Sequence 2: the shell's flow (SEQUENCE-2.md §10 and §18 W12), through real key events on ONE headless Chrome
// ($PORT, default 9921; devtools +100). From the repo root:  node docs/farfield/tests/t-works-flow.mjs
//   1. the content notice (the game's first screen and the arcade menu) names "dangerous machinery" (Josh, 7 Oct)
//   2. ?start=works: the notice, then the title with "Begin at the Works" chosen; Enter starts at works-in (x 124.4) with
//      Sequence 1's beats done (no searcher, no Verge people); → does the same and walks the rabbit on
//   3. an old Sequence 1 save "completed" ('ff-s1-progress') becomes "Continue from the Works" ('ff-progress' = works-in);
//      "rest" stays "Continue from the breathing space" with no "Begin at the Works"; a Works save offers both
//   4. ?mute=1: nothing stored, no AudioContext; console clean throughout
// Prints PASS / FAIL per check and writes out/works-flow.json.
import { boot, save, sleep } from './lib.mjs';
const R = { checks: [] }; let ok = true;
const check = (name, pass, detail) => { R.checks.push({ name, ok: !!pass, detail }); ok = ok && !!pass; console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); };
const b = await boot({ q: 'start=works&mute=1&seed=1&q=low' });
const step = async n => b.ev(`__ff.step(${n || 2}); true`);
const ui = () => b.ev('FF.UI.debug()');
const title = () => b.ev(`(() => { const t = document.querySelector('#ui .title'); return { go: t.querySelector('.go').className, cont: t.querySelector('.cont:not(.works)').textContent, contSel: t.querySelector('.cont:not(.works)').classList.contains('sel'), works: t.querySelector('.cont.works').textContent, worksSel: t.querySelector('.cont.works').classList.contains('sel') }; })()`);
const toTitle = async () => { await step(30); await b.ev('__ff.Game.toTitle(); true'); await step(30); await sleep(100); };   // (no notice screen any more: the game opens on the title)
try {
  /* 1. the notice */
  const notice = await b.ev(`document.querySelector('#ui .notice p').textContent`);
  check('the game\'s notice names dangerous machinery', /pursuit, capture, dangerous machinery and non-graphic violence towards the rabbit/.test(notice) && /caught or harmed/.test(notice), notice);
  /* 2. ?start=works */
  await toTitle();
  let u = await ui(), t = await title();
  check('?start=works: the title offers "Begin at the Works", chosen', u.titleOpts.join() === 'begin,works:works-in' && u.titleSel === 1 && t.worksSel && /Begin at the Works/.test(t.works) && /dim/.test(t.go), { opts: u.titleOpts, sel: u.titleSel, t });
  await b.key('Enter'); await step(4);
  let s = await b.ev(`({ mode: __ff.G.mode, cp: __ff.G.checkpoint, x: __ff.G.rabbit.x, flags: Object.assign({}, __ff.G.flags), searcher: !!(__ff.G.searcher && __ff.G.searcher.active), verge: FF.Events.debug().verge.phase, control: __ff.G.control })`);
  check('Enter starts at works-in (x 124.4), Sequence 1 done, nobody about', s.mode === 'play' && s.cp === 'works-in' && Math.abs(s.x - 124.4) < 0.05 && s.flags.vergeDone && s.flags.walkwayDone && s.flags.entryDone && !s.searcher && s.verge === 'gone' && s.control, s);
  await b.ev('__ff.Game.toTitle(); true'); await step(4);
  u = await ui();
  check('back at the title it is chosen again', u.titleOpts.join() === 'begin,works:works-in' && u.titleSel === 1, u.titleOpts);
  await b.key('ArrowDown'); u = await ui(); t = await title();
  check('↓ moves the choice back to the beginning', u.titleSel === 0 && !t.worksSel && !/dim/.test(t.go), { sel: u.titleSel, t });
  await b.key('ArrowUp');
  await b.key('ArrowRight', 'down'); await b.ev('__ff.step(240); true'); await b.key('ArrowRight', 'up'); await step(2);
  s = await b.ev(`({ mode: __ff.G.mode, cp: __ff.G.checkpoint, x: __ff.G.rabbit.x })`);
  check('→ on "Begin at the Works" starts there and walks the rabbit on', s.mode === 'play' && s.cp === 'works-in' && s.x > 125.5, s);
  R.mute = await b.ev('({ ac: window.__probe.ac, set: window.__probe.set.slice() })');
  check('?mute=1: no AudioContext, nothing stored', R.mute.ac === 0 && R.mute.set.length === 0, R.mute);
  /* 3. saves (sound on, storage on) */
  const saves = [['completed', 'works-in', 'begin,cont:works-in', 'the Works'], ['rest', 'rest', 'begin,cont:rest', 'the breathing space'], ['works-line', 'works-line', 'begin,cont:works-line,works:works-in', 'the long hall']];
  for (const [old, want, opts, label] of saves) {
    await b.nav('/farfield/index.html?seed=1&q=low', 'window.__ff && __ff.ready === true', 120000);
    await b.ev(`localStorage.removeItem('ff-progress'); localStorage.setItem('ff-s1-progress', ${JSON.stringify(old)}); __ff.pause(); true`);
    await toTitle();
    u = await ui(); t = await title();
    const stored = await b.ev(`localStorage.getItem('ff-progress')`);
    check(`old save "${old}" -> ${want}: "Continue from ${label}"` + (opts.includes('works:') ? ' and "Begin at the Works"' : ''), u.titleSave === want && stored === want && u.titleOpts.join() === opts && t.cont.includes('Continue from ' + label) && (opts.includes('works:') ? /Begin at the Works/.test(t.works) : t.works === ''), { titleSave: u.titleSave, stored, opts: u.titleOpts, t });
    if (old === 'completed') {
      await b.key('ArrowDown'); await b.key('Enter'); await step(4);
      s = await b.ev(`({ mode: __ff.G.mode, cp: __ff.G.checkpoint, x: __ff.G.rabbit.x })`);
      check('↓ Enter continues from the Works', s.mode === 'play' && s.cp === 'works-in' && Math.abs(s.x - 124.4) < 0.05, s);
    }
    if (old === 'works-line') {
      await b.key('ArrowDown'); await b.key('ArrowDown'); u = await ui(); t = await title();
      check('↓ ↓ reaches "Begin at the Works"', u.titleSel === 2 && t.worksSel, { sel: u.titleSel });
      await b.key('ArrowDown'); u = await ui();
      check('and ↓ wraps to the beginning', u.titleSel === 0, { sel: u.titleSel });
    }
  }
  /* the save only grows; the migration happens once (an old key left behind is not read again) */
  await b.ev(`FF.Game.save('courtyard'); localStorage.setItem('ff-s1-progress', 'completed'); true`);
  const after = await b.ev(`({ p: localStorage.getItem('ff-progress'), load: FF.Game.loadSave() })`);
  check('the save never goes backwards; the old key is read only once', after.p === 'works-line' && after.load === 'works-line', after);
  /* the arcade menu's notice */
  await b.nav('/farfield/room-test.html?mute=1', 'window.__room && document.querySelector("#arcade [data-a=play]")', 30000);
  const cn = await b.ev(`document.querySelector('#arcade .cn').textContent`);
  check('the arcade menu\'s notice names dangerous machinery', /pursuit, capture, dangerous machinery and non-graphic violence towards the rabbit/.test(cn), cn);
} catch (e) { R.err = e.message; ok = false; console.log('ERR', e.message); }
R.errs = b.errs.slice(0, 20);
check('console clean', !R.errs.length, R.errs);
R.pass = ok; save('works-flow', R);
console.log(ok ? '\nPASS (' + R.checks.length + '/' + R.checks.length + ')' : '\nFAIL');
b.close(); process.exit(ok ? 0 : 1);
