/* ROOTLIGHT — audio.js (AUDIO). RL.Audio: every tune and sound is synthesised with WebAudio in code; no files, all original.
   Graph:
     sfx voices, the focus hum ───────────────────→ sfx bus ─────────────────────────┬→ master (mute) → compressor → limiter → trim → out
     a tune: lead (+ echo), pad, arp, bass → lowpass ┐                              │
             drums, ambience ────────────────────────┴→ tune fader → music bus (music on/off) → duck ┘
     music (× the tune's 'verb') + sfx (× the tune's 'space') → one cave reverb (a generated impulse) → master
   With ?mute=1 every call is a no-op and no AudioContext is ever made. Nothing is made before unlock() (call it from a user
   gesture). Nothing here touches storage: main.js keeps 'root-mute' / 'root-music' and calls mute() / musicOn().
   Nothing here ever throws, with or without WebAudio.
     unlock()               make / resume the AudioContext (call from a user gesture; cheap to call again)
     mute(on)               all sound off / on
     musicOn(on)            music only (sound effects stay); musicOn() with no argument just reports
     hidden(on)             tab hidden: silences everything and suspends the context; hidden(false) resumes
     music(name|null, v)    crossfades (~1 s) to a tune; the same name again only updates v. v 0..1 = intensity: 'guardian'
                            and 'final' add layers at v .34 and .67 ('final' also lifts a whole tone at its last stage);
                            'calm' plays its cue once, then holds a soft pad. null fades out
     play(name, arg)        one-shots (RL.Audio.names.sfx). play('focus', true | false) starts / stops the rising hum;
                            'land' arg = impact 0..1; 'bloom' arg = flower kind 0..6; 'swing' arg = 'f'|'u'|'d';
                            'gtell' arg = guardian kind; 'talk' arg = 'peddler'|'sign'|'heart'
   Tunes are written as 16 (4/4) or 12 (3/4) steps a bar: a note name starts a note, '-' holds it, '.' rests. Each tune is
   sections A / B (8 bars each) arranged as a form (A A' B A'' and so on: other voices, harmony, octaves, drums), 32 bars.
   RL.Audio._render(ctx) builds the same graph in any (Offline)AudioContext, for tests. */
'use strict';
(function () {
const RL = window.RL = window.RL || {};
const SILENT = (() => { try { return /[?&]mute=1(?:&|$)/.test(String((window.location && window.location.search) || '')); } catch (e) { return false; } })();
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/* ---------- notes and chords ---------- */
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const acc = s => s === '#' ? 1 : s === 'b' ? -1 : 0;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const mid = s => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); if (!m) throw new Error('bad note ' + s); return SEMI[m[1]] + acc(m[2]) + (+m[3] + 1) * 12; };
const NH = s => hz(mid(s));
const mod = x => ((x % 12) + 12) % 12;
const cl = (x, a, b) => x < a ? a : x > b ? b : x;
const rnd = x => { const s = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); };
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], '9': [0, 4, 7, 14], m9: [0, 3, 7, 14],
  '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], s4: [0, 5, 7], s2: [0, 2, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
