/* FAR FIELD — ff-truck.js: the cattle truck, far away (Josh's Tripo model, 8 Oct). Sequence 2's breathing space: across the fog, on a
   road in front of the long lit building, a livestock lorry crawls slowly along and stops, 120 m off: a dark silhouette against the
   warm windows with a few faint lights. Never near, never interactive, no cows shown, NO SOUND. Visual only: no AI, rule, camera,
   audio or timing reads it. models/ff_truck_cows.glb (about 5k triangles, a 512 px texture), drawn in the same matte dark as
   everything else (FF.mat), under the far building's fog. ?truck=0 leaves it out. Shown only once the rabbit is out of the Works
   (x > 186), so it is a surprise of the last view and the earlier places never pay for it.
   Contract (INTERFACES §3): init(ctx) async, reset(cp), frame(dt), dispose(), debug(). */
'use strict';
(function () {
const T = THREE, U = FF.util, Q = FF.Q;
const CFG = { file: 'models/ff_truck_cows.glb', z: -124.0, y: -0.05, x0: 233.0, x1: 262.0, speed: 0.42, showFrom: 186.0, len: 11.0 };
const S = { group: null, loaded: false, on: false, t: 0, x: CFG.x0, err: '', tris: 0, moving: false, lights: [] };

async function load() {
  const r = await fetch(CFG.file); if (!r.ok) throw new Error('truck ' + r.status);
  const buf = await r.arrayBuffer();
  await FF.loadGLTFLoader();
  const gltf = await new Promise((res, rej) => new T.GLTFLoader().parse(buf, 'models/', res, rej));
  const g = new T.Group(); g.name = 'cattleTruck';
  const inner = gltf.scene; g.add(inner);
  inner.traverse(o => {
    if (!o.isMesh) return; const src = o.material;
    /* matte and dark: the model's own texture, pulled down into the night (a silhouette at 120 m, never a showpiece) */
    /* unlit and unfogged on purpose: at 120 m the scene's fog would take a dark body to the fog's own colour and it would vanish; as a
       flat dark body (its texture only just there) it stays a silhouette against the fog and the lit windows behind it */
    o.material = new T.MeshBasicMaterial({ color: FF.lin('#7a828a'), map: src && src.map ? src.map : null, fog: false,
      /* the far windows (ff-world-s2 farWindows) are drawn with a polygon offset that the scene's coarse depth buffer turns into some 20 m at this range, so
         they would show through a truck 16 m in front of them: the truck takes a bigger offset to stay in front of them (it is far from anything else) */
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -28 });
    o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false;
    if (o.geometry && o.geometry.index) S.tris += o.geometry.index.count / 3;
  });
  /* size: about 11 m long; the front (+x) faces the way it drives */
  inner.updateMatrixWorld(true);
  const box = new T.Box3().setFromObject(inner), sz = box.getSize(new T.Vector3()), len = Math.max(sz.x, sz.z);
  const k = CFG.len / len; inner.scale.multiplyScalar(k); inner.updateMatrixWorld(true);
  const b2 = new T.Box3().setFromObject(inner), c = b2.getCenter(new T.Vector3());
  inner.position.set(-c.x, -b2.min.y, -c.z);
  if (sz.z > sz.x) { inner.rotation.y = Math.PI / 2; inner.updateMatrixWorld(true); const b3 = new T.Box3().setFromObject(inner), c3 = b3.getCenter(new T.Vector3()); inner.position.set(inner.position.x - c3.x, inner.position.y - b3.min.y, inner.position.z - c3.z); }
  /* faint lights: two low warm headlamps, a dim amber cab marker row, a red tail pair (small glowing quads, fogged like the windows) */
  const q = (w, h, col, k2, x, y, z, ry) => { const c2 = FF.lin(col).multiplyScalar(k2); const gm = FF.glow([c2.r, c2.g, c2.b], false); gm.polygonOffset = true; gm.polygonOffsetFactor = -5; gm.polygonOffsetUnits = -32; const m = new T.Mesh(new T.PlaneGeometry(w, h), gm); m.position.set(x, y, z); m.rotation.y = ry; m.frustumCulled = false; g.add(m); S.lights.push(m); return m; };
  const fb = new T.Box3().setFromObject(g), L2 = (fb.max.x - fb.min.x) / 2, H = fb.max.y - fb.min.y;
  const zf = (fb.max.z - fb.min.z) / 2;
  for (const z of [-0.85, 0.85]) q(0.7, 0.36, '#ffd9a0', 1.1, L2 + 0.03, 0.9, z, Math.PI / 2);               // the headlamps (seen end-on when it turns)
  q(0.6, 0.32, '#ffd9a0', 0.38, L2 + 0.25, 0.95, zf + 0.05, 0);                                                // their glare, side on: a warm point at the front
  for (let i = 0; i < 5; i++) q(0.3, 0.2, '#ffae4a', 0.9, -L2 + 1.5 + i * 1.7, 1.15, zf + 0.04, 0);        // the amber side markers along the body
  for (const z of [-0.8, 0.8]) q(0.5, 0.3, '#ff3a2a', 0.8, -L2 - 0.03, 0.95, z, -Math.PI / 2);              // the tail lamps
  q(0.4, 0.3, '#ff3a2a', 0.7, -L2 - 0.05, 0.95, zf + 0.04, 0);                                              // and one side on
  g.visible = false;
  return g;
}

FF.Truck = {
  async init(ctx) {
    if (Q.get('truck') === '0') { S.err = 'off'; return; }
    try { S.group = await load(); ctx.scene.add(S.group); S.loaded = true; place(); } catch (e) { S.err = String(e && e.message || e); FF.report(e, 'Truck.init'); }
  },
  reset() { S.t = 0; S.x = CFG.x0; S.moving = false; place(); show(false); },
  frame(dt) {
    if (!S.loaded) return;
    const G = FF.G, rx = G.rabbit ? G.rabbit.x : -99;
    const want = rx > CFG.showFrom && (G.mode === 'play' || G.mode === 'end' || G.mode === 'pause');
    if (want !== S.on) show(want);
    if (!S.on || G.mode === 'pause') return;
    S.t += dt;
    S.moving = S.x < CFG.x1 - 0.01;
    if (S.moving) { /* a slow start and a slow stop */ const k = U.clamp((CFG.x1 - S.x) / 3.0, 0.15, 1) * U.clamp(S.t / 4.0, 0.1, 1); S.x = Math.min(CFG.x1, S.x + CFG.speed * k * dt); }
    place();
  },
  /* the warm-up: show it (and draw it) once whatever the place; FF.Warm calls show(false) after */
  warm(on) { if (!S.loaded) return; show(on); },
  dispose() { if (S.group && S.group.parent) S.group.parent.remove(S.group); },
  debug() { return { loaded: S.loaded, on: S.on, x: +S.x.toFixed(2), z: CFG.z, moving: S.moving, tris: S.tris, err: S.err || undefined, t: +S.t.toFixed(1) }; },
};
function place() { if (S.group) S.group.position.set(S.x, CFG.y, CFG.z); }
function show(on) { S.on = on; if (S.group) S.group.visible = on; }
})();
