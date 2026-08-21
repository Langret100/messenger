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
const SHOP_MANAGER_CODE_PROPERTY = "MINITALK_SHOP_MANAGER_CODE";
const SHOP_ADMIN_SESSION_PREFIX = "shop-admin:";
const SHOP_PURCHASE_LOG_SHEET = "구매로그";
const MOARU_SHOP_INVENTORY_SHEET = "모아루_쇼핑보관함";
const MOARU_SHOP_INVENTORY_HEADERS = ["inventory_id","owner_id","product_id","name","description","price","purchase_key","purchased_at","created_at","gifted_by","gifted_by_nickname","gifted_at","delivery_status","delivery_requested_at","delivery_shipping_at","delivery_completed_at","delivery_cancelled_at","delivery_handled_by","used_at"];
const SHOP_ADMIN_TOKEN_SECONDS = 21600; // 6시간
const SHOP_PRODUCT_MAX_BYTES = 8500;
const SHOP_IMAGE_MAX_CHARS = 7200;
const SHOP_INVENTORY_PROPERTY_PREFIX = "MOARU_SHOP_INV_";
const MOARU_COMMAND_PROPERTY_PREFIX = "MOARU_COMMANDS_";
const SHOP_PURCHASE_OWNER_PROPERTY_PREFIX = "MOARU_PURCHASE_OWNER_";
const MOARU_COMMAND_LIMIT = 30;
const MOARU_COMMAND_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30일 지난 전달 대기 명령 정리
const MOARU_SHOP_COMPLETED_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 배송완료 상품은 사용자 화면 보존기간과 맞춰 7일 후 정리
const MOARU_SHOP_RECEIPT_TTL_MS = 2 * 24 * 60 * 60 * 1000; // 선물/배송 중복방지 영수증은 48시간 보존
const MOARU_TASK_PROPERTY_PREFIX = "MOARU_TASK_";
const MOARU_TASK_ASSIGN_REQUEST_PREFIX = "MOARU_TASK_ASSIGN_REQUEST_";
const MOARU_ADMIN_COIN_REQUEST_PREFIX = "MOARU_ADMIN_COIN_REQUEST_";
const MOARU_SHOP_GIFT_REQUEST_PREFIX = "MOARU_SHOP_GIFT_REQUEST_";
const MOARU_SHOP_DELIVERY_REQUEST_PREFIX = "MOARU_SHOP_DELIVERY_REQUEST_";
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

/** 신규 guest-* 계정과 로그인 시트에 남은 구형 "게스트####" 계정을 같은 게스트로 판정합니다. */
function isMoaruGuestIdentity_(userId, username, nickname) {
  const id = String(userId || "").trim();
  const login = String(username || "").trim();
  const name = String(nickname || "").trim();
  return /^guest-/i.test(id) || /^guest$/i.test(login) || /^(?:게스트|guest)\s*\d*$/i.test(name);
}

/**
 * 회원가입 직후 보상 시트에 코인 계정을 0으로 생성합니다.
 * 기존 coin.gs의 getRewardUserData_가 새 행을 읽을 수 있는지까지 확인하며,
 * 인식하지 못하는 시트 구조라면 방금 추가한 행을 제거해 손상을 막습니다.
 */
function ensureMoaruCoinAccount_(account) {
  const userId = String(account && account.userId || "").trim(), username = String(account && account.username || "").trim(), nickname = String(account && account.nickname || "").trim();
  if (!userId || isMoaruGuestIdentity_(userId, username, nickname) || !username) return { ok: false, error: "INVALID_REWARD_USER" };
  const existing = getRewardUserData_(userId);
  if (existing) return { ok: true, created: false, coin: parseInt(existing.coin, 10) || 0 };
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

function readShopAdminSession_(userId, token) {
  const id = String(userId || "").trim();
  const value = String(token || "").trim();
  if (!id || !value) return { ok: false, error: "ADMIN_AUTH_REQUIRED" };
  const raw = CacheService.getScriptCache().get(SHOP_ADMIN_SESSION_PREFIX + value);
  if (!raw) return { ok: false, error: "ADMIN_SESSION_EXPIRED" };
  // v5.18 이전 세션(값이 userId 문자열뿐인 형식)은 ADMIN으로만 호환합니다.
  if (raw === id) return { ok: true, role: "ADMIN" };
  try {
    const session = JSON.parse(raw);
    if (!session || String(session.userId || "") !== id) return { ok: false, error: "ADMIN_SESSION_EXPIRED" };
    const role = String(session.role || "ADMIN").toUpperCase();
    return role === "ADMIN" || role === "SHOP_MANAGER" ? { ok: true, role: role } : { ok: false, error: "ADMIN_ROLE_INVALID" };
  } catch (error) { return { ok: false, error: "ADMIN_SESSION_EXPIRED" }; }
}
function requireAdminToken_(userId, token) {
  const auth = readShopAdminSession_(userId, token);
  return auth.ok && auth.role === "ADMIN" ? auth : { ok: false, error: auth.ok ? "ADMIN_PERMISSION_REQUIRED" : auth.error };
}
function requireShopManagerToken_(userId, token) {
  const auth = readShopAdminSession_(userId, token);
  return auth.ok && (auth.role === "ADMIN" || auth.role === "SHOP_MANAGER") ? auth : { ok: false, error: auth.ok ? "SHOP_MANAGER_PERMISSION_REQUIRED" : auth.error };
}
// 기존 내부 호출 호환: 이름상 admin 토큰은 ADMIN 전용으로 유지합니다.
function requireShopAdminToken_(userId, token) { return requireAdminToken_(userId, token); }

/** POST mode=admin_unlock: ADMIN 또는 SHOP_MANAGER 코드를 검증해 6시간 역할 토큰을 발급합니다. */
function handleAdminUnlock(e) {
  const p = (e && e.parameter) || {};
  const userId = String(p.user_id || "").trim();
  const code = String(p.admin_code || "");
  if (!requireKnownMoaruUser_(userId)) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const props = PropertiesService.getScriptProperties();
  const adminCode = props.getProperty(SHOP_ADMIN_CODE_PROPERTY) || "";
  const shopCode = props.getProperty(SHOP_MANAGER_CODE_PROPERTY) || "";
  if (!adminCode && !shopCode) return shopJson_({ ok: false, error: "ADMIN_CODE_NOT_CONFIGURED" });
  let role = "";
  if (adminCode && secureTextEquals_(adminCode, code).ok) role = "ADMIN";
  else if (shopCode && secureTextEquals_(shopCode, code).ok) role = "SHOP_MANAGER";
  if (!role) return shopJson_({ ok: false, error: "ADMIN_AUTH_FAILED" });
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put(SHOP_ADMIN_SESSION_PREFIX + token, JSON.stringify({ userId: userId, role: role }), SHOP_ADMIN_TOKEN_SECONDS);
  return shopJson_({ ok: true, admin: role === "ADMIN", shop_manager: role === "SHOP_MANAGER", role: role, admin_token: token, expires_in: SHOP_ADMIN_TOKEN_SECONDS });
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
  if (!requester) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const cache = CacheService.getScriptCache(), cacheKey = "moaru-user-directory-v1";
  const cached = cache.get(cacheKey);
  if (cached) {
    try { const users = JSON.parse(cached).filter(function (item) { return item && !isMoaruGuestIdentity_(item.user_id, item.username, item.nickname); });return users.some(function (item) { return item.user_id === requester; }) ? shopJson_({ ok: true, users: users }) : shopJson_({ ok: false, error: "LOGIN_REQUIRED" }); } catch (error) {}
  }
  const sheet = getSheet_(LOGIN_SHEET), lastRow = sheet.getLastRow(), users = [];
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, 4).getValues().forEach(function (row) {
      const userId = String(row[0] || "").trim(), username = String(row[1] || "").trim(), nickname = String(row[3] || row[1] || "").trim();
      if (userId && !isMoaruGuestIdentity_(userId, username, nickname) && nickname) users.push({ user_id: userId, nickname: nickname.slice(0, 30) });
    });
  }
  if (!users.some(function (item) { return item.user_id === requester; })) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  cache.put(cacheKey, JSON.stringify(users), 60);
  return shopJson_({ ok: true, users: users });
}

