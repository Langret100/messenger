/*************************************************
 * coin.gs용 서버 상품·구매 확장
 *
 * 저장 위치
 * - 사용자별 보유 코인: 기존 "보상" 시트
 * - 상품 이름/가격/설명: Apps Script의 Script Properties
 * - 중복 차감 방지 이력: "구매로그" 시트
 *************************************************/

const SHOP_CATALOG_LEGACY_PROPERTY = "SHOP_CATALOG_JSON";
const SHOP_PRODUCT_PROPERTY_PREFIX = "SHOP_PRODUCT_";
const SHOP_ADMIN_CODE_PROPERTY = "MINITALK_ADMIN_CODE";
const SHOP_PURCHASE_LOG_SHEET = "구매로그";
const MINI_TALK_ROOM_BACKUP_SHEET = "미니톡_대화방백업";
const MINI_TALK_MESSAGE_BACKUP_SHEET = "미니톡_메시지백업";
const SHOP_ADMIN_TOKEN_SECONDS = 21600; // 6시간
const SHOP_PRODUCT_MAX_BYTES = 8500;
const SHOP_IMAGE_MAX_CHARS = 7200;
const SHOP_INVENTORY_PROPERTY_PREFIX = "MOARU_SHOP_INV_";
const MOARU_COMMAND_PROPERTY_PREFIX = "MOARU_COMMANDS_";
const SHOP_PURCHASE_OWNER_PROPERTY_PREFIX = "MOARU_PURCHASE_OWNER_";
const MOARU_COMMAND_LIMIT = 30;

/**
 * 최초 1회만 Apps Script 편집기에서 직접 실행합니다.
 * 실행 후 고유 코드 문자열이 소스에 남지 않게 이 함수 전체를 삭제해도 됩니다.
 */
function setupMiniTalkAdminCodeOnce() {
  PropertiesService.getScriptProperties().setProperty(
    SHOP_ADMIN_CODE_PROPERTY,
    "1029384756!"
  );
  return "MINITALK_ADMIN_CODE 설정 완료";
}

function shopJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

function readShopCatalog_() {
  const properties = PropertiesService.getScriptProperties();
  const values = properties.getProperties();
  const catalog = {};
  const legacyRaw = values[SHOP_CATALOG_LEGACY_PROPERTY];
  try {
    const legacy = legacyRaw ? JSON.parse(legacyRaw) : {};
    if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) Object.assign(catalog, legacy);
  } catch (error) {
    console.error("INVALID_LEGACY_SHOP_CATALOG", error);
  }
  Object.keys(values).forEach(function (key) {
    if (key.indexOf(SHOP_PRODUCT_PROPERTY_PREFIX) !== 0) return;
    try {
      const product = JSON.parse(values[key]);
      if (product && product.id) catalog[product.id] = product;
    } catch (error) {
      console.error("INVALID_SHOP_PRODUCT", key, error);
    }
  });
  return catalog;
}

