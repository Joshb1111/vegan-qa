/* FAR FIELD — ff-world.js: FF.World builds and lights the whole 135 m lane of Sequence 1 from FF.S1, in the approved look
   (matte untextured surfaces, haze and depth fog, light shafts and pools, the blue-grey wall fill, the low side-on camera):
     - every place's static geometry, merged per material per place (one draw each), plus a deep backdrop group per place that
       is shown only while that place is lit (so backdrops may overlap in world space),
     - per-place looks FF.LOOKS (one evening, dusk -> night, A1) blended into the live look along the path FF.Level.lookBlend
       gives (and over the duct transit, behind a foreground pier that wipes the frame),
     - THE FIXED LIGHT RIG (created once; lights are never added, removed or hidden in play: three r128 compiles every shader
       for the light count) with named VIRTUAL handles: each logical light (headlights, torch, window, flood ...) keeps its own
       state and the world applies it to the rig slot it owns in the current light set (verge+drain / courtyard / search+rest),
     - cone beams (torch, floodlight, headlights, the Verge torch) that read their light's shadow map, the Courtyard's window
       beam and dust (the look test's), rain, splashes and drips, instanced grass, the core light mask (A6) and the drain's
       darkness boxes through FF.addShadingHook, decor motion (A24: the gantry, the vapour, the Works), the props others animate.
   OWNER: the world builder. API contract: docs/farfield/INTERFACES.md §8.1 (extended; see the API block at the end).
   Light ownership per set (§13):     K0 (shadow)   K1 (shadow)   P0          P1           B0         B1      D0 (shadow)
     'VD' verge + drain                headlights    vergeTorch    worklight   gateGlare    pipeFill   scrapeFill  sky
     'C'  courtyard                    window        skylight      opening     walkwayDoor  bounce     amber   -
     'SR' search + rest                torch         flood         doorSpill   -            doorLamp   -       moon (rest)
   World-owned lights (window, opening, bounce, flood, doorLamp) configure themselves; the others are driven by their owners
   (Events / Humans / AI) through World.spot(id) / World.point(id). A few take a DERIVED fallback so the place reads even when
   nobody drives them yet: gateGlare from the headlights at the gate, doorSpill from door N0's leaf (or the searcher's entry),
   walkwayDoor from walkway door L's leaf, amber from G.flags.walkwayDone / the walkway start. Explicit driving wins (max). */
