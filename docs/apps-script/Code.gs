/**
 * 공통 상수
 */
const SHEET_ID      = "1p_-rbFdGTyN2BqDdTBSuziqMOEZpWqXiIa-O-OKdAFY";
const LOGIN_SHEET   = "로그인";
const ATTEND_SHEET  = "출석체크";
const MAIL_SHEET    = "편지";
const DIALOG_SHEET  = "대화";
const BOARD_SHEET   = "게시판";

// 🔹 게임 랭킹용 시트 이름 목록 (각 게임별 탭 이름과 정확히 일치해야 함)
const GAME_SHEETS   = ["구구단게임", "덧셈주사위", "꿈틀이도형추적자", "수학탐험대", "마이다마고치"];
const GAME_RANK_LIMIT_DEFAULT = 10;

/**
 * 공통: 스프레드시트 / 시트 가져오기
 */
function getSheet_(name) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error("시트를 찾을 수 없습니다: " + name);
  }
  return sheet;
}

/**
 * 공통: JSON 응답 헬퍼
 */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj || {}))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 공통: POST 바디 파싱
 * - fetch(..., { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(...) })
 *   형태와, 폼 방식 둘 다 지원
 */
function getRequestData_(e, isPost) {
  const param = (e && e.parameter) || {};
  let data = {};
  let mode = param.mode || "";

  if (isPost) {
    const ct = (e && e.postData && e.postData.type) || "";
    if (ct.indexOf("application/json") !== -1) {
      try {
        data = JSON.parse(e.postData.contents || "{}");
      } catch (err) {
        data = {};
      }
      if (!mode && data.mode) {
        mode = data.mode;
      }
    } else {
      data = param;
    }
  } else {
    data = param;
  }

  return {
    mode: (mode || "").toString().trim(),
    data: data
  };
}

/**
 * GET 엔드포인트
 *
 * - 기본(파라미터 없음): 대화 시트 데이터 반환 (학습용)
 * - ?mode=... 에 따라 게시판, 편지, 출석, 게임 랭킹 등 조회
 */
