const fs=require('fs');const src=fs.readFileSync('js/features/feed.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(src.includes('function canonicalHeartCount(post)'), 'canonical heart membership counter missing');
ok(src.includes('nextCount=canonicalHeartCount(post)'), 'heart patch must render canonical membership count');
ok(src.includes('heartCount=canonicalHeartCount(post)'), 'new card must render canonical membership count');
ok(src.includes('normalized.heartCount=canonicalHeartCount(normalized)'), 'incoming cached/server post must normalize stale heartCount');
ok(!src.includes('text:String(Number(post.heartCount)||0)'), 'UI still trusts stale stored heartCount');
ok(src.includes('async function reconcileOwnHeartTotal()'), 'received-heart total must self-heal from canonical post membership');
ok(!src.includes('누적 하트 갱신이 실패하면 게시물 하트도 원상복구'), 'derived total failure must not roll back canonical post heart');
console.log('FEED_HEART_CANONICAL_COUNT_OK');
