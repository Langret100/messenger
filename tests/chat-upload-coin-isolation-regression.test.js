const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const attachments=fs.readFileSync(path.join(root,'js/chat/attachments.js'),'utf8');
const shop=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
// Shared Apps Script endpoint: upload must not fan one user action into parallel/retry executions.
ok(!/for\s*\(let attempt=0;attempt<3/.test(attachments),'chat upload still retries Apps Script automatically');
ok(!/Math\.min\(2,selected\.length\)/.test(attachments),'chat upload still starts parallel Apps Script workers');
ok(/for\(let index=0;index<selected\.length;index\+=1\)/.test(attachments),'chat uploads are not serialized');
// Purchase must release the global coin lock before inventory-sheet write.
const release=shop.indexOf('lock.releaseLock();',shop.indexOf('function handleShopPurchase'));
const inventory=shop.indexOf('createFreshPurchasedInventory_',shop.indexOf('function handleShopPurchase'));
ok(release>0&&inventory>release,'shop purchase still writes inventory while holding global ScriptLock');
console.log('CHAT_UPLOAD_COIN_ISOLATION_REGRESSION_OK');
