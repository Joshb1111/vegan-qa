/* FAR FIELD — ff-level-s2.js: Sequence 2 level data (FF.S2), THE WORKS (journey beat 4). Pure data: no three.js, no DOM,
   loadable in node. Same shapes as FF.S1 (INTERFACES.md §7), on the SAME lane: x continues from Sequence 1 (the breathing
   space ends at the channel, x 127.2), so Sequence 1 + 2 are one continuous walk with no loading.
   Source: docs/farfield/SEQUENCE-2.md (lead design, 7 Oct). The machines' timelines and the maintenance worker's routine are in
   ff-script-s2.js (FF.S2.works / .painter / .end); rules in ff-rules-s2.js (FF.RULES.works / .painter).
   HOW IT JOINS SEQUENCE 1 (SEQUENCE-2.md §10): FF.Level reads ONE merged lane, FF.LANE = merge(FF.S1, FF.S2) with FF.S2.join
   applied (the S1 entries it removes or amends: the channel-edge stop, the ground beyond x 126.0, the rest's auto-stop, the
   rest camera's maxX, the S1 pull-out no longer ending the game). Arrays are concatenated and sorted by x where S1 sorts them.
   Conventions (Sequence 1): metres; +x right along the journey, +y up, +z towards the camera; the rabbit lives on the lane z 0;
   main floors at y 0; pits dip to y -0.40 and the culvert to y -1.0 (as the drain). Collision is data, never meshes.
   NEW in Sequence 2 (FF.Level needs these; SEQUENCE-2.md §11):
     - DYNAMIC SOLIDS (kind 'press' / 'sluice', field `dynamic`: the machine id): their y0/y1 change every fixed step; FF.Works
       (new, ff-works.js) moves them BEFORE the Player steps. y0/y1 below are the positions at rest (up / shut).
     - shelters[] (the Works' equivalent of covers[]): pits, gaps and safe floors, with cores computed by the shelter rule.
     - checkpoints[].works {P1 | line: phase}: the machine phase a restart puts that station at (like the Search's loopT).
     - camera zone fields maxDist (a zone's own cap above base 12.5) and holdX (the camera stops following). */
'use strict';
window.FF = window.FF || {};

