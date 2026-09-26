/* =====================================================================
   planet-dress.js: the environment dressing kit (first pass, 26 Sep 2026)
   A set-dressing layer for the planet game. It adds clusters of street furniture, poles and wiring,
   painted vegetation, kerb detail and ground shadows along ONE street (the spawn street) as a
   prototype. It changes none of the world's systems: it reads the game's roads, buildings and
   ground (ROADS, BLDGS, gAt, solids, DOORS) and adds its own meshes.
   Cost: street furniture is merged into one mesh per material and plants are instanced billboards,
   so the whole street is a couple of dozen draw calls. Every texture is painted on a canvas at load.
   Switches: ?dress=0 turns it off, ?look=0 the painted-look shading. window.DRESS for debugging.
   To dress another street later: call DRESS.street({road, s0, s1, ...}) with that road's name.
   ===================================================================== */
(function(){
'use strict';
if(/[?&]dress=0\b/.test(location.search))return;
const G=window.GAME;if(typeof THREE==='undefined'||!G||!G.ROADS.length){console.warn('dress: the game is not loaded');return;}
const {ROADS,gAt,R,MIN,LITE,solids,SUNU,LOOKU,scene,hideInNormals,atS,offsetFrom,lonLatOf,placeOn,settle,yawFor,renderer,DOORS,sphere}=G;
const T=THREE,DEN=MIN?.5:(LITE?.75:1);
const MAIN=ROADS.find(r=>r.name==='main')||ROADS[0];
const V3=(x,y,z)=>new T.Vector3(x,y,z);
let sd_=20260926;const rr=()=>{sd_=(sd_*16807)%2147483647;return sd_/2147483647;};
const rb=(a,b)=>a+(b-a)*rr(),rp=a=>a[Math.floor(rr()*a.length)],ch=p=>rr()<p;
let cs_=7;const cr=()=>{cs_=(cs_*16807)%2147483647;return cs_/2147483647;};

/* ---------- placing things on the planet ---------- */
const onG=(n,lift)=>n.clone().multiplyScalar(gAt(n)+(lift||0));
const tn=(n,v)=>n.clone().addScaledVector(v,1/R).normalize(); /* move a point on the planet by a tangent vector in metres */
function basisM(n,f){const Y=n.clone().normalize();let Z=f.clone().addScaledVector(Y,-f.dot(Y));if(Z.lengthSq()<1e-10)Z=V3(1,0,0).addScaledVector(Y,-Y.x);Z.normalize();const X=new T.Vector3().crossVectors(Y,Z);return new T.Matrix4().makeBasis(X,Y,Z);}
function mOn(n,f,lift){const m=basisM(n,f);m.setPosition(onG(n,lift));return m;}
function mRot(x,y,z,ry,rx,rz){const m=new T.Matrix4().makeRotationFromEuler(new T.Euler(rx||0,ry||0,rz||0,'YXZ'));m.setPosition(x,y,z);return m;}
const mul=(a,b)=>new T.Matrix4().multiplyMatrices(a,b);
/* the game's sun: high, from the east-north of wherever you stand (the same formula as its shadow rig), so painted shadows line up with real ones */
function sunAt(n){const e=V3(-n.z,0,n.x).normalize();const no=new T.Vector3().crossVectors(e,n).normalize();return n.clone().multiplyScalar(1.6).addScaledVector(e,.7).addScaledVector(no,.5).normalize();}
function shadowOff(n,H){const d=sunAt(n),k=d.dot(n);return d.clone().addScaledVector(n,-k).multiplyScalar(-H/k);}
function nearest(r,n){let bs=null,bd=-2;for(const sm of r.samples){const d=n.dot(sm.n);if(d>bd){bd=d;bs=sm;}}return bs;}
/* metres beyond a road's pavement (negative: on it) */
function roadDist(n,roads){let best=1e9;for(const r of roads){const bs=nearest(r,n);if(!bs)continue;const dv=n.clone().sub(bs.n);const lat=Math.abs(dv.dot(bs.side))*R,al=Math.abs(dv.dot(bs.t))*R;const edge=r.kerb+2.15;const d=(al>1.2&&!r.closed)?Math.hypot(Math.max(0,lat-edge),al):lat-edge;if(d<best)best=d;}return best;}
function solidHit(n,pad){const p=n.clone().multiplyScalar(R);for(const s of solids){if(Math.abs(s.c.x-p.x)>14||Math.abs(s.c.y-p.y)>14||Math.abs(s.c.z-p.z)>14)continue;const d=p.clone().sub(s.c);if(s.r!==undefined){d.addScaledVector(n,-d.dot(n));if(d.length()<s.r+pad)return true;continue;}if(Math.abs(d.dot(s.X))<s.hx+pad&&Math.abs(d.dot(s.Z))<s.hz+pad)return true;}return false;}
const doorNear=(n,r)=>typeof DOORS!=='undefined'&&DOORS.some(d=>Math.acos(Math.min(1,n.dot(d.n)))*R<r);

/* ---------- merged meshes: one per material ---------- */
const BUCKETS=[],BILLS=[];let flushT=0;
function schedule(){clearTimeout(flushT);flushT=setTimeout(flushAll,120);}
function flushAll(){for(const b of BUCKETS)b.flush();for(const b of BILLS)b.flush();}
class Bucket{
  constructor(name,mat,o){this.name=name;this.mat=mat;this.o=o||{};this.P=[];this.N=[];this.U=[];this.C=[];this.mesh=null;this.dirty=false;BUCKETS.push(this);}
  add(geo,m4,color,uvr,jit){const g=geo.index?geo.toNonIndexed():geo;const pa=g.attributes.position,na=g.attributes.normal,ua=g.attributes.uv;const nm=new T.Matrix3().getNormalMatrix(m4);const p=new T.Vector3(),q=new T.Vector3();
    const c=new T.Color(color===undefined?0xffffff:color);const k=1+(rr()-.5)*2*(jit===undefined?.05:jit);const cr_=Math.min(1,c.r*k),cg=Math.min(1,c.g*k),cb=Math.min(1,c.b*k);
    for(let i=0;i<pa.count;i++){p.fromBufferAttribute(pa,i).applyMatrix4(m4);this.P.push(p.x,p.y,p.z);if(na){q.fromBufferAttribute(na,i).applyMatrix3(nm).normalize();this.N.push(q.x,q.y,q.z);}else this.N.push(0,1,0);
      if(ua){let u=ua.getX(i),v=ua.getY(i);if(uvr){u=uvr[0]+(uvr[2]-uvr[0])*u;v=uvr[1]+(uvr[3]-uvr[1])*v;}this.U.push(u,v);}else this.U.push(0,0);this.C.push(cr_,cg,cb);}
    if(g!==geo)g.dispose();geo.dispose();this.dirty=true;schedule();}
  addRaw(P,N,U,color){const c=new T.Color(color===undefined?0xffffff:color);for(let i=0;i<P.length/3;i++){this.P.push(P[i*3],P[i*3+1],P[i*3+2]);this.N.push(N?N[i*3]:0,N?N[i*3+1]:1,N?N[i*3+2]:0);this.U.push(U?U[i*2]:0,U?U[i*2+1]:0);this.C.push(c.r,c.g,c.b);}this.dirty=true;schedule();}
  flush(){if(!this.dirty)return;this.dirty=false;if(!this.P.length)return;const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.P,3));g.setAttribute('normal',new T.Float32BufferAttribute(this.N,3));g.setAttribute('uv',new T.Float32BufferAttribute(this.U,2));g.setAttribute('color',new T.Float32BufferAttribute(this.C,3));g.computeBoundingSphere();
    if(!this.mesh){const m=new T.Mesh(g,this.mat);m.matrixAutoUpdate=false;Object.assign(m.userData,this.o.ud||{});if(this.o.hideN)hideInNormals.push(m);if(this.o.order!==undefined)m.renderOrder=this.o.order;m.name='dress:'+this.name;scene.add(m);this.mesh=m;}
    else{const old=this.mesh.geometry;this.mesh.geometry=g;old.dispose();}G.dirty();}
}
/* painted material: flat colour, a touch warm where it faces the sun, cool where it faces away */
function sunMat(m,k){m.onBeforeCompile=sh=>{sh.uniforms.uSun=SUNU;sh.uniforms.uLook=LOOKU;sh.uniforms.uK={value:k};
  sh.vertexShader='varying vec3 vWN;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec3 wn0=normal;\n#ifdef USE_INSTANCING\nwn0=mat3(instanceMatrix)*wn0;\n#endif\nvWN=normalize(mat3(modelMatrix)*wn0);');
  sh.fragmentShader='varying vec3 vWN;uniform vec3 uSun;uniform float uLook,uK;\n'+sh.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\n{float nd=dot(normalize(vWN),uSun);if(!gl_FrontFacing)nd=-nd;float lit=smoothstep(-.04,.16,nd);vec3 k=mix(vec3(.74,.81,.98),vec3(1.05,1.02,.94),lit);gl_FragColor.rgb=clamp(gl_FragColor.rgb*mix(vec3(1.),k,uLook*uK),0.,1.);}');};return m;}

/* cut-out foliage: the colour pass and the ink pass's normals pass both drop the see-through texels, and the
   normals pass marks the leaves 'soft' (alpha .6), so the ink draws only a light silhouette round them */
const UT={value:0};
const BB_VS=`varying vec2 vUv;varying vec3 vTint;uniform float uTilt,uT,uSway;
void main(){vUv=uv;mat4 im=instanceMatrix;vec3 c=(modelMatrix*im*vec4(0.,0.,0.,1.)).xyz;vec3 upv=normalize(mat3(modelMatrix)*im[1].xyz);float sy=length(im[1].xyz),sx=length(im[0].xyz);
 vec3 toC=cameraPosition-c;vec3 sd=cross(upv,toC);float l=length(sd);sd=l>1e-4?sd/l:normalize(mat3(modelMatrix)*im[0].xyz);vec3 vu=normalize(cross(toC,sd));vec3 yax=normalize(mix(upv,vu,uTilt));
 float sw=sin(uT*1.4+c.x*.9+c.z*.7)*uSway*position.y*position.y;
 vec3 wp=c+sd*(position.x*sx+sw*sy)+yax*position.y*sy;
 #ifdef USE_INSTANCING_COLOR
 vTint=instanceColor;
 #else
 vTint=vec3(1.);
 #endif
 gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`;
const BB_FS='uniform sampler2D map;varying vec2 vUv;varying vec3 vTint;void main(){vec4 t=texture2D(map,vUv);if(t.a<.5)discard;gl_FragColor=vec4(t.rgb*vTint,1.);}';
const INK_FS='uniform sampler2D map;varying vec2 vUv;varying vec3 vTint;void main(){if(texture2D(map,vUv).a<.5)discard;gl_FragColor=vec4(.5,.5,1.,.6);}';
const CUT_VS='varying vec2 vUv;varying vec3 vTint;void main(){vUv=uv;vTint=vec3(1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
class Bill{
  constructor(name,tex,cell,o){this.name=name;this.tex=tex;this.cell=cell;this.o=Object.assign({tilt:.35,sway:.05},o||{});this.list=[];this.mesh=null;this.dirty=false;BILLS.push(this);
    const un={map:{value:tex},uTilt:{value:this.o.tilt},uT:UT,uSway:{value:this.o.sway}};this.mat=new T.ShaderMaterial({uniforms:un,vertexShader:BB_VS,fragmentShader:BB_FS,side:T.DoubleSide});this.ink=new T.ShaderMaterial({uniforms:un,vertexShader:BB_VS,fragmentShader:INK_FS,side:T.DoubleSide});}
  add(n,w,h,tint,lift){this.list.push({n:n.clone(),w,h,tint:tint===undefined?1:tint,lift:lift||0});this.dirty=true;schedule();}
  flush(){if(!this.dirty)return;this.dirty=false;if(this.mesh){scene.remove(this.mesh);this.mesh.geometry.dispose();this.mesh=null;}if(!this.list.length)return;
    const g=new T.PlaneGeometry(1,1);g.translate(0,.5,0);const [u0,v0,u1,v1]=this.cell,ua=g.attributes.uv;for(let i=0;i<ua.count;i++)ua.setXY(i,u0+(u1-u0)*ua.getX(i),v0+(v1-v0)*ua.getY(i));
    const im=new T.InstancedMesh(g,this.mat,this.list.length);const m=new T.Matrix4(),q=new T.Quaternion(),s=new T.Vector3(),c=new T.Color(),ctr=new T.Vector3();let rad=0;
    this.list.forEach((it,i)=>{const b=basisM(it.n,V3(1,0,0).cross(it.n).lengthSq()>.01?V3(1,0,0):V3(0,0,1));q.setFromRotationMatrix(b);const p=onG(it.n,it.lift-.04);s.set(it.w,it.h,1);m.compose(p,q,s);im.setMatrixAt(i,m);
      if(typeof it.tint==='number'&&it.tint<=2)c.setRGB(it.tint,it.tint,it.tint);else c.set(it.tint);im.setColorAt(i,c);ctr.add(p);});
    ctr.multiplyScalar(1/this.list.length);this.list.forEach(it=>{rad=Math.max(rad,onG(it.n,0).distanceTo(ctr)+Math.max(it.w,it.h)+it.lift);});g.boundingSphere=new T.Sphere(ctr,rad+1);
    im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;im.userData.inkMat=this.ink;im.name='dress:'+this.name;scene.add(im);this.mesh=im;G.dirty();}
}

/* ---------- painted textures ---------- */
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
function texOf(c,rep){const t=new T.CanvasTexture(c);t.encoding=T.LinearEncoding;t.anisotropy=4;if(rep)t.wrapS=T.RepeatWrapping;return t;}
const PAL={g:['#1f3d2b','#2c5a35','#44803a','#6aa647','#9fcd5e','#d4ec95'],b:['#19322f','#244b3c','#35694d','#4f8c58','#7cb56f','#b6dc98'],y:['#2c4a2a','#446b31','#6c9537','#98bd45','#c8dc6a','#eef3a8'],p:['#7a1d50','#ad2f6b','#d65090','#ef7fb4','#ffbcdb']};
const leafE=(g,x,y,rx,ry,a,col)=>{g.save();g.translate(x,y);g.rotate(a);g.fillStyle=col;g.beginPath();g.ellipse(0,0,rx,ry,0,0,Math.PI*2);g.fill();g.restore();};
const pointed=(g,x,y,len,wid,a,col)=>{g.save();g.translate(x,y);g.rotate(a);g.fillStyle=col;g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(len*.45,-wid,len,0);g.quadraticCurveTo(len*.45,wid,0,0);g.fill();g.restore();};
function shadeT(x,y,cx,cy,r){return .5+.5*((x-cx)*.5-(y-cy)*.9)/r+(cr()-.5)*.3;}
function blob(g,ox,oy,pal,N,circ,leaf){const inside=(x,y)=>circ.some(c=>(x-c.x)**2+(y-c.y)**2<c.r*c.r);const bx0=Math.min(...circ.map(c=>c.x-c.r)),bx1=Math.max(...circ.map(c=>c.x+c.r)),by0=Math.min(...circ.map(c=>c.y-c.r)),by1=Math.max(...circ.map(c=>c.y+c.r));const cx=(bx0+bx1)/2,cy=(by0+by1)/2,rad=Math.max(bx1-bx0,by1-by0)/2;
  g.fillStyle=pal[1];for(const c of circ){g.beginPath();g.arc(ox+c.x,oy+c.y,c.r*.84,0,Math.PI*2);g.fill();} /* a dark under-layer: gaps between leaves read as depth, not holes */
  const pts=[];for(let i=0;i<N;i++){let x,y,k=0;do{x=bx0+cr()*(bx1-bx0);y=by0+cr()*(by1-by0);}while(!inside(x,y)&&++k<60);const t=shadeT(x,y,cx,cy,rad);pts.push({x,y,t});}pts.sort((a,b)=>a.t-b.t);
  const L=leaf||1;for(const p of pts){const i=Math.max(0,Math.min(pal.length-2,Math.floor(p.t*(pal.length-1))));const s=(.8+cr()*.6)*L;leafE(g,ox+p.x,oy+p.y,(6.5+cr()*6)*s,(3.6+cr()*3)*s,cr()*Math.PI,pal[i]);}
  for(const p of pts)if(p.t>.8&&cr()<.35)leafE(g,ox+p.x+2,oy+p.y-2,2.5+cr()*3,1.5+cr()*1.5,cr()*Math.PI,pal[pal.length-1]); /* dabs of light on the sunny side */
  return {inside,cx,cy,rad,bx0,bx1,by0,by1};}
function blades(g,ox,oy,pal,N,hmin,hmax,spread,wmin,wmax){for(let pass=0;pass<2;pass++)for(let i=0;i<N/2;i++){const bx=128+(cr()-.5)*spread,by=250,h=(hmin+cr()*(hmax-hmin))*(pass?1:.85),lean=(cr()-.5)*h*.75,w=wmin+cr()*(wmax-wmin);
    const gr=g.createLinearGradient(0,oy+by,0,oy+by-h);gr.addColorStop(0,pal[pass?1:0]);gr.addColorStop(.55,pal[2+pass]);gr.addColorStop(1,pal[3+pass+(cr()<.3?1:0)]);g.fillStyle=gr;
    g.beginPath();g.moveTo(ox+bx-w/2,oy+by);g.quadraticCurveTo(ox+bx+lean*.25-w*.2,oy+by-h*.55,ox+bx+lean,oy+by-h);g.quadraticCurveTo(ox+bx+lean*.25+w*.2,oy+by-h*.55,ox+bx+w/2,oy+by);g.fill();}}
function paintFoliage(){const c=canvas(1024,512),g=c.getContext('2d');const O=i=>[(i%4)*256,Math.floor(i/4)*256];
  /* 0: tall weeds */{const [ox,oy]=O(0);blades(g,ox,oy,PAL.y,44,90,215,90,4,8);for(let i=0;i<5;i++){const x=ox+128+(cr()-.5)*90,y=oy+60+cr()*70;g.fillStyle='#e9e3b0';g.beginPath();g.ellipse(x,y,3,7,cr()-.5,0,7);g.fill();}}
  /* 1: low weeds, a rosette with a few dandelions */{const [ox,oy]=O(1);for(let i=0;i<22;i++){const a=-Math.PI+.25+cr()*(Math.PI-.5),len=45+cr()*55;pointed(g,ox+128+(cr()-.5)*20,oy+246,len,9+cr()*8,a,PAL.g[1+Math.floor(cr()*4)]);}
    for(let i=0;i<3;i++){const x=ox+90+cr()*76,y=oy+150+cr()*50;g.strokeStyle='#4f7d34';g.lineWidth=3;g.beginPath();g.moveTo(x,oy+246);g.quadraticCurveTo(x+6,y+40,x,y);g.stroke();g.fillStyle='#f2c230';g.beginPath();g.arc(x,y,9,0,7);g.fill();g.fillStyle='#ffe476';g.beginPath();g.arc(x-2,y-2,5,0,7);g.fill();}}
  /* 2: leafy shrub */{const [ox,oy]=O(2);blob(g,ox,oy,PAL.g,420,[{x:128,y:168,r:70},{x:80,y:186,r:52},{x:176,y:186,r:52},{x:104,y:118,r:52},{x:156,y:122,r:50},{x:128,y:90,r:40}]);}
  /* 3: dark, cool shrub (box, camellia) */{const [ox,oy]=O(3);blob(g,ox,oy,PAL.b,440,[{x:128,y:170,r:74},{x:78,y:192,r:46},{x:180,y:190,r:48},{x:118,y:108,r:56},{x:162,y:132,r:46}],1.1);}
  /* 4: bougainvillea: green shrub smothered in magenta */{const [ox,oy]=O(4);const b=blob(g,ox,oy,PAL.g,240,[{x:128,y:160,r:78},{x:74,y:186,r:54},{x:184,y:182,r:56},{x:100,y:100,r:56},{x:160,y:98,r:58},{x:130,y:62,r:40}]);
    const fl=[];for(let i=0;i<340;i++){let x,y,k=0;do{x=b.bx0+cr()*(b.bx1-b.bx0);y=b.by0+cr()*(b.by1-b.by0);}while((!b.inside(x,y)||(y>b.cy+b.rad*.35&&cr()<.7))&&++k<60);fl.push({x,y,t:shadeT(x,y,b.cx,b.cy,b.rad)});}fl.sort((a,c)=>a.t-c.t);
    for(const f of fl){const col=PAL.p[Math.max(0,Math.min(4,Math.floor(f.t*5)))];g.fillStyle=col;for(let k=0;k<3;k++){const a=k*2.1+cr();g.beginPath();g.arc(ox+f.x+Math.cos(a)*3.2,oy+f.y+Math.sin(a)*3.2,3+cr()*2.4,0,7);g.fill();}}}
  /* 5: daisies and buttercups in grass */{const [ox,oy]=O(5);blades(g,ox,oy,PAL.g,30,40,120,110,3,6);for(let i=0;i<20;i++){const x=ox+128+(cr()-.5)*140,y=oy+120+cr()*95,yel=cr()<.3;for(let k=0;k<8;k++){const a=k*Math.PI/4;leafE(g,x+Math.cos(a)*6,y+Math.sin(a)*6,5.5,2.6,a,yel?'#f4cf3a':(k%3?'#fbfaf2':'#e6e3d6'));}g.fillStyle=yel?'#c98a1c':'#f0bb2c';g.beginPath();g.arc(x,y,3.4,0,7);g.fill();}}
  /* 6: climbing ivy, a strip that runs up a wall */{const [ox,oy]=O(6);let x=128;const stem=[];for(let y=250;y>4;y-=5){x+=(cr()-.5)*7;x=Math.max(96,Math.min(160,x));stem.push([x,y]);}g.strokeStyle='#5b4a33';g.lineWidth=3;g.beginPath();stem.forEach(([x,y],i)=>i?g.lineTo(ox+x,oy+y):g.moveTo(ox+x,oy+y));g.stroke();
    const leaves=[];stem.forEach(([x,y],i)=>{const w=18+ (1-y/256)*0;for(let k=0;k<2;k++){const sgn=k?1:-1;const lx=x+sgn*(4+cr()*(24+ (y/256)*30)),ly=y+(cr()-.5)*8;leaves.push({x:lx,y:ly,s:.8+ (y/256)*.7+cr()*.3,t:shadeT(lx,ly,128,128,128)});}});leaves.sort((a,b)=>a.t-b.t);
    for(const l of leaves){const col=PAL.g[Math.max(0,Math.min(4,Math.floor(l.t*5)))];for(const a of [-.7,0,.7])leafE(g,ox+l.x+Math.sin(a)*4*l.s,oy+l.y-Math.cos(a)*4*l.s,5.5*l.s,3.4*l.s,a,col);}}
  /* 7: greenery spilling over a wall top */{const [ox,oy]=O(7);blob(g,ox,oy,PAL.g,300,[{x:60,y:48,r:40},{x:128,y:42,r:44},{x:196,y:50,r:40},{x:96,y:70,r:34},{x:164,y:72,r:34}]);
    for(let s=0;s<11;s++){let x=20+cr()*216,y=70;const L=60+cr()*150;for(let d=0;d<L;d+=7){x+=(cr()-.5)*5;const sz=1-d/L*.6;leafE(g,ox+x,oy+y+d,6*sz,3.6*sz,cr()*3,PAL.g[1+Math.floor(cr()*4)]);}}}
  return texOf(c);}
function paintSigns(){const c=canvas(1024,512),g=c.getContext('2d');const JP='"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif';
  const V=[['やさい','#f4efe2','#2f6b3a','#2f6b3a'],['くだもの','#fff8e6','#c23b2e','#c23b2e'],['とうふ','#f1efe8','#23466e','#23466e'],['花','#fde8f0','#b3326f','#b3326f'],['パン','#f6d77a','#6b3b1e','#6b3b1e'],['喫茶','#2f4a3a','#f3ecd8','#e3c16b'],['米','#fbf6ea','#1f2a33','#b0392e'],['本','#e9f0f3','#1f3f5b','#1f3f5b']];
  V.forEach(([t,bg,fg,bd],i)=>{const x=i*128;g.fillStyle=bg;g.fillRect(x+6,6,116,372);g.strokeStyle=bd;g.lineWidth=7;g.strokeRect(x+10,10,108,364);g.lineWidth=2;g.strokeRect(x+20,20,88,344);
    const ch_=[...t],step=Math.min(96,330/ch_.length),fs=Math.min(78,step*.86);g.fillStyle=fg;g.font='700 '+fs+'px '+JP;g.textAlign='center';g.textBaseline='middle';ch_.forEach((k,j)=>g.fillText(k,x+64,24+(344-step*ch_.length)/2+step*(j+.5)));});
  /* bottom row: two shop boards, the stop sign and an address plate, a chalk board */
  const H=[['とうふ屋','#23466e','#f4efe2'],['やおや','#2f6b3a','#fbf7ea']];H.forEach(([t,bg,fg],i)=>{const x=i*256,y=384;g.fillStyle=bg;g.fillRect(x+4,y+4,248,120);g.strokeStyle=fg;g.lineWidth=4;g.strokeRect(x+12,y+12,232,104);g.fillStyle=fg;g.font='700 60px '+JP;g.textAlign='center';g.textBaseline='middle';g.fillText(t,x+128,y+66);});
  {const x=512,y=384;g.fillStyle='#fff';g.beginPath();g.moveTo(x+6,y+8);g.lineTo(x+122,y+8);g.lineTo(x+64,y+122);g.closePath();g.fill();g.fillStyle='#c8302a';g.beginPath();g.moveTo(x+16,y+14);g.lineTo(x+112,y+14);g.lineTo(x+64,y+108);g.closePath();g.fill();g.fillStyle='#fff';g.font='700 26px '+JP;g.textAlign='center';g.textBaseline='middle';g.fillText('止まれ',x+64,y+42);}
  {const x=640,y=384;g.fillStyle='#2c5aa0';g.fillRect(x+4,y+4,120,56);g.strokeStyle='#fff';g.lineWidth=3;g.strokeRect(x+9,y+9,110,46);g.fillStyle='#fff';g.font='700 24px '+JP;g.textAlign='center';g.textBaseline='middle';g.fillText('三丁目 4',x+64,y+33);
    g.fillStyle='#f2eee2';g.fillRect(x+4,y+68,120,56);g.fillStyle='#b0392e';g.font='700 26px '+JP;g.fillText('ようこそ',x+64,y+97);}
  {const x=768,y=384;g.fillStyle='#6b4a2e';g.fillRect(x+4,y+4,248,120);g.fillStyle='#2d3f33';g.fillRect(x+14,y+12,228,104);g.fillStyle='#f3f0e4';g.font='700 34px "Patrick Hand","Segoe Print",cursive';g.textAlign='center';g.fillText('OPEN',x+128,y+48);g.font='24px "Patrick Hand",cursive';g.fillText('fresh bread · tea',x+128,y+84);g.fillStyle='#e9a1c2';g.beginPath();g.arc(x+44,y+84,7,0,7);g.fill();}
  return texOf(c);}
function paintDecals(){const c=canvas(1024,512),g=c.getContext('2d');const O=i=>[(i%4)*256,Math.floor(i/4)*256];
  const dapple=(ox,oy,k)=>{const t=canvas(256,256),h=t.getContext('2d');h.fillStyle='#fff';for(let i=0;i<150*k;i++){const a=cr()*Math.PI*2,r=Math.sqrt(cr())*96;h.beginPath();h.ellipse(128+Math.cos(a)*r*1.12,128+Math.sin(a)*r*.82,8+cr()*16,6+cr()*11,cr()*3,0,7);h.fill();}
    h.globalCompositeOperation='destination-out';for(let i=0;i<50;i++){const a=cr()*Math.PI*2,r=Math.sqrt(cr())*78;h.beginPath();h.ellipse(128+Math.cos(a)*r,128+Math.sin(a)*r*.8,2+cr()*6,1.5+cr()*4,cr()*3,0,7);h.fill();}g.drawImage(t,ox,oy);};
  {const [ox,oy]=O(0);dapple(ox,oy,1);}{const [ox,oy]=O(1);dapple(ox,oy,.75);}
  /* 2: a crack */{const [ox,oy]=O(2);g.strokeStyle='rgba(255,255,255,.95)';g.lineCap='round';const br=(x,y,a,len,w,d)=>{if(d>4||len<8)return;g.lineWidth=w;g.beginPath();g.moveTo(ox+x,oy+y);let cx=x,cy=y;for(let s=0;s<len;s+=6){a+=(cr()-.5)*.7;cx+=Math.cos(a)*6;cy+=Math.sin(a)*6;g.lineTo(ox+cx,oy+cy);if(cr()<.08)br(cx,cy,a+(cr()<.5?-1:1)*(.6+cr()*.6),len*.45,w*.7,d+1);}g.stroke();};br(20,128,0,230,2.6,0);}
  /* 3: a repair patch */{const [ox,oy]=O(3);g.fillStyle='rgba(255,255,255,.55)';g.beginPath();g.moveTo(ox+30,oy+60);g.lineTo(ox+220,oy+50);g.lineTo(ox+228,oy+196);g.lineTo(ox+36,oy+206);g.closePath();g.fill();g.strokeStyle='rgba(255,255,255,.9)';g.lineWidth=3;g.stroke();}
  /* 4-5: the road marking 止まれ, white */{const ox=0,oy=256;g.fillStyle='#fff';g.font='900 150px "Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';g.textAlign='center';g.textBaseline='middle';g.save();g.translate(ox+256,oy+128);g.scale(1,1.3);g.fillText('止まれ',0,0);g.restore();}
  return texOf(c);}
function paintGutter(){const c=canvas(512,64),g=c.getContext('2d');g.fillStyle='#aaa99f';g.fillRect(0,0,512,64);g.fillStyle='#96968d';g.fillRect(0,0,512,6);g.fillRect(0,58,512,6);
  for(let i=0;i<4;i++){const x=i*128;if(i===2){g.fillStyle='#474d51';g.fillRect(x+6,10,116,44);g.fillStyle='#8b9296';for(let b=0;b<12;b++)g.fillRect(x+10+b*9.4,12,3.6,40);}else{g.fillStyle='#b6b5ab';g.fillRect(x+4,9,120,46);g.fillStyle='#8e8f88';g.fillRect(x+2,8,2,48);g.fillStyle='#9a9b93';g.fillRect(x+50,28,8,8);g.fillRect(x+70,28,8,8);}}
  for(let i=0;i<260;i++){g.fillStyle=`rgba(${cr()<.5?60:255},${cr()<.5?60:255},60,.06)`;g.fillRect(cr()*512,cr()*64,2+cr()*4,2+cr()*3);}return texOf(c,true);}

/* ---------- the kit ---------- */
let FOL,SGN,DEC,GUT,STAT,SIGN,WIRE,DECAL,DAPPLE,SHADE,MARK,GUTTER,WALLF,GROUND,B={};
function setup(){FOL=paintFoliage();SGN=paintSigns();DEC=paintDecals();GUT=paintGutter();
  STAT=new Bucket('props',sunMat(new T.MeshBasicMaterial({vertexColors:true}),1));
  SIGN=new Bucket('signs',sunMat(new T.MeshBasicMaterial({map:SGN,vertexColors:true,side:T.DoubleSide}),.6));
  WIRE=new Bucket('wires',new T.MeshBasicMaterial({vertexColors:true,depthWrite:false}),{hideN:true,order:5}); /* no depth: the ink pass would outline every cable and double its weight; drawn after the solid world so nothing paints over it */
  GROUND=new Bucket('paths',new T.MeshBasicMaterial({vertexColors:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),{ud:{roadInk:true}});
  GUTTER=new Bucket('gutters',new T.MeshBasicMaterial({map:GUT,vertexColors:true,polygonOffset:true,polygonOffsetFactor:-5,polygonOffsetUnits:-5}),{ud:{roadInk:true}});
  DECAL=new Bucket('decals',new T.MeshBasicMaterial({map:DEC,vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-7,polygonOffsetUnits:-7}),{hideN:true,order:2});
  DAPPLE=new Bucket('leafshade',new T.MeshBasicMaterial({map:DEC,vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.42,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-7,polygonOffsetUnits:-7}),{hideN:true,order:2}); /* dappled shade under trees: the strongest shapes on a sunny street */
  SHADE=new Bucket('shadows',new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.16,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-7,polygonOffsetUnits:-7}),{hideN:true,order:2});
  MARK=new Bucket('markings',new T.MeshBasicMaterial({map:DEC,vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.86,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}),{hideN:true,order:1});
  {const cutM=new T.MeshBasicMaterial({map:FOL,vertexColors:true,alphaTest:.5,side:T.DoubleSide});WALLF=new Bucket('wallplants',cutM,{ud:{inkMat:new T.ShaderMaterial({uniforms:{map:{value:FOL}},vertexShader:CUT_VS,fragmentShader:INK_FS,side:T.DoubleSide})}});}
  const cell=i=>{const x=(i%4)*.25,y=Math.floor(i/4);const pad=3/1024,padv=3/512;return [x+pad,1-(y+1)*.5+padv,x+.25-pad,1-y*.5-padv];}; /* canvas y runs down, uv v runs up */
  B.weed=new Bill('weeds',FOL,cell(0),{tilt:.25,sway:.07});B.rosette=new Bill('rosettes',FOL,cell(1),{tilt:.45,sway:.03});B.shrub=new Bill('shrubs',FOL,cell(2),{tilt:.45,sway:.02});B.shrubD=new Bill('shrubsDark',FOL,cell(3),{tilt:.45,sway:.02});
  B.boug=new Bill('bougainvillea',FOL,cell(4),{tilt:.4,sway:.03});B.daisy=new Bill('daisies',FOL,cell(5),{tilt:.3,sway:.06});B.cellVine=cell(6);B.cellDrape=cell(7);B.cell=cell;}
