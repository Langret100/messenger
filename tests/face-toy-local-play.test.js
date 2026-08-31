const fs=require('fs');
const vm=require('vm');
const path=require('path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const face=read('js/tools/face-toy.js'),tools=read('js/features/tools.js'),config=read('js/config.js'),html=read('index.html'),sw=read('sw.js'),css=read('css/features/face-toy.css');

ok(tools.includes('\"face-toy\": () => openCameraTool(MiniTalk.Tools.FaceToy, \"페이스 체인지\")'),'face toy action mapping missing');
ok(config.includes('{name:"페이스 체인지",tool:"face-toy"}'),'face toy related-link entry missing');
ok(!tools.includes('id: "motion-math"'),'motion game must leave main tools grid');
ok(config.includes('{name:"동작 인식 게임",url:"https://langret100.github.io/Math-in-Math/"}'),'motion game related link missing');
ok(html.includes('css/features/face-toy.css?v=6')&&html.includes('js/tools/face-toy.js?v=7'),'face toy assets not loaded');
ok(html.indexOf('js/tools/face-toy.js?v=7')<html.indexOf('js/tools/lookalike-play.js?v=5')&&html.indexOf('js/tools/lookalike-play.js?v=5')<html.indexOf('js/features/tools.js?v=64.5.17'),'face toy module must load before tools feature');
ok(sw.includes('./css/features/face-toy.css')&&sw.includes('./js/tools/face-toy.js'),'face toy offline assets missing');

// 로컬 전용: 자체 fetch/API/Firebase 경로가 없어야 하며, 공유 시 기존 Realtime.sendMessage만 재사용한다.
ok(!/\bfetch\s*\(/.test(face),'face toy must not perform its own network fetch');
ok(!/sheetUrl|firebase|script\.google|mediapipe|jsdelivr/i.test(face),'face toy introduced external/server dependency');
ok(face.includes('MiniTalk.Realtime.sendMessage(roomId'),'existing chat send path not reused');
ok(face.includes('MiniTalk.Realtime?.isRoomMember?.(room)'),'room picker must filter to joined rooms');
ok(face.includes('CHAT_DATA_LIMIT = 60 * 1024')&&face.includes('44 * 1024'),'chat image budget guard missing');

// 모바일 카메라: 기본 전면, exact 우선 전/후면 전환, 기존 stream stop, 전면 미리보기만 mirror.
ok(face.includes('let facing = "user"'),'front camera is not default');
ok(face.includes('startCamera("user")'),'open must start front camera');
ok(face.includes('facing === "user" ? "environment" : "user"'),'front/rear switch missing');
ok(face.includes('const media = mediaDevices()')&&face.includes('doc().defaultView || window'),'popup camera must use active document mediaDevices');
ok(face.includes('facingMode: { exact: facing }')&&face.includes('facingMode: { ideal: facing }'),'camera switch fallback chain missing');
ok(face.includes('stream.getTracks().forEach(track => track.stop())'),'old camera stream is not stopped');
ok(face.includes('video.classList.toggle("is-mirrored", facing === "user")'),'front preview mirror missing');
ok(!face.includes('ctx.scale(-1'),'saved image should not be mirror-flipped');

// 5개 놀이와 큰 카메라/여유 있는 하단 스크롤 UI.
for(const id of ['warp','swap','random','bighead','half'])ok(face.includes(`id: "${id}"`),`effect missing: ${id}`);
ok(css.includes('.face-toy-stage')&&css.includes('flex:1 1 auto'),'camera stage is not dominant');
ok(css.includes('.face-toy-effects')&&css.includes('overflow-x:auto')&&css.includes('touch-action:pan-x'),'effect controls should support native horizontal touch scroll');
ok(face.includes('bindEffectDrag(effectsNode)')&&face.includes('scroller.scrollLeft -= dx'),'desktop horizontal effect drag missing');
ok(tools.includes('openCameraTool(MiniTalk.Tools.FaceToy, "페이스 체인지")')&&!tools.includes('title: "얼굴 장난감"'),'tool name must remain 페이스 체인지');
ok(css.includes('min-width:74px')||css.includes('min-width: 74px'),'effect tap targets too dense/missing');
ok(css.includes('@media(max-width:340px)'),'290px/PiP responsive rules missing');


// 놀이 피드백 효과음: 외부 음원 다운로드 없이 WebAudio 합성으로 촬영/효과/완료 피드백.
ok(face.includes('w.AudioContext || w.webkitAudioContext'),'face toy local audio synth missing');
ok(face.includes('sound("shutter")')&&face.includes('sound("effect")')&&face.includes('sound("warp")')&&face.includes('sound("done")'),'face toy sound cues missing');
ok(!/new Audio\(|assets\/sounds\//.test(face),'face toy should not add downloadable sound assets');

// 종료 시 사진 픽셀/히스토리/얼굴 좌표를 즉시 폐기하고, 비동기 얼굴 감지가 닫힌 뒤 상태를 되살리지 않아야 한다.
ok(face.includes('for (const target of [sourceImage, canvas])')&&face.includes('ctx?.clearRect?.(0, 0, target.width || 1, target.height || 1)')&&face.includes('target.width = 1')&&face.includes('target.height = 1'),'face toy dispose must wipe image canvases');
ok(face.includes('sourceImage = null')&&face.includes('history = []')&&face.includes('faces = []')&&face.includes('canvas = null')&&face.includes('video = null'),'face toy dispose must release photo/history references');
ok(face.includes('let lifecycleId = 0')&&face.includes('token !== lifecycleId || canvas !== editCanvas || mode !== "edit"'),'async face detection must not restore disposed photo state');

// FaceDetector가 없을 때도 직접 얼굴 중심 선택으로 기능을 계속 쓸 수 있어야 한다.
ok(face.includes('selectFacesManually')&&face.includes('manual-face-pick'),'manual face fallback missing');

// memberRooms 실제 필터/정렬 경로 런타임 확인.
const sandbox={console,window:{},navigator:{},Image:function(){},FileReader:function(){},URL:{},crypto:{},MiniTalk:{Tools:{},UI:{Dom:{}},Store:{get:k=>k==='rooms'?{a:{id:'a',title:'A',updatedAt:1},b:{id:'b',title:'B',updatedAt:4},c:{id:'c',title:'C',updatedAt:2}}:{}},Realtime:{isRoomMember:r=>r.id!=='c'}}};
vm.createContext(sandbox);vm.runInContext(face,sandbox);
const rooms=sandbox.MiniTalk.Tools.FaceToy._test.memberRooms();
ok(rooms.length===2&&rooms[0].id==='b'&&rooms[1].id==='a','joined room filter/order runtime failed');

// PC 버튼 위 mousedown -> document mousemove 가로 드래그 실제 런타임. 클릭은 드래그 뒤 1회 차단된다.
function target(){const listeners={};return{scrollLeft:160,classList:{add(){},remove(){}},addEventListener(t,f){(listeners[t]??=[]).push(f)},removeEventListener(){},fire(t,e={}){for(const f of listeners[t]||[])f(e)},_listeners:listeners}}
const owner=target(), scroller=target(); scroller.ownerDocument=owner;
const cleanup=sandbox.MiniTalk.Tools.FaceToy._test.bindEffectDrag(scroller);
scroller.fire('mousedown',{button:0,clientX:100,clientY:20});
let prevented=false; owner.fire('mousemove',{clientX:45,clientY:23,preventDefault(){prevented=true}});
ok(scroller.scrollLeft===215&&prevented,'horizontal drag must move effect scroller and prevent native drag');
owner.fire('mouseup',{});
let clickBlocked=false; scroller.fire('click',{preventDefault(){clickBlocked=true},stopImmediatePropagation(){},stopPropagation(){}});
ok(clickBlocked,'drag release must suppress accidental effect click once');
cleanup();
console.log('FACE_TOY_LOCAL_PLAY_OK');
