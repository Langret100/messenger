/* ============================================================
   CHAT EMOTICON MODULE
   ------------------------------------------------------------
   - 기존 e1~e12 토큰은 그대로 유지합니다.
   - 모아루 e13~e17은 메시지에 대체 글자도 함께 저장합니다.
     이모티콘을 지원하지 않는 예전 화면에서는 이미지 대신
     웃음·좌절·졸림·한심·기쁨이라는 글자만 보입니다.
   ============================================================ */
MiniTalk.Chat=MiniTalk.Chat||{};
MiniTalk.Chat.Emoji=(()=>{
  const BASE="assets/emoticons/";
  const NEW_LABELS={e13:"웃음",e14:"좌절",e15:"졸림",e16:"한심",e17:"기쁨"};
  const tokenRe=/:e(0?[1-9]|1[0-7]):/g;

  function list(){
    return Array.from({length:17},(_,index)=>{
      const code=`e${index+1}`;
      return{code,token:`:${code}:`,src:`${BASE}${code}.png`,fallback:NEW_LABELS[code]||""};
    });
  }
  function byCode(code){return list().find(item=>item.code===String(code||""))||null}
  function appendImage(info,container){
    const doc=container.ownerDocument||document,img=doc.createElement("img");
    img.className="chat-emoticon";img.src=info.src;img.alt=info.fallback||info.token;img.loading="lazy";
    img.onerror=()=>{img.replaceWith(doc.createTextNode(info.fallback||info.token))};container.append(img);
  }
  function appendText(text,container,emoticonCode=""){
    const selected=byCode(emoticonCode);
    if(selected){appendImage(selected,container);return}
    const source=String(text||"");let last=0,match;tokenRe.lastIndex=0;
    while((match=tokenRe.exec(source))){
      if(match.index>last)container.append((container.ownerDocument||document).createTextNode(source.slice(last,match.index)));
      appendImage(byCode(`e${Number(match[1])}`),container);last=match.index+match[0].length;
    }
    if(last<source.length)container.append((container.ownerDocument||document).createTextNode(source.slice(last)));
  }
  function isOnlyCustom(text,emoticonCode=""){return Boolean(byCode(emoticonCode))||/^\s*:e(?:0?[1-9]|1[0-7]):\s*$/.test(String(text||""))}
  const unicodeEmojiTokenRe=/(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?[\u{1F3FB}-\u{1F3FF}]?(?:\u200D\p{Extended_Pictographic}\uFE0F?[\u{1F3FB}-\u{1F3FF}]?)*)/gu;
  function isOnlyUnicode(text){
    const value=String(text||"").trim();
    if(!value||value.length>48)return false;
    const compact=value.replace(/\s+/g,"");
    if(!compact)return false;
    unicodeEmojiTokenRe.lastIndex=0;
    const matched=unicodeEmojiTokenRe.test(compact);
    unicodeEmojiTokenRe.lastIndex=0;
    return matched&&compact.replace(unicodeEmojiTokenRe,"")==="";
  }
  return{list,byCode,appendText,isOnlyCustom,isOnlyUnicode};
})();
