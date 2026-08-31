const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function boot(seedStart=1){const data={},user={user_id:'mut-'+seedStart,isGuest:false};let seed=seedStart>>>0;const fakeMath=Object.create(Math);fakeMath.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);const ctx={console,Date,Math:fakeMath,setTimeout:f=>{f();return 1},clearTimeout(){},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>1,remove:async()=>1},AuthApi:{moaSync:async()=>({ok:true,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>({reply:'SEARCH:'+x.query,source:'search'})}}};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return ctx.MiniTalk.AI.MoaCommunicationEngine;}
const pairs=[
 ['시험 보고왔어','근데 마지막 문제 틀렸어'],['발표 끝냈어','그래도 생각보다 잘했어'],['숙제 하는중','근데 양이 너무 많아'],['학원 갔다왔어','오늘은 덜 힘들었어'],
 ['친구랑 놀았어','근데 걔가 늦었어'],['친구랑 싸웠어','그래도 아까 풀었어'],['단톡 보고있었어','갑자기 다들 말하더라'],['답장 기다리는중','아직 안왔어'],
 ['게임 했어','근데 막판에 역전했어'],['롤 하는중','근데 인터넷 끊겼어'],['축구하고왔어','마지막에 골 먹었어'],['농구했어','그래도 지난번보다 잘했어'],
 ['라면 먹었어','생각보다 별로였어'],['카페 갔다왔어','그래도 디저트는 맛있었어'],['급식 먹었어','오늘 반찬 괜찮았어'],['치킨 시켰어','근데 너무 늦게왔어'],
 ['버스 타고있어','사람 너무 많아'],['지하철 기다리는중','근데 금방왔어'],['기차 탔어','자리 있어서 다행이야'],['택시 탔어','길이 엄청 막혀'],
 ['영화 봤어','결말이 좀 아쉬웠어'],['웹툰 보는중','근데 앱이 꺼졌어'],['유튜브 봤어','생각보다 재밌더라'],['책 읽었어','마지막 부분 어려웠어'],
 ['강아지 산책했어','근데 비왔어'],['고양이랑 놀았어','오늘은 안도망갔어'],['햄스터 보고있었어','갑자기 숨었어'],['강아지 씻겼어','그래도 얌전했어'],
 ['운동하고왔어','오늘 왜이렇게 힘드냐'],['배드민턴 쳤어','그래도 전보다 잘했어'],['달리기 했어','막판에 힘 빠졌어'],['체육했어','오늘은 재밌었어'],
 ['엄마랑 마트갔어','사람 너무 많았어'],['아빠랑 영화봤어','아빠는 재밌대'],['동생이랑 게임했어','걔가 이겼어'],['누나랑 얘기했어','그래도 마지막엔 풀렸어'],
 ['폰으로 게임했어','배터리 거의 없어'],['컴퓨터 하고있었어','와이파이 끊겼어'],['이어폰 찾는중','결국 찾았어'],['노트북 쓰는중','앱 갑자기 꺼졌어'],
 ['옷 샀어','집에서 보니 애매해'],['택배 기다렸어','오늘 드디어 왔어'],['신발 샀어','생각보다 좀 커'],['마트 갔다왔어','필요한 건 다 샀어'],
 ['그림 그렸어','마지막이 마음에 안들어'],['피아노 연습했어','어제보다 잘됐어'],['노래 듣는중','이어폰 배터리 나갔어'],['사진 찍었어','하나는 잘나왔어']
];
const typo=s=>s.replace(/했어/g,'햇어').replace(/왔어/g,'왓어').replace(/재밌/g,'재밋').replace(/괜찮/g,'괜찬').replace(/됐어/g,'됫어').replace(/맛있/g,'맛잇').replace(/왜이렇게/g,'왤케');
const variants=s=>[s,typo(s),s.replace(/\s+/g,''),s+' ㅋㅋ',typo(s)+' ㅋㅋ',s+'...'];
const meta=/(한마디만 더|한 조각만 더|조건이 하나|듣고 있어|계속 말해|이어(?:서)? 말해|그 얘기 계속|맥락을 조금만|뜻을 지어내|어느 부분을 말하는지 조금만)/;
(async()=>{let checks=0;for(let seed=1;seed<=4;seed++){const E=boot(seed);for(const [a,b] of pairs){for(const v of variants(b)){E.clearContext();await E.reply(a);const r=await E.reply(v);ok(r.reply,`empty ${a}/${v}`);ok(!meta.test(r.reply),`meta ${a}/${v} => ${r.reply}`);ok(r.source!=='search',`search theft ${a}/${v}`);checks++;}}}console.log(`MOA_MESSENGER_MUTATION_STRESS_OK checks=${checks} pairs=${pairs.length} variants=6`);})().catch(e=>{console.error(e);process.exit(1)});
