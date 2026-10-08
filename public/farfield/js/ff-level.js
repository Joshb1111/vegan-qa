/* FAR FIELD — ff-level.js: FF.Level, the runtime view of the level data FF.S1 (ff-level-s1.js + ff-script-s1.js):
   ground and solids queries, line-of-sight against the occluders (A6: the ONE sight test), covers and cores, sections and
   the continuous look path (dusk -> night, A1), triggers (emitted on the bus with every condition in the data: still,
   nearBox, onBox, yMax, alt, alsoOn, repeat + cooldown, autoStopAfter), checkpoints.
   Pure logic: no three.js, no DOM (loadable in node for the Search checker: set window = globalThis first).
   OWNER: the world builder. API contract: docs/farfield/INTERFACES.md §7.
   Events this file emits (beyond the trigger events named in FF.S1.triggers):
     place            { id, prev }                                   the section under the rabbit changed
     walkway-start    { cause: 'x71+6s'|'first-push'|'reach-fail'|'courtyard+25s', t }   the walkway beat's effective start
                      (the earliest of the four causes in SEQUENCE-1.md §7.2; emitted once per run). The data's own
                      'walkway-timer' trigger still fires too: { arg: 6.0 } on reaching x 71, then { arg: 0, cause } for the
                      first alsoOn cause that comes before those 6 s are up.
     rest             { id, arg, x, auto: true }                     also after autoStopAfter (60 s) past x 116 with no stop */
