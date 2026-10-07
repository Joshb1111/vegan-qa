/* foot slide, in-page half (t-slide.mjs). Contact is judged by HEIGHT (a foot within TH of the lowest it gets over the run is
   on the ground), independent of the gait's own planted flags; slide = its speed over the ground (m/s) on consecutive ground
   samples (every presented frame, 60 fps). Also the largest single-frame jump of a foot on the ground (a pop). */
window.SLIDE = (function () {
  const map = { hindL: 'hind_foot_L', hindR: 'hind_foot_R', foreL: 'front_paw_L', foreR: 'front_paw_R' }, v = new THREE.Vector3();
  let B = null;
  function feet() {
    if (!B) { B = {}; __ff.scene.getObjectByName('rabbit').traverse(o => { if (o.isBone) B[o.name] = o; }); }
    const proc = FF.Rabbit.last && FF.Rabbit.last.kind === 'procedural', out = {};
    for (const k in map) { const b = B[map[k]]; if (!b) continue; b.updateWorldMatrix(true, false); if (proc && /^hind/.test(k)) { v.set(0, -0.003, 0.108); b.localToWorld(v); } else b.getWorldPosition(v); out[k] = [v.x, v.y, v.z]; }
    return out;
  }
  function rabbit(n, TH) {
    TH = TH || 0.006; const rec = {}; for (const k in map) rec[k] = [];
    for (let i = 0; i < n; i += 2) { __ff.step(2, false); __ff.flush(); const f = feet(), g = FF.G.rabbit; for (const k in rec) if (f[k]) rec[k].push([f[k][0], f[k][1] - g.y, f[k][2]]); }
    __ff.draw();
    const out = {};
    for (const k in rec) {
      const r = rec[k], mn = Math.min(...r.map(p => p[1])); let sl = 0, c = 0, worst = 0, pop = 0;
      for (let i = 1; i < r.length; i++) {
        const d = Math.hypot(r[i][0] - r[i - 1][0], r[i][2] - r[i - 1][2]);
        if (r[i][1] < mn + TH && r[i - 1][1] < mn + TH) { sl += d * 60; c++; worst = Math.max(worst, d * 60); }
        if (Math.min(r[i][1], r[i - 1][1]) < mn + TH) pop = Math.max(pop, Math.hypot(d, r[i][1] - r[i - 1][1]));
      }
      out[k] = { slide: c ? +(sl / c).toFixed(3) : 0, worst: +worst.toFixed(3), pop: +pop.toFixed(4), ground: +(c / Math.max(1, r.length - 1)).toFixed(2) };
    }
    return out;
  }
  /* the human figures' feet: slide while a foot is the lowest (planted) */
  function humans(n) {
    const figs = FF.Humans.figures.filter(f => f.st.visible), rec = figs.map(() => ({ L: [], R: [] }));
    for (let i = 0; i < n; i += 2) { __ff.step(2, false); __ff.flush(); figs.forEach((f, k) => { for (const s of ['L', 'R']) { f.bones['foot' + s].getWorldPosition(v); rec[k][s].push([v.x, v.y - (f.st.y || 0), v.z]); } }); }
    __ff.draw();
    return figs.map((f, k) => { const o = { role: f.role, anim: f.st.anim };
      for (const s of ['L', 'R']) { const r = rec[k][s], mn = Math.min(...r.map(p => p[1])); let sl = 0, c = 0; for (let i = 1; i < r.length; i++) if (r[i][1] < mn + 0.006 && r[i - 1][1] < mn + 0.006) { sl += Math.hypot(r[i][0] - r[i - 1][0], r[i][2] - r[i - 1][2]) * 60; c++; } o[s] = { slide: c ? +(sl / c).toFixed(3) : 0, ground: +(c / Math.max(1, r.length - 1)).toFixed(2) }; }
      return o; });
  }
  return { feet, rabbit, humans };
})();
true;
