# Far Field: 3D models and animations to commission (7 Oct 2026)

What to supply to replace the temporary rabbit, and later the humans and the environment. Written so it can be handed to a 3D artist as it is. The look test (`public/farfield/look.html`) already has the slot and the loader. Until a file arrives, the game uses the temporary rabbit.

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
- Make each moving loop at the ground speed given below, so the feet do not slide. The game speeds playback up or down to match.

### Clips

**Essential for the first playable section.** These are what the 3–5 minute prototype in `JOURNEY.md` uses: the courtyard push, the squeeze, the encounter, the dig, the safe vegetation.

| Clip | Frames | Type | Notes |
|---|---|---|---|
| `idle_breathe` | 60 | loop | Calm breathing, tiny shifts of weight |
| `idle_ear_twitch` | 18–24 | one-shot | One ear flicks and turns |
| `sniff` | 30 | one-shot | Nose and head bob, whiskers if any |
| `listen` | 45 | one-shot | Sits up on the haunches, ears turn |
| `walk` | 10–12 | loop | Slow hop, authored at **1.0 m/s** |
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
| `flee` | 8 | loop | Fastest bound, at **3.6 m/s** |
| `caught` | 20 | one-shot | Brief and non-graphic: a startle and stillness; the game cuts to black |
| `hit` | 6–8 | one-shot | A flinch only; the game cuts to black |

**Can wait** (life and the safe moments later on):

| Clip | Frames | Type | Notes |
|---|---|---|---|
| `groom` | 60–90 | one-shot | Face washing |
| `relax_lie` | 30 + 60 | one-shot into loop | Lies down, then breathes |
| `look_up` | 30 | one-shot | |
| `hesitate_look_down` | 30 | one-shot | At an edge |

If a clip is missing, the game falls back to a near neighbour (`crouch_walk` → `crouch_idle` → `walk`; `hop_run` → `walk`; `push_head` → `crouch_walk`; `jump_*` → `hop_run`). A partial delivery still runs.

## How to drop files in

1. Put the file in **`public/farfield/models/`**. Name the rabbit **`ff_rabbit.glb`** and the game uses it instead of the temporary rabbit, with no code change.
2. To try another file without replacing the default, open `look.html?rabbit=<file>` (a path under `models/`). `look.html?rabbit=procedural` forces the temporary rabbit.
3. The loader (three.js r128 `GLTFLoader`, downloaded only when a file exists):
   - keeps the model's colour, texture or vertex colours, and applies the game's matte shading;
   - if the model's length is outside 0.15–1.0 units, rescales it to 0.40 m and says so in the console (for exports in centimetres).
4. **Proof it works:** `tools/bake-rabbit.html` exports the temporary rabbit as a real rigged file, `models/test/ff_rabbit_test.glb` (the bone names above, 11 clips, 346 KB). `look.html?rabbit=test/ff_rabbit_test.glb` plays it through the clip system: idle, run, jump, push and crouch shown in `shots/model-slot-test.jpg`. A commissioned rabbit can be checked the same way.

## Humans (later: beats 2, 3, 5, 8)

**File and size**
- One rigged humanoid `.glb` per character type, sharing **one standard humanoid skeleton with Mixamo-compatible names** (`mixamorig:Hips`, `mixamorig:Spine`, …), so library animations can be retargeted.
- About 1.75–1.80 m tall, Y up, facing +Z, origin between the feet.

**Mesh and material**
- At most 15,000 triangles, plus a **low-detail version (≤ 4,000)** for distant figures. Beat 5 has several humans at once.
- One matte material in dark charcoal. They read as silhouettes (cap, coat, backpack shapes), not detail.
- At most 4 influences per vertex.

**Clips (30 fps, in place):**
- `idle`
- `patrol_walk` (loop, 1.3 m/s)
- `stop_listen`
- `turn_L90`, `turn_R90`, `turn_180`
- `raise_torch`
- `search` (looking around, torch sweeping)
- `alert`
- `run` (loop, 4 m/s)
- `reach_catch` (one-shot)
- `aim`
- `fire` (one-shot, small and non-graphic)
- Beat 5 routines (`carry`, `work_station`, `stand_wait`) when that section is designed.

**Attachment points as named empty nodes**, +Z along the direction they point:
- `torch_emitter` at the torch lens (the game hangs its torch light and beam here);
- `gun_muzzle`;
- `hand_R_socket`.

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

**Later**
- `ff_env_walkway` (beat 2)
- `ff_prop_vehicle` with named `headlight_L/R` empties (beat 1)
- Machine pieces with named moving parts (beat 4)
- Shifting platforms (beat 6)
- Grass and weed clumps, and `ff_env_slope_wall` (beats 7 and 9)

**Collision is separate data, never the mesh.** The level data places simple boxes, so a piece can be any shape and the puzzles stay exact.
