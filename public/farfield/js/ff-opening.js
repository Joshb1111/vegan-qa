/* FAR FIELD — ff-opening.js: FF.Opening, the opening's light and dust (polish pass, 8 Oct; Josh's priority 3).
   THE LIGHT: a believable physical source (a small high window in the boundary wall, x 5.25-5.65, y 1.78-2.06, with a
   frame and two bars, a pale cold glow behind them) and a clearly readable SHAFT of cold light leaving it, down and left and
   towards the lens, to a pool on the grass where the rabbit lands (x 3.55). The environment stays dark: the shaft is additive
   and thin, the pool is a few percent, the real scrapeFill point light is moved into the pool (World).
   THE DUST: bus 'opening:puff' { x, y, z, n, spread, up } throws a small burst of wet dust and bits of grit (FF.Player's
   tumble emits them: the landing on the sheet, the edge, the grass). Pure presentation.
   The shaft fades out with distance from the start (the camera leaves it by x 16) and is hidden in every other place.
   OWNER: the world builder. Presentation only: no collisions, no perception (the shaft is not a light the guards use). */
'use strict';
window.FF = window.FF || {};
(function () {
let T = null, ctx = null, group = null, shaftMat = null, poolMat = null, motes = null, glowMat = null, puffs = null, puffMat = null, tier = 'high';
const SRC = { x: 5.45, y: 1.92, z: -2.86, w: 0.40, h: 0.28 }, POOL = { x: 4.25, y: 0.012, z: -0.45 };
const N_PUFF = 72, puff = { pos: new Float32Array(N_PUFF * 3), vel: new Float32Array(N_PUFF * 3), age: new Float32Array(N_PUFF).fill(9), life: new Float32Array(N_PUFF), size: new Float32Array(N_PUFF), dark: new Float32Array(N_PUFF), next: 0 };
const rnd = () => FF.rng ? FF.rng() : Math.random();
let k = 0, t = 0;

function build() {
  if (!T || !ctx) return;
  group = new T.Group(); group.name = 'opening'; ctx.scene.add(group);
  /* ---- the window: a recess, a frame, two bars, the glow */
  const dark = FF.mat({ color: '#15181b', roughness: 0.9 }), box = (x0, x1, y0, y1, z0, z1) => FF.geo.box(x0, x1, y0, y1, z0, z1);
  const x0 = SRC.x - SRC.w / 2, x1 = SRC.x + SRC.w / 2, y0 = SRC.y - SRC.h / 2, y1 = SRC.y + SRC.h / 2, zf = SRC.z + 0.02;
  const frame = [box(x0 - 0.07, x1 + 0.07, y1, y1 + 0.07, zf - 0.06, zf + 0.05), box(x0 - 0.07, x1 + 0.07, y0 - 0.07, y0, zf - 0.06, zf + 0.09), box(x0 - 0.07, x0, y0, y1, zf - 0.06, zf + 0.05), box(x1, x1 + 0.07, y0, y1, zf - 0.06, zf + 0.05),
    box(x0 + 0.16, x0 + 0.185, y0, y1, zf - 0.01, zf + 0.03), box(x0 + 0.32, x0 + 0.345, y0, y1, zf - 0.01, zf + 0.03)];
  const fm = new T.Mesh(FF.geo.merge(frame), dark); fm.castShadow = false; fm.receiveShadow = false; group.add(fm);
  glowMat = FF.glow([0.9, 1.05, 1.2], false);
  const gl = new T.Mesh(new T.PlaneGeometry(SRC.w, SRC.h), glowMat); gl.position.set(SRC.x, SRC.y, SRC.z + 0.005); group.add(gl);
  /* a faint halo around it in the mist (additive sprite quad) */
  const hm = new T.ShaderMaterial({ uniforms: { uK: { value: 1 } }, vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uK; varying vec2 vU; void main(){ float d = length((vU - 0.5) * vec2(1.0, 1.6)); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(0.55, 0.65, 0.75) * a * a * 0.22 * uK, 1.0); }',
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true });
  const halo = new T.Mesh(new T.PlaneGeometry(1.6, 1.3), hm); halo.position.set(SRC.x, SRC.y, SRC.z + 0.03); halo.renderOrder = 9; group.add(halo); group.userData.halo = hm;
  /* ---- the shaft: a four-sided frustum from the window to the pool, soft at its edges (the view-facing term), bands drifting down it */
  const a = new T.Vector3(SRC.x, SRC.y, SRC.z + 0.04), b = new T.Vector3(POOL.x, POOL.y + 0.02, POOL.z);
  const axis = b.clone().sub(a), len = axis.length(), ax = axis.clone().normalize();
  const e1 = new T.Vector3(0, 0, 1).cross(ax).normalize(), e2 = ax.clone().cross(e1).normalize();     // e1: across the beam in the picture, e2: its depth
  const NS = 20, pos = [], nor = [], uv = [], idx = [], ring = (c, w, d, v) => { for (let i = 0; i <= NS; i++) { const th = i / NS * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th), p = c.clone().addScaledVector(e1, w * ca).addScaledVector(e2, d * sa), n = e1.clone().multiplyScalar(ca).addScaledVector(e2, sa).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(i / NS, v); } };
  ring(a, SRC.w / 2, 0.10, 0); ring(b, 0.80, 0.85, 1);
  for (let i = 0; i < NS; i++) { const q = i, r = i + 1, s2 = NS + 1 + i, t2 = NS + 1 + i + 1; idx.push(q, s2, r, r, s2, t2); }
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); sg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); sg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); sg.setIndex(idx);
  shaftMat = new T.ShaderMaterial({ uniforms: { uCol: { value: new T.Color(0.62, 0.74, 0.86) }, uK: { value: 1 }, uT: FF.U && FF.U.uFFTime ? FF.U.uFFTime : { value: 0 } },
    vertexShader: 'varying vec3 vW; varying vec3 vN; varying vec2 vU; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vU = uv; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform vec3 uCol; uniform float uK, uT; varying vec3 vW; varying vec3 vN; varying vec2 vU; void main(){\n' +
      '  vec3 v = normalize(cameraPosition - vW); float f = abs(dot(normalize(vN), v)); f = pow(f, 2.2);\n' +
      '  float along = vU.y; float fall = (1.0 - along * 0.55) * smoothstep(0.0, 0.07, along) * (1.0 - smoothstep(0.86, 1.0, along));\n' +
      '  float band = 0.84 + 0.16 * sin(vW.y * 6.3 + vW.x * 2.0 - uT * 0.35) + 0.07 * sin(vW.y * 17.0 - uT * 0.9);\n' +
      '  float a = f * fall * band * uK * 0.22; gl_FragColor = vec4(uCol * a, 1.0); }',
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation, depthWrite: false, depthTest: true, transparent: true, side: T.DoubleSide });
  const sm = new T.Mesh(sg, shaftMat); sm.renderOrder = 10; sm.frustumCulled = false; sm.name = 'openingShaft'; group.add(sm);
  /* ---- the pool on the grass: soft ellipse, a few percent */
  poolMat = new T.ShaderMaterial({ uniforms: { uCol: { value: new T.Color(0.55, 0.66, 0.78) }, uK: { value: 1 } }, vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uCol; uniform float uK; varying vec2 vU; void main(){ float d = length((vU - 0.5) * 2.0); float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(uCol * a * a * 0.07 * uK, 1.0); }',
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true });
  const pg = new T.PlaneGeometry(2.5, 1.9); pg.rotateX(-Math.PI / 2);
  const pm = new T.Mesh(pg, poolMat); pm.position.set(POOL.x, POOL.y, POOL.z); pm.renderOrder = 9; group.add(pm);
  /* ---- dust drifting in the shaft */
  const NM = 90, mp = new Float32Array(NM * 3), mr = new Float32Array(NM);
  for (let i = 0; i < NM; i++) { const u = rnd(), c = a.clone().addScaledVector(ax, u * len * 0.96), wdt = (SRC.w / 2) + (0.78 - SRC.w / 2) * u, dd = 0.12 + (0.95 - 0.12) * u;
    c.addScaledVector(e1, (rnd() * 2 - 1) * wdt * 0.85).addScaledVector(e2, (rnd() * 2 - 1) * dd * 0.85); mp[i * 3] = c.x; mp[i * 3 + 1] = c.y; mp[i * 3 + 2] = c.z; mr[i] = rnd(); }
  const mg = new T.BufferGeometry(); mg.setAttribute('position', new T.BufferAttribute(mp, 3)); mg.setAttribute('rnd', new T.BufferAttribute(mr, 1));
  const mm = new T.ShaderMaterial({ uniforms: { uK: { value: 1 }, uT: FF.U && FF.U.uFFTime ? FF.U.uFFTime : { value: 0 } },
    vertexShader: 'attribute float rnd; uniform float uT; varying float vA; void main(){ vec3 p = position; float t = uT * (0.12 + 0.2 * rnd) + rnd * 40.0; p += vec3(sin(t * 0.7) * 0.05, -mod(uT * 0.02 + rnd * 3.0, 0.3) + sin(t) * 0.03, cos(t * 0.6) * 0.05);\n' +
      '  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (1.2 + 1.5 * fract(rnd * 7.3)) * (7.0 / -mv.z) * 1.6; vA = (0.35 + 0.65 * fract(rnd * 13.7)) * (0.6 + 0.4 * sin(t * 2.3)); }',
    fragmentShader: 'uniform float uK; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vec3(0.62, 0.72, 0.82) * a * vA * 0.5 * uK, 1.0); }',
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true });
  motes = new T.Points(mg, mm); motes.frustumCulled = false; motes.renderOrder = 11; motes.name = 'openingMotes'; group.add(motes); group.userData.motes = mm;
  /* ---- the tumble's dust: a pool of soft grey-brown points (normal blending, lit by nothing: rain-dark) */
  const pgm = new T.BufferGeometry(); pgm.setAttribute('position', new T.BufferAttribute(puff.pos, 3)); pgm.setAttribute('aSize', new T.BufferAttribute(puff.size, 1)); pgm.setAttribute('aDark', new T.BufferAttribute(puff.dark, 1)); pgm.setAttribute('aAge', new T.BufferAttribute(new Float32Array(N_PUFF), 1));
  puffMat = new T.ShaderMaterial({ uniforms: { uPx: { value: 1 } }, vertexShader: 'attribute float aSize, aDark, aAge; uniform float uPx; varying float vA; varying float vD; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * (1.0 + aAge * 1.2) * (9.0 / -mv.z) * uPx * 4.0; vA = aAge >= 1.0 ? 0.0 : (1.0 - aAge) * (1.0 - aAge); vD = aDark; }',
    fragmentShader: 'varying float vA; varying float vD; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.05, length(c)) * vA * 0.5; vec3 col = mix(vec3(0.34, 0.36, 0.37), vec3(0.09, 0.09, 0.08), vD); gl_FragColor = vec4(col, a); }',
    transparent: true, depthWrite: false });
  puffs = new T.Points(pgm, puffMat); puffs.frustumCulled = false; puffs.renderOrder = 12; puffs.name = 'openingDust'; group.add(puffs);
}
function spawn(d) {
  const n = Math.max(1, d.n || 8), sp = d.spread != null ? d.spread : 0.5, up = d.up != null ? d.up : 0.8;
  for (let i = 0; i < n; i++) {
    const j = puff.next; puff.next = (puff.next + 1) % N_PUFF;
    puff.pos[j * 3] = d.x + (rnd() - 0.5) * 0.3; puff.pos[j * 3 + 1] = (d.y || 0) + 0.05 + rnd() * 0.12; puff.pos[j * 3 + 2] = (d.z || 0) + (rnd() - 0.5) * 0.3;
    const a = rnd() * Math.PI * 2, s = sp * (0.35 + rnd());
    puff.vel[j * 3] = Math.cos(a) * s + (d.vx || 0) * 0.3; puff.vel[j * 3 + 1] = up * (0.3 + rnd() * 0.9); puff.vel[j * 3 + 2] = Math.sin(a) * s * 0.4;
    puff.age[j] = 0; puff.life[j] = 0.7 + rnd() * 0.8; puff.size[j] = (d.size || 1) * (0.5 + rnd() * 0.9); puff.dark[j] = rnd() < (d.grit != null ? d.grit : 0.35) ? 1 : 0;
  }
}

