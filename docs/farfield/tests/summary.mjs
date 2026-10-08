// Reads docs/farfield/tests/out/*.json (from run-all.sh) and prints one line per check.
import fs from 'node:fs'; import path from 'node:path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const J = n => { try { return JSON.parse(fs.readFileSync(path.join(OUT, n), 'utf8')); } catch (e) { return null; } };
const rows = []; const row = (name, ok, info) => rows.push([ok ? 'PASS' : 'FAIL', name, info || '']);
const clean = R => R && !R.err && (!R.errs || !R.errs.length) && (!R.state || !R.state.errors || !R.state.errors.length);
let txt = ''; try { txt = fs.readFileSync(path.join(OUT, 'check-search.txt'), 'utf8'); } catch (e) {}
{ const m = txt.match(/(PASS|FAIL) \((\d+)\/(\d+)\)/); row('Search checker (tools/check-search.mjs, RUN and WALK modes)', !!m && m[1] === 'PASS' && m[2] === m[3] && +m[3] >= 23, m ? m[0] : ''); }
const beat = (marks, a, b) => { const A = marks.find(m => m.name === a), B = marks.find(m => m.name === b); return A && B ? +(B.t - A.t).toFixed(1) : null; };
{ let w = ''; try { w = fs.readFileSync(path.join(OUT, 'check-works.txt'), 'utf8'); } catch (e) {}
  const m = w.match(/\n(PASS|FAIL) \(every check\)/); row('Works checker (tools/check-works.mjs: the design check re-run on FF.Works / FF.Painter)', !!m && m[1] === 'PASS', m ? m[0].trim() : ''); }
