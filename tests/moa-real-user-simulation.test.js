const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('js/ai/moa-communication-engine.js?v=32'),'MOA engine cache bust v17 missing');
let seed=0x5f3759df; const fakeMath=Object.create(Math); fakeMath.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const user={user_id:'sim-base',isGuest:false},persist=new Map();
const ctx={console,Date,Math:fakeMath,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>persist.has(k)?persist.get(k):d,set:(k,v)=>persist.set(k,v),remove:k=>persist.delete(k)},AuthApi:{moaSync:async()=>({ok:true}),moaSearch:async()=>({}),moaCommit:async()=>({ok:true})}}};
vm.createContext(ctx);vm.runInContext(src,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
const setUser=id=>{user.user_id=id;E.clearContext();};
const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
const maxRun=arr=>{let best=0,run=0,prev=null;for(const x of arr){const n=norm(x);run=n===prev?run+1:1;prev=n;best=Math.max(best,run);}return best;};
async function turns(inputs){const out=[];for(const input of inputs){const r=await E.reply(input);out.push(r.reply);}return out;}
(async()=>{
  // 1) The exact real-world failure: increasing question marks must not collapse to one canned sentence.
  setUser('punct-question');
  const q=await turns(['??','???','????','?????','??????','???????','??','???','????','?????']);
  ok(new Set(q.map(norm)).size>=7,'question punctuation diversity too low: '+JSON.stringify(q));
  ok(maxRun(q)===1,'question punctuation exact repeat: '+JSON.stringify(q));
  ok(!q.every(v=>norm(v)==='응? 뭐가 이상했어?'),'old fixed question reply survived');

  // 2) Mixed low-effort punctuation in a realistic burst.
  setUser('punct-mixed');
  const mixedInputs=['...','....','??','!!!',';;;;','???','……','!!!!!','；；','????','...','??',';;;;','!!!','.....','?????','；；；','……','???','!!!!'];
  const mixed=await turns(mixedInputs);
  ok(new Set(mixed.map(norm)).size>=13,'mixed punctuation diversity too low: '+JSON.stringify(mixed));
  ok(maxRun(mixed)<=1,'mixed punctuation consecutive repeat: '+JSON.stringify(mixed));

  // 3) A consistently polite user should receive polite short-style responses too.
  setUser('polite-user');
  for(let i=0;i<30;i++)await E.reply(i%3===0?'고마워요':i%3===1?'괜찮아요':'부탁해요');
  const polite=await turns(['??','...','!!!',';;;;','???','....']);
  ok(polite.every(v=>/(요|네요|괜찮아요|있어요|볼게요|주세요)[.!?？]?$/.test(norm(v))||/(요[.?]|네요[.?])/.test(norm(v))), 'polite punctuation leaked casual style: '+JSON.stringify(polite));
  ok(!polite.some(v=>/뭐냐|뭔데|냐\b|개많|씨\b/.test(v)),'polite user received rough wording: '+JSON.stringify(polite));
  ok(maxRun(polite)===1,'polite fast-path repetition: '+JSON.stringify(polite));

  // 4) A repeatedly rough-but-not-directed user should adapt locally, without becoming formal or identical every turn.
  setUser('rough-user');
  for(let i=0;i<28;i++)await E.reply(i%2?'아 존나 짜증나':'와 개빡세네');
  const rough=await turns(['??','???','...','!!!',';;;;','????','....','!!!!!']);
  ok(rough.some(v=>/ㅋㅋ|뭐냐|냐\b|씨\b|개많/.test(v)),'rough user did not get rough/casual adaptation: '+JSON.stringify(rough));
  ok(!rough.some(v=>/(괜찮아요|있어요|주세요|네요)$/.test(norm(v))),'rough user leaked polite ending: '+JSON.stringify(rough));
  ok(maxRun(rough)===1,'rough punctuation repeated exactly: '+JSON.stringify(rough));

  // 5) Profanity-only fast path used to be another fixed-return trap. Stress repeated reactions.
  setUser('rough-profanity');
  const prof=[];for(let i=0;i<24;i++)prof.push((await E.reply(i%3===0?'아 존나':i%3===1?'시발 짜증나':'개빡치네')).reply);
  ok(new Set(prof.map(norm)).size>=8,'profanity fast-path diversity too low: '+JSON.stringify(prof));
  ok(maxRun(prof)<=1,'profanity fast-path consecutive repeat: '+JSON.stringify(prof));

  // 6) Short repair utterances should not chant one repair sentence.
  setUser('short-repair');
  await E.reply('오늘 숙제 얘기하고 있었어');
  const shorts=await turns(['뭐','뭘','아니','아오','무슨말','아휴','아니뭐','뭔데','에휴','뭐','아니','으휴']);
  ok(new Set(shorts.map(norm)).size>=8,'short repair diversity too low: '+JSON.stringify(shorts));
  ok(maxRun(shorts)<=1,'short repair consecutive repeat: '+JSON.stringify(shorts));
  ok(!shorts.some(v=>/(뭐|뭘|아니|아오|아휴|에휴|으휴)\s*(?:쪽\s*)?얘기(?:구나|네|였구나)/.test(v)),'short utterance invented a topic: '+JSON.stringify(shorts));

  // 7) Cross-user isolation: rough adaptation must not contaminate a new polite user.
  setUser('isolation-polite');
  for(let i=0;i<25;i++)await E.reply('괜찮아요');
  const isolated=await turns(['??','...','!!!',';;;;']);
  ok(!isolated.some(v=>/뭐냐|개많|씨\b|냐\b/.test(v)),'cross-user rough style leak: '+JSON.stringify(isolated));

  // 8) Longer mixed conversation: common ordinary statements, reactions and punctuation intermixed.
  setUser('mixed-conversation');
  const script=['안녕','오늘 학교 갔다왔어','급식 맛없었어','아오','친구랑 축구했어','마지막에 골 넣었어','ㅋㅋ','??','아니','그래서 다시 했어','...','숙제도 끝냈어','ㅇㅇ','!!!','오늘 별일 없었어',';;;;','뭐','아니 그게 아니라 그냥 피곤해','....','???'];
  const convo=await turns(script);
  ok(maxRun(convo)<=1,'mixed conversation produced immediate exact repeat: '+JSON.stringify(convo));
  ok(!convo.some(v=>/어떤 느낌|어떻게 느꼈|기분이 어땠/.test(v)),'mixed ordinary conversation became therapy-like: '+JSON.stringify(convo));

  // 9) Multi-user stress: 32 users x 80 turns, alternating style profiles and low-effort bursts.
  let total=0;
  for(let u=0;u<32;u++){
    setUser('stress-'+u);const persona=u%4;
    const out=[];
    for(let i=0;i<80;i++){
      let input;
      if(persona===0)input=i<22?'괜찮아요':['??','...','!!!',';;;;','오늘 학교 갔다왔어','ㅇㅇ'][i%6];
      else if(persona===1)input=i<22?(i%2?'존나 짜증나':'개빡세네'):['??','???','...','!!!',';;;;','ㅋㅋ'][i%6];
      else if(persona===2)input=['오늘 학교 갔다왔어','급식 별로였어','그냥','ㅇㅇ','...','??','숙제 끝냈어','아오'][i%8];
      else input=['뭐','아니','??',';;;;','오늘 별일 없었어','ㅋㅋ','...','!!!'][i%8];
      out.push((await E.reply(input)).reply);total++;
    }
    ok(maxRun(out)<=2,'stress user '+u+' has excessive exact repetition: '+JSON.stringify(out));
    if(persona===0)ok(!out.slice(-30).some(v=>/뭐냐|개많|씨\b/.test(v)),'stress polite style leak user '+u);
  }

  console.log('MOA_REAL_USER_SIMULATION_OK',JSON.stringify({questionUnique:new Set(q.map(norm)).size,mixedUnique:new Set(mixed.map(norm)).size,profanityUnique:new Set(prof.map(norm)).size,stressUsers:32,stressTurns:total}));
})().catch(e=>{console.error(e);process.exit(1)});
