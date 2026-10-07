# Far Field: progress, how to play, how to test

7 Oct 2026, after the Sequence 1 integration. What is built and what is still temporary: `STATUS.md`. The design: `SEQUENCE-1.md` (its Amendments win). How the files fit together: `INTERFACES.md`.

## Play it

Serve `public/` with any static server and open **`/farfield/index.html`**. For example, from the repo root:

```
python3 -m http.server 8080 -d public    # then open http://localhost:8080/farfield/index.html
```

The game starts with the content notice, then the title over the live Verge. Press → to begin.

| key | does |
|---|---|
| ← → (or A D) | move; hold to run (Shift walks) |
| Space, ↑ (or W) | jump; on the box under the opening, ↑ or Space climbs in |
| ↓ (or S) | crouch (optional: squeezes crouch by themselves) |
| Esc or P | pause: Resume, Restart from checkpoint, Sound, Music, Back to the title or the arcade |
| M | all sound on or off |
| N | the ambience beds and the music on or off (every sound cue stays) |
| Q | quality tier: high → medium → low |
| F | frame rate and draw counts |

A gamepad works too (stick or d-pad, A jumps, Y or up climbs, B or down crouches, Start pauses); it has not been tried with real hardware. There is no touch control in Sequence 1.

**URL options:** `?q=high|medium|low` fixes the tier (otherwise high, stepping down by itself if frames run slow when nothing is happening), `?mute=1` (no AudioContext and nothing stored), `?cp=<checkpoint>` starts straight in play (`verge-start`, `verge-mid`, `drain`, `courtyard`, `search-arrive`, `search-platform`, `search-skip`, `rest`), `?clean=1` (no hints), `?debug=1` (O shows the collision and hide overlay), `?seed=n`.

**Inside the arcade:** `public/farfield/room-test.html` mounts the wrapper (`public/farfield-room.js`) the way the planet would: a menu with the content notice and Play, the Sound and Music buttons in the house bar. It is not wired into the planet yet (that is a change to `planet.html` / `planet-dress.js` for Josh to approve; the one line it needs is in the header of `farfield-room.js`).

