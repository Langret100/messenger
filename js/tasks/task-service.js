/* 관리자 지정 과제: Firebase가 권위 저장소이고 Apps Script/Sheets는 비동기 백업만 담당합니다. */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.TaskService = (() => {
  const LEGACY_COMPLETED_VISIBLE_MS = 2 * 24 * 60 * 60 * 1000;
  const FIREBASE_ROOT = `${MiniTalkConfig.paths.economyRuntime || "moaru/v3/economyRuntime"}/taskRuntime`;
  const COMPLETED_ROOT = `${FIREBASE_ROOT}/completed`;
  let activeUserId = "", userUnsub = null, transportOff = null, inFlight = null, adminInFlight = null, refreshVersion = 0, adminRefreshVersion = 0, backupFlush = null, taskNoticeState = null;
  const adminTaskCache = new Map(), pendingAssignments = new Map();
  const user = () => MiniTalk.Store.get("user") || {};
  const obj = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  function keyOf(value){const s=unescape(encodeURIComponent(String(value||"")));return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
  const userPath = userId => `${FIREBASE_ROOT}/users/${keyOf(userId)}`;
  const taskPath = (userId, taskId) => `${userPath(userId)}/${keyOf(taskId)}`;
  const relativeTaskPath = (userId, taskId) => `users/${keyOf(userId)}/${keyOf(taskId)}`;
  const completedPath = taskId => `${COMPLETED_ROOT}/${keyOf(taskId)}`;
  const relativeCompletedPath = taskId => `completed/${keyOf(taskId)}`;
  const migratedUserPath = userId => `${FIREBASE_ROOT}/migratedUsers/${keyOf(userId)}`;
  const firebaseMode = () => MiniTalk.Realtime?.getMode?.() === "firebase";

  const normalize = (task = {}) => {
    const answer = String(task.answer || "").slice(0, 1000), imageData = String(task.imageData || task.image_data || ""), rawStatus = ["open", "submitted", "retry", "completed"].includes(task.status) ? task.status : "open";
    return ({...task,id:String(task.id||""),userId:String(task.userId||task.user_id||""),nickname:String(task.nickname||""),title:String(task.title||"과제").slice(0,80),description:String(task.description||"").slice(0,1000),answer,feedback:String(task.feedback||"").slice(0,100),imageData,rewardCoin:Math.max(0,Math.floor(Number(task.rewardCoin??task.reward_coin)||0)),status:rawStatus==="open"&&(answer.trim()||imageData)?"submitted":rawStatus,createdAt:Number(task.createdAt||task.created_at)||0,submittedAt:Number(task.submittedAt||task.submitted_at)||0,completedAt:Number(task.completedAt||task.completed_at)||0,updatedAt:Number(task.updatedAt||task.updated_at)||0,newCoin:Number(task.newCoin||task.new_coin)||0});
  };
  function visible(task, now=Date.now()){return task.status!=="completed"||!task.completedAt||now-task.completedAt<LEGACY_COMPLETED_VISIBLE_MS}
  function publish(rows){const map={};(rows||[]).map(normalize).filter(t=>t.id&&t.status!=="completed").forEach(t=>map[t.id]=t);MiniTalk.Store.set("tasks",map);MiniTalk.Events.emit("rt:tasks",map);return Object.values(map)}
  const compactBackupTask = task => {const t=normalize(task);return {...t,imageData:t.imageData?"Y":""}}
  function backupEvent(eventName, task, actor){const snapshot=compactBackupTask(task),txnId=`task:${eventName}:${snapshot.id}:${snapshot.updatedAt||Date.now()}`;return {txnId,eventName,task:snapshot,actor:String(actor||""),queuedAt:Date.now()}}
  function backupRelative(event){return `pending/${keyOf(event.txnId)}`}

  async function flushBackups(){
    if(!firebaseMode()||backupFlush)return backupFlush;
    const current=user();if(!current.user_id||current.isGuest)return;
    backupFlush=(async()=>{const pending=obj(await MiniTalk.Realtime.cloudGet(`${FIREBASE_ROOT}/pending`,{}));const rows=Object.entries(pending).sort((a,b)=>Number(a[1]?.queuedAt||0)-Number(b[1]?.queuedAt||0)).slice(0,40);for(const [key,event] of rows){try{await MiniTalk.AuthApi.taskSheetSync({userId:current.user_id,event});await MiniTalk.Realtime.cloudRemove(`${FIREBASE_ROOT}/pending/${key}`)}catch(error){console.warn("과제 시트 백업 대기 유지",event?.eventName,error);break}}})();
    try{return await backupFlush}finally{backupFlush=null}
  }

  async function migrateLegacyUserOnce(userId){
    if(!firebaseMode()||await MiniTalk.Realtime.cloudGet(migratedUserPath(userId),false)===true)return;
    if(await MiniTalk.Realtime.cloudGet(`${FIREBASE_ROOT}/meta/adminLegacyScanDone`,false)===true){await MiniTalk.Realtime.cloudSet(migratedUserPath(userId),true);return}
    try{
      const legacy=(await MiniTalk.AuthApi.userTaskList(userId)).map(normalize).filter(t=>t.id&&t.status!=="completed"),updates={};
      for(const task of legacy){const existing=await MiniTalk.Realtime.cloudGet(taskPath(userId,task.id),null);if(!existing)updates[relativeTaskPath(userId,task.id)]=task}
      updates[`migratedUsers/${keyOf(userId)}`]=true;await MiniTalk.Realtime.cloudUpdate(FIREBASE_ROOT,updates);
    }catch(error){console.warn("기존 과제 1회 Firebase 이전 지연",error)}
  }
  async function firebaseUserRows(userId){await migrateLegacyUserOnce(userId);const value=obj(await MiniTalk.Realtime.cloudGet(userPath(userId),{}));return Object.values(value).map(normalize).filter(t=>t.id&&t.status!=="completed")}
  async function refresh(force=false){
    const current=user();if(!current.user_id||current.isGuest)return publish([]);
    if(firebaseMode()){
      if(inFlight&&!force)return inFlight;const version=++refreshVersion;
      const request=firebaseUserRows(current.user_id).then(rows=>version===refreshVersion?publish(rows):rows);inFlight=request.finally(()=>{if(version===refreshVersion)inFlight=null});return inFlight;
    }
    if(inFlight&&!force)return inFlight;const version=++refreshVersion;const request=MiniTalk.AuthApi.userTaskList(current.user_id).then(rows=>version===refreshVersion?publish(rows):(rows||[]).map(normalize).filter(visible));inFlight=request.finally(()=>{if(version===refreshVersion)inFlight=null});return inFlight;
  }
  function taskNoticeKey(userId){return `tasks.firebaseNoticeState.${String(userId||"")}`}
  function loadTaskNoticeState(userId){
    const saved=MiniTalk.Persistence.get(taskNoticeKey(userId),null);
    if(!saved||saved.initialized!==true||!saved.tasks||typeof saved.tasks!=="object"||Array.isArray(saved.tasks))return{initialized:false,tasks:{}};
    return{initialized:true,tasks:saved.tasks};
  }
  function saveTaskNoticeState(userId,rows){
    const compact={};
    [...(rows||[])].sort((a,b)=>Number(b.updatedAt||b.createdAt)-Number(a.updatedAt||a.createdAt)).slice(0,300).forEach(task=>{if(task?.id)compact[String(task.id)]={status:String(task.status||"open"),updatedAt:Number(task.updatedAt||task.createdAt)||0}});
    taskNoticeState={initialized:true,tasks:compact};MiniTalk.Persistence.set(taskNoticeKey(userId),taskNoticeState);
  }
  function publishFirebaseSnapshot(value,userId){
    const rows=Object.values(obj(value)).map(normalize).filter(t=>t.id&&t.status!=="completed"),previous=taskNoticeState||loadTaskNoticeState(userId),newAssignments=[],retries=[];
    if(previous.initialized){
      rows.forEach(task=>{const before=previous.tasks?.[String(task.id)];if(!before&&task.status==="open")newAssignments.push(task);else if(before&&before.status!=="retry"&&task.status==="retry")retries.push(task)});
    }
    publish(rows);saveTaskNoticeState(userId,rows);
    if(newAssignments.length===1){const t=newAssignments[0];MiniTalk.Tools.Notifications?.notifyTask?.("새 과제가 도착했어요",`${t.title||"과제"} · 🪙 +${Number(t.rewardCoin)||0}`)}
    else if(newAssignments.length>1){const total=newAssignments.reduce((sum,t)=>sum+(Number(t.rewardCoin)||0),0);MiniTalk.Tools.Notifications?.notifyTask?.(`${newAssignments.length}개의 새 과제가 도착했어요`,total>0?`과제 탭에서 확인하세요 · 완료 보상 합계 🪙 +${total}`:"과제 탭에서 확인하세요")}
    if(retries.length===1){const t=retries[0];MiniTalk.Tools.Notifications?.notifyTask?.("과제를 다시 확인해주세요",t.feedback||"관리자 피드백을 확인하고 다시 제출해주세요.")}
    else if(retries.length>1)MiniTalk.Tools.Notifications?.notifyTask?.(`${retries.length}개의 과제를 다시 확인해주세요`,"관리자 피드백을 확인하고 다시 제출해주세요.");
  }
  function stopUserSubscription(){try{userUnsub?.()}catch{}try{transportOff?.()}catch{}userUnsub=null;transportOff=null;taskNoticeState=null}
  function start(current=user()){
    stopUserSubscription();activeUserId="";if(!current.user_id||current.isGuest){publish([]);return}
    activeUserId=String(current.user_id);taskNoticeState=loadTaskNoticeState(activeUserId);
    const attach=()=>{
      if(String(user()?.user_id||"")!==activeUserId)return;
      if(firebaseMode()){
        if(!userUnsub)userUnsub=MiniTalk.Realtime.cloudSubscribe(userPath(activeUserId),value=>{if(String(user()?.user_id||"")!==activeUserId)return;publishFirebaseSnapshot(value,activeUserId);});
        refresh(true).catch(error=>console.warn("과제 목록 Firebase 조회 실패",error));flushBackups().catch(()=>{});return;
      }
      if(MiniTalk.Realtime?.getMode?.()==="local")refresh(true).catch(error=>console.warn("과제 목록을 불러오지 못했습니다.",error));
    };
    if(firebaseMode()||MiniTalk.Realtime?.getMode?.()==="local")attach();
    else transportOff=MiniTalk.Events.on("state:transport",()=>{if(MiniTalk.Realtime?.getMode?.()!=="idle"){try{transportOff?.()}catch{}transportOff=null;attach()}});
  }
  async function enter(){const current=user();if(!current.user_id||current.isGuest)return publish([]);if(firebaseMode())flushBackups().catch(()=>{});return refresh(true)}

  async function submit(taskId,answer,imageData=""){
    const current=user(),text=String(answer||""),image=String(imageData||"");if(!current.user_id||current.isGuest)throw new Error("로그인 후 과제를 제출할 수 있어요.");if(text.length>1000)throw new Error("제출 내용은 1,000자 이하로 입력하세요.");if(!text.trim()&&!image)throw new Error("제출 내용이나 이미지를 입력하세요.");
    if(!firebaseMode()){const result=await MiniTalk.AuthApi.userTaskSubmit({userId:current.user_id,taskId,answer:text,imageData:image});const task=normalize(result.task||{});await refresh(true);return task}
    const existing=normalize(await MiniTalk.Realtime.cloudGet(taskPath(current.user_id,taskId),null)||{});if(!existing.id)throw new Error("과제를 찾을 수 없습니다. 과제 목록을 새로고침해주세요.");
    const now=Date.now(),task={...existing,answer:text,imageData:image,status:"submitted",submittedAt:now,updatedAt:now,feedback:""},event=backupEvent("SUBMITTED",task,current.user_id);
    await MiniTalk.Realtime.cloudUpdate(FIREBASE_ROOT,{[relativeTaskPath(current.user_id,task.id)]:task,[backupRelative(event)]:event});publish((await firebaseUserRows(current.user_id)));flushBackups().catch(()=>{});return normalize(task);
  }

  async function assign(targets,task){
    const current=user(),ids=[...new Set((targets||[]).map(String).filter(Boolean))].sort();if(!ids.length)throw new Error("대상 사용자를 선택하세요.");MiniTalk.AdminSession.requireToken("ADMIN");
    const signature=JSON.stringify([current.user_id,ids,task.title,task.description,task.rewardCoin]),requestId=pendingAssignments.get(signature)||crypto.randomUUID();pendingAssignments.set(signature,requestId);
    if(!firebaseMode()){const result=await MiniTalk.AuthApi.adminTaskAssign({userId:current.user_id,adminToken:MiniTalk.AdminSession.requireToken("ADMIN"),targets:ids,title:task.title,description:task.description,rewardCoin:task.rewardCoin,requestId});pendingAssignments.delete(signature);return result}
    const people=new Map((MiniTalk.UserDirectory?.all?.({includeSelf:true})||[]).map(row=>[String(row.user_id),row])),now=Date.now(),updates={},created=[];
    ids.forEach((target,index)=>{const value=normalize({id:`task-${requestId}-${index}`,userId:target,nickname:String(people.get(target)?.nickname||target),title:String(task.title||"과제").trim().slice(0,80),description:String(task.description||"").trim().slice(0,1000),rewardCoin:Math.max(1,Math.floor(Number(task.rewardCoin)||1)),status:"open",createdAt:now,updatedAt:now,issuedBy:String(current.user_id)}),event=backupEvent("ASSIGNED",value,current.user_id);updates[relativeTaskPath(target,value.id)]=value;updates[backupRelative(event)]=event;created.push(value)});
    await MiniTalk.Realtime.cloudUpdate(FIREBASE_ROOT,updates);pendingAssignments.delete(signature);MiniTalk.Realtime.notifyCommandTargets?.(ids);flushBackups().catch(()=>{});return{ok:true,count:created.length,task_ids:created.map(t=>t.id)};
  }

  async function migrateLegacyAdminOnce(){
    if(!firebaseMode()||await MiniTalk.Realtime.cloudGet(`${FIREBASE_ROOT}/meta/adminLegacyScanDone`,false)===true)return;
    const migrated=obj(await MiniTalk.Realtime.cloudGet(`${FIREBASE_ROOT}/migratedUsers`,{}));
    try{
      const legacy=(await MiniTalk.AuthApi.adminTaskList(user().user_id,MiniTalk.AdminSession.requireToken("ADMIN"))).map(normalize).filter(t=>t.id&&t.userId),updates={};
      for(const task of legacy){
        if(task.status==="completed"){const existing=await MiniTalk.Realtime.cloudGet(completedPath(task.id),null);if(!existing)updates[relativeCompletedPath(task.id)]={...task,imageData:task.imageData?"Y":""};continue}
        if(migrated[keyOf(task.userId)]===true)continue;const existing=await MiniTalk.Realtime.cloudGet(taskPath(task.userId,task.id),null);if(!existing)updates[relativeTaskPath(task.userId,task.id)]=task;updates[`migratedUsers/${keyOf(task.userId)}`]=true
      }
      updates["meta/adminLegacyScanDone"]=true;updates["meta/adminLegacyScanAt"]=Date.now();await MiniTalk.Realtime.cloudUpdate(FIREBASE_ROOT,updates);
    }catch(error){console.warn("기존 관리자 과제 1회 Firebase 이전 지연",error)}
  }
  async function firebaseAdminRows(){await migrateLegacyAdminOnce();const [groups,completed]=await Promise.all([MiniTalk.Realtime.cloudGet(`${FIREBASE_ROOT}/users`,{}),MiniTalk.Realtime.cloudGet(COMPLETED_ROOT,{})]),rows=[];Object.values(obj(groups)).forEach(group=>Object.values(obj(group)).forEach(task=>{const t=normalize(task);if(t.id&&t.status!=="completed")rows.push(t)}));Object.values(obj(completed)).forEach(task=>{const t=normalize(task);if(t.id&&t.status==="completed")rows.push(t)});rows.sort((a,b)=>(b.updatedAt||b.createdAt)-(a.updatedAt||a.createdAt));return rows.slice(0,300)}
  async function adminList(force=false){
    const current=user();MiniTalk.AdminSession.requireToken("ADMIN");if(adminInFlight&&!force)return adminInFlight;const version=++adminRefreshVersion;
    const request=(firebaseMode()?firebaseAdminRows():MiniTalk.AuthApi.adminTaskList(current.user_id,MiniTalk.AdminSession.requireToken("ADMIN"))).then(rows=>{const normalized=rows.map(normalize).filter(t=>t.id);adminTaskCache.clear();normalized.forEach(t=>adminTaskCache.set(t.id,t));return{version,rows:normalized}});adminInFlight=request.finally(()=>{if(version===adminRefreshVersion)adminInFlight=null});const result=await adminInFlight;if(firebaseMode())flushBackups().catch(()=>{});return result.rows;
  }

  async function review(taskId,action,feedback=""){
    const current=user(),cached=adminTaskCache.get(String(taskId));MiniTalk.AdminSession.requireToken("ADMIN");
    if(!firebaseMode()){const result=await MiniTalk.AuthApi.adminTaskReview({userId:current.user_id,adminToken:MiniTalk.AdminSession.requireToken("ADMIN"),taskId,action,feedback,firebaseMode:false});return normalize(result.task||{})}
    if(!cached?.userId)throw new Error("과제 정보를 다시 불러온 뒤 처리해주세요.");const fresh=normalize(await MiniTalk.Realtime.cloudGet(taskPath(cached.userId,taskId),null)||{});if(!fresh.id)throw new Error("이미 처리되었거나 삭제된 과제입니다.");
    if(action==="retry"){
      const now=Date.now(),task={...fresh,status:"retry",feedback:String(feedback||"").trim().slice(0,100),answer:"",imageData:"",submittedAt:0,updatedAt:now},event=backupEvent("RETRY",task,current.user_id);await MiniTalk.Realtime.cloudUpdate(FIREBASE_ROOT,{[relativeTaskPath(task.userId,task.id)]:task,[backupRelative(event)]:event});adminTaskCache.set(task.id,normalize(task));flushBackups().catch(()=>{});return normalize(task);
    }
    if(action!=="complete")throw new Error("올바르지 않은 과제 처리입니다.");
    if(!Number.isSafeInteger(Number(fresh.rewardCoin))||Number(fresh.rewardCoin)<=0)throw new Error("과제 보상 코인 값이 올바르지 않습니다.");
    const reward=await MiniTalk.Economy.Runtime.reward({userId:fresh.userId,rewardType:"ADMIN_TASK",rewardKey:String(fresh.id),amount:fresh.rewardCoin,reason:`${fresh.title||"과제"} 완료`});
    if(!reward||!Number.isSafeInteger(Number(reward.newCoin))||(!reward.applied&&!reward.duplicate))throw new Error("과제 코인 보상 완료를 확인하지 못했습니다.");
    const now=Date.now(),done={...fresh,status:"completed",feedback:String(feedback||"").trim().slice(0,100),completedAt:now,updatedAt:now,newCoin:reward.newCoin,rewardApplied:reward.applied===true,rewardDuplicate:reward.duplicate===true},event=backupEvent("COMPLETED",done,current.user_id),completedRecord={...done,imageData:done.imageData?"Y":""};
    // 학생의 활성 과제 경로에서는 즉시 제거하고, 관리자 완료 탭용 경량 기록만 completed에 보관합니다.
    // 시트 백업은 pending 큐에서 뒤로 처리되므로 완료 버튼은 Apps Script 응답을 기다리지 않습니다.
    await MiniTalk.Realtime.cloudUpdate(FIREBASE_ROOT,{[relativeTaskPath(done.userId,done.id)]:null,[relativeCompletedPath(done.id)]:completedRecord,[backupRelative(event)]:event});adminTaskCache.set(done.id,normalize(completedRecord));flushBackups().catch(()=>{});return normalize(completedRecord);
  }

  async function bulkReview(taskIds,action="complete",feedback=""){
    const ids=[...new Set((taskIds||[]).map(String).filter(Boolean))];if(!ids.length)throw new Error("과제를 선택하세요.");const results=[];
    // 코인 트랜잭션과 과제 상태 변경을 과도하게 한꺼번에 몰지 않으면서도 Apps Script 시절처럼 직렬 대기하지 않도록 8개씩 병렬 처리합니다.
    for(let i=0;i<ids.length;i+=8){const batch=await Promise.all(ids.slice(i,i+8).map(async id=>{try{const task=await review(id,action,feedback);return{ok:true,task_id:id,user_id:task.userId,task}}catch(error){return{ok:false,task_id:id,error:error.code||error.message}}}));results.push(...batch)}
    return{ok:true,count:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
  }
  async function bulkDelete(taskIds){
    const current=user(),ids=[...new Set((taskIds||[]).map(String).filter(Boolean))];if(!ids.length)throw new Error("과제를 선택하세요.");MiniTalk.AdminSession.requireToken("ADMIN");if(!firebaseMode())return MiniTalk.AuthApi.adminTaskBulkDelete({userId:current.user_id,adminToken:MiniTalk.AdminSession.requireToken("ADMIN"),taskIds:ids});
    const updates={},results=[];for(const id of ids){const cached=adminTaskCache.get(id);if(!cached?.userId){results.push({ok:false,task_id:id,error:"TASK_NOT_FOUND"});continue}
      const path=cached.status==="completed"?completedPath(id):taskPath(cached.userId,id),fresh=normalize(await MiniTalk.Realtime.cloudGet(path,null)||{});if(!fresh.id){results.push({ok:false,task_id:id,error:"TASK_NOT_FOUND"});continue}
      const deleted={...fresh,updatedAt:Date.now()},event=backupEvent("DELETED",deleted,current.user_id);
      if(fresh.status==="completed")updates[relativeCompletedPath(id)]=null;else updates[relativeTaskPath(fresh.userId,id)]=null;
      // 삭제 감사 기록은 작은 백업 이벤트만 잠시 pending에 남고 과제 원본은 즉시 Firebase에서 사라집니다.
      updates[backupRelative(event)]=event;results.push({ok:true,task_id:id,user_id:fresh.userId});adminTaskCache.delete(id)}if(Object.keys(updates).length)await MiniTalk.Realtime.cloudUpdate(FIREBASE_ROOT,updates);flushBackups().catch(()=>{});return{ok:true,count:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results};
  }

  return{start,enter,refresh,submit,assign,adminList,review,bulkReview,bulkDelete,flushBackups,normalize,visible,COMPLETED_VISIBLE_MS:LEGACY_COMPLETED_VISIBLE_MS,FIREBASE_ROOT,COMPLETED_ROOT};
})();
