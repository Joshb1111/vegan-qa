/* FAR FIELD — look test. ff-config.js: every art-direction number in one place.
   Units are metres. World axes: +X is "right" along the walkway, +Y is up, +Z points towards the camera.
   The rabbit walks on the plane z = 0 (the lane). Colours are written as sRGB hex (what you would pick in a
   colour picker); the code converts them to linear light before they reach the renderer.
   Tune live from the console: __ff.look.key.intensity = 9; __ff.apply()   (apply() pushes the numbers to the scene). */
'use strict';
window.FF = window.FF || {};

FF.LOOK = {
  /* ---- camera: side-on, low, narrow lens, horizon pushed low in the frame so the walls tower ---- */
  camera: {
    fov: 26,            // vertical field of view in degrees (narrow = flatter, more "diorama" side-on)
    dist: 7.6,          // distance from the lane (z = 0) to the lens
    height: 0.66,       // lens height above the floor; low, a little above the rabbit's ears
    horizon: 0.70,      // where eye level sits, as a fraction down the frame (0.5 = centre). Lens shift, verticals stay vertical
    lookAhead: 0.85,    // metres the frame leads the rabbit in the direction it faces
    follow: 2.6,        // follow stiffness (higher = tighter)
    jumpFollow: 0.25,   // how much of a jump the camera rises with
    minX: -5.6, maxX: 8.4,
  },

  exposure: 1.0,        // overall brightness before the filmic curve

  /* ---- the key light: daylight through a high slatted skylight, landing as a broad pool on the floor ---- */
  key: {
    color: '#e8edf2',
    intensity: 7.5,
    dir: [-0.82, -1.0, -0.40],   // direction the light travels: down, to the left, slightly towards the back wall
    poolCenter: [-2.9, 0, -0.6], // where the middle of the pool lands
    ceilingY: 11.5,              // height of the roof the skylight is cut into (out of frame)
    sky: { x0: -5.4, x1: -0.4, z0: -2.5, z1: 0.9 }, // pool footprint on the floor (the skylight is placed to make it)
    mullions: 4,                 // bars across the skylight -> stripes in the pool and separate shafts
    mullionWidth: 0.24,
    penumbra: 0.35,
    shadowSoftness: 2.2,         // soft-shadow radius in shadow-map texels (high tier)
  },

  /* ---- fill: cold, dim, from everywhere ---- */
  ambient: { sky: '#6a7a8c', ground: '#121418', intensity: 0.55 },
  fill: { color: '#8ea0b4', intensity: 0.22, dir: [-0.5, -0.6, -0.6] }, // a soft cold side light so big forms have a lit side
  bounce: { color: '#c8c6c0', intensity: 0.55, distance: 6.5 },          // light thrown back up from the bright pool

  /* ---- the low opening glows faintly from beyond ---- */
  opening: { x: 3.9, w: 0.46, h: 0.40, depth: 0.9, glow: '#cfdcea', glowIntensity: 2.0, spill: 1.6, spillDistance: 2.6 },

  /* ---- one small warm accent, far back ---- */
  amber: { color: '#ffae4a', intensity: 5.0, light: 0.8 },

  /* ---- haze and depth fog ---- */
  fog: {
    color: '#29323c',     // fog far from the light
    density: 0.052,       // per metre beyond `start`
    start: 6.0,           // the lane and near wall stay clear; depth begins behind them
    heightFalloff: 0.10,  // thicker near the floor
    glow: '#6f8293',      // fog seen towards the light picks up this colour (forward scattering)
    glowPower: 5.0,
    glowStrength: 1.0,
  },

  /* ---- light shafts: soft additive sheets inside the beam, plus drifting dust on high ---- */
  shafts: { color: '#c3cfdb', intensity: 0.085, broad: 0.035, noise: 0.55, motes: 360 },

  /* ---- surfaces: smooth, untextured, matte. Values matter more than hue ---- */
  materials: {
    floor:   { color: '#50555b', roughness: 0.62, mottle: 0.10 },
    wall:    { color: '#3e434a', roughness: 0.95, mottle: 0.08 },
    wallDark:{ color: '#2c3036', roughness: 0.95, mottle: 0.06 },
    metal:   { color: '#2a2e33', roughness: 0.70, mottle: 0.04 },
    crate:   { color: '#5d554c', roughness: 0.90, mottle: 0.10 },
    hall:    { color: '#3a4149', roughness: 0.95, mottle: 0.05 },
    rabbit:  { color: '#ddd7ce', roughness: 0.82 },
    innerEar:{ color: '#c9b5ad' },
    eye:     { color: '#141416' },
  },

  /* ---- keeping the rabbit readable ---- */
  rabbit: {
    rim: '#a9bccf',       // cool edge light around the silhouette
    rimStrength: 0.30,
    rimPower: 2.6,
    lift: 0.025,          // a whisper of self-light so it never sinks fully into black
  },

  /* ---- contact shadows (analytic ambient occlusion: cheap, no extra pass) ---- */
  ao: { floorCrease: 0.55, creaseHeight: 0.55, objects: 0.55, objectReach: 0.35, rabbit: 0.55 },

  /* ---- grading (post) ---- */
  grade: {
    saturation: 0.80,
    contrast: 1.06,
    lift: [0.006, 0.009, 0.014],   // shadows lean cold blue-grey
    gain: [0.99, 1.0, 1.02],
    vignette: 0.40,
    grain: 0.030,
    bloom: 0.40,
    bloomThreshold: 0.9,
  },
};

/* Quality tiers: Q cycles them. Each line is what that tier pays for. */
FF.TIERS = {
  high:   { name: 'high',   dpr: 2,   msaa: 4, shadowMap: 2048, shadowTaps: 16, bloom: 2, grain: true,  motes: true,  bounce: true,  amberLight: true,  shaftLayers: 4 },
  medium: { name: 'medium', dpr: 1.5, msaa: 2, shadowMap: 1024, shadowTaps: 8,  bloom: 1, grain: true,  motes: false, bounce: true,  amberLight: false, shaftLayers: 3 },
  low:    { name: 'low',    dpr: 1,   msaa: 0, shadowMap: 512,  shadowTaps: 4,  bloom: 0, grain: false, motes: false, bounce: false, amberLight: false, shaftLayers: 2 },
};
FF.TIER_ORDER = ['high', 'medium', 'low'];

/* The playable space. Collision is data, independent of the meshes: axis-aligned boxes in the lane's x/y plane. */
FF.LEVEL = {
  spawn: { x: -3.2, y: 0, face: 1 },
  solids: [
    { name: 'floor',    x0: -30,  x1: 30,   y0: -1, y1: 0 },
    { name: 'pillar',   x0: -10.0, x1: -7.9, y0: 0,  y1: 12 },   // left end: a massive square column
    { name: 'bulkhead', x0: 10.2, x1: 12.0, y0: 0,  y1: 12 },    // right end: the tall wall that closes the walkway
  ],
  crate: { x: 0.9, w: 0.52, h: 0.44, d: 0.50 },
  rabbit: { hw: 0.16, h: 0.24, hCrouch: 0.15 },
  move: {
    walk: 1.15, run: 2.75, crouch: 0.75, push: 0.62,  // top speeds m/s
    accel: 5.0, decel: 10.0, turn: 14.0, airAccel: 4.0,
    gravity: 21.0, fallGravity: 1.35, jumpHeight: 0.52, jumpCut: 0.5,
    coyote: 0.10, buffer: 0.13,
    runAfter: 0.30,           // seconds of holding a direction before the hop opens into a run
    crateAccel: 1.6, crateFriction: 5.0,
  },
};
