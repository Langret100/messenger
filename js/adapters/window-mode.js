/* ============================================================
   WINDOW MODE ADAPTER
   ------------------------------------------------------------
   목적
   1) 기본: 일반 브라우저의 "minimal popup" 요청으로 독립 소형 창 실행
   2) 선택: Document Picture-in-Picture 로 항상 위 창 실행
   3) 선택: 설치된 PWA 독립 창
   4) 폴백: 현재 페이지

   중요한 제한
   - window.open()의 popup/toolbar/location 옵션은 "요청"입니다.
     실제 주소/출처 UI를 얼마나 남길지는 브라우저가 결정합니다.
   - Document PiP는 항상 위지만 브라우저 보안용 상단 UI가 남습니다.
   - 일반 웹 코드만으로 완전한 프레임리스 + 항상 위 창은 만들 수 없습니다.
   ============================================================ */
MiniTalk.WindowMode=(()=>{
  const POPUP_NAME="MiniTalkCornerWindow";
  const BOUNDS_VERSION=2;
  const DEFAULT_BOUNDS={width:460,height:760};
  const POPUP_PARAM="window";
  let installEvent=null,pipWindow=null,movedNodes=[],popupHandle=null,popupWatchTimer=0,boundsTimer=0;

  addEventListener("beforeinstallprompt",event=>{
    event.preventDefault();
    installEvent=event;
    MiniTalk.Events.emit("install:available",true);
  });
  addEventListener("appinstalled",()=>{
    installEvent=null;
    MiniTalk.Events.emit("install:available",false);
  });

  const params=()=>new URLSearchParams(location.search);
  const isPopup=()=>params().get(POPUP_PARAM)==="popup";
  const standalone=()=>matchMedia("(display-mode: standalone)").matches||matchMedia("(display-mode: window-controls-overlay)").matches||navigator.standalone===true;
  const canInstall=()=>Boolean(installEvent);

  function clampNumber(value,min,max,fallback){
    const n=Number(value);
    return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;
  }
  function readPopupBounds(){
    const saved=MiniTalk.Persistence?.get?.("window.popupBounds",null)||{};
    const availW=Math.max(320,screen.availWidth||DEFAULT_BOUNDS.width);
    const availH=Math.max(420,screen.availHeight||DEFAULT_BOUNDS.height);
    const originX=Number(screen.availLeft)||0,originY=Number(screen.availTop)||0;
    const useSaved=saved.version===BOUNDS_VERSION;
    const width=Math.round(clampNumber(useSaved?saved.width:undefined,360,Math.min(900,availW),Math.min(DEFAULT_BOUNDS.width,availW)));
    const height=Math.round(clampNumber(useSaved?saved.height:undefined,520,Math.min(1000,availH),Math.min(DEFAULT_BOUNDS.height,availH)));
    const centeredLeft=originX+Math.max(0,Math.round((availW-width)/2));
    const centeredTop=originY+Math.max(0,Math.round((availH-height)/2));
    return{
      width,height,
      left:Math.round(clampNumber(useSaved?saved.left:undefined,originX,originX+Math.max(0,availW-width),centeredLeft)),
      top:Math.round(clampNumber(useSaved?saved.top:undefined,originY,originY+Math.max(0,availH-height),centeredTop))
    };
  }
  function savePopupBounds(){
    if(!isPopup())return;
    const width=Math.max(320,Math.round(window.innerWidth||DEFAULT_BOUNDS.width));
    const height=Math.max(420,Math.round(window.innerHeight||DEFAULT_BOUNDS.height));
    const left=Math.round(Number.isFinite(window.screenX)?window.screenX:DEFAULT_BOUNDS.left);
    const top=Math.round(Number.isFinite(window.screenY)?window.screenY:DEFAULT_BOUNDS.top);
    try{MiniTalk.Persistence.set("window.popupBounds",{version:BOUNDS_VERSION,width,height,left,top})}catch(error){console.warn("팝업 위치 저장 실패",error)}
  }
  function startPopupBoundsTracking(){
    if(!isPopup()||boundsTimer)return;
    let last="";
    const snapshot=()=>`${window.screenX}|${window.screenY}|${window.innerWidth}|${window.innerHeight}`;
    boundsTimer=setInterval(()=>{
      const now=snapshot();
      if(now!==last){last=now;savePopupBounds()}
    },1200);
    addEventListener("resize",savePopupBounds,{passive:true});
    addEventListener("pagehide",()=>{savePopupBounds();clearInterval(boundsTimer);boundsTimer=0},{once:true});
  }
  function popupUrl(){
    const url=new URL(location.href);
    url.searchParams.set(POPUP_PARAM,"popup");
    url.searchParams.delete("source");
    return url.href;
  }
  function popupFeatures(bounds){
    /* legacy UI flags도 함께 넣지만 최신 브라우저에서는 주로 popup 요청 신호로만 취급됩니다. */
    return[
      "popup=yes","toolbar=no","location=no","menubar=no","status=no","directories=no","personalbar=no",
      "scrollbars=yes","resizable=yes",
      `width=${bounds.width}`,`height=${bounds.height}`,`left=${bounds.left}`,`top=${bounds.top}`
    ].join(",");
  }
  function setLaunchMessage(text){
    const node=document.getElementById("launchMessage");
    if(node)node.textContent=text||"";
  }
  function updatePopupControls(open){
    document.getElementById("popupControls")?.classList.toggle("hidden",!open);
  }
  function watchPopup(){
    clearInterval(popupWatchTimer);
    popupWatchTimer=0;
    if(!popupHandle)return;
    updatePopupControls(true);
    popupWatchTimer=setInterval(()=>{
      let closed=true;
      try{closed=popupHandle.closed}catch{}
      if(closed){
        clearInterval(popupWatchTimer);popupWatchTimer=0;popupHandle=null;
        updatePopupControls(false);setLaunchMessage("구석창이 닫혔습니다.");
      }
    },900);
  }
  async function openPopup(){
    if(isPopup()||standalone()){
      await MiniTalk.UI.Shell.showApp();
      return true;
    }
    try{
      if(popupHandle&&!popupHandle.closed){popupHandle.focus();setLaunchMessage("열려 있는 모아루 창을 앞으로 가져왔습니다.");return true}
    }catch{popupHandle=null}
    const bounds=readPopupBounds();
    const handle=window.open(popupUrl(),POPUP_NAME,popupFeatures(bounds));
    if(!handle){
      setLaunchMessage("팝업이 차단되었습니다. 항상 위 모드나 현재 창을 사용할 수 있습니다.");
      return false;
    }
    popupHandle=handle;
    try{popupHandle.focus()}catch{}
    setLaunchMessage("화면 중앙에 모아루 창을 열었습니다. 조정한 크기와 위치는 기억됩니다.");
    watchPopup();
    return true;
  }
  function focusPopup(){
    try{if(popupHandle&&!popupHandle.closed){popupHandle.focus();return true}}catch{}
    setLaunchMessage("열려 있는 구석창을 찾지 못했습니다.");
    updatePopupControls(false);
    return false;
  }
  function closePopup(){
    try{if(popupHandle&&!popupHandle.closed)popupHandle.close()}catch{}
    popupHandle=null;updatePopupControls(false);setLaunchMessage("구석창을 닫았습니다.");
  }

  function copyStyles(doc){
    for(const sheet of document.styleSheets){
      try{
        if(sheet.href){const link=doc.createElement("link");link.rel="stylesheet";link.href=sheet.href;doc.head.append(link)}
        else{const style=doc.createElement("style");style.textContent=[...sheet.cssRules].map(rule=>rule.cssText).join("\n");doc.head.append(style)}
      }catch(error){console.warn("PiP 스타일 복사 실패",error)}
    }
  }
  function restoreNodes(){
    if(!movedNodes.length)return;
    /* 게임/잠금처럼 body에 동적으로 붙는 레이어는 appShell과 별개이므로 문서 이동 전에 정리합니다. */
    try{MiniTalk.GameHost?.close?.()}catch(error){console.warn("PiP 게임 정리 실패",error)}
    try{pipWindow?.document?.getElementById("hardLock")?.remove()}catch{}
    for(const node of movedNodes)document.body.append(node);
    movedNodes=[];
    MiniTalk.Store.set("rootDocument",document);
    MiniTalk.Features.Layout?.apply?.();
    MiniTalk.Features.Admin?.applyStoredLock?.();
  }
  async function openPiP(){
    if(!window.documentPictureInPicture)return false;
    if(pipWindow&&!pipWindow.closed){pipWindow.focus();return true}
    pipWindow=await documentPictureInPicture.requestWindow({width:440,height:740,disallowReturnToOpener:true});
    const doc=pipWindow.document,meta=doc.createElement("meta"),base=doc.createElement("base");
    meta.name="viewport";meta.content="width=device-width,initial-scale=1,viewport-fit=cover";base.href=document.baseURI;
    doc.head.append(meta,base);doc.title=MiniTalkConfig.appName;
    copyStyles(doc);
    movedNodes=["appShell","toastHost","overlayHost","modalHost"].map(id=>document.getElementById(id)).filter(Boolean);
    /* 기존 문서의 잠금 레이어는 별도 body 자식이라 자동 이동되지 않습니다. */
    document.getElementById("hardLock")?.remove();
    for(const node of movedNodes)doc.body.append(node);
    MiniTalk.Store.set("rootDocument",doc);MiniTalk.Features.Layout?.apply?.();MiniTalk.Features.Admin?.applyStoredLock?.();
    pipWindow.addEventListener("pagehide",()=>{restoreNodes();pipWindow=null},{once:true});
    await MiniTalk.UI.Shell.showApp();
    setLaunchMessage("항상 위(PiP) 창에서 실행 중입니다.");
    return true;
  }
  async function openPiPWithFallback(){
    if(standalone()||isPopup()){await MiniTalk.UI.Shell.showApp();return true}
    try{if(await openPiP())return true}catch(error){MiniTalk.UI.Shell.toast(`항상 위 창 실패: ${error.message}`)}
    return false;
  }
  async function openForLogin(){
    if(MiniTalk.MobileImmersive?.isMobile?.()||standalone()||isPopup())return false;
    if(!window.documentPictureInPicture)return false;
    return openPiP();
  }
  async function openBest(){
    /* 모바일은 별도 팝업보다 현재 탭 + immersive 처리가 안정적입니다. */
    if(MiniTalk.MobileImmersive?.isMobile?.()){
      await openHere({immersive:true});
      return "mobile-here";
    }
    /* 데스크톱 기본은 독립성이 높은 일반 popup. 차단될 때만 PiP, 마지막으로 현재 창. */
    if(await openPopup())return "popup";
    if(await openPiPWithFallback())return "pip";
    await MiniTalk.UI.Shell.showApp();
    return "here";
  }
  async function openHere(options={}){
    if(options.immersive===true)await MiniTalk.MobileImmersive?.enterFromGesture?.();
    await MiniTalk.UI.Shell.showApp();
    MiniTalk.MobileImmersive?.afterAppShown?.();
    return true;
  }
  async function install(){
    if(!installEvent)throw new Error("현재 설치 요청을 사용할 수 없습니다.");
    await installEvent.prompt();
    const result=await installEvent.userChoice;
    installEvent=null;MiniTalk.Events.emit("install:available",false);
    return result.outcome;
  }
  function initWindowInstance(){
    if(isPopup()){
      document.documentElement.dataset.windowMode="popup";
      document.body.classList.add("popup-window");
      startPopupBoundsTracking();
    }else if(standalone()){
      document.documentElement.dataset.windowMode="standalone";
    }else{
      document.documentElement.dataset.windowMode="browser";
    }
  }
  initWindowInstance();
  return{
    openBest,openPopup,openPiP:openPiPWithFallback,openForLogin,openHere,
    focusPopup,closePopup,install,standalone,canInstall,isPopup,initWindowInstance
  };
})();
