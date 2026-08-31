const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
let uid='u0'; const store={}; const fakeMath=Object.create(Math);let seed=123456789;fakeMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:uid,isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true}),moaSearch:async()=>({}),moaCommit:async()=>({ok:true})}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
const categories={
 school:['학교 끝났어','학원 끝남','학교 다녀왔어','수업 너무 지루해','학교 개노잼','학원 가는 중','학교 가야돼','수업 졸려'],
 study:['숙제 다 했어','과제 끝냈다','공부해야 돼 귀찮아','숙제 남았어','시험 망했어','퀴즈 못봤어','점수 나왔어','시험 끝났어'],
 rest:['방금 일어났어','아까 깼어','침대에 누워있어','그냥 뒹굴거리는 중','오늘 아무것도 안했어','하루종일 한게 없어','이제 쉬는중','씻고 누웠어'],
 food:['배고파','배고프다','피자 먹었어','라면 먹는중','간식 먹었어','아이스크림 먹었다','배불러','치킨 먹었어'],
 game:['게임 하는중','롤 하고있어','마크 하는 중','게임 이겼어','게임 졌어','축구 이겼어','농구 졌어','친구랑 게임했어'],
 social:['친구 만났어','애들이랑 놀았어','친구가 개웃김','친구 너무 웃겨','친구랑 싸웠어','내 말 무시했어','친구 기다리는중','친구가 선물 줬어'],
 mood:['오늘 기분 좋아','지금 기분 최고','오늘 신난다','오늘 기분 별로야','지금 짜증나','오늘 빡쳐','피곤해','졸려'],
 transit:['버스 타는중','지하철 타고 가','버스 기다리는중','집 가는중','집 도착했어','산책 다녀왔어','공원 걸었어','운동 끝났어'],
 media:['유튜브 보는중','영상 봤어','애니 봤는데 재밌어','영화 봤어','노래 듣는중','음악 듣고있어','드라마 보는중','영상 개재밌다'],
 misc:['청소 끝냈어','방 정리했어','새로 샀어','처음 받아봤어','실수했어','깜빡했어','기다리는중','심심해']
};
const badRx=/(조금 더 말해줘|한마디만 더|한 조각만 더|맥락을 조금만|뜻을 단정하지|대상을 하나만|질문을 다시 한 번만)/;
(async()=>{
 let total=0,bad=[];let n=0;
 for(let round=0;round<7;round++){
  for(const [cat,arr] of Object.entries(categories)){
   for(const text of arr){uid=`single-${n++}`;const r=await e.reply(text);total++;if(!r.reply||badRx.test(r.reply))bad.push({cat,text,reply:r.reply,source:r.source,strategy:r.strategy});}
  }
 }
 // 80 short multi-turn conversations x 4 user turns = 320 turns.
 const dialogs=[
  ['학교 끝났어','오늘 수업 너무 지루했음','그래도 친구가 웃겼어','이제 집이야'],
  ['내일 시험 있어','공부 하나도 안했어','뭐부터 하지','오케이 지금부터 할게'],
  ['게임 졌어','진짜 한끗차이였음','그래서 다시 했어','이번엔 이겼다 ㅋㅋ'],
  ['친구랑 싸웠어','내 말을 계속 무시했어','좀 짜증남','내일 얘기해볼까'],
  ['방금 일어났어','아직 졸려','배고프기도 해','라면 먹을까'],
  ['유튜브 보는중','개웃긴 영상 찾음','ㅋㅋㅋㅋ','친구한테도 보냈어'],
  ['버스 기다리는중','너무 안 와','아 드디어 왔다','이제 집 간다'],
  ['숙제 다했어','생각보다 오래 걸렸음','이제 씻고 잘거야','오늘 피곤하다']
 ];
 for(let k=0;k<80;k++){uid=`dialog-${k}`;for(const text of dialogs[k%dialogs.length]){const r=await e.reply(text);total++;if(!r.reply||badRx.test(r.reply))bad.push({cat:'dialog',text,reply:r.reply,source:r.source,strategy:r.strategy});}}
 console.log('MOA_USER_FRICTION_SIM total='+total+' bad='+bad.length);
 if(bad.length)console.log(JSON.stringify(bad.slice(0,30),null,2));
 ok(total>=500,'simulation count below 500');
 ok(bad.length<=3,'too many frustrating generic replies: '+bad.length);
 console.log('MOA_USER_FRICTION_600_OK');
})().catch(e=>{console.error(e);process.exit(1)});
