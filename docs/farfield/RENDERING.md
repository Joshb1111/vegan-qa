# Far Field: how it is rendered (decision, 7 Oct 2026)

Look test: `public/farfield/look.html` (run any static server over `public/`, open `/farfield/look.html`).
Shots: `docs/farfield/shots/` (start with `final-vs-ref.jpg`). The visual target is `reference/visual-target.webp`; the story is `JOURNEY.md`.

## 1. The verdict in plain English

**The arcade games' layered Canvas-2D approach cannot give this look, and Far Field should not use it.**

The arcade games (Berry Breeze, Vine Line, Sprout Kart, Beet Beat, Rootlight) draw flat painted layers in Canvas 2D. Rootlight already fakes "god-rays" and light pools with additive gradient sprites and a quarter-size light map. That suits a bright cartoon. It cannot do what the reference is made of:

- **Real directional light falling on 3D shapes.** In the reference, the crate, tanks, pipe and rabbit are lit on one side and dark on the other, and they cast soft shadows that bend over the floor and up walls. In 2D every object would need hand-made lit, unlit and shadow versions for each light position. A moving light (the torch in beat 3, headlights in beat 1) would need a new drawing for every angle.
- **Shafts and haze that sit in depth.** Shafts pass in front of some things and behind others, fog thickens with distance, and the floor recedes. Layered 2D can approximate one fixed camera, but not a camera that follows the rabbit with parallax that stays correct.
- **A floor pool that lights whatever walks into it.** When the rabbit or the crate enters the pool, they light up and their shadows appear. In 2D that is a hand-written special case for every object.

Faking it would mean painting a set of light states for every prop and every light, then compositing them by hand. It would cost more art time than modelling simple 3D shapes, and it would still break the moment the camera or a light moves.

**Chosen: three.js r128, the same classic build the planet already loads**, with a side-on perspective camera and gameplay constrained to a 2D plane. The look test proves it: one key light through a high window, a window-shaped pool, soft shadows, shafts in the haze, depth fog and a readable pale rabbit. It holds well over 60 fps on a laptop (numbers in section 5).

**What must change before the game is expanded** (none of it is a renderer change):

1. A level format. Today the look test has one room in code (`ff-scene.js`) and collision boxes in data (`FF.LEVEL` in `ff-config.js`). Before more rooms, move both into per-area data, plus **light zones**: each area carries its own `LOOK` values (key direction, fog, exposure) that blend as the camera moves. Beats 7 and 9 change exposure and daylight drastically.
2. Generalise the beam. The volumetric beam is one window beam today. Beats 1, 3, 5 and 8 need cones (a torch, headlights) and more than one beam, and later the beam should be cut by the human holding the torch. The same analytic code extends to a cone and to 2–3 beams at once.
3. The arcade wrapper (`farfield-room.js`, with the content notice) and a teardown test inside the planet. See section 6.
4. The real rabbit model. The slot and loader are ready (`ASSETS-3D.md`).

## 2. What exists in the repo (inspected)

- **Arcade games** (`public/rootlight/`, `public/vine/`, `public/breeze/`, `public/kart/`, `public/beat/`) are Canvas-2D renderers with synthesised Web Audio. Each runs inside an iframe opened by a room wrapper (`public/*-room.js`). The parent↔game protocol uses `postMessage` with the same origin only. The game says `{ty:'ready'}`; the room sends `mute`, `music` and `link`/`net` for online play; the game sends `{ty:'exit'}` (Escape on the title) and `mute` changes. The room removes the iframe to stop (`dropFrame()` → `frame.remove()`).
- **The planet** (`public/planet.html`) uses three.js r128 from cdnjs (`three.min.js`), with examples from jsdelivr `three@0.128.0` (`GLTFLoader`, `DRACOLoader`, `SkeletonUtils`). It uses `PCFShadowMap` with a 1024/2048 sun map, no tone mapping, and its own ink pass through render targets. When a house or room is open, `frame()` stops drawing the planet and only ticks at 4 Hz for live presence (`houseOn` → `setTimeout(...,250)`).

## 3. The renderer decisions

