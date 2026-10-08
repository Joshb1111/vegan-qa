/* Integrator routes (in-page). Each route is a list of legs for BOT (bot.js). `plaus` adds the pauses a first-time player
   plausibly makes (looking at the title, the boom, the headlights, the gate, the courtyard reveal, the walkway, the searcher's
   routine), so the per-beat times are a plausible first play rather than a speed run.
   Controls (Josh's playtest, 7 Oct): a direction alone is the cautious walk (0.95 m/s, for as long as it is held); `run: 1`
   holds Shift. The quick route runs (Shift) on the open stretches; the plausible and first-timer routes walk, except the
   crossings in the searcher's look (with Shift: the "Shift run" hint in the Verge taught it). The door reveal takes control
   in the Search: the bot lets go then and presses again when control is back (BOT goto); a key held through it is latched.
   SEQUENCE 2 (integration, 8 Oct): Sequence 1's rest is now an optional pull-out that comes back (no card); the routes rest
   there, then walk on over the slab into THE WORKS, played by works-bot.js's plan (window.__worksBot, which must be loaded:
   play.mjs injects it) through the real input path: the quick route straight to pit B, past the worker, running the long
   hall, out down the embankment (ending b); the first-timer watches the first press, freezes on the bed at a clank (the
   mistimed crossing: the cut, back on the apron), then pit to pit, careless in the worker's light (his look), the designed
   flow through the long hall (pit C under the great press) and rests under the pipe until the pull-out and the card
   (ending a). */
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
  /* Sequence 1's breathing space: rest under the lean-to; the pull-out to the Works now comes back to the player (Sequence 2's
     join). The quick route walks on during it (input brings the camera back at once); the first-timer lets it come back */
  /* the bus keeps only its last 200 events (the sound events alone fill that in seconds): the facts the routes wait on are
     recorded here instead */
  const REC = window.__REC = window.__REC || (() => { const r = []; for (const n of ['press', 'fail', 'pullout', 'ending', 'end', 'checkpoint', 'works-start', 'restart', 'painter:noticed'])
    FF.bus.on(n, d => { if (n === 'press' && !(d && (d.phase === 'contact' || d.phase === 'release'))) return; r.push({ t: +FF.G.t.toFixed(3), name: n, data: d }); }); return r; })();
  const busSince = (t0, pred) => REC.some(e => e.t >= t0 && pred(e));
  function rest(plaus) {
    return [
      R.goto('to-rest', 121.4, { max: 20 }), mark('rest-stop'),
      R.until('groom', s => (FF.Player.debug().pose === 'groom'), () => ({}), 40), R.wait('groom-mid', 1.5), R.shot('rest-groom', 'rest-groom'),
      { name: 'pullout', f: s => { s.m.restT0 = s.m.restT0 || FF.G.t; if (busSince(s.m.restT0, e => e.name === 'pullout' && e.data && e.data.phase === 'start' && e.data.seq === 1)) return true; if (s.t > 60) throw new Error('no pull-out'); return {}; } }, mark('pullout'),
      R.wait('pullout-mid', 6.0), R.shot('rest-pullout', 'rest-pullout'),
      { name: 'pullout-back', f: s => { if (busSince(s.m.restT0, e => e.name === 'pullout' && e.data && e.data.phase === 'return' && e.data.seq === 1) && (plaus || Math.abs(s.r.vx) > 0.3)) return true; if (s.t > 30) throw new Error('the pull-out never came back'); return plaus ? {} : { right: 1 }; } }, mark('pullout-back'),
      R.wait('camera-back', plaus ? 4.0 : 1.2), R.shot('rest-back', 'rest-back'),
      { name: 'not-the-end', f: s => { if (s.g.mode === 'end' || s.g.fade > 0.5) throw new Error('Sequence 1 still ends at the rest'); return true; } },
    ];
  }
  /* SEQUENCE 2, THE WORKS (works-bot.js's plan, through real keys). Marks: works-in (leaving the rest's grass), works-first
     (the creep starts: the first press releases), hall, culvert, passage, line, out, end-card */
  const P1 = () => FF.Works.press('P1'), core = (id, x) => { const k = FF.S2.shelters.find(q => q.id === id); return x >= k.core[0] && x <= k.core[1]; };
  const contacts = (id, t0) => REC.filter(e => e.name === 'press' && e.data && e.data.id === id && e.data.phase === 'contact' && e.t >= t0).length;
  function worksWay() {
    return [
      R.until('to-slab', s => s.r.x >= 124.4, () => ({ right: 1 }), 30), mark('works-in'),
      R.until('on-slab', s => s.r.x >= 128.4, () => ({ right: 1 }), 20), R.shot('works-slab', 's2-slab-wall-rain'),
      R.until('creep', s => s.r.x >= 133.95, () => ({ right: 1 }), 20), mark('works-first'),
      R.until('creeping', s => s.r.x >= 134.9, () => ({ right: 1 }), 10), R.shot('works-creep', 's2-creep-first-clank'),
    ];
  }
  function worksQuick() {
    const plan = () => (window.__WBQ = window.__WBQ || __worksBot({ p1: 'direct', painter: 'walk', line: 'runner', end: 'leave' }))();
    return worksWay().concat([
      R.until('hall', s => s.g.place === 'hall', plan, 20), mark('hall'),
      R.until('culvert', s => s.g.place === 'culvert', plan, 120), mark('culvert'),
      R.until('passage', s => s.g.place === 'passage', plan, 60), mark('passage'),
      R.until('line', s => s.g.place === 'line', plan, 60), mark('line'),
      R.until('out', s => s.g.place === 'out', plan, 120), mark('out'),
      R.until('leave', s => s.r.x >= 210.4, plan, 60), R.shot('works-leave', 's2-walk-on-into-the-fog'),
      R.until('end-mode', s => s.g.mode === 'end', plan, 30), mark('end-card'),
    ]);
  }
  function worksFirstTimer() {
    const plan = () => (window.__WBF = window.__WBF || __worksBot({ p1: 'pits', painter: 'careless', line: 'continuous', end: 'rest', delay: 1.0 }))();
    return worksWay().concat([
      R.until('hall', s => s.g.place === 'hall', () => ({ right: 1 }), 20), mark('hall'),
      /* the first thud, seen from the apron */
      R.goto('to-apron', 138.4, { max: 20 }),
      { name: 'first-thud', f: s => { if (contacts('P1', 0) >= 1) return true; if (s.t > 20) throw new Error('no first thud'); return {}; } }, R.wait('burst', 0.12), R.shot('works-first-thud', 's2-first-thud-from-the-apron'),
      /* watches it rise and hang still, then the MISTIMED CROSSING: walks in at the next clank and freezes on the bed */
      R.until('next-clank', s => P1().state === 'release', () => ({}), 40), mark('mistake'),
      R.goto('onto-the-bed', 140.8, { max: 6 }),
      R.until('coming-down', s => P1().state === 'descent' && P1().y < 1.0 || REC.some(e => e.name === 'fail' && e.data && e.data.kind === 'machine'), () => ({}), 6), R.shot('works-mistimed', 's2-mistimed-the-press-coming-down'),
      R.until('the-cut', s => REC.some(e => e.name === 'fail' && e.data && e.data.kind === 'machine'), () => ({}), 6), mark('fail'),
      R.until('back-on-the-apron', s => s.g.control && s.g.fade < 0.01, () => ({}), 5), mark('restarted'), R.shot('works-restart', 's2-restart-on-the-apron'),
      /* then as designed: watch, walk in during the stillness, pit to pit */
      R.until('pit-A', s => core('pit-A', s.r.x) && s.r.y < -0.3 && P1().state === 'down', plan, 90), R.wait('settled-in', 0.6), R.shot('works-pitA', 's2-pit-A-under-the-pressed-press'),
      R.until('pit-B', s => core('pit-B', s.r.x) && s.r.y < -0.3 && FF.Works.sluice().gap >= 0.26, plan, 90), R.shot('works-pitB', 's2-pit-B-the-gate-lifts'),
      R.until('culvert', s => s.g.place === 'culvert' && s.r.y < -0.9 && s.r.x > 148.0, plan, 30), mark('culvert'), R.shot('works-culvert', 's2-culvert'),
      R.until('passage', s => s.g.place === 'passage', plan, 60), mark('passage'),
      R.until('worker', s => s.r.x >= 157.4, plan, 60), R.shot('works-worker', 's2-the-worker-scraping-the-rabbit-in-the-dark'),
      R.until('the-look', s => { const p = FF.Painter.debug(); return p.mode === 'look' && p.lamp > 0.9; }, plan, 60), R.wait('held', 0.4), R.shot('works-look', 's2-the-look-his-lamp-on-the-rabbit'),
      R.until('line', s => s.g.place === 'line', plan, 60), mark('line'),
      /* (each shot's moment falls back to a place on the way, so a route that never meets it still goes on) */
      R.until('doorway', s => s.r.x >= 168.6, plan, 40), R.shot('works-doorway', 's2-the-walk-from-the-doorway'),
      R.until('G1', s => s.r.x >= 173.7, plan, 40), R.shot('works-g1', 's2-gap-G1-rain'),
      R.until('pit-C', s => (core('pit-C', s.r.x) && s.r.y < -0.3 && ['descent', 'down'].includes(FF.Works.press('Q3').state) && FF.Works.press('Q3').y < 1.2) || s.r.x > 187.0, plan, 60), mark('pit-C'), R.shot('works-pitC', 's2-pit-C-under-the-great-press'),
      R.until('out', s => s.g.place === 'out', plan, 60), mark('out'), R.wait('look-back', 1.6), R.shot('works-out', 's2-out-of-the-end-door'),
      R.until('groom', s => s.r.x > 199 && FF.Player.debug().pose === 'groom', plan, 60), R.wait('groom-mid', 1.2), R.shot('works-pipe', 's2-under-the-pipe-the-far-windows'),
      { name: 'pullout', f: s => { if (REC.some(e => e.name === 'pullout' && e.data && e.data.phase === 'start' && e.data.seq === 2)) return true; if (s.t > 60) throw new Error('no pull-out under the pipe'); return {}; } }, mark('pullout-2'),
      R.wait('pullout-mid', 6.0), R.shot('works-pullout', 's2-ending-a-the-pull-out'),
      R.until('end-mode', s => s.g.mode === 'end', () => ({}), 30), mark('end-card'),
    ]);
  }
  return {
    sneak: plaus => [].concat(verge(plaus), courtyard(plaus), searchPatient(plaus), rest(plaus), plaus ? worksFirstTimer() : worksQuick()),
    firsttimer: () => [].concat(verge(true), courtyard(true), searchFirstTimer(), rest(true), worksFirstTimer()),
    verge, courtyard, searchPatient, rest, worksQuick, worksFirstTimer, mark,
  };
})();
true;

