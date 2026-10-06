# ROOTLIGHT — interface between the files (authoritative)

An original exploration platformer for understand-veganism.com's planet arcade, in the Berry Breeze / Vine Line / Sprout Kart
family. Classic scripts, no build step, no external assets, no npm. Everything drawn and synthesised in code.
All files live in `public/rootlight/`; everything hangs off `window.RL`.

## Content rules (strict, every file)
- Original only. Nothing from any existing game (names, characters, places, art, music, sounds, text, designs).
- NO animals anywhere: no bugs, insects, birds, fish, creatures of any kind. **Glooms and guardians have NO faces and NO eyes**
  (not even "creature-like faces on objects"): they read as grumpy through shape, colour (grey, sooty), droop, scribbly
  smog swirls, sparks and posture only. Player characters (SPRIG the sprout, MARIGOLD the marigold) and the PEDDLER (a kindly
  scarecrow gardener) are the only things with faces. Flowers have no faces.
- Nothing violent. You never hurt anyone: the staff swing "blooms" gloomy things back into flowers; guardians are "calmed".
  Getting touched "takes a leaf"; at zero leaves you "nod off". Words to use: bloom, calm, tangle, gloom, nod off, wake up.
- Kind tone. Never the words "go vegan". No blood, no death words ("die", "kill", "dead"), no weapons talk.

## Load order (index.html, each `?v=1`)
`world.js` → `sim.js` → `art.js` → `render.js` → `audio.js` → `net.js` → `main.js`
Every module checks for the others (`RL.Audio || {}` etc.) and must never throw at load if a later one is missing.

