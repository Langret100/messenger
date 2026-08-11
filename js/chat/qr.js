/* CHAT QR SCANNER - 토리의 BarcodeDetector 방식 이식. */
MiniTalk.Chat=MiniTalk.Chat||{};
MiniTalk.Chat.QR=(()=>{
  let stream=null,timer=null,overlay=null;
  function stop(){clearTimeout(timer);timer=null;stream?.getTracks?.().forEach(t=>t.stop());stream=null;overlay?.remove();overlay=null}
  async function scan(){
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("이 브라우저는 카메라를 지원하지 않습니다.");
    if(!("BarcodeDetector" in window))throw new Error("이 브라우저에서는 QR 인식을 지원하지 않습니다.");
    const doc=MiniTalk.UI.Dom.doc();overlay=doc.createElement("div");overlay.className="qr-overlay";overlay.innerHTML='<section class="qr-sheet"><div class="sheet-grab"></div><header><strong>QR 링크 스캔</strong><button type="button" class="icon-button qr-close">×</button></header><video playsinline autoplay muted></video><p class="muted">QR 코드를 카메라에 비춰주세요.</p></section>';doc.body.append(overlay);overlay.querySelector(".qr-close").onclick=stop;overlay.onclick=e=>{if(e.target===overlay)stop()};
    const video=overlay.querySelector("video");
    try{
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});video.srcObject=stream;await video.play();const detector=new BarcodeDetector({formats:["qr_code"]});
      return await new Promise((resolve,reject)=>{async function tick(){if(!overlay)return reject(new Error("QR 스캔을 취소했습니다."));try{if(video.videoWidth){const codes=await detector.detect(video);const val=String(codes?.[0]?.rawValue||"").trim();if(val){stop();resolve(/^www\./i.test(val)?`https://${val}`:val);return}}}catch{}timer=setTimeout(tick,220)}tick()});
    }catch(error){stop();throw error}
  }
  return{scan,stop};
})();
