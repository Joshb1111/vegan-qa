/* ROOTLIGHT rooms: Clatter Pipes (format: public/rootlight/world.js header). Hand-made rooms; each brief and its doorways in the comment above the map. */

ROOM({ id: 'cp_1', area: 'pipes', name: "Pipe Mouth", cx: 30, cy: 0, cw: 4, ch: 2,
  /* Entrance from the Long Gap (W). Rusty pipes, a rust-cog c. E doorway to the Steam Lift. A hole in the ceiling (N) to the Rusty Attic (needs Vine Grip: a smooth wall up), a hole in the floor (S) down to the Bolt Cellar.
     doorways: W rows 11-14 -> rg_gap (The Long Gap); E rows 11-14 -> cp_2 (Steam Lift); N cols 40-43 -> cp_11 (Rusty Attic); S cols 48-51 -> cp_12 (Bolt Cellar)
     design: A long cog floor under a big pipe run (a pipe ledge to hop up out of the cog's way); a smooth metal chimney (K walls hang to 4 tiles above the floor, nothing to stand on) rises to the Rusty Attic: only Vine Grip climbs it; the pipe-mouth hole to the Bolt Cellar is a 4-tile jump. */
  map: [
    '########################################....####################',
    '######################################KK....KK##################',
    '######################################KK....KK##################',
    '############KKKKKKKKKKKKKKKKKKKKKKKKKKKK....KK##################',
    '############...KK.............KK......KK....KK##################',
    '############...KK.............KK......KK....KK.KKKK....d...KKKK#',
    '####...........KK.....................KK....KK.............KKKK#',
    '#.....................................KK....KK.............KKKK#',
    '#........................s............KK....KK.................#',
    '#.....................................KK....KK.................#',
    '#.....................................KK....KK.................#',
    '...................b..................KK....KK..................',
    '..................====..........................................',
    '................................................................',
    '......i..........................c.......i................b.....',
    '##############################################........##########',
    '##############################################KK....KK##########',
    '##############################################KK....KK##########'
  ],
  signs: ["Rust-cogs charge when you come close! Hop up out of the way, then bloom them while they are dizzy.","A smooth metal chimney. Much too slippy to climb... for now."] });

ROOM({ id: 'cp_11', area: 'pipes', name: "Rusty Attic", cx: 30, cy: -2, cw: 4, ch: 2,
  /* BACKTRACK (Vine Grip): a LIFE SEED L among old gears. S doorway.
     doorways: S cols 40-43 -> cp_1 (Pipe Mouth)
     design: Arrive up the chimney (floor both sides of the hole). Old gear blocks to climb with Vine Grip; the Life Seed sits on a big hanging gear in the west whose east face is thorny: walk under it and climb the narrow gap by the wall instead. */
  map: [
    '################################################################',
    '################################################################',
    '################################################################',
    '##......KK.....KKKK...............................KKKKK........#',
    '##......KK.....KKKK...............................KKKKK........#',
    '##....L.KK.....KKKK...............................KKKKK........#',
    '##...KKKKKx........................s..............KKKKK........#',
    '##...KKKKKx....................................................#',
    '##...KKKKKx..................b.................................#',
    '##...KKKKKx.....s..........KKKKKK..............................#',
    '##...KKKKKx................KKKKKK..............................#',
    '##...KKKKKx................KKKKKK.........................KKKKK#',
    '##.................KKKK....KKKKKK.........................KKKKK#',
    '##.................KKKK....KKKKKK.........................KKKKK#',
    '##.................KKKK....KKKKKK....................c....KKKKK#',
    '######################################KK....KK##################',
    '######################################KK....KK##################',
    '######################################KK....KK##################'
  ] });