const SC=(i,w,h,W,H)=>{/* a rectangle of the sign atlas, in pixels, as uv */return [i[0]/1024,1-(i[1]+h)/512,(i[0]+w)/1024,1-i[1]/512];};

/* a builder for small parts in a local frame (a Matrix4): boxes, cylinders, rods between two points */
function kit(base,bk){bk=bk||STAT;return{
  box(w,h,d,c,x,y,z,ry,rx,rz){bk.add(new T.BoxGeometry(w,h,d),mul(base,mRot(x,y,z,ry,rx,rz)),c);return this;},
  cyl(rt,rb,h,c,x,y,z,seg,rx,rz,ry){bk.add(new T.CylinderGeometry(rt,rb,h,seg||8),mul(base,mRot(x,y,z,ry,rx,rz)),c);return this;},
  tor(r,t,c,x,y,z,ry,rx){bk.add(new T.TorusGeometry(r,t,5,18),mul(base,mRot(x,y,z,ry,rx)),c);return this;},
  rod(a,b,r,c,seg){const d=b.clone().sub(a),len=d.length();const q=new T.Quaternion().setFromUnitVectors(V3(0,1,0),d.normalize());const m=new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,V3(1,1,1));bk.add(new T.CylinderGeometry(r,r,len,seg||6),mul(base,m),c);return this;},
  quad(w,h,uvr,x,y,z,ry,rx){SIGN.add(new T.PlaneGeometry(w,h),mul(base,mRot(x,y,z,ry,rx)),0xffffff,uvr,0);return this;}};}

