# Far Field · Sequence 1 · Interfaces

Architect, 7 Oct 2026. **The contract between the game's files.** The design is `SEQUENCE-1.md`: its **Amendments** (A1–A24 and the playtest changes V1–V7, at the top) win over the rest of it. This file says which module does what, the API each one exposes, how they talk, and who owns which file, so four builders can work at the same time without touching each other's files.

The skeleton already runs: `public/farfield/index.html` boots, shows the content notice, the title over the live Verge, and play along the whole 135 m lane (a greybox). Every module exists as a **working stub** with this API (§14 says what each stub does today). Builders replace the insides and keep the API.

## Integration, 7 Oct (read this first; it updates the sections below)

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
  - **Resume:** a latched direction still held `LATCH_RESUME` (0.8 s) after the latch resumes as the cautious walk: it is unlatched and marked `resumed` (getter `resumed`), and `down('run')` is false while a resumed direction is held (Shift ignored until that key is let go). A latched jump never fires by itself.
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
js/ff-shading.js  FF.U, FF.mat, FF.glow, FF.patch, FF.applyShading, FF.addShadingHook, FF.setAOBox, FF.lin
js/ff-post.js     FF.Post
js/ff-level.js    FF.Level
js/ff-world.js    FF.World
js/ff-camera.js   FF.Camera
js/ff-rabbit.js   FF.Rabbit
js/ff-player.js   FF.Player
js/ff-humans.js   FF.Humans
js/ff-ai.js       FF.AI
js/ff-events.js   FF.Events
js/ff-audio.js    FF.Audio
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

**Each fixed step** (1/120 s, at most 24 per frame): `G.t += dt` → `Player.step` → `Level.step` (place, triggers) → `AI.step` → `Events.step` → input presses cleared.
**Each frame:** fade animation → `Player.frame` → `Humans.frame` → `AI.frame` → `Events.frame` → `World.frame` → `Camera.frame` → `Audio.frame` → `UI.frame` → draw (`post.render(scene, camera, World.look, tier, time, G.fade)`).
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
| `FF.Input.latch(list)` / `unlatch()` / `latched` / `resumed` / `off()` / `edge(a)` | the takeover latch (V5, V8): listed actions held without a break since `off()` count as not held until let go and pressed again; a direction still held 0.8 s later resumes as the walk |
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
- **`FF.addShadingHook({ key, uniforms, pars, spot, lights, fog })`** — extend every patched material without editing `ff-shading.js`. Register in `init()`, before the first render:
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
| `save(id)`, `loadSave()` | progress (`ff-s1-progress`: courtyard → search-arrive → rest → completed) |
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

## 10. The debug handle: `window.__ff`

For headless tests (rAF is throttled headless: drive frames yourself).

| member | does |
|---|---|
| `ready` | true once booted |
| `pause(on)`, `freeze(on)` | stop the rAF loop's stepping; freeze shader time |
| `step(n, render = true)` | n fixed steps (1/120 s; presentation every 2) and one draw → `state` lite |
| `draw()` | one draw |
| `hold(a, on)`, `press(a)`, `release()` | input as a bot |
| `run(n, plan, every)` | n steps; `plan(state, i)` returns holds `{left, right, jump, up, down, run}` before each step (v2: `run` = Shift; a hold kept through the door reveal stays latched, like a held key, and resumes as the walk 0.8 s after control returns); returns a log every `every` steps |
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

Storage: the room `planet-ff-mute`, `planet-ff-music`; the game `ff-mute`, `ff-music`, `ff-s1-progress`; nothing with `?mute=1`. Teardown frees every geometry, material, render target and shadow map, then `WEBGL_lose_context`. `webglcontextlost` → "click to continue" → reload. **Not wired into the planet** (A20). Test page: `public/farfield/room-test.html`.

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
