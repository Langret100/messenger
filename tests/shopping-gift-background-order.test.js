const fs=require('fs'),vm=require('vm'),path=require('path'),cryptoNode=require('crypto');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const persisted=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},crypto:{randomUUID:()=>cryptoNode.randomUUID()},setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Persistence={get:(k,f)=>persisted.has(k)?persisted.get(k):f,set:(k,v)=>persisted.set(k,v)};
ctx.MiniTalk.Economy={CoinWallet:{setLocal(){},refresh:async()=>0}};ctx.MiniTalk.Tools={Notifications:{notifyGift(){}}};ctx.MiniTalk.AdminSession={requireToken:()=>''};
ctx.MiniTalk.UserDirectory={all:()=>[{user_id:'u2',nickname:'받는이'}]};
let removeFinished=false,refreshStartedBeforeRemove=false;
ctx.MiniTalk.AuthApi={shopGift:async()=>({ok:true}),shopInventory:async()=>{if(!removeFinished)refreshStartedBeforeRemove=true;return[]},shopCatalog:async()=>[]};
ctx.MiniTalk.Realtime={removeShopInventory:async()=>{await sleep(30);removeFinished=true;return true},notifyCommandTargets:()=>Promise.resolve(true)};
vm.runInContext(fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8'),ctx,{filename:'store-service.js'});
(async()=>{const svc=ctx.MiniTalk.Shopping.StoreService;ctx.MiniTalk.Store.set('user',{user_id:'u1',nickname:'보내는이',isGuest:false});ctx.MiniTalk.Store.set('shopInventory',{gift1:{id:'gift1',name:'선물',createdAt:Date.now()}});
const started=Date.now();await svc.gift('gift1','u2');if(Date.now()-started>20)throw new Error('gift UI waited for background mirror cleanup');
// Simulate a stale realtime inventory event arriving after optimistic local removal.
ctx.MiniTalk.Store.set('shopInventory',{gift1:{id:'gift1',name:'선물',createdAt:Date.now()}});
await sleep(80);
if(refreshStartedBeforeRemove)throw new Error('authoritative refresh raced ahead of Firebase removal');
if(svc.inventory().some(x=>x.id==='gift1'))throw new Error('stale realtime gift item was not cleared by final authoritative refresh');
console.log('SHOPPING_GIFT_BACKGROUND_ORDER_OK');})().catch(e=>{console.error(e);process.exitCode=1});
