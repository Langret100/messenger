/* ============================================================
   CHAT EMOJI MODULE
   - 토리의 e1~e12 이모티콘 토큰 방식을 이식했습니다.
   - 서버에는 이미지가 아니라 :e1: 형태의 짧은 토큰만 저장합니다.
   ============================================================ */
MiniTalk.Chat=MiniTalk.Chat||{};
MiniTalk.Chat.Emoji=(()=>{
  const COUNT=12,BASE="assets/emoticons/";
  const tokenRe=/:e(0?[1-9]|1[0-2]):/g;
  function list(){return Array.from({length:COUNT},(_,i)=>({code:`e${i+1}`,token:`:e${i+1}:`,src:`${BASE}e${i+1}.png`}))}
  function appendText(text,container){
    const doc=container.ownerDocument||document;let last=0,match;tokenRe.lastIndex=0;
    while((match=tokenRe.exec(String(text||"")))){
      if(match.index>last)container.append(doc.createTextNode(text.slice(last,match.index)));
      const img=doc.createElement("img");img.className="chat-emoticon";img.src=`${BASE}e${Number(match[1])}.png`;img.alt=match[0];img.loading="lazy";container.append(img);last=match.index+match[0].length;
    }
    if(last<String(text||"").length)container.append(doc.createTextNode(text.slice(last)));
  }
  function isOnlyCustom(text){return /^\s*:e(?:0?[1-9]|1[0-2]):\s*$/.test(String(text||""))}
  function isOnlyUnicode(text){const s=String(text||"").trim();if(!s||s.length>24)return false;return !/[A-Za-z0-9가-힣]/.test(s)&&/[^\s]/.test(s)}
  return{list,appendText,isOnlyCustom,isOnlyUnicode};
})();
