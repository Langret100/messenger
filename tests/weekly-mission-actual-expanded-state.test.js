const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/tasks/quest-accordion.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
function classList(...initial){const set=new Set(initial);return{contains:n=>set.has(n),toggle(n,on){if(on===undefined)on=!set.has(n);on?set.add(n):set.delete(n);return on},dump:()=>[...set]}}
const weekly={classList:classList('friday-mission-card','open')};
const scope={querySelectorAll(sel){if(sel==='.friday-mission-card[data-quest-key="weekly"]')return[weekly];return[]},querySelector(){return null}};
const sandbox={console,CustomEvent:function(){},EventTarget:function(){},setTimeout,clearTimeout,requestAnimationFrame:fn=>fn(),Audio:function(){},MiniTalk:{Tasks:{},UI:{Dom:{doc:()=>scope}},Events:{emit(){}}}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const api=sandbox.MiniTalk.Tasks.QuestAccordion;

// 초기에는 일일 과목이 열려 있지 않으므로 주간 미션은 펼쳐진 카드다.
api.syncWeeklyCompact(scope);
ok(!weekly.classList.contains('quest-compact'),'weekly mission compacted with no open daily quest');

// 실제 토글 API로 수학을 열었을 때만 compact.
api.activate('math');
ok(weekly.classList.contains('quest-compact'),'weekly mission did not compact when math opened');

// 같은 과목을 다시 누르면 닫히고 주간 카드가 즉시 복구된다.
api.activate('math');
ok(!weekly.classList.contains('quest-compact'),'weekly mission did not restore when math closed');

api.activate('korean');
ok(weekly.classList.contains('quest-compact'),'weekly mission did not compact when Korean opened');
api.activate('korean');
ok(!weekly.classList.contains('quest-compact'),'weekly mission did not restore when Korean closed');

ok(html.includes('quest-accordion.js?v=')&&html.includes('quest-accordion.css?v='),'weekly state cache refs stale');
console.log('WEEKLY_MISSION_ACTUAL_EXPANDED_STATE_OK');
