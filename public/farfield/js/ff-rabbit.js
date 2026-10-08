/* FAR FIELD — ff-rabbit.js: the rabbit slot. OWNER: the rabbit builder (with ff-player.js); characters fixer 7 Oct (the gait
   drawn with planted feet, the model path). Keep FF.Rabbit.create's contract (docs/farfield/INTERFACES.md §8.3);
   tools/bake-rabbit.html also uses buildProcedural + ProcAnim (it loads only ff-config.js, ff-shading.js and this file, so
   nothing here may need ff-core.js). Plain-English overview for Josh: docs/farfield/CHARACTERS.md.
   1. TEMPORARY procedural rabbit: a real skinned mesh (one draw call) built from smooth ellipsoids, rigidly weighted to
      the same skeleton the commissioned model must have (bone names in docs/farfield/ASSETS-3D.md), animated in code.
   2. Model slot: if models/models.json names a rabbit file (or ?rabbit=<file under models/>), it is loaded with
      GLTFLoader (three r128, loaded only then) and driven by its named clips through an AnimationMixer. Every moving clip's
      own ground speed is MEASURED when it loads (how fast its planted feet travel back), so it plays at exactly the rate the
      rabbit moves and its feet don't slide, whatever speed it was authored at. Any clip the file lacks is drawn by the same
      procedural animation as the temporary rabbit, retargeted onto the model's bones (with its own leg IK so its feet stay
      planted), so a partial delivery (a Tripo mesh rigged here with idle_breathe + hop_run, say) shows every behaviour from
      day one. ?rabbitanim=clips turns that off (the documented clip fallbacks only); ?rabbitanim=proc draws everything
      procedurally on the model. No model at all = the procedural rabbit.
   THE GAIT (7 Oct): ff-player.js owns the timing (anim.gait: phase from the distance travelled, the stance window of each
   foot, the stride, the lift of each end of the body; anim.crouchFront / crouchRear; INTERFACES.md §8.3). This file draws
   it: a foot inside its stance window stays where it touched down (its body-space position moves back exactly as far as the
   body moves forward), a foot outside it swings to its next touchdown; legs reach their feet by inverse kinematics (the
   hind knee forward, the long hind foot rolling up onto its toes at push-off, the elbow back, a sliding shoulder for the
   scapula the skeleton has no bone for). Idle and crouched, the feet stay planted too, so lowering or breathing folds the
   legs instead of sinking or floating the feet. Without a gait (the bake tool) it times itself with the same windows.
   Conventions (both paths): metres, Y up, the model faces +Z, origin on the ground between the feet.
   The game turns the rabbit to face +X or -X (side-on).
   FF.Rabbit.create(look, { file }) -> Promise<rig>; rig = { object, update(dt, anim), kind, info, debug(), ... }
   anim (from ff-player.js; every field optional): { speed, vx, vy, grounded, crouch, push, effort, landed, airT,
     gait {name, phase, stride, cadence, speed, runK, feet, stance, lift {front, rear}}, crouchFront, crouchRear, crouchK,
     crouchHeld, run, squeeze, driven (the player drives the idles), pose, poseT, poseOut, poseData,
     ears {pL, pR, yL, yR, w}, head {yaw, pitch}, breath {hz, amp}, tailUp, flee, low, near ('L'|'R': the ear nearer the
     camera), add {startle, flinch, shake, shakeT, splash, sniff, twitchL, twitchR, lookBack, lookDir} }.
   Poses (ProcAnim.POSES): groom, sniff, nibble, sit, lookup, look, lookback, shake, loaf, hide, watch, prick, freeze, peek, rear,
     lookdown, hesitate, reach, climb, popout, flinch. The rabbit is never shown caught or hit: the game cuts to black on the
     frame of the grab or the shot ('caught' / 'hit' clips play under the black if a file has them; nothing needs them). */
'use strict';
window.FF = window.FF || {};
(function () {
const T = THREE;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
/* a small local PRNG for presentation only (idle life when the player is not driving it); never FF.rng, so the frame rate
   can never change gameplay randomness */
function prng(seed) { let s = (seed >>> 0) || 1; return () => { let t = (s += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------ skeleton (rest pose: crouched "loaf", facing +Z) */
const EAR_TILT = 0.16, EAR_SPREAD = 0.13, EAR_LEN = 0.112, EAR_BASE_Y = 0.214;
function earAxis(side) { return new T.Vector3(side * Math.sin(EAR_SPREAD), Math.cos(EAR_SPREAD) * Math.cos(EAR_TILT), -Math.sin(EAR_TILT)).normalize(); }
function earBase(side) { return new T.Vector3(side * 0.019, EAR_BASE_Y, 0.118); }
function boneTable() {
  const t = [
    ['root', null, [0, 0, 0]],
    ['hips', 'root', [0, 0.105, -0.075]],
    ['spine', 'hips', [0, 0.112, -0.008]],
    ['chest', 'spine', [0, 0.112, 0.058]],
    ['neck', 'chest', [0, 0.14, 0.096]],
    ['head', 'neck', [0, 0.182, 0.128]],
    ['tail', 'hips', [0, 0.094, -0.146]],          // pivot at the tail's root, so tail-up (fleeing) reads
  ];
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    const b = earBase(s), a = earAxis(s);
    t.push(['ear_' + n + '_01', 'head', b.clone().addScaledVector(a, EAR_LEN * 0.04).toArray()]);
    t.push(['ear_' + n + '_02', 'ear_' + n + '_01', b.clone().addScaledVector(a, EAR_LEN * 0.40).toArray()]);
    t.push(['ear_' + n + '_03', 'ear_' + n + '_02', b.clone().addScaledVector(a, EAR_LEN * 0.74).toArray()]);
    t.push(['front_upper_' + n, 'chest', [s * 0.03, 0.096, 0.084]]);
    t.push(['front_lower_' + n, 'front_upper_' + n, [s * 0.03, 0.05, 0.09]]);
    t.push(['front_paw_' + n, 'front_lower_' + n, [s * 0.03, 0.014, 0.094]]);
    t.push(['hind_upper_' + n, 'hips', [s * 0.046, 0.094, -0.068]]);
    t.push(['hind_lower_' + n, 'hind_upper_' + n, [s * 0.05, 0.05, -0.04]]);
    t.push(['hind_foot_' + n, 'hind_lower_' + n, [s * 0.05, 0.016, -0.118]]);
  }
  return t;
}
FF.RABBIT_BONES = boneTable().map(b => b[0]);

/* ------------------------------------------------------------------ the procedural mesh */
/* v2 review fixes (Josh's playtest point 3: "his body still looks like separate rounded shapes"): the body, head and legs are
   ONE connected surface. The same ellipsoids as before are blended into each other (a smooth union of their distance fields,
   wide over the torso, neck and head, narrow at the legs, so no ring reads at the neck and the haunch and feet join the body)
   and polygonised once at load (naive surface nets on a 4 mm grid, normals from the field). Each vertex is skinned to the
   bones of the parts it lies on, softly where parts blend, so the joins bend smoothly. To keep the folded hind foot from
   fusing with the thigh it rests under, the surface is built (and bound) with the legs a little extended; at rest the legs
   fold back into the loaf. The ears and eyes stay separate ellipsoids (the ears on their three bones each). One draw call. */
const EXT = { hind_upper: 0, hind_lower: -0.6, hind_foot: 0.6, front_upper: 0, front_lower: 0, front_paw: 0 };   // the bind pose's leg rotations (x): the hock opened, the foot ~3 cm clear of the haunch
function sdEll(px, py, pz, rx, ry, rz) {   // an ellipsoid's (bound) distance (IQ): good near the surface
  const k0 = Math.hypot(px / rx, py / ry, pz / rz), k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
function buildProcedural(L, opt) {
  const detail = (opt && opt.detail) || 1, sg = n => Math.max(6, Math.round(n * detail));
  const table = boneTable(), bones = [], byName = {}, world = {};
  for (const [name, parent, p] of table) {
    const b = new T.Bone(); b.name = name; world[name] = new T.Vector3(p[0], p[1], p[2]);
    b.position.copy(world[name]); if (parent) { b.position.sub(world[parent]); byName[parent].add(b); }
    bones.push(b); byName[name] = b;
  }
  const idx = n => bones.indexOf(byName[n]);
  const C = k => FF.lin(L.materials[k].color);
  const body = C('rabbit'), eye = C('eye'), inner = C('innerEar'), tailC = body.clone().lerp(new T.Color(1, 1, 1), 0.25);
  const P = [], N = [], COL = [], SI = [], SW = [], IDX = [];
  /* the bind pose: the legs a little extended (EXT); every other bone at rest */
  const root = new T.Object3D(); root.add(bones[0]);
  const ext = (opt && opt.ext) || EXT;
  const setExt = on => { for (const [nm] of table) { const m = /^(hind_upper|hind_lower|hind_foot|front_upper|front_lower|front_paw)_/.exec(nm); if (m) byName[nm].rotation.x = on ? ext[m[1]] : 0; } root.updateMatrixWorld(true); };
  setExt(false); const restW = {}; for (const [nm] of table) restW[nm] = byName[nm].matrixWorld.clone();
  setExt(true);
  /* an ellipsoid on one bone (or an ear spread over three), as triangles (the ears and the eyes) */
  function part(c, r, opt) {
    opt = opt || {};
    const g = new T.SphereGeometry(1, sg(opt.seg || 16), sg(opt.segH || 12));
    const m = new T.Matrix4().compose(new T.Vector3(c[0], c[1], c[2]), new T.Quaternion().setFromEuler(new T.Euler(opt.rx || 0, opt.ry || 0, opt.rz || 0)), new T.Vector3(r[0], r[1], r[2]));
    const loc = g.attributes.position.array.slice();
    g.applyMatrix4(m);
    const base = P.length / 3, pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      P.push(pos.getX(i), pos.getY(i), pos.getZ(i)); N.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      const ly = loc[i * 3 + 1], lx = loc[i * 3];
      let col = opt.col || body;
      if (opt.ear) { const out = lx * opt.ear.side; if (out > 0.35 && Math.abs(ly) < 0.8) col = inner; }
      COL.push(col.r, col.g, col.b);
      if (opt.ear) { /* weights along the ear's length across its three bones */
        const s = (ly + 1) / 2, k = opt.ear.bones, st = [0.04, 0.40, 0.74];
        let w = [0, 0, 0];
        if (s <= st[1]) { const u = clamp((s - st[0]) / (st[1] - st[0]), 0, 1); w = [1 - u, u, 0]; }
        else { const u = clamp((s - st[1]) / (st[2] - st[1]), 0, 1); w = [0, 1 - u, u]; }
        SI.push(k[0], k[1], k[2], 0); SW.push(w[0], w[1], w[2], 0);
      } else { SI.push(opt.bone, 0, 0, 0); SW.push(1, 0, 0, 0); }
    }
    const gi = g.index.array; for (let i = 0; i < gi.length; i++) IDX.push(base + gi[i]);
  }
  /* the connected body: [centre, radii, rotation x, bone, blend radius k (how softly it joins what it touches), colour] */
  const B = [
    [[0, 0.1, -0.086], [0.068, 0.072, 0.086], 0, 'hips', 0.024],                 // haunch
    [[0, 0.1, -0.012], [0.057, 0.061, 0.085], 0, 'spine', 0.024],                // belly / back
    [[0, 0.106, 0.058], [0.05, 0.057, 0.056], 0, 'chest', 0.024],                // chest
    [[0, 0.142, 0.096], [0.038, 0.045, 0.04], 0, 'neck', 0.026],                 // neck (fuller than the old ring, and blended)
    [[0, 0.186, 0.142], [0.039, 0.041, 0.053], 0.28, 'head', 0.022],             // head
    [[0, 0.172, 0.184], [0.025, 0.025, 0.027], 0, 'head', 0.014],                // muzzle
    [[0, 0.104, -0.168], [0.026, 0.026, 0.024], 0, 'tail', 0.012, 'tail'],       // tail
  ];
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) B.push(
    [[s * 0.021, 0.17, 0.158], [0.022, 0.02, 0.025], 0, 'head', 0.012],          // cheek
    [[s * 0.043, 0.086, -0.076], [0.031, 0.058, 0.071], -0.25, 'hind_upper_' + n, 0.016],   // thigh
    [[s * 0.05, 0.038, -0.094], [0.017, 0.034, 0.024], 0, 'hind_lower_' + n, 0.018],      // shin / hock (fuller: it joins the haunch to the heel)
    [[s * 0.049, 0.022, -0.108], [0.016, 0.022, 0.022], 0, 'hind_foot_' + n, 0.012],      // heel
    [[s * 0.049, 0.014, -0.068], [0.016, 0.014, 0.058], 0, 'hind_foot_' + n, 0.012],      // long hind foot
    [[s * 0.03, 0.072, 0.086], [0.016, 0.034, 0.018], 0, 'front_upper_' + n, 0.012],      // foreleg
    [[s * 0.03, 0.034, 0.091], [0.012, 0.028, 0.013], 0, 'front_lower_' + n, 0.007],
    [[s * 0.03, 0.011, 0.1], [0.014, 0.011, 0.022], 0, 'front_paw_' + n, 0.006]);        // paw
  /* each part in the bind pose: its world matrix there = bone(bind) * bone(rest)^-1 * part(rest); keep the inverse */
  const PT = B.map(([c, r, rx, bone, k, tag]) => {
    const mRest = new T.Matrix4().compose(new T.Vector3(c[0], c[1], c[2]), new T.Quaternion().setFromEuler(new T.Euler(rx, 0, 0)), new T.Vector3(1, 1, 1));
    const m = byName[bone].matrixWorld.clone().multiply(restW[bone].clone().invert()).multiply(mRest), inv = m.clone().invert(), e = inv.elements, ctr = new T.Vector3().setFromMatrixPosition(m);
    const ext = Math.max(r[0], r[1], r[2]) + k;
    return { r, bone: idx(bone), k, tail: tag === 'tail', e, lo: [ctr.x - ext, ctr.y - ext, ctr.z - ext], hi: [ctr.x + ext, ctr.y + ext, ctr.z + ext] };
  });
  const dPart = (q, x, y, z) => { const e = q.e; return sdEll(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14], q.r[0], q.r[1], q.r[2]); };
  const field = (x, y, z) => { let f = 1; for (const q of PT) f = smin(f, dPart(q, x, y, z), q.k); return f; };
  /* the field on a grid, part by part inside its own box (most of the grid is far from everything) */
  const h = 0.004 / detail, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const q of PT) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], q.lo[a]); hi[a] = Math.max(hi[a], q.hi[a]); }
  for (let a = 0; a < 3; a++) { lo[a] -= 2 * h; hi[a] += 2 * h; }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz).fill(1), gi3 = (i, j, k) => i + nx * (j + ny * k);
  for (const q of PT) {
    const i0 = Math.max(0, Math.floor((q.lo[0] - lo[0]) / h)), i1 = Math.min(nx - 1, Math.ceil((q.hi[0] - lo[0]) / h));
    const j0 = Math.max(0, Math.floor((q.lo[1] - lo[1]) / h)), j1 = Math.min(ny - 1, Math.ceil((q.hi[1] - lo[1]) / h));
    const k0 = Math.max(0, Math.floor((q.lo[2] - lo[2]) / h)), k1 = Math.min(nz - 1, Math.ceil((q.hi[2] - lo[2]) / h));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const n = gi3(i, j, k); F[n] = smin(F[n], dPart(q, lo[0] + i * h, lo[1] + j * h, lo[2] + k * h), q.k); }
  }
  /* naive surface nets: one vertex per cell the surface crosses (the mean of its edge crossings), one quad per crossed edge */
  const cw = nx - 1, ch = ny - 1, cell = new Int32Array(cw * ch * (nz - 1)).fill(-1), V = [];
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = F[gi3(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of EDGES) {
      const va = cv[a], vb = cv[b]; if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + (((b & 1) - (a & 1)) * t); sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t); sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t); n++;
    }
    cell[i + cw * (j + ch * k)] = V.length / 3;
    V.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  const Q = [], cid = (i, j, k) => cell[i + cw * (j + ch * k)];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = F[gi3(i, j, k)] < 0;
    if (i < nx - 1 && v0 !== (F[gi3(i + 1, j, k)] < 0)) Q.push([cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k)]);
    if (j < ny - 1 && v0 !== (F[gi3(i, j + 1, k)] < 0)) Q.push([cid(i - 1, j, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i - 1, j, k)]);
    if (k < nz - 1 && v0 !== (F[gi3(i, j, k + 1)] < 0)) Q.push([cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k)]);
  }
  /* normals from the field's gradient; skin weights from how close each vertex is to each part's surface; colour */
  const base = P.length / 3, nv = V.length / 3, eps = h * 0.5, NV = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const x = V[3 * v], y = V[3 * v + 1], z = V[3 * v + 2];
    let gx = field(x + eps, y, z) - field(x - eps, y, z), gy = field(x, y + eps, z) - field(x, y - eps, z), gz = field(x, y, z + eps) - field(x, y, z - eps);
    const gl = Math.hypot(gx, gy, gz) || 1; gx /= gl; gy /= gl; gz /= gl; NV[3 * v] = gx; NV[3 * v + 1] = gy; NV[3 * v + 2] = gz;
    P.push(x, y, z); N.push(gx, gy, gz);
    const wb = new Map(); let tailW = 0, wsum = 0;
    for (const q of PT) {
      const d = Math.max(0, dPart(q, x, y, z)), sgm = Math.max(0.003, q.k * 0.55), w = Math.exp(-(d / sgm) * (d / sgm));
      if (w < 1e-4) continue; wb.set(q.bone, (wb.get(q.bone) || 0) + w); wsum += w; if (q.tail) tailW += w;
    }
    const top = [...wb.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4), ts = top.reduce((a, e) => a + e[1], 0) || 1;
    const col = tailW > 0 ? body.clone().lerp(tailC, clamp(tailW / (wsum || 1), 0, 1)) : body;
    COL.push(col.r, col.g, col.b);
    SI.push(...[0, 1, 2, 3].map(i => top[i] ? top[i][0] : 0)); SW.push(...[0, 1, 2, 3].map(i => top[i] ? top[i][1] / ts : 0));
  }
  /* two triangles per quad, wound to face out along the field's gradient */
  for (const q of Q) {
    if (q.some(c => c < 0)) continue;
    for (const [a, b, c] of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
      const ax = V[3 * a], ay = V[3 * a + 1], az = V[3 * a + 2], ux = V[3 * b] - ax, uy = V[3 * b + 1] - ay, uz = V[3 * b + 2] - az, wx = V[3 * c] - ax, wy = V[3 * c + 1] - ay, wz = V[3 * c + 2] - az;
      const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
      const gx = NV[3 * a] + NV[3 * b] + NV[3 * c], gy = NV[3 * a + 1] + NV[3 * b + 1] + NV[3 * c + 1], gz = NV[3 * a + 2] + NV[3 * b + 2] + NV[3 * c + 2];
      if (fx * gx + fy * gy + fz * gz >= 0) IDX.push(base + a, base + b, base + c); else IDX.push(base + a, base + c, base + b);
    }
  }
  /* the ears and the eyes stay separate (built in the bind pose: their bones are at rest in it) */
  const b = idx;
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    part([s * 0.031, 0.196, 0.163], [0.0085, 0.0095, 0.0085], { bone: b('head'), seg: 10, segH: 8, col: eye }); // eye
    const eb = earBase(s), ea = earAxis(s), ec = eb.clone().addScaledVector(ea, EAR_LEN / 2);
    part(ec.toArray(), [0.0072, EAR_LEN / 2, 0.019], { ear: { side: s, bones: [b('ear_' + n + '_01'), b('ear_' + n + '_02'), b('ear_' + n + '_03')] }, rx: -EAR_TILT, rz: -s * EAR_SPREAD, seg: 12, segH: 14 });
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(COL, 3));
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(SW, 4));
  g.setIndex(IDX); g.computeBoundingSphere();
  const mat = rabbitMaterial(L, { vertexColors: true });
  const mesh = new T.SkinnedMesh(g, mat); mesh.name = 'rabbit_body';
  /* bind in the extended pose, then let the legs fold back to rest */
  root.remove(bones[0]); mesh.add(bones[0]); setExt(true); mesh.updateMatrixWorld(true); mesh.bind(new T.Skeleton(bones));
  for (const [nm] of table) byName[nm].rotation.set(0, 0, 0); mesh.updateMatrixWorld(true);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return { mesh, bones: byName, rest: Object.fromEntries(Object.entries(byName).map(([k, v]) => [k, v.position.clone()])), info: { verts: P.length / 3, tris: IDX.length / 3, grid: [nx, ny, nz] } };
}