'use strict';
window.FF = window.FF || {};
(function () {
const T = THREE, D2R = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const B = (x0, x1, y0, y1, z0, z1) => FF.geo.box(x0, x1, y0, y1, z0, z1);
const CY = (r, h, x, y0, z, seg, rTop) => FF.geo.cyl(r, h, x, y0, z, seg, rTop);
let ctx = null, root = null, overlayGroup = null, tierNow = null, offs = [];
const props = {}, propBase = {}, asked = {}, rig = {}, H = {}, places = {}, mats = {}, extra = {};
let rnd = null;
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* =========================================================================================== per-place looks (A1) */
/* Partial overrides of FF.LOOK (the approved look test). Anything not named keeps the approved value, so the shared language
   (matte surfaces, wall fill, haze, grain, ACES + cold lift) never changes; only light, fog and grade move with the evening.
   Extra keys used by the world: sky (the D0 directional: dusk sky / moon), rain, lights (intensity scales). Colours sRGB.
   Tune live: __ff.G ... FF.LOOKS.search.fog.density = 0.04; FF.World.apply() */
FF.LOOKS = {
  /* 1. THE VERGE at dusk, heavy rain (x 2). No sun: the overcast sky is the key, soft, from high up-left; the misty outskirts
     glow behind on the left, where the rabbit comes from; the enormous wall reads mid blue-grey. */
  verge: {
    /* integration: lower and cooler than the builders' first pass, which read as an overcast DAYTIME haze (lead's note 8);
       a faint warm last light stays only in the far outskirts haze, low on the left */
    exposure: 0.84,
    key: { dir: [0.55, -0.16, 0.82] },                       // only steers the fog's forward glow: towards the outskirts, low left
    sky: { color: '#a9b5c2', intensity: 1.15, dir: [0.35, -1.0, -0.22], softness: 10 },
    ambient: { sky: '#7d8a97', ground: '#1a1d20', intensity: 0.7 },
    fill: { color: '#9aa8b6', intensity: 0.10, dir: [-0.5, -0.4, -0.7] },
    wallFill: { color: '#8794a1', intensity: 0.62, floor: 0.6, height: 5.0, lean: 0.0, topFade: 0.25 },
    fog: { color: '#2f363d', density: 0.030, densityFar: 0.0016, start: 5.0, heightFalloff: 0.05, glow: '#86909b', glowPower: 2.0, glowStrength: 0.32,
           hall: [-14, 4, -40, 24], hallColor: '#a19b95', hallStrength: 0.09 },
    shafts: { density: 0.0, haze: 0.0 },
    rain: { rate: 1.0, wind: 0.18, len: 0.42, speed: 9.0, bright: 0.55 },
    rabbit: { rimStrength: 0.32, lift: 0.012 },
    grade: { saturation: 0.72, contrast: 1.0, lift: [0.022, 0.025, 0.030], gain: [0.99, 1.0, 1.02], vignette: 0.55, bottomWeight: 0.25, grain: 0.03, bloom: 0.3, bloomThreshold: 4.0 },
  },
  /* the Verge at the gate (x 38.5): the same evening, later; it has darkened continuously with x (never with a timer) */
  'verge-late': {
    exposure: 0.82,
    key: { dir: [0.5, -0.2, 0.84] },
    sky: { color: '#9aa7b5', intensity: 0.6, dir: [0.3, -1.0, -0.25], softness: 12 },
    ambient: { sky: '#6f7b88', ground: '#141619', intensity: 0.5 },
    fill: { color: '#8c9cb0', intensity: 0.08, dir: [-0.5, -0.4, -0.7] },
    wallFill: { color: '#7b8897', intensity: 0.56, floor: 0.6, height: 5.0, lean: 0.0, topFade: 0.25 },
    fog: { color: '#2b3239', density: 0.034, densityFar: 0.0016, start: 5.0, heightFalloff: 0.05, glow: '#7b8793', glowPower: 1.8, glowStrength: 0.3,
           hall: [-12, 3, -38, 26], hallColor: '#87929d', hallStrength: 0.08 },
    shafts: { density: 0.0, haze: 0.0 },
    rain: { rate: 1.0, wind: 0.2, len: 0.42, speed: 9.0, bright: 0.48 },
    rabbit: { rimStrength: 0.3, lift: 0.012 },
    grade: { saturation: 0.7, contrast: 1.02, lift: [0.026, 0.030, 0.036], gain: [0.99, 1.0, 1.02], vignette: 0.6, bottomWeight: 0.28, grain: 0.03, bloom: 0.3, bloomThreshold: 4.0 },
  },
  /* the drain, in section: near-black cut faces, the pipe just readable, light only where it comes in (the culvert's broken
     corner, the cracked slab at 46). Unshadowed fill is held out of the pipe by the darkness boxes. */
  drain: {
    exposure: 1.0,
    key: { dir: [0.45, -0.3, 0.84] },
    sky: { color: '#98a5b3', intensity: 0.8, dir: [0.2, -1.0, -0.12], softness: 6 },
    ambient: { sky: '#66717b', ground: '#101214', intensity: 0.55 },
    fill: { color: '#8c9cb0', intensity: 0.0, dir: [-0.5, -0.4, -0.7] },
    wallFill: { color: '#7d8995', intensity: 0.42, floor: 0.6, height: 5.0, lean: 0.0, topFade: 0.25 },
    fog: { color: '#20262b', density: 0.04, densityFar: 0.0015, start: 4.0, heightFalloff: 0.05, glow: '#6f7b86', glowPower: 1.6, glowStrength: 0.5,
           hall: [-10, 3, -36, 28], hallColor: '#7d8792', hallStrength: 0.15 },
    shafts: { density: 0.0, haze: 0.0 },
    rain: { rate: 0.0, wind: 0.2, len: 0.42, speed: 9.0, bright: 0.45 },
    rabbit: { rimStrength: 0.32, lift: 0.014 },
    grade: { saturation: 0.7, contrast: 1.04, lift: [0.024, 0.028, 0.034], gain: [0.99, 1.0, 1.02], vignette: 0.62, bottomWeight: 0.3, grain: 0.032, bloom: 0.3, bloomThreshold: 4.0 },
  },
  /* 2. THE COURTYARD: the approved look test re-placed (its x 0 = world 74.15), late dusk through the high windows (A1): a
     cooler, dimmer key (#dfe2e4, about 70% of the look test's 21); the amber lamp is the warm accent (off until the walkway). */
  courtyard: {
    exposure: 1.06,
    key: { color: '#dfe2e4', intensity: 14.8, poolCenter: [72.6, 0, 0.55] },
    sky: { intensity: 0.0 },
    shafts: { color: '#d3d6d8' },
    bounce: { color: '#c3c6c7', intensity: 0.33 },
    opening: { x: 76.0, w: 0.46, h: 0.36, depth: 0.9, glow: '#d3d8dc', glowIntensity: 0.64, spill: 1.6, spillDistance: 2.6 },
    fog: { hall: [81.5, 4.0, -26, 14], hallColor: '#a9b2ba', hallStrength: 0.4 },
    rain: { rate: 0.0 },
    rabbit: { rimStrength: 0.12, lift: 0.006 },
  },
  /* 3. THE SEARCH at night, after rain. The searcher's torch is the main light (K0, shadowed); a cold floodlight makes one
     exposed patch (pallet B stands in it); the door spill and the torch arrive before the person does. Walls still read. */
  search: {
    exposure: 1.18,
    key: { dir: [-0.35, -1.0, 0.45] },
    sky: { color: '#9fb0c2', intensity: 0.0, dir: [0.4, -1.0, -0.3], softness: 20 },
    ambient: { sky: '#56636f', ground: '#0e1012', intensity: 0.56 },
    fill: { color: '#9fb0c2', intensity: 0.26, dir: [0.4, -0.8, -0.45] },
    wallFill: { color: '#6f7f90', intensity: 0.52, floor: 0.5, height: 4.0, lean: 0.0, topFade: 0.3 },
    fog: { color: '#1d2329', density: 0.034, densityFar: 0.0015, start: 6.0, heightFalloff: 0.03, glow: '#7f8c99', glowPower: 2.0, glowStrength: 0.7,
           hall: [100, 3, -32, 20], hallColor: '#6e7b88', hallStrength: 0.30 },
    shafts: { density: 0.0, haze: 0.0 },
    rain: { rate: 0.0 },
    rabbit: { rimStrength: 0.30, lift: 0.035 },
    /* fixer, 7 Oct (lead's note 8: dark places must still show their shapes faintly): contrast 1.08 with a 0.020 lift clipped
       everything below sRGB ~5/255 to pure black, and the 0.70 vignette pushed the arrival nook (the duct housing, the shelf
       around the hidden rabbit) and the deck's ends under it. Now the deepest values sit just above black (+3-5/255), mid-tones
       move by ~2/255, highlights by -1: the same night, but the shapes in it read */
    grade: { saturation: 0.70, contrast: 1.06, lift: [0.026, 0.030, 0.037], gain: [0.99, 1.0, 1.02], vignette: 0.64, bottomWeight: 0.35, grain: 0.035, bloom: 0.35, bloomThreshold: 4.0 },
  },
  /* 4. BREATHING SPACE: night, the rain has stopped, the cloud stays; the moon only a faint glow through it (A1). Low contrast,
     lifted shadows, light fog so the distant shapes read; the colossal Works waits beyond the channel. */
  rest: {
    exposure: 0.9,   // integration: darker (it read as a pale overcast evening); A1: night, the moon only a faint glow through cloud
    key: { dir: [-0.42, -0.42, 0.8] },
    sky: { color: '#a8b6c4', intensity: 0.45, dir: [-0.45, -0.85, -0.35], softness: 26 },
    ambient: { sky: '#64717e', ground: '#15181b', intensity: 0.5 },
    fill: { color: '#93a3b5', intensity: 0.10, dir: [-0.3, -0.6, -0.7] },
    wallFill: { color: '#7f8d9b', intensity: 0.48, floor: 0.55, height: 4.5, lean: 0.0, topFade: 0.3 },
    fog: { color: '#262d34', density: 0.009, densityFar: 0.00004, start: 7.0, heightFalloff: 0.0, glow: '#8e9aa6', glowPower: 2.4, glowStrength: 0.3,
           hall: [210, 110, -470, 260], hallColor: '#5f6b78', hallStrength: 0.32 },
    shafts: { density: 0.0, haze: 0.0 },
    rain: { rate: 0.0 },
    rabbit: { rimStrength: 0.12, lift: 0.008 },
    grade: { saturation: 0.75, contrast: 1.0, lift: [0.028, 0.031, 0.036], gain: [0.99, 1.0, 1.02], vignette: 0.5, bottomWeight: 0.2, grain: 0.025, bloom: 0.25, bloomThreshold: 4.0 },
  },
};
const LOOK_EXTRA = { sky: { color: '#000000', intensity: 0, dir: [0.35, -1.0, -0.22], softness: 10 }, rain: { rate: 0, wind: 0.18, len: 0.42, speed: 9.0, bright: 0.5 } };
const clone = o => JSON.parse(JSON.stringify(o));
function deepMerge(d, s) { for (const k in s) { const v = s[k]; if (v && typeof v === 'object' && !Array.isArray(v)) { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; deepMerge(d[k], v); } else d[k] = clone(v); } return d; }
let FULL = {};
function buildLooks() { FULL = {}; for (const id in FF.LOOKS) FULL[id] = deepMerge(deepMerge(clone(FF.LOOK), clone(LOOK_EXTRA)), FF.LOOKS[id]); }
FF.lookFor = id => { if (!FULL[id]) buildLooks(); return clone(FULL[id] || FF.LOOK); };
const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const _ca = new T.Color(), _cb = new T.Color();
function blendInto(d, a, b, t) {
  for (const k in a) {
    const va = a[k], vb = b[k] === undefined ? va : b[k];
    if (typeof va === 'number') d[k] = va + (vb - va) * t;
    else if (isHex(va)) { _ca.set(va).convertSRGBToLinear(); _cb.set(isHex(vb) ? vb : va).convertSRGBToLinear(); _ca.lerp(_cb, t).convertLinearToSRGB(); d[k] = '#' + _ca.getHexString(); }
    else if (Array.isArray(va)) { if (!Array.isArray(d[k]) || d[k].length !== va.length) d[k] = clone(va); for (let i = 0; i < va.length; i++) { if (Array.isArray(va[i])) { for (let j = 0; j < va[i].length; j++) d[k][i][j] = va[i][j] + ((vb[i] ? vb[i][j] : va[i][j]) - va[i][j]) * t; } else d[k][i] = va[i] + ((vb[i] != null ? vb[i] : va[i]) - va[i]) * t; } }
    else if (va && typeof va === 'object') { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; blendInto(d[k], va, vb || va, t); }
    else d[k] = t < 0.5 ? va : vb;
  }
  return d;
}

/* =========================================================================================== materials */
const MAT = {
  floor: () => FF.LOOK.materials.floor, wall: () => FF.LOOK.materials.wall, wallDark: () => FF.LOOK.materials.wallDark,
  metal: () => FF.LOOK.materials.metal, crate: () => FF.LOOK.materials.crate, hall: () => FF.LOOK.materials.hall,
  metalLight: { color: '#454a50', roughness: 0.65, mottle: 0.03 },
  vWall:   { color: '#4a5058', roughness: 0.82, mottle: 0.10, wallFill: 1.0 },     // the boundary wall: wet precast concrete
  vWall2:  { color: '#42484f', roughness: 0.78, mottle: 0.12, wallFill: 1.0 },     // ... its panels differ a little from cast to cast
  vStain:  { color: '#363b41', roughness: 0.6, mottle: 0.2, wallFill: 0.9 },
  vWallDk: { color: '#2f343a', roughness: 0.85, mottle: 0.06, wallFill: 0.8 },
  grass:   { color: '#3b4139', roughness: 0.86, mottle: 0.16 },
  grassFar:{ color: '#333834', roughness: 0.92, mottle: 0.08 },
  soil:    { color: '#292b2a', roughness: 0.8, mottle: 0.10 },
  scrape:  { color: '#1c1d1c', roughness: 0.9, mottle: 0.12 },
  thicket: { color: '#151916', roughness: 0.95, mottle: 0.14 },
  wet:     { color: '#43484c', roughness: 0.32, mottle: 0.10 },     // integration: puddles matched to their floor's value (they read as holes)
  wetC:    { color: '#5f646a', roughness: 0.6, mottle: 0.04, lift: 0.16 },    // integration: as rough as the floor (a smoother puddle lost the
  wetS:    { color: '#5e6369', roughness: 0.42, mottle: 0.04, lift: 0.18 },   // lights' broad sheen and read as a dark hole); only a faint lift
  wetDark: { color: '#363b3f', roughness: 0.42, mottle: 0.10 },
  section: { color: '#0e1113', roughness: 1.0, noAO: true },
  pipe:    { color: '#565c62', roughness: 0.55, mottle: 0.14, wallFill: 0.55, lift: 0.22 },
  silt:    { color: '#3a3d3c', roughness: 0.5, mottle: 0.14, lift: 0.12 },
  sheet:   { color: '#30353a', roughness: 0.6, mottle: 0.06, wallFill: 0.5 },
  timber:  { color: '#4c463f', roughness: 0.9, mottle: 0.10, wallFill: 0.3 },
  far:     { color: '#39414a', roughness: 1.0, mottle: 0.04, wallFill: 0.6 },
  farNight:{ color: '#20262c', roughness: 1.0, mottle: 0.05, wallFill: 0.4 },
  sFloor:  { color: '#565b61', roughness: 0.42, mottle: 0.14 },                     // the Search's wet concrete
  sWall:   { color: '#3d434a', roughness: 0.9, mottle: 0.08, wallFill: 1.0 },
  rubble:  { color: '#3a3e42', roughness: 0.9, mottle: 0.12, wallFill: 0.4 },
  rest:    { color: '#3a3f3b', roughness: 0.85, mottle: 0.16 },
  works:   { color: '#161b20', roughness: 1.0, mottle: 0.05, wallFill: 0.15 },
  back:    { color: '#101317', roughness: 1.0, noAO: true },
};
function mat(k) {
  /* Sequence 2: while FF.WorldS2 builds, every material it asks for is a 'works' variant (the Works' lighting hooks compiled
     in, ff-shading.js `only`); Sequence 1's own materials stay exactly as they were */
  const key = matWorks ? k + '|works' : k;
  if (!mats[key]) { const s = typeof MAT[k] === 'function' ? MAT[k]() : MAT[k]; mats[key] = FF.mat(Object.assign({}, s || { color: '#808080' }, matWorks ? { works: true } : {})); }
  return mats[key];
}
let matWorks = false;

/* =========================================================================================== place builder */
function place(id, x0, x1) {
  const group = new T.Group(); group.name = 'place:' + id; root.add(group);
  const back = new T.Group(); back.name = 'backdrop:' + id; root.add(back);
  const buckets = new Map();
  const P = {
    id, x0, x1, group, back, set: id === 'verge' || id === 'drain' ? 'VD' : id === 'courtyard' ? 'C' : 'SR',
    add(mk, g, cast, toBack) { const key = mk + (cast ? '|c' : '') + (toBack ? '|b' : ''); if (!buckets.has(key)) buckets.set(key, { mk, cast: !!cast, toBack: !!toBack, geos: [] }); buckets.get(key).geos.push(g); return g; },
    bg(mk, g) { return P.add(mk, g, false, true); },
    obj(o, toBack) { (toBack ? back : group).add(o); return o; },
    done() {
      for (const b of buckets.values()) {
        const mesh = new T.Mesh(FF.geo.merge(b.geos), mat(b.mk)); mesh.castShadow = b.cast; mesh.receiveShadow = true; mesh.name = id + ':' + b.mk + (b.cast ? '+c' : '');
        (b.toBack ? back : group).add(mesh); for (const g of b.geos) g.dispose();
      }
      buckets.clear();
    },
  };
  places[id] = P; return P;
}
/* a top surface following the ground profile from xa to xb (no vertical step inside), z0..z1, with a front face down to yb */
function profileGeo(xa, xb, z0, z1, yb, dy, front) {
  const pts = [[xa, FF.Level.groundY(xa + 1e-4)]];
  for (const [x, y] of FF.S1.ground) if (x > xa + 1e-4 && x < xb - 1e-4) pts.push([x, y]);
  pts.push([xb, FF.Level.groundY(xb - 1e-4)]);
  const P = []; dy = dy || 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; if (x1 - x0 < 1e-5) continue;
    const a = y0 + dy, b = y1 + dy;
    P.push(x0, a, z1, x1, b, z1, x1, b, z0, x0, a, z1, x1, b, z0, x0, a, z0);
    if (front) P.push(x0, yb, z1, x1, yb, z1, x1, b, z1, x0, yb, z1, x1, b, z1, x0, a, z1);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
}
function quadGeo(pts) { /* a flat polygon (convex, in order) as a fan */
  const P = []; for (let i = 1; i < pts.length - 1; i++) P.push(...pts[0], ...pts[i], ...pts[i + 1]);
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g;
}
const sphere = (r, x, y, z, sx, sy, sz, ws, hs) => { const g = new T.SphereGeometry(r, ws || 10, hs || 7); g.scale(sx || 1, sy || 1, sz || 1); g.translate(x, y, z); return g; };
const lump = (r, x, y, z, sx, sy, sz) => { const g = new T.IcosahedronGeometry(r, 0); g.scale(sx || 1, sy || 1, sz || 1); g.rotateY(rnd() * 6.28); g.translate(x, y, z); return g; };
const dome = (x, z, w, h, d) => { const g = new T.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(w / 2, h, d / 2); g.translate(x, 0, z); return g; };
/* a box rotated about the z axis (degrees) around its own centre, then placed */
const tilt = (w, h, d, rz, cx, cy, cz, rx, ry) => { const g = new T.BoxGeometry(w, h, d); if (rx) g.rotateX(rx * D2R); if (rz) g.rotateZ(rz * D2R); if (ry) g.rotateY(ry * D2R); g.translate(cx, cy, cz); return g; };
/* corrugated sheet: a thin slab with ribs, lying in a plane; built flat (x along `len`, z across `wid`), then posed */
function corrugated(len, wid, ribs, thick) {
  const parts = [new T.BoxGeometry(len, thick, wid)];
  for (let i = 0; i < ribs; i++) { const z = -wid / 2 + (i + 0.5) * wid / ribs; const r = new T.BoxGeometry(len, thick * 1.8, wid / ribs * 0.32); r.translate(0, thick * 0.9, z); parts.push(r); }
  return FF.geo.merge(parts);
}
function glowMesh(rgb, geo, fog) { const m = FF.glow(rgb, fog); const me = new T.Mesh(geo, m); me.castShadow = false; me.receiveShadow = false; return me; }
let haloTex = null;
function halo(colorHex, mult, size) {
  if (!haloTex) { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.4)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); haloTex = new T.CanvasTexture(cv); }
  const m = new T.SpriteMaterial({ map: haloTex, color: FF.lin(colorHex).multiplyScalar(mult), blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const s = new T.Sprite(m); s.scale.set(size, size, 1); return s;
}
function mkProp(id, x, y, z) { const g = new T.Group(); g.name = 'prop:' + id; g.position.set(x, y, z); root.add(g); props[id] = g; propBase[id] = { x, y, z, ry: 0 }; g.userData.base = propBase[id]; return g; }

/* =========================================================================================== shading hooks */
/* the drain's darkness boxes (uFFDark): unshadowed light (hemisphere, wall fill, the unshadowed spots P0/P1) must not leak
   into the pipe; the shadowed lights (sky through the gaps, the torch) still light it where their shadow maps say. And the
   hide-core light mask (A6, uFFCore): the searcher's lights (K0 torch, K1 flood) x 0 inside the PROVEN cores only (the
   checker's cores, FF.S1.covers[].core, below each cover's underside, inside its z depth), 0.1 m soft edge inwards. It
   cleans shadow-map leaks; nothing he can see is ever shown dark. The same mask runs in the cone beams. */
const CORE_N = 6, DARK_N = 4;
const CORE_GLSL = `
uniform vec4 uFFCoreX[${CORE_N}]; uniform vec4 uFFCoreZ[${CORE_N}]; uniform vec4 uFFCovX[${CORE_N}]; uniform float uFFCoreOn; uniform float uFFCoverFull; uniform vec4 uFFCoreB;
/* full = 1: the whole cover's underside (x0..x1), for an overhead light with no shadow map this tier (low: the floodlight) */
float ffCoreMaskF( vec3 p, float full ) {
  if ( uFFCoreOn < 0.5 || p.x < uFFCoreB.x || p.x > uFFCoreB.y || p.y > uFFCoreB.z ) return 1.0;   /* cheap bounds first */
  float m = 1.0;
  for ( int i = 0; i < ${CORE_N}; i ++ ) {
    vec4 a = uFFCoreX[ i ]; vec4 b = uFFCoreZ[ i ];
    if ( a.w < 0.5 ) continue;
    vec2 xr = full > 0.5 ? uFFCovX[ i ].xy : a.xy;
    float inX = smoothstep( xr.x, xr.x + b.z, p.x ) * ( 1.0 - smoothstep( xr.y - b.z, xr.y, p.x ) );
    float inY = 1.0 - smoothstep( a.z - 0.015, a.z + 0.015, p.y );
    float inZ = step( b.x, p.z ) * step( p.z, b.y );
    m *= 1.0 - inX * inY * inZ;
  }
  return m;
}
float ffCoreMask( vec3 p ) { return ffCoreMaskF( p, 0.0 ); }`;
const DARK_GLSL = `
uniform vec4 uFFDarkC[${DARK_N}]; uniform vec4 uFFDarkH[${DARK_N}]; uniform vec4 uFFDarkB;
float ffDark( vec3 p ) {
  if ( p.x < uFFDarkB.x || p.x > uFFDarkB.y || p.y > uFFDarkB.z ) return 1.0;   /* cheap bounds first (0 when no box is live) */
  float k = 1.0;
  for ( int i = 0; i < ${DARK_N}; i ++ ) {
    vec4 c = uFFDarkC[ i ]; vec4 h = uFFDarkH[ i ];
    if ( c.w <= 0.0 ) continue;
    vec3 q = abs( p - c.xyz ) - h.xyz;
    float d = length( max( q, 0.0 ) ) + min( max( q.x, max( q.y, q.z ) ), 0.0 );
    k *= 1.0 - c.w * ( 1.0 - smoothstep( - h.w, 0.0, d ) );
  }
  return k;
}`;
function registerHooks() {
  FF.addShadingHook({
    key: 'world-dark-core',
    uniforms: {
      uFFCoreX: { value: Array.from({ length: CORE_N }, () => new T.Vector4(0, 0, 0, 0)) },
      uFFCoreZ: { value: Array.from({ length: CORE_N }, () => new T.Vector4(0, 0, 0.1, 0)) },
      uFFCoreOn: { value: 0 }, uFFCoverFull: { value: 0 }, uFFCoreB: { value: new T.Vector4(0, -1, -1, 0) }, uFFDarkB: { value: new T.Vector4(0, -1, -1, 0) },
      uFFCovX: { value: Array.from({ length: CORE_N }, () => new T.Vector4(0, 0, 0, 0)) },
      uFFDarkC: { value: Array.from({ length: DARK_N }, () => new T.Vector4(0, -99, 0, 0)) },
      uFFDarkH: { value: Array.from({ length: DARK_N }, () => new T.Vector4(0.1, 0.1, 0.1, 0.1)) },
    },
    pars: CORE_GLSL + DARK_GLSL,
    spot: 'if ( i == 0 ) c *= ffCoreMask( p ); if ( i == 1 ) c *= ffCoreMaskF( p, uFFCoverFull ); if ( i >= 2 ) c *= ffDark( p );',
    lights: 'reflectedLight.indirectDiffuse *= ffDark( vFFW );',
  });
  /* the cores from the data (the checker's numbers; a cover with mask: false gets none) */
  let i = 0;
  for (const c of FF.S1.covers) {
    if (!c.core || !c.mask || i >= CORE_N) continue;
    const s = FF.S1.solids.find(k => k.id === c.id) || {};
    FF.U.uFFCoreX.value[i].set(c.core[0], c.core[1], c.y1, 1);
    FF.U.uFFCoreZ.value[i].set(s.z0 != null ? s.z0 : -0.8, s.z1 != null ? s.z1 : 0.6, FF.RULES.sight.coreMaskSoft || 0.1, 0);
    FF.U.uFFCovX.value[i].set(c.x0, c.x1, 0, 0); i++;
  }
  { let x0 = 1e9, x1 = -1e9, y1 = -1e9; for (let k = 0; k < i; k++) { const a = FF.U.uFFCoreX.value[k], c = FF.U.uFFCovX.value[k]; x0 = Math.min(x0, a.x, c.x); x1 = Math.max(x1, a.y, c.y); y1 = Math.max(y1, a.z); }
    FF.U.uFFCoreB.value.set(x0 - 0.2, x1 + 0.2, y1 + 0.05, 0); }
  /* darkness boxes: the pipe (squeeze pipe + main pipe), the chamber, the sump's floor */
  const dark = [[46.0, -0.78, 0.0, 7.6, 0.24, 0.62, 0.42, 0.12], [39.05, -0.5, 0.0, 0.58, 0.52, 0.62, 0.3, 0.15], [53.9, -0.75, 0.0, 0.6, 0.3, 1.3, 0.3, 0.4]];
  dark.forEach((d, k) => { FF.U.uFFDarkC.value[k].set(d[0], d[1], d[2], d[6]); FF.U.uFFDarkH.value[k].set(d[3], d[4], d[5], d[7]); });
  { let x0 = 1e9, x1 = -1e9, y1 = -1e9; for (const d of dark) { x0 = Math.min(x0, d[0] - d[3] - d[7]); x1 = Math.max(x1, d[0] + d[3] + d[7]); y1 = Math.max(y1, d[1] + d[4] + d[7]); } FF.U.uFFDarkB.value.set(x0, x1, y1, 0); }
}

/* =========================================================================================== the fixed rig + virtual handles */
const SETS = {
  VD: { K0: 'headlights', K1: 'vergeTorch', P0: 'worklight', P1: 'gateGlare', B0: 'pipeFill', B1: 'scrapeFill' },
  C:  { K0: 'window', K1: 'skylight', P0: 'opening', P1: 'walkwayDoor', B0: 'bounce', B1: 'amber' },
  SR: { K0: 'torch', K1: 'flood', P0: 'doorSpill', P1: null, B0: 'doorLamp', B1: null },
};
const SPOT_IDS = { headlights: 'K0', window: 'K0', torch: 'K0', vergeTorch: 'K1', flood: 'K1', skylight: 'K1', worklight: 'P0', opening: 'P0', doorSpill: 'P0', gateGlare: 'P1', walkwayDoor: 'P1' };
const POINT_IDS = { bounce: 'B0', doorLamp: 'B0', amber: 'B1', pipeFill: 'B0', scrapeFill: 'B1' };
/* per logical light: defaults, the cone-beam density (per unit intensity) and the shadow configuration */
const SPOT_DEF = {
  headlights: { color: '#ffe3bd', intensity: 34, angle: 24 * D2R, penumbra: 0.5, distance: 26, decay: 2, beam: 0,      /* no volume: they shine at the lens through a gate; the rain carries them */ shadow: { size: 'torchShadow', max: 1024, near: 0.3, bias: -0.0008, radius: 2.5 } },
  window:     { color: '#dfe2e4', intensity: 14.8, angle: 0.02, penumbra: 0.02, distance: 0, decay: 1, beam: 0, shadow: { size: 'shadowMap', near: 54, far: 78, bias: -0.0003, radius: 'key' } },
  torch:      { color: '#e8edf2', intensity: 26, angle: 15 * D2R, penumbra: 0.3, distance: 14, decay: 2, beam: 0.0021, shadow: { size: 'torchShadow', near: 0.1, bias: -0.0004, radius: 3 } },
  vergeTorch: { color: '#e6ecf2', intensity: 20, angle: 14 * D2R, penumbra: 0.4, distance: 10, decay: 2, beam: 0.0022, shadow: { size: 'secondShadow', near: 0.1, bias: -0.0004, radius: 2 } },
  skylight:   { color: '#dfe2e4', intensity: 4.4, angle: 2.1 * D2R, penumbra: 0.75, distance: 0, decay: 1, beam: 0.0075, pos: [61.8 + 1.28 * 40 / 1.79, 40 / 1.79 * 1.0, 0.4 - 0.62 * 40 / 1.79], target: [61.8, 0, 0.4], shadow: { size: 'secondShadow', near: 14, far: 44, bias: -0.0004, radius: 3 } },
  flood:      { color: '#cdd6df', intensity: 13, angle: 29 * D2R, penumbra: 0.55, distance: 14, decay: 2, beam: 0.0019, pos: [104.3, 6.1, -2.2], target: [102.8, 0, 0.3], shadow: { size: 'secondShadow', near: 0.5, bias: -0.0005, radius: 2.5 } },
  worklight:  { color: '#e7edf2', intensity: 10, angle: 50 * D2R, penumbra: 0.8, distance: 9, decay: 2 },
  opening:    { color: '#d3d8dc', intensity: 1.6, angle: 0.72, penumbra: 1.0, distance: 2.6, decay: 2, pos: [76.0, 1.02, -1.23], target: [76.0, 0, 1.15] },
  doorSpill:  { color: '#d9e2ea', intensity: 7, angle: 45 * D2R, penumbra: 0.6, distance: 9, decay: 2, pos: [110.0, 2.35, -4.6], target: [110.0, 0, -0.2] },
  gateGlare:  { color: '#ffe3bd', intensity: 8.0, angle: 56 * D2R, penumbra: 0.9, distance: 7.5, decay: 2, pos: [33.0, 0.24, -4.35], target: [33.0, 0, -1.8] },
  walkwayDoor:{ color: '#efe4d0', intensity: 5, angle: 40 * D2R, penumbra: 0.7, distance: 7, decay: 2, pos: [78.0, 5.3, -15.3], target: [78.0, 3.6, -13.1] },
};
const POINT_DEF = {
  bounce:   { color: '#c3c6c7', intensity: 0.33, distance: 6, pos: [72.9, 1.1, 0.25] },
  amber:    { color: '#ffae4a', intensity: 0.8, distance: 3, pos: [78.85, 3.17, -8.93] },
  doorLamp: { color: '#ffae4a', intensity: 0.6, distance: 3, pos: [110.0, 2.3, -2.9] },
  pipeFill: { color: '#9fb0c2', intensity: 0.32, distance: 1.4, pos: [0, -99, 0] },
  scrapeFill: { color: '#b8c4d0', intensity: 0.55, distance: 2.4, pos: [2.15, 0.55, 1.1] },   // dusk off the wet grass, under the title sheet
};
const toArr = v => v == null ? null : Array.isArray(v) ? v.slice(0, 3) : [v.x, v.y, v.z];
function toColor(c, out) { if (c == null) return out; if (c.isColor) return out.copy(c); return out.copy(FF.lin(typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c)); }
function makeSpotHandle(id) {
  const d = SPOT_DEF[id] || {}, st = {
    pos: (d.pos || [0, 5, 0]).slice(), target: (d.target || [0, 0, 0]).slice(), angle: d.angle || 0.4, penumbra: d.penumbra != null ? d.penumbra : 0.4,
    distance: d.distance != null ? d.distance : 20, decay: d.decay || 2, color: FF.lin(d.color || '#ffffff'), intensity: 0, on: false, beam: true, derived: 0, ext: false,
  };
  const h = {
    id, slot: SPOT_IDS[id], st,
    get light() { return rig[SPOT_IDS[id]]; },
    get active() { return owner(SPOT_IDS[id]) === id && h.effective() > 0; },
    effective() { return Math.max(st.on ? st.intensity : 0, st.derived); },
    set(o) {
      if (!o) return h;
      if (o.pos) st.pos = toArr(o.pos); if (o.target) st.target = toArr(o.target);
      for (const k of ['angle', 'penumbra', 'distance', 'decay']) if (o[k] != null) st[k] = o[k];
      if (o.color != null) toColor(o.color, st.color);
      if (o.intensity != null) { st.intensity = o.intensity; if (o.intensity > 0) st.on = true; }
      st.ext = true; return h;
    },
    on(v) { st.on = v !== false; st.ext = true; if (st.on && !(st.intensity > 0)) st.intensity = d.intensity || 1; return h; },
    beam(v) { st.beam = v !== false; return h; },
  };
  return h;
}
function makePointHandle(id) {
  const d = POINT_DEF[id] || {}, st = { pos: (d.pos || [0, 0, 0]).slice(), color: FF.lin(d.color || '#ffffff'), intensity: 0, distance: d.distance || 3, on: false, derived: 0 };
  const h = {
    id, slot: POINT_IDS[id], st,
    get light() { return rig[POINT_IDS[id]]; },
    effective() { return Math.max(st.on ? st.intensity : 0, st.derived); },
    set(o) { if (!o) return h; if (o.pos) st.pos = toArr(o.pos); if (o.color != null) toColor(o.color, st.color); if (o.distance != null) st.distance = o.distance; if (o.intensity != null) { st.intensity = o.intensity; if (o.intensity > 0) st.on = true; } return h; },
    on(v) { st.on = v !== false; if (st.on && !(st.intensity > 0)) st.intensity = d.intensity || 1; return h; },
  };
  return h;
}
const S = { mine: {}, set: 'VD', look: { from: 'verge', to: 'verge', t: 0 }, lookKey: '', transitK: 0, thud0: -1, thudPeriod: 4.0, entryOpen: 0, amberFlag: false, walkwayT: -1, frameN: 0, shadowCfg: {} };
function owner(slot) { return (SETS[S.set] || {})[slot] || null; }

function buildRig() {
  const mkSpot = (name, shadow) => {
    const s = new T.SpotLight(0xffffff, 0, 20, 0.4, 0.4, 2); s.name = name; s.castShadow = !!shadow;
    if (shadow) { s.shadow.mapSize.set(16, 16); s.shadow.radius = -1; s.shadow.autoUpdate = false; s.shadow.bias = -0.0004; s.shadow.normalBias = 0.02; }
    root.add(s); root.add(s.target); return s;
  };
  rig.H = new T.HemisphereLight(0xffffff, 0x000000, 0.8); rig.H.name = 'H'; root.add(rig.H);
  rig.K0 = mkSpot('K0', true); rig.K1 = mkSpot('K1', true);
  rig.D0 = new T.DirectionalLight(0xffffff, 0); rig.D0.name = 'D0'; rig.D0.castShadow = true; rig.D0.shadow.mapSize.set(16, 16);
  Object.assign(rig.D0.shadow.camera, { left: -13, right: 13, top: 10, bottom: -6, near: 1, far: 90 }); rig.D0.shadow.camera.updateProjectionMatrix();
  rig.D0.shadow.radius = -1; rig.D0.shadow.autoUpdate = false; rig.D0.shadow.bias = -0.0006; rig.D0.shadow.normalBias = 0.03;
  root.add(rig.D0); root.add(rig.D0.target);
  rig.D1 = new T.DirectionalLight(0xffffff, 0); rig.D1.name = 'D1'; root.add(rig.D1); root.add(rig.D1.target);
  rig.P0 = mkSpot('P0', false); rig.P1 = mkSpot('P1', false);
  rig.B0 = new T.PointLight(0xffffff, 0, 6, 2); rig.B0.name = 'B0'; rig.B1 = new T.PointLight(0xffae4a, 0, 3, 2); rig.B1.name = 'B1'; root.add(rig.B0); root.add(rig.B1);
  for (const id in SPOT_IDS) H[id] = makeSpotHandle(id);
  for (const id in POINT_IDS) H[id] = makePointHandle(id);
}
/* shadow configuration for whoever owns K0 / K1 now; dormant = radius -1, no updates, a 16x16 map */
function sizeFor(cfg) { const t = FF.tier || {}; let s = t[cfg.size] != null ? t[cfg.size] : 1024; if (cfg.max) s = Math.min(s, cfg.max); return s | 0; }
function setMap(L, size) { const sz = Math.max(16, size | 0); if (L.shadow.mapSize.x !== sz) { L.shadow.mapSize.set(sz, sz); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } } }
function dormant(L) { L.shadow.radius = -1; L.shadow.autoUpdate = false; L.shadow.needsUpdate = false; L.userData.rad = 0; setMap(L, 16); }
/* a light switched off for a moment (the torch during a turn): no taps, no updates, but keep its map for when it comes back */
function sleep(L) { if (L.shadow.radius >= 0) L.userData.rad = L.shadow.radius; L.shadow.radius = -1; L.shadow.autoUpdate = false; L.shadow.needsUpdate = false; }
function configShadow(slot, id) {
  const L = rig[slot], key = slot + ':' + id + ':' + (FF.tier && FF.tier.name);
  if (S.shadowCfg[slot] === key) { if (L.shadow.radius < 0 && L.userData.rad > 0) { L.shadow.radius = L.userData.rad; L.shadow.needsUpdate = true; } return; }
  S.shadowCfg[slot] = key;
  const cfg = id && SPOT_DEF[id] && SPOT_DEF[id].shadow;
  if (!cfg) { dormant(L); return; }
  const size = sizeFor(cfg); if (!size) { dormant(L); return; }
  setMap(L, size);
  const cam = L.shadow.camera; cam.near = cfg.near; if (cfg.far) cam.far = cfg.far; cam.updateProjectionMatrix();
  L.shadow.bias = cfg.bias; L.shadow.normalBias = 0.02; L.shadow.focus = 1;
  L.shadow.radius = cfg.radius === 'key' ? Math.max(1, (World.look.key.shadowSoftness || 22) * size / 2048) : cfg.radius * Math.sqrt(size / 1024);
  L.userData.rad = L.shadow.radius; L.shadow.autoUpdate = true; L.shadow.needsUpdate = true;
}
/* the window key's pose from the live look (the look test's: a far spot whose cone just contains the window beam) */
function windowPose(h, L) {
  const K = L.key, d = new T.Vector3(K.dir[0], K.dir[1], K.dir[2]).normalize(), FAR = 70, edgeR = Math.hypot(K.halfDepth, K.halfWidth) * 1.05;
  const p = K.poolCenter; h.st.target = [p[0], p[1], p[2]]; h.st.pos = [p[0] - d.x * FAR, p[1] - d.y * FAR, p[2] - d.z * FAR];
  h.st.angle = Math.atan(edgeR / FAR); h.st.penumbra = 0.02; h.st.distance = 0; h.st.decay = 1; toColor(K.color, h.st.color); h.st.derived = K.intensity;
}
const _v = new T.Vector3();
function applySpot(slot) {
  const L = rig[slot], id = owner(slot), h = id && H[id];
  if (!h) { L.intensity = 0; if (L.castShadow) configShadow(slot, null); return; }
  const st = h.st, I = h.effective();
  L.position.set(st.pos[0], st.pos[1], st.pos[2]); L.target.position.set(st.target[0], st.target[1], st.target[2]); L.target.updateMatrixWorld();
  L.angle = st.angle; L.penumbra = st.penumbra; L.distance = st.distance; L.decay = st.decay; L.color.copy(st.color); L.intensity = I;
  if (L.castShadow) {
    if (I > 0) {
      configShadow(slot, id);
      if (L.shadow.radius < 0) return;                // this tier has no map for it (low: the second shadow is off)
      /* shadow budget (§13: at most two maps a frame): the headlights' map is live only while the rabbit is on the Verge (then
         frozen, re-rendered when the van or the gate moves); the floodlight's only when someone is inside its patch */
      if (id === 'headlights') { const r = FF.G.rabbit, live = !r || r.x < 38.5; L.shadow.autoUpdate = live; if (!live && moved(slot, L)) L.shadow.needsUpdate = true; }
      else if (id === 'flood') { const r = FF.G.rabbit, s = FF.G.searcher; const inP = x => x > 98.5 && x < 108.5; L.shadow.autoUpdate = !!((r && inP(r.x)) || (s && s.active && inP(s.x))); if (moved(slot, L)) L.shadow.needsUpdate = true; }
      else if (id === 'skylight') { const r = FF.G.rabbit; L.shadow.autoUpdate = !!(r && r.x > 59.0 && r.x < 64.6); if (moved(slot, L)) L.shadow.needsUpdate = true; }
      else L.shadow.autoUpdate = true;
    } else sleep(L);
  }
}
const lastPose = {};
function moved(slot, L) {
  const k = [L.position.x, L.position.y, L.position.z, L.target.position.x, L.target.position.y, L.target.position.z, gateKey()].map(v => typeof v === 'number' ? v.toFixed(2) : v).join(',');
  if (lastPose[slot] === k) return false; lastPose[slot] = k; return true;
}
function gateKey() { const a = props.gateLeafL, b = props.gateLeafR; return a && b ? (a.position.x + b.position.x + a.rotation.z + b.rotation.z + a.position.y).toFixed(3) : ''; }
function applyPoint(slot) {
  const L = rig[slot], id = owner(slot), h = id && H[id];
  if (!h) { L.intensity = 0; return; }
  const st = h.st; L.position.set(st.pos[0], st.pos[1], st.pos[2]); L.color.copy(st.color); L.distance = st.distance;
  let I = h.effective();
  if (id === 'bounce' && FF.tier && !FF.tier.bounce) I = 0;
  if ((id === 'amber' || id === 'doorLamp' || (POINT_DEF[id] && POINT_DEF[id].amberTier)) && FF.tier && !FF.tier.amberLight) I = 0;
  L.intensity = I;
}

/* =========================================================================================== cone beams (read the shadow map) */
const beams = {};
function makeConeBeam(slot) {
  const g = new T.ConeGeometry(1, 1, 32, 1, true); g.translate(0, -0.5, 0);
  const u = {
    uA: { value: new T.Vector3() }, uD: { value: new T.Vector3(0, -1, 0) }, uCos: { value: new T.Vector2(0.9, 0.95) }, uRange: { value: 10 },
    uCol: { value: new T.Color() }, uFloor: { value: 0 }, uLen: { value: 2 }, tShadow: { value: null }, uSM: { value: new T.Matrix4() }, uHasSM: { value: 0 },
    uInside: { value: 0 }, uMask: { value: 0 }, uFogB: { value: new T.Vector2(0.03, 6) }, uFall: { value: new T.Vector2(0.10, 99) },
    uFFCoreX: FF.U.uFFCoreX, uFFCoreZ: FF.U.uFFCoreZ, uFFCoreOn: FF.U.uFFCoreOn, uFFCovX: FF.U.uFFCovX, uFFCoverFull: FF.U.uFFCoverFull, uFFCoreB: FF.U.uFFCoreB,
  };
  const m = new T.ShaderMaterial({
    uniforms: u, defines: { SAMPLES: 8 },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `#include <packing>
      uniform vec3 uA, uD, uCol; uniform vec2 uCos, uFogB, uFall; uniform float uRange, uFloor, uLen, uHasSM, uInside, uMask; uniform sampler2D tShadow; uniform mat4 uSM; varying vec3 vW;
      ${CORE_GLSL}
      float beamAt( vec3 p ) {
        vec3 q = p - uA; float al = dot( q, uD );
        if ( al <= 0.02 || al > uRange || p.y < uFloor ) return 0.0;
        float c = al / max( length( q ), 1e-4 );
        float k = smoothstep( uCos.x, uCos.y, c ); if ( k <= 0.0 ) return 0.0;
        float lit = 1.0;
        if ( uHasSM > 0.5 ) { vec4 sc = uSM * vec4( p, 1.0 ); sc.xyz /= sc.w;
          if ( sc.x > 0.0 && sc.x < 1.0 && sc.y > 0.0 && sc.y < 1.0 && sc.z < 1.0 ) lit = step( sc.z - 0.0025, unpackRGBAToDepth( texture2D( tShadow, sc.xy ) ) ); }
        if ( uMask > 0.5 ) lit *= ffCoreMaskF( p, uMask > 1.5 ? 1.0 : 0.0 );
        return k * lit / ( 1.0 + uFall.x * al * al ) * ( 1.0 - smoothstep( 0.65 * uRange, uRange, al ) ) * ( 1.0 - smoothstep( uFall.y - 3.0, uFall.y, p.y ) );
      }
      void main(){
        vec3 o = cameraPosition, v = normalize( vW - o ); float tw = length( vW - o ), t0, t1;
        if ( gl_FrontFacing ) { if ( uInside > 0.5 ) discard; t0 = tw; t1 = tw + uLen; } else { if ( uInside < 0.5 ) discard; t0 = 0.1; t1 = tw; }
        float jit = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
        float acc = 0.0;
        for ( int i = 0; i < SAMPLES; i ++ ) { float t = mix( t0, t1, ( float( i ) + jit ) / float( SAMPLES ) ); acc += beamAt( o + v * t ) * exp( - uFogB.x * max( t - uFogB.y, 0.0 ) ); }
        gl_FragColor = vec4( uCol * acc * ( t1 - t0 ) / float( SAMPLES ), 1.0 );
      }`,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation,
    depthWrite: false, depthTest: true, transparent: true, side: T.DoubleSide,
  });
  const me = new T.Mesh(g, m); me.frustumCulled = false; me.renderOrder = 9; me.name = 'beam:' + slot; me.visible = false; root.add(me);
  beams[slot] = { mesh: me, mat: m };
}
const _d = new T.Vector3(), _q = new T.Quaternion(), _up = new T.Vector3(0, -1, 0);
function updateBeam(slot) {
  const b = beams[slot], L = rig[slot], id = owner(slot), h = id && H[id], def = id && SPOT_DEF[id];
  const on = !!(h && def && def.beam && h.st.beam && L.intensity > 0);
  b.mesh.visible = on; if (!on) return;
  const u = b.mat.uniforms, A = L.position; _d.subVectors(L.target.position, A).normalize();
  const range = L.distance > 0 ? L.distance : _v.subVectors(L.target.position, A).length() * 1.04, R = range * Math.tan(Math.min(L.angle, 1.3)) * 1.05;
  b.mesh.position.copy(A); b.mesh.quaternion.setFromUnitVectors(_up, _d); b.mesh.scale.set(R, range, R); b.mesh.updateMatrixWorld();
  u.uA.value.copy(A); u.uD.value.copy(_d); u.uRange.value = range; u.uLen.value = Math.min(2 * R * 1.15, range);
  u.uCos.value.set(Math.cos(L.angle), Math.cos(L.angle * (1 - L.penumbra * 0.85)));
  u.uCol.value.copy(L.color).multiplyScalar(L.intensity * def.beam);
  u.uFloor.value = id === 'vergeTorch' && A.y < 0.5 ? -1.0 : (FF.G.rabbit && FF.G.rabbit.y < -0.5 ? -1.0 : 0.0);
  u.uMask.value = id === 'torch' ? 1 : id === 'flood' ? (L.shadow.radius < 0 ? 2 : 1) : 0;
  if (id === 'skylight') u.uFall.value.set(0.0, 10.5); else u.uFall.value.set(0.10, 99);
  const cam = ctx.camera.position; const q = _v.subVectors(cam, A), al = q.dot(_d);
  u.uInside.value = al > 0 && al < range && al / Math.max(q.length(), 1e-4) > Math.cos(L.angle) ? 1 : 0;
  const sm = L.shadow && L.shadow.map && L.shadow.radius >= 0;
  u.uHasSM.value = sm ? 1 : 0; if (sm) { u.tShadow.value = L.shadow.map.texture; u.uSM.value.copy(L.shadow.matrix); }
  u.uFogB.value.set(World.look.fog.density * 0.8, World.look.fog.start);
}

/* =========================================================================================== the Courtyard's window beam + dust */
let winBeam = null, motes = null;
function buildWindowBeam(P) {
  const L = FULL.courtyard, K = L.key, TOPY = 10.5, WALLZ = -5.0;
  const m = new T.ShaderMaterial({
    uniforms: Object.assign({ uCol: { value: FF.lin(L.shafts.color) }, uDens: { value: L.shafts.density }, uWallZ: { value: WALLZ }, uTopY: { value: TOPY }, uFogD: { value: L.fog.density }, uBase: { value: L.shafts.base }, uGain: { value: 1 } }, FF.U),
    defines: { SAMPLES: 10 },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: FF.GLSL_KEY + `
      uniform vec3 uCol; uniform float uDens, uWallZ, uTopY, uFogD, uBase, uGain; varying vec3 vW;
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
          float t = mix(t0, t1, (float(i) + jit) / float(SAMPLES)); vec3 p = o + v * t;
          float hz = smoothstep(uTopY, uTopY - 4.0, p.y) * smoothstep(0.0, 0.7, p.y);
          acc += ffKeyMask(p) * hz * (uBase + ffBands(p)) * exp(-uFogD * max(t - 6.0, 0.0));
        }
        gl_FragColor = vec4(uCol * uGain * uDens * acc / float(SAMPLES) * (t1 - t0), 1.0);
      }`,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, blendEquation: T.AddEquation,
    depthWrite: false, depthTest: true, transparent: true, side: T.FrontSide,
  });
  const d = new T.Vector3(K.dir[0], K.dir[1], K.dir[2]).normalize(), e1 = new T.Vector3(0, 1, 0).cross(d).normalize(), e2 = d.clone().cross(e1).normalize(), up = d.clone().negate(), len = TOPY / -d.y + 2;
  const e2m = e2.clone();
  if (e1.clone().cross(up).dot(e2) < 0) e2.negate();
  const g = new T.BoxGeometry(K.halfDepth * 2.04, len, K.halfWidth * 2.04); g.translate(0, len / 2 - 1.2, 0);
  const me = new T.Mesh(g, m); me.matrixAutoUpdate = false; me.matrix.makeBasis(e1, up, e2).setPosition(new T.Vector3(K.poolCenter[0], K.poolCenter[1], K.poolCenter[2])); me.updateMatrixWorld(true);
  me.renderOrder = 10; me.frustumCulled = false; me.name = 'windowBeam'; P.obj(me);
  winBeam = me;
  /* dust drifting through the light (high tier) */
  const N = (L.shafts.motes || 320), Pp = new Float32Array(N * 3), R = new Float32Array(N), pool = new T.Vector3(...K.poolCenter);
  let i = 0, guard = 0;
  while (i < N && guard++ < N * 60) {
    const y = 0.05 + rnd() * 4.6;
    const c = pool.clone().addScaledVector(e1, (rnd() * 2 - 1) * K.halfDepth * 0.9).addScaledVector(e2m, (rnd() * 2 - 1) * K.halfWidth * 0.9);
    const t = (y - c.y) / -d.y, p = c.addScaledVector(d, -t); if (p.z < WALLZ + 0.05 || p.z > 3) continue;
    Pp[i * 3] = p.x; Pp[i * 3 + 1] = p.y; Pp[i * 3 + 2] = p.z; R[i] = rnd(); i++;
  }
  const mg = new T.BufferGeometry(); mg.setAttribute('position', new T.BufferAttribute(Pp, 3)); mg.setAttribute('rnd', new T.BufferAttribute(R, 1));
  const mm = new T.ShaderMaterial({
    uniforms: Object.assign({ uCol: { value: FF.lin(L.shafts.color).multiplyScalar(1.4) }, uPx: { value: 1 } }, FF.U),
    vertexShader: FF.GLSL_KEY + `attribute float rnd; uniform float uPx; varying float vA;
      void main(){ vec3 p = position; float t = uFFTime * (0.15 + 0.2 * rnd) + rnd * 40.0;
        p += vec3(sin(t * 0.7) * 0.05, -mod(uFFTime * 0.012 + rnd * 3.0, 0.25) + sin(t) * 0.03, cos(t * 0.6) * 0.05);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (1.1 + 1.4 * fract(rnd * 7.3)) * (7.0 / -mv.z);
        vA = (0.3 + 0.7 * fract(rnd * 13.7)) * (0.6 + 0.4 * sin(t * 2.3)) * ffKeyMask(p) * (0.25 + ffBands(p)); }`,
    fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(uCol * a * vA * 0.45, 1.0); }',
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true,
  });
  motes = new T.Points(mg, mm); motes.frustumCulled = false; motes.renderOrder = 11; motes.name = 'motes'; P.obj(motes);
}

