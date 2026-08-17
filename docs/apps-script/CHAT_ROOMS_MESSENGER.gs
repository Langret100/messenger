/* ============================================================
   [CHAT_ROOMS_MESSENGER.gs] "대화방" 탭(가로 컬럼) 기반 다중 대화방 관리
   ------------------------------------------------------------
   - 목적: 메신저에서  여러 대화방을 만들고, 초대된 사람끼리만 대화
   - 저장 위치: 스프레드시트 탭 이름을 '대화방' 으로 만들면, 한 탭에서 컬럼(가로)로 방을 관리
     * 각 대화방 = 1개 컬럼
     * 방 메타(1~5행) + 메시지(6행~) 를 아래로 쌓음

   [시트 구조(권장)]
   - 1행: room_id
   - 2행: room_name
   - 3행: participants (쉼표로 구분, 비워두면 공개방)
   - 4행: created_at (epoch ms)
   - 5행: password (선택, 비워두면 초대자만 입장)
   - 6행~: message JSON (한 셀에 1개) (한 셀에 1개)
     예) {"ts":1700000000000,"nickname":"홍길동","user_id":"...","text":"안녕"}

   [WebApp 연동(기존 doPost에 추가할 mode)]
   - social_rooms        : 내 대화방 목록
   - social_room_create  : 대화방 생성(닉네임 초대)
   - social_room_leave   : 대화방 나가기
   - social_recent_room  : 방별 최근 메시지 읽기
   - social_chat_room    : 방별 메시지 기록(텍스트/[[IMG]]/[[FILE]] 토큰 포함)

   ------------------------------------------------------------
   ※ 이 파일은 "예시/추가 모듈"입니다.
   기존 WebApp(doPost)에서 mode를 분기하여 아래 handler를 호출하도록 붙여주세요.
   예:
     var mode = (e && e.parameter && e.parameter.mode) || "";
     if (mode === "social_rooms") return json_(socialRooms_list_(e.parameter));
     ...
   ============================================================ */



// ====== 설정 ======
var WG_CHATROOMS_MAX_TOTAL = 30; // 전체 대화방 최대 개수(시스템 전체)
var WG_CHATROOMS_CACHE_TTL_SEC = 10; // 방 목록 메타 캐시(초) - 반복 호출 시 시트 읽기 감소
var WG_CHATROOMS_CACHE_KEY = "WG_CHATROOMS_META_v1";


// ------------------------------------------------------------
// [기본 전체 대화방: room_id='global']
// - 별도 시트 탭 '소통'에 행(row) 형태로 저장됩니다.
// - 나가기 불가(삭제/탈퇴 불가)
// - 비밀번호/멤버십 개념 없이 누구나 읽기/쓰기 가능(프론트 정책에 따름)
// ------------------------------------------------------------
function socialRooms_getSpreadsheet_() {
  // 라우터(gs)에서 SHEET_ID 상수가 있을 수 있으므로 우선 사용
  try {
    if (typeof SHEET_ID !== "undefined" && SHEET_ID) return SpreadsheetApp.openById(SHEET_ID);
  } catch (e0) {}
  return SpreadsheetApp.getActiveSpreadsheet();
}

function socialRooms_getGlobalSheet_() {
  var ss = socialRooms_getSpreadsheet_();
  var sh = ss.getSheetByName("소통");
  if (!sh) sh = ss.insertSheet("소통");
  return sh;
}

// '소통' 시트는 A:user_id, B:nickname, C:date, D:chatlog 구조를 권장합니다.



