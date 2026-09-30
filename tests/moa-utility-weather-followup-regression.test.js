const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const store={};const calls=[];
const sandbox={console,Date,Math,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:()=>({user_id:'utility-test',isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true}),moaSearch:async p=>{calls.push(p);return {reply:`SEARCH:${p.query}`,source:'search-test'}},moaCommit:async()=>({ok:true})}}};
vm.createContext(sandbox);vm.runInContext(engine,sandbox);const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
 let r=await e.reply('49+180'); ok(/^229(?:\.0+)?이야\.$/.test(r.reply),`math failed: ${r.reply}`); ok(r.source==='local-utility',`math source: ${r.source}`);
 r=await e.reply('(12+8)*3'); ok(/^60(?:\.0+)?이야\.$/.test(r.reply),`paren math failed: ${r.reply}`);
 e.clearContext(); calls.length=0;
 r=await e.reply('오늘 날씨'); ok(/날씨/.test(r.reply)||r.source.includes('search'),`weather first failed: ${r.reply}`);
 r=await e.reply('군산'); ok(calls.length>=1,'weather location followup did not search'); ok(calls[calls.length-1].query==='군산 오늘 날씨',`bad weather query: ${calls[calls.length-1].query}`); ok(r.reply==='SEARCH:군산 오늘 날씨',`bad weather reply: ${r.reply}`);
 console.log('MOA_UTILITY_WEATHER_FOLLOWUP_REGRESSION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
