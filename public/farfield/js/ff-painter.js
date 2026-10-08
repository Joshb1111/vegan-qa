/* FAR FIELD — ff-painter.js: FF.Painter, the maintenance worker in the Works' service passage (SEQUENCE-2.md §7): the one
   sign of resistance in Sequence 2, and a human presence with no chase and NO FAILURE.
   He stands at x 160.4, z -1.45, his back to the lane, scraping hand-sprayed END ANIMAL USE off the back wall under his work
   lamp. Unarmed: no gun, no torch, no backpack (the one stand-in human, role 'painter'; props a long-handled scraper and his
   tripod work lamp). His 12 s loop (FF.S2.painter.loop): scrape 8.0 (absorbed) -> stop 0.5 (the scraping stops: silence is
   the telegraph) -> turn 0.8 (head first, along the lane towards where the rabbit comes from) -> reach 1.6 (a rag from his
   trolley, looking along the passage) -> turn back 0.8 -> dip 0.3 -> scrape. It starts at loopT 2.0 on the bus event
   'painter-start' (Level's trigger passage-in, the rabbit coming up the culvert ramp), or at a checkpoint's painter.loopT; a
   checkpoint past the trigger without one starts it at 2.0. Before that he scrapes, absorbed (the loop held at 2.0).
   POLISH PASS (8 Oct, Josh's priority 1): he uses the ONE guard perception module (FF.Guard, ff-guard.js: sight + lamp-beam
   exposure with a short sustained threshold + SOUND). He HEARS even with his back turned: a run near him (loud, to ~6 m) stops the
   scraping and starts THE LOOK; the cautious walk is quiet. The look's lamp is a real beam: if the rabbit stays in it, suspicion fills
   to 1 in about a second and he PURSUES (walks after it at 2.0 m/s with the lamp, 0.35 s lunge within 1.1 m, then 'fail' {kind:
   'caught', by: 'painter'}); a run (2.75) outpaces him, the door at 166.6 stops him (he cannot follow under it), a rabbit hidden
   under the pallet or out of the beam for 2 s lets him go back to his wall. He still never calls out or shoots.
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
   Facts added: painter {phase: chase|give-up}, painter:caught {x}.
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

const P = { px: 0, pz: 0, v: 0, face0: 1, chaseT: 0, lostT: 0, lastSeen: null, lunge: 0, caught: false, started: false, loopT: 2.0, mode: 'loop', seg: null, lookT: 0, look: null, looks: 0, s: 0, grace: 0, lit: 0, litBy: '', face: 0, hard: 0, noticedAt: null, last: '' };
const LAMP = { k: 0, aim: null, lifted: false };
const CH = { speed: 2.0, accel: 4.0, grabRange: 1.1, lunge: 0.35, lungeSpeed: 1.6, reach: 0.8, lostFor: 2.0, maxT: 8.0, doorStop: 165.4, doorX: 166.2, back: 1.3, aimSpeed: 1.2, nearZ: -0.5, half: 13 };            // k: 0 on its stand .. 1 in his hand; aim: the point it lights during the look

function fact(phase, step, extra) {
  P.last = phase;
  emit('painter', Object.assign({ phase, step: step || phase, loopT: +P.loopT.toFixed(2), hard: !!P.hard, x: D().x, face: P.face }, extra || {}));
}
/* the loop segment's fact name (doc: scrape|stop|turn|reach|dip) */
function loopFact(s) { fact(s.kind === 'scrape' ? 'scrape' : s.kind, s.kind); }
const LOOK_FACT = { still: 'look', 'turn-to': 'look', 'lift-lamp': 'lift', hold: 'hold', lower: 'lower', hang: 'hang', turn: 'turn', 'scrape-hard': 'resume' };
/* the look's segments, with the hold shortened after the first time */
function lookSegs() { const again = P.looks > 1, L = PR().look; return segsOf(D().look.map(([k, d, f]) => [k, k === 'hold' ? (again ? L.holdAgain : L.hold) : d, f])); }

/* ---------------------------------------------------------------- perception (FF.Guard: sight + the lamp's beam + sound) */
function facingLane() { const sf = D().sightFacing; return P.mode === 'loop' && P.started && P.loopT >= sf.from && P.loopT < sf.to ? sf.face : 0; }
/* the way he faces and whether his lamp is lit, now: loop = along the lane only in his turn; the look = at the rabbit from the
   lifted lamp until it is lowered; the chase = at the rabbit, lamp up; the wall otherwise (no sight, but his ears work) */
