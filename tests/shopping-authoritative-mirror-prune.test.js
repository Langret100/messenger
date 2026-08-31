const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/adapters/realtime.js','utf8');
if(!src.includes('function pruneShopInventoryMirror(ownerId,purchaseKeys)'))throw new Error('authoritative mirror prune helper missing');
if(!src.includes('keys.has(String(stored[id]?.purchaseKey||""))'))throw new Error('mirror prune is not purchaseKey-scoped');
const store=fs.readFileSync('js/shopping/store-service.js','utf8');
if(!store.includes('MiniTalk.Realtime.pruneShopInventoryMirror?.(current.user_id,[...serverPurchaseKeys])'))throw new Error('server inventory does not prune matching legacy mirror');
if(!store.includes('item?.pendingSync&&!serverPurchaseKeys.has'))throw new Error('local-only pending compatibility was lost');
console.log('SHOPPING_AUTHORITATIVE_MIRROR_PRUNE_OK');