function shopProductPropertyKey_(productId) {
  return SHOP_PRODUCT_PROPERTY_PREFIX + String(productId || "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 80);
}

function removeLegacyShopProduct_(productId) {
  const properties = PropertiesService.getScriptProperties();
  const raw = properties.getProperty(SHOP_CATALOG_LEGACY_PROPERTY);
  if (!raw) return;
  try {
    const catalog = JSON.parse(raw) || {};
    delete catalog[productId];
    if (Object.keys(catalog).length) properties.setProperty(SHOP_CATALOG_LEGACY_PROPERTY, JSON.stringify(catalog));
    else properties.deleteProperty(SHOP_CATALOG_LEGACY_PROPERTY);
  } catch (error) {
    console.error("LEGACY_SHOP_PRODUCT_REMOVE_FAILED", error);
  }
}

function writeShopProduct_(product) {
  const serialized = JSON.stringify(product || {});
  const bytes = Utilities.newBlob(serialized, "application/json").getBytes().length;
  if (bytes > SHOP_PRODUCT_MAX_BYTES) throw new Error("PRODUCT_DATA_TOO_LARGE");
  PropertiesService.getScriptProperties().setProperty(shopProductPropertyKey_(product.id), serialized);
  removeLegacyShopProduct_(product.id);
}

function normalizeShopProduct_(value) {
  const product = value || {};
  const price = Math.floor(Number(product.price) || 0);
  return {
    id: String(product.id || "").trim().slice(0, 80),
    name: String(product.name || "").trim().slice(0, 60),
    price: price,
    description: String(product.description || "").trim().slice(0, 160),
    imageUrl: String(product.imageUrl || product.imageData || "").trim().slice(0, SHOP_IMAGE_MAX_CHARS),
    active: product.active !== false,
    // 기존 상품에 개정 시각이 없으면 0으로 고정해 읽을 때마다 값이 달라지지 않게 합니다.
    updatedAt: Number(product.updatedAt) || 0
  };
}

function secureTextEquals_(left, right) {
  const saved = String(left || "");
  const provided = String(right || "");
  if (provided.length !== saved.length) return { ok: false, error: "ADMIN_AUTH_FAILED" };
  let mismatch = 0;
  for (let i = 0; i < saved.length; i++) mismatch |= saved.charCodeAt(i) ^ provided.charCodeAt(i);
  return mismatch === 0 ? { ok: true } : { ok: false, error: "ADMIN_AUTH_FAILED" };
}

function requireShopAdminToken_(userId, token) {
  const id = String(userId || "").trim();
  const value = String(token || "").trim();
  if (!id || !value) return { ok: false, error: "ADMIN_AUTH_REQUIRED" };
  const cachedUserId = CacheService.getScriptCache().get("shop-admin:" + value);
  return cachedUserId === id ? { ok: true } : { ok: false, error: "ADMIN_SESSION_EXPIRED" };
}

/** POST mode=admin_unlock: 로그인 사용자에게 6시간 관리자 토큰을 발급합니다. */
function handleAdminUnlock(e) {
  const p = (e && e.parameter) || {};
  const userId = String(p.user_id || "").trim();
  const code = String(p.admin_code || "");
  if (!userId || userId.indexOf("guest-") === 0 || !getRewardUserData_(userId)) {
    return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  }
  const savedCode = PropertiesService.getScriptProperties().getProperty(SHOP_ADMIN_CODE_PROPERTY) || "";
  if (!savedCode) return shopJson_({ ok: false, error: "ADMIN_CODE_NOT_CONFIGURED" });
  const verified = secureTextEquals_(savedCode, code);
  if (!verified.ok) return shopJson_(verified);

  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put("shop-admin:" + token, userId, SHOP_ADMIN_TOKEN_SECONDS);
  return shopJson_({ ok: true, admin: true, admin_token: token, expires_in: SHOP_ADMIN_TOKEN_SECONDS });
}

/** POST/GET mode=shop_catalog */
function handleShopCatalog() {
  const cache = CacheService.getScriptCache(), cached = cache.get("moaru-shop-catalog-v2");
  if (cached) return ContentService.createTextOutput(cached).setMimeType(ContentService.MimeType.JSON);
  const catalog = readShopCatalog_();
  const products = Object.keys(catalog).map(function (id) {
    return normalizeShopProduct_(catalog[id]);
  }).filter(function (product) {
    return product.id && product.name && product.price > 0 && product.active;
  });
  const response = JSON.stringify({ ok: true, products: products });
  if (response.length < 95000) cache.put("moaru-shop-catalog-v2", response, 120);
  return ContentService.createTextOutput(response).setMimeType(ContentService.MimeType.JSON);
}

/** POST/GET mode=user_directory: 비밀번호·아이디를 제외한 가입자 닉네임 명단 */
function handleUserDirectory(e) {
  const p = (e && e.parameter) || e || {};
  const requester = String(p.user_id || "").trim();
  if (!requester || requester.indexOf("guest-") === 0) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const cache = CacheService.getScriptCache(), cacheKey = "moaru-user-directory-v1";
  const cached = cache.get(cacheKey);
  if (cached) {
    try { const users = JSON.parse(cached);return users.some(function (item) { return item.user_id === requester; }) ? shopJson_({ ok: true, users: users }) : shopJson_({ ok: false, error: "LOGIN_REQUIRED" }); } catch (error) {}
  }
  const sheet = getSheet_(LOGIN_SHEET), lastRow = sheet.getLastRow(), users = [];
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 4).getValues().forEach(function (row) {
      const userId = String(row[0] || "").trim(), nickname = String(row[3] || row[1] || "").trim();
      if (userId && nickname) users.push({ user_id: userId, nickname: nickname.slice(0, 30) });
    });
  }
  if (!users.some(function (item) { return item.user_id === requester; })) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  cache.put(cacheKey, JSON.stringify(users), 60);
  return shopJson_({ ok: true, users: users });
}

