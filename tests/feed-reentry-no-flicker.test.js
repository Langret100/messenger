const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const feed=fs.readFileSync(path.join(root,'js/features/feed.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(html.includes('js/features/feed.js?v=65.0.19'),'feed cache version stale');
ok(feed.includes('class:"view feed-shell"')&&!feed.includes('class:"view feed-shell view-enter"'),'feed entry animation still enabled');
ok(/function stopSub\(\)[\s\S]*?openCommentComposers\.clear\(\)[\s\S]*?\}/.test(feed),'feed leave cleanup missing');
const stop=(feed.match(/function stopSub\(\)\{([^}]*)\}/)||[])[1]||'';
ok(!stop.includes('state={posts:{}}')&&!stop.includes('cachedPostRows=[]'),'feed leave still clears visible cache');
ok(feed.includes('if(!hadVisiblePosts)paintCachedPosts()'),'cached feed first-paint guard missing');
ok(feed.includes('latest.forEach(row=>{if(row.value)applyPost('),'server refresh still replaces whole feed');
console.log('FEED_REENTRY_NO_FLICKER_OK');
