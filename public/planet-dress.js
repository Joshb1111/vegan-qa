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
function solidHit(n,pad){const A=window.__arcade;if(A&&A.covers&&A.covers(n,pad))return true; /* the walk-in arcade has walls, not one solid block */const p=n.clone().multiplyScalar(R);for(const s of solids){if(Math.abs(s.c.x-p.x)>14||Math.abs(s.c.y-p.y)>14||Math.abs(s.c.z-p.z)>14)continue;const d=p.clone().sub(s.c);if(s.r!==undefined){d.addScaledVector(n,-d.dot(n));if(d.length()<s.r+pad)return true;continue;}if(Math.abs(d.dot(s.X))<s.hx+pad&&Math.abs(d.dot(s.Z))<s.hz+pad)return true;}return false;}
const doorNear=(n,r)=>typeof DOORS!=='undefined'&&DOORS.some(d=>Math.acos(Math.min(1,n.dot(d.n)))*R<r);

/* ---------- merged meshes: one per material ---------- */
const BUCKETS=[],BILLS=[];let flushT=0;
/* OWN: the ground point(s) (unit vectors) of the piece being built, so a tree, a pole or a planter can be taken out whole later (arcClear) */
let OWN=null,ADDS=0;const owned=(f,tag,ai)=>function(){const s=OWN,n=arguments[ai||0];OWN=OWN||(n&&n.isVector3?Object.assign([n.clone().normalize()],tag?{[tag]:1}:{}):null);try{return f.apply(this,arguments);}finally{OWN=s;}};
function schedule(){clearTimeout(flushT);flushT=setTimeout(flushAll,120);}
function flushAll(){arcClear();for(const b of BUCKETS)b.flush();for(const b of BILLS)b.flush();}
class Bucket{
  constructor(name,mat,o){this.name=name;this.mat=mat;this.o=o||{};this.P=[];this.N=[];this.U=[];this.C=[];this.I=[];this.mesh=null;this.dirty=false;BUCKETS.push(this);}
  add(geo,m4,color,uvr,jit){const v0=this.P.length/3;ADDS++;this.I.push([v0,0,OWN||Object.assign([V3(m4.elements[12],m4.elements[13],m4.elements[14]).normalize()],{anon:1})]);this._add(geo,m4,color,uvr,jit);this.I[this.I.length-1][1]=this.P.length/3;}
  _add(geo,m4,color,uvr,jit){const g=geo.index?geo.toNonIndexed():geo;const pa=g.attributes.position,na=g.attributes.normal,ua=g.attributes.uv;const nm=new T.Matrix3().getNormalMatrix(m4);const p=new T.Vector3(),q=new T.Vector3();
    const c=new T.Color(color===undefined?0xffffff:color);const k=1+(rr()-.5)*2*(jit===undefined?.05:jit);const cr_=Math.min(1,c.r*k),cg=Math.min(1,c.g*k),cb=Math.min(1,c.b*k);
    for(let i=0;i<pa.count;i++){p.fromBufferAttribute(pa,i).applyMatrix4(m4);this.P.push(p.x,p.y,p.z);if(na){q.fromBufferAttribute(na,i).applyMatrix3(nm).normalize();this.N.push(q.x,q.y,q.z);}else this.N.push(0,1,0);
      if(ua){let u=ua.getX(i),v=ua.getY(i);if(uvr){u=uvr[0]+(uvr[2]-uvr[0])*u;v=uvr[1]+(uvr[3]-uvr[1])*v;}this.U.push(u,v);}else this.U.push(0,0);this.C.push(cr_,cg,cb);}
    if(g!==geo)g.dispose();geo.dispose();this.dirty=true;schedule();}
  addRaw(P,N,U,color){const v0=this.P.length/3;ADDS++;let an=OWN;if(!an){const m=V3(0,0,0);for(let i=0;i<P.length;i+=3){m.x+=P[i];m.y+=P[i+1];m.z+=P[i+2];}an=Object.assign([m.normalize()],{anon:1});}this.I.push([v0,v0+P.length/3,an]);
    const c=new T.Color(color===undefined?0xffffff:color);for(let i=0;i<P.length/3;i++){this.P.push(P[i*3],P[i*3+1],P[i*3+2]);this.N.push(N?N[i*3]:0,N?N[i*3+1]:1,N?N[i*3+2]:0);this.U.push(U?U[i*2]:0,U?U[i*2+1]:0);this.C.push(c.r,c.g,c.b);}this.dirty=true;schedule();}
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
  add(n,w,h,tint,lift){if(STAIR&&STAIR.covers(n,.5))return;ADDS++;this.list.push({n:n.clone(),w,h,tint:tint===undefined?1:tint,lift:lift||0,a:OWN});this.dirty=true;schedule();}
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
function paintFoliage(){const c=canvas(1024,768),g=c.getContext('2d');const O=i=>[(i%4)*256,Math.floor(i/4)*256];
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
  /* 8: hydrangea, blue-violet heads over big dark leaves */{const [ox,oy]=O(8);blob(g,ox,oy,PAL.b,200,[{x:128,y:176,r:70},{x:78,y:192,r:48},{x:180,y:190,r:48},{x:110,y:124,r:52},{x:156,y:128,r:50}],1.35);
    const HY=[['#2f3f86','#4a5cb4','#7485d6','#a4b2ef','#dde2fb'],['#5a3f8e','#7c5cb8','#a386d8','#c9b3ef','#efe4fb']];for(let h=0;h<8;h++){const hx=60+cr()*136,hy=80+cr()*110,hr=18+cr()*12,pal=HY[cr()<.3?1:0];for(let f=0;f<46;f++){const a=cr()*6.28,rr_=Math.sqrt(cr())*hr,x=hx+Math.cos(a)*rr_,y=hy+Math.sin(a)*rr_*.85;const t=shadeT(x,y,hx,hy,hr);g.fillStyle=pal[Math.max(0,Math.min(4,Math.floor(t*5)))];for(let k=0;k<4;k++){const b=k*1.571+a;g.beginPath();g.arc(ox+x+Math.cos(b)*2.4,oy+y+Math.sin(b)*2.4,2.4,0,7);g.fill();}}}}
  /* 9: pampas grass, pale plumes over tall blades */{const [ox,oy]=O(9);blades(g,ox,oy,PAL.y,40,120,215,70,3,6);for(let p=0;p<7;p++){let x=128+(cr()-.5)*80,y=150;const lean=(cr()-.5)*1.2,L=90+cr()*50;g.strokeStyle='#b9a878';g.lineWidth=2;g.beginPath();g.moveTo(ox+x,oy+y+60);g.quadraticCurveTo(ox+x+lean*20,oy+y,ox+x+lean*40,oy+y-L*.5);g.stroke();
      for(let k=0;k<70;k++){const t=cr(),px=x+lean*40*t+lean*10,py=y-L*.5*t-10+(cr()-.5)*12;g.strokeStyle=['#efe4c4','#e0d0a8','#fff7e2','#cdbb8c'][Math.floor(cr()*4)];g.lineWidth=1.6;g.beginPath();g.moveTo(ox+px,oy+py);g.lineTo(ox+px+(cr()-.5)*14,oy+py-4-cr()*10);g.stroke();}}}
  /* 10: a columnar cypress */{const [ox,oy]=O(10);const pts=[];for(let i=0;i<700;i++){const y=8+cr()*240,w=64*Math.pow((y-8)/240,.75)+6;const x=128+(cr()-.5)*2*w*.5;pts.push({x,y,t:shadeT(x,y,128,128,120)});}pts.sort((a,b)=>a.t-b.t);g.fillStyle=PAL.b[0];g.beginPath();g.moveTo(ox+128,oy+6);g.quadraticCurveTo(ox+170,oy+150,ox+158,oy+248);g.lineTo(ox+98,oy+248);g.quadraticCurveTo(ox+86,oy+150,ox+128,oy+6);g.fill();
    for(const q of pts)leafE(g,ox+q.x,oy+q.y,4+cr()*4,2.5+cr()*2,cr()*3,PAL.b[Math.max(0,Math.min(4,Math.floor(q.t*5)))]);g.fillStyle='#4a3a2a';g.fillRect(ox+122,oy+238,12,14);}
  /* 11: fern, fronds with paired leaflets */{const [ox,oy]=O(11);for(let f=0;f<13;f++){const a=-2.9+f*(2.55/12)+(cr()-.5)*.15,L=80+cr()*55;let x=128,y=246,ang=a;const col=PAL.g[2+Math.floor(cr()*3)];g.strokeStyle=PAL.g[1];g.lineWidth=2;for(let d=0;d<L;d+=6){const nx=x+Math.cos(ang)*6,ny=y+Math.sin(ang)*6;g.beginPath();g.moveTo(ox+x,oy+y);g.lineTo(ox+nx,oy+ny);g.stroke();const sz=(1-d/L)*1+.25;pointed(g,ox+nx,oy+ny,11*sz,3.2*sz,ang-1.2,col);pointed(g,ox+nx,oy+ny,11*sz,3.2*sz,ang+1.2,col);x=nx;y=ny;ang+=.03*(a<-1.57?-1:1);}}}
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
function setup(){{const cam=G.scene.children.find(o=>o.isCamera);RAY.camera=RAYD.camera=cam;} /* the raycasts meet sprites on some models */FOL=paintFoliage();SGN=paintSigns();DEC=paintDecals();GUT=paintGutter();
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
  const cell=i=>{const x=(i%4)*.25,y=Math.floor(i/4);const pad=3/1024,padv=3/768;return [x+pad,1-(y+1)/3+padv,x+.25-pad,1-y/3-padv];}; /* canvas y runs down, uv v runs up */
  B.weed=new Bill('weeds',FOL,cell(0),{tilt:.25,sway:.07});B.rosette=new Bill('rosettes',FOL,cell(1),{tilt:.45,sway:.03});B.shrub=new Bill('shrubs',FOL,cell(2),{tilt:.45,sway:.02});B.shrubD=new Bill('shrubsDark',FOL,cell(3),{tilt:.45,sway:.02});
  B.boug=new Bill('bougainvillea',FOL,cell(4),{tilt:.4,sway:.03});B.daisy=new Bill('daisies',FOL,cell(5),{tilt:.3,sway:.06});B.cellVine=cell(6);B.cellDrape=cell(7);B.cell=cell;
  B.hyd=new Bill('hydrangea',FOL,cell(8),{tilt:.45,sway:.02});B.pampas=new Bill('pampas',FOL,cell(9),{tilt:.2,sway:.09});B.cyp=new Bill('cypress',FOL,cell(10),{tilt:.15,sway:.015});B.fern=new Bill('ferns',FOL,cell(11),{tilt:.45,sway:.04});}
/* one planting, chosen with variety: most are green; the pink is an accent, not the rule */
function plant(n,lift,big){const t=rr(),k=big?1.25:1;
  if(t<.13)B.boug.add(n,rb(1.1,1.8)*k,rb(.9,1.6)*k,rp([1,.92,0xffd6e6,0xe8c8ff]),lift);else if(t<.29)B.hyd.add(n,rb(.9,1.3)*k,rb(.8,1.2)*k,rb(.9,1.05),lift);else if(t<.5)B.shrub.add(n,rb(.8,1.6)*k,rb(.6,1.3)*k,rb(.85,1.05),lift);else if(t<.63)B.shrubD.add(n,rb(.8,1.3)*k,rb(.9,1.5)*k,1,lift);
  else if(t<.75)B.pampas.add(n,rb(.9,1.3)*k,rb(1.1,1.7)*k,1,lift);else if(t<.87)B.fern.add(n,rb(.7,1.1)*k,rb(.5,.8)*k,rb(.9,1.1),lift);else B.cyp.add(n,rb(.6,.9)*k,rb(1.8,2.8)*k,1,lift);}
const SC=(i,w,h,W,H)=>{/* a rectangle of the sign atlas, in pixels, as uv */return [i[0]/1024,1-(i[1]+h)/512,(i[0]+w)/1024,1-i[1]/512];};

/* a builder for small parts in a local frame (a Matrix4): boxes, cylinders, rods between two points */
function kit(base,bk){bk=bk||STAT;return ownKit(base,{
  box(w,h,d,c,x,y,z,ry,rx,rz){bk.add(new T.BoxGeometry(w,h,d),mul(base,mRot(x,y,z,ry,rx,rz)),c);return this;},
  cyl(rt,rb,h,c,x,y,z,seg,rx,rz,ry){bk.add(new T.CylinderGeometry(rt,rb,h,seg||8),mul(base,mRot(x,y,z,ry,rx,rz)),c);return this;},
  tor(r,t,c,x,y,z,ry,rx){bk.add(new T.TorusGeometry(r,t,5,18),mul(base,mRot(x,y,z,ry,rx)),c);return this;},
  rod(a,b,r,c,seg){const d=b.clone().sub(a),len=d.length();const q=new T.Quaternion().setFromUnitVectors(V3(0,1,0),d.normalize());const m=new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),q,V3(1,1,1));bk.add(new T.CylinderGeometry(r,r,len,seg||6),mul(base,m),c);return this;},
  quad(w,h,uvr,x,y,z,ry,rx){SIGN.add(new T.PlaneGeometry(w,h),mul(base,mRot(x,y,z,ry,rx)),0xffffff,uvr,0);return this;}});}
/* every part a kit adds belongs to the kit's base point (or the piece being built round it), not to wherever the part sits */
function ownKit(base,o){const an=OWN||[V3(base.elements[12],base.elements[13],base.elements[14]).normalize()];for(const k in o){const f=o[k];o[k]=function(){const s=OWN;OWN=an;try{f.apply(o,arguments);}finally{OWN=s;}return o;};}return o;}

/* ground-hugging geometry: every vertex laid on the ground under it */
function groundQuad(bk,n,f,w,h,uvr,lift,col,seg){seg=seg||4;const Y=n.clone(),Z=f.clone().addScaledVector(n,-f.dot(n)).normalize(),X=new T.Vector3().crossVectors(Y,Z);const P=[],N=[],U=[];const pt=(i,j)=>{const x=(i/seg-.5)*w,z=(j/seg-.5)*h;const q=tn(n,X.clone().multiplyScalar(x).addScaledVector(Z,z));return {p:onG(q,lift),n:q,u:uvr[0]+(uvr[2]-uvr[0])*(i/seg),v:uvr[1]+(uvr[3]-uvr[1])*(j/seg)};};
  for(let i=0;i<seg;i++)for(let j=0;j<seg;j++){const a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);for(const v of [a,b,c,a,c,d]){P.push(v.p.x,v.p.y,v.p.z);N.push(v.n.x,v.n.y,v.n.z);U.push(v.u,v.v);}}bk.addRaw(P,N,U,col);}
function groundStrip(bk,pts,w,lift,col,uRep,vr){const P=[],N=[],U=[];const L=[],Rr=[];for(let i=0;i<pts.length;i++){const n=pts[i];const t=(i<pts.length-1?pts[i+1].clone().sub(n):n.clone().sub(pts[i-1]));t.addScaledVector(n,-t.dot(n)).normalize();const s=new T.Vector3().crossVectors(n,t).normalize();L.push(tn(n,s.clone().multiplyScalar(w/2)));Rr.push(tn(n,s.clone().multiplyScalar(-w/2)));}
  let u=0;const v0=vr?vr[0]:0,v1=vr?vr[1]:1;for(let i=0;i<pts.length-1;i++){const du=uRep?pts[i].distanceTo(pts[i+1])*R/uRep:0;const q=[[L[i],u,v1],[Rr[i],u,v0],[Rr[i+1],u+du,v0],[L[i],u,v1],[Rr[i+1],u+du,v0],[L[i+1],u+du,v1]];for(const [n,uu,vv] of q){const p=onG(n,lift);P.push(p.x,p.y,p.z);N.push(n.x,n.y,n.z);U.push(uu,vv);}u+=du;}bk.addRaw(P,N,U,col);}
function tube(bk,pts,r,col){const P=[],N=[],ring=[];for(let i=0;i<pts.length;i++){const t=(i<pts.length-1?pts[i+1].clone().sub(pts[i]):pts[i].clone().sub(pts[i-1])).normalize();let a=new T.Vector3().crossVectors(t,pts[i].clone().normalize());if(a.lengthSq()<1e-6)a=new T.Vector3().crossVectors(t,V3(1,0,0));a.normalize();const b=new T.Vector3().crossVectors(t,a).normalize();const rg=[];for(let k=0;k<4;k++){const an=k*Math.PI/2+Math.PI/4,d=a.clone().multiplyScalar(Math.cos(an)).addScaledVector(b,Math.sin(an));rg.push({p:pts[i].clone().addScaledVector(d,r),n:d});}ring.push(rg);}
  for(let i=0;i<ring.length-1;i++)for(let k=0;k<4;k++){const k2=(k+1)%4;for(const v of [ring[i][k],ring[i+1][k],ring[i+1][k2],ring[i][k],ring[i+1][k2],ring[i][k2]]){P.push(v.p.x,v.p.y,v.p.z);N.push(v.n.x,v.n.y,v.n.z);}}bk.addRaw(P,N,null,col);}
/* a sagging cable between two points, with its shadow laid on the ground beneath */
function cable(A,B,sag,r,col,shadow){if(shadow===undefined)shadow=r>.015;const N=Math.max(6,Math.min(22,Math.round(A.distanceTo(B)/.7)));const um=A.clone().add(B).normalize();
  for(let it=0;it<4;it++){let low=1e9;for(let i=1;i<N;i++){const t=i/N,p=A.clone().lerp(B,t).addScaledVector(um,-sag*4*t*(1-t));low=Math.min(low,p.length()-gAt(p.clone().normalize()));}if(low>=4.3)break;sag=Math.max(.05,sag-(4.3-low));} /* never low enough to cut across the view at head height */const pts=[];for(let i=0;i<=N;i++){const t=i/N;pts.push(A.clone().lerp(B,t).addScaledVector(um,-sag*4*t*(1-t)));}tube(WIRE,pts,r,col||0x333c44);
  if(shadow!==false){const g=pts.map(p=>{const n=p.clone().normalize();return tn(n,shadowOff(n,p.length()-gAt(n)));});groundStrip(SHADE,g,Math.max(.03,r*2),.1,0x1c2a40);}return pts;}

