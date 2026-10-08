/* FAR FIELD — ff-world-s2.js: FF.WorldS2, the world of Sequence 2 (THE WORKS; docs/farfield/SEQUENCE-2.md §1, §3-§9, §13-§14),
   built and lit in Sequence 1's approved look (matte untextured surfaces, haze and depth fog, the blue-grey wall fill, the low
   side-on lens). It is part of FF.World: ff-world.js calls it (declare before the rig, build after Sequence 1's places, then
   reset / frame / setTier) and hands it the builder's toolkit (place(), mat(), the rig's tables). main never calls it.
   WHAT IT BUILDS (from FF.S2 and the merged lane, ff-lane.js; collision stays data, never meshes):
     - the way on: the slipped channel lid across the channel, the far bank, the Works' colossal sloped wall cut at the section
       plane (z 0.6: the drain's language) with the intake letterbox at its foot and a faint cold glow at its far end;
     - the press hall: the apron, the bed with its two drainage slots cut through its front face as dark notches, the gutter,
       the first press P1 (a 7 m chamfered platen with its footprint lamp, screws, frame, crosshead, counterweight in its shaft,
       the cable to the gate), the steel drainage gate in slot B's right wall, the broken roof with high cold lamps lighting
       the rain that falls through it, the dividing wall; the culvert in section under its footing;
     - the service passage: low ceiling, pipes and cable trays, the paint pallet, the trolley, bucket, roller, the tripod work
       lamp, the scrubbed wall (END ANIMAL USE: "END" under a fresh wet grey patch, "ANIMAL" half scraped to a pale smear where
       he works, "USE" untouched; the one resistance detail: no light, sound, camera or UI of its own), the door into the hall;
     - the long hall: one bed, the three walking presses Q1, Q2 and the great press Q3 with slot C, their frames, the roof open
       over the two gaps (rain falls there, unlit), the buckled end door;
     - outside: wet grass, the colossal pipe on concrete saddles, clover beneath it, the embankment down into fog, the Works'
       far side looming left, and far across the fog the long low building whose warm windows show tiny figures crossing all
       at once, in step, every 6 s.
   THE PRESSES' VISUAL LANGUAGE (§3.1): every platen carries a lamp under it; the lit bed is its footprint (the danger), shaped
   by a shading mask (hook 'works-foot') to the platen's rectangle, soft when it hangs high and crisp as it comes down; the
   slots and the gaps get no light (dark = safe). The lamp brightens as it descends and goes out as the iron meets the bed.
   On each clank a sheet of collected rainwater pours off the platen's top front edge; on each contact water bursts out from
   under it. Rain drums on a platen's top (the rain stops there) and drips from its edges while it hangs still.
   PROPS THE MACHINE MOVES (FF.Works.frame moves them by their offset from rest; the World never moves them): P1, Q1, Q2, Q3,
   sluice, counterweight, and the painter's workLampHead (FF.Painter). Lamps and water read FF.Works.press(id) / sluice().
   LIGHT SETS (the fixed rig, re-owned only where the player cannot judge light: each switch waits until the lights it
   changes are out of the frame, with a forced switch as a fallback):
     set   K0 (shadow)  K1 (shadow)  P0          P1          B0             B1
     WH    pressLamp    highBay      sluiceGlow  intakeGlow  crossAmber     culvertLamp    the way on (from x 125), the intake, the press
                                                                                            hall and the culvert (D0: the sky, by the look)
     WP    workLamp     lampQ1       doorLine    lampQ2      amberBulkhead  culvertLamp    the passage (and the long hall's door)
     WL    lampQ3       lampQ1       doorLine    lampQ2      amberBulkhead  exitGap        the long hall and outside (D0: the moon)
   The press lamps are unshadowed (their pools are masked to the footprint); only the high bay and the work lamp cast shadows.
   REVIEW FIXES (8 Oct): the clank's water restyled (a spill of drops off the lower edge at once, a few soft streams off the top,
   stopping at the bed) and the lamp flickers at the clank and tightens through the warning (the muted twins of the clank);
   the gate's light hangs in the mist before slot B and lies on the gutter while it is open; the gate plate is drawn in section
   behind the lane; the far windows draw over their building (polygon offset), larger and brighter, with the far sheds under
   their sightline; no flat puddle discs; the long hall's gaps darker; the high bay's pool behind the lane on the apron; the
   tripod lamp within the worker's reach; slot C's mask follows its wider floor.
   OWNER: the world builder (Sequence 2). docs/farfield/INTERFACES.md, "Sequence 2 build: world + camera". */
'use strict';
window.FF = window.FF || {};
(function () {
let A = null, T = null, rnd = null, ctx = null;
const D2R = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const gy = x => FF.Level.groundY(x);
const S2 = () => FF.S2;
const PRESSES = ['P1', 'Q1', 'Q2', 'Q3'];
const LAMP_OF = { P1: 'pressLamp', Q1: 'lampQ1', Q2: 'lampQ2', Q3: 'lampQ3' };
const SLOT_I = { K0: 0, K1: 1, P0: 2, P1: 3 };
/* the Works' outer skin: Sequence 1's colossal sloped wall, kept as the silhouette (rises 1.58 m per metre from the intake) */
const SLOPE = 69.6 / 44, yo = x => 0.5 + (x - 131.0) * SLOPE, yi = x => yo(x) - 2.5;
/* where the rain may fall: outdoors, and inside only through the broken roof (x0, x1, z0, z1) */
const RAIN_COLS = [[-1e4, 131.0, -99, 99], [193.8, 1e4, -99, 99], [136.5, 139.5, -5.2, 0.62], [142.0, 146.4, -3.0, 0.5], [173.25, 174.75, -6.2, 0.62], [178.65, 180.95, -6.2, 0.62]];
const PITS = [[141.0, 143.2], [144.0, 146.2], [184.2, 187.0]];   // review fixes 8 Oct: slot C 0.6 m wider on the exit side

/* ---------------------------------------------------------------------------------------------- looks, lights, materials */
const MATS = {
  bedC:     { color: '#51565c', roughness: 0.72, mottle: 0.12, wallFill: 0.9 },  // the bed's concrete (the apron, the gaps, the front face)
  bedSteel: { color: '#4c5157', roughness: 0.4, mottle: 0.12, wallFill: 0.2 },   // the wet steel bed plates under the presses
  gapC:     { color: '#3c4146', roughness: 0.62, mottle: 0.14, wallFill: 0.5 },  // the long hall's gaps: darker, rain-wet (review fixes 8 Oct: dark = safe, and the rabbit reads there)
  iron:     { color: '#2d3136', roughness: 0.58, mottle: 0.08, wallFill: 0.42 },  // the platens
  ironDk:   { color: '#202428', roughness: 0.72, mottle: 0.05, wallFill: 0.3 },   // frames, screws, guides
  hallWall: { color: '#3b4148', roughness: 0.92, mottle: 0.09, wallFill: 1.0 },
  hallDk:   { color: '#2a2f35', roughness: 0.95, mottle: 0.06, wallFill: 0.7 },
  pWall:    { color: '#464b51', roughness: 0.9, mottle: 0.10, wallFill: 1.0 },    // the passage's painted concrete
  pDado:    { color: '#383d42', roughness: 0.85, mottle: 0.08, wallFill: 0.9 },
  pFloor:   { color: '#55595e', roughness: 0.72, mottle: 0.10 },
  trough:   { color: '#1d2124', roughness: 0.3, mottle: 0.08 },
  lid:      { color: '#5b6064', roughness: 0.86, mottle: 0.16, wallFill: 0.3 },  // the slipped channel lid
  tin:      { color: '#5a5d5f', roughness: 0.55, mottle: 0.06 },
  cloth:    { color: '#6b6e6e', roughness: 0.95, mottle: 0.12 },
  saddle:   { color: '#4a4f53', roughness: 0.88, mottle: 0.14, wallFill: 0.5 },
  bigPipe:  { color: '#3d4247', roughness: 0.6, mottle: 0.12, wallFill: 0.5, lift: 0.04 },
  outGround:{ color: '#373c38', roughness: 0.85, mottle: 0.16 },
};
const LIGHTS = {
  spot: {
    /* each press's footprint lamp (unshadowed; masked to the platen's rectangle by the 'works-foot' hook) */
    pressLamp: { slot: 'K0', color: '#dfe6ec', intensity: 7.4, angle: 60 * D2R, penumbra: 0.2, distance: 0, decay: 1, beam: 0 },
    lampQ1:    { slot: 'K1', color: '#dfe6ec', intensity: 7.4, angle: 60 * D2R, penumbra: 0.2, distance: 0, decay: 1, beam: 0 },
    lampQ2:    { slot: 'P1', color: '#dfe6ec', intensity: 7.4, angle: 60 * D2R, penumbra: 0.2, distance: 0, decay: 1, beam: 0 },
    lampQ3:    { slot: 'K0', color: '#dfe6ec', intensity: 8.0, angle: 64 * D2R, penumbra: 0.2, distance: 0, decay: 1, beam: 0 },
    /* a cold high lamp under the broken roof over the apron: the rain shafts (shadowed: the platen and its frame cut the shaft) */
    highBay:   { slot: 'K1', color: '#cfd8e0', intensity: 2.8, angle: 16 * D2R, penumbra: 0.6, distance: 16, decay: 1, beam: 0.0075,
                 pos: [137.7, 8.0, -4.6], target: [138.2, 0.0, -3.1], shadow: { size: 'secondShadow', near: 2.0, far: 16, bias: -0.0005, radius: 2.5 } },
    /* the gate's light: from the culvert into slot B, by the gate's gap (a hairline when shut). Integration, 8 Oct: brighter,
       wider and aimed a little out of the notch (was 5.0, 70 deg, 2.6 m, aimed along the pit floor), so the light that floods
       slot B each time P1 comes down reads from pit A and the apron: it is the puzzle's one clue (SEQUENCE-2.md §5.2) */
    sluiceGlow:{ slot: 'P0', color: '#d6dee6', intensity: 15.0, angle: 80 * D2R, penumbra: 0.9, distance: 3.4, decay: 2, beam: 0, pos: [146.15, -0.16, -0.15], target: [144.6, -0.40, 0.6] },
    /* the intake's far end: the hall's light seen down the tunnel */
    intakeGlow:{ slot: 'P1', color: '#c9d3dc', intensity: 2.4, angle: 38 * D2R, penumbra: 0.9, distance: 4.6, decay: 2, beam: 0, pos: [136.6, 0.36, -0.1], target: [133.4, 0.0, 0.0] },
    /* the painter's tripod lamp (FF.Painter drives it; until it does, the World lights it on its stand aimed at the wall) */
    workLamp:  { slot: 'K0', color: '#e6ecf1', intensity: 5.6, angle: 50 * D2R, penumbra: 0.5, distance: 14, decay: 1.6, beam: 0.0012,
                 pos: [159.62, 1.5, -1.25], target: [161.3, 1.2, -2.0], shadow: { size: 'torchShadow', near: 0.1, bias: -0.0004, radius: 3 } },   // review fixes 8 Oct: = FF.S2.painter.lamp (in his reach); nearer the wall, so dimmer and wider (was 9, 40 deg)
    /* the long hall's light under the door into the passage */
    doorLine:  { slot: 'P0', color: '#d6dee6', intensity: 2.6, angle: 58 * D2R, penumbra: 0.85, distance: 3.4, decay: 2, beam: 0, pos: [167.15, 0.1, -0.05], target: [164.3, 0.0, 0.15] },
  },
  point: {
    crossAmber:    { slot: 'B0', color: '#ffae4a', intensity: 0.8, distance: 3.0, pos: [140.25, 4.65, -3.15], amberTier: true },
    amberBulkhead: { slot: 'B0', color: '#ffae4a', intensity: 1.0, distance: 6.0, pos: [166.8, 1.9, -1.3], lamp: [166.2, 2.42, -1.82] },
    culvertLamp:   { slot: 'B1', color: '#c3cdd6', intensity: 0.55, distance: 3.2, pos: [152.7, 1.0, -1.3] },
    exitGap:       { slot: 'B1', color: '#b8c4d0', intensity: 0.9, distance: 2.4, pos: [193.62, 0.07, 0.15] },
  },
  sets: {
    WH: { K0: 'pressLamp', K1: 'highBay', P0: 'sluiceGlow', P1: 'intakeGlow', B0: 'crossAmber', B1: 'culvertLamp' },
    WP: { K0: 'workLamp', K1: 'lampQ1', P0: 'doorLine', P1: 'lampQ2', B0: 'amberBulkhead', B1: 'culvertLamp' },
    WL: { K0: 'lampQ3', K1: 'lampQ1', P0: 'doorLine', P1: 'lampQ2', B0: 'amberBulkhead', B1: 'exitGap' },
  },
};
/* the order of the sets along the lane, and where each switch may happen. A switch waits until the lights it changes are out of
   the frame (the visible x range at depth z, from the lens), or is forced past a point. */
const ORDER = ['SR', 'WH', 'WP', 'WL'];
const SWITCH = [
  { a: 'SR', b: 'WH', at: 125.0, ok: v => v(-3)[1] < 135.9, forceA: 123.5, forceB: 128.5 },      // Sequence 1's rest -> the Works (the hall still out of frame)
  { a: 'WH', b: 'WP', at: 150.0, ok: v => v(-3)[0] > 147.0 && v(-2)[1] < 158.3, forceA: 148.5, forceB: 156.0 },
  { a: 'WP', b: 'WL', at: 167.0, ok: v => v(-2)[0] > 163.1 && v(-3.4)[1] < 181.0, forceA: 164.0, forceB: 172.0 },
];
function setByX(x) { let s = 'SR'; for (const w of SWITCH) if (x >= w.at) s = w.b; return s; }

/* the footprint mask (each press lamp is clipped to its platen's rectangle; the slots and their sill stay dark) */
/* Integration, 8 Oct: this mask is compiled only into the Works' own materials and the rabbit's (the hook's `only: 'works'`;
   ff-world.js makes every material the Works build asks for a 'works' variant). Compiled into every material it cost each
   frame about 2.5-3.5 ms at Retina high tier everywhere, Sequence 1 included (GPU-synced A/B against the committed Sequence
   1: the GPU flattens the uniform branch, so the gate below does not save it). The pits are only looked at below the bed. */
const FOOT_GLSL = `
uniform float uWOn; uniform vec4 uWFootX[4]; uniform vec4 uWFootZ[4]; uniform vec4 uWPit[3];
float ffWFoot( vec3 p, vec4 a, vec4 b ) {
  if ( a.w < 0.5 ) return 1.0;
  /* review fixes 8 Oct (frame cost): outside the footprint's soft edges the mask is exactly 0; skip the rest there */
  if ( p.x <= a.x - a.z || p.x >= a.y + a.z || p.z <= b.x - b.z || p.z >= b.y + b.z ) return 0.0;
  float m = smoothstep( a.x - a.z, a.x + a.z, p.x ) * ( 1.0 - smoothstep( a.y - a.z, a.y + a.z, p.x ) );
  m *= smoothstep( b.x - b.z, b.x + b.z, p.z ) * ( 1.0 - smoothstep( b.y - b.z, b.y + b.z, p.z ) );
  if ( p.y > 0.02 || m <= 0.0 ) return m;
  for ( int k = 0; k < 3; k ++ ) {
    vec4 q = uWPit[ k ];
    if ( q.w < 0.5 ) continue;
    float inX = smoothstep( q.x - 0.04, q.x + 0.04, p.x ) * ( 1.0 - smoothstep( q.y - 0.04, q.y + 0.04, p.x ) );
    m *= 1.0 - inX * ( 1.0 - smoothstep( q.z - 0.06, q.z + 0.02, p.y ) );
  }
  return m;
}`;

/* ---------------------------------------------------------------------------------------------- geometry helpers */
const B = (x0, x1, y0, y1, z0, z1) => FF.geo.box(x0, x1, y0, y1, z0, z1);
function tri(P, a, b, c) { P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); }
function quad(P, a, b, c, d) { tri(P, a, b, c); tri(P, a, c, d); }
function geoFrom(P) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.computeVertexNormals(); return g; }
/* the ground profile's points between xa and xb (ends included) */
function prof(xa, xb) {
  const pts = [[xa, gy(xa + 1e-4)]];
  for (const [x, y] of FF.S1.ground) if (x > xa + 1e-4 && x < xb - 1e-4) pts.push([x, y]);
  pts.push([xb, gy(xb - 1e-4)]); return pts;
}
/* a vertical face at z following the ground profile, from yb up to the ground (+dy); facing +z (or -z with back) */
function profFace(xa, xb, z, yb, dy, back) {
  const P = [], pts = prof(xa, xb); dy = dy || 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; if (x1 - x0 < 1e-5) continue;
    const a = [x0, yb, z], b = [x1, yb, z], c = [x1, y1 + dy, z], d = [x0, y0 + dy, z];
    if (back) quad(P, b, a, d, c); else quad(P, a, b, c, d);
  }
  return geoFrom(P);
}
/* a box whose lower edges are chamfered by c all round (the platens: the chamfer shove's edge) */
function chamferBox(x0, x1, y0, y1, z0, z1, c) {
  const P = [], yc = y0 + c, X0 = x0 + c, X1 = x1 - c, Z0 = z0 + c, Z1 = z1 - c;
  quad(P, [X0, y0, Z0], [X1, y0, Z0], [X1, y0, Z1], [X0, y0, Z1]);                    // underside
  quad(P, [X0, y0, Z1], [X1, y0, Z1], [x1, yc, z1], [x0, yc, z1]);                    // front chamfer
  quad(P, [X1, y0, Z0], [X0, y0, Z0], [x0, yc, z0], [x1, yc, z0]);                    // back chamfer
  quad(P, [X0, y0, Z0], [X0, y0, Z1], [x0, yc, z1], [x0, yc, z0]);                    // left chamfer
  quad(P, [X1, y0, Z1], [X1, y0, Z0], [x1, yc, z0], [x1, yc, z1]);                    // right chamfer
  const g = geoFrom(P), body = B(x0, x1, yc, y1, z0, z1);
  return FF.geo.merge([g, body]);
}
function cylX(r, x0, x1, y, z, seg) { const g = new T.CylinderGeometry(r, r, x1 - x0, seg || 24, 1); g.rotateZ(Math.PI / 2); g.translate((x0 + x1) / 2, y, z); return g; }
function cylY(r, y0, y1, x, z, seg, rTop) { return FF.geo.cyl(r, y1 - y0, x, y0, z, seg || 12, rTop); }
function cylZ(r, z0, z1, x, y, seg) { const g = new T.CylinderGeometry(r, r, z1 - z0, seg || 12, 1); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g; }
const poly = pts => A.quadGeo(pts);
function glow(hex, k, geo, fog) { const c = FF.lin(hex).multiplyScalar(k); const m = new T.Mesh(geo, FF.glow([c.r, c.g, c.b], fog)); m.castShadow = false; m.receiveShadow = false; return m; }

