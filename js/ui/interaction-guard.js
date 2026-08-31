/* 앱 UI의 우클릭/길게누르기/불필요한 드래그 방지. 입력칸의 정상 편집은 유지합니다.
   Document PiP처럼 앱 DOM이 다른 document로 이동해도 새 문서에 다시 바인딩합니다. */
MiniTalk.UI.InteractionGuard=(()=>{
  const boundDocs=new WeakSet();let started=false;
  function inApp(target){return !!target?.closest?.("#appShell")}
  function editable(target){return !!target?.closest?.("input,textarea,select,[contenteditable='true']")}
  /* 네이티브 스크롤바의 thumb/track 조작은 브라우저가 직접 처리하게 둡니다.
     자식 메시지/이미지의 드래그 방지는 그대로 유지합니다. */
  function nativeScrollSurface(target){return !!target?.matches?.(".message-list,.conversation-list")}
  function bindDocument(doc){
    if(!doc||boundDocs.has(doc))return;boundDocs.add(doc);
    doc.addEventListener("contextmenu",event=>{if(inApp(event.target)){event.preventDefault();event.stopPropagation()}},true);
    doc.addEventListener("dragstart",event=>{if(inApp(event.target)&&!editable(event.target)&&!nativeScrollSurface(event.target))event.preventDefault()},true);
    doc.addEventListener("selectstart",event=>{if(inApp(event.target)&&!editable(event.target)&&!nativeScrollSurface(event.target))event.preventDefault()},true);
  }
  function start(){if(started)return;started=true;bindDocument(document);bindDocument(MiniTalk.Store.get("rootDocument"));MiniTalk.Events.on("state:rootDocument",bindDocument)}
  return{start,bindDocument};
})();
