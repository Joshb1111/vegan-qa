/* BEET BEAT — net.js (NET). The game side of an online race: the parent link (postMessage to and from our own parent page,
   same origin only), strict checks on everything that arrives, events sent until acknowledged, RTT, silence, and the ghost
   (the other runner, drawn from its states and carried forward with the level's own physics between them).
   No authority: each player's run is its own (deterministic, local); only states and a few events cross. The parent (the
   planet's beatRoom, or beat/shots/net/harness.html) just carries the strings between the two browsers.
   Wire (v = PROTO, JSON, integers only, at most 6000 characters):
     either → other  {k:'s', v, run, ph, t, ht, hh, lv, lh, rt, x, y, vy, mode, grav, rot, alive, gr, fin, pct, att, cr, cp, lp, a, E}
        ~15 Hz while racing, 4 Hz otherwise, and at the end of any frame with a press, a flip, a ring, a cap, a portal, a crash,
        a respawn or the finish in it (main.js; at most every 2nd frame), so the other side's ghost hears of an input ~33 ms sooner. ph 0 waiting/counting
        (or standing still mid-race: the page went hidden, sent at once, or a 2, 1 hold) | 1 racing | 2 done. t = the sender's clock (ms), ht / hh = the
        newest t it heard from us and how many ms ago (RTT). rt = race time (steps of 1/240 s since GO). x, y, vy ×64; rot ×1000;
        alive / gr (on the ground) / fin 0|1; pct ×10; att attempts; cr crashes; cp checkpoint x ×10 (-1 none); lp last cap used
        (-1 none); lv the level (the host's choice), lh that level's hash (main.js levelHash: its objects, tempo, length and
        designed run), so two pages with different level files (an old cached levels.js) are told to refresh instead of racing
        different levels under one number. a = the newest event seq we have from the other side (the ack);
        E = our events not yet acked: [seq, type, arg, run] with type 0 crash (arg pct ×10) | 1 finish (arg race time) |
        2 out (arg race time: "I passed your finish time without finishing") | 3 again (arg the new run; a countdown: the
        host's start of run 1 after the pick phase, or a rematch; its run field names the level it starts on too:
        1000000 * (level + 1) + run, so both sides race the level the starter is on: older pages send the bare run there and
        read only arg). Each message carries all unacked events up to the newest 16;
        the receiver delivers them in order, once; a gap before a full window (older ones lost to the sender's overflow in a long
        one-way outage) is skipped rather than waited for.
     either          {k:'bye'} (sent by the parent room when someone leaves)
   The match (main.js, marked NET HOOK): run 0 is the PICK phase on the title (the host chooses the level, its lv shows on the
   guest's card: "Waiting for <host> to choose…"); the host's event 3 with run 1 starts the race on both (3, 2, 1, never before
   the lobby's shared start, startIn); the winner comes from race times only (each side's own, from its own GO), so both
   screens agree (the same time to the step: a tie on both). A different v: "Refresh the page to play together". 10 s of
   silence: "<opp> went quiet" ("hasn't arrived yet" if never heard) with a Play alone button (ENTER: not the hop keys, so a
   player tapping along to the music does not end the match by accident); when they are back, 2, 1 and the race goes on.
   {ty:'peer', left}: the game carries on alone with a toast. RTT: posted to the parent every 2 s ({ty:'rtt', ms}). */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, BEAT = G.BEAT = G.BEAT || {};
