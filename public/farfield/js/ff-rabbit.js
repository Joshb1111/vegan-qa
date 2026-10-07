/* FAR FIELD — ff-rabbit.js: the rabbit slot.
   1. TEMPORARY procedural rabbit: a real skinned mesh (one draw call) built from smooth ellipsoids, rigidly weighted to
      the same skeleton the commissioned model must have (bone names in docs/farfield/ASSETS-3D.md), animated in code.
   2. Model slot: if public/farfield/models/ff_rabbit.glb exists (or ?rabbit=<file under models/>), it is loaded with
      GLTFLoader (three r128, loaded only then) and driven by its named clips through an AnimationMixer.
      Missing clips fall back to near neighbours; no model at all falls back to the procedural rabbit.
   Conventions (both paths): metres, Y up, the model faces +Z, origin on the ground between the feet.
   The game turns the rabbit to face +X or -X (side-on).
   FF.Rabbit.create(look) -> Promise<rig>; rig = { object, update(dt, s), kind, setShadow(on), material } */
'use strict';
(function () {
const T = THREE;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

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
    ['tail', 'hips', [0, 0.1, -0.162]],
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
function buildProcedural(L) {
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
    const g = new T.SphereGeometry(1, opt.seg || 16, opt.segH || 12);
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

function rabbitMaterial(L, extra) {
  const R = L.materials.rabbit;
  return FF.mat({ color: extra && extra.map ? '#ffffff' : (extra && extra.vertexColors ? '#ffffff' : R.color), roughness: R.roughness, rim: true, noAO: true, lift: L.rabbit.lift },
    Object.assign({ skinning: true }, extra || {}));
}

/* ------------------------------------------------------------------ procedural animation: channels -> bones */
const CH = ['rootY', 'rootZ', 'pitch', 'spine', 'neck', 'head', 'headYaw', 'headRoll', 'earL', 'earR', 'earSL', 'earSR', 'earYL', 'earYR', 'earBL', 'earBR',
  'fL', 'fR', 'fkL', 'fkR', 'hL', 'hR', 'hkL', 'hkR', 'hfL', 'hfR', 'tail', 'sit'];
const zero = () => { const o = {}; for (const c of CH) o[c] = 0; return o; };
function addInto(dst, src, w) { for (const c of CH) dst[c] += (src[c] || 0) * w; }

function ProcAnim(rig, opt) {
  const B = rig.bones, R = rig.rest; opt = opt || {};
  const st = {
    t: 0, phase: 0, cphase: 0, pphase: 0, w: { idle: 1, gait: 0, crouch: 0, push: 0, air: 0 }, land: 1, earV: 0, earX: 0, lastVy: 0,
    twitch: { t: -9, side: 1, next: 2.5 }, sniff: { t: -9, next: 4 }, look: { t: -9, next: 6, dir: 0 }, sit: 0, sitTimer: 0, sitHold: 0, idleT: 0,
    deterministic: !!opt.deterministic,
  };
  const rnd = () => st.deterministic ? 0.5 : Math.random();
  function layerIdle(s, o) {
    const br = Math.sin(TAU * 1.0 * st.t);
    o.rootY = 0.0018 * br; o.spine = 0.025 * br; o.pitch = 0.0; o.neck = 0.02; o.head = -0.05 + 0.01 * br;
    o.earL = o.earR = 0.06; o.earSL = o.earSR = 0.02; o.fL = o.fR = 0.0; o.hL = o.hR = 0.25; o.hkL = o.hkR = 0.0; o.tail = 0.05;
    /* small life: ear twitch, sniffing, a look towards the lens, sitting up to listen */
    const tw = st.t - st.twitch.t; if (tw < 0.32) { const k = Math.sin(Math.PI * tw / 0.32); if (st.twitch.side > 0) { o.earL -= 0.42 * k; o.earYL = 0.5 * k; } else { o.earR -= 0.42 * k; o.earYR = -0.5 * k; } }
    const sn = st.t - st.sniff.t; if (sn < 0.9) { const e = Math.sin(Math.PI * sn / 0.9); o.head += 0.05 * e * Math.sin(TAU * 7 * sn); o.neck += 0.05 * e; }
    const lk = st.t - st.look.t; if (lk < 2.2) { const e = sstep(0, 0.35, lk) * (1 - sstep(1.7, 2.2, lk)); o.headYaw = 0.55 * st.look.dir * e; o.headRoll = 0.08 * st.look.dir * e; }
    o.sit = st.sit;
    return o;
  }
  function layerGait(s, o) {
    const p = st.phase, run = clamp((s.speed - 0.9) / 1.5, 0, 1), on = clamp(s.speed / 0.35, 0, 1);
    const amp = lerp(0.024, 0.08, run) * on, c9 = Math.cos(TAU * (p - 0.9));
    o.rootY = amp * Math.pow(Math.max(0, Math.sin(Math.PI * clamp((p - 0.12) / 0.72, 0, 1))), 0.8);
    o.pitch = lerp(0.09, 0.26, run) * Math.sin(TAU * p) * on;
    o.spine = lerp(0.1, 0.3, run) * c9 * on;
    const H = (lerp(0.35, 1.0, run) * c9 - 0.1) * on + 0.25 * (1 - on);
    o.hL = H; o.hR = H - 0.06 * run; o.hkL = o.hkR = (0.3 + 0.45 * Math.max(0, c9)) * on; o.hfL = o.hfR = -0.45 * Math.max(0, -c9) * on;
    const F = lerp(0.3, 0.85, run) * Math.cos(TAU * (p - 0.55)) * on + 0.05;
    o.fL = F; o.fR = F - 0.12 * run * on; o.fkL = o.fkR = 0.35 * Math.max(0, Math.sin(TAU * (p - 0.3))) * on;
    o.neck = -0.03 * on; o.head = -0.55 * o.pitch; o.earL = o.earR = -(0.2 + 0.55 * run) * on + 0.05; o.earSL = o.earSR = 0.03;
    o.tail = 0.2 * Math.sin(TAU * p) * on + 0.05;
    return o;
  }
  function layerCrouch(s, o) {
    const mv = clamp(s.speed / 0.4, 0, 1), q = st.cphase;
    o.rootY = -0.036 + 0.004 * mv * Math.abs(Math.sin(TAU * q)); o.pitch = -0.04; o.spine = 0.2; o.neck = -0.12; o.head = 0.02;
    o.earL = o.earR = -1.18; o.earSL = o.earSR = 0.06; o.earBL = o.earBR = 0.15;
    o.fL = 0.35 + 0.32 * mv * Math.sin(TAU * q); o.fR = 0.35 + 0.32 * mv * Math.sin(TAU * q + Math.PI); o.fkL = o.fkR = 0.55;
    o.hL = 0.55 + 0.18 * mv * Math.sin(TAU * q + 1.2); o.hR = 0.55 + 0.18 * mv * Math.sin(TAU * q + 1.2 + Math.PI); o.hkL = o.hkR = 0.8; o.tail = -0.05;
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
    B.hips.rotation.set(-hipsPitch, 0, 0);
    B.spine.rotation.set(S * 0.5 - sit * 0.1, 0, 0); B.chest.rotation.set(S * 0.5 - sit * 0.1, 0, 0);
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
  /* s: { speed, vy, grounded, crouch, push, effort, landed (true on the frame it lands) } */
  function update(dt, s) {
    st.t += dt;
    const run = clamp((s.speed - 0.9) / 1.5, 0, 1);
    st.phase = (st.phase + dt * s.speed / lerp(0.26, 0.8, run)) % 1;
    st.cphase = (st.cphase + dt * s.speed / 0.16) % 1;
    st.pphase = (st.pphase + dt * Math.max(s.speed, s.effort * 0.25) / 0.14) % 1;
    const air = !s.grounded, tgt = { idle: 0, gait: 0, crouch: 0, push: 0, air: 0 };
    if (air) tgt.air = 1; else if (s.push) tgt.push = 1; else if (s.crouch) tgt.crouch = 1; else if (s.speed > 0.05) { tgt.gait = 1; } else tgt.idle = 1;
    const rate = air ? 18 : 9;
    let sum = 0; for (const k in st.w) { st.w[k] += (tgt[k] - st.w[k]) * (1 - Math.exp(-rate * dt)); sum += st.w[k]; }
    for (const k in st.w) st.w[k] /= sum || 1;
    /* idle life */
    if (tgt.idle && !st.deterministic) {
      st.idleT += dt;
      if (st.t > st.twitch.next) { st.twitch.t = st.t; st.twitch.side = rnd() < 0.5 ? 1 : -1; st.twitch.next = st.t + 1.8 + rnd() * 3.5; }
      if (st.t > st.sniff.next) { st.sniff.t = st.t; st.sniff.next = st.t + 3 + rnd() * 5; }
      if (st.t > st.look.next && st.sit < 0.1) { st.look.t = st.t; st.look.dir = rnd() < 0.5 ? 1 : -1; st.look.next = st.t + 5 + rnd() * 6; }
      if (st.idleT > 3.2 && st.sitHold <= 0 && st.sitTimer <= 0 && rnd() < dt * 0.35) { st.sitHold = 2.2 + rnd() * 2.5; }
    } else if (!tgt.idle) { st.idleT = 0; st.sitHold = 0; }
    if (opt.forceSit != null) st.sit = opt.forceSit;
    else { if (st.sitHold > 0) { st.sitHold -= dt; if (st.sitHold <= 0) st.sitTimer = 3; } else if (st.sitTimer > 0) st.sitTimer -= dt;
      st.sit += ((st.sitHold > 0 ? 1 : 0) - st.sit) * (1 - Math.exp(-(st.sitHold > 0 ? 5 : 9) * dt)); }
    /* ears trail vertical motion: a damped spring driven by vertical acceleration */
    const ay = (s.vy - st.lastVy) / Math.max(dt, 1e-4); st.lastVy = s.vy;
    st.earV += (-90 * st.earX - 9 * st.earV - clamp(ay, -60, 60) * 0.05) * dt; st.earX = clamp(st.earX + st.earV * dt, -0.6, 0.6);
    if (s.landed) st.land = 0; st.land = Math.min(1, st.land + dt / 0.2);
    const o = zero();
    if (st.w.idle > 0.001) addInto(o, layerIdle(s, zero()), st.w.idle);
    if (st.w.gait > 0.001) addInto(o, layerGait(s, zero()), st.w.gait);
    if (st.w.crouch > 0.001) addInto(o, layerCrouch(s, zero()), st.w.crouch);
    if (st.w.push > 0.001) addInto(o, layerPush(s, zero()), st.w.push);
    if (st.w.air > 0.001) addInto(o, layerAir(s, zero()), st.w.air);
    if (st.w.idle < 0.999) o.sit = st.sit * st.w.idle;
    const lb = st.land < 1 ? Math.sin(Math.PI * st.land) : 0;
    o.rootY -= 0.022 * lb; o.spine += 0.16 * lb; o.head -= 0.08 * lb; o.earL -= 0.12 * lb; o.earR -= 0.12 * lb;
    apply(o);
  }
  return { update, st, apply, CH };
}
FF.ProcAnim = ProcAnim;

/* ------------------------------------------------------------------ a supplied model, driven by named clips */
const CLIP_FALLBACK = {
  idle_breathe: [], walk: ['hop_run', 'idle_breathe'], hop_run: ['walk'], jump_start: ['jump_air', 'hop_run'], jump_air: ['hop_run', 'walk'],
  jump_land: ['idle_breathe'], crouch_idle: ['idle_breathe'], crouch_walk: ['crouch_idle', 'walk'], push_head: ['crouch_walk', 'walk'],
  idle_ear_twitch: [], listen: ['idle_breathe'],
};
function ClipAnim(root, clips) {
  const mixer = new T.AnimationMixer(root), by = {}; for (const c of clips) by[c.name] = c;
  const pick = n => { if (by[n]) return n; for (const f of CLIP_FALLBACK[n] || []) if (by[f]) return f; return clips[0] ? clips[0].name : null; };
  const acts = {}; const act = n => { n = pick(n); if (!n) return null; if (!acts[n]) acts[n] = mixer.clipAction(by[n]); return acts[n]; };
  let cur = null, curName = '', landT = 9, idleT = 0, nextTwitch = 3, oneShot = null;
  function play(n, fade, once) {
    const a = act(n); if (!a || a === cur) return a;
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity); a.clampWhenFinished = !!once;
    if (cur) a.crossFadeFrom(cur, fade, false); a.play(); cur = a; curName = n; return a;
  }
  function update(dt, s) {
    landT += dt; if (s.landed) landT = 0;
    let want, scale = 1, once = false;
    if (!s.grounded) { want = s.vy > 0 && (s.airT || 0) < 0.1 && by.jump_start ? 'jump_start' : 'jump_air'; once = want === 'jump_start'; }
    else if (landT < 0.18 && by.jump_land) { want = 'jump_land'; once = true; }
    else if (s.push) { want = 'push_head'; scale = 0.4 + Math.max(s.speed / 0.6, s.effort * 0.5); }
    else if (s.crouch) { want = s.speed > 0.05 ? 'crouch_walk' : 'crouch_idle'; scale = s.speed > 0.05 ? s.speed / 0.75 : 1; }
    else if (s.speed > 1.6) { want = 'hop_run'; scale = s.speed / 2.75; }
    else if (s.speed > 0.05) { want = 'walk'; scale = Math.max(0.35, s.speed / 1.15); }
    else { idleT += dt; want = 'idle_breathe'; if (idleT > nextTwitch && by.idle_ear_twitch) { oneShot = 0.8; idleT = 0; nextTwitch = 2 + Math.random() * 4; } if (oneShot > 0) { oneShot -= dt; want = 'idle_ear_twitch'; } }
    if (want !== 'idle_breathe' && want !== 'idle_ear_twitch') idleT = 0;
    const a = play(want, want.startsWith('jump') ? 0.06 : 0.16, once); if (a) a.timeScale = scale;
    mixer.update(dt);
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
  /* returns a rig: the object to place, update(dt, state), kind ('procedural' | 'model'), info */
  async create(L, opts) {
    opts = opts || {};
    const q = new URLSearchParams(location.search).get('rabbit');
    const holder = new T.Group(); holder.name = 'rabbit';
    if (q !== 'procedural') {
      const file = q ? q.replace(/[^\w./-]/g, '').replace(/\.\.+/g, '') : 'ff_rabbit.glb';
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
    return { object: holder, kind: 'procedural', rig, anim, info: { bones: FF.RABBIT_BONES.length }, update: (dt, s) => anim.update(dt, s) };
  },
  buildProcedural, ProcAnim, rabbitMaterial,
};
})();
