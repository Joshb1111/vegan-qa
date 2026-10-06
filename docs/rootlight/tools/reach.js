/* ROOTLIGHT reachability bot: plays every room with the real sim.js physics (no glooms) to find where you can stand and which
   doorways and things you can reach, for a given set of abilities; then walks the whole world in story order (start with
   nothing, pick up each ability where it lies, calm each guardian) and checks: every ability, guardian and item is reachable,
   the ending is reachable, and from every place you can get to you can always get back to Rootgate (no softlocks).
     node reach.js                 the whole world, in story order
     node reach.js mh_1 [ab...]    one room (abilities: dash grip puff glow beam), prints what each doorway reaches
   Glooms are ignored; breakable walls count as open; lever gates open once their lever is reachable (from either side). */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const plan = require('./plan.js'), { loadWorld } = require('./check.js');
const PUB = path.join(__dirname, '..', '..', '..', 'public', 'rootlight');
function load() {
  const W = loadWorld(process.argv.includes('--built'));
  const g = { console }; g.window = g; vm.createContext(g);
  vm.runInContext(fs.readFileSync(path.join(PUB, 'world.js'), 'utf8'), g, { filename: 'world.js' });
  g.RL.World.rooms = W.rooms; g.RL.World.list = W.list;
  vm.runInContext(fs.readFileSync(path.join(PUB, 'sim.js'), 'utf8'), g, { filename: 'sim.js' });
  return g.RL;
}
const RL = load(), W = RL.World, IN = RL.IN, TILE = 20, PH = RL.PH;
const AB = ['dash', 'grip', 'puff', 'glow', 'beam'];

