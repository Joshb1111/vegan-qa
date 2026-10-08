/* FAR FIELD — ff-humans.js: FF.Humans, the temporary stand-in people and the van.
   ONE human model for all three people (A4). Props by role: the Verge person and the searcher carry a torch and a long gun
   slung on the back (the searcher raises it to aim); the walkway worker carries a coil of cable and NOTHING else (no gun, no
   torch, no backpack, so the silhouette differs too). The stand-in is one rigidly weighted SkinnedMesh on a Mixamo-shaped
   skeleton (one draw per figure; props are leaf bones scaled to 0 when a role hides them), animated procedurally
   (idle, walk, walk-search, run, turn, notice, kneel, crouch-look, climb, descend, step-down, door-step-in, aim, lunge,
   reach, unlock, torch-down, rail-look-out, shake-sheet, stand). The torch light (a World spot handle) sits on the lens the
   2D detection model uses (FF.RULES.sight.torch) and its axis meets the lane (z 0) at the 2D aim point (A16).
   The van: a boxy unbranded utility van facing +Z (origin on the ground at its centre, as the model slot): wheels that
   spin with distance, braking dip, idle vibration, a hinged driver door, headlight discs, a roof work light and amber
   side markers (glow), with anchors for the headlight and work-light spots.
   GROUNDING (characters fixer, 7 Oct; visuals only, no AI timing touched): the legs are placed by inverse kinematics on the
   gait the owner already counts (st.gait, in steps, in step with the footstep sounds). A foot on the ground stays where it
   landed (its stance is matched to the step length measured from the figure's own travel), rolls heel to toe at the ends of
   the stance, and the hips ride on the supporting leg, so no foot slides and the body never floats. Arms swing against the
   legs. Standing, the weight shifts from leg to leg every few seconds. The silhouette is heavier: broader coat and boots,
   shoulders rounded forward, head carried a little low.
   Model slots: models/models.json "human" / "van" (ASSETS-3D.md). No file = these stand-ins. A file is loaded lazily
   (GLTFLoader r128) and driven by its named clips; props by node name (prop_torch, prop_longgun, prop_coil, prop_pack).
   THE REAL PEOPLE (8 Oct; the DEFAULT since the polish pass, ?people=standin for the stand-ins): they draw the three rigged guard models instead of the stand-in: ff_guard1.glb (the Verge
   person), ff_guard2.glb (the searcher), ff_guard3.glb (the walkway worker and the Works painter). Visual only: see the section
   "the real people" below. Default (no switch): the models.
   OWNER: the humans + events builder. API contract: docs/farfield/INTERFACES.md §8.5. */
'use strict';
window.FF = window.FF || {};
(function () {
const T = THREE, U = FF.util, D2R = Math.PI / 180;
let ctx = null, mat = null, propMat = null, lensMat = null, depthMat = null, vanMat = null, tyreMat = null, vanGlowHead = null, vanGlowWork = null, vanGlowMarker = null;
const figures = [], vans = [];

/* ================================================================== the stand-in skeleton (rest pose, facing +Z, feet at 0)
   Mixamo-shaped names so a commissioned model maps 1:1 (ASSETS-3D.md). Leaf "prop" bones hide by scale 0. */
const BONES = [
  ['root', -1, [0, 0, 0]],
  ['hips', 0, [0, 0.94, 0]],
  ['spine', 1, [0, 0.12, 0]],
  ['chest', 2, [0, 0.24, 0]],
  ['neck', 3, [0, 0.21, 0.0]],
  ['head', 4, [0, 0.08, 0.01]],
  ['upperArmL', 3, [0.205, 0.13, 0]], ['foreArmL', 6, [0, -0.29, 0]], ['handL', 7, [0, -0.26, 0]],
  ['upperArmR', 3, [-0.205, 0.13, 0]], ['foreArmR', 9, [0, -0.29, 0]], ['handR', 10, [0, -0.26, 0]],
  ['thighL', 1, [0.095, -0.02, 0]], ['shinL', 12, [0, -0.44, 0]], ['footL', 13, [0, -0.43, 0]],
  ['thighR', 1, [-0.095, -0.02, 0]], ['shinR', 15, [0, -0.44, 0]], ['footR', 16, [0, -0.43, 0]],
  ['pack', 3, [0, 0, -0.14]],                 // backpack + rolled mat (the hump); hidden for the worker
  ['gunSling', 3, [0.0, -0.02, -0.30]],       // long gun across the back, muzzle up
  ['gunAim', 3, [-0.13, 0.12, 0.10]],         // the same gun at the right shoulder, pointing forward (+Z); pitch = rotation.x
  ['torch', 8, [0, -0.07, 0.02]],             // in the left hand, pointing forward (+Z)
  ['coil', 3, [0.0, 0.06, 0.0]],              // a coil of cable over the shoulder (the worker)
];
const BI = {}; BONES.forEach((b, i) => { BI[b[0]] = i; });
const ROLE_PROPS = {
  verge: { pack: 1, gunSling: 1, gunAim: 1, torch: 1, coil: 0 },
  searcher: { pack: 1, gunSling: 1, gunAim: 1, torch: 1, coil: 0 },
  worker: { pack: 0, gunSling: 0, gunAim: 0, torch: 0, coil: 1 },   // A4: unarmed, no torch
};

/* world-space rest positions of the joints (for building the parts) */
function restJoints() {
  const P = [];
  BONES.forEach(([, p, o], i) => { P[i] = p < 0 ? o.slice() : [P[p][0] + o[0], P[p][1] + o[1], P[p][2] + o[2]]; });
  return P;
}
/* a capsule-ish limb from a to b (world rest), radii r0 at a, r1 at b */
function limb(a, b, r0, r1, seg) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  const parts = [new T.CylinderGeometry(r1, r0, len, seg || 8, 1, true)];
  parts[0].translate(0, len / 2, 0);
  const s0 = new T.SphereGeometry(r0, seg || 8, 5); parts.push(s0);
  const s1 = new T.SphereGeometry(r1, seg || 8, 5); s1.translate(0, len, 0); parts.push(s1);
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(dx, dy, dz).normalize());
  const m = new T.Matrix4().makeRotationFromQuaternion(q).setPosition(a[0], a[1], a[2]);
  for (const g of parts) g.applyMatrix4(m);
  return parts;
}
function boxAt(x0, x1, y0, y1, z0, z1) { return FF.geo.box(x0, x1, y0, y1, z0, z1); }
/* merge parts that each belong to one bone into one skinned geometry */
function mergeSkinned(list) {
  let n = 0; const flat = [];
  for (const [g, bone] of list) { const ng = g.index ? g.toNonIndexed() : g; if (!ng.attributes.normal) ng.computeVertexNormals(); flat.push([ng, bone]); n += ng.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); let o = 0;
  for (const [g, bone] of flat) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) { si[(o + i) * 4] = bone; sw[(o + i) * 4] = 1; }
    o += g.attributes.position.count;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4)); out.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
  out.computeBoundingSphere(); out.computeBoundingBox(); return out;
}
function standInGeometry() {
  const J = restJoints(), L = [], add = (g, b) => { if (Array.isArray(g)) for (const k of g) L.push([k, BI[b]]); else L.push([g, BI[b]]); };
  const j = n => J[BI[n]];
  /* legs (trousers) and boots */
  for (const s of ['L', 'R']) {
    add(limb(j('thigh' + s), j('shin' + s), 0.094, 0.07, 9), 'thigh' + s);
    add(limb(j('shin' + s), j('foot' + s), 0.068, 0.056, 8), 'shin' + s);
    const f = j('foot' + s); add(boxAt(f[0] - 0.06, f[0] + 0.06, 0.0, 0.11, f[2] - 0.085, f[2] + 0.215), 'foot' + s);   // heavy work boots
  }
  /* pelvis and the coat: tapered, flared at the hem, slightly deeper at the chest */
  { const g = new T.SphereGeometry(0.17, 14, 10); g.scale(1.05, 0.7, 0.78); g.translate(0, 0.95, 0); add(g, 'hips'); }
  { const g = new T.CylinderGeometry(0.185, 0.225, 0.32, 14, 1, true); g.scale(1, 1, 0.68); g.translate(0, 0.85, 0); add(g, 'hips'); }   // coat skirt (to 0.71)
  { const g = new T.CylinderGeometry(0.2, 0.185, 0.30, 14); g.scale(1, 1, 0.72); g.translate(0, 1.15, 0); add(g, 'spine'); }
  { const g = new T.CylinderGeometry(0.228, 0.2, 0.24, 14); g.scale(1, 1, 0.7); g.translate(0, 1.40, 0.0); add(g, 'chest'); }
  { const g = new T.SphereGeometry(0.228, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.46, 0.7); g.translate(0, 1.52, 0); add(g, 'chest'); }   // shoulders
  /* neck, head, cap with a forward brim (the facing cue) */
  { const g = new T.CylinderGeometry(0.052, 0.06, 0.12, 10); g.translate(0, 1.56, 0.0); add(g, 'neck'); }
  { const g = new T.SphereGeometry(0.105, 16, 12); g.scale(0.94, 1.08, 1.0); g.translate(0, 1.66, 0.01); add(g, 'head'); }
  { const g = new T.CylinderGeometry(0.104, 0.114, 0.075, 16); g.translate(0, 1.745, 0.0); add(g, 'head'); }
  { const g = boxAt(-0.095, 0.095, 1.712, 1.727, 0.06, 0.205); add(g, 'head'); }
  /* arms (coat sleeves) and mitten hands */
  for (const s of ['L', 'R']) {
    add(limb(j('upperArm' + s), j('foreArm' + s), 0.068, 0.056, 8), 'upperArm' + s);
    add(limb(j('foreArm' + s), j('hand' + s), 0.054, 0.046, 8), 'foreArm' + s);
    const h = j('hand' + s); const g = new T.SphereGeometry(0.048, 10, 8); g.scale(0.8, 1.25, 1.0); g.translate(h[0], h[1] - 0.05, h[2] + 0.005); add(g, 'hand' + s);
  }
  /* backpack 0.32 x 0.42 x 0.21 with a rolled mat on top: the hump that makes the silhouette */
  { const c = j('pack'); add(boxAt(c[0] - 0.16, c[0] + 0.16, c[1] - 0.30, c[1] + 0.12, c[2] - 0.21, c[2]), 'pack');
    const m = new T.CylinderGeometry(0.072, 0.072, 0.38, 12); m.rotateZ(Math.PI / 2); m.translate(c[0], c[1] + 0.19, c[2] - 0.10); add(m, 'pack'); }
  /* the long gun: a plain dark rod with a stock block (generic, no real-world model). Slung: diagonal across the back */
  const gunGeo = () => { const r = boxAt(-0.021, 0.021, -0.42, 0.58, -0.021, 0.021), s = boxAt(-0.032, 0.032, -0.64, -0.36, -0.06, 0.032); return FF.geo.merge([r, s]); };   // a plain long silhouette line
  { const g = gunGeo(); g.rotateZ(-0.62); const c = j('gunSling'); g.translate(c[0], c[1], c[2] - 0.05); add(g, 'gunSling'); }
  { const g = gunGeo(); g.rotateX(Math.PI / 2); const c = j('gunAim'); g.translate(c[0], c[1], c[2] + 0.04); add(g, 'gunAim'); }   // muzzle along +Z, stock at the shoulder
  /* the torch in the left hand (lens is a glow child of the bone) */
  { const g = new T.CylinderGeometry(0.03, 0.024, 0.2, 10); g.rotateX(Math.PI / 2); const c = j('torch'); g.translate(c[0], c[1], c[2] + 0.06); add(g, 'torch'); }
  /* a coil of cable over the right shoulder (the worker) */
  { const g = new T.TorusGeometry(0.15, 0.03, 6, 16); g.rotateY(Math.PI / 2); g.rotateX(0.5); const c = j('coil'); g.translate(c[0] - 0.19, c[1] - 0.12, c[2] - 0.04); add(g, 'coil'); }
  return mergeSkinned(L);
}
let sharedGeo = null;

