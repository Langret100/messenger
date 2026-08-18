/* APP BOOTSTRAP - 초기화 순서만 담당 */
addEventListener("DOMContentLoaded",()=>{
  MiniTalk.UI.Shell.start();
  MiniTalk.UI.InteractionGuard?.start?.();
  MiniTalk.MobileImmersive?.start?.();
  MiniTalk.Features.Auth.restore();
  document.getElementById("openPopupBtn")?.addEventListener("click",()=>MiniTalk.WindowMode.openBest());
  document.getElementById("openPiPBtn")?.addEventListener("click",()=>MiniTalk.WindowMode.openPiP().then(ok=>{if(!ok)MiniTalk.UI.Shell.toast("이 브라우저는 Document PiP를 지원하지 않습니다.")}).catch(e=>MiniTalk.UI.Shell.toast(e.message)));
  document.getElementById("openHereBtn")?.addEventListener("click",()=>MiniTalk.WindowMode.openHere({immersive:true}));
  document.getElementById("focusPopupBtn")?.addEventListener("click",MiniTalk.WindowMode.focusPopup);
  document.getElementById("closePopupBtn")?.addEventListener("click",MiniTalk.WindowMode.closePopup);
  document.getElementById("installBtn")?.addEventListener("click",()=>MiniTalk.WindowMode.install().then(outcome=>MiniTalk.UI.Shell.toast(outcome==="accepted"?"설치를 승인했습니다.":"설치를 취소했습니다.")).catch(e=>MiniTalk.UI.Shell.toast(e.message)));
  if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js?v=64.5.3").catch(e=>console.warn("서비스 워커 등록 실패",e));

  /* 모든 기기에서 첫 화면은 런처가 아니라 로그인/복원된 작업공간입니다. */
  MiniTalk.UI.Shell.showApp();
});
addEventListener("unhandledrejection",event=>{console.error("처리되지 않은 비동기 오류",event.reason);MiniTalk.UI?.Shell?.toast?.(event.reason?.message||"처리 중 오류가 발생했습니다.")});
addEventListener("pagehide",()=>MiniTalk.Realtime?.cleanup?.());
