const fs=require("fs"),vm=require("vm");
const ok=(v,m)=>{if(!v)throw new Error(m)};
const coin=fs.readFileSync("docs/apps-script/coin.gs","utf8");
const shop=fs.readFileSync("docs/apps-script/coin-shopping-extension.gs","utf8");
new vm.Script(coin,{filename:"coin.gs"});new vm.Script(shop,{filename:"coin-shopping-extension.gs"});
ok(coin.includes("COIN_REWARD_ROLLBACK_FAILED")&&coin.includes("REWARD_LOG_FAILED")&&coin.includes("processCoinChangeUnlocked_(userId, \"remove\", delta)"),"reward log failure rollback missing");
ok(shop.includes("MOARU_SHOP_PENDING_PURCHASE_PREFIX")&&shop.includes("reconcilePendingShopPurchases_")&&shop.includes("inventory_pending"),"deferred inventory recovery missing");
ok(shop.includes("reconcilePendingShopPurchases_(userId)")&&shop.includes("rememberPendingShopPurchase_(userId, product, purchaseKey)"),"pending purchase is not wired into inventory/purchase flow");
console.log("APPS_REWARD_SHOP_HARDENING_OK");
