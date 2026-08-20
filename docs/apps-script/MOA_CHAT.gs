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
 *    `모아_대화`, `모아_학습후보`, `모아_개인기억`, `모아_표현학습`, `모아_반응학습` 탭 삭제
 * 5) 웹앱을 새 버전으로 다시 배포
 * - 기존 `대화` 시트와 기존 미나 API는 수정/삭제할 필요가 없습니다.
 * - Firebase/Realtime Database와는 연결되어 있지 않습니다.
 */
var MOA_DIALOG_SHEET = "모아_대화";
var MOA_CANDIDATE_SHEET = "모아_학습후보";
var MOA_MEMORY_SHEET = "모아_개인기억";
var MOA_PHRASE_SHEET = "모아_표현학습";
var MOA_REACTION_SHEET = "모아_반응학습";
var MOA_TOPIC_SHEET = "모아_주제학습";
var MOA_REACTION_CACHE_KEY = "moa.reaction.lexicon.v1";
var MOA_DIALOG_CACHE_META = "moa.dialog.meta.v2";
var MOA_DIALOG_CACHE_PREFIX = "moa.dialog.chunk.v3.";
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
  return moaEnsureSheet_(MOA_PHRASE_SHEET,["normalized_phrase","phrase","candidate_id","reply","source","positive","negative","last_user_id","created_at","updated_at","motion","last_activity_serial","maintenance_state","positive_user_hashes","negative_user_hashes","reaction_profile"]);
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
    phraseSheet.getRange(2,1,pl-1,16).getDisplayValues().forEach(function(r, idx){
      var candidateId=String(r[2]||""), reply=String(r[3]||""), source=String(r[4]||""), pos=Number(r[5]||0), neg=Number(r[6]||0), phrase=String(r[1]||"");
      if(String(r[12]||"active").toLowerCase()==="dormant")return;
      var row=byId[candidateId];
      var positiveUsers=String(r[13]||"").split(",").filter(Boolean).length, negativeUsers=String(r[14]||"").split(",").filter(Boolean).length;
      if(row && phrase && pos>neg && positiveUsers>=2 && positiveUsers>negativeUsers){row.aliases=row.aliases?row.aliases+"|"+phrase:phrase;row.positive=Number(row.positive||0)+Math.min(6,positiveUsers-negativeUsers);return;}
      if(!row && /^builtin:/.test(candidateId) && phrase && reply && pos>=2 && pos>neg && positiveUsers>=2 && positiveUsers>negativeUsers){
        rows.push({id:"phrase:"+(idx+2),q:phrase,aliases:"",a:reply,motion:String(r[10]||"경청"),positive:positiveUsers,negative:negativeUsers,confidence:Math.min(.84,.58+positiveUsers*.06),source:"auto_phrase"});
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

function moaParseContext_(raw){
  try{var list=JSON.parse(String(raw||"[]"));if(!Array.isArray(list))return [];return list.slice(-6).map(function(v){return {role:String(v&&v.role||""),text:String(v&&v.text||"").slice(0,240)}}).filter(function(v){return v.text;});}catch(e){return [];}
}
function moaScoreRow_(text, row, context) {
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
  /* 짧은 후속발화는 최근 대화의 핵심어와 후보가 겹치면 조금 가산합니다. 현재 문장보다 문맥이 우선하지 않게 상한은 낮게 둡니다. */
  var recent=(context||[]).filter(function(v){return v.role==="user";}).slice(-3).map(function(v){return v.text;}).join(" "), ctxTokens=moaTokens_(recent), trig={};triggerTokens.forEach(function(t){trig[t]=true});
  var ctxHit=0;ctxTokens.forEach(function(t){if(trig[t])ctxHit++;});score+=Math.min(18,ctxHit*6);
  score += Math.max(-12,Math.min(12,(Number(row.positive||0)-Number(row.negative||0))*1.5));
  score += Math.max(0,Math.min(8,Number(row.confidence||0)*8));
  return score;
}

function moaFetchJson_(url){
  try{
    var res=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{"Accept":"application/json","User-Agent":"MOARU-Moa/1.0"}});
    if(res.getResponseCode()<200||res.getResponseCode()>=300)return null;
    return JSON.parse(res.getContentText());
  }catch(e){return null;}
}
function moaFetchText_(url){
  try{
    var res=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{"Accept":"text/html,application/xhtml+xml","User-Agent":"Mozilla/5.0 MOARU-Moa/1.0"}});
    if(res.getResponseCode()<200||res.getResponseCode()>=300)return "";
    return String(res.getContentText()||"");
  }catch(e){return "";}
}
function moaDecodeHtml_(text){
  return String(text||"")
    .replace(/<[^>]+>/g," ")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ")
    .replace(/&#(\d+);/g,function(_,n){try{return String.fromCharCode(Number(n))}catch(e){return ""}})
    .replace(/\s+/g," ").trim();
}
function moaWeatherIcon_(code){
  var c=Number(code);if(c===0)return "☀️";if(c<=3)return "⛅";if(c===45||c===48)return "🌫️";if(c>=51&&c<=67)return "🌧️";if(c>=71&&c<=77)return "🌨️";if(c>=80&&c<=82)return "🌦️";if(c>=85&&c<=86)return "🌨️";if(c>=95)return "⛈️";return "🌤️";
}
function moaWikiSearch_(query){
  var url="https://ko.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent(query)+"&gsrlimit=3&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*";
  var data=moaFetchJson_(url), pages=data&&data.query&&data.query.pages?data.query.pages:null;if(!pages)return [];
  var rows=[];Object.keys(pages).forEach(function(k){var v=pages[k]||{};if(v.title&&v.extract)rows.push({title:v.title,snippet:moaTrimAnswer_(v.extract,260),url:v.fullurl||("https://ko.wikipedia.org/wiki/"+encodeURIComponent(String(v.title).replace(/ /g,"_")))})});
  rows.sort(function(a,b){return a.title===query?-1:b.title===query?1:0});return rows.slice(0,3);
}
function moaDuckHtmlSearch_(query){
  var html=moaFetchText_("https://html.duckduckgo.com/html/?q="+encodeURIComponent(query));if(!html)return [];
  var rows=[], re=/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1600}?(?:class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>)?/gi, m;
  while((m=re.exec(html))&&rows.length<3){
    var url=moaDecodeHtml_(m[1]), title=moaDecodeHtml_(m[2]), snippet=moaDecodeHtml_(m[3]||"");
    var uddg=url.match(/[?&]uddg=([^&]+)/);if(uddg){try{url=decodeURIComponent(uddg[1])}catch(e){}}
    if(title&&/^https?:\/\//i.test(url))rows.push({title:title,snippet:moaTrimAnswer_(snippet,180),url:url});
  }
  return rows;
}

function moaTrimAnswer_(text,max){
  var s=String(text||"").replace(/\s+/g," ").trim(), n=Number(max||420);if(s.length<=n)return s;return s.slice(0,n-1).replace(/\s+\S*$/g,"")+"…";
}
function moaWeatherCodeText_(code){
  var c=Number(code);if(c===0)return "맑음";if(c<=3)return "구름 조금";if(c===45||c===48)return "안개";if(c>=51&&c<=67)return "비";if(c>=71&&c<=77)return "눈";if(c>=80&&c<=82)return "소나기";if(c>=85&&c<=86)return "눈 소나기";if(c>=95)return "뇌우";return "날씨 변화";
}
function moaWeatherSearch_(text){
  var raw=String(text||"");if(!/(날씨|기온|몇\s*도)/.test(raw))return null;
  var normalized=raw.replace(/^(오늘|지금|내일)\s+/,"");
  var m=normalized.match(/(.{1,40}?)(?:\s*(?:의|은|는))?\s*(?:오늘|지금|내일)?\s*(?:날씨|기온|몇\s*도)/);if(!m)return {reply:"어느 지역 날씨를 볼까? 예: 서울 오늘 날씨 알려줘",source:"open-meteo",kind:"weather"};
  var place=String(m[1]||"").replace(/^(오늘|지금|내일)\s*/,"").replace(/\s*(오늘|지금|내일)$/,"").trim();if(!place||place.length>40)return null;
  var geo=moaFetchJson_("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(place)+"&count=1&language=ko&format=json");
  var loc=geo&&geo.results&&geo.results[0];if(!loc)return {reply:place+" 위치를 정확히 못 찾았어. 지역 이름을 조금 더 구체적으로 말해줘.",source:"open-meteo",kind:"weather"};
  var forecast=moaFetchJson_("https://api.open-meteo.com/v1/forecast?latitude="+encodeURIComponent(loc.latitude)+"&longitude="+encodeURIComponent(loc.longitude)+"&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2");
  if(!forecast||!forecast.current)return null;
  var cur=forecast.current,d=forecast.daily||{}, name=[loc.name,loc.admin1].filter(Boolean).join(" "), tomorrow=/내일/.test(text), idx=tomorrow?1:0;
  if(tomorrow&&d.time&&d.time[idx]){
    var tmax=Math.round(Number(d.temperature_2m_max[idx])),tmin=Math.round(Number(d.temperature_2m_min[idx])),rain=Math.round(Number(d.precipitation_probability_max[idx]||0));
    return {reply:"📍 "+name+" · 내일\n🌡️ "+tmin+"° ~ "+tmax+"°\n☔ 강수확률 최대 "+rain+"%\n\n외출 전에는 한 번 더 확인해줘. 예보는 바뀔 수 있어.",source:"open-meteo",kind:"weather"};
  }
  var max0=Math.round(Number((d.temperature_2m_max||[])[0])),min0=Math.round(Number((d.temperature_2m_min||[])[0])),rain0=Math.round(Number((d.precipitation_probability_max||[])[0]||0));
  return {reply:"📍 "+name+" · 현재\n"+moaWeatherIcon_(cur.weather_code)+" "+moaWeatherCodeText_(cur.weather_code)+"  "+Math.round(Number(cur.temperature_2m))+"°\n🌡️ 체감 "+Math.round(Number(cur.apparent_temperature))+"° · 오늘 "+min0+"° ~ "+max0+"°\n☔ 강수확률 최대 "+rain0+"%\n💨 바람 "+Math.round(Number(cur.wind_speed_10m||0))+" km/h",source:"open-meteo",kind:"weather"};
}

function moaGeoPlace_(place){
  var q=String(place||"").trim();if(!q)return null;
  var geo=moaFetchJson_("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(q)+"&count=1&language=ko&format=json");
  return geo&&geo.results&&geo.results[0]||null;
}
function moaAirQualitySearch_(text){
  var raw=String(text||"");if(!/(미세먼지|초미세먼지|공기질|대기질|pm\s*2\.5|pm\s*10)/i.test(raw))return null;
  var m=raw.match(/(.{1,40}?)(?:\s*(?:의|은|는))?\s*(?:오늘|지금)?\s*(?:미세먼지|초미세먼지|공기질|대기질|pm\s*2\.5|pm\s*10)/i);
  var place=m?String(m[1]||"").replace(/^(오늘|지금)\s*/,"").trim():"";
  if(!place)return {reply:"어느 지역 공기질을 볼까? 예: 서울 미세먼지 알려줘",source:"open-meteo-air",kind:"air-quality"};
  var loc=moaGeoPlace_(place);if(!loc)return {reply:place+" 위치를 정확히 못 찾았어. 지역 이름을 조금 더 구체적으로 말해줘.",source:"open-meteo-air",kind:"air-quality"};
  var data=moaFetchJson_("https://air-quality-api.open-meteo.com/v1/air-quality?latitude="+encodeURIComponent(loc.latitude)+"&longitude="+encodeURIComponent(loc.longitude)+"&current=pm10,pm2_5,us_aqi&timezone=auto");
  if(!data||!data.current)return null;
  var cur=data.current,name=[loc.name,loc.admin1].filter(Boolean).join(" "),aqi=Number(cur.us_aqi),grade=aqi<=50?"좋음":aqi<=100?"보통":aqi<=150?"민감한 사람은 주의":aqi<=200?"나쁨":"매우 나쁨";
  return {reply:name+" 현재 공기질은 "+grade+" 정도야. PM2.5 "+Math.round(Number(cur.pm2_5||0))+"㎍/㎥, PM10 "+Math.round(Number(cur.pm10||0))+"㎍/㎥, AQI "+Math.round(aqi||0)+" 정도야.",source:"open-meteo-air",kind:"air-quality"};
}
function moaCityTimeSearch_(text){
  var raw=String(text||"");if(!/(현지\s*시간|지금\s*몇\s*시|현재\s*시간)/.test(raw))return null;
  var m=raw.match(/(.{1,40}?)(?:\s*(?:은|는|의))?\s*(?:지금\s*몇\s*시|현지\s*시간|현재\s*시간)/);if(!m)return null;
  var place=String(m[1]||"").trim();if(!place)return null;
  var loc=moaGeoPlace_(place);if(!loc||!loc.timezone)return {reply:place+" 시간대를 정확히 못 찾았어. 도시 이름을 조금 더 구체적으로 말해줘.",source:"open-meteo-geocoding",kind:"city-time"};
  var when=Utilities.formatDate(new Date(),loc.timezone,"yyyy년 M월 d일 HH:mm"),name=[loc.name,loc.country].filter(Boolean).join(" ");
  return {reply:name+" 현지 시간은 "+when+"이야.",source:"open-meteo-geocoding",kind:"city-time"};
}
function moaSearchShortcut_(text,query){
  var raw=String(text||""),q=String(query||"").trim();if(!q)return null;
  function strip(pattern){return q.replace(pattern,"").trim()||String(raw).replace(pattern,"").trim();}
  if(/유튜브|youtube|영상\s*검색/i.test(raw)){
    var y=strip(/(?:유튜브|youtube|에서|영상|검색|찾아줘|찾아봐|찾아)/gi);if(!y)y=q;
    return {reply:"유튜브에서 바로 찾아볼 수 있어:\nhttps://www.youtube.com/results?search_query="+encodeURIComponent(y),source:"youtube-search",kind:"youtube"};
  }
  if(/지도|길찾|위치\s*찾/i.test(raw)){
    var mapq=strip(/(?:네이버|구글|지도|에서|길찾기|길찾|위치|검색|찾아줘|찾아봐|찾아)/gi);if(!mapq)mapq=q;
    return {reply:"지도에서 찾아볼게.\n네이버 지도: https://map.naver.com/p/search/"+encodeURIComponent(mapq)+"\nGoogle 지도: https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(mapq),source:"map-search",kind:"map"};
  }
  if(/이미지\s*검색|사진\s*검색|사진\s*찾|이미지\s*찾/.test(raw)){
    var iq=strip(/(?:이미지|사진|검색|찾아줘|찾아봐|찾아)/g);if(!iq)iq=q;
    return {reply:"이미지 검색으로 바로 볼 수 있어:\nhttps://www.google.com/search?safe=active&tbm=isch&q="+encodeURIComponent(iq),source:"image-search",kind:"image"};
  }
  if(/사전|단어\s*뜻|뜻\s*찾/.test(raw)){
    var dq=strip(/(?:네이버|사전|에서|단어|뜻|검색|찾아줘|찾아봐|찾아|알려줘)/g);if(!dq)dq=q;
    return {reply:"사전에서 바로 확인할 수 있어:\nhttps://dict.naver.com/dict.search?query="+encodeURIComponent(dq),source:"dictionary-search",kind:"dictionary"};
  }
  if(/네이버.*검색|네이버에서/.test(raw)){
    var nq=strip(/(?:네이버|에서|검색|찾아줘|찾아봐|찾아)/g);if(!nq)nq=q;
    return {reply:"네이버 검색 결과 바로가기:\nhttps://search.naver.com/search.naver?query="+encodeURIComponent(nq),source:"naver-search",kind:"web"};
  }
  if(/구글.*검색|구글에서/.test(raw)){
    var gq=strip(/(?:구글|google|에서|검색|찾아줘|찾아봐|찾아)/gi);if(!gq)gq=q;
    return {reply:"Google 안전검색 결과 바로가기:\nhttps://www.google.com/search?safe=active&q="+encodeURIComponent(gq),source:"google-search",kind:"web"};
  }
  return null;
}

function moaCurrencyCode_(word){
  var w=String(word||"").toLowerCase();var map={"달러":"USD","미국달러":"USD","usd":"USD","원":"KRW","원화":"KRW","krw":"KRW","엔":"JPY","엔화":"JPY","jpy":"JPY","유로":"EUR","eur":"EUR","위안":"CNY","위안화":"CNY","cny":"CNY","파운드":"GBP","gbp":"GBP"};return map[w]||"";
}
function moaCurrencySearch_(text){
  var s=String(text||"").replace(/,/g,"");if(!/(환율|달러|원화|엔화|유로|위안|파운드|USD|KRW|JPY|EUR|CNY|GBP)/i.test(s))return null;
  var m=s.match(/(\d+(?:\.\d+)?)\s*(미국달러|달러|원화|원|엔화|엔|유로|위안화|위안|파운드|USD|KRW|JPY|EUR|CNY|GBP)\s*(?:를|을|이|가)?\s*(?:(미국달러|달러|원화|원|엔화|엔|유로|위안화|위안|파운드|USD|KRW|JPY|EUR|CNY|GBP)(?:로|으로|면|이면)?)?/i);
  var amount=m?Number(m[1]):1, from=m?moaCurrencyCode_(m[2]):"USD", to=m&&m[3]?moaCurrencyCode_(m[3]):(from==="KRW"?"USD":"KRW");if(!from||!to||from===to)return null;
  var data=moaFetchJson_("https://api.frankfurter.app/latest?amount="+encodeURIComponent(amount)+"&from="+from+"&to="+to);var value=data&&data.rates&&data.rates[to];if(value==null)return null;
  var rounded=Math.round(Number(value)*100)/100;return {reply:amount.toLocaleString("ko-KR")+" "+from+"는 현재 기준 약 "+rounded.toLocaleString("ko-KR")+" "+to+"야. 환율은 계속 바뀔 수 있어.",source:"frankfurter",kind:"currency"};
}
function moaNewsSearch_(text,query){
  if(!/(뉴스|소식|최신|최근|업데이트)/.test(String(text||"")))return null;
  try{
    var url="https://news.google.com/rss/search?q="+encodeURIComponent(query)+"&hl=ko&gl=KR&ceid=KR:ko";
    var res=UrlFetchApp.fetch(url,{muteHttpExceptions:true,followRedirects:true,headers:{"User-Agent":"MOARU-Moa/1.0"}});if(res.getResponseCode()<200||res.getResponseCode()>=300)return null;
    var root=XmlService.parse(res.getContentText()).getRootElement(), channel=root.getChild("channel"), items=channel?channel.getChildren("item").slice(0,3):[];if(!items.length)return null;
    var lines=items.map(function(item,i){var title=item.getChildText("title")||"", link=item.getChildText("link")||"";return (i+1)+". "+moaTrimAnswer_(title,120)+(link?"\n"+link:"");});
    return {reply:"최근 관련 소식은 이쪽이야:\n"+lines.join("\n\n"),source:"google-news",kind:"news"};
  }catch(e){return null;}
}
function moaGeneralSearch_(query){
  var q=String(query||"").trim();if(!q)return null;
  var cache=CacheService.getScriptCache(), key="moa.search."+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,q)).slice(0,28), hit=cache.get(key);if(hit){try{return JSON.parse(hit)}catch(e){}}
  var results=[], wiki=moaWikiSearch_(q);
  wiki.forEach(function(v){if(results.length<3)results.push(v)});
  if(results.length<2){
    var ddgJson=moaFetchJson_("https://api.duckduckgo.com/?q="+encodeURIComponent(q)+"&format=json&no_html=1&no_redirect=1&skip_disambig=1");
    if(ddgJson&&(ddgJson.Answer||ddgJson.AbstractText))results.push({title:ddgJson.Heading||q,snippet:moaTrimAnswer_(ddgJson.Answer||ddgJson.AbstractText,260),url:ddgJson.AbstractURL||""});
  }
  if(results.length<2){
    moaDuckHtmlSearch_(q).forEach(function(v){if(results.length<3&&!results.some(function(x){return x.url&&x.url===v.url}))results.push(v)});
  }
  var safeUrl="https://www.google.com/search?safe=active&q="+encodeURIComponent(q), out;
  if(results.length){
    var lines=results.slice(0,3).map(function(v,i){return (i+1)+". "+v.title+(v.snippet?"\n"+v.snippet:"")+(v.url?"\n"+v.url:"")});
    out={reply:"🔎 ‘"+q+"’ 찾아봤어.\n\n"+lines.join("\n\n")+"\n\n더 찾아보기\n"+safeUrl,source:results[0].url&&/wikipedia\.org/.test(results[0].url)?"wikipedia-search":"web-search",kind:"general"};
  }else{
    out={reply:"🔎 ‘"+q+"’로 공개 검색에서 바로 확인할 만한 결과를 못 찾았어.\n표현이나 철자가 맞는지 한 번 확인해볼래?\n\n직접 더 찾아보기\n"+safeUrl,source:"web-search",kind:"general"};
  }
  cache.put(key,JSON.stringify(out),600);return out;
}
function moaSearchAssist_(data){
  var text=String(data.text||"").trim(), query=String(data.query||text).trim();if(!query)return jsonResponse_({ok:false,error:"MOA_SEARCH_QUERY_REQUIRED"});
  var shortcut=moaSearchShortcut_(text||query,query);if(shortcut)return jsonResponse_({ok:true,reply:shortcut.reply,source:shortcut.source,kind:shortcut.kind});
  var air=moaAirQualitySearch_(text||query);if(air)return jsonResponse_({ok:true,reply:air.reply,source:air.source,kind:air.kind});
  var cityTime=moaCityTimeSearch_(text||query);if(cityTime)return jsonResponse_({ok:true,reply:cityTime.reply,source:cityTime.source,kind:cityTime.kind});
  var weather=moaWeatherSearch_(text||query);if(weather)return jsonResponse_({ok:true,reply:weather.reply,source:weather.source,kind:weather.kind});
  var currency=moaCurrencySearch_(text||query);if(currency)return jsonResponse_({ok:true,reply:currency.reply,source:currency.source,kind:currency.kind});
  var news=moaNewsSearch_(text||query,query);if(news)return jsonResponse_({ok:true,reply:news.reply,source:news.source,kind:news.kind});
  var general=moaGeneralSearch_(query);return jsonResponse_({ok:true,reply:general.reply,source:general.source,kind:general.kind});
}

function moaChatResponse_(data) {
  var text=String(data.text||"").trim(), userId=String(data.user_id||"").trim();
  if(!text)return jsonResponse_({ok:false,error:"MOA_TEXT_REQUIRED"});
  moaActivityTick_();
  var context=moaParseContext_(data.context_json), semantic={};
  try{semantic=JSON.parse(String(data.semantic_json||"{}"))||{};}catch(e){semantic={};}
  var topicHints=moaTopicHints_(semantic), rows=moaDialogRows_(), scored=[];
  rows.forEach(function(row){var score=moaScoreRow_(text,row,context);if(score>=18)scored.push({row:row,score:score})});
  scored.sort(function(a,b){return b.score-a.score});
  if(!scored.length)return jsonResponse_({ok:true,reply:"",source:"none",confidence:0,topic_hints:topicHints});
  var best=scored[0].score, pool=scored.filter(function(v){return v.score>=Math.max(18,best-8)}).slice(0,5), chosen=pool[Math.floor(Math.random()*pool.length)];
  return jsonResponse_({ok:true,reply:moaCasualize_(chosen.row.a),emotion:chosen.row.motion||"경청",source:chosen.row.source||"learned",confidence:Math.min(1,chosen.score/120),candidate_id:chosen.row.id,user_id:userId,topic_hints:topicHints});
}
