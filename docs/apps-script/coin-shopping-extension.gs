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
    updatedAt: Number(product.updatedAt) || Date.now()
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
  const catalog = readShopCatalog_();
  const products = Object.keys(catalog).map(function (id) {
    return normalizeShopProduct_(catalog[id]);
  }).filter(function (product) {
    return product.id && product.name && product.price > 0 && product.active;
  });
  return shopJson_({ ok: true, products: products });
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

/** POST mode=shop_purchase */
function handleShopPurchase(e) {
  const p = (e && e.parameter) || {};
  const userId = String(p.user_id || "").trim();
  const productId = String(p.product_id || "").trim();
  const purchaseKey = String(p.purchase_key || "").trim();
  const clientPrice = parseInt(p.price, 10);

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
      return shopJson_({ ok: true, applied: false, reason: "ALREADY_PURCHASED", newCoin: duplicate.newCoin });
    }

    const product = normalizeShopProduct_(readShopCatalog_()[productId]);
    if (!product.id || !product.active || product.price <= 0) {
      return shopJson_({ ok: false, error: "PRODUCT_NOT_AVAILABLE" });
    }
    if (clientPrice !== product.price) {
      return shopJson_({
        ok: false,
        error: "PRICE_CHANGED",
        currentPrice: product.price,
        message: "상품 가격이 변경되었습니다. 쇼핑 화면을 다시 열어주세요."
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

    return shopJson_({
      ok: true,
      applied: true,
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      newCoin: result.newCoin
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
 * if (mode === "shop_product_save") return handleShopProductSave(e);
 * if (mode === "shop_product_delete") return handleShopProductDelete(e);
 * if (mode === "shop_purchase") return handleShopPurchase(e);
 * if (mode === "mini_talk_room_backup") return handleMiniTalkRoomBackup(e);
 * if (mode === "mini_talk_message_backup") return handleMiniTalkMessageBackup(e);
 */
