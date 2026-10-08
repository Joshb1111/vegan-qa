# Far Field: 3D models and animations to commission (7 Oct 2026; updated for Sequence 1 the same day, and for Sequence 2, The Works, on 8 Oct)

What to supply to replace the temporary rabbit, the stand-in human and the stand-in van, and later the environment. Written so it can be handed to a 3D artist as it is. The game (`public/farfield/index.html`) and the look test (`look.html`) already have the rabbit slot and the loader. Until a file arrives, the game uses its temporary stand-ins.

Sequence 1 (`SEQUENCE-1.md`) needs: the rabbit (first), ONE human model for all three people, and the van.

## The rabbit (needed first)

**File**
- glTF 2.0 binary: `ff_rabbit.glb`.
- One skinned mesh and one skeleton. Animations are inside the same file as named clips.

**Size and orientation**
- Real-world scale in metres: about **0.40 m nose to tail**. Standing on four legs, the top of the head is about 0.22 m and the ear tips about 0.32 m.
- The game uses 1 unit = 1 metre (no scaling).
- **Y up, facing +Z** (glTF's forward; Blender's default exporter gives this from a model facing -Y).
- **Origin on the ground between the four feet.**
- The game turns the rabbit to face left or right.

**Mesh**
- 6,000 to 12,000 triangles, one level of detail.
- Smooth and simple: a believable, physically rabbit-like shape on four legs. No clothes, no hands, no props.
- The silhouette matters most. It must read at about 80 px tall: long ears, round haunch, short front legs, round tail, a distinct head and muzzle.

**Material**
- One matte material. The game replaces the shading with its own matte look and keeps your colour.
- Colour: **pale warm grey, about sRGB (196, 190, 180) / `#c4beb4`**. Not pure white: it must stay below the brightest light so it reads by value without glowing.
- Slightly darker eyes, faintly pinker inner ears and a slightly whiter tail are welcome, through vertex colours or one base-colour texture (512² is plenty, 1024² at most).
- No normal or roughness maps are needed.

**Skeleton.** Use these bone names exactly. Extra bones are fine (for example eyelids, nose, whiskers).

| Body part | Bones |
|---|---|
| Body and head | `root` (at the origin), `hips`, `spine`, `chest`, `neck`, `head` |
| Ears (3 bones each, base to tip) | `ear_L_01`, `ear_L_02`, `ear_L_03`, `ear_R_01`, `ear_R_02`, `ear_R_03` |
| Front legs | `front_upper_L/R`, `front_lower_L/R`, `front_paw_L/R` |
| Hind legs | `hind_upper_L/R`, `hind_lower_L/R`, `hind_foot_L/R` (the long foot that lies flat) |
| Tail | `tail` |

Notes on the skeleton:
- The ears must be able to swing back flat along the body (about 120°) and bend along their length.
- At most **4 bone influences per vertex**, with normalised weights.
- An `eyelid_L/R` pair for blinking is an optional extra.

**Animation**
- **In place, no root motion**: the game moves the rabbit. The `hips` may bob up and down.
- 30 fps.
- Loops must start and end on the same pose.
- Make each moving loop at about the ground speed given below. **Since 7 Oct the game measures each moving clip's real stride when it loads** (how fast its planted feet travel back) and plays it at exactly the rabbit's speed, so the speeds need not be exact; a moving clip whose feet hardly travel is skipped and drawn by the game's own animation instead. Any clip a file lacks is drawn by the game's own animation, retargeted onto the model's bones. Export only clips that look better than that. The plan, the Tripo route and what to supply: `CHARACTERS.md`.
- **Speeds since Josh's playtest (7 Oct):** the cautious walk is **0.95 m/s** (a slow half-bound, distinct from the run); the run (Shift) 2.75; the flee 3.6; the crouch-walk 0.75.

### Clips

**Essential for the first playable section.** These are what the 3–5 minute prototype in `JOURNEY.md` uses: the courtyard push, the squeeze, the encounter, the dig, the safe vegetation.