/* the rabbit's material: the shared matte look (FF.mat) plus two live uniforms of its own, shared by every rabbit material
   (the procedural mesh or a supplied model's meshes): the self-lift (the world sets it per place in look.rabbit.lift; the
   player pushes it each frame) and a rim multiplier (the rim drops to behave.hideRim in a hide core, never to zero) */
const RU = { lift: { value: 0.006 }, rimK: { value: 1 } };
const SOFT_K = 3.0, SOFT_C = 4.8;
function rabbitMaterial(L, extra) {
  const R = L.materials.rabbit;
  /* extra.softCap (supplied models only): a soft ceiling on this material's own output, so a pale coat never reaches the bloom
     threshold (ff-config grade.bloomThreshold 5.0) in the brightest light pool and grows a halo. A knee from SOFT_K that
     approaches SOFT_C (< the threshold) and never reaches it; below the knee the colour is untouched, so he looks the same
     everywhere else. */
  const softCap = !!(extra && extra.softCap); if (extra && 'softCap' in extra) { extra = Object.assign({}, extra); delete extra.softCap; }
  RU.lift.value = (L.rabbit && L.rabbit.lift) || 0.006;
  /* works: the Works' lighting hooks reach the rabbit too (the press lamps' footprint: dark in the slots), as on its sets */
  const m = FF.mat({ color: extra && extra.map ? '#ffffff' : (extra && extra.vertexColors ? '#ffffff' : R.color), roughness: R.roughness, rim: true, noAO: true, lift: RU.lift.value || 0.006, works: true },
    Object.assign({ skinning: true }, extra || {}));
  const ob = m.onBeforeCompile, ck = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    ob.call(m, sh, r);
    sh.uniforms.uFFLift = RU.lift; sh.uniforms.uFFRabRimK = RU.rimK;
    sh.fragmentShader = 'uniform float uFFRabRimK;\n' + sh.fragmentShader.replace('totalEmissiveRadiance += uFFRim.rgb', 'totalEmissiveRadiance += uFFRabRimK * uFFRim.rgb');
    if (softCap) {
      const K = SOFT_K.toFixed(2), E = (SOFT_C - SOFT_K).toFixed(2);
      sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `{ float ffM = max( gl_FragColor.r, max( gl_FragColor.g, gl_FragColor.b ) );
      if ( ffM > ${K} ) gl_FragColor.rgb *= ( ${K} + ${E} * ( 1.0 - exp( -( ffM - ${K} ) / ${E} ) ) ) / ffM; }
    #include <dithering_fragment>`);
    }
  };
  m.customProgramCacheKey = () => (ck ? ck.call(m) : '') + '|ffrab1' + (softCap ? 'c' : '');
  return m;
}

/* ------------------------------------------------------------------ procedural animation: channels -> bones */
const CH = ['rootY', 'rootZ', 'pitch', 'spine', 'neck', 'head', 'headYaw', 'headRoll', 'earL', 'earR', 'earSL', 'earSR', 'earYL', 'earYR', 'earBL', 'earBR',
  'fL', 'fR', 'fkL', 'fkR', 'hL', 'hR', 'hkL', 'hkR', 'hfL', 'hfR', 'tail', 'sit', 'roll', 'swell',
  /* IK: its weight, then the feet (premultiplied by it): hind toe z, y and heel lift; fore wrist z, y and paw tilt */
  'ik', 'hzL', 'hyL', 'htL', 'hzR', 'hyR', 'htR', 'fzL', 'fyL', 'fpL', 'fzR', 'fyR', 'fpR'];
const zero = () => { const o = {}; for (const c of CH) o[c] = 0; return o; };
function addInto(dst, src, w) { for (const c of CH) dst[c] += (src[c] || 0) * w; }

/* the calm standing base most expressive poses start from */
function stand(o) {
  o.rootY = 0; o.pitch = 0; o.spine = 0; o.neck = 0.02; o.head = -0.05;
  o.earL = o.earR = 0.06; o.earSL = o.earSR = 0.02; o.fL = o.fR = 0; o.hL = o.hR = 0.25; o.hkL = o.hkR = 0; o.tail = 0.05;
  return o;
}
/* low, legs folded, ears flat (the crouch / hide family) */
function low(o, depth) {
  o.rootY = -depth; o.pitch = -0.04; o.spine = 0.2; o.neck = -0.12; o.head = 0.02;
  o.earL = o.earR = -1.18; o.earSL = o.earSR = 0.06; o.earBL = o.earBR = 0.15;
  o.fL = o.fR = 0.35; o.fkL = o.fkR = 0.55; o.hL = o.hR = 0.55; o.hkL = o.hkR = 0.8; o.tail = -0.05;
  return o;
}
const nose = (t, a, hz) => a * Math.sin(TAU * (hz || 7) * t) * (0.6 + 0.4 * Math.sin(TAU * 0.9 * t));

/* each pose: (t seconds in the pose, o channels, d pose data, s anim input) -> { earLock, headLock } (0..1: how much the
   pose's own ears / head override the live ear and head targets) */
