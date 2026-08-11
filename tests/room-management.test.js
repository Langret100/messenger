const fs=require("fs"),vm=require("vm"),cryptoNode=require("crypto"),path=require("path");
const root=path.resolve(__dirname,"..");
class CE extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}}
class SharedStorage{constructor(){this.m=new Map()}getItem(k){return this.m.has(k)?this.m.get(k):null}setItem(k,v){this.m.set(k,String(v))}removeItem(k){this.m.delete(k)}}
const storage=new SharedStorage(),channels=new Map();
class BC{constructor(name){this.name=name;this.onmessage=null;(channels.get(name)||channels.set(name,new Set()).get(name)).add(this)}postMessage(data){for(const channel of channels.get(this.name)||[])if(channel!==this&&channel.onmessage)channel.onmessage({data})}close(){channels.get(this.name)?.delete(this)}}
function makeCtx(){
  const events=new EventTarget(),webcrypto=cryptoNode.webcrypto;
  const ctx={console,EventTarget,Event,CustomEvent:CE,TextEncoder,Uint8Array,URLSearchParams,fetch:async()=>{throw new Error("fetch not expected")},localStorage:storage,BroadcastChannel:BC,crypto:{randomUUID:()=>cryptoNode.randomUUID(),getRandomValues:value=>webcrypto.getRandomValues(value),subtle:webcrypto.subtle},setInterval,clearInterval,setTimeout,clearTimeout,addEventListener:(type,fn)=>events.addEventListener(type,fn),removeEventListener:(type,fn)=>events.removeEventListener(type,fn),window:null,document:{scripts:[],createElement(){throw new Error("DOM not expected")},head:{append(){}}}};
  ctx.window=ctx;vm.createContext(ctx);
  for(const file of ["js/config.js","js/core/namespace.js","js/core/events.js","js/core/store.js","js/adapters/realtime.js"])vm.runInContext(fs.readFileSync(path.join(root,file),"utf8"),ctx,{filename:file});
  return ctx
}
(async()=>{
  const A=makeCtx(),B=makeCtx();
  await A.MiniTalk.Realtime.init({user_id:"a",nickname:"A"});
  await B.MiniTalk.Realtime.init({user_id:"b",nickname:"B"});
  const room=await A.MiniTalk.Realtime.createRoom("잠금방","1234");
  if(!room.hasPassword||!room.passwordHash||room.passwordHash==="1234")throw new Error("password was not hashed");
  if(!room.members?.a||room.members.a.role!=="owner")throw new Error("creator membership missing");
  let wrongRejected=false;try{await B.MiniTalk.Realtime.joinRoom(room.id,"0000")}catch(error){wrongRejected=/올바르지/.test(error.message)}
  if(!wrongRejected)throw new Error("wrong password was accepted");
  await B.MiniTalk.Realtime.joinRoom(room.id,"1234");
  let updated=await A.MiniTalk.Realtime.getRoom(room.id);
  if(!updated.members?.b)throw new Error("member join was not stored");
  await A.MiniTalk.Realtime.removeRoomMember(room.id,"b");
  updated=await A.MiniTalk.Realtime.getRoom(room.id);
  if(updated.members?.b)throw new Error("member removal failed");
  await B.MiniTalk.Realtime.joinRoom(room.id,"1234");
  const transfer=await A.MiniTalk.Realtime.leaveRoom(room.id);
  updated=await B.MiniTalk.Realtime.getRoom(room.id);
  if(transfer.deleted||transfer.newCreator!=="b"||updated.creator!=="b"||updated.members.b.role!=="owner")throw new Error("owner transfer failed");
  await B.MiniTalk.Realtime.updateRoomPassword(room.id,"");
  updated=await B.MiniTalk.Realtime.getRoom(room.id);
  if(updated.hasPassword||updated.passwordHash||updated.passwordSalt)throw new Error("password removal failed");
  const removed=await B.MiniTalk.Realtime.leaveRoom(room.id);
  if(!removed.deleted||await B.MiniTalk.Realtime.getRoom(room.id))throw new Error("empty room deletion failed");
  let globalRejected=false;try{await A.MiniTalk.Realtime.leaveRoom("global")}catch(error){globalRejected=/전체 대화/.test(error.message)}
  if(!globalRejected)throw new Error("global room leave was accepted");
  A.MiniTalk.Realtime.cleanup();B.MiniTalk.Realtime.cleanup();
  console.log("ROOM_MANAGEMENT_OK")
})().catch(error=>{console.error(error);process.exit(1)});
