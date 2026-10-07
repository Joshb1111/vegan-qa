/* FAR FIELD — ff-rabbit.js: the rabbit slot. OWNER: the rabbit builder (with ff-player.js). Keep FF.Rabbit.create's
   contract (docs/farfield/INTERFACES.md §8.3); tools/bake-rabbit.html also uses buildProcedural + ProcAnim (it loads only
   ff-config.js, ff-shading.js and this file, so nothing here may need ff-core.js).
   1. TEMPORARY procedural rabbit: a real skinned mesh (one draw call) built from smooth ellipsoids, rigidly weighted to
      the same skeleton the commissioned model must have (bone names in docs/farfield/ASSETS-3D.md), animated in code.
   2. Model slot: if models/models.json names a rabbit file (or ?rabbit=<file under models/>), it is loaded with
      GLTFLoader (three r128, loaded only then) and driven by its named clips through an AnimationMixer, with the same
      procedural ear / head / breath layers added on its bones when they carry the ASSETS-3D names.
      Missing clips fall back to near neighbours; no model at all falls back to the procedural rabbit.
   Conventions (both paths): metres, Y up, the model faces +Z, origin on the ground between the feet.
   The game turns the rabbit to face +X or -X (side-on).
   FF.Rabbit.create(look, { file }) -> Promise<rig>; rig = { object, update(dt, anim), kind, info, ... }
   anim (from ff-player.js; every field optional): { speed, vx, vy, grounded, crouch, push, effort, landed, airT,
     driven (the player drives the idles), pose, poseT, poseOut, poseData, ears {pL, pR, yL, yR, w}, head {yaw, pitch},
     breath {hz, amp}, tailUp, flee, low, near ('L'|'R': the ear nearer the camera), add {startle, flinch, shake, shakeT,
     splash, sniff, twitchL, twitchR, lookBack, lookDir} }.
   Poses (ProcAnim.POSES): groom, sniff, nibble, sit, lookup, look, lookback, shake, loaf, hide, watch, freeze, peek, rear,
     lookdown, hesitate, reach, climb, popout, flinch. The rabbit is never shown caught or hit: 'flinch' is all there is,
     and the game cuts to black on the same frame. */
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
  /* an ellipsoid on one bone (or an ear spread over three) */
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
  const b = idx;
  part([0, 0.1, -0.086], [0.068, 0.072, 0.086], { bone: b('hips'), seg: 20, segH: 14 });             // haunch
  part([0, 0.1, -0.012], [0.057, 0.061, 0.085], { bone: b('spine'), seg: 18 });                        // belly / back
  part([0, 0.106, 0.058], [0.05, 0.057, 0.056], { bone: b('chest') });                                  // chest
  part([0, 0.146, 0.098], [0.034, 0.04, 0.036], { bone: b('neck'), seg: 12, segH: 10 });               // neck
  part([0, 0.186, 0.142], [0.039, 0.041, 0.053], { bone: b('head'), rx: 0.28 });                      // head
  part([0, 0.172, 0.184], [0.025, 0.025, 0.027], { bone: b('head'), seg: 12, segH: 10 });              // muzzle
  part([0, 0.104, -0.168], [0.026, 0.026, 0.024], { bone: b('tail'), seg: 12, segH: 10, col: tailC }); // tail
  for (const [s, n] of [[1, 'L'], [-1, 'R']]) {
    part([s * 0.021, 0.17, 0.158], [0.022, 0.02, 0.025], { bone: b('head'), seg: 12, segH: 10 });      // cheek
    part([s * 0.031, 0.196, 0.163], [0.0085, 0.0095, 0.0085], { bone: b('head'), seg: 10, segH: 8, col: eye }); // eye
    const eb = earBase(s), ea = earAxis(s), ec = eb.clone().addScaledVector(ea, EAR_LEN / 2);
    part(ec.toArray(), [0.0072, EAR_LEN / 2, 0.019], { ear: { side: s, bones: [b('ear_' + n + '_01'), b('ear_' + n + '_02'), b('ear_' + n + '_03')] }, rx: -EAR_TILT, rz: -s * EAR_SPREAD, seg: 12, segH: 14 });
    part([s * 0.043, 0.086, -0.076], [0.031, 0.058, 0.071], { bone: b('hind_upper_' + n), rx: -0.25 }); // thigh
    part([s * 0.05, 0.036, -0.092], [0.013, 0.03, 0.02], { bone: b('hind_lower_' + n), seg: 10, segH: 8 }); // shin
    part([s * 0.049, 0.013, -0.068], [0.016, 0.013, 0.058], { bone: b('hind_foot_' + n), seg: 12, segH: 8 }); // long hind foot
    part([s * 0.03, 0.072, 0.086], [0.016, 0.034, 0.018], { bone: b('front_upper_' + n), seg: 10, segH: 8 }); // foreleg
    part([s * 0.03, 0.034, 0.091], [0.012, 0.028, 0.013], { bone: b('front_lower_' + n), seg: 10, segH: 8 });
    part([s * 0.03, 0.011, 0.1], [0.014, 0.011, 0.022], { bone: b('front_paw_' + n), seg: 10, segH: 8 });  // paw
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(COL, 3));
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(SI, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(SW, 4));
  g.setIndex(IDX); g.computeBoundingSphere();
  const mat = rabbitMaterial(L, { vertexColors: true });
  const mesh = new T.SkinnedMesh(g, mat); mesh.name = 'rabbit_body';
  mesh.add(bones[0]); mesh.updateMatrixWorld(true); mesh.bind(new T.Skeleton(bones));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return { mesh, bones: byName, rest: Object.fromEntries(Object.entries(byName).map(([k, v]) => [k, v.position.clone()])) };
}

