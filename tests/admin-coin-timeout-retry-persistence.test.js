const fs=require('fs');const src=fs.readFileSync('js/features/admin.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(src.includes('PENDING_COIN_STORAGE_KEY="admin.pendingCoinRequests.v1"'),'pending coin request storage missing');
ok(src.includes('PENDING_COIN_TTL=10*60*1000'),'pending coin request TTL missing');
ok(src.includes('readPendingCoinRequests();'),'pending request recovery on reload missing');
ok(src.includes('persistPendingCoinRequest(signature,requestId)'),'request id is not persisted before send');
ok(src.includes('clearPendingCoinRequest(signature)'),'completed request is not cleared');
console.log('ADMIN_COIN_TIMEOUT_RETRY_PERSISTENCE_OK');
