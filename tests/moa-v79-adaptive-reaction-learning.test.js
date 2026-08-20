const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const core=fs.readFileSync('js/ai/moa-dialogue-core.js','utf8');
const engine=fs.readFileSync('js/ai/moa-chat-engine.js','utf8');
const api=fs.readFileSync('js/adapters/auth-api.js','utf8');
const learn=fs.readFileSync('docs/apps-script/MOA_LEARNING.gs','utf8');
const code=fs.readFileSync('docs/apps-script/Code.gs','utf8');
const feature=fs.readFileSync('js/features/moa-chat.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8'),app=fs.readFileSync('js/app.js','utf8');

ok(html.includes('js/ai/moa-chat-engine.js?v=11')&&html.includes('js/features/moa-chat.js?v=6')&&html.includes('js/adapters/auth-api.js?v=64.5.30'),'v79 client cache bust missing');
ok(sw.includes('moaru-v64.5.48-moa-holistic-v84-20260820')&&app.includes('sw.js?v=64.5.48'),'v79 service worker cache bump missing');
ok(engine.includes('reactionAliasGroups'),'wide reaction alias groups missing');
ok(engine.includes('reactionTypoAliases')&&engine.includes('anchoredReactionTag'),'safe typo/attached slang handling missing');
ok(!engine.includes('fuzzyReactionTag'),'unsafe edit-distance reaction matching must stay removed');
ok(engine.includes('contrast=raw.split'),'contrast-tail override missing');
ok(engine.includes('extractUnknownReactionTerms')&&engine.includes('observeUnknownReaction'),'unknown reaction discovery missing');
ok(engine.includes('learnedReactionLexicon')&&engine.includes('ensureReactionLexicon'),'adaptive reaction lexicon missing');
ok(feature.includes('MoaChatEngine.warmup'),'reaction lexicon background warmup missing');
ok(api.includes('moaReactionObserve')&&api.includes('moaReactionLexicon'),'reaction learning adapters missing');
ok(code.includes('moa_reaction_observe')&&code.includes('moa_reaction_lexicon'),'reaction learning Apps Script routes missing');
ok(learn.includes('MOA_REACTION_SHEET')||learn.includes('moaReactionSheet_'),'reaction learning sheet missing');
ok(learn.includes('summary.promotable'),'v80 strict promotion gate missing');
ok(learn.includes('status==="active"')&&learn.includes('moaReactionLexicon_'),'active learned reaction lexicon missing');

let feedback=[],observed=[];
const ctx={console,Math,Date,setTimeout,clearTimeout,MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:'u1',nickname:'테스트'}:{}},Persistence:{get:()=>[],set:()=>{},remove:()=>{}},Tools:{},AuthApi:{
  moaSearch:async()=>({}),moaChat:async()=>({}),
  moaFeedback:async args=>{feedback.push(args);return{}},
  moaReactionObserve:async args=>{observed.push(args);return{}},
  moaReactionLexicon:async()=>({entries:[{expression:'개추',tag:'agreement',confidence:.88}]}),
  moaMemoryGet:async()=>({}),moaMemorySet:async()=>({})
}}};
vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaChatEngine;
(async()=>{
  await E.warmup();
  async function signal(text,reaction,tag){
    await E.reply('안녕');const n=feedback.length;await E.reply(text);ok(feedback.length===n+1,'feedback missing: '+text);const f=feedback.at(-1);ok(f.reaction===reaction&&f.reactionTag===tag,`${text}: ${f.reaction}/${f.reactionTag}`);
  }
  for(const x of ['굳굳','마즘','개인정','오케바리','감삼'])await signal(x,'positive',x==='감삼'?'gratitude':'agreement');
  for(const x of ['구리네','에반데','별론듯'])await signal(x,'negative','negative');
  await signal('미쳤냐ㅋㅋ','positive','playful_positive');
  await signal('ㅇㅋ 근데 그건 아님','correction','correction');
  await E.reply('안녕');let n=feedback.length;await E.reply('맞음?');ok(feedback.length===n,'question-form agreement must remain uncertain');

  // 서버에서 여러 사용자에게 검증돼 active가 된 새 표현을 받아 즉시 이해해야 함.
  await signal('개추','positive','agreement');

  // 알려진 anchor와 함께 등장한 새 토큰은 의미 증거를 모으되 바로 사전에 확정하지 않음.
  await E.reply('안녕');observed.length=0;await E.reply('개꿀 인정');
  ok(observed.some(v=>v.suggestedTag==='agreement'&&v.unknownTerms.includes('개꿀')),'safe slang evidence extraction missing');

  console.log('MOA_V79_ADAPTIVE_REACTION_LEARNING_OK');
})().catch(e=>{console.error(e);process.exit(1)});
