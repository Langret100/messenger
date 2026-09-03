const fs=require('fs');
const wallet=fs.readFileSync('js/economy/coin-wallet.js','utf8');
const html=fs.readFileSync('index.html','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(wallet.includes('if (cached) {'),'cached balance is not restored immediately');
ok(wallet.includes('syncConnectedBadges(cachedValue)'),'cached balance does not update visible badges immediately');
ok(wallet.includes('return startServerRefresh(user, cached)'),'server refresh must still run after cache restore');
ok(html.includes('js/economy/coin-wallet.js?v=64.5.12'),'coin wallet cache bust missing');
console.log('COIN_LOGIN_CACHE_IMMEDIATE_OK');
