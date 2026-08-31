/* ============================================================
   [ADDON_social_upload_directurl_v3_integrated.gs]
   - 소통/대화방 이미지·파일 업로드: 지정 폴더 저장 + 직접보기 URL 반환
   - 광고 이미지 목록 API: 광고 폴더 안 이미지 목록(JSON) 반환 (랜덤 포함)
   ------------------------------------------------------------
   ✅ 이 파일 하나에 기능이 모두 들어있어서, 언제든 삭제/수정이 쉽습니다.
   ✅ 주석을 따라 설정만 바꾸면 됩니다.
 
   [1] 소통/대화방 첨부 저장 폴더
   - WebGhost_Social_Uploads 폴더 ID로 기본 저장
   - 클라이언트가 folderId를 보내면(있으면) 그 값을 우선 사용
 
   [2] 광고 이미지 목록
   - mode=ad_list_images 요청 시, 광고 폴더(WebGhost_Advertisement_Uploads) 안의
     이미지 파일 목록을 JSON으로 반환합니다.
   - 폴더가 비어 있으면 images 배열이 빈 배열로 반환됩니다.
     (프론트는 이 경우 광고 슬롯을 만들지 않고 "없는 것처럼" 처리하면 됩니다.)
 
   ------------------------------------------------------------
   설정(필수)
   - SOCIAL_UPLOAD_FOLDER_ID: 소통/대화방 업로드 저장 폴더 ID
   - AD_FOLDER_ID: 광고 이미지 폴더 ID
 
   설정(선택)
   - AD_AUTO_MAKE_PUBLIC:
     true  = 목록 요청 시 광고 폴더 이미지 파일을 "링크가 있는 사람 누구나 보기"로 자동 설정
     false = 자동 설정 안 함 (파일/폴더 공유 설정을 직접 맞춰야 함)
 
   ------------------------------------------------------------
   라우팅(필수)
   - router(doGet/doPost)에서 아래 mode가 이 파일의 함수로 연결되어야 합니다.
     social_upload_image  -> handleSocialUploadImage_(e)
     social_upload_file   -> handleSocialUploadFile_(e)
     ad_list_images       -> handleAdListImages_(e)
 
   ------------------------------------------------------------
   참고
   - 이 파일은 jsonResponse_() 유틸이 프로젝트에 존재한다고 가정합니다.
     (기존 코드에서 이미 쓰고 있으면 그대로 사용 가능)
   ============================================================ */
 
/** 기본 저장 폴더(소통/대화방 업로드): WebGhost_Social_Uploads */
var SOCIAL_UPLOAD_FOLDER_ID = "1c6jR5ZQDvOpSdevWPhi34e2PqY3ieodn";
 
/** 광고 이미지 폴더: WebGhost_Advertisement_Uploads */
var AD_FOLDER_ID = "1__kQpi9LkghrcZMB7qLVdhGnyFnps3z_";
 
/** (선택) 광고 이미지 파일을 목록 요청 시 자동 공개 처리 */
var AD_AUTO_MAKE_PUBLIC = true;
var SOCIAL_UPLOAD_MAX_BASE64_CHARS = 7 * 1024 * 1024;
 
/** ------------------------------------------------------------
 *  [소통] social_upload_image
 *  ------------------------------------------------------------ */
