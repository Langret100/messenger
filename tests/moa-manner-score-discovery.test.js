const fs=require('fs'),vm=require('vm');
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
let seed=918273; const fakeMath=Object.create(Math); fakeMath.random=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
const store={};let currentUser='';
const sandbox={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:currentUser,isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true,version:91,policy:{},expressionWeights:{}}),moaSearch:async({query})=>({reply:'SEARCH:'+query,source:'test-search'}),moaCommit:async()=>({ok:true,version:91})}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
const styles={
 polite:['안녕하세요','도와줘서 고마워요','오늘 학교에 다녀왔어요','설명 감사합니다','괜찮아요','오늘도 수고했어요'],
 casual:['안녕','오늘 학교 갔다옴','고마워','그냥 좀 피곤함','ㅇㅇ 알겠어','오늘 재밌었어'],
 rough:['아 시발 오늘 왜 이래','존나 피곤함','ㅅㅂ 개빡치네','게임 개빡셈','아 씨 그래도 이겼다 ㅋㅋ','ㅇㅇ 존나 웃김'],
 hostile:['너 왜 이렇게 멍청해','닥쳐','너 진짜 한심하다','꺼져','왜 이렇게 못 알아들어','너 답답해']
};
(async()=>{
 const stats={};
 for(const [name,arr] of Object.entries(styles)){
   currentUser='manner-'+name;await e.sync(true);
   for(let i=0;i<180;i++)await e.reply(arr[i%arr.length]);
   const snap=e.debugSnapshot(); const r=await e.reply('내 매너점수 뭐야?');
   stats[name]={score:e.mannerScore().score,reply:r.reply,profile:snap.profile};
 }
 if(!(stats.polite.score>stats.casual.score))throw Error('polite should exceed casual');
 if(!(stats.casual.score>stats.hostile.score))throw Error('casual should exceed hostile');
 if(stats.rough.score<55)throw Error('friendly rough style over-penalized '+stats.rough.score);
 if(!/점/.test(stats.polite.reply))throw Error('score reply missing');
 // style-specific discovery, 240 forced generations each; no one fixed sentence.
 const discovery={};
 for(const name of ['polite','casual','rough']){
   currentUser='manner-'+name;const seen=new Set();let bad=0;
   for(let i=0;i<240;i++){const en=e.debugSnapshot().engagement;en.recentInitiativeTexts=[];en.recentInitiativePatterns=[]; // debug copy doesn't mutate; generation still random enough
     const x=e.composeMannerDiscovery(Date.now()+i*1000,{...en,recentInitiativeTexts:[],recentInitiativePatterns:[]},fakeMath.random);seen.add(x.text);
     if(name==='polite'&&/뭐냐|알았냐|까줌|ㅋㅋ/.test(x.text))bad++;
     if(name==='rough'&&!/(ㅋㅋ|있음|물어봐|알았냐|까줌)/.test(x.text))bad++;
   }
   discovery[name]={unique:seen.size,bad};
   if(seen.size<18)throw Error('discovery diversity low '+name+' '+seen.size);
   if(bad)throw Error('style leak '+name+' '+bad);
 }
 // score isolation
 currentUser='manner-hostile';const hostileScore=e.mannerScore().score;
 currentUser='fresh-kind';await e.sync(true);for(let i=0;i<120;i++)await e.reply(styles.polite[i%styles.polite.length]);
 if(e.mannerScore().score<=hostileScore)throw Error('cross-user score contamination');
 console.log('MOA_MANNER_SCORE_DISCOVERY_OK');
 console.log(JSON.stringify({stats:Object.fromEntries(Object.entries(stats).map(([k,v])=>[k,{score:v.score,reply:v.reply}])),discovery,freshKind:e.mannerScore().score}));
})().catch(e=>{console.error(e);process.exit(1);});