/* ================================================================== procedural animation
   Conventions (model facing +Z): bone.rotation.x < 0 swings a hanging limb forward; > 0 on the spine leans forward. */
const ANIM = {
  idle: {}, stand: {}, walk: { walk: 1 }, 'walk-search': { walk: 1, search: 1 }, run: { walk: 1, run: 1 }, turn: { walk: 0.6 },
  notice: { notice: 1 }, kneel: { kneel: 1 }, 'crouch-look': { kneel: 1, low: 1 }, climb: { walk: 1, climb: 1 }, descend: { walk: 1, climb: 1 },
  'step-down': { kneel: 0.4 }, 'door-step-in': { walk: 1 }, aim: { aim: 1 }, lunge: { lean: 1 }, reach: { kneel: 1, reach: 1, low: 1 },
  unlock: { unlock: 1 }, 'torch-down': { kneel: 1, down: 1 }, 'rail-look-out': { rail: 1 }, 'shake-sheet': { kneel: 1, shake: 1 },
};
const LAYERS = ['walk', 'search', 'run', 'notice', 'kneel', 'low', 'climb', 'aim', 'lean', 'reach', 'unlock', 'down', 'rail', 'shake'];
const RATE = { walk: 5, search: 4, run: 4, notice: 8, kneel: 1.6 / 0.8, low: 2.5, climb: 5, aim: 2.2, lean: 1 / 0.45, reach: 1 / 0.6, unlock: 4, down: 3, rail: 2, shake: 5 };

/* the legs (sagittal plane, [y, z] in the figure's own space): ang(v) 0 = straight down, + = swung back (rotation.x) */
const LEG1 = 0.44, LEG2 = 0.43, ANK = 0.05, HIPJ = 0.02, TOE = 0.2, HEEL = 0.08;
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]], len2 = v => Math.hypot(v[0], v[1]), ang = v => Math.atan2(-v[1], -v[0]);
const rot2 = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
const smoother = u => u * u * u * (u * (u * 6 - 15) + 10);
/* thigh and shin from the hip joint J to the ankle A, the knee forward */
function legSolve(J, A) {
  const v = sub2(A, J), d = U.clamp(len2(v), 0.05, (LEG1 + LEG2) * 0.999);
  const aT = ang(v) - Math.acos(U.clamp((LEG1 * LEG1 + d * d - LEG2 * LEG2) / (2 * LEG1 * d), -1, 1));
  const K = [J[0] - Math.cos(aT) * LEG1, J[1] - Math.sin(aT) * LEG1];
  return [aT, ang(sub2(A, K))];
}
/* where each foot is in its step: one stride = two steps (s.gait counts steps); the left heel strikes at 0, the right at 0.5.
   A foot on the ground moves back exactly as far as the body moves on (its stance spans 2 * step * duty), so it stays put. */
function stepFeet(gait, step, run) {
  const duty = U.lerp(0.5, 0.38, run), u = ((gait / 2) % 1 + 1) % 1, T = 2 * step * duty, out = {};
  for (const [n, off] of [['L', 0], ['R', 0.5]]) {
    const q = ((u - off) % 1 + 1) % 1;
    if (q < duty) out[n] = { d: T / 2 - T * q / duty, lift: 0, stance: true, fwd: 1 - 2 * q / duty };
    else { const w = (q - duty) / (1 - duty); out[n] = { d: -T / 2 + T * smoother(w), lift: Math.sin(Math.PI * w), stance: false, fwd: -1 + 2 * smoother(w) }; }
  }
  const any = out.L.stance || out.R.stance;
  /* the hips ride on the supporting leg (a little bent, the heel-to-toe roll shortening its arc); in a running flight they rise */
  const ride = d => ANK + Math.sqrt(Math.pow((LEG1 + LEG2) * 0.975, 2) - Math.pow(0.8 * d, 2));
  let hip = any ? Math.min(out.L.stance ? ride(out.L.d) : 9, out.R.stance ? ride(out.R.d) : 9) : ride(T / 2);
  if (!any) { const fp = ((u % 0.5) - duty) / Math.max(0.02, 0.5 - duty); hip += 0.03 * run * Math.sin(Math.PI * U.clamp(fp, 0, 1)); }
  out.hip = hip; out.T = T;
  return out;
}

