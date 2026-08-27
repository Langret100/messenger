const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');
function cut(name,next){const a=src.indexOf('function '+name+'(');if(a<0)throw new Error(name+' missing');const b=next?src.indexOf('function '+next+'(',a+1):-1;return src.slice(a,b>0?b:src.length)}
const fnSrc=cut('createPurchasedInventory_','pendingShopPurchaseKey_');
let reads=0,writes=0;
const ctx={Date:{now:()=>100},Utilities:{getUuid:()=> 'u1'},readShopInventory_:()=>{reads++;return [{id:'existing',purchaseKey:'dup'}]},writeShopInventoryItem_:(user,item)=>{writes++;return item}};
vm.createContext(ctx);vm.runInContext(fnSrc,ctx);
let out=ctx.createPurchasedInventory_('u',{id:'p1',name:'연필',description:'',price:3},'dup');
if(reads!==1||writes!==0||out.id!=='existing')throw new Error('duplicate purchase must be detected before inventory write');
reads=0;writes=0;
out=ctx.createPurchasedInventory_('u',{id:'p1',name:'연필',description:'',price:3},'fresh');
if(reads!==1||writes!==1||out.purchaseKey!=='fresh')throw new Error('new purchase must use the stable duplicate-check/write path');
if(src.includes('__moaruFreshPurchaseKey'))throw new Error('unsafe fresh-purchase bypass must stay removed');
console.log('SHOPPING_PURCHASE_STABLE_INVENTORY_PATH_OK');
