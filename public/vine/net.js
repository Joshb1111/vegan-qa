/* VINE LINE — net.js (NET). The game side of an online match: the parent link (postMessage to and from our own parent
   page, same origin only), strict checks on everything that arrives, compact body coding and the send limit (4000).
   The parent (the planet's vineRoom, or a test page) only carries strings between the two browsers.
   Wire (v = PROTO 1, JSON, integers only):
     host → guest  {k:'s', v, run, t, ph, cd, a, b, f, g:[cell|-1, ticks], sc:[2], w:[2], dead:[2], lastSeq, sp, r, rd, wn}
                   a / b = cells head..tail; if the message would pass 4000 characters a body goes as a:[head] + ad:'0123…'
                   (the direction from each cell to the next one towards the tail).
     guest → host  {k:'i', v, run, q:[[seq, dir], …last 4], go?:1}   (an empty q is the hello)   ·   {k:'e', v, t, h} (echo of t, h = ms held)
     either        {k:'bye'} (sent by the parent room when someone leaves) */
'use strict';
(function () {
const G = typeof window !== 'undefined' ? window : globalThis, VL = G.VL = G.VL || {};
const N = 24, NN = 576, I31 = 2147483647, MAXMSG = 4000, PROTO = (VL.C && VL.C.PROTO) || 1;
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isI = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;

/* ---------- bodies: cells head..tail, every cell next to the one before ---------- */
function okBody(a) {
  if (!Array.isArray(a) || a.length > NN) return false;
  for (let i = 0; i < a.length; i++) {
    if (!isI(a[i], 0, NN - 1)) return false;
    if (i && Math.abs(a[i] % N - a[i - 1] % N) + Math.abs(((a[i] / N) | 0) - ((a[i - 1] / N) | 0)) !== 1) return false;
  }
  return true;
}
function encode(a) {
  let s = ''; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; s += d === -N ? '0' : d === 1 ? '1' : d === N ? '2' : '3'; }
  return s;
}
function decode(h, s) {
  if (!isI(h, 0, NN - 1) || typeof s !== 'string' || s.length > NN - 1 || !/^[0-3]*$/.test(s)) return null;
  const out = [h]; let x = h % N, y = (h / N) | 0;
  for (let i = 0; i < s.length; i++) { const d = s.charCodeAt(i) - 48; x += DX[d]; y += DY[d]; if (x < 0 || y < 0 || x >= N || y >= N) return null; out.push(y * N + x); }
  return out;
}
const pair = (a, lo, hi) => Array.isArray(a) && a.length === 2 && isI(a[0], lo, hi) && isI(a[1], lo, hi);

/* ---------- checks: anything odd and the whole message is dropped ---------- */
let why = '';
const no = w => { why = w; return false; };
const valid = {
  snap(o) {
    if (!o || o.k !== 's') return no('k');
    for (const key of ['a', 'b']) if (typeof o[key + 'd'] === 'string') { if (!Array.isArray(o[key]) || o[key].length !== 1) return no(key); const b = decode(o[key][0], o[key + 'd']); if (!b) return no(key + 'd'); o[key] = b; delete o[key + 'd']; }
    if (o.sp === undefined) o.sp = 7; if (o.r === undefined) o.r = 0; if (o.rd === undefined) o.rd = 1; if (o.wn === undefined) o.wn = -2;
    return (isI(o.v, 0, 999) || no('v')) && (isI(o.run, 0, 1e9) || no('run')) && (isI(o.t, 0, I31) || no('t')) && (isI(o.ph, 0, 3) || no('ph')) &&
      (isI(o.cd, 0, 600) || no('cd')) && (okBody(o.a) || no('a')) && (okBody(o.b) || no('b')) &&
      ((Array.isArray(o.f) && o.f.length <= 4 && o.f.every(c => isI(c, 0, NN - 1))) || no('f')) &&
      ((Array.isArray(o.g) && o.g.length === 2 && isI(o.g[0], -1, NN - 1) && isI(o.g[1], 0, 9999)) || no('g')) &&
      (pair(o.sc, 0, 1e7) || no('sc')) && (pair(o.w, 0, 9) || no('w')) && (pair(o.dead, 0, 1) || no('dead')) &&
      (isI(o.lastSeq, 0, I31) || no('lastSeq')) && (isI(o.sp, 1, 30) || no('sp')) && (isI(o.r, 0, 60000) || no('r')) &&
      (isI(o.rd, 1, 9999) || no('rd')) && (isI(o.wn, -2, 1) || no('wn'));
  },
  inp(o) {
    if (!o || o.k !== 'i') return no('k');
    if (o.go === undefined) o.go = 0;
    return (isI(o.v, 0, 999) || no('v')) && (isI(o.run, 0, 1e9) || no('run')) && (isI(o.go, 0, 1) || no('go')) &&
      ((Array.isArray(o.q) && o.q.length <= 8 && o.q.every(e => Array.isArray(e) && e.length === 2 && isI(e[0], 1, I31) && isI(e[1], 0, 3))) || no('q'));
  },
  echo(o) { if (o && o.h === undefined) o.h = 0; return (o && o.k === 'e' && isI(o.v, 0, 999) && isI(o.t, 0, I31) && isI(o.h, 0, 60000)) || no('e'); },
  get why() { return why; }
};

/* ---------- incoming: only our own parent, same origin ---------- */
let cb = null; const early = [];
const S = { inN: 0, outN: 0, bad: 0, big: 0 };
function link(m) {
  const role = m.role === 'host' || m.role === 'guest' ? m.role : null, mode = m.mode === 'rtc' || m.mode === 'ably' ? m.mode : 'rtc';
  if (!role) return;
  const first = Net.role !== role;
  Net.role = role; Net.mode = mode; Net.me = nm(m.me, 'Player'); Net.opp = nm(m.opp, 'Friend'); Net.lastIn = now();
  if (cb.onLink) cb.onLink({ role, mode, me: Net.me, opp: Net.opp, startIn: Math.max(0, Math.min(15000, +m.startIn || 0)), first });
}
function peerLeft() { if (!Net.role) return; Net.role = null; Net.mode = 'solo'; if (cb.onPeerLeft) cb.onPeerLeft(); }
function recv(d, at) {
  if (!Net.role || typeof d !== 'string' || d.length > MAXMSG) return;
  let o = null; try { o = JSON.parse(d); } catch (_) { o = null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) { S.bad++; return; }
  if (o.k === 'bye') { peerLeft(); return; }
  const ok = Net.role === 'guest' ? o.k === 's' : o.k === 'i' || o.k === 'e';   /* a host only listens to a guest, a guest only to a host */
  if (!ok) { S.bad++; return; }
  if (o.v !== PROTO) { if (Number.isInteger(o.v)) { Net.lastIn = at; if (cb.onMsg) cb.onMsg({ k: 'ver', v: o.v }); } return; }
  if (!(o.k === 's' ? valid.snap(o) : o.k === 'i' ? valid.inp(o) : valid.echo(o))) { S.bad++; if (S.bad < 4) console.warn('[vine net] dropped a bad message: ' + why); return; }
  S.inN++; Net.lastIn = at; o._at = at;
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

const Net = VL.Net = {
  role: null, mode: 'solo', me: '', opp: '', lastIn: 0, PROTO, MAXMSG, valid, stats: S, encode, decode, okBody,
  init(c) { cb = c || {}; while (early.length) { const [m, at] = early.shift(); handle(m, at); } },
  _handle(m) { handle(m, now()); },   /* tests */
  /* a snapshot whose bodies would not fit goes with direction strings instead */
  send(o) {
    if (!this.role || !o) return false;
    let d = JSON.stringify(o);
    if (d.length > MAXMSG && o.k === 's') { const p = Object.assign({}, o); for (const k of ['a', 'b']) if (p[k].length > 1) { p[k + 'd'] = encode(p[k]); p[k] = [p[k][0]]; } d = JSON.stringify(p); }
    if (d.length > MAXMSG) { S.big++; return false; }
    this.post({ ty: 'net', d }); S.outN++; return true;
  },
  post(o) { try { if (G.parent !== G) G.parent.postMessage(o, G.location.origin); } catch (_) {} },
  leave() { if (!this.role) return; this.post({ ty: 'leave' }); this.role = null; this.mode = 'solo'; },
  silence(t) { return (t == null ? now() : t) - this.lastIn; }
};
})();
