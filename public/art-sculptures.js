/* =====================================================================
   art-sculptures.js: illustrated cut-out sculptures standing on the planet (first: "Exploitative Mindset", Oct 2026)

   Each artwork becomes a shallow freestanding cut-out, like a painted plywood sign: a solid body whose outline is the
   drawing's own outline (traced from the image's transparency at load, gaps between branches and all), with the
   ORIGINAL image as its front face, matte charcoal cut edges, a painted back, a low matte plinth, a solid the player
   cannot walk through, and an 'Inspect artwork' prompt in front that opens a zoomable view of the original file.

   Loaded after planet.html's own scripts:  <script src="art-sculptures.js?v=1"></script>
   planet.html's enterHouse hands any act.kind it does not know to window.ROOMS (one generic line):
     else if(window.ROOMS&&window.ROOMS[act.kind])houseStop=window.ROOMS[act.kind](body,act);
   This file registers ROOMS.art, the artwork viewer.

   TO MOVE / TURN / RESIZE ONE: edit its entry in SCULPTURES below (lon/lat, facing, nudge, height). To try values live
   in the console first: ART.set('exploitative-mindset',{facing:40,nudge:[.5,0]}) rebuilds it in place (then copy the
   numbers here). ART.info('exploitative-mindset') prints what was built. ?art=0 turns every sculpture off.
   TO ADD ANOTHER ARTWORK: add an entry with its own id, image and spot. Nothing else is needed: the outline,
   textures, plinth, solid and prompt are all made from the image at load.

   How the body is made (no outline file is shipped: a new image needs no extra step):
     alpha > 128 is the drawing; the bottom rows are squared off so it stands flat; that mask is traced on a grid of
     2x2-pixel blocks (marching squares with sub-pixel interpolation), simplified (Douglas-Peucker, 1 px) and
     triangulated with holes (THREE.ShapeUtils / earcut). Enclosed gaps under holeMin px² are filled; specks of the
     drawing that float free of the body (the boy's two sweat marks) are kept on the front face only, with no
     thickness, so nothing hangs in the air from the side. About 10 k triangles, built once in a few tens of ms.
   Front: the original pixels 1:1 on a canvas backed with the drawing's own outline ink (so the few texels between
     the traced edge and the drawn edge read as outline), mipmapped, anisotropic, no lighting maths beyond the
     world's painted warm/cool tint (kept faint here so the drawn colours stay as drawn). No shine anywhere.
   Back: built once at load in front-image coordinates: the body silhouette filled with the back art's branch grey,
     a thin ink outline round it, then the back illustration (drawn as seen from behind) mirrored onto it with
     backFit and clipped to the silhouette. Mapped onto the back face it reads the right way round from behind.
   BACK FIT: backFit {dx,dy,s} places the back image in FRONT pixel coordinates: mirrored about the vertical centre
     line and scaled by s about the bottom centre, then shifted by dx,dy (front px). At load the fit is checked
     against a plain mirror (dx 0, dy 0, s 1) by silhouette overlap, and whichever matches better is used, so a back
     image drawn into the silhouette template (shots/back-silhouette-template.png) drops in with no code change.
   ===================================================================== */
