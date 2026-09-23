const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const runtime=fs.readFileSync(path.join(root,'js/economy/runtime.js'),'utf8');
const service=fs.readFileSync(path.join(root,'js/shopping/store-service.js'),'utf8');
const shopping=fs.readFileSync(path.join(root,'js/features/shopping.js'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(runtime.includes('ownerNickname=""'),'runtime delivery request does not accept owner nickname');
ok(runtime.includes('{ownerNickname:nick}'),'runtime does not persist owner nickname into Firebase inventory');
ok(service.includes('ownerNickname:current.nickname||current.username||""'),'client does not send requester nickname with delivery request');
ok(shopping.includes('all?.({includeSelf:true})'),'admin delivery nickname lookup still excludes the current signed-in user');
ok(shopping.includes('row.nickname||row.ownerNickname||people.get(owner)?.nickname'),'admin delivery does not prefer nickname fields before owner id');
console.log('DELIVERY_NICKNAME_OK');
