/* =====================================================================
   BERRY BREEZE in the arcade (public/breeze/: an original cute co-op sky shooter, all art and music made in code).
   Loaded after planet-dress.js. planet.html's game scope is closed, so enterHouse hands the room what it needs:
     else if(act.kind==='breeze'&&window.breezeRoom)houseStop=breezeRoom(body,{duelFind,duelSend,duelCancel,duelLeave,DUEL,LIVE,MP,me:myName,musicOn});
   1. breezeRoom(body, ctx): solo (and two on one keyboard), or two players online. Online, the duel lobby pairs them; one
      negotiated WebRTC data channel 'u' carries the game's messages straight between the browsers, and the Ably room
      carries them while that channel is not up. The game is host-authoritative and runs on either path (SPEC.md 6, 7).
   2. The arcade's cabinets on the right-hand side become Berry Breeze (screen, marquee, door); the left stay Tyrian.
   ===================================================================== */
'use strict';
function breezeRoom(body, ctx) {
  ctx = ctx || {};
  const el = document.createElement('div'); el.id = 'arcade'; body.appendChild(el);
  const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }, MAXMSG = 6000;
  let frame = null, st = null, alive = true, ready = false, queue = [], muted = true, sndBtn = null, low = 0;
  const esc_ = t => String(t).replace(/[<>&"]/g, ''), nm = (s, d) => String(s || '').replace(/[^\w \-'.]/g, '').slice(0, 16) || d;
  const dSend = (n, d) => { try { if (ctx.duelSend) ctx.duelSend(n, d || {}); } catch (_) {} };
  const live = () => !!(ctx.LIVE && ctx.LIVE.on && ctx.LIVE.rt && ctx.duelFind);
  try { const v = localStorage.getItem('planet-breeze-mute'); muted = v === null ? !ctx.musicOn : v === '1'; } catch (_) { muted = !ctx.musicOn; }

  const dropFrame = () => { if (frame) { if (frame.__unf) frame.__unf(); frame.remove(); frame = null; } ready = false; queue = []; sndBtn = null; low = 0; };
  const menu = msg => { dropFrame(); el.innerHTML = '<h3>BERRY BREEZE</h3><p class="sub">A cheerful sky shooter for one or two. W A S D or arrows to fly, it shoots by itself, hold SPACE for a sun seed. Two on one keyboard: start, then the second player holds ENTER.</p><div class="row"><button type="button" data-a="solo">Play</button><button type="button" class="alt" data-a="duo">Play with someone online</button></div><p class="msg">' + (msg || '') + '</p><p class="fine">An original game made for the planet · all art and music made in code</p>'; };
  const toast = (text, ms) => { const t = document.createElement('div'); t.className = 'role'; t.textContent = text; if (low === 1) t.style.bottom = '54px'; el.appendChild(t); setTimeout(() => t.remove(), ms || 6000); };

  /* ---------- to the game: same origin only; queued until it says 'ready' (the last of each kind, the last 8 'net') ---------- */
  const toGame = m => {
    if (!frame) return;
    if (!ready) { if (m.ty === 'net') { queue.push(m); let k = 0; for (let i = queue.length - 1; i >= 0; i--) if (queue[i].ty === 'net' && ++k > 8) queue.splice(i, 1); } else { queue = queue.filter(x => x.ty !== m.ty); queue.push(m); } return; }
    try { frame.contentWindow.postMessage(m, location.origin); } catch (_) {}
  };
  const linkMsg = () => ({ ty: 'link', role: st.host ? 'host' : 'guest', me: st.me, opp: st.opp, mode: st.mode, startIn: Math.max(0, st.startAt - (Date.now() + ((ctx.MP && ctx.MP.offset) || 0))) });
  const showTag = () => { if (st && st.tag) st.tag.textContent = 'with ' + st.opp + (st.mode === 'rtc' ? ' · direct link' : ' · relayed') + (st.rtt ? ' · ' + st.rtt + ' ms' : ''); };
  const setMode = mode => { if (!st || st.mode === mode) return; st.mode = mode; showTag(); toGame(linkMsg()); console.log('[breeze net] ' + mode); };

  const play = q => {
    window.__duck = 1; /* the game has its own music */
    dropFrame(); el.innerHTML = '';
    frame = document.createElement('iframe'); frame.className = 'tyframe'; frame.title = 'Berry Breeze'; frame.src = 'breeze/index.html?v=1' + (q || ''); frame.allow = 'autoplay; fullscreen'; el.appendChild(frame);
    if (st) { const tag = document.createElement('div'); tag.className = 'net'; st.tag = tag; el.appendChild(tag); showTag(); }
    const SPK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>';
    const btn = sndBtn = document.createElement('button'); btn.type = 'button'; btn.className = 'snd';
    btn.__show = post => { const w = muted ? 'Sound off' : 'Sound on'; btn.innerHTML = SPK + (muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 8.5a5 5 0 0 1 0 7M19.5 5.5a9 9 0 0 1 0 13"/>') + '</svg>' + (low === 2 ? '' : ' ' + w); btn.title = w; btn.setAttribute('aria-label', w); btn.setAttribute('aria-pressed', String(!muted)); if (post) toGame({ ty: 'mute', on: muted }); };
    btn.addEventListener('click', e => { e.stopPropagation(); muted = !muted; try { localStorage.setItem('planet-breeze-mute', muted ? '1' : '0'); } catch (_) {} btn.__show(true); setTimeout(foc, 0); });
    el.appendChild(btn); btn.__show(true); /* the game's sound on or off, remembered; the keyboard goes straight back to the game */
    const coarse = matchMedia('(pointer:coarse)').matches;
    const place = () => { /* keep the button and the tag off the game's HUD (its top 30 px): where the 240x320 field fills the width (a portrait phone),
                             they sit at the bottom, over the touch pad band or the letterbox (low 1), or as a small icon in the corner (low 2) */
      if (frame !== f) return; const w = f.clientWidth, h = f.clientHeight, S = Math.min(w / 240, h / 320), pad = coarse && w <= h && h - 320 * S >= 120;
      const lo = (w - 240 * S) / 2 >= 134 ? 0 : (pad ? h - 320 * S : (h - 320 * S) / 2) >= 44 ? 1 : 2, was = low; low = lo;
      Object.assign(btn.style, lo ? { top: 'auto', bottom: lo === 1 ? '8px' : '4px', left: lo === 1 ? '10px' : '4px', padding: lo === 1 ? '' : '4px' } : { top: '', bottom: '', left: '', padding: '' });
      if (st && st.tag) Object.assign(st.tag.style, lo ? { top: 'auto', bottom: lo === 1 ? '10px' : '4px', left: lo === 1 ? '128px' : '', right: lo === 1 ? 'auto' : '', fontSize: lo === 1 ? '' : '12px', padding: '2px 8px', background: 'rgba(13,11,22,.8)', borderRadius: '6px' }
        : { top: '', bottom: '', left: '', right: '', fontSize: '', padding: '', background: '', borderRadius: '' }); /* a dark pill (the pad band is pale), clear of the SEED button on the right */
      if (lo !== was) btn.__show(false);
    };
    const cm = document.createElement('div'); cm.className = 'clickme'; cm.textContent = 'Click the game to play'; cm.hidden = coarse; el.appendChild(cm); /* a frame only gets the keyboard once it has been clicked (or focused) */
    const f = frame, foc = () => { try { f.focus(); f.contentWindow.focus(); } catch (_) {} };
    f.addEventListener('load', () => setTimeout(foc, 200)); setTimeout(foc, 400);
    const onBlur = () => { if (document.activeElement === f) cm.hidden = true; }, onFocus = () => { if (f.isConnected && !coarse) cm.hidden = false; };
    addEventListener('blur', onBlur); addEventListener('focus', onFocus); addEventListener('resize', place); place();
    if (st) toast(st.host ? 'You are Sprig, player 1. ' + st.opp + ' flies Marigold.' : 'You are Marigold, player 2. ' + st.opp + ' flies Sprig.', 9000); /* after place(): on a phone it sits above the button */
    f.__unf = () => { removeEventListener('blur', onBlur); removeEventListener('focus', onFocus); removeEventListener('resize', place); };
    setTimeout(() => { if (document.activeElement === f) cm.hidden = true; }, 900);
  };

  /* ---------- from the game ---------- */
  const onFrame = e => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.ty === 'ready') { if (st) toGame(linkMsg()); if (!ready) { ready = true; const q = queue; queue = []; q.sort((x, y) => (x.ty === 'net') - (y.ty === 'net')); for (const x of q) toGame(x); } } /* the link first: the game ignores 'net' until it is linked */
    else if (m.ty === 'net') { if (st && typeof m.d === 'string' && m.d.length <= MAXMSG) send(m.d); }
    else if (m.ty === 'rtt') { if (st) { st.rtt = Math.max(0, Math.min(9999, m.ms | 0)); showTag(); } }
    else if (m.ty === 'mute') { muted = !!m.on; try { localStorage.setItem('planet-breeze-mute', muted ? '1' : '0'); } catch (_) {} if (sndBtn) sndBtn.__show(false); }
    else if (m.ty === 'leave') { if (st) { dSend('bye'); endLink(); } } /* the game ended co-op itself and flies on alone: keep the frame */
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
  const onBye = () => { if (!st) return; const who = st.opp; toGame({ ty: 'peer', left: true }); endLink(); if (frame) toast(who + ' left. Flying on alone.'); else menu(who + ' left.'); };
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
    s0.joinT = setTimeout(() => { if (st !== s0 || s0.heard) return; const who = s0.opp; toGame({ ty: 'peer', left: true }); dSend('bye'); endLink(); toast(s0.host ? who + ' couldn’t join. Flying on alone.' : who + ' couldn’t start. You can play on your own.'); }, linkMsg().startIn + (s0.host ? 10000 : 15000));
  };
  const duo = () => {
    if (!live()) { menu('Online play needs the live connection, and it is not up right now. Try again in a moment.'); return; }
    el.innerHTML = '<h3>BERRY BREEZE</h3><p class="sub">Looking for someone to play with…</p><p class="msg">Anyone who picks “Play with someone online” at a Berry Breeze cabinet will be paired with you. You fly through the same sky together.</p><div class="row"><button type="button" class="alt" data-a="cancel">Stop looking</button></div>';
    let ok = false; try { ok = ctx.duelFind('breeze', link, onNet); } catch (_) {}
    if (!ok) menu('Online play is not available right now.');
  };
  el.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; if (a === 'solo') play(''); else if (a === 'duo') duo(); else if (a === 'cancel') { try { ctx.duelLeave && ctx.duelLeave(); } catch (_) {} menu(''); } });
  menu('');
  return () => { alive = false; window.__duck = 0; removeEventListener('message', onFrame); if (st) { try { if (st.dc && st.dc.readyState === 'open') st.dc.send('{"k":"bye"}'); } catch (_) {} dSend('bye'); } endLink(); dropFrame(); try { ctx.duelCancel && ctx.duelCancel(); } catch (_) {} };
}
window.breezeRoom = breezeRoom;