/* the rabbit's material: the shared matte look (FF.mat) plus two live uniforms of its own, shared by every rabbit material
   (the procedural mesh or a supplied model's meshes): the self-lift (the world sets it per place in look.rabbit.lift; the
   player pushes it each frame) and a rim multiplier (the rim drops to behave.hideRim in a hide core, never to zero) */
const RU = { lift: { value: 0.006 }, rimK: { value: 1 } };
function rabbitMaterial(L, extra) {
  const R = L.materials.rabbit;
  RU.lift.value = (L.rabbit && L.rabbit.lift) || 0.006;
  const m = FF.mat({ color: extra && extra.map ? '#ffffff' : (extra && extra.vertexColors ? '#ffffff' : R.color), roughness: R.roughness, rim: true, noAO: true, lift: RU.lift.value || 0.006 },
    Object.assign({ skinning: true }, extra || {}));
  const ob = m.onBeforeCompile, ck = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    ob.call(m, sh, r);
    sh.uniforms.uFFLift = RU.lift; sh.uniforms.uFFRabRimK = RU.rimK;
    sh.fragmentShader = 'uniform float uFFRabRimK;\n' + sh.fragmentShader.replace('totalEmissiveRadiance += uFFRim.rgb', 'totalEmissiveRadiance += uFFRabRimK * uFFRim.rgb');
  };
  m.customProgramCacheKey = () => (ck ? ck.call(m) : '') + '|ffrab1';
  return m;
}

