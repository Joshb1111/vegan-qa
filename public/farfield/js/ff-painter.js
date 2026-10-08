/* FAR FIELD — ff-painter.js: FF.Painter, the maintenance worker in the Works' service passage (SEQUENCE-2.md §7): the one
   sign of resistance in Sequence 2, and a human presence with no chase and NO FAILURE.
   He stands at x 160.4, z -1.45, his back to the lane, scraping hand-sprayed END ANIMAL USE off the back wall under his work
   lamp. Unarmed: no gun, no torch, no backpack (the one stand-in human, role 'painter'; props a long-handled scraper and his
   tripod work lamp). His 12 s loop (FF.S2.painter.loop): scrape 8.0 (absorbed) -> stop 0.5 (the scraping stops: silence is
   the telegraph) -> turn 0.8 (head first, along the lane towards where the rabbit comes from) -> reach 1.6 (a rag from his
   trolley, looking along the passage) -> turn back 0.8 -> dip 0.3 -> scrape. It starts at loopT 2.0 on the bus event
   'painter-start' (Level's trigger passage-in, the rabbit coming up the culvert ramp), or at a checkpoint's painter.loopT; a
   checkpoint past the trigger without one starts it at 2.0. Before that he scrapes, absorbed (the loop held at 2.0).
   SIGHT: Sequence 1's ONE detection model (A6), FF.AI.see with his pose ({x 160.4, y 0, face -1}, the eye 1.62), ONLY while
   he faces along the lane (loopT in FF.S2.painter.sightFacing [8.9, 11.3)); facing the wall he sees nothing of the lane.
   His lamp's spill (FF.S2.areaLights 'painter-spill', 158.4-162.4) is an area light passed as opts.areas (needs the
   'areas' option in ff-ai.js); solid cover blocks (the paint pallet); darkness only shortens the range (1.75 m in front, 0.5
   behind). 'touch' counts as close darkness (he is behind the lane, never in it). Noise never matters. Suspicion fills and
   decays as the searcher's (FF.RULES.sight.fill); at NOTICE (0.35) THE LOOK starts, and nothing else ever does.
   THE LOOK (FF.S2.painter.look, FF.RULES.painter.look): he stops dead 0.3, turns fully to the rabbit 0.6 (left, or right if
   it is behind him), lifts the lamp off its tripod 0.5 and holds its cold light on the rabbit, utterly still, 2.0 s (1.0 s
   the next time), lowers it 0.6, hangs it back 0.5, turns to the wall 0.8 and scrapes again, harder (2.2 strokes/s) for
   8.0 s; then his loop resumes at the start of his scraping (loopT 0; review fixes 8 Oct: it resumed at the stop, so a rabbit
   still in his light was looked at again a second later). He never steps, follows, calls out or reaches for the rabbit; he
   never emits 'fail'. Control stays the player's throughout.
   FACTS: painter {phase: scrape|stop|turn|reach|dip|look|lift|hold|lower|hang|resume, step, loopT, hard, x, face}
          (Audio: the scraping loop at 1.5 / 2.2 strokes/s, its stopping; Player: the ears; World: nothing needed)
          painter:noticed {x, src, d}   (the moment suspicion reached NOTICE)
   PRESENTATION: his figure (FF.Humans.create('painter'), the props hidden but for this module's scraper), posed by bone
   overrides applied after FF.Humans.frame (main's FRAME order: Painter after Humans). His lamp: World.spot('workLamp')
   (a K0 shadowed spot in the World's passage light set) on the stand aimed at the wall, lifted onto the rabbit in the look;
   the lamp head is World.prop('workLampHead') if the World builds one, else a small stand-in built here (head + tripod).
   Debug: FF.Painter.debug() (window.__ff.painter). Test hooks: setLoopT(t), start(loopT).
   OWNER: the Sequence 2 humans builder. Logic loadable in node (THREE only inside init / frame). */
