const fs=require('fs'),vm=require('vm'),assert=require('assert');
const engine=fs.readFileSync(process.env.ENGINE_UNDER_TEST||'js/ai/moa-communication-engine.js','utf8');
const storage={},cache={},calls=[];let payload,offline=false,user='learning-refresh-user';
function build(){let seed=3;const math=Object.create(Math);math.random=()=>((seed=seed*1664525+1013904223>>>0)/4294967296);const ctx={console,Date,Math:math,setTimeout:()=>1,clearTimeout(){},MiniTalk:{AI:{},Store:{get:()=>({user_id:user})},Persistence:{get:(k,d)=>k in storage?structuredClone(storage[k]):d,set:(k,v)=>storage[k]=structuredClone(v),remove:k=>delete storage[k]},DataCache:{get:async(t,k,d)=>`${t}|${k}` in cache?structuredClone(cache[`${t}|${k}`]):d,put:async(t,k,v)=>cache[`${t}|${k}`]=structuredClone(v)},AuthApi:{moaSync:async(_u,known,core)=>{calls.push({known,core});if(offline)throw Error('test offline');return structuredClone(payload)},moaCommit:async()=>({ok:true}),moaSearch:async()=>({reply:'SEARCH',source:'search'})}}};vm.createContext(ctx);vm.runInContext(engine,ctx);return ctx.MiniTalk.AI.MoaCommunicationEngine;}
const pair=(id,trigger,reply,strategy='ack')=>({id,trigger,reply,strategy,humanChat:true,confidence:1,tier:'confirmed',evidenceCount:12});
(async()=>{
 payload={ok:true,version:100,coreVersion:1,patterns:[pair('old','치킨 먹었어','치킨 얘기면 난 바삭한 쪽에 한 표 ㅋㅋ')]};let e=build();await e.sync(true);
 payload={ok:true,version:101,coreVersion:1,incremental:true,patternDelta:[pair('new-tired','피곤해','오늘은 에너지 충전 타임이네. 잠깐 쉬엄쉬엄 가자.','empathy'),pair('new-thanks','고마워','그렇게 말해주니 나도 고맙지 ㅋㅋ'),pair('new-bored','심심해','심심한 날엔 엉뚱한 상상 하나가 꽤 재밌지 ㅋㅋ')]};
 await e.sync(true);assert.strictEqual(calls.at(-1).known,100,'incremental sync lost its version');
 for(const row of payload.patternDelta){e.clearContext();const r=await e.reply(row.trigger);assert(r.source==='learned-human'&&r.candidateId===row.id,`new exact learning masked: ${row.trigger} => ${r.source}: ${r.reply}`);assert.strictEqual(r.reply,row.reply,'final rewriting discarded the learned answer');}
 assert(cache['moa-learning-patterns|__public__'].some(row=>row.id==='old'),'delta erased old learning');
 e=build();e.clearContext();let r=await e.reply('피곤해');assert(r.source==='learned-human'&&r.candidateId==='new-tired','restarted engine failed to use cached additional learning');assert.strictEqual(r.reply,payload.patternDelta[0].reply);
 // Search, arithmetic and incompatible negative inputs remain separate paths.
 e.clearContext();r=await e.reply('12*8은?');assert(r.source==='local-utility'&&/^96/.test(r.reply));
 e.clearContext();r=await e.reply('피곤하지 않아');assert(r.candidateId!=='new-tired','negative input reused positive/neutral trigger');
 e.clearContext();r=await e.reply('배고파');assert(!['new-tired','new-thanks','new-bored'].includes(r.candidateId),'unrelated learning displaced everyday expression');
 console.log('MOA_LEARNING_LIVE_REFRESH_REGRESSION_OK: delta -> final output -> restart cache; old patterns and utility guards retained');
})().catch(err=>{console.error(err);process.exitCode=1});