/* one Sim per room+context, reused for every macro */
function makeCtx(id, ab, opened, calm) {
  const save = RL.Sim.newSave(9, false); save.started = 1; save.spot = { room: id, x: 100, y: 100 };
  for (const a of ab) save.ab[a] = 1;
  Object.assign(save.calm, calm || {});
  for (const k of opened) save.open[k] = 1;
  const def = W.rooms[id];
  /* breakable walls: open */
  let bi = 0; for (let y = 0; y < def.map.length; y++) for (let x = 0; x < def.map[0].length; x++) { /* keys are per group; mark generously */ }
  for (let k = 0; k < 20; k++) save.broke[id + ':b' + k] = 1; void bi;
  const sim = new RL.Sim({ save });
  sim.enterRoom(id, 100, 100, {});
  const r = sim.room;
  r.foes = []; r.hazards = []; r.shots = []; r.drops = [];
  /* seal/arena/calm gates by context */
  /* the sim's own gate rules (the guardian calmed or not by context), with arenas open (a fight is assumed won) */
  if (def.guardian) { const G = { knot: 'dash', boiler: 'grip', cloud: 'puff' }[def.guardian]; r.guard = { kind: def.guardian, done: !!save.calm[def.guardian], awake: false }; if (G && save.calm[def.guardian]) save.ab[G] = 1; }
  r.updateGates(save, true); r.guard = null;
  for (const g of r.gates) { if (g.kind === 'arena') g.shut = false; g.o = g.shut ? 0 : 1; }
  r.briar.fill(ab.includes('glow') ? 1 : 0);
  let exit = null;
  sim.hooks.door = (p, to) => { exit = { to, x: p.x, y: p.y }; return false; };
  const p = sim.players[0];
  return { sim, r, p, def, getExit: () => exit, clearExit: () => { exit = null; }, ab };
}
function resetP(c, x, y, vx, vy) {
  const p = c.p; Object.assign(p, { x, y, vx: vx || 0, vy: vy || 0, ground: false, st: 'idle', at: 0, wall: 0, dashT: 0, dashCd: 0, airDash: true, airPuff: true, rise: vy < 0 ? 2 : 0, coyote: 0, buffer: 0, lock: 0, dropT: 0, inv: 0, leaves: 99, maxLeaves: 99, setback: 0, swing: null, swingCd: 0, in: 0, prev: 0, ride: null, focus: 0, alive: true, beamCd: 0, puffT: 99 });
  c.r.crumble.clear(); c.clearExit();
}
function physTick(c) {
  const s = c.sim, r = c.r; s.t++; s.events = [];
  for (const v of r.vents) { v.t = (v.t + 1) % 260; v.on = v.t >= 130; }
  for (const w of r.wind) w.on = w.gust ? Math.max(0, Math.min(1, Math.sin(s.t * Math.PI * 2 / 330) * 2.2 + 0.6)) : 1;
  for (const [i, st] of r.crumble) { st.t++; if (st.st === 'shake' && st.t > 30) { st.st = 'gone'; st.t = 0; } else if (st.st === 'gone' && st.t > 180) r.crumble.delete(i); }
  s.stepPlats();
  s.stepPlayer(c.p);
}
const PHASES = c => (c.r.vents.length || c.r.plats.length || c.r.wind.some(w => w.gust)) ? [0, 70, 140, 210] : [0];
/* ---------- macros: f(t, p, m) -> input mask; m is scratch ---------- */
function macros(ab) {
  const L = [];
  for (const d of [-1, 1]) {
    const D = d < 0 ? IN.L : IN.R;
    L.push({ name: 'walk' + d, walk: true, f: () => D });
    for (const run of [0, 10]) for (const h of [3, 40]) for (const air of ['full', 'late', 'early']) {
      L.push({ name: 'jump' + d + '/' + run + '/' + h + '/' + air, f: (t, p, m) => {
        let k = 0; if (t < run) return D; const u = t - run;
        if (u === 0) { m.j = 1; return IN.JUMP | (air === 'late' ? 0 : D); }
        if (u < h) k |= IN.JUMP;
        if (air === 'full' || (air === 'late' && p.vy > -1) || (air === 'early' && p.vy < -1)) k |= D;
        return k;
      } });
    }
    L.push({ name: 'up' + d, f: (t, p) => t === 0 ? IN.JUMP : (t < 40 ? IN.JUMP : 0) | (t > 14 ? D : 0) });
    /* walk off a ledge one way, then steer back under it (onto a ledge below, into a side passage) */
    const B = d < 0 ? IN.R : IN.L;
    for (const wait of [0, 8, 20]) L.push({ name: 'off' + d + '/' + wait, maxT: 260, f: (t, p, m) => { if (!m.off) { if (!p.ground && t > 1) m.off = t; return D; } return t - m.off >= wait ? B : 0; } });
    L.push({ name: 'drop' + d, f: t => t === 0 ? IN.D : t === 1 ? IN.D | IN.JUMP : t > 6 ? D : 0 });
    const stroke = (t, p) => (!p.swim && p.vy < 0) ? IN.JUMP : (t % 8 < 3 ? IN.JUMP : 0);   /* pulse in the water, hold the jump out of it */
    L.push({ name: 'swim' + d, maxT: 300, f: (t, p) => D | stroke(t, p) });
    for (const dive of [40, 90, 160]) L.push({ name: 'dive' + d + '/' + dive, maxT: 420, f: (t, p) => D | (t < dive ? IN.D : stroke(t, p)) });
    L.push({ name: 'wait' + d, maxT: 280, wait: true, f: t => t > 150 ? D : 0 });
    if (ab.includes('dash')) {
      L.push({ name: 'gdash' + d, f: t => D | (t === 0 ? IN.DASH : 0) });
      for (const when of ['apex', 'early', 'late']) L.push({ name: 'jdash' + d + when, f: (t, p, m) => { let k = D; if (t < 40) k |= IN.JUMP; if (!m.d && t > 2 && ((when === 'apex' && p.vy > -0.6) || (when === 'early' && t === 6) || (when === 'late' && p.vy > 3))) { m.d = 1; k |= IN.DASH; } return k; } });
      L.push({ name: 'walkdash' + d, f: (t, p, m) => { let k = D; if (!p.ground && !m.d && t > 1) { m.d = 1; k |= IN.DASH; } return k; } });
    }
    if (ab.includes('puff')) {
      for (const air of ['full', 'late']) L.push({ name: 'puff' + d + air, f: (t, p, m) => { let k = (air === 'full' || p.vy > -1 || m.p) ? D : 0; if (t < 30) k |= IN.JUMP; if (!m.p && t > 4 && p.vy > -0.8) { if (!m.r) { m.r = t; return k & ~IN.JUMP; } m.p = 1; k |= IN.JUMP; m.pt = t; } if (m.p && t - m.pt < 30) k |= IN.JUMP; return k; } });
      if (ab.includes('dash')) L.push({ name: 'puffdash' + d, f: (t, p, m) => { let k = D; if (t < 30) k |= IN.JUMP; if (!m.p && t > 4 && p.vy > -0.8) { if (!m.r) { m.r = t; return k & ~IN.JUMP; } m.p = 1; k |= IN.JUMP; m.pt = t; } if (m.p && t - m.pt < 30) k |= IN.JUMP; if (m.p && !m.d && t - m.pt > 14) { m.d = 1; k |= IN.DASH; } return k; } });
    }
    if (ab.includes('grip')) for (const cycles of [1, 2, 3, 5, 8, 14, 24]) for (const end of ['over', 'away']) {
      L.push({ name: 'climb' + d + '/' + cycles + end, maxT: 60 + cycles * 30, f: (t, p, m) => {
        m.c = m.c || 0;
        if (m.c >= cycles) { /* done climbing: go over the top, or spring away */
          if (end === 'over') return D | (p.wall ? (t % 2 ? IN.JUMP : 0) : (p.vy < 0 ? IN.JUMP : 0));
          if (!m.away) { if (p.wall) { m.away = t; return IN.JUMP | (d < 0 ? IN.R : IN.L); } return D; }
          return IN.JUMP | (d < 0 ? IN.R : IN.L);
        }
        if (p.wall) { if (!m.on) { m.on = 1; m.since = 0; return 0; } m.on = 0; m.c++; return IN.JUMP; }
        m.since = (m.since || 0) + 1;
        if (p.ground) return D | (t % 2 ? IN.JUMP : 0);
        return IN.JUMP | (m.since > 6 ? D : 0);
      } });
    }
    if (ab.includes('dash') && ab.includes('puff') && ab.includes('grip')) L.push({ name: 'pogo' + d, f: (t, p, m) => { let k = D; if (t < 40) k |= IN.JUMP; if (p.vy > 1) { k |= IN.D; if (t % 16 === 0) k |= IN.SWING; } return k; } });
  }
  return L;
}
/* ---------- explore one room from its entries ---------- */
function thingCells(def) {
  const out = [];
  def.map.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if ('ALVNCGWPhy'.includes(ch)) out.push({ ch, x, y, key: def.id + ':' + ch + x + ',' + y }); } });
  return out;
}
function explore(id, ab, opened, calm, opts) {
  opts = opts || {};
  const c = makeCtx(id, ab, opened, calm), def = c.def, doors = plan.doors[id], things = thingCells(def);
  const M = macros(ab), phases = PHASES(c);
  /* arriving in mid-air (through a floor or ceiling hole): also try to climb, puff or drift there */
  const airMacs = M.filter(m => /^climb/.test(m.name) || /^puff/.test(m.name) || /^jdash.*apex/.test(m.name));
  const doorOf = (x, y) => { /* which planned doorway a position just outside the room belongs to */
    const tx = Math.floor(x / TILE), ty = Math.floor((y - 13) / TILE); let best = -1, bd = 1e9;
    doors.forEach((d, i) => { let dd; if (d.side === 'W' || d.side === 'E') { if ((d.side === 'W') !== (x < c.r.pw / 2)) return; dd = ty < d.at ? d.at - ty : ty >= d.at + d.len ? ty - d.at - d.len + 1 : 0; } else { if ((d.side === 'N') !== (y < c.r.ph / 2)) return; dd = tx < d.at ? d.at - tx : tx >= d.at + d.len ? tx - d.at - d.len + 1 : 0; } if (dd < bd) { bd = dd; best = i; } });
    return best;
  };
  /* a node: its exits, things and the nodes it leads to */
  const node = () => ({ exits: new Set(), things: new Set(), to: new Set() });
  const touchThings = (p, into) => {
    for (const th of things) {
      const cx = th.x * TILE + 10, cy = th.y * TILE + 10;
      if (th.ch === 'h') { if (Math.abs(p.x - cx) < 40 && p.y - 26 < cy + 14 && p.y > cy - 34) into.add(th.key); continue; }
      if (th.ch === 'y') { if (ab.includes('beam') && p.ground && Math.abs(p.y - 14 - cy) < 18 && clearRow(c.r, p.x, cx, cy)) into.add(th.key); continue; }
      if (th.ch === 'G') { if (Math.abs(p.x - cx) < 200 && Math.abs(p.y - 13 - cy) < 160) into.add(th.key); continue; }
      if (Math.abs(p.x - cx) < 18 && p.y - 26 < cy + 12 && p.y > cy - 12) into.add(th.key);
    }
  };
  const seen = new Map(), queue = [];
  const keyOf = (x, y) => Math.floor(x / TILE) + ',' + Math.floor((y - 1) / TILE);
  const addState = (x, y) => { const k = keyOf(x, y); if (!seen.has(k)) { seen.set(k, Object.assign(node(), { x, y })); queue.push(k); } return k; };
  /* run from an arrival until standing, leaving or giving up; results go into `into` */
  const settle = (x, y, vx, vy, mask, into) => {
    resetP(c, x, y, vx, vy); let air = 0; const mm = {};
    if (c.r.boxSolid(x - 7, y - 26, x + 7, y - 1)) return;   /* a shut gate (or a wall) right at the doorway */
    for (let t = 0; t < 900; t++) {
      c.p.prev = c.p.in; c.p.in = typeof mask === 'function' ? mask(t, c.p, mm) : mask; physTick(c);
      if (c.sim.events.some(e => e[0] === 'thorn')) return;
      const ex = c.getExit(); if (ex) { const di = doorOf(ex.x, ex.y); if (di >= 0) into.exits.add(di); return; }
      touchThings(c.p, into.things);
      if (!c.p.ground) air++; else if (air > 0 || t > 5) { into.to.add(addState(c.p.x, c.p.y)); return; }
    }
  };
  /* entries */
  const entry = doors.map(() => node());
  doors.forEach((d, i) => {
    if (opts.entries && !opts.entries.includes(i)) return;
    const into = entry[i];
    if (d.side === 'W' || d.side === 'E') { const x = d.side === 'W' ? 12 : c.r.pw - 12, y = (d.at + d.len) * TILE; for (const m of [d.side === 'W' ? IN.R : IN.L, 0]) settle(x, y, 0, 0, m, into); }
    else if (d.side === 'N') { for (let k = 0; k < d.len; k++) { settle((d.at + k) * TILE + 10, 30, 0, 2, 0, into); for (const mac of airMacs) settle((d.at + k) * TILE + 10, 30, 0, 2, mac.f, into); } }
    else { for (let k = 0; k < d.len; k++) { for (const m of [IN.L, IN.R, 0]) settle((d.at + k) * TILE + 10, c.r.ph + 8, 0, -7.2, (t) => m | (t < 30 ? IN.JUMP : 0), into); for (const mac of airMacs) settle((d.at + k) * TILE + 10, c.r.ph + 8, 0, -7.2, mac.f, into); } }
  });
  let startNode = null;
  if (opts.fromXY) { startNode = node(); startNode.to.add(addState(opts.fromXY.x, opts.fromXY.y)); }
  /* breadth first over standing spots, once for every entry */
  let runs = 0;
  while (queue.length) {
    const k = queue.shift(), st = seen.get(k);
    touchThings({ x: st.x, y: st.y, ground: true }, st.things);
    for (const mac of M) for (const ph of phases) {
      if (mac.wait && !c.r.vents.length && !c.r.plats.length) continue;
      if ((mac.name.startsWith('swim') || mac.name.startsWith('dive')) && !nearWater(c.r, st.x, st.y)) continue;
      resetP(c, st.x, st.y, 0, 0); c.p.ground = true; c.sim.t = ph; const mm = {}; let air = 0; runs++;
      const tx0 = Math.floor(st.x / TILE), maxT = mac.maxT || 220;
      for (let t = 0; t < maxT; t++) {
        c.p.prev = c.p.in; c.p.in = mac.f(t, c.p, mm); physTick(c);
        if (c.sim.events.some(e => e[0] === 'thorn')) break;
        const ex = c.getExit(); if (ex) { const di = doorOf(ex.x, ex.y); if (di >= 0) st.exits.add(di); break; }
        touchThings(c.p, st.things);
        if (!c.p.ground) air++;
        else if (mac.walk && (Math.floor(c.p.x / TILE) !== tx0 || air)) { st.to.add(addState(c.p.x, c.p.y)); break; }
        else if (air > 1 && !mac.wait) { st.to.add(addState(c.p.x, c.p.y)); break; }
        else if (mac.wait && t > 150 && air) { st.to.add(addState(c.p.x, c.p.y)); break; }
      }
    }
  }
  /* what each entry reaches: the closure over the standing graph */
  const close = start => {
    const exits = new Map(), reached = new Set(start.things), vis = new Set(), st = [...start.to];
    for (const di of start.exits) exits.set(di, 'entry');
    while (st.length) { const k = st.pop(); if (vis.has(k)) continue; vis.add(k); const n = seen.get(k); for (const di of n.exits) if (!exits.has(di)) exits.set(di, k); for (const th of n.things) reached.add(th); for (const j of n.to) if (!vis.has(j)) st.push(j); }
    return { id, exits, reached, states: vis.size, runs, things };
  };
  const res = { id, runs, states: seen.size, things, byEntry: entry.map(close) };
  if (startNode) res.start = close(startNode);
  return res;
}
function nearWater(r, x, y) { for (let dx = -100; dx <= 100; dx += 20) for (let dy = -40; dy <= 60; dy += 20) if (r.water(x + dx, y + dy)) return true; return false; }
function clearRow(r, x0, x1, y) { const ty = Math.floor(y / TILE); for (let tx = Math.floor(Math.min(x0, x1) / TILE) + 1; tx < Math.floor(Math.max(x0, x1) / TILE); tx++) if (r.solid(tx, ty)) return false; return true; }

