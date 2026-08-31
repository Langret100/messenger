const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const store=new Map(); let puts=0,lockCalls=0;
const ctx={console:{warn(){},log(){},error(){}},Date,Math,JSON,URL,setTimeout,clearTimeout,globalThis:null,navigator:{locks:{request:async(_n,_o,work)=>{lockCalls++;return work();}}},MiniTalk:{AI:{},Store:{get:()=>({user_id:'u1'})},Persistence:{get:(k,d)=>store.has(k)?store.get(k):d,set:(k,v)=>{store.set(k,v);return v},remove:k=>store.delete(k)},DataCache:{get:async()=>[],put:async()=>{puts++;throw new Error('simulated cache write failure')},remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:9,coreVersion:0,patterns:[{id:'p1',trigger:'안녕',reply:'응',tier:'confirmed',evidenceCount:3}]})}}};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
(async()=>{await ctx.MiniTalk.AI.MoaCommunicationEngine.sync(true);ok(lockCalls===1,'public cache lock should be requested once');ok(puts===1,`cache write executed ${puts} times after callback failure`);console.log('MOA_PUBLIC_CACHE_LOCK_FAILURE_SINGLE_EXEC_OK');})().catch(e=>{console.error(e);process.exit(1)});
