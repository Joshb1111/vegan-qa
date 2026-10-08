// Far Field, Sequence 2 (THE WORKS): the mechanism, events and worker tests W1-W12 (SEQUENCE-2.md §18), in the browser.
// Drives window.__ff (fixed steps, no drawing between checks) on ONE headless Chrome ($PORT, default 9921; devtools +100).
//   node docs/farfield/tests/t-works.mjs             (ONLY=W3,W5 for a subset; PAGE=<path> for another page than the game's)
// Needs the Sequence 2 modules wired into index.html and ff-main.js (INTERFACES.md, "Sequence 2 build: mechanism, events,
// humans"). Uses works-bot.js (the bot route) from this folder. Prints PASS / FAIL per check; exit code 0 = all pass.
import { launch, sleep } from './cdp.mjs'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const BOT = fs.readFileSync(path.join(HERE, 'works-bot.js'), 'utf8');
const PAGE = process.env.PAGE || '/farfield/index.html';
async function waitLoad() { for (let i = 0; i < 10; i++) { const l = os.loadavg()[0]; if (l <= 25) return; console.log('load', l.toFixed(1), 'waiting 60 s'); await sleep(60000); } }
function report(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + detail : '')); return ok; }
const HELPERS = `(() => {
  const A = ['left', 'right', 'up', 'down', 'jump', 'run'];
  window.__s2 = {
    log: [],
    listen(names) { for (const n of names) __ff.bus.on(n, d => __s2.log.push([n, +__ff.G.t.toFixed(4), JSON.parse(JSON.stringify(d || {})), +__ff.G.rabbit.x.toFixed(3), +__ff.G.rabbit.y.toFixed(3)])); },
    hold(want) { want = want || {}; for (const a of A) { const on = !!want[a]; if (on && !FF.Input.raw(a)) FF.Input.press(a); FF.Input.hold(a, on); } },
    /* step until pred(state) or max steps; plan(state) -> holds */
    go(max, plan, pred) { let i = 0; for (; i < max; i++) { const r = __ff.G.rabbit, s = { t: __ff.G.t, x: r.x, y: r.y, vx: r.vx, g: __ff.G }; if (pred && pred(s)) break; if (plan) __s2.hold(plan(s)); __ff.tick(); } __ff.flush(); return i; },
  };
  return true; })()`;
async function boot(q) {
  await waitLoad();
  const port = +(process.env.PORT || 9921);
  const b = await launch({ w: 1280, h: 640, gpu: true, port, dport: port + 100 });
  await b.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `
    Object.defineProperty(Document.prototype, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(Document.prototype, 'visibilityState', { get: () => 'visible', configurable: true });
    document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);` });
  await b.nav(PAGE + '?' + (q || 'cp=works-in&mute=1&seed=1&q=high'), 'window.__ff && __ff.ready === true', 120000);
  await sleep(300); await b.ev('__ff.pause(); true'); await b.ev(HELPERS);
  if (!(await b.ev('!!(window.FF && FF.Works && FF.Painter && FF.WorksFlow && FF.Lane && FF.Lane.merged())'))) { console.log('FAIL the Sequence 2 modules are not wired into ' + PAGE); b.close(); process.exit(1); }
  return b;
}
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const b = await boot();
let pass = 0, fail = 0; const R = (n, ok, d) => { report(n, ok, d) ? pass++ : fail++; };
const ev = (s, to) => b.ev(s, to || 600000);
await ev(BOT);
/* page-side helpers for the scenarios */
await ev(`(() => {
  window.__t = {
    /* warp to a real checkpoint (so a failure restarts there), then place the rabbit and set a machine phase */
    at(cp, o) { __ff.release(); __ff.warp(cp); const r = __ff.G.rabbit; o = o || {};
      if (o.x != null) { r.x = o.x; r.y = o.y != null ? o.y : FF.Level.floorUnder(o.x, FF.RULES.rabbit.hw * 0.9, 0.05, 0.03); r.vx = 0; r.vy = 0; r.grounded = true; r.face = o.face || 1; }
      if (o.P1 != null) FF.Works.setPhase('P1', o.P1); if (o.line != null) FF.Works.setPhase('line', o.line);
      __s2.log.length = 0; return true; },
    /* step n steps with fixed holds; collect facts */
    hold(n, want) { return __s2.go(n, () => want || {}); },
  };
  __s2.listen(['fail', 'press', 'sluice', 'works:shove', 'restart', 'checkpoint', 'painter', 'painter:noticed', 'ending', 'end', 'pullout', 'rest', 'works-start', 'leave', 'rabbit:jump']);
  return true; })()`);
const want = n => !only || only.includes(n);

