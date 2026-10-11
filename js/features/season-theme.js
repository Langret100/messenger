(function(){
'use strict';
const holidays={2026:['02-17','09-25'],2027:['02-07','09-15'],2028:['01-27','10-03'],2029:['02-13','09-22'],2030:['02-03','09-12']};
function choose(y,m,d){const now=Date.UTC(y,m-1,d),events=[['halloween','10-31'],['christmas','12-25']];if(holidays[y])events.push(['seollal',holidays[y][0]],['chuseok',holidays[y][1]]);for(const [id,md]of events){const [mm,dd]=md.split('-').map(Number),delta=(Date.UTC(y,mm-1,dd)-now)/86400000;if(delta>=0&&delta<=14)return id;}return m>=3&&m<=5?'spring':m>=6&&m<=8?'summer':m>=9&&m<=11?'autumn':'winter';}
const palettes={
 spring:['봄','#fbf2f4','#fffafb','#f6e7ed','#493741','#956579','#b96080','#fff7fa'],
 summer:['여름','#edf7f5','#f8fffe','#e0f2ee','#25443e','#597e73','#287c70','#f6fffd'],
 autumn:['가을','#fcf3e9','#fffbf4','#f5e5d5','#513c2c','#99724f','#a85b35','#fff8ee'],
 winter:['겨울','#edf3fa','#f9fcff','#e0eafa','#314961','#6b84a2','#426b9c','#f6faff'],
 halloween:['할로윈','#f5eee7','#fff9f1','#eee1d3','#40362e','#887360','#ad541f','#fff7ec'],
 christmas:['크리스마스','#edf5f0','#fbfffd','#dfeee5','#294335','#628575','#256544','#f5fff8'],
 seollal:['설날','#fcf4eb','#fffaf3','#f6e7df','#513a37','#95706c','#a54547','#fff8ee'],
 chuseok:['추석','#faf4e5','#fffdf4','#f1e9cd','#4c432d','#8b7b4c','#8e712e','#fffbee']
};
const ids=Object.keys(palettes);
if(typeof module==='object'&&module.exports){module.exports={choose,palettes};return;}
const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
const today=choose(+parts.year,+parts.month,+parts.day);
const css=ids.map((id,i)=>{const [name,bg,surface,soft,text,muted,accent,mine]=palettes[id];return `
:root[data-season="${id}"]{color-scheme:light;--bg:${bg};--surface:${surface};--surface-2:${bg};--surface-3:${soft};--surface-raised:${surface};--surface-hover:${soft};--text:${text};--muted:${muted};--muted-2:${muted};--line:${muted}26;--line-strong:${muted}50;--accent:${accent};--accent-strong:${accent};--accent-soft:${accent}19;--accent-ink:#fff;--season-mine:${mine};--season-art-x:${i%4*100/3}%;--season-art-y:${Math.floor(i/4)*100}%;--shadow:0 18px 50px ${text}19;--shadow-soft:0 4px 18px ${text}12;}
`;}).join('')+`
:root[data-season] .app-shell{background:var(--surface);border-color:var(--line-strong);box-shadow:var(--shadow);}
:root[data-season] :is(.app-header,.bottom-nav,.side-rail,.composer-zone){background:color-mix(in srgb,var(--surface) 92%,transparent);backdrop-filter:none;-webkit-backdrop-filter:none;}
:root[data-season] .app-header{border-bottom:2px solid var(--line-strong);box-shadow:none;}
:root[data-season]:not(.chat-custom-background) .message-list{background-image:linear-gradient(to bottom,var(--surface-2) 35%,transparent 75%),var(--season-wall,none);background-size:100% 100%,100% auto;background-position:bottom center;background-repeat:no-repeat;background-color:var(--surface-2);}
:root[data-season] .app-header::before{content:none;}
:root[data-season=winter] .app-header{background:var(--surface);}
:root[data-season] .app-header>*{position:relative;z-index:1;}
:root[data-season] .conversation-item{background:var(--surface);border-color:var(--line);}
:root[data-season] .conversation-item:hover{background:var(--surface-3);}
:root[data-season] .nav-button.active{background:var(--accent-soft);color:var(--accent);box-shadow:inset 0 -3px var(--accent);border-radius:15px;}
:root[data-season] .nav-button.active .nav-icon{background:var(--surface);border:1px solid var(--line-strong);border-radius:50%;}
:root[data-season] .bubble:not(.emoji-only):not(.preview-only):not(.media-bubble):not(.game-bubble){background:var(--surface);border:1px solid var(--line-strong);box-shadow:0 2px 3px #29374708;}
:root[data-season] .mine .bubble:not(.emoji-only):not(.preview-only):not(.media-bubble):not(.game-bubble){background:var(--season-mine);color:var(--text);border-color:color-mix(in srgb,var(--accent) 50%,transparent);box-shadow:none;}
:root[data-season] .composer .send{border:1px solid color-mix(in srgb,var(--accent) 60%,var(--surface));box-shadow:inset 0 2px #ffffff32;}
:root[data-season] .composer input{background:var(--surface-3);box-shadow:inset 0 1px 2px #2937470a;}
:root[data-season] .button.primary{border:1px solid var(--line-strong);box-shadow:inset 0 2px #fff3;}
:root[data-season=halloween] .app-header{background:#40362e;color:#fff7ec;border-color:#d89855;}
:root[data-season=halloween] .app-header :is(.icon-button,.connection-badge){color:#fff7ec;}
:root[data-season=halloween] .mine .bubble{border-style:dashed;}
:root[data-season=christmas] .app-header{background:#256544;color:#fff;border-color:#b54d52;}
:root[data-season=christmas] .app-header .icon-button{color:#fff;}
:root[data-season=christmas] .app-header .connection-badge{color:var(--accent);}
:root:is([data-season=christmas],[data-season=winter]) .mine .bubble:not(.emoji-only):not(.media-bubble):not(.preview-only):not(.game-bubble){box-shadow:none;}
:root:is([data-season=seollal],[data-season=chuseok]) .app-header{box-shadow:none;}
.messenger-season-motion{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:2;}
.messenger-season-motion i{position:absolute;left:var(--sx);top:-14px;width:var(--ss);height:var(--ss);background:#fff;border-radius:50%;opacity:.75;box-shadow:0 0 2px #7097bb55;animation:messenger-season-fall var(--st) linear infinite;animation-delay:var(--sd);}
:root[data-season=spring] .messenger-season-motion i{background:#e9b0c2;border-radius:80% 10% 80% 10%;opacity:.5;box-shadow:none;}
:root[data-season=autumn] .messenger-season-motion i{background:#c48a54;border-radius:80% 10% 80% 10%;opacity:.4;box-shadow:none;}
@keyframes messenger-season-fall{to{transform:translate3d(var(--drift),720px,0) rotate(135deg);}}
:root[data-season-hidden] .messenger-season-motion i{animation-play-state:paused;}
:root[data-motion=reduced] .messenger-season-motion{display:none;}
@media(max-width:600px){.messenger-season-motion i:nth-child(n+4){display:none;}}
@media(prefers-reduced-motion:reduce){.messenger-season-motion{display:none;}}
@media(prefers-reduced-motion:reduce){:root[data-season] *{scroll-behavior:auto!important;}}
`;
const springAutumnMotionCSS=":root:is([data-season=spring],[data-season=autumn]) .messenger-season-motion i{opacity:.72;animation-name:messenger-petal-fall;box-shadow:none}:root[data-season=spring] .messenger-season-motion i{background:linear-gradient(135deg,#ffdce9,#dc82a8);border-radius:75% 25% 65% 25%;height:calc(var(--ss) * .75)}:root[data-season=spring] .messenger-season-motion i:nth-child(3n){background:linear-gradient(135deg,#fff0f7,#eda3bf)}:root[data-season=autumn] .messenger-season-motion i{background:linear-gradient(135deg,#e8aa48,#ba592b);border-radius:80% 8% 75% 10%;height:calc(var(--ss) * .8);animation-name:messenger-leaf-fall}:root[data-season=autumn] .messenger-season-motion i:nth-child(3n){background:linear-gradient(135deg,#e6bd65,#ad7628)}:root[data-season=autumn] .messenger-season-motion i::after{content:'';position:absolute;left:15%;top:50%;width:70%;height:1px;background:#87452566;transform:rotate(-40deg)}@keyframes messenger-petal-fall{0%{transform:translate3d(0,0,0) rotate(-25deg)}45%{transform:translate3d(var(--drift),320px,0) rotate(55deg)}100%{transform:translate3d(calc(var(--drift) * -.5),720px,0) rotate(160deg)}}@keyframes messenger-leaf-fall{0%{transform:translate3d(0,0,0) rotate(-40deg)}35%{transform:translate3d(var(--drift),240px,0) rotate(65deg)}70%{transform:translate3d(calc(var(--drift) * -.4),490px,0) rotate(-20deg)}100%{transform:translate3d(var(--drift),720px,0) rotate(125deg)}}@media(max-width:600px){:root:is([data-season=spring],[data-season=autumn]) .messenger-season-motion i:nth-child(n+4){display:block}:root:is([data-season=spring],[data-season=autumn]) .messenger-season-motion i:nth-child(n+7){display:none}}";
const connectionBadgeCSS=".app-header .connection-badge:not([data-mode=offline]){display:none!important}";
const headerHoverCSS=":root[data-season] .app-header .header-actions .icon-button:hover{background:var(--surface-3)!important;color:var(--accent)!important}";
const composerPlusCSS=".composer>.composer-icon:first-child{position:relative;top:1px}";
const compactNavCSS=":root[data-season] .bottom-nav .nav-button small{display:none!important}:root[data-season] .bottom-nav .nav-button{flex:1;min-width:0;display:grid;place-items:center;align-content:center;padding:10px 2px!important;gap:0!important;background:transparent!important;border:0!important;box-shadow:none!important}:root[data-season] .bottom-nav .nav-button .nav-icon{margin:0!important;transform:scale(1);animation:none!important;transition:transform .16s ease!important}:root[data-season] .bottom-nav .nav-button.active{background:transparent!important;box-shadow:none!important;border:0!important}:root[data-season] .bottom-nav .nav-button.active .nav-icon{transform:scale(1.55);box-shadow:none!important;border:0!important}:root[data-season] .bottom-nav .nav-button::before,:root[data-season] .bottom-nav .nav-button::after{display:none!important}";
const iconTransitionCSS=':root[data-season] .nav-button .nav-icon{transition:transform .16s ease,color .16s ease!important;}';
const snowCSS="\n:root:is([data-season=winter],[data-season=christmas]){--messenger-snow-image:url(\"data:image/webp;base64,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\");}\n:root:is([data-season=winter],[data-season=christmas]) :is(.app-header,.composer,.composer .send){position:relative;}\n:root:is([data-season=winter],[data-season=christmas]) :is(.app-header,.app-shell .bottom-nav)::after{content:'';position:absolute;pointer-events:none;z-index:3;left:0;right:0;height:22px;background:var(--messenger-snow-image) center/100% 100% no-repeat;}\n:root:is([data-season=winter],[data-season=christmas]) .app-header::after{top:auto;bottom:-8px;}\n:root:is([data-season=winter],[data-season=christmas]) .app-shell .bottom-nav{overflow:visible;}\n:root:is([data-season=winter],[data-season=christmas]) .app-shell .bottom-nav::after{top:-14px;}\n:root:is([data-season=winter],[data-season=christmas]) .composer::after{content:'';position:absolute;pointer-events:none;z-index:3;left:50px;right:92px;top:-5px;height:18px;background:var(--messenger-snow-image) center/100% 100% no-repeat;}\n";
const controlCSS=":root[data-season=\"spring\"]{--season-nav-y:0%;}\n:root[data-season=\"summer\"]{--season-nav-y:14.285714285714286%;}\n:root[data-season=\"autumn\"]{--season-nav-y:28.571428571428573%;}\n:root[data-season=\"winter\"]{--season-nav-y:42.857142857142854%;}\n:root[data-season=\"halloween\"]{--season-nav-y:57.142857142857146%;}\n:root[data-season=\"christmas\"]{--season-nav-y:71.42857142857143%;}\n:root[data-season=\"seollal\"]{--season-nav-y:85.71428571428571%;}\n:root[data-season=\"chuseok\"]{--season-nav-y:100%;}:root[data-season][data-season-nav-ready] .nav-button[data-route=\"chats\"] .nav-icon{font-size:0!important;width:32px!important;height:29px!important;background-image:url(\"assets/season-controls.webp?v=2\")!important;background-size:700% 800%!important;background-position:0.0% var(--season-nav-y)!important;background-repeat:no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;background-color:transparent!important;transition:transform .16s ease,color .16s ease!important;}\n:root[data-season][data-season-nav-ready] .nav-button[data-route=\"feed\"] .nav-icon{font-size:0!important;width:32px!important;height:29px!important;background-image:url(\"assets/season-controls.webp?v=2\")!important;background-size:700% 800%!important;background-position:16.666666666666664% var(--season-nav-y)!important;background-repeat:no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;background-color:transparent!important;}\n:root[data-season][data-season-nav-ready] .nav-button[data-route=\"tools\"] .nav-icon{font-size:0!important;width:32px!important;height:29px!important;background-image:url(\"assets/season-controls.webp?v=2\")!important;background-size:700% 800%!important;background-position:33.33333333333333% var(--season-nav-y)!important;background-repeat:no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;background-color:transparent!important;}\n:root[data-season][data-season-nav-ready] .nav-button[data-route=\"tasks\"] .nav-icon{font-size:0!important;width:32px!important;height:29px!important;background-image:url(\"assets/season-controls.webp?v=2\")!important;background-size:700% 800%!important;background-position:50.0% var(--season-nav-y)!important;background-repeat:no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;background-color:transparent!important;}\n:root[data-season][data-season-nav-ready] .nav-button[data-route=\"shopping\"] .nav-icon{font-size:0!important;width:32px!important;height:29px!important;background-image:url(\"assets/season-controls.webp?v=2\")!important;background-size:700% 800%!important;background-position:66.66666666666666% var(--season-nav-y)!important;background-repeat:no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;background-color:transparent!important;}\n:root[data-season][data-season-nav-ready] .nav-button[data-route=\"settings\"] .nav-icon{font-size:0!important;width:32px!important;height:29px!important;background-image:url(\"assets/season-controls.webp?v=2\")!important;background-size:700% 800%!important;background-position:83.33333333333334% var(--season-nav-y)!important;background-repeat:no-repeat!important;border:0!important;border-radius:0!important;box-shadow:none!important;background-color:transparent!important;}\n.composer .send-symbol{width:20px;height:20px;display:block;transform:none;pointer-events:none}.composer .send{overflow:hidden;isolation:isolate}:root[data-season][data-season-nav-ready] .composer .send:not(.voice-active){background-image:url(\"assets/season-controls.webp?v=2\");background-size:700% 800%;background-position:100.0% var(--season-nav-y);background-repeat:no-repeat;background-color:transparent;border:0;box-shadow:none;border-radius:0;transition:transform .12s ease}:root[data-season][data-season-nav-ready] .composer .send:not(.voice-active) .send-symbol{visibility:hidden}";

const dialogThemeCSS=`
:root[data-season] .app-shell{border-radius:0!important;}
:root[data-season] .auth-host{position:relative;isolation:isolate;background:var(--surface);}

:root[data-season] .auth-host::before{content:'';position:absolute;inset:0;pointer-events:none;z-index:-1;background-image:var(--season-wall,none);background-size:100% auto;background-repeat:no-repeat;background-position:bottom right;opacity:.23;}
:root[data-season] .auth-card{position:relative;}
:root[data-season] .auth-host::after{content:'';position:absolute;pointer-events:none;left:auto;right:0;top:0;width:110px;height:110px;background-image:url('assets/season-decor.webp');background-size:400% 200%;background-position:var(--season-art-x) var(--season-art-y);transform:scaleX(-1);opacity:.32;}
:root:is([data-season=winter],[data-season=christmas]) .auth-brand{position:relative;}
:root:is([data-season=winter],[data-season=christmas]) .auth-brand::before{content:'';position:absolute;pointer-events:none;left:-10px;right:-10px;bottom:-12px;height:16px;background:var(--messenger-snow-image) center/100% 100% no-repeat;}
:root:is([data-season=winter],[data-season=christmas]) #loginAction{position:relative;}
:root:is([data-season=winter],[data-season=christmas]) #loginAction::before{content:'';position:absolute;pointer-events:none;left:0;right:0;top:-10px;height:18px;background:var(--messenger-snow-image) center/100% 100% no-repeat;}

:root[data-season] .modal{position:relative;background:var(--surface)!important;border-color:var(--line-strong)!important;overflow-x:hidden;scrollbar-color:var(--line-strong) transparent;}
 :root[data-season] .modal>header{position:relative;min-height:34px;}
:root[data-season] .modal::before{content:'';position:absolute;pointer-events:none;left:0;top:0;width:100px;height:100px;background-image:url('assets/season-decor.webp');background-size:400% 200%;background-position:var(--season-art-x) var(--season-art-y);opacity:.16;z-index:0;}
:root[data-season] .modal>*{position:relative;z-index:1;}
.season-modal-frame{position:relative;width:min(390px,100%);min-width:0;}
.season-modal-frame>.modal{width:100%!important;}
.season-modal-frame:has(.profile-modal){width:min(420px,calc(100vw - 28px));}
@media(max-width:700px),(pointer:coarse) and (max-width:900px){.season-modal-frame{width:min(430px,100%);}}
:root:is([data-season=winter],[data-season=christmas]) .season-modal-frame::after{content:'';position:absolute;left:0;right:0;top:-13px;height:24px;pointer-events:none;background:var(--messenger-snow-image) center/100% 100% no-repeat;z-index:3;}

.modal:has(#alarmTime){padding:12px;max-height:calc(100dvh - 28px);}
.modal:has(#alarmTime) .tool-modal-body{gap:7px;}
.modal:has(#alarmTime) .modal-note{padding:8px 10px;font-size:11px;line-height:1.4;}
.modal:has(#alarmTime) .button-row:first-of-type{grid-template-columns:repeat(3,minmax(0,1fr));}
.modal:has(#alarmTime) .button{margin-top:0;padding:9px 8px;font-size:14px;min-height:38px;}
.modal:has(#alarmTime) .field{gap:4px;min-width:0;}
.modal:has(#alarmTime) .field input{min-width:0;width:100%;padding:8px;font-size:14px;}
.modal:has(#alarmTime) .tool-modal-state{min-height:30px;padding:6px 9px;}
@media(max-height:540px){.modal:has(#alarmTime) .tool-modal-body{gap:5px;}.modal:has(#alarmTime) .button{padding:7px;min-height:34px;}.modal:has(#alarmTime)>header{margin-bottom:12px;}}
`;


const utilityIconCSS=ids.map((id,i)=>`:root[data-season="${id}"]{--utility-x:${i*100/7}%;}`).join('')+`
:root[data-season][data-season-utility-ready] :is(.tool-glyph,.settings-row-icon,.random-mark,.shortcut-icon){font-size:0!important;background-color:transparent!important;background-image:url('assets/season-utility.webp?v=4')!important;background-size:800% 1300%!important;background-position:var(--utility-x) var(--utility-y,0%)!important;background-repeat:no-repeat!important;box-shadow:none!important;border:0!important;border-radius:0!important;transition:transform .16s ease!important;}
:root[data-season] img[src*="assets/mascot-avatar.png"]{content:url('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');background:var(--season-avatar,none) center/contain no-repeat;object-fit:contain;}
:root[data-season] .random-mark{--utility-y:58.3333333333%;}
:root[data-season] .tool-shortcuts .shortcut-row:nth-child(1) .shortcut-icon{--utility-y:33.3333333333%;}
:root[data-season] .tool-shortcuts .shortcut-row:nth-child(2) .shortcut-icon{--utility-y:75%;}
:root[data-season] .settings-group .settings-row:nth-child(1) .settings-row-icon{--utility-y:66.6666666667%;}
:root[data-season] .settings-group .settings-row:nth-child(2) .settings-row-icon{--utility-y:75%;}
:root[data-season] .settings-group .settings-row:nth-child(3) .settings-row-icon{--utility-y:83.3333333333%;}
:root[data-season] .settings-group .settings-row:nth-child(4) .settings-row-icon{--utility-y:91.6666666667%;}
:root[data-season] .settings-group .settings-row.danger-row .settings-row-icon{--utility-y:100%!important;}
`+Array.from({length:6},(_,i)=>`:root[data-season] .modern-tool-grid .modern-tool:nth-child(${i+1}) .tool-glyph{--utility-y:${(i+1)*100/12}%;}`).join('');

const classInfoCSS=`
.modal:has(>.class-info){width:min(460px,100%);}
.season-modal-frame:has(>.modal>.class-info){width:min(460px,100%);}
.modal>.class-info{gap:8px;}
.modal>.class-info>.button{width:auto;justify-self:end;min-height:30px;margin-top:0;padding:5px 11px;border-radius:9px;font-size:12px;line-height:20px;}
.modal>.class-info .class-info-preview{min-height:190px;}
.modal>.class-info .class-info-preview img{max-height:calc(86dvh - 120px);}
.modal>.class-info .lunch-today{padding:16px;gap:12px;}
.modal>.class-info .lunch-lines{gap:8px;font-size:15px;line-height:1.55;}
.modal>.class-info>.modal-note{margin:0;font-size:10px;}
`;

const motionDocuments=new WeakSet();
function motion(root,id){
 const doc=root.ownerDocument,shell=doc.getElementById('appShell');if(!shell)return;
 shell.querySelector('.messenger-season-motion')?.remove();
 if(!['winter','christmas','spring','autumn'].includes(id))return;
 const layer=doc.createElement('div');layer.className='messenger-season-motion';layer.setAttribute('aria-hidden','true');
 for(let i=0;i<(['winter','christmas'].includes(id)?6:8);i++){const dot=doc.createElement('i'),seasonal=['spring','autumn'].includes(id),duration=seasonal?16+Math.random()*10:20+Math.random()*14;dot.style.cssText='--sx:'+(seasonal?5+(([0,7,2,5,1,6,3,4][i]+Math.random())*90/8):8+Math.random()*84)+'%;--ss:'+(seasonal?9+Math.random()*5:4+Math.random()*4)+'px;--st:'+duration+'s;--sd:-'+Math.random()*duration+'s;--drift:'+(seasonal?(i%2?1:-1)*(20+Math.random()*30):Math.random()*30-15)+'px';layer.append(dot);}shell.append(layer);
 if(!motionDocuments.has(doc)){motionDocuments.add(doc);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)root.dataset.seasonHidden='';else delete root.dataset.seasonHidden;});}
 if(doc.hidden)root.dataset.seasonHidden='';
}
const homeCSS=`
:root[data-season] .app-shell{background-color:var(--surface);background-image:linear-gradient(color-mix(in srgb,var(--surface) 65%,transparent),color-mix(in srgb,var(--surface) 65%,transparent)),var(--season-home,none);background-position:center,top left;background-size:100% 100%,cover;background-repeat:no-repeat;}
:root[data-season] .view-host{position:relative;background:transparent!important;}
:root[data-season] :is(.workspace,.chat-home,.chat-home-top,.conversation-list){background:transparent!important;}
:root[data-season] :is(.app-header,.bottom-nav,.side-rail,.composer-zone){background:color-mix(in srgb,var(--surface) 72%,transparent)!important;}
:root[data-season=halloween] .app-header{background:color-mix(in srgb,#40362e 65%,transparent)!important;}
:root[data-season=christmas] .app-header{background:color-mix(in srgb,#256544 65%,transparent)!important;}
:root[data-season] .view-host>:is(.chat-home,.utility-view,.task-center-view){background:transparent;}
:root[data-season] :is(.modern-tool,.profile-summary){background:color-mix(in srgb,var(--surface) 72%,transparent);}
:root[data-season] :is(.conversation-item,.settings-group,.shortcut-group,.section-card,.tool-card,.task-card,.settings-card,.assigned-task-card,.shop-market-hero,.shop-product-card,.task-center-view .card,.shopping-screen .card){background:color-mix(in srgb,var(--surface) 72%,transparent)!important;}
:root[data-season] .button.secondary,:root[data-season] .mini-action{background-color:color-mix(in srgb,var(--surface-3) 72%,transparent);}
:root[data-season] .button.primary{background-color:color-mix(in srgb,var(--accent) 72%,transparent);}
:root[data-season] :is(.conversation-item,.settings-row,.shortcut-row):hover{background:color-mix(in srgb,var(--surface-3) 82%,transparent)!important;}
:root[data-season] :is(.app-header,.bottom-nav){background:color-mix(in srgb,var(--surface) 65%,transparent)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}
:root[data-season=halloween] .app-header{background:color-mix(in srgb,#40362e 65%,transparent)!important;color:var(--text);}
:root[data-season=christmas] .app-header{background:color-mix(in srgb,#256544 65%,transparent)!important;color:var(--text);}
:root:is([data-season=halloween],[data-season=christmas]) .app-header .icon-button{color:var(--text);}
:root[data-season][data-season] .conversation-item{background:color-mix(in srgb,var(--surface) 32%,transparent)!important;}
@media (hover:hover){:root[data-season][data-season] .conversation-item:hover{background:color-mix(in srgb,var(--accent) 12%,color-mix(in srgb,var(--surface) 56%,transparent))!important;}}
:root[data-season] :is(.chat-search,.search-hint,.chat-filter){background:color-mix(in srgb,var(--surface-3) 68%,transparent)!important;color:var(--muted)!important;}
:root[data-season] .chat-filter.active{background:color-mix(in srgb,var(--accent) 38%,transparent)!important;color:var(--accent)!important;}
:root[data-season][data-season] :is(.shop-product-card,.shop-inventory-v2-card,.shop-inventory-toggle,.shop-inventory-fab){background:color-mix(in srgb,var(--surface) 32%,transparent)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;}
:root[data-season] .app-header{background:color-mix(in srgb,var(--surface) 80%,transparent)!important;}
:root[data-season=halloween] .app-header{background:color-mix(in srgb,#40362e 80%,transparent)!important;}
:root[data-season=christmas] .app-header{background:color-mix(in srgb,#256544 80%,transparent)!important;}
:root[data-season] .app-shell .bottom-nav{z-index:4;}
:root[data-season] .shop-random-machine{background:var(--surface);border-color:var(--line-strong);overflow:visible;isolation:isolate;}
:root[data-season] .shop-random-machine::before{content:'';position:absolute;pointer-events:none;left:0;top:0;width:100px;height:100px;background-image:url('assets/season-decor.webp');background-size:400% 200%;background-position:var(--season-art-x) var(--season-art-y);opacity:.16;z-index:-1;}
:root:is([data-season=winter],[data-season=christmas]) .shop-random-machine::after{content:'';position:absolute;left:0;right:0;top:-13px;height:24px;pointer-events:none;background:var(--messenger-snow-image) center/100% 100% no-repeat;z-index:8;}
:root[data-season] .shop-random-window{background:var(--surface-2);border-color:var(--line);}
:root[data-season] :is(.shop-random-tap,.shop-random-cost){background:color-mix(in srgb,var(--surface) 94%,transparent);border-color:var(--line-strong);color:var(--text);}
:root[data-season] :is(.shop-random-tap strong,.shop-random-kicker){color:var(--accent);}
:root[data-season] :is(.shop-random-tap small,.shop-random-cost small,.shop-random-foot,.shop-random-status small){color:var(--muted);}
:root[data-season] :is(.shop-random-reel-cell,.shop-random-status strong){color:var(--text);}
.modal:has(#rankingGame),.modal:has(#rankingGame) .ranking-list{scrollbar-width:none;}
.modal:has(#rankingGame)::-webkit-scrollbar,.modal:has(#rankingGame) .ranking-list::-webkit-scrollbar{display:none;width:0;height:0;}
:root[data-season][data-season] .shop-inventory-fab:is(:hover,.active){color:var(--accent)!important;border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface))!important;}
:root[data-season] .shop-inventory-fab.active b{background:var(--accent);color:var(--surface);}
:root[data-season][data-season] .shop-inventory-panel{background:var(--surface)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-color:var(--line-strong);overflow:visible;isolation:isolate;}
:root[data-season] .shop-inventory-panel::before{content:'';position:absolute;pointer-events:none;left:0;top:0;width:100px;height:100px;background-image:url('assets/season-decor.webp');background-size:400% 200%;background-position:var(--season-art-x) var(--season-art-y);opacity:.16;z-index:-1;}
:root[data-season] .shop-inventory-panel>.shop-inventory-v2-list{border-radius:0 0 18px 18px;}
:root:is([data-season=winter],[data-season=christmas]) .shop-inventory-panel::after{content:'';position:absolute;left:0;right:0;top:-13px;height:24px;pointer-events:none;background:var(--messenger-snow-image) center/100% 100% no-repeat;z-index:3;}

:root[data-season] :is(.message-list,.conversation-list,.view-host,.card-list,.modal){scrollbar-color:color-mix(in srgb,var(--accent) 65%,var(--surface)) color-mix(in srgb,var(--surface-3) 35%,transparent);}
:root[data-season] :is(.message-list,.conversation-list,.view-host,.card-list,.modal)::-webkit-scrollbar-track{background:color-mix(in srgb,var(--surface-3) 35%,transparent);}
:root[data-season] :is(.message-list,.conversation-list,.view-host,.card-list,.modal)::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--accent) 65%,var(--surface));border-radius:999px;}
`;
let avatarAtlasPromise;const avatarImages=new Map();
function avatarWallpaper(id){
 if(avatarImages.has(id))return Promise.resolve(avatarImages.get(id));
 if(!avatarAtlasPromise)avatarAtlasPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=new URL('assets/season-utility.webp?v=4',document.baseURI).href;});
 return avatarAtlasPromise.then(image=>{const size=image.width/8,c=document.createElement('canvas');c.width=c.height=size;c.getContext('2d').drawImage(image,ids.indexOf(id)*size,0,size,size,0,0,size,size);const url='url("'+c.toDataURL('image/webp',.85)+'")';avatarImages.set(id,url);return url;});
}
let homeAtlasPromise;const homeWalls=new Map();
function homeWallpaper(id){
 if(homeWalls.has(id))return Promise.resolve(homeWalls.get(id));
 if(!homeAtlasPromise)homeAtlasPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=new URL('assets/season-home.webp?v=1',document.baseURI).href;});
 return homeAtlasPromise.then(image=>{const i=ids.indexOf(id),w=image.width/4,h=image.height/2,c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(image,i%4*w,Math.floor(i/4)*h,w,h,0,0,w,h);const url='url("'+c.toDataURL('image/webp',.75)+'")';homeWalls.set(id,url);return url;});
}
let atlasPromise;const wallpapers=new Map();
function wallpaper(id){
 if(wallpapers.has(id))return Promise.resolve(wallpapers.get(id));
 if(!atlasPromise)atlasPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=new URL('assets/season-chat.webp?v=4',document.baseURI).href;});
 return atlasPromise.then(image=>{const index=ids.indexOf(id),size=image.width/4,canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.getContext('2d').drawImage(image,index%4*size+3,Math.floor(index/4)*size+3,size-6,size-6,0,0,size,size);const url='url("'+canvas.toDataURL('image/webp',.82)+'")';wallpapers.set(id,url);return url;});
}
let emojiAtlasPromise;const emojiImages=new Map();
function emojiImage(id,code){const index=Number(String(code).replace(/^e/,''))-1;if(index<0||index>=17)return Promise.reject();const key=id+'-'+index;if(emojiImages.has(key))return Promise.resolve(emojiImages.get(key));if(!emojiAtlasPromise)emojiAtlasPromise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>{emojiAtlasPromise=null;reject();};image.src=new URL('assets/season-nav.webp?v=7',document.baseURI).href;});return emojiAtlasPromise.then(image=>{if(emojiImages.has(key))return emojiImages.get(key);const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(image,(index+7)*(image.width/24),ids.indexOf(id)*(image.width/24),image.width/24,image.width/24,0,0,64,64);const src=c.toDataURL('image/webp',.82);emojiImages.set(key,src);return src;});}
function decorateEmoji(img,code){img.dataset.seasonEmoji=code;if(!img.dataset.baseEmoji)img.dataset.baseEmoji=img.getAttribute('src')||img.src;const root=(img.ownerDocument||document).documentElement,id=root.dataset.season;if(!palettes[id]){img.src=img.dataset.baseEmoji;return;}emojiImage(id,code).then(src=>{if(root.dataset.season===id&&img.dataset.seasonEmoji===code)img.src=src;}).catch(()=>{});}
function refreshEmoji(root){root.ownerDocument.querySelectorAll('[data-season-emoji]').forEach(img=>decorateEmoji(img,img.dataset.seasonEmoji));}

