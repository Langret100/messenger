const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');


// Server sync contract: a cached client must not rebuild/read the full human-language snapshot.
const syncBlock=(gs.match(/function moaSync_\(data\)\{[\s\S]*?\n\}/)||[])[0]||'';
ok(syncBlock.includes('if(known===version&&knownCore>=coreVersion)return jsonResponse_(out)'), 'same-version/core fast path missing');
ok(syncBlock.includes('moaPublicHumanPatternDelta_(known)'), 'incremental human-pattern delta path missing');
const cachedBranch=syncBlock.slice(syncBlock.indexOf('if(known<=0||'));
ok(cachedBranch.includes('moaPublicSnapshot_()'), 'first-sync full snapshot path missing');
const afterFirstReturn=cachedBranch.slice(cachedBranch.indexOf('return jsonResponse_(out);')+26);
ok(afterFirstReturn.includes('deltaState=moaPublicHumanPatternDelta_(known)'), 'cached sync does not use retained delta log');
ok(afterFirstReturn.includes('if(deltaState.complete===false){var full=moaPublicSnapshot_()'), 'missing safe full fallback when delta history is incomplete');
ok(gs.includes('MOA_LANGUAGE_DELTA_SHEET')&&gs.includes('moaRecordLanguageDelta_')&&gs.includes('MOA_LANGUAGE_DELTA_MAX_ROWS'), 'bounded language delta log missing');
ok(gs.includes('moaAcquireLearningLease_("admin-chat-learning",240000)')&&gs.includes('moaReleaseLearningLease_(lease)'), 'admin learning dedicated concurrency lease missing');
console.log('MOA_INCREMENTAL_SERVER_FASTPATH_OK');

// Client: learned corpus lives in IndexedDB/DataCache, while only tiny sync-version metadata stays in Persistence.
const persistence={},dataCache={},user={user_id:'cache-user',isGuest:false};
let calls=[],payload={ok:true,version:100,coreVersion:90,policy:{},expressionWeights:{},patterns:[
  {id:'old-a',trigger:'너 사과 좋아해?',reply:'난 복숭아가 더 좋아',act:'ask:preference',strategy:'direct',tier:'growing',evidenceCount:3,semantic:{tokens:['사과','좋아하다'],categories:['fruit','preference'],intent:'ask:preference'},humanChat:true}
]};
const ctx={console,Date,Math,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:k=>k==='user'?user:undefined},DataCache:{get:async(t,k,d)=>((t+'|'+k) in dataCache?dataCache[t+'|'+k]:d),put:async(t,k,v)=>{dataCache[t+'|'+k]=JSON.parse(JSON.stringify(v));return v}},Persistence:{get:(k,d)=>k in persistence?persistence[k]:d,set:(k,v)=>{persistence[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete persistence[k]},AuthApi:{moaSync:async(_u,known,knownCore)=>{calls.push([known,knownCore]);return payload},moaSearch:async()=>({}),moaCommit:async()=>({ok:true})}}};
vm.createContext(ctx);vm.runInContext(engine,ctx);const E=ctx.MiniTalk.AI.MoaCommunicationEngine;
(async()=>{
  await E.sync(true);
  ok(calls[0][0]===0,'first sync should request full data');
  ok(Array.isArray(dataCache['moa-learning-patterns|__public__'])&&dataCache['moa-learning-patterns|__public__'].length===1,'full patterns not persisted in DataCache');
  ok(!Array.isArray(persistence['moa.v92.patterns.cache-user']),'large learned corpus leaked back into shared localStorage');
  payload={ok:true,version:101,coreVersion:90,incremental:true,patternDelta:[
    {id:'new-b',trigger:'버스 왜 안 와?',reply:'기다릴 때가 제일 길지 ㅋㅋ',act:'ask:question',strategy:'empathy',tier:'growing',evidenceCount:2,semantic:{tokens:['버스','오다'],categories:['travel'],intent:'ask:question'},humanChat:true}
  ]};
  await E.sync(true);
  ok(calls[1][0]===100,'second sync did not send cached version: '+calls[1][0]);
  ok(calls[1][1]===90,'second sync did not send cached core version: '+calls[1][1]);
  const cached=dataCache['moa-learning-patterns|__public__'];
  ok(cached.some(x=>x.id==='old-a')&&cached.some(x=>x.id==='new-b'),'delta replaced cache instead of merging');
  ok(cached.length===2,'unexpected incremental cache size '+cached.length);
  console.log('MOA_INCREMENTAL_CLIENT_CACHE_OK',JSON.stringify({known:calls[1][0],core:calls[1][1],cached:cached.length}));
})().catch(e=>{console.error(e);process.exit(1)});

