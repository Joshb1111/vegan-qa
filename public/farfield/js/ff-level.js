/* FAR FIELD — ff-level.js: FF.Level, the runtime view of the level data FF.S1 (ff-level-s1.js + ff-script-s1.js):
   ground and solids queries, line-of-sight against the occluders, covers and cores, sections and look blends, triggers
   (emitted on the bus), checkpoints. Pure logic: no three.js, no DOM (loadable in node for the Search checker).
   OWNER: the world builder. API contract: docs/farfield/INTERFACES.md §7. SKELETON: a working first version of every query;
   the builder refines it (trigger conditions still / nearBox / onBox, alt, alsoOn; spatial buckets if needed). */
'use strict';
window.FF = window.FF || {};
(function () {
const S = () => FF.S1;
let fired = {}, cool = {}, inside = {}, stillT = 0;

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

const Level = FF.Level = {
  stub: false,
  get data() { return S(); },
  get solids() { return S().solids; },
  get covers() { return S().covers; },
  get checkpoints() { return S().checkpoints; },
  /* occluder boxes (2D) resolved from FF.S1.occluders ids */
  get occluders() { if (!Level._occ) Level._occ = S().occluders.map(id => S().solids.find(s => s.id === id)).filter(Boolean); return Level._occ; },

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
  /* look blend at x: { from, to, t } (t 0..1); the duct transit blend is driven by the world from the 'transit' events */
  lookBlend(x) {
    let out = { from: Level.section(x), to: Level.section(x), t: 0 };
    for (const b of S().lookBlends) if (b.x0 != null && x >= b.x0 && x <= b.x1) out = { from: b.from, to: b.to, t: (x - b.x0) / (b.x1 - b.x0) };
    return out;
  },
  checkpoint(id) { return S().checkpoints.find(c => c.id === id) || null; },

  init() { Level._occ = null; },
  /* triggers before the checkpoint are treated as already fired (one-shot ones), so a warp does not replay old beats */
  reset(cp) {
    fired = {}; cool = {}; inside = {}; stillT = 0;
    for (const t of S().triggers) if (t.x0 != null && t.x0 < cp.x - 0.01 && !t.repeat) { fired[t.id] = true; inside[t.id] = true; }
    if (FF.G) FF.G.place = Level.section(cp.x, cp.y);
  },
  step(dt) {
    const G = FF.G, r = G && G.rabbit; if (!r) return;
    const place = Level.section(r.x, r.y); if (place !== G.place) { const prev = G.place; G.place = place; FF.bus.emit('place', { id: place, prev }); }
    stillT = Math.abs(r.vx || 0) < 0.05 && r.grounded ? stillT + dt : 0;
    for (const t of S().triggers) {
      if (t.x0 == null) continue;                      // link-driven triggers (arrive-yard) are emitted by the player/events
      if (cool[t.id] > 0) cool[t.id] -= dt;
      const cond = r.x >= t.x0 && r.x <= t.x1 && (t.yMax == null || r.y <= t.yMax) && (!t.still || stillT >= t.still);
      if (cond && !inside[t.id] && (!fired[t.id] || t.repeat) && !(cool[t.id] > 0)) {
        fired[t.id] = true; if (t.cooldown) cool[t.id] = t.cooldown;
        FF.bus.emit(t.event, { id: t.id, arg: t.arg, x: r.x });
      }
      inside[t.id] = cond;
    }
  },
  debug() { return { place: FF.G && FF.G.place, fired: Object.keys(fired).filter(k => fired[k]) }; },
};
})();
