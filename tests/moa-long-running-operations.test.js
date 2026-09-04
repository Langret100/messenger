const fs=require('fs'),vm=require('vm');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

// Long-running deployments can have hundreds/thousands of rooms. Learning cursors must
// not be packed into one Apps Script property value (per-value quota risk).
const props={};
let setPropertiesCalls=0,setPropertyCalls=0;const propApi={getProperty:k=>props[k]||'',getProperties:()=>({...props}),setProperty:(k,v)=>{setPropertyCalls++;props[k]=String(v)},setProperties:(obj)=>{setPropertiesCalls++;Object.entries(obj||{}).forEach(([k,v])=>{props[k]=String(v)})},deleteProperty:k=>{delete props[k]}};
const ctx={console,Date,Math,JSON,PropertiesService:{getScriptProperties:()=>propApi}};
vm.createContext(ctx);vm.runInContext(gs,ctx);
const state={__lastRun:123,__sourceCursor:7};for(let i=0;i<5000;i++)state[`r:sheet:${i.toString(36).padStart(4,'0')}`]=1000+i;
ctx.moaSaveChatLearnState_(state);
ok(setPropertiesCalls===1&&setPropertyCalls===0,`learning cursor save used ${setPropertiesCalls} batched / ${setPropertyCalls} individual property writes`);
ok(!props.MOA_CHAT_LEARN_STATE_V1,'legacy monolithic cursor property was retained');
const shardKeys=Object.keys(props).filter(k=>k.startsWith('MOA_CHAT_LEARN_STATE_V2_'));
ok(shardKeys.length>8&&shardKeys.length<=32,'learning state was not expanded across bounded shards');
for(const k of shardKeys)ok(props[k].length<9000,`state shard too large: ${k}=${props[k].length}`);
const restored=ctx.moaChatLearnState_();
ok(restored.__lastRun===123&&restored['r:sheet:0000']===1000&&Object.keys(restored).length===5002,'sharded cursor state did not round-trip');
console.log('MOA_SHARDED_CURSOR_5000_OK');

// Public snapshots can exceed CacheService's single-item size. Verify chunked caching
// round-trips a payload far beyond one item without sheet rereads being required.
const cacheMap=new Map();
const cache={get:k=>cacheMap.get(k)||null,put:(k,v)=>cacheMap.set(k,String(v)),getAll:keys=>Object.fromEntries(keys.filter(k=>cacheMap.has(k)).map(k=>[k,cacheMap.get(k)]))};
const large={patterns:Array.from({length:1400},(_,i)=>({id:`h${i}`,trigger:`오늘 학교에서 있었던 이야기 ${i} `.repeat(2),reply:`응 그랬구나 자연스럽게 이어가는 답변 ${i} `.repeat(2)}))};
ok(ctx.moaCachePutLargeJson_(cache,'pub',large,300)===true,'large public snapshot chunk write failed');
ok(Number(JSON.parse(cacheMap.get('pub.m')).parts)>1,'large snapshot was not chunked');
const round=ctx.moaCacheGetLargeJson_(cache,'pub');
ok(round?.patterns?.length===1400&&round.patterns[1399].id==='h1399','chunked public snapshot did not round-trip');
console.log('MOA_V5_CHUNKED_SERVER_SNAPSHOT_OK');

// Live corpus must never be exposed while the staged relearn is being published.
ctx.moaSetLanguagePublishing_(true,60000);
ok(ctx.moaLanguagePublishing_()===true,'publishing guard did not activate');
ctx.jsonResponse_=x=>x;
const busy=ctx.moaSync_({known_version:0,known_core_version:0});
ok(busy.ok===false&&busy.error==='MOA_SYNC_PUBLISHING','sync did not reject a partial publish window');
ctx.moaSetLanguagePublishing_(false);
ok(ctx.moaLanguagePublishing_()===false,'publishing guard did not clear');
console.log('MOA_V5_RELEARN_PUBLISH_GUARD_OK');

// Scheduled social cleanup must learn in bounded chunks and preserve source rows until caught up.
ok(gs.includes('var batchNow=Math.min(pending,1000)'),'global cleanup learning is not bounded');
ok(gs.includes('preserve:!complete'),'global cleanup can delete source rows before bounded learning catches up');
console.log('MOA_V5_BOUNDED_CLEANUP_LEARNING_OK');

// Common corpus is truly common on-device: one IndexedDB copy, while personal scores remain per-user.
ok(engine.includes('PUBLIC_PATTERN_CACHE_KEY="__public__"'),'shared public corpus cache key missing');
ok(engine.includes('ensureCachedLearningReady'),'first-reply cache readiness helper missing');
ok(/async function reply\(raw\)[\s\S]{0,180}await ensureCachedLearningReady\(\)/.test(engine),'first reply can race past existing learned cache');
ok(engine.includes('personalLearningByUser = new Map()'),'personal learning isolation was removed');
console.log('MOA_V5_FIRST_REPLY_SHARED_CACHE_OK');

ok(sw.includes('moaru-runtime-bundle-'),'service worker namespace was not advanced for V5');
console.log('MOA_V5_OFFLINE_VERSION_OK');
