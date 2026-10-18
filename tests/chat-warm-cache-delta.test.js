const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('js/adapters/realtime.js','utf8'),chunk=src.slice(src.indexOf('  async function subscribeMessages(roomId){'),src.indexOf('  async function loadOlderMessages'));
let cached=[],allowed=true;const calls=[],events=[],saved=[],removed=[];
class Ref{constructor(path,q={}){this.path=path;this.q=q}orderByChild(order){return new Ref(this.path,{...this.q,order})}startAfter(ts,id){return new Ref(this.path,{...this.q,after:[ts,id]})}limitToLast(n){return new Ref(this.path,{...this.q,limit:n})}on(type,fn){calls.push({path:this.path,q:this.q,type,fn})}off(){}once(){return Promise.resolve({exists:()=>true})}}
const ctx={MiniTalk:{DataCache:{getMessages:async()=>cached,putMessage:async(r,m)=>saved.push(m),removeMessage:async(r,id)=>removed.push(id)}},db:{ref:path=>new Ref(path)},user:{user_id:'me'},mode:'firebase',CHAT_PAGE_SIZE:25,messageGeneration:0,requestedMessageRoom:null,messageUnsub:null,emit:(type,value)=>events.push({type,value}),awaitTransport:async()=>{},canReadRoomMessages:()=>allowed,messagesPath:r=>'messages/'+r,shallowChildKeys:async()=>['game-live'],console};
ctx.unsubscribeMessages=()=>{ctx.messageGeneration++;ctx.requestedMessageRoom=null;ctx.messageUnsub?.();ctx.messageUnsub=null};
vm.createContext(ctx);vm.runInContext(chunk,ctx);
(async()=>{
 await ctx.subscribeMessages('room');assert(calls.every(c=>c.q.limit===25&&!c.q.after));ctx.unsubscribeMessages();calls.length=events.length=0;
 cached=[{id:'a',ts:100,type:'image',image:'cached A'},{id:'b',ts:100,type:'image',image:'cached B'}];await ctx.subscribeMessages('room');assert.equal(events.filter(e=>e.type==='message').length,2);assert(calls.every(c=>c.q.after[0]===100&&c.q.after[1]==='b'&&c.q.limit===25));
 const callback=calls.find(c=>c.type==='child_added').fn;callback({key:'c',val:()=>({ts:101,text:'new'})});assert.equal(saved.length,1);ctx.unsubscribeMessages();callback({key:'late',val:()=>({ts:102})});assert.equal(saved.length,1,'late callbacks must stop on leave');
 calls.length=events.length=0;cached=[...cached,{id:'game-live',ts:102,type:'game'},{id:'game-deleted',ts:103,type:'game'},{id:'upload',ts:104,type:'file',uploadState:'pending'}];await ctx.subscribeMessages('room');assert(events.some(e=>e.type==='message'&&e.value.id==='game-live'));assert(!events.some(e=>e.type==='message'&&e.value.id==='game-deleted'));assert(removed.includes('game-deleted'));assert(calls.some(c=>c.path==='messages/room/upload'&&c.type==='value'));ctx.unsubscribeMessages();
 calls.length=0;allowed=false;await ctx.subscribeMessages('foreign');assert.equal(calls.length,0,'non-members must not subscribe to message bodies');
 console.log('CHAT_WARM_CACHE_DELTA_OK: local history; exclusive cursor; latest 25 limit; stale callbacks; pending upload; transient game validation; membership guard');
})().catch(e=>{console.error(e);process.exitCode=1});
