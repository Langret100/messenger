const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const api = fs.readFileSync(path.join(root, 'js/adapters/auth-api.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'docs/apps-script/coin-shopping-extension.gs'), 'utf8');

for (const field of ['expected_name', 'expected_description', 'expected_updated_at']) {
  if (!api.includes(field)) throw new Error(`purchase request is missing ${field}`);
}
if (!server.includes('error: "PRODUCT_CHANGED"')) throw new Error('server must reject changed product information');
if (!server.includes('expectedName !== product.name')) throw new Error('server must compare the visible product name');
if (!server.includes('expectedDescription !== product.description')) throw new Error('server must compare the visible product description');
if (!server.includes('expectedUpdatedAt !== product.updatedAt')) throw new Error('server must compare the product revision');

const mismatchAt = server.indexOf('error: "PRODUCT_CHANGED"');
const deductionAt = server.indexOf('setRewardCoinForShopGuarded_(reward, beforeCoin - chargePrice)');
if (mismatchAt < 0 || deductionAt < 0 || mismatchAt > deductionAt) {
  throw new Error('product mismatch must be rejected before coin deduction');
}

console.log('SHOP_SNAPSHOT_GUARD_OK');
