const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
function boot(){
  const data={},user={user_id:'screenshot-route',isGuest:false},searches=[];
  const ctx={console,Date,Math,setTimeout:(fn)=>{fn();return 1},clearTimeout:()=>{},globalThis:null,
    MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},Persistence:{get:(k,d)=>k in data?data[k]:d,set:(k,v)=>{data[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete data[k]},DataCache:{get:async()=>null,put:async()=>true,remove:async()=>true},AuthApi:{moaSync:async()=>({ok:true,version:941,coreVersion:14,patterns:[],policy:{},expressionWeights:{}}),moaCommit:async()=>({ok:true}),moaSearch:async x=>{searches.push(x.query);return {reply:`SEARCH:${x.query}`,source:'search',kind:'answer'}}}}};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);return {E:ctx.MiniTalk.AI.MoaCommunicationEngine,searches};
}
(async()=>{
  const {E,searches}=boot();
  let r=await E.reply('인터넷 속도 개선방법 뭐가 있을까');
  ok(r.source==='local-decision',`advice question swallowed by chit-chat: ${r.source}/${r.reply}`);
  ok(/공유기|와이파이|유선|5GHz|6GHz/.test(r.reply),`internet advice lacks actionable content: ${r.reply}`);
  ok(!/인터넷 얘기였구나|한마디만|듣고 있어/.test(r.reply),`generic acknowledgement leaked: ${r.reply}`);

  E.clearContext();r=await E.reply('피카츄 누구냐');
  ok(r.source==='local-knowledge'&&/포켓몬/.test(r.reply),`colloquial known-entity question failed: ${r.source}/${r.reply}`);
  E.clearContext();r=await E.reply('이순신이 누구냐');
  ok(r.source==='local-knowledge'&&/조선/.test(r.reply)&&/장군/.test(r.reply),`particle + 누구냐 failed: ${r.source}/${r.reply}`);

  E.clearContext();r=await E.reply('장보고가 누구냐');
  ok(r.source==='search',`unknown fact should use search: ${r.source}/${r.reply}`);
  ok(searches.at(-1)==='장보고',`search query not cleaned: ${JSON.stringify(searches)}`);

  // A previous failed/known entity must not contaminate a new explicit entity question.
  E.clearContext();await E.reply('피카츄 누구냐');r=await E.reply('장보고가 누구냐');
  ok(searches.at(-1)==='장보고',`previous entity contaminated new query: ${JSON.stringify(searches)}`);

  console.log('MOA_SCREENSHOT_QUESTION_ROUTING_REGRESSION_OK');
})().catch(e=>{console.error(e);process.exit(1)});
