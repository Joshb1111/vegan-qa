/* FAR FIELD — ff-script-s1.js: Sequence 1 scripted beats and the searcher's routine, as data (FF.S1.searcher / .verge /
   .walkway). Pure data: no three.js, no DOM, loadable in node (load after ff-level-s1.js).
   Source: docs/farfield/SEQUENCE-1.md §6, §7.2, §9.3-9.4, AS AMENDED on 7 Oct (A4, A8, A10, A12, A14, A16).
   OWNER: the humans + events builder (ff-ai.js, ff-events.js read it). The searcher's loop changes only with the Search
   checker re-run (docs/farfield/checks/). */
'use strict';
window.FF = window.FF || {};
FF.S1 = FF.S1 || {};

/* THE SEARCHER (beat 3). A16: path on the floor at z -1.15 (behind every cover), deck top at y 0.85. Floor reach: x >= 98.0
   by walking; 90.0..92.0 only by stepping down off the deck's left end in a pursuit (0.8 s). Never the arrival nook
   (x < 90.0). His torch yaws so its axis meets the lane (z 0) at the 2D aim point. */
FF.S1.searcher = {
  pathZ: -1.15,
  nodes: {
    N0: [110.0, 0.00, -3.0],   // door in the annex wall
    N1: [110.0, 0.00, -1.15],
    N2: [108.2, 0.00, -1.15],  // 1.0 m right of the skip: the crouch-look
    N3: [99.4,  0.00, -1.15],  // foot of the steps (behind the lane)
    N4: [98.0,  0.85, -1.15],  // top of the steps
    N5: [93.0,  0.85, -1.15],  // above the rabbit's hide: the look at the duct mouth
  },
  floorMinX: 90.0,
  /* entry, first time only: starts 1.5 s after the rabbit lands. 8.0 s. It is THE DOOR REVEAL (Josh's playtest, 7 Oct §9.5:
     the one camera takeover, run by FF.Events). v2 review fixes: the camera leaves the rabbit only 0.85 s after it has
     stopped (its reaction is seen) and eases 1.5 s to the door, so the door light and footsteps last 1.95 s and the door
     opens as the camera arrives; the camera starts back 1.1 s into the aim demonstration and control returns as it settles,
     6.4-6.5 s after the cue. Same beats, same order, same nodes as the first build. The second turn is a turn-sweep (it does
     not clatter the fence again) and covers the reveal's 1.2 s grace; then the loop. */
  entry: [
    ['cue', 1.95, 'N0', 'line of light under the door, a torch beam moving behind its small window, footsteps'],
    ['doorway', 0.45, 'N0', 'silhouette in the door: cap, coat, backpack, long gun slung, torch (polish pass 8 Oct: the door bursts open in 0.16 s, so the silhouette is 0.15 s shorter and the step-in 0.15 s longer: the reveal still takes about 6.4 s)'],
    ['step-in', 1.05, 'N1'],
    ['sweep-left', 0.2, 'N1', 'a glance down the yard'],
    ['turn', 0.45, 'N1', 'the fence corner clatters (wind); they turn to it'],
    ['aim-demo', 2.0, 'N1', 'raise 0.5, beam 13 -> 5 deg on the gap, click, hold 1.0, lower 0.5: NO SHOT. Lights the exit. Ends = entry-aim-lowered'],
    ['turn-sweep', 1.9, 'left', 'turns away from the fence (the torch down while turning), sweeps; covers the reveal\'s grace; then the loop'],
  ],
  /* the loop, 47.85 s, repeats exactly: [action, to node | seconds, speed m/s | facing]. v2 review fixes: the deck look (A10:
     6.0 s) is 9.0 s, because the default movement is now the cautious walk (0.95 m/s): a careful walk out of the deck core
     1-2 s into his look reaches the pallet core before he turns (the Search checker's WALK checks), as the 6 s look allowed
     at the old running pace. Everything after it is 3.0 s later. */
  loop: [
    ['walk-search', 'N2', 1.0],            //  0.00- 1.80
    ['crouch-look', 3.3, 'left'],          //  1.80- 5.10 stop 0.3, kneel 0.8 (torch up), look 1.6 under the skip, stand 0.6
    ['walk-search', 'N3', 1.0],            //  5.10-13.90
    ['climb', 'N4', 1.4],                  // 13.90-15.30
    ['walk-search', 'N5', 1.0],            // 15.30-20.30 over the deck, above the hide
    ['look', 9.0, 'left'],                 // 20.30-29.30 THE MAIN WINDOW: looking down-left at the duct mouth
    ['turn', 1.0],                         // 29.30-30.30
    ['walk-search', 'N4', 1.0],            // 30.30-35.30
    ['descend', 'N3', 1.4],                // 35.30-36.70
    ['walk-patrol', 'N1', 1.3],            // 36.70-44.85 walking away to the right
    ['turn-sweep', 3.0, 'left'],           // 44.85-47.85 turn 1.0, sweep 2.0 (pitch -35 -> -8 -> -35)
  ],
  loopT: 47.85,
};

