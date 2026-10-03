/* Berry Breeze — net.js (NET engineer). The game side of online co-op, SPEC.md section 6:
   the parent link (postMessage, same origin only), checks on everything that arrives, the interpolation clock (Interp),
   host grants and cosmetic events, the 12-int ship pack, and RTT. The parent page (the planet's breezeRoom, or
   test/nettest.html) only moves strings between the two browsers. Solo play is mode 'solo' and sends nothing. */
'use strict';
(function () {
const C = BB.C, N = C.NET, TICK = C.TICK, MAXMSG = N.maxMsg || 6000, I31 = 2147483647;
const now = () => performance.now();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const isI = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;

/* ---------- message checks: integers only, sane ranges and lengths; anything else is dropped ---------- */
let why = '';
const no = w => { why = w; return false; };
const XY = [-3000, 3000];
const SHIP_R = [[-800, 1800], [-800, 2000], [0, 63], [0, 9], [0, 3], [0, 2], [0, 2], [0, 2], [0, 60], [0, 99999], [0, I31], [0, 2]];
const E_R = [[0, 9999], [0, BB.TYPE_LIST.length - 1], XY, XY, [-1, 99999], [0, 15]];
const B_R = [[0, 19999], XY, XY];
const F_R = [[0, 999], [0, 6], XY, XY, [0, 3], [0, 1]];
const okShip = (a, w) => { if (!Array.isArray(a) || a.length !== 12) return no(w); for (let i = 0; i < 12; i++) if (!isI(a[i], SHIP_R[i][0], SHIP_R[i][1])) return no(w + '[' + i + ']'); return true; };
const okFlat = (a, w, n, R, tag) => { if (!Array.isArray(a) || a.length % w || a.length > w * n) return no(tag); for (let i = 0; i < a.length; i++) { const r = R[i % w]; if (!isI(a[i], r[0], r[1])) return no(tag + '[' + i + ']'); } return true; };
const okG = a => { if (!Array.isArray(a) || a.length > 32) return no('g'); for (const g of a) if (!Array.isArray(g) || g.length !== 3 || !isI(g[0], 1, I31) || typeof g[1] !== 'string' || g[1].length !== 1 || 'fhrw'.indexOf(g[1]) < 0 || !isI(g[2], -9999, 9999)) return no('g.item'); return true; };
const TXT = /[\u0000-\u001f\u007f<>\\"`]/g, TXT1 = new RegExp(TXT.source); /* sticker text ('Zzz...', 'TEAM TOSS!', '♥') is only ever drawn on a canvas */
const okArg = v => (typeof v === 'number' && isI(v, -1e7, 1e7)) || (typeof v === 'string' && v.length <= 24 && !TXT1.test(v));
const okEv = a => { if (!Array.isArray(a) || a.length > 48) return no('ev'); for (const e of a) { if (!Array.isArray(e) || e.length < 2 || e.length > 8 || !isI(e[0], 1, I31) || typeof e[1] !== 'string' || !/^[A-Z]$/.test(e[1])) return no('ev.item'); for (let i = 2; i < e.length; i++) if (!okArg(e[i])) return no('ev.arg'); } return true; };
const fill = (o, ks) => { for (const k of ks) if (o[k] === undefined) o[k] = []; if (o.ht === undefined) o.ht = -1; if (o.hh === undefined) o.hh = 0; };
const valid = {
  snap(o) {
    if (!o || typeof o !== 'object' || o.k !== 's') return no('k');
    fill(o, ['e', 'b', 'i', 'g', 'ev']); /* empty arrays may be left out */
    return (isI(o.v, 0, 999) || no('v')) && (isI(o.run, 0, 1e9) || no('run')) && (isI(o.p, 0, 1) || no('p')) && (isI(o.t, 0, I31) || no('t')) &&
      (isI(o.sk, 0, I31) || no('sk')) && (isI(o.st, 0, 2) || no('st')) && (isI(o.ph, 0, 4) || no('ph')) && (isI(o.sc, 0, I31) || no('sc')) &&
      (isI(o.bk, 0, 1e7) || no('bk')) && (isI(o.bm, 0, 1e6) || no('bm')) && okShip(o.h, 'h') &&
      okFlat(o.e, 6, 48, E_R, 'e') && okFlat(o.b, 3, C.MAX_EBUL + 16, B_R, 'b') && okFlat(o.i, 6, C.MAX_FRUIT + 4, F_R, 'i') && okG(o.g) && okEv(o.ev) &&
      (isI(o.ht, -1, I31) || no('ht')) && (isI(o.hh, 0, 600000) || no('hh'));
  },
  guest(o) {
    if (!o || typeof o !== 'object' || o.k !== 'g') return no('k');
    fill(o, []);
    if (o.ga === undefined) o.ga = 0;
    return (isI(o.v, 0, 999) || no('v')) && (isI(o.run, 0, 1e9) || no('run')) && (isI(o.t, 0, I31) || no('t')) && okShip(o.s, 's') &&
      (isI(o.ga, 0, I31) || no('ga')) && (isI(o.ht, -1, I31) || no('ht')) && (isI(o.hh, 0, 600000) || no('hh'));
  },
  get why() { return why; }
};
/* one bad row (a float or NaN from an engine bug) drops only that enemy, bullet, fruit or event, not the whole snapshot,
   so the guest's view never freezes on it; the header, the ship pack and the grants stay strict */
function prune(o) {
  for (const [key, w, R] of [['e', 6, E_R], ['b', 3, B_R], ['i', 6, F_R]]) {
    const a = o[key]; if (!Array.isArray(a) || a.length % w) continue;
    let out = null;
    for (let j = 0; j < a.length; j += w) {
      let ok = true; for (let c = 0; c < w; c++) if (!isI(a[j + c], R[c][0], R[c][1])) { ok = false; break; }
      if (!ok) { if (!out) out = a.slice(0, j); S.fixed++; } else if (out) for (let c = 0; c < w; c++) out.push(a[j + c]);
    }
    if (out) o[key] = out;
  }
  if (Array.isArray(o.ev) && o.ev.length <= 48) { const ok = o.ev.filter(e => okEv([e])); if (ok.length !== o.ev.length) { S.fixed += o.ev.length - ok.length; o.ev = ok; } }
}

/* ---------- Interp: snapshot interpolation on a render clock that never steps ----------
   offset = min over the last 2 s of (arrival - remoteMs); D = clamp(jitter spread over 3 s + one send interval + 8 ms, min, max);
   the render clock runs at 0.95-1.05 of real time towards now - offset - D. The spread is the 95th percentile minus the
   minimum, so one stray packet does not double the delay. Reset of the offset: a mode change, a gap over 500 ms, or a
   shift over 300 ms (earlier at once, later only when every sample of the last 500 ms is late). After a reset the clock
   is placed once if it would starve (ahead of the new target by > 50 ms) or lag far behind (> 300 ms); otherwise it slews.
   A host whose simulation runs slow (a struggling phone at the 4-tick cap) sends remote time slower than real time: when the
   measured remote rate is under 0.975 the clock runs at that rate (still within ±5% of it) and the offset follows the drift,
   instead of the view freezing over and over. At full speed (rate 1) this is exactly the rule above. */
class Interp {
  constructor(dMin, dMax, every) { this.dMin = dMin; this.dMax = dMax; this.every = every || 0; this.res = { a: null, b: null, k: 0, held: false, extra: 0 }; this.reset(); }
  reset() { this.buf = []; this.win = []; this.off = null; this.offAt = 0; this.base = 1; this.rate = 1; this.rw = []; this.lowT = 0; this.highT = 0; this.D = this.dMin; this.rc = null; this.last = 0; this.lastPush = -1e9; this.re = 0; this.dKeep = 0; this.keepTo = 0; this.n = { push: 0, old: 0, resets: 0, at: 0, extra: 0, held: 0 }; }
  range(dMin, dMax, every) { this.dMin = dMin; this.dMax = dMax; if (every) this.every = every; this.D = clamp(this.D, dMin, dMax); this.resetOffset(); this.rw.length = 0; }
  resetOffset() { this.win.length = 0; this.re = 1; this.dKeep = this.D; this.n.resets++; }
  push(r, sample, at) {
    if (at == null) at = now();
    const b = this.buf, n = b.length;
    if (n && r <= b[n - 1].r) { this.n.old++; return false; } /* older than the newest: dropped */
    const lat = at - r;
    if (this.off !== null && (at - this.lastPush > 500 || lat < this.cur(at) - 300)) { this.resetOffset(); this.rw.length = 0; }
    this.lastPush = at; this.n.push++;
    b.push({ r, s: sample }); if (b.length > 32) b.shift();
    const w = this.win; w.push(at, lat);
    let i = 0; while (i < w.length && w[i] < at - 3000) i += 2; if (i) w.splice(0, i);
    const v = this.rw; v.push(at, lat); i = 0; while (i < v.length && v[i] < at - 3000) i += 2; if (i) v.splice(0, i);
    const m = v.length >> 1;
    if (m >= 8 && at - v[0] > 1500) { /* remote rate = 1 - d(lat)/d(arrival), least squares over 3 s; acted on after 1 s below 0.975 (or above 0.985 to stop) */
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
    let D = clamp(spread + (this.every || BB.Net.sendEvery()) * TICK + 8, this.dMin, this.dMax);
    if (this.re === 1) { this.re = 2; this.keepTo = at + 1000; }
    if (at < this.keepTo) D = Math.max(D, clamp(this.dKeep, this.dMin, this.dMax)); /* a fresh window has no spread yet: keep the old delay a second */
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
    if (rc >= nw.r) { /* the buffer is dry: carry on along the last step for up to 100 ms, then hold */
      const extra = rc - nw.r; o.extra = extra; o.held = extra > 100; if (extra > 0) this.n.extra++; if (o.held) this.n.held++;
      if (n < 2) { o.a = o.b = nw.s; o.k = 0; return o; }
      const a = b[n - 2]; o.a = a.s; o.b = nw.s; o.k = 1 + Math.min(extra, 100) / (nw.r - a.r); return o;
    }
    o.held = false; o.extra = 0;
    if (rc <= b[0].r) { o.a = o.b = b[0].s; o.k = 0; return o; }
    let i = n - 2; while (i > 0 && b[i].r > rc) i--;
    const a = b[i], c = b[i + 1]; o.a = a.s; o.b = c.s; o.k = (rc - a.r) / (c.r - a.r); return o;
  }
  cur(t) { return this.off + (1 - this.base) * (t - this.offAt); } /* the offset now (it drifts only while the host runs slow) */
  until(r, t) { /* ms until the render clock reaches remote time r (to show a cosmetic event in step with the view) */
    if (this.rc === null) return 0; return clamp(r - this.rc - ((t == null ? now() : t) - this.last), 0, this.dMax);
  }
}

/* ---------- RTT: the sender keeps sentAt[t]; the receiver echoes ht (its newest remote tick) and hh (ms held) ---------- */
const sentT = new Int32Array(128).fill(-1), sentMs = new Float64Array(128);
let lastRT = -1, lastRAt = 0, rttPostAt = 0;
function heard(o, at) {
  if (o.t > lastRT || o.t < lastRT - 3600) { lastRT = o.t; lastRAt = at; } /* a jump back by a minute: the other side restarted */
  if (o.ht >= 0 && sentT[o.ht & 127] === o.ht) { const s = at - sentMs[o.ht & 127] - o.hh; if (s >= 0 && s < 10000) Net.rtt = Net.rtt ? Net.rtt * 0.8 + s * 0.2 : s; }
}

/* ---------- how late a snapshot is, for the 500 ms rule on events ---------- */
const lw = []; let lastSnapR = -1, lastLate = 0, lastLateAt = 0, lastP = 0;
function lateness(o, at) {
  const r = o.t * TICK, lat = at - r;
  if (lastP && !o.p) lw.length = 0; lastP = o.p; /* the host is back from a hidden tab: its clock stood still, so the old samples no longer apply */
  if (!o.p && r > lastSnapR) lw.push(at, lat); /* a hidden host's 500 ms repeats (p=1, the same t) are not samples of the path */
  let i = 0; while (i < lw.length && lw[i] < at - 2000) i += 2; if (i) lw.splice(0, i);
  let m = lw.length ? 1e12 : lat; for (let j = 1; j < lw.length; j += 2) if (lw[j] < m) m = lw[j];
  const ttl = Net.mode === 'ably' ? N.evTtlAbly : N.evTtlRtc;
  const age = lastSnapR < 0 ? 0 : r > lastSnapR ? Math.min(ttl, r - lastSnapR) : ttl; /* an event is at most this old when first sent in this snapshot */
  if (r > lastSnapR) lastSnapR = r;
  o._late = lastLate = (lat - m) + age; o._at = lastLateAt = at;
}

/* ---------- traffic stats for the debug meter ---------- */
const S = { inN: 0, inB: 0, outN: 0, outB: 0, bad: 0, big: 0, fixed: 0, t0: 0, rate: '' };
function meterTick(t) { if (t - S.t0 < 1000) return; const k = 1000 / (t - S.t0); S.rate = Math.round(S.inN * k) + '/s ' + Math.round(S.inB / Math.max(1, S.inN)) + ' B in · ' + Math.round(S.outN * k) + '/s ' + Math.round(S.outB / Math.max(1, S.outN)) + ' B out'; S.inN = S.inB = S.outN = S.outB = 0; S.t0 = t; }

/* ---------- incoming: only from our own parent page, same origin ---------- */
let cb = null; const early = [], regs = [];
function setRange(it) { const ab = Net.mode === 'ably'; if (it.kind === 'ship') { const d = ab ? N.dShipAbly : N.dShipRtc, m = ab ? N.dShipMaxAbly : N.dShipMaxRtc; it.range(d, Math.max(d, m || d)); } else { const r = ab ? N.dAbly : N.dRtc; it.range(r[0], r[1]); } }
function link(m) {
  const role = m.role === 'host' || m.role === 'guest' ? m.role : null, mode = m.mode === 'rtc' || m.mode === 'ably' ? m.mode : null;
  if (!role || !mode) return;
  const first = Net.mode === 'solo' || Net.role !== role, changed = Net.mode !== mode;
  Net.role = role; Net.mode = mode; Net.me = nm(m.me, 'Player'); Net.opp = nm(m.opp, 'Friend');
  if (first) { Net.rtt = 0; lastRT = -1; sentT.fill(-1); lastSnapR = -1; lw.length = 0; lastP = 0; Net.verBad = 0; Net.lastIn = now(); }
  if (changed) for (const it of regs) setRange(it);
  cb.onLink && cb.onLink({ role, mode, me: Net.me, opp: Net.opp, startIn: clamp(+m.startIn || 0, 0, 15000), first, changed });
}
function peerLeft() { if (Net.mode === 'solo') return; const was = Net.role; Net.mode = 'solo'; Net.role = null; cb.onPeerLeft && cb.onPeerLeft(was); }
function recv(d, at) {
  if (Net.mode === 'solo' || d.length > MAXMSG) return;
  let o = null; try { o = JSON.parse(d); } catch (_) { o = null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) { S.bad++; return; }
  if (o.k === 'bye') { peerLeft(); return; }
  const want = Net.role === 'guest' ? 's' : 'g'; /* a host only listens to a guest, a guest only to a host */
  if (o.k !== want) { S.bad++; return; }
  if (o.v !== C.PROTO) { if (Number.isInteger(o.v)) { Net.verBad = o.v; cb.onMsg && cb.onMsg({ k: 'ver', v: o.v }); } return; }
  if (want === 's') { const f0 = S.fixed; prune(o); if (S.fixed > f0 && (f0 === 0 || Net.debug)) console.warn('[breeze net] dropped bad rows from a snapshot: ' + why); }
  if (!(want === 's' ? valid.snap(o) : valid.guest(o))) { S.bad++; if (S.bad < 4 || Net.debug) console.warn('[breeze net] dropped a bad message: ' + why); return; }
  S.inN++; S.inB += d.length; Net.lastIn = at;
  heard(o, at); if (want === 's') lateness(o, at); else o._at = at;
  cb.onMsg && cb.onMsg(o);
}
function handle(m, at) {
  switch (m.ty) {
    case 'link': link(m); break;
    case 'net': if (typeof m.d === 'string') recv(m.d, at); break;
    case 'peer': if (m.left) peerLeft(); break;
    case 'mute': cb.onMute && cb.onMute(!!m.on); break;
  }
}
addEventListener('message', e => {
  if (parent === window || e.source !== parent || e.origin !== location.origin) return;
  const m = e.data; if (!m || typeof m !== 'object' || typeof m.ty !== 'string') return;
  const at = now();
  if (!cb) { if (early.length < 16) early.push([m, at]); return; } /* before init: kept for it */
  handle(m, at);
});

/* ---------- BB.Net ---------- */
const Net = BB.Net = {
  mode: 'solo', role: null, me: '', opp: '', rtt: 0, lastIn: 0, verBad: 0, debug: /[?&]debug=1/.test(location.search),
  F: { FIRE: 1, CHARGE: 2, BLINK: 4, DOWN: 8, HIDDEN: 16 },
  valid, Interp, stats: S,
  init(c) { cb = c || {}; while (early.length) { const [m, at] = early.shift(); handle(m, at); } },
  sendEvery() { return this.mode === 'ably' ? N.everyAbly : N.everyRtc; },
  /* one 'u' message to the other browser; ht/hh are filled in and t is stamped for the RTT */
  send(o) {
    if (this.mode === 'solo' || !o) return false;
    const t = now();
    if ((o.k === 's' || o.k === 'g') && Number.isInteger(o.t)) { sentT[o.t & 127] = o.t; sentMs[o.t & 127] = t; if (o.ht === undefined) { o.ht = lastRT; o.hh = lastRT < 0 ? 0 : Math.min(600000, Math.round(t - lastRAt)); } }
    const d = JSON.stringify(o);
    if (d.length > MAXMSG) { S.big++; if (S.big < 4 || this.debug) console.warn('[breeze net] message too big: ' + d.length); return false; }
    this.post({ ty: 'net', d }); S.outN++; S.outB += d.length; meterTick(t);
    if (this.rtt && t - rttPostAt > 2000) { rttPostAt = t; this.post({ ty: 'rtt', ms: Math.round(this.rtt) }); }
    return true;
  },
  post(o) { try { if (parent !== window) parent.postMessage(o, location.origin); } catch (_) {} },
  leave() { if (this.mode === 'solo') return; this.post({ ty: 'leave' }); this.mode = 'solo'; this.role = null; }, /* the game ends co-op itself (guest flies on alone) */
  interp(kind) { const it = new Interp(1, 1); it.kind = kind === 'ship' ? 'ship' : 'view'; setRange(it); regs.push(it); if (regs.length > 8) regs.shift(); return it; },
  silence(t) { return (t == null ? now() : t) - this.lastIn; },
  meter() { return this.mode + (this.rtt ? ' ' + Math.round(this.rtt) + ' ms' : '') + (S.rate ? ' · ' + S.rate : '') + (S.bad ? ' · bad ' + S.bad : '') + (S.fixed ? ' · fixed ' + S.fixed : ''); },
  /* grants: power-ups, heart gifts, revives and rainbows for the guest, repeated until acked */
  grants: {
    seq: 0, list: [], ga: 0,
    add(code, arg) { const s = ++this.seq; this.list.push([s, code, arg | 0]); if (this.list.length > 32) this.list.shift(); return s; },
    pending() { return this.list; },
    ack(ga) { if (Number.isInteger(ga) && this.list.length && ga >= this.list[0][0]) this.list = this.list.filter(g => g[0] > ga); },
    apply(list, fn) { /* guest: fn(code, arg, seq) once per new seq, in order; returns ga for the next guest packet */
      if (Array.isArray(list) && list.length) { const s = list.length > 1 ? list.slice().sort((x, y) => x[0] - y[0]) : list; for (const g of s) if (g[0] > this.ga) { this.ga = g[0]; fn(g[1], g[2], g[0]); } }
      return this.ga;
    }
  },
  /* events: cosmetic only; resent for their TTL (rtc 300 ms, ably 800 ms) with no acks */
  events: {
    seq: 0, q: [], seen: new Int32Array(512).fill(-1), top: 0,
    add(code, ...args) {
      const a = [++this.seq, code]; for (const v of args) a.push(typeof v === 'number' ? Math.round(v) || 0 : v == null ? 0 : String(v).replace(TXT, '').slice(0, 24));
      if (Net.mode !== 'solo') { this.q.push({ at: now(), a, n: JSON.stringify(a).length + 1 }); if (this.q.length > 64) this.q.shift(); }
      return this.seq;
    },
    pending(t) { /* oldest first, about 300 characters. Events never sent yet go first (up to 600 in a burst), then resends,
                    newest first: so every event leaves in the first snapshot after it happened and the guest can tell its age */
      if (t == null) t = now(); const ttl = Net.mode === 'ably' ? N.evTtlAbly : N.evTtlRtc, q = this.q;
      let i = 0; while (i < q.length && t - q[i].at > ttl) i++; if (i) q.splice(0, i);
      if (!q.length) return [];
      const pick = []; let n = 0;
      for (const e of q) if (!e.sent && n + e.n <= 600) { e.sent = 1; e.p = t; pick.push(e); n += e.n; }
      for (let j = q.length - 1; j >= 0 && n < 300; j--) { const e = q[j]; if (e.p !== t && n + e.n <= 300) { e.p = t; pick.push(e); n += e.n; } }
      pick.sort((x, y) => x.a[0] - y.a[0]); return pick.map(e => e.a);
    },
    fresh(list, t) { /* guest: the events not seen before and at most 500 ms late; pass the snapshot itself or its ev list */
      if (t == null) t = now(); let late = lastLate + (t - lastLateAt);
      if (list && !Array.isArray(list)) { late = (list._late || 0) + (t - (list._at || t)); list = list.ev; }
      const out = []; if (!Array.isArray(list)) return out;
      for (const e of list) {
        const s = e[0]; if (s <= this.top - 256 || this.seen[s & 511] === s) continue;
        this.seen[s & 511] = s; if (s > this.top) this.top = s;
        if (late <= N.evLate) out.push(e);
      }
      return out;
    }
  },
  /* the ship pack, 12 ints: [x4, y4, f, hp, sh, bd, sp, sr, ch, bub, sn, sl] (clamped to what valid.* accepts) */
  pack(s) {
    const r = Math.round;
    return [clamp(r(s.x * 4) || 0, -800, 1800), clamp(r(s.y * 4) || 0, -800, 2000), (s.f | 0) & 63, clamp(s.hp | 0, 0, 9), clamp(s.shield | 0, 0, 3), clamp(s.buddies | 0, 0, 2),
      clamp(s.spd | 0, 0, 2), clamp(s.spread | 0, 0, 2), clamp(r(s.charge || 0), 0, 60), clamp(s.bub | 0, 0, 99999), (s.sn | 0) & I31, clamp(s.sl | 0, 0, 2)];
  },
  unpack(a, o) {
    o = o || {}; o.x = a[0] / 4; o.y = a[1] / 4; o.f = a[2]; o.hp = a[3]; o.shield = a[4]; o.buddies = a[5]; o.spd = a[6]; o.spread = a[7]; o.charge = a[8]; o.bub = a[9]; o.sn = a[10]; o.sl = a[11];
    o.firing = !!(a[2] & 1); o.charging = !!(a[2] & 2); o.blink = !!(a[2] & 4); o.down = !!(a[2] & 8); o.hidden = !!(a[2] & 16); return o;
  }
};
})();
