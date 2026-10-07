/* =====================================================================
   ROOTLIGHT in the arcade (public/rootlight/: an original exploration platformer under the roots for one or two, all art and
   music made in code). Modelled on kart-room.js. planet.html's game scope is closed, so enterHouse hands the room what it needs:
     else if(act.kind==='rootlight'&&window.rootlightRoom)houseStop=rootlightRoom(body,{duelFind,duelSend,duelCancel,duelLeave,DUEL,LIVE,MP,me:myName,musicOn});
   rootlightRoom(body, ctx): solo (or two on one keyboard / two pads, chosen on the game's title), or two players online. Online,
   the duel lobby pairs them; one negotiated WebRTC data channel 'u' carries the game's messages straight between the browsers,
   and the Ably room carries them while that channel is not up. The host runs the world (glooms, guardians, doors, pickups),
   each player moves their own sprout; either path works. The cabinet is not chosen yet (the lead wires it in planet-dress.js).
   The Sound and Music buttons and the online tag never sit on the game (its page fills the frame, HUD to the edges): they go in
   the house's header bar beside its title, and on a phone held upright, when the header is too narrow, the tag goes to the top
   right of the game's control band. While the game runs, it says who left or never came (net.js); the room speaks only without it.
   ===================================================================== */
'use strict';
function rootlightRoom(body, ctx) {
  ctx = ctx || {};
  const el = document.createElement('div'); el.id = 'arcade'; body.appendChild(el);
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }, MAXMSG = 6000;
  let frame = null, st = null, alive = true, ready = false, queue = [], muted = true, music = true, sndBtn = null, musBtn = null, icons = false, place = null, bar = null, toastEl = null, toastT = 0;
  const esc_ = t => String(t).replace(/[<>&"]/g, ''), nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;
  const dSend = (n, d) => { try { if (ctx.duelSend) ctx.duelSend(n, d || {}); } catch (_) {} };
  const live = () => !!(ctx.LIVE && ctx.LIVE.on && ctx.LIVE.rt && ctx.duelFind);
  try { const v = localStorage.getItem('planet-root-mute'); muted = v === null ? !ctx.musicOn : v === '1'; } catch (_) { muted = !ctx.musicOn; }
  try { music = localStorage.getItem('planet-root-music') !== '0'; } catch (_) {} /* music on its own (the sound effects stay), default on */
  /* the header bar's look for our buttons and tag (planet.html styles '#arcade .snd'; these live outside #arcade) */
  if (!document.getElementById('root-room-css')) {
    const cs = document.createElement('style'); cs.id = 'root-room-css';
    cs.textContent = '#house .hbar .kbar{display:inline-flex;align-items:center;gap:6px;min-width:0;flex:0 1 auto;overflow:hidden;font-family:var(--hand)}' +
      '#house .hbar .kbar button.snd{position:static;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;margin:0;font-family:var(--hand);font-size:16px;line-height:1;background:rgba(13,11,22,.8);color:#f3efe4;border:1px solid #4a4060;border-radius:6px;cursor:pointer;box-shadow:none;white-space:nowrap;flex:none}' +
      '#house .hbar .kbar button.snd.ic{width:32px;padding:0;justify-content:center}#house .hbar .kbar button.snd svg{width:18px;height:18px;flex:none}' +
      '#house .hbar .kbar .ktag{font-size:15px;color:#9fe0a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;padding-left:4px}' +
      '#arcade .kbar{display:inline-flex;gap:6px}#arcade .kbar button.snd{position:static}#arcade .net.kband{font-size:12px;padding:2px 8px;background:rgba(13,11,22,.8);border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
    document.head.appendChild(cs);
  }
  const hbar = body.parentElement && body.parentElement.querySelector('.hbar'), htitle = hbar && hbar.querySelector('#house-t'), hback = hbar && hbar.querySelector('#house-x');

  const dropFrame = () => { if (frame) { if (frame.__unf) frame.__unf(); frame.remove(); frame = null; } if (bar) { bar.remove(); bar = null; } ready = false; queue = []; sndBtn = musBtn = null; icons = false; place = null; };
  const menu = (msg, focus) => {
    dropFrame(); el.innerHTML = '<h3>ROOTLIGHT</h3><p class="sub">Climb down through the roots and bloom the gloom back into flowers. One player, two together, or online.</p><div class="row"><button type="button" data-a="solo">Play</button><button type="button" class="alt" data-a="duo">Play with someone online</button></div><p class="msg">' + (msg || '') + '</p><p class="fine">An original game made for the planet · all art and music made in code</p>';
    if (focus) { const b = el.querySelector('[data-a=solo]'); try { if (b) b.focus({ preventScroll: true }); } catch (_) {} } /* after leaving the game: Enter plays again, Tab reaches the other button (the frame took the focus with it) */
  };
  /* one note at a time: a new one replaces the last */
  const toast = (text, ms) => { if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'role'; } toastEl.textContent = text; el.appendChild(toastEl); clearTimeout(toastT); const t = toastEl; toastT = setTimeout(() => t.remove(), ms || 6000); };

  /* ---------- to the game: same origin only; queued until it says 'ready' (the last of each kind, the last 8 'net') ---------- */
  const toGame = m => {
    if (!frame) return;
    if (!ready) { if (m.ty === 'net') { queue.push(m); let k = 0; for (let i = queue.length - 1; i >= 0; i--) if (queue[i].ty === 'net' && ++k > 8) queue.splice(i, 1); } else { queue = queue.filter(x => x.ty !== m.ty); queue.push(m); } return; }
    try { frame.contentWindow.postMessage(m, location.origin); } catch (_) {}
  };
  const linkMsg = () => ({ ty: 'link', role: st.host ? 'host' : 'guest', me: st.me, opp: st.opp, mode: st.mode, startIn: Math.max(0, st.startAt - (Date.now() + ((ctx.MP && ctx.MP.offset) || 0))) });
  /* the tag: who you are playing, the link and its round trip; the long form in a roomy header, 'Bob · direct · 85 ms' elsewhere */
  const tagText = (s, short) => (short ? s.opp : 'with ' + s.opp) + (s.mode === 'rtc' ? (short ? ' · direct' : ' · direct link') : ' · relayed') + (s.rtt ? ' · ' + s.rtt + ' ms' : '');
  const showTag = () => {
    if (!st) return;
    if (st.tag) { st.tag.textContent = tagText(st, true); st.tag.title = tagText(st, false); }
    if (st.htag) { st.htag.textContent = tagText(st, st.htag.__short); st.htag.title = tagText(st, false); }
    if (place) place();
  };
  const setMode = mode => { if (!st || st.mode === mode) return; st.mode = mode; showTag(); toGame(linkMsg()); console.log('[rootlight net] ' + mode); };

  const play = q => {
    window.__duck = 1; /* the game has its own music */
    dropFrame(); el.innerHTML = '';
    frame = document.createElement('iframe'); frame.className = 'tyframe'; frame.title = 'Rootlight'; frame.src = 'rootlight/index.html?v=3' + (q || ''); frame.allow = 'autoplay; fullscreen'; el.appendChild(frame);
    /* online: '#arcade .net' stays in the room while a match is on (planet.html's Esc rule looks for it); it shows only on an upright phone */
    if (st) { const tag = document.createElement('div'); tag.className = 'net kband'; tag.hidden = true; st.tag = tag; el.appendChild(tag); }
    bar = document.createElement('span'); bar.className = 'kbar';
    if (hbar && htitle) htitle.after(bar); else { bar.style.cssText = 'position:absolute;left:50%;top:6px;transform:translateX(-50%);z-index:4'; el.appendChild(bar); } /* no header (a test page): a row at the top */
    const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
    const btn = sndBtn = document.createElement('button'); btn.type = 'button'; btn.className = 'snd';
    btn.__show = post => { const w = muted ? 'Sound off' : 'Sound on'; btn.innerHTML = SPK + (muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13"/>') + '</svg>' + (icons ? '' : ' ' + w); btn.classList.toggle('ic', icons); btn.title = w; btn.setAttribute('aria-label', w); btn.setAttribute('aria-pressed', String(!muted)); if (post) toGame({ ty: 'mute', on: muted }); };
    btn.addEventListener('click', e => { e.stopPropagation(); muted = !muted; try { localStorage.setItem('planet-root-mute', muted ? '1' : '0'); } catch (_) {} btn.__show(true); if (musBtn) musBtn.__show(false); setTimeout(foc, 0); });
    bar.appendChild(btn); btn.__show(true); /* the game's sound on or off, remembered; the keyboard goes straight back to the game */
    const mb = musBtn = document.createElement('button'); mb.type = 'button'; mb.className = 'snd';
    mb.__show = post => { const w = music ? 'Music on' : 'Music off'; mb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15" r="2.5" fill="currentColor"/>' + (music ? '' : '<path d="M3 3l18 18" stroke-width="2.4"/>') + '</svg>' + (icons ? '' : ' ' + w);
      mb.classList.toggle('ic', icons); mb.title = w + (muted ? ' (all sound is off)' : ''); mb.setAttribute('aria-label', w); mb.setAttribute('aria-pressed', String(music)); mb.style.opacity = muted ? '.6' : ''; if (post) toGame({ ty: 'music', on: music }); };
    mb.addEventListener('click', e => { e.stopPropagation(); music = !music; try { localStorage.setItem('planet-root-music', music ? '1' : '0'); } catch (_) {} mb.__show(true); setTimeout(foc, 0); });
    bar.appendChild(mb); mb.__show(true); /* music only: the sound effects stay (dimmed while all sound is off) */
    if (st) { const ht = document.createElement('span'); ht.className = 'ktag'; st.htag = ht; bar.appendChild(ht); }
    const coarse = matchMedia('(pointer:coarse)').matches;
    const pl = place = () => { /* labels while the header has room for them, else icons; the tag in the header if it fits (long, then short form), else in the frame */
      if (frame !== f || !musBtn || !bar) return;
      const s = st, ht = s && s.htag, room = () => !hbar || !hback || !htitle ? 1e9 : hbar.clientWidth - 24 - htitle.offsetWidth - hback.offsetWidth - 30 - 6;
      const fits = () => btn.offsetWidth + 6 + mb.offsetWidth + (ht && !ht.hidden ? 6 + ht.scrollWidth + 4 : 0) <= room();   /* natural widths (the tag would shrink to fit, cut to nothing) */
      const set = (ic, tagIn, short) => { if (icons !== ic) { icons = ic; btn.__show(false); mb.__show(false); } if (ht) { ht.hidden = !tagIn; ht.__short = short; ht.textContent = tagText(s, short); } if (s && s.tag) s.tag.hidden = tagIn; };
      let ok = false;
      for (const [ic, tagIn, short] of [[false, true, false], [true, true, false], [true, true, true], [false, false, false], [true, false, false]]) { if (!s && tagIn) continue; set(ic, tagIn, short); if (fits()) { ok = true; break; } }
      if (!ok) set(true, false, false);
      bar.style.maxWidth = hbar ? Math.max(0, room()) + 'px' : '';
      const tag = s && s.tag; if (!tag || tag.hidden) return;
      /* the tag in the frame: a phone held upright gets the game's control band (main.js layout(): a 640 x 360 view over a band),
         at its top right, clear of the map and pause buttons in its middle; elsewhere a small pill top centre */
      const w = f.clientWidth, h = f.clientHeight;
      if (coarse && h / w > 1.15) {
        const LH = Math.max(560, Math.round(640 * h / w)), VH = 360, S = Math.min(w / 640, h / LH), OX = (w - 640 * S) / 2, OY = (h - LH * S) / 2;
        Object.assign(tag.style, { left: 'auto', right: OX + 8 + 'px', top: OY + VH * S + 10 + 'px', transform: '', maxWidth: Math.max(60, (640 / 2 - 80) * S - 16) + 'px' });
      } else Object.assign(tag.style, { left: '50%', right: 'auto', top: '4px', transform: 'translateX(-50%)', maxWidth: '40%' });
    };
    const cm = document.createElement('div'); cm.className = 'clickme'; cm.textContent = 'Click the game to play'; cm.hidden = coarse; el.appendChild(cm); /* a frame only gets the keyboard once it has been clicked (or focused) */
    const f = frame, foc = () => { try { f.focus(); f.contentWindow.focus(); } catch (_) {} };
    f.addEventListener('load', () => setTimeout(foc, 200)); setTimeout(foc, 400);
    const onBlur = () => { if (document.activeElement === f) cm.hidden = true; }, onFocus = () => { if (f.isConnected && !coarse) cm.hidden = false; };
    addEventListener('blur', onBlur); addEventListener('focus', onFocus); addEventListener('resize', pl); showTag(); pl();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (frame === f) pl(); }); /* the hand font changes the widths */
    f.__unf = () => { removeEventListener('blur', onBlur); removeEventListener('focus', onFocus); removeEventListener('resize', pl); };
    setTimeout(() => { if (document.activeElement === f) cm.hidden = true; }, 900);
  };

  /* ---------- from the game ---------- */
  const onFrame = e => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.ty === 'ready') { if (st) toGame(linkMsg()); if (!ready) { ready = true; const q = queue; queue = []; q.sort((x, y) => (x.ty === 'net') - (y.ty === 'net')); for (const x of q) toGame(x); } } /* the link first: the game ignores 'net' until it is linked */
    else if (m.ty === 'net') { if (st && typeof m.d === 'string' && m.d.length <= MAXMSG) send(m.d); }
    else if (m.ty === 'rtt') { if (st) { st.rtt = Math.max(0, Math.min(9999, m.ms | 0)); showTag(); } }
    else if (m.ty === 'mute') { muted = !!m.on; try { localStorage.setItem('planet-root-mute', muted ? '1' : '0'); } catch (_) {} if (sndBtn) sndBtn.__show(false); if (musBtn) musBtn.__show(false); }
    else if (m.ty === 'music') { music = !!m.on; try { localStorage.setItem('planet-root-music', music ? '1' : '0'); } catch (_) {} if (musBtn) musBtn.__show(false); } /* N or the title chip in the game */
    else if (m.ty === 'leave') { if (st) { dSend('bye'); endLink(); } } /* the game ended the online match itself and plays on alone: keep the frame */
    else if (m.ty === 'exit') { if (st) { dSend('bye'); endLink(); } menu('Thanks for playing.', true); }
  };
  addEventListener('message', onFrame);

  /* ---------- the link ---------- */
  const send = d => {
    const dc = st.dc;
    if (st.mode === 'rtc' && dc && dc.readyState === 'open' && dc.bufferedAmount < 4096) { try { dc.send(d); return; } catch (_) {} }
    dSend('u', { d });
  };
  const heard = () => { if (st && !st.heard) { st.heard = true; clearTimeout(st.joinT); } };
  const onHide = e => { if (e.persisted || !st) return; try { if (st.dc && st.dc.readyState === 'open') st.dc.send('{"k":"bye"}'); } catch (_) {} dSend('bye'); }; /* closing the tab: tell the other player now, not after 30 s of silence */
  const endLink = () => {
    if (!st) return; const s = st; st = null;
    clearTimeout(s.joinT); removeEventListener('pagehide', onHide, true);
    try { if (s.dc) s.dc.close(); } catch (_) {} try { if (s.pc) s.pc.close(); } catch (_) {}
    if (s.tag) s.tag.remove(); if (s.htag) s.htag.remove(); if (place) place();
    try { if (ctx.duelLeave) ctx.duelLeave(); } catch (_) {}
  };
  /* the other player left (or never came): a game that is up says so itself (net.js), so the room only speaks when it is not */
  const onBye = () => { if (!st) return; const who = st.opp, up = !!frame && ready; toGame({ ty: 'peer', left: true }); endLink(); if (frame && !up) toast(who + ' left. You can play on your own.'); else if (!frame) menu(who + ' left.'); };
  const fromDc = d => { if (typeof d !== 'string') return; if (d === '{"k":"bye"}') { onBye(); return; } if (d.length <= MAXMSG) { heard(); toGame({ ty: 'net', d }); } };
  const flushIce = () => { const pc = st.pc; for (const c of st.iceQ) pc.addIceCandidate(c).catch(() => {}); st.iceQ = []; };
  const offer = () => { /* host: only once the guest has said hi (it is listening); again on a later hi while still unanswered */
    const s0 = st, pc = s0 && s0.pc; if (!pc) return;
    if (!s0.offered) { s0.offered = true; pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => { if (st === s0) dSend('sdp', { d: pc.localDescription.toJSON() }); }).catch(() => { s0.offered = false; }); }
    else if (pc.signalingState !== 'stable' && pc.localDescription) dSend('sdp', { d: pc.localDescription.toJSON() });
  };
  const onSdp = d => {
    const s0 = st, pc = s0.pc, x = d && d.d; if (!pc || !x || typeof x.sdp !== 'string' || x.sdp.length > 20000) return;
    if (s0.host) { if (x.type === 'answer' && pc.signalingState === 'have-local-offer') pc.setRemoteDescription({ type: 'answer', sdp: x.sdp }).then(() => { s0.remote = true; flushIce(); }).catch(() => {}); return; }
    if (x.type !== 'offer') return;
    if (s0.remoteSdp === x.sdp) { if (pc.localDescription && pc.localDescription.type === 'answer') dSend('sdp', { d: pc.localDescription.toJSON() }); return; } /* the same offer again: our answer was lost */
    s0.remoteSdp = x.sdp;
    pc.setRemoteDescription({ type: 'offer', sdp: x.sdp }).then(() => { s0.remote = true; flushIce(); return pc.createAnswer(); }).then(a => pc.setLocalDescription(a)).then(() => { if (st === s0) dSend('sdp', { d: pc.localDescription.toJSON() }); }).catch(() => {});
  };
  const onNet = (name, d) => {
    if (!st || !d || typeof d !== 'object') return;
    if (st.host && name !== 'bye') heard(); /* host: any word from the guest's side means it came (its game may still be loading or in a hidden tab: a silent guest is a ghost) */
    if (name === 'u') { if (typeof d.d === 'string' && d.d.length <= MAXMSG) { heard(); toGame({ ty: 'net', d: d.d }); } }
    else if (name === 'hi') { st.peerHi = true; if (!d.ack) dSend('hi', { v: 1, ack: 1 }); if (st.host) offer(); }
    else if (name === 'sdp') onSdp(d);
    else if (name === 'ice') { const c = d.c; if (!st.pc || !c || typeof c !== 'object' || typeof c.candidate !== 'string' || c.candidate.length > 1000) return; if (st.remote) st.pc.addIceCandidate(c).catch(() => {}); else if (st.iceQ.length < 60) st.iceQ.push(c); }
    else if (name === 'bye') onBye();
  };
  const link = m => {
    if (!alive) return;
    st = { host: !!m.host, opp: esc_(nm(m.oppName, 'someone')), me: nm(ctx.me, 'Player'), mode: 'ably', startAt: +m.startAt || Date.now(), pc: null, dc: null, iceQ: [], remote: false, offered: false, remoteSdp: '', heard: false, peerHi: false, rtt: 0, tag: null, htag: null, joinT: 0 };
    const s0 = st;
    addEventListener('pagehide', onHide, true);
    play(''); /* the game opens at once on the relay; the direct link takes over when it opens. It shows who plays which sprout itself */
    let pc = null; try { pc = new RTCPeerConnection(ICE); } catch (_) {}
    s0.pc = pc;
    if (pc) {
      let dc = null; try { dc = pc.createDataChannel('u', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 }); } catch (_) {}
      s0.dc = dc;
      if (dc) { dc.onopen = () => { if (st === s0) setMode('rtc'); }; dc.onclose = () => { if (st === s0) setMode('ably'); }; dc.onmessage = e => { if (st === s0) fromDc(e.data); }; }
      pc.onicecandidate = e => { if (e.candidate && st === s0) dSend('ice', { c: e.candidate.toJSON() }); };
      pc.onconnectionstatechange = () => { if (st !== s0) return; const c = pc.connectionState; if (c === 'disconnected' || c === 'failed') setMode('ably'); else if (c === 'connected' && dc && dc.readyState === 'open') setMode('rtc'); };
    }
    const room = ctx.DUEL && ctx.DUEL.room; /* attach first, then hi: Ably drops what is published to a channel before we listen on it */
    Promise.resolve().then(() => room && room.attach ? room.attach() : null).catch(() => {}).then(() => { if (st === s0) dSend('hi', { v: 1 }); });
    /* counted from the start: the host gives up on a guest it never heard from, the guest on a host whose game never sent (the game says so) */
    s0.joinT = setTimeout(() => { if (st !== s0 || s0.heard) return; const who = s0.opp, up = !!frame && ready; toGame({ ty: 'peer', left: true }); dSend('bye'); endLink(); if (!up) toast(s0.host ? who + ' couldn’t join. You can play on your own.' : who + ' couldn’t start. You can play on your own.'); }, linkMsg().startIn + (s0.host ? 10000 : 15000));
  };
  const duo = () => {
    if (!live()) { menu('Online play needs the live connection, and it is not up right now. Try again in a moment.'); return; }
    dropFrame(); el.innerHTML = '<h3>ROOTLIGHT</h3><p class="sub">Looking for someone to play with…</p><p class="msg">Anyone who picks “Play with someone online” at the Rootlight cabinet will be paired with you. You explore the same roots together.</p><div class="row"><button type="button" class="alt" data-a="cancel">Stop looking</button></div>';
    let ok = false; try { ok = ctx.duelFind('rootlight', link, onNet); } catch (_) {}
    if (!ok) menu('Online play is not available right now.');
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; if (a === 'solo') play(''); else if (a === 'duo') duo(); else if (a === 'cancel') { try { ctx.duelLeave && ctx.duelLeave(); } catch (_) {} menu('', true); } });
  menu('');
  return () => { alive = false; window.__duck = 0; removeEventListener('message', onFrame); clearTimeout(toastT); if (st) { try { if (st.dc && st.dc.readyState === 'open') st.dc.send('{"k":"bye"}'); } catch (_) {} dSend('bye'); } endLink(); dropFrame(); const cs = document.getElementById('root-room-css'); if (cs) cs.remove(); try { ctx.duelCancel && ctx.duelCancel(); } catch (_) {} };
}
window.rootlightRoom = rootlightRoom;
