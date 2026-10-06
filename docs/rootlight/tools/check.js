/* Check public/rootlight/world.js against the plan (tools/plan.js): sizes, doorways on both sides, letters and their lists.
   node check.js [roomId...] [--built]   exit code 1 on errors. Reads docs/rootlight/rooms/*.js (or world.js with --built). Warnings are printed but do not fail. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const plan = require('./plan.js');
const ROOT = path.join(__dirname, '..', '..', '..');
/* the world: world.js for the data, then the rooms straight from docs/rootlight/rooms/*.js (so designers never need to build) */
function loadWorld(fromWorldJs) {
  const g = { window: {} }; g.window.window = g.window; vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'public/rootlight/world.js'), 'utf8'), g, { filename: 'world.js' });
  const W = g.window.RL.World; if (fromWorldJs) return W;
  W.rooms = {}; W.list = []; g.ROOM = W.ROOM;
  for (const a of ['rootgate', 'mossy', 'glowcap', 'pipes', 'crystal', 'cloud', 'heart']) {
    const f = path.join(__dirname, '..', 'rooms', a + '.js'); if (!fs.existsSync(f)) continue;
    try { vm.runInContext(fs.readFileSync(f, 'utf8'), g, { filename: 'rooms/' + a + '.js' }); } catch (e) { console.log('ERROR in rooms/' + a + '.js: ' + e.message); process.exitCode = 1; }
  }
  return W;
}
const TER = '.#RK=-x~<>%|g', ENT = '@WPistdclk*bovmLVNCAhyG', SOLID = '#RK%|-', STAND = 'WPitckovbl*';
function check(W, only) {
  const errs = [], warns = [], E = (id, m) => errs.push(id + ': ' + m), Wn = (id, m) => warns.push(id + ': ' + m);
  for (const P of plan.ROOMS) if (!W.rooms[P.id]) Wn(P.id, 'not written yet');
  for (const r of W.list) {
    if (only.length && !only.includes(r.id)) continue;
    const P = plan.byId[r.id]; if (!P) { E(r.id, 'not in the plan'); continue; }
    if (r.cx !== P.cx || r.cy !== P.cy || r.cw !== P.cw || r.ch !== P.ch || r.area !== P.area) E(r.id, 'rect/area differs from the plan');
    const w = P.w, h = P.h, m = r.map;
    if (!Array.isArray(m) || m.length !== h) { E(r.id, 'map has ' + (m && m.length) + ' rows, want ' + h); continue; }
    let bad = false; m.forEach((row, y) => { if (row.length !== w) { E(r.id, 'row ' + y + ' has ' + row.length + ' chars, want ' + w); bad = true; } for (const ch of row) if (!TER.includes(ch) && !ENT.includes(ch)) { E(r.id, 'row ' + y + ' unknown letter ' + JSON.stringify(ch)); bad = true; break; } });
    if (bad) continue;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? '#' : m[y][x];
    const open = c => !SOLID.includes(c);   /* doorways: anything not solid (air, things, water, ledges, thorns, gates) */
    /* doorways: every open edge cell must belong to a planned doorway, and every planned doorway cell must be open */
    const want = new Set(); for (const d of plan.doors[r.id]) for (let k = 0; k < d.len; k++) want.add(d.side + (d.at + k));
    for (let x = 0; x < w; x++) { if (open(at(x, 0)) !== want.has('N' + x)) E(r.id, 'top edge x ' + x + (want.has('N' + x) ? ' should be open (doorway)' : ' is open but no doorway is planned there')); if (open(at(x, h - 1)) !== want.has('S' + x)) E(r.id, 'bottom edge x ' + x + (want.has('S' + x) ? ' should be open (doorway)' : ' is open but no doorway is planned there')); }
    for (let y = 0; y < h; y++) { if (open(at(0, y)) !== want.has('W' + y)) E(r.id, 'left edge y ' + y + (want.has('W' + y) ? ' should be open (doorway)' : ' is open but no doorway is planned there')); if (open(at(w - 1, y)) !== want.has('E' + y)) E(r.id, 'right edge y ' + y + (want.has('E' + y) ? ' should be open (doorway)' : ' is open but no doorway is planned there')); }
    /* the neighbour's matching cells: same openness (a gate counts as open) */
    for (const d of plan.doors[r.id]) {
      const o = W.rooms[d.to]; if (!o || !Array.isArray(o.map)) continue; const Q = plan.byId[d.to];
      for (let k = 0; k < d.len; k++) {
        let mine, theirs;
        if (d.side === 'E') { mine = at(w - 1, d.at + k); theirs = (o.map[d.at + k + P.y - Q.y] || '')[0]; }
        else if (d.side === 'W') { mine = at(0, d.at + k); theirs = (o.map[d.at + k + P.y - Q.y] || '')[Q.w - 1]; }
        else if (d.side === 'S') { mine = at(d.at + k, h - 1); theirs = (o.map[0] || '')[d.at + k + P.x - Q.x]; }
        else { mine = at(d.at + k, 0); theirs = (o.map[Q.h - 1] || '')[d.at + k + P.x - Q.x]; }
        if (theirs !== undefined && open(mine) !== open(theirs)) E(r.id, 'doorway ' + d.side + ' to ' + d.to + ' cell ' + k + ': ' + JSON.stringify(mine) + ' here vs ' + JSON.stringify(theirs) + ' there');
      }
    }
    /* E/W doorways should have a floor under them on the inside (the cell below the lowest open cell) */
    for (const d of plan.doors[r.id]) if (d.side === 'E' || d.side === 'W') { const x = d.side === 'E' ? w - 1 : 0, xi = d.side === 'E' ? w - 2 : 1, yb = d.at + d.len; if (yb < h && !SOLID.includes(at(x, yb)) && at(x, yb) !== '=') Wn(r.id, 'doorway ' + d.side + ' to ' + d.to + ' has no floor under it at the edge'); void xi; }
    /* counts */
    const cnt = ch => m.join('').split(ch).length - 1;
    if (cnt('i') !== (r.signs || []).length) E(r.id, cnt('i') + ' signs i but ' + (r.signs || []).length + ' texts');
    if (cnt('C') !== (r.charms || []).length) E(r.id, cnt('C') + ' charms C but ' + (r.charms || []).length + ' ids');
    for (const c of r.charms || []) if (!W.charms[c]) E(r.id, 'unknown charm ' + c);
    if (cnt('A') !== (r.ability ? 1 : 0)) E(r.id, 'ability A count ' + cnt('A') + ' vs ability ' + r.ability);
    if (r.ability && !W.abilities[r.ability]) E(r.id, 'unknown ability ' + r.ability);
    if (cnt('G') !== (r.guardian ? 1 : 0)) E(r.id, 'guardian G count ' + cnt('G') + ' vs guardian ' + r.guardian);
    if (cnt('@') && r.id !== W.start) E(r.id, '@ outside the start room');
    /* gates: connected runs of g (4-neighbour) */
    const seen = new Set(); let groups = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === 'g' && !seen.has(x + ',' + y)) { groups++; const st = [[x, y]]; seen.add(x + ',' + y); while (st.length) { const [a, b] = st.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (a + dx) + ',' + (b + dy); if (at(a + dx, b + dy) === 'g' && !seen.has(k)) { seen.add(k); st.push([a + dx, b + dy]); } } } }
    const gk = r.gates || []; if (groups !== gk.length) E(r.id, groups + ' gates g but ' + gk.length + ' kinds');
    for (const k of gk) if (!['lever', 'sun', 'seal', 'arena', 'calm'].includes(k)) E(r.id, 'unknown gate kind ' + k);
    if (cnt('h') !== gk.filter(k => k === 'lever').length) E(r.id, cnt('h') + ' levers h vs ' + gk.filter(k => k === 'lever').length + ' lever gates');
    if (cnt('y') !== gk.filter(k => k === 'sun').length) E(r.id, cnt('y') + ' sun switches y vs ' + gk.filter(k => k === 'sun').length + ' sun gates');
    if ((gk.includes('arena') || gk.includes('calm')) && !r.guardian) E(r.id, 'arena/calm gates need a guardian in the room');
    /* moving platforms: horizontal runs of m */
    let runs = 0; m.forEach(row => { for (let x = 0; x < w; x++) if (row[x] === 'm' && row[x - 1] !== 'm') runs++; });
    if (runs !== (r.plats || []).length) E(r.id, runs + ' moving platforms m but ' + (r.plats || []).length + ' paths');
    /* things that stand need a floor */
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = at(x, y);
      if (STAND.includes(c) && c !== 'b' && c !== 'l' && c !== '*') { const f = at(x, y + 1); if (!SOLID.includes(f) && f !== '=') Wn(r.id, JSON.stringify(c) + ' at ' + x + ',' + y + ' has no floor under it'); }
      if (c === 'd' && !SOLID.includes(at(x, y - 1))) Wn(r.id, 'drip-gloom d at ' + x + ',' + y + ' has no ceiling above it');
      if (c === 'y' || c === 'h') { /* fine anywhere */ }
    }
    if (r.dark && r.dark !== 1) E(r.id, 'dark must be 0 or 1');
    for (const wd of r.wind || []) if (!Array.isArray(wd) || wd.length < 6) E(r.id, 'wind entries are [x,y,w,h,dx,dy,gust]');
  }
  return { errs, warns };
}
if (require.main === module) {
  const args = process.argv.slice(2), W = loadWorld(args.includes('--built')); const { errs, warns } = check(W, args.filter(a => !a.startsWith('--')));
  console.log(W.list.length + ' rooms written of ' + plan.ROOMS.length);
  if (warns.length) console.log('WARNINGS (' + warns.length + ')\n  ' + warns.join('\n  '));
  if (errs.length) { console.log('ERRORS (' + errs.length + ')\n  ' + errs.join('\n  ')); process.exitCode = 1; } else console.log('check OK');
}
module.exports = { loadWorld, check };
