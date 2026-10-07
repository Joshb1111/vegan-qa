// A8: the Verge never pushes. Linger before the gate and in the glare: nothing moves the rabbit, the staging loops, the
// person comes out only when the rabbit drops into the culvert. Also: the frozen look test still loads.
import { boot, save, sleep } from './lib.mjs';
const b = await boot({ q: 'q=low&seed=1&mute=1' });
const R = {};
try {
  R.linger = await b.ev(`(() => {
    __ff.warp('verge-mid'); FF.Input.hold('right', true); for (let i = 0; i < 1800 && __ff.G.rabbit.x < 29.0; i++) __ff.tick(); FF.Input.release();
    const x0 = __ff.G.rabbit.x; const t0 = __ff.G.t; let maxDx = 0, phases = new Set();
    for (let i = 0; i < 120 * 60; i++) { __ff.tick(); maxDx = Math.max(maxDx, Math.abs(__ff.G.rabbit.x - x0)); phases.add(FF.Events.debug().verge.phase); }
    const before = FF.Events.debug().verge;
    FF.Input.hold('right', true); for (let i = 0; i < 600 && __ff.G.rabbit.x < 32.6; i++) __ff.tick(); FF.Input.release();
    const x1 = __ff.G.rabbit.x; let maxDx2 = 0; const gl = []; const log0 = __ff.bus.log.length;
    for (let i = 0; i < 120 * 30; i++) { __ff.tick(); maxDx2 = Math.max(maxDx2, Math.abs(__ff.G.rabbit.x - x1)); }
    const gate = __ff.bus.log.filter(e => e.name === 'gate').map(e => e.data.phase).reduce((a, p) => (a[p] = (a[p] || 0) + 1, a), {});
    const person = __ff.bus.log.filter(e => e.name === 'person').map(e => e.data.phase);
    return { waitedBeforeGate: 60, rabbitMovedBy: +maxDx.toFixed(3), phases: [...phases], vergeAfter60s: { phase: before.phase, rattle: before.rattle.on, outT: before.outT, person: before.person.vis },
             inGlare30s: { rabbitMovedBy: +maxDx2.toFixed(3), gateEvents: gate, personEvents: person }, control: __ff.G.control }; })()`, 300000);
  await b.nav('/farfield/look.html?q=high', 'true', 60000); await sleep(4000);
  R.look = await b.ev('({ hasCanvas: !!document.querySelector("canvas"), title: document.title })');
} catch (e) { R.err = e.message; }
R.errs = b.errs; save('t-linger', R); console.log(JSON.stringify(R, null, 1)); b.close(); process.exit(0);
