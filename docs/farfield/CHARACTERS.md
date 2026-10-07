# Far Field: the characters (7 Oct 2026)

Your questions 3 and 4 after playing the preview: which parts of the rabbit and the people are temporary, what has to change to get the rabbit you described and grounded, unsettling people, and what you need to supply. Plain English first; the file names are there so anyone can check.

## In short

- **Yes, both are temporary.** The rabbit you played is a stand-in built in code from about two dozen smooth egg shapes, each fixed rigidly to one bone. That is why it reads as separate rounded shapes. The people are one blocky stand-in figure (capsules and boxes), also posed in code.
- **What was wrong with the movement, measured.** The old walk swung the legs on a simple wave while the body glided along at a steady speed. Nothing tied the feet to the ground: in the walk the "planted" hind feet slid along the ground at **0.8 m/s** while the body moved at 1.15 m/s. With the test model's run clip they slid at **2.7 m/s**. Walk and run were the same cycle, only bigger. That is the floating, the sliding feet and the stiff back legs you saw.
- **What is better now** (today's fixes, in the game, with the placeholder models):
  - **The rabbit's feet stay where they land** (measured slide: about 0.00 m/s in the walk, run, crouch-walk and push). The hind legs gather under the body, push off, roll up onto the toes and extend behind, then recover. The forepaws land one after the other. The back curls as the hind feet come under and straightens as they push away. The cautious walk is a low, careful hop with the head carried forward; the run is a bound with two flights. Crouching lowers the head and shoulders first, then the hips. Standing, crouching and breathing fold the legs instead of sinking or lifting the feet.
  - **The game is ready for your Tripo rabbit.** It plays the file's own clips by name. It measures each moving clip's stride, so the feet don't slide whatever speed the clip was made for. Anything the file doesn't have yet is drawn by the same code on the model's own bones, with the legs reaching the same footprints. A rabbit rigged here with only two clips already walks, runs, crouches and pushes with planted feet (tested), and every other behaviour (hiding, jumping, grooming, settling…) is drawn on it the same way.
  - **The people's feet are planted too.** Each foot stays put while it carries the weight and rolls heel to toe; the hips ride on the supporting leg. Their arms now swing against their legs (before, the arm swung with the leg on the same side, like a pacing robot). They are heavier: broader coat and boots, shoulders rounded forward, head carried a little low. Standing, the weight shifts from leg to leg every few seconds. Their behaviour and timing are unchanged.
- **What I need from you:** the Tripo rabbit (§4, the chosen route). For the people, a Tripo figure plus a set of Mixamo animations downloaded with your Adobe login (§5), or a commission.

## 1. What is temporary now

| part | now | status |
|---|---|---|
| Rabbit shape | built in code from about 24 smooth ellipsoids, each rigidly attached to one bone (`js/ff-rabbit.js`, `buildProcedural`) | **temporary**: replaced by your model |
| Rabbit skeleton | 25 bones with the names in `ASSETS-3D.md` | **stays**: your model uses the same names, so everything that drives it carries over |
| Rabbit animation | all in code: the gaits (drawn from the movement code's timing), 20 poses (groom, sniff, nibble, sit up, look back, shake, settle, hide, freeze, peek, the reach at the wall, the climb, …), live ears, breathing, tail | **stays as the driver** until real clips arrive; each clip you add replaces the code for that moment |
| Rabbit movement (`js/ff-player.js`) | speed, the new controls (arrows walk carefully, Shift runs, Down crouches), the gait timing | **stays**: it is gameplay |
| People's shape | one blocky figure: capsule limbs, mitten hands, box boots, cap, coat, backpack; props (torch, gun, coil of cable) shown or hidden per role (`js/ff-humans.js`) | **temporary** |
| People's animation | all in code: walk, search-walk, run, turn, kneel, crouch-look, climb, aim, lunge, reach, rattle the gate, torch down, lean on the rail, shake the sheet | **temporary**: replaced by Mixamo or commissioned clips; the code keeps the torch arm and head aimed |
| People's behaviour (`js/ff-ai.js`, `js/ff-events.js`) | routines, timing, what they see | **stays**: not part of the look |
| The van | a boxy stand-in | temporary (not part of this brief) |

## 2. What has to change to reach your description

### The rabbit

**The model** (this is the biggest single step, and only a real mesh can do it):
- One continuous, closed surface: no separate parts, so the haunch flows into the back and the belly, and the head sits into the shoulders.
- A strong, rounded haunch with the thigh folded against the body; the long hind foot lying flat from heel to toes; short, slim forelegs set under a deep chest; no visible neck; a blunt muzzle with the eye on the side of the head; ears about a third of the body length, thick at the base and slightly cupped; a small round tail.
- Real proportions: 0.40 m nose to tail, the top of the head about 0.22 m from the ground, the ear tips about 0.32 m, the hind foot about 0.09 to 0.10 m long, the foreleg about 0.08 to 0.09 m from shoulder to ground.
- About 6,000 to 12,000 triangles; one matte colour (pale warm grey, `#c4beb4`), with slightly darker eyes and faintly pinker inner ears if possible.

**The rig:**
- The bone names in `ASSETS-3D.md` (the script here builds them for you on the quick route).
- Joints where the animal bends: the hip joint inside the haunch, the knee forward, the heel (hock) at the back of the long foot, the shoulder high on the chest, the elbow behind.
- Smooth weights that blend across the haunch, the belly and the shoulders, at most four bones per vertex. This is what stops the thigh looking like a separate ball.
- Nice to have: a shoulder-blade bone each side between `chest` and `front_upper_L/R`. Rabbits get much of their front reach from the shoulder blade; the game fakes it today by sliding the shoulder joint up to 4 cm.

**The animation:**
- The code already drives every behaviour with feet planted, so the quick route needs no clips at all to work. Real clips add the nuance code can't: weight, overlap through the body, the fur settling.
- For clips (best route, or later): in place (no root motion), loops that start and end on the same pose, 30 fps, at roughly the speeds in `ASSETS-3D.md`. The game measures each moving clip's own stride when it loads and plays it at exactly the rate the rabbit moves, so the speed doesn't have to be exact.
- The cautious walk: forepaws placed one after the other, the hind feet brought up together under the body, the body low, the head forward and steady. The run: hind legs push off together and extend, a stretched flight, forepaws land one after the other, the hind legs swing forward under the body (the back curls), a gathered flight, the hind feet land ahead of where the forepaws touched.

**The movement code:**
- Done today. The controls fixer made the gait timing part of the movement (`js/ff-player.js`: how far each stride is, when each foot is down, how far each end of the body may rise, never higher than gravity allows), and `js/ff-rabbit.js` draws it with planted feet.
- Left for later, only if you want it: a little visible surge of the body with each push (the gameplay speed stays smooth, because the Search's timing checks depend on it).

### The people

**The model:** one figure for all three roles, 1.72 to 1.85 m tall. A heavy work coat to the knee, broad shoulders, a cap with a forward brim, heavy boots, a backpack with a rolled mat on top (the hump that makes the silhouette). Dark charcoal, matte, no face detail: they read as silhouettes. The torch, the long gun, the coil of cable and the backpack as separate objects (we attach them here if needed). About 15,000 triangles, plus a lighter 4,000-triangle copy for distant figures.

**The rig:** a standard human skeleton with Mixamo bone names. Mixamo's automatic rig is enough.

**The animation:** library clips (Mixamo) give natural walking, turning and kneeling at once. What makes them grounded and unsettling here stays in code: feet planted by IK on the step the AI counts, the torch arm and the head aimed by the game, slow deliberate speeds, stopping dead. A commission can go further: a stiff, searching gait, a slow kneel-and-look, the reach under cover.

**The code:** the human model slot already exists (one file, clips by name, props by name). When a file arrives, it needs the same treatment as the rabbit got today: each walk clip's stride measured so the feet don't slide, and the torch arm and head layered over the clips. About a day's work here.

## 3. How a model gets into the game

- Put the file in `public/farfield/models/` and name it in `public/farfield/models/models.json` (`"rabbit": "ff_rabbit.glb"`, `"human": "ff_human.glb"`). That one line is the switch. Without it nothing is requested, so the game never shows an error for a missing file.
- To try a file without changing the list: `index.html?rabbit=<file under models/>`. `?rabbit=procedural` forces the stand-in.
- `?rabbitanim=auto` (the default) uses the file's clips where it has them and code for the rest. `?rabbitanim=clips` uses only clips, with the fallbacks in `ASSETS-3D.md` (a missing crouch-walk uses the crouch idle, and so on). `?rabbitanim=proc` draws everything in code on the model, which is handy for comparing.
- Clips the game looks for, by name: `idle_breathe`, `idle_ear_twitch`, `sniff`, `walk`, `hop_run`, `flee`, `crouch_idle`, `crouch_walk`, `push_head`, `jump_start`, `jump_air`, `jump_land`, `alert_freeze`, `hide`, `peek`, `groom`, `sniff_ground`, `nibble`, `listen`, `look_up`, `look_back`, `shake_off`, `reach_fail`, `climb_in`, `pop_out_hop_down`, `hesitate_look_down`, `settle_loaf_in`, `loaf_breathe`; `caught` and `hit` play under the black if present (nothing needs them).
- A clip in the file wins over the code in auto mode. So on the quick route, export only clips that look better than the code; a rough test clip would otherwise replace good code animation. The one exception: a moving clip whose feet hardly travel (it could only be played sliding) is drawn in code instead, and the console says so. The test rig's `hop_run` is such a clip.

## 4. What to supply: the rabbit

### Route A, QUICK (chosen): you generate the mesh with Tripo, we rig it here

**In Tripo:**
- **Best input: an image.** A clean side view of a wild European rabbit (not a pet breed) standing calmly on all four feet, on a plain background. A photo or a simple painting both work. Text-to-3D works too.
- **Prompt (text, or alongside the image):** "a wild grey-brown European rabbit, natural anatomy, standing calmly on all four feet, side view, hind legs folded under the body with the long hind feet flat on the ground, short front legs straight down, ears upright and slightly apart, small round tail, mouth closed, realistic proportions, smooth simple surface, plain matte single colour, no clothes, no accessories".
- **Avoid:** sitting up on the haunches, a cartoon head or big eyes, an open mouth, ears touching each other or the back, legs merged together or into the belly, a tail fused to the thighs, fur cards or spikes, anything held or worn.
- **The pose matters most:** a calm standing pose, symmetrical left to right, head straight ahead, all four feet flat on one ground level, a small gap between the legs and between the legs and the belly. The game treats this pose as "standing still" and measures every movement from it.
- **Settings:** if Tripo offers a face limit or a low-poly option, about 10,000 to 20,000 faces (we bring it to 12,000 or fewer). A plain or base-colour texture only; the game replaces the shading and keeps the colour. No rig and no animation from Tripo.
- **Export:** `.glb`. Any size is fine: we scale it to 0.40 m.
- **Quick check before sending:** turn it round once. One piece, no holes, four separate legs, two separate ears, nothing floating.
- Send the file (or drop it in `farfield-look/`) with its name.

**Here (Blender in the background, the lead's `rig.py`):** weld the mesh into one piece, scale it to 0.40 m nose to tail standing on the ground, build the `ASSETS-3D.md` skeleton inside it, compute automatic smooth weights (through a simplified copy if the generated mesh is messy), add an `idle_breathe` clip, export `public/farfield/models/ff_rabbit.glb`, name it in `models.json`. Then we look at it in the game, fix bad weights (usually the haunch and the ears), and tune the code animation to its proportions.

**What it gets you:** the real silhouette straight away: one connected body, your proportions, in the game's matte look. All the behaviours, driven by the same code as now, with planted feet. Any hand-made clip can be dropped in later and wins over the code for that moment.
**Its limits:** a generated mesh can need a second try (merged legs, lumpy ears, odd eyes). Automatic weights can crease at the haunch. Code animation has good timing but not a hand animator's weight and overlap.
**Time:** you, about 20 to 40 minutes (a few generations). Here, about 1 to 2 hours to rig, check and tune once the file arrives.

### Route B, BEST: a commissioned rigged and animated rabbit

Give a 3D animator `ASSETS-3D.md` (the rabbit section, sizes, bone names, clip list) together with §2 of this file and the reference image. They deliver one `ff_rabbit.glb` with a sculpted mesh, a hand-weighted rig and the clips.
**What it gets you:** the rabbit you described, made by hand: anatomy, fur volume, weight shifts, anticipation and follow-through in every move, faces and ears that act.
**Time:** about a week for the model and rig, two to three weeks for the essential and Sequence 1 clips (about 27). Allow 3 to 5 weeks overall. It drops in with no code changes, and any clip they haven't finished yet is still drawn by the code.

A middle way: the Tripo mesh rigged here now, and an animator later animating that same rig.

## 5. What to supply: the people

### Route A, QUICK: a Tripo figure, rigged and animated in Mixamo by you

**1. In Tripo:** one figure (it serves all three roles).
- Prompt: "a heavy-set adult worker in a long dark work coat reaching the knees, broad shoulders, a cap with a forward brim, heavy work boots, a backpack with a rolled sleeping mat on top, gloves, standing straight in an A-pose with the arms held out from the body, no face detail, no logos or text, matte dark charcoal, realistic proportions".
- The A-pose (arms out and down at about 45°, legs slightly apart) is what Mixamo's automatic rigging needs. No torch or gun in the hands: we attach those here.
- About 15,000 faces; export `.glb` or `.fbx` (Mixamo accepts `.fbx` and `.obj`; `.obj` with its texture zipped is safest).

**2. In Mixamo** (mixamo.com, your Adobe login):
- Upload the figure. In the automatic rigger place the markers (chin, wrists, elbows, knees, groin), keep symmetry on, and choose **Skeleton LOD: "No Fingers (25)"** (gloved hands, silhouettes).
- Then download each animation below on that character. **Save each file with our name** (left column): that is the name we need. The Mixamo titles change from time to time, so the middle column says what to search for and which kind of clip to pick.
- **Download settings:** Format **FBX Binary (.fbx)**; Skin **With Skin** for the first download (the character itself, any idle) and **Without Skin** for the rest; **30** frames per second; Keyframe Reduction **none**. Tick **In Place** wherever it is offered (walks, runs, turns).

| save as | search Mixamo for | pick |
|---|---|---|
| `idle.fbx` | breathing idle | a calm standing idle with breathing (the title is usually "Breathing Idle") |
| `walk.fbx` | walking | a plain adult walk, In Place ("Walking") |
| `walk_search.fbx` | sneak walk / cautious walk | an upright, slow, careful walk; not a cartoon tiptoe. In Place |
| `run.fbx` | running | a heavy run, In Place ("Running" or "Slow Run") |
| `turn_180.fbx` | turn 180 | a standing or walking 180° turn, In Place |
| `notice.fbx` | look around / surprised | stopping and turning the head sharply (optional: the code does this now) |
| `kneel_in.fbx`, `kneel_loop.fbx`, `kneel_out.fbx` | kneel | going down onto one knee, kneeling idle, standing up again |
| `crouch_look_in.fbx`, `crouch_look_loop.fbx`, `crouch_look_out.fbx` | crouch | crouching down, a crouched idle looking low, standing up (can be the same as kneel if nothing fits) |
| `kneel_reach.fbx` | picking up / reaching | kneeling and reaching forward low with one arm |
| `aim_raise.fbx`, `aim_hold.fbx`, `aim_lower.fbx` | rifle aim | raising a rifle to the shoulder, aiming idle, lowering it (the rifle pack has all three) |
| `grab.fbx` | grab / lunge | a short forward lunge with a reach |
| `climb_steps.fbx`, `descend_steps.fbx` | stairs | walking up three steps, walking down |
| `step_down.fbx` | step down / jump down | stepping off a ledge about knee height |
| `unlock_loop.fbx` | opening / working | standing, both hands busy at chest height |
| `rail_look_out.fbx` | leaning | leaning forward on a rail, looking out |
| `shake_sheet.fbx` | pull / shake | one hard pull or shake at chest height |
| `stumble.fbx` | stumble | a short stumble |

Not needed as downloads: `torch_down_loop` (the kneeling idle, with the torch arm aimed by the game) and `door_step_in` (the walk). That is 24 downloads, about an hour. Put them in one folder and send it.

**3. Here:** merge everything in Blender (background) into `public/farfield/models/ff_human.glb`: the character, every clip renamed to the `ASSETS-3D.md` names, the torch, long gun, coil of cable and backpack attached as separate objects with the named sockets, the matte charcoal material, and the light copy for distant figures. Then measure each walk clip's stride, layer the torch arm and head over the clips and plant the feet, as for the rabbit.
**What it gets you:** real human proportions and natural, weighted movement for every action, quickly.
**Its limits:** library motion is generic. The unsettling quality has to come from our speeds, pauses and the code layers. Some actions (the reach under cover, the torch straight down) are approximations.
**Time:** you, about an hour and a half (Tripo, rigging, downloads). Here, about a day.

### Route B, BEST: a commissioned human

Give an animator the human section of `ASSETS-3D.md` (one model, three roles, the props, the clip list with speeds) and this file. They deliver `ff_human.glb` with the clips made for these people: the searching gait, the kneel-and-look under cover, the reach that falls short, the aim from the sling, the gate rattle.
**What it gets you:** people who move like these people: deliberate, heavy, slightly wrong.
**Time:** about 3 to 5 weeks.

## 6. How this was checked

Every number below comes from the real game (`index.html`, Sequence 1) in headless Chrome, driven by real key presses (arrows, Shift, Down, Space), with the frames stepped by the test. "Slide" is how fast a foot moves along the ground while it is supposed to be planted; 0 is perfect. The rabbit's body moves at 0.95 m/s walking, 2.75 running, 0.75 crouched and 0.62 pushing.

| check | before | now |
|---|---|---|
| stand-in rabbit, planted feet: walk / run / crouch-walk / push | hind feet 0.8 m/s in the walk (then 1.15 m/s; forepaws 0.57); every foot slid in the crouch-walk (0.75) | **0.000** in all four (forepaws 0.002 running) |
| rigged test rabbit (`rig_test3.glb`, a connected mesh rigged by `rig.py` with two test clips) | its run clip slid at 2.7 to 3.2 m/s (the clip's feet don't travel) | the game notices the clip can't be played without sliding and draws the run in code: hind toes 0.016 m/s walking and 0.065 running, forepaws 0.000 |
| the searcher's feet walking (1.0 m/s) | 2.8 m/s at their lowest, and floating 1.8 cm above the ground | 0.005 to 0.012 m/s, on the ground |
| console | clean | clean, with both rabbits and the people |

Not touched: the movement, the controls, what the people see and when they act, the camera, the light, the sound.

**Progress shots** (`farfield-look/progress/`; the close-ups move the game's own camera nearer after it frames, nothing else differs):
- `chars-01-cautious-walk-closeup.jpg`, `chars-02-run-closeup.jpg`, `chars-04-crouch-head-first.jpg`, `chars-05-crouch-walk.jpg`: the stand-in rabbit.
- `chars-03-run-game-camera.jpg`: the same run through the normal game camera.
- `chars-11-model-cautious-walk-closeup.jpg`, `chars-12-model-run-closeup.jpg`, `chars-14-model-crouch-head-first.jpg`: the rigged test rabbit, a connected mesh, driven by the same code: roughly what the Tripo rabbit will look like on day one.
- `chars-21-searcher-deck-walk-feet-planted.jpg`, `chars-22-searcher-standing-look.jpg`, `chars-23-searcher-game-camera.jpg`: the searcher, heavier, feet on the deck.
