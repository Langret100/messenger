const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const gs=fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8');
const c={console,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}};
vm.createContext(c);vm.runInContext(gs,c);
const priv=[
  ['서울 강남구 역삼동 123-4 살아',/서울|강남|역삼|123-4/],
  ['카톡 아이디 abc123',/abc123/],
  ['인스타 @hello123',/hello123/],
  ['01012345678로 연락해',/01012345678/],
  ['민수야 오늘 뭐해',/민수/],
  ['[[IMG]]https://example.com/a.jpg',/.+/]
];
for(const [raw,leak] of priv){const out=c.moaAnonymizeChatText_(raw,['민수']);if(raw.startsWith('[[IMG]]'))ok(out==='',`attachment token entered learning: ${out}`);else ok(!leak.test(out),`privacy leak: ${raw} -> ${out}`)}
const natural=c.moaNaturalizeLearnedText_('[사람]야 오늘 [학교] 어땠어?');
ok(natural==='친구야 오늘 학교 어땠어?',`public placeholder not naturalized: ${natural}`);
console.log('MOA_DEEP_PRIVACY_PUBLIC_TEXT_OK');

// A large language table may be read once to build its semantic index, but one changed pattern must not rewrite the whole table.
function makeRow(i){return ['k'+i,'질문'+i,'대답'+i,'inform:statement','neutral','direct','질문'+i,'',1,'s'+i,'e'+i,new Date(),'active','solo','대답'+i,1]}
const rows=Array.from({length:10000},(_,i)=>makeRow(i));
let writeCells=0,writeCalls=0;
const sheet={
 getLastRow:()=>rows.length+1,
 getRange(row,col,nr,nc){return{
  getValues(){return Array.from({length:nr},(_,i)=>Array.from({length:nc},(_,j)=>(rows[row-2+i]||[])[col-1+j]??''))},
  setValues(vals){writeCalls++;writeCells+=vals.length*(vals[0]?.length||0);for(let i=0;i<vals.length;i++){const idx=row-2+i;rows[idx]=rows[idx]||[];for(let j=0;j<vals[i].length;j++)rows[idx][col-1+j]=vals[i][j]}return this}
 }}
};
c.moaEnsureLanguageWidth_=()=>sheet;c.moaCurrentSyncVersion_=()=>20;
// Make an exact semantic match for row 0 and add new evidence.
const tr='질문0',rp='대답0';rows[0][6]=c.moaChatTokens_(tr).join('|');rows[0][14]=c.moaChatTokens_(rp).join('|');rows[0][3]=c.moaChatIntent_(tr,c.moaChatTokens_(tr));rows[0][5]=c.moaChatStrategy_(rp);
c.moaStoreHumanChatPairs_([{trigger:tr,reply:rp,sourceHash:'s-new',evidenceHash:'e-new'}],21);
ok(writeCells<=32,`single pattern update rewrote too much sheet data: ${writeCells} cells / ${writeCalls} calls`);
console.log('MOA_LANGUAGE_SCALE_TARGETED_WRITE_OK',JSON.stringify({rows:rows.length,writeCells,writeCalls}));

// Dedupe must retain accumulated evidence strength instead of collapsing to only the larger row count.
const drows=[makeRow(1),makeRow(2)];drows[0][0]='a';drows[1][0]='b';drows[0][3]=drows[1][3]='ask:question';drows[0][6]=drows[1][6]='사과|좋아하다';drows[0][14]=drows[1][14]='복숭아|좋아하다';drows[0][5]=drows[1][5]='direct';drows[0][8]=4;drows[1][8]=5;drows[0][10]='e1,e2,e3,e4';drows[1][10]='e5,e6,e7,e8,e9';
const ds={data:drows,getLastRow(){return this.data.length+1},getRange(row,col,nr,nc){return{getValues:()=>this.data.slice(row-2,row-2+nr).map(r=>r.slice(col-1,col-1+nc)),setValues:vals=>{for(let i=0;i<vals.length;i++)this.data[row-2+i]=vals[i].slice();return this},clearContent:()=>{for(let i=0;i<nr;i++)if(this.data[row-2+i])this.data[row-2+i]=Array(nc).fill('');while(this.data.length&&this.data[this.data.length-1].every(v=>v===''||v==null))this.data.pop();return this}}}};
c.moaEnsureLanguageWidth_=()=>ds;const dd=c.moaDedupeLanguagePatterns_(22);ok(dd.removed===1,'dedupe did not merge');ok(Number(ds.data[0][8])>=9,`dedupe lost accumulated occurrences: ${ds.data[0][8]}`);
console.log('MOA_DEDUPE_EVIDENCE_PRESERVE_OK',ds.data[0][8]);

ok(/function moaRunLearningMaintenance_\(\)\{[\s\S]*?moaAcquireLearningLease_\(\"maintenance\",240000\)[\s\S]*?moaReleaseLearningLease_\(lease\)/.test(gs),'maintenance does not use the dedicated MOA lease');
console.log('MOA_MAINTENANCE_LEASE_OK');
