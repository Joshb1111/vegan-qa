// Floor safety (Josh 8 Oct: the rabbit sank into the courtyard floor after pushing the box and jumping around it, and was stuck;
// body pitch flipped him in the air). Mashes jump and moves around/over/against the box (and the walls), every fixed step asserts:
// feet never below the floor under them, the body pitch within +-25 deg (fresh from vertical speed, 0 on the ground). node t-floor.mjs
import { boot } from './lib.mjs';
const b = await boot({ q: 'q=high&seed=1&mute=1' });
const R = { checks: [] };
const ck = (name, ok, info) => { R.checks.push({ name, ok: !!ok, info }); console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(info)); };
await b.ev(`__ff.warp('courtyard'); __ff.step(60); true`);
const fuzz = (seed, steps, mode) => b.ev(`(() => {
  const rg = FF.Player.rig, T = __ff.three, vv = new T.Vector3(), up = new T.Vector3(), sks = []; rg.object.traverse(o => { if (o.isSkinnedMesh) sks.push(o); });
  let tiltMax = 0, meshWorst = 0, meshAt = null, flips = 0; let s = ${seed} >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const P = FF.Player, G = FF.G; let worst = 0, worstAt = null, pitchMax = 0, pitchGround = 0, stuck = 0, n = 0, minY = 9, held = {};
  const acts = ['left', 'right', 'jump', 'up', 'down', 'run'];
  let seg = 0, plan = { left: false, right: true, jump: false };
  for (let i = 0; i < ${steps}; i++) {
    if (seg-- <= 0) { seg = 4 + Math.floor(rnd() * 40); const r = rnd(); const bx = G.box.x, rx = G.rabbit.x;
      plan = { left: r < 0.3, right: r >= 0.3 && r < 0.6, jump: rnd() < 0.7, run: rnd() < 0.3, down: rnd() < 0.05 };
      if (${mode} === 1) { /* herd him at the box: walk toward it */ plan.left = rx > bx; plan.right = rx < bx; }
      if (${mode} === 2 && rnd() < 0.5) { plan.left = rx > bx + 0.4; plan.right = rx < bx - 0.4; plan.jump = true; } }
    for (const a of acts) { const on = !!plan[a] && (a !== 'jump' || (i % 14) < 7); if (on && !FF.Input.raw(a)) FF.Input.press(a); FF.Input.hold(a, on); }
    __ff.tick(); n++;
    if (i % 2 === 1) { rg.object.updateMatrixWorld(true); up.set(0, 1, 0).applyQuaternion(rg.object.quaternion); const tilt = Math.acos(Math.min(1, up.y)); tiltMax = Math.max(tiltMax, tilt);
      let mn = 9; for (const sk of sks) { sk.skeleton.update(); const N = sk.geometry.attributes.position.count, st = Math.max(1, Math.floor(N / 500)); for (let q = 0; q < N; q += st) { sk.boneTransform(q, vv); vv.applyMatrix4(sk.matrixWorld); if (vv.y < mn) mn = vv.y; } }
      const r0 = G.rabbit, fl = Math.abs(r0.x - G.box.x) < 0.3 && r0.y > 0.3 ? 0.44 : FF.Level.groundY(r0.x); if (fl - mn > meshWorst) { meshWorst = fl - mn; meshAt = { i, mn, fl, y: r0.y, tilt }; } }
    const r = G.rabbit, gy = FF.Level.groundY(r.x), by = G.box ? 0.44 : 0, d = P.debug();
    const over = G.box && Math.abs(r.x - G.box.x) < 0.26 + 0.02 && r.y > 0.3;
    const floor = over ? Math.max(gy, by) : gy;
    const below = floor - r.y; if (below > worst) { worst = below; worstAt = { i, x: r.x, y: r.y, gy, box: G.box.x, vy: r.vy }; }
    minY = Math.min(minY, r.y);
    const pa = i % 2 === 1 ? FF.Player.pitchNow() : 0; pitchMax = Math.max(pitchMax, Math.abs(pa)); if (r.grounded && Math.abs(pa) > 1e-3) pitchGround = Math.max(pitchGround, Math.abs(pa));
    if (r.y < gy - 0.2) stuck++;
  }
  FF.Input.release(); __ff.flush(); return { tiltMax: +tiltMax.toFixed(3), meshWorst: +meshWorst.toFixed(3), meshAt, n, worst: +worst.toFixed(4), worstAt, pitchMax: +pitchMax.toFixed(3), pitchGround: +pitchGround.toFixed(3), stuck, minY: +minY.toFixed(3), box: G.box.x, x: G.rabbit.x, y: G.rabbit.y }; })()`);
let all = [];
for (let k = 0; k < 8; k++) { await b.ev(`__ff.warp('courtyard'); __ff.step(30); true`); await b.ev(`FF.Player.debug(); true`); const o = await b.ev(`(() => { const r = FF.G.rabbit; r.x = 71.4 + ${k % 4} * 0.9; r.y = 0; FF.G.box.x = 72.5 + ${k} * 0.4; return true })()`);
  const f = await fuzz(100 + k, 120 * 25, k % 3); all.push(f); console.log(JSON.stringify(f)); }
ck('feet never below the floor under them (8 random mash runs of 25 s around the box)', all.every(f => f.worst < 0.02 && f.stuck === 0), all.map(f => [f.worst, f.stuck]));
ck('the drawn body never dips into the floor (lowest skinned vertex vs the floor under him, 6 cm slack for a squashed paw or ear tip) and never tilts past 25 degrees from upright', all.every(f => f.meshWorst < 0.06 && f.tiltMax <= 0.4363 + 0.01), all.map(f => [f.meshWorst, f.tiltMax, f.meshAt]));
ck('body pitch within 25 degrees in every frame, zero on the ground', all.every(f => f.pitchMax <= 0.4363 + 1e-3 && f.pitchGround < 1e-3), all.map(f => [f.pitchMax, f.pitchGround]));
const errs = await b.ev(`FF.errors.slice()`); ck('console clean', !errs.length && !(b.errs || []).length, errs);
console.log(R.checks.every(c => c.ok) ? 'ALL PASS' : 'SOME FAIL'); b.close && b.close(); process.exit(R.checks.every(c => c.ok) ? 0 : 1);
