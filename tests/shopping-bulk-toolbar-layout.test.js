const fs=require("fs");
const css=fs.readFileSync("css/features/shopping-store.css","utf8");
const index=fs.readFileSync("index.html","utf8");
if(!/\.shop-inventory-panel\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\)/s.test(css)) throw new Error("보관함은 헤더/묶음배송/목록 3행이어야 합니다.");
if(!/\.shop-bulk-delivery\s*\{[^}]*z-index:\s*2/s.test(css)) throw new Error("묶음배송 액션줄이 목록에 가려질 수 있습니다.");
if(!/shopping-store\.css\?v=64\.5\.21/.test(index)) throw new Error("shopping-store.css 캐시 버전이 갱신되지 않았습니다.");
console.log("SHOPPING_BULK_TOOLBAR_LAYOUT_OK");
