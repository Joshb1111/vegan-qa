/* The Earthlings activists: Josh's four characters at the protest on the main street (atS(ROADS[0],102), by the chalk).
   Loaded by planet.html's protest(). Each is a resident you can talk to (pushed into GAME.npcs, so the game's own
   "Talk to …" prompt, chat, /api/ask and voice handle them; n.voice names their hosted voice), and each has a little will of their own:
     protest  stand at their spot holding their placard in front of the chest
     walk     placard set down on the road at their spot, walk somewhere along the street (within ~25 m), linger, come back
     chat     two of them meet in the street, stand facing each other and talk for a while
   At least two stay at the protest at any time. While the player is beside or talking to one, that one stops (n.paused).
   Models (assets/act_<key>.glb): Josh's Tripo meshes rigged in Blender on a skeleton of their own, arms weighted to arm geometry
   only (a hand resting on the trousers never pulls them), carrying just two clips authored on each rig's rest pose:
   'idle' (standing, breathing) and 'walk'. Nothing else moves: no gestures, waves, stretches, head turns or bubbles.
   The rig's node carries walkTravel/walkDur (model units per cycle), so the walk plays at the speed they move. */
(function(){'use strict';
const G=window.GAME;if(!G||!window.THREE){return;}
const T=THREE,{npcs,ROADS,atS,offsetFrom,lonLatOf,placeOn,yawFor,gAt,R,solids,LITE,MIN}=G;
const M=ROADS[0],S0=102,RANGE=25,SPEED=1.05,V='?v=2';
/* spot: [lane across the street, metres along it from S0, facing +1 up the street / -1 down it]. Two pairs back to back, each pair
   side by side, so every placard faces open street and nobody holds theirs at someone's back (or at the back of the screen, as Jo did
   when the front pair stood one behind the other with the screen between them). Sam and Jay face the way you come in from the
   'Spawn at the Earthlings protest' stop (s 96.5, facing up the street); the screen stands beside Jay, facing the same way */
const CAST=[
  {key:'jo',name:'Jo',voice:'Jo',h:1.7,spot:[-.6,.6,1],sign:['EVERY','ANIMAL IS','A SUBJECT','OF A LIFE'],
   sub:'Earthlings activist',greet:'Hi! We’re out here for the animals today. Ask me anything about veganism.',
   chips:['Is veganism about suffering?','What does “exploitation” actually mean?','Is honey vegan?'],pitch:1.12,rate:1.02,voiceWish:'Tessa'},
  {key:'josh',name:'Josh',voice:'Josh',h:1.8,spot:[.6,.6,1],sign:['NO EXCUSE','FOR','ANIMAL USE'],
   sub:'Earthlings activist',greet:'Hey. Got a question about veganism? Ask me, I’ll give you a straight answer.',
   chips:['Isn’t veganism just a diet?','Why do vegans say animals are “property”?','Isn’t eating animals natural?'],pitch:.95,rate:1,voiceWish:'Arthur'},
  {key:'sam',name:'Sam\u200b',voice:'Sam the activist',drop:6,h:1.8,spot:[-.6,-.6,-1],sign:['ANIMALS','ARE NOT','PROPERTY'],
   sub:'Earthlings activist',greet:'Hi there. Animals are not ours to use. Ask me anything you like.',
   chips:['What’s wrong with free-range eggs?','Isn’t veganism extreme?','What’s the welfare trap?'],pitch:.9,rate:.98,voiceWish:'Alex'},
  {key:'jay',name:'Jay',h:1.78,spot:[.6,-.6,-1],sign:['ANIMALS','DO NOT','EXIST FOR','HUMANS'],
   sub:'Earthlings activist',greet:'Alright? We’re showing Earthlings by the screen. Ask me anything about veganism.',
   chips:['Is lab-grown flesh vegan?','Isn’t it enough to just eat less “meat”?','Are zoos exploitation?'],pitch:.85,rate:.96,voiceWish:'Daniel'},
  {key:'moon',name:'Moon',talk:false,h:1.65,spot:[-1.85,.6,1],sign:['ANIMALS','ARE NOT','OURS TO USE'], /* talk:false: not a resident you can talk to yet (Josh); set true (and give her a voice) to switch it on */
   sub:'Earthlings activist',greet:'Hi! I’m Moon. Ask me anything about veganism.',chips:['What does veganism mean?','Why is using animals wrong?','Where do I start?'],pitch:1.15,rate:1.02,voiceWish:'Samantha'},
];
const SCREEN=[1.85,-.6,-1]; /* the screen: [lane, along, facing] as a spot: beside Jay, its edge 0.7 m from his placard's */
const rnd=(a,b)=>a+Math.random()*(b-a);
const _m=new T.Matrix4(),_mb=new T.Matrix4(),_s=new T.Vector3(),_p=new T.Vector3(),_v=new T.Vector3(),_u=new T.Vector3(),_n=new T.Vector3(),_e=new T.Vector3(),_w=new T.Vector3(),_d=new T.Vector3(),_c=new T.Vector3(),_t=new T.Vector3(),_qc=new T.Quaternion(),_qu=new T.Quaternion(),_qf=new T.Quaternion(),_qi=new T.Quaternion(),_qs=new T.Quaternion(),_pp=new T.Vector3(),_pq=new T.Quaternion();
const A={actors:[],log:[],ready:0,screen:null};window.__activists=A;
/* ---------- look: the props' toon shading with the ink pass's outlines; the cards are drawn flat ---------- */
const grad=(()=>{const d=new Uint8Array([204,204,204,255,204,204,204,255,255,255,255,255]);const t=new T.DataTexture(d,3,1,T.RGBAFormat);t.minFilter=t.magFilter=T.NearestFilter;t.needsUpdate=true;return t;})();
const toon=c=>new T.MeshToonMaterial({color:c,gradientMap:grad});
const box=(w,h,d,c)=>new T.Mesh(new T.BoxGeometry(w,h,d),toon(c));
function card(lines,w,h,bg,fg,size,emoji){const cv=document.createElement('canvas');cv.width=256;cv.height=Math.round(256*h/w);const g=cv.getContext('2d');
  const paint=()=>{g.fillStyle=bg;g.fillRect(0,0,cv.width,cv.height);g.textAlign='center';g.textBaseline='middle';let y0=cv.height/2;
    if(emoji){g.font='84px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';g.fillText(emoji,128,cv.height*.4);y0=cv.height*.8;}
    g.fillStyle=fg;g.font='900 '+size+'px "Archivo Black","Arial Black",Impact,sans-serif';const lh=size*1.12;lines.forEach((l,i)=>g.fillText(l,128,y0+(i-(lines.length-1)/2)*lh,240));tex.needsUpdate=true;};
  const tex=new T.CanvasTexture(cv);paint();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(paint);
  const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));m.userData.noInk=true;return m;}