/* =========================================================================================== rain, splashes, drips */
let rain = null, splash = null, drips = null, slabRain = null;
const RAIN_MAX = 4000, SPLASH_MAX = 240, DRIP_MAX = 60;
function buildRain() {
  const N = RAIN_MAX, P = new Float32Array(N * 6), Sd = new Float32Array(N * 8), E = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { const s = [rnd(), rnd(), rnd(), rnd()]; for (let e = 0; e < 2; e++) { Sd.set(s, (i * 2 + e) * 4); E[i * 2 + e] = e; } }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('seed', new T.BufferAttribute(Sd, 4)); g.setAttribute('end', new T.BufferAttribute(E, 1));
  const m = new T.ShaderMaterial({
    uniforms: { uMin: { value: new T.Vector3() }, uSize: { value: new T.Vector3(22, 8, 16) }, uTime: FF.U.uFFTime, uLen: { value: 0.42 }, uSpd: { value: 9 }, uWind: { value: 0.18 }, uRate: { value: 1 },
      uCol: { value: FF.lin('#c9d2da').multiplyScalar(0.07) },
      /* Sequence 2: inside the Works the rain falls only through the broken roof and stops on the platens' tops (FF.WorldS2.rain) */
      uS2: { value: 0 }, uS2X: { value: Array.from({ length: 6 }, () => new T.Vector4(0, 0, 0, 0)) }, uS2B: { value: Array.from({ length: 4 }, () => new T.Vector4(0, 0, 0, 0)) }, uFloorY: { value: -0.02 },
      uHL: { value: new T.Vector3(0, -99, 0) }, uHLd: { value: new T.Vector3(0, 0, 1) }, uHLc: { value: new T.Vector2(0.9, 0) }, uHLcol: { value: FF.lin('#ffe3bd').multiplyScalar(0.6) }, uWL: { value: new T.Vector3(0, -99, 0) }, uWLd: { value: new T.Vector3(0, -1, 0) }, uWLc: { value: new T.Vector2(0.9, 0) }, uWLcol: { value: FF.lin('#e7edf2').multiplyScalar(0.5) } },
    vertexShader: `attribute vec4 seed; attribute float end; uniform vec3 uMin, uSize, uHL, uHLd, uWL, uWLd; uniform vec2 uHLc, uWLc; uniform float uTime, uLen, uSpd, uWind, uRate; varying float vA; varying float vHL; varying float vWL;
      uniform float uS2, uFloorY; uniform vec4 uS2X[6]; uniform vec4 uS2B[4];
      void main(){
        vec3 p; p.x = uMin.x + mod(seed.x * uSize.x - uMin.x, uSize.x); p.z = uMin.z + seed.z * uSize.z;
        float sp = uSpd * (0.8 + 0.4 * seed.w); p.y = uMin.y + mod(seed.y * uSize.y - uTime * sp, uSize.y);
        vec3 dir = normalize(vec3(uWind, -1.0, 0.05)); p -= dir * (uLen * end);
        float keep = step(seed.w, uRate);
        if (p.y < uFloorY) keep = 0.0;
        if (uS2 > 0.5) {
          float ok = 0.0;
          for (int k = 0; k < 6; k++) { vec4 a = uS2X[k]; if (a.y > a.x && p.x >= a.x && p.x <= a.y && p.z >= a.z && p.z <= a.w) ok = 1.0; }
          keep *= ok;
          for (int k = 0; k < 4; k++) { vec4 b = uS2B[k]; if (b.w > 0.5 && p.x >= b.x && p.x <= b.y && p.y <= b.z && p.z > -3.5 && p.z < 0.7) keep = 0.0; }
        }
        if (p.x > 0.3 && p.x < 2.7 && p.y < mix(1.86, 0.99, clamp((p.x - 0.35) / 2.31, 0.0, 1.0)) && p.z > -1.1 && p.z < 0.8) keep = 0.0;   /* dry beneath the title shelter */
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; float d = -mv.z;
        vA = keep * (0.3 + 0.7 * fract(seed.w * 7.13)) * smoothstep(1.2, 3.5, d) * (1.0 - smoothstep(14.0, 24.0, d)) * (1.0 - end * 0.85);
        vec3 q = p - uHL; float al = dot(q, uHLd); float c = al / max(length(q), 1e-3);
        vHL = uHLc.y * step(0.0, al) * smoothstep(uHLc.x, uHLc.x + 0.06, c) / (1.0 + 0.05 * al * al);
        vec3 w = p - uWL; float aw = dot(w, uWLd); float cw = aw / max(length(w), 1e-3);
        vWL = uWLc.y * step(0.0, aw) * smoothstep(uWLc.x, uWLc.x + 0.1, cw) / (1.0 + 0.15 * aw * aw);
      }`,
    fragmentShader: 'uniform vec3 uCol, uHLcol, uWLcol; varying float vA; varying float vHL; varying float vWL; void main(){ gl_FragColor = vec4((uCol + uHLcol * vHL + uWLcol * vWL) * vA, 1.0); }',
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, depthTest: true, transparent: true,
  });
  rain = new T.LineSegments(g, m); rain.frustumCulled = false; rain.renderOrder = 12; rain.name = 'rain'; root.add(rain);
  /* the rain through the cracked slab at 46: a narrow column down the shaft into the pipe */
  { const n = 70, Pp = new Float32Array(n * 6), Sd2 = new Float32Array(n * 8), E2 = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const s = [rnd(), rnd(), rnd(), rnd()]; for (let e = 0; e < 2; e++) { Sd2.set(s, (i * 2 + e) * 4); E2[i * 2 + e] = e; } }
    const g2 = new T.BufferGeometry(); g2.setAttribute('position', new T.BufferAttribute(Pp, 3)); g2.setAttribute('seed', new T.BufferAttribute(Sd2, 4)); g2.setAttribute('end', new T.BufferAttribute(E2, 1));
    const m2 = m.clone(); m2.uniforms.uTime = FF.U.uFFTime; m2.uniforms.uMin.value.set(46.25, -1.0, -0.35); m2.uniforms.uSize.value.set(0.3, 1.2, 0.6);
    m2.vertexShader = m.vertexShader.replace('smoothstep(1.2, 3.5, d)', '1.0'); m2.uniforms.uFloorY.value = -0.99;
    m2.uniforms.uCol.value = FF.lin('#c9d2da').multiplyScalar(0.1);
    slabRain = new T.LineSegments(g2, m2); slabRain.frustumCulled = false; slabRain.renderOrder = 12; slabRain.name = 'slabRain'; places.drain.obj(slabRain); }
  /* splashes on the grass (cheap: points that blink) */
  { const n = SPLASH_MAX, Pp = new Float32Array(n * 3), Sd3 = new Float32Array(n * 3); for (let i = 0; i < n; i++) Sd3.set([rnd(), rnd(), rnd()], i * 3);
    const g3 = new T.BufferGeometry(); g3.setAttribute('position', new T.BufferAttribute(Pp, 3)); g3.setAttribute('seed', new T.BufferAttribute(Sd3, 3));
    const m3 = new T.ShaderMaterial({
      uniforms: { uMin: { value: new T.Vector3() }, uSize: { value: new T.Vector3(18, 0, 6) }, uTime: FF.U.uFFTime, uRate: { value: 1 }, uCol: { value: FF.lin('#c9d2da').multiplyScalar(0.5) }, uPx: { value: 1 } },
      vertexShader: `attribute vec3 seed; uniform vec3 uMin, uSize; uniform float uTime, uRate, uPx; varying float vA;
        void main(){ float cyc = uTime * (1.3 + seed.z) + seed.y * 17.0; float k = floor(cyc); float f = fract(cyc);
          vec3 p = vec3(uMin.x + mod(fract(seed.x + k * 0.6180339) * uSize.x - uMin.x, uSize.x), 0.02, uMin.z + fract(seed.y * 3.7 + k * 0.3819) * uSize.z);
          float keep = step(seed.z, uRate) * step(p.x, 38.4) * (1.0 - step(0.3, p.x) * step(p.x, 2.7) * step(-1.1, p.z) * step(p.z, 0.8));
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          vA = keep * smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.03, 0.14, f)); gl_PointSize = uPx * (2.0 + 6.0 * f) * (6.0 / -mv.z); }`,
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; c.y *= 3.0; float r = length(c); float a = smoothstep(0.5, 0.3, r) * smoothstep(0.1, 0.3, r); gl_FragColor = vec4(uCol * a * vA, 1.0); }',
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true,
    });
    splash = new T.Points(g3, m3); splash.frustumCulled = false; splash.renderOrder = 12; splash.name = 'splash'; root.add(splash); }
  /* drips at fixed edges, in every place (60 / 30 / 10) */
  { const src = [
      [2.62, 0.96, -0.6], [2.6, 0.97, 0.2], [2.55, 0.98, 0.5], [17.1, 2.2, -0.9], [39.0, -0.56, 0.1], [39.3, -0.56, -0.2], [46.1, -0.04, 0.2], [46.6, -0.04, -0.1], [44.0, -0.56, 0.05], [50.5, -0.56, -0.2],
      [53.0, 13.0, -0.4], [59.5, 12.0, -1.0], [61.4, 12.0, 0.6], [64.6, 12.0, -2.0], [66.0, 12.0, 1.0], [68.3, 12.0, -0.3], [73.0, 3.2, -4.4], [73.95, 2.35, -4.4], [80.2, 12.0, 0.9],
      [92.0, 0.66, 0.3], [94.5, 0.66, 0.45], [97.9, 0.66, -0.2], [103.4, 0.25, 0.4], [105.0, 0.3, 0.6], [107.25, 0.22, 0.5], [110.6, 2.6, -3.1], [96.0, 4.5, -1.6], [101.2, 7.0, 1.4], [108.9, 6.0, 0.8], [112.9, 3.2, 0.5],
      [119.7, 0.3, 0.3], [121.3, 0.27, 0.45], [123.3, 0.3, 0.2], [116.4, 0.9, -2.4], [125.0, 0.9, -2.4]];
    const n = DRIP_MAX, Pp = new Float32Array(n * 3), A = new Float32Array(n * 4), Y1 = new Float32Array(n);
    for (let i = 0; i < n; i++) { const s = src[i % src.length]; Pp.set([s[0] + (rnd() - 0.5) * 0.08, s[1], s[2] + (rnd() - 0.5) * 0.08], i * 3); A.set([1.2 + rnd() * 2.6, rnd() * 10, 0, 0], i * 4); Y1[i] = FF.Level.floorUnder(s[0], 0.01, s[1] - 0.02, 0) + 0.005; }
    const g4 = new T.BufferGeometry(); g4.setAttribute('position', new T.BufferAttribute(Pp, 3)); g4.setAttribute('per', new T.BufferAttribute(A, 4)); g4.setAttribute('y1', new T.BufferAttribute(Y1, 1));
    const m4 = new T.ShaderMaterial({
      uniforms: { uTime: FF.U.uFFTime, uCol: { value: FF.lin('#c9d2da').multiplyScalar(0.55) }, uPx: { value: 1 } },
      vertexShader: `attribute vec4 per; attribute float y1; uniform float uTime, uPx; varying float vA;
        void main(){ float t = mod(uTime + per.y, per.x); float fall = position.y - y1; float tf = sqrt(2.0 * max(fall, 0.01) / 9.8);
          float hang = 0.6; float tt = t - hang; vec3 p = position; p.y -= tt > 0.0 ? 4.9 * tt * tt : 0.0;
          vA = (tt < 0.0 ? 0.25 + 0.5 * (t / hang) : 1.0) * (1.0 - step(tf, tt));
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * 2.2 * (6.0 / -mv.z); }`,
      fragmentShader: 'uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; c.y *= 0.6; float a = smoothstep(0.5, 0.15, length(c)); gl_FragColor = vec4(uCol * a * vA, 1.0); }',
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true,
    });
    drips = new T.Points(g4, m4); drips.frustumCulled = false; drips.renderOrder = 12; drips.name = 'drips'; root.add(drips); }
}

