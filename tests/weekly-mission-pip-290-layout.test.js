const fs=require('fs');
const css=fs.readFileSync('css/features/feed-classinfo-weekly.css','utf8');
const html=fs.readFileSync('index.html','utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

ok(css.includes('.task-center-view>.card-list{grid-auto-rows:max-content;align-content:start}'),'task list can still shrink weekly rows inside the PiP viewport');
ok(css.includes('min-height:max-content;')&&css.includes('height:max-content;')&&css.includes('align-self:start;'),'open weekly card is not protected from grid-track compression');
const narrow=(css.match(/@media\(max-width:340px\)\{([\s\S]*?)\n\}/)||[])[1]||'';
ok(narrow.includes('.friday-mission-card.open:not(.quest-compact){grid-template-columns:1fr;gap:10px;min-height:max-content;height:max-content'),'290px weekly card does not preserve its content height');
ok(!narrow.includes('friday-mission-card.open:not(.quest-compact){grid-template-columns:1fr;gap:10px;min-height:0'),'290px rule still explicitly allows the weekly card to collapse');
ok(html.includes('feed-classinfo-weekly.css?v=65.0.31'),'weekly PiP CSS cache ref stale');
console.log('WEEKLY_MISSION_PIP_290_LAYOUT_OK');