const parseChord = s => {
  const m = /^([A-G])([#b]?)(m7|m9|m6|M7|m|7|9|6|s4|s2|dim|aug)?(?:\/([A-G])([#b]?))?$/.exec(s); if (!m) throw new Error('bad chord ' + s);
  const r = SEMI[m[1]] + acc(m[2]); return { r, iv: QUAL[m[3] || ''], b: m[4] ? SEMI[m[4]] + acc(m[5]) : r };
};
const parseBar = (s, n) => {
  const k = s.trim().split(/\s+/), out = [];
  if (k.length !== n) throw new Error('bar of ' + k.length + ' steps (want ' + n + '): ' + s);
  for (let i = 0; i < n; i++) {
    const x = k[i]; if (x === '-' || x === '.') { out.push(null); continue; }
    let len = 1; while (i + len < n && k[i + len] === '-') len++;
    out.push([mid(x), len]);
  }
  return out;
};

/* ---------- the tunes (all original). Written in C / A minor and moved by tr. The game's motif opens 'title':
   up a sixth, then down by steps (G4 E5 D5 C5 . D5 E5 | G5). ---------- */
const MOTIF = ['C | Em | F | Am | C | Am | Dm G | C', [
  'G4 - - E5 - - D5 - C5 - - - D5 - E5 -', 'G5 - - - - - E5 - D5 - - - - - . .',
  'A4 - - F5 - - E5 - D5 - - - E5 - F5 -', 'A5 - - - - - G5 - E5 - - - - - . .',
  'G4 - - E5 - - D5 - C5 - - - D5 - E5 -', 'G5 - - - A5 - G5 - E5 - - - D5 - C5 -',
  'F5 - - - E5 - D5 - C5 - D5 - - - B4 -', 'C5 - - - - - - - - - - - . . . .']];
const SONGS = {
  /* the title: wistful and hopeful, a music box over harp and pad, in D */
  title: { bpm: 84, beats: 4, tr: 2, lead: 'box', lv: .16, lp: 4200, echo: 3, fb: .28, wet: .2, verb: .32, space: .2,
    acc: { pad: .02, arp: 'harp', arpV: 'pluck', arpLv: .03, bass: 'soft', drum: 'none', amb: 'twinkle' },
    sec: { A: MOTIF, B: ['F | C/E | Dm | G | Am | F | Dm G | G7', [
      'A5 - - - C6 - - - A5 - G5 - F5 - - -', 'G5 - - - - - E5 - C5 - - - - - . .',
      'F5 - - - A5 - - - F5 - E5 - D5 - - -', 'B4 - - - D5 - G5 - - - - - . . . .',
      'C6 - - - B5 - A5 - E5 - - - A5 - B5 -', 'C6 - - - - - A5 - F5 - - - G5 - A5 -',
      'A5 - - - F5 - D5 - B4 - - - D5 - G5 -', 'G5 - - - - - - - F5 - - - D5 - B4 -']] },
    form: [['A'], ['A', { inst: 'flute', harm: 1, arp: 'roll', arpV: 'soft' }], ['B', { inst: 'flute', dbl: 'box', dblOct: 12, dblLv: .4, drum: 'brush' }],
      ['A', { dbl: 'flute', dblOct: -12, dblLv: .7, drum: 'brush', pad: .026 }]], loop: 0 },
  /* Rootgate, the hub: a calm 3/4 lullaby on kalimba, the motif slowed and turned, in F */
  rootgate: { bpm: 88, beats: 3, tr: 5, lead: 'kal', lv: .17, lp: 3800, echo: 3, fb: .3, wet: .22, verb: .42, space: .28,
    acc: { pad: .018, arp: 'waltz', arpV: 'pluck', arpLv: .028, bass: 'waltz', drum: 'none', amb: 'drip' },
    sec: { A: ['C | G/B | Am | Em | F | C/E | Dm G | C', [
      'G4 - - - E5 - - - D5 - C5 -', 'D5 - - - - - - - . . B4 -', 'C5 - - - A5 - - - G5 - E5 -', 'G5 - - - - - - - . . . .',
      'A4 - - - F5 - - - E5 - D5 -', 'E5 - - - - - - - . . C5 -', 'D5 - - - F5 - E5 - - - D5 -', 'C5 - - - - - - - - - . .']],
      B: ['F | G | Em | Am | Dm | G | Em A7 | Dm G', [
      'A5 - - - - - G5 - F5 - - -', 'G5 - - - D5 - - - - - . .', 'E5 - - - G5 - - - B5 - - -', 'A5 - - - - - - - . . E5 -',
      'F5 - - - - - E5 - D5 - - -', 'B4 - - - D5 - - - G5 - - -', 'G5 - - - E5 - C#5 - - - E5 -', 'D5 - - - F5 - G5 - - - - -']] },
    form: [['A'], ['A', { inst: 'flute', harm: 1 }], ['B', { inst: 'flute', drum: 'waltz' }], ['A', { inst: 'box', dbl: 'kal', dblOct: -12, dblLv: .6, drum: 'waltz' }]], loop: 0 },
  /* Mossy Hollows: soft green and curious, plucky in A dorian */
  mossy: { bpm: 108, beats: 4, tr: 0, lead: 'pluck', lv: .21, lp: 3600, echo: 3, fb: .26, wet: .2, verb: .3, space: .22,
    acc: { pad: .014, arp: 'pizz', arpV: 'kal', arpLv: .034, bass: 'hop', bassLv: .25, drum: 'shaker', amb: 'drip' },
    sec: { A: ['Am | D | Am | D | C | G | Am | D', [
      'A4 . C5 . E5 . . D5 E5 . . . G5 . E5 .', 'F#5 . . . D5 . . . A4 . B4 . C5 . D5 .',
      'E5 . C5 . A4 . . G4 A4 . . . C5 . E5 .', 'D5 - - - . . F#5 . A5 - - - . . . .',
      'G5 . E5 . C5 . . E5 G5 . . . B5 . A5 .', 'G5 . D5 . B4 . . D5 G5 - - - . . . .',
      'A5 . G5 . E5 . D5 . C5 . D5 . E5 . . .', 'F#5 - - . E5 . D5 . A4 - - - . . . .']],
      B: ['F | G | Em | Am | F | G | E | Am D', [
      'A5 - - - - - C6 - A5 - - - F5 - - -', 'G5 - - - - - B5 - D6 - - - B5 - - -',
      'B5 - - - G5 - - - E5 - - - G5 - - -', 'A5 - - - - - - - E5 - - - . . . .',
      'F5 - - - A5 - - - C6 - - - A5 - G5 -', 'G5 - - - - - D5 - B4 - - - D5 - - -',
      'E5 - - - G#5 - - - B5 - - - G#5 - - -', 'A5 - - - - - - - F#5 - - - . . . .']] },
    form: [['A'], ['A', { inst: 'kal', harm: 1 }], ['B', { inst: 'flute', arp: 'harp', arpV: 'pluck', pad: .018 }], ['A', { dbl: 'kal', dblOct: 12, dblLv: .5 }]], loop: 0 },
  /* Glowcap Caves: twinkly and mysterious, slow bells in E minor with a lydian glint */
  glowcap: { bpm: 70, beats: 4, tr: -5, lead: 'bell', lv: .16, lp: 2800, echo: 4, fb: .36, wet: .26, verb: .55, space: .38,
    acc: { pad: .022, arp: 'twinkle', arpV: 'glock', arpLv: .028, bass: 'drone', drum: 'none', amb: 'twinkle' },
    sec: { A: ['Am | FM7 | Am | FM7 | Dm7 | Am | BbM7 | E', [
      'E5 - - - - - - - A5 - - - B5 - C6 -', 'B5 - - - - - - - - - - - . . . .',
      'E5 - - - - - - - A5 - - - B5 - C6 -', 'E6 - - - - - - - C6 - - - . . . .',
      'D6 - - - C6 - - - A5 - - - F5 - - -', 'E5 - - - - - - - - - - - . . A5 -',
      'D6 - - - - - - - A5 - - - F5 - - -', 'G#5 - - - - - - - B5 - - - . . . .']],
      B: ['C | G | Am | Em | F | C | Dm | E', [
      'G5 - - - E5 - G5 - C6 - - - - - . .', 'B5 - - - - - D6 - B5 - - - G5 - - -',
      'A5 - - - - - E5 - C6 - - - B5 - A5 -', 'B5 - - - - - - - - - - - . . . .',
      'A5 - - - C6 - - - F6 - - - E6 - C6 -', 'E6 - - - - - - - G5 - - - . . . .',
      'F5 - - - A5 - - - D6 - - - C6 - A5 -', 'B5 - - - - - - - G#5 - - - - - . .']] },
    form: [['A'], ['A', { inst: 'box', harm: 1 }], ['B', { inst: 'flute', dbl: 'bell', dblOct: 12, dblLv: .45, arp: 'harp', arpV: 'soft' }],
      ['A', { inst: 'flute', dbl: 'box', dblOct: 12, dblLv: .5 }]], loop: 0 },
  /* Clatter Pipes: playful clockwork, swung, tick-tock and little clanks, in B flat */
  pipes: { bpm: 118, beats: 4, swing: .3, tr: -2, lead: 'clar', lv: .2, lp: 3600, echo: 2, fb: .2, wet: .16, verb: .22, space: .18,
    acc: { pad: 0, arp: 'pah', arpV: 'pluck', arpLv: .034, bass: 'oom', bassLv: .24, drum: 'clock', amb: 'steam' },
    sec: { A: ['C | G7 | C | G7 | F | C | D7 | G7', [
      'E5 . G5 . C6 . G5 . E5 . . . D5 . E5 .', 'F5 . . . D5 . B4 . G4 . . . . . . .',
      'E5 . G5 . C6 . G5 . E5 . G5 . A5 . G5 .', 'F5 . E5 . D5 . . . G5 - - - . . . .',
      'A5 . C6 . A5 . F5 . C5 . . . F5 . A5 .', 'G5 . . . E5 . . . C5 - - - . . . .',
      'F#5 . A5 . D6 . A5 . F#5 . . . D5 . C5 .', 'B4 . D5 . G5 . F5 . D5 . . . . . . .']],
      B: ['Am | E7 | Am | E7 | F | C | D7 | G7', [
      'A5 - - . C6 . B5 . A5 . E5 . . . . .', 'G#5 - - . B5 . A5 . G#5 . E5 . . . . .',
      'A5 . C6 . E6 . C6 . A5 . . . E5 . A5 .', 'B5 - - - G#5 . E5 . D5 . . . . . . .',
      'C6 . . . A5 . . . F5 . A5 . C6 . D6 .', 'E6 - - . D6 . C6 . G5 . . . . . . .',
      'A5 . F#5 . A5 . D6 . C6 . A5 . F#5 . D5 .', 'G5 . . . . . . . B4 . D5 . F5 . . .']] },
    form: [['A'], ['A', { inst: 'glock', lvM: .9 }], ['B', { harm: 1 }], ['A', { dbl: 'glock', dblOct: 12, dblLv: .45 }]], loop: 0 },
  /* Crystal Spring: watery glass arpeggios and chimes, lydian, in E flat */
  crystal: { bpm: 92, beats: 4, tr: 3, lead: 'bell', lv: .15, lp: 4600, echo: 4, fb: .36, wet: .24, verb: .5, space: .42,
    acc: { pad: .016, arp: 'glass', arpV: 'soft', arpLv: .022, bass: 'soft', drum: 'none', amb: 'drip' },
    sec: { A: ['CM7 | D/C | CM7 | D/C | Am7 | Em7 | FM7 | G', [
      'E5 - - - - - - - G5 - - - B5 - - -', 'A5 - - - - - - - F#5 - - - - - . .',
      'E5 - - - - - - - G5 - - - B5 - C6 -', 'D6 - - - - - - - A5 - - - - - . .',
      'C6 - - - B5 - - - A5 - - - G5 - - -', 'B5 - - - - - - - E5 - - - G5 - - -',
      'A5 - - - - - G5 - E5 - - - C5 - - -', 'D5 - - - - - - - - - - - . . . .']],
      B: ['Am | F | C | G | Am | F | D | G7', [
      'A5 - - - C6 - - - E6 - - - D6 - C6 -', 'C6 - - - - - - - A5 - - - - - . .',
      'G5 - - - C6 - - - E6 - - - G6 - - -', 'D6 - - - - - - - B5 - - - - - . .',
      'C6 - - - B5 - A5 - E5 - - - A5 - B5 -', 'C6 - - - - - A5 - F5 - - - A5 - C6 -',
      'F#6 - - - - - D6 - A5 - - - D6 - E6 -', 'D6 - - - - - - - B5 - - - . . . .']] },
    form: [['A'], ['A', { inst: 'glock', harm: 1 }], ['B', { inst: 'flute', dbl: 'bell', dblOct: 12, dblLv: .4 }], ['A', { dbl: 'flute', dblOct: -12, dblLv: .6 }]], loop: 0 },
  /* Cloud Roots: airy and breezy, a whistle floating over a high 3/4, in F */
  cloud: { bpm: 116, beats: 3, tr: 5, lead: 'whistle', lv: .17, lp: 4400, echo: 3, fb: .3, wet: .22, verb: .38, space: .2,
    acc: { pad: .016, arp: 'harp', arpV: 'pluck', arpLv: .026, bass: 'waltz', drum: 'none', amb: 'wind' },
    sec: { A: ['C | F | C | G | Am | F | Dm G | C', [
      'G5 - - - - - E5 - G5 - C6 -', 'A5 - - - - - - - F5 - A5 -', 'G5 - - - - - E5 - C5 - E5 -', 'D5 - - - - - - - - - . .',
      'E5 - - - - - A5 - C6 - E6 -', 'D6 - - - C6 - A5 - - - F5 -', 'A5 - - - F5 - G5 - - - B5 -', 'C6 - - - - - - - - - . .']],
      B: ['F | G | Em | Am | Dm | G | Em | F G', [
      'C6 - - - - - A5 - F5 - A5 -', 'B5 - - - - - G5 - D5 - G5 -', 'B5 - - - - - G5 - E5 - G5 -', 'A5 - - - - - - - E5 - - -',
      'F5 - - - A5 - D6 - - - C6 -', 'B5 - - - - - - - D6 - - -', 'G6 - - - - - E6 - B5 - - -', 'C6 - - - A5 - B5 - - - D6 -']] },
    form: [['A', { oct: -12 }], ['A', { harm: 1, drum: 'waltz' }], ['B', { inst: 'flute', oct: -12, drum: 'waltz' }], ['A', { dbl: 'box', dblOct: 0, dblLv: .5, drum: 'waltz' }]], loop: 0 },
  /* the Heartseed Chamber: deep, solemn and hopeful; the motif returns on a music box, in D minor */
  heart: { bpm: 64, beats: 4, tr: -7, lead: 'flute', lv: .17, lp: 2600, echo: 4, fb: .3, wet: .2, verb: .55, space: .4,
    acc: { pad: .026, arp: 'none', bass: 'deep', drum: 'pulse', amb: 'twinkle' },
    sec: { A: ['Am | F | C | G | Am | F | Dm | E', [
      'E5 - - - - - - - A4 - - - C5 - - -', 'C5 - - - - - - - A4 - - - - - . .',
      'G4 - - - - - - - C5 - - - E5 - - -', 'D5 - - - - - - - - - - - . . . .',
      'E5 - - - - - - - A5 - - - G5 - - -', 'F5 - - - - - - - E5 - - - C5 - - -',
      'D5 - - - - - - - F5 - - - A5 - - -', 'G#5 - - - - - - - - - - - . . . .']],
      B: ['F | C | Dm | E | F | C | Dm | E', [
      'A4 - - F5 - - E5 - D5 - - - E5 - F5 -', 'G5 - - - - - E5 - C5 - - - - - . .',
      'A4 - - F5 - - E5 - D5 - - - E5 - F5 -', 'G#5 - - - - - - - B5 - - - - - . .',
      'A5 - - - - - G5 - F5 - - - E5 - - -', 'E5 - - - - - D5 - C5 - - - G4 - - -',
      'F5 - - - - - E5 - D5 - - - A4 - - -', 'B4 - - - - - - - G#4 - - - - - . .']] },
    form: [['A'], ['A', { dbl: 'bell', dblOct: 12, dblLv: .35, arp: 'harp', arpV: 'soft', arpLv: .02 }], ['B', { inst: 'box', oct: 12, arp: 'harp', arpV: 'soft', arpLv: .022 }],
      ['A', { inst: 'horn', dbl: 'box', dblOct: 12, dblLv: .45, harm: 1, arp: 'harp', arpV: 'soft', arpLv: .02 }]], loop: 0 },
  /* a guardian wakes: a driving minor riff, kind tension that swells with v (layers at .34 and .67), in A minor */
  guardian: { bpm: 136, beats: 4, tr: 0, lead: 'horn', lv: .17, lp: 2600, lpV: 2000, echo: 3, fb: .2, wet: .14, verb: .22, space: .2,
    acc: { pad: .02, arp: 'ost', arpV: 'pluck', arpLv: .04, bass: 'pulse', drum: 'tom', amb: 'none' },
    dyn: [{ inst: 'pluck', lvM: .75, drum: 'tom', bass: 'pulse', bassLv: .15, pad: .014, arpLv: .032 },
      { drum: 'battle', bass: 'pulse', bassLv: .21, pad: .022, arpLv: .04 },
      { dbl: 'flute', dblOct: 12, dblLv: .45, arp: 'ost2', arpLv: .042, drum: 'battle2', bass: 'drive', bassLv: .23, pad: .028, pad2: .012 }],
    sec: { A: ['Am | Am | F | G | Am | Am | F | E', [
      'A4 - - - C5 - - - E5 - - - D5 - C5 -', 'B4 - - - C5 - - - A4 - - - - - . .',
      'A4 - - - C5 - - - F5 - - - E5 - D5 -', 'D5 - - - B4 - - - G4 - - - - - . .',
      'A4 - - - C5 - - - E5 - - - A5 - - -', 'G5 - - - E5 - - - C5 - - - E5 - - -',
      'F5 - - - E5 - - - D5 - - - C5 - - -', 'B4 - - - - - - - G#4 - - - - - . .']],
      B: ['F | G | Em | Am | F | G | Dm | E', [
      'C5 - - . C5 . F5 - - . F5 . A5 - - -', 'B4 - - . B4 . D5 - - . D5 . G5 - - -',
      'G5 - - . G5 . E5 - - . E5 . B4 - - -', 'C5 - - - E5 - - - A5 - - - - - . .',
      'A5 - - - G5 - F5 - E5 - - - F5 - - -', 'G5 - - - F5 - E5 - D5 - - - G5 - - -',
      'A5 - - - - - D5 - F5 - - - A5 - - -', 'G#5 - - - - - - - B5 - - - E6 - - -']] },
    form: [['A'], ['A', { harm: 1 }], ['B'], ['A', { harm: 1 }]], loop: 0 },
  /* the last guardian: the motif turned minor, hope breaking through; three stages with v, the last a tone higher */
  final: { bpm: 128, beats: 4, tr: 0, lead: 'horn', lv: .17, lp: 2400, lpV: 2200, echo: 3, fb: .22, wet: .15, verb: .3, space: .3,
    acc: { pad: .024, arp: 'ost', arpV: 'pluck', arpLv: .04, bass: 'deep', drum: 'timp', amb: 'none' },
    dyn: [{ inst: 'flute', lvM: .6, drum: 'timp', timpLv: .55, bass: 'deep', bassLv: .1, pad: .016, arpLv: .028 },
      { drum: 'battle', timp: 1, bass: 'pulse', bassLv: .21, pad: .022, arpLv: .04 },
      { dbl: 'flute', dblOct: 12, dblLv: .45, arp: 'ost2', arpLv: .042, drum: 'battle2', timp: 1, bass: 'drive', bassLv: .23, pad: .028, pad2: .014, tr: 2 }],
    sec: { A: ['Am | F | C | G | Am | F | Dm E | Am', [
      'E4 - - C5 - - B4 - A4 - - - B4 - C5 -', 'F5 - - - - - C5 - A4 - - - - - . .',
      'G4 - - E5 - - D5 - C5 - - - D5 - E5 -', 'G5 - - - - - E5 - D5 - - - - - . .',
      'E4 - - C5 - - B4 - A4 - - - B4 - C5 -', 'F5 - - - - - E5 - C5 - - - A4 - - -',
      'D5 - - - F5 - A5 - G#5 - - - E5 - D5 -', 'C5 - - - B4 - - - A4 - - - - - . .']],
      B: ['F | G | Am | Am | F | G | E | E', [
      'A5 - - - G5 - F5 - - - E5 - F5 - - -', 'G5 - - - - - D5 - B4 - - - D5 - G5 -',
      'A5 - - - E5 - C5 - - - E5 - A5 - B5 -', 'C6 - - - B5 - - - A5 - - - E5 - - -',
      'F5 - - - A5 - - - C6 - - - A5 - - -', 'B5 - - - - - G5 - D6 - - - B5 - - -',
      'G#5 - - - B5 - - - E6 - - - D6 - - -', 'B5 - - - - - - - G#5 - - - E5 - - -']] },
    form: [['A'], ['A', { harm: 1 }], ['B'], ['A', { harm: 1 }]], loop: 0 },
  /* a guardian calms: a short warm cue (the motif, rising to the octave), then a soft held pad with music-box chimes */
  calm: { bpm: 88, beats: 4, tr: 2, lead: 'flute', lv: .16, lp: 4200, echo: 3, fb: .3, wet: .22, verb: .42, space: .3, pre: 1.1, fin: .25,
    acc: { pad: .022, arp: 'none', bass: 'drone', drum: 'none', amb: 'twinkle' },
    sec: { C: ['C | F | G | C', [
      'G4 - - E5 - - D5 - C5 - - - D5 - E5 -', 'A5 - - - - - G5 - F5 - - - E5 - F5 -',
      'G5 - - - A5 - B5 - D6 - - - B5 - - -', 'C6 - - - - - - - - - - - - - - -']],
      H: ['CM7 | F | CM7 | F/C', [
      '. . . . . . . . E6 - - - - - - -', '. . . . . . . . . . . . A5 - - -',
      '. . . . G5 - - - - - - - . . . .', '. . . . . . . . C6 - - - - - - -']] },
    form: [['C', { dbl: 'box', dblOct: 12, dblLv: .45, arp: 'harp', arpV: 'soft', arpLv: .026, bass: 'soft', bassLv: .17, drum: 'cue', pad: .022 }],
      ['H', { inst: 'box', lvM: .55 }]], loop: 1 },
  /* the ending: joyful, the colour comes back, the motif in full bloom (and a key lift), in D */
  ending: { bpm: 100, beats: 4, tr: 2, lead: 'flute', lv: .16, lp: 4600, echo: 3, fb: .25, wet: .18, verb: .3, space: .2,
    acc: { pad: .018, arp: 'roll', arpV: 'soft', arpLv: .024, bass: 'walk', bassLv: .18, drum: 'soft', amb: 'none' },
    sec: { A: MOTIF, E: ['F | G | Em | Am | F | G | Am Em | F G', [
      'A5 - C6 - F6 - - - E6 - C6 - A5 - C6 -', 'D6 - - - B5 - G5 - D6 - - - - - . .',
      'G5 - B5 - E6 - - - D6 - B5 - G5 - B5 -', 'C6 - - - A5 - E5 - A5 - - - - - . .',
      'A5 - - - C6 - - - F6 - - - E6 - D6 -', 'D6 - - - - - B5 - G5 - - - A5 - B5 -',
      'C6 - - - E6 - - - B5 - - - G5 - - -', 'A5 - - - - - - - B5 - - - D6 - - -']] },
    form: [['A', { dbl: 'box', dblOct: 12, dblLv: .45 }], ['A', { inst: 'box', dbl: 'flute', dblOct: -12, dblLv: .7, harm: 1 }],
      ['E', { dbl: 'bell', dblOct: 12, dblLv: .35, arp: 'harp', arpV: 'pluck' }], ['A', { tr: 2, dbl: 'box', dblOct: 12, dblLv: .45, harm: 1, pad: .028 }]], loop: 0 },
  /* the Peddler's shop: a cosy little 3/4 on a wheezy accordion, in G */
  shop: { bpm: 120, beats: 3, tr: -5, lead: 'accord', lv: .2, lp: 3800, echo: 2, fb: .2, wet: .14, verb: .18, space: .15,
    acc: { pad: .01, arp: 'waltz', arpV: 'pluck', arpLv: .034, bass: 'waltz', bassLv: .22, drum: 'waltz', amb: 'none' },
    sec: { A: ['C | Am | Dm | G7 | C | Am | D7 | G7', [
      'G5 - - - E5 - G5 - C6 - - -', 'A5 - - - - - G5 - E5 - - -', 'F5 - - - A5 - - - D6 - - -', 'B5 - - - A5 - G5 - - - . .',
      'G5 - - - E5 - G5 - C6 - - -', 'E6 - - - - - D6 - C6 - - -', 'A5 - - - C6 - - - F#5 - - -', 'G5 - - - - - - - . . . .']],
      B: ['F | C | G7 | C | F | C | G7 | C', [
      'A5 - - - - - B5 - C6 - - -', 'G5 - - - E5 - - - C5 - - -', 'D5 - - - F5 - - - B5 - - -', 'C6 - - - - - - - . . . .',
      'A5 - - - - - B5 - C6 - A5 -', 'G5 - - - E5 - G5 - C6 - - -', 'B5 - - - D6 - - - F5 - - -', 'E5 - - - - - - - C5 - . .']] },
    form: [['A'], ['A', { inst: 'box', harm: 1 }], ['B', { harm: 1 }], ['A', { inst: 'clar', dbl: 'box', dblOct: 12, dblLv: .45 }]], loop: 0 }
};
const MUSIC_ALIAS = { hub: 'rootgate', seedfall: 'rootgate', boss: 'guardian', heartseed: 'heart', peddler: 'shop', credits: 'ending', end: 'ending',
  glow: 'glowcap', clatter: 'pipes', spring: 'crystal', clouds: 'cloud' };
const BAD = [];
for (const k of Object.keys(SONGS)) {
  try {
    const d = SONGS[k]; d.spb = d.beats * 4; d.sd = 60 / d.bpm / 4; d.swing = d.swing || 0;
    const sec = {};
    for (const s in d.sec) {
      const [ch, mel] = d.sec[s], C = ch.split('|').map(x => x.trim().split(/\s+/).map(parseChord)), L = mel.map(b => parseBar(b, d.spb));
      if (C.length !== L.length) throw new Error(s + ': ' + C.length + ' chord bars, ' + L.length + ' melody bars');
      sec[s] = { C, L };
    }
    d.sec = sec; d.bars = []; d.loopBar = 0;
    d.form.forEach(([s, f], j) => {
      if (!sec[s]) throw new Error('form names a missing section ' + s);
      if (j === d.loop) d.loopBar = d.bars.length;
      for (let b = 0; b < sec[s].L.length; b++) d.bars.push({ s, b, f: f || {}, first: b === 0, last: b === sec[s].L.length - 1 });
    });
  } catch (e) { BAD.push(k + ': ' + e.message); delete SONGS[k]; }
}
const MUSIC_NAMES = Object.keys(SONGS);

/* ---------- sound effects: [voice length s, keep (never dropped first), fn(H, t, out, arg, I)]; cute and soft, never harsh ---------- */
const SFX = {
  /* a very soft pat (rate-limited to about 8 a second) */
  step: [.08, 0, (H, t, o) => { const k = Math.random(); H.noise(t, .035, .045, 'lowpass', 650 + k * 450, 240, .8, o); H.tone('sine', 135 + k * 35, 80, t, .04, .05, o, .002); }],
  jump: [.22, 0, (H, t, o) => { H.tone('triangle', 290, 610, t, .1, .11, o, .004); H.tone('sine', 580, 1220, t + .015, .07, .03, o); H.noise(t, .1, .02, 'bandpass', 1000, 3200, 1.2, o); }],
  /* arg: impact 0..1 */
  land: [.3, 0, (H, t, o, a) => {
    const k = a === undefined || a === null ? .5 : cl(+a || 0, 0, 1);
    H.tone('sine', 150, 55, t, .08 + .12 * k, .06 + .17 * k, o, .002); H.noise(t, .05 + .08 * k, .025 + .07 * k, 'lowpass', 1400, 220, .7, o);
    if (k > .6) H.noise(t + .02, .14, .02 * k, 'bandpass', 2600, 1100, 1, o);
  }],
  /* the dandelion staff: an airy swish (arg 'u' a little higher, 'd' lower) */
  swing: [.24, 0, (H, t, o, a) => {
    const u = a === 'u' ? 1.25 : a === 'd' ? .8 : 1;
    H.noise(t, .17, .075, 'bandpass', 700 * u, 4000 * u, 1.6, o); H.noise(t + .03, .13, .015, 'highpass', 7000, 0, .6, o); H.tone('sine', 1700 * u, 2500 * u, t + .02, .1, .01, o, .02);
  }],
  /* the staff touches a gloom: a soft pomf */
  hit: [.22, 0, (H, t, o) => { H.tone('sine', 320, 130, t, .11, .2, o, .002); H.noise(t, .08, .07, 'lowpass', 1600, 300, .9, o); H.tone('triangle', 640, 420, t, .05, .04, o); }],
  /* a gloom blooms into a flower: a pop, a rising chime (arg: flower kind 0..6 picks the key) and sparkles */
  bloom: [1.1, 1, (H, t, o, a) => {
    const root = 79 + [0, 2, 4, 5, 7, 9, 12][cl(a | 0, 0, 6)];
    H.tone('sine', 360, 1250, t, .07, .19, o, .002); H.noise(t, .05, .06, 'bandpass', 2600, 0, 1.6, o); H.noise(t + .02, .3, .03, 'bandpass', 900, 3200, .8, o);
    [0, 4, 7, 12].forEach((iv, j) => H.bell(hz(root + iv), t + .05 + j * .045, .32, .075, o));
    for (let j = 0; j < 5; j++) H.pl('sine', 2800 + Math.random() * 2600, t + .14 + j * .06, .03, .022, o, .001);
    H.noise(t + .1, .45, .012, 'highpass', 6500, 9500, .6, o);
  }],
  bud: [.5, 0, (H, t, o) => { H.tone('sine', 420, 1100, t, .05, .13, o, .002); H.bell(NH('E6'), t + .04, .25, .06, o); H.pl('sine', 3600, t + .1, .03, .02, o, .001); H.pl('sine', 4400, t + .16, .03, .016, o, .001); }],
  /* a leaf flutters away: a soft low boop, a flutter and a falling whistle (no voice) */
  hurt: [.7, 1, (H, t, o) => {
    H.tone('sine', 360, 175, t, .15, .2, o, .003); H.flut(t + .04, .5, .05, 'bandpass', 2600, 900, 1.4, 17, o);
    const w = H.tone('sine', 1500, 520, t + .06, .45, .028, o, .02); H.wob(w, t + .06, .45, 9, 60);
  }],
  /* a prickle */
  thorn: [.3, 0, (H, t, o) => { [3200, 2700, 3600].forEach((f, j) => H.pl('sine', f, t + j * .035, .012, .05, o, .001)); H.noise(t, .05, .04, 'highpass', 5000, 0, .7, o); H.tone('sine', 300, 190, t + .02, .09, .12, o, .002); }],
  /* nodding off: sleepy tones sagging down, then three tiny lullaby chimes */
  faint: [2.6, 1, (H, t, o) => {
    ['E5', 'C5', 'A4', 'F4'].forEach((n, j) => {
      const f = NH(n), last = j === 3, d = last ? .9 : .34, u = t + j * .38, s = H.sus(H.W.flute, f, u, d, .09, o, .05, .2);
      s.frequency.setTargetAtTime(f * .97, u + d * .6, .2); if (last) H.wob(s, u + .2, d, 3, f * .01);
    });
    ['A6', 'F6', 'D6'].forEach((n, j) => H.pl('sine', NH(n), t + 1.6 + j * .22, .15, .016, o, .002));
  }],
  /* waking up: a morning chime */
  wake: [1.5, 1, (H, t, o) => {
    ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, j) => H.bell(NH(n), t + j * .09, .5, .065, o));
    for (const n of ['C5', 'G5', 'E6']) H.sus(H.W.warm, NH(n), t + .3, .7, .022, o, .25, .4);
    H.noise(t + .4, .6, .01, 'highpass', 6000, 9000, .6, o);
  }],
  revive: [1.1, 1, (H, t, o) => {
    const s = H.tone('sine', 330, 990, t, .35, .08, o, .01); H.wob(s, t, .35, 10, 20);
    ['G5', 'C6', 'E6', 'G6'].forEach((n, j) => H.bell(NH(n), t + .25 + j * .05, .35, .055, o));
    for (let j = 0; j < 6; j++) H.pl('sine', 3000 + Math.random() * 2500, t + .3 + j * .06, .03, .018, o, .001);
  }],
  /* a leaf grows back */
  heal: [.9, 1, (H, t, o) => {
    const s = H.tone('sine', 420, 980, t, .35, .07, o, .03); H.wob(s, t, .35, 8, 18);
    H.noise(t + .05, .18, .03, 'bandpass', 3000, 1800, 1.2, o); H.bell(NH('G6'), t + .32, .4, .065, o); H.pl('sine', NH('D7'), t + .4, .2, .022, o);
  }],
  /* the focus hum is a held voice (I.focus); this entry only lists the name */
  focus: [.01, 0, () => {}],
  dash: [.35, 0, (H, t, o) => { H.flut(t, .24, .09, 'bandpass', 500, 3000, 1.2, 28, o); H.tone('sine', 200, 520, t, .12, .06, o, .005); }],
  cling: [.15, 0, (H, t, o) => { H.noise(t, .07, .05, 'bandpass', 1800, 1200, 1.5, o); H.pl('triangle', 900, t, .02, .06, o, .001); }],
  walljump: [.25, 0, (H, t, o) => { H.noise(t, .06, .05, 'bandpass', 2000, 1200, 1.5, o); H.tone('triangle', 320, 680, t + .02, .1, .11, o, .004); H.noise(t + .02, .1, .02, 'bandpass', 1200, 3600, 1.2, o); }],
  /* the puff jump: a soft cloud puff */
  puff: [.35, 0, (H, t, o) => { H.noise(t, .16, .09, 'lowpass', 600, 2200, .8, o); const s = H.tone('sine', 280, 660, t, .12, .06, o, .006); H.wob(s, t, .12, 20, 25); }],
  /* a warm ray of light */
  beam: [.9, 1, (H, t, o) => {
    H.tone('sine', 440, 880, t, .5, .06, o, .02); H.tone('triangle', 660, 1320, t + .02, .4, .03, o, .02); H.bell(NH('A6'), t, .4, .05, o);
    H.swell(t, .15, .45, .025, 'highpass', 4000, 8000, .6, o); H.pl('sine', NH('E7'), t + .12, .15, .02, o);
  }],
  /* a glowcap boing */
  bounce: [.5, 0, (H, t, o) => {
    const s = H.tone('sine', 170, 520, t, .22, .2, o, .004); H.wob(s, t, .22, 16, 40);
    const s2 = H.tone('sine', 520, 760, t + .05, .2, .045, o, .01); H.wob(s2, t + .05, .2, 16, 30); H.pl('sine', NH('E6'), t + .1, .12, .03, o);
  }],
  pogo: [.3, 0, (H, t, o) => { const s = H.tone('sine', 260, 720, t, .12, .12, o, .003); H.wob(s, t, .12, 22, 30); H.noise(t, .1, .03, 'bandpass', 900, 3000, 1.2, o); }],
  /* a dew drop: a tiny plink that climbs while you scoop up a run of them */
  dew: [.15, 0, (H, t, o, a, I) => { const f = hz(84 + [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][I.dewN]); H.tone('sine', f, f * 1.4, t, .02, .05, o, .001); H.pl('sine', f * 1.4, t + .02, .05, .035, o, .001); }],
  dewBig: [.7, 0, (H, t, o) => {
    [0, 4, 7, 12, 16].forEach((iv, j) => { const f = hz(84 + iv), u = t + j * .04; H.tone('sine', f, f * 1.4, u, .02, .05, o, .001); H.pl('sine', f * 1.4, u + .02, .06, .035, o, .001); });
    H.noise(t, .15, .03, 'lowpass', 2500, 600, .8, o); H.bell(NH('C7'), t + .22, .3, .04, o);
  }],
  pickup: [.5, 1, (H, t, o) => { H.bell(NH('G6'), t, .2, .07, o); H.bell(NH('C7'), t + .07, .35, .07, o); for (let j = 0; j < 3; j++) H.pl('sine', 3500 + j * 600, t + .12 + j * .05, .03, .015, o, .001); }],
  /* a life seed: something special */
  life: [1.8, 1, (H, t, o) => {
    ['C5', 'E5', 'G5', 'B5', 'D6', 'G6'].forEach((n, j) => H.bell(NH(n), t + j * .07, .5, .06, o));
    for (const n of ['C4', 'G4', 'E5', 'B5']) H.sus(H.W.warm, NH(n), t + .35, .9, .026, o, .3, .5);
    for (let j = 0; j < 8; j++) H.pl('sine', 2600 + Math.random() * 3000, t + .4 + j * .08, .04, .016, o, .001);
    H.swell(t + .3, .4, .8, .012, 'highpass', 6000, 9000, .6, o);
  }],
  /* a sun vessel: a sunny rise and a bright chord */
  vessel: [1.5, 1, (H, t, o) => {
    const s = H.tone('sine', 400, 1600, t, .45, .06, o, .02); H.wob(s, t, .45, 12, 15);
    ['D6', 'F#6', 'A6', 'D7'].forEach((n, j) => H.bell(NH(n), t + .4 + j * .05, .45, .055, o));
    for (const n of ['D5', 'A5', 'F#6']) H.sus(H.W.warm, NH(n), t + .4, .6, .022, o, .1, .4);
    H.swell(t + .35, .2, .7, .015, 'highpass', 5000, 9000, .6, o);
  }],
  charm: [1.2, 1, (H, t, o) => {
    ['E6', 'G6', 'B6', 'D7'].forEach((n, j) => H.bell(NH(n), t + j * .06, .25, .05, o)); H.bell(NH('E7'), t + .26, .5, .05, o); H.bell(NH('B5'), t + .26, .5, .04, o);
    for (let j = 0; j < 5; j++) H.pl('sine', 3000 + Math.random() * 3000, t + .3 + j * .07, .03, .014, o, .001);
  }],
  /* a new ability: a 3-second fanfare on the motif, then a chord in full bloom */
  ability: [3.2, 1, (H, t, o) => {
    for (const [n, d, l] of [['G4', 0, .2], ['E5', .2, .2], ['D5', .4, .14], ['C5', .54, .3], ['D5', .84, .14], ['E5', .98, .14], ['G5', 1.12, .5]]) {
      H.sus(H.W.flute, NH(n), t + d, l, .1, o, .02, .06); H.pl(H.W.box, NH(n) * 2, t + d, .35, .045, o);
    }
    const c = t + 1.7; for (const n of ['C4', 'G4', 'C5', 'E5', 'G5']) H.sus(H.W.warm, NH(n), c, 1.1, .026, o, .08, .5);
    H.sus(H.W.flute, NH('C6'), c, 1.1, .09, o, .03, .4); ['C6', 'E6', 'G6', 'C7'].forEach((n, j) => H.bell(NH(n), c + j * .06, .6, .05, o));
    for (let j = 0; j < 10; j++) H.pl('sine', 2600 + Math.random() * 3200, c + .1 + j * .09, .04, .014, o, .001);
    H.swell(c, .3, 1.2, .015, 'highpass', 5000, 9000, .6, o); H.tone('sine', 65, 0, c, .9, .12, o, .02);
  }],
  notch: [.6, 1, (H, t, o) => { H.noise(t, .02, .06, 'bandpass', 3000, 0, 3, o); H.pl('triangle', 700, t, .03, .07, o, .001); H.bell(NH('A5'), t + .05, .25, .06, o); H.bell(NH('E6'), t + .13, .4, .06, o); }],
  /* resting at a Watering Spot: water pouring, little bubbles, then a chime */
  save: [2.2, 1, (H, t, o) => {
    H.flut(t, 1.1, .045, 'bandpass', 900, 1500, 1.4, 23, o); H.swell(t, .1, 1.1, .02, 'lowpass', 700, 400, .7, o);
    for (let j = 0; j < 7; j++) { const u = t + .1 + Math.random() * .9, f = 300 + Math.random() * 500; H.tone('sine', f, f * 2.2, u, .05, .03, o, .003); }
    ['C6', 'E6', 'G6', 'C7'].forEach((n, j) => H.bell(NH(n), t + 1.05 + j * .07, .6, .05, o)); H.swell(t + 1, .3, .8, .012, 'highpass', 5000, 9000, .6, o);
  }],
  door: [.8, 0, (H, t, o) => { H.creak(t, .45, 80, 120, 1100, .07, o); H.tone('sine', 130, 70, t + .45, .12, .14, o, .003); H.noise(t + .45, .06, .04, 'lowpass', 900, 0, .7, o); }],
  /* heavy roots creaking open */
  gate: [2.3, 1, (H, t, o) => {
    H.creak(t, 1.6, 34, 52, 750, .08, o); H.creak(t + .2, 1.3, 55, 42, 1300, .04, o); H.swell(t, .5, 1.3, .07, 'lowpass', 180, 120, .7, o);
    H.tone('sine', 120, 50, t + 1.7, .3, .22, o, .004); H.noise(t + 1.7, .25, .08, 'lowpass', 600, 120, .7, o);
  }],
  lever: [.4, 0, (H, t, o) => { H.tone('triangle', 240, 150, t, .1, .13, o, .002); H.noise(t, .02, .06, 'bandpass', 3500, 0, 2, o); H.pl('sine', 1400, t + .08, .02, .05, o, .001); H.tone('sine', 160, 90, t + .08, .08, .1, o, .002); }],
  switch: [.7, 0, (H, t, o) => { H.bell(NH('E6'), t, .35, .07, o); H.bell(NH('B6'), t + .07, .45, .06, o); H.tone('sine', 600, 1800, t, .2, .03, o, .02); H.swell(t, .1, .4, .015, 'highpass', 5000, 8000, .6, o); }],
  crack: [.4, 0, (H, t, o) => { H.noise(t, .05, .14, 'bandpass', 1400, 900, 2, o); H.tone('sine', 170, 90, t, .12, .15, o, .002); H.noise(t + .06, .03, .07, 'bandpass', 2200, 0, 2, o); }],
  /* a root wall gives way (a secret!): a crumbly thunk and a little ta-da */
  break: [1, 1, (H, t, o) => {
    H.tone('sine', 140, 55, t, .25, .2, o, .003); H.noise(t, .3, .12, 'lowpass', 2200, 300, .8, o);
    for (let j = 0; j < 6; j++) H.noise(t + .05 + Math.random() * .4, .04, .04, 'bandpass', 1200 + Math.random() * 1500, 0, 1.5, o);
    H.bell(NH('C6'), t + .35, .3, .05, o); H.bell(NH('G6'), t + .45, .45, .05, o);
  }],
  splash: [.7, 0, (H, t, o) => {
    H.noise(t, .35, .12, 'lowpass', 3600, 400, .8, o); H.noise(t, .18, .03, 'highpass', 4000, 0, .7, o);
    for (let j = 0; j < 3; j++) { const u = t + .08 + Math.random() * .3, f = 280 + Math.random() * 300; H.tone('sine', f, f * 2.4, u, .06, .04, o, .004); }
  }],
  /* a steam hiss */
  vent: [1, 0, (H, t, o) => { H.swell(t, .1, .55, .04, 'highpass', 2600, 4600, .7, o); H.noise(t, .12, .05, 'lowpass', 500, 200, .7, o); }],
  crumble: [.6, 0, (H, t, o) => { for (let j = 0; j < 7; j++) H.noise(t + Math.random() * .4, .05, .03 + Math.random() * .03, 'lowpass', 1500 + Math.random() * 1200, 400, .8, o); H.tone('sine', 110, 60, t, .12, .07, o, .003); }],
  spore: [.25, 0, (H, t, o) => { H.noise(t, .1, .06, 'lowpass', 1100, 400, .8, o); H.tone('sine', 480, 300, t, .06, .03, o, .004); }],
  /* a gloom knight's shield: a hollow tin clank, kept soft */
  clang: [.5, 0, (H, t, o) => {
    H.pl('sine', 430, t, .2, .11, o, .001); H.pl('sine', 1010, t, .09, .05, o, .001); H.pl('sine', 1560, t, .04, .03, o, .001);
    H.noise(t, .03, .05, 'bandpass', 900, 0, 2, o); H.tone('sine', 220, 150, t, .05, .08, o, .002);
  }],
  /* a wind-up toy rattle, speeding up */
  charge: [1.1, 0, (H, t, o) => { let u = t; for (let j = 0; j < 14; j++) { H.pl('triangle', 1300 + j * 30, u, .008, .05, o, .001); H.noise(u, .012, .025, 'bandpass', 3000, 0, 2, o); u += .09 - j * .004; } }],
  wind: [1.6, 0, (H, t, o) => {
    const f = H.swell(t, .55, .8, .05, 'bandpass', 380, 0, 1.2, o); f.frequency.linearRampToValueAtTime(1300, t + .55); f.frequency.linearRampToValueAtTime(500, t + 1.4);
    H.swell(t + .15, .4, .6, .015, 'bandpass', 1500, 2800, 4, o);
  }],
  rain: [1.6, 0, (H, t, o) => { for (let j = 0; j < 26; j++) H.pl('sine', 1500 + Math.random() * 2200, t + Math.random() * 1.3, .012, .012 + Math.random() * .014, o, .001); H.swell(t, .3, .9, .012, 'highpass', 3000, 0, .6, o); }],
  /* a small static crackle */
  zap: [.4, 0, (H, t, o) => { for (let j = 0; j < 6; j++) H.noise(t + Math.random() * .22, .012, .04, 'highpass', 4000, 0, .7, o); H.tone('sine', 1000, 1600, t, .08, .03, o, .002); }],
  slam: [.8, 0, (H, t, o) => { H.tone('sine', 110, 38, t, .35, .32, o, .003); H.noise(t, .3, .15, 'lowpass', 500, 80, .7, o); for (let j = 0; j < 3; j++) H.pl('triangle', 600 + j * 170, t + .05 + j * .05, .015, .025, o, .001); }],
  rumble: [1.8, 0, (H, t, o) => { H.swell(t, .5, 1.1, .14, 'lowpass', 180, 90, .7, o); const s = H.tone('sine', 46, 40, t, 1.4, .12, o, .3); H.wob(s, t, 1.4, 7, 4); }],
  /* a guardian is about to do something: "ba-ding!", always the same shape so it is easy to learn (arg: kind shifts it) */
  gtell: [.6, 1, (H, t, o, a) => {
    const k = { knot: 0, boiler: -3, cloud: 2, heart: -5 }[a] || 0, f1 = hz(81 + k), f2 = hz(88 + k);
    H.tone('triangle', f1, 0, t, .07, .13, o, .003); const s = H.tone('triangle', f2, 0, t + .09, .2, .14, o, .003); H.wob(s, t + .1, .2, 9, f2 * .015);
    H.pl('sine', f2 * 2, t + .09, .12, .03, o); H.noise(t, .25, .02, 'bandpass', 1200, 3200, 1, o);
  }],
  ghit: [.5, 0, (H, t, o) => {
    H.tone('sine', 220, 95, t, .16, .22, o, .002); const s = H.tone('triangle', 520, 470, t, .25, .06, o, .004); H.wob(s, t, .25, 14, 20);
    H.noise(t, .1, .08, 'lowpass', 1500, 250, .8, o); for (let j = 0; j < 3; j++) H.pl('sine', 3000 + j * 700, t + .06 + j * .04, .03, .016, o, .001);
  }],
  /* a guardian calms: a big warm swell */
  calm: [3, 1, (H, t, o) => {
    for (const n of ['C3', 'G3', 'E4', 'B4', 'D5', 'G5']) H.sus(H.W.warm, NH(n), t, 1.4, .028, o, .9, .9);
    ['G6', 'E6', 'D6', 'B5', 'G5', 'E5'].forEach((n, j) => H.bell(NH(n), t + .5 + j * .12, .6, .045, o));
    H.swell(t, 1, 1.2, .02, 'highpass', 3000, 8000, .6, o); H.tone('sine', 65, 0, t + .2, 1.2, .1, o, .5);
  }],
  bubble: [.5, 0, (H, t, o) => { [[300, 700], [400, 900], [520, 1150]].forEach(([a, b], j) => { const s = H.tone('sine', a, b, t + j * .07, .09, .1, o, .006); H.wob(s, t + j * .07, .09, 18, 25); }); }],
  /* the Peddler's shop bell */
  shop: [.9, 1, (H, t, o) => { H.bell(NH('E6'), t, .4, .07, o); H.bell(NH('C6'), t + .14, .55, .07, o); H.pl(H.W.box, NH('G6'), t + .3, .3, .04, o); }],
  buy: [.6, 1, (H, t, o) => {
    ['C6', 'E6', 'G6'].forEach((n, j) => H.pl(H.W.box, NH(n), t + j * .05, .2, .07, o)); H.bell(NH('C7'), t + .16, .35, .05, o); H.tone('sine', 400, 900, t, .04, .08, o, .002);
    for (let j = 0; j < 3; j++) H.pl('sine', 3500 + j * 500, t + .2 + j * .05, .03, .014, o, .001);
  }],
  /* not enough dew / can't: a gentle "uh-uh" */
  nope: [.35, 0, (H, t, o) => { H.tone('triangle', NH('E4'), 0, t, .08, .13, o, .004); H.tone('triangle', NH('C4'), 0, t + .11, .13, .13, o, .004); }],
  menu: [.05, 0, (H, t, o) => { H.tone('sine', 1100, 1250, t, .03, .08, o, .002); }],
  select: [.3, 0, (H, t, o) => { H.tone('triangle', NH('G5'), 0, t, .06, .15, o); H.tone('triangle', NH('D6'), 0, t + .06, .14, .15, o); H.tone('sine', NH('D7'), 0, t + .06, .08, .025, o); }],
  back: [.25, 0, (H, t, o) => { H.tone('triangle', NH('D6'), 0, t, .06, .12, o); H.tone('triangle', NH('G5'), 0, t + .06, .12, .12, o); }],
  /* paper rustle */
  map: [.5, 0, (H, t, o) => { [0, .07, .16, .24].forEach(d => H.noise(t + d, .05 + Math.random() * .04, .03 + Math.random() * .03, 'bandpass', 2600 + Math.random() * 1800, 0, .8, o)); }],
  /* dialog text blips (arg: 'peddler' lower, 'heart' higher) */
  talk: [.06, 0, (H, t, o, a) => { const b = a === 'peddler' ? 62 : a === 'heart' ? 79 : 72, f = hz(b + [0, 2, 4, 7, 9][(Math.random() * 5) | 0]); H.pl('triangle', f, t, .025, .05, o, .003); H.pl('sine', f * 2, t, .015, .015, o, .002); }]
};
const ALIAS = { swish: 'swing', bonk: 'hit', leaf: 'hurt', sign: 'talk', rest: 'save', block: 'clang', confirm: 'select', cancel: 'back', move: 'menu',
  open: 'door', steam: 'vent', gust: 'wind', boing: 'bounce', glowcap: 'bounce', drop: 'dew', blip: 'talk', get: 'pickup' };