/* ---------------------------------------------------------------------------------------------- state */
const ST = { built: false, places: {}, press: {}, fx: [], drips: [], dripStatic: null, sluiceGlowMesh: null, glowStrips: {}, farWin: null,
  sheetAt: {}, burstAt: {}, offs: [], lastSet: '', switches: 0, forced: 0, decal: null, intakeHalo: null };

/* ---------------------------------------------------------------------------------------------- THE WAY ON (124 .. 137) */
function buildApproach() {
  const P = A.place('works-approach', 124.0, 137.4); P.looks = ['works-approach', 'rest', 'tunnel'];
  /* the channel's near wall (S1 left it open behind the lane) and the slipped lid across it: flush with the banks (the way on
     is flat), cracked in two, weeds in the crack, slewed a few degrees by whatever moved it */
  P.add('sWall', B(127.0, 127.2, -1.6, -0.02, -6.0, 0.45));
  for (const [x0, x1, rz, yaw, dz] of [[127.0, 128.32, 0.0, 2.2, 0.0], [128.36, 129.6, -0.6, 3.4, 0.03]]) {
    const g = B(x0 - (x0 + x1) / 2, x1 - (x0 + x1) / 2, -0.22, 0.0, -0.74, 0.70); g.rotateZ(rz * D2R); g.rotateY(yaw * D2R); g.translate((x0 + x1) / 2, 0.0, dz);
    P.add('lid', g, true);
  }
  for (let i = 0; i < 6; i++) P.add('lid', A.tilt(0.05 + rnd() * 0.06, 0.03, 0.06 + rnd() * 0.1, (rnd() - 0.5) * 30, 128.34 + (rnd() - 0.5) * 0.06, -0.01, -0.6 + rnd() * 1.2, (rnd() - 0.5) * 40), true);   // crumbs in the crack
  P.add('section', B(128.31, 128.37, -0.2, 0.002, -0.74, 0.7));                                                       // the crack's dark line
  /* the far bank at the foot of the wall: wet concrete, y 0 (S1's was a 0.4 m step); its face to the channel */
  P.add('sFloor', B(129.0, 131.0, -3.0, 0.0, -8.0, 8.0));
  P.add('wetDark', B(129.0, 131.0, 0.0, 0.004, -0.8, 1.6));
  for (let i = 0; i < 8; i++) P.add('rubble', A.tilt(0.1 + rnd() * 0.25, 0.05 + rnd() * 0.08, 0.1 + rnd() * 0.25, (rnd() - 0.5) * 30, 129.3 + rnd() * 1.6, 0.03, rnd() < 0.5 ? -0.7 - rnd() * 1.8 : 0.6 + rnd() * 1.6, (rnd() - 0.5) * 40), true);
  /* the colossal sloped wall, cut at the section plane: its moonlit skin recedes behind (Sequence 1's silhouette), the cut face
     is a dark band along the slope; the intake is a 0.50 m letterbox through its base, a fallen beam choking its far end */
  { const x0 = 131.0, x1 = 176.0, z0 = -40, z1 = 0.64, Pp = [];
    quad(Pp, [x0, yo(x0), z1], [x1, yo(x1), z1], [x1, yo(x1), z0], [x0, yo(x0), z0]);
    P.add('works', geoFrom(Pp), true); }
  P.add('section', poly([[131.0, 0.5, 0.64], [136.0, 0.5, 0.64], [136.0, yo(136.0), 0.64]]), true);
  P.add('section', poly([[136.0, yi(136.0), 0.64], [176.0, yi(176.0), 0.64], [176.0, yo(176.0), 0.64], [136.0, yo(136.0), 0.64]]), true);
  P.add('hallDk', B(131.0, 136.0, 0.5, 0.56, -0.62, 0.62), true);             // the tunnel's crown (its underside)
  P.add('hallDk', B(131.0, 136.0, 0.0, 0.5, -0.9, -0.6), true);              // its back wall
  P.add('silt', B(131.0, 136.0, -0.04, 0.0, -0.6, 0.6));                      // a dry, dusty floor
  P.add('section', B(131.0, 136.0, -3.0, 0.0, 0.6, 0.64));
  { const sc = new T.Mesh(B(130.95, 136.1, 0.5, 1.1, 0.6, 1.8), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); sc.castShadow = true; sc.receiveShadow = false; sc.name = 'shadowOnly:intake'; P.obj(sc); }   // the cut-away wall still keeps the moon out of the intake
  P.add('works', B(130.4, 131.05, 0.5, 0.62, -0.7, 0.66));                    // the intake's lintel, a heavier lip
  /* the fallen beam (134.0-136.0, 0.21 under): a rusted I-section lying askew across the tunnel's end */
  { const parts = [B(134.0, 136.0, 0.21, 0.24, -0.55, 0.5), B(134.0, 136.0, 0.24, 0.46, -0.05, 0.03), B(134.0, 136.0, 0.46, 0.49, -0.5, 0.45)];
    const g = FF.geo.merge(parts); g.translate(-135.0, 0, 0); g.rotateY(-4 * D2R); g.translate(135.0, 0, 0); P.add('ironDk', g, true); }
  for (let i = 0; i < 6; i++) P.add('rubble', A.tilt(0.06 + rnd() * 0.12, 0.04 + rnd() * 0.05, 0.08 + rnd() * 0.12, (rnd() - 0.5) * 40, 134.1 + rnd() * 1.8, 0.02, -0.5 + rnd() * 0.4, (rnd() - 0.5) * 40), true);
  /* a faint cold glow at the intake's far end (the hall's light, seen down the tunnel) */
  { const h = A.halo('#c9d3dc', 0.35, 1.1); h.position.set(136.0, 0.24, -0.25); P.obj(h); ST.intakeHalo = h;
    const g = new T.PlaneGeometry(2.6, 0.5, 8, 1), c = new Float32Array(g.attributes.position.count * 3), gc = FF.lin('#c9d3dc');
    for (let i = 0; i < g.attributes.position.count; i++) { const u = (g.attributes.position.getX(i) + 1.3) / 2.6, k = 0.16 * u * u * u; c[i * 3] = gc.r * k; c[i * 3 + 1] = gc.g * k; c[i * 3 + 2] = gc.b * k; }
    g.setAttribute('color', new T.BufferAttribute(c, 3)); g.translate(134.7, 0.25, -0.595); const m = FF.glow([1, 1, 1]); m.vertexColors = true; P.obj(new T.Mesh(g, m)); }
  /* the plinth of the wall along the far bank, behind the lane; weeds */
  P.add('works', B(129.0, 131.0, 0.0, 0.5, -3.4, -2.6), true);
  A.grass(P, 260, 129.1, 131.0, -2.5, 1.8, 0.05, 0.34, '#4f5a53', { share: 0.04, skip: (x, z) => Math.abs(z) < 0.25 && rnd() < 0.8 });
  A.grass(P, 70, 127.05, 129.6, -0.08, 0.08, 0.04, 0.16, '#55605a', { r: 0.008, share: 0.01, y: () => 0.0 });   // weeds in the crack
  P.done();
}

