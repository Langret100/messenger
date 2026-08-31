const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const server=fs.readFileSync(path.join(root,'docs/apps-script/coin-shopping-extension.gs'),'utf8');
const service=fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'js/features/shopping.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/shopping-store.css'),'utf8');
const auth=fs.readFileSync(path.join(root,'js/adapters/auth-api.js'),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(server.includes('SHOP_RANDOM_PURCHASE_PRICE = 3'),'random price must be 3');
ok(server.includes('return 1 / value')&&server.includes('Math.random() < 0.70'),'70/30 grouped inverse-price weights missing');
ok(server.includes('setRewardCoinForShopGuarded_(reward, beforeCoin - chargePrice)'),'server coin deduction missing');
ok(/createFreshPurchasedInventory_\(userId, inventoryProduct, purchaseKey(?:,|\))/.test(server),'server inventory award missing');
ok(auth.includes('random_purchase: randomPurchase ? "1" : ""'),'random flag missing');
ok(service.includes('MiniTalk.AuthApi.shopPurchase({userId:current.user_id,product:null,purchaseKey,randomPurchase:true,price:3})'),'client random purchase API missing');
ok(ui.includes('text: "랜덤구매"')&&!ui.includes('text: "미니 상점"'),'mini shop hero was not replaced');
ok(!ui.includes('다시 눌러!')&&ui.includes('state.fastRequested=true')&&ui.includes('한 번 더 누르면 바로 뽑아요'),'second tap must fast-finish the same one-shot purchase');
ok(ui.includes('const cachedBalance=Number(MiniTalk.Economy.CoinWallet.value?.()||0)')&&ui.includes('MiniTalk.Economy.CoinWallet.refresh(true).then'),'instant-open balance check missing');
ok(ui.includes('setTimeout(movePrizeToInventory,1100)')&&ui.includes('inventoryOpen=true'),'automatic result-to-inventory close flow missing');
ok(ui.includes('if(state.phase==="insufficient"||state.phase==="error"){closeRandomOverlay();return;}'),'insufficient/error tap-to-close path missing');
ok(ui.includes('inventoryOpen=true')&&ui.includes('randomArrivalId'),'result-to-inventory transition missing');
ok(css.includes('@keyframes shop-random-confetti')&&css.includes('@keyframes shop-random-win-pop'),'celebration animation missing');
function weight(price){return 1/Math.max(1,Number(price)||1)}
function pickGroup(rows,r){let total=rows.reduce((s,p)=>s+weight(p.price),0),cursor=r*total;for(const p of rows){cursor-=weight(p.price);if(cursor<=0)return p}return rows.at(-1)}
function pick(rows,rGroup,rItem){const low=rows.filter(p=>p.price>=1&&p.price<=3),high=rows.filter(p=>p.price>=4);const group=!low.length?high:!high.length?low:(rGroup<.70?low:high);return pickGroup(group,rItem)}
const rows=[{id:'p1',price:1},{id:'p2',price:2},{id:'p3',price:3},{id:'p4',price:4},{id:'p8',price:8}],counts={p1:0,p2:0,p3:0,p4:0,p8:0};
let seed=0x12345678; const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296};
for(let i=0;i<200000;i++)counts[pick(rows,rand(),rand()).id]++;
const lowCount=counts.p1+counts.p2+counts.p3,highCount=counts.p4+counts.p8,total=lowCount+highCount,lowRatio=lowCount/total,highRatio=highCount/total;
ok(lowRatio>.692&&lowRatio<.708&&highRatio>.292&&highRatio<.308,`70/30 group split broken ${JSON.stringify({counts,lowRatio,highRatio})}`);
ok(counts.p1>counts.p2&&counts.p2>counts.p3,`1~3 inverse-price order broken ${JSON.stringify(counts)}`);
ok(counts.p4>counts.p8,`4+ inverse-price order broken ${JSON.stringify(counts)}`);
const onlyLow=[{id:'a',price:1},{id:'b',price:3}],onlyHigh=[{id:'c',price:4},{id:'d',price:9}];
for(let i=0;i<1000;i++){ok(['a','b'].includes(pick(onlyLow,rand(),rand()).id),'low-only fallback broken');ok(['c','d'].includes(pick(onlyHigh,rand(),rand()).id),'high-only fallback broken')}
console.log('SHOPPING_RANDOM_PURCHASE_OK',JSON.stringify({counts,lowRatio,highRatio}));
