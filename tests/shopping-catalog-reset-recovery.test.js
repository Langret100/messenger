const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../js/shopping/catalog-cloud.js'),'utf8'),ROOT='moaru/v3/economyRuntime',CP=ROOT+'/catalog';
const copy=v=>v==null?v:JSON.parse(JSON.stringify(v)),key=id=>Buffer.from(id).toString('base64url');
const old={id:'old',name:'이전 상품',price:10,description:'설명',imageUrl:'data:image/png;base64,AAAA',updatedAt:1};
const fresh={id:'new',name:'새 상품',price:20,description:'새 설명',imageUrl:'data:image/png;base64,BBBB',updatedAt:2};
const initial=()=>({initialized:true,fieldSchema:1,schemaVersion:1,products:{[key(old.id)]:copy(old)},itemVersions:{[key(old.id)]:Object.fromEntries(Object.keys(old).map(f=>[f,'v1']))}});
let db={},memory=new Map(),reads=[],writes=[],serial=0,race=null;
function get(p){return p.split('/').reduce((v,k)=>v?.[k],db)??null}
function put(p,v){const a=p.split('/'),last=a.pop();let n=db;for(const k of a)n=n[k]??={};if(v==null)delete n[last];else n[last]=copy(v)}
function reset(value){db={};if(value!=null)put(CP,value);memory=new Map();reads=[];writes=[];race=null}
function client(guest=false){
 const c={console,Date,URL,AbortController,setTimeout,clearTimeout,crypto:{randomUUID:()=>`revision-${++serial}`},MiniTalkConfig:{paths:{economyRuntime:ROOT},firebase:{databaseURL:'https://fixture.test'}},MiniTalk:{Shopping:{},Economy:{Runtime:{keyOf:key}},Store:{get:()=>guest?{isGuest:true}:{user_id:'admin'}},Persistence:{get:(k,d)=>copy(memory.get(k)??d),set:(k,v)=>memory.set(k,copy(v))},Realtime:{getMode:()=>guest?'local':'firebase',serverTimestamp:()=>++serial,cloudGet:async p=>{reads.push(p);return copy(get(p))},cloudKeys:async p=>{reads.push(p+'?shallow=true');return Object.keys(get(p)||{})},cloudUpdate:async(p,patch)=>{writes.push(copy(patch));for(const [k,v]of Object.entries(patch))put(p+'/'+k,v)},cloudTransaction:async(p,fn)=>{if(race){const f=race;race=null;f()}const next=fn(copy(get(p)));if(next!==undefined){writes.push({transaction:p});put(p,next)}return copy(get(p))}},AuthApi:{shopCatalog:()=>{throw Error('must never restore Apps catalogue')}}},fetch:async url=>{const u=new URL(url),p=u.pathname.slice(1,-5);reads.push(p+u.search);const value=get(p);return {ok:true,json:async()=>u.searchParams.has('shallow')?Object.fromEntries(Object.keys(value||{}).map(k=>[k,true])):copy(value)}}};
 vm.createContext(c);vm.runInContext(source,c);return c.MiniTalk.Shopping.CatalogCloud;
}
(async()=>{
 // Empty Firebase, even with an old device cache, is an intentional clean start.
 reset(initial());await client().read();put(CP,null);let cloud=client();assert.equal((await cloud.read()).length,0);assert.equal(writes.length,0);
 await cloud.change('save',fresh,'admin');assert.equal(get(CP+'/fieldSchema'),1);assert.equal(get(CP+'/initialized'),true);assert.equal(get(CP+'/products/'+key('old')),null);assert.equal((await client().read())[0].id,'new');
 // Missing index only: use current server products, repair metadata on an authorized save.
 reset(initial());put(CP+'/itemVersions',null);cloud=client();assert.equal((await cloud.read())[0].imageUrl,old.imageUrl);assert.equal(writes.length,0);
 await cloud.change('save',{...old,price:30,updatedAt:3},'admin',['price']);assert.equal(get(CP+'/products/'+key('old')+'/imageUrl'),old.imageUrl);assert(get(CP+'/itemVersions/'+key('old')+'/imageUrl'));
 // Orphan index, with old cached content: actual shallow keys win and no image is requested.
 reset(initial());await client().read();put(CP+'/products',null);reads=[];cloud=client();assert.equal((await cloud.read()).length,0);assert(!reads.some(p=>p.includes('/products')&&!p.endsWith('?shallow=true')));
 await cloud.change('save',fresh,'admin');assert.equal(get(CP+'/itemVersions/'+key('old')),null);assert.equal(get(CP+'/products/'+key('old')),null);assert(get(CP+'/products/'+key('new')));
 // Schema deletion preserves remaining products; a concurrent new item survives repair.
 reset(initial());put(CP+'/fieldSchema',null);cloud=client();await cloud.read();race=()=>put(CP+'/products/'+key('new'),fresh);
 await cloud.change('save',{...old,price:40,updatedAt:4},'admin',['price']);assert(get(CP+'/itemVersions/'+key('new')));assert.equal(get(CP+'/products/'+key('new')+'/price'),20);
 // A healthy empty shop does not perform initialization writes on every visit.
 reset({initialized:true,fieldSchema:1,empty:true});cloud=client();assert.equal((await cloud.read()).length,0);const before=reads.length;await cloud.read();assert.equal(reads.length,before);assert.equal(writes.length,0);
 // Normal deletion of the final product requires no product-content reads.
 reset(initial());cloud=client();await cloud.read();reads=[];await cloud.change('delete',{id:'old'},'admin');assert.equal((await cloud.read()).length,0);assert(!reads.some(p=>p.includes('/products')&&!p.endsWith('?shallow=true')));
 // Guests can display the surviving server catalogue, but never write recovery metadata.
 reset(initial());put(CP+'/itemVersions',null);assert.equal((await client(true).read())[0].id,'old');assert.equal(writes.length,0);
 reset(initial());await client().read();put(CP+'/products',null);assert.equal((await client(true).read()).length,0);assert.equal(writes.length,0);
 // Future/unsupported schemas must not silently be overwritten.
 reset({...initial(),fieldSchema:99});await assert.rejects(client().read(),/지원하지 않는/);assert.equal(writes.length,0);
 console.log('SHOPPING_CATALOG_RESET_RECOVERY_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