/* ---------------------------------------------------------------------------------------------- THE PRESS HALL + CULVERT (136 .. 153) */
function buildHall() {
  const P = A.place('hall', 135.6, 153.4); P.looks = ['hall', 'culvert', 'tunnel'];
  const WZ = -6.0;
  /* the bed: the apron (concrete) and the bed under P1 (steel plates), its two slots cut across the whole bed; the bed's front
     face at z 0.40 with the slots as dark notches through it; the gutter in front (y -0.9); then the cut */
  P.add('bedC', A.profileGeo(136.0, 140.0, WZ, 0.4, 0, 0, false));
  P.add('bedSteel', A.profileGeo(140.0, 145.6, WZ, 0.4, 0, 0, false));
  P.add('bedC', profFace(136.0, 146.2, 0.4, -0.9, 0));
  P.add('trough', B(136.0, 146.2, -0.94, -0.9, 0.4, 0.62));
  P.add('section', B(131.0, 146.2, -3.2, -0.94, 0.6, 0.64));
  for (let x = 140.0; x < 145.6; x += 1.4) P.add('ironDk', B(x - 0.012, x + 0.012, 0.0, 0.004, WZ, 0.4));     // the plates' seams
  /* the bed-end over the sill (145.6-147.0): walked on at y 0, its underside roofs the gate's sill; solid beside the gate */
  P.add('bedSteel', B(145.6, 147.0, -0.10, 0.0, WZ, 0.4), true);
  P.add('bedC', B(145.6, 147.0, -0.4, -0.10, WZ, -0.8), true);
  /* the gate's frame: steel guide channels either side of the plate (the front one at the bed's front face) */
  /* review fixes 8 Oct: the front guide only above the opening (it was a dark bar in front of a rabbit under the gate) */
  P.add('ironDk', B(145.52, 145.78, -0.13, 0.0, 0.40, 0.47)); P.add('ironDk', B(145.52, 145.78, -0.42, 0.0, -0.86, -0.78));
  P.add('metalLight', B(145.55, 145.75, -0.13, -0.10, -0.8, 0.44));
  /* the culvert beyond the gate, in section (as the drain): the sill, the 0.6 m drop, the culvert under the wall's footing, the
     silt ramp up into the passage; a trickle down its middle */
  P.add('silt', A.profileGeo(145.7, 153.0, -0.8, 0.45, 0, 0, false));
  P.add('wet', A.profileGeo(146.3, 151.0, -0.22, 0.06, 0, 0.004, false));
  P.add('section', profFace(146.2, 153.0, 0.48, -3.2, 0)); P.add('section', B(146.0, 146.4, -3.2, -0.9, 0.4, 0.64)); P.add('section', B(152.7, 153.3, -3.2, 0.0, 0.45, 0.64));
  P.add('pipe', B(146.2, 151.4, -1.0, -0.1, -0.86, -0.8), true);                 // the culvert's back wall
  P.add('ironDk', B(146.12, 146.2, -0.40, -0.335, -0.81, 0.46));                  // the steel angle along the sill's edge (a 6 cm step in the ground: the drop is one-way)
  P.add('pipe', B(147.0, 151.4, -0.14, -0.10, -0.8, 0.45));                       // its roof: the wall's footing
  P.add('pipe', B(151.4, 153.0, -1.0, 0.0, -1.3, -0.8), true);
  /* the walls: the back wall (panels, a dark plinth, the pipes), the left wall over the tunnel's end, the dividing wall and its
     cut face; the ceiling is the sloped skin's underside, broken open over the apron */
  { const x0 = 136.0, x1 = 147.0;
    P.add('hallWall', poly([[x0, 0, WZ], [x1, 0, WZ], [x1, yi(x1), WZ], [x0, yi(x0), WZ]]));
    for (let x = x0 + 2.4; x < x1; x += 2.4) P.add('hallDk', poly([[x - 0.03, 0, WZ + 0.01], [x + 0.03, 0, WZ + 0.01], [x + 0.03, yi(x), WZ + 0.01], [x - 0.03, yi(x), WZ + 0.01]]));
    P.add('hallDk', B(x0, x1, 0.0, 0.5, WZ, WZ + 0.12));
    P.add('hallWall', B(135.9, 136.0, 0.5, yi(136.0), WZ, 0.6), true); P.add('hallWall', B(135.9, 136.0, 0.0, 0.5, WZ, -0.6), true);
    /* the ceiling (the skin's underside), broken over the apron */
    const ceil = (a, b, za, zb) => { const Pp = []; quad(Pp, [a, yi(a), zb], [a, yi(a), za], [b, yi(b), za], [b, yi(b), zb]); return geoFrom(Pp); };
    P.add('hallDk', ceil(136.0, 136.5, WZ, 0.6)); P.add('hallDk', ceil(139.5, 142.0, WZ, 0.6)); P.add('hallDk', ceil(146.4, 147.0, WZ, 0.6)); P.add('hallDk', ceil(136.5, 139.5, WZ, -5.2)); P.add('hallDk', ceil(142.0, 146.4, WZ, -3.0));
    for (const [x, w] of [[136.5, 0.4], [139.1, 0.5]]) P.add('hallDk', A.tilt(w, 0.25, 4.5, -32 + rnd() * 10, x, yi(x) - 0.2, -2.6, (rnd() - 0.5) * 8), true);   // broken slabs hanging at the gap's edges
    /* the dividing wall: its face to the hall and its cut face, the footing over the culvert */
    P.add('hallWall', B(147.0, 147.1, -0.1, yi(147.0), WZ, 0.6));
    P.add('section', poly([[147.0, -0.1, 0.64], [151.4, -0.1, 0.64], [151.4, yo(151.4), 0.64], [147.0, yo(147.0), 0.64]]));
    /* pipes along the back wall (high, off the lane) */
    P.add('metal', cylX(0.16, 136.0, 147.0, 3.4, WZ + 0.35, 18), true); P.add('metal', cylX(0.09, 136.0, 147.0, 3.9, WZ + 0.3, 12));
    for (let x = 137.0; x < 147; x += 2.2) P.add('metal', B(x - 0.04, x + 0.04, 3.2, 4.05, WZ, WZ + 0.5));
  }
  /* P1's frame behind the lane: two columns with guides, the crosshead high in the dark, the amber lamp (people work here) */
  { const c0 = 139.7, c1 = 146.3, cz0 = -4.5, cz1 = -3.4;
    for (const cx of [c0, c1]) { P.add('ironDk', B(cx - 0.35, cx + 0.35, 0, 15, cz0, cz1), true); P.add('ironDk', B(cx - 0.42, cx + 0.42, 0, 0.35, cz0 - 0.1, cz1 + 0.1), true); P.add('metal', B(cx + (cx < 143 ? 0.35 : -0.43), cx + (cx < 143 ? 0.43 : -0.35), 0.3, 13.0, cz1 - 0.6, cz1 - 0.2)); }
    P.add('ironDk', B(c0 - 0.5, c1 + 0.5, 11.6, 13.2, cz0 - 0.1, -1.6), true);
    { const ac = FF.lin('#ffae4a').multiplyScalar(5.0); const lamp = new T.Mesh(new T.SphereGeometry(0.06, 12, 8), FF.glow([ac.r, ac.g, ac.b], false)); lamp.position.set(140.25, 4.65, -3.32); P.obj(lamp);
      const h = A.halo('#ffae4a', 0.65, 0.9); h.position.set(140.25, 4.65, -3.25); P.obj(h); P.add('metal', B(140.12, 140.38, 4.7, 4.8, -3.42, -3.3)); }
    /* the counterweight's shaft at x 137.5 (z -4.2) and the cable over the crosshead, down the wall and along the bed to the gate */
    P.add('ironDk', B(136.85, 136.95, 0, 12.6, -4.75, -3.65), true); P.add('ironDk', B(138.05, 138.15, 0, 12.6, -4.75, -3.65), true); P.add('ironDk', B(136.85, 138.15, 0, 12.6, -4.8, -4.7));
    P.add('metal', cylY(0.016, 5.0, 12.4, 137.5, -4.2, 5));
    P.add('metal', cylX(0.02, 137.5, 145.6, 0.08, WZ + 0.16, 5)); P.add('metal', cylZ(0.02, -5.84, -0.8, 145.66, 0.08, 5));
  }
  /* the high bay lamp under the roof's edge, over the rain shaft */
  { const [x, y, z] = LIGHTS.spot.highBay.pos; P.add('metal', B(x - 0.3, x + 0.3, y, y + 0.18, z - 0.25, z + 0.25)); P.add('metal', cylY(0.02, y + 0.18, yi(x), x, z, 5));
    const g = new T.PlaneGeometry(0.5, 0.4); g.rotateX(Math.PI / 2); g.translate(x, y - 0.005, z); P.obj(glow('#dbe3ea', 6.0, g)); }
  /* the culvert's far lamp (seen up the silt ramp) */
  { const [x, y, z] = LIGHTS.point.culvertLamp.pos; P.add('metal', B(x - 0.12, x + 0.12, y, y + 0.14, z - 0.08, z)); const g = new T.PlaneGeometry(0.2, 0.08); g.translate(x, y + 0.03, z + 0.003); P.obj(glow('#c3cdd6', 3.0, g)); }
  /* debris on the apron, off the lane. Review fixes 8 Oct: no flat puddle discs (they read as holes in the floor, as Sequence 1's
     did); the floor's own mottle carries the wet */
  for (let i = 0; i < 10; i++) P.add('rubble', A.tilt(0.1 + rnd() * 0.25, 0.04 + rnd() * 0.08, 0.1 + rnd() * 0.25, (rnd() - 0.5) * 30, 136.3 + rnd() * 3.4, 0.02, rnd() < 0.5 ? -1.0 - rnd() * 4 : 0.25 + rnd() * 0.12, (rnd() - 0.5) * 40), true);
  /* THE FIRST PRESS (prop 'P1'), the gate (prop 'sluice') and the counterweight (prop 'counterweight') */
  pressProp('P1', P);
  { const s = S2().works.sluice, g = A.mkProp('sluice', (s.x0 + s.x1) / 2, s.floorY, 0);
    /* the plate slides up into a slot in the bed-end: its visible height shrinks as it lifts (scaled in frame()) */
    /* review fixes 8 Oct: drawn in section, its front edge behind the lane (z -0.12), so a rabbit under it stays in view */
    const plate = new T.Mesh(FF.geo.merge([B(-0.045, 0.045, 0.0, 0.3, -0.8, -0.12), B(-0.06, 0.06, 0.0, 0.035, -0.8, -0.12)]), A.mat('metalLight'));
    plate.castShadow = true; plate.receiveShadow = true; g.add(plate); ST.sluicePlate = plate;
    /* beyond the gate the culvert's cold light is always there (a faint glow on the sill's back wall); the gap lets it into slot B */
    const q = new T.PlaneGeometry(0.62, 0.3); q.translate(146.0, -0.25, -0.79); const gl = glow('#d6dee6', 0.55, q); ST.sluiceGlowMesh = gl; P.obj(gl);
    gateLightFx(P);
    }
  { const g = A.mkProp('counterweight', 137.5, 1.4, -4.2), me = new T.Mesh(B(-0.5, 0.5, 0, 2.2, -0.42, 0.42), A.mat('ironDk')); me.castShadow = true; me.receiveShadow = true; g.add(me); }
  P.done();
}

/* a press: the chamfered platen with its ribs and screws (iron, one draw), the lamp strip under its front edge (glow), the
   prop at the platen's underside, up */
function pressProp(id, P) {
  const W = S2().works, m = id === 'P1' ? W.P1 : W.line.platens.find(q => q.id === id), sol = S2().solids.find(s => s.id === id);
  const cx = (m.x0 + m.x1) / 2, hw = (m.x1 - m.x0) / 2, th = m.thick, z0 = sol.z0, z1 = sol.z1;
  const g = A.mkProp(id, cx, m.upY, 0), parts = [chamferBox(-hw, hw, 0, th, z0, z1, 0.09)];
  /* the front face: stiffeners and a top rim; two screws up into the dark behind the lane */
  for (let x = -hw + 0.45; x < hw - 0.2; x += 0.9) parts.push(B(x - 0.05, x + 0.05, 0.14, th - 0.05, z1, z1 + 0.06));
  parts.push(B(-hw, hw, th - 0.12, th, z1, z1 + 0.08), B(-hw + 0.1, hw - 0.1, 0.16, 0.22, z1, z1 + 0.05));
  for (const sx of [-hw * 0.62, hw * 0.62]) parts.push(cylY(id === 'Q3' ? 0.28 : 0.22, th, th + 16, sx, (z0 + z1) / 2 - 0.4, 16), cylY(id === 'Q3' ? 0.45 : 0.36, th, th + 0.25, sx, (z0 + z1) / 2 - 0.4, 16));
  const me = new T.Mesh(FF.geo.merge(parts), A.mat('iron')); me.castShadow = true; me.receiveShadow = true; me.name = 'press:' + id; g.add(me);
  /* the strip lamp along the underside's front edge, and its housing */
  const hs = new T.Mesh(B(-hw + 0.25, hw - 0.25, -0.07, 0.0, z1 - 0.42, z1 - 0.18), A.mat('ironDk')); g.add(hs);
  const sg = new T.PlaneGeometry(2 * hw - 0.6, 0.16); sg.rotateX(Math.PI / 2); sg.translate(0, -0.072, z1 - 0.3);
  const strip = glow('#e6edf2', 4.0, sg); g.add(strip);
  ST.glowStrips[id] = strip;
  /* water effects (in world space at the platen's front; visible only while they play) */
  ST.press[id] = { id, m, cx, hw, th, z0, z1, upY: m.upY, x0: m.x0, x1: m.x1, prop: g };
  sheetFx(id, P); burstFx(id, P);
  return g;
}

