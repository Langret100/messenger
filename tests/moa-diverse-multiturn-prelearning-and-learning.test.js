const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function boot(patterns=[],seedStart=1,userId='diverse-user'){
  const data={},user={user_id:userId,isGuest:false};let seed=seedStart>>>0;const searches=[];
  const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:920,coreVersion:12,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches};
}
const cases=[
  ['학교에서 발표했어','근데 생각보다 안 떨렸어'],['시험 봤어','생각보다 쉬웠어'],['숙제 엄청 많아','그래도 반은 했어'],
  ['게임 한 판 했어','근데 마지막에 역전했어'],['축구하고 왔어','그래도 재밌었어'],['농구했어','그리고 내일 또 하기로 했어'],
  ['친구 만나고 왔어','근데 걔가 늦었어'],['친구랑 얘기했어','그래도 마지막엔 풀었어'],['친구랑 싸웠어','그래도 지금은 좀 괜찮아'],
  ['피자 먹었어','근데 너무 배불러'],['급식 먹었어','근데 오늘은 맛있었어'],['라면 먹을까 고민중','근데 어제도 먹었어'],
  ['버스 기다리는 중이야','근데 아직 안 와'],['버스 탔어','근데 자리가 없어'],['학교 끝났어','그래서 바로 집 왔어'],
  ['영화 봤어','생각보다 재밌었어'],['유튜브 보고 있었어','근데 영상이 너무 길었어'],['웹툰 봤어','근데 결말이 좀 아쉬웠어'],
  ['강아지 산책했어','근데 비 와서 빨리 들어왔어'],['고양이랑 놀았어','근데 갑자기 도망갔어'],['헬스하고 왔어','그래도 오늘은 덜 힘들었어'],
  ['엄마랑 장 보러 갔어','근데 사람이 너무 많았어'],['동생이랑 게임했어','근데 걔가 이겼어'],['아빠랑 영화 봤어','근데 아빠는 졸았어'],
  ['시험 망한 줄 알았어','근데 점수는 괜찮았어'],['급식 별로였어','그래도 디저트는 맛있었어'],['게임 졌어','근데 진짜 한 점 차이였어'],
  ['학원 갔다왔어','그래도 오늘은 빨리 끝났어'],['숙제 끝냈어','그래서 이제 게임할거야'],['친구한테 선물 받았어','근데 나도 뭐 줘야할까'],
  ['만화 보고 있었어','근데 갑자기 끊겼어'],['기차 타고 가는 중이야','근데 사람이 많아'],['배드민턴 쳤어','그래도 지난번보단 잘했어'],
  ['수행평가 했어','근데 막상 해보니 괜찮았어'],['친구랑 놀다왔어','그리고 오는 길에 비 맞았어'],['치킨 먹었어','근데 너무 많이 먹었어'],
  ['아빠랑 산책했어','그래도 날씨는 좋았어'],['고양이 보고 있었어','근데 갑자기 내 자리 뺏었어'],['게임 하고 있었어','근데 인터넷이 끊겼어'],
  ['학교 가는 중이야','근데 버스가 늦어'],['과제 하는 중이야','그래도 거의 다 했어'],['영화 보고 왔어','그래서 집에서 결말 얘기했어']
];
const bad=/(한마디만 더|한 조각만 더|맥락을 조금만|조건이 하나|듣고 있어|이어(?:서)? 말해|계속 말해|그 얘기 계속|무슨 말인지 따라가|상황은 알겠어|얘기였구나\. 이제 그 기준)/;
(async()=>{
  let checked=0;
  for(let seed=1;seed<=5;seed++){
    const {E}=boot([],seed,`pre-${seed}`);
    for(const seq of cases){
      E.clearContext();let first=await E.reply(seq[0]);let second=await E.reply(seq[1]);
      ok(first.reply&&second.reply,`empty reply: ${seq.join(' / ')}`);
      ok(!bad.test(second.reply),`pre-learning conversation collapsed to meta/generic reply: ${seq.join(' / ')} => ${second.reply}`);
      ok(second.source!=='search'||/(찾아|검색|날씨|기온|몇도)/.test(seq[1]),`ordinary story was stolen by search: ${seq.join(' / ')} => ${second.reply}`);
      checked++;
    }
  }
  ok(checked===cases.length*5,'not all diverse cases executed');

  // Strong human-chat learning must still enter the real output path even when the
  // improved local continuity layer already has a plausible reply.
  const learned=[
    {id:'human-game-reversal',trigger:'근데 마지막에 역전했어',reply:'와 막판 역전이면 그 판은 기억에 남겠다 ㅋㅋ',act:'inform:emotion',strategy:'ack',affect:'positive',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:18,semantic:{tokens:['마지막','역전'],categories:['game','emotion'],intent:'inform:emotion'}},
    {id:'human-dessert-save',trigger:'그래도 디저트는 맛있었어',reply:'ㅋㅋ 그래도 디저트가 살렸네',act:'inform:emotion',strategy:'ack',affect:'positive',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:20,semantic:{tokens:['디저트','맛있다'],categories:['food'],intent:'inform:emotion'}}
  ];
  const {E,searches}=boot(learned,77,'learned-diverse');await E.sync(true);
  ok(E.debugSnapshot().patterns.length>=2,'learned patterns were not loaded');
  E.clearContext();await E.reply('게임 한 판 했어');let r=await E.reply('근데 마지막에 역전했어');
  ok(r.source==='learned-human'&&/역전/.test(r.reply),`continuity masked matching learned-human output: ${r.source} / ${r.reply}`);
  E.clearContext();await E.reply('급식 별로였어');r=await E.reply('그래도 디저트는 맛있었어');
  ok(r.source==='learned-human'&&/(디저트|맛있)/.test(r.reply),`food continuity masked matching learned-human output: ${r.source} / ${r.reply}`);

  // Dedicated functions still outrank both local continuity and learned chat.
  E.clearContext();await E.reply('학교 얘기하는 중이야');r=await E.reply('12*7은?');ok(r.source==='local-utility'&&/^84/.test(r.reply),'calculator was masked');
  r=await E.reply('가위바위보 하자');ok(/가위.*바위.*보/.test(r.reply),'RPS was masked');
  E.clearContext();r=await E.reply('세종대왕 찾아줘');ok(r.source==='search','explicit search was masked');
  r=await E.reply('그 사람 업적은?');ok(r.source==='search'&&/세종대왕/.test(searches.at(-1)||''),'search follow-up lost its anchor');
  E.clearContext();await E.reply('강아지 산책했어');r=await E.reply('근데 비 와서 빨리 들어왔어');ok(r.source!=='search','weather word inside a story incorrectly forced search');
  E.clearContext();r=await E.reply('서울 오늘 날씨 알려줘');ok(r.source==='search','real weather lookup stopped using search');
  console.log(`MOA_DIVERSE_MULTITURN_PRELEARNING_AND_LEARNING_OK cases=${checked} learned=2`);
})().catch(e=>{console.error(e);process.exit(1)});
