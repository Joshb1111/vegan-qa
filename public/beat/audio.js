/* BEET BEAT — audio.js (AUDIO) v2. BEAT.Audio: every sound and every tune is made in code with WebAudio. No files, all original.

   API (with ?mute=1 every call returns at once: no AudioContext is ever made, nothing is read or stored)
     unlock()              call from a user gesture (a key, a tap). Nothing at all is made before the first call; later calls
                           just wake a suspended / interrupted context.
     play(name, arg)       a one-shot (SFX_NAMES). Tuned sounds (ring, portal, spawn, cp, seed, win, best, lose) follow the key
                           of the song that is playing. arg: ring 1 = pink (bigger), 0 = yellow.
     music(id|null, atBeat) (re)starts a song (MUSIC_NAMES) AT beat `atBeat` (default 0; fractions allowed) as heard at the
                           moment of the call, so a game running on its own clock (two players, online: the song follows
                           the run) and the music agree from that instant: song beat b is heard (b - atBeat) beats later.
                           Notes due within the output latency play at once (at most 50 ms late) or are skipped; held notes,
                           pads and bass that began before atBeat are sounded too (practice respawns start mid-track).
                           null stops. Unknown names stop. Before unlock() the wish is kept and started at unlock.
     time()                seconds into the current song AS HEARD, from the AudioContext clock: the output timestamp
                           (getOutputTimestamp, extrapolated with performance.now and never past currentTime), else
                           currentTime - outputLatency - baseLatency. Monotonic for each start of a song (it never goes back),
                           atBeat x 60 / bpm right after music(id, atBeat), null when there is no song or the context is not running
                           (locked, hidden, interrupted). Beat = time() / (60 / SONGS[id].bpm). The song keeps its clock while
                           muted or with the music off (it just makes no notes), so the game can stay locked to it.
     mute(on)              all sound off/on ('beat-mute' = '1' | '0').   musicOn(on)  music only ('beat-music' = '1' | '0').
                           Both read at load and stored on change, in try/catch. No argument = just report.
     hidden(on)            tab or room hidden: suspends the context (time() is null meanwhile). false resumes with the song moved
                           on by the time it was hidden (online races run on while hidden; a paused game stops its song).
     isMuted(), isMusicOn(), cues(beats|null) (a soft wood-block tick on those beats of the playing song: the designed presses,
                           one-player runs), song() (the playing id), beat() (time() in beats), latency() (s), state().
     SFX_NAMES, MUSIC_NAMES, TRACKS (the level songs), SONGS[id] = {bpm, key, intro, bars, beats, len, loopFrom, sections}.

   SOUNDS (SFX_NAMES): jump (a soft hop) land (a tiny tick) pad (spring-cap boing) ring (dandelion ting; arg 1 = pink) portal
     (flower-arch whoosh and bloom) flip (a seed-pod "fwip") crash (a springy boing! and a puff of leaves) spawn (back in: a
     pop up) cp (checkpoint chime) seed (golden-seed sparkle) win (finish fanfare) best (NEW BEST fanfare) count (3-2-1 boop)
     go (GO!) select (menu blip) lose (a kind "next time" phrase).
   SONGS (MUSIC_NAMES): patchwork, candyfloss, clatter (the levels), title (110 bpm: the title logo bounces at 110), results (a
     warm loop), win (a fanfare into the results loop), done (a gentle "good try" into the same loop). All of them loop.

   SECTION MAPS of the level songs. Bars count from 1 and include the intro; bar k spans beats 4(k-1) .. 4k; beat 0 is the run's
   start (x = 0). Every bar of every level song has a kick on each beat (soft in breaks), claps or snaps on 2 and 4 in verses and
   drops. A section's last bar has a FILL (16ths on beat 4) and most a RISE (a noise sweep), so every change is heard a beat
   ahead. The FINISH bar is a tail: its downbeat is the finish line (beat 4 x (intro + bars)), where the home chord lands; after
   it the song loops from bar 3 (the verse) for anyone still running. (In brackets: what the spec asks of each level there.)
   patchwork  PATCHWORK PULSE   110 bpm, G major, intro 2 + 36 bars = 38 bars, 82.9 s; finish on beat 152
     1-2   INTRO      count-in: kick, shaker; a two-note pickup at the end of bar 2          (run-up)
     3-10  VERSE 1    the whistle tune, bouncy bass, light plucks                             (HOP only, first thorns and crates)
     11-18 DROP 1     the hook (da-da-DA rhythm), full beat, 16th plucks, pads; crash on 11   (spring caps, puff rings)
     19-22 BREAK      airy: long notes, pads, the kick soft but still on every beat           (the one short gentle GLIDE)
     23-30 VERSE 2    the tune again, busier plucks                                           (HOP with caps and rings)
     31-38 DROP 2     the hook with a harmony line; bars 37-38 climb to the finish            (the finale)
     39    FINISH     G major rings out on the finish line
   candyfloss CANDYFLOSS CLIMB  124 bpm, F major, intro 2 + 40 bars = 42 bars, 81.3 s; finish on beat 168
     1-2   INTRO      count-in, sparkly hats; pickup in bar 2                                 (run-up)
     3-10  VERSE      bouncy staccato bells, snaps on 2 and 4                                 (HOP)
     11-18 DROP 1     the hook (repeated-note "ding-ding-da-DING"), full beat; crash on 11     (HOP: caps, rings)
     19-24 FLOAT      dreamy: long bell notes, airy pads, soft kick on every beat             (GLIDE through the cloud gaps)
     25-32 FLIP       the verse tune over a busier groove; bar 32 is a snare-roll build       (FLIP sections)
     33-40 DROP 2     the hook with harmony, crash on 33                                      (the speed-up portal on beat 128)
     41-42 FINALE     a rising run over Bb-C, a roll into the finish                          (last stretch)
     43    FINISH     F major rings out on the finish line
   clatter    CLATTER CRUNCH    138 bpm, A minor / C major, intro 2 + 44 bars = 46 bars, 80.0 s; finish on beat 184
     1-2   INTRO      clockwork count-in: kick, ticks, clank on the last 8th                  (run-up)
     3-10  VERSE 1    a syncopated chip riff, driving bass, clanks                            (HOP, speed changes)
     11-18 DROP 1     the punchy hook, full beat, 16th blips; crash on 11                     (gravity flips, caps)
     19-22 BREAK 1    sparse: long notes, pads, a ticking clock, soft kick on every beat      (GLIDE)
     23-30 VERSE 2    the riff again, busier                                                  (FLIP)
     31-38 DROP 2     the hook with harmony; crash on 31                                      (all modes)
     39-42 BUILD      pads, then a snare roll that doubles in bar 42 (E major: tension)       (the hard run-in)
     43-46 FINAL DROP the hook, then F to G: the big climb                                    (the finale)
     47    FINISH     C major rings out on the finish line
   (SONGS[id].sections lists the same as [name, firstBar, lastBar].)

   GRAPH  sfx voices → sfx bus ┐
          song: lead (+ echo) and arps → lowpass; pads → sidechain duck → lowpass; bass → lowpass; drums ─→ song out → music bus ┤
                                                                                 → master (mute) → compressor → limiter → trim → out
   CPU: drums are rendered once into small buffers at unlock (one buffer source + one gain a hit); tunes are oscillators made
   just ahead of time by a 25 ms sequencer that looks 150 ms ahead on the audio clock; muted or with the music off it makes no
   nodes at all (it only counts). Nothing here ever throws, with or without WebAudio. */
