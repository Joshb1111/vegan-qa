import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Exercise the actual functions in the shipped HTML without needing a GPU or live APIs.
const html=readFileSync(new URL('../public/planet.html',import.meta.url),'utf8');
function section(start,end){const a=html.indexOf(start);assert.ok(a>=0,start);const b=html.indexOf(end,a);assert.ok(b>a,end);return html.slice(a,b);}
function run(code,scope){return vm.runInNewContext(code,scope);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const askCode=section('let activeAsk=null;',"\n$('#ask').addEventListener");
function chatScope(){
  const requests=[],spoken=[],timers=new Map();let next=0;
  const scope={AbortController, talking:{name:'A',session:'a'},q:{value:''},send:{disabled:false},chips:{hidden:false},ANSWERS:{},API:'/api/ask',
    setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id),
    fetch:(url,options)=>{const d=deferred();requests.push({...d,options});return d.promise;},
    unlockAudio(){},meBubble(){},thinkingBubble(){},stopSpeech(){},normQ:s=>s.toLowerCase(),esc:s=>s,
    say:(...args)=>spoken.push(args)};
  run(askCode,scope);return {scope,requests,spoken,timers};
}
const response=answer=>({ok:true,status:200,json:async()=>({answer})});

test('the complete inline game script parses',()=>{
  const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(s=>s.trim());
  assert.ok(scripts.length);for(const script of scripts)new vm.Script(script);
});
test('leaving chat aborts the request and ignores a late successful reply',async()=>{
  const {scope:s,requests,spoken,timers}=chatScope();const pending=s.ask('hello');s.cancelAsk();s.talking=null;
  assert.equal(requests[0].options.signal.aborted,true);assert.equal(timers.size,0);
  requests[0].resolve(response('late answer'));await pending;
  assert.equal(spoken.length,0);assert.equal(s.send.disabled,false);
});
test('an old reply cannot speak or unlock a newer conversation',async()=>{
  const {scope:s,requests,spoken}=chatScope();const a=s.ask('first');s.cancelAsk();s.talking={name:'B',session:'b'};
  const b=s.ask('second');requests[0].resolve(response('old'));await a;
  assert.equal(spoken.length,0);assert.equal(s.send.disabled,true);assert.equal(s.chips.hidden,true);
  requests[1].resolve(response('new'));await b;
  assert.equal(spoken[0][0],'new');assert.equal(spoken[0][1].name,'B');assert.equal(s.send.disabled,false);
});
test('duplicate submissions are ignored until the answer completes',async()=>{
  const {scope:s,requests}=chatScope();const a=s.ask('first');await s.ask('second');assert.equal(requests.length,1);
  requests[0].resolve(response('answer'));await a;assert.equal(s.send.disabled,false);
});
test('leaving while a response body is pending suppresses that body',async()=>{
  const {scope:s,requests,spoken}=chatScope();const body=deferred();const pending=s.ask('hello');
  requests[0].resolve({ok:true,status:200,json:()=>body.promise});await Promise.resolve();s.cancelAsk();s.talking=null;
  body.resolve({answer:'late body'});await pending;assert.equal(spoken.length,0);
});
test('cached answers are immediate, escaped and require no network',async()=>{
  const {scope:s,requests,spoken,timers}=chatScope();s.ANSWERS.hello={answer:'cached',key:'key'};s.esc=x=>'escaped '+x;
  await s.ask('HELLO');assert.equal(requests.length,0);assert.equal(timers.size,0);assert.equal(spoken[0][0],'escaped cached');assert.equal(spoken[0][3],'key');
});
test('timeouts restore controls and show a useful error',async()=>{
  const {scope:s,requests,spoken,timers}=chatScope();const pending=s.ask('hello');[...timers.values()][0]();
  assert.equal(requests[0].options.signal.aborted,true);requests[0].reject(Object.assign(new Error(),{name:'AbortError'}));await pending;
  assert.match(spoken[0][0],/too long/);assert.equal(s.send.disabled,false);assert.equal(timers.size,0);
});
test('late rate-limit replies are ignored when the user has left',async()=>{
  const {scope:s,requests,spoken}=chatScope();const body=deferred();const pending=s.ask('hello');
  requests[0].resolve({status:429,json:()=>body.promise});await Promise.resolve();s.cancelAsk();s.talking=null;
  body.resolve({error:'limit'});await pending;assert.equal(spoken.length,0);
});

