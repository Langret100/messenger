const fs=require('fs'),vm=require('vm'),path=require('path'),cryptoNode=require('crypto');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const persisted=new Map(),waiters={};
const deferred=name=>new Promise(resolve=>{waiters[name]=resolve});
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},crypto:{randomUUID:()=>cryptoNode.randomUUID()},setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Persistence={get:(k,f)=>persisted.has(k)?persisted.get(k):f,set:(k,v)=>persisted.set(k,v)};
ctx.MiniTalk.Economy={CoinWallet:{setLocal:v=>{ctx.coinWrites=(ctx.coinWrites||[]).concat(v)},refresh:async()=>99}};
ctx.MiniTalk.Tools={Notifications:{notifyGift(){}}};ctx.MiniTalk.AdminSession={requireToken:()=>''};
ctx.MiniTalk.UserDirectory={all:()=>[{user_id:'u2',nickname:'받는이'}]};
ctx.MiniTalk.Realtime={addShopInventory:async()=>{ctx.addCalls=(ctx.addCalls||0)+1},removeShopInventory:async()=>{ctx.removeCalls=(ctx.removeCalls||0)+1},notifyCommandTargets:()=>{ctx.notifyCalls=(ctx.notifyCalls||0)+1;return Promise.resolve(true)}};
ctx.MiniTalk.AuthApi={
  shopCatalog:async()=>[],shopInventory:async()=>[],
  shopPurchase:async()=>deferred('purchase'),
  shopGift:async()=>deferred('gift'),
  shopRequestDelivery:async()=>deferred('delivery')
};
vm.runInContext(fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8'),ctx,{filename:'store-service.js'});
(async()=>{
 const svc=ctx.MiniTalk.Shopping.StoreService;
 ctx.MiniTalk.Store.set('user',{user_id:'u1',nickname:'첫계정',isGuest:false});ctx.MiniTalk.Store.set('shopInventory',{});
 const buy=svc.purchase({id:'p1',name:'연필',price:3,updatedAt:1});await new Promise(r=>setImmediate(r));
 ctx.MiniTalk.Store.set('user',{user_id:'u9',nickname:'새계정',isGuest:false});ctx.MiniTalk.Store.set('shopInventory',{new1:{id:'new1',name:'새계정상품'}});waiters.purchase({ok:true,newCoin:7,item:{id:'old-buy',productId:'p1',name:'연필',price:3,createdAt:Date.now()}});await buy;await new Promise(r=>setTimeout(r,20));
 if(ctx.MiniTalk.Store.get('shopInventory')['old-buy'])throw new Error('old purchase leaked into switched account inventory');
 if((ctx.coinWrites||[]).includes(7))throw new Error('old purchase balance leaked into switched account coin wallet');
 if(ctx.addCalls)throw new Error('old purchase Firebase mirror ran after account switch');

 ctx.MiniTalk.Store.set('user',{user_id:'u1',nickname:'첫계정',isGuest:false});ctx.MiniTalk.Store.set('shopInventory',{gift1:{id:'gift1',name:'선물'}});
 const gift=svc.gift('gift1','u2');await new Promise(r=>setImmediate(r));ctx.MiniTalk.Store.set('user',{user_id:'u9',nickname:'새계정',isGuest:false});ctx.MiniTalk.Store.set('shopInventory',{gift1:{id:'gift1',name:'새계정의 같은 id 상품'}});waiters.gift({ok:true});await gift;await new Promise(r=>setTimeout(r,20));
 if(!ctx.MiniTalk.Store.get('shopInventory').gift1)throw new Error('old gift removed switched account item');
 if(ctx.removeCalls)throw new Error('old gift Firebase removal ran after account switch');
 if(ctx.notifyCalls)throw new Error('old gift wakeup ran under switched account');

 ctx.MiniTalk.Store.set('user',{user_id:'u1',nickname:'첫계정',isGuest:false});ctx.MiniTalk.Store.set('shopInventory',{del1:{id:'del1',name:'배송',deliveryStatus:'owned'}});
 const del=svc.requestDelivery('del1');await new Promise(r=>setImmediate(r));ctx.MiniTalk.Store.set('user',{user_id:'u9',nickname:'새계정',isGuest:false});ctx.MiniTalk.Store.set('shopInventory',{new2:{id:'new2',name:'새상품'}});waiters.delivery({ok:true,deliveryStatus:'requested',item:{id:'del1',name:'배송',deliveryStatus:'requested'}});await del;await new Promise(r=>setTimeout(r,20));
 if(ctx.MiniTalk.Store.get('shopInventory').del1)throw new Error('old delivery state leaked into switched account');
 console.log('SHOPPING_ACCOUNT_SWITCH_RACE_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
