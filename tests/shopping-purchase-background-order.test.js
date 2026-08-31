const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8');
const purchaseStart=src.indexOf('async function purchase(product)');
const randomStart=src.indexOf('async function randomPurchase()');
const useStart=src.indexOf('async function use(id)');
if(purchaseStart<0||randomStart<0||useStart<0)throw new Error('shopping functions missing');
const purchase=src.slice(purchaseStart,randomStart), random=src.slice(randomStart,useStart);
for(const [name,block] of [['purchase',purchase],['random',random]]){
  if(block.includes('Realtime.addShopInventory'))throw new Error(`${name} still writes persistent Realtime mirror after authoritative Apps Script purchase`);
  if(!block.includes('syncInventoryLater([async()=>{if(isActiveUser(current))await refreshInventory(true)}])'))throw new Error(`${name} no longer performs authoritative background refresh`);
  if(!block.includes('pendingSync:true'))throw new Error(`${name} lost Store-only pending recovery item`);
}
console.log('SHOPPING_PURCHASE_BACKGROUND_ORDER_OK');
