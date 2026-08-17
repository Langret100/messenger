const fs=require("fs");
const path=require("path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

const manifest=JSON.parse(read("manifest.webmanifest"));
const windowMode=read("js/adapters/window-mode.js");
const index=read("index.html");
const serviceWorker=read("sw.js");

for(const icon of manifest.icons){
  if(!fs.existsSync(path.join(root,icon.src)))throw new Error(`missing PWA icon: ${icon.src}`);
}
if(!manifest.icons.some(icon=>icon.purpose==="any"))throw new Error("regular PWA icon missing");
if(!manifest.icons.some(icon=>icon.purpose==="maskable"))throw new Error("maskable PWA icon missing");
if(!index.includes("apple-touch-icon-180.png"))throw new Error("apple touch icon is not linked");
if(!windowMode.includes("STANDALONE_BOUNDS={width:360,height:760}"))throw new Error("standalone preferred bounds missing");
if(!windowMode.includes("fitStandaloneWindowOnce()"))throw new Error("standalone initial resize is not wired");
if(!windowMode.includes('matchMedia("(pointer: coarse)")')||!windowMode.includes("mobileWindow()"))throw new Error("mobile standalone guard missing");
for(const file of ["icon-maskable-192.png","icon-maskable-512.png","apple-touch-icon-180.png"]){
  if(!serviceWorker.includes(file))throw new Error(`service worker cache entry missing: ${file}`);
}
console.log("PWA_INSTALL_UI_OK");
