const fs=require('fs'),path=require('path'),root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),ok=(v,m)=>{if(!v)throw new Error(m)};
const auth=read('js/features/auth.js'),wm=read('js/adapters/window-mode.js'),html=read('index.html');
ok(wm.includes('setTransferredState(false)')&&wm.includes('returnToLogin?.()'),'PiP close must restore the original login flow');
ok(auth.includes('launch?.classList.add("hidden")')&&auth.includes('shell?.classList.remove("hidden")'),'PiP return must hide launcher before showing the login shell');
ok(auth.includes('document.documentElement.classList.add("app-visible")'),'PiP return must keep app-visible layout state');
ok(html.includes('js/features/auth.js?v=64.5.35'),'auth PiP return fix is not cache-busted');
console.log('PIP_LOGIN_RETURN_LAYOUT_OK');
