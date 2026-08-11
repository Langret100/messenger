/* ============================================================
   CHAT FEATURE / ORCHESTRATOR
   ------------------------------------------------------------
   이 파일은 채팅 화면의 조립만 담당합니다.
   세부 기능은 js/chat/* 로 분리:
   - emoji.js       토리 이모티콘 12종
   - attachments.js 사진/카메라/파일
   - qr.js          QR 링크 스캔
   - linkify.js     URL/YouTube 미리보기
   - voice.js       보내기 길게 눌러 음성 입력
   - unread.js      방별 미확인 수
   ============================================================ */
MiniTalk.Features.Chats=(()=>{
  const messagesByRoom={},renderedMessageIds={};let renderFrame=0;let eventsBound=false;
  function bindEvents(){if(eventsBound)return;eventsBound=true;
    MiniTalk.Events.on("rt:rooms",rooms=>{const active=MiniTalk.Store.get("activeRoom");MiniTalk.Store.set("rooms",rooms);MiniTalk.Chat.Unread.syncRooms(rooms,active);if(MiniTalk.Store.get("route")!=="chats")return;if(active&&(!rooms?.[active]||!MiniTalk.Realtime.isRoomMember(rooms[active]))){MiniTalk.UI.Shell.closeModal();backToList();MiniTalk.UI.Shell.toast(rooms?.[active]?"대화방에서 나왔습니다.":"대화방이 삭제되었습니다.");return}if(!active)renderList()});
    MiniTalk.Events.on("rt:profiles",profiles=>{MiniTalk.Store.set("profiles",profiles||{});if(MiniTalk.Store.get("route")!=="chats")return;const active=MiniTalk.Store.get("activeRoom");if(active){applyChatHeader(MiniTalk.Store.get("rooms")?.[active]?.title||"대화",[MiniTalk.UI.Dom.el("button",{class:"icon-button subtle",type:"button",text:"⋯","aria-label":"대화방 메뉴",onclick:()=>openRoomMenu(active)})],{back:()=>backToList()});scheduleMessageRender(active)}else{applyChatHeader("mini-talk",headerListActions());renderList()}});
    MiniTalk.Events.on("rt:presence",presence=>MiniTalk.Store.set("presence",presence||{}));
    MiniTalk.Events.on("rt:message-reset",roomId=>{messagesByRoom[roomId]=[];renderedMessageIds[roomId]=new Set()});
    MiniTalk.Events.on("rt:message",message=>{const roomId=message.roomId;if(!roomId)return;const list=messagesByRoom[roomId]||(messagesByRoom[roomId]=[]),isNew=!list.some(item=>item.id===message.id);if(isNew)list.push(message);const active=MiniTalk.Store.get("route")==="chats"&&MiniTalk.Store.get("activeRoom")===roomId;if(active)scheduleMessageRender(roomId);if(isNew&&!active&&(message.ts||0)>Date.now()-7000)MiniTalk.Features.Tools?.notifyIncoming?.(message)});
    MiniTalk.Events.on("chat:unread",()=>{if(MiniTalk.Store.get("route")==="chats"&&!MiniTalk.Store.get("activeRoom"))renderList()});
  }
  function scheduleMessageRender(roomId){if(renderFrame)cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(()=>{renderFrame=0;if(MiniTalk.Store.get("activeRoom")===roomId)renderMessages(roomId)})}
  function render(host){MiniTalk.Store.set("activeRoom",null);MiniTalk.Realtime.unsubscribeMessages?.();applyChatHeader("mini-talk",headerListActions());renderList(host)}
  function headerListActions(){return[
    MiniTalk.UI.Dom.el("button",{class:"icon-button subtle",type:"button",text:"＋","aria-label":"대화방 만들기",onclick:createRoomDialog}),
    MiniTalk.UI.Dom.el("button",{class:"icon-button subtle",type:"button",text:"⌕","aria-label":"검색",onclick:()=>MiniTalk.UI.Dom.one(".search")?.focus()})
  ]}
  function profileHeaderOptions(){const D=MiniTalk.UI.Dom,user=MiniTalk.Store.get("user")||{},profile=MiniTalk.Store.get("profiles")?.[user.user_id]||{},node=D.el("img",{class:"header-profile-avatar",src:profile.avatar||"assets/mascot-avatar.png",alt:user.isGuest?"기본 프로필":"내 프로필"});return{profile:true,profileEditable:!user.isGuest,profileNode:node,onProfile:user.isGuest?null:()=>MiniTalk.Tools.ProfileEditor.open(()=>{const active=MiniTalk.Store.get("activeRoom");if(active){const room=MiniTalk.Store.get("rooms")?.[active];applyChatHeader(room?.title||"대화",[D.el("button",{class:"icon-button subtle",type:"button",text:"⋯","aria-label":"대화방 메뉴",onclick:()=>openRoomMenu(active)})],{back:()=>backToList()})}else{applyChatHeader("mini-talk",headerListActions());renderList()}})}}
  function applyChatHeader(title,actions=[],options={}){MiniTalk.UI.Shell.setHeader(title,actions,{...options,...profileHeaderOptions()})}
  function createRoomDialog(){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"modal-stack"});body.innerHTML='<label class="field">대화방 이름<input id="newRoomName" maxlength="40" placeholder="예: 우리 반 수다방"></label><label class="field">비밀번호 (선택)<input id="newRoomPassword" type="password" minlength="4" maxlength="32" autocomplete="new-password" placeholder="비워두면 공개방"></label><p class="muted modal-note">비밀번호를 설정하면 처음 입장하는 사람에게만 입력을 요청합니다.</p><button id="newRoomCreate" type="button" class="button primary">만들기</button>';body.querySelector("#newRoomCreate").onclick=async()=>{const b=body.querySelector("#newRoomCreate");b.disabled=true;try{const room=await MiniTalk.Realtime.createRoom(body.querySelector("#newRoomName").value,body.querySelector("#newRoomPassword").value);MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast("대화방을 만들었습니다.");setTimeout(()=>openRoom(room.id),30)}catch(e){MiniTalk.UI.Shell.toast(e.message)}finally{b.disabled=false}};MiniTalk.UI.Shell.modal("새 대화방",body);setTimeout(()=>body.querySelector("#newRoomName")?.focus(),30)}
  function renderList(host=MiniTalk.UI.Dom.byId("viewHost")){
    if(!host)return;const D=MiniTalk.UI.Dom,rooms=Object.values(MiniTalk.Store.get("rooms")||{}).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    const view=D.el("section",{class:"view chat-home view-enter","data-filter":"all"});
    const top=D.el("div",{class:"chat-home-top"}),searchWrap=D.el("div",{class:"chat-search-wrap"}),search=D.el("input",{class:"search chat-search",placeholder:"대화방이나 메시지 검색","aria-label":"대화방 검색"});searchWrap.append(D.el("span",{class:"search-glyph",text:"⌕"}),search,D.el("span",{class:"search-hint",text:"검색"}));
    const filters=D.el("div",{class:"chat-filter-tabs","aria-label":"대화 필터"});[["all","전체"],["unread","안읽음"],["favorite","즐겨찾기"],["group","그룹"]].forEach(([mode,label])=>{const button=D.el("button",{class:`chat-filter ${mode==="all"?"active":""}`,type:"button",text:label});button.onclick=()=>{view.dataset.filter=mode;D.all(".chat-filter",filters).forEach(item=>item.classList.toggle("active",item===button));filter(search.value,list,mode)};filters.append(button)});
    const sectionHead=D.el("div",{class:"conversation-section-head"},[D.el("strong",{text:"최근 대화"}),D.el("span",{class:"conversation-count",text:`${rooms.length}`})]);top.append(searchWrap,filters,sectionHead);
    const list=D.el("div",{class:"conversation-list",id:"conversationList"});search.oninput=e=>filter(e.target.value,list,view.dataset.filter);
    rooms.forEach((room,i)=>{const node=roomItem(room);node.style.setProperty("--stagger",`${Math.min(i,8)*22}ms`);list.append(node)});
    if(!rooms.length)list.append(D.el("div",{class:"empty-state"},[D.el("span",{text:"●"}),D.el("strong",{text:"대화방이 없습니다"}),D.el("small",{class:"muted",text:"오른쪽 위 ＋ 버튼으로 새 대화를 만들 수 있어요."})]));
    view.append(top,list);host.replaceChildren(view)
  }
  function roomItem(room){const D=MiniTalk.UI.Dom,unread=MiniTalk.Chat.Unread.count(room.id),time=room.updatedAt?new Date(room.updatedAt).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}):"",tone=[...(room.id||"")].reduce((sum,char)=>sum+char.charCodeAt(0),0)%4;return D.el("button",{class:"conversation-item conversation-enter",type:"button","data-room-id":room.id,"data-tone":String(tone),"data-unread":unread?"1":"0","data-favorite":room.favorite?"1":"0","data-room-type":room.type||"group",onclick:()=>openRoom(room.id)},[
    D.el("div",{class:"avatar-wrap"},[D.el("div",{class:"avatar",text:(room.title||"?").slice(0,1)}),D.el("span",{class:"avatar-presence","aria-hidden":"true"})]),
    D.el("div",{class:"conversation-main"},[D.el("strong",{text:`${room.hasPassword?"🔒 ":""}${room.title||room.id}`}),D.el("p",{text:room.lastMessage||"대화를 시작하세요"})]),
    D.el("div",{class:"conversation-meta"},[D.el("time",{text:time}),unread?D.el("b",{class:"unread",text:String(Math.min(99,unread))}):null])
  ])}
  function filter(query,root,mode="all"){const q=query.trim().toLowerCase();MiniTalk.UI.Dom.all(".conversation-item",root).forEach(item=>{const textMatch=item.textContent.toLowerCase().includes(q),modeMatch=mode==="all"||(mode==="unread"&&item.dataset.unread==="1")||(mode==="favorite"&&item.dataset.favorite==="1")||(mode==="group"&&item.dataset.roomType==="group");item.classList.toggle("hidden",!textMatch||!modeMatch)})}
  async function openRoom(roomId){let room=MiniTalk.Store.get("rooms")?.[roomId]||await MiniTalk.Realtime.getRoom(roomId);if(!room){MiniTalk.UI.Shell.toast("대화방을 찾을 수 없습니다.");return}if(!MiniTalk.Realtime.isRoomMember(room)){if(room.hasPassword){joinRoomDialog(room);return}try{room=await MiniTalk.Realtime.joinRoom(roomId)}catch(e){MiniTalk.UI.Shell.toast(e.message);return}}MiniTalk.Store.set("activeRoom",roomId);MiniTalk.Store.set("lastRoom",roomId);MiniTalk.Chat.Unread.clear(roomId,room.updatedAt);applyChatHeader(room.title,[MiniTalk.UI.Dom.el("button",{class:"icon-button subtle",type:"button",text:"⋯","aria-label":"대화방 메뉴",onclick:()=>openRoomMenu(roomId)})],{back:()=>backToList()});await MiniTalk.Realtime.subscribeMessages(roomId);if(MiniTalk.Store.get("route")==="chats"&&MiniTalk.Store.get("activeRoom")===roomId)renderMessages(roomId)}
  function joinRoomDialog(room){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"modal-stack"});body.innerHTML='<p class="modal-note">이 대화방은 비밀번호로 보호되어 있습니다.</p><label class="field">대화방 비밀번호<input id="roomJoinPassword" type="password" maxlength="32" autocomplete="current-password"></label><button id="roomJoinAction" type="button" class="button primary">입장하기</button>';const action=body.querySelector("#roomJoinAction"),input=body.querySelector("#roomJoinPassword");action.onclick=async()=>{action.disabled=true;try{await MiniTalk.Realtime.joinRoom(room.id,input.value);MiniTalk.UI.Shell.closeModal();setTimeout(()=>openRoom(room.id),30)}catch(e){MiniTalk.UI.Shell.toast(e.message);input.select()}finally{action.disabled=false}};input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();action.click()}};MiniTalk.UI.Shell.modal(room.title,body);setTimeout(()=>input.focus(),30)}
  function roomMemberList(room){if(room.id==="global")return Object.values(MiniTalk.Store.get("presence")||{}).filter(Boolean);return Object.values(room.members||{}).filter(Boolean)}
  async function openRoomMenu(roomId){const room=await MiniTalk.Realtime.getRoom(roomId);if(!room){MiniTalk.UI.Shell.closeModal();backToList();return}const D=MiniTalk.UI.Dom,user=MiniTalk.Store.get("user"),owner=room.creator===user?.user_id,members=roomMemberList(room),body=D.el("div",{class:"room-menu modal-stack"});
    const summary=D.el("section",{class:"room-summary"},[D.el("div",{class:"room-summary-icon",text:room.hasPassword?"🔒":"●"}),D.el("div",{},[D.el("strong",{text:room.title||room.id}),D.el("small",{class:"muted",text:room.id==="global"?"모든 사용자가 참여하는 기본 대화방":`${members.length}명 · ${room.hasPassword?"비밀번호방":"공개방"}`})])]);body.append(summary);
    const memberBox=D.el("section",{class:"room-section"},[D.el("strong",{class:"room-section-title",text:room.id==="global"?"현재 접속자":"멤버"})]),list=D.el("div",{class:"room-member-list"});
    if(!members.length)list.append(D.el("p",{class:"muted modal-note",text:"표시할 멤버가 없습니다."}));
    members.sort((a,b)=>(a.joinedAt||0)-(b.joinedAt||0)).forEach(member=>{const id=member.user_id||"",isOwner=id===room.creator,row=D.el("div",{class:"room-member"},[D.el("span",{class:"room-member-avatar",text:(member.nickname||id||"?").slice(0,1)}),D.el("span",{class:"room-member-copy"},[D.el("strong",{text:member.nickname||id||"익명"}),D.el("small",{class:"muted",text:isOwner?"방장":member.online?"접속 중":"멤버"})])]);if(owner&&room.id!=="global"&&id&&id!==user.user_id){const kick=D.el("button",{class:"mini-action danger-lite",type:"button",text:"내보내기"});kick.onclick=()=>confirmRemoveMember(room,id,member.nickname||id);row.append(kick)}list.append(row)});memberBox.append(list);body.append(memberBox);
    if(owner&&room.id!=="global"){const security=D.el("section",{class:"room-section"});security.innerHTML=`<strong class="room-section-title">비밀번호</strong><label class="field"><input id="roomPasswordEdit" type="password" minlength="4" maxlength="32" autocomplete="new-password" placeholder="${room.hasPassword?"새 비밀번호 또는 빈칸":"4자 이상 입력"}"></label><p class="muted modal-note">${room.hasPassword?"빈칸으로 저장하면 비밀번호가 해제됩니다.":"설정하면 새 멤버가 입장할 때 입력해야 합니다."}</p>`;const save=D.el("button",{class:"button secondary compact-button",type:"button",text:room.hasPassword?"변경 또는 해제":"비밀번호 설정"});save.onclick=async()=>{save.disabled=true;try{await MiniTalk.Realtime.updateRoomPassword(roomId,security.querySelector("#roomPasswordEdit").value);MiniTalk.UI.Shell.toast("비밀번호 설정을 저장했습니다.");await openRoomMenu(roomId)}catch(e){MiniTalk.UI.Shell.toast(e.message)}finally{save.disabled=false}};security.append(save);body.append(security)}
    if(room.id!=="global"){const leaveButton=D.el("button",{class:"button room-leave-button",type:"button",text:"대화방 나가기"});leaveButton.onclick=()=>confirmLeaveRoom(room);body.append(leaveButton)}else body.append(D.el("p",{class:"muted modal-note",text:"전체 대화는 기본 대화방이므로 나가거나 비밀번호를 설정할 수 없습니다."}));
    MiniTalk.UI.Shell.modal("대화방 정보",body)
  }
  function confirmRemoveMember(room,memberId,name){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"modal-stack"},[D.el("p",{text:`${name}님을 대화방에서 내보낼까요?`}),D.el("p",{class:"muted modal-note",text:"비밀번호방이라면 다시 입장하려면 비밀번호가 필요합니다."})]),row=D.el("div",{class:"button-row"}),cancel=D.el("button",{class:"button secondary",type:"button",text:"취소"}),remove=D.el("button",{class:"button room-leave-button",type:"button",text:"내보내기"});cancel.onclick=()=>openRoomMenu(room.id);remove.onclick=async()=>{remove.disabled=true;try{await MiniTalk.Realtime.removeRoomMember(room.id,memberId);MiniTalk.UI.Shell.toast("멤버를 내보냈습니다.");await openRoomMenu(room.id)}catch(e){MiniTalk.UI.Shell.toast(e.message);remove.disabled=false}};row.append(cancel,remove);body.append(row);MiniTalk.UI.Shell.modal("멤버 내보내기",body)}
  function confirmLeaveRoom(room){const D=MiniTalk.UI.Dom,isOwner=room.creator===MiniTalk.Store.get("user")?.user_id,count=Object.keys(room.members||{}).length,body=D.el("div",{class:"modal-stack"},[D.el("p",{text:`${room.title}에서 나갈까요?`}),D.el("p",{class:"muted modal-note",text:isOwner?(count>1?"가장 먼저 참여한 멤버에게 방장이 자동으로 넘어갑니다.":"남은 멤버가 없어 대화방과 메시지가 삭제됩니다."):"다시 참여하려면 대화방에 재입장해야 합니다."})]),row=D.el("div",{class:"button-row"}),cancel=D.el("button",{class:"button secondary",type:"button",text:"취소"}),leaveButton=D.el("button",{class:"button room-leave-button",type:"button",text:"나가기"});cancel.onclick=()=>openRoomMenu(room.id);leaveButton.onclick=async()=>{leaveButton.disabled=true;MiniTalk.Store.set("activeRoom",null);try{const result=await MiniTalk.Realtime.leaveRoom(room.id);MiniTalk.UI.Shell.closeModal();MiniTalk.Realtime.unsubscribeMessages?.();backToList();MiniTalk.UI.Shell.toast(result.deleted?"대화방을 삭제했습니다.":"대화방에서 나왔습니다.")}catch(e){MiniTalk.Store.set("activeRoom",room.id);MiniTalk.UI.Shell.toast(e.message);leaveButton.disabled=false}};row.append(cancel,leaveButton);body.append(row);MiniTalk.UI.Shell.modal("대화방 나가기",body)}
  function backToList(){MiniTalk.Store.set("activeRoom",null);MiniTalk.Realtime.unsubscribeMessages?.();applyChatHeader("mini-talk",headerListActions(),{back:null});renderList()}
  function renderMessages(roomId){
    const D=MiniTalk.UI.Dom,host=D.byId("viewHost");if(!host)return;MiniTalk.Features.Settings?.applyChatBackground?.();
    const existing=D.one(".chat-room",host),sameRoom=existing?.getAttribute?.("data-room-id")===String(roomId),existingList=sameRoom?existing.querySelector?.("#messageList"):null;
    if(existingList){refreshMessageList(roomId,existingList);return}
    const view=D.el("section",{class:"view chat-room view-enter","data-room-id":roomId}),list=D.el("div",{class:"message-list",id:"messageList"});
    fillMessageList(roomId,list,true);
    const composer=buildComposer(roomId);view.append(list,composer.root);host.replaceChildren(view);requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight})
  }
  function refreshMessageList(roomId,list){
    const distance=Math.max(0,list.scrollHeight-list.scrollTop-list.clientHeight),stickToBottom=distance<72,previousTop=list.scrollTop;
    fillMessageList(roomId,list,false);
    requestAnimationFrame(()=>{list.scrollTop=stickToBottom?list.scrollHeight:Math.min(previousTop,Math.max(0,list.scrollHeight-list.clientHeight))})
  }
  function fillMessageList(roomId,list,initial){
    const sorted=[...(messagesByRoom[roomId]||[])].sort((a,b)=>(a.ts||0)-(b.ts||0)),seen=renderedMessageIds[roomId]||(renderedMessageIds[roomId]=new Set());
    const nodes=sorted.map((message,i)=>{const n=messageNode(message),key=String(message.id||`${message.user_id||""}:${message.ts||0}:${i}`),fresh=!seen.has(key);if(fresh&&(initial?i>=Math.max(0,sorted.length-4):true))n.classList.add("message-enter");seen.add(key);return n});
    list.replaceChildren(...nodes)
  }
  function buildComposer(roomId){
    const D=MiniTalk.UI.Dom;let menuOpen=false,emojiOpen=false;
    const root=D.el("section",{class:"composer-zone"});
    const voiceStatus=D.el("div",{class:"voice-status","aria-live":"polite"});
    const tray=D.el("div",{class:"attach-tray hidden"});
    const emojiPanel=D.el("div",{class:"emoji-panel hidden"});
    MiniTalk.Chat.Emoji.list().forEach(info=>{const b=D.el("button",{type:"button",class:"emoji-item","aria-label":info.code});b.append(D.el("img",{src:info.src,alt:info.code,loading:"lazy"}));b.onclick=async()=>{await sendPayload(roomId,{text:info.token,type:"text"});emojiPanel.classList.add("hidden");emojiOpen=false};emojiPanel.append(b)});
    const form=D.el("form",{class:"composer"}),plus=D.el("button",{class:"composer-icon",type:"button",text:"＋","aria-label":"첨부 메뉴"}),input=D.el("input",{id:"msgInput",placeholder:"메시지 입력",maxlength:"500","aria-label":"메시지 입력",autocomplete:"off"}),emoji=D.el("button",{class:"composer-icon emoji-toggle",type:"button",text:"☺","aria-label":"이모티콘"}),send=D.el("button",{id:"msgSendBtn",class:"send",type:"submit",text:"➤","aria-label":"전송 - 길게 누르면 음성 입력"});
    const addAction=(icon,label,fn)=>{const b=D.el("button",{type:"button",class:"attach-action"},[D.el("span",{text:icon}),D.el("small",{text:label})]);b.onclick=async()=>{tray.classList.add("hidden");menuOpen=false;try{await fn()}catch(e){if(e?.message&&!/취소/.test(e.message))MiniTalk.UI.Shell.toast(e.message)}};tray.append(b)};
    addAction("▧","사진",async()=>{const payload=await MiniTalk.Chat.Attachments.image({camera:false});if(payload)await sendPayload(roomId,payload)});
    addAction("◉","카메라",async()=>{const payload=await MiniTalk.Chat.Attachments.image({camera:true});if(payload)await sendPayload(roomId,payload)});
    addAction("⌁","파일",async()=>{const payload=await MiniTalk.Chat.Attachments.file();if(payload)await sendPayload(roomId,payload)});
    addAction("▦","QR",async()=>{const text=await MiniTalk.Chat.QR.scan();if(text){input.value=text;input.focus()}});
    plus.onclick=()=>{menuOpen=!menuOpen;tray.classList.toggle("hidden",!menuOpen);emojiPanel.classList.add("hidden");emojiOpen=false;plus.classList.toggle("active",menuOpen)};
    emoji.onclick=()=>{emojiOpen=!emojiOpen;emojiPanel.classList.toggle("hidden",!emojiOpen);tray.classList.add("hidden");menuOpen=false;plus.classList.remove("active")};
    const submitText=async text=>{const clean=String(text||"").trim();if(!clean)return;await sendPayload(roomId,{text:clean,type:"text"})};
    form.onsubmit=async e=>{e.preventDefault();const text=input.value.trim();if(!text)return;send.disabled=true;try{await submitText(text);input.value=""}catch(error){MiniTalk.UI.Shell.toast(error.message)}finally{send.disabled=false;input.focus()}};
    MiniTalk.Chat.Voice.bind(send,input,async text=>{try{await submitText(text)}catch(e){MiniTalk.UI.Shell.toast(e.message);throw e}},voiceStatus);
    form.append(plus,input,emoji,send);root.append(voiceStatus,tray,emojiPanel,form);return{root,input}
  }
  async function sendPayload(roomId,payload){await MiniTalk.Realtime.sendMessage(roomId,payload)}
  function messageNode(message){
    const D=MiniTalk.UI.Dom,mine=message.user_id===MiniTalk.Store.get("user")?.user_id,row=D.el("article",{class:`message-row ${mine?"mine":""}`}),profile=MiniTalk.Store.get("profiles")?.[message.user_id]||{};
    if(!mine){const avatar=profile.avatar?D.el("img",{class:"message-avatar profile-image",src:profile.avatar,alt:`${message.nickname||"사용자"} 프로필`}):D.el("div",{class:"message-avatar",text:(message.nickname||"?").slice(0,1)});avatar.onclick=()=>openUserProfile(message,profile);row.append(avatar)}
    const content=D.el("div",{class:"message-content"});if(!mine)content.append(D.el("small",{class:"sender-name",text:message.nickname||"익명"}));
    const bubble=D.el("div",{class:"bubble"});const type=message.type||(message.fileUrl?"file":(message.image||message.imageUrl?"image":"text"));
    if(type==="image"){
      const src=message.imageUrl||message.image;if(src){bubble.classList.add("media-bubble");const img=D.el("img",{src,alt:"공유 이미지",loading:"lazy"});img.onclick=()=>openImage(src);bubble.append(img)}
    }else if(type==="file"){
      bubble.classList.add("file-bubble");const a=D.el("a",{href:message.fileUrl||"#",target:"_blank",rel:"noopener noreferrer",class:"file-card"},[D.el("span",{text:"⌁"}),D.el("span",{},[D.el("strong",{text:message.fileName||"첨부 파일"}),D.el("small",{text:"파일 열기"})])]);bubble.append(a)
    }else{
      if(MiniTalk.Chat.Emoji.isOnlyCustom(message.text)||MiniTalk.Chat.Emoji.isOnlyUnicode(message.text))bubble.classList.add("emoji-only");MiniTalk.Chat.Emoji.appendText(message.text||"",bubble);MiniTalk.Chat.Linkify.enhance(bubble);const preview=MiniTalk.Chat.Linkify.preview(message.text||"",D.doc());if(preview)bubble.append(preview)
    }
    const meta=D.el("time",{class:"message-time",text:message.ts?new Date(message.ts).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}):""});content.append(D.el("div",{class:"bubble-line"},mine?[meta,bubble]:[bubble,meta]));row.append(content);return row
  }
  function openImage(src){const D=MiniTalk.UI.Dom,wrap=D.el("div",{class:"image-viewer"}),img=D.el("img",{src,alt:"이미지 크게 보기"});wrap.append(img);wrap.onclick=()=>wrap.remove();D.doc().body.append(wrap)}
  function openUserProfile(message,profile){const D=MiniTalk.UI.Dom,body=D.el("div",{class:"profile-viewer"}),avatar=profile?.avatar?D.el("img",{class:"profile-viewer-avatar",src:profile.avatar,alt:"프로필"}):D.el("div",{class:"profile-viewer-avatar fallback",text:(message.nickname||"?").slice(0,1)});body.append(avatar,D.el("strong",{class:"profile-viewer-name",text:message.nickname||"익명"}),D.el("p",{class:"muted profile-viewer-status",text:profile?.statusMsg||"상태메시지가 없습니다."}));MiniTalk.UI.Shell.modal("프로필",body)}
  function leave(){MiniTalk.Store.set("activeRoom",null);MiniTalk.Realtime.unsubscribeMessages?.();MiniTalk.Chat.QR.stop?.();if(renderFrame){cancelAnimationFrame(renderFrame);renderFrame=0}}
  bindEvents();return{id:"chats",title:"대화",icon:"◉",render,leave};
})();
MiniTalk.Registry.register(MiniTalk.Features.Chats);
