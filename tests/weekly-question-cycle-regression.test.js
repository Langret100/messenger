const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'js/tasks/friday-grade6-mission.js'),'utf8');
function fixedDateClass(iso){const RealDate=Date,fixed=new RealDate(iso).getTime();return class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}}
function load(iso,user='weekly-cycle-user'){const sandbox={Date:fixedDateClass(iso),URLSearchParams,fetch:async()=>({ok:true,json:async()=>({ok:true})}),console,setInterval,clearInterval,setTimeout,clearTimeout,MiniTalk:{Tasks:{},Store:{get:k=>k==='user'?{user_id:user}:null},Realtime:{},UI:{},Economy:{}},MiniTalkConfig:{sheetUrl:''}};vm.createContext(sandbox);vm.runInContext(src,sandbox);return sandbox.MiniTalk.Tasks.FridayGrade6Mission}
const koreanDates=['2026-08-28','2026-09-11','2026-09-25','2026-10-09','2026-10-23','2026-11-06'];
let previous=null;const setSignatures=new Set();
for(const day of koreanDates){
  const questions=load(`${day}T12:00:00`).makeQuestions();
  if(questions.length!==20||questions.some(q=>q.subject!=='국어'))throw new Error(`invalid Korean weekly set ${day}`);
  const keys=questions.map(q=>`${q.text}|${q.answer}|${q.choices.join('¦')}`);
  if(new Set(keys).size!==20)throw new Error(`duplicate actual Korean weekly problem inside ${day}`);
  if(previous){const overlap=keys.filter(key=>previous.has(key));if(overlap.length)throw new Error(`consecutive Korean weekly missions overlap on ${day}: ${overlap.length}`)}
  previous=new Set(keys);setSignatures.add(JSON.stringify(keys));
}
if(setSignatures.size!==koreanDates.length)throw new Error('weekly Korean question set repeated exactly');
if(!src.includes('QUESTION_SET_VERSION="v7"')||!src.includes('makeGeneratedKoreanQuestions'))throw new Error('weekly v7 generated/cycled bank missing');
console.log('WEEKLY_QUESTION_CYCLE_REGRESSION_OK');
