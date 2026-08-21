const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'js/tasks/friday-grade6-mission.js'),'utf8'),coin=fs.readFileSync(path.join(root,'docs/apps-script/coin.gs'),'utf8'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(src.includes('REWARD_COIN=5')&&coin.includes('delta = 5'),'weekly reward must be +5 on both client and server');
ok(src.includes('QUESTION_SET_VERSION="v5"')&&src.includes('questionSetVersion:setVersion'),'versioned weekly question set missing');
ok(src.includes('const korExtra=[')&&src.includes('korBank.concat(korExtra)'),'expanded Korean question bank missing');
ok(src.includes('variant:i')&&src.includes('makeMathQuestion(item.cat,r,item.variant)'),'guaranteed math template variety missing');
ok(src.includes('saved?.questionSetVersion||(Array.isArray(saved?.answers)&&saved.answers.length?"v4":QUESTION_SET_VERSION)'),'legacy draft compatibility missing');
ok(html.includes('friday-grade6-mission.js?v=65.0.19'),'weekly v96 cache bust missing');
ok(sw.includes('moaru-camera-play-popup-polish'),'weekly v96 service worker id missing');
function fixedDateClass(iso){const RealDate=Date,fixed=new RealDate(iso).getTime();return class FixedDate extends RealDate{constructor(...args){super(...(args.length?args:[fixed]))}static now(){return fixed}}}
function load(iso,user='u1'){const sandbox={Date:fixedDateClass(iso),URLSearchParams,fetch:async()=>({ok:true,json:async()=>({ok:true})}),console,setInterval,clearInterval,setTimeout,clearTimeout,MiniTalk:{Tasks:{},Store:{get:k=>k==='user'?{user_id:user}:null},Realtime:{},UI:{},Economy:{}},MiniTalkConfig:{sheetUrl:''}};vm.createContext(sandbox);vm.runInContext(src,sandbox);return sandbox.MiniTalk.Tasks.FridayGrade6Mission}
const math=load('2026-08-21T12:00:00').makeQuestions();
ok(math.length===20&&math.every(q=>q.subject==='수학'),'math week must produce 20 math questions');
const byCat={};for(const q of math){(byCat[q.category]??=[]).push(q);ok(q.choices.length===4&&new Set(q.choices).size===4,'math choices must be four unique values');ok(q.choices.includes(q.answer),'math answer must be present in choices')}
ok(Object.keys(byCat).length===5&&Object.values(byCat).every(v=>v.length===4),'math categories must remain balanced 4 each');
ok(Object.values(byCat).every(v=>new Set(v.map(q=>q.text.replace(/\d+(?:\.\d+)?/g,'#'))).size>=3),'each math category should use multiple question templates');
const korean=load('2026-08-28T12:00:00').makeQuestions();
ok(korean.length===20&&korean.every(q=>q.subject==='국어'),'Korean week must produce 20 Korean questions');
ok(new Set(korean.map(q=>q.text)).size===20,'Korean set must not repeat questions');
ok(korean.every(q=>q.choices.length===4&&new Set(q.choices).size===4&&q.choices.includes(q.answer)),'Korean choices/answers invalid');
console.log('WEEKLY_REWARD_VARIETY_V96_OK');
