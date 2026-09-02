const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const memory=new Map();
const ctx={console,EventTarget,Event,CustomEvent:CE,document:{},window:null,localStorage:{getItem:key=>memory.has(key)?memory.get(key):null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key)}};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js','js/tasks/daily-quest-clock.js','js/tasks/daily-korean-quest.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Store.set('user',{user_id:'korean-test',nickname:'테스트'});
const quest=ctx.MiniTalk.Tasks.DailyKoreanQuest;
if(quest.dateKey(new Date(2026,7,11,8,59))!=='2026-08-10')throw new Error('Korean quest must keep the previous day before 9 AM');
if(quest.dateKey(new Date(2026,7,11,9,0))!=='2026-08-11')throw new Error('Korean quest must reset at 9 AM');
const missions=quest.missions();
if(missions.map(item=>item.id).join(',')!=='spelling,expression,spacing,punctuation,conjunction')throw new Error('Korean mission types are incomplete');
for(const mission of missions){
  const first=quest.generate(mission.id),second=quest.generate(mission.id);
  if(first.length!==5)throw new Error(`${mission.id} must have five questions`);
  if(JSON.stringify(first)!==JSON.stringify(second))throw new Error(`${mission.id} questions must stay stable during the day`);
  if(new Set(first.map(item=>`${item.question}|${item.answer}`)).size!==5)throw new Error(`${mission.id} repeated a question inside one mission`);
  const answerPositions=first.map(item=>item.choices.indexOf(item.answer));
  if(new Set(answerPositions.slice(0,4)).size!==4)throw new Error(`${mission.id} first four correct-answer positions must cover all four slots`);
  if(answerPositions.some((position,index)=>index>0&&position===answerPositions[index-1]))throw new Error(`${mission.id} repeated the correct-answer position consecutively`);
  for(const item of first){
    if(!item.instruction||!item.question||!item.answer||item.choices.length!==4)throw new Error(`${mission.id} produced an incomplete question`);
    if(item.question.startsWith('빈칸에 알맞은 말은?'))throw new Error(`${mission.id} did not separate the instruction from the question`);
    if(new Set(item.choices).size!==4)throw new Error(`${mission.id} choices must be unique`);
    if(!item.choices.includes(item.answer))throw new Error(`${mission.id} choices omitted the correct answer`);
  }
}
const signatures=new Set();
for(let userIndex=0;userIndex<80;userIndex+=1){
  ctx.MiniTalk.Store.set('user',{user_id:`korean-random-${userIndex}`,nickname:'테스트'});
  for(const mission of missions){
    const items=quest.generate(mission.id);
    const positions=items.map(item=>item.choices.indexOf(item.answer));
    if(new Set(positions.slice(0,4)).size!==4||positions.some((value,index)=>index&&value===positions[index-1]))throw new Error(`${mission.id} Korean answer-position stress failure`);
  }
  signatures.add(JSON.stringify(quest.generate('spelling').map(item=>item.question)));
}
if(signatures.size<30)throw new Error(`Korean random variety too low: ${signatures.size}/80`);
ctx.MiniTalk.Store.set('user',{user_id:'korean-test',nickname:'테스트'});

for(const mission of missions){
  const base=quest.generate(mission.id,0);
  for(let index=0;index<5;index+=1){
    const baseKey=`${base[index].instruction}|${base[index].question}|${base[index].answer}`,basePos=base[index].choices.indexOf(base[index].answer);
    let found=false;
    for(let variant=1;variant<65;variant+=1){
      const item=quest.generate(mission.id,variant)[index],pos=item.choices.indexOf(item.answer);
      if(`${item.instruction}|${item.question}|${item.answer}`!==baseKey&&pos!==basePos){found=true;break;}
    }
    if(!found)throw new Error(`${mission.id} cannot replace a wrong answer with a new problem and new answer position`);
  }
}

const initial=quest.loadProgress();
if(Object.values(initial.correct).some(value=>value!==0))throw new Error('new Korean progress must start at zero');
ctx.MiniTalk.Persistence.set('tasks.dailyKoreanQuest',{date:quest.dateKey(),userId:'korean-test',correct:{spelling:4},completed:{spelling:false}});
const reopenedKorean=quest.loadProgress();
if(reopenedKorean.correct.spelling!==0||reopenedKorean.completed.spelling)throw new Error('incomplete Korean mission must reopen at 0/5');
ctx.MiniTalk.Persistence.set('tasks.dailyKoreanQuest',{date:'2000-01-01',userId:'korean-test',correct:{spelling:4},completed:{spelling:true}});
const resetPartial=quest.loadProgress();
if(resetPartial.correct.spelling!==0||resetPartial.completed.spelling)throw new Error('partial Korean progress must reset in the next 9 AM cycle');
console.log('DAILY_KOREAN_QUEST_OK',missions.length,'missions',missions.length*5,'questions');
