# Far Field: progress, how to play, how to test

**8 Oct 2026: Sequence 2, The Works, is playable** straight on from Sequence 1 (`SEQUENCE-2.md`; what is built, temporary and known: `STATUS.md` §S2). Below, Sequence 1's notes from 7 Oct stand unless a Sequence 2 note says otherwise.

7 Oct 2026, v2 after Josh's playtest (the controls, the crouch, the door reveal, the rabbit's and the people's movement, one sign of resistance; `SEQUENCE-1.md` V1–V7), with the review fixes (V8: the connected stand-in body, feet planted across gait changes, the Search's longer look at the walk, Shift remembered and re-taught, the forward hop, the door reveal showing the rabbit's reaction, the latch and short replays). What is built and what is still temporary: `STATUS.md`. The design: `SEQUENCE-1.md` (its Amendments win). How the files fit together: `INTERFACES.md`.

## Play it

Serve `public/` with any static server and open **`/farfield/index.html`**. For example, from the repo root:

```
python3 -m http.server 8080 -d public    # then open http://localhost:8080/farfield/index.html
```

The game starts with the content notice, then the title over the live Verge ("← → move · Shift run · Space jump · ↓ crouch"). Press → to begin. Sequence 2 follows Sequence 1 with no break: from the breathing space, walk over the slab across the channel.

**To start at Sequence 2 (review):** open **`/farfield/index.html?start=works`**: the content notice, then the title with **"Begin at the Works"** already chosen; Enter or → starts on the breathing space's grass at x 124.4, just before the slab. On a computer where Sequence 1 has been finished, the title offers it anyway (↑ ↓ to choose): a finished Sequence 1 saved before 8 Oct shows as **"Continue from the Works"**. For tests, `?cp=works-in` skips the notice and the title.

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

**URL options:** `?q=high|medium|low` fixes the tier (otherwise high, stepping down by itself if frames run slow when nothing is happening), `?mute=1` (no AudioContext and nothing stored), `?start=works` (the title with "Begin at the Works" chosen), `?cp=<checkpoint>` starts straight in play (`verge-start`, `verge-mid`, `drain`, `courtyard`, `search-arrive`, `search-platform`, `search-skip`, `rest`; Sequence 2: `works-in`, `works-apron`, `works-pitA`, `works-pitB`, `works-passage`, `works-line`, `works-g1`, `works-g2`, `works-pitC`, `works-out`), `?clean=1` (no hints), `?debug=1` (O shows the collision and hide overlay), `?seed=n`.

**Inside the arcade:** `public/farfield/room-test.html` mounts the wrapper (`public/farfield-room.js`) the way the planet would: a menu with the content notice and Play, the Sound and Music buttons in the house bar. It is not wired into the planet yet (that is a change to `planet.html` / `planet-dress.js` for Josh to approve; the one line it needs is in the header of `farfield-room.js`).

