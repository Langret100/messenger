const fs=require("fs"),path=require("path");
const root=path.join(__dirname,"..");
const admin=fs.readFileSync(path.join(root,"js/features/admin.js"),"utf8");
function ok(v,m){if(!v)throw new Error(m)}
ok(admin.includes("GROUP_CACHE_TTL_MS=30*24*60*60*1000"),"admin group cache TTL missing");
ok(admin.includes("lastUsedAt:Date.now(),groups"),"group cache does not refresh only on group mutation/use");
ok(admin.includes("30일 동안 사용하지 않으면 자동 삭제"),"group cache expiry UI note missing");

ok(admin.includes('const userId=String(person.user_id);check.checked=selected.has(userId)'),"group/user selection id normalization missing");
ok(admin.includes('selected.add(String(person.user_id))'),"select-all id normalization missing");
console.log("ADMIN_GROUP_CACHE_EXPIRY_OK");