/* =========================================================================================== grass */
const grassSets = [];
function grassMat() {
  const m = FF.mat({ color: '#ffffff', roughness: 0.9, noAO: true });
  const ob = m.onBeforeCompile, key = m.customProgramCacheKey;
  m.onBeforeCompile = sh => {
    ob(sh);
    sh.vertexShader = 'uniform float uFFTime;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ffPh = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.7;
        #else
          float ffPh = 0.0;
        #endif
        float ffW = position.y * position.y;
        transformed.x += ffW * ( 0.05 * sin( uFFTime * 1.7 + ffPh ) + 0.025 * sin( uFFTime * 3.3 + ffPh * 1.7 ) );
        transformed.z += ffW * 0.02 * sin( uFFTime * 2.3 + ffPh );`)
      .replace('vFFW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;', `
        #ifdef USE_INSTANCING
          vFFW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
        #else
          vFFW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
        #endif`);
  };
  m.customProgramCacheKey = () => key() + '|grass';
  return m;
}
function grass(P, n, x0, x1, z0, z1, h0, h1, col, opt) {
  opt = opt || {};
  const g = new T.ConeGeometry(opt.r || 0.011, 1, 3, 1); g.translate(0, 0.5, 0);
  const im = new T.InstancedMesh(g, extra.grassMat || (extra.grassMat = grassMat()), n), o = new T.Object3D(), c = FF.lin(col), cc = new T.Color();
  let k = 0;
  for (let i = 0; i < n * 6 && k < n; i++) {
    const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
    if (opt.skip && opt.skip(x, z)) continue;
    const h = h0 + Math.pow(rnd(), 1.6) * (h1 - h0);
    o.position.set(x, opt.y ? opt.y(x, z) : FF.Level.groundY(x) - 0.01, z); o.rotation.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5 + (opt.lean || 0)); o.scale.set(1 + rnd(), h, 1 + rnd()); o.updateMatrix();
    im.setMatrixAt(k, o.matrix); cc.copy(c).multiplyScalar(0.7 + rnd() * 0.6); im.setColorAt(k, cc); k++;
  }
  im.count = k; im.userData.max = k; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.name = 'grass';
  (opt.back ? P.back : P.group).add(im); grassSets.push({ im, share: opt.share || 0 }); return im;
}

/* =========================================================================================== THE VERGE (x -6 .. 38.5): dusk, rain */
let joints = null, wallGlow = null;
function buildVerge() {
  const P = place('verge', -60, 39.0), WZ = -4.2;
  /* ground: wet grass following the profile, from the wall to the camera; its end at 38.5 is cut (the drain is in section) */
  P.add('grass', profileGeo(-60, 38.5, WZ, 7.0, -3.0, 0, true));
  P.add('section', quadGeo([[38.5, -3.0, 7.0], [38.5, -3.0, 0.45], [38.5, FF.Level.groundY(38.49), 0.45], [38.5, FF.Level.groundY(38.49), 7.0]]));
  P.add('wet', profileGeo(36.2, 38.5, -0.55, 0.42, 0, 0.004, false));                   // the gutter running to the culvert
  for (const [x, w, z, d] of [[7.4, 1.6, 1.0, 0.5], [13.2, 2.2, -1.6, 0.6], [24.6, 1.8, 0.9, 0.45], [29.2, 2.6, -2.0, 0.7]]) { const g = new T.CircleGeometry(1, 18); g.rotateX(-Math.PI / 2); g.scale(w / 2, 1, d); g.translate(x, FF.Level.groundY(x) + 0.006, z); P.add('wet', g); }
  /* the outskirts to the left, where the rabbit comes from: open fields, low far shapes in bright mist */
  P.bg('grassFar', B(-220, 4.2, -0.6, 0.0, -210, WZ));
  for (const [x, z, w, h, d] of [[-30, -70, 70, 6, 24], [-95, -120, 90, 10, 30], [10, -62, 40, 4, 14]]) P.bg('farNight', dome(x, z, w, h, d));
  for (const [x, z, h] of [[-22, -52, 9], [-19, -55, 7.5], [-40, -80, 14]]) P.bg('far', CY(0.12, h, x, 0, z, 6));         // far poles
  /* receding layers in the mist: a hedge line, bare trees, fence posts (dark forms the fog greys by distance) */
  for (let i = 0; i < 40; i++) P.bg('thicket', lump(0.6 + rnd() * 0.9, -40 + rnd() * 44, 0.3, -17 - rnd() * 3, 1.6, 0.8 + rnd() * 0.5, 1));
  for (let i = 0; i < 16; i++) { const x = -34 + rnd() * 36, z = -22 - rnd() * 16, h = 4 + rnd() * 5; P.bg('thicket', CY(0.08 + rnd() * 0.06, h, x, 0, z, 5, 0.03));
    for (let j = 0; j < 4; j++) { const g = new T.CylinderGeometry(0.015, 0.04, 1.4 + rnd() * 1.8, 4); g.translate(0, 0.7, 0); g.rotateZ((rnd() - 0.5) * 1.6); g.translate(x, h * (0.45 + rnd() * 0.5), z); P.bg('thicket', g); } }
  for (let x = -24; x < 3.6; x += 2.4) P.bg('timber', B(x, x + 0.08, 0, 1.1 + rnd() * 0.25, -9.2, -9.12));
  P.bg('metal', B(-24, 3.6, 0.95, 0.97, -9.2, -9.18));
  /* the thicket: the left boundary, a dense dark tangle across the lane */
  for (let i = 0; i < 150; i++) { const x = -6.0 + rnd() * 6.4, edge = clamp((x + 0.6) / 1.2, 0, 1), r = 0.14 + rnd() * 0.3 * (1 - 0.5 * edge);
    P.add('thicket', lump(r, x, 0.08 + rnd() * (2.9 - 1.2 * edge), -4.0 + rnd() * 4.9, 1.3, 0.55 + rnd() * 0.6, 1.1), true); }
  for (let i = 0; i < 26; i++) { const g = new T.CylinderGeometry(0.006, 0.018, 0.8 + rnd() * 1.8, 4); g.translate(0, 0.4, 0); g.rotateZ((rnd() - 0.3) * 1.1); g.rotateX((rnd() - 0.5) * 0.6); g.translate(-1.2 + rnd() * 1.9, 0.6 + rnd() * 2.2, -3.2 + rnd() * 4.2); P.add('thicket', g, true); }
  /* A5: the title shelter, a sheet of hoarding leaning out from the thicket edge (underside 0.95 over the scrape) */
  { const x0 = 0.35, y0 = 1.85, x1 = 2.66, y1 = 0.99, len = Math.hypot(x1 - x0, y0 - y1), a = Math.atan2(y0 - y1, x1 - x0);
    const g = corrugated(len, 1.85, 8, 0.02); g.rotateX(22 * D2R); g.rotateZ(-a); g.translate((x0 + x1) / 2, (y0 + y1) / 2 + 0.06, -0.15); P.add('sheet', g, true);
    P.add('sheet', tilt(0.05, 0.03, 1.85, -a / D2R, x1 - 0.02, y1 + 0.04, -0.15, 22), true);              // its bent bottom edge
    P.add('timber', B(2.42, 2.66, 0, 0.42, -1.12, -0.86), true); P.add('timber', B(2.46, 2.62, 0.42, 0.96, -1.05, -0.93), true);   // a broken crate behind the lane props its foot
    for (let i = 0; i < 3; i++) P.add('soil', sphere(0.16 + rnd() * 0.1, 1.0 + i * 0.6, 0.0, -0.75 - rnd() * 0.3, 1.6, 0.35, 1, 8, 5));
    { const g = new T.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); g.scale(0.85, 1, 0.75); g.translate(2.0, FF.Level.groundY(2.0) + 0.005, -0.25); P.add('scrape', g); } }
  /* the boundary: an enormous wall of precast panels with open joints, starting at a massive pier */
  P.add('vWall', B(4.2, 5.8, 0, 14, -4.85, -2.9), true); P.add('vWallDk', B(4.15, 5.85, 0, 0.16, -4.9, -2.85));
  P.add('vWallDk', B(5.8, 31.0, 0, 14, WZ - 0.75, WZ - 0.14), true); P.add('vWallDk', B(35.0, 39.0, 0, 14, WZ - 0.75, WZ - 0.14), true); P.add('vWallDk', B(31.0, 35.0, 6.0, 14, WZ - 0.75, WZ - 0.14), true);                                    // the dark backing seen through the joints (casts: blocks the headlights)
  const jx = [];
  for (let x = 5.8; x < 39.0 - 0.01; x += 3.0) {
    const a = x + 0.016, b = Math.min(39.0, x + 3.0) - 0.016; jx.push(x);
    if (b > 31.0 && a < 35.0) { if (a < 31.0) P.add('vWall', B(a, 31.0, 0, 14, WZ - 0.3, WZ), true); if (b > 35.0) P.add('vWall', B(35.0, b, 0, 14, WZ - 0.3, WZ), true); P.add('vWall', B(Math.max(a, 31.0), Math.min(b, 35.0), 2.6, 14, WZ - 0.3, WZ), true); continue; }
    const k = Math.round((x - 5.8) / 3.0) % 3, mk = k === 1 ? 'vWall2' : 'vWall', dz = k === 2 ? 0.012 : 0;
    P.add(mk, B(a, b, 0, 14, WZ - 0.3, WZ + dz), true);
  }
  /* joint backers behind the wall (integration): the open joints let the van's real, shadow-mapped headlights through as
     razor-thin lines across the grass (a 3 cm slit and a point light), which read as a glitch. The backers stop the light;
     the joints still glow (the emissive strips below), and the light reaches the lane only under the gate and at its seam. */
  for (const x of jx) if (x > 5.9) P.add('vWallDk', B(x - 0.05, x + 0.05, 0, 14, WZ - 0.36, WZ - 0.3), true);
  for (let y = 4.1; y < 14; y += 3.9) { P.add('vStain', B(5.8, 31.0, y, y + 0.05, WZ - 0.05, WZ + 0.016)); P.add('vStain', B(35.0, 39.0, y, y + 0.05, WZ - 0.05, WZ + 0.016)); }
  P.add('vWallDk', B(5.8, 31.0, 0, 0.12, WZ, WZ + 0.1)); P.add('vWallDk', B(35.0, 39.0, 0, 0.12, WZ, WZ + 0.1));   // a plinth at the foot
  /* stains running down from the joints (darker streaks, rain) */
  for (let i = 0; i < 30; i++) { const x = 6.2 + rnd() * 32, y0 = rnd() < 0.5 ? 4.15 : 0.12, w = 0.06 + rnd() * 0.5; if (x > 30.4 && x < 35.4) continue; P.add('vStain', B(x, x + w, y0, y0 + 1.5 + rnd() * 6, WZ + 0.013, WZ + 0.02)); }
  /* the headlights' light leaking through the open joints: thin strips inside each joint, lit per frame from the headlights */
  { const parts = []; const jj = jx.filter(x => x > 5.9 && !(x > 30.9 && x < 35.1));
    for (const x of jj) { const g = new T.PlaneGeometry(0.026, 13.6, 1, 1); g.translate(x, 6.85, WZ - 0.13); parts.push(g); }
    const geo = FF.geo.merge(parts); const col = new Float32Array(geo.attributes.position.count * 3); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const m = FF.glow([1, 1, 1]); m.vertexColors = true; joints = new T.Mesh(geo, m); joints.name = 'jointGlow'; joints.userData.xs = jj; P.obj(joints); }
  /* a glow in the haze above the wall where the headlights are (behind the wall) */
  { const m = new T.ShaderMaterial({ uniforms: { uCol: { value: new T.Color(0, 0, 0) } }, vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; varying vec2 vU; void main(){ vec2 q = (vU - vec2(0.5, 0.35)) * vec2(1.0, 1.6); float a = exp(-6.0 * dot(q, q)); gl_FragColor = vec4(uCol * a, 1.0); }',
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true });
    wallGlow = new T.Mesh(new T.PlaneGeometry(16, 12), m); wallGlow.position.set(20, 13.5, -7.0); wallGlow.renderOrder = 8; wallGlow.name = 'wallGlow'; wallGlow.visible = false; P.obj(wallGlow); }
  /* the vehicle gate (31..35, z -4.0): an opening to a lintel at 2.6 (integration: was 6.0, a tall pale slot of compound
     haze above the leaves that out-shone everything at the gate); two 1.7 m sliding leaves with a 0.22 gap under */
  P.add('metal', B(30.85, 31.05, 0, 2.35, -4.25, -3.88), true); P.add('metal', B(34.95, 35.15, 0, 2.35, -4.25, -3.88), true);
  P.add('vWallDk', B(30.9, 35.1, 2.42, 2.6, -4.6, -4.1)); P.add('metal', B(30.9, 38.6, 1.96, 2.02, -4.14, -4.1), true);   // lintel edge; the leaves' top track
  P.add('metal', B(30.9, 38.6, 0, 0.03, -4.06, -3.98));                                                   // the bottom guide rail (the gap stays clear)
  const leaf = (id, x0, x1, lap) => {
    const cx = (x0 + x1) / 2, gp = mkProp(id, cx, 0, -4.02), w = x1 - x0, parts = [B(-w / 2, w / 2, 0.22, 1.92, -0.04, 0.04)];
    /* integration: a lap strip behind the seam (on the van's side). The 3 cm seam let the headlights through as a razor-thin
       line across the grass towards the lens, which read as a glitch; the light now reaches the lane only under the gate */
    if (lap) parts.push(B(-w / 2 - 0.05, -w / 2 + 0.03, 0.22, 1.92, -0.085, -0.045));
    for (let x = -w / 2 + 0.3; x < w / 2 - 0.05; x += 0.6) parts.push(B(x, x + 0.04, 0.22, 1.92, 0.04, 0.07));
    parts.push(B(-w / 2, w / 2, 0.22, 0.3, 0.04, 0.07), B(-w / 2, w / 2, 1.84, 1.92, 0.04, 0.07), B(-w / 2, w / 2, 1.04, 1.1, 0.04, 0.07));
    const me = new T.Mesh(FF.geo.merge(parts), mat('metal')); me.castShadow = true; me.receiveShadow = true; gp.add(me); return gp;
  };
  const gl = leaf('gateLeafL', 31.05, 32.985); leaf('gateLeafR', 33.015, 34.95, true);
  { const ch = new T.TorusGeometry(0.06, 0.008, 5, 12); ch.translate(0.97, 1.12, 0.09); const lk = B(0.93, 1.0, 0.98, 1.08, 0.07, 0.11); const me = new T.Mesh(FF.geo.merge([ch, lk]), mat('metalLight')); me.castShadow = true; gl.add(me); }
  /* the compound behind the wall: yard, a far building, a shed (seen through the gate and over the wall) */
  P.bg('floor', B(10, 60, -0.5, 0, -40, WZ - 0.75)); P.bg('hall', B(14, 60, 0, 12, -26, -24)); P.bg('hall', B(36, 44, 0, 7, -15, -13));
  P.bg('metal', CY(0.09, 9, 27.0, 0, -12, 8)); P.bg('metal', B(26.0, 28.6, 8.6, 8.75, -12.1, -11.9));
  /* the fallen concrete post (10.8..11.1, 0.30 high): the first jump; lying across the lane, one broken end with rebar */
  P.add('vWall', B(10.8, 11.1, 0, 0.30, -1.6, 1.15), true); P.add('vWallDk', B(10.79, 11.11, 0.0, 0.03, -1.62, 1.17));
  for (const z of [1.18, 1.22]) P.add('metal', tilt(0.012, 0.26, 0.012, 20, 10.9 + (z - 1.2) * 4, 0.2, z), true);
  /* the hoarding (16.9..17.1, bottom edge 0.19): sheets across the lane on two posts, a ragged bottom, grey light beyond */
  for (let z = -4.1, i = 0; z < 1.6; z += 0.47, i++) {
    const lane = z + 0.46 > -0.6 && z < 0.6, bot = lane ? 0.19 : 0.0 + rnd() * 0.12, top = 2.2 - rnd() * 0.08;
    const g = new T.BoxGeometry(0.018, top - bot, 0.46); g.translate(17.0 + (i % 2) * 0.03 - 0.015, (top + bot) / 2, z + 0.23); P.add('sheet', g, true);
    for (let r = 0; r < 3; r++) P.add('sheet', B(17.02 + (i % 2) * 0.03, 17.035 + (i % 2) * 0.03, bot, top, z + 0.06 + r * 0.15, z + 0.09 + r * 0.15), true);
  }
  P.add('timber', B(16.94, 17.06, 0, 2.35, -4.15, -4.03), true); P.add('timber', B(16.94, 17.06, 0, 2.35, 1.5, 1.62), true);
  P.add('timber', tilt(0.06, 2.6, 0.06, -38, 16.25, 1.0, -3.4), true); P.add('timber', tilt(0.06, 2.6, 0.06, -38, 16.25, 1.0, 1.3), true);
  P.add('timber', B(16.9, 17.1, 1.42, 1.5, -4.15, 1.62), true);
  /* the corner: the cross wall (39.0..41.6) closes the Verge; the culvert at its foot (A14: a concrete inlet, its cover slab
     cracked, the broken corner at the lane rabbit-sized; part silted; no bars, no mesh) */
  P.add('vWall', B(39.0, 41.6, 0, 14, WZ, 0.6), true); P.add('section', B(39.0, 41.6, -0.55, 0.0, 0.6, 0.64));
  for (let y = 4.1; y < 14; y += 3.9) P.add('vStain', B(39.0, 41.6, y, y + 0.05, 0.6, 0.616));
  P.add('vStain', B(40.28, 40.32, 0.0, 14, 0.6, 0.614)); for (let i = 0; i < 2; i++) { const x = 39.2 + rnd() * 2.1, w = 0.05 + rnd() * 0.15; P.add('vStain', B(x, x + w, 0.0, 1.0 + rnd() * 3, 0.6, 0.618)); }
  P.add('vWallDk', B(39.0, 39.02, 0.0, 14, -0.2, 0.6));
  P.add('vWall', B(37.65, 39.0, -0.10, 0.08, -2.7, -0.45), true);                           // the cover slab behind the lane (the person kneels on it)
  P.add('vWall', B(37.65, 38.0, -0.10, 0.08, -0.45, 0.45), true);                            // its left edge, flush with the gutter
  P.add('vWall', B(38.0, 38.5, -0.24, -0.10, -0.45, 0.45), true);                            // the slab's surviving front-left piece, under the gutter's last step
  P.add('vWall', B(37.5, 37.65, -0.12, 0.18, -2.75, 0.45), true); P.add('vWall', B(37.5, 39.0, -0.12, 0.18, -2.9, -2.7), true);  // the inlet's low concrete kerbs
  for (let i = 0; i < 5; i++) P.add('vWall', tilt(0.08 + rnd() * 0.08, 0.06 + rnd() * 0.05, 0.1 + rnd() * 0.12, (rnd() - 0.5) * 40, 38.45 + rnd() * 0.1, -0.13 - rnd() * 0.05, -0.4 + rnd() * 0.8, (rnd() - 0.5) * 30), true);  // the jagged broken edge
  P.add('section', B(38.0, 38.9, 0.081, 0.083, -1.4, -1.36)); P.add('section', B(38.45, 38.5, 0.081, 0.083, -1.36, -0.45));  // a crack running back across the slab
  const slab = mkProp('culvertSlab', 38.25, 0.08, -1.2); { const me = new T.Mesh(tilt(0.5, 0.06, 0.42, 6, 0, 0.03, 0, 4), mat('vWall')); me.castShadow = me.receiveShadow = true; slab.add(me); }  // a loose broken piece (the person scrapes at it)
  /* foreground: a few dark tall weeds near the lens (silhouettes, out of the action band) */
  grass(P, 4400, 0.6, 38.0, WZ + 0.2, 2.4, 0.05, 0.3, '#59605a', { r: 0.009, share: 0.62, skip: (x, z) => (Math.abs(z) < 0.24 && rnd() < 0.9) || (x > 1.2 && x < 3.0 && z > -0.3 && z < 2.6 && rnd() < 0.85) || (x > 36.0 && z > -0.7 && z < 0.7) || (x > 10.7 && x < 11.2 && z > -1.7 && z < 1.25) || (x > 16.8 && x < 17.2) || (x > 37.5) });
  grass(P, 430, 0.6, 3.8, -1.7, -0.35, 0.14, 0.46, '#3e443c', { r: 0.014, share: 0.06 });          // the tussock behind the scrape (dark, so the pale rabbit reads)
  grass(P, 140, -4, 38, 2.8, 5.0, 0.12, 0.42, '#1f221e', { r: 0.008, share: 0.02 });                 // foreground silhouettes
  grass(P, 430, -60, 4, -40, -4.4, 0.2, 0.7, '#4a524c', { r: 0.03, back: true, share: 0.06 });      // the outskirts
  P.done();
}