function poseStandIn(f, dt) {
  const s = f.st, b = f.bones, A = ANIM[s.anim] || {}, k = f.k;
  for (const n of LAYERS) {
    let tgt = A[n] || 0;
    if (n === 'aim' && s.aim != null) tgt = s.aim; if (n === 'lean' && s.lean != null) tgt = s.lean; if (n === 'reach' && s.reach != null) tgt = Math.max(tgt, s.reach);
    if (n === 'walk' && !(s.speed > 0.02) && s.anim !== 'turn') tgt = 0;
    k[n] = U.approach(k[n] || 0, tgt, (RATE[n] || 4) * dt);
  }
  for (const bn of f.boneList) bn.rotation.set(0, 0, 0);
  const t = f.time, ph = (s.gait || 0) * Math.PI;    // gait counts steps: one step = half a stride
  const run = k.run, walkA = k.walk * (1 - k.kneel), armA = (0.32 + 0.35 * run) * walkA;
  /* hips height: bob with the gait, lowered by kneeling and leaning */
  /* legs: placed by IK on the step cycle (walking), planted under a standing figure; the weight shifts now and then */
  const F = stepFeet(s.gait || 0, f.step || 0.65, run), clear = U.lerp(0.09, 0.16, run) + 0.12 * k.climb;
  const fwd = { L: 0, R: 0 };
  for (const n of ['L', 'R']) {
    const l = F[n]; let th = 0, A = [ANK + clear * l.lift, l.d];
    /* the heel-to-toe roll: a foot behind rises onto its toes, a foot in front onto its heel, when the leg can't reach flat */
    const Jh = [F.hip, 0];
    if (l.stance) for (let i = 0; i < 12 && len2(sub2(A, Jh)) > (LEG1 + LEG2) * 0.995; i++) {
      th += l.d < 0 ? 0.05 : -0.05;
      A = l.d < 0 ? [rot2([ANK, -TOE], th)[0], l.d + TOE + rot2([ANK, -TOE], th)[1]] : [rot2([ANK, HEEL], th)[0], l.d - HEEL + rot2([ANK, HEEL], th)[1]];
    } else th = -0.25 * l.lift * (1 - run * 0.5);
    const [aT, aS] = legSolve(Jh, A);
    b['thigh' + n].rotation.x = walkA * aT; b['shin' + n].rotation.x = walkA * (aS - aT); b['foot' + n].rotation.x = walkA * (th - aS);
    fwd[n] = l.fwd;
  }
  b.hips.position.y = U.lerp(0.94, F.hip + HIPJ, walkA) - 0.42 * k.kneel - 0.10 * k.lean - 0.03 * k.low * (1 - k.kneel);
  b.thighL.rotation.x -= k.climb * 0.35 * Math.max(0, fwd.L); b.thighR.rotation.x -= k.climb * 0.35 * Math.max(0, fwd.R);
  /* standing: the weight settles on one leg, then the other (the other knee eases), every ~5.5 s */
  const still = (1 - walkA) * (1 - k.kneel) * (1 - k.lean) * (1 - k.aim), sway = Math.sin(t * 2 * Math.PI / 5.5 + f.swayPh);
  b.hips.rotation.z = 0.022 * sway * still; b.thighL.rotation.z = b.thighR.rotation.z = -b.hips.rotation.z;
  for (const [n, w] of [['L', Math.max(0, -sway) * still], ['R', Math.max(0, sway) * still]]) { b['thigh' + n].rotation.x -= 0.08 * w; b['shin' + n].rotation.x += 0.17 * w; b['foot' + n].rotation.x -= 0.06 * w; }
  /* kneel: left foot planted forward, right knee down behind */
  b.thighL.rotation.x += k.kneel * -1.40; b.shinL.rotation.x += k.kneel * 1.40;
  b.thighR.rotation.x += k.kneel * -0.12; b.shinR.rotation.x += k.kneel * 1.62; b.footR.rotation.x = k.kneel * -0.45;
  /* a lunge drops into the front knee */
  b.thighL.rotation.x += k.lean * -0.55; b.shinL.rotation.x += k.lean * 0.55; b.thighR.rotation.x += k.lean * 0.35;
  /* torso */
  const breathe = Math.sin(t * 2 * Math.PI * 0.25) * 0.012;
  b.spine.rotation.x = 0.06 + 0.10 * k.search * walkA + 0.18 * run * walkA + 0.32 * k.kneel + 0.25 * k.low + 0.55 * k.lean + 0.25 * k.reach + 0.12 * k.down + breathe;
  b.chest.rotation.x = 0.07 + 0.15 * k.lean + 0.12 * k.low + 0.25 * k.reach - 0.06 * k.aim + breathe;
  b.spine.rotation.y = 0.06 * walkA * (fwd.L - fwd.R) / 2; b.spine.rotation.z = -0.6 * b.hips.rotation.z;   // shoulders against the hips
  /* head: looks along the torch while searching; notice snaps it; free look target overrides */
  b.neck.rotation.x = 0.06 + 0.06 * k.search; b.head.rotation.x = 0.04 + 0.10 * k.search + 0.18 * k.down + 0.1 * k.low - 0.12 * k.rail;
  if (s.head) { b.head.rotation.y = U.clamp(s.head.yaw || 0, -1.3, 1.3) * (0.6 + 0.4 * k.notice); b.head.rotation.x += U.clamp(s.head.pitch || 0, -0.6, 0.8); }
  /* right arm: swings; aims the gun; grabs; reaches in; rattles the gate; shakes the sheet */
  b.upperArmR.rotation.x = -armA * fwd.L - 0.15 * k.search * walkA;
  b.foreArmR.rotation.x = -0.25 * walkA - 0.25 * run * walkA;
  b.upperArmR.rotation.z = -0.06;
  /* left arm (torch arm): swings when the torch is idle, else held forward along the torch pitch */
  const torchHeld = s.torch && s.torch.on && f.props.torch;
  const pitch = (s.torch && s.torch.pitchVis != null ? s.torch.pitchVis : s.torch && s.torch.pitch != null ? s.torch.pitch : -20) * D2R;
  if (torchHeld) {
    const jolt = run * walkA * 0.05 * Math.sin(ph * 2);
    b.upperArmL.rotation.x = -0.55 - 0.25 * k.kneel + 0.25 * k.down + jolt; b.foreArmL.rotation.x = -0.75 + 0.2 * k.down;
    b.upperArmL.rotation.z = 0.12;
  } else { b.upperArmL.rotation.x = -armA * fwd.R; b.foreArmL.rotation.x = -0.25 * walkA - 0.25 * run * walkA; b.upperArmL.rotation.z = 0.06; }
  /* aim: right hand at the grip by the shoulder, left hand (and torch) under the fore-end */
  if (k.aim > 0.001) {
    const a = k.aim;
    b.upperArmR.rotation.x = U.lerp(b.upperArmR.rotation.x, -0.95, a); b.foreArmR.rotation.x = U.lerp(b.foreArmR.rotation.x, -1.25, a); b.upperArmR.rotation.z = U.lerp(-0.06, 0.35, a);
    b.upperArmL.rotation.x = U.lerp(b.upperArmL.rotation.x, -1.30, a); b.foreArmL.rotation.x = U.lerp(b.foreArmL.rotation.x, -0.25, a); b.upperArmL.rotation.z = U.lerp(b.upperArmL.rotation.z, -0.32, a);
    b.head.rotation.x += 0.10 * a; b.head.rotation.y *= 1 - a;
  }
  /* lunge / reach: the right arm goes out towards the rabbit */
  const out = Math.max(k.lean, k.reach);
  if (out > 0.001) { b.upperArmR.rotation.x = U.lerp(b.upperArmR.rotation.x, -1.35 + 0.35 * k.reach, out); b.foreArmR.rotation.x = U.lerp(b.foreArmR.rotation.x, -0.1, out); b.upperArmR.rotation.z = U.lerp(b.upperArmR.rotation.z, 0.1, out); }
  /* torch pointed straight down (the culvert) */
  if (k.down > 0.001) { b.upperArmL.rotation.x = U.lerp(b.upperArmL.rotation.x, -0.55, k.down); b.foreArmL.rotation.x = U.lerp(b.foreArmL.rotation.x, -0.15, k.down); }
  /* unlock: both hands on the chain at chest height, rattling in bursts (s.shakeAmt 0..1) */
  if (k.unlock > 0.001) {
    const r = (s.shakeAmt || 0) * Math.sin(t * 2 * Math.PI * 7.5), u = k.unlock;
    b.upperArmL.rotation.x = U.lerp(b.upperArmL.rotation.x, -0.95 + 0.12 * r, u); b.foreArmL.rotation.x = U.lerp(b.foreArmL.rotation.x, -0.9, u); b.upperArmL.rotation.z = U.lerp(b.upperArmL.rotation.z, -0.25, u);
    b.upperArmR.rotation.x = U.lerp(b.upperArmR.rotation.x, -0.95 - 0.12 * r, u); b.foreArmR.rotation.x = U.lerp(b.foreArmR.rotation.x, -0.9, u); b.upperArmR.rotation.z = U.lerp(b.upperArmR.rotation.z, 0.25, u);
    b.spine.rotation.x += 0.06 * u + 0.03 * r * u;
  }
  /* rail: both forearms on a rail, weight on one leg, looking out */
  if (k.rail > 0.001) { const u = k.rail; b.upperArmL.rotation.x = U.lerp(b.upperArmL.rotation.x, -0.55, u); b.foreArmL.rotation.x = U.lerp(b.foreArmL.rotation.x, -0.95, u); b.upperArmR.rotation.x = U.lerp(b.upperArmR.rotation.x, -0.55, u); b.foreArmR.rotation.x = U.lerp(b.foreArmR.rotation.x, -0.95, u); b.spine.rotation.x += 0.12 * u; b.thighR.rotation.x += 0.08 * u; b.hips.rotation.z = 0.04 * u; }
  /* shake the fence sheet once: right arm out, jerked */
  if (k.shake > 0.001) { const j2 = (s.shakeAmt || 0) * Math.sin(t * 2 * Math.PI * 6); b.upperArmR.rotation.x = U.lerp(b.upperArmR.rotation.x, -1.2 + 0.2 * j2, k.shake); b.foreArmR.rotation.x = U.lerp(b.foreArmR.rotation.x, -0.2, k.shake); }
  /* notice: freezes mid-step, shoulders up a touch */
  b.chest.rotation.x -= 0.05 * k.notice;
  /* the torch tilts with the beam (its rest axis is the forearm's forward) */
  if (f.props.torch) b.torch.rotation.x = -pitch - (b.upperArmL.rotation.x + b.foreArmL.rotation.x) - b.spine.rotation.x - b.chest.rotation.x;
  /* the gun: on the back, or at the shoulder pitched at the target */
  const showAim = f.props.gunAim && k.aim > 0.45;
  b.gunSling.scale.setScalar(f.props.gunSling && !showAim ? 1 : 0);
  b.gunAim.scale.setScalar(showAim ? 1 : 0);
  const ga = U.sstep(0.45, 1, k.aim), elev = (s.aimPitch != null ? s.aimPitch * D2R : pitch) * ga + 0.9 * (1 - ga);   // from the sling (muzzle up) down to the target
  b.gunAim.rotation.x = -elev - b.spine.rotation.x - b.chest.rotation.x;
  b.pack.scale.setScalar(f.props.pack ? 1 : 0); b.torch.scale.setScalar(f.props.torch ? 1 : 0); b.coil.scale.setScalar(f.props.coil ? 1 : 0);
}

