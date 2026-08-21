const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ok=(v,m)=>{if(!v)throw new Error(m)};
const toolsCss=read('css/features/tools.css'),admin=read('js/features/admin.js'),settings=read('js/features/settings.js'),feed=read('js/features/feed.js'),html=read('index.html'),sw=read('sw.js');

ok(toolsCss.includes('.tools-screen')&&toolsCss.includes('scrollbar-width: none')&&toolsCss.includes('.tools-screen::-webkit-scrollbar')&&toolsCss.includes('display: none'),'tools scrollbar hiding missing');
ok(read('js/features/tools.js').includes('MiniTalk.UI.DragScroll?.bind?.(list,{allowInteractive:'),'tools vertical drag must remain enabled');

ok(admin.includes('function reserveDesktopAdminPopup(host)'),'admin popup reservation missing');
ok(admin.includes('sourceView.open("","MoaruAdmin"'),'admin popup must open from active source window');
ok(admin.includes('Number(screenInfo?.availWidth||view?.innerWidth||0)>=720')&&!admin.includes('Number(innerWidth||0)>=700'),'PiP width must not disable desktop admin popup');
ok(settings.includes('MiniTalk.Features.Admin?.reservePopup?.')&&settings.indexOf('reservePopup')<settings.indexOf('await MiniTalk.AdminSession.unlock'),'admin popup must be reserved before async unlock');
ok(settings.includes('if(reserved)MiniTalk.Features.Admin?.closePopup?.()'),'failed admin auth must close reserved popup');

ok(feed.includes('function sameComments(a,b)'),'feed comment change discriminator missing');
ok(feed.includes('if(!sameComments(previous,post))patchComments(id)'),'heart-only feed update must not rebuild comments');
ok(feed.includes('draft=oldInput?.value||""')&&feed.includes('nextInput.value=draft'),'comment draft preservation missing');
ok(feed.includes('doc?.activeElement===oldInput')&&feed.includes('setSelectionRange'),'comment focus/caret preservation missing');

ok(html.includes('css/features/tools.css?v=23'),'tools css cache-bust missing');
ok(html.includes('js/features/feed.js?v=65.0.21'),'feed cache-bust missing');
ok(html.includes('js/features/settings.js?v=45'),'settings cache-bust missing');
ok(html.includes('js/features/admin.js?v=64.5.30'),'admin cache-bust missing');
ok(sw.includes('moaru-tools-scroll-layout'),'v97 service worker cache missing');
console.log('V97_TOOLS_ADMIN_FEED_STABILITY_OK');
