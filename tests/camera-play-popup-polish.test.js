const fs=require('fs'),vm=require('vm'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const tools=read('js/features/tools.js'),face=read('js/tools/face-toy.js'),look=read('js/tools/lookalike-play.js');
const faceCss=read('css/features/face-toy.css'),lookCss=read('css/features/lookalike-play.css'),popupCss=read('css/features/camera-tool-window.css'),gameCss=read('css/features/game-community.css');
const html=read('index.html'),cameraShell=read('camera-tool.html'),cameraBoot=read('js/tools/camera-tool.js'),sw=read('sw.js');
ok(tools.includes('icon: "?"')&&tools.includes('title: "닮은 생물 찾기"'),'lookalike card icon should be question mark');
ok(tools.includes('openCameraTool(MiniTalk.Tools.FaceToy')&&tools.includes('openCameraTool(MiniTalk.Tools.LookalikePlay'),'camera tools must use desktop popup helper');
ok(tools.includes('gap = 42')&&tools.includes('scrollbars=no')&&tools.includes('MoaruCameraPlay'),'camera popup must avoid messenger with 42px gap and hide chrome scrollbars');
ok(tools.includes('popup = window.open(')&&!tools.includes('sourceView.open('),'popup must be opened by the original app window so camera-tool gets the real app as opener');
ok(!tools.includes('popup.addEventListener("load"')&&!tools.includes('.postMessage(')&&!tools.includes('.write(`<!doctype html>'),'parent must not mount camera UI through load/postMessage/document.write timing');
ok(cameraShell.includes('id="cameraToolRoot"')&&cameraShell.includes('camera-tool-window.css?v=1')&&cameraShell.includes('js/tools/camera-tool.js?v=2'),'same-origin camera shell must load its own responsive shell and bootstrap');
ok(cameraBoot.includes('window.opener')&&cameraBoot.includes('owner.location.origin !== location.origin'),'camera shell must self-bootstrap only from same-origin opener');
ok(cameraBoot.includes('module.open(() => window.close(), { host: root, doc: document, separate: true })'),'camera shell must mount the selected tool into its own document');
ok(cameraBoot.includes('module?.dispose?.()')&&cameraBoot.includes('pagehide'),'camera shell must dispose the camera stream when its window closes');
ok(popupCss.includes('grid-template-columns:repeat(5,minmax(0,1fr))'),'desktop face effects must remain visible in one responsive row');
ok(popupCss.includes('min-height:0!important;max-height:none!important;flex:1 1 0'),'desktop camera stages must yield height to controls');
ok(popupCss.includes('@media (max-height:680px)')&&popupCss.includes('@media (max-width:700px)'),'desktop popup must respond to short/narrow PC windows');
ok(sw.includes('./camera-tool.html')&&sw.includes('./js/tools/camera-tool.js')&&sw.includes('./css/features/camera-tool-window.css'),'camera popup shell and bootstrap must be offline assets');
ok(face.includes('const media = mediaDevices()')&&look.includes('const media=mediaDevices()'),'camera modules must resolve mediaDevices from the active document');
ok(face.includes('doc().defaultView || window')&&look.includes('doc().defaultView || window'),'camera permission requests must belong to the visible camera popup document');
ok(tools.includes('MobileImmersive?.isMobile?.()')&&tools.includes('/CrOS/i'),'mobile must remain inline while Chromebook/desktop uses popup');
ok(face.includes('velocity *= .91')&&face.includes('raf(step)'),'face JS should implement inertial horizontal drag');
ok(faceCss.includes('.face-toy-effects.dragging')&&faceCss.includes('scroll-snap-type:none'),'dragging should temporarily disable snap for smooth inertia');
ok(face.includes('isSeparate: () => separateWindow')&&look.includes('isSeparate:()=>separateWindow'),'camera tools must expose separate-window state');
ok(gameCss.includes('.game-library{overflow-y:auto!important;overflow-x:hidden!important;scrollbar-width:none')&&gameCss.includes('.game-library::-webkit-scrollbar'),'mini-game chooser scrollbar must be hidden while scrolling remains');
ok(html.includes('face-toy.js?v=7')&&html.includes('lookalike-play.js?v=5')&&html.includes('tools.js?v=64.5.15'),'camera cache refs stale');

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
