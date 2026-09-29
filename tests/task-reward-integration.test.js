const fs=require('fs');
const auth=fs.readFileSync('js/adapters/auth-api.js','utf8');
const runtime=fs.readFileSync('js/economy/runtime.js','utf8');
const task=fs.readFileSync('js/tasks/task-service.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(auth.includes('economyEnsureUser(userId)'),'AuthApi economyEnsureUser missing');
ok(auth.includes('mode: "economy_ensure_user"'),'economy_ensure_user route missing');
ok(runtime.includes('async function ensureRegisteredRewardAccount(id)'),'runtime account ensure helper missing');
ok(runtime.includes('MiniTalk.AuthApi.economyEnsureUser(id)'),'runtime does not use ensure API');
ok(task.includes('rewardType:"ADMIN_TASK"'),'task reward route missing');
ok(task.includes('!reward.applied&&!reward.duplicate'),'task completion does not verify reward result');
console.log('TASK_REWARD_INTEGRATION_OK');
