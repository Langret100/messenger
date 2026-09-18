const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const attachments=fs.readFileSync(path.join(root,'js/chat/attachments.js'),'utf8');
const shop=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
// Shared Apps Script endpoint: upload must not fan one user action into parallel/retry executions.
ok(!/for\s*\(let attempt=0;attempt<3/.test(attachments),'chat upload still retries Apps Script automatically');
ok(!/Math\.min\(2,selected\.length\)/.test(attachments),'chat upload still starts parallel Apps Script workers');
ok(/for\(let index=0;index<selected\.length;index\+=1\)/.test(attachments),'chat uploads are not serialized');
// Upload load and shop purchase must not keep the shared Apps Script global lock occupied during inventory I/O.
const purchaseStart=shop.indexOf('function handleShopPurchase(e)');
const purchaseEnd=shop.indexOf('\n}',purchaseStart)+2;
const purchase=shop.slice(purchaseStart,purchaseEnd);
const release=purchase.indexOf('lock.releaseLock()');
ok(release>=0,'shop purchase lock release missing');
ok(purchase.indexOf('createFreshPurchasedInventory_')>release,'fresh inventory write still runs under global ScriptLock');
ok(purchase.indexOf('createPurchasedInventory_')>release,'retry inventory recovery still runs under global ScriptLock');
console.log('CHAT_UPLOAD_COIN_ISOLATION_REGRESSION_OK');
