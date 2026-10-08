/* FAR FIELD — ff-core.js: shared plumbing every module may use. Loaded right after ff-config.js. No three.js at load time
   except inside FF.geo helpers (called later), no DOM except location; loadable in node with a stub `window`.
   OWNER: architect / integrator (frozen while the builders work in parallel). docs/farfield/INTERFACES.md §4-§5.
     FF.Q          URLSearchParams of the page (?q=, ?mute=1, ?seed=, ?debug=1, ?clean=1, ?rabbit=, ?cp=)
     FF.SILENT     true with ?mute=1: no AudioContext is ever made and nothing touches storage
     FF.bus        the event bus: on(name, fn) -> off(), once, emit(name, data), off(name, fn), log (last 200 events)
     FF.util       clamp, lerp, approach, sstep, damp, invLerp, ease.inOutSine, ease.outCubic
     FF.rng()      seeded random 0..1 (mulberry32); FF.seed(n) restarts it. Use it, never Math.random, in gameplay code
     FF.geo        box(x0,x1,y0,y1,z0,z1), cyl(r,h,x,y0,z,seg,rTop), merge(geos): merged non-indexed geometry (one draw per material)
     FF.store      get(k) / set(k, v): localStorage wrapped in try/catch; no-ops with ?mute=1
     FF.report(e, tag)  console.error once per unique message (the game keeps running) */
'use strict';
window.FF = window.FF || {};
(function () {
let search = ''; try { search = String((window.location && window.location.search) || ''); } catch (_) {}
FF.Q = new URLSearchParams(search);
FF.SILENT = FF.Q.get('mute') === '1';

/* ---------------------------------------------------------------- event bus (synchronous) */
const handlers = new Map(), LOGN = 200;
FF.bus = {
  log: [],
  on(name, fn) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(fn); return () => FF.bus.off(name, fn); },
  once(name, fn) { const off = FF.bus.on(name, d => { off(); fn(d); }); return off; },
  off(name, fn) { const l = handlers.get(name); if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
  emit(name, data) {
    const G = FF.G; FF.bus.log.push({ t: G ? +G.t.toFixed(3) : 0, name, data: data === undefined ? null : data });
    if (FF.bus.log.length > LOGN) FF.bus.log.splice(0, FF.bus.log.length - LOGN);
    const l = handlers.get(name); if (l) for (const fn of l.slice()) { try { fn(data || {}); } catch (e) { FF.report(e, 'bus:' + name); } }
    const all = handlers.get('*'); if (all) for (const fn of all.slice()) { try { fn(name, data || {}); } catch (e) { FF.report(e, 'bus:*'); } }
  },
  clear() { handlers.clear(); },
};

/* ---------------------------------------------------------------- maths */
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
FF.util = {
  clamp, lerp: (a, b, t) => a + (b - a) * t, invLerp: (a, b, v) => (v - a) / (b - a),
  approach: (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d),
  sstep: (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
  damp: (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt)),           // frame-rate independent exponential follow
  ease: { inOutSine: t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1)), outCubic: t => 1 - Math.pow(1 - clamp(t, 0, 1), 3) },
};

/* ---------------------------------------------------------------- seeded random */
let seedState = (+FF.Q.get('seed') || 1) >>> 0;
FF.seed = n => { seedState = (n >>> 0) || 1; };
FF.rng = () => { let t = (seedState += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* ---------------------------------------------------------------- storage (per viewer; optional) */
FF.store = {
  get(k) { if (FF.SILENT) return null; try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { if (FF.SILENT) return; try { localStorage.setItem(k, String(v)); } catch (_) {} },
};

/* ---------------------------------------------------------------- errors: report once, keep running */
const seen = new Set();
FF.errors = [];
FF.report = function (e, tag) {
  const m = (tag ? '[' + tag + '] ' : '') + String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ');
  if (seen.has(m)) return; seen.add(m); if (FF.errors.length < 50) FF.errors.push(m);
  console.error('[farfield]', tag || '', e);
};

/* ---------------------------------------------------------------- geometry helpers (from the look test's ff-scene.js) */
FF.geo = {
  /* a box spanning [x0,x1] x [y0,y1] x [z0,z1] */
  box(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; },
  cyl(r, h, x, y0, z, seg, rTop) { const g = new THREE.CylinderGeometry(rTop != null ? rTop : r, r, h, seg || 20, 1); g.translate(x, y0 + h / 2, z); return g; },
  /* merge geometries (indexed or not) into one non-indexed geometry with position + normal (+ color if every part has it) */
  merge(geos) {
    const T = THREE; let n = 0; const parts = geos.map(g => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return ng; });
    const hasCol = parts.every(g => g.attributes.color);
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = hasCol ? new Float32Array(n * 3) : null; let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); if (col) col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const out = new T.BufferGeometry(); out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    if (col) out.setAttribute('color', new T.BufferAttribute(col, 3));
    out.computeBoundingSphere(); out.computeBoundingBox(); return out;
  },
};
FF.merge = FF.geo.merge;
})();