/* =========================================================================================== THE DRAIN (38.5 .. 55.5), in section */
function buildDrain() {
  const P = place('drain', 38.4, 55.6), WZ = -4.2;
  /* the chamber (38.5..39.6) and the pipe (to 53.4), floor y -1.0, open to the camera (the cut-away) */
  P.add('silt', B(38.5, 53.4, -1.3, -1.0, -0.75, 0.45));
  P.add('wet', B(38.5, 53.4, -1.0, -0.993, -0.22, 0.08));                                   // the trickle
  P.add('pipe', B(38.42, 53.4, -1.0, -0.55, -0.95, -0.45), true);                           // the back wall
  P.add('pipe', B(38.42, 39.6, -0.55, -0.1, -0.95, -0.45), true);                            // the chamber's back wall to the surface
  P.add('pipe', B(38.42, 38.5, -1.0, -0.24, -0.45, 0.45), true);                             // the chamber's left wall (below the slab piece)
  /* the culvert mouth at the chamber's back: a dark rectangular opening under the wall, part silted */
  P.add('section', B(38.56, 39.5, -0.98, -0.62, -0.96, -0.94)); P.add('silt', tilt(0.9, 0.08, 0.3, 0, 39.03, -0.98, -0.82, -14));
  /* the overhang (39.0..39.6): the cross wall's foot; the squeeze pipe's collapse (39.6..43.0, 0.21 clear) */
  P.add('vWall', B(39.0, 41.6, -0.55, 0.0, WZ, 0.45), true);
  P.add('rubble', B(39.6, 43.0, -0.79, -0.55, -0.75, 0.45), true);
  for (let i = 0; i < 12; i++) P.add('rubble', tilt(0.2 + rnd() * 0.3, 0.05 + rnd() * 0.05, 0.25 + rnd() * 0.3, (rnd() - 0.5) * 16, 39.8 + rnd() * 3.0, -0.8 + rnd() * 0.03, -0.5 + rnd() * 0.9, (rnd() - 0.5) * 10), true);
  P.add('section', B(39.6, 43.0, -0.79, -0.55, 0.45, 0.49));
  /* the crown over the pipe (41.6..52.6, y -0.55..0), cut at the cracked slab 46.0..46.8 */
  P.add('soil', B(41.6, 46.0, -0.55, 0.0, WZ, 0.45), true); P.add('soil', B(46.8, 52.6, -0.55, 0.0, WZ, 0.45), true);
  P.add('soil', B(46.0, 46.8, -0.55, 0.0, WZ, -0.45), true);                                  // the shaft's back
  P.add('section', B(41.6, 46.0, -0.55, 0.0, 0.45, 0.5)); P.add('section', B(46.8, 52.6, -0.55, 0.0, 0.45, 0.5));
  /* the cracked slab with a ragged gap (A14: no grate, no bars): two broken plates leaving a slot; grey dusk and rain fall through */
  P.add('vWall', tilt(0.3, 0.05, 0.9, -4, 46.15, -0.02, 0.0), true); P.add('vWall', tilt(0.28, 0.05, 0.9, 5, 46.66, -0.02, 0.0), true);
  for (let i = 0; i < 4; i++) P.add('vWall', tilt(0.06 + rnd() * 0.05, 0.04, 0.12 + rnd() * 0.2, (rnd() - 0.5) * 30, 46.3 + rnd() * 0.25, -0.03, -0.35 + rnd() * 0.7), true);
  /* grey dusk light falling through the culvert's broken corner and the cracked slab (soft shafts in the damp air) */
  for (const [x0, x1, y0, y1, k] of [[38.52, 38.98, -1.0, 0.0, 0.05], [46.28, 46.54, -1.0, 0.0, 0.07]]) {
    const m = new T.ShaderMaterial({ uniforms: { uCol: { value: FF.lin('#aab4be').multiplyScalar(k) }, uT: FF.U.uFFTime },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uT; varying vec3 vP; void main(){ float a = smoothstep(-1.0, -0.2, vP.y) * (0.85 + 0.15 * sin(vP.y * 7.0 + uT * 0.8)); gl_FragColor = vec4(uCol * a, 1.0); }',
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true });
    const g = tilt(x1 - x0, y1 - y0, 0.7, 11, (x0 + x1) / 2 + 0.1, (y0 + y1) / 2, -0.1);   // slanted with the dusk sky's direction
    const me = new T.Mesh(g, m); me.renderOrder = 8; me.name = 'drainShaft'; P.obj(me);
  }
  /* below the pipe, in section */
  P.add('section', B(38.4, 55.5, -3.2, -1.3, 0.4, 0.48));
  /* above: the compound's apron beyond the cross wall (where the van drives off), its far side, rain over it */
  P.add('floor', B(41.6, 51.0, -0.06, 0.0, -16, 0.45)); P.add('section', B(41.6, 51.0, -0.06, 0.0, 0.45, 0.5));
  P.bg('farNight', B(40, 58, 0, 9, -22, -20)); P.bg('farNight', B(44, 54, 0, 5, -12, -10.5));
  /* the Courtyard's west wall (51.0..52.6) standing over the pipe's end; the sump ramp (53.4 -> 55.5) climbs into the hall */
  P.add('wall', B(51.0, 52.6, 0, 14, -5.0, 0.6), true); P.add('section', B(51.0, 52.6, 0, 14, 0.6, 0.64));
  { const x0 = 53.4, x1 = 55.5, y0 = -1.0, z0 = -1.2, z1 = 1.2; P.add('silt', quadGeo([[x0, y0, z1], [x1, 0, z1], [x1, 0, z0], [x0, y0, z0]])); }
  P.add('pipe', B(52.6, 53.4, -1.3, -1.0, -1.2, 1.2)); P.add('pipe', B(52.6, 55.5, -1.3, 0.0, -1.5, -1.2), true); P.add('pipe', B(52.6, 55.5, -1.3, 0.0, 1.2, 1.5), true);
  P.add('section', B(52.6, 55.5, -3.2, -1.0, 1.5, 1.54));
  P.done();
}

/* =========================================================================================== THE COURTYARD (55.5 .. 86.0) */
let amberGlow = null, amberHalo = null, walkwayGlowL = null, searchlight = null;
function buildCourtyard() {
  const P = place('courtyard', 51.0, 86.6), L = World.look, OX = 74.15, WALLZ = -5.0, WX = 75.6;
  const O = { x: 76.0, w: 0.46, h: 0.36, s: 0.80, depth: 0.9 }, BX0 = 75.2, BX1 = 83.5, BZ = -0.45, TZ = BZ - O.depth, BH = 1.45, ox0 = O.x - O.w / 2, ox1 = O.x + O.w / 2;
  /* floor: the lane's slab to the camera (the sump cut out), the hall floor beyond the wall's end */
  P.add('floor', B(55.5, 86.0, -0.5, 0, WALLZ, 6.0)); P.add('floor', B(52.6, 55.5, -0.5, 0, WALLZ, -1.5)); P.add('floor', B(52.6, 55.5, -0.5, 0, 1.5, 6.0));
  P.bg('floor', B(WX, 100, -0.5, 0, -46, WALLZ));
  /* integration: the puddle discs read as dark holes in the floor whatever their value (crisp edges, a slightly different
     sheen); the floor's own roughness carries the wet. Kept as data for a later pass with soft edges. */
  if (false) for (const [x, w, z, d] of [[57.2, 1.4, 0.7, 0.4], [60.8, 2.2, -1.6, 0.6], [64.1, 1.2, 1.6, 0.35], [67.0, 1.8, -0.4, 0.45], [79.6, 1.6, 1.2, 0.45]]) { const g = new T.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); g.scale(w / 2, 1, d); g.translate(x, 0.004, z); P.add('wetC', g); }
  /* the tall back wall: concrete panels with dark seams, a kerb, horizontal joints, a louvred vent (the look test) */
  P.add('wallDark', B(52.6, WX, 0, 12, WALLZ - 0.7, WALLZ - 0.05));
  for (let x = 52.6; x < WX - 0.01; x += 3.2) P.add('wall', B(x + 0.016, Math.min(WX, x + 3.2) - 0.016, 0.0, 12, WALLZ - 0.3, WALLZ));
  P.add('wall', B(52.6, BX0, 0, 0.10, WALLZ, WALLZ + 0.12));
  for (let y = 4.25; y < 12; y += 3.9) P.add('wallDark', B(52.6, WX, y, y + 0.03, WALLZ - 0.05, WALLZ + 0.004));
  { const vx = -1.1 + OX, vy = 3.15, vw = 0.95, vh = 0.62, ml = 'metalLight';
    P.add(ml, B(vx - vw / 2, vx + vw / 2, vy, vy + 0.05, WALLZ, WALLZ + 0.05)); P.add(ml, B(vx - vw / 2, vx + vw / 2, vy + vh - 0.05, vy + vh, WALLZ, WALLZ + 0.05));
    P.add(ml, B(vx - vw / 2, vx - vw / 2 + 0.05, vy, vy + vh, WALLZ, WALLZ + 0.05)); P.add(ml, B(vx + vw / 2 - 0.05, vx + vw / 2, vy, vy + vh, WALLZ, WALLZ + 0.05));
    P.add('wallDark', B(vx - vw / 2 + 0.05, vx + vw / 2 - 0.05, vy + 0.05, vy + vh - 0.05, WALLZ - 0.02, WALLZ + 0.001));
    for (let i = 0; i < 7; i++) { const g = B(vx - vw / 2 + 0.05, vx + vw / 2 - 0.05, -0.012, 0.012, -0.035, 0.035); g.rotateX(-0.6); g.translate(0, vy + 0.1 + i * 0.07, WALLZ + 0.03); P.add(ml, g); } }
  /* the block with the RAISED opening (A17: sill 0.80, 0.46 x 0.36), jutting from the wall to just behind the lane */
  P.add('wall', B(BX0, ox0, 0, BH, WALLZ, BZ), true); P.add('wall', B(ox1, BX1, 0, BH, WALLZ, BZ), true);
  P.add('wall', B(ox0, ox1, O.s + O.h, BH, WALLZ, BZ), true); P.add('wall', B(ox0, ox1, 0, O.s, WALLZ, BZ), true); P.add('wall', B(ox0, ox1, O.s, O.s + O.h, WALLZ, TZ - 0.02), true);
  P.add('wallDark', B(BX0 - 0.05, BX1, BH, BH + 0.1, WALLZ, BZ + 0.05));
  P.add('wallDark', B(ox0 - 0.03, ox1 + 0.03, O.s - 0.03, O.s, BZ - 0.02, BZ + 0.03));                     // a worn sill lip
  { const g = new T.PlaneGeometry(O.w, O.h, 1, 1); g.translate(O.x, O.s + O.h / 2, TZ);
    const c = new Float32Array(12), gc = FF.lin(L.opening.glow);
    for (let i = 0; i < 4; i++) { const y = g.attributes.position.getY(i), k = (y < O.s + O.h / 2 ? 1.0 : 0.55) * L.opening.glowIntensity; c[i * 3] = gc.r * k; c[i * 3 + 1] = gc.g * k; c[i * 3 + 2] = gc.b * k; }
    g.setAttribute('color', new T.BufferAttribute(c, 3)); const m = FF.glow([1, 1, 1]); m.vertexColors = true; const me = new T.Mesh(g, m); me.name = 'openingGlow'; P.obj(me); }
  /* the two stops that keep the box inside 70.66..76.10: the lip (70.15) and the kerb (76.36) */
  P.add('wallDark', B(70.15, 70.40, 0, 0.06, -0.62, 0.62), true); P.add('metal', B(76.36, 76.60, 0, 0.08, -0.62, 0.62), true);
  /* pipes: the big run along the wall with its elbow down (look test), uprights at the wall's end */
  { const R = 0.25, py = 3.45, pz = -4.4, ex = -0.25 + OX;
    const run = new T.CylinderGeometry(R, R, ex - 52.6, 22, 1); run.rotateZ(Math.PI / 2); run.translate((52.6 + ex) / 2, py, pz); P.add('metal', run, true);
    const el = new T.TorusGeometry(0.5, R, 14, 22, Math.PI / 2); el.translate(ex, py - 0.5, pz); P.add('metal', el, true);
    P.add('metal', CY(R, 0.6, ex + 0.5, py - 1.1, pz, 22), true); P.add('metal', CY(R + 0.06, 0.08, ex + 0.5, py - 1.16, pz, 22), true); P.add('metal', CY(R + 0.05, 0.06, ex + 0.5, py - 0.62, pz, 22), true);
    for (let x = 55.0; x < ex - 1; x += 4.6) { P.add('metal', B(x - 0.06, x + 0.06, py - 0.05, py + 0.32, WALLZ, pz)); const fl = new T.CylinderGeometry(R + 0.04, R + 0.04, 0.07, 22); fl.rotateZ(Math.PI / 2); fl.translate(x + 0.5, py, pz); P.add('metal', fl); }
    P.add('metal', CY(0.07, 12, WX + 0.18, 0, WALLZ + 0.2, 10)); P.add('metal', CY(0.05, 12, WX + 0.42, 0, WALLZ + 0.25, 10)); }
  /* hanging cables (look test) */
  { const mk = (pts, r) => { const c = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0] + OX, p[1], p[2]))); P.add('metal', new T.TubeGeometry(c, 60, r, 5, false), true); };
    mk([[-3.6, 12, -4.75], [-3.45, 6, -4.6], [-3.15, 1.2, -4.45], [-2.85, 0.12, -4.3], [-2.4, 0.012, -4.1], [-1.7, 0.012, -4.2]], 0.016);
    mk([[-3.9, 12, -4.8], [-3.7, 5, -4.75], [-3.45, 0.8, -4.65], [-3.2, 0.012, -4.55], [-2.4, 0.012, -4.7]], 0.012);
    mk([[0.9, 12, -3.0], [0.95, 7, -3.0], [0.9, 4.6, -3.0]], 0.012);
    mk([[-14.0, 12, -4.7], [-13.9, 4, -4.6], [-13.6, 0.4, -4.4], [-13.2, 0.012, -4.1], [-12.4, 0.012, -4.3]], 0.014); }
  /* the deep hall to the right (beyond the wall's end): the raised platform with tanks, railing and the amber lamp (look test) */
  const HP = { x0: 2.7 + OX, x1: 9.1 + OX, z0: -12.5, z1: -8.5, h: 1.5 };
  P.bg('hall', B(HP.x0, HP.x1, 0, HP.h, HP.z0, HP.z1));
  for (const tx of [3.9 + OX, 5.5 + OX]) { P.bg('hall', CY(0.55, 1.1, tx, HP.h, -10.7, 24)); P.bg('hall', CY(0.57, 0.08, tx, HP.h + 1.07, -10.7, 24)); }
  P.bg('hall', B(4.45 + OX, 4.95 + OX, HP.h, HP.h + 0.7, -9.7, -9.2));
  for (let x = HP.x0 + 0.1; x <= HP.x1 - 0.05; x += 0.98) P.bg('metal', B(x - 0.025, x + 0.025, HP.h, HP.h + 1.0, HP.z1 - 0.12, HP.z1 - 0.07));
  P.bg('metal', B(HP.x0 + 0.05, HP.x1, HP.h + 0.97, HP.h + 1.02, HP.z1 - 0.13, HP.z1 - 0.06)); P.bg('metal', B(HP.x0 + 0.05, HP.x1, HP.h + 0.5, HP.h + 0.53, HP.z1 - 0.12, HP.z1 - 0.07));
  P.bg('metal', CY(0.04, 9, 8.5 + OX, HP.h, -11.4, 8)); P.bg('metal', CY(0.04, 9, 8.85 + OX, HP.h, -11.4, 8));
  P.bg('hall', B(12.0 + OX, 13.4 + OX, 0, 30, -18, -16.6)); P.bg('hall', B(19.0 + OX, 20.4 + OX, 0, 30, -22, -20.6));
  P.bg('hall', B(50, 140, 0, 40, -42, -40)); P.bg('hall', B(92.5, 114, 0, 6, -27, -25));
  P.bg('hall', B(WX, WX + 0.4, 0, 12, -8.3, WALLZ));                                                         // the wall's return into the hall
  for (const [tx, tz] of [[3.95 + OX, -6.0], [5.15 + OX, -6.4]]) { P.bg('metal', CY(0.48, 1.55, tx, 0, tz, 28)); P.bg('metal', CY(0.5, 0.07, tx, 1.53, tz, 28)); P.bg('metal', CY(0.22, 0.12, tx, 1.6, tz, 16)); }
  P.bg('metal', B(WX, 86, 3.3, 3.62, -1.35, -1.05)); P.bg('metal', B(WX, 86, 3.24, 3.3, -1.42, -0.98)); P.bg('metal', B(WX, 86, 3.62, 3.68, -1.42, -0.98));
  for (const hx of [3.2 + OX, 7.8 + OX]) P.bg('metal', B(hx - 0.04, hx + 0.04, 3.68, 12, -1.24, -1.16));
  /* the elevated walkway far back (z -14.45, deck 3.6): two towers with doors (L 78.0, R 85.0), the deck and its rail between;
     behind the deck only pale haze, so the worker is always backlit (SEQUENCE-1.md §7.2) */
  P.bg('hall', B(72.0, 78.6, 0, 10.5, -18.5, -15.0)); P.bg('hall', B(84.6, 91.0, 0, 10.5, -18.5, -15.0));
  P.bg('metal', B(76.0, 88.0, 3.42, 3.6, -14.95, -13.95)); P.bg('metal', B(76.0, 88.0, 3.38, 3.42, -14.95, -14.9));
  for (let x = 76.2; x <= 88.0; x += 1.15) P.bg('metal', B(x - 0.02, x + 0.02, 3.6, 4.6, -14.03, -13.98));
  P.bg('metal', B(76.0, 88.0, 4.57, 4.62, -14.04, -13.97)); P.bg('metal', B(76.0, 88.0, 4.1, 4.13, -14.03, -13.98));
  for (const x of [79.2, 82.6, 86.0]) P.bg('metal', B(x - 0.08, x + 0.08, 0, 3.42, -14.55, -14.35));
  P.bg('wallDark', B(77.55, 78.45, 3.6, 5.7, -15.04, -15.0)); P.bg('wallDark', B(84.55, 85.45, 3.6, 5.7, -15.04, -15.0));
  { const g = new T.PlaneGeometry(0.86, 2.06); g.translate(78.0, 4.63, -15.06); const c = FF.lin('#efe4d0').multiplyScalar(1.7); walkwayGlowL = glowMesh([c.r, c.g, c.b], g); walkwayGlowL.name = 'walkwayDoorLight'; walkwayGlowL.visible = false; P.obj(walkwayGlowL, true); }
  const dL = mkProp('walkwayDoorL', 77.57, 3.6, -14.98); { const me = new T.Mesh(B(0, 0.86, 0, 2.06, 0, 0.04), mat('metal')); dL.add(me); }
  const dR = mkProp('walkwayDoorR', 85.43, 3.6, -14.98); { const me = new T.Mesh(B(-0.86, 0, 0, 2.06, 0, 0.04), mat('metal')); dR.add(me); }
  /* a slow searchlight sweeping the far haze (what the worker looks out at; activity beyond the rabbit's path) */
  { const m = new T.ShaderMaterial({ uniforms: { uCol: { value: FF.lin('#c8d2dc').multiplyScalar(0.06) }, uT: FF.U.uFFTime },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; varying vec2 vU; void main(){ float a = exp(-pow((vU.x - 0.5) * 6.0 / (0.25 + vU.y), 2.0)) * smoothstep(0.0, 0.15, vU.y) * (1.0 - smoothstep(0.6, 1.0, vU.y)); gl_FragColor = vec4(uCol * a, 1.0); }',
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true, side: T.DoubleSide });
    const g = new T.PlaneGeometry(10, 46); g.translate(0, 23, 0); searchlight = new T.Mesh(g, m); searchlight.position.set(96, 6, -70); searchlight.name = 'farSearchlight'; P.obj(searchlight, true); }
  /* the right end: the divide wall (83.5..86.0) in section, and a massive foreground pier that wipes the frame during the duct
     transit, hiding the change from dusk to night (§7.3, §8) */
  P.add('wall', B(83.5, 86.0, 0, 14, WALLZ, 0.6), true); P.add('section', B(83.5, 86.0, 0, 14, 0.6, 0.64));
  P.add('wallDark', B(83.45, 86.05, 0, 14, 4.4, 7.6)); P.add('wallDark', B(83.3, 86.2, 0, 0.3, 4.3, 7.7));
  /* foreground: leaning planks (A17: replaces the look test's grille; no bars near the rabbit), the valve wheel */
  for (const [x, z, h, a] of [[66.3, 3.2, 1.25, -9], [66.55, 3.25, 1.1, -14], [66.85, 3.3, 1.3, -6]]) P.add('timber', tilt(0.16, h, 0.025, a, x, h / 2 - 0.05, z, -8), false);
  { const pipe = new T.CylinderGeometry(0.13, 0.13, 4, 16); pipe.rotateZ(Math.PI / 2); pipe.translate(80.6, 0.14, 3.4); P.add('metal', pipe); }
  /* planks on the floor for scale (off the lane) */
  for (const [x, z, len, r] of [[78.2, 0.62, 1.9, 0.05], [78.4, 0.92, 1.7, -0.04], [79.0, 1.24, 1.5, 0.12], [70.55, -2.9, 1.3, -0.3], [70.85, -3.25, 1.0, -0.2], [62.0, -3.6, 1.6, 0.2]]) { const g = B(-len / 2, len / 2, 0, 0.022, -0.075, 0.075); g.rotateY(r); g.translate(x, 0, z); P.add('crate', g, true); }
  /* the amber lamp in the deep hall: the one warm accent, off until the walkway (A1) */
  const lampPos = new T.Vector3(4.7 + OX, HP.h + 0.82, -9.18), lp = mkProp('amberLamp', lampPos.x, lampPos.y, lampPos.z);
  { const ac = FF.lin('#ffae4a').multiplyScalar(5.0); amberGlow = new T.Mesh(new T.SphereGeometry(0.05, 12, 8), FF.glow([ac.r, ac.g, ac.b], false)); lp.add(amberGlow);
    amberHalo = halo('#ffae4a', 0.7, 0.8); amberHalo.position.z = 0.05; lp.add(amberHalo); P.bg('metal', B(lampPos.x - 0.07, lampPos.x + 0.07, lampPos.y + 0.04, lampPos.y + 0.1, lampPos.z - 0.06, lampPos.z + 0.04)); }
  /* the box: planks around a dark core (the look test's crate); the Player moves it */
  { const C = FF.S1.pushables[0], crate = mkProp('box', C.x, 0, 0), w = C.w, h = C.h, dd = C.d, gap = 0.012, t = 0.022, pl = [], core = [B(-w / 2 + 0.01, w / 2 - 0.01, 0.01, h - 0.01, -dd / 2 + 0.01, dd / 2 - 0.01)];
    const rows = 3, ph = (h - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) { const y0 = r * (ph + gap), y1 = y0 + ph; pl.push(B(-w / 2, w / 2, y0, y1, dd / 2 - t, dd / 2), B(-w / 2, w / 2, y0, y1, -dd / 2, -dd / 2 + t), B(-w / 2, -w / 2 + t, y0, y1, -dd / 2, dd / 2), B(w / 2 - t, w / 2, y0, y1, -dd / 2, dd / 2)); }
    for (let r = 0; r < 4; r++) { const z0 = -dd / 2 + r * (dd / 4), z1 = z0 + dd / 4 - gap; pl.push(B(-w / 2, w / 2, h - t, h, z0, z1)); }
    const post = 0.05, e = 0.004;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const xr = sx > 0 ? [w / 2 - post, w / 2 + e] : [-w / 2 - e, -w / 2 + post], zr = sz > 0 ? [dd / 2 - post, dd / 2 + e] : [-dd / 2 - e, -dd / 2 + post]; pl.push(B(xr[0], xr[1], 0, h + e, zr[0], zr[1])); }
    const mesh = new T.Mesh(FF.geo.merge(pl), mat('crate')); mesh.castShadow = mesh.receiveShadow = true; crate.add(mesh);
    const coreM = new T.Mesh(FF.geo.merge(core), FF.mat({ color: '#1e1c1a', roughness: 1 })); coreM.castShadow = true; crate.add(coreM); }
  buildWindowBeam(P);
  paintedOver(P);
  P.done();
}

