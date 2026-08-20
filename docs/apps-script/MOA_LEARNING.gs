/**
 * MOA_LEARNING.gs
 * 모아 자연학습 신호/개인기억 저장.
 * 모든 대화 원문을 서버에 저장하지 않고, 사용자가 명확히 긍정/정정한 학습 신호와 제한된 개인 기억만 기록합니다.
 * 기존 미나용 `대화` 시트와는 연결하지 않습니다.
 *
 * [완전 제거]
 * - 자동 유지보수 트리거를 설치했다면 먼저 moaRemoveMaintenanceTrigger_()를 한 번 실행
 * - MOA_CHAT.gs와 이 파일 삭제
 * - Code.gs의 MOA_CHAT_INTEGRATION 블록 삭제 후 웹앱 재배포
 * - 필요하면 `모아_대화`, `모아_학습후보`, `모아_개인기억`, `모아_표현학습`, `모아_반응학습` 시트 삭제
 * - Firebase 관련 정리는 필요 없음
 */
function moaCandidateSheet_(){return moaEnsureSheet_(MOA_CANDIDATE_SHEET,["candidate_id","user_id","원질문","모아답변","사용자후속반응","반응","반복횟수","신뢰도","상태","생성일","최근일","source","last_activity_serial","supporter_hashes"])}
function moaMemorySheet_(){return moaEnsureSheet_(MOA_MEMORY_SHEET,["user_id","key","value","label","confidence","created_at","updated_at"])}
function moaUserHash_(userId){
  var bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(userId||""),Utilities.Charset.UTF_8);return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g,"").slice(0,18);
}
function moaHashList_(value){return String(value||"").split(",").map(function(v){return v.trim();}).filter(Boolean);}
function moaAddUniqueHash_(value,hash){var list=moaHashList_(value);if(hash&&list.indexOf(hash)<0)list.push(hash);return list.join(",");}
function moaReactionProfileAdd_(raw,tag,userHash){
  var obj={};try{obj=raw?JSON.parse(String(raw)):{};}catch(e){obj={};}
  tag=String(tag||"neutral").replace(/[^a-z_]/gi,"").slice(0,24)||"neutral";
  var list=Array.isArray(obj[tag])?obj[tag]:[];
  if(userHash&&list.indexOf(userHash)<0){list.push(userHash);if(list.length>32)list=list.slice(-32);}
  obj[tag]=list;return JSON.stringify(obj);
}
function moaExtractCorrection_(text){
  var s=String(text||"").trim();
  s=s.replace(/^(?:아니(?:야)?|아닌데|그게\s*아니라|틀렸어|정정할게|정정하면|ㄴㄴ)[,.!?\s-]*/i,"").trim();
  return s||String(text||"").trim();
}


/*
 * v80 새 반응표현 학습
 * - 클라이언트가 이미 확실히 분류한 문장 안의 "낯선 짧은 토큰"만 증거로 수집합니다.
 * - 한 사용자가 반복해도 한 표입니다. 자동 active는 4명 이상의 동일 의미 증거 + 80% 이상 일치 + 단독 사용 2명 이상 + 서로 다른 문맥증거 2종 이상을 모두 요구합니다.
 * - 아무 단서도 없는 낯선 표현은 standalone unknown으로만 관찰합니다. 일반명사+맞아 같은 문장만으로는 승격되지 않습니다.
 * - active 표현은 클라이언트가 모아 방 진입 때 1회 받아 이해용 사전에만 사용합니다. 모아 출력 문장으로 복사하지 않습니다.
 */