| Decision | Choice | Why |
|---|---|---|
| Library | **three.js r128 classic build** (`cdnjs .../three.js/r128/three.min.js`) | It is already in the browser cache of everyone who reached the arcade (same site, same URL). It matches the codebase, and it has everything the look and the nine beats need: PCF shadows, skinned meshes and `AnimationMixer`, `GLTFLoader` with Draco and meshopt compression (the look is untextured, so KTX2 texture compression, which r128 offers only as an ES module, is not needed), multisampled half-float render targets on WebGL2, and `onBeforeCompile` for shader patches. No feature in the journey needs a newer three. A newer ES-module build would only add a second ~150 KB download and a different API from the rest of the codebase. |
| Post-processing | **Hand-rolled** in `ff-post.js` (no EffectComposer download) | One scene target, then a 2-level bloom, then one final pass that does exposure, ACES filmic, grading, vignette, a darker bottom edge, grain and sRGB. About 120 lines, and every tier goes through the same final pass, so the look never changes between tiers. |
| Camera | **Perspective, 26° vertical, 8.2 m from the lane, lens 1.15 m up, eye level shifted to 57% down the frame** | A narrow lens keeps the side-on, almost diorama feel while keeping real depth: the floor recedes, the haze thickens and the hall opens behind. The lens shift (`projectionMatrix.elements[9]`) puts the horizon low without tilting the camera, so walls stay vertical as in the reference. Orthographic was rejected because it loses the floor plane, the parallax and the depth fog, which carry the scale. |
| Gameplay plane | x/y plane at z = 0; collision is axis-aligned boxes in data (`FF.LEVEL.solids`, the crate), never meshes | Puzzle logic stays 2D and exact. The art can change freely. |
| Units | metres, real scale (rabbit 0.40 m long) | The lighting, fog distances and the "enormous ordinary objects" feeling all come from real scale. |

## 4. How the look is made (all in `public/farfield/js/`, numbers in `ff-config.js`)

- **The key light** (`ff-scene.js`) is one `SpotLight` placed 70 m away along the light direction, so its rays are near-parallel like sun through a high window. It comes from high behind the wall towards the lens, down to the left at about 35°. A shader mask shapes its cone into a **soft-edged rectangle**, the window, so the pool on the floor is a window-shaped trapezoid. The pool has a gently brighter centre and crisp side edges, and is a faint warm cream against cold fill. It is the only shadow-casting light (2048/1024/512 map by tier). Only things near the pool cast its shadow (crate, block, pipes, cables, rabbit). The tall background forms do not, so the window light is never blocked by architecture you cannot see.
- **Soft shadows**: the PCF branch of three's shadow shader is replaced (`ff-shading.js`) with a rotated-disc filter of 16/8/4 taps (by tier) with per-pixel rotation. The film grain hides the dither. The softness is one number (`key.shadowSoftness`).
- **Shafts** (`ff-scene.js`, the beam material) are the beam as a volume. A box around the beam is drawn once, additively. For each pixel, the view ray's path through the window beam (clipped by floor, wall and ceiling) is sampled 10/6/3 times. Each sample uses the soft window mask × **a few art-directed bands** (`shafts.bands`: offset, width, strength) × haze attenuation. The shafts fade out in their last 0.7 m so the air behind the rabbit stays dark. The **same band pattern also streaks the pool on the floor**, so shafts and pool agree. There is no depth texture and no extra full-screen pass. A screen-space god-ray pass was rejected: the light source is off-screen, and a radial blur would cost a full-screen pass for a weaker result.
- **Haze and depth fog** (one patch on every material): depth fog starts behind the midground (7.5 m) with a linear term plus a term that grows with distance, so near stays clear and far thickens. On top of that come forward scattering (fog seen towards the light is brighter), a backlit haze volume in the far hall (the three depth layers: near-black foreground, mid structures, pale far haze), and haze lit by the beam (surfaces near the shafts get a soft band-modulated glow).
- **Fill**: a dim cold hemisphere light; a cool **wall fill** applied only to wall materials, with a gentle vertical and horizontal gradient (Josh's note: reveal the wall's surface without lifting everything); a faint bounce from the pool; the low opening's own cool spill (a small spot inside the tunnel); one amber lamp (glowing bulb + halo, a tiny point light on high).
- **Contact shadows / AO** (analytic, a few instructions per pixel, no SSAO pass): a crease where walls meet the floor, soft darkening on the floor around the bases of the crate, block, column, bulkhead and platform (boxes in uniforms), and a soft ellipse under the rabbit that fades as it jumps.
- **Surfaces**: `MeshStandardMaterial`, roughness 0.6–1, metalness 0, no textures. A very low-frequency mottling (±5–10%) keeps big planes from looking dead flat.
- **Grading** (`ff-post.js`): exposure, ACES filmic, saturation 0.8, slight contrast, a cold slate lift in the shadows, a vignette, a darker bottom strip, and fine grain. Bloom has a high threshold, so only the lamp and the brightest edges glow.

