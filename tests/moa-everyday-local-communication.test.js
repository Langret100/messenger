const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const html=fs.readFileSync('index.html','utf8');
ok(html.includes('js/ai/moa-communication-engine.js?v=40'),'MOA everyday engine cache bust missing');
ok(engine.includes('function dateTime(raw)'),'local date/time handler missing');

class FixedDate extends Date {
  constructor(...args){ super(...(args.length?args:[2026,7,21,14,47,0])); }
  static now(){ return new Date(2026,7,21,14,47,0).getTime(); }
}
const store={};
const sandbox={console,Date:FixedDate,Math,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'everyday',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true}),moaSearch:async()=>({}),moaCommit:async()=>({ok:true})}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);
(async()=>{
  const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
  const timeInputs=['지금 몇시야','지금 몇 시야?','몇시야','현재 몇 시야','몇 시지'];
  for(const input of timeInputs){
    const r=await e.reply(input);
    ok(/오후 2시 47분/.test(r.reply),`${input} time reply failed: ${r.reply}`);
    ok(!/무슨 말|조금 더 말|듣고 있어|얘기였구나/.test(r.reply),`${input} fell through to generic dialogue: ${r.reply}`);
  }
  for(const input of ['오늘 며칠이야','오늘 날짜가 뭐야','오늘 몇 월 며칠이야']){
    const r=await e.reply(input);ok(/2026년 8월 21일/.test(r.reply),`${input} date reply failed: ${r.reply}`);
  }
  for(const input of ['오늘 무슨 요일이야','무슨 요일이지','오늘 요일 뭐야']){
    const r=await e.reply(input);ok(/금요일/.test(r.reply),`${input} weekday reply failed: ${r.reply}`);
  }
  let r=await e.reply('안녕');ok(/안녕|반가|왔/.test(r.reply),'greeting regressed: '+r.reply);
  r=await e.reply('뭐해');ok(!/조금 더 말|무슨 말인지/.test(r.reply),'what-doing regressed: '+r.reply);
  console.log('MOA_EVERYDAY_LOCAL_COMMUNICATION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
