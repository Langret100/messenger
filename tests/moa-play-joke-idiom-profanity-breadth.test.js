const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function build(seed=19){
  const data={},user={user_id:'breadth-user',isGuest:false};let s=seed;const fakeMath=Object.create(Math);fakeMath.random=()=>((s=s*1664525+1013904223>>>0)/4294967296);
  const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:901,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>({reply:`SEARCH:${x.query}`,source:'search'})}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return ctx.MiniTalk.AI.MoaCommunicationEngine;
}
(async()=>{
  let E=build();
  let r=await E.reply('나랑 끝말잇기 해줘?');
  ok(r.source==='local-play'&&/시작하는 말/.test(r.reply),'word-chain request swallowed: '+r.source+' '+r.reply);
  const m=r.reply.match(/'([^']+)'로 시작/);ok(m,'word-chain did not expose expected syllable: '+r.reply);
  const expected=m[1],word={과:'과자',차:'차표',산:'산책',거:'거울',악:'악기'}[expected]||expected+'자';
  r=await E.reply(word);ok(r.source==='local-play','word-chain next turn lost state: '+r.source+' '+r.reply);
  r=await E.reply('그만할래');ok(r.source==='local-play'&&/(끝|종료)/.test(r.reply),'word-chain stop failed: '+r.reply);

  for(const q of ['농담 하나 해줘','아재개그 해봐','웃긴말 해줘']){E=build(21);r=await E.reply(q);ok(r.source==='local-play'&&r.reply.length>8,'joke request swallowed: '+q+' => '+r.source+' '+r.reply);}

  E=build();r=await E.reply('전화위복 뜻이 뭐야?');ok(r.source==='local-knowledge'&&/나쁜.*좋은|좋은 결과/.test(r.reply),'idiom meaning failed: '+r.source+' '+r.reply);
  r=await E.reply('사자성어 하나 알려줘');ok(r.source==='local-knowledge'&&r.reply.length>12,'idiom recommendation failed: '+r.source+' '+r.reply);

  E=build();r=await E.reply('게임 렉 존나 걸려');ok(r.source==='local-style'&&/(짜증|빡|열받|상황)/.test(r.reply),'situational profanity not contextualized: '+r.source+' '+r.reply);
  E=build();r=await E.reply('친구가 약속 또 깨서 시발 짜증나');ok(r.source==='local-style'&&/(친구|걔|사람|화|짜증|열받)/.test(r.reply),'third-person profanity not contextualized: '+r.source+' '+r.reply);

  // Dedicated play/idiom routes must not change utility priority.
  E=build();await E.reply('끝말잇기 하자');r=await E.reply('12*8은?');ok(r.source==='local-utility'&&/^96/.test(r.reply),'calculator blocked by active play state: '+r.source+' '+r.reply);
  ok(!src.includes('피카츄')&&!src.includes('이순신'),'removed name-specific hardcoding reappeared');
  console.log('MOA_PLAY_JOKE_IDIOM_PROFANITY_BREADTH_OK');
})().catch(e=>{console.error(e);process.exit(1)});