/* ------------------------------------------------------------------ procedural animation: channels -> bones */
const CH = ['rootY', 'rootZ', 'pitch', 'spine', 'neck', 'head', 'headYaw', 'headRoll', 'earL', 'earR', 'earSL', 'earSR', 'earYL', 'earYR', 'earBL', 'earBR',
  'fL', 'fR', 'fkL', 'fkR', 'hL', 'hR', 'hkL', 'hkR', 'hfL', 'hfR', 'tail', 'sit', 'roll', 'swell'];
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
    return { earLock: 0.3, headLock: 0.85 };
  },
  /* eats a few blades of grass and clover: head down, chewing */
  nibble(t, o) {
    stand(o); const e = sstep(0, 0.35, t);
    o.neck = lerp(0.02, -0.4, e); o.head = lerp(-0.05, -0.74, e) + 0.045 * Math.sin(TAU * 4.6 * t) * e; o.headRoll = 0.035 * Math.sin(TAU * 2.3 * t) * e;
    o.pitch = -0.07 * e; o.rootZ = 0.01 * e; o.earL = o.earR = -0.12; o.earSL = o.earSR = 0.08;
    return { earLock: 0.6, headLock: 0.9 };
  },
  /* sits up on the haunches to listen; the ears stay live (they turn to the sound) */
  sit(t, o) { stand(o); o.sit = 1; o.head = 0.08; o.neck = 0.05; o.fL = o.fR = 0.25; o.fkL = o.fkR = 0.45; o.earL = o.earR = 0.16; o.head += nose(t, 0.012, 6); return { earLock: 0, headLock: 0.3 }; },
  /* a long look up at the hall */
  lookup(t, o) { stand(o); o.sit = 0.72; o.head = 0.62; o.neck = 0.26; o.fL = o.fR = 0.2; o.fkL = o.fkR = 0.4; o.earL = o.earR = 0.12; return { earLock: 0.2, headLock: 1 }; },
  /* look at something (d.yaw, d.pitch: head turn and tilt) */
  look(t, o, d) { stand(o); o.headYaw = (d && d.yaw) || 0; o.head = -0.05 + ((d && d.pitch) || 0); o.neck = 0.05; o.headRoll = 0.12 * ((d && d.yaw) || 0); o.earL = o.earR = 0.14; return { earLock: 0, headLock: 1 }; },
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
  hide(t, o) { low(o, 0.046); o.spine = 0.22; o.neck = -0.15; o.head = 0.05; o.earL = o.earR = -1.25; o.earBL = o.earBR = 0.22; return { earLock: 0.8, headLock: 0.6 }; },
  /* stops dead, tense; the ears stay live on the threat */
  freeze(t, o) { stand(o); o.rootY = -0.008; o.spine = -0.04; o.neck = 0.06; o.head = 0.02; o.tail = 0.0; return { earLock: 0, headLock: 0.4 }; },
  /* watching from cover that is not low (under the deck): crouched, still, head up; the ears stay live on the threat */
  watch(t, o) { low(o, 0.026); o.neck = 0.08; o.head = 0.1; o.spine = 0.14; o.earL = o.earR = -0.35; o.earBL = o.earBR = 0.04; return { earLock: 0, headLock: 0.3 }; },
  /* at the edge of cover: head forward, body back */
  peek(t, o) { low(o, 0.03); o.rootZ = 0.022; o.neck = 0.1; o.head = 0.12 + nose(t, 0.012); o.earL = o.earR = -0.55; o.earBL = o.earBR = 0.05; return { earLock: 0.5, headLock: 0.5 }; },
  /* at the post: rears a little and sniffs the top */
  rear(t, o) { stand(o); const e = sstep(0, 0.3, t); o.sit = 0.48 * e; o.pitch = 0.08 * e; o.head = 0.22 * e + nose(t, 0.03); o.neck = 0.1 * e; o.fL = 0.75 * e; o.fR = 0.6 * e; o.fkL = o.fkR = 0.65 * e; o.earL = o.earR = 0.2; return { earLock: 0.4, headLock: 0.9 }; },
  /* at an edge: leans out, looks down, sniffs */
  lookdown(t, o) { stand(o); const e = sstep(0, 0.35, t); o.pitch = -0.1 * e; o.rootZ = 0.028 * e; o.neck = -0.3 * e; o.head = -0.42 * e + nose(t, 0.025); o.fL = 0.35 * e; o.fR = 0.25 * e; o.earL = o.earR = 0.24; return { earLock: 0.5, headLock: 1 }; },
  /* the first squeeze: a short hesitation, head forward into the gap */
  hesitate(t, o) { low(o, 0.016); o.rootZ = 0.02; o.neck = -0.1; o.head = -0.04 + nose(t, 0.03, 8); o.earL = o.earR = -0.5; o.spine = 0.1; return { earLock: 0.6, headLock: 0.8 }; },
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
  flinch(t, o) { low(o, 0.03); o.spine = 0.18; o.neck = -0.14; o.head = -0.12; o.earL = o.earR = -1.25; o.fL = o.fR = 0.3; return { earLock: 1, headLock: 1 }; },
};
const POSE_IN = { shake: 0.08, reach: 0.06, climb: 0.08, popout: 0.08, flinch: 0.05, hesitate: 0.1, startle: 0.05 };

