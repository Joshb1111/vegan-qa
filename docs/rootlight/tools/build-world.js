/* Merge docs/rootlight/rooms/<area>.js into public/rootlight/world.js (between the ROOMS markers), area by area.
   node build-world.js   (then node check.js) */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..');
const WF = path.join(ROOT, 'public', 'rootlight', 'world.js');
const AREAS = ['rootgate', 'mossy', 'glowcap', 'pipes', 'crystal', 'cloud', 'heart'];
const A = '/* ===== ROOMS (docs/rootlight/tools/build-world.js writes everything between these two lines) ===== */', B = '/* ===== END ROOMS ===== */';
let src = fs.readFileSync(WF, 'utf8');
const i = src.indexOf(A), j = src.indexOf(B);
if (i < 0 || j < i) throw new Error('markers missing in world.js');
let body = '\n';
for (const a of AREAS) {
  const f = path.join(__dirname, '..', 'rooms', a + '.js');
  if (!fs.existsSync(f)) { console.log('missing ' + f); continue; }
  let s = fs.readFileSync(f, 'utf8').replace(/\r/g, '');
  /* keep the ROOM(...) calls only; drop the designers' long brief comments to keep the shipped file lean */
  s = s.replace(/^\/\*[\s\S]*?\*\/\s*/, '').replace(/\n  \/\*[\s\S]*?\*\/\n/g, '\n');
  body += '/* ---------- ' + a + ' ---------- */\n' + s.trim() + '\n\n';
}
src = src.slice(0, i + A.length) + body + src.slice(j);
fs.writeFileSync(WF, src);
console.log('world.js: ' + src.length + ' chars');
