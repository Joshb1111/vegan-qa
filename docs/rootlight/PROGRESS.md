# ROOTLIGHT — progress

Branch `rootlight`. Game in `public/rootlight/`, arcade wrapper `public/rootlight-room.js`, notes and tools in `docs/rootlight/`.
Not wired into the planet yet (the lead picks a cabinet): `rootlightRoom(body, ctx)` with `ctx = {duelFind, duelSend, duelCancel,
duelLeave, DUEL, LIVE, MP, me, musicOn}`, the same as `kartRoom`; it calls `duelFind('rootlight', …)`.

## How it is built
- `docs/rootlight/INTERFACE.md` — the contract between the files (sim state, render/art/audio/net, content rules).
- `docs/rootlight/tools/plan.js` — the world plan: 68 rooms in 7 areas, every doorway, each room's brief. `node plan.js` prints the map.
- `docs/rootlight/rooms/<area>.js` — the hand-made rooms (ASCII maps). `node tools/build-world.js` merges them into `public/rootlight/world.js`.
  `node tools/edit-room.js <room> set|sign|text …` makes small edits.
- `docs/rootlight/tools/check.js` — format and doorway check. `tools/reach.js` — a physics bot that plays every room with the real
  sim and walks the whole world in story order. `tools/simtest.js` — physics, guardians, co-op, saves, shop. `tools/fixcheck.js` —
  regressions found in review. `tools/trace.js` — trace a scripted run in a room.
- `docs/rootlight/test/net.html` — two copies of the real room wrapper paired by a stand-in lobby (`?lat=&jit=&loss=&nortc=1`).
  `test/art.html`, `test/render.html`, `test/audio.html` — contact sheets and audio checks.
- `docs/rootlight/shots/` — a few small screenshots.

## Milestones
1. Movement, swing, rooms, Watering Spots, the first guardian — done.
2. All areas, abilities, gating, map, Peddler, charms, saves — done. 68 rooms; the reach bot (real physics) reaches every room
   (68/68), every item (22/22), every ability and guardian, the ending, and finds no softlocks.
3. All guardians + ending — done: the Thorn Knot (Leaf Dash), the Old Boiler (Vine Grip), the Grey Cloud (Puff Jump), the Gloom
   Heart (3 phases) and the ending. Glow and Sunbeam come from shrines. Every attack is telegraphed (46+ ticks, bold warnings).
4. Local co-op, online co-op, touch, gamepad, room wrapper — done and reviewed twice (clean WebRTC, a lossy relay, a harsh relay).
5. Polish — done: art, render, audio; two independent review rounds (playtest, art/content, online, engineering) and their fixes.

## Controls
One player: arrows + Z jump, X swing, C dash, A focus (hold) / Up + A Sunbeam — or WASD + J, K, L, I. Up at a Watering Spot:
rest; Up by the Peddler: talk; Tab or M: map; Esc: pause; N: music. On the title (and in the pause menu) M toggles all sound.
Two on one keyboard: SPRIG = WASD + F jump, G swing, H dash, T focus; MARIGOLD = arrows + J, K, L, I.
Gamepad: A jump, X swing, RB/RT dash, B focus, Y Sunbeam, Back map, Start pause. Touch: left stick, JUMP/SWING/DASH/FOCUS, MAP, II.
Signs and ability cards name the controls you are actually using (keys, pad or touch).

## Tests
- `node docs/rootlight/tools/check.js` · `node docs/rootlight/tools/simtest.js` (29) · `node docs/rootlight/tools/fixcheck.js` (9)
  · `node docs/rootlight/tools/reach.js` (about 15 min)
- Browser (headless Chrome, scratch harness): the title→slots→new game→story→play→Peddler→shop→rest→map flow, all rooms, the
  guardians, online pairs through the real wrapper (rtc / relay 150 ms 10% loss / 300 ms 25% loss), the wrapper's solo menu and
  buttons, simulated gamepads, touch in portrait and landscape.

## Known issues / notes
- M opens the map during play (the brief lists both "Tab or M map" and "M toggles all sound"): on the title and in the pause
  menu M toggles sound; N toggles music everywhere.
- Crumbling ledges crumble on each online screen separately (harmless).
- Falling straight from the Mushroom Ring onto the glowcap in Deep Glimmer bounces you back up; steer off it.
- Not measured on real phones (headless Chrome with throttling only); upright phones show a "turn sideways" tip.