**The look test** (the approved scene the game's look comes from) is still at `/farfield/look.html`, frozen.

## The whole game, beat by beat (8 Oct: measured game time of the two bots through both sequences, real key events)

| beat | what happens | first-timer bot (a failure in each sequence) | quick bot |
|---|---|---|---|
| Sequence 1 | the Verge, the drain, the Courtyard, the Search (as below) | 3:13 | 2:09 |
| its breathing space | the settle chain and the pull-out to the Works, which now comes back to the player | 45.4 s (rests, lets the camera come back) | 37.6 s (rests, walks on during the pull-out) |
| 4 · the way on | the slab across the channel, the rain coming back, the intake, the creep under the beam (the first press clanks) | 13.1 s | 13.1 s |
| the first press | watching from the apron; (first-timer) walks in at a clank and freezes on the bed: the cut, back on the apron 1.24 s later; then slot A, slot B, the gate | 79.3 s | 26.2 s (straight to slot B) |
| the culvert and the passage | the drop, the culvert; the worker (first-timer: careless in his light, the look; quick: walks straight past) | 45.9 s | 22.6 s |
| the long hall | the walk seen from the doorway; following the rising wave; slot C under the great press as it clanks (first-timer) | 35.7 s | 18.9 s (Shift) |
| breathing space and the end | out of the end door; (first-timer) rests under the pipe: the settle chain, the pull-out, the card; (quick) walks on down the embankment into the fog, the card | 40.3 s | 20.6 s |
| **total** | | **7:39 + the card** | **4:30 + the card** |

Sequence 2 alone: the first-timer bot 3:34 with one failure, the quick bot 1:41 (the design's estimate for a careful first play is 3:36 with none). A person playing for the first time will be slower (looking around, watching the first press through more than one cycle): about 9–10 minutes for the whole game.

## Sequence 1, beat by beat (v2: measured game time of a bot that plays like a careful first-timer, walking, with one failure; and of a quick bot that runs with Shift on the open stretches)

| beat | what happens | first-timer bot | quick bot |
|---|---|---|---|
| title | the content notice, then the title over the live Verge, the rabbit grooming beneath a leaning sheet | (not counted) | |
| 1 · the Verge | dusk, heavy rain, darkening as you go; walk, hop the post, the "Shift + → run" hint (x 13), slip under the hoarding; the far boom; the van's headlights along the wall, the glare under the gate, the chain; drop into the culvert | 53.7 s | 28.1 s |
| drain | the squeeze pipe (a creep), the torch down the crack behind you, the arm that falls short | 21.5 s | 10.9 s |
| 2 · the Courtyard | the box puzzle (past the painted-over wall); the walkway worker; the duct | 36.2 s (incl. the duct) | 17.9 s |
| 3 · the Search | **the door reveal** (6.5 s from the first footsteps to control); the routine (his look over the deck 9 s); one failure (shot in his torch, back under the deck, full picture in 1.23 s); the crossing (with Shift); the gap | 81.4 s | 71.8 s |
| 4 · breathing space | listen, sniff, nibble, groom, shake, settle; the pull-out (since 8 Oct: it comes back, and the slab is the way on into Sequence 2) | 37.5 s | 37.5 s |
| **total** | | **about 3:57** | **about 2:49** |

The cautious walk makes the Verge and the drain slower than before for a walking player (the first version's bot was held to a run after 0.3 s). A person playing for the first time will be slower still (looking around, trying the box, watching the searcher's full loop before moving): about 4½–5 minutes with one failure.

## Test it

Everything automated lives in **`docs/farfield/tests/`** (node 20+, Google Chrome; one headless Chrome at a time, on `PORT`, default 9921, devtools `PORT + 100`). The bot plays through the **real input path**: CDP key events into the page's own keydown/keyup listeners, while the frames are stepped through the game's debug handle (headless Chrome throttles `requestAnimationFrame`).

```
bash docs/farfield/tests/run-all.sh          # everything below, then a PASS/FAIL summary (about 15-20 min)
node public/farfield/tools/check-search.mjs  # the Search checker alone (node only, no browser): must print PASS (23/23)
node public/farfield/tools/check-works.mjs   # the Works checker alone (Sequence 2's design check on FF.Works / FF.Painter): PASS (every check)
```

| script (in `docs/farfield/tests/`) | checks |
|---|---|
| `play.mjs fast "q=high&seed=1&mute=1" <label>` | the whole game, both sequences, from the content notice to the end card and back to the title: the quick route (Shift on open stretches; in the Works straight to slot B, past the worker, running the long hall, walking on into the fog); console clean; with `?mute=1` no AudioContext and no storage writes |
| `play.mjs firsttimer "q=high&seed=1" <label>` | the same with a first-timer's pauses and a failure in each sequence (shot in the Search, restart under the deck; frozen on the press bed at a clank, restart on the apron), careless in the worker's light, resting at both breathing spaces (ending a); the save ends "completed". Both play-throughs also count any flattening in the open (must be 0; flat in a slot under a press coming down is designed) and record the run hint and the door reveal. Sequence 2 is played by `works-bot.js`'s plan through real keys (`routes.js`) |
| `t-works.mjs` (Sequence 2) | W1–W12, 42 checks: the slab and first sight, every press's cut on the step (3.89–3.94 s from the clank), the chamfer shove, the gate, the first press by bot from every arrival (36 runs), the worker (never noticed while he scrapes, the look, never a failure, never under the pallet), the long hall's flows (32 runs), every checkpoint's restart and way-open time, both endings and cancelling, the join with Sequence 1, console clean |
| `t-audio-works.mjs` (`RENDER=1`) | the Works' sound: the far beat continues into the machines, every contact's thud and every release's clank on the same frame, the gate, the worker's look, the failure (only the muffled thud in the black), `?mute=1`; with RENDER the thud's onset within 60 ms of the contact |
| `t-works-flow.mjs` | the shell (16 checks): the notice names dangerous machinery (game and arcade), `?start=works` chooses "Begin at the Works" and starts at 124.4 with Sequence 1 done, the old save migration ("completed" → "Continue from the Works"), the choices with ↑ ↓, the save never goes back, `?mute=1` stores nothing |
| `t-controls.mjs` | Josh's controls (30 checks): a held arrow walks at 0.95 m/s and never speeds up (6 s and 30 s), Shift runs and drops back, the hint at x 13 and going once Shift is used, the post, the walking hop clearing the post from 0.2–0.5 m and carrying about 0.6 m, the hoarding's squeeze order and easing, ↓ crouch and creep, the glare freeze (not flat) vs ↓, the flee only with Shift, Shift held through a failure and through pause and resume, the pause screen's controls line, the Courtyard reminder (once), the gait following the distance |
| `t-reveal.mjs` | the door reveal through real keys (22 scenarios): no input, a cautious walk, forward held from the duct (the son's case), a Shift run, a running jump into the trigger, hops, the full path from the box, the shelf top (the furthest stop), the camera path, the no-detection guarantee, auto-repeat, mid-squeeze, a quick re-press, a key pressed again during it, mashing, caught after it (no replay), pause → Restart before and after it was seen and in its grace, Quit → Continue, the door frame at 2:1, 16:10 and 4:3; it measures the reaction before the camera leaves and the rabbit's place in the frame at control |
| `t-slide.mjs` | the feet, by height: steady walk, run and crouch-walk, starting, stopping from a walk and a run, the walk → crouch change at the hoarding, the searcher walking (turns reported) |
| `scen.mjs [caught shot escapeCore escapeGap darkClose]` | the Search scenarios from real checkpoints: caught → checkpoint, shot → checkpoint (restart, control and full-picture times), detected and escaping to a core, detected and escaping through the gap, darkness at close range |
| `t-detect.mjs` | Josh's detection rules on the game's own sight function (`FF.AI.see`) and live over the whole routine |
| `t-linger.mjs` | the Verge never pushes: 60 s before the gate and 30 s in the glare; the frozen look test still loads |
| `t-room.mjs` | the arcade wrapper: menu and notice, Play, mute and music both ways, Esc, teardown, `?mute=1` |
| `t-fps.mjs` (`DSF=2` for Retina) · `t-perf.mjs` | frame rate per tier in the real loop · frame cost with a GPU sync per place (both now include the press hall, the passage, the long hall and the outside) |
| `t-look.mjs` (`TAG`, `VIEWS`, `OVR`) | views of every place with the rabbit's readability ratio; `OVR` tries look changes without editing files |

Results land in `docs/farfield/tests/out/` (not committed). Set `PROGRESS_DIR` to copy chosen shots to a folder.

**The debug handle** (`window.__ff`, INTERFACES.md §10): `state()`, `warp('<checkpoint>')`, `step(n)`, `tick()` (one fixed step, presentation every second step), `flush()`, `draw()`, `setTier()`, `stats()`, `ai` (the searcher's state, suspicion, timers). `FF.AI.setLoopT(t)` puts the searcher at a point of his routine.

## Latest results (8 Oct, Sequence 2 integrated)

`run-all.sh` on port 9975, headless Chrome on the M2 Air (load average 5–19, other work running): **every row passes** (21 rows).
- **Both whole-game play-throughs** end back at the title with a clean console. Quick (`?mute=1`): 4:30 of game time to the card, no AudioContext, nothing stored, ending (b) by walking on into the fog. First-timer (sound on): 7:39, fails ["caught by searcher", "machine by P1"], each back with the full picture 1.24 s later, ending (a) under the pipe after resting at Sequence 1's lean-to too, save "completed". No flattening in the open in 31,258 and 53,445 steps of play; the run hint at x 13.0; the door reveal 6.50 s from its start to control.
- **Sequence 2's tests:** `t-works.mjs` 42/42 (the cut 3.900 s from the clank standing on P1's bed, 3.925 crouched, 3.917 / 3.942 under the great press; the gate cuts at P1 phase 9.658; 36/36 bot runs through the first press, 32/32 through the long hall; every checkpoint restarts in its shelter and the way opens 3.88–6.88 s later; both endings and the cancel); `t-audio-works.mjs` all pass (28 contacts / 28 thuds, 30 releases / 30 clanks on the same frame; the thud's onset 40 ms after the contact in the render); `t-works-flow.mjs` 16/16; `check-works.mjs` PASS (every check).
- **Sequence 1 unchanged:** the Search checker 23/23, the controls 30/30, the door reveal in 22 scenarios (control 6.49 s after the cue in every case), the scenarios (caught 1.58 s and shot 2.75 s after NOTICE; restart 0.78–0.79 s, control 0.98–0.99 s, full picture 1.23–1.24 s), the feet, detection, lingering, the arcade wrapper.
- **Frame cost** (GPU-synced, 1440×720 at 2×, high tier): Sequence 1's places 12.1–15.2 ms (the committed Sequence 1, run back to back in the same session: 13.2–15.6), the Works 14.5–17.6 ms; medium 8.7–11.5 ms in the Works; draw calls in the Works 35–75. Before the fix in `STATUS.md` §S2 (the footprint mask compiled into every material) Sequence 1's places cost 2.5–3.5 ms more. **Real loop** (`t-fps.mjs`, the same window): high 61–77 fps (the Works 61–70), medium 97–141, low 175–269.

## Results of 7 Oct late evening (v2 with the review fixes)

`run-all.sh` on port 9965, headless Chrome on the M2 Air: every check passes. The frame-rate row passes when the GPU isn't shared (Retina high tier 81–103 fps at 20:32); later, with other work loading the machine's GPU (load average 13–33), it read 20–25 fps for both the committed v2 and these changes run back to back, so the changes cost nothing measurable.
- **The Search checker 23/23**, in RUN mode (Shift: every amended verdict) and WALK mode (the cautious pace: every alert beyond arm's reach survivable by running at once; walking out of the deck core 0.5–2 s into his 9 s look reaches the pallet core with no NOTICE; the deck → skip crossing leaving 0.5 s in is never spotted).
- **Both full play-throughs** end back at the title with a clean console; `?mute=1` makes no AudioContext and stores nothing; **no flattening in the open** in 19,110 and 26,831 steps of play; the run hint shows at x 13.0; the door reveal runs once, 6.5 s from the first footsteps to control.
- **The controls** (30/30): the walk holds 0.95 m/s for 30 s (never above); 0.9 m/s within 0.2 s; Shift reaches 2.75 m/s in 0.33 s and drops back to the walk in 0.18 s; the Shift hint goes once Shift is used; a tapped walking hop clears the post from 0.2, 0.35 and 0.5 m (from 0.7 m it lands against it) and carries 0.62 m on the flat; Shift held through a failure and restart runs at once (2.75 m/s), and through pause and resume with the arrow auto-repeating; the pause screen shows the controls; the Courtyard reminder shows once after 60 s without running; ↓ crouches the shoulders before the hips; the creep 0.75 m/s; in the gate's glare it freezes (never flat), ↓ flattens it there; spotted, an arrow alone stays 0.95, Shift flees.
- **The door reveal** (22 scenarios): starts on the cue (or at x 90.0 for a run), stops at x 87.6–90.8 (the furthest, 90.8, a Shift run onto the shelf top and a jump off its end; the deck starts at 92.0); the camera leaves 0.85 s after the rabbit has stopped (it lifts its head and pricks its ears under the shelf, sits up in the open); control back 6.49 s after the cue in every case, the rabbit a third into the frame; a key held without a break moves it 0 m for 0.7 s, then walks on at 0.95 m/s (since a125461 a Shift held through it as well runs from the end of the reveal's 1.2 s grace, up to 2.76 m/s two seconds after control; a fresh Shift press runs at once); a key let go and pressed again during it (0.6, 0.3, 0.1 s before control, or mashed) is never latched and walks on at once; suspicion stays 0 throughout; the camera never jumps (peak 21.5 m/s, 399 frames); auto-repeat keeps the latch; caught later in the Search → no replay (control 1.23 s after the fail); pause → Restart before it was seen replays it in full; after it was seen (and Quit → Continue) only the aim, control 2.43 s after the restart; a restart in its grace takes no control; the gap sits 88% across the frame at 2:1, 16:10 and 4:3.
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

In `farfield-look/progress/` (outside the repo): **`s2-01` … `s2-21` are Sequence 2 integrated** (8 Oct; the list is in `STATUS.md` §S2); the Sequence 2 builders' own shots are `s2world-`, `s2mech-` and the sound's `audio2-` (spectrograms and a 3-minute preview). **`v2fix-01` … `v2fix-11` and `v2fix-reveal-01` … `09` are the review fixes** (the connected rabbit walking, striding, stopped, running, hopping the post, crouched under the hoarding, at the title, hiding; the pause screen's controls; the Courtyard reminder; the painted-over wall on Retina; the door reveal: the reaction under the shelf, the camera on its way, the man in the doorway, stepping out, the aim lighting the gap, the camera returning, control back with the rabbit in frame, forward still held walking on, and the door frame at 4:3). **`s1v2-01` … `s1v2-11` are v2** (the title with the new controls; the "Shift + → run" hint; the painted-over wall in passing; the rabbit's cautious walk and Shift run, in the game's camera and close up; the door reveal with forward held: the rabbit stops, the camera on the man in the doorway, the aim lighting the gap, control back with forward still held and the rabbit not moving). The v2 fixers' own shots: `controls-`, `reveal-`, `fixworld-`, `chars-`. `integrator-01` … `integrator-14` are from the first integration (the notice, the title, an arrival view per beat, the gate glare, the walkway worker, the entry's aim at the fence, the deck overhead, the crouch-look, the NOTICE and aim telegraphs, the breathing space, the pull-out, the end card). The builders' shots (`world-`, `rabbit-`, `humans-`, `shell-`) show their parts close up.
