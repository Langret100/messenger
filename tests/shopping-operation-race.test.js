const fs=require('fs'),vm=require('vm'),path=require('path'),cryptoNode=require('crypto');
const src=fs.readFileSync(path.resolve(__dirname,'../js/shopping/store-service.js'),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});return{promise,resolve,reject}}
function createHarness(){
  const state={user:{user_id:'u1',nickname:'학생',isGuest:false},shopCatalog:{p1:{id:'p1',name:'상품',price:1}},shopInventory:{inv1:{id:'inv1',ownerId:'u1',productId:'p1',name:'상품',price:1,deliveryStatus:'owned'}}};
  const listeners=new Map(),persistence=new Map([['shop.inventory.server.u1',{...state.shopInventory}]]);
  const stale=deferred(),delivery=deferred(),gift=deferred();let inventoryCalls=0,serverState={id:'inv1',ownerId:'u1',productId:'p1',name:'상품',price:1,deliveryStatus:'owned'};
  const MiniTalk={
    Shopping:{},
    Events:{on(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn)},emit(type,value){(listeners.get(type)||[]).forEach(fn=>fn(value))}},
    Store:{get:k=>state[k],set(k,v){state[k]=v;(listeners.get(`state:${k}`)||[]).forEach(fn=>fn(v));return v}},
    Persistence:{get:(k,d)=>persistence.has(k)?persistence.get(k):d,set:(k,v)=>persistence.set(k,v)},
    AuthApi:{
      shopCatalog:async()=>Object.values(state.shopCatalog),
      shopInventory:async()=>{inventoryCalls++;return inventoryCalls===1?stale.promise:(serverState?[{...serverState}]:[])},
      shopRequestDelivery:async()=>{const result=await delivery.promise;serverState={...(result.item||serverState),deliveryStatus:result.deliveryStatus||'requested'};return result},
      shopGift:async()=>{const result=await gift.promise;serverState=null;return result}
    },
    Realtime:{pruneShopInventoryMirror(){},notifyCommandTargets(){},removeShopInventory:async()=>true},
    Tools:{Notifications:{notifyGift(){}}},
    Economy:{CoinWallet:{setLocal(){},refresh:async()=>0}},
    UserDirectory:{all:()=>[{user_id:'u2',nickname:'친구'}]}
  };
  const ctx={console,MiniTalk,crypto:{randomUUID:()=>cryptoNode.randomUUID()},setTimeout,clearTimeout,Promise};ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(src,ctx);
  ctx.MiniTalk.Shopping.StoreService.start(state.user);
  return{ctx,state,stale,delivery,gift};
}
(async()=>{
  // 배송 중에 먼저 시작된 stale inventory 응답이 돌아와도 requested 상태를 되돌리면 안 됩니다.
  {
    const h=createHarness(),svc=h.ctx.MiniTalk.Shopping.StoreService;
    const refresh=svc.refreshInventory(true);
    const request=svc.requestDelivery('inv1');
    if(h.state.shopInventory.inv1.deliveryStatus!=='requested'||!h.state.shopInventory.inv1.deliveryPending)throw new Error('delivery optimistic state missing');
    h.stale.resolve([{id:'inv1',ownerId:'u1',productId:'p1',name:'상품',price:1,deliveryStatus:'owned'}]);
    await refresh;
    if(h.state.shopInventory.inv1.deliveryStatus!=='requested')throw new Error('stale inventory resurrected active delivery button');
    h.delivery.resolve({ok:true,item:{id:'inv1',ownerId:'u1',productId:'p1',name:'상품',price:1,deliveryStatus:'requested'},deliveryStatus:'requested'});
    await request;
    if(h.state.shopInventory.inv1.deliveryStatus!=='requested'||h.state.shopInventory.inv1.deliveryPending)throw new Error('delivery confirmation state wrong');
  }
  // 선물 중 stale inventory 응답이 원래 상품을 다시 보관함에 되살리면 안 됩니다.
  {
    const h=createHarness(),svc=h.ctx.MiniTalk.Shopping.StoreService;
    const refresh=svc.refreshInventory(true);
    const request=svc.gift('inv1','u2');
    if(h.state.shopInventory.inv1)throw new Error('gift optimistic removal missing');
    h.stale.resolve([{id:'inv1',ownerId:'u1',productId:'p1',name:'상품',price:1,deliveryStatus:'owned'}]);
    await refresh;
    if(h.state.shopInventory.inv1)throw new Error('stale inventory resurrected gifted item');
    h.gift.resolve({ok:true});
    await request;
    if(h.state.shopInventory.inv1)throw new Error('gifted item returned after confirmation');
  }
  console.log('SHOPPING_OPERATION_RACE_OK');
})().catch(error=>{console.error(error);process.exit(1)});
