const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('moa-communication-engine.js?v=47'),'public example cache bust missing');
for(const token of ['MOA_EXAMPLE_SHEET','모아_대화예시','moaStoreDialogueEvents_','moaPublicExamples_','moaPublicHumanPatterns_','dialogue_example'])ok(gs.includes(token),'server common-example learning missing '+token);
for(const token of ['publicExampleText','commonDialogueExampleEvent','type:"dialogue_example"','learnedCandidates'])ok(engine.includes(token),'client common-example learning missing '+token);
ok(/(?:비밀번호|주민\(\?:등록\)\?번호|계좌번호)/.test(gs),'server privacy guard missing');

const store={};let commits=[];let syncPayload={ok:true,version:77,policy:{},expressionWeights:{},patterns:[]};
const fakeMath=Object.create(Math);fakeMath.random=()=>0.02;
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'public-u',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=JSON.parse(JSON.stringify(v)),remove:k=>delete store[k]},AuthApi:{moaSync:async()=>syncPayload,moaSearch:async()=>({}),moaCommit:async p=>{commits.push(p);return {ok:true}}}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{
 const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;await e.sync(true);
 await e.reply('오늘 학교 진짜 힘들었어');await e.reply('맞아');await e.flushCommit();
 let events=commits.flatMap(v=>v.events||[]),examples=events.filter(v=>v.type==='dialogue_example');
 ok(examples.length>=1,'positive conversation did not create common dialogue example');
 ok(examples.some(v=>/학교/.test(v.trigger)&&v.reply),'common example lost useful dialogue text');
 ok(examples.every(v=>!('profile' in v)&&!('memory' in v)&&!('userId' in v)),'personal state leaked to common example');
 commits=[];
 await e.reply('내 비밀번호는 123456이야');await e.reply('맞아');await e.flushCommit();
 examples=commits.flatMap(v=>v.events||[]).filter(v=>v.type==='dialogue_example');
 ok(examples.every(v=>!/비밀번호|123456/.test(String(v.trigger||''))),'sensitive text entered public common learning');
 // Synced public examples must actually participate in reply generation, not merely be stored.
 syncPayload={ok:true,version:78,policy:{},expressionWeights:{},patterns:[{id:'x-test',trigger:'오늘 급식 진짜 별로였어',reply:'아 오늘 급식 완전 꽝이었네 ㅋㅋ 오후까지 아쉬웠겠다.',act:'statement',affect:'negative',strategy:'empathy',confidence:.96,tier:'confirmed'}]};
 await e.sync(true);
 const r=await e.reply('오늘 급식 진짜 별로였어');
 ok(/급식|꽝|아쉬/.test(r.reply),'synced public dialogue example was not usable: '+r.reply);
 console.log('MOA_PUBLIC_DIALOGUE_EXAMPLES_OK');
})().catch(e=>{console.error(e);process.exit(1)});
