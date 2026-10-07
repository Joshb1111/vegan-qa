// Reads docs/farfield/tests/out/*.json (from run-all.sh) and prints one line per check.
import fs from 'node:fs'; import path from 'node:path';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const J = n => { try { return JSON.parse(fs.readFileSync(path.join(OUT, n), 'utf8')); } catch (e) { return null; } };
const rows = []; const row = (name, ok, info) => rows.push([ok ? 'PASS' : 'FAIL', name, info || '']);
const clean = R => R && !R.err && (!R.errs || !R.errs.length) && (!R.state || !R.state.errors || !R.state.errors.length);
let txt = ''; try { txt = fs.readFileSync(path.join(OUT, 'check-search.txt'), 'utf8'); } catch (e) {}
row('Search checker (tools/check-search.mjs)', /PASS \(18\/18\)/.test(txt), (txt.match(/(PASS|FAIL) \(\d+\/\d+\)/) || [''])[0]);
const beat = (marks, a, b) => { const A = marks.find(m => m.name === a), B = marks.find(m => m.name === b); return A && B ? +(B.t - A.t).toFixed(1) : null; };
for (const [f, label, mute] of [['sneak-fast-mute.json', 'sneak route, notice -> title -> ... -> end card -> title (?mute=1)', true], ['firsttimer.json', 'first-timer route with one failure (sound on)', false]]) {
  const R = J(f); if (!R) { row(label, false, 'no result'); continue; }
  const m = R.marks || [];
  const ok = clean(R) && R.afterEnd && R.afterEnd.mode === 'title' && (!mute || (R.state.ac === 0 && R.state.stored.length === 0));
  const times = { verge: beat(m, 'play', 'drop'), drain: beat(m, 'drop', 'courtyard'), courtyard: beat(m, 'courtyard', 'search-landed'), search: beat(m, 'search-landed', 'through-gap'), rest: beat(m, 'through-gap', 'end-card') };
  let extra = ''; if (!mute) { const f0 = m.find(x => x.name === 'fail'), r0 = m.find(x => x.name === 'restarted'); extra = f0 && r0 ? ` · fail -> full picture ${(r0.t - f0.t).toFixed(2)} s` : ' · (no failure seen)'; }
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
const D = J('t-detect.json');
if (D) { row('detection model: cover blocks, darkness shortens but never hides up close (static)', D.static && D.static.pass, (D.static.tests || []).filter(t => !t.ok).map(t => t.name).join('; ') || D.static.tests.length + ' cases');
  const L = D.live || {}; const cores = ['A0', 'deck', 'pallet', 'skip'].every(c => L[c] && L[c].maxS === 0);
  row('every hide core stays unseen through a whole loop (live)', cores && L['open-100'] && L['open-100'].firstNotice != null, Object.entries(L).map(([k, v]) => k + ':' + v.maxS).join(' ')); }
const Lg = J('t-linger.json');
if (Lg && Lg.linger) row('the Verge never pushes (60 s before the gate, 30 s in the glare)', !Lg.err && Lg.linger.rabbitMovedBy < 0.5 && Lg.linger.inGlare30s.personEvents.length === 0 && Lg.linger.control, `rattles ${Lg.linger.inGlare30s.gateEvents.rattle}, glare pauses ${Lg.linger.inGlare30s.gateEvents['lit-pause']}`);
const Rm = J('room.json');
if (Rm) row('arcade room (menu + notice, Play, mute/music, Esc, teardown, ?mute=1)', !Rm.err && !(Rm.errs || []).length && Rm.ready && Rm.afterEscNotice && Rm.afterEscNotice.menu && Rm.mute1 && Rm.mute1.ac === 0 && Rm.mute1.set.length === 0 && Rm.afterStop && Rm.afterStop.teardown && Rm.afterStop.teardown.lost, '');
const F = fs.readdirSync(OUT).filter(n => /^t-fps-.*\.json$/.test(n)).map(n => J(n));
for (const R of F) { if (!R || !R.res) continue; const lo = t => Math.min(...Object.values(R.res[t] || {}).map(v => v.fps)); row(`fps ${R.W}x${R.H} at DSF ${R.dsf} (real loop, headless)`, lo('high') >= 55, `high >= ${lo('high')}, medium >= ${lo('medium')}, low >= ${lo('low')}`); }
const w = Math.max(...rows.map(r => r[1].length));
for (const r of rows) console.log(r[0] + '  ' + r[1].padEnd(w) + '  ' + r[2]);
console.log(rows.every(r => r[0] === 'PASS') ? '\nALL PASS' : '\nSOME FAILED');
