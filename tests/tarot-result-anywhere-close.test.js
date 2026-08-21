const fs=require('fs');
const view=fs.readFileSync('js/tools/tarot-view.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

const start=view.indexOf('function renderResult(stage, result, returning)');
const end=view.indexOf('function readingBlock',start);
const body=view.slice(start,end);
ok(body.includes('activeOverlay.classList.add("result-open")'),'tarot overlay is not switched into result state');
ok(body.includes('activeOverlay.onclick = event =>')&&body.includes('close();'),'clicking outside the result card does not close the tarot result');
ok(view.includes('button.onclick = () => draw('),'deck selection path changed unexpectedly');
ok(html.includes('js/tools/tarot-view.js?v=64.5.4'),'tarot result cache ref stale');
console.log('TAROT_RESULT_ANYWHERE_CLOSE_OK');
