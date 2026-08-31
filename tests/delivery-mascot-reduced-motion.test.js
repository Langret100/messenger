const fs=require('fs');
const path=require('path');
const css=fs.readFileSync(path.join(__dirname,'../css/features/shopping-store.css'),'utf8');
function ok(v,m){if(!v)throw new Error(m)}
ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion delivery override missing');
const block=css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
ok(block.includes('.delivery-order-mascot'), 'mascot reduced-motion rule missing');
ok(block.includes('animation: none !important'), 'mascot animation must be disabled under reduced motion');
ok(block.includes('opacity: 1 !important'), 'mascot must stay visible under reduced motion');
ok(block.includes('transform: none !important'), 'mascot must not jump to final translated frame');
console.log('DELIVERY_MASCOT_REDUCED_MOTION_OK');