/* ---------- the pieces ---------- */
const POLE_H=7.4;
function pole(n,toRoad,o){const base=basisM(n,toRoad);base.setPosition(onG(n,-.05));const p=kit(base);const H=o.H||POLE_H,d=H-POLE_H;
  p.cyl(.085,.125,H,rp([0xbdb7a8,0xc6c2b6,0xb1ada2,0xc9c3b3]),0,H/2,0,10);const gd=o.guard||'none';
  if(gd==='stripe')for(let i=0;i<7;i++)p.cyl(.133,.133,.22,i%2?0x2b2b2b:0xf0c23a,0,.36+i*.22,0,10); /* the yellow-and-black guard: on the odd pole, not every one */
  else if(gd==='sleeve')p.cyl(.132,.132,1.5,rp([0x8f918c,0x9c9a92,0x7f8a86]),0,.8,0,10);else if(gd==='band')p.cyl(.13,.13,.3,0xe9e5d8,0,1.9,0,10);
  p.box(1.6,.09,.09,0x62676a,0,6.95+d,0);for(const x of [-.66,0,.66])p.cyl(.035,.05,.13,0xebe6d9,x,7.06+d,0,6);
  p.box(1.1,.08,.08,0x62676a,0,6.4+d,0);for(const x of [-.44,.44])p.cyl(.035,.05,.12,0xebe6d9,x,6.5+d,0,6);
  if(o.tr){const y=5.25+d;p.cyl(.24,.24,.78,0x9ea6a8,0,y,-.36,12);p.cyl(.25,.25,.05,0x7f878a,0,y+.41,-.36,12);p.box(.1,.5,.24,0x62676a,0,y,-.16);p.rod(V3(-.1,y+.37,-.36),V3(-.3,6.4+d,0),.02,0x2b3238);p.rod(V3(.1,y+.37,-.36),V3(.3,6.4+d,0),.02,0x2b3238);}
  if(o.lamp){p.rod(V3(0,5.0,.05),V3(0,5.4,1.1),.035,0x7c8184);p.box(.2,.1,.46,0xeeeadc,0,5.36,1.25);p.box(.16,.03,.36,0xfff6cf,0,5.3,1.25);}
  for(let i=0;i<8;i++)p.box(.24,.035,.035,0x55595c,(i%2?1:-1)*.13,2.5+i*.42,0);
  if(o.box){p.box(.3,.44,.17,0x8e9699,0,3.3,-.2);p.rod(V3(0,3.52,-.2),V3(0,5.2,-.12),.02,0x2b3238);}
  p.box(.28,.52,.025,0x2c5aa0,0,2.35,.14);p.quad(.26,.26,SC([640,384],128,64),0,2.47,.155);p.quad(.26,.26,SC([640,452],128,64),0,2.22,.155);
  for(let i=0;i<3;i++){const a=rr()*6.28;B[i?'weed':'rosette'].add(tn(n,V3(Math.cos(a),0,Math.sin(a)).addScaledVector(n,-n.dot(V3(Math.cos(a),0,Math.sin(a)))).normalize().multiplyScalar(.2+rr()*.12)),rb(.22,.4),rb(.2,.36),rb(.85,1.05));}
  const att=k=>V3(...k).applyMatrix4(base);
  solids.push({c:n.clone().multiplyScalar(R),r:.2});
  groundStrip(SHADE,[n,tn(n,shadowOff(n,H*.97))],.2,.1,0x1c2a40);
  return {n,base,top:[att([-.66,7.12+d,0]),att([0,7.12+d,0]),att([.66,7.12+d,0])],mid:[att([-.44,6.56+d,0]),att([.44,6.56+d,0])],tel:[att([0,5.8+d,-.15]),att([0,5.5+d,-.15])],drop:att([0,6.2+d,.1])};}
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
  const poleOpts=()=>{const t=rr();return {tr:ch(.45),lamp:ch(.5),box:ch(.4),H:rb(6.9,7.9),guard:t<.22?'stripe':t<.45?'sleeve':t<.6?'band':'none'};};
  const P={};for(const sd of sideOf){P[sd]=[];const step=sd===o.build?13:14;for(let s=s0+(sd===o.build?2:8);s<=(o.poleS1||s1);s+=step){let ok=null;for(const ds of [0,1.2,-1.2,2.4,-2.4]){const sm=S(s+ds),n=offsetFrom(sm,sd*(kerb+.32));if(!solidHit(n,.45)&&!doorNear(n,1.6)&&!junction(n)&&!(window.__POLES||[]).some(g=>g.position.clone().normalize().dot(n)>Math.cos(4.5/R))){ok={n,sm,s:s+ds};break;}}if(!ok)continue;
      const toRoad=ok.sm.side.clone().multiplyScalar(-sd);P[sd].push(Object.assign(pole(ok.n,toRoad,poleOpts()),{s:ok.s}));}}
  /* poles and wires carry on down a side street that leaves the far end, so the line visibly drops away over the curve */
  if(o.branch){const br=ROADS.find(r=>r.name===o.branch.road);if(br){const bsd=o.branch.side,L=[];for(let bs=o.branch.from;bs<=Math.min(br.L-2,o.branch.to);bs+=12){const sm=atS(br,bs),n=offsetFrom(sm,bsd*(br.kerb+.32));if(solidHit(n,.45)||roadDist(n,[road])<.8)continue;L.push(Object.assign(pole(n,sm.side.clone().multiplyScalar(-bsd),poleOpts()),{s:bs}));}
    const all=[...(P[1]||[]),...(P[-1]||[])];if(L.length&&all.length){let best=null,bd=1e9;for(const q of all){const dd=q.top[1].distanceTo(L[0].top[1]);if(dd<bd){bd=dd;best=q;}}if(bd<20)L.unshift(best);}
    for(let i=0;i<L.length-1;i++){const a=L[i],b=L[i+1],dd=a.top[1].distanceTo(b.top[1]);if(dd>21)continue;const sg=.32+dd*.022;for(let k=0;k<3;k++)cable(a.top[k],b.top[k],sg+rr()*.12,.011);cable(a.tel[0],b.tel[0],sg+.3,.018,0x262e35);}}}
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
      let k=0;for(let s=s0;s<=(o.railS1||s1);s+=2){const sm=S(s),n=offsetFrom(sm,off);const skip=junction(n)||solidHit(n,.35)||(k%6===5)||(STAIR&&STAIR.covers(n,.9))||gAt(n)<gAt(sm.n)-.6||gAt(offsetFrom(sm,sd*(kerb+5.2)))>gAt(sm.n)-.7; /* the rail follows the drop, and stops where the bank does */k++;if(skip){flushRun();continue;}const base=basisM(n,sm.side.clone().multiplyScalar(-sd));base.setPosition(onG(n,-.05));kit(base).cyl(.05,.05,.85,0xe9e9e2,0,.42,0,8).cyl(.06,.06,.04,0xcfcfc6,0,.86,0,8);run.push(n);
        /* the bank behind the rail: flowering shrubs and weeds */
        const nb=offsetFrom(sm,sd*(kerb+2.9+rr()*.9));if(!solidHit(nb,.3)&&ch(.7)){if(ch(.85))plant(nb,0,true);else B.daisy.add(nb,rb(.6,.9),rb(.4,.6),1);}
        for(let j=0;j<2;j++){const nw=offsetFrom(S(s+rb(-1,1)),sd*(kerb+2.3+rr()*.3));B.weed.add(nw,rb(.3,.55),rb(.25,.5),rb(.85,1.1));}}flushRun();}
  /* gutters at the asphalt's edge, and weeds where kerb meets pavement and at the pavement's back */
  for(const sd of sideOf){let run=[];const out=()=>{if(run.length>1&&window.__gutters)groundStrip(GUTTER,run,.3,.095,0xffffff,2.4,[0,1]);run=[];}; /* Josh 9 Oct: the gutter strips with grates looked odd (and ran over the arcade steps): off */for(let s=s0;s<=s1;s+=.8){const sm=S(s),n=offsetFrom(sm,sd*(kerb-.2));if(roadDist(n,others)<1.8){out();continue;}run.push(n);}out();
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
function buildingSide(o){sd_=o.seedB||sd_; /* each section draws from its own seed, so changing one never reshuffles another (this one is the approved shop street) */const road=ROADS.find(r=>r.name===o.road)||MAIN;const list=(window.BLDGS||[]).filter(b=>{const n=b.inst.position.clone().normalize();const bs=nearest(road,n);return bs&&bs.s>=o.s0-3&&bs.s<=o.s1+3&&n.clone().sub(bs.n).dot(bs.side)*R*o.build>0&&Math.abs(n.clone().sub(bs.n).dot(bs.side)*R)<14;});
  const sOf=b=>nearest(road,b.inst.position.clone().normalize()).s;const rank=b=>{const k=(o.order||[]).indexOf(b.key);return k<0?100+sOf(b):k;};list.sort((a,b)=>rank(a)-rank(b)); /* models finish loading in any order; the dressing must not depend on it */
  const spans=[];list.forEach((b,i)=>{dressBuilding(b,b.shop||i%3===1);const [x0,x1,,z1]=b.foot;const ss=[x0,x1].map(x=>{const n=b.inst.localToWorld(V3(x,0,z1)).normalize();return nearest(road,n).s;});spans.push([Math.min(...ss),Math.max(...ss)]);});
  spans.sort((a,b)=>a[0]-b[0]);const gaps=[];let prev=o.s0;for(const [a,b] of spans){if(a-prev>1.6)gaps.push([prev,a]);prev=Math.max(prev,b);}if(o.s1-prev>1.6)gaps.push([prev,o.s1]);
  let alley=null;for(const g of gaps)if(g[1]-g[0]>3.2&&(!alley||g[1]-g[0]>alley[1]-alley[0]))alley=g;
  const S=s=>atS(road,s),kerb=road.kerb,sd=o.build;
  (window.DRESS.dbg=window.DRESS.dbg||{}).gaps=gaps.map(g=>g.map(v=>+v.toFixed(1)));let walls=0;
  for(const [a,b] of gaps){const am=alley&&a===alley[0]?(a+b)/2:null;/* the stone wall along the back of the pavement, planted behind */
    for(let s=a+.4;s<b-.4;s+=1.1){if(am!==null&&Math.abs(s-am)<1.1)continue;const sm=S(s),n=offsetFrom(sm,sd*(kerb+2.5));if(solidHit(n,.2)||doorNear(n,1))continue;const base=basisM(n,sm.side.clone().multiplyScalar(-sd));base.setPosition(onG(n,-.1));kit(base).box(1.12,.85,.34,rp([0xb7b0a0,0xaaa393,0xc0b9a8]),0,.42,0).box(1.14,.07,.38,0xd6d0c0,0,.87,0);
      solids.push({c:n.clone().multiplyScalar(R),X:sm.t.clone(),Z:sm.side.clone(),hx:.56,hz:.2,top:.95});walls++;
      const nb=offsetFrom(sm,sd*(kerb+2.95+rr()*.4));const t=rr();if(t<.35)B.boug.add(nb,rb(1.3,2),rb(1.4,2),1,.2);else if(t<.7)B.shrub.add(nb,rb(1,1.4),rb(1,1.4),rb(.9,1.05),.25);else B.shrubD.add(nb,rb(1,1.3),rb(1.1,1.5),1,.25); /* the approved shop street: left exactly as it was */
      if(ch(.6))WALLF.add(new T.PlaneGeometry(1.1,.7),mul(mOn(offsetFrom(sm,sd*(kerb+2.3)),sm.side.clone().multiplyScalar(-sd),.58),mRot(0,0,0)),0xffffff,B.cellDrape,.08); /* greenery spilling over the wall */
      B.weed.add(offsetFrom(sm,sd*(kerb+2.3)),rb(.25,.45),rb(.2,.38),rb(.85,1.05));}
    if(am!==null){/* the path to the beach: concrete, between low walls, with steps where it drops */const pts=[];for(let d=kerb+2.2;d<=kerb+13;d+=.6)pts.push(offsetFrom(S(am),sd*d));groundStrip(GROUND,pts,1.3,.05,0xcfc9b8);
      for(let i=0;i<pts.length-1;i+=1){const n=pts[i],n2=pts[i+1];const drop=gAt(n)-gAt(n2);if(drop>.12){const base=basisM(n2,n.clone().sub(n2));base.setPosition(onG(n2,0));kit(base).box(1.3,Math.min(.3,drop),.35,0xbdb6a5,0,Math.min(.3,drop)/2,.1);}
        for(const w of [-.85,.85]){const nw=tn(n,new T.Vector3().crossVectors(n,n2.clone().sub(n)).normalize().multiplyScalar(w));if(i%2===0&&!solidHit(nw,.05))B[rp(['weed','rosette','daisy','weed'])].add(nw,rb(.3,.55),rb(.25,.5),1);}}
      const mid=pts[Math.floor(pts.length*.55)];if(ch(1)){const tr=mid.clone();const f=new T.Vector3().crossVectors(tr,S(am).side).normalize();window.DRESS.glb('tree1',tn(tr,f.multiplyScalar(2.2)),S(am).side,{k:.8});}}}
  window.DRESS.dbg.walls=walls;return list.length;}

/* Josh's own props (vending machine, trees, bench) cloned from the game's loaded models */
const waiting=[];function glb(kind,n,f,o){o=o||{};const lib=window.__propLib||{};if(!lib[kind]){waiting.push([kind,n,f,o]);return;}if(/^tree/.test(kind)&&nearFire(n))return;const inst=new T.Group();inst.add(lib[kind].clone());if(o.k)inst.scale.setScalar(o.k);if(/^tree/.test(kind)){const bb=new T.Box3().setFromObject(lib[kind]);inst.userData.tree={H:(bb.max.y-bb.min.y)*(o.k||1)};}const [lo,la]=lonLatOf(n);placeOn(inst,lo,la,yawFor(lo,la,f));if(o.s2){inst.userData.s2=true;inst.updateMatrixWorld(true);const bb=new T.Box3().setFromObject(lib[kind]),k=o.k||1;const gc=gAt(inst.position.clone().normalize());let lo=gc;for(const x of [bb.min.x*.8,bb.max.x*.8])for(const z of [bb.min.z*.8,bb.max.z*.8])lo=Math.min(lo,gAt(inst.localToWorld(V3(x,0,z)).normalize()));inst.translateY(-Math.min(gc-lo,o.maxSink??.15)-(o.sink||.02));inst.updateMatrixWorld(true);} /* Street 02: grounded on the exact levels at its footprint (the coarse mesh there is sunk out of sight) */else if(o.keep){inst.translateY(-.12);inst.updateMatrixWorld(true);}else settle(inst); /* keep: on a bank top, settling would sink it down the slope */inst.traverse(m=>{if(m.isMesh)m.castShadow=!LITE;});if(o.solid)solids.push({c:n.clone().multiplyScalar(R),r:o.solid});
  if(/^tree/.test(kind)){const k=o.k||1,cell=()=>{const c=rr()<.5?0:.25;return [c+.002,.502,c+.248,.998];};groundQuad(DAPPLE,tn(n,shadowOff(n,3.4*k)),V3(rr()-.5,0,rr()-.5).addScaledVector(n,1),4.6*k,3.8*k,cell(),.1,0x1b2942,6);if(o.lean){const d=o.lean.clone().multiplyScalar(3.3*k);groundQuad(DAPPLE,tn(n,shadowOff(n,3.4*k).add(d)),V3(rr()-.5,0,rr()-.5).addScaledVector(n,1),3.6*k,3*k,cell(),.1,0x1b2942,6);}} /* its dappled shade, laid where the sun throws it (and on across the pavement for a tree leaning over the street) */G.dirty();return inst;}
window.addEventListener('planet:prop',e=>{for(let i=waiting.length-1;i>=0;i--)if(waiting[i][0]===e.detail){const w=waiting.splice(i,1)[0];glb(...w);}});

/* ground cover over the open ground round the street: tufts, rosettes, flowers, shrubs, in clumps */
function groundCover(o){sd_=o.seedC||sd_;const road=ROADS.find(r=>r.name===o.road)||MAIN;const S=s=>atS(road,s);const all=ROADS.filter(r=>r.kind!=='track'&&r.kind!=='path');const near=all.filter(r=>r.samples.some(sm=>sm.n.dot(S((o.s0+o.s1)/2).n)>Math.cos(50/R)));
  let placed=0;const tries=Math.round(260*DEN*(o.s1-o.s0)/60);for(let i=0;i<tries;i++){const s=rb(o.s0,o.s1),lat=o.build*rb(road.kerb+2.5,road.kerb+12);const c=offsetFrom(S(s),lat);if(roadDist(c,near)<.2||solidHit(c,.25))continue;const onSand=Math.asin(c.y)<-.228;
    const k=Math.floor(rb(2,7));for(let j=0;j<k;j++){const n=tn(c,V3(rb(-1,1),rb(-1,1),rb(-1,1)).multiplyScalar(1.1));if(roadDist(n,near)<.15||solidHit(n,.15))continue;const t=rr();
      if(onSand){if(t<.5)B.weed.add(n,rb(.4,.7),rb(.35,.6),rb(.95,1.15));continue;}
      if(t<.42)B.weed.add(n,rb(.35,.7),rb(.3,.62),rb(.82,1.12));else if(t<.62)B.rosette.add(n,rb(.3,.5),rb(.22,.36),rb(.85,1.1));else if(t<.74)B.daisy.add(n,rb(.4,.7),rb(.3,.5),1);else if(t<.8)B.fern.add(n,rb(.5,.9),rb(.35,.6),rb(.9,1.1));else if(t<.93)plant(n,0);else B.pampas.add(n,rb(.7,1.1),rb(.8,1.3),1);placed++;}}
  /* trees behind the buildings, so the skyline is foliage and roofs, not an empty horizon */
  let trees=0;for(let i=0;i<90&&trees<Math.round(10*DEN+1);i++){const s=rb(o.s0,o.s1),far=ch(.5)?-o.build:o.build,n=offsetFrom(S(s),far*(far===o.build?rb(road.kerb+3.2,road.kerb+5):rb(road.kerb+3.1,road.kerb+4)));if((window.DRESS.treeAt||[]).some(q=>q.dot(n)>Math.cos(4.5/R)))continue;(window.DRESS.treeAt=window.DRESS.treeAt||[]).push(n);if(solidHit(n,far===o.build?1.1:.6)||roadDist(n,near)<.5||Math.asin(n.y)<-.22)continue;glb(rp(['tree1','tree2','treeBig','treeSmall']),n,S(s).side,{k:rb(.85,1.15),solid:.45,lean:S(s).side.clone().multiplyScalar(-far)});trees++;} /* between the buildings, and along the top of the park bank where their crowns lean over the pavement */
  return placed;}

/* ---------- the crest: the world carrying on round the curve ----------
   From the spawn the street runs up to a crest about 26 m ahead; on a 50 m planet anything beyond about
   40 m is gone below it, and only tall things 30-45 m out show their upper parts. So the horizon is broken
   with what the geography already has there: tree crowns whose trunks are hidden, roofs grown with tanks
   and aerials, the pole line and its wires dropping away down the side street, and one distant tower. */
const RAYD=new T.Raycaster();const PLAZA_C=sphere(3.5,.52); /* the skate park's centre */
function roofSpots(b){const inst=b.inst,[x0,x1,z0,z1]=b.foot,sc=b.sc;inst.updateMatrixWorld(true);const upW=inst.position.clone().normalize();const out=[];
  for(let i=1;i<5;i++)for(let j=1;j<4;j++){const x=x0+(x1-x0)*i/5,z=z0+(z1-z0)*j/4;const o=inst.localToWorld(V3(x,b.top/sc+4/sc,z));RAYD.set(o,upW.clone().negate());RAYD.far=b.top+6;const h=RAYD.intersectObject(inst,true)[0];if(!h||!h.face)continue;
    const nW=h.face.normal.clone().transformDirection(h.object.matrixWorld);if(nW.dot(upW)<.93)continue;out.push({p:h.point.clone(),y:inst.worldToLocal(h.point.clone()).y*sc});}
  out.sort((a,c)=>c.y-a.y);return out;}
function rooftop(b){const spots=roofSpots(b);if(!spots.length)return 0;const upW=b.inst.position.clone().normalize();const q=b.inst.quaternion;const used=[];const far=p=>used.every(u=>u.distanceTo(p)>1.6);let n=0;
  const at=p=>new T.Matrix4().compose(p,q,V3(1,1,1));
  const top=spots.filter(sp=>sp.y>spots[0].y-.6);
  if(top.length&&ch(.75)){const sp=top[0];used.push(sp.p);const k=kit(at(sp.p));const c=rp([0xd8d6cc,0x9fb3bd,0xc9c2b0]);for(const [x,z] of [[-.5,-.5],[.5,-.5],[-.5,.5],[.5,.5]])k.cyl(.04,.04,1.2,0x6d7478,x,.6,z,6);k.box(1.1,.06,1.1,0x6d7478,0,1.2,0).cyl(.62,.62,1.3,c,0,1.88,0,14).cyl(.64,.6,.14,c,0,2.6,0,14).cyl(.08,.08,.2,0x6d7478,0,2.72,0,6);k.rod(V3(.64,1.3,0),V3(.64,2.5,0),.018,0x6d7478).rod(V3(.64,1.3,.2),V3(.64,2.5,.2),.018,0x6d7478);n++;} /* a water tank on legs */
  for(const sp of spots){if(n>=3)break;if(!far(sp.p))continue;used.push(sp.p);const k=kit(at(sp.p));const H=rb(1.8,3);k.rod(V3(0,0,0),V3(0,H,0),.025,0x8d9499);const booms=ch(.5)?2:1;for(let bI=0;bI<booms;bI++){const y=H-.1-bI*.55,L=rb(.8,1.2),ry=rr()*3.14;const m=mul(at(sp.p),mRot(0,y,0,ry));const kk=kit(m);kk.rod(V3(-L/2,0,0),V3(L/2,0,0),.012,0x8d9499);for(let e=0;e<6;e++){const x=-L/2+L*e/5,w=.46-e*.05;kk.rod(V3(x,0,-w/2),V3(x,0,w/2),.008,0x8d9499);}}n++;} /* TV aerials */
  return n;}
function fireTower(n,face,H){H=H||15.5;const base=basisM(n,face);base.setPosition(onG(n,-.1));const k=kit(base);const b0=1.35+H*.02,b1=.55,col=0x7c4a3c;const leg=(sx,sz,y)=>{const w=b0+(b1-b0)*y/H;return V3(sx*w,y,sz*w);};
  for(const [sx,sz] of [[-1,-1],[1,-1],[1,1],[-1,1]])k.rod(leg(sx,sz,0),leg(sx,sz,H),.07,col,6);
  for(let y=0;y<H-.5;y+=2.2){const y2=Math.min(H,y+2.2);const faces=[[[-1,-1],[1,-1]],[[1,-1],[1,1]],[[1,1],[-1,1]],[[-1,1],[-1,-1]]];for(const [[ax,az],[bx,bz]] of faces){k.rod(leg(ax,az,y),leg(bx,bz,y2),.035,col,5).rod(leg(bx,bz,y),leg(ax,az,y2),.035,col,5).rod(leg(ax,az,y2),leg(bx,bz,y2),.04,col,5);}}
  for(let y=.4;y<H;y+=.45){const w=b0+(b1-b0)*y/H;k.rod(V3(-.18,y,w+.05),V3(.18,y,w+.05),.015,0x5b3a30,4);}k.rod(V3(-.18,0,b0+.05),V3(-.18,H,b1+.05),.02,0x5b3a30,4).rod(V3(.18,0,b0+.05),V3(.18,H,b1+.05),.02,0x5b3a30,4); /* ladder */
  k.box(1.9,.1,1.9,0x5b3a30,0,H,0);for(const [x,z] of [[-.9,-.9],[.9,-.9],[.9,.9],[-.9,.9]])k.rod(V3(x,H,z),V3(x,H+.95,z),.03,col,5).rod(V3(x*.75,H,z*.75),V3(x*.7,H+1.9,z*.7),.035,col,5);
  for(const [a,b2] of [[[-.9,-.9],[.9,-.9]],[[.9,-.9],[.9,.9]],[[.9,.9],[-.9,.9]],[[-.9,.9],[-.9,-.9]]])k.rod(V3(a[0],H+.95,a[1]),V3(b2[0],H+.95,b2[1]),.025,col,5);
  k.cyl(.01,1.55,.9,0x4f3a33,0,H+2.3,0,4,0,0,Math.PI/4).cyl(.2,.26,.34,0x8a7a4a,0,H+1.65,0,10).cyl(.05,.05,.35,0x4f3a33,0,H+2.85,0,6); /* the roof, the bell and a finial */
  solids.push({c:n.clone().multiplyScalar(R),r:1.5});groundStrip(SHADE,[n,tn(n,shadowOff(n,H*.95))],.9,.1,0x1c2a40);return true;}
/* a floodlight mast at the skate park's far corner: tall and slender, its lamp head the thing that clears the crest */
function floodMast(n,face,H){const base=basisM(n,face);base.setPosition(onG(n,-.1));const k=kit(base);const col=0x9aa1a4;
  k.cyl(.12,.28,H,col,0,H/2,0,10).cyl(.4,.45,.3,0x7c8386,0,.15,0,10);for(let y=1.5;y<H-1;y+=.5)k.box(.2,.03,.03,0x6d7478,0,y,.16);
  k.box(1.8,.08,.08,0x6d7478,0,H-.2,.2).box(1.8,.08,.08,0x6d7478,0,H+.55,.2).rod(V3(-.9,H-.2,.2),V3(-.9,H+.55,.2),.03,0x6d7478).rod(V3(.9,H-.2,.2),V3(.9,H+.55,.2),.03,0x6d7478);
  for(let i=0;i<3;i++)for(let j=0;j<2;j++){const x=-.6+i*.6,y=H+.02+j*.38;k.box(.46,.32,.18,0x3f4548,x,y,.35,0,-.35).box(.38,.24,.02,0xf3efd9,x,y-.02,.45,0,-.35);}
  k.box(1.2,.05,.9,0x6d7478,0,H-.9,.1);for(const x of [-.6,.6])k.rod(V3(x,H-.9,-.35),V3(x,H-.35,-.35),.02,0x6d7478);
  solids.push({c:n.clone().multiplyScalar(R),r:.4});groundStrip(SHADE,[n,tn(n,shadowOff(n,H*.95))],.35,.1,0x1c2a40);}
/* a painted tree: trunk and limbs, and a crown built from overlapping painted leaf masses, the way a background painter blocks one in */
const TREE_TINT=new T.Color(0xb4dcb8); /* Josh liked the deeper, cooler green of the old model trees: every painted crown is tinted towards it */
const treeTint=b=>TREE_TINT.clone().multiplyScalar(b);
function paintedTree(n,H,f,dark,noSolid){if(nearFire(n))return;const base=basisM(n,f||V3(1,0,0));base.setPosition(onG(n,-.1));const k=kit(base);const tr=.11+H*.012;k.cyl(tr*.7,tr,H*.62,0x5b4636,0,H*.31,0,7);
  for(let i=0;i<3;i++){const a=i*2.1+rr(),y=H*(.42+.1*i);k.rod(V3(0,y,0),V3(Math.cos(a)*H*.16,y+H*.14,Math.sin(a)*H*.16),tr*.45,0x5b4636,5);}
  const Y=n.clone(),X=V3(1,0,0).cross(Y).normalize(),Z=new T.Vector3().crossVectors(X,Y);const masses=Math.round(5+H*.25);
  for(let i=0;i<masses;i++){const a=rr()*6.28,r_=rb(.2,.55)*H*.18,y=H*rb(.42,.68);const m=tn(n,X.clone().multiplyScalar(Math.cos(a)*r_).addScaledVector(Z,Math.sin(a)*r_));const w=H*rb(.3,.42);(dark&&ch(.6)?B.shrubD:B.shrub).add(m,w,w*rb(.8,.95),treeTint(rb(.88,1.06)),y);}
  B.shrub.add(n,H*.34,H*.3,treeTint(rb(.95,1.08)),H*.7); /* the sunlit top */
  if(!noSolid)solids.push({c:n.clone().multiplyScalar(R),r:.3});const c=rr()<.5?0:.25;groundQuad(DAPPLE,tn(n,shadowOff(n,H*.65)),V3(rr()-.5,0,rr()-.5).addScaledVector(n,1),H*.55,H*.45,[c+.002,.502,c+.248,.998],.1,0x1b2942,6);return true;}
function crest(o){sd_=o.seed||sd_;const road=ROADS.find(r=>r.name===o.road)||MAIN,S=s=>atS(road,s),kerb=road.kerb;const all=ROADS.filter(r=>r.kind!=='track'&&r.kind!=='path');const near=all.filter(r=>r.samples.some(sm=>sm.n.dot(S(o.c0).n)>Math.cos(50/R)));const res={trees:0,roofs:0,tower:0};
  /* tall trees just over the crest, both sides, never on the road or in the park's pit */
  const cand=[];for(let s_=o.c0;s_<=o.c1;s_+=1.3)for(const lat of [-5.3,-5.8,-6.3,-7.5,-9,6.8,8,9.5])cand.push([s_+rb(-.5,.5),lat+rb(-.2,.2),s_<o.c0+9&&lat<0&&lat>-6.5?0:1]);cand.sort((a,b)=>a[2]-b[2]||rr()-.5); /* the bank top just past the crest first: those crowns are the ones that clear it */
  const placed=(window.DRESS.treeAt=window.DRESS.treeAt||[]);
  /* two street trees in pavement pits just past the crest, one each side: their crowns stand where the road meets the sky */
  for(const [s_,lat] of (o.streetTrees||[])){let sm=null,n=null;for(const ds of [0,-1,1,-2,2,-3,3]){sm=S(s_+ds);n=offsetFrom(sm,lat);if(!solidHit(n,.28)&&!doorNear(n,1.5))break;n=null;}if(!n)continue;placed.push(n);paintedTree(n,rb(11,12.5),sm.t,false);
    const base=basisM(n,sm.t);base.setPosition(onG(n,.02));const k=kit(base);k.box(1.1,.08,.08,0x8f918c,0,0,.51).box(1.1,.08,.08,0x8f918c,0,0,-.51).box(.08,.08,1.1,0x8f918c,.51,0,0).box(.08,.08,1.1,0x8f918c,-.51,0,0);groundQuad(GROUND,n,sm.t,.95,.95,[0,0,1,1],.06,0x5a4a3a,2);B.weed.add(tn(n,sm.t.clone().multiplyScalar(.3)),.3,.25,1);res.trees++;}
  for(const [s_,lat] of cand){if(res.trees>=o.trees)break;const n=offsetFrom(S(s_),lat);if(placed.some(q=>q.dot(n)>Math.cos(4.2/R)))continue;if(roadDist(n,near)<.5||solidHit(n,.5)||Math.asin(n.y)<-.22)continue;if(gAt(n)<gAt(S(s_).n)-.5)continue;placed.push(n);paintedTree(n,rb(10,13),S(s_).t,ch(.5));res.trees++;}
  /* roofs at and over the crest */
  for(const b of [...(window.BLDGS||[])].sort((a,c)=>a.inst.position.x-c.inst.position.x||a.inst.position.z-c.inst.position.z)){const bs=nearest(road,b.inst.position.clone().normalize());if(!bs||bs.s<o.r0||bs.s>o.r1)continue;if(Math.abs(b.inst.position.clone().normalize().sub(bs.n).dot(bs.side)*R)>14)continue;res.roofs+=rooftop(b);}
  /* one distant landmark: a fire-lookout tower on the far corner, only its top above the crest from the spawn */
  const pk=n=>{const g=window.__gAt?window.__gAt(...lonLatOf(n)):null;return g?g.out:9;};
  if(o.tower){const [ta,tb]=o.tower;outer:for(let s_=ta;s_<=tb;s_+=.8)for(const lat of [-9.6,-10,-9,-8.4]){const n=offsetFrom(S(s_),lat);if(roadDist(n,near)<.4||solidHit(n,1.8)||doorNear(n,3))continue;if(pk(n)<.6||Math.asin(n.y)<-.22||gAt(n)<gAt(S(s_).n)-.6)continue;fireTower(n,S(o.c0).n.clone().sub(n),o.towerH||21);res.tower=[+s_.toFixed(1),lat];break outer;}}
  if(o.flood){const [fa,fb]=o.flood;outer2:for(let s_=fa;s_<=fb;s_+=.8)for(const lat of [-11.5,-11,-12,-10.5]){const n=offsetFrom(S(s_),lat);if(pk(n)>.01||solidHit(n,1.4))continue; /* inside the park's corner, on its floor */floodMast(n,PLAZA_C.clone().sub(n),o.floodH||16);res.flood=[+s_.toFixed(1),lat];break outer2;}}
  return res;}

/* ---------- one stair: from the street's pavement down the bank to the skate park floor ----------
   Street 01's only real drop is the bank into the skate park; elsewhere its park is reached only by the skate road
   at the junction. A stair where the bank falls ~3 m to open park floor (clear of the park's features) is a real
   short cut. It is walkable: its surface joins the game's ground through GAME.WALKS. */
let STAIR=null;
function stairSite(o){const S=s_=>atS(MAIN,s_),kerb=MAIN.kerb,sd=o.side;let best=null;for(let s_=o.s0;s_<=o.s1;s_+=.5){const sm=S(s_);const top=offsetFrom(sm,sd*(kerb+2.2)),bot=offsetFrom(sm,sd*(kerb+2.2+o.len));const drop=gAt(top)-gAt(bot);if(drop<2.4)continue;
    const pk=window.__gAt?window.__gAt(...lonLatOf(bot)).out:0;if(pk>.01)continue;let clear=true;for(let t=.35;t<=1.45;t+=.12){const q=offsetFrom(sm,sd*(kerb+2.2+o.len*t));for(const w of [-o.W/2-.3,0,o.W/2+.3])if(solidHit(tn(q,sm.t.clone().multiplyScalar(w)),.25)){clear=false;break;}if(!clear)break;}if(!clear)continue;
    const fl=Math.abs(gAt(bot)-gAt(offsetFrom(sm,sd*(kerb+3.4+o.len))));if(fl>.25)continue; /* the landing must be on level floor */
    const score=Math.abs(s_-o.pref);if(!best||score<best.score)best={s:s_,sm,top,bot,score};}
  if(!best)return null;const dir=best.sm.side.clone().multiplyScalar(sd),t=best.sm.t.clone(),n0=best.top,W=o.W,L=o.len;
  best.covers=(n,pad)=>{const d=n.clone().sub(n0);const al=d.dot(dir)*R,ac=d.dot(t)*R;return al>-1-pad&&al<L+1.2+pad&&Math.abs(ac)<W/2+pad;};best.dir=dir;best.t=t;best.W=W;best.L=L;return best;}
function buildStair(st){const {dir,t,W,L}=st,n0=st.top;const h0=gAt(n0)-R,h1=gAt(st.bot)-R;const N=Math.max(8,Math.round((h0-h1)/.2)),rise=(h0-h1)/N,run=L/N;const col=0xc2bdb0,cheek=0xaea898,rail=0x8fa6a0;
  const at=(al,ac)=>tn(n0,dir.clone().multiplyScalar(al).addScaledVector(t,ac));const frame=(n,h)=>{const m=basisM(n,dir);m.setPosition(n.clone().multiplyScalar(R+h));return m;};
  const posts=[[],[]];
  /* each tread sits on or above the ground under it (the bank's crown bulges above a straight flight), never climbing */
  const tops=[];for(let i=0;i<N;i++){const al=(i+.5)*run;let gm=-1e9;for(const ac of [-W/2,0,W/2])for(const da of [-run/2,0,run/2])gm=Math.max(gm,gAt(at(al+da,ac))-R);tops.push(Math.min(i?tops[i-1]-.02:h0,Math.max(h0-(i+.5)*rise,gm+.06)));}
  for(let i=0;i<N;i++){const al=(i+.5)*run,c=at(al,0);const top=tops[i];let gb=1e9;for(const ac of [-W/2-.2,0,W/2+.2])for(const da of [-run/2,run/2])gb=Math.min(gb,gAt(at(al+da,ac))-R);const hb=Math.min(gb,top-.25)-.2;const hh=top-hb;
    const k=kit(frame(c,(top+hb)/2));k.box(W,hh,run+.02,col,0,0,0).box(W+.02,.03,.05,0x9c9788,0,hh/2-.01,run/2-.02);
    for(const sx of [-1,1]){k.box(.16,hh+.32,run+.02,cheek,sx*(W/2+.08),.16,0);if(i%3===0||i===N-1)posts[sx<0?0:1].push(at(al,sx*(W/2+.08)).multiplyScalar(R+top+.32+.62));}}
  {const k=kit(frame(at(L+.55,0),h1+.03));k.box(W+.35,.1,1.1,col,0,0,0);} /* landing on the park floor */
  {const k=kit(frame(at(-.35,0),h0-.02));k.box(W+.35,.08,.7,col,0,0,0);} /* and a lip at the pavement */
  const K=kit(new T.Matrix4());for(const ps of posts){for(let i=0;i<ps.length;i++){const p=ps[i],base=p.clone().normalize();K.rod(p,base.clone().multiplyScalar(p.length()-.62),.025,rail,6);if(i)K.rod(ps[i-1],p,.028,rail,6);}}
  for(let i=0;i<N;i+=2)for(const sx of [-1,1]){const q=at((i+.5)*run,sx*(W/2+.35));B.weed.add(q,rb(.3,.5),rb(.25,.45),rb(.85,1.05));}B.fern.add(at(L+.4,W/2+.7),.9,.6,1);B.fern.add(at(L+.5,-W/2-.7),.8,.55,1);
  for(let i=0;i<7;i++){const sx=i%2?1:-1,q=at(rb(.6,L-.3),sx*rb(W/2+1,W/2+2.6));if(!solidHit(q,.3))(ch(.55)?plant(q,0):B[rp(['fern','pampas','weed'])].add(q,rb(.6,1),rb(.5,.9),1));} /* the bank either side, planted so the flight sits in greenery */
  const nn=n0.clone(),cosC=Math.cos((L+3)/R),d0=dir.clone(),t0=t.clone(),hw=W/2+.05;
  G.WALKS.push(n=>{if(n.dot(nn)<cosC)return null;const al=((n.x-nn.x)*d0.x+(n.y-nn.y)*d0.y+(n.z-nn.z)*d0.z)*R,ac=((n.x-nn.x)*t0.x+(n.y-nn.y)*t0.y+(n.z-nn.z)*t0.z)*R;if(al<-.1||al>L+1.05||Math.abs(ac)>hw)return null;if(al>=L)return h1+.06;const f=al/run-.5;if(f<=0)return h0+(tops[0]-h0)*Math.min(1,(al+.1)/(run*.5+.1));const i=Math.min(N-2,Math.floor(f)),u=Math.min(1,f-i);return tops[i]+(tops[i+1]-tops[i])*u;}); /* the walk follows the treads */
  return {s:+st.s.toFixed(1),steps:N,drop:+(h0-h1).toFixed(2)};}
/* the open lawns behind the shop street, towards the beach: painted trees and shrub groups, nothing more */
function lawns(o){const road=MAIN,S=s_=>atS(road,s_),kerb=road.kerb;const near=ROADS.filter(r=>r.kind!=='track'&&r.kind!=='path'&&r.samples.some(sm=>sm.n.dot(S((o.s0+o.s1)/2).n)>Math.cos(50/R)));let trees=0,groups=0;const placed=(window.DRESS.treeAt=window.DRESS.treeAt||[]);
  for(let i=0;i<220&&(trees<o.trees||groups<o.groups);i++){const s_=rb(o.s0,o.s1),lat=o.side*rb(kerb+6,kerb+14),n=offsetFrom(S(s_),lat);if(Math.asin(n.y)<-.24||roadDist(n,near)<1||solidHit(n,1))continue; /* the grass edge is about -.235 rad (the game strews its edge tufts from there) */
    if(trees<o.trees&&!placed.some(q=>q.dot(n)>Math.cos(6/R))){placed.push(n);paintedTree(n,rb(6.5,9),S(s_).t,ch(.4));trees++;for(let j=0;j<3;j++)plant(tn(n,V3(rb(-1,1),rb(-1,1),rb(-1,1)).multiplyScalar(1.6)),0);continue;}
    if(groups<o.groups){for(let j=0;j<Math.floor(rb(3,6));j++){const q=tn(n,V3(rb(-1,1),rb(-1,1),rb(-1,1)).multiplyScalar(1.2));if(!solidHit(q,.2))(ch(.5)?plant(q,0):B[rp(['fern','daisy','weed','rosette'])].add(q,rb(.5,.9),rb(.4,.7),1));}groups++;}}
  return {trees,groups};}

/* =====================================================================
   STREET 02, HILLSIDE STAIRS DISTRICT (27 Sep 2026)
   The terrain (hill, court, passage, garden terrace, sunken yard, shore path) is in the game's terrainBase; this lays
   the walls, stairs, paving and rails on it, then dresses it. Its own seed; nothing here touches Street 01.
   ===================================================================== */
function paintWall(kind){const c=canvas(512,512),g=c.getContext('2d');const r=()=>cr();
  if(kind==='stone'){g.fillStyle='#6f6a5f';g.fillRect(0,0,512,512);let y=0;while(y<512){const hgt=40+r()*34;let x=-r()*60;while(x<512){const w=50+r()*80;const col=['#a9a393','#b8b2a2','#9d978a','#c2bcac','#aba493','#948f82'][Math.floor(r()*6)];g.fillStyle=col;g.beginPath();const rx=5+r()*6;g.roundRect?g.roundRect(x+3,y+3,w-6,hgt-6,rx):g.rect(x+3,y+3,w-6,hgt-6);g.fill();
      g.fillStyle='rgba(255,255,255,.14)';g.fillRect(x+6,y+5,w-14,4);g.fillStyle='rgba(0,0,0,.14)';g.fillRect(x+6,y+hgt-10,w-12,5);x+=w;}y+=hgt;}
    for(let i=0;i<30;i++){g.fillStyle=`rgba(${60+r()*30},${90+r()*40},${50},.${2+Math.floor(r()*3)})`;const x=r()*512,y=380+r()*132;g.beginPath();g.ellipse(x,y,10+r()*24,4+r()*8,0,0,7);g.fill();} /* moss low down */}
  else if(kind==='concrete'){g.fillStyle='#b4b1a6';g.fillRect(0,0,512,512);for(let i=0;i<900;i++){g.fillStyle=`rgba(${r()<.5?80:230},${r()<.5?80:228},${r()<.5?70:220},.05)`;g.fillRect(r()*512,r()*512,3+r()*10,3+r()*8);}
    g.strokeStyle='rgba(60,60,55,.35)';g.lineWidth=2;for(const x of [0,256])g.strokeRect(x+1,1,255,510);for(let x=32;x<512;x+=64)for(let y=64;y<512;y+=128){g.fillStyle='rgba(50,50,45,.45)';g.beginPath();g.arc(x,y,3,0,7);g.fill();} /* form-tie holes */
    for(let i=0;i<26;i++){const x=r()*512,w=4+r()*10,l=60+r()*260;const gr=g.createLinearGradient(0,0,0,l);gr.addColorStop(0,'rgba(70,72,64,.28)');gr.addColorStop(1,'rgba(70,72,64,0)');g.fillStyle=gr;g.fillRect(x,0,w,l);} /* drips from the top */
    g.fillStyle='rgba(70,100,55,.25)';for(let i=0;i<40;i++){g.beginPath();g.ellipse(r()*512,470+r()*42,10+r()*20,4+r()*7,0,0,7);g.fill();}
    for(let x=64;x<512;x+=128){g.fillStyle='#4a4d4a';g.beginPath();g.arc(x,300,7,0,7);g.fill();g.fillStyle='rgba(60,70,60,.3)';g.fillRect(x-3,300,6,70);} /* weep holes with their stains */}
  else{g.fillStyle='#8f918b';g.fillRect(0,0,512,512);for(let row=0;row<8;row++)for(let col=-1;col<5;col++){const x=col*128+(row%2?64:0),y=row*64;const col_=['#b1b3ac','#a9aba4','#b8b9b2','#a3a59e'][Math.floor(r()*4)];g.fillStyle=col_;g.fillRect(x+3,y+3,122,58);g.fillStyle='rgba(0,0,0,.08)';g.fillRect(x+3,y+50,122,11);}
    for(let i=0;i<14;i++){const x=r()*512,l=40+r()*160;const gr=g.createLinearGradient(0,0,0,l);gr.addColorStop(0,'rgba(60,62,55,.25)');gr.addColorStop(1,'rgba(60,62,55,0)');g.fillStyle=gr;g.fillRect(x,0,6+r()*8,l);}}
  const t=texOf(c);t.wrapT=T.RepeatWrapping;t.wrapS=T.RepeatWrapping;return t;}
function paintPave(kind){const c=canvas(512,512),g=c.getContext('2d');
  if(kind==='setts'){g.fillStyle='#6f6b62';g.fillRect(0,0,512,512);for(let y=0;y<512;y+=42){const off=(y/42)%2?21:0;for(let x=-42;x<512;x+=44){const col=['#9c978b','#a8a397','#8f8a7f','#b1ac9f','#96917f'][Math.floor(cr()*5)];g.fillStyle=col;g.beginPath();g.roundRect?g.roundRect(x+off+3,y+3,38,36,7):g.rect(x+off+3,y+3,38,36);g.fill();g.fillStyle='rgba(255,255,255,.1)';g.fillRect(x+off+7,y+6,28,4);}}
    for(let i=0;i<90;i++){g.fillStyle='rgba(70,105,55,.4)';g.fillRect(cr()*512,Math.floor(cr()*12)*42+38,5+cr()*9,4);} const t=texOf(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
  if(kind==='conc'){g.fillStyle='#b3afa3';g.fillRect(0,0,512,512);for(let i=0;i<700;i++){g.fillStyle=`rgba(${cr()<.5?70:235},${cr()<.5?70:232},${cr()<.5?60:222},.06)`;g.fillRect(cr()*512,cr()*512,4+cr()*14,3+cr()*10);}
    g.strokeStyle='rgba(60,60,55,.35)';g.lineWidth=2;g.beginPath();g.moveTo(0,256);g.lineTo(512,256);g.moveTo(256,0);g.lineTo(256,512);g.stroke();
    g.strokeStyle='rgba(50,50,45,.45)';g.lineWidth=1.4;for(let k=0;k<5;k++){let x=cr()*512,y=cr()*512;g.beginPath();g.moveTo(x,y);for(let j=0;j<9;j++){x+=(cr()-.5)*40;y+=(cr()-.3)*30;g.lineTo(x,y);}g.stroke();}
    for(let i=0;i<8;i++){g.fillStyle='rgba(60,70,55,.12)';g.beginPath();g.ellipse(cr()*512,cr()*512,30+cr()*60,18+cr()*40,cr()*3,0,7);g.fill();} const t=texOf(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
  g.fillStyle='#9e9a8e';g.fillRect(0,0,512,512);for(let y=0;y<512;y+=128)for(let x=0;x<512;x+=128){const col=['#c2bdb0','#bab5a7','#c9c4b6','#b3ae9f'][Math.floor(cr()*4)];g.fillStyle=col;g.fillRect(x+4,y+4,120,120);g.fillStyle='rgba(0,0,0,.05)';g.fillRect(x+4,y+100,120,24);}
  for(let i=0;i<60;i++){g.fillStyle='rgba(80,110,60,.35)';g.fillRect(Math.floor(cr()*4)*128+cr()*128,Math.floor(cr()*4)*128+124+(cr()-.5)*3,6+cr()*10,3);} /* weeds in the joints */
  const t=texOf(c);t.wrapS=t.wrapT=T.RepeatWrapping;return t;}
let W2={};
function s2At(s,d){const sm=atS(MAIN,s);let n=offsetFrom(sm,d);for(let k=0;k<4;k++){const c=G.s2Coords(n,Math.asin(n.y));if(!c)break;const es=s-c.s,ed=d-c.d;if(Math.abs(es)<.005&&Math.abs(ed)<.005)break;n=tn(n,sm.t.clone().multiplyScalar(es).addScaledVector(sm.side,ed));}return n;}
const hSD=(s,d)=>gAt(s2At(s,d))-R;
function s2Setup(){const mk=(tex,k)=>new Bucket('s2-'+k,sunMat(new T.MeshBasicMaterial({map:tex,vertexColors:true,side:T.DoubleSide}),.9));W2.stone=mk(paintWall('stone'),'stone');W2.concrete=mk(paintWall('concrete'),'concrete');W2.block=mk(paintWall('block'),'block');
  const pv=(k,tex)=>new Bucket('s2-'+k,new T.MeshBasicMaterial({map:tex,vertexColors:true,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),{ud:{roadInk:true}});W2.pave=pv('pave',paintPave());W2.setts=pv('setts',paintPave('setts'));W2.conc=pv('conc',paintPave('conc'));W2.solids=[];}
/* a retaining wall along a line of (s,d) points; 'low' says which side is lower (+1: the side of increasing d, or of increasing s for a wall across), the face on that side */
function s2Wall(pts,o){const bk=W2[o.tex||'stone'];const thick=o.thick||.62; /* thick enough that the ground patch's dip beside a slot never shows the back face */const P=[],N=[],U=[];let u=0;const rows=[];
  for(let i=0;i<pts.length;i++){const [s,d]=pts[i];const across=o.across;const off=(a,b)=>across?s2At(s+a,d+b):s2At(s+b,d+a);
    const face=off(0,0),up=off(-o.low*.65,0),lo=off(o.low*.3,0),back=off(-o.low*thick,0);let top=gAt(up)-R+(o.parapet||0)+.02,bot=gAt(lo)-R-.35;if(o.capOnly)bot=top-(o.parapet||0)-.18;if(o.free){const g=Math.min(gAt(face),gAt(back))-R;top=g+o.h;bot=g-(o.sink||.2);}rows.push({face,back,top,bot});}
  for(let i=0;i<rows.length-1;i++){const a=rows[i],b=rows[i+1];const du=a.face.distanceTo(b.face)*R;const q=(n,h)=>n.clone().multiplyScalar(R+h);
    const fa0=q(a.face,a.bot),fa1=q(a.face,a.top),fb0=q(b.face,b.bot),fb1=q(b.face,b.top),ba1=q(a.back,a.top),bb1=q(b.back,b.top),ba0=q(a.back,a.top-1),bb0=q(b.back,b.top-1);
    const quad=(p0,p1,p2,p3,uv)=>{const nn=new T.Vector3().subVectors(p1,p0).cross(new T.Vector3().subVectors(p2,p0)).normalize();for(const [p,t] of [[p0,uv[0]],[p1,uv[1]],[p2,uv[2]],[p0,uv[0]],[p2,uv[2]],[p3,uv[3]]]){P.push(p.x,p.y,p.z);N.push(nn.x,nn.y,nn.z);U.push(t[0],t[1]);}};
    const v=h=>h/2;quad(fa0,fb0,fb1,fa1,[[u/2,v(a.bot)],[(u+du)/2,v(b.bot)],[(u+du)/2,v(b.top)],[u/2,v(a.top)]]);quad(fa1,fb1,bb1,ba1,[[u/2,0],[(u+du)/2,0],[(u+du)/2,.18],[u/2,.18]]);quad(ba1,bb1,bb0,ba0,[[u/2,v(a.top)],[(u+du)/2,v(b.top)],[(u+du)/2,v(b.top-1)],[u/2,v(a.top-1)]]);
    const mid=a.face.clone().add(b.face).add(a.back).add(b.back).normalize();const X=b.face.clone().sub(a.face);X.addScaledVector(mid,-X.dot(mid)).normalize();const Z=new T.Vector3().crossVectors(X,mid).normalize();
    if(o.solid!==false&&!(o.gap&&o.gap(...pts[i],...pts[i+1])))solids.push({c:mid.clone().multiplyScalar(R),X,Z,hx:du/2+.02,hz:thick/2+(o.pad??.08),top:1.2});
    u+=du;}
  bk.addRaw(P,N,U,o.tint||0xffffff);
  if(o.gutter){const g=rows.map((r_,i)=>{const [s,d]=pts[i];return o.across?s2At(s+o.low*.28,d):s2At(s,d+o.low*.28);});groundStrip(GUTTER,g,.26,.05,0xffffff,2.4,[0,1]);}
  if(o.rail){const tops=rows.map((r_,i)=>{const [s,d]=pts[i];const n=o.across?s2At(s-o.low*.2,d):s2At(s,d-o.low*.2);return {n,h:r_.top};});s2Rail(tops,o.railGap);}
  return rows;}
const RAILCOL=[0x7f958d,0xd8d6cf,0x8a5a44,0x6f7c83,0x7f958d];
function railStyle(){return {col:rp(RAILCOL),h:rb(.85,1),space:rb(1,1.5),mid:ch(.65),r:rb(.02,.028)};}
function s2Rail(tops,gap,st){st=st||railStyle();const K=kit(new T.Matrix4());const col=st.col;let prev=null;let acc=0;for(let i=0;i<tops.length;i++){const {n,h}=tops[i];if(gap&&gap(i)){prev=null;continue;}const p0=n.clone().multiplyScalar(R+h),p1=n.clone().multiplyScalar(R+h+st.h),pm=n.clone().multiplyScalar(R+h+st.h*.52);
    if(!prev||acc>st.space||i===tops.length-1){if(!st.noPosts||!prev||i===tops.length-1)K.rod(p0,p1,st.r,col,6);if(prev){K.rod(prev.p1,p1,st.r+.003,col,6);if(st.mid)K.rod(prev.pm,pm,st.r*.7,col,6);}prev={p1,pm};acc=0;}else acc+=prev?p1.distanceTo(prev.p1):0;}}
/* a flight of stairs from (s,d) top to (s,d) bottom; walkable; stepped masses down to the ground; cheek walls or rails */
function s2Flight(top,bot,W,o){o=o||{};const nT=s2At(...top),nB=s2At(...bot);const hT=o.hT??(gAt(nT)-R),hB=o.hB??(gAt(nB)-R);const dir=nB.clone().sub(nT);dir.addScaledVector(nT,-dir.dot(nT));const L=dir.length()*R;dir.normalize();const t=new T.Vector3().crossVectors(nT,dir).normalize();
  const N=Math.max(3,Math.round(Math.abs(hT-hB)/.18)),run=L/N;const col=o.col||0xc2bdb0;const at=(al,ac)=>tn(nT,dir.clone().multiplyScalar(al).addScaledVector(t,ac));
  for(const [key,sx] of [['left',-1],['right',1]]){if(o[key])continue;let g=0;for(const f of [.25,.5,.75])g+=gAt(at(L*f,sx*(W/2+.7)))-R-(hT+(hB-hT)*f);g/=3;o[key]=g<-.35?'rail':g>.35?'none':'cheek';} /* each side: a rail where the ground falls away, nothing against a wall, a low cheek otherwise */const frame=(n,h)=>{const m=basisM(n,dir);m.setPosition(n.clone().multiplyScalar(R+h));return m;};const rails=[[],[]];
  for(let i=0;i<N;i++){const al=(i+.5)*run,c=at(al,0),top_=hT+(hB-hT)*(i+.5)/N;let gb=1e9;for(const ac of [-W/2,0,W/2])for(const da of [-run/2,run/2])gb=Math.min(gb,gAt(at(al+da,ac))-R);const hb=Math.min(gb,top_-.2)-.25,hh=top_-hb;
    const tc=o.col||rp([0xc2bdb0,0xb9b4a6,0xc8c3b5,0xaea99b,0xb5b3a2,0xbdb6a4]);kit(frame(c,(top_+hb)/2)).box(W,hh,run+.02,tc,0,0,0).box(W+.02,.03,.05,ch(.3)?0x8d9a86:0x9c9788,0,hh/2-.01,-run/2+.03); /* each tread its own age */
    for(const sx of [-1,1]){const side=sx<0?o.left:o.right;if(side==='cheek')kit(frame(c,(top_+hb)/2)).box(.16,hh+.3,run+.02,0xaea898,sx*(W/2+.08),.15,0);if(side==='rail'||side==='cheek')rails[sx<0?0:1].push({n:at(al,sx*(W/2+.08)),h:top_+(side==='cheek'?.3:0)});}}
  const st=railStyle();for(const rr_ of rails)if(rr_.length)s2Rail(rr_,null,st);
  for(const [key,sx] of [['left',-1],['right',1]]){if(o[key]!=='none')continue;const K=kit(new T.Matrix4());const A=at(run*.3,sx*(W/2-.02)).multiplyScalar(R+hT+.85),B_=at(L-run*.3,sx*(W/2-.02)).multiplyScalar(R+hB+.85);K.rod(A,B_,.022,st.col,6);for(const f of [.1,.5,.9]){const p=A.clone().lerp(B_,f);K.rod(p,p.clone().addScaledVector(t,sx*.12),.015,0x6d7478,4);}if(o.pipe!==false){const a2=at(0,sx*(W/2-.08)).multiplyScalar(R+hT+.06),b2=at(L,sx*(W/2-.08)).multiplyScalar(R+hB+.06);K.rod(a2,b2,.045,0x9aa3a4,6);}break;} /* against a wall: a pipe handrail on brackets, and a drain pipe down the side */
  for(const sx of [-1,1]){const side=sx<0?o.left:o.right;if(side==='rail'||side==='cheek'){const a=at(run*.5,sx*(W/2+.1)),b=at(L-run*.5,sx*(W/2+.1));const m=a.clone().add(b).normalize();const X=b.clone().sub(a);X.addScaledVector(m,-X.dot(m)).normalize();solids.push({c:m.clone().multiplyScalar(R),X,Z:new T.Vector3().crossVectors(X,m).normalize(),hx:L/2,hz:.1,top:1});}}
  const nn=nT.clone(),cosC=Math.cos((L+3)/R),d0=dir.clone(),t0=t.clone(),hw=W/2+.06;G.WALKS.push(n=>{if(n.dot(nn)<cosC)return null;const al=((n.x-nn.x)*d0.x+(n.y-nn.y)*d0.y+(n.z-nn.z)*d0.z)*R,ac=((n.x-nn.x)*t0.x+(n.y-nn.y)*t0.y+(n.z-nn.z)*t0.z)*R;if(al<-.15||al>L+.15||Math.abs(ac)>hw)return null;return hT+(hB-hT)*Math.min(1,Math.max(0,al/L));}); /* overlaps its landings a little, so there is no seam to drop through */
  return {hT,hB,L,N};}
/* a flat landing: slab, walkable, rails on the sides given */
function s2Landing(s0,s1,d0,d1,h,o){o=o||{};const c=s2At((s0+s1)/2,(d0+d1)/2),a=s2At(s0,(d0+d1)/2),b=s2At(s1,(d0+d1)/2);const X=b.clone().sub(a);X.addScaledVector(c,-X.dot(c)).normalize();const Z=new T.Vector3().crossVectors(X,c).normalize();const ls=(s1-s0),ld=(d1-d0);
  let gb=1e9;for(const [s,d] of [[s0,d0],[s1,d0],[s0,d1],[s1,d1],[(s0+s1)/2,(d0+d1)/2]])gb=Math.min(gb,hSD(s,d));const hb=Math.min(gb,h-.2)-.25;const m=new T.Matrix4().makeBasis(X,c,Z.clone().negate());m.setPosition(c.clone().multiplyScalar(R+(h+hb)/2));kit(m).box(ls,h-hb,ld,o.col||0xc2bdb0,0,0,0);
  const cc=c.clone(),cosC=Math.cos((ls+ld)/R),Xc=X.clone(),Zc=Z.clone();G.WALKS.push(n=>{if(n.dot(cc)<cosC)return null;const x=((n.x-cc.x)*Xc.x+(n.y-cc.y)*Xc.y+(n.z-cc.z)*Xc.z)*R,z=((n.x-cc.x)*Zc.x+(n.y-cc.y)*Zc.y+(n.z-cc.z)*Zc.z)*R;return Math.abs(x)<=ls/2+.2&&Math.abs(z)<=ld/2+.2?h:null;});
  for(const [side,pts] of Object.entries({s0:[[s0,d0],[s0,d1]],s1:[[s1,d0],[s1,d1]],d0:[[s0,d0],[s1,d0]],d1:[[s0,d1],[s1,d1]]})){if(!(o.rails||[]).includes(side))continue;const tops=[];for(let k=0;k<=4;k++){const s=pts[0][0]+(pts[1][0]-pts[0][0])*k/4,d=pts[0][1]+(pts[1][1]-pts[0][1])*k/4;tops.push({n:s2At(s,d),h});}s2Rail(tops);const A=s2At(...pts[0]),B=s2At(...pts[1]);const mm=A.clone().add(B).normalize();const XX=B.clone().sub(A);const len=XX.length()*R;XX.addScaledVector(mm,-XX.dot(mm)).normalize();solids.push({c:mm.clone().multiplyScalar(R),X:XX,Z:new T.Vector3().crossVectors(XX,mm).normalize(),hx:len/2,hz:.1,top:1});}
  return h;}
/* paving: a rectangle in (s,d), laid on the ground */
function s2Pave(s0,s1,d0,d1,lift,kind,tint){const bk=W2[kind||'pave'],us={pave:1.6,setts:1.1,conc:2.4}[kind||'pave'];const P=[],N=[],U=[];const ns=Math.max(1,Math.ceil((s1-s0)/.8)),nd=Math.max(1,Math.ceil((d1-d0)/.8));const pt=(i,j)=>{const s=s0+(s1-s0)*i/ns,d=d0+(d1-d0)*j/nd;const n=s2At(s,d);return {p:n.clone().multiplyScalar(gAt(n)+(lift||.04)),n,u:s/us,v:d/us};};
  for(let i=0;i<ns;i++)for(let j=0;j<nd;j++){const a=pt(i,j),b=pt(i+1,j),c=pt(i+1,j+1),d=pt(i,j+1);for(const q of [a,c,b,a,d,c]){P.push(q.p.x,q.p.y,q.p.z);N.push(q.n.x,q.n.y,q.n.z);U.push(q.u,q.v);}}bk.addRaw(P,N,U,tint||0xffffff);}
/* the planet's ground is a 1 m mesh, too coarse for terraces: inside Street 02 it is sunk out of sight and a 35 cm patch,
   laid on the exact terrain with the ground's own material and lon/lat texture mapping, takes its place */
function s2Ground(o){const gm=G.groundMesh;if(!gm)return 0;const pa=gm.geometry.attributes.position,v=new T.Vector3();let k=0;
  for(let i=0;i<pa.count;i++){v.fromBufferAttribute(pa,i);const n=v.clone().normalize();const c=G.s2Coords(n,Math.asin(n.y));if(!c||c.s<o.s0+1.4||c.s>o.s1-1.4||c.d<o.d0+1.3||c.d>o.d1-1.3)continue;v.multiplyScalar((v.length()-5)/v.length()); /* well below every level: the steps are up to 4 m */pa.setXYZ(i,v.x,v.y,v.z);k++;}pa.needsUpdate=true;gm.geometry.computeBoundingSphere();
  {const sh=window.__shore;if(sh){const sp=sh.geometry.attributes.position;for(let i=0;i<sp.count;i++){v.fromBufferAttribute(sp,i).applyMatrix4(sh.matrixWorld);const n=v.clone().normalize();const c=G.s2Coords(n,Math.asin(n.y));if(!c||c.s<o.s0+.5||c.s>o.s1-.5||c.d<o.d0||c.d>o.shoreTo)continue;const r_=Math.min(v.length()-.6,gAt(n)-.5,R-2.0); /* below the lowest level: its big triangles span the walls */const w=v.clone().multiplyScalar(r_/v.length());sh.worldToLocal(w);sp.setXYZ(i,w.x,w.y,w.z);}sp.needsUpdate=true;sh.geometry.computeBoundingSphere();}} /* the sand strip along the waterline too, under every level and the coastal path */
  const STEP=.35,ns=Math.ceil((o.s1-o.s0)/STEP),nd=Math.ceil((o.d1-o.d0)/STEP);const P=new Float32Array((ns+1)*(nd+1)*3),UV=new Float32Array((ns+1)*(nd+1)*2),idx=[];
  for(let i=0;i<=ns;i++)for(let j=0;j<=nd;j++){const s=o.s0+(o.s1-o.s0)*i/ns,d=o.d0+(o.d1-o.d0)*j/nd;const n=s2At(s,d);let h=gAt(n);for(const [a,b] of [[.3,0],[-.3,0],[0,.3],[0,-.3]])h=Math.min(h,gAt(s2At(s+a,d+b)));h+=.01;const q=(i*(nd+1)+j); /* the lowest ground nearby: the slopes between levels tuck in behind the wall faces instead of wedging out in front */P[q*3]=n.x*h;P[q*3+1]=n.y*h;P[q*3+2]=n.z*h;const lon=Math.atan2(n.z,n.x),lat=Math.asin(n.y);UV[q*2]=(((Math.PI-lon)/(2*Math.PI))%1+1)%1;UV[q*2+1]=.5+(d<o.grassTo?Math.max(lat,-.27):d>o.sandFrom?Math.min(lat,-.31):lat)/Math.PI; /* past the coastal path the patch is sand, never the grass band */} /* the terraces take the grass colour; the ground texture turns to sand by latitude alone */
  for(let i=0;i<ns;i++)for(let j=0;j<nd;j++){const a=i*(nd+1)+j,b=a+nd+1;idx.push(a,b,a+1,b,b+1,a+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(P,3));g.setAttribute('uv',new T.BufferAttribute(UV,2));g.setIndex(idx);g.computeVertexNormals();g.computeBoundingSphere();
  const mat=gm.material.clone();mat.side=T.DoubleSide;mat.polygonOffset=true;mat.polygonOffsetFactor=-1;mat.polygonOffsetUnits=-1;const m=new T.Mesh(g,mat);m.name='dress:s2-ground';m.receiveShadow=false;scene.add(m);G.dirty();return k;}
/* the lawn's old furniture (trees, rocks, tufts) where the new levels are */
function s2Clear(o){const T_=window.__town;if(!T_)return 0;let k=0;
  scene.traverse(m=>{if(!m.isInstancedMesh||m.name.startsWith('dress')||m.geometry.type!=='IcosahedronGeometry'&&m.geometry.attributes.position.count>300)return;const M=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),sc=new T.Vector3();let ch_=false;for(let i=0;i<m.count;i++){m.getMatrixAt(i,M);M.decompose(p,q,sc);if(sc.x===0)continue;const n=p.clone().normalize();const c=G.s2Coords(n,Math.asin(n.y));if(!c||c.s<o.s0||c.s>o.s1||c.d<4.5||c.d>o.d1)continue;sc.set(0,0,0);M.compose(p,q,sc);m.setMatrixAt(i,M);ch_=true;k++;}if(ch_)m.instanceMatrix.needsUpdate=true;}); /* the game's pebbles strewn over the old lawn */const kill=[];for(const p of T_.propSlots){const n=sphere(p.lon,p.lat);const c=G.s2Coords(n,Math.asin(n.y));if(!c||c.s<o.s0||c.s>o.s1||c.d<4.5||c.d>o.d1)continue;kill.push(n);}
  for(const n of kill){const P=n.clone().multiplyScalar(R);const keep=new Set((window.BLDGS||[]).map(b=>b.inst));for(const ch_ of [...scene.children]){if(!ch_.isGroup||ch_.name.startsWith('dress')||keep.has(ch_)||ch_.userData.s2)continue;const q=ch_.position.clone().normalize();if(q.dot(n)>Math.cos(.9/R)){scene.remove(ch_);k++;}}for(let i=solids.length-1;i>=0;i--){const so=solids[i];if(so.r===undefined)continue;const q=so.c.clone().normalize();if(q.dot(n)>Math.cos(.9/R))solids.splice(i,1);}}G.dirty();return k;}
/* a house of the town, cloned onto Street 02: its footprint centred on (s,d), its front to the side of 'face' (-1: towards the street's centre line) */
function s2House(key,s,d,face,sc,res,o){o=o||{}; /* face: +1/-1 fronts to +d/-d; 'w' fronts west, back along the street */const src=(window.BLDGS||[]).find(b=>b.key===key&&!b.inst.userData.s2);if(!src)return null;const g=src.inst.clone(true);g.userData.s2=true;const k=sc/src.sc;
  const sm=atS(MAIN,s);const n=s2At(s,d);const [lo,la]=lonLatOf(n);placeOn(g,lo,la,yawFor(lo,la,face==='w'?sm.t.clone().negate():sm.side.clone().multiplyScalar(face)));g.scale.copy(src.inst.scale).multiplyScalar(k);
  const [x0,x1,z0,z1]=src.foot;let gmin=1e9;for(const [a,b] of [[x0,z0],[x1,z0],[x0,z1],[x1,z1],[(x0+x1)/2,(z0+z1)/2]].map(([a,b])=>[(a-(x0+x1)/2)*.72+(x0+x1)/2,(b-(z0+z1)/2)*.72+(z0+z1)/2])) /* inset: a corner over the wall's edge must not sink the house to the level below */{g.position.copy(n.clone().multiplyScalar(R));g.updateMatrixWorld(true);const q=g.localToWorld(V3(a,0,b)).normalize();gmin=Math.min(gmin,gAt(q));}if(o.base!=null)gmin=R+o.base+.05;
  g.position.copy(n.clone().multiplyScalar(R));g.updateMatrixWorld(true);const c0=g.localToWorld(V3((x0+x1)/2,0,(z0+z1)/2)).normalize();const shift=n.clone().sub(c0);g.position.copy(n.clone().add(shift).normalize().multiplyScalar(gmin-.05));g.updateMatrixWorld(true);scene.add(g);
  const X=V3(1,0,0).applyQuaternion(g.quaternion),Z=V3(0,0,1).applyQuaternion(g.quaternion);const c=g.localToWorld(V3((x0+x1)/2,0,(z0+z1)/2));solids.push({c,X,Z,hx:(x1-x0)/2*sc,hz:(z1-z0)/2*sc,top:src.top*k});
  if(o.plinth){const up=c.clone().normalize();let fl=1e9;for(const [a,b] of [[x0,z0],[x1,z0],[x0,z1],[x1,z1]])fl=Math.min(fl,gAt(g.localToWorld(V3(a,0,b)).normalize()));const hh=gmin-.05-fl+.3;const m=new T.Matrix4().makeBasis(X,up,Z);m.setPosition(up.clone().multiplyScalar(fl-.3+hh/2));kit(m).box((x1-x0)*sc+.3,hh,(z1-z0)*sc+.3,0x9c9a90,0,0,0);} /* a stone base down to the sea bed */
  if(res)(res.houses=res.houses||[]).push(key);return {g,w:(x1-x0)*sc,dp:(z1-z0)*sc,top:src.top*k};}
function street02(o){const res={};const hsdW=()=>o.house[0]-2.05;const S=G.S2,Ln=G.s2Lane,Pr=G.s2Prom;window.DRESS.s2At=s2At;window.DRESS.hSD=hSD;
  res.ground=s2Ground({s0:239,s1:307,d0:4.35,d1:17.5,grassTo:S.upTo,sandFrom:S.prom-.5,shoreTo:S.prom+.45});res.cleared=s2Clear({s0:241,s1:305,d1:16.6});for(const ms of [4000,12000,30000])setTimeout(()=>{res.cleared+=s2Clear({s0:241,s1:305,d1:16.6});},ms); /* props that load late */
  const [a1,b1,t1]=S.slot1,[a2,b2,t2]=S.slot2,EG=S.eastGap,BK=S.back,UP=S.upTo,PR=S.prom,L0=S.lane[0],L1=S.lane[1],LO=S.laneOut;
  const line=(a,b,d,st)=>{const r=[];for(let s=a;s<b-.01;s+=st||1.2)r.push([s,d]);r.push([b,d]);return r;};const across=(s,d0,d1,st)=>{const r=[];for(let d=d0;d<d1-.01;d+=st||1.2)r.push([s,d]);r.push([s,d1]);return r;};
  /* ---- the back wall: the street houses stand on it, the lane runs at its foot (built in goes) ---- */
  s2Wall(line(244,L0,BK),{low:1,tex:'stone'}); /* the gardens' half-metre step, west */
  s2Wall(line(L0,a1,BK,1),{low:1,tex:'stone',gutter:true});
  s2Wall(line(b1,277.6,BK),{low:1,tex:'concrete',gutter:true});s2Wall(line(277.6,280.1,BK,.9),{low:1,tex:'stone',gutter:true,tint:0xe6e2d6});s2Wall(line(280.1,EG,BK),{low:1,tex:'concrete',gutter:true,tint:0xefece4});
  s2Wall(line(277.7,280,BK,.8),{low:1,tex:'block',capOnly:true,parapet:.7,thick:.2,solid:false}); /* the garden between two street houses: a parapet on the wall top */
  s2Wall(across(EG,S.tallWall,BK),{across:true,low:1,tex:'concrete'});const eN=line(EG,301.3,S.tallWall);s2Wall(eN,{low:1,tex:'concrete',gutter:true}); /* the tall wall under the street at the east end */
  s2Wall(line(EG,299.8,S.tallWall,1),{low:1,tex:'concrete',capOnly:true,parapet:.95,thick:.22,solid:false,tint:0xe9e6de});{const t=[];for(const [ss] of line(299.8,301.3,4.62,.75))t.push({n:s2At(ss,4.62),h:hSD(ss,4.2)});s2Rail(t);}
  /* ---- stair 1: a slot between house 16's side garden and house 10 ---- */
  const slotPts=s=>[[s,t1-.1],[s,6.4],[s,7.7],[s,BK]];s2Wall(slotPts(a1),{across:true,low:1,tex:'stone',pad:-.05});s2Wall(slotPts(b1),{across:true,low:-1,tex:'concrete',pad:-.05});
  const f1=s2Flight([(a1+b1)/2,t1-.15],[(a1+b1)/2,BK+.35],1.38,{hT:hSD((a1+b1)/2,4.7),hB:hSD((a1+b1)/2,BK+.8)});res.f1=[+f1.hT.toFixed(2),+f1.hB.toFixed(2),f1.N];
  /* ---- houses that make the path: stair 1 drops between two of them; the back gardens, the courtyard's sides, the far side of stair 2 and a house out on the sea wall are built on ---- */
  res.hSlot=!!s2House('3',261.45,6.85,-1,.78,res); /* where the open side garden was: stair 1 now runs between this house and house 10 */
  s2House('9',246.8,11.95,1,.6,res);s2House('19',254.2,11.95,1,.6,res); /* the back gardens' own houses, looking over the sea wall */
  s2House('20',287.45,12.85,-1,.55,res); /* the lane squeezes past it into the courtyard; its door faces the lane */
  s2House('4',298.1,12.35,1,.55,res); /* the far side of stair 2 */
  s2House('17',270.2,18.3,-1,.5,res,{base:Pr(270.2)-.05,plinth:true}); /* out on the sea wall: the coastal path passes between it and the houses above */
  shed(277.75,279.95,4.95,8.85,2.5,{col:0xa9b3ad,roof:0x6f7c83,detail:true,pipe:['s1',-1.6],meter:['s1',.4],upper:{s:[0,1],d:[.45,1],h:2.2,col:0xc9c1ad,tilt:.12,wins:[['d0',.1,1.2,.9,.8]],acs:[['s1',.6]],rail:['d0']}});storeDoor2(278.85,4.93,2.0); /* a garage in the gap between two street houses, a room over its back half, a roof terrace at the front */
  /* ---- the lane's west end: the private gardens' wall across it ---- */
  s2Wall(across(L0,BK,UP),{across:true,low:1,tex:'block'});
  /* ---- the second row, on the lane's sea side: two houses, walled gardens and sheds between them ---- */
  res.h23=!!s2House('23',270.65,12.6,-1,.8,res);res.h21=!!s2House('21',279.8,12.6,-1,.66,res);
  const front=(a,b,tex,h,tint)=>s2Wall(line(a,b,LO+.05,.9),{low:-1,tex,free:true,h,thick:.2,tint});
  front(L0+.05,263.35,'block',1.45);front(265.45,266.75,'block',1.45);front(274.55,278.4,'concrete',1.3,0xe6e2d8);front(283.35,L1,'stone',1.25);
  s2Wall(across(L1,LO+.05,UP),{across:true,low:1,tex:'stone',free:true,h:1.25,thick:.2}); /* the courtyard's west side, seaward */
  /* ---- the retaining wall above the coastal path; what stands on top changes with what is behind it ---- */
  s2Wall(line(244,256,UP),{low:1,tex:'stone',gutter:true});s2Wall(line(256,L0,UP),{low:1,tex:'concrete',gutter:true,tint:0xe6e2d6});s2Wall(line(L0,274.6,UP),{low:1,tex:'stone',gutter:true});
  s2Wall(line(274.6,L1,UP),{low:1,tex:'concrete',gutter:true});s2Wall(line(L1,a2,UP),{low:1,tex:'stone',gutter:true,tint:0xe9e6dd});s2Wall(line(b2,302.5,UP),{low:1,tex:'concrete',gutter:true,tint:0xefece4});
  const cap=(a,b,tex,h)=>s2Wall(line(a,b,UP,1),{low:1,tex,capOnly:true,parapet:h,thick:.22,solid:false});
  cap(L0,266.8,'block',.85);cap(274.5,278.45,'concrete',.8);cap(281.2,L1,'stone',.9);cap(291.6,a2,'stone',.3);
  {const t=[];for(const [ss] of line(288.95,291.6,UP-.2,.9))t.push({n:s2At(ss,UP-.2),h:hSD(ss,UP-.6)});s2Rail(t,null,{col:0x7f958d,h:.95,space:1.3,mid:true,r:.024});} /* the courtyard's sea view: a plain rail */
  s2Fence(line(244.3,L0-.2,UP-.22,1.1),{h:1,base:(ss,dd)=>hSD(ss,dd-.3)});s2Fence(line(b2+.2,302.3,UP-.22,1.1),{h:1,base:(ss,dd)=>hSD(ss,dd-.3)});
  /* ---- stair 2: out of the courtyard's far corner, between its wall and the garden next door ---- */
  const slot2=s=>[[s,t2-.1],[s,12],[s,13.1],[s,UP]];s2Wall(slot2(a2),{across:true,low:1,tex:'stone',pad:-.05});s2Wall(slot2(a2),{across:true,low:1,tex:'stone',capOnly:true,parapet:.7,thick:.2,solid:false});s2Wall(slot2(b2),{across:true,low:-1,tex:'block',pad:-.05});
  const f2=s2Flight([(a2+b2)/2,t2-.1],[(a2+b2)/2,UP+.3],1.38,{hT:hSD((a2+b2)/2,t2-.5),hB:hSD((a2+b2)/2,UP+.8)});res.f2=[+f2.hT.toFixed(2),+f2.hB.toFixed(2),f2.N];
  s2Fence(across(b2+.05,S.tallWall+.1,t2-.1,1),{h:1.05}); /* the yard house's garden: private */
  s2Fence(across(302.4,S.tallWall+.1,UP-.2,1.1),{h:1.05});s2Fence(across(242.7,BK,UP-.2,1.1),{h:1});
  /* ---- paving: laid in different goes ---- */
  const walks=G.WALKS.splice(0); /* paving follows the ground, not the stairs and landings laid over it */
  s2Pave(a1-.05,b1+.05,4.35,t1-.22,.04,'setts',0xf2efe8);
  s2Pave(L0,268.4,BK,LO,.04,'setts',0xf2efe8);s2Pave(268.4,276,BK,LO,.04,'conc');s2Pave(276,281.5,BK,LO,.04,'pave',0xe6e2da);s2Pave(281.5,L1,BK,LO,.04,'conc',0xdcd8cf);s2Pave(266.8,274.5,LO,LO+1.3,.04,'conc');s2Pave(278.5,281.2,LO,LO+1.3,.04,'pave',0xe6e2da); /* up to the second row's doors */
  s2Pave(L1,a2,BK,UP-.37,.04,'setts',0xe9e6dd);s2Pave(a2,b2,S.tallWall+4.3,t2-.22,.04,'setts',0xe9e6dd);s2Pave(EG+.2,hsdW(),S.tallWall+.05,BK,.04,'setts',0xe9e6dd); /* the forecourt before the yard house's door */
  s2Pave(245,262,UP,PR-.36,.04,'conc');s2Pave(262,280,UP,PR-.36,.04,'pave',0xe8e4dc);s2Pave(280,303,UP,PR-.36,.04,'conc',0xe0dcd2); /* to the sea wall's back: past it the ground falls away and the paving would sag */
  G.WALKS.push(...walks);
  /* ---- the sea side of the coastal path: a sea wall and rail where the water is below, a curb where it is a step, open onto the sand in the west ---- */
  const built=[[268.1,272.3],[283.3,288.3],[299.8,303.4]]; /* buildings stand on the sea edge there: they are the edge */
  const sea=[];for(let s=245;s<=303;s+=1.2){const drop=hSD(s,PR-.4)-hSD(s,PR+.6);const k=built.some(([a,b])=>s>a&&s<b)?'built':drop>1.1?'rail':'open'; /* where it is only a step down to the sand, it stays open: no curb */sea.push({s,k,n:s2At(s,PR-.2),h:hSD(s,PR-.4)});}
  let run=[],kind=null;const flushR=k=>{if(run.length>1&&k==='built'){for(let i=0;i<run.length-1;i++){const A=run[i].n,B_=run[i+1].n;const m=A.clone().add(B_).normalize();const X=B_.clone().sub(A);const len=X.length()*R;X.addScaledVector(m,-X.dot(m)).normalize();solids.push({c:m.clone().multiplyScalar(R),X,Z:new T.Vector3().crossVectors(X,m).normalize(),hx:len/2+.05,hz:.1,top:1});}} /* beside a building on the sea edge: nothing to see, but no stepping off into the water */
    if(run.length>1&&k!=='built'){if(k!=='open')s2Wall(run.map(q=>[q.s,PR]),{low:1,tex:k==='rail'?'stone':'concrete',solid:false});
      if(k==='rail'){s2Rail(run);for(let i=0;i<run.length-1;i++){const A=run[i].n,B_=run[i+1].n;const m=A.clone().add(B_).normalize();const X=B_.clone().sub(A);const len=X.length()*R;X.addScaledVector(m,-X.dot(m)).normalize();solids.push({c:m.clone().multiplyScalar(R),X,Z:new T.Vector3().crossVectors(X,m).normalize(),hx:len/2,hz:.1,top:1});}}
      else if(k==='curb')s2Wall(run.map(q=>[q.s,PR-.1]),{low:1,tex:'concrete',free:true,h:.4,thick:.3});}};
  for(const q of sea){if(kind!==null&&q.k!==kind){const last=run[run.length-1];flushR(kind);run=[last];}kind=q.k;run.push(q);}flushR(kind);res.sea=sea.map(q=>q.k[0]).join('');
  res.row=+hSD(270,4.2).toFixed(2);res.dress=s2Dress(o);return res;}


/* ---------- Street 02 dressing: residential, quieter; laundry, taps, bins, lamps, plants spilling over walls ---------- */
function paintS2Signs(){const c=canvas(512,256),g=c.getContext('2d');const JP='"Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
  g.fillStyle='#2c5aa0';g.fillRect(4,4,248,120);g.strokeStyle='#fff';g.lineWidth=4;g.strokeRect(12,12,232,104);g.fillStyle='#fff';g.font='700 46px '+JP;g.textAlign='center';g.textBaseline='middle';g.fillText('海岸へ ↓',128,66); /* to the shore */
  g.fillStyle='#f3efe2';g.fillRect(260,4,248,120);g.fillStyle='#1f2a33';g.font='700 56px '+JP;g.fillText('私道',384,66); /* private lane */
  for(const [x,t] of [[4,'山田'],[132,'佐藤'],[260,'木村'],[388,'森']]){g.fillStyle='#8a6a48';g.fillRect(x+10,134,108,116);g.fillStyle='#e9dcc0';g.fillRect(x+18,142,92,100);g.fillStyle='#2b2118';g.font='700 40px '+JP;g.save();g.translate(x+64,192);g.fillText(t,0,0);g.restore();} /* name plates */
  return texOf(c);}
let S2SIGN=null;
function frameSD(s,d,h,fs,fd){const n=s2At(s,d);const sm=atS(MAIN,s);const f=sm.t.clone().multiplyScalar(fs).addScaledVector(sm.side,fd);const m=basisM(n,f);m.setPosition(n.clone().multiplyScalar(R+(h??(gAt(n)-R))));return m;}
function s2Quad(m,w,h,uvr,x,y,z,ry){S2SIGN.add(new T.PlaneGeometry(w,h),mul(m,mRot(x||0,y||0,z||0,ry||0)),0xffffff,uvr,0);}
function laundry(s,d,fs,fd,len){const m=frameSD(s,d,null,fs,fd);const k=kit(m);for(const x of [-len/2,len/2]){k.cyl(.03,.035,1.75,0x8a8f90,x,.87,0,6).box(.5,.04,.04,0x8a8f90,x,1.72,0);}k.rod(V3(-len/2,1.74,.2),V3(len/2,1.74,.2),.02,0xb9a574,5).rod(V3(-len/2,1.74,-.2),V3(len/2,1.74,-.2),.02,0xb9a574,5);
  const cols=[0xe9e4d6,0x7fa3c9,0xe9b8b0,0xf4f1e8,0x9fc29a,0xe8d27a];let x=-len/2+.25;while(x<len/2-.3){const w=rb(.3,.6),hh=rb(.35,.7),c=rp(cols);k.box(w,hh,.015,c,x+w/2,1.72-hh/2,ch(.5)?.2:-.2);x+=w+rb(.05,.15);}}
function tap(m){const k=kit(m);k.rod(V3(0,0,.05),V3(0,.7,.05),.02,0x8f9699,5).box(.1,.04,.08,0xb8bcbd,0,.7,.1).cyl(.035,.035,.03,0xc8403a,0,.76,.1,8).cyl(.14,.11,.24,0x3f7fb0,.25,.12,.25,10);}
function bins(m){const k=kit(m);k.cyl(.26,.24,.78,0x2f6b4f,-.3,.39,0,10).cyl(.28,.28,.06,0x24553e,-.3,.8,0,10).cyl(.26,.24,.78,0x2d5f8f,.3,.39,0,10).cyl(.28,.28,.06,0x234c73,.3,.8,0,10);}
function wallLamp(m){const k=kit(m);k.box(.1,.1,.18,0x3a3f42,0,0,.09).box(.2,.24,.16,0xf6e6b0,0,-.14,.2).box(.22,.03,.18,0x3a3f42,0,-.01,.2);}
function umbrella(m){const k=kit(m);k.cyl(.01,.11,.78,rp([0x2d5f8f,0xc8403a,0x3f6b4f,0x2b2b2b]),0,.42,0,8,.18);k.rod(V3(0,.02,.07),V3(0,.9,-.07),.012,0x3a3f42,4);}
function mailbox(m){const k=kit(m);k.cyl(.035,.035,1.05,0x5a5f62,0,.52,0,6).box(.36,.28,.22,rp([0xc8403a,0x9aa0a4,0x2d5f8f]),0,1.18,0).box(.2,.02,.02,0x222222,0,1.24,.115);}

/* ---------- Street 02 architecture: sheds, doorways, fences, and the marks of age on its walls ---------- */
function sdBox(s0,s1,d0,d1){const sc=(s0+s1)/2,dc=(d0+d1)/2;const c=s2At(sc,dc);const a=s2At(s0,dc),b=s2At(s1,dc);const X=b.clone().sub(a);X.addScaledVector(c,-X.dot(c)).normalize();const Zp=s2At(sc,d1).sub(s2At(sc,d0));Zp.addScaledVector(c,-Zp.dot(c)).normalize();const Z=new T.Vector3().crossVectors(X,c).normalize();const zs=Math.sign(Z.dot(Zp))||1;
  let g=1e9;for(const [ss,dd] of [[s0,d0],[s1,d0],[s0,d1],[s1,d1],[sc,dc]])g=Math.min(g,hSD(ss,dd));const m=new T.Matrix4().makeBasis(X,c.clone(),Z);m.setPosition(c.clone().multiplyScalar(R+g));return {m,ls:s1-s0,ld:d1-d0,zs,g,c,X,Z};}
function shed(s0,s1,d0,d1,h,o){o=o||{};const b=sdBox(s0,s1,d0,d1);if(o.base!=null)b.m.setPosition(b.c.clone().multiplyScalar(R+o.base));const k=kit(b.m);if(o.plinth){let fl=1e9;for(const [ss,dd] of [[s0,d0],[s1,d0],[s0,d1],[s1,d1]])fl=Math.min(fl,hSD(ss,dd));const hh=o.base-fl+.3;k.box(b.ls+.3,hh,b.ld+.3,0x9c9a90,0,-hh/2+.02,0);}const wc=o.col||rp([0xc9c1ad,0xa9b3ad,0xd4cbb8,0x9fa7a1,0xb9a88c]);k.box(b.ls,h+.2,b.ld,wc,0,(h-.2)/2,0);
  const rc=o.roof||rp([0x6f7c83,0x8a5a44,0x5f6f78,0x7d6a55]),flat=!!(o.upper||o.flat),over=flat?.08:.2,tilt=flat?0:.2;const toS=(o.roofTo||'d1')[0]==='s',sg=(o.roofTo||'d1')[1]==='1'?1:-1;
  const rx=toS?0:sg*b.zs*tilt,rz=toS?-sg*tilt:0;k.box(b.ls+over*2,.05,b.ld+over*2,rc,0,h+.1,0,0,rx,rz);for(let i=-2;i<=2;i++){if(toS)k.box(b.ls+over*2,.07,.035,0x3a3f42,0,h+.13,i*(b.ld/5),0,0,rz);else k.box(.035,.07,b.ld+over*2,0x3a3f42,i*(b.ls/5),h+.13,0,0,rx,0);}
  const face=(side,w,hh,col,y,off)=>{if(side[0]==='s'){const x=(side[1]==='1'?1:-1)*(b.ls/2+.02);k.box(.05,hh,w,col,x,y,off||0);}else{const z=(side[1]==='1'?1:-1)*b.zs*(b.ld/2+.02);k.box(w,hh,.05,col,off||0,y,z);}};
  if(o.door){face(o.door,.78,1.8,rp([0x6b4a2e,0x5a6a72,0x7a3f32]),.9,o.doorOff||0);face(o.door,.9,.06,0x3a3f42,1.84,o.doorOff||0);}if(o.window)face(o.window,.6,.45,0xdfe8e4,1.45,o.winOff||0);if(o.detail)shedDetail(k,b,h,o);
  solids.push({c:b.c.clone().multiplyScalar(R),X:b.X,Z:b.Z,hx:b.ls/2,hz:b.ld/2,top:h+(o.upper?o.upper.h:0)});return b;}
/* what makes a plain box read as a lived-in building: framed windows, AC units, a downpipe, a shallow door canopy, a setback upper floor, a roof-terrace rail */
function shedDetail(k,b,h,o){const zs=b.zs;const FR=0x4a4f52,GL=0x34424a,SILL=0xb9b4a6;
  const on=(B_,side,off,y,w,hh,dep,col)=>{if(side[0]==='s'){const x=B_.cx+(side[1]==='1'?1:-1)*(B_.w/2+dep/2);k.box(dep,hh,w,col,x,y,B_.cz+(off||0));}else{const z=B_.cz+(side[1]==='1'?1:-1)*zs*(B_.d/2+dep/2);k.box(w,hh,dep,col,B_.cx+(off||0),y,z);}};
  const win=(B_,[side,off,y,w,hh])=>{on(B_,side,off,y,w+.14,hh+.14,.03,FR);on(B_,side,off,y,w,hh,.06,GL);on(B_,side,off,y-hh/2-.06,w+.22,.05,.12,SILL);on(B_,side,off,y,.035,hh,.08,FR);on(B_,side,off,y+hh/2+.1,w+.1,.05,.1,0x5f6f78);};
  const M={cx:0,cz:0,w:b.ls,d:b.ld};for(const w_ of (o.wins||[]))win(M,w_);
  for(const [side,off,y] of (o.acs||[])){on(M,side,off,y,.72,.52,.27,0xe9e6dc);on(M,side,off+.1,y,.34,.34,.3,0x6f777b);}
  if(o.pipe){const [side,off]=o.pipe;on(M,side,off,h/2-.1,.08,h+.2,.1,0x8f9a9e);}
  if(o.canopy){const [side,off,w]=o.canopy;on(M,side,off,2.02,w,.05,.3,0x5f6f78);}
  if(o.meter){const [side,off]=o.meter;on(M,side,off,1.3,.26,.34,.1,0x9aa0a0);on(M,side,off+.3,1.25,.2,.28,.1,0x8f9699);}
  if(o.upper){const u=o.upper;const x0=-b.ls/2+b.ls*u.s[0],x1=-b.ls/2+b.ls*u.s[1],z0=(-b.ld/2+b.ld*u.d[0])*zs,z1=(-b.ld/2+b.ld*u.d[1])*zs;const U={cx:(x0+x1)/2,cz:(z0+z1)/2,w:x1-x0,d:Math.abs(z1-z0)};
    k.box(U.w,u.h,U.d,u.col||0xd9d3c6,U.cx,h+.1+u.h/2,U.cz);k.box(U.w+.24,.07,U.d+.24,u.roof||0x5f6f78,U.cx,h+.1+u.h+.05,U.cz,0,u.tilt?u.tilt*zs:0,0);for(const w_ of (u.wins||[]))win({cx:U.cx,cz:U.cz,w:U.w,d:U.d},[w_[0],w_[1],h+.1+w_[2],w_[3],w_[4]]);
    for(const [side,off] of (u.acs||[]))on(U,side,off,h+.45,.72,.52,.27,0xe9e6dc);
    if(u.rail){const y=h+.15,hr=.95,col=0x7f958d;for(const side of u.rail){const P=side[0]==='d'?[[-b.ls/2+.05,(side[1]==='1'?1:-1)*zs*(b.ld/2-.05)],[b.ls/2-.05,(side[1]==='1'?1:-1)*zs*(b.ld/2-.05)]]:[[(side[1]==='1'?1:-1)*(b.ls/2-.05),-b.ld/2+.05],[(side[1]==='1'?1:-1)*(b.ls/2-.05),b.ld/2-.05]];const A=V3(P[0][0],y+hr,P[0][1]),Bv=V3(P[1][0],y+hr,P[1][1]);k.rod(A,Bv,.022,col,5);k.rod(V3(P[0][0],y+hr*.5,P[0][1]),V3(P[1][0],y+hr*.5,P[1][1]),.016,col,5);const n=Math.max(2,Math.round(A.distanceTo(Bv)/1.1));for(let i=0;i<=n;i++){const q=A.clone().lerp(Bv,i/n);k.rod(V3(q.x,y,q.z),q,.02,col,5);}}}}}
function meters(m){const k=kit(m);k.box(.28,.36,.12,0x9aa0a0,0,1.3,.06).box(.22,.3,.12,0x8f9699,.34,1.26,.06).box(.1,.08,.02,0xdfe8e4,0,1.36,.125).rod(V3(.17,0,.06),V3(.17,1.1,.06),.02,0x6d7478,4);}
function storeDoor(s,d,h0,w){const m=frameSD(s,d,h0,0,1);const k=kit(m);k.box(w+.24,2.08,.1,0x6d7478,0,1.04,.02).box(w,1.86,.06,0xa9afb0,0,.93,.06);for(let y=.22;y<1.8;y+=.18)k.box(w,.02,.02,0x7f8688,0,y,.1);k.box(w+.3,.05,.26,0x5f6f78,0,2.2,.13);} /* a storeroom or boat store cut into the wall */
function storeDoor2(s,d,w){const m=frameSD(s,d,hSD(s,d-.3),0,-1);const k=kit(m);k.box(w+.2,2.1,.06,0x6d7478,0,1.05,.03);for(let y=.2;y<1.95;y+=.16)k.box(w,.03,.03,0x8f9699,0,y,.07);k.box(w+.3,.05,.22,0x5f6f78,0,2.2,.11);} /* a roller door onto the street */
function doorway(s,d,fs,fd,h0,o){o=o||{};const m=frameSD(s,d,h0,fs,fd);const k=kit(m);k.box(1.02,2.08,.08,0x4a4f52,0,1.04,.02).box(.84,1.92,.06,rp([0x6b4a2e,0x8a6a48,0x55646b]),0,.98,.05).box(.05,.14,.05,0xc9b98a,.3,1,.1).box(1.2,.05,.38,0x6f7c83,0,2.3,.19,0,.1).box(1.1,.12,.42,0xb9b4a6,0,.06,.26);
  wallLamp(mul(m,mRot(.72,1.95,.02)));mailbox(mul(m,mRot(-.78,0,.35)));s2Quad(m,.28,.28,[.5+.004,.004,.75-.004,.496],-.72,1.55,.07);}
function s2Fence(pts,o){o=o||{};const K=kit(new T.Matrix4());const col=o.col||rp([0x8a6f52,0x9a9285,0x7b6a58]);const tops=pts.map(([ss,dd])=>{const n=s2At(ss,dd);return {n,h:(o.base?o.base(ss,dd):gAt(n)-R)};});
  for(let i=0;i<tops.length-1;i++){const a=tops[i],b=tops[i+1];const A=a.n.clone().multiplyScalar(R+a.h),B_=b.n.clone().multiplyScalar(R+b.h);K.rod(A,A.clone().addScaledVector(a.n,o.h||.95),.04,0x5a4a3a,4);const n=Math.max(2,Math.round(A.distanceTo(B_)/.16));
    for(let j=0;j<n;j++){const f=(j+.5)/n;const p=A.clone().lerp(B_,f),up=p.clone().normalize();if(ch(.06))continue;K.rod(p,p.clone().addScaledVector(up,(o.h||.95)*rb(.9,1)),.035,col,4);}
    for(const y of [.25,.75])K.rod(A.clone().addScaledVector(a.n,(o.h||.95)*y),B_.clone().addScaledVector(b.n,(o.h||.95)*y),.02,0x5a4a3a,4);}}
/* marks of age on a wall face: a few repair patches and faint moss/water stains, restrained */
function wallMarks(s0,s1,d,low,n,tex){const top=s=>hSD(s,d-low*.65),bot=s=>hSD(s,d+low*.3);for(let i=0;i<n;i++){const s=rb(s0+.5,s1-.5),t=top(s),b_=bot(s);if(t-b_<.8)continue;const m=frameSD(s,d+low*.012,null,0,low);
    if(ch(.45)){const w=rb(.5,1.3),hh=rb(.35,Math.min(1,t-b_-.5));const y=rb(b_+.25,t-hh-.2)-(gAt(s2At(s,d))-R);kit(m).box(w,hh,.02,rp(tex==='stone'?[0xb8b4a8,0xa9a79c]:[0xc8c5ba,0x9f9c91,0xbab4a2]),0,y+hh/2,0);}
    else{const w=rb(.6,1.4),hh=rb(.5,1.2);const y=(b_-(gAt(s2At(s,d))-R))+hh/2+rb(0,.4);const c=rr()<.5?0:.25;DECAL.add(new T.PlaneGeometry(w,hh),mul(m,mRot(0,y,.015)),rp([0x3d5a37,0x4a5540,0x3b4a44]),[c+.002,.502,c+.248,.998],0);}}}
function s2Dress(o){const S=G.S2,Ln=G.s2Lane;const [a1,b1,t1]=S.slot1,[a2,b2,t2]=S.slot2,EG=S.eastGap,BK=S.back,UP=S.upTo,PR=S.prom,L0=S.lane[0],L1=S.lane[1],LO=S.laneOut,TW=S.tallWall;
  S2SIGN=new Bucket('s2-signs',sunMat(new T.MeshBasicMaterial({map:paintS2Signs(),vertexColors:true,side:T.DoubleSide}),.6));const res={};
  const drape=(s,d,h,fs,fd,w)=>{WALLF.add(new T.PlaneGeometry(w||1.3,.85),mul(frameSD(s,d,h,fs,fd),mRot(0,-.38,.02)),0xffffff,B.cellDrape,.08);};
  const ivy=(s,d,h0,hh,fs,fd)=>{WALLF.add(new T.PlaneGeometry(1,hh),mul(frameSD(s,d,h0,fs,fd),mRot(0,hh/2,.02)),0xffffff,B.cellVine,.08);};
  const weedsAlong=(s0,s1,d,n)=>{for(let i=0;i<n;i++){const q=s2At(rb(s0,s1),d+rb(-.12,.12));B[rp(['weed','weed','rosette','fern'])].add(q,rb(.22,.45),rb(.18,.4),rb(.85,1.05));}};
  const pots=(list)=>{for(const [ss,dd,k] of list){const q=s2At(ss+rb(-.08,.08),dd+rb(-.06,.06));const P_=pot(q,k||(ch(.25)?'box':'pot'),rr());B[rp(['shrub','fern','daisy','hyd'])].add(q,.45+rr()*.4,.45+rr()*.5,rb(.9,1.05),P_.h-.06);}};
  const t=s=>atS(MAIN,s).t.clone(),sd=s=>atS(MAIN,s).side.clone();
  const env=(kind,s,d,fs,fd,o)=>{o=o||{};const n=s2At(s,d);const sm=atS(MAIN,s);const f=sm.t.clone().multiplyScalar(fs).addScaledVector(sm.side,fd);if(o.yaw)f.applyAxisAngle(n,o.yaw);glb(kind,n,f,{k:o.k||1,s2:true,sink:o.sink,maxSink:o.maxSink});
    if(o.box){const Z=f.clone().addScaledVector(n,-f.dot(n)).normalize();const X=new T.Vector3().crossVectors(n,Z).normalize();solids.push({c:n.clone().multiplyScalar(R),X,Z,hx:o.box[0],hz:o.box[1],top:o.top||1});}else if(o.r)solids.push({c:n.clone().multiplyScalar(R),r:o.r});}; /* one of Josh's environment props; fs/fd: the way it faces, along the street and across it */
  const bank=(s0,s1,d0,d1,step)=>{for(let s=s0;s<s1;s+=rb(step||.55,(step||.55)*1.5))for(let d=d0;d<d1;d+=rb(.55,.85)){const k_=rr();B[k_<.45?'shrub':k_<.7?'shrubD':k_<.85?'fern':'hyd'].add(s2At(s+rb(-.15,.15),d),rb(.8,1.25),rb(.7,1.15),rb(.9,1.03),0);}}; /* a planted bank: dense, not a lawn */
  const bed=(s,d,ls,ld)=>{const m=frameSD(s,d,null,1,0);kit(m).box(ld+.12,.22,ls+.12,0x8a8578,0,.08,0).box(ld,.06,ls,0x5e4a36,0,.2,0);for(let i=0;i<Math.round(ls/.3);i++)for(const x of [-ld/4,ld/4])B[ch(.5)?'fern':'rosette'].add(tn(s2At(s-ls/2+.15+i*.3,d),V3(0,0,0)),rb(.25,.4),rb(.22,.35),1,.2);}; /* a raised vegetable bed */
  const yardWall=(a,b,d,h,tex)=>s2Wall(line(a,b,d,.9),{low:-1,tex:tex||'block',free:true,h:h||1.1,thick:.18,sink:.6});const line=(a,b,d,st)=>{const r=[];for(let s=a;s<b-.01;s+=st||1.2)r.push([s,d]);r.push([b,d]);return r;};
  /* ---- stair 1: the sign on the corner, the side garden's tree leaning over the slot, washing on its line ---- */
  {env('envSign',263.3,4.62,0,-1,{k:.7,r:.2}); /* the corner of the shop and the stair: a fingerpost, its arms kept clear of the steps and the camera following you down them */
    wallLamp(frameSD(b1-.02,5.9,hSD(b1+.4,5.9)-.05,-1,0));weedsAlong(a1+.1,b1-.1,5.3,4);
    ivy(b1-.02,7.4,Ln(b1),1.8,-1,0);ivy(a1+.02,8.3,Ln(a1),1.4,1,0);meters(frameSD(a1+.03,8.05,1.62,1,0));
    /* the stair's foot: a little dead-end landing with washing, a bike, the meters, a tap */
    meters(frameSD(263.9,BK+.03,Ln(263.9),0,1));env('envBins',263.15,9.7,0,1,{k:.72,box:[.7,.5]});weedsAlong(L0+.1,264,BK+.12,3);}
  /* ---- the corner shop's front: a vending machine at its end, a bicycle against the window, pots by the door, the post box at the corner (Josh's props); the planting between shop and stair ---- */
  {glb('vend2',s2At(259.75,4.45),sd(259.75).negate(),{s2:true});solids.push({c:s2At(259.75,4.45).multiplyScalar(R),X:t(259.75),Z:sd(259.75),hx:.55,hz:.4,top:2});
    env('envBike',260.95,4.52,0,-1,{k:.95,yaw:.06,box:[.7,.25]});env('envPots',261.75,4.58,0,-1,{k:.85,r:.35});env('envHydrant',262.55,4.5,0,-1,{k:.95,r:.2});
    bank(263.25,264.0,5.5,8.9,.45);bank(266.05,266.65,4.7,9.0,.45);}
  {shed(262.7,264.0,12.85,14.1,2.0,{door:'s1',roofTo:'s0',col:0xb9a88c,roof:0x6f7c83});s2Pave(263.95,264.85,11.25,12.85,.04,'setts',0xe9e6dd);bank(265.0,266.6,11.5,14.05,.5);bank(262.7,263.8,11.4,12.6,.5);
    s2Pave(283.35,285.45,12.95,14.1,.04,'conc',0xd6d2c8);pots([[284.9,13.4],[285.1,13.8,'box']]);
    s2Pave(274.6,278.35,11.3,12.45,.04,'conc',0xd8d4ca);s2Pave(283.35,285.45,11.3,12.95,.04,'pave',0xe0dcd2);bins(frameSD(277.6,11.7,null,0,-1)); /* the second row's back yards */
    s2Pave(244.9,248.7,9.2,10.2,.04,'conc',0xd6d2c8);s2Pave(252.5,255.8,9.2,10.0,.04,'conc',0xd6d2c8);acUnit(frameSD(247.2,9.6,hSD(247.2,9.6),0,1),0,.3,0,0); /* service strips behind the garden houses */
    s2Pave(259.6,264.05,4.45,5.2,.04,'conc',0xdcd8ce); /* the shop's forecourt */
    bank(286.6,287.25,6.2,9.0,.45);s2Pave(298.4,303.8,9.8,10.95,.04,'conc',0xd8d4ca);}
  /* ---- the lane: the backs of the street houses above, the second row's fronts on the other side ---- */
  {{const gs=b1+.95,h=hSD(gs,10.1);const K=kit(new T.Matrix4());const a=s2At(gs,BK+.12),b=s2At(gs,LO-.02);const A=a.clone().multiplyScalar(R+h),B_=b.clone().multiplyScalar(R+h);K.rod(A,A.clone().addScaledVector(a,3.0),.07,0x6b4a2e,4).rod(B_,B_.clone().addScaledVector(b,3.0),.07,0x6b4a2e,4).rod(A.clone().addScaledVector(a,2.95),B_.clone().addScaledVector(b,2.95),.06,0x5a3e28,4);
      kit(frameSD(gs,(BK+LO)/2,h+3.05,1,0)).box(2.4,.05,.42,0x4a3a2c,0,0,0);} /* a timber gateway into the lane at the stair's foot: its little roof spans the lane, high enough to clear the camera */
    s2Quad(frameSD(L0+1.1,BK+.03,hSD(L0+1.1,10)+1.45,0,1),.5,.24,[.5+.004,.754,1-.004,.996]); /* 私道 */
    for(let s=b1+2.2;s<L1-.5;s+=rb(4,6.5)){const top=hSD(s,BK-.4);const gl=hSD(s,10.1);if(ch(.6))acUnit(frameSD(s,BK-.05,top,0,1),0,.28,0,0);if(ch(.55)&&Math.abs(s-271.8)>1.5){const k=kit(frameSD(s+1.1,BK+.02,gl,0,1));const hh=top-gl+.4;k.cyl(.045,.045,hh,rp([0xd9d3c3,0x8f9a9e]),0,hh/2,.06,8);}
      if(ch(.55))drape(s+rb(-1,1),BK-.04,top+.02,0,1,rb(1.1,1.6));else if(Math.abs(s-271.8)>1.6)ivy(s,BK+.04,gl,rb(1.2,2),0,1);}
    doorway(271.8,BK+.03,0,1,hSD(271.8,9.7));meters(frameSD(270.55,BK+.03,hSD(270.55,9.7),0,1));umbrella(frameSD(272.7,9.35,null,0,1));pots([[270.9,9.4],[273.3,9.45],[273.7,9.4]]); /* a door into the lower floor of the house above */
    wallLamp(frameSD(276.3,BK+.04,hSD(276.3,10)+1.9,0,1));wallLamp(frameSD(283.2,BK+.04,hSD(283.2,10)+1.9,0,1));
    env('envBike',274.45,9.43,0,1,{k:.95,yaw:-.08,box:[.7,.25]}); /* against the wall by the door, not in the lane */mailbox(frameSD(268.1,LO-.25,null,0,-1));pots([[267.4,LO-.3],[279.2,LO-.28],[280.6,LO-.3]]);
    /* the second row's gardens: a tree over one wall, a shed in the next yard, a lean-to that narrows the lane before the courtyard */
    paintedTree(s2At(264.4,12.9),rb(4.4,5),t(264),true);env('envArch',264.4,11.95,0,-1,{k:.82});for(const x of [263.45,265.35])solids.push({c:s2At(x,11.95).multiplyScalar(R),r:.18}); /* the garden's gateway, straight ahead as you come off the stair */
    shed(275.4,278.2,12.45,14.05,2.1,{roofTo:'d1',door:'d0',doorOff:.6,col:rp([0xc9c1ad,0xa9b3ad]),roof:0x8a5a44});
    shed(281.45,283.3,10.8,12.95,2.15,{roofTo:'s0',door:'s1',window:'d0',col:0xd4cbb8,roof:0x7d6a55});paintedTree(s2At(284.3,13.1),rb(3.8,4.4),t(284),false);
    for(const [a,b,dd] of [[L0+.2,263.2,LO+.05],[265.6,266.6,LO+.05],[274.7,275.3,LO+.05],[283.4,L1-.1,LO+.05]])for(let s=a;s<b;s+=rb(1,1.5))drape(s,dd-.02,hSD(s,LO-.4)+(s<267?1.45:s<276?1.3:1.25),0,-1,rb(.9,1.3));
    weedsAlong(L0,L1,BK+.12,16);weedsAlong(L0,L1,LO-.1,10);wallMarks(b1,EG,BK,1,6,'concrete');wallMarks(L0,a1,BK,1,1,'stone');}
  /* ---- the courtyard at the turn: the yard house's door, a shed, a bench and the first real look at the sea ---- */
  {const src=(window.BLDGS||[]).find(b=>b.key===o.houseKey&&!b.inst.userData.s2);const hsd=o.house;const hh=s2House(o.houseKey,hsd[0],hsd[1],'w',.72,res);res.house=!!hh;
    const sF=hsd[0]-(hh?hh.dp/2:2)-.45;mailbox(frameSD(sF,hsd[1]+1.35,null,-1,0));pots([[sF,hsd[1]-1.3],[sF-.1,hsd[1]-1.75],[sF+.05,hsd[1]+1.9,'box']]);umbrella(frameSD(sF+.2,hsd[1]+.8,null,-1,0));wallLamp(frameSD(EG+.05,6.6,hSD(EG+.5,6.6)+1.9,1,0)); /* the door faces the lane's arrival, across a small forecourt */
    env('envBike',EG+.38,7.7,1,0,{k:.95,yaw:.05,box:[.7,.25]});meters(frameSD(EG+.05,7.6,null,1,0));
    env('envBins',295.3,TW+.85,-1,0,{k:.72,box:[.7,.5]});env('envBench',290.3,13.45,0,1,{k:.8,box:[.9,.35]});env('envPots',289.35,13.3,0,1,{k:.8,yaw:.4}); /* the bins in the service passage; a bench at the view */
    glb('vend2',s2At(EG+.45,5.65),t(EG),{s2:true});solids.push({c:s2At(EG+.45,5.65).multiplyScalar(R),X:sd(EG),Z:t(EG),hx:.55,hz:.42,top:2}); /* a vending machine in the courtyard's corner, by the yard house's bicycle */
    env('envSign',293.35,11.2,1,0,{k:.7,yaw:-.2,r:.18}); /* and a fingerpost at the top of the steps down */
    shed(291.65,294.25,11.8,14.1,2.4,{door:'s0',col:0xd9cfbd,roof:0x5f6f78,detail:true,wins:[['d0',-.4,1.45,.8,.7]],canopy:['s0',-.5,1.1],pipe:['d0',1.2],meter:['s0',.5],upper:{s:[.08,1],d:[.4,1],h:2.1,col:0xe2dccd,tilt:.1,wins:[['d0',.2,1.1,1.0,.75],['s0',.2,1.1,.6,.6]],acs:[['d0',-.7]],rail:['d0','s0']}}); /* an annex: a room on top set back behind a roof terrace; the sea shows only in the gap beside it */
    acUnit(frameSD(292.9,11.78,Ln(292.9),0,-1),0,2.1,.2,0);pots([[291.4,11.95],[291.35,12.4,'box'],[289.1,11.95]]);
    weedsAlong(L1,a2,BK+.1,6);weedsAlong(L1+2.3,a2,UP-.3,5);ivy(a2+.02,12.2,Ln(290)-1.3,1.5,1,0);drape(a2+.02,11.6,Ln(290)+.7,1,0,1.1);}
  /* ---- the yard house's garden, behind its fence: a lean-to, a neighbour's house where the lawn was, a concrete yard, the washing ---- */
  {shed(b2+.5,b2+2.5,TW+.05,TW+1.35,2.3,{roofTo:'d1',door:'d1',col:0xd4cbb8,roof:0x7d6a55});res.h7=!!s2House('7',300.5,7.55,'w',.48,res);paintedTree(s2At(297.4,9.9),rb(4.6,5.4),t(297),true);laundry(302.3,12.5,1,0,1.8);
    s2Pave(296.1,298.3,6.3,10.7,.04,'conc',0xd8d4ca);s2Pave(294.25,295.85,4.9,10.85,.04,'conc',0xd6d2c8); /* the yard house's side passage */s2Pave(299.9,303.8,10.95,14.05,.04,'pave',0xe2ded5);bank(300,303.6,13.45,14.05,.5);bank(302.6,303.8,4.9,10.6,.6);pots([[298.1,6.5],[298.05,6.9,'box'],[300.2,11.1],[300.6,11.05]]);bins(frameSD(296.4,10.3,null,1,0));
    for(let s=EG+.8;s<301;s+=rb(1.8,3))drape(s,TW+.06,hSD(s,4.2)+.02,0,1,rb(1.2,1.7));weedsAlong(EG+.3,301,TW+.15,10);wallMarks(EG,301,TW,1,5,'concrete');
    for(const dd of [11.8,12.9])drape(b2-.02,dd,hSD(b2+.4,dd)+.02,-1,0,1.1);}
  /* ---- the private gardens behind the western houses ---- */
  {shed(257.9,259.9,12.0,13.95,2.0,{door:'s0',roofTo:'d1',col:0xa9b3ad,roof:0x6f7c83,detail:true,wins:[['s0',.5,1.4,.5,.4]],pipe:['s0',-.9]});laundry(250.5,11.2,1,0,2.2);
    s2Pave(242.7,244.85,9.25,13.9,.04,'setts',0xe6e2d8);bank(242.8,244.8,13.3,14.05,.5);pots([[244.5,9.6],[244.2,9.5,'box'],[243.1,11.8]]);
    s2Pave(248.75,252.45,9.2,9.8,.04,'pave',0xdedad0);bed(249.45,12.5,1.5,.9);bed(251.7,12.5,1.5,.9);bank(248.8,252.4,13.45,14.05,.5);
    s2Pave(255.85,257.35,9.2,13.95,.04,'conc',0xd6d2c8);bins(frameSD(256.6,9.55,null,0,1));bike(s2At(256.7,12.6),sd(256));
    s2Pave(257.45,260.0,9.2,11.9,.04,'pave',0xe0dcd2);bank(260.1,262.35,9.4,14.05,.55);paintedTree(s2At(250.7,13.3),rb(4.5,5.5),t(249),false);paintedTree(s2At(261.0,12.3),rb(4.2,5),t(258),true);
    {const m=frameSD(250.6,10.0,null,0,1);kit(m).box(1.5,.08,1.0,0x6b5440,0,.04,0);for(let i=0;i<4;i++)B.fern.add(s2At(250.1+i*.33,10.0),rb(.3,.45),rb(.25,.35),1,.08);} /* a vegetable bed */
    s2Fence([[249.6,BK+.1],[249.6,10.6],[249.6,12.1],[249.6,UP-.25]],{h:.95});s2Fence([[257.4,BK+.1],[257.4,11.4],[257.4,UP-.25]],{h:.9,col:0x8a6f52});
    pots([[246.5,10.1],[246.9,9.95],[247.2,10.25]]);for(let s=256;s<257.8;s+=rb(.6,1))B[ch(.6)?'shrub':'fern'].add(s2At(s,UP-.45),rb(.7,1.1),rb(.6,.95),1,.15);weedsAlong(244,L0,BK+.15,6);}
  /* ---- the coastal path: the wall's foot planted, drains; the hut and boat on the sand to the west ---- */
  {for(let s=246;s<302;s+=rb(3,5))if(s<a2-1||s>b2+1)drape(s,UP+.06,hSD(s,UP-.6)+.02,0,1,rb(1.1,1.6));
    for(let i=0;i<16;i++){const ss=rb(245,302);if(ss>a2-.6&&ss<b2+.6)continue;const q=s2At(ss,UP+.25+rr()*.25);if(ch(.7))B[rp(['fern','weed','rosette','daisy'])].add(q,rb(.35,.7),rb(.3,.6),1);else plant(q,0);}
    B.hyd.add(s2At(277.4,UP+.3),1,.9,1);B.fern.add(s2At(268.6,UP+.3),.8,.6,1);
    for(const ss of [253.5,268.2,283.4,299.6]){const h=hSD(ss,UP+.4);const m=frameSD(ss,UP+.02,h+.35,0,1);kit(m).cyl(.09,.09,.45,0x8f9699,0,0,.2,10,Math.PI/2);const c=rr()<.5?0:.25;DECAL.add(new T.PlaneGeometry(.5,.9),mul(m,mRot(0,-.45,.012)),0x4a4a40,[c+.002,.502,c+.248,.998],0);} /* drain outlets, each with its stain */
    wallMarks(246,302,UP,1,8,'stone');
    env('envShack',253.3,18.45,0,-1,{k:.8,maxSink:.3,box:[1.8,1.75],top:2.6}); /* the surf shack, its door to the path */
    env('envAwning',256.9,17.75,0,-1,{k:2,yaw:-.12,box:[1.1,.75],top:1.9}); /* a stall beside it */
    env('envBins',250.95,17.9,0,-1,{k:.72,yaw:.2,box:[.7,.5]});env('envPots',255.0,17.2,0,-1,{k:.75,yaw:-.3,r:.3});
    env('envBench',263.9,16.55,0,1,{k:.8,yaw:.25,box:[.9,.35]}); /* under the pine, facing the sea */
    {const n=s2At(260.2,17.3);const m=basisM(n,t(260.2).applyAxisAngle(atS(MAIN,260.2).n,.35));m.setPosition(onG(n,-.28));kit(m).box(1.05,.42,3,0xe9e6de,0,.21,0).box(1.07,.1,3.02,0x2d5f8f,0,.34,0).box(.7,.3,.5,0xe9e6de,0,.15,1.6);solids.push({c:n.clone().multiplyScalar(R),r:1.1});}
    /* the coastal path as a sequence: out past the end building, the boat shed, a hedged opening, the house on the sea wall, then the beach */
    shed(284.5,288.2,16.12,19.3,2.6,{base:G.s2Prom(286.3)-.05,plinth:true,door:'d0',doorOff:1.1,col:0x8a6f52,roof:0x6f7c83,detail:true,wins:[['d0',-.7,1.5,.9,.6]],pipe:['d0',-1.75],upper:{s:[.15,1],d:[.3,1],h:1.9,col:0x9a7d5e,tilt:.15,wins:[['d0',0,1.0,1.1,.6],['s0',0,1.0,.7,.55]],rail:['d0']}});shed(283.4,284.5,16.12,18.4,1.9,{base:G.s2Prom(283.9)-.05,plinth:true,roofTo:'s0',col:0x7b6a58,roof:0x5f6f78}); /* the boat shed: a loft over it, a lean-to on its end */
    shed(299.95,303.3,14.25,16.35,2.7,{base:G.s2Prom(301.6)-.05,plinth:true,door:'s0',doorOff:-.3,window:'d0',roofTo:'s1',col:0xc9c1ad,roof:0x8a5a44});
    for(const [ss,w] of [[279.3,1.5],[290.1,1.3],[265.4,1.2]])storeDoor(ss,UP+.03,G.s2Prom(ss),w);meters(frameSD(281.1,UP+.03,G.s2Prom(281.1),0,1));
    for(let s=276.2;s<282.6;s+=rb(.5,.8))if(s<278.4||s>280.4)B[ch(.7)?'shrub':'shrubD'].add(s2At(s,PR-.15),rb(1.1,1.5),rb(1,1.3),rb(.9,1.02),.3); /* planters on the sea wall: the sea in pieces */
    paintedTree(s2At(263.4,17.4),rb(5.2,6.2),t(263),true); /* a pine at the corner where the path meets the sand */
    {const m=frameSD(274.4,PR-.22,G.s2Prom(274.4),1,0);kit(m).box(.46,.55,2.6,0x9c9a90,0,.27,0);for(let s=273.3;s<275.6;s+=.5)B[ch(.6)?'shrub':'shrubD'].add(s2At(s,PR-.22),rb(1.1,1.4),rb(1,1.3),1,.5);paintedTree(s2At(274.5,PR-.22),rb(4,4.6),t(274),false);solids.push({c:s2At(274.4,PR-.22).multiplyScalar(R),X:atS(MAIN,274.4).t.clone(),Z:atS(MAIN,274.4).side.clone(),hx:1.3,hz:.23,top:.6});} /* a planter and a tree on the sea wall between the two buildings */
    shed(255.2,258.9,14.24,15.05,2.4,{door:'d1',doorOff:-.9,col:0xc9c1ad,roof:0x6f7c83,flat:true,detail:true,wins:[['d1',.55,1.45,1.0,.7]],canopy:['d1',-.9,1.0],pipe:['d1',1.75],upper:{s:[0,.35],d:[0,.6],h:.9,col:0xb9b4a6,wins:[]}});{const t_=[];for(const ss of [255.25,256.5,257.7,258.85])t_.push({n:s2At(ss,14.95),h:hSD(257,14.6)+2.5});s2Rail(t_,null,{col:0x7f958d,h:.9,space:1.2,mid:true,r:.02});} /* a workshop built into the wall's foot: the path bends out round it onto the sand */
    acUnit(frameSD(257.9,15.07,hSD(257.9,15.3),0,1),0,.35,.15,0);meters(frameSD(258.92,14.7,hSD(258.92,14.9),1,0));pots([[255.0,14.45],[254.7,14.4,'box']]);
    for(let s=247;s<254.5;s+=rb(.5,.8))B[ch(.7)?'shrub':'shrubD'].add(s2At(s,UP+.35),rb(1.2,1.7),rb(1.1,1.5),rb(.9,1.02),0); /* a hedge along the wall's foot further on */
    for(const [ss,dd] of [[248.5,16.9],[257.2,17.2],[250.5,18],[263.5,16.8]])for(let j=0;j<4;j++)B[ch(.6)?'pampas':'weed'].add(s2At(ss+rb(-1,1),dd+rb(-.4,.4)),rb(.6,1),rb(.6,1.1),rb(.95,1.1));}
  /* ---- poles along the street; one more in the strip beside the courtyard, its wires dropping to the yard house ---- */
  {const kerb=MAIN.kerb;const P=[];for(const s of o.poles){const sm=atS(MAIN,s);const n=s2At(s,kerb+.32);if(solidHit(n,.4)||doorNear(n,1.4))continue;P.push(Object.assign(pole(n,sm.side.clone().negate(),{tr:ch(.4),lamp:ch(.5),box:ch(.3),H:rb(7,7.8),guard:ch(.15)?'stripe':'none'}),{s}));}
    const yp=s2At(o.yardPole[0],o.yardPole[1]);const Y=pole(yp,sd(o.yardPole[0]).negate(),{tr:true,lamp:true,box:false,H:7.2,guard:'none'});solids.push({c:yp.clone().multiplyScalar(R),r:.2});
    for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1];const dd=a.top[1].distanceTo(b.top[1]);if(dd>19)continue;const sg=.32+dd*.022;for(let k=0;k<3;k++)cable(a.top[k],b.top[k],sg+rr()*.1,.011);cable(a.tel[0],b.tel[0],sg+.3,.018,0x262e35);}
    if(P.length){const last=P[P.length-1];cable(last.mid[0],Y.mid[0],.45,.011);cable(last.tel[0],Y.tel[0],.6,.016,0x262e35);}
    const hs=s2At(o.house[0],o.house[1]);const hp=hs.clone().multiplyScalar(gAt(hs)+4.2);cable(Y.drop,hp,.3,.01,0x2d353c);
    {const a=s2At(262.4,4.8),b=s2At(269.8,9.4);cable(a.multiplyScalar(hSD(262.4,4.8)+R+5.6),b.multiplyScalar(hSD(269.8,9.4)+R+4.2),.35,.01,0x2d353c);} /* a line across the stair slot */
    for(const b of (window.BLDGS||[])){if(b.inst.userData.s2)continue;const c=G.s2Coords(b.inst.position.clone().normalize(),Math.asin(b.inst.position.clone().normalize().y));if(!c||c.s<248||c.s>EG+2||c.d<0)continue;for(const p_ of P){const q=b.inst.localToWorld(V3((b.foot[0]+b.foot[1])/2,Math.min(b.top*.62,5)/b.sc,b.foot[3]+.05/b.sc));const dd=q.distanceTo(p_.drop);if(dd>2&&dd<10&&ch(.6))cable(p_.drop,q,.3+dd*.03,.01,0x2d353c);}}
    res.poles=P.length+1;}
  return res;}

/* ===================== ZONES (1 Oct 2026): somewhere to hang out =====================
   The town had streets and the skate park; Josh wanted places to stop. A forest on the north cap, west of the break
   room: a path in from the road, a stream with a footbridge, and a clearing with a campfire where three residents sit,
   one of them playing the guitar. And a beach hangout east of the cinema: umbrellas, towels, deck chairs, a radio. */
const ZONE_F={lon:-.41,lat:1.17},ZONE_B={lon:1.12,lat:-.322};
const FIRE_R=6.5;let fireC_=null;function nearFire(n){fireC_=fireC_||sphere(ZONE_F.lon,ZONE_F.lat);return Math.acos(Math.min(1,n.clone().normalize().dot(fireC_)))*R<FIRE_R;} /* no tree (painted, model or swapped) stands within this of the campfire: one grew right behind the fire and hid Kofi */
function zFrame(z){const n=sphere(z.lon,z.lat);const e=V3(-Math.sin(z.lon),0,Math.cos(z.lon)).normalize();const no=V3(-Math.sin(z.lat)*Math.cos(z.lon),Math.cos(z.lat),-Math.sin(z.lat)*Math.sin(z.lon)).normalize();
  const at=(x,y)=>tn(n,e.clone().multiplyScalar(x).addScaledVector(no,y));const dir=(x,y)=>e.clone().multiplyScalar(x).addScaledVector(no,y);return {n,e,no,at,dir};}
function paintDirt(){const c=canvas(256,256),g=c.getContext('2d');g.clearRect(0,0,256,256);const gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'rgba(176,146,104,0)');gr.addColorStop(.18,'rgba(176,146,104,.95)');gr.addColorStop(.82,'rgba(176,146,104,.95)');gr.addColorStop(1,'rgba(176,146,104,0)');g.fillStyle=gr;g.fillRect(0,0,256,256);
  for(let i=0;i<220;i++){const y=40+Math.random()*176;g.fillStyle=`rgba(${rp([110,140,200])},${rp([90,115,170])},${rp([70,85,130])},.35)`;g.beginPath();g.ellipse(Math.random()*256,y,1+Math.random()*4,1+Math.random()*2.5,Math.random()*3,0,7);g.fill();}
  const t=texOf(c);t.wrapS=T.RepeatWrapping;return t;}
function paintWater(){const c=canvas(256,256),g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'rgba(90,120,80,0)');gr.addColorStop(.1,'rgba(98,120,92,.9)');gr.addColorStop(.2,'#3f8fb0');gr.addColorStop(.5,'#2f7aa0');gr.addColorStop(.8,'#3f8fb0');gr.addColorStop(.9,'rgba(98,120,92,.9)');gr.addColorStop(1,'rgba(90,120,80,0)');g.fillStyle=gr;g.fillRect(0,0,256,256);
  g.strokeStyle='rgba(235,248,255,.7)';g.lineWidth=2.2;for(let i=0;i<26;i++){const x=Math.random()*256,y=60+Math.random()*136,w=10+Math.random()*28;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+w/2,y-3,x+w,y);g.stroke();}
  const t=texOf(c);t.wrapS=T.RepeatWrapping;return t;}
function paintZoneSign(lines){const c=canvas(512,256),g=c.getContext('2d');g.fillStyle='#8a6a48';g.fillRect(0,0,512,256);g.fillStyle='#e9dcc0';g.fillRect(14,14,484,228);g.fillStyle='#2b2118';g.textAlign='center';g.textBaseline='middle';g.font='700 92px "Hiragino Sans","Noto Sans JP",sans-serif';g.fillText(lines[0],256,96);g.font='700 50px "Patrick Hand","Segoe Print",cursive';g.fillText(lines[1],256,190);return texOf(c);}
let ZW=null;
function zones(){const res={};ZW={dirt:new Bucket('z-dirt',new T.MeshBasicMaterial({map:paintDirt(),vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),{ud:{roadInk:true},order:1}),
    water:new Bucket('z-water',new T.MeshBasicMaterial({map:paintWater(),vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),{ud:{roadInk:true},order:1})};
  try{res.forest=forestZone();}catch(e){res.ferr=String(e&&e.stack||e);console.warn('forest',e);}
  try{res.beach=beachZone();}catch(e){res.berr=String(e&&e.stack||e);console.warn('beach zone',e);}
  return res;}
const nearRoads=n=>ROADS.filter(r=>r.kind!=='track'&&r.samples.some(sm=>sm.n.dot(n)>Math.cos(40/R)));
function polyDist(pts,q){let best=1e9;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];const ab=b.clone().sub(a),aq=q.clone().sub(a);const t=Math.max(0,Math.min(1,aq.dot(ab)/ab.lengthSq()));best=Math.min(best,a.clone().addScaledVector(ab,t).distanceTo(q)*R);}return best;}
/* a resident, cloned, posed sitting (or lying), facing a point */
const ZPEOPLE=[],p_mx=[];
function zPerson(name,n,face,o){o=o||{};const src=G.npcs.find(p=>p.name===name&&p.model);if(!src||!THREE.SkeletonUtils)return null;const root=THREE.SkeletonUtils.clone(src.model.root);root.traverse(m=>{if(m.isMesh){m.material=m.material.clone();m.frustumCulled=false;}});
  const holder=new T.Group();holder.add(root);const [lo,la]=lonLatOf(n);placeOn(holder,lo,la,yawFor(lo,la,face.clone().negate()));holder.userData.noCull=true; /* the models face -Z in their holders */
  const bones={};root.traverse(b=>{if(b.isBone)bones[b.name]=b;});const clip=src.model.act.idle&&src.model.act.idle.getClip();if(clip){const mx=new T.AnimationMixer(root);const a=mx.clipAction(clip);a.play();mx.update(.25);p_mx.push(mx);} /* held on that frame: the mixer is never updated again, and stopping it would put the bind pose back */
  const qx=new T.Quaternion(),ax=V3(1,0,0),az=V3(0,0,1),ay=V3(0,1,0);
  if(o.pose!=='stand'){for(const k of ['L_Thigh','R_Thigh'])bones[k]&&bones[k].quaternion.multiply(qx.setFromAxisAngle(ax,1.45));for(const k of ['L_Calf','R_Calf'])bones[k]&&bones[k].quaternion.multiply(qx.setFromAxisAngle(ax,-1.45));}
  if(o.pose==='lie'){for(const k of ['L_Thigh','R_Thigh'])bones[k]&&bones[k].quaternion.multiply(qx.setFromAxisAngle(ax,-1.45));for(const k of ['L_Calf','R_Calf'])bones[k]&&bones[k].quaternion.multiply(qx.setFromAxisAngle(ax,1.45));
    for(const k of ['L_Upperarm','R_Upperarm'])bones[k]&&bones[k].quaternion.multiply(qx.setFromAxisAngle(az,k[0]==='L'?-.9:.9));}
  holder.updateMatrixWorld(true);const up=n.clone();const g=gAt(n);
  if(o.pose==='lie'){root.rotation.x=-Math.PI/2;holder.updateMatrixWorld(true);const hw=new T.Vector3(),fw=new T.Vector3();(bones.Head||root).getWorldPosition(hw);(bones.L_Foot||root).getWorldPosition(fw);const mid=hw.add(fw).multiplyScalar(.5);const off=n.clone().multiplyScalar(mid.length()).sub(mid);off.addScaledVector(up,-off.dot(up));holder.position.add(off);holder.updateMatrixWorld(true); /* centred on the towel */
    let lo2=1e9;root.traverse(m=>{if(m.isBone){const w=new T.Vector3();m.getWorldPosition(w);lo2=Math.min(lo2,w.dot(up));}});holder.position.addScaledVector(up,g+(o.seat||.12)-lo2);}
  else if(bones.Pelvis){const w=new T.Vector3();bones.Pelvis.getWorldPosition(w);holder.position.addScaledVector(up,g+(o.seat||.46)-w.dot(up)+.04);}
  holder.updateMatrixWorld(true);const p={name,holder,root,bones,o,rest:{}};for(const k in bones)p.rest[k]=bones[k].quaternion.clone();ZPEOPLE.push(p);G.dirty();return p;}
function guitar(p){const g=new T.Group();const wood=new T.MeshBasicMaterial({color:0xc8843e}),dark=new T.MeshBasicMaterial({color:0x4a2e1a}),pale=new T.MeshBasicMaterial({color:0xe9d2a8});
  const b1=new T.Mesh(new T.SphereGeometry(.2,16,10),wood);b1.scale.set(1,1,.32);const b2=new T.Mesh(new T.SphereGeometry(.15,16,10),wood);b2.scale.set(1,1,.32);b2.position.y=.2;const hole=new T.Mesh(new T.CircleGeometry(.055,14),dark);hole.position.set(0,.1,.066);
  const neck=new T.Mesh(new T.BoxGeometry(.05,.5,.03),dark);neck.position.set(0,.55,.02);const head=new T.Mesh(new T.BoxGeometry(.075,.13,.03),dark);head.position.set(0,.85,.01);const bridge=new T.Mesh(new T.BoxGeometry(.11,.02,.02),dark);bridge.position.set(0,-.06,.07);
  g.add(b1,b2,hole,neck,head,bridge);for(const m of [b1,b2,hole,neck,head,bridge]){m.userData.noInk=true;hideInNormals.push(m);}
  const bp=p.bones.Spine01||p.bones.Pelvis;if(!bp)return null;bp.add(g);p.gtr=gtrPrep(p,g);if(!p.gtr){const s=1/(p.root.scale.x||1);g.scale.setScalar(s);g.position.set(.1*s,.02*s,.2*s);g.rotation.set(0,0,1.15);} /* (the old fixed lap pose if the rig lacks arm bones) */
  return g;}
/* Kofi plays it (Josh: "hold the guitar like he's playing it ... looking down at it ... slight movements ... playing and singing"). The guitar lies
   across his lap, its body on his right thigh and the neck up to his left: placed in his holder's frame (he faces -Z there), then hung on his
   spine so it sways with him. Each frame both arms reach it by an analytic two-bone IK (as the street activists hold their placards): the
   left hand round the neck, moving between two chord shapes now and then, the right over the soundhole, strumming across the strings. Each arm
   bone turns from its rest by the rotation that carries the rest (bone direction, elbow axis) frame onto the solved one, so the elbows bend as
   hinges. He leans in over it, head bowed to the neck, nodding in time and now and then lifting his head to sing. Numbers in GTR, which
   DRESS.GTR exposes for tuning from the console. Guitar-local: y runs up the neck (the body's centre at 0, the soundhole at .1, the nut at .8),
   z out of its face, x across the strings. */
const GTR={c:[.12,.19,-.18],neck:[-1,.46,-.12],tilt:.5,L:[.04,.56,-.015],R:[-.01,.1,.075],chord:.07,strum:.05,hz:1.6,pL:[-.25,-1,.4],pR:[.75,-.35,.65],lean:.16,look:[.36,.24],sing:.2,tw:[.3,0],bend:[1.7,0]}; /* tw, bend: [left, right] hand turns about the forearm and about the elbow's axis, so the palms meet the neck and the strings */
const _gm=new T.Matrix4(),_gm2=new T.Matrix4(),_gs=new T.Vector3(),_gp=new T.Vector3(),_gq=new T.Quaternion(),_gq2=new T.Quaternion(),_gq3=new T.Quaternion(),_gu=new T.Vector3(),_gv=new T.Vector3(),_ge=new T.Vector3(),_gw=new T.Vector3(),_gn=new T.Vector3(),_gd=new T.Vector3(),_gt=new T.Vector3(),_gc=new T.Vector3();
const gBasis=(d,n,q)=>q.setFromRotationMatrix(_gm2.makeBasis(d,n,_gc.crossVectors(d,n)));
function gtrPrep(p,g){const H=p.holder,B=p.bones;let mesh=null;p.root.traverse(m=>{if(!mesh&&m.isSkinnedMesh)mesh=m;});if(!mesh||!B.Spine01||!B.Pelvis)return null;
  H.updateMatrixWorld(true);const hi=new T.Matrix4().copy(H.matrixWorld).invert(),F=V3(0,0,-1);
  const loc=b=>{const pp=new T.Vector3(),q=new T.Quaternion();new T.Matrix4().multiplyMatrices(hi,b.matrixWorld).decompose(pp,q,new T.Vector3());return {p:pp,q};};
  const out={arms:[],g,hi};
  for(const sd of ['L','R']){const up=B[sd+'_Upperarm'],fo=B[sd+'_Forearm'],ha=B[sd+'_Hand'];if(!up||!fo||!ha||fo.parent!==up)return null;
    const U=loc(up),Fo=loc(fo),Hh=loc(ha),du=Fo.p.clone().sub(U.p),df=Hh.p.clone().sub(Fo.p),l1=du.length(),l2=df.length();du.normalize();df.normalize();
    const pre=(d,q)=>gBasis(d,new T.Vector3().crossVectors(d,F).normalize(),new T.Quaternion()).invert().multiply(q);
    const sk=mesh.skeleton,geo=mesh.geometry,k=sk.bones.indexOf(ha),P=geo.attributes.position,SI=geo.attributes.skinIndex,SW=geo.attributes.skinWeight,M_=new T.Matrix4().multiplyMatrices(hi,ha.matrixWorld).multiply(sk.boneInverses[k]).multiply(mesh.bindMatrix),v=new T.Vector3(),hc=new T.Vector3();let cnt=0;
    if(k>=0)for(let i=0;i<P.count;i++){let w=0;if(SI.getX(i)===k)w+=SW.getX(i);if(SI.getY(i)===k)w+=SW.getY(i);if(SI.getZ(i)===k)w+=SW.getZ(i);if(SI.getW(i)===k)w+=SW.getW(i);if(w>.5){hc.add(v.fromBufferAttribute(P,i).applyMatrix4(M_));cnt++;}}
    if(cnt)hc.multiplyScalar(1/cnt).sub(Hh.p).applyQuaternion(Hh.q.clone().invert());else hc.copy(df).multiplyScalar(.08).applyQuaternion(Hh.q.clone().invert()); /* the middle of the hand's skin, in the hand's rest frame: the palm is aimed, not the wrist */
    out.arms.push({sd,up,fo,ha,l1,l2,pu:pre(du,U.q),pf:pre(df,Fo.q),hq:p.rest[sd+'_Hand'].clone(),hc,off:new T.Vector3(),tg:new T.Vector3(),pole:new T.Vector3()});}
  out.pelvis=loc(B.Pelvis).p;gtrSeat(p,out);return out;}
function gtrSeat(p,o){const g=o.g,n=V3(...GTR.neck).normalize(),f=V3(0,Math.sin(GTR.tilt),-Math.cos(GTR.tilt));f.addScaledVector(n,-f.dot(n)).normalize();const x=new T.Vector3().crossVectors(n,f);
  _gm.makeBasis(x,n,f).setPosition(o.pelvis.clone().add(V3(...GTR.c))); /* the guitar in his holder's frame */
  p.bones.Spine01.updateMatrixWorld(true);_gm2.multiplyMatrices(o.hi,p.bones.Spine01.matrixWorld).invert();_gm2.multiply(_gm).decompose(g.position,g.quaternion,g.scale);}
const _ax=V3(1,0,0),_ay=V3(0,1,0),_az=V3(0,0,1);
function gtrTurn(p,b,q){ /* turn bone b by q, a rotation given in the holder's frame */const hi=p.gtr.hi;_gm.multiplyMatrices(hi,b.parent.matrixWorld).decompose(_gp,_gq2,_gs);_gq3.copy(_gq2).multiply(b.quaternion);_gq3.premultiply(q);b.quaternion.copy(_gq2.invert()).multiply(_gq3);}
function gtrPlay(p,t){const o=p.gtr,B=p.bones,H=p.holder;if(!o)return;
  for(const k of ['Spine01','Spine02','Head','L_Upperarm','L_Forearm','L_Hand','R_Upperarm','R_Forearm','R_Hand'])if(B[k])B[k].quaternion.copy(p.rest[k]);
  const beat=t*GTR.hz*Math.PI*2,phr=t%9,sing=phr>5.5&&phr<8.3?Math.sin((phr-5.5)/2.8*Math.PI):0; /* a phrase every 9 s: the head comes up to sing for a few seconds */
  gtrTurn(p,B.Spine01,_gq.setFromAxisAngle(_az,.035*Math.sin(beat*.25)));
  if(B.Spine02)gtrTurn(p,B.Spine02,_gq.setFromAxisAngle(_ax,-(GTR.lean*(1-.5*sing))+.012*Math.sin(beat*.5)));
  H.updateMatrixWorld(true);o.hi.copy(H.matrixWorld).invert();
  _gm.multiplyMatrices(o.hi,o.g.matrixWorld); /* the guitar's frame, in the holder's */
  const ch=Math.floor(t/2.4)%2,stroke=Math.sin(beat)*(.75+.25*Math.sin(beat*.5+1)); /* a down-up strum on the beat, a little uneven; the chord changes every 2.4 s */
  for(const a of o.arms){const L=a.sd==='L';const c=L?GTR.L:GTR.R;
    a.tg.set(c[0]+(L?0:GTR.strum*stroke),c[1]+(L?(ch?GTR.chord:0):0),c[2]+(L?0:.01*Math.abs(stroke))).applyMatrix4(_gm);
    a.pole.set(...(L?GTR.pL:GTR.pR)).normalize();
    a.up.parent.updateMatrixWorld(true);_gp.setFromMatrixPosition(a.up.matrixWorld).applyMatrix4(o.hi); /* the shoulder */
    _gm2.multiplyMatrices(o.hi,a.up.parent.matrixWorld).decompose(_gt,_gq2,_gs); /* the clavicle's turn, in the holder's frame */
    _gd.subVectors(a.tg,a.off).sub(_gp);const dist=_gd.length(),dc=Math.min(Math.max(dist,Math.abs(a.l1-a.l2)+1e-3),(a.l1+a.l2)*.999);_gu.copy(_gd).divideScalar(dist||1);
    const ea=(a.l1*a.l1-a.l2*a.l2+dc*dc)/(2*dc),eh=Math.sqrt(Math.max(0,a.l1*a.l1-ea*ea));
    _gv.copy(a.pole).addScaledVector(_gu,-a.pole.dot(_gu));if(_gv.lengthSq()<1e-6)_gv.set(L?-1:1,0,0);_gv.normalize();
    _ge.copy(_gp).addScaledVector(_gu,ea).addScaledVector(_gv,eh);_gw.copy(_gp).addScaledVector(_gu,dc);_gn.crossVectors(_gv,_gu).normalize();
    _gd.subVectors(_ge,_gp).divideScalar(a.l1);const qu=gBasis(_gd,_gn,new T.Quaternion()).multiply(a.pu);
    _gd.subVectors(_gw,_ge).divideScalar(a.l2);const qf=gBasis(_gd,_gn,new T.Quaternion()).multiply(a.pf);
    const j=L?0:1;_gq.setFromAxisAngle(_gd,GTR.tw[j]).multiply(_gq3.setFromAxisAngle(_gn,GTR.bend[j]+(L?0:.18*stroke)));const qh=_gq.multiply(qf).multiply(a.hq); /* the hand: its rest angle to the forearm, then turned (the strumming wrist flicks) */
    a.off.copy(a.hc).applyQuaternion(qh); /* where the palm is from the wrist: next frame's wrist aim allows for it */
    a.up.quaternion.copy(_gq2.invert()).multiply(qu);a.ha.quaternion.copy(qf.clone().invert()).multiply(qh);a.fo.quaternion.copy(qu.invert()).multiply(qf);}
  if(B.Head){H.updateMatrixWorld(true);const look=GTR.look[0]*(1-sing*1.1)+.03*Math.sin(beat);
    gtrTurn(p,B.Head,_gq.setFromAxisAngle(_ay,GTR.look[1]*(1-.6*sing)).multiply(_gq2.setFromAxisAngle(_ax,-look)).multiply(_gq3.setFromAxisAngle(_az,GTR.sing*sing*.25*Math.sin(t*1.3))));}}
/* ---------- the forest ---------- */
/* the town's own scattered props (rocks, tufts, the odd planter) out of a zone's open ground, and their collision circles */
function zClear(c,r){const keep=new Set((window.BLDGS||[]).map(b=>b.inst));const npcH=new Set(G.npcs.map(n=>n.model&&n.model.holder).filter(Boolean));let k=0;const gone=[];
  for(const ch_ of [...scene.children]){if(!ch_.isGroup||keep.has(ch_)||npcH.has(ch_)||ch_.userData.s2||ch_.userData.zone||(ch_.name||'').startsWith('dress'))continue;const q=ch_.position.clone().normalize();if(q.dot(c)<Math.cos(r/R))continue;if(ch_.userData.tree&&!ch_.userData.tree.done)continue;if(new T.Box3().setFromObject(ch_).getSize(V3()).length()>4.5)continue;scene.remove(ch_);gone.push(ch_.position.clone());k++;}
  for(let i=solids.length-1;i>=0;i--){const so=solids[i];if(so.r===undefined||so.r>1)continue;if(gone.some(p=>p.distanceTo(so.c)<.7))solids.splice(i,1);} /* only the circles of what was taken away */G.dirty();return k;}
function forestZone(){sd_=1001;const F=zFrame(ZONE_F);const res={};res.cleared=zClear(F.n,4.6);const roads=nearRoads(F.n);const ROOMN=sphere(.6,1.5);
  /* the path: from the clearing to the nearest road, the way you came in */
  /* the way in: of all the directions out of the clearing, the longest clear walk through the trees to a road (not past the break room or a house) */
  let best=null;for(let k=0;k<72;k++){const th=k/72*6.283;const dv=F.dir(Math.cos(th),Math.sin(th));let r=4,okk=true;for(;r<26;r+=.4){const q=tn(F.n,dv.clone().multiplyScalar(r));if(Math.acos(Math.min(1,q.dot(ROOMN)))*R<12||solidHit(q,1.4)&&r>5.5){okk=false;break;}if(roadDist(q,roads)<-.3)break;}if(!okk||r>=26)continue;if(!best||r>best.r)best={r,dv};}
  const edge=best?best.r-1.2:6;res.edge=+edge.toFixed(1);const toRoad=(best?best.dv:F.e).clone();const side=new T.Vector3().crossVectors(F.n,toRoad).normalize();
  const pAt=(a,b)=>tn(F.n,toRoad.clone().multiplyScalar(a).addScaledVector(side,b));
  const path=[];for(let a=3.6;a<=edge;a+=.6){const b=.7*Math.sin(a*.55);path.push(pAt(a,b));}groundStrip(ZW.dirt,path,1.7,.035,0xffffff,2.2,[0,1]);
  /* the stream: across the path halfway, curving away both sides */
  const cross=Math.min(edge-2.2,Math.max(5.4,(3.6+edge)/2));res.cross=+cross.toFixed(1);const stream=[];for(let b=-18;b<=18;b+=.7){const a=cross+1.1*Math.sin(b*.32)-.012*b*b;const q=pAt(a,b);if(nearRoads(q).length&&roadDist(q,roads)<1.2)continue;if(Math.acos(Math.min(1,q.dot(ROOMN)))*R<11)continue;if(Math.abs(b)>2&&solids.some(so=>so.r===undefined&&so.hx*so.hz>1&&Math.abs(q.clone().multiplyScalar(R).sub(so.c).dot(so.X))<so.hx+.8&&Math.abs(q.clone().multiplyScalar(R).sub(so.c).dot(so.Z))<so.hz+.8))continue;stream.push({q,b});} /* only buildings stop the water; it runs past the trees */
  const runs=[];let cur=[];for(let i=0;i<stream.length;i++){if(i&&Math.abs(stream[i].b-stream[i-1].b)>.75){runs.push(cur);cur=[];}cur.push(stream[i]);}runs.push(cur);
  for(const run of runs){if(run.length<2)continue;groundStrip(ZW.water,run.map(s=>s.q),1.7,.04,0xffffff,3,[0,1]);
    for(let i=0;i<run.length-1;i++){const s0=run[i],s1=run[i+1];const mb=(s0.b+s1.b)/2;if(Math.abs(mb)<1.1)continue;const m=s0.q.clone().add(s1.q).normalize();const X=s1.q.clone().sub(s0.q);const len=X.length()*R;X.addScaledVector(m,-X.dot(m)).normalize();solids.push({c:m.clone().multiplyScalar(R),X,Z:new T.Vector3().crossVectors(X,m).normalize(),hx:len/2+.05,hz:.55,top:.3});} /* you cross on the bridge, not through the water */
    for(const s of run){if(Math.abs(s.b)<1.3)continue;const t=s.q;if(ch(.35))B[rp(['weed','fern','pampas'])].add(tn(t,side.clone().multiplyScalar(rb(-1,1)).addScaledVector(toRoad,ch(.5)?.95:-.95)),rb(.4,.8),rb(.4,.9),1);if(ch(.25)){const r=tn(t,toRoad.clone().multiplyScalar(ch(.5)?.88:-.88));kit(basisM(r,toRoad).setPosition(onG(r,-.05))).box(rb(.25,.45),rb(.15,.25),rb(.2,.35),rp([0x9a978c,0x8a8a80,0xa8a59b]),0,.08,0,rr()*3);}}}
  res.stream=stream.length;
  /* the footbridge: an arched deck across the water, walkable, with a rail each side */
  {const c=pAt(cross,0);const L=3.4,W=1.3,H=.32;const m=basisM(c,toRoad);const g=gAt(c)-R;m.setPosition(c.clone().multiplyScalar(R+g));const k=kit(m);const N=9;
    for(let i=0;i<N;i++){const t=(i+.5)/N,z=(t-.5)*L,y=H*Math.sin(Math.PI*t);k.box(W,.06,L/N-.03,rp([0x9c7a52,0x8a6a48,0xa7845a]),0,y+.05,z,0,-Math.cos(Math.PI*t)*Math.PI*H/L*.9);}
    for(const sx of [-1,1]){for(let i=0;i<=4;i++){const t=i/4,z=(t-.5)*L,y=H*Math.sin(Math.PI*t);k.box(.08,.8,.08,0x6b4a2e,sx*(W/2),y+.4,z);}const pts=[];for(let i=0;i<=8;i++){const t=i/8;pts.push(V3(sx*W/2,H*Math.sin(Math.PI*t)+.82,(t-.5)*L));}for(let i=0;i<8;i++)k.rod(pts[i],pts[i+1],.035,0x7a5a3e,5);
      solids.push({c:tn(c,side.clone().multiplyScalar(sx*(W/2+.12))).multiplyScalar(R),X:side.clone(),Z:toRoad.clone(),hx:.1,hz:L/2,top:1});}
    k.box(W+.4,.2,.5,0x8a8a80,0,.0,-L/2-.1).box(W+.4,.2,.5,0x8a8a80,0,0,L/2+.1);
    const cc=c.clone(),tr=toRoad.clone(),sd=side.clone();G.WALKS.push(n=>{if(n.dot(cc)<Math.cos(4/R))return null;const d=n.clone().sub(cc);const z=d.dot(tr)*R,x=d.dot(sd)*R;if(Math.abs(x)>W/2+.05||Math.abs(z)>L/2+.1)return null;const t=Math.max(0,Math.min(1,z/L+.5));return g+H*Math.sin(Math.PI*t)+.06;}); /* g: the ground under the bridge, read once when it was built. Asking gAt() here recursed into this very walk (gAt consults WALKS first) and blew the stack: the game froze by the fire */res.bridge=true;}
  /* the clearing: a fire pit and four logs round it, all facing in, the gap towards the path */
  const fireN=F.n.clone();{const k=kit(basisM(fireN,toRoad).setPosition(onG(fireN,-.02)));const fm=basisM(fireN,toRoad).setPosition(onG(fireN,-.02));for(let i=0;i<12;i++){const a=i/12*6.283;const gq=new T.IcosahedronGeometry(.16,0);gq.scale(1.25,.75,1);STAT.add(gq,mul(fm,mRot(Math.cos(a)*.62,.07,Math.sin(a)*.62,rr()*3)),rp([0x8a8a80,0x9a978c,0x77776f,0xa3a196]));}
    for(let i=0;i<4;i++){const a=i/4*3.14+.3;k.cyl(.06,.07,.9,0x5a3e28,0,.14,0,6,Math.PI/2,0,a);}k.cyl(.5,.55,.03,0x3a3430,0,.015,0,12);solids.push({c:fireN.clone().multiplyScalar(R),r:.75});}
  const seats=[];
  const logs=[];for(const a of [Math.PI*.25,Math.PI*.75,Math.PI*1.25,Math.PI*1.75]){const dir=toRoad.clone().applyAxisAngle(F.n,a);const pos=tn(F.n,dir.clone().multiplyScalar(2.25));const tang=new T.Vector3().crossVectors(F.n,dir).normalize();const m=basisM(pos,tang);m.setPosition(onG(pos,0));
    kit(m).cyl(.23,.25,1.9,0x7a5a3e,0,.22,0,9,Math.PI/2).cyl(.2,.2,.02,0xc9a878,0,.22,.955,9,Math.PI/2).cyl(.2,.2,.02,0xc9a878,0,.22,-.955,9,Math.PI/2);solids.push({c:pos.clone().multiplyScalar(R),X:dir.clone(),Z:tang.clone(),hx:.28,hz:.95,top:.45});
    logs.push({pos,dir,tang});for(const off of [-.5,.5]){const sp=tn(pos,tang.clone().multiplyScalar(off).addScaledVector(dir,-.02));seats.push({n:sp,face:dir.clone().negate(),label:'Sit by the fire',drop:.24});}}
  /* who is sitting there: the guitarist on a far log, at its end nearest the line from the path (so he faces whoever arrives), two listening on the outer ends of the near logs; the rest are free */
  const seatAt=(li,a)=>{const q=tn(F.n,toRoad.clone().applyAxisAngle(F.n,a).multiplyScalar(2.25));const s0=li*2;return seats[s0].n.dot(q)>seats[s0+1].n.dot(q)?s0:s0+1;};
  res.seats=seats.length;const who=[['Kofi',seatAt(1,Math.PI),'guitar'],['June',seatAt(0,Math.PI*.5)],['Sam',seatAt(3,Math.PI*1.5)]];const taken=new Set(who.map(w=>w[1]));for(let i=0;i<seats.length;i++)if(!taken.has(i))G.SEATS.push(seats[i]);
  const seatPeople=()=>{if(!THREE.SkeletonUtils||!who.every(([nm])=>G.npcs.find(p=>p.name===nm&&p.model)))return false;for(const [nm,i,role] of who){const st=seats[i];const p=zPerson(nm,st.n,fireN.clone().sub(st.n),{seat:.47});if(p&&role==='guitar'){p.guitar=guitar(p);p.role='guitar';}else if(p)p.role='listen';}return true;};
  {const t0=setInterval(()=>{if(seatPeople())clearInterval(t0);},1500);}
  /* the fire itself: flickering flames and embers, a warm glow on the ground */
  {const g=new T.Group();const mk=(c,o)=>new T.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false,blending:T.AdditiveBlending});const fl=[];
    const ftex=(()=>{const c=canvas(128,256),gg=c.getContext('2d');const blob=(w,h,col,y0)=>{gg.fillStyle=col;gg.beginPath();gg.moveTo(64,y0);gg.bezierCurveTo(64+w*.2,y0+h*.35,64+w,y0+h*.55,64+w*.55,y0+h*.92);gg.quadraticCurveTo(64,y0+h*1.02,64-w*.55,y0+h*.92);gg.bezierCurveTo(64-w,y0+h*.55,64-w*.2,y0+h*.35,64,y0);gg.fill();};
      blob(60,240,'#ff6a1a',10);blob(46,190,'#ffa52a',60);blob(30,130,'#ffd65a',115);blob(16,70,'#fff4c0',172);return texOf(c);})(); /* an anime flame: three tongues, orange to white */
    const fmat=new T.MeshBasicMaterial({map:ftex,transparent:true,depthWrite:false,side:T.DoubleSide,alphaTest:.02});
    for(const [w,h,ry,x,z] of [[.52,.8,0,0,0],[.52,.8,Math.PI/2,0,0],[.36,.58,Math.PI/4,.1,.05],[.32,.52,-Math.PI/4,-.08,-.04]]){const m=new T.Mesh(new T.PlaneGeometry(w,h),fmat);m.geometry.translate(0,h/2,0);m.rotation.y=ry;m.position.set(x,.08,z);m.userData.noInk=true;m.userData.h=h;m.userData.ph=Math.random()*6;g.add(m);fl.push(m);}
    const glow=new T.Mesh(new T.CircleGeometry(1.5,24),new T.MeshBasicMaterial({map:(()=>{const c=canvas(128,128),gg=c.getContext('2d');const gr=gg.createRadialGradient(64,64,4,64,64,64);gr.addColorStop(0,'rgba(255,170,80,.22)');gr.addColorStop(1,'rgba(255,140,60,0)');gg.fillStyle=gr;gg.fillRect(0,0,128,128);return texOf(c);})(),transparent:true,depthWrite:false,blending:T.AdditiveBlending}));glow.rotation.x=-Math.PI/2;glow.position.y=.05;glow.userData.noInk=true;g.add(glow);
    const emb=[];for(let i=0;i<10;i++){const m=new T.Mesh(new T.SphereGeometry(.025,5,4),mk(0xffc060,1));m.userData.noInk=true;m.userData.ph=Math.random()*3;g.add(m);emb.push(m);}
    const [lo,la]=lonLatOf(fireN);placeOn(g,lo,la,0);g.position.copy(fireN.clone().multiplyScalar(gAt(fireN)));g.userData.noCull=true;g.traverse(m=>{if(m.isMesh)hideInNormals.push(m);});ZFX.fire={g,fl,emb,n:fireN,toRoad:toRoad.clone()};}
  /* string lights between the trees round the clearing */
  /* the trees: the forest proper, kept off the roads, the buildings, the path, the stream and the break room */
  const trees=[];const ok=q=>{const dc=Math.acos(Math.min(1,q.dot(F.n)))*R;if(dc<FIRE_R+.1||dc>27)return false;if(roadDist(q,roads)<.9)return false;if(solidHit(q,1.1))return false;if(Math.acos(Math.min(1,q.dot(ROOMN)))*R<11.5)return false;if(polyDist(path,q)<1.7)return false;if(stream.length&&polyDist(stream.map(s=>s.q),q)<1.6)return false;for(const t of trees)if(Math.acos(Math.min(1,q.dot(t)))*R<2.25)return false;return true;};
  for(let i=0;i<400&&trees.length<11;i++){const a=rr()*6.283,r=rb(FIRE_R+.1,FIRE_R+2);const q=tn(F.n,F.dir(Math.cos(a),Math.sin(a)).multiplyScalar(r));if(!ok(q))continue;trees.push(q);paintedTree(q,rb(4.4,6.8),F.dir(rr()-.5,rr()-.5),ch(.55));} /* first a ring at the clearing's edge, for the lights to hang from */
  for(let i=0;i<1600&&trees.length<80;i++){const a=rr()*6.283,r=5+Math.sqrt(rr())*19;const q=tn(F.n,F.dir(Math.cos(a),Math.sin(a)).multiplyScalar(r));if(!ok(q))continue;trees.push(q);paintedTree(q,rb(4.4,6.8),F.dir(rr()-.5,rr()-.5),ch(.55));}
  res.trees=trees.length;
  /* undergrowth: ferns and dark shrubs among the trunks, a few fallen logs and mushrooms of rock */
  let under=0;for(let i=0;i<900&&under<150;i++){const a=rr()*6.283,r=4.4+Math.sqrt(rr())*22;const q=tn(F.n,F.dir(Math.cos(a),Math.sin(a)).multiplyScalar(r));if(roadDist(q,roads)<.6||solidHit(q,.4)||polyDist(path,q)<1.1||(stream.length&&polyDist(stream.map(s=>s.q),q)<1.1)||Math.acos(Math.min(1,q.dot(ROOMN)))*R<11)continue;const k_=rr();(k_<.4?B.fern:k_<.7?B.shrubD:k_<.85?B.weed:B.shrub).add(q,rb(.5,1.1),rb(.45,.9),treeTint(rb(.85,1.02)),0);under++;}
  /* lights: a cable looping from tree to tree round the clearing, with warm bulbs */
  {const near=trees.filter(t=>{const d=Math.acos(Math.min(1,t.dot(F.n)))*R;return d<8.5;}).sort((a,b)=>{const aa=Math.atan2(a.clone().sub(F.n).dot(F.no),a.clone().sub(F.n).dot(F.e)),bb=Math.atan2(b.clone().sub(F.n).dot(F.no),b.clone().sub(F.n).dot(F.e));return aa-bb;});
    const bulbs=[];for(let i=0;i<near.length;i++){const a=near[i],b=near[(i+1)%near.length];if(Math.acos(Math.min(1,a.dot(b)))*R>9)continue;const A=a.clone().multiplyScalar(gAt(a)+3.1),Bp=b.clone().multiplyScalar(gAt(b)+3.1);cable(A,Bp,.55,.012,0x2b2b2b,false);for(let j=1;j<6;j++){const t=j/6;const p=A.clone().lerp(Bp,t);const sag=.55*4*t*(1-t);p.addScaledVector(p.clone().normalize(),-sag-.06);bulbs.push(p);}}
    const bm=new T.InstancedMesh(new T.SphereGeometry(.06,7,5),new T.MeshBasicMaterial({color:0xffe6a0}),Math.max(1,bulbs.length));bulbs.forEach((p,i)=>bm.setMatrixAt(i,new T.Matrix4().setPosition(p)));bm.count=bulbs.length;bm.frustumCulled=false;bm.userData.noInk=true;hideInNormals.push(bm);scene.add(bm);res.bulbs=bulbs.length;}
  /* a sign where the path leaves the road */
  {const sp=pAt(edge-.4,1.5);const m=basisM(sp,toRoad);m.setPosition(onG(sp,-.05));const k=kit(m);k.box(.1,1.6,.1,0x6b4a2e,-.55,.8,0).box(.1,1.6,.1,0x6b4a2e,.55,.8,0);const tex=paintZoneSign(['森のキャンプ','forest camp']);const pl=new T.Mesh(new T.PlaneGeometry(1.3,.65),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));const mm=mul(m,mRot(0,1.45,.06));pl.applyMatrix4(mm);scene.add(pl);solids.push({c:sp.clone().multiplyScalar(R),r:.3});}
  ZFX.forest={n:F.n};return res;}
