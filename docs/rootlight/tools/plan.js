/* ROOTLIGHT world plan: every room's place on the world grid, every doorway between rooms, and what each room is for.
   node plan.js            prints the overview map and checks the plan
   node plan.js --skel     writes docs/rootlight/rooms/<area>.js skeletons (border walls with the doorways cut) for rooms not yet there
   Units: a CELL is 16 x 9 tiles (half a screen each way); a room is cw x ch cells; one screen = 2 x 2 cells = 32 x 18 tiles.
   A LINK is [roomA, roomB, at, len]: the two rooms share an edge; `at` is the WORLD tile coordinate where the doorway starts
   along that edge (y for a left/right edge, x for a top/bottom edge) and `len` its size in tiles. */
'use strict';
const fs = require('fs'), path = require('path');
const CW = 16, CH = 9;
/* [id, area, name, cx, cy, cw, ch, brief] */
const ROOMS = [
  /* ---------------- ROOTGATE: the hub ---------------- */
  ['rg_fall', 'rootgate', 'Seedfall', 22, -4, 2, 4, 'START. Sprig drops in from the grey garden above (a closed sky-hole at the top: the top row stays solid except a decorative gap is NOT allowed; put the player start @ high up on a mossy ledge). A gentle descent: soft moss ledges zig-zag down to the doorway at the bottom. 2-3 flower buds b to teach swinging, one sign i ("X / K: swing your staff"). No glooms.'],
  ['rg_hub', 'rootgate', 'Rootgate', 20, 0, 6, 2, 'THE HUB. Watering Spot W near the middle, the Peddler P on a little stall to the right of it, 2 signs (controls: jump with Z/J, hold A or I near a Watering Spot? no: "Press UP at a Watering Spot to rest and save"). Big calm hall, wide floor. Doorways: W (to West Burrow), E (to the Long Gap), a hole in the floor near the east end down to the Seal Door Hall (put a one-tile lip so you do not fall in by accident), and a shaft in the ceiling at the west end up to the Old Well (needs Vine Grip later: the shaft above is smooth). The hole down from Seedfall arrives from the top middle: give a soft landing.'],
  ['rg_west', 'rootgate', 'West Burrow', 16, 0, 4, 2, 'A short root tunnel west to the Mossy Hollows. 2 smog puffs s (the first glooms: easy), a dew cluster *. A sign: "Swing at glooms to bloom them back into flowers".'],
  ['rg_gap', 'rootgate', 'The Long Gap', 26, 0, 4, 2, 'DASH GATE. An 8-tile chasm (the doorway in the floor) splits the room; no ceiling to climb along. The far side leads E to Clatter Pipes. A sign at the edge: "Too far to jump... maybe a dash?". Falling in drops harmlessly into Under the Gap.'],
  ['rg_door', 'rootgate', 'Seal Door Hall', 20, 2, 6, 2, 'Below the hub. The great Heartseed door: a 4-wide SEAL gate (kind seal) in the floor (the S doorway) with 3 seal sockets drawn around it (the game draws them). Platforms lead up through the N hole back into the hub. E doorway to Under the Gap. W doorway to the Root Stair: from this side it is a closed LEVER gate (the lever is on the stair side). A sign: "Three guardians hold the seals. Calm them all."'],
  ['rg_under', 'rootgate', 'Under the Gap', 26, 2, 4, 2, 'Where you land if you fall into the Long Gap (the N doorway is the 8-wide pit: soft landing). W doorway to the Seal Door Hall. A hatch in the floor (S doorway) to the Crystal Spring: a LEVER gate whose lever is BELOW in Lever Tunnel (cs_10), so from here it stays shut until opened from the far side. 2 thornlings t.'],
  ['rg_well', 'rootgate', 'The Old Well', 20, -6, 2, 6, 'GRIP + SUNBEAM GATE. A tall smooth shaft up from the hub to the Cloud Roots. Only climbable with Vine Grip (walls 5+ tiles with no ledges). Near the top a SUN gate (kind sun) blocks the way; its sun switch y sits behind a gap in the wall where only a Sunbeam can reach. Halfway up, a breakable root wall % on the W side hides the Root Nook (W doorway).'],
  ['rg_stair', 'rootgate', 'Root Stair', 18, 2, 2, 4, 'SHORTCUT. Climb from the Glow Shrine (S doorway, below) up a stair of root platforms (no abilities needed going up) to a LEVER gate at the E doorway into the Seal Door Hall; the lever h is on this side next to the gate.'],
  ['rg_nook', 'rootgate', 'Root Nook', 18, -2, 2, 2, 'SECRET. Behind the breakable wall in the Old Well (E doorway). A cosy nook with a LIFE SEED L and a dew cluster *.'],

  /* ---------------- MOSSY HOLLOWS: the first area (smog puffs, thornlings, drip-glooms) ---------------- */
  ['mh_1', 'mossy', 'Mossy Steps', 12, 0, 4, 2, 'Entrance. Gentle steps and one-way moss ledges =. E doorway to West Burrow, W to Fernway, a hole in the floor (S) to Drip Hollow. 2 smog puffs, 1 thornling, buds.'],
  ['mh_2', 'mossy', 'Fernway', 8, 0, 4, 2, 'A ferny corridor with small pits of thorns x (jumpable, 2-3 wide). E to Mossy Steps, W to Bramble Run, ceiling hole (N) up to Mossy Heights reached by a short climb of ledges. 2 thornlings, 1 drip-gloom d, buds.'],
  ['mh_4', 'mossy', 'Bramble Run', 2, 0, 6, 2, 'A long run (3 screens) with thorn pits and rolling thornlings; moss ledges above the pits. E to Fernway, a hole in the ceiling at the W end (N) from Rolling Ridge (a drop down, also climbable back up via ledges), and at the W wall a breakable root wall % (W doorway) to the Hidden Glade. 3 thornlings, 2 smog puffs, 2 dew clusters.'],
  ['mh_8', 'mossy', 'Hidden Glade', 0, 0, 2, 2, 'SECRET charm room: a sunny glade with the LONG STEM charm C on a little mossy plinth. Lots of buds. E doorway (the breakable wall is on the Bramble Run side).'],
  ['mh_6', 'mossy', 'Mossy Heights', 8, -2, 4, 2, 'Upper hollows. S doorway (hole) down to Fernway, W doorway to Rolling Ridge. Drip-glooms hanging under ledges, a smog puff. A dew cluster on a high ledge.'],
  ['mh_7', 'mossy', 'Rolling Ridge', 2, -2, 6, 2, 'A long ridge with slopes made of stepped ledges and thornlings rolling down them; E to Mossy Heights, S hole (at its W end) down into Bramble Run, W doorway to Mossy Crown high up on the W wall (a ledge 5 tiles up: needs Puff Jump, come back later).'],
  ['mh_12', 'mossy', 'Mossy Crown', 0, -2, 2, 2, 'BACKTRACK reward (Puff Jump). A SUN VESSEL V on a high perch. E doorway.'],
  ['mh_3', 'mossy', 'Drip Hollow', 12, 2, 2, 4, 'A tall shaft down from Mossy Steps (N hole) with drip-glooms under every ledge; one-way moss ledges let you climb back up. W doorway near the bottom to the Watering Nook. On the E wall near the top a breakable wall % (E doorway) to the Mossy Pocket.'],
  ['mh_life', 'mossy', 'Mossy Pocket', 14, 2, 2, 2, 'SECRET: a LIFE SEED L. W doorway (breakable wall on the Drip Hollow side, near its top).'],
  ['mh_5', 'mossy', 'Watering Nook', 10, 4, 2, 2, 'A safe little room with a Watering Spot W. E to Drip Hollow, W to Knot Gate. A sign: "Rest at Watering Spots: your leaves grow back and your garden is saved."'],
  ['mh_9', 'mossy', 'Knot Gate', 6, 4, 4, 2, 'The way to the first guardian: brambles thicken, thorn pits, 2 thornlings and a smog puff. E to the Watering Nook, W into the Tangle. A sign: "Something big is tangled up ahead. Hold A (or I) to focus your Sunlight and grow a leaf back."'],
  ['mh_10', 'mossy', 'The Tangle', 2, 4, 4, 2, 'GUARDIAN ARENA: THE THORN KNOT (G anchor in the middle of the floor, guardian knot). A flat floor 2 screens wide with two low one-way ledges at each side (3 tiles up). The E doorway is an ARENA gate. A 4-wide CALM gate in the floor (S doorway, left of centre) opens down to the Glowcap Caves once the knot is calmed.'],

  /* ---------------- GLOWCAP CAVES: dim caves of glowing mushrooms; the deep part is dark (drip-glooms, spore lanterns) ---------------- */
  ['gc_1', 'glowcap', 'Glowcap Drop', 2, 6, 4, 2, 'You drop in from the Tangle (N doorway). A soft landing on a big glowcap o. Glowing mushrooms light the way E. A sign: "Glowcaps bounce you high. Land on them!". You cannot climb back up the hole (the way home is the Root Stair, east).'],
  ['gc_2', 'glowcap', 'Bounce Hall', 6, 6, 4, 2, 'Glowcaps over thorn pits; a 6-tile gap that needs Leaf Dash (you have it by now). W to Glowcap Drop, E to Shimmer Steps. 2 spore lanterns l, a drip-gloom.'],
  ['gc_3', 'glowcap', 'Shimmer Steps', 10, 6, 2, 4, 'A tall cave: the upper part links W (Bounce Hall) and E (Watering Grotto); the lower part has an E doorway to the Mushroom Ring and a hole in the floor (S) down into the dark Dark Hollow. Platforms make it climbable both ways without abilities.'],
  ['gc_4', 'glowcap', 'Watering Grotto', 12, 6, 2, 2, 'Watering Spot W in a glowing grotto. W to Shimmer Steps, E to Lantern Walk.'],
  ['gc_5', 'glowcap', 'Lantern Walk', 14, 6, 4, 2, 'Spore lanterns on floor and ceiling, glowcap bounces, smog puffs. W to the Grotto, E to the Glow Shrine.'],
  ['gc_7', 'glowcap', 'Glow Shrine', 18, 6, 2, 2, 'ABILITY: the GLOW seed A (ability glow) on a shrine. W doorway to Lantern Walk; a shaft up (N doorway) into the Root Stair (the way home). Make the shrine feel special.'],
  ['gc_10', 'glowcap', 'Mushroom Ring', 12, 8, 4, 2, 'Charm room: a ring of glowcaps around the GENTLE FOCUS charm C, reached through shadow briars | (needs Glow). W doorway to Shimmer Steps (lower), a hole in the floor (S) down to Deep Glimmer.'],
  ['gc_6', 'glowcap', 'Dark Hollow', 8, 10, 4, 2, 'DARK room. You drop in from Shimmer Steps (N doorway; ledges let you climb back). Shadow briars | block both the W and E ways (needs Glow). Drip-glooms, thornlings.'],
  ['gc_8', 'glowcap', 'Briar Maze', 2, 10, 6, 2, 'DARK room: a maze of shadow briars and thorns; spore lanterns. E to Dark Hollow, W to the Glimmer Seed room.'],
  ['gc_9', 'glowcap', 'Glimmer Seed', 0, 10, 2, 2, 'DARK. A LIFE SEED L at the end of the maze. E doorway.'],
  ['gc_11', 'glowcap', 'Deep Glimmer', 12, 10, 4, 2, 'DARK. Glowcap bounces up to a SUN VESSEL V. W to Dark Hollow, a hole in the ceiling (N) up to the Mushroom Ring (a glowcap under it bounces you up).'],

  /* ---------------- CLATTER PIPES: old machines, steam vents, moving pistons (rust-cogs, smog, thornlings) ---------------- */
  ['cp_1', 'pipes', 'Pipe Mouth', 30, 0, 4, 2, 'Entrance from the Long Gap (W). Rusty pipes, a rust-cog c. E doorway to the Steam Lift. A hole in the ceiling (N) to the Rusty Attic (needs Vine Grip: a smooth wall up), a hole in the floor (S) down to the Bolt Cellar.'],
  ['cp_11', 'pipes', 'Rusty Attic', 30, -2, 4, 2, 'BACKTRACK (Vine Grip): a LIFE SEED L among old gears. S doorway.'],
  ['cp_12', 'pipes', 'Bolt Cellar', 32, 2, 2, 2, 'A small cellar (N doorway) with the BOUNCY BUD charm C and a dew cluster; 2 rust-cogs.'],
  ['cp_2', 'pipes', 'Steam Lift', 34, -2, 2, 4, 'A tall shaft with steam vents v that lift you up (rest on the column, it carries you). W doorway (lower) from Pipe Mouth, E doorway (upper) to Cog Walk, E doorway (lower) from the Old Boiler arena: a CALM gate on the arena side (shortcut once the boiler is calmed).'],
  ['cp_3', 'pipes', 'Cog Walk', 36, -2, 4, 2, 'Rust-cogs charging along long floors; pipes to hop over. W from Steam Lift, E to Watering Works.'],
  ['cp_4', 'pipes', 'Watering Works', 40, -2, 2, 2, 'Watering Spot W among the pipes. W to Cog Walk, E to Piston Hall.'],
  ['cp_5', 'pipes', 'Piston Hall', 42, -2, 4, 2, 'Moving piston platforms m over a thorn floor; steam vents. W to Watering Works, a hole in the floor at the E end (S) down to the Valve Room.'],
  ['cp_6', 'pipes', 'Valve Room', 42, 0, 2, 2, 'You arrive from above (N doorway; a vent or ledges lets you go back up). W to the Boiler Gate, E to the Clockwork Nook. 2 rust-cogs.'],
  ['cp_9', 'pipes', 'Clockwork Nook', 44, 0, 2, 2, 'Charm room: QUICK BREEZE charm C on a high shelf reached by a vent. W doorway.'],
  ['cp_7', 'pipes', 'Boiler Gate', 40, 0, 2, 2, 'A hot corridor before the guardian: vents and a smog puff. E to the Valve Room, W into the Old Boiler arena. A sign: "It is very hot in here. Something is boiling over."'],
  ['cp_8', 'pipes', 'The Old Boiler', 36, 0, 4, 2, 'GUARDIAN ARENA: THE OLD BOILER (G anchor at the back middle, guardian boiler). Flat floor, two pipe ledges = 4 tiles up at the sides. E doorway = ARENA gate. W doorway = CALM gate (shortcut to the Steam Lift). A 4-wide CALM gate in the floor (S doorway) opens down into the Crystal Spring.'],

  /* ---------------- CRYSTAL SPRING: water pools, currents, crystals (gloom knights, drip-glooms, spore lanterns) ---------------- */
  ['cs_1', 'crystal', 'Crystal Mouth', 36, 2, 4, 2, 'You drop in from the Old Boiler (N doorway). A smooth wall lets you climb back with Vine Grip. Shadow briars | block the way on (needs Glow: a sign says so). A hole in the floor (S) at the E end to Spring Pools.'],
  ['cs_2', 'crystal', 'Spring Pools', 34, 4, 6, 2, 'Pools of water ~ to swim through, crystal ledges. N doorway (from Crystal Mouth) near the E end; E to Current Run; W to the Knight\'s Hall; a hole in the floor (S, W part) down to the Drip Garden. Drip-glooms, smog puffs.'],
  ['cs_3', 'crystal', 'Current Run', 40, 4, 4, 2, 'Water with currents < > pushing you; swim against them or ride them. W to Spring Pools, E to the Watering Spring.'],
  ['cs_4', 'crystal', 'Watering Spring', 44, 4, 2, 2, 'Watering Spot W by a spring. W to Current Run, a hole in the floor (S) down the Waterfall Climb.'],
  ['cs_5', 'crystal', 'Waterfall Climb', 44, 6, 2, 4, 'A tall waterfall shaft: smooth crystal walls (needs Vine Grip to come back up). N doorway at the top, W doorway at the bottom to the Sunbeam Shrine. Drip-glooms.'],
  ['cs_6', 'crystal', 'Sunbeam Shrine', 40, 8, 4, 2, 'ABILITY: SUNBEAM A (ability beam) on a shrine of sun crystals. A sun switch y + SUN gate here to practise on (it opens the way W to Glass Hollows). E doorway to the Waterfall Climb.'],
  ['cs_9', 'crystal', 'Glass Hollows', 36, 8, 4, 2, 'Crystal caves with 2 gloom knights k. E to the Sunbeam Shrine, W to the Glass charm room, a hole in the ceiling (N) up to the Drip Garden.'],
  ['cs_8', 'crystal', 'Glass Garden', 32, 8, 4, 2, 'Charm room: SWIFT SWING charm C; a NOTCH N too (a little seed-shaped socket). E doorway.'],
  ['cs_11', 'crystal', 'Drip Garden', 36, 6, 4, 2, 'Dripping crystals, drip-glooms, pools; a LIFE SEED L. S doorway (down to Glass Hollows), N doorway (up to Spring Pools; climbable).'],
  ['cs_7', 'crystal', 'Knight\'s Hall', 30, 4, 4, 2, 'A long crystal hall guarded by 2 gloom knights. E to Spring Pools, W to the Lever Tunnel.'],
  ['cs_10', 'crystal', 'Lever Tunnel', 26, 4, 4, 2, 'SHORTCUT: a lever h opens the hatch in the ceiling (N doorway: a LEVER gate on this side) up into Under the Gap (Rootgate). E doorway to the Knight\'s Hall. Ledges up to the hatch.'],

  /* ---------------- CLOUD ROOTS: high, windy caverns near the surface (smog, spore lanterns, gloom knights) ---------------- */
  ['cr_1', 'cloud', 'Windy Stair', 20, -8, 2, 2, 'Top of the Old Well (S doorway). Wind starts. E doorway to the Gust Gallery.'],
  ['cr_2', 'cloud', 'Gust Gallery', 22, -8, 4, 2, 'Wind zones push you; cloud ledges =. W to the Windy Stair, E to the Watering Perch, a hole in the ceiling (N) up to the Rain Pocket (needs Puff Jump).'],
  ['cr_3', 'cloud', 'Watering Perch', 26, -8, 2, 2, 'Watering Spot W on a windy perch. W to the Gust Gallery, E to the Crumble Bridge.'],
  ['cr_4', 'cloud', 'Crumble Bridge', 28, -8, 4, 2, 'Crumbling ledges - over a long thorn drop; wind gusts. W to the Perch, a hole in the ceiling (N, E end) up into the Cloud Hall.'],
  ['cr_5', 'cloud', 'Cloud Hall', 28, -12, 4, 4, 'A tall windy hall: climb up with Vine Grip and wind; smog puffs and spore lanterns. S doorway (from the Crumble Bridge), W doorway (top) to the Storm Gate, E doorway (lower) to the Thorn Coat room.'],
  ['cr_8', 'cloud', 'Thistle Shelf', 32, -10, 2, 2, 'Charm room: THORN COAT charm C. W doorway.'],
  ['cr_6', 'cloud', 'Storm Gate', 24, -12, 4, 2, 'Gloom knights before the guardian. E to the Cloud Hall, W into the Grey Cloud arena, a hole in the floor (S) down to the Rain Pocket.'],
  ['cr_10', 'cloud', 'Rain Pocket', 24, -10, 4, 2, 'A rainy pocket with a SUN VESSEL V. N doorway (from the Storm Gate), a hole in the floor (S) down into the Gust Gallery.'],
  ['cr_7', 'cloud', 'The Grey Cloud', 18, -12, 6, 2, 'GUARDIAN ARENA: THE GREY CLOUD (G anchor high in the middle, guardian cloud). A wide arena with cloud ledges = at 3 and 6 tiles up. E doorway = ARENA gate. A 4-wide CALM gate in the floor (S doorway, W part) down to the Sky Window.'],
  ['cr_9', 'cloud', 'Sky Window', 18, -10, 2, 2, 'Below the Grey Cloud arena (N doorway): a LIFE SEED L and a window of light from the garden above. Climbable back up (cloud ledges).'],

  /* ---------------- HEARTSEED CHAMBER: the end ---------------- */
  ['hs_1', 'heart', 'Root Throat', 22, 4, 2, 4, 'Down through the SEAL door (N doorway). A long descent through thorny roots: thorns x everywhere, small safe ledges, needs Leaf Dash and Puff Jump to steer. S doorway at the bottom.'],
  ['hs_2', 'heart', 'Last Watering', 20, 8, 4, 2, 'The last Watering Spot W. N doorway (from the Root Throat), E doorway to the Gloom Gallery. A sign: "The Heartseed is close. Rest, then go gently."'],
  ['hs_3', 'heart', 'Gloom Gallery', 24, 8, 2, 4, 'A tall gallery: one of every gloom, wind, thorns, crumbling ledges; needs everything. W doorway (top) from Last Watering, a hole in the floor (S) down to the Heartseed.'],
  ['hs_4', 'heart', 'The Heartseed', 20, 12, 6, 3, 'FINAL ARENA: THE GLOOM HEART (G anchor up in the middle, guardian heart). A wide, tall chamber with floating root ledges = at 4, 8 and 12 tiles up. N doorway (from the Gloom Gallery) at the E part: an ARENA gate.'],
];
/* [roomA, roomB, at (world tile along the shared edge), len] */
const LINKS = [
  ['rg_fall', 'rg_hub', 364, 4], ['rg_west', 'rg_hub', 11, 4], ['rg_hub', 'rg_gap', 11, 4], ['rg_hub', 'rg_door', 400, 4], ['rg_well', 'rg_hub', 324, 4],
  ['rg_gap', 'cp_1', 11, 4], ['rg_gap', 'rg_under', 440, 8], ['rg_door', 'rg_under', 29, 4], ['rg_door', 'hs_1', 364, 4], ['rg_stair', 'rg_door', 29, 4],
  ['rg_stair', 'gc_7', 300, 4], ['rg_nook', 'rg_well', -12, 3], ['cr_1', 'rg_well', 332, 4], ['mh_1', 'rg_west', 11, 4],
  ['mh_2', 'mh_1', 11, 4], ['mh_4', 'mh_2', 11, 4], ['mh_8', 'mh_4', 11, 4], ['mh_6', 'mh_2', 176, 4], ['mh_7', 'mh_6', -7, 4], ['mh_7', 'mh_4', 40, 4],
  ['mh_12', 'mh_7', -14, 4], ['mh_1', 'mh_3', 200, 4], ['mh_3', 'mh_life', 21, 3], ['mh_5', 'mh_3', 47, 4], ['mh_9', 'mh_5', 47, 4], ['mh_10', 'mh_9', 47, 4],
  ['mh_10', 'gc_1', 52, 4],
  ['gc_1', 'gc_2', 65, 4], ['gc_2', 'gc_3', 65, 4], ['gc_3', 'gc_4', 65, 4], ['gc_4', 'gc_5', 65, 4], ['gc_5', 'gc_7', 65, 4], ['gc_3', 'gc_10', 83, 4],
  ['gc_3', 'gc_6', 172, 4], ['gc_8', 'gc_6', 101, 4], ['gc_9', 'gc_8', 101, 4], ['gc_6', 'gc_11', 101, 4], ['gc_10', 'gc_11', 240, 4],
  ['cp_1', 'cp_2', 11, 4], ['cp_11', 'cp_1', 520, 4], ['cp_1', 'cp_12', 528, 4], ['cp_2', 'cp_3', -7, 4], ['cp_3', 'cp_4', -7, 4], ['cp_4', 'cp_5', -7, 4],
  ['cp_5', 'cp_6', 692, 4], ['cp_6', 'cp_9', 11, 4], ['cp_7', 'cp_6', 11, 4], ['cp_8', 'cp_7', 11, 4], ['cp_2', 'cp_8', 11, 4], ['cp_8', 'cs_1', 600, 4],
  ['cs_1', 'cs_2', 628, 4], ['cs_2', 'cs_3', 47, 4], ['cs_3', 'cs_4', 47, 4], ['cs_4', 'cs_5', 716, 4], ['cs_6', 'cs_5', 83, 4], ['cs_9', 'cs_6', 83, 4],
  ['cs_8', 'cs_9', 83, 4], ['cs_11', 'cs_9', 588, 4], ['cs_2', 'cs_11', 580, 4], ['cs_7', 'cs_2', 47, 4], ['cs_10', 'cs_7', 47, 4], ['rg_under', 'cs_10', 452, 4],
  ['cr_1', 'cr_2', -61, 4], ['cr_2', 'cr_3', -61, 4], ['cr_3', 'cr_4', -61, 4], ['cr_5', 'cr_4', 504, 4], ['cr_6', 'cr_5', -97, 4], ['cr_7', 'cr_6', -97, 4],
  ['cr_5', 'cr_8', -79, 4], ['cr_7', 'cr_9', 300, 4], ['cr_6', 'cr_10', 420, 4], ['cr_10', 'cr_2', 392, 4],
  ['hs_1', 'hs_2', 364, 4], ['hs_2', 'hs_3', 83, 4], ['hs_3', 'hs_4', 396, 4],
];
const AREAS = { rootgate: 'Rootgate', mossy: 'Mossy Hollows', glowcap: 'Glowcap Caves', pipes: 'Clatter Pipes', crystal: 'Crystal Spring', cloud: 'Cloud Roots', heart: 'Heartseed Chamber' };

