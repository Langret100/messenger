const fs=require('fs'),vm=require('vm'),{performance}=require('perf_hooks');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');

// 1) Nickname privacy must be identical to the exhaustive old semantics while avoiding
// scanning only trie branches that can actually occur in the sentence.
const serverCtx={console,Date,Math,JSON};vm.createContext(serverCtx);vm.runInContext(gs,serverCtx);
const names=[];for(let i=0;i<6505;i++){const lead=String.fromCharCode(0xAC00+(i%400));names.push(`${lead}닉${String(i).padStart(5,'0')}`)}
function brute(text){let s=String(text);for(const raw of names){const n=String(raw).trim();if(n.length>=2&&s.includes(n))s=s.split(n).join('[사람]')}return s}
for(let i=0;i<300;i++){const picks=[names[(i*17)%names.length],names[(i*71+9)%names.length]];const text=`오늘 ${picks[0]}랑 얘기했고 ${picks[1]}도 봤어`;const fast=serverCtx.moaScrubKnownNicknames_(text,names);ok(fast===brute(text),'trie nickname scrub changed privacy semantics')}
const t0=performance.now();for(let i=0;i<1000;i++){const n=names[(i*43)%names.length];serverCtx.moaScrubKnownNicknames_(`학교에서 ${n} 봤어 ㅋㅋ`,names)}const nickMs=performance.now()-t0;
ok(nickMs<1500,`nickname privacy scrub performance regression: ${nickMs.toFixed(1)}ms`);
console.log('MOA_NICKNAME_TRIE_PERFORMANCE_OK',JSON.stringify({names:names.length,messages:1000,ms:+nickMs.toFixed(1)}));

// 2) moa_commit must not open/scan the dialogue-example sheet when the batch contains
// only policy feedback (common for proactive/initiative feedback).
const calls={policy:0,expression:0,dialogue:0};
serverCtx.moaAcquireLearningLease_=()=> 'lease';serverCtx.moaReleaseLearningLease_=()=>{};serverCtx.moaActivityTick_=()=>1;serverCtx.moaCurrentSyncVersion_=()=>1;serverCtx.moaCurrentCoreSyncVersion_=()=>0;
serverCtx.moaStorePolicyEvents_=()=>{calls.policy++;return false};serverCtx.moaStoreExpressionEvents_=()=>{calls.expression++;return false};serverCtx.moaStoreDialogueEvents_=()=>{calls.dialogue++;return false};serverCtx.jsonResponse_=x=>x;
const commit=serverCtx.moaCommit_({user_id:'u1',events_json:JSON.stringify([{type:'policy_feedback',signal:'positive'}])});
ok(commit.ok===true&&calls.policy===1&&calls.expression===1&&calls.dialogue===0,'policy-only commit touched unrelated dialogue sheet');
console.log('MOA_COMMIT_UNRELATED_SHEET_SKIP_OK');

// 3) Two tabs can finish network sync out of order. A late v6 response must never
// overwrite a v7 shared IndexedDB corpus written by another tab.
const engineSrc=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const store=new Map(),idb=new Map();let call=0,lockChain=Promise.resolve();
const persistence={get:(k,d)=>store.has(k)?store.get(k):d,set:(k,v)=>{store.set(k,v);return v},remove:k=>store.delete(k)};
const dataCache={get:async(type,key,fallback=null)=>idb.has(type+':'+key)?idb.get(type+':'+key):fallback,put:async(type,key,v)=>{await new Promise(r=>setTimeout(r,2));idb.set(type+':'+key,JSON.parse(JSON.stringify(v)));return v},remove:async(type,key)=>{idb.delete(type+':'+key)}};
const locks={request:(_name,_opts,work)=>{const run=lockChain.then(work,work);lockChain=run.catch(()=>{});return run}};
const clientCtx={console,Date,Math,JSON,URL,setTimeout,clearTimeout,globalThis:null,navigator:{locks},MiniTalk:{AI:{},Store:{get:()=>({user_id:'u1'})},Persistence:persistence,DataCache:dataCache,AuthApi:{moaSync:async()=>{call++;const n=call;if(n===1){await new Promise(r=>setTimeout(r,35));return{ok:true,version:6,coreVersion:0,patternDelta:[{id:'v6',trigger:'a',reply:'b',tier:'confirmed',evidenceCount:2}]}}await new Promise(r=>setTimeout(r,5));return{ok:true,version:7,coreVersion:0,patternDelta:[{id:'v7',trigger:'c',reply:'d',tier:'confirmed',evidenceCount:3}]}}}}};clientCtx.globalThis=clientCtx;vm.createContext(clientCtx);vm.runInContext(engineSrc,clientCtx);
idb.set('moa-learning-patterns:__public__',[{id:'v5',trigger:'x',reply:'y',tier:'confirmed',evidenceCount:1}]);store.set('moa.v93.publicPatternVersion',5);
(async()=>{const e=clientCtx.MiniTalk.AI.MoaCommunicationEngine;await Promise.all([e.sync(true),e.sync(true)]);const final=idb.get('moa-learning-patterns:__public__')||[];ok(final.some(x=>x.id==='v7'),'newer multi-tab pattern missing');ok(!final.some(x=>x.id==='v6')||Number(store.get('moa.v93.publicPatternVersion'))>=7,'late older sync regressed shared corpus');ok(Number(store.get('moa.v93.publicPatternVersion'))===7,'public sync version regressed');console.log('MOA_MULTITAB_SHARED_CACHE_MONOTONIC_OK');})().catch(e=>{console.error(e);process.exit(1)});