**The look test** (the approved scene the game's look comes from) is still at `/farfield/look.html`, frozen.

## The sequence, beat by beat (measured game time of a bot that plays like a careful first-timer, with one failure)

| beat | what happens | first-timer bot | quick bot |
|---|---|---|---|
| title | the content notice, then the title over the live Verge, the rabbit grooming beneath a leaning sheet | (not counted) | |
| 1 · the Verge | dusk, heavy rain, darkening as you go; run, hop the post, slip under the hoarding; the far boom; the van's headlights along the wall, the glare under the gate, the chain; drop into the culvert | 29.6 s | 14.6 s |
| drain | the squeeze pipe (a creep), the torch down the crack behind you, the arm that falls short | 12.8 s | 10.7 s |
| 2 · the Courtyard | the box puzzle; the walkway worker; the duct | 24.8 s (incl. the 5.8 s duct) | 17.8 s |
| 3 · the Search | the entry and the aim at the fence; the routine; one failure (shot in his torch, back under the deck in 1.24 s); the crossing; the gap | 73.3 s | 67.6 s |
| 4 · breathing space | listen, sniff, nibble, groom, shake, settle; the pull-out; "to be continued"; back to the title | 32.5 s + the card | 32.5 s |
| **total** | | **about 3:00 + the card** | **about 2:26** |

A person playing for the first time will be slower than the bot (looking around, trying the box, watching the searcher's full loop before moving): the design estimates about 4½ minutes with one failure.

## Test it

Everything automated lives in **`docs/farfield/tests/`** (node 20+, Google Chrome; one headless Chrome at a time, on `PORT`, default 9921, devtools `PORT + 100`). The bot plays through the **real input path**: CDP key events into the page's own keydown/keyup listeners, while the frames are stepped through the game's debug handle (headless Chrome throttles `requestAnimationFrame`).

```
bash docs/farfield/tests/run-all.sh          # everything below, then a PASS/FAIL summary (about 3 min)
node public/farfield/tools/check-search.mjs  # the Search checker alone (node only, no browser): must print PASS (18/18)
```

| script (in `docs/farfield/tests/`) | checks |
|---|---|
| `play.mjs fast "q=high&seed=1&mute=1" <label>` | the whole sequence from the content notice to the end card and back to the title, sneak route; console clean; with `?mute=1` no AudioContext and no storage writes |
| `play.mjs firsttimer "q=high&seed=1" <label>` | the same with a first-timer's pauses and one failure in the Search (shot, restart under the deck) |
| `scen.mjs [caught shot escapeCore escapeGap darkClose]` | the Search scenarios from real checkpoints: caught → checkpoint, shot → checkpoint (restart, control and full-picture times), detected and escaping to a core, detected and escaping through the gap, darkness at close range |
| `t-detect.mjs` | Josh's detection rules on the game's own sight function (`FF.AI.see`) and live over the whole routine |
| `t-linger.mjs` | the Verge never pushes: 60 s before the gate and 30 s in the glare; the frozen look test still loads |
| `t-room.mjs` | the arcade wrapper: menu and notice, Play, mute and music both ways, Esc, teardown, `?mute=1` |
| `t-fps.mjs` (`DSF=2` for Retina) · `t-perf.mjs` | frame rate per tier in the real loop · frame cost with a GPU sync per place |
| `t-look.mjs` (`TAG`, `VIEWS`, `OVR`) | views of every place with the rabbit's readability ratio; `OVR` tries look changes without editing files |

Results land in `docs/farfield/tests/out/` (not committed). Set `PROGRESS_DIR` to copy chosen shots to a folder.

**The debug handle** (`window.__ff`, INTERFACES.md §10): `state()`, `warp('<checkpoint>')`, `step(n)`, `tick()` (one fixed step, presentation every second step), `flush()`, `draw()`, `setTier()`, `stats()`, `ai` (the searcher's state, suspicion, timers). `FF.AI.setLoopT(t)` puts the searcher at a point of his routine.

## Latest results (7 Oct, integration)

All pass (`run-all.sh`): the checker 18/18; both full play-throughs end back at the title with a clean console; caught and shot each restart at the nearby checkpoint (black until 0.79 s, control at 0.99 s, full picture at 1.24 s); both escapes survive with a 0.6 s first-timer reaction; every hide core stays unseen for a whole loop; darkness at 1.55 m still catches the rabbit (NOTICE → caught 2.3 s); the Verge waits; the arcade wrapper behaves.

**Warning times measured in the game** (from the first unmistakable cue, NOTICE: he stops dead, the footsteps stop, the torch drifts onto the rabbit):

| situation | cue → consequence |
|---|---|
| frozen in his torch, near him | NOTICE → caught **1.58 s** (SPOTTED at 0.53 s, the 0.6 s reaction, the 0.45 s lunge) |
| frozen in his torch, 3–4 m away | NOTICE → shot **2.73–2.77 s**; the aim itself (gun up, beam narrowing to 5°, a click) **1.5 s**, click → shot 1.0 s |
| frozen in darkness 1.55 m from where he turns | NOTICE → caught **2.27 s** |
| running into his legs | no NOTICE; the lunge's 0.45 s wind-up |

**Frame rate** (headless Chrome on the M2 Air, the game's own loop, 1440×720 at Retina 2×): high 66–87 fps (drawing 2160×1080), medium 118–148, low 223–305.

## Progress shots

In `farfield-look/progress/` (outside the repo): `integrator-01` … `integrator-14` are from this integration (the notice, the title, an arrival view per beat, the gate glare, the walkway worker, the entry's aim at the fence, the deck overhead, the crouch-look, the NOTICE and aim telegraphs, the breathing space, the pull-out, the end card). The builders' shots (`world-`, `rabbit-`, `humans-`, `shell-`) show their parts close up.
