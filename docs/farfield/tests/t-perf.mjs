// Frame cost per quality tier and place (GPU-synced: a 1-pixel readPixels after each draw), with the simulation and
// presentation stepped as in play. W/H/DSF from env (default 1440x720 at DSF 2: the M2 Air's Retina, capped by tier dpr).
import { boot, save } from './lib.mjs';
const W = +(process.env.W || 1440), H = +(process.env.H || 720);
const b = await boot({ q: 'q=high&seed=1&mute=1', w: W, h: H });
const R = { W, H, dsf: +(process.env.DSF || 1) };
try {
  R.res = await b.ev(`(() => {
    const gl = __ff.renderer.getContext(), px = new Uint8Array(4), out = {};
    const views = {
      verge: () => { __ff.warp({ x: 20, face: 1 }); },
      gate: () => { __ff.warp('verge-mid'); FF.Input.hold('right', true); for (let i = 0; i < 1800 && __ff.G.rabbit.x < 29.5; i++) __ff.tick(); FF.Input.release(); for (let i = 0; i < 720; i++) __ff.tick(); },
      drain: () => { __ff.warp('drain'); },
      courtyard: () => { __ff.warp({ x: 72.3, face: 1 }); },
      search: () => { __ff.warp('search-platform'); },
      searchAim: () => { __ff.warp({ id: 't', x: 99.0, face: 1 }); FF.G.flags.entryDone = true; FF.AI.setLoopT(9.5); for (let i = 0; i < 400 && FF.G.searcher.state !== 'aim'; i++) __ff.tick(); },
      rest: () => { __ff.warp({ x: 121.4, face: 1 }); },
      /* Sequence 2 (the machines running: their clocks start at these checkpoints) */
      hall: () => { __ff.warp('works-apron'); },
      pitA: () => { __ff.warp('works-pitA'); },
      passage: () => { __ff.warp({ x: 157.6, face: 1 }); },
      line: () => { __ff.warp('works-line'); },
      great: () => { __ff.warp('works-g2'); },
      out: () => { __ff.warp({ x: 202.0, face: 1 }); },
    };
    for (const tier of ['high', 'medium', 'low']) {
      __ff.setTier(tier); out[tier] = {};
      for (const v in views) {
        views[v](); for (let i = 0; i < 60; i++) __ff.tick(); __ff.flush(); __ff.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const ts = []; let calls = 0, tris = 0;
        for (let f = 0; f < 50; f++) { const t0 = performance.now(); __ff.tick(); __ff.tick(); __ff.draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); const ri = __ff.renderer.info.render; calls = ri.calls; tris = ri.triangles; }
        ts.sort((a, b) => a - b); const mean = ts.reduce((a, c) => a + c, 0) / ts.length;
        out[tier][v] = { mean: +mean.toFixed(1), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(1), calls, ktris: Math.round(tris / 1000), px: gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight };
      }
    }
    __ff.setTier('high'); return out; })()`, 600000);
} catch (e) { R.err = e.message; }
R.errs = b.errs; save('t-perf-' + W + 'x' + H + '-dsf' + (process.env.DSF || 1), R); console.log(JSON.stringify(R)); b.close(); process.exit(0);
