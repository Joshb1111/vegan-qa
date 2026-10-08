/* FAR FIELD — ff-audio.js: FF.Audio, the sound engine. Synthesised Web Audio, nothing to download. Restrained: no stings,
   no music until the warm pad in the breathing space, no rabbit distress sounds, no words, no other animals. Sound is a
   main cue for danger, so footsteps (by surface, distance and side) and the torch read clearly by ear; every danger sound
   still has a visual twin (the arcade starts muted).
   OWNER: the audio + UI + room builder. API contract: docs/farfield/INTERFACES.md §8.8. Design: SEQUENCE-1.md §15 (as amended).

   TWO LAYERS
   1. The scene (no AudioContext needed, so it runs the same muted, with ?mute=1 and in tests): it derives what is heard
      from shared state and the bus: every human's footsteps from their movement (FF.G.searcher; FF.Humans.figures for the
      Verge person and the walkway worker), silent the moment they stop; the searcher's torch, NOTICE drone, sharp breath,
      aim click; the van from its object (or a fallback path); the rabbit's paws, squeezes, poses, breath and heartbeat;
      the box; the Verge, walkway and entry beats (from Level triggers, timed from FF.S1.verge / .walkway / .searcher.entry,
      or from Events' phase events); the far boom, the machinery rhythm and the Works thud every 4.0 s (emitted as the bus
      fact 'thud' {n}). FF.Audio.sources() lists what is audible at the rabbit, for the ears (A2).
   2. The engine (only after unlock(), never with FF.SILENT, never while muted): beds per place blended by
      FF.Level.lookBlend (rain on grass, the drain, the hall, the yard, the rest), positional landmark loops (rain on the
      gate, the gully trickle, the opening's draught, the floodlight buzz, the wind in the fence corner), two cross-faded
      reverbs, and every cue synthesised on demand.

   MIX:  master (mute, hidden) <- world (follows G.fade: the cut to black silences it on the same frame)
                                     <- amb (beds; N toggles it with the music) <- sfx (cues) <- reverb returns
                               <- over (the shot or the scuff: heard UNDER the black)   <- music (the pad, the end chord)
   M = all sound (FF.Game.setMute -> mute). N = ambience and music (setMusic -> music): the beds, the pad and the end chord;
   every cue stays (footsteps, engine, torch, doors, chain, thud, drone). Main owns the keys, storage and the parent protocol.

   CUES (FF.bus 'sound' {cue, x, y, z, gain, surface, run, id, loop, dur, hard}, or FF.Audio.play(cue, opts)):
     humans   step {surface: grass|gravel|concrete|wet|steel|grate|deck, run, w}  breath  lunge  reach  scuff  kneel
     vehicle  engine (loop)  brakes  door-slam
     verge    chain {dur, hard}  gate-jolt  lock-gives  gate-slide  gate-close  slab-scrape  torch-click
     yard     door-open  door-shut  relay  fence-clatter  fence-shake  aim-click  tick
     world    far-boom  machine  thud  horn  drip
     rabbit   paw {surface: grass|wet|concrete|water|wood|metal}  land {h}  splash  sniff  groom  nibble  shake  settle
              rbreath  heart  claw  box-tok  box-stop
     fail     shot  scuff  squeak (a caught rabbit: tiny, restrained)  (played on the 'fail' event; nothing else is heard in the black)
     opening  tin-clang  far-clang  tumble
     music    end-chord (FF.Audio.endChord())   the pad starts at the rest's groom
   Loops by id: 'sound' {id, cue, loop: true, x, y, z, gain, ...} starts or moves one; {id, loop: false} stops it.
   An explicit 'sound' with a cue name switches OFF the scene's own derivation of that cue (and a 'step' with id 'searcher',
   'verge' or 'worker' switches off that person's derived steps), so a module that emits its own cues is never doubled.

   EVENTS READ: fail, restart, mode, place, transit, rabbit:land, rabbit:pose, rabbit:reach-fail, box, entry, ai:state,
   vehicle-arrive, gate-lit, person-out, rabbit-in-pipe, walkway-timer, sound-cue, vehicle {phase}, gate {phase},
   walkway {phase}, torch-down {phase}, end {phase}, checkpoint. Phase names are matched loosely (see onPhase()).
   EMITTED: every cue the scene derives that a person or the world makes (footsteps, engine, torch, doors, chain, the
   thud, ...) is published as 'sound' {cue, x, y, z, gain, id, src: 'audio'} so the rabbit's ears react to what is heard
   (Player) and the World can pulse the stack with the thud; loops are re-published every 0.5 s with loop: true and end
   with {stop: true, gain: 0}. The rabbit's own sounds are never published. 'sound' events with src 'audio' are ignored here.

   Optional samples: FF.AUDIO_SAMPLES = { <cue>: 'audio/<cue>.ogg', ... } set before boot replaces that cue with a file
   (fetched only when named: no probing, no 404s).
   EXTENSIONS (Sequence 2 and later; nothing here changes Sequence 1): a file loaded after this one pushes an object onto
   FF.AUDIO_EXT ({name, install(X), debug()}); init() calls install(X) with the engine's internals X (the cue, loop, bed,
   reverb, salience and trim tables, cue(), hold(), later(), spatial(), listener(), the scene D, the settings st, the live
   engine X.E) and these hooks: X.derive (called every play / title frame after Sequence 1's derivations), X.walls (applied
   in spatial() to sources marked {s2: true} only), X.mix (the bed mix after mixNow), X.surface (the rabbit's surface; a
   hook returns null outside its own stretch), X.land (a landing it plays itself), X.failCue ({kind: cue} for the black),
   X.rest (places where the breathing-space behaviours apply: breath, close miking, the warm pad at the groom). A loop may
   go on the ambience bus (hold(..., 'amb'): N removes it); a cue with {noPub: true} is not published for the ears.
   ff-audio-s2.js (FF.AudioS2) is the Sequence 2 soundscape.
   Test hooks: FF.Audio.level() (master RMS / peak), FF.Audio.renderOffline(seconds, tick) (an OfflineAudioContext run of
   the same engine, driven by tick(dt)), debug(). */
'use strict';
window.FF = window.FF || {};
(function () {
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const GG = () => FF.G || {};
/* a private PRNG: audio never draws from FF.rng, so play stays identical with or without sound */
let rseed = 0x2545f491;
const rnd = () => { let t = (rseed += 0x6D2B79F5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();

const st = { unlocked: false, muted: false, music: true, hidden: false, heard: {}, explicit: {}, made: 0, failed: '' };
let E = null;              // the live engine (null until unlock() while unmuted; never with FF.SILENT)
let liveE = null;          // kept while an offline render borrows E

/* ================================================================== the engine (one per AudioContext, live or offline) */
function noiseBuf(ac, sec, kind, ch) {
  const sr = ac.sampleRate, n = Math.floor(sec * sr), xf = 2048, b = ac.createBuffer(ch || 1, n, sr);
  for (let c = 0; c < (ch || 1); c++) {
    const d = new Float32Array(n + xf); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n + xf; i++) {
      const w = rnd() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09; b6 = w * 0.115926; }
      else { br = (br + 0.02 * w) / 1.02; d[i] = br * 3.2; }
    }
    const o = b.getChannelData(c);
    for (let i = 0; i < n; i++) o[i] = i < xf ? d[i] * (i / xf) + d[n + i] * (1 - i / xf) : d[i];   // seamless loop
  }
  return b;
}
/* heavy rain on grass: a soft wash plus thousands of drops (mostly tiny, a few heavy); stereo, seamless */
function rainBuf(ac, sec, density, tin) {
  const sr = ac.sampleRate, n = Math.floor(sec * sr), b = ac.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let p = 0, lp = 0;
    if (!tin) for (let i = 0; i < n; i++) { const w = rnd() * 2 - 1; p = 0.97 * p + 0.03 * w; lp = 0.6 * lp + 0.4 * w; d[i] = (lp - p) * 0.16; }
    const drops = Math.floor(sec * density);
    for (let k = 0; k < drops; k++) {
      const at = Math.floor(rnd() * n), big = rnd(), a = (tin ? 0.18 : 0.12) * Math.pow(big, 3) + 0.012;
      const f = tin ? rr(1800, 4600) : rr(2400, 7000), L = Math.floor((tin ? rr(0.012, 0.045) : rr(0.002, 0.009)) * sr), k1 = 5 / L;
      const w0 = 2 * Math.PI * f / sr, cw = Math.cos(w0), sw = Math.sin(w0), dk = Math.exp(-k1); let e = a, sx = Math.sin(rnd() * 6), cx = Math.sqrt(1 - sx * sx);
      for (let i = 0; i < L; i++) { const v = tin ? sx : (rnd() * 2 - 1) * 0.7 + sx * 0.3; d[(at + i) % n] += v * e; e *= dk; const t2 = sx * cw + cx * sw; cx = cx * cw - sx * sw; sx = t2; }
    }
    let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i])); const s = 0.9 / (pk || 1); for (let i = 0; i < n; i++) d[i] *= s;
  }
  return b;
}
/* impulse responses: filtered noise with an exponential tail and a few early reflections */
const VERB = {
  open:  { dur: 0.8, bright: 5200, early: 0.10, ret: 0.45 },
  wet:   { dur: 0.75, bright: 3000, early: 0.35, ret: 0.7 },
  hall:  { dur: 3.2, bright: 4200, early: 0.12, ret: 0.85 },
  metal: { dur: 0.9, bright: 7000, early: 0.30, ret: 0.6, comb: 0.0034 },
  yard:  { dur: 1.3, bright: 4600, early: 0.18, ret: 0.55 },
  soft:  { dur: 1.2, bright: 2600, early: 0.06, ret: 0.45 },
};
function makeIR(ac, type) {
  const P = VERB[type], sr = ac.sampleRate, n = Math.floor(P.dur * sr), b = ac.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c), dk = Math.exp(-6.9 / (P.dur * sr)), ramp = 0.004 * sr; let lp = 0, env = 1, a = 0;
    for (let i = 0; i < n; i++) {
      if ((i & 63) === 0) { const t = i / sr, fc = P.bright * Math.exp(-t / P.dur * 1.6) + 300; a = Math.exp(-2 * Math.PI * fc / sr); }
      lp = a * lp + (1 - a) * (rnd() * 2 - 1); d[i] = lp * env * (i < ramp ? i / ramp : 1); env *= dk;
    }
    for (let k = 0; k < 7; k++) { const at = Math.floor(rr(0.006, 0.045) * sr); if (at < n) d[at] += (rnd() < 0.5 ? -1 : 1) * P.early * rr(0.5, 1); }
    if (P.comb) { const dl = Math.floor(P.comb * sr); for (let i = dl; i < n; i++) d[i] += d[i - dl] * 0.55; }
  }
  return b;
}
const BEDS = {   // per look: non-positional atmosphere (amb) + which landmark loops are possible + reverb
  'verge':      { rain: 0.20, rainLP: 7500, wind: 0.22, hum: 0.08, hall: 0.0, drips: 0.0, mach: 1, verb: 'open' },
  'verge-late': { rain: 0.22, rainLP: 7000, wind: 0.27, hum: 0.09, hall: 0.0, drips: 0.0, mach: 1, verb: 'open' },
  'drain':      { rain: 0.09, rainLP: 650,  wind: 0.03, hum: 0.07, hall: 0.0, drips: 0.6, mach: 0.4, verb: 'wet' },
  'courtyard':  { rain: 0.04, rainLP: 1500, wind: 0.02, hum: 0.08, hall: 0.07, drips: 0.45, mach: 0, verb: 'hall' },
  'duct':       { rain: 0.0,  rainLP: 900,  wind: 0.0,  hum: 0.06, hall: 0.0, drips: 0.0, mach: 0, verb: 'metal' },
  'search':     { rain: 0.0,  rainLP: 3000, wind: 0.08, hum: 0.07, hall: 0.0, drips: 0.35, mach: 0, verb: 'yard' },
  'rest':       { rain: 0.0,  rainLP: 3000, wind: 0.10, hum: 0.03, hall: 0.0, drips: 0.2, mach: 0, verb: 'soft' },
};
/* positional landmark loops (on the cue bus: they carry information, so N never removes them) */
const MARKS = [
  { id: 'gateRain', kind: 'tin',      x: 33.0,  y: 1.0,  z: -4.0, gain: 0.45, place: /verge/ },
  { id: 'gully',    kind: 'trickle',  x: 38.75, y: -0.4, z: -0.3, gain: 1.4,  place: /verge|drain/ },
  { id: 'pipe',     kind: 'trickle',  x: 0,     y: -0.9, z: -0.2, gain: 1.0,  place: /drain/, follow: [43.0, 53.4] },
  { id: 'draught',  kind: 'whistle',  x: 76.0,  y: 0.98, z: -0.45, gain: 1.5, place: /courtyard/, f: 1150, q: 7 },
  { id: 'flood',    kind: 'mains',    x: 104.3, y: 6.1,  z: -2.2, gain: 1.0,  place: /search|rest/ },
  { id: 'fenceWind',kind: 'whistle',  x: 113.25,y: 0.25, z: -0.5, gain: 1.4,  place: /search|rest/, f: 1650, q: 9 },
];

