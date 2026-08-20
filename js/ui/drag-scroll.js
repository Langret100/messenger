/* 마우스가 있는 PC/PiP에서 세로 목록을 잡아 끌어 스크롤합니다.
   터치 기기는 브라우저의 기본 스와이프를 그대로 사용하고, 실제 클릭/입력은 방해하지 않습니다. */
MiniTalk.UI.DragScroll=(()=>{
  const bound=new WeakSet();
  let styleReady=false;
  function ensureStyle(doc=document){
    if(styleReady||!doc?.head)return;
    styleReady=true;
    const style=doc.createElement("style");
    style.id="dragScrollSurfaceStyle";
    style.textContent=`
      .drag-scroll-surface{scrollbar-width:none;-ms-overflow-style:none;overscroll-behavior:contain}
      .drag-scroll-surface::-webkit-scrollbar{display:none;width:0;height:0}
      .drag-scroll-surface.drag-scroll-ready{cursor:grab}
      .drag-scroll-surface.drag-scrolling{cursor:grabbing;user-select:none}
    `;
    doc.head.appendChild(style);
  }
  const BLOCKED="input,textarea,select,a,iframe,video,[contenteditable='true'],[data-no-drag-scroll],.feed-heart,.feed-comment-send,.feed-comment-input,.feed-video-play,.feed-fab,.shop-inventory-fab,.shop-inventory-panel button";
  function bind(scroller){
    if(!scroller||bound.has(scroller))return scroller;
    ensureStyle(scroller.ownerDocument||document);
    scroller.classList.add("drag-scroll-surface");
    bound.add(scroller);
    let active=false,moved=false,startY=0,startX=0,startTop=0,pointerId=null,suppressClick=false;
    const canStart=event=>{
      if(event.pointerType&&event.pointerType!=="mouse")return false;
      if(event.button!=null&&event.button!==0)return false;
      const target=event.target;
      if(!target?.closest)return false;
      const blocked=target.closest(BLOCKED);
      if(blocked&&!blocked.matches?.(".shop-product-card"))return false;
      return scroller.scrollHeight>scroller.clientHeight+1;
    };
    scroller.addEventListener("pointerdown",event=>{
      if(!canStart(event))return;
      active=true;moved=false;pointerId=event.pointerId;startY=event.clientY;startX=event.clientX;startTop=scroller.scrollTop;
      scroller.classList.add("drag-scroll-ready");
      try{scroller.setPointerCapture?.(pointerId)}catch(_){ }
    });
    scroller.addEventListener("pointermove",event=>{
      if(!active||event.pointerId!==pointerId)return;
      const dx=event.clientX-startX,dy=event.clientY-startY;
      if(!moved){
        if(Math.hypot(dx,dy)<5)return;
        if(Math.abs(dx)>Math.abs(dy)*1.35){active=false;scroller.classList.remove("drag-scroll-ready");return}
        moved=true;scroller.classList.add("drag-scrolling");
      }
      event.preventDefault();
      scroller.scrollTop=startTop-dy;
    },{passive:false});
    const finish=event=>{
      if(!active&&event?.pointerId!==pointerId)return;
      if(moved){suppressClick=true;setTimeout(()=>{suppressClick=false},120)}
      try{if(pointerId!=null&&scroller.hasPointerCapture?.(pointerId))scroller.releasePointerCapture(pointerId)}catch(_){ }
      active=false;moved=false;pointerId=null;scroller.classList.remove("drag-scroll-ready","drag-scrolling");
    };
    scroller.addEventListener("pointerup",finish);
    scroller.addEventListener("pointercancel",finish);
    scroller.addEventListener("lostpointercapture",finish);
    scroller.addEventListener("click",event=>{
      if(!suppressClick)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
      suppressClick=false;
    },true);
    return scroller;
  }
  return{bind};
})();