function placard(lines){const it=new T.Group();it.add(box(.66,.86,.03,0xe9e4d8));const f=card(lines,.62,.82,'#f7f4ee','#14181c',40);f.position.z=.02;it.add(f);
  it.name='placard';it.userData.noCull=true;return it;} /* never horizon-culled: the planet's cull hid one lying over the horizon, and it stayed hidden once picked up (in the hands it's no longer a scene child, so the cull never showed it again) */
/* ---------- the street: positions are (s along the main road, lane across it in metres) ---------- */
const C=atS(M,S0);
const at=(s,lane)=>offsetFrom(atS(M,s),lane);
const spotSL=([ac,al])=>[S0+al,ac];
let near=[],nearAt=0,nearN=-1;
function nearSolids(){const c=C.n.clone().multiplyScalar(R);near=solids.filter(so=>!so.act&&so.c&&so.c.distanceTo(c)-(so.r!==undefined?so.r:Math.hypot(so.hx||0,so.hz||0))<RANGE+8); /* a house's box reaches the street from a centre well back from it */nearAt=performance.now();nearN=solids.length;}
const fresh=()=>{if(solids.length!==nearN||performance.now()-nearAt>8000)nearSolids();}; /* props and their solids stream in for a while after the start */
function hits(p,m){ /* p: a point at radius R; m: clearance */
  for(const so of near){if(Math.abs(so.c.x-p.x)>16||Math.abs(so.c.y-p.y)>16||Math.abs(so.c.z-p.z)>16)continue; /* as the game's own test: a box seen from the far side of the planet would project onto the street */
    const d=p.clone().sub(so.c);if(so.r!==undefined){const up=p.clone().normalize();d.addScaledVector(up,-d.dot(up));if(d.length()<so.r+m)return true;continue;}
    if(so.X&&Math.abs(d.dot(so.X))<so.hx+m&&Math.abs(d.dot(so.Z))<so.hz+m)return true;}return false;}
/* a straight walk in (s, lane) is clear of the street's solids and of the others standing about (not the walkers: they move on) */
function clear(s0,l0,s1,l1,self){const L=Math.hypot(s1-s0,l1-l0),n=Math.max(1,Math.ceil(L/.5));
  for(let i=1;i<=n;i++){const f=i/n,ps=s0+(s1-s0)*f,pl=l0+(l1-l0)*f;if(hits(at(ps,pl).multiplyScalar(R),.38))return false;
    if(L*f>.45)for(const b of A.actors)if(b!==self&&b.st!=='walk'&&Math.hypot(b.s-ps,b.lane-pl)<.7)return false;}return true;}
