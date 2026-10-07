window.__measure = () => {
    const R = __ff.renderer, gl = R.getContext(), w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, rab = FF.Player.rig.object;
    const keep = FF.tier; FF.tier = Object.assign({}, keep, { grain: false });
    const grab = () => { __ff.draw(); const px = new Uint8Array(w * hh * 4); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const lin1 = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }, Y = (p, i) => 0.2126 * lin1(p[i]) + 0.7152 * lin1(p[i + 1]) + 0.0722 * lin1(p[i + 2]);
    const casts = []; rab.traverse(o => { if (o.isMesh) { casts.push([o, o.castShadow]); o.castShadow = false; } }); const U = FF.U.uFFRab.value, kw = U.w; U.w = 0;
    const a = grab(); rab.visible = false; const bb = grab(); rab.visible = true; casts.forEach(([o, c]) => o.castShadow = c); U.w = kw; const f = grab();
    let n = 0, sR = 0, x0 = w, x1 = 0, y0 = hh, y1 = 0;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (Math.abs(a[i] - bb[i]) + Math.abs(a[i + 1] - bb[i + 1]) + Math.abs(a[i + 2] - bb[i + 2]) > 12) { n++; sR += Y(f, i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    let rn = 0, rs = 0; const pad = Math.round((y1 - y0) * 0.6);
    for (let y = Math.max(0, y0 - pad); y < Math.min(hh, y1 + pad); y++) for (let x = Math.max(0, x0 - pad); x < Math.min(w, x1 + pad); x++) { if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue; rs += Y(f, (y * w + x) * 4); rn++; }
    FF.tier = keep; __ff.draw();
    const toS = v => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)), mR = sR / Math.max(1, n), mG = rs / Math.max(1, rn);
    return { px: n, hFrac: +((y1 - y0 + 1) / hh).toFixed(3), rabbitSRGB: toS(mR), ringSRGB: toS(mG), ratio: +(mR / Math.max(1e-6, mG)).toFixed(2) };
  }; true