const POSES = {
  /* face washing: sits back, both forepaws up to the face in short strokes, the head bobbing down to meet them; a pause
     with an ear flick (water off), then the near ear drawn down and cleaned; a small shake of the ears. 5.6 s cycle */
  groom(t, o, d, s) {
    const c = t % 5.6; stand(o); o.sit = 0.8; o.neck = -0.08; o.hL = o.hR = 0.35; o.tail = 0.02;
    const nearL = (s.near || 'R') === 'L';
    if (c < 2.5) {                              // face wash strokes
      const k = Math.sin(TAU * 2.6 * c), k2 = Math.sin(TAU * 2.6 * c - 0.6), e = sstep(0, 0.25, c);
      o.fL = lerp(0.3, 2.35 + 0.3 * k, e); o.fR = lerp(0.3, 2.35 + 0.3 * k2, e); o.fkL = o.fkR = lerp(0.3, 1.75, e);
      o.head = -0.42 + 0.14 * Math.sin(TAU * 2.6 * c + 1.0); o.neck = -0.2; o.headRoll = 0.04 * k;
      o.earL = o.earR = -0.18;
    } else if (c < 3.3) {                       // pause, paws down, ear flick
      const u = c - 2.5, e = 1 - sstep(0, 0.3, u);
      o.fL = o.fR = lerp(0.3, 2.35, e); o.fkL = o.fkR = lerp(0.3, 1.75, e); o.head = 0.04;
      const fl = u > 0.35 && u < 0.62 ? Math.sin(Math.PI * (u - 0.35) / 0.27) : 0;
      o.earL = o.earR = 0.08; o.earSL = o.earSR = 0.02 + 0.22 * fl; o.earYL = 0.4 * fl; o.earYR = -0.4 * fl;
    } else if (c < 4.9) {                       // the near ear drawn down along the paws and cleaned
      const u = c - 3.3, e = sstep(0, 0.35, u) * (1 - sstep(1.3, 1.6, u)), st = Math.sin(TAU * 2.2 * u);
      const ear = nearL ? 'L' : 'R', other = nearL ? 'R' : 'L', sd = nearL ? 1 : -1;
      o['ear' + ear] = lerp(0.06, 1.25, e); o['earB' + ear] = -0.35 * e; o['earS' + ear] = 0.25 * e; o['ear' + other] = -0.2;
      o.headRoll = 0.38 * sd * e; o.headYaw = 0.18 * sd * e; o.head = -0.18 * e; o.neck = -0.1;
      o['f' + ear] = lerp(0.3, 2.6 + 0.2 * st, e); o['f' + other] = lerp(0.3, 2.2, e); o['fk' + ear] = lerp(0.3, 1.4 + 0.25 * st, e); o['fk' + other] = lerp(0.3, 1.7, e);
    } else {                                    // paws down, ears shaken out
      const u = c - 4.9, f = Math.sin(TAU * 7 * u) * (1 - sstep(0.1, 0.6, u));
      o.fL = o.fR = 0.3; o.fkL = o.fkR = 0.3; o.head = 0.0; o.earL = o.earR = 0.05 + 0.25 * f; o.earSL = o.earSR = 0.05 + 0.15 * f; o.headRoll = 0.08 * f;
    }
    return { earLock: 1, headLock: 1 };
  },
  /* nose down to the ground and the weeds, the nose working */
  sniff(t, o, d) {
    stand(o); const e = sstep(0, 0.3, t);
    o.neck = lerp(0.02, -0.34, e); o.head = lerp(-0.05, -0.62, e) + nose(t, 0.035); o.pitch = -0.06 * e; o.rootZ = 0.008 * e; o.fL = 0.12 * e; o.fR = 0.04 * e;
    o.earL = o.earR = 0.12; o.headYaw = (d && d.yaw) || 0;
    return { earLock: 0.3, headLock: 0.85, feetLock: 1 };
  },
  /* eats a few blades of grass and clover: head down, chewing */
  nibble(t, o) {
    stand(o); const e = sstep(0, 0.35, t);
    o.neck = lerp(0.02, -0.4, e); o.head = lerp(-0.05, -0.74, e) + 0.045 * Math.sin(TAU * 4.6 * t) * e; o.headRoll = 0.035 * Math.sin(TAU * 2.3 * t) * e;
    o.pitch = -0.07 * e; o.rootZ = 0.01 * e; o.earL = o.earR = -0.12; o.earSL = o.earSR = 0.08;
    return { earLock: 0.6, headLock: 0.9, feetLock: 1 };
  },
  /* sits up on the haunches to listen; the ears stay live (they turn to the sound) */
  sit(t, o) { stand(o); o.sit = 1; o.head = 0.08; o.neck = 0.05; o.fL = o.fR = 0.25; o.fkL = o.fkR = 0.45; o.earL = o.earR = 0.16; o.head += nose(t, 0.012, 6); return { earLock: 0, headLock: 0.3 }; },
  /* a long look up at the hall */
  lookup(t, o) { stand(o); o.sit = 0.72; o.head = 0.62; o.neck = 0.26; o.fL = o.fR = 0.2; o.fkL = o.fkR = 0.4; o.earL = o.earR = 0.12; return { earLock: 0.2, headLock: 1 }; },
  /* look at something (d.yaw, d.pitch: head turn and tilt) */
  look(t, o, d) { stand(o); o.headYaw = (d && d.yaw) || 0; o.head = -0.05 + ((d && d.pitch) || 0); o.neck = 0.05; o.headRoll = 0.12 * ((d && d.yaw) || 0); o.earL = o.earR = 0.14; return { earLock: 0, headLock: 1, feetLock: 1 }; },
  /* look back over the shoulder (d.dir: +1 towards the rabbit's left, -1 its right) */
  lookback(t, o, d) {
    stand(o); const dir = (d && d.dir) || -1, e = sstep(0, 0.3, t) * (d && d.dur ? 1 - sstep(d.dur - 0.3, d.dur, t) : 1);
    o.headYaw = 1.35 * dir * e; o.headRoll = 0.18 * dir * e; o.head = 0.08 * e; o.sit = 0.15 * e; o.spine = -0.05 * e;
    o.earYL = 0.9 * e; o.earYR = -0.9 * e; o.earL = o.earR = -0.1;
    return { earLock: 0.7, headLock: 1 };
  },
  /* whole-body shake (after rain, a squeeze, the drain): 0.8 s */
  shake(t, o) {
    stand(o); const env = Math.sin(Math.PI * clamp(t / 0.8, 0, 1)), w = TAU * 8.5 * t;
    o.roll = 0.3 * env * Math.sin(w); o.headRoll = -0.45 * env * Math.sin(w + 0.6); o.headYaw = 0.12 * env * Math.sin(w + 1.1);
    o.earSL = o.earSR = 0.05 + 0.35 * env * Math.sin(w + 1.2); o.earL = o.earR = -0.15 + 0.5 * env * Math.sin(w + 1.7);
    o.rootY = 0.004 * env; o.spine = 0.05 * env * Math.sin(w + 0.3);
    return { earLock: 1, headLock: 1 };
  },
  /* lies down into a loaf: paws tucked, ears lowered along the back (1.0 s in, then holds) */
  loaf(t, o) {
    const k = sstep(0, 1.0, t);
    stand(o);
    o.rootY = -0.036 * k; o.pitch = -0.03 * k; o.spine = 0.12 * k; o.neck = lerp(0.02, -0.08, k); o.head = lerp(-0.05, -0.06, k);
    o.earL = o.earR = lerp(0.06, -1.02, k); o.earSL = o.earSR = lerp(0.02, 0.16, k); o.earBL = o.earBR = 0.28 * k;
    o.fL = o.fR = lerp(0, -0.55, k); o.fkL = o.fkR = lerp(0, 2.1, k); o.hL = o.hR = lerp(0.25, 0.75, k); o.hkL = o.hkR = lerp(0, 1.1, k); o.tail = -0.08 * k;
    return { earLock: 1, headLock: 0.7 };
  },
  /* pressed flat under cover, ears down, still apart from breathing */
  hide(t, o) { low(o, 0.046); o.spine = 0.22; o.neck = -0.15; o.head = 0.05; o.earL = o.earR = -1.25; o.earBL = o.earBR = 0.22; return { earLock: 0.8, headLock: 0.6, feetLock: 1 }; },
  /* stops dead, tense; the ears stay live on the threat */
  freeze(t, o) { stand(o); o.rootY = -0.008; o.spine = -0.04; o.neck = 0.06; o.head = 0.02; o.tail = 0.0; return { earLock: 0, headLock: 0.4, feetLock: 1 }; },
  /* watching from cover that is not low (under the deck): crouched, still, head up; the ears stay live on the threat */
  watch(t, o) { low(o, 0.026); o.neck = 0.08; o.head = 0.1; o.spine = 0.14; o.earL = o.earR = -0.35; o.earBL = o.earBR = 0.04; return { earLock: 0, headLock: 0.3, feetLock: 1 }; },
  /* the door reveal under a low shelf (headroom ~0.30 m, no room to sit up): it hears the footsteps, lifts its head and
     neck as far as the shelf allows, pricks its ears up from flat towards the sound and stiffens, leaning a little forward
     (0.18 s to get there); the live ears and head keep turning to the sound */
  prick(t, o) {
    const e = sstep(0, 0.18, t); low(o, lerp(0.03, 0.014, e));
    o.rootZ = 0.012 * e; o.spine = lerp(0.2, 0.06, e); o.neck = lerp(-0.12, 0.24, e); o.head = lerp(0.02, 0.22, e) + nose(t, 0.008, 6);
    o.earL = o.earR = lerp(-1.18, -0.4, e); o.earSL = o.earSR = 0.03; o.earBL = o.earBR = 0.05; o.tail = 0.06 * e;
    return { earLock: 0.8, headLock: 0.7, feetLock: 1 };
  },
  /* at the edge of cover: head forward, body back */
  peek(t, o) { low(o, 0.03); o.rootZ = 0.022; o.neck = 0.1; o.head = 0.12 + nose(t, 0.012); o.earL = o.earR = -0.55; o.earBL = o.earBR = 0.05; return { earLock: 0.5, headLock: 0.5, feetLock: 1 }; },
  /* at the post: rears a little and sniffs the top */
  rear(t, o) { stand(o); const e = sstep(0, 0.3, t); o.sit = 0.48 * e; o.pitch = 0.08 * e; o.head = 0.22 * e + nose(t, 0.03); o.neck = 0.1 * e; o.fL = 0.75 * e; o.fR = 0.6 * e; o.fkL = o.fkR = 0.65 * e; o.earL = o.earR = 0.2; return { earLock: 0.4, headLock: 0.9 }; },
  /* at an edge: leans out, looks down, sniffs */
  lookdown(t, o) { stand(o); const e = sstep(0, 0.35, t); o.pitch = -0.1 * e; o.rootZ = 0.028 * e; o.neck = -0.3 * e; o.head = -0.42 * e + nose(t, 0.025); o.fL = 0.35 * e; o.fR = 0.25 * e; o.earL = o.earR = 0.24; return { earLock: 0.5, headLock: 1, feetLock: 1 }; },
  /* the first squeeze: a short hesitation, head forward into the gap */
  hesitate(t, o) { low(o, 0.016); o.rootZ = 0.02; o.neck = -0.1; o.head = -0.04 + nose(t, 0.03, 8); o.earL = o.earR = -0.5; o.spine = 0.1; return { earLock: 0.6, headLock: 0.8, feetLock: 1 }; },
  /* the reach-fail: stretched up the wall, front paws scrabbling below the sill, then sliding back (0.5 s) */
  reach(t, o) {
    stand(o); const e = sstep(0, 0.08, t) * (1 - sstep(0.38, 0.5, t)), sc = Math.sin(TAU * 11 * t);
    o.pitch = 0.5 * e; o.spine = -0.12 * e; o.neck = 0.05 * e; o.head = 0.05 * e; o.fL = 2.05 * e + 0.4 * sc * e; o.fR = 2.05 * e - 0.4 * sc * e; o.fkL = o.fkR = 0.35;
    o.hL = o.hR = lerp(0.25, -0.75, e); o.hkL = o.hkR = 0.2 * e; o.hfL = o.hfR = -0.5 * e; o.earL = o.earR = -0.5 * e; o.tail = 0.25 * e;
    return { earLock: 1, headLock: 1 };
  },
  /* from the box top up into the raised opening (0.8 s): coil, spring, creep in */
  climb(t, o) {
    if (t < 0.25) { low(o, 0.024 * sstep(0, 0.2, t)); o.earL = o.earR = -0.6; o.spine = 0.1; o.head = 0.15; o.neck = 0.1; }
    else if (t < 0.55) { const u = (t - 0.25) / 0.3; stand(o); o.pitch = lerp(0.65, 0.05, u); o.fL = o.fR = lerp(2.2, 0.6, u); o.fkL = o.fkR = 0.3; o.hL = o.hR = lerp(-0.85, 0.3, u); o.hkL = o.hkR = 0.15; o.earL = o.earR = -0.7; o.head = lerp(0.3, 0, u); }
    else { low(o, 0.03); const q = (t - 0.55) * 5; o.fL = 0.35 + 0.32 * Math.sin(TAU * q); o.fR = 0.35 + 0.32 * Math.sin(TAU * q + Math.PI); }
    return { earLock: 1, headLock: 1 };
  },
  /* out of the duct mouth: creep forward, a sniff of the night air, a hop down (1.2 s) */
  popout(t, o) {
    if (t < 0.4) { low(o, 0.03); const q = t * 5; o.fL = 0.35 + 0.32 * Math.sin(TAU * q); o.fR = 0.35 + 0.32 * Math.sin(TAU * q + Math.PI); o.earL = o.earR = -0.9; }
    else if (t < 0.7) { stand(o); o.sit = 0.22; o.head = 0.3 + nose(t, 0.035, 8); o.neck = 0.15; o.earL = o.earR = 0.1; }
    else { const u = clamp((t - 0.7) / 0.5, 0, 1); stand(o); o.pitch = lerp(-0.3, 0.12, u); o.spine = lerp(-0.15, 0, u); o.hL = o.hR = lerp(-0.6, 0.3, u); o.hfL = o.hfR = lerp(-0.4, 0, u); o.fL = o.fR = lerp(0.8, 0.2, u); o.earL = o.earR = lerp(-0.4, 0, u); }
    return { earLock: 0.8, headLock: 1 };
  },
  /* the only "caught/hit" beat there is: a flinch (the game cuts to black on the same frame) */
  flinch(t, o) { low(o, 0.03); o.spine = 0.18; o.neck = -0.14; o.head = -0.12; o.earL = o.earR = -1.25; o.fL = o.fR = 0.3; return { earLock: 1, headLock: 1, feetLock: 1 }; },
};
const POSE_IN = { shake: 0.08, reach: 0.06, climb: 0.08, popout: 0.08, flinch: 0.05, hesitate: 0.1, startle: 0.05 };

/* ------------------------------------------------------------------ the legs: 2D (sagittal) geometry and inverse kinematics
   Vectors are [y, z] (up, forward) in the rabbit's own space. Every leg bone of the procedural skeleton turns only about X,
   so a bone's world angle is the sum of its chain's local angles. ang(v): 0 = straight down, + = swung back. */
const smoother = u => u * u * u * (u * (u * 6 - 15) + 10);
const REST2 = (() => { const w = {}; for (const [n, , p] of boneTable()) w[n] = [p[1], p[2]]; return w; })();
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]], add2 = (a, b) => [a[0] + b[0], a[1] + b[1]], len2 = v => Math.hypot(v[0], v[1]);
const rot2 = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];   // about +X
const ang = v => Math.atan2(-v[1], -v[0]), dirOf = a => [-Math.cos(a), -Math.sin(a)];
const wrapPI = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const LEG = {
  hipOff: sub2(REST2.hind_upper_L, REST2.hips), spineOff: sub2(REST2.spine, REST2.hips), chestOff: sub2(REST2.chest, REST2.spine),
  shoulderOff: sub2(REST2.front_upper_L, REST2.chest),
  thigh: sub2(REST2.hind_lower_L, REST2.hind_upper_L), shin: sub2(REST2.hind_foot_L, REST2.hind_lower_L), foot: [-0.003, 0.108],   // heel -> toe
  upper: sub2(REST2.front_lower_L, REST2.front_upper_L), lower: sub2(REST2.front_paw_L, REST2.front_lower_L),
  scap: 0.04,             // how far the shoulder joint may slide towards a paw (the scapula the skeleton has no bone for)
};
Object.assign(LEG, { l1h: len2(LEG.thigh), l2h: len2(LEG.shin), l1f: len2(LEG.upper), l2f: len2(LEG.lower),
  aThigh: ang(LEG.thigh), aShin: ang(LEG.shin), aUpper: ang(LEG.upper), aLower: ang(LEG.lower) });
