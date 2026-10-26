const fs=require('fs'),vm=require('vm'),assert=require('assert');
let source=fs.readFileSync('js/ai/moa-communication-engine.js','utf8').replace('return {reply,warmup,','return {CHAT_DAD_JOKES,composeInitiative,proactiveCandidates,reply,warmup,');
function build(seed=3){let n=seed;const data={},math=Object.create(Math);math.random=()=>((n=n*1664525+1013904223>>>0)/4294967296);const ctx={console,Date,Math:math,setTimeout:()=>1,clearTimeout(){},MiniTalk:{AI:{},Store:{get:()=>({user_id:'joke-user'})},Persistence:{get:(k,d)=>data[k]??d,set:(k,v)=>data[k]=structuredClone(v),remove:k=>delete data[k]},AuthApi:{moaSync:async()=>({ok:true,version:1,patterns:[]}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({source:'search',reply:'SEARCH'})}}};vm.createContext(ctx);vm.runInContext(source,ctx);return {e:ctx.MiniTalk.AI.MoaCommunicationEngine,ctx};}
(async()=>{
 for(const request of ['웃겨줘','나 좀 웃겨줘','웃겨봐','개그 하나 해줘','농담 하나 해줘','아재개그 해봐','웃긴말 해줘']){const {e}=build();const r=await e.reply(request);assert(r.source==='local-play'&&/ㅋㅋ/.test(r.reply)&&r.reply.length>25,'direct joke request failed: '+request+' => '+r.source+' '+r.reply);assert(/:e13:/.test(r.reply),'direct joke did not use existing image emoticon');}
 const {e}=build(),seen=new Set();
 for(let i=0;i<12;i++){
  let r=await e.reply('아재개그 하나 내줘');assert(r.source==='local-play'&&/맞혀봐/.test(r.reply),'guess request failed');const id=e.debugSnapshot().state.chatMiniGame.id;seen.add(id);
  r=await e.reply('힌트');assert(r.source==='local-play'&&!/SEARCH/.test(r.reply),'joke hint lost context');
  r=await e.reply('정답 알려줘');assert(r.source==='local-play'&&r.reply.length>12&&!/맞혀봐/.test(r.reply),'punchline/reveal failed');
  r=await e.reply('ㅋㅋㅋ');assert(r.source==='local-play'&&/성공/.test(r.reply),'laughter not recognized');
 }
 assert(seen.size>=9,'jokes repeated too often: '+seen.size);
 await e.reply('아재개그 하나 내줘');let r=await e.reply('노잼');assert(/접어둘게/.test(r.reply)&&!/[?？]/.test(r.reply),'negative feedback should not push another joke');
 await e.reply('아재개그 하나 내줘');r=await e.reply('다른 얘기 하자');assert(r.source==='local-chat-thread','topic switch swallowed by joke');r=await e.reply('12*8은?');assert(r.source==='local-utility'&&/^96/.test(r.reply),'joke swallowed calculator');
 // A proactive joke is stored as the same game, so the next user turn can ask for its answer.
 const env=build();env.e.composeInitiative({type:'dad-joke'},Date.now(),{},()=>0);const game=env.e.debugSnapshot().state.chatMiniGame;
 env.ctx.MiniTalk.Persistence.set('moa.v91.context.joke-user',[{role:'assistant',text:'왕이 넘어지면? 맞혀봐',source:'proactive',initiativeType:'dad-joke'}]);
 // New engine loads the persisted proactive context, just as a reopened page does.
 vm.runInContext(source,env.ctx);r=await env.ctx.MiniTalk.AI.MoaCommunicationEngine.reply('킹콩?');assert(r.source==='local-play'&&/맞았어/.test(r.reply),'proactive joke answer not accepted: '+r.reply);
 assert(game.id==='king');
 const mood=build();r=await mood.e.reply('기분 좀 풀어줘');assert(r.source==='local-play'&&/개그/.test(r.reply),'mood-lift request did not get gentle humor');r=await mood.e.reply('노잼');assert(/접어둘게/.test(r.reply));r=await mood.e.reply('기분 좀 풀어줘');assert(!/내 썰렁한 개그/.test(r.reply),'rejected humor was pushed again');
 const serious=build();r=await serious.e.reply('친구랑 싸워서 너무 우울해');assert(!/내 썰렁한 개그|킹콩|헐레벌떡/.test(r.reply),'joke interrupted a specific distressing event');
 const emojiSrc=fs.readFileSync('js/chat/emoji.js','utf8'),chatSrc=fs.readFileSync('js/features/moa-chat.js','utf8');assert(chatSrc.includes('MiniTalk.Chat.Emoji.appendText(part,node)'),'MOA does not use existing image renderer');
 assert(fs.existsSync('assets/emoticons/e13.png')&&fs.existsSync('assets/emoticons/e17.png'));assert(emojiSrc.includes('img.onerror'),'image fallback missing');
 console.log('MOA_DAD_JOKE_CONVERSATION_OK: direct/guess, hints, reveals, laughter, stop feedback, proactive continuity, image emoticons');
})().catch(e=>{console.error(e);process.exitCode=1});