/* ---------------- W1: the join and first sight */
if (want('W1')) for (const run of [false, true]) {
  const r = await ev(`(() => { __t.at('works-in'); let stuck = 0, minVx = 9, x127 = null;
    const n = __s2.go(120 * 30, s => ({ right: true, run: ${run} && s.x > 136.0 }), s => { if (s.x > 126.8 && s.x < 129.8) { minVx = Math.min(minVx, s.vx); } return s.x > 140.5 || __s2.log.some(e => e[0] === 'fail'); });
    const st = __s2.log.find(e => e[0] === 'works-start'), c = __s2.log.find(e => e[0] === 'press' && e[2].id === 'P1' && e[2].phase === 'contact');
    return { startX: st && st[3], startT: st && st[1], contactT: c && c[1], contactX: c && c[3], minVx, fails: __s2.log.filter(e => e[0] === 'fail').length, x: __ff.G.rabbit.x }; })()`);
  R('W1 ' + (run ? 'Shift run after the creep' : 'walk') + ': the slab walked over, works-start at 133.9, the first thud before the footprint',
    r.minVx > 0.8 && r.startX != null && Math.abs(r.startX - 133.9) < 0.02 && r.contactX != null && r.contactX < 140.02 && r.contactT - r.startT > 3.99 && r.contactT - r.startT < 4.02 && r.fails === 0,
    `min vx over the slab ${r.minVx.toFixed(2)}; works-start at x ${r.startX}; contact ${(r.contactT - r.startT).toFixed(3)} s later with the rabbit at x ${r.contactX}`);
}

/* ---------------- W3: the cut on the step (standing / crouched; P1, Q3), the failure flow timings, the restart phase */
if (want('W3')) for (const c of [{ id: 'P1', cp: 'works-apron', x: 143.6, ph: { P1: 23.5 }, rel: 'P1', exp: 3.887 }, { id: 'P1 crouched', cp: 'works-pitA', x: 143.6, ph: { P1: 23.5 }, down: true, exp: 3.92 },
                                  { id: 'Q3', cp: 'works-g2', x: 183.0, ph: { line: 7.5 }, exp: 3.909 }, { id: 'Q3 crouched', cp: 'works-g2', x: 183.0, ph: { line: 7.5 }, down: true, exp: 3.94 }]) {
  const r = await ev(`(() => { __t.at('${c.cp}', Object.assign({ x: ${c.x}, y: 0 }, ${JSON.stringify(c.ph)}));
    const out = { rel: null, cut: null, cutPh: null, fadeAtCut: null, restartAt: null, controlAt: null, picAt: null, phAfter: null, x: null };
    let k = 0;
    for (let i = 0; i < 120 * 8; i++) {
      __s2.hold(${c.down ? '{ down: true }' : '{}'}); __ff.tick();
      const L = __s2.log; const rel = L.find(e => e[0] === 'press' && e[2].phase === 'release' && e[2].id === '${c.id.split(' ')[0]}');
      if (rel && out.rel == null) out.rel = rel[1];
      const f = L.find(e => e[0] === 'fail'); if (f && out.cut == null) { out.cut = f[1]; out.by = f[2].by; __ff.flush(); out.fadeAtCut = __ff.G.fade; out.ctlAtCut = __ff.G.control; }
      const rs = L.find(e => e[0] === 'restart'); if (rs && out.restartAt == null) { out.restartAt = rs[1]; out.phAfter = __ff.works; out.x = __ff.G.rabbit.x; out.cp = __ff.G.checkpoint; }
      if (out.restartAt != null && out.controlAt == null && __ff.G.control) out.controlAt = __ff.G.t;
      if (out.controlAt != null && out.picAt == null && __ff.G.fade <= 0.001) { out.picAt = __ff.G.t; break; }
    }
    return out; })()`);
  const dt = r.cut - r.rel;
  R(`W3 the cut under ${c.id}: ${dt.toFixed(3)} s after the clank (expected ${c.exp}, at most 2 steps later: the Player lowers the back by itself in those last frames), black at once, restart / control / picture`,
    r.cut != null && dt >= c.exp - 0.0005 && dt <= c.exp + 0.0175 && r.fadeAtCut >= 1 && r.ctlAtCut === false && Math.abs(r.restartAt - r.cut - 0.8) < 0.03 && Math.abs(r.controlAt - r.cut - 1.0) < 0.03 && Math.abs(r.picAt - r.cut - 1.25) < 0.03,
    `by ${r.by}; restart +${(r.restartAt - r.cut).toFixed(3)} at ${r.cp} x ${r.x && r.x.toFixed(2)}, control +${(r.controlAt - r.cut).toFixed(3)}, picture +${(r.picAt - r.cut).toFixed(3)}; machines after: ${JSON.stringify(c.id.startsWith('P1') ? r.phAfter.P1 : r.phAfter.line)}`);
}