function Engine(ac, sync) {
  const E = this; E.ac = ac; E.loops = new Map(); E.ends = []; E.trash = []; E.samples = {}; E.offline = typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext;
  const g = E.g = (v, to) => { const n = ac.createGain(); n.gain.value = v; if (to) n.connect(to); return n; };
  E.lim = ac.createDynamicsCompressor(); E.lim.threshold.value = -3; E.lim.knee.value = 2; E.lim.ratio.value = 12; E.lim.attack.value = 0.002; E.lim.release.value = 0.2; E.lim.connect(ac.destination);
  E.master = g(0, E.lim);
  E.ana = ac.createAnalyser(); E.ana.fftSize = 2048; E.master.connect(E.ana);
  E.world = g(1, E.master); E.over = g(1, E.master); E.music = g(0, E.master);
  E.amb = g(1, E.world); E.sfx = g(1, E.world);
  E.verbIn = g(1); E.verb = [0, 1].map(() => { const c = ac.createConvolver(), o = g(0, E.world); E.verbIn.connect(c); c.connect(o); return { c, o, type: null }; }); E.verbCur = -1; E.verbType = null; E.verbAmt = 0.5;
  E.buf = { white: noiseBuf(ac, 2, 'white'), pink: noiseBuf(ac, 3, 'pink'), brown: noiseBuf(ac, 3, 'brown') };   /* what every cue needs, now */
  E.irs = {}; E.bed = null; E.dripNext = ac.currentTime + 0.5; E.mix = null;
  /* the heavier things (the rain, every room's reverb, the beds) are made over the next frames, so the user's gesture that
     unlocked sound never stalls the picture; offline renders build them at once */
  const work = [() => { E.buf.rain = rainBuf(ac, 3, 1200); }, () => { E.buf.tin = rainBuf(ac, 2.5, 260, true); }, () => { E.bed = buildBeds(E); }]
    .concat(Object.keys(VERB).filter(k => !VERB[k].lazy).map(k => () => { if (!E.irs[k]) E.irs[k] = makeIR(ac, k); }));   // a later sequence's rooms ({lazy}) are made when it asks (X.prepare)
  if (sync) work.forEach(f => f());
  else { const next = () => { if (E.dead || !work.length) return; try { work.shift()(); } catch (e) { FF.report(e, 'Audio.prepare'); } setTimeout(next, 20); }; setTimeout(next, 20); }
  if (FF.AUDIO_SAMPLES && !E.offline) for (const k in FF.AUDIO_SAMPLES) loadSample(E, k, FF.AUDIO_SAMPLES[k]);
}
function loadSample(E, cue, url) {
  try { fetch(url).then(r => r.ok ? r.arrayBuffer() : null).then(a => a && E.ac.decodeAudioData(a)).then(b => { if (b) E.samples[cue] = b; }).catch(() => {}); } catch (_) {}
}
const P = Engine.prototype;
P.now = function () { return this.ac.currentTime; };
/* a param towards a value without piling up identical automation */
P.to = function (param, v, tc) { if (param._ffv !== undefined && Math.abs(param._ffv - v) < 1e-4) return; param._ffv = v; param.setTargetAtTime(v, this.ac.currentTime, tc == null ? 0.25 : tc); };
P.filt = function (type, f, q, dest) { const b = this.ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (dest) b.connect(dest); return b; };
P.src = function (buf, t, dur, dest, rate) {
  const s = this.ac.createBufferSource(); s.buffer = this.buf[buf] || buf; s.loop = true; if (rate) s.playbackRate.value = rate; s.connect(dest);
  s.start(t, rnd() * Math.max(0, s.buffer.duration - 0.1)); if (dur != null && isFinite(dur)) s.stop(t + dur); return s;
};
P.envG = function (dest, t, a, d, peak, hold) {
  const n = this.ac.createGain(), p = n.gain; p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
  if (hold) p.setValueAtTime(peak, t + a + hold); p.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + d); p.setValueAtTime(0, t + a + (hold || 0) + d + 0.01);
  n.connect(dest); return n;
};
/* a noise burst: { kind, a, d, hold, peak, bp, q, hp, lp, rate } */
P.burst = function (dest, t, o) {
  const a = o.a || 0.002, d = o.d || 0.05, h = o.hold || 0; let head = this.envG(dest, t, a, d, o.peak || 0.3, h);
  if (o.lp) head = this.filt('lowpass', o.lp, 0.7, head);
  if (o.hp) head = this.filt('highpass', o.hp, 0.7, head);
  if (o.bp) { head = this.filt('bandpass', o.bp, o.q || 1, head); if (o.bp1) { head.frequency.setValueAtTime(o.bp, t); head.frequency.exponentialRampToValueAtTime(o.bp1, t + a + h + d); } }
  this.src(o.kind || 'white', t, a + h + d + 0.03, head, o.rate);
  return a + h + d;
};
/* an oscillator: { f, f1, type, a, d, hold, peak, lp } */
P.tone = function (dest, t, o) {
  const a = o.a || 0.003, d = o.d || 0.1, h = o.hold || 0, eg = this.envG(dest, t, a, d, o.peak || 0.3, h);
  const os = this.ac.createOscillator(); os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f, t); if (o.detune) os.detune.value = o.detune;
  if (o.f1) os.frequency.exponentialRampToValueAtTime(o.f1, t + a + h + d);
  os.connect(o.lp ? this.filt('lowpass', o.lp, 0.7, eg) : eg); os.start(t); os.stop(t + a + h + d + 0.03);
  return a + h + d;
};
P.partials = function (dest, t, list, peak) { let m = 0; for (const [f, dec, amp] of list) m = Math.max(m, this.tone(dest, t, { f, a: 0.0015, d: dec, peak: peak * amp })); return m; };

/* where things are heard from: the rabbit's ears for distance, the camera for left / right */
function listener() {
  const G = GG(), r = G.rabbit, cam = FF.Game && FF.Game.camera;
  const camX = cam ? cam.position.x : (r ? r.x : 0), dist = cam ? Math.max(2, cam.position.z) : 9;
  const aspect = cam && cam.aspect ? cam.aspect : 2, fov = cam && cam.fov ? cam.fov : 26;
  const halfW = dist * Math.tan(fov * Math.PI / 360) * aspect;
  const x = r ? r.x : camX, y = r ? r.y + 0.2 : 0.2;
  return { x, y, camX, halfW, inDrain: !!(r && r.y < -0.4 && r.x > 38.4 && r.x < 55.5), place: G.place || 'verge' };
}
/* gain, low-pass and pan for a source position, with the walls that matter in this sequence */
function spatial(p, L, roll) {
  L = L || listener();
  const dx = p.x - L.x, dy = (p.y || 0) - L.y, dz = p.z || 0, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let g = 1.6 / (1.6 + Math.max(0, d - 1.6) * (roll || 1)), lp = clamp(18000 * Math.exp(-d / (roll ? 16 / roll : 16)), 650, 18000);
  if (/verge|drain/.test(L.place) && p.x < 45 && (p.z || 0) < -4.1) {                    // beyond the boundary wall
    const nearGate = Math.abs(p.x - 33) < 2.6 && (p.z || 0) > -7.6;
    lp = Math.min(lp, nearGate ? 2600 : 1100); g *= nearGate ? 0.85 : 0.6;
  }
  if (L.inDrain && (p.y || 0) > -0.3) {                                                  // the verge above, heard from the pipe
    const open = Math.abs(p.x - 46.4) < 2.2 || (p.x > 38.2 && p.x < 39.4 && L.x < 40.6);
    lp = Math.min(lp, open ? 2200 : 850); g *= open ? 0.8 : 0.55;
  }
  if (L.place === 'search' && (p.z || 0) < -3.15 && p.x > 86) { lp = Math.min(lp, 1300); g *= 0.7; }       // behind the annex wall
  if ((L.x > 113.5 && p.x < 113.0) || (L.x < 113.0 && p.x > 113.5 && p.x < 130)) { lp = Math.min(lp, 1700); g *= 0.7; }  // the fence
  if ((L.x < 83.5 && p.x > 86.0) || (L.x > 86.0 && L.x < 113.5 && p.x < 83.5 && p.x > 52)) { lp = Math.min(lp, 600); g *= 0.35; } // the divide wall
  const pan = clamp((p.x - L.camX) / (L.halfW * 1.5), -0.9, 0.9);
  const out = { g: clamp(g, 0, 1), lp, pan, d };
  if (p.s2) for (const w of X.walls) w(p, L, out);                                       // later sequences' walls (their own sources only)
  return out;
}

/* one voice: in -> low-pass -> pan -> bus (+ reverb send). Disconnected once its sounds have ended. */
P.voice = function (pos, o, L) {
  const ac = this.ac, s = pos ? spatial(pos, L, o.roll) : { g: 1, lp: 20000, pan: o.pan || 0, d: 0 };
  const inG = this.g((o.gain == null ? 1 : o.gain) * s.g), f = this.filt('lowpass', Math.min(s.lp, o.lp || 20000), 0.5), pn = ac.createStereoPanner();
  pn.pan.value = clamp(o.pan != null ? o.pan : s.pan, -1, 1); inG.connect(f); f.connect(pn); pn.connect(o.bus === 'over' ? this.over : o.bus === 'music' ? this.music : this.sfx);
  let sg = null; if (o.send && o.bus !== 'over') { sg = this.g(o.send * this.verbAmt); pn.connect(sg); sg.connect(this.verbIn); }
  return { node: inG, parts: [inG, f, pn, sg], s };
};
P.play = function (name, pos, o) {
  const f = CUES[name], co = CUE_OPT[name] || {}; if (!f) return 0;
  const now = this.ac.currentTime; this.ends = this.ends.filter(e => e > now);
  if (this.ends.length > 56 && !co.prio) return 0;
  const opt = Object.assign({}, co, o || {}), t = now + 0.006 + (opt.delay || 0);
  if (TRIM[name]) opt.gain = (opt.gain == null ? 1 : opt.gain) * Math.pow(10, TRIM[name] / 20);
  const v = this.voice(pos, opt);
  if (v.s.g < 0.004 && !co.prio) { for (const n of v.parts) if (n) n.disconnect(); return 0; }
  let dur = 0.5;
  if (this.samples[name]) { const s = this.ac.createBufferSource(); s.buffer = this.samples[name]; s.connect(v.node); s.start(t); dur = s.buffer.duration; }
  else dur = f(this, v.node, t, opt) || 0.5;
  this.ends.push(t + dur); this.trash.push({ at: t + dur + 1.0, parts: v.parts });
  return dur;
};
P.sweep = function () { const now = this.ac.currentTime; for (let i = this.trash.length - 1; i >= 0; i--) if (this.trash[i].at < now) { for (const n of this.trash[i].parts) if (n) try { n.disconnect(); } catch (_) {} this.trash.splice(i, 1); } };

/* ------------------------------------------------------------------ the cue synths (E, voice input, start time, opts) -> seconds */
const CUE_OPT = {
  step: { send: 0.35 }, paw: { send: 0.08 }, land: { send: 0.1 }, splash: { send: 0.5 }, 'box-tok': { send: 0.4 }, 'box-stop': { send: 0.5 },
  brakes: { send: 0.2 }, 'door-slam': { send: 0.5 }, chain: { send: 0.35 }, 'gate-jolt': { send: 0.45 }, 'lock-gives': { send: 0.6, prio: 1 },
  'gate-slide': { send: 0.4 }, 'gate-close': { send: 0.5 }, 'slab-scrape': { send: 0.3 }, 'torch-click': { send: 0.2 }, reach: { send: 0.2 },
  'door-open': { send: 0.6 }, 'door-shut': { send: 0.7 }, relay: { send: 0.6 }, 'fence-clatter': { send: 0.5, roll: 0.5 }, 'fence-shake': { send: 0.5, roll: 0.5 },
  'aim-click': { send: 0.25, prio: 1 }, breath: { send: 0.3, prio: 1 }, lunge: { send: 0.2, prio: 1 }, kneel: { send: 0.2 }, tick: { send: 0.3 },
  'far-boom': { send: 1.0, prio: 1, roll: 0.22 }, machine: { send: 0.6, roll: 0.25 }, thud: { send: 0.9, roll: 0.22 }, horn: { send: 1.0, roll: 0.3 }, drip: { send: 0.7 },
  sniff: {}, groom: {}, nibble: {}, shake: { send: 0.1 }, settle: {}, rbreath: {}, heart: { prio: 1 }, claw: { send: 0.5 },
  shot: { bus: 'over', prio: 1 }, scuff: { bus: 'over', prio: 1 }, squeak: { bus: 'over', prio: 1 }, 'tin-clang': { send: 0.5, prio: 1 }, 'far-clang': { send: 1.0, roll: 0.25 }, tumble: { send: 0.15 }, 'end-chord': { bus: 'music', prio: 1 },
};
/* per-cue trims (dB), calibrated with FF.Audio.lab(): point-blank peaks of about -8 dBFS for boots, -6 for the aim click,
   -5 for the lock, -3 for the shot (the loudest sound in the game), about -30 for the rabbit's own small sounds */
const TRIM = { step: 4.5, paw: 5, land: 6, splash: 2.5, breath: 16, 'aim-click': 10.5, 'torch-click': 8.5, lunge: 8, kneel: 5, reach: 14,
  'door-open': 13, 'door-shut': 2.5, 'door-slam': 3, brakes: 9, chain: 6.5, 'gate-jolt': 5, 'gate-slide': 2.5, 'gate-close': 5, 'slab-scrape': 18,
  relay: 12.5, 'fence-clatter': 15, 'fence-shake': 13, 'far-boom': 12, machine: 7.5, thud: 4, horn: 21, drip: 6, tick: 4, sniff: 8.5, groom: 10,
  nibble: 1, shake: 5.5, rbreath: 20, shot: 3.2, scuff: 19, squeak: 19, 'tin-clang': 9, 'far-clang': 12, tumble: 6, 'end-chord': 2 };