function ProcAnim(rig, opt) {
  const B = rig.bones, R = rig.rest; opt = opt || {};
  const st = {
    t: 0, phase: 0, cphase: 0, pphase: 0, w: { idle: 1, gait: 0, crouch: 0, push: 0, air: 0 }, land: 1, earV: 0, earX: 0, lastVy: 0,
    twitch: { t: -9, side: 1, next: 2.5 }, sniff: { t: -9, next: 4 }, look: { t: -9, next: 6, dir: 0 }, sit: 0, sitTimer: 0, sitHold: 0, idleT: 0,
    deterministic: !!opt.deterministic,
    /* driven layers */
    pw: {}, pt: {}, cur: null, br: 0, hz: 1, amp: 1, ear: { pL: 0.06, pR: 0.06, yL: -0.45, yR: 0.45 }, hy: 0, hp: 0, tail: 0, flee: 0, low: 0,
    footfall: 0,
  };
  const rnd = opt.rnd || prng(opt.seed || 7);
  const r01 = () => st.deterministic ? 0.5 : rnd();
  function layerIdle(s, o) {
    stand(o); o.rootY = 0;
    if (!s.driven) {
      const br = Math.sin(TAU * 1.0 * st.t); o.rootY = 0.0018 * br; o.spine = 0.025 * br; o.head = -0.05 + 0.01 * br;
      /* small life when nobody drives it (the bake tool, a bare test): ear twitch, sniffing, a look, sitting up */
      const tw = st.t - st.twitch.t; if (tw < 0.32) { const k = Math.sin(Math.PI * tw / 0.32); if (st.twitch.side > 0) { o.earL -= 0.42 * k; o.earYL = 0.5 * k; } else { o.earR -= 0.42 * k; o.earYR = -0.5 * k; } }
      const sn = st.t - st.sniff.t; if (sn < 0.9) { const e = Math.sin(Math.PI * sn / 0.9); o.head += 0.05 * e * Math.sin(TAU * 7 * sn); o.neck += 0.05 * e; }
      const lk = st.t - st.look.t; if (lk < 2.2) { const e = sstep(0, 0.35, lk) * (1 - sstep(1.7, 2.2, lk)); o.headYaw = 0.55 * st.look.dir * e; o.headRoll = 0.08 * st.look.dir * e; }
      o.sit = st.sit;
    }
    return o;
  }
  function layerGait(s, o) {
    const p = st.phase, run = clamp((s.speed - 0.9) / 1.5, 0, 1), on = clamp(s.speed / 0.35, 0, 1), fl = st.flee;
    const amp = lerp(0.024, 0.08, run) * on * (1 + 0.15 * fl), c9 = Math.cos(TAU * (p - 0.9));
    o.rootY = amp * Math.pow(Math.max(0, Math.sin(Math.PI * clamp((p - 0.12) / 0.72, 0, 1))), 0.8) - 0.01 * fl * on;
    o.pitch = lerp(0.09, 0.26, run) * Math.sin(TAU * p) * on * (1 + 0.2 * fl);
    o.spine = lerp(0.1, 0.3, run) * c9 * on * (1 + 0.25 * fl);
    const H = (lerp(0.35, 1.0, run) * c9 - 0.1) * on + 0.25 * (1 - on);
    o.hL = H; o.hR = H - 0.06 * run; o.hkL = o.hkR = (0.3 + 0.45 * Math.max(0, c9)) * on; o.hfL = o.hfR = -0.45 * Math.max(0, -c9) * on;
    const F = lerp(0.3, 0.85, run) * Math.cos(TAU * (p - 0.55)) * on + 0.05;
    o.fL = F; o.fR = F - 0.12 * run * on; o.fkL = o.fkR = 0.35 * Math.max(0, Math.sin(TAU * (p - 0.3))) * on;
    o.neck = -0.03 * on - 0.06 * fl; o.head = -0.55 * o.pitch; o.earL = o.earR = -(0.2 + 0.55 * run) * on + 0.05 - 0.5 * fl * on; o.earSL = o.earSR = 0.03;
    o.tail = 0.2 * Math.sin(TAU * p) * on + 0.05;
    return o;
  }
  function layerCrouch(s, o) {
    const mv = clamp(s.speed / 0.4, 0, 1), q = st.cphase;
    low(o, 0.036 + 0.01 * st.low);
    o.rootY += 0.004 * mv * Math.abs(Math.sin(TAU * q));
    o.fL = 0.35 + 0.32 * mv * Math.sin(TAU * q); o.fR = 0.35 + 0.32 * mv * Math.sin(TAU * q + Math.PI);
    o.hL = 0.55 + 0.18 * mv * Math.sin(TAU * q + 1.2); o.hR = 0.55 + 0.18 * mv * Math.sin(TAU * q + 1.2 + Math.PI);
    return o;
  }
  function layerPush(s, o) {
    const q = st.pphase, e = clamp(s.effort, 0, 1);
    o.rootY = -0.014 + 0.0025 * e * Math.sin(TAU * 13 * st.t); o.rootZ = 0.022; o.pitch = -0.2; o.spine = -0.1; o.neck = -0.3; o.head = -0.32;
    o.earL = o.earR = -0.72; o.earSL = o.earSR = 0.1; o.earBL = o.earBR = 0.1;
    o.fL = -0.25 + 0.25 * Math.sin(TAU * q); o.fR = -0.25 + 0.25 * Math.sin(TAU * q + Math.PI); o.fkL = o.fkR = 0.25;
    o.hL = -0.62 + 0.3 * Math.sin(TAU * q + 0.6); o.hR = -0.62 + 0.3 * Math.sin(TAU * q + 0.6 + Math.PI); o.hkL = o.hkR = 0.15; o.hfL = o.hfR = -0.25;
    o.tail = 0.1;
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
  }
  /* s: see the header. Everything except speed/vy/grounded is optional. */
  function update(dt, s) {
    st.t += dt;
    const run = clamp((s.speed - 0.9) / 1.5, 0, 1);
    const prevPhase = st.phase;
    st.phase = (st.phase + dt * s.speed / lerp(0.26, 0.8, run)) % 1;
    st.cphase = (st.cphase + dt * s.speed / 0.16) % 1;
    st.pphase = (st.pphase + dt * Math.max(s.speed, s.effort * 0.25) / 0.14) % 1;
    st.footfall = s.grounded && s.speed > 0.3 && !s.crouch && prevPhase < 0.84 && (st.phase >= 0.84 || st.phase < prevPhase) ? 1 : 0;
    st.flee = damp(st.flee, s.flee ? 1 : 0, 6, dt); st.low = damp(st.low, s.low ? 1 : 0, 8, dt);
    const air = !s.grounded, tgt = { idle: 0, gait: 0, crouch: 0, push: 0, air: 0 };
    if (air) tgt.air = 1; else if (s.push) tgt.push = 1; else if (s.crouch) tgt.crouch = 1; else if (s.speed > 0.05) { tgt.gait = 1; } else tgt.idle = 1;
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
    if (s.landed) st.land = 0; st.land = Math.min(1, st.land + dt / 0.2);
    let o = zero();
    if (st.w.idle > 0.001) addInto(o, layerIdle(s, zero()), st.w.idle);
    if (st.w.gait > 0.001) addInto(o, layerGait(s, zero()), st.w.gait);
    if (st.w.crouch > 0.001) addInto(o, layerCrouch(s, zero()), st.w.crouch);
    if (st.w.push > 0.001) addInto(o, layerPush(s, zero()), st.w.push);
    if (st.w.air > 0.001) addInto(o, layerAir(s, zero()), st.w.air);
    if (!s.driven && st.w.idle < 0.999) o.sit = st.sit * st.w.idle;
    /* expressive / scripted poses, cross-faded over the locomotion (in ~0.18 s, out over poseOut) */
    const cur = s.pose && POSES[s.pose] ? s.pose : null;
    if (cur !== st.cur) { if (cur) st.pt[cur] = s.poseT || 0; st.cur = cur; }
    if (cur && !(cur in st.pw)) st.pw[cur] = 0;
    let pSum = 0, earLock = 0, headLock = 0; const po = zero(); let any = false;
    for (const n in st.pw) {
      const on = n === cur, k = on ? 1 / (POSE_IN[n] || 0.18) : 1 / Math.max(0.05, s.poseOut || 0.2);
      st.pw[n] += ((on ? 1 : 0) - st.pw[n]) * (1 - Math.exp(-k * 3 * dt));
      if (on && s.poseT != null) st.pt[n] = s.poseT; else st.pt[n] = (st.pt[n] || 0) + dt;
      if (!on && st.pw[n] < 0.002) { delete st.pw[n]; delete st.pt[n]; continue; }
      const w = st.pw[n]; if (w < 0.001) continue;
      const p = zero(), lk = POSES[n](st.pt[n], p, on ? s.poseData : null, s) || {};
      addInto(po, p, w); pSum += w; earLock += (lk.earLock || 0) * w; headLock += (lk.headLock || 0) * w; any = true;
    }
    if (any) { const k = Math.min(1, pSum); const keep = 1 - k; const f = k / pSum; for (const c of CH) o[c] = o[c] * keep + po[c] * f; earLock = Math.min(1, earLock / Math.max(pSum, 1)); headLock = Math.min(1, headLock / Math.max(pSum, 1)); }
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
  return { update, st, apply, CH, POSES };
}
FF.ProcAnim = ProcAnim;

/* ------------------------------------------------------------------ a supplied model, driven by named clips */
const CLIP_FALLBACK = {
  idle_breathe: [], walk: ['hop_run', 'idle_breathe'], hop_run: ['walk'], jump_start: ['jump_air', 'hop_run'], jump_air: ['hop_run', 'walk'],
  jump_land: ['idle_breathe'], crouch_idle: ['idle_breathe'], crouch_walk: ['crouch_idle', 'walk'], push_head: ['crouch_walk', 'walk'],
  idle_ear_twitch: [], listen: ['idle_breathe'], sniff: ['idle_breathe'], hide: ['crouch_idle'], alert_freeze: ['idle_breathe'], flee: ['hop_run'],
  groom: ['sniff', 'idle_breathe'], sniff_ground: ['sniff', 'idle_breathe'], nibble: ['sniff_ground', 'sniff'], shake_off: ['idle_breathe'],
  look_back: ['idle_breathe'], peek: ['hide', 'crouch_idle'], reach_fail: ['jump_air'], climb_in: ['jump_air', 'crouch_walk'],
  pop_out_hop_down: ['crouch_walk', 'jump_air'], drop_splash: ['jump_land'], settle_loaf_in: ['relax_lie', 'crouch_idle'],
  loaf_breathe: ['relax_lie', 'crouch_idle'], relax_lie: ['crouch_idle'], look_up: ['listen'], hesitate_look_down: ['sniff', 'crouch_idle'], startle: [],
};
const POSE_CLIP = { groom: 'groom', sniff: 'sniff_ground', nibble: 'nibble', sit: 'listen', lookup: 'look_up', look: 'idle_breathe', lookback: 'look_back',
  shake: 'shake_off', loaf: 'loaf_breathe', hide: 'hide', freeze: 'alert_freeze', peek: 'peek', rear: 'sniff', lookdown: 'hesitate_look_down',
  hesitate: 'hesitate_look_down', reach: 'reach_fail', climb: 'climb_in', popout: 'pop_out_hop_down', flinch: 'crouch_idle' };
const POSE_ONCE = { shake: 1, reach: 1, climb: 1, popout: 1, lookback: 1, sniff: 1, lookup: 1, lookdown: 1, hesitate: 1, freeze: 1 };
function ClipAnim(root, clips) {
  const mixer = new T.AnimationMixer(root), by = {}; for (const c of clips) by[c.name] = c;
  const pick = n => { if (by[n]) return n; for (const f of CLIP_FALLBACK[n] || []) { if (by[f]) return f; for (const g of CLIP_FALLBACK[f] || []) if (by[g]) return g; } return clips[0] ? clips[0].name : null; };
  const acts = {}; const act = n => { n = pick(n); if (!n) return null; if (!acts[n]) acts[n] = mixer.clipAction(by[n]); return acts[n]; };
  let cur = null, curName = '', landT = 9, idleT = 0, nextTwitch = 3, oneShot = 0, loafIn = 0;
  const rnd = prng(11);
  /* bones carrying the ASSETS-3D names get the live ear / head layers on top of the clip */
  const bone = {}; root.traverse(o => { if (o.isBone) bone[o.name] = o; });
  const ear = { pL: 0, pR: 0, yL: 0, yR: 0 }; let hy = 0;
  function play(n, fade, once) {
    const a = act(n); if (!a || a === cur) return a;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity); a.clampWhenFinished = !!once;
    if (cur) a.crossFadeFrom(cur, fade, false); a.play(); cur = a; curName = n; return a;
  }
  function update(dt, s) {
    landT += dt; if (s.landed) landT = 0;
    let want, scale = 1, once = false;
    if (s.pose && POSE_CLIP[s.pose]) {
      want = POSE_CLIP[s.pose]; once = !!POSE_ONCE[s.pose];
      if (s.pose === 'loaf') { loafIn += dt; if (loafIn < 1.0 && by.settle_loaf_in) { want = 'settle_loaf_in'; once = true; } } else loafIn = 0;
    }
    else if (!s.grounded) { want = s.vy > 0 && (s.airT || 0) < 0.1 && by.jump_start ? 'jump_start' : 'jump_air'; once = want === 'jump_start'; }
    else if (landT < 0.18 && by.jump_land) { want = 'jump_land'; once = true; }
    else if (s.push) { want = 'push_head'; scale = Math.max(0.4, s.speed / 0.62, s.effort * 0.5); }
    else if (s.crouch) { want = s.speed > 0.05 ? 'crouch_walk' : (s.low ? 'hide' : 'crouch_idle'); scale = s.speed > 0.05 ? s.speed / 0.75 : 1; }
    else if (s.flee && s.speed > 1.6) { want = 'flee'; scale = s.speed / 3.6; }
    else if (s.speed > 1.6) { want = 'hop_run'; scale = s.speed / 2.75; }
    else if (s.speed > 0.05) { want = 'walk'; scale = Math.max(0.35, s.speed / 1.0); }  /* clips are authored at the speeds in ASSETS-3D.md */
    else { idleT += dt; want = 'idle_breathe'; if (idleT > nextTwitch && by.idle_ear_twitch) { oneShot = 0.8; idleT = 0; nextTwitch = 2 + rnd() * 4; } if (oneShot > 0) { oneShot -= dt; want = 'idle_ear_twitch'; } }
    if (want !== 'idle_breathe' && want !== 'idle_ear_twitch') idleT = 0;
    const a = play(want, want.startsWith('jump') ? 0.06 : 0.16, once); if (a) a.timeScale = scale;
    mixer.update(dt);
    /* live layers on the model's own bones (additive to the clip): ears turn to sounds, the head follows */
    if (s.ears && bone.ear_L_01 && bone.ear_R_01) {
      const E = s.ears, k = 1 / 0.12, w = (E.w == null ? 1 : E.w) * (s.pose ? 0.3 : 0.7);
      ear.pL = damp(ear.pL, E.pL, k, dt); ear.pR = damp(ear.pR, E.pR, k, dt); ear.yL = damp(ear.yL, E.yL, k, dt); ear.yR = damp(ear.yR, E.yR, k, dt);
      bone.ear_L_01.rotation.x += 0.5 * ear.pL * w; bone.ear_R_01.rotation.x += 0.5 * ear.pR * w;
      bone.ear_L_01.rotation.y += 0.6 * ear.yL * w; bone.ear_R_01.rotation.y += 0.6 * ear.yR * w;
    }
    if (s.head && bone.head) { hy = damp(hy, s.head.yaw || 0, 1 / 0.3, dt); bone.head.rotation.y += hy * 0.6 * (s.pose ? 0.2 : 1); }
  }
  return { update, mixer, clips: Object.keys(by), get current() { return curName; } };
}