function doGet(e) {
  // 🔹 코인 관리 URL: mode 없이 user_id만 있으면 코인 HTML 페이지로 응답 (coin.gs)
  const params = (e && e.parameter) || {};
  if (!params.mode && params.user_id) {
    return renderCoinPage_(params.user_id);
  }

  const req = getRequestData_(e, false);
  const mode = req.mode;
  const data = req.data;

  try {
    if (!mode) {
      // 기본: "대화" 탭 읽어서 학습 데이터 반환
      return getDialogData_();
    }

    switch (mode) {
      case "board_list":
        return getBoardList_();

      case "mail_list":
        return getMailList_(data);

      case "mail_check":
        return getMailCheck_(data);

      case "attendance_week":
        return getAttendanceWeek_(data);

      // 새 버전: 주간 출석 상태 조회 (기기/브라우저 상관 없이 계정 기준)
      case "attendance_weekly_status":
        return attendanceWeeklyStatus_(data);

      // 필요하다면 GET으로도 stamp 테스트 가능하게 열어둠
      case "attendance_weekly_stamp":
        return attendanceWeeklyStamp_(data);

      // 🔹 코인 상태 조회 (Web 고스트 상단 "나의 코인"용)
      case "coin_status":
        return handleCoinStatus(e);

      case "user_directory":
        return handleUserDirectory(data);

      // 🔹 게임 랭킹 / 개인 최고 상태 조회 (GET)
      case "game_ranking":
        return gameRanking_(data);

      case "game_best_status":
        return gameBestStatus_(data);

      // 아래는 원래 POST 전용이지만, GET으로 잘못 보내도 동작하게 열어둠
      case "signup":
        return signup_(data);

      case "login":
        return login_(data);

      case "board_write":
        return boardWrite_(data);

      case "mail_send":
        return mailSend_(data);

      case "mail_read":
        return mailRead_(data);

      case "attendance_mark":
        return attendanceMark_(data);

            // 🔹 FCM 웹 푸시 알림 발송 (js/fcm-push.js, js/social-messenger.js 연동)
      case "fcm_push":
        return handleFcmPush_(e);

      case "ad_list_images":
        return handleAdListImages_(e);

      default:
        return jsonResponse_({ ok: false, error: "Unknown mode (GET): " + mode });
    }
  } catch (err) {
    Logger.log("doGet error: " + err);
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

/**
 * POST 엔드포인트
 *
 * mode=signup                  : 회원가입
 * mode=login                   : 로그인
 * mode=board_write             : 게시판 글쓰기
 * mode=mail_send               : 편지 보내기
 * mode=mail_read               : 편지 읽음 처리
 * mode=attendance_mark         : (레거시) 출석 도장 찍기
 * mode=attendance_weekly_stamp : (새 버전) 주간 출석 도장 + 상태 응답
 *
 * 추가: board_list / mail_list / mail_check / attendance_week / attendance_weekly_status 도 POST 지원
 * 추가: game_update_score / game_ranking / game_best_status 도 POST 지원
 * 추가: coin_reward (출석/랭킹/퀘스트 코인 보상)
 */
function doPost(e) {
  const req = getRequestData_(e, true);
  const data = req.data;
  const mode = req.mode;

  Logger.log("doPost mode=" + mode + ", data=" + JSON.stringify(data));

  try {
    if (!mode) {
      // 가르치기(학습) 저장
      saveDialogData_(data);
      // 프론트에서는 no-cors로 호출하므로 응답을 못 읽어도 상관 없음
      return jsonResponse_({ ok: true });
    }

    switch (mode) {
      case "signup":
        return signup_(data);

      case "login":
        return login_(data);

      case "board_write":
        return boardWrite_(data);

      case "mail_send":
        return mailSend_(data);

      case "mail_read":
        return mailRead_(data);

      case "attendance_mark":
        return attendanceMark_(data);

      // 새 버전: 주간 출석 도장 + 상태 (프론트 출석 팝업용)
      case "attendance_weekly_stamp":
        return attendanceWeeklyStamp_(data);

      // 읽기 계열도 POST로 들어와도 처리
      case "board_list":
        return getBoardList_();

      case "mail_list":
        return getMailList_(data);

      case "mail_check":
        return getMailCheck_(data);

      case "attendance_week":
        return getAttendanceWeek_(data);

      case "attendance_weekly_status":
        return attendanceWeeklyStatus_(data);

      // 🔹 게임 관련
      case "game_update_score":
        return gameUpdateScore_(data);

      case "game_ranking":
        return gameRanking_(data);

      case "game_best_status":
        return gameBestStatus_(data);
  
      // 🔹 소통 채팅 시트 기록 추가 ★여기 추가
            case "social_chat":
        return handleSocialChatPost_(data);

      // 최근 소통 메시지 5개 요청
      case "social_recent":
        return handleSocialRecentPost_(data);
        
      

      // 🔹 소통 업로드(이미지/파일)
      case "social_upload_image":
        return handleSocialUploadImage_(e);

      case "social_upload_file":
        return handleSocialUploadFile_(e);


      // 🔹 메신저 대화방(다중 방) - CHAT_ROOMS_MESSENGER.gs 라우팅
      case "social_rooms":
      case "social_room_create":
      case "social_room_leave":
      case "social_room_enter":
      case "social_recent_room":
      case "social_chat_room": {
        const merged = Object.assign({}, data, { mode: mode });
        const result = socialRooms_handleMode_(merged);
        return jsonResponse_(result || { ok: false, error: "rooms_handler_returned_null" });
      }
      // 🔹 코인 보상 (출석/랭킹/퀘스트)
      case "coin_reward":
        return handleCoinReward(e);

      // 🔹 미니톡 코인 잔액 조회(POST)
      case "coin_status":
        return handleCoinStatus(e);

      // 🔹 로그인 사용자 관리자 고유 코드 인증
      case "admin_unlock":
        return handleAdminUnlock(e);

      // 🔹 서버 상품 카탈로그 조회
      case "shop_catalog":
        return handleShopCatalog(e);

      // 로그인 시트의 가입자 닉네임 명단(비밀번호·아이디 제외)
      case "user_directory":
        return handleUserDirectory(e);

      // 🔹 관리자 상품 등록·수정
      case "shop_product_save":
        return handleShopProductSave(e);

      // 🔹 관리자 상품 삭제
      case "shop_product_delete":
        return handleShopProductDelete(e);

      // 🔹 서버 가격 확인 후 코인 구매
      case "shop_purchase":
        return handleShopPurchase(e);

      case "shop_inventory":
        return handleShopInventory(e);

      case "shop_gift":
        return handleShopGift(e);

      case "shop_use":
        return handleShopUse(e);

      case "shop_request_delivery":
        return handleShopRequestDelivery(e);

      case "shop_delivery_list":
        return handleShopDeliveryList(e);

      case "shop_delivery_shipping":
        return handleShopDeliveryShipping(e);

      case "shop_delivery_complete":
        return handleShopDeliveryComplete(e);

      case "shop_delivery_cancel":
        return handleShopDeliveryCancel(e);

      case "admin_dispatch":
        return handleAdminDispatch(e);

      case "admin_coin_reward":
        return handleAdminCoinReward(e);

      case "admin_user_balances":
        return handleAdminUserBalances(e);

      case "admin_task_assign":
        return handleAdminTaskAssign(e);

      case "admin_task_list":
        return handleAdminTaskList(e);

      case "admin_task_review":
        return handleAdminTaskReview(e);

      case "admin_task_bulk_review":
        return handleAdminTaskBulkReview(e);

      case "admin_task_bulk_delete":
        return handleAdminTaskBulkDelete(e);

      case "user_task_list":
        return handleUserTaskList(e);

      case "user_task_submit":
        return handleUserTaskSubmit(e);

      case "user_commands":
        return handleUserCommands(e);

      case "moaru_room_backup":
        return handleMoaruChatRoomBackup(e);

      case "moaru_room_message_backup":
        return handleMoaruChatMessageBackup(e);

            // 🔹 FCM 웹 푸시 알림 발송 (js/fcm-push.js, js/social-messenger.js 연동)
      case "fcm_push":
        return handleFcmPush_(e);

      case "ad_list_images":
        return handleAdListImages_(e);

      default:
        return jsonResponse_({ ok: false, error: "Unknown mode (POST): " + mode });
    }
  } catch (err) {
    Logger.log("doPost error: " + err);
    const message = String(err && err.message ? err.message : err);
    const errorCode = /^[A-Z][A-Z0-9_]{2,80}$/.test(message) ? message : String(err);
    return jsonResponse_({ ok: false, error: errorCode });
  }
}

/* ---------------------------------------------------
 * 1) 대화(학습) 탭 관련
 * ---------------------------------------------------
 */

/**
 * GET 기본: "대화" 탭 데이터 읽기
 */
function getDialogData_() {
  const sheet = getSheet_(DIALOG_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({ ok: true, data: [] });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 3); // A:C
  const values = range.getValues();

  const data = values.map(function(row) {
    return {
      motion: row[0] || "",
      word: row[1] || "",
      message: row[2] || ""
    };
  });

  return jsonResponse_({ ok: true, data: data });
}

/**
 * POST 기본: 대화 탭에 새 학습 데이터 추가
 */
function saveDialogData_(data) {
  const word    = (data.word || "").toString().trim();
  const message = (data.message || "").toString().trim();
  const motion  = (data.motion || "").toString().trim();

  if (!word || !message) {
    return jsonResponse_({ ok: false, error: "word와 message는 필수입니다." });
  }

  const sheet = getSheet_(DIALOG_SHEET);
  sheet.appendRow([motion, word, message]);
  return jsonResponse_({ ok: true });
}

/* ---------------------------------------------------
 * 2) 회원가입 / 로그인
 * ---------------------------------------------------
 */

/**
 * 회원가입 (mode=signup)
 * - user_id 는 자동 생성 (U + 타임스탬프)
 * - username(아이디), password 는 필수
 * - 시트 구조: user_id | username | password | nickname | created_at | last_login
 * - user_id / username / nickname 중복 모두 방지
 */
function signup_(data) {
  let userId   = (data.user_id || "").toString().trim();
  const username = (data.username || data.id || "").toString().trim();
  const password = (data.password || "").toString().trim();
  const nickname = (data.nickname || "").toString().trim();

  if (!username || !password) {
    return jsonResponse_({
      ok: false,
      error: "아이디(username)와 비밀번호는 필수입니다."
    });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return jsonResponse_({ ok: false, error: "회원가입 요청이 많습니다. 잠시 후 다시 시도해주세요." });
  try {
  const sheet = getSheet_(LOGIN_SHEET);
  const lastRow = sheet.getLastRow();

  if (!userId) {
    userId = "U" + new Date().getTime();
  }

  if (lastRow > 1) {
    const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues(); // A:user_id, B:username, D:nickname
    for (var i = 0; i < values.length; i++) {
      const rowUserId   = (values[i][0] || "").toString().trim();
      const rowUsername = (values[i][1] || "").toString().trim();
      const rowNickname = (values[i][3] || "").toString().trim();

      if (rowUserId && rowUserId === userId) {
        return jsonResponse_({ ok: false, error: "이미 존재하는 user_id 입니다." });
      }
      if (rowUsername && rowUsername === username) {
        return jsonResponse_({ ok: false, error: "이미 존재하는 아이디입니다." });
      }
      if (nickname && rowNickname && rowNickname === nickname) {
        return jsonResponse_({ ok: false, error: "이미 존재하는 닉네임입니다." });
      }
    }
  }

  const now = new Date();
  const createdAt = formatDateTime_(now);
  const lastLogin = "";

  sheet.appendRow([userId, username, password, nickname, createdAt, lastLogin]);
  const insertedLoginRow = sheet.getLastRow();
  let coinAccount;
  try {
    if (typeof ensureMoaruCoinAccount_ !== "function") throw new Error("COIN_ACCOUNT_INITIALIZER_MISSING");
    coinAccount = ensureMoaruCoinAccount_({ userId: userId, username: username, nickname: nickname });
  } catch (coinError) {
    coinAccount = { ok: false, error: coinError && coinError.message || "REWARD_ACCOUNT_INIT_FAILED" };
  }
  if (!coinAccount || !coinAccount.ok) {
    try { if (String(sheet.getRange(insertedLoginRow, 1).getValue() || "").trim() === userId) sheet.deleteRow(insertedLoginRow); } catch (rollbackError) { console.error("SIGNUP_ROLLBACK_FAILED", userId, rollbackError); }
    return jsonResponse_({ ok: false, error: "코인 계정을 만들지 못해 회원가입을 취소했습니다. 관리자에게 보상 시트 구조를 확인해달라고 알려주세요.", code: coinAccount && coinAccount.error || "REWARD_ACCOUNT_INIT_FAILED" });
  }
  try { CacheService.getScriptCache().remove("moaru-user-directory-v1"); } catch (cacheError) {}
  try { CacheService.getScriptCache().remove("moaru-registered-users-v2"); } catch (cacheError) {}

  return jsonResponse_({
    ok: true,
    user_id: userId,
    username: username,
    nickname: nickname,
    coin: Number(coinAccount.coin) || 0,
    coin_account_created: coinAccount.created === true
  });
  } finally { lock.releaseLock(); }
}

/**
 * 로그인 (mode=login)
 * - 아이디(username) 또는 user_id + 비밀번호 로 로그인
 * - 닉네임으로는 로그인되지 않음
 */
function login_(data) {
  const loginId = (data.user_id || data.id || data.username || "").toString().trim();
  const password = (data.password || "").toString().trim();

  if (!loginId || !password) {
    return jsonResponse_({
      ok: false,
      error: "아이디와 비밀번호는 필수입니다."
    });
  }

  const sheet = getSheet_(LOGIN_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({ ok: false, error: "가입된 계정이 없습니다." });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 6); // A:F
  const values = range.getValues();

  for (var i = 0; i < values.length; i++) {
    const row = values[i];
    const rowUserId   = (row[0] || "").toString().trim();
    const rowUsername = (row[1] || "").toString().trim();
    const rowPassword = (row[2] || "").toString().trim();
    const rowNickname = (row[3] || "").toString().trim();

    const idMatches = (loginId === rowUserId || loginId === rowUsername);

    if (idMatches && rowPassword === password) {
      const now = new Date();
      const lastLogin = formatDateTime_(now);
      sheet.getRange(2 + i, 6).setValue(lastLogin);

      return jsonResponse_({
        ok: true,
        user_id: rowUserId,
        username: rowUsername,
        nickname: rowNickname,
        last_login: lastLogin
      });
    }
  }

  return jsonResponse_({
    ok: false,
    error: "아이디 또는 비밀번호가 틀렸습니다."
  });
}

/**
 * 닉네임(또는 username)으로 user_id 찾기
 * - 먼저 닉네임(D열)에서 exact match
 * - 없으면 username(B열)에서 exact match
 */
function resolveUserIdByName_(name) {
  const target = (name || "").toString().trim();
  if (!target) return "";

  const sheet = getSheet_(LOGIN_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return "";

  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues(); // A:D

  var fallbackId = "";
  for (var i = 0; i < values.length; i++) {
    const row = values[i];
    const userId = (row[0] || "").toString().trim();
    const username = (row[1] || "").toString().trim();
    const nickname = (row[3] || "").toString().trim();

    if (nickname && nickname === target) {
      return userId;
    }
    if (!fallbackId && username && username === target) {
      fallbackId = userId;
    }
  }
  return fallbackId;
}

/* ---------------------------------------------------
 * 3) 게시판
 * ---------------------------------------------------
 */

function getBoardList_() {
  const sheet = getSheet_(BOARD_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({ ok: true, data: [] });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 4); // A:D
  const values = range.getValues();

  const list = values.map(function(row) {
    const rawDate = row[0];
    const dateStr = normalizeBoardDate_(rawDate);

    return {
      date: dateStr,
      created_at: dateStr,   // 프론트에서 시간 표시용으로 사용하는 필드
      title: row[1] || "",
      author: row[2] || "",
      content: row[3] || ""
    };
  });

  return jsonResponse_({ ok: true, data: list });
}

function boardWrite_(data) {
  const title = (data.title || "").toString().trim();
  const author = (data.author || "").toString().trim();
  const content = (data.content || "").toString().trim();

  if (!title || !author || !content) {
    return jsonResponse_({ ok: false, error: "제목, 작성자, 내용을 모두 입력해 주세요." });
  }

  const sheet = getSheet_(BOARD_SHEET);
  const now = new Date();
  // ✅ 날짜+시간까지 저장
  const dateStr = formatDateTime_(now); // "yyyy-MM-dd HH:mm:ss"

  sheet.appendRow([dateStr, title, author, content]);
  return jsonResponse_({ ok: true });
}

/* ---------------------------------------------------
 * 4) 출석체크
 * ---------------------------------------------------
 */

function formatDate_(date) {
  return Utilities.formatDate(date, "Asia/Seoul", "yyyy-MM-dd");
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
}

// 게시판/여러 곳에서 Date 타입이 그대로 들어온 값을 안전하게 문자열로 정규화
function normalizeBoardDate_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return formatDateTime_(value); // 한국 시간 기준 yyyy-MM-dd HH:mm:ss
  }
  return value.toString().trim();
}

function attendanceMark_(data) {
  const userId = (data.user_id || "").toString().trim();
  const username = (data.username || "").toString().trim();

  if (!userId || !username) {
    return jsonResponse_({ ok: false, error: "user_id와 username은 필수입니다." });
  }

  const sheet = getSheet_(ATTEND_SHEET);
  const today = new Date();
  const dateStr = formatDate_(today);

  sheet.appendRow([dateStr, userId, username, "출석"]);

  return jsonResponse_({ ok: true });
}

function getAttendanceWeek_(param) {
  let userId = (
    (param && param.user_id) ||
    (param && param.parameter && param.parameter.user_id) ||
    ""
  ).toString().trim();

  let username = (
    (param && (param.username || param.name)) ||
    (param && param.parameter && (param.parameter.username || param.parameter.name)) ||
    ""
  ).toString().trim();

  if (!userId && username) {
    userId = resolveUserIdByName_(username);
  }

  if (!userId) {
    return jsonResponse_({ ok: false, error: "user_id가 필요합니다." });
  }

  const sheet = getSheet_(ATTEND_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({ ok: true, list: [] });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 4); // A:D
  const values = range.getValues();

  const list = [];
  for (var i = 0; i < values.length; i++) {
    const row = values[i];
    const dateStr = (row[0] || "").toString().trim();
    const rowUserId = (row[1] || "").toString().trim();
    const username2 = (row[2] || "").toString().trim();
    const status = (row[3] || "").toString().trim();

    if (rowUserId === userId) {
      list.push({ date: dateStr, user_id: rowUserId, username: username2, status: status });
    }
  }

  return jsonResponse_({ ok: true, list: list });
}

/**
 * 주간 출석용 주차 정보 구하기 (한국 날짜 기준, 요일 수학 계산)
 * - weekKey: "YYYY-MM-DD" (해당 주의 월요일 날짜)
 * - weekday: 1~7 (월~일, 한국 날짜 기준)
 */
function getWeekMeta_(date) {
  // 한국 날짜 문자열
  var koreaDateStr = Utilities.formatDate(date, "Asia/Seoul", "yyyy-MM-dd");
  var parts = koreaDateStr.split("-");
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10);
  var d = parseInt(parts[2], 10);

  // Sakamoto 알고리즘으로 요일 계산 (0=일, 1=월, ... 6=토)
  var t = [0,3,2,5,0,3,5,1,4,6,2,4];
  var y2 = y;
  if (m < 3) y2 -= 1;
  var dow = (y2 + Math.floor(y2/4) - Math.floor(y2/100) + Math.floor(y2/400) + t[m-1] + d) % 7;

  var weekday = (dow === 0 ? 7 : dow); // 1=월, ..., 7=일

  // 해당 주 월요일 날짜 계산
  var dayOfMonday = d - (weekday - 1);
  var yearMonday = y;
  var monthMonday = m;

  if (dayOfMonday < 1) {
    monthMonday -= 1;
    if (monthMonday < 1) {
      monthMonday = 12;
      yearMonday -= 1;
    }
    var monthLengths = [
      31,
      ((yearMonday % 4 === 0 && yearMonday % 100 !== 0) || (yearMonday % 400 === 0)) ? 29 : 28,
      31,30,31,30,31,31,30,31,30,31
    ];
    dayOfMonday += monthLengths[monthMonday - 1];
  }

  var mmStr = (monthMonday < 10 ? "0" : "") + monthMonday;
  var ddStr = (dayOfMonday < 10 ? "0" : "") + dayOfMonday;
  var weekKey = yearMonday + "-" + mmStr + "-" + ddStr;

  return { weekKey: weekKey, weekday: weekday };
}

/**
 * 셀에 들어있는 weekKey (문자열/날짜)를 정규화해서 "YYYY-MM-DD" 로 변환
 */
function normalizeWeekKeyCell_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return formatDate_(value);
  }
  return value.toString().trim();
}