const CUES = {
  /* boots: heel + toe, by surface; heavier and quicker when running */
  step(E, d, t, o) {
    const s = o.surface || 'concrete', w = (o.w || 1) * (o.run ? 1.25 : 1), tt = t + (o.run ? 0.035 : rr(0.05, 0.075));
    E.tone(d, t, { f: s === 'deck' ? 125 : 88, f1: s === 'deck' ? 92 : 52, a: 0.003, d: s === 'deck' ? 0.15 : 0.07, peak: 0.42 * w });
    E.burst(d, t, { kind: 'pink', a: 0.002, d: o.run ? 0.045 : 0.065, peak: 0.42 * w, bp: s === 'grass' ? 700 : s === 'gravel' ? 1500 : 1300, q: 0.8 });
    E.burst(d, tt, { kind: 'white', a: 0.002, d: 0.03, peak: 0.16 * w, bp: 2600, q: 1.1 });
    if (s === 'gravel') for (let k = 0; k < 7; k++) E.burst(d, t + rr(0, 0.1), { kind: 'white', a: 0.001, d: rr(0.006, 0.018), peak: rr(0.06, 0.2) * w, bp: rr(2200, 5200), q: 3 });
    if (s === 'wet' || s === 'grass') E.burst(d, t + 0.01, { kind: 'white', a: 0.004, d: s === 'grass' ? 0.09 : 0.13, peak: (s === 'grass' ? 0.07 : 0.11) * w, bp: s === 'grass' ? 2200 : 3300, q: 1.4 });
    if (s === 'steel' || s === 'grate') E.partials(d, t, [[392, 0.28, 1], [1046, 0.2, 0.7], [1733, 0.14, 0.5], [2689, 0.09, 0.35]], (s === 'grate' ? 0.06 : 0.055) * w);
    if (s === 'deck') E.partials(d, t, [[318, 0.22, 1], [871, 0.12, 0.5]], 0.09 * w);
    return 0.35;
  },
  /* the rabbit's feet: soft double pats (fore, then hind) */
  paw(E, d, t, o) {
    const s = o.surface || 'grass', w = o.w || 0.6;
    E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.03, peak: 0.16 * w, lp: 520 });
    E.burst(d, t + 0.04, { kind: 'pink', a: 0.002, d: 0.035, peak: 0.2 * w, lp: 560 });
    if (s === 'grass') E.burst(d, t, { kind: 'white', a: 0.006, d: 0.06, peak: 0.035 * w, bp: 4200, q: 0.9 });
    if (s === 'wet') E.burst(d, t + 0.04, { kind: 'white', a: 0.003, d: 0.05, peak: 0.05 * w, bp: 3600, q: 1.3 });
    if (s === 'water') { E.burst(d, t, { kind: 'white', a: 0.003, d: 0.08, peak: 0.12 * w, bp: 2100, q: 1.2 }); E.tone(d, t + 0.03, { f: rr(900, 1500), f1: 600, d: 0.03, peak: 0.03 * w }); }
    if (s === 'wood') E.tone(d, t + 0.04, { f: 330, d: 0.035, peak: 0.07 * w });
    if (s === 'metal') E.partials(d, t + 0.04, [[1430, 0.05, 1], [2210, 0.04, 0.6]], 0.03 * w);
    return 0.15;
  },
  land(E, d, t, o) { const h = clamp(o.h || 0.4, 0.1, 1.2); E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.06, peak: 0.12 + 0.12 * h, lp: 480 }); if (o.surface === 'grass' || o.surface === 'wet') E.burst(d, t, { kind: 'white', a: 0.003, d: 0.08, peak: 0.05, bp: 3800, q: 1 }); return 0.15; },
  splash(E, d, t) {
    E.burst(d, t, { kind: 'white', a: 0.004, d: 0.32, peak: 0.28, bp: 1700, q: 0.7 }); E.burst(d, t, { kind: 'pink', a: 0.003, d: 0.12, peak: 0.25, lp: 400 });
    for (let k = 0; k < 7; k++) E.tone(d, t + rr(0.05, 0.4), { f: rr(1100, 2600), f1: rr(500, 900), a: 0.001, d: rr(0.02, 0.05), peak: rr(0.02, 0.06) });
    return 0.6;
  },
  /* the box: a wooden knock as the head meets it; a dull knock as it stops against the kerb */
  'box-tok'(E, d, t) { E.tone(d, t, { f: 240, f1: 210, d: 0.06, peak: 0.12 }); E.tone(d, t, { f: 505, d: 0.03, peak: 0.05 }); E.burst(d, t, { kind: 'white', a: 0.001, d: 0.01, peak: 0.06, bp: 2500 }); return 0.2; },
  'box-stop'(E, d, t) { E.tone(d, t, { f: 170, f1: 140, d: 0.11, peak: 0.2 }); E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.06, peak: 0.12, lp: 900 }); return 0.3; },
  brakes(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.08, hold: 0.25, d: 0.35, peak: 0.16, bp: 900, q: 0.6 }); E.burst(d, t + 0.55, { kind: 'white', a: 0.01, d: 0.55, peak: 0.12, hp: 2500 }); return 1.2; },
  'door-slam'(E, d, t) { E.tone(d, t, { f: 68, f1: 48, d: 0.16, peak: 0.42 }); E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.09, peak: 0.32, lp: 1300 }); E.partials(d, t + 0.005, [[287, 0.25, 1], [611, 0.16, 0.5], [1180, 0.09, 0.3]], 0.08); return 0.5; },
  /* the padlock and chain: a burst of metal clinks with the leaves jolting */
  chain(E, d, t, o) {
    const dur = o.dur || rr(1.2, 2.0), hard = o.hard ? 1.35 : 1; let tt = 0;
    while (tt < dur) { const f = rr(1900, 5600); E.partials(d, t + tt, [[f, rr(0.03, 0.07), 1], [f * 1.52, 0.04, 0.5], [f * 2.31, 0.03, 0.3]], rr(0.05, 0.13) * hard); tt += rr(0.025, 0.085) / hard; }
    for (let j = rr(0.05, 0.2); j < dur; j += rr(0.28, 0.5) / hard) CUES['gate-jolt'](E, d, t + j, { g: 0.55 * hard });
    return dur + 0.4;
  },
  'gate-jolt'(E, d, t, o) { const k = o.g || 1; E.partials(d, t, [[176, 0.6, 1], [409, 0.42, 0.6], [757, 0.3, 0.4], [1240, 0.18, 0.25]], 0.1 * k); E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.05, peak: 0.18 * k, lp: 700 }); return 0.7; },
  'lock-gives'(E, d, t) {
    E.partials(d, t, [[142, 1.0, 1], [331, 0.7, 0.7], [688, 0.5, 0.5], [1312, 0.3, 0.3]], 0.2); E.tone(d, t, { f: 70, f1: 45, d: 0.25, peak: 0.4 });
    for (let k = 0; k < 9; k++) { const f = rr(1700, 4800); E.partials(d, t + 0.08 + k * rr(0.03, 0.07), [[f, 0.06, 1], [f * 1.5, 0.04, 0.5]], 0.08 * (1 - k / 10)); }
    return 1.2;
  },
  'gate-slide'(E, d, t, o) { const dur = o.dur || 0.6; E.burst(d, t, { kind: 'brown', a: 0.05, hold: dur - 0.1, d: 0.2, peak: 0.45, lp: 420 }); E.burst(d, t, { kind: 'pink', a: 0.04, hold: dur - 0.1, d: 0.15, peak: 0.12, bp: 1900, q: 3 }); return dur + 0.3; },
  'gate-close'(E, d, t) { CUES['gate-slide'](E, d, t, { dur: 0.9 }); CUES['gate-jolt'](E, d, t + 0.95, { g: 1.2 }); return 1.8; },
  'slab-scrape'(E, d, t, o) { const dur = o.dur || rr(0.3, 0.7); let tt = 0; while (tt < dur) { E.burst(d, t + tt, { kind: 'white', a: 0.004, d: rr(0.03, 0.09), peak: rr(0.06, 0.14), bp: rr(1200, 2600), q: 1.4 }); tt += rr(0.03, 0.08); } return dur + 0.1; },
  'torch-click'(E, d, t) { E.burst(d, t, { kind: 'white', a: 0.0005, d: 0.004, peak: 0.2, hp: 3000 }); E.tone(d, t, { f: 2300, d: 0.012, peak: 0.05 }); E.burst(d, t + 0.05, { kind: 'white', a: 0.0005, d: 0.003, peak: 0.1, hp: 3500 }); return 0.1; },
  reach(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.05, d: 0.35, peak: 0.08, hp: 2500 }); CUES['slab-scrape'](E, d, t + 0.35, { dur: 0.5 }); return 1.0; },
  kneel(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.04, d: 0.25, peak: 0.08, hp: 2200 }); E.tone(d, t + 0.18, { f: 80, f1: 55, d: 0.07, peak: 0.18 }); return 0.5; },
  'door-open'(E, d, t) {
    E.burst(d, t, { kind: 'white', a: 0.001, d: 0.02, peak: 0.25, bp: 2200, q: 2 }); E.partials(d, t + 0.01, [[640, 0.12, 1], [1530, 0.08, 0.5]], 0.07);
    const os = E.ac.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(95, t + 0.1); os.frequency.linearRampToValueAtTime(70, t + 0.7);
    const bp = E.filt('bandpass', 950, 4); const eg = E.envG(d, t + 0.1, 0.12, 0.5, 0.05, 0.1); os.connect(bp); bp.connect(eg); os.start(t + 0.1); os.stop(t + 0.85);
    return 1.0;
  },
  'door-shut'(E, d, t) { E.tone(d, t, { f: 75, f1: 50, d: 0.18, peak: 0.42 }); E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.08, peak: 0.25, lp: 1600 }); E.partials(d, t, [[231, 0.6, 1], [512, 0.42, 0.6], [981, 0.25, 0.35]], 0.09); return 1.0; },
  relay(E, d, t) { for (const dt of [0, 0.028]) { E.burst(d, t + dt, { kind: 'white', a: 0.0005, d: 0.008, peak: 0.25, lp: 4500 }); E.tone(d, t + dt, { f: 900, d: 0.02, peak: 0.06 }); } return 0.2; },
  'fence-clatter'(E, d, t) { for (let k = 0; k < 6; k++) { const tt = t + k * rr(0.05, 0.12); E.burst(d, tt, { kind: 'pink', a: 0.002, d: rr(0.08, 0.18), peak: rr(0.12, 0.25), bp: rr(500, 1300), q: 1.2 }); E.partials(d, tt, [[rr(280, 360), 0.35, 1], [rr(790, 900), 0.2, 0.5]], 0.05); } return 1.1; },
  'fence-shake'(E, d, t) { for (let k = 0; k < 4; k++) { const tt = t + k * 0.09; E.burst(d, tt, { kind: 'pink', a: 0.002, d: 0.12, peak: 0.18, bp: rr(600, 1100), q: 1.3 }); E.partials(d, tt, [[315, 0.3, 1], [842, 0.18, 0.5]], 0.05); } return 0.8; },
  /* the gun: a dry two-part click, nothing more */
  'aim-click'(E, d, t) { E.burst(d, t, { kind: 'white', a: 0.0005, d: 0.006, peak: 0.45, hp: 1800 }); E.tone(d, t, { f: 1650, d: 0.018, peak: 0.1 }); E.burst(d, t + 0.075, { kind: 'white', a: 0.0005, d: 0.009, peak: 0.32, bp: 1300, q: 1.5 }); return 0.2; },
  /* his sharp intake of breath at SPOTTED (no musical sting) */
  breath(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.06, hold: 0.1, d: 0.14, peak: 0.3, bp: 1300, bp1: 2500, q: 1.6 }); return 0.4; },
  lunge(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.08, d: 0.25, peak: 0.12, hp: 1800 }); E.burst(d, t + 0.05, { kind: 'pink', a: 0.002, d: 0.1, peak: 0.16, bp: 1100, q: 1 }); return 0.4; },
  tick(E, d, t) { E.partials(d, t, [[rr(2300, 3800), 0.03, 1], [rr(5200, 6200), 0.02, 0.4]], 0.06); return 0.1; },
  /* the world beyond: a far boom, the machinery rhythm after it, the Works thud every 4 s, a horn far off */
  'far-boom'(E, d, t) { E.tone(d, t, { f: 46, f1: 30, a: 0.02, d: 2.6, peak: 0.55, lp: 160 }); E.burst(d, t, { kind: 'brown', a: 0.03, d: 2.4, peak: 0.5, lp: 180 }); E.burst(d, t + 0.05, { kind: 'pink', a: 0.2, d: 1.8, peak: 0.07, lp: 600 }); return 3.0; },
  machine(E, d, t) { E.tone(d, t, { f: 62, f1: 50, a: 0.01, d: 0.25, peak: 0.22, lp: 240 }); E.burst(d, t + 0.02, { kind: 'pink', a: 0.03, d: 0.35, peak: 0.06, bp: 700, q: 1 }); E.burst(d, t + 0.45, { kind: 'white', a: 0.05, d: 0.4, peak: 0.025, hp: 3000 }); return 0.9; },
  thud(E, d, t) { E.tone(d, t, { f: 41, f1: 33, a: 0.012, d: 1.3, peak: 0.6, lp: 140 }); E.burst(d, t, { kind: 'brown', a: 0.02, d: 1.1, peak: 0.42, lp: 150 }); return 1.6; },
  horn(E, d, t) { for (const [f, dt] of [[98, 0], [146.8, 3], [196.4, -4]]) E.tone(d, t, { f, type: 'sawtooth', a: 0.5, hold: 1.4, d: 1.6, peak: 0.05, lp: 520, detune: dt }); return 3.6; },
  drip(E, d, t, o) { const f = rr(900, 1900); E.tone(d, t, { f, f1: f * 0.62, a: 0.0015, d: rr(0.02, 0.05), peak: (o.big ? 0.12 : 0.06) }); if (o.big) E.burst(d, t, { kind: 'white', a: 0.002, d: 0.05, peak: 0.04, bp: 2600, q: 1 }); return 0.12; },
  /* the rabbit, close-miked */
  sniff(E, d, t) { const n = 2 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) E.burst(d, t + k * rr(0.07, 0.1), { kind: 'white', a: 0.008, d: 0.03, peak: 0.05, bp: 3600, q: 0.8 }); return 0.4; },
  groom(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.06, hold: 0.08, d: 0.14, peak: 0.045, bp: 4200, q: 0.7 }); return 0.35; },
  nibble(E, d, t) { for (let k = 0; k < 4; k++) E.burst(d, t + k * rr(0.06, 0.11), { kind: 'white', a: 0.0008, d: 0.008, peak: 0.07, hp: 2400 }); return 0.5; },
  shake(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.05, hold: 0.35, d: 0.15, peak: 0.08, bp: 3200, q: 0.6 }); for (let k = 0; k < 10; k++) E.tone(d, t + rr(0.05, 0.6), { f: rr(2600, 6200), a: 0.001, d: 0.012, peak: 0.02 }); return 0.7; },
  settle(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.2, d: 0.6, peak: 0.04, bp: 2400, q: 0.6 }); return 0.9; },
  rbreath(E, d, t, o) { const k = clamp(o.rate || 1, 0.5, 3), a = 0.4 / k; E.burst(d, t, { kind: 'pink', a: a * 0.35, d: a * 0.35, peak: 0.02 * (o.w || 1), bp: 2400, q: 0.8 }); E.burst(d, t + a * 0.75, { kind: 'pink', a: a * 0.15, d: a * 0.5, peak: 0.017 * (o.w || 1), bp: 1600, q: 0.8 }); return a * 1.5; },
  heart(E, d, t, o) { const w = o.w || 1; E.tone(d, t, { f: 58, f1: 42, a: 0.006, d: 0.09, peak: 0.22 * w, lp: 150 }); E.tone(d, t + 0.17, { f: 52, f1: 38, a: 0.006, d: 0.08, peak: 0.15 * w, lp: 150 }); return 0.35; },
  claw(E, d, t) { E.partials(d, t, [[rr(680, 760), 0.06, 1], [rr(1450, 1600), 0.04, 0.6], [rr(3000, 3600), 0.02, 0.4]], 0.04); E.burst(d, t, { kind: 'white', a: 0.0005, d: 0.006, peak: 0.05, hp: 3000 }); return 0.1; },
  /* the shot: one restrained distant crack, muffled, with a 0.8 s tail; NO impact sound. Heard under the black. */
  shot(E, d, t) {
    const lp = E.filt('lowpass', 1500, 0.6, d);
    E.burst(lp, t, { kind: 'white', a: 0.0008, d: 0.045, peak: 1.6 });
    E.tone(lp, t, { f: 95, f1: 38, a: 0.002, d: 0.32, peak: 0.55 });
    E.burst(E.filt('lowpass', 520, 0.7, d), t + 0.015, { kind: 'brown', a: 0.012, d: 0.8, peak: 0.42 });
    E.burst(E.filt('lowpass', 800, 0.7, d), t + 0.2, { kind: 'pink', a: 0.04, d: 0.55, peak: 0.1 });
    return 1.2;
  },
  /* caught: his boot scuff and a cloth rustle (0.2 s), then silence. No rabbit sound. */
  /* polish pass 8 Oct (Josh): the tiny, restrained squeak at the moment of capture (heard under the black, before the scuff): two
     short rising chirps of a breathy high tone, about -34 dBFS, over in 0.14 s. Not a scream: the picture cuts, the rabbit is small. */
  squeak(E, d, t) {
    E.tone(d, t, { f: 2050, f1: 3050, a: 0.004, d: 0.07, peak: 0.07, type: 'sine' });
    E.tone(d, t + 0.085, { f: 2300, f1: 3250, a: 0.004, d: 0.055, peak: 0.045, type: 'sine' });
    E.burst(d, t, { kind: 'white', a: 0.004, d: 0.07, peak: 0.012, bp: 4800, q: 2 });
    return 0.25;
  },
  /* the opening: a rabbit landing on a corrugated sheet (a dull steel pan: low body, ringing partials, rain-wet), a distant clang
     far behind (small, late, a long filtered tail), and the rustle of a tumble through wet grass */
  'tin-clang'(E, d, t, o) {
    const w = o.w || 1;
    E.tone(d, t, { f: 168, f1: 128, a: 0.003, d: 0.34, peak: 0.28 * w });
    E.partials(d, t, [[392, 0.5, 1], [742, 0.34, 0.8], [1180, 0.26, 0.6], [1730, 0.2, 0.45], [2410, 0.12, 0.3]], 0.1 * w);
    E.burst(d, t, { kind: 'pink', a: 0.002, d: 0.07, peak: 0.3 * w, bp: 1500, q: 0.8 });
    return 0.8;
  },
  'far-clang'(E, d, t) {
    E.partials(d, t, [[221, 1.1, 1], [547, 0.9, 0.7], [903, 0.7, 0.5], [1380, 0.5, 0.3]], 0.13);
    E.burst(d, t, { kind: 'pink', a: 0.004, d: 0.1, peak: 0.12, bp: 700, q: 0.9 });
    E.burst(d, t + 0.35, { kind: 'brown', a: 0.05, d: 0.9, peak: 0.05, lp: 240 });
    return 1.8;
  },
  tumble(E, d, t) {
    for (let k = 0; k < 7; k++) E.burst(d, t + k * rr(0.04, 0.09), { kind: 'pink', a: 0.006, d: rr(0.05, 0.12), peak: rr(0.07, 0.16), bp: rr(900, 2600), q: 0.6 });
    return 0.8;
  },
  scuff(E, d, t) { E.burst(d, t, { kind: 'pink', a: 0.01, d: 0.12, peak: 0.3, bp: 1100, q: 0.9 }); E.burst(d, t + 0.05, { kind: 'pink', a: 0.03, d: 0.15, peak: 0.1, hp: 3000 }); return 0.35; },
  /* the end card: one held chord, soft and open */
  'end-chord'(E, d, t) {
    const lp = E.filt('lowpass', 1500, 0.5, d);
    for (const [f, a] of [[98.0, 1], [146.83, 0.9], [220.0, 0.75], [246.94, 0.55], [369.99, 0.4]])
      for (const dt of [-5, 5]) E.tone(lp, t, { f, type: 'triangle', detune: dt, a: 1.0, hold: 3.6, d: 2.6, peak: 0.05 * a });
    return 7.5;
  },
};

