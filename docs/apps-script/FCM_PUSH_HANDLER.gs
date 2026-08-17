/* ============================================================
   [FCM_PUSH_HANDLER.gs] FCM 푸시 알림 발송
   ------------------------------------------------------------
   - mode=fcm_push 요청 시 FCM HTTP v1 API로 푸시 발송
   - 라우터(doPost)에서 아래 mode 연결 필요:
       fcm_push -> handleFcmPush_(e)

   [설정]
   - FCM_PROJECT_ID : Firebase 프로젝트 ID
   - FCM_SERVICE_ACCOUNT_EMAIL : Firebase 서비스 계정 이메일
   - FCM_PRIVATE_KEY : 서비스 계정 비공개 키

   [서비스 계정 발급 방법]
   Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 →
   새 비공개 키 생성 → JSON 다운로드 →
   아래 변수에 project_id, client_email, private_key 값 입력
   ============================================================ */

// 서비스 계정 정보는 소스가 아니라 프로젝트 설정 > 스크립트 속성에 저장합니다.
// 필수 속성: FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_EMAIL, FCM_PRIVATE_KEY
var FCM_CONFIG_PROPERTIES_ = PropertiesService.getScriptProperties();
var FCM_PROJECT_ID = String(FCM_CONFIG_PROPERTIES_.getProperty("FCM_PROJECT_ID") || "").trim();
var FCM_SERVICE_ACCOUNT_EMAIL = String(FCM_CONFIG_PROPERTIES_.getProperty("FCM_SERVICE_ACCOUNT_EMAIL") || "").trim();
var FCM_PRIVATE_KEY = String(FCM_CONFIG_PROPERTIES_.getProperty("FCM_PRIVATE_KEY") || "");
var FCM_DB_URL = FCM_PROJECT_ID ? "https://" + FCM_PROJECT_ID + "-default-rtdb.firebaseio.com" : "";
 
 
function handleFcmPush_(e) {
  try {
    if (!FCM_PROJECT_ID || !FCM_SERVICE_ACCOUNT_EMAIL || !FCM_PRIVATE_KEY) {
      return jsonResponse_({ ok: false, error: "FCM_SERVER_CONFIG_MISSING" });
    }
    var p = {};
    if (e && e.postData && e.postData.type &&
        e.postData.type.indexOf("application/json") !== -1) {
      try { p = JSON.parse(e.postData.contents || "{}"); } catch (_) {}
    } else if (e && e.parameter) {
      p = e.parameter;
    }
 
    var roomId    = String(p.room_id || "global");
    var sender    = String(p.sender  || "누군가");
    var body      = String(p.body    || "새 메시지가 있어요.");
    var tokensRaw = String(p.tokens  || "");
 
    if (!tokensRaw) return jsonResponse_({ ok: false, error: "no_tokens" });
 
    var tokens = tokensRaw.split(",")
      .map(function (t) { return t.trim(); })
      .filter(Boolean);
 
    if (tokens.length === 0) return jsonResponse_({ ok: false, error: "empty_tokens" });
 
    var title       = "마이파이 - " + sender;
    var accessToken = _getFcmAccessToken_();
    var results     = [];
    var staleTokens = [];
 
    // DB에서 토큰별 notify_mode 조회 (sound / vibrate / mute)
    var dbTokenMap = {};
    try {
      var dbResp = UrlFetchApp.fetch(FCM_DB_URL + "/fcm_tokens.json", {
        method:  "get",
        headers: { "Authorization": "Bearer " + accessToken },
        muteHttpExceptions: true
      });
      if (dbResp.getResponseCode() === 200) {
        var allEntries = JSON.parse(dbResp.getContentText()) || {};
        Object.keys(allEntries).forEach(function (key) {
          var entry = allEntries[key];
          if (entry && entry.token) {
            dbTokenMap[entry.token] = entry.notify_mode || "sound";
          }
        });
      }
    } catch (dbErr) {
      Logger.log("[FCM] DB notify_mode 조회 실패 (기본값 sound 사용): " + dbErr);
    }
 
    tokens.forEach(function (token) {
      try {
        var notifyMode = dbTokenMap[token] || "sound";
        var isMute     = notifyMode === "mute";
 
        var payload = {
          message: {
            token: token,
            notification: { title: title, body: body },
            data: {
              room_id:     roomId,
              sender:      sender,
              body:        body,
              notify_mode: notifyMode
            },
            webpush: {
              notification: {
                icon:     "/images/icons/icon-192x192.png",
                badge:    "/images/icons/icon-192x192.png",
                tag:      "mypai-msg-" + roomId,
                renotify: "true",
                silent:   isMute ? "true" : "false",
                vibrate:  isMute ? "[]" : "[200,100,200]"
              },
              fcm_options: { link: "/" }
            }
          }
        };
 
        var resp = UrlFetchApp.fetch(
          "https://fcm.googleapis.com/v1/projects/" + FCM_PROJECT_ID + "/messages:send",
          {
            method:           "post",
            contentType:      "application/json",
            headers:          { "Authorization": "Bearer " + accessToken },
            payload:          JSON.stringify(payload),
            muteHttpExceptions: true
          }
        );
 
        var status = resp.getResponseCode();
        Logger.log("[FCM] token=..." + token.slice(-6) + " mode=" + notifyMode + " status=" + status);
 
        if (status === 404 || status === 410) staleTokens.push(token);
        results.push({ token: token.slice(-6), status: status });
 
      } catch (err) {
        results.push({ token: token.slice(-6), error: String(err) });
      }
    });
 
    if (staleTokens.length > 0) _removeStaleTokensFromDb_(staleTokens);
 
    return jsonResponse_({
      ok:            true,
      sent:          results.filter(function (r) { return r.status === 200; }).length,
      stale_removed: staleTokens.length,
      results:       results
    });
 
  } catch (err) {
    Logger.log("[FCM] handleFcmPush_ 오류: " + err);
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
 
 
function _removeStaleTokensFromDb_(staleTokens) {
  try {
    var accessToken = _getFcmAccessToken_();
 
    var readResp = UrlFetchApp.fetch(FCM_DB_URL + "/fcm_tokens.json", {
      method:  "get",
      headers: { "Authorization": "Bearer " + accessToken },
      muteHttpExceptions: true
    });
 
    if (readResp.getResponseCode() !== 200) {
      Logger.log("[FCM] DB 읽기 실패: " + readResp.getContentText());
      return;
    }
 
    var allEntries = null;
    try { allEntries = JSON.parse(readResp.getContentText()); } catch (_) {}
    if (!allEntries) return;
 
    var staleSet = {};
    staleTokens.forEach(function (t) { staleSet[t] = true; });
 
    Object.keys(allEntries).forEach(function (key) {
      var entry = allEntries[key];
      if (entry && entry.token && staleSet[entry.token]) {
        var delResp = UrlFetchApp.fetch(
          FCM_DB_URL + "/fcm_tokens/" + key + ".json",
          {
            method:  "delete",
            headers: { "Authorization": "Bearer " + accessToken },
            muteHttpExceptions: true
          }
        );
        Logger.log("[FCM] 만료 토큰 삭제: key=" + key + " status=" + delResp.getResponseCode());
      }
    });
 
  } catch (err) {
    Logger.log("[FCM] _removeStaleTokensFromDb_ 오류: " + err);
  }
}
 
 
function _getFcmAccessToken_() {
  var now = Math.floor(Date.now() / 1000);
 
  var header = Utilities.base64EncodeWebSafe(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  );
 
  var claim = Utilities.base64EncodeWebSafe(
    JSON.stringify({
      iss:   FCM_SERVICE_ACCOUNT_EMAIL,
      scope: "https://www.googleapis.com/auth/firebase.messaging " +
             "https://www.googleapis.com/auth/firebase.database " +
             "https://www.googleapis.com/auth/userinfo.email",
      aud:   "https://oauth2.googleapis.com/token",
      iat:   now,
      exp:   now + 3600
    })
  );
 
  var toSign = header + "." + claim;
  var key    = FCM_PRIVATE_KEY.replace(/\\n/g, "\n");
 
  var sig = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(toSign, key)
  );
  var jwt = toSign + "." + sig;
 
  var resp = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method:      "post",
    contentType: "application/x-www-form-urlencoded",
    payload:     "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer" +
                 "&assertion=" + jwt,
    muteHttpExceptions: true
  });
 
  var json = JSON.parse(resp.getContentText());
  if (!json.access_token) {
    throw new Error("액세스 토큰 발급 실패: " + resp.getContentText());
  }
  return json.access_token;
}
 
