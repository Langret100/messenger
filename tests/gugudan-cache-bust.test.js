const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
const games=read('js/features/games.js'),index=read('index.html');
ok(/games\/gugudan\.html\?v=\d+/.test(games),'gugudan URL is not versioned');
ok(index.includes('js/features/games.js?v=21'),'games feature cache version stale');
ok(index.includes('js/games/score-service.js?v=22'),'score service cache version stale');
console.log('GUGUDAN_CACHE_BUST_OK');
