const fs=require("fs"),vm=require("vm"),cryptoNode=require("crypto"),path=require("path");
const root=path.resolve(__dirname,"..");
class CE extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}}
class Storage{constructor(){this.m=new Map()}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}key(i){return [...this.m.keys()][i]??null}get length(){return this.m.size}}
function ok(v,m){if(!v)throw new Error(m)}
function makeCtx(){
  const events=new EventTarget(),webcrypto=cryptoNode.webcrypto,storage=new Storage();
  const ctx={console,EventTarget,Event,CustomEvent:CE,TextEncoder,Uint8Array,URLSearchParams,fetch:async()=>{throw new Error("fetch not expected")},localStorage:storage,BroadcastChannel:class{constructor(){}postMessage(){}close(){}},crypto:{randomUUID:()=>cryptoNode.randomUUID(),getRandomValues:v=>webcrypto.getRandomValues(v),subtle:webcrypto.subtle},setInterval,clearInterval,setTimeout,clearTimeout,queueMicrotask,addEventListener:(t,f)=>events.addEventListener(t,f),removeEventListener:(t,f)=>events.removeEventListener(t,f),window:null,document:{scripts:[],createElement(){throw new Error("DOM not expected")},head:{append(){}}}};
  ctx.window=ctx;vm.createContext(ctx);
  for(const file of ["js/config.js","js/core/namespace.js","js/core/events.js","js/core/store.js","js/adapters/realtime.js"])vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),ctx,{filename:file});
  return ctx;
}
(async()=>{
  const source=fs.readFileSync(path.join(root,"js/adapters/realtime.js"),"utf8");
  ok(!source.includes('nickname===user?.nickname?String(user.user_id)'),"member normalization still promotes same nickname to current user_id");
  ok(!source.includes('creatorRaw===user?.nickname?String(user.user_id)'),"creator normalization still promotes same nickname to current user_id");
  const ctx=makeCtx();await ctx.MiniTalk.Realtime.init({user_id:"me",nickname:"같은닉네임"});
  const RT=ctx.MiniTalk.Realtime;
  ok(!RT.isRoomMember({_detail:true,_member:true,id:"locked",creator:"owner",members:{other:{user_id:"other",nickname:"같은닉네임"}}}),"detail room trusted stale _member flag");
  ok(!RT.isRoomMember({_detail:true,id:"locked",creator:"owner",members:{other:{user_id:"other",nickname:"같은닉네임"}}}),"same nickname was treated as membership");
  ok(RT.isRoomMember({_detail:true,id:"locked",creator:"owner",members:{me:{user_id:"me",nickname:"현재사용자"}}}),"exact user_id membership rejected");
  ok(RT.isRoomMember({_summary:true,_member:true,id:"locked",creator:"owner"}),"userRooms-backed summary membership rejected");
  ok(RT.isRoomMember({_detail:true,id:"locked",creator:"me",members:{}}),"creator user_id membership rejected");
  RT.cleanup();console.log("ROOM_MEMBERSHIP_IDENTITY_OK");
})().catch(e=>{console.error(e);process.exit(1)});
