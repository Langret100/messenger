const fs=require("fs");
const view=fs.readFileSync("js/tools/tarot-view.js","utf8");
const css=fs.readFileSync("css/features/tarot.css","utf8");
const html=fs.readFileSync("index.html","utf8");
const ok=(value,message)=>{if(!value)throw new Error(message)};

ok(view.includes('"aria-label": "타로 결과 닫기"')&&view.includes("onclick: close"),"tarot result click-to-close is missing");
ok(view.includes('event.key === "Enter" || event.key === " "'),"tarot result keyboard close is missing");
ok(css.includes(".tarot-close")&&css.includes("background: transparent")&&css.includes("border-radius: 0")&&css.includes(".tarot-close::before")&&css.includes("transform: translateY(-1px)"),"tarot close alignment or overlay is wrong");
ok(css.includes(".tarot-result:focus-visible"),"tarot result focus feedback is missing");
ok(html.includes("css/features/tarot.css?v=64.5.4")&&html.includes("js/tools/tarot-view.js?v=64.5.4"),"tarot cache versions are stale");
console.log("TAROT_CLOSE_UI_OK");