/* ---------- the beach hangout ---------- */
function beachZone(){sd_=1002;const Z=zFrame(ZONE_B);const res={};res.cleared=zClear(Z.n,4.5);const sea=Z.no.clone().negate(); /* the sea lies south */
  const umb=(x,y,cols)=>{const n=Z.at(x,y);const m=basisM(n,sea);m.setPosition(onG(n,-.25));const k=kit(m);k.cyl(.035,.035,2.75,0xe9e6de,0,1.37,0,6);const N=10;for(let i=0;i<N;i++){STAT.add(new T.CylinderGeometry(.02,1.35,.42,3,1,true,i/N*6.283,6.283/N+.01),mul(m,mRot(0,2.55,0)),cols[i%2]);}solids.push({c:n.clone().multiplyScalar(R),r:.15});};
  umb(-2.6,.6,[0xd9483b,0xf3efe4]);umb(2.4,1.0,[0x2d7fb8,0xf3efe4]);
  const towel=(x,y,ry,a,b)=>{const n=Z.at(x,y);const m=basisM(n,Z.dir(Math.sin(ry),Math.cos(ry)));m.setPosition(onG(n,.01));const k=kit(m);k.box(.9,.015,1.8,a,0,0,0);for(let i=-3;i<=3;i+=2)k.box(.9,.018,.16,b,0,0,i*.22);};
  towel(-2.9,-.6,.15,0xf4c945,0xf3efe4);towel(-1.6,-.9,-.1,0x7fc4c9,0xf3efe4);towel(2.1,-.3,.3,0xe9b8b0,0xd9483b);
  /* deck chairs, facing the sea: somewhere for you to lie back */
  const chair=(x,y,ry)=>{const n=Z.at(x,y);const f=sea.clone().applyAxisAngle(n,ry);const m=basisM(n,f);m.setPosition(onG(n,0));const k=kit(m);const wd=0xc89a62;
    k.rod(V3(-.3,0,-.55),V3(-.3,.78,.32),.025,wd).rod(V3(.3,0,-.55),V3(.3,.78,.32),.025,wd).rod(V3(-.3,0,.35),V3(-.3,.42,-.25),.025,wd).rod(V3(.3,0,.35),V3(.3,.42,-.25),.025,wd).rod(V3(-.3,.78,.32),V3(.3,.78,.32),.025,wd);
    k.box(.56,.02,1.0,0x2d7fb8,0,.36,-.06,0,-1.0);for(let i=0;i<3;i++)k.box(.12,.022,1.0,0xf3efe4,-.2+i*.2,.365,-.06,0,-1.0);solids.push({c:n.clone().multiplyScalar(R),r:.42});
    G.SEATS.push({n:tn(n,f.clone().multiplyScalar(.15)),face:f.clone(),label:'Lie back in the deck chair',drop:.32});};
  chair(.3,1.5,.1);chair(1.15,1.6,-.15);
  /* a cooler, a radio and a beach ball */
  {const n=Z.at(.75,.75);const k=kit(basisM(n,sea).setPosition(onG(n,0)));k.box(.5,.32,.32,0x2d7fb8,0,.16,0).box(.52,.07,.34,0xf3efe4,0,.34,0).box(.3,.04,.06,0xf3efe4,0,.4,0);solids.push({c:n.clone().multiplyScalar(R),r:.3});}
  {const n=Z.at(-.4,1.2);const k=kit(basisM(n,sea).setPosition(onG(n,0)));k.box(.36,.22,.14,0x3a3f42,0,.11,0).cyl(.06,.06,.02,0x9aa0a4,-.09,.12,.075,10,Math.PI/2).cyl(.06,.06,.02,0x9aa0a4,.09,.12,.075,10,Math.PI/2).rod(V3(.14,.22,0),V3(.22,.5,0),.008,0x9aa0a4);ZFX.radio={n};}
  {const n=Z.at(1.2,-1.5);const g=new T.Group();const cols=[0xd9483b,0xf3efe4,0x2d7fb8,0xf4c945];for(let i=0;i<4;i++){const m=new T.Mesh(new T.SphereGeometry(.22,12,8,i*Math.PI/2,Math.PI/2),new T.MeshBasicMaterial({color:cols[i]}));g.add(m);}const [lo,la]=lonLatOf(n);placeOn(g,lo,la,0);g.position.copy(n.clone().multiplyScalar(gAt(n)+.21));}
  /* driftwood to sit on and two residents enjoying it */
  const log=(x,y,ry)=>{const n=Z.at(x,y);const f=Z.dir(Math.sin(ry),Math.cos(ry));const m=basisM(n,f);m.setPosition(onG(n,-.05));kit(m).cyl(.2,.23,2.2,0xb8a68a,0,.18,0,8,Math.PI/2);solids.push({c:n.clone().multiplyScalar(R),X:new T.Vector3().crossVectors(n,f).normalize(),Z:f.clone(),hx:.25,hz:1.1,top:.4});return {n,f};};
  const lg=log(-.9,2.6,Math.PI/2+.1);G.SEATS.push({n:tn(lg.n,Z.dir(.55,-.05)),face:sea.clone(),label:'Sit on the driftwood',drop:.3});
  const place=()=>{if(!THREE.SkeletonUtils||!['Mina','Elin'].every(nm=>G.npcs.find(p=>p.name===nm&&p.model)))return false;
    zPerson('Mina',Z.at(-1.5,2.55),sea.clone(),{seat:.4});const t=Z.at(-1.6,-.9);zPerson('Elin',t,Z.dir(.1,1),{pose:'lie',seat:.08});return true;};
  {const t0=setInterval(()=>{if(place())clearInterval(t0);},1500);}
  res.ok=true;ZFX.beach={n:Z.n};return res;}
