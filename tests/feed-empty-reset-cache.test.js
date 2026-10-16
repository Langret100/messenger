const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../js/features/feed.js'),'utf8').replace('return{id:"feed",','return{reconcile:reconcileFeedCacheAndLimit,posts:()=>state.posts,seed:posts=>{state={posts}},generation:()=>feedGeneration++,id:"feed",');
function fixture(keys){
  const cache=new Map(['feed-post','feed-media','feed-thumb'].map(t=>[t+':old',{id:'old',createdAt:1}]));
  const M={Features:{},Registry:{register(){}},Router:{current:()=>''},Realtime:{cloudKeys:async()=>typeof keys==='function'?await keys():keys},DataCache:{list:async t=>[...cache].filter(([k])=>k.startsWith(t+':')).map(([k,value])=>({key:k.slice(t.length+1),value})),remove:async(t,k)=>cache.delete(t+':'+k)}};
  vm.runInNewContext(source,{MiniTalk:M,console,structuredClone});M.Features.Feed.seed({old:{id:'old',createdAt:1}});return{feed:M.Features.Feed,cache};
}
(async()=>{
  const empty=fixture([]);await empty.feed.reconcile();assert.equal(empty.cache.size,3);assert.equal(Object.keys(empty.feed.posts()).length,1);
  const archive=fixture(['current']);await archive.feed.reconcile();assert.equal(archive.cache.size,3);assert(archive.feed.posts().old);
  let resolve;const concurrent=fixture(()=>new Promise(r=>resolve=r)),pending=concurrent.feed.reconcile();await new Promise(r=>setImmediate(r));concurrent.feed.posts().new={id:'new',createdAt:2};concurrent.cache.set('feed-post:new',{id:'new'});resolve([]);await pending;assert(concurrent.feed.posts().new);assert(concurrent.cache.has('feed-post:new'));assert(concurrent.feed.posts().old);
  const offline=fixture(()=>{throw Error('offline')});await assert.rejects(offline.feed.reconcile(),/offline/);assert.equal(offline.cache.size,3);assert(offline.feed.posts().old);
  const changed=fixture(()=>{changed.feed.generation();return[]});await changed.feed.reconcile();assert.equal(changed.cache.size,3);
  console.log('FEED_EMPTY_RESET_CACHE_OK');
})().catch(e=>{console.error(e);process.exitCode=1});