/* ------------------------------------------------------------------ beds and landmark loops (built once per engine) */
function loopSrcStart(E, buf, dest, rate) { return E.src(buf, E.ac.currentTime, null, dest, rate); }
function lfo(E, f, depth, param, type) { const o = E.ac.createOscillator(); o.type = type || 'sine'; o.frequency.value = f; const g = E.g(depth); o.connect(g); g.connect(param); o.start(); return o; }
function buildBeds(E) {
  const ac = E.ac, B = { srcs: [] };
  B.rainG = E.g(0, E.amb); B.rainLP = E.filt('lowpass', 7000, 0.5, B.rainG); B.srcs.push(loopSrcStart(E, 'rain', B.rainLP));
  B.rainSend = E.g(0.0, E.verbIn); B.rainG.connect(B.rainSend);
  B.windG = E.g(0, E.amb); const wbp = E.filt('bandpass', 360, 0.6, B.windG); B.srcs.push(loopSrcStart(E, 'brown', wbp, 1)); B.srcs.push(lfo(E, 0.07, 140, wbp.frequency)); B.srcs.push(lfo(E, 0.11, 0.06, B.windG.gain));
  B.humG = E.g(0, E.amb); const hlp = E.filt('lowpass', 380, 0.7, B.humG);
  for (const [f, a, ty] of [[47, 0.22, 'sine'], [94.4, 0.16, 'sine'], [141.6, 0.08, 'triangle']]) { const o = ac.createOscillator(); o.type = ty; o.frequency.value = f; const g = E.g(a, hlp); o.connect(g); o.start(); B.srcs.push(o); }
  B.srcs.push(loopSrcStart(E, 'brown', E.filt('lowpass', 140, 0.7, E.g(0.8, B.humG))));
  B.hallG = E.g(0, E.amb); const hb = E.filt('bandpass', 240, 2, B.hallG);
  for (const [f, a] of [[120, 0.28], [240, 0.14], [360.5, 0.05]]) { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = E.g(a, hb); o.connect(g); o.start(); B.srcs.push(o); }
  B.srcs.push(loopSrcStart(E, 'pink', E.filt('bandpass', 500, 0.8, E.g(0.25, B.hallG)), 1));
  /* landmark loops: positional, on the cue bus */
  B.marks = MARKS.map(m => {
    const out = E.g(0), lp = E.filt('lowpass', 12000, 0.5, out), pn = ac.createStereoPanner(); out.connect(pn); pn.connect(E.sfx); const send = E.g(0.2, E.verbIn); pn.connect(send);
    const mk = { m, out, lp, pn, send };
    if (m.kind === 'tin') B.srcs.push(loopSrcStart(E, 'tin', lp));
    else if (m.kind === 'trickle') { const am = E.g(0.5, lp); const bp = E.filt('bandpass', 1750, 1.4, am); B.srcs.push(loopSrcStart(E, 'pink', bp)); const mod = E.g(0.9, am.gain); B.srcs.push(loopSrcStart(E, 'brown', E.filt('lowpass', 14, 0.7, mod), 1)); E.filt('bandpass', 3300, 3, am); }
    else if (m.kind === 'whistle') { const bp = E.filt('bandpass', m.f, m.q, lp); B.srcs.push(loopSrcStart(E, 'pink', bp)); B.srcs.push(lfo(E, 0.09, m.f * 0.03, bp.frequency)); const bp2 = E.filt('bandpass', m.f * 2.03, m.q * 0.7, E.g(0.4, lp)); B.srcs.push(loopSrcStart(E, 'pink', bp2)); }
    else if (m.kind === 'mains') { const bp = E.filt('bandpass', 300, 1.2, lp); for (const [f, a] of [[100, 0.6], [200.4, 0.35]]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = E.g(a * 0.3, bp); o.connect(g); o.start(); B.srcs.push(o); } B.srcs.push(loopSrcStart(E, 'white', E.filt('bandpass', 5200, 2, E.g(0.08, lp)))); }
    return mk;
  });
  return B;
}

/* on-demand loops: the van's engine, a torch's buzz, the box scrape, fur in a squeeze, the drone, the pad */
const LOOPS = {
  engine(E, out) {
    const ac = E.ac, o1 = ac.createOscillator(), o2 = ac.createOscillator(), lf = ac.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square'; lf.type = 'sine';
    const tone = E.filt('lowpass', 300, 1.1), am = E.g(0.7, out); tone.connect(am); o1.connect(E.g(0.32, tone)); o2.connect(E.g(0.16, tone));
    const lg = E.g(0.22, am.gain); lf.connect(lg); [o1, o2, lf].forEach(o => o.start());
    const rum = E.g(0.5, out), tyre = E.g(0, out); const s1 = loopSrcStart(E, 'brown', E.filt('lowpass', 110, 0.7, rum)), s2 = loopSrcStart(E, 'pink', E.filt('bandpass', 2700, 0.6, tyre));
    return { srcs: [o1, o2, lf, s1, s2], set(p) { const f0 = 24 + 26 * clamp(p.rpm || 0, 0, 1); E.to(o1.frequency, f0, 0.3); E.to(o2.frequency, f0 / 2, 0.3); E.to(lf.frequency, f0 / 2, 0.3); E.to(tone.frequency, 380 + 600 * clamp(p.rpm || 0, 0, 1), 0.3); E.to(tyre.gain, 0.35 * clamp((p.speed || 0) / 8, 0, 1), 0.2); } };
  },
  buzz(E, out) {
    const ac = E.ac, o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 117; const bp = E.filt('bandpass', 2600, 5), g1 = E.g(1.0, out); bp.connect(g1); o.connect(bp); o.start();
    const s = loopSrcStart(E, 'white', E.filt('bandpass', 6500, 2.5, E.g(0.45, out)));
    return { srcs: [o, s], set(p) { E.to(bp.frequency, p.lit ? 3100 : 2600, 0.1); } };
  },
  scrape(E, out) {
    const am = E.g(0.6, out), bp = E.filt('bandpass', 850, 1.1, am); const s1 = loopSrcStart(E, 'pink', bp); const mod = E.g(0.6, am.gain); const s2 = loopSrcStart(E, 'brown', E.filt('lowpass', 30, 0.7, mod), 4);
    const s3 = loopSrcStart(E, 'brown', E.filt('lowpass', 170, 0.7, E.g(0.5, out)));
    return { srcs: [s1, s2, s3], set(p) { E.to(bp.frequency, 700 + 500 * clamp(p.v || 0, 0, 1), 0.1); } };
  },
  fur(E, out) {
    const am = E.g(0.5, out), bp = E.filt('bandpass', 3800, 0.9, am); const s = loopSrcStart(E, 'pink', bp); const l = lfo(E, 3, 0.45, am.gain);
    return { srcs: [s, l], set(p) { E.to(l.frequency, 1.5 + 3 * clamp(p.v || 0, 0, 1.5), 0.2); } };
  },
  drone(E, out) {
    const ac = E.ac, lp = E.filt('lowpass', 240, 0.8), am = E.g(1, out); lp.connect(am); const srcs = [];
    for (const [f, a, ty] of [[55, 0.5, 'sine'], [82.6, 0.3, 'sine'], [110.4, 0.18, 'sine'], [55.2, 0.16, 'sawtooth']]) { const o = ac.createOscillator(); o.type = ty; o.frequency.value = f; o.connect(E.g(a, lp)); o.start(); srcs.push(o); }
    const pulse = ac.createOscillator(); pulse.frequency.value = 2.2; const pd = E.g(0, am.gain); pulse.connect(pd); pulse.start(); srcs.push(pulse);
    return { srcs, set(p) { E.to(pd.gain, 0.45 * clamp(p.pulse || 0, 0, 1), 0.3); E.to(lp.frequency, 200 + 260 * clamp(p.level || 0, 0, 1), 0.5); } };
  },
  mains(E, out) {
    const ac = E.ac, bp = E.filt('bandpass', 260, 1.4, out), srcs = [];
    for (const [f, a] of [[100, 0.5], [200.3, 0.3], [300.2, 0.12]]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(E.g(a * 0.25, bp)); o.start(); srcs.push(o); }
    return { srcs, set() {} };
  },
  pad(E, out) {
    const ac = E.ac, lp = E.filt('lowpass', 950, 0.6, out), srcs = [];
    for (const [f, a] of [[146.83, 1], [220.0, 0.8], [277.18, 0.5], [329.63, 0.55], [440.0, 0.25]])
      for (const dt of [-6, 6]) { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = dt; o.connect(E.g(0.03 * a, lp)); o.start(); srcs.push(o); }
    srcs.push(lfo(E, 0.05, 250, lp.frequency));
    return { srcs, set() {} };
  },
};
/* a loop by id: created on first use, moved and levelled every frame, faded out and freed on stop */
P.loop = function (id, kind, pos, gain, params, bus) {
  let L = this.loops.get(id);
  if (!L) {
    const ac = this.ac, out = this.g(0), lp = this.filt('lowpass', 12000, 0.5), pn = ac.createStereoPanner(); out.connect(lp); lp.connect(pn);
    pn.connect(bus === 'music' ? this.music : bus === 'amb' ? this.amb : this.sfx); const send = this.g(bus === 'music' ? 0 : 0.25 * this.verbAmt, this.verbIn); pn.connect(send);
    const inner = this.g(1, out), body = LOOPS[kind](this, inner);
    L = { id, kind, out, lp, pn, send, inner, body }; this.loops.set(id, L);
  }
  const s = pos ? spatial(pos) : { g: 1, lp: 18000, pan: 0 };
  this.to(L.out.gain, Math.max(0, (gain == null ? 1 : gain) * s.g), L.kind === 'pad' ? 2.5 : 0.08);
  this.to(L.lp.frequency, s.lp, 0.1); this.to(L.pn.pan, s.pan, 0.1);
  if (params) L.body.set(params);
  L.seen = this.ac.currentTime;
  return L;
};
P.loopStop = function (id, fade) {
  const L = this.loops.get(id); if (!L) return; this.loops.delete(id);
  const t = this.ac.currentTime, f = fade == null ? 0.25 : fade; L.out.gain.cancelScheduledValues(t); L.out.gain.setTargetAtTime(0, t, f / 3);
  for (const s of L.body.srcs) try { s.stop(t + f + 0.2); } catch (_) {}
  this.trash.push({ at: t + f + 0.6, parts: [L.out, L.lp, L.pn, L.send, L.inner] });
};
/* every frame: levels, beds, landmark loops, reverb, drips */
P.update = function (dt, D) {
  const G = GG(), t = this.ac.currentTime, B = this.bed, L = listener();
  this.to(this.master.gain, st.muted || st.hidden ? 0 : 0.9, 0.06);
  const fadeK = 1 - clamp(G.fade || 0, 0, 1);
  if (D.black) { this.world.gain.cancelScheduledValues(t); this.world.gain.setValueAtTime(0, t); this.world.gain._ffv = 0; }
  else this.to(this.world.gain, fadeK, 0.06);
  this.to(this.amb.gain, (st.music ? 1 : 0) * (D.aimDuck ? 0.5 : 1), 0.2);
  this.to(this.music.gain, st.music ? 1 : 0, 0.3);
  /* the bed mix for where the rabbit is: the look blend (continuous in x), the duct transit, or the place */
  const m = mixNow(G); this.mix = m;
  if (!B) { this.sweep(); return; }
  this.to(B.rainG.gain, m.rain, 0.6); this.to(B.rainLP.frequency, m.rainLP, 0.4); this.to(B.rainSend.gain, m.rain * (m.verb === 'hall' ? 0.6 : 0.12), 0.6);
  this.to(B.windG.gain, m.wind, 0.8); this.to(B.humG.gain, m.hum, 0.8); this.to(B.hallG.gain, m.hall, 1.0);
  /* reverb: load the new room into the idle convolver, then cross-fade */
  if (m.verb !== this.verbType) {
    const k = this.verbCur < 0 ? 0 : 1 - this.verbCur, v = this.verb[k];
    if (!this.irs[m.verb]) this.irs[m.verb] = makeIR(this.ac, m.verb);
    if (v.type !== m.verb) { v.c.buffer = this.irs[m.verb]; v.type = m.verb; }
    const first = this.verbCur < 0; this.verbCur = k; this.verbType = m.verb; this.verbAmt = VERB[m.verb].amt != null ? VERB[m.verb].amt : { open: 0.5, wet: 0.8, hall: 1.0, metal: 0.8, yard: 0.6, soft: 0.5 }[m.verb] || 0.5;
    this.to(v.o.gain, VERB[m.verb].ret, first ? 0.01 : 0.4); this.to(this.verb[1 - k].o.gain, 0, first ? 0.01 : 0.4);
  }
  /* landmark loops */
  for (const mk of B.marks) {
    const m2 = mk.m, on = m2.place.test(L.place) || (m2.id === 'gully' && L.x > 30 && L.x < 44) || (m2.id === 'draught' && L.x > 55 && L.x < 86);
    let pos = m2; if (m2.follow) pos = { x: clamp(L.x + 1.5, m2.follow[0], m2.follow[1]), y: m2.y, z: m2.z };
    let gl = 0, s = null;
    if (on && (m2.id !== 'pipe' || L.inDrain)) { s = spatial(pos, L); gl = m2.gain * s.g; }
    if (m2.id === 'gateRain' && !(/verge/.test(L.place))) gl = 0;
    this.to(mk.out.gain, gl, 0.4); if (s) { this.to(mk.lp.frequency, s.lp, 0.2); this.to(mk.pn.pan, s.pan, 0.2); }
  }
  /* drips: random plinks around the rabbit at the place's rate */
  if (m.drips > 0.01) {
    if (this.dripNext < t) this.dripNext = t + rr(0.05, 0.4);
    while (this.dripNext < t + 0.12) {
      const big = rnd() < 0.15; this.play('drip', { x: L.x + rr(-7, 7), y: L.y + rr(-0.2, 2.5), z: rr(-4, -0.3) }, { gain: m.drips, big, delay: Math.max(0, this.dripNext - t) });
      this.dripNext += rr(0.25, 1.6) / Math.max(0.2, m.drips);
    }
  } else this.dripNext = t + 0.5;
  /* loops nobody refreshed this frame stop (their owner went quiet) */
  for (const [id, Lp] of this.loops) if (!Lp.keep && Lp.seen < t - 0.5) this.loopStop(id, 0.4);
  this.sweep();
};
function mixNow(G) {
  const r = G.rabbit, x = r ? r.x : 2;
  let a = BEDS.verge, b = BEDS.verge, k = 0;
  if (r && (r.mode === 'transit' || r.mode === 'climb')) { a = BEDS.duct; b = BEDS.search; k = r.mode === 'transit' ? clamp(((r.modeT || 0) - 1.2) / 2.6, 0, 1) : 0; if (r.mode === 'climb') a = b = BEDS.courtyard; }
  else if (FF.Level && FF.Level.lookBlend) { const lb = FF.Level.lookBlend(x); a = BEDS[lb.from] || BEDS[G.place] || BEDS.verge; b = BEDS[lb.to] || a; k = clamp(lb.t || 0, 0, 1); }
  else { a = b = BEDS[G.place] || BEDS.verge; }
  const o = {}; for (const key of ['rain', 'rainLP', 'wind', 'hum', 'hall', 'drips', 'mach']) o[key] = lerp(a[key], b[key], k);
  o.verb = k < 0.5 ? a.verb : b.verb;
  for (const f of X.mix) f(o, G, x);
  return o;
}

