const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('js/features/feed.js','utf8').replace('return{id:"feed",','return{reconcile:reconcileFeedCacheAndLimit,id:"feed",');
const posts=Object.fromEntries(Array.from({length:37},(_,i)=>['p'+i,{id:'p'+i,createdAt:i+1}]));
let writes=0;
const M={Features:{},Registry:{register(){}},Router:{current:()=>''},DataCache:{list:async()=>[]},Realtime:{
 cloudKeys:async()=>Object.keys(posts),
 cloudQueryChildren:async(p,q)=>Object.entries(posts).sort((a,b)=>a[1].createdAt-b[1].createdAt).slice(0,q.limitToFirst).map(([key,value])=>({key,value})),
 cloudUpdate:async(p,rows)=>{writes++;assert.equal(p,'moaru/v3/feedState/posts');for(const [k,v]of Object.entries(rows)){assert.equal(v,null);delete posts[k]}},
 cloudRemove:async p=>assert(p.startsWith('moaru/v3/feedMedia/'))
}};
vm.runInNewContext(src,{MiniTalk:M,console,crypto:require('node:crypto')});
(async()=>{await M.Features.Feed.reconcile();assert.equal(Object.keys(posts).length,30);assert(posts.p7&&posts.p36);assert(!posts.p6);await M.Features.Feed.reconcile();assert.equal(writes,1);for(const k of Object.keys(posts))delete posts[k];await M.Features.Feed.reconcile();assert.equal(writes,1);console.log('feed retention: newest 30; no account writes or whole-feed rewrite')})().catch(e=>{console.error(e);process.exitCode=1});
