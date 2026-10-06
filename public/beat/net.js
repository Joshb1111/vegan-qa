/* BEET BEAT — net.js (NET). The game side of an online race: the parent link (postMessage to and from our own parent page,
   same origin only), strict checks on everything that arrives, events sent until acknowledged, RTT, silence, and the ghost
   (the other runner, drawn from its states and carried forward with the level's own physics between them).
   No authority: each player's run is its own (deterministic, local); only states and a few events cross. The parent (the
   planet's beatRoom, or beat/shots/net/harness.html) just carries the strings between the two browsers.
   Wire (v = PROTO, JSON, integers only, at most 6000 characters):
     either → other  {k:'s', v, run, ph, t, ht, hh, lv, rt, x, y, vy, mode, grav, rot, alive, gr, fin, pct, att, cr, cp, lp, a, E}
        ~15 Hz while racing, 4 Hz otherwise. ph 0 waiting/counting | 1 racing | 2 done. t = the sender's clock (ms), ht / hh = the
        newest t it heard from us and how many ms ago (RTT). rt = race time (steps of 1/240 s since GO). x, y, vy ×64; rot ×1000;
        alive / gr (on the ground) / fin 0|1; pct ×10; att attempts; cr crashes; cp checkpoint x ×10 (-1 none); lp last cap used
        (-1 none); lv the level (the host's choice). a = the newest event seq we have from the other side (the ack);
        E = our events not yet acked: [seq, type, arg, run] with type 0 crash (arg pct ×10) | 1 finish (arg race time) |
        2 out (arg race time: "I passed your finish time without finishing") | 3 again (arg the new run; a rematch countdown).
     either          {k:'bye'} (sent by the parent room when someone leaves)
   A different v: "Refresh the page to play together". 10 s of silence: "<opp> went quiet: SPACE to play alone". */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, BEAT = G.BEAT = G.BEAT || {};
