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
1. Movement, swing, rooms, Watering Spots, the first guardian — sim + main done (physics tests pass); rooms and art in progress.
2. All areas, abilities, gating, map, Peddler, charms, saves — sim/main done; rooms being designed (31/68 so far).
3. All guardians + ending — the four guardians are in the sim; an auto-fighter calms each one (tests).
4. Local co-op, online co-op, touch, gamepad, room wrapper — main + net.js + rootlight-room.js written; online pairs and syncs over WebRTC in the harness.
5. Polish — pending (art, render, audio builders working).
