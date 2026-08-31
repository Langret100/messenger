const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function build({contextRows=[],seed=101,patterns=[]}={}){
  const data={},user={user_id:'open-slot-user',isGuest:false};
  if(contextRows.length)data['moa.v91.context.open-slot-user']=JSON.parse(JSON.stringify(contextRows));
  let s=seed;const fakeMath=Object.create(Math);fakeMath.random=()=>((s=s*1664525+1013904223>>>0)/4294967296);
  const searches=[];
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},
    DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:901,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches};
}
(async()=>{
  let {E}=build({contextRows:[
    {role:'assistant',text:'문득, 점심 생각날 시간이네. 오늘 먹고 싶은 거 있어?',source:'local-proactive',strategy:'social',question:true}
  ]});
  let r=await E.reply('피자');
  ok(r.source==='local-followthrough','food noun answer did not use open-question followthrough: '+r.source+' '+r.reply);
  ok(/피자/.test(r.reply)&&!/(더 말하고 싶을 때|이어가자|그 얘기였)/.test(r.reply),'food noun answer was not actually consumed: '+r.reply);

  ({E}=build({contextRows:[{role:'assistant',text:'누구랑 같이 갔어?',source:'local-everyday',question:true}]}));
  r=await E.reply('친구');ok(r.source==='local-followthrough'&&/친구/.test(r.reply),'person slot failed: '+r.source+' '+r.reply);

  ({E}=build({contextRows:[{role:'assistant',text:'몇 시에 만나기로 했어?',source:'local-everyday',question:true}]}));
  r=await E.reply('3시');ok(r.source==='local-followthrough'&&/3시/.test(r.reply),'time slot failed: '+r.source+' '+r.reply);

  ({E}=build({contextRows:[{role:'assistant',text:'영화 어땠어?',source:'local-everyday',question:true}]}));
  r=await E.reply('별로');ok(r.source==='local-followthrough'&&/(별로|아쉬|만족)/.test(r.reply),'opinion slot failed: '+r.source+' '+r.reply);

  ({E}=build({contextRows:[{role:'assistant',text:'오늘 뭐가 제일 재밌었어?',source:'local-everyday',question:true}]}));
  r=await E.reply('축구');ok(r.source==='local-followthrough'&&/축구/.test(r.reply),'choice noun slot failed: '+r.source+' '+r.reply);

  ({E}=build({contextRows:[{role:'assistant',text:'어디 가고 싶어?',source:'local-everyday',question:true}]}));
  r=await E.reply('부산');ok(r.source==='local-followthrough'&&/부산/.test(r.reply),'place slot failed: '+r.source+' '+r.reply);

  // Dedicated features still beat an unfinished assistant question.
  ({E}=build({contextRows:[{role:'assistant',text:'오늘 뭐 먹고 싶어?',source:'local-proactive',question:true}]}));
  r=await E.reply('12*8은?');ok(r.source==='local-utility'&&/^96/.test(r.reply),'calculator swallowed by open-question slot: '+r.source+' '+r.reply);

  let b=build({contextRows:[{role:'assistant',text:'오늘 뭐 먹고 싶어?',source:'local-proactive',question:true}]});E=b.E;
  r=await E.reply('허준이 누구냐');ok(r.source==='search'&&b.searches.at(-1)==='허준','knowledge search swallowed by open-question slot: '+r.source+' '+r.reply);

  // Human-chat learning remains allowed to win over generic followthrough.
  const learned=[{id:'personal-pizza',trigger:'피자',reply:'피자 좋지 ㅋㅋ 난 얇은 도우 쪽이 먼저 생각나.',strategy:'ack',confidence:1,tier:'confirmed',humanChat:true,semantic:{tokens:['피자'],categories:['food'],intent:'statement'}}];
  ({E}=build({contextRows:[{role:'assistant',text:'오늘 뭐 먹고 싶어?',source:'local-proactive',question:true}],patterns:learned}));
  await E.sync(true);r=await E.reply('피자');ok(r.source==='learned-human'&&/얇은 도우/.test(r.reply),'exact learned-human reply was masked by open-question slot: '+r.source+' '+r.reply);

  ok(src.includes('openQuestionAnswerReply')&&src.includes('source="local-followthrough"'),'open-question route not wired into learned-compatible source');
  console.log('MOA_OPEN_QUESTION_SLOT_FOLLOWTHROUGH_OK');
})().catch(e=>{console.error(e);process.exit(1)});