const PROTO = (BEAT.C && BEAT.C.PROTO) || 1, MAXMSG = 6000, I31 = 2147483647, EWIN = 16;
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
    const F = [['v', 0, 999], ['run', 0, 1e9], ['ph', 0, 2], ['t', 0, I31], ['ht', -1, I31], ['hh', 0, 600000], ['lv', 0, 63], ['lh', 0, I31], ['rt', 0, I31],
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
  if (o.ht >= 0 && sentT[o.ht & 255] === o.ht) { const s = at - sentMs[o.ht & 255] - o.hh; if (s >= 0 && s < 2000) { Net.rtt = Net.rtt ? Net.rtt * 0.8 + s * 0.2 : s;   /* over 2 s is not a round trip but a message that waited (a page asleep, a link catching up in a burst): it would skew the RTT and the clock offset */
    /* their clock minus ours (NTP's offset from the same four stamps), from the quickest of the last 8 round trips: a state is
       then dated by when it was true (its t), not by when it happened to arrive (network jitter) */
    offS.push([((o.t - o.hh - sentMs[o.ht & 255]) + (o.t - at)) / 2, s]); if (offS.length > 8) offS.shift(); let b = offS[0]; for (const q of offS) if (q[1] < b[1]) b = q; Net.off = b[0]; } }
  /* acks of our events, then their new events in order (each delivered once) */
  if (o.a > E.ackOut) { E.ackOut = o.a; E.out = E.out.filter(e => e[0] > o.a); }
  const es = o.E.slice().sort((p, q) => p[0] - q[0]);
  /* every message carries all of the sender's unacked events up to the newest 16, so a gap before a full window means older
     ones were dropped by its overflow (a long one-way outage): they will never come, so carry on from the oldest we have */
  if (es.length >= EWIN && es[0][0] > E.lastIn + 1) { S.skip = (S.skip || 0) + es[0][0] - 1 - E.lastIn; E.lastIn = es[0][0] - 1; }
  for (const e of es) if (e[0] === E.lastIn + 1) { E.lastIn = e[0]; if (cb.onEvent) cb.onEvent(e[1], e[2], e[3]); } else if (e[0] > E.lastIn + 1) break;
  o._at = at; o._tt = Net.off != null ? o.t - Net.off : null;   /* when it was true, on our clock (null until a round trip is measured) */
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
let lastRT = -1, lastRAt = 0, lastT = -1; const offS = [];
function resetLink() { E.seq = 0; E.out = []; E.ackOut = 0; E.lastIn = 0; lastRT = -1; lastRAt = 0; Net.rtt = 0; Net.off = null; offS.length = 0; sentT.fill(-1); }

/* ---------- the ghost: the newest state, carried forward with the level's own physics for the time since it was true ----------
   lag = now - when it was true (its t on our clock, from the offset above; until that is known: since it arrived + half the
   RTT), at most 0.6 s. The runner is put back where the state says, in the state's mode and gravity, with the speed and the
   corridor of the portals behind it (from the level's timeline), then stepped. Its input in that gap is a guess: the level's
   designed run (by x, as the bot plays it) where the level has one, else (GLIDE) the way its climb or sink was going; a press it
   really made shows up with the next state. A predicted crash is never shown: the guess was most likely wrong, so the ghost
   keeps going forward at its speed (its height held) until the next state says. A finished runner keeps running on past the
   arch. Drawing: the ERROR is smoothed, not the position (when a new state moves the prediction, the jump fades out over ~80 ms,
   a big one over ~120 ms: no 2-frame flicker), so a ghost running level with you is drawn level with you, not a step behind;
   only a respawn (a jump back) snaps. A ghost whose newest state is more than a second old fades (a hidden or frozen page). */
const MODES = ['hop', 'glide', 'flip'], wrapA = a => { const T = Math.PI * 2; a %= T; return a > Math.PI ? a - T : a < -Math.PI ? a + T : a; };
const EASE = 0.08, MAXLAG = 600, SP = BEAT.SPEEDS || [8.4, 10.4, 12.9, 15.6];
function place(L, s) {
  const Sim = BEAT.Sim, C = BEAT.C || {}, q = Sim.newPlayer(L, 0), P = L.P || [];
  Object.assign(q, { x: s.x, y: s.y, vy: s.vy, rot: s.rot, ground: s.gr, alive: true, fin: false, lastPad: s.lp, lastRing: -1, buf: 99 });
  let k = 0;
  while (k < P.length && P[k].x <= s.x) { const o = P[k++]; if (o.pk === 's') q.speed = +o.kind[1]; else if (o.pk === 'm') q.ceil = o.kind === 'hop' ? o.ceil : o.ceil != null ? o.ceil : (C.CEIL || 9); }
  q.pk = k; q.mode = MODES[s.mode] || 'hop'; q.grav = s.grav < 0 ? -1 : 1;
  return q;
}
/* the input guess for the step from x to x + dx: held if one of the designed run's held ranges ([x0, x1] by x, sorted; a press
   is a range of zero width) meets it; k caches the search */
function planHeld(plan, x, dx, k) {
  while (k.k < plan.length && plan[k.k][1] < x - 1e-6) k.k++;
  return k.k < plan.length && plan[k.k][0] < x + dx;
}
/* the runner of state s carried forward to time t (ms, our clock), or s as it is when it cannot be (counting down, done, gone) */
const ageOf = (s, t, rtt) => s.tt != null ? t - s.tt : t - s.at + (rtt || 0) / 2;
function predict(L, s, t, rtt, prev) {
  const base = { x: s.x, y: s.y, rot: s.rot, alive: s.alive, ground: s.gr, fin: s.fin, mode: MODES[s.mode] || 'hop', grav: s.grav < 0 ? -1 : 1 };
  if (!s.alive || !(s.ph === 1 || (s.ph === 2 && s.fin)) || !L || !BEAT.Sim) return base;
  const n = Math.round(clamp(ageOf(s, t, rtt), 0, MAXLAG) * 0.24);
  if (!n) return base;
  const q = place(L, s), plan = Net.guess && !s.fin && L.plan && L.plan.length ? L.plan : null, k = { k: 0 };
  q.fin = s.fin;
  /* GLIDE without a plan: keep the climb or the sink it was in (from the last two states) */
  let trend = s.vy * q.grav > 0;
  if (prev && prev.run === s.run && s.t - prev.t > 0 && s.t - prev.t < 400) { const dv = (s.vy - prev.vy) * q.grav; trend = dv > 0.3 ? true : dv < -0.3 ? false : trend; }
  let was = false, x = s.x, y = s.y, rot = s.rot, gr = s.gr, mode = q.mode, grav = q.grav;
  for (let i = 0; i < n; i++) {
    const held = plan ? planHeld(plan, q.x, SP[q.speed] / 240, k) : q.mode === 'glide' ? trend : false;
    BEAT.Sim.stepPlayer(L, q, held, held && !was, null, 0); was = held;
    if (!q.alive) { x += (n - i) * SP[q.speed] / 240; break; }   /* a crash it would make: most likely the guess was wrong; keep going forward */
    x = q.x; y = q.y; rot = q.rot; gr = q.ground; mode = q.mode; grav = q.grav;
  }
  return { x, y, rot, alive: true, ground: gr, fin: q.fin, mode, grav };
}
class Ghost {
  constructor() { this.s = null; this.prev = null; this.d = null; this.off = null; this.last = 0; this.seen = null; }
  clear() { this.s = this.prev = this.d = this.off = this.seen = null; }
  push(o, run) {
    if (o.run !== run) return;
    if (this.s && this.s.run === o.run && o.t <= this.s.t) return;   /* old or repeated (the link is unordered) */
    this.prev = this.s && this.s.run === o.run ? this.s : null;
    this.s = { run: o.run, t: o.t, at: o._at || now(), tt: o._tt != null ? o._tt : null, ph: o.ph, rt: o.rt, x: o.x / 64, y: o.y / 64, vy: o.vy / 64, rot: o.rot / 1000, alive: !!o.alive, gr: !!o.gr, fin: !!o.fin,
      mode: o.mode | 0, grav: o.grav < 0 ? -1 : 1, pct: o.pct / 10, att: o.att, cr: o.cr, lp: o.lp, cp: o.cp };
  }
  /* what to draw now (or null): {x, y, rot, alive, ground, fin, mode, grav} */
  view(L, t, rtt) {
    const s = this.s; if (!s) return null;
    const p = predict(L, s, t, rtt, this.prev), dt = clamp((t - this.last) / 1000, 0, 0.1); this.last = t;
    let off = this.off;
    if (this.d && this.seen && this.seen !== s && off) {   /* a new state: what the old one would draw now, minus what the new one draws, fades out */
      const o = predict(L, this.seen, t, rtt, null);
      if (o.alive === p.alive) { off.x += o.x - p.x; off.y += o.y - p.y; off.rot = o.mode === p.mode ? wrapA(off.rot + o.rot - p.rot) : 0; }
    }
    this.seen = s;
    if (!this.d || !off || this.d.alive !== p.alive || off.x > (s.ph === 0 ? 8 : 6) || off.x < -12 || Math.abs(off.y) > 14) off = this.off = { x: 0, y: 0, rot: 0 };   /* a respawn (a jump back), a crash, the first one: snap; a runner that stopped (ph 0: its page hidden, a 2, 1) where it was guessed on up to 0.6 s: eased back */
    else { const big = Math.abs(off.x) > 1 || Math.abs(off.y) > 1, k = Math.exp(-dt / (big ? 0.12 : EASE)); off.x *= k; off.y *= k; off.rot *= k; }
    const age = ageOf(s, t, rtt), fade = age > 1000 ? Math.max(0.25, 1 - (age - 1000) / 1500) : 1;   /* no word for over a second: fading */
    this.d = { x: p.x + off.x, y: p.y + off.y, rot: p.rot + off.rot, alive: p.alive, ground: p.ground, fin: p.fin, mode: p.mode, grav: p.grav, fade };
    return this.d;
  }
  get pct() { return this.s ? this.s.pct : 0; }
}

const Net = BEAT.Net = {
  role: null, mode: 'solo', me: '', opp: '', lastIn: 0, rtt: 0, off: null, PROTO, MAXMSG, valid, stats: S, Ghost, E, guess: true,
  init(c) { cb = c || {}; while (early.length) { const [m, at] = early.shift(); handle(m, at); } },
  setClock(fn) { clockFn = typeof fn === 'function' ? fn : null; }, now,
  _handle(m) { handle(m, now()); },   /* tests */
  event(type, arg, run) { E.out.push([++E.seq, type, arg | 0, run | 0]); if (E.out.length > 32) E.out.shift(); },
  /* a state message: the caller fills the race fields; the stamps, ack and events are added here */
  send(o) {
    if (!this.role || !o) return false;
    let t = Math.round(now()) % I31; if (t <= lastT && lastT - t < 60000) t = lastT + 1; lastT = t;   /* strictly newer than our last (two in one ms: the second is not 'a repeat' to the ghost) */
    o.k = 's'; o.v = PROTO; o.t = t; o.ht = lastRT; o.hh = lastRT >= 0 ? clamp(Math.round(now() - lastRAt), 0, 600000) : 0; o.a = E.lastIn; o.E = E.out.slice(-EWIN);
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