/* ---------------------------------------------------------------------------------------------- THE PASSAGE (151.4 .. 167) */
function buildPassage() {
  const P = A.place('passage', 151.0, 167.4); P.looks = ['passage', 'culvert', 'line'];
  const WZ = -2.0, CY = 3.0;
  P.add('pFloor', B(153.0, 167.0, -0.3, 0.0, WZ, 0.6));
  P.add('section', B(153.0, 167.0, -3.2, -0.3, 0.6, 0.64)); P.add('section', B(153.0, 167.0, -0.3, 0.0, 0.6, 0.64));
  /* the back wall: painted concrete over a darker dado, worn; the ceiling slab and the building's mass above it in section */
  P.add('pWall', B(151.4, 166.6, 0, CY, WZ - 0.3, WZ), true);
  P.add('pDado', B(151.4, 166.6, 0, 0.62, WZ, WZ + 0.015));
  P.add('pWall', B(151.4, 166.6, CY, CY + 0.12, WZ, 0.6), true);
  P.add('section', B(151.4, 167.0, CY + 0.12, 40.0, WZ, 0.64));
  P.add('pWall', B(151.4, 151.5, -0.1, CY, WZ, 0.6), true);                       // the dividing wall's passage face
  /* pipes and a cable tray along the wall, high; brackets; a fuse box; conduit */
  P.add('metal', cylX(0.11, 151.4, 166.6, 2.42, WZ + 0.2, 16), true); P.add('metal', cylX(0.065, 151.4, 166.6, 2.12, WZ + 0.14, 10), true);
  for (let x = 152.6; x < 166.4; x += 1.6) P.add('metal', B(x - 0.03, x + 0.03, 2.0, 2.58, WZ, WZ + 0.34));
  P.add('metal', B(151.4, 166.6, 2.72, 2.75, WZ, WZ + 0.42)); P.add('metal', B(151.4, 166.6, 2.75, 2.82, WZ + 0.4, WZ + 0.42));
  P.add('metal', B(154.2, 154.75, 1.2, 1.78, WZ, WZ + 0.14), true); P.add('metal', cylY(0.02, 1.78, 2.7, 154.48, WZ + 0.05, 5));
  /* the paint pallet (155.6-156.8, deck 0.26-0.40, closed on its back face): tins stacked on it */
  for (let i = 0; i < 7; i++) P.add('crate', B(155.6 + i * 0.172, 155.6 + i * 0.172 + 0.15, 0.37, 0.40, -0.6, 0.5), true);
  for (const z of [-0.6, -0.08, 0.42]) P.add('crate', B(155.6, 156.8, 0.26, 0.37, z, z + 0.08), true);
  P.add('crate', B(155.6, 156.8, 0.0, 0.26, -0.6, -0.57), true);
  for (const x of [155.68, 156.2, 156.72]) for (const z of [-0.52, 0.42]) P.add('rubble', B(x - 0.08, x + 0.08, 0, 0.26, z - 0.06, z + 0.06), true);
  for (let i = 0; i < 9; i++) { const x = 155.75 + (i % 4) * 0.29 + (rnd() - 0.5) * 0.03, z = -0.45 + Math.floor(i / 4) * 0.33; P.add('tin', cylY(0.115, 0.40, 0.70, x, z, 14), true); P.add('ironDk', cylY(0.118, 0.69, 0.71, x, z, 14)); }
  for (let i = 0; i < 3; i++) { const x = 155.85 + i * 0.32, z = -0.32; P.add('tin', cylY(0.115, 0.71, 1.01, x, z, 14), true); }
  /* his trolley (158.0, z -0.6), the bucket (161.4, z -0.9), the roller tray against the wall, a drop cloth under his work */
  { const x = 158.0, z = -0.6, w = 0.42, d = 0.24, parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(B(x + sx * w - 0.015, x + sx * w + 0.015, 0.06, 0.86, z + sz * d - 0.015, z + sz * d + 0.015));
    parts.push(B(x - w, x + w, 0.30, 0.33, z - d, z + d), B(x - w, x + w, 0.80, 0.84, z - d, z + d), B(x + w, x + w + 0.25, 0.84, 0.87, z - 0.02, z + 0.02));
    P.add('metalLight', FF.geo.merge(parts), true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = new T.CylinderGeometry(0.05, 0.05, 0.03, 10); wh.rotateX(Math.PI / 2); wh.translate(x + sx * (w - 0.03), 0.05, z + sz * (d - 0.02)); P.add('ironDk', wh); }
    P.add('tin', cylY(0.09, 0.84, 1.04, x - 0.2, z + 0.05, 12), true); P.add('cloth', A.tilt(0.3, 0.02, 0.22, 4, x + 0.15, 0.86, z + 0.02, 6), true);
    P.add('cloth', A.tilt(0.05, 0.36, 0.16, 6, x + w + 0.03, 0.67, z, 0), true); }
  P.add('tin', cylY(0.15, 0.0, 0.3, 161.4, -0.9, 16, 0.17), true); { const g = new T.CircleGeometry(0.155, 16); g.rotateX(-Math.PI / 2); g.translate(161.4, 0.26, -0.9); P.add('pDado', g); }
  P.add('ironDk', A.tilt(0.42, 0.04, 0.32, 0, 162.95, 0.02, -1.75, 0), true); P.add('metal', A.tilt(0.03, 1.1, 0.03, -14, 163.05, 0.55, -1.93), true);
  { const g = new T.PlaneGeometry(4.6, 0.95, 18, 4), p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (rnd() - 0.5) * 0.03); g.computeVertexNormals(); g.rotateX(-Math.PI / 2); g.translate(160.7, 0.012, -1.5); P.add('cloth', g); }
  /* the tripod: three legs and a mast; the lamp head is prop 'workLampHead' (FF.Painter lifts it in the look) */
  { const [sx, sy, sz] = S2().painter.lamp.stand, parts = [];
    for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4, top = new T.Vector3(sx, sy - 0.12, sz), foot = new T.Vector3(sx + Math.sin(a) * 0.36, 0, sz + Math.cos(a) * 0.36);
      const len = top.distanceTo(foot), g = new T.CylinderGeometry(0.011, 0.014, len, 5); g.translate(0, len / 2, 0);
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), top.clone().sub(foot).normalize()); g.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(q)); g.translate(foot.x, foot.y, foot.z); parts.push(g); }
    parts.push(cylY(0.016, sy - 0.5, sy - 0.08, sx, sz, 6));
    P.add('ironDk', FF.geo.merge(parts), true);
    const head = A.mkProp('workLampHead', sx, sy, sz);
    const body = new T.Mesh(FF.geo.merge([B(-0.1, 0.1, -0.075, 0.075, -0.09, 0.05), B(-0.115, 0.115, -0.09, 0.09, 0.05, 0.075), B(-0.012, 0.012, -0.16, -0.075, -0.02, 0.02)]), A.mat('ironDk')); body.castShadow = true; head.add(body);
    const lens = new T.PlaneGeometry(0.19, 0.15); lens.translate(0, 0, 0.077); head.add(glow('#eef2f5', 2.6, lens));
    head.lookAt(new T.Vector3(...S2().painter.lamp.aim)); A.propBase.workLampHead.ry = head.rotation.y; head.userData.restQuat = head.quaternion.clone(); }
  /* THE SCRUBBED WALL (the one resistance detail) */
  scrubbedWall(P);
  /* the door into the long hall (166.6-167.0): the wall in section, a buckled sill, the cold line under it; the amber bulkhead */
  P.add('section', B(166.6, 167.0, 0.21, 40.0, WZ - 0.3, 0.64));
  P.add('metalLight', A.tilt(0.42, 0.03, 0.9, -6, 166.8, 0.215, -0.15), true);
  { const g = new T.PlaneGeometry(0.4, 0.2); g.translate(166.8, 0.105, -1.2); P.obj(glow('#d6dee6', 1.6, g)); }
  { const [x, y, z] = LIGHTS.point.amberBulkhead.lamp; P.add('metal', B(x - 0.11, x + 0.11, y - 0.08, y + 0.08, WZ, WZ + 0.1)); const ac = FF.lin('#ffae4a').multiplyScalar(4.0);
    const lamp = new T.Mesh(new T.SphereGeometry(0.05, 10, 8), FF.glow([ac.r, ac.g, ac.b], false)); lamp.position.set(x, y, z + 0.06); P.obj(lamp); const h = A.halo('#ffae4a', 0.55, 0.7); h.position.set(x, y, z + 0.1); P.obj(h); }
  P.done();
}
/* END ANIMAL USE on the passage's back wall, in the same hand and black spray as the Courtyard's, being taken off: "END"
   already under a fresh, still-wet grey patch (a little glossier; the letters ghost through), "ANIMAL" half scraped to a pale
   abraded smear where he stands, "USE" untouched and weathered. A decal 3 mm off the wall with the wall's own shading; its own
   seeded random; no light, sound, camera or UI of its own. */
