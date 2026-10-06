/* SPROUT KART — net.js (NET). Online two players, each on their own screen, with 4 CPU racers (SPEC-kart.md, netcode).
   The parent link (postMessage to and from our own parent page, same origin only), strict checks on everything that arrives,
   the interpolation clock, RTT, and the online race itself, played through SK.Main's hooks (main.js, marked NET HOOK).
   The parent (the planet's kartRoom, or kart-review/net/harness.html) only carries strings between the two browsers.

   Who does what. The HOST (SPRIG) runs the race: CPU karts, surprise bubbles, items in flight, laps, places, results and the
   Grand Prix points. Each player OWNS its kart: the GUEST (MARIGOLD) drives its own kart in its own sim with the same physics
   (no input lag) and sends its state; the host marks it sim.ext and draws it from interpolated states, and it is a car on
   the track there (bumps, places, rubber band). The guest marks every other kart ext and draws them, the items and the
   bubbles from the host's snapshots, interpolated. The victim decides: an item that reaches the guest is the guest's call,
   made against the host's items as the guest sees them (a seed flying at the guest is flown on the guest, against where it
   really is); the guest says which bubbles it took. Hits on the CPUs or the host are the host's. The guest ASKS the host to
   throw its juice, bombs and seeds (asks carry a seq, go in every message until acked), so items in flight live in one place;
   the guest shows its own throw at once (a look-ahead copy) and hides the host's copy of it. Places on each screen come from
   that screen's sim; the results and the Grand Prix points are the host's, so both screens agree.

   Wire (v = PROTO 1, JSON, integers only, at most 6000 characters; x, y ×16 for items, packKart's own scales for karts):
     host → guest  {k:'s', v, t, ht, hh, run, h:[track, diff, gpRound|-1, who…], gt:[pts by racer ×6]?, ph:0 count|1 race, cd,
                    c (race clock), sc:0 race|1 results|2 podium, K:[[packKart…, rp×16, surf] per kart], B:[bubble t…],
                    I:[[id, kind 0 juice|1 bomb|2 burst|3 seed, x, y, z, own, age, rq(, tgt, dir×4096, s×16, lat×64)]…],
                    E:[[seq, event, kart, arg]…] (cosmetic, resent for 300 / 800 ms), R:[[i, place, time, est]…]?, a (asks done)}
                    every 2 ticks on the direct link (30 Hz), 3 on the relay (20 Hz); about 1-1.5 KB
                   {k:'w', v, t, ht, hh, sc:0 title|1 track picker}   the host is choosing: 4 Hz
     guest → host  {k:'g', v, t, ht, hh, run, p:[packKart…, rp×16, surf]?, q:[ask…]?}   racing: 30 / 20 Hz; waiting: 4 Hz
                   asks: [seq, 0, item, x×16, y×16, dir×4096, v×64, s×16, lat×64] throw   [seq, 1, itemId, by, res] hit me
                         (by 0 juice|1 bomb|2 seed, res 0 spun|1 bubble shield popped|2 nothing|3 a seed flown at the guest
                         ended on its screen without reaching it: dropped quietly)   [seq, 2, bubble] took a bubble
     either        {k:'bye'} (sent by the parent room when someone leaves)
   t = the sender's tick; ht / hh = the newest t heard from the other side and how many ms ago: RTT both ways (posted each second).
   A different v: "Refresh the page to race together". 10 s of silence: "<opp> went quiet: SPACE to race on alone".
   startIn (the link): a race the host picks before the guest's game has said a word holds its countdown before the "3"
   ("Waiting for <opp>…") until the guest is heard or startIn has passed, so both screens count the same 3, 2, 1. */
