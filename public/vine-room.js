/* =====================================================================
   VINE LINE in the arcade (public/vine/: an original vine-growing game for one or two, all art and music made in code).
   Loaded after planet-dress.js and breeze-room.js. planet.html's game scope is closed, so enterHouse hands the room what it needs:
     else if(act.kind==='vine'&&window.vineRoom)houseStop=vineRoom(body,{duelFind,duelSend,duelCancel,duelLeave,DUEL,LIVE,MP,me:myName,musicOn});
   vineRoom(body, ctx): solo (and two on one keyboard, chosen on the game's title), or two players online. Online, the duel lobby
   pairs them; one negotiated WebRTC data channel 'u' carries the game's messages straight between the browsers, and the Ably room
   carries them while that channel is not up. The game is host-authoritative and runs on either path (SPEC-vine.md).
   The cabinet (the Orbit model by the entrance, with a VINE LINE marquee and screen) and its door are set in planet-dress.js.
   ===================================================================== */
'use strict';
function vineRoom(body, ctx) {
  ctx = ctx || {};
  const el = document.createElement('div'); el.id = 'arcade'; body.appendChild(el);
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }, MAXMSG = 6000, GW = 480, GH = 560;
  let frame = null, st = null, alive = true, ready = false, queue = [], muted = true, music = true, sndBtn = null, musBtn = null, low = 0, place = null;
  const esc_ = t => String(t).replace(/[<>&"]/g, ''), nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;
  const dSend = (n, d) => { try { if (ctx.duelSend) ctx.duelSend(n, d || {}); } catch (_) {} };
  const live = () => !!(ctx.LIVE && ctx.LIVE.on && ctx.LIVE.rt && ctx.duelFind);
  try { const v = localStorage.getItem('planet-vine-mute'); muted = v === null ? !ctx.musicOn : v === '1'; } catch (_) { muted = !ctx.musicOn; }
  try { music = localStorage.getItem('planet-vine-music') !== '0'; } catch (_) {} /* music on its own (the sound effects stay), default on */

  const dropFrame = () => { if (frame) { if (frame.__unf) frame.__unf(); frame.remove(); frame = null; } ready = false; queue = []; sndBtn = musBtn = null; low = 0; place = null; };
  const menu = msg => { dropFrame(); el.innerHTML = '<h3>VINE LINE</h3><p class="sub">Grow your vine, eat the berries, don’t bump the hedge. One player, two on one keyboard, or online.</p><div class="row"><button type="button" data-a="solo">Play</button><button type="button" class="alt" data-a="duo">Play with someone online</button></div><p class="msg">' + (msg || '') + '</p><p class="fine">An original game made for the planet · all art and music made in code</p>'; };
  const toast = (text, ms) => { const t = document.createElement('div'); t.className = 'role'; t.textContent = text; el.appendChild(t); setTimeout(() => t.remove(), ms || 6000); };

  /* ---------- to the game: same origin only; queued until it says 'ready' (the last of each kind, the last 8 'net') ---------- */
  const toGame = m => {
    if (!frame) return;
    if (!ready) { if (m.ty === 'net') { queue.push(m); let k = 0; for (let i = queue.length - 1; i >= 0; i--) if (queue[i].ty === 'net' && ++k > 8) queue.splice(i, 1); } else { queue = queue.filter(x => x.ty !== m.ty); queue.push(m); } return; }
    try { frame.contentWindow.postMessage(m, location.origin); } catch (_) {}
  };
  const linkMsg = () => ({ ty: 'link', role: st.host ? 'host' : 'guest', me: st.me, opp: st.opp, mode: st.mode, startIn: Math.max(0, st.startAt - (Date.now() + ((ctx.MP && ctx.MP.offset) || 0))) });
  const showTag = () => { if (st && st.tag) st.tag.textContent = 'with ' + st.opp + (st.mode === 'rtc' ? ' · direct link' : ' · relayed') + (st.rtt ? ' · ' + st.rtt + ' ms' : ''); if (place) place(); }; /* its width changes: placed again */
  const setMode = mode => { if (!st || st.mode === mode) return; st.mode = mode; showTag(); toGame(linkMsg()); console.log('[vine net] ' + mode); };

  const play = q => {
    window.__duck = 1; /* the game has its own music */
    dropFrame(); el.innerHTML = '';
    frame = document.createElement('iframe'); frame.className = 'tyframe'; frame.title = 'Vine Line'; frame.src = 'vine/index.html?v=1' + (q || ''); frame.allow = 'autoplay; fullscreen'; el.appendChild(frame);
    if (st) { const tag = document.createElement('div'); tag.className = 'net'; st.tag = tag; el.appendChild(tag); showTag(); }
    const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
    const btn = sndBtn = document.createElement('button'); btn.type = 'button'; btn.className = 'snd';
    btn.__show = post => { const w = muted ? 'Sound off' : 'Sound on'; btn.innerHTML = SPK + (muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13"/>') + '</svg>' + (low === 2 ? '' : ' ' + w); btn.title = w; btn.setAttribute('aria-label', w); btn.setAttribute('aria-pressed', String(!muted)); if (post) toGame({ ty: 'mute', on: muted }); };
    btn.addEventListener('click', e => { e.stopPropagation(); muted = !muted; try { localStorage.setItem('planet-vine-mute', muted ? '1' : '0'); } catch (_) {} btn.__show(true); if (musBtn) musBtn.__show(false); setTimeout(foc, 0); });
    el.appendChild(btn); btn.__show(true); /* the game's sound on or off, remembered; the keyboard goes straight back to the game */
    const mb = musBtn = document.createElement('button'); mb.type = 'button'; mb.className = 'snd';
    mb.__show = post => { const w = music ? 'Music on' : 'Music off'; mb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 17V5l10-2v12"/><circle cx="6.5" cy="17" r="2.5" fill="currentColor"/><circle cx="16.5" cy="15" r="2.5" fill="currentColor"/>' + (music ? '' : '<path d="M3 3l18 18" stroke-width="2.4"/>') + '</svg>' + (low === 2 ? '' : ' ' + w);
      mb.title = w + (muted ? ' (all sound is off)' : ''); mb.setAttribute('aria-label', w); mb.setAttribute('aria-pressed', String(music)); mb.style.opacity = muted ? '.6' : ''; if (post) toGame({ ty: 'music', on: music }); if (place) place(); };
    mb.addEventListener('click', e => { e.stopPropagation(); music = !music; try { localStorage.setItem('planet-vine-music', music ? '1' : '0'); } catch (_) {} mb.__show(true); setTimeout(foc, 0); });
    el.appendChild(mb); mb.__show(true); /* music only: the sound effects stay (dimmed while all sound is off) */
    const coarse = matchMedia('(pointer:coarse)').matches;
    const pl = place = () => { /* keep the buttons and the tag off the 480x560 board and its HUD strip (the strip is at the bottom, the hedge round the top).
                       The game's layout (vine/game.js): scaled by S to fit, centred; a phone in portrait (coarse, 150+ spare units below) gets a
                       D-pad band under the board (up to 880 units tall in all, the pad in its middle). Side letterbox wide enough (low 0): the
                       two buttons stacked top left, the tag top right. A top letterbox band tall enough (low 1): the buttons in a row in it, the
                       tag at its right if it fits. Otherwise small icons (low 2): bottom left beside the D-pad when there is one, else over the
                       hedge's top left corner; the tag top right */
      if (frame !== f || !musBtn) return; const w = f.clientWidth, h = f.clientHeight, S = Math.min(w / GW, h / GH), pad = coarse && h / S - GH >= 150;
      const LH = pad ? Math.min(h / S, GH + 320) : GH, band = (h - LH * S) / 2, lo = (w - GW * S) / 2 >= 134 ? 0 : band >= 44 ? 1 : 2, was = low; low = lo;
      if (lo !== was) { btn.__show(false); mb.__show(false); return; } /* labels change with low: show() measures again and calls back here */
      const bh = btn.offsetHeight || 30, ty = lo === 1 ? Math.max(4, (band - bh) / 2) : 4, at = lo === 2 && pad ? { top: 'auto', bottom: band + 6 + 'px' } : { top: ty + 'px', bottom: 'auto' };
      Object.assign(btn.style, lo ? Object.assign({ left: lo === 1 ? '10px' : '4px', padding: lo === 1 ? '' : '4px' }, at) : { top: '', bottom: '', left: '', padding: '' });
      const bw = btn.offsetWidth || 100, mx = (lo === 1 ? 10 : 4) + bw + (lo === 1 ? 6 : 4);
      Object.assign(mb.style, lo ? Object.assign({ left: mx + 'px', padding: lo === 1 ? '' : '4px' }, at) : { top: 8 + bh + 6 + 'px', bottom: '', left: '', padding: '' });
      const tag = st && st.tag; if (!tag) return;
      if (!lo) { Object.assign(tag.style, { top: '', bottom: '', left: '', right: '', fontSize: '', padding: '', background: '', borderRadius: '' }); return; }
      Object.assign(tag.style, { top: (lo === 1 ? Math.max(2, (band - tag.offsetHeight) / 2) : 4) + 'px', bottom: 'auto', left: '', right: lo === 1 ? '10px' : '4px', fontSize: lo === 1 ? '' : '12px', padding: '2px 8px', background: 'rgba(13,11,22,.8)', borderRadius: '6px' });
      if (lo === 1 && mx + (mb.offsetWidth || 100) + 8 + tag.offsetWidth > w - 10) Object.assign(tag.style, { top: 'auto', bottom: Math.max(2, (band - tag.offsetHeight) / 2) + 'px' }); /* no room beside the buttons: the bottom letterbox band */
    };
    const cm = document.createElement('div'); cm.className = 'clickme'; cm.textContent = 'Click the game to play'; cm.hidden = coarse; el.appendChild(cm); /* a frame only gets the keyboard once it has been clicked (or focused) */
    const f = frame, foc = () => { try { f.focus(); f.contentWindow.focus(); } catch (_) {} };
    f.addEventListener('load', () => setTimeout(foc, 200)); setTimeout(foc, 400);
    const onBlur = () => { if (document.activeElement === f) cm.hidden = true; }, onFocus = () => { if (f.isConnected && !coarse) cm.hidden = false; };
    addEventListener('blur', onBlur); addEventListener('focus', onFocus); addEventListener('resize', pl); pl();
    if (st) toast(st.host ? 'You are Sprig, the green vine. ' + st.opp + ' grows Marigold.' : 'You are Marigold, the orange vine. ' + st.opp + ' grows Sprig.', 9000);
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
    else if (m.ty === 'mute') { muted = !!m.on; try { localStorage.setItem('planet-vine-mute', muted ? '1' : '0'); } catch (_) {} if (sndBtn) sndBtn.__show(false); if (musBtn) musBtn.__show(false); }
    else if (m.ty === 'music') { music = !!m.on; try { localStorage.setItem('planet-vine-music', music ? '1' : '0'); } catch (_) {} if (musBtn) musBtn.__show(false); } /* N or the title chip in the game */
    else if (m.ty === 'leave') { if (st) { dSend('bye'); endLink(); } } /* the game ended the online match itself and plays on alone: keep the frame */
    else if (m.ty === 'exit') { if (st) { dSend('bye'); endLink(); } menu('Thanks for playing.'); }
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
    if (s.tag) s.tag.remove();
    try { if (ctx.duelLeave) ctx.duelLeave(); } catch (_) {}
  };
  const onBye = () => { if (!st) return; const who = st.opp; toGame({ ty: 'peer', left: true }); endLink(); if (frame) toast(who + ' left. You can play on your own.'); else menu(who + ' left.'); };
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
    st = { host: !!m.host, opp: esc_(nm(m.oppName, 'someone')), me: nm(ctx.me, 'Player'), mode: 'ably', startAt: +m.startAt || Date.now(), pc: null, dc: null, iceQ: [], remote: false, offered: false, remoteSdp: '', heard: false, peerHi: false, rtt: 0, tag: null, joinT: 0 };
    const s0 = st;
    addEventListener('pagehide', onHide, true);
    play(''); /* the game opens at once and counts down to the start on the relay; the direct link takes over when it opens */
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
    /* counted from the start: the host gives up on a guest it never heard from, the guest on a host whose game never sent */
    s0.joinT = setTimeout(() => { if (st !== s0 || s0.heard) return; const who = s0.opp; toGame({ ty: 'peer', left: true }); dSend('bye'); endLink(); toast(s0.host ? who + ' couldn’t join. You can play on your own.' : who + ' couldn’t start. You can play on your own.'); }, linkMsg().startIn + (s0.host ? 10000 : 15000));
  };
  const duo = () => {
    if (!live()) { menu('Online play needs the live connection, and it is not up right now. Try again in a moment.'); return; }
    el.innerHTML = '<h3>VINE LINE</h3><p class="sub">Looking for someone to play with…</p><p class="msg">Anyone who picks “Play with someone online” at the Vine Line cabinet will be paired with you. You grow on the same garden plot.</p><div class="row"><button type="button" class="alt" data-a="cancel">Stop looking</button></div>';
    let ok = false; try { ok = ctx.duelFind('vine', link, onNet); } catch (_) {}
    if (!ok) menu('Online play is not available right now.');
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; if (a === 'solo') play(''); else if (a === 'duo') duo(); else if (a === 'cancel') { try { ctx.duelLeave && ctx.duelLeave(); } catch (_) {} menu(''); } });
  menu('');
  return () => { alive = false; window.__duck = 0; removeEventListener('message', onFrame); if (st) { try { if (st.dc && st.dc.readyState === 'open') st.dc.send('{"k":"bye"}'); } catch (_) {} dSend('bye'); } endLink(); dropFrame(); try { ctx.duelCancel && ctx.duelCancel(); } catch (_) {} };
}
window.vineRoom = vineRoom;
