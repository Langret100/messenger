const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.resolve(__dirname,'..');
const store=new Map();
class CE extends Event{constructor(t,o={}){super(t);this.detail=o.detail}}
const ctx={console,EventTarget,Event,CustomEvent:CE,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},document:{},window:null};ctx.window=ctx;vm.createContext(ctx);
for(const f of ['js/core/namespace.js','js/core/events.js','js/core/store.js','js/adapters/persistence.js','js/chat/unread.js'])vm.runInContext(fs.readFileSync(root+'/'+f,'utf8'),ctx,{filename:f});
const U=ctx.MiniTalk.Chat.Unread;ctx.MiniTalk.Store.set('user',{user_id:'user-a'});
U.syncRooms({a:{id:'a',lastMessageAt:100}},null); if(U.count('a')!==0)throw new Error('initial room should not count unread');
U.syncRooms({a:{id:'a',lastMessageAt:200}},null); if(U.count('a')!==1)throw new Error('room update should count unread');
U.syncRooms({a:{id:'a',lastMessageAt:300}},'a'); if(U.count('a')!==1)throw new Error('active room should not add unread');
U.clear('a',300); if(U.count('a')!==0)throw new Error('clear failed');ctx.MiniTalk.Store.set('user',{user_id:'user-b'});U.syncRooms({a:{id:'a',lastMessageAt:400}},null);if(U.count('a')!==0)throw new Error('unread state leaked across users');ctx.MiniTalk.Store.set('user',{user_id:'user-a'});if(U.count('a')!==0)throw new Error('original user unread state corrupted');
console.log('UNREAD_SYNC_OK');
