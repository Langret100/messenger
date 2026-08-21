const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/adapters/window-mode.js','utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

async function run(innerWidth,innerHeight){
  const resizeCalls=[],headNodes=[],bodyMoves=[],removed=[];
  const makeNode=(tag)=>({tagName:tag.toUpperCase(),dataset:{},classList:{toggle(){},add(){},remove(){}},append(){},remove(){removed.push(this)},focus(){}});
  const pipDoc={
    head:{append(...nodes){headNodes.push(...nodes)}},
    body:{append(node){bodyMoves.push(node?.id||'?')}},
    documentElement:{dataset:{},style:{setProperty(){}}},
    createElement(tag){const n=makeNode(tag);n.rel='';n.href='';n.textContent='';return n},
    getElementById(){return null}
  };
  const pipWin={closed:false,innerWidth,innerHeight,document:pipDoc,focus(){},resizeTo(...a){resizeCalls.push(a)},addEventListener(){},requestAnimationFrame(cb){cb();return 1}};
  const nodes={};
  for(const id of ['appShell','toastHost','notificationHost','overlayHost','modalHost'])nodes[id]={id};
  const doc={
    baseURI:'https://example.test/',
    styleSheets:[
      {href:'https://example.test/css/app.css',cssRules:[{cssText:'body{margin:0}'},{cssText:'.x{display:block}'}]},
      {href:'https://example.test/css/tools.css',cssRules:[{cssText:'.tool{padding:1px}'}]}
    ],
    body:{append(){}},documentElement:{dataset:{},style:{setProperty(){}}},getElementById(id){return nodes[id]||null}
  };
  const store=new Map();
  const ctx={console,URL,URLSearchParams,setTimeout,clearTimeout,setInterval,clearInterval,location:{href:'https://example.test/',search:''},screen:{availWidth:1200,availHeight:900,availLeft:0,availTop:0},navigator:{userAgent:'Desktop'},matchMedia:()=>({matches:false}),addEventListener(){},document:doc,documentPictureInPicture:{requestWindow:async opts=>{ok(opts.width===290&&opts.height===560,'request bounds wrong');return pipWin}},window:null,MiniTalk:{Events:{emit(){},on(){}},Persistence:{get(){return null},set(){}},Store:{get(k){return store.get(k)},set(k,v){store.set(k,v)}},MobileImmersive:{isMobile(){return false}},UI:{Shell:{async showApp(){},toast(){},resetWorkspaceSession(){}}},Features:{Layout:{apply(){}},Admin:{applyStoredLock(){}},Auth:{returnToLogin(){}}},GameHost:{close(){}}},MiniTalkConfig:{appName:'모아루'}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
  const result=await ctx.MiniTalk.WindowMode.openPiP();ok(result===true,'openPiP failed');
  const snapshotStyles=headNodes.filter(n=>n.tagName==='STYLE'&&n.dataset?.pipSnapshot==='1');
  const bootStyles=headNodes.filter(n=>n.tagName==='STYLE'&&n.dataset?.pipBoot==='1');
  const links=headNodes.filter(n=>n.tagName==='LINK');
  ok(snapshotStyles.length===1,'loaded same-origin CSS should be copied as one snapshot style');
  ok(bootStyles.length===1&&removed.includes(bootStyles[0]),'PiP body must stay hidden until styles and app are ready, then reveal once');
  ok(links.length===0,'loaded same-origin styles should not re-fetch as links');
  ok(bodyMoves.length===5,'app nodes should move once');
  ok(resizeCalls.length===0,'PiP must not resize after requestWindow');
}
(async()=>{await run(290,560);await run(360,700);console.log('PIP_FIRST_OPEN_STABILITY_OK')})().catch(e=>{console.error(e);process.exit(1)});
