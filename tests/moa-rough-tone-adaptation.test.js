const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
let seed=137;const fakeMath=Object.create(Math);fakeMath.random=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
const store={};let currentUser='rough-user';
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:currentUser,isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true,version:90,policy:{},expressionWeights:{}}),moaSearch:async({query})=>({reply:'SEARCH:'+query,source:'test-search'}),moaCommit:async()=>({ok:true,version:91})}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
const strong=/시발|씨,|와 씨|오 씨|존나|개쩐다|개빡세네/;
(async()=>{
  await e.sync(true);
  const train=['아 시발 피곤해','ㅅㅂ 오늘 왜 이래','존나 피곤함','아 시발 짜증나','게임 개빡셈','ㅅㅂ 또 졌어','존나 답답함','아 시발 버스 놓침','개빡치네 진짜','ㅅㅂ 비까지 옴','존나 힘들다','아 시발 오늘 망함'];
  for(const t of train)await e.reply(t);
  let snap=e.debugSnapshot();
  ok(snap.profile.roughness>=.72,'roughness did not rise enough: '+snap.profile.roughness);
  ok(snap.profile.roughStreak>=8,'rough streak missing: '+snap.profile.roughStreak);

  // After repeated rough language, even clean casual statements should sometimes mirror the preferred tone.
  let mirrored=0;const replies=[];
  for(let i=0;i<30;i++){const r=await e.reply(`오늘 게임에서 졌어 ${i}`);replies.push(r.reply);if(strong.test(r.reply))mirrored++;}
  ok(mirrored>=4,`rough preference too weak after repeated use: ${mirrored}/30`);
  ok(mirrored<=24,`rough preference became near-forced: ${mirrored}/30`);
  ok(new Set(replies).size>=4,'rough mode collapsed reply diversity');

  // Strong language preference must not turn direct abuse into retaliatory insults.
  const insult=await e.reply('너 병신이냐');
  ok(!/너.*(?:병신|등신|멍청|시발|씨발)/.test(insult.reply),'retaliatory directed insult generated: '+insult.reply);

  // Clean turns cool the local preference rather than permanently locking it in.
  const before=e.debugSnapshot().profile.roughness;
  for(let i=0;i<70;i++)await e.reply(`오늘은 그냥 평범했어 ${i}`);
  snap=e.debugSnapshot();
  ok(snap.profile.roughness<before,'roughness did not decay');
  ok(snap.profile.roughStreak===0,'rough streak did not cool down');

  // A separate polite user must remain isolated from the rough user's local profile.
  currentUser='polite-user';await e.sync(true);
  const politeInputs=['안녕하세요','오늘 학교에 다녀왔어요','조금 피곤해요','감사합니다','오늘은 괜찮았어요','숙제를 끝냈어요','내일 시험이 있어요','잘 모르겠어요'];
  let leaked=0;
  for(let round=0;round<4;round++)for(const t of politeInputs){const r=await e.reply(t);if(strong.test(r.reply))leaked++;}
  const polite=e.debugSnapshot();
  ok(leaked===0,'rough tone leaked into polite user: '+leaked);
  ok(polite.profile.roughness<.25,'polite profile became rough: '+polite.profile.roughness);

  console.log(`MOA_ROUGH_TONE_ADAPTATION_OK mirrored=${mirrored}/30 decayed=${before.toFixed(3)}->${snap.profile.roughness.toFixed(3)} politeLeak=${leaked}`);
})().catch(err=>{console.error(err);process.exit(1)});
