const fs=require('fs');
const feed=fs.readFileSync('js/features/feed.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(feed.includes('const post=state.posts[String(postId)]||state.posts[postId]'),'heart click must read latest post state instead of stale card snapshot');
ok(feed.includes('heart.onclick=()=>toggleHeart(post.id,heart)'),'heart handler must pass post id, not captured post object');
ok(feed.includes('heart.onpointerdown=primeHeartAudio'),'heart audio must be primed inside pointer gesture');
ok(feed.includes('heartAudioCtx=new Ctx()')&&feed.includes('ctx.resume()'),'heart audio context must be reused/resumed');
ok(feed.includes('target.ownerDocument||MiniTalk.UI.Dom.doc()'),'heart burst must use the target document (normal/PiP-safe)');
ok(feed.indexOf('MiniTalk.UI.Shell.setHeader("소식",[headerHeartBadge()])')>=0&&feed.indexOf('MiniTalk.UI.Shell.setHeader("소식",[headerHeartBadge()])')<feed.lastIndexOf('ensureSub()}'),'feed header must exist before total-heart subscription starts');
ok(html.includes('js/features/feed.js?v=65.0.14'),'feed cache version stale');
ok(app.includes('sw.js?v=64.5.46')&&sw.includes('moaru-v64.5.46-profile-15kb-20260820'),'service worker cache version stale');
console.log('FEED_HEART_STATE_RACE_OK');
