const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
let iso='2026-10-05T12:00:00',user='week-isolation';
class FixedDate extends Date{constructor(...a){super(...(a.length?a:[iso]))}static now(){return new Date(iso).getTime()}}
function load(file){
 const memory=new Map(),ctx={console,Date:FixedDate,setTimeout,clearTimeout,setInterval,clearInterval,MiniTalk:{Tasks:{},Store:{get:()=>({user_id:user})},Persistence:{get:(k,d)=>memory.get(k)||d,set:(k,v)=>memory.set(k,v)},Realtime:{},UI:{},Economy:{}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'js/tasks/daily-quest-clock.js'),'utf8'),ctx);
 let source=fs.readFileSync(path.join(root,'js/tasks',file),'utf8');source=source.replace('  return { render,','  return { loadDailySeen, saveDailySeen, firstFreshVariant, nextVariant, visibleProblemKey, render,');
 vm.runInContext(source,ctx);return {q:ctx.MiniTalk.Tasks[file.includes('math')?'DailyMathQuest':'DailyKoreanQuest'],memory,clock:ctx.MiniTalk.Tasks.DailyQuestClock};
}
for(const file of ['daily-math-quest.js','daily-korean-quest.js']){
 const {q,clock}=load(file);
 for(const mission of q.missions()){
  const weekUsed=new Set();
  for(let day=5;day<=11;day++){
   iso=`2026-10-${String(day).padStart(2,'0')}T12:00:00`;const dayUsed=new Set();
   // Every reachable retry variant must remain in that day's disjoint bank.
   for(let variant=0;variant<512;variant++)for(const item of q.generate(mission.id,variant)){
    const key=q.visibleProblemKey(item);assert(!weekUsed.has(key),`${file}/${mission.id}: another day's retry leaked`);dayUsed.add(key);
   }
   assert(dayUsed.size>=5);for(const key of dayUsed)weekUsed.add(key);
   assert.equal(q.firstFreshVariant(mission.id,dayUsed),-1,'exhaustion cannot reuse an old question');
   const current=q.generate(mission.id)[0];assert.equal(q.nextVariant(mission.id,0,current,0,dayUsed),-1);
  }
 }
 iso='2026-10-05T12:00:00';const seen=q.loadDailySeen();seen.recent=Array.from({length:300},(_,i)=>`shown-${i}`);seen.missions.addition=['old'];q.saveDailySeen(seen);
 iso='2026-10-06T12:00:00';assert.equal(q.loadDailySeen().recent.length,300,'next day must preserve all weekly records');
 iso='2026-10-11T08:59:00';assert.equal(q.loadDailySeen().recent.length,300);
 iso='2026-10-12T08:59:00';assert.equal(q.loadDailySeen().recent.length,300,'Monday before 9 remains previous quest week');
 iso='2026-10-12T09:00:00';assert.equal(q.loadDailySeen().recent.length,0);
 user='other';assert.equal(q.loadDailySeen().recent.length,0);user='week-isolation';
 assert.equal(clock.weekKey('2026-10-11'),'2026-10-05');
}
console.log('QUEST_WEEKLY_RETRY_ISOLATION_OK');