/* ================================================================== GLTF model slot (lazy) */
const modelBufs = {};
function loadScript(src) { return new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('script ' + src)); document.head.appendChild(el); }); }
function gltfLoader() { if (T.GLTFLoader) return Promise.resolve(); if (FF.loadGLTFLoader) return FF.loadGLTFLoader(); return loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'); }
async function parseModel(file) {
  if (!modelBufs[file]) modelBufs[file] = (async () => { await gltfLoader(); const r = await fetch('models/' + file); if (!r.ok) throw new Error('model ' + file + ' ' + r.status); return r.arrayBuffer(); })();
  const buf = await modelBufs[file];
  return new Promise((res, rej) => new T.GLTFLoader().parse(buf.slice(0), 'models/', res, rej));
}
/* the van slot (ASSETS-3D.md): nodes body, wheel_FL/FR/RL/RR (pivots at the hubs), door_driver; empties light_head_L/R,
   light_work, light_marker_*; a material named like "lamp" / "emissive" is the lamps. Replaces the stand-in's meshes. */
async function useVanModel(v, file) {
  const gltf = await parseModel(file), m = gltf.scene, node = n => m.getObjectByName(n);
  m.traverse(o => { if (o.isMesh) { const lamp = /lamp|emiss|light/i.test((o.material && o.material.name) || '') || /light/i.test(o.name);
    o.material = lamp ? FF.glow([1.4, 1.3, 1.1]) : FF.mat({ color: '#24282d', roughness: 0.75 }); o.castShadow = !lamp; o.receiveShadow = !lamp; } });
  for (const c of v.object.children.slice()) v.object.remove(c);
  v.object.add(m);
  v.model = { wheels: ['wheel_FL', 'wheel_FR', 'wheel_RL', 'wheel_RR'].map(node).filter(Boolean), door: node('door_driver'), head: [node('light_head_L'), node('light_head_R')].filter(Boolean), work: node('light_work'),
    markers: [], base: {} };
  m.traverse(o => { if (/^light_marker/.test(o.name)) v.model.markers.push(o); });
  for (const w of v.model.wheels) v.model.base[w.name] = w.rotation.x;
  if (v.model.door) v.model.base.door = v.model.door.rotation.y;
}
const CLIP = { idle: 'idle', stand: 'idle', walk: 'walk', 'walk-search': 'walk_search', run: 'run', turn: 'turn_180', notice: 'notice', kneel: 'kneel_loop',
  'crouch-look': 'crouch_look_loop', climb: 'climb_steps', descend: 'descend_steps', 'step-down': 'step_down', 'door-step-in': 'door_step_in', aim: 'aim_hold',
  lunge: 'grab', reach: 'kneel_reach', unlock: 'unlock_loop', 'torch-down': 'torch_down_loop', 'rail-look-out': 'rail_look_out', 'shake-sheet': 'shake_sheet' };
async function useModel(f, file) {
  const gltf = await parseModel(file), m = gltf.scene;
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; const sk = !!o.isSkinnedMesh; o.material = FF.mat({ color: '#1a1d21', roughness: 0.9, rim: true }, sk ? { skinning: true } : {}); if (sk) o.customDepthMaterial = depthMat; } });
  const node = n => m.getObjectByName(n);
  const showProp = (n, on) => { const o = node(n); if (o) o.visible = !!on; };
  showProp('prop_torch', f.props.torch); showProp('prop_longgun', f.props.gunSling); showProp('prop_coil', f.props.coil); showProp('prop_pack', f.props.pack);
  const mixer = new T.AnimationMixer(m), clips = {}; for (const c of gltf.animations || []) clips[c.name] = mixer.clipAction(c);
  f.object.remove(f.body); f.body = m; f.object.add(m); f.model = { mixer, clips, cur: null, emitter: node('torch_emitter') };
  f.lens.visible = false;
}
function modelPoseLegacy(f, dt) {
  const M = f.model, s = f.st; let name = CLIP[s.anim] || 'idle'; if (s.aim > 0.5) name = 'aim_hold'; if (!M.clips[name]) name = M.clips.idle ? 'idle' : null;
  if (name && name !== M.cur) { const a = M.clips[name]; if (M.cur && M.clips[M.cur]) M.clips[M.cur].fadeOut(0.25); a.reset().fadeIn(0.25).play(); M.cur = name; }
  if (name && /walk|run/.test(name)) M.clips[name].timeScale = (s.speed || 0) / (name === 'run' ? 2.6 : name === 'walk' ? 1.3 : 1.0) || 1;
  M.mixer.update(dt);
}

/* ================================================================== the real people (?people=models)
   Josh's three rigged characters (Tripo figures on Mixamo skeletons, 8 Oct): models/ff_guard1.glb (the Verge person at the gate),
   ff_guard2.glb (the Search's armed searcher), ff_guard3.glb (the Courtyard walkway worker and the Works painter), each with its
   clips and a ff_guardN.clips.json (the planted-foot speed of every moving clip). VISUAL ONLY: every routine, timing, perception
   rule and position stays with the owners (AI, Events, Painter). What a stand-in does (its `anim` name) is mapped to the nearest
   clip; moving clips play at ground speed / planted-foot speed (so the feet do not slide at the game's pace; the clips are faster
   than the game); and code layers stay on top of the clips: the head (look target), the torch arm (aimed so the torch points where
   its light does), the gun's pitch, a lunge, a reach, the painter's lamp arm. The torch light sits on the model's torch_emitter
   node (its beam along +Z). Bone names lose the colon in three.js (mixamorigRightHand).
   The 180 degree turn: turn_180 turns the body in the clip itself. So while the searcher turns, the figure's own yaw is held and
   the clip does the turning (its progress follows the turn the AI is making, and at the end the figure takes the AI's yaw, which
   the clip's last pose already faces: a hard cut, no blend). */
