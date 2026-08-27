const fs=require('fs');const s=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(/cacheKey = "moaru-shop-catalog-v2"/.test(s),'catalog cache missing');
ok(/opts\.appendNew === true \? 0/.test(s),'fresh append must skip inventory-id lookup');
ok(/knownProduct/.test(s)&&/opts\.knownProduct = product/.test(s),'verified product fast hydration missing');
ok(!/createPurchasedInventory_\(userId, inventoryProduct, purchaseKey\); clearPendingShopPurchase_\(purchaseKey\)/.test(s),'fresh purchase still deletes impossible pending marker');
console.log('SHOPPING_PURCHASE_SERVER_READ_REDUCTION_OK');