ROOM({ id: 'cp_12', area: 'pipes', name: "Bolt Cellar", cx: 32, cy: 2, cw: 2, ch: 2,
  /* A small cellar (N doorway) with the BOUNCY BUD charm C and a dew cluster; 2 rust-cogs.
     doorways: N cols 16-19 -> cp_1 (Pipe Mouth)
     design: Fall in onto the pipe ledge under the hole. Two cogs: one on the floor, one on the shelf by the Bouncy Bud charm. Climb back out by ledges 3 tiles apart (floor > ledge > shelf > ledge > the ledge under the hole). The dew sits on a pipe box a dash away. */
  map: [
    '################....############',
    '############...................#',
    '############...................#',
    '#...............====...........#',
    '#..............................#',
    '#...........................*..#',
    '#...........===............KKKK#',
    '#..........................KKKK#',
    '#.C....c.......................#',
    '#KKKKKKKKKKK...................#',
    '#KKKKKKKKKKK...................#',
    '#..............................#',
    '#............====.......====...#',
    '#..............................#',
    '#....b...............c.........#',
    '################################',
    '################################',
    '################################'
  ],
  charms: ['bouncy'] });

ROOM({ id: 'cp_2', area: 'pipes', name: "Steam Lift", cx: 34, cy: -2, cw: 2, ch: 4,
  /* A tall shaft with steam vents v that lift you up (rest on the column, it carries you). W doorway (lower) from Pipe Mouth, E doorway (upper) to Cog Walk, E doorway (lower) from the Old Boiler arena: a CALM gate on the arena side (shortcut once the boiler is calmed).
     doorways: W rows 29-32 -> cp_1 (Pipe Mouth); E rows 11-14 -> cp_3 (Cog Walk); E rows 29-32 -> cp_8 (The Old Boiler)
     design: Steam vents are the lift, each ride under 10 tiles: floor vent > shelf > shelf vent > the upper landing by the Cog Walk door; a third vent lifts you to a bud shelf. The bottom corridor runs from the Pipe Mouth to the boiler's calm gate. */
  map: [
    '################################',
    '################################',
    '################################',
    '##KK..........................##',
    '##KK..........................##',
    '##KK........................b.##',
    '##KK.........KKKKKKK.......KKK##',
    '##KK.........KKKKKKK.......KKK##',
    '##KK.........KKKKKKK..........##',
    '##KK..........................##',
    '##KK..........................##',
    '##KK.....s......................',
    '##KK............................',
    '##KK............................',
    '##KK....................v.......',
    '##KK.................KKKKKKKKK##',
    '##KK.................KKKKKKKKK##',
    '##KK..........................##',
    '##KKKKKKKK....................##',
    '##KKKKKKKK....................##',
    '##KKKKKKKK....................##',
    '##............................##',
    '##............................##',
    '##...............v............##',
    '##.......KKKKKKKKKKK..........##',
    '##.......KKKKKKKKKKK..........##',
    '##..........d.................##',
    '##.......................KKKKK##',
    '##..........................KK##',
    '................................',
    '......................s.........',
    '................................',
    '...i..v.........................',
    '################################',
    '################################',
    '################################'
  ],
  signs: ['Stand in the steam, and up you go!'] });

ROOM({ id: 'cp_3', area: 'pipes', name: "Cog Walk", cx: 36, cy: -2, cw: 4, ch: 2,
  /* Rust-cogs charging along long floors; pipes to hop over. W from Steam Lift, E to Watering Works.
     doorways: W rows 11-14 -> cp_2 (Steam Lift); E rows 11-14 -> cp_4 (Watering Works)
     design: Three long floors, each with a rust-cog, split by pipe humps (2-3 tiles: safe islands the cogs bonk into). Pipe ledges overhead to dodge. SECRET: a cracked wall % in the east pipework, reached from the high ledge, hides a dew cluster. */
  map: [
    '################################################################',
    '################################################################',
    '################################################################',
    '################################################################',
    '#KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK#########',
    '#.........KK....................d.....KK...............#########',
    '#.........KK..........................KK...............#########',
    '#.....................................KK...............%......##',
    '#......................................................%....*.##',
    '#..................................................====#########',
    '#......................................................#########',
    '........................b.......................................',
    '.............====......KKK....====.............====.............',
    '......KKK..............KKK................KKK............KK.....',
    '......KKK.........c....KKK..........c.....KKK.......c....KK.....',
    '################################################################',
    '################################################################',
    '################################################################'
  ] });

