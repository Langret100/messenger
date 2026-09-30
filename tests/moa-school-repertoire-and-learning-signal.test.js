const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/ai/moa-communication-engine.js'),'utf8');
let store={};
const user={user_id:'school-repertoire-test',nickname:'테스트',isGuest:false};
const ctx={console,Date,Math,setTimeout:(fn)=>1,clearTimeout:()=>{},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>{store[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete store[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:1,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>({})}}};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
function ok(v,m){if(!v)throw new Error(m)}
(async()=>{
  const cases=[
    ['수학 너무 어려워',/수학|문제|개념|막힌/],
    ['과학 실험했는데 재밌었어',/과학|실험|결과|재밌/],
    ['영어 단어가 너무 안 외워져',/영어|단어|외울|듣기|문법/],
    ['교실이 오늘 너무 시끄러웠어',/교실|반|시끄|집중|정신/],
    ['자리 바꿨는데 별로야',/자리|위치|주변|교실/],
    ['오늘 청소 당번이라 귀찮아',/청소|당번|구역|귀찮/],
    ['청소시간에 대걸레 맡았어',/청소|구역|맡|대걸레/],
    ['친구들이랑 분리수거 청소했어',/친구|청소|같이|분리수거/]
  ];
  for(const [q,re] of cases){E.clearContext();const r=await E.reply(q);ok(re.test(r.reply),`${q} -> ${r.reply}`);ok(!/한마디만 더|뜻이 여러/.test(r.reply),`fallback: ${q} -> ${r.reply}`);}

  const signals=['그렇구나','그거 맞아','이해됐어','도움됐어','이제 알겠어','설명 잘했네','답 괜찮네'];
  for(const sig of signals){
    await E.flushCommit();
    E.clearContext();
    await E.reply('오늘 학교에서 발표했어');
    const before=E.debugSnapshot().queued;
    await E.reply(sig);
    const after=E.debugSnapshot().queued;
    ok(after>before,`positive learning signal not queued for ${sig}: ${before} -> ${after}`);
  }
  console.log('MOA_SCHOOL_REPERTOIRE_AND_LEARNING_SIGNAL_OK');
})().catch(e=>{console.error(e);process.exit(1)});