const controlLoads=new Map();
function prepareControls(root){
 for(const [key,src] of [['seasonNavReady','assets/season-controls.webp?v=2'],['seasonUtilityReady','assets/season-utility.webp?v=4']]){
  if(!controlLoads.has(src))controlLoads.set(src,new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>{controlLoads.delete(src);reject();};image.src=new URL(src,document.baseURI).href;}));
  controlLoads.get(src).then(()=>{root.dataset[key]='true';}).catch(()=>{});
 }
}
prepareControls(document.documentElement);
function apply(root,requested){
 prepareControls(root);
 const doc=root.ownerDocument;if(!doc.getElementById('messenger-season-style')){const style=doc.createElement('style');style.id='messenger-season-style';style.textContent=css+controlCSS+snowCSS+iconTransitionCSS+compactNavCSS+springAutumnMotionCSS+composerPlusCSS+headerHoverCSS+connectionBadgeCSS+dialogThemeCSS+utilityIconCSS+classInfoCSS+homeCSS;doc.head.append(style);}
 const id=requested==='auto'?today:requested;
 if(!palettes[id]){delete root.dataset.season;root.style.removeProperty('--season-wall');root.style.removeProperty('--season-home');motion(root,null);refreshEmoji(root);return;}
 root.dataset.theme='light';root.dataset.season=id;refreshEmoji(root);
 wallpaper(id).then(url=>{if(root.dataset.season===id)root.style.setProperty('--season-wall',url);}).catch(()=>{});
 homeWallpaper(id).then(url=>{if(root.dataset.season===id)root.style.setProperty('--season-home',url);}).catch(()=>{});
 avatarWallpaper(id).then(url=>{if(root.dataset.season===id)root.style.setProperty('--season-avatar',url);}).catch(()=>{});
 motion(root,id);
}
const notificationVoices=new WeakMap();
function stopNotification(ctx){for(const osc of notificationVoices.get(ctx)||[]){try{osc.stop();}catch{}}notificationVoices.delete(ctx);}
function playNotification(ctx,strong){
 const root=window.MiniTalk?.Store?.get('rootDocument')?.documentElement||document.documentElement,id=palettes[root.dataset.season]?root.dataset.season:'basic';
 if(!ctx||ctx.state!=='running')return false;
 stopNotification(ctx);
 const voices=[];notificationVoices.set(ctx,voices);
 const tunes={basic:[[76,.12],[79,.12],[84,.25],[79,.16],[84,.38]],spring:[[72,.17],[76,.17],[79,.25],[84,.3],[79,.17],[76,.17],[74,.25],[79,.4]],summer:[[76,.12],[79,.12],[83,.24],[79,.12],[76,.12],[74,.24],[76,.24],[79,.4]],autumn:[[60,.17],[64,.17],[67,.22],[71,.17],[67,.17],[64,.22],[62,.28],[67,.44]],winter:[[79,.16],[86,.16],[83,.22],[91,.16],[86,.16],[83,.24],[79,.32],[86,.44]],halloween:[[69,.14],[72,.14],[75,.2],[74,.14],[71,.14],[68,.25],[64,.18],[68,.18],[69,.36]],christmas:[[76,.1224],[76,.1224],[76,.2448],[76,.1224],[76,.1224],[76,.272],[76,.1224],[79,.1224],[72,.1836],[74,.1836],[76,.408]],seollal:[[72,.12],[74,.12],[79,.24],[81,.12],[79,.12],[74,.3],[72,.24],[79,.42]],chuseok:[[67,.18],[72,.18],[74,.24],[79,.18],[74,.18],[72,.36],[67,.45]]};
 const profiles={basic:{partials:[[1,.14],[2.01,.024]],type:'sine',tail:.14},spring:{partials:[[1,.13],[2,.016]],type:'triangle',tail:.12,glide:true},summer:{partials:[[1,.14],[2,.038],[3,.014]],type:'triangle',tail:.1},autumn:{partials:[[1,.16],[2,.012],[3,.008]],type:'triangle',tail:.16},winter:{partials:[[1,.14],[2.76,.025],[5.4,.005]],type:'sine',tail:.16},halloween:{partials:[[1,.13],[1.498,.045]],type:'triangle',tail:.1},christmas:{partials:[[1,.15],[2.01,.035],[3.99,.01]],type:'sine',tail:.12},seollal:{partials:[[1,.15],[2.92,.03],[4.01,.008]],type:'triangle',tail:.08,glide:true},chuseok:{partials:[[1,.16],[2,.027]],type:'sine',tail:.12}};
 const profile=profiles[id];
 let cursor=ctx.currentTime+.01;
 for(const [note,duration] of tunes[id]){const hz=440*Math.pow(2,(note-69)/12),start=cursor;cursor+=duration;
  for(const [ratio,volume]of profile.partials){
   const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=profile.type;osc.frequency.value=hz*ratio;if(profile.glide){osc.frequency.setValueAtTime(hz*ratio*1.015,start);osc.frequency.exponentialRampToValueAtTime(hz*ratio,start+.035);}
   gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume*(strong?1.15:1),start+.006);gain.gain.exponentialRampToValueAtTime(.0001,start+duration+profile.tail);
   osc.connect(gain);gain.connect(ctx.destination);osc.onended=()=>{osc.disconnect();gain.disconnect();const i=voices.indexOf(osc);if(i>=0)voices.splice(i,1);};voices.push(osc);osc.start(start);osc.stop(start+duration+profile.tail+.02);
  }
 }return true;
}

window.MiniTalk=window.MiniTalk||{};window.MiniTalk.SeasonTheme={apply,choose,today,playNotification,stopNotification,decorateEmoji,names:Object.fromEntries(ids.map(id=>[id,palettes[id][0]]))};
// Apply the saved choice (or date default) before authentication renders.
const initial=window.MiniTalk.Persistence?.get('layout.preferences',null)?.theme||'auto';
if(['light','dark','forest'].includes(initial))document.documentElement.dataset.theme=initial;
apply(document.documentElement,initial);
})();







