const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');

function hashExpr(text){let h=2166136261;for(const ch of String(text||'').trim().toLowerCase()){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return "e"+(h>>>0).toString(36);}
let seed=17;const fakeMath=Object.create(Math);fakeMath.random=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
const store={};let commits=[],searches=[],currentUser='stress-user';
const weighted={};
weighted[hashExpr('오, 잘됐네 ㅋㅋ')]={positiveScore:7,negativeScore:0,tier:'confirmed'};
weighted['f:laugh']={positiveScore:4,negativeScore:.2,tier:'confirmed'};
weighted['f:question']={positiveScore:.2,negativeScore:3,tier:'growing'};
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:currentUser,isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{
  moaSync:async()=>({ok:true,version:77,policy:{},expressionWeights:weighted}),
  moaSearch:async({query})=>{searches.push(query);return {reply:'검색:'+query,source:'test-search',kind:'general'}},
  moaCommit:async p=>{commits.push(p);return {ok:true,version:78}}
}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);

const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
const ordinary=[
'안녕','ㅎㅇ','뭐해','심심해','배고파','피곤해','졸려','기분 좋아','오늘 별로야','짜증나',
'학교 다녀왔어','오늘 학교 힘들었어','급식 맛없었어','친구랑 축구했어','시험 100점 받았어','엄마가 치킨 사줬어','친구랑 싸웠어','내 말 무시했어',
'오늘 보드게임 했어','규칙이 어려웠어','그래도 마지막에 이겼어','친구가 아쉬워했어','다음엔 다른 게임 하기로 했어',
'나는 떡볶이 좋아해','난 오이 싫어해','내 별명은 감자야','내가 뭐 좋아한다고 했지?','내 별명 뭐였지?',
'내일 시험 있어','다음 주 발표 있어','주말에 영화 볼 거야','이제 쉬는 중이야','숙제 끝냈어',
'ㅋㅋ','ㅋㅋㅋㅋ','ㅇㅇ','응','아니','ㄴㄴ','몰라','모름','그냥','귀찮아','됐어','패스',
'...','???','!!!',';;;;','ㅡㅡ','헐','대박','진짜?','왜?','뭐라고?',
'넌 멍청해','너 등신이냐','답변 왜 이렇게 이상해','못 알아듣냐','아 답답해','헛소리하지마','그게 아니라 피자 먹었다고',
'고마워','잘하네','오 잘했어','맞아','응 맞아','아니 틀렸어',
'뭐 먹을까','뭐 할까','오늘 뭐하지','게임할까 공부할까','치킨이랑 피자 중 뭐 먹지',
'세종대왕 찾아줘','서울 오늘 날씨 알려줘','고양이 사진 찾아줘','환율 알려줘','뉴스 찾아줘',
'오늘 며칠이야','지금 몇 시야','오늘 무슨 요일이야','2+3은?','10 곱하기 4',
'아까 뭐 얘기했지','전에 내가 뭐 말했다고 했지','그게 누구야','그건 왜 그래','그 다음은?',
'저 오늘 조금 피곤해요','감사합니다','오늘 학교에서 축구를 했어요','음... 잘 모르겠어요','그만 물어봐',
'나 오늘 진짜 개빡쳤어','아 시발 짜증나','존나 피곤함','ㅅㅂ','병신같은 하루네',
'오늘은 그냥 평범했어','별일 없었어','그럭저럭','괜찮았어','재밌었어','아쉬웠어','기분 안 좋아',
'친구가 전학 갔어','게임에서 졌어','게임에서 이겼어','선생님한테 칭찬받았어','버스 놓쳤어','비 맞았어','간식 먹었어',
'갑자기 주제 바꿀게 공룡 좋아해','아무튼 다른 얘기 하자','그 얘긴 그만','됐고 축구 얘기하자'
];

