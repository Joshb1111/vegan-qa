/* FAR FIELD — ff-shading.js: the shared surface look, patched into three.js r128's own materials.
   Every material made with FF.mat() gets, in its shader:
     - depth + height fog with forward scattering towards the key light (replaces three's fog entirely),
     - analytic contact shadows: a crease where walls meet the floor, soft darkening on the floor around boxes
       and under the rabbit (no SSAO pass, a handful of ALU per pixel),
     - very low-frequency mottling so big untextured planes are not dead flat,
     - optional rim light (the rabbit) and a soft rotated-disc PCF shadow filter whose tap count follows the tier.
   Shared uniforms live in FF.U, so moving the crate or the rabbit updates every material at once. */
'use strict';
(function () {
const T = THREE;
const lin = hex => new T.Color(hex).convertSRGBToLinear();
FF.lin = lin;

/* uniforms shared by every patched material */
const MAX_AO = 6;
FF.U = {
  uFFKeyDir:   { value: new T.Vector3(0, -1, 0) },     // direction the key light travels (normalised)
  uFFFogCol:   { value: new T.Color() },
  uFFFogGlow:  { value: new T.Color() },
  uFFFog:      { value: new T.Vector4(0.05, 6, 0.1, 5) }, // density, start, heightFalloff, glowPower
  uFFAOc:      { value: Array.from({ length: MAX_AO }, () => new T.Vector4(0, -50, 0, 0)) }, // box centre xyz, strength
  uFFAOh:      { value: Array.from({ length: MAX_AO }, () => new T.Vector4(0.1, 0.1, 0.1, 0.3)) }, // half size xyz, reach
  uFFAO:       { value: new T.Vector4(0.55, 0.55, 0, 0) },  // crease strength, crease height
  uFFRab:      { value: new T.Vector4(0, 0, 0, 0) },      // rabbit ground point xyz, contact strength
  uFFRabAx:    { value: new T.Vector2(0.24, 0.12) },      // contact ellipse half axes (x, z)
  uFFRim:      { value: new T.Vector4(0, 0, 0, 2.6) },    // rim rgb (premultiplied by strength), power
  uFFTime:     { value: 0 },
};
FF.MAX_AO = MAX_AO;

/* shadow filtering: a rotated disc of N taps with per-pixel rotation (interleaved gradient noise); the film grain hides
   the dither. Replaces only the PCF branch of r128's getShadow(); PCFShadowMap is used on every tier. */
function shadowChunk(taps) {
  const src = T.ShaderChunk.shadowmap_pars_fragment;
  const a = src.indexOf('#if defined( SHADOWMAP_TYPE_PCF )'), b = src.indexOf('#elif defined( SHADOWMAP_TYPE_PCF_SOFT )');
  if (a < 0 || b < 0) return src;
  const body = `#if defined( SHADOWMAP_TYPE_PCF )
      vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
      float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
      float ang = ign * 6.2831853;
      vec2 rot = vec2( cos( ang ), sin( ang ) );
      float acc = 0.0;
      for ( int i = 0; i < ${taps}; i ++ ) {
        float fi = float( i ) + 0.5;
        float r = sqrt( fi / ${taps}.0 );
        float th = fi * 2.39996323;
        vec2 d = vec2( cos( th ), sin( th ) ) * r;
        d = vec2( d.x * rot.x - d.y * rot.y, d.x * rot.y + d.y * rot.x );
        acc += texture2DCompare( shadowMap, shadowCoord.xy + d * texelSize * shadowRadius, shadowCoord.z );
      }
      shadow = acc / ${taps}.0;
    `;
  return src.slice(0, a) + body + src.slice(b);
}

const PARS = `
varying vec3 vFFW;
uniform vec3 uFFKeyDir; uniform vec3 uFFFogCol; uniform vec3 uFFFogGlow; uniform vec4 uFFFog;
uniform vec4 uFFAOc[${MAX_AO}]; uniform vec4 uFFAOh[${MAX_AO}]; uniform vec4 uFFAO; uniform vec4 uFFRab; uniform vec2 uFFRabAx;
uniform vec4 uFFRim; uniform float uFFTime;
float ffHash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float ffNoise( vec3 x ) {
  vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( ffHash( i ), ffHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( ffHash( i + vec3( 0, 1, 0 ) ), ffHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( ffHash( i + vec3( 0, 0, 1 ) ), ffHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( ffHash( i + vec3( 0, 1, 1 ) ), ffHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
float ffOcclusion( vec3 p, vec3 n ) {
  float o = 1.0;
#ifndef FF_NO_AO
  float vert = 1.0 - abs( n.y );
  o *= mix( 1.0, mix( 1.0 - uFFAO.x, 1.0, smoothstep( 0.0, uFFAO.y, p.y ) ), vert * step( p.y, uFFAO.y + 0.01 ) );
  float up = smoothstep( 0.5, 0.9, n.y );
  for ( int i = 0; i < ${MAX_AO}; i ++ ) {
    vec4 c = uFFAOc[ i ]; vec4 h = uFFAOh[ i ];
    vec2 q = abs( p.xz - c.xz ) - h.xz;
    float d = length( max( q, 0.0 ) ) + min( max( q.x, q.y ), 0.0 );
    float atBase = 1.0 - smoothstep( 0.02, 0.12, abs( p.y - ( c.y - h.y ) ) );
    o *= 1.0 - c.w * up * atBase * ( 1.0 - smoothstep( -0.02, h.w, d ) );
  }
  vec2 r = ( p.xz - uFFRab.xz ) / uFFRabAx;
  float atGround = 1.0 - smoothstep( 0.0, 0.06, abs( p.y - uFFRab.y ) );
  o *= 1.0 - uFFRab.w * up * atGround * exp( -2.2 * dot( r, r ) );
#endif
  return o;
}
`;

const FOG = `
  {
    vec3 ffV = vFFW - cameraPosition;
    float ffD = length( ffV );
    vec3 ffDir = ffV / max( ffD, 1e-4 );
    float ffH = exp( - max( vFFW.y, 0.0 ) * uFFFog.z );
    float ffAmt = 1.0 - exp( - uFFFog.x * max( ffD - uFFFog.y, 0.0 ) * ( 0.45 + 0.9 * ffH ) );
    float ffMu = max( dot( ffDir, - uFFKeyDir ), 0.0 );
    vec3 ffCol = uFFFogCol + uFFFogGlow * pow( ffMu, uFFFog.w );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, ffCol, clamp( ffAmt, 0.0, 1.0 ) );
  }
`;

/* patch a built-in material. opts: { mottle, rim, noAO, noFog, lift } */
function patch(m, opts) {
  opts = opts || {};
  m.userData.ff = opts;
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, FF.U);
    if (opts.lift) sh.uniforms.uFFLift = { value: opts.lift };
    let defs = '';
    if (opts.noAO) defs += '#define FF_NO_AO\n';
    if (opts.lift) defs += 'uniform float uFFLift;\n';
    sh.vertexShader = 'varying vec3 vFFW;\n' + sh.vertexShader.replace('#include <fog_vertex>', '#include <fog_vertex>\n  vFFW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    let f = defs + PARS + sh.fragmentShader;
    f = f.replace('#include <shadowmap_pars_fragment>', shadowChunk(FF.tier ? FF.tier.shadowTaps : 8));
    if (opts.mottle) f = f.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= 1.0 + ${(+opts.mottle).toFixed(3)} * ( ffNoise( vFFW * vec3( 0.55, 0.9, 0.55 ) ) + 0.5 * ffNoise( vFFW * 2.3 ) - 0.75 );`);
    if (f.indexOf('#include <lights_fragment_end>') >= 0) {
      f = f.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 ffN = inverseTransformDirection( normal, viewMatrix );
        float ffO = ffOcclusion( vFFW, ffN );
        reflectedLight.indirectDiffuse *= ffO;
        reflectedLight.directDiffuse *= mix( 1.0, ffO, 0.35 );
        ${opts.rim ? `float ffF = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
        totalEmissiveRadiance += uFFRim.rgb * pow( ffF, uFFRim.w ) * ( 0.55 + 0.45 * clamp( ffN.y + 0.3, 0.0, 1.0 ) );` : ''}
        ${opts.lift ? 'totalEmissiveRadiance += diffuseColor.rgb * uFFLift;' : ''}
      }`);
    }
    if (!opts.noFog) f = f.replace('#include <fog_fragment>', FOG);
    sh.fragmentShader = f;
  };
  m.customProgramCacheKey = () => 'ff|' + (FF.tier ? FF.tier.name : '') + '|' + JSON.stringify(opts);
  return m;
}
FF.patch = patch;