const inkCode=section('function renderInk(){','\n\n\nlet seed=');
for(const throws of [false,true])test(`outline pass restores visibility and materials${throws?' after a render error':''}`,()=>{
  const hidden={visible:false},shown={visible:true},material={original:true},mesh={material,userData:{}};
  let calls=0;const s={sceneDirty:false,cullHorizon(){},refreshMeshes(){},shadowCap:{visible:false},scene:{background:'old sky'},skyCol:'sky',camera:{},
    hideInNormals:[hidden,shown],meshList:[mesh],nmPlain:{normal:true},nmRoad:{},nmFlatSkin:{},nmFlat:{},nmSkin:{},normalBg:'normal',rt:{},rtN:{},quadScene:{},quadCam:{},
    renderer:{shadowMap:{},target:null,setRenderTarget(x){this.target=x;},render(){if(++calls===2){assert.equal(hidden.visible,false);assert.equal(shown.visible,false);if(throws)throw Error('draw failed');}}}};
  run(inkCode,s);if(throws)assert.throws(()=>s.renderInk(),/draw failed/);else s.renderInk();
  assert.equal(hidden.visible,false);assert.equal(shown.visible,true);assert.equal(s.shadowCap.visible,false);
  assert.equal(mesh.material,material);assert.equal(s.scene.background,'sky');assert.equal(s.renderer.target,null);
});

const lossCode=section("renderer.domElement.addEventListener('webglcontextlost'",'\nconst DPR=');
for(const quality of ['full','lite','min'])test(`context loss recovers safely at ${quality}, even without storage`,()=>{
  let handler,destination,error;
  const s={QUALITY:quality,URL,renderer:{domElement:{addEventListener:(type,fn)=>{handler=fn;}}},localStorage:{setItem(){throw Error('blocked');}},
    location:{href:'https://example.test/planet.html?full&lite&look=0#town',replace:u=>destination=u},showGraphicsError:m=>error=m};
  run(lossCode,s);let prevented=false;handler({preventDefault(){prevented=true;}});assert.equal(prevented,true);
  if(quality==='min'){assert.equal(destination,undefined);assert.match(error,/Low/);}
  else{const url=new URL(destination);assert.equal(url.searchParams.has('full'),false);assert.equal(url.searchParams.has(quality==='full'?'lite':'min'),true);assert.equal(url.searchParams.get('look'),'0');assert.equal(url.hash,'#town');}
});

test('graphics startup failure shows a reload action instead of throwing out of boot',()=>{
  const elements=new Map();const el=()=>({classList:{remove(){}},style:{},events:{},setAttribute(){},focus(){},addEventListener(k,fn){this.events[k]=fn;}});
  for(const id of ['#title','#title-p','#enter','#title-gfx'])elements.set(id,el());
  const s={$:id=>elements.get(id),console:{warn(){}},THREE:{WebGLRenderer:class{constructor(){throw Error('No GPU');}}},canvas:{},location:{reload(){}}};
  const helper=section('function showGraphicsError(message){','\nif(!window.THREE)');
  const boot=section('let renderer;','\nconst COARSE=');
  run(helper+'\n(function(){'+boot+'})()',s);
  assert.match(elements.get('#title-p').textContent,/could not start/);assert.equal(elements.get('#enter').textContent,'Reload');assert.equal(elements.get('#title-gfx').hidden,true);
});

test('departing avatars release owned resources and preserve shared ones',()=>{
  function disposable(){return {count:0,dispose(){this.count++;}};}
  const owned=disposable(),sharedTexture=disposable(),sharedGeometry=disposable(),sharedDeckMaterial=disposable(),bone=disposable(),labelMap=disposable();owned.map=sharedTexture;
  const label={material:Object.assign(disposable(),{map:labelMap})},emote={material:Object.assign(disposable(),{map:sharedTexture})};
  const mesh={isMesh:true,material:[owned,owned],geometry:sharedGeometry,skeleton:bone};const root={traverse:fn=>{fn(mesh);}};
  const holder={traverse:fn=>{for(const o of [root,mesh,label,emote])fn(o);}};
  const mixer={stopped:0,uncached:null,stopAllAction(){this.stopped++;},uncacheRoot(r){this.uncached=r;}};
  const deck={geometry:disposable(),material:sharedDeckMaterial},wingGeometry=disposable();
  const av={root,holder,mixer,label,emote,deck,wings:{model:false,g:{traverse:fn=>fn({isMesh:true,geometry:wingGeometry})}}};
  const retained={};const s={scene:{remove(o){assert.equal(o,holder);}},mixers:[mixer],hideInNormals:[retained,label,emote],sceneDirty:false};
  run(section('function mpDrop(o){','\nfunction mpLabel'),s);const o={av};s.mpDrop(o);s.mpDrop(o);
  assert.equal(o.av,null);assert.equal(s.mixers.length,0);assert.deepEqual(s.hideInNormals,[retained]);assert.equal(mixer.stopped,1);assert.equal(mixer.uncached,root);
  for(const resource of [owned,bone,labelMap,label.material,emote.material,deck.geometry,wingGeometry])assert.equal(resource.count,1);
  for(const resource of [sharedTexture,sharedGeometry,sharedDeckMaterial])assert.equal(resource.count,0);
});

test('realtime loader is single-flight and retries after a script load error',()=>{
  const scripts=[];const s={LIVE:{rt:null,loading:false},window:{},document:{createElement:()=>({remove(){}}),head:{appendChild:x=>scripts.push(x)}}};
  run(section('function liveStart(){','\nfunction liveSend'),s);s.liveStart();s.liveStart();assert.equal(scripts.length,1);
  scripts[0].onerror();s.liveStart();assert.equal(scripts.length,2);
});