const BODY = 0.165;       // hip joint to shoulder joint: an end of the body rising by h pitches the body by h / BODY
/* where the hips and shoulders are, from the body channels (the same arithmetic as apply()) */
function bodyFK(o) {
  const sit = o.sit || 0, ah = -(o.pitch + sit * 0.88), sp = o.spine * 0.5 - sit * 0.1;
  const H = [REST2.hips[0] + o.rootY + sit * 0.012, REST2.hips[1] + (o.rootZ || 0)], as = ah + sp, ac = as + sp;
  const S = add2(H, rot2(LEG.spineOff, ah)), C = add2(S, rot2(LEG.chestOff, as));
  return { ah, ac, hip: add2(H, rot2(LEG.hipOff, ah)), shoulder: add2(C, rot2(LEG.shoulderOff, ac)) };
}
/* where the FK leg channels put the feet (used once, for the standing pose's footprints) */
function legFK(o) {
  const fk = bodyFK(o), sit = o.sit || 0, out = {};
  for (const n of ['L', 'R']) {
    const H = o['h' + n], hk = o['hk' + n], hf = o['hf' + n];
    const knee = add2(fk.hip, rot2(LEG.thigh, -H)), heel = add2(knee, rot2(LEG.shin, -H + hk));
    out['h' + n] = { heel, toe: add2(heel, rot2(LEG.foot, hf)) };
    const Fw = o['f' + n] + sit * 0.35, elbow = add2(fk.shoulder, rot2(LEG.upper, -Fw));
    out['f' + n] = { wrist: add2(elbow, rot2(LEG.lower, -Fw + o['fk' + n] + sit * 0.4)) };
  }
  return out;
}
/* two bones from joint J reaching T: sign -1 bends the middle joint forward (the hind knee), +1 back (the elbow) */
function solve2(J, Tg, l1, l2, sign) {
  const v = sub2(Tg, J), d = clamp(len2(v), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999);
  const aU = ang(v) + sign * Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)), du = dirOf(aU);
  return { aU, aL: ang(sub2(Tg, [J[0] + du[0] * l1, J[1] + du[1] * l1])), short: len2(v) > (l1 + l2) * 0.999 };
}
/* the hind foot rolls up onto its toes (th) as far as the leg needs to reach the heel */
function heelFor(toe, th, hip) {
  let heel = sub2(toe, rot2(LEG.foot, th));
  for (let i = 0; i < 14 && len2(sub2(heel, hip)) > (LEG.l1h + LEG.l2h) * 0.97 && th < 1.55; i++) { th += 0.08; heel = sub2(toe, rot2(LEG.foot, th)); }
  return { heel, th };
}
const STAND_O = (() => { const o = {}; for (const c of ['rootY', 'rootZ', 'pitch', 'spine', 'sit', 'fL', 'fR', 'fkL', 'fkR', 'hL', 'hR', 'hkL', 'hkR', 'hfL', 'hfR']) o[c] = 0; o.hL = o.hR = 0.25; return o; })();
const STAND = legFK(STAND_O);   // the standing pose's footprints: idle and crouched feet stay on these
/* the four feet, keyed as the gait's windows, with their IK channels and their standing footprint [y, z] */
const FOOTK = [['hindL', 'h', 'L'], ['hindR', 'h', 'R'], ['foreL', 'f', 'L'], ['foreR', 'f', 'R']];
const STANDF = {}; for (const [k, e, n] of FOOTK) STANDF[k] = e === 'h' ? STAND['h' + n].toe.slice() : STAND['f' + n].wrist.slice();

/* the gait's timing when the player gives none (tools/bake-rabbit.html, a bare test): the windows of ff-player.js's GAITS.
   Phase 0 = the hind feet touch down; each foot is planted inside its window [on, off] (off may run past 1). */
const GDEF = {
  walk:   { hindL: [0.00, 0.46], hindR: [0.01, 0.47], foreL: [0.38, 0.86], foreR: [0.46, 0.94], lift: [0.25, 0.35], cap: 0.018, dip: 0.004 },
  run:    { hindL: [0.00, 0.24], hindR: [0.03, 0.27], foreL: [0.50, 0.64], foreR: [0.56, 0.70], lift: [0.55, 0.6], cap: 0.05, dip: 0.012 },
  crouch: { hindL: [0.00, 0.62], hindR: [0.50, 1.12], foreL: [0.25, 0.87], foreR: [0.75, 1.37], lift: [0.06, 0.06], cap: 0.004, dip: 0.0015 },
  push:   { hindL: [0.00, 0.66], hindR: [0.50, 1.16], foreL: [0.20, 0.86], foreR: [0.70, 1.36], lift: [0.04, 0.04], cap: 0.003, dip: 0.002 },
};
const FEET = ['hindL', 'hindR', 'foreL', 'foreR'];
function windowsBlend(name, k) {
  if (name === 'crouch' || name === 'push') return GDEF[name];
  const W = GDEF.walk, Rn = GDEF.run, o = {};
  for (const f of FEET) o[f] = [lerp(W[f][0], Rn[f][0], k), lerp(W[f][1], Rn[f][1], k)];
  o.lift = [lerp(W.lift[0], Rn.lift[0], k), lerp(W.lift[1], Rn.lift[1], k)]; o.cap = lerp(W.cap, Rn.cap, k); o.dip = lerp(W.dip, Rn.dip, k);
  return o;
}
const inWin = (w, p) => (p >= w[0] && p < w[1]) || (p + 1 >= w[0] && p + 1 < w[1]);
/* an end of the body off the ground follows a parabola no higher than gravity allows in the time it is up (as ff-player.js) */
function endLift(ws, p, cad, k, cap, dip) {
  if (!ws.some(w => inWin(w, p))) {
    let a = -9, b = 9; for (const w of ws) for (const j of [-1, 0, 1]) { const on = w[0] + j, off = w[1] + j; if (off <= p && off > a) a = off; if (on > p && on < b) b = on; }
    const Tm = (b - a) / Math.max(cad, 1e-3), h = Math.min(cap, k * 9.81 * Tm * Tm / 8), u = (p - a) / (b - a);
    return h * 4 * u * (1 - u);
  }
  return -dip * 0.5;
}
/* one foot's body-space z along the cycle: planted inside its window (moving back exactly as fast as the body moves on, so
   it stays put on the ground), then a swing to its next touchdown. c = the middle of its stance path. s = stance progress,
   u = swing progress (-1 while planted). */
function footPath(w, p, stride, c) {
  const dur = Math.max(0.02, w[1] - w[0]), zTd = c + stride * dur / 2, zLo = c - stride * dur / 2;
  for (const j of [0, 1, -1]) { const q = p + j; if (q >= w[0] && q < w[1]) return { z: zTd - stride * (q - w[0]), s: (q - w[0]) / dur, u: -1, zTd }; }
  for (const j of [0, 1, -1]) { const q = p + j; if (q >= w[1] && q < w[0] + 1) { const u = (q - w[1]) / Math.max(0.02, w[0] + 1 - w[1]); return { z: zLo + (zTd - zLo) * smoother(u), s: 1, u, zTd }; } }
  return { z: c, s: 0, u: -1, zTd };
}
/* targets, premultiplied by the IK weight (layers are summed by weight; apply() divides by the summed weight) */
function standTargets(o, ik) {
  for (const n of ['L', 'R']) {
    o['hz' + n] = STAND['h' + n].toe[1] * ik; o['hy' + n] = STAND['h' + n].toe[0] * ik; o['ht' + n] = 0;
    o['fz' + n] = STAND['f' + n].wrist[1] * ik; o['fy' + n] = STAND['f' + n].wrist[0] * ik; o['fp' + n] = 0;
  }
  o.ik = ik; return o;
}
/* lowering: the head and shoulders (cf) and the hips (cr) separately, as ff-player.js's crouch transitions ask */
function lowness(o, cf, cr, D) {
  o.rootY -= D * cr; o.pitch -= D * (cf - cr) / BODY + 0.04 * cf;
  o.spine += 0.16 * Math.min(cf, cr); o.neck = lerp(o.neck, -0.12, cf); o.head = lerp(o.head, 0.02, cf);
  o.earL = lerp(o.earL, -1.18, cf); o.earR = lerp(o.earR, -1.18, cf); o.earSL = lerp(o.earSL, 0.06, cf); o.earSR = lerp(o.earSR, 0.06, cf);
  o.earBL = lerp(o.earBL, 0.15, cf); o.earBR = lerp(o.earBR, 0.15, cf); o.tail = lerp(o.tail, -0.05, cr);
}

