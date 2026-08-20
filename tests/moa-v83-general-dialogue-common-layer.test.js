const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const core=fs.readFileSync('js/ai/moa-dialogue-core.js','utf8');
const engine=fs.readFileSync('js/ai/moa-chat-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
ok(html.includes('js/ai/moa-chat-engine.js?v=11'),'v83 engine cache bust missing');
ok(sw.includes('moaru-v64.5.48-moa-holistic-v84-20260820'),'v83 service worker cache missing');
ok(engine.includes('function genericStatementReply'),'v83 generic statement layer missing');
ok(engine.includes('conversationState.delete(key)')&&engine.includes('lastReplyByUser.delete(key)'),'v83 context-state reset missing');
let feedback=[];
const ctx={console,Math,Date,setTimeout,clearTimeout,MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:'u1',nickname:'테스트'}:{}},Persistence:{get:()=>[],set:()=>{},remove:()=>{}},Tools:{},AuthApi:{
 moaSearch:async()=>({}),moaChat:async()=>({}),moaFeedback:async a=>{feedback.push(a);return{}},
 moaReactionObserve:async()=>({}),moaReactionLexicon:async()=>({entries:[]}),moaMemoryGet:async()=>({}),moaMemorySet:async()=>({})
}}};
vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaChatEngine;
(async()=>{
 let r=await E.reply('오늘 미술시간에 그림 그렸어');
 ok(!/^오, 그래서 어떻게 됐어\?$/.test(r.reply),'art statement hit repetitive fallback: '+r.reply);
 ok(r.source==='dialogue_core'&&/미술|그림|그다음|어떻게|얘기/.test(r.reply),'art statement not handled by common layer: '+r.reply);
 r=await E.reply('생각보다 잘 그려졌어');
 ok(/잘됐|잘된|뿌듯|만족|성공/.test(r.reply),'positive result not handled: '+r.reply);
 r=await E.reply('진짜 어려웠음');
 ok(/힘들|어려|빡|아쉽|괜찮/.test(r.reply),'difficulty result not handled: '+r.reply);
 r=await E.reply('오늘 급식 레전드였음');
 ok(r.source==='dialogue_core'&&/급식|어떻게|그다음|얘기/.test(r.reply),'ambiguous event not handled by common layer: '+r.reply);
 r=await E.reply('너 이름 뭐야?');ok(/모아/.test(r.reply),'name question missing: '+r.reply);
 r=await E.reply('너 몇 살이야?');ok(/나이|사람처럼|모아/.test(r.reply),'age question missing: '+r.reply);
 r=await E.reply('너 뭐 할 수 있어?');ok(/계산|타이머|검색|잡담/.test(r.reply),'capabilities question missing: '+r.reply);
 r=await E.reply('뭐하고 놀까?');ok(/퀴즈|가위바위보|농담|수다/.test(r.reply),'play suggestion missing: '+r.reply);
 await E.reply('오늘 떡볶이 먹었어');
 E.clearContext();
 r=await E.reply('그게 아니라 내일 가자고 하더라');
 ok(!/음식|떡볶이|아까 .*얘기/.test(r.reply),'clearContext leaked old topic/state: '+r.reply);
 console.log('MOA_V83_GENERAL_DIALOGUE_COMMON_LAYER_OK');
})().catch(e=>{console.error(e);process.exit(1)});
