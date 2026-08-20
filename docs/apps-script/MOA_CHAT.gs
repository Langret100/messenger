/**
 * MOA_CHAT.gs
 * 모아와 대화하기 전용 학습 조회 엔진.
 * 기존 미나용 `대화` 시트와 완전히 분리되어 있으며 `모아_대화`만 공용 학습 데이터로 사용합니다.
 * 기본 회화는 클라이언트 js/ai/moa-chat-engine.js에 들어 있어 새 시트가 비어 있어도 대화를 시작할 수 있습니다.
 *
 * [모아 AI 기능을 Apps Script에서 완전히 제거하려면]
 * 1) 이 파일(MOA_CHAT.gs) 삭제
 * 2) MOA_LEARNING.gs 삭제
 * 3) Code.gs에서 `MOA_CHAT_INTEGRATION_START` ~ `MOA_CHAT_INTEGRATION_END` 블록 삭제
 * 4) 더 이상 학습 데이터도 보관하지 않을 경우 스프레드시트의
 *    `모아_대화`, `모아_학습후보`, `모아_개인기억`, `모아_표현학습` 탭 삭제
 * 5) 웹앱을 새 버전으로 다시 배포
 * - 기존 `대화` 시트와 기존 미나 API는 수정/삭제할 필요가 없습니다.
 * - Firebase/Realtime Database와는 연결되어 있지 않습니다.
 */
var MOA_DIALOG_SHEET = "모아_대화";
var MOA_CANDIDATE_SHEET = "모아_학습후보";
var MOA_MEMORY_SHEET = "모아_개인기억";
var MOA_PHRASE_SHEET = "모아_표현학습";
var MOA_DIALOG_CACHE_META = "moa.dialog.meta.v2";
var MOA_DIALOG_CACHE_PREFIX = "moa.dialog.chunk.v2.";
var MOA_ACTIVITY_SERIAL_KEY = "moa.activity.serial.v1";
var MOA_MAINTENANCE_ACTIVITY_STEP = 800; // 시간 경과가 아니라 실제 모아 서버 상호작용 누적 기준

/*
 * [자동 정리 정책]
 * - 프로그램이 오랫동안 사용되지 않았다는 이유만으로는 절대 삭제하지 않습니다.
 * - 실제 모아 서버 상호작용이 충분히 누적된 뒤에도 거의 쓰이지 않는 자동학습만 정리 후보가 됩니다.
 * - 자동학습은 즉시 삭제하지 않고 active -> dormant -> delete 두 단계를 거칩니다.
 * - 개인기억(모아_개인기억), 관리자/수동 보호 데이터는 자동 삭제하지 않습니다.
 * - 주 1회 유지보수 트리거 설치: Apps Script 편집기에서 moaInstallMaintenanceTrigger_()를 한 번 실행.
 * - 자동 정리 기능만 제거하려면 moaInstallMaintenanceTrigger_로 만들어진 트리거를 삭제하고
 *   MOA_LEARNING.gs의 moaRunLearningMaintenance_ / moaInstallMaintenanceTrigger_ 블록을 제거하면 됩니다.
 */
function moaCurrentActivitySerial_(){
  return Number(PropertiesService.getScriptProperties().getProperty(MOA_ACTIVITY_SERIAL_KEY)||0);
}
function moaActivityTick_(){
  var props=PropertiesService.getScriptProperties();
  var n=Number(props.getProperty(MOA_ACTIVITY_SERIAL_KEY)||0)+1;
  props.setProperty(MOA_ACTIVITY_SERIAL_KEY,String(n));
  return n;
}

function moaEnsureSheet_(name, headers) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() < 1) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  else {
    var existing = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn())).getDisplayValues()[0];
    var changed = false;
    for (var i = 0; i < headers.length; i++) {
      if (!existing[i]) { existing[i] = headers[i]; changed = true; }
    }
    if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([existing.slice(0, headers.length)]);
  }
  return sheet;
}

