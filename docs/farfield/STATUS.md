# Far Field: status (8 Oct 2026: Sequence 2, The Works, is playable after Sequence 1 v2 with the review fixes)

## S2. Sequence 2, The Works (8 Oct): playable

**What it is.** The rabbit walks on from Sequence 1's breathing space, over a slab that has slipped across the channel, and into the colossal building the camera showed you at the end of Sequence 1. One night in rain, no loading, no text, no hints. The slow 4-second thud you have heard since the Courtyard turns out to be this place: huge iron presses hang over a wet bed and come down on it, pressing nothing.
1. **The way on.** The slab, the rain coming back, a low tunnel under the wall that ends in a fallen beam you creep under. As you start the creep, the first press clanks; its thud lands before you can possibly reach it.
2. **The first press.** You watch it from a safe apron: still, a clank (it drops a hand's breadth and water pours off it: 2 seconds of warning), the fall, the thud, the rise. Lit floor is where it comes down; the two dark slots in the bed are safe. Its far end is a dead end against a wall, but each time it presses down, a steel drainage gate in the far slot lifts and light pours in: the way on is under the machine while it presses.
3. **The passage.** A maintenance worker, unarmed, back to you, scraping END ANIMAL USE off the wall under his work lamp ("END" already painted grey, "ANIMAL" half scraped, "USE" untouched). Every 12 seconds the scraping stops and he turns along the passage. Pass while he scrapes and he never knows; be careless and he holds his lamp's light on the rabbit for two seconds, does nothing, and goes back to scraping, harder. Never a chase, never a failure. Nothing points at the words.
4. **The long hall.** Three presses "walk" left to right once every 16 seconds (clank, thud, thud, thud), the last one, the great press, twice the size. Leave as the first one rises and keep walking, and you reach the slot under the great press just as it clanks.
5. **Breathing space.** Out into drizzle under a huge pipe; far across the fog, a lit building where tiny figures cross every window in step. It ends either way, and neither is a wall: rest under the pipe (the camera pulls out, then "to be continued"), or walk on down the embankment into the fog. Turning back before the fade cancels it.

Failing only happens under a press or in the closing gate: the screen cuts to black just before the iron reaches the rabbit, one muffled thud, and about a second later you are back in the last slot or gap you reached. A careful first play takes about 3½ minutes; the first-timer bot took 3:34 including one failure, the quick one 1:41.

**How to start it.**
- From the beginning: Sequence 1 now leads straight into it (walk over the slab from the breathing space).
- To review it directly: **`/farfield/index.html?start=works`**: the content notice, then the title with **"Begin at the Works"** already chosen; Enter or → starts on the breathing space's grass just before the slab.
- On your own computer, where you finished Sequence 1 before: your save now shows as **"Continue from the Works"** on the title (↑ ↓ to choose, Enter).

**What changed in Sequence 1** (only how it ends; everything else is untouched and its tests pass unchanged):
- The "not yet" stop at the channel is gone: the slab across it is visible from the lean-to as the way on.
- Resting under the lean-to still plays the settle and the pull-out to the Works, but the camera then comes back to you (at once if you move); no fade, no card, and the rabbit is never locked.
- "To be continued" comes at the end of Sequence 2.
- The content notice now says **"dangerous machinery"**, as the game's first screen and in the arcade menu.

**Your three answers, as built:** (1) the notice wording with "dangerous machinery"; (2) the worker only looks, then goes back to work; (3) Sequence 1's pull-out kept as an optional moment that comes back to you.

**What I fixed while wiring it together:**
1. **Frame rate.** The Works' lighting trick (each press lamp lights only the floor where its iron lands, and the slots stay dark) had been compiled into every surface in the game. It cost about 2.5–3.5 ms a frame on a Retina screen at high quality everywhere, Sequence 1 included. Now only the Works' surfaces and the rabbit carry it: Sequence 1 costs what it did before (measured side by side with the committed version), and the Works render identically.
2. **The first press's one clue was too faint.** The light that floods the far slot each time the press comes down barely showed. It is brighter and spills out of the slot now: from slot A you see slot B light up as the press presses (`s2-10`).
3. **Resting twice.** A rabbit that had rested under the lean-to could not settle again under the pipe, so ending (a) was missing for it. Fixed (the first-timer bot rests in both places).
4. The title: ↑ ↓ choose between "press → to begin", "Continue from …" and "Begin at the Works"; Enter or → starts the chosen one.

**Tested** (all on port 9975, through the real key path; details in `PROGRESS.md`): the whole game by two bots, from the notice through both sequences to the card and back to the title, console clean: the quick one (Shift on open stretches, `?mute=1`: no audio, nothing stored) in 4:30 of game time, walking on into the fog at the end; the first-timer in 7:39 with a failure in each sequence (caught in the Search; frozen on the press bed at a clank, cut on the step, back on the apron with the full picture 1.24 s later), resting at both breathing spaces and ending with the pull-out. The machines, gate, worker, checkpoints, endings and the join (42/42), the sound of the Works (all pass), the new start and save flow (16/16), the Works checker and the Search checker (23/23); Sequence 1's controls (30/30), door reveal (22 scenarios), scenarios, feet, detection, lingering and the arcade wrapper all pass unchanged. **Frame rate** (headless Chrome on the M2 Air, the game's own loop, a Retina-sized 1440×720 window drawn at 2×, the machine shared with other work): high 61–77 fps (the Works 61–70), medium 97–141, low 175–269; Sequence 1's places read the same as the committed Sequence 1 run back to back. Draw calls in the Works 35–75 (budget 110).

