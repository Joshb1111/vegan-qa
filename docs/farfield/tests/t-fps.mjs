// Real rAF loop fps per tier (headless, vsync and the frame-rate limit off): the game runs itself for 4 s per place
// (Sequence 1's four, then Sequence 2's press hall, passage, long hall and the outside).
import { boot, save, sleep } from './lib.mjs';
const W = +(process.env.W || 1440), H = +(process.env.H || 720);
const b = await boot({ q: 'q=high&seed=1&mute=1', w: W, h: H });
const R = { W, H, dsf: +(process.env.DSF || 1), res: {} };
try {
  for (const tier of ['high', 'medium', 'low']) {
    R.res[tier] = {};
    for (const [v, setup] of [['verge', "__ff.warp({ x: 20, face: 1 })"], ['courtyard', "__ff.warp({ x: 72.3, face: 1 })"], ['search', "__ff.warp('search-platform')"], ['rest', "__ff.warp({ x: 121.4, face: 1 })"],
      /* Sequence 2: the press hall (P1 coming down), the passage (the worker and his lamp), the long hall (the walk), outside */
      ['hall', "__ff.warp('works-apron')"], ['passage', "__ff.warp({ x: 157.6, face: 1 })"], ['line', "__ff.warp('works-line')"], ['out', "__ff.warp({ x: 202.0, face: 1 })"]]) {
      await b.ev(`(() => { __ff.pause(); __ff.setTier('${tier}'); ${setup}; __ff.step(30); __ff.pause(false); return true; })()`);
      await sleep(1500); await b.ev('true'); await sleep(2500);
      R.res[tier][v] = await b.ev('(() => { const s = __ff.stats(); return { fps: +s.fps.toFixed(1), ms: +s.ms.toFixed(2), calls: s.calls, px: s.w + "x" + s.h, tierNow: __ff.tier } })()');
    }
  }
  await b.ev('__ff.pause(); true');
} catch (e) { R.err = e.message; }
R.errs = b.errs; save('t-fps-' + W + 'x' + H + '-dsf' + R.dsf, R); console.log(JSON.stringify(R)); b.close(); process.exit(0);