function ProcAnim(rig, opt) {
  const B = rig.bones, R = rig.rest; opt = opt || {};
  const st = {
    t: 0, phase: 0, pphase: 0, gk: 0, lastP: 0, w: { idle: 1, gait: 0, air: 0 }, land: 1, earV: 0, earX: 0, lastVy: 0, lowK: 0,
    twitch: { t: -9, side: 1, next: 2.5 }, sniff: { t: -9, next: 4 }, look: { t: -9, next: 6, dir: 0 }, sit: 0, sitTimer: 0, sitHold: 0, idleT: 0,
    deterministic: !!opt.deterministic,
    /* driven layers */
    pw: {}, pt: {}, cur: null, br: 0, hz: 1, amp: 1, ear: { pL: 0.06, pR: 0.06, yL: -0.45, yR: 0.45 }, hy: 0, hp: 0, tail: 0, flee: 0, low: 0,
    footfall: 0, G: null,
    /* v2 review fixes: where each foot is when the rabbit is not walking (body space [y, z]); planted feet move back exactly as
       far as the body moves on; coming to a stop, a foot off its footprint steps onto it with a small lift (never a glide) */
    feet: null, gaitFeet: null, gf: null, gaitOn: false, travel: 0, dt: 0,
  };
  const freshFeet = () => { const F = {}; for (const [k] of FOOTK) F[k] = { y: STANDF[k][0], z: STANDF[k][1], step: null }; return F; };
  st.feet = freshFeet();
  /* keep the still feet planted while the body moves; take the gait's feet while it walks; step onto the footprints when still */
  function feetTrack(dt, travel, still) {
    const F = st.feet;
    if (st.gaitFeet && st.w.gait > 0.6) for (const [k] of FOOTK) { F[k].y = st.gaitFeet[k][0]; F[k].z = st.gaitFeet[k][1]; F[k].step = null; }
    for (const [k] of FOOTK) if (!F[k].step) F[k].z -= travel;
    /* a foot still in the air when the rabbit stops comes down onto its footprint at once; feet on the ground step one per end */
    if (still) for (const [k] of FOOTK) { const f = F[k]; if (!f.step && f.y - STANDF[k][0] > 0.004) f.step = { y0: f.y, z0: f.z, t: 0, dur: 0.14, lift: 0.004 }; }
    if (still) for (const end of ['hind', 'fore']) {
      const ks = [end + 'L', end + 'R']; if (ks.some(k => F[k].step)) continue;
      let best = null, bd = 0; for (const k of ks) { const d = Math.hypot(F[k].z - STANDF[k][1], F[k].y - STANDF[k][0]); if (d > bd) { bd = d; best = k; } }
      if (best && bd > 0.005) F[best].step = { y0: F[best].y, z0: F[best].z, t: 0, dur: end === 'hind' ? 0.17 : 0.14, lift: Math.min(end === 'hind' ? 0.016 : 0.013, 0.005 + 0.3 * bd) };
    }
    for (const [k] of FOOTK) {
      const f = F[k], q = f.step; if (!q) continue;
      q.t += dt; const u = Math.min(1, q.t / q.dur), e = smoother(u);
      f.z = lerp(q.z0, STANDF[k][1], e); f.y = lerp(q.y0, STANDF[k][0], e) + q.lift * Math.sin(Math.PI * u);
      if (u >= 1) { f.step = null; f.y = STANDF[k][0]; f.z = STANDF[k][1]; }
    }
  }
  function feetTargets(o, ik) {
    for (const [k, e, n] of FOOTK) {
      const f = st.feet[k];
      if (e === 'h') { o['hz' + n] = f.z * ik; o['hy' + n] = f.y * ik; o['ht' + n] = 0; } else { o['fz' + n] = f.z * ik; o['fy' + n] = f.y * ik; o['fp' + n] = 0; }
    }
    o.ik = ik; return o;
  }
  const rnd = opt.rnd || prng(opt.seed || 7);
  const r01 = () => st.deterministic ? 0.5 : rnd();
  function layerIdle(s, o, atStand) {
    stand(o); o.rootY = 0;
    if (!s.driven) {
      const br = Math.sin(TAU * 1.0 * st.t); o.rootY = 0.0018 * br; o.spine = 0.025 * br; o.head = -0.05 + 0.01 * br;
      /* small life when nobody drives it (the bake tool, a bare test): ear twitch, sniffing, a look, sitting up */
      const tw = st.t - st.twitch.t; if (tw < 0.32) { const k = Math.sin(Math.PI * tw / 0.32); if (st.twitch.side > 0) { o.earL -= 0.42 * k; o.earYL = 0.5 * k; } else { o.earR -= 0.42 * k; o.earYR = -0.5 * k; } }
      const sn = st.t - st.sniff.t; if (sn < 0.9) { const e = Math.sin(Math.PI * sn / 0.9); o.head += 0.05 * e * Math.sin(TAU * 7 * sn); o.neck += 0.05 * e; }
      const lk = st.t - st.look.t; if (lk < 2.2) { const e = sstep(0, 0.35, lk) * (1 - sstep(1.7, 2.2, lk)); o.headYaw = 0.55 * st.look.dir * e; o.headRoll = 0.08 * st.look.dir * e; }
      o.sit = st.sit;
    }
    const ik = 1 - clamp(o.sit * 2, 0, 1);
    return atStand ? standTargets(o, ik) : feetTargets(o, ik);    // the feet stay planted (on the footprints, or stepping onto them)
  }
  /* walking, running, creeping, pushing: the feet from the gait's windows, the body from its lift */
  function layerGait(s, o, G) {
    stand(o);
    const k = G.runK, p = G.phase, W = G.W, crouch = G.name === 'crouch', push = G.name === 'push', fl = st.flee;
    const cH = STAND.hL.toe[1] + (push ? -0.05 : crouch ? -0.015 : lerp(-0.025, 0.0, k));
    const cF = STAND.fL.wrist[1] + (push ? -0.015 : crouch ? 0.0 : lerp(-0.005, 0.02, k));
    const liftH = push ? 0.014 : crouch ? 0.016 : lerp(0.03, 0.06, k), liftF = push ? 0.012 : crouch ? 0.014 : lerp(0.024, 0.045, k);
    const thMax = push ? 0.75 : crouch ? 0.3 : lerp(0.4, 1.0, k);
    /* each foot: the windows say when it is planted and when it swings; WHERE it is comes from what it has done (v2 review
       fixes). A planted foot stays exactly where it touched down (it moves back in body space only as far as the body moves
       on), whatever the stride or speed does meanwhile (slowing from the run, starting off, a change of cycle under the
       hoarding); a swing starts from where the foot lifted and lands on the cycle's next touchdown. Starting from stillness,
       the feet start from where they stand. */
    if (!st.gaitOn) { st.gf = {}; for (const [kk] of FOOTK) st.gf[kk] = { planted: true, z: st.feet[kk].z, lz: st.feet[kk].z, cz: st.feet[kk].z, cy: st.feet[kk].y, lu: 1, land: 1 }; st.gaitOn = true; }
    let zh = 0;
    for (const [kk, e, n] of FOOTK) {
      const hind = e === 'h', gf = st.gf[kk], g0 = hind ? STAND.hL.toe[0] : STAND.fL.wrist[0], lift = hind ? liftH : liftF;
      const h = footPath(W[kk], p, G.stride, hind ? cH : cF);
      let z, y;
      if (G.name === 'idle') { z = st.feet[kk].z; y = st.feet[kk].y; gf.planted = true; gf.z = z; }          // stopping: where the still feet are
      else if (h.u < 0) {
        if (!gf.planted) {
          /* touchdown: a completed swing lands where the cycle puts it (already the distance travelled since the touchdown
             behind it); one cut short (a cycle change mid-swing) plants where it is and eases down */
          const full = gf.lu != null && gf.lu > 0.85;
          gf.planted = true; gf.z = full ? h.z : (gf.cz != null ? gf.cz : h.z) - (st.travel || 0); gf.land = full ? 1 : 0; gf.ly0 = gf.cy != null ? gf.cy - g0 : 0;
        } else gf.z -= st.travel || 0;
        gf.land = Math.min(1, gf.land + (st.dt || 0) / 0.06);
        z = gf.z; y = g0 + (gf.land < 1 ? gf.ly0 * (1 - smoother(gf.land)) : 0);   // an early touchdown (a cycle change mid-swing) eases down
      } else if (gf.planted && h.u > 0.5) {
        z = gf.z -= st.travel || 0; y = g0;      // a change of cycle put a planted foot late in a swing: it waits for its next stance
      } else {
        /* the swing leaves and meets the ground at the ground's speed (in body space it moves back exactly as fast as the body
           moves on at both ends: a Hermite curve), so neither lift-off nor touchdown skids. z0: where it lifted off (the last
           planted place, moved on to the instant of lift-off inside this frame) */
        const u = h.u, D = -(W[kk][0] + 1 - W[kk][1]) * G.stride;
        if (gf.planted) { gf.planted = false; gf.lz = (gf.cz != null ? gf.cz : h.z) - (st.travel || 0) - D * u; }
        const z1 = h.zTd, z0 = gf.lz;
        z = z0 * (2 * u * u * u - 3 * u * u + 1) + D * (u * u * u - 2 * u * u + u) + z1 * (3 * u * u - 2 * u * u * u) + D * (u * u * u - u * u);
        y = g0 + lift * Math.sin(Math.PI * u);
      }
      gf.cz = z; gf.cy = y; gf.lu = h.u;
      if (hind) { o['hz' + n] = z; o['hy' + n] = y; o['ht' + n] = h.u < 0 ? thMax * sstep(0.45, 1, h.s) : thMax * (1 - sstep(0, 0.55, h.u)) - 0.25 * k * Math.sin(Math.PI * h.u); zh += z / 2; }
      else { o['fz' + n] = z; o['fy' + n] = y; o['fp' + n] = h.u < 0 ? 0.4 * sstep(0.6, 1, h.s) : (0.4 + 0.6 * Math.sin(Math.PI * h.u)) * (1 - sstep(0.8, 1, h.u)); }
    }
    st.gaitFeet = {}; for (const [kk, e, n] of FOOTK) st.gaitFeet[kk] = [o[e + 'y' + n], o[e + 'z' + n]];
    const lf = (G.lift && G.lift.front) || 0, lr = (G.lift && G.lift.rear) || 0;
    /* each end rises by its own lift: part of the difference lifts the whole body, the rest pitches it (less rocking-horse) */
    o.rootY = lr + 0.4 * (lf - lr) - 0.008 * fl - (crouch || push ? 0 : 0.008 * (1 - k)); o.pitch = Math.atan2(0.6 * (lf - lr), BODY);   // the cautious walk carries itself a little lower
    /* the back curls as the hind feet gather under the body and stretches as they push away behind it */
    const half = Math.max(0.02, G.stride * (W.hindL[1] - W.hindL[0]) / 2), gather = clamp((zh - cH) / half, -1, 1);
    /* (the stand-in's back is already arched at rest: stretching it much would lift the head end, so the stretch is small) */
    o.spine = (push ? 0.03 : crouch ? 0.04 : lerp(0.07, 0.3, k) * (1 + 0.25 * fl)) * (gather > 0 ? gather : 0.35 * gather);
    /* the head stays steady; walking it is carried low and forward, careful; running, stretched with the ears back */
    o.neck = push ? -0.3 : lerp(-0.07, -0.13, k) - 0.06 * fl; o.head = (push ? -0.32 : lerp(0.05, -0.03, k)) - 0.55 * o.pitch;
    o.earL = o.earR = (push ? -0.72 : -(0.15 + 0.6 * k) + 0.05 - 0.5 * fl); o.earSL = o.earSR = push ? 0.1 : 0.03; if (push) o.earBL = o.earBR = 0.1;
    o.tail = 0.05 + 0.18 * k * Math.sin(TAU * p) + (push ? 0.05 : 0);
    if (push) { o.rootY += -0.014 + 0.0025 * clamp(s.effort, 0, 1) * Math.sin(TAU * 13 * st.t); o.rootZ = 0.022; o.pitch += -0.2; o.spine += -0.1; }
    o.ik = 1;
    return o;
  }
  function layerAir(s, o) {
    const k = sstep(1.6, -1.6, s.vy); // 0 rising, 1 falling
    o.rootY = 0; o.pitch = lerp(0.32, -0.14, k); o.spine = lerp(-0.2, -0.04, k); o.neck = 0; o.head = lerp(-0.22, 0.08, k);
    o.hL = o.hR = lerp(-0.95, 0.1, k); o.hkL = o.hkR = lerp(0.15, 0.5, k); o.hfL = o.hfR = lerp(-0.55, -0.1, k);
    o.fL = o.fR = lerp(0.7, 0.5, k); o.fkL = o.fkR = lerp(0.05, 0.15, k);
    o.earL = o.earR = lerp(-0.55, -0.15, k); o.earSL = o.earSR = 0.08; o.tail = 0.2;
    return o;
  }
  /* the gait to draw: the player's (anim.gait), or the same windows timed here */
  function gaitOf(s, dt) {
    const g = s.gait, v = s.speed || 0;
    if (s.push && v < 0.05) {     /* pressing on a box that won't move: the feet tread and scrabble in place */
      st.pphase = (st.pphase + dt * Math.max(0.15, clamp(s.effort, 0, 1)) * 2.2) % 1;
      return { name: 'push', phase: st.pphase, stride: 0.1, runK: 0, W: GDEF.push, lift: null, moving: (s.effort || 0) > 0.05 };
    }
    if (g && g.stance && g.name !== 'air' && g.name !== 'idle') {
      st.gk = g.runK || 0;
      return { name: g.name === 'run' ? 'walk' : g.name, phase: g.phase || 0, stride: g.stride || 0.3, runK: g.runK || 0, W: g.stance, lift: g.lift, moving: v > 0.02 };
    }
    if (g && g.name === 'idle') return { name: 'idle', phase: g.phase || 0, stride: 0.3, runK: st.gk, W: GDEF.walk, lift: null, moving: false };
    /* no gait from the player: time it here (the old cycle length, so bake-rabbit.html's loops still close) */
    const name = s.push ? 'push' : s.crouch ? 'crouch' : 'walk';
    st.gk = damp(st.gk, name === 'walk' ? sstep(1.35, 2.1, v) : 0, 6, dt);
    const stride = name === 'walk' ? lerp(0.26, 0.8, clamp((v - 0.9) / 1.5, 0, 1)) : name === 'crouch' ? 0.2 : 0.16;
    if (s.grounded !== false) st.phase = (st.phase + dt * v / stride) % 1;
    const W = windowsBlend(name, st.gk), cad = v / stride;
    return { name, phase: st.phase, stride, runK: st.gk, W, moving: v > 0.05,
      lift: { front: endLift([W.foreL, W.foreR], st.phase, cad, W.lift[0], W.cap, W.dip), rear: endLift([W.hindL, W.hindR], st.phase, cad, W.lift[1], W.cap, W.dip) } };
  }
  /* the legs reach their targets (blended over the FK legs by o.ik) */
  function ikApply(o) {
    const w = clamp(o.ik || 0, 0, 1); if (w < 0.001) return;
    const kk = 1 / Math.max(o.ik, 1e-4), fk = bodyFK(o);
    for (const n of ['L', 'R']) {
      const hf = heelFor([o['hy' + n] * kk, o['hz' + n] * kk], o['ht' + n] * kk, fk.hip);
      const h = solve2(fk.hip, hf.heel, LEG.l1h, LEG.l2h, -1), tW = h.aU - LEG.aThigh, sW = h.aL - LEG.aShin;
      const up = B['hind_upper_' + n], lo = B['hind_lower_' + n], ft = B['hind_foot_' + n];
      up.rotation.x = lerp(up.rotation.x, tW - fk.ah, w); lo.rotation.x = lerp(lo.rotation.x, sW - tW, w); ft.rotation.x = lerp(ft.rotation.x, hf.th - sW, w);
      const wr = [o['fy' + n] * kk, o['fz' + n] * kk], v = sub2(wr, fk.shoulder), d = len2(v), reach = (LEG.l1f + LEG.l2f) * 0.97;
      let J = fk.shoulder, sh = [0, 0];
      if (d > reach) { const e = Math.min(LEG.scap, d - reach); sh = [v[0] / d * e, v[1] / d * e]; J = add2(J, sh); }
      const f = solve2(J, wr, LEG.l1f, LEG.l2f, 1), uW = f.aU - LEG.aUpper, lW = f.aL - LEG.aLower;
      const fu = B['front_upper_' + n], fl = B['front_lower_' + n], fp = B['front_paw_' + n];
      fu.rotation.x = lerp(fu.rotation.x, uW - fk.ac, w); fl.rotation.x = lerp(fl.rotation.x, lW - uW, w); fp.rotation.x = lerp(fp.rotation.x, o['fp' + n] * kk - lW, w);
      const sl = rot2(sh, -fk.ac); fu.position.set(R['front_upper_' + n].x, R['front_upper_' + n].y + sl[0] * w, R['front_upper_' + n].z + sl[1] * w);
    }
  }
  function apply(o) {
    const P = o.pitch, S = o.spine, sit = o.sit;
    const hipsPitch = P + sit * 0.88;               // nose-up angle of the whole body about the haunch
    B.hips.position.set(R.hips.x, R.hips.y + o.rootY + sit * 0.012, R.hips.z + o.rootZ);
    B.hips.rotation.set(-hipsPitch, 0, o.roll || 0);
    B.spine.rotation.set(S * 0.5 - sit * 0.1, 0, 0); B.chest.rotation.set(S * 0.5 - sit * 0.1, 0, 0);
    const sw = 1 + (o.swell || 0); B.spine.scale.set(sw, sw, 1); B.chest.scale.set(1 / sw, 1 / sw, 1);   // breathing: the belly swells
    const chestW = -hipsPitch + S - sit * 0.2;      // world x-rotation of the chest
    B.neck.rotation.set(-o.neck + sit * 0.25, o.headYaw * 0.35, 0);
    B.head.rotation.set(-o.head + sit * 0.42, o.headYaw * 0.65, o.headRoll);
    const ears = [['L', 1, o.earL, o.earSL, o.earYL, o.earBL], ['R', -1, o.earR, o.earSR, o.earYR, o.earBR]];
    for (const [n, side, back, spread, yaw, bend] of ears) {
      const lag = st.earX;
      B['ear_' + n + '_01'].rotation.set(back * 0.85 + lag * 0.4, yaw, -side * spread);
      B['ear_' + n + '_02'].rotation.set(back * 0.12 - bend * 0.6 + lag * 0.5, 0, 0);
      B['ear_' + n + '_03'].rotation.set(back * 0.05 - bend + lag * 0.6, 0, 0);
    }
    for (const [n, F, fk] of [['L', o.fL, o.fkL], ['R', o.fR, o.fkR]]) {
      const Fw = F + sit * 0.35;
      B['front_upper_' + n].position.copy(R['front_upper_' + n]);
      B['front_upper_' + n].rotation.set(-Fw - chestW, 0, 0);
      B['front_lower_' + n].rotation.set(fk + sit * 0.4, 0, 0);
      B['front_paw_' + n].rotation.set(-fk * 0.5, 0, 0);
    }
    for (const [n, H, hk, hf] of [['L', o.hL, o.hkL, o.hfL], ['R', o.hR, o.hkR, o.hfR]]) {
      B['hind_upper_' + n].rotation.set(-H + hipsPitch, 0, 0);
      B['hind_lower_' + n].rotation.set(hk, 0, 0);
      B['hind_foot_' + n].rotation.set(H - hk + hf, 0, 0);   // keeps the long foot flat unless hf tips it
    }
    B.tail.rotation.set(-o.tail, 0, 0);
    ikApply(o);
  }
  /* s: see the header. Everything except speed/vy/grounded is optional. */
  function update(dt, s) {
    st.t += dt;
    const G = gaitOf(s, dt); st.G = G;
    st.footfall = G.moving && s.grounded && G.phase < st.lastP - 0.5 ? 1 : 0; st.lastP = G.phase;
    st.flee = damp(st.flee, s.flee ? 1 : 0, 6, dt); st.low = damp(st.low, s.low ? 1 : 0, 8, dt);
    st.lowK = damp(st.lowK, s.crouch ? 1 : 0, 9, dt);
    const air = !s.grounded, tgt = { idle: 0, gait: 0, air: 0 };
    if (air) tgt.air = 1; else if (G.moving) tgt.gait = 1; else tgt.idle = 1;
    const rate = air ? 18 : 9;
    let sum = 0; for (const k in st.w) { st.w[k] += (tgt[k] - st.w[k]) * (1 - Math.exp(-rate * dt)); sum += st.w[k]; }
    for (const k in st.w) st.w[k] /= sum || 1;
    /* autonomous idle life only when not driven by the player */
    if (!s.driven) {
      if (tgt.idle && !st.deterministic) {
        st.idleT += dt;
        if (st.t > st.twitch.next) { st.twitch.t = st.t; st.twitch.side = r01() < 0.5 ? 1 : -1; st.twitch.next = st.t + 1.8 + r01() * 3.5; }
        if (st.t > st.sniff.next) { st.sniff.t = st.t; st.sniff.next = st.t + 3 + r01() * 5; }
        if (st.t > st.look.next && st.sit < 0.1) { st.look.t = st.t; st.look.dir = r01() < 0.5 ? 1 : -1; st.look.next = st.t + 5 + r01() * 6; }
        if (st.idleT > 3.2 && st.sitHold <= 0 && st.sitTimer <= 0 && r01() < dt * 0.35) { st.sitHold = 2.2 + r01() * 2.5; }
      } else if (!tgt.idle) { st.idleT = 0; st.sitHold = 0; }
      if (opt.forceSit != null) st.sit = opt.forceSit;
      else { if (st.sitHold > 0) { st.sitHold -= dt; if (st.sitHold <= 0) st.sitTimer = 3; } else if (st.sitTimer > 0) st.sitTimer -= dt;
        st.sit += ((st.sitHold > 0 ? 1 : 0) - st.sit) * (1 - Math.exp(-(st.sitHold > 0 ? 5 : 9) * dt)); }
    }
    /* ears trail vertical motion: a damped spring driven by vertical acceleration */
    const ay = (s.vy - st.lastVy) / Math.max(dt, 1e-4); st.lastVy = s.vy;
    st.earV += (-90 * st.earX - 9 * st.earV - clamp(ay, -60, 60) * 0.05) * dt; st.earX = clamp(st.earX + st.earV * dt, -0.6, 0.6);
    if (s.landed) { st.land = 0; st.feet = freshFeet(); st.gaitOn = false; } st.land = Math.min(1, st.land + dt / 0.2);
    /* the feet across starting, stopping and cycle changes (planted feet stay planted; still, they step onto the footprints) */
    /* how far the body moved along its own forward axis (signed: while it yaws round, the part of the motion along where it
       now faces; the rabbit faces +Z in its own space, turned by yaw) */
    const travel = s.grounded !== false ? (s.vx != null && s.yaw != null ? s.vx * Math.sin(s.yaw) : (s.speed || 0)) * dt : 0; st.travel = travel; st.dt = dt;
    if (air || st.w.gait < 0.01) st.gaitOn = false;
    feetTrack(dt, travel, tgt.idle === 1 && !air);
    let o = zero();
    if (st.w.idle > 0.001) addInto(o, layerIdle(s, zero()), st.w.idle);
    if (st.w.gait > 0.001) addInto(o, layerGait(s, zero(), G), st.w.gait);
    if (st.w.air > 0.001) addInto(o, layerAir(s, zero()), st.w.air);
    if (!s.driven && st.w.idle < 0.999) o.sit = st.sit * st.w.idle;
    /* crouching: the head and shoulders lead, the hips follow (ff-player.js's crouchFront / crouchRear), else the crouch flag */
    const cf = s.crouchFront != null ? clamp(s.crouchFront, 0, 1) : st.lowK, cr = s.crouchRear != null ? clamp(s.crouchRear, 0, 1) : st.lowK;
    if ((cf > 0.001 || cr > 0.001) && st.w.air < 0.999) { const k = 1 - st.w.air; lowness(o, cf * k, cr * k, 0.036 + 0.01 * st.low); }
    /* expressive / scripted poses, cross-faded over the locomotion (in ~0.18 s, out over poseOut) */
    const cur = s.pose && POSES[s.pose] ? s.pose : null;
    if (cur !== st.cur) { if (cur) st.pt[cur] = s.poseT || 0; st.cur = cur; }
    if (cur && !(cur in st.pw)) st.pw[cur] = 0;
    let pSum = 0, earLock = 0, headLock = 0, feetLock = 0; const po = zero(); let any = false;
    /* the feet the locomotion layers planted (v2 review fixes): poses that only move the body (crouched, frozen, sniffing,
       hiding, the hesitation, the reveal's 'prick') keep them on the ground (feetLock), so lowering folds the legs instead
       of lifting the feet off the ground or pushing them through it */
    const pre = { ik: o.ik }; for (const c of ['hzL', 'hyL', 'htL', 'hzR', 'hyR', 'htR', 'fzL', 'fyL', 'fpL', 'fzR', 'fyR', 'fpR']) pre[c] = o[c];
    for (const n in st.pw) {
      const on = n === cur, k = on ? 1 / (POSE_IN[n] || 0.18) : 1 / Math.max(0.05, s.poseOut || 0.2);
      st.pw[n] += ((on ? 1 : 0) - st.pw[n]) * (1 - Math.exp(-k * 3 * dt));
      if (on && s.poseT != null) st.pt[n] = s.poseT; else st.pt[n] = (st.pt[n] || 0) + dt;
      if (!on && st.pw[n] < 0.002) { delete st.pw[n]; delete st.pt[n]; continue; }
      const w = st.pw[n]; if (w < 0.001) continue;
      const p = zero(), lk = POSES[n](st.pt[n], p, on ? s.poseData : null, s) || {};
      addInto(po, p, w); pSum += w; earLock += (lk.earLock || 0) * w; headLock += (lk.headLock || 0) * w; feetLock += (lk.feetLock || 0) * w; any = true;
    }
    if (any) { const k = Math.min(1, pSum); const keep = 1 - k; const f = k / pSum; for (const c of CH) o[c] = o[c] * keep + po[c] * f; earLock = Math.min(1, earLock / Math.max(pSum, 1)); headLock = Math.min(1, headLock / Math.max(pSum, 1));
      const fl = Math.min(1, feetLock / Math.max(pSum, 1)) * k; if (fl > 0 && pre.ik > 0) for (const c in pre) o[c] = lerp(o[c], pre[c], fl); }
    /* live ears: targets from the player (each ear's pitch and swivel), snapped over ~0.12 s */
    if (s.ears) {
      const E = s.ears, k = 1 / 0.12;
      st.ear.pL = damp(st.ear.pL, E.pL, k, dt); st.ear.pR = damp(st.ear.pR, E.pR, k, dt); st.ear.yL = damp(st.ear.yL, E.yL, k, dt); st.ear.yR = damp(st.ear.yR, E.yR, k, dt);
      const w = clamp((E.w == null ? 1 : E.w) * (1 - earLock), 0, 1);
      o.earL = lerp(o.earL, st.ear.pL, w); o.earR = lerp(o.earR, st.ear.pR, w);
      o.earYL = lerp(o.earYL, st.ear.yL, w); o.earYR = lerp(o.earYR, st.ear.yR, w);
    }
    if (s.head) { st.hy = damp(st.hy, s.head.yaw || 0, 1 / 0.3, dt); st.hp = damp(st.hp, s.head.pitch || 0, 1 / 0.3, dt); o.headYaw += st.hy * (1 - headLock); o.head += st.hp * (1 - headLock); o.neck += 0.3 * st.hp * (1 - headLock); }
    /* breathing (rate and depth from the mood; held = shallow) on every grounded state */
    if (s.breath) {
      st.hz = damp(st.hz, s.breath.hz || 1, 3, dt); st.amp = damp(st.amp, s.breath.amp == null ? 1 : s.breath.amp, 6, dt);
      st.br = (st.br + TAU * st.hz * dt) % TAU; const b = Math.sin(st.br), g = air ? 0.3 : 1;
      o.spine += 0.022 * st.amp * b * g; o.rootY += 0.0016 * st.amp * b * g; o.swell += 0.018 * st.amp * (0.5 + 0.5 * b) * g;
    }
    /* tail up while fleeing (or by request) */
    st.tail = damp(st.tail, Math.max(s.tailUp || 0, st.flee * clamp(s.speed / 1.5, 0, 1)), 8, dt); o.tail -= 0.8 * st.tail;
    /* additive layers: startle (0.15 s), flinch, head shake, splash, sniff, ear twitches, a glance back */
    const A = s.add;
    if (A) {
      if (A.startle > 0) { const k = A.startle; o.rootY += 0.022 * k; o.pitch += 0.12 * k; o.head += 0.12 * k; o.earL += 0.35 * k; o.earR += 0.35 * k; }
      if (A.flinch > 0) { const k = A.flinch; o.rootY -= 0.022 * k; o.spine += 0.14 * k; o.neck -= 0.1 * k; o.head -= 0.08 * k; o.earL = lerp(o.earL, -1.25, k); o.earR = lerp(o.earR, -1.25, k); }
      if (A.shake > 0) { const k = A.shake, w = TAU * 10 * (A.shakeT || 0); o.headRoll += 0.32 * k * Math.sin(w); o.headYaw += 0.14 * k * Math.sin(w + 1); o.earSL += 0.22 * k * Math.sin(w + 1.3); o.earSR += 0.22 * k * Math.sin(w + 1.3); o.earL += 0.3 * k * Math.sin(w + 1.8); o.earR += 0.3 * k * Math.sin(w + 1.8); }
      if (A.splash > 0) { const k = A.splash; o.rootY -= 0.02 * k; o.spine += 0.16 * k; o.head -= 0.1 * k; }
      if (A.sniff > 0) { o.head += A.sniff * nose(st.t, 0.035, 7); o.neck += 0.04 * A.sniff; }
      if (A.twitchL > 0) { o.earL -= 0.42 * A.twitchL; o.earYL += 0.5 * A.twitchL; }
      if (A.twitchR > 0) { o.earR -= 0.42 * A.twitchR; o.earYR -= 0.5 * A.twitchR; }
      if (A.lookBack > 0) { const k = A.lookBack * (1 - headLock); o.headYaw += 1.2 * (A.lookDir || -1) * k; o.headRoll += 0.15 * (A.lookDir || -1) * k; o.earYL += 0.8 * A.lookBack; o.earYR -= 0.8 * A.lookBack; }
    }
    const lb = st.land < 1 ? Math.sin(Math.PI * st.land) : 0;
    o.rootY -= 0.022 * lb; o.spine += 0.16 * lb; o.head -= 0.08 * lb; o.earL -= 0.12 * lb; o.earR -= 0.12 * lb;
    apply(o);
    st.last = o;
  }
  /* the calm standing pose (the retarget's reference: a supplied model's rest pose stands for it) */
  function standPose() { apply(layerIdle({ driven: true }, zero(), true)); }
  return { update, st, apply, standPose, CH, POSES };
}
FF.ProcAnim = ProcAnim;