function peopleOn() {
  /* polish pass 8 Oct: the three guard models are the DEFAULT (Josh); ?people=standin (or FF.MODELS.people = 'standin') brings the stand-ins back */
  try { if (/(^|[?&])people=standin(&|$)/.test(location.search)) return false; if (/(^|[?&])people=models(&|$)/.test(location.search)) return true; } catch (_) {}
  return !(FF.MODELS && FF.MODELS.people === 'standin');
}
const PEOPLE_FILE = { verge: 'ff_guard1.glb', searcher: 'ff_guard2.glb', worker: 'ff_guard3.glb', painter: 'ff_guard3.glb' };
/* per role: idle, walk (an upright walk), search (the careful walk with the torch out), run, and the role's own clips */
const PEOPLE_CLIPS = {
  verge:    { idle: 'idle', walk: 'walk', search: 'sneak', run: 'run', kneel: 'kneel', unlock: 'unlock_loop', torchIn: 'torch_down_in', torch: 'torch_down_loop' },
  searcher: { idle: 'rifle_idle', walk: 'walk', search: 'walk_rifle', run: 'run', kneel: 'kneel', aim: 'aim', aimHold: 'aim_hold', turn: 'turn_180' },
  worker:   { idle: 'idle', walk: 'walk', search: 'walk', run: 'run', rail: 'rail_look_out' },
  painter:  { idle: 'idle', walk: 'walk', search: 'walk', run: 'run', scrape: 'scrape_wall_loop' },
};
const FOOT_FALLBACK = { walk: 1.86, walk_rifle: 1.35, sneak: 2.3, run: 4.8 };        // m/s, if a clips.json can't be read
const MB = { hips: 'mixamorigHips', spine: 'mixamorigSpine', chest: 'mixamorigSpine2', neck: 'mixamorigNeck', head: 'mixamorigHead',
  upperArmL: 'mixamorigLeftArm', foreArmL: 'mixamorigLeftForeArm', handL: 'mixamorigLeftHand', upperArmR: 'mixamorigRightArm', foreArmR: 'mixamorigRightForeArm', handR: 'mixamorigRightHand',
  thighL: 'mixamorigLeftUpLeg', shinL: 'mixamorigLeftLeg', footL: 'mixamorigLeftFoot', thighR: 'mixamorigRightUpLeg', shinR: 'mixamorigRightLeg', footR: 'mixamorigRightFoot' };
const MOVING = { walk: 'walk', 'door-step-in': 'search', 'walk-search': 'search', climb: 'search', descend: 'search', 'step-down': 'search', run: 'run' };
const AIM_RAISE = 0.5;                    // seconds of the aim clip that raise the rifle (then it holds): scrubbed with s.aim
const DOWN_T = 0.8;                       // seconds a kneel / crouch takes to go down (the stand-in took ~0.5 s)
const speedCache = {};
function footSpeeds(file) {
  const j = file.replace(/\.glb$/, '.clips.json');
  if (!speedCache[j]) speedCache[j] = fetch('models/' + j).then(r => r.ok ? r.json() : null).then(d => {
    const o = {}; if (d && d.clips) for (const k in d.clips) o[k] = d.clips[k].planted_foot_speed_mps; return o; }).catch(() => ({}));
  return speedCache[j];
}
const _v = new T.Vector3(), _w = new T.Vector3(), _q = new T.Quaternion(), _q2 = new T.Quaternion(), _q3 = new T.Quaternion();
const wrapPI = a => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
/* the code layers are applied after the clips every frame, and the mixer only writes a bone whose animated value changed, so each
   layer first saves the bone's clip pose and the next frame puts it back before the mixer runs (else a layer would pile up on a held pose) */
function restoreLayers(M) { for (const [b, q] of M.saved) b.quaternion.copy(q); M.saved.clear(); }
function save(M, b) { if (!M.saved.has(b)) M.saved.set(b, b.quaternion.clone()); }
/* turn a bone about an axis fixed in the figure's own space (x its sideways, y up) by ang (rotation.x < 0 swings a hanging limb forward) */
function swing(M, b, axis, ang) {
  if (!b || Math.abs(ang) < 1e-5) return;
  save(M, b);
  M.group.getWorldQuaternion(_q);
  _v.set(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0).applyQuaternion(_q);
  b.parent.getWorldQuaternion(_q2).invert(); _v.applyQuaternion(_q2).normalize();
  b.quaternion.premultiply(_q3.setFromAxisAngle(_v, ang)); b.updateMatrixWorld(true);
}
/* turn the torch arm (the forearm half way, then the wrist) so the torch's beam axis (+Z of torch_emitter) points along dir, by at
   most maxA in all, weighted w */
