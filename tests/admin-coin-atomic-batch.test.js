const fs=require('fs');const server=fs.readFileSync('docs/apps-script/coin-shopping-extension.gs','utf8'),route=fs.readFileSync('docs/apps-script/Code.gs','utf8'),api=fs.readFileSync('js/adapters/auth-api.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
const fn=server.slice(server.indexOf('function handleAdminCoinReward(e)'),server.indexOf('/** POST mode=user_commands:'));
ok(fn.includes('.setValues(values.map'),'admin coin must batch-write balances');
ok(!fn.includes('moaruAdminCoinChangeGuarded_(target, amount)'),'admin coin still applies users one by one');
ok(fn.includes('status: "done"')&&server.includes('function handleAdminCoinRewardStatus(e)'),'request receipt/status reconciliation missing');
ok(route.includes('case "admin_coin_reward_status"'),'status route missing');
ok(api.includes('mode: "admin_coin_reward_status"')&&api.includes('error?.code !== "REQUEST_TIMEOUT"'),'client timeout reconciliation missing');
console.log('ADMIN_COIN_ATOMIC_BATCH_OK');