/* ------------------------------------------------------------------ a supplied model: named clips, measured strides, and
   the procedural animation retargeted onto its bones for any clip it lacks */
const CLIP_FALLBACK = {
  idle_breathe: [], walk: ['hop_run', 'idle_breathe'], hop_run: ['walk'], jump_start: ['jump_air', 'hop_run'], jump_air: ['hop_run', 'walk'],
  jump_land: ['idle_breathe'], crouch_idle: ['idle_breathe'], crouch_walk: ['crouch_idle', 'walk'], push_head: ['crouch_walk', 'walk'],
  idle_ear_twitch: [], listen: ['idle_breathe'], sniff: ['idle_breathe'], hide: ['crouch_idle'], alert_freeze: ['idle_breathe'], flee: ['hop_run'],
  groom: ['sniff', 'idle_breathe'], sniff_ground: ['sniff', 'idle_breathe'], nibble: ['sniff_ground', 'sniff'], shake_off: ['idle_breathe'],
  look_back: ['idle_breathe'], peek: ['hide', 'crouch_idle'], reach_fail: ['jump_air'], climb_in: ['jump_air', 'crouch_walk'],
  pop_out_hop_down: ['crouch_walk', 'jump_air'], drop_splash: ['jump_land'], settle_loaf_in: ['relax_lie', 'crouch_idle'],
  loaf_breathe: ['relax_lie', 'crouch_idle'], relax_lie: ['crouch_idle'], look_up: ['listen'], hesitate_look_down: ['sniff', 'crouch_idle'], startle: [],
  caught: ['hide', 'crouch_idle'], hit: ['caught', 'hide', 'crouch_idle'],
};
const POSE_CLIP = { groom: 'groom', sniff: 'sniff_ground', nibble: 'nibble', sit: 'listen', lookup: 'look_up', look: 'idle_breathe', lookback: 'look_back',
  shake: 'shake_off', loaf: 'loaf_breathe', hide: 'hide', freeze: 'alert_freeze', peek: 'peek', rear: 'sniff', lookdown: 'hesitate_look_down',
  hesitate: 'hesitate_look_down', reach: 'reach_fail', climb: 'climb_in', popout: 'pop_out_hop_down', flinch: 'crouch_idle', watch: 'hide', prick: 'alert_freeze' };
