const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'js/tasks/friday-grade6-mission.js'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(src.includes('ALT_ANCHOR_WEEK="2026-08-17"'),'alternating mission anchor missing');
ok(src.includes('missionSubject')&&src.includes('subject==="수학"')&&src.includes('slice(0,TOTAL)'),'single-subject 20-question generator missing');
ok(!src.includes('slice(0,10).forEach'),'old 10 Korean + 10 Math split still exists');
ok(src.includes('`${subject} 20문항 · 시험지형 · ${desktop?"큰 별도 창":"한 화면에 전체 문제"} · 다음 주 ${subject==="수학"?"국어":"수학"} · 80점 이상 시 🪙 +${REWARD_COIN}`'),'weekly worksheet subject UI copy missing');
const sandbox={Date,URLSearchParams,fetch:async()=>({ok:true,json:async()=>({ok:true})}),console,setInterval,clearInterval,setTimeout,clearTimeout,MiniTalk:{Tasks:{},Store:{get:k=>k==='user'?{user_id:'u1'}:null},Realtime:{},UI:{},Economy:{}},MiniTalkConfig:{sheetUrl:''}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const api=sandbox.MiniTalk.Tasks.FridayGrade6Mission;
ok(api.missionSubject(new Date('2026-08-20T12:00:00'))==='수학','anchor week must be Math');
ok(api.missionSubject(new Date('2026-08-27T12:00:00'))==='국어','next week must be Korean');
ok(api.missionSubject(new Date('2026-09-03T12:00:00'))==='수학','third week must return to Math');
// makeQuestions uses current Date, so verify source guarantees TOTAL=20 and each branch emits only one subject.
ok(src.includes('for(const cat of mathCats)for(let i=0;i<4;i++)cats.push(cat)')&&src.includes('rows.push(makeMathQuestion(cat,r))'),'Math week does not generate balanced 20 math rows');
ok(src.includes('shuffle(korBank,r).slice(0,TOTAL)')&&src.includes('rows.push(q("국어"'),'Korean week does not generate 20 Korean rows');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');ok(html.includes('friday-grade6-mission.js?v=65.0.12'),'Friday mission cache version stale');
console.log('FRIDAY_ALTERNATING_SUBJECT_OK');
