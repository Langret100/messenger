const fs=require('fs');
const server=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8');
const admin=fs.readFileSync('js/features/admin.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
const fn=server.slice(server.indexOf('function handleAdminCoinReward(e)'),server.indexOf('/** 10초 응답 제한'));
ok(fn.includes('.sort().slice(0, 200)'),'server targets must be canonicalized');
ok(admin.includes('filter(Boolean))].sort();'),'client targets must be canonicalized');
ok(fn.includes('beforeCoins: beforeCoins')&&fn.includes('expectedCoins: expectedCoins'),'committing receipt must persist compact before/expected states');
ok(fn.includes('alreadyApplied')&&fn.includes('notApplied'),'retry must distinguish already-applied from not-applied');
ok(fn.includes('recovered: true'),'already-applied retry must recover without paying again');
ok(fn.includes('COIN_REQUEST_STATE_CONFLICT'),'ambiguous retry must fail closed instead of paying again');
ok(server.includes('function moaruAdminCoinReceiptResult_')&&fn.includes('newCoins: rewarded.map'),'done receipt must stay compact for large target sets');
ok(!fn.includes('targetStates: states'),'large object-style target state receipt must not return');
console.log('ADMIN_COIN_RETRY_IDEMPOTENCY_GUARD_OK');