function moaReactionSheet_(){return moaEnsureSheet_(MOA_REACTION_SHEET,["normalized_expression","display_expression","inferred_tag","status","confidence","supporter_count","evidence_json","created_at","updated_at","last_activity_serial","maintenance_state","note"])}
function moaReactionAllowedTag_(tag){return {agreement:1,laughter:1,playful_positive:1,gratitude:1,praise:1,negative:1,correction:1}[String(tag||"")]?String(tag):"";}
function moaReactionTerm_(value){
  var s=String(value||"").trim().toLowerCase();try{s=s.normalize("NFC");}catch(e){}
  s=s.replace(/[~!@#$%^&*()_+={}\[\]|\\:;"'<>,.·…！？。\s]/g,"").replace(/ㅋ{4,}/g,"ㅋㅋㅋ").replace(/ㅎ{4,}/g,"ㅎㅎㅎ");
  if(s.length<2||s.length>18||!/^[0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ?]+$/i.test(s)||/^\d+$/.test(s))return "";
  return s;
}
function moaReactionEvidence_(raw){var obj={};try{obj=raw?JSON.parse(String(raw)):{};}catch(e){obj={};}return obj&&typeof obj==="object"?obj:{};}
function moaReactionEvidenceAdd_(obj,tag,userHash,mode,evidenceKey){
  Object.keys(obj).forEach(function(k){if(k.charAt(0)!=="_"&&Array.isArray(obj[k]))obj[k]=obj[k].filter(function(h){return h!==userHash;});});
  if(tag){var list=Array.isArray(obj[tag])?obj[tag]:[];if(userHash&&list.indexOf(userHash)<0)list.push(userHash);if(list.length>64)list=list.slice(-64);obj[tag]=list;}
  if(mode==="standalone"){
    var stand=Array.isArray(obj._standalone)?obj._standalone:[];if(userHash&&stand.indexOf(userHash)<0)stand.push(userHash);if(stand.length>64)stand=stand.slice(-64);obj._standalone=stand;
  }
  if(mode==="contextual"&&evidenceKey){
    var contexts=obj._contexts&&typeof obj._contexts==="object"&&!Array.isArray(obj._contexts)?obj._contexts:{};
    var ck=String(evidenceKey).slice(0,64),users=Array.isArray(contexts[ck])?contexts[ck]:[];
    if(userHash&&users.indexOf(userHash)<0)users.push(userHash);if(users.length>48)users=users.slice(-48);contexts[ck]=users;obj._contexts=contexts;
  }
  return obj;
}
function moaReactionEvidenceSummary_(obj){
  var allowed=["agreement","laughter","playful_positive","gratitude","praise","negative","correction"],best="",bestCount=0,all={};
  allowed.forEach(function(tag){(Array.isArray(obj[tag])?obj[tag]:[]).forEach(function(h){all[h]=1;});var n=(obj[tag]||[]).length;if(n>bestCount){best=tag;bestCount=n;}});
  var total=Object.keys(all).length,ratio=total?bestCount/total:0,standalone=Array.isArray(obj._standalone)?obj._standalone.length:0;
  var contexts=obj._contexts&&typeof obj._contexts==="object"&&!Array.isArray(obj._contexts)?Object.keys(obj._contexts).filter(function(k){return Array.isArray(obj._contexts[k])&&obj._contexts[k].length>0;}).length:0;
  var confidence=bestCount?Math.min(.95,.50+bestCount*.065+Math.max(0,ratio-.5)*.2+Math.min(.08,standalone*.02)+Math.min(.06,contexts*.02)):0;
  var promotable=bestCount>=4&&ratio>=.80&&standalone>=2&&contexts>=2;
  return {tag:best,count:bestCount,total:total,ratio:ratio,standalone:standalone,contexts:contexts,confidence:confidence,promotable:promotable};
}
function moaInvalidateReactionCache_(){CacheService.getScriptCache().remove(MOA_REACTION_CACHE_KEY);}
function moaReactionObserve_(data){
  var userId=String(data.user_id||"").trim(), expression=String(data.expression||"").trim().slice(0,48), suggested=moaReactionAllowedTag_(data.suggested_tag), clientConfidence=Number(data.confidence||0), rawTerms=String(data.unknown_terms||"").split(","), mode=String(data.observation_mode||"").trim(), evidenceKey=String(data.evidence_key||"").trim().slice(0,64);
  if(!userId||!expression)return jsonResponse_({ok:false,error:"MOA_REACTION_OBSERVE_INVALID"});
  if(mode!=="standalone"&&mode!=="contextual")mode=suggested?"contextual":"standalone";
  var terms=[];rawTerms.forEach(function(v){var t=moaReactionTerm_(v);if(t&&terms.indexOf(t)<0)terms.push(t);});
  /* v80: 의미 없는 전체 문장을 임의 후보로 만들지 않습니다. 단독 unknown은 한 토큰일 때만 빈도 증거로 저장합니다. */
  if(!terms.length&&!suggested&&mode==="standalone"){var whole=moaReactionTerm_(expression);if(whole&&String(expression).trim().split(/\s+/).length===1)terms=[whole];}
  if(!terms.length)return jsonResponse_({ok:true,stored:false});
  terms=terms.slice(0,2);moaActivityTick_();
  var lock=LockService.getScriptLock();if(!lock.tryLock(3500))return jsonResponse_({ok:false,error:"MOA_LEARNING_BUSY"});
  try{
    var sheet=moaReactionSheet_(),last=sheet.getLastRow(),start=Math.max(2,last-999),values=last>=start?sheet.getRange(start,1,last-start+1,12).getValues():[],userHash=moaUserHash_(userId),now=new Date(),activity=moaCurrentActivitySerial_(),changed=false,stored=0;
    terms.forEach(function(term){
      var rowNum=0,row=null;for(var i=values.length-1;i>=0;i--){if(String(values[i][0])===term){rowNum=start+i;row=values[i];break;}}
      var evidence=moaReactionEvidence_(row&&row[6]),tag=(suggested&&clientConfidence>=.80&&mode==="contextual")?suggested:"";
      evidence=moaReactionEvidenceAdd_(evidence,tag,userHash,mode,evidenceKey);var summary=moaReactionEvidenceSummary_(evidence);
      var status=summary.promotable?"active":"candidate",confidence=status==="active"?summary.confidence:Math.min(.64,summary.confidence||.18),created=row&&row[7]||now,display=row&&row[1]||term,oldStatus=String(row&&row[3]||"");
      var note="v80 standalone="+summary.standalone+", contexts="+summary.contexts+", ratio="+Math.round(summary.ratio*100)+"%";
      var dataRow=[term,display,summary.tag,status,confidence,summary.count,JSON.stringify(evidence),created,now,activity,status==="active"?"protected":"active",note];
      if(rowNum)sheet.getRange(rowNum,1,1,12).setValues([dataRow]);else{sheet.appendRow(dataRow);values.push(dataRow);last++;}
      if(status!==oldStatus)changed=true;stored++;
    });
    if(changed)moaInvalidateReactionCache_();
    return jsonResponse_({ok:true,stored:stored});
  }finally{lock.releaseLock();}
}
function moaReactionLexicon_(data){
  var cache=CacheService.getScriptCache(),hit=cache.get(MOA_REACTION_CACHE_KEY);if(hit){try{return jsonResponse_({ok:true,entries:JSON.parse(hit),cached:true});}catch(e){}}
  var sheet=moaReactionSheet_(),last=sheet.getLastRow(),entries=[];
  if(last>1)sheet.getRange(2,1,last-1,12).getDisplayValues().forEach(function(r){
    if(String(r[3])!=="active")return;var tag=moaReactionAllowedTag_(r[2]),expression=String(r[0]||"");if(!tag||!expression)return;
    /* v79에서 승격된 행도 새 안전기준을 다시 통과해야 배포합니다. 예전 evidence에는 standalone/context가 없어 자동 격리됩니다. */
    var summary=moaReactionEvidenceSummary_(moaReactionEvidence_(r[6]));if(!summary.promotable||summary.tag!==tag)return;
    entries.push({expression:expression,tag:tag,confidence:Number(r[4]||summary.confidence||.8),supporters:summary.count});
  });
  entries.sort(function(a,b){return b.supporters-a.supporters||b.confidence-a.confidence;});entries=entries.slice(0,220);cache.put(MOA_REACTION_CACHE_KEY,JSON.stringify(entries),21600);
  return jsonResponse_({ok:true,entries:entries,cached:false});
}

function moaUpdatePhraseSignal_(userId, phrase, candidateId, reply, source, reaction, reactionTag){
  if(!phrase||!candidateId||!reply)return false;
  if(source==="fallback"||source==="memory"||source==="local"||/^(wiki|wikipedia|duckduckgo|open-meteo|frankfurter|google-news|web-search|search)/.test(source))return false;
  var norm=moaCompact_(phrase);if(!norm||norm.length<2)return false;
  var sheet=moaPhraseSheet_(), last=sheet.getLastRow(), rowNum=0;
  if(last>1){
    var values=sheet.getRange(2,1,last-1,16).getDisplayValues();
    for(var i=values.length-1;i>=0;i--){if(values[i][0]===norm&&values[i][2]===candidateId){rowNum=i+2;break}}
  }
  var now=new Date(), activity=moaCurrentActivitySerial_(), userHash=moaUserHash_(userId);
  if(rowNum){
    var row=sheet.getRange(rowNum,1,1,16).getValues()[0], pos=Number(row[5]||0), neg=Number(row[6]||0), posHashes=String(row[13]||""), negHashes=String(row[14]||""), reactionProfile=moaReactionProfileAdd_(row[15],reactionTag,userHash);
    if(reaction==="positive"){
      var nextPos=moaAddUniqueHash_(posHashes,userHash);if(nextPos!==posHashes){pos++;posHashes=nextPos;}
    }else{
      var nextNeg=moaAddUniqueHash_(negHashes,userHash);if(nextNeg!==negHashes){neg++;negHashes=nextNeg;}
    }
    sheet.getRange(rowNum,1,1,16).setValues([[norm,phrase,candidateId,reply,source,pos,neg,userId,row[8]||now,now,row[10]||"경청",activity,"active",posHashes,negHashes,reactionProfile]]);
  }else{
    sheet.appendRow([norm,phrase,candidateId,reply,source,reaction==="positive"?1:0,reaction==="positive"?0:1,userId,now,now,"경청",activity,"active",reaction==="positive"?userHash:"",reaction==="positive"?"":userHash,moaReactionProfileAdd_("",reactionTag,userHash)]);
  }
  moaInvalidateDialogCache_();
  return true;
}

function moaFeedback_(data){
  var userId=String(data.user_id||"").trim(), reaction=String(data.reaction||"").trim(), reactionTag=String(data.reaction_tag||"").trim(), candidateId=String(data.candidate_id||"").trim(), question=String(data.previous_user_text||"").trim(), reply=String(data.previous_reply||"").trim(), source=String(data.previous_source||"").trim(), followup=String(data.followup||"").trim();
  if(!userId||!["positive","negative","correction","repeat_question"].includes(reaction))return jsonResponse_({ok:false,error:"MOA_FEEDBACK_INVALID"});
  moaActivityTick_();
  var lock=LockService.getScriptLock();if(!lock.tryLock(4000))return jsonResponse_({ok:false,error:"MOA_LEARNING_BUSY"});
  try{
    /* 사용자가 평소처럼 "맞아/응"이라고 반응하면 해당 질문 표현과 이미 안전하게 나온 답변의 연결 강도를 올립니다.
       builtin 답변도 이렇게 2회 이상 긍정되면 모아 전용 표현학습으로 재사용됩니다. */
    var phraseStored=false;
    if(candidateId&&question&&reply&&(reaction==="positive"||reaction==="negative"||reaction==="correction")){
      phraseStored=moaUpdatePhraseSignal_(userId,question,candidateId,reply,source,reaction==="positive"?"positive":"negative",reactionTag||reaction);
    }

    /* 사용자의 정정은 귀중한 학습 후보지만, 장난/오정보가 전 사용자에게 바로 퍼지지 않도록 자동 공용승격하지 않습니다. */
    if(reaction!=="correction"&&reaction!=="repeat_question")return jsonResponse_({ok:true,stored:phraseStored,kind:"phrase"});
    if(!question||!followup)return jsonResponse_({ok:true,stored:phraseStored});
    var learnedFollowup=reaction==="correction"?moaExtractCorrection_(followup):followup;
    var sheet=moaCandidateSheet_(), last=sheet.getLastRow(), normalized=moaCompact_(question)+"|"+moaCompact_(learnedFollowup), start=Math.max(2,last-300), found=0, activity=moaCurrentActivitySerial_(), userHash=moaUserHash_(userId);
    if(last>=start){
      var values=sheet.getRange(start,1,last-start+1,14).getDisplayValues();
      for(var i=values.length-1;i>=0;i--){var row=values[i];if((moaCompact_(row[2])+"|"+moaCompact_(row[4]))===normalized){found=start+i;break}}
    }
    var now=new Date();
    if(found){
      var existing=sheet.getRange(found,1,1,14).getValues()[0], hashes=String(existing[13]||""), nextHashes=moaAddUniqueHash_(hashes,userHash), count=moaHashList_(nextHashes).length;
      if(nextHashes!==hashes){var confidence=Math.min(.86,.28+count*.12), created=existing[9]||now;sheet.getRange(found,7,1,8).setValues([[count,confidence,count>=3?"review":"candidate",created,now,source,activity,nextHashes]]);}
      else sheet.getRange(found,11,1,3).setValues([[now,source,activity]]);
    }else sheet.appendRow(["cand_"+Utilities.getUuid(),userId,question,reply,learnedFollowup,reaction,1,.40,"candidate",now,now,source,activity,userHash]);
    return jsonResponse_({ok:true,stored:true,kind:"candidate"});
  }finally{lock.releaseLock()}
}


/*
 * 모아 자동학습 유지보수.
 * IMPORTANT: 날짜가 오래됐다는 이유만으로는 어떤 행도 삭제하지 않습니다.
 * `last_activity_serial` 이후 실제 모아 상호작용이 MOA_MAINTENANCE_ACTIVITY_STEP 이상 누적되어야만
 * 1차 휴면 후보가 되고, 휴면 이후 다시 같은 양의 실제 활동이 누적되어야 삭제될 수 있습니다.
 * 따라서 프로그램을 몇 달/몇 년 사용하지 않아도 activity serial이 그대로면 자동 삭제는 0건입니다.
 */
function moaRunLearningMaintenance_(){
  var activity=moaCurrentActivitySerial_();
  if(activity<MOA_MAINTENANCE_ACTIVITY_STEP)return {ok:true,skipped:true,reason:"NOT_ENOUGH_REAL_ACTIVITY",activity:activity};
  var lock=LockService.getScriptLock();if(!lock.tryLock(5000))return {ok:false,error:"MOA_MAINTENANCE_BUSY"};
  try{
    var result={ok:true,activity:activity,phrasesDormant:0,phrasesDeleted:0,candidatesDormant:0,candidatesDeleted:0};

    // 1) 자동 표현학습: 평균 반응량의 1/4 미만 + 충분한 실제 활동 경과 시에만 휴면/삭제.
    var ps=moaPhraseSheet_(), pl=ps.getLastRow();
    if(pl>1){
      var pv=ps.getRange(2,1,pl-1,16).getValues(), total=0, counted=0;
      pv.forEach(function(r){var n=Number(r[5]||0)+Number(r[6]||0);if(n>0){total+=n;counted++;}});
      var avg=counted?total/counted:0, cutoff=Math.max(1,avg/4), deleteRows=[];
      for(var i=pv.length-1;i>=0;i--){
        var r=pv[i], usage=Number(r[5]||0)+Number(r[6]||0), lastSerial=Number(r[11]||0), state=String(r[12]||"active").toLowerCase();
        // 기존 행처럼 serial이 없는 데이터는 자동 삭제하지 않고 현재 기준점만 심습니다.
        if(!lastSerial){ps.getRange(i+2,12,1,2).setValues([[activity,state||"active"]]);continue;}
        if(activity-lastSerial<MOA_MAINTENANCE_ACTIVITY_STEP)continue;
        var lowUse=usage<cutoff, weak=Number(r[5]||0)<=Number(r[6]||0)||usage<=1;
        if(!(lowUse&&weak))continue;
        if(state==="dormant"){deleteRows.push(i+2);result.phrasesDeleted++;}
        else{ps.getRange(i+2,12,1,2).setValues([[activity,"dormant"]]);result.phrasesDormant++;}
      }
      deleteRows.sort(function(a,b){return b-a;}).forEach(function(row){ps.deleteRow(row);});
    }

    // 2) 학습후보: 검증이 거의 없는 자동 후보만 동일한 2단계 정책 적용.
    var cs=moaCandidateSheet_(), cl=cs.getLastRow();
    if(cl>1){
      var cv=cs.getRange(2,1,cl-1,14).getValues(), del=[];
      for(var j=cv.length-1;j>=0;j--){
        var c=cv[j], repeats=Number(c[6]||0), conf=Number(c[7]||0), status=String(c[8]||"candidate").toLowerCase(), lastAct=Number(c[12]||0);
        if(status==="review"||status==="approved"||status==="protected"||status==="pinned")continue;
        if(!lastAct){cs.getRange(j+2,13).setValue(activity);continue;}
        if(activity-lastAct<MOA_MAINTENANCE_ACTIVITY_STEP)continue;
        if(!(repeats<=1&&conf<0.45))continue;
        if(status==="dormant"){del.push(j+2);result.candidatesDeleted++;}
        else{cs.getRange(j+2,9).setValue("dormant");cs.getRange(j+2,13).setValue(activity);result.candidatesDormant++;}
      }
      del.sort(function(a,b){return b-a;}).forEach(function(row){cs.deleteRow(row);});
    }

    // 3) 새 반응표현 후보: active로 검증된 표현은 보호하고, 증거가 거의 없는 후보만 2단계 정리합니다.
    result.reactionsDormant=0;result.reactionsDeleted=0;
    var rs=moaReactionSheet_(),rl=rs.getLastRow();
    if(rl>1){
      var rv=rs.getRange(2,1,rl-1,12).getValues(),rdel=[];
      for(var k=rv.length-1;k>=0;k--){var rr=rv[k],statusR=String(rr[3]||"candidate").toLowerCase(),support=Number(rr[5]||0),lastR=Number(rr[9]||0),stateR=String(rr[10]||"active").toLowerCase();
        if(statusR==="active"||stateR==="protected")continue;if(!lastR){rs.getRange(k+2,10).setValue(activity);continue;}if(activity-lastR<MOA_MAINTENANCE_ACTIVITY_STEP)continue;if(support>1)continue;
        if(stateR==="dormant"){rdel.push(k+2);result.reactionsDeleted++;}else{rs.getRange(k+2,10,1,2).setValues([[activity,"dormant"]]);result.reactionsDormant++;}
      }
      rdel.sort(function(a,b){return b-a;}).forEach(function(row){rs.deleteRow(row);});
    }

    // 4) 주제/관계 학습: 사용자 1명 이하의 약한 후보만 2단계 정리. 3명 이상 active는 보호합니다.
    result.topicsDormant=0;result.topicsDeleted=0;
    var ts=moaTopicSheet_(),tl=ts.getLastRow();
    if(tl>1){
      var tv=ts.getRange(2,1,tl-1,8).getValues(),tdel=[];
      for(var ti=tv.length-1;ti>=0;ti--){var tr=tv[ti],supportT=Number(tr[3]||0),lastT=Number(tr[6]||0),stateT=String(tr[7]||"candidate").toLowerCase();
        if(stateT==="active"||supportT>=3)continue;if(!lastT){ts.getRange(ti+2,7).setValue(activity);continue;}if(activity-lastT<MOA_MAINTENANCE_ACTIVITY_STEP)continue;if(supportT>1)continue;
        if(stateT==="dormant"){tdel.push(ti+2);result.topicsDeleted++;}else{ts.getRange(ti+2,7,1,2).setValues([[activity,"dormant"]]);result.topicsDormant++;}
      }
      tdel.sort(function(a,b){return b-a;}).forEach(function(row){ts.deleteRow(row);});
    }

    // 모아_대화(확정/수동 학습)와 모아_개인기억은 이 유지보수 함수가 삭제하지 않습니다.
    if(result.phrasesDormant||result.phrasesDeleted||result.candidatesDormant||result.candidatesDeleted)moaInvalidateDialogCache_();
    if(result.reactionsDormant||result.reactionsDeleted)moaInvalidateReactionCache_();
    PropertiesService.getScriptProperties().setProperty("moa.maintenance.last.activity",String(activity));
    return result;
  }finally{lock.releaseLock();}
}

function moaInstallMaintenanceTrigger_(){
  // 한 번 실행하면 주 1회 유지보수. 같은 핸들러의 중복 트리거는 먼저 제거합니다.
  ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==="moaRunLearningMaintenance_")ScriptApp.deleteTrigger(t);});
  ScriptApp.newTrigger("moaRunLearningMaintenance_").timeBased().everyWeeks(1).create();
  return {ok:true,handler:"moaRunLearningMaintenance_",policy:"REAL_ACTIVITY_ONLY"};
}

