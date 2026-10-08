/* FAR FIELD — ff-rules-s2.js: Sequence 2 (THE WORKS) rules, added to FF.RULES. Pure data: no three.js, no DOM, loadable in
   node (load AFTER ff-rules.js; nothing in FF.RULES from Sequence 1 is changed, only new keys are added).
   Source: docs/farfield/SEQUENCE-2.md (lead design, 7 Oct). Geometry, shelters, triggers, checkpoints, camera: FF.S2
   (ff-level-s2.js). The machines' timelines and the maintenance worker's routine: FF.S2.works / FF.S2.painter (ff-script-s2.js).
   The machine numbers change only with the Works checker re-run (docs/farfield/checks/works-sim.mjs, later its port
   public/farfield/tools/check-works.mjs, which must read these files and FF.Works, never a copy).
   Units: metres and seconds. The rabbit's moves are Sequence 1's, unchanged (FF.RULES.rabbit): the cautious walk 0.95 m/s,
   Shift + a direction runs 2.75, Down crouches (0.75), squeezes cap the speed (a duck-under 1.6, the creep 0.75). Sequence 2
   needs no jump at all and no new move. */
'use strict';
window.FF = window.FF || {};
FF.RULES = FF.RULES || {};

FF.RULES.works = {
  beat: 4.0,                     // the Works heartbeat: the far thud heard every 4 s since the Courtyard. Every machine contact lands on it
                                 // (P1 every 24 s = 6 beats; the long hall's presses a bar of 4 beats = 16 s: clank, thud, thud, thud)

  /* EVERY PRESS HAS THE SAME GRAMMAR (taught by the first press, P1; used again by the three walking presses Q1-Q3).
     Phase marks per machine are in FF.S2.works (release 0, descent 2, contact 4, rise, up). The underside height y over a cycle:
       RELEASE  [0, release):  the telegraph. At 0 a deep clank; the platen drops `jolt` within `joltTime`; a sheet of rainwater
                               spills off its top front edge; the counterweight high up lurches; a groan rises. y = upY - jolt.
       DESCENT  [release, contact): u = (t - release) / descent;  y = (upY - jolt) * (1 - u*u)   (slow to start, slamming at the end)
       CONTACT  at `contact`: THE THUD (the heartbeat, close). y = 0. Sheets of water burst out from under the edges.
       DOWN     [contact, rise): y = 0, pressing; a hiss.
       RISE     [rise, up): v = (t - rise) / (up - rise);  y = upY * (1 - cos(PI v)) / 2.  NEVER lethal (it only goes up).
       UP       [up, period): y = upY. Stillness: rain drumming on its top, drips from its edges. The safe interval. */
  press: {
    release: 2.0, jolt: 0.06, joltTime: 0.15,
    descent: 2.0,
    /* THE CUT (non-graphic failure, as in Sequence 1 §10): on the step when a DESCENDING platen's underside comes within
       lethalMargin of the rabbit's back (y < rabbit.y + h + lethalMargin; h = hStand, or hLow when the rabbit is crouched or
       low) while the rabbit's CENTRE is inside the footprint by more than centreInset: fail {kind: 'machine', by: id}.
       With these numbers that is ~0.02 s (2 fixed steps) before contact: the last drawn frame shows the iron a hand's breadth
       above the rabbit, then black. Measured from the RELEASE cue: 3.89 s (P1, Q1, Q2) and 3.91 s (Q3) for a standing rabbit. */
    lethalMargin: 0.04, centreInset: 0.02, hStand: 0.24, hLow: 0.15,
    /* THE CHAMFER SHOVE (fairness at the edges; involuntary, 0.12 s): if only the body overlaps the footprint (its centre is
       outside) when the underside reaches the same height, the platen's chamfered lower edge pushes the rabbit clear to the
       side its centre is on (to x0 - hw - clear or x1 + hw + clear), with the 0.15 s startle. No harm. If that side is a wall,
       the cut applies instead (P1's right end abuts the dividing wall). */
    shove: { time: 0.12, clear: 0.01 },
    passClear: 0.30,             // while RISING, a rabbit may go under once the underside clears this (the checker's "passable")
    shake: { amp: 0.012, time: 0.25, within: 6.0 },   // a tiny camera shake at a contact within 6 m (physical feedback, not a takeover)
    flinchWithin: 6.0,           // the rabbit's 0.15 s additive startle at a contact within 6 m (control kept)
  },

  /* THE SLUICE (a steel drainage gate in the right wall of pit B, under the first press's bed): it is hung on the first press's
     counterweight, so it lifts while the press comes DOWN and closes while the press goes UP. The way on is under the machine,
     in its moment of pressing. Gap g above the pit floor over P1's cycle:
       RELEASE  g = jolt * min(1, t / press.joltTime)                    (a clank: it jumps 1 cm, a thin line of light under it)
       DESCENT  g = jolt + (open - jolt) * u*u                            (rises with the counterweight as the platen falls)
       DOWN     g = open                                                  (4.0 s held open: cold light and a draught flood pit B)
       RISE     g = open * (1 + cos(PI v)) / 2                            (closes slowly, 4.0 s)
       UP       g = 0
     The cut: while CLOSING, the rabbit's centre within lethalBand of the sluice's x-span and g < h + lethalMargin (the rabbit
     is low under it: h = press.hLow). Otherwise the chamfer shove pushes it to the nearer side. Passable while g >= passClear. */
  sluice: { open: 0.30, jolt: 0.01, lethalBand: 0.08, passClear: 0.18 },

  /* SHELTERS: a pit is safe where the whole body stands over floor at or below floorMax (the platen stops at y 0; a standing
     rabbit's back is then >= 0.02 below it, a low one >= 0.11). Cores in FF.S2.shelters are computed with this rule. A gap
     between two presses is safe where the whole body is clear of both footprints. The bed's pits are drainage slots the
     water drains into; they read from the camera as dark notches through the bed's front face. */
  shelter: { floorMax: -0.26, pitDepth: 0.40 },

  /* FAIRNESS, as checked by works-sim.mjs (and later check-works.mjs): a first-timer's reaction is 0.6 s after an unmistakable
     cue (the RELEASE). From ANY point under ANY press at the release cue, a rabbit at the CAUTIOUS WALK reaches safety with at
     least minMarginWalk to spare (a run: minMarginRun). Every crossing in Sequence 2 is possible at the walk. No jump is needed
     anywhere. Leaving any shelter on the first chance (passable + reaction) and walking on never meets a release away from a
     shelter it can reach. */
  fairness: { reaction: 0.6, minMarginWalk: 0.9, minMarginRun: 2.0, maxDistToSafety: 1.9 },

  /* FIRST SIGHT ("show the mechanism operating before asking the player to risk entering it"): the first press releases when
     the rabbit starts the creep at the tunnel's end (trigger works-first); a rabbit that creeps out and then runs flat out
     reaches the press's footprint only after the first contact. */
  firstSight: { trigger: 'works-first', minLeadOverContact: 0.3 },
};

