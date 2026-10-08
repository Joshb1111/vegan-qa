// The real models (8 Oct): the Tripo rabbit (?rabbit=tripo) and Josh's three guard models (?people=models), each behind its switch.
// Checks, in the real game (headless Chrome, frames stepped via __ff): the console is clean with the switches off and on, in Sequence 1 and
// at ?start=works; each figure appears in its role with the right clip; the rabbit's and the people's planted feet (slide-page.js); the
// torch's light sits on the model's torch_emitter; the people's AI and positions are the same with the models as without.
// node t-models.mjs (PORT as lib.mjs). Writes out/t-models.json. PROGRESS_DIR: also saves the progress shots there (models-NN-name.jpg).
import { boot, OUT, sleep } from './lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const DIR = path.dirname(new URL(import.meta.url).pathname), PROG = process.env.PROGRESS_DIR || null;
const R = { checks: [], shots: [] };
const ck = (name, ok, info) => { R.checks.push({ name, ok: !!ok, info }); console.log(ok ? 'PASS' : 'FAIL', name, info === undefined ? '' : JSON.stringify(info)); };
const BASE = 'q=high&seed=1&mute=1&clean=1';
/* the progress shots, in this order (1280x640 JPEGs): models-NN-name.jpg */
const ORDER = ['rabbit-light-pool', 'gate-person-torch-down', 'gate-person-sweep', 'walkway-worker-rail', 'searcher-torch', 'searcher-aim-door', 'painter-scrapes', 'standin-searcher-torch'];
async function shot(b, name, dx, dy, dz, role) {
  /* a close-up: the game's own camera moved nearer after it framed the figure (nothing else differs) */
  if (role === 'rabbit') await b.ev(`(function(){ const g = FF.G.rabbit, c = __ff.camera; c.position.set(g.x + 0.35, g.y + 0.32, 2.3); c.updateMatrixWorld(); __ff.draw(); return true; })()`);
  else if (role) await b.ev(`(function(){ const f = FF.Humans.figures.find(f => f.role === '${role}'); const c = __ff.camera; c.position.set(f.st.x + ${dx || 0}, f.st.y + ${dy == null ? 1.0 : dy}, f.st.z + ${dz == null ? 4.4 : dz}); c.updateMatrixWorld(); __ff.draw(); return true; })()`);
  else await b.ev('__ff.draw(); true');
  const f = path.join(OUT, 'models-' + name + '.jpg'); await b.shot(f, 88); R.shots.push(path.basename(f));
}
/* the people's planted feet: slide of the ball of the foot (a model's ToeBase; the stand-in's foot bone, its ankle, which it pins) while it is within 12 mm
   of its lowest, m/s. (A model's ankle rolls over the foot: heel to toe moves it a few cm in a stance, which isn't sliding.) */
const HS = `window.HSLIDE = function (n) { const v = new THREE.Vector3(); const figs = FF.Humans.figures.filter(f => f.st.visible), rec = figs.map(() => ({ L: [], R: [] }));
  for (let i = 0; i < n; i += 2) { __ff.step(2, false); __ff.flush(); figs.forEach((f, k) => { for (const s of ['L', 'R']) { const b = (f.model && f.model.guard && f.model.bone['mixamorig' + (s === 'L' ? 'Left' : 'Right') + 'ToeBase']) || f.bones['foot' + s]; b.getWorldPosition(v); rec[k][s].push([v.x, v.y - (f.st.y || 0), v.z]); } }); }
  __ff.draw(); return figs.map((f, k) => { const o = { role: f.role, anim: f.st.anim }; for (const s of ['L', 'R']) { const r = rec[k][s], mn = Math.min(...r.map(p => p[1])); let sl = 0, c = 0;
    for (let i = 1; i < r.length; i++) if (r[i][1] < mn + 0.012 && r[i - 1][1] < mn + 0.012) { sl += Math.hypot(r[i][0] - r[i - 1][0], r[i][2] - r[i - 1][2]) * 60; c++; } o[s] = { slide: c ? +(sl / c).toFixed(3) : 0, ground: +(c / Math.max(1, r.length - 1)).toFixed(2) }; } return o; }); }; true`;
const fig = (b, role) => b.ev(`(function(){ const f = FF.Humans.figures.find(f => f.role === '${role}'); const M = f.model; return { anim: f.st.anim, clip: M && M.curName, kind: M && M.curKind, vis: f.st.visible, torch: !!f.st.torch.on, x: +f.st.x.toFixed(2), z: +f.st.z.toFixed(2), speed: +(f.st.speed || 0).toFixed(2), model: !!(M && M.guard) }; })()`);
/* the torch light sits on the model's torch_emitter: distance from the World spot's position to the emitter, m */
const torchOff = (b, role) => b.ev(`(function(){ const f = FF.Humans.figures.find(f => f.role === '${role}'); const h = f.torchHandle; if (!h || !h.st || !f.model || !f.model.emitter) return null; const e = f.model.emitter.getWorldPosition(new THREE.Vector3()), p = h.st.pos;
  const lens = f.lens.getWorldPosition(new THREE.Vector3()); return { light: +Math.hypot(p[0] - e.x, p[1] - e.y, p[2] - e.z).toFixed(3), lens: +lens.distanceTo(e).toFixed(3), on: !!h.st.on }; })()`);