/**
 * 주간 출석 도장 찍기 + 상태 응답 (mode=attendance_weekly_stamp)
 *
 * - 시트 구조:
 *   A: user_id
 *   B: username
 *   C: week_key ("YYYY-MM-DD", 해당 주 월요일)
 *   D: 월
 *   E: 화
 *   F: 수
 *   G: 목
 *   H: 금
 *   I: 토
 *   J: 일
 *
 * - 응답 days: [일, 월, 화, 수, 목, 금, 토] (UI용)
 */
function attendanceWeeklyStamp_(data) {
  let userId = (data.user_id || "").toString().trim();
  let username = (data.username || "").toString().trim();

  if (!userId && username) {
    userId = resolveUserIdByName_(username);
  }

  if (!userId) {
    return jsonResponse_({ ok: false, error: "user_id가 필요합니다." });
  }

  const sheet = getSheet_(ATTEND_SHEET);
  const now = new Date();
  const meta = getWeekMeta_(now);
  const weekKey = meta.weekKey;
  const weekday = meta.weekday; // 1=월..7=일

  const lastRow = sheet.getLastRow();
  let rowIndex = -1;
  const dupRows = [];

  if (lastRow >= 2) {
    const range = sheet.getRange(2, 1, lastRow - 1, 10); // A:J
    const values = range.getValues();

    for (var i = 0; i < values.length; i++) {
      const row = values[i];
      const rowUserId = (row[0] || "").toString().trim();
      const rowWeek   = normalizeWeekKeyCell_(row[2]);

      if (rowUserId === userId && rowWeek === weekKey) {
        const actualRow = 2 + i;
        if (rowIndex === -1) {
          rowIndex = actualRow;
        } else {
          dupRows.push(actualRow);
        }
      }
    }

    if (rowIndex !== -1 && dupRows.length > 0) {
      const mainRowValues = sheet.getRange(rowIndex, 4, 1, 7).getValues()[0]; // D:J
      const mainDays = mainRowValues.map(function(v) {
        return (v || "").toString().trim();
      });

      dupRows.forEach(function(r) {
        const rowVals = sheet.getRange(r, 4, 1, 7).getValues()[0];
        for (var c = 0; c < 7; c++) {
          const val = (rowVals[c] || "").toString().trim();
          if (val && !mainDays[c]) {
            mainDays[c] = val;
          }
        }
      });

      sheet.getRange(rowIndex, 4, 1, 7).setValues([mainDays]);

      dupRows.sort(function(a, b) { return b - a; });
      dupRows.forEach(function(r) {
        sheet.deleteRow(r);
      });
    }
  }

  if (rowIndex === -1) {
    rowIndex = sheet.getLastRow() + 1;
    sheet.getRange(rowIndex, 1).setValue(userId);
    sheet.getRange(rowIndex, 2).setValue(username || "");
    sheet.getRange(rowIndex, 3).setValue(weekKey);
    sheet.getRange(rowIndex, 4, 1, 7).clearContent();
  }

  const rowDays = sheet.getRange(rowIndex, 4, 1, 7).getValues()[0].map(function(v) {
    return (v || "").toString().trim(); // [월,화,수,목,금,토,일]
  });

  const dayIndex = weekday - 1; // 0~6 (월~일)
  let stampedToday = false;

  if (!rowDays[dayIndex]) {
    rowDays[dayIndex] = "○";
    stampedToday = true;
  } else {
    stampedToday = true;
  }

  sheet.getRange(rowIndex, 4, 1, 7).setValues([rowDays]);

  // UI 용: [일, 월, 화, 수, 목, 금, 토] 로 재배열
  const uiDays = [
    rowDays[6], // 일 (J)
    rowDays[0], // 월 (D)
    rowDays[1], // 화
    rowDays[2], // 수
    rowDays[3], // 목
    rowDays[4], // 금
    rowDays[5]  // 토
  ];

  return jsonResponse_({
    ok: true,
    weekKey: weekKey,
    stampedToday: stampedToday,
    days: uiDays
  });
}

