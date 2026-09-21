/*************************************************
 * 모아루 Firebase 경제 런타임 ↔ Google Sheets 동기화
 *
 * 역할
 * - Firebase: 현재 코인/보관함/재고/중복방지의 실시간 운영 상태
 * - Sheets: 로그인/권한/관리/장기 거래기록/백업
 *
 * 중요
 * - 기존 대화방/잠금방 Firebase 경로를 건드리지 않습니다.
 * - 보상탭 사용자 행 삭제는 경제 사용자 삭제로 해석합니다.
 *************************************************/

const MOARU_ECONOMY_FIREBASE_DB_URL = "https://web-ghost-c447b-default-rtdb.firebaseio.com";
const MOARU_ECONOMY_FIREBASE_ROOT = "moaru/v3/economyRuntime";
const MOARU_ECONOMY_ACTIVE_SNAPSHOT_PROP = "MOARU_ECONOMY_ACTIVE_USERS_V1";
const MOARU_ECONOMY_REV_PREFIX = "MOARU_ECONOMY_REV_";
const MOARU_ECONOMY_STOCK_REV_PREFIX = "MOARU_ECONOMY_STOCK_REV_";
const MOARU_ECONOMY_LOG_SHEET = "모아루_경제기록";
const MOARU_ECONOMY_LOG_HEADERS = ["txn_id","user_id","type","amount","balance","reason","created_at"];

function moaruEconomyFirebaseKey_(value) {
  return Utilities.base64EncodeWebSafe(String(value || ""), Utilities.Charset.UTF_8).replace(/=+$/g, "");
}
function moaruEconomyFirebasePath_(path) {
  return MOARU_ECONOMY_FIREBASE_DB_URL.replace(/\/$/, "") + "/" + String(path || "").replace(/^\/+|\/+$/g, "") + ".json";
}
function moaruEconomyFirebaseRequest_(path, method, payload) {
  const options = { method: String(method || "get").toLowerCase(), muteHttpExceptions: true };
  if (payload !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(payload);
  }
  const response = UrlFetchApp.fetch(moaruEconomyFirebasePath_(path), options);
  const code = response.getResponseCode();
  if (code < 200 || code >= 300) throw new Error("FIREBASE_HTTP_" + code);
  const text = response.getContentText();
  if (!text) return null;
  try { return JSON.parse(text); } catch (error) { return null; }
}
function moaruEconomyFirebaseGet_(path) { return moaruEconomyFirebaseRequest_(path, "get"); }
function moaruEconomyFirebasePut_(path, value) { return moaruEconomyFirebaseRequest_(path, "put", value); }
function moaruEconomyFirebasePatch_(path, value) { return moaruEconomyFirebaseRequest_(path, "patch", value); }
function moaruEconomyFirebaseDelete_(path) { return moaruEconomyFirebaseRequest_(path, "delete"); }

function moaruEconomyUserPath_(userId) { return MOARU_ECONOMY_FIREBASE_ROOT + "/users/" + moaruEconomyFirebaseKey_(userId); }
function moaruEconomyBalancePath_(userId) { return MOARU_ECONOMY_FIREBASE_ROOT + "/balances/" + moaruEconomyFirebaseKey_(userId); }
function moaruEconomyActivePath_(userId) { return MOARU_ECONOMY_FIREBASE_ROOT + "/active/" + moaruEconomyFirebaseKey_(userId); }
function moaruEconomyStockPath_(productId) { return MOARU_ECONOMY_FIREBASE_ROOT + "/stock/" + moaruEconomyFirebaseKey_(productId); }
function moaruEconomyInventoryPath_(userId) { return MOARU_ECONOMY_FIREBASE_ROOT + "/inventory/" + moaruEconomyFirebaseKey_(userId); }
function moaruEconomyRevisionKey_(userId) { return MOARU_ECONOMY_REV_PREFIX + moaruSafeKey_(userId); }
function moaruEconomyStockRevisionKey_(productId) { return MOARU_ECONOMY_STOCK_REV_PREFIX + moaruSafeKey_(productId); }