const PROTO = (BEAT.C && BEAT.C.PROTO) || 1, MAXMSG = 6000, I31 = 2147483647;
let clockFn = null;   /* tests in virtual time (main.js manual mode) set a clock here */
const now = () => clockFn ? clockFn() : (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isI = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

/* ---------- checks: anything odd and the whole message is dropped ---------- */
let why = '';
const no = w => { why = w; return false; };
const okE = e => Array.isArray(e) && e.length === 4 && isI(e[0], 1, I31) && isI(e[1], 0, 3) && isI(e[2], -1, I31) && isI(e[3], 0, 1e9);
const valid = {
  state(o) {
    if (!o || o.k !== 's') return no('k');
    if (o.E === undefined) o.E = [];
    const F = [['v', 0, 999], ['run', 0, 1e9], ['ph', 0, 2], ['t', 0, I31], ['ht', -1, I31], ['hh', 0, 600000], ['lv', 0, 63], ['rt', 0, I31],
      ['x', -64000, 6400000], ['y', -6400, 64000], ['vy', -64000, 64000], ['mode', 0, 3], ['grav', -1, 1], ['rot', -1e9, 1e9], ['alive', 0, 1], ['gr', 0, 1], ['fin', 0, 1],
      ['pct', 0, 1000], ['att', 0, 1e6], ['cr', 0, 1e6], ['cp', -1, 64000000], ['lp', -1, 1e6], ['a', 0, I31]];
    for (const [k, lo, hi] of F) if (!isI(o[k], lo, hi)) return no(k);
    return (Array.isArray(o.E) && o.E.length <= 32 && o.E.every(okE)) || no('E');
  },
  get why() { return why; }
};

/* ---------- incoming: only our own parent, same origin ---------- */
let cb = null; const early = [];
const S = { inN: 0, outN: 0, bad: 0, big: 0, ver: 0 };
function link(m) {
  const role = m.role === 'host' || m.role === 'guest' ? m.role : null, mode = m.mode === 'rtc' || m.mode === 'ably' ? m.mode : 'rtc';
  if (!role) return;
  const first = Net.role !== role;
  Net.role = role; Net.mode = mode; Net.me = nm(m.me, 'Player'); Net.opp = nm(m.opp, 'Friend'); Net.lastIn = now();
  if (first) resetLink();
  if (cb.onLink) cb.onLink({ role, mode, me: Net.me, opp: Net.opp, startIn: Math.max(0, Math.min(15000, +m.startIn || 0)), first });
}
function peerLeft() { if (!Net.role) return; Net.role = null; Net.mode = 'solo'; if (cb.onPeerLeft) cb.onPeerLeft(); }
function recv(d, at) {
  if (!Net.role || typeof d !== 'string' || d.length > MAXMSG) return;
  let o = null; try { o = JSON.parse(d); } catch (_) { o = null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) { S.bad++; return; }
  if (o.k === 'bye') { peerLeft(); return; }
  if (o.k !== 's') { S.bad++; return; }
  if (o.v !== PROTO) { if (Number.isInteger(o.v)) { Net.lastIn = at; S.ver++; if (cb.onMsg) cb.onMsg({ k: 'ver', v: o.v }); } return; }
  if (!valid.state(o)) { S.bad++; if (S.bad < 4) console.warn('[beat net] dropped a bad message: ' + why); return; }
  S.inN++; Net.lastIn = at;
  /* RTT: they echo our newest t they heard (ht) and how long they held it (hh) */
  if (o.t > lastRT || o.t < lastRT - 60000) { lastRT = o.t; lastRAt = at; }
  if (o.ht >= 0 && sentT[o.ht & 255] === o.ht) { const s = at - sentMs[o.ht & 255] - o.hh; if (s >= 0 && s < 10000) Net.rtt = Net.rtt ? Net.rtt * 0.8 + s * 0.2 : s; }
  /* acks of our events, then their new events in order (each delivered once) */
  if (o.a > E.ackOut) { E.ackOut = o.a; E.out = E.out.filter(e => e[0] > o.a); }
  const es = o.E.slice().sort((p, q) => p[0] - q[0]);
  for (const e of es) if (e[0] === E.lastIn + 1) { E.lastIn = e[0]; if (cb.onEvent) cb.onEvent(e[1], e[2], e[3]); } else if (e[0] > E.lastIn + 1) break;
  o._at = at;
  if (cb.onMsg) cb.onMsg(o);
}
function handle(m, at) {
  switch (m.ty) {
    case 'link': link(m); break;
    case 'net': recv(m.d, at); break;
    case 'peer': if (m.left) peerLeft(); break;
    case 'mute': if (cb.onMute) cb.onMute(!!m.on); break;
    case 'music': if (cb.onMusic) cb.onMusic(!!m.on); break;
  }
}
if (typeof addEventListener === 'function') addEventListener('message', e => {
  if (G.parent === G || e.source !== G.parent || e.origin !== G.location.origin) return;
  const m = e.data; if (!m || typeof m !== 'object' || typeof m.ty !== 'string') return;
  const at = now();
  if (!cb) { if (early.length < 16) early.push([m, at]); return; }
  handle(m, at);
});

/* ---------- events until acked; the RTT stamps ---------- */
const E = { seq: 0, out: [], ackOut: 0, lastIn: 0 };
const sentT = new Int32Array(256).fill(-1), sentMs = new Float64Array(256);
let lastRT = -1, lastRAt = 0;
function resetLink() { E.seq = 0; E.out = []; E.ackOut = 0; E.lastIn = 0; lastRT = -1; lastRAt = 0; Net.rtt = 0; sentT.fill(-1); }

/* ---------- the ghost: the newest state, carried forward with the level's physics for the time since it was true ----------
   lag = time since it arrived + half the RTT. Between states nothing is guessed but gravity, floors, crates and caps (a press
   in that gap shows up with the next state); a predicted crash is never shown (it holds instead). The drawn position eases to
   the predicted one (a big jump, like a respawn, snaps). */
class Ghost {
  constructor() { this.s = null; this.d = null; this.run = -1; this.last = 0; }
  clear() { this.s = null; this.d = null; }
  push(o, run) {
    if (o.run !== run) return;
    if (this.s && this.s.run === o.run && o.t <= this.s.t) return;   /* old or repeated */
    this.s = { run: o.run, t: o.t, at: o._at || now(), ph: o.ph, rt: o.rt, x: o.x / 64, y: o.y / 64, vy: o.vy / 64, rot: o.rot / 1000, alive: !!o.alive, gr: !!o.gr, fin: !!o.fin, pct: o.pct / 10, att: o.att, cr: o.cr, lp: o.lp, cp: o.cp };
  }
  /* the state to draw now (or null) */
  view(L, t, rtt) {
    const s = this.s; if (!s) return null;
    let p = { x: s.x, y: s.y, vy: s.vy, rot: s.rot, alive: s.alive, ground: s.gr, fin: s.fin };
    if (s.alive && !s.fin && s.ph === 1 && L && BEAT.Sim) {
      const lagMs = clamp(t - s.at + (rtt || 0) / 2, 0, 600), n = Math.round(lagMs * 0.24);
      const q = BEAT.Sim.newPlayer(L, 0); Object.assign(q, { x: s.x, y: s.y, vy: s.vy, rot: s.rot, ground: s.gr, alive: true, fin: false, lastPad: s.lp, lastRing: -1, buf: 99 });
      let ok = q;
      for (let i = 0; i < n; i++) { BEAT.Sim.stepPlayer(L, q, false, false, null, 0); if (!q.alive) break; ok = { x: q.x, y: q.y, vy: q.vy, rot: q.rot, ground: q.ground }; if (q.fin) break; }
      p = { x: ok.x, y: ok.y, vy: ok.vy, rot: ok.rot, alive: true, ground: ok.ground, fin: false };
    }
    const d = this.d, dt = Math.min(.1, Math.max(0, (t - this.last) / 1000)); this.last = t;
    if (!d || Math.abs(d.x - p.x) > 3 || Math.abs(d.y - p.y) > 4 || d.alive !== p.alive) this.d = Object.assign({}, p);
    else { const k = 1 - Math.exp(-dt / .05); d.x += (p.x - d.x) * k; d.y += (p.y - d.y) * k; d.rot += (p.rot - d.rot) * k; d.ground = p.ground; d.fin = p.fin; }
    return this.d;
  }
  get pct() { return this.s ? this.s.pct : 0; }
}

const Net = BEAT.Net = {
  role: null, mode: 'solo', me: '', opp: '', lastIn: 0, rtt: 0, PROTO, MAXMSG, valid, stats: S, Ghost, E,
  init(c) { cb = c || {}; while (early.length) { const [m, at] = early.shift(); handle(m, at); } },
  setClock(fn) { clockFn = typeof fn === 'function' ? fn : null; }, now,
  _handle(m) { handle(m, now()); },   /* tests */
  event(type, arg, run) { E.out.push([++E.seq, type, arg | 0, run | 0]); if (E.out.length > 32) E.out.shift(); },
  /* a state message: the caller fills the race fields; the stamps, ack and events are added here */
  send(o) {
    if (!this.role || !o) return false;
    const t = Math.round(now()) % I31;
    o.k = 's'; o.v = PROTO; o.t = t; o.ht = lastRT; o.hh = lastRT >= 0 ? clamp(Math.round(now() - lastRAt), 0, 600000) : 0; o.a = E.lastIn; o.E = E.out.slice(-16);
    const d = JSON.stringify(o);
    if (d.length > MAXMSG) { S.big++; return false; }
    sentT[t & 255] = t; sentMs[t & 255] = now();
    this.post({ ty: 'net', d }); S.outN++; return true;
  },
  post(o) { try { if (G.parent !== G) G.parent.postMessage(o, G.location.origin); } catch (_) {} },
  leave() { if (!this.role) return; this.post({ ty: 'leave' }); this.role = null; this.mode = 'solo'; },
  silence(t) { return (t == null ? now() : t) - this.lastIn; }
};
})();
