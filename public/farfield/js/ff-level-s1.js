/* FAR FIELD — ff-level-s1.js: Sequence 1 level data (FF.S1). Pure data: no three.js, no DOM, loadable in node.
   Source: docs/farfield/SEQUENCE-1.md (lead design) AS AMENDED on 7 Oct (Amendments A1-A24 at the top of that file).
   The scripted beats and the searcher's routine are in ff-script-s1.js (FF.S1.searcher / .verge / .walkway); rules and
   timings for movement and perception are in ff-rules.js (FF.RULES).
   OWNER: the world builder (ff-level.js reads it). Search geometry (solids, covers, occluders) changes only with the Search
   checker re-run (docs/farfield/checks/).
   Conventions (look test): metres; +x right along the journey, +y up, +z towards the camera. The rabbit lives on the lane
   z = 0. Every main floor is at y = 0 (the shaders assume it); only the drain dips to y = -1.0.
   Collision is data, never meshes: a piecewise-linear GROUND profile + axis-aligned SOLIDS in the lane's x/y plane + the box.
   Steps up of <= stepUp are walked; taller ones need a jump. Clearances inside `squeeze` crouch the rabbit by themselves.
   z ranges (z0, z1) on solids are for the 3D build and the searcher's path only; collision and sight are 2D. */
'use strict';
window.FF = window.FF || {};