/** POST mode=shop_product_save (관리자 전용) */
function handleShopProductSave(e) {
  const p = (e && e.parameter) || {};
  const auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  const imageData = String(p.image_data || "").trim();
  if (imageData.length > SHOP_IMAGE_MAX_CHARS) return shopJson_({ ok: false, error: "PRODUCT_IMAGE_TOO_LARGE" });

  const product = normalizeShopProduct_({
    id: p.product_id,
    name: p.name,
    price: p.price,
    description: p.description,
    imageUrl: imageData,
    active: true,
    updatedAt: Date.now()
  });
  if (!product.id || !product.name || product.price <= 0) {
    return shopJson_({ ok: false, error: "INVALID_PRODUCT" });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    if (product.imageUrl && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(product.imageUrl)) {
      return shopJson_({ ok: false, error: "INVALID_PRODUCT_IMAGE" });
    }
    writeShopProduct_(product);
    CacheService.getScriptCache().remove("moaru-shop-catalog-v2");
    return shopJson_({ ok: true, product: product });
  } finally {
    lock.releaseLock();
  }
}

/** POST mode=shop_product_delete (관리자 전용) */
function handleShopProductDelete(e) {
  const p = (e && e.parameter) || {};
  const auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  const productId = String(p.product_id || "").trim();
  if (!productId) return shopJson_({ ok: false, error: "MISSING_PRODUCT_ID" });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    PropertiesService.getScriptProperties().deleteProperty(shopProductPropertyKey_(productId));
    removeLegacyShopProduct_(productId);
    CacheService.getScriptCache().remove("moaru-shop-catalog-v2");
    return shopJson_({ ok: true, deleted: productId });
  } finally {
    lock.releaseLock();
  }
}

function getOrCreateMiniTalkBackupSheet_(name, headers) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function isMiniTalkBackupUser_(userId) {
  const id = String(userId || "").trim();
  if (!id || id.indexOf("guest-") === 0) return false;
  const sheet = getSheet_(LOGIN_SHEET), lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().some(function (row) { return String(row[0] || "").trim() === id; });
}

/** Firebase 대화방 원본의 쓰기 전용 시트 백업. 앱은 이 시트를 읽지 않습니다. */
function handleMiniTalkRoomBackup(e) {
  const p = (e && e.parameter) || {};
  if (!isMiniTalkBackupUser_(p.actor_user_id)) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const roomId = String(p.room_id || "").trim();
  if (!roomId) return shopJson_({ ok: false, error: "MISSING_ROOM_ID" });
  const sheet = getOrCreateMiniTalkBackupSheet_(MINI_TALK_ROOM_BACKUP_SHEET, [
    "event", "actor_user_id", "room_id", "title", "creator", "members_json", "updated_at", "backup_at"
  ]);
  sheet.appendRow([
    String(p.event || "UPSERT").slice(0, 20), String(p.actor_user_id), roomId,
    String(p.title || "").slice(0, 80), String(p.creator || ""), String(p.members_json || "").slice(0, 5000),
    String(p.updated_at || ""), new Date()
  ]);
  return shopJson_({ ok: true });
}

