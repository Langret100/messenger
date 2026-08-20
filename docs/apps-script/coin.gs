/*************************************************
 * 코인/보상 관련 전용 코드 (coin.gs)
 * - 원래 Code.gs 의 기능은 건드리지 않음
 * - doGet/doPost 는 Code.gs 쪽 것만 사용
 *************************************************/

// 보상 시트 설정
const REWARD_SHEET = "보상";
const COL_REWARD_USER_ID = 1;
const COL_REWARD_USERNAME = 2;
const COL_REWARD_COIN = 3;
const COL_REWARD_URL = 4;

// 웹 고스트에서 쓸 기본 코인 한도 (나의 코인 (x/100) 의 100)
const DEFAULT_COIN_LIMIT = 100;

// (추가) 코인 보상 로그 시트 설정
// - 같은 조건으로 중복 지급을 막기 위해 사용
// - 스키마: user_id | type | key | delta | timestamp
const REWARD_LOG_SHEET = "보상로그";
const COL_LOG_USER_ID = 1;
const COL_LOG_TYPE = 2;
const COL_LOG_KEY = 3;
const COL_LOG_DELTA = 4;
const COL_LOG_TIME = 5;

// 이 프로젝트에서 사용할 "정해진" 웹앱 URL
// (관리용 코인 페이지에 들어가는 URL, 동기화 시 사용)
const MANUAL_WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbz6PjWqKuoTmTalX7ieq3NuhJr-6DPwFQI3c7sDCu9cSCFDt90DP4Ju0yIjfjOgyNoI6w/exec";

/**
 * 보상 시트에서 user_id 로 데이터 찾기
 */
