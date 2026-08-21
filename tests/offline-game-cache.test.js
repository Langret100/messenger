const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const game of ['gugudan.html','dice-sum.html','shape-tracker.html','math-explorer.html','tamagotchi.html']){
  if(!sw.includes(`./games/${game}`))throw new Error(`offline cache missing ${game}`);
}
if(!sw.includes('url.pathname.includes("/games/")'))throw new Error('game navigation fallback is not isolated');
if(!sw.includes('ignoreSearch: true'))throw new Error('versioned assets cannot fall back to the install cache');
if(/CORE\.push\(/.test(sw))throw new Error('offline cache list should have one source of truth');
console.log('OFFLINE_GAME_CACHE_OK');
