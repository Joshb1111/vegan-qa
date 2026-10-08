/* FAR FIELD — ff-lane.js: FF.Lane, ONE lane for Sequences 1 and 2 (docs/farfield/SEQUENCE-2.md §10, §11 "The merge").
   Merges FF.S2 (ff-level-s2.js, ff-script-s2.js) into FF.S1 IN PLACE, applying FF.S2.join, so every module that reads FF.S1
   (Level, Player, Events, Camera, World, main's checkpoints) sees the whole walk from the Verge to the embankment with no
   loading. Sequence 1's file is not edited. What the join changes in FF.S1 (FF.S2.join):
     - ground: S1's points from x 126.0 on are replaced by FF.S2.ground (the slab lies flat over the channel);
     - solids: 'channel-edge' (the "not yet" stop at the channel lip) is removed;
     - section 'rest' ends at 127.2; trigger 'rest' fires only 116.0-127.0 and never auto-stops (autoStopAfter null);
     - camera zone 'rest' ends at 124.6 with no maxX; zone 'pull-out' is marked interruptible and not the end of the game;
     - then every S2 array is appended: sections, lookBlends, solids, triggers, checkpoints, camera zones, decor, occluders,
       areaLights (the S2 objects themselves, so FF.Works moving FF.S2.solids moves the merged lane's solids).
   FF.S2 keeps the Works-only data (works, painter, end, shelters, looks, join).
   Pure data work: no three.js, no DOM; loadable in node. Idempotent (FF.S1._lane marks a merged lane; a second call is a
   no-op). Load AFTER ff-level-s1.js, ff-script-s1.js, ff-rules-s2.js, ff-level-s2.js and ff-script-s2.js and BEFORE ff-level.js
   (index.html); it merges at load so main's first reads (spawn, checkpoints) already see one lane. The Search checker
   (tools/check-search.mjs) does not load it, so its 23/23 are unaffected.
   OWNER: the Sequence 2 mechanism builder. */
'use strict';
window.FF = window.FF || {};
(function () {
const byId = (list, id) => (list || []).find(o => o && o.id === id);
function amend(list, changes) {
  for (const id in changes || {}) {
    const o = byId(list, id); if (!o) continue;
    for (const k in changes[id]) { const v = changes[id][k]; if (v === null) delete o[k]; else if (v && typeof v === 'object' && !Array.isArray(v)) o[k] = Object.assign({}, v); else o[k] = v; }
  }
}
const Lane = FF.Lane = {
  merged() { return !!(FF.S1 && FF.S1._lane); },
  merge() {
    const S1 = FF.S1, S2 = FF.S2;
    if (!S1 || !S2 || !S2.join || S1._lane) return false;
    const J = S2.join;
    /* ground: S1's up to groundFrom, then S2's */
    S1.ground = S1.ground.filter(p => p[0] < J.groundFrom).concat(S2.ground.map(p => p.slice()));
    /* the channel lip's stop goes */
    S1.solids = S1.solids.filter(s => !(J.removeSolids || []).includes(s.id));
    S1.occluders = (S1.occluders || []).filter(id => !(J.removeSolids || []).includes(id));
    /* S1 entries the join amends (null removes a key: maxX, autoStopAfter) */
    amend(S1.sections, J.sections);
    amend(S1.triggers, J.triggers);
    amend(S1.camera && S1.camera.zones, J.camera);
    /* the Works appended (the same objects: FF.Works moves FF.S2.solids, the lane sees them move) */
    const cat = k => { S1[k] = (S1[k] || []).concat(S2[k] || []); };
    for (const k of ['sections', 'lookBlends', 'solids', 'triggers', 'checkpoints', 'decor', 'areaLights']) cat(k);
    S1.occluders = S1.occluders.concat((S2.occluders || []).filter(id => !S1.occluders.includes(id)));
    if (S2.camera && S2.camera.zones) S1.camera.zones = S1.camera.zones.concat(S2.camera.zones);
    S1.sections.sort((a, b) => a.x0 - b.x0);
    S1.checkpoints.sort((a, b) => a.x - b.x);
    S1._lane = { merged: 'sequence-2', x1: S2.sections[S2.sections.length - 1].x1 };
    return true;
  },
};
Lane.merge();
})();
