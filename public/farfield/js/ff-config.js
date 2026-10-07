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
    dist: 8.2,          // distance from the lane (z = 0) to the lens
    height: 1.15,       // lens height above the floor: high enough that the floor recedes as a plane to the wall
    horizon: 0.57,      // where eye level sits, as a fraction down the frame (0.5 = centre). Lens shift: verticals stay vertical
    lookAhead: 1.3,     // metres the frame leads the rabbit in the direction it faces
    follow: 2.6,        // follow stiffness (higher = tighter)
    jumpFollow: 0.25,   // how much of a jump the camera rises with
    minX: -3.4, maxX: 7.4,
  },

  exposure: 1.0,        // overall brightness before the filmic curve

  /* ---- the key light: daylight through a high slatted skylight, landing as a broad pool on the floor ---- */
  key: {
    color: '#ffe8c8',            // faintly warm cream daylight; the fill and haze stay cold, so the pool reads warm against them
    intensity: 21.0,
    dir: [-1.28, -1.0, 0.62],    // direction the light travels: down (~35 deg), to the left and towards the lens (from high behind the wall)
    poolCenter: [-1.55, 0, 0.55], // the pool lies on and in front of the lane: its far edge is at the rabbit's feet
    halfDepth: 1.0,              // the beam is a long high window: half its size across the hall (depth) ...
    halfWidth: 0.85,             // ... and half its width across the frame. On the floor: a window-shaped trapezoid
    softDepth: 0.65, softWidth: 0.2,  // soft edges (fraction of each half size)
    streaks: 0.30,               // how strongly the shafts' bands show in the pool on the floor
    streakBase: 0.80,            // pool brightness between the bands
    shadowSoftness: 22,          // soft-shadow radius in shadow-map texels at 2048 (scaled for smaller maps)
  },

  /* ---- cool fill on the walls: reveals their surface and separates them from the foreground (Josh, round 1) ---- */
  wallFill: { color: '#86919d', intensity: 0.56, floor: 0.55, height: 4.5, lean: 0.55, topFade: 0.4 },

  /* ---- fill: cold, dim, from everywhere ---- */
  ambient: { sky: '#737e8a', ground: '#121416', intensity: 0.5 },
  fill: { color: '#8ea0b4', intensity: 0.12, dir: [-0.5, -0.6, -0.6] }, // a soft cold side light so big forms have a lit side
  bounce: { color: '#c8c6c0', intensity: 0.35, distance: 6.0 },          // light thrown back up from the bright pool

  /* ---- the low opening glows faintly from beyond ---- */
  opening: { x: 1.75, w: 0.46, h: 0.40, depth: 0.9, glow: '#dcd9cf', glowIntensity: 0.68, spill: 1.6, spillDistance: 2.6 },

  /* ---- one small warm accent, far back ---- */
  amber: { color: '#ffae4a', intensity: 5.0, light: 0.8 },

  /* ---- haze and depth fog ---- */
  fog: {
    color: '#2b3137',     // fog far from the light
    density: 0.030,       // per metre
    densityFar: 0.0012,   // extra density growing with distance (near stays clear, far thickens) beyond `start`
    start: 7.5,           // the lane and midground stay clear; depth begins behind them
    heightFalloff: 0.02,  // thicker near the floor
    glow: '#97a3ae',      // fog seen towards the light picks up this colour (forward scattering)
    glowPower: 2.2,
    glowStrength: 1.0,
    hall: [7, 1.5, -24, 12], hallColor: '#a7b1ba', hallStrength: 0.36, // backlit haze far right: centre, radius
  },

  /* ---- light shafts: the beam as a volume (analytic, a few samples per pixel), plus drifting dust on high ---- */
  shafts: {
    color: '#d6d4cd', wallZ: -5.0, motes: 320,
    density: 0.036,     // in-scattering of the beam volume
    base: 0.10,         // haze between the shafts (fraction of a shaft)
    /* the few shafts: [offset across the beam in metres (+ = upper-left side), width, strength] */
    bands: [[-0.52, 0.26, 0.75], [-0.05, 0.36, 0.5], [0.42, 0.24, 0.8], [0.72, 0.2, 0.35]],
    haze: 0.16, hazeFalloff: 0.32, hazeDensity: 0.07, hazeBands: 1.2,  // soft glow of the haze around the beam
  },

  /* ---- surfaces: smooth, untextured, matte. Values matter more than hue ---- */
  materials: {
    floor:   { color: '#575c62', roughness: 0.62, mottle: 0.10 },
    wall:    { color: '#3e434a', roughness: 0.95, mottle: 0.08, wallFill: 1.0 },
    wallDark:{ color: '#2c3036', roughness: 0.95, mottle: 0.06, wallFill: 0.8 },
    metal:   { color: '#2a2e33', roughness: 0.70, mottle: 0.04, wallFill: 0.25 },
    crate:   { color: '#5d554c', roughness: 0.90, mottle: 0.10 },
    hall:    { color: '#3a4149', roughness: 0.95, mottle: 0.05, wallFill: 0.7 },
    rabbit:  { color: '#c6c0b6', roughness: 0.85 },
    innerEar:{ color: '#c9b5ad' },
    eye:     { color: '#141416' },
  },

  /* ---- keeping the rabbit readable ---- */
  rabbit: {
    rim: '#a9bccf',       // cool edge light around the silhouette
    rimStrength: 0.12,
    rimPower: 2.6,
    lift: 0.006,          // a whisper of self-light so it never sinks fully into black
  },

  /* ---- contact shadows (analytic ambient occlusion: cheap, no extra pass) ---- */
  ao: { floorCrease: 0.55, creaseHeight: 0.55, objects: 0.55, objectReach: 0.35, rabbit: 0.55 },

  /* ---- grading (post) ---- */
  grade: {
    saturation: 0.80,
    contrast: 1.06,
    lift: [0.024, 0.027, 0.031],   // shadows lean cold blue-grey
    gain: [0.99, 1.0, 1.02],
    vignette: 0.66,
    bottomWeight: 0.35,   // the nearest strip of floor falls darker, for weight
    grain: 0.030,
    bloom: 0.30,
    bloomThreshold: 5.0,  // only the glowing opening and the lamp should bloom, never the rabbit
  },
};

