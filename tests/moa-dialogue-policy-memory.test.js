const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),engine=read('js/ai/moa-communication-engine.js'),ai=read('docs/apps-script/MOA_AI.gs'),sw=read('sw.js');
ok(html.includes('moa-communication-engine.js?v=40'),'v88 cache bust missing');
ok(sw.includes('moaru-moa-dialogue-fusion-final'),'v88 service worker cache missing');
for(const token of ['strategyScores','pickStrategy','policyKey','searchPolicy','referenceConfidence','policy_feedback','strategyHistory'])ok(engine.includes(token),'v88 engine layer missing: '+token);
ok(ai.includes('MOA_POLICY_SHEET')&&ai.includes('모아_대화정책')&&ai.includes('moaStorePolicyEvents_')&&ai.includes('moaPublicPolicy_'),'policy learning store missing');

const store={};let commits=[],searches=[];const fakeMath=Object.create(Math);fakeMath.random=()=>0.01;
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'u1',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{
  moaSync:async()=>({ok:true,version:9,patterns:[],policy:{'statement|negative|event|qlo':{empathy:{positive:7,negative:1}}},profile:{brevity:.58,questionTolerance:.5,playfulness:.55,empathy:.65,directness:.6},memories:{}}),
  moaSearch:async({query})=>{searches.push(query);return {reply:'SEARCH:'+query,source:'test-search',kind:'general'}},
  moaCommit:async p=>{commits.push(p);return {ok:true,version:10}}
}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;await e.sync(true);
 let r=await e.reply('세종대왕');ok(r.source==='local','standalone topic should stay local');
 r=await e.reply('그게 누구야');ok(r.reply==='SEARCH:세종대왕'&&r.referenceConfidence>.5,'reference resolution/search confidence failed');
 searches=[];r=await e.reply('넌 멍청해');ok(searches.length===0&&!/어떤 느낌/.test(r.reply),'social insult routed to search/bad grammar');
 await e.reply('오늘 시험 망했어');r=await e.reply('진짜 너무 어려웠어');ok(!/^SEARCH:/.test(r.reply),'negative smalltalk searched');
 // Force several prior questions, then verify policy can choose a non-question response.
 for(let i=0;i<3;i++){await e.reply('그다음');}
 r=await e.reply('규칙이 어려웠어');ok(!/[?？]$/.test(r.reply),'question pressure failed: '+r.reply);
 await e.reply('맞아');await e.flushCommit();ok(commits.some(c=>c.events.some(x=>x.type==='policy_feedback')),'policy feedback not batched');
 const snap=e.debugSnapshot();ok(snap.version===93&&Array.isArray(snap.state.strategyHistory),'v88 debug/state missing');
 console.log('MOA_V88_DIALOGUE_POLICY_MEMORY_OK');
})().catch(e=>{console.error(e);process.exit(1)});
