const fs=require('fs');
const html=fs.readFileSync('index.html','utf8');
const tools=fs.readFileSync('js/features/tools.js','utf8');
const drag=fs.readFileSync('js/ui/drag-scroll.js','utf8');
const css=fs.readFileSync('css/features/tools.css','utf8');
const wm=fs.readFileSync('js/adapters/window-mode.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};

ok(html.includes('css/features/tools.css?v=20'),'tools css v98 cache ref missing');
ok(html.includes('js/ui/drag-scroll.js?v=9'),'drag-scroll v98 cache ref missing');
ok(html.includes('js/features/tools.js?v=64.5.3'),'tools v98 cache ref missing');
ok(html.includes('js/adapters/window-mode.js?v=64.5.38'),'window-mode v98 cache ref missing');
ok(sw.includes('moaru-v64.5.60-tools-pip-real-fix-v101-20260821'),'v98 service-worker cache missing');

ok(tools.includes('allowInteractive:".profile-summary,.modern-tool,.shortcut-row"'),'tools interactive drag allowance missing');
ok(drag.includes('const allowInteractive=String(options?.allowInteractive||"").trim()'),'drag allowInteractive option missing');
ok(drag.includes('const explicitlyAllowed=Boolean(allowInteractive&&target.closest?.(allowInteractive))'),'interactive drag selector not applied');
ok(drag.includes('Math.hypot(dx,dy)<5'),'click-vs-drag movement threshold missing');
ok(drag.includes('suppressClick=true'),'drag click suppression missing');

ok(/\.tools-screen\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s.test(css),'tools screen is not a real bounded scroll surface');
ok(css.includes('.tools-screen::-webkit-scrollbar'),'tools hidden scrollbar rule missing');

// The main messenger itself must never be resized after launch.
ok(!wm.includes('window.resizeTo('),'runtime main-window resizeTo remains');
ok(!wm.includes('popupHandle?.resizeTo'),'delayed main popup resize remains');
ok(wm.includes('PIP_BOUNDS={width:290,height:560}'),'PiP requested initial size changed');
ok(wm.includes('documentPictureInPicture.requestWindow({...PIP_BOUNDS'),'PiP initial request path missing');

console.log('V98_TOOLS_WINDOW_STABILITY_OK');
