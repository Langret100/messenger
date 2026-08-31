const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function boot(seed=1,uid='breadth'){
  const data={},searches=[];let s=seed>>>0;const fakeMath=Object.create(Math);fakeMath.random=()=>((s=s*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:`${uid}-${seed}`,isGuest:false}:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:1,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches,data};
}
const statements=[
 '오늘 학교 쉬는시간에 애들이랑 웃겨 죽는줄','수행평가 끝나니까 살 것 같아','시험에서 하나 틀려서 좀 아쉽다','숙제 생각보다 빨리 끝냈어',
 '친구가 답장 늦게 해서 기다렸어','걔랑 얘기했는데 생각보다 분위기 괜찮았음','친구들이랑 만나기로 했어','단톡에서 좀 민망한 일 있었음',
 '엄마랑 장보러 갔다왔어','동생이 내 과자 또 먹음','아빠가 갑자기 치킨 사옴','가족들이랑 영화 봤어',
 '점심 완전 맛있었어','라면 끓였는데 물 너무 많이 넣음','배고파서 간식 먹는중','새로 산 과자 생각보다 별로',
 '게임 막판에 역전해서 이겼어','한 판 하다가 인터넷 끊겨서 튕김','친구랑 보드게임 했는데 재밌었어','축구하다 마지막에 골 먹혀서 짐',
 '유튜브 보다가 시간 순삭됨','영화 결말이 진짜 의외였어','웹툰 최신화 보고 좀 애매했음','노래 하나 계속 듣는중',
 '폰 배터리 또 금방 닳음','컴터 업데이트 드디어 끝남','이어폰 한쪽 안 나와서 짜증남','와이파이 오늘은 잘 되네',
 '버스 놓쳐서 다음 거 기다리는중','지하철 자리 있어서 다행','집 가는 길 생각보다 안 막힘','환승 놓칠 뻔했어',
 '방 청소 싹 끝냈다','설거지 아직도 남았어','샤워하고 침대 누움','책상 정리하다 옛날 거 찾음',
 '그림 오늘 좀 잘 그려진듯','피아노 연습하다가 드디어 되는 부분 생김','코딩하다 오류 하나 잡았어','퍼즐 거의 다 맞췄는데 한 조각 안 보여',
 '고양이가 박스 안에서 안 나옴','강아지 산책하고 와서 뻗음','햄스터가 갑자기 엄청 뛰어다님','고양이가 내 자리 뺏음',
 '운동하고 나니까 개운하다','달리기 오늘은 좀 힘들었어','자전거 타다가 비 맞음','체육시간 생각보다 재밌었어',
 '택배 드디어 왔다','새 옷 샀는데 실물이 더 괜찮아','주문한 거 배송 지연됨','필통 새로 샀어',
 '공원 갔다가 갑자기 비 옴','주말에 바다 가기로 했어','마트 갔는데 사람 엄청 많았음','놀이공원 갔다오니 다리 아파',
 '어제 늦게 자서 하루종일 졸림','낮잠 너무 오래 자버림','오늘은 알람 전에 깼어','이상한 꿈 꿔서 아직 기억남'
];
const flows=[
 ['오늘 축구했어','막판에 졌어','그래도 재밌긴 했음'],
 ['친구 만나고 왔어','걔가 또 늦었어','그래도 밥은 맛있었어'],
 ['숙제 시작했어','생각보다 어렵네','하나는 겨우 끝냄'],
 ['택배 기다리는중','아직도 안 와','방금 도착함'],
 ['컴터가 좀 이상해','업데이트하다 멈췄어','다시 켜니까 됨'],
 ['영화 봤어','중간은 좀 지루했어','결말은 괜찮았음'],
 ['강아지 산책했어','비 와서 빨리 들어왔어','지금은 자는중'],
 ['친구랑 좀 어색했어','아까 얘기는 했어','지금은 괜찮아진듯'],
 ['시험 끝났어','하나 틀린 것 같아','그래도 생각보단 괜찮음'],
 ['버스 타고 집 가는중','사람 진짜 많아','그래도 자리 생김']
];
(async()=>{
  let total=0;const all=new Set(),per=new Map();
  for(let seed=1;seed<=9;seed++){
    const {E}=boot(seed);
    for(const text of statements){
      E.clearContext();const r=await E.reply(text);total++;all.add(r.reply);if(!per.has(text))per.set(text,new Set());per.get(text).add(r.reply);
      ok(r.source!=='search',`daily statement wrongly searched: ${text} => ${r.reply}`);
      ok(!/(한마디만 더|조금만 더 알려|계속 말해봐|듣고 있어|얘기였구나|그 얘기 계속)/.test(r.reply),`meta filler: ${text} => ${r.reply}`);
      ok((r.reply||'').length>=5,`too thin reaction: ${text} => ${r.reply}`);
    }
  }
  const multi=[...per.values()].filter(s=>s.size>=4).length;
  ok(multi>=40,`insufficient 4+ variant situations: ${multi}/${statements.length}`);
  ok(all.size>=200,`overall reaction breadth too low: ${all.size}/${total}`);

  let flowTurns=0;
  for(let i=0;i<flows.length;i++){
    const {E}=boot(100+i,`flow-${i}`);E.clearContext();
    for(const text of flows[i]){
      const r=await E.reply(text);flowTurns++;
      ok(r.source!=='search',`flow searched unexpectedly: ${text} => ${r.reply}`);
      ok(!/(한마디만 더|조금만 더 알려|계속 말해봐|듣고 있어|얘기였구나)/.test(r.reply),`flow meta filler: ${text} => ${r.reply}`);
    }
  }
  console.log(`MOA_EVERYDAY_REACTION_BREADTH_V2_OK total=${total} unique=${all.size} fourPlus=${multi} flowTurns=${flowTurns}`);
})().catch(e=>{console.error(e);process.exit(1)});