/** POST mode=shop_product_save (관리자 전용) */
function handleShopProductSave(e) {
  const p = (e && e.parameter) || {};
  const auth = requireShopManagerToken_(p.user_id, p.admin_token);
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
  const auth = requireShopManagerToken_(p.user_id, p.admin_token);
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
  return { userId: String(row[1]), productId: String(row[2]), productName: String(row[3] || "상품"), price: parseInt(row[4], 10) || 0, newCoin: parseInt(row[6], 10) || 0 };
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

function getOrCreateShopInventorySheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(MOARU_SHOP_INVENTORY_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MOARU_SHOP_INVENTORY_SHEET);
    sheet.getRange(1, 1, 1, MOARU_SHOP_INVENTORY_HEADERS.length).setValues([MOARU_SHOP_INVENTORY_HEADERS]);
    sheet.setFrozenRows(1);
  } else {
    const width = Math.max(sheet.getLastColumn(), MOARU_SHOP_INVENTORY_HEADERS.length);
    const current = sheet.getRange(1, 1, 1, width).getValues()[0].slice(0, MOARU_SHOP_INVENTORY_HEADERS.length).map(String);
    if (current.join("\u0001") !== MOARU_SHOP_INVENTORY_HEADERS.join("\u0001")) {
      if (sheet.getLastRow() <= 1) sheet.getRange(1, 1, 1, MOARU_SHOP_INVENTORY_HEADERS.length).setValues([MOARU_SHOP_INVENTORY_HEADERS]);
      else throw new Error("MOARU_SHOP_INVENTORY_SCHEMA_MISMATCH");
    }
  }
  return sheet;
}

function shopInventoryRowToItem_(row) {
  const value = row || [];
  return {
    id: String(value[0] || ""), ownerId: String(value[1] || ""), productId: String(value[2] || ""),
    name: String(value[3] || ""), description: String(value[4] || ""), price: Number(value[5]) || 0,
    purchaseKey: String(value[6] || ""), purchasedAt: Number(value[7]) || 0, createdAt: Number(value[8]) || 0,
    giftedBy: String(value[9] || ""), giftedByNickname: String(value[10] || ""), giftedAt: Number(value[11]) || 0,
    deliveryStatus: String(value[12] || "") || "owned", deliveryRequestedAt: Number(value[13]) || 0,
    deliveryShippingAt: Number(value[14]) || 0, deliveryCompletedAt: Number(value[15]) || 0,
    deliveryCancelledAt: Number(value[16]) || 0, deliveryHandledBy: String(value[17] || ""), usedAt: Number(value[18]) || 0
  };
}

function shopInventoryItemToRow_(item) {
  const value = item || {};
  return [
    String(value.id || ""), String(value.ownerId || ""), String(value.productId || ""), String(value.name || ""),
    String(value.description || ""), Number(value.price) || 0, String(value.purchaseKey || ""), Number(value.purchasedAt) || 0,
    Number(value.createdAt) || 0, String(value.giftedBy || ""), String(value.giftedByNickname || ""), Number(value.giftedAt) || 0,
    String(value.deliveryStatus || (value.usedAt ? "completed" : "owned")), Number(value.deliveryRequestedAt) || 0,
    Number(value.deliveryShippingAt) || 0, Number(value.deliveryCompletedAt) || 0, Number(value.deliveryCancelledAt) || 0,
    String(value.deliveryHandledBy || ""), Number(value.usedAt) || 0
  ];
}

function readShopInventorySheetItems_() {
  const sheet = getOrCreateShopInventorySheet_(), lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, MOARU_SHOP_INVENTORY_HEADERS.length).getValues().map(shopInventoryRowToItem_).filter(function (item) { return item.id && item.ownerId; });
}

function findShopInventorySheetRow_(sheet, inventoryId) {
  const id = String(inventoryId || "");
  if (!id || sheet.getLastRow() < 2) return 0;
  const match = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).createTextFinder(id).matchEntireCell(true).findNext();
  return match ? match.getRow() : 0;
}

function setPurchaseOwner_(purchaseKey, ownerId, inventoryId) {
  // 신규 구조에서는 구매 소유권을 별도 Script Property로 만들지 않습니다.
  // purchaseKey가 보관함 시트 행 안에 저장되어 중복 구매/선물 검증에 사용됩니다.
  return { ownerId: ownerId, inventoryId: inventoryId };
}

function getPurchaseOwner_(purchaseKey) {
  const key = String(purchaseKey || "");
  if (!key) return null;
  const item = readShopInventorySheetItems_().filter(function (row) { return row.purchaseKey === key; })[0];
  if (item) return { ownerId: item.ownerId, inventoryId: item.id };
  // 마이그레이션 전 구형 포인터는 읽기 호환만 유지합니다.
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty(purchaseOwnerKey_(key)) || "null"); } catch (error) { return null; }
}

function hydrateShopInventoryItem_(item, catalog) {
  const value = item || {}, product = (catalog || {})[value.productId] || {};
  return Object.assign({}, value, {
    name: value.name || product.name || "상품",
    description: value.description || product.description || "",
    imageUrl: value.imageUrl || product.imageUrl || "",
    price: Number(value.price || product.price) || 0,
    deliveryStatus: value.deliveryStatus || (value.usedAt ? "completed" : "owned")
  });
}

function shopInventoryCacheKey_(userId) { return "moaru-shop-inv-v3-" + moaruSafeKey_(userId); }
function clearShopInventoryCache_(userId) { try { CacheService.getScriptCache().remove(shopInventoryCacheKey_(userId)); } catch (error) {} }
function readShopInventoryRowsForUser_(userId) {
  const id = String(userId || ""), sheet = getOrCreateShopInventorySheet_(), lastRow = sheet.getLastRow();
  if (!id || lastRow < 2) return [];
  // 100명 규모에서도 사용자 상품마다 getRange()를 반복하지 않고 한 번의 시트 읽기로 필터링합니다.
  return sheet.getRange(2, 1, lastRow - 1, MOARU_SHOP_INVENTORY_HEADERS.length).getValues()
    .map(shopInventoryRowToItem_)
    .filter(function (item) { return item.id && item.ownerId === id; });
}
function readShopInventoryFresh_(userId) {
  const id = String(userId || "");
  if (!id) return [];
  const catalog = readShopCatalog_();
  return readShopInventoryRowsForUser_(id).map(function (item) { return hydrateShopInventoryItem_(item, catalog); }).sort(function (a, b) { return Number(b.createdAt || b.giftedAt || 0) - Number(a.createdAt || a.giftedAt || 0); });
}
function readShopInventory_(userId) {
  const id = String(userId || ""), cache = CacheService.getScriptCache(), cacheKey = shopInventoryCacheKey_(id);
  if (!id) return [];
  try { const cached = cache.get(cacheKey);if (cached) { const parsed = JSON.parse(cached);if (Array.isArray(parsed)) return parsed; } } catch (error) {}
  const items = readShopInventoryFresh_(id);
  try { cache.put(cacheKey, JSON.stringify(items), 45); } catch (error) {}
  return items;
}

