// Look tuning: views of each place (optionally with FF.LOOKS overrides from $OVR, JSON) + the rabbit's readability ratio.
//   TAG=a VIEWS=title,verge6 OVR='{"verge":{"exposure":0.8}}' node t-look.mjs
import { boot, save, shot } from './lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const TAG = process.env.TAG || 'cur', OVR = process.env.OVR || '{}';
const V = {
  title: '__ff.command("continue"); __ff.step(300); __ff.step(2);',
  verge6: '__ff.warp({x: 6, face: 1}); __ff.step(200);',
  verge20: '__ff.warp({x: 20, face: 1}); __ff.step(200);',
  verge30: '__ff.warp({x: 30, face: 1}); __ff.step(200);',
  verge37: '__ff.warp({x: 37.4, face: 1}); __ff.step(200);',
  drain: '__ff.warp({x: 45.6, y: -1.0, face: 1}); __ff.step(200);',
  court57: '__ff.warp({x: 57.2, face: 1}); __ff.step(200);',
  court64: '__ff.warp({x: 64.0, face: 1}); __ff.step(200);',
  court72: '__ff.warp({x: 72.3, face: 1}); __ff.step(200);',
  search88: '__ff.warp("search-arrive"); __ff.step(60);',
  searchDeck: '__ff.warp("search-platform"); __ff.step(960);',
  searchOpen: '__ff.warp({x: 99.5, face: 1}); FF.G.flags.entryDone = true; FF.AI.setLoopT(30); __ff.step(60);',
  pallet: '__ff.warp({x: 102.2, face: 1, pose: "hide"}); FF.G.flags.entryDone = true; FF.AI.setLoopT(8); __ff.step(60);',
  rest116: '__ff.warp({x: 116.0, face: 1}); __ff.step(200);',
  rest121: '__ff.warp({x: 121.4, face: 1}); __ff.step(500);',
  restGroom: '__ff.warp({x: 121.4, face: 1}); __ff.step(200); FF.Player.setPose("groom"); __ff.step(360);',
  pullout: '__ff.warp({x: 121.4, face: 1}); __ff.step(200); FF.Camera.shot("pull-out"); __ff.step(120 * 7);',
};
const views = (process.env.VIEWS || Object.keys(V).join(',')).split(',');
const b = await boot({ q: process.env.Q || 'q=high&seed=1&mute=1' });
const R = {};
try {
  await b.ev(fs.readFileSync(path.join(DIR, 'measure.js'), 'utf8'));
  await b.ev(`(() => { const o = ${OVR}; const dm = (d, s) => { for (const k in s) { const v = s[k]; if (v && typeof v === 'object' && !Array.isArray(v)) { if (!d[k]) d[k] = {}; dm(d[k], v); } else d[k] = v; } }; dm(FF.LOOKS, o); FF.World.apply(); return true; })()`);
  if (process.env.PRE) await b.ev(`(() => { ${process.env.PRE}; return true; })()`);
  for (const v of views) {
    await b.ev(`(() => { ${V[v]} return true; })()`);
    R[v] = await b.ev('__measure()');
    await b.ev('__ff.draw(); true'); await shot(b, 'look-' + TAG + '-' + v);
  }
} catch (e) { R.err = e.message; }
R.errs = b.errs; save('look-' + TAG, R); console.log(JSON.stringify(R)); b.close(); process.exit(0);
