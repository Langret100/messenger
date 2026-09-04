const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(ROOT,'js/features/tasks.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(src.includes('previousScrollTop')&&src.includes('list.scrollTop = Math.min(previousScrollTop'),'task rerender must preserve current scroll position');
ok(src.includes('list.style.overflowAnchor = "none"'),'task list must disable browser scroll anchoring during dynamic weekly compact layout');
ok(html.includes('js/features/tasks.js?v='),'task scroll fix cache ref stale');

// 실제 render 재호출에서 기존 scrollTop이 새 리스트로 넘어가는지 최소 DOM으로 검증한다.
function node(cls=''){
  return {className:cls,children:[],style:{},scrollTop:0,scrollHeight:900,clientHeight:300,
    append(...xs){this.children.push(...xs.filter(Boolean))},replaceChildren(...xs){this.children=[...xs]},
    querySelector(sel){if(sel==='.task-center-view > .card-list')return this._currentList||null;if(sel==='button')return null;return null;}};
}
let rtHandler=null,lastList=null;
const host=node();
const D={el(tag,attrs={},children=[]) {const n=node(attrs.class||''); if(attrs.text)n.textContent=attrs.text; n.append(...children); if((attrs.class||'')==='card-list')lastList=n; return n;},one(){return null}};
const MiniTalk={Features:{},Tasks:{
  TaskService:{enter:()=>Promise.resolve(),visible:()=>true},
  FridayGrade6Mission:{render:()=>node('friday-mission-card')},
  DailyMathQuest:{render:()=>node('quest-accordion')},DailyKoreanQuest:{render:()=>node('quest-accordion')},
  QuestAccordion:{syncWeeklyCompact(){}}
},Events:{on(name,fn){if(name==='rt:tasks')rtHandler=fn}},Store:{get(k){if(k==='user')return {isGuest:false};if(k==='route')return 'tasks';return {}},set(){}},UI:{Dom:{...D,byId(){return host}},DragScroll:{bind(){}}},Registry:{register(){}}};
const sandbox={MiniTalk,console};vm.createContext(sandbox);vm.runInContext(src,sandbox);
MiniTalk.Features.Tasks.render(host); host._currentList=lastList; lastList.scrollTop=137;
// 지연 서버 응답과 같은 rt:tasks 재렌더
rtHandler({});
host._currentList=lastList;
ok(lastList.scrollTop===137,`delayed task sync moved scrollTop: ${lastList.scrollTop}`);
ok(lastList.style.overflowAnchor==='none','new task list lost overflow-anchor guard');
console.log('TASK_SCROLL_PRESERVE_OK');
