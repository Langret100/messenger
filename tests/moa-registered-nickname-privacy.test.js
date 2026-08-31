const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
let loginReads=0,cacheReads=0;
const cacheMap=new Map(),cache={get:k=>{cacheReads++;return cacheMap.get(k)||null},put:(k,v)=>cacheMap.set(k,String(v))};
const login={getLastRow:()=>4,getRange:(r,c,n,w)=>{ok(c===4&&w===1,'MOA read non-nickname login columns');loginReads++;return {getValues:()=>[['BlueDragon123'],['홍길동'],['친구별명']]}}};
const ss={getSheetByName:n=>n==='로그인'?login:null};
const ctx={console,Date,Math,JSON,CacheService:{getScriptCache:()=>cache},SpreadsheetApp:{getActiveSpreadsheet:()=>ss}};
vm.createContext(ctx);vm.runInContext(src,ctx);
let names=ctx.moaRegisteredNicknames_();
ok(names.includes('BlueDragon123')&&names.includes('홍길동'),'registered nicknames not loaded for privacy scrub');
ok(loginReads===1,'login nickname column was read unexpectedly often');
names=ctx.moaRegisteredNicknames_();ok(loginReads===1&&cacheReads>=2,'registered nickname cache not reused');
const scrub=ctx.moaAnonymizeChatText_('BlueDragon123 오늘 뭐함?',names);
ok(!scrub.includes('BlueDragon123'),'registered nickname leaked through public learning scrub');
console.log('MOA_REGISTERED_NICKNAME_PRIVACY_OK');

// Regression: privacy filtering must not stop after the first 80 registered names.
const manyNames=Array.from({length:120},(_,i)=>`학생닉네임${String(i).padStart(3,'0')}`);
const lateName=manyNames[119];
const scrubbed=ctx.moaAnonymizeChatText_(`${lateName} 오늘 숙제 했어?`,manyNames.slice().sort((a,b)=>b.length-a.length));
ok(!scrubbed.includes(lateName)&&scrubbed.includes('[사람]'),'registered nickname after index 80 was not anonymized');

// Signup must invalidate the MOA nickname cache immediately, not wait up to 10 minutes.
const code=fs.readFileSync('docs/apps-script/Code.gs','utf8');
ok(code.includes('remove("moa.registered.nicknames.v1")'),'signup does not invalidate legacy MOA nickname cache');
ok(code.includes('moa.registered.nicknames.v2.m')&&code.includes('moa.registered.nicknames.v2.p'),'signup does not invalidate chunked MOA nickname cache');
console.log('MOA_REGISTERED_NICKNAME_SCALE_INVALIDATION_OK');

// The privacy directory itself must not silently truncate after 6,000 registered users.
{
  const bigNames=Array.from({length:6505},(_,i)=>`등록닉${String(i).padStart(5,'0')}`);
  let bigReads=0;
  const bigCacheMap=new Map(),bigCache={get:k=>bigCacheMap.get(k)||null,put:(k,v)=>bigCacheMap.set(k,String(v)),getAll:ks=>Object.fromEntries(ks.filter(k=>bigCacheMap.has(k)).map(k=>[k,bigCacheMap.get(k)]))};
  const bigLogin={getLastRow:()=>bigNames.length+1,getRange:(r,c,n,w)=>{ok(c===4&&w===1,'large privacy directory read non-nickname columns');bigReads++;return {getValues:()=>bigNames.map(n=>[n])}}};
  const bigCtx={console,Date,Math,JSON,CacheService:{getScriptCache:()=>bigCache},SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>n==='로그인'?bigLogin:null})}};
  vm.createContext(bigCtx);vm.runInContext(src,bigCtx);
  const loaded=bigCtx.moaRegisteredNicknames_();
  ok(loaded.length===6505&&loaded.includes(bigNames[6504]),'registered nickname privacy directory truncated above 6000');
  const known=bigCtx.moaKnownChatNames_([]);
  ok(known.length===6505&&known.includes(bigNames[6504]),'known nickname privacy list truncated above 6200');
}
console.log('MOA_REGISTERED_NICKNAME_UNBOUNDED_OK');
