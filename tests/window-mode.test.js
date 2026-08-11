const fs=require('fs'),vm=require('vm'),assert=require('assert');
const code=fs.readFileSync('js/adapters/window-mode.js','utf8');
assert(code.includes('setTransferredState(true)'),'opener page must show the transferred-state guidance');
assert(code.includes('launchTransferred'),'transferred-state panel hook is missing');
let opened=null,shown=0;
const saved={};
const context={
  console,
  setInterval:()=>1,clearInterval:()=>{},
  addEventListener:()=>{},
  location:{href:'https://example.test/index.html',search:''},
  screen:{availWidth:1920,availHeight:1080,availLeft:0,availTop:0},
  matchMedia:()=>({matches:false}),
  navigator:{},
  document:{
    getElementById:()=>null,
    styleSheets:[],body:{append:()=>{},classList:{add:()=>{}}},baseURI:'https://example.test/',
    documentElement:{dataset:{}}
  },
  window:null,
  MiniTalkConfig:{appName:'미니톡'},
  MiniTalk:{
    Events:{emit:()=>{}},
    Persistence:{get:(k,f)=>k in saved?saved[k]:f,set:(k,v)=>saved[k]=v},
    Store:{set:()=>{}},Features:{Layout:{apply:()=>{}}},
    UI:{Shell:{showApp:async()=>{shown++},toast:()=>{}}}
  },
  URL,URLSearchParams
};
context.window=context;
context.window.open=(url,name,features)=>{opened={url,name,features};return {closed:false,focus:()=>{},close:()=>{}}};
context.window.screenX=0;context.window.screenY=0;context.window.innerWidth=390;context.window.innerHeight=680;
vm.createContext(context);vm.runInContext(code,context);
(async()=>{
  const result=await context.MiniTalk.WindowMode.openPopup();
  assert.strictEqual(result,true);
  assert(opened,'popup must be requested');
  assert(opened.url.includes('window=popup'),'popup URL must carry popup mode');
  assert(opened.features.includes('popup=yes'),'must request popup UI');
  assert(opened.features.includes('location=no'),'must request minimal location UI');
  assert(opened.features.includes('width=460'),'must request the larger desktop width');
  assert(opened.features.includes('height=760'),'must request the larger desktop height');
  assert(opened.features.includes('left=730'),'new popup must be centered horizontally');
  assert(opened.features.includes('top=160'),'new popup must be centered vertically');
  console.log('WINDOW_MODE_POPUP_OK');
})().catch(e=>{console.error(e);process.exit(1)});
