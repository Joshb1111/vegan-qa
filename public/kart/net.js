/* SPROUT KART — net.js v2 (NET). Online two players, each on their own screen, with 4 CPU racers (SPEC-kart-v2.md section 12,
   PROTO 2). The parent link (postMessage to and from our own parent page, same origin only), strict checks on everything that
   arrives, the interpolation clock, RTT, and the online race itself, played through SK.Main's hooks (main.js, marked NET HOOK).
   The parent (the planet's kartRoom, or kart-review/v2-net/harness.html) only carries strings between the two browsers.

   Who does what. The HOST (SPRIG) runs the race: CPU karts, surprise bubbles, items in flight, laps, places, results and the
   Grand Prix points. Each player OWNS its kart: the GUEST (MARIGOLD) drives its own kart in its own sim with the same physics
   (no input lag) and sends its state; the host marks it sim.ext and draws it from interpolated states, and it is a car on the
   track there (bumps, places, drafting, giants shove the CPUs, its orbiting petals wobble them). The guest marks every other
   kart ext and draws them, the items and the bubbles from the host's snapshots, interpolated.
   THE VICTIM DECIDES. sim.js never hits an ext kart, so everything that can happen to the guest's kart is decided on the guest,
   against the host's items as the guest sees them, and then told to the host (an "ask"):
     juice puddles, a toss landing, a leader's road blueberry, flung petals: checked against the replicas (sim.js's own reach);
     a blueberry after the guest: flown on the guest once within 40 m, with sim.js's stepBlue, against where it really is;
     a wish puff: the guest takes the BONK when the host's 'puffpop' for it comes into view (the puff is drawn over its kart);
     the thyme ribbon: hit or dodge (were you hopping?) when the replicated ribbon reaches the guest's race metres;
     orbiting petals of other karts, giants and tiny bumps: sim.js's own stepSwirl and bumps, run on the guest for its kart;
     hazards: each side for its own karts (they are pure functions of the race clock, which the guest keeps in step).
   The guest ASKS the host to throw its juice, blueberries, wish puffs and thyme, and to fling its petals (asks carry a seq and
   go in every message until acked), so items in flight live in one place; the guest shows its own juice, berries and petals
   at once (look-ahead copies flown by sim.js's code with nobody to hit) and hides the host's copies of them. Bubbles: the guest
   says which it took. Its item rolls are its own (sim.js's rollItem) with the host's caps in the header (ro). Places on each
   screen come from that screen's sim; the results and the Grand Prix points are the host's, so both screens agree.

   Wire (v = PROTO 2, JSON, integers only, at most 6000 characters):
     host → guest {k:'s', v, t, ht, hh, run, h:[track, class 0-3, gpRound|-1, who×6], gt:[pts by racer ×6]?, ph:0 count|1 race,
                   cd, c (race clock), sc:0 race|1 results|2 podium, K:[packX per kart], B:[bubble t…], I:[item rows], E:[[seq,
                   event, kart, arg]…] (cosmetic events, resent for 300 / 800 ms), R:[[i, place, time, est]…]?, a (asks done),
                   ro:[puffBusy 0|1, thymeAt, giants, leaderGap m], gv (the guest kart's 'gave' count, for its fun line)}
                   every 2 ticks on the direct link (30 Hz), 3 on the relay (20 Hz); typically 1.5-2.5 KB
       packX = SK.Sim.packKart (KART_FIELDS v2, x y z v ×64, dir ×4096, vd ×1024, st ×100) + rp ×16 + surface
       item rows [id, kind 0 splat|1 lob|2 blue|3 puff|4 wave|5 petal, x×16, y×16, z×16, own, age, rq] + by kind: lob vx vy vz
                 ×16 · blue tgt, s×16, lat×64, dir×4096 · puff tgt, ph, pt, rp×16 · wave rp×16, mask, done · petal vx vy ×16
                 (rq = the guest ask that threw it, 0 if none)
                  {k:'w', v, t, ht, hh, sc:0 title|1 track picker}   the host is choosing: 4 Hz
     guest → host {k:'g', v, t, ht, hh, run, p:packX?, q:[ask…]?, E:[[seq, event, arg]…]? (its own kart's cosmetic events)}
                   racing: 30 / 20 Hz; waiting: 4 Hz; about 0.3 KB
       asks [seq, 0, item, x×16, y×16, dir×4096, v×64, s×16, lat×64, fwd 0|1, place]   use juice / trio / blueberry / puff / thyme
            [seq, 1, itemId, by, res]   it hit me: by 0 splat|1 lob|2 blue|3 puff|4 thyme|5 flung petal|7 giant/tiny bump
                                        (itemId = the bumping kart + 1); res 0 hit|1 shield popped|2 immune or nothing|3 dodged
            [seq, 2, bubble]   I took this bubble          [seq, 3, owner, bit]   I used up this kart's orbiting petal
            [seq, 5, petals]   fling my petals (the bits I still had; the host flings from its copy of my swirl)
     either       {k:'bye'} (sent by the parent room when someone leaves)
   t = the sender's tick; ht / hh = the newest t heard from the other side and how many ms ago: RTT both ways (posted each second).
   A different v, or another build (b, a fingerprint of the rules: kart fields, items, classes, tracks), or 30 messages running
   that fail the checks: "Refresh the page to race together". 10 s of silence: a small note "<opp> went quiet · ENTER or tap
   here: race on alone" (not a gameplay key; ignored for its first second); the race goes on, the note goes away if they come
   back, and after 30 s of silence we race on alone by ourselves (fix round 1).
   Fix round 1 also: a blueberry after the guest is taken over within 40 m + v × (RTT/2 + D), located from its x, y, homing at
   once, and lives until it lands (the host keeps its own copy until the guest has said); the host ranks the guest's kart where
   it is now for the thyme ribbon (sim.extRp) and keeps it the target until the guest says hit or dodge; a puff that pops on the
   guest is repeated in the snapshot (pp) until the guest's ask; remote karts snap only when a jump is longer than their speed
   could explain; late snapshots are slotted into the buffer; a remote kart that reaches the line in the compensated view counts
   as finished for the places; ro carries the giants grown so far and the final-lap leader's breather; asks use the guest's
   place, flings need a swirl, and uses come at most one per 8 ticks.
   startIn (the link): a race the host picks before the guest's game has said a word holds its countdown before the "3"
   ("Waiting for <opp>…") until the guest is heard or startIn has passed, so both screens count the same 3, 2, 1.
   Test counters (Net.test) that grow (the hit ids) only count with Net.debug (?debug=1, or set by a test page). */
