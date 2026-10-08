/* FAR FIELD — ff-post.js: a tiny hand-rolled post chain (no EffectComposer download).
   scene -> HDR target (half float, MSAA on WebGL2 when the tier asks) -> optional bloom (1 or 2 blur levels)
   -> one final pass: exposure, ACES filmic curve, grading (saturation, contrast, cold lift), vignette, grain, sRGB.
   Every tier goes through the same final pass so the look stays identical; only the cost changes.
   Sequence 1: render(scene, camera, look, tier, time, fade). fade 0..1 mixes the final image to black IN the final pass, so a
   cut to black lands on the exact frame (no DOM latency); fade >= 1 skips the scene entirely and outputs pure black.
   OWNER: architect / integrator (shared). */
'use strict';
(function () {
const T = THREE;
const FS_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

FF.Post = function (renderer) {
  const gl2 = renderer.capabilities.isWebGL2;
  const half = gl2 ? !!renderer.extensions.get('EXT_color_buffer_float') : !!renderer.extensions.get('OES_texture_half_float');
  const type = half ? T.HalfFloatType : T.UnsignedByteType;
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), quadScene = new T.Scene();
  const tri = new T.BufferGeometry(); tri.setAttribute('position', new T.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); tri.setAttribute('uv', new T.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const quad = new T.Mesh(tri, null); quad.frustumCulled = false; quadScene.add(quad);
  const mkRT = (w, h, msaa) => { const o = { type, format: T.RGBAFormat, minFilter: T.LinearFilter, magFilter: T.LinearFilter, depthBuffer: !!msaa || msaa === 0, stencilBuffer: false };
    let rt; if (msaa > 0 && gl2) { rt = new T.WebGLMultisampleRenderTarget(w, h, o); rt.samples = msaa; } else rt = new T.WebGLRenderTarget(w, h, o); rt.texture.generateMipmaps = false; return rt; };
  let rtScene = null, b1a = null, b1b = null, b2a = null, b2b = null, W = 0, H = 0, msaa = -1, bloomLv = 0;

  const bright = new T.ShaderMaterial({ uniforms: { tSrc: { value: null }, uThr: { value: 0.9 } }, vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tSrc; uniform float uThr; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tSrc, vUv).rgb; float l = max(c.r, max(c.g, c.b)); float k = smoothstep(uThr, uThr * 2.2 + 0.2, l); gl_FragColor = vec4(min(c * k, vec3(16.0)), 1.0); }` });
  const blur = new T.ShaderMaterial({ uniforms: { tSrc: { value: null }, uDir: { value: new T.Vector2() } }, vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tSrc; uniform vec2 uDir; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
        c += (texture2D(tSrc, vUv + uDir * 1.3846154).rgb + texture2D(tSrc, vUv - uDir * 1.3846154).rgb) * 0.3162162;
        c += (texture2D(tSrc, vUv + uDir * 3.2307692).rgb + texture2D(tSrc, vUv - uDir * 3.2307692).rgb) * 0.0702703;
        gl_FragColor = vec4(c, 1.0); }` });
  const final = new T.ShaderMaterial({
    uniforms: { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, uBloom: { value: new T.Vector2(0, 0) }, uExposure: { value: 1 },
      uSat: { value: 0.8 }, uCon: { value: 1.05 }, uLift: { value: new T.Vector3() }, uGain: { value: new T.Vector3(1, 1, 1) }, uVig: { value: 0.4 }, uBot: { value: 0 }, uGrain: { value: 0.03 },
      uTime: { value: 0 }, uRes: { value: new T.Vector2(1, 1) }, uTone: { value: 1 }, uFade: { value: 0 } },
    vertexShader: FS_VERT, depthTest: false, depthWrite: false,
    fragmentShader: `uniform sampler2D tScene, tB1, tB2; uniform vec2 uBloom, uRes; uniform float uExposure, uSat, uCon, uVig, uBot, uGrain, uTime, uTone, uFade; uniform vec3 uLift, uGain; varying vec2 vUv;
      vec3 RRTAndODTFit(vec3 v){ vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
      vec3 aces(vec3 c){ const mat3 I = mat3(vec3(0.59719,0.07600,0.02840), vec3(0.35458,0.90834,0.13383), vec3(0.04823,0.01566,0.83777));
        const mat3 O = mat3(vec3(1.60475,-0.10208,-0.00327), vec3(-0.53108,1.10813,-0.07276), vec3(-0.07367,-0.00605,1.07602));
        c *= 1.0 / 0.6; c = I * c; c = RRTAndODTFit(c); c = O * c; return clamp(c, 0.0, 1.0); }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
      float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      void main(){
        vec3 c = texture2D(tScene, vUv).rgb;
        if (uBloom.y > 0.5) c += texture2D(tB1, vUv).rgb * uBloom.x;
        if (uBloom.y > 1.5) c += texture2D(tB2, vUv).rgb * uBloom.x * 1.3;
        c *= uExposure;
        if (uTone > 0.5) c = aces(c);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat);
        c = toSRGB(c);
        c = (c - 0.5) * uCon + 0.5;
        c = c * uGain + uLift * (1.0 - c);
        vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y * 0.62;
        c *= 1.0 - uVig * smoothstep(0.18, 0.78, dot(q, q) * 2.2);
        c *= 1.0 - uBot * smoothstep(0.16, 0.0, vUv.y);
        float n = hash(gl_FragCoord.xy + fract(uTime * 7.31) * 517.0) + hash(gl_FragCoord.xy * 1.37 + fract(uTime * 3.7) * 211.0) - 1.0;
        c += n * uGrain * (0.55 + 0.45 * (1.0 - l)) + (hash(gl_FragCoord.xy * 0.93) - 0.5) / 255.0;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0) * (1.0 - clamp(uFade, 0.0, 1.0)), 1.0);
      }` });

  function pass(mat, target) { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quadScene, cam); }
  return {
    half, gl2,
    setSize(w, h, tier) {
      const m = tier.msaa | 0;
      if (w === W && h === H && m === msaa && tier.bloom === bloomLv && rtScene) return;
      for (const r of [rtScene, b1a, b1b, b2a, b2b]) if (r) r.dispose();
      W = w; H = h; msaa = m; bloomLv = tier.bloom;
      rtScene = mkRT(w, h, m); if (!(m > 0 && gl2)) rtScene.depthBuffer = true;
      const w1 = Math.max(1, w >> 1), h1 = Math.max(1, h >> 1), w2 = Math.max(1, w >> 2), h2 = Math.max(1, h >> 2);
      b1a = mkRT(w1, h1, 0); b1b = mkRT(w1, h1, 0); b2a = mkRT(w2, h2, 0); b2b = mkRT(w2, h2, 0);
      for (const r of [b1a, b1b, b2a, b2b]) r.depthBuffer = false;
      final.uniforms.uRes.value.set(w, h);
    },
    render(scene, camera, L, tier, time, fade) {
      fade = fade || 0;
      if (fade >= 1) { renderer.setRenderTarget(null); renderer.setClearColor(0x000000, 1); renderer.clear(true, true, false); return; }
      renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
      const G = L.grade, lv = tier.bloom;
      if (lv > 0) {
        bright.uniforms.tSrc.value = rtScene.texture; bright.uniforms.uThr.value = G.bloomThreshold;
        const lvl = (src, a, b, w, h) => { blur.uniforms.tSrc.value = src; blur.uniforms.uDir.value.set(1 / w, 0); pass(blur, b); blur.uniforms.tSrc.value = b.texture; blur.uniforms.uDir.value.set(0, 1 / h); pass(blur, a); };
        if (lv >= 2) { pass(bright, b1a); lvl(b1a.texture, b1a, b1b, b1a.width, b1a.height); lvl(b1a.texture, b2a, b2b, b2a.width, b2a.height); lvl(b2a.texture, b2a, b2b, b2a.width, b2a.height); }
        else { pass(bright, b2a); lvl(b2a.texture, b2a, b2b, b2a.width, b2a.height); lvl(b2a.texture, b2a, b2b, b2a.width, b2a.height); }
      }
      const u = final.uniforms;
      u.tScene.value = rtScene.texture; u.tB1.value = lv >= 2 ? b1a.texture : b2a.texture; u.tB2.value = b2a.texture;
      u.uBloom.value.set(G.bloom, lv); u.uExposure.value = L.exposure; u.uSat.value = G.saturation; u.uCon.value = G.contrast;
      u.uLift.value.set(G.lift[0], G.lift[1], G.lift[2]); u.uGain.value.set(G.gain[0], G.gain[1], G.gain[2]); u.uVig.value = G.vignette; u.uBot.value = G.bottomWeight || 0;
      u.uGrain.value = tier.grain ? G.grain : 0; u.uTime.value = time; u.uTone.value = 1; u.uFade.value = fade;
      pass(final, null);
    },
    dispose() { for (const r of [rtScene, b1a, b1b, b2a, b2b]) if (r) r.dispose(); bright.dispose(); blur.dispose(); final.dispose(); tri.dispose(); },
  };
};
})();