/* ---------- the whole world, in story order ---------- */
function world() {
  const t0 = Date.now();
  const ab = new Set(), calm = {}, opened = new Set();
  const GIVE = { knot: 'dash', boiler: 'grip', cloud: 'puff' };
  const cache = new Map();
  const ctxKey = id => id + '|' + [...ab].sort().join(',') + '|' + (W.rooms[id].guardian ? (calm[W.rooms[id].guardian] ? 'c' : '') : '') + (W.rooms[id].gates || []).includes('seal') * (calm.knot && calm.boiler && calm.cloud ? 1 : 0) + '|' + [...opened].filter(k => k.startsWith(id + ':')).sort().join(',');
  const roomRun = (id, entry) => { const key = ctxKey(id); if (!cache.has(key)) cache.set(key, explore(id, [...ab], [...opened], calm)); return cache.get(key).byEntry[entry]; };
  const startRun = () => { const key = 'START|' + ctxKey(W.start); if (!cache.has(key)) { const c = makeCtx(W.start, [...ab], [...opened], calm); const st = c.r.start || { x: c.r.pw / 2, y: 60 }; cache.set(key, explore(W.start, [...ab], [...opened], calm, { entries: [], fromXY: st })); } return cache.get(key).start; };
  let stage = 0, changed = true, log = [], reachedAll = new Set(), nodes;
  while (changed && stage < 20) {
    changed = false; stage++;
    /* nodes: (room, entry door index); edges: within a room (entry -> exits) and across doorways (exit -> the neighbour's matching door) */
    nodes = new Map(); const q = [];
    const visit = (id, di, from) => { const k = id + '#' + di; if (nodes.has(k)) return; nodes.set(k, { id, di, from, out: [] }); q.push(k); };
    const s0 = startRun();
    for (const th of s0.reached) reachedAll.add(th);
    for (const [di] of s0.exits) { const d = plan.doors[W.start][di]; const back = plan.doors[d.to].findIndex(e => e.to === W.start); visit(d.to, back, 'start'); }
    while (q.length) {
      const k = q.shift(), n = nodes.get(k), res = roomRun(n.id, n.di);
      for (const th of res.reached) reachedAll.add(th);
      for (const [di] of res.exits) { const d = plan.doors[n.id][di]; const back = plan.doors[d.to].findIndex(e => e.to === n.id && (e.side !== d.side)); n.out.push(d.to + '#' + back); visit(d.to, back, k); }
    }
    /* what did we reach? abilities, guardians, levers, switches */
    for (const key of reachedAll) {
      const [id, rest] = key.split(':'), ch = rest[0], def = W.rooms[id];
      if (ch === 'A' && def.ability && !ab.has(def.ability)) { ab.add(def.ability); changed = true; log.push('stage ' + stage + ': ability ' + def.ability + ' in ' + id); }
      if (ch === 'G' && def.guardian && !calm[def.guardian]) { calm[def.guardian] = 1; changed = true; log.push('stage ' + stage + ': guardian ' + def.guardian + ' calmed in ' + id); if (GIVE[def.guardian] && !ab.has(GIVE[def.guardian])) { ab.add(GIVE[def.guardian]); log.push('         -> ' + GIVE[def.guardian]); } }
      if (ch === 'h' || ch === 'y') {
        /* the k-th lever/switch in reading order opens the k-th lever/sun gate */
        const d = def, kinds = d.gates || [], want = ch === 'h' ? 'lever' : 'sun';
        const list = []; d.map.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === ch) list.push(x + ',' + y); });
        const kth = list.indexOf(rest.slice(1)); let gi = -1, n = -1; kinds.forEach((kd, i) => { if (kd === want && ++n === kth) gi = i; });
        const gk = id + ':g' + gi; if (gi >= 0 && !opened.has(gk)) { opened.add(gk); changed = true; log.push('stage ' + stage + ': ' + want + ' gate ' + gk + ' opened'); }
      }
    }
  }
  console.log(log.join('\n'));
  /* report */
  const roomsReached = new Set([...nodes.values()].map(n => n.id)); roomsReached.add(W.start);
  const missRooms = plan.ROOMS.filter(r => !roomsReached.has(r.id)).map(r => r.id);
  const items = []; for (const def of W.list) for (const th of thingCells(def)) if ('ALVNCG'.includes(th.ch)) items.push(th);
  const missItems = items.filter(th => !reachedAll.has(th.key)).map(th => th.key);
  console.log('abilities: ' + [...ab].join(', ') + '   calmed: ' + Object.keys(calm).join(', '));
  console.log('rooms reached: ' + roomsReached.size + '/' + plan.ROOMS.length + (missRooms.length ? '   MISSING: ' + missRooms.join(' ') : ''));
  console.log('items reached: ' + (items.length - missItems.length) + '/' + items.length + (missItems.length ? '   MISSING: ' + missItems.join(' ') : ''));
  /* softlocks: every node must lead back to rg_hub */
  const toHub = new Set(); let grow = true;
  for (const [k, n] of nodes) if (n.id === 'rg_hub') toHub.add(k);
  while (grow) { grow = false; for (const [k, n] of nodes) if (!toHub.has(k) && n.out.some(o => toHub.has(o))) { toHub.add(k); grow = true; } }
  const stuck = [...nodes.keys()].filter(k => !toHub.has(k));
  console.log(stuck.length ? 'NO WAY BACK to Rootgate from (room#entry door): ' + stuck.join(' ') : 'no softlocks: every place leads back to Rootgate');
  console.log('time ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s, room runs ' + cache.size);
  if (missRooms.length || missItems.length || stuck.length || !calm.heart) process.exitCode = 1;
  return { ab, calm, missRooms, missItems, stuck };
}
if (require.main === module) {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (args.length) {
    const id = args[0], ab = args.slice(1);
    const doors = plan.doors[id]; if (!doors) { console.log('no room ' + id); process.exit(1); }
    const t0 = Date.now();
    const all = explore(id, ab, [], { knot: 1, boiler: 1, cloud: 1 });
    doors.forEach((d, i) => {
      const res = all.byEntry[i];
      const ex = [...res.exits.keys()].map(j => doors[j].side + doors[j].at + '>' + doors[j].to);
      console.log('from ' + d.side + d.at + ' (' + d.to + '): ' + res.states + ' spots; exits ' + (ex.join(' ') || 'NONE') + '; things ' + [...res.reached].map(k => k.split(':')[1]).join(' '));
    });
    console.log(((Date.now() - t0) / 1000).toFixed(1) + ' s');
  } else world();
}
module.exports = { explore, world };
