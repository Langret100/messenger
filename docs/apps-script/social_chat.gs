/**
 * social_chat.gs - 소통 채팅 전용 Apps Script 모듈
 * ------------------------------------------------
 * - Web Ghost 프론트엔드의 js/social-chat-firebase.js 와 연동됩니다.
 * - postToSheet({ mode: "social_chat", user_id, nickname, message, ts }) 로 들어온
 *   데이터를 '소통' 시트에 기록합니다.
 *
 * [연동 방법]
 * 1) 기존 Apps Script 프로젝트에 이 파일 내용을 그대로 추가합니다.
 * 2) 기존 doPost(e) 함수 안에 아래 분기를 추가합니다.
 *
 *    var data = e.parameter || {};
 *    var mode = (data.mode || "").toString();
 *    if (mode === "social_chat") {
 *      return handleSocialChatPost_(data);
 *    }
 *
 *    // 나머지 mode 분기는 기존 코드 유지
 *
 * 3) 시간 기반 트리거를 추가합니다.
 *    - 함수: cleanupSocialChatSheet
 *    - 주기: 15분/30분/1시간 등 편한 주기로 실행
 *
 * [시트 구조]
 * - 시트 이름: '소통'
 * - 헤더: user_id | username | date | chatlog
 * - 데이터: 위 순서대로 값 기록
 */

var SOCIAL_CHAT_SHEET_NAME = "소통";

function handleSocialChatPost_(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOCIAL_CHAT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SOCIAL_CHAT_SHEET_NAME);
    initSocialChatHeader_(sheet);
  }

  if (sheet.getLastRow() === 0) {
    initSocialChatHeader_(sheet);
  }

  var ts = Number(data.ts) || Date.now();
  var userId = (data.user_id || "").toString();
  var nickname = (data.nickname || "").toString();
  var message = (data.message || "").toString();

  sheet.appendRow([
    userId,
    nickname,
    new Date(ts),
    message
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

function initSocialChatHeader_(sheet) {
  var headers = ["user_id", "username", "date", "chatlog"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

/**
 * 시간 기반 트리거로 실행되는 정리 함수
 * - 조건: (실제 메시지 행 수 > 100) AND (마지막 메시지 이후 1시간 이상 경과)
 * - 동작: 헤더를 제외한 모든 메시지 행 삭제
 */
function cleanupSocialChatSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOCIAL_CHAT_SHEET_NAME);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return; // 헤더만 있거나 완전히 비어 있는 경우
  }

  var dataRows = lastRow - 1;
  if (dataRows <= 100) {
    return; // 100개 이하인 경우 정리하지 않음
  }

  // date 컬럼은 C열(3번째 열)에 저장
  var lastTime = sheet.getRange(lastRow, 3).getValue();
  if (!(lastTime instanceof Date)) {
    return;
  }

  var now = new Date();
  var diffMs = now.getTime() - lastTime.getTime();
  var diffHours = diffMs / (1000 * 60 * 60);

  if (diffHours < 1) {
    return; // 마지막 메시지 이후 1시간이 지나지 않음
  }

  // 헤더(1행)를 제외한 모든 메시지 행 삭제
  sheet.deleteRows(2, dataRows);
}


/**
 * 최근 소통 메시지 조회
 * - postToSheet({ mode: "social_recent", limit: 5 }) 형태로 호출
 * - 최신 메시지부터 최대 limit개까지 반환
 */
function handleSocialRecentPost_(data) {
  var limit = Number(data.limit) || 5;
  if (limit < 1) limit = 1;
  if (limit > 100) limit = 100;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SOCIAL_CHAT_SHEET_NAME);
  if (!sheet) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, messages: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, messages: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var totalRows = lastRow - 1;
  var numRows = Math.min(limit, totalRows);
  var startRow = lastRow - numRows + 1;

  var values = sheet.getRange(startRow, 1, numRows, 4).getValues();
  var messages = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var dt = row[2];
    var ts = (dt instanceof Date) ? dt.getTime() : null;
    messages.push({
      user_id: String(row[0] || ""),
      nickname: String(row[1] || ""),
      ts: ts,
      message: String(row[3] || "")
    });
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, messages: messages }))
    .setMimeType(ContentService.MimeType.JSON);
}
