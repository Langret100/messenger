const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const engine=fs.readFileSync('js/ai/moa-communication-engine.js','utf8');
const persistence={
  'moa.v90.profile.legacy-user':{brevity:.21,empathy:.91,customLegacy:true},
  'moa.v90.memories.legacy-user':{like:'복숭아',likes:['복숭아','축구']},
  'moa.v90.context.legacy-user':[{role:'user',text:'예전 대화',ts:1}],
  'moa.v90.state.legacy-user':{topic:'축구',turn:7},
  'moa.v90.personalLearning.legacy-user':{turns:9,features:{'f:ack':{positive:2,negative:0,uses:2,lastAt:1}},strategies:{},topics:{축구:{turns:3,lastAt:1,positive:2,negative:0}}}
};
const c={console,Date,Math,setTimeout:()=>1,clearTimeout:()=>{},MiniTalk:{AI:{},Store:{get:k=>k==='user'?{user_id:'legacy-user',isGuest:false}:undefined},Persistence:{get:(k,d)=>Object.prototype.hasOwnProperty.call(persistence,k)?persistence[k]:d,set:(k,v)=>{persistence[k]=JSON.parse(JSON.stringify(v));return v},remove:k=>delete persistence[k]},AuthApi:{moaSync:async()=>({ok:true,version:1}),moaCommit:async()=>({ok:true}),moaSearch:async()=>({})}}};
vm.createContext(c);vm.runInContext(engine,c);
const snap=c.MiniTalk.AI.MoaCommunicationEngine.debugSnapshot();
ok(snap.profile.customLegacy===true&&Math.abs(snap.profile.brevity-.21)<1e-9,'older profile was shadowed by empty current-version fallback');
ok(snap.memories.like==='복숭아'&&snap.context.some(x=>x.text==='예전 대화'),'older memories/context were not migrated');
ok(snap.state.topic==='축구'&&snap.state.turn===7,'older dialogue state was not migrated');
ok(snap.personalLearning.turns===9&&snap.personalLearning.features['f:ack'].positive===2,'older personal learning was not migrated');
console.log('MOA_PERSONAL_STORAGE_MIGRATION_OK');

const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const props={MOA_ANON_SALT_V1:'server-secret-salt'};
const util={
  DigestAlgorithm:{SHA_256:'sha256'},
  computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),
  computeHmacSha256Signature:(x,key)=>Array.from(crypto.createHmac('sha256',String(key)).update(String(x)).digest()),
  base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),
  getUuid:()=> 'uuid'
};
const g={console,Date,Math,JSON,Utilities:util,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>delete props[k]})}};
vm.createContext(g);vm.runInContext(gs,g);
const uid='user-123';
const legacy=g.moaLegacyUserHash_(uid),fresh=g.moaUserHash_(uid);
ok(fresh!==legacy&&fresh.startsWith('u2'),'public feedback user hash is not salted/versioned');
let migrated=g.moaAppendUserHash_(legacy,uid);
ok(migrated.migrated===true&&migrated.added===false&&migrated.value===fresh,'legacy feedback hash did not migrate without double-counting');
const ev={evidenceKey:'x',type:'policy_feedback',strategy:'ack'};
const oldEv=g.moaEvidenceHashWithUserHash_(legacy,ev),newEv=g.moaEvidenceHash_(uid,ev);
let em=g.moaAppendEvidenceHash_(oldEv,uid,ev);
ok(oldEv!==newEv&&em.migrated===true&&em.added===false&&em.value===newEv,'legacy evidence hash did not migrate privately without double-counting');

ok(gs.includes('knownNames=moaRegisteredNicknames_()'),'MOA-user dialogue examples do not load registered nickname privacy directory');
ok(gs.includes('moaPublicDialogueText_(moaAnonymizeChatText_(ev.trigger,knownNames),90)'),'MOA-user trigger is not nickname-scrubbed before common sheet storage');
ok(gs.includes('moaPublicDialogueText_(moaAnonymizeChatText_(ev.reply,knownNames),140)'),'MOA reply is not nickname-scrubbed before common sheet storage');
const scrub=g.moaAnonymizeChatText_('민수 오늘 진짜 웃겼어',['민수']);
ok(!scrub.includes('민수')&&scrub.includes('[사람]'),'registered nickname survived common dialogue scrub');
console.log('MOA_COMMON_LEARNING_PRIVACY_HASH_OK');

// Large public corpus cache must retain the full learning snapshot instead of silently missing cache capacity.
{
  const mem=new Map(),cache={put:(k,v)=>mem.set(k,String(v)),get:k=>mem.get(k)||null,getAll:ks=>Object.fromEntries(ks.filter(k=>mem.has(k)).map(k=>[k,mem.get(k)]))};
  const patterns=Array.from({length:1400},(_,i)=>({id:'p'+i,trigger:'가'.repeat(70),reply:'나'.repeat(110),act:'inform:statement',affect:'neutral',strategy:'direct',confidence:.86,tier:'confirmed',evidenceCount:9,semantic:{tokens:['학교','피곤하다','숙제'],categories:['school','emotion'],intent:'inform:statement'},humanChat:true}));
  const payload={policy:{},expressionWeights:{},patterns};
  ok(g.moaCachePutLargeJson_(cache,'big-public',payload,300)===true,'1400-pattern public snapshot exceeded chunk cache capacity');
  const round=g.moaCacheGetLargeJson_(cache,'big-public');
  ok(round&&round.patterns&&round.patterns.length===1400&&round.patterns[1399].id==='p1399','large public snapshot cache did not round-trip intact');
  ok(Number(g.MOA_PUBLIC_CACHE_MAX_PARTS)>=40,'public cache chunk ceiling is too small for realistic learned corpus');
}
console.log('MOA_LARGE_PUBLIC_CORPUS_CACHE_OK');