/* ================================================================== the scene: what is heard, derived from the game */
const D = { tr: {}, black: false, aimDuck: false, timeline: [], recent: [], loops: {}, srch: null, van: null, verge: null, walk: null, thud: null, mach: null, box: null, rab: null, entry: null, end: null };
function resetScene(cp, reason) {
  D.tr = {}; D.timeline = D.timeline.filter(e => e.tag === 'keep'); D.aimDuck = false;
  D.srch = { state: 'off', kind: '', torch: false, offT: 0, alert: 0, heartNext: 0, prevKind: '' };
  const x = cp ? cp.x : 2, f = GG().flags || {};
  D.van = { on: false, t0: 0, x: -12, z: -8.5, fx: -12, ft: null, stopPlan: null, v: 0, vmax: 0, stopped: false, stopT: null, still: 0, leaving: false, gone: x > 38.4, lx: null, lz: null, fb: true };
  D.verge = { chain: false, next: 0, hard: false, personOut: x > 38.4, lockAt: null, torchDown: false, inPipeT: null, scrapeNext: 0 };
  D.walk = { done: x > 86 || !!f.walkwayDone, t0: null, enterT: null, x71T: null, explicit: false };
  D.thud = { on: x >= 86 || !!f.walkwayDone, next: 0, n: 0 }; if (D.thud.on) D.thud.next = (GG().t || 0) + 1.0;
  D.mach = { on: x > 12.5 && x < 56, next: 0 };
  D.box = { moving: false, x: null, firstPush: x > 76, v: 0 };
  D.rab = { x: null, acc: 0, pose: null, poseNext: 0, breathNext: 0, heartNext: 0, mood: null, claws: null };
  D.entry = null; D.end = { pad: false };
  if (reason !== 'fail') D.black = false;
}
function later(sec, fn, tag) { D.timeline.push({ at: (GG().t || 0) + sec, fn, tag: tag || '' }); }
function runTimeline() {
  const now = GG().t || 0;
  for (let i = 0; i < D.timeline.length; i++) { const e = D.timeline[i]; if (e.at <= now) { D.timeline.splice(i--, 1); try { e.fn(); } catch (err) { FF.report(err, 'Audio.timeline'); } } }
}
/* salience for the ears (SEQUENCE-1 §4.2): what Player may weigh */
const SAL = { step: 1.0, engine: 0.8, brakes: 0.8, 'door-slam': 0.9, 'door-open': 0.9, 'door-shut': 0.9, chain: 0.9, 'gate-jolt': 0.8, 'lock-gives': 0.9, 'gate-slide': 0.8, 'gate-close': 0.8,
  'torch-click': 0.6, buzz: 0.9, 'slab-scrape': 0.7, reach: 0.7, 'aim-click': 1.0, breath: 1.0, lunge: 1.0, kneel: 0.8, 'fence-clatter': 0.9, 'fence-shake': 0.9, relay: 0.9, 'far-boom': 0.8, thud: 0.4, machine: 0.3, horn: 0.5, drip: 0.1, tick: 0.2 };
function remember(name, pos, o) {
  const now = GG().t || 0; D.recent.push({ cue: name, x: pos.x, y: pos.y || 0, z: pos.z || 0, t: now, id: o && o.id, w: SAL[name] });
  if (D.recent.length > 40) D.recent.splice(0, D.recent.length - 40);
}
/* play (or just note, when there is no sound) one cue */
function cue(name, pos, o) {
  o = o || {}; st.heard[name] = (st.heard[name] || 0) + 1;
  if (pos && SAL[name] != null) {
    remember(name, pos, o);
    if (!o.fromBus && !o.noPub && name !== 'drip') FF.bus.emit('sound', { cue: name, x: +pos.x.toFixed(2), y: +(pos.y || 0).toFixed(2), z: +(pos.z || 0).toFixed(2), gain: o.gain == null ? 1 : o.gain, id: o.id || undefined, surface: o.surface, run: o.run || undefined, src: 'audio' });
  }
  if (E && !st.muted && !st.hidden) { try { E.play(name, pos, o); } catch (e) { FF.report(e, 'Audio.play:' + name); } }
}
/* a loop the scene keeps alive this frame */
function hold(id, kind, pos, gain, params, bus) {
  const now = GG().t || 0, was = D.loops[id];
  D.loops[id] = { kind, pos, gain, params, bus, t: now, pub: was ? was.pub : -9 };
  if (pos && (kind === 'engine' || kind === 'buzz') && now - D.loops[id].pub >= 0.5) { D.loops[id].pub = now; FF.bus.emit('sound', { cue: kind === 'buzz' ? 'torch' : kind, id, loop: true, x: +pos.x.toFixed(2), y: +(pos.y || 0).toFixed(2), z: +(pos.z || 0).toFixed(2), gain: gain == null ? 1 : +gain.toFixed(2), src: 'audio' }); }
  if (E && !st.muted && !st.hidden) { try { E.loop(id, kind, pos, gain, params, bus); } catch (e) { FF.report(e, 'Audio.loop:' + kind); } }
}
const xp = name => !!st.explicit[name];

/* the extension interface (see EXTENSIONS in the header): later sequences add cues, loops, beds and reverbs to these
   tables and hook in below; with no extension installed every hook list is empty and Sequence 1 sounds exactly as before */
const X = {
  CUES, CUE_OPT, TRIM, SAL, LOOPS, BEDS, VERB, MARKS, D, st,
  cue, hold, later, spatial, listener, figure: role => figure(role), xp, rnd, rr, clamp, lerp,
  get E() { return E; },
  /* make a room's impulse response now (a later sequence calls this ahead of need, one per frame, so its rooms never stall
     the picture and Sequence 1 draws exactly the same noise as before they existed) */
  prepare(type) { if (E && VERB[type] && !E.irs[type]) { E.irs[type] = makeIR(E.ac, type); return true; } return false; },
  derive: [], walls: [], mix: [], surface: [], land: [], failCue: {}, rest: ['rest'],
  restLike: p => X.rest.indexOf(p) >= 0,
};
const exts = [];

/* surfaces */
function humanSurface(role, p) {
  if (role === 'worker') return 'grate';
  if (role === 'verge') return (p.z || 0) < -4.15 ? 'gravel' : (p.x > 36 ? 'concrete' : 'grass');
  if ((p.y || 0) > 0.6 && p.x > 91.5 && p.x < 98.2) return 'deck';
  if ((p.y || 0) > 0.06) return 'steel';
  return 'wet';
}
function rabbitSurface(r) {
  for (const f of X.surface) { const s = f(r); if (s) return s; }
  if (r.onBox) return 'wood';
  if (r.y < -0.5) return r.x < 53.4 ? 'water' : 'concrete';
  if (r.x < 36.2) return 'grass'; if (r.x < 38.6) return 'wet'; if (r.x < 86) return 'concrete'; if (r.x < 119.2) return 'wet'; return 'grass';
}
/* footsteps from movement: one per stride travelled, silent the moment they stop; teleports never step */
function steps(id, role, p, visible) {
  const tr = D.tr[id] || (D.tr[id] = { x: p.x, y: p.y, z: p.z, acc: 0, v: 0, have: false, lastT: GG().t || 0 });
  const now = GG().t || 0, dt = Math.max(1e-3, now - tr.lastT); tr.lastT = now;
  if (!visible) { tr.have = false; return; }
  if (!tr.have) { Object.assign(tr, { x: p.x, y: p.y, z: p.z, acc: 0.25, v: 0, have: true }); return; }
  const dd = Math.hypot(p.x - tr.x, ((p.y || 0) - (tr.y || 0)) * 1.4, (p.z || 0) - (tr.z || 0)); tr.x = p.x; tr.y = p.y; tr.z = p.z;
  if (dd > 1.2) { tr.acc = 0.25; return; }
  tr.v = lerp(tr.v, dd / dt, clamp(dt * 8, 0, 1));
  if (tr.v < 0.12) { tr.acc = Math.min(tr.acc, 0.3); return; }
  const run = tr.v > 1.9, len = run ? 0.93 : tr.v > 1.15 ? 0.68 : 0.62;
  tr.acc += dd; if (tr.acc < len) return; tr.acc -= len;
  if (xp('step:' + role)) return;
  cue('step', { x: p.x, y: p.y || 0, z: p.z || 0 }, { surface: humanSurface(role, p), run, id: role, w: role === 'worker' ? 0.9 : 1 });
}
const figure = role => { try { const f = FF.Humans && FF.Humans.figures; if (f && f.length) return f.find(k => k.role === role) || null; } catch (_) {} return null; };
function figMoving(role) { const f = figure(role), tr = D.tr['fig:' + role]; return !!(f && f.st && f.st.visible && tr && tr.v > 0.2); }
function findVan() {
  try { const H = FF.Humans; if (H) { if (H.vans && H.vans[0]) return H.vans[0].object; if (H.van && H.van.object) return H.van.object; }
    const sc = FF.Game && FF.Game.scene; if (sc) { const o = sc.getObjectByName('van'); if (o) return o; } } catch (_) {}
  return null;
}