function writeShopInventoryItem_(userId, item) {
  const compact = Object.assign({}, item, { ownerId: String(userId || item.ownerId || "") });
  delete compact.imageUrl;
  if (!compact.id || !compact.ownerId) throw new Error("INVALID_SHOP_INVENTORY_ITEM");
  const sheet = getOrCreateShopInventorySheet_(), row = findShopInventorySheetRow_(sheet, compact.id), values = shopInventoryItemToRow_(compact);
  if (row) sheet.getRange(row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  clearShopInventoryCache_(compact.ownerId);
  return hydrateShopInventoryItem_(compact, readShopCatalog_());
}

function deleteShopInventoryItem_(userId, inventoryId) {
  const sheet = getOrCreateShopInventorySheet_(), row = findShopInventorySheetRow_(sheet, inventoryId);
  if (!row) return false;
  const owner = String(sheet.getRange(row, 2).getValue() || "");
  if (owner !== String(userId || "")) return false;
  sheet.deleteRow(row);clearShopInventoryCache_(owner);return true;
}

function createPurchasedInventory_(userId, product, purchaseKey) {
  const existing = readShopInventory_(userId).filter(function (item) { return item.purchaseKey === purchaseKey; })[0];
  if (existing) return existing;
  const now = Date.now(), item = {
    id: "inv-" + Utilities.getUuid(), ownerId: userId, productId: product.id,
    name: product.name, description: product.description || "", price: product.price,
    purchaseKey: purchaseKey, purchasedAt: now, createdAt: now, deliveryStatus: "owned"
  };
  return writeShopInventoryItem_(userId, item);
}

/*
 * 구매로그까지 확정됐지만 서버 보관함 쓰기만 일시 실패한 구매를 보존합니다.
 * 구매 자체를 실패 처리하면 새로고침 후 새 purchase_key로 다시 결제될 수 있으므로,
 * 이미 차감/로그가 확정된 구매는 pending으로 남기고 shop_inventory 조회 때 재구성합니다.
 */
const MOARU_SHOP_PENDING_PURCHASE_PREFIX = "MOARU_SHOP_PENDING_PURCHASE_";
function pendingShopPurchaseKey_(purchaseKey) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(purchaseKey || ""));
  return MOARU_SHOP_PENDING_PURCHASE_PREFIX + digest.slice(0, 12).map(function (value) { return (value & 255).toString(16).padStart(2, "0"); }).join("");
}
function rememberPendingShopPurchase_(userId, product, purchaseKey) {
  const payload = { userId: String(userId || ""), product: normalizeShopProduct_(product || {}), purchaseKey: String(purchaseKey || ""), createdAt: Date.now() };
  PropertiesService.getScriptProperties().setProperty(pendingShopPurchaseKey_(purchaseKey), JSON.stringify(payload));
  return payload;
}
function clearPendingShopPurchase_(purchaseKey) {
  PropertiesService.getScriptProperties().deleteProperty(pendingShopPurchaseKey_(purchaseKey));
}
function reconcilePendingShopPurchases_(userId) {
  const properties = PropertiesService.getScriptProperties(), all = properties.getProperties();
  Object.keys(all).filter(function (key) { return key.indexOf(MOARU_SHOP_PENDING_PURCHASE_PREFIX) === 0; }).forEach(function (key) {
    let pending = null;
    try { pending = JSON.parse(all[key] || "null"); } catch (error) { pending = null; }
    if (!pending || String(pending.userId || "") !== String(userId || "") || !pending.purchaseKey) return;
    try {
      createPurchasedInventory_(userId, pending.product || {}, pending.purchaseKey);
      properties.deleteProperty(key);
    } catch (error) {
      console.warn("SHOP_PENDING_INVENTORY_RETRY_FAILED", pending.purchaseKey, error);
    }
  });
}

/** 구형 상품별 Script Properties를 새 보관함 시트로 안전하게 옮깁니다. */
function migrateLegacyShopInventoryToSheetOnce() {
  const lock = LockService.getScriptLock();if (!lock.tryLock(10000)) throw new Error("SHOP_BUSY");
  try {
    const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), legacyKeys = Object.keys(all).filter(function (key) { return key.indexOf(SHOP_INVENTORY_PROPERTY_PREFIX) === 0; });
    const existingById = {};readShopInventorySheetItems_().forEach(function (row) { existingById[row.id] = row; });
    let migrated = 0, skipped = 0, invalid = 0;
    legacyKeys.forEach(function (key) {
      let item;
      try { item = JSON.parse(all[key] || "null"); } catch (error) { invalid++;return; }
      if (!item || !item.id || !item.ownerId) { invalid++;return; }
      let existing = existingById[String(item.id)];
      if (!existing) { existing = writeShopInventoryItem_(item.ownerId, item);existingById[String(item.id)] = existing;migrated++; }
      else skipped++;
      if (existing && String(existing.ownerId) === String(item.ownerId)) properties.deleteProperty(key);
    });
    // 새 구조에서 더 이상 쓰지 않는 구매 소유권 포인터는 시트 이전 검증 후 제거합니다.
    const leftovers = properties.getProperties();
    Object.keys(leftovers).filter(function (key) { return key.indexOf(SHOP_PURCHASE_OWNER_PROPERTY_PREFIX) === 0; }).forEach(function (key) { properties.deleteProperty(key); });
    const result = { scanned: legacyKeys.length, migrated: migrated, skipped: skipped, invalid: invalid };
    console.log("MOARU_SHOP_INVENTORY_SHEET_MIGRATION", JSON.stringify(result));return result;
  } finally { lock.releaseLock(); }
}

function requireKnownMoaruUser_(userId, registeredUsers) {
  const id = String(userId || "").trim();
  const users = registeredUsers || moaruRegisteredUserMap_();
  return id && users[id] ? id : "";
}
function requireRegisteredShopUser_(userId, registeredUsers) {
  const id = requireKnownMoaruUser_(userId, registeredUsers);
  return id && moaruSpreadsheetRetry_(function () { return getRewardUserData_(id); }) ? id : "";
}

/** POST mode=shop_inventory */
function handleShopInventory(e) {
  const userId = requireRegisteredShopUser_(((e && e.parameter) || {}).user_id);
  if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  // 결제/구매로그는 확정됐지만 서버 보관함 쓰기만 실패한 건이 있으면 먼저 복구합니다.
  reconcilePendingShopPurchases_(userId);
  return shopJson_({ ok: true, items: readShopInventory_(userId) });
}

