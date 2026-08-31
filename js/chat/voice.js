/* ============================================================
   CHAT VOICE HOLD
   - 토리의 '보내기 길게 누르기 → 음성 인식 → 전송' UX를 포팅.
   - 음성 파일 녹음이 아니라 브라우저 SpeechRecognition 텍스트 입력입니다.
   - 인식기가 손을 떼기 전에 자체 종료되는 경우도 손을 뗄 때 한 번만 전송합니다.
   ============================================================ */
MiniTalk.Chat=MiniTalk.Chat||{};
MiniTalk.Chat.Voice=(()=>{
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  function bind(button,input,onSend,status){
    if(!button||button.__voiceBound)return;
    button.__voiceBound=true;
    let hold=null,active=false,rec=null,finalText="",suppress=false,sending=false;
    const show=t=>{if(status){status.textContent=t||"";status.classList.toggle("show",!!t)}};
    function start(){
      active=true;suppress=true;sending=false;finalText="";
      if(!Recognition){active=false;suppress=false;show("음성 인식을 지원하지 않는 브라우저입니다.");setTimeout(()=>show(""),1800);return}
      try{
        rec=new Recognition();rec.lang="ko-KR";rec.continuous=true;rec.interimResults=true;
        rec.onstart=()=>{button.classList.add("voice-active");show("● 음성 인식 중… 손을 떼면 전송")};
        rec.onresult=e=>{let interim="";for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i]?.[0]?.transcript?.trim();if(!t)continue;if(e.results[i].isFinal)finalText+=(finalText?" ":"")+t;else interim+=(interim?" ":"")+t}show(interim?`● ${interim}`:"● 음성 인식 중… 손을 떼면 전송")};
        rec.onend=()=>finish();
        rec.onerror=e=>{if(!["aborted","no-speech"].includes(e.error))show("음성 인식이 중단됐습니다.")};
        rec.start();
      }catch{active=false;rec=null;suppress=false;show("음성 인식을 시작하지 못했습니다.")}
    }
    function finish(){
      button.classList.remove("voice-active");rec=null;
      /* 인식기가 먼저 끝났다면 finalText를 보존하고 실제 pointerup까지 기다립니다. */
      if(active)return;
      if(!sending&&finalText.trim()){
        const text=((input.value||"")+" "+finalText).trim();finalText="";sending=true;input.value=text;
        Promise.resolve(onSend?.(text)).then(()=>{if(input.value===text)input.value=""}).catch(()=>{/* 실패 시 입력창의 text를 보존 */}).finally(()=>{sending=false});
      }
      show("");setTimeout(()=>suppress=false,350);
    }
    button.addEventListener("pointerdown",e=>{if(e.button!=null&&e.button!==0)return;active=false;clearTimeout(hold);hold=setTimeout(start,420)});
    const end=()=>{clearTimeout(hold);if(!active)return;active=false;const current=rec;if(current){try{current.stop()}catch{finish()}}else finish()};
    button.addEventListener("pointerup",end);button.addEventListener("pointercancel",end);
    button.addEventListener("click",e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation()}},true);
  }
  return{bind};
})();
