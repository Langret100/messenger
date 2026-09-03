const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),server=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8'),shell=fs.readFileSync(path.join(root,'js/ui/shell.js'),'utf8'),service=fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8');
function body(name,next){const a=server.indexOf(`function ${name}`),b=server.indexOf(`function ${next}`,a+1);if(a<0)throw new Error(`${name} missing`);return server.slice(a,b<0?server.length:b)}
const guard=body('requireRegisteredShopUser_','handleShopInventory');
if(!guard.includes('MOARU_SHOP_ELIGIBLE_USER_CACHE_PREFIX')||!guard.includes('findRewardUserForShop_(id)'))throw new Error('reward eligibility is not cached safely');
const inv=body('handleShopInventory','handleShopGift');
if(!inv.includes('requireRegisteredShopUser_'))throw new Error('inventory reward eligibility changed');
const gift=body('handleShopGift','normalizeDeliveryStatus_');
if(!gift.includes('requireRegisteredShopUser_(p.user_id, registeredUsers)')||!gift.includes('requireRegisteredShopUser_(p.target_user_id, registeredUsers)'))throw new Error('gift reward eligibility changed');
const del=body('handleShopRequestDelivery','handleShopDeliveryList');
if(!del.includes('requireRegisteredShopUser_(p.user_id, users)'))throw new Error('delivery reward eligibility changed');
if(shell.includes('},700)')||shell.includes('},1400)')||shell.includes('},2200)'))throw new Error('artificial login feature delays remain');
const start=service.slice(service.indexOf('function start('),service.indexOf('async function enter'));
if(start.includes('refreshInventory(true)'))throw new Error('shopping inventory still competes with login startup');
if(!server.includes('if (remaining) properties.setProperty(pendingShopPurchaseUserMarkerKey_(target), "1")'))throw new Error('multi-pending purchase recovery marker safety missing');
if(!server.includes('MOARU_SHOP_CATALOG_DATA_CACHE')||!server.includes('clearShopCatalogCaches_'))throw new Error('catalog full-property scan cache missing');
console.log('SHOPPING_SERVER_LATENCY_SAFETY_OK');
