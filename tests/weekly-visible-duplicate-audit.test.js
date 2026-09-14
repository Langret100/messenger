const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/tasks/friday-grade6-mission.js','utf8');
function Fixed(ms){const R=Date;return class extends R{constructor(...a){super(...(a.length?a:[ms]))}static now(){return ms}}}
function load(ms,user){const s={Date:Fixed(ms),URLSearchParams,fetch:async()=>({ok:true,json:async()=>({ok:true})}),console,setInterval,clearInterval,setTimeout,clearTimeout,MiniTalk:{Tasks:{},Store:{get:k=>k==='user'?{user_id:user}:null},Realtime:{},UI:{},Economy:{}},MiniTalkConfig:{sheetUrl:''}};vm.createContext(s);vm.runInContext(src,s);return s.MiniTalk.Tasks.FridayGrade6Mission}
const start=new Date('2026-08-21T12:00:00+09:00').getTime();
for(let w=0;w<52;w++)for(let u=0;u<30;u++){
  const qs=load(start+w*7*864e5,'audit-'+u).makeQuestions();
  if(qs.length!==20)throw new Error(`weekly count ${w}/${u}: ${qs.length}`);
  const texts=qs.map(q=>String(q.text||'').replace(/\s+/g,' ').trim());
  if(new Set(texts).size!==20)throw new Error(`visible duplicate ${w}/${u}`);
  if(qs.some(q=>/박물관에서 .*준비 운동|도서관에서 .*준비 운동|미술실에서 .*준비 운동/.test(q.text)))throw new Error(`semantic mismatch ${w}/${u}`);
}
console.log('WEEKLY_VISIBLE_DUPLICATE_AUDIT_OK');
