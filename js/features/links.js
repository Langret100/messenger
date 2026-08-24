/* 주요 사이트 링크 기능. 목록은 config.js에서만 수정합니다. */
MiniTalk.Features.Links=(()=>{
  let activeList=null;

  function cleanup(){
    if(!activeList)return;
    MiniTalk.UI.DragScroll?.unbind?.(activeList);
    activeList=null;
  }

  function render(host){
    cleanup();
    MiniTalk.UI.Shell.setHeader("관련 링크",[],{back:()=>MiniTalk.Router.go("tools")});
    const D=MiniTalk.UI.Dom;
    const view=D.el("section",{class:"view utility-view view-enter links-view"});
    const list=D.el("div",{class:"card-list links-screen"});
    const grid=D.el("div",{class:"site-grid links-grid"});
    MiniTalkConfig.sites.forEach(s=>grid.append(D.el("a",{
      class:"site-link",
      href:s.url,
      target:"_blank",
      rel:"noopener noreferrer",
      text:s.name
    })));
    list.append(grid);
    view.append(list);
    host.replaceChildren(view);

    /* 도구 화면과 같은 스크롤 표면을 사용합니다.
       기본 overflow:auto 스크롤바가 Windows Chromium에서 콘텐츠 폭을
       차지해 화면이 좁아 보이는 경로를 만들지 않도록 합니다. */
    MiniTalk.UI.DragScroll?.bind?.(list,{allowInteractive:".site-link"});
    activeList=list;
  }

  return{id:"links",title:"관련 링크",icon:"🔗",nav:false,render,leave:cleanup};
})();
MiniTalk.Registry.register(MiniTalk.Features.Links);
