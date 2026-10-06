/* ROOTLIGHT rooms: Cloud Roots (format: public/rootlight/world.js header). Hand-made rooms; each brief and its doorways in the comment above the map. */

ROOM({ id: 'cr_1', area: 'cloud', name: "Windy Stair", cx: 20, cy: -8, cw: 2, ch: 2,
  /* Top of the Old Well (S doorway). Wind starts. E doorway to the Gust Gallery.
     doorways: S cols 12-15 -> rg_well (The Old Well); E rows 11-14 -> cr_2 (Gust Gallery)
     design: You climb out of the Old Well into a shallow dip. Wind starts: a gentle updraft makes the cloud-ledge stair to a dew cluster feel floaty, and a gust helps you over a safe dip on the way east. */
  map: [
    '################################',
    '################################',
    '################################',
    '#...........RR......RR....KKKKK#',
    '#...........RR......RR....KKKKK#',
    '#..*................RR....KKKKK#',
    '#.====......................KKK#',
    '#...............s..............#',
    '#......b.......................#',
    '#.....====.....................#',
    '#..............................#',
    '#...............................',
    '#..====.........................',
    '#...............................',
    '#.................i........b....',
    '##########........###....#######',
    '############....#####....#######',
    '############....################'
  ],
  signs: ['Wind! It pushes you about. Let it help you along.'],
  wind: [[1, 3, 9, 12, 0, -0.5, 0], [19, 6, 8, 9, 0.5, 0, 1]] });

ROOM({ id: 'cr_2', area: 'cloud', name: "Gust Gallery", cx: 22, cy: -8, cw: 4, ch: 2,
  /* Wind zones push you; cloud ledges =. W to the Windy Stair, E to the Watering Perch, a hole in the ceiling (N) up to the Rain Pocket (needs Puff Jump).
     doorways: W rows 11-14 -> cr_1 (Windy Stair); E rows 11-14 -> cr_3 (Watering Perch); N cols 40-43 -> cr_10 (Rain Pocket)
     design: Islands over a thorny drop, gusts between (the 7-wide gap needs a dash, or the gust). In the middle hall, cloud ledges climb to one right under the ceiling hole: the hole is 6 tiles above it with no walls near, so only a Puff Jump reaches the Rain Pocket. Falling from the Rain Pocket lands on that ledge. */
  map: [
    '########################################....####################',
    '###############################......................###########',
    '###############################......................###########',
    '###############################......................###########',
    '#.......KKKKK...........................................KKKKK..#',
    '#.......................................................KKKKK..#',
    '#.......................................====...................#',
    '#......................s.......................................#',
    '#..............................................................#',
    '#...................................===........................#',
    '#...............................................s..............#',
    '.............................b..................................',
    '................t..........KKKK.====..........====..............',
    '............KKKKKKKK.......KKKK.................................',
    '............KKKKKKKK.......KKKK.......i..........l..............',
    '########....KKKKKKKK.......KKKK######################....#######',
    '########xxxxKKKKKKKKxxxxxxxKKKK######################xxxx#######',
    '################################################################'
  ],
  signs: ['Something up there is out of reach... for now.'],
  wind: [[8, 4, 4, 11, 0.5, 0, 1], [20, 3, 7, 12, 0.7, 0, 1], [53, 4, 4, 11, -0.4, 0, 1]] });

ROOM({ id: 'cr_3', area: 'cloud', name: "Watering Perch", cx: 26, cy: -8, cw: 2, ch: 2,
  /* Watering Spot W on a windy perch. W to the Gust Gallery, E to the Crumble Bridge.
     doorways: W rows 11-14 -> cr_2 (Gust Gallery); E rows 11-14 -> cr_4 (Crumble Bridge)
     design: A calm windy perch: the Watering Spot on a cloud-stone mound, a soft breeze overhead. */
  map: [
    '################################',
    '################################',
    '################################',
    '#....RR.................KKKKK..#',
    '#....RR.................KKKKK..#',
    '#....RR..................KKK...#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '#..............................#',
    '................................',
    '................W...............',
    '............KKKKKKKKK...........',
    '.....b....KKKKKKKKKKKKK.........',
    '################################',
    '################################',
    '################################'
  ],
  wind: [[1, 3, 30, 7, 0.3, 0, 1]] });