FF.S2 = {
  id: 'sequence-2',
  stepUp: 0.10,
  squeeze: { min: 0.16, max: 0.235, shortMax: 0.6 },

  sections: [
    { id: 'approach', x0: 127.2, x1: 131.0, look: 'works-approach', beat: 4, title: 'The Works' },
    { id: 'tunnel',   x0: 131.0, x1: 136.0, look: 'tunnel',         beat: 4, title: 'the intake' },
    { id: 'hall',     x0: 136.0, x1: 145.7, look: 'hall',           beat: 4, title: 'the press hall' },
    { id: 'culvert',  x0: 145.7, x1: 153.0, look: 'culvert',        beat: 4, title: 'the culvert' },
    { id: 'passage',  x0: 153.0, x1: 167.0, look: 'passage',        beat: 4, title: 'the passage' },
    { id: 'line',     x0: 167.0, x1: 193.8, look: 'line',           beat: 4, title: 'the long hall' },
    { id: 'out',      x0: 193.8, x1: 232.0, look: 'works-out',      beat: 4, title: 'Breathing space' },
  ],
  /* one night, no jumps in time (Sequence 1 A1). The rain comes back as the rabbit crosses the slab (rate 0 -> 0.65 with x,
     never a timer). Every blend happens where light can't be judged: inside the tunnel's creep, through the sluice, on the
     culvert ramp, in the door gaps. */
  lookBlends: [
    { from: 'rest', to: 'works-approach', x0: 127.2, x1: 131.0, continuous: true },
    { from: 'works-approach', to: 'tunnel', x0: 131.2, x1: 132.6 },
    { from: 'tunnel', to: 'hall', x0: 134.2, x1: 135.8 },
    { from: 'hall', to: 'culvert', x0: 145.8, x1: 146.6 },
    { from: 'culvert', to: 'passage', x0: 151.4, x1: 152.8 },
    { from: 'passage', to: 'line', x0: 166.6, x1: 167.2 },
    { from: 'line', to: 'works-out', x0: 193.4, x1: 195.0 },
  ],

  /* ground: [x, y]; a repeated x is a vertical step. REPLACES Sequence 1's ground from x 126.0 on (FF.S2.join.groundFrom). */
  ground: [
    [126.0, 0.00], [127.2, 0.00],
    [129.4, 0.00],                       // the fallen slab across the channel (decor 'channel-slab'): the way on, flat, no jump
    [131.0, 0.00], [136.0, 0.00],        // the far bank, the intake tunnel under the colossal wall
    [140.0, 0.00],                       // the apron (safe)
    [141.0, 0.00], [141.6, -0.40], [142.6, -0.40], [143.2, 0.00],   // PIT A: ramps both sides (walk in, walk out)
    [144.0, 0.00], [144.6, -0.40],       // PIT B: ramp in on the left; its right wall is the SLUICE (145.6) under the bed-end
    [146.12, -0.40], [146.12, -0.34], [146.2, -0.34], [146.2, -1.00],   // the sill beyond the sluice (0.30 clear), then a 0.6 m drop into the culvert (one-way).
                                         // Review fixes 8 Oct: a 6 cm steel angle along the sill's edge (146.12-146.2): walked over from the gate, but a hop
                                         // from the culvert floor (apex 0.52 + the 0.10 step-up) no longer reaches it, so the drop is one-way as designed
    [151.0, -1.00], [153.0, 0.00],       // the culvert under the dividing wall, a silt ramp up into the passage
    [184.2, 0.00], [184.8, -0.40], [186.4, -0.40], [187.0, 0.00],   // PIT C under the great press (ramps both sides). Review fixes 8 Oct: 0.6 m wider on
                                                                    // the exit side (floor to 186.4, was 185.8): a walker meeting the clank at its near lip
                                                                    // has about 1.8 s (2.4 s in the notch) to stop in it, not 1.2
    [208.0, 0.00], [214.0, -2.00], [232.0, -2.40],                  // the embankment: down the wet grass into the fog (ending b)
  ],

  solids: [
    /* the intake: a dark letterbox at the foot of the colossal sloped wall, choked at its end by a fallen steel beam */
    { id: 'tunnel-crown',  x0: 131.0, x1: 136.0, y0: 0.50, y1: 6.0, kind: 'ceiling', note: 'the base of the colossal sloped wall seen from the rest; the tunnel 0.50 tall, dry, the hall\'s draught and a faint cold glow at its end' },
    { id: 'fallen-beam',   x0: 134.0, x1: 136.0, y0: 0.21, y1: 0.50, kind: 'ceiling', note: 'a 2.0 m CREEP (0.75 m/s, Sequence 1 A9) out into the hall. It is the first-sight guarantee: from the trigger at its start, the first press comes down before a rabbit can reach it' },
    /* THE FIRST PRESS (P1) and its bed. Dynamic: FF.Works sets y0 = underside, y1 = underside + 1.60 */
    { id: 'P1',            x0: 140.0, x1: 147.0, y0: 2.60, y1: 4.20, kind: 'press', dynamic: 'P1', z0: -3.0, z1: 0.55,
      note: 'a 7.0 m iron platen, 1.6 m thick, hung from a crosshead 12 m up on two screws behind the lane; its counterweight runs in a shaft at x 137.5 (z -4.2) and carries the sluice. Lower edges chamfered (the shove). A strip lamp along its underside lights its footprint: the lit bed is where it comes down' },
    { id: 'bed-end',       x0: 145.6, x1: 147.0, y0: -0.10, y1: 0.00, kind: 'ceiling', note: 'the bed between pit B and the wall: walked on at y 0 (in the footprint: deadly when the press comes down); its underside roofs the sill beyond the sluice' },
    { id: 'sluice',        x0: 145.6, x1: 145.7, y0: -0.40, y1: -0.10, kind: 'sluice', dynamic: 'sluice',
      note: 'a steel drainage gate in pit B\'s right wall, hung on P1\'s counterweight: it lifts (to 0.30) while the press comes down and closes while it goes up. Solid steel, no bars' },
    { id: 'hall-wall',     x0: 147.0, x1: 151.4, y0: -0.10, y1: 14.0, kind: 'wall', note: 'the dividing wall; P1\'s right end abuts it (no way round); the culvert runs under its footing, 0.90 clear' },
    /* the passage */
    { id: 'paint-pallet',  x0: 155.6, x1: 156.8, y0: 0.26, y1: 0.40, kind: 'ceiling', z0: -0.6, z1: 0.5, note: 'a pallet of paint tins on bricks, closed on the back face: the worker cannot see under it (he never searches)' },
    { id: 'line-door',     x0: 166.6, x1: 167.0, y0: 0.21, y1: 14.0, kind: 'wall', note: 'a steel door ajar on a buckled sill: a duck-under into the long hall; a cold line of light under it' },
    /* THE WALKING PRESSES (Q1, Q2, the great press Q3): one bed, two open gaps between them (G2 wider: a breath before the great press), pit C under Q3 */
    { id: 'Q1',            x0: 169.4, x1: 173.2, y0: 2.60, y1: 4.20, kind: 'press', dynamic: 'Q1', z0: -3.0, z1: 0.55 },
    { id: 'Q2',            x0: 174.8, x1: 178.6, y0: 2.60, y1: 4.20, kind: 'press', dynamic: 'Q2', z0: -3.0, z1: 0.55 },
    { id: 'Q3',            x0: 181.0, x1: 189.0, y0: 3.20, y1: 5.60, kind: 'press', dynamic: 'Q3', z0: -3.4, z1: 0.60, note: 'the great press: 8.0 m, 2.4 m thick, hung higher' },
    { id: 'exit-door',     x0: 193.4, x1: 193.8, y0: 0.20, y1: 14.0, kind: 'wall', note: 'the long hall\'s end wall; a buckled steel door, its bottom corner bent up 0.20: a duck-under, out into the night (rhymes with the Search\'s fence gap)' },
    /* the breathing space */
    { id: 'pipe',          x0: 199.0, x1: 206.0, y0: 0.48, y1: 1.88, kind: 'ceiling', z0: -1.2, z1: 1.0, note: 'a colossal pipe (1.4 m) on concrete saddles behind the lane: a long dark roof over wet grass and clover; drips along its edge' },
  ],

  /* SHELTERS (the Works' covers). A pit's core: the whole body over floor <= FF.RULES.works.shelter.floorMax (-0.26), so the
     platen at y 0 clears the rabbit's back; computed from the ground above (pit A ramps 141.0-141.6 / 142.6-143.2 -> centre
     141.55-142.65, rounded in; pit B ramp 144.0-144.6, right wall 145.6 -> 144.55-145.44; pit C -> 184.75-186.45, review fixes 8 Oct). A gap's
     core: the body clear of both footprints. Floors: outside every footprint. They read from the camera as dark notches in
     the bed's front face (a pit), rain falling through an unlit slot of roof (a gap), unlit floor (a floor). */
  shelters: [
    { id: 'apron',      kind: 'floor', x0: 136.0, x1: 140.0, core: [136.2, 139.84], checkpoint: 'works-apron' },
    { id: 'pit-A',      kind: 'pit',   x0: 141.0, x1: 143.2, floor: -0.40, core: [141.6, 142.6],    under: 'P1', checkpoint: 'works-pitA' },
    { id: 'pit-B',      kind: 'pit',   x0: 144.0, x1: 145.6, floor: -0.40, core: [144.6, 145.44],   under: 'P1', sluice: 'sluice', checkpoint: 'works-pitB',
      note: 'the last refuge under P1 (its right end is the wall); the sluice in its right wall is the way on' },
    { id: 'paint-pallet', kind: 'cover', x0: 155.6, x1: 156.8, y1: 0.26, core: [155.76, 156.64], note: 'blocks the worker\'s sight; watch him from here' },
    { id: 'line-entry', kind: 'floor', x0: 167.0, x1: 169.4, core: [167.2, 169.24], checkpoint: 'works-line' },
    { id: 'G1',         kind: 'gap',   x0: 173.2, x1: 174.8, core: [173.36, 174.64], checkpoint: 'works-g1' },
    { id: 'G2',         kind: 'gap',   x0: 178.6, x1: 181.0, core: [178.76, 180.84], checkpoint: 'works-g2' },
    { id: 'pit-C',      kind: 'pit',   x0: 184.2, x1: 187.0, floor: -0.40, core: [184.75, 186.45], under: 'Q3', checkpoint: 'works-pitC' },
    { id: 'line-exit',  kind: 'floor', x0: 189.0, x1: 193.4, core: [189.16, 193.4] },
    { id: 'pipe',       kind: 'rest',  x0: 199.0, x1: 206.0, y1: 0.48, rest: [200.0, 205.0] },
  ],
  /* sight blockers for the maintenance worker (the A6 test, FF.Level.segmentBlocked over the merged lane) */
  occluders: ['paint-pallet', 'line-door', 'hall-wall'],
  /* his work lamp's spill on the lane (an A6 area light: he must face the rabbit, within 9 m, a clear line from his eye) */
  areaLights: [{ id: 'painter-spill', x0: 158.4, x1: 162.4, on: 'painter-lamp' }],

  /* triggers (Sequence 1's format). Nothing here pushes the player (Sequence 1 A8): the machines run on their own clock, the
     worker on his loop; the staging waits for the rabbit. */
  triggers: [
    { id: 'join-ears',    x0: 126.2, x1: 127.2, event: 'sound-cue', arg: 'works-draught', note: 'the ears and head turn right to the intake\'s draught and the machine beyond; no hint' },
    { id: 'works-first',  x0: 133.9, x1: 136.2, event: 'works-start', note: 'FIRST TIME ONLY: P1 releases now (phase 0) and both clocks start (the line too, heard through the walls). The creep guarantees the first contact comes before the rabbit can reach the footprint (works-sim.mjs: first sight)' },
    { id: 'hall-in',      x0: 136.2, x1: 137.2, event: 'shake-off', note: 'dust and rain off the coat after the creep (only if still)' },
    { id: 'in-culvert',   x0: 146.2, x1: 151.0, yMax: -0.5, event: 'culvert' },
    { id: 'passage-in',   x0: 152.4, x1: 153.6, event: 'painter-start', arg: 2.0, note: 'FIRST TIME ONLY: the worker\'s loop starts at loopT 2.0 (scraping); 6 s later he stops and turns along the lane towards where the rabbit came in, which is dark and 6 m off: the routine is shown before it matters' },
    { id: 'line-out',     x0: 193.8, x1: 194.6, event: 'safe', arg: 'works', note: 'out of the long hall: looks back once (+1.5 s), shakes (+4 s)' },
    { id: 'out-rest',     x0: 200.0, x1: 205.0, event: 'rest', arg: 'works', still: 1.5, alt: { x0: 195.0, x1: 208.0, still: 3.0 },
      note: 'ENDING (a), optional: the settle chain under the pipe -> settled -> 4.0 s -> the pull-out (interruptible) -> fade -> the card' },
    { id: 'out-leave',    x0: 209.0, x1: 232.0, event: 'leave', note: 'ENDING (b): walking on down the embankment: the camera stops (holdX), the rabbit goes on into the fog, fade, the card. Turning back before the fade starts cancels it' },
  ],

  /* checkpoints, after Sequence 1's (rest 116.0). Machine phases at restart (`works`): the restarting shelter is safe at every
     phase; the player sees the danger operate once (a descent and contact) and the next window opens 2.5-7 s after the
     restart (works-sim.mjs, "checkpoints"). Failure restores the last checkpoint reached: progress ones by x, shelter ones
     (pits, gaps) when the rabbit's centre is in that shelter's core, in any order.
     The long hall (fix 8 Oct, round 2): every restart there faces the way on with the press ahead CLANKING 0.25 s after the
     restart, as the picture comes back (the black ends at 0.45 s): its whole telegraph (the clank, the jolt, the water, the
     lamp's flicker), then the fall and the thud 4.25 s after, and the way open 6.84-6.91 s after. It used to restart with
     that press already starting its fall (the clank unheard, under the black): a player who walked on at once met a press
     that looked still and came down 1.9 s after the restart. A direction held through the black never moves the rabbit
     (FF.Events latches it); facing the way on keeps the press ahead in frame (facing back put most of it off-screen). */
  checkpoints: [
    { id: 'works-in',      x: 124.4, y: 0,     face: 1, save: true, note: 'the start for ?start=works / "Continue from the Works": on the rest\'s grass, the slab and the colossal wall ahead' },
    { id: 'works-apron',   x: 137.0, y: 0,     face: 1, works: { P1: 2.0 }, note: 'P1 descending: contact 2.0 s after the restart' },
    { id: 'works-pitA',    x: 142.1, y: -0.40, face: 1, pose: 'hide', when: 'centre in pit A core', works: { P1: 5.0 }, note: 'pressed down over the pit; it rises 3 s after the restart' },
    { id: 'works-pitB',    x: 145.0, y: -0.40, face: 1, pose: 'hide', when: 'centre in pit B core', works: { P1: 21.5 }, note: 'the release 2.5 s after the restart; the sluice passable 6.04 s after' },
    { id: 'works-passage', x: 153.6, y: 0,     face: 1, painter: { loopT: 2.0 } },
    { id: 'works-line',    x: 168.0, y: 0,     face: 1, save: true, works: { line: 3.0 }, note: 'polish pass 8 Oct: Q1 is 1.0 s from its contact when the picture is back (a pressed press to read, GO when it rises); Q2 clanks 3.0 s after the restart, as Q1 rises' },
    { id: 'works-g1',      x: 174.0, y: 0,     face: 1, when: 'centre in G1 core', works: { line: 5.75 }, note: 'Q2 ahead clanks 0.25 s after the restart (Q3 lands as it does); passable 6.91 s after' },
    { id: 'works-g2',      x: 179.8, y: 0,     face: 1, when: 'centre in G2 core', works: { line: 1.75 }, note: 'the great press ahead clanks 0.25 s after the restart; passable 6.84 s after' },
    { id: 'works-pitC',    x: 185.6, y: -0.40, face: 1, pose: 'hide', when: 'centre in pit C core', works: { line: 1.75 }, note: 'the great press clanks 0.25 s after the restart and comes down over the pit, rises (passable 6.84 s after), then walk out right (3.4 m)' },
    { id: 'works-out',     x: 195.2, y: 0,     face: 1, save: true },
  ],

  camera: {
    zones: [
      { id: 'join',        x0: 123.6, x1: 131.0, dist: 8.8, height: 1.15, horizon: 0.58, lookAhead: 1.8, follow: 2.2,
        note: 'replaces the rest zone\'s maxX 123.6: the slab, the channel and the foot of the colossal sloped wall, the intake\'s faint cold glow at rabbit height' },
      { id: 'tunnel',      x0: 131.0, x1: 134.0, dist: 7.8, height: 0.85, horizon: 0.57, lookAhead: 1.4, note: 'in section (near-black cut faces), as the drain' },
      { id: 'hall-arrive', x0: 134.0, x1: 139.6, span: [135.6, 147.6], maxDist: 14.6, height: 1.35, horizon: 0.60, hold: true,
        note: 'the establishing frame of the first press: the apron, the whole bed with its two dark notches, the platen, the wall. A held span (as verge-gate), never control; the edge rule keeps the rabbit in while it creeps out' },
      { id: 'hall-bed',    x0: 139.6, x1: 147.0, span: [138.8, 147.6], height: 1.08, horizon: 0.565, hold: true,
        note: 'world builder 7 Oct night: height 1.30 / horizon 0.60 put the floor at 89% of the frame and slot A / B\'s floor (y -0.40) at its bottom edge; then 0.95 / 0.56 put the hanging platen\'s underside at 16% (from inside the bed the press read as a flat ceiling). Review fixes 8 Oct: 1.08 / 0.565 keeps about half of its front face in frame and the slots\' floor about 9% above the bottom edge' },
      { id: 'culvert',     x0: 145.7, x1: 152.4, yBelow: -0.25, y: -0.20, dist: 7.6, lookAhead: 1.6, note: 'in section, as the drain' },
      { id: 'passage',     x0: 152.4, x1: 166.6, span: [153.4, 163.4], softHold: [157.6, 159.2], height: 1.15, horizon: 0.58,
        note: 'the worker and his patch of wall are in frame while the rabbit waits in the dark: framing for reading his routine; no lean, hold or move towards the wall (no camera emphasis on the sign)' },
      { id: 'line-entry',  x0: 166.6, x1: 169.4, span: [166.6, 180.0], maxDist: 14.6, height: 1.55, horizon: 0.60, hold: true,
        note: 'Q1, G1, Q2 and G2 in one frame: the walk is seen before it is entered (the great press beyond is heard, its lamp at the edge)' },
      { id: 'line',        x0: 169.4, x1: 181.0, dist: 11.0, height: 1.50, horizon: 0.60, lookAhead: 2.6, runAhead: 3.2, follow: 2.2 },
      { id: 'line-great',  x0: 180.6, x1: 189.0, span: [180.0, 190.0], height: 1.00, horizon: 0.58, hold: true, note: 'the great press whole: G2, pit C, both ends. World builder 7 Oct night: height 1.70 / horizon 0.60 put slot C\'s floor below the frame; now the floor at 78%, slot C\'s floor at 86%, the great press\'s underside (3.2) at 44%' },
      { id: 'line-exit',   x0: 189.0, x1: 194.0, dist: 9.0, height: 1.20, horizon: 0.58, lookAhead: 1.6 },
      { id: 'out',         x0: 194.0, x1: 209.0, dist: 8.4, height: 1.10, horizon: 0.57, lookAhead: 1.6 },
      { id: 'out-intimate', when: 'settle chain running under the pipe', dist: 5.8, height: 0.62, horizon: 0.58, lookAhead: 0.3, follow: 1.2, ease: 3.0 },
      { id: 'out-pullout', scripted: true, to: { dist: 22.0, height: 4.0, horizon: 0.52, driftX: 4.0 }, time: 8.0, ease: 'inOutSine', interruptible: true,
        note: 'ending (a): the pipe becomes a crack at the foot of the Works\' far side; across the fog, the long lit building of the next place' },
      { id: 'out-leave',   x0: 209.0, x1: 232.0, holdX: 209.0, dist: 12.4, height: 1.55, horizon: 0.42, note: 'ending (b): the camera stops following; the rabbit walks on down the slope into the fog. Review fixes 8 Oct: held later, higher and wider (was 207.4, dist 8.4, height 1.10, horizon 0.57: the rabbit dropped out of the bottom edge before the fade), so it goes small down the slope with the far lit windows ahead until the fade' },
    ],
  },

  /* decor that matters to the story but has no collision (the world builder places it; SEQUENCE-2.md §4-§9) */
  decor: [
    { id: 'channel-slab',  place: 'approach', x0: 127.0, x1: 129.6, note: 'a precast channel lid slipped across the channel, cracked, weeds in the crack; seen from the rest as the obvious way on (Josh 7 Oct: no invisible walls)' },
    { id: 'works-shell',   place: 'approach', note: 'Sequence 1\'s colossal sloped wall and vast arm, kept as the silhouette from the rest and the pull-out; once the rabbit is inside, its parts in front of the lane (z > -3) are hidden and the halls are seen in section' },
    { id: 'intake-glow',   place: 'approach', x: 131.0, note: 'the intake mouth: a low dark letterbox, a faint cold glow at its far end (the way on at rabbit height), a draught' },
    { id: 'p1-frame',      place: 'hall', x0: 139.6, x1: 147.4, note: 'P1\'s frame behind the lane: two columns, the screws, the crosshead 12 m up in the dark, an amber lamp on the crosshead (people are active here); the counterweight shaft at 137.5 and the cable along the wall to the sluice' },
    { id: 'bed-notches',   place: 'hall', note: 'the bed\'s front face (z +0.40) with the pits cut through it as dark notches; in front of it a gutter at y -0.9 (unplayable) so nothing hides a rabbit in a pit; water drains into the pits after each contact' },
    { id: 'roof-gaps',     place: 'hall', note: 'the hall\'s broken roof: rain falls in shafts lit by high cold lamps, over the apron and the bed' },
    { id: 'culvert-section', place: 'culvert', note: 'the culvert in section under the bed and the wall: near-black cut faces, a trickle, the passage lamp\'s glow at the far end' },
    { id: 'passage-set',   place: 'passage', note: 'a long low service passage (ceiling 3.0 m, back wall z -2.0): pipes and cable trays, an amber bulkhead lamp over the door to the long hall, the worker\'s tripod lamp (x 159.62, z -1.25, 1.5 m up, within his reach, raking across him onto the wall at 161.3: review fixes 8 Oct; was 159.0, z -1.0, aimed at 161.2), his steel trolley (x 158.0, z -0.6, behind the lane), a bucket (161.4, z -0.9), a paint tray and roller leaning on the wall' },
    { id: 'scrubbed-wall', place: 'passage', x0: 158.6, x1: 162.8, y0: 0.85, y1: 1.55, z: -2.0,
      note: 'THE ONE RESISTANCE DETAIL (SEQUENCE-2.md §7): hand-sprayed END ANIMAL USE on the back wall, the same hand and paint as the Courtyard\'s painted-over wall. "END" already under a fresh, still-wet grey patch, ghosting through; "ANIMAL" half scraped to a pale smear where he is working now; "USE" untouched, weathered. Lit only by his own work lamp, as his work needs; no light, sound, camera move, hint or UI of its own' },
    { id: 'line-frames',   place: 'line', note: 'three press frames in one long hall, the great press\'s frame twice the others\' mass; the vast arm seen through the roof gaps; the roof open over G1 and G2 (rain falls there, unlit: dark = safe), each platen\'s footprint lit by its own strip lamp (lit = where it comes down)' },
    { id: 'far-building',  place: 'out', x: 260.0, z: -140, note: 'beat 5 foreshadowed, far across the fog: a long low building with rows of warm windows; every 6 s tiny figures cross the windows all at once, in step. No sound from it' },
    { id: 'embankment',    place: 'out', x0: 208.0, x1: 232.0, note: 'wet grass and rubble sloping down into fog; nothing stops the rabbit, it is the way on (ending b)' },
  ],

  /* per-place looks (partial overrides of FF.LOOK, the FF.LOOKS format in ff-world.js; colours sRGB). One night, rain. */
  looks: {
    'works-approach': {   // the rest's night, the rain coming back: a fresh squall at the foot of the colossal wall
      exposure: 0.9, sky: { color: '#a8b6c4', intensity: 0.42, dir: [-0.45, -0.85, -0.35], softness: 24 },
      ambient: { sky: '#62707d', ground: '#14171a', intensity: 0.5 }, wallFill: { color: '#7d8b99', intensity: 0.5, floor: 0.55, height: 6.0, lean: 0.0, topFade: 0.3 },
      fog: { color: '#252c33', density: 0.016, densityFar: 0.0003, start: 6.0, heightFalloff: 0.02, glow: '#8a96a2', glowPower: 2.2, glowStrength: 0.3 },
      rain: { rate: 0.65, wind: 0.16, len: 0.42, speed: 9.0, bright: 0.45 }, rabbit: { rimStrength: 0.22, lift: 0.010 },
      grade: { saturation: 0.72, contrast: 1.02, lift: [0.027, 0.030, 0.036], gain: [0.99, 1.0, 1.02], vignette: 0.55, bottomWeight: 0.25, grain: 0.03, bloom: 0.28, bloomThreshold: 4.0 },
    },
    tunnel: { exposure: 1.0, sky: { intensity: 0.0 }, ambient: { sky: '#5c6670', ground: '#0f1113', intensity: 0.45 }, wallFill: { color: '#7a8692', intensity: 0.40, floor: 0.6, height: 3.0, lean: 0.0, topFade: 0.25 },
      fog: { color: '#1e2328', density: 0.04, start: 4.0 }, rain: { rate: 0.0 }, rabbit: { rimStrength: 0.32, lift: 0.014 } },
    hall: {               // the press hall at night: the platen's footprint lamp is the key (K0, shadowed); high cold lamps light the rain shafts
      exposure: 1.12, key: { dir: [-0.2, -1.0, 0.35] }, sky: { intensity: 0.0 },
      ambient: { sky: '#55606c', ground: '#0e1012', intensity: 0.5 }, fill: { color: '#9fb0c2', intensity: 0.18, dir: [0.3, -0.85, -0.4] },
      wallFill: { color: '#6f7f90', intensity: 0.50, floor: 0.5, height: 6.0, lean: 0.0, topFade: 0.3 },
      fog: { color: '#1e252b', density: 0.030, densityFar: 0.0012, start: 6.0, heightFalloff: 0.03, glow: '#7f8c99', glowPower: 2.0, glowStrength: 0.6, hall: [143, 6, -30, 18], hallColor: '#66737f', hallStrength: 0.28 },
      rain: { rate: 0.45, wind: 0.05, len: 0.42, speed: 9.0, bright: 0.6 }, rabbit: { rimStrength: 0.38, lift: 0.055 },
      grade: { saturation: 0.70, contrast: 1.05, lift: [0.026, 0.030, 0.037], gain: [0.99, 1.0, 1.02], vignette: 0.62, bottomWeight: 0.32, grain: 0.034, bloom: 0.32, bloomThreshold: 4.0 },
      lights: { pressLamp: { color: '#dfe6ec', intensity: 18, angle: 62, penumbra: 0.5 }, highBay: { color: '#cfd8e0', intensity: 6 }, amber: { color: '#ffae4a', intensity: 0.8 }, sluiceGlow: { color: '#d6dee6', intensity: 11 } },
    },
    culvert: { exposure: 1.0, sky: { intensity: 0.0 }, ambient: { sky: '#5f6a74', ground: '#0f1113', intensity: 0.5 }, wallFill: { color: '#7d8995', intensity: 0.42, floor: 0.6, height: 3.0, lean: 0.0, topFade: 0.25 },
      fog: { color: '#20262b', density: 0.04, start: 4.0 }, rain: { rate: 0.0 }, rabbit: { rimStrength: 0.32, lift: 0.014 } },
    passage: {            // low, dry, close: the worker's tripod lamp on the wall (K0, shadowed: his and the rabbit's shadows fall on the wall), one amber bulkhead
      exposure: 1.08, sky: { intensity: 0.0 }, ambient: { sky: '#58636e', ground: '#0f1113', intensity: 0.48 }, fill: { color: '#9fb0c2', intensity: 0.08, dir: [0.3, -0.85, -0.4] },
      wallFill: { color: '#73828f', intensity: 0.46, floor: 0.5, height: 3.0, lean: 0.0, topFade: 0.3 },
      fog: { color: '#1b2126', density: 0.025, start: 5.0, glowStrength: 0.4 }, rain: { rate: 0.0 }, rabbit: { rimStrength: 0.28, lift: 0.025 },
      grade: { saturation: 0.70, contrast: 1.04, lift: [0.026, 0.030, 0.036], gain: [0.99, 1.0, 1.02], vignette: 0.60, bottomWeight: 0.3, grain: 0.033, bloom: 0.3, bloomThreshold: 4.0 },
      lights: { workLamp: { color: '#e6ecf1', intensity: 5.6, angle: 50, penumbra: 0.5 }, amber: { color: '#ffae4a', intensity: 0.7 }, doorLine: { color: '#d6dee6', intensity: 3 } },
    },
    line: {               // the long hall: the same night as the press hall, bigger; three footprint lamps; rain falls in the unlit gaps
      exposure: 1.12, key: { dir: [-0.2, -1.0, 0.35] }, sky: { intensity: 0.0 },
      ambient: { sky: '#55606c', ground: '#0e1012', intensity: 0.5 }, fill: { color: '#9fb0c2', intensity: 0.16, dir: [0.3, -0.85, -0.4] },
      wallFill: { color: '#6f7f90', intensity: 0.50, floor: 0.5, height: 7.0, lean: 0.0, topFade: 0.3 },
      fog: { color: '#1d2329', density: 0.030, densityFar: 0.0012, start: 7.0, heightFalloff: 0.03, glow: '#7f8c99', glowPower: 2.0, glowStrength: 0.6, hall: [182, 8, -34, 24], hallColor: '#66737f', hallStrength: 0.30 },
      rain: { rate: 0.5, wind: 0.05, len: 0.42, speed: 9.0, bright: 0.55 }, rabbit: { rimStrength: 0.42, lift: 0.065 },
      grade: { saturation: 0.70, contrast: 1.05, lift: [0.026, 0.030, 0.037], gain: [0.99, 1.0, 1.02], vignette: 0.62, bottomWeight: 0.32, grain: 0.034, bloom: 0.32, bloomThreshold: 4.0 },
      lights: { pressLamp: { color: '#dfe6ec', intensity: 18, angle: 62, penumbra: 0.5 }, greatLamp: { color: '#dfe6ec', intensity: 26, angle: 66, penumbra: 0.5 }, amber: { color: '#ffae4a', intensity: 0.8 }, exitLine: { color: '#b8c4d0', intensity: 3 } },
    },
    'works-out': {        // outside again: rain easing to a drizzle, the moon only a glow through cloud, the far building's warm windows
      exposure: 0.92, key: { dir: [-0.42, -0.42, 0.8] }, sky: { color: '#a8b6c4', intensity: 0.42, dir: [-0.45, -0.85, -0.35], softness: 26 },
      ambient: { sky: '#64717e', ground: '#15181b', intensity: 0.5 }, fill: { color: '#93a3b5', intensity: 0.10, dir: [-0.3, -0.6, -0.7] },
      wallFill: { color: '#7f8d9b', intensity: 0.46, floor: 0.55, height: 4.5, lean: 0.0, topFade: 0.3 },
      fog: { color: '#262d34', density: 0.011, densityFar: 0.00005, start: 7.0, heightFalloff: 0.0, glow: '#8e9aa6', glowPower: 2.4, glowStrength: 0.3, hall: [262, 20, -140, 120], hallColor: '#6b6458', hallStrength: 0.22 },
      rain: { rate: 0.15, wind: 0.1, len: 0.36, speed: 8.0, bright: 0.4 }, rabbit: { rimStrength: 0.14, lift: 0.009 },
      grade: { saturation: 0.75, contrast: 1.0, lift: [0.028, 0.031, 0.036], gain: [0.99, 1.0, 1.02], vignette: 0.5, bottomWeight: 0.2, grain: 0.025, bloom: 0.25, bloomThreshold: 4.0 },
    },
  },

  /* THE JOIN: what merging Sequence 2 onto Sequence 1's lane removes or amends in FF.S1 (SEQUENCE-2.md §10). FF.S1's file is
     not edited; FF.Level applies this when it builds FF.LANE. */
  join: {
    groundFrom: 126.0,                                      // S1 ground points with x >= 126.0 are replaced by FF.S2.ground
    removeSolids: ['channel-edge'],                         // the "not yet" stop at the channel lip (Josh 7 Oct: it felt like an invisible wall)
    sections: { rest: { x1: 127.2 } },
    triggers: { rest: { alt: { x0: 116.0, x1: 127.0, still: 3.0 }, autoStopAfter: null } },   // the S1 settle never fires in Sequence 2; no auto-stop
    camera: { rest: { x1: 124.6, maxX: null }, 'pull-out': { interruptible: true, endsGame: false, holdAfter: 3.0, returnTime: 4.0 } },
    player: { channelLip: false, restAutoStop: false, settleLocksInput: false },
    end: { s1: 'settled -> 4.0 s -> the pull-out to the Works (interruptible), held 3 s, eased back 4 s; no fade, no card',
           s2: 'FF.S2.end: the card, back to the title, save "completed"' },
    saves: { key: 'ff-progress', order: ['courtyard', 'search-arrive', 'rest', 'works-in', 'works-line', 'works-out', 'completed'],
             migrate: { from: 'ff-s1-progress', map: { completed: 'works-in' } } },
    start: { query: 'start=works', checkpoint: 'works-in', title: 'Begin at the Works' },
  },
};
