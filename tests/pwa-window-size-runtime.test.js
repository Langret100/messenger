const fs=require("fs");
const vm=require("vm");
const source=fs.readFileSync("js/adapters/window-mode.js","utf8");

function run(userAgent,isMobile){
  const listeners={},resizeCalls=[],moveCalls=[],storage=new Map();
  const context={
    console,setTimeout,clearTimeout,setInterval,clearInterval,URL,URLSearchParams,
    MiniTalk:{Events:{emit(){}},Persistence:{},UI:{},Store:{},Features:{},MobileImmersive:{isMobile:()=>isMobile}},
    addEventListener(type,handler){(listeners[type]||(listeners[type]=[])).push(handler)},
    matchMedia(query){return{matches:query.includes("display-mode: standalone")}},
    navigator:{standalone:false,userAgent},
    location:{search:"",href:"https://example.test/"},
    screen:{availWidth:1366,availHeight:768,availLeft:0,availTop:0,width:1366,height:768},
    document:{readyState:"loading",documentElement:{dataset:{}},body:{classList:{add(){}}}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    requestAnimationFrame(callback){callback()},
    window:{resizeTo:(...args)=>resizeCalls.push(args),moveTo:(...args)=>moveCalls.push(args)}
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  for(const handler of listeners.DOMContentLoaded||[])handler();
  return{resizeCalls,moveCalls};
}

const whaleBook=run("Mozilla/5.0 (X11; CrOS x86_64) Chrome/140",false);
if(JSON.stringify(whaleBook.resizeCalls)!==JSON.stringify([[400,740]]))throw new Error("WhaleBook standalone sizing failed");
if(JSON.stringify(whaleBook.moveCalls)!==JSON.stringify([[952,14]]))throw new Error("standalone bottom-right placement failed");
const mobile=run("Mozilla/5.0 (Linux; Android 16; Mobile)",true);
if(mobile.resizeCalls.length)throw new Error("mobile standalone must not be resized");
console.log("PWA_WINDOW_SIZE_RUNTIME_OK");