/* the way there: straight if it is clear, else round one corner (beside the screen, the others, a pole) */
function route(a,s1,l1){fresh();if(clear(a.s,a.lane,s1,l1,a))return [[s1,l1]];const W=lanes()-.5,ms=(a.s+s1)/2;
  const cand=[[ms,W],[ms,-W],[ms,0],[a.s,a.lane+1.5],[a.s,a.lane-1.5],[s1+1.6*Math.sign(s1-a.s||1),l1],[s1,l1+1.5],[s1,l1-1.5],[a.s+1.6*Math.sign(s1-a.s||1),a.lane+1.4],[a.s+1.6*Math.sign(s1-a.s||1),a.lane-1.4]];
  for(const w of cand)if(Math.abs(w[1])<=lanes()&&clear(a.s,a.lane,w[0],w[1],a)&&clear(w[0],w[1],s1,l1,a))return [w,[s1,l1]];return null;}
const lanes=()=>(M.halfW||3)+1.3; /* the carriageway and the inner edge of the pavement: clear of shop fronts, poles and bins */
function pickTarget(a){fresh();
  for(let k=0;k<12;k++){const s=S0+rnd(-RANGE,RANGE),l=(Math.random()<.5?-1:1)*rnd(lanes()-1.8,lanes());if(Math.abs(s-S0)<4&&Math.abs(l)<2.2)continue; /* not into the protest itself */
    const r=route(a,s,l);if(r)return r;}return null;}
/* ---------- one activist ---------- */
function makeActor(cfg,gltf){const root=gltf.scene;
  root.traverse(m=>{if(m.isMesh){const old=m.material;if(old.map){old.map.encoding=T.LinearEncoding;old.map.needsUpdate=true;}
    m.material=new T.MeshBasicMaterial({map:old.map||null,color:old.map?0xffffff:old.color,skinning:!!m.isSkinnedMesh,side:T.DoubleSide});m.frustumCulled=false;m.castShadow=!LITE;m.userData.noInk=true;}}); /* drawn like the other residents */
  const bb=new T.Box3().setFromObject(root),sc=cfg.h/(bb.max.y-bb.min.y);root.scale.setScalar(sc);root.position.y=-bb.min.y*sc;root.rotation.y=Math.PI; /* the model faces +Z, a rig faces -Z */
  const group=new T.Group();group.name='activist-'+cfg.key;group.add(root);
  const mixer=new T.AnimationMixer(root),act={},clip={};
  for(const c of gltf.animations||[])clip[c.name]=c;
  if(!clip.idle||!clip.walk)throw new Error('clips missing in act_'+cfg.key+'.glb');
  for(const k of ['idle','walk']){act[k]=mixer.clipAction(clip[k]);act[k].setLoop(T.LoopRepeat,Infinity);act[k].play();act[k].setEffectiveWeight(k==='idle'?1:0);act[k].time=Math.random()*clip[k].duration;}
  const post=postAdjust(root,cfg,mixer,act);
  let rigInfo=null;root.traverse(o=>{if(!rigInfo&&o.userData&&o.userData.walkTravel)rigInfo=o.userData;});
  const natural=rigInfo?rigInfo.walkTravel*sc/rigInfo.walkDur:.66*cfg.h/1.1; /* metres per second the walk clip covers at timeScale 1 */
  const sign=placard(cfg.sign);
  const [s,lane]=spotSL(cfg.spot);
  const n={name:cfg.name,voice:cfg.voice,sub:cfg.sub,greet:cfg.greet,chips:cfg.chips,pitch:cfg.pitch,rate:cfg.rate,voiceWish:cfg.voiceWish,id:'act-'+cfg.key,activist:true,
    rig:{group,pose(){}},lon:0,lat:0,yaw:0,walker:false,s:0,lane:0,dir:1,speed:0,facing:null,session:'planet-'+Math.random().toString(36).slice(2)};
  /* the game's resident loader gives every entry of npcs a model of its own (planet.html: NPC_MODELS, by name or index) and hides
     the stand-in. These bring their own: anything handed over is put away, and the group shown again */
  Object.defineProperty(n,'model',{configurable:true,get(){return undefined;},set(v){try{if(v&&v.holder&&v.holder.parent)v.holder.parent.remove(v.holder);if(v&&v.mixer)v.mixer.stopAllAction();}catch(e){}
    Promise.resolve().then(()=>{group.visible=true;G.dirty();});}});
  const a={cfg,n,group,root,mixer,act,natural,sign,post,holding:true,home:[s,lane],homeYaw:0,s,lane,st:'protest',goal:null,t:rnd(10,40),tgt:null,partner:null,walkW:0,
    solid:{c:new T.Vector3(),r:.3,act:1},lastYaw:0,turnW:0};
  const [lo,la]=lonLatOf(at(s,lane));a.homeYaw=yawFor(lo,la,C.t.clone().multiplyScalar(-cfg.spot[2])); /* rows face up and down the street, as the old demo */
  n.yaw=a.homeYaw;setPos(a);
  hold(a,true);placeOn(group,n.lon,n.lat,n.yaw);solids.push(a.solid);
  return a;}