**Temporary or placeholder in Sequence 2:** the presses, frames, bed and pipe are simple matte boxes and cylinders (the commission list is in `ASSETS-3D.md`); the worker is the same stand-in figure, posed in code, with a stand-in scraper (his clips: `CHARACTERS.md`); the water effects are deliberately simple; no rain splashes on the ground in the Works; the far building is a plain fogged box and its crossing figures are about 6 pixels; all sound is made in code and nobody has listened to it yet (`farfield-look/progress/audio2-01-works-soundscape-preview.m4a` is 3 minutes of it).

**Known issues (small):**
- When the worker notices the rabbit he swings his lamp round on its tripod with his arm out, rather than lifting it off: the tripod stands 1.4 m from him. Moving it within his reach puts the wall and the word USE in a bright pool while he scrapes (too much emphasis on the sign), so I left the builders' placement.
- In the gap between the first two long-hall presses the rabbit's contrast is 2.76× (the play target is 3.0×); brighter would make it glow.
- At high quality on a Retina screen the Works cost about 15–17.5 ms a frame on this machine (Sequence 1: 12–15 ms, the same as before Sequence 2), so on a busy Air the game may step down to medium by itself in the Works (medium: 9–11.5 ms there).
- The water pouring off a press at the clank reads, in a still frame, as a dense curtain of dashes; in motion it pours for about a second and a half.
- The scraping sound runs on its own clock, not exactly on his arm's strokes; on the walk-away ending the rabbit's own sounds don't fade as it leaves the frame (the fade covers it); the far clank-and-thuds heard before you reach the machines may shift by one beat when the real ones take over.

**What needs you:** play it (`?start=works` for the short way); listen to it (the preview above, then in the game); and, if you can, watch a first-time player at the first press: does the light appearing in the far slot get noticed, and is the way under the press found without help?

**Progress shots:** `farfield-look/progress/s2-01` … `s2-21` (the title with "Begin at the Works", the optional pull-out in Sequence 1 and the camera back, the slab, the creep, the first thud from the apron, a mistimed crossing and the restart on the apron, slot A under the pressed press, slot B lighting up seen from slot A, the gate lifting, the culvert, the worker scraping with the rabbit in the dark, his look, the long hall from the doorway, gap G1, slot C under the great press, out of the end door, grooming under the pipe, both endings).


## 00. The review fixes (7 Oct, late evening)

Three reviewers played v2 for controls and fairness, for the door reveal, and for the look. Everything below came from them; the atmosphere, tension, music and core mechanics are untouched. Design notes: `SEQUENCE-1.md` V8. Progress shots: `farfield-look/progress/v2fix-01` … `v2fix-11` and `v2fix-reveal-01` … `09`.

