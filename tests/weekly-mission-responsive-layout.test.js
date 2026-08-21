const fs=require('fs');
const css=fs.readFileSync('css/features/feed-classinfo-weekly.css','utf8');
const accordion=fs.readFileSync('js/tasks/quest-accordion.js','utf8');
const friday=fs.readFileSync('js/tasks/friday-grade6-mission.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

ok((css.match(/\/\* 주간 미션 카드: 상태\/반응형 규칙을 이 블록 하나에서 관리합니다\. \*\//g)||[]).length===1,'weekly mission CSS is not consolidated');
ok(css.includes('@media(max-width:340px)')&&css.includes('grid-template-columns:1fr')&&css.includes('.friday-start-button{width:100%!important'),'small PiP weekly card does not stack cleanly');
ok(!css.includes('grid-template-columns:minmax(0,1fr) 92px'),'legacy cramped 92px weekly action column remains');
ok(css.includes('.friday-mission-card.quest-compact>.friday-mission-copy')&&css.includes('display:none!important'),'compact weekly must hide the open-card label/copy');
ok(friday.includes('class:"friday-mission-compact-toggle"')&&!friday.includes('friday-action-note')&&!friday.includes('약 10분')&&!friday.includes('누르면 학습점검을 시작해요'),'weekly action helper copy must stay removed');
ok(accordion.indexOf('quest-subject-progress') < accordion.indexOf('quest-subject-reward'),'daily quest header order must be progress then reward');
ok(html.includes('feed-classinfo-weekly.css?v=65.0.30')&&html.includes('quest-accordion.css?v=29')&&html.includes('quest-accordion.js?v=26'),'responsive layout cache refs stale');
console.log('WEEKLY_MISSION_RESPONSIVE_LAYOUT_OK');
