const fs=require('fs');
const rt=fs.readFileSync('js/adapters/realtime.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(rt.includes('String(member.status||"")==="invited"'),'pending invite must require explicit invited status');
ok(!rt.includes('Number(member.invitedAt||0)>0&&!Number(member.acceptedAt||0)'),'legacy invitedAt heuristic must not return');
ok(rt.includes('attachMemberSummary(roomId,{...value,status:"member",legacy:true})'),'status-less legacy membership must be preserved');
ok(rt.includes('status:"invited"'),'new invitations must carry explicit invited status');
console.log('LEGACY_MEMBERSHIP_PRESERVATION_OK');
