const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('js/ai/moa-communication-engine.js?v=14'),'v107 cache bust v14 missing');
ok(engine.includes('function everydayContextReply(raw)'),'everyday context reply missing');
ok(engine.includes('function correctionReply(frame)'),'correction reply missing');
function make(uid){
 const store={};const fakeMath=Object.create(Math);let n=0;fakeMath.random=()=>[.01,.37,.73,.19,.55][n++%5];
 const sb={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:uid,isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true}),moaSearch:async()=>({ok:true,reply:'',results:[]}),moaCommit:async()=>({ok:true})}}};
 vm.createContext(sb);vm.runInContext(engine,sb);return sb.MiniTalk.AI.MoaCommunicationEngine;
}
(async()=>{
 let e=make('complaint');
 let r=await e.reply('넌 멍청해');ok(r.strategy==='social'&&!/질문을 다시|느낌/.test(r.reply),'insult unnatural: '+r.reply);
 r=await e.reply('아니 진짜 대답 이상하잖아');ok(r.strategy==='social'&&/답|헛다리|다시|이상/.test(r.reply),'complaint not recognized: '+r.reply);
 r=await e.reply('내가 점심 뭐먹지 물었는데');ok(/점심|제육|돈까스|김밥|국수|덮밥|냉면/.test(r.reply),'repair did not answer original decision: '+r.reply);

 e=make('negative');await e.reply('오늘 시험 망했어');await e.reply('수학이 너무 어려웠어');
 r=await e.reply('두 문제나 틀렸어');ok(!/잘못 알아|잘못 짚|다시 맞춰/.test(r.reply)&&/신경|아쉽|힘들|기분|그랬/.test(r.reply),'wrong-answer event misread as correction: '+r.reply);
 r=await e.reply('아쉽다');ok(!/조금 더 말|뜻을 단정/.test(r.reply),'regret got generic fallback: '+r.reply);

 e=make('self');r=await e.reply('너 누구야');ok(/모아/.test(r.reply),'self identity missed: '+r.reply);

 e=make('future');await e.reply('오늘 축구했어');r=await e.reply('근데 내일 과학 시험이야');ok(!/해보려는|계획/.test(r.reply)&&/시험|일정|내일|신경|준비/.test(r.reply),'future event misread as plan: '+r.reply);

 e=make('correction');await e.reply('오늘 떡볶이 먹었어');r=await e.reply('아니 피자 먹었다고');ok(/피자/.test(r.reply)&&/잘못|였구나/.test(r.reply),'explicit correction missed: '+r.reply);
 r=await e.reply('그게 아니라 친구가 먹었어');ok(/잘못|포인트|앞말/.test(r.reply),'detail correction missed: '+r.reply);

 e=make('positive');await e.reply('오늘 학교에서 축구했어');r=await e.reply('마지막에 내가 골 넣었어');ok(/잘됐|좋|기분|기억|그랬/.test(r.reply)&&!/얘기였구나/.test(r.reply),'goal event got noun echo: '+r.reply);
 r=await e.reply('ㅋㅋ');ok(!/느낌|기분이 어땠/.test(r.reply),'laughter got therapy question: '+r.reply);

 e=make('plain');await e.reply('숙제 했어');r=await e.reply('이제 쉬는 중이야');ok(/쉬/.test(r.reply)&&!/얘기였구나/.test(r.reply),'rest context unnatural: '+r.reply);
 console.log('MOA_DIALOGUE_MATRIX_V107_OK');
})().catch(e=>{console.error(e);process.exit(1)});
