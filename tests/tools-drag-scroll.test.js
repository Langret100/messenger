const fs=require('fs');
const tools=fs.readFileSync('js/features/tools.js','utf8');
const drag=fs.readFileSync('js/ui/drag-scroll.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(tools.includes('MiniTalk.UI.DragScroll?.bind?.(list,{allowInteractive:'), 'tools screen drag-scroll binding missing');
ok(tools.includes('class: "card-list tools-screen"'), 'tools scroll surface changed unexpectedly');
ok(drag.includes('button,input,textarea,select,a,iframe,video'), 'interactive controls must remain blocked from drag start');
ok(drag.includes('.profile-image')&&drag.includes('.media-bubble img'), 'profile/media click safeguards regressed');
ok(drag.includes('overscroll-behavior:none'), 'PiP overscroll safeguard regressed');
ok(html.includes('js/features/tools.js?v=64.5.15'), 'tools asset cache-bust missing');
ok(sw.includes('moaru-camera-popup-task-scroll-fix'), 'v94 SW cache missing');
console.log('TOOLS_DRAG_SCROLL_V94_OK');