ROOM({ id: 'cr_4', area: 'cloud', name: "Crumble Bridge", cx: 28, cy: -8, cw: 4, ch: 2,
  /* Crumbling ledges - over a long thorn drop; wind gusts. W to the Perch, a hole in the ceiling (N, E end) up into the Cloud Hall.
     doorways: W rows 11-14 -> cr_3 (Watering Perch); N cols 56-59 -> cr_5 (Cloud Hall)
     design: An arch of crumbling cloud ledges (2 wide, gaps of 2) over a thorn bed, with two solid cloud-stone pillars to rest on; an updraft gust under the top of the arch and a westward gust near the end. At the east end, cloud ledges 3 apart climb to the ledge under the ceiling hole. */
  map: [
    '########################################################....####',
    '##################################################.............#',
    '##################################################.............#',
    '#.........RR.....................RR.....................====...#',
    '#.........RR..................s................................#',
    '#..............................................s...............#',
    '#....................................................====......#',
    '#..............................................................#',
    '#.....................b*.......--........l.....................#',
    '#....................KKKK..--......--..KKKK..............====..#',
    '#................--..KKKK..............KKKK..--................#',
    '.............--......KKKK..............KKKK......--............#',
    '.....................KKKK..............KKKK..........KKKKKKKKKK#',
    '.........--..........KKKK..............KKKK..........KKKKKKKKKK#',
    '...i.................KKKK..............KKKK..........KKKKKKKKKK#',
    '#######..............KKKK..............KKKK..........KKKKKKKKKK#',
    '#######xxxxxxxxxxxxxxKKKKxxxxxxxxxxxxxxKKKKxxxxxxxxxxKKKKKKKKKK#',
    '################################################################'
  ],
  signs: ['These cloud ledges crumble! Keep moving.'],
  wind: [[25, 3, 13, 12, 0, -0.5, 1], [43, 3, 9, 12, -0.4, 0, 1]] });

ROOM({ id: 'cr_5', area: 'cloud', name: "Cloud Hall", cx: 28, cy: -12, cw: 4, ch: 4,
  /* A tall windy hall: climb up with Vine Grip and wind; smog puffs and spore lanterns. S doorway (from the Crumble Bridge), W doorway (top) to the Storm Gate, E doorway (lower) to the Thorn Coat room.
     doorways: S cols 56-59 -> cr_4 (Crumble Bridge); W rows 11-14 -> cr_6 (Storm Gate); E rows 29-32 -> cr_8 (Thistle Shelf)
     design: A tall hall. From the hole, climb the cloud-stone pillar (Vine Grip), dash to the island, then ride the updraft over the thorn bed (or wall-jump via the ledge in it) to the top of the great wall, and hop west by a cloud ledge to the Storm Gate door. A sheltered garden lies below the west ledge (dew, climb out up the wall). */
  map: [
    '################################################################',
    '################################################################',
    '################################################################',
    '##......RR..........................RR....l.....KKKKKKKKKKK...##',
    '##......RR..........................RR..........KKKKKKKKKKK...##',
    '##......RR......................................KKKKKKKKKKK...##',
    '##................................................KKKKKKK.....##',
    '##............................................................##',
    '##............................................................##',
    '##.............................s..............................##',
    '##............................................................##',
    '..............................................................##',
    '.......................KKKKK................s.................##',
    '................===....KKKKK..................................##',
    '.......................KKKKK..................................##',
    '#######KKKKK...........KKKKK..................................##',
    '#######KKKKK...........KKKKK..................................##',
    '#######KKKKK...........KKKKK.........................s........##',
    '#######KKKKK...........KKKKK..................................##',
    '##.....................KKKKK..................................##',
    '##.....................KKKKK..==..............................##',
    '##.....................KKKKK..................................##',
    '##.....................KKKKK.......l...........b..............##',
    '##.....................KKKKK......KKKKKKK.....KKKK............##',
    '##..........s..........KKKKK......KKKKKKK.....KKKK............##',
    '##.....................KKKKK.........d........KKKK............##',
    '##.....................KKKKK..................KKKK............##',
    '##.....................KKKKK..................KKKK............##',
    '##.....................KKKKK..................KKKK............##',
    '##.....................KKKKK..................KKKK..............',
    '##.....................KKKKK..................KKKK..............',
    '##.....................KKKKK..................KKKK..............',
    '##...*.........t...b...KKKKK..................KKKK..............',
    '#######################KKKKKxxxxxxxxxxxxxx##############....####',
    '#######################KKKKK############################....####',
    '########################################################....####'
  ],
  wind: [[28, 4, 5, 29, 0, -1, 0]] });