'use strict';
(function () {
const W = typeof window !== 'undefined' ? window : globalThis;
const BEAT = W.BEAT = W.BEAT || {};
const SILENT = (() => { try { return /[?&]mute=1(?:&|$)/.test(String((W.location && W.location.search) || '')); } catch (e) { return false; } })();
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/* ---------- notes ---------- */
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const hz = m => 440 * Math.pow(2, (m - 69) / 12);
const mid = s => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); if (!m) throw new Error('bad note ' + s); return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] ? -1 : 0) + (+m[3] + 1) * 12; };
const NH = s => hz(mid(s));
const MAJ = [0, 2, 4, 5, 7, 9, 11];
/* the note a diatonic third below m in the major key `key` (a harmony line); outside the scale: a major third below */
function third(m, key) { const pc = ((m - key) % 12 + 12) % 12, k = MAJ.indexOf(pc); if (k < 0) return m - 4; let d = pc - MAJ[(k + 5) % 7]; if (d <= 0) d += 12; return m - d; }

/* ---------- songs: 16 steps a bar ('-' holds the note before, '.' rests); a bar is [chords ('G', or 'C D' = two halves),
   lead, flags ('fill' 'rise' 'roll')]; a section is [name, kind, bars]. Kinds set the arrangement (KIND below). ---------- */
