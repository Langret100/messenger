const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const rt=read('js/adapters/realtime.js'),config=read('js/config.js'),shell=read('js/ui/shell.js'),css=read('css/features/feed-classinfo-weekly.css'),rules=JSON.parse(read('database.rules.json'));
const ok=(v,m)=>{if(!v)throw new Error(m)};
for(const forbidden of ['capacitySessions','CAPACITY_SOFT_LIMIT','CAPACITY_RETRY_MS','waitForCapacity','estimateCapacity','capacitySessionPath','rt:capacity'])ok(!rt.includes(forbidden),`custom capacity gate remains: ${forbidden}`);
ok(!config.includes('capacitySessions'),'capacitySessions config path must be removed');
ok(!rules.rules?.moaru?.v3?.capacitySessions,'capacitySessions Firebase Rules must be removed');
ok(rt.includes('database.ref(".info/connected")'),'Firebase native connection state must drive admission wait');
ok(rt.includes('emit("connection-wait",{state:navigator.onLine===false?"offline":"waiting"})'),'connection waiting signal missing');
ok(rt.includes('emit("connection-wait",{state:"connected"})'),'connection resume signal missing');
ok(shell.includes('rt:connection-wait')&&shell.includes('실시간 서버에 다시 연결 중입니다.')&&shell.includes('연결이 복구되면 자동으로 계속합니다.'),'connection waiting UI missing');
ok(css.includes('.realtime-wait-host')&&!css.includes('.capacity-wait-host'),'waiting CSS should use generic realtime naming');
console.log('NATIVE_CONNECTION_WAIT_OK');

ok(shell.includes('인터넷은 연결되어 있어도 Firebase 재연결에 잠시 시간이 걸릴 수 있습니다.'),'connection retry note missing');