ROOM({ id: 'cr_8', area: 'cloud', name: "Thistle Shelf", cx: 32, cy: -10, cw: 2, ch: 2,
  /* Charm room: THORN COAT charm C. W doorway.
     doorways: W rows 11-14 -> cr_5 (Cloud Hall)
     design: Thistle chimney: the Thorn Coat charm sits on a floating cloud-stone block whose west face is all thistles. Walk under it into the chimney and climb with Vine Grip, switching walls past the thistle patches set into the walls (right wall up to its patch, wall-jump left above the left patch, up and over). */
  map: [
    '################################',
    '################################',
    '################################',
    '#...RR....................KKKKK#',
    '#...RR.............C......KKKKK#',
    '#................xKKKK....KKKKK#',
    '#................xKKKK....xKKKK#',
    '#................xKKKK....xKKKK#',
    '#........s.......xKKKK....xKKKK#',
    '#................xKKKx....KKKKK#',
    '#................xKKKx....KKKKK#',
    '.................xKKKx....KKKKK#',
    '..........................KKKKK#',
    '..........................KKKKK#',
    '....b........i............KKKKK#',
    '################################',
    '################################',
    '################################'
  ],
  signs: ['Thistles! Do not cling where it prickles.'],
  charms: ['coat'] });

ROOM({ id: 'cr_6', area: 'cloud', name: "Storm Gate", cx: 24, cy: -12, cw: 4, ch: 2,
  /* Gloom knights before the guardian. E to the Cloud Hall, W into the Grey Cloud arena, a hole in the floor (S) down to the Rain Pocket.
     doorways: E rows 11-14 -> cr_5 (Cloud Hall); W rows 11-14 -> cr_7 (The Grey Cloud); S cols 36-39 -> cr_10 (Rain Pocket)
     design: Two gloom knights on long floors under storm clouds; cloud ledges to hop over them. The hole to the Rain Pocket sits between them. */
  map: [
    '################################################################',
    '################################################################',
    '################################################################',
    '################################################################',
    '#.......KKKKKKK..........RR.............KKKKKKKK.......RR......#',
    '#.......KKKKKKK..........RR.............KKKKKKKK.......RR......#',
    '#.........KKK...................s.........KKKK.........RR......#',
    '#..............................................................#',
    '#..............................b...............................#',
    '#.............................====...................====......#',
    '#..............................................................#',
    '................................................................',
    '..............====.......====.................====..............',
    '................................................................',
    '....................k.............................k.......i.....',
    '####################################....########################',
    '####################################....########################',
    '####################################....########################'
  ],
  signs: ["Gloom knights hide behind a shield. Wait for the big push, then swing while the shield is down!"] });

