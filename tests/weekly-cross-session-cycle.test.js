const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/tasks/friday-grade6-mission.js','utf8');
function Fixed(ms){const R=Date;return class extends R{constructor(...a){super(...(a.length?a:[ms]))}static now(){return ms}}}
function load(ms,user){const s={Date:Fixed(ms),URLSearchParams,fetch:async()=>({ok:true,json:async()=>({ok:true})}),console,setInterval,clearInterval,setTimeout,clearTimeout,MiniTalk:{Tasks:{},Store:{get:k=>k==='user'?{user_id:user}:null},Realtime:{},UI:{},Economy:{}},MiniTalkConfig:{sheetUrl:''}};vm.createContext(s);vm.runInContext(src,s);return s.MiniTalk.Tasks.FridayGrade6Mission}
const start=new Date('2026-08-28T12:00:00+09:00').getTime();
for(let u=0;u<30;u++){
  const seen=new Set();
  for(let round=0;round<3;round++){
    const qs=load(start+round*14*864e5,'cycle-'+u).makeQuestions();
    for(const q of qs){if(seen.has(q.text))throw new Error(`Korean question repeated before unique pool was consumed: user ${u}, round ${round}`);seen.add(q.text)}
  }
}
console.log('WEEKLY_CROSS_SESSION_CYCLE_OK');
