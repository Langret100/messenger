const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('js/ai/moa-communication-engine.js','utf8').replace('return {reply,warmup,','return {dialoguePairSimilarity,statementBeforeQuestion,rememberedInterest,roughReplyRate,reply,warmup,');
function build({seed=3,profile={},memories={},patterns=[]}={}){
 const data={'moa.v91.profile.thread-user':profile,'moa.v91.memories.thread-user':memories};let n=seed,searches=0;const math=Object.create(Math);math.random=()=>((n=n*1664525+1013904223>>>0)/4294967296);
 const ctx={console,Date,Math:math,setTimeout:()=>1,clearTimeout(){},MiniTalk:{AI:{},Store:{get:()=>({user_id:'thread-user'})},Persistence:{get:(k,d)=>data[k]??d,set:(k,v)=>data[k]=structuredClone(v),remove:k=>delete data[k]},AuthApi:{moaSync:async()=>({ok:true,version:1,patterns,policy:{}}),moaCommit:async()=>({ok:true}),moaSearch:async()=>{searches++;return {reply:'SEARCH',source:'search'}}}}};vm.createContext(ctx);vm.runInContext(source,ctx);return {e:ctx.MiniTalk.AI.MoaCommunicationEngine,data,get searches(){return searches}};
}
(async()=>{
 let {e}=build();assert.strictEqual(e.statementBeforeQuestion('친구랑 축구했구나. 몇 대 몇이었어?'),'친구랑 축구했구나.');
 const commands=['아무 얘기나 해봐','다른 얘기 하자','너부터 말해봐','주제 바꾸자'];let env=build();e=env.e;
 for(const command of commands){const a=await e.reply(command);assert(a.source==='local-chat-thread',command+' => '+a.source+' '+a.reply);const b=await e.reply('너는?');assert(b.source==='local-chat-thread'&&!/[?？]/.test(b.reply),'reciprocal thread lost: '+b.reply);}
 assert.strictEqual(env.searches,0,'casual thread should not make search calls');
 ({e}=build());for(const text of ['밸런스게임 하자','1번','너는?','그만'])await e.reply(text);
 const requestedQuiz=await e.reply('퀴즈 하나 내줘');assert(requestedQuiz.source==='local-play'&&requestedQuiz.reply.length>24&&/[?？]/.test(requestedQuiz.reply),'question suppression erased a requested quiz: '+requestedQuiz.reply);
 const changedTopic=await e.reply('아무 얘기나 해봐');assert.strictEqual(changedTopic.source,'local-chat-thread','old topic route swallowed explicit switch');
 const answers={teleport:'여행',dayoff:'잠',season:'겨울',music:'반복',snack:'과자',travel:'즉흥',talent:'그림',smalljoy:'친구'};
 for(let seed=1;seed<=30;seed++){
  ({e}=build({seed}));await e.reply('아무 얘기나 해봐');const scene=e.debugSnapshot().state.chatThread;
  const reacted=await e.reply(answers[scene.id]);assert.strictEqual(reacted.source,'local-chat-thread','starter answer lost thread: '+scene.id+' '+reacted.reply);assert(!/[?？]/.test(reacted.reply),'a short answer should receive a reaction, not another question');
  const own=await e.reply('너는?');assert.strictEqual(own.source,'local-chat-thread');
  const math=await e.reply('12*8은?');assert.strictEqual(math.source,'local-utility');assert(/^96/.test(math.reply),'thread swallowed calculator');
 }
 for(let seed=1;seed<=16;seed++){
  ({e}=build({seed}));let a=await e.reply('밸런스게임 하자');assert(a.source==='local-play'&&/1번/.test(a.reply),'balance starter: '+a.source+' '+a.reply);
  a=await e.reply('1번');assert(a.source==='local-play'&&!/[?？]/.test(a.reply),'choice must receive a reaction: '+a.reply);
  a=await e.reply('너는?');assert(a.source==='local-play'&&!/[?？]/.test(a.reply),'balance reciprocity lost: '+a.reply);
  a=await e.reply('다음');assert(a.source==='local-play'&&/1번/.test(a.reply),'explicit next round missing');
  a=await e.reply('그만');assert(/여기까지/.test(a.reply),'stop not honored');
 }
 ({e}=build());let q=await e.reply('퀴즈 하나 내줘');assert(q.source==='local-play');const hint=await e.reply('힌트');assert(hint.source==='local-play'&&!/[?？]/.test(hint.reply),'hint must continue quiz');const reveal=await e.reply('정답 알려줘');assert(reveal.source==='local-play'&&/정답/.test(reveal.reply),'answer reveal lost: '+reveal.source+' '+reveal.reply);
 ({e}=build({memories:{like:[{value:'축구',updatedAt:2},{value:'피자',updatedAt:3}],dislike:[{value:'피자',updatedAt:4}]}}));assert.strictEqual(e.rememberedInterest(),'축구');e.setInitiativeSettings({quietStart:0,quietEnd:7});assert.strictEqual(e.initiativeSettings().quietStart,0,'midnight setting lost');
 ({e}=build());await e.reply('안녕');let spark=null;const noon=new Date();noon.setDate(noon.getDate()+2);noon.setHours(12,0,0,0);
 for(let i=0;i<20&&!spark;i++){const planned=e.maybeInitiate({now:noon.getTime()+i*1000,force:true,random:()=>.6});if(planned?.type==='conversation-spark')spark=planned;}
 assert(spark,'proactive conversation starter was never available');assert(!/[?？]/.test(spark.reply),'proactive spark should not pressure the user with a question');
 const sparkResponse=await e.reply('너는?');assert.strictEqual(sparkResponse.source,'local-chat-thread','proactive starter did not retain its thread');
 e.setInitiativeSettings({quietStart:0,quietEnd:23});assert.strictEqual(e.maybeInitiate({now:noon.getTime()+86400000,random:()=>0}),null,'midnight quiet-hours start was ignored');
 const patterns=[{id:'pair-no-spaces',trigger:'오늘진짜엄청졸리네',reply:'꾸벅꾸벅할 때지 ㅋㅋ 잠깐 눈이라도 쉬자.',confidence:1,tier:'confirmed',humanChat:true,strategy:'ack'}];
 env=build({patterns});await env.e.sync(true);const learned=await env.e.reply('오늘진짜엄청졸리네용');assert.strictEqual(learned.source,'learned-human','close Korean phrase not retrieved: '+learned.source+' '+learned.reply);
 assert.strictEqual(env.e.dialoguePairSimilarity('오늘100점받았어','오늘10점받았어'),0,'numeric changes are not superficial variants');
 env=build({patterns:[{...patterns[0],id:'rough-pair',trigger:'안녕',reply:'존나 반갑네 ㅋㅋ'}]});await env.e.sync(true);const safe=await env.e.reply('안녕');assert(!/존나/.test(safe.reply),'learned reply bypassed manner gate');
 ({e}=build());let old=e.mannerScore().score;for(const text of ['아 시발 피곤해','존나 힘들어','ㅅㅂ 또 졌어']){await e.reply(text);const next=e.mannerScore().score;assert(next<old,'swearing must lower score before saturation');old=next;}
 for(let i=0;i<15;i++)await e.reply('아 시발 게임 존나 힘들어');assert(e.mannerScore().roughReplyUnlocked===(e.roughReplyRate()>0),'reported rough gate differs from actual gate');
 let roughHits=0;for(let i=0;i<25;i++){const r=await e.reply('오늘 게임에서 졌어');if(/와 씨|아 씨/.test(r.reply))roughHits++;assert(r.reply.length>8,'rough mode discarded content');}assert(roughHits>0,'rough user never gets rough emphasis');
 ({e}=build());for(let i=0;i<15;i++){const r=await e.reply('오늘도 고마워요');assert(!/(?:아 씨|와 씨|시발|존나)/.test(r.reply),'rough tone leaked into polite dialogue');}
 ({e}=build());for(const text of ['문제의 시발점이야','허리띠를 졸라매다','사회에 미친 영향'])await e.reply(text);assert.strictEqual(e.mannerScore().profanityHits,0,'ordinary Korean words counted as swearing');assert.strictEqual(e.mannerScore().profanityDebt,0);
 console.log('MOA_LOCAL_DIALOGUE_THREAD_REGRESSION_OK: reciprocity, games, hints, retrieval, memories, quiet hours, manner and tone');
})().catch(err=>{console.error(err);process.exitCode=1});
