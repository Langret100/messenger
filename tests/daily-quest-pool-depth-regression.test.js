const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const memory=new Map();
const ctx={console,EventTarget,Event,CustomEvent:CE,document:{},window:null,localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js','js/tasks/daily-quest-clock.js','js/tasks/daily-korean-quest.js','js/tasks/daily-math-quest.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Store.set('user',{user_id:'pool-depth-user'});
const kor=ctx.MiniTalk.Tasks.DailyKoreanQuest,math=ctx.MiniTalk.Tasks.DailyMathQuest;
const date=i=>new Date(Date.UTC(2026,8,1+i)).toISOString().slice(0,10);
const visual=v=>String(v).normalize('NFC').replace(/\s+/g,' ').trim();
for(const mission of kor.missions()){
  const unique=new Set();let previous=null,foundGrandma=false;
  for(let day=0;day<40;day++){
    const items=kor.generate(mission.id,0,date(day));
    const keys=items.map(item=>`${item.question}|${item.answer}`);
    if(previous&&keys.some(key=>previous.has(key)))throw new Error(`${mission.id} repeated a Korean problem on consecutive days`);
    previous=new Set(keys);
    for(const item of items){
      unique.add(`${item.instruction}|${item.question}|${item.answer}`);
      const rendered=item.choices.map(visual);
      if(new Set(rendered).size!==4)throw new Error(`${mission.id} has visually duplicate choices: ${item.question}`);
      if(rendered.filter(x=>x===visual(item.answer)).length!==1)throw new Error(`${mission.id} must show exactly one visually matching correct answer`);
      if(item.answer==='할머니 댁'){foundGrandma=true;if(rendered.filter(x=>x==='할머니 댁').length!==1)throw new Error('할머니 댁 appears more than once visually');}
    }
  }
  if(unique.size<30)throw new Error(`${mission.id} Korean pool depth too low: ${unique.size}`);
  if(mission.id==='spacing'&&!foundGrandma){for(let day=40;day<160&&!foundGrandma;day++)for(const item of kor.generate(mission.id,0,date(day)))if(item.answer==='할머니 댁'){const rendered=item.choices.map(visual);foundGrandma=rendered.filter(x=>x==='할머니 댁').length===1}}
  if(mission.id==='spacing'&&!foundGrandma)throw new Error('spacing pool never exposed 할머니 댁 regression case');
}
for(const missionId of ['multiplication','division']){
  // Similar math wordings and inverse questions must not disguise the same fact.
  // The pool is intentionally finite, so the guarantee is scoped to the current week.
  for(let week=0;week<2;week++){
    const seen=new Set();
    for(let day=week*7;day<week*7+7;day++)for(const item of math.generate(missionId,0,date(day))){
      const key=item.familyKey||item.factKey||`${item.question}|${item.answer}`;
      if(seen.has(key))throw new Error(`${missionId} repeated same math fact within week: ${key}`);
      seen.add(key);
    }
    if(seen.size!==35)throw new Error(`${missionId} expected 35 distinct facts in one week, got ${seen.size}`);
  }
}
console.log('DAILY_QUEST_POOL_DEPTH_REGRESSION_OK');
