const fs=require('fs'),vm=require('vm');const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8'),data={},user={user_id:'ctx-deep',isGuest:false};let seed=41;const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
const patterns=[{id:'learned-ramen',trigger:'라면 먹을까?',reply:'라면 좋지 ㅋㅋ 계란 있으면 같이 먹어도 괜찮고.',act:'question',affect:'neutral',strategy:'direct',confidence:.92,tier:'confirmed',evidenceCount:12,humanChat:true,semantic:{tokens:['라면','먹다'],categories:['food'],intent:'ask:question'}}];
const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:401,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({})}}};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
 await E.sync(true);
 E.clearContext();await E.reply('배고파');const ramen=await E.reply('라면?');ok(!/조건이 하나|조금만 더|한마디만/.test(ramen.reply),'ramen followup clarified: '+ramen.reply);
 const statement=await E.reply('근데 귀찮아');ok(!/^근데 귀찮아(?:\?| )/.test(statement.reply),'statement was hijacked as candidate: '+statement.reply);ok(statement.source!=='local-contextual','plain statement misclassified contextual');
 E.clearContext();await E.reply('피곤해');const sleep=await E.reply('잘까?');ok(!/조건이 하나|조금만 더|한마디만/.test(sleep.reply),'proposal followup clarified: '+sleep.reply);
 E.clearContext();await E.reply('시험 망했어');const what=await E.reply('어쩌지?');ok(!/조건이 하나|조금만 더|한마디만/.test(what.reply),'what-do followup clarified: '+what.reply);
 E.clearContext();await E.reply('아까 숙제 얘기했어');const recall=await E.reply('아까 뭐 얘기했지?');ok(recall.source!=='local-contextual','memory question stolen by contextual resolver');
 let learned=0;for(let i=0;i<30;i++){E.clearContext();await E.reply('배고파');const r=await E.reply('라면?');if(r.source==='learned-human')learned++;}ok(learned>0,'learned human context never selected');
 console.log('MOA_CONTEXT_FOLLOWUP_DEEP_REGRESSION_OK learned='+learned);
})().catch(e=>{console.error(e);process.exit(1)});