ROOM({ id: 'cr_10', area: 'cloud', name: "Rain Pocket", cx: 24, cy: -10, cw: 4, ch: 2,
  /* A rainy pocket with a SUN VESSEL V. N doorway (from the Storm Gate), a hole in the floor (S) down into the Gust Gallery.
     doorways: N cols 36-39 -> cr_6 (Storm Gate); S cols 8-11 -> cr_2 (Gust Gallery)
     design: Drop in onto a cloud-ledge ladder (it also climbs back up). Drip-glooms fall like rain into puddles. The Sun Vessel waits behind a sun gate: stand on the high ledge and send a Sunbeam at the switch on the wall. The hole in the west floor drops to the Gust Gallery. SECRET: a cracked root wall % at the far west end hides a dew cluster. */
  map: [
    '####################################....########################',
    '#################################..........#####################',
    '#################################..........#####################',
    '#KKKK..........d.........d..........====........d.....KKKKKKKKK#',
    '#KKKK.................................................KKKKKKKKK#',
    '#KKKK.................................................KKKKKKKKK#',
    '#KKKK...........................====..................KKKKKKKKK#',
    '#KKKK.................................................KKKKKKKKK#',
    '#KKKK................................................yKKKKKKKKK#',
    '#KKKK...............................====....====.....KKKKKKKKKK#',
    '#KKKK.................................................KKKKKKKKK#',
    '#KKKK.................................................g........#',
    '#...K...........................====....====..........g........#',
    '#...%.................................................g........#',
    '#.*.%.........................b.......................g.....V..#',
    '########....######~~~~~~~~~~~###############~~~~~~##############',
    '########....####################################################',
    '########....####################################################'
  ],
  gates: ['sun'] });

ROOM({ id: 'cr_7', area: 'cloud', name: "The Grey Cloud", cx: 18, cy: -12, cw: 6, ch: 2,
  /* GUARDIAN ARENA: THE GREY CLOUD (G anchor high in the middle, guardian cloud). A wide arena with cloud ledges = at 3 and 6 tiles up. E doorway = ARENA gate. A 4-wide CALM gate in the floor (S doorway, W part) down to the Sky Window.
     doorways: E rows 11-14 -> cr_6 (Storm Gate); S cols 12-15 -> cr_9 (Sky Window)
     design: Arena: a wide flat floor, cloud ledges at 3 and 6 up spread across, ceiling 13 up, G high in the middle. Gates in reading order: E arena, floor calm (a hatch flush with the floor) down to the Sky Window. */
  map: [
    '################################################################################################',
    '################################################################################################',
    '##............................................................................................##',
    '##............................................................................................##',
    '##............................................................................................##',
    '##..............................................G.............................................##',
    '##............................................................................................##',
    '##............................................................................................##',
    '##..............b..............................................................b..............##',
    '##............======.............======..................======..............======...........##',
    '##............................................................................................##',
    '##.............................................................................................g',
    '##..=====.............======................========................======...........=====.....g',
    '##.............................................................................................g',
    '##.............................................................................................g',
    '############gggg################################################################################',
    '############....################################################################################',
    '############....################################################################################'
  ],
  gates: ['arena', 'calm'],
  guardian: 'cloud' });

ROOM({ id: 'cr_9', area: 'cloud', name: "Sky Window", cx: 18, cy: -10, cw: 2, ch: 2,
  /* Below the Grey Cloud arena (N doorway): a LIFE SEED L and a window of light from the garden above. Climbable back up (cloud ledges).
     doorways: N cols 12-15 -> cr_7 (The Grey Cloud)
     design: You drop in onto the cloud ledge under the hole. A window of sky in the ceiling: climb the cloud-stone pillar (Vine Grip) and Puff Jump up to the window ledge for the Life Seed. Back up: cloud ledges 5, 4 and 3 apart (Puff Jump) to the ledge under the hole. */
  map: [
    '############....################',
    '#####..............##K......K###',
    '#####..............##K......K###',
    '#...........====.....K...L..K..#',
    '#.....................======...#',
    '#..............................#',
    '#.......===....................#',
    '#..............................#',
    '#.........................b....#',
    '#.......................KKKKK..#',
    '#..====.................KKKKK..#',
    '#.......................KKKKK..#',
    '#.......................KKKKK..#',
    '#.......................KKKKK..#',
    '#................i......KKKKK..#',
    '################################',
    '################################',
    '################################'
  ],
  signs: ['A window of sky! The garden up there is waiting for its colour.'] });
