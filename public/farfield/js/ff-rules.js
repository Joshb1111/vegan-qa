/* FAR FIELD — ff-rules.js: Sequence 1 rules (FF.RULES). Pure data: no three.js, no DOM, loadable in node.
   Source: docs/farfield/SEQUENCE-1.md Appendix A, AS AMENDED on 7 Oct (Josh's approval + the design critic's verified issues;
   see "Amendments" at the top of SEQUENCE-1.md, A1-A24). Geometry, camera zones and checkpoints: FF.S1 (ff-level-s1.js).
   The searcher's path and the scripted beats: FF.S1.searcher / .verge / .walkway (ff-script-s1.js).
   OWNER: architect / integrator. FROZEN while the four builders work in parallel: a builder that needs a number changed
   overrides it in ITS OWN file in one block marked  RULES OVERRIDE (fold into ff-rules.js at integration)  and lists it in
   its report. Perception and searcher numbers change only with the Search checker re-run (docs/farfield/checks/). */
'use strict';
window.FF = window.FF || {};

FF.RULES = {
  rabbit: {
    walk: 1.15, run: 2.75, runAfter: 0.30, runRamp: 0.55,
    flee: 3.6, fleeRamp: 0.4, fleeWithin: 15, fleeRunsAtOnce: true,       // only while a searcher is SPOTTED / PURSUE / AIM / GRAB within 15 m (the Search only)
    crouch: 0.75,
    /* squeezes (A9): clearance 0.16-0.235 m. A squeeze no longer than shortMax (the hoarding, skirts, flaps, the skip's rear
       door, the fence gap) is a DUCK-UNDER; only the drain's 3.4 m squeeze pipe is a CREEP. */
    squeeze: [0.16, 0.235], squeezeShortMax: 0.6,
    duckUnder: { speed: 1.6, fleeSpeed: 2.4, duck: 0.1 },
    creep: { speed: 0.75, duck: 0.2 },
    firstSqueezeHesitate: 0.35,                                             // the hoarding only (first squeeze, a safe place)
    lowPoseUnder: 0.35,                                                     // under any ceiling lower than this the rabbit flattens: crouched sight points (visual + sight only, not speed)
    push: 0.62, accel: 5.0, decel: 10.0, turn: 14.0, airAccel: 4.0,
    gravity: 21.0, fallGravity: 1.35, jumpHeight: 0.52, jumpCut: 0.5, coyote: 0.10, buffer: 0.13, stepUp: 0.10,
    hw: 0.16, h: 0.24, hCrouch: 0.15,
    samples: { stand: [[0.14, 0.16], [0, 0.20], [-0.12, 0.10]], crouch: [[0.13, 0.10], [0, 0.12], [-0.12, 0.07]] },  // sight points (x fwd, y)
    climbIn: { maxDx: 0.35, time: 0.8 },
    reachFail: 0.5,                                                         // A15: only when no box top is within jump reach
  },
  box: { w: 0.52, h: 0.44, d: 0.50, accel: 1.6, friction: 5.0, push: 0.62, maxStep: 0.02 },   // head-push only; noise never matters

  /* A2: there is NO listen action in this build. Up jumps (as in the look test). The ears, head and posture react by
     themselves; these are the automatic reactions only. */
  listen: {
    action: false,
    auto: { snap: 0.12, headTurn: 0.3, sitUpStill: 3.2, firstBoom: 1.2, firstBoomOnlyIfStill: true },
  },

  behave: {
    breathHz: { calm: 1.0, alert: 1.6, afraid: 2.4, flee: 2.8, recover: [2.4, 1.0, 12], settled: 0.6 },
    heldBreath: { within: 1.0, amp: 0.3 },
    calmAfter: 6, recoverLookBack: 1.5, recoverShake: 4.0,
    ears: { footsteps: 1.0, approaching: 0.5, torchNear: 0.9, door: 0.9, engine: 0.8, wayOn: 0.3, drips: 0.1, headFollow: 0.35 },
    idles: { earTwitch: [2, 5], sniff: [3, 8], sitUpListen: 3.2, groomAfter: 6 },
    hideRim: 0.15,
    settle: { still: 1.5, stillElsewhere: 3.0, chain: { listen: 2.5, sniff: 2.0, nibble: 3.0, groom: 4.0, shake: 0.8, lie: 1.0 },
              loafHold: 4.0, breath: [1.0, 0.6], interrupt: 0.25, resumeStill: 1.5, autoStop: 60 },
  },

  /* A6: ONE detection model. A sight point counts only if the straight line from the source (torch lens for torch light,
     the eye for everything else) to the point crosses no occluder (FF.S1.occluders). Solid cover blocks completely;
     darkness only shortens the range and slows the fill. Hide cores are verified by the checker, never declared. */
  sight: {
    torch: { fwd: 0.32, h: 1.25, kneelFwd: 0.35, kneelH: 0.40, half: 13, range: 10.0, renderHalf: 15, renderPenumbra: 0.3,
             pitchWalk: -20, sway: 5, swayHz: 0.35, pitchLook: -32, pitchKneel: -12, aimHalf: 5 },
    eye: 1.62, kneelEye: 0.95,
    area: { range: 9.0, weight: 0.6 },                                      // door spill, floodlight: he faces the rabbit, clear line from the eye
    dark: { front: 1.75, behind: 0.5, weight: 1.0, t: 0.8 },                // A6: never ignored at close range, even in darkness (still telegraphed: NOTICE at 0.28 s)
    touch: { front: 0.6, behind: 0.3, wind: 0.45, sameFloor: 0.1 },         // walking into his legs: same floor + line of sight; the normal lunge wind-up
    fill: { tNear: 0.9, dNear: 3.0, tFar: 1.6, dFar: 10.0, grace: 0.5, decay: 0.5, notice: 0.35, investigateBelow: 0.15 },
    coreMaskSoft: 0.1, coreMaskOnlyWhereProvenDark: true, tick: 60,
  },

  searcher: {
    walk: 1.0, patrol: 1.3, run: 2.6, runAccel: 5.0, turn: 1.0, quickTurn: 0.35, reaction: 0.6, noticeDrift: 40,
    grab: { range: 2.5, wind: 0.45, windRunning: 0.3, reach: 0.7, hand: 0.4, runRange: 1.2 },
    aim: { min: 2.5, max: 10.0, raise: 0.5, hold: 1.0, lower: 0.5, breakLOS: 0.2, afterPursue: 1.0, needSight: 0.4, clickAt: 0.0 },
    /* A11: every core is a refuge. He kneels at the nearer end he can reach, shines under, gropes; reach depth from that end
       is armShallow under anything lower than 0.5 m, armDeep under the deck. In a core the hand falls short. */
    hideCheck: { seenWithin: 1.0, kneel: 1.0, reach: 0.6, armShallow: 0.65, armDeep: 1.0, deepAbove: 0.5, heldBreath: 1.5 },
    investigate: { walk: 1.0, sweep: 4.0 }, lost: 4.0, search: 4.0, wary: { time: 20, walk: 1.0, sweep: 1.5 },
    gap: { runTo: 112.4, kneel: 1.0, torch: 1.5, shakeSheet: true }, deckStepDown: 0.8, ai: 30,
    firstTimerReaction: 0.6,                                                // what the checker assumes for a first-time player
  },

  fail: { black: 0.80, fadeIn: 0.45, controlAt: 1.0, shotTail: 0.8, scuff: 0.2 },   // seconds after the cut; full picture at 1.25 s
  kindness: null,                                                                   // A3: no automatic difficulty reduction or hidden assist
};
