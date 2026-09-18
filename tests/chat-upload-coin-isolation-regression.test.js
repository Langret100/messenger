const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const attachments=fs.readFileSync(path.join(root,'js/chat/attachments.js'),'utf8');
const shop=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
// Shared Apps Script endpoint: upload must not fan one user action into parallel/retry executions.
ok(!/for\s*\(let attempt=0;attempt<3/.test(attachments),'chat upload still retries Apps Script automatically');
ok(!/Math\.min\(2,selected\.length\)/.test(attachments),'chat upload still starts parallel Apps Script workers');
ok(/for\(let index=0;index<selected\.length;index\+=1\)/.test(attachments),'chat uploads are not serialized');
// Do not rewrite the established shop purchase transaction as part of a chat-upload fix.
ok(/try \{ inventoryItem = createFreshPurchasedInventory_\(userId, inventoryProduct, purchaseKey\); clearPendingShopPurchase_\(purchaseKey, userId\); \}/.test(shop),'known-good fresh purchase completion path was changed');
ok(/finally \{ lock\.releaseLock\(\); \}/.test(shop),'shop purchase lock lifecycle changed unexpectedly');
console.log('CHAT_UPLOAD_COIN_ISOLATION_REGRESSION_OK');