**Keeping the pale rabbit readable** (the rules, measured on `final.jpg`):

- The rabbit's albedo is pale warm grey (`#c6c0b6`), matte (roughness 0.85), with no bloom on it (threshold 5.0 in linear light).
- It stands at the **far edge of the pool**, so it is lit while its body sits against the dark floor and wall base. The light comes from behind the wall, so the pool lies on and in front of the lane. Measured: rabbit mean sRGB 127 (90th percentile 215) against 65 directly behind it, a **4.1× luminance ratio**; 1.6× against the wider ring around it.
- A faint cool rim (fresnel, strength 0.12) and a tiny self-light (0.006 of albedo) keep its silhouette from sinking fully into black when it leaves the light.
- The brightest values in the frame are the pool and the rabbit. The hatch and the lamp are kept below them.
- Later rooms should follow the same rule: put rest points and readable moments where the rabbit has darkness behind it and light on it.

## 5. Performance

**Measured** in headless Chrome on the GPU path (ANGLE Metal on an **Apple M2**, not software rendering), vsync off, rabbit running and turning, 22k triangles, 21–30 draw calls including post. The Mac was busy with other work during some runs, so treat these as conservative.

| Viewport (canvas pixels) | high | medium | low |
|---|---|---|---|
| 1600×900 (1×) | 167 fps (6.0 ms, p95 7.4) | 213 fps (4.7 ms) | 318 fps (3.2 ms) |
| Retina laptop 1440×900 at 2× | 99 fps (10.1 ms, p95 11.0) at 2160×1350 | 180 fps (5.5 ms) at 1800×1125 | 388 fps (2.6 ms) at 1440×900 |
| Phone-sized landscape 844×390 | 357 fps | 401 fps | 499 fps |

Before the pixel-ratio cap, high at 2× (2880×1800) averaged 57 fps with a 34 ms p95 on the same M2. So **pixel ratio is capped at 1.5 / 1.25 / 1** (high / medium / low). A slow-frame guard steps down one tier when frames average over 21 ms for 2 s (never up, and never after the player presses Q or the URL sets `?q=`).

**Tiers (Q cycles them; F shows fps, draws, triangles):**

- **high**: 1.5× pixel ratio, 4× MSAA, 2048 shadow map with 16 taps, 2-level bloom, grain, dust in the beam, bounce and amber point lights, 10 beam samples.
- **medium**: 1.25×, 2× MSAA, 1024 map with 8 taps, 1-level bloom, grain, 6 samples.
- **low**: 1×, no MSAA, 512 map with 4 taps, no bloom or grain, no extra point lights, 3 samples.

Phones (coarse pointer, small screen) start on low.

**Download**: `look.html` + 6 scripts ≈ 94 KB uncompressed (roughly 25 KB gzipped). three.js r128 (600 KB, ~150 KB gzipped) is shared with the planet and usually cached. `GLTFLoader` (96 KB) loads only when a model file is present. Budget for the first playable section: **≤ 4 MB** of models (rabbit ≤ 1 MB, one human ≤ 1.5 MB, environment kit ≤ 1.5 MB). Nothing loads until the arcade cabinet is used: the iframe is created only on Play.

## 6. Living inside the planet's arcade

