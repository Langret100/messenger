const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');

// Build public client patterns through the same Apps Script row converter used by sync.
const g={console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}};
vm.createContext(g);vm.runInContext(gs,g);
const pub=(id,trigger,reply,intent,affect,strategy,tokens,cats,occ=8,tier='confirmed')=>g.moaLanguagePublicRow_([
  id,trigger,reply,intent,affect,strategy,tokens.join('|'),cats.join('|'),occ,'src1,src2','ev1,ev2',new Date(),'active',tier,[],50
]);
const patterns=[
  pub('h-chicken','치킨 먹었어','치킨은 역시 최고지 ㅋㅋ','inform:statement','positive','ack',['치킨','먹다'],['food']),
  pub('h-game','게임 이겼어','와 그 판 개짜릿했겠다 ㅋㅋ','inform:statement','positive','ack',['게임','이기다'],['game']),
  pub('h-tired','오늘 피곤해','오늘 완전 녹초겠네','inform:emotion','negative','empathy',['피곤하다'],['emotion']),
  pub('h-bus','버스 왜 안 와','버스 기다릴 때 시간이 제일 안 가 ㅋㅋ','ask:question','neutral','empathy',['버스','오다'],['travel']),
  pub('h-meal','점심 뭐 먹을까','난 오늘 돈까스 땡김 ㅋㅋ','ask:question','neutral','direct',['점심','먹다'],['food']),
  pub('h-apple','너 사과 좋아해?','나는 사과보다 복숭아가 더 좋음 ㅋㅋ','ask:preference','neutral','direct',['사과','좋아하다'],['fruit','food','preference'])
].filter(Boolean);
ok(patterns.length===6,'server public-row conversion dropped usable learned patterns');
const soloPublic=g.moaLanguagePublicRow_(['solo','간식 땡긴다','나도 과자 땡김 ㅋㅋ','inform:statement','neutral','ack','간식|땡기다','food',1,'src','ev',new Date(),'active','solo','',1]);
ok(soloPublic&&soloPublic.tier==='solo'&&soloPublic.confidence===.60,'solo human dialogue should remain a low-weight public candidate');
ok(g.moaLanguagePublicRow_(['url','이거 봐 https://example.com','오 좋네','inform:statement','neutral','ack','이거','',8,'a,b','e1,e2',new Date(),'active','confirmed','',1])===null,'URL learned row became public');

const store={},user={user_id:'learn-output-user',isGuest:false};
let seed=5;const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>{store[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete store[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:50,coreVersion:10,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({})}}};ctx.globalThis=ctx;
vm.createContext(ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
  await E.sync(true);
  ok(E.debugSnapshot().patterns.some(p=>p.id==='h-chicken'),'synced learned corpus was not loaded into client memory');
  const exactCases=[
    ['치킨 먹었어','h-chicken'],['게임 이겼어','h-game'],['오늘 피곤해','h-tired'],['버스 왜 안 와','h-bus'],['점심 뭐 먹을까','h-meal']
  ];
  for(const [prompt,id] of exactCases){E.clearContext();const r=await E.reply(prompt);ok(r.source==='learned-human'&&r.candidateId===id,`exact learned reply was shadowed for ${prompt}: ${JSON.stringify(r)}`);}

  // Semantic adaptation: a learned apple preference pattern must be reusable for strawberry.
  let generalized=null;
  for(let i=0;i<12;i++){E.clearContext();const r=await E.reply('너 딸기 좋아해?');if(r.source==='learned-human'){generalized=r;break;}}
  ok(generalized,'semantic learned pattern never reached final output');
  ok(/딸기/.test(generalized.reply)&&/복숭아/.test(generalized.reply),'learned semantic reply was not adapted to the new anchor: '+generalized.reply);

  // Hard/verified paths must never be overridden by chat learning.
  E.clearContext();let r=await E.reply('1+1은?');ok(r.source==='local-utility'&&/^2/.test(r.reply),'learned chat overrode calculator: '+JSON.stringify(r));
  E.clearContext();r=await E.reply('세종대왕 설명해줘');ok(r.source!=='learned-human'&&/세종/.test(r.reply),'human-chat learning overrode knowledge answer: '+JSON.stringify(r));
  console.log('MOA_LEARNED_OUTPUT_PATH_OK',JSON.stringify({patterns:patterns.length,generalized:generalized.reply}));
})().catch(e=>{console.error(e);process.exit(1)});