| file | owner | what |
|---|---|---|
| world.js | lead | RL.World: format docs, areas, charms, shop, abilities, all rooms (merged from docs/rootlight/rooms/*.js by tools/build-world.js) |
| sim.js | lead | RL.Sim (deterministic 60 Hz game rules), RL.C constants, RL.IN input bits, saves |
| art.js | art builder | RL.Art: every *thing* (characters, glooms, guardians, pickups, props, icons) |
| render.js | render builder | RL.Render: terrain, backgrounds, light, colour, particles, camera view, HUD, every screen, touch pad, text |
| audio.js | audio builder | RL.Audio: synthesised music and sound effects |
| net.js | net builder | RL.Net: online co-op over the parent page |
| main.js | lead | loop, layout, input, screens flow, saves, parent protocol, window.__rl |

## Units and the view
- Fixed 60 Hz ticks. TILE = 20 logical px. The view is a fixed 640 x 360 logical window (32 x 18 tiles), letterboxed and scaled
  up (render scale R = canvas px per logical px, 1..4 by DPR). A phone held upright gets a control band below the view.
- Positions are room-local logical px (room top-left = 0,0). Rooms are multiples of a CELL = 16 x 9 tiles (320 x 180 px);
  the smallest room is one screen (2 x 2 cells).
- RL.C: `{ TILE:20, VW:640, VH:360, CW:16, CH:9 }`.

## Player physics (for level design; sim.js is the truth)
Hitbox 14 wide, 26 tall (feet at y). Fits through a 1-tile-wide shaft and a 2-tile-tall tunnel.
- Run 2.7 px/tick. Jump: max height about 3.3 tiles (a ledge 3 tiles above the floor is reachable), short hop when released early.
- Across a level gap: up to 4 tiles of air is a safe jump; 5+ needs Leaf Dash.
- **Leaf Dash** (from the Thorn Knot): 5 tiles horizontal burst, once per air time. Jump + dash clears about 8 tiles.
- **Vine Grip** (from the Old Boiler): cling to walls and slide slowly, wall-jump; climb any wall (even one wall alone).
- **Puff Jump** (from the Grey Cloud): a second jump in the air, about 2.5 tiles more (a ledge 5 tiles up is reachable).
- **Glow** (Glow Shrine): light in dark rooms; shadow briars `|` shrink away while you are near.
- **Sunbeam** (Sunbeam Shrine): Up + tap Focus fires a ray of light forward: blooms glooms at range, flips sun switches `y`.
- Down-swing in the air on anything swingable (glooms, thorns `x`, glowcaps, buds, clusters) bounces you up ~2.5 tiles.
- Glowcap `o`: landing on one bounces you about 6 tiles up.
- Steam vent `v` (when puffing) lifts you up its column to the ceiling.

Level design rules: no softlocks (every room you can get into must let you get out with the abilities you can have at that
point); ability gates must be unmistakable (a gap clearly too wide, a smooth tall wall, briars, a sun switch out of reach);
one secret per area behind a breakable root wall `%` that looks a little different (the art draws cracks).

## World data format (world.js) — what the room designers write
```
ROOM({ id:'mh_1', area:'mossy', name:'Mossy Steps', cx:12, cy:0, cw:4, ch:2,   // world cell rect (from tools/plan.js)
  map:[ ...ch*9 strings of exactly cw*16 chars... ],
  dark:0,                       // 1: a dark room (needs Glow to see far)
  signs:['text', ...],          // for each `i`, in reading order (top to bottom, then left to right)
  charms:['long'],              // for each `C`
  ability:'glow',               // for `A`
  gates:['lever','calm'],       // kind of each gate (a gate = a connected run of `g`), in reading order of its first cell
  plats:[[dx,dy,period]],       // for each moving platform (a horizontal run of `m`): travel in tiles, ticks per round trip
  wind:[[x,y,w,h,dx,dy,gust]],  // tiles; force px/tick (about 0.3..1.2); gust 1 = pulses on/off
  guardian:'knot'               // with a `G` anchor
});
```
Terrain letters: `.` air · `#` earth (the area's ground) · `R` root wood · `K` hard stone (rock / metal / crystal / cloud-stone by
area) · `=` one-way ledge (Down+Jump drops through) · `-` crumbling ledge · `x` thorns (not solid; hurts and puts you back
on safe ground) · `~` water · `<` `>` water with a current · `%` breakable root wall (3 swings, remembered) · `|` shadow briar ·
`g` gate cell.

Entity letters (the cell itself is air): `@` player start (Seedfall only) · `W` Watering Spot · `P` Peddler · `i` sign ·
`s` smog puff · `t` thornling · `d` drip-gloom (under a ceiling) · `c` rust-cog · `l` spore lantern (floor or ceiling) ·
`k` gloom knight · `*` dew cluster · `b` flower bud · `o` glowcap · `v` steam vent · `m` moving platform cell · `L` life seed ·
`V` sun vessel · `N` charm notch · `C` charm · `A` ability shrine · `h` lever · `y` sun switch · `G` guardian anchor.
Floor things (`W P i t c k o v b l *`) sit on the tile below; place them in the air cell just above a solid tile.

Gate kinds: `lever` (opened by the k-th lever `h` of the room, remembered), `sun` (opened by the k-th sun switch `y`, hit by
Sunbeam), `seal` (opens when all three guardians are calmed), `arena` (open, shuts while the room's guardian is awake, opens when
calmed), `calm` (shut until the room's guardian is calmed).

Rooms connect where their maps have air on the shared edge (tools/plan.js cuts the doorways; tools/check.js verifies both sides
match). Walking off an edge into a doorway moves you to the neighbouring room at the same world position.

## Sim (sim.js) — the state other files read
```
RL.IN = { L:1, R:2, U:4, D:8, JUMP:16, SWING:32, DASH:64, FOCUS:128 }   // held bits; the sim finds the presses itself
const sim = new RL.Sim({ save, players:1|2, gentle, role:'solo'|'host'|'guest' });
sim.step([mask0, mask1])      // one 60 Hz tick
sim.t                          // ticks since the sim was made
sim.events                     // this tick's events: arrays [name, ...args] (list below)
sim.room                       // the current room (runtime, below)
sim.players                    // [P, P?]
sim.save                       // progression (below), shared by both players
sim.freeze                     // true while main shows a menu over the game
```
Player P: `{ i, who:'sprig'|'marigold', x, y (feet centre), vx, vy, face:1|-1, ground, st, at, swing, leaves, maxLeaves, sun,
sunMax, inv, focus, dashT, puffT, wall, glow, bubble, hurtT, faintT, sitT, swim, alive }`
- `st`: 'idle' 'run' 'jump' 'fall' 'cling' 'dash' 'focus' 'hurt' 'faint' 'bubble' 'sit' 'swim' 'enter' ; `at` = ticks in st.
- `swing`: null or `{ dir:'f'|'u'|'d', t (0..13), reach (px) }` — the arc shows for t 0..8.
- `inv` i-frame ticks left (blink); `focus` 0..1 charge; `dashT` ticks into a dash; `puffT` ticks since a Puff Jump;
  `wall` -1/0/1 clinging side; `glow` has Glow; `bubble` (co-op) floating seed bubble while fainted; `swim` in water.

Room (runtime) `sim.room`:
```
{ id, def, area, name, w, h (tiles), pw, ph (px), dark, colour (0..1: how bloomed the room is),
  tile(tx,ty) -> code   // RL.T codes: 0 air 1 earth 2 root 3 stone 4 oneway 5 crumble 6 thorns 7 water 8 curL 9 curR 10 breakable 11 briar 12 gate
  crumble: Map tileIndex -> ticks (crumbling / gone / regrowing), briar: Float32Array per tile (0 closed .. 1 shrunk away),
  foes:[F], shots:[S], drops:[D], items:[I], flowers:[Fl], buds:[B], gates:[Gt], levers:[Lv], switches:[Sw], breaks:[Br],
  spots:[Sp], npcs:[N], signs:[Sg], plats:[Pl], vents:[Vt], caps:[Cp], hazards:[Hz], wind:[Wd], guard: Gd|null }
```
- Foe F (glooms): `{ id, kind, x, y (centre), vx, vy, face, hp, maxHp, st, t, hurt (flash ticks), ceil, alive }`
  - smog (r 12): st 'drift' | 'push'.  thorn (r 11, rolls): 'roll' | 'rush' | 'push' (spin angle = x / 11).
  - drip (r 10): 'hang' | 'shake' (tell) | 'fall' | 'ooze' (on the floor, sliding) | 'push'.
  - cog (26 x 22, wind-up toy machine with a key): 'walk' | 'wind' (tell: key spins fast, shakes) | 'charge' | 'dizzy' | 'push'.
  - lantern (18 x 24, a plant pod, `ceil` hangs down): 'idle' | 'glow' (tell) | 'puff'.
  - knight (22 x 34, hollow garden armour with a shield, no face): 'walk' | 'block' (swing hit the shield) | 'ready' (tell) |
    'shove' | 'rest' (shield lowered).
- Shot S: `{ kind:'spore'|'burr'|'bolt'|'drop'|'orb'|'beam'|'petal', x, y, vx, vy, r, t, life, own }` (beam = player's Sunbeam).
- Drop D (dew drop): `{ x, y, vx, vy, t, v }`.  Item I: `{ kind:'life'|'vessel'|'notch'|'charm'|'ability'|'cluster'|'puddle',
  id, x, y, hp (cluster), v (puddle dew), got }`.
- Flower Fl: `{ x, y, kind (0..6), ceil, t (age), seed }` — what a bloomed gloom or bud leaves (stays forever).
  kind 0 bluebell (smog) 1 wild rose (thorn) 2 water lily (drip) 3 sunflower (cog) 4 tulip (lantern) 5 hollyhock (knight) 6 daisy (bud).
- Bud B: `{ x, y, ceil, open, t }`.
- Gate Gt: `{ kind, x, y, w, h (px), shut (bool), o (0 shut..1 open, animated), vert }`. Lever Lv `{ x, y, on, t }`.
  Switch Sw `{ x, y, on, t }`. Breakable Br `{ x, y, w, h (px), hp, hurt }` (gone when broken).
- Spot Sp `{ x, y, lit }` (Watering Spot; lit = it is your respawn). N `{ kind:'peddler', x, y, talk (0..1) }`.
  Sign Sg `{ x, y, text }`. Platform Pl `{ x, y, w, h, vx, vy }`. Vent Vt `{ x, y, h (column px), on, tell, t }`.
  Cap Cp `{ x, y, squash (0..1) }`. Wind Wd `{ x, y, w, h (px), dx, dy, on (0..1) }`.
- Hazard Hz (guardian attacks shown on the ground or in the air): `{ kind:'spike'|'zap'|'steam'|'slam'|'rain'|'vine'|'shock',
  x, y, w, h, t, tell (ticks of warning left: > 0 = warning only, harmless), live (hurts now) }`.
- Guardian Gd: `{ kind:'knot'|'boiler'|'cloud'|'heart', x, y, w, h, hp, maxHp, phase (1..3), st, t, face, hurt, calm (0..1
  once calming), awake }` plus per kind:
  - knot (a huge bramble tangle ball, r 40): st 'sleep' 'wake' 'idle' 'hopTell' 'hop' 'land' 'lashTell' 'lash' 'burrTell'
    'burr' 'tired' 'calm'; `squash` (0..1), `spin`.
  - boiler (a clockwork boiler ~120 x 110 on stubby legs, chimney, gauge, valves, a furnace door): 'sleep' 'wake' 'idle'
    'walk' 'ventTell' 'vent' 'boltTell' 'bolt' 'slamTell' 'slam' 'tired' 'calm'; `heat` (0..1 gauge), `door` (0..1 open).
  - cloud (a storm cloud ~150 x 70): 'sleep' 'wake' 'drift' 'rainTell' 'rain' 'zapTell' 'zap' 'gustTell' 'gust' 'tired'
    'calm'; `dark` (0..1), `dir`.
  - heart (a great grey seed wrapped in thorns and smog, r 56): 'sleep' 'wake' 'idle' 'sweepTell' 'sweep' 'orbTell' 'orb'
    'summon' 'dropTell' 'drop' 'tired' 'calm'; `phase` 1..3, `glow` (0..1 the golden light inside as it calms).
  Tells (`...Tell`) last 30-60 ticks and must be clearly readable (wind-up pose, glow, shake, a sound).

Save (progression, JSON-safe; shared by both players):
```
{ v:1, slot, gentle, time (ticks played), room, spot:{room, x, y}, dew, puddle:{room,x,y,v}|null,
  ab:{dash,grip,puff,glow,beam}, life (seeds found 0..6), vessels, notches, leafSlots, maxLeaves, sunMax,
  charms:{id:1 owned}, worn:[ids], maps:{area:1}, visited:{room:1}, seen:{area:1},
  got:{itemKey:1}, bloom:{room:[foe ids]}, buds:{room:[bud ids]}, open:{gateKey:1}, broke:{breakKey:1},
  calm:{knot,boiler,cloud,heart}, shop:{id:1}, talked:{}, done }
```

Events (`sim.events`, `[name, ...]`): `jump p` `land p v` `swing p dir` `hit kind x y` (a swing touched a gloom / thing)
`block x y` (knight shield) `bloom kind x y` `bud x y` `hurt p` `thorn p` `faint p` `wake p` `revive p` `heal p` `focus p on`
`dash p` `cling p` `walljump p` `puff p` `beam p` `bounce p kind` (pogo / glowcap) `dew v x y` `pickup kind id` `crack x y`
`break x y` `lever x y` `switch x y` `gate kind x y open` `splash x y` `vent x y` `crumble x y` `spore x y` `charge x y`
`gtell kind st` `gstart kind` `ghit kind x y` `gphase kind n` `calm kind` `room id` `area id` `rest p` `talk` `sign text`
`get kind id` (ability / charm / life / vessel / notch shown big) `ending`.

## Art (art.js) — RL.Art, drawn in logical px with the camera already applied
House style: thick dark-plum ink outlines (#2b2140), two-tone shading with a glossy highlight, soft pastel colours, rounded
cartoon shapes; moodier underground. Bake sprites into offscreen canvases at scale R where it helps (see breeze/art.js `sprite`).
```
RL.Art.init(R, low)
RL.Art.player(ctx, P, t)          // SPRIG (green sprout, two leaves on top, dandelion staff) / MARIGOLD (orange marigold bloom head)
                                   // every st, the swing arc (dir f/u/d, reach), i-frame blink, focus glow, dash trail, cling,
                                   // puff, bubble (a seed bubble), faint (curled up asleep, Zzz), sit (resting at a spot)
RL.Art.foe(ctx, F, t)             // the six glooms in every st; `hurt` flash white; NO faces
RL.Art.guardian(ctx, Gd, t)       // the four guardians, every st, calm transformation (calm 0..1: knot -> rose bush,
                                   // boiler -> cool, flowers from the pipes, cloud -> white with a rainbow, heart -> golden Heartseed)
RL.Art.hazard(ctx, Hz, t)         // warnings (tell > 0: ground cracks / glow outline / dotted column) and live attacks
RL.Art.shot(ctx, S, t)  RL.Art.drop(ctx, D, t)  RL.Art.item(ctx, I, t)  RL.Art.flower(ctx, Fl, t)  RL.Art.bud(ctx, B, t)
RL.Art.gate(ctx, Gt, t, area)  RL.Art.lever(ctx, Lv, t)  RL.Art.switch(ctx, Sw, t)  RL.Art.spot(ctx, Sp, t)
RL.Art.npc(ctx, N, t)  RL.Art.sign(ctx, Sg, t)  RL.Art.plat(ctx, Pl, t, area)  RL.Art.vent(ctx, Vt, t)  RL.Art.cap(ctx, Cp, t)
RL.Art.icon(ctx, name, x, y, size, t)   // 'leaf' 'leafEmpty' 'leafBark' 'sun' 'dew' 'life' 'lifeHalf' 'vessel' 'notch'
                                   // 'notchFull' 'map' 'compass' 'spot' 'peddler' 'puddle' 'guardian' 'lock'
                                   // 'charm:<id>' 'ability:<id>' 'key:<label>' (a keycap with a label)
RL.Art.portrait(ctx, who, x, y, size, t, mood)   // big SPRIG / MARIGOLD / PEDDLER for the title, dialogs and the ending
```

## Render (render.js) — RL.Render
```
RL.Render.init(R, low)                  // render scale; low = phone / weak machine (fewer particles, no blur)
RL.Render.room(sim)                     // called when sim.room changes: (re)bake terrain chunks and backgrounds
RL.Render.tick(sim)                     // once per sim tick: particles, light flicker, camera springs
RL.Render.fx(sim, ev)                   // once per sim event: petals on bloom, dust on land, splashes, leaf flutter on hurt...
RL.Render.frame(ctx, F)                 // the world view 640 x 360: F = { sim, cam:{x,y}, t, fade (0..1 to black), shake (px), flash }
RL.Render.hud(ctx, H)                   // H = { sim, t, touch, two (two players), msg, prompt:{text,x,y}|null (e.g. '↑ Rest' in world px) }
RL.Render.screen(ctx, name, S)          // menus and overlays (below), drawn over the frame in 640 x 360
RL.Render.text(ctx, s, x, y, size, fill, align) -> width   // sticker text, cached
RL.Render.UI                            // hit rects filled while drawing screens: { rows:[{x,y,w,h}], chips:[...], back }
```
Room colour: draw the backgrounds, terrain and glooms, then fade the colour out by `1 - room.colour` (for example a 'saturation'
blend fill of grey), then draw flowers, buds, players, pickups, light and particles in full colour on top: a grey room fills
with colour as you bloom it. Dark rooms: a light map (players: radius 44 without Glow, 140 with; glowcaps, crystals, lanterns,
spots, items, petals, beams glow).

Screens and their S:
- 'title' `{ t, sel, rows:[{label, sub}], sound, music, touch, keys:[[who,line]...], note }` big logo ROOTLIGHT, Sprig on a root.
- 'slots' `{ t, sel, rows:[{empty, name (area name), pct, time, leaves, maxLeaves, dew, gentle, ab:{...}}], erase }`
- 'newgame' `{ t, sel }` Normal / Gentle (more leaves, slower guardians), with a one-line explanation each.
- 'story' `{ t, page }` the opening: 3 storybook pages (the Great Garden goes grey; SPRIG picks up a dandelion staff; down into the roots).
- 'pause' `{ t, sel, rows:[labels], gentle }`
- 'map' `{ t, rooms:[{id, x, y, w, h (world tiles), area, here, doors:[{side,at,len}], spot, peddler, guard, calm}], areas, me:[{x,y}] (world tiles) | null, puddle, area }`
- 'charms' `{ t, sel, list:[{id, name, desc, cost, owned, worn}], notches, used, edit (at a Watering Spot) }`
- 'shop' `{ t, sel, list:[{id, name, desc, price, sold, kind}], dew, line }`
- 'dialog' `{ t, who ('peddler'|'sign'|'heart'), name, text, more }`
- 'get' `{ t, kind, id, title, text, keys }` an ability / item shown big.
- 'area' `{ t, name, sub }` the area title card on first entry (over the play view, fades).
- 'faint' `{ t }` nodding off, 'ending' `{ t, stats:{time, pct, life, charms} }`, 'msg' `{ text }`.
- 'touch' `{ L:{stick:{x,y,r}, knob:{x,y}}, btn:[{id,label,x,y,r,down}], band:{y,h}|null }` the touch pad (main lays it out).

## Audio (audio.js) — RL.Audio
```
RL.Audio.unlock()   RL.Audio.mute(on)   RL.Audio.musicOn(on)   RL.Audio.hidden(on)
RL.Audio.music(name | null, v)     // names: 'title' 'rootgate' 'mossy' 'glowcap' 'pipes' 'crystal' 'cloud' 'heart' 'guardian'
                                   // 'final' 'calm' 'ending' 'shop'; v 0..1 intensity (a guardian's later phase)
RL.Audio.play(name, arg)           // one-shots, see SFX list
```
SFX: 'step' 'jump' 'land' 'swing' 'hit' 'bloom' 'bud' 'hurt' 'thorn' 'faint' 'wake' 'revive' 'heal' 'focus' (arg true start /
false stop: a rising hum) 'dash' 'cling' 'walljump' 'puff' 'beam' 'bounce' 'pogo' 'dew' 'dewBig' 'pickup' 'life' 'vessel'
'charm' 'ability' 'notch' 'save' 'door' 'gate' 'lever' 'switch' 'crack' 'break' 'splash' 'vent' 'crumble' 'spore' 'clang'
'charge' 'wind' 'rain' 'zap' 'slam' 'rumble' 'gtell' 'ghit' 'calm' 'bubble' 'shop' 'buy' 'nope' 'menu' 'select' 'back' 'map' 'talk'.
With `?mute=1` it never makes an AudioContext and never touches storage.

## Net (net.js) — RL.Net (milestone 4; see the section added then)

## Debug: window.__rl
`state` (screen, room, players, save summary, fps, errors), `manual(on)`, `step(n)`, `render()`, `key(code, down)`,
`warp(room, x?, y?)`, `give(ability|'all')`, `bot(on)`, `sim`, `start(slot, opts)`.
