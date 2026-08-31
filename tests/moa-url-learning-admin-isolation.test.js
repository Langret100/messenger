const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const admin=fs.readFileSync('js/features/admin.js','utf8');
const c={console,Date,Math,JSON,String,Number,Object,Array,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}};
vm.createContext(c);vm.runInContext(gs,c,{filename:'MOA_AI.gs'});
const coupang='https://www.coupang.com/vp/products/8501978813?itemId=24975406944&vendorItemId=91980925319&sourceType=srp_product_ads&clickEventId=8e599530-a041-11f1-b478-2b61097757f0&korePlacement=15';
for(const text of [coupang,`이거 봐 ${coupang}`,'www.naver.com/test','coupang.com/vp/products/123','example.co.kr/path?q=1']){
  ok(c.moaContainsLearnableUrl_(text),`URL detector missed: ${text}`);
  ok(c.moaAnonymizeChatText_(text,['민수'])==='',`URL message entered human learning: ${text}`);
}
ok(!c.moaContainsLearnableUrl_('오늘 쿠팡에서 뭐 샀어?'),'normal non-link conversation was rejected');
ok(c.moaAnonymizeChatText_('오늘 쿠팡에서 뭐 샀어?',['민수']).includes('쿠팡'),'normal conversation disappeared');

function sheet(rows){return {rows:rows.map(r=>r.slice()),getLastRow(){return this.rows.length+1},getRange(row,col,nr,nc){const self=this;return{getValues(){return self.rows.slice(row-2,row-2+nr).map(r=>Array.from({length:nc},(_,j)=>r[col-1+j]??''))}}},deleteRows(row,count){this.rows.splice(row-2,count)}}}
const langRows=[
 ['k1','오늘 뭐해','그냥 쉬는 중','inform:statement','neutral','direct','오늘','',2,'a,b','e1,e2',new Date(),'active','growing','쉬다',1],
 ['k2',`이거 봐 ${coupang}`,'오 신기하다','inform:statement','neutral','direct','', '',2,'a,b','e3,e4',new Date(),'active','growing','',1],
 ['k3','사이트 봤어','[링크] 들어가봤어','inform:statement','neutral','direct','', '',2,'a,b','e5,e6',new Date(),'active','growing','',1]
];
const exampleRows=[
 ['x1','오늘 어땠어','괜찮았어','statement','neutral','direct',2,0,'','','',1,'active',2,0,'',2,'growing'],
 ['x2','링크 확인해',coupang,'statement','neutral','direct',2,0,'','','',1,'active',2,0,'',2,'growing']
];
const lang=sheet(langRows),rebuild=sheet([]),examples=sheet(exampleRows),delta=sheet([ [1,'old','{}',new Date()] ]);
let sync=10,floor=0,core=0;
c.moaEnsureLanguageWidth_=()=>lang;c.moaEnsureLanguageRebuildWidth_=()=>rebuild;c.moaEnsureExampleWidth_=()=>examples;c.moaLanguageDeltaSheet_=()=>delta;c.moaCurrentSyncVersion_=()=>sync;c.moaSetLanguageDeltaFloor_=v=>(floor=Math.max(floor,Number(v)||0));c.moaBumpSyncVersion_=()=>++sync;c.moaMarkCoreSyncVersion_=v=>{core=v};
const purged=c.moaPurgeUrlLearnedData_();
ok(purged.removed===3&&purged.language===2&&purged.examples===1,`existing URL learning not purged: ${JSON.stringify(purged)}`);
ok(lang.rows.length===1&&lang.rows[0][0]==='k1','clean language row was damaged');
ok(examples.rows.length===1&&examples.rows[0][0]==='x1','clean example row was damaged');
ok(delta.rows.length===0,'stale delta log survived URL purge');
ok(sync===11&&floor>=11&&core===11,'client reset/core version was not advanced after purge');
console.log('MOA_URL_LEARNING_PURGE_OK');

// Opening the admin UI must not automatically fire the expensive MOA status request.
ok(!/learn\.onclick=\(\)=>run\(false\);relearn\.onclick=\(\)=>run\(true\);refresh\(\);return section/.test(admin),'MOA status still auto-loads when admin opens');
ok(/learn\.onclick=\(\)=>run\(false\);relearn\.onclick=\(\)=>run\(true\);return section/.test(admin),'MOA learning panel no-auto-status contract missing');
ok(admin.includes('관리자 창을 열 때는 모아 학습 서버를 자동 조회하지 않습니다.'),'admin UI does not explain lazy MOA learning status');
console.log('ADMIN_MOA_INITIAL_REQUEST_ISOLATION_OK');
