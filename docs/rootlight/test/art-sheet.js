/* ROOTLIGHT art contact sheet: art.html?sec=heroes|glooms|guardians|hazards|things|props|icons|portraits|busy|zoom&R=1..4&low=1
   Draws every RL.Art thing with mock objects on a mid-dark cave background; 'busy' times a busy room. */
'use strict';
(function () {
const q = new URLSearchParams(location.search), R = +q.get('R') || 2, SEC = q.get('sec') || 'heroes', LOW = q.get('low') === '1';
const CW = +q.get('w') || 1600, CH = +q.get('h') || 1000, T0 = +q.get('t') || 0;
const cv = document.getElementById('c'); cv.width = CW; cv.height = CH; cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
const ctx = cv.getContext('2d');
const A = RL.Art; A.init(R, LOW);
const LW = CW / R, LH = CH / R, errs = [];
const TAU = Math.PI * 2;
function bg(c) {
  c = c || ctx; const g = c.createLinearGradient(0, 0, 0, LH); g.addColorStop(0, '#3e3757'); g.addColorStop(1, '#2a2540'); c.fillStyle = g; c.fillRect(0, 0, LW, LH);
  for (let i = 0; i < 70; i++) { const x = (i * 137.5) % LW, y = (i * 91.3 + i * i * .7) % LH; c.fillStyle = 'rgba(255,255,255,.025)'; c.beginPath(); c.arc(x, y, 8 + (i % 7) * 5, 0, TAU); c.fill(); }
}
function label(s, x, y, col) { ctx.font = '600 ' + (10 / R + 1.2) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = col || 'rgba(230,225,245,.75)'; ctx.fillText(s, x, y); }
function head(s, y) { ctx.font = '700 ' + (13 / R + 2) + 'px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = '#ffe9a8'; ctx.fillText(s, 6, y); }
function ground(x, y, w, h) { ctx.fillStyle = '#5a4a3f'; ctx.fillRect(x, y, w, h || 6); ctx.fillStyle = '#7fae5a'; ctx.fillRect(x, y, w, 2); ctx.fillStyle = '#2b2140'; ctx.fillRect(x, y - .6, w, .6); }
function ceiling(x, y, w) { ctx.fillStyle = '#5a4a3f'; ctx.fillRect(x, y - 6, w, 6); ctx.fillStyle = '#2b2140'; ctx.fillRect(x, y, w, .6); }
function wall(x, y, h) { ctx.fillStyle = '#5a4a3f'; ctx.fillRect(x - 8, y, 8, h); ctx.fillStyle = '#2b2140'; ctx.fillRect(x - .6, y, .6, h); }
function safe(name, fn) { try { fn(); } catch (e) { errs.push(name + ': ' + e.message); ctx.fillStyle = '#f44'; ctx.fillRect(0, 0, 4, 4); } }
// lay cells: list of [label, draw(cx, gy)] ; gy = the cell's floor line
function grid(y0, cw, ch, list, opt) {
  opt = opt || {}; const cols = Math.max(1, Math.floor((LW - 8) / cw)); let i = 0;
  for (const [lab, fn] of list) {
    const c = i % cols, r = (i / cols) | 0, cx = 4 + c * cw + cw / 2, gy = Math.round((y0 + r * ch + ch - 12) / 20) * 20;
    if (opt.ground) ground(cx - cw / 2 + 3, gy, cw - 6);
    safe(lab, () => fn(cx, gy)); label(lab, cx, gy + (opt.ground ? 4 : 1)); i++;
  }
  return y0 + Math.ceil(list.length / cols) * ch;
}
const P0 = (who, st, o) => Object.assign({ i: 0, who, x: 0, y: 0, vx: 0, vy: 0, face: 1, ground: true, st, at: 20, swing: null, leaves: 5, maxLeaves: 5, sun: 50, sunMax: 99, inv: 0, focus: 0, dashT: 0, puffT: -1, wall: 0, glow: 0, bubble: 0, alive: true }, o || {});

const SECTIONS = {
  heroes() {
    let y = 4;
    for (const who of q.get('who') ? [q.get('who')] : ['sprig', 'marigold']) {
      head(who.toUpperCase(), y); y += 16 / R + 4;
      const L = [];
      L.push(['idle', (x, g) => A.player(ctx, P0(who, 'idle', { x, y: g }), 30 + T0)]);
      L.push(['idle (blink)', (x, g) => A.player(ctx, P0(who, 'idle', { x, y: g }), who === 'sprig' ? 2 : 99)]);
      L.push(['idle face L', (x, g) => A.player(ctx, P0(who, 'idle', { x, y: g, face: -1 }), 50)]);
      L.push(['land squash', (x, g) => A.player(ctx, P0(who, 'idle', { x, y: g, at: 1 }), 50)]);
      for (let f = 0; f < 8; f++) L.push(['run ' + f, (x, g) => A.player(ctx, P0(who, 'run', { x, y: g, at: f * 2 + 8 }), 50)]);
      L.push(['jump', (x, g) => A.player(ctx, P0(who, 'jump', { x, y: g - 6 }), 50)]);
      L.push(['fall', (x, g) => A.player(ctx, P0(who, 'fall', { x, y: g - 6 }), 50)]);
      L.push(['fall b', (x, g) => A.player(ctx, P0(who, 'fall', { x, y: g - 6 }), 58)]);
      L.push(['cling (L wall)', (x, g) => { wall(x - 7, g - 40, 40); A.player(ctx, P0(who, 'cling', { x, y: g - 4, wall: -1 }), 50); }]);
      L.push(['cling (R wall)', (x, g) => { wall(x + 15.5, g - 40, 40); A.player(ctx, P0(who, 'cling', { x, y: g - 4, wall: 1, face: -1 }), 58); }]);
      L.push(['dash', (x, g) => A.player(ctx, P0(who, 'dash', { x: x + 8, y: g, dashT: 4 }), 50)]);
      L.push(['focus .2', (x, g) => A.player(ctx, P0(who, 'focus', { x, y: g, focus: .2 }), 50)]);
      L.push(['focus 1', (x, g) => A.player(ctx, P0(who, 'focus', { x, y: g, focus: 1 }), 50)]);
      L.push(['hurt at4', (x, g) => A.player(ctx, P0(who, 'hurt', { x, y: g, at: 4 }), 50)]);
      L.push(['hurt at14', (x, g) => A.player(ctx, P0(who, 'hurt', { x, y: g, at: 14 }), 50)]);
      L.push(['faint', (x, g) => A.player(ctx, P0(who, 'faint', { x, y: g }), 40)]);
      L.push(['bubble', (x, g) => A.player(ctx, P0(who, 'bubble', { x, y: g - 4 }), 40)]);
      L.push(['sit', (x, g) => A.player(ctx, P0(who, 'sit', { x, y: g }), 40)]);
      L.push(['swim', (x, g) => { ctx.fillStyle = 'rgba(90,160,230,.45)'; ctx.fillRect(x - 22, g - 12, 44, 12); A.player(ctx, P0(who, 'swim', { x, y: g }), 40); }]);
      L.push(['swim b', (x, g) => { ctx.fillStyle = 'rgba(90,160,230,.45)'; ctx.fillRect(x - 22, g - 12, 44, 12); A.player(ctx, P0(who, 'swim', { x, y: g }), 56); }]);
      for (const tt of [0, 2, 4, 6, 8, 11]) L.push(['swing f t' + tt, (x, g) => A.player(ctx, P0(who, 'idle', { x: x - 6, y: g, swing: { dir: 'f', t: tt, reach: 30 } }), 50)]);
      for (const tt of [2, 5]) L.push(['swing u t' + tt, (x, g) => A.player(ctx, P0(who, 'idle', { x, y: g, swing: { dir: 'u', t: tt, reach: 30 } }), 50)]);
      for (const tt of [2, 5]) L.push(['swing d t' + tt, (x, g) => A.player(ctx, P0(who, 'jump', { x, y: g - 26, swing: { dir: 'd', t: tt, reach: 30 } }), 50)]);
      L.push(['swing f L run', (x, g) => A.player(ctx, P0(who, 'run', { x: x + 6, y: g, face: -1, at: 12, swing: { dir: 'f', t: 3, reach: 34 } }), 50)]);
      L.push(['inv blink', (x, g) => { A.player(ctx, P0(who, 'idle', { x: x - 10, y: g, inv: 4 }), 50); A.player(ctx, P0(who, 'idle', { x: x + 10, y: g, inv: 8 }), 50); }]);
      L.push(['puff jump', (x, g) => A.player(ctx, P0(who, 'jump', { x, y: g - 10, puffT: 4 }), 50)]);
      L.push(['glow', (x, g) => A.player(ctx, P0(who, 'idle', { x, y: g, glow: 1 }), 50)]);
      L.push(['enter', (x, g) => A.player(ctx, P0(who, 'enter', { x, y: g, at: 5 }), 50)]);
      y = grid(y, 64, 68, L, { ground: true }) + 4;
    }
  },
  glooms() {
    let y = 4; const F = (kind, st, o) => Object.assign({ id: 1, kind, x: 0, y: 0, vx: 0, vy: 0, face: 1, hp: 3, maxHp: 3, st, t: 10, hurt: 0, ceil: 0, alive: true }, o || {});
    const kinds = { smog: ['drift', 'push'], thorn: ['roll', 'rush', 'push'], drip: ['hang', 'shake', 'fall', 'ooze', 'push'], cog: ['walk', 'wind', 'charge', 'dizzy', 'push'],
      lantern: ['idle', 'glow', 'puff'], knight: ['walk', 'block', 'ready', 'shove', 'rest', 'push'] };
    const half = { smog: 0, thorn: 11, drip: 10, cog: 11, lantern: 12, knight: 17 };
    for (const k in kinds) {
      if (q.get('k') && q.get('k') !== k) continue;
      head(k, y); y += 14 / R + 4; const L = [];
      for (const st of kinds[k]) for (const t of [0, 1]) {
        L.push([st + (t ? ' (t+)' : ''), (x, g) => {
          const o = F(k, st, { x, y: g - half[k] - (k === 'smog' ? 22 : 0), t: 6 + t * 13 });
          if (k === 'drip' && (st === 'hang' || st === 'shake' || st === 'push')) { ceiling(x - 30, g - 56, 60); o.y = g - 56 + 14; }
          if (k === 'drip' && st === 'fall') o.y = g - 30;
          A.foe(ctx, o, 40 + t * 5);
        }]);
      }
      L.push(['face L', (x, g) => A.foe(ctx, F(k, kinds[k][0], { x, y: g - half[k] - (k === 'smog' ? 22 : 0), face: -1 }), 44)]);
      L.push(['hurt flash', (x, g) => { const o = F(k, kinds[k][0], { x, y: g - half[k] - (k === 'smog' ? 22 : 0), hurt: 4 }); if (k === 'drip') { ceiling(x - 30, g - 56, 60); o.y = g - 42; } A.foe(ctx, o, 44); }]);
      if (k === 'lantern') for (const st of ['idle', 'glow', 'puff']) L.push(['ceil ' + st, (x, g) => { ceiling(x - 30, g - 50, 60); A.foe(ctx, F(k, st, { x, y: g - 50 + 12, ceil: 1, t: 12 }), 44); }]);
      y = grid(y, 72, k === 'drip' ? 72 : 64, L, { ground: k !== 'smog' }) + 2;
    }
  },
  guardians() {
    let y = 4; const Gd = (kind, st, o) => Object.assign({ kind, x: 0, y: 0, w: 100, h: 100, hp: 10, maxHp: 10, phase: 1, st, t: 20, face: -1, hurt: 0, calm: 0, awake: 1, squash: 0, spin: 0, heat: .3, door: 0, dark: .3, dir: 1, glow: 0 }, o || {});
    const SETS = {
      knot: { sts: ['sleep', 'wake', 'idle', 'hopTell', 'hop', 'land', 'lashTell', 'lash', 'burrTell', 'burr', 'tired'], h: 40, cw: 112, ch: 118, ex: { hopTell: { squash: .5 }, land: { squash: .7 }, idle: { spin: .6 } } },
      boiler: { sts: ['sleep', 'wake', 'idle', 'walk', 'ventTell', 'vent', 'boltTell', 'bolt', 'slamTell', 'slam', 'tired'], h: 55, cw: 150, ch: 175, ex: { boltTell: { door: .5, heat: .8 }, bolt: { door: 1, heat: 1 }, ventTell: { heat: .7 }, vent: { heat: .9 }, sleep: { heat: 0 }, tired: { heat: .1, door: .2 } } },
      cloud: { sts: ['sleep', 'wake', 'drift', 'rainTell', 'rain', 'zapTell', 'zap', 'gustTell', 'gust', 'tired'], h: 40, cw: 175, ch: 110, ex: { rainTell: { dark: .7 }, rain: { dark: .8 }, zapTell: { dark: .9 }, zap: { dark: 1 }, sleep: { dark: 0 } } },
      heart: { sts: ['sleep', 'wake', 'idle', 'sweepTell', 'sweep', 'orbTell', 'orb', 'summon', 'dropTell', 'drop', 'tired'], h: 60, cw: 140, ch: 150, ex: { tired: { glow: .3 } } }
    };
    const only = q.get('g');
    for (const k in SETS) {
      if (only && only !== k) continue;
      const S = SETS[k]; head(k, y); y += 14 / R + 4; const L = [];
      for (const st of S.sts) L.push([st, (x, g) => A.guardian(ctx, Gd(k, st, Object.assign({ x, y: g - S.h }, S.ex[st] || {})), 60)]);
      if (k === 'heart') for (const ph of [2, 3]) L.push(['phase ' + ph, (x, g) => A.guardian(ctx, Gd(k, 'idle', { x, y: g - S.h, phase: ph, glow: ph === 3 ? .6 : .2 }), 60)]);
      L.push(['hurt', (x, g) => A.guardian(ctx, Gd(k, 'idle', { x, y: g - S.h, hurt: 3 }), 60)]);
      for (const c of [.25, .5, .75, 1]) L.push(['calm ' + c, (x, g) => A.guardian(ctx, Gd(k, 'calm', { x, y: g - S.h, calm: c, phase: 3, glow: 1, heat: .2 }), 60)]);
      y = grid(y, S.cw, S.ch, L, { ground: k !== 'cloud' }) + 4;
    }
  },
  hazards() {
    let y = 4; head('hazards (tell = warning, live = real)', y); y += 18 / R + 4;
    const L = [], kinds = { spike: [60, 30], zap: [16, 120], steam: [24, 110], slam: [40, 110], rain: [90, 100], vine: [120, 16], shock: [100, 18] };
    for (const k in kinds) if (!q.get('k') || q.get('k').split(',').includes(k)) for (const [lab, tell, live, t] of [['tell 40', 40, 0, 3], ['tell 8', 8, 0, 35], ['live', 0, 1, 4], ['live t20', 0, 1, 20]]) {
      L.push([k + ' ' + lab, (x, g) => { const [w, h] = kinds[k]; A.hazard(ctx, { kind: k, x: x - w / 2, y: g - h, w, h, t, tell, live }, 50 + t); }]);
    }
    grid(y, 130, 136, L, { ground: true });
  },
  things() {
    let y = 4; head('shots', y); y += 14 / R + 4;
    const L = [];
    for (const k of ['spore', 'burr', 'bolt', 'drop', 'orb', 'beam', 'petal', 'nope']) L.push([k, (x, g) => A.shot(ctx, { kind: k, x, y: g - 20, vx: k === 'beam' ? 6 : 2, vy: k === 'drop' ? 3 : 0, r: k === 'orb' ? 7 : 4, t: 12, life: 60, own: k === 'beam' || k === 'petal' ? 0 : -1 }, 50)]);
    L.push(['beam L', (x, g) => A.shot(ctx, { kind: 'beam', x: x - 20, y: g - 20, vx: -6, vy: 0, r: 5, t: 6, life: 30, own: 0 }, 50)]);
    for (const v of [1, 5, 10, 25]) L.push(['dew v' + v, (x, g) => A.drop(ctx, { x, y: g - 14, vx: 0, vy: 0, t: 20, v }, 50)]);
    y = grid(y, 64, 56, L, { ground: false });
    head('items', y); y += 14 / R + 4; const I = [];
    const it = (kind, o) => Object.assign({ kind, id: '', x: 0, y: 0, hp: 3, v: 0, got: 0 }, o);
    I.push(['life', (x, g) => A.item(ctx, it('life', { x, y: g - 16 }), 50)]);
    I.push(['vessel', (x, g) => A.item(ctx, it('vessel', { x, y: g - 16 }), 50)]);
    I.push(['notch', (x, g) => A.item(ctx, it('notch', { x, y: g - 16 }), 50)]);
    for (const id of ['long', 'magnet', 'sunny']) I.push(['charm ' + id, (x, g) => A.item(ctx, it('charm', { id, x, y: g - 16 }), 50)]);
    for (const id of ['dash', 'grip', 'puff', 'glow', 'beam']) I.push(['ability ' + id, (x, g) => A.item(ctx, it('ability', { id, x, y: g - 10 }), 50)]);
    for (const hp of [3, 2, 1]) I.push(['cluster hp' + hp, (x, g) => A.item(ctx, it('cluster', { x, y: g - 10, hp }), 50)]);
    I.push(['puddle', (x, g) => A.item(ctx, it('puddle', { x, y: g, v: 40 }), 50)]);
    y = grid(y, 64, 58, I, { ground: true });
    head('flowers (grown, growing t10, ceiling) and buds', y); y += 14 / R + 4; const Fl = [];
    for (let k = 0; k < 7; k++) Fl.push(['flower ' + k, (x, g) => { A.flower(ctx, { x: x - 10, y: g, kind: k, ceil: 0, t: 200, seed: k }, 50); A.flower(ctx, { x: x + 8, y: g, kind: k, ceil: 0, t: 12, seed: k }, 50); }]);
    for (let k = 0; k < 7; k++) Fl.push(['ceil ' + k, (x, g) => { ceiling(x - 30, g - 46, 60); A.flower(ctx, { x, y: g - 46, kind: k, ceil: 1, t: 200, seed: k }, 50); }]);
    Fl.push(['bud', (x, g) => A.bud(ctx, { x, y: g - 10, ceil: 0, open: 0, t: 30 }, 50)]);
    Fl.push(['bud open', (x, g) => A.bud(ctx, { x, y: g - 10, ceil: 0, open: 1, t: 30 }, 50)]);
    Fl.push(['bud ceil', (x, g) => { ceiling(x - 30, g - 46, 60); A.bud(ctx, { x, y: g - 36, ceil: 1, open: 0, t: 30 }, 50); }]);
    grid(y, 64, 62, Fl, { ground: true });
  },
  props() {
    let y = 4; head('gates by area (shut, half, open) / seal', y); y += 14 / R + 4; const L = [];
    for (const area of ['rootgate', 'mossy', 'glowcap', 'pipes', 'crystal', 'cloud', 'heart']) for (const o of [0, .5]) L.push([area + ' ' + o, (x, g) => A.gate(ctx, { kind: 'lever', x: x - 10, y: g - 60, w: 20, h: 60, shut: o < 1, o, vert: 1 }, 50, area)]);
    L.push(['horiz', (x, g) => A.gate(ctx, { kind: 'lever', x: x - 30, y: g - 30, w: 60, h: 20, shut: 1, o: 0, vert: 0 }, 50, 'mossy')]);
    L.push(['sun gate', (x, g) => A.gate(ctx, { kind: 'sun', x: x - 10, y: g - 60, w: 20, h: 60, shut: 1, o: 0, vert: 1 }, 50, 'crystal')]);
    L.push(['arena', (x, g) => A.gate(ctx, { kind: 'arena', x: x - 10, y: g - 60, w: 20, h: 60, shut: 1, o: 0, vert: 1 }, 50, 'heart')]);
    L.push(['seal', (x, g) => A.gate(ctx, { kind: 'seal', x: x - 30, y: g - 60, w: 60, h: 60, shut: 1, o: 0, vert: 1, lit: 2 }, 50, 'heart')]);
    L.push(['seal open .4', (x, g) => A.gate(ctx, { kind: 'seal', x: x - 30, y: g - 60, w: 60, h: 60, shut: 0, o: .4, vert: 1, lit: 3 }, 50, 'heart')]);
    y = grid(y, 72, 80, L, { ground: true });
    head('props', y); y += 14 / R + 4; const Q = [];
    Q.push(['lever off', (x, g) => A.lever(ctx, { x, y: g - 10, on: 0, t: 40 }, 50)]);
    Q.push(['lever on', (x, g) => A.lever(ctx, { x, y: g - 10, on: 1, t: 40 }, 50)]);
    Q.push(['lever flipping', (x, g) => A.lever(ctx, { x, y: g - 10, on: 1, t: 3 }, 50)]);
    Q.push(['switch off', (x, g) => A.switch(ctx, { x, y: g - 20, on: 0, t: 40 }, 50)]);
    Q.push(['switch on', (x, g) => A.switch(ctx, { x, y: g - 20, on: 1, t: 40 }, 50)]);
    Q.push(['spot', (x, g) => A.spot(ctx, { x, y: g - 10, lit: 0 }, 50)]);
    Q.push(['spot lit', (x, g) => A.spot(ctx, { x, y: g - 10, lit: 1 }, 50)]);
    Q.push(['peddler', (x, g) => A.npc(ctx, { kind: 'peddler', x, y: g - 10, talk: 0 }, 50)]);
    Q.push(['peddler talk', (x, g) => A.npc(ctx, { kind: 'peddler', x, y: g - 10, talk: 1 }, 57)]);
    Q.push(['sign', (x, g) => A.sign(ctx, { x, y: g - 10, text: 'hi' }, 50)]);
    for (const area of ['mossy', 'pipes', 'crystal', 'cloud']) Q.push(['plat ' + area, (x, g) => A.plat(ctx, { x: x - 30, y: g - 30, w: 60, h: 10, vx: 0, vy: 0 }, 50, area)]);
    Q.push(['vent off', (x, g) => A.vent(ctx, { x, y: g - 10, h: 80, on: 0, tell: 0, t: 0 }, 50)]);
    Q.push(['vent tell', (x, g) => A.vent(ctx, { x, y: g - 10, h: 80, on: 0, tell: 20, t: 0 }, 50)]);
    Q.push(['vent on', (x, g) => A.vent(ctx, { x, y: g - 10, h: 80, on: 1, tell: 0, t: 30 }, 50)]);
    Q.push(['cap', (x, g) => A.cap(ctx, { x, y: g - 10, squash: 0 }, 50)]);
    Q.push(['cap squash', (x, g) => A.cap(ctx, { x, y: g - 10, squash: .8 }, 50)]);
    grid(y, 80, 110, Q, { ground: true });
  },
  icons() {
    let y = 4; head('icons @ 16 / 24', y); y += 14 / R + 4;
    const names = ['leaf', 'leafEmpty', 'leafBark', 'sun', 'sun:0', 'sun:0.3', 'sun:0.6', 'sun:1', 'dew', 'life', 'lifeHalf', 'vessel', 'notch', 'notchFull', 'map', 'compass', 'spot', 'peddler', 'puddle', 'guardian', 'lock',
      'charm:long', 'charm:sip', 'charm:bark', 'charm:breeze', 'charm:magnet', 'charm:compass', 'charm:swift', 'charm:gentle', 'charm:coat', 'charm:bouncy', 'charm:pouch', 'charm:sunny', 'charm:nope',
      'ability:dash', 'ability:grip', 'ability:puff', 'ability:glow', 'ability:beam', 'key:Z', 'key:Esc', 'key:↑', 'key:Space', 'nope'];
    const L = names.map(n => [n, (x, g) => { A.icon(ctx, n, x - 14, g - 14, 16, 50); A.icon(ctx, n, x + 10, g - 16, 24, 50); }]);
    y = grid(y, 64, 44, L) + 4;
    head('big icons @ 48', y); y += 14 / R + 4;
    const B = ['leaf', 'sun:0.6', 'life', 'vessel', 'charm:coat', 'charm:sunny', 'ability:dash', 'ability:beam', 'key:Esc'].map(n => [n, (x, g) => A.icon(ctx, n, x, g - 26, 48, 50)]);
    grid(y, 76, 70, B);
  },
  portraits() {
    let y = 4; head('portraits', y); y += 14 / R + 4;
    const L = [];
    for (const who of (q.get('who') || 'sprig,marigold,peddler,heartseed').split(',')) for (const mood of ['happy', 'talk', 'wow', 'sad', 'sleep', 'calm', 'det']) L.push([who + ' ' + mood, (x, g) => A.portrait(ctx, who, x, g - 50, 96, 60 + (mood === 'talk' ? 8 : 0), mood)]);
    grid(y, 116, 120, L);
  },
  zoom() { // one thing big: ?sec=zoom&what=player|foe|... via JSON in &o=
    const what = q.get('what') || 'player', o = JSON.parse(q.get('o') || '{}'), t = +q.get('t') || 50;
    ctx.save(); ctx.translate(LW / 2, LH * .7);
    ground(-LW / 2, 0, LW);
    if (what === 'player') A.player(ctx, P0(o.who || 'sprig', o.st || 'idle', o), t);
    else if (what === 'foe') A.foe(ctx, Object.assign({ kind: 'smog', st: 'drift', x: 0, y: -20, face: 1, t: 10 }, o), t);
    else if (what === 'guardian') A.guardian(ctx, Object.assign({ kind: 'knot', st: 'idle', x: 0, y: -50, face: -1, t: 10, calm: 0 }, o), t);
    else A[what](ctx, Object.assign({ x: 0, y: -10 }, o), t, o.area);
    ctx.restore();
  },
  busy() {
    // a busy room: 2 players, 12 glooms, 40 flowers, 30 dew drops, 10 shots, a guardian, some props; drawn N times
    const kinds = ['smog', 'thorn', 'drip', 'cog', 'lantern', 'knight'], sts = { smog: 'drift', thorn: 'roll', drip: 'hang', cog: 'walk', lantern: 'idle', knight: 'walk' };
    const foes = []; for (let i = 0; i < 12; i++) { const k = kinds[i % 6]; foes.push({ id: i, kind: k, x: 40 + i * 48, y: 300, face: i & 1 ? 1 : -1, st: sts[k], t: i * 7, hurt: i === 3 ? 2 : 0, alive: true, ceil: 0 }); }
    const flowers = []; for (let i = 0; i < 40; i++) flowers.push({ x: 10 + i * 15.5, y: 340, kind: i % 7, ceil: i % 9 === 0 ? 1 : 0, t: i * 5, seed: i });
    for (const f of flowers) if (f.ceil) f.y = 20;
    const drops = []; for (let i = 0; i < 30; i++) drops.push({ x: 20 + i * 20, y: 200 + (i % 5) * 9, vx: 0, vy: 0, t: i * 3, v: i % 6 ? 1 : 5 });
    const shots = []; const sk = ['spore', 'burr', 'bolt', 'drop', 'orb', 'beam', 'petal', 'spore', 'burr', 'orb']; for (let i = 0; i < 10; i++) shots.push({ kind: sk[i], x: 60 + i * 52, y: 150, vx: 2, vy: 1, r: 4, t: i * 4, life: 60, own: 0 });
    const pl = [P0('sprig', 'run', { x: 200, y: 340, at: 9, swing: { dir: 'f', t: 3, reach: 32 } }), P0('marigold', 'focus', { x: 260, y: 340, focus: .6, glow: 1 })];
    const gd = { kind: 'boiler', x: 480, y: 280, w: 120, h: 110, st: 'idle', t: 30, face: -1, heat: .5, door: .2, calm: 0, phase: 1 };
    const props = () => { A.spot(ctx, { x: 100, y: 330, lit: 1 }, 0); A.lever(ctx, { x: 140, y: 330, on: 1, t: 50 }, 0); A.cap(ctx, { x: 560, y: 330, squash: 0 }, 0); A.item(ctx, { kind: 'life', x: 600, y: 200 }, 0); A.sign(ctx, { x: 30, y: 330 }, 0); };
    const scene = t => {
      for (const f of foes) A.foe(ctx, f, t);
      A.guardian(ctx, gd, t);
      for (const f of flowers) A.flower(ctx, f, t);
      props();
      for (const d of drops) A.drop(ctx, d, t);
      for (const s of shots) A.shot(ctx, s, t);
      for (const p of pl) A.player(ctx, p, t);
    };
    let t0 = performance.now(); bg(); ground(0, 340, LW, 20); scene(1);   // cold: bakes every sprite this room needs
    const cold = performance.now() - t0;
    const N = 120; t0 = performance.now();
    for (let i = 0; i < N; i++) { bg(); scene(i); }
    const rec = (performance.now() - t0) / N;
    ctx.getImageData(0, 0, 1, 1); t0 = performance.now();
    for (let i = 0; i < 30; i++) { ctx.fillRect(0, 0, 1, 1); ctx.getImageData(0, 0, 1, 1); }
    const base = (performance.now() - t0) / 30; t0 = performance.now();
    for (let i = 0; i < 30; i++) { scene(i); ctx.getImageData(0, 0, 1, 1); }
    const flush = (performance.now() - t0) / 30 - base;
    let t1 = performance.now(); for (let i = 0; i < N; i++) bg(); const bgT = (performance.now() - t1) / N;
    bg(); ground(0, 340, LW, 20); scene(77);
    window.__perf = { coldBakeMs: +cold.toFixed(1), recordMs: +(rec - bgT).toFixed(3), flushMinusBaselineMs: +flush.toFixed(3), readbackBaselineMs: +base.toFixed(3), R, low: LOW };
    document.getElementById('perf').textContent = 'busy scene: ' + (rec - bgT).toFixed(2) + ' ms/frame (JS), ' + flush.toFixed(2) + ' ms incl. GPU flush, cold bake ' + cold.toFixed(0) + ' ms, R=' + R;
  }
};
function run() {
  ctx.setTransform(R, 0, 0, R, 0, 0); ctx.imageSmoothingEnabled = true;
  bg();
  const fn = SECTIONS[SEC]; if (fn) safe(SEC, fn);
  if (A.errors && A.errors.length) errs.push(...A.errors.map(e => 'Art: ' + e.split('\n')[0]));
  window.__errs = errs;
  if (errs.length) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.font = '12px monospace'; ctx.fillStyle = '#ff6060'; ctx.textAlign = 'left'; errs.slice(0, 12).forEach((e, i) => ctx.fillText(e, 6, CH - 14 - i * 14)); }
  document.title = 'ready';
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(run); else run();
})();
