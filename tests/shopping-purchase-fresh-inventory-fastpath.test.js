const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');
function cut(name,next){const a=src.indexOf('function '+name+'(');if(a<0)throw new Error(name+' missing');const b=next?src.indexOf('function '+next+'(',a+1):-1;return src.slice(a,b>0?b:src.length)}
const fnSrc=cut('createPurchasedInventory_','pendingShopPurchaseKey_');
let reads=0,writes=0;
const ctx={Date:{now:()=>100},Utilities:{getUuid:()=> 'u1'},readShopInventory_:()=>{reads++;return [{id:'existing',purchaseKey:'dup'}]},writeShopInventoryItem_:(user,item)=>{writes++;return item}};
vm.createContext(ctx);vm.runInContext(fnSrc,ctx);
let fresh={id:'p1',name:'연필',description:'',price:3,__moaruFreshPurchaseKey:'fresh'};
let out=ctx.createPurchasedInventory_('u',fresh,'fresh');
if(reads!==0||writes!==1||out.purchaseKey!=='fresh')throw new Error('fresh purchase must append without inventory scan');
reads=0;writes=0;
out=ctx.createPurchasedInventory_('u',{id:'p1',name:'연필',description:'',price:3},'dup');
if(reads!==1||writes!==0||out.id!=='existing')throw new Error('duplicate/recovery path must keep inventory duplicate scan');
reads=0;writes=0;
out=ctx.createPurchasedInventory_('u',{id:'p1',name:'연필',description:'',price:3,__moaruFreshPurchaseKey:'other'},'dup');
if(reads!==1||writes!==0)throw new Error('mismatched fresh marker must not bypass duplicate protection');
if(!src.includes('inventoryProduct.__moaruFreshPurchaseKey = purchaseKey')||!src.includes('delete inventoryProduct.__moaruFreshPurchaseKey'))throw new Error('fresh marker lifecycle missing');
console.log('SHOPPING_PURCHASE_FRESH_INVENTORY_FASTPATH_OK');
