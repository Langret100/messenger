const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/ai/moa-communication-engine.js'),'utf8');
let store={},searches=[];
const fakeMath=Object.create(Math); fakeMath.random=()=>0.23;
const user={user_id:'reason-daily-test',nickname:'테스트',isGuest:false};
const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>1,clearTimeout:()=>{},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>{store[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete store[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:1001,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`[검색답] ${x.query}`,source:'knowledge-answer',kind:'general'};}}}};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
function ok(v,m){if(!v)throw new Error(m)}
(async()=>{
  E.clearContext(); searches=[];
  let r=await E.reply('고래는 왜 그래?');
  ok(searches.length===0,'vague why-question must not search: '+JSON.stringify(searches));
  ok(/행동|상태|한마디/.test(r.reply),'vague why-question should clarify: '+r.reply);

  E.clearContext(); searches=[];
  await E.reply('고래가 계속 물 위로 올라와');
  r=await E.reply('고래는 왜 그래?');
  ok(searches.length===1,'contextual why-question should search once: '+JSON.stringify(searches));
  ok(/고래.*물.*올라/.test(searches[0])&&/이유/.test(searches[0]),'reason query lost behavior context: '+searches[0]);

  E.clearContext(); searches=[];
  r=await E.reply('고래는 왜 숨 쉬러 물 위로 올라와?');
  ok(searches.length===1,'specific why-question should search: '+JSON.stringify(searches));
  ok(/고래/.test(searches[0])&&/숨/.test(searches[0]),'specific why query malformed: '+searches[0]);

  E.clearContext(); searches=[];
  const daily=[
    ['엄마가 잔소리해서 좀 짜증났어',/가족|집|기분|한소리|잔소리|답답/],
    ['핸드폰 떨어뜨려서 액정 깨졌어',/폰|액정|화면|터치|불편/],
    ['점심 못 먹었어',/밥|끼니|먹|힘/],
    ['수업 설명이 너무 헷갈려',/수업|설명|헷갈|막힌/],
    ['게임하다가 렉 걸리고 튕겼어',/게임|렉|튕|멈추|스트레스/],
    ['친구들이 소문 얘기하더라',/친구|소문|말|복잡|확인/],
  ];
  for(const [q,re] of daily){
    r=await E.reply(q); ok(re.test(r.reply),`daily repertoire miss for ${q}: ${r.reply}`);
    ok(!/한마디만 더|뜻이 여러 개/.test(r.reply),`daily fell to fallback for ${q}: ${r.reply}`);
  }
  console.log('MOA_REASON_INTENT_AND_DAILY_EXPANSION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