/* ---- 1. the console, switches off and on: Sequence 1 and ?start=works */
for (const [tag, sw] of [['off', ''], ['on', '&people=models&rabbit=tripo']]) {
  for (const [where, extra] of [['s1', ''], ['works', '&start=works']]) {
    const b = await boot({ q: BASE + sw + extra, pause: false });
    try {
      await b.ev('__ff.pause(); true'); await b.ev('__ff.step(60, false); true');
      const st = await b.ev(`({ rabbit: FF.Rabbit.last && FF.Rabbit.last.kind, people: FF.Humans.figures.map(f => f.role + ':' + !!(f.model && f.model.guard)), errors: FF.errors.length })`);
      ck(`console clean, ${where}, switches ${tag}`, !b.errs.length && st.errors === 0, { errs: b.errs.slice(0, 4), st });
      ck(`switches ${tag} (${where}): rabbit and people are the ${tag === 'on' ? 'models' : 'stand-ins'}`, tag === 'on' ? st.rabbit === 'model' && st.people.every(s => /:true$/.test(s)) : st.rabbit === 'procedural' && st.people.every(s => /:false$/.test(s)), st);
    } catch (e) { ck(`boot ${where} ${tag}`, false, e.message); }
    b.close(); await new Promise(r => setTimeout(r, 1500));
  }
}