function rect(r) { return { id: r[0], area: r[1], name: r[2], x: r[3] * CW, y: r[4] * CH, w: r[5] * CW, h: r[6] * CH, cx: r[3], cy: r[4], cw: r[5], ch: r[6], brief: r[7] }; }
const R = ROOMS.map(rect), byId = Object.fromEntries(R.map(r => [r.id, r]));
const errs = [];
/* overlaps */
for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) errs.push('overlap ' + a.id + ' ' + b.id); }
/* links → per-room doorways: {side:'N'|'S'|'E'|'W', at (local tile), len, to} */
const doors = Object.fromEntries(R.map(r => [r.id, []]));
for (const [ia, ib, at, len] of LINKS) {
  const a = byId[ia], b = byId[ib]; if (!a || !b) { errs.push('no room ' + ia + '/' + ib); continue; }
  let ok = false;
  for (const [p, q] of [[a, b], [b, a]]) {
    if (p.x + p.w === q.x) { /* p left of q: vertical edge */
      if (at >= Math.max(p.y, q.y) && at + len <= Math.min(p.y + p.h, q.y + q.h)) { doors[p.id].push({ side: 'E', at: at - p.y, len, to: q.id }); doors[q.id].push({ side: 'W', at: at - q.y, len, to: p.id }); ok = true; }
    } else if (p.y + p.h === q.y) { /* p above q */
      if (at >= Math.max(p.x, q.x) && at + len <= Math.min(p.x + p.w, q.x + q.w)) { doors[p.id].push({ side: 'S', at: at - p.x, len, to: q.id }); doors[q.id].push({ side: 'N', at: at - q.x, len, to: p.id }); ok = true; }
    }
    if (ok) break;
  }
  if (!ok) errs.push('link not on a shared edge: ' + ia + ' ' + ib + ' at ' + at);
}
/* every room reachable over links (as a graph) */
const seen = new Set(['rg_fall']), st = ['rg_fall'];
while (st.length) { const id = st.pop(); for (const d of doors[id]) if (!seen.has(d.to)) { seen.add(d.to); st.push(d.to); } }
for (const r of R) if (!seen.has(r.id)) errs.push('unreachable ' + r.id);

