const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const ghost=fs.readFileSync(path.join(root,"js/game-ghost.js"),"utf8");
const game=(n)=>fs.readFileSync(path.join(root,"games",n),"utf8");
function ok(v,m){if(!v)throw new Error(m)}
const files=["idle1.png","idle2.png","listen1.png","listen2.png","greet1.png","greet2.png","cheer.png","joy.png","fun1.png","fun2.png","fail1.png","fail2.png","sad.png","shy1.png","shy2.png"];
ok(ghost.includes('const MINA_BASE = "../assets/game-mina/"'),'mina game asset path missing');
ok(ghost.includes('game-ghost-character')&&ghost.includes('setCharacterFrames'),'mina character renderer missing');
ok(ghost.includes('MINA_ASSET_REV = "?v=65"'),'mina asset cache revision missing');
for(const f of files){const p=path.join(root,"assets/game-mina",f);ok(fs.existsSync(p),`missing ${f}`);ok(fs.statSync(p).size<20000,`${f} is not ultralight`);ok(ghost.includes(f),`game ghost does not reference ${f}`)}
ok(!/[가-힣][^"']*\.png/.test(ghost),'game ghost still references Korean Mina filenames');
for(const f of ["gugudan.html","dice-sum.html","shape-tracker.html","math-explorer.html"])ok(game(f).includes('../js/game-ghost.js'),`${f} does not load game ghost`);
ok(!game("tamagotchi.html").includes('../js/game-ghost.js'),'tamagotchi must not load mina game ghost');
console.log('GAME_MINA_CHARACTER_OK');
