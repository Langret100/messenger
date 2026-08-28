const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function build({contextRows=[],seed=71,searches=[]}={}){
  const data={},user={user_id:'open-turn-user',isGuest:false};
  if(contextRows.length)data['moa.v91.context.open-turn-user']=JSON.parse(JSON.stringify(contextRows));
  let s=seed;const fakeMath=Object.create(Math);fakeMath.random=()=>((s=s*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},
    DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:710,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return ctx.MiniTalk.AI.MoaCommunicationEngine;
}
(async()=>{
  let E=build();
  let r=await E.reply('인터넷 속도 개선방법 뭐가 있을까');
  ok(r.source==='local-decision'&&/(공유기|유선|5GHz|6GHz|속도)/i.test(r.reply),'explicit troubleshooting question was swallowed: '+r.source+' '+r.reply);
  ok(!/(인터넷 얘기였구나|인터넷 쪽이구나)/.test(r.reply),'topic-only acknowledgement returned for a real request: '+r.reply);
  r=await E.reply('그건 했어');
  ok(r.source==='local-followthrough'&&/(단계|다음|공유기|다운로드|5GHz|유선|다른)/.test(r.reply),'done signal did not advance troubleshooting: '+r.source+' '+r.reply);
  const step1=r.reply;
  r=await E.reply('안돼');
  ok(r.source==='local-followthrough'&&!/(조금 더 말|한마디|인터넷 얘기)/.test(r.reply),'failed signal fell into generic chat: '+r.source+' '+r.reply);
  ok(r.reply!==step1,'failed troubleshooting repeated the same step');
  r=await E.reply('1+1은?');ok(r.source==='local-utility'&&/^2/.test(r.reply),'calculator swallowed by open troubleshooting state: '+r.reply);

  // Bare yes/no must answer the assistant's unfinished yes/no question, not become a new topic.
  E=build({contextRows:[
    {role:'user',text:'오늘 축구했어',intent:'statement',topic:'축구'},
    {role:'assistant',text:'오 ㅋㅋ 이기기도 했어?',source:'local-everyday',strategy:'explore',question:true}
  ]});
  r=await E.reply('응');
  ok(r.source==='local-followthrough'&&/(몇 대 몇|점수|접전)/.test(r.reply),'yes did not continue the win question: '+r.source+' '+r.reply);

  E=build({contextRows:[
    {role:'user',text:'영화 봤어',intent:'statement',topic:'영화'},
    {role:'assistant',text:'재밌었어?',source:'local-everyday',strategy:'explore',question:true}
  ]});
  r=await E.reply('아니');
  ok(r.source==='local-followthrough'&&/(별로|아쉬|기대|재미)/.test(r.reply),'no did not continue the fun question: '+r.source+' '+r.reply);
  ok(!/(내가.*잘못|흐름.*다시)/.test(r.reply),'no was misread as a repair complaint: '+r.reply);

  // A troubleshooting acknowledgement after a specific assistant action should advance within that problem.
  E=build({contextRows:[
    {role:'user',text:'와이파이가 계속 느려',intent:'statement',topic:'와이파이'},
    {role:'assistant',text:'공유기 전원을 껐다 켜봤어?',source:'local-decision',strategy:'direct',question:true}
  ]});
  r=await E.reply('응');
  ok(r.source==='local-followthrough'&&/(다운로드|업데이트|5GHz|6GHz|유선|다른)/.test(r.reply),'yes after troubleshooting question did not advance: '+r.reply);

  // Explicit knowledge/search questions must still take their dedicated paths in an active conversation.
  const searches=[];E=build({searches});
  await E.reply('친구랑 게임했어');
  r=await E.reply('피카츄 누구냐');ok(/피카츄/.test(r.reply)&&r.source==='local-knowledge','local knowledge swallowed by continuity: '+r.source+' '+r.reply);
  r=await E.reply('장보고가 누구냐');ok(r.source==='search'&&searches.at(-1)==='장보고','knowledge lookup query polluted by active thread: '+searches.at(-1));

  // Source must remain eligible for human-chat learning competition rather than bypassing learning globally.
  ok(src.includes('source==="local-followthrough"')&&src.includes('learnedConversationChoice'),'followthrough route bypasses learned-human candidate competition');
  console.log('MOA_OPEN_TURN_FOLLOWTHROUGH_REGRESSION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