(function(){
'use strict';
if(/[?&]art=0\b/.test(location.search))return;

/* ============================== CONFIG: one entry per artwork ============================== */
const SCULPTURES=[
  {
    id:'exploitative-mindset',
    title:'Exploitative Mindset',                         // the viewer's title bar
    label:'Inspect artwork',                              // the action button shown in front of it
    alt:'Exploitative Mindset: a grey tree labelled EXPLOITATION, its branches FOOD, CLOTHING, TRANSPORT, ENTERTAINMENT, WORK and TESTING, with ANIMALS ARE HERE FOR US on the trunk, two people digging at its roots, and EXPLOITATIVE MINDSET written in the roots underground.',
    img:'assets/art/exploitative-mindset.webp',           // front: the original illustration, transparent background (the viewer shows this very file)
    backImg:'assets/art/exploitative-mindset-back.webp',  // back: the same tree drawn as seen from behind; null = a plain matte back with an ink edge
    backFit:{dx:4,dy:-12,s:.99},                          // see BACK FIT above (front-image px)
    lon:-1.392, lat:.499,                                 // where it stands: the garden lawn at the ring-road bend, between alley1 and side2
    facing:30,                                            // compass bearing the illustrated front looks toward, degrees from north turning toward east (+lon)
    nudge:[0,0],                                          // fine shift in metres: [toward the front's right, toward the front]
    height:3.0,                                           // metres from the bottom of the drawing to its highest branch tip (width follows the image: 2.96 m)
    depth:.10,                                            // thickness of the cut-out, metres
    plinth:{w:3.3, d:.6, rise:.2, sink:.08, color:0x9a958c}, // footprint (m); top 'rise' above the highest ground under it, base 'sink' below the lowest; null = no plinth
    edge:0x3a3431,                                        // the cut edges: matte charcoal, a shade off the drawing's ink
    back:{fill:'auto', ink:'auto', line:3.5},             // back face: fill (auto = the back art's branch grey), outline ink (auto = the art's own), outline width in image px
    trace:{alpha:128, grid:2, tol:1, holeMin:200, flatBase:30} // outline tracing (image px): alpha cut, block size, simplification, smallest kept hole, rows squared off at the base
  }
];

/* ============================== runtime ============================== */
const ART={config:SCULPTURES,items:{},ready:false};window.ART=ART;
const ROOMS=window.ROOMS=window.ROOMS||{};

const loadImg=src=>new Promise((res,rej)=>{const i=new Image();i.decoding='async';i.onload=()=>res(i);i.onerror=()=>rej(new Error('art: could not load '+src));i.src=src;});
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;};
const ctx2=(c,read)=>c.getContext('2d',read?{willReadFrequently:true}:undefined);
const hex=c=>'#'+('000000'+(c>>>0).toString(16)).slice(-6);
const rgbHex=a=>'#'+a.map(v=>('0'+Math.max(0,Math.min(255,Math.round(v))).toString(16)).slice(-2)).join('');
function pixelsOf(img){const w=img.naturalWidth,h=img.naturalHeight;const c=canvas(w,h);const x=ctx2(c,true);x.drawImage(img,0,0);return x.getImageData(0,0,w,h);}

/* ---------- the outline: marching squares on the alpha mask, then Douglas-Peucker ---------- */
function traceOutline(id,o){
  const w=id.width,h=id.height,d=id.data,F=o.grid||2,TH=o.alpha===undefined?128:o.alpha;
  const A=new Uint8Array(w*h);let x0=w,x1=-1,y0=h,y1=-1;
  for(let y=0,k=0;y<h;y++)for(let x=0;x<w;x++,k++){const a=d[k*4+3];A[k]=a;if(a>TH){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}}
  if(x1<0)throw new Error('art: the image has no opaque pixels');
  if(o.flatBase){for(let x=x0;x<=x1;x++){let low=-1;for(let y=y1;y>=Math.max(0,y1-o.flatBase);y--)if(A[y*w+x]>TH){low=y;break;}if(low>=0)for(let y=low+1;y<=y1;y++)A[y*w+x]=255;}} /* a hand-drawn bottom edge wanders a few px: square it off so it stands flat on the plinth */
  const gw=Math.ceil(w/F)+2,gh=Math.ceil(h/F)+2,G=new Float32Array(gw*gh); /* block averages with an empty border, so every contour closes */
  for(let j=1;j<gh-1;j++)for(let i=1;i<gw-1;i++){let s=0,n=0;const bx=(i-1)*F,by=(j-1)*F;for(let yy=by;yy<by+F&&yy<h;yy++)for(let xx=bx;xx<bx+F&&xx<w;xx++){s+=A[yy*w+xx];n++;}G[j*gw+i]=s/n;}
  const iso=TH+.37; /* never equal to a block average (multiples of 1/F²), so no contour point lands exactly on a grid point */
  const P=new Map(),NX=new Map();
  const ept=(id,x,y)=>{if(!P.has(id))P.set(id,[x,y]);return id;};
  /* each segment is stored with the drawing on its left (image coordinates, y down) */
  const seg=(p,q,cx,cy,inside)=>{const a=P.get(p),b=P.get(q);const cr=(b[0]-a[0])*(cy-a[1])-(b[1]-a[1])*(cx-a[0]);if((cr<0)===inside)NX.set(p,q);else NX.set(q,p);};
  for(let j=0;j<gh-1;j++)for(let i=0;i<gw-1;i++){
    const a=G[j*gw+i],b=G[j*gw+i+1],c=G[(j+1)*gw+i+1],e=G[(j+1)*gw+i];
    const cs=(a>=iso?8:0)|(b>=iso?4:0)|(c>=iso?2:0)|(e>=iso?1:0);if(cs===0||cs===15)continue;
    const T=()=>ept((j*gw+i)*2,i+(iso-a)/(b-a),j),Rt=()=>ept((j*gw+i+1)*2+1,i+1,j+(iso-b)/(c-b)),
          Bt=()=>ept(((j+1)*gw+i)*2,i+(iso-e)/(c-e),j+1),L=()=>ept((j*gw+i)*2+1,i,j+(iso-a)/(e-a));
    switch(cs){ /* corners: a top-left 8, b top-right 4, c bottom-right 2, d (e) bottom-left 1 */
      case 1:seg(L(),Bt(),i,j+1,true);break;
      case 2:seg(Bt(),Rt(),i+1,j+1,true);break;
      case 3:seg(L(),Rt(),i,j+1,true);break;
      case 4:seg(T(),Rt(),i+1,j,true);break;
      case 5:if((a+b+c+e)/4>=iso){seg(T(),L(),i,j,false);seg(Bt(),Rt(),i+1,j+1,false);}else{seg(T(),Rt(),i+1,j,true);seg(L(),Bt(),i,j+1,true);}break;
      case 6:seg(T(),Bt(),i+1,j,true);break;
      case 7:seg(T(),L(),i,j,false);break;
      case 8:seg(T(),L(),i,j,true);break;
      case 9:seg(T(),Bt(),i,j,true);break;
      case 10:if((a+b+c+e)/4>=iso){seg(T(),Rt(),i+1,j,false);seg(L(),Bt(),i,j+1,false);}else{seg(T(),L(),i,j,true);seg(Bt(),Rt(),i+1,j+1,true);}break;
      case 11:seg(T(),Rt(),i+1,j,false);break;
      case 12:seg(L(),Rt(),i,j,true);break;
      case 13:seg(Bt(),Rt(),i+1,j+1,false);break;
      case 14:seg(L(),Bt(),i,j+1,false);break;
    }}
  const loops=[],seen=new Set();
  for(const s of NX.keys()){if(seen.has(s))continue;const L=[];let k=s;while(k!==undefined&&!seen.has(k)){seen.add(k);const p=P.get(k);L.push([(p[0]-1)*F+F/2,(p[1]-1)*F+F/2]);k=NX.get(k);}if(L.length>=3)loops.push(L);}
  /* sort them: with the drawing kept on the left in y-down coordinates, an outer edge winds negative, a hole positive */
  const outers=[],holes=[];for(const L of loops){const a=areaOf(L);(a<0?outers:holes).push({L,a:Math.abs(a)});}
  outers.sort((p,q)=>q.a-p.a);const big=outers.length?outers[0].a:0;
  const bodies=[],decals=[],dropped={specks:0,holes:0,holeArea:0};
  for(const ou of outers){if(ou.a>=Math.max(2000,big*.004))bodies.push({outer:ou.L,holes:[],a:ou.a});else if(ou.a>=20)decals.push(ou.L);else dropped.specks++;}
  for(const ho of holes){if(ho.a<(o.holeMin||0)){dropped.holes++;dropped.holeArea+=Math.round(ho.a);continue;}
    let best=null;for(const b of bodies){if(inPoly(ho.L[0],b.outer)&&(!best||b.a<best.a))best=b;}if(best)best.holes.push(ho.L);else dropped.holes++;}
  const tol=o.tol||1;const simp=L=>{const s=dpClosed(L,tol);return s.length>=3?s:null;};
  for(const b of bodies){b.outer=simp(b.outer);b.holes=b.holes.map(simp).filter(Boolean);}
  const out={w,h,bbox:[x0,y0,x1+1,y1+1],bodies:bodies.filter(b=>b.outer),decals:decals.map(simp).filter(Boolean),dropped,keptHoles:0,points:0};
  for(const b of out.bodies){out.keptHoles+=b.holes.length;out.points+=b.outer.length;for(const hh of b.holes)out.points+=hh.length;}
  return out;}
function areaOf(L){let s=0;for(let i=0,n=L.length;i<n;i++){const p=L[i],q=L[(i+1)%n];s+=p[0]*q[1]-q[0]*p[1];}return s/2;}
function inPoly(pt,L){let c=false;const x=pt[0],y=pt[1];for(let i=0,j=L.length-1;i<L.length;j=i++){const a=L[i],b=L[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function dp(pts,tol){const n=pts.length;if(n<3)return pts.slice();const keep=new Uint8Array(n);keep[0]=keep[n-1]=1;const st=[[0,n-1]];
  while(st.length){const [s,e]=st.pop();const ax=pts[s][0],ay=pts[s][1],dx=pts[e][0]-ax,dy=pts[e][1]-ay,L=Math.hypot(dx,dy);let md=-1,mi=-1;
    for(let i=s+1;i<e;i++){const px=pts[i][0]-ax,py=pts[i][1]-ay;const d=L>1e-9?Math.abs(px*dy-py*dx)/L:Math.hypot(px,py);if(d>md){md=d;mi=i;}}
    if(md>tol){keep[mi]=1;st.push([s,mi],[mi,e]);}}
  const r=[];for(let i=0;i<n;i++)if(keep[i])r.push(pts[i]);return r;}
function dpClosed(L,tol){let far=0,fd=-1;for(let i=1;i<L.length;i++){const d=(L[i][0]-L[0][0])**2+(L[i][1]-L[0][1])**2;if(d>fd){fd=d;far=i;}}
  const a=dp(L.slice(0,far+1),tol),b=dp(L.slice(far).concat([L[0]]),tol);return a.concat(b.slice(1,-1));}

/* ---------- the body: front and back faces (triangulated with holes) and the cut edges ---------- */
function buildBody(T,tr,m){ /* m: {mpp, cx, base, depth}; returns a BufferGeometry with groups 0 front, 1 back, 2 edges */
  const X=x=>(x-m.cx)*m.mpp,Y=y=>(m.base-y)*m.mpp,zf=m.depth/2,zb=-m.depth/2,U=x=>x/tr.w,V=y=>1-y/tr.h;
  const F={p:[],n:[],u:[]},B={p:[],n:[],u:[]},S={p:[],n:[],u:[]};
  const cap=(loops,faces,face,z,nz,flip)=>{for(const f of faces){let [i,j,k]=f;const a=loops[i],b=loops[j],c=loops[k];
      const cr=(X(b[0])-X(a[0]))*(Y(c[1])-Y(a[1]))-(Y(b[1])-Y(a[1]))*(X(c[0])-X(a[0]));if(Math.abs(cr)<1e-12)continue;
      if((cr>0)===flip){const t=j;j=k;k=t;}
      for(const q of [loops[i],loops[j],loops[k]]){face.p.push(X(q[0]),Y(q[1]),z);face.n.push(0,0,nz);face.u.push(U(q[0]),V(q[1]));}}};
  const tri=(outer,holes)=>T.ShapeUtils.triangulateShape(outer.map(p=>new T.Vector2(p[0],p[1])),holes.map(h=>h.map(p=>new T.Vector2(p[0],p[1]))));
  const walls=L=>{for(let i=0,n=L.length;i<n;i++){const p=L[i],q=L[(i+1)%n];const px=X(p[0]),py=Y(p[1]),qx=X(q[0]),qy=Y(q[1]);const dx=qx-px,dy=qy-py,l=Math.hypot(dx,dy);if(l<1e-7)continue;
      const nx=-dy/l,ny=dx/l; /* the drawing is on the right of the edge once y points up, so outward is its left */
      S.p.push(px,py,zf,qx,qy,zf,qx,qy,zb, px,py,zf,qx,qy,zb,px,py,zb);for(let k=0;k<6;k++){S.n.push(nx,ny,0);S.u.push(0,0);}}};
  for(const b of tr.bodies){const all=b.outer.concat(...b.holes);const faces=tri(b.outer,b.holes);cap(all,faces,F,zf,1,false);cap(all,faces,B,zb,-1,true);walls(b.outer);for(const h of b.holes)walls(h);}
  for(const d of tr.decals){cap(d,tri(d,[]),F,zf,1,false);} /* free specks: front face only */
  const g=new T.BufferGeometry();const P=[].concat(F.p,B.p,S.p),N=[].concat(F.n,B.n,S.n),UV=[].concat(F.u,B.u,S.u);
  g.setAttribute('position',new T.Float32BufferAttribute(P,3));g.setAttribute('normal',new T.Float32BufferAttribute(N,3));g.setAttribute('uv',new T.Float32BufferAttribute(UV,2));
  g.addGroup(0,F.p.length/3,0);g.addGroup(F.p.length/3,B.p.length/3,1);g.addGroup((F.p.length+B.p.length)/3,S.p.length/3,2);
  g.computeBoundingBox();g.computeBoundingSphere();g.userData.tris={front:F.p.length/9,back:B.p.length/9,edges:S.p.length/9,total:P.length/9};return g;}

/* the body's silhouette as a canvas path in image px (bodies and their holes; free specks are front-only) */
function bodyPath(tr){const p=new Path2D();const ring=L=>{p.moveTo(L[0][0],L[0][1]);for(let i=1;i<L.length;i++)p.lineTo(L[i][0],L[i][1]);p.closePath();};for(const b of tr.bodies){ring(b.outer);for(const h of b.holes)ring(h);}return p;}

/* ---------- colours sampled from the art ---------- */
function edgeInk(id){ /* the drawing's own outline colour: average of the opaque pixels that touch the transparent background */
  const w=id.width,h=id.height,d=id.data;let r=0,g=0,b=0,n=0;
  for(let y=1;y<h-1;y+=2)for(let x=1;x<w-1;x++){const k=y*w+x;if(d[k*4+3]<200)continue;if(d[(k-1)*4+3]<128||d[(k+1)*4+3]<128||d[(k-w)*4+3]<128||d[(k+w)*4+3]<128){r+=d[k*4];g+=d[k*4+1];b+=d[k*4+2];n++;}}
  return n?[r/n,g/n,b/n]:[24,20,20];}
function branchGrey(id){ /* the most common low-saturation mid-tone in the art (its tree grey) */
  const d=id.data,H=new Map();for(let k=0;k<d.length;k+=4*3){if(d[k+3]<200)continue;const r=d[k],g=d[k+1],b=d[k+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;if(mx-mn>45||l<60||l>200)continue;const key=(r>>4)<<8|(g>>4)<<4|(b>>4);let e=H.get(key);if(!e){e=[0,0,0,0];H.set(key,e);}e[0]+=r;e[1]+=g;e[2]+=b;e[3]++;}
  let best=null;for(const e of H.values())if(!best||e[3]>best[3])best=e;return best?[best[0]/best[3],best[1]/best[3],best[2]/best[3]]:[110,104,112];}

/* ---------- textures ---------- */
function texSize(w,h,k,gl2){if(gl2)return [Math.round(w*k),Math.round(h*k)];const p=v=>Math.pow(2,Math.floor(Math.log2(v)));return [p(w*k),p(h*k)];} /* WebGL1 cannot mipmap odd sizes: three would shrink them anyway, so do it once, well */
function finishTex(T,c,r){const t=new T.CanvasTexture(c);t.anisotropy=Math.min(8,r.capabilities.getMaxAnisotropy()||1);t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;}
function frontCanvas(img,ink,cw,ch){const c=canvas(cw,ch),x=ctx2(c);x.fillStyle=ink;x.fillRect(0,0,cw,ch);x.imageSmoothingQuality='high';x.drawImage(img,0,0,cw,ch);return c;}
function backCanvas(tr,path,back,fit,fill,ink,line,cw,ch){const c=canvas(cw,ch),x=ctx2(c);x.scale(cw/tr.w,ch/tr.h);x.imageSmoothingQuality='high';
  x.fillStyle=fill;x.fill(path,'evenodd');
  x.lineJoin='round';x.lineCap='round';x.lineWidth=line*2;x.strokeStyle=ink;x.stroke(path); /* centred on the edge: the outer half is clipped away below */
  if(back){x.save();x.translate(tr.w/2+fit.dx,tr.h+fit.dy);x.scale(-fit.s,fit.s);x.translate(-tr.w/2,-tr.h);x.drawImage(back,0,0,tr.w,tr.h);x.restore();}
  x.globalCompositeOperation='destination-in';x.fill(path,'evenodd');
  x.globalCompositeOperation='destination-over';x.fillStyle=ink;x.fillRect(0,0,tr.w,tr.h);x.globalCompositeOperation='source-over';return c;}
function overlap(tr,path,back,fit){ /* silhouette overlap (intersection over union) of the body and the fitted back art, at quarter size */
  const k=.25,cw=Math.round(tr.w*k),ch=Math.round(tr.h*k);
  const a=ctx2(canvas(cw,ch),true);a.scale(k,k);a.fill(path,'evenodd');const A=a.getImageData(0,0,cw,ch).data;
  const b=ctx2(canvas(cw,ch),true);b.scale(k,k);b.translate(tr.w/2+fit.dx,tr.h+fit.dy);b.scale(-fit.s,fit.s);b.translate(-tr.w/2,-tr.h);b.drawImage(back,0,0,tr.w,tr.h);const Bd=b.getImageData(0,0,cw,ch).data;
  let i=0,u=0;for(let p=3;p<A.length;p+=4){const pa=A[p]>128,pb=Bd[p]>128;if(pa&&pb)i++;if(pa||pb)u++;}return u?i/u:0;}

/* painted material, as the world's props are painted (planet-dress.js sunMat): flat colour, a touch warm where it
   faces the sun and cool where it faces away; k sets how much */
function painted(T,G,m,k){m.onBeforeCompile=sh=>{sh.uniforms.uSun=G.SUNU;sh.uniforms.uLook=G.LOOKU;sh.uniforms.uK={value:k};
  sh.vertexShader='varying vec3 vWN;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvWN=normalize(mat3(modelMatrix)*normal);');
  sh.fragmentShader='varying vec3 vWN;uniform vec3 uSun;uniform float uLook,uK;\n'+sh.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\n{float nd=dot(normalize(vWN),uSun);if(!gl_FrontFacing)nd=-nd;float lit=smoothstep(-.04,.16,nd);vec3 k=mix(vec3(.74,.81,.98),vec3(1.05,1.02,.94),lit);gl_FragColor.rgb=clamp(gl_FragColor.rgb*mix(vec3(1.),k,uLook*uK),0.,1.);}');};
  m.customProgramCacheKey=()=>'art-painted-'+k;return m;}

/* ---------- placement on the curved ground ---------- */
function frameAt(G,T,lon,lat){const n=G.sphere(lon,lat).clone().normalize();const east=new T.Vector3(-Math.sin(lon),0,Math.cos(lon));east.addScaledVector(n,-east.dot(n)).normalize();const north=new T.Vector3().crossVectors(east,n).normalize();return {n,east,north};}
function poseFor(G,T,s){
  let {n,east,north}=frameAt(G,T,s.lon,s.lat);const b=(s.facing||0)*Math.PI/180;let F=north.clone().multiplyScalar(Math.cos(b)).addScaledVector(east,Math.sin(b)).normalize();
  if(s.nudge&&(s.nudge[0]||s.nudge[1])){const X0=new T.Vector3().crossVectors(n,F);n=n.clone().addScaledVector(X0,s.nudge[0]/G.R).addScaledVector(F,s.nudge[1]/G.R).normalize();F.addScaledVector(n,-F.dot(n)).normalize();}
  const Y=n.clone(),Z=F.clone(),X=new T.Vector3().crossVectors(Y,Z).normalize();const P=n.clone().multiplyScalar(G.gAt(n));
  /* ground under a local point (x,z), as a local height */
  const groundY=(x,z)=>{const q=P.clone().addScaledVector(X,x).addScaledVector(Z,z).normalize();return q.multiplyScalar(G.gAt(q)).sub(P).dot(Y);};
  return {n,F,X,Y,Z,P,groundY};}

/* ---------- build one sculpture ---------- */
async function build(s){
  const G=window.GAME,T=THREE,r=G.renderer;const t0=performance.now();
  const [img,back]=await Promise.all([loadImg(s.img),s.backImg?loadImg(s.backImg).catch(e=>{console.warn(e.message+': using the plain back');return null;}):null]);
  const t1=performance.now();
  const id=pixelsOf(img);const tr=traceOutline(id,s.trace||{});const t2=performance.now();
  const path=bodyPath(tr);
  const visH=tr.bbox[3]-tr.bbox[1],mpp=s.height/visH,depth=s.depth||.1;
  const geo=buildBody(T,tr,{mpp,cx:(tr.bbox[0]+tr.bbox[2])/2,base:tr.bbox[3],depth});const t3=performance.now();
  /* colours */
  const inkF=edgeInk(id);const bid=back?pixelsOf(back):null;const bo=s.back||{};
  const inkB=bo.ink&&bo.ink!=='auto'?hex(bo.ink):rgbHex(edgeInk(bid||id));const fillB=bo.fill&&bo.fill!=='auto'?hex(bo.fill):rgbHex(branchGrey(bid||id));
  /* the back fit: the configured one, or a plain mirror if that matches the outline better (a back drawn into the template) */
  let fit=null,fitInfo=null;if(back){const cfg=Object.assign({dx:0,dy:0,s:1},s.backFit||{}),plain={dx:0,dy:0,s:1};const a=overlap(tr,path,back,cfg),p=overlap(tr,path,back,plain);fit=p>a+.002?plain:cfg;fitInfo={configured:+a.toFixed(3),plainMirror:+p.toFixed(3),used:fit===plain?'plain mirror':'backFit'};}
  const gl2=!!r.capabilities.isWebGL2,k=G.MIN?.5:1,kb=G.MIN?.5:(G.LITE?.75:1);
  const [fw,fh]=texSize(tr.w,tr.h,k,gl2),[bw,bh]=texSize(tr.w,tr.h,kb,gl2);
  const front=finishTex(T,frontCanvas(img,rgbHex(inkF),fw,fh),r);
  const backT=finishTex(T,backCanvas(tr,path,back,fit,fillB,inkB,bo.line||3.5,bw,bh),r);
  const t4=performance.now();
  const mats=[painted(T,G,new T.MeshBasicMaterial({map:front}),.22),painted(T,G,new T.MeshBasicMaterial({map:backT}),.3),painted(T,G,new T.MeshBasicMaterial({color:s.edge===undefined?0x3a3431:s.edge}),.6)];
  const art=new T.Mesh(geo,mats);art.name='art:'+s.id;
  const item={s,tr,geo,mats,tex:[front,backT],img,back,path,fitInfo,colours:{frontInk:rgbHex(inkF),backInk:inkB,backFill:fillB},times:{load:Math.round(t1-t0),trace:Math.round(t2-t1),mesh:Math.round(t3-t2),textures:Math.round(t4-t3)},texSizes:{front:[fw,fh],back:[bw,bh]}};
  ART.items[s.id]=item;place(item);return item;}

/* stand it on the ground: plinth sized to the slope under it, the cut-out on top, a solid, the prompt */
function place(item){
  const G=window.GAME,T=THREE,s=item.s;unplace(item);
  const pose=poseFor(G,T,s);const grp=new T.Group();grp.name='art-sculpture:'+s.id;
  grp.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(pose.X,pose.Y,pose.Z));grp.position.copy(pose.P);
  const bb=item.geo.boundingBox,artW=bb.max.x-bb.min.x;const pl=s.plinth;
  const fw=pl?pl.w:artW+.1,fd=pl?pl.d:(s.depth||.1)+.1;let lo=1e9,hi=-1e9;
  for(let i=0;i<=10;i++)for(let j=0;j<=4;j++){const y=pose.groundY((i/10-.5)*fw,(j/4-.5)*fd);if(y<lo)lo=y;if(y>hi)hi=y;}
  let top=hi;if(pl){const yb=lo-(pl.sink===undefined?.08:pl.sink),yt=hi+(pl.rise===undefined?.2:pl.rise);
    const pm=new T.Mesh(new T.BoxGeometry(pl.w,yt-yb,pl.d),painted(T,G,new T.MeshBasicMaterial({color:pl.color===undefined?0x9a958c:pl.color}),.85));pm.position.y=(yb+yt)/2;pm.name='art-plinth:'+s.id;grp.add(pm);top=yt;}
  else top=lo; /* no plinth: the base meets the lowest ground and the rest sinks a little into the higher side */
  const art=new T.Mesh(item.geo,item.mats);art.name='art:'+s.id;art.position.y=top-.012;grp.add(art); /* a centimetre into the plinth, so no light shows under it */
  G.scene.add(grp);grp.updateMatrixWorld(true);
  /* solid: one box over the footprint (the planet keeps box solids at radius R) */
  const solid={c:pose.n.clone().multiplyScalar(G.R),X:pose.X.clone(),Z:pose.Z.clone(),hx:fw/2,hz:fd/2,art:s.id};G.solids.push(solid);
  /* the prompt: three door points across the front, 1.2 m out from the plinth; the planet shows a door's prompt within 2.1 m
     of it when you face its inward direction, so you get it standing on the lawn or the pavement edge facing the art,
     and never behind it (the back of the plinth is 2.2 m from them) */
  const act={kind:'art',id:s.id,title:s.title,label:s.label||'Inspect artwork',img:s.img,back:s.backImg||null,alt:s.alt||s.title};
  const doors=[];for(const x of [-1,0,1]){const w0=pose.P.clone().addScaledVector(pose.X,x*Math.min(1,artW/3)).addScaledVector(pose.Z,fd/2+1.2);const dn=w0.normalize();
    const d={n:dn,w:dn.clone().multiplyScalar(G.gAt(dn)),inw:pose.F.clone().negate(),act,key:'art:'+s.id+':'+x};G.DOORS.push(d);doors.push(d);}
  Object.assign(item,{grp,art,solid,doors,pose,plinthTop:top,ground:{lo:+lo.toFixed(3),hi:+hi.toFixed(3)}});G.dirty();}
function unplace(item){const G=window.GAME;if(item.grp){G.scene.remove(item.grp);item.grp.traverse(o=>{if(o.isMesh&&o.name.startsWith('art-plinth')){o.geometry.dispose();o.material.dispose();}});item.grp=null;}
  if(item.solid){const i=G.solids.indexOf(item.solid);if(i>=0)G.solids.splice(i,1);item.solid=null;}
  if(item.doors){for(const d of item.doors){const i=G.DOORS.indexOf(d);if(i>=0)G.DOORS.splice(i,1);}item.doors=null;}G.dirty();}

/* console helpers for tuning */
ART.set=(id,patch)=>{const it=ART.items[id];if(!it)return 'no such artwork: '+id;Object.assign(it.s,patch||{});
  if(patch&&(patch.height!==undefined||patch.depth!==undefined)){const T=THREE,tr=it.tr;it.geo.dispose();it.geo=buildBody(T,tr,{mpp:it.s.height/(tr.bbox[3]-tr.bbox[1]),cx:(tr.bbox[0]+tr.bbox[2])/2,base:tr.bbox[3],depth:it.s.depth||.1});}
  place(it);return ART.info(id);};
ART.info=id=>{const it=ART.items[id];if(!it)return null;const b=it.geo.boundingBox;return {id,lon:it.s.lon,lat:it.s.lat,facing:it.s.facing,nudge:it.s.nudge,size_m:[+(b.max.x-b.min.x).toFixed(3),+(b.max.y-b.min.y).toFixed(3),+(b.max.z-b.min.z).toFixed(3)],
  triangles:it.geo.userData.tris,outline:{points:it.tr.points,bodies:it.tr.bodies.length,holes:it.tr.keptHoles,frontOnlySpecks:it.tr.decals.length,filled:it.tr.dropped},ground:it.ground,plinthTop:+it.plinthTop.toFixed(3),
  backFit:it.fitInfo,colours:it.colours,texSizes:it.texSizes,ms:it.times};};

/* ============================== the viewer (#house body) ============================== */
function css(){if(document.getElementById('art-css'))return;const st=document.createElement('style');st.id='art-css';st.textContent=`
#house .artv{position:absolute;inset:0;overflow:hidden;background:#efe9dc;font-family:var(--hand);color:var(--ink,#26333a)}
#house .artv-stage{position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab;outline:none;-webkit-user-select:none;user-select:none}
#house .artv-stage.drag{cursor:grabbing}
#house .artv-img{position:absolute;left:0;top:0;transform-origin:0 0;image-rendering:auto;max-width:none;max-height:none;-webkit-user-drag:none;user-select:none;pointer-events:none}
#house .artv-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px;opacity:.6}
#house .artv-load[hidden]{display:none}
#house .artv-bar{position:absolute;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 8px 6px 14px;max-width:calc(100% - 20px);box-sizing:border-box}
#house .artv-hint{font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;flex:1 1 auto}
#house .artv-bar button{font-family:var(--hand);font-size:19px;line-height:1;padding:5px 11px;cursor:pointer;background:#fff;color:#26333a;border:2px solid #26333a;border-radius:6px;flex:none}
#house .artv-bar button[aria-pressed=true]{background:#f4c945}
#house .artv-pct{font-size:16px;min-width:3.4em;text-align:center;flex:none}
#house .artv-seg{display:flex;gap:4px;flex:none}
@media (max-width:560px){#house .artv-bar{flex-wrap:wrap;justify-content:center;gap:5px;padding:5px 8px;width:calc(100% - 20px)}#house .artv-hint{flex:1 0 100%;text-align:center;font-size:15px}#house .artv-bar button{padding:5px 9px}}
`;document.head.appendChild(st);}
function artRoom(body,act){
  css();const touch=matchMedia('(pointer:coarse)').matches;
  const root=document.createElement('div');root.className='artv';
  root.innerHTML='<div class="artv-stage" tabindex="0" role="img"><img class="artv-img" draggable="false" alt=""><div class="artv-load">Loading the artwork…</div></div>'+
    '<div class="artv-bar ink"><span class="artv-hint"></span>'+(act.back?'<span class="artv-seg" role="group" aria-label="Side"><button type="button" data-side="front" aria-pressed="true">Front</button><button type="button" data-side="back" aria-pressed="false">Back</button></span>':'')+
    '<button type="button" data-z="out" aria-label="Zoom out">−</button><span class="artv-pct" aria-live="polite"></span><button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="fit" aria-label="Fit to screen">Fit</button></div>';
  body.appendChild(root);
  const stage=root.querySelector('.artv-stage'),im=root.querySelector('.artv-img'),load=root.querySelector('.artv-load'),pct=root.querySelector('.artv-pct'),hint=root.querySelector('.artv-hint');
  hint.textContent=touch?'Pinch to zoom · drag to move · double-tap to zoom in':'Scroll to zoom · drag to move · double-click to zoom in · 0 fits · Esc closes';
  stage.setAttribute('aria-label',act.alt||act.title);im.alt=act.alt||act.title;
  let alive=true,iw=0,ih=0,z=1,tx=0,ty=0,fitZ=1,anim=0,atFit=true,barH=0;const MAXZ=4,reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const view=()=>{const r=stage.getBoundingClientRect();return {w:r.width,h:r.height,l:r.left,t:r.top};};
  const minZ=()=>Math.min(fitZ,1);
  /* at fit it sits centred above the controls; zoomed in, the point under the cursor or fingers stays put, and the
     picture can be moved anywhere as long as it still covers the middle of the screen (so it is never lost) */
  const clampPan=()=>{const v=view(),W=iw*z,H=ih*z,vh=v.h-barH;
    if(z<=fitZ*1.0005){tx=(v.w-W)/2;ty=Math.max(0,(vh-H)/2);return;}
    tx=Math.min(v.w/2,Math.max(v.w/2-W,tx));ty=Math.min(vh/2,Math.max(vh/2-H,ty));};
  const apply=()=>{clampPan();im.style.transform='translate('+tx.toFixed(2)+'px,'+ty.toFixed(2)+'px) scale('+z.toFixed(5)+')';pct.textContent=Math.round(z*100)+'%';};
  const computeFit=()=>{const v=view(),pad=v.w<560?10:28;const bar=root.querySelector('.artv-bar').offsetHeight+18;barH=bar;fitZ=Math.min((v.w-2*pad)/iw,(v.h-pad-bar)/ih);return {v,pad,bar};};
  const fitNow=()=>{const {v,pad,bar}=computeFit();z=fitZ;tx=(v.w-iw*z)/2;ty=Math.max(pad*.5,(v.h-bar-ih*z)/2);atFit=true;apply();};
  const zoomTo=(nz,px,py,smooth)=>{nz=Math.max(minZ(),Math.min(MAXZ,nz));const ix=(px-tx)/z,iy=(py-ty)/z;cancelAnimationFrame(anim);atFit=false;
    if(!smooth||reduce){z=nz;tx=px-ix*z;ty=py-iy*z;apply();return;}
    const z0=z,t0=performance.now(),D=170;const step=now=>{if(!alive)return;const t=Math.min(1,(now-t0)/D),e=1-Math.pow(1-t,3);z=z0+(nz-z0)*e;tx=px-ix*z;ty=py-iy*z;apply();if(t<1)anim=requestAnimationFrame(step);};anim=requestAnimationFrame(step);};
  const centre=()=>{const v=view();return [v.w/2,v.h/2];};
  const show=src=>{load.hidden=false;im.style.visibility='hidden';im.onload=()=>{if(!alive)return;iw=im.naturalWidth;ih=im.naturalHeight;load.hidden=true;im.style.visibility='';fitNow();};im.onerror=()=>{load.textContent='The artwork could not be loaded.';};im.src=src;};
  show(act.img);
  /* wheel: zoom toward the cursor (a trackpad pinch arrives as a wheel with ctrlKey) */
  const onWheel=e=>{e.preventDefault();if(!iw)return;const v=view();const d=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?v.h:1);const f=Math.exp(-d*(e.ctrlKey?.01:.0022));zoomTo(z*f,e.clientX-v.l,e.clientY-v.t,false);};
  stage.addEventListener('wheel',onWheel,{passive:false});
  /* pointers: one drags, two pinch; a double tap zooms in */
  const pts=new Map();let pinch=null,lastTap=null,downAt=null;
  const onDown=e=>{if(!iw)return;try{stage.setPointerCapture(e.pointerId);}catch(_){}pts.set(e.pointerId,{x:e.clientX,y:e.clientY});cancelAnimationFrame(anim);
    if(pts.size===1){downAt={x:e.clientX,y:e.clientY,t:performance.now(),moved:0};stage.classList.add('drag');}
    if(pts.size===2){const [a,b]=[...pts.values()];const v=view();const mx=(a.x+b.x)/2-v.l,my=(a.y+b.y)/2-v.t;pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,z,ix:(mx-tx)/z,iy:(my-ty)/z};downAt=null;}};
  const onMove=e=>{const p=pts.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(pts.size>=2&&pinch){const [a,b]=[...pts.values()];const v=view();const mx=(a.x+b.x)/2-v.l,my=(a.y+b.y)/2-v.t;z=Math.max(minZ(),Math.min(MAXZ,pinch.z*Math.hypot(a.x-b.x,a.y-b.y)/pinch.d));tx=mx-pinch.ix*z;ty=my-pinch.iy*z;atFit=false;apply();}
    else if(pts.size===1){tx+=dx;ty+=dy;if(downAt)downAt.moved+=Math.abs(dx)+Math.abs(dy);if(Math.abs(dx)+Math.abs(dy)>0)atFit=false;apply();}};
  const onUp=e=>{if(!pts.has(e.pointerId))return;pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(!pts.size)stage.classList.remove('drag');
    if(e.pointerType!=='mouse'&&downAt&&!pts.size&&downAt.moved<12&&performance.now()-downAt.t<300){const now=performance.now(),v=view();
      if(lastTap&&now-lastTap.t<330&&Math.hypot(e.clientX-lastTap.x,e.clientY-lastTap.y)<36){dbl(e.clientX-v.l,e.clientY-v.t);lastTap=null;}else lastTap={t:now,x:e.clientX,y:e.clientY};}
    if(!pts.size)downAt=null;};
  const dbl=(x,y)=>{if(z>=MAXZ*.98)fitSmooth();else zoomTo(Math.max(z*2.5,Math.min(MAXZ,fitZ*3)),x,y,true);};
  const fitSmooth=()=>{const z0=z,x0=tx,y0=ty;const {v,pad,bar}=computeFit();const zt=fitZ,xt=(v.w-iw*zt)/2,yt=Math.max(pad*.5,(v.h-bar-ih*zt)/2);cancelAnimationFrame(anim);
    if(reduce){fitNow();return;}const t0=performance.now();const step=now=>{if(!alive)return;const t=Math.min(1,(now-t0)/200),e=1-Math.pow(1-t,3);z=z0+(zt-z0)*e;tx=x0+(xt-x0)*e;ty=y0+(yt-y0)*e;apply();if(t<1)anim=requestAnimationFrame(step);else atFit=true;};anim=requestAnimationFrame(step);};
  const onDbl=e=>{if(!iw)return;e.preventDefault();const v=view();dbl(e.clientX-v.l,e.clientY-v.t);};
  stage.addEventListener('pointerdown',onDown);stage.addEventListener('pointermove',onMove);stage.addEventListener('pointerup',onUp);stage.addEventListener('pointercancel',onUp);stage.addEventListener('lostpointercapture',onUp);stage.addEventListener('dblclick',onDbl);
  /* buttons */
  root.querySelector('.artv-bar').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!iw)return;const [cx,cy]=centre();
    if(b.dataset.z==='in')zoomTo(z*1.6,cx,cy,true);else if(b.dataset.z==='out')zoomTo(z/1.6,cx,cy,true);else if(b.dataset.z==='fit')fitSmooth();
    else if(b.dataset.side){for(const o of root.querySelectorAll('[data-side]'))o.setAttribute('aria-pressed',String(o===b));show(b.dataset.side==='back'?act.back:act.img);}
    stage.focus({preventScroll:true});});
  /* keys: + - 0 and the arrows (Esc is the planet's own: it closes #house and returns to town) */
  const onKey=e=>{if(!alive||!iw||e.ctrlKey||e.metaKey||e.altKey)return;const [cx,cy]=centre();let used=true;
    if(e.key==='+'||e.key==='=')zoomTo(z*1.4,cx,cy,true);else if(e.key==='-'||e.key==='_')zoomTo(z/1.4,cx,cy,true);else if(e.key==='0')fitSmooth();
    else if(e.key==='ArrowLeft'){tx+=90;atFit=false;apply();}else if(e.key==='ArrowRight'){tx-=90;atFit=false;apply();}else if(e.key==='ArrowUp'){ty+=90;atFit=false;apply();}else if(e.key==='ArrowDown'){ty-=90;atFit=false;apply();}else used=false;
    if(used)e.preventDefault();};
  window.addEventListener('keydown',onKey);
  const onResize=()=>{if(!iw)return;if(atFit)fitNow();else{computeFit();apply();}};window.addEventListener('resize',onResize);
  let ro=null;if(window.ResizeObserver){ro=new ResizeObserver(onResize);ro.observe(stage);}
  setTimeout(()=>{if(alive)stage.focus({preventScroll:true});},0);
  return ()=>{alive=false;cancelAnimationFrame(anim);window.removeEventListener('keydown',onKey);window.removeEventListener('resize',onResize);if(ro)ro.disconnect();stage.removeEventListener('wheel',onWheel);im.onload=im.onerror=null;};}
ROOMS.art=artRoom;

/* ============================== start ============================== */
ART.trace=traceOutline;
(function wait(t){const G=window.GAME;if(G&&window.THREE&&G.scene&&G.ROADS&&G.ROADS.length){go();return;}if(t>600){console.warn('art: the game never loaded');return;}setTimeout(()=>wait(t+1),250);})(0);
function go(){const run=async()=>{for(const s of SCULPTURES){try{await build(s);}catch(e){console.warn('art: '+s.id+' was not built:',e&&e.message||e);}}ART.ready=true;};
  (window.requestIdleCallback?cb=>requestIdleCallback(cb,{timeout:2500}):cb=>setTimeout(cb,600))(()=>{run();});}
})();