/* ground-hugging geometry: every vertex laid on the ground under it */
function groundQuad(bk,n,f,w,h,uvr,lift,col,seg){seg=seg||4;const Y=n.clone(),Z=f.clone().addScaledVector(n,-f.dot(n)).normalize(),X=new T.Vector3().crossVectors(Y,Z);const P=[],N=[],U=[];const pt=(i,j)=>{const x=(i/seg-.5)*w,z=(j/seg-.5)*h;const q=tn(n,X.clone().multiplyScalar(x).addScaledVector(Z,z));return {p:onG(q,lift),n:q,u:uvr[0]+(uvr[2]-uvr[0])*(i/seg),v:uvr[1]+(uvr[3]-uvr[1])*(j/seg)};};
  for(let i=0;i<seg;i++)for(let j=0;j<seg;j++){const a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);for(const v of [a,b,c,a,c,d]){P.push(v.p.x,v.p.y,v.p.z);N.push(v.n.x,v.n.y,v.n.z);U.push(v.u,v.v);}}bk.addRaw(P,N,U,col);}
function groundStrip(bk,pts,w,lift,col,uRep,vr){const P=[],N=[],U=[];const L=[],Rr=[];for(let i=0;i<pts.length;i++){const n=pts[i];const t=(i<pts.length-1?pts[i+1].clone().sub(n):n.clone().sub(pts[i-1]));t.addScaledVector(n,-t.dot(n)).normalize();const s=new T.Vector3().crossVectors(n,t).normalize();L.push(tn(n,s.clone().multiplyScalar(w/2)));Rr.push(tn(n,s.clone().multiplyScalar(-w/2)));}
  let u=0;const v0=vr?vr[0]:0,v1=vr?vr[1]:1;for(let i=0;i<pts.length-1;i++){const du=uRep?pts[i].distanceTo(pts[i+1])*R/uRep:0;const q=[[L[i],u,v1],[Rr[i],u,v0],[Rr[i+1],u+du,v0],[L[i],u,v1],[Rr[i+1],u+du,v0],[L[i+1],u+du,v1]];for(const [n,uu,vv] of q){const p=onG(n,lift);P.push(p.x,p.y,p.z);N.push(n.x,n.y,n.z);U.push(uu,vv);}u+=du;}bk.addRaw(P,N,U,col);}
