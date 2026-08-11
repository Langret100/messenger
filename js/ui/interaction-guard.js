/* 앱 UI의 우클릭/길게누르기/불필요한 드래그 방지. 입력칸의 정상 편집은 유지합니다.
   Document PiP처럼 앱 DOM이 다른 document로 이동해도 새 문서에 다시 바인딩합니다. */
MiniTalk.UI.InteractionGuard=(()=>{
  const boundDocs=new WeakSet();let started=false;
  function inApp(target){return !!target?.closest?.("#appShell")}
  function editable(target){return !!target?.closest?.("input,textarea,select,[contenteditable='true']")}
  function bindDocument(doc){
    if(!doc||boundDocs.has(doc))return;boundDocs.add(doc);
    doc.addEventListener("contextmenu",event=>{if(inApp(event.target)){event.preventDefault();event.stopPropagation()}},true);
    doc.addEventListener("dragstart",event=>{if(inApp(event.target)&&!editable(event.target))event.preventDefault()},true);
    doc.addEventListener("selectstart",event=>{if(inApp(event.target)&&!editable(event.target))event.preventDefault()},true);
  }
  function start(){if(started)return;started=true;bindDocument(document);bindDocument(MiniTalk.Store.get("rootDocument"));MiniTalk.Events.on("state:rootDocument",bindDocument)}
  return{start,bindDocument};
})();
