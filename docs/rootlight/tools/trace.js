/* trace a scripted run in a room: node trace.js room x y "abilities" "script"   script: JS f(t,p) returning an input mask (IN.L etc.) */
const path = require('path'), fs = require('fs'), vm = require('vm'); const { loadWorld } = require('./check.js'); const Wd = loadWorld();
const g = { console }; g.window = g; vm.createContext(g); for (const f of ['world.js', 'sim.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../../public/rootlight', f), 'utf8'), g);
const RL = g.RL; RL.World.rooms = Wd.rooms; RL.World.list = Wd.list; const IN = RL.IN;
const [id, x, y, ab, script, n] = process.argv.slice(2);
const save = RL.Sim.newSave(1); save.started = 1; save.spot = { room: id, x: +x, y: +y }; for (const a of (ab || '').split(',').filter(Boolean)) save.ab[a] = 1;
const s = new RL.Sim({ save }); s.enterRoom(id, +x, +y, {}); s.room.foes = []; const p = s.players[0]; s.hooks.door = (pp, to) => { console.log('EXIT to', to, 'at', pp.x | 0, pp.y | 0); process.exit(0); };
const f = new Function('t', 'p', 'IN', 'return (' + script + ')');
for (let t = 0; t < (+n || 600); t++) { s.step([f(t, p, IN)]); if (t % 10 === 0) console.log(t, (p.x / 20).toFixed(1), (p.y / 20).toFixed(2), p.st, 'vx', p.vx.toFixed(1), 'vy', p.vy.toFixed(1), p.swim ? 'swim' : '', p.wall ? 'wall' : ''); }
