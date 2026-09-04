const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('moa-communication-engine.js?v='),'engine cache bust v9 missing');
const store={user:{user_id:'u1'}},persist=new Map();
const ctx={console,MiniTalk:{AI:{},Store:{get:k=>store[k]},Persistence:{get:(k,d)=>persist.has(k)?persist.get(k):d,set:(k,v)=>persist.set(k,v),remove:k=>persist.delete(k)},AuthApi:{}}};
vm.createContext(ctx);vm.runInContext(src,ctx);
const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
  for(const input of ['뭘','아니 뭘','아오','등신']){
    const r=await E.reply(input); const a=String(r.reply||'');
    ok(!/(뭘|아니 뭘|아오|등신)\s*(?:쪽\s*)?얘기(?:구나|네|였구나)/.test(a),`short utterance mirrored as topic: ${input} => ${a}`);
    ok(!/무슨 (?:얘기|말)인지 보고 있어|흐름은 따라가고 있어/.test(a),`meaningless tracking fallback: ${input} => ${a}`);
  }
  const a=await E.reply('뭘');ok(/말|정확|부분|붙여/.test(String(a.reply||'')),'뭘 should clarify rather than invent topic');
  const b=await E.reply('등신');ok(/등신|놀리|말 너무|말 세|너무하/.test(String(b.reply||'')),'bare insult should be treated as the insult itself, not automatic reply-failure repair');ok(!/방금 답|다시 제대로|헛다리/.test(String(b.reply||'')),'bare insult should not auto-apologize for prior answer');
  console.log('MOA_SHORT_UTTERANCE_REPAIR_OK');
})().catch(e=>{console.error(e);process.exit(1)});
