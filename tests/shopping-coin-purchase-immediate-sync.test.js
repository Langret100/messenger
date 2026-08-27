const fs=require('fs'),vm=require('vm'),path=require('path'),cryptoNode=require('crypto');
const root=path.resolve(__dirname,'..');class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const persisted=new Map();let resolveOldCoin,coinCalls=0;const oldCoin=new Promise(r=>{resolveOldCoin=r});
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{querySelectorAll:()=>[]},crypto:{randomUUID:()=>cryptoNode.randomUUID()},setTimeout,clearTimeout,localStorage:{getItem:k=>persisted.has(k)?persisted.get(k):null,setItem:(k,v)=>persisted.set(k,String(v)),removeItem:k=>persisted.delete(k)}};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.UI={Dom:{doc:()=>ctx.document}};
ctx.MiniTalk.AuthApi={
 coinStatus:async()=>{coinCalls++;if(coinCalls===1)return oldCoin;return 7},
 shopPurchase:async({product})=>({ok:true,newCoin:7,item:{id:'inv-p',ownerId:'u1',productId:product.id,name:product.name,price:product.price,createdAt:Date.now()}}),
 shopInventory:()=>new Promise(()=>{}),shopCatalog:async()=>[]
};
ctx.MiniTalk.Tools={Notifications:{notifyGift(){}}};ctx.MiniTalk.AdminSession={requireToken:()=>''};ctx.MiniTalk.UserDirectory={all:()=>[]};ctx.MiniTalk.Realtime={};
ctx.MiniTalk.Store.set('user',{user_id:'u1',nickname:'사용자',isGuest:false});
vm.runInContext(fs.readFileSync(path.join(root,'js/economy/coin-wallet.js'),'utf8'),ctx,{filename:'coin-wallet.js'});
vm.runInContext(fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8'),ctx,{filename:'store-service.js'});
(async()=>{
 const W=ctx.MiniTalk.Economy.CoinWallet,svc=ctx.MiniTalk.Shopping.StoreService;
 ctx.MiniTalk.Store.set('shopCatalog',{p1:{id:'p1',name:'연필',price:3,updatedAt:1}});ctx.MiniTalk.Store.set('shopInventory',{});
 const stale=W.refresh(false);if(coinCalls!==1)throw new Error('setup coin refresh missing');
 await svc.purchase({id:'p1',name:'연필',price:3,updatedAt:1});
 if(W.value()!==7)throw new Error('purchase newCoin was not reflected before purchase() returned: '+W.value());
 resolveOldCoin(10);await stale;if(W.value()!==7)throw new Error('old pre-purchase coinStatus overwrote purchase balance: '+W.value());
 console.log('SHOPPING_COIN_PURCHASE_IMMEDIATE_SYNC_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
