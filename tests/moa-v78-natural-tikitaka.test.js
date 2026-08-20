const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const core=fs.readFileSync('js/ai/moa-dialogue-core.js','utf8');
const engine=fs.readFileSync('js/ai/moa-chat-engine.js','utf8');
const api=fs.readFileSync('js/adapters/auth-api.js','utf8');
const chatGs=fs.readFileSync('docs/apps-script/MOA_CHAT.gs','utf8');
const learnGs=fs.readFileSync('docs/apps-script/MOA_LEARNING.gs','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('js/ai/moa-chat-engine.js?v=11'),'v78 engine cache bust missing');
ok(html.includes('js/adapters/auth-api.js?v=64.5.30'),'v78 auth cache bust missing');
ok(engine.includes('builtin:${id}:${index}'),'builtin answer variants must learn independently');
ok(engine.includes('shouldTryLearnedFirst')&&engine.indexOf('shouldTryLearnedFirst(raw)')<engine.indexOf('const builtin=builtinReply(raw)'),'learned answer must be considered before builtin fallback');
ok(engine.includes('jokeAssist')&&engine.includes('socialReactionReply'),'banter/joke layer missing');
ok(engine.includes('reactionTag:signal.tag'),'reaction subtype must be sent to server');
ok(api.includes('reactionTag = ""')&&api.includes('reaction_tag: reactionTag'),'reaction subtype adapter missing');
ok(chatGs.includes('reaction_profile'),'phrase reaction profile sheet column missing');
ok(learnGs.includes('moaReactionProfileAdd_')&&learnGs.includes('reactionTag||reaction'),'distinct-user reaction profile learning missing');

let feedback=[];
const ctx={console,Math,Date,setTimeout,clearTimeout,MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:'u1',nickname:'테스트'}:{}},Persistence:{get:()=>[],set:()=>{},remove:()=>{}},Tools:{},AuthApi:{moaSearch:async()=>({}),moaChat:async()=>({}),moaFeedback:async args=>{feedback.push(args);return{}},moaMemoryGet:async()=>({}),moaMemorySet:async()=>({})}}};
vm.createContext(ctx);vm.runInContext(core,ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaChatEngine;
(async()=>{
 const positive=['ㅇㅋ','맞음','오키도키','인정','ㄹㅇ','바로 그거','나이스','굿','그치','맞지'];
 const laughs=['ㅋㅋㅋㅋ','개웃기네','ㅎㅎㅎㅎ'];
 const thanks=['ㄱㅅ','고맙다'];
 const negative=['별론데','노잼','답이 이상한데'];
 const correction=['ㄴㄴ','아님','그게 아니라','맞음? 아닌데'];
 async function expect(text,reaction,tag){await E.reply('안녕');const n=feedback.length;await E.reply(text);ok(feedback.length===n+1,'feedback missing: '+text);const f=feedback.at(-1);ok(f.reaction===reaction&&f.reactionTag===tag,`${text}: ${f.reaction}/${f.reactionTag}`)}
 for(const x of positive)await expect(x,'positive','agreement');
 for(const x of laughs)await expect(x,'positive','laughter');
 for(const x of thanks)await expect(x,'positive','gratitude');
 for(const x of negative)await expect(x,'negative','negative');
 for(const x of correction)await expect(x,'correction','correction');
 for(const x of ['글쎄','맞음?','ㄹㅇ?']){await E.reply('안녕');const n=feedback.length;await E.reply(x);ok(feedback.length===n,'ambiguous phrase must not train polarity: '+x)}
 let r=await E.reply('아재개그 해줘');ok(/ㅋㅋ/.test(r.reply),'joke reply missing');
 console.log('MOA_V78_NATURAL_TIKITAKA_OK');
})().catch(e=>{console.error(e);process.exit(1)});
