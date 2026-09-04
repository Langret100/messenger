const fs=require('fs'),path=require('path'),vm=require('vm'),cryptoNode=require('crypto');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),ok=(v,m)=>{if(!v)throw new Error(m)};
const shopping=read('js/features/shopping.js'),server=read('docs/apps-script/coin-shopping-extension.gs');
const adminStart=shopping.indexOf('function deliveryAdminPanel'),adminEnd=shopping.indexOf('function leave()',adminStart),adminBody=shopping.slice(adminStart,adminEnd);
ok(adminBody.includes('rows = rows.filter(value => !sameDelivery(value, payload))'),'admin complete/cancel does not remove only the changed row');
ok(adminBody.includes('rows = rows.map(value => sameDelivery(value, payload) ? { ...value, status: "shipping"'),'admin shipping does not patch only the changed row');
ok(!adminBody.includes('await load();'),'admin delivery action still performs a second full list request');
ok(shopping.includes('if (users.length || MiniTalk.UserDirectory?.loaded?.())'),'gift dialog still blocks on directory refresh even when cached users exist');
ok(shopping.includes('send.textContent = "보내는 중…"'),'gift send lacks immediate button feedback');

// Server: a cancelled delivery item must be giftable and reset to a clean owned state for the receiver.
const props=new Map(),ctx={console,Date,Math,JSON,String,Number,Object,Array,Map,Set,
  CacheService:{getScriptCache:()=>({get:()=>null,put(){},remove(){}})},
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,String(v)),deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},
  Utilities:{getUuid:()=> 'uuid-1',computeDigest:()=>[1,2,3]},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:v=>({value:v,setMimeType(){return this}})}
};
vm.createContext(ctx);vm.runInContext(server,ctx,{filename:'coin-shopping-extension.gs'});
ctx.moaruSpreadsheetRetry_=fn=>fn();ctx.moaruRegisteredUserMap_=()=>({u1:'보내는이',u2:'받는이'});ctx.requireRegisteredShopUser_=id=>String(id||'');ctx.findRewardUsersForShop_=ids=>Object.fromEntries(ids.map(id=>[id,{userId:id,coin:10}]));
ctx.findShopInventoryItemFresh_=()=>({row:7,item:{id:'c1',ownerId:'u1',productId:'p1',name:'취소상품',purchaseKey:'pk1',deliveryStatus:'cancelled',deliveryRequestedAt:10,deliveryShippingAt:20,deliveryCancelledAt:30}});
let saved=null,deleted=false;ctx.writeShopInventoryItem_=(owner,item)=>{saved={...item,ownerId:owner};return saved};ctx.deleteShopInventoryItem_=()=>{deleted=true};ctx.setPurchaseOwner_=()=>{};ctx.enqueueMoaruCommand_=()=>{};
const giftResult=JSON.parse(ctx.handleShopGift({parameter:{user_id:'u1',target_user_id:'u2',inventory_id:'c1',nickname:'보내는이'}}).value);
ok(giftResult.ok,'cancelled item was rejected by server gift handler');ok(deleted,'cancelled gift did not remove source item');ok(saved&&saved.deliveryStatus==='owned','gifted cancelled item was not reset to owned');
ok(!saved.deliveryRequestedAt&&!saved.deliveryShippingAt&&!saved.deliveryCancelledAt&&!saved.usedAt,'old delivery state leaked into gifted item');

// Client: UI state must change before the intentionally delayed server response returns.
class CE extends Event{constructor(type,options={}){super(type);this.detail=options.detail}}
const persisted=new Map(),c={console,EventTarget,Event,CustomEvent:CE,window:null,document:{},crypto:{randomUUID:()=>cryptoNode.randomUUID()},setTimeout,clearTimeout};c.window=c;vm.createContext(c);
for(const file of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js'])vm.runInContext(read(file),c,{filename:file});
c.MiniTalk.Persistence={get:(k,f)=>persisted.has(k)?persisted.get(k):f,set:(k,v)=>persisted.set(k,v)};c.MiniTalk.Economy={CoinWallet:{refresh:async()=>0,setLocal(){}}};c.MiniTalk.Tools={Notifications:{notifyGift(){}}};c.MiniTalk.AdminSession={requireToken:()=>''};c.MiniTalk.UserDirectory={all:()=>[{user_id:'u2',nickname:'받는이'}]};
c.MiniTalk.Realtime={removeShopInventory:async()=>true,notifyCommandTargets:()=>Promise.resolve(true),pruneShopInventoryMirror(){}};
let resolveDelivery,resolveGift;
c.MiniTalk.AuthApi={shopCatalog:async()=>[],shopInventory:async()=>[],shopRequestDelivery:()=>new Promise(r=>resolveDelivery=r),shopGift:()=>new Promise(r=>resolveGift=r)};
vm.runInContext(read('js/shopping/store-service.js'),c,{filename:'store-service.js'});
(async()=>{const svc=c.MiniTalk.Shopping.StoreService;c.MiniTalk.Store.set('user',{user_id:'u1',nickname:'보내는이',isGuest:false});
  c.MiniTalk.Store.set('shopInventory',{d1:{id:'d1',name:'배송상품',deliveryStatus:'owned',createdAt:1}});
  const dp=svc.requestDelivery('d1');ok(svc.inventory().find(x=>x.id==='d1')?.deliveryStatus==='requested','delivery UI state waited for server response');
  resolveDelivery({ok:true,deliveryStatus:'requested',item:{id:'d1',name:'배송상품',deliveryStatus:'requested',createdAt:1}});await dp;
  c.MiniTalk.Store.set('shopInventory',{g1:{id:'g1',name:'취소상품',deliveryStatus:'cancelled',deliveryCancelledAt:30,createdAt:2}});
  const gp=svc.gift('g1','u2');ok(!svc.inventory().some(x=>x.id==='g1'),'gift UI state waited for server response');resolveGift({ok:true});await gp;
  console.log('SHOPPING_ACTION_FASTPATH_CANCELLED_GIFT_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
