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
const SHOP_ADMIN_TOKEN_SECONDS = 21600; // 6시간
const SHOP_PRODUCT_MAX_BYTES = 8500;
const SHOP_IMAGE_MAX_CHARS = 7200;
const SHOP_INVENTORY_PROPERTY_PREFIX = "MOARU_SHOP_INV_";
const MOARU_COMMAND_PROPERTY_PREFIX = "MOARU_COMMANDS_";
const SHOP_PURCHASE_OWNER_PROPERTY_PREFIX = "MOARU_PURCHASE_OWNER_";
const MOARU_COMMAND_LIMIT = 30;
const MOARU_TASK_PROPERTY_PREFIX = "MOARU_TASK_";
const MOARU_TASK_BACKUP_SHEET = "모아루_과제백업";
const MOARU_TASK_IMAGE_MAX_CHARS = 6500;
const MOARU_TASK_COMPLETED_TTL_MS = 2 * 24 * 60 * 60 * 1000;
const MOARU_TASK_MAX_COUNT = 300;
const MOARU_TASK_MAX_TOTAL_CHARS = 430000;
const MOARU_TASK_MAX_ITEM_CHARS = 8500;
const MOARU_TASK_BACKUP_HEADERS = ["event", "task_id", "user_id", "nickname", "title", "reward_coin", "status", "answer_excerpt", "has_image", "feedback", "updated_at", "actor", "backup_at"];

/**
 * 최초 1회만 Apps Script 편집기에서 직접 실행합니다.
 * 실행 후 고유 코드 문자열이 소스에 남지 않게 이 함수 전체를 삭제해도 됩니다.
 */
function setupMiniTalkAdminCodeOnce() {
  throw new Error("프로젝트 설정 > 스크립트 속성에서 MINITALK_ADMIN_CODE를 직접 설정하세요. 관리자 코드는 소스에 적지 않습니다.");
}

function shopJson_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 회원가입 직후 보상 시트에 코인 계정을 0으로 생성합니다.
 * 기존 coin.gs의 getRewardUserData_가 새 행을 읽을 수 있는지까지 확인하며,
 * 인식하지 못하는 시트 구조라면 방금 추가한 행을 제거해 손상을 막습니다.
 */