/* ---- the Verge: the van, the gate, the chain (A8: loops while the rabbit lingers), the lock, the torch, the reach */
function deriveVerge(now, r) {
  const V = D.van, VG = D.verge;
  if (V.on && !V.gone) {
    const obj = findVan(); let x = V.x, z = V.z;
    if (obj && obj.visible) { V.fb = false; x = obj.position.x; z = obj.position.z; }
    else if (V.fb) {                       /* no van object: a stand-in path that stops at min(6.0 s, rabbit at 29), never before 3.5 s */
      const age = now - V.t0, dt = Math.max(0, now - (V.ft == null ? now : V.ft)); V.ft = now;
      if (V.stopPlan == null && r && r.x >= 29.0) V.stopPlan = Math.max(3.5, age);
      if (!V.leaving) { const rem = 33 - V.fx, left = Math.max(1 / 60, (V.stopPlan == null ? 6.0 : V.stopPlan) - age); V.fx = rem < 0.03 ? 33 : V.fx + Math.min(16, rem / left * 1.6) * dt; x = V.fx; z = lerp(-8.5, -6.8, clamp((x - 28) / 5, 0, 1)); }
      else { const k = clamp((now - V.leaveT) / 7, 0, 1); x = lerp(33, -26, k * k); z = -8.5; if (k >= 1) V.gone = true; }
    }
    const v = V.lx == null ? 0 : Math.hypot(x - V.lx, z - V.lz) / Math.max(1e-3, now - (V.lt || now)); V.lx = x; V.lz = z; V.lt = now;
    V.v = lerp(V.v, v, 0.2); V.vmax = Math.max(V.vmax, V.v); V.x = x; V.z = z;
    if (!V.stopped && V.vmax > 2 && V.v < 0.3) { V.still += 1 / 60; if (V.still > 0.15) onVanStop(now); } else V.still = 0;
    if (V.stopped && !V.leaving && V.v > 0.8 && now - V.stopT > 2) V.leaving = true;
    if (!V.fb && obj && !obj.visible && V.stopped) V.gone = true;
    if (Math.abs(x - (r ? r.x : 0)) > 70 && V.leaving) V.gone = true;
    if (!V.gone && !xp('engine')) hold('van', 'engine', { x, y: 0.9, z }, 1.5, { rpm: V.stopped && !V.leaving ? 0.05 : clamp(V.v / 9, 0.15, 1), speed: V.v });
  }
  /* fallback: the van leaves once the rabbit is well into the drain (Events / the van object normally drive it) */
  if (V.on && V.fb && V.stopped && !V.leaving && r && (r.x > 50 || GG().place === 'courtyard')) { V.leaving = true; V.leaveT = now; }
  /* the chain loop (fallback when Events sends no gate cues) */
  if (VG.chain && !xp('chain') && !D.vergePhase) {
    if (now >= VG.next) {
      const dur = VG.hard ? rr(1.6, 2.2) : rr(1.2, 2.0);
      cue('chain', { x: 33.0, y: 0.95, z: -4.35 }, { dur, hard: VG.hard }); VG.next = now + dur + (VG.hard ? rr(0.4, 1.0) : rr(0.5, 1.5));
    }
  }
  if (VG.lockAt != null && now >= VG.lockAt) { VG.lockAt = null; VG.chain = false; if (!xp('lock-gives') && !D.vergePhase) { cue('lock-gives', { x: 33.0, y: 0.9, z: -4.3 }); later(0.6, () => { if (!xp('gate-slide') && !D.vergePhase) cue('gate-slide', { x: 33.0, y: 0.8, z: -4.0 }, { dur: 0.6 }); }, 'verge'); } }
  /* the person at the inlet scrapes at the slab while waiting (A8, A14) */
  const pf = figure('verge');
  if (pf && pf.st && pf.st.visible) {
    steps('fig:verge', 'verge', pf.st, true);
    if (pf.st.torch && pf.st.torch.on) hold('torch:verge', 'buzz', { x: pf.st.x, y: (pf.st.y || 0) + 0.9, z: pf.st.z || 0 }, 0.5, { lit: false });
    if (Math.abs(pf.st.x - 38.6) < 1.4 && !figMoving('verge') && !VG.torchDown && !xp('slab-scrape') && now >= VG.scrapeNext) { cue('slab-scrape', { x: 38.75, y: 0.05, z: -0.5 }); VG.scrapeNext = now + rr(1.1, 2.4); }
  } else if (D.tr['fig:verge']) D.tr['fig:verge'].have = false;
}
function onVanStop(now) {
  const V = D.van; V.stopped = true; V.stopT = now; V.leaving = false;
  if (!xp('brakes') && !D.vergePhase) cue('brakes', { x: V.x, y: 0.5, z: V.z });
  later(1.0, () => { if (!xp('door-slam') && !D.vergePhase) cue('door-slam', { x: D.van.x + 1.2, y: 1.0, z: D.van.z + 0.8 }); }, 'verge');
  /* boots from the van to the gate (only if the person figure isn't walking it out itself) */
  for (let k = 0; k < 6; k++) later(1.4 + k * 0.38, () => { if (!figMoving('verge') && !xp('step:verge') && !D.vergePhase) cue('step', { x: 33 + rr(-0.3, 0.3), y: 0, z: lerp(-6.4, -4.6, k / 5) }, { surface: 'gravel', id: 'verge' }); }, 'verge');
  later(3.5, () => { if (!D.verge.personOut) { D.verge.chain = true; D.verge.next = GG().t || 0; } }, 'verge');
}

/* ---- the Courtyard: the walkway worker (A4: unarmed, indifferent), the lamp, the far thud. Timed from FF.S1.walkway.t */
function startWalkway(now) {
  const W = D.walk; if (W.done || W.t0 != null) return; W.t0 = now;
  const T = (FF.S1 && FF.S1.walkway) || { doorL: 78, rail: 81, doorR: 85, z: -14.45, deckY: 3.6, speed: 1.3, t: { boots: [0, 2.5], doorOpen: 2.5, amberOn: 2.5, out: 3.0, atRail: 5.3, leaveRail: 7.8, atDoorR: 10.9, doorShut: 11.5, worksThud: 13.5 } };
  const tt = T.t, z = T.z, y = T.deckY, gate = () => !W.explicit;
  for (let k = 0; k < 5; k++) later(tt.boots[0] + 0.25 + k * 0.48, () => { if (gate() && !xp('step:worker')) cue('step', { x: T.doorL - 1.2 + k * 0.2, y, z: z - 1.6 }, { surface: 'grate', id: 'worker', w: 0.7 + k * 0.06 }); }, 'walk');
  later(tt.amberOn, () => { if (gate() && !xp('relay')) cue('relay', lampPos()); D.walk.lamp = true; }, 'walk');
  later(tt.doorOpen + 0.05, () => { if (gate() && !xp('door-open')) cue('door-open', { x: T.doorL, y: y + 1.0, z }); }, 'walk');
  const walkSteps = (t0, t1, x0, x1) => { const n = Math.floor((t1 - t0) * 1.9); for (let k = 0; k < n; k++) later(t0 + k / 1.9, () => { if (gate() && !figMoving('worker') && !xp('step:worker')) cue('step', { x: lerp(x0, x1, k / n), y, z }, { surface: 'grate', id: 'worker', w: 0.9 }); }, 'walk'); };
  walkSteps(tt.out, tt.atRail, T.doorL, T.rail); walkSteps(tt.leaveRail, tt.atDoorR, T.rail, T.doorR);
  later(tt.atRail + 0.6, () => { if (gate() && !xp('horn')) cue('horn', { x: T.rail + 30, y: 12, z: -70 }); }, 'walk');
  later(tt.doorShut, () => { if (gate() && !xp('door-shut')) cue('door-shut', { x: T.doorR, y: y + 1.0, z }); }, 'walk');
  later(tt.worksThud, () => startThud(), 'walk');
  later(tt.worksThud + 0.5, () => { W.done = true; }, 'walk');
}
function lampPos() { try { const p = FF.World && FF.World.prop && FF.World.prop('amberLamp'); if (p && (p.position.x || p.position.y)) { const v = p.getWorldPosition ? p.getWorldPosition(new THREE.Vector3()) : p.position; return { x: v.x, y: v.y, z: v.z }; } } catch (_) {} return { x: 79.5, y: 5.2, z: -12.5 }; }
function startThud() { if (D.thud.on) return; D.thud.on = true; D.thud.next = GG().t || 0; }
function deriveWorld(now, r) {
  /* the Works thud every 4.0 s, from the walkway beat on (or once the Search is reached), quietly; a fact for the World too */
  if (D.thud.on && now >= D.thud.next) {
    D.thud.next = Math.max(now, D.thud.next) + 4.0; D.thud.n++;
    if (!xp('thud')) { const fx = (r ? r.x : 80) + 70, place = GG().place; cue('thud', { x: fx, y: 14, z: -55 }, { gain: place === 'rest' ? 0.7 : 1.0, id: 'works' }); }
  }
  /* the machinery rhythm beyond the wall after the far boom (the Verge; muffled in the drain) */
  const m = mixNow(GG());
  if (D.mach.on && m.mach > 0.05 && now >= D.mach.next) { D.mach.next = now + 1.6; if (!xp('machine')) cue('machine', { x: (r ? r.x : 20) + 55, y: 4, z: -40 }, { gain: m.mach }); }
  /* the courtyard's walkway trigger (when Events sends no walkway phases): the first push, the first reach-fail,
     6 s after x 71, or 25 s after entering the Courtyard */
  const W = D.walk;
  if (!W.done && W.t0 == null && !W.explicit && r) {
    if (W.enterT == null && GG().place === 'courtyard') W.enterT = now;
    if ((W.enterT != null && now - W.enterT >= 25) || (W.x71T != null && now >= W.x71T)) startWalkway(now);
  }
  if (W.lamp && GG().place === 'courtyard' && !xp('lamp')) hold('lamp', 'mains', lampPos(), 3.0);
  /* the van ticking as it cools, parked behind the annex gateway (the Search) */
  if (GG().place === 'search' && !xp('tick')) { if (!D.tickNext || now > D.tickNext + 5) D.tickNext = now + rr(0.5, 2); if (now >= D.tickNext) { cue('tick', { x: 101.5 + rr(-1, 1), y: 0.6, z: -5.8 }); D.tickNext = now + rr(0.7, 2.6); } }
}

/* ---- the Search: the searcher's footsteps, torch, entry, telegraphs and the drone (A6, A7: every cue readable by ear) */
function deriveSearcher(now, r) {
  const s = GG().searcher, S = D.srch;
  const on = !!(s && s.active && !/^(off|wait)$/.test(s.state || '')), visible = on && s.kind !== 'cue';
  if (!on) { if (S.state !== 'off') { S.state = 'off'; S.alert = 0; } if (D.tr.searcher) D.tr.searcher.have = false; return; }
  steps('searcher', 'searcher', { x: s.x, y: s.y, z: s.z }, visible);
  /* the torch: a faint buzz at the lens (brighter while its light is on the rabbit); a click when it comes on */
  const torch = visible && !!s.torchOn;
  if (torch) {
    if (!S.torch && now - S.offT > 0.6 && !xp('torch-click')) cue('torch-click', { x: s.x, y: (s.y || 0) + 1.2, z: s.z });
    const k = s.kneel, lens = { x: s.x + (k ? 0.35 : 0.32) * (s.face || 0), y: (s.y || 0) + (k ? 0.4 : 1.25), z: s.z };
    if (!xp('buzz')) hold('torch:searcher', 'buzz', lens, s.lit > 0 ? 0.9 : 0.55, { lit: s.lit > 0 });
  } else if (S.torch) S.offT = now;
  S.torch = torch;
  /* state telegraphs */
  const stt = s.state || '';
  if (stt !== S.state) {
    const from = S.state; S.state = stt;
    if (/spotted/.test(stt) && !xp('breath')) cue('breath', { x: s.x, y: (s.y || 0) + 1.6, z: s.z });
    if (/aim/.test(stt) && !/aim/.test(from)) { const raise = (FF.RULES && FF.RULES.searcher.aim.raise) || 0.5; later(raise, () => { const s2 = GG().searcher; if (s2 && /aim/.test(s2.state) && !xp('aim-click')) cue('aim-click', { x: s2.x, y: (s2.y || 0) + 1.4, z: s2.z }); }, 'srch'); }
    if (/grab|lunge/.test(stt) && !xp('lunge')) cue('lunge', { x: s.x, y: (s.y || 0) + 1.0, z: s.z });
    if (/hide/.test(stt) && !xp('kneel')) { cue('kneel', { x: s.x, y: s.y || 0, z: s.z }); later(1.0, () => { const s2 = GG().searcher; if (s2 && /hide/.test(s2.state) && !xp('reach')) cue('reach', { x: s2.x, y: 0.15, z: s2.z }); }, 'srch'); }
  }
  /* the entry's own beats when the AI only says 'cue' (kind changes are read from G.searcher.kind) */
  if (s.kind !== S.prevKind) {
    const k = s.kind, prev = S.prevKind; S.prevKind = k;
    if (k === 'turn' && prev === 'sweep-left' && !xp('fence-clatter')) cue('fence-clatter', { x: 113.25, y: 0.8, z: -0.4 });
    if (k === 'aim-demo') later(0.5, () => { if (!xp('aim-click')) { const s2 = GG().searcher; cue('aim-click', { x: s2.x, y: 1.4, z: s2.z }); } }, 'srch');
    if (k === 'crouch-look' && !xp('kneel')) later(0.4, () => cue('kneel', { x: GG().searcher.x, y: 0, z: GG().searcher.z }), 'srch');
  }
  /* the drone (from NOTICE, rising to a pulse in pursuit) and the ambience ducking 6 dB during the aim */
  const lv = /grab|lunge/.test(stt) ? 0.9 : /pursue/.test(stt) ? 0.85 : /aim/.test(stt) ? 0.8 : /spotted/.test(stt) ? 0.65 : /hide/.test(stt) ? 0.55 : /notice/.test(stt) ? 0.38 : /investigate/.test(stt) ? 0.28 : /lower/.test(stt) ? 0.6 : /gap/.test(stt) ? 0.3 : /lost|search/.test(stt) ? 0.22 : /wary|return/.test(stt) ? 0.12 : 0;
  S.alert = lv > S.alert ? lerp(S.alert, lv, 0.25) : Math.max(lv, S.alert - (1 / 60) / 4);
  D.aimDuck = /aim/.test(stt);
  if (S.alert > 0.02 && !xp('drone')) hold('drone', 'drone', null, 0.13 * S.alert, { level: S.alert, pulse: /pursue|grab/.test(stt) ? 1 : 0 });
  /* the rabbit's heartbeat under threat: alert, or him right over its hiding place */
  if (r) {
    const near = Math.abs(s.x - r.x) < (s.y > 0.6 ? 2.2 : 3.0), hidden = FF.Level && FF.Level.coreAt && FF.Level.coreAt(r.x);
    const threat = S.alert > 0.25 ? S.alert : (near && visible ? 0.3 : 0) + (hidden && near ? 0.1 : 0);
    if (threat > 0.15 && now >= S.heartNext) { cue('heart', null, { w: clamp(threat * 1.3, 0.3, 1) }); S.heartNext = now + 1 / lerp(1.25, 2.3, clamp(threat, 0, 1)); }
  }
}
function onEntryCue() {
  const now = GG().t || 0; D.entry = { t0: now };
  /* four footsteps behind the door, all before it opens (the cue is 1.35 s since the door reveal shortened the entry) */
  const segs = (FF.S1 && FF.S1.searcher && FF.S1.searcher.entry) || []; const doorAt = segs.length ? segs[0][1] : 2.5;
  const gap = Math.min(0.55, Math.max(0.25, (doorAt - 0.4) / 3));
  for (let k = 0; k < 4; k++) later(0.3 + k * gap, () => { if (!xp('step:searcher')) cue('step', { x: 110 + rr(-0.4, 0.4), y: 0, z: -3.9 - (3 - k) * 0.6 }, { surface: 'concrete', id: 'searcher', w: 0.8 }); }, 'entry');
  later(doorAt + 0.15, () => { if (D.entry && !D.entry.door && !xp('door-open')) { D.entry.door = true; cue('door-open', { x: 110.0, y: 1.0, z: -3.0 }); } }, 'entry');
}