/* =========================================================================================== a trace of resistance (Josh, brief 9.7) */
/* The one restrained detail of Sequence 1: END ANIMAL USE, sprayed by hand on one of the Courtyard's back-wall panels and later
   buffed out with one hasty coat of fresh grey masonry paint that doesn't quite match the concrete: vertical roller strokes of
   uneven length, thick where the roller was freshly loaded and dry elsewhere, so some letters ghost through and others are nearly
   gone; the apex of the first A and the end of the last E escape the roller; a touch-up coat in a third grey over the start;
   runs below the patch, one spray drip longer than the paint, a flake where the new paint has let go.
   A decal 3 mm in front of the panel with the wall's own shading (wall fill, haze, fog, shadows): no light, camera, sound or UI of
   its own; it sits between the reveal's hold and the puzzle's span (FF.S1.decor 'painted-over'), so it is only ever passed.
   Painted once at init with its own seeded random: rnd(), and so every other placement in the world, is unchanged. The texture
   is a DataTexture whose transparent texels carry the wall's colour, so filtering and mipmaps never draw a dark rim around it. */
const GLYPH = {   /* hand-lettered skeletons: [width, ...strokes]; x 0..width, y 0 (cap) .. 1 (baseline); '~' = a smooth stroke */
  E: [0.56, [[0.58, 0], [0, 0.02], [0, 1], [0.6, 0.98]], [[0, 0.5], [0.44, 0.48]]],
  N: [0.7, [[0, 1], [0, 0], [0.7, 1], [0.7, -0.02]]],
  D: [0.66, [[0, 0], [0, 1]], ['~', [0, 0], [0.34, 0], [0.6, 0.16], [0.68, 0.5], [0.6, 0.84], [0.34, 1], [0, 1]]],
  A: [0.72, [[0, 1], [0.36, 0], [0.72, 1]], [[0.17, 0.62], [0.56, 0.6]]],
  I: [0.06, [[0.03, 0], [0.03, 1]]],
  M: [0.86, [[0, 1], [0.02, 0], [0.43, 0.6], [0.84, 0], [0.86, 1]]],
  L: [0.5, [[0, 0], [0, 1], [0.54, 0.98]]],
  U: [0.64, ['~', [0, 0], [0, 0.66], [0.1, 0.9], [0.32, 1], [0.54, 0.9], [0.64, 0.66], [0.64, 0]]],
  S: [0.6, ['~', [0.6, 0.15], [0.42, 0.01], [0.15, 0.03], [0.02, 0.22], [0.14, 0.43], [0.46, 0.55], [0.6, 0.77], [0.48, 0.97], [0.18, 1], [0, 0.85]]],
};
function catmull(p, n) {
  const o = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)], b = p[i], c = p[i + 1], d = p[Math.min(p.length - 1, i + 2)];
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; o.push([0, 1].map(j => 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t3))); }
  }
  o.push(p[p.length - 1]); return o;
}
function paintedOver(P) {
  const D = (FF.Level.decor && FF.Level.decor('painted-over')) || { x0: 65.8, x1: 68.58, y0: 0.45, y1: 1.84, z: -5.0 };
  const W = 1024, Hc = 512, ppm = W / (D.x1 - D.x0), R = prng(0x51ab7e), J = a => (R() - 0.5) * 2 * a;
  const X = m => m * ppm, Y = h => (D.y1 - h) * ppm;           // metres along the decal -> px; height on the wall -> px row
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w || W; c.height = h || Hc; return c; };
  const Lc = canvas(), lx = Lc.getContext('2d'), Fc = canvas(), fx = Fc.getContext('2d');
  const line = (c, pts) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); };
  /* 1. the letters: black spray from a hand-held can, stamped along each stroke as soft dots (a varying width, a heavier blob
     where the can paused at the ends), a rising line, leaning and uneven letters, the last word squeezed in */
  const dot = canvas(64, 64); { const d = dot.getContext('2d'), gr = d.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(22,24,27,1)'); gr.addColorStop(0.45, 'rgba(22,24,27,0.85)'); gr.addColorStop(0.75, 'rgba(22,24,27,0.18)'); gr.addColorStop(1, 'rgba(22,24,27,0)'); d.fillStyle = gr; d.fillRect(0, 0, 64, 64); }
  const cap = 0.26 * ppm, sw = 0.042 * ppm, at = [];
  const spray = pts => {
    let ph = R() * 9;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.6));
      for (let k = 0; k < n; k++) {
        const t = k / n, end = Math.min(i + t, pts.length - 1 - i - t), r = sw * (0.62 + 0.16 * Math.sin(ph += 0.11) + 0.08 * R()) * (end < 0.12 ? 1.25 : 1);
        lx.globalAlpha = 0.2; lx.drawImage(dot, ax + (bx - ax) * t - r, ay + (by - ay) * t - r, 2 * r, 2 * r);
      }
    }
    lx.globalAlpha = 0.22; for (let i = 0; i < 40; i++) { const p = pts[(R() * pts.length) | 0], q = sw * (0.9 + R() * 1.6), th = R() * 6.283; lx.fillRect(p[0] + Math.cos(th) * q, p[1] + Math.sin(th) * q, 1.4, 1.4); }   // overspray
  };
  lx.fillStyle = lx.strokeStyle = '#16181b'; lx.lineCap = 'round';
  let x = X(0.11);
  ['END', 'ANIMAL', 'USE'].forEach((word, wi) => {
    const s = wi === 2 ? 0.86 : 1;
    for (const ch of word) {
      const g = GLYPH[ch], h = cap * s * (1 + J(0.07)), base = Y(1.13) - (x / W) * 0.06 * ppm + J(0.016 * ppm), slant = 0.04 + J(0.06);
      lx.save(); lx.translate(x, base); lx.rotate(J(0.07));
      for (let k = 1; k < g.length; k++) {
        let st = g[k]; const smooth = st[0] === '~'; if (smooth) st = st.slice(1);
        let pts = st.map(([u, v]) => { const yy = (v - 1) * h + J(0.045 * h); return [u * h - yy * slant + J(0.045 * h), yy]; }); if (smooth) pts = catmull(pts, 6);
        spray(pts);
      }
      lx.restore(); at.push({ ch, x, w: g[0] * h, h, base });
      x += g[0] * h + 0.2 * cap * s * (1 + J(0.3));
    }
    x += 0.36 * cap;
  });
  /* spray runs where the can was held too close: the one under END's N outlasts the paint */
  lx.globalAlpha = 0.6; lx.lineWidth = 2.0;
  for (const [i, len] of [[1, 0.26], [6, 0.11], [7, 0.08]]) { const a = at[i], x0 = a.x + a.w * (i === 1 ? 0.04 : 0.5), y0 = a.base - 2; line(lx, [[x0, y0], [x0 + J(1.5), y0 + len * ppm]]); lx.beginPath(); lx.arc(x0, y0 + len * ppm, 2.2, 0, 6.283); lx.fill(); }
  /* years of weather: the black has faded unevenly */
  lx.globalCompositeOperation = 'destination-out'; lx.globalAlpha = 1;
  for (let i = 0; i < 40; i++) { const cx = R() * W, cy = Y(1.42) + R() * 0.36 * ppm, r = 12 + R() * 36, gr = lx.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(0,0,0,' + (0.1 + R() * 0.3).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); lx.fillStyle = gr; lx.fillRect(cx - r, cy - r, 2 * r, 2 * r); }
  lx.globalCompositeOperation = 'source-over';
  fx.drawImage(Lc, 0, 0);
  /* 2. the buff: one hasty coat of vertical roller strokes, left to right, ragged where they start and stop, two batches of grey,
     neither the concrete's tone. Black is hard to cover in one coat: where the roller ran dry the letters still ghost through
     (D, the first A, I M, L, U S), where it was freshly loaded they are nearly gone (E N, N, the second A). One stroke stops
     short of the first A's apex; the paint runs out half way across the final E */
  const last = at[at.length - 1], stopX = last.x + last.w * 0.45, apex = at[3], rw = 0.215 * ppm;
  const thin = [0.88, 0.8, 0.5, 0.3, 0.85, 0.32, 0.36, 0.78, 0.3, 0.55, 0.3, 0.26];   // coverage over each letter in turn
  const under = xc => { let k = 0; for (let j = 0; j < at.length; j++) if (xc >= at[j].x - 0.1 * cap) k = j; return k; };
  const ragged = (x0, x1, y, amp) => { const p = []; for (let xx = x0; xx <= x1 + 0.1; xx += 5) p.push([Math.min(xx, x1), y + J(amp)]); return p; };
  let sx = X(0.06), i = 0;
  /* v2 review: the strokes were crisp cards with hard vertical joins. Each is now a little wider or narrower and leans a little
     more, its long edges are ragged and feathered over a few pixels (the roller's ends run out softly), and they overlap more,
     so the patch reads as one hasty coat, not grey cards laid in a row */
  const sideRag = (x, y0, y1) => { const p = []; for (let yy = y0; yy <= y1 + 0.1; yy += 7) p.push([x + J(1.8), Math.min(yy, y1)]); return p; };
  while (sx < stopX) {
    const w = Math.min(rw * (1 + J(0.12)), Math.max(0.4 * rw, stopX - sx)), c = Math.min(thin[under(sx + Math.min(rw, stopX - sx) / 2)], sx + rw > stopX ? 0.26 : 1) + J(0.03);
    let top = Y(1.5 + J(0.07)); const bot = Y(0.98 + J(0.06));
    if (apex.x + apex.w * 0.5 > sx + w * 0.15 && apex.x + apex.w * 0.5 < sx + w * 0.85) top = apex.base - apex.h + 0.035 * ppm;   // the A's apex escapes
    fx.save(); fx.translate(sx + w / 2, 0); fx.rotate(J(0.06)); fx.translate(-w / 2, 0);
    const col = (i >> 2) % 2 ? [84, 86, 84] : [88, 90, 87], fe = 5 + R() * 4, rgba = a => 'rgba(' + col.join(',') + ',' + a + ')';
    const grd = fx.createLinearGradient(-2, 0, w + 2, 0), e0 = Math.min(0.45, fe / (w + 4));
    grd.addColorStop(0, rgba(0)); grd.addColorStop(e0, rgba(1)); grd.addColorStop(1 - e0, rgba(1)); grd.addColorStop(1, rgba(0));
    fx.fillStyle = grd; fx.strokeStyle = rgba(1);
    const tp = ragged(0, w, top, 2.5 + (1 - c) * 14), bp = ragged(0, w, bot, 2 + (1 - c) * 10).reverse(), sr = sideRag(w + 2, top, bot), sl = sideRag(-2, top, bot).reverse();
    /* soft all round: four nested passes, each a little smaller, add up to the stroke's coverage c in the middle and fade out
       over ~14 px at its edges (the roller's ends run out; no hard card edge) */
    const passes = 4, a1 = 1 - Math.pow(1 - Math.min(0.98, Math.max(0.02, c)), 1 / passes), cxm = w / 2, cym = (top + bot) / 2;
    for (let q = 0; q < passes; q++) {
      const ins = q * 4.5, sx_ = (w / 2 - ins) / (w / 2 + 2), sy_ = ((bot - top) / 2 - ins) / ((bot - top) / 2);
      fx.globalAlpha = a1; fx.beginPath();
      [...tp, ...sr, ...bp, ...sl].forEach((p, k) => { const X = cxm + (p[0] - cxm) * sx_, Y = cym + (p[1] - cym) * sy_; if (k) fx.lineTo(X, Y); else fx.moveTo(X, Y); });
      fx.closePath(); fx.fill();
    }
    fx.globalAlpha = c;
    /* the nap of the roller: faint vertical streaks; on a dry stroke, gaps */
    for (let k = 0; k < 26; k++) { const xx = R() * w; fx.globalAlpha = 0.05 + 0.06 * R(); fx.fillStyle = R() < 0.5 ? '#5d5f5c' : '#3f4241'; fx.fillRect(xx, top + 4, 1 + R() * 1.5, bot - top - 8); }
    if (c < 0.7) { fx.globalCompositeOperation = 'destination-out'; for (let k = 0; k < 10; k++) { fx.globalAlpha = 0.15 + 0.2 * R(); fx.fillRect(R() * w, top + R() * 20, 1 + R() * 2, (bot - top) * (0.3 + 0.6 * R())); } fx.globalCompositeOperation = 'source-over'; }
    /* runs off the roller's lower edge */
    if (c > 0.72 && R() < 0.7) { fx.fillStyle = fx.strokeStyle = '#585a57'; fx.globalAlpha = 0.8; fx.lineWidth = 2.6 + R(); const rx = w * (0.2 + 0.6 * R()), len = (0.03 + R() * 0.13) * ppm; line(fx, [[rx, bot - 3], [rx + J(1), bot + len]]); fx.beginPath(); fx.arc(rx, bot + len, 2.0, 0, 6.283); fx.fill(); }
    fx.restore(); sx += rw * 0.8 * (1 + J(0.08)); i++;
  }
  /* a second, later coat over the start, in yet another grey (the paint layers) */
  { const x0 = at[0].x - 0.03 * ppm, x1 = at[1].x + at[1].w * 0.8, t = Y(1.44), b = Y(1.03);
    fx.save(); fx.fillStyle = '#5b5c59'; fx.globalAlpha = 0.5; fx.beginPath(); const tp = ragged(x0, x1, t, 4), bp = ragged(x0, x1, b, 3).reverse();
    [...tp, ...bp].forEach((p, k) => k ? fx.lineTo(p[0], p[1]) : fx.moveTo(p[0], p[1])); fx.closePath(); fx.fill(); fx.restore(); }
  /* 3. a flake where the new paint has already let go (the black of the L's upright shows again; v2 review: a second, round
     one on the E read as a typographic bullet and is gone), and rain water down the fresh grey */
  for (const [k, u, v, r] of [[8, 0.08, 0.5, 8]]) {
    const a = at[k], cx = a.x + a.w * u, cy = a.base - a.h * (1 - v);
    fx.save(); fx.beginPath(); for (let j = 0; j < 9; j++) { const th = j / 9 * 6.283, rr = r * (0.6 + 0.6 * R()); fx.lineTo(cx + Math.cos(th) * rr * 1.3, cy + Math.sin(th) * rr); } fx.closePath(); fx.clip();
    fx.clearRect(cx - 3 * r, cy - 3 * r, 6 * r, 6 * r); fx.globalAlpha = 1; fx.drawImage(Lc, 0, 0); fx.restore();
  }
  fx.globalCompositeOperation = 'source-atop';
  for (const [u, w0, a] of [[0.29, 9, 0.08], [0.57, 15, 0.06], [0.81, 7, 0.09]]) { const gr = fx.createLinearGradient(0, Y(1.55), 0, Y(0.95)); gr.addColorStop(0, 'rgba(30,33,36,0)'); gr.addColorStop(0.3, 'rgba(30,33,36,' + a + ')'); gr.addColorStop(1, 'rgba(30,33,36,' + (a * 0.4).toFixed(3) + ')'); fx.fillStyle = gr; fx.globalAlpha = 1; fx.fillRect(u * W, 0, w0, Hc); }
  fx.globalCompositeOperation = 'source-over';
  /* 4. to a texture: rows flipped (a DataTexture's v = 0 is its first row); transparent texels take the wall's colour */
  const src = fx.getImageData(0, 0, W, Hc).data, out = new Uint8Array(W * Hc * 4), wc = [0x3e, 0x43, 0x4a];
  for (let y = 0; y < Hc; y++) for (let k = 0; k < W; k++) {
    const s = (y * W + k) * 4, o = ((Hc - 1 - y) * W + k) * 4, a = src[s + 3], f = Math.min(1, a / 24);
    for (let j = 0; j < 3; j++) out[o + j] = Math.round(wc[j] + (src[s + j] - wc[j]) * f);
    out[o + 3] = a;
  }
  const tex = new T.DataTexture(out, W, Hc, T.RGBAFormat);
  tex.encoding = T.sRGBEncoding; tex.magFilter = T.LinearFilter; tex.minFilter = T.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.anisotropy = Math.min(4, ctx.renderer.capabilities.getMaxAnisotropy()); tex.needsUpdate = true;
  const m = FF.mat({ color: '#ffffff', roughness: 0.95, mottle: 0.03, wallFill: 1.0 }, { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const g = new T.PlaneGeometry(D.x1 - D.x0, D.y1 - D.y0); g.translate((D.x0 + D.x1) / 2, (D.y0 + D.y1) / 2, D.z + 0.003);
  const me = new T.Mesh(g, m); me.name = 'paintedOver'; me.receiveShadow = true; me.castShadow = false; P.obj(me);
}

/* =========================================================================================== THE SEARCH (86.0 .. 113.5), night */
let doorGlass = null, doorUnder = null, doorRoom = null, lampSearch = null, gantry = null, vapour = null;
function buildSearch() {
  const P = place('search', 86.0, 113.6), AZ = -3.2;
  P.add('sFloor', B(86.0, 113.5, -0.5, 0, AZ, 6.0));
  if (false) for (const [x, w, z, d] of [[91.0, 1.4, 1.2, 0.4], [96.5, 1.6, 1.3, 0.5], [100.0, 1.2, -1.9, 0.4], [103.9, 2.0, 0.9, 0.35], [109.5, 2.4, 0.7, 0.5], [111.8, 1.2, -1.7, 0.4]]) {   /* integration: see the Courtyard's puddles */ const g = new T.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); g.scale(w / 2, 1, d); g.translate(x, 0.004, z); P.add('wetS', g); }
  { const g = new T.CircleGeometry(1, 28); g.rotateX(-Math.PI / 2); g.scale(3.3, 1, 1.15); g.translate(103.4, 0.003, 0.1); P.add('wetDark', g); }   // dark wet concrete in the flood patch: the crossing reads
  /* the duct housing on the left (86.0..88.4, top 1.25) with the mouth at 87.2 (sill 0.82; one-way) */
  const ox0 = 87.2 - 0.23, ox1 = 87.2 + 0.23, BZ = -0.45;
  P.add('sWall', B(86.0, ox0, 0, 1.25, -3.0, BZ), true); P.add('sWall', B(ox1, 88.4, 0, 1.25, -3.0, BZ), true);
  P.add('sWall', B(ox0, ox1, 1.18, 1.25, -3.0, BZ), true); P.add('sWall', B(ox0, ox1, 0, 0.82, -3.0, BZ), true);
  P.add('section', B(ox0, ox1, 0.82, 1.18, -1.4, -1.36)); P.add('metal', B(85.98, 88.42, 1.25, 1.31, -3.05, BZ + 0.03));
  P.add('wallDark', B(ox0 - 0.03, ox1 + 0.03, 0.79, 0.82, BZ - 0.02, BZ + 0.03));
  /* the arrival nook (86..90): broken concrete and cable, off the lane (he never comes in here) */
  for (let i = 0; i < 9; i++) P.add('rubble', tilt(0.15 + rnd() * 0.35, 0.06 + rnd() * 0.12, 0.15 + rnd() * 0.3, (rnd() - 0.5) * 30, 86.3 + rnd() * 3.4, 0.04, rnd() < 0.5 ? -0.6 - rnd() * 1.6 : 0.55 + rnd() * 1.4, (rnd() - 0.5) * 40), true);
  { const c = new T.CatmullRomCurve3([[86.4, 0.01, 0.9], [87.5, 0.01, 0.62], [88.9, 0.01, 0.75], [90.0, 0.01, 1.3]].map(p => new T.Vector3(...p))); P.add('metal', new T.TubeGeometry(c, 30, 0.012, 5, false), true); }
  /* A0, a fallen steel shelf (88.0..89.8, 0.30 under; right-end skirt to 0.20); closed on its back face (A16) */
  P.add('metal', B(88.0, 89.8, 0.30, 0.42, -0.8, 0.5), true); P.add('metal', B(89.7, 89.8, 0.20, 0.30, -0.8, 0.5), true);
  P.add('metal', B(88.0, 89.8, 0.0, 0.30, -0.8, -0.76), true);
  for (const x of [88.02, 89.0, 89.72]) P.add('metal', B(x, x + 0.06, 0.42, 1.1, -0.8, -0.74), true);
  P.add('metal', B(88.0, 89.8, 1.04, 1.1, -0.8, -0.74), true); P.add('metal', B(88.0, 89.8, 0.72, 0.76, -0.8, -0.74), true);
  /* deck A: a platform on posts (92.0..98.0, underside 0.67, top 0.85; right-end skirt to 0.22); posts off the lane; closed on
     its back face (he walks ON it at z -1.15); a back rail; steel steps (98.0..99.4) behind the lane; no light through seams */
  P.add('sWall', B(92.0, 98.0, 0.67, 0.85, -1.6, 0.6), true); P.add('metal', B(97.85, 98.0, 0.22, 0.67, -1.6, 0.6), true);
  P.add('sWall', B(92.0, 98.0, 0.0, 0.67, -1.6, -1.56), true);
  for (const x of [92.1, 94.95, 97.75]) P.add('sWall', B(x - 0.09, x + 0.09, 0, 0.67, -1.55, -1.37), true);
  for (const x of [92.1, 97.6]) P.add('sWall', B(x - 0.07, x + 0.07, 0, 0.67, 0.42, 0.56), true);
  P.add('metal', B(92.0, 98.0, 1.83, 1.87, -1.58, -1.54)); P.add('metal', B(92.0, 98.0, 1.33, 1.36, -1.58, -1.54));
  for (let x = 92.05; x < 98.1; x += 1.5) P.add('metal', B(x, x + 0.04, 0.85, 1.87, -1.59, -1.54));
  for (let i = 0; i < 3; i++) { const x0 = 98.0 + i * 0.467; P.add('metal', B(x0, 99.4, 0, 0.85 - i * 0.283, -1.5, -0.8), true); }
  /* pallet B: two pallets end to end on bricks (101.0..103.4, 0.26 under), both ends skirted to 0.20, closed at the back */
  for (let i = 0; i < 12; i++) P.add('crate', B(101.0 + i * 0.2, 101.0 + i * 0.2 + 0.17, 0.37, 0.40, -0.8, 0.6), true);
  for (const z of [-0.78, -0.12, 0.5]) P.add('crate', B(101.0, 103.4, 0.26, 0.37, z, z + 0.1), true);
  P.add('crate', B(101.0, 101.1, 0.20, 0.26, -0.8, 0.6), true); P.add('crate', B(103.3, 103.4, 0.20, 0.26, -0.8, 0.6), true);
  P.add('crate', B(101.0, 103.4, 0.0, 0.26, -0.8, -0.77), true);
  for (const x of [101.1, 102.15, 103.2]) for (const z of [-0.7, 0.42]) P.add('rubble', B(x - 0.1, x + 0.1, 0, 0.26, z - 0.06, z + 0.06), true);
  /* the floodlight on its pole (head at 104.3, 6.1, -2.2) */
  P.add('metal', CY(0.07, 6.3, 104.6, 0, -2.7, 10), true); P.add('metal', B(104.0, 104.75, 5.98, 6.28, -2.5, -2.0), true); P.add('metal', B(104.55, 104.65, 5.9, 6.1, -2.75, -2.25));
  { const g = new T.PlaneGeometry(0.52, 0.34); g.rotateX(Math.PI / 2 + 0.55); g.translate(104.3, 5.95, -2.18); const c = FF.lin('#cdd6df').multiplyScalar(12); P.obj(glowMesh([c.r, c.g, c.b], g)); }
  /* skip C on wheels (105.0..107.2, 0.32 under, body to 1.55), left flap to 0.20, right rear door hanging half open to 0.22
     (A10), closed at the back */
  { const g = new T.BoxGeometry(2.2, 1.23, 1.6, 1, 1, 1); const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) { p.setX(i, p.getX(i) * 0.93); p.setZ(i, p.getZ(i) * 0.92); } g.computeVertexNormals(); g.translate(106.1, 0.32 + 0.615, 0); P.add('metal', g, true);
    P.add('metal', B(105.0, 107.2, 1.5, 1.58, -0.84, 0.84), true);
    for (const x of [105.25, 106.95]) for (const z of [-0.66, 0.66]) { const w = new T.CylinderGeometry(0.11, 0.11, 0.08, 14); w.rotateX(Math.PI / 2); w.translate(x, 0.11, z); P.add('metal', w, true); P.add('metal', B(x - 0.04, x + 0.04, 0.2, 0.33, z - 0.03, z + 0.03), true); }
    P.add('metal', B(105.0, 105.1, 0.20, 0.33, -0.8, 0.8), true);
    P.add('metal', tilt(0.03, 1.36, 1.56, -4, 107.16, 0.89, 0.0), true);
    P.add('metal', B(105.0, 107.2, 0.0, 0.32, -0.8, -0.77), true); }
  /* the annex wall (z -3.2, 2.6 m) with a gateway (99..104; the van is parked behind it) and door N0 at 110 */
  P.add('sWall', B(86.0, 99.0, 0, 2.6, -3.5, AZ), true); P.add('sWall', B(104.0, 109.45, 0, 2.6, -3.5, AZ), true); P.add('sWall', B(110.55, 113.5, 0, 2.6, -3.5, AZ), true);
  P.add('sWall', B(109.45, 110.55, 2.2, 2.6, -3.5, AZ), true); P.add('wallDark', B(86.0, 113.5, 2.6, 2.7, -3.55, AZ + 0.05));
  P.add('metal', B(98.85, 99.05, 0, 2.9, -3.55, AZ + 0.02)); P.add('metal', B(103.95, 104.15, 0, 2.9, -3.55, AZ + 0.02));
  P.bg('sFloor', B(86.0, 140, -0.5, 0, -40, -3.5));
  /* the room behind door N0: lit when the searcher's entry begins (light under the door first, a torch behind the glass) */
  P.add('wallDark', B(108.4, 111.6, 0, 2.6, -6.2, -6.0)); P.add('wallDark', B(108.4, 108.6, 0, 2.6, -6.0, -3.5)); P.add('wallDark', B(111.4, 111.6, 0, 2.6, -6.0, -3.5)); P.add('wallDark', B(108.4, 111.6, 2.6, 2.8, -6.2, -3.5));
  { const m = FF.glow([1, 1, 1]); doorRoom = new T.Mesh(new T.PlaneGeometry(2.7, 2.4), m); doorRoom.position.set(110.0, 1.25, -5.95); P.obj(doorRoom); m.color.setRGB(0, 0, 0); }
  { const dn = mkProp('doorN0', 109.45, 0, AZ + 0.01); const parts = [B(0, 1.1, 0, 2.2, 0, 0.05)];
    const me = new T.Mesh(FF.geo.merge(parts), mat('metal')); me.castShadow = true; me.receiveShadow = true; dn.add(me);
    const gm = FF.glow([1, 1, 1]); gm.color.setRGB(0, 0, 0); doorGlass = new T.Mesh(new T.PlaneGeometry(0.3, 0.36), gm); doorGlass.position.set(0.55, 1.6, 0.052); dn.add(doorGlass); }
  { const gm = FF.glow([1, 1, 1]); gm.color.setRGB(0, 0, 0); const g = new T.PlaneGeometry(1.1, 0.5); g.rotateX(-Math.PI / 2); g.translate(110.0, 0.003, AZ + 0.25); doorUnder = new T.Mesh(g, gm); P.obj(doorUnder); }
  /* the small amber lamp over the door */
  { const ac = FF.lin('#ffae4a').multiplyScalar(5); lampSearch = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), FF.glow([ac.r, ac.g, ac.b], false)); lampSearch.position.set(110.0, 2.42, -3.12); P.obj(lampSearch);
    const hs = halo('#ffae4a', 0.6, 0.7); hs.position.set(110.0, 2.42, -3.07); P.obj(hs); P.add('metal', B(109.9, 110.1, 2.46, 2.52, -3.2, -3.08)); }
  /* the fence (113.0..113.5): corrugated sheets on rails and posts; at the lane its corner is bent up, 0.20 clear (the gap) */
  for (let z = -3.0; z < -0.35; z += 0.88) { const g = new T.BoxGeometry(0.02, 3.2, 0.86); g.translate(113.22, 1.6, z + 0.43); P.add('sheet', g, true); for (let r = 0; r < 4; r++) P.add('sheet', B(113.235, 113.25, 0, 3.2, z + 0.08 + r * 0.2, z + 0.12 + r * 0.2), true); }
  { const fs = mkProp('fenceSheet', 113.22, 3.2, 0.25); const parts = [B(-0.01, 0.01, -3.0, -0.25, -0.6, 0.6)];
    for (let r = 0; r < 5; r++) parts.push(B(0.01, 0.025, -3.0, -0.25, -0.52 + r * 0.24, -0.48 + r * 0.24));
    const lip = new T.BoxGeometry(0.02, 0.32, 1.2); lip.rotateZ(-0.75); lip.translate(0.1, -3.0 + 0.0, 0); parts.push(lip);
    const me = new T.Mesh(FF.geo.merge(parts), mat('sheet')); me.castShadow = true; me.receiveShadow = true; fs.add(me); }
  P.add('metal', B(113.3, 113.5, 0.38, 0.44, -3.0, 0.85), true); P.add('metal', B(113.3, 113.5, 2.6, 2.66, -3.0, 0.85), true);
  for (const z of [-3.0, -1.5, 0.82]) P.add('metal', B(113.3, 113.48, 0, 3.4, z - 0.05, z + 0.05), true);
  P.add('section', B(113.0, 113.5, 0.2, 3.2, 0.85, 0.88));
  /* the night beyond: warehouses, poles, cables; A24: a tall gantry arm that swings a few degrees and stops; a stack whose
     vapour pulses with the far thud */
  for (const [x0, x1, h, z] of [[84, 99, 7.5, -12], [99, 108, 9.5, -17], [108, 126, 6.5, -11], [118, 140, 11, -21], [88, 96, 14, -26]]) P.bg('farNight', B(x0, x1, 0, h, z - 5, z));
  for (const x of [95.5, 116]) P.bg('metal', CY(0.08, 9, x, 0, -9.5, 8));
  { const c = new T.CatmullRomCurve3([[95.5, 8.8, -9.5], [101, 7.2, -9.6], [106, 7.6, -9.7], [116, 8.8, -9.5]].map(p => new T.Vector3(...p))); P.bg('metal', new T.TubeGeometry(c, 40, 0.015, 4, false)); }
  { gantry = new T.Group(); gantry.position.set(104.0, 26.0, -14.0); const mk = mat('farNight');
    const mast = new T.Mesh(B(-0.5, 0.5, -26.0, 0.0, -0.5, 0.5), mk); mast.position.y = 0; const arm = new T.Mesh(B(-16, 4, -0.6, 0.6, -0.4, 0.4), mk); const cab = new T.Mesh(B(-15.6, -13.8, -3.2, -0.6, -0.5, 0.5), mk);
    const pivot = new T.Group(); pivot.add(arm); pivot.add(cab); gantry.add(mast); gantry.add(pivot); gantry.userData.pivot = pivot; P.obj(gantry, true); }
  P.bg('farNight', CY(1.4, 30, 98.0, 0, -22, 14, 1.1));
  { const m = new T.ShaderMaterial({ uniforms: { uCol: { value: FF.lin('#8a96a2').multiplyScalar(0.0) }, uT: FF.U.uFFTime },
      vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uCol; uniform float uT; varying vec2 vU; void main(){ vec2 q = vU - vec2(0.5, 0.0); float w = 0.12 + 0.35 * vU.y; float a = exp(-pow(q.x / w, 2.0) * 3.0) * smoothstep(0.0, 0.08, vU.y) * (1.0 - smoothstep(0.4, 1.0, vU.y)); a *= 0.75 + 0.25 * sin(vU.y * 9.0 - uT * 0.6); gl_FragColor = vec4(uCol * a, 1.0); }',
      blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true });
    const g = new T.PlaneGeometry(9, 16); g.translate(0, 8, 0); vapour = new T.Mesh(g, m); vapour.position.set(98.0, 30, -22); vapour.name = 'vapour'; P.obj(vapour, true); }
  P.done();
}