| Clip | Frames | Type | Notes |
|---|---|---|---|
| `idle_breathe` | 60 | loop | Calm breathing, tiny shifts of weight |
| `idle_ear_twitch` | 18–24 | one-shot | One ear flicks and turns |
| `sniff` | 30 | one-shot | Nose and head bob, whiskers if any |
| `listen` | 45 | one-shot | Sits up on the haunches, ears turn |
| `walk` | 10–12 | loop | The cautious walk: a slow half-bound (forefeet one after the other, the hind feet together), about **0.95 m/s** |
| `hop_run` | 8–10 | loop | Bounding run at **2.75 m/s** |
| `jump_start` | 4–6 | one-shot | Short crouch, push off |
| `jump_air` | 10–12 | loop or hold | Stretched rising into reaching down |
| `jump_land` | 6–8 | one-shot | Front paws first, then a little settle |
| `crouch_idle` | 30 | loop | Low, ears flat |
| `crouch_walk` | 12–16 | loop | The squeeze; creeping at **0.75 m/s** |
| `hide` | 30 | loop | Pressed flat, ears down, still apart from breathing |
| `push_head` | 12–16 | loop | Head and shoulder against a box, hind legs driving, at **0.62 m/s** |
| `dig` | 16–20 | loop | Front paws scraping soft ground |
| `alert_freeze` | 20 | one-shot into a held last pose | Stops dead, ears up |
| `flee` | 8 | loop | Fastest bound, at **3.6 m/s**, tail up |
| `startle` | 4–6 | one-shot, additive | A 0.15 s flinch of surprise (the searcher has seen it); control is kept |

**Not needed:** `caught` and `hit`. The game cuts to black on the exact frame of a grab or a shot, so the rabbit is never shown caught or hit (SEQUENCE-1.md §10). (Optional: a file that has them plays them under the black.)

**Optional bone:** a shoulder-blade bone each side between `chest` and `front_upper_L/R` (any name) lets the forelegs reach as a real rabbit's do; without it the game fakes it by sliding the shoulder joint up to 4 cm (`CHARACTERS.md`).

**Also for Sequence 1** (the rabbit as an individual: SEQUENCE-1.md §4.2, §11):

| Clip | Frames | Type | Notes |
|---|---|---|---|
| `sniff_ground` | 60 | one-shot | Nose down to the ground and the weeds |
| `nibble` | 30 | loop | Eats a few blades of grass and clover |
| `shake_off` | 24 | one-shot | Whole-body shake (after rain, a squeeze, the drain) |
| `look_back` | 36 | one-shot, additive | Head turns back over the shoulder |
| `peek` | 30 | loop | At the edge of cover, head forward, body back |
| `reach_fail` | 15 | one-shot | Paws scrabble below a sill that is too high, slides back |
| `climb_in` | 24 | one-shot | From the box top up into a raised opening |
| `pop_out_hop_down` | 36 | one-shot | Out of an opening, a sniff of the air, a hop down 0.8 m |
| `drop_splash` | 12 | one-shot | Lands in shallow water |
| `settle_loaf_in` + `loaf_breathe` | 30 + 60 | one-shot into loop | Lies down into a loaf, then slow breathing (the ending) |

**Can wait** (life and the safe moments later on):

| Clip | Frames | Type | Notes |
|---|---|---|---|
| `groom` | 60–90 | one-shot | Face washing |
| `relax_lie` | 30 + 60 | one-shot into loop | Lies down, then breathes |
| `look_up` | 30 | one-shot | |
| `hesitate_look_down` | 30 | one-shot | At an edge |

If a clip is missing, the game falls back to a near neighbour (`crouch_walk` → `crouch_idle` → `walk`; `hop_run` → `walk`; `push_head` → `crouch_walk`; `jump_*` → `hop_run`). A partial delivery still runs.

## How to drop files in

1. Put the file in **`public/farfield/models/`** and write its name in **`public/farfield/models/models.json`** (`"rabbit": "ff_rabbit.glb"`; also `"human"` and `"van"`). That data file is the only change: no code. (The game reads the list first, so an absent model never shows as an error.) The frozen look test still looks for `models/ff_rabbit.glb` directly.
2. To try another file without changing the list, open `index.html?rabbit=<file>` (a path under `models/`; `look.html` takes the same). `?rabbit=procedural` forces the temporary rabbit.
3. The loader (three.js r128 `GLTFLoader`, downloaded only when a file exists):
   - keeps the model's colour, texture or vertex colours, and applies the game's matte shading;
   - if the model's length is outside 0.15–1.0 units, rescales it to 0.40 m and says so in the console (for exports in centimetres).
4. **Proof it works:** `tools/bake-rabbit.html` exports the temporary rabbit as a real rigged file, `models/test/ff_rabbit_test.glb` (the bone names above, 11 clips, 346 KB). `look.html?rabbit=test/ff_rabbit_test.glb` plays it through the clip system: idle, run, jump, push and crouch shown in `shots/model-slot-test.jpg`. A commissioned rabbit can be checked the same way.

## The human (Sequence 1: one model for all three people)