/* ---------- the zones' life: the fire flickers, the guitarist strums, the music fades in as you come near ---------- */
const ZFX={};let zAudio=null;
function zonesFrame(dt,t){const f=ZFX.fire;if(f){for(const m of f.fl){const ph=m.userData.ph;const k=1+.16*Math.sin(t*9+ph)+.1*Math.sin(t*15.3+ph*2);m.scale.set(1+.1*Math.sin(t*11+ph),k,1);}
    for(const e of f.emb){const ph=(t*.6+e.userData.ph)%1.6;e.position.set(Math.sin(e.userData.ph*7+t)*.25*ph,.3+ph*1.6,Math.cos(e.userData.ph*5+t*.7)*.25*ph);e.material.opacity=Math.max(0,1-ph/1.6);}}
  for(const p of ZPEOPLE){if(p.role==='guitar'){if(p.gtr){try{gtrPlay(p,t);}catch(e){p.gtr=null;console.warn('guitarist',e);}}else{const b=p.bones.R_Forearm;if(b){b.quaternion.copy(p.rest.R_Forearm).multiply(_zq.setFromAxisAngle(_zx,.22*Math.sin(t*6.2)));}const h=p.bones.Head;if(h)h.quaternion.copy(p.rest.Head).multiply(_zq.setFromAxisAngle(_zx,.08+.05*Math.sin(t*2.1)));}}
    else if(p.role==='listen'){const h=p.bones.Head;if(h)h.quaternion.copy(p.rest.Head).multiply(_zq.setFromAxisAngle(_zy,.12*Math.sin(t*.4+p.name.length)));}}
  zSound(t);}
