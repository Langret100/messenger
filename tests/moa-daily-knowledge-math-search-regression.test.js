const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/ai/moa-communication-engine.js'),'utf8');
let store={},searches=[],searchMode='success';
const fakeMath=Object.create(Math); fakeMath.random=()=>0.17;
const user={user_id:'daily-knowledge-test',nickname:'테스트',isGuest:false};
const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>1,clearTimeout:()=>{},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>{store[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete store[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:999,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);if(searchMode==='success')return {reply:`[검색답] ${x.query} 설명`,source:'knowledge-answer',kind:'general'};return {};}}}};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
function ok(v,m){if(!v)throw new Error(m)}
(async()=>{
  let r=await E.reply('52 더하기 16 곱하기 2 빼기 4'); ok(r.reply==='80이야.','multi spoken math failed: '+r.reply);
  r=await E.reply('52 더하기 16 곱하기 2 빼기 4가 뭐야'); ok(r.reply==='80이야.','natural math suffix failed: '+r.reply);
  r=await E.reply('(12 더하기 8) 곱하기 3은 얼마야'); ok(r.reply==='60이야.','parenthesized spoken math failed: '+r.reply);

  // 정보질문은 로컬 사전보다 실제 검색이 먼저여야 한다.
  E.clearContext(); searches=[]; searchMode='success';
  r=await E.reply('인터넷이 뭐야'); ok(searches.length===1,'internet definition should search first'); ok(/\[검색답\]/.test(r.reply),'internet search result not used: '+r.reply);
  r=await E.reply('인공지능이 궁금해'); ok(searches.length===2,'curiosity query should search'); ok(/인공지능/.test(searches[1]),'curiosity query subject lost: '+searches[1]);
  r=await E.reply('양자얽힘에 대해 알려줘'); ok(searches.length===3,'tell-me query should search');

  // 검색 실패 시 알려진 개념은 로컬 지식으로 바로 보완하고, 모르는 개념은 실패 전용 답변을 낸다.
  E.clearContext(); searches=[]; searchMode='empty';
  r=await E.reply('인터넷이 뭐야'); ok(searches.length===1,'failed known definition should still attempt search'); ok(/통신망/.test(r.reply),'known definition fallback failed: '+r.reply);
  r=await E.reply('양자얽힘이 궁금해'); ok(searches.length===2,'unknown curiosity should search'); ok(/가져오지 못했어|검색 연결/.test(r.reply),'unknown search failure fallback missing: '+r.reply); ok(!/응,? 알겠어|그렇구나/.test(r.reply),'search failure became empty ack: '+r.reply);

  // 일상 명사는 사전 뜻 복창이 아니라 사건/행동에 반응해야 한다.
  E.clearContext(); searchMode='empty';
  r=await E.reply('고양이가 자꾸 내 방에 와'); ok(!/대표적인 반려동물|청각과 균형감각/.test(r.reply),'cat daily chat became dictionary: '+r.reply); ok(/고양이|자기|근처|붙어/.test(r.reply),'cat daily context missed: '+r.reply);
  r=await E.reply('강아지 산책 갔다 왔어'); ok(/산책|걸었|강아지|피곤/.test(r.reply),'dog walk context missed: '+r.reply);
  r=await E.reply('공책 잃어버렸어'); ok(/공책/.test(r.reply)&&/마지막|가방|책상|찾/.test(r.reply),'notebook lost context missed: '+r.reply);
  r=await E.reply('연필 부러졌어'); ok(/연필/.test(r.reply)&&/망가|불편|새로|상태/.test(r.reply),'pencil broken context missed: '+r.reply);
  console.log('MOA_DAILY_KNOWLEDGE_MATH_SEARCH_REGRESSION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