/* =========================================================================================== BREATHING SPACE (113.5 .. 129.0) */
let works = null, worksArm = null;
function buildRest() {
  const P = place('rest', 113.4, 131.0);
  P.add('rest', profileGeo(113.5, 127.2, -2.4, 8.0, -3.0, 0, true));
  P.add('sFloor', B(113.5, 117.2, 0.0, 0.006, -1.0, 1.4)); P.add('sFloor', B(117.6, 119.0, 0.0, 0.006, -0.6, 0.9));   // cracked concrete slabs
  P.add('wet', (() => { const g = new T.CircleGeometry(1, 18); g.rotateX(-Math.PI / 2); g.scale(0.9, 1, 0.35); g.translate(115.6, 0.009, 0.8); return g; })());
  /* the low broken wall (z -2.4, 0.9 m) with weeds on top; beyond it haze */
  for (const [x0, x1, h] of [[113.5, 116.8, 0.9], [116.8, 118.1, 0.62], [118.1, 124.6, 0.9], [124.6, 125.4, 0.5], [125.4, 127.0, 0.9]]) { P.add('sWall', B(x0, x1, 0, h, -2.7, -2.4), true); P.add('wallDark', B(x0, x1, h, h + 0.06, -2.74, -2.36)); }
  /* the lean-to (119.6..123.4): a corrugated sheet from the wall top down onto two short timber props in front of the lane,
     0.53 over the lane (integration: was 0.33, which the rabbit's ears pierced when it sat up to listen and groom (0.45 m);
     the props keep its front edge at ear-tip height from the intimate camera, so the rabbit still reads beneath it) */
  { const run = 2.87, rise = 0.53, len = Math.hypot(run, rise), a = Math.atan2(rise, run);
    const g = corrugated(len, 3.9, 9, 0.02); g.rotateY(Math.PI / 2); g.rotateX(a); g.translate(121.5, 1.0 - rise / 2, -2.45 + run / 2); P.add('sheet', g, true);
    P.add('timber', B(119.62, 119.72, 0, 0.47, 0.32, 0.42), true); P.add('timber', B(123.28, 123.38, 0, 0.47, 0.32, 0.42), true); }
  /* the channel at the end (127.2: a deep drainage channel), its far wall rising into the foot of the colossal Works */
  P.add('sWall', B(127.2, 129.0, -3.0, -1.6, -6, 8)); P.add('section', B(127.0, 127.2, -3.0, 0.0, 0.45, 8.0)); P.add('wetDark', B(127.2, 129.0, -1.6, -1.55, -6, 8));
  if (!S2on()) {   /* Sequence 2: the far bank (y 0) and the sloped wall, cut at the section plane, are FF.WorldS2's */
  P.add('works', B(129.0, 131.0, -3.0, 0.4, -8, 8), true);
  { const g = new T.BufferGeometry(); const x0 = 131, x1 = 175, z0 = -40, z1 = 6;
    g.setAttribute('position', new T.Float32BufferAttribute([x0, 0.4, z1, x1, 70, z1, x1, 70, z0, x0, 0.4, z1, x1, 70, z0, x0, 0.4, z0, x0, 0.4, z1, x0, -3, z1, x1, 70, z1], 3)); g.computeVertexNormals(); P.add('works', g); }
  }
  /* the Works in the haze (revealed by the pull-out): a colossal mass, one vast arm moving with the 4 s thud, a tiny amber light */
  works = new T.Group(); works.name = 'works';
  { const mk = mat('works');
    for (const [x0, x1, h, z0, z1] of [[138, 172, 95, -64, -34], [131, 142, 38, -40, -24], [168, 200, 140, -90, -58], [196, 240, 70, -120, -80]]) works.add(new T.Mesh(B(x0, x1, 0, h, z0, z1), mk));
    works.add(new T.Mesh(B(127, 133, 34, 36, -36, -26), mk)); works.add(new T.Mesh(B(141.5, 143, 0, 60, -33.5, -32), mk));
    const ribs = []; for (let x = 139.5; x < 171; x += 2.6) ribs.push(B(x, x + 0.5, 0, 95, -34.0, -33.4)); for (let y = 12; y < 95; y += 9) ribs.push(B(138, 172, y, y + 0.6, -34.0, -33.5));
    for (let y = 6; y < 38; y += 5) ribs.push(B(131, 142, y, y + 0.4, -24.0, -23.6));
    works.add(new T.Mesh(FF.geo.merge(ribs), mk));
    const armPivot = new T.Group(); armPivot.position.set(133, 15, -26); armPivot.add(new T.Mesh(B(-30, 3, -0.7, 0.7, -0.7, 0.7), mk)); armPivot.add(new T.Mesh(B(-29, -27.4, -6, -0.7, -0.5, 0.5), mk)); armPivot.add(new T.Mesh(B(-12, -11, -0.7, 4.5, -0.4, 0.4), mk)); works.add(armPivot); worksArm = armPivot;
    for (const [x, y] of [[145.2, 21], [151.4, 30], [157.8, 21], [164.0, 48]]) { const c = FF.lin('#d9e2ea').multiplyScalar(0.9); const wm = new T.Mesh(new T.PlaneGeometry(0.9, 0.5), FF.glow([c.r, c.g, c.b], false)); wm.position.set(x, y, -33.3); works.add(wm); }
    const ac = FF.lin('#ffae4a').multiplyScalar(3.2); const am = new T.Mesh(new T.SphereGeometry(0.22, 8, 6), FF.glow([ac.r, ac.g, ac.b], false)); am.position.set(136.5, 22.5, -23.8); works.add(am);
    const h = halo('#ffae4a', 0.55, 2.4); h.position.set(136.5, 22.5, -23.6); works.add(h); }
  P.obj(works, true);
  P.bg('grassFar', B(110, 320, -0.6, -0.05, -210, -2.8));
  for (const [x, z, h, r] of [[92, -150, 40, 1.4], [101, -175, 55, 2.0], [80, -190, 30, 1.2]]) P.bg('works', CY(r, h, x, 0, z, 10, r * 0.8));   // far stacks: signs of the human world
  for (let i = 0; i < 8; i++) { const x = 70 + rnd() * 55, w = 4 + rnd() * 10, hh = 1.5 + rnd() * 3; P.bg('works', B(x, x + w, 0, hh, -62 - rnd() * 20, -55)); }
  for (const [x, y, z] of [[92, 38.8, -149], [101.2, 53.5, -174]]) { const c = FF.lin('#ffae4a').multiplyScalar(1.6); const me = new T.Mesh(new T.SphereGeometry(0.2, 8, 6), FF.glow([c.r, c.g, c.b], false)); me.position.set(x, y, z); P.obj(me, true); }
  /* grass, clover under the lean-to (sparse in the lane), weeds on the wall top, a few dark foreground stems */
  grass(P, 850, 113.6, 127.0, -2.3, 1.7, 0.05, 0.42, '#56615a', { share: 0.12, skip: (x, z) => (x > 119.5 && x < 123.5 && z > -2.4 && z < 0.5 && rnd() < 0.82) || (Math.abs(z) < 0.22 && rnd() < 0.85) || (x > 113.4 && x < 117.3 && z > -1.05 && z < 1.45) });
  grass(P, 220, 113.6, 127.0, -2.68, -2.42, 0.18, 0.62, '#3d4540', { r: 0.010, share: 0.03, y: (x) => (x > 116.8 && x < 118.1) ? 0.62 : (x > 124.6 && x < 125.4) ? 0.5 : 0.9 });
  grass(P, 80, 113.6, 127.0, 2.8, 4.6, 0.12, 0.4, '#1e211f', { r: 0.007, share: 0.01 });
  P.done();
}

/* =========================================================================================== Sequence 2 (FF.WorldS2, ff-world-s2.js) */
/* The Works are built by ff-world-s2.js with this file's toolkit. Everything below marked "Sequence 2" is inert while the
   rabbit is in Sequence 1 (and absent when FF.S2 or FF.WorldS2 is not loaded). */
const S2on = () => !!(FF.S2 && FF.S2.ground && FF.WorldS2);
function s2api() {
  return { T, B, CY, tilt, sphere, lump, dome, quadGeo, corrugated, profileGeo, glowMesh, halo, mkProp, grass, place, mat, prng, MAT, GLYPH, catmull,
    SETS, SPOT_IDS, POINT_IDS, SPOT_DEF, POINT_DEF, H, rig, owner, props, propBase, places,
    get rnd() { return rnd; }, setRnd(f) { rnd = f; }, get S() { return S; }, get root() { return root; }, get ctx() { return ctx; }, get rain() { return rain; } };
}

