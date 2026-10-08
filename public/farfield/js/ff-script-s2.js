/* FAR FIELD — ff-script-s2.js: Sequence 2 (THE WORKS) machine timelines, the maintenance worker's routine and the ending, as
   data (FF.S2.works / .painter / .end). Pure data: no three.js, no DOM, loadable in node (load after ff-level-s2.js).
   Source: docs/farfield/SEQUENCE-2.md §5-§9. The press grammar (how the underside moves through release, descent, contact,
   down, rise, up) and the sluice's gap are defined in FF.RULES.works (ff-rules-s2.js). Timelines change only with the Works
   checker re-run (docs/farfield/checks/works-sim.mjs).
   ONE CLOCK: both stations run on the Works heartbeat (4.0 s). Every contact lands on a beat: P1 every 24 s (6 beats), the long
   hall's presses one bar of 4 beats (16 s: the clank of Q1's release, then thud, thud, thud as Q1, Q2 and Q3 come down in
   turn, left to right: "the machine walks"). Both clocks start at the trigger works-first (the creep out of the intake);
   a restart sets the restarting station's phase from the checkpoint (FF.S2.checkpoints[].works). */
'use strict';
window.FF = window.FF || {};
FF.S2 = FF.S2 || {};

FF.S2.works = {
  /* THE FIRST PRESS. Phase marks (s) in its 24 s cycle: release 0 (the clank and jolt) -> descent 2 -> CONTACT 4 (the thud) ->
     held down 4 s -> rise 8 (4 s, never lethal) -> up 12 -> 24 (12 s of stillness: the safe interval). Its first release
     comes at works-first. Lethal from 3.89 s after the release (a standing rabbit outside a pit). */
  P1: { id: 'P1', solid: 'P1', x0: 140.0, x1: 147.0, upY: 2.60, thick: 1.60, period: 24.0,
        marks: { release: 0.0, descent: 2.0, contact: 4.0, rise: 8.0, up: 12.0 },
        anchor: { trigger: 'works-first', phase: 0.0 }, rightWall: 'hall-wall',
        lamp: { slot: 'K0', pool: 'its footprint, brighter and tighter as it comes down' } },

  /* THE SLUICE in pit B's right wall, hung on P1's counterweight (FF.RULES.works.sluice): opening during P1's descent
     (passable from P1 phase 3.53), held open while P1 presses (4-8), closing during P1's rise (the cut from 9.66): 6.1 s of every 24. */
  sluice: { id: 'sluice', solid: 'sluice', follows: 'P1', x0: 145.6, x1: 145.7, floorY: -0.40, top: -0.10 },

  /* THE WALKING PRESSES. One 16 s bar; each platen's marks are relative to its own offset: release 0 -> descent 2 -> CONTACT 4
     -> held down 2 s -> rise 6 (3 s) -> up 9 -> 16 (7 s still). Offsets one beat apart, left to right. Lethal from 3.89 s
     (Q1, Q2) and 3.91 s (Q3) after each release; passable (rising, underside >= 0.30) from 6.66 (Q1, Q2) / 6.59 (Q3).
     A walker who leaves the entry floor on Q1's first passable moment (+0.6 s reaction) and keeps walking reaches pit C
     exactly as the great press releases: the designed climax (works-sim.mjs, "the continuous walker"). */
  line: { period: 16.0, anchor: { trigger: 'works-first', phase: 0.0 },
          marks: { release: 0.0, descent: 2.0, contact: 4.0, rise: 6.0, up: 9.0 },
          platens: [
            { id: 'Q1', solid: 'Q1', x0: 169.4, x1: 173.2, offset: 0.0, upY: 2.60, thick: 1.60, lamp: 'pressLamp' },
            { id: 'Q2', solid: 'Q2', x0: 174.8, x1: 178.6, offset: 4.0, upY: 2.60, thick: 1.60, lamp: 'pressLamp' },
            { id: 'Q3', solid: 'Q3', x0: 181.0, x1: 189.0, offset: 8.0, upY: 3.20, thick: 2.40, lamp: 'greatLamp', name: 'the great press' },
          ] },
};

