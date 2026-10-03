/* Berry Breeze — world.js: the host simulation (headless; no drawing).
   CORE (lead): the w API that content.js calls (SPEC.md section 3), the timeline runner, enemy and bullet stepping, fruit
   physics, damage. ENGINE completion: the Ship class (used by host AND guest), player shots and seeds, collisions (shots vs
   enemies/bushes/falling fruit, seeds vs bullets, bullets/live zaps vs ships, bonks, boss push), magnet + pickups → power-ups
   or guest grants, score, team basket, heart gifts, kind assist, phases (only with o.auto: play → warning → boss → tally →
   next stage / ending), the boss death flow (bossDone), and the world side of the snapshot (pack / World.unpack).
   Keep every w API name and signature. Plain objects in w.ships (the content harness) are left alone. */
'use strict';
(function () {
const C = BB.C, TAU = Math.PI * 2, SH = C.SHIP, FR = C.FRUIT, D2R = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
BB.clamp = clamp;
const X4 = v => Math.round(v * 4);
const NOIN = Object.freeze({ dx: 0, dy: 0, mx: 0, my: 0, fire: false, charge: false });
const AWAY_SOLO = 1200;   /* a remote partner away this long (20 s): bosses are sized for one */
const SHOT_TOP = 4;       /* shots only hit things that are on screen (centre y >= 4) */
/* in-place compaction (no new arrays each tick) and its predicates */
function keep(a, fn) { let j = 0; for (let i = 0; i < a.length; i++) if (fn(a[i])) a[j++] = a[i]; a.length = j; }
const liveE = e => !e.dead, liveB = b => b.x > -10 && b.x < C.W + 10 && b.y > -10 && b.y < C.H + 10 && !b.dead, liveF = f => f.y < FR.yOut && !f.taken, notTaken = f => !f.taken, notDead = b => !b.dead;
/* sticker texts sent as 'T' events by index; fx kind used when each toy is cheered up (K events carry tc) */
BB.STICKERS = ['TEAM TOSS!', 'BASKET!', 'MAX!', 'JOINED!'];
BB.KILLFX = { smudge: 'pop', glider: 'unwind', tinbot: 'unwind', grumble: 'calm', twirlie: 'unwind', boinger: 'unwind', vent: 'pop',
  ticktock: 'unwind', bush: 'pop', present: 'unwind', grumblet: 'calm' };

/* ---------- Ship: one player's sprout-copter. Host: P1, local P2, and the mirror of the online guest (remote).
   Guest: its own ship, and a cosmetic mirror of the host. Field names match the 12-int ship pack (SPEC section 6). ---------- */
class Ship {
  constructor(who, x, y) { this.who = who | 0; this.x = x; this.y = y; this.shots = []; this.bx = [x, x]; this.by = [y, y]; this.reset(); }
  reset(x, y) {
    if (x != null) { this.x = x; this.y = y; }
    this.hp = SH.hpMax; this.shield = 0; this.buddies = 0; this.spd = 0; this.spread = 0; this.charge = 0; this.cool = 0;
    this.inv = 0; this.down = false; this.downT = 0; this.bub = 0; this.sn = 0; this.sl = 0; this.f = 0;
    this.firing = false; this.charging = false; this.hidden = false; this.away = false;
    this.fireT = 0; this.budT = 0; this.bonkT = 0; this.tilt = 0; this.t = 0; this.vol = false; this.rel = 0;
    this.lastSn = -1; this.lastBub = -1; this.revAt = -99; this.shots.length = 0;
    this.bx[0] = this.bx[1] = this.x; this.by[0] = this.by[1] = this.y;
  }
  /* one tick of a ship this device controls. inp {dx,dy (-1..1 keys), mx,my (touch drag px, consumed), fire, charge} */
  step(inp, partner) {
    inp = inp || NOIN; this.t++; this.vol = false; this.rel = 0;
    if (this.inv > 0) this.inv--;
    if (this.bonkT > 0) this.bonkT--;
    if (this.cool > 0) this.cool--;
    if (this.down) {
      this.downT++; this.firing = this.charging = false; this.charge = 0;
      if (this.y > SH.downYMin) this.y = Math.max(SH.downYMin, this.y - SH.downRise);
      this.x = clamp(this.x + (inp.dx || 0) * 0.5, SH.xMin, SH.xMax);         /* a gentle sideways steer under the parachute */
      if (inp !== NOIN) inp.mx = inp.my = 0;
      if (this.downT >= SH.downTicks || (partner && !partner.down && !partner.away && (partner.x - this.x) ** 2 + (partner.y - this.y) ** 2 < SH.reviveR * SH.reviveR)) this.revive();
    } else {
      const v = SH.speeds[this.spd] || SH.speeds[0];
      let dx = inp.dx || 0, dy = inp.dy || 0;
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      let mx = dx * v, my = dy * v;
      if (inp.mx || inp.my) {                                                  /* touch: relative drag, capped at 3x speed per tick */
        const cap = 3 * v, L = Math.hypot(inp.mx, inp.my), k = L > cap ? cap / L : 1, ux = inp.mx * k, uy = inp.my * k;
        mx += ux; my += uy; inp.mx -= ux; inp.my -= uy;
      }
      const nx = clamp(this.x + mx, SH.xMin, SH.xMax), ny = clamp(this.y + my, SH.yMin, SH.yMax);
      if (inp !== NOIN) { if (nx === SH.xMin || nx === SH.xMax) inp.mx = 0; if (ny === SH.yMin || ny === SH.yMax) inp.my = 0; }
      this.tilt += (clamp((nx - this.x) / v, -1, 1) - this.tilt) * 0.25;
      this.x = nx; this.y = ny;
      this.firing = !!inp.fire; this.fireTick();
      if (inp.charge) { if (this.cool === 0) { this.charging = true; if (this.charge < SH.chargeMax) this.charge++; } }
      else if (this.charging) {
        this.charging = false; const c = this.charge; this.charge = 0;
        if (c >= SH.chargeHalf) { this.sn++; this.sl = c >= SH.chargeMax ? 2 : 1; this.rel = this.sl; this.addSeed(this.sl); this.cool = SH.chargeCool; }
      }
    }
    this.buddyLerp(); this.flags();
  }
  /* a ship known only from its packs: same volley cadence from the fire flag, seeds from sn/sl */
  mirror() {
    this.t++; this.vol = false; this.rel = 0;
    if (this.bonkT > 0) this.bonkT--;
    if (this.px != null) this.tilt += (clamp((this.x - this.px) / 1.5, -1, 1) - this.tilt) * 0.25;
    this.px = this.x;
    this.fireTick();
    if (this.lastSn < 0 || this.sn < this.lastSn) this.lastSn = this.sn;
    else if (this.sn > this.lastSn) { this.lastSn = this.sn; if (!this.down) { this.rel = this.sl === 2 ? 2 : 1; this.addSeed(this.rel); } }
    this.buddyLerp();
  }
  fireTick() {
    const on = this.firing && !this.down;
    if (this.fireT > 0) this.fireT--;
    if (this.budT > 0) this.budT--;
    if (!on) return;
    if (this.fireT === 0) { this.volley(); this.fireT = SH.fireEvery; this.vol = true; }
    if (this.buddies > 0 && this.budT === 0) { for (let i = 0; i < this.buddies; i++) this.shot(this.bx[i], this.by[i] - 4, (i ? 1 : -1) * SH.buddyAngDeg, 'b'); this.budT = SH.buddyEvery; }
  }
  volley() {
    const a = SH.spreadDeg[this.spread] || SH.spreadDeg[0];
    for (let i = 0; i < a.length; i++) {
      if (a[i] === 0) { this.shot(this.x - SH.shotDx, this.y - 10, 0, 'p'); this.shot(this.x + SH.shotDx, this.y - 10, 0, 'p'); }
      else this.shot(this.x, this.y - 8, a[i], 'p');
    }
  }
  shot(x, y, deg, kind) {
    if (this.shots.length >= C.MAX_PSHOT) return null;
    const b = kind === 'b', v = b ? SH.buddyV : SH.shotV, r = deg * D2R;
    const s = { x, y, vx: Math.sin(r) * v, vy: -Math.cos(r) * v, r: b ? SH.buddyR : SH.shotR, dmg: 1, kind, who: this.who, ang: r - Math.PI / 2, dead: false, cancelR: 0, hitIds: null, bossAt: -99 };
    this.shots.push(s); return s;
  }
  addSeed(lv) {
    const S = lv === 2 ? SH.sun : SH.seedlet;
    this.shots.push({ x: this.x, y: this.y - 12, vx: 0, vy: -S.v, r: S.r, dmg: S.dmg, kind: lv === 2 ? 'sun' : 'seedlet', who: this.who,
      ang: -Math.PI / 2, dead: false, cancelR: S.cancelR, hitIds: lv === 2 ? [] : null, bossAt: -99 });
  }
  moveShots() {
    const a = this.shots; let j = 0;
    for (let i = 0; i < a.length; i++) {
      const s = a[i]; if (s.dead) continue;
      s.x += s.vx; s.y += s.vy;
      if (s.y < -16 || s.x < -16 || s.x > C.W + 16) continue;
      a[j++] = s;
    }
    a.length = j;
  }
  buddyLerp() { for (let i = 0; i < 2; i++) { const sl = SH.buddySlots[i]; this.bx[i] += (this.x + sl[0] - this.bx[i]) * SH.buddyLerp; this.by[i] += (this.y + sl[1] - this.by[i]) * SH.buddyLerp; } }
  flags() { this.f = (this.firing ? 1 : 0) | (this.charging ? 2 : 0) | (this.inv > 0 ? 4 : 0) | (this.down ? 8 : 0) | (this.hidden ? 16 : 0); return this.f; }
  /* hit by a bullet or a live zap: 0 nothing (invulnerable), 1 shield layer popped, 2 heart lost, 3 bubbled (down) */
  hurt() {
    if (this.down || this.inv > 0) return 0;
    this.inv = SH.invHit;
    if (this.shield > 0) { this.shield--; return 1; }
    this.hp--; if (this.buddies > 0) this.buddies--;
    if (this.hp <= 0) { this.goDown(); return 3; }
    return 2;
  }
  goDown() { this.down = true; this.downT = 0; this.hp = 0; this.buddies = 0; this.shield = 0; this.charge = 0; this.charging = false; this.inv = 0; this.bub++; this.flags(); }
  revive() { this.down = false; this.downT = 0; this.hp = SH.reviveHp; this.inv = SH.invRevive; this.flags(); }
  heal(n) { if (this.down) this.revive(); else this.hp = Math.min(SH.hpMax, this.hp + n); }
  maxed(k) { return k === 1 ? this.shield >= 3 : k === 2 ? this.buddies >= 2 : k === 3 ? this.spread >= 2 : k === 4 ? this.spd >= 2 : false; }
  /* apply a fruit: returns {pts, label, full}. full = a Heart Peach at 5 hearts (the world decides gift or +200) */
  grab(k) {
    const lab = (BB.FRUITS[k] && BB.FRUITS[k].label) || '';
    if (k === 0) return { pts: FR.sunPts, label: '+' + FR.sunPts };
    if (k >= 1 && k <= 4) {
      if (this.maxed(k)) return { pts: FR.maxPts, label: '+' + FR.maxPts };
      if (k === 1) this.shield = 3;
      else if (k === 2) { this.bx[this.buddies] = this.x; this.by[this.buddies] = this.y; this.buddies++; }
      else if (k === 3) this.spread++;
      else this.spd++;
      return { pts: 0, label: lab };
    }
    if (k === 5) { if (this.hp >= SH.hpMax) return { pts: 0, label: '', full: true }; this.hp++; return { pts: 0, label: lab }; }
    this.hp = SH.hpMax; this.shield = 3; return { pts: 0, label: lab };          /* 6 Rainbow Peach */
  }
  pack() { this.flags(); if (BB.Net && BB.Net.pack) return BB.Net.pack(this); return [X4(this.x), X4(this.y), this.f | 0, this.hp | 0, this.shield | 0, this.buddies | 0, this.spd | 0, this.spread | 0, this.charge | 0, this.bub | 0, this.sn | 0, this.sl | 0]; }
  unpack(a) {
    this.x = a[0] / 4; this.y = a[1] / 4; const f = this.f = a[2] | 0;
    this.hp = a[3] | 0; this.shield = a[4] | 0; this.buddies = clamp(a[5] | 0, 0, 2); this.spd = clamp(a[6] | 0, 0, 2); this.spread = clamp(a[7] | 0, 0, 2);
    this.charge = a[8] | 0; this.bub = a[9] | 0; this.sn = a[10] | 0; this.sl = a[11] | 0;
    this.firing = !!(f & 1); this.charging = !!(f & 2); this.inv = f & 4 ? 1 : 0; this.down = !!(f & 8); this.hidden = !!(f & 16);
    return this;
  }
}
BB.Ship = Ship;

class World {
  constructor(o) {
    o = o || {};
    this.seed = o.seed != null ? o.seed : (Math.random() * 2 ** 31) | 0;
    this.rng = BB.mulberry32(this.seed);
    this.coop = !!o.coop;
    this.stage = o.stage || 0;
    this.mem = {};            // per run scratch for content
    this.ships = [];          // filled by the engine: Ship objects (or {x,y,who,down,hidden} in the content harness)
    this.events = [];         // net events produced this tick: {code, args} (positions already x4)
    this.fxList = [];         // host-local cosmetic effects to draw: {k,x,y,arg,n,s,x2,y2,born(gt)}
    this.sfxList = [];        // sound names requested this tick (sfxArg holds each one's arg)
    this.shakeAmt = 0;
    this.nextId = 1; this.nextBid = 1; this.nextFid = 1;
    /* engine */
    this.auto = !!o.auto;     // phases run themselves (engine); the content harness drives ph by hand
    this.god = !!o.god; this.gt = o.gt | 0; this.score = o.score | 0; this.basket = o.basket | 0;
    this.sfxArg = []; this.grantsOut = []; this.runToys = 0; this.runFruit = 0; this.ending = null;
    this._pl = []; this._po = []; this._pv = false; this._in = false;
    this.startStage(this.stage, o.t || 0);
    if (this.gt < this.tick) this.gt = this.tick;   /* sk = gt - tick stays >= 0 after a ?t= jump */
  }
  /* ---------- stage + timeline ---------- */
  startStage(st, atSec) {
    this.stage = st; this.sm = {}; this.tick = Math.round((atSec || 0) * 60); this.stageTick0 = 0;
    this.enemies = []; this.bullets = []; this.fruits = []; this.timers = [];
    this.ph = 0; this.phT = 0; this.kind = 0; this.bulletMul = 1;
    const S = BB.STAGES[st];
    this.waves = S ? S.waves.slice().sort((a, b) => a[0] - b[0]) : [];
    this.waveIdx = 0;
    while (this.waveIdx < this.waves.length && this.waves[this.waveIdx][0] * 60 < this.tick) this.waveIdx++; /* ?t= jumps the script, pre-spawning nothing */
    this.boss = null;
    this.stats = { fruit: 0, toys: 0, gift: false }; this.showerQ = []; this.doneT = -1; this.bossT0 = 0; this.dyingT = 0;
    this.bossBonus = 0; this.bossTired = false; this.bossName = ''; this.tally = null; this.sweep = 0;
    for (const s of this.ships) if (s && s.shots) s.shots.length = 0;
    this.event('S', st);
  }
  later(ticks, fn) { if (ticks <= 0) fn(); else this.timers.push({ at: this.tick + ticks, fn }); }
  T(e) { return this.tick - e.born; }
  /* ---------- the w API ---------- */
  players() {   /* inside step(): one reused list, rebuilt when ships move; outside: a fresh list */
    if (this._pv) return this._pl;
    const inS = this._in, out = inS ? this._pl : [], po = this._po; out.length = 0;
    for (const s of this.ships) if (s && !s.down && !s.hidden && !s.away) {
      const p = inS ? po[out.length] || (po[out.length] = {}) : {};
      p.x = s.x; p.y = s.y; p.who = s.who; p.remote = !!s.remote; out.push(p);
    }
    if (inS) this._pv = true;
    return out;
  }
  target(e) {
    let best = null, bd = 1e9;
    for (const p of this.players()) { const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2; if (d < bd - 0.5 || (Math.abs(d - bd) <= 0.5 && ((e.id & 1) ? p.who === 0 : p.who === 1))) { bd = d; best = p; } }
    return best;
  }
  ang(x, y, p) { return p ? Math.atan2(p.y - y, p.x - x) : Math.PI / 2; }
  bullet(x, y, speed, ang, big) {
    if (this.bullets.length >= C.MAX_EBUL) return false;
    if (this.auto && (this.ph === 1 || this.ph >= 3 || this.doneT >= 0)) return false;   /* warning, boss beaten, tally: the sky stays clear */
    for (const p of this.players()) { const r = p.remote ? C.SAFE_R_GUEST : C.SAFE_R; if ((p.x - x) ** 2 + (p.y - y) ** 2 < r * r) return false; }
    const v = speed * this.bulletMul;
    this.bullets.push({ id: this.nextBid, x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, big: !!big, r: big ? 4 : 2.5, born: this.tick });
    this.nextBid = this.nextBid % 999 + 1;
    return true;
  }
  fan(x, y, n, spread, speed, ang, big) {
    const drop = this.kind >= C.KIND.dropOuterAt && n >= 3 ? 1 : 0;   /* a 3-fan keeps only its centre bullet */
    for (let i = drop; i < n - drop; i++) this.bullet(x, y, speed, ang + (n > 1 ? -spread / 2 + spread * i / (n - 1) : 0), big);
  }
  ring(x, y, n, speed, off, big) {
    const drop = this.kind >= C.KIND.dropOuterAt && n >= 6 ? 2 : 0; /* rings have no "outer" pair: thin them by 2 */
    for (let i = 0; i < n; i++) { if (drop && (i === 0 || i === (n >> 1))) continue; this.bullet(x, y, speed, (off || 0) + TAU * i / n, big); }
  }
  spawn(type, x, y, init) {
    const def = BB.ENEMY[type]; if (!def) return null;
    if (!def.boss && type !== 'zap' && this.count() >= C.MAX_ENEMY) return null;
    const e = { id: this.nextId, type, tc: BB.TC[type], x, y, vx: 0, vy: 0, hp: def.hp, maxHp: def.hp, r: def.r, a: 0, t: 0,
      dead: false, dying: false, flash: 0, born: this.tick, d: {}, pat: init && init.pat, idx: init && init.idx };
    this.nextId = this.nextId % 999 + 1;
    if (init) for (const k in init) if (k !== 'pat' && k !== 'idx') e[k] = init[k];
    if (def.boss && this.coop && !this.partnerAway()) { e.hp = Math.round(e.hp * C.BOSS.coopHp); e.maxHp = e.hp; e.coopHp = true; }
    if (def.init) def.init(e, this);
    this.enemies.push(e);
    if (def.boss) this.boss = e;
    return e;
  }
  count(type) { let n = 0; for (const e of this.enemies) if (!e.dead && (type ? e.type === type : (!BB.ENEMY[e.type].boss && e.type !== 'zap' && e.type !== 'bush'))) n++; return n; }
  bush(x, y) { if (this.count('bush') >= C.MAX_BUSH) return null; return this.spawn('bush', x, y == null ? -20 : y); }
  fruit(x, y, k, vx, vy) {
    if (this.fruits.length >= C.MAX_FRUIT) { /* the oldest Sunberry makes room */ const i = this.fruits.findIndex(f => f.k === 0); if (i < 0) return null; this.fruits.splice(i, 1); }
    const f = { id: this.nextFid, k: k || 0, x, y, vx: vx || 0, vy: vy == null ? -1.2 : vy, h: 0, lastBy: -1, born: this.tick, hitGap: [-99, -99], n: 0, sq: 0, lock: 0, taken: false };
    this.nextFid = this.nextFid % 99 + 1;
    this.fruits.push(f); return f;
  }
  zap(x, warn, live) { return this.spawn('zap', x, 160, { d: { warn: warn == null ? 60 : warn, live: live == null ? 24 : live } }); }
  fx(kind, x, y, arg) { this.fxl(kind, x, y, arg); this.event('F', kind, X4(x), X4(y), arg == null ? 0 : arg); }
  sfx(name, arg) { this.sfxList.push(name); this.sfxArg.push(arg); }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }
  event(code, ...args) { this.events.push({ code, args }); }
  /* boss defeat flow (content calls this when its defeat or tired animation ends) */
  bossDone(e, tired) {
    if (!e || e.doneCalled) return;
    e.doneCalled = true; e.dead = true; e.dying = true;
    if (this.boss === e) this.boss = null;
    const x = e.x, y = e.y, def = BB.ENEMY[e.type] || {};
    this.fxl('pop', x, y); this.later(11, () => this.fxl('pop', x + 12, y - 10)); this.later(22, () => this.fxl('popBig', x, y));
    this.shake(1); this.sfx('bossDown');
    const pts = tired ? C.BOSS.tiredBonus : C.BOSS.bonus;
    this.addScore(pts, x, y + e.r * 0.5, true);
    this.bossBonus = pts; this.bossTired = !!tired; this.bossName = def.name || e.type;
    if (!tired) { this.stats.toys++; this.runToys++; if (this.stage >= 1) this.fxl('rainbow', 120, 70); }
    this.event('B', X4(x), X4(y));
    for (const b of this.bullets) if (!b.dead) { b.dead = true; this.fxl('cancel', b.x, b.y); }
    this.showerQ = [5, 5, 0, 0, 0, 0, 0, 0]; this.showerX = clamp(x, 40, 200); this.showerY = clamp(y, 40, 160); this.showerAt = this.gt + 24;   /* after the big pop */
    this.doneT = 150;
    if (this.onBossDone) this.onBossDone(e, tired);
  }
  /* ---------- damage (shots and bonks call this) ---------- */
  damage(e, dmg, by) {
    const def = BB.ENEMY[e.type];
    if (!def || e.dead || e.dying || !def.shootable || e.hp < 0 || e.inv || (e.d && e.d.inv)) return false;
    e.hp -= dmg; e.flash = 2;
    if (e.hp > 0) return false;
    if (def.boss) { e.hp = 0; e.dying = true; e.d.tired = false; this.sfx('popBig'); this.shake(0.8); return true; }
    e.dead = true;
    if (def.onDeath) def.onDeath(e, this);
    this.killed(e, by);
    if (this.onKill) this.onKill(e, by);
    return true;
  }
  killed(e, by) {
    const def = BB.ENEMY[e.type], x = e.x, y = e.y, pts = def.score | 0;
    if (e.type === 'bush') { this.addScore(pts); this.pushFx({ k: 'pop', x, y, born: this.gt }); this.event('P', X4(x), X4(y)); this.sfx('pop'); return; }
    this.addScore(pts, x, y - 8, true);
    if (e.type !== 'present') { this.stats.toys++; this.runToys++; } else this.stats.gift = true;
    this.pushFx(World.killFx(e.type, x, y, this.gt));
    this.event('K', e.tc, X4(x), X4(y), pts);
    this.sfx(e.r >= 11 ? 'popBig' : 'pop');
  }
  /* ---------- one tick ---------- */
  step() {
    this.tick++; this.gt++; this.phT++; this._in = true; this._pv = false;
    this.events.length = 0; this.sfxList.length = 0; this.sfxArg.length = 0; this.grantsOut.length = 0;
    // scheduled callbacks
    if (this.timers.length) { const due = this.timers.filter(t => t.at <= this.tick); if (due.length) { this.timers = this.timers.filter(t => t.at > this.tick); for (const t of due) t.fn(); } }
    // the timeline (only in ph 0, before the boss)
    if (this.ph === 0) while (this.waveIdx < this.waves.length && this.waves[this.waveIdx][0] * 60 <= this.tick) BB.spawnWave(this, this.waves[this.waveIdx++]);
    if (this.auto) this.phases();
    // ships and their shots
    this.stepShips(); this._pv = false;
    // enemies
    for (const e of this.enemies) {
      if (e.dead) continue;
      const def = BB.ENEMY[e.type]; e.t++; e.ox = e.x; e.oy = e.y;
      if (e.flash > 0) e.flash--;
      if (def.ground) e.y += C.SCROLL;
      const keep = def.tick ? def.tick(e, this) : true;
      if (keep === false) { e.dead = true; continue; }
      if (!def.boss && e.type !== 'zap' && e.t > 30 && (e.y > C.OFF.yMax || e.y < C.OFF.yMin || e.x < C.OFF.xMin || e.x > C.OFF.xMax)) e.dead = true;
    }
    keep(this.enemies, liveE);
    // enemy bullets
    for (const b of this.bullets) { b.x += b.vx; b.y += b.vy; }
    keep(this.bullets, liveB);
    // fruit physics
    const F = C.FRUIT;
    for (const f of this.fruits) {
      if (f.sq > 0) f.sq = Math.max(0, f.sq - 0.1);
      if (f.home && this.home(f)) continue;
      if (f.k >= 5) { f.vy = Math.min(F.vMax, f.vy + F.g); f.x += 0.07 * Math.sin((this.tick - f.born) / 20); } /* hearts and rainbows just drift down */
      else { f.vy = Math.min(F.vMax, f.vy + F.g); f.vx *= F.drag; }
      f.x += f.vx; f.y += f.vy;
      if (f.x < F.wallL) { f.x = F.wallL; f.vx = Math.abs(f.vx); } else if (f.x > F.wallR) { f.x = F.wallR; f.vx = -Math.abs(f.vx); }
      if (f.y < F.ceil && f.vy < 0) { f.vy = Math.abs(f.vy) * 0.5; f.lock = 40; }   /* off the ceiling: shots pass through for a moment (one bump per arc) */
      if (f.lock > 0) f.lock--;
    }
    keep(this.fruits, liveF);
    // collisions, pickups, the boss fruit shower
    this.collide();
    if (this.showerQ.length && this.gt >= this.showerAt && (this.gt % 5 === 0 || this.sweep) && this.fruits.length < C.MAX_FRUIT) this.fruit(this.showerX, this.showerY, this.showerQ.shift(), (this.rng() * 2 - 1) * 0.8, -1.5);
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - 0.05);
    if (this.onStep) this.onStep();
    this._in = this._pv = false;
  }
  /* ---------- phases (engine runs: o.auto) ---------- */
  phases() {
    const S = BB.STAGES[this.stage] || {};
    if (this.ph === 0) {
      if (this.tick >= (S.bossAt != null ? S.bossAt : C.STAGE.bossAt) * 60) this.setPh(1);
    } else if (this.ph === 1) {
      for (let n = 0; n < 3 && this.bullets.length; n++) { const b = this.bullets.shift(); this.fxl('cancel', b.x, b.y); }   /* clear the field gently */
      if (this.phT % 8 === 0) this.calmOne();
      if (this.phT >= C.STAGE.warnTicks) this.bossArrive(S);
    } else if (this.ph === 2) {
      const b = this.boss;
      if (b) {
        if (b.dead) { if (!b.doneCalled) this.bossDone(b, !!b.d.tired); }                     /* removed without bossDone */
        else if (!b.dying && this.tick - this.bossT0 >= C.BOSS.tiredTicks) { b.dying = true; b.d.tired = true; }
        else if (b.dying && ++this.dyingT > 900) this.bossDone(b, !!b.d.tired);              /* safety: content never finished */
      }
      if (this.doneT >= 0 && this.phT % 8 === 0) this.calmOne();                               /* leftover toys calm down too */
      if (this.doneT > 0 && --this.doneT === 0) this.sweep = 1;
      if (this.sweep) {   /* the boss fruit shower flies to the ships before the tally card covers it */
        for (const f of this.fruits) if (!f.home) f.home = 1;
        if ((!this.fruits.length && !this.showerQ.length) || ++this.sweep > 150) { this.sweep = 0; this.setPh(3); }
      }
    } else if (this.ph === 3) {
      if (this.phT % 8 === 0) this.calmOne();
      if (this.phT >= C.TALLY.ticks) this.nextStage();
    }
  }
  setPh(ph) {
    this.ph = ph; this.phT = 0;
    if (ph === 1) { this.event('W'); this.sfx('warning'); }
    else if (ph === 3) this.makeTally();
    else if (ph === 4) this.ending = { score: this.score, toys: this.runToys, fruit: this.runFruit };
  }
  calmOne() {   /* one normal toy floats away calmly (warning, boss beaten, tally) */
    const e = this.enemies.find(q => !q.dead && !q.dying && q.type !== 'bush' && q.type !== 'present' && q.type !== 'zap' && !BB.ENEMY[q.type].boss);
    if (e) { e.dead = true; this.fx('calm', e.x, e.y); }
  }
  /* a fruit swept to the nearest ship (end of a boss); false when no ship can take it */
  home(f) {
    const s = this.nearShip(f.x, f.y); if (!s) return false;
    const dx = s.x - f.x, dy = s.y - f.y, d = Math.hypot(dx, dy) || 1, v = Math.min(d, 2 + f.home++ * 0.25);
    f.x += dx / d * v; f.y += dy / d * v; f.lock = 2;   /* lock: shots pass through */
    return true;
  }
  nearShip(x, y) {
    let best = null, bd = 1e9;
    for (const s of this.ships) { if (!(s instanceof Ship) || s.down || s.away || s.hidden) continue; const d = (s.x - x) ** 2 + (s.y - y) ** 2; if (d < bd) { bd = d; best = s; } }
    this._nd = bd; return best;
  }
  bossArrive(S) {
    this.setPh(2); this.bossT0 = this.tick; this.dyingT = 0; this.doneT = -1;
    const def = S.boss && BB.ENEMY[S.boss];
    this.bossName = def ? (def.name || S.boss) : '';
    const e = def ? this.spawn(S.boss, 120, -60) : null;
    if (!e) this.doneT = 90;                                                                       /* no boss in this content: straight on */
    if (BB.ENEMY.bush) { this.spawn('bush', 60, -20); this.spawn('bush', 180, -20); }              /* the boss gift */
  }
  makeTally() {
    let hearts = 0;
    for (const s of this.ships) if (s instanceof Ship && !s.away) hearts += Math.max(0, s.hp | 0);
    const heartPts = hearts * C.TALLY.heart, noBub = this.kind === 0 ? C.TALLY.noBubble : 0, gift = !!(this.stats.gift || this.sm.gift);
    this.addScore(heartPts + noBub);
    this.tally = { boss: this.bossBonus, tired: this.bossTired, name: this.bossName, hearts, heartPts, noBub, fruit: this.stats.fruit, toys: this.stats.toys, gift,
      stars: [true, this.stats.fruit >= 10, gift] };
    this.sfx('clear');
  }
  nextStage() {
    if (this.stage >= Math.min(2, BB.STAGES.length - 1)) { this.setPh(4); return; }
    this.startStage(this.stage + 1, 0);
    for (const s of this.ships) if (s instanceof Ship && !s.remote) { s.heal(SH.hpStageHeal); this.fxl('heart', s.x, s.y - 10); }   /* the guest heals itself when st goes up */
    this.sfx('start');
  }
  /* ---------- ships ---------- */
  partnerOf(s) { for (const p of this.ships) if (p !== s && p instanceof Ship) return p; return null; }
  addShip(s) { if (this.ships.indexOf(s) < 0) this.ships.push(s); }
  /* co-op ends (partner left / local P2 gone): boss hp back to solo size */
  partnerLeft(gone) {   /* gone: that ship (a local P2 or P1 flying home); none: the remote guest */
    this.ships = this.ships.filter(s => !(s instanceof Ship) || (gone ? s !== gone : !s.remote));
    this.coop = false; this.soloBoss();
  }
  soloBoss() {
    const b = this.boss;
    if (b && !b.dead && b.coopHp) { b.coopHp = false; b.maxHp = Math.max(1, Math.round(b.maxHp / C.BOSS.coopHp)); if (!b.dying && b.hp > 0 && !(b.d && b.d.inv)) b.hp = Math.max(1, Math.round(b.hp / C.BOSS.coopHp)); else if (b.d && b.d.inv) b.hp = b.maxHp; }
  }
  partnerAway() { for (const s of this.ships) if (s instanceof Ship && s.remote && s.awayT >= AWAY_SOLO) return true; return false; }
  stepShips() {
    const ss = this.ships;
    let shot = false;
    for (let i = 0; i < ss.length; i++) {
      const s = ss[i]; if (!(s instanceof Ship)) continue;
      if (s.remote) {
        s.awayT = s.away || s.hidden ? (s.awayT | 0) + 1 : 0;
        if (s.awayT === AWAY_SOLO) this.soloBoss();                                               /* gone quiet: this boss for one */
        s.mirror();
        if (s.lastBub < 0 || s.bub < s.lastBub) s.lastBub = s.bub;                               /* guest bubbles → kind assist */
        else if (s.bub > s.lastBub) { this.bubbled(null, s.bub - s.lastBub); s.lastBub = s.bub; }
      } else {
        const wasDown = s.down;
        s.step(s.input, this.partnerOf(s));
        if (wasDown && !s.down) { this.fxl('revive', s.x, s.y); this.sfx('revive'); }
        if (s.vol) shot = true;
        if (s.rel) { this.sfx(s.rel === 2 ? 'sun' : 'seedlet'); this.fxl('seedburst', s.x, s.y - 12, s.rel); }
      }
      s.moveShots();
    }
    if (shot) this.sfx('shot');
  }
  /* ---------- collisions (host authoritative) ---------- */
  collide() {
    const ss = this.ships;
    let cancelled = 0;
    for (let si = 0; si < ss.length; si++) {
      const s = ss[si]; if (!(s instanceof Ship)) continue;
      const shots = s.shots;
      for (let i = 0; i < shots.length; i++) {
        const sh = shots[i]; if (sh.dead) continue;
        if (sh.cancelR) cancelled += this.cancelNear(sh);
        this.shotHit(sh, s.who);
      }
    }
    if (cancelled) { this.event('Q', cancelled); this.sfx('cancel'); }
    for (let si = 0; si < ss.length; si++) { const s = ss[si]; if (s instanceof Ship) { if (s.remote) this.remoteChecks(s); else this.shipChecks(s); } }
    this.pickups();
    keep(this.bullets, notDead);
  }
  cancelNear(sh) {
    let n = 0; const r2 = sh.cancelR * sh.cancelR;
    for (const b of this.bullets) if (!b.dead && (b.x - sh.x) ** 2 + (b.y - sh.y) ** 2 < r2) { b.dead = true; n++; this.fxl('cancel', b.x, b.y); this.addScore(10); }
    return n;
  }
  hits(e, def, x, y, r) { return def.hit ? def.hit(e, x, y) : (e.x - x) ** 2 + (e.y - y) ** 2 < (e.r + r) * (e.r + r); }
  shotHit(sh, who) {
    const sun = sh.kind === 'sun';
    for (const e of this.enemies) {
      if (e.dead) continue;
      const def = BB.ENEMY[e.type];
      if (!def || !def.shootable || e.y < SHOT_TOP || !this.hits(e, def, sh.x, sh.y, sh.r)) continue;   /* not yet on screen */
      const shield = e.dying || e.hp < 0 || e.inv || (e.d && e.d.inv);
      if (sun) {                                                                    /* pierces: once per enemy, bosses every 20 ticks */
        if (shield) continue;
        if (def.boss) { if (this.gt - sh.bossAt < SH.sun.bossEvery) continue; sh.bossAt = this.gt; }
        else { if (sh.hitIds.indexOf(e.id) >= 0) continue; sh.hitIds.push(e.id); }
        this.damage(e, sh.dmg, who); this.fxl('spark', e.x, e.y); this.sfx('hit');
        continue;
      }
      sh.dead = true;
      if (shield) { this.fxl('spark', sh.x, sh.y - 2, 1); return; }
      this.damage(e, sh.dmg, who); this.fxl('spark', sh.x, sh.y - 2); this.sfx('hit');
      return;
    }
    if (sh.kind !== 'p' && sh.kind !== 'b') return;                                  /* seeds pass through fruit */
    const rr = (FR.r + sh.r) * (FR.r + sh.r);
    for (const f of this.fruits) {
      if (f.taken || f.k > 4 || f.vy <= 0 || f.lock > 0) continue;                    /* only a FALLING juggle fruit is bumped */
      if ((f.x - sh.x) ** 2 + (f.y - sh.y) ** 2 < rr) { if (this.bump(f, sh, who)) sh.dead = true; return; }
    }
  }
  bump(f, sh, who) {
    const g = who ? 1 : 0;
    if (this.gt - f.hitGap[g] < 8) return false;
    f.hitGap[g] = this.gt;
    f.vy = FR.bumpV; f.vx = clamp(f.vx + (f.x - sh.x) * FR.bumpVX, -FR.bumpVXMax, FR.bumpVXMax);
    f.h++; f.n++; f.sq = 1;
    const team = f.lastBy >= 0 && f.lastBy !== who; f.lastBy = who;
    this.sfx('bump', Math.min(12, f.n));
    if (f.h >= FR.hitsPer || (team && f.h >= FR.hitsTeam)) {
      f.h = 0; f.k = (f.k + 1) % 5;
      this.event('C', f.id, f.k); this.fxl('ripen', f.x, f.y); this.sfx('ripen');
      if (team) this.sticker(0, f.x, f.y - 16);
    }
    return true;
  }
  sticker(id, x, y) { this.pushFx(World.stickerFx(id, x, y, this.gt)); this.event('T', id, X4(x), X4(y)); }
  shipChecks(s) {
    if (s.down) return;
    const safe = this.god || s.hidden;
    if (s.inv === 0 && !safe) {
      for (const b of this.bullets) {
        if (b.dead) continue;
        const rr = b.r + SH.hurtR;
        if ((b.x - s.x) ** 2 + (b.y - s.y) ** 2 < rr * rr) { b.dead = true; this.hurtShip(s); break; }
      }
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      const def = BB.ENEMY[e.type];
      if (e.type === 'zap') { if (s.inv === 0 && !safe && !s.down && e.a === 2 && (def.hit ? def.hit(e, s.x, s.y) : Math.abs(s.x - e.x) < 10)) this.hurtShip(s); continue; }
      if (def.boss) { if (!e.dying) this.pushOut(s, e); continue; }
      if (!def.contact || def.ground || e.dying || s.bonkT > 0) continue;
      const dx = s.x - e.x, dy = s.y - e.y, rr = e.r + 7;
      if (dx * dx + dy * dy < rr * rr) this.bonk(s, e, dx, dy);
    }
  }
  /* the online guest as the host sees it: bonks deal damage here (the guest knocks itself back); touching its bubble revives it */
  remoteChecks(s) {
    if (s.away || s.hidden) return;
    if (s.down) {
      if (this.gt - s.revAt > 30) for (const p of this.ships) if (p !== s && p instanceof Ship && !p.remote && !p.down && (p.x - s.x) ** 2 + (p.y - s.y) ** 2 < SH.reviveR * SH.reviveR) {
        s.revAt = this.gt; this.grantsOut.push(['r', 0]); this.fxl('revive', s.x, s.y); this.sfx('revive'); break;
      }
      return;
    }
    if (s.bonkT > 0) return;
    for (const e of this.enemies) {
      if (e.dead || e.dying) continue;
      const def = BB.ENEMY[e.type];
      if (!def.contact || def.ground || def.boss) continue;
      const dx = s.x - e.x, dy = s.y - e.y, rr = e.r + 7;
      if (dx * dx + dy * dy < rr * rr) { s.bonkT = SH.invBonk; this.damage(e, SH.bonkDmg, s.who); this.fxl('boinged', (s.x + e.x) / 2, (s.y + e.y) / 2); this.sfx('boing'); break; }
    }
  }
  hurtShip(s) {
    const r = s.hurt(); if (!r) return;
    if (r === 1) { this.fxl('shield', s.x, s.y); this.sfx('shield'); }
    else if (r === 2) { this.fxl('hurt', s.x, s.y); this.sfx('hurt'); this.shake(0.5); }
    else { this.fxl('bubble', s.x, s.y); this.bubbled(s, 1); }
  }
  bubbled(s, n) {
    this.kind += n; this.bulletMul = Math.max(C.KIND.min, Math.pow(C.KIND.mul, this.kind));
    if (s) { this.sfx('bubble'); this.shake(0.6); }
  }
  bonk(s, e, dx, dy) {
    World.knock(s, dx, dy);
    this.fxl('boinged', (s.x + e.x) / 2, (s.y + e.y) / 2); this.sfx('boing');
    this.damage(e, SH.bonkDmg, s.who);
  }
  pushOut(s, e) { if (World.push(s, e.x, e.y, e.r) && s.bonkT === 0) { s.bonkT = SH.invBonk; this.sfx('boing'); this.fxl('boinged', s.x, s.y - 6); } }
  /* ---------- fruit magnet and pickups ---------- */
  pickups() {
    let took = false;
    const pr = SH.pickR * SH.pickR, mr = SH.magnetR * SH.magnetR;
    for (const f of this.fruits) {
      if (f.taken) continue;
      const best = this.nearShip(f.x, f.y), bd = this._nd;
      if (!best) continue;
      if (bd < pr) { this.take(f, best); took = true; }
      else if (bd < mr) { const d = Math.sqrt(bd), k = Math.min(SH.magnetV, d) / d; f.x += (best.x - f.x) * k; f.y += (best.y - f.y) * k; }
    }
    if (took) keep(this.fruits, notTaken);
  }
  take(f, s) {
    f.taken = true;
    const k = f.k, x = f.x, y = f.y, partner = this.partnerOf(s);
    this.basket++; this.stats.fruit++; this.runFruit++;
    this.event('G', X4(x), X4(y), k, s.who);
    let pts = 0, label = (BB.FRUITS[k] && BB.FRUITS[k].label) || '', snd = k === 0 ? 'grab' : k === 1 ? 'shield' : k >= 5 ? 'heart' : 'power', full = false;
    if (s.remote) {                                                                    /* decided here from the guest's pack, applied there by grant */
      if (k === 0) pts = FR.sunPts;
      else if (k === 5) { if (s.hp < SH.hpMax) this.grantsOut.push(['f', 5]); else full = true; }
      else if (k === 6) this.grantsOut.push(['w', 0]);
      else if (s.maxed(k)) pts = FR.maxPts;
      else this.grantsOut.push(['f', k]);
    } else {
      const r = s.grab(k); pts = r.pts; label = r.label; full = !!r.full;
    }
    if (full) {
      if (partner && !partner.down && !partner.away && partner.hp < SH.hpMax) { this.gift(s, partner); label = ''; snd = 'gift'; }
      else pts = FR.heartPts;
    }
    this.fxl('grab', x, y);
    if (pts) this.addScore(pts, x, y - 8, true);
    else if (label) this.fxl('sticker', x, y - 10, label);
    this.sfx(snd);
    if (this.basket % FR.basketEvery === 0) { this.addScore(FR.basketPts); this.sticker(1, clamp(x, 40, 200), clamp(y - 30, 40, 280)); this.sfx('basket'); }
  }
  gift(from, to) {
    if (to.remote) this.grantsOut.push(['h', 0]); else to.hp = Math.min(SH.hpMax, to.hp + 1);
    this.pushFx({ k: 'heart', x: from.x, y: from.y, x2: to.x, y2: to.y, born: this.gt });
  }
  addScore(pts, x, y, sticker) {
    if (!pts) return;
    this.score = Math.min(9999990, this.score + pts);
    if (sticker && pts >= 100 && x != null) this.fxl('sticker', x, y, '+' + pts);
  }
  /* local-only effect (no net event); content's w.fx adds an 'F' event on top */
  fxl(kind, x, y, arg) { this.pushFx({ k: kind, x, y, arg, n: typeof arg === 'number' ? arg : undefined, s: typeof arg === 'string' ? arg : undefined, born: this.gt }); }
  pushFx(f) { if (this.fxList.length >= 128) this.fxList.shift(); this.fxList.push(f); }
  /* ---------- snapshot (SPEC section 6): world part of the host snapshot ---------- */
  pack() {
    const e = [], b = [], i = [];
    for (const en of this.enemies) {
      if (en.dead) continue;
      const def = BB.ENEMY[en.type];
      const hp = en.dying ? 0 : (!def || !def.shootable || en.inv || (en.d && en.d.inv)) ? -1 : Math.max(0, Math.ceil(en.hp));
      e.push(en.id, en.tc | 0, X4(en.x), X4(en.y), hp, en.a | 0);
    }
    for (const bu of this.bullets) if (!bu.dead) b.push(bu.id * 2 + (bu.big ? 1 : 0), X4(bu.x), X4(bu.y));
    for (const f of this.fruits) if (!f.taken) i.push(f.id, f.k, X4(f.x), X4(f.y), f.h | 0, f.vy > 0 && !(f.lock > 0) ? 1 : 0);   /* 1: falling and bumpable */
    const bs = this.boss && !this.boss.dead ? this.boss : null;
    return { t: this.gt, sk: this.gt - this.tick, st: this.stage, ph: this.ph, sc: this.score, bk: this.basket, bm: bs ? Math.round(bs.maxHp) : 0, e, b, i };
  }
}
/* contact rules shared by host and guest: a bonk knocks the ship 12 px away (30 ticks safe); a boss pushes it out to r + 8 */
World.knock = (s, dx, dy) => {
  let m = Math.hypot(dx, dy); if (m < 0.01) { dx = 0; dy = 1; m = 1; }
  s.x = clamp(s.x + dx / m * SH.bonkPush, SH.xMin, SH.xMax); s.y = clamp(s.y + dy / m * SH.bonkPush, SH.yMin, SH.yMax);
  s.inv = Math.max(s.inv, SH.invBonk); s.bonkT = SH.invBonk;
};
World.push = (s, ex, ey, er) => {
  const R = er + SH.bossPush, dx = s.x - ex, dy = s.y - ey, d = Math.hypot(dx, dy);
  if (d >= R) return false;
  const ux = d > 0.01 ? dx / d : 0, uy = d > 0.01 ? dy / d : 1;
  s.x = clamp(ex + ux * R, SH.xMin, SH.xMax); s.y = clamp(ey + uy * R, SH.yMin, SH.yMax);
  if ((s.x - ex) ** 2 + (s.y - ey) ** 2 < R * R) s.x = clamp(ex + (ux >= 0 ? 1 : -1) * R, SH.xMin, SH.xMax);   /* pinned at an edge: slide sideways */
  return true;
};
/* effect objects shared by host and guest: a toy cheered up (art reads its type from f.s), a 'T' sticker */
World.killFx = (type, x, y, born) => { const k = BB.KILLFX[type] || 'pop', D = BB.ENEMY[type]; return k === 'pop' ? { k, x, y, n: D && D.r >= 11 ? 2 : 1, born } : { k, x, y, s: type, born }; };
World.stickerFx = (id, x, y, born) => id === 1 ? { k: 'basket', x, y, born } : { k: 'sticker', x, y, s: BB.STICKERS[id] || '', n: 10, born };
/* decode a host snapshot's flat arrays into plain entities (guest view) */
World.unpack = function (o) {
  const E = [], B = [], I = [], e = o.e || [], b = o.b || [], i = o.i || [];
  for (let j = 0; j + 5 < e.length; j += 6) E.push({ id: e[j], tc: e[j + 1], type: BB.TYPE_LIST[e[j + 1]] || 'smudge', x: e[j + 2] / 4, y: e[j + 3] / 4, hp: e[j + 4], a: e[j + 5] });
  for (let j = 0; j + 2 < b.length; j += 3) B.push({ id: b[j] >> 1, big: b[j] & 1, x: b[j + 1] / 4, y: b[j + 2] / 4 });
  for (let j = 0; j + 5 < i.length; j += 6) I.push({ id: i[j], k: i[j + 1], x: i[j + 2] / 4, y: i[j + 3] / 4, h: i[j + 4], fall: i[j + 5] });
  return { t: o.t, sk: o.sk, st: o.st, ph: o.ph, sc: o.sc, bk: o.bk, bm: o.bm, p: o.p | 0, run: o.run | 0, h: o.h, E, B, I };
};
BB.World = World;
})();
