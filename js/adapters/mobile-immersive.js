/* ============================================================
   MOBILE IMMERSIVE ADAPTER
   ------------------------------------------------------------
   목적
   - 모바일 일반 웹에서 브라우저 주소창/하단 툴바가 차지하는 영역을
     가능한 한 줄이고, 앱이 실제 보이는 viewport에 맞게 유지합니다.
   - Fullscreen API가 지원되면 사용자 클릭 제스처 안에서만 요청합니다.
   - Fullscreen을 쓸 수 없는 브라우저에서는 주소창 자동 접힘을 방해하지
     않도록 VisualViewport와 아주 작은 root-scroll 여유를 사용합니다.

   중요한 제한
   - 웹페이지가 모바일 브라우저의 주소창/하단 메뉴를 강제로 제거할 수는 없습니다.
   - requestFullscreen()은 반드시 사용자 제스처가 필요하고 브라우저가 거부할 수 있습니다.
   - 아래 scroll nudge는 '숨김 보장'이 아니라 브라우저 기본 자동 접힘을 유도하는
     best-effort 처리입니다. 실패해도 앱 레이아웃은 정상이어야 합니다.
   ============================================================ */
MiniTalk.MobileImmersive=(()=>{
  let started=false,viewportTimer=0,lastViewportHeight=0;

  const standalone=()=>MiniTalk.WindowMode?.standalone?.()===true ||
    matchMedia("(display-mode: standalone)").matches || navigator.standalone===true;

  function isMobile(){
    const ua=navigator.userAgent||"";
    const uaMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(ua);
    const narrow=matchMedia("(max-width: 700px)").matches;
    const coarse=matchMedia("(pointer: coarse)").matches;
    return uaMobile || (narrow&&coarse);
  }

  function isBrowserMode(){
    return isMobile()&&!standalone()&&!MiniTalk.WindowMode?.isPopup?.();
  }

  function updateViewport(){
    if(!isMobile())return;
    const vv=window.visualViewport;
    const height=Math.max(320,Math.round(vv?.height||window.innerHeight||document.documentElement.clientHeight||0));
    const top=Math.max(0,Math.round(vv?.offsetTop||0));
    const width=Math.max(280,Math.round(vv?.width||window.innerWidth||document.documentElement.clientWidth||0));
    const keyboard=Math.max(0,Math.round((window.innerHeight||height)-height-top));
    const root=document.documentElement;
    root.style.setProperty("--visual-vh",`${height}px`);
    root.style.setProperty("--visual-vw",`${width}px`);
    root.style.setProperty("--visual-top",`${top}px`);
    root.style.setProperty("--keyboard-inset",`${keyboard}px`);
    root.classList.toggle("virtual-keyboard-open",keyboard>120);
    lastViewportHeight=height;
  }

  function scheduleViewportUpdate(){
    clearTimeout(viewportTimer);
    viewportTimer=setTimeout(updateViewport,30);
  }

  function nudgeBrowserChrome(){
    if(!isBrowserMode()||document.fullscreenElement)return false;
    /* root가 1~2px 움직일 수 있을 때만 시도. 앱 내부 스크롤에는 손대지 않습니다. */
    try{
      if(window.scrollY<1){window.scrollTo({top:1,left:0,behavior:"instant"})}
      return true;
    }catch{
      try{window.scrollTo(0,1);return true}catch{return false}
    }
  }

  async function requestFullscreenFromGesture(){
    if(!isBrowserMode()||document.fullscreenElement)return document.fullscreenElement!=null;
    const root=document.documentElement;
    const fn=root.requestFullscreen||root.webkitRequestFullscreen;
    if(typeof fn!=="function")return false;
    try{
      /* navigationUI:'hide'는 지원 브라우저에서만 힌트로 사용됩니다. */
      const result=fn.call(root,{navigationUI:"hide"});
      if(result&&typeof result.then==="function")await result;
      return Boolean(document.fullscreenElement||document.webkitFullscreenElement);
    }catch(error){
      console.info("모바일 전체화면 요청 미지원/거부",error?.name||error?.message||error);
      return false;
    }
  }

  async function enterFromGesture(){
    if(!isMobile())return false;
    document.documentElement.dataset.mobileImmersive="1";
    const full=await requestFullscreenFromGesture();
    updateViewport();
    if(!full){
      setTimeout(nudgeBrowserChrome,80);
      setTimeout(nudgeBrowserChrome,450);
    }
    return full;
  }

  function afterAppShown(){
    if(!isMobile())return;
    document.documentElement.dataset.mobileImmersive="1";
    updateViewport();
    if(!document.fullscreenElement){
      setTimeout(nudgeBrowserChrome,100);
      setTimeout(nudgeBrowserChrome,600);
    }
  }

  function start(){
    if(started)return;
    started=true;
    if(!isMobile())return;
    document.documentElement.classList.add("mobile-browser");
    updateViewport();
    window.visualViewport?.addEventListener("resize",scheduleViewportUpdate,{passive:true});
    window.visualViewport?.addEventListener("scroll",scheduleViewportUpdate,{passive:true});
    addEventListener("resize",scheduleViewportUpdate,{passive:true});
    addEventListener("orientationchange",()=>setTimeout(()=>{updateViewport();nudgeBrowserChrome()},180),{passive:true});
    addEventListener("focus",()=>setTimeout(nudgeBrowserChrome,120),{passive:true});
    document.addEventListener("fullscreenchange",updateViewport,{passive:true});
    document.addEventListener("webkitfullscreenchange",updateViewport,{passive:true});
  }

  return{start,isMobile,isBrowserMode,enterFromGesture,afterAppShown,nudgeBrowserChrome,updateViewport,getViewportHeight:()=>lastViewportHeight};
})();
