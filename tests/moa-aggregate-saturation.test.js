const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
function ok(v,m){if(!v)throw new Error(m)}
const props={};let uuidCalls=0,lockCalls=0;
const ctx={console,Date,Math,
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]||'',setProperty:(k,v)=>{props[k]=String(v)},deleteProperty:k=>{delete props[k]}})},
  LockService:{getScriptLock:()=>({tryLock:()=>{lockCalls++;props.MOA_ANON_SALT_V1='winner-salt';return true},releaseLock:()=>{}})},
  Utilities:{DigestAlgorithm:{SHA_256:'sha256'},getUuid:()=>{uuidCalls++;return 'loser-salt'},
    computeDigest:(_,x)=>Array.from(crypto.createHash('sha256').update(String(x)).digest()),
    computeHmacSha256Signature:(v,k)=>Array.from(crypto.createHmac('sha256',String(k)).update(String(v)).digest()),
    base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')}
};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('docs/apps-script/MOA_AI.gs','utf8'),ctx);
ctx.MOA_ANON_SALT_CACHE='';
const salt=ctx.moaAnonSalt_();
ok(salt==='winner-salt','salt initialization did not re-read inside lock');
ok(uuidCalls===0,'salt race generated a competing salt after lock acquisition');
ok(lockCalls===1,'first salt initialization did not use the short script lock');

// Use a fixed persisted salt for bounded aggregate tests.
props.MOA_ANON_SALT_V1='stable-salt';ctx.MOA_ANON_SALT_CACHE='stable-salt';
let hashes=[];for(let i=0;i<120;i++)hashes.push(ctx.moaUserHash_('u'+i));
let r=ctx.moaAppendUserHash_(hashes.join(','),'u-new');
ok(r.added===false&&r.saturated===true,'full actor set still accepts a new hash');
ok(r.value.split(',').length===120,'actor saturation changed bounded set size');
let again=ctx.moaAppendUserHash_(r.value,'u0');
ok(again.added===false,'existing actor was recounted after saturation');

const ev={evidenceKey:'same',type:'policy_feedback',strategy:'direct'};
let evidence=[];for(let i=0;i<120;i++)evidence.push(ctx.moaEvidenceHash_('e'+i,ev));
let er=ctx.moaAppendEvidenceHash_(evidence.join(','),'e-new',ev);
ok(er.added===false&&er.saturated===true,'full evidence set still accepts new evidence and can later recount');
ok(er.value.split(',').length===120,'evidence saturation changed bounded set size');
console.log('MOA_AGGREGATE_SATURATION_OK');