/* THE VERGE: the vehicle and the person (no fail; A8: nothing pushes the player, the staging loops while they linger).
   t = 0 when the rabbit first crosses x 21.0 */
FF.S1.verge = {
  vehicle: { pathZ: -8.5, fromX: -12.0, turnAtX: 29.5, stop: [33.0, -6.8], stopAt: { t: 6.0, orRabbitX: 29.0, notBefore: 3.5 }, turn: 3.0 },
  gate: { x0: 31.0, x1: 35.0, z: -4.0, height: 1.7, bottomGap: 0.22, seam: 33.0, crack: 0.8 },
  beforeDrop: { doorSlam: 1.0, boots: [1.4, 3.4], bootsInGlare: 3.0, rattleFrom: 3.5, rattleBurst: [1.2, 2.0], rattlePause: [0.5, 1.5],
                rattleLoops: true,   // A8: the chain keeps rattling for as long as the rabbit stays on the verge (no give-up)
                glareReaction: { silence: 1.0, then: 'rattle resumes harder, the gate jolts', cooldown: 4.0 } },
  personOut: 'max(drop + 0.6, stop + 4.0)',
  /* after the drop. A14: the torch never lands on the rabbit. It comes down the crack only once the person is kneeling AND
     the rabbit is >= 0.6 m into the squeeze pipe (event 'rabbit-in-pipe', x >= 40.2); it lights only the chamber floor
     38.5-39.0 (the overhang 39.0-39.6 and the pipe stay dark) and withdraws at once if the rabbit heads back past 39.3.
     Until then the person waits at the inlet (scrapes at the slab, the torch searching the grass, never into the hole). */
  afterDrop: [
    ['lock-gives', 0.0], ['gate-crack', 0.6], ['step-out', 0.6], ['walk', 38.0, 1.8], ['kneel', 0.5],
    ['wait-for', 'rabbit-in-pipe', { loop: 'scrape at the broken slab; torch sweeps the grass around the inlet' }],
    ['torch-down', 3.0, { shaft: [38.5, 39.0], withdrawIfRabbitX: 39.3 }],
    ['reach-in', 1.2, 'A11: an arm into the crack; the hand falls short of the overhang (teaches: deep inside = out of reach)'],
    ['stand', 0.8], ['walk-sweep', 27.0, 0.9], ['walk', 33.0, 1.3], ['gate-close', 1.0],
    ['vehicle-leave', 0, 'its lights pass over the slab gap at 46'],
  ],
  giveUp: null,   // A8: removed
};

/* THE COURTYARD: the walkway worker (A4: unarmed, no torch; a coil of cable; walks, pauses at the rail looking away, leaves;
   never reacts to the rabbit or the box). t = 0 at the walkway trigger */
FF.S1.walkway = { z: -14.45, deckY: 3.6, doorL: 78.0, rail: 81.0, doorR: 85.0, speed: 1.3,
  t: { boots: [0.0, 2.5], doorOpen: 2.5, amberOn: 2.5, out: 3.0, atRail: 5.3, leaveRail: 7.8, atDoorR: 10.9, doorShut: 11.5, worksThud: 13.5 },
  railNote: 'stops facing AWAY from the hall, out over the far haze (a slow searchlight, a distant horn); never reacts to the rabbit or the box',
  thud: { every: 4.0, note: 'the far Works thud: begins at worksThud, continues quietly through the Search and the rest' } };
