const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/ai/moa-communication-engine.js'),'utf8');
let store={};
const fakeMath=Object.create(Math); fakeMath.random=()=>0.1;
const user={user_id:'repair-loop-test',nickname:'테스트',isGuest:false};
const ctx={console,Date,Math:fakeMath,setTimeout:(fn)=>1,clearTimeout:()=>{},globalThis:null,MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in store?store[k]:d,set:(k,v)=>{store[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete store[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:1,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({})}}};
ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
function ok(v,m){if(!v)throw new Error(m)}
function seed(rows){E.clearContext();store['moa.v91.context.repair-loop-test']=rows.map((x,i)=>({ts:100+i,...x}));}
(async()=>{
  E.clearContext();
  let r=await E.reply('그러니까');
  ok(/그치|맞아|그러니까/.test(r.reply),`agreement became invented premise: ${r.reply}`);
  ok(!/같이 보면|앞에서 말한 흐름|기준으로/.test(r.reply),`agreement meta drift: ${r.reply}`);

  seed([
    {role:'user',text:'그러니까',intent:'statement',affect:'neutral'},
    {role:'assistant',text:'지금까지 나온 얘기 기준으로는 일단 그렇게 봐도 돼. 더 필요한 게 생기면 그때 같이 보면 되고.',source:'local',strategy:'direct'}
  ]);
  r=await E.reply('뭘 같이 보는데');
  ok(/같이 볼 게|같이 보자|없는 맥락|표현은 취소/.test(r.reply),`literal phrase challenge not repaired: ${r.reply}`);
  ok(!/한마디만 더|대상만|흐름.*다시/.test(r.reply),`challenge fell into generic loop: ${r.reply}`);

  r=await E.reply('아니');
  ok(/지적한 건|같이 본다/.test(r.reply),`bare no did not recover failed turn: ${r.reply}`);
  ok(!/앞말 기준|앞에서 한 말|흐름 다시 맞출게|다시 볼게/.test(r.reply),`bare no repeated meta apology: ${r.reply}`);

  E.clearContext(); await E.reply('오늘 학교에서 청소했어'); r=await E.reply('아니');
  ok(r.reply && !/한마디만 더/.test(r.reply),`ordinary correction broke: ${r.reply}`);
  console.log('MOA_CONVERSATIONAL_REPAIR_LOOP_OK');
})().catch(e=>{console.error(e);process.exit(1)});