const POSE_ONCE = { shake: 1, reach: 1, climb: 1, popout: 1, lookback: 1, sniff: 1, lookup: 1, lookdown: 1, hesitate: 1, freeze: 1 };
/* the ground speeds ASSETS-3D.md asks the moving clips to be authored at (used only when a clip's stride can't be measured) */
const LOCO = { walk: 1.0, hop_run: 2.75, flee: 3.6, crouch_walk: 0.75, push_head: 0.62 };
const PBONES = boneTable().map(b => [b[0], b[1]]);
const NEED = ['hips', 'spine', 'chest', 'head', 'front_upper_L', 'front_lower_L', 'front_paw_L', 'front_upper_R', 'front_lower_R', 'front_paw_R',
  'hind_upper_L', 'hind_lower_L', 'hind_foot_L', 'hind_upper_R', 'hind_lower_R', 'hind_foot_R'];
const LEGS = [['hind_upper_L', 'hind_lower_L', 'hind_foot_L', -1], ['hind_upper_R', 'hind_lower_R', 'hind_foot_R', -1],
  ['front_upper_L', 'front_lower_L', 'front_paw_L', 1], ['front_upper_R', 'front_lower_R', 'front_paw_R', 1]];

/* the procedural skeleton alone (no mesh): the hidden driver of a supplied model */
function bonesOnly() {
  const byName = {}, world = {};
  for (const [name, parent, p] of boneTable()) { const b = new T.Bone(); b.name = name; world[name] = new T.Vector3(p[0], p[1], p[2]); b.position.copy(world[name]); if (parent) { b.position.sub(world[parent]); byName[parent].add(b); } byName[name] = b; }
  return { bones: byName, rest: Object.fromEntries(Object.entries(byName).map(([k, v]) => [k, v.position.clone()])) };
}
/* the procedural skeleton's world rotations and positions (its root is the rabbit's own space) */
function procWorld(pb, Q, Pp) {
  for (const [n, par] of PBONES) {
    const b = pb[n];
    if (!par) { Q[n].copy(b.quaternion); Pp[n].copy(b.position); continue; }
    Q[n].copy(Q[par]).multiply(b.quaternion); Pp[n].copy(b.position).applyQuaternion(Q[par]).add(Pp[par]);
  }
}
/* the rabbit-space [y, z] of a model bone's joint */
const _v3 = new T.Vector3(), _q1 = new T.Quaternion(), _q2 = new T.Quaternion();
function yz(b, holder) { b.getWorldPosition(_v3); holder.worldToLocal(_v3); return [_v3.y, _v3.z]; }
function turnX(b, holder, a) {    /* turn a bone about the rabbit's own sideways axis by a */
  if (Math.abs(a) < 1e-6) return;
  const axis = new T.Vector3(1, 0, 0).applyQuaternion(holder.getWorldQuaternion(_q1)).applyQuaternion(b.parent.getWorldQuaternion(_q2).invert()).normalize();
  b.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(axis, a)); b.updateMatrixWorld(true);
}
/* a model leg: upper and lower turn so the end joint reaches tg; the end bone keeps its orientation. scap > 0 (forelegs):
   the shoulder joint may slide up to that far towards a paw it can't otherwise reach (the shoulder blade) */
function legIK(A, Bn, C, tg, sign, w, holder, scap) {
  let pa = yz(A, holder), pb = yz(Bn, holder), pc = yz(C, holder);
  const l1 = len2(sub2(pb, pa)), l2 = len2(sub2(pc, pb));
  if (l1 < 1e-4 || l2 < 1e-4) return;
  if (scap > 0) {
    const v = sub2(tg, pa), d = len2(v), reach = (l1 + l2) * 0.97;
    if (d > reach) {
      const e = Math.min(scap, d - reach) * w, p = A.getWorldPosition(new T.Vector3()); holder.worldToLocal(p);
      p.y += v[0] / d * e; p.z += v[1] / d * e; holder.localToWorld(p); A.parent.worldToLocal(p); A.position.copy(p); A.updateMatrixWorld(true);
      pa = yz(A, holder); pb = yz(Bn, holder); pc = yz(C, holder);
    }
  }
  const s = solve2(pa, tg, l1, l2, sign), endQ = C.getWorldQuaternion(new T.Quaternion());
  const dU = wrapPI(s.aU - ang(sub2(pb, pa))) * w; turnX(A, holder, dU);
  const dL = wrapPI(s.aL - ang(sub2(pc, pb))) * w - dU; turnX(Bn, holder, dL);
  C.quaternion.copy(C.parent.getWorldQuaternion(_q2).invert().multiply(endQ)); C.updateMatrixWorld(true);
}
/* how fast a moving clip's planted feet travel back (= the ground speed it was made for), when its hind feet touch down
   and when they are furthest back (the held pose for a missing jump clip) */
function measureClip(root, clip, bone, holder) {
  const feet = ['hind_foot_L', 'hind_foot_R', 'front_paw_L', 'front_paw_R'].filter(n => bone[n]);
  if (!feet.length || !(clip.duration > 0)) return null;
  const mixer = new T.AnimationMixer(root), a = mixer.clipAction(clip); a.play();
  const N = 60, dt = clip.duration / N, rec = feet.map(() => []);
  for (let i = 0; i <= N; i++) { mixer.setTime(i * dt); root.updateMatrixWorld(true); feet.forEach((n, k) => rec[k].push(yz(bone[n], holder))); }
  a.stop(); mixer.uncacheClip(clip);
  const out = { dur: clip.duration, feet: {} }, hs = [];
  feet.forEach((n, k) => {
    const r = rec[k], ys = r.map(p => p[0]), mn = Math.min(...ys), mx = Math.max(...ys), thr = mn + Math.max(0.003, 0.15 * (mx - mn)), vs = [];
    for (let i = 0; i < N; i++) if (r[i][0] < thr && r[i + 1][0] < thr) vs.push(-(r[i + 1][1] - r[i][1]) / dt);
    if (vs.length >= 3) { vs.sort((x, y) => x - y); out.feet[n] = +vs[vs.length >> 1].toFixed(3); if (/^hind/.test(n)) hs.push(out.feet[n]); }
    if (n === 'hind_foot_L' || (n === 'hind_foot_R' && out.touch == null)) {
      for (let i = 1; i <= N; i++) if (r[i][0] < thr && r[i - 1][0] >= thr) { out.touch = i / N; break; }
      let zi = 0; for (let i = 0; i <= N; i++) if (r[i][1] < r[zi][1]) zi = i; out.extend = zi / N;
    }
  });
  const all = hs.length ? hs : Object.values(out.feet); if (!all.length) return out;
  all.sort((x, y) => x - y); const sp = all[all.length >> 1];
  if (sp > 0.1 && sp < 12) { out.speed = +sp.toFixed(3); out.stride = +(sp * clip.duration).toFixed(3); }
  return out;
}

