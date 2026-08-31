const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const rt=read('js/adapters/realtime.js'),service=read('js/shopping/store-service.js');
const ok=(v,m)=>{if(!v)throw new Error(m)};
ok(rt.includes('if(String(user?.user_id||"")!==String(ownerId||""))return null;'),'addShopInventory must re-check owner after awaitTransport');
ok(rt.includes('async function removeShopInventory(id,ownerId)'),'removeShopInventory owner guard missing');
ok(rt.includes('if(!expectedOwner||String(user?.user_id||"")!==expectedOwner)return false;'),'removeShopInventory must re-check owner after awaitTransport');
ok(rt.includes('`${MiniTalkConfig.paths.shopInventory}/${expectedOwner}/${id}`'),'removeShopInventory must write captured owner path');
ok(service.includes('removeShopInventory?.(id,current.user_id)'),'gift must pass captured owner to realtime cleanup');

const addOwner=rt.indexOf('if(String(user?.user_id||"")!==String(ownerId||""))return null;'),addWritable=rt.indexOf('requireWritableUser();',rt.indexOf('async function addShopInventory'));
ok(addOwner>0&&addOwner<addWritable,'owner check must precede writable-user guard after transport');
const remStart=rt.indexOf('async function removeShopInventory(id,ownerId)'),remOwner=rt.indexOf('if(!expectedOwner||String(user?.user_id||"")!==expectedOwner)return false;',remStart),remGuest=rt.indexOf('if(user?.isGuest)throw new Error',remStart);
ok(remOwner>remStart&&remOwner<remGuest,'remove owner check must precede guest guard after transport');
console.log('SHOPPING_REALTIME_OWNER_RACE_OK');