function tube(bk,pts,r,col){const P=[],N=[],ring=[];for(let i=0;i<pts.length;i++){const t=(i<pts.length-1?pts[i+1].clone().sub(pts[i]):pts[i].clone().sub(pts[i-1])).normalize();let a=new T.Vector3().crossVectors(t,pts[i].clone().normalize());if(a.lengthSq()<1e-6)a=new T.Vector3().crossVectors(t,V3(1,0,0));a.normalize();const b=new T.Vector3().crossVectors(t,a).normalize();const rg=[];for(let k=0;k<4;k++){const an=k*Math.PI/2+Math.PI/4,d=a.clone().multiplyScalar(Math.cos(an)).addScaledVector(b,Math.sin(an));rg.push({p:pts[i].clone().addScaledVector(d,r),n:d});}ring.push(rg);}
  for(let i=0;i<ring.length-1;i++)for(let k=0;k<4;k++){const k2=(k+1)%4;for(const v of [ring[i][k],ring[i+1][k],ring[i+1][k2],ring[i][k],ring[i+1][k2],ring[i][k2]]){P.push(v.p.x,v.p.y,v.p.z);N.push(v.n.x,v.n.y,v.n.z);}}bk.addRaw(P,N,null,col);}
/* a sagging cable between two points, with its shadow laid on the ground beneath */
function cable(A,B,sag,r,col,shadow){if(shadow===undefined)shadow=r>.015;const N=Math.max(6,Math.min(22,Math.round(A.distanceTo(B)/.7)));const um=A.clone().add(B).normalize();const pts=[];for(let i=0;i<=N;i++){const t=i/N;pts.push(A.clone().lerp(B,t).addScaledVector(um,-sag*4*t*(1-t)));}tube(WIRE,pts,r,col||0x333c44);
  if(shadow!==false){const g=pts.map(p=>{const n=p.clone().normalize();return tn(n,shadowOff(n,p.length()-gAt(n)));});groundStrip(SHADE,g,Math.max(.03,r*2),.1,0x1c2a40);}return pts;}

