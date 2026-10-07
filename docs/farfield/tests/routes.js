/* Integrator routes (in-page). Each route is a list of legs for BOT (bot.js). `plaus` adds the pauses a first-time player
   plausibly makes (looking at the title, the boom, the headlights, the gate, the courtyard reveal, the walkway, the searcher's
   routine), so the per-beat times are a plausible first play rather than a speed run.
   Controls (Josh's playtest, 7 Oct): a direction alone is the cautious walk (0.95 m/s, for as long as it is held); `run: 1`
   holds Shift. The quick route runs (Shift) on the open stretches; the plausible and first-timer routes walk, except the
   crossings in the searcher's look (with Shift: the "Shift run" hint in the Verge taught it). The door reveal takes control
   in the Search: the bot lets go then and presses again when control is back (BOT goto); a key held through it is latched. */
window.ROUTES = (function () {
  const R = BOT.L, AIs = () => FF.G.searcher, loopT = () => (FF.G.searcher && FF.G.searcher.loopT != null ? FF.G.searcher.loopT : -1);
  const aiMode = () => FF.AI.debug().mode;
  const mark = n => ({ name: 'mark:' + n, f: () => { BOT.mark(n); return true; } });
  const pause = (name, secs, plaus) => R.wait(name, plaus ? secs : 0);
  /* entry time of the aim demonstration's hold (the reveal's camera is on the door then) */
  const aimAt = () => { const a = FF.AI.entrySegs.find(q => q.kind === 'aim-demo'); return a ? a.t0 + 0.9 : 4.65; };
  function verge(plaus) {
    const go = () => plaus ? { right: 1 } : { right: 1, run: 1 };
    return [
      pause('title-look', 4, plaus),
      R.until('start', s => s.g.mode === 'play', () => ({ right: 1 }), 5), mark('play'),
      R.until('settle-cam', s => s.t > 2.6 || s.r.x > 7.5, () => ({ right: 1 }), 10), R.shot('verge-arrival', 'verge-arrival'),
      R.until('to-post', s => s.r.x >= 10.6 && Math.abs(s.r.vx) < 0.05, () => ({ right: 1 }), 20),   /* controls fixer: a cautious walker walks up to the post and hops from there */
      { name: 'jump-post', f: s => { if (s.r.x > 11.3 && s.r.grounded) return true; if (s.t > 4) throw new Error('post not cleared x=' + s.r.x.toFixed(2)); return s.t < 0.22 ? { right: 1, jump: 1 } : { right: 1 }; } },
      R.until('to-boom', s => s.r.x >= 12.7, () => ({ right: 1 }), 10), pause('listen-boom', 2.5, plaus),
      R.until('to-hoarding', s => s.r.x >= 17.6, go, 20), mark('hoarding-through'),
      R.until('to-vehicle', s => s.r.x >= 21.6, go, 20), mark('vehicle-trigger'), pause('watch-headlights', 5, plaus),
      R.until('to-gate', s => s.r.x >= 29.6, go, 20), pause('watch-gate', 5, plaus),
      R.until('into-glare', s => s.r.x >= 32.4, () => ({ right: 1 }), 20), R.shot('verge-gate-glare', 'verge-gate-glare'), pause('glare-hold', 1.5, plaus),
      R.until('to-culvert', s => s.r.y < -0.5, () => ({ right: 1 }), 20), mark('drop'),
      R.until('in-pipe', s => s.r.x >= 41.0, () => ({ right: 1 }), 20), pause('pipe-torch', 2.0, plaus),
      R.until('to-courtyard', s => s.g.place === 'courtyard' && s.r.y > -0.05 && s.r.x > 55.8, go, 60), mark('courtyard'),
    ];
  }
  function courtyard(plaus) {
    return [
      pause('reveal', 2.5, plaus), R.shot('courtyard-arrival', 'courtyard-arrival'),
      R.until('to-box', s => s.g.box.x > 73.05, () => plaus ? { right: 1 } : { right: 1, run: 1 }, 40), mark('first-push'),
      R.until('push-1m', s => s.g.box.x > 74.0, () => ({ right: 1 }), 20), pause('watch-walkway', 4, plaus), R.shot('courtyard-walkway', 'courtyard-walkway'),
      R.until('push-to-kerb', s => s.g.box.x >= 76.05, () => ({ right: 1 }), 30), mark('box-at-kerb'),
      R.wait('settle', 0.3),
      { name: 'hop-on-box', f: s => { if (s.r.onBox && s.r.grounded) return true; if (s.t > 3) throw new Error('could not get on the box x=' + s.r.x.toFixed(2) + ' y=' + s.r.y.toFixed(2)); return s.t < 0.22 ? { right: 1, jump: 1 } : { right: 1 }; } },
      R.wait('on-box', 0.2),
      { name: 'climb-in', f: s => { if (s.r.mode === 'climb' || s.r.mode === 'transit') return true; if (s.t > 3) throw new Error('climb failed x=' + s.r.x.toFixed(2) + ' mode=' + s.r.mode); return s.t < 0.2 ? { up: 1 } : {}; } }, mark('climb'),
      R.until('transit', s => s.g.place === 'search' && s.r.mode === 'play' && s.r.grounded, () => ({}), 20), mark('search-landed'),
    ];
  }
  function searchPatient(plaus) {
    return [
      R.goto('to-A0', 88.6, { max: 20 }), mark('in-A0'),
      R.until('door-light', s => s.ai.state === 'entry' || s.g.flags.entryDone, () => ({}), 10), mark('entry-cue'),
      R.until('entry-aim', s => (s.ai.entryT || 0) >= aimAt() || s.g.flags.entryDone, () => ({}), 15), R.shot('search-arrival-entry-aim', 'search-entry-aim'),
      R.until('entry-done', s => s.g.flags.entryDone && aiMode() === 'patrol', () => ({}), 10), mark('entry-done'),
      R.until('he-walks-left', s => loopT() >= 5.3 && loopT() < 12, () => ({}), 60),
      R.goto('to-deck-core', 94.8, { max: 10 }), mark('in-deck-core'),
      R.until('he-climbs', s => loopT() >= 17.5 && loopT() < 20, () => ({}), 60), R.shot('deck-overhead', 'search-deck-overhead'),
      R.until('the-look', s => loopT() >= 20.8 && loopT() < 23, () => ({}), 60), mark('leave-deck'),
      R.goto('to-skip-core', 106.1, { max: 12, run: true }), mark('in-skip-core'),
      R.until('wrap', s => loopT() >= 0 && loopT() < 2, () => ({}), 60),
      R.until('crouch-look', s => loopT() >= 3.4, () => ({}), 10), R.shot('skip-crouch-look', 'search-skip-crouchlook'),
      R.until('he-passes', s => loopT() >= 6.0, () => ({}), 10), mark('leave-skip'),
      R.until('to-gap', s => s.r.x >= 113.6, () => ({ right: 1 }), 10), mark('through-gap'),
    ];
  }
  /* a first-timer in the Search: watches the entry, crosses to the deck, then makes the classic mistake (walks out towards
     his torch and freezes in it): the aim, the shot, the cut, the restart under the deck; then waits for the look as designed */
  function searchFirstTimer() {
    return [
      R.goto('to-A0', 88.6, { max: 20 }), mark('in-A0'),
      R.until('door-light', s => s.ai.state === 'entry' || s.g.flags.entryDone, () => ({}), 10), mark('entry-cue'),
      R.until('entry-done', s => s.g.flags.entryDone && aiMode() === 'patrol', () => ({}), 20), mark('entry-done'),
      R.until('he-walks-left', s => loopT() >= 5.3 && loopT() < 12, () => ({}), 60),
      R.goto('to-deck-core', 94.8, { max: 10 }), mark('in-deck-core'),
      R.wait('looks-out', 1.0),
      R.goto('mistake-walk-out', 99.0, { max: 8, run: true }), mark('mistake'),
      R.until('caught-in-the-light', s => FF.bus.log.some(e => e.name === 'fail'), () => ({}), 15), mark('fail'),
      R.until('back-under-the-deck', s => s.g.control && s.g.fade < 0.01, () => ({}), 5), mark('restarted'),
      R.until('the-look', s => loopT() >= 20.8 && loopT() < 23, () => ({}), 60), mark('leave-deck'),
      R.goto('to-skip-core', 106.1, { max: 12, run: true }), mark('in-skip-core'),   /* controls fixer: the crossing in his look, with Shift (the hint taught it) */
      R.until('wrap', s => loopT() >= 0 && loopT() < 2, () => ({}), 60),
      R.until('he-passes', s => loopT() >= 6.0, () => ({}), 10), mark('leave-skip'),
      R.until('to-gap', s => s.r.x >= 113.6, () => ({ right: 1 }), 10), mark('through-gap'),
    ];
  }
  function rest(plaus) {
    return [
      R.goto('to-rest', 121.4, { max: 20 }), mark('rest-stop'),
      R.until('groom', s => (FF.Player.debug().pose === 'groom'), () => ({}), 40), R.wait('groom-mid', 1.5), R.shot('rest-groom', 'rest-groom'),
      R.until('pullout', s => FF.bus.log.some(e => e.name === 'end' && e.data && e.data.phase === 'pullout'), () => ({}), 60), mark('pullout'),
      R.wait('pullout-mid', 6.0), R.shot('rest-pullout', 'rest-pullout'),
      R.until('end-mode', s => s.g.mode === 'end', () => ({}), 20), mark('end-card'),
    ];
  }
  return {
    sneak: plaus => [].concat(verge(plaus), courtyard(plaus), searchPatient(plaus), rest(plaus)),
    firsttimer: () => [].concat(verge(true), courtyard(true), searchFirstTimer(), rest(true)),
    verge, courtyard, searchPatient, rest, mark,
  };
})();
true;
