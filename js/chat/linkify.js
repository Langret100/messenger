/* CHAT LINKIFY: 토리의 링크 자동 변환/YouTube 미리보기 방식을 독립 모듈화. */
MiniTalk.Chat=MiniTalk.Chat||{};
MiniTalk.Chat.Linkify=(()=>{
  const URL_RE=/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  const YOUTUBE_RE=/(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?[^\s<]*?v=|shorts\/)|youtu\.be\/)[\w-]{6,}[^\s<]*|www\.(?:youtube\.com\/(?:watch\?[^\s<]*?v=|shorts\/)|youtu\.be\/)[\w-]{6,}[^\s<]*)/i;
  function normalize(raw){return /^www\./i.test(raw)?`https://${raw}`:raw}
  function enhance(container){
    const doc=container.ownerDocument||document;const walker=doc.createTreeWalker(container,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{if(node.parentElement?.closest("a"))return;const text=node.nodeValue||"";if(!URL_RE.test(text)){URL_RE.lastIndex=0;return}URL_RE.lastIndex=0;const frag=doc.createDocumentFragment();let last=0,m;while((m=URL_RE.exec(text))){if(m.index>last)frag.append(doc.createTextNode(text.slice(last,m.index)));const a=doc.createElement("a");a.href=normalize(m[0]);a.target="_blank";a.rel="noopener noreferrer";a.textContent=m[0];a.className="chat-link";frag.append(a);last=m.index+m[0].length}if(last<text.length)frag.append(doc.createTextNode(text.slice(last)));node.replaceWith(frag)});
  }
  function youtubeMatch(text){const source=String(text||"");const match=source.match(YOUTUBE_RE);if(!match)return null;const raw=match[0];const normalized=normalize(raw);let id="";try{const url=new URL(normalized);if(/youtu\.be$/i.test(url.hostname))id=url.pathname.split("/").filter(Boolean)[0]||"";else if(/\/shorts\//i.test(url.pathname))id=url.pathname.split("/shorts/")[1]?.split("/")[0]||"";else id=url.searchParams.get("v")||""}catch{}return id?{id,raw,url:normalized}:null}
  function youtubeId(text){return youtubeMatch(text)?.id||null}
  function displayText(text){const match=youtubeMatch(text);if(!match)return String(text||"");return String(text||"").replace(match.raw,"").replace(/[ \t]+\n/g,"\n").replace(/\n[ \t]+/g,"\n").replace(/[ \t]{2,}/g," ").trim()}
  function preview(text,doc=document){const match=youtubeMatch(text);if(!match)return null;const a=doc.createElement("a");a.className="link-preview youtube-preview";a.href=match.url;a.target="_blank";a.rel="noopener noreferrer";a.setAttribute("aria-label","YouTube 영상 열기");const img=doc.createElement("img");img.src=`https://i.ytimg.com/vi/${encodeURIComponent(match.id)}/mqdefault.jpg`;img.alt="YouTube 영상 미리보기";img.loading="lazy";const meta=doc.createElement("span");meta.className="link-preview-meta";const title=doc.createElement("strong");title.textContent="YouTube 영상";const sub=doc.createElement("small");sub.textContent="YouTube · 영상 열기";meta.append(title,sub);const arrow=doc.createElement("b");arrow.className="link-preview-arrow";arrow.textContent="›";a.append(img,meta,arrow);return a}
  return{enhance,preview,youtubeId,displayText};
})();
