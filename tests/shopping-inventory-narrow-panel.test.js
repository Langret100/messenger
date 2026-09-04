const fs=require('fs');
const css=fs.readFileSync('css/features/shopping-store.css','utf8');
if(!/\.shop-inventory-panel\s*\{[^}]*width:\s*min\(348px,\s*calc\(100%\s*-\s*20px\)\)/s.test(css)){
  throw new Error('narrow inventory panel width rule missing');
}
if(/@media\s*\(max-width:\s*560px\)[\s\S]*?\.shop-inventory-panel\s*\{[^}]*width:\s*auto/s.test(css)){
  throw new Error('mobile inventory panel still expands to full width');
}
console.log('SHOPPING_INVENTORY_NARROW_PANEL_OK');