function handleSocialUploadImage_(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var mime = String(p.mime || "image/jpeg");
    var b64  = String(p.data || "");
    var userId = String(p.user_id || "");
    var ts = String(p.ts || Date.now());
    if (!b64) return jsonResponse_({ ok: false, error: "empty_data" });
    if (b64.length > SOCIAL_UPLOAD_MAX_BASE64_CHARS) return jsonResponse_({ ok: false, error: "too_large" });
    if (b64.indexOf("data:") === 0) { var imageParts = b64.match(/^data:([^;]+);base64,(.*)$/);if (!imageParts) return jsonResponse_({ ok:false,error:"invalid_data_url" });mime=imageParts[1];b64=imageParts[2]; }
    if (mime.indexOf("image/") !== 0) return jsonResponse_({ ok:false,error:"invalid_image_type" });
 
    var bytes = Utilities.base64Decode(b64);
    var name  = "chat_img_" + ts + (userId ? ("_" + userId) : "") + ".jpg";
    var blob  = Utilities.newBlob(bytes, mime, name);
 
    // ★ 폴더 ID 우선순위: 요청 파라미터(folderId 등) > SOCIAL_UPLOAD_FOLDER_ID
    var folderId = SOCIAL_UPLOAD_FOLDER_ID;
 
    var file = _saveToDrive_(blob, folderId);
    _makePublic_(file);
 
    return jsonResponse_({
      ok: true,
      url: _directViewUrl_(file.getId()),
      file_id: file.getId(),
      name: file.getName()
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
 
/** ------------------------------------------------------------
 *  [소통] social_upload_file
 *  ------------------------------------------------------------ */
function handleSocialUploadFile_(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var mime = String(p.mime || "application/octet-stream");
    var filename = String(p.filename || "file");
    var b64  = String(p.data || "");
    var userId = String(p.user_id || "");
    var ts = String(p.ts || Date.now());
    if (!b64) return jsonResponse_({ ok: false, error: "empty_data" });
    if (b64.length > SOCIAL_UPLOAD_MAX_BASE64_CHARS) return jsonResponse_({ ok: false, error: "too_large" });
    if (b64.indexOf("data:") === 0) { var fileParts = b64.match(/^data:([^;]+);base64,(.*)$/);if (!fileParts) return jsonResponse_({ ok:false,error:"invalid_data_url" });mime=fileParts[1];b64=fileParts[2]; }
    filename = filename.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 120) || "file";
 
    var bytes = Utilities.base64Decode(b64);
    var safeName = "chat_file_" + ts + (userId ? ("_" + userId) : "") + "_" + filename;
    var blob  = Utilities.newBlob(bytes, mime, safeName);
 
    // ★ 폴더 ID 우선순위: 요청 파라미터(folderId 등) > SOCIAL_UPLOAD_FOLDER_ID
    var folderId = SOCIAL_UPLOAD_FOLDER_ID;
 
    var file = _saveToDrive_(blob, folderId);
    _makePublic_(file);
 
    return jsonResponse_({
      ok: true,
      url: _directViewUrl_(file.getId()),
      file_id: file.getId(),
      name: file.getName()
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
 
/** ------------------------------------------------------------
 *  [광고] ad_list_images
 *  - 광고 폴더 안 이미지 목록을 JSON으로 반환
 *  - GET/POST 모두 호출 가능
 *  ------------------------------------------------------------ */
function handleAdListImages_(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
 
    // ★ 폴더 ID 우선순위: 요청 파라미터(folderId 등) > AD_FOLDER_ID
    var folderId = AD_FOLDER_ID;
 
    // folderId가 없으면 빈 결과(광고 없음) 처리
    if (!folderId) {
      return jsonResponse_({ ok: true, count: 0, images: [], files: [], random_url: "" });
    }
 
    var folder = DriveApp.getFolderById(folderId);
    var it = folder.getFiles();
 
    var images = [];
    var files = [];
 
    while (it.hasNext()) {
      var f = it.next();
      var name = String(f.getName() || "");
      var mime = String(f.getMimeType() || "");
 
      // 이미지 필터: mimeType 우선, 확장자 보조
      var lower = name.toLowerCase();
      var isImage = (mime.indexOf("image/") === 0) ||
                    lower.endsWith(".jpg") || lower.endsWith(".jpeg") ||
                    lower.endsWith(".png") || lower.endsWith(".gif") ||
                    lower.endsWith(".webp");
 
      if (!isImage) continue;
 
      if (AD_AUTO_MAKE_PUBLIC) {
        // (선택) 자동 공개: 이미 공개된 파일이면 사실상 no-op
        try { _makePublic_(f); } catch (_e) {}
      }
 
      var url = _directViewUrl_(f.getId());
      images.push(url);
      files.push({
        id: f.getId(),
        name: name,
        mimeType: mime,
        url: url
      });
    }
 
    var randomUrl = "";
    if (images.length > 0) {
      var idx = Math.floor(Math.random() * images.length);
      randomUrl = images[idx];
    }
 
    return jsonResponse_({
      ok: true,
      folder_id: folderId,
      count: images.length,
      images: images,
      files: files,
      random_url: randomUrl
    });
  } catch (err) {
    // 광고는 "없음처럼" 처리해도 되지만, 디버깅을 위해 error를 포함해 반환
    return jsonResponse_({ ok: false, error: String(err) });
  }
}
 
/* ============================================================
   내부 유틸 (수정/삭제 쉬우라고 함수별로 분리)
   ============================================================ */
 
/** 다양한 키로 들어오는 folderId를 최대한 수용 */
function _pickFolderId_(p) {
  if (!p) return "";
  return String(
    p.folderId || p.folder_id ||
    p.driveFolderId || p.drive_folder_id ||
    p.parentId || p.parent_id ||
    p.parents || p.parent ||
    ""
  ).trim();
}
 
function _saveToDrive_(blob, folderId) {
  if (folderId) {
    var folder = DriveApp.getFolderById(folderId);
    return folder.createFile(blob);
  }
  // folderId가 없으면 루트(가능하면 이 경로는 타지 않도록 위에서 기본값을 채움)
  return DriveApp.createFile(blob);
}
 
function _makePublic_(file) {
  // 링크가 있는 사람 누구나 보기
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    Logger.log("setSharing 실패(무시): " + e);
  }
}
 
function _directViewUrl_(fileId) {
  // <img src>로 바로 표시 가능한 형태
  return "https://drive.google.com/uc?export=view&id=" + encodeURIComponent(String(fileId));
}