/**
 * 주간 출석 상태 조회 (mode=attendance_weekly_status)
 * - 응답 days: [일, 월, 화, 수, 목, 금, 토]
 */
function attendanceWeeklyStatus_(param) {
  let userId = (
    (param && param.user_id) ||
    (param && param.parameter && param.parameter.user_id) ||
    ""
  ).toString().trim();

  let username = (
    (param && (param.username || param.name)) ||
    (param && param.parameter && (param.parameter.username || param.parameter.name)) ||
    ""
  ).toString().trim();

  if (!userId && username) {
    userId = resolveUserIdByName_(username);
  }

  if (!userId) {
    return jsonResponse_({ ok: false, error: "user_id가 필요합니다." });
  }

  const sheet = getSheet_(ATTEND_SHEET);
  const now = new Date();
  const meta = getWeekMeta_(now);
  const weekKey = meta.weekKey;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({
      ok: true,
      weekKey: weekKey,
      days: ["", "", "", "", "", "", ""]
    });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 10); // A:J
  const values = range.getValues();

  // 내부 표현: [월,화,수,목,금,토,일]
  const internalDays = ["", "", "", "", "", "", ""];

  for (var i = 0; i < values.length; i++) {
    const row = values[i];
    const rowUserId = (row[0] || "").toString().trim();
    const rowWeek   = normalizeWeekKeyCell_(row[2]);

    if (rowUserId === userId && rowWeek === weekKey) {
      for (var d = 0; d < 7; d++) {
        const val = (row[3 + d] || "").toString().trim();
        if (val) {
          internalDays[d] = "○";
        }
      }
    }
  }

  const uiDays = [
    internalDays[6], // 일
    internalDays[0], // 월
    internalDays[1], // 화
    internalDays[2], // 수
    internalDays[3], // 목
    internalDays[4], // 금
    internalDays[5]  // 토
  ];

  return jsonResponse_({
    ok: true,
    weekKey: weekKey,
    days: uiDays
  });
}

