/* Small edits to a room in docs/rootlight/rooms/<area>.js:
     node edit-room.js <room> set <x> <y> <char>          put one character in the map
     node edit-room.js <room> sign <x> <y> "<text>"       put a sign `i` at x,y and its text in reading order
     node edit-room.js <room> text <n> "<text>"           replace the n-th sign's text */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const [id, op, a, b, c] = process.argv.slice(2);
const dir = path.join(__dirname, '..', 'rooms');
let file = null, src = null;
for (const f of fs.readdirSync(dir)) { const s = fs.readFileSync(path.join(dir, f), 'utf8'); if (s.includes("id: '" + id + "'")) { file = path.join(dir, f); src = s; } }
if (!file) throw new Error('no room ' + id);
const i = src.indexOf("id: '" + id + "'"), start = src.lastIndexOf('ROOM({', i), end = src.indexOf('});', i) + 3;
let def; const g = { ROOM: r => { def = r; } }; vm.createContext(g); vm.runInContext(src.slice(start, end), g);
const rows = def.map.slice();
const setc = (x, y, ch) => { const r = rows[y].split(''); r[x] = ch; rows[y] = r.join(''); };
if (op === 'set') setc(+a, +b, c);
else if (op === 'sign') {
  const x = +a, y = +b; if (rows[y][x] !== '.') throw new Error('not air at ' + x + ',' + y + ': ' + rows[y][x]);
  let n = 0; for (let yy = 0; yy < rows.length; yy++) for (let xx = 0; xx < rows[0].length; xx++) if (rows[yy][xx] === 'i' && (yy < y || (yy === y && xx < x))) n++;
  setc(x, y, 'i'); def.signs = (def.signs || []).slice(); def.signs.splice(n, 0, c);
} else if (op === 'text') { def.signs = def.signs.slice(); def.signs[+a] = b; }
else throw new Error('op?');
/* rewrite only the map rows and the signs line of this room */
let block = src.slice(start, end);
const ms = block.indexOf('map: ['), me = block.indexOf(']', ms);
block = block.slice(0, ms) + 'map: [\n' + rows.map(r => "    '" + r + "'").join(',\n') + '\n  ' + block.slice(me);
const sl = /signs: \[[^\]]*\]/;
if (def.signs) { if (sl.test(block)) block = block.replace(sl, () => 'signs: ' + JSON.stringify(def.signs)); else block = block.replace(/\] \}\);$/, '],\n  signs: ' + JSON.stringify(def.signs) + ' });'); }
fs.writeFileSync(file, src.slice(0, start) + block + src.slice(end));
console.log('ok', id, op);