function setPos(a){const [lo,la]=lonLatOf(at(a.s,a.lane));a.n.lon=lo;a.n.lat=la;a.n.s=a.s;a.solid.c.copy(at(a.s,a.lane)).multiplyScalar(R);}
function faceDir(a,ds,dl){const sm=atS(M,a.s);const f=sm.t.clone().multiplyScalar(ds).addScaledVector(sm.side,dl);if(f.lengthSq()<1e-8)return a.n.yaw;return yawFor(a.n.lon,a.n.lat,f.normalize().negate());}
function turnTo(a,y,dt,k){let d=y-a.n.yaw;d=((d+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;a.n.yaw+=d*Math.min(1,dt*k);}
/* the placard: in both hands at the chest (the hold pose, below), or lying face up on the road just in front of their spot */
function hold(a,on){const g=a.sign;let from=null;
  if(on&&g.parent&&g.parent!==a.group){g.updateMatrixWorld(true);from=g.matrixWorld.clone();} /* picked up: it stays where it lies (in the world) while they turn to the street, then rises into the hands */
  if(g.parent)g.parent.remove(g);g.visible=true;g.rotation.set(0,0,0);g.position.set(0,0,0);g.scale.setScalar(1);a.pick=null;
  if(on){const I=a.post.ik;g.position.set(I?I.cx:0,I?I.H:1.04,I?-I.z:-.36);g.rotation.y=Math.PI;a.group.add(g);if(from&&I){a.pick=from;a.group.updateMatrixWorld(true);_m.copy(a.group.matrixWorld).invert().multiply(from).decompose(g.position,g.quaternion,_s);}}
  else{const dir=a.cfg.spot[2],[s,l]=a.home;const sm=atS(M,s+dir*.7);const p=offsetFrom(sm,l+rnd(-.2,.2));const [lo,la]=lonLatOf(p); /* in front of them, on the open side: the pairs stand back to back */
    placeOn(g,lo,la,a.homeYaw+rnd(-.35,.35));let hmax=0;for(const [dx,dz] of [[-.4,-.6],[.4,-.6],[-.4,.6],[.4,.6]]){const q=p.clone().addScaledVector(sm.t,dz/R).addScaledVector(sm.side,dx/R).normalize();hmax=Math.max(hmax,gAt(q)-gAt(p));}
    g.rotateX(-Math.PI/2);g.position.addScaledVector(p,.05+Math.max(0,hmax));g.updateMatrixWorld(true);}
  a.holding=on;G.dirty();}
/* ---------- the screen: stands on its own beside Jay, at the street side of the pair facing down the street, and faces as they do ---------- */
function screen(){const g=new T.Group();g.name='protest-screen';
  const fr=box(1.08,.7,.05,0x1b1f23);fr.position.y=1.32;g.add(fr);const scr=card(['SOMEONE,','NOT SOMETHING'],1.0,.62,'#2c2417','#f3efe4',22,'🐄');scr.position.set(0,1.32,.03);g.add(scr);
  for(const x of [-.38,.38]){const leg=box(.045,1.0,.045,0x2a3036);leg.position.set(x,.5,-.02);g.add(leg);const ft=box(.09,.04,.42,0x2a3036);ft.position.set(x,.02,-.02);g.add(ft);}
  const [s,l]=spotSL(SCREEN);const p=at(s,l),[lo,la]=lonLatOf(p);placeOn(g,lo,la,yawFor(lo,la,C.t.clone().multiplyScalar(SCREEN[2]))); /* built facing +Z: faces as the people beside it (yawFor turns a model's +Z to the direction given) */
  g.updateMatrixWorld(true);solids.push({c:p.clone().multiplyScalar(R),r:.45});A.screen=g;G.dirty();}
/* ---------- will ---------- */
const away=()=>A.actors.filter(a=>a.st!=='protest').length;
const busy=a=>!!a.n.paused; /* the game pauses whoever the player is beside or talking to */
function say(a,what){A.log.push([Math.round(performance.now()/1000),a.cfg.name,what]);if(A.log.length>200)A.log.shift();}
function go(a,goal,path){a.goal=goal;a.path=path.slice();a.tgt=a.path.shift();a.st='walk';a.stuck=0;if(a.holding)hold(a,false);say(a,goal+' -> '+path.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' > '));}
const goHome=a=>go(a,'home',route(a,a.home[0],a.home[1])||[a.home.slice()]); /* no clear way: straight home anyway (the spot itself is always free) */
function decide(a){
  if(a.st==='protest'){if(a.t>0)return;
    if(away()>=2){a.t=rnd(6,14);return;}
    const others=A.actors.filter(b=>b!==a&&b.st==='protest'&&!busy(b));
    if(away()===0&&others.length&&Math.random()<.4){const b=others[Math.floor(Math.random()*others.length)];
      for(let k=0;k<10;k++){const s=S0+rnd(-16,16),l=(Math.random()<.5?-1:1)*rnd(lanes()-2,lanes()-.6);if(Math.abs(s-S0)<5)continue;const s1=s-.6,s2=s+.6;
        const ra=route(a,s1,l),rb_=ra&&route(b,s2,l);if(ra&&rb_){a.partner=b;b.partner=a;go(a,'chat',ra);go(b,'chat',rb_);return;}}}
    const tg=pickTarget(a);if(tg)go(a,'wander',tg);else a.t=rnd(5,10);return;}
  if(a.st==='linger'&&a.t<=0){if(Math.random()<.3){const tg=pickTarget(a);if(tg){go(a,'wander',tg);return;}}goHome(a);return;}
  if(a.st==='chat'){const b=a.partner;if(b&&b.st==='walk'&&b.goal==='chat')a.t=Math.max(a.t,6); /* wait for them */else if(!b||b.st!=='chat')a.t=Math.min(a.t,rnd(1,3));
    if(a.t<=0){const p=a.partner;a.partner=null;if(p&&p.partner===a){p.partner=null;}
      if(Math.random()<.25){const tg=pickTarget(a);if(tg){go(a,'wander',tg);return;}}goHome(a);return;}}}
function arrive(a){if(a.path&&a.path.length){a.tgt=a.path.shift();return;} /* a corner on the way */
  const g=a.goal;a.tgt=null;
  if(g==='home'){a.s=a.home[0];a.lane=a.home[1];setPos(a);hold(a,true);a.st='protest';a.t=rnd(20,60);say(a,'back at the protest');return;}
  if(g==='chat'){a.st='chat';a.t=rnd(15,30);say(a,'chatting with '+(a.partner&&a.partner.cfg.name));return;}
  a.st='linger';a.t=rnd(8,22);say(a,'lingering');} /* stand where they are, facing the way they came: no looking about */
function step(a,dt){
  const paused=busy(a);
  let sp=0;
  if(!paused){a.t-=dt;
    if(a.st==='walk'&&a.tgt){const [ts,tl]=a.tgt;const ds=ts-a.s,dl=tl-a.lane,L=Math.hypot(ds,dl);
      if(L<.08){arrive(a);}
      else{const v=Math.min(SPEED,L/dt),k=v*dt/L;
        const ns=a.s+ds*k,nl=a.lane+dl*k;
        if(a.goal!=='home'&&hits(at(ns,nl).multiplyScalar(R),.3)&&L>1){a.stuck=(a.stuck||0)+dt;if(a.stuck>1.5){say(a,'blocked, heading home');goHome(a);}}
        else{a.s=ns;a.lane=nl;sp=v;turnTo(a,faceDir(a,ds,dl),dt,8);}
        setPos(a);}}
    else if(a.st==='protest')turnTo(a,a.homeYaw,dt,3);
    else if(a.st==='chat'&&a.partner){const b=a.partner;turnTo(a,faceDir(a,b.s-a.s,b.lane-a.lane),dt,3);}}
  /* the clips: walk while moving (or stepping round on the spot), idle otherwise */
  let dy=a.n.yaw-a.lastYaw;dy=((dy+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;a.lastYaw=a.n.yaw;
  const turning=dt>0&&Math.abs(dy)/dt>.7;a.turnW+=((turning?1:0)-a.turnW)*Math.min(1,dt*4);
  const want=sp>.1?1:Math.min(1,a.turnW*1.5)>.5?1:0;
  a.walkW+=(want-a.walkW)*Math.min(1,dt*6);a.act.walk.setEffectiveWeight(a.walkW);a.act.idle.setEffectiveWeight(1-a.walkW);
  a.act.walk.setEffectiveTimeScale(sp>.1?Math.max(.5,Math.min(2,sp/a.natural)):.6);}
/* ---------- after the clips: the arms swing about half as far (the sleeves are separate shells on these models: at full swing they
   opened at the armpit and showed the street through), and a per-character shoulder drop in degrees (Sam: 6, Josh asked for it) ---------- */
function postAdjust(root,cfg,mixer,act){let sk=null;root.traverse(m=>{if(!sk&&m.isSkinnedMesh)sk=m.skeleton;});const out={arms:[],add:[],damp:cfg.armDamp==null?.5:cfg.armDamp};if(!sk)return out;
  const B=n=>sk.bones.find(b=>b.name===n),arms=['L_Upperarm','R_Upperarm','L_Forearm','R_Forearm'].map(B).filter(Boolean),ti=act.idle.time,tw=act.walk.time;
  /* the arms' calm place = the skin's bind pose (the model as it was made, arms down). The idle doesn't key the arms, so with the walk
     faded out three.js falls back to the nodes' own rest rotations, and on Sam's file those are a T-pose: his arms went up when he stood */
  sk.pose();const bind=arms.map(b=>b.quaternion.clone());arms.forEach((b,j)=>out.arms.push([b,bind[j]]));out.ik=ikPrep(root,B);
  act.walk.setEffectiveWeight(0);act.idle.setEffectiveWeight(1);act.idle.time=0;mixer.update(0);arms.forEach((b,j)=>b.quaternion.copy(bind[j]));root.updateMatrixWorld(true);
  if(cfg.drop)for(const sd of ['L','R']){const cl=B(sd+'_Clavicle'),ua=B(sd+'_Upperarm');if(!cl||!ua)continue;const q0=cl.quaternion.clone(),y0=root.worldToLocal(ua.getWorldPosition(new T.Vector3())).y;let best=null,bd=1e9;
    const z0=root.worldToLocal(ua.getWorldPosition(new T.Vector3())).z;
    for(const ax of [[1,0,0],[0,1,0],[0,0,1]])for(const sg of [1,-1]){cl.quaternion.copy(q0).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(...ax),sg*.1));root.updateMatrixWorld(true);const p=root.worldToLocal(ua.getWorldPosition(new T.Vector3())),sc=(p.y-y0)+.5*Math.abs(p.z-z0);if(sc<bd){bd=sc;best=[ax,sg];}}
    cl.quaternion.copy(q0);root.updateMatrixWorld(true);if(best){const O=new T.Quaternion().setFromAxisAngle(new T.Vector3(...best[0]),best[1]*cfg.drop*Math.PI/180);out.add.push([cl,q0.clone().multiply(O),ua,O.clone().invert()]);}} /* the clips don't key the clavicles: set them outright each frame (multiplying in place added the drop again every frame) */ /* the shoulder drops; the arm is turned back by as much, so it still hangs as it did */
  act.idle.time=ti;act.walk.time=tw;return out;}
/* after the clips: standing, the arms rest at their calm place; walking, they swing half as far as the clip */
function postApply(a){const P=a.post,w=a.act.walk.getEffectiveWeight(),k=1-w*(1-P.damp);for(const [b,q] of P.arms)b.quaternion.slerp(q,k);for(const [b,q,u,qi] of P.add){b.quaternion.copy(q);u.quaternion.premultiply(qi);}}
/* ---------- the hold pose: both hands on the placard's side edges ----------
   An analytic two-bone IK per arm (upper arm + forearm; the hand bone is the wrist), worked in the group's frame (the character faces -Z).
   The aim is the middle of the hand's skin (measured once from the vertices weighted to the hand bone) on its edge of the placard; the
   wrist is sent to that point less the hand's offset as last solved, so the hand itself lands on the edge whatever the rig's proportions.
   The elbow bends towards a pole down, out and back, and each arm bone is turned from its bind pose by the rotation that carries the
   bind (bone direction, elbow axis) frame onto the solved one, so the forearm keeps the twist it was modelled with: the palms, which
   face the thighs in the bind pose, face the placard's edges. The hand keeps its bind angle to the forearm. Set outright after the clips
   and postApply (Sam's shoulder drop moves the shoulder and the arm is solved from wherever the shoulder is; the breathing still shows
   in the chest and head while the hands stay put). The placard is then placed from the two hands (midpoint, facing forward), so it
   sits in them. Blended in and out over 0.4 s when they pick it up or set it down; on pick-up the placard rises from the road into the
   hands over the same time. A few vector ops and two small matrix decompositions per arm per frame, only for those drawn nearby. */
const HOLD={drop:.43,z:.26,gx:.32,blend:.4,pole:[.35,-1,.55]}; /* hands this far under the shoulders (the placard's top then comes to the shoulders and leaves the face clear), its middle this far in front of them, the hands' middles this far out from it (its edges are at .33). Held higher or further out, the upper arms rise more and Jay's sleeve parts at the back of the armpit */
const basisQ=(d,n,q)=>q.setFromRotationMatrix(_mb.makeBasis(d,n,_c.crossVectors(d,n)));
function aim(I){for(const R_ of I.arms){R_.pole.set(R_.side*HOLD.pole[0],HOLD.pole[1],HOLD.pole[2]).normalize();R_.tg.set(I.cx+R_.side*HOLD.gx,I.sy-HOLD.drop,-HOLD.z);}I.H=I.sy-HOLD.drop;I.z=HOLD.z;}
A.HOLD=HOLD;A.retune=()=>{for(const a of A.actors)if(a.post.ik)aim(a.post.ik);};A.holdPose=(a,dt)=>holdPose(a,dt); /* tuning and timing from the console */
function ikPrep(root,B){const g=root.parent;let mesh=null;root.traverse(m=>{if(!mesh&&m.isSkinnedMesh)mesh=m;});if(!g||!mesh)return null;
  g.updateMatrixWorld(true);const gi=new T.Matrix4().copy(g.matrixWorld).invert(),F=new T.Vector3(0,0,-1),sk=mesh.skeleton,geo=mesh.geometry;
  const loc=b=>{const p=new T.Vector3(),q=new T.Quaternion();new T.Matrix4().multiplyMatrices(gi,b.matrixWorld).decompose(p,q,new T.Vector3());return {p,q};};
  const out={arms:[],cx:0,sy:0};
  for(const sd of ['L','R']){const up=B(sd+'_Upperarm'),fo=B(sd+'_Forearm'),ha=B(sd+'_Hand');if(!up||!fo||!ha||!up.parent)return null;
    const U=loc(up),Fo=loc(fo),H=loc(ha),du=Fo.p.clone().sub(U.p),df=H.p.clone().sub(Fo.p),l1=du.length(),l2=df.length();du.normalize();df.normalize();
    const pre=(d,q)=>basisQ(d,new T.Vector3().crossVectors(d,F).normalize(),new T.Quaternion()).invert().multiply(q); /* bind frame: the elbow axis is (bone x forward), as an arm bending forward has it */
    /* the middle of the hand's skin, in the hand bone's turned frame (group units) */
    const hi=sk.bones.indexOf(ha),P=geo.attributes.position,SI=geo.attributes.skinIndex,SW=geo.attributes.skinWeight,M_=new T.Matrix4().multiplyMatrices(gi,ha.matrixWorld).multiply(sk.boneInverses[hi]).multiply(mesh.bindMatrix),v=new T.Vector3(),hc=new T.Vector3();let cnt=0;
    for(let i=0;i<P.count;i++){let w=0;if(SI.getX(i)===hi)w+=SW.getX(i);if(SI.getY(i)===hi)w+=SW.getY(i);if(SI.getZ(i)===hi)w+=SW.getZ(i);if(SI.getW(i)===hi)w+=SW.getW(i);if(w>.5){hc.add(v.fromBufferAttribute(P,i).applyMatrix4(M_));cnt++;}}
    if(cnt)hc.multiplyScalar(1/cnt).sub(H.p).applyQuaternion(H.q.clone().invert());else hc.copy(df).multiplyScalar(.08).applyQuaternion(H.q.clone().invert());
    const side=U.p.x<0?-1:1;out.arms.push({side,up,fo,ha,l1,l2,pu:pre(du,U.q),pf:pre(df,Fo.q),hq:ha.quaternion.clone(),hc,off:new T.Vector3(),pole:new T.Vector3(),tg:new T.Vector3(),grip:new T.Vector3()});
    out.sy+=U.p.y/2;out.cx+=U.p.x/2;}
  aim(out);return out;}
function holdPose(a,dt){const I=a.post.ik;if(!I)return;const g=a.sign,inHand=a.holding&&g.parent===a.group;
  let dy=a.n.yaw-a.homeYaw;dy=Math.abs(((dy+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI);
  const want=a.holding&&!(a.pick&&a.hw<=0&&dy>.35)?1:0; /* back at their spot, they face the street before they reach for it */
  if(a.hw==null)a.hw=want;a.hw+=Math.max(-dt/HOLD.blend,Math.min(dt/HOLD.blend,want-a.hw));
  _m.copy(a.group.matrixWorld).invert(); /* everything below in the group's frame */
  if(inHand&&a.pick)_mb.multiplyMatrices(_m,a.pick).decompose(_pp,_pq,_s); /* where it lies, as seen from them now */
  if(a.hw<=0){if(inHand&&a.pick){g.position.copy(_pp);g.quaternion.copy(_pq);}return;}const w=a.hw*a.hw*(3-2*a.hw);
  a.root.updateMatrixWorld(true);
  for(const R_ of I.arms){const {up,fo,ha,l1,l2}=R_;
    _p.setFromMatrixPosition(up.matrixWorld).applyMatrix4(_m); /* the shoulder, as the clips and the drop left it */
    _mb.multiplyMatrices(_m,up.parent.matrixWorld).decompose(_t,_qc,_s); /* the clavicle's turn in the group's frame */
    _d.subVectors(R_.tg,R_.off).sub(_p);const dist=_d.length(),dc=Math.min(Math.max(dist,Math.abs(l1-l2)+1e-3),(l1+l2)*.999);_u.copy(_d).divideScalar(dist||1);
    const ea=(l1*l1-l2*l2+dc*dc)/(2*dc),eh=Math.sqrt(Math.max(0,l1*l1-ea*ea));
    _v.copy(R_.pole).addScaledVector(_u,-R_.pole.dot(_u));if(_v.lengthSq()<1e-6)_v.set(R_.side,0,0);_v.normalize();
    _e.copy(_p).addScaledVector(_u,ea).addScaledVector(_v,eh); /* elbow */_w.copy(_p).addScaledVector(_u,dc); /* wrist */
    _n.crossVectors(_v,_u).normalize(); /* elbow axis */
    _d.subVectors(_e,_p).divideScalar(l1);basisQ(_d,_n,_qu).multiply(R_.pu);
    _d.subVectors(_w,_e).divideScalar(l2);basisQ(_d,_n,_qf).multiply(R_.pf);
    R_.off.copy(R_.hc).applyQuaternion(_qs.copy(_qf).multiply(R_.hq));R_.grip.copy(_w).add(R_.off); /* where the hand is: next frame's wrist aim allows for it */
    _qs.copy(_qc).invert().multiply(_qu);up.quaternion.slerp(_qs,w);
    _qs.copy(_qu).invert().multiply(_qf);fo.quaternion.slerp(_qs,w);ha.quaternion.slerp(R_.hq,w);}
  if(!inHand)return;
  _t.addVectors(I.arms[0].grip,I.arms[1].grip).multiplyScalar(.5);_qi.set(0,1,0,0); /* between the hands, facing forward */
  if(a.pick&&a.hw<1){const r=Math.min(1,a.hw*2),wr=r*r*(3-2*r);g.position.lerpVectors(_pp,_t,w);g.quaternion.copy(_pq).slerp(_qi,wr);} /* it stands up in the first half, out in front, then comes up to the hands: turning all the way it swept through their legs */else{a.pick=null;g.position.copy(_t);g.quaternion.copy(_qi);}}
/* ---------- the loop: will every frame for the walkers, decisions four times a second, animation only when in view ---------- */
let last=performance.now(),acc=0;
function tick(now){requestAnimationFrame(tick);const dt=Math.min(.1,(now-last)/1000);last=now;if(!A.actors.length)return;
  acc+=dt;const decideNow=acc>=.25;if(decideNow)acc=0;
  const pl=G.player();
  for(const a of A.actors){step(a,dt);if(decideNow&&!busy(a))decide(a);
    const far=a.group.position.distanceTo(pl);if(a.group.visible&&far<(MIN?35:LITE?55:80)){a.mixer.update(dt);postApply(a);holdPose(a,dt);}}}
/* ---------- loading ---------- */
function start(){if(!T.GLTFLoader){setTimeout(start,400);return;}
  screen();nearSolids();
  const ld=new T.GLTFLoader();
  CAST.forEach(cfg=>ld.load('assets/act_'+cfg.key+'.glb'+V,g=>{try{const a=makeActor(cfg,g);a.lastYaw=a.n.yaw;A.actors.push(a);if(cfg.talk!==false)npcs.push(a.n); /* only residents in npcs get the game's Talk prompt */A.ready++;G.dirty();}catch(e){console.warn('activist not placed',cfg.key,e);}},undefined,e=>console.warn('activist not loaded',cfg.key,e)));
  requestAnimationFrame(tick);}
A.force=(name,what)=>{const a=A.actors.find(x=>x.cfg.name===name);if(!a)return 'no '+name;
  if(what==='wander'){const tg=pickTarget(a);if(!tg)return 'no path';go(a,'wander',tg);return 'wandering';}
  if(what==='home'){goHome(a);return 'going home';}
  if(what==='chat'){const b=A.actors.find(x=>x!==a&&x.st==='protest');if(!b)return 'nobody';const s=S0+(a.s>S0?9:-9),l=0,ra=route(a,s-.6,l),rb_=route(b,s+.6,l);if(!ra||!rb_)return 'no path';a.partner=b;b.partner=a;go(a,'chat',ra);go(b,'chat',rb_);return 'chat with '+b.cfg.name;}
  return '?';};
A.sim=sec=>{for(let t=0;t<sec;t+=.05){for(const a of A.actors){step(a,.05);}if(Math.round(t/.05)%5===0)for(const a of A.actors)if(!busy(a))decide(a);}return A.state();}; /* testing: run their will forward without drawing */
A.state=()=>A.actors.map(a=>[a.cfg.name,a.st,a.goal,+a.s.toFixed(1),+a.lane.toFixed(1),a.holding?'holding':'sign down',a.n.paused?'paused':'']);
start();
})();
