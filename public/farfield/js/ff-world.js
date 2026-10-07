/* FAR FIELD — ff-world.js: FF.World builds and lights the whole 135 m lane from FF.S1: every place's static geometry (merged
   per material per place), backdrops, the ONE fixed light rig (created once; lights are never added or removed in play),
   cone beams, rain, per-place looks (FF.LOOKS, dusk -> night, A1) blended into the live look, the core light mask (A6),
   and the movable set pieces other modules animate (props).
   OWNER: the world builder. API contract: docs/farfield/INTERFACES.md §8.1. SKELETON: a plain greybox of the whole lane from
   the data, the fixed rig with named light handles, props, a debug overlay. Everything visual is the builder's to replace,
   keeping the API (spot / point / prop / look / overlay) and the look test's approved look. */
'use strict';
window.FF = window.FF || {};
(function () {
const T = THREE;
let ctx = null, root = null, overlayGroup = null;
const props = {}, spots = {}, points = {}, rig = {};

/* logical light ids -> rig slots (the rig never changes shape: three compiles shaders for the light count, A22 / §13).
   K0 and K1 are the two shadow-casting spots (K0 is spot index 0: the window mask applies to it while uFFKeyMode is 1). */
const SPOT_SLOT = { headlights: 'K0', window: 'K0', torch: 'K0', vergeTorch: 'K1', flood: 'K1', worklight: 'P0', opening: 'P0', doorSpill: 'P0', gateGlare: 'P1', walkwayDoor: 'P1' };
const POINT_SLOT = { bounce: 'B0', doorLamp: 'B0', amber: 'B1' };

function makeSpot(name, shadow) {
  const s = new T.SpotLight(0xffffff, 0, 20, 0.4, 0.4, 2); s.name = name;
  s.castShadow = !!shadow;
  if (shadow) { s.shadow.mapSize.set(16, 16); s.shadow.radius = -1; s.shadow.autoUpdate = false; s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; }
  root.add(s); root.add(s.target); return s;
}
function spotHandle(slot) {
  const L = rig[slot];
  return {
    slot, light: L,
    set(o) {
      if (o.pos) L.position.fromArray(o.pos); if (o.target) L.target.position.fromArray(o.target);
      if (o.angle != null) L.angle = o.angle; if (o.penumbra != null) L.penumbra = o.penumbra; if (o.distance != null) L.distance = o.distance;
      if (o.decay != null) L.decay = o.decay; if (o.color) L.color.copy(FF.lin(o.color)); if (o.intensity != null) L.intensity = o.intensity;
      L.target.updateMatrixWorld(); return this;
    },
    on(v) {
      if (!v) { L.intensity = 0; if (L.castShadow) { L.shadow.radius = -1; L.shadow.autoUpdate = false; } return this; }
      if (L.castShadow) {
        const sz = (slot === 'K0' ? FF.tier.torchShadow : FF.tier.secondShadow) || 512;
        if (L.shadow.mapSize.x !== sz) { L.shadow.mapSize.set(sz, sz); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
        L.shadow.radius = 4 * sz / 2048 + 1; L.shadow.autoUpdate = true;
      }
      return this;
    },
    beam() { return this; },           // SKELETON: the builder draws cone-beam volumes (reading the light's shadow map)
  };
}

const World = FF.World = {
  stub: true,
  look: null,
  init(c) {
    ctx = c; const S1 = FF.S1, M = FF.LOOK.materials, mat = k => FF.mat(M[k]);
    World.look = JSON.parse(JSON.stringify(FF.LOOK));
    FF.U.uFFKeyMode.value = 0;            // no window key in the greybox
    root = new T.Group(); root.name = 'world'; c.scene.add(root);
    const buckets = new Map(); const add = (m, g, cast) => { const k = m.uuid + (cast ? '|c' : ''); if (!buckets.has(k)) buckets.set(k, { m, cast, g: [] }); buckets.get(k).g.push(g); };
    const floorM = mat('floor'), wallM = mat('wall'), darkM = mat('wallDark'), metalM = mat('metal'), crateM = mat('crate');
    const B = FF.geo.box;

    /* ground: the profile as a strip of quads from z -6 to z 4 (+ a front face) */
    { const g = S1.ground, P = [];
      const quad = (a, b, c, d) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let i = 0; i < g.length - 1; i++) { const [x0, y0] = g[i], [x1, y1] = g[i + 1];
        if (x1 > x0) { quad([x0, y0, 4], [x1, y1, 4], [x1, y1, -6], [x0, y0, -6]); quad([x0, y0 - 3, 4], [x1, y1 - 3, 4], [x1, y1, 4], [x0, y0, 4]); }
        else quad([x0, Math.min(y0, y1), 4], [x0, Math.min(y0, y1), -6], [x0, Math.max(y0, y1), -6], [x0, Math.max(y0, y1), 4]); }
      const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(P, 3)); geo.computeVertexNormals();
      const mesh = new T.Mesh(geo, floorM); mesh.receiveShadow = true; mesh.name = 'ground'; root.add(mesh); }

    /* solids (collision is data; these meshes only show it) */
    for (const s of S1.solids) {
      if (s.kind === 'edge') continue;
      const z0 = s.z0 != null ? s.z0 : s.kind === 'wall' ? -6 : s.kind === 'kerb' ? -1.2 : -0.8, z1 = s.z1 != null ? s.z1 : s.kind === 'wall' ? 1.6 : s.kind === 'kerb' ? 1.2 : 0.6;
      add(s.kind === 'wall' ? wallM : s.kind === 'kerb' ? darkM : metalM, B(s.x0, s.x1, s.y0, Math.min(s.y1, 14), z0, z1), true);
    }
    /* A16: every Search cover is closed on its BACK face (the searcher's side, z0) down to the floor, so light and sight get
       under it only through its two x-ends, exactly as the 2D model assumes. The front (camera) side stays open. */
    for (const c of S1.covers) { const s = S1.solids.find(k => k.id === c.id); if (!s || s.z0 == null || !c.core || c.exit) continue;
      add(metalM, B(s.x0, s.x1, 0.0, s.y0, s.z0, s.z0 + 0.04), true); }
    /* back walls per place (placeholders for the real sets) */
    add(wallM, B(-6, 38.5, 0, 14, -4.9, -4.2), false);            // the Verge's boundary wall
    add(wallM, B(55.5, 75.6, 0, 14, -5.7, -5.0), false);          // the Courtyard's back wall (the deep hall opens beyond 75.6)
    add(darkM, B(75.2, 83.5, 0, 1.45, -5.0, -0.45), true);        // the block with the raised opening (sill 0.80 at 76.0)
    add(wallM, B(86, 113.5, 0, 2.6, -3.5, -3.2), false);          // the Search's annex wall
    add(darkM, B(113.5, 129, 0, 0.9, -2.6, -2.4), false);         // the rest's low broken wall
    for (const b of buckets.values()) { const mesh = new T.Mesh(FF.geo.merge(b.g), b.m); mesh.castShadow = b.cast; mesh.receiveShadow = true; root.add(mesh); }
    /* a fogged backdrop box so every pixel gets haze (look test) */
    { const m = FF.mat({ color: '#101317', roughness: 1, noAO: true }); m.side = T.BackSide; root.add(new T.Mesh(B(-60, 200, -6, 80, -80, 40), m)); }

    /* props other modules animate. 'box' is the pushable (the player moves it). Others are empty groups until built. */
    { const p = S1.pushables[0], box = new T.Mesh(B(-p.w / 2, p.w / 2, 0, p.h, -p.d / 2, p.d / 2), crateM); box.castShadow = box.receiveShadow = true;
      const g = new T.Group(); g.name = 'prop:box'; g.add(box); g.position.set(p.x, 0, 0); root.add(g); props.box = g; }

    /* THE FIXED RIG (§13): created once, never changes shape. Dormant = intensity 0, shadow radius -1, no map updates. */
    rig.H = new T.HemisphereLight(FF.lin(FF.LOOK.ambient.sky), FF.lin(FF.LOOK.ambient.ground), 0.9); root.add(rig.H);
    rig.K0 = makeSpot('K0', true); rig.K1 = makeSpot('K1', true);
    rig.D0 = new T.DirectionalLight(FF.lin('#c3ccd4'), 1.2); rig.D0.castShadow = true; rig.D0.shadow.mapSize.set(1024, 1024);
    Object.assign(rig.D0.shadow.camera, { left: -12, right: 12, top: 8, bottom: -4, near: 1, far: 60 }); rig.D0.shadow.radius = 3; rig.D0.shadow.bias = -0.0005;
    root.add(rig.D0); root.add(rig.D0.target);
    rig.D1 = new T.DirectionalLight(FF.lin(FF.LOOK.fill.color), 0.15); rig.D1.position.set(5, 6, 6); root.add(rig.D1);
    rig.P0 = makeSpot('P0', false); rig.P1 = makeSpot('P1', false);
    rig.B0 = new T.PointLight(0xffffff, 0, 6, 2); rig.B1 = new T.PointLight(0xffae4a, 0, 3, 2); root.add(rig.B0); root.add(rig.B1);
    for (const id in SPOT_SLOT) spots[id] = spotHandle(SPOT_SLOT[id]);
    for (const id in POINT_SLOT) { const L = rig[POINT_SLOT[id]]; points[id] = { slot: POINT_SLOT[id], light: L, set(o) { if (o.pos) L.position.fromArray(o.pos); if (o.color) L.color.copy(FF.lin(o.color)); if (o.intensity != null) L.intensity = o.intensity; if (o.distance != null) L.distance = o.distance; return this; }, on(v) { if (!v) L.intensity = 0; return this; } }; }
  },
  /* named light handles (they share rig slots by place; see SPOT_SLOT) */
  spot(id) { return spots[id] || null; },
  point(id) { return points[id] || null; },
  /* a movable set piece by id ('box', 'gateLeafL', 'gateLeafR', 'doorN0', 'walkwayDoorL', 'walkwayDoorR', 'fenceSheet', 'amberLamp', ...).
     Unknown ids get an empty group (the builder fills them), so callers never crash. */
  prop(id) { if (!props[id]) { const g = new T.Group(); g.name = 'prop:' + id; if (root) root.add(g); props[id] = g; } return props[id]; },
  get rig() { return rig; },
  reset() {},
  frame(dt) {
    const r = FF.G.rabbit; if (!r || !rig.D0) return;
    /* the sky's shadow box follows the camera (outdoor key, RENDERING.md §7) */
    rig.D0.target.position.set(r.x + 2, 0, 0); rig.D0.position.set(r.x + 2 - 8, 20, 9); rig.D0.target.updateMatrixWorld();
  },
  setTier(t) {
    if (!rig.D0) return; const sz = t.skyShadow || 1024;
    if (rig.D0.shadow.mapSize.x !== sz) { rig.D0.shadow.mapSize.set(sz, sz); if (rig.D0.shadow.map) { rig.D0.shadow.map.dispose(); rig.D0.shadow.map = null; } }
  },
  /* debug overlay (O with ?debug=1): solids, covers with their cores, triggers */
  overlay(on) {
    if (!root) return; if (!overlayGroup) {
      overlayGroup = new T.Group(); overlayGroup.name = 'overlay'; const mk = (x0, x1, y0, y1, col) => { const g = new T.EdgesGeometry(FF.geo.box(x0, x1, y0, y1, -0.02, 0.02)); return new T.LineSegments(g, new T.LineBasicMaterial({ color: col, depthTest: false, transparent: true })); };
      for (const s of FF.S1.solids) overlayGroup.add(mk(s.x0, s.x1, s.y0, Math.min(s.y1, 3), 0x6fb3ff));
      for (const c of FF.S1.covers) if (c.core) overlayGroup.add(mk(c.core[0], c.core[1], 0.0, 0.05, 0x7fe0a0));
      for (const t of FF.S1.triggers) if (t.x0 != null) overlayGroup.add(mk(t.x0, Math.min(t.x1, t.x0 + 4), 1.6, 1.62, 0xffb347));
      overlayGroup.renderOrder = 99; overlayGroup.visible = false; root.add(overlayGroup);
    }
    overlayGroup.visible = on == null ? !overlayGroup.visible : !!on; return overlayGroup.visible;
  },
  apply() { FF.applyShading(World.look); },
  dispose() {},
  debug() { return { stub: true, look: 'base', rig: Object.keys(rig) }; },
};
})();