/* ---------------------------------------------------
 * 5) 편지
 * ---------------------------------------------------
 */

function mailSend_(data) {
  let fromUserId = (data.from_user_id || "").toString().trim();
  const fromName   = (data.from_name || "").toString().trim();
  let   toUserId   = (data.to_user_id || "").toString().trim();
  const toName     = (data.to_name || "").toString().trim();
  const title      = (data.title || "").toString().trim();
  const content    = (data.content || "").toString().trim();

  if (!fromUserId && fromName) {
    fromUserId = resolveUserIdByName_(fromName);
  }

  if (!toUserId && toName) {
    toUserId = resolveUserIdByName_(toName);
  }

  if (!fromUserId || !toUserId || !title || !content) {
    return jsonResponse_({ ok: false, error: "받는 사람을 찾을 수 없거나 필수 항목이 비어 있습니다." });
  }

  const sheet = getSheet_(MAIL_SHEET);
  const now = new Date();
  const sentAt = formatDateTime_(now);

  const lastRow = sheet.getLastRow();
  const nextId = lastRow < 2 ? 1 : lastRow - 0;

  const letterId = "L" + nextId;

  sheet.appendRow([
    letterId,
    fromUserId,
    fromName,
    toUserId,
    toName,
    title,
    content,
    sentAt,
    "" // read_at
  ]);

  return jsonResponse_({ ok: true, letter_id: letterId, sent_at: sentAt });
}

