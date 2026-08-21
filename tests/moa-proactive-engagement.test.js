const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const read=p=>fs.readFileSync(p,'utf8');
const html=read('index.html'),engine=read('js/ai/moa-communication-engine.js'),chat=read('js/features/moa-chat.js'),css=read('css/features/moa-chat.css'),gs=read('docs/apps-script/MOA_AI.gs'),sw=read('sw.js');
ok(html.includes('moa-chat.css?v=6')&&html.includes('moa-communication-engine.js?v=17')&&html.includes('moa-chat.js?v=14'),'v90 cache bust missing');
ok(sw.includes('moaru-face-memory-cleanup'),'v90 service worker cache missing');
for(const token of ['maybeInitiate','proactiveCandidates','dueOpenLoop','strongestInterest','starterSuggestions','initiativeSettings','PROACTIVE_CHANCE_GAP'])ok(engine.includes(token),'proactive engine missing '+token);
for(const token of ['refreshProactive','moa-proactive-unread','먼저 말 걸기','unread:true'])ok(chat.includes(token),'v90 proactive chat UI missing '+token);
ok(!chat.includes('moa-suggestion-row')&&!chat.includes('moa-suggestion-chip')&&!chat.includes('starterRows'),'removed MOA quick-suggestion UI returned');
ok(css.includes('.moa-proactive-unread'),'v90 unread style missing');
ok(!gs.includes('MOA_PROFILE_SHEET')&&!gs.includes('MOA_MEMORY_SHEET')&&gs.includes('policy_feedback'),'server must be public-policy only');
ok(gs.includes('function moaCleanupLegacySheets()'),'cleanup function missing');

const store={};let commits=[];const fakeMath=Object.create(Math);fakeMath.random=()=>0;
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'u1',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{
  moaSync:async()=>({ok:true,version:20,policy:{}}),
  moaSearch:async({query})=>({reply:'SEARCH:'+query,source:'test-search',kind:'general'}),
  moaCommit:async p=>{commits.push(p);return {ok:true,version:21}}
}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;await e.sync(true);
 await e.reply('내일 시험이야');
 const now=Date.now()+2*86400000;
 const p=e.maybeInitiate({now,force:true});ok(p&&p.source==='proactive'&&/시험/.test(p.reply),'dated open-loop proactive follow-up missing');
 let snap=e.debugSnapshot();ok(snap.version===91&&snap.state.openLoops.length>=1&&typeof snap.profile.initiative==='number','v90 engagement state missing');
 const before=snap.profile.initiative;await e.reply('응 잘 봤어');snap=e.debugSnapshot();ok(snap.profile.initiative>before,'proactive reply did not improve initiative preference');
 const chips=e.starterSuggestions();ok(Array.isArray(chips)&&chips.length>=4&&chips.some(v=>/심심|오늘|하루/.test(v.label)),'social starter suggestions missing');
 e.setInitiativeSettings({enabled:false});ok(e.maybeInitiate({now:now+86400000,force:true})===null,'initiative opt-out ignored');
 await e.flushCommit();ok(commits.flatMap(x=>x.events||[]).some(v=>v.type==='policy_feedback'&&v.strategy==='initiative'),'initiative feedback was not batched');
 console.log('MOA_V90_PROACTIVE_ENGAGEMENT_OK');
})().catch(e=>{console.error(e);process.exit(1)});
