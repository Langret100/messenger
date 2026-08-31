const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.resolve(__dirname,'..');
const ctx={MiniTalk:{}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,'js','tarot.js'),'utf8'),ctx,{filename:'js/tarot.js'});
const tarot=ctx.MiniTalk.Tools.Tarot;
if(tarot.cards().length!==8)throw new Error('tarot deck must contain eight cards');
const first=tarot.draw('2026-08-11','local-user',1);
const again=tarot.draw('2026-08-11','local-user',1);
if(JSON.stringify(first)!==JSON.stringify(again))throw new Error('daily draw must be deterministic');
if(!first.id||!first.title||!first.meaning||!first.advice)throw new Error('draw result is incomplete');
if(first.luckyNumber<1||first.luckyNumber>9)throw new Error('lucky number is out of range');
const samples=new Set();
for(let day=11;day<=18;day++)for(let choice=0;choice<3;choice++){
  const value=tarot.draw(`2026-08-${day}`,'local-user',choice);
  samples.add(`${value.id}:${value.reversed}`);
}
if(samples.size<5)throw new Error('draw results do not vary enough');
console.log('TAROT_DAILY_OK',first.id,first.reversed?'reversed':'upright',samples.size);