/** Firebase 메시지 원본의 쓰기 전용 시트 백업. 앱은 이 시트를 읽지 않습니다. */
function handleMiniTalkMessageBackup(e) {
  const p = (e && e.parameter) || {};
  if (!isMiniTalkBackupUser_(p.user_id)) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const messageId = String(p.message_id || "").trim(), roomId = String(p.room_id || "").trim();
  if (!messageId || !roomId) return shopJson_({ ok: false, error: "MISSING_MESSAGE_ID" });
  const sheet = getOrCreateMiniTalkBackupSheet_(MINI_TALK_MESSAGE_BACKUP_SHEET, [
    "message_id", "room_id", "user_id", "nickname", "type", "text", "image_url", "file_url", "file_name", "sent_at", "backup_at"
  ]);
  sheet.appendRow([
    messageId, roomId, String(p.user_id), String(p.nickname || "").slice(0, 80), String(p.message_type || "text").slice(0, 20),
    String(p.text || "").slice(0, 2000), String(p.image_url || "").slice(0, 1000), String(p.file_url || "").slice(0, 1000),
    String(p.file_name || "").slice(0, 200), String(p.sent_at || ""), new Date()
  ]);
  return shopJson_({ ok: true });
}

function getOrCreateShopPurchaseLogSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(SHOP_PURCHASE_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SHOP_PURCHASE_LOG_SHEET);
    sheet.getRange(1, 1, 1, 8).setValues([[
      "purchase_key", "user_id", "product_id", "product_name",
      "price", "coin_before", "coin_after", "timestamp"
    ]]);
  }
  return sheet;
}

function findShopPurchase_(sheet, purchaseKey) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const match = sheet.getRange(2, 1, lastRow - 1, 1).createTextFinder(String(purchaseKey)).matchEntireCell(true).findNext();
  if (!match) return null;
  const row = sheet.getRange(match.getRow(), 1, 1, 8).getValues()[0];
  return { userId: String(row[1]), productId: String(row[2]), newCoin: parseInt(row[6], 10) || 0 };
}

function moaruSafeKey_(value) {
  return String(value || "").replace(/[^0-9A-Za-z_-]/g, "_").slice(0, 100);
}

function shopInventoryPrefix_(userId) {
  return SHOP_INVENTORY_PROPERTY_PREFIX + moaruSafeKey_(userId) + "_";
}

function shopInventoryKey_(userId, inventoryId) {
  return shopInventoryPrefix_(userId) + moaruSafeKey_(inventoryId);
}

function purchaseOwnerKey_(purchaseKey) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(purchaseKey || ""));
  return SHOP_PURCHASE_OWNER_PROPERTY_PREFIX + digest.slice(0, 12).map(function (value) { return (value & 255).toString(16).padStart(2, "0"); }).join("");
}

function setPurchaseOwner_(purchaseKey, ownerId, inventoryId) {
  if (!purchaseKey) return;
  PropertiesService.getScriptProperties().setProperty(purchaseOwnerKey_(purchaseKey), JSON.stringify({ ownerId: ownerId, inventoryId: inventoryId }));
}

function getPurchaseOwner_(purchaseKey) {
  if (!purchaseKey) return null;
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(purchaseOwnerKey_(purchaseKey)) || "null"); } catch (error) { return null; }
}

function hydrateShopInventoryItem_(item, catalog) {
  const value = item || {}, product = (catalog || {})[value.productId] || {};
  return Object.assign({}, value, {
    name: value.name || product.name || "상품",
    description: value.description || product.description || "",
    imageUrl: value.imageUrl || product.imageUrl || "",
    price: Number(value.price || product.price) || 0
  });
}