/* rate limits [max plays, per window s] */
const RATE = { step: [1, .115], dew: [1, .04], talk: [1, .055], swing: [2, .09], hit: [3, .06], bloom: [3, .08], bud: [3, .08], land: [2, .1], jump: [2, .08],
  menu: [2, .05], select: [2, .08], back: [2, .08], spore: [3, .1], crumble: [2, .15], zap: [2, .12], rain: [1, .5], wind: [2, .4], clang: [2, .1], cling: [2, .1],
  vent: [2, .2], splash: [2, .12], gtell: [1, .25], ghit: [2, .1], hurt: [1, .3], thorn: [1, .2], map: [1, .2], nope: [1, .2] }, RATE_DEF = [2, .06], MAXV = 24;
/* the music dips under these for the given seconds */
const DUCK = { ability: 3.1, calm: 1.6, life: 1.7, vessel: 1.5, charm: 1.2, faint: 2.2, wake: 1.3, save: 1.6 };
const SFX_NAMES = Object.keys(SFX);

/* ---------- one audio graph + synth + sequencer in a given context ---------- */
function create(ac, live) {
  const I = { ac, live: !!live, rl: {}, vox: [], seqs: [], cur: null, fo: null, muted: false, musOn: true, noLimits: false, dewN: 0, dewT: -9, errs: 0,
    base: { master: .8, sfx: 1.3, mus: .38 } };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const dyn = (th, kn, ra, at, re) => { const c = ac.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = kn; c.ratio.value = ra; c.attack.value = at; c.release.value = re; return c; };
  const pan = x => { if (!ac.createStereoPanner) return gain(1); const p = ac.createStereoPanner(); p.pan.value = x; return p; };
  const comp = dyn(-16, 8, 3, .004, .2), lim = dyn(-3, 0, 20, .001, .06), trim = gain(.85);
  I.master = gain(I.base.master); I.sfx = gain(I.base.sfx); I.mus = gain(I.base.mus); I.duck = gain(1);
  I.mRev = gain(0); I.sRev = gain(.2); I.vOut = gain(.9);
  I.sfx.connect(I.master); I.mus.connect(I.duck); I.duck.connect(I.master);
  I.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ac.destination);
  /* the cave reverb: one mono convolver (cheap) with a generated, darkening impulse (a few early taps, then a soft tail),
     widened by a 13 ms delay on the right */
  try {
    const sr = ac.sampleRate, len = Math.floor(sr * 2.2), ir = ac.createBuffer(1, len, sr), d = ir.getChannelData(0); let y = 0;
    for (let i = Math.floor(sr * .011); i < len; i++) { const x = i / len; y += (.6 - .48 * x) * ((Math.random() * 2 - 1) - y); d[i] = y * Math.pow(1 - x, 2.3); }
    for (const [ms, a] of [[17, .5], [29, .35], [43, .25]]) d[Math.floor(sr * ms / 1000)] += a;
    const cv = ac.createConvolver(), mono = gain(1), hd = ac.createDelay(.05), mg = ac.createChannelMerger(2);
    cv.normalize = true; cv.buffer = ir; mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers'; hd.delayTime.value = .013;
    I.duck.connect(I.mRev); I.sfx.connect(I.sRev); I.mRev.connect(mono); I.sRev.connect(mono); mono.connect(cv);
    cv.connect(mg, 0, 0); cv.connect(hd); hd.connect(mg, 0, 1); mg.connect(I.vOut); I.vOut.connect(I.master);
  } catch (e) {}
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const mk = h => { const n = h.length + 1, re = new Float32Array(n), im = new Float32Array(n); for (let k = 0; k < h.length; k++) im[k + 1] = h[k]; return ac.createPeriodicWave(re, im); };
  const W = { warm: mk([1, .4, .22, .12, .07, .04, .025]), round: mk([1, .32, .1, .04]), box: mk([1, .18, .06]), kal: mk([1, .1, .05]),
    flute: mk([1, .14, .05, .02]), odd: mk([1, .02, .38, .01, .18, 0, .09, 0, .045]), reed: mk([1, .55, .4, .3, .22, .16, .12, .08, .05]),
    brass: mk([1, .6, .38, .22, .13, .07, .04]), click: mk(new Array(48).fill(1)) };

  /* synth helpers (H) */
  const H = { ac, W };
  H.osc = w => { const o = ac.createOscillator(); if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w); return o; };
  H.env = (g, t, pk, dur, att) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + att); g.gain.exponentialRampToValueAtTime(.0001, t + att + dur); };
  /* a blip with an exponential glide f0 → f1 (f1 0: no glide) */
  H.tone = (w, f0, f1, t, dur, pk, out, att = .003) => {
    const o = H.osc(w), g = ac.createGain();
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    H.env(g, t, pk, dur, att); o.connect(g); g.connect(out); o.start(t); o.stop(t + att + dur + .02); return o;
  };
  /* a plucked / struck note: quick rise, natural decay (time constant tau) */
  H.pl = (w, f, t, tau, pk, out, att = .002) => {
    const o = H.osc(w), g = ac.createGain();
    o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + att); g.gain.setTargetAtTime(0, t + att, tau);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + att + tau * 7); return o;
  };
  /* a held note: attack, a gentle settle, release at the end (f0: glide in from f0) */
  H.sus = (w, f, t, dur, pk, out, att, rel, f0) => {
    const o = H.osc(w), g = ac.createGain(), a = Math.min(att, dur * .5);
    if (f0) { o.frequency.setValueAtTime(f0, t); o.frequency.setTargetAtTime(f, t, .025); } else o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.setTargetAtTime(pk * .72, t + a, .25);
    g.gain.setTargetAtTime(0, t + Math.max(a, dur - rel * .5), rel / 3);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + rel * 2.5); return o;
  };
  H.bell = (f, t, tau, pk, out) => { H.pl('sine', f, t, tau, pk, out, .002); H.pl('sine', f * 2.76, t, tau * .3, pk * .3, out, .001); H.pl('sine', f * 5.4, t, tau * .1, pk * .12, out, .001); };
  H.wob = (o, t, dur, rate, depth) => { const l = ac.createOscillator(), lg = gain(depth); l.frequency.value = rate; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); };
  const src = (t, stop) => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(t, Math.random() * .5); s.stop(stop); return s; };
  const filt = (type, f0, f1, q, t, dur) => { const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); return f; };
  /* a filtered noise burst */
  H.noise = (t, dur, pk, type, f0, f1, q, out) => {
    const s = src(t, t + dur + .03), f = filt(type, f0, f1, q, t, dur), g = ac.createGain();
    H.env(g, t, pk, dur, .002); s.connect(f); f.connect(g); g.connect(out);
  };
  /* a noise swell: a linear rise over att, then a soft fall; returns the filter */
  H.swell = (t, att, rel, pk, type, f0, f1, q, out) => {
    const s = src(t, t + att + rel * 1.6 + .05), f = filt(type, f0, f1, q, t, att + rel), g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + att); g.gain.setTargetAtTime(0, t + att, rel / 3);
    s.connect(f); f.connect(g); g.connect(out); return f;
  };
  /* a fluttering noise (leaves, pouring water): filtered noise with a fast tremolo */
  H.flut = (t, dur, pk, type, f0, f1, q, rate, out) => {
    const s = src(t, t + dur + .2), f = filt(type, f0, f1, q, t, dur), am = gain(.55), l = ac.createOscillator(), lg = gain(.45), g = ac.createGain();
    l.frequency.value = rate; l.connect(lg); lg.connect(am.gain); l.start(t); l.stop(t + dur + .2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + .03); g.gain.setTargetAtTime(0, t + dur * .7, dur * .1);
    s.connect(f); f.connect(am); am.connect(g); g.connect(out);
  };
  /* a wooden creak: a slow click train (stick-slip) through a resonant band */
  H.creak = (t, dur, f0, f1, band, pk, out) => {
    const o = H.osc(W.click), f = ac.createBiquadFilter(), g = ac.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur); H.wob(o, t, dur, 2.3, f0 * .25);
    f.type = 'bandpass'; f.frequency.value = band; f.Q.value = 4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + .06); g.gain.setValueAtTime(pk, t + dur - .1); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .02);
  };
  I.H = H;

  /* ----- sound effects: rate limits and a voice cap (the oldest non-'keep' voice is dropped) ----- */
  function rateOk(name, t) {
    const r = RATE[name] || RATE_DEF, a = I.rl[name] || (I.rl[name] = []);
    while (a.length && a[0] <= t - r[1]) a.shift();
    if (a.length >= r[0]) return false; a.push(t); return true;
  }
  function voiceBus(t, len, keep) {
    const v = I.vox;
    for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= t) v.splice(i, 1);
    if (v.length >= MAXV) { let k = v.findIndex(x => !x.keep); if (k < 0) k = 0; const d = v.splice(k, 1)[0]; d.g.gain.setTargetAtTime(0, t, .006); }
    const g = gain(1); g.connect(I.sfx); v.push({ g, end: t + len, keep }); return g;
  }
  I.play = (name, arg, t) => {
    if (name === 'focus') { I.focus(arg === undefined ? true : !!arg, t); return true; }
    if (!has(SFX, name)) return false;
    if (!I.noLimits && !rateOk(name, t)) return false;
    if (name === 'dew') { I.dewN = t - I.dewT < .5 ? Math.min(10, I.dewN + 1) : 0; I.dewT = t; }
    SFX[name][2](H, t, voiceBus(t, SFX[name][0], SFX[name][1]), arg, I);
    if (DUCK[name] && I.musOn && !I.muted) { const g = I.duck.gain; g.cancelScheduledValues(t); g.setTargetAtTime(.35, t, .05); g.setTargetAtTime(1, t + DUCK[name], .35); }
    return true;
  };
  I.setMute = (on, t) => { I.muted = !!on; const g = I.master.gain; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0 : I.base.master, t, .03); if (on) I.focus(false, t); };
  /* music only: the bus reaches 0 by t+0.1; the sequencers stop making notes but keep counting */
  I.setMusicOn = (on, t) => { I.musOn = !!on; const g = I.mus.gain; g.cancelScheduledValues(t); if (on) g.setTargetAtTime(I.base.mus, t, .03); else { g.setTargetAtTime(0, t, .018); g.setValueAtTime(0, t + .1); } };

  /* ----- the focus hum: a soft rising tone with a shimmer that holds until play('focus', false) (or 8 s) ----- */
  I.focus = (on, t) => {
    const F = I.fo;
    if (!on) {
      if (F) {
        I.fo = null; F.g.gain.cancelScheduledValues(t); F.g.gain.setTargetAtTime(0, t, .05); for (const x of F.st) x.stop(t + .5);
        H.pl('sine', 1568, t, .12, .012 + .02 * Math.min(1, (t - F.t0) / 1.3), I.sfx, .004);
        if (I.live) setTimeout(() => { try { F.g.disconnect(); } catch (e) {} }, 1500);
      }
      return;
    }
    if (F || I.muted) return;
    const o1 = H.osc(W.flute), o2 = H.osc('sine'), l = ac.createOscillator(), lg = gain(.3), am = gain(.7), g2 = gain(.35), g = gain(0);
    o1.frequency.setValueAtTime(196, t); o1.frequency.exponentialRampToValueAtTime(392, t + 1.3);
    o2.frequency.setValueAtTime(294, t); o2.frequency.exponentialRampToValueAtTime(588, t + 1.3);
    l.frequency.setValueAtTime(4, t); l.frequency.linearRampToValueAtTime(7, t + 1.3); l.connect(lg); lg.connect(am.gain);
    o1.connect(am); o2.connect(g2); g2.connect(am); am.connect(g); g.connect(I.sfx);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.04, t + .3); g.gain.linearRampToValueAtTime(.055, t + 1.3);
    o1.start(t); o2.start(t); l.start(t);
    I.fo = { g, st: [o1, o2, l], t0: t, spark: t + .15 };
  };
  /* held voices, from the pump: focus sparkles rise with the charge; a focus left on for 8 s stops by itself */
  I.tick = now => {
    const F = I.fo;
    if (F) {
      if (now - F.t0 > 8) I.focus(false, now);
      else { if (F.spark < now) F.spark = now; while (F.spark < now + .1) { const k = Math.min(1, (F.spark - F.t0) / 1.3); H.pl('sine', 1100 + 1700 * k + Math.random() * 500, F.spark, .02, .006 + .008 * k, I.sfx, .002); F.spark += .08 + Math.random() * .07; } }
    }
    return !!I.fo;
  };

  /* ----- music: a 16th-step sequencer per tune; the pump calls schedule(now, until); crossfades run two at once ----- */
  const lpOf = (d, v) => d.lp + (d.lpV || 0) * v;
  /* a tune's fader: a linear ramp we can always evaluate (so a crossfade can start from anywhere, in every browser) */
  const fadeTo = (q, t, to, dur) => {
    const g = q.n.out.gain, F = q.fade, x = t <= F.a ? F.v0 : t >= F.b ? F.v1 : F.v0 + (F.v1 - F.v0) * (t - F.a) / (F.b - F.a);
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(t); else g.cancelScheduledValues(t);
    g.setValueAtTime(x, t); g.linearRampToValueAtTime(to, t + dur); q.fade = { a: t, b: t + dur, v0: x, v1: to };
  };
  I.music = (name, v, t) => {
    v = cl(+v || 0, 0, 1);
    const cur = I.cur;
    if (cur && cur.name === name) { cur.vWant = v; if (cur.d.lpV) cur.n.mel.frequency.setTargetAtTime(lpOf(cur.d, v), t, .4); return; }
    if (cur) { fadeTo(cur, t, 0, cur === I.cur && name ? 1 : 1.2); cur.end = t + 1.3; }
    I.cur = null;
    if (!name || !has(SONGS, name)) return;
    const d = SONGS[name], n = { out: gain(0), mel: ac.createBiquadFilter(), lead: gain(1), dl: ac.createDelay(1.5), fb: gain(d.fb), wet: gain(d.wet), ar: pan(.32), pd: pan(-.28), dr: gain(1), amb: pan(-.2) };
    n.mel.type = 'lowpass'; n.mel.frequency.value = lpOf(d, v); n.mel.Q.value = .5; n.dl.delayTime.value = Math.min(1.4, d.sd * d.echo);
    n.lead.connect(n.mel); n.lead.connect(n.dl); n.dl.connect(n.fb); n.fb.connect(n.dl); n.dl.connect(n.wet); n.wet.connect(n.mel);
    n.ar.connect(n.mel); n.pd.connect(n.mel); n.mel.connect(n.out); n.dr.connect(n.out); n.amb.connect(n.out); n.out.connect(I.mus);
    const q = { name, d, n, sd: d.sd, step: 0, next: t + .05 + (d.pre || 0), v, vWant: v, bar: null, end: 0, prevF: 0, seed: name.length * 7.31 + name.charCodeAt(0), fade: { a: t, b: t, v0: 0, v1: 0 } };
    fadeTo(q, t, 1, cur ? (d.fin || 1) : Math.min(d.fin || 1, .5));
    I.seqs.push(q); I.cur = q;
    I.mRev.gain.setTargetAtTime(d.verb, t, .4); I.sRev.gain.setTargetAtTime(d.space, t, .4);
  };
  I.schedule = (now, until) => {
    for (let k = I.seqs.length - 1; k >= 0; k--) {
      const q = I.seqs[k];
      if (q.end && now > q.end) { I.seqs.splice(k, 1); if (I.live) setTimeout(() => { try { for (const x in q.n) q.n[x].disconnect(); } catch (e) {} }, 4000); continue; }
      if (q.next < now - .1) q.next = now + .03; /* fell behind (a throttled timer): skip ahead, never burst */
      while (q.next < until && (!q.end || q.next < q.end)) {
        const s = q.step, sw = (s & 3) === 2 ? q.d.swing * q.sd : (s & 3) === 3 ? q.d.swing * q.sd * .5 : 0;
        if (!I.muted && I.musOn) { try { step(q, s, q.next + sw); } catch (e) { I.errs++; } }
        q.next += q.sd; q.step++;
      }
    }
    return I.seqs.length > 0;
  };
  I.resync = now => { for (const q of I.seqs) q.next = now + .05; };

  function newBar(q, g) {
    const d = q.d; q.v = q.vWant;
    const nb = d.bars.length, k = g < nb ? g : d.loopBar + (g - d.loopBar) % (nb - d.loopBar), e = d.bars[k];
    const f = Object.assign({}, d.acc, e.f), st = d.dyn ? d.dyn[q.v < .34 ? 0 : q.v < .67 ? 1 : 2] : null;
    if (st) Object.assign(f, st);
    q.bar = { g, e, f, sec: d.sec[e.s], b: e.b, tr: d.tr + (e.f.tr || 0) + (st && st.tr || 0), first: e.first, last: e.last };
  }
  /* one note of a melodic voice */
  function voice(w, f, t, dur, pk, out, f0) {
    switch (w) {
      case 'box': H.pl(W.box, f, t, cl(.3 + dur * .5, .3, .9), pk, out); H.pl('sine', f * 4.2, t, .03, pk * .16, out, .001); break;
      case 'kal': { const o = H.pl(W.kal, f, t, cl(.22 + dur * .4, .22, .7), pk, out, .003); o.frequency.setValueAtTime(f * 1.012, t); o.frequency.setTargetAtTime(f, t + .002, .012); H.pl('sine', f * 5.9, t, .018, pk * .28, out, .001); break; }
      case 'bell': H.bell(f, t, cl(.45 + dur * .4, .5, 1.3), pk * .9, out); break;
      case 'glock': H.pl('sine', f, t, cl(.16 + dur * .3, .18, .5), pk * .85, out, .001); H.pl('sine', f * 2.76, t, .05, pk * .25, out, .001); break;
      case 'pluck': H.pl(W.warm, f, t, cl(.08 + dur * .25, .1, .35), pk * .9, out); break;
      case 'soft': H.pl('sine', f, t, cl(.1 + dur * .3, .12, .5), pk, out, .003); break;
      case 'flute': { const o = H.sus(W.flute, f, t, dur, pk * .85, out, .04, .08); if (dur > .4) H.wob(o, t + .2, dur, 5, f * .006); if (dur > .15) H.noise(t, .05, pk * .06, 'bandpass', Math.min(9000, f * 3), 0, 1.2, out); break; }
      case 'whistle': { const o = H.sus('sine', f, t, dur, pk * .8, out, .05, .1, f0 && Math.abs(f0 / f - 1) < .5 ? f0 : 0); H.wob(o, t + .12, dur, 5.5, f * .007); break; }
      case 'clar': { const o = H.sus(W.odd, f, t, dur, pk * .75, out, .02, .05); if (dur > .4) H.wob(o, t + .2, dur, 5, f * .004); break; }
      case 'accord': H.sus(W.reed, f * 1.003, t, dur, pk * .32, out, .03, .06); H.sus(W.reed, f / 1.003, t, dur, pk * .32, out, .03, .06); break;
      case 'horn': { const o = H.sus(W.brass, f, t, dur, pk * .82, out, .05, .1); if (dur > .4) H.wob(o, t + .2, dur, 4.5, f * .005); break; }
      case 'bass': H.sus(W.round, f, t, dur, pk, out, .012, .07); break;
      case 'bassS': H.pl(W.round, f, t, cl(dur * .6, .1, .22), pk, out, .004); break;
    }
  }
  /* a soft pad chord (two detuned warm voices a note) for the chord's length */
  function pad(T, t, len, lv, out) {
    const a = Math.min(.45, len * .3), rel = .5;
    for (let k = 0; k < Math.min(4, T.length); k++) {
      const f = hz(T[k]), g = ac.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + a); g.gain.setTargetAtTime(0, t + len, rel / 3); g.connect(out);
      for (const dt of [1.0025, .9975]) { const o = H.osc(W.warm); o.frequency.value = f * dt; o.connect(g); o.start(t); o.stop(t + len + rel * 2.5); }
    }
  }
  /* light percussion, all from noise and short tones */
  const D = {
    kick: (t, o, g, f = 120) => H.tone('sine', f, 42, t, .14, g, o, .002),
    tom: (t, o, f, g) => { H.tone('sine', f, f * .62, t, .22, g, o, .003); H.noise(t, .03, g * .25, 'lowpass', 1200, 0, .7, o); },
    timp: (t, o, f, g) => { H.pl('sine', f, t, .45, g, o, .004); H.pl('sine', f * 1.5, t, .2, g * .3, o, .004); H.noise(t, .06, g * .3, 'lowpass', 600, 0, .7, o); },
    snare: (t, o, g) => { H.noise(t, .13, g, 'bandpass', 1900, 1100, .7, o); H.tone('triangle', 210, 150, t, .06, g * .5, o); },
    hat: (t, o, g) => H.noise(t, .03, g, 'highpass', 8000, 0, .7, o),
    shk: (t, o, g) => H.noise(t, .05, g, 'bandpass', 6200, 0, 2.5, o),
    brush: (t, o, g) => H.noise(t, .2, g, 'bandpass', 3200, 1600, .6, o),
    rim: (t, o, g) => H.noise(t, .03, g, 'bandpass', 2400, 0, 4, o),
    tamb: (t, o, g) => H.noise(t, .08, g, 'bandpass', 7500, 0, 3, o),
    wood: (t, o, f, g) => { H.pl('sine', f, t, .025, g, o, .001); H.pl('triangle', f * 2.3, t, .01, g * .3, o, .001); },
    clank: (t, o, g) => { H.pl('sine', 520, t, .1, g, o, .001); H.pl('sine', 1340, t, .05, g * .5, o, .001); H.noise(t, .02, g * .4, 'bandpass', 1800, 0, 5, o); },
    crash: (t, o, g) => H.noise(t, 1.1, g, 'highpass', 5000, 8000, .5, o)
  };
  const ext = (T, oct) => { const E = []; for (let k = 0; k < oct; k++) for (const m of T) E.push(m + 12 * k); return E; };

  function step(q, s, t) {
    const d = q.d, spb = d.spb, g = (s / spb) | 0, i = s - g * spb, sd = q.sd, n = q.n;
    if (!q.bar || q.bar.g !== g) newBar(q, g);
    const B = q.bar, f = B.f, tr = B.tr, half = spb >> 1, cs = B.sec.C[B.b], two = cs.length > 1;
    const c = cs[two && i >= half ? 1 : 0], cst = i === 0 || (two && i === half), clen = (two ? half : spb) * sd;
    const r = mod(c.r + tr), base = 55 + mod(r - 7), T = c.iv.map(x => base + x), bn = 40 + mod(c.b + tr + 8), R = rnd(q.seed + s * 1.618);

    /* lead (+ a doubling voice, + a harmony a chord tone below) */
    const L = B.sec.L[B.b][i];
    if (L && !f.rest) {
      const m = L[0] + tr + (f.oct || 0), dur = L[1] * sd, lv = d.lv * (f.lvM || 1), w = f.inst || d.lead;
      voice(w, hz(m), t, dur, lv, n.lead, q.prevF); q.prevF = hz(m);
      if (f.dbl) voice(f.dbl, hz(m + (f.dblOct || 0)), t, dur, lv * (f.dblLv || .55), n.lead);
      if (f.harm && L[1] >= 2) {
        const pcs = c.iv.map(x => mod(r + x)); let h = m - 3; while (h > m - 10 && pcs.indexOf(mod(h)) < 0) h--;
        if (h > m - 10) voice(w, hz(h), t, dur, lv * .42, n.lead);
      }
    }
    /* pad */
    if (f.pad && cst) { pad(T, t, clen, f.pad, n.pd); if (f.pad2) pad(T.map(x => x + 12), t, clen, f.pad2, n.pd); }
    /* arpeggio / chord layer */
    const ap = f.arp, av = f.arpV || 'pluck', al = f.arpLv || .03, ao = n.ar;
    if (ap === 'harp') { if (!(i & 1)) voice(av, hz(ext(T, 3)[[0, 1, 2, 3, 4, 5, 4, 3][(i >> 1) % 8]] + 12), t, sd * 2, al, ao); }
    else if (ap === 'roll') voice(av, hz(ext(T, 2)[[0, 1, 2, 3, 4, 3, 2, 1][i % 8]] + 12), t, sd * 1.5, al * (i % 4 ? .75 : 1), ao);
    else if (ap === 'pizz') { if ((i & 3) === 2) { voice(av, hz(T[1] + 12), t, sd, al, ao); voice(av, hz(T[2] + 12), t, sd, al * .8, ao); } }
    else if (ap === 'twinkle') { if (!(i & 1) && R < .3) voice(av, hz(ext(T, 2)[(R * 97 | 0) % (T.length * 2)] + 24), t, sd * 2, al * (.6 + R), ao); }
    else if (ap === 'glass') voice(av, hz(ext(T, 3)[(i % 8) + (i >= 8 ? 1 : 0)] + 12), t, sd * 2, al * (i % 4 ? .7 : 1), ao);
    else if (ap === 'waltz') { if (i === 4 || i === 8) for (const m of [T[1], T[2], T[0] + 12]) voice(av, hz(m), t, sd * 2, al * .7, ao); }
    else if (ap === 'pah') { if (i === 4 || i === 12) for (const m of [T[0] + 12, T[1] + 12, T[2] + 12]) voice(av, hz(m), t, sd * 1.5, al * .7, ao); else if (i === 14 && (g & 1)) voice('glock', hz(T[0] + 36), t, sd, al * .8, ao); }
    else if (ap === 'ost' || ap === 'ost2') {
      const th = c.iv[1], P = [0, 12, 7, 12, th, 12, 7, 12];
      if (ap === 'ost2' || !(i & 1)) { const p = P[(ap === 'ost2' ? i : i >> 1) % 8] + (ap === 'ost2' && i >= 8 ? 12 : 0); voice(av, hz(T[0] + p), t, sd * 1.5, al * (i % 4 ? .7 : 1), ao); }
    }
    /* bass (E2..D#3 roots) */
    const bs = f.bass, bl = f.bassLv || .2, bo = n.mel, bt = (iv, steps, gg = 1, w = 'bass') => voice(w, hz(bn + iv), t, steps * sd, bl * gg, bo);
    if (bs === 'soft') { if (i === 0 || (two && i === half)) bt(0, two ? half : spb === 16 ? half : spb); else if (i === half && spb === 16) bt(7, half, .85); }
    else if (bs === 'walk') { if (!(i & 3)) bt([0, 7, 12, 7][i >> 2], 3.5); }
    else if (bs === 'waltz') { if (i === 0) bt(0, 4); else if (two && i === half) bt(0, 4, .9); }
    else if (bs === 'hop') { if (i === 0 || i === 6) bt(0, 1.5, 1, 'bassS'); else if (i === 8) bt(7, 1.5, .9, 'bassS'); else if (i === 12) bt(12, 1.5, .8, 'bassS'); }
    else if (bs === 'oom') { if (i === 0) bt(0, 2, 1.1, 'bassS'); else if (i === 8) bt(7, 2, 1, 'bassS'); else if (i === 14 && !(g & 1)) bt(12, 1, .7, 'bassS'); }
    else if (bs === 'drone') { if (cst) bt(0, two ? half : spb, .8); }
    else if (bs === 'deep') { if (cst) bt(0, two ? half : spb, .9); if (i === half + 2 && !two) bt(12, 4, .45); }
    else if (bs === 'pulse') { if (!(i & 1)) bt(i === 0 || i === 8 ? 0 : (i === 14 ? 7 : 0), 1.3, i & 3 ? .7 : 1, 'bassS'); }
    else if (bs === 'drive') { if (!(i & 1)) bt([0, 0, 12, 0, 0, 7, 12, 7][i >> 1], 1.3, i & 3 ? .75 : 1.05, 'bassS'); }
    /* drums */
    const o = n.dr, dr = f.drum;
    if (dr === 'brush') { if (i === 0) D.kick(t, o, .11); if (i === 4 || i === 12) D.brush(t, o, .03); if ((i & 3) === 2) D.shk(t, o, .01); }
    else if (dr === 'shaker') { if (i === 0) D.kick(t, o, .08); if (!(i & 1)) D.shk(t, o, (i & 3) === 2 ? .026 : .012); if (i === 12) D.wood(t, o, 1250, .035); }
    else if (dr === 'clock') { if (!(i & 1)) D.wood(t, o, (i & 3) ? 1250 : 1750, (i & 3) ? .03 : .04); if (i === 0 || i === 8) D.kick(t, o, .13); if (i === 12 && (g & 1)) D.clank(t, o, .05); if (i === 14 && (g & 3) === 3) for (let k = 0; k < 3; k++) D.wood(t + k * .035, o, 2400, .02); }
    else if (dr === 'waltz') { if (i === 0) D.kick(t, o, .1); if (i === 4 || i === 8) D.shk(t, o, .022); }
    else if (dr === 'pulse') { if (i === 0) D.kick(t, o, .15, 85); if (i === 3) D.kick(t, o, .09, 75); }
    else if (dr === 'soft') { if (i === 0 || i === 8) D.kick(t, o, .13); if (i === 4 || i === 12) { D.rim(t, o, .035); D.tamb(t, o, .016); } if (!(i & 1)) D.hat(t, o, .008); }
    else if (dr === 'tom') { if (i === 0 || i === 6) D.tom(t, o, 110, .14); if (i === 8) D.tom(t, o, 146, .1); if (!(i & 1)) D.shk(t, o, .014); if (B.last && i >= 12) D.tom(t, o, 190 - (i - 12) * 18, .08); }
    else if (dr === 'battle' || dr === 'battle2') {
      const big = dr === 'battle2';
      if (i === 0 || i === 6 || i === 8 || (big && i === 10)) D.kick(t, o, .16);
      if (i === 4 || i === 12) D.snare(t, o, .07); if (!(i & 1)) D.hat(t, o, .011);
      if (big) { if (i & 1) D.shk(t, o, .014); if (B.first && i === 0) D.crash(t, o, .03); if (i === 7 || i === 15) D.snare(t, o, .018); }
      if (B.last && i >= 12) D.tom(t, o, 200 - (i - 12) * 25, .09);
    }
    else if (dr === 'timp') { const k = f.timpLv || 1; if (i === 0) D.timp(t, o, hz(bn), .2 * k); if (i === 8) D.timp(t, o, hz(bn + 7), .12 * k); if (B.last && i >= 8 && !(i & 1)) D.timp(t, o, hz(bn), (.05 + (i - 8) * .01) * k); }
    else if (dr === 'cue') { if (i === 0 && (B.first || B.last)) { D.crash(t, o, .025); D.timp(t, o, hz(bn), .18); } if (B.b === 2 && i >= 8 && !(i & 1)) D.timp(t, o, hz(bn), .04 + (i - 8) * .012); }
    if (f.timp && i === 0) D.timp(t, o, hz(bn), .13);
    /* ambience */
    const am = f.amb;
    if (am === 'drip') { if (!(i & 1) && R < .045) { const p = hz(84 + [0, 2, 4, 7, 9][(rnd(s * 3.1 + q.seed) * 5) | 0] + (R < .02 ? 12 : 0)); H.tone('sine', p, p * 1.5, t, .025, .03, n.amb, .001); H.pl('sine', p * 1.5, t + .025, .06, .018, n.amb, .001); } }
    else if (am === 'twinkle') { if (R < .035) voice('glock', hz(T[(R * 1000 | 0) % T.length] + 36), t, sd, .014, n.amb); }
    else if (am === 'steam') { if (i === 4 && g % 4 === 2) H.swell(t, .15, .3, .01, 'highpass', 3000, 5000, .6, n.amb); }
    else if (am === 'wind') { if (i === 0 && g % 4 === 1) { const ff = H.swell(t, 1.4, .9, .016, 'bandpass', 420, 0, 1.4, n.amb); ff.frequency.linearRampToValueAtTime(1300, t + 1.4); ff.frequency.linearRampToValueAtTime(600, t + 2.5); } }
  }
  return I;
}

