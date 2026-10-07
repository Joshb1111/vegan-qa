// Josh's approval adjustments, tested on the game's own detection model (FF.AI.see, the same function the checker uses) and
// live over the searcher's whole routine: cover blocks sight completely; darkness only shortens the range and never hides the
// rabbit at close range; the warning times.
import { boot, save } from './lib.mjs';
const b = await boot({ q: 'q=low&seed=1&mute=1' });
const R = {};
try {
  R.static = await b.ev(`(() => {
    const see = FF.AI.see, RU = FF.RULES, out = [];
    const pts = (x, crouch, face) => (crouch ? RU.rabbit.samples.crouch : RU.rabbit.samples.stand).map(([dx, y]) => [x + dx * (face || 1), y]);
    const pitchAt = (p, x, y) => { const lx = p.x + RU.sight.torch.fwd * p.face, ly = (p.y || 0) + RU.sight.torch.h; return Math.atan2(y - ly, Math.abs(x - lx)) * 180 / Math.PI; };
    const T = (name, pose, x, crouch, expect) => { const r = see(pose, pts(x, crouch), { floorY: 0, cx: x, doorOpen: true }); const ok = expect(r); out.push({ name, w: +r.w.toFixed(2), src: r.src, d: +r.d.toFixed(2), ok }); };
    /* 1. solid cover blocks completely: the torch aimed straight at the rabbit */
    let p = { x: 104.3, y: 0, face: -1, torchOn: true, half: 13 }; p.pitch = pitchAt(p, 102.2, 0.12);
    T('torch aimed at the rabbit in the pallet core (2.1 m) -> unseen', p, 102.2, true, r => r.w === 0);
    p = { x: 104.3, y: 0, face: -1, torchOn: true, half: 13 }; p.pitch = pitchAt(p, 100.0, 0.15);
    T('control: same torch, the rabbit in the open at 100.0 -> seen', p, 100.0, false, r => r.w > 0 && r.src === 'torch');
    p = { x: 108.2, y: 0, face: -1, torchOn: true, half: 13, kneel: true, pitch: -12 };
    T('crouch-look under the skip, the rabbit in the skip core -> unseen', p, 106.1, true, r => r.w === 0);
    T('crouch-look under the skip, the rabbit at the reachable end 106.9 -> seen', p, 106.9, true, r => r.w > 0);
    p = { x: 93.0, y: 0.85, face: -1, torchOn: true, half: 13, pitch: -32 };
    T('on the deck above the hidden rabbit (deck core 94.8) -> unseen', p, 94.8, false, r => r.w === 0);
    p = { x: 99.0, y: 0, face: -1, torchOn: true, half: 13 }; p.pitch = pitchAt(p, 95.5, 0.15);
    T('torch aimed under the deck from its right end (deck core 95.5) -> unseen', p, 95.5, false, r => r.w === 0);
    /* 2. darkness shortens the range, never hides at close range */
    p = { x: 100.0, y: 0, face: -1, torchOn: false, half: 13, pitch: -20 };
    T('darkness, 1.5 m in front -> noticed (dark)', p, 98.5, false, r => r.src === 'dark' && r.w === 1);
    T('darkness, 1.7 m in front -> noticed (dark)', p, 98.3, false, r => r.src === 'dark' && r.w === 1);
    T('darkness, 2.0 m in front -> not noticed', p, 98.0, false, r => r.w === 0);
    T('darkness, 0.4 m behind -> noticed (dark)', p, 100.4, false, r => r.src === 'dark' || r.src === 'touch');
    T('darkness, 0.7 m behind -> not noticed', p, 100.7, false, r => r.w === 0);
    p = { x: 100.0, y: 0, face: -1, torchOn: true, half: 13, pitch: 10 };
    T('torch pointing away (pitch +10), 1.5 m in front in the dark -> still noticed (dark)', p, 98.5, false, r => r.w === 1 && r.src === 'dark');
    p = { x: 0, y: 0, face: 0, torchOn: false, half: 13, pitch: -20 }; p.x = 100.0;
    T('mid-turn (torch off), 1.5 m away -> still noticed (dark)', p, 98.5, false, r => r.w === 1);
    p = { x: 103.9, y: 0, face: -1, torchOn: false, half: 13, pitch: -20 };
    T('darkness 1.7 m away but the rabbit is in the pallet core (cover between) -> unseen', p, 102.2, true, r => r.w === 0);
    /* 3. fill times (s to fill suspicion 0 -> 1; NOTICE at 0.35) */
    const F = { dark: FF.AI.fillTime('dark', 1.5), torch2m: FF.AI.fillTime('torch', 2), torch6m: FF.AI.fillTime('torch', 6), torch10m: FF.AI.fillTime('torch', 10) };
    return { tests: out, pass: out.every(t => t.ok), fill: F, noticeAt: Object.fromEntries(Object.entries(F).map(([k, v]) => [k, +(v * RU.sight.fill.notice).toFixed(2)])) };
  })()`);
  /* live: the rabbit hidden in each core through a whole loop (standing and kneeling looks, the floodlight, the door spill) */
  R.live = await b.ev(`(() => {
    const out = {};
    for (const [name, x, pose] of [['A0', 88.6, 'hide'], ['deck', 94.8, 'hide'], ['pallet', 102.2, 'hide'], ['skip', 106.1, 'hide'], ['open-100', 100.0, null], ['open-91 (he never comes)', 91.0, null]]) {
      __ff.warp({ id: 't-' + name, x, y: 0, face: 1, pose }); FF.G.flags.entryDone = true; FF.AI.setLoopT(0);
      let maxS = 0, states = new Set(), firstNotice = null, t = 0;
      for (let i = 0; i < 120 * 45; i++) { __ff.tick(); t += 1 / 120; const s = FF.G.searcher; maxS = Math.max(maxS, s.s || 0); states.add(s.state); if (s.state === 'notice' && firstNotice == null) firstNotice = +t.toFixed(2); if (s.state === 'grab' || s.state === 'aim' || FF.Events.debug().failing) break; }
      out[name] = { maxS: +maxS.toFixed(3), states: [...states], firstNotice, endState: FF.G.searcher.state };
    }
    return out; })()`);
} catch (e) { R.err = e.message; }
R.errs = b.errs; save('t-detect', R); console.log(JSON.stringify(R, null, 1).slice(0, 5000)); b.close(); process.exit(0);