function moaruEconomyRewardRows_() {
  const sheet = getSheet_(SHOP_REWARD_SHEET_NAME), lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, 3).getValues().map(function (row, index) {
    const userId = String(row[0] || "").trim();
    if (!userId) return null;
    let coin;
    try { coin = requireCoinAmount_(row[2]); } catch (error) { return null; }
    return { userId: userId, username: String(row[1] || ""), coin: coin, row: index + 2 };
  }).filter(Boolean);
}

function moaruEconomyCreateFirebaseUser_(row) {
  const userId = String(row && row.userId || "").trim();
  if (!userId) return false;
  const existing = moaruEconomyFirebaseGet_(moaruEconomyUserPath_(userId));
  if (existing && existing.active !== false) {
    moaruEconomyFirebasePut_(moaruEconomyActivePath_(userId), true);
    if (existing.balance !== undefined) moaruEconomyFirebasePut_(moaruEconomyBalancePath_(userId), { userId: userId, balance: Number(existing.balance) || 0, revision: Number(existing.revision) || 0, updatedAt: Number(existing.updatedAt) || Date.now() });
    return false;
  }
  const revision = 1, value = { userId: userId, active: true, balance: Number(row.coin) || 0, revision: revision, updatedAt: Date.now(), recentOps: {}, pending: {} };
  moaruEconomyFirebasePut_(moaruEconomyUserPath_(userId), value);
  moaruEconomyFirebasePut_(moaruEconomyActivePath_(userId), true);
  moaruEconomyFirebasePut_(moaruEconomyBalancePath_(userId), { userId: userId, balance: value.balance, revision: revision, updatedAt: value.updatedAt });
  PropertiesService.getScriptProperties().setProperty(moaruEconomyRevisionKey_(userId), String(revision));
  return true;
}

function purgeMoaruEconomyUser_(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  // 사용자 노드를 먼저 비활성화해 삭제와 동시에 들어온 transaction도 즉시 중단되게 합니다.
  try { moaruEconomyFirebasePatch_(moaruEconomyUserPath_(id), { active: false, updatedAt: Date.now(), lastTxnId: "purge:" + Utilities.getUuid() }); } catch (error) {}
  moaruEconomyFirebaseDelete_(moaruEconomyActivePath_(id));
  moaruEconomyFirebaseDelete_(moaruEconomyBalancePath_(id));
  moaruEconomyFirebaseDelete_(moaruEconomyInventoryPath_(id));
  moaruEconomyFirebaseDelete_(moaruEconomyUserPath_(id));
  PropertiesService.getScriptProperties().deleteProperty(moaruEconomyRevisionKey_(id));
  return true;
}

/**
 * 보상탭 현재 명단을 Firebase 경제 활성 사용자와 맞춥니다.
 * 최초 실행 시 기존 보상 사용자 전체를 생성하고, 이후 행 삭제는 Firebase 경제 데이터를 purge합니다.
 */
function syncMoaruEconomyUsersToFirebase() {
  const rows = moaruEconomyRewardRows_(), currentIds = rows.map(function (row) { return row.userId; }), currentSet = {};
  currentIds.forEach(function (id) { currentSet[id] = true; });
  const props = PropertiesService.getScriptProperties();
  let previous = [];
  try { previous = JSON.parse(props.getProperty(MOARU_ECONOMY_ACTIVE_SNAPSHOT_PROP) || "[]"); } catch (error) { previous = []; }
  const removed = previous.filter(function (id) { return !currentSet[id]; });
  removed.forEach(function (id) { try { purgeMoaruEconomyUser_(id); } catch (error) { console.error("ECONOMY_PURGE_FAILED", id, error); } });
  rows.forEach(function (row) { try { moaruEconomyCreateFirebaseUser_(row); } catch (error) { console.error("ECONOMY_USER_SYNC_FAILED", row.userId, error); } });
  props.setProperty(MOARU_ECONOMY_ACTIVE_SNAPSHOT_PROP, JSON.stringify(currentIds));
  return { ok: true, active: currentIds.length, removed: removed.length };
}

