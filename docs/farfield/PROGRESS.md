# Far Field: progress, how to play, how to test

7 Oct 2026, v2 after Josh's playtest (the controls, the crouch, the door reveal, the rabbit's and the people's movement, one sign of resistance; `SEQUENCE-1.md` V1–V7), with the review fixes (V8: the connected stand-in body, feet planted across gait changes, the Search's longer look at the walk, Shift remembered and re-taught, the forward hop, the door reveal showing the rabbit's reaction, the latch and short replays). What is built and what is still temporary: `STATUS.md`. The design: `SEQUENCE-1.md` (its Amendments win). How the files fit together: `INTERFACES.md`.

## Play it

Serve `public/` with any static server and open **`/farfield/index.html`**. For example, from the repo root:

```
python3 -m http.server 8080 -d public    # then open http://localhost:8080/farfield/index.html
```

The game starts with the content notice, then the title over the live Verge ("← → move · Shift run · Space jump · ↓ crouch"). Press → to begin.

| key | does |
|---|---|
| ← → (or A D) | move: a cautious walk, for as long as you hold it (it never speeds up by itself) |
| Shift + ← → | run (in the Search, the flee while he is chasing) |
| Space, ↑ (or W) | jump (with a direction held, a forward hop of about 0.6 m); on the box under the opening, ↑ or Space climbs in |
| ↓ (or S) | crouch, deliberately; with ← → a creep (squeezes and anything very low crouch by themselves) |
| Esc or P | pause: Resume, Restart from checkpoint, Sound, Music, Back to the title or the arcade; the controls line |
| M | all sound on or off |
| N | the ambience beds and the music on or off (every sound cue stays) |
| Q | quality tier: high → medium → low |
| F | frame rate and draw counts |

A gamepad works too (stick or d-pad walk, X, RB or RT + a direction run, A jumps, Y or up climbs, B or down crouches, Start pauses); it has not been tried with real hardware. There is no touch control in Sequence 1.

**URL options:** `?q=high|medium|low` fixes the tier (otherwise high, stepping down by itself if frames run slow when nothing is happening), `?mute=1` (no AudioContext and nothing stored), `?cp=<checkpoint>` starts straight in play (`verge-start`, `verge-mid`, `drain`, `courtyard`, `search-arrive`, `search-platform`, `search-skip`, `rest`), `?clean=1` (no hints), `?debug=1` (O shows the collision and hide overlay), `?seed=n`.

**Inside the arcade:** `public/farfield/room-test.html` mounts the wrapper (`public/farfield-room.js`) the way the planet would: a menu with the content notice and Play, the Sound and Music buttons in the house bar. It is not wired into the planet yet (that is a change to `planet.html` / `planet-dress.js` for Josh to approve; the one line it needs is in the header of `farfield-room.js`).

