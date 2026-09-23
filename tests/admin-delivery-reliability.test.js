const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),ok=(v,m)=>{if(!v)throw new Error(m)};
const server=read('docs/apps-script/coin-shopping-extension.gs'),code=read('docs/apps-script/Code.gs'),auth=read('js/adapters/auth-api.js'),shopping=read('js/features/shopping.js'),windowMode=read('js/adapters/window-mode.js'),tools=read('js/features/tools.js');

// 관리자/쇼핑몰 관리자 권한은 계정이나 서버 세션 저장소가 아니라 페이지 비밀번호로 발급한
// 서명된 역할 토큰에만 묶여야 한다. 인증 critical path에서 시트/세션 저장 I/O를 다시 넣지 않는다.
ok(server.includes('MINITALK_ADMIN_TOKEN_V3')&&server.includes('shopAdminTokenEncode_')&&server.includes('shopAdminTokenDecode_')&&server.includes('computeHmacSha256Signature'), 'stateless signed admin token missing');
ok(!server.includes('writeShopAdminSession_')&&!server.includes('SHOP_ADMIN_SESSION_PROPERTY_PREFIX')&&!server.includes('shopAdminSessionPropertyKey_'), 'admin auth still persists account/session state');
ok(/function handleAdminUnlock\(e\)[\s\S]{0,900}shopAdminTokenEncode_\(role\)/.test(server), 'admin unlock does not issue role token directly');
ok(!/function handleAdminUnlock\(e\)[\s\S]{0,900}(LOGIN_SHEET|getSheet_|requireKnownMoaruUser|writeShopAdminSession_)/.test(server), 'admin unlock still performs account/sheet/session I/O');
ok(server.includes('requireKnownMoaruUserFast_')&&code.includes('rememberKnownMoaruUser_(rowUserId)')&&code.includes('rememberKnownMoaruUser_(userId)'), 'login-known-user fast path missing');
ok(server.includes('findShopInventoryItemFresh_')&&server.includes('writeShopInventoryItem_(ownerId, item, found.row)'), 'delivery mutation still scans full owner inventory');
ok(auth.includes('error.code = "REQUEST_TIMEOUT"')&&auth.includes('SHOP_MANAGER_PERMISSION_REQUIRED')&&auth.includes('deadline = Date.now() + totalBudgetMs')&&/shop_delivery_complete[\s\S]{0,220}10000/.test(auth), 'client timeout/auth diagnostics missing');
ok(shopping.includes('String(result?.deliveryStatus || "") !== kind')&&shopping.includes('MiniTalk.AdminSession.clear?.()'), 'delivery confirmation/session-expiry UI missing');
ok(!windowMode.includes('window.resizeTo('), 'messenger runtime resizeTo regression');
ok(tools.includes('allowInteractive'), 'tools real drag fix missing');

// 역할 토큰은 CacheService나 ScriptProperties에 관리자 세션을 저장하지 않아도 유효해야 하며,
// 특정 로그인 user_id에 귀속되지 않아야 한다.
const props=new Map(),cache=new Map();
let propWrites=0;
const scriptProps={
  getProperty:k=>props.get(k)||null,
  setProperty:(k,v)=>{propWrites++;props.set(k,String(v));return scriptProps},
  deleteProperty:k=>props.delete(k),
  getProperties:()=>Object.fromEntries(props)
};
const toBuf=v=>Buffer.isBuffer(v)?v:Buffer.from(Array.isArray(v)?v:String(v),'utf8');
const b64url=v=>toBuf(v).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const fromB64url=s=>Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(String(s).length/4)*4,'='),'base64');
const ctx={console,Date,Math,JSON,String,Number,Object,Array,
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>{cache.set(k,String(v))},remove:k=>cache.delete(k)})},
  PropertiesService:{getScriptProperties:()=>scriptProps},
  Utilities:{
    Charset:{UTF_8:'UTF-8'},
    getUuid:(()=>{let n=0;return()=>`uuid-${++n}`})(),
    computeHmacSha256Signature:(data,key)=>Array.from(crypto.createHmac('sha256',String(key)).update(String(data)).digest()),
    base64EncodeWebSafe:v=>b64url(v),
    base64DecodeWebSafe:s=>Array.from(fromB64url(s)),
    newBlob:v=>({getDataAsString:()=>toBuf(v).toString('utf8'),getBytes:()=>Array.from(toBuf(v))})
  },
  ContentService:{MimeType:{JSON:'json'},createTextOutput:v=>({value:v,setMimeType(){return this}})}
};
vm.createContext(ctx);vm.runInContext(server,ctx,{filename:'coin-shopping-extension.gs'});
props.set('MINITALK_ADMIN_CODE','admin-secret');
props.set('MINITALK_SHOP_MANAGER_CODE','shop-secret');
const writesBefore=propWrites;
let unlock=JSON.parse(ctx.handleAdminUnlock({parameter:{user_id:'any-login-user',admin_code:'shop-secret'}}).value);
ok(unlock.ok&&unlock.role==='SHOP_MANAGER'&&unlock.admin_token,'shop manager unlock failed');
ok(propWrites===writesBefore,'admin unlock wrote server-side session state');
cache.clear();
let authResult=ctx.requireShopManagerToken_('different-login-user',unlock.admin_token);
ok(authResult.ok&&authResult.role==='SHOP_MANAGER','role token incorrectly depends on cache or login user id');
const tampered=unlock.admin_token.slice(0,-1)+(unlock.admin_token.endsWith('A')?'B':'A');
ok(!ctx.requireShopManagerToken_('different-login-user',tampered).ok,'tampered admin token accepted');
console.log('V101_ADMIN_DELIVERY_STATELESS_AUTH_OK');
