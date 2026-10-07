/* =====================================================================
   FAR FIELD in the arcade (public/farfield/: a dark, quiet side-on puzzle adventure about a rabbit; three.js r128, all sound
   made in code). Single player. Modelled on rootlight-room.js / vine-room.js. NOT wired into the planet: adding the cabinet
   to planet.html / planet-dress.js is a separate change for Josh to approve (SEQUENCE-1.md A20). When it is, enterHouse needs:
     else if(act.kind==='farfield'&&window.farfieldRoom)houseStop=farfieldRoom(body,{musicOn});
   Test it with public/farfield/room-test.html.
     farfieldRoom(body, ctx) -> stop()
   The menu: FAR FIELD, one line, the CONTENT NOTICE (pursuit, capture and non-graphic violence towards the rabbit), Play.
   The game's own first screen repeats the notice. The iframe exists only while playing (farfield/index.html?v=3); stop()
   and the game's Exit both remove it (the game frees its GPU on 'leave').
   The Sound and Music buttons sit in the house's header bar beside its title (on a page without one, a row at the top
   right); they never cover the game. Music in this game is the ambience and the little music it has; Sound is everything.
   Messages (same origin only):  game -> room  {ty:'ready'} {ty:'mute',on} {ty:'music',on} {ty:'exit'}
                                 room -> game  {ty:'mute',on} {ty:'music',on} (queued until 'ready')  {ty:'leave'} (before removal;
                                               the room also calls the game's __ff.teardown() then, as a posted message dies with the frame)
   Storage: planet-ff-mute, planet-ff-music (try/catch). A page opened with ?mute=1 stores nothing and passes ?mute=1 on.
   OWNER: the audio + UI + room builder.
   ===================================================================== */