function ensureMoaruCoinAccount_(account) {
  const userId = String(account && account.userId || "").trim(), username = String(account && account.username || "").trim();
  if (!userId || userId.indexOf("guest-") === 0 || !username) return { ok: false, error: "INVALID_REWARD_USER" };
  const existing = getRewardUserData_(userId);
  if (existing) return { ok: true, created: false, coin: Math.max(0, parseInt(existing.coin, 10) || 0) };
  const sheet = getSheet_(REWARD_SHEET), headers = sheet.getRange(1, 1, 1, 4).getValues()[0].map(String);
  if (headers[0] !== "user_id" || headers[1] !== "username" || headers[2] !== "coin" || headers[3] !== "url") return { ok: false, error: "REWARD_SHEET_SCHEMA_UNSUPPORTED" };
  const url = MANUAL_WEB_APP_URL ? MANUAL_WEB_APP_URL + "?user_id=" + encodeURIComponent(userId) : "";
  sheet.appendRow([userId, username, 0, url]);const insertedRow = sheet.getLastRow(), created = getRewardUserData_(userId);
  if (created) return { ok: true, created: true, coin: 0 };
  try { if (String(sheet.getRange(insertedRow, COL_REWARD_USER_ID).getValue() || "").trim() === userId) sheet.deleteRow(insertedRow); } catch (rollbackError) { console.error("REWARD_ACCOUNT_ROLLBACK_FAILED", userId, rollbackError); }
  return { ok: false, error: "REWARD_ACCOUNT_INIT_FAILED" };
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
    try { const users = JSON.parse(cached).filter(function (item) { return item && String(item.user_id || "").indexOf("guest-") !== 0; });return users.some(function (item) { return item.user_id === requester; }) ? shopJson_({ ok: true, users: users }) : shopJson_({ ok: false, error: "LOGIN_REQUIRED" }); } catch (error) {}
  }
  const sheet = getSheet_(LOGIN_SHEET), lastRow = sheet.getLastRow(), users = [];
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 4).getValues().forEach(function (row) {
      const userId = String(row[0] || "").trim(), nickname = String(row[3] || row[1] || "").trim();
      if (userId && userId.indexOf("guest-") !== 0 && nickname) users.push({ user_id: userId, nickname: nickname.slice(0, 30) });
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

function isMoaruChatBackupUser_(userId) {
  const id = String(userId || "").trim();
  if (!id || id.indexOf("guest-") === 0) return false;
  const sheet = getSheet_(LOGIN_SHEET), lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  return sheet.getRange(2, 1, lastRow - 1, 1).getValues().some(function (row) { return String(row[0] || "").trim() === id; });
}

function ensureMoaruChatBackupRoom_(p) {
  const roomId = String(p.room_id || "").trim();
  if (!roomId || roomId === "global") return null;
  const sheet = socialRooms_ensureSheet_();let col = socialRooms_findColById_(sheet, roomId);
  if (col < 1) {
    col = socialRooms_nextEmptyCol_(sheet);
    if (col > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), col - sheet.getMaxColumns());
    sheet.getRange(1, col).setValue(roomId);sheet.getRange(4, col).setValue(Number(p.updated_at) || Date.now());sheet.getRange(5, col).setValue("");
    PropertiesService.getDocumentProperties().setProperty("WG_LASTROW_" + roomId, "6");
  }
  const title = String(p.title || "").trim().slice(0, 80);if (title) sheet.getRange(2, col).setValue(title);
  let members = [];
  try { members = JSON.parse(p.members_json || "[]"); } catch (error) {}
  const nicknames = members.map(function (member) { return String(member && member.nickname || "").trim(); }).filter(Boolean);
  if (nicknames.length) sheet.getRange(3, col).setValue(socialRooms_formatMembers_(true, nicknames));
  socialRooms_invalidateMetaCache_();return { sheet: sheet, col: col };
}

/** Firebase 방 메타를 기존 '대화방' 백업 컬럼에만 반영합니다. 삭제 이벤트도 과거 백업을 지우지 않습니다. */
function handleMoaruChatRoomBackup(e) {
  const p = (e && e.parameter) || {};
  if (!isMoaruChatBackupUser_(p.actor_user_id)) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  if (String(p.room_id || "") === "global") return shopJson_({ ok: true });
  const lock = LockService.getDocumentLock();lock.waitLock(20000);
  try { return shopJson_({ ok: Boolean(ensureMoaruChatBackupRoom_(p)) }); } finally { lock.releaseLock(); }
}

/** Firebase 방 메시지를 기존 '대화방' 컬럼 형식으로 백업합니다. */
function handleMoaruChatMessageBackup(e) {
  const p = (e && e.parameter) || {};
  if (!isMoaruChatBackupUser_(p.user_id)) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const lock = LockService.getDocumentLock();lock.waitLock(20000);
  try { ensureMoaruChatBackupRoom_({ room_id: p.room_id, title: p.room_title, members_json: JSON.stringify([{ nickname: p.nickname }]), updated_at: p.ts }); }
  finally { lock.releaseLock(); }
  return shopJson_(socialRooms_log_(p));
}

/** 기존 대화방 시트가 있을 때만 잘못 생성된 중복 탭 하나를 삭제하는 1회성 정리 함수입니다. */
function removeObsoleteMiniTalkRoomBackupSheetOnce() {
  const ss = SpreadsheetApp.openById(SHEET_ID), canonical = ss.getSheetByName("대화방"), obsolete = ss.getSheetByName("미니톡_대화방백업");
  if (!canonical) throw new Error("기존 대화방 시트가 없어 삭제를 중단했습니다.");
  if (!obsolete) return "삭제할 중복 시트가 없습니다.";
  ss.deleteSheet(obsolete);return "미니톡_대화방백업 시트를 삭제했습니다.";
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
function enqueueMoaruCommand_(userId, type, payload, issuedBy) {
  const queue = readMoaruCommands_(userId);
  queue.push({ id: Utilities.getUuid(), type: type, payload: payload || {}, createdAt: Date.now(), issuedBy: String(issuedBy || "admin") });
  writeMoaruCommands_(userId, queue);
}

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
    targets.forEach(function (target) { enqueueMoaruCommand_(target, type, payload, p.user_id); });
    return shopJson_({ ok: true, count: targets.length });
  } finally { lock.releaseLock(); }
}

