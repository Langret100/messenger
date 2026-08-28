const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function boot(patterns=[],seedStart=1,userId='final-route'){
  const data={},user={user_id:userId,isGuest:false};let seed=seedStart>>>0;const searches=[];
  const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:940,coreVersion:14,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches};
}
(async()=>{
  // New local routes must really execute, not sit behind an earlier fallback.
  const {E,searches}=boot([],711,'route-local');
  const flows=[
    ['게임 한판함','막판에 역전함','local-continuation'],
    ['친구 기다리는중','아직 안옴','local-continuation'],
    ['버스 타는중','사람 왤케 많냐','local-continuation'],
    ['컴퓨터 하는중','인터넷 끊겼어 ㅋㅋ','local-continuation'],
    ['공원 갔다옴','근데 비왓어','local-continuation']
  ];
  const outputs=[];
  for(const [a,b,want] of flows){E.clearContext();await E.reply(a);const r=await E.reply(b);outputs.push(r.reply);ok(r.source===want,`new route not reached ${a}/${b}: ${r.source} ${r.reply}`);ok(r.candidateId!=='fallback',`new route fell through ${a}/${b}`);}
  ok(new Set(outputs).size>=4,`expanded routes collapse to too few outputs: ${JSON.stringify(outputs)}`);
  ok(searches.length===0,`story turns accidentally called search: ${searches.join('|')}`);

  // Dedicated existing features keep priority even inside an active everyday thread.
  E.clearContext();await E.reply('친구랑 얘기중');let r=await E.reply('17+28은?');ok(r.source==='local-utility'&&/^45/.test(r.reply),`calculator masked: ${r.source}/${r.reply}`);
  E.clearContext();await E.reply('게임 한판 했어');r=await E.reply('가위바위보');ok(/가위|바위|보/.test(r.reply),`rps masked: ${r.source}/${r.reply}`);
  E.clearContext();await E.reply('공원 다녀왔어');r=await E.reply('서울 오늘 날씨 알려줘');ok(r.source==='search',`weather search masked: ${r.source}/${r.reply}`);
  E.clearContext();r=await E.reply('세종대왕 업적 검색해줘');ok(r.source==='search',`explicit search masked: ${r.source}/${r.reply}`);

  // Appended messenger tone markers must not steal the semantic event.
  E.clearContext();await E.reply('컴퓨터 하는중');r=await E.reply('인터넷 끊겼어 ㅋㅋ');ok(r.source==='local-continuation'&&!/웃|ㅋㅋ$/.test(r.reply.replace(/진짜 짜증나지|맥 빠지지|말썽|타이밍/g,'')),`laughter stole event: ${r.source}/${r.reply}`);

  // Strong human-chat learning must still beat the widened local fallback.
  const learned=[{id:'human-final',trigger:'근데 인터넷 끊겼어',reply:'학습된 답변 그대로 유지',act:'inform:event',strategy:'ack',affect:'negative',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:80,semantic:{tokens:['인터넷','끊기다'],categories:['tech'],intent:'inform:event'}}];
  const L=boot(learned,713,'route-learned').E;await L.sync(true);L.clearContext();await L.reply('컴퓨터 하는중');r=await L.reply('근데 인터넷 끊겼어');ok(r.source==='learned-human'&&r.reply==='학습된 답변 그대로 유지',`learned candidate masked or rewritten: ${r.source}/${r.reply}`);

  // Typo canonicalization is analysis-only: the original text remains available to search transport.
  const B=boot([],715,'route-search-text');await B.E.reply('세종대왕 업적 검색해줘');ok(B.searches.length===1&&/세종대왕/.test(B.searches[0]),`search query damaged by normalization: ${B.searches.join('|')}`);
  console.log(`MOA_FINAL_ROUTE_EFFECTIVENESS_OK local=${flows.length} unique=${new Set(outputs).size} learned=1 features=4`);
})().catch(e=>{console.error(e);process.exit(1)});
