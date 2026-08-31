const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
const start=src.indexOf('function handleShopGift(e)'),end=src.indexOf('function normalizeDeliveryStatus_',start),body=src.slice(start,end);
if(!body.includes('findShopInventoryItemFresh_(userId, inventoryId)'))throw new Error('gift source still scans/caches the whole user inventory instead of reading its exact row');
if(body.includes('readShopInventory_(userId).filter'))throw new Error('gift source full-inventory read remains');
if(!body.includes('deleteShopInventoryItem_(userId, inventoryId, sourceFound && sourceFound.row)'))throw new Error('gift source row lookup is repeated during delete');
const delStart=src.indexOf('function deleteShopInventoryItem_('),delEnd=src.indexOf('function createPurchasedInventory_',delStart),del=src.slice(delStart,delEnd);
if(!del.includes('rowHint'))throw new Error('inventory delete row hint support missing');
console.log('SHOP_GIFT_FRESH_ROW_FASTPATH_OK');
