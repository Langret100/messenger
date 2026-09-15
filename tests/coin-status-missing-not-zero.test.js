const fs=require('fs');
const coin=fs.readFileSync('docs/apps-script/coin.gs','utf8');
const api=fs.readFileSync('js/adapters/auth-api.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(coin.includes('error: "NO_REWARD_USER"'),'missing reward account must be an error, not zero coin');
ok(coin.includes('error: "INVALID_REWARD_COIN"'),'invalid reward coin must be distinguishable from real zero');
ok(api.includes('error.code = "INVALID_COIN_STATUS"'),'client must reject malformed coin status');
ok(!api.includes('return data.coin ?? data.balance ?? 0;'),'client must not coerce missing coin status to zero');
console.log('COIN_STATUS_MISSING_NOT_ZERO_OK');