FF.S1 = {
  id: 'sequence-1',
  stepUp: 0.10,
  squeeze: { min: 0.16, max: 0.235, shortMax: 0.6 },

  sections: [
    { id: 'verge',     x0: -6.0,  x1: 38.5,  look: 'verge',     beat: 1, title: 'The Verge' },
    { id: 'drain',     x0: 38.5,  x1: 55.5,  look: 'drain',     beat: 1, title: 'The drain' },
    { id: 'courtyard', x0: 55.5,  x1: 86.0,  look: 'courtyard', beat: 2, title: 'The Courtyard' },
    { id: 'search',    x0: 86.0,  x1: 113.5, look: 'search',    beat: 3, title: 'The Search' },
    { id: 'rest',      x0: 113.5, x1: 129.0, look: 'rest',      beat: 4, title: 'Breathing space' },
  ],
  /* A1: one evening, no jumps. The Verge darkens continuously with x (dusk -> late dusk), the drain hides the next blend,
     the Courtyard is late dusk through the high windows, the Search and the rest are night (the moon only a faint glow
     through cloud). Blends happen only where the player cannot judge light. */
  lookBlends: [
    { from: 'verge', to: 'verge-late', x0: 2.0, x1: 38.5, continuous: true },
    { from: 'verge-late', to: 'drain', x0: 39.6, x1: 41.6 },
    { from: 'drain', to: 'courtyard', x0: 50.0, x1: 54.5 },
    { from: 'courtyard', to: 'search', transit: 'duct' },
    { from: 'search', to: 'rest', x0: 112.6, x1: 115.0 },
  ],

  /* A5: the title plays over the live Verge: the rabbit grooming beneath partial shelter (title-shelter), rain beyond */
  spawn: { x: 2.0, y: 0, face: 1, pose: 'groom' },

  /* ground: [x, y]; a repeated x is a vertical step */
  ground: [
    [-6.0, 0.00], [3.0, 0.02], [6.5, 0.04], [9.5, 0.00], [14.0, 0.02], [20.0, 0.00], [27.0, 0.01],
    [36.2, 0.00], [38.2, -0.10], [38.5, -0.10],
    [38.5, -1.00],                       // the culvert inlet (A14): broken slab corner, 0.9 m drop into the chamber (one-way)
    [53.4, -1.00], [55.5, 0.00],         // chamber + squeeze pipe + main pipe at y -1.0, then the silt ramp into the courtyard
    [127.2, 0.00], [127.2, -1.60], [129.0, -1.60],   // the drainage channel at the end of the breathing space
  ],

  solids: [
    { id: 'thicket',      x0: -6.0,   x1: 0.6,    y0: 0.00,  y1: 3.0,  kind: 'wall' },
    { id: 'title-shelter',x0: 0.6,    x1: 2.6,    y0: 0.95,  y1: 1.05, kind: 'ceiling', z0: -0.9, z1: 0.6,
      note: 'A5: a sheet of hoarding leaning out from the thicket edge; partial shelter over the grooming rabbit at the title; above jump reach (0.76), never touched' },
    { id: 'fallen-post',  x0: 10.8,   x1: 11.1,   y0: 0.00,  y1: 0.30, kind: 'kerb' },     // first jump
    { id: 'hoarding',     x0: 16.9,   x1: 17.1,   y0: 0.19,  y1: 2.20, kind: 'wall' },     // first squeeze (a duck-under): the same kind of gap as the Search's exit
    { id: 'cross-wall',   x0: 39.0,   x1: 41.6,   y0: -0.55, y1: 14.0, kind: 'wall' },     // its underside is the chamber's dark overhang 39.0-39.6. A14: the culvert's cracked slab sits behind the lane in z (decor 'culvert-mouth'); its broken corner 38.5-39.0 at the lane is the way down
    { id: 'collapse',     x0: 39.6,   x1: 43.0,   y0: -0.79, y1: -0.55, kind: 'ceiling' }, // squeeze pipe: 0.21 clear, the only CREEP (0.75 m/s, ~4.5 s)
    { id: 'pipe-crown-a', x0: 41.6,   x1: 46.0,   y0: -0.55, y1: 0.00, kind: 'ceiling' },
    { id: 'slab-gap',     x0: 46.0,   x1: 46.8,   y0: -0.03, y1: 0.00, kind: 'ceiling',
      note: 'A14: a cracked slab with a ragged gap (no grate, no bars): grey dusk and rain fall through; the van\'s lights pass over it as it leaves' },
    { id: 'pipe-crown-b', x0: 46.8,   x1: 52.6,   y0: -0.55, y1: 0.00, kind: 'ceiling' },
    { id: 'court-west',   x0: 51.0,   x1: 52.6,   y0: 0.00,  y1: 14.0, kind: 'wall' },
    { id: 'box-lip',      x0: 70.15,  x1: 70.40,  y0: 0.00,  y1: 0.06, kind: 'kerb' },
    { id: 'box-kerb',     x0: 76.36,  x1: 76.60,  y0: 0.00,  y1: 0.08, kind: 'kerb' },
    { id: 'divide',       x0: 83.5,   x1: 86.0,   y0: 0.00,  y1: 14.0, kind: 'wall' },
    /* the Search (amended geometry, checked: docs/farfield/checks/search-sim-amended.txt). z ranges keep the searcher's path
       (z -1.15) behind every cover (A16); occluders and shadow casters are these same boxes. */
    { id: 'A0-shelf',     x0: 88.0,   x1: 89.8,   y0: 0.30,  y1: 0.42, kind: 'ceiling', z0: -0.8, z1: 0.5 },
    { id: 'A0-skirtR',    x0: 89.7,   x1: 89.8,   y0: 0.20,  y1: 0.30, kind: 'ceiling', z0: -0.8, z1: 0.5 },
    { id: 'deck-A',       x0: 92.0,   x1: 98.0,   y0: 0.67,  y1: 0.85, kind: 'ceiling', z0: -1.6, z1: 0.6, note: 'he walks ON it at y 0.85, z -1.15' },
    { id: 'deck-skirtR',  x0: 97.85,  x1: 98.0,   y0: 0.22,  y1: 0.67, kind: 'ceiling', z0: -1.6, z1: 0.6 },
    { id: 'pallet-B',     x0: 101.0,  x1: 103.4,  y0: 0.26,  y1: 0.40, kind: 'ceiling', z0: -0.8, z1: 0.6, note: 'A10: two pallets end to end on bricks' },
    { id: 'pallet-skirtL',x0: 101.0,  x1: 101.1,  y0: 0.20,  y1: 0.26, kind: 'ceiling', z0: -0.8, z1: 0.6 },
    { id: 'pallet-skirtR',x0: 103.3,  x1: 103.4,  y0: 0.20,  y1: 0.26, kind: 'ceiling', z0: -0.8, z1: 0.6 },
    { id: 'skip-C',       x0: 105.0,  x1: 107.2,  y0: 0.32,  y1: 1.55, kind: 'ceiling', z0: -0.8, z1: 0.8 },
    { id: 'skip-flapL',   x0: 105.0,  x1: 105.1,  y0: 0.20,  y1: 0.32, kind: 'ceiling', z0: -0.8, z1: 0.8 },
    { id: 'skip-doorR',   x0: 107.1,  x1: 107.2,  y0: 0.22,  y1: 0.32, kind: 'ceiling', z0: -0.8, z1: 0.8,
      note: 'A10: the rear door hangs half open; the crouch-look light slides under it and stops visibly short of the core' },
    { id: 'fence',        x0: 113.0,  x1: 113.5,  y0: 0.20,  y1: 3.20, kind: 'wall', z0: -3.0, z1: 0.8 },     // corrugated sheet; its bent corner is the gap
    { id: 'lean-to',      x0: 119.6,  x1: 123.4,  y0: 0.53,  y1: 0.57, kind: 'ceiling', note: 'integration: raised from 0.33 so the rabbit can sit up, listen and groom beneath it (0.45 m) without its ears piercing the sheet' },
    { id: 'channel-edge', x0: 127.0,  x1: 127.2,  y0: 0.00,  y1: 3.00, kind: 'edge', note: 'not drawn: the rabbit stops at the channel lip, looks down, sniffs towards the Works, turns back' },
  ],

  pushables: [
    { id: 'box', x: 73.0, w: 0.52, h: 0.44, d: 0.50, minX: 70.66, maxX: 76.10, accel: 1.6, friction: 5.0, push: 0.62 },
  ],

  links: [
    { id: 'culvert', kind: 'drop', x0: 38.5, x1: 39.0, chamber: [38.5, 39.6], overhang: [39.0, 39.6],
      note: 'A14: the broken corner of a cracked culvert slab, rabbit-sized only. Drop 0.9 m into a 1.0 m chamber; the way on is the squeeze pipe 39.6-43.0. The person can only shine a torch down the crack and reach an arm in; both stop short of the overhang.' },
    { id: 'duct', kind: 'raised-opening', from: { x: 76.0, sill: 0.80, w: 0.46, h: 0.36, faceZ: -0.45 },
      to: { x: 87.2, sill: 0.82, w: 0.46, h: 0.36, faceZ: -0.45 }, climbIn: 0.8, transit: 3.8, popOut: 0.4, sniff: 0.3, hopDown: 0.5, landX: 87.6,
      enter: 'on the box, |x - 76.0| < 0.35: Up or Space climbs in. From the floor: the reach-fail plays ONLY when no box top is within jump reach (A15); next to the box it is an ordinary jump.' },
    { id: 'gap', kind: 'squeeze', x0: 113.0, x1: 113.5, clear: 0.20, safeAt: 113.15 },
  ],

  /* hides (A6, A11). core = the rabbit-centre interval that is (a) dark from every pose of his routine, standing and kneeling,
     as PROVEN by the checker, and (b) deeper than his reach from any end he can kneel at. Every core is a refuge: safe even
     after SPOTTED (the hand falls short). The ends of a hide are dark only where geometry hides them and are reachable.
     mask = the render may multiply the searcher's lights by 0 inside the core (shadow-map leak clean-up only). */
  covers: [
    { id: 'A0-shelf', x0: 88.0,  x1: 89.8,  y1: 0.30, core: [88.2, 88.95],    refuge: [88.2, 88.95],    kneelEnds: [89.8],         mask: true, checkpoint: 'search-arrive' },
    { id: 'deck-A',   x0: 92.0,  x1: 98.0,  y1: 0.67, core: [93.2, 96.3],     refuge: [93.2, 96.3],     kneelEnds: [92.0, 98.0],   mask: true, checkpoint: 'search-platform' },
    { id: 'pallet-B', x0: 101.0, x1: 103.4, y1: 0.26, core: [101.85, 102.55], refuge: [101.85, 102.55], kneelEnds: [101.0, 103.4], mask: true },
    { id: 'skip-C',   x0: 105.0, x1: 107.2, y1: 0.32, core: [105.8, 106.4],   refuge: [105.8, 106.4],   kneelEnds: [105.0, 107.2], mask: true, checkpoint: 'search-skip' },
    { id: 'gap',      x0: 113.0, x1: 113.5, y1: 0.20, core: [113.15, 113.5],  refuge: [113.15, 113.5], kneelEnds: [],             mask: false, exit: true, note: 'through the gap = out of the Search' },
    { id: 'lean-to',  x0: 119.6, x1: 123.4, y1: 0.53, core: null, refuge: null, rest: [120.2, 122.8] },
  ],
  /* light and sight blockers in the lane plane; the same boxes build the torch's shadow casters */
  occluders: ['A0-shelf', 'A0-skirtR', 'deck-A', 'deck-skirtR', 'pallet-B', 'pallet-skirtL', 'pallet-skirtR', 'skip-C', 'skip-flapL', 'skip-doorR', 'fence'],
  areaLights: [{ id: 'door-spill', x0: 108.6, x1: 111.4, on: 'door-open' }, { id: 'flood', x0: 101.0, x1: 106.0, on: 'always' }],

  /* triggers fire on entering [x0, x1] (optionally yMax, still, nearBox, onBox); repeat + cooldown where given.
     Level emits the trigger's `event` on the bus with { id, arg, x }. A8: nothing here pushes the player. */
  triggers: [
    { id: 'hint-move',    x0: 2.0,   x1: 6.0,   event: 'hint', arg: 'move' },
    { id: 'hint-jump',    x0: 9.6,   x1: 10.8,  event: 'hint', arg: 'jump', still: 1.5 },
    { id: 'far-boom',     x0: 12.5,  x1: 99,    event: 'sound-cue', arg: 'far-boom', note: 'A2: ears and head turn right by themselves; the rabbit sits up 1.2 s only if standing still. No hint.' },
    { id: 'vehicle',      x0: 21.0,  x1: 99,    event: 'vehicle-arrive' },
    { id: 'gate-glare',   x0: 31.0,  x1: 35.0,  event: 'gate-lit', repeat: true, cooldown: 4.0 },
    { id: 'in-culvert',   x0: 38.5,  x1: 39.6,  yMax: -0.5, event: 'person-out' },
    { id: 'in-pipe',      x0: 40.2,  x1: 43.0,  yMax: -0.5, event: 'rabbit-in-pipe', note: 'A14: the person\'s torch may come down only after this' },
    { id: 'courtyard-in', x0: 55.5,  x1: 58.0,  event: 'shake-off' },
    { id: 'court-reveal', x0: 55.5,  x1: 56.0,  event: 'camera-shot', arg: 'courtyard-reveal' },
    { id: 'puzzle-zone',  x0: 71.0,  x1: 83.5,  event: 'walkway-timer', arg: 6.0, alsoOn: ['first-push', 'reach-fail', 'courtyard+25s'] },
    { id: 'hint-push',    x0: 71.0,  x1: 74.0,  event: 'hint', arg: 'push', nearBox: 1.5, still: 3.0 },
    { id: 'hint-go-in',   x0: 75.65, x1: 76.35, event: 'hint', arg: 'go-in', onBox: true },
    { id: 'arrive-yard',  link: 'duct', event: 'search-entry', arg: 1.5 },
    { id: 'in-gap',       x0: 113.0, x1: 113.6, event: 'safe' },
    { id: 'rest',         x0: 120.2, x1: 122.8, event: 'rest', still: 1.5, alt: { x0: 116.0, still: 3.0 }, autoStopAfter: 60 },
  ],

  /* checkpoints. Only the Search ever restores one after a failure; the rest hold progress if the game is left.
     Search loop times follow the amended 44.85 s loop (A10: the deck look is 6.0 s). */
  checkpoints: [
    { id: 'verge-start',     x: 2.0,   y: 0,    face: 1, pose: 'groom' },
    { id: 'verge-mid',       x: 19.4,  y: 0,    face: 1 },
    { id: 'drain',           x: 44.0,  y: -1.0, face: 1 },
    { id: 'courtyard',       x: 56.6,  y: 0,    face: 1, save: true },
    { id: 'search-arrive',   x: 88.4,  y: 0,    face: 1, pose: 'hide', searcher: { beforeEntryDone: 'entry', after: { loopT: 33.7 } }, save: true },
    { id: 'search-platform', x: 94.8,  y: 0,    face: 1, pose: 'hide', when: 'whole body in the deck core, undetected', searcher: { loopT: 9.0 } },
    { id: 'search-skip',     x: 106.1, y: 0,    face: 1, pose: 'hide', when: 'whole body in the skip core, undetected', searcher: { loopT: 39.5 } },
    { id: 'rest',            x: 116.0, y: 0,    face: 1, save: true },
  ],

  camera: {
    base: { fov: 26, dist: 8.2, height: 1.15, horizon: 0.57, lookAhead: 1.3, follow: 2.6, jumpFollow: 0.25, edge: 0.15, maxDist: 12.5, blend: 1.5 },
    zones: [
      { id: 'title',        shot: true, x: 3.9, y: 1.0, dist: 8.6, horizon: 0.6, toPlay: 2.5 },   // integration: closer (was x 4.6, y 1.15, dist 11): the grooming rabbit was small and low (lead's note 8)
      { id: 'verge',        x0: 0.6,  x1: 30.5, dist: 8.6, height: 1.05, lookAhead: 1.6, runAhead: 2.2, follow: 2.2, minX: 3.6,
        attend: { event: 'vehicle-arrive', x: 'vehicle', w: 0.35, t: 6.0 } },
      { id: 'verge-gate',   x0: 30.5, x1: 38.5, span: [31.0, 39.4], height: 1.10, horizon: 0.58, hold: true },
      { id: 'drain-hold',   x0: 38.5, x1: 43.0, yBelow: -0.5, span: [36.6, 43.8], y: 0.25, hold: true, extendTo: { x1: 45.0, while: 'torch-down' } },
      { id: 'drain',        x0: 43.0, x1: 53.4, yBelow: -0.5, y: 0.0, dist: 7.6, lookAhead: 1.6 },
      { id: 'sump',         x0: 53.4, x1: 57.0, yRamp: [0.0, 1.15] },
      { id: 'courtyard-reveal', shot: true, x: 58.5, dist: 10.5, horizon: 0.64, hold: 3.0, releaseOnMove: 1.5 },
      { id: 'courtyard',    x0: 57.0, x1: 70.0, minX: 58.4 },
      { id: 'courtyard-puzzle', x0: 70.0, x1: 79.0, softHold: [73.9, 75.0], span: [71.0, 77.4],
        attend: { event: 'walkway', x: 81.5, w: 0.3, onlyWhenStill: true } },
      { id: 'courtyard-end', x0: 79.0, x1: 83.5, maxX: 80.3 },
      { id: 'duct-transit', scripted: true, to: { x: 90.4, dist: 10.6, height: 1.3, horizon: 0.60 }, time: 3.6, ease: 'inOutSine' },
      { id: 'search',       x0: 86.0, x1: 113.0, dist: 10.0, height: 1.30, horizon: 0.60, lookAhead: 1.6, follow: 2.2,
        attend: { who: 'searcher', w: 0.35, within: 12.0 } },
      { id: 'search-watch', when: 'rabbit still or hidden, searcher active within 16 m', bias: 0.4, keepRabbitIn: 0.7, maxDist: 11.0, maxDistHidden: 12.5 },
      /* A12: the establishing frame holds through the whole entry (door, skip, fence gap in frame) until the gun lowers */
      { id: 'search-entry-hold', once: true, when: 'entry starts (door light) while the rabbit is left of x 91', x: 109.0, dist: 12.5, horizon: 0.60,
        holdUntil: 'entry-aim-lowered', releaseIfRabbitX: 91.0, ease: 0.6, test: 'held frame at entry t 9.5: gun line, narrowed beam and the gap all on screen' },
      { id: 'search-held-breath', when: 'searcher on the deck above the rabbit, or kneeling within 3 m of its hide', dist: 9.2, height: 1.1, ease: 2.0 },
      /* A13: danger framing replaces the old 6 m chase zone */
      { id: 'danger',       when: 'searcher NOTICE / SPOTTED / AIM / PURSUE within 10 m', fit: ['rabbit', 'searcher'], maxDist: 12.5, edge: 0.15, horizon: 0.58, lookAhead: 1.8, follow: 3.5 },
      { id: 'rest',         x0: 113.0, x1: 129.0, dist: 8.2, height: 1.10, maxX: 123.6 },
      { id: 'rest-intimate', when: 'settle chain running', dist: 5.8, height: 0.62, horizon: 0.58, lookAhead: 0.3, follow: 1.2, ease: 3.0 },
      { id: 'pull-out',     scripted: true, to: { dist: 22.0, height: 3.5, horizon: 0.52, driftX: 2.5 }, time: 8.0, ease: 'inOutSine' },
    ],
  },

  /* decor that matters to the story but has no collision (the world builder places it) */
  decor: [
    { id: 'culvert-mouth', place: 'verge', x: 38.75, note: 'A14: rectangular concrete culvert inlet at the wall foot, part silted; cracked slab; NO bars (visual-target panel 4)' },
    { id: 'strange-gantry', place: 'search', x: 104.0, z: -14, note: 'A24: a tall gantry arm beyond the annex wall that swings a few degrees and stops, every 20 s' },
    { id: 'strange-stack', place: 'search', x: 98.0, z: -22, note: 'A24: a stack whose vapour pulses with the far 4 s thud' },
    { id: 'works', place: 'rest', note: 'the colossal Works revealed by the pull-out; one vast arm moving with the 4 s thud; one tiny amber light far up' },
    { id: 'painted-over', place: 'courtyard', x0: 65.80, x1: 68.58, y0: 0.45, y1: 1.84, z: -5.0,
      note: 'Josh 7 Oct (brief 9, point 7: one restrained detail for this section): hand-sprayed END ANIMAL USE on one back-wall panel (65.42-68.58), buffed out with fresh grey paint that does not match the concrete; the letters ghost through the dry strokes. A decal lit like the wall, no light or camera of its own: it sits between the reveal hold (wall x <= 65.65 at 2:1) and the puzzle span (wall x >= 67.85), so it is only passed. No collision, cover or trigger.' },
  ],
};