// Server language store: semantic duplicates merge into one row; cleanup removes already-existing duplicate rows.

const gsCtx={console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}};
vm.createContext(gsCtx);vm.runInContext(gs,gsCtx);
// Detailed audit: sync delta reads the dedicated bounded delta log, not the full language sheet.
let languageReadCount=0,deltaReadCount=0;
const propStore={'MOA_LANGUAGE_DELTA_FLOOR_V1':'10'};
gsCtx.PropertiesService={getScriptProperties:()=>({getProperty:k=>propStore[k]||'',setProperty:(k,v)=>{propStore[k]=String(v)}})};
const deltaRows=[[11,'p11',JSON.stringify({id:'p11',trigger:'버스 안 와',reply:'기다릴 때 길지 ㅋㅋ',act:'inform:statement',strategy:'ack',tier:'growing',evidenceCount:2,semantic:{tokens:['버스','오다'],categories:['travel'],intent:'inform:statement'},humanChat:true}),new Date()]];
const deltaSheet={getLastRow:()=>deltaRows.length+1,getRange:(row,col,nr,nc)=>({getValues:()=>{deltaReadCount++;return deltaRows.slice(row-2,row-2+nr).map(r=>r.slice(col-1,col-1+nc));}})};
gsCtx.moaLanguageDeltaSheet_=()=>deltaSheet;
gsCtx.moaEnsureLanguageWidth_=()=>({getLastRow:()=>{languageReadCount++;return 99999},getRange:()=>{languageReadCount++;throw new Error('full language read in delta path')}});
const fastDelta=gsCtx.moaPublicHumanPatternDelta_(10);
ok(fastDelta.complete===true&&fastDelta.patterns.length===1,'delta log did not return changed pattern');
ok(languageReadCount===0,'delta path touched full language sheet');
ok(deltaReadCount===1,'delta log read count unexpected '+deltaReadCount);
console.log('MOA_TRUE_INCREMENTAL_DELTA_OK');

// Detailed audit: when the same pattern changed more than once, the newest delta must win.
const multiRows=[
  [11,'same',JSON.stringify({id:'same',reply:'old',tier:'growing',evidenceCount:2}),new Date()],
  [12,'same',JSON.stringify({id:'same',reply:'new',tier:'confirmed',evidenceCount:9}),new Date()]
];
gsCtx.moaLanguageDeltaSheet_=()=>({getLastRow:()=>multiRows.length+1,getRange:(row,col,nr,nc)=>({getValues:()=>multiRows.slice(row-2,row-2+nr).map(r=>r.slice(col-1,col-1+nc))})});
const newestDelta=gsCtx.moaPublicHumanPatternDelta_(10);
ok(newestDelta.complete===true&&newestDelta.patterns.length===1&&newestDelta.patterns[0].reply==='new','latest delta did not replace older revision');
console.log('MOA_DELTA_LATEST_REVISION_OK');

// Detailed audit: a backlog larger than the transport cap must force a full refresh, never silently skip patterns.
const hugeRows=[];for(let i=0;i<1201;i++)hugeRows.push([11,'id'+i,JSON.stringify({id:'id'+i,reply:'r'+i,tier:'growing',evidenceCount:2}),new Date()]);
gsCtx.moaLanguageDeltaSheet_=()=>({getLastRow:()=>hugeRows.length+1,getRange:(row,col,nr,nc)=>({getValues:()=>hugeRows.slice(row-2,row-2+nr).map(r=>r.slice(col-1,col-1+nc))})});
const hugeDelta=gsCtx.moaPublicHumanPatternDelta_(10);
ok(hugeDelta.complete===false,'large delta backlog was truncated instead of forcing a safe full refresh');
console.log('MOA_DELTA_OVERFLOW_REFRESH_OK');

