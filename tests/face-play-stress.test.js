const fs=require('fs'),vm=require('vm'),path=require('path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),ok=(v,m)=>{if(!v)throw new Error(m)};
const look=read('js/tools/lookalike-play.js'),face=read('js/tools/face-toy.js');
const sandbox={console,window:{},document:{},navigator:{},URLSearchParams,fetch:()=>Promise.reject(new Error('offline')),setTimeout,clearTimeout,MiniTalk:{Tools:{},UI:{Dom:{}},Store:{get:()=>({})},Realtime:{}}};
vm.createContext(sandbox); vm.runInContext(look,sandbox); vm.runInContext(face,sandbox);
const t=sandbox.MiniTalk.Tools.LookalikePlay._test;
// 50회 같은 생물: 후보 12장일 때 직전 이미지와 즉시 중복 없어야 하고 최근 기억은 5장 이하.
const candidates=Array.from({length:12},(_,i)=>({title:`img${i}`,info:{thumburl:`https://img/${i}.jpg`,mime:'image/jpeg'}}));
t.recentImageKeys.clear(); let prev='';
for(let i=0;i<50;i++){
  const chosen=t.chooseImageCandidate('otter',candidates,()=>((i*7)%12)/12),key=chosen.info.thumburl;
  ok(key!==prev,`immediate image repeat at ${i}`); prev=key;
  ok((t.recentImageKeys.get('otter')||[]).length<=5,'recent image memory grew beyond 5');
}
// 후보가 1장뿐이면 안전하게 같은 후보를 재사용하고 예외가 나지 않아야 함.
const one=[{title:'only',info:{thumburl:'https://img/only.jpg',mime:'image/jpeg'}}];
for(let i=0;i<10;i++) ok(t.chooseImageCandidate('single',one,()=>Math.random())===one[0],'single candidate fallback failed');
// 결과 종류/필터를 다양한 특징 조합으로 반복.
for(let i=0;i<400;i++){
 const m={brightness:(i%17)/16,contrast:(i%13)/12,warmth:(i%11)/10,green:(i%7)/6,symmetry:(i%19)/18,vertical:(i%5)/4};
 ok(t.pickResult(m,'animal').kind==='animal','animal stress filter failed');
 ok(t.pickResult(m,'plant').kind==='plant','plant stress filter failed');
}
// AudioContext가 없는 환경에서도 효과음 호출은 throw 하면 안 됨.
for(const name of ['count','shutter','scan','reveal','tap']) t.sound(name);
for(const name of ['shutter','effect','warp','done','tap']) sandbox.MiniTalk.Tools.FaceToy._test.sound(name);
// 개인정보 회귀: 네트워크 요청에 사진 직렬화/특징 객체가 들어갈 만한 경로 금지.
ok(!/JSON\.stringify\((metrics|m)\)|body\s*:\s*(metrics|m)|FormData|toDataURL\(|toBlob\(/.test(look),'lookalike privacy regression detected');
ok(/credentials:\"omit\"/.test(look)&&/referrerPolicy:\"no-referrer\"/.test(look),'privacy fetch flags missing');
console.log('FACE_PLAY_STRESS_OK');