/* ---- 2. the models in the game (switches on): roles, clips, feet, torch, and the same behaviour */
async function play(tag, sw) {
  const b = await boot({ q: BASE + sw }); const ev = e => b.ev(e), out = {};
  /* each scenario in a fresh page: the beats are one-time (the Verge, the walkway, the entry), a warp past one marks it done */
  const slidePage = fs.readFileSync(path.join(DIR, 'slide-page.js'), 'utf8') + ';' + HS;
  const fresh = async () => { await b.nav('/farfield/index.html?' + BASE + sw, 'window.__ff && __ff.ready === true', 120000); await sleep(200); await ev('__ff.pause(); true'); b.held = new Set(); b.shift = false; await ev(slidePage); };
  try {
    await ev(slidePage);
    const on = tag === 'on';
    /* the rabbit's feet */
    if (on) {
      const open = { x: 60.0, y: 0, face: 1 }, keys = ['hindL', 'hindR', 'foreL', 'foreR'];
      const run = async (name, pre, kk, settle, n) => { await ev(`__ff.warp(${JSON.stringify(open)}); __ff.step(30, false); true`); await b.setKeys(pre); if (pre.length) await ev('__ff.step(180, false); true'); await b.setKeys(kk); if (settle) await ev(`__ff.step(${settle}, false); true`); const r = await ev(`SLIDE.rabbit(${n}, 0.003)`); await b.setKeys([]); await ev('__ff.step(60, false); true'); out['rabbit_' + name] = r; return Math.max(...keys.map(k => r[k].slide)); };
      out.rabbitWalk = await run('walk', [], ['ArrowRight'], 120, 480);
      out.rabbitRun = await run('run', [], ['ShiftLeft', 'ArrowRight'], 120, 360);
      out.rabbitStopWalk = await run('stopWalk', ['ArrowRight'], [], 0, 90);
      out.rabbitStopRun = await run('stopRun', ['ShiftLeft', 'ArrowRight'], [], 0, 90);
      ck('the Tripo rabbit: steady walk and run, planted feet slide (worst foot, m/s; the clips themselves, not code)', out.rabbitWalk < 0.35 && out.rabbitRun < 0.35, { walk: out.rabbitWalk, run: out.rabbitRun });
      ck('the Tripo rabbit: stopping from a walk / a run, feet held (< 0.06 m/s; before the foot lock: 0.06 from a run)', out.rabbitStopWalk < 0.06 && out.rabbitStopRun < 0.06, { stopWalk: out.rabbitStopWalk, stopRun: out.rabbitStopRun });
    }
    /* the Search: the searcher walks the deck with his torch (walk-search) */
    await fresh();
    await ev(`__ff.warp('search-platform'); FF.AI.setLoopT(31.6); __ff.step(40, false); true`);
    const s0 = await fig(b, 'searcher'); out.searcherWalk = s0;
    ck(`the searcher walks with the torch out (${tag})`, s0.vis && s0.anim === 'walk-search' && s0.torch && (!on || s0.clip === 'walk_rifle'), s0);
    const sl = await ev('HSLIDE(300)'); const sr = sl.find(f => f.role === 'searcher'); out.searcherSlide = sr;
    ck(`the searcher's planted feet slide < 0.12 m/s while he walks (${tag})`, sr && sr.L.slide < 0.12 && sr.R.slide < 0.12, sr);
    if (on) { const t = await torchOff(b, 'searcher'); ck('the searcher\'s torch light sits on his torch_emitter (within 1 cm)', t && t.on && t.light < 0.01 && t.lens < 0.02, t); await shot(b, 'searcher-torch', 0, 1.0, 4.4, 'searcher'); }
    else await shot(b, 'standin-searcher-torch', 0, 1.0, 4.4, 'searcher');
    /* the searcher's same positions with and without the models */
    out.searcherPos = []; for (const t of [5.6, 12.0, 21.0, 31.0, 40.0]) { await ev(`FF.AI.setLoopT(${t}); __ff.step(30, false); true`); const f = await fig(b, 'searcher'); out.searcherPos.push([t, f.x, f.z, f.anim, f.speed]); }
    /* the entry: the aim demonstration */
    await fresh();
    await ev(`__ff.warp('search-arrive'); __ff.step(20, false); __ff.fire('search-entry', { arg: 0.2 }); true`);
    await ev(`(function(){ for (let i = 0; i < 3000; i++) { __ff.step(5, false); const f = FF.Humans.figures.find(f => f.role === 'searcher'); if (f.st.anim === 'aim' && (f.st.aim || 0) > 0.99) break; } __ff.step(20, false); return true; })()`);
    const a0 = await fig(b, 'searcher'); ck(`the entry: he raises the rifle at the door (${tag})`, a0.anim === 'aim' && (!on || /^aim/.test(a0.kind)), a0);
    if (on) { const t = await torchOff(b, 'searcher'); ck('the torch in the aim: light on the emitter', t && t.light < 0.01, t); await shot(b, 'searcher-aim-door', 0, 1.0, 4.4, 'searcher'); }
    /* the gate person: out of the gate, to the inlet, kneeling, torch down, standing, the sweep */
    await fresh();
    await ev(`__ff.warp({x: 30.0, y: 0, face: 1}); __ff.step(10, false); __ff.fire('vehicle-arrive', {}); true`);
    await ev(`(function(){ for (let i = 0; i < 4000; i++) { __ff.step(30, false); const f = FF.Humans.figures.find(f => f.role === 'verge'); if (f.st.anim === 'unlock') break; } __ff.step(120, false); __ff.fire('person-out', {}); return true; })()`);
    const v0 = await fig(b, 'verge'); ck(`the gate person works the chain behind the gate (${tag})`, v0.vis && v0.anim === 'unlock' && (!on || v0.clip === 'unlock_loop'), v0);
    await b.setKeys(['ArrowRight']);
    const seen = {};
    for (let i = 0; i < 700; i++) {
      await ev('__ff.step(30, false); true'); const f = await fig(b, 'verge'); const k = f.anim; if (!f.vis) continue;
      if (!seen[k]) { seen[k] = { i, f }; out['verge_' + k] = f; } else if (seen[k].i >= 0 && i - seen[k].i >= 4) {
        const sh = { 'walk': 'gate-person-walks-out', 'kneel': 'gate-person-kneels', 'torch-down': 'gate-person-torch-down', 'walk-search': 'gate-person-sweep' }[k]; seen[k].i = -1;
        if (sh && on) { const t = await torchOff(b, 'verge'); if (t) out['verge_torch_' + k] = t; await shot(b, sh, 0, 1.0, 4.6, 'verge'); } else if (sh && k === 'walk-search') await shot(b, 'standin-gate-person-sweep', 0, 1.0, 4.6, 'verge');
        if (k === 'walk' || k === 'walk-search') { const s = await ev('HSLIDE(150)'); const v = s.find(x => x.role === 'verge'); if (v) out['verge_slide_' + k] = v; }
      }
      const rb = await ev('[FF.G.rabbit.x, FF.G.rabbit.y]'); if (rb[0] > 40.5 && rb[1] < -0.5) await b.setKeys([]);
    }
    await b.setKeys([]);
    for (const k of ['walk', 'kneel', 'torch-down', 'reach', 'idle', 'walk-search']) ck(`the gate person: '${k}' seen (${tag})${on ? ' as ' + (out['verge_' + k] && out['verge_' + k].clip) : ''}`, !!out['verge_' + k], out['verge_' + k]);
    if (on) { for (const k of ['kneel', 'torch-down', 'walk-search']) { const t = out['verge_torch_' + k]; if (t) ck(`the gate person's torch light sits on his emitter while '${k}'`, t.light < 0.01, t); } }
    for (const k of ['walk', 'walk-search']) { const v = out['verge_slide_' + k]; if (v) ck(`the gate person's planted feet slide < 0.15 m/s walking (${k}, ${tag})`, v.L.slide < 0.15 && v.R.slide < 0.15, v); }
    /* the Courtyard: the walkway worker walks, leans on the rail (the rail clip), leaves */
    await fresh();
    await ev(`__ff.warp({x: 72.0, y: 0, face: 1}); __ff.step(20, false); __ff.fire('walkway-start', {}); true`);
    const ws = {};
    for (let i = 0; i < 400; i++) {
      await ev('__ff.step(15, false); true'); const f = await fig(b, 'worker'); if (!f.vis) continue;
      if (!ws[f.anim]) { ws[f.anim] = { i, f }; } else if (ws[f.anim].i >= 0 && i - ws[f.anim].i >= (f.anim === 'walk' ? 8 : 3)) { ws[f.anim].i = -1; out['worker_' + f.anim] = f; if (on) await shot(b, f.anim === 'walk' ? 'walkway-worker-walks' : 'walkway-worker-rail', 0, 1.0, 4.4, 'worker'); if (f.anim === 'walk') { const s = await ev('HSLIDE(80)'); const w = s.find(x => x.role === 'worker'); if (w) { out.worker_slide = w; } } }
    }
    ck(`the walkway worker walks and leans on the rail (${tag})`, !!out.worker_walk && !!out['worker_rail-look-out'] && (!on || (out.worker_walk.clip === 'walk' && out['worker_rail-look-out'].clip === 'rail_look_out')), { walk: out.worker_walk, rail: out['worker_rail-look-out'] });
    if (out.worker_slide) ck(`the worker's planted feet slide < 0.12 m/s walking (${tag})`, out.worker_slide.L.slide < 0.12 && out.worker_slide.R.slide < 0.12, out.worker_slide);
    /* the Works: the painter scrapes, stops, turns, reaches */
    await fresh();
    await ev(`__ff.warp({id: 'x', x: 153.6, y: 0, face: 1, painter: { loopT: 2.0 }}); __ff.step(40, false); true`);
    const ps = {};
    for (let i = 0; i < 80; i++) {
      await ev('__ff.step(30, false); true'); const f = await fig(b, 'painter'); const seg = await ev('FF.Painter.debug().seg');
      if (!ps[seg]) { ps[seg] = { i, f }; } else if (ps[seg].i >= 0 && i - ps[seg].i >= 1) { ps[seg].i = -1; out['painter_' + seg] = f; if (on && seg === 'scrape') await shot(b, 'painter-scrapes', 0, 1.0, 4.4, 'painter'); }
    }
    ck(`the painter scrapes, stops, turns and reaches (${tag})`, !!out.painter_scrape && !!out.painter_stop && !!out.painter_reach && (!on || out.painter_scrape.clip === 'scrape_wall_loop'), { scrape: out.painter_scrape, stop: out.painter_stop });
    if (on) { /* the rabbit in the Courtyard's light pool (no glow halo): a close-up, the rabbit standing in the pool */
      await fresh();
      await ev(`__ff.warp({id: 'p', x: 62, y: 0, face: 1}); __ff.step(120, false); true`); await shot(b, 'rabbit-light-pool', 0, 0, 0, 'rabbit'); out.pool = await ev('({ x: FF.G.rabbit.x, kind: FF.Rabbit.last.kind })'); }
    ck(`console clean through the whole play (${tag})`, !b.errs.length, b.errs.slice(0, 5));
  } catch (e) { ck(`play ${tag}`, false, e.stack || e.message); }
  R['play_' + tag] = out; b.close(); await new Promise(r => setTimeout(r, 1500));
  return out;
}
const off = await play('off', ''), on = await play('on', '&people=models&rabbit=tripo');
/* the figures stand where they stood and do what they did: positions and the anim names, models vs stand-ins */
const same = (a, b2) => JSON.stringify(a) === JSON.stringify(b2);
ck('the searcher is in the same place doing the same thing with the models (loop times 5.6 .. 40)', same(off.searcherPos, on.searcherPos), { off: off.searcherPos, on: on.searcherPos });
if (PROG) { fs.mkdirSync(PROG, { recursive: true }); ORDER.forEach((n, i) => { const f = path.join(OUT, 'models-' + n + '.jpg'); if (fs.existsSync(f)) fs.copyFileSync(f, path.join(PROG, `models-${String(i + 1).padStart(2, '0')}-${n}.jpg`)); }); }
fs.writeFileSync(path.join(OUT, 't-models.json'), JSON.stringify(R, null, 1));
R.pass = R.checks.every(c => c.ok); console.log(R.pass ? 'PASS' : 'FAIL', R.checks.filter(c => c.ok).length + '/' + R.checks.length);
process.exit(0);
