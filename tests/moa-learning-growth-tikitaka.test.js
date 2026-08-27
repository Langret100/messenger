const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const g={console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}};
vm.createContext(g);vm.runInContext(gs,g);
const pairs=[
['배고파','뭐라도 좀 먹자 ㅋㅋ'],['간식 땡긴다','나도 과자 땡김 ㅋㅋ'],['치킨 먹었어','치킨은 못 참지 ㅋㅋ'],['피자 먹었어','와 피자 좋지 ㅋㅋ'],['오늘 피곤해','오늘 진짜 녹초겠네'],['졸려','이건 눈 감으면 바로 자겠다 ㅋㅋ'],['게임 이겼어','와 그 판 짜릿했겠다 ㅋㅋ'],['게임 졌어','아 그건 좀 아깝다'],['버스 왜 안 와','버스 기다릴 때 시간이 제일 안 감 ㅋㅋ'],['집 가고 싶다','나도 벌써 집 생각남'],['숙제 하기 싫다','숙제는 시작하기 전이 제일 싫지'],['학교 가기 싫다','아침엔 진짜 그 생각 들지 ㅋㅋ'],['오늘 재밌었어','오 오늘 꽤 괜찮았나 보네'],['심심해','뭐 하나 재밌는 거 찾자'],['배불러','제대로 먹었네 ㅋㅋ'],['목말라','물부터 한 잔 마셔 ㅋㅋ'],['더워','오늘 진짜 녹겠다'],['추워','손부터 따뜻하게 해야겠다'],['비 온다','우산 없으면 난감하겠다'],['눈 온다','밖에 좀 예쁘겠는데 ㅋㅋ'],['주말이다','이제 좀 살 것 같다 ㅋㅋ'],['내일 시험이야','아 오늘은 좀 긴장되겠다'],['시험 끝났다','와 이제 해방이다 ㅋㅋ'],['점심 뭐 먹을까','난 돈까스 쪽 ㅋㅋ'],['라면 먹고 싶다','이 시간엔 라면이 너무 세다 ㅋㅋ'],['과자 먹고 싶다','봉지 뜯으면 순삭이지 ㅋㅋ'],['친구랑 놀았어','오 재밌었겠다'],['밖에 나가기 싫다','그냥 집에 있고 싶은 날 있지'],['기분 좋다','오 오늘 느낌 좋은데 ㅋㅋ'],['기분 별로야','오늘 좀 꼬였나 보네'],['아침 못 먹었어','그럼 지금 더 배고프겠다'],['늦잠 잤어','아침부터 정신없었겠네 ㅋㅋ']
];
function publicRow(i,t,r,tier){
  const toks=t.replace(/[?!.]/g,'').split(/\s+/).filter(Boolean);
  const occ=tier==='confirmed'?6:tier==='growing'?2:1;
  return g.moaLanguagePublicRow_([`growth-${i}`,t,r,'inform:statement','neutral','ack',toks.join('|'),'chat',occ,'src1,src2','ev1,ev2',new Date(),'active',tier,'',200+i]);
}
async function simulate(count){
  const patterns=pairs.slice(0,count).map((x,i)=>publicRow(i,x[0],x[1],i%5===0?'confirmed':i%3===0?'growing':'solo')).filter(Boolean);
  const store={},user={user_id:`growth-${count}`,isGuest:false};let seed=12345;
  const randomMath=Object.create(Math);randomMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  const ctx={console:{log(){},warn(){}},Date,Math:randomMath,setTimeout:(fn)=>{fn();return 1},clearTimeout(){},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>{store[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete store[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:200,coreVersion:20,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({})}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;await E.sync(true);
  let learned=0,generic=0;
  for(let i=0;i<600;i++){
    E.clearContext();const r=await E.reply(pairs[i%pairs.length][0]);
    if(r.source==='learned-human')learned++;
    if(/계속해봐|한마디만 더|무슨 말인지|흐름은 따라/.test(String(r.reply||'')))generic++;
  }
  return {count,learned,generic};
}
(async()=>{
  const rows=[];for(const n of [0,8,16,32])rows.push(await simulate(n));
  ok(rows[0].learned===0,'empty corpus unexpectedly produced learned-human output');
  ok(rows[1].learned>0,'solo/public learning was not used with a small corpus');
  ok(rows[0].learned<rows[1].learned&&rows[1].learned<rows[2].learned&&rows[2].learned<rows[3].learned,'learned answer usage did not increase as the corpus grew: '+JSON.stringify(rows));
  ok(rows[3].learned>=500,'full learned corpus was not used often enough: '+JSON.stringify(rows[3]));
  ok(rows[3].generic===0,'generic fallback remained after full everyday-learning coverage: '+JSON.stringify(rows[3]));
  console.log('MOA_LEARNING_GROWTH_TIKITAKA_OK',JSON.stringify(rows));
})().catch(e=>{console.error(e);process.exit(1)});