/* ---------- the cabinets: the right-hand half of the arcade (as you face its back wall) plays Berry Breeze ---------- */
(function breezeCabinets() {
  const ACT = { kind: 'breeze', title: 'Berry Breeze', label: 'Play Berry Breeze' };
  const canvasTex = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
  const ell = (g, x, y, rx, ry, rot, fill, stroke, lw) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 2; g.stroke(); } };
  const INK = '#2b2140', FONT = '"Arial Rounded MT Bold","Hiragino Maru Gothic ProN","Nunito","Varela Round",sans-serif';
  function fruit(g, k, x, y, r) { /* the juggle fruit, no faces: gloss and a leaf */
    const P = [['#ffd93b', '#f5a623'], ['#3f7bff', '#2a4fb8'], ['#9b6bff', '#6b44c9'], ['#ff4f5e', '#c22d4f'], ['#8fd14f', '#5a9a2c']][k];
    if (k === 2) { for (const [dx, dy] of [[-.5, -.45], [.5, -.45], [0, -.4], [-.28, .1], [.28, .1], [0, .6]]) ell(g, x + dx * r, y + dy * r, r * .42, r * .42, 0, P[0], INK, 2); }
    else if (k === 3) { g.beginPath(); g.moveTo(x, y + r * 1.05); g.bezierCurveTo(x - r * 1.25, y + r * .1, x - r * .9, y - r * .95, x, y - r * .7); g.bezierCurveTo(x + r * .9, y - r * .95, x + r * 1.25, y + r * .1, x, y + r * 1.05); g.fillStyle = P[0]; g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); g.fillStyle = '#fff6e0'; for (const [dx, dy] of [[-.35, -.2], [.3, -.25], [0, .15], [-.2, .5], [.25, .45]]) ell(g, x + dx * r, y + dy * r, 1.4, 2, 0, '#fff6e0'); }
    else { ell(g, x, y, r, r * (k === 4 ? .85 : 1), 0, P[0], INK, 2); if (k === 1) { g.strokeStyle = P[1]; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 5; g.moveTo(x, y - r * .55); g.lineTo(x + Math.cos(a) * r * .3, y - r * .55 + Math.sin(a) * r * .3); } g.stroke(); } if (k === 4) for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ell(g, x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .45, 1.1, 1.1, 0, '#2f3a1a'); } }
    if (k !== 1 && k !== 2) ell(g, x + r * .15, y - r * (k === 3 ? .82 : 1.02), r * .42, r * .18, -.3, '#4cc46a', INK, 1.5);
    ell(g, x - r * .38, y - r * .38, r * .26, r * .17, -.6, 'rgba(255,255,255,.85)');
  }
  function sprig(g, x, y, s) { /* Sprig as the game draws it (art.js drawSprout): leaf wings, a two-leaf sprout, a root tuft */
    g.save(); g.translate(x - 12 * s, y - 13 * s); g.scale(s, s); g.lineJoin = g.lineCap = 'round';
    const leaf = (cx, cy, l, w, r) => g => { const c = Math.cos(r), n = Math.sin(r), p = (u, v) => [cx + u * c - v * n, cy + u * n + v * c], a = p(-l, 0), b = p(l, 0), t = p(0, -w * 1.9), d = p(0, w * 1.9);
      g.moveTo(a[0], a[1]); g.quadraticCurveTo(t[0], t[1], b[0], b[1]); g.quadraticCurveTo(d[0], d[1], a[0], a[1]); g.closePath(); };
    const group = parts => { g.fillStyle = g.strokeStyle = INK; g.lineWidth = 3; for (const [p] of parts) { g.beginPath(); p(g); g.fill(); g.stroke(); } for (const [p, c] of parts) { g.beginPath(); p(g); g.fillStyle = c; g.fill(); } }; /* outlines first, then fills */
    const tuft = () => { g.beginPath(); g.moveTo(10.3, 21.6); g.lineTo(9.2, 24.6); g.moveTo(12, 22.2); g.lineTo(12, 25.4); g.moveTo(13.7, 21.6); g.lineTo(14.8, 24.6); g.stroke(); };
    g.strokeStyle = INK; g.lineWidth = 3; tuft(); g.strokeStyle = '#b9774a'; g.lineWidth = 1.3; tuft();
    group([[leaf(3.2, 15.6, 5, 2.2, -.55), '#a8ec8c'], [leaf(20.8, 15.6, 5, 2.2, .55), '#a8ec8c']]);
    g.strokeStyle = '#45a85a'; g.lineWidth = .7; g.beginPath(); g.moveTo(-.6, 17.8); g.lineTo(5.4, 14.4); g.moveTo(24.6, 17.8); g.lineTo(18.6, 14.4); g.stroke();
    group([[leaf(7.4, 4, 5.5, 1.15, 0), '#4cc46a'], [leaf(16.6, 4, 5.5, 1.15, 0), '#4cc46a'], [g => g.rect(11, 4, 2, 4), '#4cc46a'], [g => g.ellipse(12, 14.5, 8.8, 8, 0, 0, Math.PI * 2), '#4cc46a']]);
    ell(g, 9.4, 11.4, 3.2, 1.8, -.5, '#c9f7c1');
    for (const ex of [9.2, 14.8]) { ell(g, ex, 13.6, 2.3, 3.2, 0, '#fff', INK, .64); ell(g, ex, 14.1, 1.57, 2.43, 0, INK); ell(g, ex - .6, 13.1, .9, .9, 0, '#fff'); ell(g, ex + .55, 15, .38, .38, 0, '#fff'); }
    ell(g, 6.3, 17.4, 1.7, 1.05, 0, 'rgba(255,150,125,.8)'); ell(g, 17.7, 17.4, 1.7, 1.05, 0, 'rgba(255,150,125,.8)');
    g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.arc(12, 16.96, 1.6, .2 * Math.PI, .8 * Math.PI); g.stroke(); g.restore();
  }
  function paintBreezeScreen() {
    return canvasTex(256, 256, g => {
      const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#7fd0ff'); gr.addColorStop(1, '#d8f3ff'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      for (const [x, y, s] of [[40, 120, 1], [210, 96, .8], [150, 214, .9]]) { g.fillStyle = 'rgba(255,255,255,.95)'; for (const [dx, dy, r] of [[-16, 4, 11], [0, -4, 15], [16, 3, 11], [6, 8, 10], [-6, 8, 10]]) { g.beginPath(); g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); g.fill(); } }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.font = '900 38px ' + FONT;
      for (const [w, y] of [['BERRY', 38], ['BREEZE', 78]]) { g.lineWidth = 7; g.strokeStyle = INK; g.strokeText(w, 128, y, 236); g.fillStyle = '#ffd93b'; g.fillText(w, 128, y, 236); }
      fruit(g, 0, 40, 160, 11); fruit(g, 3, 214, 150, 11); fruit(g, 1, 70, 210, 9); fruit(g, 2, 192, 196, 10); fruit(g, 4, 222, 214, 8);
      g.fillStyle = '#fff6e0'; g.strokeStyle = INK; g.lineWidth = 1.5; for (const [x, y] of [[121, 124], [135, 124], [121, 104], [135, 104]]) { ell(g, x, y, 2.4, 5, 0, '#fff6e0', INK, 1.5); }
      sprig(g, 128, 164, 2.6);
      g.fillStyle = INK; g.font = '700 15px ui-monospace,Menlo,monospace'; g.fillText('PRESS START', 128, 240);
    });
  }
  function paintBreezeMarquee() {
    return canvasTex(256, 64, g => {
      const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, '#9be8c4'); gr.addColorStop(.5, '#bfe6ff'); gr.addColorStop(1, '#fff1a8'); g.fillStyle = gr; g.fillRect(0, 0, 256, 64);
      g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(9 + i * 18.5, i & 1 ? 6 : 58, 2.2, 0, Math.PI * 2); g.fill(); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.font = '900 30px ' + FONT;
      g.lineWidth = 6; g.strokeStyle = '#fff'; g.strokeText('BERRY BREEZE', 128, 34, 236); g.fillStyle = '#2f8f5a'; g.fillText('BERRY BREEZE', 128, 34, 236);
    });
  }
  let mats = null, tries = 0;
  function apply() {
    const A = window.__arcade; if (!window.THREE || !A || !Array.isArray(A.cabs) || !Array.isArray(A.doors) || A.doors.length < A.cabs.length) return 0;
    if (!mats) mats = { scr: new THREE.MeshBasicMaterial({ map: paintBreezeScreen() }), mq: new THREE.MeshBasicMaterial({ map: paintBreezeMarquee() }) };
    let n = 0;
    A.cabs.forEach((cb, k) => {
      if (!cb || !cb.g || !(cb.g.position.x > 0)) return;
      for (const m of cb.g.children) { const p = m.isMesh && m.geometry && m.geometry.type === 'PlaneGeometry' && m.geometry.parameters; if (!p) continue; if (Math.abs(p.width - .6) < .01) m.material = mats.scr; else if (Math.abs(p.width - .7) < .01) m.material = mats.mq; }
      const d = A.doors[k]; if (d) { d.act = ACT; d.key = 'breeze'; } n++;
    });
    if (n && window.GAME && window.GAME.dirty) window.GAME.dirty();
    window.__breezeCabs = n; return n;
  }
  window.__breezePaint = { screen: paintBreezeScreen, marquee: paintBreezeMarquee }; /* for a look at the textures in tests */
  const iv = setInterval(() => { tries++; let n = 0; try { n = apply(); } catch (e) { console.warn('breeze cabinets', e); clearInterval(iv); return; } if ((n && tries > 15) || tries > 300) clearInterval(iv); }, 1000); /* the arcade is seated a few seconds after its model loads */
})();
