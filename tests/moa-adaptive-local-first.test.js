const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),engine=read('js/ai/moa-communication-engine.js'),feature=read('js/features/moa-chat.js'),api=read('js/adapters/auth-api.js'),code=read('docs/apps-script/Code.gs'),ai=read('docs/apps-script/MOA_AI.gs'),sw=read('sw.js');
ok(html.includes('js/ai/moa-communication-engine.js?v=50')&&!html.includes('moa-dialogue-core.js')&&!html.includes('moa-chat-engine.js'),'v87 compatibility engine asset mismatch');
ok(sw.includes('moaru-moa-dialogue-fusion-final')&&sw.includes('./js/ai/moa-communication-engine.js'),'v87 compatibility SW asset mismatch');
ok(feature.includes('MoaCommunicationEngine.reply')&&feature.includes('MoaCommunicationEngine.warmup'),'feature not wired to v87 engine');
for(const route of ['moa_sync','moa_commit','moa_search'])ok(code.includes(`case "${route}"`),`missing ${route}`);
for(const gone of ['moa_chat','moa_feedback','moa_topic_observe','moa_reaction_observe','moa_reaction_lexicon','moa_learn','moa_memory_get','moa_memory_set'])ok(!code.includes(`case "${gone}"`),`legacy route remains ${gone}`);
ok(api.includes('mode: "moa_commit"')&&api.includes('known_version')&&!api.includes('mode: "moa_learn"'),'auth API not v87 batched/local-first');
ok(!ai.includes('MOA_PROFILE_SHEET')&&!ai.includes('MOA_MEMORY_SHEET')&&ai.includes('function moaCommit_')&&ai.includes('moaPolicyLearningTier_'),'public-only ownership boundary missing');
ok(ai.includes('function moaSearchAssist_')&&!ai.includes('function moaChatResponse_'),'server still owns dialogue');

const store={}; let commits=[]; let searches=[];
const fakeMath=Object.create(Math);fakeMath.random=()=>0.01;
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'u1',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{
  moaSync:async()=>({ok:true,version:3,policy:{}}),
  moaSearch:async({query})=>{searches.push(query);return {reply:`SEARCH:${query}`,source:'test-search',kind:'general'}},
  moaCommit:async payload=>{commits.push(payload);return {ok:true,version:4}}
}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
 await e.sync(true);
 let r=await e.reply('넌 멍청해');ok(!/어떤 느낌|멍청해는|질문을 다시|맥락을 못 따라갔/.test(r.reply)&&r.source==='local','insult response regressed: '+r.reply);
 await e.reply('세종대왕');r=await e.reply('그게 누구야');ok(r.reply==='SEARCH:세종대왕','reference/search routing failed: '+r.reply);ok(searches.at(-1)==='세종대왕','wrong resolved search query');
 r=await e.reply('안녕');ok(/^local/.test(r.source)&&!r.reply.startsWith('SEARCH:'),'small talk incorrectly searched');
 r=await e.reply('오늘 학교 힘들었어');ok(/힘들|신경|별로|기분|상했/.test(r.reply),'local response regressed: '+r.reply);
 await e.reply('맞아');const snap=e.debugSnapshot();ok(snap.profile.questionTolerance<.5 || snap.profile.brevity!==.6,'local style profile did not adapt');
 await e.flushCommit();const sent=commits.flatMap(x=>x.events||[]);ok(sent.some(v=>v.type==='policy_feedback')&&sent.every(v=>['policy_feedback','dialogue_example'].includes(v.type))&&!('profile' in commits[0]),'public common-learning commit boundary failed');ok(sent.filter(v=>v.type==='dialogue_example').every(v=>!('userId' in v)&&!('profile' in v)&&!('memory' in v)),'dialogue example carried personal profile data');
 await e.reply('나는 보드게임 좋아해');r=await e.reply('내가 뭐 좋아한다고 했지?');ok(/보드게임/.test(r.reply),'local personal memory missing');
 await e.reply('규칙이 어려웠어');r=await e.reply('아까 뭐 얘기했지?');ok(/규칙이 어려웠어/.test(r.reply),'episodic recall missing: '+r.reply);
 for(let i=0;i<4;i++){r=await e.reply('오늘 별일 없었어');ok(!/어떤 느낌/.test(r.reply),'generic grammar regression');}
 console.log('MOA_V87_ADAPTIVE_LOCAL_FIRST_OK');
})().catch(e=>{console.error(e);process.exit(1)});