'use strict';
(function () {
const SK = window.SK = window.SK || {};
const PROTO = 2, MAXMSG = 6000, TICK = 1000 / 60, I31 = 2147483647;
const C = { grace: 120, everyRtc: 2, everyAbly: 3, idle: 15, dRtc: [50, 220], dAbly: [130, 400], evTtlRtc: 300, evTtlAbly: 800, evLate: 700, quiet: 10000, alone: 30000, extra: 100, kx: 1.6, holdMax: 15000, own: 40, predWait: 180, badRun: 30, useGap: 8 };
const now = () => performance.now();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const isI = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;
const TAU = Math.PI * 2, wrapA = a => (a > Math.PI || a < -Math.PI) ? a - TAU * Math.floor((a + Math.PI) / TAU) : a;   /* terminates on ±Infinity (NaN out) */
const ri = v => { v = Math.round(+v); return Number.isFinite(v) ? clamp(v, -1e8, 1e8) : 0; };
const r16 = v => ri(v * 16);
const P = SK.Sim ? SK.Sim.prototype : null;
const KART = SK.KART || { BOX_R: 1.8, BOX_BACK: 90, BOX_FINAL: 45 };
const KIND = ['splat', 'lob', 'blue', 'puff', 'wave', 'petal'], KLEN = [8, 11, 12, 12, 11, 10];
/* the cosmetic events that cross the wire (both ways); the rest are made on each side or matter only to their own kart */
const EVN = ['drift', 'turbo', 'boost', 'tailwind', 'launch', 'twirl', 'land', 'bump', 'bounce', 'fall', 'balloon', 'box', 'use', 'splat', 'blue', 'splash',
  'pop', 'swirl', 'fling', 'petal', 'shield', 'puff', 'puffhover', 'puffpop', 'thyme', 'giant', 'spin', 'bonk', 'wobble', 'tiny', 'boing', 'immune'];
const EVA = ['hop', 'start', 'pad', 'belt', 'berry', 'ring', 'wall', 'bumper', 'block', 'piston', 'drop', 'land', 'hit', 'squash', 'soak', 'blue', 'puff', 'pop',
  'splat', 'lob', 'petal', 'thyme', 'giant', 'tiny', 'pumpkin', 'barrel', 'basket', 'sprinkler', 'steam', 'rain', 'ramp', 'catapult', 'bounce', 'net', 'aim', 'gust', ''];
const EV = {}; EVN.forEach((n, i) => { EV[n] = i; });
/* the guest's own events the host learns another way (its throws come from the asks, puffs and petals from the host itself) */
const G_SKIP = new Set(['use', 'blue', 'puff', 'thyme', 'fling', 'puffhover', 'puffpop']);
const encArg = a => typeof a === 'number' ? (Number.isInteger(a) && a >= -1 && a < 1000 ? a : 0) : typeof a === 'string' && EVA.indexOf(a) >= 0 ? 1000 + EVA.indexOf(a) : 0;
const decArg = a => a >= 1000 ? EVA[a - 1000] : a;
const ITEMS = SK.ITEMS || [], IID = n => ITEMS.indexOf(n);
const I_BOOST3 = IID('boost3'), I_SPLAT = IID('splat'), I_SPLAT3 = IID('splat3'), I_BLUE = IID('blue'), I_SWIRL = IID('swirl'), I_PUFF = IID('puff'), I_THYME = IID('thyme'), I_GIANT = IID('giant');
const ASKED = [I_SPLAT, I_SPLAT3, I_BLUE, I_PUFF, I_THYME];
const KF = (SK.Sim && SK.Sim.KART_FIELDS) || [], KN = KF.length, PK = KN + 2;
const KR = { drift: [-1, 1], mt: [0, 3], item: [0, 10], itemN: [0, 3], petals: [0, 31], cut: [-1, 7], draft: [-90, 60], giant: [0, 999], tiny: [0, 999], swirl: [0, 999],
  gro: [0, 20], place: [1, 6], lap: [0, 99], fin: [0, 1], roll: [0, 99] };
const NR = () => (SK.TRACKS || []).length;
/* the build: a short fingerprint of the rules both sims must share (another build with the same PROTO is refused like another
   version: "Refresh the page"). Fix round 1 (review: a stale cached sim.js desynced silently) */
const BUILD = (() => {
  const src = JSON.stringify([KF, SK.ITEMS, SK.ITEM_USES, SK.ODDS, SK.DIFF, SK.KART, (SK.TRACKS || []).map(T => [T.id, Math.round(T.L * 100), T.laps, (T.cuts || []).map(c => [c.id, Math.round(c.len * 10)]), (T.feats || []).length, (T.hazards || []).map(h => [h.k, h.per || 0, h.off || 0]), (T.items || []).length]), SK.Sim && SK.Sim.HOP_WIN]);
  let h = 2166136261; for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000000;
})();
const resCode = r => r === 'hit' ? 0 : r === 'shield' ? 1 : 2;
const LOC = { ok: false, surf: 0, i: 0, s: 0, f: 0, d: 0, dist: 0, cx: 0, cy: 0, cut: -1, u: 0, hw: 0, lim: 0, ang: 0 };
const report = e => console.error('[kart net]', e);

/* ---------- a kart as integers: packKart (sim.js) + race metres ×16 + surface ---------- */
function packX(k) { const a = SK.Sim.packKart(k).map(ri); a.push(ri((+k.rp || 0) * 16), clamp(k.surf | 0, 0, 9)); return a; }
function unpackX(k, a) { SK.Sim.unpackKart(k, a); k.rp = a[KN] / 16; k.surf = a[KN + 1]; return k; }
const scratch = {};
/* the other karts: B (newer) as it is, then position, heading, speed, race metres and the animation counters eased from A
   (never slid across the map: a balloon or a respawn jumps) */
const EASE = ['spin', 'lift', 'fall', 'twirl', 'bonk', 'wob', 'gro'];
function applyKart(k, A, B, f, dt) {
  unpackX(k, B);
  if (!A || A === B) return;
  const a = unpackX(scratch, A);
  /* a real jump (a balloon lift starting, or further than its speed could carry it between the samples) snaps; a fast kart with
     a gap in the samples eases (fix round 1: the fixed 6 m rule froze karts at WILD speeds) */
  const lim = Math.max(6, Math.max(Math.abs(a.v), Math.abs(k.v)) * (dt || 0.1) * 1.5 + 2);
  if ((k.lift > 0 && !(a.lift > 0)) || (a.x - k.x) ** 2 + (a.y - k.y) ** 2 > lim * lim) return;
  f = clamp(f, 0, C.kx);
  k.x = a.x + (k.x - a.x) * f; k.y = a.y + (k.y - a.y) * f; k.z = a.z + (k.z - a.z) * f;
  k.v = a.v + (k.v - a.v) * f; k.vd = a.vd + (k.vd - a.vd) * f; k.st = a.st + (k.st - a.st) * f; k.rp = a.rp + (k.rp - a.rp) * f;
  k.dir = wrapA(a.dir + wrapA(k.dir - a.dir) * f);
  if (a.swirl > 0 && k.swirl > 0 && k.swA >= a.swA && k.swA - a.swA < 30) k.swA = a.swA + (k.swA - a.swA) * f;   /* the petals turn smoothly */
  const g1 = Math.min(1, f);
  for (const n of EASE) if (a[n] > 0 && k[n] > 0) k[n] = Math.max(1, a[n] + (k[n] - a[n]) * g1);
}
/* the size sim.js would give it (render and the bump radius read k.scale; sim.js sets it only for the karts it drives) */
function setScale(k) {
  const t = k.tiny > 0 ? 0.55 : 1 + 0.7 * (+k.gro || 0) / 20, s0 = +k.scale || 1;
  k.scale = Math.abs(t - s0) < 0.01 ? t : s0 + (t - s0) * (k.tiny > 0 || s0 < 1 ? 0.25 : 1);
}
/* places: a kart we see a moment in the past is ranked where it is now (its race metres + speed × the view's lag), so both
   screens put the karts in the same order (the drawing stays where the snapshots say) */
function placesNow(sim, lagMs, isRemote) {
  const ks = sim.karts, f = clamp(lagMs, 0, 600) / 1000, sv = PL, total = sim.track.laps * sim.track.L;
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i]; sv[i] = k.rp; FT[i] = -1;
    if (isRemote(i) && !k.finished && !k.fall && !k.lift) {
      const v = Math.max(0, Math.min(40, +k.v || 0)); k.rp += v * f;
      /* over the line already in the view-compensated race: finished, at an estimated time (fix round 1: a close finish showed
         "FINISHED 1st!" on both screens for a moment) */
      if (k.rp >= total && v > 1) { if (!(k._estFin >= 0)) k._estFin = Math.round(sim.clock - (k.rp - total) / v * 60); FT[i] = k.finishT; k.finished = true; k.finishT = k._estFin; }   /* estimated once, so the order does not flicker */
      else k._estFin = -1;
    }
  }
  try { P.updatePlaces.call(sim); } finally { for (let i = 0; i < ks.length; i++) { ks[i].rp = sv[i]; if (FT[i] >= 0) { ks[i].finished = false; ks[i].finishT = FT[i]; } } }
}
const PL = new Float64Array(8), FT = new Float64Array(8);
/* do two karts overlap (sim.js's contact rule)? with o null: does k touch any other kart? */
function touching(sim, k, o) {
  const R = KART.R || 0.85, r = k2 => R * (k2.tiny ? 0.6 : k2.giant ? k2.scale : 1);
  for (const b of o ? [o] : sim.karts) { if (b === k || b.fall || b.lift || Math.abs(b.z - k.z) > 1) continue; const d = r(k) + r(b) + 0.3; if ((b.x - k.x) ** 2 + (b.y - k.y) ** 2 < d * d) return true; }
  return false;
}
/* sim.js's bumps for one pair, our kart (me, not ext) against one we only see (o, ext): only ours moves, and it decides what a
   giant's shove or a boing does to it (the victim decides) */
