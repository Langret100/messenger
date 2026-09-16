const fs=require('fs');const src=fs.readFileSync('js/features/feed.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(src.includes('pendingHeartRequests=new Set()'),'per-post in-flight heart lock missing');
ok(src.includes('pendingHeartRequests.has(requestKey)'),'duplicate heart request guard missing');
ok(src.includes('function canonicalHeartCount(post)')&&src.includes('post.heartCount=canonicalHeartCount(post)'),'heart count must derive from heart owners, not += delta');
ok(!src.includes('next.heartCount=Math.max(0,(Number(next.heartCount)||0)+delta)'),'legacy heart arithmetic remains');
console.log('FEED_HEART_SINGLE_STEP_OK');
ok(!/function stopSub\(\)[\s\S]*?pendingHeartRequests\.clear\(\)/.test(src),'route leave must not clear an in-flight heart request lock');
ok(src.includes('`${safeUserKey(u.user_id)}|${String(post.id)}`'),'heart request lock must be scoped by user and post');