/* ---------------- W4: the chamfer shove (a tail under the edge is pushed clear; the centre inside is the cut) */
if (want('W4')) for (const c of [{ n: 'P1 left edge, tail 0.10 under', cp: 'works-apron', x: 140.0 - 0.16 + 0.10, ph: { P1: 23.5 }, to: 139.83, ok: 'shove' },
                                  { n: 'Q1 right edge, tail 0.10 under', cp: 'works-g1', x: 173.2 + 0.16 - 0.10, face: -1, ph: { line: 15.5 }, to: 173.37, ok: 'shove' },
                                  { n: 'Q3 left edge from G2, nose 0.15 under', cp: 'works-g2', x: 181.0 - 0.16 + 0.15, ph: { line: 7.5 }, to: 180.83, ok: 'shove' },
                                  { n: 'P1 centre 0.03 inside the edge', cp: 'works-apron', x: 140.05, ph: { P1: 23.5 }, ok: 'cut' }]) {
  const r = await ev(`(() => { __t.at('${c.cp}', Object.assign({ x: ${c.x}, y: 0, face: ${c.face || 1} }, ${JSON.stringify(c.ph)})); __s2.go(120 * 5, () => ({})); const L = __s2.log;
    return { shove: L.filter(e => e[0] === 'works:shove').map(e => e[2]), fail: L.filter(e => e[0] === 'fail').map(e => e[2]), x: +__ff.G.rabbit.x.toFixed(3) }; })()`);
  const ok = c.ok === 'shove' ? r.fail.length === 0 && r.shove.length === 1 && Math.abs(r.x - c.to) < 0.02 : r.fail.length === 1;
  R('W4 ' + c.n + ' -> ' + c.ok, ok, JSON.stringify(r));
}

/* ---------------- W5: the gate (sluice): standing in it as it closes is never a cut (review fixes 8 Oct: carried clear to the side its
   centre is on); leaving within 1 s of passable gets through */
if (want('W5')) {
  for (const [x, side] of [[145.62, 'slot B'], [145.68, 'the sill']]) {
    const r = await ev(`(() => { __t.at('works-pitB', { x: ${x}, y: -0.40, P1: 7.5 }); let ph = null; __s2.go(120 * 5, () => ({}), () => { const s = __s2.log.find(e => e[0] === 'works:shove'); if (s && ph == null) ph = FF.Works.clock('P1'); return false; });
      return { fails: __s2.log.filter(e => e[0] === 'fail').length, shove: __s2.log.filter(e => e[0] === 'works:shove').map(e => e[2]), ph: ph && +ph.toFixed(3), x: +__ff.G.rabbit.x.toFixed(3), y: +__ff.G.rabbit.y.toFixed(2) }; })()`);
    R(`W5 standing in the gate (x ${x}) as it closes: carried clear to ${side}, never a cut`, r.fails === 0 && r.shove.length === 1 && r.shove[0].kind === 'gate' && (side === 'slot B' ? r.x <= 145.44 : r.x >= 145.86), JSON.stringify(r));
  }
  for (const lateBy of [0, 0.5, 1.0]) {
    const q = await ev(`(() => { __t.at('works-pitB', { P1: 3.0 }); let go = null; const n = __s2.go(120 * 14, s => { const g = FF.Works.sluice(); if (go == null && g.gap >= 0.18) go = s.t + 0.6 + ${lateBy}; return go != null && s.t >= go ? { right: true } : {}; }, s => (s.x > 146.9 && s.y < -0.9) || __s2.log.some(e => e[0] === 'fail'));
      return { x: +__ff.G.rabbit.x.toFixed(2), y: +__ff.G.rabbit.y.toFixed(2), fails: __s2.log.filter(e => e[0] === 'fail').length }; })()`);
    R(`W5 leaving ${lateBy + 0.6} s after the gate is passable: through into the culvert`, q.fails === 0 && q.x > 146.85 && q.y < -0.9, JSON.stringify(q));
  }
  const back = await ev(`(() => { __t.at('works-pitB', { P1: 3.0 }); __s2.go(120 * 8, () => ({ right: true }), s => s.x > 147.5); const x1 = __ff.G.rabbit.x; __s2.go(120 * 6, () => ({ left: true })); return { x1: +x1.toFixed(2), x2: +__ff.G.rabbit.x.toFixed(2), y2: +__ff.G.rabbit.y.toFixed(2) }; })()`);
  R('W2 the culvert drop is one-way', back.x2 > 146.1 && back.y2 < -0.9, JSON.stringify(back));
}

