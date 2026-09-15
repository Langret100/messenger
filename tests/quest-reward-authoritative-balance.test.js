const fs=require('fs'),assert=require('assert');
const client=fs.readFileSync('js/economy/quest-reward.js','utf8');
const server=fs.readFileSync('docs/apps-script/coin.gs','utf8');
assert(/const serverCoin = Number\(result\.newCoin\)/.test(client),'daily reward must use transaction newCoin directly');
assert(/setLocal\(serverCoin, "daily-quest-reward"\)/.test(client),'daily reward must immediately publish confirmed balance');
assert(/reason: "ALREADY_REWARDED",\s*newCoin:/.test(server),'duplicate reward response must still return authoritative balance');
console.log('QUEST_REWARD_AUTHORITATIVE_BALANCE_OK');