/** POST mode=admin_user_balances: 관리자 대상 명단에 표시할 현재 코인 잔액 */
function handleAdminUserBalances(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  const users = moaruRegisteredUserMap_(), rows = Object.keys(users).map(function (userId) {
    const reward = getRewardUserData_(userId);
    return { user_id: userId, nickname: users[userId], coin: Math.max(0, parseInt(reward && reward.coin, 10) || 0) };
  });
  return shopJson_({ ok: true, users: rows });
}

/** POST mode=admin_coin_reward: 관리자 토큰 확인 후 등록 사용자의 코인을 증감합니다. */
function handleAdminCoinReward(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  const amount = Number(p.amount);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) return shopJson_({ ok: false, error: "INVALID_COIN_AMOUNT" });
  let targets = [];
  try { targets = JSON.parse(p.targets_json || "[]"); } catch (error) { return shopJson_({ ok: false, error: "INVALID_COMMAND_DATA" }); }
  targets = targets.map(String).filter(function (id, index, list) { return id && list.indexOf(id) === index && requireRegisteredShopUser_(id); }).slice(0, 200);
  if (!targets.length) return shopJson_({ ok: false, error: "NO_TARGETS" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    const rewarded = [], failed = [];
    targets.forEach(function (target) {
      try {
        const result = processCoinChangeUnlocked_(target, amount > 0 ? "add" : "remove", Math.abs(amount));
        if (result && result.success) {
          const newCoin = Number(result.newCoin) || 0;
          rewarded.push({ user_id: target, newCoin: newCoin });
          enqueueMoaruCommand_(target, "COIN_REWARD", { amount: amount, newCoin: newCoin, reason: String(p.reason || "관리자 보상").trim().slice(0, 80) }, p.user_id);
        } else failed.push({ user_id: target, error: "COIN_CHANGE_FAILED" });
      } catch (error) { failed.push({ user_id: target, error: String(error && error.message || error) }); }
    });
    if (!rewarded.length) return shopJson_({ ok: false, error: "COIN_REWARD_FAILED", failed: failed });
    return shopJson_({ ok: true, count: rewarded.length, amount: amount, rewarded: rewarded, failed: failed, reason: String(p.reason || "관리자 보상").trim().slice(0, 80) });
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

function moaruTaskStore_() { return PropertiesService.getDocumentProperties(); }
function moaruTaskPropertyKey_(taskId) { return MOARU_TASK_PROPERTY_PREFIX + moaruSafeKey_(taskId); }
function readMoaruTasks_() {
  const values = moaruTaskStore_().getProperties(), tasks = [];
  Object.keys(values).forEach(function (key) {
    if (key.indexOf(MOARU_TASK_PROPERTY_PREFIX) !== 0) return;
    try { const task = JSON.parse(values[key]);if (task && task.id && task.userId) tasks.push(task); }
    catch (error) { console.error("INVALID_MOARU_TASK", key, error); }
  });
  return tasks;
}
function readMoaruTask_(taskId) {
  try { return JSON.parse(moaruTaskStore_().getProperty(moaruTaskPropertyKey_(taskId)) || "null"); }
  catch (error) { return null; }
}
function serializeMoaruTask_(task) {
  const serialized = JSON.stringify(task || {});
  if (serialized.length > MOARU_TASK_MAX_ITEM_CHARS) throw new Error("TASK_STORAGE_ITEM_TOO_LARGE");
  return serialized;
}
function assertMoaruTaskCapacity_(updates) {
  const current = moaruTaskStore_().getProperties(), merged = {}, keys = Object.keys(current).filter(function (key) { return key.indexOf(MOARU_TASK_PROPERTY_PREFIX) === 0; });
  keys.forEach(function (key) { merged[key] = current[key]; });Object.keys(updates).forEach(function (key) { merged[key] = updates[key]; });
  const taskKeys = Object.keys(merged);if (taskKeys.length > MOARU_TASK_MAX_COUNT) throw new Error("TASK_STORAGE_FULL");
  const total = taskKeys.reduce(function (sum, key) { return sum + key.length + String(merged[key] || "").length; }, 0);
  if (total > MOARU_TASK_MAX_TOTAL_CHARS) throw new Error("TASK_STORAGE_FULL");
}
function writeMoaruTask_(task) {
  const key = moaruTaskPropertyKey_(task.id), updates = {};updates[key] = serializeMoaruTask_(task);assertMoaruTaskCapacity_(updates);moaruTaskStore_().setProperty(key, updates[key]);return task;
}
function writeMoaruTasks_(tasks) {
  const updates = {};tasks.forEach(function (task) { updates[moaruTaskPropertyKey_(task.id)] = serializeMoaruTask_(task); });assertMoaruTaskCapacity_(updates);moaruTaskStore_().setProperties(updates, false);return tasks;
}
function publicMoaruTask_(task) { return Object.assign({}, task); }
function getOrCreateMoaruTaskBackupSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);let sheet = ss.getSheetByName(MOARU_TASK_BACKUP_SHEET);
  if (!sheet) { sheet = ss.insertSheet(MOARU_TASK_BACKUP_SHEET);sheet.getRange(1, 1, 1, MOARU_TASK_BACKUP_HEADERS.length).setValues([MOARU_TASK_BACKUP_HEADERS]);sheet.setFrozenRows(1); }
  return sheet;
}
function backupMoaruTaskEvent_(eventName, task, actor) {
  try { getOrCreateMoaruTaskBackupSheet_().appendRow([eventName, task.id, task.userId, task.nickname, task.title, task.rewardCoin, task.status, String(task.answer || "").slice(0, 1000), task.imageData ? "Y" : "N", String(task.feedback || "").slice(0, 100), task.updatedAt || Date.now(), String(actor || ""), new Date()]); }
  catch (error) { console.error("MOARU_TASK_BACKUP_FAILED", eventName, task && task.id, error); }
}
function cleanupCompletedMoaruTasks_() {
  const cutoff = Date.now() - MOARU_TASK_COMPLETED_TTL_MS, expired = readMoaruTasks_().filter(function (task) { return task.status === "completed" && task.completedAt > 0 && task.completedAt <= cutoff; });
  expired.forEach(function (task) { moaruTaskStore_().deleteProperty(moaruTaskPropertyKey_(task.id)); });return expired.length;
}

