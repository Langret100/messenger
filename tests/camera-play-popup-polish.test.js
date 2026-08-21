const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const tools=read('js/features/tools.js'),face=read('js/tools/face-toy.js'),look=read('js/tools/lookalike-play.js');
const faceCss=read('css/features/face-toy.css'),lookCss=read('css/features/lookalike-play.css'),gameCss=read('css/features/game-community.css'),html=read('index.html'),cameraShell=read('camera-tool.html'),sw=read('sw.js');
ok(tools.includes('icon: "?"')&&tools.includes('title: "닮은 생물 찾기"'),'lookalike card icon should be question mark');
ok(tools.includes('openCameraTool(MiniTalk.Tools.FaceToy')&&tools.includes('openCameraTool(MiniTalk.Tools.LookalikePlay'),'camera tools must use desktop popup helper');
ok(tools.includes('gap = 42')&&tools.includes('scrollbars=no')&&tools.includes('MoaruCameraPlay'),'camera popup must avoid messenger with 42px gap and hide chrome scrollbars');
ok(tools.includes('sourceView.open(')&&tools.includes('cameraToolUrl(toolId, token)')&&!tools.includes('d.write(`<!doctype html>'),'camera popup must open a real same-origin shell instead of about:blank document.write cloning');
ok(cameraShell.includes('id="cameraToolRoot"')&&cameraShell.includes('face-toy.css?v=6')&&cameraShell.includes('lookalike-play.css?v=5'),'same-origin camera shell must own its root and styles');
ok(cameraShell.includes('카메라 화면을 준비하고 있어요…'),'camera popup should show a styled loading state while the module mounts');

ok(tools.includes('sourceView.addEventListener("message", onReadyMessage)')&&tools.indexOf('sourceView.addEventListener("message", onReadyMessage)')<tools.indexOf('sourceView.open('),'ready listener must be installed before popup navigation starts');
ok(cameraShell.includes('window.opener.postMessage(payload, location.origin)')&&cameraShell.includes('moaru-camera-tool-ready'),'camera shell must explicitly handshake after DOM readiness');
ok(tools.includes('event.source !== popup')&&tools.includes('data.token !== token')&&tools.includes('data.tool !== toolId'),'camera popup handshake must validate source/token/tool');
ok(faceCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'desktop face effects must remain visible in one responsive control row');
ok(faceCss.includes('flex:1 1 0;min-height:0;max-height:none')&&lookCss.includes('flex:1 1 0;min-height:0;max-height:none'),'desktop camera stages must yield space to controls instead of pushing UI offscreen');
ok(lookCss.includes('grid-template-columns:minmax(120px,1fr) 88px minmax(120px,1fr)'),'desktop lookalike controls need size-aware spacing');
ok(sw.includes('./camera-tool.html'),'camera popup shell must be available offline');
ok(face.includes('activeDoc?.defaultView?.navigator?.mediaDevices')&&look.includes('activeDoc?.defaultView?.navigator?.mediaDevices'),'camera permission requests must originate from the visible camera window document');
ok(tools.includes('MobileImmersive?.isMobile?.()')&&tools.includes('/CrOS/i'),'mobile must remain inline while Chromebook/desktop uses popup');
ok(face.includes('velocity *= .91')&&face.includes('raf(step)'),'face JS should implement inertial horizontal drag');
ok(faceCss.includes('.face-toy-effects.dragging')&&faceCss.includes('scroll-snap-type:none'),'dragging should temporarily disable snap for smooth inertia');
ok(face.includes('isSeparate: () => separateWindow')&&look.includes('isSeparate:()=>separateWindow'),'camera tools must expose separate-window state');
ok(faceCss.includes('.camera-tool-window-body .face-toy-stage')&&lookCss.includes('.camera-tool-window-body .lookalike-stage'),'desktop popup needs large camera layouts');
ok(gameCss.includes('.game-library{overflow-y:auto!important;overflow-x:hidden!important;scrollbar-width:none')&&gameCss.includes('.game-library::-webkit-scrollbar'),'mini-game chooser scrollbar must be hidden while scrolling remains');
ok(html.includes('face-toy.css?v=6')&&html.includes('lookalike-play.css?v=5')&&html.includes('game-community.css?v=19')&&html.includes('tools.js?v=64.5.13'),'cache refs stale');

// 관성 드래그 런타임: 손을 뗀 뒤에도 짧게 이동하고 매 프레임 감속해야 한다.
const sandbox={console,Date,window:{},navigator:{},Image:function(){},FileReader:function(){},URL:{},crypto:{},MiniTalk:{Tools:{},UI:{Dom:{}},Store:{get:()=>({})},Realtime:{}}};
vm.createContext(sandbox);vm.runInContext(face,sandbox);
const bind=sandbox.MiniTalk.Tools.FaceToy._test.bindEffectDrag;
function eventTarget(){const listeners={};return{scrollLeft:100,classList:{add(){},remove(){}},addEventListener(t,f){(listeners[t]??=[]).push(f)},removeEventListener(){},fire(t,e={}){for(const f of listeners[t]||[])f(e)}}}
const owner=eventTarget(),scroller=eventTarget(),frames=[];
owner.defaultView={requestAnimationFrame(cb){frames.push(cb);return frames.length},cancelAnimationFrame(){},matchMedia(){return{matches:false}}};scroller.ownerDocument=owner;
const cleanup=bind(scroller);let now=1000; sandbox.Date.now=()=>now;
scroller.fire('mousedown',{button:0,clientX:120,clientY:20});now+=16;owner.fire('mousemove',{clientX:80,clientY:21,preventDefault(){}});now+=16;owner.fire('mousemove',{clientX:55,clientY:21,preventDefault(){}});
const beforeRelease=scroller.scrollLeft;owner.fire('mouseup',{});ok(frames.length>0,'inertia frame was not scheduled');frames.shift()();ok(scroller.scrollLeft>beforeRelease,'scroll should continue briefly after mouse release');cleanup();

console.log('CAMERA_PLAY_POPUP_POLISH_OK');