function bumpPair(sim, me, o) {
  if (me.fall || o.fall || me.lift || o.lift || Math.abs(me.z - o.z) > 1 || me.aim || o.aim) return;
  const R = KART.R || 0.85, ra = R * (me.tiny ? 0.6 : me.giant ? me.scale : 1), rb = R * (o.tiny ? 0.6 : o.giant ? o.scale : 1), R2 = ra + rb;
  const dx = o.x - me.x, dy = o.y - me.y, d2 = dx * dx + dy * dy; if (!(d2 < R2 * R2) || d2 < 1e-9) return;
  const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = R2 - d;
  if ((me.giant > 0) !== (o.giant > 0)) {
    if (o.giant > 0) { me.x -= nx * ov; me.y -= ny * ov; me.px -= nx * 7; me.py -= ny * 7; if (!me.boingT) { me.boingT = 30; sim.hit(me, 'spin', 'giant', o.i); } }
    return;
  }
  if ((me.tiny > 0) !== (o.tiny > 0)) { if (me.tiny > 0) { me.x -= nx * ov; me.y -= ny * ov; if (!me.boingT) sim.boing(me, o); } return; }
  me.x -= nx * ov; me.y -= ny * ov;
  const rv = (Math.cos(me.dir) * me.v - Math.cos(o.dir) * o.v) * nx + (Math.sin(me.dir) * me.v - Math.sin(o.dir) * o.v) * ny, imp = Math.max(2.5, Math.min(7, rv * 0.6));
  me.px -= nx * imp; me.py -= ny * imp;
  if (rv > 0 && me.i < o.i) me.v *= 0.97;
  if (!me.bumpT && !o.bumpT) { sim.ev('bump', Math.min(me.i, o.i), Math.max(me.i, o.i)); me.bumpT = o.bumpT = 30; }
}
/* race metres, lane and cut of a kart we only see (the CPU drivers read them: drafting, puddles, cut mouths) */
function whereIs(sim, k) {
  SK.locate(sim.track, k.x, k.y, LOC);
  if (!LOC.ok) return;
  k.s = LOC.s; k.lat = LOC.d; k.u = LOC.u; if (LOC.dist <= LOC.hw) k.lastS = LOC.s;
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
const okItem = r => {
  if (!Array.isArray(r) || !isI(r[1], 0, 5) || r.length !== KLEN[r[1]]) return false;
  if (!(isI(r[0], 1, I31) && isI(r[2], -1e6, 1e6) && isI(r[3], -1e6, 1e6) && isI(r[4], -1e5, 1e5) && isI(r[5], -1, 5) && isI(r[6], 0, 1e6) && isI(r[7], 0, I31))) return false;
  switch (r[1]) {
    case 1: case 5: return r.slice(8).every(v => isI(v, -1e6, 1e6));
    case 2: return isI(r[8], -1, 5) && isI(r[9], -1e7, 1e7) && isI(r[10], -1e6, 1e6) && isI(r[11], -13000, 13000);
    case 3: return isI(r[8], 0, 5) && isI(r[9], 0, 2) && isI(r[10], 0, 9999) && isI(r[11], -1e8, 1e8);
    case 4: return isI(r[8], -1e8, 1e8) && isI(r[9], 0, 63) && isI(r[10], 0, 63);
  }
  return true;
};
const ARGMAX = 1000 + EVA.length - 1;
const okEv = e => Array.isArray(e) && e.length === 4 && isI(e[0], 1, I31) && isI(e[1], 0, EVN.length - 1) && isI(e[2], -1, 5) && isI(e[3], -1, ARGMAX);
const okGEv = e => Array.isArray(e) && e.length === 3 && isI(e[0], 1, I31) && isI(e[1], 0, EVN.length - 1) && isI(e[2], -1, ARGMAX);
const okRes = (a, n) => { if (!Array.isArray(a) || a.length !== n) return false; const seen = new Set(); for (const r of a) { if (!Array.isArray(r) || r.length !== 4 || !isI(r[0], 0, n - 1) || !isI(r[1], 1, n) || !isI(r[2], 0, I31) || !isI(r[3], 0, 1) || seen.has(r[0])) return false; seen.add(r[0]); } return true; };
const okHead = h => { if (!Array.isArray(h) || h.length < 5 || h.length > 9 || !isI(h[0], 0, NR() - 1) || !isI(h[1], 0, 3) || !isI(h[2], -1, 2)) return false; const w = h.slice(3), s = new Set(w); return w.every(x => isI(x, 0, 5)) && s.size === w.length && s.has(0) && s.has(1); };
const okRo = r => Array.isArray(r) && r.length >= 4 && r.length <= 6 && isI(r[0], 0, 1) && isI(r[1], -99999, I31) && isI(r[2], 0, 6) && isI(r[3], 0, 99999) && (r.length < 5 || isI(r[4], 0, 99)) && (r.length < 6 || isI(r[5], 0, 9999));
const okPp = a => Array.isArray(a) && a.length <= 4 && a.every(p => Array.isArray(p) && p.length === 2 && isI(p[0], 1, I31) && isI(p[1], -1, 5));
const okAsk = q => Array.isArray(q) && isI(q[0], 1, I31) && (
  (q[1] === 0 && q.length === 11 && ASKED.indexOf(q[2]) >= 0 && q.slice(3, 9).every(v => isI(v, -1e8, 1e8)) && isI(q[9], 0, 1) && isI(q[10], 1, 6)) ||
  (q[1] === 1 && q.length === 5 && isI(q[2], 1, I31) && isI(q[3], 0, 7) && isI(q[4], 0, 3)) ||
  (q[1] === 2 && q.length === 3 && isI(q[2], 0, 63)) ||
  (q[1] === 3 && q.length === 4 && isI(q[2], 0, 5) && isI(q[3], 0, 4)) ||
  (q[1] === 5 && q.length === 3 && isI(q[2], 0, 31)));
const common = o => (isI(o.v, 0, 999) || no('v')) && (isI(o.t, 0, I31) || no('t')) && (isI(o.ht, -1, I31) || no('ht')) && (isI(o.hh, 0, 600000) || no('hh'));
/* one bad row (an item or an event) drops only that row, not the whole message */
function prune(o) {
  for (const [key, ok] of o.k === 's' ? [['I', okItem], ['E', okEv]] : [['E', okGEv]]) {
    const a = o[key]; if (Array.isArray(a) && a.length <= 96) { const b = a.filter(ok); if (b.length !== a.length) { S.fixed += a.length - b.length; o[key] = b; } }
  }
}
const valid = {
  snap(o) {
    if (!o || o.k !== 's') return no('k');
    for (const k of ['I', 'E', 'B']) if (o[k] === undefined) o[k] = [];
    if (o.a === undefined) o.a = 0;
    if (o.gv === undefined) o.gv = 0;
    if (!common(o)) return false;
    if (!(isI(o.run, 0, 1e9) || no('run')) || !(okHead(o.h) || no('h'))) return false;
    const n = o.h.length - 3;
    return (isI(o.ph, 0, 1) || no('ph')) && (isI(o.cd, 0, 9999) || no('cd')) && (isI(o.c, 0, I31) || no('c')) && (isI(o.sc, 0, 2) || no('sc')) &&
      (isI(o.a, 0, I31) || no('a')) && (isI(o.gv, 0, 9999) || no('gv')) && (okRo(o.ro) || no('ro')) &&
      ((Array.isArray(o.K) && o.K.length === n && o.K.every((a, i) => okKart(a, 'K' + i))) || no(why || 'K')) &&
      ((Array.isArray(o.B) && o.B.length <= 64 && o.B.every(t => isI(t, -9999, 9999))) || no('B')) &&
      ((Array.isArray(o.I) && o.I.length <= 48 && o.I.every(okItem)) || no('I')) && ((Array.isArray(o.E) && o.E.length <= 64 && o.E.every(okEv)) || no('E')) &&
      (o.gt === undefined || (Array.isArray(o.gt) && o.gt.length === 6 && o.gt.every(p => isI(p, 0, 9999))) || no('gt')) && (o.pp === undefined || okPp(o.pp) || no('pp')) &&
      (o.R === undefined || okRes(o.R, n) || no('R'));
  },
  wait(o) { return (o && o.k === 'w' && common(o) && isI(o.sc, 0, 1)) || no('w'); },
  guest(o) {
    if (!o || o.k !== 'g') return no('k');
    if (o.q === undefined) o.q = [];
    if (o.E === undefined) o.E = [];
    return common(o) && (isI(o.run, -1, 1e9) || no('run')) && (o.p === undefined || okKart(o.p, 'p')) &&
      ((Array.isArray(o.q) && o.q.length <= 32 && o.q.every(okAsk)) || no('q')) && ((Array.isArray(o.E) && o.E.length <= 48 && o.E.every(okGEv)) || no('gE'));
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
    if (n && r <= b[n - 1].r) {   /* late (reordered): slotted in where it belongs, so a gap gets smaller; not used for the clock */
      if (r < b[n - 1].r && r > b[0].r) { let j = n - 1; while (j > 0 && b[j - 1].r > r) j--; if (b[j - 1].r !== r) { b.splice(j, 0, { r, s: sample }); if (b.length > 32) b.shift(); this.n.late = (this.n.late | 0) + 1; return false; } }
      this.n.old++; return false;
    }
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
      if (n < 2) { o.a = o.b = nw.s; o.k = 0; o.dt = 0.1; return o; }
      const a = b[n - 2]; o.a = a.s; o.b = nw.s; o.k = 1 + Math.min(extra, C.extra) / (nw.r - a.r); o.dt = (nw.r - a.r) / 1000; return o;
    }
    o.held = false; o.extra = 0;
    if (rc <= b[0].r) { o.a = o.b = b[0].s; o.k = 0; o.dt = 0.1; return o; }
    let i = n - 2; while (i > 0 && b[i].r > rc) i--;
    const a = b[i], c = b[i + 1]; o.a = a.s; o.b = c.s; o.k = (rc - a.r) / (c.r - a.r); o.dt = (c.r - a.r) / 1000; return o;
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
  try { handle(m, at); } catch (er) { report(er); }
});
function recv(d, at) {
  if (!online || d.length > MAXMSG) return;
  let o = null; try { o = JSON.parse(d); } catch (_) { o = null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) { S.bad++; return; }
  if (o.k === 'bye') { peerLeft(); return; }
  const kinds = Net.role === 'guest' ? ['s', 'w'] : ['g'];   /* a host only listens to a guest, a guest only to a host */
  if (kinds.indexOf(o.k) < 0) { S.bad++; return; }
  /* another version: a plausible one, three messages running (one broken message is only dropped) */
  if (o.v !== PROTO || o.b !== BUILD) { if (isI(o.v, 1, 99)) { Net.lastIn = at; if (++verN >= 3 && !verBad) { verBad = true; console.warn('[kart net] the other side runs version ' + o.v + ' build ' + o.b + ', this page ' + PROTO + ' build ' + BUILD); } } else S.bad++; return; }
  verN = 0;
  if (o.k === 's' || o.k === 'g') prune(o);
  if (!(o.k === 's' ? valid.snap(o) : o.k === 'w' ? valid.wait(o) : valid.guest(o))) {
    S.bad++; if (S.bad < 4 || Net.debug) console.warn('[kart net] dropped a bad message: ' + why);
    Net.lastIn = at; if (++badRun >= C.badRun && !verBad) { verBad = true; console.warn('[kart net] the other side keeps sending messages we cannot read: another build?'); }   /* talking, not quiet */
    return;
  }
  badRun = 0;
  S.inN++; S.inB += d.length; Net.lastIn = at; heardAny = true;
  heard(o, at); o._at = at;
  if (o.k === 'g') onGuest(o); else if (o.k === 's') onSnap(o); else onWait(o);
}

/* =====================================================================================================================
   THE ONLINE RACE
   ===================================================================================================================== */
let M = null, ut = 0, online = false, heardAny = false, verBad = false, verN = 0, badRun = 0, quiet = false, quietAt = 0, myWho = -1, lastScr = '', toastT = '', toastAt = -1e9, startAt = 0, holdUt = -99;
let curSim = null, g = -1, hostIdx = -1;
const every = () => Net.mode === 'ably' ? C.everyAbly : C.everyRtc;
const rangeFor = () => Net.mode === 'ably' ? C.dAbly : C.dRtc;
const T0 = { toast: 0 };
function toast(s) { toastT = s; toastAt = ut; T0.toast++; }
function send(o) {
  o.v = PROTO; o.b = BUILD; o.t = ut;
  sentT[ut & 255] = ut; sentMs[ut & 255] = now();
  o.ht = lastRT; o.hh = lastRT < 0 ? 0 : Math.min(600000, Math.round(now() - lastRAt));
  return Net.send(o);
}
/* test counters (the harness reads them); the id lists only grow with Net.debug (review E11) */
const T = { asksSent: { u: 0, h: 0, b: 0, p: 0, f: 0 }, asksDone: { u: 0, h: 0, b: 0, p: 0, f: 0 }, hitIds: [], hostHitIds: [], evIn: 0, evUsed: 0, evLateDrop: 0, gEvIn: 0, gEvUsed: 0, gEvLate: 0,
  starts: 0, finishes: 0, solo: '', askMiss: 0, owned: 0, ownedHits: 0, preds: 0, predDrop: 0, puffMe: 0, waveMe: 0, petalMe: 0, lobMe: 0 };
const dbgPush = (a, v) => { if (Net.debug && a.length < 5000) a.push(v); };

/* cosmetic events: each side queues its own, sends the never-sent ones first (up to 600 characters), then resends the newest
   (up to 300) for a short while, oldest first on the wire; the receiver keeps each seq once */
function evQueue() {
  return {
    seq: 0, q: [],
    add(row) { const a = [++this.seq].concat(row); this.q.push({ at: now(), a, n: JSON.stringify(a).length + 1 }); if (this.q.length > 64) this.q.shift(); },
    pending(t) {
      const ttl = Net.mode === 'ably' ? C.evTtlAbly : C.evTtlRtc, q = this.q;
      let i = 0; while (i < q.length && t - q[i].at > ttl) i++; if (i) q.splice(0, i);
      if (!q.length) return [];
      const pick = []; let n = 0;
      for (const e of q) if (!e.sent && n + e.n <= 600) { e.sent = 1; e.p = t; pick.push(e); n += e.n; }
      for (let j = q.length - 1; j >= 0 && n < 900; j--) { const e = q[j]; if (e.p !== t && n + e.n <= 900) { e.p = t; pick.push(e); n += e.n; } }
      pick.sort((x, y) => x.a[0] - y.a[0]); return pick.map(e => e.a);
    },
    clear() { this.q.length = 0; }
  };
}
const seenRing = () => ({ a: new Int32Array(1024).fill(-1), top: 0, fresh(s) { if (s <= this.top - 512 || this.a[s & 1023] === s) return false; this.a[s & 1023] = s; if (s > this.top) this.top = s; return true; }, clear() { this.a.fill(-1); this.top = 0; } });

