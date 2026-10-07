// Integrator: the Search scenarios through the real input path. node scen.mjs [names...] (default: all)
import { boot, save, shot, sleep } from './lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const ALL = {
  caught:     { setup: "__ff.warp('search-skip')", legs: 'SCEN.caught()' },
  shot:       { setup: "__ff.warp('search-platform')", legs: 'SCEN.shot()' },
  escapeCore: { setup: "__ff.warp('search-platform')", legs: 'SCEN.escapeCore()' },
  escapeGap:  { setup: "(__ff.warp({ id: 't-gap', x: 108.6, y: 0, face: 1 }), FF.AI.setLoopT(38.8))", legs: 'SCEN.escapeGap()' },
  darkClose:  { setup: "(__ff.warp('search-skip'), FF.AI.setLoopT(41.0))", legs: 'SCEN.darkClose()' },
};
const names = process.argv.slice(2).filter(n => ALL[n]); if (!names.length) names.push(...Object.keys(ALL));
const q = process.env.Q || 'q=high&seed=1&mute=1';
const b = await boot({ q });
const OUTR = {};
for (const name of names) {
  const R = OUTR[name] = {};
  try {
    await b.nav('/farfield/index.html?' + q, 'window.__ff && __ff.ready === true', 120000); await sleep(200);
    await b.ev('__ff.pause(); true'); b.held = new Set();
    for (const f of ['bot.js', 'scen.js']) await b.ev(fs.readFileSync(path.join(DIR, f), 'utf8'));
    await b.ev(ALL[name].setup + '; __ff.step(2); true');
    R.start = await b.ev('({ t: __ff.G.t, x: __ff.G.rabbit.x, cp: __ff.G.checkpoint, ai: FF.AI.debug() })');
    await b.ev(`SCEN.W.name = '${name}'; BOT.use(${ALL[name].legs}, SCEN.hook); true`);
    for (let n = 0; n < 4000; n++) {
      const r = await b.ev(`BOT.adv(${JSON.stringify([...b.held])}, 120 * 60)`);
      if (r.repress && r.repress.length) for (const k of r.repress) { await b.key(k, 'up'); b.held.delete(k); }
      if (r.keys) { await b.setKeys(r.keys); continue; }
      if (r.repress && r.repress.length) continue;
      if (r.shot) { await b.ev('__ff.draw(); true'); await shot(b, 'scen-' + r.shot); continue; }
      if (r.done) { R.err = r.err; break; }
    }
    await b.setKeys([]);
    R.W = await b.ev('SCEN.W');
    R.end = await b.ev('({ t: +__ff.G.t.toFixed(2), x: +__ff.G.rabbit.x.toFixed(2), place: __ff.G.place, cp: __ff.G.checkpoint, ai: FF.AI.debug().state, errors: FF.errors.slice() })');
    R.events = await b.ev("__ff.bus.log.filter(e => /^(ai:|fail|restart|checkpoint|entry)/.test(e.name)).map(e => [e.t, e.name, e.data.to || e.data.kind || e.data.phase || e.data.cp || e.data.id || ''])");
    await b.ev('__ff.draw(); true'); await shot(b, 'scen-' + name + '-end');
  } catch (e) { R.err = (R.err ? R.err + ' | ' : '') + e.message; }
  R.errs = b.errs.splice(0);
  console.log(name, JSON.stringify(R).slice(0, 2500));
}
save('scen', OUTR);
b.close(); process.exit(0);
