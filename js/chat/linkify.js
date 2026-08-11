/* CHAT LINKIFY: 토리의 링크 자동 변환/YouTube 미리보기 방식을 독립 모듈화. */
MiniTalk.Chat=MiniTalk.Chat||{};
MiniTalk.Chat.Linkify=(()=>{
  const URL_RE=/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  function normalize(raw){return /^www\./i.test(raw)?`https://${raw}`:raw}
  function enhance(container){
    const doc=container.ownerDocument||document;const walker=doc.createTreeWalker(container,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{if(node.parentElement?.closest("a"))return;const text=node.nodeValue||"";if(!URL_RE.test(text)){URL_RE.lastIndex=0;return}URL_RE.lastIndex=0;const frag=doc.createDocumentFragment();let last=0,m;while((m=URL_RE.exec(text))){if(m.index>last)frag.append(doc.createTextNode(text.slice(last,m.index)));const a=doc.createElement("a");a.href=normalize(m[0]);a.target="_blank";a.rel="noopener noreferrer";a.textContent=m[0];a.className="chat-link";frag.append(a);last=m.index+m[0].length}if(last<text.length)frag.append(doc.createTextNode(text.slice(last)));node.replaceWith(frag)});
  }
  function youtubeId(text){const m=String(text||"").match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/i);return m?.[1]||null}
  function preview(text,doc=document){const id=youtubeId(text);if(!id)return null;const a=doc.createElement("a");a.className="link-preview";a.href=`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;a.target="_blank";a.rel="noopener noreferrer";const img=doc.createElement("img");img.src=`https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;img.alt="YouTube 미리보기";img.loading="lazy";const meta=doc.createElement("span");meta.innerHTML="<strong>YouTube</strong><small>영상 링크 열기</small>";a.append(img,meta);return a}
  return{enhance,preview};
})();
