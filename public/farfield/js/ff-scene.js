/* FAR FIELD — ff-scene.js: the look-test room. Simple matte boxes and cylinders, one key light through a slatted
   skylight, shafts, dust, the glowing low opening, the crate, the deep hall with its one amber lamp.
   FF.buildScene(scene, look) -> { lights, crate, update(dt, t), setTier(tier), shafts, motes } */
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
  const metalLight = FF.mat({ color: '#4a4f55', roughness: 0.6, mottle: 0.03 });
  const buckets = new Map(); /* material -> [geometries] for the static, merged world */
  const add = (mat, g, opt) => { if (!buckets.has(mat)) buckets.set(mat, { geos: [], opt: opt || {} }); buckets.get(mat).geos.push(g); };
  const WALLZ = -2.5;

  /* ---------- floor: the lane's concrete slab, a front edge dropping to a lower trench, the deep hall floor ---------- */
  add(M.floor, boxG(-30, 30, -0.5, 0, WALLZ, 1.5));
  add(M.wallDark, boxG(-30, 30, -0.62, -0.5, 1.5, 14)); // trench floor, darker, near the lens
  add(M.floor, boxG(5.8, 60, -0.5, 0, -45, WALLZ));
  add(M.wall, boxG(-30, 30, -0.04, 0.0, 1.46, 1.5)); // a thin lip on the slab's edge that catches light

  /* ---------- the tall back wall: concrete panels with dark seams, a kerb, a louvred vent ---------- */
  add(M.wallDark, boxG(-30, 5.8, 0, 12, WALLZ - 0.7, WALLZ - 0.05)); // backing, shows through the seams
  for (let x = -30; x < 5.8; x += 3.2) add(M.wall, boxG(x + 0.018, Math.min(5.8, x + 3.2) - 0.018, 0.0, 12, WALLZ - 0.3, WALLZ));
  add(M.wall, boxG(-30, 5.8, 0, 0.10, WALLZ, WALLZ + 0.12)); // kerb along the base
  for (let y = 4.2; y < 12; y += 3.9) add(M.wallDark, boxG(-30, 5.8, y, y + 0.03, WALLZ - 0.05, WALLZ + 0.004)); // horizontal joints
  { const vx = -1.4, vy = 3.05, vw = 0.95, vh = 0.62; // vent: frame + slats
    add(metalLight, boxG(vx - vw / 2, vx + vw / 2, vy, vy + 0.05, WALLZ, WALLZ + 0.05)); add(metalLight, boxG(vx - vw / 2, vx + vw / 2, vy + vh - 0.05, vy + vh, WALLZ, WALLZ + 0.05));
    add(metalLight, boxG(vx - vw / 2, vx - vw / 2 + 0.05, vy, vy + vh, WALLZ, WALLZ + 0.05)); add(metalLight, boxG(vx + vw / 2 - 0.05, vx + vw / 2, vy, vy + vh, WALLZ, WALLZ + 0.05));
    add(M.wallDark, boxG(vx - vw / 2 + 0.05, vx + vw / 2 - 0.05, vy + 0.05, vy + vh - 0.05, WALLZ - 0.02, WALLZ + 0.001));
    for (let i = 0; i < 7; i++) { const g = boxG(vx - vw / 2 + 0.05, vx + vw / 2 - 0.05, -0.012, 0.012, -0.035, 0.035); g.rotateX(-0.6); g.translate(0, vy + 0.1 + i * 0.07, WALLZ + 0.03); add(metalLight, g); } }

  /* ---------- left end: a massive square column ---------- */
  add(M.wall, boxG(-10.0, -7.9, 0, 12, WALLZ, 0.9));
  add(M.wall, boxG(-10.1, -7.8, 0, 0.18, WALLZ, 1.0)); // its plinth

  /* ---------- the block with the low opening (a culvert mouth glowing from beyond) ---------- */
  const O = L.opening, ox0 = O.x - O.w / 2, ox1 = O.x + O.w / 2, BZ = -0.45, TZ = BZ - O.depth;
  add(M.wall, boxG(2.6, ox0, 0, 2.1, WALLZ, BZ)); add(M.wall, boxG(ox1, 5.8, 0, 2.1, WALLZ, BZ));
  add(M.wall, boxG(ox0, ox1, O.h, 2.1, WALLZ, BZ)); add(M.wall, boxG(ox0, ox1, 0, O.h, WALLZ, TZ - 0.02));
  add(M.wallDark, boxG(2.55, 5.85, 2.1, 2.22, WALLZ, BZ + 0.05)); // a cap that throws a dark line
  /* the light beyond: an unlit HDR plane at the end of the short tunnel, brighter low down */
  { const g = new T.PlaneGeometry(O.w, O.h, 1, 1); g.translate(O.x, O.h / 2, TZ);
    const c = new Float32Array(12), gi = L.opening.glowIntensity, gc = FF.lin(O.glow);
    for (let i = 0; i < 4; i++) { const y = g.attributes.position.getY(i), k = (y < O.h / 2 ? 1.0 : 0.55) * gi; c[i * 3] = gc.r * k; c[i * 3 + 1] = gc.g * k; c[i * 3 + 2] = gc.b * k; }
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    const m = FF.glow([1, 1, 1]); m.vertexColors = true; const mesh = new T.Mesh(g, m); mesh.name = 'openingGlow'; scene.add(mesh); }

  /* ---------- pipes: a big run along the wall with an elbow down (panel 2's shape language), uprights at the wall's end ---------- */
  { const R = 0.25, py = 3.35, pz = -1.95, ex = 0.6;
    const run = new T.CylinderGeometry(R, R, 30 + ex, 22, 1); run.rotateZ(Math.PI / 2); run.translate((-30 + ex) / 2, py, pz); add(M.metal, run);
    const elbow = new T.TorusGeometry(0.5, R, 14, 22, Math.PI / 2); elbow.rotateZ(-Math.PI / 2); elbow.translate(ex, py - 0.5, pz); add(M.metal, elbow);
    add(M.metal, cylG(R, 0.8, ex + 0.5, py - 1.3, pz, 22)); add(M.metal, cylG(R + 0.06, 0.08, ex + 0.5, py - 1.36, pz, 22));
    add(M.metal, cylG(R + 0.05, 0.06, ex + 0.5, py - 0.62, pz, 22));
    for (let x = -26; x < 0; x += 4.6) { add(M.metal, boxG(x - 0.06, x + 0.06, py - 0.05, py + 0.32, WALLZ, pz)); const fl = new T.CylinderGeometry(R + 0.04, R + 0.04, 0.07, 22); fl.rotateZ(Math.PI / 2); fl.translate(x + 0.5, py, pz); add(M.metal, fl); }
    add(M.metal, cylG(0.07, 12, 6.0, 0, -2.3, 10)); add(M.metal, cylG(0.05, 12, 6.25, 0, -2.25, 10));
    add(M.metal, cylG(0.05, 12, -6.6, 2.0, -2.25, 10)); }

  /* ---------- hanging cables ---------- */
  { const mk = (pts, r) => { const c = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[1], p[2]))); add(M.metal, new T.TubeGeometry(c, 60, r, 5, false)); };
    mk([[-6.2, 12, -2.3], [-6.05, 6, -2.1], [-5.75, 1.2, -1.95], [-5.45, 0.12, -1.8], [-5.0, 0.012, -1.6], [-4.3, 0.012, -1.65]], 0.016);
    mk([[-6.5, 12, -2.35], [-6.3, 5, -2.25], [-6.05, 0.8, -2.15], [-5.8, 0.012, -2.05], [-5.0, 0.012, -2.2]], 0.012);
    mk([[2.2, 12, -1.0], [2.25, 7, -1.0], [2.2, 4.2, -1.0]], 0.012); }

  /* ---------- the deep hall to the right: a raised platform with tanks and a railing, pillars, a far wall ---------- */
  add(M.hall, boxG(7.0, 15.0, 0, 2.3, -11, -7));
  add(M.hall, cylG(0.55, 1.35, 8.7, 2.3, -9.2, 24)); add(M.hall, cylG(0.57, 0.08, 8.7, 3.62, -9.2, 24));
  add(M.hall, cylG(0.55, 1.35, 10.3, 2.3, -9.2, 24)); add(M.hall, cylG(0.57, 0.08, 10.3, 3.62, -9.2, 24));
  add(M.hall, boxG(9.25, 9.75, 2.3, 3.0, -8.2, -7.7)); // a small cabinet the lamp sits on
  for (let x = 7.1; x <= 14.95; x += 0.98) add(M.metal, boxG(x - 0.025, x + 0.025, 2.3, 3.3, -7.12, -7.07));
  add(M.metal, boxG(7.05, 15.0, 3.27, 3.32, -7.13, -7.06)); add(M.metal, boxG(7.05, 15.0, 2.8, 2.83, -7.12, -7.07));
  add(M.metal, cylG(0.04, 9, 11.6, 2.3, -9.8, 8)); add(M.metal, cylG(0.04, 9, 12.0, 2.3, -9.8, 8));
  add(M.hall, boxG(16.0, 17.4, 0, 30, -17, -15.6)); add(M.hall, boxG(23.0, 24.4, 0, 30, -21, -19.6));
  add(M.hall, boxG(-10, 60, 0, 40, -36, -34)); add(M.hall, boxG(12.0, 40, 0, 6, -24, -22)); // far wall, a long low structure
  add(M.hall, boxG(5.8, 7.2, 0, 12, -6, WALLZ)); // the wall's return into the hall

  /* ---------- right end: the tall bulkhead that closes the walkway ---------- */
  add(M.wall, boxG(10.2, 12.0, 0, 12, -3.5, 1.4)); add(M.wallDark, boxG(10.1, 12.1, 0, 0.18, -3.5, 1.5));

  /* ---------- planks on the floor, debris for scale ---------- */
  { const pl = (x, z, len, rot) => { const g = boxG(-len / 2, len / 2, 0, 0.022, -0.075, 0.075); g.rotateY(rot); g.translate(x, 0, z); add(M.crate, g); };
    pl(6.4, 0.55, 1.9, 0.05); pl(6.6, 0.78, 1.7, -0.04); pl(7.2, 1.05, 1.5, 0.12); pl(-6.2, 0.9, 1.2, -0.3); }

  /* ---------- the near edge: foreground silhouettes on the trench floor, so the frame has depth in front of the lane ---------- */
  { const gx = -6.6, gz = 2.6, gm = M.metal, gg = [];   // a leaning grate
    gg.push(boxG(-0.7, 0.7, 0, 0.05, -0.03, 0.03), boxG(-0.7, 0.7, 1.55, 1.6, -0.03, 0.03), boxG(-0.7, 0.7, 0.8, 0.83, -0.02, 0.02));
    for (let i = 0; i <= 9; i++) { const x = -0.7 + i * (1.4 / 9); gg.push(boxG(x - 0.018, x + 0.018, 0, 1.6, -0.02, 0.02)); }
    const g = merge(gg); g.rotateX(-0.22); g.rotateY(0.25); g.translate(gx, -0.6, gz); add(gm, g);
    const g2 = merge(gg.map(x => x.clone())); g2.rotateX(-0.16); g2.rotateY(-0.1); g2.translate(gx + 1.0, -0.6, gz + 0.25); add(gm, g2); }
  { const vx = 7.6, vz = 3.1; // a valve on a riser
    add(M.metal, cylG(0.13, 1.25, vx, -0.6, vz, 16)); add(M.metal, cylG(0.17, 0.08, vx, 0.5, vz, 16));
    const wheel = new T.TorusGeometry(0.24, 0.025, 8, 28); wheel.rotateX(Math.PI / 2); wheel.translate(vx, 0.78, vz); add(M.metal, wheel);
    add(M.metal, cylG(0.025, 0.2, vx, 0.6, vz, 8));
    for (let i = 0; i < 4; i++) { const s = boxG(-0.24, 0.24, -0.012, 0.012, -0.012, 0.012); s.rotateY(i * Math.PI / 4); s.translate(vx, 0.78, vz); add(M.metal, s); }
    const pipe = new T.CylinderGeometry(0.13, 0.13, 3, 16); pipe.rotateZ(Math.PI / 2); pipe.translate(vx + 1.5, -0.25, vz); add(M.metal, pipe); }
  add(M.wallDark, boxG(-2.6, -1.2, -0.62, 0.05, 3.4, 4.3)); // a low block near the lens, mostly below frame

  /* ---------- the roof with the skylight (out of frame; it shapes the key light) ---------- */
  const K = L.key, d = new T.Vector3(K.dir[0], K.dir[1], K.dir[2]).normalize(), Yc = K.ceilingY;
  const tF = Yc / -d.y, offX = -d.x * tF, offZ = -d.z * tF;          // from a floor point back up to the roof along the light
  const wallReach = 6.0;                                                // the beam also paints the back wall up to this height
  const sky = { x0: K.sky.x0 + offX, x1: K.sky.x1 + offX, z0: Math.max(WALLZ + 0.02, K.sky.z0 + offZ - wallReach * (-d.z / -d.y)), z1: K.sky.z1 + offZ };
  { const ceil = [], P = 30;
    ceil.push(boxG(-P, sky.x0, Yc, Yc + 0.6, -12, 16), boxG(sky.x1, P, Yc, Yc + 0.6, -12, 16), boxG(sky.x0, sky.x1, Yc, Yc + 0.6, -12, sky.z0), boxG(sky.x0, sky.x1, Yc, Yc + 0.6, sky.z1, 16));
    const n = K.mullions, gw = (sky.x1 - sky.x0 - n * K.mullionWidth) / (n + 1); sky.gaps = [];
    for (let i = 0; i <= n; i++) { const a = sky.x0 + i * (gw + K.mullionWidth); sky.gaps.push([a, a + gw]); if (i < n) ceil.push(boxG(a + gw, a + gw + K.mullionWidth, Yc, Yc + 0.5, sky.z0, sky.z1)); }
    const cm = new T.Mesh(merge(ceil), M.wallDark); cm.castShadow = true; cm.receiveShadow = false; cm.name = 'roof'; scene.add(cm); }

  /* ---------- build the merged static meshes ---------- */
  for (const [mat, b] of buckets) { const mesh = new T.Mesh(merge(b.geos), mat); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); }

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
    const brace = boxG(-0.035, 0.035, -h * 0.62, h * 0.62, -0.006, 0.006); brace.rotateZ(Math.atan2(w, h) * 0.98); brace.translate(0, h / 2, dd / 2 + 0.005); pl.push(brace);
    const mesh = new T.Mesh(merge(pl), M.crate); mesh.castShadow = mesh.receiveShadow = true; crate.add(mesh);
    const coreM = new T.Mesh(merge(core), FF.mat({ color: '#1e1c1a', roughness: 1 })); coreM.castShadow = true; crate.add(coreM); }
  scene.add(crate);

  /* ---------- the amber lamp: the one warm accent ---------- */
  const lampPos = new T.Vector3(9.5, 3.12, -7.72);
  const ac = FF.lin(L.amber.color).multiplyScalar(L.amber.intensity);
  const lamp = new T.Mesh(new T.SphereGeometry(0.045, 12, 8), FF.glow([ac.r, ac.g, ac.b], false)); lamp.position.copy(lampPos); scene.add(lamp);
  const halo = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const tex = new T.CanvasTexture(cv); const m = new T.SpriteMaterial({ map: tex, color: FF.lin(L.amber.color).multiplyScalar(0.9), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    const s = new T.Sprite(m); s.scale.set(0.9, 0.9, 1); s.position.copy(lampPos); s.position.z += 0.05; scene.add(s); return s; })();

  /* ---------- lights ---------- */
  const lights = {};
  const pool = new T.Vector3(K.poolCenter[0], K.poolCenter[1], K.poolCenter[2]);
  { const key = new T.SpotLight(FF.lin(K.color), K.intensity, 0, 0.1, K.penumbra, 1);
    const far = 70; key.position.copy(pool).addScaledVector(d, -far); key.target.position.copy(pool); scene.add(key.target);
    /* cone just wide enough to cover the skylight from the light's position */
    let ang = 0; const ax = d.clone();
    for (const x of [sky.x0, sky.x1]) for (const z of [sky.z0, sky.z1]) { const v = new T.Vector3(x, Yc, z).sub(key.position).normalize(); ang = Math.max(ang, Math.acos(Math.min(1, v.dot(ax)))); }
    key.angle = ang * 1.12 / (1 - K.penumbra * 0.5);
    key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.00025; key.shadow.normalBias = 0.015; key.shadow.radius = K.shadowSoftness;
    const dCeil = (far - tF) + 0; key.shadow.camera.near = Math.max(5, (far - tF) * 0.85 - 2); key.shadow.camera.far = far + 8;
    scene.add(key); lights.key = key; lights.keyDist = dCeil; }
  { const h = new T.HemisphereLight(FF.lin(L.ambient.sky), FF.lin(L.ambient.ground), L.ambient.intensity); scene.add(h); lights.hemi = h; }
  { const f = new T.DirectionalLight(FF.lin(L.fill.color), L.fill.intensity); f.position.set(-L.fill.dir[0], -L.fill.dir[1], -L.fill.dir[2]).multiplyScalar(10); scene.add(f); lights.fill = f; }
  { const b = new T.PointLight(FF.lin(L.bounce.color), L.bounce.intensity, L.bounce.distance, 2); b.position.set(pool.x + 0.4, 0.5, -0.2); scene.add(b); lights.bounce = b; }
  { const s = new T.SpotLight(FF.lin(O.glow), O.spill, O.spillDistance, 0.72, 1.0, 2); s.position.set(O.x, O.h * 0.62, TZ + 0.12); s.target.position.set(O.x, 0, BZ + 1.6); scene.add(s.target); scene.add(s); lights.opening = s; }
  { const a = new T.PointLight(FF.lin(L.amber.color), L.amber.light, 3.0, 2); a.position.copy(lampPos).add(new T.Vector3(0, 0.05, 0.25)); scene.add(a); lights.amber = a; }

  /* ---------- shafts: soft additive sheets inside the beam, one per skylight gap per depth layer ---------- */
  const shaftMat = new T.ShaderMaterial({
    uniforms: { uCol: { value: FF.lin(L.shafts.color) }, uI: { value: L.shafts.intensity }, uTime: FF.U.uFFTime, uNoise: { value: L.shafts.noise }, uWallZ: { value: WALLZ } },
    vertexShader: `attribute vec3 sd; varying vec2 vUv; varying vec3 vW; varying float vK;
      void main(){ vUv = uv; vK = sd.x; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uI, uTime, uNoise, uWallZ; varying vec2 vUv; varying vec3 vW; varying float vK;
      float h(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        float across = pow(max(sin(3.14159 * vUv.x), 0.0), 1.4);
        float ends = smoothstep(0.0, 0.7, vW.y) * smoothstep(0.0, 0.35, vW.z - uWallZ) * (1.0 - smoothstep(6.5, 10.0, vW.y));
        float nz = 1.0 - uNoise + uNoise * 1.6 * n(vW * vec3(0.9, 0.35, 0.9) + vec3(uTime * 0.04, -uTime * 0.07, uTime * 0.03));
        nz *= 0.8 + 0.4 * n(vW * 3.1 + vec3(0.0, -uTime * 0.12, 0.0));
        gl_FragColor = vec4(uCol * (uI * vK * across * ends * nz), 1.0);
      }`,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation,
    depthWrite: false, depthTest: true, transparent: true, side: T.DoubleSide,
  });
  function shaftGeo(layers) {
    const P = [], U = [], S = [], I = [];
    const quad = (x0, x1, z, k) => {
      const tEnd = x => { let t = Yc / -d.y; if (d.z < 0) t = Math.min(t, (z - WALLZ) / -d.z); return t; };
      const t0 = tEnd(x0), t1 = tEnd(x1), b = P.length / 3;
      P.push(x0, Yc, z, x1, Yc, z, x1 + d.x * t1, Yc + d.y * t1, z + d.z * t1, x0 + d.x * t0, Yc + d.y * t0, z + d.z * t0);
      U.push(0, 0, 1, 0, 1, 1, 0, 1); S.push(k, 0, 0, k, 0, 0, k, 0, 0, k, 0, 0); I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (let l = 0; l < layers; l++) { const z = sky.z0 + (sky.z1 - sky.z0) * (l + 0.5) / layers; for (const [a, b] of sky.gaps) quad(a, b, z, 4 / layers); }
    quad(sky.x0 - 0.6, sky.x1 + 0.6, (sky.z0 + sky.z1) / 2, L.shafts.broad / L.shafts.intensity * 4);
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
    g.setAttribute('sd', new T.Float32BufferAttribute(S, 3)); g.setIndex(I); g.computeBoundingSphere(); return g;
  }
  const shafts = new T.Mesh(shaftGeo(4), shaftMat); shafts.renderOrder = 10; shafts.frustumCulled = false; shafts.name = 'shafts'; scene.add(shafts);

  /* ---------- dust drifting through the light (high tier) ---------- */
  const motes = (() => {
    const N = L.shafts.motes, P = new Float32Array(N * 3), R = new Float32Array(N);
    let i = 0, guard = 0;
    while (i < N && guard++ < N * 50) {
      const g = sky.gaps[(Math.random() * sky.gaps.length) | 0], x0 = g[0] + Math.random() * (g[1] - g[0]), z0 = sky.z0 + Math.random() * (sky.z1 - sky.z0);
      const y = 0.05 + Math.random() * 4.5, t = (Yc - y) / -d.y, z = z0 + d.z * t; if (z < WALLZ + 0.05) continue;
      P[i * 3] = x0 + d.x * t; P[i * 3 + 1] = y; P[i * 3 + 2] = z; R[i] = Math.random(); i++;
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('rnd', new T.BufferAttribute(R, 1));
    const m = new T.ShaderMaterial({
      uniforms: { uTime: FF.U.uFFTime, uCol: { value: FF.lin(L.shafts.color).multiplyScalar(1.6) }, uPx: { value: 1 } },
      vertexShader: `attribute float rnd; uniform float uTime, uPx; varying float vA;
        void main(){ vec3 p = position; float t = uTime * (0.15 + 0.2 * rnd) + rnd * 40.0;
          p += vec3(sin(t * 0.7) * 0.05, -mod(uTime * 0.012 + rnd * 3.0, 0.25) + sin(t) * 0.03, cos(t * 0.6) * 0.05);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (1.2 + 1.6 * fract(rnd * 7.3)) * (7.0 / -mv.z);
          vA = (0.35 + 0.65 * fract(rnd * 13.7)) * (0.6 + 0.4 * sin(t * 2.3)); }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(uCol * a * vA * 0.5, 1.0); }`,
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true,
    });
    const p = new T.Points(g, m); p.frustumCulled = false; p.renderOrder = 11; scene.add(p); return p;
  })();

  /* contact-shadow boxes: walls' feet, the column, the block, the bulkhead, the crate (index 0, moves) */
  FF.setAOBox(1, [-12, 6, WALLZ - 0.5], [18, 6, 0.5], L.ao.objects, 0.55);
  FF.setAOBox(2, [-8.95, 6, -0.8], [1.05, 6, 1.7], L.ao.objects, 0.45);
  FF.setAOBox(3, [4.2, 1.05, -1.48], [1.6, 1.05, 1.03], L.ao.objects, 0.4);
  FF.setAOBox(4, [11.1, 6, -1.05], [0.9, 6, 2.45], L.ao.objects, 0.45);

  function setTier(t) {
    key_shadow(t.shadowMap);
    lights.bounce.visible = !!t.bounce; lights.amber.visible = !!t.amberLight; motes.visible = !!t.motes;
    shafts.geometry.dispose(); shafts.geometry = shaftGeo(t.shaftLayers);
  }
  function key_shadow(size) { const k = lights.key; if (k.shadow.mapSize.x !== size) { k.shadow.mapSize.set(size, size); if (k.shadow.map) { k.shadow.map.dispose(); k.shadow.map = null; } } k.shadow.radius = L.key.shadowSoftness * size / 2048 + 0.6; }

  return {
    lights, crate, shafts, motes, halo, sky, setTier, pool,
    update(dt, t, pr) { motes.material.uniforms.uPx.value = pr; },
    apply(L2) { /* push intensities from the config (live tuning) */
      lights.key.intensity = L2.key.intensity; lights.key.color.copy(FF.lin(L2.key.color)); lights.hemi.intensity = L2.ambient.intensity;
      lights.hemi.color.copy(FF.lin(L2.ambient.sky)); lights.hemi.groundColor.copy(FF.lin(L2.ambient.ground));
      lights.fill.intensity = L2.fill.intensity; lights.bounce.intensity = L2.bounce.intensity; lights.opening.intensity = L2.opening.spill; lights.amber.intensity = L2.amber.light;
      shaftMat.uniforms.uI.value = L2.shafts.intensity; shaftMat.uniforms.uNoise.value = L2.shafts.noise; shaftMat.uniforms.uCol.value.copy(FF.lin(L2.shafts.color));
    },
  };
};
})();
