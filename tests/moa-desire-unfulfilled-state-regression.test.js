const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function build({contextRows=[],seed=71,patterns=[]}={}){
  const data={},user={user_id:'desire-user',isGuest:false};
  if(contextRows.length)data['moa.v91.context.desire-user']=JSON.parse(JSON.stringify(contextRows));
  let s=seed;const fakeMath=Object.create(Math);fakeMath.random=()=>((s=s*1664525+1013904223>>>0)/4294967296);
  const searches=[];
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},
    DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:950,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches};
}
(async()=>{
  // Exact screenshot family: desire must not be rewritten as a completed event.
  let {E}=build();
  let r=await E.reply('피자먹고프다');
  ok(/먹고 싶은|먹고싶|땡기|당기/.test(r.reply)&&!/먹었|먹다가|그러고 먹었/.test(r.reply),'compact food desire treated as past event: '+r.source+' '+r.reply);
  r=await E.reply('피자 먹고 프다');
  ok(/먹고 싶은|먹고싶|땡기|당기/.test(r.reply)&&!/먹었|먹다가|그러고 먹었/.test(r.reply),'spaced food desire treated as past event: '+r.source+' '+r.reply);
  r=await E.reply('아직 못먹음');
  ok(/아직|못 먹|먹기 전/.test(r.reply)&&!/먹다가|그러고 먹었/.test(r.reply),'unfulfilled food action hallucinated completion: '+r.source+' '+r.reply);

  // The whole correction chain from the screenshot must recover instead of
  // persisting the false 'already ate' assumption.
  ({E}=build());
  await E.reply('피자먹고프다');
  await E.reply('피자 먹고 프다');
  await E.reply('아니');
  r=await E.reply('아직 못먹음');
  ok(/아직|못 먹|먹기 전/.test(r.reply)&&!/먹다가|그러고 먹었/.test(r.reply),'correction chain kept false completion: '+r.source+' '+r.reply);

  // Generalization: same state logic must work outside pizza/food.
  for(const [text,good,bad] of [
    ['부산 가고프다',/(가고 싶은|가고싶|가보고 싶은|나가고 싶은)/,/(갔구나|다녀왔)/],
    ['영화 보고 싶음',/(보고 싶은|보고싶|볼 게)/,/(봤구나|보다가)/],
    ['게임 하고프다',/(게임.*싶|한 판|하고 싶은)/,/(했구나|하다가)/],
    ['아직 못 갔어',/(아직|못 갔|가기 전)/,/(갔다 왔|다녀왔)/],
    ['아직 못 봤음',/(아직|못 본|보기 전)/,/(보다가)/]
  ]){({E}=build());r=await E.reply(text);ok(good.test(r.reply)&&!bad.test(r.reply),text+' state failed: '+r.source+' '+r.reply);}

  // Open assistant question + desire answer should remain an answer to that question.
  ({E}=build({contextRows:[{role:'assistant',text:'오늘 먹고 싶은 거 있어?',source:'local-proactive',strategy:'social',question:true}]}));
  r=await E.reply('피자 먹고프다');
  ok(/피자|먹고 싶은|땡기/.test(r.reply)&&!/더 말해줘|먹었구나/.test(r.reply),'open question desire slot failed: '+r.source+' '+r.reply);

  // Learned human reply still competes above the generalized local reply.
  const learned=[{id:'want-learned',trigger:'피자 먹고프다',reply:'피자 땡기면 오늘은 그냥 피자 각이지 ㅋㅋ',strategy:'ack',confidence:1,tier:'confirmed',humanChat:true,semantic:{tokens:['피자','먹다'],categories:['food'],intent:'inform:desire'}}];
  ({E}=build({patterns:learned}));await E.sync(true);r=await E.reply('피자 먹고프다');
  ok(r.source==='learned-human'&&/피자 각/.test(r.reply),'learned desire reply masked: '+r.source+' '+r.reply);

  // Utilities/search remain higher priority than dialogue state handling.
  ({E}=build());r=await E.reply('12*8은?');ok(r.source==='local-utility'&&/^96/.test(r.reply),'calculator regression: '+r.source+' '+r.reply);
  const b=build();E=b.E;r=await E.reply('허준이 누구냐');ok(r.source==='search'&&b.searches.at(-1)==='허준','knowledge routing regression: '+r.source+' '+r.reply);

  ok(src.includes('const desire=')&&src.includes('const unfulfilled='),'state detectors missing');
  console.log('MOA_DESIRE_UNFULFILLED_STATE_REGRESSION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
