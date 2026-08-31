const fs=require("fs"),path=require("path"),root=path.resolve(__dirname,"..");
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync(path.join(root,"js/adapters/window-mode.js"),"utf8");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
ok(src.includes("const PIP_BOUNDS={width:290,height:560}"),"compact PiP target size missing");
ok(src.includes("documentPictureInPicture.requestWindow({...PIP_BOUNDS"),"PiP requestWindow target size missing");
ok(!src.includes("[80,260,700].forEach")&&!src.includes("enforcePiPBounds(pipWindow)"),"PiP must not resize itself again after opening");
ok(index.includes("js/adapters/window-mode.js?v=64.5.40"),"window-mode cache bust stale");
console.log("PIP_COMPACT_SIZE_OK");
