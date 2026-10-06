/* ROOTLIGHT — net.js (NET). Two players online, each on their own screen, in one garden (the host's save).
   The parent link (postMessage to and from our own parent page, same origin only), strict checks on everything that arrives,
   the interpolation clock (Sprout Kart's / Berry Breeze's Interp), RTT, and the online game itself through RL.Main.hooks.
   The parent (the planet's rootlightRoom, or docs/rootlight/test/net.html) only carries strings between the two browsers.

   Who does what. The HOST (SPRIG) runs the world: glooms, guardians, shots, hazards, dew, doors, pickups, gates, the save.
   Each player OWNS their own sprout: the GUEST (MARIGOLD) moves its own sprout in its own sim with the same physics (no input
   lag) and sends its state; the host draws it from interpolated states. The guest draws the host's sprout and the whole room
   from the host's snapshots, interpolated. The victim decides: the guest checks its own touches (glooms, shots, hazards,
   thorns) against the room as it sees it, and keeps its own leaves; it revives itself when the host touches its seed bubble.
   The guest ASKS for everything that changes the world (a swing that touched a gloom, a bud, a dew cluster, a breakable wall,
   a lever, a sun switch, a pickup, a doorway, a Watering Spot): asks carry a seq and ride in every message until acked.
   Room changes come from the host. When the host walks through a doorway the guest follows after a short countdown; when the
   guest does, it waits at the door and the host follows after the countdown. The host keeps a reliable log of what changed
   in the room (blooms, buds, pickups, levers, switches, breaks, rests, wakes, cards) resent until the guest acks it, sends
   cosmetic events (sounds and sparkles) for 300-800 ms, and the whole save, in chunks, whenever it changes.

   Wire (v = PROTO 1, JSON, numbers only except room ids and keys, each message at most 6000 characters):
     host → guest  {k:'s', v, t, ht, hh, rv, rm, st, sv, P:[player], F:[[foe]...], G:[guardian]|0, Z:[[hazard]...], S:[[shot]...],
                    D:[[x,y]...], gs (shut gates bitmask), L:[[seq, type, ...]...], E:[[seq, code, x, y, a]...], a (asks done)}
                    every 2 ticks on the direct link (30 Hz), 3 on the relay (20 Hz)
                   {k:'w', v, t, ht, hh, sc}   the host is on its menus (4 Hz)
                   {k:'v', v, t, ht, hh, sv, i, n, d}   one chunk of the save (JSON text) of version sv
     guest → host  {k:'g', v, t, ht, hh, rv, P:[player]|0, q:[[seq, type, ...]...], la (last log seq applied), sv (save version held)}
     either        {k:'bye'} (sent by the parent room when someone leaves)
   t = the sender's tick; ht / hh = the newest t heard from the other side and how many ms ago: RTT both ways (posted each second).
   A different v: "Refresh the page to play together". 10 s of silence: "<opp> went quiet: SPACE to play on alone". */
