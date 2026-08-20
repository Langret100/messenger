/* ============================================================
   모아와 대화하기 - Firebase와 분리된 Apps Script/기기 캐시 기반 1:1 AI 방

   [이 기능을 전체 프로그램에서 완전히 제거하려면]
   - 삭제: js/features/moa-chat.js
   - 삭제: js/ai/moa-chat-engine.js
   - 삭제: css/features/moa-chat.css
   - index.html에서 위 CSS/JS 로드 태그 삭제
   - js/features/chats.js의 MOA_CHAT_INTEGRATION 블록 삭제
   - js/adapters/auth-api.js의 MOA_CHAT_INTEGRATION 블록 삭제
   - sw.js CORE에서 위 3개 경로 삭제
   - tests/moa-ai-foundation.test.js 삭제(기능을 제거할 때만)
   - Apps Script는 MOA_CHAT.gs/MOA_LEARNING.gs 상단의 제거 안내대로 정리
   - Firebase/Realtime Database/Rules는 이 기능이 사용하지 않으므로 제거 작업 없음

   대화 화면에 보이는 누적 내역은 서버가 아니라 IndexedDB(DataCache)에만 저장합니다.
   ============================================================ */
MiniTalk.Features.MoaChat=(()=>{
  let busy=false;
  function D(){return MiniTalk.UI.Dom}
  function listItem(){
    const Dom=D(), node=Dom.el("button",{class:"conversation-item conversation-enter moa-chat-list-item",type:"button","data-room-id":"__moa_ai__","data-tone":"2","data-unread":"0","data-favorite":"0","data-member":"1","data-room-type":"ai","data-has-message":"1"},[
      Dom.el("div",{class:"avatar-wrap"},[Dom.el("div",{class:"avatar moa-ai-avatar",text:"모아","aria-hidden":"true"})]),
      Dom.el("div",{class:"conversation-main"},[Dom.el("strong",{class:"conversation-title",text:"모아와 대화하기"}),Dom.el("p",{class:"conversation-preview",text:"편하게 얘기하면서 조금씩 더 잘 알아듣는 모아"})]),
      Dom.el("div",{class:"conversation-meta"},[Dom.el("span",{class:"moa-ai-badge",text:"AI"})])
    ]);
    node.onclick=()=>MiniTalk.Router.go("moa-chat");return node;
  }
  function cacheKey(){return String(MiniTalk.Store.get("user")?.user_id||"guest")}
  function legacyHistoryKey(){return`moa.chat.history.${cacheKey()}`}
  async function history(){
    const key=cacheKey();
    const cached=await MiniTalk.DataCache?.get?.("moa-chat-history",key,null);
    if(Array.isArray(cached))return cached;
    /* v73의 localStorage 대화내역이 있으면 한 번만 IndexedDB로 옮겨 기존 대화를 보존합니다. */
    const legacy=MiniTalk.Persistence.get(legacyHistoryKey(),null);
    if(Array.isArray(legacy)&&legacy.length){await MiniTalk.DataCache?.put?.("moa-chat-history",key,legacy);MiniTalk.Persistence.remove(legacyHistoryKey());return legacy}
    return [];
  }
  function saveHistory(list){MiniTalk.DataCache?.put?.("moa-chat-history",cacheKey(),list.slice(-120)).catch?.(()=>{})}
  function appendMessage(list,role,text,meta={}){const msg={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,role,text,ts:Date.now(),...meta};list.push(msg);saveHistory(list);return msg}
  function messageNode(message){const Dom=D(),mine=message.role==="user",row=Dom.el("article",{class:`message-row ${mine?"mine":""} moa-ai-message`});if(!mine)row.append(Dom.el("div",{class:"message-avatar moa-ai-mini-avatar",text:"모아"}));const content=Dom.el("div",{class:"message-content"});if(!mine)content.append(Dom.el("small",{class:"sender-name",text:"모아"}));const bubble=Dom.el("div",{class:"bubble moa-ai-bubble",text:message.text}),meta=Dom.el("time",{class:"message-time",text:new Date(message.ts||Date.now()).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})});content.append(Dom.el("div",{class:"bubble-line"},mine?[meta,bubble]:[bubble,meta]));row.append(content);return row}
  function fill(listNode,messages){listNode.replaceChildren(...messages.map(messageNode));listNode.scrollTop=listNode.scrollHeight;requestAnimationFrame(()=>{if(listNode.isConnected)listNode.scrollTop=listNode.scrollHeight})}
  function header(){MiniTalk.UI.Shell.setHeader("모아와 대화하기",[D().el("button",{class:"icon-button subtle",type:"button",text:"⋯","aria-label":"모아 대화 메뉴",onclick:openMenu})],{back:()=>MiniTalk.Router.go("chats")})}
  function openMenu(){const Dom=D(),body=Dom.el("div",{class:"modal-stack"}),clear=Dom.el("button",{class:"button secondary",type:"button",text:"이 기기의 대화 내역 지우기"});clear.onclick=async()=>{await MiniTalk.DataCache?.remove?.("moa-chat-history",cacheKey());MiniTalk.Persistence.remove(legacyHistoryKey());MiniTalk.AI.MoaChatEngine.clearContext();MiniTalk.UI.Shell.closeModal();MiniTalk.Router.go("moa-chat")};body.append(Dom.el("p",{class:"muted modal-note",text:"화면에 보이는 대화 내역과 짧은 문맥은 이 기기에만 저장돼. Firebase에는 모아 대화를 저장하지 않아."}),clear);MiniTalk.UI.Shell.modal("모아 대화 설정",body)}
  async function render(host){
    MiniTalk.Store.set("activeRoom",null);MiniTalk.Realtime.unsubscribeMessages?.();header();
    const Dom=D(),view=Dom.el("section",{class:"view chat-room moa-chat-room","data-room-id":"__moa_ai__"}),listNode=Dom.el("div",{class:"message-list moa-chat-messages"}),messages=await history();
    if(!messages.length)appendMessage(messages,"assistant",MiniTalk.Store.get("user")?.isGuest?"안녕! 난 모아야. 편하게 얘기해. 게스트 대화 내역도 이 기기에만 남아.":"안녕! 난 모아야. 그냥 편하게 반말로 얘기해. 처음부터 기본적인 얘기는 할 수 있고, 대화하면서 모아 전용 학습도 조금씩 쌓여.",{source:"welcome"});
    fill(listNode,messages);MiniTalk.UI.DragScroll?.bind?.(listNode,{keepScrollbar:true});
    const zone=Dom.el("section",{class:"composer-zone moa-composer-zone"}),hint=Dom.el("div",{class:"moa-learning-hint",text:"그냥 평소처럼 얘기하면 돼. 맞다거나 정정해 주는 반응도 자연스럽게 학습 신호로 활용해."}),form=Dom.el("form",{class:"composer moa-composer"}),input=Dom.el("input",{id:"moaChatInput",placeholder:"모아에게 말하기",maxlength:"500",autocomplete:"off","aria-label":"모아에게 말하기"}),send=Dom.el("button",{class:"send",type:"submit",text:"➤","aria-label":"전송"});
    form.onsubmit=async event=>{event.preventDefault();if(busy)return;const text=input.value.trim();if(!text)return;busy=true;send.disabled=true;input.value="";appendMessage(messages,"user",text);fill(listNode,messages);const typing=Dom.el("article",{class:"message-row moa-ai-message moa-typing"},[Dom.el("div",{class:"message-avatar moa-ai-mini-avatar",text:"모아"}),Dom.el("div",{class:"message-content"},[Dom.el("small",{class:"sender-name",text:"모아"}),Dom.el("div",{class:"bubble-line"},[Dom.el("div",{class:"bubble moa-ai-bubble",text:"생각 중…"})])])]);listNode.append(typing);listNode.scrollTop=listNode.scrollHeight;try{const result=await MiniTalk.AI.MoaChatEngine.reply(text);typing.remove();appendMessage(messages,"assistant",result?.reply||"응? 다시 말해줄래?",{source:result?.source||""});fill(listNode,messages)}catch(error){typing.remove();appendMessage(messages,"assistant","잠깐 연결이 꼬였어. 그래도 여기서 계속 얘기할 수 있어. 한 번만 다시 말해줘.",{source:"error"});fill(listNode,messages);console.warn("모아 대화 실패",error)}finally{busy=false;send.disabled=false;input.focus()}};
    form.append(input,send);zone.append(hint,form);view.append(listNode,zone);host.replaceChildren(view);setTimeout(()=>input.focus(),30)
  }
  function leave(){busy=false}
  return{id:"moa-chat",title:"모아와 대화하기",icon:"",nav:false,render,leave,listItem};
})();
MiniTalk.Registry.register(MiniTalk.Features.MoaChat);
