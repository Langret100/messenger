const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');

class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const memory=new Map();
const document={};
const ctx={
  console,EventTarget,Event,CustomEvent:CE,document,window:null,
  localStorage:{
    getItem:key=>memory.has(key)?memory.get(key):null,
    setItem:(key,value)=>memory.set(key,String(value)),
    removeItem:key=>memory.delete(key)
  }
};
ctx.window=ctx;
vm.createContext(ctx);
for(const file of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js','js/tasks/daily-quest-clock.js','js/tasks/daily-math-quest.js']){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
}

ctx.MiniTalk.Store.set('user',{user_id:'math-test',nickname:'테스트'});
const quest=ctx.MiniTalk.Tasks.DailyMathQuest;
if(quest.dateKey(new Date(2026,7,11,8,59))!=='2026-08-10')throw new Error('math quest must keep the previous day before 9 AM');
if(quest.dateKey(new Date(2026,7,11,9,0))!=='2026-08-11')throw new Error('math quest must reset at 9 AM');
const missions=quest.missions();
if(missions.map(item=>item.id).join(',')!=='addition,subtraction,multiplication,division,fraction'){
  throw new Error('daily mission types are incomplete');
}

for(const mission of missions){
  const first=quest.generate(mission.id);
  const second=quest.generate(mission.id);
  if(first.length!==5)throw new Error(`${mission.id} must have five questions`);
  if(JSON.stringify(first)!==JSON.stringify(second))throw new Error(`${mission.id} questions must stay stable during the day`);
  for(const [index,item] of first.entries()){
    if(!item.question||!item.answer)throw new Error(`${mission.id} produced an incomplete question`);
    const choices=quest.choices(item,mission.id,index);
    if(choices.length!==4||new Set(choices).size!==4)throw new Error(`${mission.id} choices must be four unique values`);
    if(!choices.includes(item.answer))throw new Error(`${mission.id} choices omitted the correct answer`);
    if(mission.id==='addition'){
      const m=item.question.match(/(\d+) \+ (\d+)/);if(!m||Number(m[1])+Number(m[2])!==Number(item.answer))throw new Error('bad addition');
    }else if(mission.id==='subtraction'){
      const m=item.question.match(/(\d+) − (\d+)/);if(!m||Number(m[1])-Number(m[2])!==Number(item.answer)||Number(item.answer)<0)throw new Error('bad subtraction');
    }else if(mission.id==='multiplication'){
      const m=item.question.match(/(\d+) × (\d+)/);if(!m||Number(m[1])*Number(m[2])!==Number(item.answer))throw new Error('bad multiplication');
    }else if(mission.id==='division'){
      const m=item.question.match(/(\d+) ÷ (\d+)/);if(!m||Number(m[1])/Number(m[2])!==Number(item.answer))throw new Error('bad division');
    }else if(!/^\d+\/\d+$/.test(item.answer))throw new Error('bad fraction');
  }
}

const initial=quest.loadProgress();
if(Object.values(initial.correct).some(value=>value!==0))throw new Error('new daily progress must start at zero');
ctx.MiniTalk.Persistence.set('tasks.dailyMathQuest',{date:'2000-01-01',userId:'math-test',correct:{addition:3},completed:{addition:true}});
const resetPartial=quest.loadProgress();
if(resetPartial.correct.addition!==0||resetPartial.completed.addition)throw new Error('partial math progress must reset in the next 9 AM cycle');
console.log('DAILY_MATH_QUEST_OK',missions.length,'missions',missions.length*5,'questions');
