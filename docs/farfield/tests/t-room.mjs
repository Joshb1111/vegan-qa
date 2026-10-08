// T6: the arcade room: menu, Play, ready / mute / music / exit / leave, Esc on the notice and on the title, teardown, ?mute=1
import { start, sleep } from './room-lib.mjs'; import fs from 'node:fs'; import path from 'node:path';
const OUT = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'out');
const b = await start({ visible: true }); const R = {};
const G = expr => `(() => { const f = document.querySelector('#arcade iframe'); const w = f && f.contentWindow; return w && w.FF ? (${expr}) : null; })()`;
const waitReady = async () => { for (let i = 0; i < 120; i++) { const ok = await b.ev(G('w.__ff && w.__ff.ready')); if (ok) return true; await sleep(250); } return false; };
const centre = async sel => b.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
try {
  await b.nav('/farfield/room-test.html', 'window.__room && document.querySelector("#arcade [data-a=play]")', 30000);
  await sleep(400); await b.shot(path.join(OUT, 'room-room-menu.jpg'), 85);
  R.menu = await b.ev(`({ title: document.querySelector('#arcade h3').textContent, cn: document.querySelector('#arcade .cn').textContent, buttons: [...document.querySelectorAll('#arcade .row button')].map(b => b.textContent), bar: !!document.querySelector('#house .hbar .ffbar'), snd: document.querySelector('.ffbar .snd').title, probe: window.__probe })`);
  /* Play: the frame, queued settings delivered on 'ready' */
  const [px, py] = await centre('#arcade [data-a=play]'); await b.click(px, py);
  R.ready = await waitReady(); await sleep(300);
  R.inGame = await b.ev(G('({ mode: w.FF.G.mode, muted: w.FF.G.muted, music: w.FF.G.music, src: document.querySelector("#arcade iframe").getAttribute("src"), msgs: window.__room.msgs.slice() })'));
  /* the room's Sound button -> the game mutes; the game's N -> the room's Music button and storage */
  const [sx, sy] = await centre('.ffbar .snd'); await b.click(sx, sy); await sleep(300);
  R.afterSnd = await b.ev(G('({ gameMuted: w.FF.G.muted, roomStore: localStorage.getItem("planet-ff-mute"), label: document.querySelector(".ffbar .snd").title })'));
  const fr = await b.ev(`(() => { const r = document.querySelector('#arcade iframe').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.85]; })()`); await b.click(fr[0], fr[1]); await sleep(200);
  await b.key('KeyN'); await sleep(300);
  R.afterN = await b.ev(`({ music: localStorage.getItem('planet-ff-music'), label: document.querySelectorAll('.ffbar .snd')[1].title, msgs: window.__room.msgs.slice(-3), gameMusic: ${G('w.FF.G.music')} })`);
  await b.shot(path.join(OUT, 'room-room-game-notice.jpg'), 85);
  /* Esc on the game's notice -> exit -> the menu again (frame gone) */
  await b.key('Escape'); await sleep(500);
  R.afterEscNotice = await b.ev(`({ frame: !!document.querySelector('#arcade iframe'), menu: !!document.querySelector('#arcade [data-a=play]'), focus: document.activeElement && document.activeElement.dataset.a, msgs: window.__room.msgs.slice(-2) })`);
  /* Play again: Continue, then Esc on the title -> exit */
  await b.key('Enter'); R.ready2 = await waitReady(); await sleep(300);
  const fr2 = await b.ev(`(() => { const r = document.querySelector('#arcade iframe').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.85]; })()`); await b.click(fr2[0], fr2[1]); await sleep(150);
  await sleep(600); R.title = await b.ev(G('({ mode: w.FF.G.mode, muted: w.FF.G.muted, ui: w.FF.UI.debug() })'));
  await b.shot(path.join(OUT, 'room-room-game-title.jpg'), 85);
  await b.key('Escape'); await sleep(500);
  R.afterEscTitle = await b.ev(`({ frame: !!document.querySelector('#arcade iframe'), menu: !!document.querySelector('#arcade [data-a=play]') })`);
  /* Play, then stop the room while the game runs: 'leave' first, the frame removed, the room gone */
  await b.key('Enter'); R.ready3 = await waitReady();
  await b.ev(`(() => { const f = document.querySelector('#arcade iframe'); window.__leaveSeen = false; const w = f.contentWindow, td = w.__ff.teardown; w.__ff.teardown = function () { window.__tdSeen = { ctx: w.FF.Audio.debug().context }; td.call(this); window.__tdSeen.after = w.FF.Audio.debug().context; window.__tdSeen.lost = w.__ff.renderer.getContext().isContextLost(); }; return true; })()`);
  await b.ev('window.__room.leave(); true'); await sleep(400);
  R.afterStop = await b.ev(`({ teardown: window.__tdSeen || null, arcade: !!document.getElementById('arcade'), css: !!document.getElementById('ff-room-css'), bar: !!document.querySelector('.ffbar'), duck: window.__duck })`);
  R.final = await b.ev('({ probe: window.__probe })');
  /* ?mute=1: nothing stored, the game opened muted */
  await b.nav('/farfield/room-test.html?mute=1', 'window.__room && document.querySelector("#arcade [data-a=play]")', 30000);
  await b.ev('window.__probe.set = []; true');
  const [qx, qy] = await centre('#arcade [data-a=play]'); await b.click(qx, qy); await waitReady(); await sleep(300);
  const [mx, my] = await centre('.ffbar .snd'); await b.click(mx, my); await sleep(200);
  R.mute1 = await b.ev(`({ src: document.querySelector('#arcade iframe').getAttribute('src'), silent: ${G('w.FF.SILENT')}, ac: ${G('w.__probe ? w.__probe.ac : -1')}, set: window.__probe.set.slice(), gameSet: ${G('w.__probe ? w.__probe.set.slice() : null')}, sndDisabled: document.querySelector('.ffbar .snd').disabled })`);
} catch (e) { R.err = e.message; }
R.errs = b.errs.slice(0, 20); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'room.json'), JSON.stringify(R, null, 1)); b.close();
console.log(JSON.stringify(R)); process.exit(0);
