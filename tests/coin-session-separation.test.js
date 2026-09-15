const fs=require('fs');
const auth=fs.readFileSync('js/features/auth.js','utf8');
const wallet=fs.readFileSync('js/economy/coin-wallet.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(auth.includes('({coin,...identity})=>identity'),'auth session must strip coin from persisted identity');
ok(auth.includes('Object.prototype.hasOwnProperty.call(stored,"coin")'),'legacy session coin must be migrated away');
ok(wallet.includes('"확인 중…"'),'unknown coin balance must not be presented as zero');
ok(wallet.includes('throw error;'),'wallet must preserve unknown state when no confirmed snapshot exists');
console.log('COIN_SESSION_SEPARATION_OK');