(async()=>{
  await e.sync(true);
  ok(e.debugSnapshot().expressionWeights['f:laugh'],'expression weights did not sync');

  let nonempty=0;
  for(const text of ordinary){
    const before=searches.length;
    const r=await e.reply(text);
    ok(r && typeof r.reply==='string' && r.reply.trim(),`empty reply: ${text}`);
    ok(r.reply.length<500,`runaway reply: ${text}`);
    ok(!/undefined|null|\[object Object\]/.test(r.reply),`broken serialization: ${text} -> ${r.reply}`);
    if(/넌 멍청해|너 등신이냐|답변 왜 이렇게 이상해|못 알아듣냐|아 답답해|헛소리하지마/.test(text))ok(searches.length===before,'complaint/insult triggered search: '+text);
    nonempty++;
  }

  // Repetition / diversity: many similar positive events should not collapse to one sentence.
  const variants=[];
  for(let i=0;i<80;i++){const r=await e.reply(`오늘 게임에서 이겼어 ${i}`);variants.push(r.reply);}
  ok(new Set(variants).size>=5,'weighted selection collapsed diversity');

  // Question pressure: neutral statements should not become an interrogation loop.
  let q=0;
  for(let i=0;i<40;i++){const r=await e.reply(`오늘 그냥 평범한 일이 있었어 ${i}`);if(/[?？]$/.test(r.reply))q++;}
  ok(q<=16,'question pressure too high: '+q);


  // Multi-user longitudinal simulation: different tones and habits must stay isolated/local.
  const personas=[
    ['short',['ㅇㅇ','몰라','그냥','피곤','밥먹음','학교감','ㅋㅋ','ㄴㄴ','됐어','심심']],
    ['formal',['안녕하세요','오늘 학교에 다녀왔어요','조금 피곤해요','감사합니다','내일 시험이 있어요','잘 모르겠어요','괜찮아요','오늘은 즐거웠어요']],
    ['rough',['아 시발 피곤해','존나 짜증남','ㅅㅂ','게임 개빡셈','그래도 이겼어 ㅋㅋ','아 답답해','됐고 다른 얘기','오늘은 괜찮음']],
    ['laugh',['ㅋㅋ','ㅋㅋㅋㅋ','오늘 축구함ㅋㅋ','이겼음ㅋㅋ','친구가 아쉬워함ㅋㅋ','ㅇㅇㅋㅋ','재밌었음','다음에 또 할거임']],
    ['noquestions',['그냥 말만 할게','오늘 학교 갔어','급식 먹었어','집 왔어','숙제했어','이제 쉴 거야','별일 없었어','그 얘긴 그만']],
    ['story',['오늘 친구랑 축구했어','처음엔 졌어','근데 후반에 골 넣었어','친구가 패스 잘해줬어','결국 이겼어','다음 주에도 하기로 했어']],
    ['switcher',['공룡 좋아해','근데 피자 먹었어','아 맞다 내일 시험','됐고 게임 얘기','오늘 비 왔어','갑자기 축구 보고 싶다','아무튼 졸려']],
    ['corrector',['오늘 라면 먹었어','아니 피자 먹었다고','친구랑 갔어','아니 형이랑 갔다고','재밌었어','그게 아니라 영화가 재밌었다고']],
    ['positive',['오늘 상 받았어','기분 좋아','게임도 이겼어','친구가 축하해줬어','ㅋㅋ 좋네','고마워']],
    ['negative',['오늘 좀 힘들었어','친구랑 싸웠어','버스도 놓쳤어','비도 맞았어','기분 별로야','그냥 쉬고 싶어']],
    ['planner',['주말에 영화 볼 거야','그 다음엔 밥 먹을 거야','다음 주엔 축구할 거야','시험 끝나면 게임할 거야','방학엔 여행 가고 싶어']],
    ['curious',['왜?','그게 누구야','그건 뭐야','어떻게 해?','진짜?','왜 그런 건데?']]
  ];
  let multiTurns=0;
  for(let pi=0;pi<personas.length;pi++){
    currentUser='persona-'+pi;
    await e.sync(true);
    const [name,rows]=personas[pi];
    for(let round=0;round<3;round++)for(const text of rows){
      const r=await e.reply(text);ok(r?.reply?.trim(),`persona ${name} empty: ${text}`);
      ok(!/undefined|null|\[object Object\]/.test(r.reply),`persona ${name} broken: ${r.reply}`);
      multiTurns++;
    }
    const snap=e.debugSnapshot();
    ok(snap.ownership.personal==='local-only','personal ownership changed');
    ok(snap.ownership.server==='public-learning-only','server ownership changed');
  }

  currentUser='stress-user';
  // Explicit feedback should carry only abstract IDs, never raw reply text.
  await e.reply('오늘 학교에서 상 받았어');
  await e.reply('응 맞아');
  await e.flushCommit();
  const events=commits.flatMap(v=>v.events||[]);
  ok(events.length>0,'no feedback events queued');
  for(const ev of events){
    ok(ev.type==='policy_feedback','unexpected event type');
    ok(/^e[a-z0-9]+$/.test(ev.expressionKey||''),'expression hash missing');
    ok(Array.isArray(ev.featureKeys),'feature keys missing');
    ok(!('reply' in ev)&&!('trigger' in ev)&&!('text' in ev),'raw dialogue leaked in feedback');
    ok((ev.featureKeys||[]).every(k=>/^f:[a-z0-9-]+$/.test(k)),'unsafe feature key');
  }

  // Personal memory remains local.
  await e.reply('나는 수박 좋아해');
  const mem=await e.reply('내가 뭐 좋아한다고 했지?');
  ok(/수박/.test(mem.reply),'local memory regression');
  ok(events.every(ev=>!JSON.stringify(ev).includes('수박')),'personal memory leaked');

  // Apps Script architecture / cleanup.
  ok(gs.includes('var MOA_EXPRESSION_SHEET = "모아_표현가중치"'),'public expression sheet missing');
  ok(gs.includes('moaPublicExpressionWeights_'),'public expression snapshot missing');
  ok(gs.includes('moaStoreExpressionEvents_'),'expression feedback storage missing');
  ok(gs.includes('"모아_개인기억","모아_사용자성향","모아_표현학습"'),'legacy personal cleanup missing');
  ok(gs.includes('preserved:[MOA_POLICY_SHEET,MOA_EXPRESSION_SHEET]'),'public sheets not protected in cleanup');
  ok(!/MOA_MEMORY_SHEET|MOA_PROFILE_SHEET/.test(gs),'personal sheet runtime constants returned');

  console.log(`MOA_WEIGHTED_DIALOGUE_STRESS_OK scenarios=${ordinary.length} diversity=${new Set(variants).size} neutralQuestions=${q} multiUserTurns=${multiTurns} feedback=${events.length}`);
})().catch(err=>{console.error(err);process.exit(1);});