/* the material factory: smooth matte standard material, colour given in sRGB */
FF.mat = function (spec, extra) {
  spec = spec || {};
  const m = new T.MeshStandardMaterial(Object.assign({
    color: lin(spec.color || '#808080'), roughness: spec.roughness != null ? spec.roughness : 0.9, metalness: 0, dithering: true,
  }, extra || {}));
  return patch(m, { mottle: spec.mottle || 0, rim: !!spec.rim, noAO: !!spec.noAO, lift: spec.lift || 0 });
};
/* unlit glowing surfaces (the light beyond the opening, the amber lamp): colour in linear HDR so they bloom */
FF.glow = function (rgb, fog) {
  const m = new T.MeshBasicMaterial({ color: new T.Color(rgb[0], rgb[1], rgb[2]) });
  return patch(m, { noFog: fog === false, noAO: true });
};

/* push config values into the shared uniforms */
FF.applyShading = function (L) {
  const k = L.key.dir; FF.U.uFFKeyDir.value.set(k[0], k[1], k[2]).normalize();
  FF.U.uFFFogCol.value.copy(lin(L.fog.color));
  FF.U.uFFFogGlow.value.copy(lin(L.fog.glow)).multiplyScalar(L.fog.glowStrength);
  FF.U.uFFFog.value.set(L.fog.density, L.fog.start, L.fog.heightFalloff, L.fog.glowPower);
  FF.U.uFFAO.value.set(L.ao.floorCrease, L.ao.creaseHeight, 0, 0);
  const r = lin(L.rabbit.rim); FF.U.uFFRim.value.set(r.r * L.rabbit.rimStrength, r.g * L.rabbit.rimStrength, r.b * L.rabbit.rimStrength, L.rabbit.rimPower);
};
/* contact-shadow boxes: [{c:[x,y,z], h:[hx,hy,hz], k, reach}] (y is the box centre; the base is c.y - h.y) */
FF.setAOBox = function (i, c, h, k, reach) {
  FF.U.uFFAOc.value[i].set(c[0], c[1], c[2], k); FF.U.uFFAOh.value[i].set(h[0], h[1], h[2], reach);
};
})();
