const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const social=fs.readFileSync('docs/apps-script/social_chat.gs','utf8');
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');

// Contract: deleting/maintenance operations that can remove public patterns must force a full-cache refresh.
ok(gs.includes('if(cleanup&&!rebuilding){dedupe=moaDedupeLanguagePatterns_(targetVersion,targetSheet);if(dedupe.changed)moaSetLanguageDeltaFloor_(targetVersion);}'),'admin dedupe does not invalidate stale client caches');
ok(gs.includes('if(changed){var targetVersion=moaCurrentSyncVersion_()+1;moaSetLanguageDeltaFloor_(targetVersion);var coreV=moaBumpSyncVersion_();moaMarkCoreSyncVersion_(coreV);}'),'maintenance does not invalidate stale pattern caches');
console.log('MOA_V3_CACHE_INVALIDATION_OK');

// Contract: global chat cleanup must never delete unlearned source rows first.
ok(social.includes('moaLearnGlobalBeforeCleanup_(sheet)'),'social cleanup has no pre-delete learning safeguard');
ok(/learnBeforeDelete && learnBeforeDelete\.ok === false\) return/.test(social),'cleanup does not preserve source rows when learning backlog cannot be saved');
ok(social.indexOf('moaLearnGlobalBeforeCleanup_(sheet)') < social.indexOf('sheet.deleteRows(2, dataRows)'),'cleanup deletes source before learning safeguard');
console.log('MOA_V3_GLOBAL_CLEANUP_GUARD_OK');

const c={console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}};
vm.createContext(c);vm.runInContext(gs,c);
let props={MOA_SYNC_VERSION:'20'};
c.PropertiesService={getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>{props[k]=String(v)}})};
c.moaKnownChatNames_=()=>['민수','지우'];
c.moaChatLearnState_=()=>({'g:77':2});
let savedState=null;c.moaSaveChatLearnState_=s=>{savedState=JSON.parse(JSON.stringify(s))};
let recorded=null;c.moaRecordLanguageDelta_=(v,p)=>{recorded={v,p};return p.length};
c.moaBumpSyncVersion_=()=>{props.MOA_SYNC_VERSION=String(Number(props.MOA_SYNC_VERSION||0)+1);return Number(props.MOA_SYNC_VERSION)};
c.moaCurrentSyncVersion_=()=>Number(props.MOA_SYNC_VERSION||1);
c.moaStoreHumanChatPairs_=pairs=>({changed:pairs.length>0,newPatterns:pairs.length,duplicates:0,changedPublic:pairs.map((p,i)=>({id:'x'+i,trigger:p.trigger,reply:p.reply}))});
const data=[['u1','민수',new Date(),'너 사과 좋아해?'],['u2','지우',new Date(),'난 복숭아가 더 좋음']];
const sh={getSheetId:()=>77,getLastRow:()=>3,getRange:(row,col,nr,nc)=>({getValues:()=>data.slice(row-2,row-2+nr).map(r=>r.slice(col-1,col-1+nc))})};
const kept=c.moaLearnGlobalBeforeCleanup_(sh);
ok(kept.ok&&kept.pairs===1,'cleanup safeguard did not learn adjacent global chat pair');
ok(savedState&&savedState['g:77']===4,'cleanup safeguard did not advance global cursor');
ok(recorded&&recorded.v===21,'cleanup safeguard did not record incremental delta before version bump');
console.log('MOA_V3_GLOBAL_PREDELETE_LEARNING_OK');

// Very large unlearned source must be preserved instead of silently deleted.
c.moaChatLearnState_=()=>({'g:88':2});
const huge={getSheetId:()=>88,getLastRow:()=>6005,getRange:(row,col,nr,nc)=>({getValues:()=>Array.from({length:nr},(_,i)=>[`u${i%2}`,i%2?'지우':'민수',new Date(1000+i*1000),i%2?'응 그랬구나':'오늘 학교 피곤했어'].slice(col-1,col-1+nc))})};
const hold=c.moaLearnGlobalBeforeCleanup_(huge);
ok(hold.ok===false&&hold.preserve===true&&hold.pending>0&&hold.processed<=1000,'large cleanup backlog was not bounded/preserved');
console.log('MOA_V3_GLOBAL_BACKLOG_PRESERVE_OK');

// Client cache migration: missing v92 must fall back to a populated older learned-pattern cache.
const persistence={
 'moa.v91.patterns.migrate-user':[{id:'legacy',trigger:'안녕',reply:'안녕 ㅋㅋ',act:'inform:statement',strategy:'ack',tier:'growing',evidenceCount:2,semantic:{tokens:['안녕'],categories:[],intent:'inform:statement'}}],
 'moa.v91.syncVersion.migrate-user':50
};
let knownSeen=null;
const ctx={console,Date,Math,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:'migrate-user',isGuest:false}:undefined},Persistence:{get:(k,d)=>k in persistence?persistence[k]:d,set:(k,v)=>{persistence[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete persistence[k]},AuthApi:{moaSync:async(_u,known)=>{knownSeen=known;return {ok:true,version:50}},moaCommit:async()=>({ok:true}),moaSearch:async()=>({})}}};
vm.createContext(ctx);vm.runInContext(engine,ctx);
(async()=>{await ctx.MiniTalk.AI.MoaCommunicationEngine.sync(true);ok(knownSeen===50,'older populated pattern cache was ignored during migration, known='+knownSeen);const snap=ctx.MiniTalk.AI.MoaCommunicationEngine.debugSnapshot();ok(snap.patterns.some(p=>p.id==='legacy'),'legacy learned pattern was not restored into memory');console.log('MOA_V3_CLIENT_CACHE_MIGRATION_OK')})().catch(e=>{console.error(e);process.exit(1)});

