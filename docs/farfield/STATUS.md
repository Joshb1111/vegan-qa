# Far Field: status of Sequence 1 (7 Oct 2026)

**In short:** Sequence 1 is playable from start to finish with the temporary models: the content notice, the title over the live Verge, the Verge at dusk in heavy rain, the drain, the Courtyard puzzle, the Search, the breathing space, "to be continued", and back to the title. It takes a careful player about 3 to 5 minutes. Nothing blocks you from playing it now. What is still temporary is mostly how things look and sound (the rabbit, the people, the van and the buildings are stand-ins), and two things need a person rather than a test: a first-time player trying the Search, and someone listening to the sound.

How to play it and how to run the tests: `PROGRESS.md`. Progress shots: `farfield-look/progress/integrator-01` … `14`.

## 1. What you can play

**Before play.** The content notice is the first screen (pursuit, capture and non-graphic violence towards the rabbit; the screen cuts to black and you continue nearby; no injury shown). The arcade menu shows it too. Then the title, FAR FIELD, over the live scene: dusk, rain, the rabbit grooming under a sheet of hoarding leaning out of the thicket. → begins.

**1 · The Verge** (you cannot fail here)
- Dusk in heavy rain at the foot of an enormous precast wall. It gets darker the further you go, never on a timer.
- You learn to run, to hop a fallen post, and to slip under a hoarding (the rabbit hesitates there once, the first time).
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
- Light shows under a door, then footsteps, then a man with a cap, a backpack, a slung gun and a torch steps out.
- A clatter at the fence makes him raise the gun at the fence corner. He doesn't fire, and his torch shows you the gap: your way out.
- He has a fixed routine: he kneels to shine his torch under the skip, climbs onto a platform and walks over your hiding place, then looks back towards where you came in for 6 seconds. That is the moment to move.
- If he notices you, his footsteps stop and his torch drifts onto you. If you stay, he either lunges (close) or raises the gun (further away); the beam narrows, there is a click, and you have a second to get out of his line of sight. Once he is chasing, the rabbit runs faster than he does, and every hiding place's dark middle is safe even after he has seen you go in: he kneels, reaches in, and his hand falls short.
- If he catches or shoots the rabbit, the screen cuts to black on that exact frame, with one muffled sound. About a second later you are back under the nearest cover you reached.

**4 · Breathing space.** Behind the fence: wet grass, a low wall, a sheet of corrugated iron propped over the grass. Stay still and the rabbit listens, sniffs, nibbles, washes its face (the first music), shakes and settles into a loaf. The camera pulls out to show how small it is at the foot of something colossal. Fade, "to be continued", back to the title.

**Also working:** pause (Resume, Restart from checkpoint, Sound, Music, Back), M and N for sound and music, the first-time key hints (small, above the rabbit, gone after use), the three quality tiers with a quiet automatic step-down, saved progress ("Continue from the Courtyard / the Search / the breathing space" on the title), the arcade wrapper with its own content notice (not yet wired into the planet), `?mute=1` (no sound at all and nothing stored).

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

- **The rabbit:** a procedural stand-in made of rounded shapes, with 20 poses on one skeleton (run, hop, squeeze, push, sniff, groom, nibble, sit up, shake, settle, hide, flatten, flinch …). No eyelids, so the half-closed eyes of the settled loaf don't show; the tail lift is subtle. The model slot is ready (`ASSETS-3D.md`): a supplied model gets the same poses through its named clips.
- **The people:** one blocky stand-in figure posed in code: no inverse kinematics, some foot sliding on turns, stiff arms when aiming. The model slot is ready (one model, Mixamo bone names, props by node: torch, gun, coil, backpack).
- **The van:** a boxy stand-in, seen mostly as light behind the wall; its turn in is a short arc.
- **The places:** simple matte geometry in the approved look. The Works revealed at the end is a few grey masses in the haze. No puddles in the Courtyard or the Search (they read as holes in the floor and were taken out; the wet shows through the floor's sheen).
- **Sound:** everything is made in code and the levels were set by measurement only: nobody has listened to it. The heartbeat, the rabbit's breathing and the torch buzz are deliberately subtle and may need tuning by ear.
- **Controls:** keyboard tested; gamepad written but not tried with a real pad; no touch controls in Sequence 1.
- **Digging** is not in Sequence 1 (as agreed: it arrives in a later beat, in clearly marked soft ground).

## 4. Actual blockers

Nothing blocks playing it. These need you or another person:
1. **A first-time human tester for the Search.** The tests measure the warning times and a test player with a first-timer's reaction escapes, but your brief asks for a fresh person who doesn't know the rules. If they fail at the same place twice without understanding why, tell me where: the warning times can be lengthened without changing anything else.
2. **Listening.** The soundscape (`farfield-look/progress/shell-05-soundscape-preview.m4a` is a 2-minute preview) needs a human ear, especially the shot's report in the black.
3. **Wiring the cabinet into the planet** (`planet.html` / `planet-dress.js`) is a separate change for you to approve. The wrapper is built and tested on its own page.
4. **Models to commission** before the look can go further: the rabbit first, then the human and the van (`ASSETS-3D.md` has sizes, bone names, clips and props).

## 5. Known issues (small)

- On a Retina screen the high tier runs at about 66–87 fps in our headless test (drawing 2160×1080), a little over the 12 ms budget when measured with a hard GPU sync. If your Air dips, the game steps down a tier by itself when nothing is happening; Q changes it by hand.
- The Courtyard's first view is dark (the hall opens before the window light); the rabbit reads, the room only just does.
- At the end, the rabbit can't be moved once it has lain down (the ending has started; Esc still pauses).
- The boots under the gate read only faintly against the gate.
- When the walkway worker appears, the camera turns towards him and the rabbit can sit close to the left edge of the frame for a few seconds.
- After pressing → on the title, the title text takes 1.5 s to fade while you are already moving.
- The title frame's readability measure is 2.0× (the target for wide frames is 2.5×) because the misty outskirts sit behind the rabbit; by eye the rabbit reads clearly.
- The first sound can take a fraction of a second to start the very first time (the browser starting its audio device); test this on the Air in normal Chrome.

## 6. What changed while wiring it together (integration)

- **Fairness:** the rabbit's one-time hesitation now happens only at the hoarding. After a restart or a Continue it could otherwise happen at a Search skirt, a 0.45 s stall in the middle of an escape.
- **People:** no figure or torch survives a restart for a single frame (the searcher's lit torch could flash at the Verge after a warp).
- **The look:** the Verge is darker and cooler (it read as daytime haze); the breathing space is darker (night, not a pale evening); the title camera is closer; the gate opening above the leaves is lower; the light leaks that drew razor-thin lines across the grass from the gate's seam are closed; the puddle discs are gone.
- **The breathing space:** the sheet over the rabbit is higher (0.53 m over the lane instead of 0.33) and rests on two short props, so the rabbit can sit up, listen and groom under it without its ears poking through the sheet.
- **Rules folded in** (`ff-rules.js`): a quick tap still hops the post and the box; a rabbit sitting still that he walks into makes him stop dead first (NOTICE, about 1.6 s to a grab) instead of an instant lunge; how he keeps sight of the rabbit once he is alert; an entry cut short replays after a restart. The Search checker still passes (18/18).
- **Tests** now live with the game, in `docs/farfield/tests/`, so anyone can re-run them (`bash docs/farfield/tests/run-all.sh`).
