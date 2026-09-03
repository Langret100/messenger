const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..'),code=fs.readFileSync(path.join(root,'docs/apps-script/coin.gs'),'utf8');
if(!code.includes('QUEST_REWARD_KEY_OUTDATED')||!code.includes('/^(\\d{4}-\\d{2}-\\d{2}):(math|korean)$/')||!code.includes('legacyQuestReward'))throw new Error('daily quest reward key server guard missing');
console.log('DAILY_QUEST_REWARD_SERVER_KEY_GUARD_OK');