ROOM({ id: 'cp_4', area: 'pipes', name: "Watering Works", cx: 40, cy: -2, cw: 2, ch: 2,
  /* Watering Spot W among the pipes. W to Cog Walk, E to Piston Hall.
     doorways: W rows 11-14 -> cp_3 (Cog Walk); E rows 11-14 -> cp_5 (Piston Hall)
     design: A quiet room: the Watering Spot under a pipe arch. */
  map: [
    '################################',
    '################################',
    '################################',
    '################################',
    '#...KK...KKKKKKKKKKKKKK...KK...#',
    '#...KK...KKKKKKKKKKKKKK...KK...#',
    '#...KK...KK..........KK...KK...#',
    '#........KK..........KK...KK...#',
    '#........KK..........KK...KK...#',
    '#.........................KK...#',
    '#..............................#',
    '................................',
    '................................',
    '................................',
    '................W........b......',
    '################################',
    '################################',
    '################################'
  ] });

ROOM({ id: 'cp_5', area: 'pipes', name: "Piston Hall", cx: 42, cy: -2, cw: 4, ch: 2,
  /* Moving piston platforms m over a thorn floor; steam vents. W to Watering Works, a hole in the floor at the E end (S) down to the Valve Room.
     doorways: W rows 11-14 -> cp_4 (Watering Works); S cols 20-23 -> cp_6 (Valve Room)
     design: A loop. A thorny pipe deck splits the hall. Steam lifts you up the west shaft; ride three pistons east over the thorns (the last gap needs a Leaf Dash) to the east landing; drop through the gap, then come back west along the floor (thorn pits, one dash gap) into the chamber with the hole down to the Valve Room. Return: the east vent lifts you back up. */
  map: [
    '################################################################',
    '#..............KK.................................KKKK.........#',
    '#.................................................KKKK.........#',
    '#............................................s.................#',
    '#..............................................................#',
    '#........................mmm...................................#',
    '#..........mmm........b...................mmm............*.....#',
    '#......KKKxxxxxxxxxxxKKKxxxxxxxxxxxxxKKKxxxxxxxxxxxxxxxKKKK....#',
    '#......KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK....#',
    '#......KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK....#',
    '#......KKKKKKKK...............................d................#',
    '.......KKKKKKKK................................................#',
    '.......KKKKKKKK................................................#',
    '.......KKKKKKKK................................................#',
    '....v..KKKKKKKK...........b.........t........................v.#',
    '##################........###xxxx######xxxxxx####xxxx###########',
    '####################....########################################',
    '####################....########################################'
  ],
  plats: [[8, 0, 300], [6, 0, 240], [4, 0, 200]] });

ROOM({ id: 'cp_6', area: 'pipes', name: "Valve Room", cx: 42, cy: 0, cw: 2, ch: 2,
  /* You arrive from above (N doorway; a vent or ledges lets you go back up). W to the Boiler Gate, E to the Clockwork Nook. 2 rust-cogs.
     doorways: N cols 20-23 -> cp_5 (Piston Hall); E rows 11-14 -> cp_9 (Clockwork Nook); W rows 11-14 -> cp_7 (Boiler Gate)
     design: You drop in onto a pipe pedestal under the hole; its vent lifts you back up. A rust-cog on each floor (one patrols under the pedestal); the valve box and a pipe ledge are steps back up to the pedestal. */
  map: [
    '####################....########',
    '##################KK....KK######',
    '##################KK....KK######',
    '##################KK....KK######',
    '#...KKKKKK........KK....KK.KKKK#',
    '#...KKKKKK.................KKKK#',
    '#...KKKKKK.....................#',
    '#.....KK.......................#',
    '#....................v..b......#',
    '#.................KKKKKKKK.....#',
    '#.................KKKKKKKK.....#',
    '..............b.................',
    '....====.....KKK...........===..',
    '.............KKK................',
    '.........c...KKK.......c........',
    '################################',
    '################################',
    '################################'
  ] });

