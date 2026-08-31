const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const baseCtx=()=>{const props={};return {console,Date,Math,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>{props[k]=String(v)}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},getUuid:()=> 'test-salt',computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),computeHmacSha256Signature:(v,k)=>Array.from(crypto.createHmac('sha256',String(k)).update(String(v)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}}};

// 30-room fairness: one large room must not starve later rooms.
const c=baseCtx();vm.createContext(c);vm.runInContext(gs,c);
let state={},version=10;
const sources=Array.from({length:30},(_,i)=>({type:'room',key:'r:'+i,room:'room'+i,col:i+2,last:5006,sheet:{getSheetId:()=>100+i}}));
c.requireAdminToken_=()=>({ok:true});c.jsonResponse_=x=>x;c.moaAcquireLearningLease_=()=>`lease`;c.moaReleaseLearningLease_=()=>{};
c.moaChatLearnState_=()=>JSON.parse(JSON.stringify(state));c.moaSaveChatLearnState_=s=>{state=JSON.parse(JSON.stringify(s))};
c.moaLearningSources_=()=>sources;c.moaKnownChatNames_=()=>[];c.moaSourceLastRow_=src=>src.last;c.moaCurrentSyncVersion_=()=>version;c.moaBumpSyncVersion_=()=>++version;
c.moaEnsureLanguageWidth_=()=>({getLastRow:()=>1});c.moaEnsureLanguageRebuildWidth_=c.moaEnsureLanguageWidth_;c.moaDedupeLanguagePatterns_=()=>({removed:0,changed:false});
c.moaReadRoomLearnBatch_=(_sh,_col,start,limit,_names,last)=>{const first=7;if(start>last)return{messages:[],next:last+1,done:true,privateSkipped:0,scanned:0};const useful=Math.max(1,Math.min(Number(limit)||260,last-start+1));return{messages:[],next:start+useful,done:start+useful>last,privateSkipped:0,scanned:useful+(start>first?1:0)}};
c.moaStoreHumanChatPairs_=()=>({newPatterns:0,duplicates:0,changed:false,changedPublic:[]});c.moaRecordLanguageDelta_=()=>0;
for(let i=0;i<60;i++){const r=c.moaAdminLearnChats_({user_id:'a',admin_token:'t',batch_limit:260});ok(r.ok,'admin batch failed')}
const cursors=sources.map(s=>Number(state[s.key]||7)),min=Math.min(...cursors),max=Math.max(...cursors);
ok(min>7,'a later room was starved by earlier large rooms');ok(max-min<=520,'round-robin source progress became badly imbalanced: '+(max-min));
console.log('MOA_ADMIN_30ROOM_FAIRNESS_OK',JSON.stringify({min,max,spread:max-min,cursor:state.__sourceCursor}));

// Five independent user pairs in the same global room must be able to confirm one common pattern.
const d=baseCtx();vm.createContext(d);vm.runInContext(gs,d);
function fakeSheet(){const data=[];return{data,getLastRow(){return data.length+1},getRange(row,col,nr,nc){return{getValues(){return Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(data[row-2+i]||[])[col-1+j]??''))},setValues(vals){for(let i=0;i<vals.length;i++){const idx=row-2+i;data[idx]=data[idx]||[];for(let j=0;j<vals[i].length;j++)data[idx][col-1+j]=vals[i][j]}return this}}}}}
const lang=fakeSheet();d.moaEnsureLanguageWidth_=()=>lang;d.moaCurrentSyncVersion_=()=>30;
const evidence=[];for(let i=0;i<5;i++){const ms=[{row:2,user:'a'+i,text:'너 사과 좋아해?',ts:10000+i*1000},{row:3,user:'b'+i,text:'난 복숭아가 더 좋음',ts:10500+i*1000}];evidence.push(...d.moaPairsFromMessages_(ms,77,'global'))}
d.moaStoreHumanChatPairs_(evidence,31);
ok(lang.data.length===1,'same semantic pattern did not merge');ok(Number(lang.data[0][8])===5,'five independent conversations were not accumulated');ok(String(lang.data[0][13])==='confirmed','different user pairs in one global room could not promote a common pattern: '+lang.data[0][13]);
console.log('MOA_GLOBAL_MULTIUSER_CONFIRMATION_OK',JSON.stringify({occ:lang.data[0][8],sources:String(lang.data[0][9]).split(',').length,tier:lang.data[0][13]}));
