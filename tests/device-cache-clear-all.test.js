const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const code=fs.readFileSync(path.join(__dirname,'../js/adapters/data-cache.js'),'utf8');
(async()=>{
  const memory={MiniTalk:{},console};vm.runInNewContext(code,memory);await memory.MiniTalk.DataCache.put('feed-media','old','image');await memory.MiniTalk.DataCache.put('chat-message','old','text');await memory.MiniTalk.DataCache.clearAll();assert.equal(await memory.MiniTalk.DataCache.get('feed-media','old'),null);assert.equal((await memory.MiniTalk.DataCache.list('chat-message')).length,0);
  let clears=0;const db={transaction:()=>{const tx={objectStore:()=>({clear:()=>{clears++;queueMicrotask(()=>tx.oncomplete())}})};return tx}};
  const persisted={MiniTalk:{},console,indexedDB:{open:()=>{const req={result:db};queueMicrotask(()=>req.onsuccess());return req}}};vm.runInNewContext(code,persisted);await persisted.MiniTalk.DataCache.clearAll();assert.equal(clears,1);
  const failed={MiniTalk:{},console:{warn(){}},indexedDB:{open:()=>{const req={};queueMicrotask(()=>req.onerror());return req}}};vm.runInNewContext(code,failed);await assert.rejects(failed.MiniTalk.DataCache.clearAll(),/캐시/);
  console.log('DEVICE_CACHE_CLEAR_ALL_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
