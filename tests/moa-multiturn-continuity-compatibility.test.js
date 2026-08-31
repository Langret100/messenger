const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const data={},user={user_id:'multi-turn-compat',isGuest:false};
let seed=73;
const fakeMath=Object.create(Math);
fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
const searches=[];
const ctx={
  console,Date,Math:fakeMath,
  setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
  MiniTalk:{
    AI:{},
    Store:{get:k=>k==='user'?user:undefined},
    Persistence:{
      get:(k,d)=>k in data?data[k]:d,
      set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},
      remove:k=>delete data[k]
    },
    DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},
    AuthApi:{
      moaSync:async()=>({ok:true,version:601,patterns:[],policy:{},expressionWeights:{}}),
      moaCommit:async()=>({ok:true}),
      moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}
    }
  }
};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
  E.clearContext();
  await E.reply('점심 뭐 먹지?');
  await E.reply('라면?');
  let r=await E.reply('근데 어제도 먹었어');
  ok(r.source==='local-continuation'&&/라면/.test(r.reply)&&!/(먹었어 얘기|이어.*말|듣고 있어)/.test(r.reply),'meal objection lost its previous option: '+r.reply);
  r=await E.reply('그럼 김밥은?');
  ok(/김밥/.test(r.reply)&&!/(한마디만|조건이 하나)/.test(r.reply),'next meal choice did not continue naturally: '+r.reply);

  E.clearContext();
  await E.reply('친구랑 싸웠어');
  await E.reply('내 말 무시했어');
  await E.reply('내일 얘기해볼까');
  r=await E.reply('근데 걔가 먼저 화냈어');
  ok(r.source==='local-continuation'&&/(친구|걔|화낸)/.test(r.reply)&&!/(이어.*말|계속해|듣고 있어)/.test(r.reply),'conflict pronoun was reduced to a generic continuation: '+r.reply);

  E.clearContext();
  await E.reply('오늘 학교에서 축구했어');
  await E.reply('근데 졌어');
  await E.reply('그래도 재밌었어');
  r=await E.reply('내일 또 하기로 했어');
  ok(r.source==='local-continuation'&&/축구/.test(r.reply),'activity plan forgot the shared subject: '+r.reply);

  // Existing dedicated features must keep priority even inside an active conversation.
  r=await E.reply('1+1은?');ok(r.source==='local-utility'&&/^2/.test(r.reply),'calculator was swallowed by continuity: '+r.reply);
  r=await E.reply('가위바위보 하자');ok(/가위.*바위.*보/.test(r.reply),'RPS start was swallowed by continuity: '+r.reply);
  r=await E.reply('가위');ok(/너는 가위/.test(r.reply),'RPS follow-up was swallowed by continuity: '+r.reply);
  r=await E.reply('너 이름 뭐야');ok(/모아/.test(r.reply),'self feature was swallowed by continuity: '+r.reply);

  E.clearContext();searches.length=0;
  r=await E.reply('세종대왕 찾아줘');ok(r.source==='search','initial search lost');
  r=await E.reply('더 자세히 알려줘');ok(r.source==='search'&&searches.at(-1)==='세종대왕','search expansion lost original subject: '+searches.at(-1));
  r=await E.reply('그 사람 업적은?');ok(r.source==='search'&&searches.at(-1)==='세종대왕 업적','factual pronoun follow-up was swallowed or anchored to expansion words: '+searches.at(-1));

  console.log('MOA_MULTITURN_CONTINUITY_COMPATIBILITY_OK');
})().catch(e=>{console.error(e);process.exit(1)});