/* ---------- live wrapper (with ?mute=1 every call returns at once) ---------- */
let I = null, muted = false, musOn = true, hid = false, want = null, timer = 0;
const quiet = p => { if (p && typeof p.catch === 'function') p.catch(() => {}); };
const now = () => I.ac.currentTime;
function pump() {
  timer = 0; if (!I || hid) return;
  const t = now(); let more = false;
  try { more = I.schedule(t, t + .15); } catch (e) {}
  try { more = I.tick(t) || more; } catch (e) {}
  if (more) run();
}
function run() { if (!timer && I && !hid && (I.seqs.length || I.fo)) timer = setTimeout(pump, 25); }
const tuneName = name => has(SONGS, name) ? name : has(MUSIC_ALIAS, name) && has(SONGS, MUSIC_ALIAS[name]) ? MUSIC_ALIAS[name] : null;
const A = RL.Audio = {
  ready: false, silent: SILENT,
  names: { music: MUSIC_NAMES.slice(), sfx: SFX_NAMES.slice() },
  unlock() {
    if (SILENT) return;
    try {
      if (!I) {
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        I = create(new AC(), true); A.ready = true; I.setMute(muted, 0); I.setMusicOn(musOn, 0);
        try { const b = I.ac.createBuffer(1, 1, 22050), s = I.ac.createBufferSource(); s.buffer = b; s.connect(I.ac.destination); s.start(0); } catch (e) {} /* iOS wake */
        if (want) I.music(want[0], want[1], now() + .06);
      }
      if (hid) { if (I.ac.suspend) quiet(I.ac.suspend()); return; }
      if (I.ac.state !== 'running' && I.ac.resume) quiet(I.ac.resume());
      run();
    } catch (e) {}
  },
  play(name, arg) {
    if (SILENT) return;
    try {
      if (has(ALIAS, name)) name = ALIAS[name];
      if (!I) return;
      if (name === 'focus' && !(arg === undefined || arg)) { I.focus(false, now()); return; }
      if (muted || hid) return;
      I.play(name, arg, now() + .002); run();
    } catch (e) {}
  },
  music(name, v) {
    if (SILENT) return;
    try {
      const nm = name === null || name === undefined || name === '' ? null : tuneName(name);
      if (nm === null && name !== null && name !== undefined && name !== '') return; /* an unknown name: keep what is playing */
      want = nm ? [nm, cl(+v || 0, 0, 1)] : null;
      if (!I) return;
      I.music(nm, cl(+v || 0, 0, 1), now() + .03); run();
    } catch (e) {}
  },
  mute(on) {
    if (SILENT) return true;
    muted = !!on;
    if (I) try { I.setMute(muted, now()); } catch (e) {}
    return muted;
  },
  /* music only (sound effects stay). Remembered before unlock; musicOn() with no argument just reports */
  musicOn(on) {
    if (on === undefined || SILENT) return musOn;
    musOn = !!on;
    if (I) try { I.setMusicOn(musOn, now()); } catch (e) {}
    return musOn;
  },
  hidden(on) {
    if (SILENT) return;
    hid = !!on; if (!I) return;
    try {
      const t = now();
      if (hid) { clearTimeout(timer); timer = 0; I.focus(false, t); I.master.gain.cancelScheduledValues(t); I.master.gain.setTargetAtTime(0, t, .01); if (I.ac.suspend) quiet(I.ac.suspend()); }
      else { if (I.ac.resume) quiet(I.ac.resume()); I.setMute(muted, t); I.resync(t); run(); }
    } catch (e) {}
  },
  isMuted() { return SILENT || muted; },
  /* debug: what is live right now */
  _state() {
    try { return I ? { ctx: I.ac.state, music: I.cur ? I.cur.name : null, v: I.cur ? I.cur.vWant : 0, tunes: I.seqs.length, voices: I.vox.length, focus: !!I.fo, muted, musOn, hidden: hid } : { ctx: null, muted: SILENT || muted, musOn, hidden: hid }; }
    catch (e) { return {}; }
  },
  /* test hooks: the same graph / synth / sequencer in any context (e.g. an OfflineAudioContext); nothing is played live */
  _render(ctx) { return create(ctx, false); },
  _songs: SONGS, _bad: BAD
};
})();