/* THE MAINTENANCE WORKER in the service passage (the one resistance detail, SEQUENCE-2.md §7). One stand-in human, role
   'painter': cap and work coat, NO gun, NO torch, NO backpack; a long-handled wire scraper, a bucket, a tripod work lamp.
   He stands at x 160.4, z -1.45, facing the back wall (z -2.0) with his back to the lane, scraping END ANIMAL USE off it.
   His 12 s loop starts at loopT 2.0 when the rabbit first comes up the culvert ramp (trigger passage-in).
   [kind, seconds, facing]: facing 'wall' sees nothing of the lane; 'left' is along the lane (-x), towards where the rabbit
   comes from: he turns to his trolley for a fresh scraper / rag. Sight counts (FF.RULES.painter, the A6 model) only between
   sightFacing.from and .to (from the middle of the turn left to the middle of the turn back). The telegraph: the scraping
   STOPS (0.5 s of silence: Sequence 1's own cue, silence = attention), he straightens, then turns (0.8 s, head first). */
FF.S2.painter = {
  x: 160.4, z: -1.45, wallZ: -2.0, role: 'painter',
  loop: [
    ['scrape', 8.0, 'wall'],      //  0.0- 8.0  absorbed: the scraping sound (1.5 strokes/s), dips now and then
    ['stop', 0.5, 'wall'],        //  8.0- 8.5  the scraping stops; he straightens and lowers the scraper (silence)
    ['turn', 0.8, 'left'],        //  8.5- 9.3  turns left along the lane, head first
    ['reach', 1.6, 'left'],       //  9.3-10.9  takes a rag from the trolley at 158.0, looks along the lane
    ['turn', 0.8, 'wall'],        // 10.9-11.7  back to the wall
    ['dip', 0.3, 'wall'],         // 11.7-12.0  dips the scraper; the scraping starts again
  ],
  loopT: 12.0,
  sightFacing: { from: 8.9, to: 11.3, face: -1 },
  anchor: { trigger: 'passage-in', loopT: 2.0 },
  /* review fixes 8 Oct: the tripod within his reach (0.81 m from his shoulder; it stood 1.4 m off, so in the look the lamp
     swung round on its stand while his arm pointed into the air). It still rakes across him onto the wall to his right, so he
     stands lit with his shadow thrown over the far letters, as before; nearer the wall, so a little dimmer and wider */
  lamp: { stand: [159.62, 1.5, -1.25], aim: [161.3, 1.2, -2.0], slot: 'K0', spill: 'painter-spill' },
  /* THE LOOK (on NOTICE; FF.RULES.painter.look): he stops dead, turns fully to face the rabbit (left, or right if it is behind
     him), lifts the lamp off its tripod and holds its cold light on the rabbit, utterly still, 2.0 s (1.0 s if it happens
     again); lowers it, hangs it back, turns to the wall and scrapes again, harder (2.2 strokes/s) for 8 s; then the loop.
     He never steps towards it, follows, calls out or reaches. Control is the player's throughout. No failure is possible. */
  look: [['still', 0.3], ['turn-to', 0.6], ['lift-lamp', 0.5], ['hold', 2.0], ['lower', 0.6], ['hang', 0.5], ['turn', 0.8, 'wall'], ['scrape-hard', 8.0]],
};

/* THE END OF SEQUENCE 2 (the end card moves here from Sequence 1; Josh 7 Oct: the end of a section must never feel like an
   invisible wall). Two ways, either one ends it; neither locks the player before it commits:
     (a) REST: the settle chain under the pipe (Sequence 1's, §11) -> settled -> 4.0 s -> the pull-out (8 s) to the long lit
         building across the fog. Any movement before the fade starts eases the camera back and returns control (the loaf
         is left as in Sequence 1). After the pull-out: fade 2.0 s, 0.5 s black, the card.
     (b) WALK ON: down the embankment. At x 209.0 the camera stops following (out-leave, holdX 207.4) and the rabbit walks on
         into the fog under the player's own control; at x 211.0 (or 4.0 s after 209.0 while still moving on) the fade starts
         (2.5 s) and commits. Turning back above 208.5 before then cancels it and the camera follows again.
   The card: "to be continued" (as Sequence 1), then the title; the save becomes "completed". */
FF.S2.end = {
  rest: { trigger: 'out-rest', loafHold: 4.0, pullout: 'out-pullout', fade: 2.0, black: 0.5, interruptibleUntil: 'fade' },
  leave: { trigger: 'out-leave', holdAt: 209.0, fadeAtX: 211.0, fadeAfter: 4.0, fade: 2.5, cancelBelowX: 208.5 },
  card: { text: 'to be continued', fadeIn: 1.0, hold: 3.5, fadeOut: 1.0, skipAfter: 1.0 },
  save: 'completed',
};