for (const [f, label, mute] of [['sneak-fast-mute.json', 'quick route through both sequences, notice -> title -> ... -> the Works -> end card -> title (?mute=1)', true], ['firsttimer.json', 'first-timer route through both sequences, a failure in each (sound on)', false]]) {
  const R = J(f); if (!R) { row(label, false, 'no result'); continue; }
  const m = R.marks || [];
  const ok = clean(R) && R.afterEnd && R.afterEnd.mode === 'title' && (!mute || (R.state.ac === 0 && R.state.stored.length === 0)) && (mute || R.afterEnd.save === 'completed') && (!R.flat || R.flat.open === 0) && !!m.find(x => x.name === 'pullout-back') && !!m.find(x => x.name === 'out');
  const times = { verge: beat(m, 'play', 'drop'), drain: beat(m, 'drop', 'courtyard'), courtyard: beat(m, 'courtyard', 'search-landed'), search: beat(m, 'search-landed', 'through-gap'), rest: beat(m, 'through-gap', 'works-in'),
    'way-on': beat(m, 'works-in', 'hall'), 'first-press': beat(m, 'hall', 'culvert'), 'culvert+passage': beat(m, 'culvert', 'line'), 'long-hall': beat(m, 'line', 'out'), 'out+ending': beat(m, 'out', 'end-card') };
  let extra = ''; if (!mute) { const fs_ = m.filter(x => x.name === 'fail'), rs = m.filter(x => x.name === 'restarted'); extra = fs_.length && rs.length ? ' · fail -> full picture ' + fs_.map((f0, i) => rs[i] ? (rs[i].t - f0.t).toFixed(2) + ' s' : '?').join(', ') + ' · fails ' + JSON.stringify((R.fails || []).map(f => f[1] + (f[3] ? ' by ' + f[3] : ''))) + ' · save ' + (R.afterEnd && R.afterEnd.save) : ' · (no failure seen)'; }
  const hint = (R.hints || []).find(h => h[1] === 'run'), rv = (R.reveal || []).find(e => e[1] === 'start'), rc = (R.reveal || []).find(e => e[1] === 'control');
  extra += hint ? ` · Shift-run hint at x ${hint[2]}` : ' · (no run hint)';
  extra += R.flat ? ` · flat in the open ${R.flat.open} of ${R.flat.steps} steps` : '';
  extra += rv && rc ? ` · door reveal (${rv[2]}) ${(rc[0] - rv[0]).toFixed(2)} s from its start to control` : ' · (no door reveal)';
  row(label, ok, `game time to the card ${m.length ? m[m.length - 1].t : '?'} s · per beat ${JSON.stringify(times)}${mute ? ' · AudioContexts ' + (R.state && R.state.ac) + ', storage writes ' + (R.state && R.state.stored.length) : ''}${extra}`);
}
const S = J('scen.json') || {};
for (const [k, want] of [['caught', 'caught'], ['shot', 'shot'], ['escapeCore', null], ['escapeGap', null], ['darkClose', 'caught']]) {
  const v = S[k]; if (!v) { row('scenario ' + k, false, 'no result'); continue; }
  const W = v.W || {}, f = W.fail;
  let ok = !v.err && !(v.errs && v.errs.length) && (want ? f && f.kind === want : !f);
  if (want) ok = ok && W.restart && W.restart.dt < 1.0 && W.controlBack <= 1.1 && W.fullPicture <= 2.0 && W.cutMean != null && W.cutMean < 2;
  const ev = v.events || [], notice = ev.find(e => e[2] === 'notice'), fe = ev.find(e => e[1] === 'fail');
  const warn = notice && fe ? ` · NOTICE -> ${fe[2]} ${(fe[0] - notice[0]).toFixed(2)} s` : '';
  row('scenario ' + k + (want ? ' (-> ' + want + ', restart)' : ' (detected, escapes)'), ok, (want ? `cut frame mean ${W.cutMean} (${W.cutAfter} s after), restart ${W.restart && W.restart.dt} s, control ${W.controlBack} s, full picture ${W.fullPicture} s, back at ${W.after && W.after.cp}` : `ends ${v.end && v.end.ai}, no failure`) + warn);
}
const C = J('t-controls.json');
if (C) row('controls: cautious walk (30 s), Shift run, Down crouch, no flattening in the open, gait, hint', C.pass, `${(C.checks || []).filter(c => c.ok).length}/${(C.checks || []).length}` + ((C.checks || []).filter(c => !c.ok).map(c => ' FAIL ' + c.name).join(';')) + (C.err ? ' ERR ' + C.err.slice(0, 120) : ''));
else row('controls (t-controls.mjs)', false, 'no result');
const RV = J('t-reveal.json');
if (RV) {
  const take = ['still', 'cautious', 'hold', 'run', 'jump', 'hops', 'fullpath'];
  const bad = [];
  for (const k of take) { const v = RV[k]; if (!v) { bad.push(k + ': no result'); continue; } const tm = v.timing || {};
    if (v.err || (v.errors || []).length || (v.errs || []).length) bad.push(k + ': errors');
    if (!(tm.controlFromCue >= 6.0 && tm.controlFromCue <= 6.7)) bad.push(k + ': cue -> control ' + tm.controlFromCue);
    if (!(tm.maxX < 92.0)) bad.push(k + ': went to x ' + tm.maxX);
    if (v.heldMoved != null && v.heldMoved !== 0) bad.push(k + ': a held key moved it within 0.7 s ' + v.heldMoved);
    /* a direction held through it resumes as the walk; since a125461 a Shift held with it runs once the reveal's grace ends
       (the run, jump and hops scenarios hold Shift: up to 2.76 m/s two seconds after control) */
    if (v.resume && v.resume.held.length && !(v.resume.moved > 0.3 && Math.abs(v.resume.vx) <= (['run', 'jump', 'hops'].includes(k) ? 2.76 : 0.96))) bad.push(k + ': a held direction did not resume as the walk ' + JSON.stringify(v.resume));
    if (v.W && v.W.maxSTake > 0) bad.push(k + ': suspicion ' + v.W.maxSTake);
    if (!(tm.reactBeforePan >= 0.75)) bad.push(k + ': the camera left ' + tm.reactBeforePan + ' s after it stopped');
    if (!(tm.scrAtControl >= 0.15)) bad.push(k + ': the rabbit at ' + tm.scrAtControl + ' of the frame at control');
    if (v.repress && !(v.repress.moved > 0.3)) bad.push(k + ': a fresh press did not move it'); }
  const x = RV;
  if (x.shelf && !(x.shelf.maxX < 91.0 && x.shelf.tries.every(t => t.s === 0))) bad.push('shelf: furthest stop ' + (x.shelf && x.shelf.maxX));
  if (x.retry && (x.retry.revealStartsAfterFail || x.retry.entryReplayed)) bad.push('retry replays it');
  if (x.still && x.still.cpAfterLanding !== 'search-arrive') bad.push('checkpoint after landing ' + x.still.cpAfterLanding);
  if (x.restartMid && !(x.restartMid.second && x.restartMid.second.ok && x.restartMid.second.cause === 'replay' && x.restartMid.second.controlOffSeconds <= 3.2)) bad.push('restart after it was seen: ' + JSON.stringify(x.restartMid.second));
  if (x.restartEarly && !(x.restartEarly.second && x.restartEarly.second.ok && x.restartEarly.second.controlFromCue >= 6.0)) bad.push('restart before it was seen: ' + JSON.stringify(x.restartEarly.second));
  if (x.quitContinue && !(x.quitContinue.second && x.quitContinue.second.ok && x.quitContinue.second.cause === 'replay' && x.quitContinue.second.controlOffSeconds <= 3.6)) bad.push('quit -> continue: ' + JSON.stringify(x.quitContinue.second));
  if (x.restartGrace && x.restartGrace.replay && x.restartGrace.replay.controlOffSeconds > 0) bad.push('restart in the grace takes control');
  if (x.unseen && !(x.unseen.protected3s && x.unseen.protected3s.s === 0 && x.unseen.unprotected && x.unseen.unprotected.ai === 'notice')) bad.push('unseen guarantee');
  if (x.autorepeat && !(x.autorepeat.autoRepeat && x.autorepeat.autoRepeat.moved === 0)) bad.push('auto-repeat ends the latch');
  if (x.quickrepress && !(x.quickrepress.quick && x.quickrepress.quick.moved > 0.2 && !x.quickrepress.quick.latchedAfter.length)) bad.push('quick re-press');
  if (x.pressDuringReturn && !x.pressDuringReturn.tries.every(t => !t.latched.length && t.moved > 0.2)) bad.push('a press during the takeover latched: ' + JSON.stringify(x.pressDuringReturn.tries));
  if (x.mash && !(x.mash.mashed && !x.mash.mashed.latched.length && x.mash.mashed.moved > 0.2)) bad.push('mash latched');
  if (x.aspect && !Object.values(x.aspect.frames || {}).every(f => f.gap <= 0.9 && f.door >= 0.05)) bad.push('aspect: ' + JSON.stringify(x.aspect.frames));
  if (x.smooth && x.smooth.smooth && x.smooth.smooth.velocityJumpsOver3) bad.push('camera jumps');
  const tms = take.filter(k => RV[k] && RV[k].timing).map(k => k + ' ' + RV[k].timing.cause + ' stop x ' + RV[k].timing.stopX + ' react ' + RV[k].timing.reactBeforePan + ' s ctl ' + RV[k].timing.controlFromCue + ' s').join('; ');
  row('door reveal: completes for still / cautious / forward held / run / running jump / hops / full path / shelf; reaction seen; no harm; latch; retries; aspects', !bad.length, bad.length ? bad.join('; ') : tms);
} else row('door reveal (t-reveal.mjs)', false, 'no result');
const SL = J('t-slide.json');
if (SL) row('feet: no sliding (steady gaits, starting, stopping, the hoarding cycle change; the searcher walking)', SL.pass, (SL.checks || []).map(c => (c.ok ? '' : 'FAIL ') + c.name.split(':')[0]).join('; ') + (SL.err ? ' ERR ' + String(SL.err).slice(0, 120) : ''));
else row('feet (t-slide.mjs)', false, 'no result');
const D = J('t-detect.json');
if (D) { row('detection model: cover blocks, darkness shortens but never hides up close (static)', D.static && D.static.pass, (D.static.tests || []).filter(t => !t.ok).map(t => t.name).join('; ') || D.static.tests.length + ' cases');
  const L = D.live || {}; const cores = ['A0', 'deck', 'pallet', 'skip'].every(c => L[c] && L[c].maxS === 0);
  row('every hide core stays unseen through a whole loop (live)', cores && L['open-100'] && L['open-100'].firstNotice != null, Object.entries(L).map(([k, v]) => k + ':' + v.maxS).join(' ')); }