function socialRooms_ensureSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("대화방");
  if (!sh) sh = ss.insertSheet("대화방");

  // ✅ 빠른 스킵: 이미 B열 시작 레이아웃이면(라벨/메시지 마커 확인) 정리 로직을 건너뜀
  var key = "WG_CHATROOM_LAYOUT_V3";
  var props = PropertiesService.getDocumentProperties();

  var a1 = String(sh.getRange(1, 1).getValue() || "").trim().toLowerCase();
  var a6 = String(sh.getRange(6, 1).getValue() || "").trim().toLowerCase();
  if (a1 === "room_id" && a6.indexOf("messages") >= 0) {
    // 레이아웃이 이미 정리된 것으로 판단되면 바로 반환
    if (props.getProperty(key) === "1") return sh;
    // 처음 1번만 플래그 저장(다음 호출부터 완전 스킵)
    props.setProperty(key, "1");
    return sh;
  }

  // 플래그가 있었는데 레이아웃이 망가진 경우(수동 편집 등) → 다시 정리
  props.deleteProperty(key);

  // ✅ 목표 구조
  // - A열: 라벨(세로)
  // - B열~: 방 1개 = 1컬럼(가로)
  // - 1~5행: 메타, 6행: '--- messages ---' 라벨, 7행~: 메시지 JSON

  // 1) 라벨열 정렬
  //    - A1이 room_id면 OK
  //    - A열이 비어있고 B1이 room_id면 A열 삭제로 복구(빈 A열 제거)
  //    - 그 외: A열 라벨 확보를 위해 1열 삽입(기존 방 컬럼은 B로 이동)
  var b1 = String(sh.getRange(1, 2).getValue() || "").trim().toLowerCase();
  if (a1 !== "room_id") {
    if (!a1 && b1 === "room_id") {
      sh.deleteColumn(1);
    } else {
      sh.insertColumnBefore(1);
    }
  }

  // 2) 라벨열(A열) 세팅(필요할 때만)
  var labels = ["room_id", "title", "members", "created_at", "password", "--- messages ---"];
  var current = sh.getRange(1, 1, labels.length, 1).getValues().map(function(r){ return String(r[0]||"").trim(); });
  var needWrite = false;
  for (var i=0;i<labels.length;i++){
    if (current[i] !== labels[i]) { needWrite = true; break; }
  }
  if (needWrite) {
    sh.getRange(1, 1, labels.length, 1).setValues(labels.map(function(v){ return [v]; }));
  }

  // 3) 최소 2열 확보(방은 B열부터)
  if (sh.getMaxColumns() < 2) {
    sh.insertColumnsAfter(sh.getMaxColumns(), 2 - sh.getMaxColumns());
  }

  // 4) ⚠️ 주의: 'global'(전체 대화방)은 '소통' 탭에 따로 존재하므로, '대화방' 탭에 global 컬럼이 남아있다면 1회 정리 시 삭제합니다.
  socialRooms_removeGlobalCols_(sh);

  props.setProperty(key, "1");
  return sh;
}


/**
 * 대화방 시트에서 room_id가 'global'인 컬럼이 있으면 모두 삭제
 */
function socialRooms_removeGlobalCols_(sh) {
  var startCol = 2;
  var lastCol = Math.max(startCol, sh.getLastColumn());
  var width = lastCol - startCol + 1;
  if (width < 1) return;

  var ids = sh.getRange(1, startCol, 1, width).getValues()[0];

  // 오른쪽부터 삭제(인덱스 꼬임 방지)
  for (var i = ids.length - 1; i >= 0; i--) {
    var id = String(ids[i] || "").trim();
    if (id === "global") {
      sh.deleteColumn(startCol + i);
    }
  }
}



/**
 * 대화방 시트에서 room_id가 'global'인 컬럼이 있으면 모두 삭제
 */






function socialRooms_startCol_(sh) {
  // A열은 라벨 고정, 방은 B열부터
  return 2;
}






function socialRooms_findColById_(sh, roomId) {
  roomId = String(roomId || "").trim();
  if (!roomId) return -1;
  var startCol = socialRooms_startCol_(sh);
  var lastCol = Math.max(startCol, sh.getLastColumn());
  var ids = sh.getRange(1, startCol, 1, lastCol - startCol + 1).getValues()[0];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i] || "").trim() === roomId) return startCol + i;
  }
  return -1;
}