/* ---------------- W2: the first press, every 2 s of arrival phase, three ways (pits / direct / wall): no cut, through */
if (want('W2')) {
  const res = [];
  for (const p1 of ['pits', 'direct', 'wall']) for (let ph = 0; ph < 24; ph += 2) {
    const q = await ev(`(() => { __t.at('works-apron', { x: 139.4, P1: ${ph} }); const bot = __worksBot({ p1: '${p1}', painter: 'walk' }); const n = __s2.go(120 * 90, s => bot(s), s => s.x > 147.0 && s.y < -0.9 || __s2.log.some(e => e[0] === 'fail'));
      return { ph: ${ph}, p1: '${p1}', t: +(n / 120).toFixed(1), x: +__ff.G.rabbit.x.toFixed(2), fails: __s2.log.filter(e => e[0] === 'fail').map(e => e[2].by + '@' + e[3].toFixed(2)), log: bot.state().log.slice(-4) }; })()`);
    res.push(q);
  }
  const bad = res.filter(q => q.fails.length || q.x < 147.0);
  R(`W2 the first press: ${res.length - bad.length}/${res.length} bot runs through alive (pits / direct / wall, every 2 s of arrival phase)`, bad.length === 0, bad.slice(0, 4).map(q => JSON.stringify(q)).join(' | ') + ` · times ${Math.min(...res.map(q => q.t))}-${Math.max(...res.map(q => q.t))} s`);
  /* walked into pit A while P1 hangs still, then it comes down over the rabbit: flat ('hide'), breath held, ears down; it rises: up again */
  const flat = await ev(`(() => { __t.at('works-apron', { x: 139.4, P1: 14.0 }); __s2.go(120 * 4, s => s.x < 142.0 ? { right: true } : {});
    const before = { pose: __ff.state().player.pose, mood: __ff.state().player.mood };
    __s2.go(120 * 14, () => ({}), () => FF.Works.press('P1').state === 'down' && FF.Works.clock('P1') > 4.6);
    const p = __ff.state().player; const under = { pose: p.pose, mood: p.mood, held: p.breath.held, works: p.works, P1: __ff.works.P1.state, x: +__ff.G.rabbit.x.toFixed(2) };
    __s2.go(120 * 9, () => ({}), () => FF.Works.press('P1').state === 'up'); __s2.go(120 * 3, () => ({}));
    const q = __ff.state().player; return { before, under, after: { pose: q.pose, mood: q.mood, held: q.breath.held }, fails: __s2.log.filter(e => e[0] === 'fail').length }; })()`);
  R('W2 in pit A as the press comes down over it: flat, breath held, afraid; calmer once it has risen', flat.fails === 0 && flat.under.pose === 'hide' && flat.under.held && flat.under.mood === 'afraid' && flat.after.pose !== 'hide', JSON.stringify(flat));
}

/* ---------------- W2 (review fixes 8 Oct): the slots as shelters, all the way */
if (want('W2')) {
  /* a pressed-down press is solid from inside its slot: holding a direction (Shift too) never carries the rabbit up a ramp into the iron */
  const rows = [];
  for (const [cp, clock, ph, x0, dir, id] of [['works-pitA', 'P1', 4.3, 142.1, 'right', 'P1'], ['works-pitA', 'P1', 4.3, 142.1, 'left', 'P1'], ['works-pitB', 'P1', 4.3, 145.0, 'left', 'P1'], ['works-pitC', 'line', 12.1, 185.6, 'right', 'Q3'], ['works-pitC', 'line', 12.1, 185.6, 'left', 'Q3']]) {
    rows.push(await ev(`(() => { __t.at('${cp}', { x: ${x0}, y: -0.40, ${clock}: ${ph} }); const r = __ff.G.rabbit, hw = FF.RULES.rabbit.hw; let minClear = 9, x1 = r.x;
      __s2.go(120 * 4, () => ({ ${dir}: true, run: true }), () => { const p = FF.Works.press('${id}'); if (p.state !== 'down') return true; if (r.x + hw > p.x0 && r.x - hw < p.x1) minClear = Math.min(minClear, p.y - r.y); x1 = r.x; return false; });
      return { case: '${cp} ${dir}', x: +x1.toFixed(3), minClear: +minClear.toFixed(3), fails: __s2.log.filter(e => e[0] === 'fail').length }; })()`));
  }
  R('W2 a pressed-down press is solid from inside its slot (holding a direction with Shift, slots A, B, C): the floor never closer than 0.18 m to the iron', rows.every(q => q.minClear >= 0.179 && q.fails === 0), JSON.stringify(rows));
  /* standing anywhere in a slot's dark notch (its ramps) as the press comes down: slides into the core, never cut */
  const ramps = [];
  for (const [cp, clock, pre, x] of [['works-apron', 'P1', 23.0, 141.3], ['works-apron', 'P1', 23.0, 141.5], ['works-apron', 'P1', 23.0, 142.8], ['works-apron', 'P1', 23.0, 143.05], ['works-apron', 'P1', 23.0, 144.3], ['works-g2', 'line', 7.0, 184.45], ['works-g2', 'line', 7.0, 186.75]]) {
    ramps.push(await ev(`(() => { __t.at('${cp}', { x: ${x}, ${clock}: ${pre} }); __s2.go(120 * 6, () => ({}));
      return { x0: ${x}, x: +__ff.G.rabbit.x.toFixed(3), slid: __s2.log.filter(e => e[0] === 'works:shove' && e[2].kind === 'ramp').length, fails: __s2.log.filter(e => e[0] === 'fail').length }; })()`));
  }
  R('W2 standing on a slot\'s ramp (inside its dark notch) as the press comes down: slides into the core, never cut', ramps.every(q => q.fails === 0 && q.slid === 1), JSON.stringify(ramps));
  /* a startled hop in a slot while its press comes down: none (the rabbit stays down), never cut, never onto the bed's end */
  const hops = [];
  for (const [cp, x, ph, keys] of [['works-pitA', 142.1, 3.7, '{ jump: true }'], ['works-pitB', 145.2, 0.5, '{ jump: true, right: true }'], ['works-pitB', 145.2, 2.5, '{ jump: true, right: true }']]) {
    hops.push(await ev(`(() => { __t.at('${cp}', { x: ${x}, y: -0.40, P1: ${ph} }); FF.Input.press('jump'); __s2.go(30, () => (${keys})); __s2.go(120 * 3, () => ({}));
      return { cp: '${cp}', ph: ${ph}, jumps: __s2.log.filter(e => e[0] === 'rabbit:jump').length, fails: __s2.log.filter(e => e[0] === 'fail').length, y: +__ff.G.rabbit.y.toFixed(2) }; })()`));
  }
  R('W2 a startled hop in a slot as its press comes down: the rabbit stays down (no hop), never cut', hops.every(q => q.jumps === 0 && q.fails === 0 && q.y < -0.3), JSON.stringify(hops));
  /* the culvert drop is one-way, hops included (the steel angle along the sill) */
  const back2 = await ev(`(() => { __t.at('works-pitB', { x: 146.6, y: -1.0, P1: 5.0 }); let i = 0; __s2.go(120 * 6, () => ({ left: true, run: true, jump: (i++ % 60) < 3 })); return { x: +__ff.G.rabbit.x.toFixed(2), y: +__ff.G.rabbit.y.toFixed(2) }; })()`);
  R('W2 the culvert drop is one-way, hops included', back2.x > 146.1 && back2.y < -0.9, JSON.stringify(back2));
}

