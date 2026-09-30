const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'js/adapters/auth-api.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(/mode:\s*"moa_search"[\s\S]{0,220}\},\s*6500\)/.test(src),'moa_search must use 6500ms budget');
console.log('MOA_SEARCH_TIMEOUT_BUDGET_OK');
