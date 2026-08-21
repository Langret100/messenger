const fs=require("fs");
const path=require("path");
const vm=require("vm");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
const exists=file=>fs.existsSync(path.join(root,file.replace(/^\.\//,"")));

const html=read("index.html"),manifest=JSON.parse(read("manifest.webmanifest")),sw=read("sw.js"),notifications=read("js/tools/notifications.js");
const htmlRefs=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1].split("?")[0]).filter(ref=>!ref.startsWith("http")&&!ref.startsWith("#"));
for(const ref of htmlRefs)if(!exists(ref))throw new Error(`missing HTML asset: ${ref}`);
for(const icon of manifest.icons){
  if(!exists(icon.src))throw new Error(`missing manifest icon: ${icon.src}`);
  const buffer=fs.readFileSync(path.join(root,icon.src));
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20),declared=icon.sizes.split("x").map(Number);
  if(width!==declared[0]||height!==declared[1])throw new Error(`icon size mismatch: ${icon.src}`);
}
const coreMatch=sw.match(/const CORE = (\[[\s\S]*?\]);/);
if(!coreMatch)throw new Error("service worker CORE list missing");
const core=vm.runInNewContext(coreMatch[1]);
for(const ref of core)if(!exists(ref))throw new Error(`missing service-worker asset: ${ref}`);
for(const source of [html,JSON.stringify(manifest),sw,notifications]){
  if(/assets\/icons\/(?:icon-192|icon-512)\.png/.test(source))throw new Error("obsolete clock icon reference remains");
}
console.log(`ASSET_REFERENCE_INTEGRITY_OK ${htmlRefs.length} html ${core.length} cached`);
