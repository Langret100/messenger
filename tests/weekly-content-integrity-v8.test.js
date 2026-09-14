const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'js/tasks/friday-grade6-mission.js'),'utf8');
function fixedDateClass(iso){const RealDate=Date,fixed=new RealDate(iso).getTime();return class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}}
function load(iso,user='audit-user'){const sandbox={Date:fixedDateClass(iso),URLSearchParams,fetch:async()=>({ok:true,json:async()=>({ok:true})}),console,setInterval,clearInterval,setTimeout,clearTimeout,MiniTalk:{Tasks:{},Store:{get:k=>k==='user'?{user_id:user}:null},Realtime:{},UI:{},Economy:{}},MiniTalkConfig:{sheetUrl:''}};vm.createContext(sandbox);vm.runInContext(src,sandbox);return sandbox.MiniTalk.Tasks.FridayGrade6Mission}
if(!src.includes('QUESTION_SET_VERSION="v8"'))throw new Error('weekly v8 not active');
if(!src.includes('version==="v7"')||!src.includes('검수된 고정 문제은행만 순환'))throw new Error('v7 compatibility / v8 audited bank split missing');
for(const day of ['2026-08-28','2026-09-11','2026-09-25','2026-10-09','2026-10-23','2026-11-06']){
 const qs=load(day+'T12:00:00').makeQuestions();
 if(qs.length!==20||new Set(qs.map(q=>q.text+'|'+q.answer)).size!==20)throw new Error('duplicate Korean weekly question: '+day);
 if(qs.some(q=>/박물관에서 .*준비 운동|도서관에서 .*준비 운동|미술실에서 .*준비 운동/.test(q.text)))throw new Error('semantic place/action mismatch: '+day);
}
const math=load('2026-08-21T12:00:00').makeQuestions();
const normalize=t=>t.replace(/\d+(?:\.\d+)?/g,'#').replace(/[민서지우서연도윤하린민준수아현우채원예준지민유나]{2,3}/g,'이름');
if(new Set(math.map(q=>q.category+'|'+normalize(q.text))).size!==20)throw new Error('math weekly has same-template duplicates');
console.log('WEEKLY_CONTENT_INTEGRITY_V8_OK');