function skeleton(r) {
  const rows = []; for (let y = 0; y < r.h; y++) { let s = ''; for (let x = 0; x < r.w; x++) s += (x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1) ? '#' : '.'; rows.push(s.split('')); }
  for (const d of doors[r.id]) for (let k = 0; k < d.len; k++) {
    if (d.side === 'W') rows[d.at + k][0] = '.'; else if (d.side === 'E') rows[d.at + k][r.w - 1] = '.';
    else if (d.side === 'N') rows[0][d.at + k] = '.'; else rows[r.h - 1][d.at + k] = '.';
  }
  return rows.map(a => a.join(''));
}
function doorText(r) { return doors[r.id].map(d => d.side + (d.side === 'W' || d.side === 'E' ? ' rows ' : ' cols ') + d.at + '-' + (d.at + d.len - 1) + ' -> ' + d.to + ' (' + byId[d.to].name + ')').join('; '); }

if (require.main === module) {
  console.log(R.length + ' rooms, ' + LINKS.length + ' links');
  /* overview: one char per cell */
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const r of R) { x0 = Math.min(x0, r.cx); y0 = Math.min(y0, r.cy); x1 = Math.max(x1, r.cx + r.cw); y1 = Math.max(y1, r.cy + r.ch); }
  const L = { rootgate: 'R', mossy: 'M', glowcap: 'G', pipes: 'P', crystal: 'C', cloud: 'S', heart: 'H' };
  for (let y = y0; y < y1; y++) { let s = (y + '').padStart(4) + ' '; for (let x = x0; x < x1; x++) { const r = R.find(r => x >= r.cx && x < r.cx + r.cw && y >= r.cy && y < r.cy + r.ch); s += r ? L[r.area] : ' '; } console.log(s); }
  if (errs.length) { console.log('ERRORS\n' + errs.join('\n')); process.exitCode = 1; } else console.log('plan OK');
  if (process.argv.includes('--skel')) {
    const dir = path.join(__dirname, '..', 'rooms');
    for (const area of Object.keys(AREAS)) {
      const f = path.join(dir, area + '.js'); if (fs.existsSync(f)) { console.log('kept ' + f); continue; }
      let out = '/* ROOTLIGHT rooms: ' + AREAS[area] + ' (format: public/rootlight/world.js header). Generated skeletons: border walls with the doorways cut. */\n';
      for (const r of R.filter(r => r.area === area)) {
        out += '\nROOM({ id: \'' + r.id + '\', area: \'' + area + '\', name: ' + JSON.stringify(r.name) + ', cx: ' + r.cx + ', cy: ' + r.cy + ', cw: ' + r.cw + ', ch: ' + r.ch + ',\n';
        out += '  /* ' + r.brief.replace(/\*\//g, '* /') + '\n     doorways: ' + doorText(r) + ' */\n';
        out += '  map: [\n' + skeleton(r).map(s => '    \'' + s + '\'').join(',\n') + '\n  ] });\n';
      }
      fs.writeFileSync(f, out); console.log('wrote ' + f);
    }
  }
}
module.exports = { ROOMS: R, LINKS, doors, byId, AREAS, CW, CH, skeleton, doorText };
