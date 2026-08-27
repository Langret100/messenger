const fs=require('fs');const ok=(v,m)=>{if(!v)throw new Error(m)};const client=fs.readFileSync('js/ai/moa-communication-engine.js','utf8'),server=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
for(const term of ['배고프','간식','메뉴','먹을']){ok(client.includes(term),'client semantic category missing '+term);ok(server.includes(term),'server semantic category missing '+term)}
ok(client.includes('ctxTokenOverlap===0&&ctxCatOverlap===0'),'context overlap still receives unrelated-pattern penalty');
console.log('MOA_LEARNING_SEMANTIC_PARITY_OK');
