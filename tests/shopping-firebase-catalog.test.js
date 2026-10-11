const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),ROOT='moaru/v3/economyRuntime';
const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
const key=id=>Buffer.from(id).toString('base64url');
const product={id:'p',name:'기존 상품',description:'설명',imageUrl:'data:image/png;base64,AAAA',price:10,quantity:8,updatedAt:1};
const db={moaru:{v3:{economyRuntime:{catalog:{initialized:true,version:1,products:{[key('p')]:product}},stock:{[key('p')]:{productId:'p',qty:7,unlimited:false,revision:1}}}}}};
const watchers=new Map(),reads=[],backups=new Map();let stamp=100,blockedBackup=false;
const persisted=new Map();
function get(p){return p.split('/').reduce((v,k)=>v?.[k],db)??null;}
function set(p,v){const parts=p.split('/'),last=parts.pop();let node=db;for(const part of parts)node=node[part]??={};if(v==null)delete node[last];else node[last]=clone(v);}
function notify(){for(const [p,callbacks]of watchers)for(const cb of callbacks)queueMicrotask(()=>cb(clone(get(p))));}
function client(){
  const state={user:{user_id:'admin'},shopCatalog:{},shopInventory:{}},events=new Map();
  let mode='firebase';
  const ctx={console,Date,crypto:{randomUUID:()=>`operation-${++stamp}`},setTimeout,clearTimeout,MiniTalkConfig:{paths:{economyRuntime:ROOT}},MiniTalk:{Shopping:{},Economy:{Runtime:{keyOf:key}},Events:{on(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);return()=>events.get(type).delete(fn);},emit(type,v){for(const cb of events.get(type)||[])cb(v);}},Store:{get:p=>state[p],set:(p,v)=>{state[p]=v;ctx.MiniTalk.Events.emit(`state:${p}`,v);}},Persistence:{get:(p,v)=>clone(persisted.get(p)??v),set:(p,v)=>persisted.set(p,clone(v))},AdminSession:{requireToken:()=> 'token'},AuthApi:{shopCatalog(){throw new Error('ordinary shopping must never request Apps Script')},shopSaveProduct:async(u,t,p,revision)=>{if(blockedBackup)throw new Error('Apps offline');backups.set(p.id,clone(p));},shopDeleteProduct:async(u,t,id,revision)=>{if(blockedBackup)throw new Error('Apps offline');backups.delete(id);}},Realtime:{getMode:()=>mode,serverTimestamp:()=>++stamp,cloudGet:async p=>{reads.push(p);return clone(get(p));},cloudUpdate:async(p,patch)=>{for(const[k,v]of Object.entries(patch))set(`${p}/${k}`,v);notify();},cloudTransaction:async(p,fn)=>{const v=fn(clone(get(p)));if(v!==undefined)set(p,v);return clone(get(p));},cloudSubscribe(p,fn){if(!watchers.has(p))watchers.set(p,new Set());watchers.get(p).add(fn);queueMicrotask(()=>fn(clone(get(p))));return()=>watchers.get(p).delete(fn);}}}};
  for(const file of ['js/shopping/catalog-cloud.js','js/shopping/store-service.js'])vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
  return {ctx,state,cloud:ctx.MiniTalk.Shopping.CatalogCloud,service:ctx.MiniTalk.Shopping.StoreService,offline:()=>mode='local'};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,25));
(async()=>{
 const fresh=client();fresh.state.user={isGuest:true};await fresh.service.enter();await settle();
 assert.equal(fresh.service.products()[0].imageUrl,product.imageUrl);
 assert.equal(fresh.service.products()[0].quantity,7,'Firebase stock overrides backed-up quantity');
 const count=reads.filter(p=>p===`${ROOT}/catalog`).length;
 await fresh.service.enter();await fresh.service.refreshCatalog(true);notify();await settle();
 assert.equal(reads.filter(p=>p===`${ROOT}/catalog`).length,count,'unchanged version must not download products again');
 const restart=client();const beforeRestart=reads.filter(p=>p===`${ROOT}/catalog`).length;await restart.cloud.read();
 assert.equal(reads.filter(p=>p===`${ROOT}/catalog`).length,beforeRestart,'unchanged persistent cache must survive app restart');
 const admin=client();const stopAdmin=admin.service.watchCatalog();await settle();
 const saved=await admin.service.saveProduct({...product,name:'수정',quantity:9});await settle();
 assert.equal(saved.backupPending,false);assert.equal(backups.get('p').name,'수정');
 assert.equal(fresh.service.products()[0].name,'수정','shopping sees admin edits');
 assert.equal(admin.service.products()[0].name,'수정','admin uses the same catalog');
 blockedBackup=true;
 const deleted=await admin.service.deleteProduct('p');await settle();
 assert.equal(deleted.backupPending,true);
 assert.equal(get(`${ROOT}/catalog/products/${key('p')}`),null);
 assert.equal(get(`${ROOT}/stock/${key('p')}`),null);
 assert.equal(fresh.service.products().length,0,'all-products deletion is authoritative');
 assert.equal(admin.service.products().length,0,'admin deletion is visible in both lists');
 assert.ok(get(`${ROOT}/catalogBackupPending/${key('p')}`),'backup failures remain durable');
 blockedBackup=false;const reopened=client();await reopened.service.syncProductBackups();
 assert.equal(backups.has('p'),false,'retry removes Apps Script backup');
 assert.equal(get(`${ROOT}/catalogBackupPending/${key('p')}`),null);
 await fresh.service.enter();await settle();assert.equal(fresh.service.products().length,0,'empty catalog must not import old backup');
 stopAdmin();fresh.service.leave();
 assert.equal([...watchers.values()].reduce((sum,set)=>sum+set.size,0),0,'subscriptions stop when shopping and admin close');
 fresh.offline();await assert.rejects(fresh.cloud.read(),/Firebase/);
 console.log('SHOPPING_FIREBASE_CATALOG_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