/** POST mode=shop_gift: 서버 보관함에서 대상 사용자 보관함으로 원자적으로 이동 */
function handleShopGift(e) {
  const p = (e && e.parameter) || {}, registeredUsers = moaruSpreadsheetRetry_(function () { return moaruRegisteredUserMap_(); }), userId = requireRegisteredShopUser_(p.user_id, registeredUsers), targetId = requireRegisteredShopUser_(p.target_user_id, registeredUsers);
  const inventoryId = String(p.inventory_id || "").trim(), requestId = String(p.request_id || "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 100);
  if (!userId || !targetId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  if (!inventoryId || userId === targetId) return shopJson_({ ok: false, error: "INVALID_GIFT_TARGET" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    const receipts = PropertiesService.getScriptProperties(), receiptKey = requestId ? MOARU_SHOP_GIFT_REQUEST_PREFIX + requestId : "";let receipt = null;
    if (receiptKey) { try { receipt = JSON.parse(receipts.getProperty(receiptKey) || "null"); } catch (error) { receipt = null; } }
    if (receipt && (receipt.userId !== userId || receipt.targetId !== targetId || receipt.inventoryId !== inventoryId)) return shopJson_({ ok: false, error: "GIFT_REQUEST_CONFLICT" });
    if (receipt && receipt.status === "done") return shopJson_(receipt.result);
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
    if (!source && receipt && receipt.source) source = receipt.source;
    if (!source || source.usedAt || (source.deliveryStatus && source.deliveryStatus !== "owned")) return shopJson_({ ok: false, error: "GIFT_ITEM_NOT_AVAILABLE" });
    const giftId = requestId ? "gift-" + requestId : "gift-" + Utilities.getUuid(), now = Number(receipt && receipt.createdAt) || Date.now();
    if (receiptKey && !receipt) { receipt = { status: "pending", userId: userId, targetId: targetId, inventoryId: inventoryId, giftId: giftId, source: source, createdAt: now };receipts.setProperty(receiptKey, JSON.stringify(receipt)); }
    const gift = Object.assign({}, source, { id: giftId, ownerId: targetId, giftedBy: userId, giftedByNickname: String(p.nickname || "").trim().slice(0, 30), giftedAt: now, createdAt: now });
    delete gift.usedAt;gift.deliveryStatus = "owned";delete gift.deliveryRequestedAt;delete gift.deliveryCompletedAt;delete gift.deliveryCancelledAt;delete gift.deliveryHandledBy;
    const savedGift = writeShopInventoryItem_(targetId, gift);
    deleteShopInventoryItem_(userId, inventoryId);
    setPurchaseOwner_(gift.purchaseKey, targetId, giftId);
    enqueueMoaruCommand_(targetId, "SHOP_GIFT", { itemId: savedGift.id, name: savedGift.name, giftedByNickname: savedGift.giftedByNickname }, userId, requestId ? "shop-gift-" + requestId : "");
    const result = { ok: true, item: savedGift, target_user_id: targetId };if (receiptKey) receipts.setProperty(receiptKey, JSON.stringify({ status: "done", userId: userId, targetId: targetId, inventoryId: inventoryId, createdAt: now, result: result }));return shopJson_(result);
  } finally { lock.releaseLock(); }
}

function normalizeDeliveryStatus_(item) { return String(item && item.deliveryStatus || (item && item.usedAt ? "completed" : "owned")); }
function publicDeliveryItem_(item, users) {
  const value = item || {}, ownerId = String(value.ownerId || "");
  return { id: value.id, ownerId: ownerId, nickname: users && users[ownerId] || ownerId, productId: value.productId, name: value.name || "상품", status: normalizeDeliveryStatus_(value), requestedAt: Number(value.deliveryRequestedAt) || 0, shippingAt: Number(value.deliveryShippingAt) || 0, completedAt: Number(value.deliveryCompletedAt) || 0, cancelledAt: Number(value.deliveryCancelledAt) || 0, handledBy: String(value.deliveryHandledBy || "") };
}
/** POST mode=shop_request_delivery: 소유자만 배송 요청 가능. */
function handleShopRequestDelivery(e) {
  const p = (e && e.parameter) || {}, users = moaruSpreadsheetRetry_(function () { return moaruRegisteredUserMap_(); }), userId = requireRegisteredShopUser_(p.user_id, users), inventoryId = String(p.inventory_id || "").trim(), requestId = String(p.request_id || "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 100);
  if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  if (!inventoryId) return shopJson_({ ok: false, error: "MISSING_INVENTORY_ID" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    const item = readShopInventoryFresh_(userId).filter(function (row) { return row.id === inventoryId; })[0];
    if (!item || String(item.ownerId || userId) !== userId) return shopJson_({ ok: false, error: "ITEM_NOT_AVAILABLE" });
    const status = normalizeDeliveryStatus_(item);
    if (status === "requested" || status === "shipping") return shopJson_({ ok: true, alreadyRequested: true, item: item, deliveryStatus: status });
    if (status === "completed") return shopJson_({ ok: true, alreadyCompleted: true, item: item, deliveryStatus: status });
    if (status !== "owned" && status !== "cancelled") return shopJson_({ ok: false, error: "DELIVERY_STATE_INVALID" });
    const now = Date.now();item.deliveryStatus = "requested";item.deliveryRequestedAt = now;delete item.deliveryShippingAt;delete item.deliveryCompletedAt;delete item.deliveryCancelledAt;delete item.deliveryHandledBy;delete item.usedAt;
    const saved = writeShopInventoryItem_(userId, item);
    if (requestId) PropertiesService.getScriptProperties().setProperty(MOARU_SHOP_DELIVERY_REQUEST_PREFIX + requestId, JSON.stringify({ userId: userId, inventoryId: inventoryId, requestedAt: now }));
    return shopJson_({ ok: true, item: saved, deliveryStatus: "requested", deliveryRequestedAt: now, cue: { sound: "delivery-class-order", animation: "running-student" } });
  } finally { lock.releaseLock(); }
}
/** POST mode=shop_delivery_list: ADMIN/SHOP_MANAGER 배송 목록. */
function handleShopDeliveryList(e) {
  const p = (e && e.parameter) || {}, auth = requireShopManagerToken_(p.user_id, p.admin_token);if (!auth.ok) return shopJson_(auth);
  const users = moaruSpreadsheetRetry_(function () { return moaruRegisteredUserMap_(); }), catalog = readShopCatalog_(), rows = [];
  readShopInventorySheetItems_().forEach(function (raw) {
    const item = hydrateShopInventoryItem_(raw, catalog), status = normalizeDeliveryStatus_(item);
    if (status === "requested" || status === "shipping") rows.push(publicDeliveryItem_(item, users));
  });
  rows.sort(function (a,b) { return Number(a.requestedAt || 0) - Number(b.requestedAt || 0); });
  return shopJson_({ ok: true, role: auth.role, deliveries: rows });
}
function updateShopDeliveryByManager_(e, nextStatus) {
  const p = (e && e.parameter) || {}, auth = requireShopManagerToken_(p.user_id, p.admin_token);if (!auth.ok) return shopJson_(auth);
  const ownerId = String(p.owner_id || p.target_user_id || "").trim(), inventoryId = String(p.inventory_id || "").trim();
  if (!ownerId || !inventoryId) return shopJson_({ ok: false, error: "INVALID_DELIVERY_TARGET" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    const item = readShopInventoryFresh_(ownerId).filter(function (row) { return row.id === inventoryId; })[0];if (!item) return shopJson_({ ok: false, error: "ITEM_NOT_AVAILABLE" });
    const current = normalizeDeliveryStatus_(item), now = Date.now();
    if (current === nextStatus) return shopJson_({ ok: true, alreadyApplied: true, item: item, deliveryStatus: current });
    if (nextStatus === "shipping" && current !== "requested") return shopJson_({ ok: false, error: "DELIVERY_STATE_INVALID", status: current });
    if ((nextStatus === "completed" || nextStatus === "cancelled") && current !== "requested" && current !== "shipping") return shopJson_({ ok: false, error: "DELIVERY_STATE_INVALID", status: current });
    item.deliveryStatus = nextStatus;item.deliveryHandledBy = String(p.user_id || "");
    if (nextStatus === "shipping") item.deliveryShippingAt = now;
    if (nextStatus === "completed") { item.deliveryCompletedAt = now;item.usedAt = now; }
    if (nextStatus === "cancelled") { item.deliveryCancelledAt = now;delete item.usedAt; }
    const saved = writeShopInventoryItem_(ownerId, item);
    enqueueMoaruCommand_(ownerId, nextStatus === "completed" ? "SHOP_DELIVERY_COMPLETED" : nextStatus === "cancelled" ? "SHOP_DELIVERY_CANCELLED" : "SHOP_DELIVERY_SHIPPING", { itemId: saved.id, name: saved.name, deliveryStatus: nextStatus }, p.user_id);
    return shopJson_({ ok: true, item: saved, deliveryStatus: nextStatus });
  } finally { lock.releaseLock(); }
}
function handleShopDeliveryShipping(e) { return updateShopDeliveryByManager_(e, "shipping"); }
function handleShopDeliveryComplete(e) { return updateShopDeliveryByManager_(e, "completed"); }
function handleShopDeliveryCancel(e) { return updateShopDeliveryByManager_(e, "cancelled"); }

/** POST mode=shop_use: 구버전 클라이언트 호환용. 이제 실제 사용 대신 배송 요청으로 처리합니다. */
function handleShopUse(e) {
  return handleShopRequestDelivery(e);
}

function moaruCommandKey_(userId) { return MOARU_COMMAND_PROPERTY_PREFIX + moaruSafeKey_(userId); }
function pruneMoaruCommands_(commands, now) {
  const current = Number(now) || Date.now();
  return (Array.isArray(commands) ? commands : []).filter(function (command) {
    if (!command || typeof command !== "object" || !command.id) return false;
    const createdAt = Number(command.createdAt) || 0;
    // createdAt이 없는 구버전 명령은 임의 삭제하지 않습니다.
    return !createdAt || current - createdAt <= MOARU_COMMAND_TTL_MS;
  }).slice(-MOARU_COMMAND_LIMIT);
}
function writeMoaruCommands_(userId, commands) {
  const properties = PropertiesService.getScriptProperties(), key = moaruCommandKey_(userId), queue = pruneMoaruCommands_(commands);
  if (!queue.length) { properties.deleteProperty(key);return []; }
  properties.setProperty(key, JSON.stringify(queue));
  return queue;
}
function readMoaruCommands_(userId) {
  const properties = PropertiesService.getScriptProperties(), key = moaruCommandKey_(userId), raw = properties.getProperty(key);
  if (!raw) return [];
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (error) { properties.deleteProperty(key);return []; }
  const queue = pruneMoaruCommands_(parsed);
  if (!queue.length) { properties.deleteProperty(key);return []; }
  if (!Array.isArray(parsed) || queue.length !== parsed.length || JSON.stringify(queue) !== raw) properties.setProperty(key, JSON.stringify(queue));
  return queue;
}

/**
 * 기존 Script Properties에 쌓인 빈 MOARU_COMMANDS_* 항목을 한 번 정리할 때 직접 실행합니다.
 * - 빈 배열/깨진 값: 삭제
 * - createdAt이 있고 30일 지난 명령: 제거
 * - 아직 전달되지 않은 정상 명령: 보존
 */
function cleanupMoaruCommandPropertiesOnce() {
  const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), now = Date.now();
  let scanned = 0, deleted = 0, compacted = 0, kept = 0;
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(MOARU_COMMAND_PROPERTY_PREFIX) !== 0) return;
    scanned++;
    let parsed;
    try { parsed = JSON.parse(all[key] || "[]"); }
    catch (error) { properties.deleteProperty(key);deleted++;return; }
    const queue = pruneMoaruCommands_(parsed, now);
    if (!queue.length) { properties.deleteProperty(key);deleted++;return; }
    const next = JSON.stringify(queue);
    if (next !== all[key]) { properties.setProperty(key, next);compacted++; }
    kept++;
  });
  const result = { scanned: scanned, deleted: deleted, compacted: compacted, kept: kept };
  console.log("MOARU_COMMAND_PROPERTIES_CLEANUP", JSON.stringify(result));
  return result;
}

/**
 * 쇼핑 Script Properties 정리.
 * - 실제 보유/배송요청/배송중/취소 상품은 유지
 * - 배송완료 후 7일 지난 보관함 항목만 삭제
 * - 48시간 지난 선물/배송 요청 영수증 삭제
 * - 실제 보관함 항목이 이미 없는 구매 소유권 포인터 삭제
 */
function cleanupMoaruShopProperties_() {
  const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), now = Date.now();
  const completedCutoff = now - MOARU_SHOP_COMPLETED_TTL_MS, receiptCutoff = now - MOARU_SHOP_RECEIPT_TTL_MS;
  const removed = { inventoryRows: 0, giftReceipts: 0, deliveryReceipts: 0, legacyInventory: 0, purchaseOwners: 0 };

  // 시트의 배송완료 상품은 사용자 화면 보존기간과 맞춰 7일 뒤 실제 행을 삭제합니다.
  const sheet = getOrCreateShopInventorySheet_(), lastRow = sheet.getLastRow(), deleteRows = [], affectedOwners = {};
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, MOARU_SHOP_INVENTORY_HEADERS.length).getValues().forEach(function (row, index) {
      const item = shopInventoryRowToItem_(row), status = normalizeDeliveryStatus_(item), completedAt = Number(item.deliveryCompletedAt || item.usedAt) || 0;
      if (status === "completed" && completedAt > 0 && completedAt <= completedCutoff) { deleteRows.push(index + 2);affectedOwners[item.ownerId] = true; }
    });
    deleteRows.sort(function (a,b) { return b-a; }).forEach(function (row) { sheet.deleteRow(row);removed.inventoryRows++; });
    Object.keys(affectedOwners).forEach(clearShopInventoryCache_);
  }

  // 선물/배송 재시도 영수증은 48시간 뒤 제거합니다.
  Object.keys(all).forEach(function (key) {
    let bucket = "", timestamp = 0;
    if (key.indexOf(MOARU_SHOP_GIFT_REQUEST_PREFIX) === 0) bucket = "giftReceipts";
    else if (key.indexOf(MOARU_SHOP_DELIVERY_REQUEST_PREFIX) === 0) bucket = "deliveryReceipts";
    else return;
    try { const value = JSON.parse(all[key] || "{}");timestamp = Number(value.createdAt || value.requestedAt) || 0; } catch (error) {}
    if (timestamp > receiptCutoff) return;
    properties.deleteProperty(key);removed[bucket]++;
  });

  // 마이그레이션이 완료된 구형 상품별 Property와 구매 포인터는 더 이상 유지하지 않습니다.
  const currentIds = {};
  readShopInventorySheetItems_().forEach(function (item) { currentIds[item.id] = item.ownerId; });
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(SHOP_INVENTORY_PROPERTY_PREFIX) === 0) {
      try { const item = JSON.parse(all[key] || "null");if (item && item.id && currentIds[item.id] === String(item.ownerId || "")) { properties.deleteProperty(key);removed.legacyInventory++; } } catch (error) {}
    } else if (key.indexOf(SHOP_PURCHASE_OWNER_PROPERTY_PREFIX) === 0) {
      properties.deleteProperty(key);removed.purchaseOwners++;
    }
  });
  return removed;
}

