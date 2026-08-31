const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}}

async function testRouterRace(){
  const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);
  for(const f of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/core/registry.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),ctx,{filename:f});
  const rendered=[];let leaveCall=0;const releases=[];
  const host={replaceChildren(){}};
  ctx.MiniTalk.UI={Dom:{byId:id=>id==='viewHost'?host:null},Shell:{setActiveNav(){},setHeader(){}}};
  const old={id:'old',title:'old',render(){rendered.push('old')},leave(){const i=leaveCall++;return new Promise(r=>releases[i]=r)}};
  const a={id:'a',title:'a',render(){rendered.push('a')}};
  const b={id:'b',title:'b',render(){rendered.push('b')}};
  [old,a,b].forEach(x=>ctx.MiniTalk.Registry.register(x));
  vm.runInContext(fs.readFileSync(root+'/js/core/router.js','utf8'),ctx,{filename:'router.js'});
  await ctx.MiniTalk.Router.go('old');
  const pa=ctx.MiniTalk.Router.go('a');
  const pb=ctx.MiniTalk.Router.go('b');
  assert.strictEqual(releases.length,2,'both competing navigations should wait on leave');
  releases[1]();await pb; // newest navigation finishes first
  releases[0]();await pa; // stale navigation finishes later and must be discarded
  assert.strictEqual(ctx.MiniTalk.Router.current(),'b','stale navigation must not overwrite latest route');
  assert.strictEqual(ctx.MiniTalk.Store.get('route'),'b','store route must stay on latest navigation');
  assert.deepStrictEqual(rendered,['old','b'],'stale feature must not render after newer navigation');
}

function makeDoc(){
  const calls={contextmenu:0,dragstart:0,selectstart:0};
  return{calls,addEventListener(type){if(type in calls)calls[type]++}};
}
function testInteractionGuardDocumentMove(){
  const doc1=makeDoc(),doc2=makeDoc();
  const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:doc1};ctx.window=ctx;vm.createContext(ctx);
  for(const f of ['js/core/namespace.js','js/core/events.js','js/core/store.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),ctx,{filename:f});
  ctx.MiniTalk.UI={};
  vm.runInContext(fs.readFileSync(root+'/js/ui/interaction-guard.js','utf8'),ctx,{filename:'interaction-guard.js'});
  ctx.MiniTalk.UI.InteractionGuard.start();
  assert.deepStrictEqual(doc1.calls,{contextmenu:1,dragstart:1,selectstart:1});
  ctx.MiniTalk.Store.set('rootDocument',doc2);
  assert.deepStrictEqual(doc2.calls,{contextmenu:1,dragstart:1,selectstart:1},'new PiP document must receive guards');
  ctx.MiniTalk.Store.set('rootDocument',doc2);
  assert.deepStrictEqual(doc2.calls,{contextmenu:1,dragstart:1,selectstart:1},'same document must not be rebound');
}

(async()=>{await testRouterRace();testInteractionGuardDocumentMove();console.log('AUDIT_STABILITY_OK')})().catch(e=>{console.error(e);process.exit(1)});