function moaRemoveMaintenanceTrigger_(){
  var removed=0;ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==="moaRunLearningMaintenance_"){ScriptApp.deleteTrigger(t);removed++;}});
  return {ok:true,removed:removed};
}

function moaMemoryGet_(data){
  var userId=String(data.user_id||"").trim(), key=String(data.memory_key||"").trim();if(!userId||!key)return jsonResponse_({ok:false,error:"MOA_MEMORY_INVALID"});
  var allowed={like:1,dislike:1,nickname:1,hobby:1};if(!allowed[key])return jsonResponse_({ok:false,error:"MOA_MEMORY_KEY_DENIED"});
  var cache=CacheService.getUserCache(), ck="moa.mem."+userId+"."+key, hit=cache.get(ck);if(hit){try{return jsonResponse_(JSON.parse(hit))}catch(e){}}
  var sheet=moaMemorySheet_(), last=sheet.getLastRow();
  if(last>1){var found=sheet.createTextFinder(userId).matchEntireCell(true).findAll();for(var i=found.length-1;i>=0;i--){var row=found[i].getRow(), values=sheet.getRange(row,1,1,7).getDisplayValues()[0];if(values[1]===key){var out={ok:true,key:key,value:values[2],label:values[3],confidence:Number(values[4]||.7)};cache.put(ck,JSON.stringify(out),3600);return jsonResponse_(out)}}}
  return jsonResponse_({ok:true,key:key,value:"",label:"",confidence:0});
}