/** 시간 기반 트리거 또는 과제 API에서 호출됩니다. 완료 48시간 뒤 서버 원본만 삭제하고 백업 시트는 유지합니다. */
function cleanupCompletedMoaruTasks() {
  const lock = LockService.getScriptLock();if (!lock.tryLock(5000)) return 0;
  try { return cleanupCompletedMoaruTasks_(); } finally { lock.releaseLock(); }
}
function setupMoaruTaskCleanupTrigger() {
  ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === "cleanupCompletedMoaruTasks"; }).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger("cleanupCompletedMoaruTasks").timeBased().everyDays(1).atHour(3).create();
  return "모아루 완료 과제 정리 트리거 설정 완료";
}

function moaruRegisteredUserMap_() {
  const sheet = getSheet_(LOGIN_SHEET), lastRow = sheet.getLastRow(), result = {};
  if (lastRow < 2) return result;
  sheet.getRange(2, 1, lastRow - 1, 4).getValues().forEach(function (row) {
    const id = String(row[0] || "").trim();if (!id || id.indexOf("guest-") === 0) return;
    result[id] = String(row[3] || row[1] || id).trim().slice(0, 30);
  });
  return result;
}

/** POST mode=admin_task_assign */
function handleAdminTaskAssign(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  const title = String(p.title || "").trim().slice(0, 80), descriptionRaw = String(p.description || ""), rewardCoin = Number(p.reward_coin);
  if (!title) return shopJson_({ ok: false, error: "INVALID_TASK_TITLE" });
  if (descriptionRaw.length > 1000) return shopJson_({ ok: false, error: "TASK_DESCRIPTION_TOO_LONG" });
  if (!Number.isInteger(rewardCoin) || rewardCoin < 1 || rewardCoin > 100000) return shopJson_({ ok: false, error: "INVALID_COIN_AMOUNT" });
  let requested = [];
  try { requested = JSON.parse(p.targets_json || "[]"); } catch (error) { return shopJson_({ ok: false, error: "INVALID_COMMAND_DATA" }); }
  const users = moaruRegisteredUserMap_(), targets = requested.map(String).filter(function (id, index, list) { return id && list.indexOf(id) === index && users[id]; }).slice(0, 200);
  if (!targets.length) return shopJson_({ ok: false, error: "NO_TARGETS" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    cleanupCompletedMoaruTasks_();
    const now = Date.now(), ids = [], tasks = [];
    targets.forEach(function (target) {
      const task = { id: "task-" + Utilities.getUuid(), userId: target, nickname: users[target], title: title, description: descriptionRaw.trim(), rewardCoin: rewardCoin, status: "open", createdAt: now, issuedBy: String(p.user_id), updatedAt: now };
      tasks.push(task);ids.push(task.id);
    });
    writeMoaruTasks_(tasks);
    tasks.forEach(function (task) { backupMoaruTaskEvent_("ASSIGNED", task, p.user_id);enqueueMoaruCommand_(task.userId, "TASK_ASSIGNED", { taskId: task.id, title: title, rewardCoin: rewardCoin }, p.user_id); });
    return shopJson_({ ok: true, count: tasks.length, task_ids: ids });
  } finally { lock.releaseLock(); }
}

/** POST mode=user_task_list */
function handleUserTaskList(e) {
  const p = (e && e.parameter) || {}, userId = requireRegisteredShopUser_(p.user_id);
  if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  cleanupCompletedMoaruTasks_();
  const tasks = readMoaruTasks_().filter(function (task) { return task.userId === userId; }).sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 100).map(publicMoaruTask_);
  return shopJson_({ ok: true, tasks: tasks });
}

