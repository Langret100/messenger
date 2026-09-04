const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),ok=(v,m)=>{if(!v)throw new Error(m)};
const auth=read('js/adapters/auth-api.js'),shop=read('js/features/shopping.js'),store=read('js/shopping/store-service.js'),server=read('docs/apps-script/coin-shopping-extension.gs'),route=read('docs/apps-script/Code.gs'),html=read('index.html');
ok(auth.includes('totalBudgetMs = Math.min(7000')&&auth.includes('deadline = Date.now() + totalBudgetMs'),'interactive server wait is not capped to 7 seconds total');
ok(!auth.includes('45000')&&!auth.includes('35000'),'long interactive timeout remains');
ok(auth.includes('shopRequestDeliveryBulk')&&store.includes('requestDeliveryBulk')&&shop.includes('묶음배송'),'bulk delivery client flow missing');
ok(route.includes('case "shop_request_delivery_bulk"')&&server.includes('function handleShopRequestDeliveryBulk(e)'),'bulk delivery server route missing');
ok(server.includes('slice(0, 20)')&&server.includes('부분 묶음배송')&&server.includes('Spreadsheet 쓰기도 1회'),'customer bulk delivery is not bounded/atomic/single-write');
ok(shop.includes('admin-delivery-user-group')&&shop.includes('groupRows.forEach'),'admin delivery requests are not grouped by requester');
for(const asset of ['js/adapters/auth-api.js','js/shopping/store-service.js','js/features/shopping.js','js/features/admin.js'])ok(html.includes(asset+'?v='),'cache-bust missing '+asset);
console.log('ADMIN_SHOPPING_BULK_DELIVERY_REGRESSION_OK');

ok(auth.includes('shopDeliveryCompleteBulk')&&route.includes('shop_delivery_complete_bulk')&&server.includes('handleShopDeliveryCompleteBulk')&&shop.includes('shopDeliveryCompleteBulk'),'admin bulk completion is not a single batched request');
