const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('js/ai/moa-communication-engine.js?v='),'personalization engine cache bust missing');

function boot({userId,profile={},memories={},patterns=[],seedStart=1}){
  const data={
    [`moa.v91.profile.${userId}`]:profile,
    [`moa.v91.memories.${userId}`]:memories
  };
  const user={user_id:userId,isGuest:false};let seed=seedStart>>>0;
  const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:991,coreVersion:15,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>({reply:`SEARCH:${x.query}`,source:'search'})}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return ctx.MiniTalk.AI.MoaCommunicationEngine;
}
const pattern=(id,trigger,reply,strategy='ack')=>({id,trigger,reply,act:'inform:statement',strategy,affect:'positive',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:20,semantic:{tokens:['게임','이기다'],categories:['game'],intent:'inform:statement'}});

(async()=>{
  const stylePatterns=[
    pattern('playful','게임 이겼어','ㅋㅋ 그거 진짜 재밌었겠다'),
    pattern('formal','게임 이겼어','그렇군요. 꽤 재미있는 시간이었겠네요.')
  ];
  let E=boot({userId:'playful-user',profile:{brevity:.95,playfulness:.98,slang:.95,formality:.02,directness:.6,questionTolerance:.5},patterns:stylePatterns,seedStart:4});
  await E.sync(true);let r=await E.reply('게임 이겼어');
  ok(r.source==='learned-human'&&r.candidateId==='playful',`playful user did not get personalized learned wording: ${JSON.stringify(r)}`);

  E=boot({userId:'formal-user',profile:{brevity:.20,playfulness:.02,slang:.02,formality:.98,directness:.6,questionTolerance:.5},patterns:stylePatterns,seedStart:4});
  await E.sync(true);r=await E.reply('게임 이겼어');
  ok(r.source==='learned-human'&&r.candidateId==='formal',`formal user did not get personalized learned wording: ${JSON.stringify(r)}`);

  const preferencePatterns=[
    {id:'pref-football',trigger:'오늘 뭐할까',reply:'전에 좋아한다고 한 축구 쪽도 괜찮겠다.',act:'ask:question',strategy:'direct',affect:'neutral',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:20,semantic:{tokens:['오늘'],categories:['plan'],intent:'ask:question'}},
    {id:'pref-drawing',trigger:'오늘 뭐할까',reply:'그림 그리면서 쉬는 것도 괜찮겠다.',act:'ask:question',strategy:'direct',affect:'neutral',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:20,semantic:{tokens:['오늘'],categories:['plan'],intent:'ask:question'}}
  ];
  E=boot({userId:'football-user',profile:{},memories:{like:[{value:'축구',updatedAt:Date.now()}]},patterns:preferencePatterns,seedStart:9});
  await E.sync(true);r=await E.reply('오늘 뭐할까');
  ok(r.source==='learned-human'&&r.candidateId==='pref-football',`local preference memory did not influence learned choice: ${JSON.stringify(r)}`);

  // No learning data still needs a usable local conversation floor.
  E=boot({userId:'empty-user',patterns:[],seedStart:12});
  r=await E.reply('오늘 게임 이겼어');ok(r.reply&&!/한마디만 더|맥락을 조금만/.test(r.reply),'no-learning baseline collapsed: '+r.reply);
  await E.reply('인터넷이 너무 느려');r=await E.reply('어떻게 고치지?');ok(r.reply&&!/인터넷 얘기였구나/.test(r.reply),'followthrough regressed into topic acknowledgement: '+r.reply);
  r=await E.reply('12*8은?');ok(r.source==='local-utility'&&/^96/.test(r.reply),'personalized learning overrode calculator');
  r=await E.reply('세종대왕 누구냐');ok(r.source!=='learned-human','personalized learning overrode knowledge route');

  console.log('MOA_PERSONALIZED_LEARNING_ARBITRATION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