const _zq=new T.Quaternion(),_zx=V3(1,0,0),_zy=V3(0,1,0);
/* a fingerpicked guitar by the fire, and a little ukulele tune on the beach radio: plucked strings made on the spot (Karplus-Strong) */
const zPluckCache=new Map();function zPluck(ctx,freq,bright){const key=freq.toFixed(1)+'|'+bright;if(zPluckCache.has(key))return zPluckCache.get(key);const sr=ctx.sampleRate,len=Math.floor(sr*2.2),buf=ctx.createBuffer(1,len,sr),d=buf.getChannelData(0);const N=Math.max(2,Math.round(sr/freq));const ring=new Float32Array(N);for(let i=0;i<N;i++)ring[i]=Math.random()*2-1;let idx=0,prev=0;const damp=bright?.996:.994;
  for(let i=0;i<len;i++){const v=ring[idx];const nv=damp*.5*(v+ring[(idx+1)%N]);ring[idx]=nv;d[i]=v*(i<40?i/40:1);idx=(idx+1)%N;}zPluckCache.set(key,buf);return buf;}
const NOTE=s=>{const m={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[s[0]];const sh=s[1]==='#'?1:0;const oct=+s[s.length-1];return 261.63*Math.pow(2,(m+sh+(oct-4)*12)/12);};
/* Kofi's fire song: a fingerpicked cover of Josh's track "1004" (analysed from the record: 90 bpm, C with open fifths, a C5|Fsus2 groove,
   a Cm/Eb bridge, the lead sitting on C and lifting to D / Eb). form = one token per half bar, chord[:melody] (s = sharp); pat = which string
   on each 16th (0 bass, -1 rest) in the record's 3+3+2 feel; gap = beats of quiet before it loops. Checked offline against the record: 81/86 half-bar chords agree. */
const SONG_FIRE={bpm:90,div:4,gap:4,ch:{C:['C3','G3','C4','G4'],F:['F2','C4','F4','G4'],Cm:['C3','G3','D#4','G4'],Cm7:['C3','A#3','D#4','G4'],Eb:['D#3','A#3','D#4','G4'],Bb:['A#2','F3','A#3','D4'],Fs4:['F2','C4','F4','A#4']},pat:[0,-1,-1,2,-1,-1,1,-1,0,-1,-1,3,2,-1,1,-1],
  form:/* groove, bars 1-30 */'C:C5 C:D5 F:C5 F:D5 C:C5 C F:C5 F:D5 C:C5 C F:C5 F:D5 C:C5 C F:G5 F:D5 C:C5 Cm F:C5 F:D5 C:C5 C F:C5 F:D5 C:C5 C F:C5 F:D5 C:C5 C F:C5 F C:C5 C F:C5 F:D5 C:C5 C F:C5 F C:C5 Cm7:Ds5 F:G5 F:C5 C:C5 C F:C5 F:D5 C:C5 C F:C5 F C:C5 C F:C5 F C:C5 C F:C5 F:D5'
    +/* bridge, bars 31-40 */' C:C5 Eb:Ds5 Eb:Ds5 C:C5 C:C5 Cm Eb:Ds5 Cm:Ds5 C:C5 C C:C5 Cm7:Ds5 Eb:Ds5 Cm:Ds5 C:C5 C Cm:Ds5 Eb:As5 Bb:As5 C:C5'+/* ending, bars 41-43 */' C:C5 Fs4:As5 F:C5 C Cm:Ds5 Eb:Ds5'};
(s=>{const ch={};for(const k in s.ch)ch[k]=s.ch[k].map(NOTE);s.hc=[];s.hm=[];for(const t of s.form.split(' ')){const [c,m]=t.split(':');s.hc.push(ch[c]);s.hm.push(m?NOTE(m.replace('s','#')):0);}s.len=s.hc.length*s.pat.length/2+s.gap*s.div;})(SONG_FIRE);
function zPick(ctx,f,br,g0,when,out){const src=ctx.createBufferSource();src.buffer=zPluck(ctx,f,br);const g=ctx.createGain();g.gain.value=g0*(.85+Math.random()*.3);src.connect(g);g.connect(out);src.start(when+Math.random()*.012);}
function zFireStep(ctx,s,st,when,out){const hl=s.pat.length>>1,n=st%s.len;if(n>=s.hc.length*hl)return;const h=(n/hl)|0,pos=n%s.pat.length,i=s.pat[pos],c=s.hc[h];
  if(i>=0)zPick(ctx,c[i],false,i===0?(pos===0?.9:.7):.5,when,out);if(n%hl===0&&s.hm[h])zPick(ctx,s.hm[h],true,.7,when,out);}
const SONG_BEACH={bpm:104,bars:[['G3','B4','D5','G5'],['E3','B4','E5','G5'],['C4','E5','G5','C5'],['D4','F#4','A4','D5']],pat:[0,2,1,3,2,1,3,2]};
/* Josh's own recording of "1004" plays from the fire. An <audio> element streams it through the planet's audio graph (no 40 MB decode);
   it only loads once someone comes near the fire, pauses when nobody is (or the music is off, or the town stops drawing), and picks up
   where it left off. The guitar cover above plays while it loads, or if it can't play. */
const FIRE_REC={url:'assets/fire-1004.mp3?v=1',el:null,g:null,ok:false,bad:false,far:0,last:0};
function zRecord(ctx,v){const F=FIRE_REC;F.last=performance.now();if(F.bad)return false;
  if(!F.el){if(v<=.001)return false;
    try{const el=new Audio();el.src=F.url;el.loop=true;el.preload='auto';const src=ctx.createMediaElementSource(el);F.g=ctx.createGain();F.g.gain.value=0;src.connect(F.g);F.g.connect(ctx.destination);
      el.addEventListener('playing',()=>{F.ok=true;});el.addEventListener('error',()=>{F.bad=true;F.ok=false;});F.el=el;
      setInterval(()=>{if(!F.el.paused&&performance.now()-F.last>1500)F.el.pause();},1000);}catch(_){F.bad=true;return false;}} /* zSound stopped (a room is open, or the music is off) */
  const el=F.el;F.g.gain.setTargetAtTime(v*.55,ctx.currentTime,.3);
  if(v>.001){F.far=0;if(el.paused)el.play().catch(()=>{});}else if(!el.paused&&++F.far>180)el.pause();
  return F.ok&&!el.paused;}
function zSound(t){const ctx=G.audio&&G.audio();const me=G.player&&G.player();if(!me){return;}
  const dist=n=>n?me.distanceTo(n.clone().multiplyScalar(gAt(n))):1e9;const vf=Math.pow(Math.max(0,Math.min(1,1-(dist(ZFX.fire&&ZFX.fire.n)-3)/16)),1.4),vb=Math.pow(Math.max(0,Math.min(1,1-(dist(ZFX.radio&&ZFX.radio.n)-2)/14)),1.4);
  window.__duck=Math.max(vf*.9,vb*.8);if(!ctx){return;}
  if(!zAudio){zAudio={next:{fire:0,beach:0},step:{fire:0,beach:0},gain:{fire:ctx.createGain(),beach:ctx.createGain()}};for(const k in zAudio.gain){zAudio.gain[k].gain.value=0;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=k==='fire'?2600:3400;zAudio.gain[k].connect(lp);lp.connect(ctx.destination);}}
  const rec=zRecord(ctx,vf),vg=rec?0:vf; /* the record playing: Kofi's plucked cover rests */
  zAudio.gain.fire.gain.setTargetAtTime(vg*.5,ctx.currentTime,.3);zAudio.gain.beach.gain.setTargetAtTime(vb*.32,ctx.currentTime,.3);
  for(const [k,song,v] of [['fire',SONG_FIRE,vg],['beach',SONG_BEACH,vb]]){if(v<=.001){zAudio.next[k]=0;continue;}const spb=60/song.bpm/(song.div||2);if(!zAudio.next[k]||zAudio.next[k]<ctx.currentTime)zAudio.next[k]=ctx.currentTime+.05;
    while(zAudio.next[k]<ctx.currentTime+.3){const st=zAudio.step[k]++;if(song.hc){zFireStep(ctx,song,st,zAudio.next[k],zAudio.gain[k]);zAudio.next[k]+=spb;continue;}const bar=song.bars[Math.floor(st/8)%song.bars.length];const which=song.pat[st%8];const notes=[bar[which]];if(st%8===0)notes.push(bar[0]);
      for(const nm of notes){const src=ctx.createBufferSource();src.buffer=zPluck(ctx,NOTE(nm),k==='beach');const g=ctx.createGain();g.gain.value=(nm===bar[0]&&st%8===0?.9:.55)*(.85+Math.random()*.3);src.connect(g);g.connect(zAudio.gain[k]);src.start(zAudio.next[k]+(Math.random()*.012));}
      zAudio.next[k]+=spb*(st%2?.92:1.08);}}} /* a little swing */

/* ---------- the model trees (thin relief meshes that look flat side-on) become painted trees, same place, same height ---------- */
function fireClear(){if(!ZFX.forest)return 0;const keep=new Set((window.BLDGS||[]).map(b=>b.inst));const gone=[];
  for(const o of [...scene.children]){if(!o.isGroup||keep.has(o)||o.userData.noCull||o.userData.zone||o.userData.s2||(o.name||'').startsWith('dress'))continue;const p=o.position;if(p.lengthSq()<1)continue;
    const d=Math.acos(Math.min(1,p.clone().normalize().dot(ZFX.forest.n)))*R;if(!(o.userData.tree?d<FIRE_R:d<3.4))continue;scene.remove(o);if(o.userData.tree)o.userData.tree.done=true;const ci=G.colliders.indexOf(o);if(ci>=0)G.colliders.splice(ci,1);gone.push(p.clone());}
  for(let i=solids.length-1;i>=0;i--){const so=solids[i];if(so.r!==undefined&&so.r<=1&&gone.some(q=>q.distanceTo(so.c)<.7))solids.splice(i,1);}
  if(gone.length)G.dirty();return gone.length;} /* the planet's own props load late, after the clearing was cleared: model trees round the campfire, and anything inside the ring of logs, go (with their solids) */
function treeSwap(){fireClear();const keep=sd_;sd_=9090+(window.DRESS.treesSwapped||0);let k=0;const list=[];for(const o of scene.children)if(o.isGroup&&o.userData.tree&&!o.userData.tree.done)list.push(o);
  list.sort((a,b)=>a.position.x-b.position.x||a.position.z-b.position.z); /* a fixed order, so the same crowns come out every visit */
  for(const o of list){o.userData.tree.done=true;o.visible=false;const ci=G.colliders.indexOf(o);if(ci>=0)G.colliders.splice(ci,1);const n=o.position.clone().normalize();const H=Math.max(3.2,Math.min(6.4,o.userData.tree.H*.95));paintedTree(n,H,V3(rr()-.5,0,rr()-.5).addScaledVector(n,-1).cross(n),ch(.5),true);k++;}
  window.DRESS.treesSwapped=(window.DRESS.treesSwapped||0)+k;sd_=keep;if(k)G.dirty();return k;}

/* ---------- the arcade's cabinets: Josh's four models (Tripo, slimmed to 9k triangles and a 1024 texture) stand in for the procedural ones ----------
   planet.html seats 8 cabinets in window.__arcade.cabs (a group each, in true metres: y 0 the floor, +z its front), with a solid (ARC.solids[5+k])
   and a door (ARC.doors[k]) at the same index. Their meshes are hidden and a model stands in each group; ARC.models tells breeze-room.js to leave
   them alone. The models get the props' cartoon material (borrowed from a loaded prop, so it follows __setCartoon) and the props' ink (silhouette only). */
const CAB_FILES={vine:'assets/cab_vine.glb',breeze:'assets/cab_breeze.glb',kart:'assets/cab_kart.glb',rootlight:'assets/cab_rootlight.glb',beat:'assets/cab_beat.glb'},CAB_H=2.1,CAB_BACK=.42; /* the procedural cabinet's height; its back this far behind the group's centre (the wall is ~.5 m behind it) */
const CAB_AT=['vine','vine','breeze','breeze','vine','rootlight','kart','beat']; /* 7 Oct pm: Josh's Beet Beat cabinet replaces the Orbit stand-in (by the entrance, right) */ /* 7 Oct: Josh's Rootlight cabinet takes the right-wall Berry Breeze slot */ /* 6 Oct: Tyrian retired (Josh); his Vine Line cabinet stands where the OpenTyrian ones were, and his Sprout Kart cabinet where the Wave Run was */ /* ARC.cabs order: the back wall left to right (facing it), then left and right walls at the back, then left and right by the entrance */
const CAB_ACT={vine:{kind:'vine',title:'Vine Line',label:'Play Vine Line'},breeze:{kind:'breeze',title:'Berry Breeze',label:'Play Berry Breeze'},kart:{kind:'kart',title:'Sprout Kart',label:'Play Sprout Kart'},rootlight:{kind:'rootlight',title:'Rootlight',label:'Play Rootlight'},orbit:{kind:'beat',title:'Beet Beat',label:'Play Beet Beat'},beat:{kind:'beat',title:'Beet Beat',label:'Play Beet Beat'}}; /* the Orbit (by the entrance, right) plays Beet Beat (beat-room.js) until Josh makes its own cabinet */ /* Josh's Vine Line cabinets play Vine Line (vine-room.js), the Berry Breeze ones Berry Breeze, his Sprout Kart one (by the entrance, left) Sprout Kart (kart-room.js); the Orbit is a show-piece, no door */
const CAB_ROOM={kart:'kartRoom',beat:'beatRoom',rootlight:'rootlightRoom'}; /* games whose room script may come after this file (or not be on the page at all): until window[name] is there their cabinets stay show-pieces, no door and no painted art */
const cabLive=act=>!!act&&(!CAB_ROOM[act.kind]||typeof window[CAB_ROOM[act.kind]]==='function');
const CABS={tpl:{},t0:0,tries:0,loading:false};
function cabSrcMat(){const lib=window.__propLib||{};for(const k in lib){let f=null;lib[k].traverse(m=>{if(!f&&m.isMesh&&m.material&&m.material.userData.cartoon&&m.material.onBeforeCompile&&m.material.map)f=m.material;});if(f)return f;}return null;}
function cabMat(map,src){map.encoding=T.LinearEncoding;map.anisotropy=8;map.minFilter=T.LinearMipmapLinearFilter;map.needsUpdate=true; /* the texture's colours are the drawing, as the game's asDrawn */
  const m=new T.MeshBasicMaterial({map});if(!src)return m;m.userData.cartoon=true;
  m.onBeforeCompile=(sh,r)=>{const keep=src.userData.sh,kp=src.userData.pure;src.onBeforeCompile(sh,r);src.userData.sh=keep;if(keep===undefined)delete src.userData.sh;if(kp===undefined)delete src.userData.pure; /* the game's own shader code, on our uniforms */
    const C=window.__cartoon||{},im=map.image||{};m.userData.sh=sh;Object.assign(sh.uniforms,{uTexel:{value:new T.Vector2(1/(im.width||1024),1/(im.height||1024))},uPoster:{value:C.poster??.3},uSat:{value:C.sat??1.08},uSunK:{value:.85}});};
  return m;}
/* the cabinets that play Vine Line: a VINE LINE marquee and a screen picture, painted in code (once per size, shared) and laid on each model
   (unlit, a few mm proud of its surfaces), fitted by raycasting the templates, in their metres: [x0,x1,y0,y1,a,b,off] is a plane z=a+b*y over that
   rectangle, off in front. mh: the marquee's canvas height (1024 wide; the 192 px banner letterboxed in cream so its letters keep their shape);
   sh, sr: the screen's height (512 wide) and garden rows. OpenTyrian: the marquee board is flat (z .428) but its old lettering and planet stand
   up to 4 cm proud inside a red frame (.459), so the plane sits 2.6 cm out, just behind the frame, and mb pulls its depth 2 cm toward the eye
   (along the view ray: the same pixels) so the relief can't poke through; the screen glass is 5 cm deep in its bezel, z=.5411-.2123y. */
const VINE_FIT={orbit:{mq:[-.675,.675,1.752,2.005,.4771,-.021,.004],mh:192,sc:[-.546,.546,1.093,1.62,.5396,-.2208,.004],sh:246,sr:12},
  tyrian:{mq:[-.497,.507,1.8,2.071,.428,0,.026],mh:276,mb:.02,sc:[-.365,.375,1.17,1.672,.5411,-.2123,.004],sh:355,sr:17}},VINE_ART={};
/* shared by the painted cabinets: a canvas painted once per name and size (cache: the game's own), and one overlay laid on a template
   (R: [x0,x1,y0,y1,a,b,off] as above; bias: nearer in depth by that many metres, on the same pixels; dome [cu,cv]: the plane bent by
   cu*u²+cv*v², u and v -1..1 across it, onto a curved glass) */
function cabTex(cache,nm,w,h,f){const k=nm+w+'x'+h;if(cache[k])return cache[k];const c=document.createElement('canvas');c.width=w;c.height=h;f(c.getContext('2d'),w,h);const x=new T.CanvasTexture(c);x.anisotropy=8;return cache[k]=x;}
function cabPut(t,nm,map,[x0,x1,y0,y1,a,b,off],bias,dome){const yc=(y0+y1)/2,mat=new T.MeshBasicMaterial({map,transparent:true,depthWrite:false});let geo;
  if(dome){geo=new T.PlaneGeometry(x1-x0,y1-y0,24,16);const p=geo.attributes.position;for(let i=0;i<p.count;i++){const px=p.getX(i),py=p.getY(i),u=px*2/(x1-x0),v=py*2/(y1-y0),y=yc+py;p.setXYZ(i,(x0+x1)/2+px,y,a+b*y+off+dome[0]*u*u+dome[1]*v*v);}geo.computeBoundingSphere();} /* in place, in the template's metres */
  else geo=new T.PlaneGeometry(x1-x0,(y1-y0)*Math.hypot(1,b));
  const m=new T.Mesh(geo,mat);
  if(bias){mat.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nmvPosition.xyz*=1.-'+bias.toFixed(3)+'/max(length(mvPosition.xyz),.1);gl_Position=projectionMatrix*mvPosition;');};mat.customProgramCacheKey=()=>'cab-bias'+bias;} /* nearer in depth by bias metres, on the same pixels */
  if(!dome){m.position.set((x0+x1)/2,yc,a+b*yc+off);m.rotation.x=Math.atan(b);}
  m.userData.noInk=true;m.renderOrder=1;m.name=nm;t.add(m);return m;}
function cabVine(t,kind){const F=VINE_FIT[kind];if(!F)return null;
  const cv=(nm,w,h,f)=>cabTex(VINE_ART,nm,w,h,f);
  let sd=97;const rnd=()=>((sd=sd*16807%2147483647)-1)/2147483646,ell=(g,x,y,rx,ry,r,fill,st,lw)=>{g.beginPath();g.ellipse(x,y,rx,ry,r||0,0,Math.PI*2);if(fill){g.fillStyle=fill;g.fill();}if(st){g.strokeStyle=st;g.lineWidth=lw||2;g.stroke();}};
  const CREAM='#e4c992',NAVY='#375268',ORANGE='#e0663e',TEAL='#76a084',GOLD='#e9a63b',INK='#2b2140',FONT='"Arial Rounded MT Bold","Hiragino Maru Gothic ProN","Nunito","Varela Round",sans-serif';
  const leaf=(g,x,y,l,w,r,fill,st)=>{g.save();g.translate(x,y);g.rotate(r);g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(l*.5,-w,l,0);g.quadraticCurveTo(l*.5,w,0,0);g.fillStyle=fill;g.fill();if(st){g.strokeStyle=st;g.lineWidth=1.5;g.stroke();}g.restore();};
  const star=(g,x,y,r)=>{g.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,q=i&1?r*.32:r;g.lineTo(x+Math.cos(a)*q,y+Math.sin(a)*q);}g.closePath();g.fillStyle=GOLD;g.fill();};
  const berry=(g,x,y,r,c,c2)=>{ell(g,x,y,r,r,0,c,c2,2);ell(g,x-r*.35,y-r*.35,r*.3,r*.2,-.6,'rgba(255,255,255,.75)');};
  const mq=cv('mq',1024,F.mh,(g,w,h)=>{sd=97;g.fillStyle=CREAM;g.fillRect(0,0,w,h);
    for(let i=0;i<70;i++){g.fillStyle=rnd()<.5?'rgba(244,222,170,.35)':'rgba(205,170,110,.18)';ell(g,rnd()*w,rnd()*h,8+rnd()*40,5+rnd()*16,rnd()*3);g.fill();} /* the cabinet's worn paint */
    for(let i=0;i<26;i++){g.fillStyle='rgba(150,110,60,.16)';ell(g,rnd()*w,rnd()<.5?rnd()*10:h-rnd()*10,3+rnd()*10,2+rnd()*4,0);g.fill();}
    g.translate(0,(h-192)/2); /* the banner is drawn 192 px tall, centred on a taller board */
    g.fillStyle=TEAL;for(const s of [1,-1])for(const [y0,y1] of [[64,104],[118,156]]){const x0=s>0?0:w,x1=s>0?178:w-178,tip=s*(y0<100?22:-10);g.beginPath();g.moveTo(x0,y0);g.lineTo(x1+tip,y0);g.lineTo(x1-tip*.2,y1);g.lineTo(x0,y1);g.closePath();g.fill();} /* the Orbit's teal speed stripes */
    g.strokeStyle='#5d9a5e';g.lineWidth=4;g.lineCap='round';g.beginPath();g.moveTo(206,170);for(let x=206;x<=818;x+=4)g.lineTo(x,168+Math.sin((x-206)/612*Math.PI*4)*7);g.stroke(); /* a little vine under the letters */
    for(let k=0;k<12;k++){const x=230+k*50,y=168+Math.sin((x-206)/612*Math.PI*4)*7,u=k&1?1:-1;leaf(g,x,y,20,6.5,u*(.75+rnd()*.3),'#6fb36a','#3f7a45');}
    berry(g,202,166,10,ORANGE,'#9c3d22');berry(g,822,166,10,'#3f6fb8','#253f70');berry(g,836,154,7,ORANGE,'#9c3d22');
    star(g,200,40,13);star(g,826,36,10);star(g,184,128,8);star(g,846,118,13);
    g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.font='900 104px '+FONT;
    const word='VINE LINE',cw=[...word].map(ch=>ch===' '?34:g.measureText(ch).width+4),tw=cw.reduce((a,b)=>a+b,0);let x=w/2-tw/2;
    const pos=[...word].map((ch,i)=>{const p=[ch,x+cw[i]/2,96+(i%2?-3:3),(i%3-1)*.06];x+=cw[i];return p;});
    for(const [ch,px,py,r] of pos){if(ch===' ')continue;g.save();g.translate(px,py);g.rotate(r);g.lineWidth=15;g.strokeStyle=ORANGE;g.strokeText(ch,0,0);g.restore();}
    for(const [ch,px,py,r] of pos){if(ch===' ')continue;g.save();g.translate(px,py);g.rotate(r);g.fillStyle=NAVY;g.fillText(ch,0,0);g.fillStyle='rgba(255,255,255,.18)';g.fillText(ch,-2,-3);g.fillStyle=NAVY;g.fillText(ch,0,1);g.restore();}
    g.setTransform(1,0,0,1,0,0);const fade=(x0,y0,x1,y1)=>{const gr=g.createLinearGradient(x0,y0,x1,y1);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');return gr;};
    g.globalCompositeOperation='destination-out';for(const [a,b,c,d,rx,ry,rw,rh] of [[0,0,0,5,0,0,w,5],[0,h,0,h-5,0,h-5,w,5],[0,0,4,0,0,0,4,h],[w,0,w-4,0,w-4,0,4,h]]){g.fillStyle=fade(a,b,c,d);g.fillRect(rx,ry,rw,rh);}}); /* soft edges: painted on, not stuck on */
  const sc=cv('sc',512,F.sh,(g,w,h)=>{const C=24,R=F.sr,dy=(R-12)>>1,cw=w/C,ch=h/R,cx=i=>(i+.5)*cw,cy=j=>(j+.5)*ch,rr=10;
    g.beginPath();g.moveTo(rr,0);g.arcTo(w,0,w,h,rr);g.arcTo(w,h,0,h,rr);g.arcTo(0,h,0,0,rr);g.arcTo(0,0,w,0,rr);g.closePath();g.clip();
    g.fillStyle='#16241b';g.fillRect(0,0,w,h);g.fillStyle='#1b2c21';for(let j=0;j<R;j++)for(let i=0;i<C;i++)if((i+j)&1)g.fillRect(i*cw,j*ch,cw,ch); /* the garden plot, dark */
    g.fillStyle='#2f6b3a';for(let i=0;i<C;i++)for(const j of [0,R-1]){ell(g,cx(i),cy(j),cw*.62,ch*.6,0,'#2f6b3a');ell(g,cx(i)-3,cy(j)-3,cw*.25,ch*.2,0,'#4c8c4f');}
    for(let j=1;j<R-1;j++)for(const i of [0,C-1]){ell(g,cx(i),cy(j),cw*.6,ch*.62,0,'#2f6b3a');ell(g,cx(i)-3,cy(j)-3,cw*.25,ch*.2,0,'#4c8c4f');} /* the low hedge */
    const vine=(cells,stem,dark,lf,head)=>{cells=cells.map(([i,j])=>[i,j+dy]);g.lineCap=g.lineJoin='round';g.strokeStyle=dark;g.lineWidth=ch*.5;g.beginPath();cells.forEach(([i,j],k)=>k?g.lineTo(cx(i),cy(j)):g.moveTo(cx(i),cy(j)));g.stroke();g.strokeStyle=stem;g.lineWidth=ch*.3;g.stroke();
      for(let k=0;k<cells.length-1;k++){const [i,j]=cells[k];ell(g,cx(i),cy(j),ch*.4,ch*.4,0,stem,dark,2);ell(g,cx(i)-2,cy(j)-2.5,ch*.15,ch*.1,-.5,'rgba(255,255,255,.35)');} /* round segments */
      cells.forEach(([i,j],k)=>{if(k&&k<cells.length-1&&k%2===1){const [pi,pj]=cells[k-1],a=Math.atan2(j-pj,i-pi)+(k%4===1?1:-1)*2.2;leaf(g,(cx(i)+cx(pi))/2,(cy(j)+cy(pj))/2,ch*.8,ch*.3,a,lf,dark);}});
      const [hi,hj]=cells[cells.length-1],[qi,qj]=cells[cells.length-2],a=Math.atan2(hj-qj,hi-qi),x=cx(hi),y=cy(hj);head(x,y,a);
      for(const s of [-1,1]){const ex=x+Math.cos(a)*2.5+Math.cos(a+Math.PI/2)*s*4.5,ey=y+Math.sin(a)*2.5+Math.sin(a+Math.PI/2)*s*4.5;ell(g,ex,ey,3.2,3.2,0,'#fff',INK,1);ell(g,ex+Math.cos(a)*.9,ey+Math.sin(a)*.9,1.7,1.7,0,INK);}};
    vine([[3,8],[4,8],[5,8],[6,8],[7,8],[7,7],[7,6],[7,5],[8,5],[9,5],[10,5],[11,5]],'#6cc04a','#2d6a2f','#a8ec8c',(x,y,a)=>{leaf(g,x-Math.cos(a)*4,y-Math.sin(a)*4,ch*.7,ch*.26,a-2.3,'#4cc46a','#2d6a2f');leaf(g,x-Math.cos(a)*4,y-Math.sin(a)*4,ch*.7,ch*.26,a+2.3,'#4cc46a','#2d6a2f');ell(g,x,y,ch*.6,ch*.6,0,'#7ad457','#2d6a2f',2);}); /* Sprig */
    vine([[21,2],[20,2],[19,2],[18,2],[17,2],[16,2],[16,3],[16,4],[16,5],[16,6],[16,7]],'#f0a040','#9c4d1c','#ffd27a',(x,y)=>{for(let k=0;k<12;k++){const b=k*Math.PI/6;ell(g,x+Math.cos(b)*ch*.55,y+Math.sin(b)*ch*.55,ch*.3,ch*.19,b,'#ff8a1e','#9c4d1c',1);}ell(g,x,y,ch*.5,ch*.5,0,'#ffcf3b','#9c4d1c',1.2);}); /* Marigold */
    g.save();g.translate(cx(14),cy(5+dy));g.scale(1.45,1.45);g.translate(-cx(14),-cy(5+dy));
    const bx=cx(14),by=cy(5+dy);g.beginPath();g.moveTo(bx,by+ch*.45);g.bezierCurveTo(bx-ch*.6,by+ch*.05,bx-ch*.45,by-ch*.45,bx,by-ch*.32);g.bezierCurveTo(bx+ch*.45,by-ch*.45,bx+ch*.6,by+ch*.05,bx,by+ch*.45);g.fillStyle='#ff4f5e';g.fill();g.strokeStyle=INK;g.lineWidth=1.5;g.stroke();
    leaf(g,bx-5,by-ch*.36,9,3,-.3,'#4cc46a');ell(g,bx-3,by-2,2.2,1.4,-.6,'rgba(255,255,255,.8)'); g.restore(); /* a strawberry ahead of Sprig */
    berry(g,cx(16),cy(10+dy),ch*.48,'#3f7bff',INK); /* a blueberry ahead of Marigold */
    g.fillStyle='rgba(255,246,224,.7)';g.font='700 13px ui-monospace,Menlo,monospace';g.textBaseline='middle';g.textAlign='left';g.fillText('12',cx(1)-4,cy(0)+1);g.textAlign='right';g.fillText('9',cx(C-2)+4,cy(0)+1);
    const gl=g.createLinearGradient(0,0,w*.6,h);gl.addColorStop(0,'rgba(255,255,255,.13)');gl.addColorStop(.45,'rgba(255,255,255,.03)');gl.addColorStop(.46,'rgba(255,255,255,0)');g.fillStyle=gl;g.fillRect(0,0,w,h); /* the glass */
    const vg=g.createRadialGradient(w/2,h/2,h*.4,w/2,h/2,w*.62);vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,.4)');g.fillStyle=vg;g.fillRect(0,0,w,h);});
  return [cabPut(t,'vine-marquee',mq,F.mq,F.mb),cabPut(t,'vine-screen',sc,F.sc)];}
/* each painted cabinet by the game it plays; art.fit says which models it has been measured on */
const CAB_ART={vine:{fit:VINE_FIT,paint:cabVine}}; /* (Josh's own cabinets carry their art; a stand-in model gets painted art until he makes one) */
/* a cabinet's painted art: on its template before it is cloned or, when its game's room script came late, on the template and on every model
   of it already standing (each a copy sharing the planes and canvases). Once per template; only while the game is here (cabLive) */
function cabArt(kind){const t=CABS.tpl[kind],act=CAB_ACT[kind],art=act&&CAB_ART[act.kind];if(!t||!art||!art.fit[kind]||t.userData.art||!cabLive(act))return 0;
  t.userData.art=true;let ms=null;try{ms=art.paint(t,kind);}catch(e){console.warn(act.kind+' cabinet art',kind,e);}if(!ms)return 0;
  const A=window.__arcade;if(A&&Array.isArray(A.cabs))A.cabs.forEach((cb,k)=>{const m=CAB_AT[k]===kind&&cb&&cb.g&&cb.g.userData.cabModel;if(m)for(const p of ms)m.add(p.clone());});
  G.dirty();return ms.length;}
function cabLoad(){const src=cabSrcMat();if(CABS.loading||!T.GLTFLoader||!src)return;CABS.loading=true;const ld=new T.GLTFLoader();
  for(const kind in CAB_FILES)ld.load(CAB_FILES[kind],g=>{const root=g.scene;root.updateMatrixWorld(true);const bb=new T.Box3().setFromObject(root),s=CAB_H/(bb.max.y-bb.min.y);
    root.scale.setScalar(s);root.position.set(-(bb.min.x+bb.max.x)/2*s,-bb.min.y*s,-CAB_BACK-bb.min.z*s);
    root.traverse(m=>{if(m.isMesh){m.material=m.material.map?cabMat(m.material.map,src):m.material;m.userData.noInk=true;}}); /* lines from its silhouette, like every model prop */
    const t=new T.Group();t.add(root);const hz=(bb.max.z-bb.min.z)/2*s;Object.assign(t.userData,{hx:(bb.max.x-bb.min.x)/2*s,hz,zc:hz-CAB_BACK});
    CABS.tpl[kind]=t;cabArt(kind);cabFit();},undefined,e=>console.warn('arcade cabinet not loaded',kind,e));} /* painted overlays (CAB_ART) only for a stand-in cabinet: Sprout Kart on the Wave Run; Vine Line on none now (Josh's own cabinet carries its art); before the clones: they share its planes */
function cabFit(){const A=window.__arcade;if(!A||!Array.isArray(A.cabs))return 0;let n=0;
  A.cabs.forEach((cb,k)=>{const t=CABS.tpl[CAB_AT[k]];if(!cb||!cb.g||!t||cb.g.userData.cabModel)return;const old=new T.Group();old.visible=false;old.name='procedural';for(const c of [...cb.g.children])old.add(c);cb.g.add(old); /* the procedural cabinet's meshes, under a hidden group (the horizon cull sets small meshes' own .visible back on); their shared screen and marquee materials untouched */
    const m=t.clone();m.userData.cabModel=CAB_AT[k];cb.g.add(m);cb.g.userData.cabModel=m;n++;});
  if(n){cabSolids();G.dirty();}return n;}
/* the solids: the models are bigger than the procedural cabinets (seatArcade sets 0.84 x 0.8 at 0, 4 and 12 s: set again after each) */
function cabSolids(){const A=window.__arcade;if(!A||!Array.isArray(A.cabs)||!A.solids)return 0;let n=0;
  A.cabs.forEach((cb,k)=>{const m=cb&&cb.g&&cb.g.userData.cabModel,sd=A.solids[5+k];if(!m||!sd||!sd.X)return;const u=m.userData;cb.g.updateMatrixWorld(true);
    Object.assign(sd,{c:cb.g.localToWorld(V3(0,0,u.zc)).normalize().multiplyScalar(R),hx:u.hx*.95,hz:u.hz*.95,top:CAB_H});n++;});return n;}
function cabDoors(A){A.cabs.forEach((cb,k)=>{const d=A.doors[k];if(!d)return;const kind=CAB_AT[k],act=CAB_ACT[kind],i=DOORS.indexOf(d);
  if(cabLive(act)){d.act=act;d.key=act.kind;if(i<0)DOORS.push(d);}else{d.act={kind:'decor',title:kind,label:''};d.key='decor'+k;if(i>=0)DOORS.splice(i,1);}});} /* a door of an unknown kind would open an empty room: the show-pieces have none (kept in ARC.doors, so seatArcade never makes another) */
/* a game whose room script is not here yet (CAB_ROOM): look again once a second for a few minutes; when it comes, its cabinets get their doors and art */
const cabAllLive=()=>CAB_AT.every(kind=>!CAB_ACT[kind]||cabLive(CAB_ACT[kind]));
function cabWait(n){const A=window.__arcade;if(!A||!Array.isArray(A.cabs))return;if(cabAllLive()){cabDoors(A);for(const kind in CABS.tpl)cabArt(kind);return;}if(n<300)setTimeout(cabWait,1000,n+1);}
function arcadeModels(){const A=window.__arcade;CABS.tries++;
  if(A){A.models=true;cabLoad();if(Array.isArray(A.cabs)&&Array.isArray(A.doors)&&A.doors.length>=A.cabs.length){if(!CABS.t0){CABS.t0=performance.now();cabDoors(A);if(!cabAllLive())setTimeout(cabWait,1000,1);for(const ms of [1000,4500,8000,12500,16000,25000])setTimeout(cabSolids,ms);}
    cabFit();if(A.cabs.every(cb=>cb&&cb.g&&cb.g.userData.cabModel))return;}}
  if(CABS.tries<600)setTimeout(arcadeModels,A&&A.cabs?500:250);}
/* ---------- the walk-in arcade: nothing scattered grows or stands inside it ----------
   The dressing waits for the arcade to be seated (ready), but when its model comes in late the street is dressed first, while
   ARC.covers still says "not covered", and plants, trees and props land in it (half under its floor, through its cabinets).
   So once it is seated, again after each re-seat (0, 4 and 12 s), and whenever more dressing or props come in, everything whose
   ground point is inside its footprint, forecourt and ramp (plus ARC_PAD) goes: billboards from their instanced lists, whole
   pieces (a tree, a pole, a planter: OWN) from the merged buckets, the wires of a pole taken out, the town's scattered props
   from the scene, and their solids and colliders. The street's own ground work (paths, gutters, markings, decals) is left alone. */
const ARC_PAD=.3,ARCB=new Set(['props','signs','wires','leafshade','shadows','wallplants']);
const AC={o:null,adds:-1,kids:-1,runs:0,seats:0,polls:0,bills:{},tris:{},groups:[],solids:0,at:[]};
paintedTree=owned(paintedTree);pole=owned(pole,'pole');glb=owned(glb,0,1);
cable=(f=>function(A_,B_){const s=OWN;OWN=OWN||Object.assign([A_.clone().normalize(),B_.clone().normalize()],{cab:1});try{return f.apply(this,arguments);}finally{OWN=s;}})(cable);
function arcClear(force){const A=window.__arcade;if(!A||!A.on||!A.covers||!A.o)return 0;
  if(!force&&A.o===AC.o&&ADDS===AC.adds&&scene.children.length===AC.kids)return 0; /* nothing new since the last pass */
  if(A.o!==AC.o){AC.seats++;AC.t1=AC.t1||performance.now();}AC.o=A.o;AC.adds=ADDS;AC.runs++;
  const hit=a=>{for(const n of a)if(A.covers(n,ARC_PAD))return true;return false;};const lat=(a,b)=>Math.acos(Math.min(1,a.dot(b)))*R;
  const goneO=[],goneP=[];let k=0;
  /* the merged buckets: whole pieces, then the wires of any pole that went */
  const drops=BUCKETS.map(b=>{if(!ARCB.has(b.name)||!b.I.length)return null;const rm=new Uint8Array(b.I.length);
    b.I.forEach((r,i)=>{const a=r[2];if(a.cab||(b.name==='wires'&&a.anon))return; /* wires: only whole pieces (a pole's parts), never a loose fitting such as a service drop's bracket on a façade */if(hit(a)){rm[i]=1;if(a.pole)goneP.push(a[0]);}});return rm;});
  BUCKETS.forEach((b,j)=>{const rm=drops[j];if(!rm)return;b.I.forEach((r,i)=>{const a=r[2];if(a.cab&&goneP.some(p=>lat(p,a[0])<1.2||lat(p,a[1])<1.2))rm[i]=1;});
    let n=0;for(const r of rm)n+=r;if(!n)return;const P=[],N=[],U=[],C=[],I=[];let tri=0;
    b.I.forEach((r,i)=>{const [v0,v1,a]=r;if(rm[i]){tri+=(v1-v0)/3;arcLog(b.name,a[0],(v1-v0)/3);if(!a.anon&&!a.cab)goneO.push(a[0]);return;}const nv=P.length/3;
      for(let v=v0;v<v1;v++){P.push(b.P[v*3],b.P[v*3+1],b.P[v*3+2]);N.push(b.N[v*3],b.N[v*3+1],b.N[v*3+2]);U.push(b.U[v*2],b.U[v*2+1]);C.push(b.C[v*3],b.C[v*3+1],b.C[v*3+2]);}I.push([nv,P.length/3,a]);});
    Object.assign(b,{P,N,U,C,I});AC.tris[b.name]=(AC.tris[b.name]||0)+tri;k+=n;
    if(!P.length){b.dirty=false;if(b.mesh){const old=b.mesh.geometry;b.mesh.geometry=new T.BufferGeometry();old.dispose();}}else b.dirty=true;});
  /* the billboards: rebuilt from their lists at the next flush */
  for(const b of BILLS){const keep=[];let n=0;for(const it of b.list){if(hit(it.a||[it.n])){n++;arcLog(b.name,it.n,0);if(it.a)goneO.push(it.a[0]);}else keep.push(it);}if(n){b.list=keep;b.dirty=true;AC.bills[b.name]=(AC.bills[b.name]||0)+n;k+=n;}}
  /* the town's scattered props (and the dressing's model trees): any group built from a loaded prop model */
  const lib=window.__propLib||{},libG=new Set();for(const kd in lib)lib[kd].traverse(m=>{if(m.isMesh)libG.add(m.geometry);});
  const keepG=new Set([...(window.BLDGS||[]).map(b=>b.inst),...G.npcs.map(n=>n.model&&n.model.holder).filter(Boolean),...(window.__POLES||[])]);
  for(const c of [...scene.children]){if(!c.isGroup||keepG.has(c)||c.userData.zone||c.position.lengthSq()<1)continue;const n=c.position.clone().normalize();if(!A.covers(n,ARC_PAD))continue;
    let p=false;c.traverse(m=>{if(!p&&m.isMesh&&libG.has(m.geometry))p=true;});if(!p||(!c.userData.tree&&new T.Box3().setFromObject(c).getSize(V3()).length()>9))continue; /* a tree goes whatever its size (its crown alone is ~8.5 m across corners) */
    scene.remove(c);const ci=G.colliders.indexOf(c);if(ci>=0)G.colliders.splice(ci,1);goneO.push(n);let nm='';c.traverse(m=>{if(!nm&&m.name&&m.name!=='Scene')nm=m.name;});AC.groups.push((c.userData.tree?'tree ':'')+nm.slice(0,24));arcLog('group',n,0);k++;}
  /* their solids: a circle inside the footprint, or where a piece was taken out (never the arcade's own walls and cabinets, which are boxes) */
  for(let i=solids.length-1;i>=0;i--){const so=solids[i];if(so.r===undefined||so.r>1)continue;const n=so.c.clone().normalize();if(A.covers(n,0)||(A.covers(n,ARC_PAD)&&goneO.some(q=>lat(q,n)<.6))){solids.splice(i,1);AC.solids++;}}
  AC.kids=scene.children.length;if(k)G.dirty();return k;}
function arcLog(what,n,tri){const A=window.__arcade;if(AC.at.length>=80)return;const d=n.clone().multiplyScalar(R).sub(A.o);AC.at.push([what,+d.dot(A.X).toFixed(1),+d.dot(A.Z).toFixed(1),tri]);} /* what went, where: x across the arcade, z out of its front (DRESS.arcClear.at) */
function arcWatch(){const A=window.__arcade;if(A&&A.on&&A.o!==AC.o)flushAll();AC.polls++;if(AC.seats<3&&!(AC.t1&&performance.now()-AC.t1>30000))setTimeout(arcWatch,AC.polls<400?500:3000);} /* until the last re-seat (12 s after the first; two can fall between polls on a busy page) */
window.addEventListener('planet:prop',()=>setTimeout(()=>{arcClear(true);flushAll();},50)); /* the props it places come in after this event */
/* ---------- start: once the street's buildings are in ---------- */
/* ===== STREET 01, LOCAL SHOPPING / RESIDENTIAL HILL: LOCKED 27 Sep 2026 =====
   Approved by Josh. Do not change these numbers, seeds or the code paths they drive (street, junctionKit,
   buildingSide, groundCover, crest, stairSite/buildStair, lawns): every placement is reproduced from them. Other
   streets get their own config and identity; they reuse the kit (materials, billboards, buckets, ink), not this recipe. */
const S2CFG={houseKey:'25',house:[292.1,7.1],yardPole:[287.75,5.35],poles:[271,285]}; /* Street 02: the levels and slots come from the game's S2 terrain (GAME.S2) */
const PROTO={locked:true,road:'main',order:['1v2','7','9','12','8','17'],s0:144,s1:208,build:1,rail:-1,junction:'skate',seedB:1340171692,seedC:1071038393,poleS1:236,railS1:216,branch:{road:'side2',from:5,to:44},crest:{road:'main',c0:203,c1:222,trees:7,r0:186,r1:224,tower:null, /* the lookout tower broke the silhouette but did not belong here (27 Sep); trees, roofs, poles and wires carry the skyline */flood:[209,214],floodH:15,streetTrees:[[206,3.35],[209,-3.85]],seed:777},stair:{side:-1,s0:190,s1:206,pref:198,len:4.6,W:1.5},lawn:{side:1,s0:144,s1:206,trees:4,groups:8,seed:555}};
let built=false,t0=performance.now();
function ready(){const T_=window.__town;if(!T_)return false;{const A=window.__arcade;if(A&&!A.on&&performance.now()-t0<=25000)return false;} /* the arcade seated first, so ARC.covers keeps the street's planting out of it (arcClear tidies up if it comes in later than that) */const road=MAIN;const want=T_.modelSlots.filter(sl=>{const n=sphere(sl.lon,sl.lat);const bs=nearest(road,n);return bs&&bs.s>=PROTO.s0-3&&bs.s<=Math.max(PROTO.s1,PROTO.crest.r1)+3;}).length;const have=(window.BLDGS||[]).filter(b=>{const bs=nearest(road,b.inst.position.clone().normalize());return bs&&bs.s>=PROTO.s0-3&&bs.s<=Math.max(PROTO.s1,PROTO.crest.r1)+3;}).length;const lib=window.__propLib||{};return (have>=want&&lib.upole&&lib.tree1)||performance.now()-t0>25000;}
function build(){if(built)return;built=true;const t=performance.now();setup();{const br=ROADS.find(r=>r.name===PROTO.branch.road);if(br){const toSpawn=atS(MAIN,PROTO.s0).n.clone().sub(atS(br,5).n);PROTO.branch.side=Math.sign(atS(br,5).side.dot(toSpawn))||1;}} /* poles down the side street on the side that faces the spawn, so they read against the sky */
  STAIR=stairSite(PROTO.stair);if(STAIR){const w=window.DRESS.treeAt=window.DRESS.treeAt||[];for(const f of [0,.5,1])w.push(tn(STAIR.top,STAIR.dir.clone().multiplyScalar(STAIR.L*f)));} /* keep trees off the stair */
  const P=street(PROTO);junctionKit(PROTO.junction);const nb=buildingSide(PROTO);if(PROTO.crest.towerAt){const [ts,tl]=PROTO.crest.towerAt;(window.DRESS.treeAt=window.DRESS.treeAt||[]).push(offsetFrom(atS(MAIN,ts),tl));} /* keep the tower's corner clear of trees */
  const gc=groundCover(PROTO);const cr_=crest(PROTO.crest);window.DRESS.crest=cr_;flushAll();
  sd_=4242;/* service drops: from the building-side poles to the nearest façades */
  for(const p of (P[PROTO.build]||[]))for(const b of [...(window.BLDGS||[])].sort((a,c)=>a.inst.position.x-c.inst.position.x||a.inst.position.z-c.inst.position.z)){const [x0,x1,,z1]=b.foot;const pts=[V3(x0*.8+x1*.2,Math.min(b.top*.66,5.2)/b.sc,z1+.05/b.sc),V3(x0*.2+x1*.8,Math.min(b.top*.62,5)/b.sc,z1+.05/b.sc)].map(v=>b.inst.localToWorld(v));for(const q of pts){const d=q.distanceTo(p.drop);if(d<11&&d>2&&ch(.6)){cable(p.drop,q,.35+d*.03,.01,0x2d353c);WIRE.add(new T.BoxGeometry(.1,.1,.06),new T.Matrix4().setPosition(q),0x6d7478);}}}
  if(STAIR){sd_=313;window.DRESS.stair=buildStair(STAIR);}
  if(!/[?&]s2=0\b/.test(location.search)){sd_=2002;try{s2Setup();window.DRESS.s2=street02(S2CFG);}catch(e){window.DRESS.s2err=String(e&&e.stack||e);console.warn('street 02',e);}} /* Street 02 can never stop Street 01 from building */sd_=PROTO.lawn.seed;window.DRESS.lawns=lawns(PROTO.lawn);
  try{window.DRESS.zones=zones();}catch(e){window.DRESS.zerr=String(e&&e.stack||e);console.warn('zones',e);}
  treeSwap();for(const ms of [3000,9000,20000,40000])setTimeout(()=>{treeSwap();flushAll();},ms); /* trees still loading come in later */
  flushAll();window.DRESS.info={ms:Math.round(performance.now()-t),buildings:nb,cover:gc,bills:BILLS.map(b=>[b.name,b.list.length]),verts:BUCKETS.map(b=>[b.name,b.P.length/3])};console.log('dress: built',JSON.stringify(window.DRESS.info));}
function poll(){if(built)return;if(ready()){try{build();}finally{window.__dressBuilt=true;}}else setTimeout(poll,250);} /* the loading screen waits for this */

window.DRESS={frame(dt,now){UT.value=now/1000;try{zonesFrame(dt,now/1000);}catch(e){}},glb,look(v){LOOKU.value=v;return v;},rebuild(){location.reload();},
  async calls(){const ri=renderer.info;ri.autoReset=false;ri.reset();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const c={calls:ri.render.calls,tris:ri.render.triangles};ri.autoReset=true;return c;},buckets:BUCKETS,bills:BILLS};
setTimeout(poll,600);
window.DRESS.GTR=GTR;window.DRESS.gtrRetune=()=>{for(const p of ZPEOPLE)if(p.gtr)gtrSeat(p,p.gtr);};window.DRESS.zpeople=ZPEOPLE; /* tuning Kofi's guitar from the console */
window.DRESS.fireSpot=()=>{const f=ZFX.fire;if(!f||!f.toRoad)return null;const d=f.toRoad.clone().addScaledVector(f.n,-f.toRoad.dot(f.n)).normalize();return {n:tn(f.n,d.clone().multiplyScalar(3.6)),face:d.negate()};}; /* the menu's "Spawn at the forest campfire": on the open (road) side of the fire, facing it */
arcadeModels();window.DRESS.cabs=CABS;arcWatch();window.DRESS.arcClear=AC; /* the arcade's cabinet models: on their own poll (the arcade is seated whenever its model loads) */
})();