/**
 * 기존에 쌓인 빈 명령 큐 + 오래된 쇼핑 속성을 한 번에 안전 정리합니다.
 * Apps Script 편집기에서 필요할 때 직접 실행해도 됩니다.
 */
function cleanupMoaruPropertiesOnce() {
  const migration = migrateLegacyShopInventoryToSheetOnce();
  const commandResult = cleanupMoaruCommandPropertiesOnce();
  const shopResult = cleanupMoaruShopProperties_();
  return { migration: migration, commands: commandResult, shop: shopResult };
}

function moaruSpreadsheetRetry_(action) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return action(); }
    catch (error) {
      lastError = error;
      const message = String(error && error.message || error || "");
      if (!/(?:Spreadsheet service|Service Spreadsheets|스프레드시트 서비스|문서에 액세스)/i.test(message)) throw error;
      if (attempt < 2 && Utilities && typeof Utilities.sleep === "function") Utilities.sleep(250 * (attempt + 1));
    }
  }
  console.error("MOARU_SPREADSHEET_RETRY_EXHAUSTED", lastError);
  throw new Error("COIN_SHEET_TEMPORARY_ERROR");
}
function moaruCoinChangeGuarded_(userId, action, amount) {
  const before = moaruSpreadsheetRetry_(function () { return getRewardUserData_(userId); }), beforeCoin = parseInt(before && before.coin, 10) || 0, delta = Math.abs(parseInt(amount, 10) || 0), expectedCoin = action === "add" ? beforeCoin + delta : beforeCoin - delta;
  try { return processCoinChangeUnlocked_(userId, action, amount); }
  catch (error) {
    const message = String(error && error.message || error || "");
    if (/(?:Spreadsheet service|Service Spreadsheets|스프레드시트 서비스|문서에 액세스)/i.test(message)) {
      const after = moaruSpreadsheetRetry_(function () { return getRewardUserData_(userId); }), afterCoin = parseInt(after && after.coin, 10) || 0;
      if (expectedCoin >= 0 && afterCoin === expectedCoin) return { success: true, newCoin: afterCoin, recovered: true };
      throw new Error("COIN_SHEET_TEMPORARY_ERROR");
    }
    throw error;
  }
}
function moaruAdminCoinChangeGuarded_(userId, signedAmount) {
  // handleAdminCoinReward가 이미 ScriptLock을 보유한 상태에서 호출됩니다. 중첩 lock 금지.
  const delta = parseInt(signedAmount, 10) || 0;
  if (!delta) return { success: false, error: "INVALID_COIN_AMOUNT" };
  const sheet = getSheet_(REWARD_SHEET), lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: false, error: "USER_NOT_FOUND" };
  const values = sheet.getRange(2, 1, lastRow - 1, Math.max(COL_REWARD_COIN, COL_REWARD_USER_ID)).getValues();
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][COL_REWARD_USER_ID - 1] || "").trim() !== String(userId || "").trim()) continue;
    const beforeCoin = parseInt(values[i][COL_REWARD_COIN - 1], 10) || 0;
    const newCoin = beforeCoin + delta;
    sheet.getRange(i + 2, COL_REWARD_COIN).setValue(newCoin);
    return { success: true, newCoin: newCoin, beforeCoin: beforeCoin };
  }
  return { success: false, error: "USER_NOT_FOUND" };
}

function moaruRewardCoinMap_() {
  return moaruSpreadsheetRetry_(function () {
    const sheet = getSheet_(REWARD_SHEET), lastRow = sheet.getLastRow(), result = {};
    if (lastRow < 2) return result;
    sheet.getRange(2, 1, lastRow - 1, 3).getValues().forEach(function (row) {
      const userId = String(row[COL_REWARD_USER_ID - 1] || "").trim();
      if (userId) result[userId] = parseInt(row[COL_REWARD_COIN - 1], 10) || 0;
    });
    return result;
  });
}
function enqueueMoaruCommand_(userId, type, payload, issuedBy, commandId) {
  const queue = readMoaruCommands_(userId);
  const id = String(commandId || Utilities.getUuid());
  if (queue.some(function (command) { return String(command && command.id) === id; })) return id;
  queue.push({ id: id, type: type, payload: payload || {}, createdAt: Date.now(), issuedBy: String(issuedBy || "admin") });
  writeMoaruCommands_(userId, queue);
  return id;
}