/** 보상탭 코인 셀 직접 수정 → Firebase 즉시 반영 */
function moaruEconomyOnEdit(e) {
  try {
    const range = e && e.range;
    if (!range || range.getSheet().getName() !== SHOP_REWARD_SHEET_NAME || range.getRow() < 2) return;
    if (range.getColumn() !== SHOP_COL_REWARD_COIN && range.getColumn() !== SHOP_COL_REWARD_USER_ID) return;
    if (range.getColumn() === SHOP_COL_REWARD_USER_ID) { syncMoaruEconomyUsersToFirebase(); return; }
    const sheet = range.getSheet(), userId = String(sheet.getRange(range.getRow(), SHOP_COL_REWARD_USER_ID).getValue() || "").trim();
    if (!userId) return;
    const coin = requireCoinAmount_(sheet.getRange(range.getRow(), SHOP_COL_REWARD_COIN).getValue());
    const current = moaruEconomyFirebaseGet_(moaruEconomyUserPath_(userId)) || {};
    const revision = Math.max(Number(current.revision) || 0, Number(PropertiesService.getScriptProperties().getProperty(moaruEconomyRevisionKey_(userId))) || 0) + 1;
    const updatedAt = Date.now();
    moaruEconomyFirebasePatch_(moaruEconomyUserPath_(userId), { userId: userId, active: true, balance: coin, revision: revision, updatedAt: updatedAt, lastTxnId: "sheet-edit:" + Utilities.getUuid() });
    moaruEconomyFirebasePut_(moaruEconomyActivePath_(userId), true);
    moaruEconomyFirebasePut_(moaruEconomyBalancePath_(userId), { userId: userId, balance: coin, revision: revision, updatedAt: updatedAt });
    PropertiesService.getScriptProperties().setProperty(moaruEconomyRevisionKey_(userId), String(revision));
    appendMoaruEconomyLog_({ txnId: "sheet-edit:" + Utilities.getUuid(), userId: userId, type: "SHEET_EDIT", amount: "", balance: coin, reason: "보상탭 직접 수정", createdAt: updatedAt });
  } catch (error) { console.error("ECONOMY_ON_EDIT_FAILED", error); }
}

/** 보상탭 행 삭제/삽입 감지 */
function moaruEconomyOnChange(e) {
  try {
    const type = String(e && e.changeType || "");
    if (!type || ["REMOVE_ROW","INSERT_ROW","INSERT_GRID","REMOVE_GRID","OTHER"].indexOf(type) < 0) return;
    syncMoaruEconomyUsersToFirebase();
  } catch (error) { console.error("ECONOMY_ON_CHANGE_FAILED", error); }
}

/** 최초 1회 직접 실행: 현재 사용자 동기화 + 설치형 편집/변경 트리거 구성 */
function setupMoaruEconomyFirebaseSync() {
  const handlers = { moaruEconomyOnEdit: true, moaruEconomyOnChange: true };
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    const name = trigger.getHandlerFunction && trigger.getHandlerFunction();
    if (handlers[name]) ScriptApp.deleteTrigger(trigger);
  });
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ScriptApp.newTrigger("moaruEconomyOnEdit").forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger("moaruEconomyOnChange").forSpreadsheet(ss).onChange().create();
  const userSync = syncMoaruEconomyUsersToFirebase();

  // 최초 이전: 기존 Firebase 운영값이 없는 항목만 Sheets의 현재 재고/보관함으로 채웁니다.
  // setup을 다시 실행해도 이미 Firebase에서 바뀐 재고나 선물/배송 상태를 과거 Sheets 값으로 덮지 않습니다.
  try {
    const catalog = readShopCatalog_();
    Object.keys(catalog).forEach(function (productId) {
      const path = moaruEconomyStockPath_(productId);
      if (moaruEconomyFirebaseGet_(path)) return;
      const product = normalizeShopProduct_(catalog[productId]);
      if (!product || !product.id) return;
      const unlimited = product.quantity === null || product.quantity === undefined;
      moaruEconomyFirebasePut_(path, { productId: String(product.id), qty: unlimited ? null : Math.max(0, Number(product.quantity) || 0), unlimited: unlimited, catalogUpdatedAt: Number(product.updatedAt) || 0, revision: 1, updatedAt: Date.now(), reservations: {} });
    });
  } catch (stockError) { console.error("ECONOMY_STOCK_MIGRATION_FAILED", stockError); }

  try {
    readShopInventorySheetItems_().forEach(function (item) {
      const ownerId = String(item.ownerId || "").trim();
      if (!ownerId || !moaruEconomyFirebaseGet_(moaruEconomyActivePath_(ownerId))) return;
      const itemPath = moaruEconomyInventoryPath_(ownerId) + "/" + moaruEconomyFirebaseKey_(item.id);
      if (moaruEconomyFirebaseGet_(itemPath)) return;
      moaruEconomyFirebasePut_(itemPath, item);
    });
  } catch (inventoryError) { console.error("ECONOMY_INVENTORY_MIGRATION_FAILED", inventoryError); }

  return userSync;
}

function getOrCreateMoaruEconomyLogSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(MOARU_ECONOMY_LOG_SHEET);
  if (!sheet) { sheet = ss.insertSheet(MOARU_ECONOMY_LOG_SHEET); sheet.getRange(1, 1, 1, MOARU_ECONOMY_LOG_HEADERS.length).setValues([MOARU_ECONOMY_LOG_HEADERS]); sheet.setFrozenRows(1); }
  return sheet;
}
function appendMoaruEconomyLog_(entry) {
  const value = entry || {}, txnId = String(value.txnId || "").trim();
  if (!txnId) return false;
  const sheet = getOrCreateMoaruEconomyLogSheet_(), last = sheet.getLastRow();
  if (last >= 2) {
    const match = sheet.getRange(2, 1, last - 1, 1).createTextFinder(txnId).matchEntireCell(true).findNext();
    if (match) return false;
  }
  sheet.appendRow([txnId, String(value.userId || ""), String(value.type || ""), value.amount === "" ? "" : Number(value.amount) || 0, Number(value.balance) || 0, String(value.reason || ""), new Date(Number(value.createdAt) || Date.now())]);
  return true;
}

function appendRewardLogFromEconomyEvent_(userId, event) {
  const txn = String(event.txnId || "");
  if (txn.indexOf("reward:") !== 0) return;
  const parts = txn.split(":");
  if (parts.length < 3) return;
  const type = String(parts[1] || "").toUpperCase(), key = parts.slice(2).join(":"), sheet = getOrCreateRewardLogSheet_(), last = sheet.getLastRow();
  if (last > 1) {
    const values = sheet.getRange(2, 1, last - 1, 3).getValues();
    for (let i = 0; i < values.length; i++) if (String(values[i][0]) === userId && String(values[i][1]).toUpperCase() === type && String(values[i][2]) === key) return;
  }
  sheet.appendRow([userId, type, key, Number(event.amount) || 0, new Date(Number(event.createdAt) || Date.now())]);
}

function syncInventoryEventToSheets_(userId, event) {
  const item = event && event.item;
  if (!item || !item.id) return;
  const ownerId = String(item.ownerId || event.targetUserId || userId || "").trim();
  if (!ownerId) return;
  const sheet = getOrCreateShopInventorySheet_(), existingRow = findShopInventorySheetRow_(sheet, item.id);
  writeShopInventoryItem_(ownerId, item, existingRow, { knownNewId: !existingRow });
  clearShopInventoryCache_(ownerId);
  const sourceId = String(event.sourceUserId || "").trim();
  if (sourceId && sourceId !== ownerId) clearShopInventoryCache_(sourceId);
}

function syncPurchaseEventToSheets_(userId, event) {
  const item = event.item || {}, purchaseKey = String(event.purchaseKey || item.purchaseKey || "").trim();
  if (!purchaseKey || !item.id) return;
  const logSheet = getOrCreateShopPurchaseLogSheet_();
  if (!findShopPurchase_(logSheet, purchaseKey)) logSheet.appendRow([purchaseKey, userId, String(item.productId || ""), String(item.name || "상품"), Number(item.price) || 0, Number(event.coinBefore) || 0, Number(event.balance) || 0, new Date(Number(event.createdAt) || Date.now())]);
  const invSheet = getOrCreateShopInventorySheet_(), existingRow = findShopInventorySheetRow_(invSheet, item.id);
  writeShopInventoryItem_(userId, item, existingRow, { knownNewId: !existingRow });
  clearShopInventoryCache_(userId);

  const productId = String(event.productId || item.productId || ""), stockRevision = Number(event.stockRevision) || 0;
  if (productId && event.remainingQuantity !== undefined && event.remainingQuantity !== null) {
    const props = PropertiesService.getScriptProperties(), key = moaruEconomyStockRevisionKey_(productId), previous = Number(props.getProperty(key)) || 0;
    if (stockRevision >= previous) {
      const catalog = readShopCatalog_(), product = normalizeShopProduct_(catalog[productId]);
      if (product && product.id) { writeShopProduct_(normalizeShopProduct_(Object.assign({}, product, { quantity: Number(event.remainingQuantity) }))); clearShopCatalogCaches_(); props.setProperty(key, String(stockRevision)); }
    }
  }
}

