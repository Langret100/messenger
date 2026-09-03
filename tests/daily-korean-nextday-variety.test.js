const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const memory=new Map();
const ctx={console,EventTarget,Event,CustomEvent:CE,document:{},window:null,localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js','js/tasks/daily-quest-clock.js','js/tasks/daily-korean-quest.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Store.set('user',{user_id:'nextday-variety-test'});
const quest=ctx.MiniTalk.Tasks.DailyKoreanQuest,days=['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-05','2026-09-06','2026-09-07'];
for(const mission of quest.missions()){
  let previous=null;
  for(const day of days){
    const current=quest.generate(mission.id,0,day),keys=current.map(item=>`${item.question}|${item.answer}`);
    if(keys.length!==5||new Set(keys).size!==5)throw new Error(`${mission.id} invalid daily set on ${day}`);
    if(previous){const overlap=keys.filter(key=>previous.has(key));if(overlap.length)throw new Error(`${mission.id} repeated next-day questions on ${day}: ${overlap.join(', ')}`)}
    previous=new Set(keys);
  }
}
const spelling=fs.readFileSync(path.join(root,'js/tasks/daily-korean-quest.js'),'utf8');
if(spelling.includes('"웬 일이야"'))throw new Error('ambiguous 웬일 distractor returned');
console.log('DAILY_KOREAN_NEXTDAY_VARIETY_OK');