1. **The rabbit is one connected body.** The stand-in is no longer separate rounded shapes: the same shapes are melted into one smooth surface (no ring at the neck that looked like a collar, the haunch flowing into the back, a hock and a long hind foot joined to the leg), and the joins bend softly. It is still a stand-in; your Tripo rabbit replaces it (`CHARACTERS.md`, which now also covers the rabbit already made from your reference).
2. **No sliding feet when he changes gait.** His feet already stayed put while walking or running; now they also stay put when he starts, stops, slows from a run or ducks under the hoarding (that used to pop a hind foot 10 cm in one frame). Coming to a stop, a foot that isn't on its spot steps there with a small lift instead of gliding. When he only lowers or freezes, his feet stay on the ground. Measured by height, not by the animation's own flags (`tests/t-slide.mjs`).
3. **The Search works at the cautious walk.** At the old pace his look at the duct mouth (6 s) was long enough; at the new walk it wasn't, so careful players got spotted exactly when the staging says "go". His look is now 9 s: walking out of the deck 0.5–2 s into it reaches the pallet without him even noticing, and the walk to the skip is never spotted. With Shift everything is as before.
4. **Shift is remembered.** It is taught again once as you walk into the Courtyard if you haven't run for a minute, it is on the pause screen, the hint goes away once you use Shift, and holding Shift through a failure or a pause no longer drops it (a held Shift sends no new key press, so the game had forgotten it).
5. **A walking hop leaps forward** (about 0.6 m) instead of going straight up, so hopping at the fallen post from half a metre away clears it.
6. **The door reveal shows the rabbit react.** The camera now waits until he has stopped and you have seen him react (0.85 s; under the low shelf he lifts his head and pricks his ears), then travels to the door more gently (1.5 s). Control returns when the camera has settled, the rabbit back in its usual place in the frame: **6.5 s after the first footsteps** (5.95 before).
7. **Keys around the reveal.** A key you let go and press again during it works straight away when it ends; only a key held without a break is held back, and if it is still held 0.8 s later he walks on at the cautious pace (your son's case: he no longer seems frozen). *Since 7 Oct night (a125461):* Shift held through it too runs as soon as the reveal's 1.2 s grace ends (before that he walks), and pressing Shift again runs at once; it used to be ignored for as long as the direction stayed down. Restarting from the pause menu (or quitting and continuing) after you've seen the man come out replays only the aim at the fence, about 2.4 s, not the whole reveal.
8. **Smaller fixes.** On a squarer screen (4:3) the door shot keeps the fence gap off the edge; the painted-over wall lost a round paint flake that read like a bullet point, and its roller strokes are softer and less regular, one hasty coat rather than grey cards; `CHARACTERS.md`'s Tripo prompt now asks for the pale warm grey (it said grey-brown), the Mixamo step says to export `.fbx`, and the rigging scripts are in the repo (`docs/farfield/tools/`).

Tests: everything in `run-all.sh` passes on port 9965 (the Search checker 23/23, both play-throughs, the scenarios, the controls 30/30, the door reveal in 22 scenarios, the feet, detection, lingering, the arcade wrapper). The frame rate passed with the machine quiet (Retina high tier 81–103 fps); with other work later sharing the GPU it dropped for the old and the new build alike, run back to back, so the new body costs nothing measurable (`PROGRESS.md`).

## 0. After your playtest (v2, 7 Oct evening)

You kept the atmosphere, tension, music and core mechanics; nothing about them changed. Only your points 1, 2, 3, 4, 5 and 7 were worked on. The design notes are `SEQUENCE-1.md` V1–V7. Progress shots: `farfield-look/progress/s1v2-01` … `s1v2-11`.

**Your questions, answered from the code:**
- *Did holding a direction speed him up?* Yes. After 0.3 s of holding, he ramped from a walk (1.15 m/s) to a run (2.75 m/s). That ramp is gone.
- *Did he crouch by himself?* Yes, in two places. He went low under anything lower than 0.35 m (kept: it reads as natural, and it is how he fits under things). And a danger reflex flattened him in torchlight, in the gate's glare, and when the walkway worker stopped. That reflex now makes him freeze instead (ears back, a slight lowering); he goes flat in the open only when you hold ↓.
- *Are his model and animations temporary?* Yes, both, and the people's too. What has to change and what I need from you is in **`CHARACTERS.md`**.

**What changed:**
1. **Speed and controls.** An arrow alone is now a cautious walk (0.95 m/s, a little slower than before) for as long as you hold it; it never speeds up by itself. **Shift + an arrow runs** (2.75 m/s). In the Search, a run becomes the flee (3.6 m/s) while he is chasing; an arrow alone stays the walk even then. ↓ crouches deliberately, and ↓ + an arrow creeps (0.75 m/s). The title reads "← → move · Shift run · Space jump · ↓ crouch". A one-time "Shift + → run" hint appears early in the Verge, after the post and before the van, unless you have already run. Gamepad: X, RB or RT + a direction runs (not yet tried with a real pad).
2. **Crouching.** No more flattening in the open by itself (tested: none in two full play-throughs). Going under something, the head and shoulders lower first, the hips follow, and each rises once it has cleared, eased, not snapped.
3. **The rabbit's movement.** His feet now stay where they land (measured slide about 0 m/s, was 0.8 m/s). The stride follows the distance he actually travels. The cautious walk and the run are two different gaits: the walk a slow, careful half-bound; the run a bound with two flights. The hind legs gather under him, push off, roll onto the toes and extend; the forepaws land one after the other; the back curls and stretches. His body rises only as far as gravity allows, so he no longer floats. He is still the rounded stand-in: a connected silhouette needs the real model (`CHARACTERS.md`: the Tripo route is about 20–40 minutes of your time).
4. **The people.** Still the blocky stand-in, but grounded: feet planted, heel-to-toe, the hips riding on the supporting leg, arms swinging against the legs (before, each arm swung with the leg on the same side), a slow weight shift when standing, a heavier coat-and-boots silhouette with rounded shoulders and the head a little low. Their behaviour and timing are unchanged. The plan for the real figures: `CHARACTERS.md`.
5. **The door reveal always completes.** When the man comes through the door, the game now takes the camera deliberately, the only time it does so in this section. Control goes off; the rabbit stops by its own momentum (a run slides about 0.4 m, a jump lands first) at least 19 m from him; its ears snap to the footsteps and it sits up to listen (under the shelf, since the review fixes, it lifts its head and pricks its ears). The camera eases to the door: the light, the man in the doorway, the step out, the clatter, the aim that lights the gap. It eases back and you have control again **6.5 s after the first footsteps** (since the review fixes; it was 5.95). Rain, sound and the world keep going. While it runs, and for 1.2 s after, he cannot see or touch the rabbit at all. A key held through it does nothing at first, so holding forward (your son's case) or jumping into it never carries the rabbit on; since the review fixes, if it is still held 0.8 s after control returns he walks on at the cautious pace, and (since a125461) a Shift held with it runs once the reveal's grace ends, 1.2 s after control returns. Tested: no input, a cautious walk, forward held from inside the duct, a Shift run, a running jump into the trigger, repeated hops, and the whole path from the box. After a failure later in the Search it never replays.
6. **One sign of resistance.** On one back-wall panel of the Courtyard, "END ANIMAL USE" sprayed by hand and buffed out with a hasty coat of grey that doesn't quite match the concrete; some letters ghost through the strokes. Nothing points at it: no light, sound, camera move or hint. You pass it while working out the box. It is deliberately faint; judge it on your own screen (`s1v2-03`).
7. **Dark places show their shapes.** The Search's darkest values were lifted a little, so the duct housing and the shelf around the hiding rabbit read on arrival. It is the same night.

**Also fixed while wiring it together:** walking off the far edge of the fallen post at the new walking pace snapped the rabbit back about 0.6 m (fixed); the walkway worker's camera lean could follow the rabbit into the Search and pull its framing 2.5 m left (fixed); a pause → Restart right after landing in the Search sent you back to the Courtyard's box puzzle (it now restarts under the shelf, as designed).

**In short:** Sequence 1 is playable from start to finish with the temporary models: the content notice, the title over the live Verge, the Verge at dusk in heavy rain, the drain, the Courtyard puzzle, the Search, the breathing space, "to be continued" (since 8 Oct: after Sequence 2), and back to the title. It takes a careful player about 3 to 5 minutes. Nothing blocks you from playing it now. What is still temporary is mostly how things look and sound (the rabbit, the people, the van and the buildings are stand-ins), and two things need a person rather than a test: a first-time player trying the Search, and someone listening to the sound.

How to play it and how to run the tests: `PROGRESS.md`. Progress shots: `farfield-look/progress/s1v2-01` … `11` (v2), `integrator-01` … `14` (the first version).

## 1. What you can play

**Before play.** The content notice is the first screen (pursuit, capture, dangerous machinery (since 8 Oct) and non-graphic violence towards the rabbit; the screen cuts to black and you continue nearby; no injury shown). The arcade menu shows it too. Then the title, FAR FIELD, over the live scene: dusk, rain, the rabbit grooming under a sheet of hoarding leaning out of the thicket. → begins.

**1 · The Verge** (you cannot fail here)
- Dusk in heavy rain at the foot of an enormous precast wall. It gets darker the further you go, never on a timer.
- You learn to move carefully (an arrow is a walk for as long as you hold it), to hop a fallen post, to run with Shift (a hint shows once, after the post), and to slip under a hoarding (the rabbit hesitates there once, the first time).
- A far boom beyond the wall turns the rabbit's ears by themselves.
- At the halfway point an engine starts beyond the wall. Its light glows through the wall's joints, then it stops behind a gate ahead. Light floods out under the gate, boots appear in it, and a chain rattles.
- Step into that light and the rattling stops dead for a second. Stay as long as you like: the rattling just keeps going.
- Past the gate you drop through the broken corner of a culvert. As you drop, the lock gives. Once you are creeping along the low pipe, a torch comes down through a crack behind you and an arm reaches in and falls short.

**The drain.** A slow creep through a low pipe, then a taller pipe in cut-away, rain falling through a cracked slab, and up a silt ramp.

**2 · The Courtyard** (you cannot fail here)
- The hall from the look test, in late dusk light from the high windows.
- A small glowing opening sits too high to jump to. Push the empty box with your head until a kerb stops it under the opening, hop on, and climb in.
- While you work it out, an amber lamp clicks on, a door opens, and a worker with no gun and no torch crosses a high walkway, stops at the rail looking the other way, and leaves. Then a slow distant thud begins.

**3 · The Search** (the only place you can fail)
- It is night when you come out of the duct. The van from the verge is parked behind a wall.
- Light shows under a door, then footsteps. The camera takes over once (v2): a man with a cap, a backpack, a slung gun and a torch steps out; a clatter at the fence makes him raise the gun at the fence corner. He doesn't fire, and his torch shows you the gap: your way out. The camera comes back and you have control again about 6 s after the footsteps.
- He has a fixed routine: he kneels to shine his torch under the skip, climbs onto a platform and walks over your hiding place, then looks back towards where you came in for 6 seconds. That is the moment to move.
- If he notices you, his footsteps stop and his torch drifts onto you. If you stay, he either lunges (close) or raises the gun (further away); the beam narrows, there is a click, and you have a second to get out of his line of sight. Once he is chasing, the rabbit running with Shift is faster than he is (an arrow alone stays the walk), and every hiding place's dark middle is safe even after he has seen you go in: he kneels, reaches in, and his hand falls short.
- If he catches or shoots the rabbit, the screen cuts to black on that exact frame, with one muffled sound. About a second later you are back under the nearest cover you reached.

**4 · Breathing space.** Behind the fence: wet grass, a low wall, a sheet of corrugated iron propped over the grass. Stay still and the rabbit listens, sniffs, nibbles, washes its face (the first music), shakes and settles into a loaf. The camera pulls out to show how small it is at the foot of something colossal. *Since Sequence 2 (8 Oct):* the pull-out is an optional moment; the camera comes back to you (at once if you move), and a slipped slab across the channel is the way on into the Works. "To be continued" comes at the end of Sequence 2.

**Also working:** pause (Resume, Restart from checkpoint, Sound, Music, Back), M and N for sound and music, the first-time key hints (small, above the rabbit, gone after use: move, Shift run, jump, push, go in), the three quality tiers with a quiet automatic step-down, saved progress ("Continue from the Courtyard / the Search / the breathing space" on the title), the arcade wrapper with its own content notice (not yet wired into the planet), `?mute=1` (no sound at all and nothing stored).

## 2. Your approval adjustments, and how each is met

| you asked | in the game |
|---|---|
| Dusk in rain into night; no afternoon, no jump in time | The Verge starts at dusk in heavy rain and darkens continuously with distance; the drain, then late dusk through the Courtyard's high windows, then night in the Search and the breathing space, with the moon only a faint glow through cloud. Every change of light happens where you can't judge it (inside the drain, behind a dark pier in the duct). I darkened the Verge and the breathing space at integration because they still read as an overcast day and a pale evening. |
| Keep the shot and cut to black | Cut to black on the frame of the grab or the shot; one muffled report (or a boot scuff) in the black; nothing else. Judge it in motion. |
| Listen only if it gives real information | No listen key. ↑ jumps again. The ears and head turn by themselves to every sound: the van, footsteps, the chain, the thud, the searcher while he is out of sight (ahead, overhead, behind), and they hold on him when his footsteps stop. That already tells the player what a listen key would have, so none was added. |
| No automatic difficulty reduction | None. Nothing counts failures. |
| One human model; the distant worker unarmed; distinct behaviour | One stand-in for all three. The Verge person rattles the gate, waits, comes through when the lock gives, kneels at the culvert and reaches in. The walkway worker carries only a coil of cable (no gun, no torch, no backpack), walks, pauses at the rail looking away and leaves. The searcher has his own routine. |
| Title over the live scene, the rabbit grooming beneath partial shelter | Yes, beneath a leaning sheet of hoarding, rain beyond its edge. I brought the title camera closer at integration so the rabbit isn't tiny. |
| Hiding and detection consistent | One rule, used by the game and by the checker alike. Solid cover blocks sight completely. Darkness only shortens the range: within 1.75 m in front of him (0.5 m behind) he notices the rabbit even in the dark, with a telegraph. Tested: his torch aimed straight at the rabbit under the pallet, under the skip, or under the deck sees nothing; the same torch on the open floor sees it; in darkness he notices it at 1.5 and 1.7 m but not at 2.0 m; a whole loop of his routine never notices a rabbit in any hiding place. |
| Measure the warning time; a first-timer must understand and react | From the first unmistakable cue (he stops dead, the footsteps stop, the torch drifts onto the rabbit): **1.58 s** to a grab close to him, **2.7 s** to a shot further away (the aim alone is 1.5 s, the click comes 1.0 s before the shot), **2.3 s** in darkness. A test player that reacts 0.6 s after he spots it escapes both into a hiding place and through the gap. A real first-time person has not tried it yet (see §4). |
| The opening must not force you forward | Nothing moves the rabbit but you. The van stops by where you are; the chain rattles for as long as you stay (tested 60 s before the gate and 30 s in the glare: the rabbit never moved, the person never came out); the lock gives only when you drop into the culvert; the torch comes down only when you are in the pipe. |

## 3. Temporary or placeholder

- **The rabbit:** a procedural stand-in, with 21 poses on one skeleton (walk, run, hop, squeeze, push, sniff, groom, nibble, sit up, shake, settle, hide, flatten, flinch …). Since v2 its feet are planted and the walk and run are distinct gaits; since the review fixes its body is one connected surface (the same shapes blended), but the anatomy is still approximate and the forelegs are short (a sliding shoulder fakes the shoulder blade). No eyelids; the tail lift is subtle. **What has to change and what I need from you: `CHARACTERS.md`** (the Tripo route, about 20–40 minutes of your time plus 1–2 hours here; or a commission, 3–5 weeks). The model slot is ready: a supplied model's clips play by name at their measured stride, and any clip it lacks is drawn by the same code on its bones.
- **The people:** one blocky stand-in figure posed in code. Since v2 the legs are placed by inverse kinematics (feet planted, heel to toe, arms against the legs, a heavier silhouette); still: a slight slide when they stop or freeze (about 0.2 s), turns step in place, the kneel and aim poses are stiff. The plan (a Tripo figure plus Mixamo clips, or a commission) and the 24 downloads with their file names: `CHARACTERS.md`. The model slot is ready (one model, Mixamo bone names, props by node: torch, gun, coil, backpack).
- **The van:** a boxy stand-in, seen mostly as light behind the wall; its turn in is a short arc.
- **The places:** simple matte geometry in the approved look. The Works revealed at the end is a few grey masses in the haze. No puddles in the Courtyard or the Search (they read as holes in the floor and were taken out; the wet shows through the floor's sheen).
- **Sound:** everything is made in code and the levels were set by measurement only: nobody has listened to it. The heartbeat, the rabbit's breathing and the torch buzz are deliberately subtle and may need tuning by ear.
- **Controls:** keyboard tested; gamepad written (stick or d-pad walk, X / RB / RT run) but not tried with a real pad; no touch controls in Sequence 1.
- **Digging** is not in Sequence 1 (as agreed: it arrives in a later beat, in clearly marked soft ground).

## 4. Actual blockers

Nothing blocks playing it. These need you or another person:
1. **A first-time human tester for the Search.** The tests measure the warning times and a test player with a first-timer's reaction escapes, but your brief asks for a fresh person who doesn't know the rules. If they fail at the same place twice without understanding why, tell me where: the warning times can be lengthened without changing anything else.
2. **Listening.** The soundscape (`farfield-look/progress/shell-05-soundscape-preview.m4a` is a 2-minute preview) needs a human ear, especially the shot's report in the black.
3. **Wiring the cabinet into the planet** (`planet.html` / `planet-dress.js`) is a separate change for you to approve. The wrapper is built and tested on its own page.
4. **Models** before the look can go further: the rabbit first, then the human and the van. `CHARACTERS.md` says what to make or download and how (the quick Tripo + Mixamo routes, or commissions); `ASSETS-3D.md` has the sizes, bone names, clips and props.
5. **A feel-check of the new controls by you:** the cautious walk's pace (0.95 m/s), the searcher's longer look (9 s; it can go back towards 6 s if the Search now feels too easy at a walk), the door reveal's length (6.5 s; it can be shortened) and its held-key rule (a key held through it waits 0.8 s, then walks on).

## 5. Known issues (small)

New with the review fixes:
- Turning round still carries the feet a little (the legs bend in the body's own plane, so feet planted while the body swings round go with it for a fraction of a second; mostly under a pixel at the game's camera).
- A walking hop started 0.7 m or more before the fallen post still lands against it (hop again); from 0.5 m or closer it clears.
- The stand-in body is about 35,000 triangles and takes about a quarter of a second to build at load (behind the content notice); the frame rate is unchanged in our test (Retina high tier 81–103 fps).
- A held direction walks on 0.8 s after the reveal; a player holding it long enough walks under the deck and beyond (their choice, as with a fresh press).

Fixed by the review fixes (were listed here in v2): the Search too strict at the walking pace; a walking hop landing short from 0.35 m; the rabbit's reaction to the footsteps barely visible before the camera moved; the "Shift + → run" hint staying 4 s after Shift was used.

From v2:
- The painted-over graffiti is hard to read at 1× with the film grain (it reads on Retina and on the low tier). On screens wider than about 2.3:1 the left edge of the paint patch may just enter the Courtyard's opening frame.

From before:

- On a Retina screen the high tier runs at about 66–87 fps in our headless test (drawing 2160×1080), a little over the 12 ms budget when measured with a hard GPU sync. If your Air dips, the game steps down a tier by itself when nothing is happening; Q changes it by hand.
- The Courtyard's first view is dark (the hall opens before the window light); the rabbit reads, the room only just does.
- ~~At the end, the rabbit can't be moved once it has lain down~~ (gone with Sequence 2: settling no longer locks the rabbit).
- The boots under the gate read only faintly against the gate.
- When the walkway worker appears, the camera turns towards him and the rabbit can sit close to the left edge of the frame for a few seconds (the lean now stays in the Courtyard).
- After pressing → on the title, the title text takes 1.5 s to fade while you are already moving.
- The title frame's readability measure is 2.0× (the target for wide frames is 2.5×) because the misty outskirts sit behind the rabbit; by eye the rabbit reads clearly.
- The first sound can take a fraction of a second to start the very first time (the browser starting its audio device); test this on the Air in normal Chrome.

## 6. What changed while wiring the first version together (integration, 7 Oct afternoon)

- **Fairness:** the rabbit's one-time hesitation now happens only at the hoarding. After a restart or a Continue it could otherwise happen at a Search skirt, a 0.45 s stall in the middle of an escape.
- **People:** no figure or torch survives a restart for a single frame (the searcher's lit torch could flash at the Verge after a warp).
- **The look:** the Verge is darker and cooler (it read as daytime haze); the breathing space is darker (night, not a pale evening); the title camera is closer; the gate opening above the leaves is lower; the light leaks that drew razor-thin lines across the grass from the gate's seam are closed; the puddle discs are gone.
- **The breathing space:** the sheet over the rabbit is higher (0.53 m over the lane instead of 0.33) and rests on two short props, so the rabbit can sit up, listen and groom under it without its ears poking through the sheet.
- **Rules folded in** (`ff-rules.js`): a quick tap still hops the post and the box; a rabbit sitting still that he walks into makes him stop dead first (NOTICE, about 1.6 s to a grab) instead of an instant lunge; how he keeps sight of the rabbit once he is alert; an entry cut short replays after a restart. The Search checker still passes (18/18).
- **Tests** now live with the game, in `docs/farfield/tests/`, so anyone can re-run them (`bash docs/farfield/tests/run-all.sh`).
