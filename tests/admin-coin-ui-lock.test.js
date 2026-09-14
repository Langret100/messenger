const fs=require('fs');const src=fs.readFileSync('js/features/admin.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(src.includes('코인 처리 중... (${targets.length}명)'),'main admin coin progress label missing');
ok(src.includes('인원이 많으면 코인 변경에 최대 30초 정도 걸릴 수 있습니다.'),'main admin 30-second guidance missing');
ok(src.includes('error?.code==="REQUEST_TIMEOUT"')&&src.includes('send.textContent="코인 처리 확인 필요"'),'main admin timeout must stay locked for duplicate-payment safety');
ok(src.includes('코인 처리 중... (${targets.length}명)'),'group admin coin progress label missing');
ok(src.includes('sendGroup.textContent="코인 처리 확인 필요"'),'group admin timeout must stay locked for duplicate-payment safety');
ok(src.includes('중복 지급 방지를 위해 바로 다시 누르지 마세요.'),'timeout duplicate-payment warning missing');
console.log('ADMIN_COIN_UI_LOCK_OK');