Replaces the earlier human outline (SEQUENCE-1.md §14 and Amendment A4/A21). **One model serves all three roles**; props are shown or hidden by role:

| Role | Gun | Torch | Other | Behaviour |
|---|---|---|---|---|
| The Verge person | slung on the back | yes | | seen as boots under a gate, then whole from below; rattles the chain, kneels at the culvert, reaches in |
| The walkway worker | **no** | **no** | a coil of cable over one shoulder | walks, pauses at a rail looking away, leaves; never notices the rabbit |
| The searcher | slung; raised to aim | yes | | his own routine (walk-search, crouch-look, climb, look, turn-sweep) |

**File:** `ff_human.glb` (one skinned mesh, one skeleton, the clips inside).
- **Size and orientation:** 1.72–1.85 m tall, metres, Y up, facing +Z, origin on the ground between the feet.
- **Skeleton:** a standard humanoid with **Mixamo-compatible bone names** (`mixamorig:Hips`, `mixamorig:Spine`, …), so library animations can be retargeted. At most 4 influences per vertex.
- **Mesh:** ≤ 15,000 triangles, plus a **≤ 4,000** low-detail version for distant figures (beat 5 later has several at once).
- **Material:** one matte material in dark charcoal (about `#1a1d21`). They read as silhouettes (cap with a forward brim, coat, backpack with a rolled mat on top: the hump that makes the shape), not detail. No face detail needed.
- **Props as separate rigid nodes** (shown or hidden by role): `prop_torch` (with a `torch_emitter` empty at the lens, +Z along the beam), `prop_longgun` (a plain, generic long gun shape, no real-world model, with a `gun_muzzle` empty), `prop_coil`, and `prop_pack` (the backpack as its own node, so the walkway worker can go without it, as the stand-in already does: his silhouette then differs from the two armed figures as well as his behaviour).
- **Sockets (named empties):** `hand_L_socket`, `hand_R_socket`, `back_socket` (the sling).

**Clips (30 fps, in place, no root motion; the game moves the figure):**

| Clip | Type | Notes |
|---|---|---|
| `idle` | loop | breathing, a weight shift every few seconds |
| `walk` | loop | authored at **1.3 m/s** |
| `walk_search` | loop | **1.0 m/s**, torso and head slightly down, torch arm forward, sweeping |
| `run` | loop | **2.6 m/s**, torso forward, torch jolting |
| `turn_180` | one-shot | 1.0 s, three steps, the head leading |
| `door_step_in` | one-shot | 1.0 s, from a doorway |
| `notice` | one-shot | stops mid-step (0.3 s), head snaps round, torch steadies |
| `crouch_look_in` / `_loop` / `_out` | sequence | kneel 0.8 s with the torch up, look under something low, stand 0.6 s |
| `kneel_in` / `_loop` / `_out`, `kneel_reach` | sequence | the reach under cover: an arm in, groping, out (restrained) |
| `aim_raise` / `aim_hold` / `aim_lower` | sequence | 0.5 s up from the sling, held still, 0.5 s down |
| `grab` | one-shot | the lunge: a 0.45 s lean and bend, then the reach |
| `climb_steps` / `descend_steps` | one-shot | 1.4 s, three steel risers of 0.283 m |
| `step_down` | one-shot | off a 0.85 m platform edge, 0.8 s |
| `unlock_loop` | loop | at a gate, chain and padlock (legs read most) |
| `torch_down_loop` | loop | kneeling, torch pointed straight down |
| `rail_look_out` | loop | leaning on a rail, looking away into the distance |
| `shake_sheet` | one-shot | shakes a corrugated sheet once |
| `stumble` | one-shot | |

**Not needed:** `fire`. The cut to black happens on the shot's first frame.

### Sequence 2: a fourth role, the maintenance worker (`painter`)

The same model (SEQUENCE-2.md §7, §17). He scrapes hand-sprayed END ANIMAL USE off a passage wall with his back to the lane; when he notices the rabbit he lifts his work lamp off its tripod, holds its light on the rabbit for two seconds, hangs it back and goes back to work, harder. He never steps towards the rabbit, never calls out, never reaches for it.

| Role | Gun | Torch | Other | Behaviour |
|---|---|---|---|---|
| The maintenance worker | **no** | **no** (his tripod lamp is world decor) | `prop_scraper` in his right hand; no backpack, no coil | stands at one spot facing a wall: scrapes, stops, turns along the passage for a rag, turns back; the look |