function moaMemorySet_(data){
  var userId=String(data.user_id||"").trim(), key=String(data.memory_key||"").trim(), value=String(data.value||"").trim(), label=String(data.label||"").trim();
  var allowed={like:1,dislike:1,nickname:1,hobby:1};if(!userId||!allowed[key]||!value||value.length>80)return jsonResponse_({ok:false,error:"MOA_MEMORY_INVALID"});
  var lock=LockService.getScriptLock();if(!lock.tryLock(4000))return jsonResponse_({ok:false,error:"MOA_LEARNING_BUSY"});
  try{
    var sheet=moaMemorySheet_(), last=sheet.getLastRow(), rowNum=0;
    if(last>1){var found=sheet.createTextFinder(userId).matchEntireCell(true).findAll();for(var i=found.length-1;i>=0;i--){var r=found[i].getRow();if(String(sheet.getRange(r,2).getValue())===key){rowNum=r;break}}}
    var now=new Date();if(rowNum){var created=sheet.getRange(rowNum,6).getValue()||now;sheet.getRange(rowNum,1,1,7).setValues([[userId,key,value,label,.8,created,now]])}else sheet.appendRow([userId,key,value,label,.8,now,now]);
    CacheService.getUserCache().remove("moa.mem."+userId+"."+key);
    return jsonResponse_({ok:true,stored:true,key:key,value:value});
  }finally{lock.releaseLock()}
}

