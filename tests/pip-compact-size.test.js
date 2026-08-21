const fs=require("fs"),path=require("path"),root=path.resolve(__dirname,"..");
const ok=(v,m)=>{if(!v)throw new Error(m)};
const src=fs.readFileSync(path.join(root,"js/adapters/window-mode.js"),"utf8");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
ok(src.includes("const PIP_BOUNDS={width:290,height:560}"),"compact PiP target size missing");
ok(src.includes("function enforcePiPBounds(win)")&&src.includes("win.resizeTo(PIP_BOUNDS.width,PIP_BOUNDS.height)"),"PiP resize enforcement missing");
ok(src.includes("[80,260,700].forEach"),"PiP resize retries missing");
ok(index.includes("js/adapters/window-mode.js?v=64.5.35"),"window-mode cache bust stale");
console.log("PIP_COMPACT_SIZE_OK");