function parseBar(s) {
  const k = String(s || '').trim() ? String(s).trim().split(/\s+/) : [];
  if (k.length && k.length !== 16) throw new Error('a bar needs 16 steps (' + k.length + '): ' + s);
  const out = [];
  for (let i = 0; i < 16; i++) {
    const n = k[i]; if (!n || n === '-' || n === '.') { out.push(null); continue; }
    let len = 1; while (i + len < 16 && k[i + len] === '-') len++;
    out.push([mid(n), len]);
  }
  return out;
}
function parseChord(s) { const m = /^([A-G])([#b]?)(m?)$/.exec(s); if (!m) throw new Error('bad chord ' + s); return [(SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] ? -1 : 0) + 12) % 12, m[3] ? 3 : 4]; }
function build(meta, secs) {
  const S = Object.assign({ loopFrom: 0, sections: [], B: [] }, meta);
  let bar = 0;
  for (const [name, kind, rows] of secs) {
    S.sections.push([name, bar + 1, bar + rows.length]);
    rows.forEach((r, j) => {
      const f = {}; for (const w of String(r[2] || '').split(/\s+/)) if (w) f[w] = 1;
      S.B.push({ c: r[0].split(' ').map(parseChord), L: parseBar(r[1]), k: kind, f, first: j === 0 });
    });
    bar += rows.length;
  }
  S.nb = S.B.length; S.spb = 60 / S.bpm;
  if (S.bars != null && S.nb !== S.intro + S.bars + 1) throw new Error(S.id + ': ' + S.nb + ' bars, want ' + (S.intro + S.bars + 1));
  return S;
}

/* PATCHWORK PULSE: G major, 110 bpm, a whistled tune, plucks, wood blocks and claps */
const PW_V = [
  ['G', 'B4 - D5 - G5 - - - A5 - G5 - B5 - - -'], ['D', 'A5 - - - F#5 - D5 - E5 - F#5 - - - . .'],
  ['Em', 'G5 - - - E5 - B4 - E5 - G5 - B5 - - -'], ['C', 'C6 - B5 - A5 - G5 - E5 - - - . . D5 -'],
  ['G', 'B4 - D5 - G5 - - - A5 - G5 - B5 - D6 -'], ['D', 'D6 - - - C6 - B5 - A5 - - - F#5 - - -'],
  ['C D', 'E5 - G5 - C6 - - - D6 - C6 - A5 - - -']];
const PW_D = [
  ['C', 'E6 - - D6 - - C6 - - - G5 - A5 - C6 -'], ['D', 'D6 - - C6 - - A5 - - - F#5 - A5 - D6 -'],
  ['G', 'B5 - - A5 - - G5 - - - D5 - G5 - B5 -'], ['Em', 'B5 - - - A5 - G5 - E5 - - - . . . .'],
  ['C', 'E6 - - D6 - - C6 - - - G5 - A5 - C6 -'], ['D', 'D6 - - E6 - - F#6 - - - E6 - D6 - F#6 -']];
const patchwork = build({ id: 'patchwork', name: 'PATCHWORK PULSE', bpm: 110, key: 7, inst: 'meadow', intro: 2, bars: 36, loopFrom: 2 }, [
  ['INTRO', 'intro', [['G', ''], ['D', '. . . . . . . . . . . . G4 - A4 -', 'fill']]],
  ['VERSE 1', 'verse', PW_V.concat([['G', 'G5 - - - - - - - D5 . G5 . B5 . D6 .', 'fill rise']])],
  ['DROP 1', 'drop', PW_D.concat([['G', 'G6 - - - D6 - B5 - G5 - - - A5 - B5 -'], ['D', 'A5 - - - - - - - . . D5 . F#5 . A5 .', 'fill']])],
  ['BREAK', 'break', [['Em', 'B5 - - - - - - - G5 - - - - - - -'], ['C', 'C6 - - - - - - - E5 - - - G5 - - -'],
    ['G', 'D6 - - - - - - - B5 - - - - - - -'], ['D', 'A5 - - - - - - - F#5 - - - E5 - D5 -', 'fill rise']]],
  ['VERSE 2', 'verse2', PW_V.concat([['G', 'G5 - - - - - - - G5 . B5 . D6 . G6 .', 'fill rise']])],
  ['DROP 2', 'drop2', PW_D.concat([['C D', 'E6 - - D6 - - C6 - D6 - - E6 - - F#6 -'], ['C D', 'G6 - - - E6 - - - F#6 - - - A6 - - -', 'fill rise']])],
  ['FINISH', 'end', [['G', 'G6 - - - - - - - - - - - . . . .']]]]);

/* CANDYFLOSS CLIMB: F major, 124 bpm, music-box bells, glassy sparkles, snaps and bubble pops */
const CF_V = [
  ['F', 'A5 . C6 . F6 - - . C6 . A5 . F5 - - .'], ['C', 'G5 . C6 . E6 - - . D6 . C6 . G5 - - .'],
  ['Dm', 'F5 . A5 . D6 - - . C6 . A5 . F5 - - .'], ['Bb', 'D6 - - - C6 - Bb5 - F5 - - - G5 - A5 -'],
  ['F', 'A5 . C6 . F6 - - . G6 . F6 . C6 - - .'], ['C', 'E6 - - - D6 - C6 - G5 - - - E5 - - -'],
  ['Bb', 'F5 . Bb5 . D6 - - . C6 . Bb5 . F5 - - .']];
const CF_D = [
  ['Bb', 'D6 . D6 C6 D6 - - - F6 - D6 - C6 - Bb5 -'], ['C', 'E6 . E6 D6 E6 - - - G6 - E6 - D6 - C6 -'],
  ['Am', 'C6 . C6 Bb5 C6 - - - E6 - C6 - A5 - - -'], ['Dm', 'D6 - - - A5 - F5 - A5 - D6 - F6 - - -'],
  ['Bb', 'D6 . D6 C6 D6 - - - F6 - D6 - C6 - Bb5 -'], ['C', 'E6 . E6 D6 E6 - - - G6 - A6 - G6 - E6 -']];
const candyfloss = build({ id: 'candyfloss', name: 'CANDYFLOSS CLIMB', bpm: 124, key: 5, inst: 'sky', intro: 2, bars: 40, loopFrom: 2 }, [
  ['INTRO', 'intro', [['F', ''], ['C', '. . . . . . . . . . . . F5 - G5 -', 'fill']]],
  ['VERSE', 'verse', CF_V.concat([['C', 'E5 - - - G5 - - - C6 . C6 . E6 . G6 .', 'fill rise']])],
  ['DROP 1', 'drop', CF_D.concat([['F', 'F6 - - - C6 - A5 - C6 - F6 - A6 - - -'], ['C', 'G6 - - - E6 - - - C6 - - - . . . .', 'fill']])],
  ['FLOAT', 'break', [['Dm', 'A5 - - - - - - - D6 - - - - - - -'], ['Bb', 'F6 - - - - - - - D6 - - - - - - -'],
    ['F', 'C6 - - - - - - - A5 - - - C6 - - -'], ['C', 'G5 - - - - - - - E5 - - - - - - -'],
    ['Dm', 'F5 - - - A5 - - - D6 - - - - - - -'], ['C', 'E6 - - - - - - - D6 . C6 . Bb5 . G5 .', 'fill rise']]],
  ['FLIP', 'verse2', CF_V.concat([['C', 'C6 - - - - - - - C6 . C6 . C6 C6 C6 C6', 'roll rise']])],
  ['DROP 2', 'drop2', CF_D.concat([['Dm', 'D6 - F6 - A6 - - - F6 - D6 - A5 - - -'], ['C', 'G5 - C6 - E6 - - - G6 - - - - - - -', 'fill']])],
  ['FINALE', 'drop2', [['Bb C', 'D6 - F6 - Bb6 - - - A6 - G6 - E6 - - -'], ['Bb C', 'F6 - - - D6 - Bb5 - E6 - - - G6 - - -', 'roll rise']]],
  ['FINISH', 'end', [['F', 'F6 - - - - - - - - - - - . . . .']]]]);

/* CLATTER CRUNCH: A minor / C major, 138 bpm, a chip-tune riff, pumping bass, snares, clanks and clock ticks */
const CC_V = [
  ['Am', 'E5 - A5 - - - B5 - C6 - B5 - A5 - E5 -'], ['F', 'F5 - A5 - - - C6 - D6 - C6 - A5 - - -'],
  ['C', 'G5 - C6 - - - D6 - E6 - D6 - C6 - G5 -'], ['G', 'D6 - - - B5 - - - G5 - A5 - G5 - D5 -'],
  ['Am', 'E5 - A5 - - - B5 - C6 - B5 - A5 - C6 -'], ['F', 'F6 - - - C6 - - - A5 - C6 - F6 - - -'],
  ['C', 'E6 - - - D6 - C6 - G5 - - - C6 - D6 -'], ['G', 'B5 - - - G5 - D5 - D5 . E5 . F5 . G5 .', 'fill rise']];
const CC_H1 = ['F', 'A5 . A5 C6 - . A5 . F5 - - . G5 - A5 -'], CC_H2 = ['G', 'B5 . B5 D6 - . B5 . G5 - - . A5 - B5 -'];
const CC_D = [CC_H1, CC_H2, ['Em', 'G5 . G5 B5 - . G5 . E5 - - . D5 - E5 -'], ['Am', 'A5 - - - C6 - - - E6 - - - D6 - C6 -'],
  CC_H1, ['G', 'B5 . B5 D6 - . G6 . F6 - - . D6 - B5 -'], ['Am', 'C6 - - - E6 - - - A6 - - - G6 - E6 -'],
  ['G', 'D6 - - - B5 - - - G5 - - - . . . .', 'fill']];
const clatter = build({ id: 'clatter', name: 'CLATTER CRUNCH', bpm: 138, key: 0, inst: 'works', intro: 2, bars: 44, loopFrom: 2 }, [
  ['INTRO', 'intro', [['Am', ''], ['G', '. . . . . . . . . . . . C5 - D5 -', 'fill']]],
  ['VERSE 1', 'verse', CC_V],
  ['DROP 1', 'drop', CC_D],
  ['BREAK 1', 'break', [['F', 'A5 - - - - - - - C6 - - - - - - -'], ['G', 'B5 - - - - - - - D6 - - - - - - -'],
    ['Am', 'E6 - - - - - - - C6 - - - - - - -'], ['Am', 'A5 - - - - - - - A4 . B4 . C5 . D5 .', 'fill rise']]],
  ['VERSE 2', 'verse2', CC_V],
  ['DROP 2', 'drop2', CC_D],
  ['BUILD', 'build', [['F', 'C6 - - - A5 - - - F5 - - - A5 - - -'], ['G', 'D6 - - - B5 - - - G5 - - - B5 - - -'],
    ['Em', 'E6 - - - B5 - - - G5 - - - B5 - - -'], ['E', 'G#5 - - - B5 - - - B5 . B5 . B5 B5 B5 B5', 'roll rise']]],
  ['FINAL DROP', 'drop2', [CC_H1, CC_H2, ['Am F', 'C6 - - - E6 - - - F6 - - - A6 - - -'], ['G', 'G6 - - - F6 - - - D6 - - - B5 - D6 -', 'fill rise']]],
  ['FINISH', 'end', [['C', 'C6 - - - - - - - - - - - . . . .']]]]);

/* the title: C major at 110 bpm (the logo bounces at 110), a gentle whistle over plucks; 16 bars */
const title = build({ id: 'title', bpm: 110, key: 0, inst: 'meadow', loopFrom: 0 }, [
  ['A', 'title', [['C', 'G5 - - - E5 - G5 - C6 - - - - - B5 -'], ['Am', 'A5 - - - E5 - - - C5 - - - E5 - A5 -'],
    ['F', 'C6 - - - A5 - - - F5 - G5 - A5 - - -'], ['G', 'B5 - - - G5 - - - D5 - - - . . . .'],
    ['C', 'G5 - - - E5 - G5 - C6 - - - E6 - D6 -'], ['Am', 'C6 - - - A5 - - - E5 - - - A5 - B5 -'],
    ['Dm G', 'C6 - - - D6 - - - B5 - - - G5 - - -'], ['C', 'C6 - - - - - - - . . . . . . . .']]],
  ['B', 'title', [['F', 'A5 - - - C6 - - - F6 - - - E6 - D6 -'], ['G', 'D6 - - - B5 - - - G5 - - - A5 - B5 -'],
    ['Em', 'B5 - - - G5 - - - E5 - - - G5 - B5 -'], ['Am', 'C6 - - - - - - - A5 - - - . . . .'],
    ['F', 'A5 - - - C6 - - - F6 - - - A6 - G6 -'], ['G', 'G6 - - - D6 - - - B5 - - - D6 - - -'],
    ['F G', 'C6 - - - A5 - - - B5 - - - D6 - - -'], ['C', 'C6 - - - - - - - G5 . E5 . D5 . . .']]]]);

/* results: F major at 100 bpm, warm bells; win = a fanfare into it, done = a gentle "good try" into it */
const RES = [['F', 'A5 - - - C6 - - - F6 - - - E6 - C6 -'], ['Dm', 'D6 - - - A5 - - - F5 - - - A5 - - -'],
  ['Bb', 'Bb5 - - - D6 - - - F6 - - - D6 - Bb5 -'], ['C', 'C6 - - - G5 - - - E5 - - - . . . .'],
  ['F', 'A5 - - - C6 - - - F6 - - - G6 - A6 -'], ['Dm', 'F6 - - - D6 - - - A5 - - - D6 - - -'],
  ['Gm C', 'Bb5 - - - D6 - - - C6 - - - E6 - - -'], ['F', 'F6 - - - - - - - . . . . . . . .']];
const results = build({ id: 'results', bpm: 100, key: 5, inst: 'sky', loopFrom: 0 }, [['LOOP', 'results', RES]]);
const win = build({ id: 'win', bpm: 100, key: 5, inst: 'sky', loopFrom: 2 }, [
  ['FANFARE', 'fanfare', [['F', 'C6 . C6 . F6 . A6 - - - G6 . A6 - - -'], ['Bb C', 'D6 - - - F6 - - - E6 - - - C6 - - -']]],
  ['LOOP', 'results', RES]]);
const done = build({ id: 'done', bpm: 100, key: 5, inst: 'sky', loopFrom: 2 }, [
  ['GOOD TRY', 'soft', [['Dm', 'A5 - - - F5 - - - D5 - - - F5 - - -'], ['Bb C', 'Bb5 - - - A5 - - - G5 - - - - - - -']]],
  ['LOOP', 'results', RES]]);
const DEFS = { patchwork, candyfloss, clatter, title, results, win, done };

/* ---------- arrangement: what plays in each kind of section ----------
   drums [level, steps]: K kick, C clap/snap/snare, H closed hat, O open hat, S shaker, P the song's percussion (wood block,
   bubble pop, clank), T clock tick. bass / arp: [pattern, level]. pad, lead, harm (harmony a third below), duck (pads and
   arps dip on each kick), X (a soft cymbal on the section's first downbeat), R (a snare roll on 8ths, growing). */
const PAT = { q: [0, 4, 8, 12], off8: [2, 6, 10, 14], e8: [0, 2, 4, 6, 8, 10, 12, 14], s16: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], odd16: [1, 3, 5, 7, 9, 11, 13, 15] };
const KIND = {
  intro: { K: [.8, 'q'], S: [.45, 'off8'], P: [.3, [14]], bass: ['pulse', .8], lead: 1 },
  verse: { K: [.8, 'q'], C: [.55, [4, 12]], S: [.45, 'off8'], H: [.2, 'odd16'], P: [.3, [10]], bass: ['bounce', .85], arp: ['eighth', .7], lead: 1 },
  verse2: { K: [.85, 'q'], C: [.6, [4, 12]], S: [.45, 'off8'], H: [.26, 'odd16'], P: [.32, [6, 14]], bass: ['bounce', .9], arp: ['sixteen', .6], pad: .3, lead: 1 },
  drop: { K: [1, 'q'], C: [.9, [4, 12]], H: [.3, [1, 3, 5, 7, 9, 11, 13, 15, 0, 4, 8, 12]], O: [.42, 'off8'], P: [.3, [3, 11]], bass: ['octave', 1.1], arp: ['sixteen', 1], pad: .7, duck: .45, lead: 1, X: 1 },
  drop2: { K: [1, 'q'], C: [.9, [4, 12]], H: [.32, [1, 3, 5, 7, 9, 11, 13, 15, 0, 4, 8, 12]], O: [.45, 'off8'], P: [.32, [3, 7, 11]], bass: ['octave', 1.1], arp: ['sixteen', 1], pad: .75, duck: .45, lead: 1, harm: .42, X: 1 },
  break: { K: [.55, 'q'], S: [.35, 'off8'], T: [.25, 'e8'], bass: ['quarter', .7], arp: ['slow', .6], pad: 1, lead: .85 },
  build: { K: [.9, 'q'], R: [.2, .62], H: [.25, 'off8'], T: [.2, 'e8'], bass: ['eighths', .9], arp: ['eighth', .6], pad: .6, duck: .3, lead: 1 },
  end: { K: [1, [0]], C: [.7, [0]], X: 1.3, bass: ['long', 1], pad: 1.2, lead: 1, arp: ['sparkle', 1] },
  title: { K: [.55, [0, 8]], C: [.4, [4, 12]], S: [.35, 'off8'], P: [.25, [14]], bass: ['walk', .8], arp: ['soft', .6], pad: .45, lead: 1 },
  results: { K: [.5, [0, 8]], C: [.4, [4, 12]], H: [.25, 'off8'], P: [.22, [7]], bass: ['walk', .8], arp: ['soft', .6], pad: .55, lead: 1 },
  fanfare: { K: [.8, 'q'], C: [.6, [4, 12]], X: 1, bass: ['pulse', 1], pad: .9, lead: 1, arp: ['eighth', .7] },
  soft: { K: [.4, [0, 8]], S: [.3, 'off8'], bass: ['long', .7], pad: .8, lead: .9 }
};
for (const k in KIND) for (const s of ['K', 'C', 'H', 'O', 'S', 'P', 'T']) {
  const d = KIND[k][s]; if (!d) continue; const on = new Array(16).fill(false);
  for (const i of typeof d[1] === 'string' ? PAT[d[1]] : d[1]) on[i] = true; KIND[k][s] = { v: d[0], on };
}
/* bass: step → [interval ('t' = the chord's third), length in steps]; 'long' holds each chord */
const BASS = {
  pulse: { 0: [0, 6], 8: [0, 6] },
  quarter: { 0: [0, 3], 4: [0, 3], 8: [0, 3], 12: [0, 3] },
  bounce: { 0: [0, 3], 3: [0, 1], 4: [7, 2], 6: [12, 2], 8: [0, 3], 11: [0, 1], 12: [7, 2], 14: [12, 2] },
  octave: { 0: [0, 2], 2: [12, 2], 4: [0, 2], 6: [12, 2], 8: [0, 2], 10: [12, 2], 12: [0, 2], 14: [12, 2] },
  eighths: { 0: [0, 2], 2: [0, 2], 4: [0, 2], 6: [0, 2], 8: [0, 2], 10: [0, 2], 12: [0, 2], 14: [0, 2] },
  walk: { 0: [0, 4], 4: [7, 2], 6: [12, 2], 8: [0, 4], 12: [7, 2], 14: ['t', 2] },
  long: 'seg'
};
/* arps: every n steps, chord tones [root, third, fifth, octave, tenth, twelfth] in this order */
const ARP = {
  eighth: { n: 2, seq: [0, 2, 1, 3, 2, 1, 3, 2] },
  sixteen: { n: 1, seq: [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 1, 3, 2, 4, 3, 1] },
  slow: { n: 4, seq: [0, 2, 1, 3] },
  soft: { n: 2, seq: [0, 2, 1, 2, 3, 2, 1, 2] },
  sparkle: { n: 1, seq: [0, 1, 2, 3, 5], only: 5 }
};
/* instruments for each song family; drum slot → kit sound */
const INST = {
  meadow: { lead: 'whistle', arp: 'pluck', bass: 'tri', pad: 'reed', lp: 3800, blp: 1400, echo: 3, C: 'clap', P: 'wood', arpOct: 60, lv: [.145, .062, .2] },
  sky: { lead: 'bell', arp: 'glass', bass: 'sub', pad: 'air', lp: 5600, blp: 1200, echo: 3, C: 'snap', P: 'pop', arpOct: 72, lv: [.19, .056, .165] },
  works: { lead: 'chip', arp: 'blip', bass: 'pump', pad: 'organ', lp: 4200, blp: 750, echo: 2, C: 'snare', P: 'clank', arpOct: 72, lv: [.14, .045, .16] }
};
const DRUM = { kick: .32, clap: .2, snap: .17, snare: .19, hat: .06, ohat: .05, shk: .085, wood: .12, pop: .12, clank: .085, tick: .07, crash: .1 };
const SLOT = { K: 'kick', H: 'hat', O: 'ohat', S: 'shk', T: 'tick' };

/* ---------- sound effects: [voice length s, keep (never dropped first), fn(H, t, out, arg)]; cute and soft ----------
   H.k(note) is that note moved into the key of the playing song (within -5..+6 semitones). */
const SFX = {
  jump: [.12, 0, (H, t, o) => { H.tone('triangle', 520, 880, t, .07, .09, o, .002); H.tone('sine', 1040, 1500, t + .01, .05, .03, o); }],
  land: [.05, 0, (H, t, o) => { H.hit('tick', t, .55, o); H.noise(t, .025, .025, 'bandpass', 1400, 0, 1.4, o); }],
  pad: [.45, 1, (H, t, o) => { const s = H.tone('triangle', 260, 760, t, .32, .15, o, .004); H.wob(s, t, .32, 18, 40); H.tone('sine', 520, 1200, t + .03, .2, .04, o); }],
  ring: [.6, 1, (H, t, o, a) => {
    const f = H.k(a ? 'A6' : 'E6');
    H.tone('sine', f, 0, t, .45, .09, o, .002); H.tone('sine', f * 1.5, 0, t + .005, .3, .04, o, .002); H.tone('triangle', f * 2, 0, t, .08, .025, o);
    H.noise(t, .12, .016, 'highpass', 7000, 0, .7, o);
  }],
  /* through a flower arch: a soft rising whoosh and a bloom of three bell notes */
  portal: [.7, 1, (H, t, o) => {
    H.noise(t, .34, .09, 'bandpass', 450, 3600, 1.3, o, .09);
    H.tone('triangle', H.k('C5'), H.k('G5'), t, .28, .09, o, .03);
    ['C6', 'G6', 'C7'].forEach((n, i) => { H.tone('sine', H.k(n), 0, t + .07 + i * .05, .22, .07, o, .003); });
  }],
  /* a seed pod flips: a quick "fwip" up and a little twirl down */
  flip: [.25, 0, (H, t, o) => { H.tone('sine', 480, 1250, t, .08, .09, o, .002); H.tone('triangle', 1250, 800, t + .07, .07, .045, o, .002); }],
  /* a crash, kindly: a springy "boing!" and a puff of leaves (a dry rustle) */
  crash: [.8, 1, (H, t, o) => {
    const s = H.tone('triangle', 720, 190, t, .42, .22, o, .004); H.wob(s, t, .42, 14, 60);
    H.tone('sine', 360, 140, t + .02, .3, .08, o);
    H.noise(t + .02, .32, .07, 'bandpass', 3200, 1600, 1.1, o); H.noise(t + .08, .25, .035, 'highpass', 5000, 0, .7, o);
  }],
  spawn: [.25, 0, (H, t, o) => { H.tone('sine', H.k('C6'), H.k('G6'), t, .12, .07, o, .004); H.tone('triangle', H.k('G5'), 0, t + .05, .1, .05, o); }],
  cp: [.6, 1, (H, t, o) => { H.tone('sine', H.k('E6'), 0, t, .25, .07, o); H.tone('sine', H.k('B6'), 0, t + .1, .35, .06, o); H.tone('triangle', H.k('E5'), 0, t, .12, .05, o); }],
  seed: [.6, 1, (H, t, o) => { ['E6', 'G6', 'B6', 'E7'].forEach((n, i) => H.tone('sine', H.k(n), 0, t + i * .04, .14, .06, o)); H.noise(t + .1, .3, .02, 'highpass', 7000, 10000, .7, o); }],
  win: [1.3, 1, (H, t, o) => {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => { H.tone('triangle', H.k(n), 0, t + i * .08, .1, .2, o); H.tone('sine', H.k(n) * 2, 0, t + i * .08, .06, .04, o); });
    for (const n of ['E6', 'G6', 'C7']) H.tone('sine', H.k(n), 0, t + .36, .6, .07, o, .01);
    for (let i = 0; i < 5; i++) H.tone('sine', 2400 + ((i * 1777) % 1900), 0, t + .4 + i * .07, .05, .03, o);
  }],
  best: [1, 1, (H, t, o) => {
    ['G5', 'C6', 'E6', 'G6', 'C7'].forEach((n, i) => { H.tone('triangle', H.k(n), 0, t + i * .06, .09, .14, o); H.tone(H.p12, H.k(n), 0, t + .05 + i * .06, .05, .03, o); });
    H.noise(t + .3, .4, .025, 'highpass', 6000, 10000, .7, o);
  }],
  count: [.2, 1, (H, t, o) => { H.tone('triangle', NH('A5'), 0, t, .12, .26, o); H.tone('sine', NH('A6'), 0, t, .06, .06, o); }],
  go: [.45, 1, (H, t, o) => { ['C5', 'G5', 'C6', 'E6'].forEach((n, i) => H.tone('triangle', NH(n), 0, t + i * .05, .1, .16, o)); H.tone('sine', NH('G6'), 0, t + .2, .22, .06, o); }],
  select: [.06, 0, (H, t, o) => { H.tone('triangle', 900, 1300, t, .04, .12, o); }],
  lose: [.9, 1, (H, t, o) => { [['E5', 0], ['D5', .14], ['C5', .28]].forEach(([n, d]) => H.tone('triangle', H.k(n), 0, t + d, .16, .14, o)); H.tone('sine', H.k('G5'), 0, t + .42, .35, .06, o); }]
};
const RATE = { jump: [3, .05], land: [2, .06], select: [2, .05], count: [1, .3], flip: [2, .05], portal: [2, .1], pad: [2, .06], ring: [2, .06] }, RATE_DEF = [2, .04], MAXV = 18;

/* ---------- the drum kit, rendered once into small buffers (normalised to a peak of 1) ---------- */
function kit(ac) {
  const sr = ac.sampleRate; let sd = 0x2545F491;
  const rnd = () => { sd ^= sd << 13; sd ^= sd >>> 17; sd ^= sd << 5; return (sd >>> 0) / 2147483648 - 1; };
  const bq = (type, f, q) => {   /* an RBJ biquad (lp / hp / bp) as a function of one sample */
    const w = 2 * Math.PI * Math.min(f, sr * .45) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2; if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = -2 * cs / a0, A2 = (1 - al) / a0; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return x => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  };
  const mk = (dur, fn) => {
    const n = Math.max(64, Math.round(dur * sr)), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0); let pk = 0;
    for (let i = 0; i < n; i++) { const v = fn(i / sr); d[i] = v; const a = v < 0 ? -v : v; if (a > pk) pk = a; }
    const fade = Math.min(n >> 2, Math.round(sr * .004));
    for (let i = 0; i < n; i++) d[i] = (pk > 0 ? d[i] / pk : 0) * (i >= n - fade ? (n - 1 - i) / fade : 1);
    return b;
  };
  const env = (t, a, tau) => t < a ? t / a : Math.exp(-(t - a) / tau);
  const K = {};
  { let ph = 0; K.kick = mk(.42, t => { const f = 48 + 115 * Math.exp(-t / .03) + 25 * Math.exp(-t / .12); ph += 2 * Math.PI * f / sr; return Math.sin(ph) * env(t, .0015, .17) + rnd() * .22 * Math.exp(-t / .0016); }); }
  { const f = bq('bp', 1300, 1.1); K.clap = mk(.3, t => { const x = f(rnd()); let e = 0; for (const o of [0, .011, .022]) if (t >= o) e = Math.max(e, Math.exp(-(t - o) / .0045)); if (t >= .024) e = Math.max(e, .55 * Math.exp(-(t - .024) / .075)); return x * e; }); }
  { const f = bq('bp', 1900, .8); let ph = 0; K.snare = mk(.3, t => { ph += 2 * Math.PI * (178 + 40 * Math.exp(-t / .02)) / sr; return f(rnd()) * 1.4 * env(t, .001, .075) + Math.sin(ph) * .6 * env(t, .001, .045); }); }
  { const f = bq('bp', 2400, 1.6), g = bq('bp', 950, 2); K.snap = mk(.13, t => f(rnd()) * env(t, .0008, .017) + g(rnd()) * .5 * env(t, .0005, .008)); }
  { const f = bq('hp', 7600, .7); K.hat = mk(.07, t => f(rnd()) * env(t, .0005, .011)); }
  { const f = bq('hp', 6800, .7); K.ohat = mk(.32, t => f(rnd()) * env(t, .001, .08)); }
  { const f = bq('bp', 5600, 1.8); K.shk = mk(.1, t => f(rnd()) * env(t, .008, .03)); }
  K.wood = mk(.12, t => Math.sin(2 * Math.PI * 1150 * t) * env(t, .0007, .03) + .45 * Math.sin(2 * Math.PI * 1860 * t) * env(t, .0005, .013));
  { let ph = 0; K.pop = mk(.14, t => { ph += 2 * Math.PI * (560 + 620 * (1 - Math.exp(-t / .018))) / sr; return Math.sin(ph) * env(t, .002, .035); }); }
  { const f = bq('bp', 2300, .7); K.clank = mk(.26, t => { let s = 0; for (const p of [523, 787, 1179, 1663]) s += Math.sin(2 * Math.PI * p * t) > 0 ? .25 : -.25; return f(s) * env(t, .0008, .06) + rnd() * .3 * Math.exp(-t / .002); }); }
  { const f = bq('bp', 3800, 5); K.tick = mk(.03, t => f(rnd()) * env(t, .0003, .004)); }
  { const f = bq('hp', 4500, .7), g = bq('bp', 9000, 1); K.crash = mk(1.6, t => f(rnd()) * env(t, .004, .45) + g(rnd()) * .5 * env(t, .002, .25)); }
  return K;
}

