const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
let uid='u0',seed=0x12345678; const store={};const fakeMath=Object.create(Math);fakeMath.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const sandbox={console,Date,Math:fakeMath,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},addEventListener:()=>{},navigator:{},MiniTalk:{AI:{},Store:{get:()=>({user_id:uid,isGuest:false})},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>store[k]=v,remove:k=>delete store[k]},AuthApi:{moaSync:async()=>({ok:true}),moaSearch:async()=>({}),moaCommit:async()=>({ok:true})}}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);const e=sandbox.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
 uid='case-lunch';let r=await e.reply('급식 뭐나올까');ok(/급식표|찍|촉|감|나올 것 같은/.test(r.reply),'casual lunch guess fell into generic fallback: '+r.reply);ok(e.analyze('급식 뭐나올까').act==='question','-까 casual question not recognized');ok(e.analyze('급식 뭐나올까').speechAct==='ask:question','generic question speech act wrong');
 uid='case-math';r=await e.reply('1+1은?');ok(/^2이야/.test(r.reply),'particle math question failed: '+r.reply);r=await e.reply('3*4는?');ok(/^12이야/.test(r.reply),'particle math topic marker failed: '+r.reply);
 uid='case-correction';await e.reply('뭐가 그냥 있어도 돼');r=await e.reply('그런 단어가 아니잖아');ok(/잘못|다시|아니었|수정/.test(r.reply),'wording correction not treated as correction: '+r.reply);
 // Surprise/asides are probabilistic but must stay context-related and never touch exact utilities.
 let aside=0,total=1000;const asideRx=/(학교 얘기는 하루만|학교는 별일 없는 날)/;
 for(let i=0;i<total;i++){uid='sp-'+i;r=await e.reply('학교 끝났어');if(asideRx.test(r.reply))aside++;}
 ok(aside>=70&&aside<=170,'spontaneous aside rate out of safe range: '+aside+'/'+total);
 for(let i=0;i<300;i++){uid='math-'+i;r=await e.reply('10+5는?');ok(/^15이야\.$/.test(r.reply),'spontaneous text contaminated utility answer: '+r.reply);}
 console.log('MOA_CASUAL_INTENT_SPONTANEITY_OK',JSON.stringify({aside,total,rate:aside/total}));
})().catch(e=>{console.error(e);process.exit(1)});
