const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto');
const source=fs.readFileSync(path.join(__dirname,'../js/tasks/friday-grade6-mission.js'),'utf8');
function load(src,iso,id='visual-user'){
 const Real=Date;class D extends Real{constructor(...a){super(...(a.length?a:[iso]))}static now(){return new Real(iso).getTime()}}
 const c={Date:D,console,setTimeout,clearTimeout,setInterval,clearInterval,MiniTalk:{Tasks:{},Store:{get:()=>({user_id:id})},Realtime:{},UI:{},Economy:{}}};
 vm.createContext(c);vm.runInContext(src.includes('const WEEKLY_VISUAL_BANK=')?src.replace('return{render,open,','return{WEEKLY_VISUAL_BANK,renderWeeklyMaterial,renderWorksheet,wrongReviewCard,render,open,'):src,c);return c.MiniTalk.Tasks.FridayGrade6Mission;
}
const api=load(source,'2026-10-30T12:00:00'),bank=api.WEEKLY_VISUAL_BANK;
assert.equal(bank.length,33);assert.equal(new Set(bank.map(m=>m.id)).size,33);
for(const m of bank){
 assert.equal(m.questions.length,4);const [x,y,w,h]=m.frame;assert(x>=0&&y>=0&&x+w<=2160&&y+h<=5940);assert.equal(w,720);assert.equal(h,540);
 assert.equal(m.center[0],w/2);assert.equal(m.center[1],h/2);
 for(const f of [m.mainFrame,...Object.values(m.choiceFrames||{})].filter(Boolean))assert(f[0]>=0&&f[1]>=0&&f[0]+f[2]<=w&&f[1]+f[3]<=h);
 for(const q of m.questions){assert.equal(new Set(q.choices).size,4);assert(q.choices.includes(q.answer));assert(q.explanation);if(q.pictureChoices)for(const c of q.choices)assert(m.choiceFrames[c]&&m.choiceAlt[c]);}
}
let missions=0;
for(let user=0;user<10;user++){
 const seen={국어:new Set(),수학:new Set()},last={국어:new Map(),수학:new Map()},runs={국어:0,수학:0};
 for(let week=0;week<60;week++){
  const iso=new Date(Date.UTC(2026,7,21+week*7,12)).toISOString(),a=load(source,iso,'user-'+user),qs=a.makeQuestions(),subject=qs[0].subject,visual=qs.filter(q=>q.visual),run=runs[subject]++;
  assert.equal(qs.length,20);assert.equal(new Set(qs.map(q=>q.text)).size,20);assert.equal(visual.length,2);assert.notEqual(visual[0].visual,visual[1].visual);
  for(const q of qs){assert.equal(new Set(q.choices).size,4);assert(q.choices.includes(q.answer));assert.equal(q.subject,subject);}
  for(const q of visual){assert(!seen[subject].has(q.visualKey),'repeated visual question: '+q.visualKey);seen[subject].add(q.visualKey);const previous=last[subject].get(q.visual);if(previous!==undefined)assert(run-previous>=7,'image repeated too soon');last[subject].set(q.visual,run);}
  const selections=Object.fromEntries(qs.map(q=>[q.id,q.answer])),saved=a.serializeAnswers(qs,selections);assert.equal(a.buildReport(saved).score,20);
  for(const q of visual){const row=saved.find(x=>x.id===q.id);assert.equal(row.visual,q.visual);assert.equal(row.pictureChoices,!!q.pictureChoices);assert.equal(row.explanation,q.explanation);}
  selections[qs[0].id]=qs[0].choices.find(c=>c!==qs[0].answer);assert.equal(a.buildReport(a.serializeAnswers(qs,selections)).score,19);
  missions++;
 }
 for(const s of ['국어','수학']){assert.equal(runs[s],30);assert.equal(seen[s].size,60);}
}
// v4-v8 fixtures are covered by weekly-expanded-bank-compatibility.test.js.
// v9 baseline fixtures stay in this file so CI needs no external checkout.
for(const [iso,expected] of [['2026-10-09T12:00:00','ac60e9fa5940c1306a2f03c87ca76e7bfbe354fa20dce31e3e163c8d526727cc'],['2026-10-16T12:00:00','fb457fc11f468d5e9170957bad1442264eb8b04c3827faaea54ebb680a179f13']]){
 assert.equal(crypto.createHash('sha256').update(JSON.stringify(load(source,iso).makeQuestions('v9'))).digest('hex'),expected,'v9 saved worksheet changed');
}
// Check rolling windows across both cycle boundaries, not only the first block.
const rolling={국어:[],수학:[]},lastImage={국어:new Map(),수학:new Map()};
for(let week=-20;week<160;week++){
 const a=load(source,new Date(Date.UTC(2026,7,21+week*7,12)).toISOString(),'cycle-boundary-user'),qs=a.makeQuestions().filter(q=>q.visual),subject=qs[0].subject,history=rolling[subject],run=history.length;
 for(const q of qs){assert(!history.slice(-29).flat().includes(q.visualKey),'rolling 30 repeats '+q.visualKey);const previous=lastImage[subject].get(q.visual);if(previous!==undefined)assert(run-previous>=7,'cycle boundary repeats image too soon');lastImage[subject].set(q.visual,run);}
 history.push(qs.map(q=>q.visualKey));
}
const q=id=>bank.find(m=>m.id===id).questions.map(q=>q.answer);
assert.deepEqual(Array.from(q('farm')),['48m²','72m²','40%','2 : 3']);
assert.deepEqual(Array.from(q('spatial-views')),['가','나','다','7개']);
assert.deepEqual(Array.from(q('graph-conversion')),['가','4 : 3','150명','70%']);
assert.deepEqual(Array.from(q('route-map')),['가','120m','420m','840m']);
console.log('WEEKLY_VISUAL_ATLAS_OK '+missions+' missions + 180 boundary missions; rolling 30 per subject; legacy v4-v9 preserved');