- **New prop nodes:** `prop_scraper` (a long-handled wire scraper, about 1.0 m, held in both hands), `prop_worklamp` (a tripod work lamp whose head lifts off the mast, with a `lamp_emitter` empty at the lens, +Z along the beam). A bucket and a trolley are world decor.
- **New clips (30 fps, in place):** `scrape_wall_loop` (both hands on the handle, strokes up and down at chest height, 1.5 a second; the game speeds it to 2.2 for "harder"), `straighten` (0.5 s, the scraper lowered), `reach_trolley` (1.6 s, the left hand out to his side for a rag, the head looking along the lane), `dip` (the scraper into the bucket), `lamp_lift` (0.5 s), `lamp_hold_loop` (utterly still, the lamp at shoulder height), `lamp_lower` (0.6 s), `lamp_hang` (0.5 s). `turn_180` and `idle` already exist.
- Until they exist, the stand-in figure is posed in code (`ff-painter.js`), with every Sequence 1 prop hidden and a stand-in scraper in its hand.

## The van (Sequence 1)

**File:** `ff_vehicle.glb`. A boxy, unbranded utility van: 5.0–5.6 × 1.9–2.1 × 2.2–2.5 m, ≤ 8,000 triangles, metres, Y up, facing +Z, origin on the ground at the centre.
- **Nodes:** `body`, `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR` (pivots at the hubs), `door_driver`.
- **Empties:** `light_head_L`, `light_head_R`, `light_work` (roof work light), `light_marker_1` … `n` (amber side markers).
- **Materials:** one matte body material (about `#24282d`) and one emissive "lamp" material. No badges, no brand, blank plates.

## Environment (later; simple, matte, modular)

**Format and naming**
- One `.glb` per piece, named `ff_env_*` (architecture) and `ff_prop_*` (objects).
- Metres, on a 0.5 m grid.
- Pivot at floor level: centred for props, at the bottom-left of the front face for wall and floor pieces.
- One matte colour per piece (vertex colours or a tiny palette texture). No baked lighting, since the light is real-time.
- Walls and floors ≤ 500 triangles each; props ≤ 2,000.

**First kit** (sizes as used in the look test):

| Kind | Pieces |
|---|---|
| Walls and floors | `ff_env_wall_4m` (4 × 6 × 0.3 m panel with seams), `ff_env_wall_corner`, `ff_env_floor_4m` (4 × 4 × 0.3 m) |
| Openings | `ff_env_culvert_opening` (a 2 m block with a 0.46 × 0.40 m low opening and a short tunnel), `ff_env_drain` (beat 1), `ff_env_vent` |
| Props | `ff_prop_box` (0.52 × 0.44 × 0.50 m crate), `ff_prop_pipe_4m` (radius 0.25 m), `ff_prop_pipe_elbow`, `ff_prop_tank` (radius 0.5 m, 1.6 m tall), `ff_prop_railing_2m`, `ff_prop_grate`, `ff_prop_valve`, `ff_prop_plank` |

**Sequence 2, The Works** (SEQUENCE-2.md §17; collision stays data; the stand-ins in `ff-world-s2.js` show the sizes):

| Piece | Notes |
|---|---|
| `ff_env_press_platen` | three sizes: 3.8, 7.0 and 8.0 m long (1.6 m thick; the great press 2.4 m), about 3.5 m deep; chamfered lower edges; a strip lamp along the underside's front edge as a separate emissive node |
| `ff_env_press_frame` | two columns, two screws, the crosshead about 12 m up; the great press's frame twice the mass |
| `ff_env_counterweight` | about 1.0 × 2.2 × 0.85 m, in its shaft |
| `ff_env_bed_slot` | a bed segment with a drainage slot cut through its front face (the slots are 1.0–1.1 m wide at the floor, 0.40 deep, with 0.6 m ramps) |
| `ff_env_sluice_gate` | a solid steel drainage gate (no bars), 0.1 m thick, 0.3 m tall, sliding up into the bed |
| `ff_env_slab_lid` | a cracked precast channel lid, 2.6 m, weeds in the crack |
| `ff_env_pipe_large` | 1.4 m diameter, about 7 m long, on two concrete saddles |
| `ff_prop_worklamp`, `ff_prop_trolley`, `ff_prop_bucket`, `ff_prop_paint_tins` | the passage's props (the tins on a pallet are a hiding place: the pallet's top 0.26 m up) |

**Later**
- `ff_env_walkway` (beat 2)
- Shifting platforms (beat 6)
- Grass and weed clumps, and `ff_env_slope_wall` (beats 7 and 9)

**Collision is separate data, never the mesh.** The level data places simple boxes, so a piece can be any shape and the puzzles stay exact.