function aimEmitter(M, dir, w, maxA) {
  const em = M.emitter; if (!em || w < 0.001) return;
  for (const [b, share] of [[M.b.foreArmL, 0.5], [M.b.handL, 1.0]]) {
    if (!b) continue;
    em.getWorldQuaternion(_q); _v.set(0, 0, 1).applyQuaternion(_q);
    const ang = _v.angleTo(dir); if (ang < 1e-3) continue;
    const k = Math.min(1, maxA / ang) * w * share;
    _q2.setFromUnitVectors(_v, dir); _q3.identity().slerp(_q2, k);
    save(M, b); b.getWorldQuaternion(_q); _q.premultiply(_q3);
    b.parent.getWorldQuaternion(_q2).invert(); b.quaternion.copy(_q2.multiply(_q)); b.updateMatrixWorld(true);
  }
}
/* the part of a kneel clip that goes down (from where the hips start to drop to where they bottom out), as its own clip */
function descentClip(root, bones, clip) {
  const mixer = new T.AnimationMixer(root), hips = bones[MB.hips], N = Math.max(2, Math.round(clip.duration * 30)), ys = [];
  const act = mixer.clipAction(clip); act.play();
  for (let i = 0; i <= N; i++) { mixer.setTime(Math.min(i / 30, clip.duration - 1e-4)); root.updateMatrixWorld(true); hips.getWorldPosition(_v); ys.push(_v.y); }
  act.stop(); mixer.uncacheAction(clip); mixer.uncacheClip(clip);
  const mn = Math.min(...ys); let f1 = ys.findIndex(y => y < mn + 0.02), f0 = 0; if (f1 < 1) f1 = ys.length - 1;
  for (let i = 0; i < f1; i++) if (ys[i] < ys[0] - 0.03) { f0 = Math.max(0, i - 2); break; }
  return T.AnimationUtils.subclip(clip, clip.name + '_down', f0, f1 + 1, 30);
}
async function useGuard(f) {
  const role = f.role, file = PEOPLE_FILE[role] || PEOPLE_FILE.searcher, tab = PEOPLE_CLIPS[role] || PEOPLE_CLIPS.searcher;
  const [gltf, feet] = await Promise.all([parseModel(file), footSpeeds(file)]);
  const m = gltf.scene, bone = {};
  m.traverse(o => { if (o.name) bone[o.name] = o; });
  /* the same charcoal for everything; a material can't be shared between a skinned and a plain mesh in r128 (the skinned body then
     draws unskinned), so the props (torch, gun, pack, scraper) get their own */
  if (!propMat) propMat = FF.mat({ color: '#1a1d21', roughness: 0.9, rim: true });
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.material = o.isSkinnedMesh ? mat : propMat; if (o.isSkinnedMesh) o.customDepthMaterial = depthMat; } });
  const rest = Object.values(bone).filter(o => o.isBone).map(b => [b, b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
  const mixer = new T.AnimationMixer(m), clips = {}, acts = {};
  for (const c of gltf.animations || []) clips[c.name] = c;
  const down = {};                                           // name -> { clip, dur }: a kneel's going-down part
  for (const n of [tab.kneel]) if (n && clips[n] && bone[MB.hips]) { try { const c = descentClip(m, bone, clips[n]); down[n] = c; } catch (e) { FF.report && FF.report(e, 'Humans.guard descent ' + n); } }
  for (const [b, p, q, sc] of rest) { b.position.copy(p); b.quaternion.copy(q); b.scale.copy(sc); }   // back to the bind pose
  m.updateMatrixWorld(true);
  const act = n => { if (!n) return null; if (!acts[n]) { const c = down[n] || clips[n]; if (c) acts[n] = mixer.clipAction(c); } return acts[n] || null; };
  const b = {}; for (const k in MB) b[k] = bone[MB[k]] || null;
  const M = { guard: true, role, tab, mixer, clips, down, acts, act, bone, b, feet, group: f.object, emitter: bone.torch_emitter || null, saved: new Map(),
    cur: null, curName: '', curKind: '', turn: null, prevYaw: null, unlockK: 0, downT: 0 };
  f.object.remove(f.body); f.body = m; f.object.add(m); f.model = M;
  Object.assign(f.bones, Object.fromEntries(Object.keys(MB).filter(k => b[k]).map(k => [k, b[k]])));     // painter / tests reach hands, feet, head by the stand-in's names
  if (M.emitter && f.lens) { f.lens.parent && f.lens.parent.remove(f.lens); M.emitter.add(f.lens); f.lens.position.set(0, 0, 0.004); f.lens.rotation.set(0, 0, 0); }
  f.lens.visible = !!f.props.torch;
  f._tgt = f._tgt || null;
  console.log('[farfield] people: ' + role + ' = models/' + file + ' (' + Object.keys(clips).length + ' clips' + (M.emitter ? ', torch_emitter' : '') + ')');
}
/* which clip this moment of the stand-in's `anim` asks for, and how to play it */
function chooseGuard(f) {
  const M = f.model, s = f.st, T_ = M.tab, v = f.vt != null ? f.vt : (s.speed || 0);
  let a = s.anim || 'idle'; if (a === 'stand') a = 'idle';
  if (a === 'turn' && T_.turn && M.clips[T_.turn]) return { name: T_.turn, kind: 'turn' };
  if (MOVING[a] && v > 0.05) {
    const key = MOVING[a], name = T_[key] && M.clips[T_[key]] ? T_[key] : T_.walk;
    const foot = M.feet[name] || FOOT_FALLBACK[name] || 1.8;
    return { name, kind: 'loco', rate: U.clamp(v / foot, 0.2, 2.6) };
  }
  if (a === 'aim' || (s.aim || 0) > 0.5) {
    if ((s.aim || 0) > 0.999 && M.clips[T_.aimHold]) return { name: T_.aimHold, kind: 'aimhold' };
    if (T_.aim && M.clips[T_.aim]) return { name: T_.aim, kind: 'aimscrub' };       // the raise / lower follows the AI's own ramp (s.aim)
  }
  if ((a === 'kneel' || a === 'crouch-look' || a === 'reach' || a === 'shake-sheet') && T_.kneel && !(a === 'reach' && T_.torch)) return { name: T_.kneel, kind: 'down' };
  if ((a === 'torch-down' || a === 'reach') && T_.torch) return { name: T_.torchIn, kind: 'torch' };
  if (a === 'unlock' && T_.unlock) return { name: T_.unlock, kind: 'unlock' };
  if (a === 'rail-look-out' && T_.rail) return { name: T_.rail, kind: 'loop' };
  if (a === 'scrape' && T_.scrape) return { name: T_.scrape, kind: 'loop' };
  return { name: T_.idle, kind: 'loop' };
}
function guardPose(f, dt, fresh) {
  const M = f.model, s = f.st, g = f.object;
  g.updateMatrixWorld(true);
  restoreLayers(M);
  const want = chooseGuard(f); let name = want.name, kind = want.kind;
  /* the turn: hold the figure's yaw at where the turn began; the clip turns the body, in step with the AI's yaw */
  if (kind === 'turn') {
    if (!M.turn) M.turn = { y0: M.prevYaw != null ? M.prevYaw : f.yaw };
  } else if (M.turn) M.turn = null;
  const leavingTurn = M.curKind === 'turn' && kind !== 'turn';
  let a = M.act(name);
  if (!a) { name = M.tab.idle; kind = 'loop'; a = M.act(name); }
  if (!a) return;
  /* a down clip plays its going-down part once and holds; torch_down_in plays once and hands over to torch_down_loop */
  let once = kind === 'down' || kind === 'turn' || (kind === 'torch' && name === M.tab.torchIn), nameNow = name;
  if (kind === 'torch' && M.cur === M.act(M.tab.torchIn) && M.cur && M.cur.time >= M.cur.getClip().duration - 0.04) { nameNow = M.tab.torch; once = false; a = M.act(nameNow); }
  else if (kind === 'torch' && M.curName === M.tab.torch) { nameNow = M.tab.torch; once = false; a = M.act(nameNow); }
  const cut = fresh || leavingTurn;
  if (a !== M.cur) {
    const prev = M.cur, prevLoco = M.curKind === 'loco';
    if (cut) M.mixer.stopAllAction();
    a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.setLoop(once ? T.LoopOnce : T.LoopRepeat, Infinity); a.clampWhenFinished = !!once;
    if (kind === 'loco' && prev && prevLoco) a.time = ((prev.time / Math.max(1e-3, prev.getClip().duration)) % 1) * a.getClip().duration;   // keep the stride going from another walk
    if (prev && !cut) a.crossFadeFrom(prev, kind === 'turn' || kind === 'aimscrub' ? 0.15 : 0.22, false);
    a.play(); M.cur = a; M.curName = nameNow; M.curKind = kind;
  }
  /* playback rate */
  let ts = 1;
  const dur = a.getClip().duration;
  if (kind === 'loco') ts = want.rate;
  else if (kind === 'down') ts = a.getClip().duration / DOWN_T;
  else if (kind === 'unlock') { M.unlockK = U.approach(M.unlockK, (s.shakeAmt || 0) > 0.05 ? 1 : 0, 6 * dt); ts = M.unlockK; }
  else if (kind === 'aimscrub') { a.time = U.clamp(s.aim || 0, 0, 1) * AIM_RAISE; ts = 0; }
  else if (kind === 'turn') {
    /* the clip's time follows the turn made so far (the AI's yaw vs where it began) */
    const prog = U.clamp(Math.abs(wrapPI(f.yaw - M.turn.y0)) / Math.PI, 0, 1);
    a.time = prog * dur * 0.999; ts = 0;
  }
  a.timeScale = ts;
  M.mixer.update(dt);
  M.prevYaw = f.yaw;
  g.rotation.y = M.turn ? M.turn.y0 : f.yaw;
  g.updateMatrixWorld(true);
  /* ---- the code layers, after the clips */
  const b = M.b, torchOn = !!(s.torch && s.torch.on && f.props.torch);
  if (s.head) {
    const hy = U.clamp(s.head.yaw || 0, -1.3, 1.3), hp = U.clamp(s.head.pitch || 0, -0.6, 0.8);
    swing(M, b.neck, 'y', hy * 0.3); swing(M, b.head, 'y', hy * 0.7); swing(M, b.neck, 'x', hp * 0.3); swing(M, b.head, 'x', hp * 0.7);
  }
  const aimK = kind === 'aimscrub' || kind === 'aimhold' ? U.sstep(0.45, 1, s.aim || 0) : 0;
  if (aimK > 0 && M.bone.gun_muzzle && b.chest) {              // the gun's pitch: the upper body tips the rifle to the target
    M.bone.gun_muzzle.getWorldQuaternion(_q); _v.set(0, 0, 1).applyQuaternion(_q);
    _q2.copy(g.getWorldQuaternion(_q3)).invert(); _v.applyQuaternion(_q2);
    const cur = Math.asin(U.clamp(_v.y, -1, 1)), des = (s.aimPitch != null ? s.aimPitch : -20) * D2R;
    swing(M, b.chest, 'x', -U.clamp(des - cur, -0.7, 0.7) * aimK);
  }
  if (torchOn && f._tgt && M.emitter && kind !== 'aimscrub' && kind !== 'aimhold' && kind !== 'turn' && kind !== 'unlock') {
    M.emitter.getWorldPosition(_w); _v.set(f._tgt[0] - _w.x, f._tgt[1] - _w.y, f._tgt[2] - _w.z);
    if (_v.lengthSq() > 1e-6) aimEmitter(M, _v.normalize().clone(), 1, 0.7);
  }
  const lean = s.lean || 0, reach = s.reach || 0;
  if (lean > 0.001) { swing(M, b.spine, 'x', 0.35 * lean); swing(M, b.upperArmR, 'x', -1.0 * lean); }
  if (reach > 0.001) { swing(M, b.spine, 'x', 0.12 * reach); swing(M, b.upperArmR, 'x', -1.0 * reach); swing(M, b.foreArmR, 'x', -0.15 * reach); }
  if (s.anim === 'shake-sheet') { const j = (s.shakeAmt || 0) * Math.sin(f.time * 2 * Math.PI * 6); swing(M, b.upperArmR, 'x', -1.1 + 0.2 * j); swing(M, b.foreArmR, 'x', -0.2); }
  if (s.arms) for (const sd of ['L', 'R']) { const a2 = s.arms[sd]; if (a2) { swing(M, b['upperArm' + sd], 'x', a2[0]); swing(M, b['foreArm' + sd], 'x', a2[1]); } }
  /* props by role */
  const vis = (n, on) => { const o = M.bone[n]; if (o && o.visible !== !!on) o.visible = !!on; };
  vis('prop_torch', f.props.torch); vis('prop_longgun', f.props.gunSling || f.props.gunAim); vis('prop_pack', f.props.pack); vis('prop_scraper', f.role === 'painter');
  g.updateMatrixWorld(true);
}
/* where the torch's light sits: the model's torch_emitter (its beam along +Z), else the 2D lens */
function emitterPos(f, out) { const M = f.model; if (!M || !M.guard || !M.emitter) return null; M.emitter.getWorldPosition(out); return out; }

/* ================================================================== figures */
function makeFigure(role) {
  const g = new T.Group(); g.name = 'human:' + role;
  if (!sharedGeo) sharedGeo = standInGeometry();
  const bones = BONES.map(([n]) => { const b = new T.Bone(); b.name = n; return b; });
  BONES.forEach(([, p, o], i) => { bones[i].position.set(o[0], o[1], o[2]); if (p >= 0) bones[p].add(bones[i]); });
  const body = new T.SkinnedMesh(sharedGeo, mat); body.name = 'human-standin'; body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  body.customDepthMaterial = depthMat;
  body.add(bones[0]); body.updateMatrixWorld(true); body.bind(new T.Skeleton(bones));
  g.add(body);
  /* the torch lens: a small glow disc on the torch bone, facing along the beam */
  const lens = new T.Mesh(new T.CircleGeometry(0.026, 12), lensMat); lens.position.set(0, 0, 0.162); bones[BI.torch].add(lens);
  const B = {}; bones.forEach(b => { B[b.name] = b; });
  return { g, body, bones: B, boneList: bones, lens };
}

const Humans = FF.Humans = {
  stub: false,
  init(c) {
    ctx = c;
    mat = FF.mat({ color: '#1a1d21', roughness: 0.9, rim: true }, { skinning: true });
    depthMat = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking, skinning: true });
    lensMat = FF.glow([3.0, 3.1, 3.25]);
  },
  /* a figure: role 'verge' | 'worker' | 'searcher' */
  create(role) {
    const fig = makeFigure(role), g = fig.g;
    g.visible = false; ctx.scene.add(g);
    const props = Object.assign({}, ROLE_PROPS[role] || ROLE_PROPS.searcher);
    fig.lens.visible = !!props.torch;
    const f = {
      role, object: g, body: fig.body, bones: fig.bones, boneList: fig.boneList, lens: fig.lens, props, k: {}, time: 0, model: null, step: 0.65, swayPh: figures.length * 2.1, _g: null, torchHandle: null, _torchOn: false,
      st: { x: 0, y: 0, z: 0, face: -1, yaw: null, anim: 'idle', speed: 0, gait: 0, visible: false, torch: { on: false, pitch: -20, half: 13, target: null, intensity: null },
            aim: null, aimPitch: null, lean: null, reach: null, head: null, shakeAmt: 0 },
      /* pose and look for this frame (INTERFACES §8.5). Extra keys: yaw (explicit body yaw; else from face, turning through the
         camera side), gait (steps walked: drives the legs, in step with the AI's footstep sounds), aim 0..1 (gun raise),
         aimPitch (deg), lean 0..1 (lunge), reach 0..1, head {yaw, pitch} (rad, relative), shakeAmt 0..1 (rattle / shake),
         torch {on, pitch (deg below horizontal < 0), half (deg), target [x,y,z] (overrides the lane rule), intensity} */
      set(o) {
        for (const k in o) if (k !== 'torch') f.st[k] = o[k];
        if (o.gun === 'aim' && o.aim == null) f.st.aim = 1; if (o.gun === 'slung' && o.aim == null) f.st.aim = 0;
        if (o.torch) f.st.torch = Object.assign({}, f.st.torch, o.torch);
        return f;
      },
      /* world positions the AI and the lights use (the 2D model's eye and lens; z = the figure's z) */
      eye() { const s = f.st, kn = s.anim === 'kneel' || s.anim === 'crouch-look' || s.anim === 'reach' || s.anim === 'torch-down'; return new T.Vector3(s.x, s.y + (kn ? FF.RULES.sight.kneelEye : FF.RULES.sight.eye), s.z); },
      torchLens() { const s = f.st, kn = s.anim === 'kneel' || s.anim === 'crouch-look' || s.anim === 'reach' || s.anim === 'torch-down', R = FF.RULES.sight.torch; return new T.Vector3(s.x + (kn ? R.kneelFwd : R.fwd) * (s.face || 0), s.y + (kn ? R.kneelH : R.h), s.z); },
      /* the lens as drawn (the stand-in's torch bone), for effects that want the visible lens */
      drawnLens() { const v = new T.Vector3(); f.lens.getWorldPosition(v); return v; },
      /* keep a World spot handle on the torch lens (A16: its axis meets z 0 at the 2D aim point) */
      attachTorch(handle) { f.torchHandle = handle || null; f._torchOn = null; return f; },
      setRole(r) { Object.assign(props, ROLE_PROPS[r] || {}); f.lens.visible = !!props.torch && !(f.model && !f.model.guard); return f; },
      dispose() { ctx.scene.remove(g); },
    };
    figures.push(f);
    if (peopleOn()) useGuard(f).catch(e => { console.warn('[farfield] people model failed for ' + role + ', using the stand-in:', e.message); });
    else if (FF.MODELS && FF.MODELS.human) useModel(f, FF.MODELS.human).catch(e => FF.report(e, 'Humans.model ' + FF.MODELS.human));
    return f;
  },
  /* the van (stand-in): facing +Z, origin on the ground at its centre. set({ x, z, yaw (rad; PI/2 = driving +x), visible,
     lights (headlights + work light on), markers, door 0..1, engine (idle vibration), brake 0..1 (body dip) }) */
  createVan() {
    if (!vanMat) { vanMat = FF.mat({ color: '#24282d', roughness: 0.75 }); tyreMat = FF.mat({ color: '#121417', roughness: 0.95 });
      const hl = FF.lin('#ffe3bd'), wl = FF.lin('#e7edf2'), am = FF.lin('#ffae4a');
      /* modest glows: seen through the gate's 3 cm seam, a bright HDR disc turned the bloom into a large dark blot (tested) */
      vanGlowHead = FF.glow([hl.r * 1.4, hl.g * 1.4, hl.b * 1.4]); vanGlowWork = FF.glow([wl.r * 1.6, wl.g * 1.6, wl.b * 1.6]); vanGlowMarker = FF.glow([am.r * 1.2, am.g * 1.2, am.b * 1.2]); }
    const B = FF.geo.box, g = new T.Group(); g.name = 'van';
    const body = new T.Group(); body.name = 'body'; g.add(body);
    /* cargo box, cab with a raked windscreen, bumper, roof bar */
    const cab = B(-0.96, 0.96, 1.3, 1.95, 1.1, 2.45); { const p = cab.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.9 && p.getZ(i) > 2.0) p.setZ(i, 1.75); cab.computeVertexNormals(); }
    const shell = FF.geo.merge([B(-1.0, 1.0, 0.45, 2.45, -2.6, 1.1), B(-0.98, 0.98, 0.45, 1.3, 1.1, 2.6), cab, B(-1.02, 1.02, 0.3, 0.5, 2.5, 2.66), B(-1.02, 1.02, 0.3, 0.5, -2.66, -2.5),
      B(-0.7, 0.7, 2.45, 2.52, 0.6, 1.2), B(-0.98, -0.96, 0.62, 1.55, -0.2, 0.2)]);
    const shellM = new T.Mesh(shell, vanMat); shellM.castShadow = true; shellM.receiveShadow = true; body.add(shellM);
    /* wheels: two axles (one draw each), spinning about x */
    const axles = [];
    for (const z of [-1.7, 1.7]) { const parts = []; for (const x of [-0.92, 0.92]) { const w = new T.CylinderGeometry(0.37, 0.37, 0.24, 18); w.rotateZ(Math.PI / 2); w.translate(x, 0, 0); parts.push(w); }
      const a = new T.Mesh(FF.geo.merge(parts), tyreMat); a.position.set(0, 0.37, z); a.castShadow = true; g.add(a); axles.push(a); }
    /* driver's door (right-hand drive: the -x side), hinged at its front edge */
    const door = new T.Group(); door.name = 'door_driver'; door.position.set(-0.99, 0, 2.35); body.add(door);
    { const d = new T.Mesh(B(-0.04, 0.0, 0.5, 1.85, -1.1, 0), vanMat); d.castShadow = true; door.add(d); }
    /* lamps (glow): headlights, the roof work light, three amber markers a side */
    const heads = new T.Group(); body.add(heads);
    for (const x of [-0.7, 0.7]) { const d = new T.Mesh(new T.CircleGeometry(0.1, 14), vanGlowHead); d.name = x < 0 ? 'light_head_R' : 'light_head_L'; d.position.set(x, 0.82, 2.665); heads.add(d); }
    const work = new T.Mesh(B(-0.5, 0.5, 2.52, 2.56, 0.9, 1.15), vanGlowWork); work.name = 'light_work'; body.add(work);
    const markers = new T.Group(); body.add(markers);
    for (const z of [-2.2, -0.6, 1.0]) for (const x of [-1.005, 1.005]) { const m = new T.Mesh(new T.PlaneGeometry(0.06, 0.04), vanGlowMarker); m.position.set(x, 0.62, z); m.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2; markers.add(m); }
    g.visible = false; ctx.scene.add(g);
    const v = {
      object: g, st: { x: 0, z: -8.5, yaw: Math.PI / 2, visible: false, lights: false, markers: true, door: 0, engine: false, brake: 0 }, roll: 0, lastX: null, lastZ: null, t: 0,
      set(o) { Object.assign(v.st, o); return v; },
      /* world positions of the two headlights and the work light; the headlights' forward direction */
      headlightAnchors() { g.updateMatrixWorld(true); if (v.model && v.model.head.length === 2) return v.model.head.map(o => o.getWorldPosition(new T.Vector3()));
        return [new T.Vector3(-0.7, 0.82, 2.7).applyMatrix4(body.matrixWorld), new T.Vector3(0.7, 0.82, 2.7).applyMatrix4(body.matrixWorld)]; },
      workAnchor() { g.updateMatrixWorld(true); if (v.model && v.model.work) return v.model.work.getWorldPosition(new T.Vector3()); return new T.Vector3(0, 2.6, 1.05).applyMatrix4(body.matrixWorld); },
      forward() { return new T.Vector3(Math.sin(v.st.yaw), 0, Math.cos(v.st.yaw)); },
      frame(dt) {
        const s = v.st; g.visible = !!s.visible; if (!s.visible) { v.lastX = null; return; }
        v.t += dt;
        if (v.lastX != null) { const d = Math.hypot(s.x - v.lastX, s.z - v.lastZ), fwd = (s.x - v.lastX) * Math.sin(s.yaw) + (s.z - v.lastZ) * Math.cos(s.yaw); v.roll += (fwd >= 0 ? 1 : -1) * d / 0.37; }
        v.lastX = s.x; v.lastZ = s.z;
        g.position.set(s.x, 0, s.z); g.rotation.y = s.yaw;
        if (v.model) {
          const M = v.model; for (const w of M.wheels) w.rotation.x = M.base[w.name] + v.roll;
          if (M.door) M.door.rotation.y = M.base.door - 1.1 * U.clamp(s.door || 0, 0, 1);
          for (const o of M.head) o.visible = !!s.lights; if (M.work) M.work.visible = !!s.lights; for (const o of M.markers) o.visible = s.markers !== false;
          return;
        }
        for (const a of axles) a.rotation.x = v.roll;
        body.position.y = s.engine ? 0.004 * Math.sin(v.t * 2 * Math.PI * 23) : 0; body.rotation.x = 2 * D2R * (s.brake || 0);
        door.rotation.y = -1.1 * U.clamp(s.door || 0, 0, 1);
        heads.visible = !!s.lights; work.visible = !!s.lights; markers.visible = s.markers !== false;
      },
      dispose() { ctx.scene.remove(g); },
    };
    vans.push(v);
    if (FF.MODELS && FF.MODELS.van) useVanModel(v, FF.MODELS.van).catch(e => FF.report(e, 'Humans.van model ' + FF.MODELS.van));
    return v;
  },
  /* every restart (warp, continue, failure, title): no figure or torch carries over. Each owner (AI, Events) re-drives its
     figure in its own frame(), which runs after this module's frame(), so without this a figure from before the restart
     (the searcher after a warp back to the Verge, the Verge person after a warp forward) would draw for one frame with its
     old pose and a lit torch (integration fix). The World has already put every driven light out (World.reset). */
  reset() {
    for (const f of figures) { f.st.visible = false; if (f.st.torch) f.st.torch.on = false; f._torchOn = false; f.st.snap = true; if (f.object) f.object.visible = false; }
  },
  frame(dt) {
    for (const f of figures) {
      const s = f.st, g = f.object, wasVis = g.visible; g.visible = !!s.visible;
      if (!s.visible) {
        /* leaving the stage: put the torch light out once (the rig slot may belong to someone else afterwards) */
        if (wasVis && f.torchHandle && f._torchOn) { f.torchHandle.on(false); if (f.torchHandle.beam) f.torchHandle.beam(false); f._torchOn = false; }
        continue;
      }
      f.time += dt;
      /* the step length the legs use: the figure's own travel per step its owner counted (so a planted foot stays put) */
      const gx = s.gait || 0;
      if (f._g != null && !s.snap) {
        const dg = gx - f._g, dd = Math.hypot(s.x - f._x, s.z - f._z);
        if (dg > 1e-4 && dd < 0.6) f.step = U.lerp(f.step, U.clamp(dd > 1e-4 ? dd / dg : 0.3, 0.2, 1.3), 1 - Math.exp(-8 * dt));
      }
      /* the figure's own ground speed over the game clock (not the owner's `speed`, which some beats only approximate, e.g. a step that
         also crosses in z): a model plays its walk at this speed so its feet stay put */
      const tNow = FF.G && FF.G.t != null ? FF.G.t : null;
      if (f._x != null && wasVis && !s.snap && tNow != null && f._t != null) {
        const dT = tNow - f._t, dd = Math.hypot(s.x - f._x, s.z - f._z);
        if (dT > 1e-4 && dd < 2.5) f.vt = f.vt == null ? dd / dT : f.vt + (dd / dT - f.vt) * (1 - Math.exp(-dt / 0.06));
      } else f.vt = null;
      f._t = tNow;
      f._g = gx; f._x = s.x; f._z = s.z;
      const fresh = !wasVis || !!s.snap;                    // appearing or restarted: a model starts in its clip, no blend from a stale one
      /* body yaw: explicit, or from facing (turns pass through the camera side, yaw 0) */
      const want = s.yaw != null ? s.yaw : s.face > 0 ? Math.PI / 2 : s.face < 0 ? -Math.PI / 2 : 0;
      if (f.yaw == null || s.snap) f.yaw = want; else f.yaw = U.approach(f.yaw, want, (s.turnRate || 6.0) * dt);
      s.snap = false;
      g.position.set(s.x, s.y, s.z); g.rotation.y = f.yaw;
      /* a torch aimed at an explicit target tilts towards it (in the figure's forward plane) */
      if (s.torch.target) { const l = f.torchLens(), tg = s.torch.target; s.torch.pitchVis = Math.atan2(tg[1] - l.y, Math.hypot(tg[0] - l.x, tg[2] - l.z) + 1e-3) / D2R; } else s.torch.pitchVis = null;
      /* A16: the light sits where the 2D model puts the lens; the axis meets the lane (z 0) where the 2D axis reaches
         rabbit height (y 0.12) or 8 m. A target override (the culvert) aims it directly. (Worked out before the pose, so a model's
         torch arm can be aimed at it.) */
      const torchOn = !!(s.torch.on && f.props.torch);
      let lens = null, tgt = null;
      if (torchOn) {
        lens = f.torchLens(); const p = (s.torch.pitch || 0) * D2R, dir = s.face || (f.yaw > 0 ? 1 : -1);
        tgt = s.torch.target;
        if (!tgt) { const d = Math.sin(p) < -0.02 ? Math.min(8, (lens.y - 0.12) / -Math.sin(p)) : 8; tgt = [lens.x + Math.cos(p) * d * dir, lens.y + Math.sin(p) * d, 0]; }
      }
      f._tgt = tgt;
      if (f.model) { if (f.model.guard) guardPose(f, dt, fresh); else modelPoseLegacy(f, dt); } else poseStandIn(f, dt);
      if (f.torchHandle) {
        const on = torchOn;
        if (f._torchOn !== on) { f._torchOn = on; f.torchHandle.on(on); if (f.torchHandle.beam) f.torchHandle.beam(on); }
        if (on) {
          const half = s.torch.half || 13, R = FF.RULES.sight.torch, ep = emitterPos(f, _w);          // a model's light sits on its torch_emitter, the stand-in's on the 2D lens
          const lp = ep ? [ep.x, ep.y, ep.z] : [lens.x, lens.y, lens.z];
          f.torchHandle.set({ pos: lp, target: tgt, angle: half * D2R * (R.renderHalf / R.half), penumbra: half < 8 ? 0.15 : R.renderPenumbra,
            intensity: s.torch.intensity != null ? s.torch.intensity : 26, color: s.torch.color || '#e8edf2', distance: s.torch.distance || 14, decay: 1.6 });
        }
      }
    }
    for (const v of vans) v.frame(dt);
  },
  get figures() { return figures; },
  get vans() { return vans; },
  dispose() { for (const f of figures) f.dispose(); for (const v of vans) v.dispose(); figures.length = 0; vans.length = 0; },
  debug() { return { figures: figures.map(f => ({ role: f.role, x: +f.st.x.toFixed(2), z: +f.st.z.toFixed(2), anim: f.st.anim, visible: !!f.st.visible, torch: !!(f.st.torch && f.st.torch.on), model: !!f.model })), vans: vans.map(v => ({ x: +v.st.x.toFixed(2), z: +v.st.z.toFixed(2), visible: !!v.st.visible, lights: !!v.st.lights })) }; },
};
})();