function getMailList_(param) {
  let userId = (
    (param && param.user_id) ||
    (param && param.parameter && param.parameter.user_id) ||
    ""
  ).toString().trim();

  let username = (
    (param && (param.username || param.name)) ||
    (param && param.parameter && (param.parameter.username || param.parameter.name)) ||
    ""
  ).toString().trim();

  if (!userId && username) {
    userId = resolveUserIdByName_(username);
  }

  if (!userId) {
    return jsonResponse_({ ok: false, error: "user_id가 필요합니다." });
  }

  const sheet = getSheet_(MAIL_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({ ok: true, list: [] });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 9); // A:I
  const values = range.getValues();

  const list = [];
  for (var i = 0; i < values.length; i++) {
    const row = values[i];
    const letterId = (row[0] || "").toString().trim();
    const fromUserId = (row[1] || "").toString().trim();
    const fromName = (row[2] || "").toString().trim();
    const toUserId = (row[3] || "").toString().trim();
    const toName = (row[4] || "").toString().trim();
    const title = (row[5] || "").toString().trim();
    const content = (row[6] || "").toString().trim();
    const sentAt = (row[7] || "").toString().trim();
    const readAt = (row[8] || "").toString().trim();

    if (toUserId === userId) {
      list.push({
        letter_id: letterId,
        from_user_id: fromUserId,
        from_name: fromName,
        to_user_id: toUserId,
        to_name: toName,
        title: title,
        content: content,
        sent_at: sentAt,
        read_at: readAt
      });
    }
  }

  return jsonResponse_({ ok: true, list: list });
}

