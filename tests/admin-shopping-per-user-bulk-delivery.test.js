const fs=require("fs");
const shop=fs.readFileSync("js/features/shopping.js","utf8");
function ok(v,m){if(!v)throw new Error(m)}
ok(shop.includes('text: "이 사용자 완료"'),"per-user bulk completion button missing");
ok(shop.includes('const queue=[...groupRows]'),"per-user bulk completion does not target only the selected user group");
ok(shop.includes('shopDeliveryCompleteBulk'),"per-user bulk completion must reuse the existing bulk delivery API");
ok(shop.includes('completedKeys')&&shop.includes('rows=rows.filter'),"successful per-user bulk completion must remove only completed group rows");
ok(shop.includes('text: "일괄 배송완료"'),"global bulk completion button regressed");
console.log("admin per-user bulk delivery test passed");