/** POST mode=admin_dispatch: 관리자 토큰을 서버에서 확인한 뒤 사용자 큐에 기록 */
function handleAdminDispatch(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  let targets = [], payload = {};
  try { targets = JSON.parse(p.targets_json || "[]");payload = JSON.parse(p.payload_json || "{}"); } catch (error) { return shopJson_({ ok: false, error: "INVALID_COMMAND_DATA" }); }
  const registeredUsers = moaruSpreadsheetRetry_(function () { return moaruRegisteredUserMap_(); });
  targets = targets.map(String).filter(function (id, index, list) { return id && list.indexOf(id) === index && requireKnownMoaruUser_(id, registeredUsers); }).slice(0, 200);
  const type = String(p.command_type || "NOTICE").trim().slice(0, 20), requestId = String(p.request_id || "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 100);if (!targets.length) return shopJson_({ ok: false, error: "NO_TARGETS" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    targets.forEach(function (target, index) { enqueueMoaruCommand_(target, type, payload, p.user_id, requestId ? "admin-" + requestId + "-" + index : ""); });
    return shopJson_({ ok: true, count: targets.length });
  } finally { lock.releaseLock(); }
}

/** POST mode=admin_user_balances: 관리자 대상 명단에 표시할 현재 코인 잔액 */
function handleAdminUserBalances(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token);
  if (!auth.ok) return shopJson_(auth);
  const users = moaruSpreadsheetRetry_(function () { return moaruRegisteredUserMap_(); }), coins = moaruRewardCoinMap_(), rows = Object.keys(users).map(function (userId) {
    return { user_id: userId, nickname: users[userId], coin: coins[userId] || 0 };
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
  const requestId = String(p.request_id || "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 100), registeredUsers = moaruSpreadsheetRetry_(function () { return moaruRegisteredUserMap_(); }), rewardCoins = moaruRewardCoinMap_();
  targets = targets.map(String).filter(function (id, index, list) { return id && list.indexOf(id) === index && registeredUsers[id] && Object.prototype.hasOwnProperty.call(rewardCoins, id); }).slice(0, 200);
  if (!targets.length) return shopJson_({ ok: false, error: "NO_TARGETS" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    const receipts = PropertiesService.getScriptProperties(), receiptKey = requestId ? MOARU_ADMIN_COIN_REQUEST_PREFIX + requestId : "";let receipt = null;
    if (receiptKey) { try { receipt = JSON.parse(receipts.getProperty(receiptKey) || "null"); } catch (error) { receipt = null; } }
    if (receipt && (Number(receipt.amount) !== amount || JSON.stringify(receipt.targets || []) !== JSON.stringify(targets))) return shopJson_({ ok: false, error: "COIN_REQUEST_CONFLICT" });
    if (receipt && receipt.status === "done") return shopJson_(receipt.result);
    if (!receipt) { receipt = { status: "pending", amount: amount, targets: targets, targetStates: {}, createdAt: Date.now() };if (receiptKey) receipts.setProperty(receiptKey, JSON.stringify(receipt)); }
    const rewarded = [], failed = [], states = receipt.targetStates || {};
    targets.forEach(function (target, index) {
      try {
        let state = states[target];
        if (state && state.status === "done") { rewarded.push({ user_id: target, newCoin: Number(state.newCoin) || 0 });return; }
        if (!state) { const before = Number(rewardCoins[target]) || 0;state = states[target] = { status: "pending", beforeCoin: before, expectedCoin: amount > 0 ? before + amount : before - Math.abs(amount) };receipt.targetStates = states;if (receiptKey) receipts.setProperty(receiptKey, JSON.stringify(receipt)); }
        const current = moaruSpreadsheetRetry_(function () { return getRewardUserData_(target); }), currentCoin = parseInt(current && current.coin, 10) || 0;let result;
        if (currentCoin === Number(state.expectedCoin)) result = { success: true, newCoin: currentCoin, recovered: true };
        else if (currentCoin === Number(state.beforeCoin)) result = moaruAdminCoinChangeGuarded_(target, amount);
        else throw new Error("COIN_REWARD_STATE_CONFLICT");
        if (result && result.success) {
          const newCoin = Number(result.newCoin) || 0;
          rewarded.push({ user_id: target, newCoin: newCoin });
          state.status = "done";state.newCoin = newCoin;if (receiptKey) receipts.setProperty(receiptKey, JSON.stringify(receipt));
          enqueueMoaruCommand_(target, "COIN_REWARD", { amount: amount, newCoin: newCoin, reason: String(p.reason || "관리자 보상").trim().slice(0, 80) }, p.user_id, requestId ? "coin-" + requestId + "-" + index : "");
        } else failed.push({ user_id: target, error: "COIN_CHANGE_FAILED" });
      } catch (error) { failed.push({ user_id: target, error: String(error && error.message || error) }); }
    });
    if (!rewarded.length) return shopJson_({ ok: false, error: failed.some(function (row) { return row.error === "COIN_SHEET_TEMPORARY_ERROR"; }) ? "COIN_SHEET_TEMPORARY_ERROR" : "COIN_REWARD_FAILED", failed: failed });
    const result = { ok: true, count: rewarded.length, amount: amount, rewarded: rewarded, failed: failed, reason: String(p.reason || "관리자 보상").trim().slice(0, 80) };if (receiptKey && !failed.length) receipts.setProperty(receiptKey, JSON.stringify({ status: "done", amount: amount, targets: targets, createdAt: receipt.createdAt, result: result }));return shopJson_(result);
  } finally { lock.releaseLock(); }
}

/** POST mode=user_commands: 본인 큐 조회 및 처리 완료 항목 삭제 */
function handleUserCommands(e) {
  const p = (e && e.parameter) || {}, userId = requireKnownMoaruUser_(p.user_id);if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  const ack = String(p.ack_ids || "").split(",").filter(Boolean);
  if (!ack.length) return shopJson_({ ok: true, commands: readMoaruCommands_(userId) });
  const lock = LockService.getScriptLock();if (!lock.tryLock(2500)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    const queue = readMoaruCommands_(userId), remaining = queue.filter(function (command) { return ack.indexOf(String(command.id)) < 0; });
    if (remaining.length !== queue.length) writeMoaruCommands_(userId, remaining);
    return shopJson_({ ok: true, commands: remaining });
  } finally { lock.releaseLock(); }
}

function moaruTaskStore_() { return PropertiesService.getDocumentProperties(); }
function moaruTaskPropertyKey_(taskId) { return MOARU_TASK_PROPERTY_PREFIX + moaruSafeKey_(taskId); }
function normalizeMoaruTaskState_(task) {
  if (!task || typeof task !== "object") return task;
  if (task.status === "open" && (String(task.answer || "").trim() || String(task.imageData || "").trim())) {
    task.status = "submitted";
    task.submittedAt = Number(task.submittedAt) || Number(task.updatedAt) || Date.now();
  }
  return task;
}
function readMoaruTasks_() {
  const values = moaruTaskStore_().getProperties(), tasks = [];
  Object.keys(values).forEach(function (key) {
    if (key.indexOf(MOARU_TASK_PROPERTY_PREFIX) !== 0) return;
    try { const task = normalizeMoaruTaskState_(JSON.parse(values[key]));if (task && task.id && task.userId) tasks.push(task); }
    catch (error) { console.error("INVALID_MOARU_TASK", key, error); }
  });
  return tasks;
}
function readMoaruTask_(taskId) {
  try { return normalizeMoaruTaskState_(JSON.parse(moaruTaskStore_().getProperty(moaruTaskPropertyKey_(taskId)) || "null")); }
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
function publicMoaruTask_(task) { const value = Object.assign({}, task);delete value.rewardPending;return value; }
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
function cleanupMoaruTaskAssignReceipts_() {
  const cutoff = Date.now() - MOARU_TASK_COMPLETED_TTL_MS, receipts = PropertiesService.getScriptProperties(), values = receipts.getProperties(), prefixes = [MOARU_TASK_ASSIGN_REQUEST_PREFIX, MOARU_ADMIN_COIN_REQUEST_PREFIX, MOARU_SHOP_GIFT_REQUEST_PREFIX];let removed = 0;
  Object.keys(values).filter(function (key) { return prefixes.some(function (prefix) { return key.indexOf(prefix) === 0; }); }).forEach(function (key) { try { const value = JSON.parse(values[key] || "{}");if (Number(value.createdAt) > 0 && Number(value.createdAt) > cutoff) return; } catch (error) {}receipts.deleteProperty(key);removed++; });return removed;
}

/** 시간 기반 트리거 또는 과제 API에서 호출됩니다. 완료 48시간 뒤 서버 원본만 삭제하고 백업 시트는 유지합니다. */
function cleanupCompletedMoaruTasks() {
  const lock = LockService.getScriptLock();if (!lock.tryLock(5000)) return 0;
  try {
    const removed = cleanupCompletedMoaruTasks_();
    cleanupMoaruTaskAssignReceipts_();
    cleanupMoaruCommandPropertiesOnce();
    cleanupMoaruShopProperties_();
    return removed;
  } finally { lock.releaseLock(); }
}
function setupMoaruTaskCleanupTrigger() {
  ScriptApp.getProjectTriggers().filter(function (trigger) { return trigger.getHandlerFunction() === "cleanupCompletedMoaruTasks"; }).forEach(function (trigger) { ScriptApp.deleteTrigger(trigger); });
  ScriptApp.newTrigger("cleanupCompletedMoaruTasks").timeBased().everyDays(1).atHour(3).create();
  return "모아루 완료 과제 정리 트리거 설정 완료";
}

function moaruRegisteredUserMap_() {
  const cache = CacheService.getScriptCache(), cacheKey = "moaru-registered-users-v2", cached = cache.get(cacheKey);
  if (cached) { try { const parsed = JSON.parse(cached);if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed; } catch (error) {} }
  const sheet = getSheet_(LOGIN_SHEET), lastRow = sheet.getLastRow(), result = {};
  if (lastRow < 2) return result;
  sheet.getRange(2, 1, lastRow - 1, 4).getValues().forEach(function (row) {
    const id = String(row[0] || "").trim(), username = String(row[1] || "").trim(), nickname = String(row[3] || row[1] || id).trim();
    if (!id || isMoaruGuestIdentity_(id, username, nickname)) return;
    result[id] = nickname.slice(0, 30);
  });
  try { cache.put(cacheKey, JSON.stringify(result), 60); } catch (error) {}
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
  const users = moaruSpreadsheetRetry_(function () { return moaruRegisteredUserMap_(); }), rewardCoins = moaruRewardCoinMap_(), targets = requested.map(String).filter(function (id, index, list) { return id && list.indexOf(id) === index && users[id] && Object.prototype.hasOwnProperty.call(rewardCoins, id); }).slice(0, 200);
  if (!targets.length) return shopJson_({ ok: false, error: "NO_TARGETS" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    cleanupCompletedMoaruTasks_();
    const requestId = String(p.request_id || "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 100), receiptKey = requestId ? MOARU_TASK_ASSIGN_REQUEST_PREFIX + requestId : "", receipts = PropertiesService.getScriptProperties();let receipt = null;
    if (receiptKey) { try { receipt = JSON.parse(receipts.getProperty(receiptKey) || "null"); } catch (error) { receipt = null; } }
    if (receipt && receipt.status === "done") return shopJson_(receipt.result);
    const now = Number(receipt && receipt.createdAt) || Date.now(), tasks = targets.map(function (target, index) { return { id: requestId ? "task-" + requestId + "-" + index : "task-" + Utilities.getUuid(), userId: target, nickname: users[target], title: title, description: descriptionRaw.trim(), rewardCoin: rewardCoin, status: "open", createdAt: now, issuedBy: String(p.user_id), updatedAt: now }; }), ids = tasks.map(function (task) { return task.id; });
    if (receiptKey && !receipt) { receipt = { status: "pending", createdAt: now };receipts.setProperty(receiptKey, JSON.stringify(receipt)); }
    const missingTasks = tasks.filter(function (task) { return !readMoaruTask_(task.id); });if (missingTasks.length) writeMoaruTasks_(missingTasks);
    missingTasks.forEach(function (task) { backupMoaruTaskEvent_("ASSIGNED", task, p.user_id); });
    tasks.forEach(function (task, index) { enqueueMoaruCommand_(task.userId, "TASK_ASSIGNED", { taskId: task.id, title: title, rewardCoin: rewardCoin }, p.user_id, requestId ? "task-assign-" + requestId + "-" + index : ""); });
    const result = { ok: true, count: tasks.length, task_ids: ids };if (receiptKey) receipts.setProperty(receiptKey, JSON.stringify({ status: "done", createdAt: now, result: result }));return shopJson_(result);
  } finally { lock.releaseLock(); }
}

/** POST mode=user_task_list */
function handleUserTaskList(e) {
  const p = (e && e.parameter) || {}, userId = requireKnownMoaruUser_(p.user_id);
  if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
  cleanupCompletedMoaruTasks_();
  const tasks = readMoaruTasks_().filter(function (task) { return task.userId === userId; }).sort(function (a, b) { return b.createdAt - a.createdAt; }).slice(0, 100).map(publicMoaruTask_);
  return shopJson_({ ok: true, tasks: tasks });
}

/** POST mode=user_task_submit */
function handleUserTaskSubmit(e) {
  const p = (e && e.parameter) || {}, userId = requireKnownMoaruUser_(p.user_id), taskId = String(p.task_id || "").trim();
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
    const cleanAnswer = answer.trim();if (task.status === "submitted" && String(task.answer || "") === cleanAnswer && String(task.imageData || "") === imageData) return shopJson_({ ok: true, task: publicMoaruTask_(task), alreadySubmitted: true });
    const now = Date.now();task.answer = cleanAnswer;task.imageData = imageData;task.status = "submitted";task.feedback = "";task.submittedAt = now;task.updatedAt = now;writeMoaruTask_(task);backupMoaruTaskEvent_("SUBMITTED", task, userId);
    if (task.issuedBy) enqueueMoaruCommand_(task.issuedBy, "TASK_SUBMITTED", { taskId: task.id, userId: task.userId, nickname: task.nickname, title: task.title, submittedAt: now }, userId);
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

/** 관리자 과제 ID 목록을 정규화합니다. */
function parseMoaruTaskIds_(raw) {
  let values = [];
  try { values = JSON.parse(raw || "[]"); } catch (error) { return null; }
  if (!Array.isArray(values)) return null;
  return values.map(function (value) { return String(value || "").trim(); }).filter(function (id, index, list) { return id && list.indexOf(id) === index; }).slice(0, 200);
}

/** 단건/일괄 검토가 함께 사용하는 잠금 내부 처리입니다. */
function reviewMoaruTaskUnlocked_(taskId, action, feedback, actor) {
  const task = readMoaruTask_(taskId);
  if (!task) return { ok: false, task_id: taskId, error: "TASK_NOT_FOUND" };
  if (task.status !== "submitted" && !(action === "complete" && task.status === "completed")) return { ok: false, task_id: taskId, user_id: task.userId, error: "TASK_NOT_SUBMITTED" };
  if (task.status === "completed") return { ok: true, task_id: task.id, user_id: task.userId, task: publicMoaruTask_(task), alreadyCompleted: true };
  const now = Date.now();task.reviewedAt = now;task.updatedAt = now;task.feedback = feedback;
  if (action === "retry") {
    if (task.rewardPending) return { ok: false, task_id: task.id, user_id: task.userId, error: "COIN_REWARD_PENDING" };
    task.status = "retry";writeMoaruTask_(task);backupMoaruTaskEvent_("RETRY", task, actor);
    enqueueMoaruCommand_(task.userId, "TASK_RETRY", { taskId: task.id, title: task.title, feedback: feedback }, actor);
    return { ok: true, task_id: task.id, user_id: task.userId, task: publicMoaruTask_(task) };
  }
  if (!task.rewardPending) {
    const before = moaruSpreadsheetRetry_(function () { return getRewardUserData_(task.userId); }), beforeCoin = parseInt(before && before.coin, 10) || 0;
    task.rewardPending = { beforeCoin: beforeCoin, expectedCoin: beforeCoin + task.rewardCoin, amount: task.rewardCoin, createdAt: now };writeMoaruTask_(task);
  }
  const currentReward = moaruSpreadsheetRetry_(function () { return getRewardUserData_(task.userId); }), currentCoin = parseInt(currentReward && currentReward.coin, 10) || 0, pending = task.rewardPending;
  let result;
  if (currentCoin === Number(pending.expectedCoin)) result = { success: true, newCoin: currentCoin, recovered: true };
  else if (currentCoin === Number(pending.beforeCoin)) result = moaruCoinChangeGuarded_(task.userId, "add", task.rewardCoin);
  else return { ok: false, task_id: task.id, user_id: task.userId, error: "COIN_REWARD_STATE_CONFLICT" };
  if (!result || !result.success) return { ok: false, task_id: task.id, user_id: task.userId, error: "COIN_REWARD_FAILED" };
  task.status = "completed";task.completedAt = now;task.rewardedAt = now;task.newCoin = Number(result.newCoin) || 0;delete task.rewardPending;writeMoaruTask_(task);backupMoaruTaskEvent_("COMPLETED", task, actor);
  enqueueMoaruCommand_(task.userId, "TASK_COMPLETED", { taskId: task.id, title: task.title, amount: task.rewardCoin, newCoin: task.newCoin, feedback: feedback }, actor);
  return { ok: true, task_id: task.id, user_id: task.userId, task: publicMoaruTask_(task) };
}

/** POST mode=admin_task_review */
function handleAdminTaskReview(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token), taskId = String(p.task_id || "").trim(), action = String(p.action || "").trim(), feedback = String(p.feedback || "").trim();
  if (!auth.ok) return shopJson_(auth);
  if (["complete", "retry"].indexOf(action) < 0) return shopJson_({ ok: false, error: "INVALID_TASK_REVIEW" });
  if (feedback.length > 100) return shopJson_({ ok: false, error: "TASK_FEEDBACK_TOO_LONG" });
  if (action === "retry" && !feedback) return shopJson_({ ok: false, error: "TASK_FEEDBACK_REQUIRED" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(4000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try { cleanupCompletedMoaruTasks_();return shopJson_(reviewMoaruTaskUnlocked_(taskId, action, feedback, p.user_id)); }
  finally { lock.releaseLock(); }
}

/** POST mode=admin_task_bulk_review - 선택 과제를 같은 액션/피드백으로 일괄 검토합니다. */
function handleAdminTaskBulkReview(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token), action = String(p.action || "complete").trim(), feedback = String(p.feedback || "").trim(), taskIds = parseMoaruTaskIds_(p.task_ids_json);
  if (!auth.ok) return shopJson_(auth);
  if (!taskIds) return shopJson_({ ok: false, error: "INVALID_COMMAND_DATA" });
  if (!taskIds.length) return shopJson_({ ok: false, error: "NO_TASKS_SELECTED" });
  if (["complete", "retry"].indexOf(action) < 0) return shopJson_({ ok: false, error: "INVALID_TASK_REVIEW" });
  if (feedback.length > 100) return shopJson_({ ok: false, error: "TASK_FEEDBACK_TOO_LONG" });
  if (action === "retry" && !feedback) return shopJson_({ ok: false, error: "TASK_FEEDBACK_REQUIRED" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(5000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    cleanupCompletedMoaruTasks_();
    const results = taskIds.map(function (taskId) { return reviewMoaruTaskUnlocked_(taskId, action, feedback, p.user_id); }), succeeded = results.filter(function (row) { return row.ok; }).length;
    return shopJson_({ ok: true, count: succeeded, failed: results.length - succeeded, results: results });
  } finally { lock.releaseLock(); }
}

/** POST mode=admin_task_bulk_delete - 코인을 지급/차감하지 않고 선택 과제를 삭제합니다. */
function handleAdminTaskBulkDelete(e) {
  const p = (e && e.parameter) || {}, auth = requireShopAdminToken_(p.user_id, p.admin_token), taskIds = parseMoaruTaskIds_(p.task_ids_json);
  if (!auth.ok) return shopJson_(auth);
  if (!taskIds) return shopJson_({ ok: false, error: "INVALID_COMMAND_DATA" });
  if (!taskIds.length) return shopJson_({ ok: false, error: "NO_TASKS_SELECTED" });
  const lock = LockService.getScriptLock();if (!lock.tryLock(5000)) return shopJson_({ ok: false, error: "SHOP_BUSY" });
  try {
    cleanupCompletedMoaruTasks_();
    const store = moaruTaskStore_(), results = taskIds.map(function (taskId) {
      const task = readMoaruTask_(taskId);
      if (!task) return { ok: false, task_id: taskId, error: "TASK_NOT_FOUND" };
      if (task.rewardPending) return { ok: false, task_id: task.id, user_id: task.userId, error: "TASK_DELETE_CONFLICT" };
      const snapshot = Object.assign({}, task, { status: "deleted", updatedAt: Date.now() });
      backupMoaruTaskEvent_("DELETED", snapshot, p.user_id);
      store.deleteProperty(moaruTaskPropertyKey_(task.id));
      enqueueMoaruCommand_(task.userId, "TASK_DELETED", { taskId: task.id, title: task.title }, p.user_id);
      return { ok: true, task_id: task.id, user_id: task.userId };
    }), succeeded = results.filter(function (row) { return row.ok; }).length;
    return shopJson_({ ok: true, count: succeeded, failed: results.length - succeeded, results: results });
  } finally { lock.releaseLock(); }
}

/** POST mode=shop_purchase */
function handleShopPurchase(e) {
  const p = (e && e.parameter) || {};
  const userId = requireRegisteredShopUser_(p.user_id);
  const productId = String(p.product_id || "").trim();
  const purchaseKey = String(p.purchase_key || "").trim();
  const clientPrice = parseInt(p.price, 10);
  const expectedName = String(p.expected_name || "").trim().slice(0, 60);
  const expectedDescription = String(p.expected_description || "").trim().slice(0, 160);
  const expectedUpdatedAt = Number(p.expected_updated_at) || 0;

  if (!userId || !productId || !purchaseKey || isNaN(clientPrice)) {
    return shopJson_({ ok: false, error: "MISSING_PARAM" });
  }
  if (!userId) return shopJson_({ ok: false, error: "LOGIN_REQUIRED" });
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
      const currentProduct = readShopCatalog_()[productId] || {}, duplicateProduct = normalizeShopProduct_(Object.assign({}, currentProduct, { id: productId, name: duplicate.productName || currentProduct.name || "상품", price: duplicate.price || currentProduct.price || 1 }));
      const duplicateItem = createPurchasedInventory_(userId, duplicateProduct, purchaseKey);
      clearPendingShopPurchase_(purchaseKey);
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

    const result = moaruCoinChangeGuarded_(userId, "remove", product.price);
    if (!result || !result.success) return shopJson_({ ok: false, error: "COIN_DEDUCTION_FAILED" });

    try {
      logSheet.appendRow([
        purchaseKey, userId, product.id, product.name, product.price,
        beforeCoin, result.newCoin, new Date()
      ]);
    } catch (logError) {
      try { moaruCoinChangeGuarded_(userId, "add", product.price); }
      catch (rollbackError) { console.error("SHOP_ROLLBACK_FAILED", rollbackError); }
      return shopJson_({ ok: false, error: "PURCHASE_LOG_FAILED" });
    }

    let inventoryItem = null, inventoryPending = false;
    try {
      inventoryItem = createPurchasedInventory_(userId, product, purchaseKey);
      clearPendingShopPurchase_(purchaseKey);
    } catch (inventoryError) {
      /*
       * 여기까지 왔으면 코인 차감 + 구매로그는 이미 성공했습니다.
       * 이 상태를 구매 실패로 응답하면 사용자가 새 purchase_key로 다시 결제할 수 있으므로
       * 구매는 성공으로 확정하고 서버 보관함만 재시도 큐에 남깁니다.
       */
      inventoryPending = true;
      try { rememberPendingShopPurchase_(userId, product, purchaseKey); }
      catch (pendingError) { console.error("SHOP_PENDING_PURCHASE_SAVE_FAILED", pendingError); }
      console.error("SHOP_INVENTORY_WRITE_DEFERRED", purchaseKey, inventoryError);
    }
    return shopJson_({
      ok: true,
      applied: true,
      product_id: product.id,
      product_name: product.name,
      price: product.price,
      newCoin: result.newCoin,
      item: inventoryItem,
      inventory_pending: inventoryPending
    });
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    return shopJson_({
      ok: false,
      error: message === "COIN_SHEET_TEMPORARY_ERROR" ? message : "SHOP_PURCHASE_FAILED",
      message: message
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