const Opening = FF.Opening = {
  stub: false,
  init(c) { ctx = c; T = c && c.THREE; if (!T) return; build(); if (FF.bus) FF.bus.on('opening:puff', d => spawn(d || {})); },
  setTier(tr) { tier = tr; if (motes) motes.visible = tr !== 'low'; },
  reset() { for (let i = 0; i < N_PUFF; i++) puff.age[i] = 9; t = 0; },
  /* the shaft is the opening's: it is there while the camera is in the first scene, easing out as the rabbit goes on */
  frame(dt) {
    if (!group) return;
    t += dt; const G = FF.G, r = G.rabbit, x = r ? r.x : 0, cam = FF.Game && FF.Game.camera ? FF.Game.camera.position.x : x;
    const want = G.place === 'verge' || !G.place ? Math.max(0, Math.min(1, (22 - Math.max(x, cam)) / 8)) : 0;
    k += (want - k) * Math.min(1, dt * 3);
    group.visible = k > 0.003 || puffs && puffs.visible;
    const flick = 1 + 0.025 * Math.sin(t * 7.1) + 0.02 * Math.sin(t * 3.3);
    if (shaftMat) shaftMat.uniforms.uK.value = k * flick; if (poolMat) poolMat.uniforms.uK.value = k * flick;
    if (group.userData.halo) group.userData.halo.uniforms.uK.value = k; if (group.userData.motes) group.userData.motes.uniforms.uK.value = k;
    if (glowMat && glowMat.color) { const g = 0.5 + 0.5 * k; glowMat.color.setRGB(0.9 * g, 1.05 * g, 1.2 * g); }
    /* the dust */
    let live = false; const ageA = puffs.geometry.attributes.aAge;
    for (let i = 0; i < N_PUFF; i++) {
      if (puff.age[i] >= 1) { ageA.array[i] = 1; continue; } live = true;
      puff.age[i] += dt / puff.life[i]; puff.vel[i * 3 + 1] -= 0.9 * dt; puff.vel[i * 3] *= (1 - dt * 1.6); puff.vel[i * 3 + 2] *= (1 - dt * 1.6);
      puff.pos[i * 3] += puff.vel[i * 3] * dt; puff.pos[i * 3 + 1] = Math.max(0.02, puff.pos[i * 3 + 1] + puff.vel[i * 3 + 1] * dt); puff.pos[i * 3 + 2] += puff.vel[i * 3 + 2] * dt;
      ageA.array[i] = puff.age[i];
    }
    if (live) { puffs.geometry.attributes.position.needsUpdate = true; ageA.needsUpdate = true; puffs.geometry.attributes.aSize.needsUpdate = true; puffs.geometry.attributes.aDark.needsUpdate = true; }
    puffs.visible = live;
    group.visible = k > 0.003 || live;
    if (shaftMat) { shaftMat.visible = k > 0.003; }
  },
  get k() { return k; },
  debug() { return { k: +k.toFixed(3), visible: !!(group && group.visible), src: SRC, pool: POOL }; },
  dispose() { if (group && ctx) ctx.scene.remove(group); },
};
})();
