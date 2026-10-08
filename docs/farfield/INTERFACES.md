# Far Field · Sequences 1 and 2 · Interfaces

Architect, 7 Oct 2026; Sequence 2 integrated 8 Oct. **The contract between the game's files.** The designs are `SEQUENCE-1.md` (its **Amendments**, A1–A24 and the playtest changes V1–V8, at the top, win over the rest of it) and `SEQUENCE-2.md` (The Works). This file says which module does what, the API each one exposes, how they talk, and who owns which file, so four builders can work at the same time without touching each other's files.

The skeleton already runs: `public/farfield/index.html` boots, shows the content notice, the title over the live Verge, and play along the whole 135 m lane (a greybox). Every module exists as a **working stub** with this API (§14 says what each stub does today). Builders replace the insides and keep the API.

## Polish pass, 8 Oct (Josh's section 13; read this before the sections below where they differ)

- **New files:** `js/ff-guard.js` (`FF.Guard`, loaded before `ff-ai.js`; pure, loadable in node) and `js/ff-opening.js` (`FF.Opening`, between `FF.Painter` and `FF.Events` in INIT / RESET / FRAME; presentation only). `tools/check-search.mjs` and `tools/check-works.mjs` load `ff-guard.js` before `ff-ai.js`.
- **`FF.Guard` (the one perception module, used by the searcher in every mode including the door entry, and by the Works painter):** `see(pose, pts, opts)` (A6, moved from `ff-ai.js`), `fillTime(src, d)` (`src` now also `'sound'`: `FF.RULES.sight.hear.t`), `noiseOf(speed)`, `hear(pose, noise, cx, {floorY, lat, rangeScale})` -> `{w, d}` (noise x (1 - d / `FF.RULES.sight.hear.range`)), `merge(sight, sound)`, `sense(pose, pts, {x, vx|noise}, opts)` -> `{w, src: touch|torch|area|dark|sound|'', d, sound}`, `accumulate(state {s, grace}, e, dt)` (the sustained threshold). `FF.AI.see` / `FF.AI.fillTime` are aliases. `FF.RULES.sight.hear = {range 6, t 1.1, floorSpeed 1.05, fullSpeed 2.6}`: the cautious walk (0.95) and anything slower is silent, the run (2.75) is loud. `FF.G.searcher.litBy` can now be `'sound'`.
- **`FF.Painter`:** modes `loop | look | chase | return`; `debug()` gained `px, chases, caught, heardAt`; facts `painter {phase: chase | give-up | caught}` and `painter:caught {x}`; the catch emits `fail {kind: 'caught', by: 'painter', x}` (the normal failure flow). `FF.RULES.painter.neverFollows / neverFails` removed. Audio's `classify()` maps `chase|return|caught|give-up` to `'chase'` (no scraping while he walks).
- **`FF.Works`:** the long hall's bar is 10 s (`FF.S2.works.line.period`, offsets Q1 0, Q2 6, Q3 2). `hazards()` slides every rabbit in a slot's notch that is off the slot floor (`if (notch && off)`), whatever its pose.
- **`FF.Player`:** `S.mode 'tumble'` (the opening; `Player.intro()` returns true when it began, `Player.introHide(on)`, `Player.introOn()`; `?intro=0` skips it), `S.roll` (the tumble's roll, drawn about the body's middle), `S.pitchA` (the jump's arc), `S.windT` / `S.settleT` (the jump's 65 ms wind-up and 160 ms settle). Bus: `intro {phase: start | end}`, `opening:puff {x, y, z, n, spread, up, vx, grit}` (the dust), `camera:bump {amp, time}` (a landing's shake); `play:start {cp, intro}`. FF.Level fires no triggers while `r.mode === 'tumble'`; `FF.Input.latch` holds the arrow that began the game until it is pressed again.
- **Audio cues added:** `squeak` (every `fail {kind: 'caught'}`, under the black, before the scuff), `tin-clang`, `far-clang`, `tumble`.
- **Defaults:** `FF.Rabbit.create` loads the Tripo rabbit unless `?rabbit=procedural` (or a file via `?rabbit=`); `FF.Humans` draws the three guard models unless `?people=standin`.
- **Tests:** `tests/lib.mjs boot()` appends `&intro=0` unless the query names `intro=`; `NOLOADWAIT=1` skips the load wait, `NOGPU=1` uses software GL (very slow); new `tests/t-polish.mjs`.

## Sequence 2 integration, 8 Oct (read this first; it updates everything below, including the two Sequence 2 build sections at the end)

Sequence 1 flows straight into Sequence 2 on one lane with no loading, and the end card follows Sequence 2. The builders' sections at the end of this file still describe each module; this is how they are wired.

- **Load order (`index.html`, scripts `?v=14`):** … `ff-script-s1.js`, **`ff-rules-s2.js`, `ff-level-s2.js`, `ff-script-s2.js`, `ff-lane.js`** (merges `FF.S2` into `FF.S1` at load: every module sees one lane), `ff-shading.js`, `ff-post.js`, `ff-level.js`, `ff-world.js`, **`ff-world-s2.js`**, `ff-camera.js`, `ff-rabbit.js`, `ff-player.js`, `ff-humans.js`, `ff-ai.js`, **`ff-works.js`, `ff-painter.js`, `ff-works-flow.js`**, `ff-events.js`, `ff-audio.js`, **`ff-audio-s2.js`** (registers on `FF.AUDIO_EXT`; `FF.Audio.init` installs it), `ff-ui.js`, `ff-main.js`. The arcade room loads `farfield/index.html?v=4`.
- **Main's call orders (§3):** `INIT` / `RESET` = Level, **Works**, World, Player, Humans, AI, **Painter**, Events, **WorksFlow**, Camera, Audio, UI; `STEP` = **Works** (first: the presses and the gate move before the rabbit collides), Player, Level, AI, **Painter**, Events, **WorksFlow**; `FRAME` = Player, Humans, AI, **Painter** (after Humans: it poses his bones), Events, **Works** (before World: it moves the props), World, Camera, Audio, UI. The automatic tier step-down also waits while `FF.Works.danger()` (a press coming down over the rabbit) or `FF.WorksFlow.scripted()` (an ending or the optional pull-out).
- **The end:** `FF.WorksFlow` owns every settle (`ff-events.js` leaves Sequence 1's own end flow off while it is loaded). Sequence 1's rest: settled → 4 s → `Camera.shot('pull-out')` → back after 8 + 3 s, or at once on input; no fade, no card. Sequence 2: ending (a) rest under the pipe → the pull-out → fade → `FF.Game.endCard()`; ending (b) walk on down the embankment → the camera holds at 207.4 → fade → `endCard()`. `endCard()` saves `completed`, then the title.
- **Saves (`FF.Game.save` / `loadSave`):** one key, **`ff-progress`**, order `courtyard → search-arrive → rest → works-in → works-line → works-out → completed` (`FF.S2.join.saves`); the first `loadSave()` with no `ff-progress` reads Sequence 1's old `ff-s1-progress` once and carries it over (`completed` → `works-in`, so a finished Sequence 1 becomes "Continue from the Works"). Nothing is stored with `?mute=1`.
- **The title (`FF.UI.showTitle({save, order, works, startWorks})`):** the choices are "press → to begin" (Sequence 1), "Continue from …" a save (the Courtyard, the Search, the breathing space, the Works, the long hall, the end of the Works) and, once the save is at `works-in` or later (or with `?start=works`), **"Begin at the Works"** (not shown when the save is `works-in` itself: that is "Continue from the Works"). ↑ ↓ choose; Enter, Space or an arrow starts the chosen one (an arrow also walks the rabbit on, as at the begin). **`?start=works`**: the notice, then the title with "Begin at the Works" chosen. `UI.debug().titleOpts`.
- **The content notice** (the game's first screen and the arcade menu, Josh 7 Oct): "Far Field contains pursuit, capture, dangerous machinery and non-graphic violence towards the rabbit. If the rabbit is caught or harmed, the screen cuts to black and you continue from nearby. No injury is shown." The room: "Content notice: pursuit, capture, dangerous machinery and non-graphic violence towards the rabbit."
- **Debug handle (§10):** `__ff.works` (`FF.Works.debug()`), `__ff.painter`, `__ff.flow` (WorksFlow); `__ff.state()` adds `works`, `painter`, `flow`. Every Sequence 2 checkpoint id works with `?cp=` and `__ff.warp()`: `works-in`, `works-apron`, `works-pitA`, `works-pitB`, `works-passage`, `works-line`, `works-g1`, `works-g2`, `works-pitC`, `works-out`.
- **Sound (`ff-audio-s2.js`, the audio builder; no main change):** `ff-audio.js` gained an extension list `FF.AUDIO_EXT` ({name, install(X), debug()}) and hooks (`X.derive` every frame, `X.walls` for its own sources, `X.mix`, `X.surface`, `X.land`, `X.failCue`, `X.rest`), an ambience bus for loops (N removes them), `{noPub}` cues (not published for the ears) and rooms built on demand (`{lazy}`), so Sequence 1 draws the same noise as before. It reads `FF.Works.press(id)` / `.sluice()` / `.started`, `FF.Painter.debug()` and the bus (`works-start`, `press`, `sluice`, `painter`, `restart`, `fail`, `rabbit:land`); it takes over the far 4 s thud from x 124 (the long hall's bar from the slab on) and hands it to the machines at `works-start`. Debug: `FF.Audio.debug().s2`, `FF.AudioS2.log`.
- **Shading hooks can be per material (`ff-shading.js`):** `FF.addShadingHook({…, only: 'works'})` puts a hook only into materials made with that option (`FF.mat({…, works: true})`; the option is part of the program cache key). The Works' press-lamp footprint mask (`works-foot`) is such a hook: `ff-world.js`' `mat(k)` hands `FF.WorldS2.build` a `works` variant of every material it asks for, and the rabbit's material has it too. Compiled into every material it cost **2.5–3.5 ms a frame at Retina high tier everywhere, Sequence 1 included** (GPU-synced A/B against the committed Sequence 1, verge and courtyard; a uniform gate does not help, the GPU flattens the branch). Now Sequence 1's frames cost what they did before Sequence 2 (13.4–13.9 ms vs 13.2–13.6 ms in the same loaded session), and the Works' frames render pixel-identically to the all-materials version.
- **Integration changes to the builders' files:** `ff-player.js`: the settle chain belongs to its place (a rabbit that settled under Sequence 1's lean-to starts afresh under the pipe, so ending (a) is still there for it; `B.chainAt`); `ff-world-s2.js`: the gate's light is brighter, wider and aimed a little out of the notch (11, 80°, 3.4 m; was 5, 70°, 2.6 m: the light flooding slot B is the first press's one clue and barely showed), and the water sheet's per-thread hash no longer takes `sin()` of numbers in the thousands (beyond float precision on some GPUs); `ff-level-s2.js`: the `hall` look's `sluiceGlow` note matches (11).
- **Tests:** `run-all.sh` adds `check-works.mjs`, `t-works.mjs` (W1–W12), `t-audio-works.mjs` (`RENDER=1`), **`t-works-flow.mjs`** (the shell: the notice, `?start=works`, the save migration, `?mute=1`; 16 checks), and `play.mjs` now plays **both sequences** to the card (`routes.js`: the rest's optional pull-out, then the Works through `works-bot.js`'s plan with real key events; the quick route ends by walking on into the fog, the first-timer fails once under the first press and ends by resting under the pipe). `t-fps.mjs` and `t-perf.mjs` measure the press hall, the passage, the long hall and the outside too. Results: `STATUS.md`, `PROGRESS.md`.

## Integration, 7 Oct (Sequence 1; it updates the sections below)

The parallel build is over and every module is live (`stub: false`). The integrator owns every file now. What this contract gained or changed:

- **Rules folded into `ff-rules.js`** (no longer frozen; the `RULES OVERRIDE` blocks are gone): `rabbit.jumpCutAfter` 0.15 (a quick tap still hops ~0.46 m), `sight.touch.stillBelow` 0.3 (a rabbit sitting still that he walks into makes him stop dead first: NOTICE, then the close-range rule with its telegraph), and the alert-tracking rule (`FF.AI.track`: once alert, he keeps sight along a clear line from his lens to the rabbit's centre point, not into a core, not through the gap, within 10 m). An entry cut short by an alert replays after a restart at `search-arrive`. The checker (`public/farfield/tools/check-search.mjs`) reads the same rules and still passes 18/18.
- **The light rig** (World; created once, never resized). Each logical light owns a rig slot only while its light set is active:

  | set | K0 (shadow) | K1 (shadow) | P0 | P1 | B0 | B1 | D0 (shadow) |
  |---|---|---|---|---|---|---|---|
  | `VD` verge + drain | headlights | vergeTorch | worklight | gateGlare | pipeFill | scrapeFill | sky |
  | `C` courtyard | window | skylight | opening | walkwayDoor | bounce | amber | – |
  | `SR` search + rest | torch | flood | doorSpill | – | doorLamp | – | moon (rest) |

  Owners (Events, Humans, AI) drive theirs through `World.spot(id)` / `World.point(id)`; `World.reset()` puts every driven light out and the owners re-drive them. A few take a derived fallback so a place reads even undriven (`gateGlare` from the headlights, `doorSpill` from door N0, `walkwayDoor` from its leaf, `amber` from the walkway).
- **`FF.Humans.reset()`** hides every figure and puts its torch out; each owner re-drives its figure in its own `frame()` (which runs after `Humans.frame`), so nothing from before a restart draws for one frame.
- **Bus events added by the builders** (payloads in each file's header): Level `walkway-start {cause, t}`, `rest {auto}`; Player `transit {phase}`, `search-entry`, `rabbit:step {x, y, run, surface, place}`, `rabbit:land {x, y, h, surface, place}`, `rabbit:jump`, `rabbit:squeeze {phase, id, short, x}`, `rabbit:reach-fail {x, n}`, `rabbit:pose {pose, kind, step, chain, x}`, `rabbit:mood {mood, from}`, `box {moving, v, x}`, `end {phase: 'settled'}`; AI `ai:state {from, to, x, d, why}`, `ai:aim {phase}`, `ai:hidecheck {phase, cover}`, `entry {phase, interrupted}`, `fail {kind, x, by, state}`; Events `vehicle` (approach · stop · door · leave · gone), `gate` (rattle {dur, hard} · lit-pause · lock · slide · close), `person` (out · kneel · wait · stand · sweep · in), `torch-down` (on · reach · end), `walkway` (boots · lamp · door-open · out · rail · rail-leave · door-r · shut · thud · done), `lamp {id, on}`, `checkpoint {id}`, `end` (pullout · fade · card).
- **Sound** (`ff-audio.js`, its header holds the cue catalogue): footsteps and most world sounds are derived by Audio from movement and published on the bus as `sound {cue, x, y, z, gain, id, src: 'audio'}` (loops every 0.5 s with `loop: true`, ended with `stop: true`), so the rabbit's ears hear them; an explicit `sound` from another module switches off Audio's own derivation of that cue. **N toggles the ambience beds and the music** (every sound cue stays), M all sound.
- **The room** calls the game's `__ff.teardown()` when it stops (a `leave` posted just before the frame is removed dies with it).
- **Debug handle:** `__ff.tick()` (one fixed step; presentation every second step with the true elapsed time) and `__ff.flush()`; `step(n)` and `run(n)` use the same timing, so frame-driven timers keep the simulation's pace however a test chunks its steps.
- **Tests** live in `docs/farfield/tests/` (`bash docs/farfield/tests/run-all.sh`; `PROGRESS.md`). Default port 9921, devtools +100.
- **Cache:** the scripts carry `?v=12`; the room loads `farfield/index.html?v=3` (v2, after Josh's playtest).
- **Status for Josh:** `STATUS.md`.

## Sequence 1 v2, 7 Oct evening (Josh's playtest, BRIEFS §9; SEQUENCE-1.md V1-V7; updates §0, §6, §8.2-§8.9, §12)

### Controls, crouch and gait (V1-V3)

- **Speeds are only what the player asks for** (`ff-player.js`, `FF.RULES.rabbit`): a direction alone is the cautious walk (`walk` 0.95 m/s) for as long as it is held (no hold-to-run: `runAfter` / `runRamp` are gone); **Shift + a direction runs** (`run` 2.75), and while a searcher within 15 m is SPOTTED / AIM / PURSUE / GRAB / LOWER a run is the flee (3.6, at once); a direction alone stays the walk even then. **Down** is the deliberate crouch and crouch-walk (`crouch` 0.75). Squeeze speeds are caps on the speed asked for (a duck-under never speeds a walker up).
- **Input (§6):** the action **`run`** replaces `walk`: main maps ShiftLeft / ShiftRight and the pad's X, RB, RT (buttons 2, 5, 7) to it; a tilted stick alone is the walk, like an arrow. `__ff.run` plans and bot holds use `run`. Shift held down on the title carries into play with the first arrow.
- **Hint:** the Player emits `hint {id: 'hint-run', arg: 'run', x}` once, while moving in the Verge between x 13.0 and 20.5 before the van comes (or, failing that, entering the Courtyard), unless the player has already run for 1 s. UI text `HINTS.run` = "Shift + → run". The title line (§8.9) is now "← → move · Shift run · Space jump · ↓ crouch"; the move hint "← → move"; the jump hint "Space jump" (↑ still jumps and climbs in).
- **No automatic flattening in the open:** the danger / glare reflex in the open is the `freeze` pose (ears back, a slight lowering); `hide` (flat) only under anything lower than `lowPoseUnder` or while Down is held. Watch / peek under cover are unchanged.
- **The anim input gains (§8.3; ff-rabbit.js draws them, every old field keeps its meaning):**
  - `gait {name, phase, stride, cadence, speed, runK, feet, stance, lift}`: `name` 'idle'·'walk'·'run'·'crouch'·'push'·'air'; `phase` 0..1 with 0 = the hind feet touch down, advanced by the distance travelled (`|vx|·dt / stride`, so a planted foot never slides; held in the air at the hind lift-off); `stride` m per cycle (grows with speed); `cadence` Hz; `runK` 0 walk … 1 run (by speed, 1.35–2.1 m/s); `feet {hindL, hindR, foreL, foreR}` planted now; `stance` the windows in use (`{hindL: [on, off], …, lift, cap, dip}`, from `FF.Player.GAITS`); `lift {front, rear}` m, the shoulders' and hips' rise from the hop cycle (an end rises only while its feet are off the ground, never higher or longer than gravity allows; a small dip while loaded). The walk is a slow half-bound (forefeet one after the other, the hind feet together, the hips arcing over the planted forefeet); the run a bound with an extended and a gathered flight.
  - `crouchFront`, `crouchRear` (0..1, eased: the head and shoulders lower first, the hips follow, each rises once it has cleared), `crouchK` (their mean), `crouchHeld` (Down), `run` (Shift held while moving), `squeeze` (`{phase: 'in'·'under'·'out', id, short, clear, k}` or null; a squeeze thinner than the body goes 'in' → 'out').
  - `rabbit:step` (footsteps) now fires from this cycle (the hind feet's touchdown), with `gait` in its payload; `rig.footfall` is no longer read.
- **Checker:** `check-search.mjs` models the same inputs (plans give `{dir, run, crouch}`): RUN mode (Shift) reproduces every amended verdict, WALK mode (the cautious pace) checks fairness at a walk; with the shorter entry, PASS 21/21.
- **`ff-rabbit.js` (§8.3)** draws the gait with leg IK (planted feet). Model path: every moving clip's ground speed is measured at load (clips need not be authored at an exact speed); a clip the file lacks is drawn procedurally, retargeted onto the model's bones; a moving clip whose feet hardly travel is skipped and drawn procedurally (said in the console); `?rabbitanim=auto|clips|proc`; `rig.debug()`; `FF.Rabbit.last` (the rig, for tests). `caught` / `hit` clips, if a file has them, play under the black on the bus `fail` (optional). Nothing probes for a model file: `models/models.json` names it (`"rabbit": "ff_rabbit.glb"`) or `?rabbit=<file>`.
- **`ff-humans.js` (§8.5)**, visuals only: legs placed by IK on the step count the AI keeps (`gait`), stride measured from the figure's own travel, heel-to-toe roll, arms against the legs, a weight shift standing, a heavier silhouette. No AI or timing change.
- **What Josh supplies and the plan for the real characters:** `CHARACTERS.md`.

### The door reveal (V5): the one camera takeover

- **`FF.Events` runs it** (`ff-events.js` REVEAL): start = the earlier of the entry's `cue` and the rabbit's centre at x 90.0, first time only → `Game.control(false)`, `G.flags.revealSafe = true` → the rabbit stops by its own physics; once still `Player.setPose('listen')` then `'freeze'` (under the shelf `'watch'`; mid-squeeze nothing) → `Camera.shot('search-entry-hold', {ease: 1.25})` 0.3 s after the cue → `Camera.shot(null, {release: 1.3})` 1.2 s into `aim-demo` → control back 1.0 s later, with `FF.Input.latch(['left', 'right', 'up', 'jump'])` → 1.2 s grace → `revealSafe` cleared. A safety gives control back at once if his entry ends or is cut short, or after 12 s. Bus: `reveal {phase: start·pan·return·control·end, cause: 'cue'·'trigger', x}`. Debug: `FF.Events.reveal()` → `{phase ('' · hold · show · return · grace), cause, done, held, pose, t, maxX, latched, log}` (also in `debug().reveal`). `reset`: a pause → Restart mid-takeover gives control back and it replays in full; once control has returned it never replays (only a 1 s camera lean if his entry ever replays); a new game forgets it.
- **`FF.Input` latch (main, §6):** `latch(list)` → the listed actions held now count as not held until let go and pressed again (a fresh keydown, a pad rising edge or a bot `press` ends it at once, even inside one step; a release ends it at the step's end; auto-repeat keydown never does); `unlatch()`, `latched` (array), `raw(a)` (held, ignoring the latch). `clear()` also clears the latch.
- **`FF.AI` (§8.6):** while `G.flags.revealSafe` the searcher gets no sight points and no tracking: nothing can see, touch or grab the rabbit.
- **The entry is shorter** (`ff-script-s1.js`, 7.65 s: cue 1.35, doorway 0.6, step-in 1.1, sweep-left 0.25, turn 0.45, aim-demo 2.0, turn-sweep 1.9). The World opens door N0 from the start of the `doorway` segment (`FF.AI.entrySegs`) over 0.5 s and stops the torch behind its glass there; Audio's four footsteps behind the door all fall before it opens.
- **`FF.Camera` (§8.2):** `shot(id, {ease, release})`; `search-entry-hold` fits the span [104.3, 114.5] to the aspect (dist 10.5–12.5) and no longer starts, holds or releases itself (only a safety release if his entry is cut short); `attend(key, {…, place})` limits a lean to one place (the walkway lean stays in the Courtyard). Audit: the reveal is the only takeover; the Courtyard establishing frame releases on movement; the van and walkway leans never take control.

### The world (V6, V7)

- **One sign of resistance:** `FF.S1.decor` `painted-over` (Courtyard back wall, x 65.80–68.58, y 0.45–1.84, z −5.0), drawn by `ff-world.js` `paintedOver()`: a canvas texture painted once at start-up on a panel 3 mm off the wall, lit by the wall's own shading; one draw call; its own seed. No collision, cover, trigger, light, sound, camera or UI. It sits between the Courtyard reveal frame and the puzzle framing, so it is passed, never shown.
- **The Search grade** (`FF.LOOKS.search.grade`): contrast 1.06, lift [0.026, 0.030, 0.037], vignette 0.64 (dark places show their shapes).

### Tests (§12)

`docs/farfield/tests/`: `t-controls.mjs` (22 checks: the walk never speeds up, 30 s held; Shift run and back; the hint; the post; squeeze order and easing; Down; the glare freeze vs Down; flee only with Shift; the gait follows distance), `t-reveal.mjs` + `reveal-page.js` (15 scenarios: still, cautious, forward held through it, Shift run, a running jump into the trigger, hops, the full path from the Courtyard, the lens path, the no-detection guarantee, auto-repeat, mid-skirt, quick re-press, caught after it, pause → Restart in it and in its grace). The bot (`bot.js`) holds `run` for Shift and lets go while control is off; `routes.js` runs on open stretches only in the quick route.



## Sequence 1 v2 review fixes, 7 Oct late evening (SEQUENCE-1.md V8; updates the v2 section above where they differ)

- **`FF.Input` (main, §6):**
  - **Shift** (`run`) is read from every key event's modifier (`e.shiftKey`, keydown and keyup, any key) and is **not** dropped by `clear()` (restart, pause, resume): a held modifier never repeats on macOS.
  - **The latch keeps only unbroken holds:** `off()` (called by Events when a takeover starts) begins watching; a keyup, a non-repeat keydown, a pad edge or a bot hold change while `G.control` is false marks that action broken (`edge(a)`); `latch(list)` latches only listed actions held **without a break** since `off()`. `Game.control(false)`'s own `release()` of bot holds is not a break.
  - **Resume:** a latched direction still held `LATCH_RESUME` (0.8 s) after the latch resumes as the cautious walk: it is unlatched and marked `resumed` (getter `resumed`). A latched jump never fires by itself. (The door reveal's latch only: a failure's latch, since 8 Oct round 2, has no resume: §9.)
  - **The run after it (a125461, 7 Oct night):** `down('run')` is false only while a resumed direction walks on AND the run is the one already held when control came back, still unbroken (`heldRun`, getter `FF.Input.heldRun`). Any Shift press or release after control is back (a non-repeat keydown, a keyup, a pad edge, a bot hold change) ends it at once, and **`FF.Input.graceEnd()`** (called by `FF.Events`' `revealEnd()` when the reveal's 1.2 s grace ends) ends it in any case: Shift always runs once the searcher can see the rabbit again. A Shift keydown counts as a run edge.
  - Tests send key events with `modifiers: 8` while a Shift key is down, as a real keyboard does (`lib.mjs` `b.key`).
- **The door reveal (`ff-events.js` REVEAL):** the pan waits for the rabbit: `Camera.shot('search-entry-hold', {ease: 1.5})` at `max(cue + 0.85, stopped + 0.85)` (at the latest cue + 1.6); under a low shelf the pose is `'prick'` (head up, ears pricked; `Player.setPose('prick')`); the return starts 1.1 s into `aim-demo` (`release: 1.3`) and **control returns at the end of the ease** (6.5 s after the cue). `seen` (the camera on the open door, `doorway` + 0.3 s) is kept for the page session (a warp clears it); a `restart` or `continue` at `search-arrive` after it was seen but before control returned replays only the end: `Events.entryReplay(reason)` (asked by `FF.AI.reset(cp, opts)`) → the AI's `ST.replay` (the door open, the World draws it open), its entry starts at `aim-demo` 0.02 s after the restart, emitting `entry {phase: 'replay'}` (not `cue`: no footsteps behind the door); Events, on the bus `restart`, starts the takeover with `cause: 'replay'` and `Camera.shot('search-entry-hold', {ease: 0})` under the restart's black; `play:start` (the title's Continue) keeps control off while it runs. `reveal()` adds `seen` and `resumed`.
- **`FF.Camera`:** `search-entry-hold` below 1.6:1 may pull back to `distNarrow` 14 and moves its centre right so the gap (`gapX` 113.3) sits at most `gapShare` 0.88 across the frame (zone data in `ff-level-s1.js`, which no longer carries the old hold's fields).
- **`FF.S1.searcher`:** entry 8.0 s (cue 1.95, doorway 0.6, step-in 0.9, sweep-left 0.2, turn 0.45, aim-demo 2.0, turn-sweep 1.9); loop **47.85 s** (the deck `look` 9.0 s); checkpoints `search-arrive` after `loopT` 36.7, `search-skip` 42.5. Checker: 23/23 (two WALK checks added: deck → pallet with no NOTICE leaving 0.5–2 s into the look; deck → skip leaving 0.5 s in never SPOTTED).
- **`FF.RULES.rabbit.hopMin` 1.65, `hopDrag` 0.6:** a hop with a direction held leaves at ≥ hopMin forward, eases off at hopDrag in the air and is never cut by an early release (`S.hop`).
- **`FF.Player`:** hint `{id: 'hint-run-again', arg: 'run-again'}` once per session, entering the Courtyard (x 57.5–66) if the player has not run for 60 s (`B.seen.ranAt`); UI `HINTS['run-again']` is the same "Shift + → run", and both run hints go once Shift is used. The pause screen shows the controls line. Gait: when the cycle changes under a moving rabbit (walk ↔ crouch ↔ push) the phase is remapped to where the feet best match (`gait.remap`); the anim input gains `yaw` (the rig's turned yaw), and `vx` is 0 in the climb and pop-out.
- **`FF.Rabbit` (§8.3):** `buildProcedural` returns one connected skinned surface (a smooth union of the part ellipsoids, surface nets at 4 mm / `detail`, normals from the field, soft skin weights; ears and eyes separate), bound with the legs a little extended (`EXT`), plus `info {verts, tris, grid}`. `ProcAnim`: each foot planted in world (moved back by the body's signed travel along its yaw), swings by a Hermite curve that leaves and lands at ground speed, a planted foot put late into a swing by a cycle change waits for its next stance, the still feet step onto their footprints (one per end, a small lift; a foot still in the air comes straight down); poses may return `feetLock` (the locomotion layers' planted feet are kept under them: freeze, sniff, nibble, look, hide, watch, prick, peek, lookdown, hesitate, flinch).
- **Tools:** `docs/farfield/tools/rig.py` (rig an unrigged rabbit GLB; repaints the base colour to `#c4beb4` unless `--keep-colour`) and `proxy.py` (a connected test rabbit).
- **Tests:** `t-slide.mjs` + `slide-page.js` (foot slide by height: steady gaits, starting, stopping, the hoarding's cycle change, the searcher's feet; turns reported) in `run-all.sh`; `t-reveal.mjs` adds `shelf` (by default), `pressDuringReturn`, `mash`, `restartEarly`, `quitContinue`, `aspect`, and measures the reaction before the pan and the rabbit's place in the frame at control; `t-controls.mjs` adds the walking hop at the post, Shift through a failure and a pause, the pause controls line, the run hint going once used, the Courtyard reminder (30 checks).

## 0. Rules for builders

- **Own only your files** (§1). Need something from another module? Code against this API, guard against it being a stub (`if (FF.X && FF.X.fn)`), and write the need in your report: the integrator wires it.
- **Classic scripts, one global.** Each file is an IIFE that defines one object on `window.FF` (`FF.World`, `FF.Player`, …). No ES modules, no bundler, no new libraries. three.js r128 from cdnjs is the only dependency (`GLTFLoader` r128 from jsdelivr, loaded lazily, only when a model is named).
- **Nothing at load time but definitions.** No three.js objects, no DOM, no listeners until `init()`. Data files and `ff-level.js` must also load in node, for the Search checker.
- **The module contract.** Every module object may implement any of these; `ff-main.js` skips what's missing and isolates every call (an exception is reported once with `console.error` and the game keeps running):

  | method | when |
  |---|---|
  | `init(ctx)` → `void` or `Promise` | once at boot, in the order of §3; build your meshes, register bus listeners and shading hooks here |
  | `reset(cp, opts)` | start, warp, continue, restart after a failure, back to the title: put your state at checkpoint `cp` (§9) |
  | `step(dt)` | every fixed step, `dt` = 1/120 s, in the modes notice, title and play |
  | `frame(dt)` | once per rendered frame (presentation: animation, meshes, lights, camera, sound); not while paused |
  | `setTier(tier)` | quality changes (`FF.TIERS[name]`, §13) |
  | `dispose()` | teardown (the page goes away or the room sends `leave`) |
  | `debug()` → plain object | for `__ff.state()`; keep it small and JSON-safe |
  | `stub: true` | remove it (or set `false`) when your module is real; `__ff.state().modules` reports it |

  `ctx` = `{ THREE, scene, renderer, camera, post, G, bus, rules: FF.RULES, level: FF.S1, look: FF.LOOK, tier, Q, silent }`.
- **Numbers live in data.** Geometry, covers, triggers, checkpoints, camera zones: `FF.S1` (`ff-level-s1.js`). The routine and scripted beats: `FF.S1.searcher / .verge / .walkway` (`ff-script-s1.js`). Rules: `FF.RULES` (`ff-rules.js`). The look: `FF.LOOK` (`ff-config.js`) plus per-place overrides in `ff-world.js`.
- **`ff-rules.js` is frozen during the parallel build.** If you need a rule changed, override it in **your own file** in one block marked `/* RULES OVERRIDE (fold into ff-rules.js at integration) */` (for example `FF.RULES.rabbit.duckUnder.speed = 1.5;` at the top of `init`) and list it in your report.
- **Search geometry and perception change only with the checker re-run** (`docs/farfield/checks/`, §12).
- **Use `FF.rng()`, never `Math.random()`,** in anything that affects play, so headless runs are deterministic (`?seed=n`, `__ff.seed(n)`).
- **Collision and sight are 2D data, never meshes.** The x/y lane plane; z only places things in 3D.
- **Content rules** (SEQUENCE-1.md §1): the rabbit is the only animal; no cages, bars or mesh near the rabbit, no labs, no rescue story, no animal-derived items; no hands, weapons or combat for the rabbit; no blood, no body, no slow motion, nothing that rewards harm; no slogans (one exception, V6: sparse, weathered, physical signs that some people resist animal use, such as the painted-over graffiti, never in UI, dialogue or a camera emphasis); never the words "go vegan".

## 1. Files and owners

Everything is under `public/farfield/` unless noted. **One writer per file.** The integrator owns everything after the build phase.

| file | owner | what |
|---|---|---|
| `index.html` | architect → integrator | the game page; load order (§2) |
| `js/ff-main.js` | architect → integrator | renderer, post, tiers, the 120 Hz loop, input, modes, module wiring, restart, parent protocol, settings, teardown, `window.__ff` |
| `js/ff-core.js` | architect → integrator | `FF.bus`, `FF.util`, `FF.rng`, `FF.geo`, `FF.store`, `FF.report`, `FF.Q`, `FF.SILENT` |
| `js/ff-config.js` | architect → integrator | `FF.LOOK` (the approved look), `FF.TIERS`, `FF.MODELS` |
| `js/ff-rules.js` | architect → integrator (frozen during the build) | `FF.RULES` |
| `js/ff-shading.js`, `js/ff-post.js` | architect → integrator | the shared surface look + hook points (§8.10); the post chain + in-pass fade |
| `models/models.json` | architect → integrator | which model files exist (null = stand-in) |
| `look.html`, `look/*.js` | **frozen** | the approved look test, never edited |
| `tools/bake-rabbit.html` | architect → integrator | exports the procedural rabbit as a test .glb (uses `js/ff-rabbit.js`) |
| `js/ff-level-s1.js` | **world builder** | `FF.S1` geometry, covers, occluders, triggers, checkpoints, camera zones, decor |
| `js/ff-level.js` | **world builder** | `FF.Level`: queries over `FF.S1`, triggers on the bus, places (§7) |
| `js/ff-world.js` | **world builder** | `FF.World`: every place's sets, the fixed light rig, beams, rain, looks, props, core mask (§8.1) |
| `js/ff-camera.js` | **world builder** | `FF.Camera`: zones, spans, holds, attention, shots (§8.2) |
| `js/ff-rabbit.js` | **rabbit builder** | `FF.Rabbit`: the temporary rabbit, its procedural layers, the model slot (§8.3) |
| `js/ff-player.js` | **rabbit builder** | `FF.Player`: movement, links, behaviours, moods, ears (§8.4) |
| `js/ff-script-s1.js` | **humans + events builder** | `FF.S1.searcher / .verge / .walkway` |
| `js/ff-humans.js` | **humans + events builder** | `FF.Humans`: the one stand-in human (three roles), the van, torch alignment (§8.5) |
| `js/ff-ai.js` | **humans + events builder** | `FF.AI`: the searcher's routine, perception, states, telegraphs, `fail` (§8.6) |
| `js/ff-events.js` | **humans + events builder** | `FF.Events`: the Verge and walkway beats, checkpoints, the failure flow, the end (§8.7) |
| `tools/check-search.mjs` (new) | **humans + events builder** | the Search checker reading `FF.S1` + `FF.RULES` (§12) |
| `js/ff-audio.js` | **audio + UI + room builder** | `FF.Audio`: the synthesised sound engine (§8.8) |
| `js/ff-ui.js` | **audio + UI + room builder** | `FF.UI`: notice, title, pause, hints, end card, messages (§8.9) |
| `../farfield-room.js`, `room-test.html` | **audio + UI + room builder** | the arcade wrapper and its test page (§11) |
| `docs/farfield/SEQUENCE-1.md`, `INTERFACES.md`, `checks/` | architect → integrator | design, contract, checker reference |
| `docs/farfield/STATUS.md`, `PROGRESS.md` | integrator | for Josh: implemented / temporary / blockers; how to play and test |
| `docs/farfield/ASSETS-3D.md`, `RENDERING.md` | integrator (builders: report changes) | what to commission; how it is rendered |

## 2. Load order (index.html)

```
three.min.js (cdnjs r128)
js/ff-config.js   FF.LOOK, FF.TIERS, FF.MODELS
js/ff-core.js     FF.bus, FF.util, FF.rng, FF.geo, FF.store, FF.report, FF.Q, FF.SILENT
js/ff-rules.js    FF.RULES
js/ff-level-s1.js FF.S1 (geometry …)
js/ff-script-s1.js FF.S1.searcher / .verge / .walkway
js/ff-rules-s2.js  FF.RULES.works / .painter (Sequence 2)
js/ff-level-s2.js  FF.S2 (the Works' geometry, shelters, checkpoints, camera, looks, the join)
js/ff-script-s2.js FF.S2.works / .painter / .end
js/ff-lane.js     FF.Lane: merges FF.S2 into FF.S1 at load (one lane)
js/ff-shading.js  FF.U, FF.mat, FF.glow, FF.patch, FF.applyShading, FF.addShadingHook, FF.setAOBox, FF.lin
js/ff-post.js     FF.Post
js/ff-level.js    FF.Level
js/ff-world.js    FF.World
js/ff-world-s2.js FF.WorldS2 (the Works' places, props, lights; ff-world.js calls it)
js/ff-camera.js   FF.Camera
js/ff-rabbit.js   FF.Rabbit
js/ff-player.js   FF.Player
js/ff-humans.js   FF.Humans
js/ff-ai.js       FF.AI
js/ff-works.js    FF.Works (the presses, the gate, the cut)
js/ff-painter.js  FF.Painter (the maintenance worker)
js/ff-works-flow.js FF.WorksFlow (shelter checkpoints, both endings, Sequence 1's optional pull-out)
js/ff-events.js   FF.Events
js/ff-audio.js    FF.Audio
js/ff-audio-s2.js FF.AudioS2 (the Works' sound, an FF.AUDIO_EXT extension)
js/ff-ui.js       FF.UI
js/ff-main.js     boots everything
```
Scripts carry `?v=N`; the integrator bumps N when shipping.

## 3. The game loop and the modes (`ff-main.js`)

**Boot.** Read settings (`ff-mute`, `ff-music`), fetch `models/models.json` into `FF.MODELS`, then `init(ctx)` in this order, awaiting each: **Level, World, Player, Humans, AI, Events, Camera, Audio, UI**. Then `setTier`, `restart('verge-start', {reason: 'title', first: true})`, two warm-up steps, `renderer.compile(scene, camera)` (warms the start tier behind the notice, A22), mode `notice`, post `{ty: 'ready'}` to the parent. `?cp=<id>` skips the notice and the title and starts play there.

**Modes** (`FF.G.mode`; every change emits `mode {from, to}` and clears input):

| mode | stepping | what shows | leaves by |
|---|---|---|---|
| `boot` | no | black | → `notice` |
| `notice` | yes (the title scene runs behind it) | the content notice (UI) | Continue (Enter, Space, click; unlocks audio) → `title`; Esc / Back → `{ty:'exit'}` |
| `title` | yes, `G.control = false` | "FAR FIELD" over the live Verge, the rabbit grooming beneath its shelter (A5) | ← / → (the arrow also moves the rabbit at once), Enter, Space → `play`; ↓ + Enter: continue from a save; Esc → exit |
| `play` | yes | the game | Esc or P → `pause`; `FF.Game.endCard()` → `end` |
| `pause` | no (no `frame()` either) | the pause menu | Esc / P / Enter → `play`; Restart from checkpoint; Back to the arcade |
| `end` | no | the end card over black | → `title` |

There is **no fail mode**: a failure is a cut to black inside `play` with `G.control = false` (§9).

**Each fixed step** (1/120 s, at most 24 per frame): `G.t += dt` → `Works.step` (Sequence 2: the presses move first) → `Player.step` → `Level.step` (place, triggers) → `AI.step` → `Painter.step` → `Events.step` → `WorksFlow.step` → input presses cleared.
**Each frame:** fade animation → `Player.frame` → `Humans.frame` → `AI.frame` → `Painter.frame` → `Events.frame` → `Works.frame` → `World.frame` → `Camera.frame` → `Audio.frame` → `UI.frame` → draw (`post.render(scene, camera, World.look, tier, time, G.fade)`). (Boot: `init` in the order Level, Works, World, Player, Humans, AI, Painter, Events, WorksFlow, Camera, Audio, UI.)
Not stepping or presenting while the tab is hidden; a hidden tab in play pauses (`visibilitychange`). Window blur releases held keys.

**Quality tiers** (look test, `FF.TIERS`): Q cycles; `?q=` fixes; phones start on low. The automatic step-down (> 21 ms average over 2 s) is held unless `G.mode === 'play' && !FF.AI.danger() && !FF.Events.scripted()` (A22). A tier change calls every module's `setTier`, marks every `FF` material `needsUpdate`, and resizes.

## 4. Shared state: `FF.G`

One object, read by everyone; **each field has one writer**.

| field | writer | meaning |
|---|---|---|
| `mode`, `t`, `frameT`, `control`, `fade`, `tier`, `muted`, `music`, `debug`, `clean` | main (`FF.Game`) | mode; sim time (s, fixed steps); presentation time; the rabbit takes input; 0 picture … 1 black; quality; settings; `?debug=1`; `?clean=1` |
| `place` | Level | section id under the rabbit: `verge`, `drain`, `courtyard`, `search`, `rest` |
| `checkpoint` | Events (main sets it on restart) | the restart point id |
| `rabbit` | Player | `{ x, y, z, vx, vy, face (±1), grounded, crouch, squeeze ({solid, clear, short} or null), onBox, push, effort, mode ('play'·'climb'·'transit'·'popout'…), modeT, mood, pose, still (s), visible, landed, airT, yaw }` |
| `box` | Player | `{ x, vx, w, h, d, minX, maxX }` |
| `searcher` | AI | `{ active, state, x, y, z, face (±1, 0 turning), pitch, half, kneel, torchOn, kind, loopT, entryT, s (suspicion 0…1), lit (0…1), litBy }` |
| `flags` | Events (AI sets `entryDone`) | run progress: `vergeDone`, `walkwayDone`, `entryDone`, … |

## 5. The event bus: `FF.bus`

`on(name, fn) → off()`, `once(name, fn)`, `off(name, fn)`, `emit(name, data)`, `clear()`; `'*'` listens to everything; `FF.bus.log` keeps the last 200 events (tests read it). Dispatch is synchronous; a throwing listener is reported and skipped. **Payloads are plain objects.** Emit facts, not commands (say what happened; listeners decide what to do).

| event | payload | emitted by | typical listeners |
|---|---|---|---|
| `mode` | `{from, to}` | main | UI, Audio |
| `play:start` | `{cp}` | main | UI (hints), Events, Audio |
| `restart` | `{cp, reason}` (`fail`·`warp`·`continue`·`title`·`restart`) | main, after every module's `reset` | anyone |
| `mute`, `music` | `{on}` | main | UI |
| `place` | `{id, prev}` | Level | World, Audio, UI |
| **trigger events**, named by `FF.S1.triggers[].event` | `{id, arg, x}` | Level | see below |
| `hint` | `{id, arg}` (`move`·`jump`·`push`·`go-in`) | Level (trigger) | UI |
| `sound-cue` | `{arg: 'far-boom'}` | Level (trigger) | Player (ears), Audio, Events |
| `vehicle-arrive`, `gate-lit`, `person-out`, `rabbit-in-pipe` | trigger payload | Level | Events (the Verge), Camera |
| `shake-off`, `camera-shot`, `walkway-timer`, `safe`, `rest` | trigger payload | Level | Player, Camera, Events |
| `search-entry` | `{arg: 1.5}` (delay) | Player (the duct link) | AI |
| `transit` | `{phase: 'climb'·'start'·'end'}` | Player | Camera (dolly), World (look blend), Audio |
| `rabbit:land` | `{x, y}` | Player | Audio |
| `rabbit:squeeze`, `rabbit:reach-fail`, `rabbit:pose` | `{…}` | Player (to add) | Audio, Events (walkway trigger `reach-fail`), Camera |
| `box` | `{moving, v}` on start / stop | Player (to add) | Audio (scrape), Events (`first-push`) |
| `sound` | `{cue, x, y, z, gain, surface, run, loop, id}` | anyone | Audio plays it; Player's ears weigh it (§4.2 salience) |
| `entry` | `{phase: 'cue'·'doorway'·'aim-raise'·'aim-lowered'·'done'}` | AI | Camera (A12 hold), Audio, Events |
| `ai:state` | `{from, to, x, d}` | AI (to add) | Camera (A13), Player (mood, flee), Audio (drone) |
| `vehicle`, `walkway`, `torch-down`, `gate` | `{phase, …}` | Events (to add) | Camera (attend, drain hold), Player (ears), Audio |
| `fail` | `{kind: 'shot'·'caught', x}` | AI, on the exact step of the grab or the shot | Events (the flow), Audio (the report or scuff under black) |
| `checkpoint` | `{id}` | Events | UI, Audio |
| `end` | `{phase: 'settled'·'pullout'·'card'}` | Player (`settled`), Events | Camera, Audio, UI |
| `debug:overlay` | `{}` | main (O with `?debug=1`) | anyone with an overlay |

Add events freely; list new ones in your report with their payloads.

## 6. Input: `FF.Input` (main)

Actions: `left`, `right`, `jump`, `up`, `down`, `run` (V1; was `walk`). Keys: ← / A, → / D (the cautious walk), **Space → jump; ↑ / W → up and jump** (A2), ↓ / S, **Shift → run**. Gamepad (standard mapping, polled while focused): stick / d-pad move, **X, RB or RT → run**, A jump, Y or d-pad up → up + jump, B or d-pad down → crouch, Start → pause.

| call | meaning |
|---|---|
| `FF.Input.down(a)` | held now (keyboard, gamepad or a bot hold), unless latched |
| `FF.Input.raw(a)` | held now, ignoring the latch |
| `FF.Input.latch(list, opts)` / `unlatch()` / `latched` / `resumed` / `off()` / `edge(a)` / `graceEnd()` / `heldRun` | the takeover latch (V5, V8): listed actions held without a break since `off()` count as not held until let go and pressed again; a direction still held 0.8 s later resumes as the walk; a run held through the takeover is held back (`heldRun`) until Shift is pressed or released again or the reveal's grace ends (`graceEnd()`, a125461). `opts.resume === false` (the failure restart, 8 Oct round 2): no resume, a latched direction acts only when pressed again |
| `FF.Input.clear(keepHeld)` | drop presses, latches and pad state; held keys too unless `keepHeld` (the failure restart keeps them for its latch); Shift is never dropped |
| `FF.Input.took(a)` | consume a press made since the last fixed step; presses are dropped after every step (buffer in your module if you want, e.g. the jump buffer) |
| `FF.Input.peek(a)` | look without consuming |
| `FF.Input.axis()` | −1 … 1 |
| `FF.Input.lastInputT` | `G.t` of the last input (idle behaviours) |
| `hold(a, on)`, `press(a)`, `release()` | bot hooks (also on `__ff`) |

Only the Player reads movement input, and only while `G.control`. Global keys handled by main: Esc / P (pause, or exit from the notice and title), M (sound), N (music), Q (tier), F (fps), O (overlay with `?debug=1`). Outside play, main first asks `FF.UI.key(code, mode)` (§8.9).

## 7. Level data and `FF.Level`

**`FF.S1`** (`ff-level-s1.js`; units m; +x along the journey, +y up, +z towards the camera; the lane is z = 0; main floors at y = 0):

| field | shape |
|---|---|
| `sections[]` | `{id, x0, x1, look, beat, title}` |
| `lookBlends[]` | `{from, to, x0, x1}` or `{continuous}` or `{transit: 'duct'}` |
| `spawn` | `{x, y, face, pose}` |
| `ground[]` | `[x, y]` piecewise linear; a repeated x is a vertical step |
| `solids[]` | `{id, x0, x1, y0, y1, kind ('wall'·'kerb'·'ceiling'·'edge'), z0?, z1?, note?}` |
| `pushables[]` | `{id, x, w, h, d, minX, maxX, accel, friction, push}` |
| `links[]` | `{id, kind ('drop'·'raised-opening'·'squeeze'), …}` (the culvert, the duct, the gap) |
| `covers[]` | `{id, x0, x1, y1, core [a, b] (rabbit-centre), refuge (= core, A11), kneelEnds[], mask, checkpoint?, exit?}` |
| `occluders[]` | solid ids that block light and sight |
| `areaLights[]` | `{id, x0, x1, on ('always'·'door-open')}` |
| `triggers[]` | `{id, x0, x1, yMax?, event, arg?, still?, nearBox?, onBox?, repeat?, cooldown?, alt?, alsoOn?}` or `{id, link, event, arg}` |
| `checkpoints[]` | `{id, x, y, face, pose?, save?, when?, searcher?: {loopT} or {beforeEntryDone: 'entry', after: {loopT}}}` |
| `camera` | `{base, zones[]}` (§8.2) |
| `decor[]` | story set pieces without collision (the culvert mouth, the strange silhouettes, the Works) |

**`FF.S1.searcher`** (`ff-script-s1.js`): `pathZ`, `nodes {N0…N5: [x, y, z]}`, `floorMinX`, `entry[]` (`[kind, seconds, node, note]`), `loop[]` (`[kind, node, speed]` for walks, `[kind, node, seconds]` for climb/descend, `[kind, seconds, 'left'|'right']` in place), `loopT` 47.85 (V8). **`FF.S1.verge`**, **`FF.S1.walkway`**: the beats' timings (SEQUENCE-1.md §6.2, §7.2, A8, A14).

**`FF.Level`** (pure logic, node-safe):

| call | returns |
|---|---|
| `groundY(x)` | the ground profile's height (the higher side at a step) |
| `floorUnder(x, hw, y, tol)` | the floor under a body `[x ± hw]` at height `y`: the highest ground or solid top ≤ `y + tol` |
| `hitSolid(x0, x1, y0, y1)` / `solidsIn(…)` | the first / all solids overlapping a box |
| `ceilingAbove(x, hw, y)` | the lowest solid underside at or above `y` (Infinity if open) |
| `clearance(x, hw, y)` | ceiling − floor |
| `squeezeAt(x, hw, y)` | `{solid, clear, short}` if a squeeze (0.16–0.235) is overhead; `short` = a duck-under (A9) |
| `segmentBlocked(ax, ay, bx, by)` | true if the 2D segment crosses an occluder (A6: the only sight test) |
| `coverAt(x, hw)`, `coreAt(x)` | the cover whose extent holds the body / whose core holds the centre |
| `section(x, y)`, `lookBlend(x)` | the place id; `{from, to, t}` |
| `checkpoint(id)` | the checkpoint object |
| `step(dt)` | updates `G.place` (emits `place`) and fires triggers on the bus |
| `reset(cp)` | one-shot triggers whose x0 is behind the checkpoint count as fired |

## 8. Module APIs

### 8.1 `FF.World` (world builder)

Builds everything you see that isn't the rabbit or a person, **from the data**: the Verge (wall panels with joints, grass, the post, the hoarding, the gate, the culvert mouth, the title shelter), the drain in cut-away, the Courtyard (the look test re-placed, A17), the Search yard (A0, deck with steps, pallets, skip with its rear door, the annex wall with the door and gateway, the floodlight pole, the fence; every cover **closed on its back face**, A16; the strange silhouettes, A24), the rest (lean-to, weeds, low wall, the Works for the pull-out). Per-place looks `FF.LOOKS` (dusk → night, A1) blended into `World.look` where the player can't judge light. Rain (A18: only what the journey needs). Cone beams for the torch, headlights and floodlight (they read the light's shadow map). The core mask (A6) via shading hooks.

| member | contract |
|---|---|
| `look` | the live blended look (the same shape as `FF.LOOK`); main passes it to post; call `FF.applyShading(look)` when you change it |
| `spot(id)` → handle | `{ slot, light (THREE.SpotLight), set({pos, target, angle, penumbra, intensity, color, distance, decay}), on(bool), beam(bool) }`. Ids: `headlights`, `vergeTorch`, `worklight`, `gateGlare`, `window`, `opening`, `walkwayDoor`, `torch`, `flood`, `doorSpill`. `on(false)` = dormant (intensity 0, no shadow work) |
| `point(id)` → handle | `{ slot, light, set({pos, color, intensity, distance}), on(bool) }`. Ids: `bounce`, `amber`, `doorLamp` |
| `prop(id)` → `THREE.Object3D` | the movable set pieces others animate: `box` (Player moves it), `gateLeafL`, `gateLeafR`, `doorN0`, `walkwayDoorL`, `walkwayDoorR`, `fenceSheet`, `amberLamp`, `culvertSlab`, … Unknown ids return an empty group (never crash) |
| `rig` | the fixed rig `{H, K0, K1, D0, D1, P0, P1, B0, B1}` (SEQUENCE-1.md §13). **Created once at init; never add or remove lights in play** (three recompiles every shader for a new light count). K0 and K1 are the shadow-casting spots (spot index 0 and 1), D0 the shadowed directional (sky / moon) |
| `overlay(on)` | debug drawing: solids, covers + cores, triggers (O with `?debug=1`) |
| `apply()` | push live-tuned look numbers (`__ff.apply()`) |
| `frame(dt)` | looks, the sky shadow box following the camera, rain, beams, decor motion |

### 8.2 `FF.Camera` (world builder)

Directs the one `THREE.PerspectiveCamera` main made. Side-on, fov 26°, eye level lens-shifted (`projectionMatrix.elements[9] = 2·horizon − 1`), never cuts in play. Zones from `FF.S1.camera.zones` (A12 entry hold, A13 danger framing, held breath, rest-intimate, pull-out…).

| call | contract |
|---|---|
| `resize(w, h)` | main calls on size changes; re-projects |
| `project()` | apply fov + lens shift |
| `snap()` | jump to the current play framing (warps, continue, restart) |
| `shot(id, opts)` | a scripted shot or held zone: `title`, `courtyard-reveal`, `search-entry-hold` (the door reveal, run by Events, V5), `duct-transit`, `pull-out`; `shot(null)` ends it. `opts {ease, release}` (s) |
| `toPlay(seconds)` | ease from the title shot into play |
| `attend(key, {x, y, w, t, still, within, place})` / `attend(key, null)` | attention requests (the van, the walkway worker, the searcher); `place`: only while the rabbit is there |
| `reset(cp)`, `frame(dt)`, `debug()` | `debug()` → `{zone, shot, x, y, dist, horizon, attends}` |

The camera reads `G.rabbit` and `G.searcher` itself, and listens to `transit`, `entry`, `ai:state`, `torch-down`, `end`.

### 8.3 `FF.Rabbit` (rabbit builder)

`FF.Rabbit.create(look, { file })` → `Promise<rig>`; `file` comes from `FF.MODELS.rabbit` (null = the procedural rabbit; `?rabbit=` overrides). `rig = { object, update(dt, anim), kind ('procedural'·'model'), info, … }`. `anim` (extend freely, keep these): `{ speed, vx, vy, grounded, crouch, push, effort, landed, airT }` plus Sequence 1's procedural layers and poses (`pose`, `ears {yawL, yawR, pitch, flat}`, `breath {hz, amp}`, `tailUp`, `headYaw`, `startle`, …). Keep `FF.Rabbit.buildProcedural`, `FF.ProcAnim` and `rabbitMaterial` working for `tools/bake-rabbit.html`. The clip names are in `ASSETS-3D.md`.

### 8.4 `FF.Player` (rabbit builder)

The rabbit as an individual: movement (look-test feel; A9 squeezes; flee 3.6 m/s only when `G.searcher.state` is spotted / aim / pursue / grab within 15 m), the box (head-push, no pull; it can't climb ≥ 0.02 m), jump (Space or ↑; coyote, buffer, cut), the reach-fail (A15), links (the culvert drop, the climb into the raised opening, the duct transit, the pop-out → emits `search-entry`), and the behaviours (moods, the ears reacting to `sound` events and nearby humans by themselves (A2), breathing, sniff, groom, settle, hesitate, freeze, flatten in cover, the settle chain (§11) → emits `end {phase: 'settled'}`). Expressive poses never take control in danger (§4.2).

| member | contract |
|---|---|
| `init(ctx)` (async) | creates the rig, adds it to the scene, points `G.rabbit` / `G.box` at its state |
| `reset(cp)` | rabbit at `cp.x, cp.y, cp.face`, pose `cp.pose` (`groom` at the title, `hide` = crouched in a Search core); the box back at its start |
| `sightPoints()` | the 3 sight points `[[x, y], …]` in world space (`FF.RULES.rabbit.samples`, crouched set when crouched, squeezing or under a ceiling < 0.35 m) |
| `setPose(name)` | scripted poses others may ask for: `groom`, `hide`, `look-back`, `settle`, … |
| `step(dt)` | reads `FF.Input` only while `G.control` |
| `frame(dt)` | the rig's transform and animation; `FF.U.uFFRab` (contact shadow); the box's `World.prop('box')` position and AO box 0 |

### 8.5 `FF.Humans` (humans + events builder)

| member | contract |
|---|---|
| `create(role)` → figure | role `verge`·`worker`·`searcher` (A4: one model, props by role; the worker never carries a gun or a torch) |
| figure | `{ role, object, st, set({x, y, z, face, anim, speed, visible, torch: {on, pitch, half}, gun: 'slung'·'aim'}), eye(), torchLens(), attachTorch(worldSpotHandle), dispose() }`. Anim names: `idle`, `walk`, `walk-search`, `run`, `turn`, `notice`, `kneel`, `crouch-look`, `climb`, `descend`, `step-down`, `door-step-in`, `aim`, `lunge`, `reach`, `unlock`, `torch-down`, `rail-look-out`, `shake-sheet`, `stand` |
| `createVan()` → van | `{ object, st, set({x, z, yaw, visible, lights, door, engine}), headlightAnchors() }` |
| `frame(dt)` | animates every figure and keeps each attached torch light on the lens, its axis meeting the lane at the 2D aim point (A16) |

Model slots: `FF.MODELS.human`, `FF.MODELS.van` (ASSETS-3D.md); no file = the stand-ins.

### 8.6 `FF.AI` (humans + events builder)

The searcher: the entry (starts `arg` s after `search-entry`), the 47.85 s loop (V8), perception by the **one detection model** (A6), suspicion (SEQUENCE-1.md §9.2), NOTICE → INVESTIGATE / SPOTTED → reaction → grab / aim / pursue → hide check (A11) → LOST → WARY, the gap, every telegraph (§9.5), and `fail {kind}` on the exact step of the grab or the shot. Also emits `entry {phase}` and `ai:state`, and `sound` for his footsteps (silent when stopped), the click, the breath.

| member | contract |
|---|---|
| `see(pose, pts, opts)` | **the reference detection model** (A6), pure: `pose {x, y, face, kneel, torchOn, pitch, half}`, `pts` = the rabbit's sight points, `opts {doorOpen, floorY}` → `{w, src ('torch'·'area'·'dark'·'touch'·''), d}`. The checker port uses the same function |
| `fillTime(src, d)` | suspicion fill time for a seen weight |
| `danger()` | true while NOTICE / SPOTTED / AIM / PURSUE / grab / hide check (main holds the tier step-down; the camera frames) |
| `setLoopT(t)` | test hook: the searcher at loop time `t` |
| `reset(cp)` | from `cp.searcher`: the entry (if not yet done) or `loopT`; off outside the Search |
| `debug()` | `{state, active, x, y, face, kind, loopT, entryT, s, lit, litBy, pitch, timers…}` (`__ff.ai`) |

### 8.7 `FF.Events` (humans + events builder)

The Verge (the van, headlights along the joints, the stop at the gate, the glare, door, boots, the chain looping (A8), the glare reaction, the lock giving on the drop, the person at the culvert, the torch down the crack only when the rabbit is in the pipe (A14), the reach that falls short, the van leaving), the walkway worker and the amber lamp and the far thud (A4), checkpoints and saves, **the failure flow** (§9), and the end (settled → `Camera.shot('pull-out')` → fade → `FF.Game.endCard()`).

| member | contract |
|---|---|
| `fail(kind)` | starts the failure flow (also on the bus event `fail`) |
| `scripted()` | true while a staged beat or the failure flow runs (main holds the tier step-down) |
| `reset(cp, opts)` | progress flags implied by `cp`; stops any beat; (re)starts the beats that belong after `cp` |
| `step(dt)` | checkpoint activation: progress checkpoints by x; Search checkpoints when the rabbit's centre is in that cover's core and `!FF.AI.danger()`; the door reveal (V5) |
| `reveal()` | the door reveal's state: `{phase, cause, done, seen, held, pose, t, maxX, latched, resumed, log}` |
| `entryReplay(reason)` | (V8) true when a restart / continue should replay only the end of his entry (the reveal was seen, not finished) |

### 8.8 `FF.Audio` (audio + UI + room builder)

The engine only; main owns the settings, storage and the parent protocol (§11). **With `FF.SILENT` (`?mute=1`) never create an AudioContext.** Create nothing before `unlock()` (main calls it from the notice's Continue and the title's start, both user gestures).

| call | contract |
|---|---|
| `unlock()` | make or resume the context (cheap to repeat) |
| `mute(on)`, `music(on)`, `hidden(on)` | all sound; music / the pad only; tab hidden or paused |
| `frame(dt)` | the listener at the camera (pan by x), beds by `G.place` and the look blend, loops (rain, engine idle, floodlight hum), the drone from `G.searcher` |
| bus | plays `sound` events; reacts to `fail` (one muffled report or the scuff, under black, nothing else), `ai:state`, `place`, `transit`, `entry`, `end`, `box`, `rabbit:*` |
| `debug()` | `{silent, unlocked, muted, music, context, heard{…}}` |

### 8.9 `FF.UI` (audio + UI + room builder)

| call | contract |
|---|---|
| `showNotice()` / `hideNotice()` | the content notice, the game's first screen every launch (SEQUENCE-1.md §17): Continue, Back to the arcade |
| `showTitle({save})` / `hideTitle()` | "FAR FIELD", the controls line ("← → move · Shift run · Space jump · ↓ crouch", V1), "press → to begin", Continue from a save |
| `showPause()` / `hidePause()` | Resume, Restart from checkpoint, Back to the arcade |
| `key(code, mode)` | keys outside play: return a command string (`'continue'`, `'start'`, `'start:<cp>'`, `'resume'`, `'restart'`, `'exit'`, `'title'`), `true` (consumed) or `null` (main's default) |
| `hint(id)` | first-time hints (bottom-left, 4 s; `move`, `run` (V1: "Shift + → run", sent by the Player), `jump`, `push`, `go-in`); only in play, never in the Search, none with `?clean=1` |
| `endCard()` → Promise | "to be continued": fade in 1.0 s, hold 3.5, fade out 1.0; any key skips after 1 s |
| `message(text, onClick)` | e.g. the WebGL context was lost |

UI buttons call `FF.Game.command(name)`. **The cut to black is not UI**: it is post's in-pass fade (`FF.Game.cut()` / `fade()`), so it lands on the exact frame.

### 8.10 Shading hooks and post (shared, architect → integrator)

- `FF.mat(spec)` → a matte `MeshStandardMaterial` patched with the approved look (fog and haze, contact AO, mottling, rim, wall fill, the soft shadow filter). `FF.glow(rgb)` for emissive bits. `FF.lin(hex)` sRGB → linear.
- `FF.applyShading(look)` pushes a look into the shared uniforms `FF.U`. `FF.setAOBox(i, c, h, k, reach)`: contact-shadow boxes 0…5; **index 0 is the box (Player)**, 1…5 are the world's.
- `FF.U.uFFKeyMode`: 1 = spot index 0 gets the look test's window mask and streaks (the Courtyard key); 0 = a plain cone (the torch, the headlights). The world sets it per place.
- **`FF.addShadingHook({ key, uniforms, pars, spot, lights, fog, only })`** — extend every patched material without editing `ff-shading.js` (`only`, Sequence 2: just the materials made with that option, e.g. `FF.mat({…, works: true})`). Register in `init()`, before the first render:
  - `pars`: GLSL at file scope (`vFFW` = world position);
  - `spot`: GLSL inside `void ffSpotMod(const in int i, const in vec3 p, inout vec3 c)` for each spot light `i` (shadow casters first, in the order added: K0 = 0, K1 = 1). The core mask (A6) goes here;
  - `lights`: GLSL after the lighting sums (`reflectedLight`, `diffuseColor`, `ffN`, `ffO` in scope): wet floors, darkness boxes;
  - `fog`: GLSL after the fog (`gl_FragColor`).
- A spot with `shadow.radius < 0` is dormant: its shadow lookup returns 1 with no taps.
- `post.render(scene, camera, look, tier, time, fade)`: `fade` 0…1 darkens in the final pass; `fade >= 1` outputs pure black without drawing the scene.

### 8.11 `FF.Game` (main) — what modules may call

| call | meaning |
|---|---|
| `restart(cpOrId, opts)` | every module's `reset(cp, opts)` in order (Level, World, Player, Humans, AI, Events, Camera, Audio, UI), clears input, emits `restart` |
| `cut()` | the next drawn frame is black |
| `fade(to, seconds)` → Promise | animate `G.fade` |
| `control(on)` | whether the rabbit takes input |
| `pause()`, `resume()`, `toTitle()`, `play(cpId)`, `endCard()` | the mode machine |
| `save(id)`, `loadSave()` | progress (`ff-progress`: courtyard → search-arrive → rest → works-in → works-line → works-out → completed; an old `ff-s1-progress` is carried over once, its `completed` as `works-in`) |
| `setMute(on)`, `setMusic(on)` | settings (also posts to the parent) |
| `send(msg)`, `exit()` | to the parent page |
| `command(name, arg)` | what the UI's buttons and keys trigger |
| `cp(idOrObj)` | resolve a checkpoint |
| `scene`, `renderer`, `camera`, `postFX`, `tier`, `setTier(name)` | |

## 9. Checkpoints, restart and the failure flow

**Checkpoints** are data (`FF.S1.checkpoints`). Events tracks the current one: progress checkpoints when the rabbit passes their x; Search checkpoints when its centre is in that cover's core and the searcher isn't alert (the last core reached). `save: true` ones are stored for "Continue". **Only the Search ever restores one after a failure.**

**`reset(cp, opts)`** is how every module gets to a checkpoint (start, warp, continue, failure, title). Derive everything from `cp` + `G.flags`: the Level pre-fires triggers behind `cp`; the Player puts the rabbit there (`pose: 'hide'` = crouched, afraid breathing); the AI puts the searcher at `cp.searcher` (the entry if not done, else `loopT`); Events sets flags implied by `cp` and stops beats; the Camera snaps; Audio sets the beds; UI hides screens.

**The failure flow** (SEQUENCE-1.md §10; `FF.RULES.fail`):

| t after the grab or shot | what |
|---|---|
| 0 (the same step) | AI emits `fail {kind}`; Events: `FF.Game.cut()` (black on the very next frame: post's final pass, no DOM), `FF.Game.control(false)`; Audio: one muffled report (shot) or the boot scuff (caught), under black, nothing else; no rabbit sound |
| 0.80 s | `FF.Game.restart(G.checkpoint, {reason: 'fail', kind})` → everyone resets; `FF.Game.fade(0, 0.45)` |
| 1.00 s | `FF.Game.control(true)` |
| 1.25 s | full picture |

Nothing counts failures. No assist (A3). The skeleton already implements this flow (`ff-events.js`).

**Held keys through a failure** (8 Oct, round 2 of the Sequence 2 review; the Search and the Works alike): at 0 Events calls `FF.Input.off()`; the restart at 0.80 s keeps held keys held (`FF.Input.clear(true)`); at 1.00 s, just before `control(true)`, `FF.Input.latch(['left', 'right', 'up', 'jump'], {resume: false})`: every direction or jump held without a break since the cut does nothing until it is let go and pressed again (no resume after 0.8 s, unlike the door reveal), so a held → never walks the rabbit back into what caught it. Shift follows a125461: never held back by itself here (no direction resumes), so Shift held through + a direction pressed afresh runs at once. Bus `fail-control {kind, latched}` when control returns.

## 10. The debug handle: `window.__ff`

For headless tests (rAF is throttled headless: drive frames yourself).

| member | does |
|---|---|
| `ready` | true once booted |
| `pause(on)`, `freeze(on)` | stop the rAF loop's stepping; freeze shader time |
| `step(n, render = true)` | n fixed steps (1/120 s; presentation every 2) and one draw → `state` lite |
| `draw()` | one draw |
| `hold(a, on)`, `press(a)`, `release()` | input as a bot |
| `run(n, plan, every)` | n steps; `plan(state, i)` returns holds `{left, right, jump, up, down, run}` before each step (v2: `run` = Shift; a hold kept through the door reveal stays latched, like a held key, and resumes as the walk 0.8 s after control returns; a hold kept through a failure's black stays latched until the plan lets go and holds it again, 8 Oct round 2); returns a log every `every` steps |
| `until(pred, max, plan)` | step until `pred(state)` |
| `warp(cpId or {x, y, face})` | straight into play at a checkpoint (or anywhere) |
| `start()` | notice → title → play |
| `state()` | `{t, mode, place, cp, control, fade, rabbit, box, searcher, tier, errors, modules, player, ai, events, camera, world, audio, ui, bus}` |
| `ai` | `FF.AI.debug()` |
| `command(name)`, `fire(event, data)`, `seed(n)` | flow commands; emit a bus event; reseed |
| `setTier(name)`, `tier`, `stats()` | quality; `{fps, ms, calls, tris, w, h}` |
| `look`, `apply()` | live tuning |
| `G`, `bus`, `level`, `rules`, `scene`, `renderer`, `camera`, `three`, `Game`, `teardown()` | |

Module test hooks: `FF.AI.setLoopT(t)`, `FF.World.overlay(true)`, `FF.Camera.shot(id)`.

## 11. The parent page (the arcade room)

`public/farfield-room.js` → `farfieldRoom(body, ctx)` returns `stop()`; it shows the menu (FAR FIELD, one line, **the content notice**, Play), creates the iframe (`farfield/index.html?v=1`) only on Play, and removes it on stop (sending `leave` first). Same-origin `postMessage` only.

| direction | messages |
|---|---|
| game → room | `{ty: 'ready'}` (booted), `{ty: 'mute', on}`, `{ty: 'music', on}` (M / N in the game), `{ty: 'exit'}` (Esc on the notice or title, Back to the arcade) |
| room → game | `{ty: 'mute', on}`, `{ty: 'music', on}` (queued until `ready`), `{ty: 'leave'}` (the game tears down at once) |

Storage: the room `planet-ff-mute`, `planet-ff-music`; the game `ff-mute`, `ff-music`, `ff-progress` (read once from the old `ff-s1-progress`); nothing with `?mute=1`. Teardown frees every geometry, material, render target and shadow map, then `WEBGL_lose_context`. `webglcontextlost` → "click to continue" → reload. **Not wired into the planet** (A20). Test page: `public/farfield/room-test.html`.

## 12. Testing

- **Driver:** `…/scratchpad/ff/tools/cdp.mjs` (serves `repo/public` at `/`, the scratch `ff/` at `/__ff/`). One headless Chrome per agent on **your own ports**: `launch({ w: 1280, h: 640, gpu: true, port: <yours>, dport: <yours + 100> })` (the devtools port must differ per agent too; the default 9852 would collide). Use `UNCAPPED=1` for the Metal GPU path. Every wait has a timeout; `perl -e 'alarm N; exec @ARGV'` around node runs (macOS has no `timeout`); kill Chrome and delete its profile after each run (`b.close()` does both). If the 1-minute load average is above 25, wait 60 s before a render batch.
- **Ports:** architect 9905 (devtools 9906); world 9911, rabbit 9912, humans 9913, audio/UI/room 9914; integrator 9921; reviewers 9931–9934; fixes 9941.
- **Your own test pages** go in the scratch `…/scratchpad/ff/tests/<your-key>/` (served at `/__ff/tests/<key>/…`), never in the repo, unless this file assigns one (room-test.html).
- **Console clean** means no `console.error`, no uncaught exceptions, no failed requests (`b.errs` empty). `FF.report` writes `console.error`, so a caught module error still fails the check, as it should.
- **The Search checker** (humans builder): port `docs/farfield/checks/search-sim-amended.mjs` to `public/farfield/tools/check-search.mjs`, reading `FF.S1` + `FF.RULES` (load the data files in node with a stub `window`) and using `FF.AI.see` as the sight test, so the game and the checker can't drift. It must reproduce `search-sim-amended.txt`'s verdicts (hide audit, A1, A2, G, the pursuit map with a 0.6 s reaction) and pass before any change to Search geometry or perception ships.
- **Progress shots for Josh:** 1280×640 JPEGs (< 400 KB) of the actual running game to `…/farfield-look/progress/<your-label>-<nn>-<short-name>.jpg`, early and often; look at each one yourself.

## 13. Conventions and budgets

- Units m, s; colours sRGB hex in data (`FF.lin` converts); the lane z = 0; the camera looks along −z.
- **Tiers** (`FF.TIERS`): `dpr`, `msaa`, `shadowMap`, `shadowTaps`, `bloom`, `grain`, `motes`, `bounce`, `amberLight`, `beamSamples`, and for Sequence 1 `rain` (4000 / 2200 / 900), `splashes` (240 / 120 / 0), `drips` (60 / 30 / 10), `grass` (7000 / 3500 / 1200), `coneSamples` (8 / 5 / 3), `torchShadow` (2048 / 1024 / 512), `skyShadow` (2048 / 1024 / 512), `secondShadow` (1024 / 512 / 0 = dormant).
- **Budgets** (SEQUENCE-1.md §19): 60 fps on the M2 Air at high, ≤ 12 ms a frame (p95 ≤ 14), ≤ 110 draws, at most 2 shadow maps updating a frame, JS ≤ 2 ms a frame, ~250 KB of our JS.
- **Readability:** the rabbit has darkness behind it and light on it at rest points; ≥ 3.0× luminance contrast in play frames.

## 14. What the skeleton did (history; every module is now live: see the Integration section above and `STATUS.md`)

| module | today | the builder makes it |
|---|---|---|
| Level | **live**: every query, triggers on the bus, places | refine trigger conditions (`still`, `nearBox`, `onBox`, `alt`, `alsoOn`) |
| World | a plain greybox of the whole lane from the data (ground strip, solids, back walls, closed cover backs), the fixed rig with named handles, the box prop, the overlay | the real sets in the approved look, looks dusk → night, rain, beams, decor, core mask |
| Camera | follows the rabbit with zone dist / height, the title shot, `toPlay`, `attend` (simple) | every zone and shot in `FF.S1.camera` (A12, A13) |
| Rabbit | the look test's procedural rabbit + model slot (reads `models.json`) | the behaviour layers and poses |
| Player | the look test's movement on `FF.S1`: ground, solids, step-up, duck-under / creep speeds, the box, jump, the duct climb → transit → pop-out, flee speed | the reach-fail, the hesitation, links' animations, moods, ears, behaviours, the settle chain |
| Humans | a static dark silhouette per role (cap, backpack, gun, torch / coil) that moves, faces, bobs; torch alignment; a boxy van | procedural animation, model slot |
| AI | the entry and the loop from the data, the figure and its torch, the reference `see()`; suspicion measured, nothing reacts | the whole state machine, telegraphs, `fail` |
| Events | checkpoint tracking and saves, **the complete failure flow**, progress flags; beats only counted | the Verge and the walkway beats, the thud, the end |
| Audio | the API, silent; counts what it hears | the whole soundscape |
| UI | working plain screens: notice, title, pause, hints, end card, message | the quiet styling, the end card's skip |
| room | a minimal working room + test page | the cabinet style, sound / music buttons, focus, tests |

**Proof:** `farfield-look/progress/architect-01-skeleton-title.jpg` (the title over the live greybox Verge) and `architect-02-skeleton-search-crouchlook.jpg` (the searcher's kneeling torch slides under the skip's rear door and stops short of the rabbit in the core: the 2D rule and the 3D light agree, A16).

## 15. Reference material (read-only)

- Design scratch: `…/scratchpad/ff/design/` — `encounter.md` (+ `encounter/sim.mjs`, `search-xt.png`), `experience.md` (+ `experience/shots/`), `production.md` (+ `production/blockout.js`: a production greybox of all five places; `production/ff-looks-s1.js`: per-place looks to adapt to dusk → night, A1).
- Josh's briefs and journey: `farfield-look/BRIEFS-josh.md`, `JOURNEY-josh.md`. The visual target: `docs/farfield/reference/visual-target.webp`.
- The look test: `public/farfield/look.html` + `look/*.js` (frozen); `docs/farfield/RENDERING.md`, `ASSETS-3D.md`.

(`…/scratchpad` = `/private/tmp/claude-501/-Users-user-Library-Application-Support-Claude-scratch-workspaces-ef31e3c7-75d1-4840-a4c8-e9ec58a860d1-3685b11c-9bfc-46e5-8a83-7a038f1de787-scratch-2026-09-02-d62329/71d9d7f1-90d8-40c0-8582-66aedb9a8822/scratchpad`; `farfield-look/` = `/Users/user/Library/Application Support/Claude/scratch-workspaces/ef31e3c7-75d1-4840-a4c8-e9ec58a860d1/3685b11c-9bfc-46e5-8a83-7a038f1de787/scratch-2026-09-02-d62329/farfield-look/`.)

## Sequence 2 build: world + camera (world builder, 7 Oct night; files per SEQUENCE-2.md §11)

- **Files (one writer):** the world builder owns `js/ff-world.js` and `js/ff-camera.js` (Sequence 2 changes there are small blocks marked `Sequence 2`; with no Sequence 2 file loaded both files render Sequence 1 pixel for pixel as before, checked against git HEAD) and the new **`js/ff-world-s2.js`** (`FF.WorldS2`: every Works place, the props the machines move, the Works light sets, rain inside, the water effects, drips, the scrubbed wall). `ff-world.js` calls it (`declare` before the rig, `build` after Sequence 1's places and the rain, then `reset` / `derived` / `frame` / `rain` / `applySet` / `setTier`); main never does. **Load it right after `ff-world.js`** (it needs `FF.S2` and the merged lane, `ff-lane.js`). Camera numbers changed in `ff-level-s2.js` (camera fields only; the design check reads none): `hall-bed` height 0.95 / horizon 0.56 and `line-great` height 1.00 / horizon 0.58 (the lead's values put the slots' floor at or below the frame's bottom edge); the `hall` and `line` looks' `rabbit` rim / lift raised (0.38 / 0.055, 0.42 / 0.065) for readability in the dark slots and gaps.
- **Props for the movers** (`World.prop(id)`, built at rest = the data's y0, up / shut; `FF.Works.frame` moves them by their offset): `P1`, `Q1`, `Q2`, `Q3` (group origin at the platen's underside, x at its centre; the iron, ribs and screws are one mesh, the strip lamp under its front edge a second), `sluice` (origin at the gate's bottom edge on the pit floor; the World shortens the plate as it lifts, so it slides into the bed-end instead of rising through it), `counterweight` (in its shaft at x 137.5, z -4.2), `workLampHead` (on the tripod at `FF.S2.painter.lamp.stand`, aimed at the wall; lens on local +z; `FF.Painter` moves and aims it). The World never moves them; `World.reset` puts them back at rest.
- **Light sets** (the fixed rig; a switch waits until every light it changes is out of the frame, measured from the lens at the depth of that light's pool, with a forced fallback): `WH` (from x 125: the way on, the intake, the press hall, the culvert) K0 `pressLamp`, K1 `highBay` (shadowed: the rain shaft through the broken roof over the apron), P0 `sluiceGlow`, P1 `intakeGlow`, B0 `crossAmber`, B1 `culvertLamp`; `WP` (from the culvert's ramp) K0 `workLamp` (shadowed), K1 `lampQ1`, P0 `doorLine`, P1 `lampQ2`, B0 `amberBulkhead`, B1 `culvertLamp`; `WL` (from the long hall's door, and outside) K0 `lampQ3`, K1 `lampQ1`, P0 `doorLine`, P1 `lampQ2`, B0 `amberBulkhead`, B1 `exitGap`. D0 (the sky / moon) follows the looks as in Sequence 1. A walk through every boundary, both ways: 5 switches, none forced.
- **The press lamps:** unshadowed spots inside each platen pointing straight down, driven from `FF.Works.press(id).y` (dim and soft-edged when up, brighter and crisper as it comes down, out as the iron meets the bed); the shading hook **`works-foot`** (`uWFootX/Z[4]` per spot slot, `uWPit[3]`) clips each one to its platen's rectangle and keeps the three slots dark below y -0.10, so the lit bed is exactly where the iron comes down and the slots and gaps stay dark. Inert outside the Works sets.
- **Handles** (`World.spot(id)` / `World.point(id)`): `workLamp` (the Painter drives it; until someone does, the World lights it on its stand aimed at the wall: `SPOT_DEF.workLamp` matches `FF.S2.looks.passage.lights.workLamp`), and the World-owned `pressLamp`, `lampQ1`-`lampQ3`, `highBay`, `sluiceGlow` (by `FF.Works.sluice().gap`, a hairline when shut), `intakeGlow`, `doorLine`, `exitGap`, `crossAmber` (amber-tier gated), `amberBulkhead` (lights both sides of the long hall's door), `culvertLamp`.
- **Rain:** inside the Works only through the broken roof (over the apron, over P1, and the long hall's gaps G1, G2), stopped by each platen's top (it drums there); outside from x 193.8 down the embankment; the high bay lights the drops in its shaft. **Water:** a thread-like sheet off a platen's top front edge on `press {phase: 'release'}`, a low burst at its base and ends on `press {phase: 'contact'}`; drips off each platen's edges only while it hangs still; static drips at the intake, the broken roof, the pipe, the end door.
- **Camera** (`ff-camera.js`): Sequence 2 zones from the merged lane (or appended itself without `ff-lane.js`); zone fields **`maxDist`** (a held span's own cap) and **`holdX`** (stop following: `out-leave` holds at 207.4 (since the review fixes: 209.0, higher and wider) and the edge rule lets the rabbit walk out of frame; turning back brings the frame back); held S2 frames keep their height over the slots; open zones never frame the rabbit below ground in the culvert; `out-intimate` under the pipe (still 1.5 s or settled, x 199-206); shot **`out-pullout`** (ending (a), `FF.WorksFlow` starts and releases it); the **contact shake** (bus `press {phase: 'contact', d}` with `d <= FF.RULES.works.press.shake.within`: 0.012 m, 0.25 s, the lens only). Sequence 1's `pull-out` is unchanged here (`FF.WorksFlow` releases it).
- **Wire (integrator):** `index.html` `<script src="js/ff-world-s2.js?v=N">` right after `ff-world.js` (plus the S2 data, lane, works, painter, flow scripts as in the mechanism builder's section). Nothing in main. Tests (scratch, port 9971): `…/scratchpad/ff/tests/world2/` (`index.html` = the live data + world + camera + `ff-works.js`, the other modules at git HEAD, Works wired as main will; `s-tour`, `s-shots`, `s-sets`, `s-verify`, `s-perf`, `s-s1cmp` with `s1head.html` / `s1live.html`).

## Sequence 2 build: mechanism, events, humans (mechanism builder, 7 Oct night; SEQUENCE-2.md §3, §5-§12, §16, §18)

- **Files (one writer):** new **`js/ff-lane.js`** (`FF.Lane`: merges `FF.S2` into `FF.S1` in place at load, applying `FF.S2.join`; idempotent, `FF.S1._lane` marks it), **`js/ff-works.js`** (`FF.Works`: the clocks, the dynamic solids, the cut, the shove, the facts), **`js/ff-painter.js`** (`FF.Painter`: the maintenance worker, his sight, the look, his figure's pose, his lamp), **`js/ff-works-flow.js`** (`FF.WorksFlow`: shelter checkpoints in any order, both endings of Sequence 2, Sequence 1's rest as an optional pull-out), **`tools/check-works.mjs`** (the checker port), `docs/farfield/tests/works-bot.js` (a bot route). Small marked `Sequence 2` hooks in `ff-player.js`, `ff-events.js` (`setCheckpoint(id)`, every settle handed to `FF.WorksFlow` while it is loaded) and `ff-ai.js` (`see()`'s `opts.areas`; the Search checker still 23/23). All inert without the Sequence 2 files.
- **Wiring (index.html, main):** load `ff-rules-s2.js`, `ff-level-s2.js`, `ff-script-s2.js`, `ff-lane.js` after `ff-script-s1.js` (before `ff-level.js`); `ff-works.js`, `ff-painter.js`, `ff-works-flow.js` after `ff-ai.js`. Main's orders: `INIT`/`RESET` = Level, **Works**, World, Player, Humans, AI, **Painter**, Events, **WorksFlow**, Camera, Audio, UI; `STEP` = **Works** (first: the solids move before the Player collides), Player, Level, AI, **Painter**, Events, **WorksFlow**; `FRAME` = Player, Humans, AI, **Painter** (after Humans: it poses his bones), Events, **Works** (before World: it moves the props), World, Camera, Audio, UI. Optional: main's `calm()` also checks `FF.Works.danger()`; `Events.scripted()`-style holds may add `FF.WorksFlow.scripted()`.
- **`FF.Works`:** `pressY(m, marks, phase)`, `pressState`, `sluiceGap(p1phase)`, `sluiceState` (= the design check's reference functions); `press(id)` → `{id, phase, y, state, k, passable, idle, x0, x1, upY}`; `sluice()` → `{gap, state, passable, x0, x1, floorY}`; `shelterAt(x)`; `over(x)`; `danger()`; `started`; `clock('P1'|'line')`; `machine(id)`; test hooks `setPhase(k, t)`, `start()`, `stop()`; `debug()` (`__ff.works`). Clocks start on Level's `works-start` (trigger works-first) at phase 0; `reset(cp)` from `cp.works`, else started at 0 past the trigger, else stopped (hanging still). Props moved by their offset from rest: `P1`, `Q1`-`Q3` (underside − upY), `sluice` (+gap), `counterweight` (upY − P1's underside).
- **The cut** (`fail {kind: 'machine', by: 'P1'|'Q1'|'Q2'|'Q3'|'sluice', x}`, on the step): a descending press's underside within `lethalMargin` of the rabbit's back **as drawn** (`hStand` → `hLow` by the Player's eased crouch, `crouchF`/`crouchR`) with the centre in its footprint (inset) and not grounded in a pit core under it. Measured: 3.892 s from the clank standing on the bed (P1, Q1, Q2), 3.917 (Q3), crouched 3.925 / 3.942; in play the Player's own low pose under the iron can add one step. Events' failure flow is Sequence 1's (black at once, restart 0.80, control 1.00, picture 1.25). **The shove:** a body over a descending footprint with its centre outside, in the last 0.12 s → `FF.Player.shove(toX, 0.12)` + `works:shove {id, from, to, dur}`; blocked side → the cut. **The gate** (until the review fixes of 8 Oct; now it never cuts, see the last section): closing, centre within 0.08 m of it and the gap below 0.19 → the cut (P1 phase 9.66); a body over it → shoved to the nearer side.
- **Facts:** `press {id, phase: release|descent|contact|down|rise|up, x0, x1, x, d, great, n}` (contact then down on the same step), `sluice {phase: lift|open|close|shut, gap, x}`, `works:shove`, `fail`; `painter {phase: scrape|stop|turn|reach|dip|look|lift|hold|lower|hang|resume, step, loopT, hard, x, face}`, `painter:noticed {x, src, d, n}`; `pullout {phase: start|return, seq: 1|2, cause: input|time}`, `ending {phase: hold|leave|cancel|fade, way: rest|leave}`, `end {phase: 'card', way}` (only at the card: the Player locks on any `end` phase but `settled`).
- **`FF.Painter`:** his 12 s loop (`FF.S2.painter`) from `painter-start` (trigger passage-in) or `cp.painter.loopT`; sight = `FF.AI.see({x 160.4, y 0, face -1}, Player.sightPoints(), {areas: [the lamp spill]})` only between loop t 8.9 and 11.3, 'touch' read as close darkness; suspicion as the searcher's; NOTICE → the look (still, turn-to, lift, hold 2.0 / 1.0 s, lower, hang, turn, scrape-hard 8 s, then the loop from the stop). Never `fail`. `debug()` (`__ff.painter`: `{started, mode, loopT, seg, facing, s, lit, litBy, looks, lookT, lamp, lifted, hard, noticedAt, last}`), `setLoopT(t)`, `start(t)`. His figure: `FF.Humans.create('painter')` with every prop hidden, a scraper in his right hand, bone overrides after `Humans.frame`. His lamp: `World.spot('workLamp')` (driven every frame while the rabbit is within 149-170, where his figure shows) and `World.prop('workLampHead')` (lifted into his hand only if the tripod is within 0.85 m of his shoulder, else swung round on its stand onto the rabbit).
- **`FF.WorksFlow`:** shelter checkpoints (`FF.S2.shelters[].checkpoint`, centre in the core, grounded, in control, `|y − cp.y| ≤ 0.3`) via `FF.Events.setCheckpoint`; ending (a) on `end {settled}` past x 127.2: hold 4.0 s → `Camera.shot('out-pullout')` (control kept; any input → `shot(null, {release: 2.0})`) → after 8 s control off, fade 2.0, 0.5 black → `FF.Game.endCard()`; ending (b) by x: 209 → on, below 208.5 → cancelled, 211 (or 4 s on while moving right) → fade 2.5 (control kept) → the card. Sequence 1's settle (x < 127.2): hold 4.0 s → `Camera.shot('pull-out')` → back after 8 + 3 s (`release` 4.0), or at once on input (1.5); no fade, no card. `debug()` (`__ff.flow`), `scripted()`, `ownsEnd`.
- **`FF.Player` (Sequence 2 hooks):** `shove(toX, dur)`; AFRAID within 3 m of a releasing / descending press, in a pit under a press coming down or pressing (then flat, `hide`, held breath), and in the worker's look; the startle at a contact within 6 m; the ears to `press`, `sluice`, `painter` and the scraping; surfaces (`concrete` slab and passage, `steel` under the presses, `water` in the pits and the culvert, `wet-concrete`, `grass` outside); the look up at the hanging press from the apron; a look back and a shake out of the long hall (`safe {arg: 'works'}`); the settle chain under the pipe (out-rest: 200-205 still 1.5 s, or 195-208 still 3 s). The join: no 60 s auto-stop in Sequence 1's rest, and its settle no longer locks input.
- **Tests:** `node public/farfield/tools/check-works.mjs` (PASS; §1-§6 reproduce `works-sim.txt` line for line; §7 runs FF.Works and FF.Painter themselves). Browser tests **`docs/farfield/tests/t-works.mjs`** (W1-W12, 42 checks, `PAGE=` for a page other than index.html; needs the wiring above) with the bot route `works-bot.js`: all pass on a page wired as above.

## Sequence 2 review fixes (8 Oct; three reviewers: experience, fairness, engineering. What changed at the interfaces; the reasons are in `STATUS.md` §S2.1)

These amend the two Sequence 2 sections above where they differ.
- **`FF.Works` (the cut and its mercies):** a pit core protects the rabbit whether it is grounded or not. New **ramp slide**: a rabbit whose centre is in a slot's visible notch (the pit's extent, ground under the centre below `FF.RULES.works.press.ramp.notchBelow` −0.04) but outside its core, and whose back would meet the platen, is carried down into the core (core edge + `ramp.inset`) once the contact is within `ramp.lead` (0.32 s) or the iron within `ramp.margin` (0.25 m) of the cut height; duration `|dx| / ramp.speed`, 0.12-0.25 s, through `FF.Player.shove`. **The gate never cuts:** closing, once its lower edge is within `lethalMargin` of the back of a rabbit under it, it carries it clear to the side its centre is on (slot B: 145.43, or the sill: 145.87); `fail {by: 'sluice'}` remains only for the impossible case of both sides blocked. `works:shove` gains **`kind: 'edge' | 'ramp' | 'gate'`** (and `dur` is the actual duration).
- **`FF.Player`:** a moving solid (a press, the gate: `dynamic`) is solid from inside a slot too: an x move is refused where the floor it would stand on leaves less than `hCrouch` + 0.03 under a moving solid's underside and the move makes that clearance smaller (between x 139 and 190 only); in the air a moving solid is a ceiling that holds the rabbit down. No jump while in a slot (its extent, below the bed) whose press is releasing, descending or down. In the halls within 6 m of a press (place `hall` or `line`) the mood never drops below ALERT, the ears keep the nearest press (`press-near`, its hanging underside) and no sniff idle plays. The rim × 1.22 in the long hall's gaps. One additive look back (and a sit-up if it stops) at x 207.9 walking on. `debug().works` gains `alert`, `noJump`, `near`.
- **`FF.Painter`:** after the look his loop resumes at loop time 0 (the start of his scraping), not at the stop. The hold pose: the lamp in his left hand at chest height, the elbow bent, aimed down at the rabbit (no arm out). **`FF.Painter.lampK`** (0 on the tripod .. 1 in his hand): the World dims the scrubbed wall's decal (opacity down to 0.55) while the lamp is off the wall.
- **Data (`ff-level-s2.js`, `ff-script-s2.js`, `ff-rules-s2.js`):** `FF.RULES.works.press.ramp` (new); slot C 0.6 m wider on the exit side (ground `[186.4, -0.40], [187.0, 0.00]`, shelter `pit-C` x1 187.0, core 184.75-186.45, checkpoint `works-pitC` at 185.6); a 6 cm step at the sill's edge (ground 146.12-146.2 at y -0.34, drawn as a steel angle: the culvert drop is one-way, hops included); the tripod lamp `FF.S2.painter.lamp` stand [159.62, 1.5, -1.25] (0.81 m from his shoulder: he lifts it into his hand), aim [161.3, 1.2, -2.0], `looks.passage.lights.workLamp` intensity 5.6, 50°; camera `hall-bed` height 1.08 / horizon 0.565; `out-leave` holdX 209.0, dist 12.4, height 1.55, horizon 0.42.
- **`FF.WorldS2`:** the `works-foot` mask returns 0 at once outside a footprint's soft box; `PITS` slot C to 187.0; the clank's water (`sheet:<id>`): a spill of drops off the platen's lower front edge in the first 0.4 s and a few soft streams off the top edge (about one a metre), ending at the bed (y 0); the press lamp flickers in the first 0.3 s of a release and its pool is brighter and tighter through the warning (`derived`, `frame`: `p.tight`); `gateFan` and `gatePool` (additive, by the gate's gap) in front of slot B; the gate plate drawn in section (front edge z -0.12) and its front guide only above the opening; the far windows with a polygon offset (they lost the depth test to their own building), 2.0 × 1.3 m, the far sheds at most 1.3 m; no puddle discs; the gaps' floor `gapC`; the high bay aimed behind the lane (target z -3.1).
- **`FF.Events`:** a Search cover becomes the checkpoint only while the current checkpoint is before `rest` (it compared the id with 'rest' only, so a Works checkpoint could be replaced).
- **Tests:** `check-works.mjs` §4b adds the climax as a player meets it (stopping 0.3-2.6 s after the great press's clank; never stopping, reported) and §7 the gate's carry (never a cut) and the ramp slide on the module (every 2.5 cm of each notch). `t-works.mjs` (50 checks) adds: a pressed-down press solid from inside its slot (A, B, C, Shift held), standing on a ramp as the press comes down, a startled hop in a slot, the culvert one-way with hops, the gate's carry both ways, no second look straight after the first, the climax stops, and a Search cover never retaken from the Works.

## Sequence 2 review fixes, round 2 (8 Oct; the engineering and fairness re-reviews. The reasons are in `STATUS.md` §S2.2)

These amend the sections above where they differ.
- **`FF.Input` (main):** `latch(list, {resume: false})` latches with no resume; `clear(keepHeld)` keeps held keys (`Game.restart` passes `reason === 'fail'`). Unchanged: the door reveal's latch (resume after 0.8 s, `heldRun`, `graceEnd()`).
- **`FF.Events.fail(kind)`:** `FF.Input.off()` at the cut; at control (1.00 s) `FF.Input.latch(FAIL_LATCH, {resume: false})` (`FAIL_LATCH` = `REVEAL.latch`: left, right, up, jump), then `control(true)`; bus **`fail-control {kind, latched}`**. See §9, "Held keys through a failure".
- **Checkpoints (`ff-level-s2.js`):** the long hall's restarts put the press ahead at its clank 0.25 s after the restart (the black ends 0.45 s after it): `works-line` line 15.75, `works-g1` 3.75, `works-g2` 7.75, `works-pitC` 7.75 (were 2.0, 6.0, 10.0, 10.0, the press already falling). Contact 4.25 s after the restart, the way open 6.84-6.91 s after. All still face the way on (`face: 1`): facing back put the press ahead mostly off-screen (the camera leads the facing).
- **`FF.Player` (the lid):** in a slot's notch (`FF.S2.shelters` kind `pit`, x0..x1) an x move that raises the rabbit to less than **`P.slotLid` (0.40)** under that slot's own press (`FF.Works.press(pit.under).y`) is refused, as well as the earlier `hCrouch` + `dynClear` rule: with the press down the whole body stays on the slot's floor and the drawn rabbit, ears included, below the platen's front lower edge; as the press rises it follows it up the ramp the same distance under it. In a slot (below −0.04) with its press within **`P.slotLow` (0.45)** of the rabbit's floor, `crouchStep` keeps both ends low, and the gate's draught in slot B (`sluice {phase: 'open'}`) queues `'prick'` (head up, ears pricked from low) instead of `'sniff'`, whose head rose above the iron's edge.
- **`FF.Works` (the ramp slide):** it ends where the whole body stands on the slot's floor (the pit's floor span from `FF.S2.ground`, inset by `hw` + `ramp.inset`: slot A 141.79 / 142.41, slot B 144.79, slot C 184.99 / 186.21), not at the core's edge; a rabbit in the core but off that span (at the core's edge) settles onto it the same way (`works:shove {kind: 'ramp'}`; it was never in danger there).
- **Checkers:** `works-sim.mjs` and `check-works.mjs` §5 add "the press ahead clanks after the restart, as the picture comes back" for the long hall's checkpoints (0.25 s); the "picture back" figure there is now given from the restart (0.45 s).
- **Tests:** `t-works.mjs` W2's lid check (the floor 0.40 under the iron in slots A, B, C with Shift held; was 0.18) and new **W13** (real keys with auto-repeat held through a failure at works-line, works-g1, works-g2 walking and with Shift, works-pitC with Shift + ←: one cut, the rabbit stays at the restart point; let go and pressed again it walks on, with Shift held it runs); `t-controls.mjs` adds the same in the Search (caught under the deck's checkpoint with → auto-repeating, with and without Shift).
