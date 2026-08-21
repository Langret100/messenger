const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const code=read('js/tools/lookalike-play.js'),tools=read('js/features/tools.js'),config=read('js/config.js'),html=read('index.html'),sw=read('sw.js'),css=read('css/features/lookalike-play.css');

ok(tools.includes('id: "lookalike"')&&tools.includes('openCameraTool(MiniTalk.Tools.LookalikePlay, \"닮은 생물 찾기\")'),'lookalike tool entry missing');
ok(!tools.includes('id: "playground"'),'online playground must be moved out of main tool grid');
ok(config.includes('{name:"온라인 놀이터",url:"https://langret100.github.io/multiroom-playground/"}'),'online playground related link missing');
ok(config.includes('{name:"동작 인식 게임",url:"https://langret100.github.io/Math-in-Math/"}'),'motion game related link missing');
ok(html.includes('css/features/lookalike-play.css?v=3')&&html.includes('js/tools/lookalike-play.js?v=3'),'lookalike assets missing');
ok(html.indexOf('js/tools/lookalike-play.js?v=3')<html.indexOf('js/features/tools.js?v=64.5.10'),'lookalike module must load before tools feature');
ok(sw.includes('./css/features/lookalike-play.css')&&sw.includes('./js/tools/lookalike-play.js'),'lookalike offline shell assets missing');

// 프라이버시: 로컬 영구 저장/기존 서버 업로드 금지. 온라인 요청은 Commons 공개 검색어만 사용.
const executable=code.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
ok(!/localStorage\.|indexedDB\.|caches\.|MiniTalk\.Realtime|firebase\.|sheetUrl|script\.google/i.test(executable),'lookalike must not persist/upload capture data');
ok(code.includes('const COMMONS_API = "https://commons.wikimedia.org/w/api.php"'),'commons-only image lookup missing');
ok(code.includes('gsrsearch:query'),'remote lookup must receive final result query only');
ok(!/gsrsearch:(metrics|m\.)/.test(code),'face metrics must never enter remote query');
ok(code.includes('credentials:"omit"')&&code.includes('referrerPolicy:"no-referrer"'),'privacy fetch options missing');
ok(code.includes('wipeCanvas(capture)')&&code.includes('c.width=1;c.height=1'),'captured pixels are not wiped after feature extraction');
ok(!code.includes('toDataURL(')&&!code.includes('toBlob('),'captured face must not be serialized');

// 모바일 카메라: 전면 기본, 전/후면 전환, 이전 stream 종료, 미리보기만 mirror.
ok(code.includes('let facing = "user"')&&code.includes('startCamera("user")'),'front camera default missing');
ok(code.includes('facing==="user"?"environment":"user"'),'camera switch missing');
ok(code.includes('facingMode:{exact:facing}')&&code.includes('facingMode:{ideal:facing}'),'camera facing fallback missing');
ok(code.includes('stream.getTracks().forEach(track=>track.stop())'),'camera stream stop missing');
ok(code.includes('video.classList.toggle("is-mirrored",facing==="user")'),'front mirror preview missing');

// 3·2·1 연출 + 큰 카메라 + 여백 있는 하단 조작.
ok(code.includes('for(const n of [3,2,1])'),'3-2-1 countdown missing');
ok(css.includes('.lookalike-stage')&&css.includes('flex:1 1 auto'),'camera stage is not dominant');
ok(css.includes('grid-template-columns:1fr 76px 1fr'),'bottom controls are not spaced');
ok(css.includes('@media(max-width:340px)'),'290px responsive rule missing');

// 결과 풀은 이름/검색어뿐이며 이미지 바이너리를 앱에 포함하지 않아야 함.
ok(code.includes('query:"otter animal portrait"')&&code.includes('query:"sunflower flower"'),'animal/plant result names missing');
ok(!/data:image\//i.test(code),'embedded image pool detected');


// 결과 폭/연출/효과음: 앱 내 이미지 풀 없이 충분히 다양한 이름을 제공하고, 결과는 바로 튀어나오지 않는다.
ok((code.match(/kind:"animal"/g)||[]).length>=20,'animal result pool too small');
ok((code.match(/kind:"plant"/g)||[]).length>=20,'plant result pool too small');
ok(code.includes('await revealPhase("분위기 비슷한 후보 찾는 중…",420,myRun)')&&code.includes('await revealPhase("거의 찾았다…",420,myRun)'),'analysis reveal pacing missing');
ok(css.includes('@keyframes lookalike-reveal')&&css.includes('@keyframes lookalike-media-in'),'result reveal animation missing');
ok(code.includes('sound("count")')&&code.includes('sound("shutter")')&&code.includes('sound("scan")')&&code.includes('sound("reveal")'),'lookalike sound cues missing');
ok(code.includes('gsrlimit:"16"'),'image candidate search should request a broad candidate set');

// 결정 로직 런타임: 동일 특징은 결과 객체를 내고 kind 필터를 지킨다.
const sandbox={console,window:{},document:{},navigator:{},URLSearchParams,fetch:()=>Promise.reject(new Error('not called')),MiniTalk:{Tools:{},UI:{Dom:{}},Store:{}}};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const t=sandbox.MiniTalk.Tools.LookalikePlay._test;
const m={brightness:.6,contrast:.4,warmth:.7,green:.3,symmetry:.8,vertical:.5};
const a=t.pickResult(m,'animal'),p=t.pickResult(m,'plant');
ok(a&&a.kind==='animal','animal filter failed');
ok(p&&p.kind==='plant','plant filter failed');
// 같은 결과명이어도 직전 5개 이미지 후보를 피하는지 런타임으로 확인.
const candidates=Array.from({length:8},(_,i)=>({title:`img${i}`,info:{thumburl:`https://img/${i}.jpg`,mime:'image/jpeg'}}));
t.recentImageKeys.clear();
const seen=[];
for(let i=0;i<7;i++) seen.push(t.chooseImageCandidate('otter',candidates,()=>0).info.thumburl);
ok(new Set(seen.slice(0,6)).size===6,'recent-image avoidance failed for same animal');
ok(seen[0]!==seen[1],'same image repeated immediately');
console.log('LOOKALIKE_LOCAL_PRIVACY_OK');
