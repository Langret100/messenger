const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function boot(patterns=[],seedStart=1,userId='expanded-user'){
  const data={},user={user_id:userId,isGuest:false};let seed=seedStart>>>0;const searches=[];
  const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:930,coreVersion:13,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches};
}
const threads=[
 ['발표하고 왔어','근데 질문 하나에서 막혔어'],['시험 쉬웠어','근데 마지막 문제는 틀린 것 같아'],['과제 거의 끝냈어','그래도 표 하나는 더 만들어야 돼'],['수업 재밌었어','근데 마지막엔 좀 졸렸어'],
 ['게임 이기고 있었어','근데 인터넷 끊겨서 나갔어'],['축구 재밌었어','근데 마지막에 골 먹었어'],['농구했어','그래도 지난번보다 잘했어'],['보드게임 했어','근데 동생이 이겼어'],
 ['친구랑 놀았어','근데 갑자기 약속이 하나 취소됐어'],['친구랑 얘기했어','그래도 마지막엔 서로 웃었어'],['친구 답장 기다렸어','근데 아직도 안 왔어'],['친구한테 선물 받았어','그래서 나도 뭐 하나 주려고'],
 ['햄버거 먹었어','근데 생각보다 별로였어'],['카페 갔어','그래도 디저트는 맛있었어'],['김밥 먹었어','근데 너무 배불러'],['급식 별로였어','그래도 과일은 괜찮았어'],
 ['지하철 타고 왔어','근데 사람이 너무 많았어'],['기차 타고 가는 중이야','그래도 자리는 있어'],['버스 기다렸어','근데 너무 늦게 왔어'],['환승했어','그래도 생각보다 빨리 도착했어'],
 ['영화 보고 왔어','근데 결말이 아쉬웠어'],['웹툰 보고 있었어','근데 갑자기 앱이 꺼졌어'],['유튜브 봤어','그래도 영상은 재밌었어'],['책 읽었어','근데 마지막 부분은 좀 어려웠어'],
 ['강아지랑 산책했어','근데 갑자기 비 왔어'],['고양이랑 놀았어','그래도 오늘은 안 도망갔어'],['햄스터 보고 있었어','근데 갑자기 숨었어'],['강아지 씻겼어','그래도 얌전히 있었어'],
 ['운동하고 왔어','근데 오늘은 너무 힘들었어'],['배드민턴 쳤어','그래도 지난번보다 잘했어'],['달리기 했어','근데 막판엔 힘 빠졌어'],['체육했어','그래도 재밌었어'],
 ['엄마랑 마트 갔어','근데 사람이 너무 많았어'],['아빠랑 영화 봤어','그래도 아빠가 재밌대'],['동생이랑 게임했어','근데 걔가 이겼어'],['누나랑 얘기했어','그래도 마지막엔 풀렸어'],
 ['폰으로 게임했어','근데 배터리가 거의 없어'],['컴퓨터 하고 있었어','근데 인터넷이 끊겼어'],['이어폰 찾고 있었어','그래도 결국 찾았어'],['노트북 쓰고 있었어','근데 갑자기 앱이 꺼졌어'],
 ['옷 샀어','근데 집에서 보니 좀 애매해'],['택배 기다렸어','그래도 오늘 도착했어'],['신발 샀어','근데 생각보다 좀 커'],['마트 갔다왔어','그래도 필요한 건 다 샀어'],
 ['그림 그렸어','근데 마지막 부분이 마음에 안 들어'],['피아노 연습했어','그래도 어제보다 잘 됐어'],['노래 듣고 있었어','근데 이어폰 배터리가 꺼졌어'],['사진 찍었어','그래도 하나는 잘 나왔어'],
 ['방 청소했어','근데 책상은 아직 남았어'],['설거지했어','그래도 금방 끝났어'],['빨래 개고 있었어','근데 너무 많아'],['정리했어','그래도 방은 좀 깔끔해졌어'],
 ['공원 갔다왔어','근데 바람이 너무 불었어'],['놀이공원 갔어','그래도 제일 타고 싶던 건 탔어'],['캠핑 다녀왔어','근데 밤에 너무 추웠어'],['소풍 갔어','그래도 재밌었어'],
 ['비 맞고 왔어','그래도 집엔 빨리 왔어'],['날씨 좋았어','근데 갑자기 바람 불더라'],['눈 왔어','그래도 많이 쌓이진 않았어'],['더웠어','근데 저녁엔 좀 괜찮아졌어']
];
const singles=['폰 배터리 없어','와이파이 끊겼어','이어폰 잃어버렸어','택배 왔어','새 옷 샀어','약속 취소됐어','친구가 답장 안 해','선생님한테 칭찬받았어','선생님한테 혼났어','지각할 것 같아','비 오는데 우산 안 가져왔어','비 맞았어','그림 완성했어','피아노 연습했어','설거지 끝냈어','여행 갔다왔어','길 잃었어','오늘 생일이야','선물 받았어'];
const meta=/(한마디만 더|한 조각만 더|조건이 하나|듣고 있어|이어(?:서)? 말해|계속 말해|그 얘기 계속|무슨 말인지 따라가|맥락을 조금만|얘기였구나\. 이제|쪽은 괜찮다가|얘기하다가 그런 일이)/;
(async()=>{
 let n=0;
 for(let seed=1;seed<=7;seed++){
   const {E}=boot([],seed,`expanded-${seed}`);
   for(const [a,b] of threads){E.clearContext();const r1=await E.reply(a),r2=await E.reply(b);ok(r1.reply&&r2.reply,`empty ${a}/${b}`);ok(!meta.test(r2.reply),`robotic/meta continuation: ${a}/${b} => ${r2.reply}`);ok(r2.source!=='search',`story stolen by search: ${a}/${b}`);n++;}
   for(const a of singles){E.clearContext();const r=await E.reply(a);ok(r.reply,`empty single ${a}`);ok(!meta.test(r.reply),`single collapsed: ${a} => ${r.reply}`);n++;}
 }
 ok(n===(threads.length+singles.length)*7,`count mismatch ${n}`);
 const learned=[{id:'learned-phone-net',trigger:'근데 인터넷이 끊겼어',reply:'아 그 타이밍에 끊기면 진짜 맥 빠지지 ㅋㅋ',act:'inform:emotion',strategy:'ack',affect:'negative',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:30,semantic:{tokens:['인터넷','끊기다'],categories:['tech'],intent:'inform:emotion'}},{id:'learned-shopping-fit',trigger:'근데 집에서 보니 좀 애매해',reply:'ㅋㅋ 매장에서 볼 때랑 집에서 볼 때 느낌 다를 때 있지',act:'inform:emotion',strategy:'ack',affect:'neutral',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:30,semantic:{tokens:['집','애매하다'],categories:['shopping'],intent:'inform:emotion'}}];
 const {E,searches}=boot(learned,99,'expanded-learned');await E.sync(true);
 E.clearContext();await E.reply('컴퓨터 하고 있었어');let r=await E.reply('근데 인터넷이 끊겼어');ok(r.source==='learned-human'&&/맥 빠지/.test(r.reply),`learned tech masked: ${r.source}/${r.reply}`);
 E.clearContext();await E.reply('옷 샀어');r=await E.reply('근데 집에서 보니 좀 애매해');ok(r.source==='learned-human'&&/매장/.test(r.reply),`learned shopping masked: ${r.source}/${r.reply}`);
 E.clearContext();await E.reply('친구랑 얘기 중이야');r=await E.reply('25+17은?');ok(r.source==='local-utility'&&/^42/.test(r.reply),'calculator masked');
 E.clearContext();r=await E.reply('서울 날씨 알려줘');ok(r.source==='search','weather lookup masked');
 E.clearContext();await E.reply('공원 갔다왔어');r=await E.reply('근데 갑자기 비 왔어');ok(r.source!=='search','weather story stolen by search');
 console.log(`MOA_EXPANDED_SITUATION_PATTERNS_OK checks=${n} threads=${threads.length} singles=${singles.length}`);
})().catch(e=>{console.error(e);process.exit(1)});