function readShopInventory_(userId) {
  const properties = PropertiesService.getScriptProperties().getProperties();
  const prefix = shopInventoryPrefix_(userId), catalog = readShopCatalog_(), items = [];
  Object.keys(properties).forEach(function (key) {
    if (key.indexOf(prefix) !== 0) return;
    try { const item = JSON.parse(properties[key]);if (item && item.id) items.push(hydrateShopInventoryItem_(item, catalog)); }
    catch (error) { console.error("INVALID_SHOP_INVENTORY", key, error); }
  });
  return items.sort(function (a, b) { return Number(b.createdAt || b.giftedAt || 0) - Number(a.createdAt || a.giftedAt || 0); });
}

function writeShopInventoryItem_(userId, item) {
  const compact = Object.assign({}, item);
  delete compact.imageUrl; // 이미지는 상품 카탈로그에서 결합해 속성 용량을 줄입니다.
  PropertiesService.getScriptProperties().setProperty(shopInventoryKey_(userId, compact.id), JSON.stringify(compact));
  return hydrateShopInventoryItem_(compact, readShopCatalog_());
}

function createPurchasedInventory_(userId, product, purchaseKey) {
  const existing = readShopInventory_(userId).filter(function (item) { return item.purchaseKey === purchaseKey; })[0];
  if (existing) return existing;
  const now = Date.now(), item = {
    id: "inv-" + Utilities.getUuid(), ownerId: userId, productId: product.id,
    name: product.name, description: product.description || "", price: product.price,
    purchaseKey: purchaseKey, purchasedAt: now, createdAt: now
  };
  const saved = writeShopInventoryItem_(userId, item);
  setPurchaseOwner_(purchaseKey, userId, saved.id);
  return saved;
}

function requireRegisteredShopUser_(userId) {
  const id = String(userId || "").trim();
  return id && id.indexOf("guest-") !== 0 && getRewardUserData_(id) ? id : "";
}

/** POST mode=shop_inventory */
function handleShopInventory(e) {
  const userId = requireRegisteredShopUser_(((e && e.parameter) || {}).user_id);
  if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  return shopJson_({ ok: true, items: readShopInventory_(userId) });
}

/** POST mode=shop_gift: 서버 보관함에서 대상 사용자 보관함으로 원자적으로 이동 */
function handleShopGift(e) {
  const p = (e && e.parameter) || {}, userId = requireRegisteredShopUser_(p.user_id), targetId = requireRegisteredShopUser_(p.target_user_id);
  const inventoryId = String(p.inventory_id || "").trim();
  if (!userId || !targetId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  if (!inventoryId || userId === targetId) return shopJson_({ ok: false, error: "INVALID_GIFT_TARGET" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    let source = readShopInventory_(userId).filter(function (item) { return item.id === inventoryId; })[0];
    // v58까지 기기에만 남은 구매품은 구매로그로 소유권을 검증한 뒤 한 번만 서버 보관함으로 가져옵니다.
    if (!source && p.item_json) {
      try {
        const legacy = JSON.parse(p.item_json), purchase = findShopPurchase_(getOrCreateShopPurchaseLogSheet_(), legacy.purchaseKey);
        const owner = getPurchaseOwner_(legacy.purchaseKey);
        if (purchase && purchase.userId === userId && purchase.productId === String(legacy.productId || "") && (!owner || owner.ownerId === userId)) {
          source = writeShopInventoryItem_(userId, Object.assign({}, legacy, { id: inventoryId, ownerId: userId }));
          setPurchaseOwner_(legacy.purchaseKey, userId, inventoryId);
        }
      } catch (error) { console.error("LEGACY_GIFT_IMPORT_FAILED", error); }
    }
    if (!source || source.usedAt) return shopJson_({ ok: false, error: "GIFT_ITEM_NOT_AVAILABLE" });
    PropertiesService.getScriptProperties().deleteProperty(shopInventoryKey_(userId, inventoryId));
    const giftId = "gift-" + Utilities.getUuid(), now = Date.now();
    const gift = Object.assign({}, source, { id: giftId, ownerId: targetId, giftedBy: userId, giftedByNickname: String(p.nickname || "").trim().slice(0, 30), giftedAt: now, createdAt: now });
    delete gift.usedAt;
    const savedGift = writeShopInventoryItem_(targetId, gift);
    setPurchaseOwner_(gift.purchaseKey, targetId, giftId);
    return shopJson_({ ok: true, item: savedGift, target_user_id: targetId });
  } finally { lock.releaseLock(); }
}

/** POST mode=shop_use */
function handleShopUse(e) {
  const p = (e && e.parameter) || {}, userId = requireRegisteredShopUser_(p.user_id), inventoryId = String(p.inventory_id || "").trim();
  if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const item = readShopInventory_(userId).filter(function (row) { return row.id === inventoryId; })[0];
  if (!item || item.usedAt) return shopJson_({ ok: false, error: "ITEM_NOT_AVAILABLE" });
  item.usedAt = Date.now();writeShopInventoryItem_(userId, item);return shopJson_({ ok: true, usedAt: item.usedAt });
}

function moaruCommandKey_(userId) { return MOARU_COMMAND_PROPERTY_PREFIX + moaruSafeKey_(userId); }
function readMoaruCommands_(userId) { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(moaruCommandKey_(userId)) || "[]"); } catch (error) { return []; } }
function writeMoaruCommands_(userId, commands) { PropertiesService.getScriptProperties().setProperty(moaruCommandKey_(userId), JSON.stringify((commands || []).slice(-MOARU_COMMAND_LIMIT))); }