function mailRead_(data) {
  const letterId = (data.letter_id || "").toString().trim();
  if (!letterId) {
    return jsonResponse_({ ok: false, error: "letter_id가 필요합니다." });
  }

  const sheet = getSheet_(MAIL_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({ ok: false, error: "편지를 찾을 수 없습니다." });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 9); // A:I
  const values = range.getValues();
  const now = new Date();

  for (var i = 0; i < values.length; i++) {
    const row = values[i];
    const rowId = (row[0] || "").toString().trim();
    if (rowId === letterId) {
      const readAt = formatDateTime_(now);
      sheet.getRange(2 + i, 9).setValue(readAt); // I열
      break;
    }
  }

  return jsonResponse_({ ok: true });
}

function getMailCheck_(param) {
  let userId = (
    (param && param.user_id) ||
    (param && param.parameter && param.parameter.user_id) ||
    ""
  ).toString().trim();

  let username = (
    (param && (param.username || param.name)) ||
    (param && param.parameter && (param.parameter.username || param.parameter.name)) ||
    ""
  ).toString().trim();

  if (!userId && username) {
    userId = resolveUserIdByName_(username);
  }

  if (!userId) {
    return jsonResponse_({ ok: false, error: "user_id가 필요합니다." });
  }

  const sheet = getSheet_(MAIL_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({ ok: true, count: 0 });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 9); // A:I
  const values = range.getValues();

  let count = 0;
  for (var i = 0; i < values.length; i++) {
    const row = values[i];
    const toUserId = (row[3] || "").toString().trim();
    const readAt = (row[8] || "").toString().trim();
    if (toUserId === userId && !readAt) {
      count++;
    }
  }

  return jsonResponse_({ ok: true, count: count });
}

/* ---------------------------------------------------
 * 6) 게임 랭킹
 * ---------------------------------------------------
 */

function ensureGameSheetHeader_(sheet) {
  const headers = ["user_id", "username", "score", "rank"];
  const lastRow = sheet.getLastRow();

  // 새로 생성된 빈 랭킹 시트는 반드시 1행을 헤더로 예약합니다.
  if (lastRow < 1) {
    sheet.getRange(1, 1, 1, 4).setValues([headers]);
    return sheet;
  }

  // v9/v10에서 빈 시트에 첫 점수가 1행부터 기록된 적이 있다면 자동 복구합니다.
  // 기존 운영 시트의 한글/영문 헤더는 그대로 존중하고, 3열이 실제 숫자 점수인 경우만 데이터 행으로 판정합니다.
  const firstRow = sheet.getRange(1, 1, 1, 4).getValues()[0];
  const firstUserId = String(firstRow[0] || "").trim();
  const firstScoreText = String(firstRow[2] == null ? "" : firstRow[2]).trim();
  const firstRowLooksLikeData = !!firstUserId && firstScoreText !== "" && !isNaN(Number(firstScoreText));
  if (firstRowLooksLikeData) {
    sheet.insertRowsBefore(1, 1);
    sheet.getRange(1, 1, 1, 4).setValues([headers]);
  }
  return sheet;
}

function getGameSheetSafe_(gameName) {
  if (GAME_SHEETS.indexOf(gameName) === -1) {
    throw new Error("알 수 없는 게임 이름입니다: " + gameName);
  }
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(gameName);
  if (!sheet) {
    sheet = ss.insertSheet(gameName);
  }
  return ensureGameSheetHeader_(sheet);
}

function sortGameSheetAndReRank_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  /*
   * 사용자별 행은 하나만 유지합니다. 과거 동시 제출 등으로 중복 행이 생겼다면
   * 가장 높은 점수를 보존해 병합한 뒤 순위를 다시 매깁니다.
   */
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const users = {};
  values.forEach(function(row) {
    const userId = String(row[0] || "").trim();
    if (!userId) return;
    const username = String(row[1] || "").trim();
    const score = Math.max(0, Math.floor(Number(row[2]) || 0));
    const previous = users[userId];
    if (!previous || score > previous.score) {
      users[userId] = { userId: userId, username: username || (previous && previous.username) || "", score: score };
    } else if (!previous.username && username) {
      previous.username = username;
    }
  });

  const rows = Object.keys(users).map(function(userId) { return users[userId]; });
  rows.sort(function(a, b) {
    return b.score - a.score || String(a.userId).localeCompare(String(b.userId));
  });

  // 기존 데이터 영역을 먼저 비워 중복/삭제된 옛 행이 남지 않게 합니다.
  sheet.getRange(2, 1, lastRow - 1, 4).clearContent();
  if (!rows.length) return;
  const ranked = rows.map(function(row, index) {
    return [row.userId, row.username, row.score, index + 1];
  });
  sheet.getRange(2, 1, ranked.length, 4).setValues(ranked);
}

