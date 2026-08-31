/* ============================================================
   모아와 대화하기 - Firebase와 분리된 Apps Script/기기 캐시 기반 1:1 AI 방

   [이 기능을 전체 프로그램에서 완전히 제거하려면]
   - 삭제: js/features/moa-chat.js
   - 삭제: js/ai/moa-communication-engine.js
   - 삭제: css/features/moa-chat.css
   - index.html에서 위 CSS/JS 로드 태그 삭제
   - js/features/chats.js의 MOA_CHAT_INTEGRATION 블록 삭제
   - js/adapters/auth-api.js의 MOA_CHAT_INTEGRATION 블록 삭제
   - sw.js CORE에서 모아 AI 관련 4개 경로 삭제
   - tests/moa-ai-foundation.test.js 삭제(기능을 제거할 때만)
   - Apps Script는 MOA_AI.gs와 Code.gs의 MOA 라우팅 블록을 함께 정리
   - Firebase/Realtime Database/Rules는 이 기능이 사용하지 않으므로 제거 작업 없음

   대화 화면에 보이는 누적 내역은 서버가 아니라 IndexedDB(DataCache)에만 저장합니다.
   ============================================================ */
MiniTalk.Features.MoaChat=(()=>{
  let busy=false,live=null,proactiveTimer=0,connectionGreetingChecked=false,lastHiddenAt=0;
  const listNodes=new Set(),sessions=new Map();
  function D(){return MiniTalk.UI.Dom}
  function listItem(){
    const Dom=D(), node=Dom.el("button",{class:"conversation-item conversation-enter moa-chat-list-item",type:"button","data-room-id":"__moa_ai__","data-tone":"2","data-unread":"0","data-favorite":"0","data-member":"1","data-room-type":"ai","data-has-message":"1"},[
      Dom.el("div",{class:"avatar-wrap"},[Dom.el("img",{class:"avatar profile-image moa-ai-avatar",src:"assets/mascot-avatar.png",alt:"모아",onerror:event=>{event.currentTarget.onerror=null;event.currentTarget.src="assets/mascot-avatar.png"}})]),
      Dom.el("div",{class:"conversation-main"},[Dom.el("strong",{class:"conversation-title",text:"모아와 대화하기"}),Dom.el("p",{class:"conversation-preview",text:"편하게 얘기하면서 조금씩 더 잘 알아듣는 모아"})]),
      Dom.el("div",{class:"conversation-meta"},[Dom.el("span",{class:"moa-ai-badge",text:"AI"})])
    ]);
    listNodes.add(node);node.onclick=()=>MiniTalk.Router.go("moa-chat");refreshProactive(node,{connection:true}).catch(()=>{});startProactiveLoop();return node;
  }
  function cacheKey(){return String(MiniTalk.Store.get("user")?.user_id||"guest")}
  function legacyHistoryKey(){return`moa.chat.history.${cacheKey()}`}
  function mergeHistory(a,b){
    const rows=[...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])],seen=new Set(),out=[];
    rows.sort((x,y)=>Number(x?.ts||0)-Number(y?.ts||0));
    for(const row of rows){if(!row||typeof row!=="object")continue;const id=String(row.id||`${row.ts||0}|${row.role||""}|${row.text||""}`);if(seen.has(id))continue;seen.add(id);out.push(row)}
    return out.slice(-120);
  }
  function session(key=cacheKey()){
    if(!sessions.has(key))sessions.set(key,{messages:[],loaded:false,loading:null,saving:null,pending:null,retryTimer:0,retryCount:0});
    return sessions.get(key);
  }
  function setSessionMessages(st,list){st.messages=(Array.isArray(list)?list:[]).slice(-120);return st.messages}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  async function history(){
    const key=cacheKey(),st=session(key);if(st.loaded)return st.messages;if(st.loading)return st.loading;
    st.loading=(async()=>{
      let cached=null;
      try{cached=await MiniTalk.DataCache?.get?.("moa-chat-history",key,null)}catch(error){console.warn("모아 대화내역 읽기 실패 - 현재 세션 상태 유지",error)}
      if(Array.isArray(cached))setSessionMessages(st,mergeHistory(cached,st.messages));
      else{
        const legacy=MiniTalk.Persistence.get(legacyHistoryKey(),null);
        if(Array.isArray(legacy)&&legacy.length){setSessionMessages(st,mergeHistory(legacy,st.messages));queueHistorySave(st.messages,key);MiniTalk.Persistence.remove(legacyHistoryKey())}
      }
      st.loaded=true;return st.messages;
    })().finally(()=>{st.loading=null});
    return st.loading;
  }
  function scheduleHistoryRetry(key){
    const st=session(key);if(st.retryTimer||!st.pending||st.retryCount>=4)return;
    const delay=[140,420,1400][Math.min(Math.max(st.retryCount-1,0),2)]||1400;
    st.retryTimer=setTimeout(()=>{st.retryTimer=0;flushHistory(key).catch(()=>{})},delay);
  }
  function flushHistory(key=cacheKey()){
    const st=session(key);if(st.saving)return st.saving;if(!st.pending)return Promise.resolve(true);
    st.saving=(async()=>{
      while(st.pending){
        const snapshot=st.pending;st.pending=null;
        try{await MiniTalk.DataCache?.put?.("moa-chat-history",key,snapshot);st.retryCount=0}
        catch(error){
          st.pending=mergeHistory(snapshot,st.pending||[]);st.retryCount+=1;console.warn("모아 대화내역 저장 실패 - 현재 세션은 유지하고 재시도",error);scheduleHistoryRetry(key);return false;
        }
      }
      return true;
    })().finally(()=>{st.saving=null});
    return st.saving;
  }
  function queueHistorySave(list,key=cacheKey()){
    const st=session(key);setSessionMessages(st,list);st.pending=st.messages.slice();flushHistory(key).catch(()=>{});return st.messages;
  }
  function saveHistory(list){queueHistorySave(list);return session().saving||Promise.resolve(true)}
  function appendMessage(list,role,text,meta={}){
    const msg={id:`${Date.now()}-${Math.random().toString(36).slice(2,7)}`,role,text,ts:Date.now(),...meta};
    list.push(msg);queueHistorySave(list);return msg;
  }
  function lastUserAt(messages){const m=[...messages].reverse().find(v=>v.role==="user");return Number(m?.ts||0)}
  function unreadCount(messages){return messages.filter(v=>v.role==="assistant"&&v.source==="proactive"&&v.unread===true).length}
  function updateListNode(node,messages){
    if(!node?.isConnected){listNodes.delete(node);return;}const latest=messages[messages.length-1],count=unreadCount(messages),preview=node.querySelector?.(".conversation-preview"),meta=node.querySelector?.(".conversation-meta");
    if(preview&&latest?.text)preview.textContent=String(latest.text).replace(/\s+/g," ").slice(0,58);node.dataset.unread=String(count);
    let badge=meta?.querySelector?.(".moa-proactive-unread");if(count&&!badge){badge=D().el("span",{class:"moa-proactive-unread",text:String(Math.min(count,9))});meta?.prepend(badge)}else if(badge&&count)badge.textContent=String(Math.min(count,9));else badge?.remove?.();
  }
  async function evaluateIgnored(messages){
    const last=[...messages].reverse().find(v=>v.role==="assistant"&&v.source==="proactive"&&!v.engagementEvaluated);if(!last||last.unread===true||Date.now()-Number(last.ts||0)<4*60*60*1000)return;
    const idx=messages.indexOf(last),replied=messages.slice(idx+1).some(v=>v.role==="user");last.engagementEvaluated=true;if(!replied)MiniTalk.AI.MoaCommunicationEngine.markProactiveIgnored?.();saveHistory(messages);
  }
  async function maybeCreateProactive(messages){
    if(document.querySelector?.(".moa-chat-room"))return null;await evaluateIgnored(messages);
    const planned=MiniTalk.AI.MoaCommunicationEngine.maybeInitiate?.({now:Date.now(),lastUserAt:lastUserAt(messages),hasUnreadProactive:unreadCount(messages)>0});if(!planned?.reply)return null;
    const msg=appendMessage(messages,"assistant",planned.reply,{source:"proactive",candidateId:planned.candidateId||"",strategy:"initiative",initiativeType:planned.type||"general",initiativeTopic:planned.topic||"",unread:true});
    for(const n of [...listNodes])updateListNode(n,messages);return msg;
  }
  async function maybeCreateConnectionGreeting(messages){
    if(document.querySelector?.(".moa-chat-room")||unreadCount(messages)>0)return null;
    const planned=MiniTalk.AI.MoaCommunicationEngine.maybeConnectionGreeting?.({now:Date.now(),lastUserAt:lastUserAt(messages),hasUnreadProactive:false});if(!planned?.reply)return null;
    const msg=appendMessage(messages,"assistant",planned.reply,{source:"proactive",candidateId:planned.candidateId||"",strategy:"initiative",initiativeType:"greeting",initiativeTopic:planned.topic||"",unread:true});
    for(const n of [...listNodes])updateListNode(n,messages);return msg;
  }
  async function refreshProactive(node=null,options={}){
    const messages=await history();let created=null;
    if(options.connection&&!connectionGreetingChecked){connectionGreetingChecked=true;created=await maybeCreateConnectionGreeting(messages);}
    if(!created)await maybeCreateProactive(messages);
    if(node)updateListNode(node,messages);for(const n of [...listNodes])updateListNode(n,messages);return messages;
  }
  function startProactiveLoop(){
    if(proactiveTimer)return;proactiveTimer=setInterval(()=>{if(document.visibilityState!=="hidden")refreshProactive().catch(()=>{})},2*60*1000);
    document.addEventListener?.("visibilitychange",()=>{
      if(document.visibilityState==="hidden"){lastHiddenAt=Date.now();return;}
      if(document.visibilityState==="visible"){const returned=lastHiddenAt&&Date.now()-lastHiddenAt>=30*60*1000;if(returned)connectionGreetingChecked=false;refreshProactive(null,{connection:returned}).catch(()=>{});}
    });
  }
  function appendRichText(node,text){
    const doc=D().doc(),parts=String(text||"").split(/(https?:\/\/[^\s]+)/g);
    const linkLabel=url=>{try{const host=new URL(url).hostname.replace(/^www\./,'');if(/wikipedia\.org$/.test(host))return "Wikipedia에서 보기 ↗";if(/youtube\.com$|youtu\.be$/.test(host))return "YouTube에서 보기 ↗";if(/google\.com$/.test(host)&&/maps/.test(url))return "Google 지도에서 보기 ↗";if(/map\.naver\.com$/.test(host))return "네이버 지도에서 보기 ↗";if(/google\.com$/.test(host))return "Google에서 더 보기 ↗";if(/naver\.com$/.test(host))return "네이버에서 보기 ↗";return host+"에서 보기 ↗"}catch{return "결과 열기 ↗"}};
    parts.forEach(part=>{if(/^https?:\/\//i.test(part)){const a=doc.createElement("a");a.href=part;a.target="_blank";a.rel="noopener noreferrer";a.className="moa-answer-link";a.textContent=linkLabel(part);node.append(a)}else node.append(doc.createTextNode(part))});
  }
  function moaAvatar(className){return D().el("img",{class:`${className} profile-image`,src:"assets/mascot-avatar.png",alt:"모아",onerror:event=>{event.currentTarget.onerror=null;event.currentTarget.src="assets/mascot-avatar.png"}})}
  function messageNode(message){
    const Dom=D(),mine=message.role==="user",row=Dom.el("article",{class:`message-row ${mine?"mine":""} moa-ai-message`});
    if(!mine)row.append(moaAvatar("message-avatar moa-ai-mini-avatar"));
    const content=Dom.el("div",{class:"message-content"});if(!mine)content.append(Dom.el("small",{class:"sender-name",text:"모아"}));
    const richKind=/^open-meteo/.test(message.source||"")?" moa-info-card moa-weather-card":/(search|wikipedia|duckduckgo|google-news|knowledge-answer|image-answer|image-search)/.test(message.source||"")?" moa-info-card moa-search-card":"";
    const bubble=Dom.el("div",{class:`bubble moa-ai-bubble${richKind}`});appendRichText(bubble,message.text);
    const safeImage=/^https:\/\//i.test(String(message.imageUrl||""))?String(message.imageUrl):"";
    if(!mine&&safeImage){
      const wrap=Dom.el("div",{class:"moa-image-result"}),img=Dom.el("img",{class:"moa-image-result-img",src:safeImage,alt:"검색 이미지",loading:"lazy"});
      img.onerror=()=>wrap.remove();
      img.onclick=()=>{try{window.open(safeImage,"_blank","noopener,noreferrer")}catch{}};
      wrap.append(img);bubble.append(wrap);
    }
    if(!mine&&/^https:\/\//i.test(String(message.imageSearchUrl||""))){
      const a=Dom.el("a",{class:"moa-answer-link moa-image-more",href:String(message.imageSearchUrl),target:"_blank",rel:"noopener noreferrer",text:"Google 이미지에서 더 보기 ↗"});
      bubble.append(a);
    }
    const meta=Dom.el("time",{class:"message-time",text:new Date(message.ts||Date.now()).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})});
    content.append(Dom.el("div",{class:"bubble-line"},mine?[meta,bubble]:[bubble,meta]));row.append(content);return row
  }
  function fill(listNode,messages){listNode.replaceChildren(...messages.map(messageNode));listNode.scrollTop=listNode.scrollHeight;requestAnimationFrame(()=>{if(listNode.isConnected)listNode.scrollTop=listNode.scrollHeight})}
  function header(){MiniTalk.UI.Shell.setHeader("모아와 대화하기",[D().el("button",{class:"icon-button subtle",type:"button",text:"⋯","aria-label":"모아 대화 메뉴",onclick:openMenu})],{back:()=>MiniTalk.Router.go("chats")})}
  function openMenu(){const Dom=D(),body=Dom.el("div",{class:"modal-stack"}),settings=MiniTalk.AI.MoaCommunicationEngine.initiativeSettings?.()||{enabled:true,quietStart:22,quietEnd:7},initiative=Dom.el("button",{class:"button secondary",type:"button",text:settings.enabled?"먼저 말 걸기: 켜짐":"먼저 말 걸기: 꺼짐"}),clear=Dom.el("button",{class:"button secondary",type:"button",text:"이 기기의 대화 내역 지우기"});initiative.onclick=()=>{const next=MiniTalk.AI.MoaCommunicationEngine.setInitiativeSettings?.({enabled:!MiniTalk.AI.MoaCommunicationEngine.initiativeSettings?.().enabled});initiative.textContent=next?.enabled?"먼저 말 걸기: 켜짐":"먼저 말 걸기: 꺼짐"};clear.onclick=async()=>{const key=cacheKey(),st=sessions.get(key);if(st?.retryTimer)clearTimeout(st.retryTimer);sessions.delete(key);await MiniTalk.DataCache?.remove?.("moa-chat-history",key);MiniTalk.Persistence.remove(legacyHistoryKey());MiniTalk.AI.MoaCommunicationEngine.clearContext();MiniTalk.UI.Shell.closeModal();MiniTalk.Router.go("moa-chat")};body.append(Dom.el("p",{class:"muted modal-note",text:`모아는 대화가 쌓이면 최근 얘기·요일·시간대에 맞춰 약 2시간 간격으로 한 번씩 확률적으로 먼저 말을 걸 수 있어. 접속할 때도 가끔 가볍게 인사하고, ${settings.quietStart}:00~${settings.quietEnd}:00에는 먼저 말하지 않아.`}),initiative,Dom.el("p",{class:"muted modal-note",text:"화면에 보이는 대화 내역과 짧은 문맥은 이 기기에만 저장돼. Firebase에는 모아 대화를 저장하지 않아."}),clear);MiniTalk.UI.Shell.modal("모아 대화 설정",body)}
  async function render(host){
    MiniTalk.Store.set("activeRoom",null);MiniTalk.Realtime.unsubscribeMessages?.();header();
    /* 공용 학습 스냅샷과 개인 성향/기억은 뒤에서 캐시 동기화합니다. 화면 진입을 막지 않습니다. */
    MiniTalk.AI.MoaCommunicationEngine.warmup?.();
    const Dom=D(),view=Dom.el("section",{class:"view chat-room moa-chat-room","data-room-id":"__moa_ai__"}),listNode=Dom.el("div",{class:"message-list moa-chat-messages"}),messages=await history();
    if(!messages.length)appendMessage(messages,"assistant",MiniTalk.Store.get("user")?.isGuest?"안녕! 난 모아야. 편하게 얘기해. 게스트 대화 내역도 이 기기에만 남아.":"안녕! 난 모아야. 편하게 반말로 얘기해. 궁금한 것도 물어보고 그냥 수다 떨어도 돼.",{source:"welcome"});
    let readChanged=false;messages.forEach(m=>{if(m.role==="assistant"&&m.source==="proactive"&&m.unread===true){m.unread=false;readChanged=true}});if(readChanged)saveHistory(messages);
    live={messages,listNode};for(const n of [...listNodes])updateListNode(n,messages);fill(listNode,messages);MiniTalk.UI.DragScroll?.bind?.(listNode,{keepScrollbar:true});
    const zone=Dom.el("section",{class:"composer-zone moa-composer-zone"}),hint=Dom.el("div",{class:"moa-learning-hint",text:"대화는 이 기기에서 바로 처리되고, 학습 변화만 묶어서 동기화돼."}),form=Dom.el("form",{class:"composer moa-composer"}),input=Dom.el("input",{id:"moaChatInput",placeholder:"모아에게 말하기",maxlength:"500",autocomplete:"off","aria-label":"모아에게 말하기"}),send=Dom.el("button",{class:"send",type:"submit",text:"➤","aria-label":"전송"});
    form.onsubmit=async event=>{event.preventDefault();if(busy)return;const text=input.value.trim();if(!text)return;busy=true;send.disabled=true;input.value="";appendMessage(messages,"user",text);fill(listNode,messages);const typing=Dom.el("article",{class:"message-row moa-ai-message moa-typing"},[moaAvatar("message-avatar moa-ai-mini-avatar"),Dom.el("div",{class:"message-content"},[Dom.el("small",{class:"sender-name",text:"모아"}),Dom.el("div",{class:"bubble-line"},[Dom.el("div",{class:"bubble moa-ai-bubble",text:"생각 중…"})])])]);listNode.append(typing);listNode.scrollTop=listNode.scrollHeight;try{const result=await MiniTalk.AI.MoaCommunicationEngine.reply(text);typing.remove();appendMessage(messages,"assistant",result?.reply||"응? 다시 말해줄래?",{source:result?.source||"",imageUrl:result?.imageUrl||"",imageSearchUrl:result?.imageSearchUrl||"",sourceUrl:result?.sourceUrl||""});fill(listNode,messages)}catch(error){typing.remove();appendMessage(messages,"assistant","잠깐 연결이 꼬였어. 그래도 여기서 계속 얘기할 수 있어. 한 번만 다시 말해줘.",{source:"error"});fill(listNode,messages);console.warn("모아 대화 실패",error)}finally{busy=false;send.disabled=false;input.focus()}};
    form.append(input,send);zone.append(hint);zone.append(form);view.append(listNode,zone);host.replaceChildren(view);setTimeout(()=>input.focus(),30)
  }
  function leave(){busy=false;live=null;refreshProactive().catch?.(()=>{})}
  return{id:"moa-chat",title:"모아와 대화하기",icon:"",nav:false,render,leave,listItem};
})();
MiniTalk.Registry.register(MiniTalk.Features.MoaChat);