/* ---- the rabbit: paws by surface, the squeeze, the box, the duct, poses close-miked, breath */
function deriveRabbit(now, r) {
  const R = D.rab, G = GG();
  if (!r || r.visible === false) { R.x = null; }
  else if (r.mode === 'play') {
    if (R.x == null || Math.abs(r.x - R.x) > 1.0) { R.x = r.x; R.acc = 0.1; }
    const dx = Math.abs(r.x - R.x); R.x = r.x; const v = Math.abs(r.vx || 0);
    if (r.grounded && v > 0.12 && !r.squeeze && !xp('paw')) {
      R.acc += dx; const L = v > 2.0 ? 0.62 : v > 1.3 ? 0.46 : 0.3;
      if (R.acc >= L) { R.acc -= L; cue('paw', { x: r.x, y: r.y, z: 0 }, { surface: rabbitSurface(r), w: clamp(v / 2.75, 0.35, 1.1) }); }
    }
    if (r.squeeze && v > 0.04 && !xp('fur')) hold('fur', 'fur', { x: r.x, y: r.y, z: 0 }, r.y < -0.5 ? 0.5 : 0.35, { v: v / 1.6 });
  }
  /* the box (head-push): a knock on contact, a scrape with its speed, a dull knock at the kerb */
  const b = G.box;
  if (b && !xp('box-scrape')) {
    const v = Math.abs(b.vx || 0), B = D.box; B.v = v;
    if (v > 0.03) {
      if (!B.moving) { B.moving = true; cue('box-tok', { x: b.x, y: 0.3, z: 0 }); if (!B.firstPush) { B.firstPush = true; if (!D.walk.explicit) startWalkway(now); } }
      hold('box', 'scrape', { x: b.x, y: 0.05, z: 0 }, clamp(v / 0.62, 0, 1) * 0.42, { v: v / 0.62 });
      if (b.maxX != null && b.x >= b.maxX - 0.005 && B.x != null && B.x < b.maxX - 0.005) cue('box-stop', { x: b.x, y: 0.2, z: 0 });
    } else B.moving = false;
    B.x = b.x;
  }
  /* claws on sheet metal through the duct */
  if (R.claws) {
    const k = (now - R.claws.t0) / R.claws.dur;
    if (k >= 1) R.claws = null;
    else if (now >= R.claws.next) { cue('claw', { x: lerp(76.2, 87.0, k), y: 0.95, z: -0.7 }); R.claws.next = now + rr(0.08, 0.2); }
  }
  /* poses, close-miked (the rest is the most intimate) */
  if (r && r.mode === 'play') {
    const pose = r.pose || null, closeK = X.restLike(G.place) ? 1 : G.place === 'verge' ? 0.55 : 0.75;
    if (pose !== R.pose) { R.pose = pose; R.poseNext = now; if (pose && /shake/.test(pose)) cue('shake', { x: r.x, y: r.y, z: 0 }, { gain: closeK }); if (pose && /settle|loaf|lie/.test(pose)) cue('settle', { x: r.x, y: r.y, z: 0 }, { gain: closeK }); }
    if (pose && now >= R.poseNext) {
      if (/groom|wash/.test(pose)) { cue('groom', { x: r.x, y: r.y, z: 0 }, { gain: closeK }); R.poseNext = now + rr(0.4, 0.6); }
      else if (/sniff/.test(pose)) { cue('sniff', { x: r.x, y: r.y, z: 0 }, { gain: closeK }); R.poseNext = now + rr(0.7, 1.2); }
      else if (/nibble|eat/.test(pose)) { cue('nibble', { x: r.x, y: r.y, z: 0 }, { gain: closeK }); R.poseNext = now + rr(0.5, 0.8); }
      else R.poseNext = now + 0.5;
    }
    /* the warm pad: the first music, at the groom in the breathing space */
    if (X.restLike(G.place) && pose && /groom/.test(pose) && G.mode === 'play') D.end.pad = true;
    /* breath, close-miked: in the squeeze pipe, hidden in the Search, and in the breathing space; held while a beam is close */
    const s = G.searcher, inCore = G.place === 'search' && FF.Level && FF.Level.coreAt && FF.Level.coreAt(r.x);
    const ctxW = r.squeeze && r.y < -0.5 ? 0.9 : inCore ? 0.8 : X.restLike(G.place) ? 1.0 : 0;
    if (ctxW > 0 && now >= R.breathNext) {
      const mood = r.mood || 'calm', hz = { calm: 1.0, alert: 1.6, afraid: 2.4, fleeing: 2.8, flee: 2.8, recovering: 1.6, recover: 1.6, settled: 0.6 }[mood] || (G.place === 'search' ? 2.4 : 1.0);
      const heldK = s && s.lit > 0 ? 0.3 : 1;
      cue('rbreath', { x: r.x, y: r.y, z: 0 }, { rate: hz, w: ctxW * heldK }); R.breathNext = now + 1 / hz;
    }
  }
  if (D.end.pad && !xp('pad')) hold('pad', 'pad', null, 1.4 * (1 - clamp(G.fade || 0, 0, 1)), null, 'music');
}

/* ---- Events' phase events (names matched loosely; any of them switches the timed fallback for that beat off) */
function onPhase(kind, d) {
  const ph = String((d && (d.phase || d.arg)) || ''), V = D.van, now = GG().t || 0;
  if (kind === 'vehicle') {
    D.vergePhase = true; V.fb = !findVan();
    if (/approach|arrive|start|drive/.test(ph)) { if (!V.on) { V.on = true; V.t0 = now; } }
    else if (/brake|stop/.test(ph)) { if (!xp('brakes')) cue('brakes', { x: V.x, y: 0.5, z: V.z }); V.stopped = true; V.stopT = now; }
    else if (/door/.test(ph)) { if (!xp('door-slam')) cue('door-slam', { x: V.x + 1.2, y: 1.0, z: V.z + 0.8 }); }
    else if (/leave|revers|depart|away|go$/.test(ph)) { V.leaving = true; V.leaveT = now; }
    else if (/gone|off|end/.test(ph)) V.gone = true;
  } else if (kind === 'gate') {
    D.vergePhase = true; const g = { x: 33.0, y: 0.95, z: -4.35 };
    if (/rattle|chain|burst/.test(ph)) { if (!xp('chain')) cue('chain', g, { dur: (d && d.dur) || 1.6, hard: !!(d && d.hard) }); }
    else if (/jolt/.test(ph)) { if (!xp('gate-jolt')) cue('gate-jolt', g); }
    else if (/lock|give/.test(ph)) { if (!xp('lock-gives')) cue('lock-gives', g); D.verge.chain = false; }
    else if (/slide|crack|open/.test(ph)) { if (!xp('gate-slide')) cue('gate-slide', g, { dur: 0.6 }); }
    else if (/close|shut/.test(ph)) { if (!xp('gate-close')) cue('gate-close', g); }
  } else if (kind === 'walkway') {
    const W = D.walk; W.explicit = true; D.timeline = D.timeline.filter(e => e.tag !== 'walk');
    const T = (FF.S1 && FF.S1.walkway) || { doorL: 78, doorR: 85, rail: 81, z: -14.45, deckY: 3.6 };
    if (/lamp|amber|relay/.test(ph)) { if (!xp('relay')) cue('relay', lampPos()); W.lamp = true; }
    else if (/door.*(open)|^open/.test(ph)) { if (!xp('door-open')) cue('door-open', { x: T.doorL, y: T.deckY + 1, z: T.z }); if (!W.lamp) { W.lamp = true; if (!xp('relay')) cue('relay', lampPos()); } }
    else if (/shut|close|in$/.test(ph)) { if (!xp('door-shut')) cue('door-shut', { x: T.doorR, y: T.deckY + 1, z: T.z }); }
    else if (/rail/.test(ph) && !/leave/.test(ph)) { later(0.6, () => { if (!xp('horn')) cue('horn', { x: T.rail + 30, y: 12, z: -70 }); }, 'walkx'); }
    else if (/thud|works/.test(ph)) startThud();
    else if (/boots|start|begin/.test(ph)) { for (let k = 0; k < 5; k++) later(0.25 + k * 0.48, () => { if (!figMoving('worker') && !xp('step:worker')) cue('step', { x: T.doorL - 1.2 + k * 0.2, y: T.deckY, z: T.z - 1.6 }, { surface: 'grate', id: 'worker', w: 0.75 }); }, 'walkx'); }
    if (/done|end/.test(ph)) W.done = true;
  } else if (kind === 'torch-down') {
    D.verge.torchDown = !/off|up|end|withdraw/.test(ph);
    if (D.verge.torchDown && !xp('torch-click')) cue('torch-click', { x: 38.75, y: 0.4, z: -0.5 });
    if (/reach/.test(ph) && !xp('reach')) cue('reach', { x: 38.75, y: -0.3, z: -0.3 });
  }
}