// Pair quality: split messages from one speaker become one turn; long idle gaps are not learned as replies.
const turns=c.moaPairsFromMessages_([
 {row:2,user:'a',nick:'A',text:'너 사과',ts:1000},
 {row:3,user:'a',nick:'A',text:'좋아해?',ts:1500},
 {row:4,user:'b',nick:'B',text:'난 복숭아가 더 좋아',ts:2000}
],77,'global');
ok(turns.length===1&&turns[0].trigger==='너 사과 좋아해?','same-speaker split turn was not combined naturally: '+JSON.stringify(turns));
const idle=c.moaPairsFromMessages_([
 {row:2,user:'a',text:'오늘 피곤함',ts:1000},
 {row:3,user:'b',text:'치킨 먹었다',ts:1000+11*60*1000}
],77,'global');
ok(idle.length===0,'unrelated messages across a long idle gap were learned as a response pair');
console.log('MOA_V3_TURN_PAIR_QUALITY_OK');

// Room sources must use the last populated cell in their own column, not the longest room on the sheet.
const roomCol={
 getMaxRows:()=>1000,
 getLastRow:()=>900,
 getRange:(row,col,nr,nc)=>({
   getNextDataCell:()=>({getRow:()=>24}),
   getValues:()=>Array.from({length:nr||1},()=>[''])
 })
};
const oldSpreadsheet=c.SpreadsheetApp;c.SpreadsheetApp={Direction:{UP:'UP'}};
ok(c.moaRoomLastRow_(roomCol,2)===24,'room learning used global sheet last row instead of column last row');
c.SpreadsheetApp=oldSpreadsheet;
console.log('MOA_V3_ROOM_COLUMN_LASTROW_OK');

// Full relearn must rebuild in an isolated sheet and only replace the live corpus at completion.
ok(gs.includes('MOA_LANGUAGE_REBUILD_SHEET = "모아_언어패턴_재학습"'),'staging sheet for full relearn is missing');
ok(gs.includes('state={__rebuild:true,__sourceCursor:0}')&&gs.includes('moaCommitRebuiltLanguage_(targetSheet,targetVersion)'),'full relearn is not staged before commit');
ok(!/if\(reset\)\{[^}]*moaEnsureLanguageWidth_\(\)[^}]*clearContent/.test(gs),'full relearn still clears the live semantic rows at start');
console.log('MOA_V3_TRUE_FULL_RELEARN_OK');

// Evidence identity must survive source-sheet row reuse after cleanup: timestamp differentiates real repeated conversations.
const ev1=c.moaPairEvidenceHash_(77,'global',2,3,'안녕','반가워',1000,2000);
const ev2=c.moaPairEvidenceHash_(77,'global',2,3,'안녕','반가워',500000,501000);
ok(ev1!==ev2,'row reuse after social cleanup collapsed a new real conversation into old evidence');
console.log('MOA_V3_EVIDENCE_ROW_REUSE_OK');

// Common-learning source diversity is based on anonymous speaker-pair evidence per semantic pattern, not merely room id.
const sa=c.moaPairSourceHash_(77,'global',{user:'u1',text:'너 사과 좋아해?'},{user:'u2',text:'난 복숭아가 좋아'});
const sb=c.moaPairSourceHash_(77,'global',{user:'u3',text:'너 사과 좋아해?'},{user:'u4',text:'난 복숭아가 좋아'});
const same=c.moaPairSourceHash_(77,'global',{user:'u1',text:'너 사과 좋아해?'},{user:'u2',text:'난 복숭아가 좋아'});
ok(sa!==sb&&sa===same,'anonymous source diversity cannot distinguish independent user pairs consistently');
ok(!sa.includes('u1')&&!sa.includes('u2'),'raw user identity leaked into source hash');
console.log('MOA_V3_ANON_SOURCE_DIVERSITY_OK');

// Admin batch scheduler must rotate sources so one huge room cannot starve all later rooms.
ok(gs.includes('state.__sourceCursor')&&gs.includes('var si=(sourceCursor+step)%sources.length'),'admin learning does not round-robin chat sources');
console.log('MOA_V3_SOURCE_FAIRNESS_OK');

// Long MOA jobs must not hold the whole Apps Script lock; only short lease acquisition may use ScriptLock.
const adminBlock=(gs.match(/function moaAdminLearnChats_\(data\)\{[\s\S]*?\n\}/)||[])[0]||'';
ok(adminBlock.includes('moaAcquireLearningLease_("admin-chat-learning",240000)'),'admin learning lease missing');
ok(!adminBlock.includes('tryLock(8000)'),'admin learning still holds the global script lock for the full batch');
const cleanupBlock=(social.match(/function cleanupSocialChatSheet\(\) \{[\s\S]*?\n\}/)||[])[0]||'';
ok(!cleanupBlock.includes('getScriptLock'),'social cleanup still holds a global lock while doing learning work');
console.log('MOA_V3_NONBLOCKING_LEARNING_LOCK_OK');
