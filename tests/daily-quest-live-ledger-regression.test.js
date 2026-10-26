const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const sourceRoot=process.env.QUEST_SOURCE_ROOT||process.cwd();
function node(tag,attrs={},children=[]){const n={tag,...attrs,textContent:attrs.text||'',className:attrs.class||'',children:[],disabled:false,classList:{add(){}},append(...rows){this.children.push(...rows)},replaceChildren(...rows){this.children=rows},querySelector(){return null}};n.append(...children);return n;}
function all(selector,parent){const rows=[];for(const child of parent.children||[]){if((' '+child.className+' ').includes(' '+selector.slice(1)+' '))rows.push(child);rows.push(...all(selector,child))}return rows;}
function build(subject,memory){
  const ctx={console,Date,Math,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,MiniTalk:{Tasks:{QuestAccordion:{celebrate:(_body,done)=>done()}},Store:{get:k=>k==='user'?{user_id:'shared-ledger-user'}:null,set(){}},Persistence:{get:(k,d)=>memory.has(k)?structuredClone(memory.get(k)):d,set:(k,v)=>memory.set(k,structuredClone(v)),remove:k=>memory.delete(k)},Events:{emit(){}},UI:{Dom:{el:node,all},Shell:{modal:(_title,body)=>{ctx.body=body;ctx.closed=false},toast(){},closeModal(){ctx.closed=true}}}}};
  ctx.timers=[];ctx.setTimeout=fn=>{ctx.timers.push(fn);return ctx.timers.length};
  ctx.flush=()=>{const pending=ctx.timers.splice(0);for(const fn of pending)fn()};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(sourceRoot,'js/tasks/daily-quest-clock.js'),'utf8'),ctx);
  let source=fs.readFileSync(path.join(sourceRoot,`js/tasks/daily-${subject}-quest.js`),'utf8');
  source=source.replace('return { render, generate,','return { openMission, render, generate,').replace('const current = questions[index];','const current = questions[index];globalThis.displayed=current;');
  vm.runInContext(source,ctx);
  ctx.quest=ctx.MiniTalk.Tasks[subject==='math'?'DailyMathQuest':'DailyKoreanQuest'];return ctx;
}
(async()=>{
 for(const subject of ['math','korean']){
  const memory=new Map(),a=build(subject,memory),b=build(subject,memory);
  for(const mission of a.quest.missions()){
   memory.clear();const shown=new Set();
   const key=item=>item.familyKey||item.factKey||`${item.question}|${item.answer}`;
   function record(ctx){const k=key(ctx.displayed);assert(!shown.has(k),`${subject}/${mission.id}: repeated live question ${k}`);shown.add(k);}
   a.quest.openMission(mission.id);record(a);
   b.quest.openMission(mission.id);record(b);
   for(const ctx of [a,b]){
    const button=all('.quest-choice',ctx.body).find(n=>n.textContent===ctx.displayed.answer);
    assert(button,'correct choice absent');await button.onclick();if(!ctx.closed)record(ctx);
   }
   const ledger=memory.get(subject==='math'?'tasks.dailyMathQuestSeen':'tasks.dailyKoreanQuestSeen');
   assert(ledger.recent.length>=shown.size,'another session overwrote displayed-question history');
   // A normal single-screen attempt must still reach its stamp after five answers.
   memory.clear();a.quest.openMission(mission.id);const single=new Set();
   for(let index=0;index<5;index++){
    assert(!single.has(key(a.displayed)),`${subject}/${mission.id}: single-session duplicate`);single.add(key(a.displayed));
    const correct=all('.quest-choice',a.body).find(n=>n.textContent===a.displayed.answer);
    assert(correct);await correct.onclick();
   }
   const progressKey=subject==='math'?'tasks.dailyMathQuest':'tasks.dailyKoreanQuest';
   assert(memory.get(progressKey).completed[mission.id]===true,'five correct answers must retain mission completion');
   // Closing/reopening and the first wrong answer must each show a fresh question.
   memory.clear();a.timers=[];a.quest.openMission(mission.id);const first=key(a.displayed);
   a.quest.openMission(mission.id);assert.notStrictEqual(key(a.displayed),first,'reopening repeated first question');
   memory.clear();a.timers=[];a.quest.openMission(mission.id);const wrongFirst=key(a.displayed);
   let wrong=all('.quest-choice',a.body).find(n=>n.textContent!==a.displayed.answer);await wrong.onclick();a.flush();
   assert(!a.closed,'first wrong answer should replace the question');
   assert.notStrictEqual(key(a.displayed),wrongFirst,'wrong-answer replacement repeated question');
   wrong=all('.quest-choice',a.body).find(n=>n.textContent!==a.displayed.answer);await wrong.onclick();a.flush();
   assert(a.closed,'second wrong answer should close/reset mission');
   assert.strictEqual(memory.get(progressKey).correct[mission.id],0,'two-strike progress must reset');
  }
 }
 console.log('DAILY_QUEST_LIVE_LEDGER_REGRESSION_OK: all 10 missions; shared ledger, 5-answer completion, reopen, wrong replacement, two strikes');
})().catch(e=>{console.error(e);process.exitCode=1});
