const fs=require('fs');
const coin=fs.readFileSync('docs/apps-script/coin.gs','utf8');
const shop=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(coin.includes('function findRewardUserRow_'),'canonical reward-row finder missing');
ok(shop.includes('if (userId && result[userId] === undefined)'),'admin balance map must keep first matching reward row');
ok(shop.includes('if (id && rowByUser[id] === undefined) rowByUser[id] = index'),'admin bulk reward must keep first matching reward row');
ok(shop.includes('위에서부터 첫 번째 일치 행만 사용합니다'),'shopping lookup must share canonical first-row policy');
console.log('COIN_CANONICAL_ROW_CONSISTENCY_OK');
