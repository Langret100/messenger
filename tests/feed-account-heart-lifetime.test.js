const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/features/feed.js','utf8').replace('return{id:"feed",','return{commit:commitHeart,ensure:ensureHeartAccount,id:"feed",');
const accounts={},posts={p:{id:'p',user_id:'alice',hearts:{},heartVersions:{}}};let initialized=0,merges=0;
const M={Features:{},Registry:{register(){}},Realtime:{
 cloudGet:async p=>{const s=p.split('/');if(p.includes('receivedHearts'))return accounts[s[3]]?.total??null;if(p.includes('/totals/'))return s.at(-1)==='alice'?41:9;return structuredClone(posts[s.at(-1)]||null)},
 cloudTransaction:async(p,fn)=>{const k=p.split('/').at(-1),next=fn(accounts[k]||null);if(next!==undefined){accounts[k]=next;initialized++}return accounts[k]},
 commitFeedHeart:async({postId,ownerKey,userKey,on,version})=>{const p=posts[postId];if(!p||version!==(p.heartVersions[userKey]||0)+1||(p.hearts[userKey]===true)===on)throw Error('stale');on?p.hearts[userKey]=true:delete p.hearts[userKey];p.heartVersions[userKey]=version;accounts[ownerKey].total+=on?1:-1;merges++}
}};
vm.runInNewContext(src,{MiniTalk:M,console,crypto:require('node:crypto')});
(async()=>{const f=M.Features.Feed,old=structuredClone(posts.p);await f.commit(old,'bob',true,'one');assert.equal(accounts.alice.total,42);await f.commit(old,'bob',true,'duplicate');assert.equal(merges,1);await f.commit(structuredClone(posts.p),'bob',false,'two');assert.equal(accounts.alice.total,41);delete posts.p;await assert.rejects(f.commit(old,'bob',true,'deleted'));assert.equal(accounts.alice.total,41);posts.q={id:'q',user_id:'alice',hearts:{},heartVersions:{}};await f.commit(structuredClone(posts.q),'bob',true,'new');assert.equal(accounts.alice.total,42);assert.equal(initialized,1);console.log('account hearts survive feed reset; one atomic write per change; duplicates do not increment')})().catch(e=>{console.error(e);process.exitCode=1});
