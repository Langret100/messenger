const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),engine=read('js/ai/moa-communication-engine.js'),api=read('js/adapters/auth-api.js'),code=read('docs/apps-script/Code.gs'),gs=read('docs/apps-script/MOA_AI.gs'),sw=read('sw.js');
ok(html.includes('moa-communication-engine.js?v=43'),'v89 cache bust missing');
ok(sw.includes('moaru-moa-dialogue-fusion-final'),'v89 service worker cache missing');
ok(!fs.existsSync('docs/apps-script/MOA_CHAT.gs')&&!fs.existsSync('docs/apps-script/MOA_LEARNING.gs'),'legacy MOA GS docs remain');
for(const route of ['moa_sync','moa_commit','moa_search'])ok(code.includes(`case "${route}"`),`missing route ${route}`);
for(const gone of ['moa_chat','moa_feedback','moa_learn','moa_memory_get','moa_memory_set','moa_topic_observe','moa_reaction_observe'])ok(!code.includes(`case "${gone}"`),`legacy route remains ${gone}`);
for(const token of ['responseMoveEligibility','speechAct','topicContinuity','dialoguePhase','continuationSignal','policyKey'])ok(engine.includes(token),'v89 engine missing '+token);
ok(gs.includes('CacheService.getScriptCache()')&&gs.includes('moaPublicSnapshot_'),'public sync cache missing');
ok(!gs.includes('moaLearningTier_')&&gs.includes('moaPolicyLearningTier_'),'policy-only public learning gate missing');
ok(api.includes('mode: "moa_commit"')&&api.includes('mode: "moa_search"'),'api wiring missing');

const store={};let commits=[],searches=[];const fakeMath=Object.create(Math);fakeMath.random=()=>0.01;
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'u1',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{
  moaSync:async()=>({ok:true,version:12,policy:{}}),
  moaSearch:async({query})=>{searches.push(query);return {reply:'SEARCH:'+query,source:'test-search',kind:'general'}},
  moaCommit:async p=>{commits.push(p);return {ok:true,version:13}}
}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;await e.sync(true);
 let r=await e.reply('세종대왕');ok(r.source==='local','neutral topic should stay local');
 r=await e.reply('그게 누구야');ok(r.reply==='SEARCH:세종대왕'&&searches.at(-1)==='세종대왕','resolved follow-up search failed');
 searches=[];r=await e.reply('넌 멍청해');ok(searches.length===0&&!/어떤 느낌/.test(r.reply),'insult regression');
 r=await e.reply('오늘 학교 힘들었어');ok(/힘들|신경|별로|기분|상했/.test(r.reply),'local empathy response regressed');
 await e.reply('완전 다른 주제로 축구 봤어');await e.flushCommit();
 const feedback=(commits.flatMap(x=>x.events||[]));
 ok(feedback.every(x=>['policy_feedback','dialogue_example'].includes(x.type)),'unexpected MOA commit event leaked');ok(feedback.filter(x=>x.type==='policy_feedback').every(x=>!('trigger' in x)&&!('reply' in x)),'policy feedback gained raw dialogue');ok(feedback.filter(x=>x.type==='dialogue_example').every(x=>!('profile' in x)&&!('memory' in x)&&!('userId' in x)),'personal profile leaked into common dialogue learning');
 await e.reply('나는 보드게임 좋아해');r=await e.reply('내가 뭐 좋아한다고 했지?');ok(/보드게임/.test(r.reply),'local explicit memory missing');
 const snap=e.debugSnapshot();ok(snap.version===93&&snap.state.phase,'v89 state/version missing');
 console.log('MOA_V89_CLEAN_POLICY_ENGINE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
