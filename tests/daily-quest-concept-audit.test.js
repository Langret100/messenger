const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const ctx={console,Event,EventTarget,CustomEvent:CE,document:{},window:null,localStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}};ctx.window=ctx;vm.createContext(ctx);
for(const name of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js','js/tasks/daily-quest-clock.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),ctx);
let koreanCode=fs.readFileSync(path.join(root,'js/tasks/daily-korean-quest.js'),'utf8');
koreanCode=koreanCode.replace('return { render, generate, loadProgress, dateKey, missions:', 'return { auditBank:missionBank, render, generate, loadProgress, dateKey, missions:');
vm.runInContext(koreanCode,ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js/tasks/daily-math-quest.js'),'utf8'),ctx);
const kor=ctx.MiniTalk.Tasks.DailyKoreanQuest,math=ctx.MiniTalk.Tasks.DailyMathQuest;
const date=i=>new Date(Date.UTC(2026,9,12+i)).toISOString().slice(0,10);
const norm=x=>String(x).normalize('NFC').replace(/\s+/g,' ').trim();
for(const mission of kor.missions()){
  const rows=kor.auditBank(mission.id);
  if(rows.length<80)throw Error(`${mission.id}: insufficient base questions: ${rows.length}`);
  for(const [q,answer,choices] of rows){
    if(!q||!answer||choices.length!==4||new Set(choices.map(norm)).size!==4||choices.filter(c=>norm(c)===norm(answer)).length!==1){
      throw Error(`${mission.id}: invalid or visually ambiguous options for ${q} / ${answer}: ${choices.join(' / ')}`);
    }
  }
}
const failures=[];
for(let user=0;user<30;user++){
  ctx.MiniTalk.Store.set('user',{user_id:`diversity-audit-${user}`});
  for(const [subject,quest] of [['korean',kor],['math',math]])for(const mission of quest.missions()){
    const seen=new Set();
    for(let day=0;day<7;day++){
      let chosen=null;
      for(let variant=0;variant<512;variant++){
        const items=quest.generate(mission.id,variant,date(day));
        const keys=items.map(item=>subject==='math'?(item.familyKey||item.factKey||item.question):(['spelling','spacing','expression'].includes(mission.id)?`${item.answer}`:`${item.question}|${item.answer}`));
        if(new Set(keys).size===5&&keys.every(key=>!seen.has(key))){chosen=keys;break}
      }
      if(!chosen){failures.push(`${subject}/${mission.id} user=${user} day=${day}`);break}
      for(const key of chosen)seen.add(key);
    }
  }
}
if(failures.length)throw Error(`Weekly concept reuse/no choices: ${failures.join(', ')}`);
ctx.MiniTalk.Store.set('user',{user_id:'math-facts-audit'});
for(const id of ['multiplication','division']){
  const facts=new Map();for(let week=0;week<40;week++)for(let variant=0;variant<10;variant++)for(const item of math.generate(id,variant,date(week*7)))facts.set(item.familyKey,item);
  if(facts.size!==(id==='multiplication'?44:72))throw Error(`${id}: expected unique facts, got ${facts.size}`);
  for(const item of facts.values()){
    const nums=(item.question.match(/\d+/g)||[]).map(Number);
    const actual=Number(item.answer);
    let ok=false;
    if(id==='multiplication')ok=item.factKey.startsWith('mul:missing:')?nums[0]*actual===nums[1]:nums[0]*nums[1]===actual;
    else ok=item.factKey.startsWith('div:divisor:')?nums[0]/actual===nums[1]:nums[0]/nums[1]===actual;
    if(!ok)throw Error(`${id}: wrong calculated answer for ${item.question}: ${item.answer}`);
  }
}
console.log('DAILY_QUEST_CONCEPT_AUDIT_OK: all raw Korean choices, 30 users x 7 days, 44 multiplication and 72 division facts');
