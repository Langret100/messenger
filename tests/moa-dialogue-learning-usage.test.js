const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const html=fs.readFileSync('index.html','utf8'),app=fs.readFileSync('js/app.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
ok(html.includes('moa-communication-engine.js?v=47'),'engine cache bust missing');
ok(html.includes('js/app.js?v=64.5.46')&&app.includes('sw.js?v=64.5.60')&&sw.includes('moaru-moa-dialogue-fusion-final'),'cache chain missing');
const g={console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}};vm.createContext(g);vm.runInContext(gs,g);
const solo=g.moaLanguagePublicRow_(['solo-snack','간식 땡긴다','나도 과자 땡김 ㅋㅋ','inform:statement','neutral','ack','간식|땡기다','food',1,'src','ev',new Date(),'active','solo','간식|땡기다',77]);
ok(solo&&solo.tier==='solo'&&solo.confidence===.60,'solo pattern is still blocked from sync');
const growing=g.moaLanguagePublicRow_(['grow-food','치킨 먹었어','치킨은 역시 최고지 ㅋㅋ','inform:statement','positive','ack','치킨|먹다','food',2,'src1','ev1,ev2',new Date(),'active','growing','치킨|먹다',77]);
ok(growing&&growing.confidence===.72,'growing pattern confidence changed unexpectedly');
const store={},user={user_id:'dialogue-usage-user',isGuest:false};let seed=9;const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
const patterns=[solo,growing];
const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>{store[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete store[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:77,coreVersion:10,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({})}}};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
  await E.sync(true);
  ok(E.debugSnapshot().patterns.some(p=>p.id==='solo-snack'),'solo pattern did not reach client cache');
  let seen=false;
  for(let i=0;i<20;i++){E.clearContext();const r=await E.reply('간식 땡긴다');if(r.source==='learned-human'&&r.reply==='나도 과자 땡김 ㅋㅋ'){seen=true;break;}}
  ok(seen,'solo learned reply never reached actual output');
  E.clearContext();let r=await E.reply('배고파');ok(r.reply,'hungry turn failed');r=await E.reply('간식');ok(!/계속해봐|한마디만 더/.test(r.reply),`short snack follow-up fell to generic fallback: ${r.reply}`);r=await E.reply('간식먹고프다');ok(!/계속해봐|한마디만 더/.test(r.reply),`snack desire fell to generic fallback: ${r.reply}`);
  E.clearContext();r=await E.reply('1+1은?');ok(r.source==='local-utility'&&/^2/.test(r.reply),'learned dialogue overrode calculator');
  console.log('MOA_DIALOGUE_LEARNING_USAGE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
