// Run production signup, realtime, economy, catalogue and task services against an empty store.
// Firebase/Apps transport is mocked; this test never connects to the deployed project.
const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path'),cryptoNode=require('crypto');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8'),copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
let tree={},pushId=0;const watchers=new Set();
const get=p=>p?p.split('/').reduce((v,k)=>v?.[k],tree)??null:tree;
function set(p,v){if(!p){tree=copy(v)||{};return}const a=p.split('/'),last=a.pop();let n=tree;for(const k of a)n=n[k]??={};if(v==null)delete n[last];else n[last]=copy(v)}
class Snap{constructor(key,value){this.key=key;this.value=copy(value)}val(){return copy(this.value)}exists(){return this.value!=null}forEach(fn){for(const[k,v]of Object.entries(this.value||{}))if(fn(new Snap(k,v))===true)break}numChildren(){return Object.keys(this.value||{}).length}}
class Ref{
 constructor(p='',q={}){this.path=p;this.q=q;this.key=p.split('/').at(-1)}
 child(p){return new Ref([this.path,p].filter(Boolean).join('/'))}
 orderByChild(order){return new Ref(this.path,{...this.q,order})}orderByKey(){return this}
 startAt(start){return new Ref(this.path,{...this.q,start})}endAt(end){return new Ref(this.path,{...this.q,end})}
 limitToLast(last){return new Ref(this.path,{...this.q,last})}limitToFirst(first){return new Ref(this.path,{...this.q,first})}
 value(){if(this.path==='.info/connected')return true;const v=get(this.path);if(!Object.keys(this.q).length)return v;let rows=Object.entries(v||{}),value=([k,x])=>this.q.order?x?.[this.q.order]:k;rows.sort((a,b)=>value(a)<value(b)?-1:1);if(this.q.start!==undefined)rows=rows.filter(x=>value(x)>=this.q.start);if(this.q.end!==undefined)rows=rows.filter(x=>value(x)<=this.q.end);if(this.q.last)rows=rows.slice(-this.q.last);if(this.q.first)rows=rows.slice(0,this.q.first);return Object.fromEntries(rows)}
 async once(){return new Snap(this.key,this.value())}
 async set(v){set(this.path,v);notify()}
 async update(patch){for(const[k,v]of Object.entries(patch))set([this.path,k].filter(Boolean).join('/'),v);notify()}
 async remove(){return this.set(null)}
 push(){return this.child('push-'+(++pushId))}
 async transaction(fn){const next=fn(copy(this.value())),committed=next!==undefined;if(committed){set(this.path,next);notify()}return{committed,snapshot:new Snap(this.key,this.value())}}
 on(type,fn){const w={ref:this,type,fn,last:null};watchers.add(w);if(type==='value'){w.last=copy(this.value());queueMicrotask(()=>fn(new Snap(this.key,w.last)))}else{w.last=copy(this.value()||{});if(type==='child_added')for(const[k,v]of Object.entries(w.last))queueMicrotask(()=>fn(new Snap(k,v)))}return fn}
 off(type,fn){for(const w of watchers)if(w.ref.path===this.path&&w.type===type&&w.fn===fn)watchers.delete(w)}
 onDisconnect(){return{update:async()=>{},cancel:async()=>{}}}
}
function notify(){for(const w of watchers){const next=copy(w.ref.value());if(JSON.stringify(next)===JSON.stringify(w.last))continue;const before=w.last;w.last=next;if(w.type==='value')queueMicrotask(()=>w.fn(new Snap(w.ref.key,next)));else{for(const[k,v]of Object.entries(next||{})){const changed=JSON.stringify(before?.[k])!==JSON.stringify(v);if((w.type==='child_added'&&!before?.[k])||(w.type==='child_changed'&&before?.[k]&&changed))queueMicrotask(()=>w.fn(new Snap(k,v)))}if(w.type==='child_removed')for(const[k,v]of Object.entries(before||{}))if(!next?.[k])queueMicrotask(()=>w.fn(new Snap(k,v)))}}}
class CE extends Event{constructor(t,o={}){super(t);this.detail=o.detail}}
const store=new Map(),cache=new Map(),listeners=new EventTarget();
const database=()=>({ref:p=>new Ref(p)});database.ServerValue={TIMESTAMP:Date.now()};
const context={console,queueMicrotask,EventTarget,Event,CustomEvent:CE,TextEncoder,Uint8Array,URL,URLSearchParams,crypto:cryptoNode.webcrypto,btoa:s=>Buffer.from(s,'binary').toString('base64'),setTimeout,clearTimeout,setInterval,clearInterval,navigator:{onLine:true},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},document:{scripts:[]},firebase:{apps:[{}],app:()=>({}),database},addEventListener:(t,f)=>listeners.addEventListener(t,f),removeEventListener:(t,f)=>listeners.removeEventListener(t,f),fetch:async url=>{const u=new URL(url),p=decodeURIComponent(u.pathname.slice(1,-5)),v=get(p);assert(u.hostname==='fixture.test','live network forbidden');return{ok:true,json:async()=>u.searchParams.has('shallow')?Object.fromEntries(Object.keys(v||{}).map(k=>[k,true])):copy(v)}}};context.window=context;
vm.createContext(context);
for(const f of ['js/config.js','js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js'])vm.runInContext(read(f),context,{filename:f});
context.MiniTalkConfig.firebase.apiKey='fixture-key-never-used-online';context.MiniTalkConfig.firebase.databaseURL='https://fixture.test';
const M=context.MiniTalk;
M.DataCache={list:async type=>[...cache.entries()].filter(([k])=>k.startsWith(type+':')).map(([k,v])=>({key:k.slice(type.length+1),value:copy(v)})),get:async(t,k,d)=>copy(cache.get(t+':'+k)??d),put:async(t,k,v)=>cache.set(t+':'+k,copy(v)),remove:async(t,k)=>cache.delete(t+':'+k),getMessages:async()=>[],getMessagesBefore:async()=>[],putMessage:async()=>{},removeMessageRoom:async()=>{}};
M.Chat={ServerBackup:{room(){},message(){}}};M.AdminSession={requireToken:()=> 'token',authorized:()=>true};M.UI.Shell={toast(){}};M.Tools.Notifications={};M.UserDirectory={all:()=>[M.Store.get('user')],isGuest:()=>false};
// Reuse the real Apps Script fixture setup, but with no account/reward rows.
let serverSetup=read('tests/signup-coin-init.test.js').split('const signed=parse')[0];
serverSetup=serverSetup.replace(',["admin-user","admin","pw","관리자","",""]','').replace(',["admin-user","admin",100,"https://example.test/?user_id=admin-user"]','');
const serverOuter={require,console,__dirname:path.join(root,'tests')};vm.createContext(serverOuter);vm.runInContext(serverSetup+'\nglobalThis.fixture={ctx,login,reward,props,parse};',serverOuter);
const server=serverOuter.fixture,S=server.ctx;S.PropertiesService.getDocumentProperties=S.PropertiesService.getScriptProperties;S.Utilities.newBlob=s=>({getBytes:()=>Buffer.from(s)});
const call=(name,parameter)=>server.parse(S[name]({parameter}));
M.AuthApi={coinStatus:async id=>{const row=S.getRewardUserData_(id);if(!row)throw Object.assign(Error('NO_REWARD_USER'),{code:'NO_REWARD_USER'});return Number(row.coin)},economyEnsureUser:async()=>{throw Error('signup should create account first')},userCommands:async()=>[],userTaskList:async id=>call('handleUserTaskList',{user_id:id}).tasks||[],adminTaskList:async()=>[],taskSheetSync:async()=>({ok:true}),economySheetSync:async({userId,event})=>{const row=S.getRewardUserData_(userId);if(row&&Number.isSafeInteger(Number(event.balance)))server.reward.rows[row.rowIndex-1][2]=Number(event.balance);return{ok:true}},shopSaveProduct:async(uid,token,p,revision)=>{const r=call('handleShopProductSave',{user_id:uid,admin_token:token,product_id:p.id,name:p.name,price:p.price,description:p.description,quantity:p.quantity,image_url:p.imageUrl,backup_revision:revision});if(!r.ok)throw Error(r.error);return r},shopDeleteProduct:async(uid,token,id,revision)=>{const r=call('handleShopProductDelete',{user_id:uid,admin_token:token,product_id:id,backup_revision:revision});if(!r.ok)throw Error(r.error);return r},shopInventory:async()=>[]};
for(const f of ['js/adapters/realtime.js','js/economy/coin-wallet.js','js/economy/runtime.js','js/shopping/catalog-cloud.js','js/shopping/store-service.js','js/tasks/task-service.js','js/tasks/daily-quest-clock.js','js/tasks/daily-math-quest.js','js/tasks/daily-korean-quest.js','js/tasks/friday-grade6-mission.js'])vm.runInContext(read(f),context,{filename:f});
const idle=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
 assert.equal(Object.keys(tree).length,0,'Firebase starts at an entirely empty root');assert.equal(server.login.rows.length,1);assert.equal(server.reward.rows.length,1);assert.equal(server.props.size,0);
 set('moaru/v3/economyRuntime/deviceGeneration','fresh-generation');
 const a=server.parse(S.signup_({user_id:'fresh-a',username:'a',password:'pw',nickname:'새 사용자 A'})),b=server.parse(S.signup_({user_id:'fresh-b',username:'b',password:'pw',nickname:'새 사용자 B'}));assert(a.ok&&b.ok);assert.equal(a.coin,0);assert.equal(b.coin,0);
 const login=server.parse(S.login_({username:'a',password:'pw'}));assert(login.ok);assert.equal(login.coin,0);M.Store.set('user',{...login,isGuest:false});
 assert.equal(await M.Realtime.init(M.Store.get('user')),'firebase');await M.Realtime.startRoomListSubscription();assert(get('rooms/global'),'default room is regenerated');
 const room=await M.Realtime.createRoom('처음 만든 방');await M.Realtime.sendMessage(room.id,{text:'초기화 후 첫 대화'});assert.equal(Object.values(get('socialChatRooms/'+room.id)||{})[0].text,'초기화 후 첫 대화');
 await M.Realtime.saveProfile({avatar:'',statusMsg:'새 프로필'});assert(get('moaru/v3/profiles/fresh-a'));
 assert.equal(await M.Economy.Runtime.balance('fresh-a'),0);assert.equal((await M.Economy.Runtime.inventory('fresh-a')).length,0);assert.equal((await M.Tasks.TaskService.enter()).length,0);
 assert.equal((await M.Shopping.CatalogCloud.read()).length,0);assert.equal(M.Tasks.DailyMathQuest.loadProgress().correct.addition,0);assert.equal(M.Tasks.DailyKoreanQuest.loadProgress().correct.spelling,0);
 const weekly=M.Tasks.FridayGrade6Mission.makeQuestions();assert.equal(weekly.length,20);assert.equal(new Set(weekly.map(q=>q.text)).size,20);
 const assigned=await M.Tasks.TaskService.assign(['fresh-a'],{title:'새 과제',description:'초기화 후 제출',rewardCoin:5});assert.equal(assigned.count,1);await M.Tasks.TaskService.submit(assigned.task_ids[0],'첫 제출');await M.Tasks.TaskService.adminList(true);await M.Tasks.TaskService.completeReview(assigned.task_ids[0],'확인');assert.equal(await M.Economy.Runtime.balance('fresh-a'),5);
 const reward=await M.Economy.Runtime.reward({userId:'fresh-a',rewardType:'DAILY_MATH_QUEST',rewardKey:'fresh-week',amount:1,reason:'새 퀘스트'});assert.equal(reward.newCoin,6);const repeated=await M.Economy.Runtime.reward({userId:'fresh-a',rewardType:'DAILY_MATH_QUEST',rewardKey:'fresh-week',amount:1,reason:'새 퀘스트'});assert.equal(repeated.applied,false);
 const product=await M.Shopping.StoreService.saveProduct({name:'새 상품',price:2,quantity:2,description:'초기화 후 상품',imageUrl:''});assert.equal(product.backupPending,false);
 const purchased=await M.Economy.Runtime.purchase({userId:'fresh-a',product,purchaseKey:'first-order',chargePrice:2});assert.equal(purchased.newCoin,4);assert.equal((await M.Economy.Runtime.inventory('fresh-a')).length,1);
 await M.Economy.Runtime.requestDelivery({userId:'fresh-a',inventoryId:purchased.item.id,requestId:'first-delivery'});assert.equal((await M.Economy.Runtime.inventory('fresh-a'))[0].deliveryStatus,'requested');
 const gifted=await M.Economy.Runtime.purchase({userId:'fresh-a',product,purchaseKey:'second-order',chargePrice:2});await M.Economy.Runtime.gift({userId:'fresh-a',targetId:'fresh-b',inventoryId:gifted.item.id,nickname:'A',requestId:'first-gift'});assert.equal((await M.Economy.Runtime.inventory('fresh-b')).length,1);assert.equal(await M.Economy.Runtime.balance('fresh-b'),0);
 const removed=await M.Shopping.StoreService.deleteProduct(product.id);assert.equal(removed.backupPending,false);assert.equal((await M.Shopping.CatalogCloud.read()).length,0);
 assert.equal(get('moaru/v3/economyRuntime/deviceGeneration'),'fresh-generation','economy/catalogue/task writes must preserve the reset generation');
 await idle();M.Realtime.cleanup();console.log('FULL_DATA_RESET_STARTUP_OK');
})().catch(e=>{M.Realtime.cleanup();console.error(e);process.exitCode=1});