/* ---------- HOST ---------- */
let run = 0, gIt = null, lastAsk = 0, asksIn = [], hostHead = null, lastSend = -99, lastIdle = -99, gPetClr = 0, bumpOkH = false, gNewR = -1, gNewAt = 0, lastUse = -999;
const ppQ = [];   /* puffs that came down on the guest here, repeated in every snapshot until its ask says what happened (fix round 1) */
const lagS = () => !gIt || gIt.rc === null || gNewR < 0 ? 0 : clamp(gNewR + (now() - gNewAt) + (Net.rtt || 0) / 2 - gIt.rc, 0, 600) / 1000;
const evQ = evQueue(), gSeen = seenRing(), gEvIn = [], puffOwn = new Map(), PT = [];
function hostSetup(sim) {
  curSim = sim; hostIdx = M.me[0];
  g = sim.karts.findIndex(k => k.who === 1 && !k.cpu);
  if (g < 0) return;
  sim.ext[g] = true;
  const ti = SK.TRACKS.indexOf(sim.track), gpo = M.gp;
  hostHead = [Math.max(0, ti), clamp(sim.cls | 0, 0, 3), gpo ? clamp(gpo.round | 0, 0, 2) : -1].concat(sim.karts.map(k => k.who));
  if (!gIt) gIt = new Interp(rangeFor()[0], rangeFor()[1], every); gIt.clear(); gNewR = -1;
  asksIn.length = 0; lastSend = -99; gPetClr = 0; gEvIn.length = 0; puffOwn.clear(); ppQ.length = 0; lastUse = -999;
  /* the thyme ribbon ranks the guest's kart where it is now (sim.js stepWave reads sim.extRp) */
  sim.extRp = k => k.rp + Math.max(0, Math.min(40, +k.v || 0)) * lagS();
  const step0 = sim.step;
  sim.step = function (inp) { step0.call(this, inp); if (online && this === curSim) try { hostPost(this); } catch (e) { report(e); } };
  /* a wish puff that reaches the guest pops here without a hit (sim.js: the victim decides); the karts round it still wobble
     here, and the puff's cool-down starts as it would have */
  sim.stepItems = function () {
    if (!online || this !== curSim) return P.stepItems.call(this);
    const pf = []; for (const it of this.items) { if (it.k === 'puff' && it.tgt === g) pf.push(it); if (it.k === 'blue' && it.tgt === g && it.age < 1200 && it.life - it.age < 3) it.life = it.age + 3; }   /* a berry after the guest lives until the guest says (fix round 1) */
    const e0 = this.events.length;
    P.stepItems.call(this);
    if (!pf.length) return;
    for (let j = e0; j < this.events.length; j++) {
      const e = this.events[j]; if (e[0] !== 'puffpop' || e[1] !== g) continue;
      const it = pf.find(p => this.items.indexOf(p) < 0); if (!it) continue; pf.splice(pf.indexOf(it), 1);
      puffOwn.set(it.id, it.own); if (puffOwn.size > 16) puffOwn.delete(puffOwn.keys().next().value);
      ppQ.push([it.id, it.own]); if (ppQ.length > 4) ppQ.shift();
      this.puffAt = this.clock;
      const kg = this.karts[g];
      for (const o of this.karts) if (o !== kg && !this.ext[o.i] && (o.x - kg.x) ** 2 + (o.y - kg.y) ** 2 < 25) this.hit(o, 'wobble', 'puff', it.own);
    }
  };
  /* the guest's orbiting petals wobble the karts here (sim.js evaluates an ext owner's petals); a petal used up here stays
     cleared on our copy until the guest's own state says so (gPetClr), and the guest is told which */
  sim.stepSwirl = function () {
    if (!online || this !== curSim) return P.stepSwirl.call(this);
    const kg = this.karts[g], b0 = kg.petals | 0, e0 = this.events.length;
    P.stepSwirl.call(this);
    const lost = b0 & ~kg.petals & 31; if (!lost) return;
    gPetClr |= lost;
    let told = 0; for (let j = e0; j < this.events.length; j++) { const e = this.events[j]; if (e[0] === 'petal' && (e[2] >> 3) === g) told |= 1 << (e[2] & 7); }
    for (let j = 0; j < 5; j++) if (((lost >> j) & 1) && !((told >> j) & 1)) evQ.add([EV.petal, -1, g * 8 + j]);   /* soaked up by a puddle */
  };
  /* bubbles: the guest says which it took (ask 2); our copy of its kart never takes one */
  sim.stepBoxes = function () {
    const kg = this.karts[g], r0 = kg.roll;
    if (online && this === curSim) kg.roll = r0 || 1;
    try { P.stepBoxes.call(this); } finally { kg.roll = r0; }
  };
  /* places: the guest's kart is ranked where it is now (placesNow) */
  sim.updatePlaces = function () {
    if (!online || this !== curSim || !gIt || gIt.rc === null || gNewR < 0) return P.updatePlaces.call(this);
    placesNow(this, gNewR + (now() - gNewAt) + (Net.rtt || 0) / 2 - gIt.rc, i => i === g);
  };
  /* kart contacts with the guest's kart (drawn here a moment in the past) wait for the start's pack to spread: 2 s after GO,
     then from the first tick it touches nobody (a ghost-late kart at the start is rammed from behind otherwise) */
  bumpOkH = false;
  sim.bumps = function () {
    if (!online || this !== curSim) return P.bumps.call(this);
    const kg = this.karts[g];
    if (!bumpOkH) { if (this.clock >= C.grace && !touching(this, kg)) bumpOkH = true; else { const l0 = kg.lift; kg.lift = l0 || 1; try { P.bumps.call(this); } finally { kg.lift = l0; } return; } }
    P.bumps.call(this);
  };
  /* the results, kept from the moment the race is done (main asks once, when it shows them); the guest gets the same rows */
  const res0 = P.results;
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
  if (k.boingT > 0) k.boingT--;
  const r = gIt.at(now());
  if (r) {
    applyKart(k, r.a, r.b, r.k, r.dt);
    if (!k.swirl) gPetClr = 0;
    k.petals &= ~gPetClr;
    whereIs(sim, k);
  }
  setScale(k);
}
/* after the step, before main hears the events: the guest's asks, in order, then its own cosmetic events as the view of its
   kart catches up with them */