function socialRooms_nextEmptyCol_(sh) {
  var startCol = socialRooms_startCol_(sh);
  var lastCol = Math.max(startCol, sh.getLastColumn());
  var width = lastCol - startCol + 1;
  if (width < 1) return startCol;

  var ids = sh.getRange(1, startCol, 1, width).getValues()[0];
  for (var i = 0; i < ids.length; i++) {
    if (!String(ids[i] || "").trim()) return startCol + i;
  }
  return lastCol + 1;
}



function socialRooms_parseMembers_(raw) {
  var s = String(raw || "").trim();
  var isPublic = false;
  if (s.indexOf("public|") === 0) {
    isPublic = true;
    s = s.slice("public|".length);
  }
  var list = [];
  if (s) {
    list = s.split(",").map(function (x) { return String(x || "").trim(); })
      .filter(function (x) { return !!x; });
  }
  return { is_public: isPublic, members: list };
}

function socialRooms_formatMembers_(isPublic, members) {
  var arr = Array.isArray(members) ? members : [];
  var s = arr.map(function (x) { return String(x || "").trim(); })
    .filter(function (x) { return !!x; })
    .join(",");
  return (isPublic ? "public|" : "") + s;
}


function socialRooms_getCreator_(raw) {
  var info = socialRooms_parseMembers_(raw);
  return (info.members && info.members.length) ? String(info.members[0] || "").trim() : "";
}



function socialRooms_countRoomsByCreator_(sh, creator) {
  creator = String(creator || "").trim();
  if (!creator) return 0;

  var startCol = socialRooms_startCol_(sh);
  var lastCol = sh.getLastColumn();
  if (lastCol < startCol) return 0;

  var width = lastCol - startCol + 1;

  // ✅ 1회 호출로 id + members 읽기
  var meta = sh.getRange(1, startCol, 3, width).getValues();
  var ids = meta[0];
  var members = meta[2];

  var count = 0;
  for (var c = 0; c < width; c++) {
    var id = String(ids[c] || "").trim();
    if (!id || id === "global") continue;
    var who = socialRooms_getCreator_(members[c]);
    if (who && who === creator) count++;
  }
  return count;
}



function socialRooms_countRoomsTotal_(sh) {
  var startCol = socialRooms_startCol_(sh); // 2
  var lastCol = sh.getLastColumn();
  if (lastCol < startCol) return 0;
  var width = lastCol - startCol + 1;
  var ids = sh.getRange(1, startCol, 1, width).getValues()[0];
  var n = 0;
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i] || "").trim()) n++;
  }
  return n;
}


function socialRooms_isMember_(members, nickname) {
  var arr = Array.isArray(members) ? members : [];
  nickname = String(nickname || "").trim();
  if (!nickname) return false;
  for (var i = 0; i < arr.length; i++) {
    if (String(arr[i] || "").trim() === nickname) return true;
  }
  return false;
}







function socialRooms_getMetaCached_(sh) {
  var cache = CacheService.getDocumentCache();
  var cached = cache.get(WG_CHATROOMS_CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }

  var startCol = socialRooms_startCol_(sh); // 항상 2(B열)
  var lastCol = sh.getLastColumn();
  if (lastCol < startCol) {
    var empty = { width: 0, ids: [], titles: [], members: [], created: [], pwds: [] };
    cache.put(WG_CHATROOMS_CACHE_KEY, JSON.stringify(empty), WG_CHATROOMS_CACHE_TTL_SEC);
    return empty;
  }

  var width = lastCol - startCol + 1;
  var meta = sh.getRange(1, startCol, 5, width).getValues();
  var obj = {
    width: width,
    ids: meta[0],
    titles: meta[1],
    members: meta[2],
    created: meta[3],
    pwds: meta[4]
  };
  cache.put(WG_CHATROOMS_CACHE_KEY, JSON.stringify(obj), WG_CHATROOMS_CACHE_TTL_SEC);
  return obj;
}

function socialRooms_invalidateMetaCache_() {
  try { CacheService.getDocumentCache().remove(WG_CHATROOMS_CACHE_KEY); } catch (e) {}
}


