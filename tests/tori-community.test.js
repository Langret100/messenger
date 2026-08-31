const fs=require('fs'),vm=require('vm'),path=require('path'),cryptoNode=require('crypto');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const memory=new Map();
const ctx={console,EventTarget,Event,CustomEvent:CE,document:{},window:null,URL,URLSearchParams,crypto:{randomUUID:()=>cryptoNode.randomUUID()},fetch:async()=>{throw new Error('offline')},localStorage:{getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)}};
ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js','js/games/score-service.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Store.set('user',{user_id:'u1',nickname:'토리'});
ctx.MiniTalk.Games.ScoreService.recordLocal('구구단게임',30,ctx.MiniTalk.Store.get('user'));
ctx.MiniTalk.Games.ScoreService.recordLocal('구구단게임',20,ctx.MiniTalk.Store.get('user'));
ctx.MiniTalk.Games.ScoreService.recordLocal('구구단게임',45,ctx.MiniTalk.Store.get('user'));
const rows=ctx.MiniTalk.Games.ScoreService.localRanking('구구단게임');
if(rows.length!==1||rows[0].score!==45||rows[0].rank!==1)throw new Error('local best score handling failed');
console.log('TORI_COMMUNITY_OK',rows[0].score);