/* ---------- the pieces ---------- */
const POLE_H=7.4;
function pole(n,toRoad,o){const base=basisM(n,toRoad);base.setPosition(onG(n,-.05));const p=kit(base);const H=POLE_H;
  p.cyl(.085,.125,H,0xbdb7a8,0,H/2,0,10);for(let i=0;i<7;i++)p.cyl(.133,.133,.22,i%2?0x2b2b2b:0xf0c23a,0,.36+i*.22,0,10); /* the yellow-and-black guard at the foot */
  p.box(1.6,.09,.09,0x62676a,0,6.95,0);for(const x of [-.66,0,.66])p.cyl(.035,.05,.13,0xebe6d9,x,7.06,0,6);
  p.box(1.1,.08,.08,0x62676a,0,6.4,0);for(const x of [-.44,.44])p.cyl(.035,.05,.12,0xebe6d9,x,6.5,0,6);
  if(o.tr){p.cyl(.24,.24,.78,0x9ea6a8,0,5.25,-.36,12);p.cyl(.25,.25,.05,0x7f878a,0,5.66,-.36,12);p.box(.1,.5,.24,0x62676a,0,5.25,-.16);p.rod(V3(-.1,5.62,-.36),V3(-.3,6.4,0),.02,0x2b3238);p.rod(V3(.1,5.62,-.36),V3(.3,6.4,0),.02,0x2b3238);}
  if(o.lamp){p.rod(V3(0,5.0,.05),V3(0,5.4,1.1),.035,0x7c8184);p.box(.2,.1,.46,0xeeeadc,0,5.36,1.25);p.box(.16,.03,.36,0xfff6cf,0,5.3,1.25);}
  for(let i=0;i<8;i++)p.box(.24,.035,.035,0x55595c,(i%2?1:-1)*.13,2.5+i*.42,0);
  if(o.box){p.box(.3,.44,.17,0x8e9699,0,3.3,-.2);p.rod(V3(0,3.52,-.2),V3(0,5.2,-.12),.02,0x2b3238);}
  p.box(.28,.52,.025,0x2c5aa0,0,2.35,.14);p.quad(.26,.26,SC([640,384],128,64),0,2.47,.155);p.quad(.26,.26,SC([640,452],128,64),0,2.22,.155);
  for(let i=0;i<3;i++){const a=rr()*6.28;B[i?'weed':'rosette'].add(tn(n,V3(Math.cos(a),0,Math.sin(a)).addScaledVector(n,-n.dot(V3(Math.cos(a),0,Math.sin(a)))).normalize().multiplyScalar(.2+rr()*.12)),rb(.22,.4),rb(.2,.36),rb(.85,1.05));}
  const att=k=>V3(...k).applyMatrix4(base);
  solids.push({c:n.clone().multiplyScalar(R),r:.2});
  groundStrip(SHADE,[n,tn(n,shadowOff(n,H*.97))],.2,.1,0x1c2a40);
  return {n,base,top:[att([-.66,7.12,0]),att([0,7.12,0]),att([.66,7.12,0])],mid:[att([-.44,6.56,0]),att([.44,6.56,0])],tel:[att([0,5.8,-.15]),att([0,5.5,-.15])],drop:att([0,6.2,.1])};}
function bike(n,f){const base=basisM(n,f);base.setPosition(onG(n,0));const p=kit(base);const col=rp([0xc84b3a,0x3a6fb0,0xe8e2d0,0x2f7d6b,0x2a2a2a]);
  p.tor(.3,.025,0x2a2d30,-.52,.32,0,Math.PI/2);p.tor(.3,.025,0x2a2d30,.52,.32,0,Math.PI/2);
  const A=V3(-.52,.32,0),Bk=V3(.52,.32,0),Cr=V3(-.05,.34,0),Se=V3(-.2,.86,0),Hd=V3(.38,.9,0);p.rod(A,Cr,.022,col).rod(Cr,Se,.024,col).rod(Se,Hd,.024,col).rod(Cr,Hd,.024,col).rod(A,Se,.018,col).rod(Hd,Bk,.022,col);
  p.box(.24,.05,.1,0x2a2a2a,-.22,.9,0);p.box(.05,.04,.52,0x3a3d40,.4,.97,0);p.box(.3,.2,.3,0x9aa0a4,.62,.86,0);return base;}
function pot(n,kind,sz){const base=basisM(n,V3(0,0,1));base.setPosition(onG(n,0));const p=kit(base);const col=rp([0xb8643c,0xb8643c,0xa75535,0x3f6ea3,0x9aa0a0,0xd9d3c3,0x5c7a4e]);const h=.22+sz*.25,r=.14+sz*.14;
  if(kind==='box'){p.box(r*3.2,h*.8,r*1.5,col,0,h*.4,0);}else{p.cyl(r,r*.72,h,col,0,h/2,0,10);p.cyl(r*1.06,r*1.06,.04,col,0,h-.02,0,10);}
  return {n,h};}
function crate(base,x,y,z,col){kit(base).box(.46,.28,.34,col,x,y+.14,z).box(.4,.03,.36,0x1a1a1a,x,y+.27,z);}
function acUnit(base,x,y,z,ry){const p=kit(base);p.box(.74,.54,.27,0xe9e6dc,x,y,z,ry);const q=mul(base,mRot(x,y,z,ry));const k=kit(q);k.cyl(.19,.19,.03,0x6f777b,.1,0,.14,14,Math.PI/2);k.cyl(.05,.05,.04,0x3a3f42,.1,0,.15,8,Math.PI/2);k.box(.18,.4,.02,0xd6d2c6,-.22,0,.14);}