function getRewardUserData_(userId) {
  const sheet = getSheet_(REWARD_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A:C
  for (let i = 0; i < values.length; i++) {
    if (String(values[i][COL_REWARD_USER_ID - 1]) === String(userId)) {
      return {
        userId: values[i][COL_REWARD_USER_ID - 1],
        username: values[i][COL_REWARD_USERNAME - 1],
        coin: parseInt(values[i][COL_REWARD_COIN - 1]) || 0
      };
    }
  }
  return null;
}

/**
 * 코인 관리 HTML 페이지 렌더링
 * - /exec?user_id=... 로 접근했을 때 사용
 * - doGet(e) 에서 호출됨 (Code.gs → renderCoinPage_)
 */
function renderCoinPage_(userId) {
  if (!userId) {
    return HtmlService
      .createHtmlOutput(
        '<h2 style="text-align:center; margin-top:50px; font-family:sans-serif;">🚫 잘못된 접근입니다.<br>시트의 링크를 이용해주세요.</h2>'
      )
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  const userData = getRewardUserData_(userId);
  if (!userData) {
    const msg = "🚫 ID '" + userId + "'를 찾을 수 없습니다.";
    return HtmlService
      .createHtmlOutput(
        '<h2 style="text-align:center; margin-top:50px; font-family:sans-serif;">' +
          msg +
          "</h2>"
      )
      .addMetaTag("viewport", "width=device-width, initial-scale=1");
  }

  const html = HtmlService.createTemplateFromFile("Index");
  html.userId = userData.userId;
  html.username = userData.username;
  html.coin = userData.coin;

  return html
    .evaluate()
    .setTitle("코인 관리")
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * 화면 이동 없이 코인을 변경하는 핵심 함수
 * - Index.html 에서 google.script.run.processCoinChange(...) 로 호출
 */
function processCoinChangeUnlocked_(userId, action, amount) {
  const sheet = getSheet_(REWARD_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("사용자를 찾을 수 없습니다.");

  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues(); // A:C

  let rowIndex = -1;
  let currentCoin = 0;

  for (let i = 0; i < values.length; i++) {
    if (String(values[i][COL_REWARD_USER_ID - 1]) === String(userId)) {
      rowIndex = 2 + i;
      currentCoin = parseInt(values[i][COL_REWARD_COIN - 1]) || 0;
      break;
    }
  }
  if (rowIndex === -1) {
    return {
      success: false,
      newCoin: null,
      message: "존재하지 않는 사용자입니다."
    };
  }

  const amt = parseInt(amount, 10);
  if (!amt || isNaN(amt) || amt <= 0) {
    throw new Error("잘못된 수량입니다.");
  }

  let newCoin = currentCoin;
  if (action === "add") {
    newCoin = currentCoin + amt;
  } else if (action === "remove") {
    if (currentCoin < amt) throw new Error("잔액 부족!");
    newCoin = currentCoin - amt;
  } else {
    throw new Error("알 수 없는 action 값입니다.");
  }

  sheet.getRange(rowIndex, COL_REWARD_COIN).setValue(newCoin);

  return {
    success: true,
    newCoin: newCoin,
    message: action === "add" ? "✅ " + amt + " 추가됨" : "📉 " + amt + " 사용됨"
  };
}

/** 외부 화면에서는 이 함수를 직접 호출하지 않습니다. 관리자 코드 검증 경로만 사용합니다. */
function processCoinChange() {
  throw new Error("DIRECT_COIN_CHANGE_DISABLED");
}

/** 기존 코인 관리 페이지용 서버 검증 API */
function processCoinChangeAuthorized(userId, action, amount, adminCode) {
  const saved = String(PropertiesService.getScriptProperties().getProperty("MINITALK_ADMIN_CODE") || ""), provided = String(adminCode || "");
  if (!saved || saved.length !== provided.length) throw new Error("관리자 인증에 실패했습니다.");
  let mismatch = 0;for (let i = 0; i < saved.length; i++) mismatch |= saved.charCodeAt(i) ^ provided.charCodeAt(i);
  if (mismatch !== 0) throw new Error("관리자 인증에 실패했습니다.");
  const lock = LockService.getScriptLock();if (!lock.tryLock(5000)) throw new Error("처리 중입니다. 잠시 후 다시 시도해주세요.");
  try { return processCoinChangeUnlocked_(userId, action, amount); } finally { lock.releaseLock(); }
}

/**
 * Web 고스트 상단 "나의 코인 (x/100)" 표시용 API
 * - Code.gs 의 doGet(e) 에서 mode=coin_status 일 때 호출됨
 * - 응답 형식: { ok:true, coin:숫자, limit:100 }
 */
function handleCoinStatus(e) {
  const userId =
    e && e.parameter && e.parameter.user_id
      ? String(e.parameter.user_id).trim()
      : "";

  if (!userId) {
    // user_id 없이 호출되면 0코인으로, ok:false 로 응답
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: "NO_USER_ID" }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const userData = getRewardUserData_(userId);

  let coin = 0;
  if (userData) {
    const parsed = parseInt(userData.coin, 10);
    coin = isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
  }

  const out = {
    ok: true,
    coin: coin,
    limit: DEFAULT_COIN_LIMIT
  };

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Web 고스트 → 코인 보상 요청 처리 API
 * - Code.gs 의 doPost(e) 또는 doGet(e) 에서 mode=coin_reward 일 때 호출
 * - 프론트에서 보내는 파라미터:
 *    user_id      : 계정 ID (필수)
 *    reward_type  : ATTEND_5D / RANKING_1ST / QUEST_5CLEAR / WEEKLY_CHECK_OVER80 (필수)
 *    reward_key   : 주차 키(출석) / 게임 이름(랭킹) / 날짜(퀘스트) 등 (필수)
 * - 보상 규칙:
 *    ATTEND_5D    : +1 코인
 *    RANKING_1ST  : +2 코인
 *    QUEST_5CLEAR : +1 코인
 *    WEEKLY_CHECK_OVER80 : +3 코인 (금요일 20문항 80점 초과)
 * - 같은 (user_id, reward_type, reward_key) 조합에는 한 번만 지급
 */
function handleCoinReward(e) {
  const rewardLock = LockService.getScriptLock();
  if (!rewardLock.tryLock(5000)) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "COIN_BUSY" })).setMimeType(ContentService.MimeType.JSON);
  try {
  const p = (e && e.parameter) || {};
  const userId = p.user_id ? String(p.user_id).trim() : "";
  let type = p.reward_type ? String(p.reward_type).trim() : "";
  const key = p.reward_key ? String(p.reward_key).trim() : "";

  if (!userId || !type || !key) {
    return ContentService
      .createTextOutput(
        JSON.stringify({
          ok: false,
          error: "MISSING_PARAM",
          detail: { userId: !!userId, type: !!type, key: !!key }
        })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }

  type = type.toUpperCase();

  // 타입별 지급 코인 양
  let delta = 0;
  if (type === "ATTEND_5D") {
    delta = 1;
  } else if (type === "RANKING_1ST") {
    delta = 2;
  } else if (type === "QUEST_5CLEAR") {
    delta = 1;
  } else if (type === "WEEKLY_CHECK_OVER80") {
    delta = 3;
  } else {
    return ContentService
      .createTextOutput(
        JSON.stringify({ ok: false, error: "UNKNOWN_REWARD_TYPE", type: type })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 보상 대상 사용자가 보상 시트에 존재하는지 먼저 확인
  const userData = getRewardUserData_(userId);
  if (!userData) {
    return ContentService
      .createTextOutput(
        JSON.stringify({
          ok: false,
          error: "NO_REWARD_USER",
          message: "보상 시트에서 해당 사용자를 찾을 수 없습니다."
        })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 보상로그 시트 가져오기 (없으면 생성)
  const logSheet = getOrCreateRewardLogSheet_();

  // 이미 같은 보상을 준 적이 있는지 확인
  const lastRow = logSheet.getLastRow();
  if (lastRow > 1) {
    const logValues = logSheet
      .getRange(2, 1, lastRow - 1, 3) // A:C (user_id, type, key)
      .getValues();
    for (let i = 0; i < logValues.length; i++) {
      const row = logValues[i];
      const u = String(row[COL_LOG_USER_ID - 1] || "");
      const t = String(row[COL_LOG_TYPE - 1] || "").toUpperCase();
      const k = String(row[COL_LOG_KEY - 1] || "");
      if (u === userId && t === type && k === key) {
        // 이미 지급된 보상
        return ContentService
          .createTextOutput(
            JSON.stringify({
              ok: true,
              applied: false,
              reason: "ALREADY_REWARDED"
            })
          )
          .setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  // 실제 코인 증가 처리: 기존 processCoinChange() 재사용
  let result;
  try {
    result = processCoinChangeUnlocked_(userId, "add", delta);
  } catch (err) {
    return ContentService
      .createTextOutput(
        JSON.stringify({
          ok: false,
          error: "PROCESS_COIN_CHANGE_FAILED",
          message: String(err && err.message ? err.message : err)
        })
      )
      .setMimeType(ContentService.MimeType.JSON);
  }

  // 지급 성공 시 로그에 기록
  const newLastRow = logSheet.getLastRow();
  const writeRow = newLastRow + 1;
  logSheet
    .getRange(writeRow, 1, 1, 5)
    .setValues([[userId, type, key, delta, new Date()]]);

  const out = {
    ok: true,
    applied: true,
    user_id: userId,
    type: type,
    key: key,
    delta: delta,
    newCoin: result && typeof result.newCoin !== "undefined" ? result.newCoin : null
  };

  return ContentService
    .createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
  } finally { rewardLock.releaseLock(); }
}

/**
 * (내부) 보상로그 시트를 가져오거나 없으면 생성
 */
function getOrCreateRewardLogSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(REWARD_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(REWARD_LOG_SHEET);
    sheet
      .getRange(1, 1, 1, 5)
      .setValues([["user_id", "type", "key", "delta", "timestamp"]]);
  }
  return sheet;
}

/**
 * 로그인 시트 → 보상 시트 동기화 + URL 생성
 * - 스프레드시트 메뉴 '코인 관리 > 동기화 실행' 으로 호출
 * - 항상 MANUAL_WEB_APP_URL 기준으로 링크 생성
 */
function syncUsersToRewards() {
  const syncLock = LockService.getScriptLock();syncLock.waitLock(20000);
  try {
  const loginSheet = getSheet_(LOGIN_SHEET);
  const rewardsSheet = getSheet_(REWARD_SHEET);

  const loginData = loginSheet.getDataRange().getValues();
  const rewardsData = rewardsSheet.getDataRange().getValues();
  const existingMap = {};

  if (rewardsData.length > 1) {
    for (let i = 1; i < rewardsData.length; i++) {
      const uid = String(rewardsData[i][COL_REWARD_USER_ID - 1]);
      existingMap[uid] = {
        coin: rewardsData[i][COL_REWARD_COIN - 1]
      };
    }
  }

  // 동기화 시에 사용할 웹앱 URL
  const baseUrl = MANUAL_WEB_APP_URL;

  const newData = [["user_id", "username", "coin", "url"]];

  for (let i = 1; i < loginData.length; i++) {
    const uid = loginData[i][0];
    if (!uid) continue;
    const username = loginData[i][1];

    const key = String(uid);
    const coin = existingMap[key] ? existingMap[key].coin : 0;
    const url = baseUrl ? baseUrl + "?user_id=" + encodeURIComponent(uid) : "";

    newData.push([uid, username, coin, url]);
  }

  rewardsSheet.clearContents();
  rewardsSheet.getRange(1, 1, newData.length, 4).setValues(newData);
  rewardsSheet.autoResizeColumns(1, 4);

  SpreadsheetApp.getUi().alert("동기화 완료!");
  } finally { syncLock.releaseLock(); }
}

/**
 * 스프레드시트 열 때 메뉴 추가
 * - 기존 onOpen 이 따로 없으니 여기서 메뉴만 생성
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("코인 관리")
    .addItem("동기화 실행", "syncUsersToRewards")
    .addToUi();
}
