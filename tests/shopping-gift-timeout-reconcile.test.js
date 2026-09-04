const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const persisted=new Map(),events=[];let giftCalls=0,mode='timeout-then-success';
const ctx={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},crypto:{randomUUID:()=> 'req-1'},setTimeout,clearTimeout};ctx.window=ctx;vm.createContext(ctx);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
ctx.MiniTalk.Persistence={get:(k,f)=>persisted.has(k)?persisted.get(k):f,set:(k,v)=>persisted.set(k,v)};
ctx.MiniTalk.Tools={Notifications:{}};ctx.MiniTalk.UserDirectory={all:()=>[{user_id:'b',nickname:'나래'}]};
ctx.MiniTalk.Realtime={notifyCommandTargets:()=>{},removeShopInventory:async()=>{}};
ctx.MiniTalk.AuthApi={
 shopGift:async()=>{giftCalls++;if(mode==='timeout-then-success'&&giftCalls===1){const e=new Error('timeout');e.code='REQUEST_TIMEOUT';throw e}if(mode==='definite'){const e=new Error('not available');e.code='GIFT_ITEM_NOT_AVAILABLE';throw e}return{ok:true}},
 shopInventory:async()=>[]
};
vm.runInContext(fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8'),ctx,{filename:'store-service.js'});
ctx.MiniTalk.Events.on('shopping:gift-resolved',v=>events.push(v));
(async()=>{
 const svc=ctx.MiniTalk.Shopping.StoreService;
 ctx.MiniTalk.Store.set('user',{user_id:'a',nickname:'가람',isGuest:false});
 ctx.MiniTalk.Store.set('shopInventory',{x:{id:'x',name:'연필',createdAt:Date.now()}});
 let r=await svc.gift('x','b');if(!r.pending)throw new Error('timeout must become pending, not visible failure');
 if(svc.inventory().some(x=>x.id==='x'))throw new Error('ambiguous timeout must not resurrect sender item');
 await new Promise(r=>setTimeout(r,900));
 if(giftCalls<2)throw new Error('same gift request was not reconciled in background');
 if(!events.some(x=>x.status==='sent'))throw new Error('background success was not reported');
 ctx.MiniTalk.Store.set('shopInventory',{y:{id:'y',name:'노트',createdAt:Date.now()}});mode='definite';
 let failed=false;try{await svc.gift('y','b')}catch(e){failed=e.code==='GIFT_ITEM_NOT_AVAILABLE'}
 if(!failed)throw new Error('definite server rejection must surface as failure');
 if(!svc.inventory().some(x=>x.id==='y'))throw new Error('definite failure must restore sender item');
 console.log('SHOPPING_GIFT_TIMEOUT_RECONCILE_OK');
})().catch(e=>{console.error(e);process.exit(1)});
