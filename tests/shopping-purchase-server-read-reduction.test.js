const fs=require('fs');const s=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(!/cacheKey = "moaru-shop-catalog-v2"/.test(s),'purchase path must not reintroduce the previously regressed catalog cache bundle');
ok(/function createFreshPurchasedInventory_/.test(s),'explicit fresh-purchase helper missing');
ok(/knownNewId: true, knownProduct: product/.test(s),'fresh purchase must skip only provably redundant inventory-id/catalog reads');
ok(/createFreshPurchasedInventory_\(userId, inventoryProduct, purchaseKey\); clearPendingShopPurchase_\(purchaseKey, userId\)/.test(s),'fresh purchase completion path missing');
ok(/function createPurchasedInventory_/.test(s)&&/readShopInventory_\(userId\)/.test(s),'duplicate/retry recovery path must retain inventory duplicate check');
ok(!/const shopSpreadsheet = SpreadsheetApp\.openById\(SHEET_ID\);/.test(s),'regressed request-scoped spreadsheet reuse must stay removed');
console.log('SHOPPING_PURCHASE_SAFE_READ_REDUCTION_OK');