function hostPost(sim) {
  for (const q of asksIn) try { hostAsk(sim, q); } catch (e) { report(e); }
  asksIn.length = 0;
  const rc = gIt && gIt.rc !== null ? gIt.rc : -1e12;
  let n = 0;
  for (const [r, e] of gEvIn) {
    if (r > rc + 1) break;
    n++;
    if (r < rc - C.evLate) { T.gEvLate++; continue; }
    sim.events.push([EVN[e[1]], g, decArg(e[2])]); T.gEvUsed++;
  }
  if (n) gEvIn.splice(0, n);
}
function hostAsk(sim, q) {
  const kg = sim.karts[g], ks = sim.karts;
  if (q[1] === 0) {   /* throw it from where the guest really was (the ask's numbers, its place too), as if from its kart; at most one per 8 ticks */
    if (sim.clock - lastUse < C.useGap) { T.asksDone.u++; return; } lastUse = sim.clock;
    const sv = { x: kg.x, y: kg.y, dir: kg.dir, v: kg.v, s: kg.s, lat: kg.lat, rp: kg.rp, item: kg.item, itemN: kg.itemN, place: kg.place }, s = q[7] / 16, L = sim.track.L;
    let ds = ((s - kg.s) % L + L) % L; if (ds > L / 2) ds -= L;
    kg.x = q[3] / 16; kg.y = q[4] / 16; kg.dir = q[5] / 4096; kg.v = q[6] / 64; kg.s = s; kg.lat = q[8] / 64; kg.rp += clamp(ds, -30, 30); kg.item = q[2]; kg.itemN = 1; kg.place = clamp(q[10] | 0, 1, sim.karts.length);
    const n0 = sim.nextId;
    try { P.useItem.call(sim, kg, q[9] === 1); } finally { Object.assign(kg, sv); }
    for (const it of sim.items) if (it.id >= n0) it.rq = q[0];
    T.asksDone.u++;
  } else if (q[1] === 1) {   /* it hit the guest (the guest's call): the item is used up here too */
    const id = q[2], by = q[3], res = q[4], j = sim.items.findIndex(x => x.id === id), it = j >= 0 ? sim.items[j] : null;
    if (by === 3) { const pj = ppQ.findIndex(p => p[0] === id); if (pj >= 0) ppQ.splice(pj, 1); }
    const own = it ? it.own : by === 3 ? (puffOwn.has(id) ? puffOwn.get(id) : -1) : by === 7 ? id - 1 : -1;
    if (!it && by !== 3 && by !== 7) T.askMiss++;   /* gone here already (someone else met it first in between): the guest's call stands */
    if (by === 4) { if (it && it.k === 'wave') it.done |= 1 << g; }
    else if (it && ((by === 0 && it.k === 'splat') || (by === 1 && it.k === 'splat' && res === 0) || (by === 2 && it.k === 'blue') || (by === 5 && it.k === 'petal'))) sim.items.splice(j, 1);
    if (by === 2 && it) for (const o of ks) if (o !== kg && o.i !== own && !sim.ext[o.i] && (o.x - kg.x) ** 2 + (o.y - kg.y) ** 2 < 9) sim.hit(o, 'wobble', 'blue', own);   /* the splash */
    if (res === 0 && own >= 0 && own !== g && ks[own] && (by !== 7 || ks[own].giant > 0)) ks[own].stats.gave++;
    T.asksDone.h++; dbgPush(T.hostHitIds, run + ':' + id);
  } else if (q[1] === 2) {
    const b = sim.boxes[q[2]]; if (b && b.t <= 0) b.t = kg.lap === sim.track.laps ? (KART.BOX_FINAL || 45) : KART.BOX_BACK;
    T.asksDone.b++;
  } else if (q[1] === 3) {   /* the guest used up one of this kart's orbiting petals */
    const o = ks[q[2]]; if (o && q[2] !== g && ((o.petals >> q[3]) & 1)) { o.petals &= ~(1 << q[3]); if (!kg.giant) o.stats.gave++; }   /* sim.js ends a swirl with no petals left on its next tick */
    T.asksDone.p++;
  } else if (q[1] === 5) {   /* fling: from our copy of the guest's swirl (none: nothing to fling) */
    if (!(kg.swirl > 0)) { T.asksDone.f++; return; }
    const bits = kg.petals & ~gPetClr & 31;
    const pts = SK.Sim.petals({ x: kg.x, y: kg.y, z: kg.z, scale: kg.scale, swA: kg.swA, swirl: 1, petals: bits }, PT);
    let nf = 0;
    for (let j = 0; j < 5; j++) {
      if (!pts[j].alive) continue; const a = kg.dir + (j - 2) * 11 * Math.PI / 180, v = Math.max(0, kg.v) + 18;   /* sim.js FLING_SPREAD */
      const it = sim.addItem({ k: 'petal', x: pts[j].x, y: pts[j].y, z: 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, own: g, life: 45 }); if (it) { it.rq = q[0]; nf++; }
    }
    sim.ev('fling', g, nf); gPetClr |= bits;
    T.asksDone.f++;
  }
}
function hostAfter(sim) {
  for (const e of sim.events) {   /* cosmetic events for the guest: not its own kart's (it makes those), not the hazards or countdown */
    const code = EV[e[0]]; if (code === undefined) continue;
    const kk = e[1], n = e[0];
    if (kk === g && n !== 'puffpop' && n !== 'puffhover') continue;
    if (kk < 0 && n !== 'pop') continue;
    if (n === 'bump' && e[2] === g) continue;
    if (n === 'drift' && e[2] !== 'hop') continue;
    evQ.add([code, kk, encArg(e[2])]);
  }
  if (ut - lastSend >= every()) sendSnap(sim);
}
function sendSnap(sim) {
  lastSend = ut;
  const its = [];
  for (const it of sim.items) {
    const kind = KIND.indexOf(it.k); if (kind < 0 || its.length >= 40) continue;
    const row = [clamp(it.id | 0, 1, I31), kind, r16(it.x), r16(it.y), r16(it.z || 0), clamp(it.own | 0, -1, 5), clamp(it.age | 0, 0, 1e6), clamp(it.rq | 0, 0, I31)];
    if (kind === 1 || kind === 5) { row.push(r16(it.vx), r16(it.vy)); if (kind === 1) row.push(r16(it.vz)); }
    else if (kind === 2) row.push(clamp(it.tgt | 0, -1, 5), r16(it.s), ri((+it.lat || 0) * 64), ri(wrapA(+it.dir || 0) * 4096));
    else if (kind === 3) row.push(clamp(it.tgt | 0, 0, 5), clamp(it.ph | 0, 0, 2), clamp(it.pt | 0, 0, 9999), r16(it.rp));
    else if (kind === 4) row.push(r16(it.rp), it.mask & 63, it.done & 63);
    its.push(row);
  }
  const scr = M.screen, gpo = M.gp, ks = sim.karts;
  let giants = 0; for (const k of ks) if (k.giant > 0 || k.item === I_GIANT) giants++;
  const lead = ks[sim.order[0]], second = ks[sim.order[1]];
  const cool = lead && typeof sim.leadCool === 'function' && sim.leadCool(lead) ? clamp(Math.round((SK.Sim.LEAD_COOL || 480) - (sim.clock - (lead.atkAt == null ? -1e9 : lead.atkAt))), 1, 9999) : 0;
  const ro = [sim.items.some(x => x.k === 'puff') || sim.clock - (sim.puffAt == null ? -9999 : sim.puffAt) < 720 ? 1 : 0, clamp(Math.round(sim.thymeAt == null ? -9999 : sim.thymeAt), -99999, I31), Math.min(6, giants),
    lead && second ? clamp(Math.round(lead.rp - second.rp), 0, 99999) : 0, clamp(sim.giantsUsed | 0, 0, 99), cool];
  const o = { k: 's', run, h: hostHead, ph: sim.phase === 'race' ? 1 : 0, cd: clamp(sim.cd | 0, 0, 9999), c: clamp(sim.clock | 0, 0, I31), sc: scr === 'results' ? 1 : scr === 'podium' ? 2 : 0,
    K: ks.map(packX), B: sim.boxes.map(b => clamp(Math.round(b.t) || 0, -9999, 9999)), I: its, E: evQ.pending(now()), a: lastAsk, ro };
  const gv = ks[g] && ks[g].stats ? ks[g].stats.gave | 0 : 0; if (gv) o.gv = clamp(gv, 0, 9999);
  if (gpo) o.gt = [0, 1, 2, 3, 4, 5].map(w => clamp(gpo.totals[w] | 0, 0, 9999));
  if (sim._final) o.R = sim._final.map(x => [x.i, clamp(x.place | 0, 1, ks.length), clamp(Math.round(x.time) || 0, 0, I31), x.est ? 1 : 0]);
  if (ppQ.length) o.pp = ppQ.map(p => [clamp(p[0] | 0, 1, I31), clamp(p[1] | 0, -1, 5)]);
  if (!send(o)) { o.E = []; o.I = its.slice(0, 16); send(o); }   /* too big (it never should be): the essentials */
}
function onGuest(o) {
  const asks = o.q.slice().sort((x, y) => x[0] - y[0]);
  const ours = o.run === run && curSim && M.sim === curSim;
  for (const q of asks) if (q[0] > lastAsk) { lastAsk = q[0]; if (ours) asksIn.push(q); }   /* each ask once; another race's are only acked */
  if (!ours) return;
  if (o.p && gIt && gIt.push(o.t * TICK, o.p, o._at)) { gNewR = o.t * TICK; gNewAt = o._at; }
  for (const e of o.E) if (gSeen.fresh(e[0])) { gEvIn.push([o.t * TICK, e]); T.gEvIn++; }
  if (gEvIn.length > 128) gEvIn.splice(0, gEvIn.length - 128);
}

