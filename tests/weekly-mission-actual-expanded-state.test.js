const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/tasks/quest-accordion.js'),'utf8');
const tasks=fs.readFileSync(path.join(root,'js/features/tasks.js'),'utf8');
const friday=fs.readFileSync(path.join(root,'js/tasks/friday-grade6-mission.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

function classList(...initial){
  const set=new Set(initial);
  return {contains:n=>set.has(n),toggle(n,on){if(on===undefined)on=!set.has(n);on?set.add(n):set.delete(n);return on},add:n=>set.add(n),remove:n=>set.delete(n),dump:()=>[...set]};
}
const weekly={classList:classList('friday-mission-card','open')};
const panel={classList:classList('quest-accordion-panel','hidden')};
const daily={classList:classList('quest-accordion'),querySelector(sel){return sel==='.quest-accordion-panel'?panel:null}};
const scope={querySelectorAll(sel){
  if(sel==='.quest-accordion[data-subject].expanded')return daily.classList.contains('expanded')?[daily]:[];
  if(sel==='.friday-mission-card[data-quest-key="weekly"]')return [weekly];
  return [];
}};
const sandbox={console,CustomEvent:function(){},EventTarget:function(){},setTimeout,clearTimeout,Audio:function(){},MiniTalk:{Tasks:{},UI:{Dom:{doc:()=>scope}},Events:{emit(){}}}};
vm.createContext(sandbox);vm.runInContext(src,sandbox);
const api=sandbox.MiniTalk.Tasks.QuestAccordion;

// stale memory/state must not collapse weekly when the actual daily panels are all closed.
api.syncWeeklyCompact(scope);
ok(!weekly.classList.contains('quest-compact'),'weekly stayed compact although every daily quest is actually closed');

// Merely having an expanded class is insufficient if the real panel is hidden.
daily.classList.add('expanded');
api.syncWeeklyCompact(scope);
ok(!weekly.classList.contains('quest-compact'),'hidden daily panel incorrectly compacted weekly mission');

// Only a daily quest that is actually visible may compact weekly.
panel.classList.remove('hidden');
api.syncWeeklyCompact(scope);
ok(weekly.classList.contains('quest-compact'),'visible expanded daily quest did not compact weekly mission');

// Closing it must restore weekly immediately.
daily.classList.remove('expanded');panel.classList.add('hidden');
api.syncWeeklyCompact(scope);
ok(!weekly.classList.contains('quest-compact'),'weekly mission did not restore after all daily quests closed');

ok(tasks.includes('QuestAccordion?.syncWeeklyCompact?.(host)'),'task page does not reconcile weekly state against the rendered DOM');
ok(friday.includes('data-quest-key":"weekly'),'weekly mission marker missing');
ok(html.includes('quest-accordion.js?v=25')&&html.includes('quest-accordion.css?v=28')&&html.includes('js/features/tasks.js?v=64.5.3'),'weekly state cache refs stale');
console.log('WEEKLY_MISSION_ACTUAL_EXPANDED_STATE_OK');