function socialRooms_list_(p) {
  var sh = socialRooms_ensureSheet_();
  var nick = String((p && p.nickname) || "").trim();

  // 기본 전체 대화방(global) - '소통' 탭 사용, 나가기 불가
  var rooms = [{
    room_id: "global",
    name: "전체 대화방",
    is_public: true,
    has_password: false,
    creator: "",
    participants: [],
    members_count: 0,
    enter_mode: "public",
    enter: "public",
    can_leave: false,
    is_global: true
  }];


  // ✅ 방 메타(1~5행)만 읽기: 캐시 우선(반복 호출 시 시트 I/O 최소화)
  var metaObj = socialRooms_getMetaCached_(sh);
  if (!metaObj.width) return { ok: true, rooms: [] };

  var ids = metaObj.ids;
  var titles = metaObj.titles;
  var members = metaObj.members;
  var pwds = metaObj.pwds;
  var width = metaObj.width;

  for (var c = 0; c < width; c++) {
    var id = String(ids[c] || "").trim();
    if (!id || id === "global") continue;

    var name = String(titles[c] || "").trim() || "대화방";
    var savedPwd = String(pwds[c] || "").trim();
    var hasPwd = !!savedPwd;

    var rawMembers = members[c];
    var info = socialRooms_parseMembers_(rawMembers);

    // ✅ 공개방 판정: 비번이 없으면 모두 공개방
    var isPublic = !hasPwd;

    // ✅ 초대(멤버)방 기능 제거: public 또는 password만
    var enterMode = hasPwd ? "password" : "public";
rooms.push({
      room_id: id,
      name: name,
      is_public: isPublic,
      has_password: hasPwd,
      creator: socialRooms_getCreator_(rawMembers) || "",
      participants: info.members,
      members_count: info.members.length,
      enter_mode: enterMode,
      enter: enterMode,
      can_leave: true
    });
  }

  return { ok: true, rooms: rooms };
}








function socialRooms_create_(p) {
  var sh = socialRooms_ensureSheet_();
  var creator = String((p && p.nickname) || "").trim();
  if (!creator) return { ok: false, error: "닉네임이 필요해요." };

  var pwd = String((p && p.password) || "").trim();

  // ✅ 방 제목: 프론트가 room_name/title 둘 다 보낼 수 있음
  var name = String(((p && (p.title || p.room_name || p.roomTitle || p.name)) ) || "").trim();
  if (!name) name = creator + (pwd ? "의 비밀방" : "의 공개방");

  // ✅ members 셀: 공개방은 public| 접두어 + 생성자 포함(최소 1명)
  //   - 비번방은 생성자를 첫 멤버로 등록
  var membersCell = pwd ? creator : ("public|" + creator);

  var roomId = "r_" + Utilities.getUuid().replace(/-/g, "").slice(0, 12);

  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    // ✅ 전체 대화방 개수 제한(시스템 전체)
    var total = socialRooms_countRoomsTotal_(sh);
    if (total >= WG_CHATROOMS_MAX_TOTAL) {
      return { ok: false, error: "생성불가: 대화방은 최대 " + WG_CHATROOMS_MAX_TOTAL + "개까지 만들 수 있어요." };
    }

    var col = socialRooms_nextEmptyCol_(sh);

    if (col > sh.getMaxColumns()) {
      sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
    }

    sh.getRange(1, col).setValue(roomId);
    sh.getRange(2, col).setValue(name);
    sh.getRange(3, col).setValue(membersCell);
    sh.getRange(4, col).setValue(Date.now());
    sh.getRange(5, col).setValue(pwd);

    // lastRow 캐시 초기화(메시지는 7행부터)
    try {
      var props = PropertiesService.getDocumentProperties();
      props.setProperty("WG_LASTROW_" + roomId, String(6));
    } catch (e0) {}
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }

  socialRooms_invalidateMetaCache_();
  return { ok: true, room_id: roomId, name: name };
}



