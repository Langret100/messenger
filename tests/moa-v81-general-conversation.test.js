const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const core=fs.readFileSync('js/ai/moa-dialogue-core.js','utf8');
const engine=fs.readFileSync('js/ai/moa-chat-engine.js','utf8');
const server=fs.readFileSync('docs/apps-script/MOA_CHAT.gs','utf8');
const html=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
ok(html.includes('js/ai/moa-chat-engine.js?v=12'),'v81 engine cache bust missing');
ok(sw.includes('moaru-v64.5.48-moa-conversation-v85-20260820'),'v81 service worker cache missing');
ok(engine.includes('function isPureReaction')&&engine.includes('function naturalStatementReply')&&engine.includes('function selfPreferenceReply'),'v81 conversation router missing');
ok(engine.includes("st.mode==='joke'")&&engine.includes('다른거해봐'),'joke continuation state missing');
ok(server.includes('var normalized=raw.replace(/^(오늘|지금|내일)'), 'weather prefix normalization missing');
let feedback=[];
const ctx={console,Math,Date,setTimeout,clearTimeout,MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:'u1',nickname:'테스트'}:{}},Persistence:{get:()=>[],set:()=>{},remove:()=>{}},Tools:{},AuthApi:{
 moaSearch:async()=>({}),moaChat:async()=>({}),moaFeedback:async a=>{feedback.push(a);return{}},
 moaReactionObserve:async()=>({}),moaReactionLexicon:async()=>({entries:[]}),moaMemoryGet:async()=>({}),moaMemorySet:async()=>({})
}}};
vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaChatEngine;
(async()=>{
 const r1=await E.reply('오늘 학교에서 축구했어'); ok(r1.source==='dialogue_core'&&!/조금만 더 알려줘|에 대해 조금만/.test(r1.reply),'general sports statement not handled by dialogue core: '+r1.reply);
 const before=feedback.length, r2=await E.reply('진짜 재밌었음ㅋㅋ'); ok(feedback.length===before,'new story with laughter mislearned as feedback');ok(/재밌|기억|좋았|말해/.test(r2.reply),'fun statement not handled naturally');
 const r3=await E.reply('친구가 두 골 넣었어');ok(r3.source==='dialogue_core'&&!/조금만 더 알려줘/.test(r3.reply),'third-party event not handled generically');
 const r4=await E.reply('걔 원래 축구 잘해');ok(/친구|계속|얘기/.test(r4.reply),'pronoun/person follow-up not handled');
 const r5=await E.reply('나도 한 골 넣었지');ok(r5.source==='dialogue_core','own event statement not handled by dialogue core');
 const r6=await E.reply('근데 마지막에 졌어');ok(/아쉽|힘들|빡|괜찮|기분|다음/.test(r6.reply),'loss statement not handled');
 const r7=await E.reply('너는 축구 좋아해?');ok(/축구|좋아/.test(r7.reply),'moa preference question not handled');
 await E.reply('농담해줘');const n=feedback.length;const bad=await E.reply('아 그건 좀 노잼인데');ok(feedback.length===n+1&&feedback.at(-1).reactionTag==='negative','joke negative feedback missing');ok(/인정|실패|약했다/.test(bad.reply),'joke negative response unnatural');
 const again=await E.reply('다른 거 해봐');ok(/ㅋㅋ/.test(again.reply),'joke retry did not continue joke mode');
 for(const x of [r1,r2,r3,r4,r5,r6,r7,bad,again])ok(!/조금만 더 알려줘|에 대해 조금만/.test(x.reply),'old awkward fallback leaked: '+x.reply);
 console.log('MOA_V81_GENERAL_CONVERSATION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
