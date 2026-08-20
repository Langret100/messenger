const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const ghost=fs.readFileSync(path.join(root,"js/game-ghost.js"),"utf8");
const game=(n)=>fs.readFileSync(path.join(root,"games",n),"utf8");
function ok(v,m){if(!v)throw new Error(m)}
const files=["기본대기1.png","기본대기2.png","경청1.png","경청2.png","인사1.png","인사2.png","만세2.png","기쁨2.png","신남1.png","신남2.png","절망1.png","절망2.png","실망2.png","부끄러움1.png","부끄러움2.png"];
ok(ghost.includes('const MINA_BASE = "../assets/game-mina/"'),'mina game asset path missing');
ok(ghost.includes('game-ghost-character')&&ghost.includes('setCharacterFrames'),'mina character renderer missing');
ok(ghost.includes('MINA_ASSET_REV = "?v=65"'),'mina asset cache revision missing');
for(const f of files){const p=path.join(root,"assets/game-mina",f);ok(fs.existsSync(p),`missing ${f}`);ok(fs.statSync(p).size<20000,`${f} is not ultralight`)}
for(const f of ["gugudan.html","dice-sum.html","shape-tracker.html","math-explorer.html"])ok(game(f).includes('../js/game-ghost.js'),`${f} does not load game ghost`);
ok(!game("tamagotchi.html").includes('../js/game-ghost.js'),'tamagotchi must not load mina game ghost');
console.log('GAME_MINA_CHARACTER_OK');
