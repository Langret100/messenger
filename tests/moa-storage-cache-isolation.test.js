const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const auth=fs.readFileSync('js/adapters/auth-api.js','utf8');
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const index=fs.readFileSync('index.html','utf8');

// Cross-feature storage isolation: large learned corpus must live in IndexedDB, not shared localStorage.
ok(engine.includes('MiniTalk.DataCache?.get?.("moa-learning-patterns"'),'learned corpus DataCache read missing');
ok(engine.includes('MiniTalk.DataCache.put("moa-learning-patterns"'),'learned corpus DataCache write missing');
ok(engine.includes('patterns.slice(0,1400)')||engine.includes('return out.slice(0,1400)'),'learned corpus bound missing');
console.log('MOA_V4_INDEXEDDB_CORPUS_OK');

// An intentionally empty newest corpus is authoritative: do not resurrect older learned patterns.
ok(engine.includes('if(Array.isArray(shared))return shared'),'empty shared IndexedDB corpus is not treated as authoritative');
ok(engine.includes('if(Array.isArray(value)){legacy=value;break}'),'empty newest legacy corpus can fall through to stale older versions');
ok(/for\(const v of \[91,90,89,88,87\]\)premove\(`moa\.v\$\{v\}\.patterns\.\$\{key\}`\)/.test(engine),'fallback cache write does not clear stale older corpus versions');
console.log('MOA_EMPTY_CORPUS_STALE_RESURRECTION_GUARD_OK');

// MOA admin learning gets a longer timeout without globally slowing every other feature request.
ok(auth.includes('async function post(payload, timeoutMs = 20000)'),'per-request timeout support missing');
ok(/moa_admin_learn_chats[\s\S]{0,260}\}, 45000\)/.test(auth),'MOA admin learning dedicated timeout missing');
ok(auth.includes('const data = await post({ mode: "admin_task_list", user_id: userId, admin_token: adminToken });'),'other admin features no longer use default post path');
console.log('MOA_V4_TIMEOUT_ISOLATION_OK');

// Learned-human replies pass the same anti-repetition/intrusive-question quality gate as built-ins.
ok(engine.includes('gateSource.startsWith("local")||gateSource==="learned-human"'),'learned-human quality gate missing');
console.log('MOA_V4_LEARNED_REPLY_QUALITY_GATE_OK');

// Human-language-only delta must not reread policy/expression/base examples when the core version is unchanged.
const ctx={console,Date,Math,JSON,PropertiesService:{getScriptProperties:()=>({getProperty:()=>'',setProperty:()=>{}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')},jsonResponse_:x=>x};
vm.createContext(ctx);vm.runInContext(gs,ctx);
let policyReads=0,exprReads=0,exampleReads=0,deltaReads=0;
ctx.moaCurrentSyncVersion_=()=>20;ctx.moaCurrentCoreSyncVersion_=()=>10;
ctx.moaPublicPolicy_=()=>{policyReads++;return {}};ctx.moaPublicExpressionWeights_=()=>{exprReads++;return {}};ctx.moaPublicExamples_=()=>{exampleReads++;return []};
ctx.moaPublicHumanPatternDelta_=()=>{deltaReads++;return {complete:true,patterns:[{id:'h1'}]}};
const delta=ctx.moaSync_({known_version:19,known_core_version:10,client_caps:"delta-v1"});
ok(delta.incremental===true&&delta.patternDelta.length===1,'language delta sync failed');
ok(policyReads===0&&exprReads===0&&exampleReads===0,'language-only delta reread unrelated core learning sheets');
ok(deltaReads===1,'language delta not read exactly once');
console.log('MOA_V4_CORE_DELTA_ISOLATION_OK');

// Server-side anonymous actor evidence must use a server secret, not a reversible/raw nickname digest.
const props={};ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>{props[k]=String(v)}})};
ctx.Utilities.getUuid=()=> 'server-secret-salt';
ctx.Utilities.computeHmacSha256Signature=(v,k)=>Array.from(crypto.createHmac('sha256',String(k)).update(String(v)).digest());
const h=ctx.moaAnonActorHash_('민수-user-123');
ok(h&&h!=='민수-user-123'&&!h.includes('민수'),'anonymous actor hash leaked raw identity');
ok(props.MOA_ANON_SALT_V1==='server-secret-salt','server anonymous salt was not persisted');
console.log('MOA_V4_SALTED_ANON_EVIDENCE_OK');

// A full relearn uses a staging sheet and does not clear the live corpus before completion.
ok(gs.includes('MOA_LANGUAGE_REBUILD_SHEET'),'relearn staging sheet missing');
ok(gs.includes('moaCommitRebuiltLanguage_'),'relearn atomic commit helper missing');
ok(gs.includes('targetSheet=rebuilding?moaEnsureLanguageRebuildWidth_():moaEnsureLanguageWidth_()'),'admin relearn does not target staging corpus');
ok(!/if\(reset\)[\s\S]{0,500}moaEnsureLanguageWidth_\(\)[\s\S]{0,120}clearContent/.test(gs),'reset still clears live language corpus before rebuild');
console.log('MOA_V4_STAGED_RELEARN_OK');

// Service worker must be bumped so query-versioned JS does not coexist with stale offline entries.
ok(sw.includes('moaru-runtime-bundle-2'),'service-worker cache namespace not bumped');
ok(app.includes('sw.js?v=64.5.61'),'service-worker registration version not bumped');
ok(index.includes('js/app.js?v=64.5.47'),'app cache reference not bumped');
console.log('MOA_V4_OFFLINE_CACHE_ISOLATION_OK');
