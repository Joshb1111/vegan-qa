/* =====================================================================
   FAR FIELD in the arcade (public/farfield/: a dark, quiet side-on puzzle adventure about a rabbit; three.js r128).
   Single player. Modelled on rootlight-room.js / vine-room.js, NOT wired into the planet: adding the cabinet to planet.html /
   planet-dress.js (the enterHouse dispatch, CAB_ACT) is a separate change for Josh to approve (SEQUENCE-1.md A20).
   Test it with public/farfield/room-test.html.
     farfieldRoom(body, ctx) -> stop()   the menu (title, one line, the CONTENT NOTICE, Play), the iframe only on Play
   Messages (same origin only):  game -> room  {ty:'ready'} {ty:'mute',on} {ty:'music',on} {ty:'exit'}
                                 room -> game  {ty:'mute',on} {ty:'music',on} {ty:'leave'} (sent before the frame is removed)
   Storage: planet-ff-mute, planet-ff-music (try/catch).
   OWNER: the audio + UI + room builder. SKELETON: a working minimal room; the builder styles it like the other cabinets
   (sound and music buttons, focus handling, layout) and tests teardown and mute through room-test.html.
   ===================================================================== */
'use strict';
function farfieldRoom(body, ctx) {
  ctx = ctx || {};
  const el = document.createElement('div'); el.id = 'arcade'; body.appendChild(el);
  let frame = null, ready = false, queue = [], muted = true, music = true, alive = true;
  try { const v = localStorage.getItem('planet-ff-mute'); muted = v === null ? !ctx.musicOn : v === '1'; } catch (_) { muted = !ctx.musicOn; }
  try { music = localStorage.getItem('planet-ff-music') !== '0'; } catch (_) {}
  const toGame = m => { if (!frame) return; if (!ready) { queue = queue.filter(x => x.ty !== m.ty); queue.push(m); return; } try { frame.contentWindow.postMessage(m, location.origin); } catch (_) {} };
  const dropFrame = () => { if (frame) { toGame({ ty: 'leave' }); frame.remove(); frame = null; } ready = false; queue = []; };
  const menu = msg => {
    dropFrame();
    el.innerHTML = '<h3>FAR FIELD</h3><p class="sub">A dark, quiet side-on puzzle adventure.</p>' +
      '<p class="msg"><b>Content notice:</b> pursuit, capture and non-graphic violence towards the rabbit.</p>' +
      (msg ? '<p class="msg">' + String(msg).replace(/[<>&"]/g, '') + '</p>' : '') +
      '<div class="row"><button type="button" data-a="play">Play</button></div>';
  };
  const play = () => {
    dropFrame(); el.innerHTML = '';
    frame = document.createElement('iframe'); frame.className = 'tyframe'; frame.title = 'Far Field'; frame.src = 'farfield/index.html?v=1'; frame.allow = 'autoplay; fullscreen';
    el.appendChild(frame); toGame({ ty: 'mute', on: muted }); toGame({ ty: 'music', on: music });
    const f = frame; f.addEventListener('load', () => setTimeout(() => { try { f.focus(); f.contentWindow.focus(); } catch (_) {} }, 200));
  };
  const onFrame = e => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.ty === 'ready') { if (!ready) { ready = true; const q = queue; queue = []; for (const x of q) toGame(x); } }
    else if (m.ty === 'mute') { muted = !!m.on; try { localStorage.setItem('planet-ff-mute', muted ? '1' : '0'); } catch (_) {} }
    else if (m.ty === 'music') { music = !!m.on; try { localStorage.setItem('planet-ff-music', music ? '1' : '0'); } catch (_) {} }
    else if (m.ty === 'exit') menu('');
  };
  addEventListener('message', onFrame);
  el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && b.dataset.a === 'play') play(); });
  menu('');
  return () => { if (!alive) return; alive = false; removeEventListener('message', onFrame); dropFrame(); el.remove(); };
}
window.farfieldRoom = farfieldRoom;