/* =========================================================================================== the World object */
const World = FF.World = {
  stub: false,
  look: null,
  get looks() { return FF.LOOKS; },
  init(c) {
    ctx = c; rnd = prng(20261007); tierNow = FF.tier;
    if (S2on()) FF.WorldS2.declare(s2api());          // Sequence 2: the Works' looks, light handles, sets, materials, the footprint mask
    buildLooks(); World.look = clone(FULL.verge);
    registerHooks();
    root = new T.Group(); root.name = 'world'; c.scene.add(root);
    FF.applyShading(World.look); FF.U.uFFKeyMode.value = 0;
    buildRig();
    buildVerge(); buildDrain(); buildCourtyard(); buildSearch(); buildRest();
    makeConeBeam('K0'); makeConeBeam('K1');
    buildRain();
    if (S2on()) { matWorks = true; try { FF.WorldS2.build(s2api()); } finally { matWorks = false; } }   // Sequence 2: the Works (its own seeded random, after every S1 placement; its materials carry the Works' lighting)
    /* a fogged backdrop box so every pixel gets haze, never the clear colour */
    { const m = mat('back'); m.side = T.BackSide; const me = new T.Mesh(B(-240, 330, -8, 150, -215, 60), m); me.name = 'backdropBox'; me.frustumCulled = false; root.add(me); }   // inside the camera's far plane (260)
    /* contact-shadow boxes 1..5 are the world's (index 0 is the box, the Player's): set per light set in applySet() */
    for (const off of offs) off(); offs = [];
    if (FF.bus) {
      offs.push(FF.bus.on('sound', d => { if (d && /thud/.test(d.cue || '')) S.thud0 = FF.G.frameT; }));
      offs.push(FF.bus.on('walkway-start', () => { S.walkwayT = FF.G.frameT; }));
      offs.push(FF.bus.on('walkway', d => { if (d && (d.phase === 'start' || d.phase === 'boots') && S.walkwayT < 0) S.walkwayT = FF.G.frameT; }));
    }
    World.setTier(FF.tier);
    World.reset(FF.S1.checkpoints[0]);
  },
  /* named light handles (virtual: each keeps its own state; it reaches the rig only while its set owns the slot) */
  spot(id) { return H[id] && SPOT_IDS[id] ? H[id] : null; },
  point(id) { return H[id] && POINT_IDS[id] ? H[id] : null; },
  /* a movable set piece by id. Built: box, gateLeafL, gateLeafR, doorN0, walkwayDoorL, walkwayDoorR, fenceSheet, amberLamp,
     culvertSlab. Each sits at its rest pose (prop.userData.base); unknown ids get an empty group (never crash). Once anyone
     else moves doorN0 / walkwayDoorL (directly or through open()), the world stops its own fallback animation of that door. */
  prop(id) {
    if (!props[id]) { const g = new T.Group(); g.name = 'prop:' + id; if (root) root.add(g); props[id] = g; propBase[id] = { x: 0, y: 0, z: 0, ry: 0 }; g.userData.base = propBase[id]; }
    return props[id];
  },
  /* convenience for the movers: gate leaves slide (metres: L to the left, R to the right); doors swing (0 shut .. 1 open) */
  open(id, v) {
    const p = props[id], b = propBase[id]; if (!p) return;
    if (id === 'gateLeafL') p.position.x = b.x - v; else if (id === 'gateLeafR') p.position.x = b.x + v;
    else if (id === 'doorN0' || id === 'walkwayDoorL') p.rotation.y = -1.55 * clamp(v, 0, 1);
    else if (id === 'walkwayDoorR') p.rotation.y = 1.55 * clamp(v, 0, 1);
  },
  get rig() { return rig; },
  get set() { return S.set; },
  reset(cp) {
    for (const id in H) { const h = H[id]; h.st.on = false; h.st.intensity = 0; h.st.derived = 0; h.st.beam = true; h.st.ext = false; }
    for (const id in props) { const p = props[id], b = propBase[id]; if (!b || id === 'box') continue; p.position.set(b.x, b.y, b.z); p.rotation.set(0, b.ry || 0, 0); }
    S.walkwayT = -1; S.entryOpen = 0; S.thud0 = -1; S.shadowCfg = {}; S.mine = {}; for (const k in asked) delete asked[k]; for (const k in lastPose) delete lastPose[k];
    const x = cp ? cp.x : FF.S1.spawn.x;
    S.set = x < 52 ? 'VD' : x < 86 ? 'C' : 'SR';
    if (S2on()) { if (x >= 124) S.set = FF.WorldS2.setAt(x); FF.WorldS2.reset(cp); }   // Sequence 2
    S.lookKey = ''; updateLook(x, true, true); applySet(true);
  },
  frame(dt) {
    const G = FF.G, r = G.rabbit; if (!root) return;
    S.frameN++;
    const cam = ctx.camera.position, rx = r ? r.x : FF.S1.spawn.x;
    /* the light set: verge + drain until the top of the sump ramp (55.4; back to it below x 52, inside the pipe), the
       Courtyard until the duct transit passes the pier, then the Search + rest. Switches happen where the player cannot judge light. */
    let set = rx >= 86 ? 'SR' : rx < 52 ? 'VD' : rx >= 55.4 ? 'C' : (S.set === 'SR' ? 'C' : S.set);   // 52..55.4 (the sump): keep the set you came with
    if (r && (r.mode === 'transit' || r.mode === 'climb')) set = cam.x > 84.7 ? 'SR' : 'C';
    if (r && r.mode === 'popout') set = 'SR';
    if (S2on() && (rx >= 124 || S.set[0] === 'W')) set = FF.WorldS2.setFor(rx, r, S.set, cam);   // Sequence 2: the Works' sets
    if (set !== S.set) { S.set = set; applySet(); }
    updateLook(rx, false);
    derivedLights(dt);
    for (const s of ['K0', 'K1', 'P0', 'P1']) applySpot(s);
    FF.U.uFFCoverFull.value = S.set === 'SR' && owner('K1') === 'flood' && rig.K1.shadow.radius < 0 ? 1 : 0;
    for (const s of ['B0', 'B1']) applyPoint(s);
    skyAndFill(cam);
    updateBeam('K0'); updateBeam('K1');
    visibility(cam);
    weather(cam, dt);
    decor(dt);
    if (S2on()) FF.WorldS2.frame(dt, cam);             // Sequence 2: the press lamps' masks, water, drips
  },
  setTier(t) {
    tierNow = t; if (!root) return;
    S.shadowCfg = {};
    for (const g of grassSets) { const share = g.share || 0; g.im.count = Math.min(g.im.userData.max || 0, Math.round((t.grass || 3500) * share)); }
    if (rain) rain.geometry.setDrawRange(0, Math.min(RAIN_MAX, t.rain || 900) * 2);
    if (splash) { splash.geometry.setDrawRange(0, Math.min(SPLASH_MAX, t.splashes || 0)); splash.visible = (t.splashes || 0) > 0; }
    if (drips) drips.geometry.setDrawRange(0, Math.min(DRIP_MAX, t.drips || 10));
    if (motes) motes.userData.tierOn = !!t.motes;
    if (winBeam) { winBeam.material.defines.SAMPLES = t.beamSamples || 6; winBeam.material.needsUpdate = true; }
    /* the key's beam (torch / verge torch) gets up to 6 samples, the second slot's wide, soft beams (flood, skylight) fewer: they
       cover much of the screen (measured at Retina 2x: the two beams cost ~1.8 ms of the Search's frame at 8 samples) */
    for (const s in beams) { const n = t.coneSamples || 5; beams[s].mat.defines.SAMPLES = s === 'K0' ? Math.min(n, 6) : Math.max(3, n - 3); beams[s].mat.needsUpdate = true; }
    const sz = t.skyShadow || 1024; if (rig.D0 && rig.D0.shadow.radius >= 0) setMap(rig.D0, sz);
    if (S2on()) FF.WorldS2.setTier(t);
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
  /* push live-tuned look numbers (FF.LOOKS.* or FF.LOOK.*): rebuild the full looks and re-blend */
  apply() { buildLooks(); S.lookKey = ''; updateLook(FF.G.rabbit ? FF.G.rabbit.x : FF.S1.spawn.x, true); S.shadowCfg = {}; },
  /* the thud's phase (0..1 within its 4 s period), for anyone who wants the far Works in time */
  thudPhase() { const t0 = S.thud0 >= 0 ? S.thud0 : 0; return (((FF.G.frameT - t0) / S.thudPeriod) % 1 + 1) % 1; },
  dispose() {
    for (const off of offs) off(); offs = [];
    if (root) root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } } });
    if (haloTex) haloTex.dispose();
    for (const k of ['K0', 'K1', 'D0']) if (rig[k] && rig[k].shadow && rig[k].shadow.map) rig[k].shadow.map.dispose();
  },
  debug() {
    const own = {}; for (const s of ['K0', 'K1', 'P0', 'P1', 'B0', 'B1']) own[s] = owner(s) ? owner(s) + (rig[s].intensity > 0 ? ':' + (+rig[s].intensity.toFixed(2)) : ':off') : '-';
    const vis = []; for (const id in places) if (places[id].group.visible) vis.push(id + (places[id].back.visible ? '+bg' : ''));
    const sh = {}; for (const s of ['K0', 'K1', 'D0']) sh[s] = rig[s].shadow.radius < 0 ? 'dormant' : rig[s].shadow.mapSize.x + (rig[s].shadow.autoUpdate ? ' live' : ' frozen');
    return { stub: false, set: S.set, look: S.look.from + (S.look.from !== S.look.to ? '>' + S.look.to + ' ' + S.look.t.toFixed(2) : ''), lights: own, D0: +rig.D0.intensity.toFixed(2), shadows: sh, places: vis,
      beams: Object.keys(beams).filter(k => beams[k].mesh.visible), rain: rain ? +(rain.material.uniforms.uRate.value).toFixed(2) : 0, keyMode: FF.U.uFFKeyMode.value, coreMask: FF.U.uFFCoreOn.value,
      s2: S2on() ? FF.WorldS2.debug() : null };
  },
};

/* =========================================================================================== per-frame helpers */
function updateLook(x, force, atReset) {
  const r = !atReset && FF.G && FF.G.rabbit; let b = FF.Level.lookBlend(x);
  /* the duct transit: courtyard -> search as the camera passes behind the foreground pier (x 83.45..86.05 at z 4.4..7.6) */
  if (r && (r.mode === 'transit' || r.mode === 'climb' || r.mode === 'popout')) { const cx = ctx.camera.position.x; b = { from: 'courtyard', to: 'search', t: r.mode === 'popout' ? 1 : sstep(84.1, 85.3, cx) }; }
  const key = b.from + '|' + b.to + '|' + b.t.toFixed(4);
  if (!force && key === S.lookKey) return; S.lookKey = key; S.look = b;
  const A = FULL[b.from] || FULL.verge, Bb = FULL[b.to] || A;
  blendInto(World.look, A, Bb, b.t);
  FF.applyShading(World.look);
  FF.U.uFFKeyMode.value = S.set === 'C' ? 1 : 0;
  if (winBeam) { const u = winBeam.material.uniforms; u.uDens.value = World.look.shafts.density; u.uBase.value = World.look.shafts.base; u.uCol.value.copy(FF.lin(World.look.shafts.color)); u.uFogD.value = World.look.fog.density; }
  const H0 = rig.H; H0.color.copy(FF.lin(World.look.ambient.sky)); H0.groundColor.copy(FF.lin(World.look.ambient.ground)); H0.intensity = World.look.ambient.intensity;
}
/* per light set: key mode, the core mask, contact-shadow boxes 1..5, shadow configs */
function applySet() {
  FF.U.uFFKeyMode.value = S.set === 'C' ? 1 : 0;
  FF.U.uFFCoreOn.value = S.set === 'SR' ? 1 : 0;
  S.shadowCfg = {};
  const k = FF.LOOK.ao.objects;
  const off = i => FF.setAOBox(i, [0, -50, 0], [0.1, 0.1, 0.1], 0, 0.3);
  if (S.set === 'C') { FF.setAOBox(1, [63.9, 6, -5.5], [11.3, 6, 0.5], k, 0.6); FF.setAOBox(2, [79.35, 0.725, -2.72], [4.15, 0.725, 2.28], k, 0.4); FF.setAOBox(3, [84.75, 6, -2.2], [1.25, 6, 2.8], k, 0.45); off(4); off(5); }
  else if (S.set[0] === 'W' && S2on()) FF.WorldS2.applySet(S.set, k, off);   // Sequence 2
  else if (S.set === 'SR') { FF.setAOBox(1, [100, 1.3, -3.35], [14, 1.3, 0.15], k, 0.5); FF.setAOBox(2, [106.1, 0.9, 0], [1.1, 0.6, 0.85], k, 0.45); FF.setAOBox(3, [87.2, 0.62, -1.7], [1.2, 0.62, 1.3], k, 0.45); FF.setAOBox(4, [121.5, 0.45, -2.55], [5.8, 0.45, 0.15], k, 0.45); off(5); }
  else { FF.setAOBox(1, [21.6, 6, -4.5], [17.4, 6, 0.3], k, 0.55); FF.setAOBox(2, [5.0, 6, -3.9], [0.8, 6, 1.0], k, 0.5); FF.setAOBox(3, [40.3, 6, -1.8], [1.3, 6, 2.4], k, 0.5); FF.setAOBox(4, [10.95, 0.15, -0.2], [0.15, 0.15, 1.4], k, 0.25); off(5); }
}
const _hp = new T.Vector3(), _hd = new T.Vector3(), _jp = new T.Vector3();
function derivedLights(dt) {
  const G = FF.G, L = World.look;
  /* world-owned: the window key (from the look), the opening, the bounce, the flood, the door lamp */
  windowPose(H.window, L);
  { const h = H.opening.st, O = L.opening; h.derived = O.spill; toColor(O.glow, h.color); h.distance = O.spillDistance; }
  { const h = H.bounce.st, Bc = L.bounce; h.derived = Bc.intensity; toColor(Bc.color, h.color); h.distance = Bc.distance; }
  H.flood.st.derived = SPOT_DEF.flood.intensity; H.doorLamp.st.derived = POINT_DEF.doorLamp.intensity;
  { const r = G.rabbit; H.scrapeFill.st.derived = r && r.x < 4.5 ? POINT_DEF.scrapeFill.intensity * clamp((4.5 - r.x) / 1.5, 0, 1) : 0; }
  { const r = G.rabbit, h = H.pipeFill.st, under = r && r.x > 38.4 && ((r.y < -0.45 && r.x < 53.6) || (r.y < -0.04 && r.x < 55.6));
    h.derived = under ? POINT_DEF.pipeFill.intensity : 0; if (under) h.pos = [r.x + 0.15 * (r.face || 1), r.y + 0.32, 0.55]; }
  { const k = H.skylight.st; k.derived = SPOT_DEF.skylight.intensity * (L.key.intensity / 14.8); toColor(L.key.color, k.color); }
  /* the amber lamp: on from the walkway (whoever drives it), or once the walkway is done */
  const amberOn = H.amber.effective() > 0 || !!(G.flags && (G.flags.walkwayDone || G.flags.amberOn)) || (S.walkwayT >= 0 && G.frameT - S.walkwayT >= 2.5);
  H.amber.st.derived = amberOn ? POINT_DEF.amber.intensity : 0;
  if (amberGlow) { amberGlow.visible = amberOn; amberHalo.visible = amberOn; }
  /* walkway door L: its light follows its leaf (or the walkway timeline if nobody animates the door) */
  { const dw = props.walkwayDoorL; if (dw && S.mine.walkwayDoorL != null && Math.abs(dw.rotation.y - S.mine.walkwayDoorL) > 1e-4) asked.walkwayDoorL = true;
    let open = Math.abs(dw ? dw.rotation.y : 0) / 1.55;
    if (!asked.walkwayDoorL && S.walkwayT >= 0) { const t = G.frameT - S.walkwayT; open = t < 2.5 ? 0 : t < 3.0 ? (t - 2.5) / 0.5 : t < 11.5 ? 1 : Math.max(0, 1 - (t - 11.5) / 0.6); World.open('walkwayDoorL', open); S.mine.walkwayDoorL = dw.rotation.y; }
    H.walkwayDoor.st.derived = SPOT_DEF.walkwayDoor.intensity * clamp(open, 0, 1); if (walkwayGlowL) walkwayGlowL.visible = open > 0.02; }
  /* door N0: the room lights at the entry's cue (light under the door, a torch behind its glass), the leaf opens over 0.5 s
     from the start of the entry's doorway segment (FF.AI.entrySegs); already open for the door reveal's short replay (s.replay) */
  { const s = G.searcher || {}, entryT = s.entryT != null && s.state !== 'off' ? s.entryT : -1, done = !!(G.flags && G.flags.entryDone);
    const dwSeg = FF.AI && FF.AI.entrySegs && FF.AI.entrySegs.find(q => q.kind === 'doorway'), doorAt = dwSeg ? dwSeg.t0 : 2.5;
    const roomOn = done || entryT >= 0 || !!s.replay || (s.active && s.state !== 'wait' && s.state !== 'off');
    const dn = props.doorN0; if (dn && S.mine.doorN0 != null && Math.abs(dn.rotation.y - S.mine.doorN0) > 1e-4) asked.doorN0 = true;
    let open = Math.abs(dn ? dn.rotation.y : 0) / 1.55;
    if (!asked.doorN0) { const want = done || s.replay || (s.active && s.state !== 'wait' && s.state !== 'off' && entryT < 0) ? 1 : entryT >= doorAt ? clamp((entryT - doorAt) / 0.5, 0, 1) : 0; open = want; World.open('doorN0', open); S.mine.doorN0 = dn.rotation.y; }
    H.doorSpill.st.derived = SPOT_DEF.doorSpill.intensity * clamp(open, 0, 1);
    const flick = roomOn ? 1 : 0, torchBehind = entryT >= 0 && entryT < doorAt ? 0.5 + 0.5 * Math.sin(G.frameT * 2.3) : 0;
    if (doorRoom) doorRoom.material.color.copy(FF.lin('#d9e2ea')).multiplyScalar(1.2 * flick);
    if (doorGlass) doorGlass.material.color.copy(FF.lin('#d9e2ea')).multiplyScalar(roomOn ? 0.9 + 3.5 * torchBehind : 0.02);
    if (doorUnder) doorUnder.material.color.copy(FF.lin('#d9e2ea')).multiplyScalar(roomOn ? 0.35 * (1 - clamp(open, 0, 1)) : 0); }
  /* the gate glare helper: the headlights at the gate (the van stopped facing it) flood the grass under the 0.22 gap */
  { const hl = H.headlights, st = hl.st; let k = 0;
    if (hl.effective() > 0) { _hp.fromArray(st.pos); _hd.fromArray(st.target).sub(_hp).normalize(); if (_hp.x > 30.0 && _hp.x < 36.0 && _hp.z < -4.0 && _hd.z > 0.5) k = clamp(1 - (-4.0 - _hp.z) / 6, 0.3, 1); }
    const gx = props.gateLeafR ? Math.max(0, props.gateLeafR.position.x - propBase.gateLeafR.x) : 0;
    H.gateGlare.st.derived = SPOT_DEF.gateGlare.intensity * k * (1 + gx * 1.5) * hl.effective() / SPOT_DEF.headlights.intensity;
    if (k > 0) H.gateGlare.st.pos = [clamp(_hp.x, 31.4, 34.6), 0.24, -4.35]; }
  /* joints: the headlights' light leaking through the open joints of the wall as the van passes behind it */
  if (joints) {
    const hl = H.headlights, on = owner('K0') === 'headlights' ? hl.effective() : 0, col = joints.geometry.attributes.color, xs = joints.userData.xs, wc = FF.lin('#ffe3bd');
    let maxK = 0, gx = 0, gw = 0;
    if (on > 0) { _hp.fromArray(hl.st.pos); _hd.fromArray(hl.st.target).sub(_hp).normalize(); }
    const cosO = Math.cos(Math.min(1.2, hl.st.angle * 2.2));
    const pos = joints.geometry.attributes.position, per = pos.count / xs.length;
    for (let j = 0; j < xs.length; j++) {
      for (let v = 0; v < per; v++) {
        const i = j * per + v, y = pos.getY(i); let k = 0;
        if (on > 0 && _hp.z < -4.4) { _jp.set(xs[j], Math.min(y, 2.5), -4.4).sub(_hp); const d = _jp.length(), c = _jp.dot(_hd) / Math.max(d, 1e-3); k = sstep(cosO, cosO + 0.2, c) * on * 0.1 / (1 + 0.012 * d * d) * (y > 4 ? 0.12 : 1); }
        col.setXYZ(i, wc.r * k, wc.g * k, wc.b * k); if (k > maxK) maxK = k; if (k > 0) { gx += xs[j] * k; gw += k; }
      }
    }
    col.needsUpdate = true;
    if (wallGlow) { const vis = on > 0 && _hp.z < -4.4; wallGlow.visible = vis; if (vis) { wallGlow.material.uniforms.uCol.value.copy(wc).multiplyScalar(0.05 * on / 34); wallGlow.position.x = gw > 0 ? gx / gw : _hp.x + 3; } }
  }
  if (S2on()) FF.WorldS2.derived(dt);                  // Sequence 2: the press lamps from FF.Works, the gate's light, the work lamp's stand
}
function skyAndFill(cam) {
  const L = World.look, sky = L.sky, D0 = rig.D0, D1 = rig.D1;
  const I = (S.set === 'C') ? 0 : sky.intensity;
  D0.color.copy(FF.lin(sky.color)); D0.intensity = I;
  const d = _v.set(sky.dir[0], sky.dir[1], sky.dir[2]).normalize(), cx = cam.x;
  D0.target.position.set(cx + 1.0, 0, -1.0); D0.position.copy(D0.target.position).addScaledVector(d, -45); D0.target.updateMatrixWorld();
  if (I > 0.005) {
    const size = (FF.tier && FF.tier.skyShadow) || 1024;
    if (D0.shadow.radius < 0 || D0.shadow.mapSize.x !== size) { setMap(D0, size); }
    D0.shadow.radius = Math.max(1, (sky.softness || 10) * size / 2048); D0.shadow.autoUpdate = true;
  } else if (D0.shadow.radius >= 0) dormant(D0);
  const f = L.fill; D1.color.copy(FF.lin(f.color)); D1.intensity = f.intensity; D1.position.set(cam.x - f.dir[0] * 10, -f.dir[1] * 10, -f.dir[2] * 10); D1.target.position.set(cam.x, 0, 0); D1.target.updateMatrixWorld();
}
function visibility(cam) {
  const half = 0.4617 * cam.z * Math.max(1, (ctx.camera.aspect || 2)) * 0.5 + 6;
  const lo = cam.x - half, hi = cam.x + half;
  const active = {}; active[S.look.from] = 1; active[S.look.to] = 1;
  const placeActive = id => (id === 'verge' && (active.verge || active['verge-late'] || active.drain)) || (id === 'drain' && (active.drain || active['verge-late'])) || active[id];
  for (const id in places) {
    const P = places[id], inView = P.x1 > lo && P.x0 < hi;
    P.group.visible = inView;
    const pull = id === 'rest' && cam.z > 14 && !(S2on() && cam.x > 131);    // the pull-out shows the far Works (Sequence 2: not from inside them)
    P.back.visible = inView ? !!placeActive(id) || !!(P.looks && P.looks.some(l => active[l])) || pull : pull;
  }
  if (motes) motes.visible = !!motes.userData.tierOn && S.set === 'C';
  if (winBeam) winBeam.visible = S.set === 'C';
}
function weather(cam, dt) {
  const L = World.look, R = L.rain;
  if (rain) {
    const u = rain.material.uniforms, rate = clamp(R.rate, 0, 1);
    rain.visible = rate > 0.01 && (cam.x < 46 || (S2on() && cam.x > 118)); u.uRate.value = rate; u.uMin.value.set(cam.x - 11, -0.2, -10.0); u.uSize.value.set(22, 8.2, 16.5);
    u.uLen.value = R.len; u.uSpd.value = R.speed; u.uWind.value = R.wind; u.uCol.value.copy(FF.lin('#c9d2da')).multiplyScalar(0.13 * R.bright);
    const hl = H.headlights; if (owner('K0') === 'headlights' && hl.effective() > 0) { u.uHL.value.fromArray(hl.st.pos); u.uHLd.value.fromArray(hl.st.target).sub(u.uHL.value).normalize(); u.uHLc.value.set(Math.cos(hl.st.angle), hl.effective() / 34); } else u.uHLc.value.set(0.99, 0);
    const wl = H.worklight; if (owner('P0') === 'worklight' && wl.effective() > 0) { u.uWL.value.fromArray(wl.st.pos); u.uWLd.value.fromArray(wl.st.target).sub(u.uWL.value).normalize(); u.uWLc.value.set(Math.cos(wl.st.angle), wl.effective() / 10); } else u.uWLc.value.set(0.99, 0);
    if (S2on()) FF.WorldS2.rain(u, cam); else u.uS2.value = 0;     // Sequence 2: the roof's gaps, the platens' tops, the high bay
  }
  if (splash) { const u = splash.material.uniforms; splash.visible = (FF.tier.splashes || 0) > 0 && R.rate > 0.05 && cam.x < 42; u.uMin.value.set(cam.x - 9, 0, -3.6); u.uRate.value = clamp(R.rate, 0, 1); u.uPx.value = ctx.renderer.getPixelRatio(); }
  if (slabRain) slabRain.visible = places.drain.group.visible && S.set === 'VD';
  if (drips) drips.material.uniforms.uPx.value = ctx.renderer.getPixelRatio();
  if (motes) motes.material.uniforms.uPx.value = ctx.renderer.getPixelRatio();
}
function decor(dt) {
  const G = FF.G, t = G.frameT, ph = World.thudPhase();
  const pulse = Math.exp(-ph * 6.0);
  /* A24: the gantry arm swings a few degrees and stops, every 20 s */
  if (gantry) { const c = (t % 20) / 20, k = sstep(0.0, 0.2, c) - sstep(0.5, 0.7, c); gantry.userData.pivot.rotation.z = -0.07 * k; }
  if (vapour) { const on = S.set === 'SR' ? 1 : 0; vapour.material.uniforms.uCol.value.copy(FF.lin('#8a96a2')).multiplyScalar(on * (0.02 + 0.05 * pulse)); }
  if (worksArm) worksArm.rotation.z = -0.03 + 0.035 * (1 - Math.exp(-ph * 5.0)) * Math.exp(-ph * 1.2);
  if (searchlight) searchlight.rotation.z = 0.6 * Math.sin(t * 0.11);
}
})();