ROOM({ id: 'cp_9', area: 'pipes', name: "Clockwork Nook", cx: 44, cy: 0, cw: 2, ch: 2,
  /* Charm room: QUICK BREEZE charm C on a high shelf reached by a vent. W doorway.
     doorways: W rows 11-14 -> cp_6 (Valve Room)
     design: Hop onto the pipe platform; its vent lifts you to the ceiling; Leaf Dash across to the high shelf with the Quick Breeze charm. */
  map: [
    '################################',
    '################################',
    '################################',
    '#.KK......................KKKKK#',
    '#.KK................C.....KKKKK#',
    '#.KK...........KKKKKKKK...KKKKK#',
    '#..............KKKKKKKK...KKKKK#',
    '#.........................KKKKK#',
    '#.........................KKKKK#',
    '#.......................s.KKKKK#',
    '#.........................KKKKK#',
    '........v......................#',
    '......KKKKK....................#',
    '......KKKKK....................#',
    '......KKKKK..b..............*..#',
    '################################',
    '################################',
    '################################'
  ],
  charms: ['breeze'] });

ROOM({ id: 'cp_7', area: 'pipes', name: "Boiler Gate", cx: 40, cy: 0, cw: 2, ch: 2,
  /* A hot corridor before the guardian: vents and a smog puff. E to the Valve Room, W into the Old Boiler arena. A sign: "It is very hot in here. Something is boiling over."
     doorways: E rows 11-14 -> cp_6 (Valve Room); W rows 11-14 -> cp_8 (The Old Boiler)
     design: A hot pipe wall too tall to jump; a vent on each side lifts you over it. A smog puff on the arena side. */
  map: [
    '################################',
    '################################',
    '################################',
    '################################',
    '################################',
    '################################',
    '#KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK#',
    '#.......KK.............KK......#',
    '#..............................#',
    '#..............KK..............#',
    '#..............KK..............#',
    '........s......KK...............',
    '...............KK...............',
    '...............KK...............',
    '.....v......v..KK..v..b...i.....',
    '################################',
    '################################',
    '################################'
  ],
  signs: ['It is very hot in here. Something is boiling over.'] });

ROOM({ id: 'cp_8', area: 'pipes', name: "The Old Boiler", cx: 36, cy: 0, cw: 4, ch: 2,
  /* GUARDIAN ARENA: THE OLD BOILER (G anchor at the back middle, guardian boiler). Flat floor, two pipe ledges = 4 tiles up at the sides. E doorway = ARENA gate. W doorway = CALM gate (shortcut to the Steam Lift). A 4-wide CALM gate in the floor (S doorway) opens down into the Crystal Spring.
     doorways: E rows 11-14 -> cp_7 (Boiler Gate); W rows 11-14 -> cp_2 (Steam Lift); S cols 24-27 -> cs_1 (Crystal Mouth)
     design: Arena: flat floor, ceiling 12 tiles up, two pipe ledges 4 up near the sides (a 2-up pipe step to each). G on the floor in the middle. Gates in reading order: W calm, E arena, floor calm (a hatch flush with the floor). */
  map: [
    '################################################################',
    '################################################################',
    '#KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK#',
    '##KK........................................................KK##',
    '##KK........................................................KK##',
    '##KK........................................................KK##',
    '##KK........................................................KK##',
    '##KK........................................................KK##',
    '##............................................................##',
    '##............................................................##',
    '##....b..................................................b....##',
    'g...======............................................======...g',
    'g..............................................................g',
    'g.........==........................................==.........g',
    'g...............................G..............................g',
    '########################gggg####################################',
    '########################....####################################',
    '########################....####################################'
  ],
  gates: ['calm', 'arena', 'calm'],
  guardian: 'boiler' });