function gaze(r) {
  const toR = r && r.x >= P.px ? 1 : -1;
  if (P.mode === 'loop') return { face: facingLane(), lamp: false };
  if (P.mode === 'chase') return { face: P.face0 || toR, lamp: true };
  if (P.mode === 'look' && P.seg) { const k = P.seg.kind; if (k === 'lift-lamp' || k === 'hold' || k === 'lower') return { face: P.face || toR, lamp: LAMP.k > 0.4 }; }
  return { face: 0, lamp: false };
}
function lampPitch(px) { const a = LAMP.aim; if (!a) return -10; const lx = px + 0.32 * (P.face || 1); return Math.atan2(a[1] - 1.25, Math.abs(a[0] - lx) + 1e-3) * 180 / Math.PI; }
function perceive(dt) {
  const r = G().rabbit; let e = { w: 0, src: '', d: 99 };
  if (r && G().mode === 'play' && (!r.mode || r.mode === 'play') && r.visible !== false && FF.Guard && FF.Player && FF.Player.sightPoints && !G().flags.revealSafe) {
    const g = gaze(r), lat = Math.abs(P.pz), pts = FF.Player.sightPoints();
    const A = (FF.S2.areaLights || []).find(a => a.id === D().lamp.spill);
    const areas = A && LAMP.k < 0.05 ? [{ id: A.id, x0: A.x0, x1: A.x1, on: 'always' }] : [];
    const pose = { x: P.px, y: 0, face: g.face, kneel: false, torchOn: g.lamp, pitch: lampPitch(P.px), half: CH.half };
    const heard = FF.Guard.hear(pose, FF.Guard.noiseOf(r.vx), r.x, { floorY: r.y, lat });
    if (g.face) {
      e = FF.Guard.sense(pose, pts, { x: r.x, vx: r.vx }, { floorY: r.y, cx: r.x, areas, lat });
      if (e.src === 'touch') e = { w: SI().dark.weight, src: 'dark', d: e.d };
    } else e = FF.Guard.merge({ w: 0, src: '', d: 99 }, heard);       // his back is turned: ears only
  }
  P.lit = e.w; P.litBy = e.src;
  const exposed = FF.Guard.accumulate(P, e, dt);
  if (exposed && r) P.heardAt = +r.x.toFixed(2);
  if (P.mode === 'loop' && P.s >= SI().fill.notice) startLook(r, e);
  else if (P.mode === 'look' && P.s >= 1 && P.seg && (P.seg.kind === 'hold' || P.seg.kind === 'lift-lamp')) startChase(r);
}
function startLook(r, e) {
  P.looks++; P.mode = 'look'; P.lookT = 0; P.look = lookSegs(); P.seg = null;
  P.face = r && r.x > P.px ? 1 : -1; P.noticedAt = r ? +r.x.toFixed(2) : null;
  LAMP.aim = r ? [r.x, r.y + 0.15, 0] : null;
  emit('painter:noticed', { x: P.noticedAt, src: e && e.src, d: e && +(+e.d).toFixed(2), n: P.looks });
}

