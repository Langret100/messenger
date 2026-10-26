const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('js/ai/moa-communication-engine.js','utf8').replace('return {reply,warmup,','return {expressionBankReply,openQuestionAnswerReply,composeConnectionGreeting,composeInitiative,reply,warmup,');
function build(rows=[],profile={}){const data={'moa.v91.context.natural-user':rows,'moa.v91.profile.natural-user':profile};const ctx={console,Date,Math,setTimeout:()=>1,clearTimeout(){},MiniTalk:{AI:{},Store:{get:()=>({user_id:'natural-user'})},Persistence:{get:(k,d)=>data[k]??d,set:(k,v)=>data[k]=v,remove:k=>delete data[k]},AuthApi:{moaSync:async()=>({ok:true,version:1,patterns:[],policy:{}}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({reply:'search response',source:'search'})}}};vm.createContext(ctx);vm.runInContext(source,ctx);return ctx.MiniTalk.AI.MoaCommunicationEngine;}
(async()=>{
 const rows=[{role:'assistant',text:'오늘 바빴어?',question:true},{role:'user',text:'응'},{role:'assistant',text:'무슨 일 있었어?',question:true},{role:'user',text:'피곤해'}];
 let e=build(rows);let answer=e.expressionBankReply({text:'피곤해'},'forbidden');assert(!/[?？]/.test(answer),'two questions should be followed by a statement');
 e=build([{role:'user',text:'고마워'}]);assert(!/[?？]/.test(e.expressionBankReply({text:'고마워'},'forbidden')),'thanks need not start another interview');
 e=build([{role:'assistant',text:'어디 가고 싶어?',question:true}]);let result=await e.reply('몰라');assert(!/[?？]/.test(result.reply),'undecided answer should not prompt another clarification: '+result.reply);
 e=build([{role:'assistant',text:'몇 시에 만나기로 했어?',question:true}]);result=await e.reply('3시');assert(/3시/.test(result.reply)&&!/(여유|촉박)/.test(result.reply),'time answer must not invent schedule slack');
 e=build();for(let i=0;i<12;i++){
  const random=()=>i/12,candidate={type:'interest',frame:'interest-greeting',topic:'축구'};
  const proactive=e.composeInitiative(candidate,Date.now(),{},random).text;
  assert((proactive.match(/[?？]/g)||[]).length<=1,'proactive doubles its questions: '+proactive);
  const greeting=e.composeConnectionGreeting(candidate,Date.now(),{},random).text;
  assert(/축구/.test(greeting)&&/(재밌|최근|그 얘기)/.test(greeting),'interest greeting loses the topic: '+greeting);
  assert((greeting.match(/[?？]/g)||[]).length<=1,'greeting doubles its questions');
 }
 e=build();await e.reply('내일 시험이야');
 const returned=Date.now()+2*86400000;
 const followup=e.maybeConnectionGreeting({now:returned,force:true});
 assert(followup&&followup.type==='open-loop'&&/시험/.test(followup.reply),'return greeting should follow up the dated conversation first');
 e.setInitiativeSettings({enabled:false});assert(e.maybeConnectionGreeting({now:returned+86400000,force:true})===null,'follow-up must respect opt-out');
 console.log('MOA_NATURAL_PACING_REGRESSION_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