/* ================================================================== the module */
const Audio = FF.Audio = {
  stub: false,
  init() {
    resetScene(FF.S1 && FF.S1.checkpoints ? FF.S1.checkpoints[0] : null, 'title');
    const on = (n, f) => FF.bus.on(n, f);
    on('sound', d => {
      if (!d || d.src === 'audio') return;
      if (d.id && d.loop !== undefined) {                     /* a loop by id: {id, cue, loop: true, x, y, z, gain} starts or moves it; {id, loop: false} stops it */
        const id = 'x:' + d.id;
        if (d.loop && d.cue) {
          st.explicit[d.cue] = true;
          D.loops[id] = { kind: d.cue, pos: d.x != null ? { x: d.x, y: d.y || 0, z: d.z || 0 } : null, gain: d.gain == null ? 1 : d.gain, keep: true, t: GG().t || 0 };
          if (E && !st.muted && !st.hidden && LOOPS[d.cue]) { const L = E.loop(id, d.cue, D.loops[id].pos, D.loops[id].gain, d); L.keep = true; }
        } else { delete D.loops[id]; if (E) E.loopStop(id); }
        return;
      }
      if (!d.cue) return;
      if (d.stop) { delete D.loops['x:' + (d.id || d.cue)]; if (E) E.loopStop('x:' + (d.id || d.cue)); return; }
      const who = d.id || d.who; st.explicit[d.cue] = true; if (d.cue === 'step' && who) st.explicit['step:' + who] = true;
      cue(d.cue, d.x != null ? { x: d.x, y: d.y || 0, z: d.z || 0 } : null, Object.assign({}, d, { fromBus: true }));
    });
    on('fail', d => {
      D.black = true; D.timeline = D.timeline.filter(e => e.tag === 'keep');
      if (E) { const t = E.ac.currentTime; E.world.gain.cancelScheduledValues(t); E.world.gain.setValueAtTime(0, t); E.world.gain._ffv = 0; for (const id of [...E.loops.keys()]) E.loopStop(id, 0.02); }
      if (d && d.kind === 'caught') cue('squeak', null, {});                         // polish pass: the tiny restrained squeak at the moment of capture, then the scuff under the black
      cue(X.failCue[d && d.kind] || ((d && d.kind) === 'shot' ? 'shot' : 'scuff'), null, {});
    });
    on('restart', d => {
      const cp = FF.Game && FF.Game.cp ? FF.Game.cp(d && d.cp) : null;
      resetScene(cp, d && d.reason); D.black = false;
      if (E) for (const id of [...E.loops.keys()]) E.loopStop(id, d && d.reason === 'fail' ? 0.02 : 0.3);
    });
    on('vehicle-arrive', () => { const V = D.van; if (!V.on && !V.gone) { V.on = true; V.t0 = GG().t || 0; V.x = V.fx = -12; V.z = -8.5; V.ft = null; } });
    on('gate-lit', () => {
      const VG = D.verge; if (!VG.chain || xp('chain') || D.vergePhase) return;
      VG.next = (GG().t || 0) + 1.0; VG.hard = true;       // the rattle stops dead, a second of silence, then harder
    });
    on('person-out', () => {
      const VG = D.verge, V = D.van, now = GG().t || 0; if (VG.personOut) return; VG.personOut = true;
      const stopT = V.stopT != null ? V.stopT : (V.on ? V.t0 + 6.0 : now);
      VG.lockAt = Math.max(now + 0.6, stopT + 4.0);
    });
    on('rabbit-in-pipe', () => { D.verge.inPipeT = GG().t || 0; });
    on('sound-cue', d => { if (d && d.arg === 'far-boom' && !D.mach.boom) { D.mach.boom = true; if (!xp('far-boom')) cue('far-boom', { x: (GG().rabbit ? GG().rabbit.x : 12) + 60, y: 8, z: -45 }); D.mach.on = true; D.mach.next = (GG().t || 0) + 3.2; } });
    on('walkway-timer', d => { const W = D.walk; if (W.x71T == null) W.x71T = (GG().t || 0) + ((d && +d.arg) || 6.0); });
    on('rabbit:reach-fail', () => { if (!D.walk.explicit) startWalkway(GG().t || 0); });
    on('transit', d => {
      const ph = d && d.phase, now = GG().t || 0;
      if (ph === 'climb') { for (let k = 0; k < 4; k++) later(k * 0.12, () => cue('claw', { x: 76.0, y: 0.82, z: -0.5 }), 'duct'); later(0.3, () => cue('paw', { x: 76.0, y: 0.8, z: -0.5 }, { surface: 'metal', w: 0.6 }), 'duct'); }
      else if (ph === 'start') D.rab.claws = { t0: now, dur: ((FF.S1.links || []).find(l => l.id === 'duct') || {}).transit || 3.8, next: now };
      else if (ph === 'end') { D.rab.claws = null; later(0.45, () => cue('sniff', { x: 87.3, y: 0.82, z: 0 }), 'duct'); later(1.2, () => cue('land', { x: 87.6, y: 0, z: 0 }, { h: 0.8, surface: 'wet' }), 'duct'); }
    });
    const surf = (sf, r) => { if (r) for (const f of X.surface) { const s = f(r, sf); if (s) return s; } sf = String(sf || ''); return /wet/.test(sf) ? 'wet' : /water/.test(sf) ? 'water' : /wood/.test(sf) ? 'wood' : /metal|duct/.test(sf) ? 'metal' : /grass/.test(sf) ? 'grass' : /concrete/.test(sf) ? 'concrete' : (r ? rabbitSurface(r) : 'grass'); };
    on('rabbit:land', d => {
      const r = GG().rabbit; if (!r || xp('land')) return;
      for (const f of X.land) if (f(d, r)) return; const h = d && d.h != null ? +d.h : (r.airT || 0.3) * 1.6;
      if (d && d.y < -0.8 && d.x > 38.3 && d.x < 39.8) cue('splash', { x: d.x, y: d.y, z: 0 });
      else if (h > 0.08) cue('land', { x: r.x, y: r.y, z: 0 }, { h: clamp(h, 0.15, 1.2), surface: surf(d && d.surface, r) });
    });
    /* the Player's footfalls follow the gait: once they come, the distance-based paws stop */
    on('rabbit:step', d => { if (!d) return; st.explicit.paw = true; const r = GG().rabbit; cue('paw', { x: d.x, y: d.y || 0, z: 0 }, { surface: surf(d.surface, r), w: clamp(0.45 + 0.55 * (+d.run || 0), 0.35, 1.0) }); });
    on('rabbit:jump', d => { if (d) cue('paw', { x: d.x, y: d.y || 0, z: 0 }, { surface: surf(null, GG().rabbit), w: 0.5 }); });
    on('person', d => { const f = figure('verge'); if (d && /kneel/.test(d.phase || '') && f && !xp('kneel')) cue('kneel', { x: f.st.x, y: 0, z: f.st.z || 0 }, { id: 'verge' }); });
    on('rabbit:pose', d => { if (d && d.pose && GG().rabbit) { const p = d.pose, r = GG().rabbit; if (/groom/.test(p) && X.restLike(GG().place)) D.end.pad = true; if (/shake/.test(p)) cue('shake', { x: r.x, y: r.y, z: 0 }); } });
    on('box', d => { if (d && d.moving && !D.box.firstPush) { D.box.firstPush = true; if (!D.walk.explicit) startWalkway(GG().t || 0); } });
    on('entry', d => { if (!d) return; if (d.phase === 'cue') onEntryCue(); else if (d.phase === 'doorway' && D.entry && !D.entry.door) { D.entry.door = true; if (!xp('door-open')) cue('door-open', { x: 110.0, y: 1.0, z: -3.0 }); } });
    on('end', d => { if (d && /settled|pullout/.test(d.phase || '')) D.end.pad = true; });
    for (const k of ['vehicle', 'gate', 'walkway', 'torch-down']) on(k, d => onPhase(k, d));
    on('mode', d => { if (!d) return; if (d.to === 'title') D.end.pad = false; if (d.from === 'pause' && d.to !== 'pause' && !document.hidden) Audio.hidden(false); });   /* leaving pause by any road (resume, restart, the title) un-hides the sound */
    /* the next real key or click (a user gesture) resumes a suspended context (autoplay rules), or unlocks one never unlocked */
    const wake = () => {
      if (!E && !FF.SILENT && FF.G && FF.G.mode !== 'notice' && FF.G.mode !== 'boot') Audio.unlock();   /* a start that skipped the notice (?cp=) */
      if (E && !E.offline && E.ac.state === 'suspended' && !st.muted && !st.hidden) E.ac.resume().catch(() => {});
    };
    addEventListener('keydown', wake, true); addEventListener('pointerdown', wake, true);
    Audio._wake = wake;
    /* later sequences' sound (FF.AUDIO_EXT, loaded after this file): each adds to the tables and hooks of X */
    for (const m of FF.AUDIO_EXT || []) { if (exts.indexOf(m) >= 0) continue; try { m.install(X); exts.push(m); } catch (e) { FF.report(e, 'Audio.ext:' + (m && m.name)); } }
  },
  /* from a user gesture (the notice's Continue, the title's start; also any later key). Makes the context only when sound
     is on: muted players never get one. Never with ?mute=1. */
  unlock() {
    if (FF.SILENT) return; st.unlocked = true;
    if (!st.muted) makeLive();
    else if (E && E.ac.state === 'suspended') E.ac.resume().catch(() => {});
  },
  mute(on) {
    st.muted = !!on; if (FF.SILENT) return;
    if (!st.muted && st.unlocked && !E) makeLive();
    if (E && !E.offline) { if (!st.muted && !st.hidden) E.ac.resume().catch(() => {}); E.to(E.master.gain, st.muted || st.hidden ? 0 : 0.9, 0.05); if (st.muted) suspendSoon(); }
  },
  music(on) { st.music = !!on; },
  hidden(on) { st.hidden = !!on; if (E && !E.offline) { E.to(E.master.gain, st.muted || st.hidden ? 0 : 0.9, 0.05); if (st.hidden) suspendSoon(); else if (!st.muted) E.ac.resume().catch(() => {}); } },
  reset() {},
  frame(dt) {
    const G = FF.G; if (!G) return;
    try {
      runTimeline();
      const now = G.t || 0, r = G.rabbit;
      for (const k in D.loops) { const l = D.loops[k]; if (l && !l.keep && l.t < now - 0.3) { if (l.pub > -9 && l.pos) FF.bus.emit('sound', { cue: l.kind === 'buzz' ? 'torch' : l.kind, id: k, stop: true, gain: 0, x: l.pos.x, src: 'audio' }); delete D.loops[k]; } }
      if (G.mode === 'play' || G.mode === 'title') {
        deriveRabbit(now, r); deriveVerge(now, r); deriveWorld(now, r); deriveSearcher(now, r);
        const fig = figure('worker'); if (fig && fig.st) steps('fig:worker', 'worker', fig.st, !!fig.st.visible);
        for (const f of X.derive) { try { f(now, r, dt); } catch (e) { FF.report(e, 'Audio.derive'); } }
      }
      if (G.mode === 'title' || G.mode === 'end') D.end.pad = G.mode === 'end' ? D.end.pad : false;
      if (D.end.pad && G.mode === 'end' && E && !st.muted) E.loop('pad', 'pad', null, 1.4 * (1 - clamp(G.fade || 0, 0, 1)), null, 'music');
      if (E && !st.muted && !st.hidden) E.update(dt, D);
    } catch (e) { FF.report(e, 'Audio.frame'); }
  },
  /* plays a cue now: FF.Audio.play('door-shut', { x, y, z, gain }) (the same as emitting 'sound') */
  play(name, opts) { opts = opts || {}; cue(name, opts.x != null ? { x: opts.x, y: opts.y || 0, z: opts.z || 0 } : null, opts); },
  /* the end card's chord (UI.endCard calls it as the card fades in) */
  endChord() { cue('end-chord', null, {}); },
  /* what the rabbit can hear now: recent and continuous sources, loudest first, for the ears (A2) */
  sources() {
    const now = (FF.G && FF.G.t) || 0, L = listener(), out = [];
    for (const e of D.recent) if (now - e.t < 2.0) { const s = spatial(e, L); out.push({ cue: e.cue, x: e.x, y: e.y, z: e.z, id: e.id || null, w: e.w, level: +(s.g * (1 - (now - e.t) / 2)).toFixed(3), age: +(now - e.t).toFixed(2) }); }
    for (const k in D.loops) { const l = D.loops[k]; if (l && l.pos && l.kind !== 'pad') { const s = spatial(l.pos, L); out.push({ cue: l.kind === 'buzz' ? 'torch' : l.kind, x: l.pos.x, y: l.pos.y || 0, z: l.pos.z || 0, id: k, w: SAL[l.kind] || 0.5, level: +(s.g * (l.gain || 1)).toFixed(3), age: 0 }); } }
    return out.sort((a, b) => b.level * (b.w || 0.5) - a.level * (a.w || 0.5)).slice(0, 8);
  },
  /* master level now: { rms, peak } (linear), for tests */
  level() {
    if (!E) return { rms: 0, peak: 0 };
    const a = new Float32Array(E.ana.fftSize); E.ana.getFloatTimeDomainData(a); let s = 0, p = 0; for (const v of a) { s += v * v; p = Math.max(p, Math.abs(v)); }
    return { rms: Math.sqrt(s / a.length), peak: p };
  },
  /* renders the same engine into an OfflineAudioContext: tick(dt, t) advances the game by dt (call __ff.step there).
     Returns a Promise<AudioBuffer>. Settings are bypassed for the render (test and preview hook). */
  async renderOffline(seconds, tick, sr) {
    if (FF.SILENT || typeof OfflineAudioContext === 'undefined') return null;
    sr = sr || 32000; const oac = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr);
    const saved = { E, muted: st.muted, hidden: st.hidden }; liveE = E; E = new Engine(oac, true); E.master.gain.value = 0.9; st.muted = false; st.hidden = false;
    const q = 1024 / sr; let k = 1;
    const next = () => { const at = Math.round((k * (1 / 30)) / q) * q; if (at >= seconds - q) return; oac.suspend(at).then(() => { try { tick(1 / 30, at); } catch (e) { FF.report(e, 'Audio.offline'); } k++; next(); oac.resume(); }); };
    next();
    try { return await oac.startRendering(); } finally { E = saved.E; liveE = null; st.muted = saved.muted; st.hidden = saved.hidden; }
  },
  /* calibration (tests): each named cue alone at point blank (no distance), beds silent -> [{cue, peak, rms}] (dBFS) */
  async lab(names, gap) {
    if (FF.SILENT || typeof OfflineAudioContext === 'undefined') return null;
    gap = gap || 2.5; const sr = 32000, oac = new OfflineAudioContext(2, Math.ceil((names.length * gap + 1) * sr), sr), E2 = new Engine(oac, true);
    E2.master.gain.value = 0.9; E2.amb.gain.value = 0; E2.music.gain.value = 1; for (const mk of E2.bed.marks) mk.out.gain.value = 0;
    names.forEach((n, i) => { const nm = n.split(':')[0], o = {}; if (n.includes(':')) o.surface = n.split(':')[1]; o.delay = i * gap + 0.2; E2.play(nm, null, o); });
    const buf = await oac.startRendering(), L = buf.getChannelData(0), R = buf.getChannelData(1), out = [];
    names.forEach((n, i) => { let p = 0, ss = 0, k = 0; for (let j = Math.floor(i * gap * sr); j < Math.min(L.length, Math.floor((i + 1) * gap * sr)); j++) { const v = Math.max(Math.abs(L[j]), Math.abs(R[j])); p = Math.max(p, v); ss += L[j] * L[j]; k++; } out.push({ cue: n, peak: +(20 * Math.log10(p || 1e-9)).toFixed(1), rms: +(10 * Math.log10(ss / k || 1e-12)).toFixed(1) }); });
    return out;
  },
  /* calibration (tests): a loop kind alone at point blank for 1.5 s -> {kind, peak, rms} (dBFS) */
  async labLoop(kind, params) {
    const mark = /^mark:/.test(kind) ? kind.slice(5) : null;
    if (FF.SILENT || typeof OfflineAudioContext === 'undefined' || (!LOOPS[kind] && !mark)) return null;
    const sr = 32000, oac = new OfflineAudioContext(2, sr * 2, sr), E2 = new Engine(oac, true);
    E2.master.gain.value = 0.9; E2.amb.gain.value = 0; E2.music.gain.value = 1; for (const mk of E2.bed.marks) mk.out.gain.value = mk.m.id === mark ? mk.m.gain : 0;
    if (!mark) { const L = E2.loop('lab', kind, null, 1, params || {}, kind === 'pad' ? 'music' : null); L.out.gain.cancelScheduledValues(0); L.out.gain.value = 1; }
    const buf = await oac.startRendering(), d = buf.getChannelData(0); let p = 0, ss = 0, k = 0;
    for (let j = sr / 2; j < d.length; j++) { p = Math.max(p, Math.abs(d[j])); ss += d[j] * d[j]; k++; }
    return { kind, peak: +(20 * Math.log10(p || 1e-9)).toFixed(1), rms: +(10 * Math.log10(ss / k || 1e-12)).toFixed(1) };
  },
  dispose() { if (E) E.dead = true; if (Audio._wake) { removeEventListener('keydown', Audio._wake, true); removeEventListener('pointerdown', Audio._wake, true); } clearTimeout(suspT); if (E && !E.offline) try { E.ac.close(); } catch (_) {} E = null; },
  get muted() { return st.muted; },
  debug() {
    const o = Audio.debugS1();
    for (const m of exts) if (m.debug) { try { o[m.name || 'ext'] = m.debug(); } catch (e) { o[m.name || 'ext'] = { err: String(e && e.message || e) }; } }
    return o;
  },
  debugS1() {
    return { stub: false, silent: !!FF.SILENT, unlocked: st.unlocked, muted: st.muted, music: st.music, hidden: st.hidden, context: E ? E.ac.state : null, made: st.made, failed: st.failed || undefined,
      bed: E && E.mix ? { rain: +E.mix.rain.toFixed(2), wind: +E.mix.wind.toFixed(2), verb: E.mix.verb } : null, loops: E ? [...E.loops.keys()] : Object.keys(D.loops),
      black: D.black, thud: D.thud && D.thud.on, van: D.van && { on: D.van.on, fb: D.van.fb, stopped: D.van.stopped, leaving: D.van.leaving, gone: D.van.gone, x: +D.van.x.toFixed(1) },
      chain: D.verge && D.verge.chain, walkway: D.walk && { t0: D.walk.t0, done: D.walk.done, explicit: D.walk.explicit }, explicit: Object.keys(st.explicit), heard: Object.assign({}, st.heard) };
  },
};
let suspT = 0;
function suspendSoon() { clearTimeout(suspT); suspT = setTimeout(() => { if (E && !E.offline && (st.muted || st.hidden) && E.ac.state === 'running') E.ac.suspend().catch(() => {}); }, 300); }
function makeLive() {
  if (E || FF.SILENT) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) { st.failed = 'no Web Audio'; return; }
  try {
    let ac = null; try { ac = new AC({ latencyHint: 'interactive', sampleRate: 32000 }); } catch (_) { ac = new AC({ latencyHint: 'interactive' }); }
    st.made++;
    E = new Engine(ac); if (ac.state === 'suspended') ac.resume().catch(() => {});
  } catch (e) { st.failed = String(e && e.message || e); E = null; FF.report(e, 'Audio.unlock'); }
}
})();