**The look test** (the approved scene the game's look comes from) is still at `/farfield/look.html`, frozen.

## The sequence, beat by beat (v2: measured game time of a bot that plays like a careful first-timer, walking, with one failure; and of a quick bot that runs with Shift on the open stretches)

| beat | what happens | first-timer bot | quick bot |
|---|---|---|---|
| title | the content notice, then the title over the live Verge, the rabbit grooming beneath a leaning sheet | (not counted) | |
| 1 · the Verge | dusk, heavy rain, darkening as you go; walk, hop the post, the "Shift + → run" hint (x 13), slip under the hoarding; the far boom; the van's headlights along the wall, the glare under the gate, the chain; drop into the culvert | 53.7 s | 28.1 s |
| drain | the squeeze pipe (a creep), the torch down the crack behind you, the arm that falls short | 21.5 s | 10.9 s |
| 2 · the Courtyard | the box puzzle (past the painted-over wall); the walkway worker; the duct | 36.2 s (incl. the duct) | 17.9 s |
| 3 · the Search | **the door reveal** (6.5 s from the first footsteps to control); the routine (his look over the deck 9 s); one failure (shot in his torch, back under the deck, full picture in 1.23 s); the crossing (with Shift); the gap | 81.4 s | 71.8 s |
| 4 · breathing space | listen, sniff, nibble, groom, shake, settle; the pull-out; "to be continued"; back to the title | 37.5 s + the card | 37.5 s |
| **total** | | **about 3:57 + the card** | **about 2:49** |

The cautious walk makes the Verge and the drain slower than before for a walking player (the first version's bot was held to a run after 0.3 s). A person playing for the first time will be slower still (looking around, trying the box, watching the searcher's full loop before moving): about 4½–5 minutes with one failure.

## Test it

Everything automated lives in **`docs/farfield/tests/`** (node 20+, Google Chrome; one headless Chrome at a time, on `PORT`, default 9921, devtools `PORT + 100`). The bot plays through the **real input path**: CDP key events into the page's own keydown/keyup listeners, while the frames are stepped through the game's debug handle (headless Chrome throttles `requestAnimationFrame`).

```
bash docs/farfield/tests/run-all.sh          # everything below, then a PASS/FAIL summary (about 5 min)
node public/farfield/tools/check-search.mjs  # the Search checker alone (node only, no browser): must print PASS (23/23)
```

| script (in `docs/farfield/tests/`) | checks |
|---|---|
| `play.mjs fast "q=high&seed=1&mute=1" <label>` | the whole sequence from the content notice to the end card and back to the title, sneak route; console clean; with `?mute=1` no AudioContext and no storage writes |
| `play.mjs firsttimer "q=high&seed=1" <label>` | the same with a first-timer's pauses and one failure in the Search (shot, restart under the deck). Both play-throughs also count any flattening in the open (must be 0) and record the run hint and the door reveal |
| `t-controls.mjs` | Josh's controls (30 checks): a held arrow walks at 0.95 m/s and never speeds up (6 s and 30 s), Shift runs and drops back, the hint at x 13 and going once Shift is used, the post, the walking hop clearing the post from 0.2–0.5 m and carrying about 0.6 m, the hoarding's squeeze order and easing, ↓ crouch and creep, the glare freeze (not flat) vs ↓, the flee only with Shift, Shift held through a failure and through pause and resume, the pause screen's controls line, the Courtyard reminder (once), the gait following the distance |
| `t-reveal.mjs` | the door reveal through real keys (22 scenarios): no input, a cautious walk, forward held from the duct (the son's case), a Shift run, a running jump into the trigger, hops, the full path from the box, the shelf top (the furthest stop), the camera path, the no-detection guarantee, auto-repeat, mid-squeeze, a quick re-press, a key pressed again during it, mashing, caught after it (no replay), pause → Restart before and after it was seen and in its grace, Quit → Continue, the door frame at 2:1, 16:10 and 4:3; it measures the reaction before the camera leaves and the rabbit's place in the frame at control |
| `t-slide.mjs` | the feet, by height: steady walk, run and crouch-walk, starting, stopping from a walk and a run, the walk → crouch change at the hoarding, the searcher walking (turns reported) |
| `scen.mjs [caught shot escapeCore escapeGap darkClose]` | the Search scenarios from real checkpoints: caught → checkpoint, shot → checkpoint (restart, control and full-picture times), detected and escaping to a core, detected and escaping through the gap, darkness at close range |
| `t-detect.mjs` | Josh's detection rules on the game's own sight function (`FF.AI.see`) and live over the whole routine |
| `t-linger.mjs` | the Verge never pushes: 60 s before the gate and 30 s in the glare; the frozen look test still loads |
| `t-room.mjs` | the arcade wrapper: menu and notice, Play, mute and music both ways, Esc, teardown, `?mute=1` |
| `t-fps.mjs` (`DSF=2` for Retina) · `t-perf.mjs` | frame rate per tier in the real loop · frame cost with a GPU sync per place |
| `t-look.mjs` (`TAG`, `VIEWS`, `OVR`) | views of every place with the rabbit's readability ratio; `OVR` tries look changes without editing files |

Results land in `docs/farfield/tests/out/` (not committed). Set `PROGRESS_DIR` to copy chosen shots to a folder.

**The debug handle** (`window.__ff`, INTERFACES.md §10): `state()`, `warp('<checkpoint>')`, `step(n)`, `tick()` (one fixed step, presentation every second step), `flush()`, `draw()`, `setTier()`, `stats()`, `ai` (the searcher's state, suspicion, timers). `FF.AI.setLoopT(t)` puts the searcher at a point of his routine.

## Latest results (7 Oct late evening, v2 with the review fixes)

`run-all.sh` on port 9965, headless Chrome on the M2 Air: every check passes. The frame-rate row passes when the GPU isn't shared (Retina high tier 81–103 fps at 20:32); later, with other work loading the machine's GPU (load average 13–33), it read 20–25 fps for both the committed v2 and these changes run back to back, so the changes cost nothing measurable.
- **The Search checker 23/23**, in RUN mode (Shift: every amended verdict) and WALK mode (the cautious pace: every alert beyond arm's reach survivable by running at once; walking out of the deck core 0.5–2 s into his 9 s look reaches the pallet core with no NOTICE; the deck → skip crossing leaving 0.5 s in is never spotted).
- **Both full play-throughs** end back at the title with a clean console; `?mute=1` makes no AudioContext and stores nothing; **no flattening in the open** in 19,110 and 26,831 steps of play; the run hint shows at x 13.0; the door reveal runs once, 6.5 s from the first footsteps to control.
- **The controls** (30/30): the walk holds 0.95 m/s for 30 s (never above); 0.9 m/s within 0.2 s; Shift reaches 2.75 m/s in 0.33 s and drops back to the walk in 0.18 s; the Shift hint goes once Shift is used; a tapped walking hop clears the post from 0.2, 0.35 and 0.5 m (from 0.7 m it lands against it) and carries 0.62 m on the flat; Shift held through a failure and restart runs at once (2.75 m/s), and through pause and resume with the arrow auto-repeating; the pause screen shows the controls; the Courtyard reminder shows once after 60 s without running; ↓ crouches the shoulders before the hips; the creep 0.75 m/s; in the gate's glare it freezes (never flat), ↓ flattens it there; spotted, an arrow alone stays 0.95, Shift flees.
- **The door reveal** (22 scenarios): starts on the cue (or at x 90.0 for a run), stops at x 87.6–90.8 (the furthest, 90.8, a Shift run onto the shelf top and a jump off its end; the deck starts at 92.0); the camera leaves 0.85 s after the rabbit has stopped (it lifts its head and pricks its ears under the shelf, sits up in the open); control back 6.49 s after the cue in every case, the rabbit a third into the frame; a key held without a break moves it 0 m for 0.7 s, then walks on at 0.95 m/s (never running, even with Shift held); a key let go and pressed again during it (0.6, 0.3, 0.1 s before control, or mashed) is never latched and walks on at once; suspicion stays 0 throughout; the camera never jumps (peak 21.5 m/s, 399 frames); auto-repeat keeps the latch; caught later in the Search → no replay (control 1.23 s after the fail); pause → Restart before it was seen replays it in full; after it was seen (and Quit → Continue) only the aim, control 2.43 s after the restart; a restart in its grace takes no control; the gap sits 88% across the frame at 2:1, 16:10 and 4:3.
- **The feet** (by height, a foot within 3 mm of the ground): steady walk 0.000–0.003 m/s, run 0.000–0.015, crouch-walk 0.008–0.009; stopping from a walk 0.000–0.004; starting 0.005–0.027; stopping from a run 0.011–0.021; walking into the hoarding no foot on the ground jumps more than 1.5 cm in a frame (it was 10.6 cm); the searcher 0.004–0.012. Turning round 0.07–0.38 (reported; the legs bend in the body's own plane).
- **Caught and shot** each restart at the nearby checkpoint (black until 0.78–0.79 s, control 0.98–0.99 s, full picture 1.23–1.24 s); both escapes survive with a 0.6 s first-timer reaction (fleeing with Shift); every hide core stays unseen for a whole loop; darkness at 1.55 m still catches the rabbit (NOTICE → caught 2.27 s); the Verge waits (60 s before the gate, 30 s in the glare); the arcade wrapper behaves.

**Warning times measured in the game** (unchanged by v2; from the first unmistakable cue, NOTICE: he stops dead, the footsteps stop, the torch drifts onto the rabbit):

| situation | cue → consequence |
|---|---|
| frozen in his torch, near him | NOTICE → caught **1.58 s** |
| frozen in his torch, 3–4 m away | NOTICE → shot **2.75 s**; the aim itself (gun up, beam narrowing to 5°, a click) **1.5 s**, click → shot 1.0 s |
| frozen in darkness 1.55 m from where he turns | NOTICE → caught **2.27 s** |
| running into his legs | no NOTICE; the lunge's 0.45 s wind-up |

**Frame rate** (headless Chrome on the M2 Air, the game's own loop, 1440×720): at Retina 2× high 78–101 fps (drawing 2160×1080), medium 135–180, low 264–370; at 1× high 158–204, medium 199–260, low 265–369. The painted-over wall adds one draw call in the Courtyard.

## Progress shots

In `farfield-look/progress/` (outside the repo): **`v2fix-01` … `v2fix-11` and `v2fix-reveal-01` … `09` are the review fixes** (the connected rabbit walking, striding, stopped, running, hopping the post, crouched under the hoarding, at the title, hiding; the pause screen's controls; the Courtyard reminder; the painted-over wall on Retina; the door reveal: the reaction under the shelf, the camera on its way, the man in the doorway, stepping out, the aim lighting the gap, the camera returning, control back with the rabbit in frame, forward still held walking on, and the door frame at 4:3). **`s1v2-01` … `s1v2-11` are v2** (the title with the new controls; the "Shift + → run" hint; the painted-over wall in passing; the rabbit's cautious walk and Shift run, in the game's camera and close up; the door reveal with forward held: the rabbit stops, the camera on the man in the doorway, the aim lighting the gap, control back with forward still held and the rabbit not moving). The v2 fixers' own shots: `controls-`, `reveal-`, `fixworld-`, `chars-`. `integrator-01` … `integrator-14` are from the first integration (the notice, the title, an arrival view per beat, the gate glare, the walkway worker, the entry's aim at the fence, the deck overhead, the crouch-look, the NOTICE and aim telegraphs, the breathing space, the pull-out, the end card). The builders' shots (`world-`, `rabbit-`, `humans-`, `shell-`) show their parts close up.