function getGameUserRank_(sheet, userId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === String(userId || "").trim()) {
      return Number(values[i][3]) || (i + 1);
    }
  }
  return null;
}

function gameUpdateScore_(data) {
  const gameName = (data.game_name || data.game || "").toString().trim();
  let userId   = (data.user_id || "").toString().trim();
  const username = (data.username || data.nickname || "").toString().trim();
  const scoreRaw = (data.score || data.point || data.best_score || "").toString().trim();

  if (!userId && username) {
    userId = resolveUserIdByName_(username);
  }

  if (!gameName || !userId || !scoreRaw) {
    return jsonResponse_({
      ok: false,
      error: "game_name, user_id, score는 필수입니다."
    });
  }

  const newScore = Number(scoreRaw);
  if (!Number.isFinite(newScore) || newScore < 0 || Math.floor(newScore) !== newScore) {
    return jsonResponse_({ ok: false, error: "score는 0 이상의 유한한 정수여야 합니다." });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return jsonResponse_({ ok: false, error: "GAME_SCORE_BUSY" });
  }
  try {
    let sheet;
    try {
      sheet = getGameSheetSafe_(gameName);
    } catch (err) {
      return jsonResponse_({ ok: false, error: String(err) });
    }

    // 기존 중복 행이 있으면 먼저 사용자별 최고점수 한 행으로 정리합니다.
    sortGameSheetAndReRank_(sheet);

    const lastRow = sheet.getLastRow();
    let rowIndex = -1;

    if (lastRow >= 2) {
      const range = sheet.getRange(2, 1, lastRow - 1, 4);
      const values = range.getValues();
      for (var i = 0; i < values.length; i++) {
        const row = values[i];
        const rowUserId = (row[0] || "").toString().trim();
        if (rowUserId === userId) {
          rowIndex = 2 + i;
          break;
        }
      }
    }

    if (rowIndex === -1) {
      rowIndex = sheet.getLastRow() + 1;
      sheet.getRange(rowIndex, 1, 1, 3).setValues([[userId, username || "", newScore]]);
    } else {
      const currentScore = Number(sheet.getRange(rowIndex, 3).getValue()) || 0;
      if (newScore > currentScore) {
        sheet.getRange(rowIndex, 3).setValue(newScore);
      }
      if (username) sheet.getRange(rowIndex, 2).setValue(username);
    }

    sortGameSheetAndReRank_(sheet);
    return jsonResponse_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function gameRanking_(param) {
  const gameName = (
    (param && param.game_name) ||
    (param && param.game) ||
    ""
  ).toString().trim();

  if (!gameName) {
    return jsonResponse_({
      ok: false,
      error: "game_name이 필요합니다."
    });
  }

  let limit = Number(
    (param && param.limit) ||
    (param && param.parameter && param.parameter.limit) ||
    GAME_RANK_LIMIT_DEFAULT
  );
  if (isNaN(limit) || limit <= 0) {
    limit = GAME_RANK_LIMIT_DEFAULT;
  }

  let sheet;
  try {
    sheet = getGameSheetSafe_(gameName);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return jsonResponse_({
      ok: true,
      game_name: gameName,
      list: []
    });
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 4);
  const values = range.getValues();

  const list = [];
  for (var i = 0; i < values.length && list.length < limit; i++) {
    const row = values[i];
    const userId = (row[0] || "").toString().trim();
    const username = (row[1] || "").toString().trim();
    const score = Number(row[2]) || 0;
    const rank = Number(row[3]) || (i + 1);

    list.push({
      user_id: userId,
      username: username,
      score: score,
      rank: rank
    });
  }

  return jsonResponse_({
    ok: true,
    game_name: gameName,
    list: list
  });
}

function gameBestStatus_(param) {
  let userId = (
    (param && param.user_id) ||
    (param && param.parameter && param.parameter.user_id) ||
    ""
  ).toString().trim();

  let username = (
    (param && (param.username || param.name)) ||
    (param && param.parameter && (param.parameter.username || param.parameter.name)) ||
    ""
  ).toString().trim();

  if (!userId && username) {
    userId = resolveUserIdByName_(username);
  }

  if (!userId) {
    return jsonResponse_({
      ok: false,
      error: "user_id가 필요합니다."
    });
  }

  const results = [];
  let best = null;

  GAME_SHEETS.forEach(function(gameName) {
    try {
      const sheet = getGameSheetSafe_(gameName);
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return;

      const range = sheet.getRange(2, 1, lastRow - 1, 4);
      const values = range.getValues();

      for (var i = 0; i < values.length; i++) {
        const row = values[i];
        const rowUserId = (row[0] || "").toString().trim();
        if (rowUserId === userId) {
          const score = Number(values[i][2]) || 0;
          const rank = Number(values[i][3]) || null;

          const info = {
            game_name: gameName,
            score: score,
            rank: rank
          };
          results.push(info);

          if (rank && (!best || rank < best.rank)) {
            best = {
              game_name: gameName,
              score: score,
              rank: rank
            };
          }
          break;
        }
      }
    } catch (err) {
      Logger.log("gameBestStatus_ error on sheet " + gameName + ": " + err);
    }
  });

  return jsonResponse_({
    ok: true,
    user_id: userId,
    best: best,
    games: results
  });
}