/* ---------- GUEST ---------- */
let vIt = null, newestT = -1, gRunCur = -1, hdr = null, hostRes = null, hostSc = -1, latest = null, allowStart = false, roNow = null, gvNow = 0;
let askSeq = 0, asks = [], sendNow = false, lastGSend = -99, F = null, lastPuff = null, ppNow = null;
const ppDone = new Set();
const gone = new Map(), takenUntil = new Int32Array(64), preds = new Map(), owned = new Map(), ownedEver = new Set(), evIn = [], hSeen = seenRing(), gQ = evQueue();
const lobSeen = new Map(), waveDone = new Map(), repMap = new Map(), usedPet = new Int32Array(8), bumpOk = new Uint8Array(8), fromHost = new WeakSet();
let pred = [], replicas = [];
function guestStart(o) {
  const h = o.h; hdr = { track: h[0], diff: h[1], gpRound: h[2], who: h.slice(3), gt: o.gt };
  gRunCur = o.run; hostRes = null; asks = []; gone.clear(); takenUntil.fill(0); preds.clear(); owned.clear(); ownedEver.clear(); evIn.length = 0; pred = []; replicas = [];
  lobSeen.clear(); waveDone.clear(); repMap.clear(); usedPet.fill(0); gQ.clear(); lastPuff = null; roNow = null; gvNow = 0; ppNow = null; ppDone.clear();
  if (vIt) vIt.clear();
  allowStart = true; T.starts++;
  try { M.startRace({ players: 1, gp: hdr.gpRound >= 0, track: hdr.track, diff: hdr.diff, seed: (o.run * 7919 + 13) >>> 0 }); } finally { allowStart = false; }
  lastScr = M.screen;
}
function onSnap(o) {
  if (o.a > 0) asks = asks.filter(q => q[0] > o.a);
  if (o.t <= newestT && newestT - o.t < 3600) { S.old++; if (o.t < newestT && o.run === gRunCur && vIt) vIt.push(o.t * TICK, o, o._at); return; }   /* old or repeated (a late one still fills a gap in the view; a jump back by a minute: the host restarted) */
  newestT = o.t; hostSc = -1;
  if (verBad) return;
  if (o.run !== gRunCur) guestStart(o);
  if (!vIt) vIt = new Interp(rangeFor()[0], rangeFor()[1], every);
  const r = o.t * TICK;
  vIt.push(r, o, o._at);
  latest = { c: o.c, cd: o.cd, ph: o.ph, at: o._at, used: false };
  for (const e of o.E) if (hSeen.fresh(e[0])) { evIn.push([r, e]); T.evIn++; }   /* new events only, in step with the view */
  if (evIn.length > 128) evIn.splice(0, evIn.length - 128);
  if (o.R && o.run === gRunCur && !hostRes) hostRes = o.R;
  if (o.gt && hdr) hdr.gt = o.gt;
  roNow = o.ro; gvNow = o.gv | 0; ppNow = o.pp || null;
}
function onWait(o) {
  if (o.t <= newestT && newestT - o.t < 3600) { S.old++; return; }
  newestT = o.t; hostSc = o.sc;
  if (M.screen === 'race' || M.screen === 'results') { M.toTitle(); lastScr = 'title'; curSim = null; }
}
function guestSetup(sim) {
  curSim = sim; g = hdr ? hdr.who.indexOf(1) : -1; hostIdx = hdr ? hdr.who.indexOf(0) : -1;
  if (g < 0 || !sim.karts[g] || sim.karts[g].who !== 1) { g = -1; return; }
  for (let i = 0; i < sim.karts.length; i++) sim.ext[i] = i !== g;
  sim.useItems = false;   /* the host's bubbles and items: drawn from its snapshots, the guest's own touches decided in guestPost */
  const step0 = sim.step;
  sim.step = function (inp) { step0.call(this, inp); if (online && this === curSim) try { guestPost(this); } catch (e) { report(e); } };
  sim.useItem = guestUseItem;
  /* contacts: only ours with each other kart (the host moved the others into and out of each other already), and only once the
     start's pack has spread (as on the host) */
  bumpOk.fill(0);
  sim.bumps = function () {
    if (!online || this !== curSim) return P.bumps.call(this);
    const ks = this.karts, me = ks[g];
    for (const o of ks) {
      if (o === me) continue;
      if (!bumpOk[o.i]) { if (this.clock >= C.grace && !touching(this, me, o)) bumpOk[o.i] = 1; else continue; }
      bumpPair(this, me, o);
    }
  };
  sim.updatePlaces = function () {
    if (!online || this !== curSim || !vIt || vIt.rc === null || !latest) return P.updatePlaces.call(this);
    placesNow(this, newestT * TICK + (now() - latest.at) + (Net.rtt || 0) / 2 - vIt.rc, i => i !== g);
  };
  /* our own rolls, with the host's caps: a puff or a ribbon about, the thyme cool-down, two giants already */
  sim.rollItem = function (k) {
    const ro = roNow;
    if (ro && online && this === curSim) {
      this.puffAt = ro[0] ? this.clock : -9999; this.thymeAt = ro[1];
      if (ro.length > 4) this.giantsUsed = ro[4];
      if (ro.length > 5) { const L = this.karts[this.order[0]]; if (L && L !== k) L.atkAt = ro[5] ? this.clock - ((SK.Sim.LEAD_COOL || 480) - ro[5]) : -1e9; }
    }
    let id = P.rollItem.call(this, k);
    if (ro && id === I_GIANT && ro[2] >= 2) id = I_BOOST3;
    return id;
  };
  sim.results = function () {
    if (!hostRes || !online) return P.results.call(this);
    return hostRes.map(x => ({ i: x[0], who: this.karts[x[0]].who, cpu: x[0] !== g, place: x[1], time: x[2], est: !!x[3] }));
  };
  /* a stand-in sim for the look-ahead copies and the blueberries we fly: sim.js's own code, which can hit nobody here */
  F = Object.create(sim);
  F.items = []; F.nextId = 900000000; F.events = []; F.fwd = 0; F.bh = null;
  F.ev = function (n, i, a) { if (this.fwd === 2 || (this.fwd === 1 && n === 'splat' && a === 'land')) sim.ev(n, i, a); };
  F.hit = () => 'none';
  F.blueHit = function (it, tk) { this.bh = tk; };
}
function ask(q) { q.unshift(++askSeq); asks.push(q); if (asks.length > 64) asks.shift(); sendNow = true; const t = q[1]; T.asksSent[t === 0 ? 'u' : t === 1 ? 'h' : t === 2 ? 'b' : t === 3 ? 'p' : 'f']++; }
/* our juice, blueberries, puffs and ribbons are thrown by the host (asked); juice, berries and flung petals show at once here */
function guestUseItem(k, fwd) {
  const it = k.item;
  if (!online || this !== curSim || k.i !== g || !it) return P.useItem.call(this, k, fwd);
  if ((it === I_PUFF || it === I_THYME) && typeof this.whyNot === 'function' && this.whyNot(k)) return;   /* kept for later (the HUD says why) */
  const flingNow = it === I_SWIRL && k.swirl > 0;
  if (ASKED.indexOf(it) < 0 && !flingNow) return P.useItem.call(this, k, fwd);   /* boost, shield, a swirl's start, giant: our own kart */
  if (flingNow) ask([5, k.petals & 31]);
  else ask([0, it, r16(k.x), r16(k.y), ri(wrapA(k.dir) * 4096), ri(k.v * 64), r16(k.s), ri(k.lat * 64), fwd ? 1 : 0, clamp(k.place | 0, 1, 6)]);
  const seq = askSeq;
  if (it === I_PUFF || it === I_THYME) {   /* no look-ahead: the host's copy shows in a moment */
    this.ev('use', g, it); k.stats.used++;
    if (it === I_PUFF) { const ks = this.karts; let t = ks[this.order[0]]; if (t === k) t = ks[this.order[1]]; this.ev('puff', g, t ? t.i : -1); }
    else { let n = 0; for (const o of this.karts) if (!o.finished && o.place < k.place) n++; this.ev('thyme', g, n); }
    this.clearItem(k); return;
  }
  const n0 = pred.length;
  F.items = pred; F.fwd = 2;
  try { P.useItem.call(F, k, fwd); } finally { F.fwd = 0; }
  for (let j = n0; j < pred.length; j++) pred[j].pred = seq;
  preds.set(seq, { at: ut, seen: false }); T.preds++;
}
function guestPre(sim) {
  const t = now(), r = vIt ? vIt.at(t) : null, me = sim.karts[g];
  for (let i = 0; i < sim.karts.length; i++) sim.ext[i] = i !== g;
  if (r) {
    for (let i = 0; i < sim.karts.length; i++) if (i !== g) {
      const k = sim.karts[i]; if (k.bumpT > 0) k.bumpT--;   /* sim.js counts these down only for the karts it drives */
      applyKart(k, r.a.K[i], r.b.K[i], r.k, r.dt);
      if (!k.swirl) usedPet[i] = 0; k.petals &= ~usedPet[i];
      setScale(k); whereIs(sim, k);
    }
    buildItems(sim, r, me);
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
/* the host's items at the view time, eased by id; ours (asked) show from our look-ahead copies, blueberries after us within
   40 m from our own flight of them */
function buildItems(sim, r, me) {
  const prev = new Map(); if (r.a !== r.b) for (const row of r.a.I) prev.set(row[0], row);
  const f = clamp(r.k, 0, C.kx), g1 = Math.min(1, f), TK = sim.track, vis = [], seenRq = new Set(), here = new Set();
  replicas = [];
  for (const row of r.b.I) {
    const id = row[0]; here.add(id); if (gone.has(id)) continue;
    const kind = row[1]; let o = repMap.get(id);
    if (!o) { o = { id, life: 1e9, dg: 0, dy: 0 }; repMap.set(id, o); }   /* one object per item for its whole life (the CPU driver keeps its dodge choice on it) */
    o.k = KIND[kind]; o.x = row[2] / 16; o.y = row[3] / 16; o.z = row[4] / 16; o.own = row[5]; o.age = row[6]; o.rq = row[7];
    if (kind === 1 || kind === 5) { o.vx = row[8] / 16; o.vy = row[9] / 16; if (kind === 1) o.vz = row[10] / 16; }
    else if (kind === 2) { o.tgt = row[8]; o.s = row[9] / 16; o.lat = row[10] / 64; o.dir = row[11] / 4096; o.ph = 0; }
    else if (kind === 3) { o.tgt = row[8]; o.ph = row[9]; o.pt = row[10]; o.rp = row[11] / 16; o.s = 0; }
    else if (kind === 4) { o.rp = row[8] / 16; o.mask = row[9]; o.done = row[10] | (waveDone.get(id) || 0); }
    const p = prev.get(id);
    if (p && p[1] === kind && (p[2] - row[2]) ** 2 + (p[3] - row[3]) ** 2 < 4096 * 16) {
      o.x = (p[2] + (row[2] - p[2]) * f) / 16; o.y = (p[3] + (row[3] - p[3]) * f) / 16; o.z = Math.max(0, (p[4] + (row[4] - p[4]) * f) / 16);
      o.age = Math.max(0, Math.round(p[6] + (row[6] - p[6]) * g1));
      if (kind === 3 || kind === 4) { const ia = kind === 3 ? 11 : 8; o.rp = (p[ia] + (row[ia] - p[ia]) * f) / 16; }
      if (kind === 2) o.dir = wrapA(p[11] / 4096 + wrapA((row[11] - p[11]) / 4096) * g1);
    }
    if (kind === 4) { SK.locate(TK, o.x, o.y, LOC); o.s = LOC.ok ? LOC.s : 0; }
    else if (kind === 0 && o.cut === undefined) { SK.locate(TK, o.x, o.y, LOC); o.s = LOC.s; o.lat = LOC.d; o.cut = LOC.ok ? LOC.cut : -2; }   /* a puddle's road metres, as sim.js keeps them */
    if (kind === 3 && o.tgt === g) {   /* a puff for us hovers over our real kart */
      lastPuff = { id, own: o.own };
      if (o.ph >= 1 && me) { o.x = me.x - Math.cos(me.dir); o.y = me.y - Math.sin(me.dir); }
    }
    replicas.push(o);
    if (o.rq && preds.has(o.rq)) {
      seenRq.add(o.rq); preds.get(o.rq).seen = true;
      if (o.k !== 'splat') continue;
      for (let j = pred.length - 1; j >= 0; j--) if (pred[j].pred === o.rq) pred.splice(j, 1);   /* the puddle is down: the host's shows */
    }
    const ownR = C.own + Math.max(0, +me.v || 0) * ((Net.rtt || 0) / 2000 + (vIt ? vIt.D / 1000 : 0.1));
    if (o.k === 'blue' && o.tgt === g && o.own !== g && me && !ownedEver.has(id) && !me.finished && (o.x - me.x) ** 2 + (o.y - me.y) ** 2 < ownR * ownR) {
      /* ours from here: where it is (its road metres from x, y, not the host row's stale s), homing straight at us, and it lives
         until it lands (fix round 1: the copy restarted metres behind and died with the host's at age 600) */
      ownedEver.add(id); T.owned++;
      SK.locate(TK, o.x, o.y, LOC); const s0 = LOC.ok && LOC.cut < 0 ? LOC.s : o.s;
      let ds = ((s0 - me.s) % TK.L + TK.L) % TK.L; if (ds > TK.L / 2) ds -= TK.L;
      owned.set(id, { id, k: 'blue', x: o.x, y: o.y, z: o.z, s: s0, lat: LOC.ok && LOC.cut < 0 ? LOC.d : o.lat, dir: Math.atan2(me.y - o.y, me.x - o.x), tgt: g, own: o.own, age: o.age, life: o.age + 600, ph: 1, wait: 0, rp: me.rp + ds, rid: id });
    }
    if (owned.has(id)) continue;
    vis.push(o);
  }
  /* our copies outlive the host's row: the host never hits our kart, so its berry only ever ends by our word */
  for (const id of repMap.keys()) if (!here.has(id) || gone.has(id)) repMap.delete(id);
  for (const [seq, P0] of preds) {
    const drop = (P0.seen && !seenRq.has(seq)) || (!P0.seen && ut - P0.at > C.predWait);
    if (drop) { for (let j = pred.length - 1; j >= 0; j--) if (pred[j].pred === seq) pred.splice(j, 1); preds.delete(seq); T.predDrop++; }
  }
  for (const p of pred) vis.push(p);
  for (const s of owned.values()) vis.push(s);
  sim.items = vis;
}
function puffOnMe(sim, k, id, own) {
  ppDone.add(id); if (ppDone.size > 32) ppDone.delete(ppDone.values().next().value);
  const rr = sim.hit(k, 'bonk', 'puff', own); if (rr === 'none') sim.ev('immune', g, 'puff');
  ask([1, id, 3, resCode(rr)]); T.puffMe++; dbgPush(T.hitIds, gRunCur + ':p' + id);
}
function guestPost(sim) {   /* after the step, before main hears the events */
  const k = sim.karts[g], K = KART, TK = sim.track;
  /* a puff that came down on us at the host (repeated in its snapshots until we answer): once it has gone from our view, if its
     'puffpop' never reached us (a gap in the link), it is our call now (fix round 1) */
  if (ppNow) for (const p of ppNow) if (!ppDone.has(p[0]) && !replicas.some(r => r.id === p[0])) puffOnMe(sim, k, p[0], p[1]);
  if (!hostRes) sim.done = false;   /* the race ends when the host's results are in */
  const free = !k.fall && !k.lift;
  /* our own swirl, and other karts' orbiting petals on us: sim.js's stepSwirl (only our kart is not ext; no puddles to soak) */
  { const its = sim.items, e1 = sim.events.length; sim.items = []; try { P.stepSwirl.call(sim); } finally { sim.items = its; }
    for (let j = e1; j < sim.events.length; j++) { const e = sim.events[j]; if (e[0] === 'petal' && e[1] === g) { const o = e[2] >> 3, b = e[2] & 7; usedPet[o] |= 1 << b; ask([3, o, b]); T.petalMe++; } } }
  /* bubbles we touch are ours (we say so); sim.js's rules: a kart with an item passes through */
  if (free && !k.item && !k.roll && !k.swirl) for (let j = 0; j < sim.boxes.length; j++) {
    const b = sim.boxes[j]; if (b.t > 0 || Math.abs(k.z - b.z) >= 1) continue;
    if ((k.x - b.x) ** 2 + (k.y - b.y) ** 2 < K.BOX_R * K.BOX_R) { const back = k.lap === TK.laps ? (K.BOX_FINAL || 45) : K.BOX_BACK; b.t = back; takenUntil[j] = ut + back; sim.ev('box', g, 0); k.roll = 54; k.rollSky = b.sky; ask([2, j]); break; }   /* 54: sim.js's roulette */
  }
  /* the host's items that reach us: our call (sim.js's reach for each) */
  for (const it of replicas) {
    if (gone.has(it.id)) continue;
    const d2 = (k.x - it.x) ** 2 + (k.y - it.y) ** 2;
    if (it.k === 'lob') { lobSeen.set(it.id, Math.atan2(it.vy, it.vx)); continue; }
    if (it.k === 'splat') {
      if (lobSeen.has(it.id)) {   /* a toss just landed: a spin for anyone right under it */
        const dir = lobSeen.get(it.id); lobSeen.delete(it.id);
        if (free && k.z < 1.2 && d2 < 2.56) {
          const r = sim.hit(k, 'spin', 'lob', it.own, { dir }); T.lobMe++;
          if (r === 'hit') { gone.set(it.id, ut); sim.ev('splat', g, 'hit'); ask([1, it.id, 1, 0]); dbgPush(T.hitIds, gRunCur + ':' + it.id); continue; }
          if (r === 'shield') ask([1, it.id, 1, 1]);
        }
      }
      if ((it.own === g && it.age < 40) || k.z >= 0.6 || !free) continue;
      if (d2 >= 2.89 * Math.max(1, k.scale * k.scale * 0.6)) continue;
      if (k.giant) { gone.set(it.id, ut); sim.ev('splat', g, 'squash'); ask([1, it.id, 0, 2]); continue; }
      const r = sim.hit(k, 'spin', 'splat', it.own);
      if (r !== 'none') { gone.set(it.id, ut); sim.ev('splat', g, 'hit'); ask([1, it.id, 0, resCode(r)]); dbgPush(T.hitIds, gRunCur + ':' + it.id); }
    } else if (it.k === 'blue') {   /* a leader's berry goes for the first kart it meets on the road */
      if (it.tgt >= 0 || it.own === g || !free || d2 >= 2.25 || Math.abs(k.z - it.z) >= 2.5) continue;
      const r = sim.hit(k, 'spin', 'blue', it.own, { dir: it.dir }); gone.set(it.id, ut); sim.ev('splash', g, 'blue'); ask([1, it.id, 2, resCode(r)]); dbgPush(T.hitIds, gRunCur + ':' + it.id);
    } else if (it.k === 'petal') {
      if (it.own === g || !free || Math.abs(k.z + 0.4 - it.z) >= 1.2 || d2 >= 1.21) continue;
      const r = sim.hit(k, 'spin', 'petal', it.own, { src: sim.karts[it.own] || it, short: 1 }); gone.set(it.id, ut); sim.ev('petal', g, it.own * 8 + 7); ask([1, it.id, 5, resCode(r)]); dbgPush(T.hitIds, gRunCur + ':' + it.id);
    } else if (it.k === 'wave') {   /* the ribbon reaches our race metres: were we hopping? */
      if (!((it.mask >> g) & 1) || ((it.done >> g) & 1) || (!k.finished && it.rp < k.rp)) continue;
      waveDone.set(it.id, 1 << g); it.done |= 1 << g; T.waveMe++;
      let res = 2;
      if (k.finished || !free) res = 2;
      else if (k.z > 0.15 || sim.clock - (k.hopAt == null ? -1e9 : k.hopAt) <= (SK.Sim.HOP_WIN || 48)) { k.stats.dodges++; sim.ev('dodge', g, 'thyme'); res = 3; }
      else res = resCode(sim.hit(k, 'tiny', 'thyme', it.own));
      ask([1, it.id, 4, res]); dbgPush(T.hitIds, gRunCur + ':' + it.id);
    }
  }
  /* blueberries after us, flown here against where we really are (sim.js's stepBlue) */
  for (const [rid, s] of owned) {
    F.items = [s]; F.bh = null; F.fwd = 0; s.age++;
    const keep = s.age < s.life && P.stepBlue.call(F, s);
    if (F.bh === k) {
      const r = sim.hit(k, 'spin', 'blue', s.own, { dir: s.dir }); sim.ev('splash', g, 'blue');
      gone.set(rid, ut); owned.delete(rid); ask([1, rid, 2, resCode(r)]); T.ownedHits++; dbgPush(T.hitIds, gRunCur + ':' + rid);
    } else if (!keep || s.tgt !== g) owned.delete(rid);   /* popped, or after someone else now: the host's copy carries on */
  }
  /* our own look-ahead copies */
  if (pred.length) { F.items = pred; F.fwd = 1; try { P.stepItems.call(F); } finally { F.fwd = 0; } for (let j = pred.length - 1; j >= 0; j--) if (pred[j].k === 'splat' && pred[j].age > 600) pred.splice(j, 1); }
  for (const [id, at] of gone) if (ut - at > 1800) gone.delete(id);
  if (lobSeen.size > 64) lobSeen.clear();
  /* a giant's shove or a boing from another kart (sim.js's bumps, our side): the host keeps its stats */
  for (const e of sim.events) if (e[1] === g && ((e[0] === 'spin' && e[2] === 'giant') || e[0] === 'boing')) {
    let src = e[0] === 'boing' ? e[2] : -1;
    if (src < 0) { let bd = 1e9; for (const o of sim.karts) if (o !== k && o.giant > 0) { const d = (o.x - k.x) ** 2 + (o.y - k.y) ** 2; if (d < bd) { bd = d; src = o.i; } } }
    if (src >= 0 && src !== g) ask([1, src + 1, 7, 0]);
  }
  if (k.stats && gvNow > (k.stats.gave | 0)) k.stats.gave = gvNow;   /* our hits on the others are counted by the host */
  /* the host's events, once the view has caught up with them */
  const rc = vIt && vIt.rc !== null ? vIt.rc : -1e12;
  let n = 0;
  for (const [r, e] of evIn) {
    if (r > rc + 1) break;
    n++;
    const name = EVN[e[1]], kk = e[2], arg = decArg(e[3]), late = r < rc - C.evLate;
    if (name === 'puffpop' && kk === g && !ppDone.has(lastPuff ? lastPuff.id : 0)) puffOnMe(sim, k, lastPuff ? lastPuff.id : 1, lastPuff ? lastPuff.own : -1);   /* the puff came down on us: our call */
    if (name === 'petal' && typeof arg === 'number' && (arg >> 3) === g && (arg & 7) < 5) k.petals &= ~(1 << (arg & 7));   /* one of our petals was used up there */
    if (late) { T.evLateDrop++; continue; }
    if (kk >= sim.karts.length || (kk < 0 && name !== 'pop') || (kk === g && name !== 'puffpop' && name !== 'puffhover')) continue;
    if (kk >= 0 && kk !== g && free) {   /* the splash round a puff or a berry reaches us too */
      const o = sim.karts[kk], d2 = (o.x - k.x) ** 2 + (o.y - k.y) ** 2;
      if (name === 'puffpop' && d2 < 25) sim.hit(k, 'wobble', 'puff', -1);
      else if (name === 'splash' && d2 < 9) sim.hit(k, 'wobble', 'blue', -1);
    }
    const ev = [name, kk, arg]; fromHost.add(ev); sim.events.push(ev); T.evUsed++;
  }
  if (n) evIn.splice(0, n);
  /* our own kart's events, for the host's screen */
  for (const e of sim.events) {
    if (e[1] !== g || fromHost.has(e)) continue;
    const code = EV[e[0]]; if (code === undefined || G_SKIP.has(e[0])) continue;
    if ((e[0] === 'splat' && e[2] === 'drop') || (e[0] === 'drift' && e[2] !== 'hop') || (e[0] === 'bump' && typeof e[2] === 'number')) continue;
    gQ.add([code, encArg(e[2])]);
  }
}
function guestAfter(sim) {
  if (sendNow || ut - lastGSend >= every()) sendG(sim);
}
function sendG(sim) {
  sendNow = false; lastGSend = ut;
  const o = { k: 'g', run: sim && sim === curSim && g >= 0 ? gRunCur : -1 };
  if (o.run >= 0) { o.p = packX(sim.karts[g]); const E = gQ.pending(now()); if (E.length) o.E = E; }
  if (asks.length) o.q = asks.slice(-32);
  send(o);
}

/* ---------- going on alone: the other kart joins the CPU racers, the race goes on ---------- */
function asCpu(sim, k) {   /* a kart we only saw becomes one of ours: where it is, and a sane flight if it is in the air */
  SK.locate(sim.track, k.x, k.y, LOC);
  if (LOC.ok) { k.s = k.lastS = LOC.s; k.lat = LOC.d; k.u = LOC.u; }
  if (k.air > 0) { k.toS = k.s; k.toD = 40; k.airN = k.air + 30; k.vz = 0; k.aim = 0; }
  k.px = k.py = 0; k.bumpT = 0; k.boingT = 0; k.held = 0; k.hh = 0;
}
function raceAlone(why) {
  const role = Net.role;
  if (why !== 'peer' && why !== 'exit') Net.leave();
  online = false; quiet = verBad = false; Net.role = null; Net.mode = 'solo'; T.solo = why;
  const sim = M && M.sim;
  if (sim && sim === curSim && g >= 0) {
    for (const f of ['step', 'stepItems', 'stepSwirl', 'stepBoxes', 'bumps', 'updatePlaces', 'useItem', 'rollItem', 'results']) delete sim[f];
    if (role === 'host') { const k = sim.karts[g]; k.petals &= ~gPetClr; sim.ext[g] = false; k.cpu = true; asCpu(sim, k); }
    else {
      sim.useItems = true;
      for (const k of sim.karts) { sim.ext[k.i] = false; if (k.i === g) continue; k.cpu = true; k.petals &= ~usedPet[k.i]; asCpu(sim, k); }
      let id = 1; for (const it of replicas) id = Math.max(id, it.id + 1);
      const keep = [];
      for (const it of replicas) if (it.k === 'splat' && !gone.has(it.id)) { SK.locate(sim.track, it.x, it.y, LOC); keep.push({ id: it.id, k: 'splat', x: it.x, y: it.y, z: 0, own: it.own, age: it.age, life: Math.max(it.age + 300, 1500), s: LOC.s, lat: LOC.d, cut: LOC.cut, dg: 0, dy: 0 }); }
      sim.items = keep; sim.nextId = Math.max(sim.nextId, id); sim.done = false;
      if (roNow) { sim.thymeAt = roNow[1]; if (roNow[0]) sim.puffAt = sim.clock; }
    }
  }
  curSim = null; pred = []; owned.clear(); preds.clear();
}
function peerLeft() {
  if (!online) return;
  const who = opp(), racing = M && M.screen === 'race', never = !heardAny;
  raceAlone('peer');
  toast(never ? who + ' couldn’t join' : racing ? who + ' left: you race on with the CPUs' : who + ' left the garden');   /* R5 */
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
  online = true; heardAny = false; verBad = quiet = false; verN = 0; Net.rtt = 0; lastRT = -1; sentT.fill(-1); Net.lastIn = now();
  startAt = now() + clamp(+m.startIn || 0, 0, C.holdMax);   /* the room's agreed start: a host's first countdown waits for it (hostPre) */
  run = (Date.now() / 1000 | 0) % 100000 * 10; lastAsk = 0; asksIn.length = 0; evQ.clear(); gSeen.clear(); gEvIn.length = 0;
  newestT = -1; gRunCur = -1; hdr = null; hostRes = null; hostSc = -1; latest = null; asks = []; askSeq = 0; curSim = null; g = -1; hSeen.clear(); evIn.length = 0; gQ.clear();
  if (role === 'guest') myWho = 1;
  if (M && M.screen !== 'title') M.toTitle();
  lastScr = M ? M.screen : '';
}

/* ---------- drawing our notes (the layout comes from main.js: L = {LH, VH, pad}) ---------- */
let mctx = null;
function fitText(ctx, s, x, y, size, col, maxW) {   /* RD.text, shrunk to fit maxW (review A2) */
  const RD = SK.Render; if (!mctx) { try { mctx = document.createElement('canvas').getContext('2d'); } catch (_) { mctx = null; } }
  let z = size; if (mctx) { const w = RD.text(mctx, s, -999, -999, size, col); if (w > maxW) z = size * maxW / w; }
  RD.text(ctx, s, x, y, z, col);
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/* where the quiet note was drawn (page units), for its tap */
const NOTE = { x: 0, y: 0, w: 0, h: 0 };
/* ---------- SK.Main's hooks ---------- */
const hooks = {
  tick(u) {
    ut = u;
    if (!online) return;
    const t = now();
    const q0 = quiet; quiet = Net.silence(t) > C.quiet && (heardAny || Net.role === 'guest' || M.screen === 'race');
    if (quiet && !q0) quietAt = t;
    if (quiet && Net.silence(t) > C.alone) { raceAlone('quiet'); toast(opp() + ' went quiet: you race on with the CPUs'); return; }   /* after 30 s: on alone by ourselves */
    if (Net.rtt && t - rttPostAt >= 1000) { rttPostAt = t; Net.post({ ty: 'rtt', ms: Math.round(Net.rtt) }); }
    meterTick(t);
    const scr = M.screen;
    if (lastScr === 'race' && scr === 'title') { raceAlone('left'); toast('You left the online race'); return; }   /* the pause menu's END THE MATCH: the match ends, the other races on (fix round 1: say so) */
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
    /* ENTER (not a gameplay key: SPACE is the hop) races on alone, from the note's second second (fix round 1) */
    if (quiet || verBad) { if ((c === 'Enter' || c === 'NumpadEnter') && (verBad || now() - quietAt > 1000)) { raceAlone(verBad ? 'version' : 'quiet'); return true; } return false; }
    if (Net.role === 'guest' && (M.screen === 'title' || M.screen === 'tracks')) return !(c === 'Escape' || c === 'Backspace');   /* waiting: only leaving */
    return false;
  },
  tap(x, y) {   /* main.js asks us first on every press, a race included: only a tap on the note (or the version card) counts */
    if (!online || !(quiet || verBad)) return false;
    const R = NOTE; if (!verBad && (now() - quietAt < 1000 || !(x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h))) return false;
    raceAlone(verBad ? 'version' : 'quiet'); return true;
  },
  screen(name, S) {
    if (!online) return;
    if (name === 'pause') S.opts = ['CARRY ON', 'END THE MATCH', 'LEAVE'];   /* BACK TO TITLE ends an online match: say so (fix round 1) */
    if (name === 'title' && Net.role === 'guest') {   /* the card's words are drawn by draw() below, two lines that fit (A2) */
      S.online = true; S.onlineText = ' '; S.onlineSub = '';
    } else if (name === 'results' && Net.role === 'guest' && !(hdr && hdr.gpRound === 2 && M.gp)) { S.prompt = 'Waiting for ' + opp() + ' to start the next race'; S.prompt2 = 'Esc: leave'; }
  },
  draw(ctx, W, H, L) {
    const RD = SK.Render; if (!RD || !RD.text) return;
    L = L || {}; const VH = L.VH || 400, LH = L.LH || VH, ty = L.pad ? (LH - VH) / 2 : 0;   /* the title's 400-high block, from our (view-centred) one */
    const scr = M.screen;
    if (online && scr === 'title') {
      if (Net.role === 'host') {   /* over the title's last hint line (A1, R6a) */
        ctx.fillStyle = 'rgba(43,33,64,.94)'; rr(ctx, W / 2 - 270, ty + H - 35, 540, 27, 13); ctx.fill();
        fitText(ctx, 'Online with ' + opp() + ' · you pick the race · you are SPRIG', W / 2, ty + H - 21, 14, '#ffd93b', 520);
      } else {   /* the guest's waiting card (render.js draws it, 380 wide at y 150): two lines scaled to fit, then who you drive */
        const l1 = hostSc === 1 ? opp() + ' is picking' : heardAny ? 'Waiting for ' + opp() : 'Waiting for ' + opp() + '…', l2 = hostSc === 1 ? 'a track…' : heardAny ? 'to choose a race…' : '';
        if (l2) { fitText(ctx, l1, W / 2, ty + 186, 20, '#ffd93b', 350); fitText(ctx, l2, W / 2, ty + 212, 20, '#ffd93b', 350); }
        else fitText(ctx, l1, W / 2, ty + 198, 20, '#ffd93b', 350);
        fitText(ctx, 'You drive MARIGOLD, the orange kart', W / 2, ty + 244, 14, '#fff', 350);
      }
    }
    if (online && Net.role === 'host' && scr === 'race' && ut - holdUt < 3) {   /* the countdown waits for the guest (startIn) */
      ctx.fillStyle = 'rgba(43,33,64,.9)'; rr(ctx, W / 2 - 150, 120, 300, 40, 20); ctx.fill();
      fitText(ctx, 'Waiting for ' + opp() + '…', W / 2, 140, 18, '#ffd93b', 280);
    }
    const age = ut - toastAt;
    if (toastT && age < 330) {   /* on the title below the menu card (R6b); in a race under the top of the view */
      ctx.globalAlpha = Math.min(1, (330 - age) / 30);
      const y = scr === 'title' || scr === 'tracks' ? ty + 352 : scr === 'race' ? 92 - (VH - 400) / 2 : 92, w = Math.min(W - 40, 40 + toastT.length * 8.6);
      ctx.fillStyle = 'rgba(43,33,64,.92)'; rr(ctx, W / 2 - w / 2, y - 17, w, 34, 17); ctx.fill();
      fitText(ctx, toastT, W / 2, y, 16, '#fff', w - 24); ctx.globalAlpha = 1;
    }
    if (online && verBad) RD.screen(ctx, 'msg', { W, H, text: 'Refresh the page\nto race together\nENTER or tap: race on alone' });
    else if (online && quiet) {   /* a small note, not a card over the race: it goes away by itself if they come back (fix round 1) */
      const y = scr === 'race' ? 142 - (VH - 400) / 2 : ty + 352, w = Math.min(W - 40, 440), x = W / 2 - w / 2, sec = Math.max(0, Math.ceil((C.alone - Net.silence()) / 1000));
      ctx.fillStyle = 'rgba(43,33,64,.9)'; rr(ctx, x, y - 22, w, 44, 22); ctx.fill(); ctx.strokeStyle = 'rgba(255,217,59,.8)'; ctx.lineWidth = 2; ctx.stroke();
      fitText(ctx, opp() + ' went quiet', W / 2, y - 8, 15, '#ffd93b', w - 24);
      fitText(ctx, (now() - quietAt < 1000 ? 'waiting…' : 'ENTER or tap here: race on alone') + ' · on alone in ' + sec + ' s', W / 2, y + 10, 12.5, '#fff', w - 24);
      NOTE.x = x; NOTE.y = y - 22 + (VH - 400) / 2; NOTE.w = w; NOTE.h = 44;   /* page units: main draws us translated by (VH - 400) / 2 */
    }
  },
  live() { return online; }
};

/* ---------- SK.Net ---------- */
const Net = SK.Net = {
  role: null, mode: 'solo', me: '', opp: '', rtt: 0, lastIn: 0, PROTO, MAXMSG, valid, Interp, stats: S, C, debug: /[?&]debug=1/.test(location.search),
  init(c) {
    cb = c || {}; M = cb.main || SK.Main;
    if (M && M.hooks && P) Object.assign(M.hooks, hooks);
    while (early.length) { const [m, at] = early.shift(); try { handle(m, at); } catch (e) { report(e); } }
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
      pred: pred.length, owned: owned.size, gone: gone.size, evQ: evQ.q.length, gQ: gQ.q.length, toast: toastT, toasts: T0.toast, silence: Math.round(this.silence()), holding: ut - holdUt < 3,
      D: (vIt || gIt) ? Math.round((vIt || gIt).D) : 0, interp: (vIt || gIt) ? Object.assign({}, (vIt || gIt).n) : null, gPetClr };
  },
  get test() { return T; },
  get replicas() { return replicas; }
};
})();