'use strict';
(function () {
const RL = window.RL = window.RL || {};
const PROTO = 1, MAXMSG = 6000, TICK = 1000 / 60, I31 = 2147483647;
const C = { everyRtc: 2, everyAbly: 3, idle: 15, dRtc: [50, 220], dAbly: [130, 400], evTtlRtc: 300, evTtlAbly: 800, quiet: 10000, extra: 100, follow: 70, saveEvery: 90 };
const now = () => performance.now();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const isI = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isN = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;
const ri = v => { v = Math.round(+v); return Number.isFinite(v) ? clamp(v, -1e8, 1e8) : 0; };
const isId = s => typeof s === 'string' && s.length <= 40 && /^[\w:,.*\-]*$/.test(s);   /* room ids and keys (dew clusters are 'room:*0') */

/* ---------- names ↔ numbers ---------- */
const PST = ['idle', 'run', 'jump', 'fall', 'cling', 'dash', 'focus', 'hurt', 'faint', 'bubble', 'sit', 'swim', 'enter'];
const FK = ['smog', 'thorn', 'drip', 'cog', 'lantern', 'knight'];
const FST = ['drift', 'push', 'roll', 'rush', 'hang', 'shake', 'fall', 'ooze', 'walk', 'wind', 'charge', 'dizzy', 'idle', 'glow', 'puff', 'block', 'ready', 'shove', 'rest'];
const GK = ['knot', 'boiler', 'cloud', 'heart'];
const GST = ['sleep', 'wake', 'idle', 'hopTell', 'hop', 'land', 'lashTell', 'lash', 'burrTell', 'burr', 'tired', 'calm', 'walk', 'ventTell', 'vent', 'boltTell', 'bolt', 'slamTell', 'slam', 'drift', 'rainTell', 'rain', 'zapTell', 'zap', 'gustTell', 'gust', 'sweepTell', 'sweep', 'orbTell', 'orb', 'summon', 'dropTell', 'drop', 'shed'];
const HK = ['spike', 'zap', 'steam', 'slam', 'rain', 'vine', 'shock'];
const SK = ['spore', 'burr', 'bolt', 'drop', 'orb', 'beam', 'petal'];
const SW = ['f', 'u', 'd'];
/* cosmetic events the host passes on (sound and sparkle only) */
const KF = { hit: 1, bloom: 1, ghit: 1, gtell: 1, pop: 1, calm: 1, gstart: 1, gphase: 1, hazard: 1, bonk: 1, gate: 1 };
const EVN = ['hit', 'bloom', 'bud', 'crack', 'break', 'lever', 'switch', 'gate', 'splash', 'vent', 'spore', 'charge', 'wind', 'rain', 'zap', 'slam', 'rumble', 'gtell', 'ghit', 'calm', 'gstart', 'pop', 'block', 'drip', 'splat', 'clunk', 'ready', 'shove', 'hop', 'stomp', 'throw', 'summon', 'hazard', 'bonk', 'dew', 'gphase', 'jump', 'swing', 'dash', 'puff', 'land', 'beam', 'hurt', 'heal', 'walljump', 'cling'];

/* ---------- packing ---------- */
function packP(p, rv) {
  const sw = p.swing;
  return [ri(p.x * 4), ri(p.y * 4), ri(p.vx * 16), ri(p.vy * 16), p.face < 0 ? -1 : 1, Math.max(0, PST.indexOf(p.st)), clamp(p.at | 0, 0, 9999),
    sw ? SW.indexOf(sw.dir) : -1, sw ? clamp(sw.t | 0, 0, 99) : 0, sw ? clamp(sw.reach | 0, 0, 99) : 0, clamp(p.leaves | 0, 0, 99), clamp(p.maxLeaves | 0, 0, 99),
    clamp(p.sun | 0, 0, 999), clamp(p.sunMax | 0, 0, 999), clamp(p.inv | 0, 0, 999), ri((p.focus || 0) * 100), clamp(p.dashT | 0, 0, 99), clamp(p.puffT | 0, 0, 99),
    p.wall | 0, p.alive ? 1 : 0, p.bubble ? 1 : 0, p.swim ? 1 : 0, clamp(rv | 0, 0, I31)];
}
const PN = 23;
function okP(a) { if (!Array.isArray(a) || a.length !== PN) return false; for (let i = 0; i < PN; i++) if (!isI(a[i], -1e8, 1e8)) return false; return isI(a[4], -1, 1) && isI(a[5], 0, PST.length - 1) && isI(a[7], -1, 2) && isI(a[18], -1, 1); }
function unpackP(p, a) {
  p.x = a[0] / 4; p.y = a[1] / 4; p.vx = a[2] / 16; p.vy = a[3] / 16; p.face = a[4] || 1; p.st = PST[a[5]]; p.at = a[6];
  p.swing = a[7] >= 0 ? { dir: SW[a[7]], t: a[8], reach: a[9], hit: new Set() } : null;
  p.leaves = a[10]; p.maxLeaves = a[11]; p.sun = a[12]; p.sunMax = a[13]; p.inv = a[14]; p.focus = a[15] / 100; p.dashT = a[16]; p.puffT = a[17];
  p.wall = a[18]; p.alive = !!a[19]; p.bubble = !!a[20]; p.swim = !!a[21]; p.ground = p.st === 'idle' || p.st === 'run' || p.st === 'focus' || p.st === 'sit';
  return p;
}
function packF(f) { return [f.id | 0, FK.indexOf(f.kind), ri(f.x * 4), ri(f.y * 4), Math.max(0, FST.indexOf(f.st)), clamp(f.t | 0, 0, 9999), f.face < 0 ? -1 : 1, clamp(f.hp | 0, 0, 99), clamp(f.hurt | 0, 0, 99), f.ceil ? 1 : 0, ri((f.vx || 0) * 16), ri((f.vy || 0) * 16), f.temp ? 1 : 0]; }
const okF = a => Array.isArray(a) && a.length === 13 && a.every(v => isI(v, -1e8, 1e8)) && isI(a[1], 0, FK.length - 1) && isI(a[4], 0, FST.length - 1);
function packG(g) { return [GK.indexOf(g.kind), ri(g.x * 4), ri(g.y * 4), clamp(g.hp | 0, -9, 999), clamp(g.maxHp | 0, 0, 999), clamp(g.phase | 0, 1, 3), Math.max(0, GST.indexOf(g.st)), clamp(g.t | 0, 0, 99999), g.face < 0 ? -1 : 1, clamp(g.hurt | 0, 0, 99), ri(g.calm * 1000), g.awake ? 1 : 0, g.done ? 1 : 0, ri((g.squash || 0) * 100), ri((g.spin || 0) * 100), ri((g.heat || 0) * 100), ri((g.door || 0) * 100), ri((g.dark || 0) * 100), ri((g.glow || 0) * 100), g.dir < 0 ? -1 : 1]; }
const okG = a => Array.isArray(a) && a.length === 20 && a.every(v => isI(v, -1e8, 1e8)) && isI(a[0], 0, 3) && isI(a[6], 0, GST.length - 1);
function packZ(h) { return [HK.indexOf(h.kind), ri(h.x * 4), ri(h.y * 4), ri(h.w), ri(h.h), clamp(h.tell | 0, 0, 9999), h.live ? 1 : 0, clamp(h.t | 0, 0, 9999), clamp(h.dur | 0, 0, 9999), ri((h.vx || 0) * 16)]; }
const okZ = a => Array.isArray(a) && a.length === 10 && a.every(v => isI(v, -1e8, 1e8)) && isI(a[0], 0, HK.length - 1);
function packS(s) { return [s.id | 0, SK.indexOf(s.kind), ri(s.x * 4), ri(s.y * 4), ri(s.vx * 16), ri(s.vy * 16), clamp(s.r | 0, 0, 99), clamp(s.t | 0, 0, 9999)]; }
const okS = a => Array.isArray(a) && a.length === 8 && a.every(v => isI(v, -1e8, 1e8)) && isI(a[1], 0, SK.length - 1);

/* ---------- message checks ---------- */
let why = '';
const no = w => { why = w; return false; };
const common = o => (isI(o.v, 0, 999) || no('v')) && (isI(o.t, 0, I31) || no('t')) && (isI(o.ht, -1, I31) || no('ht')) && (isI(o.hh, 0, 600000) || no('hh'));
const okLog = e => Array.isArray(e) && e.length >= 2 && e.length <= 9 && isI(e[0], 1, I31) && isI(e[1], 0, 20) && e.slice(2).every(v => isN(v, -1e8, 1e8) || isId(v));
const okEv = e => Array.isArray(e) && e.length === 5 && isI(e[0], 1, I31) && isI(e[1], 0, EVN.length - 1) && isI(e[2], -1e6, 1e6) && isI(e[3], -1e6, 1e6) && isI(e[4], -1e6, 1e6);
const okAsk = q => Array.isArray(q) && q.length >= 2 && q.length <= 9 && isI(q[0], 1, I31) && isI(q[1], 0, 15) && q.slice(2).every(v => isN(v, -1e8, 1e8) || isId(v));
const valid = {
  snap(o) {
    if (!common(o)) return false;
    for (const k of ['F', 'Z', 'S', 'D', 'L', 'E']) if (o[k] === undefined) o[k] = [];
    if (o.G === undefined) o.G = 0;
    return (isI(o.rv, 0, I31) || no('rv')) && (isId(o.rm) && o.rm.length > 0 || no('rm')) && (isI(o.st, 0, I31) || no('st')) && (isI(o.sv, 0, I31) || no('sv')) &&
      (okP(o.P) || no('P')) && ((Array.isArray(o.F) && o.F.length <= 64 && o.F.every(okF)) || no('F')) && (o.G === 0 || okG(o.G) || no('G')) &&
      ((Array.isArray(o.Z) && o.Z.length <= 32 && o.Z.every(okZ)) || no('Z')) && ((Array.isArray(o.S) && o.S.length <= 96 && o.S.every(okS)) || no('S')) &&
      ((Array.isArray(o.D) && o.D.length <= 80 && o.D.every(d => Array.isArray(d) && d.length === 2 && d.every(v => isI(v, -1e8, 1e8)))) || no('D')) &&
      (isI(o.gs, 0, I31) || no('gs')) && ((Array.isArray(o.L) && o.L.length <= 64 && o.L.every(okLog)) || no('L')) &&
      ((Array.isArray(o.E) && o.E.length <= 64 && o.E.every(okEv)) || no('E')) && (isI(o.a, 0, I31) || no('a'));
  },
  wait(o) { return (common(o) && isI(o.sc, 0, 9)) || no('w'); },
  chunk(o) { return (common(o) && isI(o.sv, 1, I31) && isI(o.n, 1, 64) && isI(o.i, 0, o.n - 1) && typeof o.d === 'string' && o.d.length <= 5000) || no('chunk'); },
  guest(o) {
    if (!common(o)) return false; if (o.q === undefined) o.q = []; if (o.P === undefined) o.P = 0; if (o.b === undefined) o.b = [];
    if (!Array.isArray(o.b) || o.b.length > 4 || !o.b.every(a => Array.isArray(a) && a.length === 4 && a.every(v => isI(v, -1e8, 1e8)))) return no('b');
    return (isI(o.rv, 0, I31) || no('rv')) && (o.P === 0 || okP(o.P) || no('P')) && ((Array.isArray(o.q) && o.q.length <= 48 && o.q.every(okAsk)) || no('q')) && (isI(o.la, 0, I31) || no('la')) && (isI(o.sv, 0, I31) || no('sv'));
  },
  get why() { return why; }
};

/* ---------- Interp: snapshot interpolation on a render clock that never steps (Sprout Kart's net.js, unchanged) ---------- */
class Interp {
  constructor(dMin, dMax, every) { this.dMin = dMin; this.dMax = dMax; this.every = every; this.res = { a: null, b: null, k: 0, held: false, extra: 0 }; this.reset(); }
  reset() { this.gw = []; this.buf = []; this.win = []; this.off = null; this.offAt = 0; this.base = 1; this.rate = 1; this.rw = []; this.lowT = 0; this.highT = 0; this.D = this.dMin; this.rc = null; this.last = 0; this.lastPush = -1e9; this.re = 0; this.dKeep = 0; this.keepTo = 0; this.n = { push: 0, old: 0, resets: 0, at: 0, extra: 0, held: 0 }; }
  clear() { this.buf.length = 0; this.rc = null; }
  range(dMin, dMax) { this.dMin = dMin; this.dMax = dMax; this.D = clamp(this.D, dMin, dMax); this.resetOffset(); this.rw.length = 0; }
  resetOffset() { this.win.length = 0; this.re = 1; this.dKeep = this.D; this.n.resets++; }
  push(r, sample, at) {
    if (at == null) at = now();
    const b = this.buf, n = b.length;
    if (n && r < b[n - 1].r - 60000) { this.reset(); return this.push(r, sample, at); }
    if (n && r <= b[n - 1].r) { this.n.old++; return false; }
    const lat = at - r;
    if (this.off !== null && (at - this.lastPush > 500 || lat < this.cur(at) - 300)) { this.resetOffset(); this.rw.length = 0; }
    this.lastPush = at; this.n.push++;
    const gw = this.gw; if (n) { gw.push(at, r - b[n - 1].r); let q = 0; while (q < gw.length && gw[q] < at - 3000) q += 2; if (q) gw.splice(0, q); }
    b.push({ r, s: sample }); if (b.length > 32) b.shift();
    const w = this.win; w.push(at, lat);
    let i = 0; while (i < w.length && w[i] < at - 3000) i += 2; if (i) w.splice(0, i);
    const v = this.rw; v.push(at, lat); i = 0; while (i < v.length && v[i] < at - 3000) i += 2; if (i) v.splice(0, i);
    const m = v.length >> 1;
    if (m >= 8 && at - v[0] > 1500) {
      let sx = 0, sl = 0; for (let j = 0; j < v.length; j += 2) { sx += v[j]; sl += v[j + 1]; } sx /= m; sl /= m;
      let cxl = 0, cxx = 0; for (let j = 0; j < v.length; j += 2) { const x = v[j] - sx; cxl += x * (v[j + 1] - sl); cxx += x * x; }
      const rt = this.rate = cxx > 0 ? 1 - cxl / cxx : 1;
      if (this.base === 1) { if (rt >= 0.975) this.lowT = 0; else if (!this.lowT) this.lowT = at; else if (at - this.lowT >= 1000) { this.base = clamp(rt, 0.5, 1); this.highT = 0; } }
      else if (rt <= 0.985) { this.highT = 0; this.base = clamp(rt, 0.5, 1); } else if (!this.highT) this.highT = at; else if (at - this.highT >= 1000) { this.base = 1; this.lowT = 0; }
    }
    const dr = 1 - this.base; let off = 1e12, rmin = 1e12; const L = [];
    for (let j = 0; j < w.length; j += 2) { const l = w[j + 1] + dr * (at - w[j]); L.push(l); if (w[j] >= at - 2000 && l < off) off = l; if (w[j] >= at - 500 && l < rmin) rmin = l; }
    if (this.off !== null && this.re === 0 && rmin - off > 300 && w[0] < at - 500) { this.resetOffset(); w.length = 0; w.push(at, lat); L.length = 0; L.push(lat); off = lat; }
    this.off = off; this.offAt = at;
    L.sort((x, y) => x - y);
    const spread = L[Math.min(L.length - 1, Math.floor(L.length * 0.95))] - L[0];
    let gap = this.every() * TICK;
    if (gw.length >= 20) { const G = []; for (let j = 1; j < gw.length; j += 2) G.push(gw[j]); G.sort((x, y) => x - y); gap = Math.max(gap, G[Math.floor(G.length * 0.9)]); }
    let D = clamp(spread + gap + 8, this.dMin, this.dMax);
    if (this.re === 1) { this.re = 2; this.keepTo = at + 1000; }
    if (at < this.keepTo) D = Math.max(D, clamp(this.dKeep, this.dMin, this.dMax));
    this.D = D;
    return true;
  }
  at(t) {
    if (t == null) t = now();
    const b = this.buf, n = b.length; if (!n || this.off === null) return null;
    const target = t - this.cur(t) - this.D;
    if (this.rc === null || (this.re === 2 && (this.rc > target + 50 || this.rc < target - 300))) this.rc = target;
    else { const dt = Math.max(0, t - this.last), m = 0.05 * dt * this.base; let rc = this.rc + dt * this.base; const e = target - rc; rc += e > m ? m : e < -m ? -m : e; this.rc = rc; }
    if (this.re === 2) this.re = 0;
    this.last = t; this.n.at++;
    const rc = this.rc, nw = b[n - 1], o = this.res;
    if (rc >= nw.r) {
      const extra = rc - nw.r; o.extra = extra; o.held = extra > C.extra; if (extra > 0) this.n.extra++; if (o.held) this.n.held++;
      if (n < 2) { o.a = o.b = nw.s; o.k = 0; return o; }
      const a = b[n - 2]; o.a = a.s; o.b = nw.s; o.k = 1 + Math.min(extra, C.extra) / (nw.r - a.r); return o;
    }
    o.held = false; o.extra = 0;
    if (rc <= b[0].r) { o.a = o.b = b[0].s; o.k = 0; return o; }
    let i = n - 2; while (i > 0 && b[i].r > rc) i--;
    const a = b[i], c = b[i + 1]; o.a = a.s; o.b = c.s; o.k = (rc - a.r) / (c.r - a.r); return o;
  }
  cur(t) { return this.off + (1 - this.base) * (t - this.offAt); }
}

/* ---------- RTT ---------- */
const sentT = new Int32Array(256).fill(-1), sentMs = new Float64Array(256);
let lastRT = -1, lastRAt = 0, rttPostAt = 0;
function heard(o, at) {
  if (o.t > lastRT || o.t < lastRT - 3600) { lastRT = o.t; lastRAt = at; }
  if (o.ht >= 0 && sentT[o.ht & 255] === o.ht) { const s = at - sentMs[o.ht & 255] - o.hh; if (s >= 0 && s < 10000) Net.rtt = Net.rtt ? Net.rtt * 0.8 + s * 0.2 : s; }
}
const S = { inN: 0, inB: 0, outN: 0, outB: 0, bad: 0, big: 0, old: 0, max: { s: 0, w: 0, v: 0, g: 0 }, t0: 0, rate: '' };
function meterTick(t) { if (t - S.t0 < 1000) return; const k = 1000 / (t - S.t0); S.rate = Math.round(S.inN * k) + '/s ' + Math.round(S.inB / Math.max(1, S.inN)) + ' B in · ' + Math.round(S.outN * k) + '/s ' + Math.round(S.outB / Math.max(1, S.outN)) + ' B out'; S.inN = S.inB = S.outN = S.outB = 0; S.t0 = t; }

/* ---------- incoming: only from our own parent page, same origin ---------- */
let cb = null; const early = [];
function handle(m, at) {
  switch (m.ty) {
    case 'link': link(m); break;
    case 'net': if (typeof m.d === 'string') recv(m.d, at); break;
    case 'peer': if (m.left) peerLeft(); break;
    case 'mute': if (cb.onMute) cb.onMute(!!m.on); break;
    case 'music': if (cb.onMusic) cb.onMusic(!!m.on); break;
  }
}
addEventListener('message', e => {
  if (parent === window || e.source !== parent || e.origin !== location.origin) return;
  const m = e.data; if (!m || typeof m !== 'object' || typeof m.ty !== 'string') return;
  const at = now();
  if (!cb) { if (early.length < 16) early.push([m, at]); return; }
  try { handle(m, at); } catch (er) { console.error('[rootlight net]', er); }
});
function recv(d, at) {
  if (!online || d.length > MAXMSG) return;
  let o = null; try { o = JSON.parse(d); } catch (_) { o = null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) { S.bad++; return; }
  if (o.k === 'bye') { peerLeft(); return; }
  const kinds = Net.role === 'guest' ? ['s', 'w', 'v'] : ['g'];
  if (kinds.indexOf(o.k) < 0) { S.bad++; return; }
  if (o.v !== PROTO) { if (Number.isInteger(o.v)) { Net.lastIn = at; if (!verBad) { verBad = true; console.warn('[rootlight net] the other side runs version ' + o.v + ', this page ' + PROTO); } } return; }
  const ok = o.k === 's' ? valid.snap(o) : o.k === 'w' ? valid.wait(o) : o.k === 'v' ? valid.chunk(o) : valid.guest(o);
  if (!ok) { S.bad++; if (S.bad < 4 || Net.debug) console.warn('[rootlight net] dropped a bad message: ' + why); return; }
  S.inN++; S.inB += d.length; Net.lastIn = at; heardAny = true;
  if (S.max[o.k] !== undefined && d.length > S.max[o.k]) S.max[o.k] = d.length;
  heard(o, at); o._at = at;
  if (o.k === 'g') onGuest(o); else if (o.k === 's') onSnap(o); else if (o.k === 'v') onChunk(o); else onWait(o);
}

/* =====================================================================================================================
   THE ONLINE GAME
   ===================================================================================================================== */
let M = null, ut = 0, online = false, heardAny = false, verBad = false, quiet = false, toastL = null, toastAt = -1e9, follow = null;
const every = () => Net.mode === 'ably' ? C.everyAbly : C.everyRtc;
const rangeFor = () => Net.mode === 'ably' ? C.dAbly : C.dRtc;
function toast(a, b) { toastL = b ? [a, b] : [a]; toastAt = ut; }
function send(o) {
  o.v = PROTO; o.t = ut;
  sentT[ut & 255] = ut; sentMs[ut & 255] = now();
  o.ht = lastRT; o.hh = lastRT < 0 ? 0 : Math.min(600000, Math.round(now() - lastRAt));
  return Net.send(o);
}
const T = { asksSent: 0, asksDone: 0, logSent: 0, logIn: 0, rooms: 0, saves: 0, follows: 0, solo: '' };
const opp = () => Net.opp || 'your friend';
const sim = () => M && M.sim;

/* ---------- HOST ---------- */
let gIt = null, lastAsk = 0, asksIn = [], lastSend = -99, lastIdle = -99, logSeq = 0, log = [], guestLa = 0, saveVer = 0, saveSent = -1, saveAt = -999, saveDirty = true, hostRv = -1, gRv = -1;
const evQ = { seq: 0, q: [] };
function evAdd(code, x, y, a) { const e = [++evQ.seq, code, ri(x), ri(y), ri(a)]; evQ.q.push({ at: now(), e, n: 26 }); if (evQ.q.length > 64) evQ.q.shift(); }
function evPending(t) {
  const ttl = Net.mode === 'ably' ? C.evTtlAbly : C.evTtlRtc, q = evQ.q;
  let i = 0; while (i < q.length && t - q[i].at > ttl) i++; if (i) q.splice(0, i);
  return q.slice(-40).map(x => x.e);
}
function logAdd(type, ...a) { log.push([++logSeq, type, ...a]); if (log.length > 64) log.shift(); T.logSent++; }
function hostSetup(s) {
  s.ext[1] = true;
  const g = s.players[1]; g.alive = true;
  if (!gIt) gIt = new Interp(rangeFor()[0], rangeFor()[1], every);
  const H = s.hooks;
  /* the guest's sprout here is drawn from its states; it never touches anything on this screen */
  H.pre = () => hostPre(s);
  H.post = () => hostPost(s);
}
function hostPre(s) {
  if (s.rv !== hostRv) { hostRv = s.rv; log = []; gIt.clear(); T.rooms++; saveDirty = true; }
  const g = s.players[1];
  const r = gIt.at(now());
  if (r && r.a[22] === s.rv && r.b[22] === s.rv) applyP(g, r.a, r.b, r.k);
  else if (r && r.b[22] === s.rv) unpackP(g, r.b);
  else { /* the guest is still on its way into this room */ const h = s.players[0]; g.x = h.x - 16 * h.face; g.y = h.y; g.st = 'enter'; }
  /* asks, in order */
  for (const q of asksIn) doAsk(s, q);
  asksIn.length = 0;
  /* the guest went through a doorway: we follow after the countdown */
  if (follow && follow.host) { follow.t++; if (follow.t >= C.follow) { const f = follow; follow = null; doFollow(s, f); } }
}
function doAsk(s, q) {
  const r = s.room, G = s.players[1], type = q[1]; T.asksDone++;
  if (q.rv !== undefined && q.rv !== s.rv && type !== 7) return;
  if (type === 0) { const f = r.foes.find(f => f.id === q[2] && f.alive); if (f) s.hitFoe(f, clamp(q[3] | 0, 1, 3), G, +q[4] || G.x); }
  else if (type === 1) { if (r.guard) s.hitGuard(r.guard, clamp(q[2] | 0, 1, 3), G); }
  else if (type === 2) { const b = r.buds.find(b => b.id === q[2] && !b.open); if (b) s.openBud(b); }
  else if (type === 3) { const it = r.items.find(i => i.id === q[2] && i.kind === 'cluster' && !i.got); if (it) s.hitCluster(it); }
  else if (type === 4) { const b = r.breaks.find(b => b.n === q[2] && b.hp > 0); if (b) s.hitBreak(b); }
  else if (type === 5) { const l = r.levers.find(l => l.n === q[2] && !l.on); if (l) s.pullLever(l); }
  else if (type === 6) { const it = r.items.find(i => (i.key || i.id) === q[2] && !i.got && i.kind !== 'cluster'); if (it) s.pickup(G, it); }
  else if (type === 7) { if (!follow && W().rooms[q[2]] && q[2] !== s.room.id) { follow = { host: true, t: 0, to: q[2], x: +q[3], y: +q[4], vx: +q[5], vy: +q[6], face: q[7] < 0 ? -1 : 1, dy: q[8] | 0 }; toast(opp() + ' went on ahead', 'following…'); } }
  else if (type === 8) { const sp = r.spots[0]; if (sp) s.rest(G, sp); }
  else if (type === 9) { const sw = r.switches.find(x => x.n === q[2] && !x.on); if (sw) s.flipSwitch(sw); }
  else if (type === 10) { const sh = r.shots.find(x => x.id === q[2] && !x.dead); if (sh) { sh.dead = true; s.ev('pop', sh.kind, sh.x, sh.y); } }
}
function doFollow(s, f) {
  const d = W().rooms[f.to], pw = d.cw * 16 * 20, x = clamp(f.x, 12, pw - 12);   /* a step inside the doorway, never on its edge */
  const G = s.players[1]; G.x = x; G.y = f.y; G.vx = f.vx; G.vy = f.vy; G.face = f.face;
  s.changeRoom(f.to, x, f.y, G, { vx: f.dy ? 0 : f.vx * 0.5, vy: f.dy < 0 ? f.vy : 0, face: f.face, dy: f.dy });
  T.follows++;
}
const W = () => RL.World;
function hostPost(s) {
  if (s.saveDirty) { s.saveDirty = false; saveDirty = true; }   /* charms worn, Gentle switched */
  if (s.rv !== hostRv) { hostRv = s.rv; log = []; if (gIt) gIt.clear(); T.rooms++; saveDirty = true; }
  const r = s.room;
  for (const e of s.events) {
    const n = e[0], code = EVN.indexOf(n);
    /* the room's lasting changes go in the log */
    if (n === 'bloom') logAdd(0, e[8] | 0, ri(e[5]), ri(e[6]), e[7] ? 1 : 0, e[4] | 0, e[9] ? 1 : 0);   /* [bloom, kind, x, y, flower kind, fx, fy, ceil, id, temp] */
    else if (n === 'bud') logAdd(1, ri(e[3]), ri(e[4]), e[5] ? 1 : 0);   /* [bud, x, y, bx, by, ceil] */
    else if (n === 'lever') { const l = r.levers.find(l => l.x === e[1] && l.y === e[2]); if (l) logAdd(3, l.n); }
    else if (n === 'switch') { const sw = r.switches.find(x => x.x === e[1] && x.y === e[2]); if (sw) logAdd(4, sw.n); }
    else if (n === 'rest') logAdd(6);
    else if (n === 'wake') logAdd(7);
    else if (n === 'get') logAdd(8, String(e[1]), typeof e[2] === 'string' ? e[2] : ri(e[2]), e[3] | 0);
    else if (n === 'calm') { logAdd(9, GK.indexOf(e[1])); }
    else if (n === 'ending') logAdd(11);
    if (n === 'autosave' || n === 'bloom' || n === 'bud' || n === 'pickup' || n === 'dew' || n === 'get' || n === 'buy') saveDirty = true;
    if (code >= 0 && n !== 'jump' && n !== 'swing' && n !== 'dash' && n !== 'puff' && n !== 'land' && n !== 'walljump' && n !== 'cling' && n !== 'hurt' && n !== 'heal' && n !== 'beam') {
      const kf = KF[n], o = n === 'dew' ? 2 : kf ? 2 : 1, num = v => typeof v === 'number' ? v : 0;
      evAdd(code, num(e[o]), num(e[o + 1]), num(e[o + 2]));
    } else if (code >= 0 && e[1] === 0) evAdd(code, s.players[0].x, s.players[0].y, -1);   /* the host's own moves: sounds near it */
  }
  /* things removed (pickups, clusters, breaks) */
  const gotNow = new Set(r.items.map(i => i.key || i.id)); for (const k of r._items || []) if (!gotNow.has(k)) logAdd(2, k); r._items = [...gotNow];
  const brNow = new Set(r.breaks.map(b => b.n)); for (const k of r._breaks || []) if (!brNow.has(k)) logAdd(5, k); r._breaks = [...brNow];
  for (const it of r.items) if (it.kind === 'ability' && !it.logged && it.rise) { it.logged = 1; logAdd(10, 'ability', it.id, it.key, ri(it.x), ri(it.y)); }
  if (ut - lastSend >= every()) sendSnap(s);
  if (saveDirty && ut - saveAt >= C.saveEvery) sendSave(s);
}
function sendSnap(s) {
  lastSend = ut;
  const r = s.room; let gs = 0; r.gates.forEach((g, i) => { if (g.shut && i < 30) gs |= 1 << i; });
  const pend = log.filter(e => e[0] > guestLa).slice(0, 40);   /* oldest first: the guest applies them in order */
  const o = { k: 's', rv: s.rv, rm: r.id, st: s.t, sv: saveVer, P: packP(s.players[0], s.rv), F: r.foes.filter(f => f.alive).slice(0, 60).map(packF), G: r.guard ? packG(r.guard) : 0,
    Z: r.hazards.slice(0, 30).map(packZ), S: r.shots.filter(x => x.kind !== 'beam' || x.own === 0).slice(0, 90).map(packS), D: r.drops.slice(0, 70).map(d => [ri(d.x * 4), ri(d.y * 4)]), gs, L: pend, E: evPending(now()), a: lastAsk };
  if (!send(o)) { o.E = []; o.S = o.S.slice(0, 20); o.D = []; send(o); }
}
function sendSave(s) {
  saveDirty = false; saveAt = ut; saveVer++;
  const txt = JSON.stringify(s.save), n = Math.ceil(txt.length / 4800) || 1;
  for (let i = 0; i < n; i++) send({ k: 'v', sv: saveVer, i, n, d: txt.slice(i * 4800, (i + 1) * 4800) });
  T.saves++;
}
function onGuest(o) {
  for (const q of o.q.slice().sort((x, y) => x[0] - y[0])) if (q[0] > lastAsk) { lastAsk = q[0]; q.rv = o.rv; asksIn.push(q); }
  guestLa = Math.max(guestLa, o.la);
  if (o.sv < saveVer && saveVer && ut - saveAt > 60) saveDirty = true;   /* it never got the last save: again */
  const s = sim();
  if (o.P && gIt && s && o.P[22] === s.rv) gIt.push(o.t * TICK, o.P, o._at);
  if (s && o.rv === s.rv) for (const a of o.b) { const x = a[0] / 4, y = a[1] / 4; if (!s.room.shots.some(q => q.ghost && Math.abs(q.x - x) < 40 && Math.abs(q.y - y) < 4)) s.room.shots.push({ kind: 'beam', x, y, vx: a[2] / 16, vy: 0, r: a[3], t: 0, life: 20, own: 1, ghost: true, hit: new Set(), dmg: 0 }); }   /* the partner's Sunbeam, to see */
  gRv = o.rv;
}
function applyP(p, A, B, f) {
  unpackP(p, B);
  if (!A || A === B) return;
  const ax = A[0] / 4, ay = A[1] / 4;
  if ((ax - p.x) ** 2 + (ay - p.y) ** 2 > 60 * 60) return;
  f = clamp(f, 0, 1.4); p.x = ax + (p.x - ax) * f; p.y = ay + (p.y - ay) * f;
}

/* ---------- GUEST ---------- */
let vIt = null, newestT = -1, latest = null, gStarted = false, chunks = null, haveSv = 0, la = 0, askSeq = 0, asks = [], sendNow = false, lastGSend = -99, hostSc = -1, curRm = '', curRv = -1, evTop = 0;
const evSeen = new Int32Array(1024).fill(-1), evIn = [];
let pendingSave = null, gotSaveAt = 0, waitDoor = null;
function onChunk(o) {
  if (o.sv <= haveSv) return;   /* an older save than the one we hold */
  if (!chunks || chunks.sv !== o.sv) chunks = { sv: o.sv, n: o.n, parts: new Array(o.n), got: 0 };
  if (chunks.n !== o.n) return;
  if (chunks.parts[o.i] === undefined) { chunks.parts[o.i] = o.d; chunks.got++; }
  if (chunks.got === chunks.n) {
    let save = null; try { save = JSON.parse(chunks.parts.join('')); } catch (_) { save = null; }
    if (save && typeof save === 'object' && !Array.isArray(save)) { pendingSave = save; haveSv = chunks.sv; gotSaveAt = ut; }
    chunks = null;
  }
}
function onWait(o) {
  if (o.t <= newestT && newestT - o.t < 3600) { S.old++; return; }
  newestT = o.t; hostSc = o.sc;
  if (M.screen === 'play' && gStarted) { const g = sim(); if (g && g.ending) M.go('ending'); else M.quitToTitle(); gStarted = false; }   /* the host finished: our ending too */
}
function onSnap(o) {
  if (o.t <= newestT && newestT - o.t < 3600) { S.old++; return; }
  if (o.t < newestT) { evSeen.fill(-1); evTop = 0; }
  newestT = o.t; hostSc = -1;
  if (verBad) return;
  if (!vIt) vIt = new Interp(rangeFor()[0], rangeFor()[1], every);
  vIt.push(o.t * TICK, o, o._at);
  latest = o;
  for (const e of o.E) { const s = e[0]; if (s <= evTop - 512 || evSeen[s & 1023] === s) continue; evSeen[s & 1023] = s; if (s > evTop) evTop = s; evIn.push([o.t * TICK, e]); }
  if (evIn.length > 128) evIn.splice(0, evIn.length - 128);
}
/* the guest's world, each tick: start the game, change rooms, apply the room log, draw the host's things */
function guestTick() {
  const L = latest;
  if (pendingSave && !gStarted && L) {
    const save = pendingSave; pendingSave = null;
    M.startGame(save.slot || 1, { save, noSave: true, players: 2 });
    gStarted = true; curRm = ''; curRv = -1; la = 0;
  } else if (pendingSave && gStarted && sim()) {
    const s = sim(), save = pendingSave; pendingSave = null;
    /* keep our own copy in step: abilities, charms, dew; the room is rebuilt only when we change rooms */
    const fixed = RL.Sim.fixSave(save); s.save = fixed; s.applyStats();
  }
}
/* inside the guest's step (so its events reach main): change rooms after the countdown, apply the room log */
function guestRoom(s) {
  const L = latest; if (!L || !gStarted) return false;
  if (L.rm !== curRm || L.rv !== curRv) {
    if (!follow || follow.rv !== L.rv) {
      const fromDoor = waitDoor && waitDoor.to === L.rm;
      follow = { host: false, t: fromDoor ? C.follow : 0, rv: L.rv, rm: L.rm, door: fromDoor ? waitDoor : null };
      if (!fromDoor && curRm) toast(opp() + ' went on ahead', 'following…');
    }
    follow.t++;
    if (follow.t >= C.follow || !curRm) {
      const f = follow; follow = null; waitDoor = null;
      const P = L.P, hx = P[0] / 4, hy = P[1] / 4;
      const x = f.door ? f.door.x : hx, y = f.door ? f.door.y : hy;
      s.enterRoom(L.rm, x, y, {}); s.rv = L.rv; curRm = L.rm; curRv = L.rv; la = 0; s.ext[1] = false;
      const me = s.players[1], pw = s.room.pw; me.x = clamp(x, 12, pw - 12); me.y = y;
      if (!f.door) { me.x = clamp(hx - 16, 12, pw - 12); if (!s.okSpot(me.x, me.y)) me.x = clamp(hx, 12, pw - 12); }
      if (me.alive) {
        if (f.door) { me.vx = f.door.vx; me.vy = f.door.vy; if (f.door.dy < 0) { me.vy = Math.min(me.vy, -7.2); me.rise = 2; } }
        me.inv = Math.max(me.inv, 40); if (me.st === 'enter') s.setSt(me, 'fall');
      } else if (me.bubble) s.setSt(me, 'bubble');
      s.fade = 0.85;
      s.room.foes = []; s.room.items = s.room.items.filter(i => !(i.kind === 'ability' && i.rise));
      if (s.room.guard) s.room.guard.awake = false;
    } else { const me = s.players[1]; s.ext[1] = true; if (me.alive) { me.st = 'enter'; me.vx = 0; me.vy = 0; } return true; }   /* waiting to follow: hold still, untouchable */
  }
  for (const e of L.L) {
    if (e[0] <= la) continue;
    if (e[0] !== la + 1 && la) break;   /* wait for the gap to be filled (it is resent until acked) */
    la = e[0]; applyLog(s, e); T.logIn++;
  }
  return false;
}
function applyLog(s, e) {
  const r = s.room, type = e[1];
  if (type === 0) { r.flowers.push({ x: e[3], y: e[4], kind: e[6], ceil: !!e[5], t: 0, seed: e[2] * 7 + 3, temp: !!e[7] }); if (!e[7]) { const b = s.save.bloom[r.id] = s.save.bloom[r.id] || []; if (!b.some(x => x[0] === e[2])) b.push([e[2], e[3], e[4], e[5]]); } r.recolour(s.save); }
  else if (type === 1) { const b = r.buds.find(b => Math.abs(b.x - e[2]) < 2 && Math.abs(b.y - e[3]) < 2); if (b) { r.buds.splice(r.buds.indexOf(b), 1); } r.flowers.push({ x: e[2], y: e[3], kind: 6, ceil: !!e[4], t: 0, seed: 5 }); r.recolour(s.save); }
  else if (type === 2) { const i = r.items.findIndex(i => (i.key || i.id) === e[2]); if (i >= 0) r.items.splice(i, 1); s.save.got[e[2]] = 1; }
  else if (type === 3) { const l = r.levers.find(l => l.n === e[2]); if (l) { l.on = true; l.t = 20; if (l.gate) s.save.open[l.gate.key] = 1; } }
  else if (type === 4) { const sw = r.switches.find(x => x.n === e[2]); if (sw) { sw.on = true; sw.t = 30; if (sw.gate) s.save.open[sw.gate.key] = 1; } }
  else if (type === 5) { const br = r.breaks.find(b => b.n === e[2]); if (br) { for (const [a, b] of br.cells) r.t[b * r.w + a] = RL.T.AIR; r.breaks.splice(r.breaks.indexOf(br), 1); s.save.broke[br.key] = 1; } }
  else if (type === 6) { const me = s.players[1]; me.leaves = me.maxLeaves; if (me.st === 'bubble' || me.st === 'faint') s.revive(me, true); s.ev('rest', 0); }
  else if (type === 7) { const me = s.players[1]; me.alive = true; me.bubble = false; me.leaves = me.maxLeaves; me.inv = 60; s.setSt(me, 'sit'); s.ev('wake'); }
  else if (type === 8) { if (e[2] === 'ability') s.save.ab[e[3]] = 1; s.applyStats(); s.ev('get', e[2], e[3], e[4] | 0); }
  else if (type === 9) { s.save.calm[GK[e[2]]] = 1; s.ev('calm', GK[e[2]]); s.calmFlowers(); }
  else if (type === 10) { r.items.push({ kind: e[2], id: e[3], key: e[4], x: e[5], y: e[6], got: false, hp: 0, hurt: 0, rise: 1 }); }
  else if (type === 11) { s.ending = 1; s.ev('ending'); }
}
/* before the guest's step: the host's sprout and the room as they were D ms ago */
function guestPre(s) {
  if (guestRoom(s)) return;
  const t = now(), r = vIt ? vIt.at(t) : null; if (!r) return;
  const A = r.a, B = r.b, k = r.k;
  if (B.rm !== s.room.id) return;
  const host = s.players[0];
  applyP(host, A.rm === B.rm ? A.P : null, B.P, k);
  /* glooms: eased by id */
  const prev = new Map(); if (A !== B && A.rm === B.rm) for (const a of A.F) prev.set(a[0], a);
  const room = s.room, byId = new Map(room.foes.map(f => [f.id, f])), alive = new Set();
  for (const a of B.F) {
    const id = a[0]; alive.add(id); let f = byId.get(id);
    const FD = RL.FOE[FK[a[1]]];
    if (!f) { f = { id, kind: FK[a[1]], x: 0, y: 0, vx: 0, vy: 0, face: 1, hp: 1, maxHp: FD.hp, st: 'idle', t: 0, hurt: 0, ceil: false, alive: true, w: FD.w, h: FD.h, hx: 0, hy: 0 }; room.foes.push(f); }
    f.kind = FK[a[1]]; f.st = FST[a[4]]; f.t = a[5]; f.face = a[6]; f.hp = a[7]; f.hurt = Math.max(f.hurt > 0 ? f.hurt - 1 : 0, a[8]); f.ceil = !!a[9]; f.vx = a[10] / 16; f.vy = a[11] / 16; f.temp = !!a[12]; f.alive = true;
    const p = prev.get(id), fx = clamp(k, 0, 1.4);
    if (p && (p[2] - a[2]) ** 2 + (p[3] - a[3]) ** 2 < 4096 * 16) { f.x = (p[2] + (a[2] - p[2]) * fx) / 4; f.y = (p[3] + (a[3] - p[3]) * fx) / 4; } else { f.x = a[2] / 4; f.y = a[3] / 4; }
  }
  for (const f of room.foes) if (!alive.has(f.id)) f.alive = false;
  room.foes = room.foes.filter(f => f.alive);
  /* the guardian */
  if (B.G) {
    const g = room.guard, a = B.G, pa = A.G && A.rm === B.rm ? A.G : null;
    if (g) {
      g.hp = a[3]; g.maxHp = a[4]; g.phase = a[5]; g.st = GST[a[6]]; g.t = a[7]; g.face = a[8]; g.hurt = Math.max(g.hurt > 0 ? g.hurt - 1 : 0, a[9]); g.calm = a[10] / 1000; g.awake = !!a[11]; g.done = !!a[12];
      g.squash = a[13] / 100; g.spin = a[14] / 100; g.heat = a[15] / 100; g.door = a[16] / 100; g.dark = a[17] / 100; g.glow = a[18] / 100; g.dir = a[19];
      const fx = clamp(k, 0, 1.4); g.x = pa ? (pa[1] + (a[1] - pa[1]) * fx) / 4 : a[1] / 4; g.y = pa ? (pa[2] + (a[2] - pa[2]) * fx) / 4 : a[2] / 4;
      /* the Grey Cloud's gust pushes us too */
      room.wind = room.wind.filter(w => !w.temp); if (g.kind === 'cloud' && g.st === 'gust') room.wind.push({ x: 0, y: 0, w: room.pw, h: room.ph, dx: g.dir * 1.5 * (s.save.gentle ? 0.8 : 1), dy: 0, gust: 0, on: 1, temp: 1 });
    }
  }
  /* hazards and shots as the host has them; our own Sunbeam stays ours */
  room.hazards = B.Z.map(a => ({ kind: HK[a[0]], x: a[1] / 4, y: a[2] / 4, w: a[3], h: a[4], tell: a[5], live: !!a[6], t: a[7], dur: a[8], vx: a[9] / 16 }));
  const sPrev = new Map(); if (A !== B) for (const a of A.S) sPrev.set(a[0], a);
  const mine = room.shots.filter(x => x.kind === 'beam' && x.own === 1);
  room.shots = B.S.filter(a => !popped.has(a[0])).map(a => { const p = sPrev.get(a[0]), fx = clamp(k, 0, 1.4); const x = p ? (p[2] + (a[2] - p[2]) * fx) / 4 : a[2] / 4, y = p ? (p[3] + (a[3] - p[3]) * fx) / 4 : a[3] / 4; return { id: a[0], kind: SK[a[1]], x, y, vx: a[4] / 16, vy: a[5] / 16, r: a[6], t: a[7], life: 1e9, own: SK[a[1]] === 'beam' ? 0 : -1, hit: new Set(), dmg: 0, net: 1 }; }).concat(mine);
  room.drops = B.D.map(d => ({ x: d[0] / 4, y: d[1] / 4, vx: 0, vy: 0, t: 0, v: 1 }));
  room.gates.forEach((g, i) => { g.shut = i < 30 ? !!(B.gs & (1 << i)) : g.shut; });
  /* the countdown and clock: platforms, vents and gusts follow the host's ticks */
  const ahead = Math.round(((Net.rtt || 0) / 2 + (t - L_at())) / TICK);
  const want = latest.st + ahead; if (Math.abs(want - s.t) > 3) s.t = want;
  /* the host's events, once the view has caught up with them */
  const rc = vIt.rc !== null ? vIt.rc : -1e12; let n = 0;
  for (const [rt, e] of evIn) { if (rt > rc + 1) break; n++; if (rt < rc - 700) continue; s.events.push(['net', EVN[e[1]], e[2], e[3], e[4]]); }
  if (n) evIn.splice(0, n);
}
const popped = new Set();
const L_at = () => latest ? latest._at : now();
/* asks from the guest's own sim (its hooks) */
function ask(...q) { asks.push([++askSeq, ...q]); sendNow = true; T.asksSent++; if (asks.length > 48) asks.shift(); }
function guestSetup(s) {
  s.ext[0] = true; s.me = 1;
  const H = s.hooks;
  H.pre = () => { try { guestPre(s); } catch (e) { console.error('[rootlight net]', e); } };
  H.post = () => { if (sendNow || ut - lastGSend >= every()) sendG(s); };
  H.swingFoe = (p, f) => { f.hurt = 8; s.ev('hit', f.kind, f.x, f.y); ask(0, f.id, 1, ri(p.x)); return false; };
  H.swingGuard = (p, g) => { g.hurt = 10; s.ev('ghit', g.kind, g.x, g.y); ask(1, 1); p.sun = Math.min(p.sunMax, p.sun + s.st.sunHit); return false; };
  H.swingBud = (p, b) => { ask(2, b.id); return false; };
  H.swingItem = (p, it) => { it.hurt = 8; s.ev('crack', it.x, it.y); ask(3, it.id); return false; };
  H.swingBreak = (p, b) => { b.hurt = 10; s.ev('crack', b.x + b.w / 2, b.y + b.h / 2); ask(4, b.n); return false; };
  H.swingLever = (p, l) => { ask(5, l.n); return false; };
  H.swingShot = (p, sh) => { popped.add(sh.id); sh.dead = true; s.ev('pop', sh.kind, sh.x, sh.y); ask(10, sh.id); return false; };
  H.pickup = (p, it) => { if (it.kind === 'cluster') return false; if (!it.asked) { it.asked = 1; ask(6, it.key || it.id); } return false; };
  H.door = (p, to) => {
    if (!waitDoor) {
      const r = s.room, wx = r.wx * 20 + p.x, wy = r.wy * 20 + p.y, d = W().rooms[to], dy = p.y - 13 < 0 ? -1 : p.y - 13 > r.ph ? 1 : 0;
      const x = wx - d.cx * 16 * 20, y = wy - d.cy * 9 * 20;
      waitDoor = { to, x: x + Math.sign(p.vx) * 6, y, vx: p.vx, vy: p.vy, dy }; ask(7, to, ri(x), ri(y), ri(p.vx), ri(p.vy), p.face, dy); toast('You went on ahead', opp() + ' is following…');
    }
    p.x = clamp(p.x, 1, s.room.pw - 1); p.y = clamp(p.y, 26, s.room.ph); p.vx = 0; p.vy = 0; p.st = 'enter'; return false;
  };
  H.rest = (p) => { ask(8); return false; };
  H.talk = () => { toast(opp() + ' keeps the dew purse', 'ask them to visit the Peddler'); return false; };
  H.wake = () => false;
  H.beamFoe = (b, f) => { f.hurt = 8; ask(0, f.id, b.dmg, ri(b.x - b.vx * 3)); };
  H.beamGuard = (b, g) => { g.hurt = 10; ask(1, b.dmg); };
  H.beamSwitch = (b, sw) => { ask(9, sw.n); };
  H.beamBud = (b, bd) => { ask(2, bd.id); };
  H.beamShot = (b, sh) => { popped.add(sh.id); ask(10, sh.id); };
}
function sendG(s) {
  sendNow = false; lastGSend = ut;
  const o = { k: 'g', rv: s ? s.rv : 0, P: s && gStarted && !follow ? packP(s.players[1], s.rv) : 0, la, sv: haveSv };
  if (s && gStarted) { const b = s.room.shots.filter(x => x.kind === 'beam' && x.own === 1).slice(0, 4); if (b.length) o.b = b.map(x => [ri(x.x * 4), ri(x.y * 4), ri(x.vx * 16), clamp(x.r | 0, 1, 40)]); }
  if (asks.length) o.q = asks.slice(0, 40);
  send(o);
}
function onAcked(a) { if (a > 0) asks = asks.filter(q => q[0] > a); }

/* ---------- going on alone ---------- */
function playAlone(why) {
  const role = Net.role;
  if (why !== 'peer' && why !== 'exit') Net.leave();
  online = false; quiet = verBad = false; Net.role = null; Net.mode = 'solo'; T.solo = why; follow = null;
  const s = sim();
  if (s && role === 'host') { s.ext[1] = false; s.players.length = 1; s.role = 'solo'; s.hooks = {}; }
  else if (s && role === 'guest') { M.quitToTitle(); }
  gStarted = false;
}
function peerLeft() {
  if (!online) return;
  const who = opp(), heard = heardAny, role = Net.role, playing = M && M.screen === 'play';
  playAlone('peer');
  toast(heard ? who + ' left' : who + (role === 'host' ? ' couldn’t join' : ' couldn’t start'), role === 'host' && playing ? 'you play on in your garden' : 'you can play on your own');
}

/* ---------- the link ---------- */
function link(m) {
  const role = m.role === 'host' || m.role === 'guest' ? m.role : null, mode = m.mode === 'rtc' || m.mode === 'ably' ? m.mode : null;
  if (!role || !mode) return;
  const first = !online || Net.role !== role, changed = Net.mode !== mode;
  Net.role = role; Net.mode = mode; Net.me = nm(m.me, 'Player'); Net.opp = nm(m.opp, 'Friend');
  if (changed) for (const it of [gIt, vIt]) if (it) it.range(rangeFor()[0], rangeFor()[1]);
  if (!first) return;
  online = true; heardAny = false; verBad = quiet = false; Net.rtt = 0; lastRT = -1; sentT.fill(-1); Net.lastIn = now();
  lastAsk = 0; asksIn.length = 0; evQ.q.length = 0; log = []; logSeq = 0; guestLa = 0; saveVer = 0; saveDirty = true; hostRv = -1; follow = null;
  newestT = -1; latest = null; gStarted = false; chunks = null; haveSv = 0; la = 0; asks = []; askSeq = 0; pendingSave = null; waitDoor = null; popped.clear();
  if (M) { M.players = 1; if (M.screen !== 'title') M.quitToTitle(); }
}

/* ---------- RL.Main's hooks ---------- */
const hooks = {
  tick(u) {
    ut = u;
    if (!online) return;
    const t = now();
    quiet = Net.silence(t) > C.quiet && (heardAny || Net.role === 'guest');
    if (Net.rtt && t - rttPostAt >= 1000) { rttPostAt = t; Net.post({ ty: 'rtt', ms: Math.round(Net.rtt) }); }
    meterTick(t);
    if (Net.role === 'host') { if (M.screen !== 'play' && ut - lastIdle >= C.idle) { lastIdle = ut; send({ k: 'w', sc: M.screen === 'title' ? 0 : M.screen === 'slots' ? 1 : 2 }); } }
    else {
      if (latest) onAcked(latest.a);
      if (gStarted && M.screen !== 'play' && M.screen !== 'ending') gStarted = false;   /* back on the title: ready to join the next garden */
      guestTick();
      if ((M.screen !== 'play' || !gStarted) && ut - lastGSend >= C.idle) sendG(null);
    }
  },
  simOpts(o) { if (!online) return; o.players = 2; o.role = Net.role; o.me = Net.role === 'guest' ? 1 : 0; M.players = 1; },
  simMade(s) { if (!online) return; if (Net.role === 'host') hostSetup(s); else guestSetup(s); },
  masks(m) {
    if (!online) return;
    const s = sim(); const busy = !!(s && s.freeze);
    if (Net.role === 'guest') { m[1] = busy ? 0 : m[0]; m[0] = 0; } else { m[1] = 0; if (busy) m[0] = 0; }
  },
  key(c) {
    if (!online) return false;
    if (quiet || verBad) { if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') { playAlone(verBad ? 'version' : 'quiet'); return true; } return false; }
    if (Net.role === 'guest' && M.screen !== 'play' && M.screen !== 'ending') return !(c === 'Escape' || c === 'Backspace' || c === 'KeyM' || c === 'KeyN');   /* waiting: only leaving and sound */
    if (M.screen === 'title' && Net.role === 'host' && (c === 'ArrowDown' || c === 'ArrowUp' || c === 'KeyW' || c === 'KeyS')) return true;   /* online: one row, Play */
    return false;
  },
  tap() { if (online && (quiet || verBad)) { playAlone(verBad ? 'version' : 'quiet'); return true; } return false; },
  quit() { if (online) playAlone('left'); },
  draw(ctx, Wd, H) {
    const RD = RL.Render; if (!RD || !RD.text) return;
    const scr = M.screen;
    if (online && Net.role === 'guest' && !gStarted) {
      ctx.fillStyle = 'rgba(27,21,48,.92)'; rr(ctx, Wd / 2 - 200, H / 2 - 50, 400, 100, 18); ctx.fill();
      fit(ctx, hostSc === 1 ? opp() + ' is picking a garden…' : heardAny ? 'Waiting for ' + opp() + ' to start…' : 'Waiting for ' + opp() + '…', Wd / 2, H / 2 - 16, 20, '#ffd93b', 370);
      RD.text(ctx, 'You play MARIGOLD, the orange sprout', Wd / 2, H / 2 + 18, 14, '#fff');
    }
    if (online && Net.role === 'host' && scr === 'title') { ctx.fillStyle = 'rgba(27,21,48,.94)'; rr(ctx, Wd / 2 - 250, H - 34, 500, 26, 13); ctx.fill(); fit(ctx, 'Online with ' + opp() + ' · you pick the garden · you play SPRIG', Wd / 2, H - 21, 13, '#ffd93b', 480); }
    if (online && follow && M.screen === 'play') { const left = Math.max(0, Math.ceil((C.follow - follow.t) / 60 * 10) / 10); ctx.fillStyle = 'rgba(27,21,48,.85)'; rr(ctx, Wd / 2 - 130, 52, 260, 30, 15); ctx.fill(); fit(ctx, (follow.host ? 'Following ' + opp() : 'Catching up with ' + opp()) + '… ' + left.toFixed(1), Wd / 2, 67, 15, '#fff', 240); }
    const age = ut - toastAt;
    if (toastL && age < 300) {
      ctx.globalAlpha = Math.min(1, (300 - age) / 30);
      const pw = 330, ph = 8 + toastL.length * 18, py = 88;
      ctx.fillStyle = 'rgba(27,21,48,.94)'; rr(ctx, Wd / 2 - pw / 2, py, pw, ph, 14); ctx.fill();
      toastL.forEach((s, i) => fit(ctx, s, Wd / 2, py + 4 + 9 + i * 18, i ? 13 : 15, i ? '#e9e3ff' : '#fff', pw - 20));
      ctx.globalAlpha = 1;
    }
    if (online && verBad) msgBox(ctx, Wd, H, ['Refresh the page', 'to play together', 'SPACE or tap: play on alone']);
    else if (online && quiet) msgBox(ctx, Wd, H, [opp() + ' went quiet', 'SPACE or tap: play on alone']);
  },
  live() { return online; }
};
function msgBox(ctx, Wd, H, lines) { ctx.fillStyle = 'rgba(27,21,48,.94)'; rr(ctx, Wd / 2 - 170, H / 2 - 20 - lines.length * 12, 340, 30 + lines.length * 24, 16); ctx.fill(); lines.forEach((s, i) => fit(ctx, s, Wd / 2, H / 2 - lines.length * 12 + 4 + i * 24, i < lines.length - 1 ? 18 : 14, i < lines.length - 1 ? '#fff' : '#ffd93b', 320)); }
const NOCTX = { drawImage() {}, save() {}, restore() {}, fillText() {}, strokeText() {}, measureText: () => ({ width: 0 }) };
function fit(ctx, s, x, y, size, col, maxW) { const w = RL.Render.text(NOCTX, s, 0, 0, size); if (w > maxW) size = Math.max(8, Math.floor(size * maxW / w * 2) / 2); return RL.Render.text(ctx, s, x, y, size, col); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------- RL.Net ---------- */
const Net = RL.Net = {
  role: null, mode: 'solo', me: '', opp: '', rtt: 0, lastIn: 0, PROTO, MAXMSG, valid, Interp, stats: S, C, debug: /[?&]debug=1/.test(location.search),
  init(c) {
    cb = c || {}; M = cb.main || RL.Main;
    if (M && M.hooks) Object.assign(M.hooks, hooks);
    while (early.length) { const [m, at] = early.shift(); try { handle(m, at); } catch (e) { console.error('[rootlight net]', e); } }
  },
  send(o) {
    if (!online || !o) return false;
    const d = JSON.stringify(o);
    if (d.length > MAXMSG) { S.big++; if (S.big < 4) console.warn('[rootlight net] message too big: ' + d.length + ' ' + o.k); return false; }
    this.post({ ty: 'net', d }); S.outN++; S.outB += d.length;
    return true;
  },
  post(o) { try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} if (o && o.ty === 'exit' && online) playAlone('exit'); },
  leave() { if (!this.role) return; this.post({ ty: 'leave' }); },
  silence(t) { return (t == null ? now() : t) - this.lastIn; },
  meter() { return this.mode + (this.rtt ? ' ' + Math.round(this.rtt) + ' ms' : '') + (S.rate ? ' · ' + S.rate : '') + (S.bad ? ' · bad ' + S.bad : ''); },
  get state() {
    const s = sim();
    return { online, role: this.role, mode: this.mode, quiet, verBad, rtt: Math.round(this.rtt), started: gStarted, room: s ? s.room.id : null, rv: s ? s.rv : -1, curRv, follow: !!follow, asks: asks.length, lastAsk, la, logSeq, guestLa, saveVer, haveSv,
      silence: Math.round(this.silence()), D: (vIt || gIt) ? Math.round((vIt || gIt).D) : 0, interp: (vIt || gIt) ? Object.assign({}, (vIt || gIt).n) : null, test: Object.assign({}, T), stats: { bad: S.bad, big: S.big, max: Object.assign({}, S.max) } };
  }
};
})();
