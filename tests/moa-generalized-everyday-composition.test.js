const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('js/ai/moa-communication-engine.js?v=49'),'generalized everyday cache bust missing');
function boot(patterns=[],seedStart=1,userId='general-daily'){
  const data={},user={user_id:userId,isGuest:false},searches=[];let seed=seedStart>>>0;
  const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:1001,coreVersion:16,patterns,policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches};
}
const domains={
  school:['학교','학원','수업'],study:['숙제','시험','발표'],friend:['친구','걔','약속'],family:['엄마','동생','가족'],food:['점심','라면','카페'],game:['게임','축구','보드게임'],media:['유튜브','영화','웹툰'],tech:['폰','컴퓨터','인터넷'],transit:['버스','지하철','기차'],home:['방청소','설거지','빨래'],hobby:['그림','피아노','사진'],pet:['강아지','고양이','햄스터'],exercise:['운동','달리기','산책'],shopping:['택배','옷','신발'],outing:['공원','여행','캠핑'],weather:['비','날씨','바람']
};
const states=[
  ['relieved',' 드디어 해결됐어'],['finished',' 다 끝냈어'],['win',' 잘했어'],['lose',' 망했어'],['delayed',' 너무 늦었어'],['broken',' 갑자기 안돼'],['awkward',' 좀 어색했어'],['conflict',' 때문에 서운했어'],['surprise',' 갑자기 바뀌었어'],['tired',' 너무 피곤해'],['anxious',' 때문에 걱정돼'],['annoyed',' 진짜 짜증나'],['fun',' 생각보다 재밌었어'],['plan',' 내일 또 하려고'],['ongoing',' 하는중이야'],['new',' 새로 생겼어']
];
const bad=/(한마디만 더|한 조각만 더|조건이 하나|듣고 있어|계속 말해|얘기였구나|그 얘기 계속|맥락을 조금만|지금까지 나온 얘기 기준)/;
(async()=>{
  let checks=0;
  for(let seed=1;seed<=4;seed++){
    const {E}=boot([],seed,`general-${seed}`);
    for(const words of Object.values(domains))for(const w of words){
      // rotate through states rather than hard-code a small list of complete sentences
      const start=(w.length+seed)%states.length;
      for(let k=0;k<5;k++){
        const [,suffix]=states[(start+k)%states.length];
        E.clearContext();const r=await E.reply(w+suffix);
        ok(r.reply,`empty: ${w+suffix}`);ok(!bad.test(r.reply),`meta/ack-only: ${w+suffix} => ${r.reply}`);
        ok(r.source!=='search',`daily statement stolen by search: ${w+suffix}`);checks++;
      }
    }
  }
  ok(checks>=900,`not enough generalized checks ${checks}`);

  // No exact screenshot sentence is required: colloquial/typo variations still route as daily talk.
  const {E,searches}=boot([],88,'variant-user');
  for(const text of ['컴터 갑자기 안됌','친구랑 좀 어색햇어','학원 끝나서 드뎌 살았다','택배 생각보다 괜찬았어','버스 왤케 늦냐 진짜','강아지랑 놀앗는데 개재밋었어']){
    E.clearContext();const r=await E.reply(text);ok(r.reply&&!bad.test(r.reply),`variant failed ${text} => ${r.reply}`);ok(r.source!=='search',`variant stolen ${text}`);
  }

  // Existing feature routes must remain above everyday composition.
  E.clearContext();let r=await E.reply('23+19는?');ok(r.source==='local-utility'&&/^42/.test(r.reply),'calculator masked');
  E.clearContext();r=await E.reply('서울 오늘 날씨 알려줘');ok(r.source==='search','weather search masked');
  E.clearContext();r=await E.reply('장보고 누구냐');ok(r.source==='search','knowledge search masked');
  E.clearContext();r=await E.reply('가위바위보');ok(r.reply&&r.source!=='local-everyday','game route masked');
  E.clearContext();r=await E.reply('오늘 급식 뭔지 알아?');ok(r.source!=='local-everyday','school meal lookup/clarify masked');

  // Learned-human data must still beat the generic composition when strongly matched.
  const learned=[{id:'learned-awkward',trigger:'친구랑 좀 어색했어',reply:'아 그 분위기 진짜 애매했겠다 ㅋㅋ 괜히 말 꺼내기도 어렵고',act:'inform:event',strategy:'ack',affect:'neutral',confidence:.99,tier:'confirmed',humanChat:true,evidenceCount:40,semantic:{tokens:['친구','어색하다'],categories:['friend'],intent:'inform:event'}}];
  const B=boot(learned,7,'learned-general').E;await B.sync(true);B.clearContext();r=await B.reply('친구랑 좀 어색했어');
  ok(r.source==='learned-human'&&r.candidateId==='learned-awkward',`learned reply masked by generic everyday: ${JSON.stringify(r)}`);

  console.log(`MOA_GENERALIZED_EVERYDAY_COMPOSITION_OK checks=${checks}`);
})().catch(e=>{console.error(e);process.exit(1)});
