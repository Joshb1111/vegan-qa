/* FAR FIELD — FROZEN LOOK TEST COPY (7 Oct 2026; never edit: the game's live files are in ../js/). ff-scene.js: the look-test room. Simple matte boxes and cylinders, one key light from a high window out of
   frame (a soft-edged cone: one broad pool), its beam drawn as a volume through the haze, dust, the glowing low opening,
   the crate, the deep hall with its one amber lamp.
   FF.buildScene(scene, look) -> { lights, crate, beam, motes, update(), setTier(tier), apply(look) } */
'use strict';
(function () {
const T = THREE;

/* merge geometries (indexed or not) into one non-indexed geometry: one draw call per material */
function merge(geos) {
  let n = 0; const parts = geos.map(g => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return ng; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.computeBoundingSphere(); out.computeBoundingBox(); return out;
}
FF.merge = merge;
/* a box spanning [x0,x1] x [y0,y1] x [z0,z1] */
function boxG(x0, x1, y0, y1, z0, z1) { const g = new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
function cylG(r, h, x, y0, z, seg, rTop) { const g = new T.CylinderGeometry(rTop != null ? rTop : r, r, h, seg || 20, 1); g.translate(x, y0 + h / 2, z); return g; }

FF.buildScene = function (scene, L) {
  const M = {}; for (const k in L.materials) if (L.materials[k].roughness != null) M[k] = FF.mat(L.materials[k]);
  const metalLight = FF.mat({ color: '#454a50', roughness: 0.65, mottle: 0.03 });
  const buckets = new Map(); /* material|caster -> [geometries] for the static, merged world */
  let CAST = false; /* only things near the pool cast the key light's shadow; the tall background forms do not block the window */
  const add = (mat, g) => { const k = mat.uuid + (CAST ? '|c' : ''); if (!buckets.has(k)) buckets.set(k, { mat, cast: CAST, geos: [] }); buckets.get(k).geos.push(g); };
  const WALLZ = L.shafts.wallZ, WX = 2.6; // the back wall's face, and where it ends (the deep hall opens beyond)
  const O = L.opening, ox0 = O.x - O.w / 2, ox1 = O.x + O.w / 2, BX0 = O.x - 0.8, BZ = -0.45, TZ = BZ - O.depth, BH = 1.45;

  /* ---------- floor: the lane's concrete slab reaching back to the wall, a front edge dropping to a trench, the hall floor ---------- */
  add(M.floor, boxG(-30, 30, -0.5, 0, WALLZ, 6.0));
  add(M.floor, boxG(WX, 60, -0.5, 0, -45, WALLZ));

  /* ---------- the tall back wall: concrete panels with dark seams, a kerb, joints, a louvred vent ---------- */
  add(M.wallDark, boxG(-30, WX, 0, 12, WALLZ - 0.7, WALLZ - 0.05));
  for (let x = -30.2; x < WX; x += 3.2) add(M.wall, boxG(x + 0.016, Math.min(WX, x + 3.2) - 0.016, 0.0, 12, WALLZ - 0.3, WALLZ));
  add(M.wall, boxG(-30, BX0, 0, 0.10, WALLZ, WALLZ + 0.12));
  for (let y = 4.25; y < 12; y += 3.9) add(M.wallDark, boxG(-30, WX, y, y + 0.03, WALLZ - 0.05, WALLZ + 0.004));
  { const vx = -1.1, vy = 3.15, vw = 0.95, vh = 0.62;
    add(metalLight, boxG(vx - vw / 2, vx + vw / 2, vy, vy + 0.05, WALLZ, WALLZ + 0.05)); add(metalLight, boxG(vx - vw / 2, vx + vw / 2, vy + vh - 0.05, vy + vh, WALLZ, WALLZ + 0.05));
    add(metalLight, boxG(vx - vw / 2, vx - vw / 2 + 0.05, vy, vy + vh, WALLZ, WALLZ + 0.05)); add(metalLight, boxG(vx + vw / 2 - 0.05, vx + vw / 2, vy, vy + vh, WALLZ, WALLZ + 0.05));
    add(M.wallDark, boxG(vx - vw / 2 + 0.05, vx + vw / 2 - 0.05, vy + 0.05, vy + vh - 0.05, WALLZ - 0.02, WALLZ + 0.001));
    for (let i = 0; i < 7; i++) { const g = boxG(vx - vw / 2 + 0.05, vx + vw / 2 - 0.05, -0.012, 0.012, -0.035, 0.035); g.rotateX(-0.6); g.translate(0, vy + 0.1 + i * 0.07, WALLZ + 0.03); add(metalLight, g); } }

  CAST = false;
  /* ---------- left end: a massive square column ---------- */
  add(M.wall, boxG(-7.6, -5.6, 0, 12, WALLZ, 0.9));
  add(M.wall, boxG(-7.7, -5.5, 0, 0.18, WALLZ, 1.0));

  CAST = true;
  /* ---------- the block with the low opening, jutting from the wall to just behind the lane ---------- */
  add(M.wall, boxG(BX0, ox0, 0, BH, WALLZ, BZ)); add(M.wall, boxG(ox1, WX, 0, BH, WALLZ, BZ));
  add(M.wall, boxG(ox0, ox1, O.h, BH, WALLZ, BZ)); add(M.wall, boxG(ox0, ox1, 0, O.h, WALLZ, TZ - 0.02));
  add(M.wallDark, boxG(BX0 - 0.05, WX, BH, BH + 0.1, WALLZ, BZ + 0.05));
  { const g = new T.PlaneGeometry(O.w, O.h, 1, 1); g.translate(O.x, O.h / 2, TZ);
    const c = new Float32Array(12), gi = O.glowIntensity, gc = FF.lin(O.glow);
    for (let i = 0; i < 4; i++) { const y = g.attributes.position.getY(i), k = (y < O.h / 2 ? 1.0 : 0.5) * gi; c[i * 3] = gc.r * k; c[i * 3 + 1] = gc.g * k; c[i * 3 + 2] = gc.b * k; }
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    const m = FF.glow([1, 1, 1]); m.vertexColors = true; const mesh = new T.Mesh(g, m); mesh.name = 'openingGlow'; scene.add(mesh); }

  CAST = true;
  /* ---------- pipes: a big run along the wall with an elbow down, uprights at the wall's end ---------- */
  { const R = 0.25, py = 3.45, pz = -4.4, ex = -0.25;
    const run = new T.CylinderGeometry(R, R, 30 + ex, 22, 1); run.rotateZ(Math.PI / 2); run.translate((-30 + ex) / 2, py, pz); add(M.metal, run);
    const elbow = new T.TorusGeometry(0.5, R, 14, 22, Math.PI / 2); elbow.translate(ex, py - 0.5, pz); add(M.metal, elbow);
    add(M.metal, cylG(R, 0.6, ex + 0.5, py - 1.1, pz, 22)); add(M.metal, cylG(R + 0.06, 0.08, ex + 0.5, py - 1.16, pz, 22));
    add(M.metal, cylG(R + 0.05, 0.06, ex + 0.5, py - 0.62, pz, 22));
    for (let x = -26.5; x < -1; x += 4.6) { add(M.metal, boxG(x - 0.06, x + 0.06, py - 0.05, py + 0.32, WALLZ, pz)); const fl = new T.CylinderGeometry(R + 0.04, R + 0.04, 0.07, 22); fl.rotateZ(Math.PI / 2); fl.translate(x + 0.5, py, pz); add(M.metal, fl); }
    add(M.metal, cylG(0.07, 12, WX + 0.18, 0, WALLZ + 0.2, 10)); add(M.metal, cylG(0.05, 12, WX + 0.42, 0, WALLZ + 0.25, 10)); }

  /* ---------- hanging cables ---------- */
  CAST = true;
  { const mk = (pts, r) => { const c = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[1], p[2]))); add(M.metal, new T.TubeGeometry(c, 60, r, 5, false)); };
    mk([[-3.6, 12, -4.75], [-3.45, 6, -4.6], [-3.15, 1.2, -4.45], [-2.85, 0.12, -4.3], [-2.4, 0.012, -4.1], [-1.7, 0.012, -4.2]], 0.016);
    mk([[-3.9, 12, -4.8], [-3.7, 5, -4.75], [-3.45, 0.8, -4.65], [-3.2, 0.012, -4.55], [-2.4, 0.012, -4.7]], 0.012);
    mk([[0.9, 12, -3.0], [0.95, 7, -3.0], [0.9, 4.6, -3.0]], 0.012); }

  CAST = false;
  /* ---------- the deep hall to the right: a raised platform with tanks and a railing, pillars, a far wall ---------- */
  const HP = { x0: 2.7, x1: 9.1, z0: -12.5, z1: -8.5, h: 2.3 };
  add(M.hall, boxG(HP.x0, HP.x1, 0, HP.h, HP.z0, HP.z1));
  for (const tx of [3.9, 5.5]) { add(M.hall, cylG(0.55, 1.35, tx, HP.h, -10.7, 24)); add(M.hall, cylG(0.57, 0.08, tx, HP.h + 1.32, -10.7, 24)); }
  add(M.hall, boxG(4.45, 4.95, HP.h, HP.h + 0.7, -9.7, -9.2));
  for (let x = HP.x0 + 0.1; x <= HP.x1 - 0.05; x += 0.98) add(M.metal, boxG(x - 0.025, x + 0.025, HP.h, HP.h + 1.0, HP.z1 - 0.12, HP.z1 - 0.07));
  add(M.metal, boxG(HP.x0 + 0.05, HP.x1, HP.h + 0.97, HP.h + 1.02, HP.z1 - 0.13, HP.z1 - 0.06)); add(M.metal, boxG(HP.x0 + 0.05, HP.x1, HP.h + 0.5, HP.h + 0.53, HP.z1 - 0.12, HP.z1 - 0.07));
  add(M.metal, cylG(0.04, 9, 6.9, HP.h, -11.4, 8)); add(M.metal, cylG(0.04, 9, 7.3, HP.h, -11.4, 8));
  add(M.hall, boxG(12.0, 13.4, 0, 30, -18, -16.6)); add(M.hall, boxG(19.0, 20.4, 0, 30, -22, -20.6));
  add(M.hall, boxG(-10, 60, 0, 40, -36, -34)); add(M.hall, boxG(9.0, 40, 0, 6, -25, -23));
  add(M.hall, boxG(WX, WX + 0.4, 0, 12, -8.3, WALLZ)); // the wall's return into the hall

  for (const [tx, tz] of [[3.95, -6.0], [5.15, -6.4]]) { add(M.metal, cylG(0.48, 1.55, tx, 0, tz, 28)); add(M.metal, cylG(0.5, 0.07, tx, 1.53, tz, 28)); add(M.metal, cylG(0.22, 0.12, tx, 1.6, tz, 16)); }
  add(M.metal, boxG(1.6, 16, 3.3, 3.62, -1.35, -1.05)); add(M.metal, boxG(1.6, 16, 3.24, 3.3, -1.42, -0.98)); add(M.metal, boxG(1.6, 16, 3.62, 3.68, -1.42, -0.98));
  for (const hx of [3.2, 7.8, 12.4]) add(M.metal, boxG(hx - 0.04, hx + 0.04, 3.68, 12, -1.24, -1.16));
  /* ---------- right end: the tall bulkhead that closes the walkway ---------- */
  add(M.wall, boxG(9.2, 11.0, 0, 12, -4.2, 1.2)); add(M.wallDark, boxG(9.1, 11.1, 0, 0.18, -4.2, 1.25));

  CAST = true;
  /* ---------- planks on the floor, for scale ---------- */
  { const pl = (x, z, len, rot) => { const g = boxG(-len / 2, len / 2, 0, 0.022, -0.075, 0.075); g.rotateY(rot); g.translate(x, 0, z); add(M.crate, g); };
    pl(3.9, 0.35, 1.9, 0.05); pl(4.1, 0.6, 1.7, -0.04); pl(4.7, 0.92, 1.5, 0.12); pl(-3.6, -2.9, 1.3, -0.3); pl(-3.3, -3.25, 1.0, -0.2); }

  CAST = false;
  /* ---------- the near edge: foreground silhouettes on the trench floor ---------- */
  { const gg = [];
    gg.push(boxG(-0.7, 0.7, 0, 0.05, -0.03, 0.03), boxG(-0.7, 0.7, 1.55, 1.6, -0.03, 0.03), boxG(-0.7, 0.7, 0.8, 0.83, -0.02, 0.02));
    for (let i = 0; i <= 9; i++) { const x = -0.7 + i * (1.4 / 9); gg.push(boxG(x - 0.018, x + 0.018, 0, 1.6, -0.02, 0.02)); }
    const g = merge(gg); g.scale(0.7, 0.72, 0.7); g.rotateX(-0.24); g.rotateY(0.3); g.translate(-2.9, 0, 2.7); add(M.metal, g);
    const g2 = merge(gg.map(x => x.clone())); g2.scale(0.7, 0.66, 0.7); g2.rotateX(-0.12); g2.rotateY(-0.1); g2.translate(-3.75, 0, 2.95); add(M.metal, g2); }
  { const vx = 3.25, vz = 3.0;
    add(M.metal, cylG(0.13, 0.62, vx, 0, vz, 16)); add(M.metal, cylG(0.17, 0.08, vx, 0.5, vz, 16));
    const wheel = new T.TorusGeometry(0.24, 0.025, 8, 28); wheel.rotateX(Math.PI / 2); wheel.translate(vx, 0.78, vz); add(M.metal, wheel);
    add(M.metal, cylG(0.025, 0.2, vx, 0.6, vz, 8));
    for (let i = 0; i < 4; i++) { const s = boxG(-0.24, 0.24, -0.012, 0.012, -0.012, 0.012); s.rotateY(i * Math.PI / 4); s.translate(vx, 0.78, vz); add(M.metal, s); }
    const pipe = new T.CylinderGeometry(0.13, 0.13, 3, 16); pipe.rotateZ(Math.PI / 2); pipe.translate(vx + 1.5, 0.14, vz); add(M.metal, pipe); }

  /* ---------- build the merged static meshes ---------- */
  for (const b of buckets.values()) { const mesh = new T.Mesh(merge(b.geos), b.mat); mesh.castShadow = b.cast; mesh.receiveShadow = true; scene.add(mesh); }

  /* ---------- background: a fogged box so every pixel gets haze, never the clear colour ---------- */
  { const m = FF.mat({ color: '#101317', roughness: 1, noAO: true }); m.side = T.BackSide;
    scene.add(new T.Mesh(boxG(-80, 90, -6, 70, -70, 40), m)); }

  /* ---------- the crate: planks around a dark core; its own group, it moves ---------- */
  const C = FF.LEVEL.crate, crate = new T.Group(); crate.name = 'crate';
  { const w = C.w, h = C.h, dd = C.d, gap = 0.012, t = 0.022, pl = [], core = [boxG(-w / 2 + 0.01, w / 2 - 0.01, 0.01, h - 0.01, -dd / 2 + 0.01, dd / 2 - 0.01)];
    const rows = 3, ph = (h - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) { const y0 = r * (ph + gap), y1 = y0 + ph;
      pl.push(boxG(-w / 2, w / 2, y0, y1, dd / 2 - t, dd / 2), boxG(-w / 2, w / 2, y0, y1, -dd / 2, -dd / 2 + t));
      pl.push(boxG(-w / 2, -w / 2 + t, y0, y1, -dd / 2, dd / 2), boxG(w / 2 - t, w / 2, y0, y1, -dd / 2, dd / 2)); }
    for (let r = 0; r < 4; r++) { const z0 = -dd / 2 + r * (dd / 4), z1 = z0 + dd / 4 - gap; pl.push(boxG(-w / 2, w / 2, h - t, h, z0, z1)); }
    const post = 0.05, e = 0.004;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const xr = sx > 0 ? [w / 2 - post, w / 2 + e] : [-w / 2 - e, -w / 2 + post], zr = sz > 0 ? [dd / 2 - post, dd / 2 + e] : [-dd / 2 - e, -dd / 2 + post];
      pl.push(boxG(xr[0], xr[1], 0, h + e, zr[0], zr[1]));
    }
    const mesh = new T.Mesh(merge(pl), M.crate); mesh.castShadow = mesh.receiveShadow = true; crate.add(mesh);
    const coreM = new T.Mesh(merge(core), FF.mat({ color: '#1e1c1a', roughness: 1 })); coreM.castShadow = true; crate.add(coreM); }
  scene.add(crate);

  /* ---------- the amber lamp: the one warm accent ---------- */
  const lampPos = new T.Vector3(4.7, HP.h + 0.82, -9.18);
  const ac = FF.lin(L.amber.color).multiplyScalar(L.amber.intensity);
  const lamp = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), FF.glow([ac.r, ac.g, ac.b], false)); lamp.position.copy(lampPos); scene.add(lamp);
  const halo = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.4)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new T.CanvasTexture(cv); const m = new T.SpriteMaterial({ map: tex, color: FF.lin(L.amber.color).multiplyScalar(0.7), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const s = new T.Sprite(m); s.scale.set(0.8, 0.8, 1); s.position.copy(lampPos); s.position.z += 0.05; scene.add(s); return s; })();

  /* ---------- lights ---------- */
  const lights = {}, K = L.key, d = new T.Vector3(K.dir[0], K.dir[1], K.dir[2]).normalize();
  const pool = new T.Vector3(K.poolCenter[0], K.poolCenter[1], K.poolCenter[2]), FAR = 70;
  const edgeR = Math.hypot(K.halfDepth, K.halfWidth) * 1.05;      // the cone just contains the rectangular beam (the mask shapes it)
  { const key = new T.SpotLight(FF.lin(K.color), K.intensity, 0, Math.atan(edgeR / FAR), 0.02, 1);
    key.position.copy(pool).addScaledVector(d, -FAR); key.target.position.copy(pool); scene.add(key.target);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; key.shadow.radius = K.shadowSoftness;
    key.shadow.camera.near = FAR - 16; key.shadow.camera.far = FAR + 8;
    scene.add(key); lights.key = key; }
  { const h = new T.HemisphereLight(FF.lin(L.ambient.sky), FF.lin(L.ambient.ground), L.ambient.intensity); scene.add(h); lights.hemi = h; }
  { const f = new T.DirectionalLight(FF.lin(L.fill.color), L.fill.intensity); f.position.set(-L.fill.dir[0], -L.fill.dir[1], -L.fill.dir[2]).multiplyScalar(10); scene.add(f); lights.fill = f; }
  { const b = new T.PointLight(FF.lin(L.bounce.color), L.bounce.intensity, L.bounce.distance, 2); b.position.set(pool.x + 0.3, 1.1, pool.z - 0.3); scene.add(b); lights.bounce = b; }
  { const s = new T.SpotLight(FF.lin(O.glow), O.spill, O.spillDistance, 0.72, 1.0, 2); s.position.set(O.x, O.h * 0.62, TZ + 0.12); s.target.position.set(O.x, 0, BZ + 1.6); scene.add(s.target); scene.add(s); lights.opening = s; }
  { const a = new T.PointLight(FF.lin(L.amber.color), L.amber.light, 3.0, 2); a.position.copy(lampPos).add(new T.Vector3(0, 0.05, 0.25)); scene.add(a); lights.amber = a; }

  /* ---------- the beam as a volume: for each pixel of a cylinder around the cone, the view ray's chord through the beam
     (clipped by the floor, the wall and a ceiling height) is sampled a few times: soft radial falloff x the streak
     pattern that also falls on the floor, attenuated by the haze. No depth texture, no extra pass. ---------- */
  const TOPY = 10.5;
  const beamMat = new T.ShaderMaterial({
    uniforms: Object.assign({ uCol: { value: FF.lin(L.shafts.color) }, uDens: { value: L.shafts.density },
      uWallZ: { value: WALLZ }, uTopY: { value: TOPY }, uFogD: { value: L.fog.density }, uBase: { value: L.shafts.base } }, FF.U),
    defines: { SAMPLES: 10 },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: FF.GLSL_KEY + `
      uniform vec3 uCol; uniform float uDens, uWallZ, uTopY, uFogD, uBase; varying vec3 vW;
      void main(){
        vec3 o = cameraPosition, v = normalize(vW - o), oc = o - uFFKeyA;
        float t0 = 0.0, t1 = 1e4;
        float a1 = dot(v, uFFKeyE1), c1 = dot(oc, uFFKeyE1), a2 = dot(v, uFFKeyE2), c2 = dot(oc, uFFKeyE2);
        if (abs(a1) > 1e-5) { float ta = (-uFFKeyR.x - c1) / a1, tb = (uFFKeyR.x - c1) / a1; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); } else if (abs(c1) > uFFKeyR.x) discard;
        if (abs(a2) > 1e-5) { float ta = (-uFFKeyR.y - c2) / a2, tb = (uFFKeyR.y - c2) / a2; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); } else if (abs(c2) > uFFKeyR.y) discard;
        if (v.y < 0.0) t1 = min(t1, (0.0 - o.y) / v.y); else t1 = min(t1, (uTopY - o.y) / v.y);
        if (v.z < 0.0) t1 = min(t1, (uWallZ - o.z) / v.z);
        if (t1 <= t0) discard;
        float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        float acc = 0.0;
        for (int i = 0; i < SAMPLES; i++) {
          float t = mix(t0, t1, (float(i) + jit) / float(SAMPLES));
          vec3 p = o + v * t;
          float prof = ffKeyMask(p);
          float hz = smoothstep(uTopY, uTopY - 4.0, p.y) * smoothstep(0.0, 0.7, p.y);
          acc += prof * hz * (uBase + ffBands(p)) * exp(-uFogD * max(t - 6.0, 0.0));
        }
        float L = uDens * acc / float(SAMPLES) * (t1 - t0);
        gl_FragColor = vec4(uCol * L, 1.0);
      }`,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation,
    depthWrite: false, depthTest: true, transparent: true, side: T.FrontSide,
  });
  const beam = (() => {
    const e1 = FF.U.uFFKeyE1.value.clone(), e2 = FF.U.uFFKeyE2.value.clone(), up = d.clone().negate(), len = TOPY / -d.y + 2;
    if (e1.clone().cross(up).dot(e2) < 0) e2.negate();
    const g = new T.BoxGeometry(K.halfDepth * 2.04, len, K.halfWidth * 2.04); g.translate(0, len / 2 - 1.2, 0);
    const m = new T.Mesh(g, beamMat); m.matrixAutoUpdate = false;
    m.matrix.makeBasis(e1, up, e2).setPosition(pool); m.updateMatrixWorld(true);
    m.renderOrder = 10; m.frustumCulled = false; m.name = 'beam'; scene.add(m); return m;
  })();

  /* ---------- dust drifting through the light (high tier) ---------- */
  const motes = (() => {
    const N = L.shafts.motes, P = new Float32Array(N * 3), R = new Float32Array(N), e1 = FF.U.uFFKeyE1.value, e2 = FF.U.uFFKeyE2.value;
    let i = 0, guard = 0;
    while (i < N && guard++ < N * 60) {
      const y = 0.05 + Math.random() * 4.6;
      const c = pool.clone().addScaledVector(e1, (Math.random() * 2 - 1) * K.halfDepth * 0.9).addScaledVector(e2, (Math.random() * 2 - 1) * K.halfWidth * 0.9);
      const t = (y - c.y) / -d.y, p = c.addScaledVector(d, -t); if (p.z < WALLZ + 0.05 || p.z > 3) continue;
      P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z; R[i] = Math.random(); i++;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('rnd', new T.BufferAttribute(R, 1));
    const m = new T.ShaderMaterial({
      uniforms: Object.assign({ uCol: { value: FF.lin(L.shafts.color).multiplyScalar(1.4) }, uPx: { value: 1 } }, FF.U),
      vertexShader: FF.GLSL_KEY + `attribute float rnd; uniform float uPx; varying float vA;
        void main(){ vec3 p = position; float t = uFFTime * (0.15 + 0.2 * rnd) + rnd * 40.0;
          p += vec3(sin(t * 0.7) * 0.05, -mod(uFFTime * 0.012 + rnd * 3.0, 0.25) + sin(t) * 0.03, cos(t * 0.6) * 0.05);

          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (1.1 + 1.4 * fract(rnd * 7.3)) * (7.0 / -mv.z);
          vA = (0.3 + 0.7 * fract(rnd * 13.7)) * (0.6 + 0.4 * sin(t * 2.3)) * ffKeyMask(p) * (0.25 + ffBands(p)); }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(uCol * a * vA * 0.45, 1.0); }`,
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true,
    });
    const p = new T.Points(g, m); p.frustumCulled = false; p.renderOrder = 11; scene.add(p); return p;
  })();

  /* contact-shadow boxes (index 0 is the crate, it moves): the wall's foot, the column, the block, the bulkhead, the platform */
  FF.setAOBox(1, [-13.7, 6, WALLZ - 0.5], [16.3, 6, 0.5], L.ao.objects, 0.6);
  FF.setAOBox(2, [-6.6, 6, (WALLZ + 0.9) / 2], [1.0, 6, (0.9 - WALLZ) / 2], L.ao.objects, 0.45);
  FF.setAOBox(3, [(BX0 + WX) / 2, BH / 2, (WALLZ + BZ) / 2], [(WX - BX0) / 2, BH / 2, (BZ - WALLZ) / 2], L.ao.objects, 0.4);
  FF.setAOBox(4, [10.1, 6, -1.5], [0.9, 6, 2.7], L.ao.objects, 0.45);
  FF.setAOBox(5, [(HP.x0 + HP.x1) / 2, HP.h / 2, (HP.z0 + HP.z1) / 2], [(HP.x1 - HP.x0) / 2, HP.h / 2, (HP.z1 - HP.z0) / 2], L.ao.objects, 0.5);

  function setTier(t) {
    const k = lights.key, size = t.shadowMap;
    if (k.shadow.mapSize.x !== size) { k.shadow.mapSize.set(size, size); if (k.shadow.map) { k.shadow.map.dispose(); k.shadow.map = null; } }
    k.shadow.radius = Math.max(1, L.key.shadowSoftness * size / 2048);
    lights.bounce.visible = !!t.bounce; lights.amber.visible = !!t.amberLight; motes.visible = !!t.motes;
    beamMat.defines.SAMPLES = t.beamSamples; beamMat.needsUpdate = true;
  }

  return {
    lights, crate, beam, motes, halo, setTier, pool,
    update(dt, t, pr) { motes.material.uniforms.uPx.value = pr; },
    apply(L2) { /* push intensities from the config (live tuning) */
      lights.key.intensity = L2.key.intensity; lights.key.color.copy(FF.lin(L2.key.color));  lights.hemi.intensity = L2.ambient.intensity;
      lights.hemi.color.copy(FF.lin(L2.ambient.sky)); lights.hemi.groundColor.copy(FF.lin(L2.ambient.ground));
      lights.fill.intensity = L2.fill.intensity; lights.bounce.intensity = L2.bounce.intensity; lights.opening.intensity = L2.opening.spill; lights.amber.intensity = L2.amber.light;
      beamMat.uniforms.uDens.value = L2.shafts.density; beamMat.uniforms.uBase.value = L2.shafts.base; beamMat.uniforms.uCol.value.copy(FF.lin(L2.shafts.color));  beamMat.uniforms.uFogD.value = L2.fog.density;
    },
  };
};
})();