// Detailed audit: private/blank rows must break adjacency so unrelated messages are never paired.
const gapPairs=gsCtx.moaPairsFromMessages_([{row:2,user:'a',text:'안녕'},{row:4,user:'b',text:'그래'}],1,'global');
ok(gapPairs.length===0,'learning paired across a skipped/private row');
console.log('MOA_PRIVATE_GAP_PAIRING_OK');

// Detailed audit: nicknames found inside the current batch are scrubbed even if they were not in the prebuilt name list.
const chatRows=[['u1','민수',new Date(),'안녕'],['u2','지우',new Date(),'민수야 오늘 뭐해']];
const chatSheet={getLastRow:()=>3,getRange:(row,col,nr,nc)=>({getValues:()=>chatRows.slice(row-2,row-2+nr).map(r=>r.slice(col-1,col-1+nc))})};
const nickBatch=gsCtx.moaReadGlobalLearnBatch_(chatSheet,2,20,[]);
ok(nickBatch.messages.length===2,'global learning batch lost normal chat messages');
ok(nickBatch.messages[1].text.includes('[사람]')&&!nickBatch.messages[1].text.includes('민수'),'current-batch nickname leaked into common learning');
console.log('MOA_BATCH_NICKNAME_SCRUB_OK');

// Detailed audit: if the source sheet was cleaned and row numbers restarted, pending learning resets to the first data row.
gsCtx.requireAdminToken_=()=>({ok:true});
gsCtx.jsonResponse_=x=>x;
gsCtx.moaChatLearnState_=()=>({'g:77':5001,__lastRun:0});
gsCtx.moaLearningSources_=()=>[{type:'global',sheet:{getLastRow:()=>3,getSheetId:()=>77},key:'g:77',room:'global',col:4}];
gsCtx.moaEnsureLanguageWidth_=()=>({getLastRow:()=>1});
const resetStatus=gsCtx.moaAdminLearningStatus_({user_id:'admin',admin_token:'ok'});
ok(resetStatus.pending===2,'cleaned source cursor did not reset; pending='+resetStatus.pending);
console.log('MOA_SOURCE_SHRINK_RESET_OK');

function fakeSheet(initial=[]){
  const data=initial.map(r=>r.slice());
  return {data,getLastRow(){return data.length+1},getRange(row,col,nr,nc){return {
    getValues(){const out=[];for(let i=0;i<nr;i++){const src=data[row-2+i]||[];out.push(Array.from({length:nc},(_,j)=>src[col-1+j]??''));}return out},
    setValues(vals){for(let i=0;i<vals.length;i++){const idx=row-2+i;data[idx]=data[idx]||[];for(let j=0;j<vals[i].length;j++)data[idx][col-1+j]=vals[i][j];}return this},
    clearContent(){for(let i=0;i<nr;i++){const idx=row-2+i;if(idx>=0&&idx<data.length)data[idx]=Array(nc).fill('');}while(data.length&&data[data.length-1].every(v=>v===''||v==null))data.pop();return this}
  }} };
}
const sh=fakeSheet();gsCtx.moaEnsureLanguageWidth_=()=>sh;gsCtx.moaCurrentSyncVersion_=()=>10;
const p1={trigger:'너 사과 좋아해?',reply:'난 복숭아가 더 좋음',sourceHash:'s1',evidenceHash:'e1'};
const p2={trigger:'사과 좋아함?',reply:'난 복숭아가 더 좋음',sourceHash:'s2',evidenceHash:'e2'};
let stored=gsCtx.moaStoreHumanChatPairs_([p1,p2],11);
ok(sh.data.length===1,'semantic duplicate created a second row');
ok(Number(sh.data[0][8])===2,'merged occurrence count wrong '+sh.data[0][8]);
ok(stored.newPatterns===1,'new pattern count should be one');
const dup=sh.data[0].slice();dup[0]='duplicate-id';dup[8]=1;dup[10]='e3';dup[9]='s3';sh.data.push(dup);
const cleaned=gsCtx.moaDedupeLanguagePatterns_(12);
ok(cleaned.removed===1&&sh.data.length===1,'existing duplicate row was not removed');
ok(Number(sh.data[0][15])===12,'deduped row sync version not updated');
console.log('MOA_SERVER_DEDUPE_OK',JSON.stringify({removed:cleaned.removed,rows:sh.data.length}));
