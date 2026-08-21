/* ============================================================
   MOA_AI.gs - MOA AI backend v91 smart-search foundation

   Browser owns conversation understanding and dialogue policy.
   Apps Script is intentionally limited to:
   - moa_sync   : public learning + small user profile/memory snapshot
   - moa_commit : batched learning/profile/memory persistence
   - moa_search : external information lookup

   No normal-chat response selection lives here.
   No raw MOA chat transcript is stored in Google Sheets.
   ============================================================ */
var MOA_PHRASE_SHEET = "모아_표현학습";
var MOA_MEMORY_SHEET = "모아_개인기억";
var MOA_PROFILE_SHEET = "모아_사용자성향";
var MOA_POLICY_SHEET = "모아_대화정책";
var MOA_ACTIVITY_PROPERTY = "MOA_ACTIVITY_SERIAL";
var MOA_SYNC_VERSION_PROPERTY = "MOA_SYNC_VERSION";
var MOA_MAINTENANCE_ACTIVITY_STEP = 800;

function moaCurrentActivitySerial_(){return Number(PropertiesService.getScriptProperties().getProperty(MOA_ACTIVITY_PROPERTY)||0);}
function moaActivityTick_(){var p=PropertiesService.getScriptProperties(),n=moaCurrentActivitySerial_()+1;p.setProperty(MOA_ACTIVITY_PROPERTY,String(n));return n;}
function moaCurrentSyncVersion_(){return Number(PropertiesService.getScriptProperties().getProperty(MOA_SYNC_VERSION_PROPERTY)||1);}
function moaBumpSyncVersion_(){var p=PropertiesService.getScriptProperties(),n=moaCurrentSyncVersion_()+1;p.setProperty(MOA_SYNC_VERSION_PROPERTY,String(n));return n;}
function moaEnsureSheet_(name,headers){var ss=SpreadsheetApp.getActiveSpreadsheet(),s=ss.getSheetByName(name);if(!s)s=ss.insertSheet(name);if(s.getLastRow()===0&&headers&&headers.length)s.getRange(1,1,1,headers.length).setValues([headers]);return s;}
function moaNormalize_(text){var s=String(text||"");try{s=s.normalize("NFC")}catch(e){}return s.replace(/\s+/g," ").trim().toLowerCase();}
function moaCompact_(text){return moaNormalize_(text).replace(/[\s~!！?？.,。·…'"“”‘’]/g,"");}

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

function moaKnownPlace_(place){
  var q=String(place||"").trim().replace(/특별시$|광역시$|특별자치시$|특별자치도$|도$/g,"");
  var map={
    "서울":{name:"서울",admin1:"서울특별시",latitude:37.5665,longitude:126.9780,timezone:"Asia/Seoul"},
    "부산":{name:"부산",admin1:"부산광역시",latitude:35.1796,longitude:129.0756,timezone:"Asia/Seoul"},
    "대구":{name:"대구",admin1:"대구광역시",latitude:35.8714,longitude:128.6014,timezone:"Asia/Seoul"},
    "인천":{name:"인천",admin1:"인천광역시",latitude:37.4563,longitude:126.7052,timezone:"Asia/Seoul"},
    "광주":{name:"광주",admin1:"광주광역시",latitude:35.1595,longitude:126.8526,timezone:"Asia/Seoul"},
    "대전":{name:"대전",admin1:"대전광역시",latitude:36.3504,longitude:127.3845,timezone:"Asia/Seoul"},
    "울산":{name:"울산",admin1:"울산광역시",latitude:35.5384,longitude:129.3114,timezone:"Asia/Seoul"},
    "세종":{name:"세종",admin1:"세종특별자치시",latitude:36.4800,longitude:127.2890,timezone:"Asia/Seoul"},
    "제주":{name:"제주",admin1:"제주특별자치도",latitude:33.4996,longitude:126.5312,timezone:"Asia/Seoul"},
    "제주시":{name:"제주",admin1:"제주특별자치도",latitude:33.4996,longitude:126.5312,timezone:"Asia/Seoul"}
  };
  return map[q]||null;
}

function moaWeatherSearch_(text){
  var raw=String(text||"");if(!/(날씨|기온|몇\s*도)/.test(raw))return null;
  var normalized=raw.replace(/^(오늘|지금|내일)\s+/,"");
  var m=normalized.match(/(.{1,40}?)(?:\s*(?:의|은|는))?\s*(?:오늘|지금|내일)?\s*(?:날씨|기온|몇\s*도)/);if(!m)return {reply:"어느 지역 날씨를 볼까? 예: 서울 오늘 날씨 알려줘",source:"open-meteo",kind:"weather"};
  var place=String(m[1]||"").replace(/^(오늘|지금|내일)\s*/,"").replace(/\s*(오늘|지금|내일)$/,"").trim();if(!place||place.length>40)return null;
  var loc=moaGeoPlace_(place);if(!loc)return {reply:place+" 위치를 정확히 못 찾았어. 지역 이름을 조금 더 구체적으로 말해줘.",source:"open-meteo",kind:"weather"};
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
  var known=moaKnownPlace_(q);if(known)return known;
  var geo=moaFetchJson_("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(q)+"&count=1&language=ko&format=json");
  var loc=geo&&geo.results&&geo.results[0];if(loc)return loc;
  var aliases={"서울":"Seoul","부산":"Busan","대구":"Daegu","인천":"Incheon","광주":"Gwangju","대전":"Daejeon","울산":"Ulsan","세종":"Sejong","제주":"Jeju"};
  var fallback=aliases[q];if(!fallback)return null;
  geo=moaFetchJson_("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(fallback)+"&count=1&language=ko&format=json");
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
function moaSentenceParts_(text){
  var s=String(text||"").replace(/\s+/g," ").trim();if(!s)return [];
  var parts=s.match(/[^.!?。！？]+[.!?。！？]?/g)||[s];
  return parts.map(function(v){return v.trim()}).filter(function(v){return v.length>=18});
}
function moaSearchWords_(text){
  return moaNormalize_(text).replace(/[^0-9a-z가-힣 ]/gi," ").split(/\s+/).filter(function(v){return v.length>=2&&!["알려줘","설명해줘","찾아줘","검색해줘","뭐야","누구야","무엇","어디","언제"].includes(v)});
}
function moaSentenceScore_(sentence,query,index){
  var s=moaNormalize_(sentence), words=moaSearchWords_(query), score=Math.max(0,18-index*2);
  words.forEach(function(w){if(s.indexOf(w)>=0)score+=8});
  if(sentence.length>=45&&sentence.length<=190)score+=6;
  if(/^(이 문서는|동음이의어|분류:|위키)/.test(s))score-=30;
  return score;
}
function moaSynthesizeSearch_(query,results){
  var candidates=[],seen={};
  (results||[]).forEach(function(row,ri){
    moaSentenceParts_(row.snippet).forEach(function(sentence,si){
      var key=moaNormalize_(sentence).replace(/[^0-9a-z가-힣]/gi,"").slice(0,90);if(!key||seen[key])return;seen[key]=1;
      candidates.push({text:sentence,score:moaSentenceScore_(sentence,query,ri*3+si),source:ri});
    });
  });
  candidates.sort(function(a,b){return b.score-a.score});
  var chosen=[],usedSources={};
  candidates.forEach(function(v){
    if(chosen.length>=3)return;
    var tooSimilar=chosen.some(function(x){
      var a=moaSearchWords_(x.text),b=moaSearchWords_(v.text),same=a.filter(function(w){return b.indexOf(w)>=0}).length;
      return same>=Math.min(4,Math.max(2,Math.floor(Math.min(a.length,b.length)*.65)));
    });
    if(!tooSimilar){chosen.push(v);usedSources[v.source]=1;}
  });
  if(!chosen.length)return "";
  var answer=chosen.map(function(v){return moaTrimAnswer_(v.text,240)}).join(" ");
  return moaTrimAnswer_(answer,620);
}
function moaGeneralSearch_(query,text){
  var q=String(query||"").trim();if(!q)return null;
  var raw=String(text||"");
  var lookup=q;
  if(/추천|골라|뭐가\s*좋/.test(raw)&&!/추천/.test(lookup))lookup=q+" 추천";
  else if(/비교|차이|장단점/.test(raw)&&!/(비교|차이)/.test(lookup))lookup=q+" 비교 차이";
  else if(/최신|최근|요즘/.test(raw)&&!/(최신|최근)/.test(lookup))lookup=q+" 최신";
  var cache=CacheService.getScriptCache(), key="moa.search.v2."+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,lookup)).slice(0,28), hit=cache.get(key);if(hit){try{return JSON.parse(hit)}catch(e){}}
  var results=[], intentWeb=/(추천|골라|비교|차이|장단점)/.test(raw);
  if(intentWeb){moaDuckHtmlSearch_(lookup).forEach(function(v){if(results.length<4)results.push(v)});}
  var wiki=moaWikiSearch_(lookup);
  wiki.forEach(function(v){if(results.length<4&&!results.some(function(x){return x.url&&x.url===v.url}))results.push(v)});
  if(results.length<3){
    var ddgJson=moaFetchJson_("https://api.duckduckgo.com/?q="+encodeURIComponent(lookup)+"&format=json&no_html=1&no_redirect=1&skip_disambig=1");
    if(ddgJson&&(ddgJson.Answer||ddgJson.AbstractText))results.push({title:ddgJson.Heading||q,snippet:moaTrimAnswer_(ddgJson.Answer||ddgJson.AbstractText,360),url:ddgJson.AbstractURL||""});
  }
  if(results.length<3){
    moaDuckHtmlSearch_(lookup).forEach(function(v){if(results.length<4&&!results.some(function(x){return x.url&&x.url===v.url}))results.push(v)});
  }
  var out,summary=moaSynthesizeSearch_(lookup,results);
  if(results.length&&summary){
    var refs=results.filter(function(v){return v.url&&v.snippet}).slice(0,2).map(function(v){return "• "+moaTrimAnswer_(v.title,70)+"\n"+v.url});
    out={reply:summary+(refs.length?"\n\n참고한 공개 자료\n"+refs.join("\n"):""),source:results[0].url&&/wikipedia\.org/.test(results[0].url)?"wikipedia-answer":"web-answer",kind:"answer"};
  }else if(results.length){
    var first=results[0];out={reply:"관련 자료는 찾았는데 지금 가져온 내용만으로는 확실하게 요약하기 어려워. 검색어를 조금 더 구체적으로 말해주면 다시 확인해볼게."+(first.url?"\n\n참고 자료\n"+first.url:""),source:"web-answer",kind:"answer"};
  }else{
    out={reply:"공개 자료에서 믿고 바로 답할 만한 내용을 찾지 못했어. 이름이나 표현을 조금 더 구체적으로 말해주면 다시 찾아볼게.",source:"web-answer",kind:"answer"};
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
  var general=moaGeneralSearch_(query,text);return jsonResponse_({ok:true,reply:general.reply,source:general.source,kind:general.kind});
}



function moaUserHash_(userId){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(userId||""))).slice(0,18);}
function moaHashList_(v){return String(v||"").split(",").map(function(x){return x.trim()}).filter(Boolean);}
function moaAppendUniqueHash_(v,h){var a=moaHashList_(v),added=false;if(h&&a.indexOf(h)<0){a.push(h);added=true;}return {value:a.join(","),added:added};}
function moaEvidenceHash_(uid,event){
  var raw=[moaUserHash_(uid),String(event&&event.evidenceKey||""),String(event&&event.type||""),String(event&&event.strategy||"")].join("|");
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,raw)).slice(0,18);
}
function moaEvidenceWeight_(event){return moaClamp_(Math.abs(moaNum_(event&&event.weight,1)),.10,1);}
function moaLearningTier_(posUsers,negUsers,posScore,negScore,evidenceCount){
  posUsers=Number(posUsers||0);negUsers=Number(negUsers||0);posScore=Number(posScore||0);negScore=Number(negScore||0);evidenceCount=Number(evidenceCount||0);
  if(posUsers>=3&&posUsers>=negUsers+2&&posScore>=2.4&&posScore>=negScore+1.4)return "confirmed";
  if(posUsers>=2&&posUsers>negUsers&&posScore>=1.8&&posScore>=negScore+1.1)return "growing";
  if(posUsers>=1&&evidenceCount>=3&&posScore>=2.0&&negScore<=.35&&posScore>=negScore+1.8)return "solo";
  return "observing";
}
function moaPolicyLearningTier_(posUsers,negUsers,posScore,negScore,evidenceCount){
  posUsers=Number(posUsers||0);negUsers=Number(negUsers||0);posScore=Number(posScore||0);negScore=Number(negScore||0);evidenceCount=Number(evidenceCount||0);
  if(posUsers>=3&&posUsers>=negUsers+2&&posScore>=2.6&&posScore>=negScore+1.5)return "confirmed";
  if(posUsers>=2&&posUsers>negUsers&&posScore>=2.0&&posScore>=negScore+1.2)return "growing";
  if(posUsers>=1&&evidenceCount>=5&&posScore>=2.3&&negScore<=.35&&posScore>=negScore+2.0)return "solo";
  return "observing";
}
function moaJson_(value,fallback){try{return JSON.parse(String(value||""))}catch(e){return fallback;}}
function moaNum_(v,d){v=Number(v);return isFinite(v)?v:d;}
function moaClamp_(v,a,b){return Math.max(a,Math.min(b,moaNum_(v,a)));}
function moaProfileNum_(v,d){return moaClamp_(moaNum_(v,d),0,1);}

function moaPhraseSheet_(){return moaEnsureSheet_(MOA_PHRASE_SHEET,["normalized","trigger","candidate_id","reply","source","positive_users","negative_users","last_user_id","created_at","updated_at","act","affect","last_activity_serial","state","positive_hashes","negative_hashes","strategy","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}
function moaMemorySheet_(){return moaEnsureSheet_(MOA_MEMORY_SHEET,["user_id","key","value","label","confidence","created_at","updated_at"]);}
function moaProfileSheet_(){
  var sh=moaEnsureSheet_(MOA_PROFILE_SHEET,["user_id","brevity","question_tolerance","playfulness","empathy","directness","initiative","updated_at"]);
  if(sh.getMaxColumns()<8)sh.insertColumnsAfter(sh.getMaxColumns(),8-sh.getMaxColumns());
  var h7=String(sh.getRange(1,7).getValue()||""),h8=String(sh.getRange(1,8).getValue()||"");
  if(h7!=="initiative"){
    var last=sh.getLastRow();
    if(last>1&&h7==="updated_at"){var old=sh.getRange(2,7,last-1,1).getValues();sh.getRange(2,8,last-1,1).setValues(old);sh.getRange(2,7,last-1,1).setValues(old.map(function(){return [.52]}));}
    sh.getRange(1,7).setValue("initiative");
  }
  if(h8!=="updated_at")sh.getRange(1,8).setValue("updated_at");
  return sh;
}
function moaPolicySheet_(){return moaEnsureSheet_(MOA_POLICY_SHEET,["policy_key","strategy","positive_users","negative_users","positive_hashes","negative_hashes","updated_at","last_activity_serial","state","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}

function moaEnsureHeaders_(sh,headers){
  if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());
  var current=sh.getRange(1,1,1,headers.length).getValues()[0],dirty=false;
  for(var i=0;i<headers.length;i++)if(String(current[i]||"")!==headers[i]){current[i]=headers[i];dirty=true;}
  if(dirty)sh.getRange(1,1,1,headers.length).setValues([current]);
  return sh;
}
function moaEnsurePhraseWidth_(){return moaEnsureHeaders_(moaPhraseSheet_(),["normalized","trigger","candidate_id","reply","source","positive_users","negative_users","last_user_id","created_at","updated_at","act","affect","last_activity_serial","state","positive_hashes","negative_hashes","strategy","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}
function moaEnsurePolicyWidth_(){return moaEnsureHeaders_(moaPolicySheet_(),["policy_key","strategy","positive_users","negative_users","positive_hashes","negative_hashes","updated_at","last_activity_serial","state","positive_score","negative_score","evidence_hashes","evidence_count","learning_tier"]);}

function moaReadProfile_(uid){
  var sh=moaProfileSheet_(),last=sh.getLastRow();if(last<=1)return null;
  var rows=sh.getRange(2,1,last-1,8).getValues();
  for(var i=rows.length-1;i>=0;i--)if(String(rows[i][0])===uid)return {brevity:moaProfileNum_(rows[i][1],.58),questionTolerance:moaProfileNum_(rows[i][2],.50),playfulness:moaProfileNum_(rows[i][3],.55),empathy:moaProfileNum_(rows[i][4],.60),directness:moaProfileNum_(rows[i][5],.60),initiative:moaProfileNum_(rows[i][6],.52)};
  return null;
}
function moaWriteProfile_(uid,p){
  if(!uid||!p||typeof p!=="object")return;
  var sh=moaProfileSheet_(),last=sh.getLastRow(),row=0,rows=last>1?sh.getRange(2,1,last-1,8).getValues():[];
  for(var i=rows.length-1;i>=0;i--)if(String(rows[i][0])===uid){row=i+2;break;}
  var values=[uid,moaProfileNum_(p.brevity,.58),moaProfileNum_(p.questionTolerance,.50),moaProfileNum_(p.playfulness,.55),moaProfileNum_(p.empathy,.60),moaProfileNum_(p.directness,.60),moaProfileNum_(p.initiative,.52),new Date()];
  if(row)sh.getRange(row,1,1,8).setValues([values]);else sh.appendRow(values);
}
function moaReadMemories_(uid){
  var out={},sh=moaMemorySheet_(),last=sh.getLastRow();if(last<=1)return out;
  var rows=sh.getRange(2,1,last-1,7).getValues();
  rows.forEach(function(r){if(String(r[0])===uid&&r[1]&&r[2])out[String(r[1])]={value:String(r[2]),label:String(r[3]||""),confidence:Number(r[4]||.7)};});return out;
}
function moaWriteMemory_(uid,key,value,label){
  uid=String(uid||"");key=String(key||"").trim();value=String(value||"").trim();label=String(label||"");if(!uid||!key||!value||key.length>40||value.length>80)return;
  var sh=moaMemorySheet_(),last=sh.getLastRow(),row=0,rows=last>1?sh.getRange(2,1,last-1,7).getValues():[];
  for(var i=rows.length-1;i>=0;i--)if(String(rows[i][0])===uid&&String(rows[i][1])===key){row=i+2;break;}
  var now=new Date();if(row){var old=sh.getRange(row,1,1,7).getValues()[0];sh.getRange(row,1,1,7).setValues([[uid,key,value,label,Math.min(.98,Number(old[4]||.7)+.04),old[5]||now,now]]);}else sh.appendRow([uid,key,value,label,.72,now,now]);
}

function moaPublicPatterns_(){
  var sh=moaEnsurePhraseWidth_(),last=sh.getLastRow(),out=[];if(last<=1)return out;
  sh.getRange(2,1,last-1,22).getValues().forEach(function(r,i){
    var state=String(r[13]||"active").toLowerCase(),pos=Number(r[5]||0),neg=Number(r[6]||0),posScore=Number(r[17]||pos||0),negScore=Number(r[18]||neg||0),evidenceCount=Number(r[20]||0);
    if(state==="dormant"||!r[1]||!r[3])return;
    var tier=moaLearningTier_(pos,neg,posScore,negScore,evidenceCount);if(tier==="observing")return;
    var base=tier==="confirmed"?.72:tier==="growing"?.65:.58,margin=Math.max(0,posScore-negScore),confidence=Math.min(tier==="confirmed"?.96:tier==="growing"?.82:.69,base+margin*.025);
    out.push({id:String(r[2]||("phrase:"+(i+2))),trigger:String(r[1]),reply:String(r[3]),source:String(r[4]||"learned"),positive:pos,negative:neg,positiveScore:posScore,negativeScore:negScore,evidenceCount:evidenceCount,tier:tier,act:String(r[10]||""),affect:String(r[11]||"neutral"),strategy:String(r[16]||""),confidence:confidence});
  });
  out.sort(function(a,b){var rank={confirmed:3,growing:2,solo:1};return (rank[b.tier]-rank[a.tier])||((b.positiveScore-b.negativeScore)-(a.positiveScore-a.negativeScore));});return out.slice(0,180);
}
function moaPublicPolicy_(){
  var sh=moaEnsurePolicyWidth_(),last=sh.getLastRow(),out={};if(last<=1)return out;
  sh.getRange(2,1,last-1,14).getValues().forEach(function(r){
    var key=String(r[0]||""),strategy=String(r[1]||""),pos=Number(r[2]||0),neg=Number(r[3]||0),state=String(r[8]||"active"),posScore=Number(r[9]||pos||0),negScore=Number(r[10]||neg||0),evidenceCount=Number(r[12]||0);
    if(!key||!strategy||state==="dormant")return;
    var tier=moaPolicyLearningTier_(pos,neg,posScore,negScore,evidenceCount);if(tier==="observing")return;
    if(!out[key])out[key]={};out[key][strategy]={positive:pos,negative:neg,positiveScore:posScore,negativeScore:negScore,evidenceCount:evidenceCount,tier:tier};
  });return out;
}
function moaPublicSnapshot_(){
  var version=moaCurrentSyncVersion_(),key="moa-public-v91-"+version,cache=CacheService.getScriptCache(),hit=cache.get(key);
  if(hit){try{return JSON.parse(hit)}catch(e){}}
  var snapshot={patterns:moaPublicPatterns_(),policy:moaPublicPolicy_()};
  try{cache.put(key,JSON.stringify(snapshot),300)}catch(e){}
  return snapshot;
}
function moaSync_(data){
  var uid=String(data.user_id||"").trim();if(!uid)return jsonResponse_({ok:false,error:"MOA_SYNC_USER_REQUIRED"});
  var known=Number(data.known_version||0),version=moaCurrentSyncVersion_(),out={ok:true,version:version,profile:moaReadProfile_(uid)||null,memories:moaReadMemories_(uid)};
  if(known!==version){var pub=moaPublicSnapshot_();out.patterns=pub.patterns;out.policy=pub.policy;}
  return jsonResponse_(out);
}

function moaStoreFeedbackEvents_(uid,events){
  var sh=moaEnsurePhraseWidth_(),last=sh.getLastRow(),rows=last>1?sh.getRange(2,1,last-1,22).getValues():[],originalCount=rows.length,index={},dirty={},changed=false,publicChanged=false;
  rows.forEach(function(r,i){index[String(r[0])+"\u001f"+String(r[3])]=i;});
  var now=new Date(),hash=moaUserHash_(uid),activity=moaCurrentActivitySerial_();
  events.forEach(function(event){
    if(!event||event.type!=="feedback")return;
    var trigger=String(event.trigger||"").trim(),reply=String(event.reply||"").trim(),source=String(event.source||"local"),signal=String(event.signal||""),act=String(event.act||""),affect=String(event.affect||"neutral"),strategy=String(event.strategy||"");
    if(!trigger||!reply||["positive","negative"].indexOf(signal)<0)return;
    var norm=moaCompact_(trigger);if(norm.length<2||norm.length>180||reply.length>600)return;
    var k=norm+"\u001f"+reply,i=index[k],r;
    if(i==null){i=rows.length;index[k]=i;r=[norm,trigger,"phrase:"+(i+2),reply,source,0,0,uid,now,now,act,affect,activity,"active","","",strategy,0,0,"",0,"observing"];rows.push(r);}else r=rows[i];
    while(r.length<22)r.push("");
    var beforeTier=moaLearningTier_(r[5],r[6],Number(r[17]||r[5]||0),Number(r[18]||r[6]||0),Number(r[20]||0));
    var ph=String(r[14]||""),nh=String(r[15]||""),localChanged=false,res;
    if(signal==="positive"){res=moaAppendUniqueHash_(ph,hash);ph=res.value;if(res.added){r[5]=Number(r[5]||0)+1;localChanged=true;}}
    if(signal==="negative"){res=moaAppendUniqueHash_(nh,hash);nh=res.value;if(res.added){r[6]=Number(r[6]||0)+1;localChanged=true;}}
    var evHash=moaEvidenceHash_(uid,event),er=moaAppendUniqueHash_(String(r[19]||""),evHash);
    if(er.added){var w=moaEvidenceWeight_(event);r[19]=er.value;r[20]=Number(r[20]||0)+1;if(signal==="positive")r[17]=Number(r[17]||0)+w;else r[18]=Number(r[18]||0)+w;localChanged=true;}
    var tier=moaLearningTier_(r[5],r[6],r[17],r[18],r[20]);if(String(r[21]||"")!==tier){r[21]=tier;localChanged=true;}
    if(localChanged&&(beforeTier!=="observing"||tier!=="observing"))publicChanged=true;
    if(localChanged){r[7]=uid;r[9]=now;r[10]=act||r[10]||"";r[11]=affect||r[11]||"neutral";r[12]=activity;r[13]="active";r[14]=ph;r[15]=nh;r[16]=strategy||r[16]||"";dirty[i]=true;changed=true;}
  });
  Object.keys(dirty).map(Number).filter(function(i){return i<originalCount}).forEach(function(i){sh.getRange(i+2,1,1,22).setValues([rows[i]]);});
  var appended=rows.slice(originalCount);if(appended.length)sh.getRange(originalCount+2,1,appended.length,22).setValues(appended);
  return publicChanged;
}
function moaStorePolicyEvents_(uid,events){
  var sh=moaEnsurePolicyWidth_(),last=sh.getLastRow(),rows=last>1?sh.getRange(2,1,last-1,14).getValues():[],originalCount=rows.length,index={},dirty={},changed=false,publicChanged=false;
  rows.forEach(function(r,i){index[String(r[0])+"\u001f"+String(r[1])]=i;});
  var hash=moaUserHash_(uid),now=new Date(),activity=moaCurrentActivitySerial_();
  events.forEach(function(ev){
    if(!ev||ev.type!=="policy_feedback")return;var key=String(ev.policyKey||"").slice(0,100),strategy=String(ev.strategy||"").slice(0,30),signal=String(ev.signal||"");if(!key||!strategy||["positive","negative"].indexOf(signal)<0)return;
    var k=key+"\u001f"+strategy,i=index[k],r;if(i==null){i=rows.length;index[k]=i;r=[key,strategy,0,0,"","",now,activity,"active",0,0,"",0,"observing"];rows.push(r);}else r=rows[i];while(r.length<14)r.push("");
    var beforeTier=moaPolicyLearningTier_(r[2],r[3],Number(r[9]||r[2]||0),Number(r[10]||r[3]||0),Number(r[12]||0));
    var col=signal==="positive"?4:5,res=moaAppendUniqueHash_(String(r[col]||""),hash);if(res.added){r[col]=res.value;r[signal==="positive"?2:3]=Number(r[signal==="positive"?2:3]||0)+1;}
    var evHash=moaEvidenceHash_(uid,ev),er=moaAppendUniqueHash_(String(r[11]||""),evHash),localChanged=!!res.added;
    if(er.added){var w=moaEvidenceWeight_(ev);r[11]=er.value;r[12]=Number(r[12]||0)+1;if(signal==="positive")r[9]=Number(r[9]||0)+w;else r[10]=Number(r[10]||0)+w;localChanged=true;}
    var tier=moaPolicyLearningTier_(r[2],r[3],r[9],r[10],r[12]);if(String(r[13]||"")!==tier){r[13]=tier;localChanged=true;}
    if(localChanged&&(beforeTier!=="observing"||tier!=="observing"))publicChanged=true;
    if(!localChanged)return;r[6]=now;r[7]=activity;r[8]="active";dirty[i]=true;changed=true;
  });
  Object.keys(dirty).map(Number).filter(function(i){return i<originalCount}).forEach(function(i){sh.getRange(i+2,1,1,14).setValues([rows[i]]);});
  var appended=rows.slice(originalCount);if(appended.length)sh.getRange(originalCount+2,1,appended.length,14).setValues(appended);
  return publicChanged;
}
function moaCommit_(data){
  var uid=String(data.user_id||"").trim();if(!uid)return jsonResponse_({ok:false,error:"MOA_COMMIT_USER_REQUIRED"});
  var events=moaJson_(data.events_json,[]);if(!Array.isArray(events))events=[];events=events.slice(0,30);var prof=moaJson_(data.profile_json,null),changedPublic=false;
  var lock=LockService.getScriptLock();if(!lock.tryLock(4500))return jsonResponse_({ok:false,error:"MOA_COMMIT_BUSY"});
  try{
    moaActivityTick_();changedPublic=moaStoreFeedbackEvents_(uid,events)||changedPublic;changedPublic=moaStorePolicyEvents_(uid,events)||changedPublic;
    events.forEach(function(ev){if(ev&&ev.type==="memory")moaWriteMemory_(uid,ev.key,ev.value,ev.label);});if(prof&&typeof prof==="object")moaWriteProfile_(uid,prof);
    if(changedPublic)moaBumpSyncVersion_();return jsonResponse_({ok:true,stored:events.length,version:moaCurrentSyncVersion_()});
  }finally{lock.releaseLock();}
}

function moaRunLearningMaintenance_(){
  var activity=moaCurrentActivitySerial_(),out={ok:true,dormant:0,deleted:0},changed=false;
  var sh=moaEnsurePhraseWidth_(),last=sh.getLastRow();if(last>1){var rows=sh.getRange(2,1,last-1,22).getValues(),del=[];
    for(var i=rows.length-1;i>=0;i--){var r=rows[i],pos=Number(r[5]||0),neg=Number(r[6]||0),lastAct=Number(r[12]||0),st=String(r[13]||"active");if(!lastAct){sh.getRange(i+2,13).setValue(activity);continue;}var tier=moaLearningTier_(pos,neg,Number(r[17]||pos||0),Number(r[18]||neg||0),Number(r[20]||0));if(activity-lastAct<MOA_MAINTENANCE_ACTIVITY_STEP||tier!=="observing")continue;if(st==="dormant"){del.push(i+2);out.deleted++;changed=true;}else{sh.getRange(i+2,13,1,2).setValues([[activity,"dormant"]]);out.dormant++;changed=true;}}
    del.forEach(function(rn){sh.deleteRow(rn)});
  }
  var ps=moaEnsurePolicyWidth_(),pl=ps.getLastRow();if(pl>1){var prows=ps.getRange(2,1,pl-1,14).getValues(),pdel=[];
    for(var j=prows.length-1;j>=0;j--){var pr=prows[j],pp=Number(pr[2]||0),pn=Number(pr[3]||0),pa=Number(pr[7]||0),pst=String(pr[8]||"active");if(!pa){ps.getRange(j+2,8).setValue(activity);continue;}var ptier=moaPolicyLearningTier_(pp,pn,Number(pr[9]||pp||0),Number(pr[10]||pn||0),Number(pr[12]||0));if(activity-pa<MOA_MAINTENANCE_ACTIVITY_STEP||ptier!=="observing")continue;if(pst==="dormant"){pdel.push(j+2);out.deleted++;changed=true;}else{ps.getRange(j+2,8,1,2).setValues([[activity,"dormant"]]);out.dormant++;changed=true;}}
    pdel.forEach(function(rn){ps.deleteRow(rn)});
  }
  if(changed)moaBumpSyncVersion_();return out;
}
function moaInstallMaintenanceTrigger_(){moaRemoveMaintenanceTrigger_();ScriptApp.newTrigger("moaRunLearningMaintenance_").timeBased().everyWeeks(1).create();}
function moaRemoveMaintenanceTrigger_(){ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==="moaRunLearningMaintenance_")ScriptApp.deleteTrigger(t)});}

/** 더 이상 사용하지 않는 모아 AI 레거시 시트를 필요할 때 한 번 정리합니다. */
function moaCleanupLegacySheets(){var ss=SpreadsheetApp.getActiveSpreadsheet();["모아_학습후보","모아_반응학습","모아_주제학습"].forEach(function(n){var s=ss.getSheetByName(n);if(s)ss.deleteSheet(s);});}
