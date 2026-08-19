/* ============================================================
   APP SHELL
   - 인증/메뉴/헤더/모달/토스트만 관리합니다.
   - 각 feature의 기능 로직을 포함하지 않습니다.
   ============================================================ */
MiniTalk.UI.Shell=(()=>{
  const D=doc=>doc?MiniTalk.UI.Dom.forDocument(doc):MiniTalk.UI.Dom;let started=false,entering=false,activeUserId=null;const modalCloseTimers=new WeakMap();
  function toast(message,doc){const Dom=D(doc),host=Dom.byId("toastHost");if(!host)return;const item=Dom.el("div",{class:"toast",text:String(message||"")});host.append(item);requestAnimationFrame(()=>item.classList.add("show"));setTimeout(()=>{item.classList.remove("show");setTimeout(()=>item.remove(),220)},2600)}
  function notifyBanner({icon="●",title="모아루",body="",onClick=null,duration=5600}={},doc){const Dom=D(doc),host=Dom.byId("notificationHost");if(!host)return toast(body||title,doc);const item=Dom.el("section",{class:`app-notification-banner${onClick?" actionable":""}`,role:onClick?"button":"status",tabindex:onClick?"0":null,"aria-label":`${title} ${body}`.trim()}),glyph=Dom.el("span",{class:"app-notification-icon",text:String(icon||"●")}),copy=Dom.el("span",{class:"app-notification-copy"},[Dom.el("strong",{text:String(title||"모아루")}),Dom.el("small",{text:String(body||"")})]),close=Dom.el("button",{class:"app-notification-close",type:"button",text:"×","aria-label":"알림 닫기"});let timer=0;const dismiss=()=>{clearTimeout(timer);item.classList.remove("show");item.classList.add("leaving");setTimeout(()=>item.remove(),220)};close.onclick=event=>{event.stopPropagation();dismiss()};if(onClick){item.onclick=()=>{dismiss();onClick()};item.onkeydown=event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();item.click()}}}item.append(glyph,copy,close);host.prepend(item);while(host.children.length>3)host.lastElementChild?.remove();requestAnimationFrame(()=>item.classList.add("show"));timer=setTimeout(dismiss,Math.max(2500,Number(duration)||5600));return{dismiss,element:item}}
  function closeModal(doc){const Dom=D(doc),host=Dom.byId("modalHost");if(!host)return;const targetDoc=host.ownerDocument,timer=modalCloseTimers.get(targetDoc);if(timer)clearTimeout(timer);host.classList.add("closing");const closingHost=host,nextTimer=setTimeout(()=>{modalCloseTimers.delete(targetDoc);if(closingHost.classList.contains("closing")){closingHost.className="modal-host hidden";closingHost.replaceChildren()}},170);modalCloseTimers.set(targetDoc,nextTimer)}
  function modal(title,body,options={},doc){const Dom=D(doc),host=Dom.byId("modalHost");if(!host)return null;const targetDoc=host.ownerDocument,timer=modalCloseTimers.get(targetDoc);if(timer)clearTimeout(timer);modalCloseTimers.delete(targetDoc);host.className=`modal-host ${options.hostClass||""}`.trim();const closeModalHere=()=>closeModal(targetDoc),box=Dom.el("section",{class:`modal modal-enter ${options.modalClass||""}`.trim(),role:"dialog","aria-modal":"true","aria-label":title});const close=Dom.el("button",{class:"icon-button subtle modal-close-button",type:"button",text:"×","aria-label":"닫기",onclick:closeModalHere});const head=Dom.el("header",{},[Dom.el("strong",{text:title}),close]);box.append(head,body);host.replaceChildren(box);host.onclick=e=>{if(e.target===host)closeModalHere()};close.focus?.();return host}
  function setHeader(title,actions=[],opts={},doc){const Dom=D(doc),titleNode=Dom.byId("headerTitle"),host=Dom.byId("headerActions"),back=Dom.byId("backBtn"),profile=Dom.byId("headerProfileButton");if(titleNode)titleNode.textContent=title;if(profile){profile.classList.toggle("hidden",opts.profile!==true);profile.disabled=opts.profile===true&&opts.profileEditable===false;profile.onclick=opts.profile===true&&opts.profileEditable!==false?opts.onProfile||null:null;profile.setAttribute("aria-label",profile.disabled?"프로필 수정은 로그인 후 이용할 수 있습니다":"내 프로필 설정");if(opts.profileNode)profile.replaceChildren(opts.profileNode)}if(host){const extra=[];if(!doc&&MiniTalk.MobileImmersive?.isBrowserMode?.()){const full=MiniTalk.MobileImmersive.isFullscreen?.()===true;extra.push(Dom.el("button",{class:"icon-button subtle immersive-button",type:"button",text:full?"↙":"⛶","aria-label":full?"전체 화면 종료":"전체 화면",onclick:()=>MiniTalk.MobileImmersive.toggleFullscreenFromGesture().then(ok=>{syncImmersiveButton();if(!ok)toast("브라우저가 전체 화면 전환을 허용하지 않았습니다.")})}))}host.replaceChildren(...actions,...extra)}if(back){back.classList.toggle("hidden",!opts.back);back.onclick=opts.back||null}}
  function forDocument(doc){return{toast:message=>toast(message,doc),notifyBanner:options=>notifyBanner(options,doc),modal:(title,body,options)=>modal(title,body,options,doc),closeModal:()=>closeModal(doc),setHeader:(title,actions,opts)=>setHeader(title,actions,opts,doc)}}
  function renderRealtimeWaitState(info={}){
    const doc=D().doc(),existing=doc.getElementById("realtimeWaitHost");
    if(info.state==="connected"||info.state==="error"){existing?.remove();return}
    if(info.state!=="waiting"&&info.state!=="offline")return;
    let host=existing;if(!host){host=doc.createElement("div");host.id="realtimeWaitHost";host.className="realtime-wait-host";host.innerHTML='<section class="realtime-wait-card" role="status" aria-live="polite"><div class="realtime-wait-spinner" aria-hidden="true"></div><strong class="realtime-wait-title"></strong><p class="realtime-wait-copy"></p></section>';doc.body.append(host)}
    const title=host.querySelector(".realtime-wait-title"),copy=host.querySelector(".realtime-wait-copy");
    if(info.state==="offline"){if(title)title.textContent="인터넷 연결을 기다리는 중입니다.";if(copy)copy.textContent="연결이 복구되면 자동으로 계속합니다."}
    else{if(title)title.textContent="현재 접속 인원이 많아 대기 중입니다.";if(copy){copy.replaceChildren(D().el("span",{text:"잠시 후 자동으로 다시 연결합니다."}),D().el("span",{class:"realtime-wait-note",text:"연결이 지연되는 경우에도 자동으로 다시 시도합니다."}))}}
  }

  function syncImmersiveButton(){const button=D().one(".immersive-button"),full=MiniTalk.MobileImmersive?.isFullscreen?.()===true;if(!button)return;button.textContent=full?"↙":"⛶";button.setAttribute("aria-label",full?"전체 화면 종료":"전체 화면")}
  function visibleFeatures(){return MiniTalk.Registry.all().filter(f=>f.nav!==false&&(!f.isVisible||f.isVisible()))}
  function normalizedOrder(features){const preferred=["chats","feed","tools","tasks","shopping","settings"],ids=features.map(f=>f.id);return[...preferred.filter(id=>ids.includes(id)),...ids.filter(id=>!preferred.includes(id))]}
  function navButton(feature){return D().el("button",{class:`nav-button ${MiniTalk.Store.get("route")===feature.id?"active":""}`,type:"button","data-route":feature.id,onclick:()=>MiniTalk.Router.go(feature.id)},[D().el("span",{text:feature.icon||"•"}),D().el("small",{text:feature.title})])}
  function renderNav(){const features=visibleFeatures(),order=normalizedOrder(features);features.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));const side=D().byId("sideRail"),bottom=D().byId("bottomNav");if(side)side.replaceChildren(...features.map(navButton));if(bottom)bottom.replaceChildren(...features.map(navButton))}
  function setActiveNav(id){const navId=id==="games"||id==="links"?"tools":id==="admin"?"settings":id;D().all("[data-route]").forEach(b=>b.classList.toggle("active",b.dataset.route===navId))}
  async function showApp(){document.getElementById("launchView")?.classList.add("hidden");D().byId("appShell")?.classList.remove("hidden");document.documentElement.classList.add("app-visible");if(!started){started=true;MiniTalk.Features.Auth.render(D().byId("authHost"))}const user=MiniTalk.Store.get("user");if(user)await enterWorkspace(user);MiniTalk.MobileImmersive?.afterAppShown?.()}
  async function enterWorkspace(user){
    if(entering||activeUserId===user.user_id)return;
    entering=true;activeUserId=user.user_id;
    D().byId("authHost")?.classList.add("hidden");D().byId("workspace")?.classList.remove("hidden");
    /* Apps Script 인증 성공이 작업공간 진입 기준입니다. Firebase는 데이터 채널이므로 첫 화면을 막지 않고 동시에 초기화합니다. */
    const realtimeReady=MiniTalk.Realtime.init(user).then(transport=>{
      if(!user.isGuest&&transport!=="firebase"){const reason=MiniTalk.Realtime.getConnectionError?.()||"";toast(/permission-denied/i.test(reason)?"Firebase 데이터베이스 규칙을 적용해주세요.":"실시간 서버 연결을 확인해주세요.")}
      return transport
    }).catch(error=>{console.warn("실시간 데이터 채널 초기화 실패",error);if(!user.isGuest)toast("실시간 서버 연결을 확인해주세요.");return"local"});
    try{
      if(!user.isGuest)MiniTalk.Economy.CoinWallet?.refresh?.(true).catch(error=>console.warn("코인 계정 동기화 실패",error));
      MiniTalk.UserDirectory?.refresh?.().catch(error=>console.warn("가입자 명단을 불러오지 못했습니다.",error));
      MiniTalk.Shopping.StoreService?.start?.(user);MiniTalk.Tasks.TaskService?.start?.(user);
      renderNav();await MiniTalk.Router.go("chats");MiniTalk.Features.Admin?.applyStoredLock?.();
    }catch(error){
      activeUserId=null;toast(error.message||"화면을 여는 중 오류가 발생했습니다.");D().byId("authHost")?.classList.remove("hidden");D().byId("workspace")?.classList.add("hidden");MiniTalk.Realtime.cleanup?.();
    }finally{entering=false}
    void realtimeReady;
  }
  function resetWorkspaceSession(){activeUserId=null;entering=false;MiniTalk.Store.set("transport","idle")}
  function updateInstallButton(v){document.getElementById("installBtn")?.classList.toggle("hidden",!v)}
  function start(){MiniTalk.Events.on("state:transport",mode=>{const b=D().byId("connectionBadge");if(b){b.textContent=mode==="firebase"?"온라인":"로컬";b.dataset.mode=mode}});MiniTalk.Events.on("rt:error",info=>toast(info?.message||"실시간 서버 데이터를 읽지 못했습니다."));MiniTalk.Events.on("rt:connection-wait",renderRealtimeWaitState);MiniTalk.Events.on("auth:success",enterWorkspace);MiniTalk.Events.on("install:available",updateInstallButton);MiniTalk.Events.on("state:admin",renderNav);MiniTalk.Events.on("fullscreen:change",syncImmersiveButton);addEventListener("keydown",event=>{if(event.key==="Escape"&&!D().byId("modalHost")?.classList.contains("hidden"))closeModal()});updateInstallButton(MiniTalk.WindowMode.canInstall?.()===true)}
  return{start,showApp,enterWorkspace,resetWorkspaceSession,toast,notifyBanner,modal,closeModal,setHeader,setActiveNav,renderNav,forDocument};
})();
