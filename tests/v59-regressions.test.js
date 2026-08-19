const fs=require("fs"),path=require("path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const realtime=read("js/adapters/realtime.js"),service=read("js/shopping/store-service.js"),auth=read("js/adapters/auth-api.js");
const server=read("docs/apps-script/coin-shopping-extension.gs"),code=read("docs/apps-script/Code.gs"),windowMode=read("js/adapters/window-mode.js"),background=read("css/features/chat-background.css");
if(!realtime.includes("MiniTalkConfig.paths.legacyProfiles")||!realtime.includes("MiniTalkConfig.paths.profiles"))throw new Error("legacy/current profile subscriptions are incomplete");
if(realtime.includes("signInAnonymously")||realtime.includes("firebase-auth-compat.js"))throw new Error("Firebase anonymous auth must not return");
if(!auth.includes('mode: "shop_gift"')||!server.includes("function handleShopGift"))throw new Error("Apps Script gift endpoint is incomplete");
if(!service.includes("notifyGift")||!service.includes("inventoryDirty=true")||service.includes("setInterval(()=>refreshInventory(true)"))throw new Error("gift lazy refresh/notification policy is incomplete");
if(!auth.includes('mode: "admin_dispatch"')||!realtime.includes("MiniTalk.AuthApi.adminDispatch")||!server.includes("function handleAdminDispatch"))throw new Error("admin server dispatch fallback is incomplete");
for(const route of ["shop_inventory","shop_gift","shop_use","admin_dispatch","admin_coin_reward","admin_user_balances","admin_task_assign","admin_task_list","admin_task_review","user_task_list","user_task_submit","user_commands"]){if(!code.includes(`case "${route}"`))throw new Error(`Apps Script route missing: ${route}`)}
if(!service.includes("shop.catalog.cache.v2")||!service.includes("hydrateCatalogCache"))throw new Error("catalog immediate cache is missing");
if(!windowMode.includes("BOUNDS_VERSION=4")||!windowMode.includes("width:360"))throw new Error("narrow popup bounds reset is missing");
if(!background.includes("background-attachment: scroll")||background.includes("background-attachment: local"))throw new Error("chat background must stay fixed inside the message viewport");
console.log("V59_REGRESSIONS_OK");