function ModelAnim(root, clips, holder, opts) {
  opts = opts || {};
  const mixer = new T.AnimationMixer(root), by = {}; for (const c of clips) by[c.name] = c;
  const bone = {}; root.traverse(o => { if (o.isBone) bone[o.name] = o; });
  const pick = n => { if (by[n]) return n; for (const f of CLIP_FALLBACK[n] || []) { if (by[f]) return f; for (const g of CLIP_FALLBACK[f] || []) if (by[g]) return g; } return clips[0] ? clips[0].name : null; };
  const acts = {}; const act = n => { if (!n || !by[n]) return null; if (!acts[n]) acts[n] = mixer.clipAction(by[n]); return acts[n]; };
  holder.updateMatrixWorld(true);
  /* rest pose snapshot (the measuring and the retarget start from it) */
  const allBones = Object.values(bone), snap = allBones.map(b => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const restore = () => allBones.forEach((b, i) => { b.position.copy(snap[i][0]); b.quaternion.copy(snap[i][1]); b.scale.copy(snap[i][2]); });
  const cal = {};
  for (const n of Object.keys(LOCO)) if (by[n]) { try { cal[n] = measureClip(root, by[n], bone, holder); } catch (e) { cal[n] = null; } restore(); }
  root.updateMatrixWorld(true);
  /* a moving clip whose planted feet hardly travel (or race) can't be played without sliding: in auto mode it is drawn
     procedurally instead (its measured speed is far from the speed ASSETS-3D.md asks for) */
  const unusable = n => LOCO[n] != null && cal[n] !== undefined && !(cal[n] && cal[n].speed > 0.25 * LOCO[n] && cal[n].speed < 4 * LOCO[n]);
  /* the retarget: the procedural skeleton drives the model's bones as rotations relative to its standing pose, which the
     model's own rest pose stands for; then each model leg reaches the same footprints by its own IK */
  const mode = opts.mode || 'auto';
  let R = null;
  if (mode !== 'clips' && NEED.every(n => bone[n])) {
    const pr = bonesOnly(), anim = ProcAnim(pr, { seed: 5 });
    const Q = {}, Pp = {}; for (const [n] of PBONES) { Q[n] = new T.Quaternion(); Pp[n] = new T.Vector3(); }
    anim.standPose(); procWorld(pr.bones, Q, Pp);
    const QsInv = {}, PpS = {}; for (const [n] of PBONES) { QsInv[n] = Q[n].clone().invert(); PpS[n] = Pp[n].clone(); }
    const map = [];
    for (const [n] of PBONES) {
      const b = bone[n]; if (!b) continue;
      const par = b.parent, pn = par && par.isBone && bone[par.name] === par && PBONES.some(x => x[0] === par.name) ? par.name : null;
      map.push({ n, b, W: b.getWorldQuaternion(new T.Quaternion()), WpInv: par.getWorldQuaternion(new T.Quaternion()).invert(), pn, restQ: b.quaternion.clone(), restP: b.position.clone() });
    }
    const hp = bone.hips.parent; hp.updateMatrixWorld(true);
    const hipsM = new T.Matrix3().setFromMatrix4(new T.Matrix4().copy(hp.matrixWorld).invert());
    /* each leg's end joint: the model's standing position minus the procedural one (rabbit space) */
    const endOff = {}; for (const [, , c] of LEGS) { const m = yz(bone[c], holder), p = [PpS[c].y, PpS[c].z]; endOff[c] = sub2(m, p); }
    /* the shoulder slide, in proportion to the model's foreleg (0.04 m on the stand-in's 0.083 m leg) */
    const fl = len2(sub2(yz(bone.front_lower_L, holder), yz(bone.front_upper_L, holder))) + len2(sub2(yz(bone.front_paw_L, holder), yz(bone.front_lower_L, holder)));
    R = { pr, anim, Q, Pp, QsInv, PpS, map, hipsM, endOff, Qt: {}, scap: 0.48 * fl };
    for (const [n] of PBONES) R.Qt[n] = new T.Quaternion();
  }
  let cur = null, curName = '', curLoco = false, landT = 9, idleT = 0, nextTwitch = 3, oneShot = 0, loafIn = 0, wP = 0, ts = 1, want = null, fail = null;
  const rnd = prng(11);
  const ear = { pL: 0, pR: 0, yL: 0, yR: 0 }; let hy = 0;
  /* which clip the moment asks for */
  function choose(s) {
    const g = s.gait, gn = g && g.name, v = s.speed || 0;
    if (fail) return { name: fail === 'shot' ? 'hit' : 'caught', once: true, pose: 'flinch' };
    if (s.pose && POSE_CLIP[s.pose]) {
      let name = POSE_CLIP[s.pose], once = !!POSE_ONCE[s.pose];
      if (s.pose === 'loaf') { if (loafIn < 1.0 && by.settle_loaf_in) { name = 'settle_loaf_in'; once = true; } }
      return { name, once, pose: s.pose };
    }
    if (!s.grounded || gn === 'air') return { name: s.vy > 0 && (s.airT || 0) < 0.1 ? 'jump_start' : 'jump_air', once: true, air: true };
    if (landT < 0.18 && by.jump_land) return { name: 'jump_land', once: true };
    if (s.push || gn === 'push') return { name: 'push_head', loco: true };
    const moving = g ? (gn === 'walk' || gn === 'run' || gn === 'crouch') && v > 0.02 : v > 0.05;
    const low = s.crouchK != null ? s.crouchK > 0.5 || !!s.crouch : !!s.crouch;
    if (moving && (gn === 'crouch' || (!g && s.crouch))) return { name: 'crouch_walk', loco: true };
    if (moving) { const run = g ? gn === 'run' || (g.runK || 0) > 0.5 : v > 1.6; return { name: run ? (s.flee && v > 1.6 ? 'flee' : 'hop_run') : 'walk', loco: true }; }
    if (low) return { name: s.low ? 'hide' : 'crouch_idle' };
    return { name: 'idle_breathe', idle: true };
  }
  function play(n, fade, once, sync) {
    const a = act(n); if (!a || a === cur) return a;
    const prev = cur, prevLoco = curLoco;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity); a.clampWhenFinished = !!once;
    /* moving clips keep the stride going: from another moving clip at the same point of its cycle, else from the gait */
    if (sync != null) a.time = sync * by[n].duration;
    else if (prev && prevLoco && LOCO[n] != null) a.time = ((prev.time / Math.max(1e-3, prev.getClip().duration)) % 1) * by[n].duration;
    if (prev) a.crossFadeFrom(prev, fade, false); a.play(); cur = a; curName = n; curLoco = LOCO[n] != null; return a;
  }
  function retarget(s, w) {
    const P = R.pr.bones;
    procWorld(P, R.Q, R.Pp);
    for (const m of R.map) {
      const Qb = R.Qt[m.n].copy(R.Q[m.n]).multiply(R.QsInv[m.n]);
      const qpInv = m.pn ? _q1.copy(R.Qt[m.pn]).invert() : _q1.identity();
      const tq = _q2.copy(m.WpInv).multiply(qpInv).multiply(Qb).multiply(m.W);
      m.b.quaternion.slerp(tq, w);
      if (m.n === 'front_upper_L' || m.n === 'front_upper_R') m.b.position.copy(m.restP);
    }
    const d = R.Pp.hips.clone().sub(R.PpS.hips).applyMatrix3(R.hipsM);
    const hm = R.map.find(m => m.n === 'hips'); bone.hips.position.lerp(hm.restP.clone().add(d), w);
    root.updateMatrixWorld(true);
    /* the model's own legs reach the procedural rabbit's footprints */
    const ikW = clamp((R.anim.st.last && R.anim.st.last.ik) || 0, 0, 1) * w;
    if (ikW > 0.001) for (const [a, b, c, sign] of LEGS) { const p = R.Pp[c]; legIK(bone[a], bone[b], bone[c], add2([p.y, p.z], R.endOff[c]), sign, ikW, holder, sign > 0 ? R.scap : 0); }
  }
  /* The stop. Crossfading a moving clip into the standing clip drags the planted feet across the ground to the standing pose
     (a skid of ~0.3 s: about 15 cm of foot travel over the four feet at the end of a run). So when a moving clip hands over to
     the stand, the feet on the ground are held where they landed (leg IK) for as long as he stands; the body takes the standing
     pose over them. When something else begins, they step to the clip's places (a small lift) or, if he moves off, are let go. */
  let lock = null, lockSaved = null, standY = null;
  if (by.idle_breathe && NEED.every(n => bone[n])) {   // the standing clip's ankle heights: a foot near them is on the ground
    standY = {}; const mx = new T.AnimationMixer(root), ac = mx.clipAction(by.idle_breathe); ac.play(); mx.setTime(0); root.updateMatrixWorld(true);
    for (const [, , c] of LEGS) standY[c] = yz(bone[c], holder)[0];
    ac.stop(); mx.uncacheClip(by.idle_breathe); restore(); root.updateMatrixWorld(true);
  }
  const LOCK_STEP = 0.3, LOCK_GO = 0.12, LOCK_LIFT = 0.010;
  function lockFeet() {
    if (!standY) return;
    lock = { rel: -1, dur: LOCK_STEP, legs: [] };
    for (const l of LEGS) addLock(l);
  }
  /* a foot within a few mm of the standing height is on the ground: held there (a foot still in the air is held once it lands) */
  function addLock(l) {
    if (lock.legs.some(g => g.l === l)) return;
    const p = yz(bone[l[2]], holder); if (p[0] < standY[l[2]] + 0.008) lock.legs.push({ l, p: [standY[l[2]], p[1]] });
  }
  /* (the mixer writes a bone only when its animated value changes, so the clip's own pose is put back before each update) */
  function unlock() { if (lockSaved) { for (const [b, q] of lockSaved) b.quaternion.copy(q); lockSaved = null; } }
  function applyLock(dt, hold, quick) {
    if (!hold && lock.rel < 0) { lock.rel = 0; lock.dur = quick ? LOCK_GO : LOCK_STEP; }
    if (lock.rel >= 0) lock.rel += dt / lock.dur;
    const u = lock.rel < 0 ? 0 : clamp(lock.rel, 0, 1), k = u * u * (3 - 2 * u);
    if (lock.rel >= 1) { lock = null; return; }
    if (lock.rel < 0 && lock.legs.length < 4) for (const l of LEGS) addLock(l);
    lockSaved = [];
    for (const g of lock.legs) {
      const [a, b, c, sign] = g.l, cur = yz(bone[c], holder);
      for (const n of [a, b, c]) lockSaved.push([bone[n], bone[n].quaternion.clone()]);
      legIK(bone[a], bone[b], bone[c], [g.p[0] + (cur[0] - g.p[0]) * k + LOCK_LIFT * Math.sin(Math.PI * u), g.p[1] + (cur[1] - g.p[1]) * k], sign, 1, holder, 0);
    }
  }
  function update(dt, s) {
    landT += dt; if (s.landed) landT = 0;
    if (s.pose === 'loaf') loafIn += dt; else loafIn = 0;
    want = choose(s);
    const exact = !!by[want.name] && !(R && mode === 'auto' && unusable(want.name));
    const useProc = !!R && (mode === 'proc' || (!exact && !want.idle) || (!exact && want.idle && !by.idle_breathe));
    let name = exact ? want.name : pick(want.name);
    if (want.idle) { idleT += dt; if (idleT > nextTwitch && by.idle_ear_twitch) { oneShot = 0.8; idleT = 0; nextTwitch = 2 + rnd() * 4; } if (oneShot > 0) { oneShot -= dt; name = 'idle_ear_twitch'; } } else idleT = 0;
    /* the playback rate: moving clips at the speed their own feet were made for, so nothing slides */
    const v = s.speed || 0, c = name && cal[name], native = (c && c.speed) || LOCO[name] || 1, g = s.gait;
    let sync = null;
    if (LOCO[name] != null && !curLoco && g && g.phase != null && c && c.touch != null) sync = ((g.phase + c.touch) % 1 + 1) % 1;
    if (curLoco && LOCO[name] == null && want.idle && !lock && mode !== 'proc' && NEED.every(n => bone[n])) lockFeet();
    const a = name ? play(name, name.startsWith('jump') ? 0.06 : 0.16, want.once && name === want.name, sync) : null;
    if (a) {
      if (want.air && !/^jump/.test(name)) { a.time = ((c && c.extend != null ? c.extend : 0.35) * by[name].duration); ts = 0; }        // a missing jump clip: hold the run's stretched-out moment
      else if (LOCO[name] != null) {
        ts = name === 'push_head' && v < 0.05 ? Math.max(0.4, (s.effort || 0) * 0.5) : clamp(v / native, 0.1, 3);
        /* keep in step with the gait (the footstep sounds) when the clip's stride is close to the gait's: a nudge of <= 8% */
        if (g && c && c.stride && c.touch != null && g.stride && Math.abs(c.stride / g.stride - 1) < 0.2 && v > 0.1) {
          const dur = by[name].duration, wantT = (((g.phase + c.touch) % 1) + 1) % 1 * dur;
          let e = (wantT - a.time) / dur; e -= Math.round(e); ts *= 1 + clamp(e * 2, -0.08, 0.08);
        }
      } else ts = 1;
      a.timeScale = ts;
    }
    /* the procedural driver keeps running so it can take over or hand back at any moment */
    if (R) {
      const ps = useProc && !exact && want.pose === 'flinch' ? Object.assign({}, s, { pose: 'flinch', poseT: 0 }) : s;
      R.anim.update(dt, ps);
    }
    wP = damp(wP, useProc ? 1 : 0, 1 / 0.15, dt); if (!R) wP = 0;
    if (wP > 0.001 && wP < 0.999) for (const m of R.map) { m.b.quaternion.copy(m.restQ); m.b.position.copy(m.restP); }
    unlock(); mixer.update(dt);
    if (wP > 0.001) retarget(s, wP);
    if (lock) { if (wP < 0.5) { root.updateMatrixWorld(true); applyLock(dt, want.idle && !want.pose, LOCO[name] != null); } else lock = null; }
    /* live layers on the model's own bones (additive to a clip): ears turn to sounds, the head follows */
    const k = 1 - wP;
    if (k > 0.001 && s.ears && bone.ear_L_01 && bone.ear_R_01) {
      const E = s.ears, kk = 1 / 0.12, w = (E.w == null ? 1 : E.w) * (s.pose ? 0.3 : 0.7) * k;
      ear.pL = damp(ear.pL, E.pL, kk, dt); ear.pR = damp(ear.pR, E.pR, kk, dt); ear.yL = damp(ear.yL, E.yL, kk, dt); ear.yR = damp(ear.yR, E.yR, kk, dt);
      bone.ear_L_01.rotation.x += 0.5 * ear.pL * w; bone.ear_R_01.rotation.x += 0.5 * ear.pR * w;
      bone.ear_L_01.rotation.y += 0.6 * ear.yL * w; bone.ear_R_01.rotation.y += 0.6 * ear.yR * w;
    }
    if (k > 0.001 && s.head && bone.head) { hy = damp(hy, s.head.yaw || 0, 1 / 0.3, dt); bone.head.rotation.y += hy * 0.6 * (s.pose ? 0.2 : 1) * k; }
  }
  return {
    update, mixer, clips: Object.keys(by), cal, retarget: !!R, mode, unusable: Object.keys(LOCO).filter(n => by[n] && unusable(n)),
    setFail(kind) { fail = kind || null; },
    get current() { return curName; },
    debug() { return { clip: curName, want: want && want.name, ts: +ts.toFixed(3), proc: +wP.toFixed(2), retarget: !!R, mode, lock: lock ? lock.legs.length + (lock.rel < 0 ? " held" : " rel" + lock.rel.toFixed(2)) : 0 }; },
  };
}

/* ------------------------------------------------------------------ loading */
/* short names for ?rabbit=: 'tripo' is the Tripo rabbit (rigged 8 Oct; clips idle_breathe, walk, hop_run) */
const MODEL_ALIAS = { tripo: 'ff_rabbit_tripo.glb' };
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script ' + src)); document.head.appendChild(s); }); }
FF.loadGLTFLoader = () => T.GLTFLoader ? Promise.resolve() : loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js');

async function loadModel(url, L) {
  const head = await fetch(url, { method: 'GET', cache: 'no-cache' }).catch(() => null);
  if (!head || !head.ok) return null;
  const buf = await head.arrayBuffer();
  await FF.loadGLTFLoader();
  const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(buf, url.replace(/[^/]*$/, ''), res, rej));
  const scene = gltf.scene; let skinned = null, meshes = 0;
  scene.traverse(o => { if (o.isMesh) { meshes++; if (o.isSkinnedMesh && !skinned) skinned = o; } });
  /* the matte look is enforced: keep the model's colour / texture / vertex colours, replace the shading */
  scene.traverse(o => {
    if (!o.isMesh) return; const src = o.material;
    o.material = rabbitMaterial(L, { vertexColors: !!(o.geometry.attributes.color), map: src.map || null, skinning: !!o.isSkinnedMesh, softCap: true });
    if (!src.map && !o.geometry.attributes.color && src.color) o.material.color.copy(src.color);
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
  });
  /* sanity: a rabbit is ~0.3-0.5 m long. Models exported in centimetres or at odd scales are brought to 0.40 m */
  scene.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(scene), size = box.getSize(new T.Vector3()), len = Math.max(size.x, size.z);
  let rescaled = 1; if (len < 0.15 || len > 1.0) { rescaled = 0.40 / len; scene.scale.multiplyScalar(rescaled); console.warn('[farfield] rabbit model is ' + len.toFixed(3) + ' units long; rescaled x' + rescaled.toFixed(4) + ' to 0.40 m'); }
  return { scene, clips: gltf.animations || [], skinned, meshes, size: size.toArray(), rescaled };
}

FF.Rabbit = {
  /* returns a rig: the object to place, update(dt, anim), kind ('procedural' | 'model'), info, debug() */
  async create(L, opts) {
    opts = opts || {};
    const Qs = new URLSearchParams(location.search), q = Qs.get('rabbit'), amode = Qs.get('rabbitanim');
    const holder = new T.Group(); holder.name = 'rabbit';
    /* the game passes opts.file from models/models.json (FF.MODELS.rabbit); null = no request at all (clean console).
       ?rabbit=<file under models/> overrides, ?rabbit=procedural forces the temporary rabbit. */
    const want = q ? q : (opts.file || null);
    let rig = null;
    if (want && want !== 'procedural') {
      const file = (MODEL_ALIAS[want] || want).replace(/[^\w./-]/g, '').replace(/\.\.+/g, '');
      try {
        const m = await loadModel('models/' + file, L);
        if (m) {
          holder.add(m.scene);
          const anim = ModelAnim(m.scene, m.clips, holder, { mode: /^(clips|proc|auto)$/.test(amode || '') ? amode : (opts.animMode || 'auto') });
          console.log('[farfield] rabbit model models/' + file + ': clips ' + anim.clips.join(', ') + '; measured ' + JSON.stringify(Object.fromEntries(Object.entries(anim.cal).map(([k, c]) => [k, c && c.speed]))) + (anim.retarget ? '; missing clips drawn procedurally' : '') + (anim.retarget && anim.mode === 'auto' && anim.unusable.length ? '; drawn procedurally too, their feet would slide: ' + anim.unusable.join(', ') : ''));
          rig = { object: holder, kind: 'model', file, info: { clips: anim.clips, skinned: !!m.skinned, meshes: m.meshes, size: m.size, rescaled: m.rescaled, retarget: anim.retarget, cal: anim.cal },
            update: (dt, s) => anim.update(dt, s), anim, debug: () => Object.assign({ kind: 'model', file }, anim.debug()) };
        }
      } catch (e) { console.warn('[farfield] rabbit model failed, using the temporary rabbit:', e.message); }
    }
    if (!rig) {
      const pr = buildProcedural(L); holder.add(pr.mesh);
      const anim = ProcAnim(pr, opts);
      rig = { object: holder, kind: 'procedural', rig: pr, anim, info: { bones: FF.RABBIT_BONES.length }, update: (dt, s) => anim.update(dt, s), get footfall() { return anim.st.footfall; },
        debug: () => ({ kind: 'procedural', gait: anim.st.G ? { name: anim.st.G.name, phase: +anim.st.G.phase.toFixed(3) } : null, ik: anim.st.last ? +(anim.st.last.ik || 0).toFixed(2) : 0 }) };
    }
    /* caught / shot: a model with those clips plays them under the black (the game cuts on the same frame) */
    if (FF.bus && FF.bus.on && rig.anim && rig.anim.setFail) {
      const a = rig.anim;
      FF.bus.on('fail', d => a.setFail((d && d.kind) || 'caught')); FF.bus.on('restart', () => a.setFail(null));
    }
    FF.Rabbit.last = rig;
    return rig;
  },
  buildProcedural, ProcAnim, rabbitMaterial, POSES, bonesOnly, measureClip,
  /* live uniforms shared by every rabbit material: lift (self-light), rimK (rim multiplier) */
  uniforms: RU,
};
})();
