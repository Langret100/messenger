const fs=require('fs'),vm=require('vm');const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8'),data={},user={user_id:'what-loop',isGuest:false};
const ctx={console,Date,Math,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:1,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({})}}};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
  E.clearContext();
  await E.reply('배고파');
  const ramen=await E.reply('라면?');
  ok(!/조건이 하나|조금만 더|한마디만/.test(ramen.reply),'ramen still asks vague condition: '+ramen.reply);
  // 실제로 이전 버전에서 나오던 모호한 되묻기와 같은 상태를 대화 흐름으로 유도한다.
  E.clearContext();
  await E.reply('오늘 그거 했어');
  const vague=await E.reply('그건?');
  const w1=await E.reply('뭐');
  const w2=await E.reply('뭐');
  ok(!/애매하게 했|다시 정확|설명이 이상|헷갈렸/.test(w1.reply),'first what still returned meta apology: '+w1.reply);
  ok(!/애매하게 했|다시 정확|설명이 이상|헷갈렸/.test(w2.reply),'second what still returned meta apology: '+w2.reply);
  ok(/가리키는지만|대상|뭔지를|얘기/.test(w2.reply),'second what did not explain concrete missing context: '+w2.reply);
  // 한 번 모아가 clarification/meta 멘트로 빠져도 다음 '뭐/뭘'은 원래 화제로 복구해야 한다.
  const snap=E.debugSnapshot();
  ok(snap.context.length>=4,'context unexpectedly missing');
  console.log('MOA_SHORT_WHAT_LOOP_RECOVERY_OK',JSON.stringify({vague:vague.reply,w1:w1.reply,w2:w2.reply}));
})().catch(e=>{console.error(e);process.exit(1)});
