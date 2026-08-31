const fs=require('fs');const ok=(v,m)=>{if(!v)throw new Error(m)};const s=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');
ok(/function getOrCreateShopPurchaseLogSheet_\(\)/.test(s),'stable purchase log helper contract changed');
ok(/function getOrCreateShopInventorySheet_\(\)/.test(s),'stable inventory helper contract changed');
ok(/function findRewardUserForShop_\(userId\)/.test(s),'stable reward lookup contract changed');
ok(!/const shopSpreadsheet = SpreadsheetApp\.openById\(SHEET_ID\);/.test(s),'regressed request-scoped openById purchase path is still active');
ok(/const logSheet = getOrCreateShopPurchaseLogSheet_\(\);/.test(s),'stable purchase log path missing');
ok(/const reward = moaruSpreadsheetRetry_\(function \(\) \{ return findRewardUserForShop_\(userId\); \}\);/.test(s),'stable reward lookup path missing');
console.log('SHOPPING_PURCHASE_STABLE_REQUEST_PATH_OK');
