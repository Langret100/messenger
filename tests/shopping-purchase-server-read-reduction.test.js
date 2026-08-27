const fs=require('fs');const s=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(!/cacheKey = "moaru-shop-catalog-v2"/.test(s),'purchase hotfix must not depend on the new server catalog cache');
ok(!/opts\.appendNew === true \? 0/.test(s),'unsafe append-new inventory shortcut is still active');
ok(!/__moaruFreshPurchaseKey/.test(s),'fresh purchase marker is still active');
ok(/createPurchasedInventory_\(userId, inventoryProduct, purchaseKey\); clearPendingShopPurchase_\(purchaseKey\)/.test(s),'stable purchase completion/pending cleanup path missing');
console.log('SHOPPING_PURCHASE_STABLE_SERVER_PATH_OK');
