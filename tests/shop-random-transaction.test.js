const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
const start=src.indexOf('function shopRandomWeight_');
if(start<0)throw new Error('random helper missing');
const code=src.slice(start);
const state={catalog:{},coin:10,logs:[],inventory:new Map(),deductions:0,adds:0};
const normalize=p=>({id:String(p?.id||''),name:String(p?.name||''),description:String(p?.description||''),imageUrl:String(p?.imageUrl||''),price:Number(p?.price)||0,updatedAt:Number(p?.updatedAt)||0,active:p?.active!==false});
const ctx={
  console,
  Math:Object.create(Math),
  SHOP_RANDOM_PURCHASE_PRICE:3,
  requireRegisteredShopUser_:id=>String(id||''),requireKnownMoaruUser_:id=>String(id||''),requireKnownMoaruUserCached_:id=>String(id||''),
  shopJson_:x=>x,
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  SHEET_ID:'sheet', REWARD_SHEET:'보상', SpreadsheetApp:{openById:()=>({getSheetByName:()=>({})})}, getOrCreateShopInventorySheet_:()=>({}),
  getOrCreateShopPurchaseLogSheet_:()=>({appendRow:r=>state.logs.push({purchaseKey:r[0],userId:r[1],productId:r[2],productName:r[3],price:r[4],beforeCoin:r[5],newCoin:r[6]})}),
  findShopPurchase_:(_,key)=>state.logs.find(x=>x.purchaseKey===key)||null,
  readShopCatalog_:()=>state.catalog,
  normalizeShopProduct_:normalize,
  createPurchasedInventory_:(user,p,key)=>{if(state.inventory.has(key))return state.inventory.get(key);const item={id:'inv-'+state.inventory.size,productId:p.id,name:p.name,description:p.description,imageUrl:p.imageUrl,price:p.price,purchaseKey:key};state.inventory.set(key,item);return item},
  createFreshPurchasedInventory_:(user,p,key)=>{const item={id:'inv-'+state.inventory.size,productId:p.id,name:p.name,description:p.description,imageUrl:p.imageUrl,price:p.price,purchaseKey:key};state.inventory.set(key,item);return item},
  clearPendingShopPurchase_:()=>{},rememberPendingShopPurchase_:()=>{},
  getRewardUserData_:()=>({coin:state.coin}),
  moaruCoinChangeGuarded_:(_,op,amount)=>{if(op==='remove'){if(state.coin<amount)return{success:false};state.coin-=amount;state.deductions++;return{success:true,newCoin:state.coin}}state.coin+=amount;state.adds++;return{success:true,newCoin:state.coin}},
  moaruSpreadsheetRetry_:fn=>fn(),
  isNaN,parseInt,Number,String,Object,Date,
};
vm.createContext(ctx);vm.runInContext(code,ctx);
ctx.findRewardUserForShop_=()=>({coin:state.coin});
ctx.setRewardCoinForShopGuarded_=(_,newCoin)=>{const next=Number(newCoin);if(next<state.coin)state.deductions++;else if(next>state.coin)state.adds++;state.coin=next;return{success:true,newCoin:next}};
const call=(params)=>ctx.handleShopPurchase({parameter:params});
const reset=(coin=10)=>{state.catalog={};state.coin=coin;state.logs=[];state.inventory=new Map();state.deductions=0;state.adds=0};
const ok=(v,m)=>{if(!v)throw new Error(m)};

reset(10);state.catalog={a:{id:'a',name:'싼상품',price:2,active:true},b:{id:'b',name:'비싼상품',price:9,active:true}};ctx.Math.random=()=>0.99;
let r=call({user_id:'u',random_purchase:'1',price:'3',purchase_key:'k1'});
ok(r.ok&&r.price===3&&r.original_price===9,'random purchase did not award current-catalog product at 3 coin');
ok(state.coin===7&&state.deductions===1&&state.inventory.size===1,'3 coin deduction/inventory write mismatch');
let d=call({user_id:'u',random_purchase:'1',price:'3',purchase_key:'k1'});
ok(d.ok&&d.applied===false&&state.coin===7&&state.deductions===1&&state.inventory.size===1,'duplicate random purchase charged twice');

reset(2);state.catalog={a:{id:'a',name:'상품',price:1,active:true}};r=call({user_id:'u',random_purchase:'1',price:'3',purchase_key:'lowcoin'});
ok(!r.ok&&r.error==='INSUFFICIENT_COIN'&&state.coin===2&&state.inventory.size===0,'insufficient coin path is unsafe');

reset(10);state.catalog={};r=call({user_id:'u',random_purchase:'1',price:'3',purchase_key:'empty'});
ok(!r.ok&&r.error==='NO_RANDOM_PRODUCTS'&&state.coin===10,'empty catalog charged coins');

reset(10);state.catalog={a:{id:'a',name:'일반',description:'d',price:5,updatedAt:7,active:true}};
r=call({user_id:'u',product_id:'a',price:'5',expected_name:'일반',expected_description:'d',expected_updated_at:'7',purchase_key:'direct'});
ok(r.ok&&r.price===5&&state.coin===5,'normal direct purchase behavior regressed');

reset(10);state.catalog={a:{id:'a',name:'일반',description:'d',price:5,updatedAt:8,active:true}};
r=call({user_id:'u',product_id:'a',price:'5',expected_name:'일반',expected_description:'d',expected_updated_at:'7',purchase_key:'changed'});
ok(!r.ok&&r.error==='PRODUCT_CHANGED'&&state.coin===10,'changed product snapshot no longer protected');
console.log('SHOP_RANDOM_TRANSACTION_OK');
