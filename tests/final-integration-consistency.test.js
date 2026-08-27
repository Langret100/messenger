const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const sw=read('sw.js'),code=read('docs/apps-script/Code.gs'),ai=read('docs/apps-script/MOA_AI.gs'),install=read('docs/apps-script/MOA_AI_INSTALL.md'),api=read('js/adapters/auth-api.js');
const CACHE='moaru-moa-dialogue-fusion-final';
ok(sw.includes(`const CACHE = "${CACHE}"`),'final service-worker cache is not the audited v91 baseline');
for(const f of fs.readdirSync(path.join(root,'tests')).filter(x=>x.endsWith('.test.js')&&x!=='final-integration-consistency.test.js')){
  const text=read('tests/'+f);
  const oldCache='moaru-v64.5.'+'48-moa-solo-public-learning-v91-20260820';
  ok(!text.includes(oldCache),`stale v64.5.48 cache assertion remains in ${f}`);
  const oldSemantic='moa-solo-public-learning-v91-'+'20260820';
  ok(!text.includes(oldSemantic),`stale semantic v91 cache assertion remains in ${f}`);
}
ok(ai.includes('function moaCleanupLegacySheets()')&&!ai.includes('moaV91CleanupLegacySheets'),'MOA cleanup function name is inconsistent');
ok(install.includes('`moaCleanupLegacySheets()`')&&!install.includes('moaV91CleanupLegacySheets'),'MOA install guide points to the wrong cleanup function');
ok(!code.includes('JSON.stringify(data)'),'Apps Script request body is still logged and may expose passwords or task content');
const serverModes=new Set([...code.matchAll(/case\s+["']([^"']+)["']\s*:/g)].map(m=>m[1]));
const clientModes=new Set([...api.matchAll(/\bmode\s*:\s*["']([^"']+)["']/g)].map(m=>m[1]));
for(const mode of clientModes)ok(serverModes.has(mode),`client Apps Script mode has no server route: ${mode}`);
const expected=['idle1.png','idle2.png','listen1.png','listen2.png','greet1.png','greet2.png','cheer.png','joy.png','fun1.png','fun2.png','fail1.png','fail2.png','sad.png','shy1.png','shy2.png'];
for(const name of expected)ok(fs.existsSync(path.join(root,'assets/game-mina',name)),`English game-mina asset missing: ${name}`);
const ghost=read('js/game-ghost.js');
for(const name of expected)ok(ghost.includes(name),`game-ghost does not reference English Mina asset: ${name}`);
ok(!/[가-힣][^\"']*\.png/.test(ghost),'game-ghost still contains a Korean image filename');
const moaChat=read('js/features/moa-chat.js');
ok(!moaChat.includes('moa-suggestion-row')&&!moaChat.includes('moa-suggestion-chip')&&!moaChat.includes('starterRows'),'MOA quick-suggestion buttons are still rendered');
const gsFiles=fs.readdirSync(path.join(root,'docs/apps-script')).filter(x=>x.endsWith('.gs'));
const fnOwner=new Map();
for(const file of gsFiles){
  const text=read('docs/apps-script/'+file);
  for(const m of text.matchAll(/^\s*function\s+([A-Za-z_$][\w$]*)\s*\(/gm)){
    ok(!fnOwner.has(m[1]),`duplicate Apps Script function ${m[1]} in ${fnOwner.get(m[1])} and ${file}`);
    fnOwner.set(m[1],file);
  }
}
for(const m of code.matchAll(/case\s+["']([^"']+)["']\s*:\s*(?:\{\s*)?return\s+([A-Za-z_$][\w$]*)\s*\(/g)){
  ok(fnOwner.has(m[2]),`Apps Script route ${m[1]} points to missing handler ${m[2]}`);
}
console.log('FINAL_INTEGRATION_CONSISTENCY_OK');