function socialRooms_leave_(p) {
  var sh = socialRooms_ensureSheet_();
  var roomId = String((p && p.room_id) || "").trim();
  var nick = String((p && p.nickname) || "").trim();

  if (!roomId) return { ok: false, error: "room_id가 없어요." };
  if (roomId === "global") return { ok: false, error: "전체 대화방은 나갈 수 없어요." };
  if (!nick) return { ok: false, error: "닉네임이 필요해요." };

  var col = socialRooms_findColById_(sh, roomId);
  if (col < 1) return { ok: false, error: "대화방을 찾지 못했어요." };

  var savedPwd = String(sh.getRange(5, col).getValue() || "").trim();
  var hasPwd = !!savedPwd;
  var isPublic = !hasPwd;
var rawMembers = sh.getRange(3, col).getValue();
  var info = socialRooms_parseMembers_(rawMembers);
// 멤버 리스트에서 제거
  var next = [];
  for (var i = 0; i < info.members.length; i++) {
    if (String(info.members[i] || "").trim() !== nick) next.push(info.members[i]);
  }

  // ✅ 사용자가 남아있지 않으면 전체삭제(방 컬럼 삭제)
  if (next.length === 0) {
    sh.deleteColumn(col);
    try {
      var props = PropertiesService.getDocumentProperties();
      props.deleteProperty("WG_LASTROW_" + roomId);
    } catch (e0) {}
    socialRooms_invalidateMetaCache_();
    return { ok: true, deleted: true };
  }

  // 남아있으면 members 갱신
  sh.getRange(3, col).setValue(socialRooms_formatMembers_(isPublic, next));
  socialRooms_invalidateMetaCache_();
  return { ok: true, deleted: false };
}




function socialRooms_recent_(p) {
  var sh = socialRooms_ensureSheet_();
  var roomId = String((p && p.room_id) || "").trim();
  var nick = String((p && p.nickname) || "").trim();
  var limit = Math.min(30, Math.max(1, parseInt((p && p.limit) || "30", 10)));

  if (!roomId) return { ok: true, messages: [] };
  if (roomId === "global") {
    // '소통' 탭에서 최근 limit개만 읽기(행 기반)
    var gsh = socialRooms_getGlobalSheet_();
    var last = gsh.getLastRow();
    if (last < 2) return { ok: true, messages: [] };

    var start = Math.max(2, last - limit + 1);
    var rows = last - start + 1;
    var vals = gsh.getRange(start, 1, rows, 4).getValues();

    var msgs = [];
    for (var i = 0; i < vals.length; i++) {
      var userId2 = String(vals[i][0] || "").trim();
      var nick2 = String(vals[i][1] || "").trim() || "익명";
      var dt = vals[i][2];
      var ts2 = Date.now();
      try {
        if (dt && Object.prototype.toString.call(dt) === "[object Date]") ts2 = dt.getTime();
        else if (typeof dt === "number") ts2 = dt;
        else if (dt) ts2 = new Date(dt).getTime();
      } catch (eDt) {}
      var text2 = String(vals[i][3] || "");
      if (!text2) continue;
      msgs.push({ ts: ts2, nickname: nick2, user_id: userId2, text: text2 });
    }
    return { ok: true, messages: msgs };
  }

  var col = socialRooms_findColById_(sh, roomId);
  if (col < 1) return { ok: true, messages: [] };

  var savedPwd = String(sh.getRange(5, col).getValue() || "").trim();
  var hasPwd = !!savedPwd;

  var info = socialRooms_parseMembers_(sh.getRange(3, col).getValue());
  var isPublic = !hasPwd;
  var isMember = isPublic ? true : socialRooms_isMember_(info.members, nick);

  if (!isMember) return { ok: false, error: "멤버만 볼 수 있어요." };

  var MESSAGE_START_ROW = 7;

  // ✅ 컬럼별 lastRow 캐시 사용(속도)
  var props = PropertiesService.getDocumentProperties();
  var key = "WG_LASTROW_" + roomId;
  var lastRow = parseInt(props.getProperty(key) || "0", 10) || 0;

  if (lastRow < MESSAGE_START_ROW) {
    var first = sh.getRange(MESSAGE_START_ROW, col).getValue();
    if (!String(first || "").trim()) {
      return { ok: true, messages: [] };
    }
    var lastCell = sh.getRange(MESSAGE_START_ROW, col).getNextDataCell(SpreadsheetApp.Direction.DOWN);
    lastRow = lastCell.getRow();
    props.setProperty(key, String(lastRow));
  }

  var available = lastRow - MESSAGE_START_ROW + 1;
  if (available < 1) return { ok: true, messages: [] };

  // 마지막 근처만 읽기
  var readRows = Math.min(available, (limit * 2) + 50);
  var readStart = lastRow - readRows + 1;

  var values = sh.getRange(readStart, col, readRows, 1).getValues();

  var messages = [];
  for (var i = values.length - 1; i >= 0 && messages.length < limit; i--) {
    var raw = values[i][0];
    if (!String(raw || "").trim()) continue;
    try {
      var obj = JSON.parse(String(raw));
      messages.push(obj);
    } catch (e) {}
  }

  messages.reverse();
  return { ok: true, messages: messages };
}





