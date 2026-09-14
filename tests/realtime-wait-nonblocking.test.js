const fs=require("fs"),path=require("path");
const css=fs.readFileSync(path.join(__dirname,"../css/features/feed-classinfo-weekly.css"),"utf8");
const block=(css.match(/\.realtime-wait-host\{[^}]+\}/)||[])[0]||"";
if(!block)throw new Error("realtime wait host style missing");
if(/inset\s*:\s*0/.test(block))throw new Error("realtime wait notice must not cover the whole app");
if(!/pointer-events\s*:\s*none/.test(block))throw new Error("realtime wait notice must not block app interaction");
console.log("REALTIME_WAIT_NONBLOCKING_OK");