/* ---------- one audio graph + synth + sequencer in a given context ---------- */
function create(ac) {
  const I = { ac, rl: {}, vox: [], seq: null, muted: false, musOn: true, cues: null, base: { master: .8, sfx: 1.3, mus: .42 } };
  const gain = v => { const g = ac.createGain(); g.gain.value = v; return g; };
  const dyn = (th, kn, ra, at, re) => { const c = ac.createDynamicsCompressor(); c.threshold.value = th; c.knee.value = kn; c.ratio.value = ra; c.attack.value = at; c.release.value = re; return c; };
  const comp = dyn(-14, 6, 4, .003, .15), lim = dyn(-4, 0, 20, .001, .08), trim = gain(.8);
  I.master = gain(I.base.master); I.sfx = gain(I.base.sfx); I.mus = gain(I.base.mus);
  I.sfx.connect(I.master); I.mus.connect(I.master); I.master.connect(comp); comp.connect(lim); lim.connect(trim); trim.connect(ac.destination);
  const wave = (re, im) => ac.createPeriodicWave(Float32Array.from(re), Float32Array.from(im));
  const pulse = d => { const n = 32, re = new Array(n).fill(0), im = new Array(n).fill(0); for (let k = 1; k < n; k++) re[k] = 2 / (k * Math.PI) * Math.sin(k * Math.PI * d); return wave(re, im); };
  const BELL = wave([0, 0, 0, 0, 0, 0], [0, 1, .42, .16, .1, .04]);
  const nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate), nd = nb.getChannelData(0);
  let seed = 12345; for (let i = 0; i < nd.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; nd[i] = seed / 0x3fffffff - 1; }
  const KIT = I.kit = kit(ac);

  /* synth helpers (H): envelopes start at 0 so a source that starts a frame early is silent, not a click */
  const H = { ac, p12: pulse(.125), p25: pulse(.25), kt: 1 };
  H.env = (g, t, pk, dur, att) => { g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + att); g.gain.exponentialRampToValueAtTime(.0001, t + att + dur); };
  H.osc = w => { const o = ac.createOscillator(); if (typeof w === 'string') o.type = w; else o.setPeriodicWave(w); return o; };
  H.tone = (w, f0, f1, t, dur, pk, out, att = .003) => {
    const o = H.osc(w), g = gain(0);
    o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    H.env(g, t, pk, dur, att); o.connect(g); g.connect(out); o.start(t); o.stop(t + att + dur + .02); return o;
  };
  H.wob = (o, t, dur, rate, depth) => { const l = ac.createOscillator(), lg = gain(depth); l.frequency.value = rate; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur); };
  H.noise = (t, dur, pk, type, f0, f1, q, out, att = .002) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = gain(0);
    s.buffer = nb; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + att + dur);
    H.env(g, t, pk, dur, att); s.connect(f); f.connect(g); g.connect(out); s.start(t, (t * 7.31) % .5); s.stop(t + att + dur + .03);
  };
  H.hit = (name, t, v, out) => { const b = KIT[name]; if (!b || !(v > 0)) return; const s = ac.createBufferSource(), g = gain(v * (DRUM[name] || .1)); s.buffer = b; s.connect(g); g.connect(out); s.start(t); };
  H.k = n => NH(n) * H.kt;

  /* ----- sound effects: rate limits and a voice cap (the oldest non-'keep' voice goes first) ----- */
  function rateOk(name, t) { const r = RATE[name] || RATE_DEF, a = I.rl[name] || (I.rl[name] = []); while (a.length && a[0] <= t - r[1]) a.shift(); if (a.length >= r[0]) return false; a.push(t); return true; }
  function voice(t, len, keep) {
    const v = I.vox; for (let i = v.length - 1; i >= 0; i--) if (v[i].end <= t) v.splice(i, 1);
    if (v.length >= MAXV) { let k = v.findIndex(x => !x.keep); if (k < 0) k = 0; const d = v.splice(k, 1)[0]; d.g.gain.setTargetAtTime(0, t, .006); }
    const g = gain(1); g.connect(I.sfx); v.push({ g, end: t + len, keep }); return g;
  }
  I.play = (name, arg, t) => {
    if (!has(SFX, name) || !rateOk(name, t)) return false;
    const key = I.seq ? I.seq.d.key : 0, off = ((key + 5) % 12 + 12) % 12 - 5; H.kt = Math.pow(2, off / 12);
    SFX[name][2](H, t, voice(t, SFX[name][0], SFX[name][1]), arg); return true;
  };
  I.setMute = (on, t) => { I.muted = !!on; const g = I.master.gain; g.cancelScheduledValues(t); g.setTargetAtTime(on ? 0 : I.base.master, t, .03); if (!on && I.seq) I.seq.s0 = I.seq.step; };
  /* music only: the bus reaches 0 by t+0.1; the sequencer makes no notes meanwhile but keeps counting */
  I.setMusicOn = (on, t) => {
    I.musOn = !!on; const g = I.mus.gain; g.cancelScheduledValues(t);
    if (on) { g.setTargetAtTime(I.base.mus, t, .03); if (I.seq) I.seq.s0 = I.seq.step; } else { g.setTargetAtTime(0, t, .018); g.setValueAtTime(0, t + .1); }
  };

  /* ----- song voices ----- */
  function vLead(type, m, t, dur, pk, out) {
    const f = hz(m), g = gain(0), end = t + dur; g.connect(out);
    if (type === 'bell') {
      const o = H.osc(BELL), o2 = H.osc('sine'), g2 = gain(0);
      o.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f * 4, t);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + .003); g.gain.setTargetAtTime(pk * .3, t + .003, .1); g.gain.setTargetAtTime(0, end, .05);
      g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(pk * .2, t + .002); g2.gain.setTargetAtTime(0, t + .002, .025);
      o.connect(g); o2.connect(g2); g2.connect(out); o.start(t); o2.start(t); o.stop(end + .3); o2.stop(t + .2);
      return;
    }
    const chip = type === 'chip', o = H.osc(chip ? H.p25 : 'triangle'), att = chip ? .004 : .014;
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + att); g.gain.setTargetAtTime(pk * (chip ? .6 : .72), t + att, chip ? .08 : .12);
    g.gain.setTargetAtTime(0, t + Math.max(att + .01, dur * .92), chip ? .02 : .035);
    o.connect(g); o.start(t); o.stop(end + .25);
    if (!chip) { const o2 = H.osc('sine'), g2 = gain(.22); o2.frequency.setValueAtTime(f * 2, t); o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(end + .25); }
    if (dur > .42) H.wob(o, t + .16, dur - .1, 5.2, f * .008);
  }
  function vArp(type, m, t, pk, out) {
    const f = hz(m), g = gain(0);
    const [w, ff, tau, end] = type === 'glass' ? ['sine', f * 2, .05, .3] : type === 'blip' ? [H.p12, f, .028, .16] : type === 'soft' ? ['triangle', f, .12, .6] : type === 'slow' ? ['triangle', f, .3, 1.3] : [H.p25, f, .06, .36];
    const o = H.osc(w); o.frequency.setValueAtTime(ff, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + (type === 'slow' ? .01 : .002)); g.gain.setTargetAtTime(0, t + .01, tau);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + end);
  }
  function vBass(type, m, t, dur, pk, out) {
    const f = hz(m), g = gain(0), o = H.osc(type === 'pump' ? H.p25 : type === 'sub' ? 'sine' : 'triangle');
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + .006); g.gain.setTargetAtTime(pk * .8, t + .006, .15);
    g.gain.setTargetAtTime(0, t + Math.max(.02, dur * .86), .03);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .2);
    if (type === 'sub') { const o2 = H.osc('triangle'), g2 = gain(.3); o2.frequency.setValueAtTime(f * 2, t); o2.connect(g2); g2.connect(g); o2.start(t); o2.stop(t + dur + .2); }
  }
  function vPad(type, notes, t, dur, pk, out) {
    const g = gain(0), a = Math.min(.12, dur * .3), w = type === 'organ' ? H.p25 : type === 'air' ? 'sine' : 'triangle';
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + a); g.gain.setValueAtTime(pk, t + Math.max(a, dur * .8)); g.gain.linearRampToValueAtTime(0, t + dur + .18);
    g.connect(out);
    for (const m of notes) for (const dt of [-6, 6]) { const o = H.osc(w); o.frequency.setValueAtTime(hz(m), t); o.detune.setValueAtTime(dt, t); o.connect(g); o.start(t); o.stop(t + dur + .25); }
  }
  function riser(t, dur, pk, out) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = gain(0);
    s.buffer = nb; s.loop = true; f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(5200, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(pk, t + dur * .96); g.gain.linearRampToValueAtTime(0, t + dur + .03);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, (t * 3.7) % .5); s.stop(t + dur + .06);
  }
  const held = (L, i) => { for (let j = i - 1; j >= 0; j--) { const x = L[j]; if (x) return j + x[1] > i ? [x[0], j + x[1] - i] : null; } return null; };
  const barOf = (d, s) => { const b = s >> 4; if (b < d.nb) return b; if (d.loopFrom < 0) return d.nb - 1; const lf = d.loopFrom; return lf + (b - lf) % (d.nb - lf); };
  I.barOf = barOf;

  /* (re)start a song so that it is at beat `beat` as heard at context time `heard` (the moment of the call): t0 = its beat 0.
     Steps already due by the time anything new can sound (the output latency) play at once if no more than 50 ms late, else
     are skipped; the first step played catches up held notes, pads and bass that began before it. */
  I.music = (name, beat, heard) => {
    const ct = ac.currentTime;
    if (I.seq) { const o = I.seq.n; o.out.gain.setTargetAtTime(0, ct, .012); I.seq = null; setTimeout(() => { for (const k in o) try { o[k].disconnect(); } catch (e) {} }, 900); }
    const d = has(DEFS, name) ? DEFS[name] : null; if (!d) return false;
    const ins = INST[d.inst], sd = d.spb / 4;
    const n = { out: gain(1), lp: ac.createBiquadFilter(), lead: gain(1), dl: ac.createDelay(1), fb: gain(.26), wet: gain(.16), duck: gain(1), padlp: ac.createBiquadFilter(), bass: ac.createBiquadFilter(), drm: gain(1) };
    n.lp.type = 'lowpass'; n.lp.frequency.value = ins.lp; n.lp.Q.value = .5;
    n.padlp.type = 'lowpass'; n.padlp.frequency.value = 2200; n.padlp.Q.value = .4;
    n.bass.type = 'lowpass'; n.bass.frequency.value = ins.blp; n.bass.Q.value = .6;
    n.dl.delayTime.value = sd * ins.echo;
    n.out.connect(I.mus); n.lp.connect(n.out); n.lead.connect(n.lp); n.lead.connect(n.dl); n.dl.connect(n.fb); n.fb.connect(n.dl); n.dl.connect(n.wet); n.wet.connect(n.lp);
    n.duck.connect(n.padlp); n.padlp.connect(n.out); n.bass.connect(n.out); n.drm.connect(n.out);
    const b = Math.max(0, +beat || 0), t0 = heard - b * d.spb, early = ct + .006; let s0 = Math.ceil(b * 4 - 1e-6);
    while (t0 + s0 * sd < early - .05) s0++;
    I.seq = { name, d, ins, n, sd, s0, step: s0, t0, early, lastT: null };
    return true;
  };
  I.schedule = (now, until) => {
    const q = I.seq; if (!q) return false;
    let tn = q.t0 + q.step * q.sd;
    if (tn < now - .05) { q.step += Math.ceil((now - .05 - tn) / q.sd); tn = q.t0 + q.step * q.sd; }   /* back from a stall: skip what is late, keep t0 */
    while (I.seq === q && tn < until) {
      const at = tn < q.early ? q.early : tn;
      if (!I.muted && I.musOn) { try { step(q, q.step, at); } catch (e) {} if (I.cues && I.cues.has(q.step)) H.hit('wood', at, .85, q.n.drm); }
      q.step++; tn = q.t0 + q.step * q.sd;
      if (q.d.loopFrom < 0 && q.step >= q.d.nb * 16) { const o = q.n; setTimeout(() => { for (const k in o) try { o[k].disconnect(); } catch (e) {} }, 2500); I.seq = null; }
    }
    return !!I.seq;
  };
  function step(q, s, t) {
    const d = q.d, ins = q.ins, bi = barOf(d, s), i = s & 15, row = d.B[bi], K = KIND[row.k], n = q.n, sd = q.sd;
    const two = row.c.length > 1, ch = row.c[two && i >= 8 ? 1 : 0], r = ch[0], th = ch[1], first = s === q.s0, f = row.f;
    const segEnd = two && i < 8 ? 8 : 16, segStart = i === 0 || (two && i === 8);
    /* lead (and its harmony) */
    if (K.lead) {
      let L = row.L[i]; if (!L && first) L = held(row.L, i);
      if (L) { const dur = L[1] * sd, pk = ins.lv[0] * K.lead; vLead(ins.lead, L[0], t, dur, pk, n.lead); if (K.harm) vLead(ins.lead, third(L[0], d.key), t, dur, pk * K.harm, n.lp); }
    }
    /* pads: one chord per half or whole bar */
    if (K.pad && (segStart || first)) { const p = 52 + ((r + 8) % 12), notes = [p, p + th, p + 7]; if (row.k === 'end') notes.push(p + 12); vPad(ins.pad, notes, t, (segEnd - i) * sd, .03 * K.pad, n.duck); }
    /* bass */
    if (K.bass) {
      const B = BASS[K.bass[0]], root = 40 + ((r + 8) % 12);
      if (B === 'seg') { if (segStart || first) vBass(ins.bass, root, t, (segEnd - i) * sd, ins.lv[2] * K.bass[1], n.bass); }
      else { const x = B[i]; if (x) vBass(ins.bass, root + (x[0] === 't' ? th : x[0]), t, Math.min(x[1], segEnd - i) * sd, ins.lv[2] * K.bass[1] * (K.bass[0] === 'eighths' ? .55 + .45 * i / 15 : 1), n.bass); }
    }
    /* arps: chord tones */
    if (K.arp) {
      const A = ARP[K.arp[0]];
      if (i % A.n === 0 && (!A.only || i < A.only)) {
        const T = [0, th, 7, 12, 12 + th, 19], base = ins.arpOct + r, m = base + T[A.seq[(i / A.n) % A.seq.length]];
        const type = K.arp[0] === 'soft' || K.arp[0] === 'slow' ? K.arp[0] : ins.arp;
        vArp(type, m, t, ins.lv[1] * K.arp[1] * (K.arp[0] === 'sparkle' ? 2.2 : 1), K.arp[0] === 'sparkle' || K.arp[0] === 'slow' ? n.lp : n.duck);
      }
    }
    /* drums */
    if (K.X && row.first && i === 0) H.hit('crash', t, K.X, n.drm);
    for (const sl of ['K', 'H', 'O', 'S', 'T']) { const x = K[sl]; if (x && x.on[i] && (sl !== 'T' || d.inst === 'works')) H.hit(SLOT[sl], t, x.v, n.drm); }   /* clock ticks: the works only */
    if (K.C && K.C.on[i]) H.hit(ins.C, t, K.C.v, n.drm);
    if (K.P && K.P.on[i]) H.hit(ins.P, t, K.P.v, n.drm);
    if (K.R && !(i & 1)) H.hit(ins.C, t, K.R[0] + (K.R[1] - K.R[0]) * i / 14, n.drm);
    if (f.fill && i >= 12) H.hit(ins.C, t, .32 + (i - 12) * .13, n.drm);
    if (f.roll && i >= 8) H.hit(ins.C, t, .25 + (i - 8) * .07, n.drm);
    if (f.rise && i === 0) riser(t, 16 * sd, .045, n.drm);
    if (K.duck && K.K && K.K.on[i]) { const g = n.duck.gain; g.setValueAtTime(1 - K.duck, t); g.setTargetAtTime(1, t + .015, .07); }
  }
  return I;
}

