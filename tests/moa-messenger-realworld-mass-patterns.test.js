const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function boot(patterns=[],seedStart=1,userId='mass-user'){
  const data={},user={user_id:userId,isGuest:false};let seed=seedStart>>>0;const searches=[];
  const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:940,coreVersion:14,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches};
}
const meta=/(한마디만 더|한 조각만 더|조건이 하나|듣고 있어|계속 말해|이어(?:서)? 말해|그 얘기 계속|맥락을 조금만|뜻을 지어내|어느 부분을 말하는지 조금만)/;
const threads=[
 ['오늘 시험 봤어','근데 마지막 문제 틀린듯'],['발표 끝남','그래도 질문은 잘 받았어'],['숙제 다한줄','근데 하나 더 있더라'],['학원 갔다옴','오늘은 생각보다 안힘들었어'],
 ['친구 기다리는중','아직 안옴'],['친구랑 좀 싸움','그래도 아까 화해함'],['단톡 조용하더라','근데 갑자기 다들 말함'],['걔 답장 없음','아직도 안옴 ㅋㅋ'],
 ['게임 한판함','막판에 역전함'],['롤 하고왔어','근데 인터넷 끊김'],['축구했어','마지막에 골먹음'],['농구함','그래도 지난번보다 잘함'],
 ['라면 먹음','근데 생각보다 별로'],['카페 갔다옴','디저트는 맛잇었음'],['급식 먹었어','오늘 반찬은 괜찬더라'],['치킨 시킴','근데 너무 늦게옴'],
 ['버스 타는중','사람 개많음'],['지하철 기다림','근데 금방옴'],['기차 탔어','자리 있어서 다행'],['택시탐','길 엄청 막힘'],
 ['영화 봄','결말이 좀 애매'],['웹툰 보는중','근데 앱 꺼짐'],['유튜브 봤어','생각보다 재밋더라'],['책 읽음','막판은 좀 어려움'],
 ['강아지 산책함','근데 비왓어'],['고양이랑 놀았어','오늘은 안도망감'],['햄스터 보고있었어','갑자기 숨음'],['강아지 씻겼어','그래도 얌전했음'],
 ['운동하고옴','오늘 왤케 힘드냐'],['배드민턴침','그래도 좀 늘은듯'],['달리기함','막판에 힘빠짐'],['체육했어','오늘은 재밋었어'],
 ['엄마랑 마트감','사람 너무 많았음'],['아빠랑 영화봄','아빠는 재밌대'],['동생이랑 게임함','걔가 이김'],['누나랑 얘기함','그래도 마지막엔 풀림'],
 ['폰으로 게임함','배터리 거의 없음'],['컴하다가','와파 끊김'],['이어폰 찾는중','결국 찾음 ㅋㅋ'],['노트북 쓰는중','앱 갑자기 꺼짐'],
 ['옷 삿어','집에서 보니 좀 애매'],['택배 기다림','오늘 드디어 왓어'],['신발 샀는데','생각보다 큼'],['마트 갔다옴','필요한건 다삼'],
 ['그림 그리는중','마지막이 맘에 안듬'],['피아노 연습함','어제보다 잘됨'],['노래 듣는중','이어폰 배터리 나감'],['사진 찍었어','하나는 잘나옴'],
 ['방 청소함','책상은 아직'],['설거지 끝냄','생각보다 금방함'],['빨래 개는중','왤케 많냐'],['정리 좀 함','방은 깔끔해짐'],
 ['공원 갔다옴','바람 엄청불더라'],['놀이공원 감','타고싶던건 탐'],['캠핑 다녀옴','밤에 개추웠음'],['소풍 갔어','그래도 재밌었음']
];
const clearTypoSingles=['머해','모해','머함','왤케 피곤하지','왜케 졸리냐','괜찬아','귀찬아','재밋었어','잼있었어','맛잇었어','멋잇다','몰겟어','모르겟다','알겟어','하겟어','햇어','갓어','왓어','봣어','먹엇어','삿어','받앗어','됫어','됬어','걍 그래','낼 시험이야','담주 발표야'];
const ambiguousTypoSingles=['머임','머냐','머지','머먹지','머하지','어떻해','어떻하지','어케 하지','글케 됐어','일케 하는거야'];
const shortSlang=['ㅇㅇ','웅','ㄴㄴ','ㅇㅋ','ㄱㅊ','ㅇㅈ','ㄹㅇ','ㄱㄱ','ㄱㅅ','ㅈㅅ','ㅁㄹ','몰루','ㅂㄹ','ㄷㄷ','ㅎㄷㄷ','ㅁㅊ','헐','대박','ㅠㅠ','ㅜㅜ','ㅋㅋ','ㅋㅋㅋ','ㅎㅎ','쏘쏘','애매해'];
(async()=>{
 let checks=0;
 for(let seed=1;seed<=5;seed++){
   const {E}=boot([],seed,`mass-${seed}`);
   for(const [a,b] of threads){E.clearContext();let r=await E.reply(a);ok(r.reply,`empty1 ${a}`);r=await E.reply(b);ok(r.reply,`empty2 ${a}/${b}`);ok(!meta.test(r.reply),`meta collapse ${a}/${b} => ${r.reply}`);ok(r.source!=='search',`story stolen by search ${a}/${b} => ${r.reply}`);checks++;}
   for(const a of clearTypoSingles){E.clearContext();const r=await E.reply(a);ok(r.reply,`empty typo ${a}`);ok(!meta.test(r.reply),`typo collapsed ${a} => ${r.reply}`);checks++;}
   for(const a of ambiguousTypoSingles){E.clearContext();const r=await E.reply(a);ok(r.reply,`empty ambiguous typo ${a}`);checks++;}
   for(const a of shortSlang){E.clearContext();const r=await E.reply(a);ok(r.reply,`empty slang ${a}`);ok(!meta.test(r.reply),`slang collapsed ${a} => ${r.reply}`);checks++;}
 }
 // Canonical typo handling must improve intent classification, not rewrite tool requests away.
 {const {E}=boot([],77,'canon');let f=E.analyze('머해');ok(f.reaction==='whatdoing',`머해 not normalized: ${f.reaction}/${f.c}`);f=E.analyze('재밋었어');ok(f.reaction==='happy',`재밋 typo not happy: ${f.reaction}/${f.c}`);f=E.analyze('몰겟어');ok(f.reaction==='confused',`몰겟 typo not confused: ${f.reaction}/${f.c}`);}
 // Dedicated features must still win over casual routing, including typo-heavy surrounding context.
 {const {E}=boot([],88,'features');await E.reply('친구랑 얘기중');let r=await E.reply('17+28은?');ok(r.source==='local-utility'&&/^45/.test(r.reply),`calculator masked ${r.source}/${r.reply}`);E.clearContext();r=await E.reply('서울 오늘 날씨 알려줘');ok(r.source==='search',`weather masked ${r.source}/${r.reply}`);E.clearContext();await E.reply('공원 갓다옴');r=await E.reply('근데 비왓어');ok(r.source!=='search',`weather story stolen ${r.source}/${r.reply}`);}
 // Strong human-chat learning must still beat the widened local pattern, and typo-normalized
 // variants should be eligible for the same learned phrase rather than becoming a local-only path.
 const learned=[{id:'learned-fun',trigger:'생각보다 재밌더라',reply:'ㅋㅋ 기대 안 했는데 재밌으면 괜히 더 이득 본 느낌이지',act:'inform:event',strategy:'ack',affect:'positive',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:50,semantic:{tokens:['생각','재밌다'],categories:['media'],intent:'inform:event'}},{id:'learned-net',trigger:'근데 인터넷 끊겼어',reply:'아 그 타이밍에 끊기면 진짜 맥 빠지지 ㅋㅋ',act:'inform:event',strategy:'ack',affect:'negative',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:50,semantic:{tokens:['인터넷','끊기다'],categories:['tech'],intent:'inform:event'}}];
 {const {E}=boot(learned,99,'learned-mass');await E.sync(true);E.clearContext();await E.reply('유튜브 봤어');let r=await E.reply('생각보다 재밋더라');ok(r.source==='learned-human'&&/이득 본 느낌/.test(r.reply),`learned typo masked ${r.source}/${r.reply}`);E.clearContext();await E.reply('컴퓨터 하는중');r=await E.reply('근데 인터넷 끊겼어');ok(r.source==='learned-human'&&/맥 빠지/.test(r.reply),`learned continuation masked ${r.source}/${r.reply}`);}
 console.log(`MOA_MESSENGER_REALWORLD_MASS_PATTERNS_OK checks=${checks} threads=${threads.length} typos=${clearTypoSingles.length+ambiguousTypoSingles.length} slang=${shortSlang.length}`);
})().catch(e=>{console.error(e);process.exit(1)});