/** Firebase 클라이언트 처리 완료 후 Sheets 장기 원장에 비동기 반영 */
function handleEconomySheetSync(e) {
  const p = (e && e.parameter) || {}, userId = String(p.user_id || "").trim();
  if (!userId) return shopJson_({ ok: false, error: "NO_USER_ID" });
  let event = {};
  try { event = JSON.parse(String(p.event_json || "{}")) || {}; } catch (error) { return shopJson_({ ok: false, error: "INVALID_EVENT_JSON" }); }
  const reward = findRewardUserForShop_(userId);
  if (!reward) {
    try { purgeMoaruEconomyUser_(userId); } catch (error) {}
    return shopJson_({ ok: false, error: "NO_REWARD_USER" });
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return shopJson_({ ok: false, error: "COIN_BUSY" });
  try {
    const props = PropertiesService.getScriptProperties(), revision = Math.max(0, Math.floor(Number(event.revision) || 0)), savedRevision = Math.max(0, Number(props.getProperty(moaruEconomyRevisionKey_(userId))) || 0);
    if (event.balance !== undefined && event.balance !== null && revision >= savedRevision) {
      const coin = requireCoinAmount_(event.balance);
      reward.sheet.getRange(reward.row, SHOP_COL_REWARD_COIN).setValue(coin);
      props.setProperty(moaruEconomyRevisionKey_(userId), String(revision));
    }
    if (event.type === "purchase") syncPurchaseEventToSheets_(userId, event);
    if (event.type === "inventory") syncInventoryEventToSheets_(userId, event);
    if (event.type === "coin") appendRewardLogFromEconomyEvent_(userId, event);
    appendMoaruEconomyLog_({ txnId: String(event.txnId || Utilities.getUuid()), userId: userId, type: String(event.eventType || event.type || "ECONOMY"), amount: event.amount === undefined ? "" : event.amount, balance: event.balance, reason: event.reason || "", createdAt: event.createdAt || Date.now() });
    return shopJson_({ ok: true, revision: revision });
  } finally { lock.releaseLock(); }
}

/** 기존 Apps Script 경로에서 코인이 바뀐 경우 Firebase 현재값도 맞춥니다. */
function mirrorMoaruCoinToFirebase_(userId, newCoin, reason, txnId) {
  try {
    const id = String(userId || "").trim();
    if (!id || !getRewardUserData_(id)) return false;
    const current = moaruEconomyFirebaseGet_(moaruEconomyUserPath_(id)) || {}, revision = Math.max(Number(current.revision) || 0, Number(PropertiesService.getScriptProperties().getProperty(moaruEconomyRevisionKey_(id))) || 0) + 1, updatedAt = Date.now();
    moaruEconomyFirebasePatch_(moaruEconomyUserPath_(id), { userId: id, active: true, balance: Number(newCoin) || 0, revision: revision, updatedAt: updatedAt, lastTxnId: String(txnId || "sheet:" + Utilities.getUuid()) });
    moaruEconomyFirebasePut_(moaruEconomyActivePath_(id), true);
    moaruEconomyFirebasePut_(moaruEconomyBalancePath_(id), { userId: id, balance: Number(newCoin) || 0, revision: revision, updatedAt: updatedAt });
    PropertiesService.getScriptProperties().setProperty(moaruEconomyRevisionKey_(id), String(revision));
    return true;
  } catch (error) { console.error("ECONOMY_FIREBASE_MIRROR_FAILED", userId, reason, error); return false; }
}