- The game runs in its own iframe with **its own WebGL context**, created when the player presses Play.
- On `pagehide` (the room removing the iframe) or a `{ty:'leave'}` message, it disposes every geometry, material, render target and shadow map, then calls `WEBGL_lose_context.loseContext()`. That frees GPU memory at once instead of waiting for garbage collection.
- It sends `{ty:'ready'}` when started and `{ty:'exit'}` on Escape, as the other games do.
- **The planet already stops drawing while a room is open.** `enterHouse` sets `houseOn`, and `frame()` then only ticks at 4 Hz. There is no GPU contention per frame.
- **Flag: the planet's own GPU memory stays allocated** behind the iframe (its textures, the GLB town, its ink render targets and shadow maps). That is fine on laptops. On older phones, two live WebGL contexts are the main risk: iOS Safari can kill a context under memory pressure. Two mitigations for the integration step:
  - When `houseOn`, the planet could release its large render targets and reallocate them on `closeHouse`. That is a small planet change, out of scope here.
  - The game should handle `webglcontextlost` / `webglcontextrestored`: show a "tap to continue" and rebuild.
- The room wrapper still to write (`public/farfield-room.js`, modelled on `vine-room.js`) needs: Play only (single-player), the **content notice** (pursuit, capture and non-graphic violence towards the rabbit) on the room menu and again on the game's first screen, the mute button, and `?mute=1` handling. The look test has no audio, so it never creates an `AudioContext`.

## 7. What the later beats in `JOURNEY.md` need from the renderer

None of the beats changes the library decision. They do shape the next steps:

- **1 The Verge (rain-soaked grass, a vehicle beyond the wall, a drain):**
  - Outdoor light needs a **directional key whose shadow frustum follows the camera**, not the far spot.
  - Grass: instanced blades with wind sway in the vertex shader, dark silhouettes. Medium and low tiers use fewer blades.
  - Rain: GPU particles, plus wet surfaces through lower roughness on the floor (no screen-space reflections).
  - Headlights: two **cone beams** (the generalised beam volume), moving, unshadowed or with one shared shadow.
- **2 The Courtyard (distant human on an elevated walkway):** one distant animated human at a lower update rate.
- **3 The Search (torch, footsteps, pursuit):**
  - **A torch = a second shadow-casting spot + a cone beam that the human's body cuts.** Budget: at most 2 shadow-casting lights on screen (key + torch).
  - Danger is telegraphed by light first, so the beam must be bright enough to read even on the low tier.
- **4 The Works (a large machine cycling):** rigid animated parts (no skinning), shadow casters near the lane, perhaps rhythmic moving light on the floor. This is cheap.
- **5 The Occupied Building (coordinated humans in distant rooms):**
  - **Crowd budget: up to ~8 skinned humans animated at full rate; more than that, distant ones update at 10–15 Hz** and use a lower-poly LOD (one shared skeleton via `SkeletonUtils.clone`).
  - Rooms seen through openings work as layered depth with fog. This needs light zones.
- **6 The Descent (narrow passages, shifting platforms, rising water):** a **matte dark water surface** (fresnel sheen, gentle ripple normals, rising height as level data, fog under the surface). No reflections beyond a soft sheen; planar reflection only as an optional high-tier extra.
- **7 The False Exit (grass, daylight, inside another structure):** **scripted exposure and grade per light zone**, not automatic eye adaptation, so the reveal is art-directed. Daylight haze uses the same fog with a bright colour.
- **8 The Crossing:** combines the above; checkpoints are data.
- **9 The Far Field (open land, distant human world):** a sky gradient dome, distant landscape layers in heavy fog, a grass field (the same instanced grass), long sight lines. The far layers can be simple low-poly cards.

## 8. Files

- `look.html` is the page.
- `js/ff-config.js` holds **all art-direction numbers** (`FF.LOOK`), the quality tiers and the level data.
- `js/ff-shading.js` patches three's materials: fog, AO, wall fill, the window mask, soft shadows and the rim.
- `js/ff-scene.js` holds the room, lights, beam and dust.
- `js/ff-rabbit.js` holds the temporary procedural rabbit, its code animation and the model slot.
- `js/ff-post.js` holds the post chain.
- `js/ff-main.js` holds the renderer, camera, movement, crate, input, loop, tiers, teardown and the `window.__ff` test handle.
- `tools/bake-rabbit.html` exports the placeholder as a rigged test `.glb`.

**Test handle** (`window.__ff`, for headless tests):

- `pause()`, `freeze()`, `step(n)` (fixed 1/120 s steps, then one draw)
- `hold(key)`, `press(key)`, `release()`
- `teleport(x, face)`, `reset()`, `setTier(name)`, `stats()`
- Live tuning: change `__ff.look.*`, then call `__ff.apply()`.