/* ---------------- W6: the passage and the worker */
if (want('W6')) {
  const a = await ev(`(() => { __t.at('works-passage'); const bot = __worksBot({ painter: 'wait', stopAt: 166.0 }); __s2.go(120 * 40, s => bot(s), s => s.x >= 165.9); return { looks: __s2.log.filter(e => e[0] === 'painter:noticed').length, x: __ff.G.rabbit.x, p: __ff.painter }; })()`);
  R('W6 waiting in the dark and passing while he scrapes: never noticed', a.looks === 0 && a.x >= 165.9, JSON.stringify(a.p));
  const c = await ev(`(() => { __t.at('works-passage'); const bot = __worksBot({ painter: 'careless', stopAt: 166.0 }); __s2.go(120 * 50, s => bot(s), s => s.x >= 165.9);
    const L = __s2.log.filter(e => e[0] === 'painter').map(e => [e[1], e[2].phase, e[2].step]); const n = __s2.log.filter(e => e[0] === 'painter:noticed');
    const hold = L.find(e => e[2] === 'hold'), lower = L.find(e => e[2] === 'lower'); return { noticed: n.map(e => e[2]), seq: L.filter(e => !/scrape|stop|dip/.test(e[1]) || e[2] === 'scrape-hard').slice(0, 12), hold: hold && lower ? +(lower[0] - hold[0]).toFixed(3) : null, fails: __s2.log.filter(e => e[0] === 'fail').length, x: __ff.G.rabbit.x }; })()`);
  R('W6 careless in his light at his turn: the look (2.0 s hold), then back to work; never a failure', c.noticed.length >= 1 && Math.abs(c.hold - 2.0) < 0.02 && c.fails === 0 && c.x >= 165.9, JSON.stringify(c));
  const again = await ev(`(() => { __t.at('works-passage', { x: 159.6, y: 0 }); FF.Painter.setLoopT(8.2); const t = []; __s2.go(120 * 40, () => ({}), () => { const n = __s2.log.filter(e => e[0] === 'painter:noticed'); if (n.length > t.length) t.push(n[n.length - 1][1]); return false; }); return { looks: t.map(v => +v.toFixed(2)), gap: t.length > 1 ? +(t[1] - t[0]).toFixed(2) : null, fails: __s2.log.filter(e => e[0] === 'fail').length }; })()`);
  R('W6 still in his light after the look: he scrapes a full loop before he turns again (no second look a second later)', again.looks.length >= 1 && (again.gap == null || again.gap >= 16) && again.fails === 0, JSON.stringify(again));
  const p = await ev(`(() => { __t.at('works-passage', { x: 156.2, y: 0 }); FF.Painter.setLoopT(0); let maxS = 0; __s2.go(120 * 24, () => ({ down: true }), () => { maxS = Math.max(maxS, FF.Painter.debug().s); return false; }); return { maxS, looks: __s2.log.filter(e => e[0] === 'painter:noticed').length }; })()`);
  R('W6 under the paint pallet (crouched) through two of his loops: never seen', p.maxS === 0 && p.looks === 0, JSON.stringify(p));
  let n = 0, looks = 0, fails = 0;
  for (let k = 0; k < 12; k += 1) { const q = await ev(`(() => { __t.at('works-passage', { x: 158.1, y: 0 }); FF.Painter.setLoopT(${k}); __s2.go(120 * 12, () => ({ right: true }), s => s.x > 165.9); return { looks: __s2.log.filter(e => e[0] === 'painter:noticed').length, fails: __s2.log.filter(e => e[0] === 'fail').length }; })()`); n++; if (q.looks) looks++; fails += q.fails; }
  R('W6 walking straight past at every second of his loop: never a failure', fails === 0, `${looks}/${n} starts were noticed (the look), ${fails} failures`);
}

