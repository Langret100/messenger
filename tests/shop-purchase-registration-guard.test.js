const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),server=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
const start=server.indexOf('function handleShopPurchase(e)');const end=server.indexOf('/**',start+30);const body=server.slice(start,end>start?end:undefined);
if(!body.includes('const userId = requireKnownMoaruUser_(p.user_id);'))throw new Error('shop purchase no longer revalidates registered-user membership');
if(body.includes('requireKnownMoaruUserCached_(p.user_id)'))throw new Error('shop purchase still trusts 6-hour known-user cache');
if(!body.includes('findRewardUserForShop_(userId)'))throw new Error('shop purchase reward-account fast lookup missing');
console.log('SHOP_PURCHASE_REGISTRATION_GUARD_OK');
