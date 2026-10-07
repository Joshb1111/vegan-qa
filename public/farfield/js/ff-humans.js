/* FAR FIELD — ff-humans.js: FF.Humans, the temporary stand-in figures: ONE human model for all three people (A4; roles show
   or hide props: the Verge person and the searcher carry a torch and a slung long gun, the walkway worker a coil of cable and
   nothing else), procedural animation (patrol walk, walk-search, stop/notice, turn, kneel, crouch-look, climb, run, aim,
   lunge, reach, unlock, torch-down, rail-look-out, shake-sheet), torch alignment to a World light handle, and the van.
   Model slots: models/models.json "human" / "van" (ASSETS-3D.md); no file = the stand-ins.
   OWNER: the humans + events builder. API contract: docs/farfield/INTERFACES.md §8.5. SKELETON: a static dark silhouette per
   figure (cap, backpack, gun, torch) that moves, faces and bobs; a boxy van. No skinning or clips yet. */
'use strict';
window.FF = window.FF || {};
(function () {
const T = THREE;
let ctx = null, mat = null, lensMat = null;
const figures = [], vans = [];

function standIn(role) {
  const B = FF.geo.box, C = FF.geo.cyl, parts = [];
  parts.push(B(-0.13, -0.02, 0, 0.86, -0.08, 0.08), B(0.02, 0.13, 0, 0.86, -0.08, 0.08));           // legs
  parts.push(B(-0.14, -0.01, 0, 0.1, -0.08, 0.16), B(0.01, 0.14, 0, 0.1, -0.08, 0.16));            // boots
  parts.push(C(0.2, 0.62, 0, 0.84, 0, 14, 0.17));                                                   // jacket torso
  parts.push(C(0.055, 0.1, 0, 1.46, 0, 10));                                                        // neck
  { const g = new T.SphereGeometry(0.11, 14, 10); g.translate(0, 1.6, 0.01); parts.push(g); }       // head
  parts.push(C(0.12, 0.07, 0, 1.68, 0, 14), B(-0.1, 0.1, 1.68, 1.705, 0.06, 0.2));                 // cap + forward brim
  parts.push(B(-0.24, -0.17, 0.82, 1.42, -0.05, 0.05), B(0.17, 0.24, 0.82, 1.42, -0.05, 0.05));     // arms (hanging)
  if (role !== 'worker') {
    parts.push(B(-0.16, 0.16, 0.92, 1.34, -0.33, -0.12), C(0.07, 0.34, 0, 1.36, -0.22, 10));         // backpack + rolled mat
    const gun = B(-0.012, 0.012, -0.48, 0.48, -0.012, 0.012); gun.rotateZ(0.5); gun.translate(0.05, 1.12, -0.36); parts.push(gun);   // long gun slung across the back, muzzle up
    parts.push(B(0.2, 0.26, 0.86, 0.98, 0.0, 0.14));                                                  // torch in the hand
  } else {
    const coil = new T.TorusGeometry(0.16, 0.035, 6, 14); coil.rotateY(Math.PI / 2); coil.translate(-0.18, 1.2, 0); parts.push(coil);  // cable coil over a shoulder
  }
  return FF.geo.merge(parts);
}

const Humans = FF.Humans = {
  stub: true,
  init(c) { ctx = c; mat = FF.mat({ color: '#1a1d21', roughness: 0.9, rim: true }); lensMat = FF.glow([4, 4.2, 4.4]); },
  /* a figure: role 'verge' | 'worker' | 'searcher' */
  create(role) {
    const g = new T.Group(); g.name = 'human:' + role;
    const body = new T.Mesh(standIn(role), mat); body.castShadow = true; body.receiveShadow = true; g.add(body);
    const lens = new T.Mesh(new T.CircleGeometry(0.03, 10), lensMat); lens.position.set(0.23, 0.92, 0.145); lens.visible = role !== 'worker'; g.add(lens);
    g.visible = false; ctx.scene.add(g);
    const f = {
      role, object: g, st: { x: 0, y: 0, z: 0, face: -1, anim: 'idle', torch: { on: false, pitch: -20, half: 13 }, visible: false, phase: 0, speed: 0 },
      /* pose and look for this frame (see INTERFACES §8.5 for the anim names) */
      set(o) { Object.assign(f.st, o); if (o.torch) f.st.torch = Object.assign({}, f.st.torch, o.torch); return f; },
      /* world positions the AI and the lights use */
      eye() { const s = f.st; return new T.Vector3(s.x, s.y + (s.anim === 'kneel' || s.anim === 'crouch-look' ? FF.RULES.sight.kneelEye : FF.RULES.sight.eye), s.z); },
      torchLens() { const s = f.st, k = s.anim === 'kneel' || s.anim === 'crouch-look', R = FF.RULES.sight.torch; return new T.Vector3(s.x + (k ? R.kneelFwd : R.fwd) * (s.face || 0), s.y + (k ? R.kneelH : R.h), s.z); },
      /* keep a World spot handle on the torch lens, pointing at the lane (A16: the axis meets z 0 at the 2D aim point) */
      attachTorch(handle) { f.torchHandle = handle; return f; },
      dispose() { ctx.scene.remove(g); body.geometry.dispose(); },
    };
    figures.push(f); return f;
  },
  createVan() {
    const B = FF.geo.box, C = FF.geo.cyl, parts = [B(-2.6, 1.1, 0.45, 2.45, -1.0, 1.0), B(1.1, 2.6, 0.45, 1.6, -1.0, 1.0), B(1.1, 2.0, 1.6, 2.2, -0.95, 0.95)];
    for (const [x, z] of [[-1.7, -1.0], [-1.7, 1.0], [1.7, -1.0], [1.7, 1.0]]) { const w = C(0.37, 0.24, 0, -0.12, 0, 16); w.rotateX(Math.PI / 2); w.translate(x, 0.37, z); parts.push(w); }
    const g = new T.Group(); g.name = 'van'; const m = new T.Mesh(FF.geo.merge(parts), FF.mat({ color: '#24282d', roughness: 0.8 })); m.castShadow = true; g.add(m); g.visible = false; ctx.scene.add(g);
    const v = { object: g, st: { x: 0, z: -8.5, yaw: 0, visible: false }, set(o) { Object.assign(v.st, o); return v; }, headlightAnchors() { return [new T.Vector3(2.62, 0.8, -0.7).applyMatrix4(g.matrixWorld), new T.Vector3(2.62, 0.8, 0.7).applyMatrix4(g.matrixWorld)]; } };
    vans.push(v); return v;
  },
  reset() {},
  frame(dt) {
    for (const f of figures) {
      const s = f.st, g = f.object; g.visible = !!s.visible; if (!s.visible) continue;
      s.phase += dt * (s.speed || 0) * 1.6;
      g.position.set(s.x, s.y + (s.speed ? Math.abs(Math.sin(s.phase * Math.PI)) * 0.025 : 0), s.z);
      g.rotation.y = s.face ? Math.PI / 2 * s.face : 0;
      g.scale.y = s.anim === 'kneel' || s.anim === 'crouch-look' ? 0.62 : 1;
      if (f.torchHandle) {
        if (f._torchOn !== !!s.torch.on) { f._torchOn = !!s.torch.on; f.torchHandle.on(f._torchOn); }
        /* A16: the 2D aim point is where the 2D beam axis reaches rabbit height (y 0.12) or 8 m; the 3D axis meets the lane there */
        const lens = f.torchLens(), p = (s.torch.pitch || 0) * Math.PI / 180, d = Math.sin(p) < -0.02 ? Math.min(8, (lens.y - 0.12) / -Math.sin(p)) : 8;
        const tx = lens.x + Math.cos(p) * d * (s.face || 1), ty = lens.y + Math.sin(p) * d;
        f.torchHandle.set({ pos: [lens.x, lens.y, lens.z], target: [tx, ty, 0], angle: (s.torch.half || 13) * Math.PI / 180 * 1.15, penumbra: 0.3, intensity: s.torch.on ? 26 : 0, color: '#e8edf2', distance: 14 });
      }
    }
    for (const v of vans) { v.object.visible = !!v.st.visible; v.object.position.set(v.st.x, 0, v.st.z); v.object.rotation.y = v.st.yaw || 0; }
  },
  get figures() { return figures; },
  dispose() { for (const f of figures) f.dispose(); },
  debug() { return { stub: true, figures: figures.map(f => ({ role: f.role, x: +f.st.x.toFixed(2), anim: f.st.anim, visible: f.st.visible })) }; },
};
})();