'use strict';
window.FF = window.FF || {};
(function () {
const S = () => FF.S1;
let fired = {}, cool = {}, inside = {}, stillT = 0, offs = [];
const run = { courtyardT: -1, x71T: -1, walkwayStarted: false, alsoSent: {}, restT: -1, restAuto: false, pushed: false, reachFailed: false };

/* segment vs box (Liang-Barsky), the same test the Search checker uses */
function segHitsBox(ax, ay, bx, by, b) {
  let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy], q = [ax - b.x0, b.x1 - ax, ay - b.y0, b.y1 - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; }
    else { const r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
  }
  return t1 > t0 + 1e-6 && t1 > 1e-4 && t0 < 1 - 1e-4;
}
const emit = (name, data) => { if (FF.bus) FF.bus.emit(name, data); };
const G = () => FF.G || {};

const Level = FF.Level = {
  stub: false,
  get data() { return S(); },
  get solids() { return S().solids; },
  get covers() { return S().covers; },
  get checkpoints() { return S().checkpoints; },
  /* occluder boxes (2D) resolved from FF.S1.occluders ids */
  get occluders() { if (!Level._occ) Level._occ = S().occluders.map(id => S().solids.find(s => s.id === id)).filter(Boolean); return Level._occ; },
  solid(id) { return S().solids.find(s => s.id === id) || null; },
  cover(id) { return S().covers.find(c => c.id === id) || null; },
  decor(id) { return (S().decor || []).find(d => d.id === id) || null; },
  link(id) { return S().links.find(l => l.id === id) || null; },

  /* floor height of the ground profile at x (at a vertical step, the higher side) */
  groundY(x) {
    const g = S().ground; if (x <= g[0][0]) return g[0][1];
    let best = -Infinity, hit = false;
    for (let i = 0; i < g.length - 1; i++) {
      const [x0, y0] = g[i], [x1, y1] = g[i + 1];
      if (x >= x0 && x <= x1) { hit = true; const y = x1 === x0 ? Math.max(y0, y1) : y0 + (y1 - y0) * (x - x0) / (x1 - x0); if (y > best) best = y; }
    }
    return hit ? best : g[g.length - 1][1];
  },
  /* floor under a body spanning [x - hw, x + hw]: the highest ground or solid top at or below `y + tol` */
  floorUnder(x, hw, y, tol) {
    tol = tol == null ? 0.02 : tol; let f = Math.max(Level.groundY(x - hw), Level.groundY(x), Level.groundY(x + hw));
    if (f > y + tol) f = Level.groundY(x);   // a step up the body cannot stand on yet
    for (const s of S().solids) if (x + hw > s.x0 && x - hw < s.x1 && s.y1 <= y + tol && s.y1 > f) f = s.y1;
    return f;
  },
  solidsIn(x0, x1, y0, y1) { const out = []; for (const s of S().solids) if (x1 > s.x0 && x0 < s.x1 && y1 > s.y0 && y0 < s.y1) out.push(s); return out; },
  hitSolid(x0, x1, y0, y1) { for (const s of S().solids) if (x1 > s.x0 && x0 < s.x1 && y1 > s.y0 && y0 < s.y1) return s; return null; },
  /* the lowest solid underside above y over the body span (Infinity if open sky) */
  ceilingAbove(x, hw, y) { let c = Infinity; for (const s of S().solids) if (x + hw > s.x0 && x - hw < s.x1 && s.y0 >= y - 1e-6 && s.y0 < c) c = s.y0; return c; },
  clearance(x, hw, y) { if (y == null) y = Level.floorUnder(x, hw, 0.05); return Level.ceilingAbove(x, hw, y) - y; },
  /* the solid making a squeeze here, and whether it is a short duck-under (A9) */
  squeezeAt(x, hw, y) {
    const sq = S().squeeze; let best = null;
    for (const s of S().solids) if (x + hw > s.x0 && x - hw < s.x1 && s.y0 >= y - 1e-6) { const c = s.y0 - y; if (c >= sq.min && c <= sq.max && (!best || s.y0 < best.y0)) best = s; }
    return best ? { solid: best, clear: best.y0 - y, short: (best.x1 - best.x0) <= sq.shortMax } : null;
  },
  /* 2D line of sight against the occluders: true if blocked (A6: solid cover blocks completely) */
  segmentBlocked(ax, ay, bx, by) { for (const b of Level.occluders) if (segHitsBox(ax, ay, bx, by, b)) return true; return false; },
  segHitsBox,
  /* covers: the one whose extent holds the whole body, and the one whose core holds the centre */
  coverAt(x, hw) { hw = hw || 0; for (const c of S().covers) if (x - hw >= c.x0 - 1e-6 && x + hw <= c.x1 + 1e-6) return c; return null; },
  coreAt(x) { for (const c of S().covers) if (c.core && x >= c.core[0] - 1e-6 && x <= c.core[1] + 1e-6) return c; return null; },
  section(x, y) { for (const s of S().sections) if (x >= s.x0 && x < s.x1) return s.id; return x < S().sections[0].x0 ? S().sections[0].id : S().sections[S().sections.length - 1].id; },

  /* the look path along x (A1): { from, to, t }, continuous everywhere. Between two blends the look holds the earlier blend's
     `to`; before the first it is the first's `from`. A transit blend (the duct: courtyard -> search) is a step at the section
     boundary here; the world drives it smoothly while the rabbit is inside the wall (FF.World, the 'transit' events). */
  lookBlend(x) {
    const list = Level._blends || (Level._blends = S().lookBlends.map(b => {
      if (b.x0 != null) return b;
      const sec = S().sections.find(s => s.id === b.to); const at = sec ? sec.x0 : 0;
      return Object.assign({}, b, { x0: at, x1: at });
    }).sort((a, b) => a.x0 - b.x0));
    if (!list.length) { const s = Level.section(x); return { from: s, to: s, t: 0 }; }
    if (x < list[0].x0) return { from: list[0].from, to: list[0].from, t: 0 };
    let cur = null; for (const b of list) if (x >= b.x0) cur = b;
    if (x <= cur.x1 && cur.x1 > cur.x0) return { from: cur.from, to: cur.to, t: (x - cur.x0) / (cur.x1 - cur.x0) };
    return { from: cur.to, to: cur.to, t: 0 };
  },
  checkpoint(id) { return S().checkpoints.find(c => c.id === id) || null; },

  init() {
    Level._occ = null; Level._blends = null;
    for (const off of offs) off(); offs = [];
    if (!FF.bus) return;
    /* alsoOn causes for the walkway (SEQUENCE-1.md §7.2): the first push, the first reach-fail (bus events from the Player) */
    offs.push(FF.bus.on('box', d => { if (d && d.moving !== false && !run.pushed) { run.pushed = true; also('first-push'); } }));
    offs.push(FF.bus.on('rabbit:reach-fail', () => { if (!run.reachFailed) { run.reachFailed = true; also('reach-fail'); } }));
  },
  /* triggers before the checkpoint are treated as already fired (one-shot ones), so a warp does not replay old beats */
  reset(cp) {
    fired = {}; cool = {}; inside = {}; stillT = 0;
    Object.assign(run, { courtyardT: -1, x71T: -1, walkwayStarted: false, alsoSent: {}, restT: -1, restAuto: false, pushed: false, reachFailed: false });
    for (const t of S().triggers) if (t.x0 != null && t.x0 < cp.x - 0.01 && !t.repeat) { fired[t.id] = true; inside[t.id] = true; }
    /* a checkpoint past the Courtyard means the walkway has been and gone */
    if (cp.x > 83.5) run.walkwayStarted = true;
    if (FF.G) FF.G.place = Level.section(cp.x, cp.y);
  },
  step(dt) {
    const g = G(), r = g.rabbit; if (!r) return;
    const t = g.t || 0;
    const place = Level.section(r.x, r.y); if (place !== g.place) { const prev = g.place; g.place = place; emit('place', { id: place, prev }); }
    stillT = Math.abs(r.vx || 0) < 0.05 && r.grounded && (r.mode == null || r.mode === 'play') ? stillT + dt : 0;
    const box = g.box;
    if (g.mode && g.mode !== 'play') return;           // triggers belong to play (the title's live scene fires nothing)
    if (r.mode === 'tumble') return;                   // the opening tumble (FF.Player): the hints wait for control
    for (const tr of S().triggers) {
      if (tr.x0 == null) continue;                      // link-driven triggers (arrive-yard) are emitted by the Player
      if (cool[tr.id] > 0) cool[tr.id] -= dt;
      let cond = r.x >= tr.x0 && r.x <= tr.x1 && (tr.yMax == null || r.y <= tr.yMax) && (!tr.still || stillT >= tr.still);
      if (cond && tr.nearBox != null) cond = !!box && Math.abs(box.x - r.x) <= tr.nearBox + (box.w || 0) / 2;
      if (cond && tr.onBox) cond = !!r.onBox;
      /* alt: the same event from a wider area with its own stillness (the rest: 3 s still anywhere past 116) */
      if (!cond && tr.alt) cond = r.x >= tr.alt.x0 && r.x <= (tr.alt.x1 != null ? tr.alt.x1 : tr.x1 + 99) && (!tr.alt.still || stillT >= tr.alt.still);
      if (cond && !inside[tr.id] && (!fired[tr.id] || tr.repeat) && !(cool[tr.id] > 0)) {
        fired[tr.id] = true; if (tr.cooldown) cool[tr.id] = tr.cooldown;
        emit(tr.event, { id: tr.id, arg: tr.arg, x: r.x });
        if (tr.id === 'puzzle-zone' && run.x71T < 0) run.x71T = t;
      }
      inside[tr.id] = cond;
    }
    /* the walkway: the earliest of x 71 + 6 s, the first push, the first reach-fail, 25 s after entering the Courtyard */
    if (!run.walkwayStarted) {
      if (place === 'courtyard' && run.courtyardT < 0) run.courtyardT = t;
      if (run.x71T >= 0 && t - run.x71T >= 6.0) startWalkway('x71+6s');
      else if (run.courtyardT >= 0 && t - run.courtyardT >= 25.0) also('courtyard+25s');
    }
    /* the rest's auto-stop: if the player never stops, the rabbit stops by itself after 60 s in the space (Player acts on it) */
    const rt = S().triggers.find(k => k.id === 'rest');
    if (rt && rt.autoStopAfter) {
      if (r.x >= (rt.alt ? rt.alt.x0 : rt.x0)) { if (run.restT < 0) run.restT = t; }
      if (run.restT >= 0 && !run.restAuto && !fired.rest && t - run.restT >= rt.autoStopAfter) { run.restAuto = true; fired.rest = true; emit('rest', { id: 'rest', arg: rt.arg, x: r.x, auto: true }); }
    }
  },
  debug() { return { place: FF.G && FF.G.place, fired: Object.keys(fired).filter(k => fired[k]), walkway: run.walkwayStarted, stillT: +stillT.toFixed(2) }; },
};
function also(cause) {
  if (run.walkwayStarted || run.alsoSent[cause]) return;
  if ((G().place || '') !== 'courtyard' && cause !== 'courtyard+25s') return;
  run.alsoSent[cause] = true;
  const tr = S().triggers.find(k => k.id === 'puzzle-zone');
  emit(tr ? tr.event : 'walkway-timer', { id: tr ? tr.id : 'puzzle-zone', arg: 0, x: G().rabbit ? G().rabbit.x : 0, cause });
  startWalkway(cause);
}
function startWalkway(cause) { if (run.walkwayStarted) return; run.walkwayStarted = true; fired['puzzle-zone'] = true; emit('walkway-start', { cause, t: G().t || 0 }); }
})();
