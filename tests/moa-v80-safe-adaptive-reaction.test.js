const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const core=fs.readFileSync('js/ai/moa-dialogue-core.js','utf8');
const engine=fs.readFileSync('js/ai/moa-chat-engine.js','utf8');
const api=fs.readFileSync('js/adapters/auth-api.js','utf8');
const learn=fs.readFileSync('docs/apps-script/MOA_LEARNING.gs','utf8');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),app=fs.readFileSync('js/app.js','utf8');
ok(html.includes('js/ai/moa-chat-engine.js?v=11')&&html.includes('js/adapters/auth-api.js?v=64.5.30')&&html.includes('js/app.js?v=64.5.36'),'v80 client cache bust missing');
ok(sw.includes('moaru-v64.5.48-moa-holistic-v84-20260820')&&app.includes('sw.js?v=64.5.48'),'v80 service worker cache bump missing');
ok(engine.includes('reactionTypoAliases')&&!engine.includes('fuzzyReactionTag'),'unsafe fuzzy matching still present');
ok(engine.includes('isAdaptiveReactionCandidate')&&engine.includes("'축구 맞아'"),'adaptive noun pollution guard missing');
ok(api.includes('observation_mode')&&api.includes('evidence_key'),'v80 reaction evidence fields missing');
ok(learn.includes('bestCount>=4&&ratio>=.80&&standalone>=2&&contexts>=2'),'strict adaptive promotion gate missing');
ok(learn.includes('summary.promotable')&&learn.includes('예전 evidence에는 standalone/context가 없어 자동 격리'),'legacy active revalidation missing');
let feedback=[],observed=[];
const ctx={console,Math,Date,setTimeout,clearTimeout,MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:'u1',nickname:'테스트'}:{}},Persistence:{get:()=>[],set:()=>{},remove:()=>{}},Tools:{},AuthApi:{
  moaSearch:async()=>({}),moaChat:async()=>({}),moaFeedback:async args=>{feedback.push(args);return{}},
  moaReactionObserve:async args=>{observed.push(args);return{}},moaReactionLexicon:async()=>({entries:[]}),moaMemoryGet:async()=>({}),moaMemorySet:async()=>({})
}}};
vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaChatEngine;
(async()=>{
  await E.warmup();
  async function classified(text,reaction,tag){await E.reply('안녕');const n=feedback.length;await E.reply(text);ok(feedback.length===n+1,'feedback missing: '+text);const f=feedback.at(-1);ok(f.reaction===reaction&&f.reactionTag===tag,`${text}: ${f.reaction}/${f.reactionTag}`);}
  for(const x of ['마자','오께이','조아'])await classified(x,'positive','agreement');
  await classified('틀렷어','correction','correction');
  // 정상 단어를 비슷한 반응어로 오인하면 안 됨.
  for(const x of ['오리','콜라','축구','숙제','미쳤다']){await E.reply('안녕');const n=feedback.length;await E.reply(x);ok(feedback.length===n,`normal word misclassified: ${x}`);}
  // 일반명사 + 맞아는 학습 신호 자체는 긍정이어도 일반명사를 새 반응어 후보로 보내지 않음.
  observed.length=0;await E.reply('안녕');await E.reply('축구 맞아');ok(!observed.some(v=>(v.unknownTerms||[]).includes('축구')),'ordinary noun leaked into adaptive reaction candidates');
  // 반응형태 단서가 있는 신조어는 문맥 증거로 관찰 가능.
  observed.length=0;await E.reply('안녕');await E.reply('개추 인정');
  const ev=observed.find(v=>(v.unknownTerms||[]).includes('개추'));ok(ev&&ev.observationMode==='contextual'&&ev.evidenceKey,'slang contextual evidence missing');
  // 의미를 모르는 단독 표현은 의미 없이 standalone 관찰만 함.
  observed.length=0;await E.reply('안녕');await E.reply('새말');
  const u=observed.find(v=>(v.unknownTerms||[]).includes('새말'));ok(u&&u.observationMode==='standalone'&&!u.suggestedTag,'standalone unknown observation missing');
  console.log('MOA_V80_SAFE_ADAPTIVE_REACTION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
