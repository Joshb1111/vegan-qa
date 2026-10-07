/* FAR FIELD — ff-audio.js: FF.Audio, the sound engine. Synthesised Web Audio (nothing to download; an optional sample slot
   public/farfield/audio/<cue>.ogg may replace a cue later): beds per place (rain on grass, the drain, the hall, the yard's
   floodlight hum, the rest), positional cues from the bus ('sound' events: footsteps by surface and distance, panned; the
   engine, door, chain, lock, torch click, fence, aim click; the shot as one muffled report UNDER the black, the scuff),
   the NOTICE drone, the rabbit's own small sounds, the warm pad at the groom and the end chord. Restrained: no stings, no
   rabbit distress sounds, no words, no other animals. Every danger sound has a visual twin (the arcade starts muted).
   main.js owns the settings and the parent protocol (keys ff-mute / ff-music, M and N, {ty:'mute'|'music'}); this module is
   the engine. With ?mute=1 (FF.SILENT) nothing here ever creates an AudioContext. Nothing is made before unlock().
   OWNER: the audio + UI + room builder. API contract: docs/farfield/INTERFACES.md §8.8. SKELETON: the API, silent. */
'use strict';
window.FF = window.FF || {};
(function () {
const st = { unlocked: false, muted: false, music: true, hidden: false, ctx: null, heard: {} };
const Audio = FF.Audio = {
  stub: true,
  init(c) {
    /* listen to the cues (the builder plays them; the skeleton only counts them for tests) */
    FF.bus.on('sound', d => { st.heard[d.cue] = (st.heard[d.cue] || 0) + 1; });
    for (const n of ['fail', 'ai:state', 'place', 'mode', 'transit', 'rabbit:land', 'entry', 'checkpoint']) FF.bus.on(n, () => { st.heard[n] = (st.heard[n] || 0) + 1; });
  },
  /* from a user gesture (the notice's Continue / the title start). Creates or resumes the context unless SILENT or muted. */
  unlock() { if (FF.SILENT) return; st.unlocked = true; /* SKELETON: no context yet */ },
  mute(on) { st.muted = !!on; },
  music(on) { st.music = !!on; },
  hidden(on) { st.hidden = !!on; },
  reset(cp) {},
  frame(dt) {},
  dispose() { if (st.ctx) try { st.ctx.close(); } catch (_) {} st.ctx = null; },
  get muted() { return st.muted; },
  debug() { return { stub: true, silent: FF.SILENT, unlocked: st.unlocked, muted: st.muted, music: st.music, context: !!st.ctx, heard: Object.assign({}, st.heard) }; },
};
})();