/* ---------------- W7: the designed flow (wait on the entry floor, leave 0.6 s after Q1 is passable, keep walking) */
if (want('W7')) {
  const r = await ev(`(() => { __t.at('works-line', { x: 168.4, line: 4.5 }); const bot = __worksBot({ line: 'continuous', end: 'none' }); let left = null, atRel = null, q1pass = null;
    const n = __s2.go(120 * 60, s => { if (q1pass == null && FF.Works.press('Q1').passable) q1pass = s.t; const h = bot(s); if (left == null && bot.state().log.some(l => /on past Q1/.test(l))) left = s.t;
        const L = __s2.log.filter(e => e[0] === 'press' && e[2].id === 'Q3' && e[2].phase === 'release' && e[3] > 180); if (L.length && atRel == null) atRel = +L[0][3].toFixed(2); return h; },
      s => s.x > 189.9 || __s2.log.some(e => e[0] === 'fail'));
    return { q1pass: q1pass && +(q1pass).toFixed(2), left: left && +left.toFixed(2), atRel, x: __ff.G.rabbit.x, fails: __s2.log.filter(e => e[0] === 'fail').length, t: +(n / 120).toFixed(1), log: bot.state().log }; })()`);
  R('W7 the designed flow: at pit C as the great press clanks; out alive', r.fails === 0 && r.x > 189.85 && r.atRel != null && r.atRel >= 184.4 && r.atRel <= 185.95, JSON.stringify(r));
  /* review fixes 8 Oct: the climax as a player meets it: the designed flow, then stop where the rabbit is 0.6 / 1.4 / 2.0 s after the great press's clank */
  const stops = [];
  for (const after of [0.6, 1.4, 2.0]) {
    stops.push(await ev(`(() => { __t.at('works-line', { x: 168.4, line: 4.5 }); let go = null, rel = null, relX = null;
      const n = __s2.go(120 * 60, s => { const q1 = FF.Works.press('Q1'), q3 = FF.Works.press('Q3'); if (go == null && q1.state === 'rise' && q1.passable) go = s.t + 0.6;
          if (rel == null && go != null && s.t > go && q3.state === 'release' && s.x > 179) { rel = s.t; relX = s.x; }
          if (rel != null && s.t >= rel + ${after}) return {}; return go != null && s.t >= go ? { right: true } : {}; },
        s => __s2.log.some(e => e[0] === 'fail') || (rel != null && s.t > rel + 6));
      return { after: ${after}, relX: relX && +relX.toFixed(2), x: +__ff.G.rabbit.x.toFixed(2), fails: __s2.log.filter(e => e[0] === 'fail').length, slid: __s2.log.filter(e => e[0] === 'works:shove' && e[2].kind === 'ramp').length }; })()`));
  }
  R('W7 the climax: stopping 0.6, 1.4 or 2.0 s after the great press clanks (wherever that is in the slot) is safe', stops.every(q => q.fails === 0 && q.relX != null && q.relX >= 184.2 && q.relX <= 185.2), JSON.stringify(stops));
}

/* ---------------- W8: the long hall from every 2 s of arrival phase, four ways */
if (want('W8')) {
  for (const line of ['continuous', 'fleeRun', 'cautious', 'runner']) {
    const res = [];
    for (let ph = 0; ph < 16; ph += (process.env.FULL ? 1 : 2)) {
      const q = await ev(`(() => { __t.at('works-line', { x: 168.9, line: ${ph} }); const bot = __worksBot({ line: '${line}', end: 'none' }); const n = __s2.go(120 * 90, s => bot(s), s => s.x > 189.9 || __s2.log.some(e => e[0] === 'fail'));
        return { ph: ${ph}, t: +(n / 120).toFixed(1), x: __ff.G.rabbit.x, fails: __s2.log.filter(e => e[0] === 'fail').map(e => e[2].by + '@' + e[3].toFixed(2)), pitC: bot.state().log.some(l => /pit-C/.test(l)), log: bot.state().log.slice(-5) }; })()`);
      res.push(q);
    }
    const bad = res.filter(q => q.fails.length || q.x <= 189.85);
    R(`W8 the long hall, ${line}: ${res.length - bad.length}/${res.length} out alive`, bad.length === 0, (bad.slice(0, 3).map(q => JSON.stringify(q)).join(' | ') || '') + ` · ${Math.min(...res.map(q => q.t))}-${Math.max(...res.map(q => q.t))} s; pit C used in ${res.filter(q => q.pitC).length}`);
  }
}