function socialRooms_log_(p) {
  var sh = socialRooms_ensureSheet_();
  var roomId = String((p && p.room_id) || "").trim();
  var nick = String((p && p.nickname) || "").trim() || "익명";
  var userId = String((p && p.user_id) || "").trim();
  var text = String((p && p.message) || (p && p.text) || "").trim();
  var ts = parseInt((p && p.ts) || String(Date.now()), 10) || Date.now();

  if (!roomId) return { ok: false, error: "room_id가 없어요." };
  if (roomId === "global") {
    if (!text) return { ok: false, error: "내용이 없어요." };
    var gsh2 = socialRooms_getGlobalSheet_();
    var row = gsh2.getLastRow() + 1;
    // A:user_id, B:nickname, C:date, D:chatlog
    gsh2.getRange(row, 1, 1, 4).setValues([[userId, nick, new Date(ts), text]]);
    return { ok: true };
  }
  if (!text) return { ok: false, error: "내용이 없어요." };

  var col = socialRooms_findColById_(sh, roomId);
  if (col < 1) return { ok: false, error: "대화방을 찾지 못했어요." };

  var savedPwd = String(sh.getRange(5, col).getValue() || "").trim();
  var hasPwd = !!savedPwd;

  var info = socialRooms_parseMembers_(sh.getRange(3, col).getValue());
  var isPublic = !hasPwd;
  var isMember = isPublic ? true : socialRooms_isMember_(info.members, nick);

  if (!isMember) return { ok: false, error: "멤버만 대화할 수 있어요." };

  var payload = JSON.stringify({ ts: ts, nickname: nick, user_id: userId, text: text });

  var lock = LockService.getDocumentLock();
  lock.waitLock(20000);

  var MESSAGE_START_ROW = 7;
  try {
    var props = PropertiesService.getDocumentProperties();
    var key = "WG_LASTROW_" + roomId;
    var lastRow = parseInt(props.getProperty(key) || "0", 10) || 0;

    var writeRow = MESSAGE_START_ROW;

    if (lastRow >= MESSAGE_START_ROW) {
      // 캐시가 가리키는 행이 비어있으면 그 행부터, 아니면 다음 행
      var v = sh.getRange(lastRow, col).getValue();
      writeRow = String(v || "").trim() ? (lastRow + 1) : lastRow;
    } else {
      // 초기 1회만 nextDataCell로 마지막 행 찾기
      var first = sh.getRange(MESSAGE_START_ROW, col).getValue();
      if (!String(first || "").trim()) {
        writeRow = MESSAGE_START_ROW;
      } else {
        var lastCell = sh.getRange(MESSAGE_START_ROW, col).getNextDataCell(SpreadsheetApp.Direction.DOWN);
        writeRow = lastCell.getRow() + 1;
      }
    }

    sh.getRange(writeRow, col).setValue(payload);
    props.setProperty(key, String(writeRow));
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }

  return { ok: true };
}