'use strict';
window.FF = window.FF || {};
(function () {
const D = () => FF.S2.painter, PR = () => FF.RULES.painter, SI = () => FF.RULES.sight, G = () => FF.G || {};
const emit = (n, d) => { if (FF.bus) FF.bus.emit(n, d || {}); };
const mod = (a, n) => ((a % n) + n) % n;
function segsOf(list) { let t = 0; return list.map(([kind, dur, facing]) => { const s = { kind, dur, facing: facing || null, t0: t, t1: t + dur }; t += dur; return s; }); }
let LOOP = null, LOOK = null, LOOP_T = 12;
function build() { LOOP = segsOf(D().loop); LOOK = segsOf(D().look); LOOP_T = D().loopT || LOOP[LOOP.length - 1].t1; }
const segAt = (list, t) => { for (const s of list) if (t < s.t1) return s; return list[list.length - 1]; };

const P = { started: false, loopT: 2.0, mode: 'loop', seg: null, lookT: 0, look: null, looks: 0, s: 0, grace: 0, lit: 0, litBy: '', face: 0, hard: 0, noticedAt: null, last: '' };
const LAMP = { k: 0, aim: null, lifted: false };            // k: 0 on its stand .. 1 in his hand; aim: the point it lights during the look

function fact(phase, step, extra) {
  P.last = phase;
  emit('painter', Object.assign({ phase, step: step || phase, loopT: +P.loopT.toFixed(2), hard: !!P.hard, x: D().x, face: P.face }, extra || {}));
}
/* the loop segment's fact name (doc: scrape|stop|turn|reach|dip) */
function loopFact(s) { fact(s.kind === 'scrape' ? 'scrape' : s.kind, s.kind); }
const LOOK_FACT = { still: 'look', 'turn-to': 'look', 'lift-lamp': 'lift', hold: 'hold', lower: 'lower', hang: 'hang', turn: 'turn', 'scrape-hard': 'resume' };
/* the look's segments, with the hold shortened after the first time */
function lookSegs() { const again = P.looks > 1, L = PR().look; return segsOf(D().look.map(([k, d, f]) => [k, k === 'hold' ? (again ? L.holdAgain : L.hold) : d, f])); }

/* ---------------------------------------------------------------- sight (the A6 model, his pose) */
function facingLane() { const sf = D().sightFacing; return P.mode === 'loop' && P.started && P.loopT >= sf.from && P.loopT < sf.to ? sf.face : 0; }
function perceive(dt) {
  const r = G().rabbit, f = facingLane(); let e = { w: 0, src: '', d: 99 };
  if (f && r && G().mode === 'play' && (!r.mode || r.mode === 'play') && r.visible !== false && FF.AI && FF.AI.see && FF.Player && FF.Player.sightPoints) {
    const A = (FF.S2.areaLights || []).find(a => a.id === D().lamp.spill);
    const areas = A && LAMP.k < 0.05 ? [{ id: A.id, x0: A.x0, x1: A.x1, on: 'always' }] : [];
    e = FF.AI.see({ x: D().x, y: 0, face: f, kneel: false, torchOn: false, pitch: 0, half: 0 }, FF.Player.sightPoints(), { floorY: r.y, cx: r.x, areas });
    if (e.src === 'touch') e = { w: SI().dark.weight, src: 'dark', d: e.d };
  }
  P.lit = e.w; P.litBy = e.src;
  const F = SI().fill;
  if (e.w > 0) { P.s = Math.min(1, P.s + e.w * dt / FF.AI.fillTime(e.src, e.d)); P.grace = 0; }
  else { P.grace += dt; if (P.grace > F.grace) P.s = Math.max(0, P.s - F.decay * dt); }
  if (P.s >= F.notice) startLook(r, e);
}
function startLook(r, e) {
  P.looks++; P.mode = 'look'; P.lookT = 0; P.look = lookSegs(); P.seg = null;
  P.face = r && r.x > D().x ? 1 : -1; P.noticedAt = r ? +r.x.toFixed(2) : null;
  LAMP.aim = r ? [r.x, r.y + 0.15, 0] : null;
  emit('painter:noticed', { x: P.noticedAt, src: e && e.src, d: e && +(+e.d).toFixed(2), n: P.looks });
}

/* ---------------------------------------------------------------- figure and props (browser only) */
let fig = null, ctx = null, scraper = null, own = null, lampHead = null, ownHead = false, T = null;
function buildProps() {
  if (!fig || !T) return;
  /* the long-handled wire scraper in his right hand (continues the forearm's line) */
  const m = FF.mat({ color: '#2b2e33', roughness: 0.8 });
  const g = new T.Group(); g.name = 'painter-scraper';
  const pole = new T.Mesh(new T.CylinderGeometry(0.012, 0.012, 0.95, 6), m); pole.position.set(0, -0.40, 0.04); pole.rotation.x = 0.25; g.add(pole);
  const blade = new T.Mesh(FF.geo.box(-0.08, 0.08, -0.01, 0.01, -0.03, 0.03), m); blade.position.set(0, -0.86, 0.16); g.add(blade);
  for (const o of [pole, blade]) { o.castShadow = true; o.receiveShadow = true; }
  fig.bones.handR.add(g); scraper = g;
  /* the lamp head: the World's if it builds one, else a stand-in head on a tripod at FF.S2.painter.lamp.stand */
  const wp = FF.World && FF.World.prop ? FF.World.prop('workLampHead') : null;
  if (wp && (wp.isMesh || (wp.children && wp.children.length))) { lampHead = wp; return; }
  const [sx, sy, sz] = D().lamp.stand, legM = FF.mat({ color: '#25282c', roughness: 0.85 });
  own = new T.Group(); own.name = 'painter-tripod (stand-in)';
  for (let i = 0; i < 3; i++) { const a = i * 2.094 + 0.4, leg = new T.Mesh(new T.CylinderGeometry(0.01, 0.012, 1.52, 5), legM); leg.position.set(sx + Math.sin(a) * 0.17, sy * 0.5 - 0.02, sz + Math.cos(a) * 0.17); leg.rotation.set(Math.cos(a) * 0.22, 0, -Math.sin(a) * 0.22); leg.castShadow = true; own.add(leg); }
  ctx.scene.add(own);
  const head = new T.Group(); head.name = 'painter-lamp-head (stand-in)';
  const body = new T.Mesh(FF.geo.box(-0.09, 0.09, -0.07, 0.07, -0.06, 0.06), legM); body.castShadow = true; head.add(body);
  const lens = new T.Mesh(new T.PlaneGeometry(0.15, 0.11), FF.glow([2.4, 2.5, 2.6])); lens.position.z = 0.061; head.add(lens);
  head.position.set(sx, sy, sz); ctx.scene.add(head); lampHead = head; ownHead = true;
}
const v3 = () => new T.Vector3();
function lookAtPoint(o, p) { if (o && o.lookAt) o.lookAt(p[0], p[1], p[2]); }

const Painter = FF.Painter = {
  stub: false,
  init(c) {
    build(); ctx = c; T = c && c.THREE;
    if (FF.Humans && FF.Humans.create && T) {
      fig = FF.Humans.create('painter');
      /* A4 and SEQUENCE-2 §7: unarmed; no gun, no torch, no backpack, no coil (ff-humans.js has no 'painter' role yet) */
      Object.assign(fig.props, { pack: 0, gunSling: 0, gunAim: 0, torch: 0, coil: 0 }); if (fig.lens) fig.lens.visible = false;
      buildProps();
    }
    if (FF.bus) FF.bus.on('painter-start', d => { if (!P.started) Painter.start(d && d.arg != null ? +d.arg : D().anchor.loopT); });
    try { if (typeof window !== 'undefined' && window.__ff && !Object.getOwnPropertyDescriptor(window.__ff, 'painter')) Object.defineProperty(window.__ff, 'painter', { get: () => Painter.debug(), configurable: true }); } catch (_) {}
  },
  reset(cp) {
    if (!LOOP) build();
    Object.assign(P, { started: false, loopT: D().anchor.loopT, mode: 'loop', seg: null, lookT: 0, look: null, looks: 0, s: 0, grace: 0, lit: 0, litBy: '', face: 0, hard: 0, noticedAt: null, last: '' });
    LAMP.k = 0; LAMP.aim = null;
    const tr = (FF.S2.triggers || []).find(t => t.id === 'passage-in');
    if (cp && cp.painter && cp.painter.loopT != null) Painter.start(cp.painter.loopT, true);
    else if (cp && tr && cp.x > tr.x0 - 0.01) Painter.start(D().anchor.loopT, true);
    P.seg = segAt(LOOP, P.loopT);
  },
  start(loopT, silent) { if (!LOOP) build(); P.started = true; P.mode = 'loop'; P.loopT = mod(loopT == null ? D().anchor.loopT : loopT, LOOP_T); P.seg = segAt(LOOP, P.loopT); if (!silent) loopFact(P.seg); },
  step(dt) {
    if (!LOOP) build();
    if (P.mode === 'loop') {
      if (P.started) P.loopT = mod(P.loopT + dt, LOOP_T);
      const s = segAt(LOOP, P.loopT); if (s !== P.seg) { P.seg = s; if (P.started) loopFact(s); }
      P.face = facingLane(); P.hard = 0;
      perceive(dt);
    } else if (P.mode === 'look') {
      P.lookT += dt;
      const s = segAt(P.look, P.lookT);
      if (s !== P.seg) { P.seg = s; fact(LOOK_FACT[s.kind] || s.kind, s.kind, { n: P.looks }); if (s.kind === 'scrape-hard') P.hard = 1; }
      /* the light follows the rabbit while he holds it on it (he stays utterly still) */
      const r = G().rabbit; if (r && (s.kind === 'lift-lamp' || s.kind === 'hold')) LAMP.aim = [r.x, r.y + 0.15, 0];
      if (P.lookT >= P.look[P.look.length - 1].t1) { P.mode = 'loop'; P.loopT = 0;   /* review fixes 8 Oct: back to the start of his scraping (a full 8 s), not to the stop: no second look a second after the first */
       P.seg = segAt(LOOP, P.loopT); P.s = 0; P.grace = 0; P.hard = 0; P.face = 0; loopFact(P.seg); }
    }
    /* the lamp: off the stand in the look (lift .. hang), on it otherwise */
    const k = P.mode === 'look' && P.seg ? P.seg.kind : '', lt = P.seg ? (P.lookT - P.seg.t0) / Math.max(1e-3, P.seg.dur) : 0;
    LAMP.k = k === 'lift-lamp' ? Math.min(1, lt) : (k === 'hold' || k === 'lower') ? 1 : k === 'hang' ? Math.max(0, 1 - lt) : 0;
  },
  frame(dt) {
    if (!fig) return;
    const r = G().rabbit, show = !!r && r.x > 149 && r.x < 170;     // only near the passage (a visible figure is a human to the rabbit's ears)
    const seg = P.seg || segAt(LOOP, P.loopT), kind = seg.kind, u = P.mode === 'look' ? (P.lookT - seg.t0) / Math.max(1e-3, seg.dur) : (P.loopT - seg.t0) / Math.max(1e-3, seg.dur);
    /* body yaw: the wall (-z) is PI; along the lane left 3PI/2, right PI/2: every turn passes behind him (away from the
       camera), head first, at the turn's own pace */
    const wall = Math.PI, side = P.face > 0 ? Math.PI / 2 : 1.5 * Math.PI;
    let yaw = wall, head = null, turnRate = 6;
    if (P.mode === 'loop') {
      if (kind === 'turn' && seg.facing === 'left') { yaw = 1.5 * Math.PI; turnRate = (Math.PI / 2) / seg.dur * 1.25; head = { yaw: -0.5 * (1 - u), pitch: 0 }; }
      else if (kind === 'reach') { yaw = 1.5 * Math.PI; head = { yaw: 0.15, pitch: -0.05 }; }
      else if (kind === 'turn') { yaw = wall; turnRate = (Math.PI / 2) / seg.dur * 1.25; head = { yaw: 0.35 * (1 - u), pitch: 0 }; }
    } else {
      if (kind === 'still') yaw = fig.yaw != null ? fig.yaw : wall;
      else if (kind === 'turn' || kind === 'scrape-hard') { yaw = wall; turnRate = (Math.PI / 2) / 0.8 * 1.25; }
      else { yaw = side; turnRate = (Math.PI / 2) / 0.6 * 1.25; head = { yaw: 0, pitch: -0.3 }; }
    }
    fig.set({ visible: show, x: D().x, y: 0, z: D().z, yaw, anim: 'idle', speed: 0, head, turnRate });
    if (own) own.visible = show; if (lampHead && ownHead) lampHead.visible = show;
    if (show) pose(kind, u, dt);
    lamp(show);
  },
  debug() {
    if (!LOOP) build();
    return { started: P.started, mode: P.mode, loopT: +P.loopT.toFixed(2), seg: P.seg ? P.seg.kind : null, facing: facingLane() || (P.mode === 'look' ? P.face : 'wall'),
      s: +P.s.toFixed(3), lit: +P.lit.toFixed(2), litBy: P.litBy, looks: P.looks, lookT: P.mode === 'look' ? +P.lookT.toFixed(2) : null, lamp: +LAMP.k.toFixed(2), lifted: LAMP.lifted, hard: !!P.hard, noticedAt: P.noticedAt, last: P.last };
  },
  setLoopT(t) { Painter.start(t, true); P.s = 0; P.grace = 0; },
  /* 0 the lamp on its tripod .. 1 in his hand (the World dims the wall's words while the lamp is off the wall) */
  get lampK() { return LAMP.k; },
  get loop() { if (!LOOP) build(); return LOOP; },
  dispose() { if (own && ctx) ctx.scene.remove(own); if (lampHead && ownHead && ctx) ctx.scene.remove(lampHead); },
};

/* ---------------------------------------------------------------- the pose (bone overrides after FF.Humans.frame) */
let strokeT = 0;
function pose(kind, u, dt) {
  const b = fig.bones; if (!b || fig.model) return;
  const hard = P.hard ? 1 : 0, hz = hard ? PR().hardStrokeHz : PR().strokeHz;
  const scraping = kind === 'scrape' || kind === 'scrape-hard' || kind === 'dip';
  if (scraping) strokeT += dt;
  const sw = Math.sin(strokeT * 2 * Math.PI * hz), k = (kind === 'dip') ? 0.4 : 1;
  if (scraping) {
    /* both hands on the long handle, the blade on the wall at chest height: strokes up and down */
    b.spine.rotation.x += 0.10 + 0.04 * hard; b.chest.rotation.x += 0.05;
    b.upperArmR.rotation.x = -0.95 - 0.22 * sw * k; b.foreArmR.rotation.x = -0.55 + 0.10 * sw * k; b.upperArmR.rotation.z = 0.15;
    b.upperArmL.rotation.x = -0.75 - 0.18 * sw * k; b.foreArmL.rotation.x = -0.75 + 0.08 * sw * k; b.upperArmL.rotation.z = -0.25;
    b.head.rotation.x += 0.08;
    if (kind === 'dip') { b.spine.rotation.x += 0.25 * Math.sin(Math.PI * u); }
  } else if (kind === 'stop') {
    /* straightens, the scraper lowered: still */
    const e = Math.min(1, u * 2);
    b.upperArmR.rotation.x = -0.95 * (1 - e) - 0.15 * e; b.foreArmR.rotation.x = -0.55 * (1 - e) - 0.2 * e;
    b.upperArmL.rotation.x = -0.75 * (1 - e); b.foreArmL.rotation.x = -0.75 * (1 - e);
    b.spine.rotation.x -= 0.03 * e;
  } else if (kind === 'reach') {
    /* the left hand out to the trolley for a rag */
    const e = Math.sin(Math.PI * Math.min(1, u * 1.1));
    b.upperArmL.rotation.x = -0.25 - 0.75 * e; b.foreArmL.rotation.x = -0.2; b.upperArmL.rotation.z = 0.15 * e;
    b.upperArmR.rotation.x = -0.15; b.foreArmR.rotation.x = -0.2;
    b.spine.rotation.x += 0.12 * e;
  } else if (kind === 'turn' || kind === 'still' || kind === 'turn-to') {
    b.upperArmR.rotation.x = -0.15; b.foreArmR.rotation.x = -0.25;
  } else if (kind === 'lift-lamp' || kind === 'hold' || kind === 'lower' || kind === 'hang') {
    /* the lamp lifted off its tripod into his left hand and held close at chest height, the elbow bent, aimed down at the
       rabbit; the other arm hangs; utterly still. Review fixes 8 Oct: not held out at arm's length (it read as pointing) */
    const e = kind === 'lift-lamp' ? u : kind === 'hang' ? 1 - u : 1;
    b.upperArmL.rotation.x = -0.1 - 0.42 * e; b.foreArmL.rotation.x = -0.15 - 1.05 * e; b.upperArmL.rotation.z = 0.12 * e;
    b.upperArmR.rotation.x = -0.08; b.foreArmR.rotation.x = -0.12;
    b.spine.rotation.x += 0.03 * e; b.head.rotation.x += 0.12 * e;
  }
  if (scraper) scraper.visible = true;
}
/* ---------------------------------------------------------------- the lamp: its head, its light */
function lamp(show) {
  const L = D().lamp, h = FF.World && FF.World.spot ? FF.World.spot('workLamp') : null;
  const stand = lampHead && lampHead.userData && lampHead.userData.base ? [lampHead.userData.base.x, lampHead.userData.base.y, lampHead.userData.base.z] : L.stand;
  let pos = stand.slice(), tgt = L.aim.slice();
  if (LAMP.k > 0 && fig && T) {
    const k = LAMP.k * LAMP.k * (3 - 2 * LAMP.k);
    /* within his reach (0.85 m from his shoulder) he lifts the head off the tripod into his left hand; further off he swings
       it round on its stand (his arm out to it), so the lamp never flies: either way its light comes onto the rabbit */
    const sh = [D().x, 1.42, D().z], reach = Math.hypot(stand[0] - sh[0], stand[1] - sh[1], stand[2] - sh[2]) <= 0.85;
    if (reach) { const hand = v3(); fig.bones.handL.updateMatrixWorld(true); fig.bones.handL.getWorldPosition(hand); pos = [stand[0] + (hand.x - stand[0]) * k, stand[1] + (hand.y - 0.05 - stand[1]) * k, stand[2] + (hand.z - stand[2]) * k]; }
    if (LAMP.aim) tgt = [tgt[0] + (LAMP.aim[0] - tgt[0]) * k, tgt[1] + (LAMP.aim[1] - tgt[1]) * k, tgt[2] + (LAMP.aim[2] - tgt[2]) * k];
    LAMP.lifted = reach;
  }
  if (lampHead) { lampHead.position.set(pos[0], pos[1], pos[2]); lookAtPoint(lampHead, tgt); }
  if (h) {
    const lk = (FF.S2.looks.passage.lights || {}).workLamp || { color: '#e6ecf1', intensity: 9, angle: 40, penumbra: 0.45 };
    if (h.on) h.on(!!show);
    if (show) h.set({ pos, target: tgt, angle: (LAMP.k > 0.5 ? 26 : lk.angle) * Math.PI / 180, penumbra: lk.penumbra, intensity: lk.intensity, color: lk.color, distance: 14, decay: 1.6 });
  }
}
})();