/* ---------------- W9: every S2 checkpoint: the restart in its core, the danger seen, the way open 2.5-7 s after */
if (want('W9')) {
  const rows = await ev(`(() => { const out = [];
    for (const c of FF.S2.checkpoints.filter(k => k.works)) {
      __ff.release(); FF.Game.restart(c.id, { reason: 'fail' }); FF.Game.control(true); __ff.G.fade = 0;
      const r = __ff.G.rabbit, sh = FF.S2.shelters.find(s => s.checkpoint === c.id), inCore = !!sh && r.x >= sh.core[0] && r.x <= sh.core[1];
      const ahead = c.id === 'works-pitC' ? 'Q3' : c.works.P1 != null ? 'P1' : ['Q1', 'Q2', 'Q3'].find(q => FF.Works.machine(q).x0 > r.x);
      let t = 0, open = null, contact = null, fails = 0; const off = __ff.bus.on('fail', () => fails++);
      for (let i = 0; i < 120 * 12; i++) { __ff.tick(); t += 1 / 120; const p = FF.Works.press(ahead);
        if (contact == null && p.state === 'down') contact = t;
        const way = c.id === 'works-pitB' ? (FF.Works.sluice().passable && FF.Works.sluice().state !== 'close') : (p.state === 'rise' && p.passable) || (p.state === 'up' && contact != null);
        if (open == null && way) { open = t; break; } }
      off(); out.push({ id: c.id, inCore, ahead, contact: contact == null ? null : +contact.toFixed(2), open: open == null ? null : +open.toFixed(2), fails });
    } return out; })()`);
  for (const q of rows) R(`W9 ${q.id}: restart in its core, the way on opens ${q.open} s after (2.5-7)`, q.inCore && q.open >= 2.5 && q.open <= 7.0 && q.fails === 0, JSON.stringify(q));
}

/* ---------------- W10: the endings */
if (want('W10')) {
  const b1 = await ev(`(() => { __t.at('works-out'); __s2.go(120 * 20, () => ({ right: true }), s => s.x >= 210.0); const x1 = __ff.G.rabbit.x; __s2.go(120 * 6, () => ({ left: true }), s => s.x < 208.3); __s2.go(120 * 3, () => ({}));
    const mid = { mode: __ff.G.mode, fade: __ff.G.fade, endings: __s2.log.filter(e => e[0] === 'ending').map(e => e[2].phase) };
    __s2.go(120 * 20, () => ({ right: true }), s => __ff.G.mode !== 'play'); __ff.flush();
    return { mid, end: __s2.log.filter(e => e[0] === 'ending' || e[0] === 'end').map(e => e[2].phase + '@' + e[3].toFixed(1)), mode: __ff.G.mode }; })()`);
  R('W10 (b) walk on: turning back at 210 cancels; walking on fades and ends at the card', b1.mid.mode === 'play' && b1.mid.fade < 0.01 && b1.mid.endings.join() === 'leave,cancel' && b1.mode === 'end' && b1.end.includes('card@' + b1.end.find(e => /^card/.test(e)).split('@')[1]), JSON.stringify(b1));
  await ev(`FF.Game.toTitle(); true`);
  const a1 = await ev(`(() => { __t.at('works-out', { x: 202.0 }); __s2.go(60, () => ({})); __ff.fire('end', { phase: 'settled', x: 202.0 }); __s2.go(120 * 6, () => ({}));
    const started = __s2.log.filter(e => e[0] === 'pullout').map(e => e[2].phase + '@' + e[2].seq); __s2.go(120 * 1, () => ({ left: true })); __s2.go(120 * 1, () => ({}));
    return { started, after: __s2.log.filter(e => e[0] === 'pullout').map(e => e[2].phase + ':' + e[2].cause), mode: __ff.G.mode, control: __ff.G.control }; })()`);
  R('W10 (a) rest: settled -> 4 s -> the pull-out; input before the fade brings it back', a1.started.join() === 'start@2' && a1.after.includes('return:input') && a1.mode === 'play', JSON.stringify(a1));
  const a2 = await ev(`(() => { __t.at('works-out', { x: 202.0 }); __s2.go(60, () => ({})); __ff.fire('end', { phase: 'settled', x: 202.0 }); __s2.go(120 * 20, () => ({}), () => __ff.G.mode !== 'play'); __ff.flush();
    return { seq: __s2.log.filter(e => e[0] === 'pullout' || e[0] === 'ending' || e[0] === 'end').map(e => e[0] + ':' + e[2].phase + '@' + e[1].toFixed(2)), mode: __ff.G.mode }; })()`);
  R('W10 (a) rest left alone: the pull-out, the fade, the card', a2.mode === 'end' && a2.seq.some(s => /end:card/.test(s)), JSON.stringify(a2));
  await ev(`FF.Game.toTitle(); true`);
}

