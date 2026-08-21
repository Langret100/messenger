const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),engine=read('js/ai/moa-communication-engine.js'),api=read('js/adapters/auth-api.js'),code=read('docs/apps-script/Code.gs'),gs=read('docs/apps-script/MOA_AI.gs'),sw=read('sw.js');
ok(html.includes('moa-communication-engine.js?v=11'),'v89 cache bust missing');
ok(sw.includes('moaru-v64.5.63-task-tools-ui-20260821'),'v89 service worker cache missing');
ok(!fs.existsSync('docs/apps-script/MOA_CHAT.gs')&&!fs.existsSync('docs/apps-script/MOA_LEARNING.gs'),'legacy MOA GS docs remain');
for(const route of ['moa_sync','moa_commit','moa_search'])ok(code.includes(`case "${route}"`),`missing route ${route}`);
for(const gone of ['moa_chat','moa_feedback','moa_learn','moa_memory_get','moa_memory_set','moa_topic_observe','moa_reaction_observe'])ok(!code.includes(`case "${gone}"`),`legacy route remains ${gone}`);
for(const token of ['responseMoveEligibility','speechAct','topicContinuity','dialoguePhase','continuationSignal','policyKey'])ok(engine.includes(token),'v89 engine missing '+token);
ok(gs.includes('CacheService.getScriptCache()')&&gs.includes('moaPublicSnapshot_'),'public sync cache missing');
ok(gs.includes('moaLearningTier_')&&gs.includes('moaPolicyLearningTier_'),'tiered public policy gate missing');
ok(api.includes('mode: "moa_commit"')&&api.includes('mode: "moa_search"'),'api wiring missing');

const store={};let commits=[],searches=[];const fakeMath=Object.create(Math);fakeMath.random=()=>0.01;
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'u1',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{
  moaSync:async()=>({ok:true,version:12,patterns:[{id:'good1',trigger:'오늘 학교 힘들었어',reply:'오늘 꽤 힘들었겠다.',confidence:.92,act:'statement',affect:'negative',strategy:'empathy'}],policy:{},profile:{brevity:.6,questionTolerance:.45,playfulness:.5,empathy:.65,directness:.6},memories:{like:{value:'보드게임',label:'좋아하는 것'}}}),
  moaSearch:async({query})=>{searches.push(query);return {reply:'SEARCH:'+query,source:'test-search',kind:'general'}},
  moaCommit:async p=>{commits.push(p);return {ok:true,version:13}}
}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;await e.sync(true);
 let r=await e.reply('세종대왕');ok(r.source==='local','neutral topic should stay local');
 r=await e.reply('그게 누구야');ok(r.reply==='SEARCH:세종대왕'&&searches.at(-1)==='세종대왕','resolved follow-up search failed');
 searches=[];r=await e.reply('넌 멍청해');ok(searches.length===0&&!/어떤 느낌/.test(r.reply),'insult regression');
 r=await e.reply('오늘 학교 힘들었어');ok(r.source==='learned'&&/힘들/.test(r.reply),'safe learned empathy did not win');
 await e.reply('완전 다른 주제로 축구 봤어');await e.flushCommit();
 const feedback=(commits.flatMap(x=>x.events||[])).filter(x=>x.type==='feedback');
 ok(!feedback.some(x=>x.followup==='완전 다른 주제로 축구 봤어'&&x.weight===0.35),'unrelated topic switch incorrectly rewarded previous turn');
 r=await e.reply('내가 뭐 좋아한다고 했지?');ok(/보드게임/.test(r.reply),'cached explicit memory missing');
 const snap=e.debugSnapshot();ok(snap.version===91&&snap.state.phase,'v89 state/version missing');
 console.log('MOA_V89_CLEAN_POLICY_ENGINE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