/**
 * (도우미) 기존 doPost에서 mode를 분기해 호출하세요.
 * - p는 e.parameter 를 그대로 넘기면 됩니다.
 */

function socialRooms_enter_(p) {
  var sh = socialRooms_ensureSheet_();
  var roomId = String((p && p.room_id) || "").trim();
  var nick = String((p && p.nickname) || "").trim();
  var pwd = String((p && p.password) || "").trim();

  if (!roomId) return { ok: false, error: "room_id가 없어요." };
  if (roomId === "global") return { ok: true, room_id: "global", entered: true, is_member: true, needs_password: false };
  if (!nick) return { ok: false, error: "닉네임이 필요해요." };

  var col = socialRooms_findColById_(sh, roomId);
  if (col < 1) return { ok: false, error: "대화방을 찾지 못했어요." };

  var savedPwd = String(sh.getRange(5, col).getValue() || "").trim();
  var hasPwd = !!savedPwd;

  var rawMembers = sh.getRange(3, col).getValue();
  var info = socialRooms_parseMembers_(rawMembers);

  // 레거시 공개방(빈 members + 비번 없음)도 공개방으로 취급
  var isPublic = !hasPwd;

  // 이미 멤버면 OK(비번방도 재입력 불필요)
  if (socialRooms_isMember_(info.members, nick)) {
    return { ok: true, room_id: roomId, entered: true, is_member: true, needs_password: false };
  }

  // 비번방: 멤버가 아니면 비번 확인 후 멤버 등록
  if (hasPwd) {
    if (!pwd || pwd !== savedPwd) return { ok: false, error: "비밀번호가 맞지 않아요." };

    var lock = LockService.getDocumentLock();
    lock.waitLock(20000);
    try {
      var curInfo = socialRooms_parseMembers_(sh.getRange(3, col).getValue());
      var curList = curInfo.members;
      if (!socialRooms_isMember_(curList, nick)) curList.push(nick);
      sh.getRange(3, col).setValue(socialRooms_formatMembers_(false, curList));
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    socialRooms_invalidateMetaCache_();
    return { ok: true, room_id: roomId, entered: true, is_member: true, needs_password: false };
  }

  // 공개방: 입장 즉시 멤버 등록(삭제 조건/입장 기록용)
  if (isPublic) {
    var lock2 = LockService.getDocumentLock();
    lock2.waitLock(20000);
    try {
      var curInfo2 = socialRooms_parseMembers_(sh.getRange(3, col).getValue());
      var curList2 = curInfo2.members;

      if (!socialRooms_isMember_(curList2, nick)) curList2.push(nick);

      // 공개방 마커 유지(레거시는 여기서 public|로 승격)
      sh.getRange(3, col).setValue(socialRooms_formatMembers_(true, curList2));
    } finally {
      try { lock2.releaseLock(); } catch (e2) {}
    }

    socialRooms_invalidateMetaCache_();
    return { ok: true, room_id: roomId, entered: true, is_member: true, needs_password: false };
  }
  return { ok: true, room_id: roomId, entered: true, is_member: true, needs_password: false };
}




function socialRooms_handleMode_(p) {
  var mode = String((p && p.mode) || "");
  if (mode === "social_rooms") return socialRooms_list_(p);
  if (mode === "social_room_create") return socialRooms_create_(p);
  if (mode === "social_room_leave") return socialRooms_leave_(p);
  if (mode === "social_room_enter") return socialRooms_enter_(p);
  if (mode === "social_recent_room") return socialRooms_recent_(p);
  if (mode === "social_chat_room") return socialRooms_log_(p);
  return null;
}

// 기존 코드 스타일에 맞춰 JSON 응답 헬퍼가 필요하면 아래처럼 쓰세요.
// function json_(obj) {
//   return ContentService.createTextOutput(JSON.stringify(obj))
//     .setMimeType(ContentService.MimeType.JSON);
// }

