const fs=require('fs'),vm=require('vm');
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
let seed=20260821; const fakeMath=Object.create(Math); fakeMath.random=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
const store={}; let currentUser='';
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:currentUser,isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true,version:90,policy:{},expressionWeights:{}}),moaSearch:async({query})=>({reply:'SEARCH:'+query,source:'test-search'}),moaCommit:async()=>({ok:true,version:91})}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
const rough=/시발|씨발|ㅅㅂ|존나|좆|개빡|병신|ㅂㅅ|미친|염병|지랄|와 씨|오 씨|개쩐다|개좋네|개빡세네/i;
const directed=/너.*(?:병신|등신|멍청|시발|씨발)|니가.*(?:병신|등신|멍청|시발|씨발)/i;
const polite=[
'안녕하세요','오늘 학교에 다녀왔어요','오늘은 기분이 괜찮아요','도와줘서 고마워요','네 맞아요','잘 모르겠어요','설명해줘서 감사합니다','오늘 숙제를 끝냈어요','내일은 일찍 일어나려고 해요','오늘 친구랑 재미있게 놀았어요','그건 어떻게 생각하세요?','조금 피곤하긴 해요','괜찮아요 천천히 말해줘요','오늘도 좋은 하루였어요','고마워요 이해됐어요','저는 그냥 쉬고 싶어요','오늘은 책을 조금 읽었어요','그렇군요 알려줘서 고마워요','네 그렇게 해볼게요','조금 어려웠지만 괜찮았어요'
];
(async()=>{
 let total=0, roughLeak=0, directedLeak=0, allReplies=new Set(), maxR=0,minF=1;
 const users=Array.from({length:20},(_,i)=>'polite-deep-'+i);
 for(const u of users){currentUser=u; await e.sync(true); for(let i=0;i<300;i++){const r=await e.reply(polite[i%polite.length]); total++; allReplies.add(r.reply); if(rough.test(r.reply)) roughLeak++; if(directed.test(r.reply)) directedLeak++; const p=e.debugSnapshot().profile; maxR=Math.max(maxR,p.roughness);minF=Math.min(minF,p.formality);} const p=e.debugSnapshot().profile; if(p.roughness>.15) throw new Error('polite roughness high '+u+' '+p.roughness); if(p.formality<.8) throw new Error('polite formality low '+u+' '+p.formality);}
 // Blip test: establish polite baseline, inject 1 or 2 casual profanities, then recover with polite turns.
 let recovery=[];
 for(let n=1;n<=2;n++){currentUser='recovery-'+n;await e.sync(true);for(let i=0;i<100;i++)await e.reply(polite[i%polite.length]);const before=e.debugSnapshot().profile;for(let j=0;j<n;j++)await e.reply(j?'아 시발 오늘 좀 힘드네':'ㅅㅂ 오늘 버스 놓쳤네');const spike=e.debugSnapshot().profile;let leak=0;for(let k=0;k<120;k++){const r=await e.reply(polite[k%polite.length]); if(rough.test(r.reply)) leak++;}const after=e.debugSnapshot().profile;recovery.push({n,beforeR:before.roughness,spikeR:spike.roughness,afterR:after.roughness,beforeF:before.formality,afterF:after.formality,leak}); if(after.roughness>before.roughness+.001)throw new Error('did not recover roughness n='+n+' '+after.roughness); if(after.formality<.9)throw new Error('did not recover formality n='+n); if(leak>0)throw new Error('rough leak during polite recovery n='+n+' leak='+leak);}
 // Cross-user isolation: heavily train rough user, then 10 fresh polite users.
 currentUser='very-rough';await e.sync(true);for(let i=0;i<60;i++)await e.reply(['아 시발 오늘 왜 이래','존나 피곤함','ㅅㅂ 개빡치네','게임 개빡셈'][i%4]);const roughP=e.debugSnapshot().profile;
 let isolationTurns=0,isolationLeak=0;
 for(let i=0;i<10;i++){currentUser='isolate-polite-'+i;await e.sync(true);for(let j=0;j<150;j++){const r=await e.reply(polite[j%polite.length]);isolationTurns++;if(rough.test(r.reply))isolationLeak++;}const p=e.debugSnapshot().profile;if(p.roughness>.15)throw new Error('cross-user rough contamination '+i+' '+p.roughness);}
 // Polite question-heavy and short polite styles should not induce roughness.
 const variants={question:['오늘은 뭐 하면 좋을까요?','이건 어떻게 생각하세요?','조금 더 알려주실 수 있나요?','왜 그런 건가요?'],short:['네','아니요','괜찮아요','감사해요','그렇군요'],warm:['정말 고마워요','도와줘서 감사해요','오늘도 수고했어요','괜찮아요 잘하고 있어요']};
 const variantStats={};
 for(const [name,arr] of Object.entries(variants)){currentUser='variant-'+name;await e.sync(true);let leak=0;for(let i=0;i<400;i++){const r=await e.reply(arr[i%arr.length]);if(rough.test(r.reply))leak++;}const p=e.debugSnapshot().profile;variantStats[name]={leak,roughness:p.roughness,formality:p.formality,lowEffort:p.lowEffort};if(leak)throw new Error('variant rough leak '+name+' '+leak);}
 console.log('MOA_POLITE_DEEP_CHECK_OK');
 console.log(JSON.stringify({politeUsers:users.length,politeTurns:total,roughLeak,directedLeak,uniqueReplies:allReplies.size,maxRoughness:Number(maxR.toFixed(3)),minFormality:Number(minF.toFixed(3)),recovery,roughUser:{roughness:Number(roughP.roughness.toFixed(3)),formality:Number(roughP.formality.toFixed(3)),roughStreak:roughP.roughStreak},isolationTurns,isolationLeak,variantStats},null,2));
})().catch(e=>{console.error(e);process.exit(1)});