/* ---------- live wrapper ---------- */
let I = null, muted = false, musOn = true, hid = false, hidAt = 0, want = null, timer = 0, cueList = null;
const wall = () => { try { return W.performance.now(); } catch (e) { return Date.now(); } };
if (!SILENT) { try { const ls = W.localStorage; muted = ls.getItem('beat-mute') === '1'; musOn = ls.getItem('beat-music') !== '0'; } catch (e) {} }
const store = (k, v) => { if (!SILENT) try { W.localStorage.setItem(k, v); } catch (e) {} };
const quiet = p => { if (p && typeof p.catch === 'function') p.catch(() => {}); };
const nowA = () => I.ac.currentTime;
function pump() { timer = 0; if (!I || hid) return; try { const t = nowA(); if (I.schedule(t, t + .15)) run(); } catch (e) {} }
function run() { if (!timer && I && !hid && I.seq) timer = setTimeout(pump, 25); }
function now() { if (timer) { try { clearTimeout(timer); } catch (e) {} timer = 0; } pump(); }   /* schedule right away (a new song's first notes) */
/* the audio clock as heard right now, in context seconds (never later than currentTime: nothing is heard before it is made) */
function heard() {
  const ac = I.ac, ct = ac.currentTime;
  try {
    if (ac.getOutputTimestamp && ac.state === 'running') {
      const ts = ac.getOutputTimestamp(), pn = W.performance && W.performance.now ? W.performance.now() : 0;
      if (ts && ts.contextTime > 0 && ts.performanceTime > 0 && pn > 0) return Math.min(ct, ts.contextTime + Math.max(-.5, Math.min(.2, (pn - ts.performanceTime) / 1000)));
    }
  } catch (e) {}
  /* no output timestamp: currentTime less the latencies the browser reports; one that reports no output latency at all (some
     Safari builds) is assumed to have a typical speaker's 40 ms rather than none (a Bluetooth set can be far more: unknowable here) */
  const ol = ac.outputLatency;
  return ct - (typeof ol === 'number' && isFinite(ol) ? ol : .04) - (+ac.baseLatency || 0);
}
function setCues() { if (I) I.cues = cueList && cueList.length ? new Set(cueList.filter(b => isFinite(b)).map(b => Math.round(b * 4))) : null; }
const SONGS = {};
for (const k in DEFS) { const d = DEFS[k]; SONGS[k] = { bpm: d.bpm, key: d.key, intro: d.intro || 0, bars: d.bars != null ? d.bars : d.nb, beats: d.bars != null ? 4 * (d.intro + d.bars) : 4 * d.nb, loopFrom: d.loopFrom, sections: d.sections.map(x => x.slice()) }; SONGS[k].len = SONGS[k].beats * 60 / d.bpm; }
const A = BEAT.Audio = {
  ready: false, silent: SILENT,
  SFX_NAMES: Object.keys(SFX), MUSIC_NAMES: Object.keys(DEFS), TRACKS: ['patchwork', 'candyfloss', 'clatter'], SONGS,
  unlock() {
    if (SILENT) return;
    try {
      if (!I) {
        const AC = W.AudioContext || W.webkitAudioContext; if (!AC) return;
        let ac; try { ac = new AC({ latencyHint: 'interactive' }); } catch (e) { ac = new AC(); }
        I = create(ac); A.ready = true; I.setMute(muted, 0); I.setMusicOn(musOn, 0); setCues();
        const b = I.ac.createBuffer(1, 1, 22050), s = I.ac.createBufferSource(); s.buffer = b; s.connect(I.ac.destination); s.start(0);   /* iOS wake */
        if (want) I.music(want[0], want[1], heard());
      }
      if (!hid && I.ac.state !== 'running' && I.ac.resume) quiet(I.ac.resume());
      now();
    } catch (e) {}
  },
  play(name, arg) { if (SILENT || !I || muted || hid) return; try { I.play(name, arg, nowA() + .002); } catch (e) {} },
  music(name, atBeat) {
    if (SILENT) return;
    const ok = has(DEFS, name), b = Math.max(0, +atBeat || 0); want = ok ? [name, b] : null;
    if (!I) return;
    if (hid) hidAt = wall();   /* started while hidden: it is right as of now; when shown it moves on from here */
    try { I.music(ok ? name : null, b, heard()); now(); } catch (e) {}
  },
  cues(beats) { if (SILENT) return; cueList = Array.isArray(beats) ? beats.slice() : null; setCues(); },
  time() {
    if (SILENT || !I || !I.seq || hid || I.ac.state !== 'running') return null;
    try { const q = I.seq; let t = heard() - q.t0; if (!isFinite(t)) return null; if (q.lastT != null && t < q.lastT) t = q.lastT; q.lastT = t; return t; } catch (e) { return null; }
  },
  beat() { const t = A.time(); return t == null ? null : t / I.seq.d.spb; },
  song() { return I && I.seq ? I.seq.name : null; },
  latency() { if (!I) return null; try { return Math.max(0, I.ac.currentTime - heard()); } catch (e) { return null; } },
  mute(on) {
    if (on === undefined) return muted; if (SILENT) return;
    muted = !!on; store('beat-mute', muted ? '1' : '0'); if (I) try { I.setMute(muted, nowA()); } catch (e) {}
  },
  musicOn(on) {
    if (on === undefined) return musOn; if (SILENT) return;
    musOn = !!on; store('beat-music', musOn ? '1' : '0'); if (I) try { I.setMusicOn(musOn, nowA()); run(); } catch (e) {}
  },
  /* hidden: suspend. Shown again: the song moves on by the time it was hidden (it keeps to the wall clock, like an online race
     that ran on meanwhile), restarting there with its held notes; a paused game has stopped its song anyway */
  hidden(on) {
    if (SILENT) return; const was = hid; hid = !!on; if (!I) return;
    try {
      if (hid) { if (!was) hidAt = wall(); if (I.ac.suspend) quiet(I.ac.suspend()); }
      else {
        if (I.ac.resume) quiet(I.ac.resume());
        const q = I.seq, dt = was && hidAt ? (wall() - hidAt) / 1000 : 0; hidAt = 0;
        if (q && dt > .02) { const h = heard(); I.music(q.name, Math.max(0, (h - q.t0 + dt) / q.d.spb), h); }
        now();
      }
    } catch (e) {}
  },
  isMuted() { return muted; }, isMusicOn() { return musOn; },
  state() { return I ? I.ac.state : 'none'; },
  /* tests: the song data and the graph builder, for any (mock or offline) context */
  _defs: DEFS, _create: create, _kit: kit, _live: () => I
};
})();
