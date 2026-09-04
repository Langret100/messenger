const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'js/features/shopping.js'),'utf8');
const css=fs.readFileSync(path.join(root,'css/features/shopping-store.css'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(js.includes('shop-inventory-v2-list'),'inventory v2 list DOM missing');
ok(js.includes('shop-inventory-v2-card'),'inventory v2 card DOM missing');
ok(js.includes('shop-inventory-v2-image'),'inventory v2 image DOM missing');
ok(js.includes('shop-inventory-v2-actions'),'inventory v2 actions DOM missing');
ok(!js.includes('class: "shop-inventory-item"'),'legacy inventory card class still emitted');
ok(css.includes('.shop-inventory-v2-list{'),'inventory v2 list CSS missing');
ok(css.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),'inventory v2 2-column layout missing');
ok(css.includes('.shop-inventory-v2-image{'),'inventory v2 image CSS missing');
ok(css.includes('width:58px') && css.includes('height:50px'),'inventory image should stay compact');
ok(css.includes('.shop-inventory-v2-actions{'),'inventory v2 actions CSS missing');
ok(!css.includes('보관함 상품 카드: 쇼핑탭 상품 카드와 같은 카드형 그리드'),'old product-card imitation block still present');
console.log('SHOPPING_INVENTORY_V2_LAYOUT_OK');
