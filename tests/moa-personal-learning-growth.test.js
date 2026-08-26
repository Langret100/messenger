const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('js/ai/moa-communication-engine.js?v=20'),'MOA personal learning cache bust missing');
const store={}; const commits=[]; const fakeMath=Object.create(Math); fakeMath.random=()=>0.01;
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'learn-u',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=JSON.parse(JSON.stringify(v)),remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true}),moaSearch:async()=>({}),moaCommit:async p=>{commits.push(p);return {ok:true}}}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{
 const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
 await e.reply('난 축구 좋아해');
 await e.reply('난 피자 좋아해');
 await e.reply('난 고양이 좋아해');
 let r=await e.reply('내가 좋아하는 거 뭐야?');
 ok(/축구/.test(r.reply)&&/피자/.test(r.reply)&&/고양이/.test(r.reply),'likes did not accumulate: '+r.reply);
 await e.reply('요즘 그림 그리기에 빠졌어');
 r=await e.reply('내 요즘 관심사 뭐야?');
 ok(/그림/.test(r.reply),'interest memory did not accumulate: '+r.reply);
 // A positive reaction should immediately reinforce local strategy/features without waiting for server sync.
 await e.reply('오늘 학교에서 게임 이겼어');
 await e.reply('맞아 ㅋㅋ');
 const snap=e.debugSnapshot();
 ok(snap.personalLearning&&snap.personalLearning.turns>=5,'personal learning turns missing');
 ok(Object.keys(snap.personalLearning.strategies||{}).length>0,'local strategy learning missing');
 ok(Object.keys(snap.personalLearning.features||{}).length>0,'local expression learning missing');
 ok(Object.keys(snap.personalLearning.topics||{}).length>0,'topic learning missing');
 // Common everyday statements should not collapse into generic "say more" fallbacks.
 for(const input of ['나 집에 왔어','숙제 해야돼 귀찮아','아까 치킨 먹었어','이제 씻었어']){
   r=await e.reply(input);
   ok(!/조금 더 말|한마디만 더|맥락을 조금만|대상을 하나만/.test(r.reply),input+' generic fallback: '+r.reply);
 }
 console.log('MOA_PERSONAL_LEARNING_GROWTH_OK');
})().catch(e=>{console.error(e);process.exit(1)});