/* ---------- a building's cluster: pipes, meters, air-con, pots, bikes, signs, vines ---------- */
const RAY=new T.Raycaster();
function dressBuilding(b,isShop){const inst=b.inst,[x0,x1,z0,z1]=b.foot,sc=b.sc,W2=(x1-x0)/2*sc,mx=(x0+x1)/2;inst.updateMatrixWorld(true);const q=inst.quaternion.clone();
  const wallAt=(xm,ym)=>{const o=inst.localToWorld(V3(mx+xm/sc,ym/sc,z1+3/sc)),t=inst.localToWorld(V3(mx+xm/sc,ym/sc,z1-5/sc));const d=t.sub(o);const len=d.length();RAY.set(o,d.normalize());RAY.far=len;const h=RAY.intersectObject(inst,true);return h.length?3-h[0].distance:null;}; /* metres in front of the base's front edge where the wall really is at that height */
  const sideAt=(zm,ym,sg)=>{const o=inst.localToWorld(V3(mx+sg*(W2+3)/sc,ym/sc,z1+zm/sc)),t=inst.localToWorld(V3(mx,ym/sc,z1+zm/sc));const d=t.sub(o);const len=d.length();RAY.set(o,d.normalize());RAY.far=len;const h=RAY.intersectObject(inst,true);return h.length?W2+3-h[0].distance:null;};
  const wp=(xm,ym,zm)=>inst.localToWorld(V3(mx+xm/sc,ym/sc,z1+zm/sc));const front=V3(0,0,1).applyQuaternion(q),side=V3(1,0,0).applyQuaternion(q);
  const wallM=(xm,ym,zm)=>new T.Matrix4().compose(wp(xm,ym,zm),q,V3(1,1,1));const gp=(xm,zm)=>wp(xm,0,zm).normalize();const H=b.top;
  const free=(xm,zm,r)=>{const n=gp(xm,zm);return !solidHit(n,r||.05)&&!doorNear(n,1.1)&&roadDist(n,[MAIN])>-1.0;}; /* never out over the kerb half of the pavement */
  const cs=ch(.5)?1:-1; /* which corner gets the pipe */
  let px=cs*(W2-.14),pz=null;for(const f of [0,.4,.8,1.2]){px=cs*(W2-.14-f);pz=wallAt(px,2.2);if(pz!==null&&Math.abs(pz-(wallAt(px,.4)??pz))<.35)break;pz=null;}
  if(pz!==null){const k=kit(wallM(px,0,pz+.07));const top=Math.min(H-.35,8.5);k.cyl(.045,.045,top,rp([0xd9d3c3,0x8f9a9e,0xbfc6c4]),0,top/2,0,8);k.box(.1,.1,.26,0x8f9a9e,0,top,-.1);for(let y=1;y<top;y+=1.6)k.box(.12,.04,.08,0x6d7478,0,y,-.02);} /* drainpipe with its clips, only where the wall runs straight down to the ground */
  {const mz=wallAt(-cs*(W2-.45),1.5);if(mz!==null&&mz>-1.2){const k=kit(wallM(-cs*(W2-.45),0,mz+.07));k.box(.28,.38,.12,0xd3d6d2,0,1.5,0).box(.18,.12,.02,0x2e3a40,0,1.56,.065).rod(V3(0,1.7,0),V3(0,2.9,-.02),.02,0x3a4146);}} /* electric meter and its conduit */
  const acX=sideAt(-(z1-z0)*sc*.35,2.9,-cs);if(acX!==null&&ch(.6)){acUnit(new T.Matrix4().compose(wp(-cs*(acX+.16),2.9,-(z1-z0)*sc*.35),q.clone().multiply(new T.Quaternion().setFromAxisAngle(V3(0,1,0),-cs*Math.PI/2)),V3(1,1,1)),0,0,0,0);} /* on the side wall */
  if(ch(.45)&&free(-cs*(W2-.5),.3,.1)){const n=gp(-cs*(W2-.5),.28);acUnit(basisM(n,front).setPosition(onG(n,0)),0,.28,0,0);} /* an outdoor unit on the ground */
  /* pots by the door side */
  const pc=isShop?rb(3,5):rb(2,4.5);const pside=-cs;for(let i=0;i<pc;i++){const xm=pside*(W2-.35-i*.42-rr()*.1),zm=.28+rr()*.18;if(!free(xm,zm,.02))continue;const sz=rr(),n=gp(xm,zm);const P_=pot(n,ch(.12)?'box':'pot',sz);const pl=rp(['shrub','shrub','daisy','boug','shrubD','weed']);B[pl].add(n,.45+sz*.5,.5+sz*.6,.85+rr()*.3,P_.h-.06);}
  if(ch(isShop?.3:.5)&&free(cs*(W2-1.1),.42,.05)){bike(gp(cs*(W2-1.1),.42),side.clone().multiplyScalar(ch(.5)?1:-1));}
  for(let i=0;i<4;i++){const xm=rb(-W2+.2,W2-.2),n=gp(xm,.06);if(!doorNear(n,.9))B[rp(['weed','rosette','weed'])].add(n,rb(.25,.45),rb(.2,.42),rb(.85,1.1));} /* weeds at the foot of the wall */
  if(ch(.55)){const vx=cs*(W2-.55),vh=Math.min(H*.75,rb(3,6)),vz=wallAt(vx,vh*.5),vz0=wallAt(vx,.5);if(vz!==null&&vz0!==null&&Math.abs(vz-vz0)<.3){WALLF.add(new T.PlaneGeometry(1.1,vh),mul(wallM(vx,vh/2,Math.max(vz,vz0)+.05),mRot(0,0,0)),0xffffff,B.cellVine,.08);B.shrub.add(gp(vx,Math.max(vz0,0)+.2),.8,.7,.95);}} /* ivy climbing the front */
  const sgz=wallAt(-cs*(W2-.18),2.7);if(sgz!==null&&(isShop||ch(.35))){/* a hanging sign standing out from the corner, read from along the street */const sx=-cs*(W2-.18);const k=kit(wallM(sx,2.7,sgz+.62));const si=Math.floor(rr()*8);k.box(.07,1.34,.44,0x3a3f42,0,0,0).rod(V3(0,.72,-.6),V3(0,.72,0),.02,0x3a3f42);k.quad(.42,1.3,SC([si*128,0],128,384),.04,0,0,Math.PI/2).quad(.42,1.3,SC([si*128,0],128,384),-.04,0,0,-Math.PI/2);}
  if(isShop&&free(cs*(W2+.55),.45,.35)){const nv=gp(cs*(W2+.55),.45);glb('vend2',nv,front,{solid:.45});}
  if(isShop){const n=gp(pside*(W2-1.4),.5);if(free(pside*(W2-1.4),.5,.1)){const base=basisM(n,front);base.setPosition(onG(n,0));crate(base,0,0,0,0xc8352e);crate(base,.5,0,.05,0x2d6fb3);crate(base,.02,.28,0,0xc8352e);B.daisy.add(tn(n,front.clone().multiplyScalar(.1)),.45,.35,1,.56);}
    const n2=gp(cs*(W2-1.6),.55);if(free(cs*(W2-1.6),.55,.1)){const base=basisM(n2,front);base.setPosition(onG(n2,0));const k=kit(base);k.box(.5,.8,.04,0x6b4a2e,0,.42,0,0,-.18).box(.5,.8,.04,0x6b4a2e,0,.42,-.28,0,.18);k.quad(.46,.46,SC([780,396],224,96),0,.5,.075,0,-.18);}}
}

