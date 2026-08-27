const fs=require('fs');const ok=(v,m)=>{if(!v)throw new Error(m)};const s=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');
ok(/function getOrCreateShopPurchaseLogSheet_\(spreadsheet\)/.test(s),'purchase log helper cannot reuse request spreadsheet');
ok(/function getOrCreateShopInventorySheet_\(spreadsheet\)/.test(s),'inventory helper cannot reuse request spreadsheet');
ok(/function findRewardUserForShop_\(userId, rewardSheet\)/.test(s),'reward lookup cannot reuse request sheet');
ok(/const shopSpreadsheet = SpreadsheetApp\.openById\(SHEET_ID\);/.test(s),'purchase request-scoped spreadsheet missing');
ok(/getOrCreateShopPurchaseLogSheet_\(shopSpreadsheet\)/.test(s),'purchase log does not reuse spreadsheet');
ok(/findRewardUserForShop_\(userId, rewardSheet\)/.test(s),'reward lookup does not reuse sheet');
ok(/inventorySheet: inventorySheet/.test(s),'inventory write does not reuse sheet');
console.log('SHOPPING_PURCHASE_REQUEST_SCOPE_REUSE_OK');
