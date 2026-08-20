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
 * - 필요하면 `모아_대화`, `모아_학습후보`, `모아_개인기억`, `모아_표현학습` 시트 삭제
 * - Firebase 관련 정리는 필요 없음
 */
function moaCandidateSheet_(){return moaEnsureSheet_(MOA_CANDIDATE_SHEET,["candidate_id","user_id","원질문","모아답변","사용자후속반응","반응","반복횟수","신뢰도","상태","생성일","최근일","source","last_activity_serial"])}
function moaMemorySheet_(){return moaEnsureSheet_(MOA_MEMORY_SHEET,["user_id","key","value","label","confidence","created_at","updated_at"])}

function moaUpdatePhraseSignal_(userId, phrase, candidateId, reply, source, reaction){
  if(!phrase||!candidateId||!reply)return false;
  if(source==="fallback"||source==="wiki"||source==="memory"||source==="local")return false;
  var norm=moaCompact_(phrase);if(!norm||norm.length<2)return false;
  var sheet=moaPhraseSheet_(), last=sheet.getLastRow(), rowNum=0;
  if(last>1){
    var values=sheet.getRange(2,1,last-1,13).getDisplayValues();
    for(var i=values.length-1;i>=0;i--){if(values[i][0]===norm&&values[i][2]===candidateId){rowNum=i+2;break}}
  }
  var now=new Date(), activity=moaCurrentActivitySerial_();
  if(rowNum){
    var row=sheet.getRange(rowNum,1,1,13).getValues()[0], pos=Number(row[5]||0), neg=Number(row[6]||0);
    if(reaction==="positive")pos++;else neg++;
    sheet.getRange(rowNum,1,1,13).setValues([[norm,phrase,candidateId,reply,source,pos,neg,userId,row[8]||now,now,row[10]||"경청",activity,"active"]]);
  }else{
    sheet.appendRow([norm,phrase,candidateId,reply,source,reaction==="positive"?1:0,reaction==="positive"?0:1,userId,now,now,"경청",activity,"active"]);
  }
  moaInvalidateDialogCache_();
  return true;
}

function moaFeedback_(data){
  var userId=String(data.user_id||"").trim(), reaction=String(data.reaction||"").trim(), candidateId=String(data.candidate_id||"").trim(), question=String(data.previous_user_text||"").trim(), reply=String(data.previous_reply||"").trim(), source=String(data.previous_source||"").trim(), followup=String(data.followup||"").trim();
  if(!userId||!["positive","negative","correction","repeat_question"].includes(reaction))return jsonResponse_({ok:false,error:"MOA_FEEDBACK_INVALID"});
  moaActivityTick_();
  var lock=LockService.getScriptLock();if(!lock.tryLock(4000))return jsonResponse_({ok:false,error:"MOA_LEARNING_BUSY"});
  try{
    /* 사용자가 평소처럼 "맞아/응"이라고 반응하면 해당 질문 표현과 이미 안전하게 나온 답변의 연결 강도를 올립니다.
       builtin 답변도 이렇게 2회 이상 긍정되면 모아 전용 표현학습으로 재사용됩니다. */
    var phraseStored=false;
    if(candidateId&&question&&reply&&(reaction==="positive"||reaction==="negative"||reaction==="correction")){
      phraseStored=moaUpdatePhraseSignal_(userId,question,candidateId,reply,source,reaction==="positive"?"positive":"negative");
    }

    /* 사용자의 정정은 귀중한 학습 후보지만, 장난/오정보가 전 사용자에게 바로 퍼지지 않도록 자동 공용승격하지 않습니다. */
    if(reaction!=="correction"&&reaction!=="repeat_question")return jsonResponse_({ok:true,stored:phraseStored,kind:"phrase"});
    if(!question||!followup)return jsonResponse_({ok:true,stored:phraseStored});
    var sheet=moaCandidateSheet_(), last=sheet.getLastRow(), normalized=moaCompact_(question)+"|"+moaCompact_(followup), start=Math.max(2,last-300), found=0, activity=moaCurrentActivitySerial_();
    if(last>=start){
      var values=sheet.getRange(start,1,last-start+1,13).getDisplayValues();
      for(var i=values.length-1;i>=0;i--){var row=values[i];if((moaCompact_(row[2])+"|"+moaCompact_(row[4]))===normalized){found=start+i;break}}
    }
    var now=new Date();
    if(found){
      var count=Number(sheet.getRange(found,7).getValue()||1)+1, confidence=Math.min(.85,.25+count*.08), created=sheet.getRange(found,10).getValue()||now;
      sheet.getRange(found,7,1,7).setValues([[count,confidence,count>=4?"review":"candidate",created,now,source,activity]]);
    }else sheet.appendRow(["cand_"+Utilities.getUuid(),userId,question,reply,followup,reaction,1,.33,"candidate",now,now,source,activity]);
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
      var pv=ps.getRange(2,1,pl-1,13).getValues(), total=0, counted=0;
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
      var cv=cs.getRange(2,1,cl-1,13).getValues(), del=[];
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

    // 모아_대화(확정/수동 학습)와 모아_개인기억은 이 유지보수 함수가 삭제하지 않습니다.
    if(result.phrasesDormant||result.phrasesDeleted||result.candidatesDormant||result.candidatesDeleted)moaInvalidateDialogCache_();
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