/* ---------------- W11: the join (Sequence 1's rest): optional pull-out that returns; nothing settles past 127.0 */
if (want('W11')) {
  const j = await ev(`(() => { __t.at('rest', { x: 121.0 }); __s2.go(60, () => ({})); __ff.fire('end', { phase: 'settled', x: 121.0 }); __s2.go(120 * 17, () => ({}));
    return { seq: __s2.log.filter(e => e[0] === 'pullout' || e[0] === 'ending' || (e[0] === 'end' && e[2].phase !== 'settled')).map(e => e[0] + ':' + e[2].phase + ':' + (e[2].cause || '') + '@' + e[1].toFixed(1)), mode: __ff.G.mode, control: __ff.G.control, fade: __ff.G.fade }; })()`);
  R('W11 Sequence 1 settled: the pull-out to the Works and back to play (no fade, no card)', j.mode === 'play' && j.control && j.fade < 0.01 && j.seq.length === 2 && /start/.test(j.seq[0]) && /return:time/.test(j.seq[1]), JSON.stringify(j));
  const k = await ev(`(() => { __t.at('works-in', { x: 128.0 }); __s2.go(120 * 8, () => ({})); return { rest: __s2.log.filter(e => e[0] === 'rest').length, settled: __s2.log.filter(e => e[0] === 'end').length }; })()`);
  R('W11 standing still on the slab (x 128) for 8 s never starts the Sequence 1 settle', k.rest === 0, JSON.stringify(k));
  /* review fixes 8 Oct: a rabbit that has reached the Works and walks back into the Search (or is placed there) never takes a Search
     cover as its checkpoint again (ff-events.js only knew the id 'rest') */
  const back = await ev(`(() => { const out = []; for (const c of FF.S1.covers.filter(k => k.checkpoint && k.core)) { __t.at('works-apron'); const r = __ff.G.rabbit; r.x = (c.core[0] + c.core[1]) / 2; r.y = FF.Level.floorUnder(r.x, FF.RULES.rabbit.hw * 0.9, 0.05, 0.03); r.vx = 0;
      if (FF.AI && FF.AI.reset) {} __s2.go(120, () => ({})); out.push(c.checkpoint + '->' + __ff.G.checkpoint); } return out; })()`);
  R('W11 back in the Search from the Works, a Search cover never becomes the checkpoint again', back.length > 0 && back.every(s => /->works-apron$/.test(s)), JSON.stringify(back));
  const ch = await ev(`(() => ({ edge: FF.Level.solid('channel-edge'), restTrig: FF.Level.data.triggers.find(t => t.id === 'rest'), restZone: FF.S1.camera.zones.find(z => z.id === 'rest') }))()`);
  R('W11 the lane: no channel-edge stop; rest trigger 116-127 with no auto-stop; rest camera without maxX', !ch.edge && ch.restTrig.alt.x1 === 127 && ch.restTrig.autoStopAfter == null && ch.restZone.maxX == null, JSON.stringify(ch));
}

/* ---------------- W12: the real settle chains (the Player's), no fired events */
if (want('W12')) {
  const r1 = await ev(`(() => { __t.at('rest', { x: 121.5 }); __s2.go(120 * 40, () => ({}), () => __s2.log.some(e => e[0] === 'pullout' && e[2].phase === 'start'));
    const startedAt = __ff.G.t, x0 = __ff.G.rabbit.x, locked = __ff.state().player.locked; __s2.go(120 * 1.5, () => ({ right: true }));
    return { started: __s2.log.some(e => e[0] === 'pullout' && e[2].phase === 'start'), back: __s2.log.filter(e => e[0] === 'pullout').map(e => e[2].phase + ':' + (e[2].cause || '')), locked, moved: +(__ff.G.rabbit.x - x0).toFixed(2), mode: __ff.G.mode, cam: __ff.state().camera && __ff.state().camera.shot }; })()`);
  R('W12 Sequence 1 rest, the real settle chain: the optional pull-out; walking on brings the camera back and the rabbit moves (no lock)', r1.started && r1.back.includes('return:input') && !r1.locked && r1.moved > 0.5 && r1.mode === 'play', JSON.stringify(r1));
  const r2 = await ev(`(() => { __t.at('works-out'); __s2.go(120 * 12, s => s.x < 202.4 ? { right: true } : {}, s => s.x >= 202.4); __s2.go(120 * 60, () => ({}), () => __ff.G.mode !== 'play'); __ff.flush();
    return { seq: __s2.log.filter(e => e[0] === 'pullout' || e[0] === 'ending' || e[0] === 'end').map(e => e[0] + ':' + e[2].phase), mode: __ff.G.mode }; })()`);
  R('W12 under the pipe, the real settle chain left alone: the pull-out, the fade, the card', r2.mode === 'end' && r2.seq.includes('pullout:start') && r2.seq.includes('end:card'), JSON.stringify(r2));
  await ev(`FF.Game.toTitle(); true`);
}

const errs = await ev('__ff.state().errors');
R('console clean (no module errors, no exceptions)', errs.length === 0 && b.errs.length === 0, JSON.stringify(errs.slice(0, 3)) + ' ' + JSON.stringify(b.errs.slice(0, 5)));
console.log(`\n${fail ? 'FAIL' : 'PASS'} (${pass}/${pass + fail})`);
b.close(); process.exit(fail ? 1 : 0);
