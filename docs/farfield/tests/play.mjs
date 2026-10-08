// Integrator: a bot plays the whole game (Sequence 1, then Sequence 2, The Works, to the card) through the REAL input path
// (CDP key events), frames stepped via __ff.tick.
//   node play.mjs [plaus|fast|firsttimer] [query] [label]      e.g.  node play.mjs firsttimer "q=high&seed=1" firsttimer
import { boot, save, shot, sleep } from './lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const mode = process.argv[2] || 'plaus', q = process.argv[3] || 'q=high&seed=1', label = process.argv[4] || ('sneak-' + mode);
const b = await boot({ q });
const R = { mode, q };
const t0 = Date.now();
try {
  await b.ev(fs.readFileSync(path.join(DIR, 'bot.js'), 'utf8'));
  await b.ev(fs.readFileSync(path.join(DIR, 'works-bot.js'), 'utf8'));     // Sequence 2's route (routes.js calls __worksBot)
  await b.ev(fs.readFileSync(path.join(DIR, 'routes.js'), 'utf8'));
  /* no unexpected flattening in the open (Josh §9.2): every fixed step in play, a flat pose (hide) or a lowered front while
     nothing is low overhead, no cover is over it, no squeeze and Down is not held, counts */
  await b.ev(`window.__FLAT = { steps: 0, open: 0, ex: [] }; (() => { const tk = __ff.tick; __ff.tick = function () { tk(); const g = FF.G, r = g.rabbit;
    if (g.mode !== 'play' || !r || r.mode !== 'play' || !r.grounded) return; __FLAT.steps++; const p = FF.Player.debug();
    if (!(p.pose === 'hide' || p.crouchF > 0.6)) return;
    if (p.crouchHeld || p.squeeze || p.low || FF.Level.coverAt(r.x, 0) || FF.Level.ceilingAbove(r.x, FF.RULES.rabbit.hw * 3, r.y) - r.y < 0.5) return;
    if (p.works && p.works.pitCovered) return;      /* Sequence 2: flat in a pit while a press comes down over it, as designed */
    __FLAT.open++; if (__FLAT.ex.length < 8) __FLAT.ex.push([+g.t.toFixed(2), +r.x.toFixed(2), p.pose, p.crouchF, g.place]); }; })(); true`);
  await b.ev(`window.__HINTS = []; FF.bus.on('hint', d => __HINTS.push([+FF.G.t.toFixed(2), d.arg, d.x])); window.__REVEAL = []; FF.bus.on('reveal', d => __REVEAL.push([+FF.G.t.toFixed(2), d.phase, d.cause, d.x])); true`);
  R.boot = await b.ev('(() => ({ mode: __ff.G.mode, errors: FF.errors.slice(), ac: window.__probe.ac }))()');
  await b.ev('__ff.step(60); true');
  await shot(b, label + '-00-notice');
  await b.key('Enter');                                  // Continue on the content notice (real key)
  R.afterNotice = await b.ev('__ff.G.mode');
  await b.ev('__ff.step(240); true'); await sleep(1600); await b.ev('__ff.step(2); true');
  await shot(b, label + '-01-title');
  await b.ev(mode === 'firsttimer' ? 'BOT.use(ROUTES.firsttimer()); true' : `BOT.use(ROUTES.sneak(${mode === 'plaus'})); true`);
  let n = 0;
  for (;;) {
    if (Date.now() - t0 > 2400000) throw new Error('real-time limit');
    const r = await b.ev(`BOT.adv(${JSON.stringify([...b.held])}, 120 * 120)`);
    n++;
    if (r.repress && r.repress.length) for (const k of r.repress) { await b.key(k, 'up'); b.held.delete(k); }
    if (r.keys) { await b.setKeys(r.keys); continue; }
    if (r.repress && r.repress.length) continue;
    if (r.shot) { await b.ev('__ff.draw(); true'); await shot(b, label + '-' + r.shot); continue; }
    if (r.done) { R.err = r.err; break; }
    if (r.timeout) continue;
  }
  await b.setKeys([]);
  R.calls = n;
  R.marks = await b.ev('BOT.marks.filter(m => !/^leg-done/.test(m.name))');
  R.fails = await b.ev("(window.__REC || []).filter(e => e.name === 'fail').map(e => [e.t, e.data.kind, e.data.x, e.data.by || null])");
  R.checkpoints = await b.ev("(window.__REC || []).filter(e => e.name === 'checkpoint').map(e => [e.t, e.data.id])");
  R.endMode = await b.ev('__ff.G.mode'); R.hints = await b.ev('__HINTS'); R.reveal = await b.ev('__REVEAL'); R.flat = await b.ev('__FLAT');
  if (R.endMode === 'end') {                                   // the end card runs on real-time timers (6.5 s), then the title
    for (let i = 0; i < 40; i++) { await sleep(300); await b.ev('__ff.step(6); true'); if (i === 8) await shot(b, label + '-card'); if (await b.ev('__ff.G.mode') === 'title') break; }
    await b.ev('__ff.step(240); true'); await sleep(1600); await b.ev('__ff.step(2); true');
    R.afterEnd = await b.ev('({ mode: __ff.G.mode, save: FF.Game.loadSave(), x: __ff.G.rabbit.x, pose: FF.Player.debug().pose })');
    await shot(b, label + '-title-again');
  }
  R.state = await b.ev('(() => { const s = __ff.state(); return { t: s.t, mode: s.mode, place: s.place, cp: s.cp, errors: s.errors, ac: window.__probe.ac, stored: window.__probe.set.slice(-12) } })()');
} catch (e) { R.err = (R.err ? R.err + ' | ' : '') + e.message; try { R.state = await b.ev('__ff.state()'); R.marks = await b.ev('BOT.marks'); } catch (_) {} }
R.realSecs = (Date.now() - t0) / 1000;
R.errs = b.errs.slice(0, 30);
save(label, R); console.log(JSON.stringify(R, null, 1).slice(0, 6000));
b.close(); process.exit(0);
