# ROOTLIGHT — progress

Branch `rootlight`. Game in `public/rootlight/`, arcade wrapper `public/rootlight-room.js`, notes and tools in `docs/rootlight/`.

## How it is built
- `docs/rootlight/INTERFACE.md` — the contract between the files (sim state, render/art/audio APIs, content rules).
- `docs/rootlight/tools/plan.js` — the world plan: 68 rooms in 7 areas, every doorway, each room's brief. `node plan.js` prints the map.
- `docs/rootlight/rooms/<area>.js` — the hand-made rooms (ASCII maps). `node tools/build-world.js` merges them into `public/rootlight/world.js`.
- `docs/rootlight/tools/check.js` — format and doorway check. `tools/reach.js` — a physics bot that plays every room with the real
  sim and walks the whole world in story order (abilities, guardians, items, no softlocks). `tools/simtest.js` — physics and guardian tests.
- `docs/rootlight/test/net.html` — two copies of the real room wrapper paired by a stand-in lobby (lossy relay options) for online tests.

## Milestones
1. Movement, swing, rooms, Watering Spots, the first guardian — done. Physics tests pass (tools/simtest.js: 29 checks).
2. All areas, abilities, gating, map, Peddler, charms, saves — done. 68 hand-made rooms; the reach bot (real sim physics)
   walks the whole world in story order: every room, item, ability and guardian reachable, no softlocks.
3. All guardians + ending — done: the Thorn Knot, the Old Boiler, the Grey Cloud, the Gloom Heart (3 phases); an
   auto-fighter calms each one in tests; every attack telegraphed 46+ ticks; the ending screen.
4. Local co-op, online co-op, touch, gamepad, room wrapper — done: shared camera + tether + seed bubbles; net.js tested
   through two copies of the real room wrapper (WebRTC and the relay); simulated gamepads; touch pad with a portrait band.
5. Polish — in progress: art.js, render.js and audio.js delivered; independent reviews (playtest, art/content, online) running.

## Controls
One player: arrows + Z jump, X swing, C dash, A focus (hold) / Up + A Sunbeam — or WASD + J, K, L, I. Up at a Watering Spot:
rest; Up by the Peddler: talk; Tab or M: map; Esc: pause; N: music. On the title (and in the pause menu) M toggles all sound.
Two on one keyboard: SPRIG = WASD + F jump, G swing, H dash, T focus; MARIGOLD = arrows + J, K, L, I.
Gamepad: A jump, X swing, RB/RT dash, B focus, Y Sunbeam, Back map, Start pause. Touch: left stick, JUMP/SWING/DASH/FOCUS.

## Tests
- `node docs/rootlight/tools/check.js` · `node docs/rootlight/tools/simtest.js` · `node docs/rootlight/tools/reach.js` (about 10 min)
- Browser (headless Chrome via the scratch harness): flow (title to shop, rest, map), rooms, online pair, room wrapper, gamepads.
