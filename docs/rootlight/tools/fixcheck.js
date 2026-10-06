/* regression checks for the playtest fixes: node fixcheck.js */
const path = require('path'), fs = require('fs'), vm = require('vm'); const { loadWorld } = require('./check.js'); const Wd = loadWorld();
const g = { console }; g.window = g; vm.createContext(g); for (const f of ['world.js', 'sim.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../../public/rootlight', f), 'utf8'), g);
const RL = g.RL; RL.World.rooms = Wd.rooms; RL.World.list = Wd.list; const IN = RL.IN; const out = []; const ok = (n, c, i) => out.push((c ? 'PASS ' : 'FAIL ') + n + '  ' + (i || ''));
const mk = (room, x, y, f) => { const save = RL.Sim.newSave(1); save.started = 1; if (f) f(save); const s = new RL.Sim({ save }); s.enterRoom(room, x, y, {}); s.room.foes = []; s.fade = 0; return s; };
{ const s = mk('rg_door', 60, 300); for (let i = 0; i < 200; i++) s.step([IN.L]); ok('rg_door west stops at the shut Root Stair gate', s.room.id === 'rg_door', s.room.id + ' ' + (s.players[0].x | 0)); }
{ const s = mk('cp_2', 600, 340); const p = s.players[0]; p.x = s.room.pw - 40; p.y = 660; for (let i = 0; i < 120; i++) s.step([IN.R]); ok('cp_2 east stops at the boiler calm gate', s.room.id === 'cp_2', s.room.id); }
{ const s = mk('rg_door', null, null, sv => { sv.calm.knot = sv.calm.boiler = sv.calm.cloud = 1; }); ok('seal opens with three calmed', s.room.gates.filter(g => g.kind === 'seal').every(g => !g.shut)); }
{ const s = mk('rg_door', null, null, sv => { sv.calm.knot = sv.calm.boiler = 1; }); ok('seal shut with two calmed', s.room.gates.filter(g => g.kind === 'seal').every(g => g.shut)); }
{ const s = mk('mh_10', null, null, sv => { sv.calm.knot = 1; }); const it = s.room.items.find(i => i.kind === 'ability'); ok('a lost seed waits in the arena; the floor gate waits for it', it && it.id === 'dash' && s.room.gates.find(g => g.kind === 'calm').shut, JSON.stringify(it && [it.x, it.y]));
  const p = s.players[0]; p.x = it.x - 30; p.y = it.y + 10; for (let i = 0; i < 60; i++) s.step([IN.R]); ok('taking it opens the floor gate', s.save.ab.dash && !s.room.gates.find(g => g.kind === 'calm').shut); }
{ const s = mk('rg_under', 760, 300); const p = s.players[0]; for (let i = 0; i < 200; i++) s.step([i < 100 ? IN.R : IN.L]); ok('rg_under: the hatch cover holds', s.room.id === 'rg_under', s.room.id + ' y ' + (p.y | 0)); }
console.log(out.join('\n'));
{ /* two on one keyboard walk east out of the West Burrow: one room change, no ping-pong */
  const save = RL.Sim.newSave(1); save.started = 1; const s = new RL.Sim({ save, players: 2 }); s.enterRoom('rg_west', 1180, 300, {}); s.room.foes = []; s.fade = 0;
  let changes = 0; for (let i = 0; i < 160; i++) { s.step([IN.R, IN.R]); for (const e of s.events) if (e[0] === 'room') changes++; }
  console.log((changes === 1 && s.room.id === 'rg_hub' ? 'PASS ' : 'FAIL ') + 'local co-op doorway: one change, no ping-pong  ' + changes + ' ' + s.room.id + ' ' + s.players.map(p => p.x | 0)); }
{ const save = RL.Sim.newSave(1); save.started = 1; const s = new RL.Sim({ save, players: 2 }); s.enterRoom('rg_hub', 30, 300, {}); s.room.foes = []; s.fade = 0;
  let changes = 0; for (let i = 0; i < 160; i++) { s.step([IN.L, IN.L]); for (const e of s.events) if (e[0] === 'room') changes++; }
  console.log((changes === 1 && s.room.id === 'rg_west' ? 'PASS ' : 'FAIL ') + 'local co-op doorway west  ' + changes + ' ' + s.room.id + ' ' + s.players.map(p => p.x | 0)); }