/* ------------------------------------------------------------------ loading */
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
    o.material = rabbitMaterial(L, { vertexColors: !!(o.geometry.attributes.color), map: src.map || null, skinning: !!o.isSkinnedMesh });
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
  /* returns a rig: the object to place, update(dt, anim), kind ('procedural' | 'model'), info */
  async create(L, opts) {
    opts = opts || {};
    const q = new URLSearchParams(location.search).get('rabbit');
    const holder = new T.Group(); holder.name = 'rabbit';
    /* the game passes opts.file from models/models.json (FF.MODELS.rabbit); null = no request at all (clean console).
       ?rabbit=<file under models/> overrides, ?rabbit=procedural forces the temporary rabbit. */
    const want = q ? q : (opts.file || null);
    if (want && want !== 'procedural') {
      const file = want.replace(/[^\w./-]/g, '').replace(/\.\.+/g, '');
      try {
        const m = await loadModel('models/' + file, L);
        if (m) {
          holder.add(m.scene);
          const anim = ClipAnim(m.scene, m.clips);
          console.log('[farfield] rabbit model models/' + file + ': clips ' + anim.clips.join(', '));
          return { object: holder, kind: 'model', file, info: { clips: anim.clips, skinned: !!m.skinned, meshes: m.meshes, size: m.size, rescaled: m.rescaled }, update: (dt, s) => anim.update(dt, s), anim };
        }
      } catch (e) { console.warn('[farfield] rabbit model failed, using the temporary rabbit:', e.message); }
    }
    const rig = buildProcedural(L); holder.add(rig.mesh);
    const anim = ProcAnim(rig, opts);
    return { object: holder, kind: 'procedural', rig, anim, info: { bones: FF.RABBIT_BONES.length }, update: (dt, s) => anim.update(dt, s), get footfall() { return anim.st.footfall; } };
  },
  buildProcedural, ProcAnim, rabbitMaterial, POSES,
  /* live uniforms shared by every rabbit material: lift (self-light), rimK (rim multiplier) */
  uniforms: RU,
};
})();
