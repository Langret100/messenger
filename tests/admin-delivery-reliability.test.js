const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),ok=(v,m)=>{if(!v)throw new Error(m)};
const server=read('docs/apps-script/coin-shopping-extension.gs'),code=read('docs/apps-script/Code.gs'),auth=read('js/adapters/auth-api.js'),shopping=read('js/features/shopping.js'),windowMode=read('js/adapters/window-mode.js'),tools=read('js/features/tools.js');
ok(server.includes('SHOP_ADMIN_SESSION_PROPERTY_PREFIX')&&server.includes('writeShopAdminSession_')&&server.includes('PropertiesService.getScriptProperties().setProperty(shopAdminSessionPropertyKey_(value), raw)'), 'admin session is still cache-only');
ok(server.includes('raw = props.getProperty(propKey)')&&server.includes('cache.put(cacheKey, JSON.stringify(session), seconds)'), 'durable admin session fallback/reheat missing');
ok(server.includes('requireKnownMoaruUserFast_')&&code.includes('rememberKnownMoaruUser_(rowUserId)')&&code.includes('rememberKnownMoaruUser_(userId)'), 'login-known-user fast path missing');
ok(server.includes('findShopInventoryItemFresh_')&&server.includes('writeShopInventoryItem_(ownerId, item, found.row)'), 'delivery mutation still scans full owner inventory');
ok(auth.includes('timeoutError.code = "REQUEST_TIMEOUT"')&&auth.includes('SHOP_MANAGER_PERMISSION_REQUIRED'), 'client timeout/auth diagnostics missing');
ok(shopping.includes('String(result?.deliveryStatus || "") !== kind')&&shopping.includes('MiniTalk.AdminSession.clear?.()'), 'delivery confirmation/session-expiry UI missing');
ok(!windowMode.includes('window.resizeTo('), 'messenger runtime resizeTo regression');
ok(tools.includes('allowInteractive'), 'tools real drag fix missing');

// Verify a manager session survives CacheService eviction through ScriptProperties.
const props=new Map(),cache=new Map();
const scriptProps={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>{props.set(k,String(v));return scriptProps},deleteProperty:k=>props.delete(k),getProperties:()=>Object.fromEntries(props)};
const ctx={console,Date,Math,JSON,String,Number,Object,Array,CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>{cache.set(k,String(v))},remove:k=>cache.delete(k)})},PropertiesService:{getScriptProperties:()=>scriptProps},Utilities:{getUuid:(()=>{let n=0;return()=>`uuid-${++n}`})()},ContentService:{MimeType:{JSON:'json'},createTextOutput:v=>({value:v,setMimeType(){return this}})}};
vm.createContext(ctx);vm.runInContext(server,ctx,{filename:'coin-shopping-extension.gs'});
ctx.requireKnownMoaruUserFast_=id=>String(id||'');
props.set('MINITALK_SHOP_MANAGER_CODE','shop-secret');
let unlock=JSON.parse(ctx.handleAdminUnlock({parameter:{user_id:'manager',admin_code:'shop-secret'}}).value);
ok(unlock.ok&&unlock.role==='SHOP_MANAGER'&&unlock.admin_token,'shop manager unlock failed');
cache.clear();
let authResult=ctx.requireShopManagerToken_('manager',unlock.admin_token);
ok(authResult.ok&&authResult.role==='SHOP_MANAGER','manager token did not survive cache eviction');
console.log('V100_ADMIN_DELIVERY_RELIABILITY_OK');