/* THE MAINTENANCE WORKER (the one resistance detail of Sequence 2: SEQUENCE-2.md §7). Unarmed: no gun, no torch, no backpack.
   He scrapes and paints over hand-sprayed END ANIMAL USE on the service passage's back wall, absorbed, his back to the lane.
   He sees with Sequence 1's one detection model (A6: FF.AI.see with his pose; his lamp's spill on the lane is an area light,
   FF.S2.areaLights 'painter-spill'; solid cover blocks; darkness only shortens the range), but ONLY while he faces along the
   lane (turned to his trolley, FF.S2.painter.sightFacing); facing the wall he sees nothing of the lane. Noise never matters.
   NOTICE (suspicion >= FF.RULES.sight.fill.notice) starts "the look" and nothing else: there is no SPOTTED, no pursuit, no
   grab, no failure. A tense moment, never a death. */
FF.RULES.painter = {
  eye: 1.62, strokeHz: 1.5, hardStrokeHz: 2.2,
  look: { still: 0.3, turnTo: 0.6, lift: 0.5, hold: 2.0, holdAgain: 1.0, lower: 0.6, hang: 0.5, turnBack: 0.8, hardScrape: 8.0 },
  neverFollows: true, neverFails: true,
};

/* the machine failure presentation (as Sequence 1's caught / shot: SEQUENCE-1.md §10; the same timings) */
FF.RULES.fail = FF.RULES.fail || {};
FF.RULES.fail.machine = { black: 0.80, fadeIn: 0.45, controlAt: 1.0, sound: 'contact-muffled', tail: 1.2, rabbitSound: false };

/* the ears are the HUD (Sequence 1 §4.2): salience weights for the Works' sounds, used like FF.RULES.behave.ears */
FF.RULES.behave = FF.RULES.behave || {};
FF.RULES.behave.earsWorks = { release: 0.9, descent: 0.8, contact: 1.0, contactDecay: 2.0, rise: 0.4, sluice: 0.6, draught: 0.5, scrape: 0.7, scrapeStops: 1.0 };
