const fs=require('fs');
const idx=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('js/app.js','utf8');
const win=fs.readFileSync('js/adapters/window-mode.js','utf8');
const mob=fs.readFileSync('js/adapters/mobile-immersive.js','utf8');
const css=fs.readFileSync('css/app.css','utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(idx.includes('js/adapters/mobile-immersive.js'),'mobile adapter script missing');
ok(app.includes('MobileImmersive?.start'),'mobile adapter not started');
ok(app.includes('MobileImmersive?.isMobile?.()'),'mobile auto-open missing');
ok(win.includes('MiniTalk.MobileImmersive?.isMobile?.()'),'mobile routing missing');
ok(win.includes('openHere({immersive:true})'),'mobile immersive open missing');
ok(mob.includes('requestFullscreen'),'fullscreen attempt missing');
ok(mob.includes('visualViewport'),'VisualViewport handling missing');
ok(mob.includes('scrollTo'),'browser chrome nudge missing');
ok(css.includes('--visual-vh'),'visual viewport css missing');
console.log('MOBILE_IMMERSIVE_OK');
