const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

const manifest=JSON.parse(read("manifest.webmanifest"));
const windowMode=read("js/adapters/window-mode.js");
const index=read("index.html");
const serviceWorker=read("sw.js");
const notifications=read("js/tools/notifications.js");

for(const icon of manifest.icons){
  if(!fs.existsSync(path.join(root,icon.src)))throw new Error(`missing PWA icon: ${icon.src}`);
}
if(!manifest.icons.some(icon=>icon.purpose==="any"))throw new Error("regular PWA icon missing");
if(!manifest.icons.some(icon=>icon.purpose==="maskable"))throw new Error("maskable PWA icon missing");
if(!index.includes("apple-touch-icon-180.png"))throw new Error("apple touch icon is not linked");
if(!index.includes('manifest.webmanifest?v=64.5.3'))throw new Error("manifest cache version is stale");
if(!index.includes("css/app.css?v=64.5.12")||!index.includes("js/adapters/window-mode.js?v=64.5.40"))throw new Error("PWA layout cache version is stale");
if(!index.includes("js/tools/notifications.js?v=64.5.4")||!notifications.includes('icon: "assets/icons/moaru-app-192.png"'))throw new Error("notification icon is stale");
if(!windowMode.includes("STANDALONE_BOUNDS={width:400,height:740}"))throw new Error("standalone preferred bounds missing");
if(!windowMode.includes("PIP_BOUNDS={width:290,height:560}")||!windowMode.includes("requestWindow({...PIP_BOUNDS"))throw new Error("PiP compact bounds missing");
if(!windowMode.includes("fitStandaloneWindow()")||!windowMode.includes("standalone은 브라우저/사용자가 정한 현재 크기를 존중"))throw new Error("standalone stable-size policy missing");
if(windowMode.includes("window.resizeTo(")||windowMode.includes("popupHandle?.resizeTo"))throw new Error("main messenger runtime resize must stay disabled");
if(!windowMode.includes("MiniTalk.MobileImmersive?.isMobile?.()"))throw new Error("mobile window guard missing");
for(const file of ["moaru-app-192.png","moaru-app-512.png","icon-maskable-192.png","icon-maskable-512.png","apple-touch-icon-180.png"]){
  if(!serviceWorker.includes(file))throw new Error(`service worker cache entry missing: ${file}`);
}
console.log("PWA_INSTALL_UI_OK");
