/* 마우스가 있는 PC/PiP에서 세로 목록을 잡아 끌어 스크롤합니다.
   터치 기기는 브라우저의 기본 스와이프를 그대로 사용하고, 실제 클릭/입력은 방해하지 않습니다. */
MiniTalk.UI.DragScroll=(()=>{
  const bound=new WeakSet();
  const cleanupByScroller=new WeakMap();
  const styledDocuments=new WeakSet();
  function ensureStyle(doc=document){
    if(!doc?.head)return;
    if(styledDocuments.has(doc)&&doc.getElementById?.("dragScrollSurfaceStyle"))return;
    const existing=doc.getElementById?.("dragScrollSurfaceStyle");
    if(existing){styledDocuments.add(doc);return}
    const style=doc.createElement("style");
    style.id="dragScrollSurfaceStyle";
    style.textContent=`
      .drag-scroll-surface{overscroll-behavior:none;overscroll-behavior-y:none}
      .drag-scroll-surface:not(.drag-scroll-keep-scrollbar){scrollbar-width:none;-ms-overflow-style:none}
      .drag-scroll-surface:not(.drag-scroll-keep-scrollbar)::-webkit-scrollbar{display:none;width:0;height:0}
      .drag-scroll-surface.drag-scroll-ready{cursor:grab}
      .drag-scroll-surface.drag-scrolling{cursor:grabbing;user-select:none}
    `;
    doc.head.appendChild(style);
    styledDocuments.add(doc);
  }
  const BLOCKED="button,input,textarea,select,a,iframe,video,[contenteditable='true'],[data-no-drag-scroll],.feed-heart,.feed-comment-trigger,.feed-comment-send,.feed-comment-input,.feed-video-play,.feed-fab,.shop-inventory-fab,.shop-inventory-panel button,.quest-accordion-toggle,.message-avatar,.profile-image,.media-bubble img";
  function bind(scroller,options={}){
    if(!scroller||bound.has(scroller))return scroller;
    ensureStyle(scroller.ownerDocument||document);
    const keepScrollbar=options?.keepScrollbar===true;
    const allowInteractive=String(options?.allowInteractive||"").trim();
    const documentMouseDrag=options?.documentMouseDrag===true;
    scroller.classList.add("drag-scroll-surface");
    if(keepScrollbar)scroller.classList.add("drag-scroll-keep-scrollbar");
    bound.add(scroller);

    const scrollbarHit=event=>{
      if(!keepScrollbar)return false;
      const rect=scroller.getBoundingClientRect?.();
      if(!rect)return false;
      const gutter=Math.max(12,(scroller.offsetWidth||0)-(scroller.clientWidth||0));
      return event.clientX>=rect.right-gutter;
    };
    const interactiveBlocked=target=>{
      if(!target?.closest)return true;
      const blocked=target.closest(BLOCKED);
      const explicitlyAllowed=Boolean(allowInteractive&&target.closest?.(allowInteractive));
      return Boolean(blocked&&!blocked.matches?.(".shop-product-card")&&!explicitlyAllowed);
    };
    const hasOverflow=()=>scroller.scrollHeight>scroller.clientHeight+1;

    /* v101: 도구탭처럼 화면 대부분이 버튼/링크인 표면은 pointer capture 대신
       문서 단위 mousemove를 사용합니다. 버튼 위에서 시작해도 세로 이동이 5px을
       넘으면 스크롤로 전환하고, 거의 움직이지 않으면 원래 click을 그대로 보냅니다. */
    if(documentMouseDrag){
      const doc=scroller.ownerDocument||document;
      let active=false,moved=false,startY=0,startX=0,startTop=0,suppressClick=false,startTarget=null;
      const down=event=>{
        if(event.button!==0||scrollbarHit(event)||interactiveBlocked(event.target)||!hasOverflow())return;
        active=true;moved=false;startY=event.clientY;startX=event.clientX;startTop=scroller.scrollTop;startTarget=event.target;
        scroller.classList.add("drag-scroll-ready");
      };
      const move=event=>{
        if(!active)return;
        const dx=event.clientX-startX,dy=event.clientY-startY;
        if(!moved){
          if(Math.hypot(dx,dy)<5)return;
          if(Math.abs(dx)>Math.abs(dy)*1.35){active=false;startTarget=null;scroller.classList.remove("drag-scroll-ready","drag-scrolling");return}
          moved=true;scroller.classList.add("drag-scrolling");
        }
        event.preventDefault();
        scroller.scrollTop=startTop-dy;
      };
      const up=()=>{
        if(!active&&!moved)return;
        if(moved){suppressClick=true;setTimeout(()=>{suppressClick=false},180)}
        active=false;moved=false;startTarget=null;scroller.classList.remove("drag-scroll-ready","drag-scrolling");
      };
      const dragstart=event=>{if(active){event.preventDefault()}};
      const click=event=>{
        if(!suppressClick)return;
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation?.();
        suppressClick=false;
      };
      scroller.addEventListener("mousedown",down);
      doc.addEventListener("mousemove",move,{passive:false});
      doc.addEventListener("mouseup",up);
      scroller.addEventListener("dragstart",dragstart,true);
      scroller.addEventListener("click",click,true);
      cleanupByScroller.set(scroller,()=>{
        active=false;moved=false;startTarget=null;suppressClick=false;
        scroller.classList.remove("drag-scroll-ready","drag-scrolling");
        scroller.removeEventListener("mousedown",down);
        doc.removeEventListener("mousemove",move,{passive:false});
        doc.removeEventListener("mouseup",up);
        scroller.removeEventListener("dragstart",dragstart,true);
        scroller.removeEventListener("click",click,true);
      });
      return scroller;
    }

    let active=false,moved=false,startY=0,startX=0,startTop=0,pointerId=null,suppressClick=false,deferCapture=false;
    const canStart=event=>{
      if(event.pointerType&&event.pointerType!=="mouse")return false;
      if(event.button!=null&&event.button!==0)return false;
      if(scrollbarHit(event))return false;
      if(interactiveBlocked(event.target))return false;
      return hasOverflow();
    };
    scroller.addEventListener("pointerdown",event=>{
      if(!canStart(event))return;
      active=true;moved=false;pointerId=event.pointerId;startY=event.clientY;startX=event.clientX;startTop=scroller.scrollTop;
      // 클릭 가능한 카드를 누른 순간에는 포인터를 빼앗지 않습니다.
      // 실제 세로 이동이 5px을 넘은 뒤에만 capture하여 클릭과 드래그를 구분합니다.
      const allowedInteractive=Boolean(allowInteractive&&event.target?.closest?.(allowInteractive));
      deferCapture=Boolean(event.target?.closest?.(".shop-product-card")||allowedInteractive);
      scroller.classList.add("drag-scroll-ready");
      if(!deferCapture){try{scroller.setPointerCapture?.(pointerId)}catch(_){ }}
    });
    scroller.addEventListener("pointermove",event=>{
      if(!active||event.pointerId!==pointerId)return;
      const dx=event.clientX-startX,dy=event.clientY-startY;
      if(!moved){
        if(Math.hypot(dx,dy)<5)return;
        if(Math.abs(dx)>Math.abs(dy)*1.35){
          // 클릭 가능한 카드/버튼 위에서 이미 임계 거리 이상 움직였다면
          // 가로 제스처로 취급하고 뒤따르는 click도 한 번 막습니다.
          // (세로 스크롤로 전환하지는 않음)
          if(deferCapture){suppressClick=true;setTimeout(()=>{suppressClick=false},120)}
          try{if(pointerId!=null&&scroller.hasPointerCapture?.(pointerId))scroller.releasePointerCapture(pointerId)}catch(_){ }
          active=false;moved=false;pointerId=null;deferCapture=false;scroller.classList.remove("drag-scroll-ready","drag-scrolling");return
        }
        moved=true;
        if(deferCapture){try{scroller.setPointerCapture?.(pointerId)}catch(_){ }}
        scroller.classList.add("drag-scrolling");
      }
      event.preventDefault();
      scroller.scrollTop=startTop-dy;
    },{passive:false});
    const finish=event=>{
      if(!active&&event?.pointerId!==pointerId)return;
      if(moved){suppressClick=true;setTimeout(()=>{suppressClick=false},120)}
      try{if(pointerId!=null&&scroller.hasPointerCapture?.(pointerId))scroller.releasePointerCapture(pointerId)}catch(_){ }
      active=false;moved=false;pointerId=null;deferCapture=false;scroller.classList.remove("drag-scroll-ready","drag-scrolling");
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
  function unbind(scroller){
    if(!scroller)return;
    const cleanup=cleanupByScroller.get(scroller);
    if(cleanup){
      cleanup();
      cleanupByScroller.delete(scroller);
    }
    bound.delete(scroller);
    scroller.classList?.remove("drag-scroll-surface","drag-scroll-keep-scrollbar","drag-scroll-ready","drag-scrolling");
  }
  return{bind,unbind};
})();
