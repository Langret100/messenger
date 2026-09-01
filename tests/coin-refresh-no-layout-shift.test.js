const fs=require('fs'),assert=require('assert');
const admin=fs.readFileSync('js/features/admin.js','utf8');
const wallet=fs.readFileSync('js/economy/coin-wallet.js','utf8');
assert(!/refreshBalances=async\(force=true\)=>\{coinRefresh\.disabled=true/.test(admin),'admin coin refresh must not toggle disabled');
assert(/coinRefresh\.dataset\.refreshing===?"1"/.test(admin)||/coinRefresh\.dataset\.refreshing==="1"/.test(admin),'admin refresh needs silent in-flight guard');
assert(/applyBalances\(\)/.test(admin),'admin refresh must patch coin values');
assert(!/onclick:[\s\S]{0,300}button\.disabled\s*=\s*true/.test(wallet),'coin wallet refresh click must not toggle disabled');
console.log('COIN_REFRESH_NO_LAYOUT_SHIFT_OK');