function scrubbedWall(P) {
  const D = (FF.Level.decor && FF.Level.decor('scrubbed-wall')) || { x0: 158.6, x1: 162.8, y0: 0.85, y1: 1.55, z: -2.0 };
  const GLYPH = A.GLYPH, catmull = A.catmull;
  const W = 1536, Hc = 256, ppm = W / (D.x1 - D.x0), R = A.prng(0x5c4a9e), J = a => (R() - 0.5) * 2 * a;
  const X = m => m * ppm, Y = h => (D.y1 - h) * ppm;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w || W; c.height = h || Hc; return c; };
  const Lc = canvas(), lx = Lc.getContext('2d'), Fc = canvas(), fx = Fc.getContext('2d'), Rc = canvas(), rx = Rc.getContext('2d');
  const dot = canvas(64, 64); { const d = dot.getContext('2d'), gr = d.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(22,24,27,1)'); gr.addColorStop(0.45, 'rgba(22,24,27,0.85)'); gr.addColorStop(0.75, 'rgba(22,24,27,0.18)'); gr.addColorStop(1, 'rgba(22,24,27,0)'); d.fillStyle = gr; d.fillRect(0, 0, 64, 64); }
  const cap = 0.33 * ppm, sw = 0.05 * ppm, at = [];
  const spray = pts => {
    let ph = R() * 9;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.6));
      for (let k = 0; k < n; k++) { const t = k / n, end = Math.min(i + t, pts.length - 1 - i - t), r = sw * (0.62 + 0.16 * Math.sin(ph += 0.11) + 0.08 * R()) * (end < 0.12 ? 1.25 : 1);
        lx.globalAlpha = 0.2; lx.drawImage(dot, ax + (bx - ax) * t - r, ay + (by - ay) * t - r, 2 * r, 2 * r); }
    }
    lx.globalAlpha = 0.22; for (let i = 0; i < 40; i++) { const p = pts[(R() * pts.length) | 0], q = sw * (0.9 + R() * 1.6), th = R() * 6.283; lx.fillRect(p[0] + Math.cos(th) * q, p[1] + Math.sin(th) * q, 1.4, 1.4); }
  };
  lx.fillStyle = lx.strokeStyle = '#16181b'; lx.lineCap = 'round';
  let x = X(0.08);
  ['END', 'ANIMAL', 'USE'].forEach((word, wi) => {
    const s = wi === 2 ? 0.9 : 1;
    for (const ch of word) {
      const g = GLYPH[ch], h = cap * s * (1 + J(0.06)), base = Y(1.0) - (x / W) * 0.05 * ppm + J(0.014 * ppm), slant = 0.05 + J(0.05);
      lx.save(); lx.translate(x, base); lx.rotate(J(0.06));
      for (let k = 1; k < g.length; k++) { let st = g[k]; const smooth = st[0] === '~'; if (smooth) st = st.slice(1);
        let pts = st.map(([u, v]) => { const yy = (v - 1) * h + J(0.04 * h); return [u * h - yy * slant + J(0.04 * h), yy]; }); if (smooth) pts = catmull(pts, 6); spray(pts); }
      lx.restore(); at.push({ ch, x, w: g[0] * h, h, base, word: wi });
      x += g[0] * h + 0.2 * cap * s * (1 + J(0.3));
    }
    x += 0.4 * cap;
  });
  /* runs under the N of END and the L */
  lx.globalAlpha = 0.6; lx.lineWidth = 2.2;
  for (const [i, len] of [[1, 0.2], [8, 0.12]]) { const a = at[i], x0 = a.x + a.w * 0.5, y0 = a.base - 2; lx.beginPath(); lx.moveTo(x0, y0); lx.lineTo(x0 + J(1.5), y0 + len * ppm); lx.stroke(); }
  /* weather on all of it (USE keeps only this) */
  lx.globalCompositeOperation = 'destination-out'; lx.globalAlpha = 1;
  for (let i = 0; i < 50; i++) { const cx = R() * W, cy = R() * Hc, r = 10 + R() * 30, gr = lx.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(0,0,0,' + (0.08 + R() * 0.25).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); lx.fillStyle = gr; lx.fillRect(cx - r, cy - r, 2 * r, 2 * r); }
  lx.globalCompositeOperation = 'source-over';
  /* ANIMAL, the part he has done: the wire scraper's strokes take the black off in streaks (a short diagonal rake, over and
     over), leaving grey smears and paler abraded concrete; the right half still black */
  const aStart = at[3], scrapeTo = at[6].x + at[6].w * 0.5;
  lx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 520; i++) { const sx = aStart.x - 0.04 * ppm + R() * (scrapeTo - aStart.x + 0.06 * ppm), sy = Y(1.4) + R() * 0.5 * ppm, len = (0.05 + R() * 0.12) * ppm, edge = sx > scrapeTo - 0.12 * ppm ? 0.35 : 1;
    lx.globalAlpha = (0.25 + R() * 0.4) * edge; lx.lineWidth = 2 + R() * 4; lx.beginPath(); lx.moveTo(sx, sy); lx.lineTo(sx + len * 0.35, sy + len); lx.stroke(); }
  lx.globalCompositeOperation = 'source-over';
  fx.drawImage(Lc, 0, 0);
  /* the abraded smear: paler concrete and grey streaks where the paint came off */
  fx.save();
  for (let i = 0; i < 340; i++) { const sx = aStart.x - 0.06 * ppm + R() * (scrapeTo - aStart.x + 0.1 * ppm), sy = Y(1.45) + R() * 0.56 * ppm, len = (0.04 + R() * 0.14) * ppm;
    fx.globalAlpha = 0.05 + R() * 0.09; fx.strokeStyle = R() < 0.7 ? '#7d8287' : '#2c2f33'; fx.lineWidth = 2 + R() * 6; fx.beginPath(); fx.moveTo(sx, sy); fx.lineTo(sx + len * 0.35, sy + len); fx.stroke(); }
  fx.restore();
  /* END: one fresh coat of grey masonry paint, still wet, a shade off the wall; the letters ghost through; runs below */
  const e0 = at[0].x - 0.07 * ppm, e1 = at[2].x + at[2].w + 0.08 * ppm, et = Y(1.5), eb = Y(0.9);
  { fx.save(); const col = [92, 96, 98], passes = 4;
    for (let q = 0; q < passes; q++) { fx.globalAlpha = 0.27; fx.fillStyle = 'rgb(' + col.join(',') + ')'; fx.beginPath(); const ins = q * 4;
      for (let xx = e0 + ins; xx <= e1 - ins; xx += 6) fx.lineTo(xx, et + ins + J(3)); for (let yy = et + ins; yy <= eb - ins; yy += 6) fx.lineTo(e1 - ins + J(2), yy);
      for (let xx = e1 - ins; xx >= e0 + ins; xx -= 6) fx.lineTo(xx, eb - ins + J(3)); for (let yy = eb - ins; yy >= et + ins; yy -= 6) fx.lineTo(e0 + ins + J(2), yy); fx.closePath(); fx.fill(); }
    for (let k = 0; k < 40; k++) { const xx = e0 + R() * (e1 - e0); fx.globalAlpha = 0.05 + 0.05 * R(); fx.fillStyle = R() < 0.5 ? '#686c6e' : '#4a4e50'; fx.fillRect(xx, et + 3, 1 + R() * 1.5, eb - et - 6); }
    fx.fillStyle = fx.strokeStyle = '#5c6062'; fx.globalAlpha = 0.85;
    for (let k = 0; k < 6; k++) { const rx0 = e0 + (0.1 + 0.8 * R()) * (e1 - e0), len = (0.04 + R() * 0.16) * ppm; fx.lineWidth = 2.4 + R(); fx.beginPath(); fx.moveTo(rx0, eb - 3); fx.lineTo(rx0 + J(1), eb + len); fx.stroke(); }
    fx.restore(); }
  /* to textures: colour (transparent texels carry the wall's colour) and roughness (the wet patch glossier) */
  rx.fillStyle = 'rgb(0,242,0)'; rx.fillRect(0, 0, W, Hc); rx.fillStyle = 'rgb(0,105,0)'; rx.fillRect(e0, et, e1 - e0, eb - et);
  const src = fx.getImageData(0, 0, W, Hc).data, rgh = rx.getImageData(0, 0, W, Hc).data, out = new Uint8Array(W * Hc * 4), rout = new Uint8Array(W * Hc * 4), wc = [0x46, 0x4b, 0x51];
  for (let y = 0; y < Hc; y++) for (let k = 0; k < W; k++) {
    const s = (y * W + k) * 4, o = ((Hc - 1 - y) * W + k) * 4, a = src[s + 3], f = Math.min(1, a / 24);
    for (let j = 0; j < 3; j++) out[o + j] = Math.round(wc[j] + (src[s + j] - wc[j]) * f);
    out[o + 3] = a; rout[o] = 0; rout[o + 1] = a > 8 ? rgh[s + 1] : 242; rout[o + 2] = 0; rout[o + 3] = 255;
  }
  const mk = (data, srgb) => { const t = new T.DataTexture(data, W, Hc, T.RGBAFormat); if (srgb) t.encoding = T.sRGBEncoding; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = Math.min(4, ctx.renderer.capabilities.getMaxAnisotropy()); t.needsUpdate = true; return t; };
  const tex = mk(out, true), rtex = mk(rout, false);
  const m = FF.mat({ color: '#ffffff', roughness: 1.0, mottle: 0.03, wallFill: 1.0 }, { map: tex, roughnessMap: rtex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const g = new T.PlaneGeometry(D.x1 - D.x0, D.y1 - D.y0); g.translate((D.x0 + D.x1) / 2, (D.y0 + D.y1) / 2, D.z + 0.003);
  const me = new T.Mesh(g, m); me.name = 'scrubbedWall'; me.receiveShadow = true; P.obj(me); ST.decal = me;
}

/* "1951" on the colossal pipe the rabbit crawls under (polish pass 8 Oct; Josh's priority 4): old white spray, a hand-lettered year on the
   pipe's front, partly scrubbed away (a wire brush's diagonal rakes) and partly painted over with a roller of slightly lighter
   masonry grey, so "19" is half there, the "5" is mostly gone and the last "1" shows through the paint. Subtle: faded, low
   contrast, no light, no explanation. A curved decal 4 mm off the pipe's skin (radius 0.7, axis y 1.18 z -0.1, x 199-206). */
function pipeNumerals(P) {
  const R = A.prng(0x1951c0), J = a => (R() - 0.5) * 2 * a, r = 0.7, cy = 1.18, cz = -0.1, X0 = 200.30, X1 = 201.90, TH0 = -19.5 * Math.PI / 180, TH1 = 27 * Math.PI / 180;
  const W = 1280, H = Math.round(W * (r * (TH1 - TH0)) / (X1 - X0)), ppm = W / (X1 - X0), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const dot = document.createElement('canvas'); dot.width = dot.height = 64; { const d = dot.getContext('2d'), gr = d.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(142,150,156,1)'); gr.addColorStop(0.5, 'rgba(142,150,156,0.8)'); gr.addColorStop(0.8, 'rgba(142,150,156,0.15)'); gr.addColorStop(1, 'rgba(142,150,156,0)'); d.fillStyle = gr; d.fillRect(0, 0, 64, 64); }
  const GL = { '1': [0.34, [[0.04, 0.2], [0.26, 0.02]], [[0.26, 0.02], [0.27, 1]]],
    '9': [0.52, ['~', [0.47, 0.32], [0.38, 0.06], [0.16, 0.02], [0.05, 0.22], [0.16, 0.5], [0.4, 0.5], [0.48, 0.3]], ['~', [0.48, 0.3], [0.46, 0.66], [0.34, 0.92], [0.12, 0.99]]],
    '5': [0.5, [[0.46, 0.02], [0.12, 0.05]], [[0.12, 0.05], [0.08, 0.45]], ['~', [0.08, 0.45], [0.3, 0.37], [0.5, 0.52], [0.5, 0.78], [0.3, 0.97], [0.03, 0.9]]] };
  const cap = 0.36 * ppm, sw = 0.034 * ppm; let x = 0.2 * ppm; const base = H * 0.72, at = [];
  const catm = A.catmull;
  for (const ch of '1951') {
    const gl = GL[ch], h = cap * (1 + J(0.05)), b = base + J(0.012 * ppm), sl = 0.07 + J(0.04); g.save(); g.translate(x, b); g.rotate(J(0.05));
    for (let k = 1; k < gl.length; k++) { let st = gl[k]; const sm = st[0] === '~'; if (sm) st = st.slice(1);
      let pts = st.map(([u, v]) => { const yy = (v - 1) * h + J(0.025 * h); return [u * h - yy * sl + J(0.025 * h), yy]; }); if (sm) pts = catm(pts, 6);
      for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 1.5));
        for (let q = 0; q < n; q++) { const t = q / n, rr = sw * (0.62 + 0.14 * Math.sin(i * 0.9 + q) + 0.08 * R()); g.globalAlpha = 0.22; g.drawImage(dot, ax + (bx - ax) * t - rr, ay + (by - ay) * t - rr, 2 * rr, 2 * rr); } } }
    g.restore(); at.push({ ch, x, w: gl[0] * h, b, h }); x += gl[0] * h + 0.2 * cap * (1 + J(0.3));
  }
  /* weather first: the old spray is thin and patchy everywhere */
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) { const cx = R() * W, cy2 = R() * H, rad = 8 + R() * 26, gr = g.createRadialGradient(cx, cy2, 0, cx, cy2, rad); gr.addColorStop(0, 'rgba(0,0,0,' + (0.15 + R() * 0.4).toFixed(2) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(cx - rad, cy2 - rad, rad * 2, rad * 2); }
  /* the wire brush: diagonal rakes through the first "9" and the "5" (the work of somebody who stopped before the end) */
  const sc = (a0, a1, n, edge) => { for (let i = 0; i < n; i++) { const sx = a0 + R() * (a1 - a0), sy = base - cap * 1.1 + R() * cap * 1.3, len = (0.05 + R() * 0.12) * ppm; g.globalAlpha = (0.3 + R() * 0.5) * edge; g.lineWidth = 2 + R() * 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + len * 0.35, sy + len); g.stroke(); } };
  sc(at[1].x - 0.03 * ppm, at[1].x + at[1].w * 0.85, 190, 1); sc(at[2].x - 0.04 * ppm, at[2].x + at[2].w + 0.04 * ppm, 330, 1);
  g.globalCompositeOperation = 'source-over';
  /* the paint-over: a roller's pass of grey, a shade off the pipe, from the right and below: it takes most of the "5", the foot of the "9"'s tail and half of the last "1" */
  const p0 = at[1].x + at[1].w * 0.55, p1 = at[3].x + at[3].w * 0.45, pt = base - cap * 0.78, pb = base + 0.05 * ppm;
  g.save(); g.fillStyle = 'rgb(66,72,78)'; for (let q = 0; q < 4; q++) { g.globalAlpha = 0.30; g.beginPath(); const ins = q * 3;
    for (let xx = p0 + ins; xx <= p1 - ins; xx += 5) g.lineTo(xx, pt + (xx - p0) * -0.08 + ins + J(2.5)); for (let yy = pt; yy <= pb - ins; yy += 5) g.lineTo(p1 - ins + J(2), yy);
    for (let xx = p1 - ins; xx >= p0 + ins; xx -= 5) g.lineTo(xx, pb - ins + J(3)); for (let yy = pb - ins; yy >= pt; yy -= 5) g.lineTo(p0 + ins + J(3), yy); g.closePath(); g.fill(); }
  for (let k = 0; k < 6; k++) { const rx = p0 + (0.1 + 0.8 * R()) * (p1 - p0), len = (0.04 + R() * 0.1) * ppm; g.globalAlpha = 0.5; g.strokeStyle = 'rgb(72,79,85)'; g.lineWidth = 2.4 + R(); g.beginPath(); g.moveTo(rx, pb - 3); g.lineTo(rx + J(1), pb + len); g.stroke(); }
  g.restore();
  /* the curved patch */
  const NX = 24, NY = 8, pos = [], nor = [], uv = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const u = i / NX, th = TH1 - (TH1 - TH0) * j / NY, rr = r + 0.004;
    pos.push(X0 + (X1 - X0) * u, cy + rr * Math.sin(th), cz + rr * Math.cos(th)); nor.push(0, Math.sin(th), Math.cos(th)); uv.push(u, 1 - j / NY); }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
  const tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding; tex.anisotropy = Math.min(4, ctx.renderer.capabilities.getMaxAnisotropy ? ctx.renderer.capabilities.getMaxAnisotropy() : 1);
  const m = FF.mat({ color: '#ffffff', roughness: 0.9, mottle: 0.03, wallFill: 0.5 }, { map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const me = new T.Mesh(geo, m); me.name = 'pipe1951'; me.receiveShadow = true; P.obj(me);
}

/* ---------------------------------------------------------------------------------------------- THE LONG HALL (166.6 .. 194) */
function buildLine() {
  const P = A.place('line', 166.4, 194.4); P.looks = ['line', 'passage', 'works-out'];
  const WZ = -6.5, ROOF = 16.0;
  /* the bed: floors in concrete, the steel plates under each press, slot C under the great press; front face, gutter, cut */
  const steel = [[169.4, 173.2], [174.8, 178.6], [181.0, 189.0]], conc = [[167.0, 169.4], [189.0, 193.4]], gaps = [[173.2, 174.8], [178.6, 181.0]];
  for (const [a, b] of conc) P.add('bedC', A.profileGeo(a, b, WZ, 0.4, 0, 0, false));
  for (const [a, b] of gaps) P.add('gapC', A.profileGeo(a, b, WZ, 0.4, 0, 0, false));   // review fixes 8 Oct: the gaps' floor darker (dark = safe)
  for (const [a, b] of steel) P.add('bedSteel', A.profileGeo(a, b, WZ, 0.4, 0, 0, false));
  P.add('bedC', profFace(167.0, 193.4, 0.4, -0.9, 0));
  P.add('trough', B(167.0, 193.4, -0.94, -0.9, 0.4, 0.62)); P.add('section', B(167.0, 193.8, -3.2, -0.94, 0.6, 0.64));
  for (const [a, b] of steel) for (let x = a + 1.27; x < b - 0.2; x += 1.27) P.add('ironDk', B(x - 0.012, x + 0.012, 0.0, 0.004, WZ, 0.4));
  /* review fixes 8 Oct: no flat puddle discs in the gaps (they read as holes in the floor, as Sequence 1's did) */
  /* the back wall: tall panels, pilasters behind each frame, a dark plinth, pipes high up; the roof (cut), open over the gaps */
  P.add('hallWall', B(166.6, 193.8, 0, ROOF, WZ - 0.3, WZ), true);
  for (let x = 169.0; x < 193.8; x += 2.6) P.add('hallDk', B(x - 0.04, x + 0.04, 0, ROOF, WZ, WZ + 0.012));
  for (let y = 4.4; y < ROOF; y += 3.9) P.add('hallDk', B(166.6, 193.8, y, y + 0.04, WZ, WZ + 0.012));
  P.add('hallDk', B(166.6, 193.8, 0, 0.5, WZ, WZ + 0.12));
  P.add('metal', cylX(0.2, 166.6, 193.8, 5.6, WZ + 0.4, 18), true); P.add('metal', cylX(0.1, 166.6, 193.8, 6.2, WZ + 0.3, 10));
  for (let x = 168.0; x < 193.8; x += 2.6) P.add('metal', B(x - 0.04, x + 0.04, 5.35, 6.4, WZ, WZ + 0.62));
  for (const [a, b] of [[166.6, 173.25], [174.75, 178.65], [180.95, 193.8]]) { P.add('hallDk', B(a, b, ROOF, ROOF + 0.9, WZ, 0.6)); P.add('section', B(a, b, ROOF, ROOF + 0.9, 0.6, 0.64)); }
  for (const [a, b] of [[173.25, 174.75], [178.65, 180.95]]) { P.add('hallDk', A.tilt(0.3, 0.2, 3.2, 24, a + 0.1, ROOF - 0.3, -2.4, 6), true); P.add('hallDk', A.tilt(0.25, 0.2, 2.6, -30, b - 0.1, ROOF - 0.25, -3.6, -4), true); }
  /* the end walls in section: the door from the passage (the duck-under) and the buckled end door, its corner bent up 0.20 */
  P.add('hallWall', B(166.6, 167.0, 0.21, ROOF, WZ, 0.6), true);
  P.add('hallWall', B(193.4, 193.8, 0.20, ROOF, WZ, 0.6), true); P.add('bedC', B(193.4, 193.8, -0.3, 0.0, WZ, 0.6)); P.add('section', B(193.4, 193.8, -3.2, 0.0, 0.6, 0.64)); P.add('section', B(193.4, 193.8, 0.20, ROOF + 0.9, 0.6, 0.64));
  { const lip = new T.BoxGeometry(0.02, 0.3, 1.2); lip.rotateZ(0.7); lip.translate(193.62, 0.1, -0.1); P.add('metalLight', lip, true); P.add('metalLight', B(193.45, 193.5, 0.2, 2.3, -0.9, 0.5), true); }
  /* the three frames (the great press's twice the mass); its amber lamp */
  for (const [id, a, b, w] of [['Q1', 169.4, 173.2, 0.3], ['Q2', 174.8, 178.6, 0.3], ['Q3', 181.0, 189.0, 0.55]]) {
    const cz0 = id === 'Q3' ? -5.0 : -4.4, cz1 = id === 'Q3' ? -3.6 : -3.4;
    for (const cx of [a + w + 0.15, b - w - 0.15]) { P.add('ironDk', B(cx - w, cx + w, 0, ROOF, cz0, cz1), true); P.add('ironDk', B(cx - w - 0.08, cx + w + 0.08, 0, 0.35, cz0 - 0.1, cz1 + 0.1), true);
      P.add('metal', B(cx + (cx < (a + b) / 2 ? w : -w - 0.08), cx + (cx < (a + b) / 2 ? w + 0.08 : -w), 0.3, ROOF - 3, cz1 - 0.6, cz1 - 0.2)); }
    P.add('ironDk', B(a - 0.1, b + 0.1, ROOF - 4.6, ROOF - (id === 'Q3' ? 2.0 : 2.8), cz0 - 0.1, -1.6), true);
  }
  { const ac = FF.lin('#ffae4a').multiplyScalar(5.0); const lamp = new T.Mesh(new T.SphereGeometry(0.07, 12, 8), FF.glow([ac.r, ac.g, ac.b], false)); lamp.position.set(181.9, 5.0, -3.45); P.obj(lamp);
    const h = A.halo('#ffae4a', 0.7, 1.0); h.position.set(181.9, 5.0, -3.38); P.obj(h); P.add('metal', B(181.75, 182.05, 5.05, 5.15, -3.6, -3.45)); }
  for (const id of ['Q1', 'Q2', 'Q3']) pressProp(id, P);
  P.done();
}

/* ---------------------------------------------------------------------------------------------- OUTSIDE (193.8 .. 236) */
function buildOut() {
  const P = A.place('out', 193.2, 240.0); P.looks = ['works-out', 'line'];
  /* wet ground following the profile down the embankment into the fog; its front face */
  P.add('outGround', A.profileGeo(193.8, 240.0, -14.0, 6.0, -5.0, 0, true));
  /* the Works' far side: the long hall's end in section and the colossal masses behind it, stepping back and up into the dark */
  P.add('works', B(176.0, 193.8, ROOFY(), ROOFY() + 2.0, -6.8, 0.6), true); P.add('section', B(176.0, 193.8, ROOFY(), ROOFY() + 2.0, 0.6, 0.64));
  P.bg('works', B(172.0, 195.5, 0, 34.0, -24.0, -7.4)); P.bg('works', B(150.0, 193.0, 0, 58.0, -48.0, -25.0)); P.bg('works', B(120.0, 186.0, 0, 92.0, -80, -50));
  { const ribs = []; for (let x = 173.0; x < 195; x += 2.2) ribs.push(B(x, x + 0.4, 0, 34.0, -7.4, -7.0)); for (let y = 6; y < 34; y += 6) ribs.push(B(172.0, 195.5, y, y + 0.5, -7.4, -7.05)); P.bg('works', FF.geo.merge(ribs)); }
  for (const [x, y] of [[176.5, 22], [183.0, 29.5], [188.7, 14.0]]) { const c = FF.lin('#d9e2ea').multiplyScalar(0.8); const wm = new T.Mesh(new T.PlaneGeometry(0.8, 0.45), FF.glow([c.r, c.g, c.b], false)); wm.position.set(x, y, -7.0); P.obj(wm, true); }
  /* the pipe (199.0-206.0, underside 0.48 over the lane, 1.4 m) on two portal saddles whose legs stand off the lane */
  { const r = 0.7, cy = 1.18, cz = -0.1, parts = [cylX(r, 199.0, 206.0, cy, cz, 40)];
    for (const x of [199.0, 206.0]) { const fl = new T.TorusGeometry(r, 0.05, 6, 40); fl.rotateY(Math.PI / 2); fl.translate(x, cy, cz); parts.push(fl); }
    for (let x = 200.75; x < 206; x += 1.75) { const sm = new T.TorusGeometry(r + 0.005, 0.015, 4, 40); sm.rotateY(Math.PI / 2); sm.translate(x, cy, cz); parts.push(sm); }
    const me = new T.Mesh(FF.geo.merge(parts), A.mat('bigPipe')); me.castShadow = true; me.receiveShadow = true; P.obj(me);
    for (const x of [199.7, 205.3]) {
      P.add('saddle', B(x - 0.22, x + 0.22, 0, 1.2, -1.15, -0.78), true); P.add('saddle', B(x - 0.22, x + 0.22, 0, 1.2, 0.58, 0.95), true);
      const cradle = new T.CylinderGeometry(r + 0.12, r + 0.12, 0.44, 32, 1, true, Math.PI * 0.62, Math.PI * 0.76); cradle.rotateZ(Math.PI / 2); cradle.translate(x, cy, cz); P.add('saddle', cradle, true);
      P.add('saddle', B(x - 0.22, x + 0.22, 1.05, 1.25, -1.15, 0.95), true);
    }
  }
  if (!/nopipe/.test(location.search)) pipeNumerals(P);                                                       // "1951", old and partly gone, on the pipe's front (polish pass)
  /* grass and clover; under the pipe it is dry and short; rubble down the embankment; dark stems near the lens */
  A.grass(P, 1500, 194.2, 238.0, -6.0, 2.6, 0.05, 0.4, '#55605a', { share: 0.16, skip: (x, z) => (Math.abs(z) < 0.22 && rnd() < 0.85) || (x > 199.2 && x < 205.8 && z > -0.9 && z < 0.7 && rnd() < 0.7) });
  A.grass(P, 90, 194.2, 238.0, 2.8, 4.6, 0.12, 0.42, '#1e211f', { r: 0.007, share: 0.01 });
  for (let i = 0; i < 26; i++) { const x = 208.4 + rnd() * 26; P.add('rubble', A.lump(0.12 + rnd() * 0.3, x, gy(x) + 0.05, rnd() < 0.5 ? -0.6 - rnd() * 4 : 0.5 + rnd() * 2.5, 1.4, 0.6 + rnd() * 0.4, 1.1), true); }
  /* far across the fog: the long low building (beat 5), its rows of warm windows; fence posts and poles between */
  P.bg('farNight', B(228.0, 292.0, 0, 7.0, -147.0, -140.0)); P.bg('farNight', B(240.0, 262.0, 7.0, 9.5, -147.0, -141.5));
  P.bg('grassFar', B(193.0, 330.0, -0.6, -0.05, -215.0, -14.0));
  for (const x of [214.0, 236.0, 271.0]) P.bg('far', cylY(0.06, 0, 4.5 + rnd() * 2, x, -48 - rnd() * 20, 5));
  /* low far sheds (review fixes 8 Oct: at most 1.3 m, under the sightline to the far windows; up to 5 m they hid them) */
  for (let i = 0; i < 7; i++) { const x = 196 + rnd() * 80, w = 5 + rnd() * 12; P.bg('farNight', B(x, x + w, 0, 0.6 + rnd() * 0.7, -95 - rnd() * 20, -88)); }
  farWindows(P);
  P.done();
}
const ROOFY = () => 16.0;
/* the windows: one draw; every 6 s tiny figures cross every window at once, in step, and are gone (no sound).
   Review fixes 8 Oct: they never showed in the game. The plane sat 5 cm in front of the building's face, 150 m away, and lost
   the depth test to it (the post's scene target has a coarse depth buffer at that range): now a polygon offset draws them
   over the face. A little larger (2.0 x 1.3 m) and brighter, so the figures read at 1x (about 3 x 10 px). */
function farWindows(P) {
  const pos = [], uv = [], win = [], rows = [[1.6, 2.9], [4.1, 5.4]], z = -139.9, W = 2.0, step = 3.1;
  let n = 0;
  for (const [y0, y1] of rows) for (let x = 230.4; x + W < 291.5; x += step) {
    const x0 = x, x1 = x + W;
    const v = [[x0, y0, z, 0, 0], [x1, y0, z, 1, 0], [x1, y1, z, 1, 1], [x0, y0, z, 0, 0], [x1, y1, z, 1, 1], [x0, y1, z, 0, 1]];
    for (const q of v) { pos.push(q[0], q[1], q[2]); uv.push(q[3], q[4]); win.push(n); } n++;
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setAttribute('win', new T.Float32BufferAttribute(win, 1));
  const m = new T.ShaderMaterial({
    uniforms: { uT: FF.U.uFFTime, uCol: { value: FF.lin('#f2c48c').multiplyScalar(0.62) }, uFog: { value: FF.lin('#3a4148') } },
    vertexShader: 'attribute float win; varying vec2 vU; varying float vW; void main(){ vU = uv; vW = win; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; uniform vec3 uCol, uFog; varying vec2 vU; varying float vW;
      void main(){
        float h = fract(sin(vW * 91.7) * 437.5);
        vec3 c = uCol * (0.65 + 0.35 * h) * (0.92 + 0.08 * smoothstep(0.0, 0.5, vU.y));
        float ph = mod(uT, 6.0), u = ph / 2.4;
        if (u < 1.0) {                       /* the figures: all at once, in step, left to right */
          float fx = -0.12 + 1.24 * u, bob = 0.02 * abs(sin(ph * 7.0));
          float body = step(abs(vU.x - fx), 0.07) * step(vU.y, 0.68 + bob);
          float head = step(length((vU - vec2(fx, 0.79 + bob)) * vec2(1.0, 1.25)), 0.075);
          c *= 1.0 - 0.9 * max(body, head);
        }
        gl_FragColor = vec4(mix(c, uFog, 0.46), 1.0);
      }`,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8,
  });
  const me = new T.Mesh(g, m); me.name = 'farWindows'; me.frustumCulled = false; P.obj(me, true); ST.farWin = me;
}

/* ---------------------------------------------------------------------------------------------- water: the sheet off the top
   front edge at the clank, the burst from under the edges at the contact (additive, cheap, only drawn while they play) */
const FX_VERT = 'varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
/* Review fixes 8 Oct: the sheet read as a rendering glitch (a crisp barcode of 42 threads a metre, a curtain of white streaks
   over the whole bed frame, falling through the floor). Now, at the clank:
     - a SPILL of drops off the platen's LOWER front edge at once (the jolt shakes the water hanging there off it): short
       falling streaks all along the edge in the first 0.4 s, seen from anywhere the bed is (the muted twin of the clank);
     - a few thicker, soft STREAMS off its TOP front edge (about one a metre, each 5-10 cm wide), breaking up as they fall,
       fading with the fall, with a thin sheet just off the edge; dimmer than the lit bed;
     - all of it stops at the bed's surface (y 0), never through a floor. */
function sheetFx(id, P) {
  const p = ST.press[id], top = p.upY + p.th, bot = 0.0, under = p.upY - FF.RULES.works.press.jolt;
  const g = new T.PlaneGeometry(p.x1 - p.x0 + 0.1, top - bot); g.translate((p.x0 + p.x1) / 2, (top + bot) / 2, p.z1 + 0.035);
  const m = new T.ShaderMaterial({
    uniforms: { uT: { value: -1 }, uTop: { value: top }, uUnder: { value: under }, uBot: { value: bot }, uCol: { value: FF.lin('#c9d3dc').multiplyScalar(0.2) },
      uX0: { value: p.x0 }, uX1: { value: p.x1 }, uN: { value: Math.max(4, Math.round((p.x1 - p.x0) / 1.0)) } },
    vertexShader: FX_VERT,
    fragmentShader: `uniform float uT, uTop, uUnder, uBot, uX0, uX1, uN; uniform vec3 uCol; varying vec3 vP;
      /* a hash without sin (sin() of the lane numbers is beyond float precision on some GPUs) */
      float hs(float n) { float p = fract(n * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
      float vn(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hs(i), hs(i + 1.0), f); }
      void main(){
        if (uT < 0.0) discard;
        float a = 0.0;
        /* the streams off the top front edge */
        float fall = uTop - vP.y, cell = (uX1 - uX0) / uN, ci = floor((vP.x - uX0) / cell), r = hs(ci + 7.0);
        float cx = uX0 + (ci + 0.25 + 0.5 * r) * cell, w = 0.025 + 0.025 * hs(ci + 3.1);
        float prof = exp(-pow((vP.x - cx) / w, 2.0));
        if (fall > 0.0) {
          float t0 = uT - 0.06 * r - sqrt(2.0 * fall / 9.8);                    /* when this parcel left the edge */
          float on = step(0.0, t0) * (1.0 - smoothstep(0.4 + 0.5 * r, 0.9 + 0.7 * r, t0));
          float brk = smoothstep(0.3, 0.8, vn(vP.y * 2.1 + uT * 9.0 + r * 17.0));          /* breaking up, unevenly, as it falls */
          a += prof * on * mix(1.0, brk, smoothstep(0.2, 1.0, fall)) * exp(-fall * 0.75) * (0.55 + 0.45 * hs(ci + 1.7));
          a += 0.10 * on * (1.0 - smoothstep(0.0, 0.3, fall));                     /* the thin sheet just off the edge */
        }
        /* the spill off the lower front edge at the jolt */
        float fu = uUnder - vP.y;
        if (fu > 0.0 && uT < 1.3) {
          float lane = floor(vP.x * 7.0), q = hs(lane + 11.0), u = fract(vP.x * 7.0);
          float tt = uT - 0.35 * q, yd = 4.9 * tt * tt, L = 0.10 + 0.5 * min(max(tt, 0.0), 0.5);
          float drop = step(0.0, tt) * smoothstep(yd - L, yd, fu) * step(fu, yd);
          a += 0.85 * drop * exp(-pow((u - 0.5) / 0.09, 2.0)) * step(0.3, q) * exp(-fu * 0.35);
        }
        a *= smoothstep(uX0 - 0.05, uX0 + 0.2, vP.x) * (1.0 - smoothstep(uX1 - 0.2, uX1 + 0.05, vP.x)) * smoothstep(uBot, uBot + 0.2, vP.y);
        if (a < 0.003) discard;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true,
  });
  const me = new T.Mesh(g, m); me.visible = false; me.renderOrder = 12; me.frustumCulled = false; me.name = 'sheet:' + id; P.obj(me);
  ST.fx.push({ kind: 'sheet', id, mesh: me, dur: 2.4 });
}
function burstFx(id, P) {
  const p = ST.press[id], ext = 0.9, H = 0.9;
  const g = new T.PlaneGeometry(p.x1 - p.x0 + 2 * ext, H); g.translate((p.x0 + p.x1) / 2, H / 2 - 0.05, p.z1 + 0.06);
  const m = new T.ShaderMaterial({
    uniforms: { uT: { value: -1 }, uCol: { value: FF.lin('#c9d3dc').multiplyScalar(0.7) }, uX0: { value: p.x0 }, uX1: { value: p.x1 } },
    vertexShader: FX_VERT,
    fragmentShader: `uniform float uT, uX0, uX1; uniform vec3 uCol; varying vec3 vP;
      float hs(float n) { return fract(sin(n * 311.7) * 43758.5); }
      void main(){
        if (uT < 0.0) discard;
        float out_ = max(uX0 - vP.x, vP.x - uX1);                    /* metres beyond the platen's ends (< 0 under it) */
        float k = uT / 0.75; if (k > 1.0) discard;
        float n = 0.5 + 0.5 * sin(vP.x * 23.0 + 1.7 * sin(vP.x * 7.0)) * sin(vP.x * 11.0 - 0.8);
        float hmax = (out_ > 0.0 ? 0.42 : 0.12 + 0.1 * n) * sin(3.1416 * min(1.0, k * 1.5));
        float reach = (0.2 + 0.8 * k);
        float side = out_ > 0.0 ? 1.0 - smoothstep(reach * 0.4, reach, out_) : 0.12;
        float y = max(vP.y, 0.0), a = (1.0 - smoothstep(hmax * 0.3, max(hmax, 1e-3), y)) * side;
        a *= (0.55 + 0.45 * n) * (1.0 - k) * (1.0 - k) * 0.55;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true,
  });
  const me = new T.Mesh(g, m); me.visible = false; me.renderOrder = 12; me.frustumCulled = false; me.name = 'burst:' + id; P.obj(me);
  ST.fx.push({ kind: 'burst', id, mesh: me, dur: 0.75 });
}
/* the gate's light seen from the hall (review fixes 8 Oct: the first press's one clue was a thin strip at the frame's edge,
   lit just as the press slammed down and took the eye): while the gate is open, its cold light spills out of slot B's notch
   onto the wet gutter in front of it and hangs in the mist and rain before the press's front face, a soft fan rising out of
   the far notch. Both by the gate's gap (k 0..1), so every cycle a light comes on in the far notch. Additive, two quads. */
function gateLightFx(P) {
  const col = FF.lin('#d6dee6');
  const mk = (frag, extra) => new T.ShaderMaterial({ uniforms: Object.assign({ uK: { value: 0 }, uT: FF.U.uFFTime, uCol: { value: col.clone() } }, extra || {}), vertexShader: FX_VERT, fragmentShader: frag,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true });
  /* the fan in the mist in front of the notch (it stands in front of the press's face, z 0.66) */
  const g = new T.PlaneGeometry(4.0, 2.6); g.translate(145.0, 0.4, 0.66);
  const fan = new T.Mesh(g, mk(`uniform float uK, uT; uniform vec3 uCol; varying vec3 vP;
      void main(){
        if (uK < 0.01) discard;
        vec2 d = vP.xy - vec2(145.05, -0.22);
        float core = exp(-pow(d.x / 0.75, 2.0) - pow(d.y / 0.22, 2.0));                           /* the notch's mouth */
        float up = max(d.y, 0.0), wide = 0.55 + 0.55 * up;
        float mist = exp(-pow(d.x / wide, 2.0)) * exp(-up * 1.55) * smoothstep(-0.25, 0.05, d.y);   /* the fan rising in the mist */
        float drift = 0.88 + 0.12 * sin(vP.x * 2.3 + vP.y * 1.7 - uT * 0.5) * sin(vP.x * 0.9 - vP.y * 2.6 + uT * 0.35);   /* slow mist, no stripes */
        float a = uK * (0.13 * core + 0.08 * mist * drift);
        if (a < 0.002) discard;
        gl_FragColor = vec4(uCol * a, 1.0);
      }`));
  fan.renderOrder = 12; fan.frustumCulled = false; fan.visible = false; fan.name = 'gateFan'; P.obj(fan);
  /* the light on the wet gutter in front of slot B */
  const q = new T.PlaneGeometry(2.6, 0.24); q.rotateX(-Math.PI / 2); q.translate(145.0, -0.893, 0.51);
  const pool = new T.Mesh(q, mk(`uniform float uK; uniform vec3 uCol; varying vec3 vP;
      void main(){ float a = uK * 0.16 * exp(-pow((vP.x - 145.2) / 0.7, 2.0)); if (a < 0.002) discard; gl_FragColor = vec4(uCol * a, 1.0); }`));
  pool.renderOrder = 12; pool.frustumCulled = false; pool.visible = false; pool.name = 'gatePool'; P.obj(pool);
  ST.gateFx = [fan, pool];
}

/* drips: static edges (the intake's lip, the broken roof, the pipe, the end door), and each platen's edges while it hangs still */
const DRIP_FS = 'uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; c.y *= 0.6; float a = smoothstep(0.5, 0.15, length(c)); gl_FragColor = vec4(uCol * a * vA, 1.0); }';
const DRIP_VS = `attribute vec4 per; attribute float y1; uniform float uTime, uPx; varying float vA;
  void main(){ float t = mod(uTime + per.y, per.x); float fall = position.y - y1; float tf = sqrt(2.0 * max(fall, 0.01) / 9.8);
    float hang = 0.6; float tt = t - hang; vec3 p = position; p.y -= tt > 0.0 ? 4.9 * tt * tt : 0.0;
    vA = (tt < 0.0 ? 0.25 + 0.5 * (t / hang) : 1.0) * (1.0 - step(tf, tt));
    vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * 2.2 * (6.0 / -mv.z); }`;
function dripMesh(src, n, name) {
  const Pp = new Float32Array(n * 3), Aa = new Float32Array(n * 4), Y1 = new Float32Array(n);
  for (let i = 0; i < n; i++) { const s = src[i % src.length]; const x = s[0] + (rnd() - 0.5) * (s[3] || 0.08), z = s[2] + (rnd() - 0.5) * 0.08; Pp.set([x, s[1], z], i * 3); Aa.set([1.0 + rnd() * 2.4, rnd() * 10, 0, 0], i * 4); Y1[i] = (s[4] != null ? s[4] : FF.Level.floorUnder(x, 0.01, s[1] - 0.02, 0)) + 0.005; }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(Pp, 3)); g.setAttribute('per', new T.BufferAttribute(Aa, 4)); g.setAttribute('y1', new T.BufferAttribute(Y1, 1));
  const m = new T.ShaderMaterial({ uniforms: { uTime: FF.U.uFFTime, uCol: { value: FF.lin('#c9d2da').multiplyScalar(0.5) }, uPx: { value: 1 } }, vertexShader: DRIP_VS, fragmentShader: DRIP_FS,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor, depthWrite: false, transparent: true });
  const me = new T.Points(g, m); me.frustumCulled = false; me.renderOrder = 12; me.name = name; A.root.add(me); return me;
}
function buildDrips() {
  /* [x, y, z, xSpread, floorY] */
  const src = [[131.0, 0.47, 0.3, 0.1], [131.0, 0.47, -0.3, 0.1], [136.6, yi(136.6) - 0.1, -1.6, 0.2, 0.0], [139.3, yi(139.3) - 0.2, -2.8, 0.3, 0.0], [138.0, yi(138.0) - 0.1, -4.6, 0.6, 0.0],
    [199.4, 0.82, 0.55, 0.2], [200.6, 0.82, 0.55, 0.2], [202.1, 0.82, 0.55, 0.2], [203.5, 0.82, 0.55, 0.2], [205.4, 0.82, 0.55, 0.2], [201.2, 0.82, -0.75, 0.2], [204.3, 0.82, -0.75, 0.2],
    [193.55, 0.24, 0.3, 0.1], [173.6, ROOFY() - 0.2, -1.4, 0.5, 0.0], [180.4, ROOFY() - 0.2, -3.0, 0.6, 0.0]];
  ST.dripStatic = dripMesh(src, 42, 'drips:works');
  for (const id of PRESSES) {
    const p = ST.press[id], s = [];
    for (let k = 0; k < 6; k++) s.push([p.x0 + (k + 0.5) * (p.x1 - p.x0) / 6, p.upY - 0.005, p.z1 - 0.05, 0.4]);
    s.push([p.x0 + 0.05, p.upY - 0.005, -1.0, 0.05], [p.x1 - 0.05, p.upY - 0.005, -0.6, 0.05]);
    ST.drips.push({ id, mesh: dripMesh(s, 12, 'drips:' + id) });
  }
}

/* ---------------------------------------------------------------------------------------------- the module */
const W2 = FF.WorldS2 = {
  /* before the rig and the looks are built: the Works' looks, lights, sets, materials and the footprint mask hook */
  declare(api) {
    A = api; T = THREE;
    Object.assign(FF.LOOKS, JSON.parse(JSON.stringify(S2().looks || {})));
    for (const k in MATS) if (!A.MAT[k]) A.MAT[k] = MATS[k];
    if (!A.MAT.wetS) A.MAT.wetS = { color: '#5e6369', roughness: 0.42, mottle: 0.04, lift: 0.18 };
    for (const id in LIGHTS.spot) { const d = LIGHTS.spot[id]; A.SPOT_IDS[id] = d.slot; A.SPOT_DEF[id] = Object.assign({}, d); }
    for (const id in LIGHTS.point) { const d = LIGHTS.point[id]; A.POINT_IDS[id] = d.slot; A.POINT_DEF[id] = Object.assign({}, d); }
    for (const s in LIGHTS.sets) A.SETS[s] = Object.assign({}, LIGHTS.sets[s]);
    FF.addShadingHook({
      key: 'works-foot', only: 'works',
      uniforms: {
        uWOn: { value: 0 },
        uWFootX: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0.1, 0)) },
        uWFootZ: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0.1, 0)) },
        uWPit: { value: PITS.map(([a, b]) => new THREE.Vector4(a, b, -0.10, 1)) },
      },
      pars: FOOT_GLSL,
      spot: 'if ( uWOn > 0.5 ) { if ( i == 0 ) c *= ffWFoot( p, uWFootX[0], uWFootZ[0] ); else if ( i == 1 ) c *= ffWFoot( p, uWFootX[1], uWFootZ[1] ); else if ( i == 2 ) c *= ffWFoot( p, uWFootX[2], uWFootZ[2] ); else if ( i == 3 ) c *= ffWFoot( p, uWFootX[3], uWFootZ[3] ); }',
    });
  },
  /* after Sequence 1's places and the rain: build the Works (its own seeded random; Sequence 1's placements are unchanged) */
  build(api) {
    A = api; T = THREE; ctx = A.ctx;
    const prev = A.rnd; rnd = A.prng(20261008); A.setRnd(rnd);
    try { buildApproach(); buildHall(); buildPassage(); buildLine(); buildOut(); buildDrips(); }
    finally { A.setRnd(prev); }
    for (const off of ST.offs) off(); ST.offs = [];
    if (FF.bus) {
      ST.offs.push(FF.bus.on('press', d => { if (!d || !ST.press[d.id]) return; const t = FF.G.frameT; if (d.phase === 'release') ST.sheetAt[d.id] = t; else if (d.phase === 'contact') ST.burstAt[d.id] = t; }));
      ST.offs.push(FF.bus.on('restart', () => { ST.sheetAt = {}; ST.burstAt = {}; }));
    }
    ST.built = true;
  },
  /* the light set for a checkpoint (warps, restarts) */
  setAt(x) { return setByX(x); },
  /* the light set this frame: switch to the neighbour only where the lights it changes are out of the frame (or forced) */
  setFor(rx, r, cur, cam) {
    const want = setByX(rx);
    if (rx < 124.0 && ORDER.indexOf(cur) <= 0) return cur;       // Sequence 1 decides below the join
    if (want === cur) return cur;
    const ci = ORDER.indexOf(cur), wi = ORDER.indexOf(want);
    if (ci < 0 || Math.abs(ci - wi) > 1) { ST.forced++; return want; }   // a jump (a warp): straight there
    const sw = SWITCH.find(s => (s.a === cur && s.b === want) || (s.b === cur && s.a === want));
    const aspect = (ctx.camera && ctx.camera.aspect) || 2, hw0 = 0.2309 * aspect;
    const view = z => { const h = hw0 * (cam.z - z); return [cam.x - h, cam.x + h]; };
    if (sw.ok(view)) { ST.switches++; return want; }
    if ((sw.forceB != null && want === sw.b && rx > sw.forceB) || (sw.forceA != null && want === sw.a && rx < sw.forceA)) { ST.forced++; return want; }
    return cur;
  },
  /* the look path: the merged lane's (ff-lane.js) */
  lookBlend(x) { return FF.Level.lookBlend(x); },
  /* per set: the contact-shadow boxes (1..5 are the world's) */
  applySet(set, k, off) {
    for (let i = 1; i <= 5; i++) off(i);
    if (set === 'WP') { FF.setAOBox(1, [156.2, 0.2, -0.05], [0.6, 0.2, 0.55], k, 0.35); FF.setAOBox(2, [158.0, 0.43, -0.6], [0.45, 0.43, 0.27], k * 0.7, 0.3); FF.setAOBox(3, [159.62, 0.6, -1.25], [0.35, 0.6, 0.35], k * 0.5, 0.3); }
    else if (set === 'WL') { FF.setAOBox(1, [199.7, 0.6, -0.1], [0.22, 0.6, 1.05], k * 0.8, 0.4); FF.setAOBox(2, [205.3, 0.6, -0.1], [0.22, 0.6, 1.05], k * 0.8, 0.4); FF.setAOBox(3, [202.5, 0.24, -0.1], [3.5, 0.24, 0.7], k * 0.6, 0.6); }
  },
  /* the lights the World owns, from the machines (FF.Works) and the places */
  derived() {
    const H = A.H, W = FF.Works;
    for (const id of PRESSES) {
      const p = ST.press[id], h = H[LAMP_OF[id]]; if (!p || !h) continue;
      const s = W && W.press ? W.press(id) : null, y = s ? s.y : p.upY, k = clamp(1 - y / p.upY, 0, 1);
      const yl = y + p.th * 0.95, cz = (p.z0 + p.z1) / 2, hd = Math.hypot(p.hw, (p.z1 - p.z0) / 2);
      h.st.pos = [p.cx, yl, cz]; h.st.target = [p.cx, -1, cz];
      h.st.angle = Math.min(1.5, Math.atan(hd / Math.max(yl, 0.05)) + 0.12); h.st.penumbra = 0.15; h.st.distance = 0; h.st.decay = 1;
      const base = A.SPOT_DEF[LAMP_OF[id]].intensity;
      /* review fixes 8 Oct: the clank shakes the lamp under the platen (a flicker in the first 0.3 s, the muted twin of the clank
         seen wherever the bed is), then the pool is brighter and tighter through the warning */
      const mk = id === 'P1' ? S2().works.P1.marks : S2().works.line.marks;
      const rt = s && s.state === 'release' && s.phase != null ? s.phase - mk.release : -1, du = s && s.state === 'descent' && s.phase != null ? (s.phase - mk.descent) / (mk.contact - mk.descent) : -1;
      const fl = rt >= 0 ? (rt < 0.05 ? 0.2 : rt < 0.10 ? 1.45 : rt < 0.17 ? 0.4 : rt < 0.30 ? 1.35 : 1.25) : du >= 0 ? 1.25 - 0.25 * du : 1;
      h.st.derived = base * (0.62 + 0.95 * k * k) * sstep(0.02, 0.3, y) * fl;
      p.lampK = k; p.y = y; p.state = s ? s.state : 'up'; p.tight = rt >= 0 ? 0.42 * Math.min(1, rt / 0.25) : du >= 0 ? 0.42 * (1 - du) : 0;
      const strip = ST.glowStrips[id]; if (strip) strip.material.color.copy(FF.lin('#e6edf2')).multiplyScalar(0.5 + 3.5 * h.st.derived / base);
    }
    H.highBay.st.derived = A.SPOT_DEF.highBay.intensity;
    H.intakeGlow.st.derived = A.SPOT_DEF.intakeGlow.intensity;
    H.doorLine.st.derived = A.SPOT_DEF.doorLine.intensity;
    { const sl = W && W.sluice ? W.sluice() : { gap: 0 }, g = clamp(sl.gap / 0.30, 0, 1);
      H.sluiceGlow.st.derived = A.SPOT_DEF.sluiceGlow.intensity * (0.07 + 0.93 * g);
      if (ST.gateFx) for (const o of ST.gateFx) { o.material.uniforms.uK.value = g * g * (3 - 2 * g); o.visible = g > 0.02 && A.places.hall.group.visible; }
      if (ST.sluicePlate) { const s = S2().works.sluice; ST.sluicePlate.scale.y = Math.max(0.02, (s.top - (s.floorY + sl.gap)) / 0.3); }
    }
    /* the work lamp on its stand until the Painter drives it */
    { const h = H.workLamp, d = A.SPOT_DEF.workLamp; if (!h.st.ext) { h.st.pos = d.pos.slice(); h.st.target = d.target.slice(); h.st.derived = d.intensity; } else h.st.derived = 0; }
    for (const id of ['crossAmber', 'amberBulkhead', 'culvertLamp', 'exitGap']) H[id].st.derived = A.POINT_DEF[id].intensity;
  },
  frame(dt, cam) {
    if (!ST.built) return;
    const t = FF.G.frameT, set = A.S.set, own = A.SETS[set] || {};
    /* the footprint mask for whichever press lamps own a spot slot now */
    let anyFoot = 0;
    for (const slot in SLOT_I) {
      const i = SLOT_I[slot], id = own[slot], pid = id && Object.keys(LAMP_OF).find(k => LAMP_OF[k] === id), p = pid && ST.press[pid];
      const ux = FF.U.uWFootX.value[i], uz = FF.U.uWFootZ.value[i];
      if (p && set[0] === 'W') { const soft = (0.04 + 0.3 * clamp((p.y != null ? p.y : p.upY) / p.upY, 0, 1)) * (1 - (p.tight || 0)); ux.set(p.x0, p.x1, soft, 1); uz.set(p.z0, p.z1, 0.1, 1); anyFoot = 1; }
      else { ux.set(0, 0, 0.1, 0); uz.set(0, 0, 0.1, 0); }
    }
    FF.U.uWOn.value = anyFoot;
    /* water: the sheet after a clank, the burst at a contact */
    for (const f of ST.fx) {
      const t0 = f.kind === 'sheet' ? ST.sheetAt[f.id] : ST.burstAt[f.id], age = t0 != null ? t - t0 : -1;
      const on = age >= 0 && age < f.dur && A.places[f.id === 'P1' ? 'hall' : 'line'].group.visible;
      f.mesh.visible = on; if (on) f.mesh.material.uniforms.uT.value = age;
    }
    /* drips off each platen's edges only while it hangs still */
    for (const d of ST.drips) { const p = ST.press[d.id]; d.mesh.visible = p.state === 'up' && A.places[d.id === 'P1' ? 'hall' : 'line'].group.visible; d.mesh.material.uniforms.uPx.value = ctx.renderer.getPixelRatio(); }
    if (ST.dripStatic) { ST.dripStatic.visible = cam.x > 124 && cam.x < 214; ST.dripStatic.material.uniforms.uPx.value = ctx.renderer.getPixelRatio(); }
    if (ST.intakeHalo) ST.intakeHalo.visible = cam.x < 141;
    /* review fixes 8 Oct: while his lamp is off the wall (the look) the words sink back into the dark wall; nothing frames them */
    if (ST.decal) { const k = FF.Painter && FF.Painter.lampK != null ? FF.Painter.lampK : 0, o = 1 - 0.45 * k * k * (3 - 2 * k); if (Math.abs(ST.decal.material.opacity - o) > 1e-3) ST.decal.material.opacity = o; }
  },
  /* the rain inside the Works: only through the broken roof, stopped by the platens' tops; lit by the high bay */
  rain(u, cam) {
    const on = cam.x > 118;
    u.uS2.value = on ? 1 : 0; if (!on) return;
    RAIN_COLS.forEach((c, i) => u.uS2X.value[i].set(c[0], c[1], c[2], c[3]));
    for (let i = RAIN_COLS.length; i < u.uS2X.value.length; i++) u.uS2X.value[i].set(0, 0, 0, 0);
    PRESSES.forEach((id, i) => { const p = ST.press[id]; if (p) u.uS2B.value[i].set(p.x0, p.x1, (p.y != null ? p.y : p.upY) + p.th, 1); });
    const fy = Math.min(-0.02, gy(cam.x) - 0.1, gy(cam.x + 6) - 0.1); u.uFloorY.value = cam.x > 193 ? fy : -0.02; u.uMin.value.y = Math.min(-0.2, fy - 0.2);
    const hb = A.H.highBay; if (A.owner('K1') === 'highBay' && hb.effective() > 0) { u.uWL.value.fromArray(hb.st.pos); u.uWLd.value.fromArray(hb.st.target).sub(u.uWL.value).normalize(); u.uWLc.value.set(Math.cos(hb.st.angle * 1.15), hb.effective() / 6); }
  },
  reset() { ST.sheetAt = {}; ST.burstAt = {}; const h = A && A.props.workLampHead; if (h && h.userData.restQuat) h.quaternion.copy(h.userData.restQuat); },
  setTier(t) { if (ST.dripStatic) ST.dripStatic.geometry.setDrawRange(0, t && t.name === 'low' ? 14 : 42); },
  debug() {
    const pr = {}; for (const id of PRESSES) { const p = ST.press[id]; if (p) pr[id] = { y: p.y != null ? +p.y.toFixed(2) : null, lamp: +(A.H[LAMP_OF[id]].st.derived || 0).toFixed(2) }; }
    return { built: ST.built, switches: ST.switches, forced: ST.forced, press: pr, fx: ST.fx.filter(f => f.mesh.visible).map(f => f.kind + ':' + f.id) };
  },
};
})();