/* ---------- a street: poles and wires, kerbs and gutters, rails, plants, shadows ---------- */
function street(o){const road=ROADS.find(r=>r.name===o.road)||MAIN,s0=o.s0,s1=o.s1;const kerb=road.kerb;const S=s=>atS(road,s);const others=ROADS.filter(r=>r!==road&&r.kind!=='track'&&r.kind!=='path'&&r.samples.some(sm=>sm.n.dot(S((s0+s1)/2).n)>Math.cos(50/R)));
  const junction=n=>roadDist(n,others)<.6;const sideOf=o.sides||[1,-1];
  /* poles: along the building side every 13 m, fewer on the other side; wires run pole to pole */
  const P={};for(const sd of sideOf){P[sd]=[];const step=sd===o.build?13:16;for(let s=s0+(sd===o.build?2:8);s<=s1;s+=step){let ok=null;for(const ds of [0,1.2,-1.2,2.4,-2.4]){const sm=S(s+ds),n=offsetFrom(sm,sd*(kerb+.32));if(!solidHit(n,.45)&&!doorNear(n,1.6)&&!junction(n)&&!(window.__POLES||[]).some(g=>g.position.clone().normalize().dot(n)>Math.cos(4.5/R))){ok={n,sm,s:s+ds};break;}}if(!ok)continue;
      const toRoad=ok.sm.side.clone().multiplyScalar(-sd);P[sd].push(Object.assign(pole(ok.n,toRoad,{tr:ch(.45),lamp:ch(.55),box:ch(.4)}),{s:ok.s}));}}
  /* existing poles along this street join the wiring */
  const old=(window.__POLES||[]).map(g=>{const n=g.position.clone().normalize();const bs=nearest(road,n);if(!bs||bs.s<s0-4||bs.s>s1+4)return null;const lat=n.clone().sub(bs.n).dot(bs.side)*R;if(Math.abs(lat)>kerb+5)return null;const t=g.position.clone().addScaledVector(n,4.7);return {n,s:bs.s,sd:Math.sign(lat),top:[t,t,t],mid:[t.clone().addScaledVector(n,-.3),t.clone().addScaledVector(n,-.3)],tel:[t.clone().addScaledVector(n,-.8),t.clone().addScaledVector(n,-1)],drop:t};}).filter(Boolean);
  for(const op of old)if(P[op.sd])P[op.sd].push(op);
  for(const sd of sideOf){const L=P[sd].sort((a,b)=>a.s-b.s);for(let i=0;i<L.length-1;i++){const a=L[i],b=L[i+1];const d=a.top[1].distanceTo(b.top[1]);if(d>19)continue;const sg=.32+d*.022;
      for(let k=0;k<3;k++)cable(a.top[k],b.top[k],sg+rr()*.12,.011);if(ch(.6))cable(a.mid[0],b.mid[0],sg+.1+rr()*.1,.011);cable(a.tel[0],b.tel[0],sg+.3,.018,0x262e35);}}
  /* across the street, now and then */
  if(P[1]&&P[-1])for(const a of P[1]){let best=null,bd=1e9;for(const b of P[-1]){const d=a.top[1].distanceTo(b.top[1]);if(d<bd){bd=d;best=b;}}if(best&&bd<17&&ch(.55)){cable(a.mid[0],best.mid[1],.5,.011);if(ch(.4))cable(a.tel[0],best.tel[0],.7,.016,0x262e35);}}
  /* rails along the drop on the far side (the skate park bank), with gaps to walk through */
  if(o.rail){const sd=o.rail,off=sd*(kerb+2.42);let run=[];const flushRun=()=>{if(run.length>1)for(let i=0;i<run.length-1;i++){const a=run[i],b=run[i+1];const A=onG(a,.62),Bp=onG(b,.62);const mid=A.clone().add(Bp).multiplyScalar(.5),X=Bp.clone().sub(A),len=X.length();X.normalize();const Y=mid.clone().normalize();const Z=new T.Vector3().crossVectors(X,Y).normalize();const Yo=new T.Vector3().crossVectors(Z,X);const m=new T.Matrix4().makeBasis(X,Yo,Z).setPosition(mid);
        kit(m).box(len+.06,.3,.05,0xf1f1ea,0,0,0).box(len+.06,.05,.09,0xdcdcd4,0,.16,0);solids.push({c:mid.clone().normalize().multiplyScalar(R),X:X.clone().addScaledVector(Y,-X.dot(Y)).normalize(),Z:Z.clone().addScaledVector(Y,-Z.dot(Y)).normalize(),hx:len/2,hz:.14,top:.95});}run=[];};
      let k=0;for(let s=s0;s<=s1;s+=2){const sm=S(s),n=offsetFrom(sm,off);const skip=junction(n)||solidHit(n,.35)||(k%6===5);k++;if(skip){flushRun();continue;}const base=basisM(n,sm.side.clone().multiplyScalar(-sd));base.setPosition(onG(n,-.05));kit(base).cyl(.05,.05,.85,0xe9e9e2,0,.42,0,8).cyl(.06,.06,.04,0xcfcfc6,0,.86,0,8);run.push(n);
        /* the bank behind the rail: flowering shrubs and weeds */
        const nb=offsetFrom(sm,sd*(kerb+2.9+rr()*.9));if(!solidHit(nb,.3)&&ch(.8)){const t=rr();if(t<.3)B.boug.add(nb,rb(1.4,2.1),rb(1.3,1.9),rb(.9,1.05));else if(t<.62)B.shrub.add(nb,rb(1,1.5),rb(.8,1.2),rb(.85,1.05));else if(t<.8)B.shrubD.add(nb,rb(1,1.4),rb(.9,1.3),1);else B.daisy.add(nb,rb(.6,.9),rb(.4,.6),1);}
        for(let j=0;j<2;j++){const nw=offsetFrom(S(s+rb(-1,1)),sd*(kerb+2.3+rr()*.3));B.weed.add(nw,rb(.3,.55),rb(.25,.5),rb(.85,1.1));}}flushRun();}
  /* gutters at the asphalt's edge, and weeds where kerb meets pavement and at the pavement's back */
  for(const sd of sideOf){let run=[];const out=()=>{if(run.length>1)groundStrip(GUTTER,run,.3,.095,0xffffff,2.4,[0,1]);run=[];};for(let s=s0;s<=s1;s+=.8){const sm=S(s),n=offsetFrom(sm,sd*(kerb-.2));if(roadDist(n,others)<1.8){out();continue;}run.push(n);}out();
    for(let s=s0;s<=s1;s+=rb(1.2,3.2)){const sm=S(s);const n=offsetFrom(sm,sd*(kerb+.1));if(junction(n)||solidHit(n,.1))continue;const c=Math.floor(rb(1,3.5));for(let j=0;j<c;j++)B[ch(.7)?'weed':'rosette'].add(offsetFrom(S(s+rb(-.3,.3)),sd*(kerb+.06+rr()*.1)),rb(.18,.32),rb(.14,.3),rb(.85,1.1));}
    for(let s=s0;s<=s1;s+=rb(.9,2.4)){const sm=S(s);const n=offsetFrom(sm,sd*(kerb+2.18+rr()*.12));if(junction(n)||solidHit(n,.05))continue;B[rp(['weed','weed','rosette','daisy'])].add(n,rb(.25,.5),rb(.2,.45),rb(.85,1.1));}}
  /* the asphalt: a few cracks and patches, lightly */
  for(let i=0;i<Math.round(9*DEN);i++){const s=rb(s0,s1),sm=S(s),n=offsetFrom(sm,rb(-kerb+.6,kerb-.6));if(junction(n))continue;const crack=ch(.65);groundQuad(DECAL,n,sm.t.clone().applyAxisAngle(sm.n,rb(-.6,.6)),crack?rb(1.6,3):rb(1.2,2),crack?rb(1.2,2):rb(1,1.6),crack?[.5,.5,.75,1]:[.75,.5,1,1],.1,crack?0x20262b:0x3a444c,3);}
  return P;}

/* the junction by the spawn: 止まれ on the side road, a stop sign and a road mirror */
function junctionKit(sideRoad){const r=ROADS.find(x=>x.name===sideRoad);if(!r)return;const n0=atS(r,0).n;const js=nearest(MAIN,n0);const sdM=Math.sign(n0.clone().sub(js.n).dot(js.side)*R+atS(r,1).n.clone().sub(js.n).dot(js.side)*R)||-1; /* which side of the main street the side road leaves from */
  const s=Math.min(2.2,r.L*.4);const sm=atS(r,s);const toMain=atS(r,0).n.clone().sub(atS(r,s+1).n);toMain.addScaledVector(sm.n,-toMain.dot(sm.n)).normalize();
  groundQuad(MARK,offsetFrom(sm,-r.kerb*.45),toMain.clone().negate(),2.2,1.3,[.02,.02,.48,.48],.1,0xffffff,4); /* 止まれ, read by whoever walks up to the main street */
  const corner=k=>offsetFrom(atS(MAIN,js.s+k*(r.kerb+1.5)),sdM*(MAIN.kerb+1.45));
  const nS=corner(1),nM=corner(-1);
  if(!solidHit(nS,.25)){const base=basisM(nS,toMain.clone().negate());base.setPosition(onG(nS,-.05));kit(base).cyl(.04,.04,2.3,0xc9ccce,0,1.15,0,8).box(.6,.54,.03,0xffffff,0,2.36,.02);kit(base).quad(.62,.62,SC([512,384],128,128),0,2.36,.04);kit(base).quad(.62,.62,SC([512,384],128,128),0,2.36,0,Math.PI);solids.push({c:nS.clone().multiplyScalar(R),r:.12});}
  if(!solidHit(nM,.25)){const dir=toMain.clone().negate().applyAxisAngle(nM,-.7*sdM);const base=basisM(nM,dir);base.setPosition(onG(nM,-.05));const k=kit(base);k.cyl(.04,.04,2.5,0xe9772e,0,1.25,0,8).rod(V3(0,2.45,0),V3(0,2.55,.16),.028,0xe9772e).tor(.27,.04,0xe9772e,0,2.55,.2,0,0).cyl(.25,.25,.03,0x9cc2d6,0,2.55,.19,16,Math.PI/2).cyl(.15,.15,.031,0xd9ecf4,.04,2.6,.195,12,Math.PI/2);solids.push({c:nM.clone().multiplyScalar(R),r:.12});}}

/* the building side: every building near the street gets its cluster; between them, stone walls with planting, and one path down to the beach */
function buildingSide(o){const road=ROADS.find(r=>r.name===o.road)||MAIN;const list=(window.BLDGS||[]).filter(b=>{const n=b.inst.position.clone().normalize();const bs=nearest(road,n);return bs&&bs.s>=o.s0-3&&bs.s<=o.s1+3&&n.clone().sub(bs.n).dot(bs.side)*R*o.build>0&&Math.abs(n.clone().sub(bs.n).dot(bs.side)*R)<14;});
  const spans=[];list.forEach((b,i)=>{dressBuilding(b,b.shop||i%3===1);const [x0,x1,,z1]=b.foot;const ss=[x0,x1].map(x=>{const n=b.inst.localToWorld(V3(x,0,z1)).normalize();return nearest(road,n).s;});spans.push([Math.min(...ss),Math.max(...ss)]);});
  spans.sort((a,b)=>a[0]-b[0]);const gaps=[];let prev=o.s0;for(const [a,b] of spans){if(a-prev>1.6)gaps.push([prev,a]);prev=Math.max(prev,b);}if(o.s1-prev>1.6)gaps.push([prev,o.s1]);
  let alley=null;for(const g of gaps)if(g[1]-g[0]>3.2&&(!alley||g[1]-g[0]>alley[1]-alley[0]))alley=g;
  const S=s=>atS(road,s),kerb=road.kerb,sd=o.build;
  (window.DRESS.dbg=window.DRESS.dbg||{}).gaps=gaps.map(g=>g.map(v=>+v.toFixed(1)));let walls=0;
  for(const [a,b] of gaps){const am=alley&&a===alley[0]?(a+b)/2:null;/* the stone wall along the back of the pavement, planted behind */
    for(let s=a+.4;s<b-.4;s+=1.1){if(am!==null&&Math.abs(s-am)<1.1)continue;const sm=S(s),n=offsetFrom(sm,sd*(kerb+2.5));if(solidHit(n,.2)||doorNear(n,1))continue;const base=basisM(n,sm.side.clone().multiplyScalar(-sd));base.setPosition(onG(n,-.1));kit(base).box(1.12,.85,.34,rp([0xb7b0a0,0xaaa393,0xc0b9a8]),0,.42,0).box(1.14,.07,.38,0xd6d0c0,0,.87,0);
      solids.push({c:n.clone().multiplyScalar(R),X:sm.t.clone(),Z:sm.side.clone(),hx:.56,hz:.2,top:.95});walls++;
      const nb=offsetFrom(sm,sd*(kerb+2.95+rr()*.4));const t=rr();if(t<.35)B.boug.add(nb,rb(1.3,2),rb(1.4,2),1,.2);else if(t<.7)B.shrub.add(nb,rb(1,1.4),rb(1,1.4),rb(.9,1.05),.25);else B.shrubD.add(nb,rb(1,1.3),rb(1.1,1.5),1,.25);
      if(ch(.6))WALLF.add(new T.PlaneGeometry(1.1,.7),mul(mOn(offsetFrom(sm,sd*(kerb+2.3)),sm.side.clone().multiplyScalar(-sd),.58),mRot(0,0,0)),0xffffff,B.cellDrape,.08); /* greenery spilling over the wall */
      B.weed.add(offsetFrom(sm,sd*(kerb+2.3)),rb(.25,.45),rb(.2,.38),rb(.85,1.05));}
    if(am!==null){/* the path to the beach: concrete, between low walls, with steps where it drops */const pts=[];for(let d=kerb+2.2;d<=kerb+13;d+=.6)pts.push(offsetFrom(S(am),sd*d));groundStrip(GROUND,pts,1.3,.05,0xcfc9b8);
      for(let i=0;i<pts.length-1;i+=1){const n=pts[i],n2=pts[i+1];const drop=gAt(n)-gAt(n2);if(drop>.12){const base=basisM(n2,n.clone().sub(n2));base.setPosition(onG(n2,0));kit(base).box(1.3,Math.min(.3,drop),.35,0xbdb6a5,0,Math.min(.3,drop)/2,.1);}
        for(const w of [-.85,.85]){const nw=tn(n,new T.Vector3().crossVectors(n,n2.clone().sub(n)).normalize().multiplyScalar(w));if(i%2===0&&!solidHit(nw,.05))B[rp(['weed','rosette','daisy','weed'])].add(nw,rb(.3,.55),rb(.25,.5),1);}}
      const mid=pts[Math.floor(pts.length*.55)];if(ch(1)){const tr=mid.clone();const f=new T.Vector3().crossVectors(tr,S(am).side).normalize();window.DRESS.glb('tree1',tn(tr,f.multiplyScalar(2.2)),S(am).side,{k:.8});}}}
  window.DRESS.dbg.walls=walls;return list.length;}