/* ============================================================
 * v84 전체 재정비: 주제/관계 학습
 * - 대화 원문은 저장하지 않고 클라이언트가 추출한 짧은 핵심 소재와 관계만 저장합니다.
 * - 같은 사용자의 반복은 사용자 해시 1표로 취급합니다.
 * - 3명 이상에게 반복된 주제만 공용 힌트로 사용하고, 연관어는 2명 이상 겹칠 때만 노출합니다.
 * ============================================================ */
function moaTopicSheet_(){
  return moaEnsureSheet_(MOA_TOPIC_SHEET,["concept","evidence_json","user_hashes","support_users","created_at","updated_at","last_activity_serial","maintenance_state"]);
}
function moaTopicTerm_(value){
  var s=String(value||"").toLowerCase().replace(/[^0-9a-z가-힣ㄱ-ㅎㅏ-ㅣ-]/gi,"").trim();
  if(s.length<2||s.length>16)return "";
  var stop={"오늘":1,"어제":1,"내일":1,"지금":1,"진짜":1,"완전":1,"그냥":1,"근데":1,"그래서":1,"그리고":1,"나는":1,"내가":1,"나도":1,"너는":1,"모아":1,"친구":1,"그거":1,"이거":1,"저거":1};
  return stop[s]?"":s;
}
function moaTopicEvidence_(raw){
  try{var obj=JSON.parse(String(raw||"{}"));if(!obj||typeof obj!=="object"||Array.isArray(obj))return {related:{},actions:{},affects:{},intents:{}};return {related:obj.related||{},actions:obj.actions||{},affects:obj.affects||{},intents:obj.intents||{}};}catch(e){return {related:{},actions:{},affects:{},intents:{}};}
}
function moaTopicEvidenceAddHash_(bucket,key,hash){
  if(!key||!hash)return;var list=Array.isArray(bucket[key])?bucket[key]:[];if(list.indexOf(hash)<0)list.push(hash);if(list.length>24)list=list.slice(-24);bucket[key]=list;
}
function moaTopicObserve_(data){
  var userId=String(data.user_id||"").trim();if(!userId)return jsonResponse_({ok:false,error:"MOA_TOPIC_USER_REQUIRED"});
  var raw=[];try{raw=JSON.parse(String(data.concepts_json||"[]"));}catch(e){raw=[];}if(!Array.isArray(raw))raw=[];
  var concepts=[];raw.slice(0,4).forEach(function(v){var t=moaTopicTerm_(v);if(t&&concepts.indexOf(t)<0)concepts.push(t);});
  if(!concepts.length)return jsonResponse_({ok:true,stored:0});
  var action=String(data.action||"").replace(/[^a-z_]/gi,"").slice(0,24),affect=String(data.affect||"").replace(/[^a-z_]/gi,"").slice(0,24),intent=String(data.intent||"").replace(/[^a-z_]/gi,"").slice(0,24);
  var hash=moaUserHash_(userId), sheet=moaTopicSheet_(), lock=LockService.getScriptLock();if(!lock.tryLock(3500))return jsonResponse_({ok:false,error:"MOA_LEARNING_BUSY"});
  try{
    moaActivityTick_();var now=new Date(),activity=moaCurrentActivitySerial_(),stored=0,last=sheet.getLastRow();
    var map={};if(last>1)sheet.getRange(2,1,last-1,8).getValues().forEach(function(r,i){map[String(r[0]||"")]= {row:i+2,data:r};});
    concepts.forEach(function(concept){
      var found=map[concept],ev=moaTopicEvidence_(found&&found.data[1]),users=String(found&&found.data[2]||"").split(",").filter(Boolean);if(users.indexOf(hash)<0)users.push(hash);if(users.length>48)users=users.slice(-48);
      concepts.forEach(function(other){if(other!==concept)moaTopicEvidenceAddHash_(ev.related,other,hash);});
      moaTopicEvidenceAddHash_(ev.actions,action,hash);moaTopicEvidenceAddHash_(ev.affects,affect,hash);moaTopicEvidenceAddHash_(ev.intents,intent,hash);
      var support=users.length,state=support>=3?"active":"candidate",row=[concept,JSON.stringify(ev),users.join(","),support,found&&found.data[4]||now,now,activity,state];
      if(found)sheet.getRange(found.row,1,1,8).setValues([row]);else{sheet.appendRow(row);map[concept]={row:sheet.getLastRow(),data:row};}stored++;
    });
    return jsonResponse_({ok:true,stored:stored});
  }finally{lock.releaseLock();}
}
function moaTopicHints_(semantic){
  var concepts=semantic&&Array.isArray(semantic.concepts)?semantic.concepts.slice(0,4).map(moaTopicTerm_).filter(Boolean):[];if(!concepts.length)return [];
  var sheet=moaTopicSheet_(),last=sheet.getLastRow();if(last<=1)return [];
  var wanted={};concepts.forEach(function(v){wanted[v]=1;});var hints={},rows=sheet.getRange(2,1,last-1,8).getDisplayValues();
  rows.forEach(function(r){var concept=String(r[0]||"");if(!wanted[concept]||Number(r[3]||0)<3||String(r[7]||"")!=="active")return;var ev=moaTopicEvidence_(r[1]);Object.keys(ev.related||{}).forEach(function(term){var n=Array.isArray(ev.related[term])?ev.related[term].length:0;if(n>=2&&concepts.indexOf(term)<0)hints[term]=Math.max(hints[term]||0,n);});});
  return Object.keys(hints).map(function(term){return {term:term,support:hints[term]};}).sort(function(a,b){return b.support-a.support;}).slice(0,4);
}