/* Quality tiers: Q cycles them. Each line is what that tier pays for. */
FF.TIERS = {
  high:   { name: 'high',   dpr: 1.5, msaa: 4, shadowMap: 2048, shadowTaps: 16, bloom: 2, grain: true,  motes: true,  bounce: true,  amberLight: true,  beamSamples: 10 },
  medium: { name: 'medium', dpr: 1.25, msaa: 2, shadowMap: 1024, shadowTaps: 8,  bloom: 1, grain: true,  motes: false, bounce: true,  amberLight: false, beamSamples: 6 },
  low:    { name: 'low',    dpr: 1,   msaa: 0, shadowMap: 512,  shadowTaps: 4,  bloom: 0, grain: false, motes: false, bounce: false, amberLight: false, beamSamples: 3 },
};
FF.TIER_ORDER = ['high', 'medium', 'low'];
/* pixel ratio is capped (a Retina laptop at 2x would draw 4x the pixels for little visible gain: measured 57 fps at 2880x1800
   on an M2 against 136 fps at 1.5x). If frames run slow (> 21 ms average over 2 s) the game steps down a tier by itself,
   unless the player pressed Q or the URL chose ?q=. */

/* The playable space. Collision is data, independent of the meshes: axis-aligned boxes in the lane's x/y plane. */
FF.LEVEL = {
  spawn: { x: -1.75, y: 0, face: 1 },
  solids: [
    { name: 'floor',    x0: -30,  x1: 30,   y0: -1, y1: 0 },
    { name: 'pillar',   x0: -7.6, x1: -5.6, y0: 0,  y1: 12 },    // left end: a massive square column
    { name: 'bulkhead', x0: 9.2,  x1: 11.0, y0: 0,  y1: 12 },    // right end: the tall wall that closes the walkway
  ],
  crate: { x: 0.15, w: 0.52, h: 0.44, d: 0.50 },
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