/* Josh's own props (vending machine, trees, bench) cloned from the game's loaded models */
const waiting=[];function glb(kind,n,f,o){o=o||{};const lib=window.__propLib||{};if(!lib[kind]){waiting.push([kind,n,f,o]);return;}const inst=new T.Group();inst.add(lib[kind].clone());if(o.k)inst.scale.setScalar(o.k);const [lo,la]=lonLatOf(n);placeOn(inst,lo,la,yawFor(lo,la,f));settle(inst);inst.traverse(m=>{if(m.isMesh)m.castShadow=!LITE;});if(o.solid)solids.push({c:n.clone().multiplyScalar(R),r:o.solid});
  if(/^tree/.test(kind)){const k=o.k||1,cell=()=>{const c=rr()<.5?0:.25;return [c+.002,.502,c+.248,.998];};groundQuad(DAPPLE,tn(n,shadowOff(n,3.4*k)),V3(rr()-.5,0,rr()-.5).addScaledVector(n,1),4.6*k,3.8*k,cell(),.1,0x1b2942,6);if(o.lean){const d=o.lean.clone().multiplyScalar(3.3*k);groundQuad(DAPPLE,tn(n,shadowOff(n,3.4*k).add(d)),V3(rr()-.5,0,rr()-.5).addScaledVector(n,1),3.6*k,3*k,cell(),.1,0x1b2942,6);}} /* its dappled shade, laid where the sun throws it (and on across the pavement for a tree leaning over the street) */G.dirty();return inst;}
window.addEventListener('planet:prop',e=>{for(let i=waiting.length-1;i>=0;i--)if(waiting[i][0]===e.detail){const w=waiting.splice(i,1)[0];glb(...w);}});

/* ground cover over the open ground round the street: tufts, rosettes, flowers, shrubs, in clumps */
function groundCover(o){const road=ROADS.find(r=>r.name===o.road)||MAIN;const S=s=>atS(road,s);const all=ROADS.filter(r=>r.kind!=='track'&&r.kind!=='path');const near=all.filter(r=>r.samples.some(sm=>sm.n.dot(S((o.s0+o.s1)/2).n)>Math.cos(50/R)));
  let placed=0;const tries=Math.round(260*DEN*(o.s1-o.s0)/60);for(let i=0;i<tries;i++){const s=rb(o.s0,o.s1),lat=o.build*rb(road.kerb+2.5,road.kerb+12);const c=offsetFrom(S(s),lat);if(roadDist(c,near)<.2||solidHit(c,.25))continue;const onSand=Math.asin(c.y)<-.228;
    const k=Math.floor(rb(2,7));for(let j=0;j<k;j++){const n=tn(c,V3(rb(-1,1),rb(-1,1),rb(-1,1)).multiplyScalar(1.1));if(roadDist(n,near)<.15||solidHit(n,.15))continue;const t=rr();
      if(onSand){if(t<.5)B.weed.add(n,rb(.4,.7),rb(.35,.6),rb(.95,1.15));continue;}
      if(t<.42)B.weed.add(n,rb(.35,.7),rb(.3,.62),rb(.82,1.12));else if(t<.62)B.rosette.add(n,rb(.3,.5),rb(.22,.36),rb(.85,1.1));else if(t<.74)B.daisy.add(n,rb(.4,.7),rb(.3,.5),1);else if(t<.88)B.shrub.add(n,rb(.8,1.4),rb(.6,1.1),rb(.85,1.05));else if(t<.95)B.shrubD.add(n,rb(.8,1.2),rb(.8,1.2),1);else B.boug.add(n,rb(1.2,1.8),rb(1.1,1.7),1);placed++;}}
  /* trees behind the buildings, so the skyline is foliage and roofs, not an empty horizon */
  let trees=0;for(let i=0;i<90&&trees<Math.round(10*DEN+1);i++){const s=rb(o.s0,o.s1),far=ch(.5)?-o.build:o.build,n=offsetFrom(S(s),far*(far===o.build?rb(road.kerb+3.2,road.kerb+5):rb(road.kerb+3.1,road.kerb+4)));if((window.DRESS.treeAt||[]).some(q=>q.dot(n)>Math.cos(4.5/R)))continue;(window.DRESS.treeAt=window.DRESS.treeAt||[]).push(n);if(solidHit(n,far===o.build?1.1:.6)||roadDist(n,near)<.5||Math.asin(n.y)<-.22)continue;glb(rp(['tree1','tree2','treeBig','treeSmall']),n,S(s).side,{k:rb(.85,1.15),solid:.45,lean:S(s).side.clone().multiplyScalar(-far)});trees++;} /* between the buildings, and along the top of the park bank where their crowns lean over the pavement */
  return placed;}

/* ---------- start: once the street's buildings are in ---------- */
const PROTO={road:'main',s0:144,s1:208,build:1,rail:-1,junction:'skate'};
let built=false,t0=performance.now();
function ready(){const T_=window.__town;if(!T_)return false;const road=MAIN;const want=T_.modelSlots.filter(sl=>{const n=sphere(sl.lon,sl.lat);const bs=nearest(road,n);return bs&&bs.s>=PROTO.s0-3&&bs.s<=PROTO.s1+3;}).length;const have=(window.BLDGS||[]).filter(b=>{const bs=nearest(road,b.inst.position.clone().normalize());return bs&&bs.s>=PROTO.s0-3&&bs.s<=PROTO.s1+3;}).length;const lib=window.__propLib||{};return (have>=want&&lib.upole&&lib.tree1)||performance.now()-t0>25000;}
function build(){if(built)return;built=true;const t=performance.now();setup();const P=street(PROTO);junctionKit(PROTO.junction);const nb=buildingSide(PROTO);const gc=groundCover(PROTO);flushAll();
  /* service drops: from the building-side poles to the nearest façades */
  for(const p of (P[PROTO.build]||[]))for(const b of (window.BLDGS||[])){const [x0,x1,,z1]=b.foot;const pts=[V3(x0*.8+x1*.2,Math.min(b.top*.66,5.2)/b.sc,z1+.05/b.sc),V3(x0*.2+x1*.8,Math.min(b.top*.62,5)/b.sc,z1+.05/b.sc)].map(v=>b.inst.localToWorld(v));for(const q of pts){const d=q.distanceTo(p.drop);if(d<11&&d>2&&ch(.6)){cable(p.drop,q,.35+d*.03,.01,0x2d353c);WIRE.add(new T.BoxGeometry(.1,.1,.06),new T.Matrix4().setPosition(q),0x6d7478);}}}
  flushAll();window.DRESS.info={ms:Math.round(performance.now()-t),buildings:nb,cover:gc,bills:BILLS.map(b=>[b.name,b.list.length]),verts:BUCKETS.map(b=>[b.name,b.P.length/3])};console.log('dress: built',JSON.stringify(window.DRESS.info));}
function poll(){if(built)return;if(ready())build();else setTimeout(poll,700);}

window.DRESS={frame(dt,now){UT.value=now/1000;},glb,look(v){LOOKU.value=v;return v;},rebuild(){location.reload();},
  async calls(){const ri=renderer.info;ri.autoReset=false;ri.reset();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const c={calls:ri.render.calls,tris:ri.render.triangles};ri.autoReset=true;return c;},buckets:BUCKETS,bills:BILLS};
setTimeout(poll,1500);
})();