/** POST mode=user_task_submit */
function handleUserTaskSubmit(e) {
  const p = (e && e.parameter) || {}, userId = requireRegisteredShopUser_(p.user_id), taskId = String(p.task_id || "").trim();
  if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const answer = String(p.answer || ""), imageData = String(p.image_data || "").trim();
  if (answer.length > 1000) return shopJson_({ ok: false, error: "TASK_ANSWER_TOO_LONG" });
  if (!answer.trim() && !imageData) return shopJson_({ ok: false, error: "TASK_ANSWER_REQUIRED" });
  if (imageData.length > MOARU_TASK_IMAGE_MAX_CHARS || (imageData && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(imageData))) return shopJson_({ ok: false, error: "INVALID_TASK_IMAGE" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    cleanupCompletedMoaruTasks_();const task = readMoaruTask_(taskId);
    if (task && task.userId !== userId) return shopJson_({ ok: false, error: "TASK_NOT_FOUND" });
    if (!task) return shopJson_({ ok: false, error: "TASK_NOT_FOUND" });
    if (task.status === "completed") return shopJson_({ ok: false, error: "TASK_ALREADY_COMPLETED" });
    const now = Date.now();task.answer = answer.trim();task.imageData = imageData;task.status = "submitted";task.feedback = "";task.submittedAt = now;task.updatedAt = now;writeMoaruTask_(task);backupMoaruTaskEvent_("SUBMITTED", task, userId);
    return shopJson_({ ok: true, task: publicMoaruTask_(task) });
  } finally { lock.releaseLock(); }
}

/** POST mode=admin_task_list */
function handleAdminTaskList(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  cleanupCompletedMoaruTasks_();
  const tasks = readMoaruTasks_().sort(function (a, b) { return b.updatedAt - a.updatedAt; }).slice(0, 200).map(publicMoaruTask_);
  return shopJson_({ ok: true, tasks: tasks });
}

/** POST mode=admin_task_review */
function handleAdminTaskReview(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token), taskId = String(p.task_id || "").trim(), action = String(p.action || "").trim(), feedback = String(p.feedback || "").trim();
  if (!auth.ok) return shopJson_(auth);
  if (["complete", "retry"].indexOf(action) < 0) return shopJson_({ ok: false, error: "INVALID_TASK_REVIEW" });
  if (feedback.length > 100) return shopJson_({ ok: false, error: "TASK_FEEDBACK_TOO_LONG" });
  if (action === "retry" && !feedback) return shopJson_({ ok: false, error: "TASK_FEEDBACK_REQUIRED" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    cleanupCompletedMoaruTasks_();const task = readMoaruTask_(taskId);
    if (!task) return shopJson_({ ok: false, error: "TASK_NOT_FOUND" });
    if (task.status !== "submitted" && !(action === "complete" && task.status === "completed")) return shopJson_({ ok: false, error: "TASK_NOT_SUBMITTED" });
    if (task.status === "completed") return shopJson_({ ok: true, task: publicMoaruTask_(task), alreadyCompleted: true });
    const now = Date.now();task.reviewedAt = now;task.updatedAt = now;task.feedback = feedback;
    if (action === "retry") {
      task.status = "retry";writeMoaruTask_(task);backupMoaruTaskEvent_("RETRY", task, p.user_id);
      enqueueMoaruCommand_(task.userId, "TASK_RETRY", { taskId: task.id, title: task.title, feedback: feedback }, p.user_id);
      return shopJson_({ ok: true, task: publicMoaruTask_(task) });
    }
    const result = processCoinChangeUnlocked_(task.userId, "add", task.rewardCoin);
    if (!result || !result.success) return shopJson_({ ok: false, error: "COIN_REWARD_FAILED" });
    task.status = "completed";task.completedAt = now;task.rewardedAt = now;task.newCoin = Number(result.newCoin) || 0;writeMoaruTask_(task);backupMoaruTaskEvent_("COMPLETED", task, p.user_id);
    enqueueMoaruCommand_(task.userId, "TASK_COMPLETED", { taskId: task.id, title: task.title, amount: task.rewardCoin, newCoin: task.newCoin, feedback: feedback }, p.user_id);
    return shopJson_({ ok: true, task: publicMoaruTask_(task) });
  } finally { lock.releaseLock(); }
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

    const result = processCoinChangeUnlocked_(userId, "remove", product.price);
    if (!result || !result.success) return shopJson_({ ok: false, error: "COIN_DEDUCTION_FAILED" });

    try {
      logSheet.appendRow([
        purchaseKey, userId, product.id, product.name, product.price,
        beforeCoin, result.newCoin, new Date()
      ]);
    } catch (logError) {
      try { processCoinChangeUnlocked_(userId, "add", product.price); }
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
 */