/* ---------------------------------------------------------------- the chase (spotted: the lamp held on it for about a second) */
function startChase(r) {
  P.mode = 'chase'; P.seg = { kind: 'chase', dur: 1e9, t0: 0, t1: 1e9 }; P.chaseT = 0; P.lostT = 0; P.lunge = 0; P.v = 0; P.face0 = r && r.x >= P.px ? 1 : -1; P.face = P.face0;
  P.lastSeen = r ? r.x : P.px; P.s = 1; P.chases = (P.chases || 0) + 1;
  fact('chase', 'chase', { x: +P.px.toFixed(2) });
}
/* can he see it: a clear line from his lens (the lamp in his hand) to its centre sight point, the same floor, this side of the door */
function canSee(r) {
  if (!r || r.visible === false || (r.mode && r.mode !== 'play') || r.x >= CH.doorX || Math.abs(r.y) > 0.3) return false;
  const L = FF.Level; if (!L || !L.segmentBlocked) return true;
  const low = r.crouch || L.ceilingAbove(r.x, FF.RULES.rabbit.hw, r.y || 0) - (r.y || 0) < FF.RULES.rabbit.lowPoseUnder;
  const cy = (r.y || 0) + (low ? FF.RULES.rabbit.samples.crouch[1][1] : FF.RULES.rabbit.samples.stand[1][1]);
  return !L.segmentBlocked(P.px + 0.32 * (r.x >= P.px ? 1 : -1), 1.25, r.x, cy);
}
function chaseStep(dt) {
  const r = G().rabbit, vis = canSee(r);
  P.chaseT += dt;
  if (vis) { P.lastSeen = r.x; P.lostT = 0; } else P.lostT += dt;
  /* the lamp follows what he sees (his arm: CH.aimSpeed m/s) */
  if (vis && LAMP.aim) { const ax = LAMP.aim[0], d = r.x - ax; LAMP.aim[0] = ax + Math.sign(d) * Math.min(Math.abs(d), CH.aimSpeed * 2 * dt); LAMP.aim[1] = r.y + 0.15; }
  P.pz += (CH.nearZ - P.pz) * Math.min(1, dt * 3);
  const tgt = vis ? r.x : P.lastSeen, dir = Math.sign(tgt - P.px) || P.face0;
  P.face0 = dir; P.face = dir;
  if (P.lunge > 0) {                                   // the lunge: he stops and reaches (the telegraph); then it is a catch if it is still within reach
    P.lunge += dt; P.v = Math.max(0, P.v - 8 * dt); P.px = Math.max(153.2, Math.min(CH.doorStop, P.px + dir * CH.lungeSpeed * dt));      // the lunge steps in (1.6 m/s for 0.35 s: 0.56 m) and reaches 0.8
    if (P.lunge >= CH.lunge) {
      if (vis && Math.abs(r.x - P.px) <= CH.reach && !P.caught) { P.caught = true; fact('caught', 'caught', { x: +r.x.toFixed(2) }); emit('painter:caught', { x: +r.x.toFixed(2) }); emit('fail', { kind: 'caught', by: 'painter', x: +r.x.toFixed(2) }); return; }
      P.lunge = 0;
    }
  } else {
    P.v = Math.min(CH.speed, P.v + CH.accel * dt);
    if (Math.abs(tgt - P.px) > 0.08) { const nx = Math.max(153.2, Math.min(CH.doorStop, P.px + dir * P.v * dt)); stepSound(Math.abs(nx - P.px)); P.px = nx; } else P.v = 0;
    if (vis && Math.abs(r.x - P.px) < CH.grabRange && !P.caught) { P.lunge = 1e-6; }
  }
  if (r && (r.x >= CH.doorX || P.lostT >= CH.lostFor || P.chaseT >= CH.maxT)) giveUp();
}
/* his boots on the concrete while he walks after it (the ears are the HUD): one step every 0.65 m */
let stepAcc = 0;
function stepSound(d) { stepAcc += d; if (stepAcc >= 0.65) { stepAcc -= 0.65; emit('sound', { cue: 'step', x: +P.px.toFixed(2), y: 0, z: +P.pz.toFixed(2), surface: 'concrete', run: P.v > 1.7, w: 1, who: 'painter', gain: 1 }); } }
function giveUp() {
  P.mode = 'return'; P.seg = { kind: 'return', dur: 1e9, t0: 0, t1: 1e9 }; P.s = 0; P.grace = 0; P.lunge = 0; fact('give-up', 'return', { x: +P.px.toFixed(2) });
}
function returnStep(dt) {
  const home = D().x, dir = Math.sign(home - P.px) || 1; P.face0 = dir; P.face = dir;
  P.v = Math.min(CH.back, P.v + CH.accel * dt); P.pz += (D().z - P.pz) * Math.min(1, dt * 2); stepSound(Math.abs(P.v * dt));
  const left = Math.abs(home - P.px);
  if (left <= P.v * dt + 0.02) {
    P.px = home; P.v = 0; P.pz = D().z;
    P.mode = 'look'; P.lookT = 0; P.look = segsOf([['hang', 0.5], ['turn', 0.8, 'wall'], ['scrape-hard', 8.0]]); P.seg = null; P.s = 0; P.grace = 0;
  } else P.px += dir * P.v * dt;
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
    Object.assign(P, { px: D().x, pz: D().z, v: 0, face0: 1, chaseT: 0, lostT: 0, lastSeen: null, lunge: 0, caught: false, chases: 0, heardAt: null, started: false, loopT: D().anchor.loopT, mode: 'loop', seg: null, lookT: 0, look: null, looks: 0, s: 0, grace: 0, lit: 0, litBy: '', face: 0, hard: 0, noticedAt: null, last: '' });
    LAMP.k = 0; LAMP.aim = null;
    const tr = (FF.S2.triggers || []).find(t => t.id === 'passage-in');
    if (cp && cp.painter && cp.painter.loopT != null) Painter.start(cp.painter.loopT, true);
    else if (cp && tr && cp.x > tr.x0 - 0.01) Painter.start(D().anchor.loopT, true);
    P.seg = segAt(LOOP, P.loopT);
  },
  start(loopT, silent) { if (!LOOP) build(); P.started = true; P.mode = 'loop'; P.loopT = mod(loopT == null ? D().anchor.loopT : loopT, LOOP_T); P.seg = segAt(LOOP, P.loopT); if (!silent) loopFact(P.seg); },
  step(dt) {
    if (!LOOP) build();
    if (!P.px) { P.px = D().x; P.pz = D().z; }
    if (P.caught) return;                                   // frozen under the black until the restart
    if (P.mode === 'loop') {
      if (P.started) P.loopT = mod(P.loopT + dt, LOOP_T);
      const s = segAt(LOOP, P.loopT); if (s !== P.seg) { P.seg = s; if (P.started) loopFact(s); }
      P.face = facingLane(); P.hard = 0;
      perceive(dt);
    } else if (P.mode === 'look') {
      P.lookT += dt;
      const s = segAt(P.look, P.lookT);
      if (s !== P.seg) { P.seg = s; fact(LOOK_FACT[s.kind] || s.kind, s.kind, { n: P.looks }); if (s.kind === 'scrape-hard') P.hard = 1; }
      /* the lamp's beam follows the rabbit while he holds it on it, with his arm's lag (CH.aimSpeed m/s): a rabbit that keeps
         walking along the lane stays in it, one that runs leaves it. The ears work throughout. */
      const r = G().rabbit;
      if (r && LAMP.aim && (s.kind === 'lift-lamp' || s.kind === 'hold')) { const d = r.x - LAMP.aim[0]; LAMP.aim[0] += Math.sign(d) * Math.min(Math.abs(d), CH.aimSpeed * dt); LAMP.aim[1] = r.y + 0.15; }
      perceive(dt);
      if (P.mode === 'look' && P.lookT >= P.look[P.look.length - 1].t1) { P.mode = 'loop'; P.loopT = 0;   /* review fixes 8 Oct: back to the start of his scraping (a full 8 s), not to the stop: no second look a second after the first */
       P.seg = segAt(LOOP, P.loopT); P.s = 0; P.grace = 0; P.hard = 0; P.face = 0; loopFact(P.seg); }
    } else if (P.mode === 'chase') { chaseStep(dt); perceive(dt); }
    else if (P.mode === 'return') returnStep(dt);
    /* the lamp: off the stand in the look (lift .. hang), on it otherwise; in his hand for the whole chase */
    const k = P.mode === 'look' && P.seg ? P.seg.kind : '', lt = P.seg ? (P.lookT - P.seg.t0) / Math.max(1e-3, P.seg.dur) : 0;
    LAMP.k = P.mode === 'chase' || P.mode === 'return' ? 1 : k === 'lift-lamp' ? Math.min(1, lt) : (k === 'hold' || k === 'lower') ? 1 : k === 'hang' ? Math.max(0, 1 - lt) : 0;
  },
  frame(dt) {
    if (!fig) return;
    const r = G().rabbit, show = !!r && r.x > 149 && r.x < 170;     // only near the passage (a visible figure is a human to the rabbit's ears)
    const seg = P.seg || segAt(LOOP, P.loopT), kind0 = seg.kind, kind = kind0 === 'chase' ? 'hold' : kind0 === 'return' ? 'hold' : kind0, u = P.mode === 'look' ? (P.lookT - seg.t0) / Math.max(1e-3, seg.dur) : (P.loopT - seg.t0) / Math.max(1e-3, seg.dur);
    /* body yaw: the wall (-z) is PI; along the lane left 3PI/2, right PI/2: every turn passes behind him (away from the
       camera), head first, at the turn's own pace */
    const wall = Math.PI, side = P.face > 0 ? Math.PI / 2 : 1.5 * Math.PI;
    let yaw = wall, head = null, turnRate = 6;
    if (P.mode === 'loop') {
      if (kind === 'turn' && seg.facing === 'left') { yaw = 1.5 * Math.PI; turnRate = (Math.PI / 2) / seg.dur * 1.25; head = { yaw: -0.5 * (1 - u), pitch: 0 }; }
      else if (kind === 'reach') { yaw = 1.5 * Math.PI; head = { yaw: 0.15, pitch: -0.05 }; }
      else if (kind === 'turn') { yaw = wall; turnRate = (Math.PI / 2) / seg.dur * 1.25; head = { yaw: 0.35 * (1 - u), pitch: 0 }; }
    } else if (P.mode === 'chase' || P.mode === 'return') {
      yaw = P.face0 > 0 ? Math.PI / 2 : 1.5 * Math.PI; turnRate = 9; head = { yaw: 0, pitch: -0.15 };
    } else {
      if (kind === 'still') yaw = fig.yaw != null ? fig.yaw : wall;
      else if (kind === 'turn' || kind === 'scrape-hard') { yaw = wall; turnRate = (Math.PI / 2) / 0.8 * 1.25; }
      else { yaw = side; turnRate = (Math.PI / 2) / 0.6 * 1.25; head = { yaw: 0, pitch: -0.3 }; }
    }
    /* the real model (?people=models) plays its scraping clip while he scrapes; everything else is the idle clip with his head and arms layered (the stand-in poses its own bones in pose()) */
    const scraping = kind === 'scrape' || kind === 'scrape-hard' || kind === 'dip';
    const walking = P.mode === 'chase' || P.mode === 'return', lunging = P.mode === 'chase' && P.lunge > 0;
    if (walking && !lunging && P.v > 0.05) P.gait = (P.gait || 0) + P.v * dt / 0.65;
    fig.set({ visible: show, x: P.px || D().x, y: 0, z: P.pz || D().z, yaw, anim: fig.model && fig.model.guard && scraping ? 'scrape' : walking && P.v > 0.05 ? (P.v > 1.7 ? 'run' : 'walk') : 'idle', speed: walking ? P.v : 0, gait: P.gait || 0, head, turnRate });
    if (own) own.visible = show; if (lampHead && ownHead) lampHead.visible = show;
    if (show) pose(kind, u, dt);
    lamp(show);
  },
  debug() {
    if (!LOOP) build();
    return { started: P.started, mode: P.mode, loopT: +P.loopT.toFixed(2), seg: P.seg ? P.seg.kind : null, facing: facingLane() || (P.mode === 'look' ? P.face : 'wall'),
      s: +P.s.toFixed(3), lit: +P.lit.toFixed(2), litBy: P.litBy, looks: P.looks, px: +(P.px || D().x).toFixed(2), chases: P.chases || 0, caught: P.caught, heardAt: P.heardAt, lookT: P.mode === 'look' ? +P.lookT.toFixed(2) : null, lamp: +LAMP.k.toFixed(2), lifted: LAMP.lifted, hard: !!P.hard, noticedAt: P.noticedAt, last: P.last };
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
  const b = fig.bones; if (!b) return;
  if (fig.model) {
    /* a model: its clips do the scraping; the lamp arm and the rag reach are layered on its idle (ff-humans.js, s.arms: figure-space swings) */
    let arms = null;
    if (kind === 'reach') { const e = Math.sin(Math.PI * Math.min(1, u * 1.1)); arms = { L: [-0.75 * e, -0.2 * e], R: null }; }
    else if (kind === 'lift-lamp' || kind === 'hold' || kind === 'lower' || kind === 'hang') { const e = kind === 'lift-lamp' ? u : kind === 'hang' ? 1 - u : 1; arms = { L: [-0.42 * e, -1.05 * e], R: null }; }
    fig.st.arms = arms; return;
  }
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
    const sh = [P.px || D().x, 1.42, P.pz || D().z], reach = P.mode === 'chase' || P.mode === 'return' || Math.hypot(stand[0] - sh[0], stand[1] - sh[1], stand[2] - sh[2]) <= 0.85;
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