'use strict';
(function () {
const SK = window.SK = window.SK || {};
const PROTO = 1, MAXMSG = 6000, TICK = 1000 / 60, I31 = 2147483647;
const C = { everyRtc: 2, everyAbly: 3, idle: 15, dRtc: [50, 220], dAbly: [130, 400], evTtlRtc: 300, evTtlAbly: 800, evLate: 700, quiet: 10000, extra: 100, kx: 1.6, holdMax: 15000 };
const now = () => performance.now();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const isI = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;
const TAU = Math.PI * 2, wrapA = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const ri = v => { v = Math.round(+v); return Number.isFinite(v) ? clamp(v, -1e8, 1e8) : 0; };
const P = SK.Sim ? SK.Sim.prototype : null;
const KIND = ['splat', 'bomb', 'burst', 'seed'];
const EVN = ['hit', 'box', 'splat', 'bomb', 'pop', 'seed', 'shield', 'star', 'boost', 'turbo', 'balloon', 'fall', 'bump', 'drift'];
const EVA = ['splat', 'bomb', 'seed', 'drop', 'hit', 'pad', 'berry', 'rocket', 'wall', 'pop', 'hop', 'start'];
const encArg = a => typeof a === 'number' ? (Number.isInteger(a) && a >= -1 && a < 1000 ? a : 0) : typeof a === 'string' && EVA.indexOf(a) >= 0 ? 1000 + EVA.indexOf(a) : 0;
const decArg = a => a >= 1000 ? EVA[a - 1000] : a;
const ITEMS = SK.ITEMS || [], I_SPLAT = ITEMS.indexOf('splat'), I_BOMB = ITEMS.indexOf('bomb'), I_SEED = ITEMS.indexOf('seed');
const BY = ['splat', 'bomb', 'seed'];
const KF = (SK.Sim && SK.Sim.KART_FIELDS) || [], KN = KF.length, PK = KN + 2;
const KR = { place: [0, 9], lap: [0, 99], fin: [0, 1], item: [0, 31], itemN: [0, 9], drift: [-1, 1], mt: [0, 9] };
const NR = () => (SK.TRACKS || []).length;

/* ---------- a kart as integers: packKart (sim.js) + race metres ×16 + surface ---------- */
function packX(k) { const a = SK.Sim.packKart(k).map(ri); a.push(ri((+k.rp || 0) * 16), clamp(k.surf | 0, 0, 9)); return a; }
function unpackX(k, a) { SK.Sim.unpackKart(k, a); k.rp = a[KN] / 16; k.surf = a[KN + 1]; return k; }
const scratch = {};
/* the other karts: B (newer) as it is, then x, y, z, heading, speed and race metres eased from A; never slid across the map */
function applyKart(k, A, B, f) {
  unpackX(k, B);
  if (!A || A === B) return;
  const a = unpackX(scratch, A);
  if ((a.x - k.x) ** 2 + (a.y - k.y) ** 2 > 36) return;   /* the balloon or a respawn: no slide */
  f = clamp(f, 0, C.kx);
  k.x = a.x + (k.x - a.x) * f; k.y = a.y + (k.y - a.y) * f; k.z = a.z + (k.z - a.z) * f;
  k.v = a.v + (k.v - a.v) * f; k.vd = a.vd + (k.vd - a.vd) * f; k.st = a.st + (k.st - a.st) * f; k.rp = a.rp + (k.rp - a.rp) * f;
  k.dir = wrapA(a.dir + wrapA(k.dir - a.dir) * f);
  for (const n of ['spin', 'lift', 'fall']) if (a[n] > 0 && k[n] > 0) k[n] = Math.max(1, a[n] + (k[n] - a[n]) * Math.min(1, f));
}

/* ---------- message checks: integers only, sane ranges and lengths; anything else is dropped ---------- */
let why = '';
const no = w => { why = w; return false; };
const BIG = [-1e8, 1e8];
const okKart = (a, w) => {
  if (!Array.isArray(a) || a.length !== PK) return no(w);
  for (let i = 0; i < KN; i++) { const r = KR[KF[i]] || BIG; if (!isI(a[i], r[0], r[1])) return no(w + '.' + KF[i]); }
  return (isI(a[KN], -1e7, 1e8) && isI(a[KN + 1], 0, 9)) || no(w + '.rp');
};
const okItem = r => Array.isArray(r) && (r.length === 8 || r.length === 12) && isI(r[0], 1, I31) && isI(r[1], 0, 3) && (r.length === 12) === (r[1] === 3) &&
  isI(r[2], -1e6, 1e6) && isI(r[3], -1e6, 1e6) && isI(r[4], -1e5, 1e5) && isI(r[5], -1, 5) && isI(r[6], 0, 1e6) && isI(r[7], 0, I31) &&
  (r.length === 8 || (isI(r[8], -1, 5) && isI(r[9], -3e4, 3e4) && isI(r[10], -1e6, 1e6) && isI(r[11], -1e6, 1e6)));
const okEv = e => Array.isArray(e) && e.length === 4 && isI(e[0], 1, I31) && isI(e[1], 0, EVN.length - 1) && isI(e[2], -1, 5) && isI(e[3], -1, 1000 + EVA.length - 1);
const okRes = (a, n) => { if (!Array.isArray(a) || a.length !== n) return false; const seen = new Set(); for (const r of a) { if (!Array.isArray(r) || r.length !== 4 || !isI(r[0], 0, n - 1) || !isI(r[1], 1, n) || !isI(r[2], 0, I31) || !isI(r[3], 0, 1) || seen.has(r[0])) return false; seen.add(r[0]); } return true; };
const okHead = h => { if (!Array.isArray(h) || h.length < 5 || h.length > 9 || !isI(h[0], 0, NR() - 1) || !isI(h[1], 0, 2) || !isI(h[2], -1, 2)) return false; const w = h.slice(3), s = new Set(w); return w.every(x => isI(x, 0, 5)) && s.size === w.length && s.has(0) && s.has(1); };
const okAsk = q => Array.isArray(q) && isI(q[0], 1, I31) && (
  (q[1] === 0 && q.length === 9 && (q[2] === I_SPLAT || q[2] === I_BOMB || q[2] === I_SEED) && q.slice(3).every(v => isI(v, -1e7, 1e7))) ||
  (q[1] === 1 && q.length === 5 && isI(q[2], 1, I31) && isI(q[3], 0, 2) && isI(q[4], 0, 3)) ||
  (q[1] === 2 && q.length === 3 && isI(q[2], 0, 63)));
const common = o => (isI(o.v, 0, 999) || no('v')) && (isI(o.t, 0, I31) || no('t')) && (isI(o.ht, -1, I31) || no('ht')) && (isI(o.hh, 0, 600000) || no('hh'));
/* one bad row (an item or an event) drops only that row, not the whole snapshot */
function prune(o) {
  for (const [key, ok] of [['I', okItem], ['E', okEv]]) { const a = o[key]; if (Array.isArray(a) && a.length <= 96) { const b = a.filter(ok); if (b.length !== a.length) { S.fixed += a.length - b.length; o[key] = b; } } }
}
const valid = {
  snap(o) {
    if (!o || o.k !== 's') return no('k');
    for (const k of ['I', 'E', 'B']) if (o[k] === undefined) o[k] = [];
    if (o.a === undefined) o.a = 0;
    if (!common(o)) return false;
    if (!(isI(o.run, 0, 1e9) || no('run')) || !(okHead(o.h) || no('h'))) return false;
    const n = o.h.length - 3;
    return (isI(o.ph, 0, 1) || no('ph')) && (isI(o.cd, 0, 9999) || no('cd')) && (isI(o.c, 0, I31) || no('c')) && (isI(o.sc, 0, 2) || no('sc')) &&
      (isI(o.a, 0, I31) || no('a')) && ((Array.isArray(o.K) && o.K.length === n && o.K.every((a, i) => okKart(a, 'K' + i))) || no(why || 'K')) &&
      ((Array.isArray(o.B) && o.B.length <= 64 && o.B.every(t => isI(t, -9999, 9999))) || no('B')) &&
      ((Array.isArray(o.I) && o.I.length <= 96 && o.I.every(okItem)) || no('I')) && ((Array.isArray(o.E) && o.E.length <= 64 && o.E.every(okEv)) || no('E')) &&
      (o.gt === undefined || (Array.isArray(o.gt) && o.gt.length === 6 && o.gt.every(p => isI(p, 0, 9999))) || no('gt')) &&
      (o.R === undefined || okRes(o.R, n) || no('R'));
  },
  wait(o) { return (o && o.k === 'w' && common(o) && isI(o.sc, 0, 1)) || no('w'); },
  guest(o) {
    if (!o || o.k !== 'g') return no('k');
    if (o.q === undefined) o.q = [];
    return common(o) && (isI(o.run, -1, 1e9) || no('run')) && (o.p === undefined || okKart(o.p, 'p')) &&
      ((Array.isArray(o.q) && o.q.length <= 32 && o.q.every(okAsk)) || no('q'));
  },
  get why() { return why; }
};

/* ---------- Interp: snapshot interpolation on a render clock that never steps (Berry Breeze's, net.js, unchanged in spirit) ----------
   offset = min over the last 2 s of (arrival - remoteMs); D = clamp(jitter spread over 3 s + the gap between samples + 8 ms, min, max)
   (the gap: one send interval, or the 90th percentile of the remote-time gaps over 3 s when messages are being lost);
   the render clock runs at 0.95-1.05 of real time towards now - offset - D. The spread is the 95th percentile minus the minimum.
   Reset of the offset: a gap over 500 ms or a shift over 300 ms. A sender whose game runs slow sends remote time slower than
   real time: under 0.975 the clock runs at that rate. A dry buffer carries on along the last step for 100 ms, then holds. */
class Interp {
  constructor(dMin, dMax, every) { this.dMin = dMin; this.dMax = dMax; this.every = every; this.res = { a: null, b: null, k: 0, held: false, extra: 0 }; this.reset(); }
  reset() { this.gw = []; this.buf = []; this.win = []; this.off = null; this.offAt = 0; this.base = 1; this.rate = 1; this.rw = []; this.lowT = 0; this.highT = 0; this.D = this.dMin; this.rc = null; this.last = 0; this.lastPush = -1e9; this.re = 0; this.dKeep = 0; this.keepTo = 0; this.n = { push: 0, old: 0, resets: 0, at: 0, extra: 0, held: 0 }; }
  clear() { this.buf.length = 0; this.rc = null; }   /* a new race: no easing from the last one (the clock offset stays) */
  range(dMin, dMax) { this.dMin = dMin; this.dMax = dMax; this.D = clamp(this.D, dMin, dMax); this.resetOffset(); this.rw.length = 0; }
  resetOffset() { this.win.length = 0; this.re = 1; this.dKeep = this.D; this.n.resets++; }
  push(r, sample, at) {
    if (at == null) at = now();
    const b = this.buf, n = b.length;
    if (n && r < b[n - 1].r - 60000) { this.reset(); return this.push(r, sample, at); }   /* the other side restarted */
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

/* ---------- RTT: each side keeps sentAt[t]; the other echoes ht (its newest t from us) and hh (ms it held it) ---------- */
const sentT = new Int32Array(256).fill(-1), sentMs = new Float64Array(256);
let lastRT = -1, lastRAt = 0, rttPostAt = 0;
function heard(o, at) {
  if (o.t > lastRT || o.t < lastRT - 3600) { lastRT = o.t; lastRAt = at; }
  if (o.ht >= 0 && sentT[o.ht & 255] === o.ht) { const s = at - sentMs[o.ht & 255] - o.hh; if (s >= 0 && s < 10000) Net.rtt = Net.rtt ? Net.rtt * 0.8 + s * 0.2 : s; }
}

/* ---------- traffic stats (sizes per kind, for the debug meter and the test page) ---------- */
const S = { inN: 0, inB: 0, outN: 0, outB: 0, bad: 0, big: 0, fixed: 0, old: 0, max: { s: 0, w: 0, g: 0 }, sum: { s: 0, w: 0, g: 0 }, n: { s: 0, w: 0, g: 0 }, t0: 0, rate: '' };
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
  if (!cb) { if (early.length < 16) early.push([m, at]); return; }   /* before init: kept for it */
  try { handle(m, at); } catch (er) { console.error('[kart net]', er); }
});
function recv(d, at) {
  if (!online || d.length > MAXMSG) return;
  let o = null; try { o = JSON.parse(d); } catch (_) { o = null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) { S.bad++; return; }
  if (o.k === 'bye') { peerLeft(); return; }
  const kinds = Net.role === 'guest' ? ['s', 'w'] : ['g'];   /* a host only listens to a guest, a guest only to a host */
  if (kinds.indexOf(o.k) < 0) { S.bad++; return; }
  if (o.v !== PROTO) { if (Number.isInteger(o.v)) { Net.lastIn = at; if (!verBad) { verBad = true; console.warn('[kart net] the other side runs version ' + o.v + ', this page ' + PROTO); } } return; }
  if (o.k === 's') prune(o);
  if (!(o.k === 's' ? valid.snap(o) : o.k === 'w' ? valid.wait(o) : valid.guest(o))) { S.bad++; if (S.bad < 4 || Net.debug) console.warn('[kart net] dropped a bad message: ' + why); return; }
  S.inN++; S.inB += d.length; Net.lastIn = at; heardAny = true;
  heard(o, at); o._at = at;
  if (o.k === 'g') onGuest(o); else if (o.k === 's') onSnap(o); else onWait(o);
}

/* =====================================================================================================================
   THE ONLINE RACE
   ===================================================================================================================== */
let M = null, ut = 0, online = false, heardAny = false, verBad = false, quiet = false, myWho = -1, lastScr = '', toastT = '', toastAt = -1e9, startAt = 0, holdUt = -99;
let curSim = null, g = -1, hostIdx = -1;
const every = () => Net.mode === 'ably' ? C.everyAbly : C.everyRtc;
const rangeFor = () => Net.mode === 'ably' ? C.dAbly : C.dRtc;
const T0 = { toast: 0 };
let toastL = null;
function toast(a, b) { toastL = b ? [a, b] : [a]; toastT = toastL.join(' · '); toastAt = ut; T0.toast++; }   /* one note at a time: a new one replaces the last */
function send(o) {
  o.v = PROTO; o.t = ut;
  sentT[ut & 255] = ut; sentMs[ut & 255] = now();
  o.ht = lastRT; o.hh = lastRT < 0 ? 0 : Math.min(600000, Math.round(now() - lastRAt));
  return Net.send(o);
}
/* test counters (the harness reads them) */
const T = { asksSent: { u: 0, h: 0, b: 0 }, asksDone: { u: 0, h: 0, b: 0 }, hitIds: [], hostHitIds: [], evIn: 0, evUsed: 0, evLateDrop: 0, starts: 0, finishes: 0, solo: '' };
const tpush = (a, v) => { a.push(v); if (a.length > 600) a.splice(0, 100); };   /* the hit lists stay small in a long session */

/* ---------- HOST ---------- */
let run = 0, gIt = null, lastAsk = 0, asksIn = [], hostHead = null, lastSend = -99, lastIdle = -99;
const evQ = { seq: 0, q: [] };
function evAdd(code, kart, arg) {
  const a = [++evQ.seq, code, kart, arg];
  evQ.q.push({ at: now(), a, n: JSON.stringify(a).length + 1 }); if (evQ.q.length > 64) evQ.q.shift();
}
function evPending(t) {   /* never-sent events first (up to 600 characters), then resends newest first (up to 300), oldest first on the wire */
  const ttl = Net.mode === 'ably' ? C.evTtlAbly : C.evTtlRtc, q = evQ.q;
  let i = 0; while (i < q.length && t - q[i].at > ttl) i++; if (i) q.splice(0, i);
  if (!q.length) return [];
  const pick = []; let n = 0;
  for (const e of q) if (!e.sent && n + e.n <= 600) { e.sent = 1; e.p = t; pick.push(e); n += e.n; }
  for (let j = q.length - 1; j >= 0 && n < 300; j--) { const e = q[j]; if (e.p !== t && n + e.n <= 300) { e.p = t; pick.push(e); n += e.n; } }
  pick.sort((x, y) => x.a[0] - y.a[0]); return pick.map(e => e.a);
}
function hostSetup(sim) {
  curSim = sim; hostIdx = M.me[0];
  g = sim.karts.findIndex(k => k.who === 1 && !k.cpu);
  if (g < 0) return;
  sim.ext[g] = true;
  const ti = SK.TRACKS.indexOf(sim.track), gpo = M.gp;
  hostHead = [Math.max(0, ti), clamp(sim.karts[0].diff | 0, 0, 2), gpo ? clamp(gpo.round | 0, 0, 2) : -1].concat(sim.karts.map(k => k.who));
  if (!gIt) gIt = new Interp(rangeFor()[0], rangeFor()[1], every); gIt.clear();
  asksIn.length = 0; lastSend = -99;
  const step0 = sim.step, items0 = sim.stepItems, res0 = sim.results, boxes0 = sim.stepBoxes;
  sim.step = function (inp) { step0.call(this, inp); if (online && this === curSim) try { hostPost(this); } catch (e) { console.error('[kart net]', e); } };
  /* bubbles: the guest says which ones it took (ask 2); its kart here, drawn from its states, takes none (sim.js skips a lifted kart) */
  sim.stepBoxes = function () {
    const k = this.karts[g], on = online && this === curSim && this.ext[g], lift = k.lift;
    if (on) k.lift = 1;
    try { boxes0.call(this); } finally { if (on) k.lift = lift; }
  };
  /* the victim decides: a juice puddle or a seed that touches the guest's kart here is not ours to pop (the guest says) */
  sim.stepItems = function () {
    const before = this.items.slice(), e0 = this.events.length;
    items0.call(this);
    if (!online || this !== curSim) return;
    const by = [];
    for (let j = this.events.length - 1; j >= e0; j--) {
      const e = this.events[j];
      if (e[1] >= 0 && this.ext[e[1]] && ((e[0] === 'splat' && e[2] === 'hit') || (e[0] === 'pop' && e[2] === 'seed'))) { this.events.splice(j, 1); by.push(this.karts[e[1]]); }
    }
    if (!by.length) return;
    const kept = new Set(this.items);
    for (const it of before) if (by.length && !kept.has(it) && (it.k === 'splat' || it.k === 'seed') && it.age < it.life && it.life > 0) {
      const j = by.findIndex(k => (k.x - it.x) ** 2 + (k.y - it.y) ** 2 < 2.5); if (j >= 0) { this.items.push(it); by.splice(j, 1); }
    }
  };
  /* the results, kept from the moment the race is done (main asks once, when it shows them); the guest gets the same rows */
  sim.results = function () {
    let r = this._final;
    if (!r) { r = res0.call(this).map(x => ({ i: x.i, who: x.who, cpu: x.cpu, place: x.place, time: x.time, est: !!x.est })); if (this.done && M.sim === this && M.screen === 'race') this._final = r; }
    return r.map(x => Object.assign({}, x, { cpu: x.i !== hostIdx }));
  };
}
function hostPre(sim) {
  const k = sim.karts[g]; sim.ext[g] = true;
  /* startIn: a race picked before the guest's game has said a word waits before the "3" until it has (or the room's start
     time has passed), so both screens count down the same 3, 2, 1 */
  if (sim.phase === 'count' && !heardAny && now() < startAt && sim.cd < 200) { sim.cd = 200; holdUt = ut; }
  if (k.bumpT > 0) k.bumpT--;
  const r = gIt.at(now());
  if (r) applyKart(k, r.a, r.b, r.k);
}
function hostPost(sim) {   /* after the step, before main hears the events: the guest's asks, in order */
  for (const q of asksIn) {
    if (q[1] === 0) {
      const f = { i: g, x: q[3] / 16, y: q[4] / 16, dir: q[5] / 4096, v: q[6] / 64, s: q[7] / 16, lat: q[8] / 64, place: sim.karts[g].place, item: q[2], itemN: 1, boost: 0, shield: 0, star: 0 };
      const n0 = sim.items.length; P.useItem.call(sim, f);
      for (let j = n0; j < sim.items.length; j++) sim.items[j].rq = q[0];
      T.asksDone.u++;
    } else if (q[1] === 1) {
      const j = sim.items.findIndex(x => x.id === q[2]), by = BY[q[3]];
      if (j >= 0 && (sim.items[j].k === 'splat' || sim.items[j].k === 'seed')) sim.items.splice(j, 1);
      T.asksDone.h++;
      if (q[4] === 3) continue;   /* a seed that never reached the guest on its screen: gone here too, without a sound */
      if (q[4] === 0) sim.ev('hit', g, by); else if (q[4] === 1) sim.ev('shield', g, 'pop');
      if (by === 'splat') sim.ev('splat', g, 'hit'); else if (by === 'seed') sim.ev('pop', g, 'seed');
      tpush(T.hostHitIds, run + ':' + q[2]);
    } else if (q[1] === 2) {   /* the guest took it (and has its item): shown here even if a CPU reached it first on this screen */
      const b = sim.boxes[q[2]]; if (b) { if (b.t <= 0) b.t = SK.KART.BOX_BACK; sim.ev('box', g); }
      T.asksDone.b++;
    }
  }
  asksIn.length = 0;
}
function hostAfter(sim) {
  for (const e of sim.events) {   /* cosmetic events for the guest: not its own kart's (it makes those), not the countdown */
    const code = EVN.indexOf(e[0]); if (code < 0) continue;
    if (e[1] === g || (e[0] === 'bump' && e[2] === g) || (e[1] < 0 && e[0] !== 'pop') || (e[0] === 'drift' && e[2] !== 'hop')) continue;
    evAdd(code, e[1], encArg(e[2]));
  }
  if (ut - lastSend >= every()) sendSnap(sim);
}
function sendSnap(sim) {
  lastSend = ut;
  const r16 = v => ri(v * 16), its = [];
  for (const it of sim.items) {
    const kind = KIND.indexOf(it.k); if (kind < 0 || its.length >= 90) continue;
    const row = [it.id | 0 || 1, kind, r16(it.x), r16(it.y), r16(it.z || 0), clamp(it.own | 0, -1, 5), clamp(it.age | 0, 0, 1e6), clamp(it.rq | 0, 0, I31)];
    if (kind === 3) row.push(clamp(it.tgt | 0, -1, 5), ri(wrapA(+it.dir || 0) * 4096), r16(it.s), ri((+it.lat || 0) * 64));
    its.push(row);
  }
  const scr = M.screen, gpo = M.gp;
  const o = { k: 's', run, h: hostHead, ph: sim.phase === 'race' ? 1 : 0, cd: clamp(sim.cd | 0, 0, 9999), c: clamp(sim.clock | 0, 0, I31), sc: scr === 'results' ? 1 : scr === 'podium' ? 2 : 0,
    K: sim.karts.map(packX), B: sim.boxes.map(b => clamp(Math.round(b.t) || 0, -9999, 9999)), I: its, E: evPending(now()), a: lastAsk };
  if (gpo) o.gt = [0, 1, 2, 3, 4, 5].map(w => clamp(gpo.totals[w] | 0, 0, 9999));
  if (sim._final) o.R = sim._final.map(x => [x.i, clamp(x.place | 0, 1, sim.karts.length), clamp(Math.round(x.time) || 0, 0, I31), x.est ? 1 : 0]);
  if (!send(o)) { o.E = []; o.I = its.slice(0, 20); send(o); }   /* too big (it never should be): the essentials */
}
function onGuest(o) {
  const asks = o.q.slice().sort((x, y) => x[0] - y[0]);
  for (const q of asks) if (q[0] > lastAsk) { lastAsk = q[0]; if (o.run === run && curSim && M.sim === curSim) asksIn.push(q); }   /* each ask once; another race's are only acked */
  if (o.p && o.run === run && gIt) gIt.push(o.t * TICK, o.p, o._at);
}

/* ---------- GUEST ---------- */
let vIt = null, newestT = -1, gRunCur = -1, hdr = null, hostRes = null, hostSc = -1, latest = null, allowStart = false;
let askSeq = 0, asks = [], sendNow = false, lastGSend = -99;
const gone = new Map(), bursted = new Set(), takenUntil = new Int32Array(64), predSeqs = new Set(), owned = new Map(), ownedEver = new Set(), evIn = [], evSeen = new Int32Array(1024).fill(-1);
let evTop = 0, pred = [], replicas = [];
function evReset() { evTop = 0; evSeen.fill(-1); evIn.length = 0; }
const soloK = [], FAR = { i: -1, x: 1e7, y: 1e7, z: 0, finished: true, fall: 0, lift: 0 };   /* the karts a seed flown at us can meet: us */
/* a little stand-in sim for the look-ahead copies: sim.js's own item code, with nobody to hit */
const fake = { track: null, karts: [], items: [], loc: { ok: false, surf: 0, i: 0, s: 0, f: 0, d: 0, dist: 0, cx: 0, cy: 0 }, nextId: 1, rs: 7, events: [], fwd: null, fwdAll: false, hitFn: null,
  ev(n, i, a) { if (this.fwd && (this.fwdAll || (n === 'pop' && a === 'bomb'))) this.fwd.ev(n, i, a); }, hit(k, by) { return this.hitFn ? this.hitFn(k, by) : false; }, rand() { return P.rand.call(this); } };
function guestStart(o) {
  const h = o.h; hdr = { track: h[0], diff: h[1], gpRound: h[2], who: h.slice(3), gt: o.gt };
  gRunCur = o.run; hostRes = null; asks = []; gone.clear(); bursted.clear(); takenUntil.fill(0); predSeqs.clear(); owned.clear(); ownedEver.clear(); evIn.length = 0; pred = []; replicas = [];
  if (vIt) vIt.clear();
  allowStart = true; T.starts++;
  try { M.startRace({ players: 1, gp: hdr.gpRound >= 0, track: hdr.track, diff: hdr.diff, seed: (o.run * 7919 + 13) >>> 0 }); } finally { allowStart = false; }
  lastScr = M.screen;
}
function onSnap(o) {
  if (o.a > 0) asks = asks.filter(q => q[0] > o.a);
  if (o.t <= newestT && newestT - o.t < 3600) { S.old++; return; }   /* old or repeated (a jump back by a minute: the host restarted) */
  if (o.t < newestT) evReset();   /* a restarted host numbers its events from 1 again */
  newestT = o.t; hostSc = -1;
  if (verBad) return;
  if (o.run !== gRunCur) guestStart(o);
  if (!vIt) vIt = new Interp(rangeFor()[0], rangeFor()[1], every);
  const r = o.t * TICK;
  vIt.push(r, o, o._at);
  latest = { c: o.c, cd: o.cd, ph: o.ph, at: o._at, used: false };
  for (const e of o.E) {   /* new events only, in step with the view */
    const s = e[0]; if (s <= evTop - 512 || evSeen[s & 1023] === s) continue;
    evSeen[s & 1023] = s; if (s > evTop) evTop = s; evIn.push([r, e]); T.evIn++;
  }
  if (evIn.length > 128) evIn.splice(0, evIn.length - 128);
  if (o.R && o.run === gRunCur && !hostRes) hostRes = o.R;
  if (o.gt && hdr) hdr.gt = o.gt;
}
function onWait(o) {
  if (o.t <= newestT && newestT - o.t < 3600) { S.old++; return; }
  if (o.t < newestT) evReset();
  newestT = o.t; hostSc = o.sc;
  if (M.screen === 'race' || M.screen === 'results') { M.toTitle(); lastScr = 'title'; curSim = null; }
}
function guestSetup(sim) {
  curSim = sim; g = hdr ? hdr.who.indexOf(1) : -1; hostIdx = hdr ? hdr.who.indexOf(0) : -1;
  if (g < 0 || !sim.karts[g] || sim.karts[g].who !== 1) { g = -1; return; }
  for (let i = 0; i < sim.karts.length; i++) sim.ext[i] = i !== g;
  sim.useItems = false;   /* the host's bubbles and items: drawn from its snapshots, the guest's own touches decided below */
  const step0 = sim.step;
  sim.step = function (inp) { step0.call(this, inp); if (online && this === curSim) try { guestPost(this); } catch (e) { console.error('[kart net]', e); } };
  sim.useItem = guestUseItem;
  sim.results = function () {
    if (!hostRes || !online) return P.results.call(this);
    return hostRes.map(x => ({ i: x[0], who: this.karts[x[0]].who, cpu: x[0] !== g, place: x[1], time: x[2], est: !!x[3] }));
  };
}
/* our own juice, bombs and seeds: asked of the host; a look-ahead copy shows at once */
function guestUseItem(k) {
  const it = k.item;
  if (!online || this !== curSim || k.i !== g || !(it === I_SPLAT || it === I_BOMB || it === I_SEED)) return P.useItem.call(this, k);
  const seq = ++askSeq;
  asks.push([seq, 0, it, ri(k.x * 16), ri(k.y * 16), ri(k.dir * 4096), ri(k.v * 64), ri(k.s * 16), ri(k.lat * 64)]); T.asksSent.u++;
  sendNow = true;
  const n0 = pred.length;
  fake.track = this.track; fake.karts = this.karts; fake.items = pred; fake.fwd = this; fake.fwdAll = true; fake.hitFn = null;
  P.useItem.call(fake, k);   /* clears our slot, adds the copy, and its sound goes to our own sim */
  fake.fwdAll = false;
  for (let j = n0; j < pred.length; j++) pred[j].pred = seq;
  predSeqs.add(seq);
}
function guestPre(sim) {
  const t = now(), r = vIt ? vIt.at(t) : null;
  for (let i = 0; i < sim.karts.length; i++) { sim.ext[i] = i !== g; if (i !== g && sim.karts[i].bumpT > 0) sim.karts[i].bumpT--; }   /* bumpT: sim.js counts it down only in drive(), which these karts skip */
  if (r) {
    for (let i = 0; i < sim.karts.length; i++) if (i !== g) applyKart(sim.karts[i], r.a.K[i], r.b.K[i], r.k);
    /* the host's items, eased by id; ours (asked) and seeds flying at us are shown from our own copies */
    const prev = new Map(); if (r.a !== r.b) for (const row of r.a.I) prev.set(row[0], row);
    replicas = []; const vis = [];
    for (const row of r.b.I) {
      const id = row[0]; if (gone.has(id)) continue;
      const o = { id, k: KIND[row[1]], x: row[2] / 16, y: row[3] / 16, z: row[4] / 16, own: row[5], age: row[6], rq: row[7], life: 1e9 };
      if (row[1] === 3) { o.tgt = row[8]; o.dir = row[9] / 4096; o.s = row[10] / 16; o.lat = row[11] / 64; }
      const p = prev.get(id), f = clamp(r.k, 0, 1.6);
      if (p && (p[2] - row[2]) ** 2 + (p[3] - row[3]) ** 2 < 4096 * 16) { o.x = (p[2] + (row[2] - p[2]) * f) / 16; o.y = (p[3] + (row[3] - p[3]) * f) / 16; o.z = (p[4] + (row[4] - p[4]) * f) / 16; o.age = Math.max(0, Math.round(p[6] + (row[6] - p[6]) * Math.min(1, f))); }
      replicas.push(o);
      if (o.rq && predSeqs.has(o.rq)) { if (o.k !== 'splat') continue; for (let j = pred.length - 1; j >= 0; j--) if (pred[j].pred === o.rq) pred.splice(j, 1); }
      if (o.k === 'seed' && o.tgt === g && !(o.own === g)) {   /* a seed for us: flown here, against where we really are */
        if (!ownedEver.has(id)) { ownedEver.add(id); owned.set(id, { id: -id, k: 'seed', x: o.x, y: o.y, z: o.z, dir: o.dir, s: o.s, lat: o.lat, tgt: g, own: o.own, age: o.age, life: 720, rid: id }); }
        continue;
      }
      vis.push(o);
    }
    for (const [rid] of owned) if (!r.b.I.some(row => row[0] === rid)) owned.delete(rid);   /* gone at the host (it hit someone else first): gone here */
    for (const p of pred) vis.push(p);
    for (const s of owned.values()) vis.push(s);
    sim.items = vis;
    const B = r.b.B;
    for (let j = 0; j < sim.boxes.length; j++) sim.boxes[j].t = Math.max(j < B.length ? B[j] : 0, takenUntil[j] - ut);
  }
  /* the countdown and the race clock follow the host's (plus half the round trip), a tick at a time */
  const L = latest;
  if (L && !L.used) {
    L.used = true;
    const ahead = ((Net.rtt || 0) / 2 + (t - L.at)) / TICK;
    if (L.ph === 1) {
      if (sim.phase === 'count') { if (L.c + ahead > 6 && sim.cd > 1) sim.cd = 1; }
      else { const d = L.c + ahead - sim.clock; if (Math.abs(d) > 20) sim.clock = Math.max(0, Math.round(L.c + ahead)); else if (d > 1.5) sim.clock++; else if (d < -1.5 && sim.clock > 0) sim.clock--; }
    } else if (sim.phase === 'count') {
      const d = sim.cd - (L.cd - ahead), m = sim.cd % 60;
      if (Math.abs(d) > 20) sim.cd = Math.max(1, Math.round(L.cd - ahead)); else if (m >= 3 && m <= 57) { if (d > 1.5) sim.cd--; else if (d < -1.5) sim.cd++; }
    }
  }
}
function hitMe(sim, k, by) { const sh = k.shield, ok = sim.hit(k, by); return !ok ? 2 : sh && !k.shield ? 1 : 0; }
function ask(q) { q.unshift(++askSeq); asks.push(q); sendNow = true; T.asksSent[q[1] === 1 ? 'h' : q[1] === 2 ? 'b' : 'u']++; }
function guestPost(sim) {   /* after the step, before main hears the events */
  const k = sim.karts[g], K = SK.KART, ev = sim.events;
  for (let j = ev.length - 1; j >= 0; j--) if (ev[j][0] === 'bump' && typeof ev[j][2] === 'number' && ev[j][1] !== g && ev[j][2] !== g) ev.splice(j, 1);   /* two other karts: the host's events bring it */
  if (!hostRes) sim.done = false;   /* the race ends when the host's results are in */
  /* bubbles we touch are ours (we say so) */
  if (!k.fall && !k.lift && k.z <= 1.5) for (let j = 0; j < sim.boxes.length; j++) {
    const b = sim.boxes[j]; if (b.t > 0) continue;
    if ((k.x - b.x) ** 2 + (k.y - b.y) ** 2 < K.BOX_R * K.BOX_R) { b.t = K.BOX_BACK; takenUntil[j] = ut + K.BOX_BACK; sim.ev('box', g); if (!k.item && !k.roll) k.roll = 54; ask([2, j]); break; }   /* 54: sim.js's roulette */
  }
  /* the host's items that reach us: our call (the same reach as sim.js) */
  for (const it of replicas) {
    if (gone.has(it.id)) continue;
    const d2 = (k.x - it.x) ** 2 + (k.y - it.y) ** 2;
    if (it.k === 'splat') {
      if (!(it.own === g && it.age < 40) && k.z < 0.6 && d2 < 2.3) { const res = hitMe(sim, k, 'splat'); if (res !== 2 || k.star) { gone.set(it.id, ut); sim.ev('splat', g, 'hit'); ask([1, it.id, 0, res]); tpush(T.hitIds, gRunCur + ':' + it.id); } }
    } else if (it.k === 'burst') {
      if (it.age <= 6 && k.z < 2 && d2 < 11.5 && !bursted.has(it.id)) { bursted.add(it.id); const res = hitMe(sim, k, 'bomb'); if (res !== 2) { ask([1, it.id, 1, res]); tpush(T.hitIds, gRunCur + ':' + it.id); } }
    } else if (it.k === 'seed' && !(it.tgt === g && it.own !== g)) {
      if (!(it.own === g && it.age < 90) && d2 < 2.4) { const res = hitMe(sim, k, 'seed'); gone.set(it.id, ut); sim.ev('pop', g, 'seed'); ask([1, it.id, 2, res]); tpush(T.hitIds, gRunCur + ':' + it.id); }
    }
  }
  /* seeds flying at us, flown here against us alone (the other karts are the host's to hit: if it pops one on the way, the
     seed leaves the host's snapshots and guestPre drops it here); one that ends here without reaching us is dropped there too */
  if (owned.size) {
    soloK.length = sim.karts.length; for (let i = 0; i < soloK.length; i++) soloK[i] = i === g ? k : FAR;
    fake.track = sim.track; fake.karts = soloK; fake.fwd = null;
    for (const [rid, s] of owned) {
      let me = false; fake.items = [s]; fake.hitFn = kk => { if (kk === k) me = true; return false; };
      P.stepItems.call(fake);
      if (me) { const res = hitMe(sim, k, 'seed'); gone.set(rid, ut); sim.ev('pop', g, 'seed'); ask([1, rid, 2, res]); tpush(T.hitIds, gRunCur + ':' + rid); owned.delete(rid); }
      else if (!fake.items.length) { gone.set(rid, ut); ask([1, rid, 2, 3]); owned.delete(rid); }
    }
    fake.karts = sim.karts;
  }
  /* our own look-ahead copies */
  if (pred.length) { fake.items = pred; fake.fwd = sim; fake.hitFn = null; P.stepItems.call(fake); for (let j = pred.length - 1; j >= 0; j--) if (pred[j].k === 'splat' && pred[j].age > 600) pred.splice(j, 1); }
  fake.fwd = null;
  for (const [id, at] of gone) if (ut - at > 1800) gone.delete(id);
  /* the host's events, once the view has caught up with them */
  const rc = vIt && vIt.rc !== null ? vIt.rc : -1e12;
  let n = 0;
  for (const [r, e] of evIn) {
    if (r > rc + 1) break;
    n++;
    if (r < rc - C.evLate) { T.evLateDrop++; continue; }
    const kk = e[2]; if (kk >= sim.karts.length || kk === g) continue;
    sim.events.push([EVN[e[1]], kk, decArg(e[3])]); T.evUsed++;
  }
  if (n) evIn.splice(0, n);
}
function guestAfter(sim) {
  if (sendNow || ut - lastGSend >= every()) sendG(sim);
}
function sendG(sim) {
  sendNow = false; lastGSend = ut;
  const o = { k: 'g', run: sim && sim === curSim && g >= 0 ? gRunCur : -1 };
  if (o.run >= 0) o.p = packX(sim.karts[g]);
  if (asks.length) o.q = asks.slice(-32);
  send(o);
}

/* ---------- going on alone: the other kart joins the CPU racers, the race goes on ---------- */
function raceAlone(why) {
  const role = Net.role;
  if (why !== 'peer' && why !== 'exit') Net.leave();
  online = false; quiet = verBad = false; Net.role = null; Net.mode = 'solo'; T.solo = why;
  const sim = M && M.sim;
  if (sim && sim === curSim && g >= 0) {
    delete sim.step; delete sim.stepItems; delete sim.stepBoxes; delete sim.useItem; delete sim.results;
    if (role === 'host') { const k = sim.karts[g]; sim.ext[g] = false; k.cpu = true; k.bumpT = 0; SK.locate(sim.track, k.x, k.y, sim.loc); if (sim.loc.ok) { k.s = k.lastS = sim.loc.s; k.lat = sim.loc.d; } }
    else {
      sim.useItems = true;
      for (const k of sim.karts) {
        sim.ext[k.i] = false; if (k.i === g) continue;
        k.cpu = true; SK.locate(sim.track, k.x, k.y, sim.loc); if (sim.loc.ok) { k.s = k.lastS = sim.loc.s; k.lat = sim.loc.d; }
      }
      let id = 1; for (const it of replicas) id = Math.max(id, it.id + 1);
      sim.items = replicas.filter(it => it.k === 'splat').map(it => ({ id: it.id, k: 'splat', x: it.x, y: it.y, z: 0, own: it.own, age: it.age, life: 1800 }));
      sim.nextId = Math.max(sim.nextId, id); sim.done = false;
    }
  }
  curSim = null;
}
function peerLeft() {
  if (!online) return;
  const who = opp(), racing = M && M.screen === 'race', heard = heardAny, role = Net.role;
  raceAlone('peer');
  const what = heard ? who + ' left' : who + (role === 'host' ? ' couldn’t join' : ' couldn’t start');   /* never heard: the room's join timeout */
  toast(what, racing ? 'you race on with the CPUs' : 'you can play on your own');
}
const opp = () => Net.opp || 'your friend';

/* ---------- the link ---------- */
function link(m) {
  const role = m.role === 'host' || m.role === 'guest' ? m.role : null, mode = m.mode === 'rtc' || m.mode === 'ably' ? m.mode : null;
  if (!role || !mode) return;
  const first = !online || Net.role !== role, changed = Net.mode !== mode;
  Net.role = role; Net.mode = mode; Net.me = nm(m.me, 'Player'); Net.opp = nm(m.opp, 'Friend');
  if (changed) for (const it of [gIt, vIt]) if (it) it.range(rangeFor()[0], rangeFor()[1]);
  if (!first) return;
  online = true; heardAny = false; verBad = quiet = false; Net.rtt = 0; lastRT = -1; sentT.fill(-1); Net.lastIn = now();
  startAt = now() + clamp(+m.startIn || 0, 0, C.holdMax);   /* the room's agreed start: a host's first countdown waits for it (hostPre) */
  run = (Date.now() / 1000 | 0) % 100000 * 10; lastAsk = 0; asksIn.length = 0; evQ.q.length = 0;
  newestT = -1; gRunCur = -1; hdr = null; hostRes = null; hostSc = -1; latest = null; asks = []; askSeq = 0; curSim = null; g = -1; evReset();
  if (role === 'guest') myWho = 1;
  if (M && M.screen !== 'title') M.toTitle();
  lastScr = M ? M.screen : '';
}

/* ---------- SK.Main's hooks ---------- */
const hooks = {
  tick(u) {
    ut = u;
    if (!online) return;
    const t = now();
    quiet = Net.silence(t) > C.quiet && (heardAny || Net.role === 'guest' || M.screen === 'race');
    if (Net.rtt && t - rttPostAt >= 1000) { rttPostAt = t; Net.post({ ty: 'rtt', ms: Math.round(Net.rtt) }); }
    meterTick(t);
    const scr = M.screen;
    if (lastScr === 'race' && scr === 'title') { raceAlone('left'); return; }   /* the pause menu's BACK TO TITLE: the match ends, the other races on */
    lastScr = scr;
    if (Net.role === 'host') { if (!M.sim && ut - lastIdle >= C.idle) { lastIdle = ut; send({ k: 'w', sc: scr === 'tracks' ? 1 : 0 }); } }
    else {
      if (hostRes && scr === 'race' && M.sim === curSim && curSim) { curSim.done = true; T.finishes++; M.finish(); }
      if ((!M.sim || M.sim !== curSim) && ut - lastGSend >= C.idle) sendG(null);
    }
  },
  canStart() { return !(online && Net.role === 'guest' && !allowStart); },
  racers(o) {
    if (!online) {   /* after an online race as MARIGOLD, a lone player stays MARIGOLD */
      if (myWho === 1 && o.players === 1) for (const r of o.racers) r.who = r.who === 0 ? 1 : r.who === 1 ? 0 : r.who;
      return;
    }
    if (Net.role === 'host') {
      for (const r of o.racers) if (r.who === 1) r.cpu = false;
      o.me = [o.racers.findIndex(r => r.who === 0)]; o.players = 1; run++;
    } else if (hdr) {
      o.racers.length = 0; for (const w of hdr.who) o.racers.push({ who: w, cpu: w > 1, diff: hdr.diff });
      o.me = [hdr.who.indexOf(1)]; o.players = 1;
      if (o.gp && hdr.gpRound >= 0) { o.gp.round = hdr.gpRound; o.gp.totals = {}; if (hdr.gt) hdr.gt.forEach((p, w) => { if (p) o.gp.totals[w] = p; }); }
    }
  },
  beforeStep(sim) {
    if (!online) return;
    if (sim !== curSim) { if (Net.role === 'host') hostSetup(sim); else guestSetup(sim); }
    if (g < 0) return;
    if (Net.role === 'host') hostPre(sim); else guestPre(sim);
  },
  afterStep(sim) {
    if (!online || sim !== curSim || g < 0) return;
    if (Net.role === 'host') hostAfter(sim); else guestAfter(sim);
  },
  next() { return !(online && Net.role === 'guest' && !(hdr && hdr.gpRound === 2 && M.gp)); },   /* a guest moves on only to its Grand Prix podium */
  key(c) {
    if (!online) return false;
    if (quiet || verBad) { if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') { raceAlone(verBad ? 'version' : 'quiet'); return true; } return false; }
    if (Net.role === 'guest' && (M.screen === 'title' || M.screen === 'tracks')) return !(c === 'Escape' || c === 'Backspace');   /* waiting: only leaving */
    return false;
  },
  tap() { if (online && (quiet || verBad)) { raceAlone(verBad ? 'version' : 'quiet'); return true; } return false; },
  screen(name, S) {
    if (!online) return;
    if (name === 'title' && Net.role === 'guest') { S.online = true; S.onlineText = ' '; S.onlineSub = ''; }   /* the card only: its words are drawn in draw(), fitted to it */
    else if (name === 'results' && Net.role === 'guest' && !(hdr && hdr.gpRound === 2 && M.gp)) { S.prompt = 'Waiting for ' + opp() + '…'; S.prompt2 = 'They start the next race' + (S.prompt2 ? ' · Esc: leave' : ''); }
  },
  draw(ctx, W, H) {
    const RD = SK.Render; if (!RD || !RD.text) return;
    const scr = M.screen, sun = (RD.PAL && RD.PAL.sun) || '#ffd93b';
    if (online && Net.role === 'host' && scr === 'title') {   /* over the title's last hint line: either row races online */
      ctx.fillStyle = 'rgba(43,33,64,.94)'; rr(ctx, W / 2 - 280, H - 35, 560, 27, 13); ctx.fill();
      fit(ctx, 'Online with ' + opp() + ' · you pick the race · you drive SPRIG', W / 2, H - 21, 13, sun, 530);
    }
    if (online && Net.role === 'guest' && scr === 'title') {   /* the waiting card (render.js draws it 380 wide at y 150-270): two short lines, fitted */
      const cx = W / 2;
      if (hostSc === 1) { fit(ctx, opp() + ' is picking', cx, 184, 20, sun, 350); fit(ctx, 'a track…', cx, 211, 18, sun, 350); }
      else if (heardAny) { fit(ctx, 'Waiting for ' + opp(), cx, 184, 20, sun, 350); fit(ctx, 'to choose a race…', cx, 211, 18, sun, 350); }
      else fit(ctx, 'Waiting for ' + opp() + '…', cx, 196, 20, sun, 350);
      RD.text(ctx, 'You drive MARIGOLD, the orange kart', cx, 244, 14, '#fff');
    }
    if (online && Net.role === 'host' && scr === 'race' && ut - holdUt < 3) {   /* the countdown waits for the guest (startIn) */
      ctx.fillStyle = 'rgba(43,33,64,.9)'; rr(ctx, W / 2 - 150, 120, 300, 40, 20); ctx.fill();
      fit(ctx, 'Waiting for ' + opp() + '…', W / 2, 140, 18, sun, 276);
    }
    const age = ut - toastAt;
    if (toastL && age < 330) {   /* in a race: below the lap counter; on the title: above the logo, between the sound chips; on results: at the foot */
      const race = scr === 'race', foot = scr === 'results' || scr === 'podium', sz = race ? [16, 13] : [15, 12], lh = race ? 19 : 16;
      const maxW = race ? W - 160 : foot ? W - 80 : W - 330;   /* race: clear of the item slot and its key hint (x < 80) and the lap block */
      let w = 0; toastL.forEach((s, i) => { w = Math.max(w, RD.text(NOCTX, s, 0, 0, sz[i])); });
      const pw = Math.min(maxW, w + 28), ph = 8 + toastL.length * lh, py = race ? 66 : foot ? H - ph - 6 : 2;
      ctx.globalAlpha = Math.min(1, (330 - age) / 30);
      ctx.fillStyle = 'rgba(43,33,64,.94)'; rr(ctx, W / 2 - pw / 2, py, pw, ph, Math.min(16, ph / 2)); ctx.fill();
      toastL.forEach((s, i) => fit(ctx, s, W / 2, py + 4 + lh / 2 + i * lh, sz[i], i ? '#e9e3ff' : '#fff', pw - 20));
      ctx.globalAlpha = 1;
    }
    if (online && verBad) RD.screen(ctx, 'msg', { W, H, text: 'Refresh the page\nto race together\nSPACE or tap: race on alone' });
    else if (online && quiet) RD.screen(ctx, 'msg', { W, H, text: opp() + ' went quiet\nSPACE or tap: race on alone' });
  },
  live() { return online; }
};
const NOCTX = { drawImage() {} };   /* RD.text draws one cached image and returns the text's width: with this it only measures */
function fit(ctx, s, x, y, size, col, maxW, align) { const w = SK.Render.text(NOCTX, s, 0, 0, size); if (w > maxW) size = Math.max(8, Math.floor(size * maxW / w * 2) / 2); return SK.Render.text(ctx, s, x, y, size, col, align); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* ---------- SK.Net ---------- */
const Net = SK.Net = {
  role: null, mode: 'solo', me: '', opp: '', rtt: 0, lastIn: 0, PROTO, MAXMSG, valid, Interp, stats: S, C, debug: /[?&]debug=1/.test(location.search),
  init(c) {
    cb = c || {}; M = cb.main || SK.Main;
    if (M && M.hooks && P) Object.assign(M.hooks, hooks);
    while (early.length) { const [m, at] = early.shift(); try { handle(m, at); } catch (e) { console.error('[kart net]', e); } }
  },
  send(o) {
    if (!online || !o) return false;
    const d = JSON.stringify(o);
    if (d.length > MAXMSG) { S.big++; if (S.big < 4) console.warn('[kart net] message too big: ' + d.length); return false; }
    this.post({ ty: 'net', d }); S.outN++; S.outB += d.length;
    const k = o.k; if (S.max[k] !== undefined) { S.n[k]++; S.sum[k] += d.length; if (d.length > S.max[k]) S.max[k] = d.length; }
    return true;
  },
  /* every message to the parent goes here (main.js uses it too); an exit ends the match (the room says goodbye for us) */
  post(o) { try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} if (o && o.ty === 'exit' && online) raceAlone('exit'); },
  leave() { if (!this.role) return; this.post({ ty: 'leave' }); },
  silence(t) { return (t == null ? now() : t) - this.lastIn; },
  meter() { return this.mode + (this.rtt ? ' ' + Math.round(this.rtt) + ' ms' : '') + (S.rate ? ' · ' + S.rate : '') + (S.bad ? ' · bad ' + S.bad : ''); },
  /* for tests: the state of the link and the race, read only */
  get state() {
    return { online, role: this.role, mode: this.mode, quiet, verBad, rtt: Math.round(this.rtt), g, hostIdx, run, gRunCur, hostRes: !!hostRes, hostSc, asks: asks.length, lastAsk, askSeq,
      askHits: asks.filter(q => q[1] === 1).map(q => gRunCur + ':' + q[2]), pred: pred.length, owned: owned.size, gone: gone.size, evQ: evQ.q.length, toast: toastT, toasts: T0.toast, silence: Math.round(this.silence()), holding: ut - holdUt < 3,
      D: (vIt || gIt) ? Math.round((vIt || gIt).D) : 0, interp: (vIt || gIt) ? Object.assign({}, (vIt || gIt).n) : null };
  },
  get test() { return T; },
  get replicas() { return replicas; }
};
})();
