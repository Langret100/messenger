const fs=require('fs'),vm=require('vm'),path=require('path'),cryptoNode=require('crypto');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const never=()=>new Promise(()=>{}),persisted=new Map();
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},crypto:{randomUUID:()=>cryptoNode.randomUUID()},setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Persistence={get:(k,f)=>persisted.has(k)?persisted.get(k):f,set:(k,v)=>persisted.set(k,v)};
ctx.MiniTalk.Economy={CoinWallet:{setLocal:(v)=>{ctx.lastCoin=v},refresh:async()=>99}};
ctx.MiniTalk.Tools={Notifications:{notifyGift(){}}};ctx.MiniTalk.AdminSession={requireToken:()=>''};
ctx.MiniTalk.UserDirectory={all:()=>[{user_id:'u2',nickname:'받는이'}]};
ctx.MiniTalk.AuthApi={shopPurchase:async({product,randomPurchase})=>({ok:true,newCoin:7,item:{id:randomPurchase?'inv-r':'inv-p',productId:product?.id||'p1',name:product?.name||'랜덤',price:3,createdAt:Date.now()}}),shopInventory:never,shopCatalog:async()=>[],shopGift:async()=>({ok:true}),shopRequestDelivery:async({inventoryId})=>({ok:true,deliveryStatus:'requested',deliveryRequestedAt:Date.now(),item:{id:inventoryId,name:'연필',deliveryStatus:'requested',createdAt:Date.now()}})};
ctx.MiniTalk.Realtime={addShopInventory:never,removeShopInventory:never,notifyCommandTargets:()=>Promise.resolve(true)};
vm.runInContext(fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8'),ctx,{filename:'store-service.js'});
const withDeadline=(p,label)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(label+' waited for background sync')),80))]);
(async()=>{const svc=ctx.MiniTalk.Shopping.StoreService;ctx.MiniTalk.Store.set('user',{user_id:'u1',nickname:'보내는이',isGuest:false});ctx.MiniTalk.Store.set('shopCatalog',{p1:{id:'p1',name:'연필',price:3,updatedAt:1}});ctx.MiniTalk.Store.set('shopInventory',{});
await withDeadline(svc.purchase({id:'p1',name:'연필',price:3,updatedAt:1}),'purchase');if(ctx.lastCoin!==7||!svc.inventory().some(x=>x.id==='inv-p'))throw new Error('purchase did not publish authoritative success immediately');
ctx.MiniTalk.Store.set('shopInventory',{gift1:{id:'gift1',name:'선물',createdAt:Date.now()}});await withDeadline(svc.gift('gift1','u2'),'gift');if(svc.inventory().some(x=>x.id==='gift1'))throw new Error('gift source was not removed immediately after server success');
ctx.MiniTalk.Store.set('shopInventory',{del1:{id:'del1',name:'연필',createdAt:Date.now(),deliveryStatus:'owned'}});await withDeadline(svc.requestDelivery('del1'),'delivery');if(svc.inventory().find(x=>x.id==='del1')?.deliveryStatus!=='requested')throw new Error('delivery requested state was not published immediately');
console.log('SHOPPING_CLIENT_FASTPATH_RUNTIME_OK');})().catch(e=>{console.error(e);process.exitCode=1});
