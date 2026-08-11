/* ============================================================
   관리자 기능
   - 서버 인증을 통과한 관리자만 화면과 일괄 전송을 사용할 수 있습니다.
   - 대상은 프로필/접속자 명단에서 체크박스로 선택합니다.
   - NOTICE는 사용자가 닫을 수 있는 상단 공지로 표시됩니다.
   ============================================================ */
MiniTalk.Features.Admin=(()=>{
  MiniTalk.Events.on("rt:command",handleCommand);
  const visible=()=>MiniTalk.Store.get("admin")===true;
  let noticeTimer=0;

  function users(){
    const map=new Map(),current=MiniTalk.Store.get("user")||{};
    const add=value=>{if(!value||typeof value!=="object")return;const id=String(value.user_id||value.userId||value.uid||"").trim(),nickname=String(value.nickname||value.name||value.username||id).trim();if(!id||id===current.user_id||/^(guest-|게스트)/i.test(id))return;const previous=map.get(id)||{};map.set(id,{...previous,...value,user_id:id,nickname:nickname||previous.nickname||id,avatar:value.avatar||previous.avatar||""})};
    Object.values(MiniTalk.Store.get("profiles")||{}).forEach(add);Object.values(MiniTalk.Store.get("presence")||{}).forEach(add);
    return[...map.values()].sort((a,b)=>a.nickname.localeCompare(b.nickname,"ko"))
  }

  function render(host){
    MiniTalk.UI.Shell.setHeader("관리자",[],{back:()=>MiniTalk.Router.go("chats")});const D=MiniTalk.UI.Dom,view=D.el("section",{class:"view"}),list=D.el("div",{class:"card-list"});
    if(!visible()){list.append(D.el("p",{class:"muted",text:"설정에서 관리자 인증을 완료해야 합니다."}));view.append(list);host.replaceChildren(view);return}
    const card=D.el("section",{class:"tool-card admin-command-card"}),selected=new Set(),people=users();
    card.append(D.el("h3",{text:"대상 사용자"}));
    const controls=D.el("div",{class:"admin-target-controls"}),selectAll=D.el("button",{class:"mini-action",type:"button",text:"전체 선택"}),clearAll=D.el("button",{class:"mini-action",type:"button",text:"선택 해제"}),count=D.el("span",{class:"muted admin-selected-count",text:"0명 선택"});controls.append(selectAll,clearAll,count);
    const search=D.el("input",{class:"search",placeholder:"닉네임 검색","aria-label":"대상 사용자 검색"}),targetList=D.el("div",{class:"admin-target-list"});
    const updateCount=()=>{count.textContent=`${selected.size}명 선택`};
    const drawTargets=()=>{const q=String(search.value||"").trim().toLowerCase(),shown=people.filter(person=>person.nickname.toLowerCase().includes(q));targetList.replaceChildren(...shown.map(person=>{const check=D.el("input",{type:"checkbox","data-admin-user":person.user_id,"aria-label":`${person.nickname} 선택`});check.checked=selected.has(person.user_id);check.onchange=()=>{check.checked?selected.add(person.user_id):selected.delete(person.user_id);updateCount()};const avatar=person.avatar?D.el("img",{class:"room-member-avatar profile-image",src:person.avatar,alt:""}):D.el("span",{class:"room-member-avatar",text:(person.nickname||"?").slice(0,1)});return D.el("label",{class:"room-member admin-target-option"},[avatar,D.el("span",{class:"room-member-copy"},[D.el("strong",{text:person.nickname}),D.el("small",{class:"muted",text:person.user_id})]),check])}));if(!shown.length)targetList.append(D.el("p",{class:"muted modal-note",text:"표시할 사용자가 없습니다."}))};
    selectAll.onclick=()=>{people.forEach(person=>selected.add(person.user_id));drawTargets();updateCount()};clearAll.onclick=()=>{selected.clear();drawTargets();updateCount()};search.oninput=drawTargets;card.append(controls,search,targetList);

    const typeField=D.el("label",{class:"field"},[D.el("span",{text:"명령"})]),type=D.el("select",{id:"adminType"});[["NOTICE","상단 공지"],["STAMP","도장 효과"],["IMAGE","이미지 효과"],["ALARM","알람"],["TASK","과제"],["LOCK","프로그램 잠금"],["UNLOCK","잠금 해제"]].forEach(([value,label])=>type.append(D.el("option",{value,text:label})));typeField.append(type);
    const title=D.el("input",{id:"adminTitle",maxlength:"80"}),titleField=D.el("label",{class:"field"},[D.el("span",{text:"제목"}),title]),body=D.el("textarea",{id:"adminBody",maxlength:"1000",rows:"4"}),bodyField=D.el("label",{class:"field"},[D.el("span",{text:"내용 또는 이미지 URL"}),body]),send=D.el("button",{id:"adminSend",class:"button primary",type:"button",text:"선택한 사용자에게 전송"});
    send.onclick=async()=>{const targets=[...selected];if(!targets.length){MiniTalk.UI.Shell.toast("대상 사용자를 선택하세요.");return}send.disabled=true;try{const amount=type.value==="TASK"?await MiniTalk.Realtime.assignTasks(targets,{title:title.value.trim()||"과제",description:body.value.trim()}):await MiniTalk.Realtime.sendCommands(targets,type.value,{title:title.value.trim(),body:body.value.trim()});MiniTalk.UI.Shell.toast(`${amount}명에게 전송했습니다.`)}catch(error){MiniTalk.UI.Shell.toast(error.message||"관리자 명령 전송에 실패했습니다.")}finally{send.disabled=false}};
    card.append(typeField,titleField,bodyField,send,D.el("p",{class:"muted modal-note",text:"상단 공지는 사용자가 직접 닫을 수 있습니다. 잠금은 관리자가 해제할 때까지 유지됩니다."}));drawTargets();list.append(card,MiniTalk.Features.Shopping.adminPanel(()=>render(host)));view.append(list);host.replaceChildren(view)
  }

  function handleCommand(cmd){const p=cmd.payload||{};if(cmd.type==="NOTICE")showNotice(p.title||"안내",p.body||"");if(cmd.type==="STAMP")effect(p.title||"참 잘했어요");if(cmd.type==="IMAGE")effectImage(p.body);if(cmd.type==="ALARM"){new Audio("assets/sounds/notify.mp3").play().catch(()=>{});effect(p.title||"알람")};if(cmd.type==="LOCK")lock(p.body||"관리자가 사용을 잠갔습니다.");if(cmd.type==="UNLOCK")unlock()}
  function showNotice(title,body){const D=MiniTalk.UI.Dom,doc=D.doc();clearTimeout(noticeTimer);D.byId("adminNotice")?.remove();const close=D.el("button",{class:"admin-notice-close",type:"button",text:"×","aria-label":"공지 닫기"}),notice=D.el("aside",{id:"adminNotice",class:"admin-notice",role:"status"},[D.el("div",{},[D.el("strong",{text:title}),D.el("p",{text:body})]),close]),dismiss=()=>{clearTimeout(noticeTimer);noticeTimer=0;notice.remove()};close.onclick=dismiss;doc.body.append(notice);noticeTimer=setTimeout(dismiss,10000)}
  function effect(text){const D=MiniTalk.UI.Dom,host=D.byId("overlayHost"),node=D.el("div",{class:"screen-effect",text});host.append(node);new Audio("assets/sounds/stamp.mp3").play().catch(()=>{});setTimeout(()=>node.remove(),2100)}
  function effectImage(url){if(!url)return;const D=MiniTalk.UI.Dom,host=D.byId("overlayHost"),img=D.el("img",{class:"screen-effect",src:url,alt:"관리자 이미지"});img.style.maxWidth="65vw";img.style.maxHeight="65vh";host.append(img);setTimeout(()=>img.remove(),2100)}
  function lock(message){MiniTalk.Persistence.set("runtime.lock",{message:String(message||"관리자가 사용을 잠갔습니다."),at:Date.now()});renderLock()}
  function unlock(){MiniTalk.Persistence.remove("runtime.lock");MiniTalk.UI.Dom.byId("hardLock")?.remove();MiniTalk.UI.Shell.toast("관리자 잠금이 해제되었습니다.")}
  function renderLock(){const saved=MiniTalk.Persistence.get("runtime.lock");if(!saved)return false;const D=MiniTalk.UI.Dom,doc=D.doc();D.byId("hardLock")?.remove();const layer=D.el("section",{id:"hardLock",class:"hard-lock","aria-live":"assertive"},[D.el("div",{class:"hard-lock-card"},[D.el("div",{class:"app-mark",text:"M"}),D.el("h2",{text:"모아루 사용이 잠겼습니다."}),D.el("p",{text:saved.message||"관리자가 사용을 잠갔습니다."}),D.el("small",{class:"muted",text:"관리자가 잠금을 해제하면 다시 사용할 수 있습니다."})])]);doc.body.append(layer);return true}
  return{id:"admin",title:"관리자",icon:"⚙",nav:false,isVisible:visible,render,applyStoredLock:renderLock}
})();
MiniTalk.Registry.register(MiniTalk.Features.Admin);