'use strict';
function farfieldRoom(body, ctx) {
  ctx = ctx || {};
  const el = document.createElement('div'); el.id = 'arcade'; el.className = 'ff'; body.appendChild(el);
  const silent = /[?&]mute=1(&|$)/.test(location.search);
  let frame = null, ready = false, queue = [], muted = true, music = true, alive = true, bar = null, sndBtn = null, musBtn = null, unf = null;
  if (!silent) {
    try { const v = localStorage.getItem('planet-ff-mute'); muted = v === null ? !ctx.musicOn : v === '1'; } catch (_) { muted = !ctx.musicOn; }
    try { music = localStorage.getItem('planet-ff-music') !== '0'; } catch (_) {}
  }
  const store = (k, v) => { if (!silent) try { localStorage.setItem(k, v ? '1' : '0'); } catch (_) {} };
  /* a quiet look of its own inside the arcade's frame (the planet styles '#arcade' for its brighter cabinets) */
  if (!document.getElementById('ff-room-css')) {
    const cs = document.createElement('style'); cs.id = 'ff-room-css';
    cs.textContent =
      '#arcade.ff{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(ellipse 85% 65% at 50% 15%,#1c242b 0%,#0c0f12 58%,#07090b 100%);color:#aab4be;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
      '#arcade.ff .ffm{max-width:560px;margin:auto}' +
      '#arcade.ff h3{font-family:inherit;font-weight:200;font-size:clamp(28px,6.5vw,46px);letter-spacing:.56em;margin:0 0 14px .56em;color:rgba(236,239,241,.8)}' +
      '#arcade.ff .sub{font-size:16px;line-height:1.5;color:#9aa6b2;margin:0 auto 18px;max-width:30em}' +
      '#arcade.ff .cn{font-size:14px;line-height:1.6;color:#a3aeb9;margin:0 auto 24px;max-width:31em;padding:10px 16px;border:1px solid #2d353d;border-radius:3px;background:rgba(9,12,15,.55)}' +
      '#arcade.ff .cn b{font-weight:600;color:#c9d1d8;letter-spacing:.03em}' +
      '#arcade.ff .row{justify-content:center}' +
      '#arcade.ff .row button{font-family:inherit;font-size:15px;letter-spacing:.16em;padding:10px 34px;background:transparent;color:#e3e8ec;border:1px solid #5d6873;border-radius:2px;box-shadow:none;transition:border-color .2s,background .2s}' +
      '#arcade.ff .row button:hover,#arcade.ff .row button:focus-visible{border-color:#c6ced6;background:rgba(198,206,214,.07);outline:none}' +
      '#arcade.ff .msg{color:#9aa6b2;font-size:14px;min-height:20px;margin-top:16px}' +
      '#arcade.ff .fine{color:#5c6772;font-size:12px;margin-top:20px;letter-spacing:.03em}' +
      '#arcade.ff .clickme{background:rgba(4,6,8,.42);color:#dfe5ea;font-family:inherit;font-size:17px;letter-spacing:.14em;text-shadow:0 1px 3px #000}' +
      '#arcade.ff .ffbar{position:absolute;right:10px;top:8px;z-index:4;display:flex;gap:6px}' +
      /* in the planet's header bar: the planet's own pill look (as rootlight-room.js), beating '#house .hbar button' */
      '#house .hbar .ffbar{display:inline-flex;align-items:center;gap:6px;min-width:0;flex:0 1 auto;overflow:hidden}' +
      '#house .hbar .ffbar button.snd,#arcade.ff .ffbar button.snd{position:static;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;margin:0;font-family:var(--hand,inherit);font-size:16px;line-height:1;background:rgba(13,11,22,.8);color:#f3efe4;border:1px solid #4a4060;border-radius:6px;cursor:pointer;box-shadow:none;white-space:nowrap;flex:none}' +
      '#house .hbar .ffbar button.snd:hover,#house .hbar .ffbar button.snd:focus-visible,#arcade.ff .ffbar button.snd:hover{border-color:#8f84a8;outline:none}' +
      '#house .hbar .ffbar button.snd:disabled{opacity:.55;cursor:default}' +
      '.ffbar button.snd svg{width:18px;height:18px;flex:none}#house .hbar .ffbar button.snd.ic,#arcade.ff .ffbar button.snd.ic{width:32px;padding:0;justify-content:center}';
    document.head.appendChild(cs);
  }
  const hbar = body.parentElement && body.parentElement.querySelector('.hbar'), htitle = hbar && hbar.querySelector('#house-t'), hback = hbar && hbar.querySelector('#house-x');
  const touchOnly = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches);

  /* ---------- to the game: same origin only; queued until it says 'ready' (the last of each kind) ---------- */
  const toGame = m => {
    if (!frame) return;
    if (!ready) { queue = queue.filter(x => x.ty !== m.ty); queue.push(m); return; }
    try { frame.contentWindow.postMessage(m, location.origin); } catch (_) {}
  };
  const dropFrame = () => {
    if (frame) {
      /* 'leave' for the protocol; a message posted now would be dropped with the frame, so the game's own teardown (same
         origin) also runs right here: the GPU and the AudioContext are freed before the frame goes */
      try { frame.contentWindow.postMessage({ ty: 'leave' }, location.origin); } catch (_) {}
      try { const w = frame.contentWindow; if (w && w.__ff && typeof w.__ff.teardown === 'function') w.__ff.teardown(); } catch (_) {}
      if (unf) unf(); unf = null; frame.remove(); frame = null;
    }
    ready = false; queue = [];
  };
  /* ---------- the Sound and Music buttons (the header bar, else a row top right) ---------- */
  const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
  const NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15" r="2.5" fill="currentColor"/>';
  let icons = false;
  const showSnd = () => { if (!sndBtn) return; const w = silent ? 'Sound off (muted page)' : muted ? 'Sound off' : 'Sound on'; sndBtn.innerHTML = SPK + (muted || silent ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13"/>') + '</svg>' + (icons ? '' : ' ' + (muted || silent ? 'Sound off' : 'Sound on')); sndBtn.title = w; sndBtn.setAttribute('aria-label', w); sndBtn.setAttribute('aria-pressed', String(!muted && !silent)); sndBtn.classList.toggle('ic', icons); sndBtn.disabled = silent; };
  const showMus = () => { if (!musBtn) return; const w = music ? 'Music on' : 'Music off'; musBtn.innerHTML = NOTE + (music ? '' : '<path d="M3 3l18 18" stroke-width="2.4"/>') + '</svg>' + (icons ? '' : ' ' + w); musBtn.title = w + ' (the music and the ambience; the sound cues stay)' + (muted ? ' · all sound is off' : ''); musBtn.setAttribute('aria-label', w); musBtn.setAttribute('aria-pressed', String(music)); musBtn.style.opacity = muted || silent ? '.6' : ''; musBtn.classList.toggle('ic', icons); };
  const focusGame = () => { if (frame) try { frame.focus(); frame.contentWindow.focus(); } catch (_) {} };
  const place = () => { /* labels while the header has room, else icons */
    if (!bar) return; const was = icons; icons = false; showSnd(); showMus();
    if (hbar && htitle && hback) { const room = hbar.clientWidth - 24 - htitle.offsetWidth - hback.offsetWidth - 36; if (bar.scrollWidth > room) icons = true; bar.style.maxWidth = Math.max(0, room) + 'px'; }
    if (icons !== false || was) { showSnd(); showMus(); }
  };
  const makeBar = () => {
    bar = document.createElement('span'); bar.className = 'ffbar';
    if (hbar && htitle) htitle.after(bar); else el.appendChild(bar);
    sndBtn = document.createElement('button'); sndBtn.type = 'button'; sndBtn.className = 'snd';
    sndBtn.addEventListener('click', e => { e.stopPropagation(); if (silent) return; muted = !muted; store('planet-ff-mute', muted); showSnd(); showMus(); toGame({ ty: 'mute', on: muted }); setTimeout(focusGame, 0); });
    musBtn = document.createElement('button'); musBtn.type = 'button'; musBtn.className = 'snd';
    musBtn.addEventListener('click', e => { e.stopPropagation(); music = !music; store('planet-ff-music', music); showMus(); toGame({ ty: 'music', on: music }); setTimeout(focusGame, 0); });
    bar.append(sndBtn, musBtn); place();
  };
  addEventListener('resize', place);

  const menu = (msg, focus) => {
    dropFrame(); window.__duck = 0;
    const box = document.createElement('div'); box.className = 'ffm';
    box.innerHTML = '<h3>FAR FIELD</h3><p class="sub">A dark, quiet side-on puzzle adventure. A rabbit finds its own way along the foot of an enormous wall, at dusk, into the night.</p>' +
      '<p class="cn"><b>Content notice:</b> pursuit, capture and non-graphic violence towards the rabbit.</p>' +
      '<div class="row"><button type="button" data-a="play">Play</button></div>' +
      '<p class="msg">' + String((touchOnly ? 'Far Field needs a keyboard or a gamepad. ' : '') + (msg || '')).replace(/[<>&"]/g, '') + '</p>' +
      '<p class="fine">An original game made for the planet · keyboard or gamepad · about five minutes</p>';
    [...el.children].forEach(c => { if (c !== bar) c.remove(); }); el.insertBefore(box, el.firstChild);
    if (focus) { const b = box.querySelector('[data-a=play]'); try { if (b) b.focus({ preventScroll: true }); } catch (_) {} }
  };
  const play = () => {
    dropFrame(); window.__duck = 1;   /* the game has its own sound: the planet's music steps back */
    [...el.children].forEach(c => { if (c !== bar) c.remove(); });
    const f = frame = document.createElement('iframe'); f.className = 'tyframe'; f.title = 'Far Field'; f.src = 'farfield/index.html?v=3' + (silent ? '&mute=1' : ''); f.allow = 'autoplay; fullscreen; gamepad';
    el.insertBefore(f, el.firstChild);
    toGame({ ty: 'mute', on: muted || silent }); toGame({ ty: 'music', on: music });
    /* a frame only gets the keyboard once it has been clicked or focused */
    const coarse = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
    const cm = document.createElement('div'); cm.className = 'clickme'; cm.textContent = 'Click the game to play'; cm.hidden = coarse; el.appendChild(cm);
    f.addEventListener('load', () => setTimeout(focusGame, 200)); setTimeout(focusGame, 400);
    const onBlur = () => { if (document.activeElement === f) cm.hidden = true; }, onFocus = () => { if (f.isConnected && !coarse) cm.hidden = false; };
    addEventListener('blur', onBlur); addEventListener('focus', onFocus);
    const t = setTimeout(() => { if (document.activeElement === f) cm.hidden = true; }, 900);
    unf = () => { removeEventListener('blur', onBlur); removeEventListener('focus', onFocus); clearTimeout(t); cm.remove(); };
  };

  /* ---------- from the game ---------- */
  const onFrame = e => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.ty === 'ready') { if (!ready) { ready = true; const q = queue; queue = []; for (const x of q) toGame(x); } }
    else if (m.ty === 'mute') { if (silent) return; muted = !!m.on; store('planet-ff-mute', muted); showSnd(); showMus(); }
    else if (m.ty === 'music') { music = !!m.on; store('planet-ff-music', music); showMus(); }
    else if (m.ty === 'exit') menu('', true);
  };
  addEventListener('message', onFrame);
  el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b && b.dataset.a === 'play') play(); });
  makeBar(); menu('');
  return () => {
    if (!alive) return; alive = false; window.__duck = 0;
    removeEventListener('message', onFrame); removeEventListener('resize', place);
    dropFrame(); if (bar) bar.remove(); bar = sndBtn = musBtn = null; el.remove();
    const cs = document.getElementById('ff-room-css'); if (cs) cs.remove();
  };
}
window.farfieldRoom = farfieldRoom;
