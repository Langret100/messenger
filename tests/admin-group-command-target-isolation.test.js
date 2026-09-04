const fs=require('fs');
const s=fs.readFileSync('js/features/admin.js','utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(s.includes('const openGroupCommand=(groupName,targetIds)=>'),'group command opener missing');
ok(s.includes('const targets=[...new Set((targetIds||[]).map(String)'), 'group target snapshot missing');
ok(s.includes('executeAdminCommand({targets,type:gType.value'),'group modal not using its own target snapshot');
ok(!s.includes('관리자 작업 대상으로 선택했습니다.'),'legacy target-selection toast remains');
ok(!s.includes('그룹 작업'),'legacy group-work label remains');
console.log('ADMIN_GROUP_COMMAND_TARGET_ISOLATION_OK');