function moaNormalize_(text) {
  return String(text || "").toLowerCase().replace(/[\s\u200b]+/g, " ").replace(/[~!@#$%^&*()_+={}\[\]|\\:;\"'<>,.?/·…！？。]/g, " ").replace(/\s+/g, " ").trim();
}
function moaCompact_(text) { return moaNormalize_(text).replace(/\s+/g, ""); }
function moaTokens_(text) {
  var ignore = {"은":1,"는":1,"이":1,"가":1,"을":1,"를":1,"에":1,"의":1,"도":1,"좀":1,"해줘":1,"알려줘":1,"뭐야":1};
  return moaNormalize_(text).split(" ").filter(function(v){ return v && v.length > 1 && !ignore[v]; });
}
function moaCasualize_(text) {
  var s = String(text || "").trim();
  if (!s) return s;
  s = s.replace(/안녕하세요[.!?]?$/g, "안녕!")
    .replace(/감사합니다[.!?]?$/g, "고마워!")
    .replace(/입니다([.!?]|$)/g, "이야$1")
    .replace(/합니다([.!?]|$)/g, "해$1")
    .replace(/했습니다([.!?]|$)/g, "했어$1")
    .replace(/해요([.!?]|$)/g, "해$1")
    .replace(/했어요([.!?]|$)/g, "했어$1")
    .replace(/이에요([.!?]|$)/g, "이야$1")
    .replace(/예요([.!?]|$)/g, "야$1")
    .replace(/네요([.!?]|$)/g, "네$1")
    .replace(/주세요([.!?]|$)/g, "줘$1");
  return s;
}

function moaDialogSheet_() {
  return moaEnsureSheet_(MOA_DIALOG_SHEET,["id","대표질문","유사표현","답변","모션","주제","긍정점수","부정점수","사용횟수","신뢰도","출처","승인상태","생성일","최근사용일","last_activity_serial","maintenance_state"]);
}
function moaPhraseSheet_() {
  return moaEnsureSheet_(MOA_PHRASE_SHEET,["normalized_phrase","phrase","candidate_id","reply","source","positive","negative","last_user_id","created_at","updated_at","motion","last_activity_serial","maintenance_state"]);
}

function moaReadDialogRows_() {
  var rows = [];
  var sheet = moaDialogSheet_(), ml = sheet.getLastRow();
  if (ml > 1) {
    sheet.getRange(2,1,ml-1,14).getDisplayValues().forEach(function(r){
      if (!r[1] || !r[3]) return;
      if (String(r[11] || "approved").toLowerCase() === "rejected") return;
      rows.push({ id:String(r[0] || "moa:" + Utilities.getUuid()), q:String(r[1]), aliases:String(r[2] || ""), a:String(r[3]), motion:String(r[4] || "경청"), positive:Number(r[6] || 0), negative:Number(r[7] || 0), confidence:Number(r[9] || 0.7), source:String(r[10] || "moa") });
    });
  }

  /* 자연스러운 표현 학습:
     - 이미 모아_대화에 있는 후보는 긍정된 새 표현을 alias로 보강
     - 클라이언트 기본회화(builtin)는 동일 표현이 2회 이상 긍정되면 그 질문/답변 조합을
       가벼운 가상 학습 후보로 사용합니다. 사용자 정정 문장은 여기서 자동 공용화하지 않습니다. */
  var phraseSheet = moaPhraseSheet_(), pl = phraseSheet.getLastRow();
  if (pl > 1) {
    var byId = {}; rows.forEach(function(row){ byId[row.id] = row; });
    phraseSheet.getRange(2,1,pl-1,13).getDisplayValues().forEach(function(r, idx){
      var candidateId=String(r[2]||""), reply=String(r[3]||""), source=String(r[4]||""), pos=Number(r[5]||0), neg=Number(r[6]||0), phrase=String(r[1]||"");
      if(String(r[12]||"active").toLowerCase()==="dormant")return;
      var row=byId[candidateId];
      if(row && phrase && pos>neg){row.aliases=row.aliases?row.aliases+"|"+phrase:phrase;row.positive=Number(row.positive||0)+Math.min(6,pos-neg);return;}
      if(!row && /^builtin:/.test(candidateId) && phrase && reply && pos>=2 && pos>neg){
        rows.push({id:"phrase:"+(idx+2),q:phrase,aliases:"",a:reply,motion:String(r[10]||"경청"),positive:pos,negative:neg,confidence:Math.min(.82,.55+pos*.05),source:"auto_phrase"});
      }
    });
  }
  return rows;
}

function moaStoreDialogCache_(rows) {
  var cache = CacheService.getScriptCache(), chunks = [], current = [];
  rows.forEach(function(row){
    current.push(row);
    if (JSON.stringify(current).length > 70000) { var last = current.pop(); chunks.push(current); current = [last]; }
  });
  if (current.length) chunks.push(current);
  var values = {}, keys=[];
  chunks.forEach(function(chunk,i){ var k=MOA_DIALOG_CACHE_PREFIX+i; keys.push(k); values[k]=JSON.stringify(chunk); });
  if (keys.length) cache.putAll(values,21600);
  cache.put(MOA_DIALOG_CACHE_META, JSON.stringify({count:chunks.length,ts:Date.now()}),21600);
  return rows;
}

function moaDialogRows_() {
  var cache=CacheService.getScriptCache(), metaRaw=cache.get(MOA_DIALOG_CACHE_META);
  if (metaRaw) {
    try {
      var meta=JSON.parse(metaRaw), keys=[]; for(var i=0;i<meta.count;i++)keys.push(MOA_DIALOG_CACHE_PREFIX+i);
      var got=cache.getAll(keys), rows=[], complete=true;
      keys.forEach(function(k){ if(!got[k]) complete=false; else rows=rows.concat(JSON.parse(got[k])); });
      if (complete) return rows;
    } catch(e) {}
  }
  return moaStoreDialogCache_(moaReadDialogRows_());
}

function moaInvalidateDialogCache_() {
  var cache=CacheService.getScriptCache(), metaRaw=cache.get(MOA_DIALOG_CACHE_META), keys=[MOA_DIALOG_CACHE_META];
  if(metaRaw){try{var m=JSON.parse(metaRaw);for(var i=0;i<Number(m.count||0);i++)keys.push(MOA_DIALOG_CACHE_PREFIX+i)}catch(e){}}
  cache.removeAll(keys);
}

function moaScoreRow_(text, row) {
  var input=moaNormalize_(text), inputCompact=moaCompact_(text), q=moaNormalize_(row.q), qCompact=moaCompact_(row.q);
  if(!input||!q)return 0;
  var score=0;
  if(input===q)score+=120;
  if(inputCompact===qCompact)score+=100;
  if(inputCompact.indexOf(qCompact)>=0||qCompact.indexOf(inputCompact)>=0)score+=Math.min(45,10+Math.min(inputCompact.length,qCompact.length)*2);
  var inputTokens=moaTokens_(text), triggerTokens=moaTokens_(row.q + " " + String(row.aliases||"").replace(/\|/g," "));
  var tokenMap={};inputTokens.forEach(function(t){tokenMap[t]=true});
  triggerTokens.forEach(function(t){if(tokenMap[t])score+=12;else{for(var k in tokenMap){if(t.length>=2&&k.length>=2&&(t.indexOf(k)>=0||k.indexOf(t)>=0)){score+=4;break}}}});
  String(row.aliases||"").split("|").map(moaCompact_).filter(Boolean).forEach(function(a){if(a===inputCompact)score+=90;else if(a.length>1&&(inputCompact.indexOf(a)>=0||a.indexOf(inputCompact)>=0))score+=22});
  score += Math.max(-12,Math.min(12,(Number(row.positive||0)-Number(row.negative||0))*1.5));
  score += Math.max(0,Math.min(8,Number(row.confidence||0)*8));
  return score;
}

function moaChatResponse_(data) {
  var text=String(data.text||"").trim(), userId=String(data.user_id||"").trim();
  if(!text)return jsonResponse_({ok:false,error:"MOA_TEXT_REQUIRED"});
  moaActivityTick_();
  var rows=moaDialogRows_(), scored=[];
  rows.forEach(function(row){var score=moaScoreRow_(text,row);if(score>=18)scored.push({row:row,score:score})});
  scored.sort(function(a,b){return b.score-a.score});
  if(!scored.length)return jsonResponse_({ok:true,reply:"",source:"none",confidence:0});
  var best=scored[0].score, pool=scored.filter(function(v){return v.score>=Math.max(18,best-8)}).slice(0,5), chosen=pool[Math.floor(Math.random()*pool.length)];
  return jsonResponse_({ok:true,reply:moaCasualize_(chosen.row.a),emotion:chosen.row.motion||"경청",source:chosen.row.source||"learned",confidence:Math.min(1,chosen.score/120),candidate_id:chosen.row.id,user_id:userId});
}
