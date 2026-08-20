const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const core=fs.readFileSync('js/ai/moa-dialogue-core.js','utf8');
const engine=fs.readFileSync('js/ai/moa-chat-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
ok(html.includes('js/ai/moa-dialogue-core.js?v=1'),'dialogue core not loaded');
ok(html.indexOf('moa-dialogue-core.js')<html.indexOf('moa-chat-engine.js'),'dialogue core must load before engine');
ok(sw.includes('moaru-v64.5.48-moa-holistic-v84-20260820'),'v84 cache version missing');
ok(sw.includes('./js/ai/moa-dialogue-core.js'),'dialogue core missing from SW');
let observations=[],feedback=[];
const topicHints={킥플립:[{term:'스케이트보드',support:4}],마라탕:[{term:'맵기',support:3}]};
const ctx={console,Math,Date,setTimeout,clearTimeout,MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:'u1',nickname:'테스트'}:{}},Persistence:{get:()=>[],set:()=>{},remove:()=>{}},Tools:{},AuthApi:{
 moaSearch:async()=>({}), moaChat:async a=>({topic_hints:topicHints[(a.semantic?.concepts||[])[0]]||[]}),
 moaFeedback:async a=>{feedback.push(a);return{}}, moaTopicObserve:async a=>{observations.push(a);return{}},
 moaReactionObserve:async()=>({}),moaReactionLexicon:async()=>({entries:[]}),moaMemoryGet:async()=>({}),moaMemorySet:async()=>({})
}}};
vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaChatEngine,C=ctx.MiniTalk.AI.MoaDialogueCore;
(async()=>{
  let r=await E.reply('오늘 스케이트보드 탔어');ok(/스케이트보드|어땠|기억|괜찮/.test(r.reply),'unknown hobby topic not handled: '+r.reply);
  r=await E.reply('킥플립 연습했어');ok(/킥플립|어땠|기억|괜찮|스케이트보드/.test(r.reply),'new niche topic not handled: '+r.reply);
  r=await E.reply('드디어 성공했어');ok(/잘됐|뿌듯|성공|좋았/.test(r.reply),'success continuation not handled: '+r.reply);
  r=await E.reply('진짜 재밌었음ㅋㅋ');ok(!/나도 좀 웃겼어|반응 좋네/.test(r.reply),'embedded laughter mistaken for pure reaction: '+r.reply);
  await new Promise(res=>setTimeout(res,0));ok(observations.some(o=>(o.concepts||[]).includes('스케이트보드')),'topic observation missing');
  r=await E.reply('친구가 보드 잘 타');
  r=await E.reply('걔 킥플립도 잘해');ok(/친구|계속|킥플립|잘/.test(r.reply),'person/pronoun context weak: '+r.reply);
  E.clearContext();r=await E.reply('그거 진짜 어려움');ok(!/아까 .*얘기/.test(r.reply),'clearContext leaked topic');
  r=await E.reply('너 마라탕 좋아해?');ok(/마라탕/.test(r.reply),'self preference should reflect novel topic: '+r.reply);
  r=await E.reply('오늘 과학실에서 슬라임 만들었어');ok(!/^오, 그래서 어떻게 됐어\?$/.test(r.reply),'generic unseen activity fell to repetitive fallback');
  r=await E.reply('수학 문제 하나 겨우 풀었어');ok(/수학|문제|어땠|기억|괜찮|풀/.test(r.reply),'academic statement not generic');
  r=await E.reply('우리 강아지가 장난감 숨겼어');ok(/강아지|장난감|얘기|그다음|어땠|기억/.test(r.reply),'pet story not generic: '+r.reply);
  r=await E.reply('ㅋㅋㅋㅋ');ok(/ㅋㅋ|그치|웃/.test(r.reply),'pure laughter no quick reaction');
  console.log('MOA_V84_HOLISTIC_DIALOGUE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
