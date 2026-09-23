const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'js/features/shopping.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/features/shopping-store.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function ok(v, msg){ if(!v) throw new Error(msg); }
ok(js.includes('panel.style.width = "348px"'), 'inventory panel must have isolated 348px inline width');
ok(js.includes('panel.style.maxWidth = "calc(100% - 20px)"'), 'inventory panel must stay inside narrow viewport');
ok(js.includes('panel.style.right = "10px"'), 'inventory panel must stay right-aligned');
ok(!/@media\s*\(max-width:\s*560px\)[\s\S]*?\.shop-inventory-panel\s*\{[^}]*width\s*:/m.test(css), 'mobile media query must not override inventory width');
ok(/shopping-store\.css\?v=64\.5\.56/.test(html), 'shopping css cache bust missing');
const shoppingVersion=(html.match(/shopping\.js\?v=(\d+)\.(\d+)\.(\d+)/)||[]).slice(1).map(Number);
ok(shoppingVersion.length===3 && (shoppingVersion[0]>64 || (shoppingVersion[0]===64 && (shoppingVersion[1]>5 || (shoppingVersion[1]===5 && shoppingVersion[2]>=57)))), 'shopping js cache bust missing or regressed');
console.log('SHOPPING_INVENTORY_PWA_WIDTH_ISOLATION_OK');