/** POST mode=admin_dispatch: 관리자 토큰을 서버에서 확인한 뒤 사용자 큐에 기록 */
function handleAdminDispatch(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  let targets = [], payload = {};
  try { targets = JSON.parse(p.targets_json || "[]");payload = JSON.parse(p.payload_json || "{}"); } catch (error) { return shopJson_({ ok: false, error: "INVALID_COMMAND_DATA" }); }
  targets = targets.map(String).filter(function (id, index, list) { return id && list.indexOf(id) === index && requireRegisteredShopUser_(id); }).slice(0, 200);
  const type = String(p.command_type || "NOTICE").trim().slice(0, 20);if (!targets.length) return shopJson_({ ok: false, error: "NO_TARGETS" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    targets.forEach(function (target) { const queue = readMoaruCommands_(target);queue.push({ id: Utilities.getUuid(), type: type, payload: payload, createdAt: Date.now(), issuedBy: String(p.user_id) });writeMoaruCommands_(target, queue); });
    return shopJson_({ ok: true, count: targets.length });
  } finally { lock.releaseLock(); }
}

/** POST mode=user_commands: 본인 큐 조회 및 처리 완료 항목 삭제 */
function handleUserCommands(e) {
  const p = (e && e.parameter) || {}, userId = requireRegisteredShopUser_(p.user_id);if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const ack = String(p.ack_ids || "").split(",").filter(Boolean), queue = readMoaruCommands_(userId);
  const remaining = queue.filter(function (command) { return ack.indexOf(String(command.id)) < 0; });
  if (remaining.length !== queue.length) writeMoaruCommands_(userId, remaining);
  return shopJson_({ ok: true, commands: remaining });
}

/** POST mode=shop_purchase */
function handleShopPurchase(e) {
  const p = (e && e.parameter) || {};
  const userId = String(p.user_id || "").trim();
  const productId = String(p.product_id || "").trim();
  const purchaseKey = String(p.purchase_key || "").trim();
  const clientPrice = parseInt(p.price, 10);
  const expectedName = String(p.expected_name || "").trim().slice(0, 60);
  const expectedDescription = String(p.expected_description || "").trim().slice(0, 160);
  const expectedUpdatedAt = Number(p.expected_updated_at) || 0;

  if (!userId || !productId || !purchaseKey || isNaN(clientPrice)) {
    return shopJson_({ ok: false, error: "MISSING_PARAM" });
  }
  if (userId.indexOf("guest-") === 0) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  if (purchaseKey.length > 180) return shopJson_({ ok: false, error: "INVALID_PURCHASE_KEY" });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(4000)) {
    return shopJson_({ ok: false, error: "SHOP_BUSY", message: "잠시 후 다시 시도해주세요." });
  }

  try {
    const logSheet = getOrCreateShopPurchaseLogSheet_();
    const duplicate = findShopPurchase_(logSheet, purchaseKey);
    if (duplicate) {
      if (duplicate.userId !== userId || duplicate.productId !== productId) {
        return shopJson_({ ok: false, error: "PURCHASE_KEY_CONFLICT" });
      }
      const duplicateProduct = normalizeShopProduct_(readShopCatalog_()[productId]);
      const duplicateItem = createPurchasedInventory_(userId, duplicateProduct, purchaseKey);
      return shopJson_({ ok: true, applied: false, reason: "ALREADY_PURCHASED", newCoin: duplicate.newCoin, item: duplicateItem });
    }

    const product = normalizeShopProduct_(readShopCatalog_()[productId]);
    if (!product.id || !product.active || product.price <= 0) {
      return shopJson_({ ok: false, error: "PRODUCT_NOT_AVAILABLE" });
    }
    // 구매 요청 자체에 포함된 화면 스냅샷을 비교하므로 별도 서버 조회가 필요 없습니다.
    // 이름·설명·가격·개정 시각 중 하나라도 다르면 코인 차감 전에 구매를 중단합니다.
    if (clientPrice !== product.price ||
        expectedName !== product.name ||
        expectedDescription !== product.description ||
        expectedUpdatedAt !== product.updatedAt) {
      return shopJson_({
        ok: false,
        error: "PRODUCT_CHANGED",
        currentPrice: product.price,
        currentUpdatedAt: product.updatedAt,
        message: "상품 정보가 변경되었습니다. 최신 상품을 확인해주세요."
      });
    }

    const userData = getRewardUserData_(userId);
    if (!userData) return shopJson_({ ok: false, error: "NO_REWARD_USER" });
    const beforeCoin = parseInt(userData.coin, 10) || 0;
    if (beforeCoin < product.price) {
      return shopJson_({ ok: false, error: "INSUFFICIENT_COIN", coin: beforeCoin });
    }

    const result = processCoinChange(userId, "remove", product.price);
    if (!result || !result.success) return shopJson_({ ok: false, error: "COIN_DEDUCTION_FAILED" });

    try {
      logSheet.appendRow([
        purchaseKey, userId, product.id, product.name, product.price,
        beforeCoin, result.newCoin, new Date()
      ]);
    } catch (logError) {
      try { processCoinChange(userId, "add", product.price); }
      catch (rollbackError) { console.error("SHOP_ROLLBACK_FAILED", rollbackError); }
      return shopJson_({ ok: false, error: "PURCHASE_LOG_FAILED" });
    }

    const inventoryItem = createPurchasedInventory_(userId, product, purchaseKey);
    return shopJson_({
      ok: true,
      applied: true,
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      newCoin: result.newCoin,
      item: inventoryItem
    });
  } catch (error) {
    return shopJson_({
      ok: false,
      error: "SHOP_PURCHASE_FAILED",
      message: String(error && error.message ? error.message : error)
    });
  } finally {
    lock.releaseLock();
  }
}

/*
 * Apps Script 설정 > 스크립트 속성에 아래 값을 먼저 추가하세요.
 * MINITALK_ADMIN_CODE = 관리자만 아는 고유 코드
 *
 * Code.gs mode 분기에 추가:
 * if (mode === "admin_unlock") return handleAdminUnlock(e);
 * if (mode === "shop_catalog") return handleShopCatalog(e);
 * if (mode === "user_directory") return handleUserDirectory(e);
 * if (mode === "shop_product_save") return handleShopProductSave(e);
 * if (mode === "shop_product_delete") return handleShopProductDelete(e);
 * if (mode === "shop_purchase") return handleShopPurchase(e);
 * if (mode === "mini_talk_room_backup") return handleMiniTalkRoomBackup(e);
 * if (mode === "mini_talk_message_backup") return handleMiniTalkMessageBackup(e);
 */
