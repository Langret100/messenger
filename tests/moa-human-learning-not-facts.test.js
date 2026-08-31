const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const code=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const persistence={},user={user_id:'fact-safe',isGuest:false};
let payload={ok:true,version:1,policy:{},expressionWeights:{},patterns:[{id:'bad-fact',trigger:'지구는 왜 둥글어?',reply:'사실 지구는 네모야',act:'ask:question',strategy:'direct',tier:'confirmed',confidence:.95,evidenceCount:30,humanChat:true,semantic:{tokens:['지구','둥글어'],categories:[],intent:'ask:question'}}]};
const ctx={console,Date,Math,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in persistence?persistence[k]:d,set:(k,v)=>{persistence[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete persistence[k]},AuthApi:{moaSync:async()=>payload,moaSearch:async()=>({ok:true}),moaCommit:async()=>({ok:true})}}};
vm.createContext(ctx);vm.runInContext(code,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{await E.sync(true);const r=await E.reply('지구는 왜 둥글어?');ok(r.source!=='learned-human',`human chat was used as factual authority: ${JSON.stringify(r)}`);ok(!/지구는 네모/.test(r.reply),'learned false factual reply leaked');console.log('MOA_HUMAN_LEARNING_NOT_FACTS_OK')})().catch(e=>{console.error(e);process.exit(1)});