const Lg = J('t-linger.json');
if (Lg && Lg.linger) row('the Verge never pushes (60 s before the gate, 30 s in the glare)', !Lg.err && Lg.linger.rabbitMovedBy < 0.5 && Lg.linger.inGlare30s.personEvents.length === 0 && Lg.linger.control, `rattles ${Lg.linger.inGlare30s.gateEvents.rattle}, glare pauses ${Lg.linger.inGlare30s.gateEvents['lit-pause']}`);
const Rm = J('room.json');
if (Rm) row('arcade room (menu + notice, Play, mute/music, Esc, teardown, ?mute=1)', !Rm.err && !(Rm.errs || []).length && Rm.ready && Rm.afterEscNotice && Rm.afterEscNotice.menu && Rm.mute1 && Rm.mute1.ac === 0 && Rm.mute1.set.length === 0 && Rm.afterStop && Rm.afterStop.teardown && Rm.afterStop.teardown.lost, '');
/* Sequence 2's own tests (their logs) */
for (const [f, label, re] of [['works.log', 'Sequence 2: the machines, the gate, the worker, checkpoints, endings, the join (t-works.mjs W1-W13)', /\n(PASS|FAIL) \((\d+)\/(\d+)\)/], ['polish.log', 'Polish pass: the opening tumble and its light, the painter (hears, chases), the door, the searcher (sound), the jump, the held-Shift run through the presses (t-polish.mjs)', /\n(PASS|FAIL) \((\d+)\/(\d+)\)/], ['audio-works.log', 'Sequence 2: the sound of the Works (t-audio-works.mjs)', /\n(ALL PASS)/]]) {
  let t = ''; try { t = fs.readFileSync(path.join(OUT, f), 'utf8'); } catch (e) {}
  const m = t.match(re), fails = (t.match(/^FAIL .*$/mg) || []).slice(0, 3).join('; ');
  row(label, !!m && (m[1] === 'ALL PASS' || (m[1] === 'PASS' && m[2] === m[3])), m ? m[0].trim() + (fails ? ' ' + fails : '') : 'no result ' + fails);
}
const WF = J('works-flow.json');
row('Sequence 2 flow: the notice names dangerous machinery (game and arcade); ?start=works; the save migration; ?mute=1', !!(WF && WF.pass), WF ? `${WF.checks.filter(c => c.ok).length}/${WF.checks.length}` + WF.checks.filter(c => !c.ok).map(c => ' FAIL ' + c.name).join(';') : 'no result');
const F = fs.readdirSync(OUT).filter(n => /^t-fps-.*\.json$/.test(n)).map(n => J(n));
for (const R of F) { if (!R || !R.res) continue; const lo = t => Math.min(...Object.values(R.res[t] || {}).map(v => v.fps)); row(`fps ${R.W}x${R.H} at DSF ${R.dsf} (real loop, headless)`, lo('high') >= 55, `high >= ${lo('high')}, medium >= ${lo('medium')}, low >= ${lo('low')}`); }
const w = Math.max(...rows.map(r => r[1].length));
for (const r of rows) console.log(r[0] + '  ' + r[1].padEnd(w) + '  ' + r[2]);
console.log(rows.every(r => r[0] === 'PASS') ? '\nALL PASS' : '\nSOME FAILED');
