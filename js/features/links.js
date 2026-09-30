/* 관련 링크 허브. 실제 목록은 config.js의 MiniTalkConfig.sites에서 관리합니다. */
MiniTalk.Features.Links=(()=>{
  let activeList=null;

  function cleanup(){
    if(!activeList)return;
    MiniTalk.UI.DragScroll?.unbind?.(activeList);
    activeList=null;
  }

  function isMobileBrowser(){
    if(MiniTalk.MobileImmersive?.isMobile?.())return true;
    const ua=navigator.userAgent||"";
    return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)&&!/CrOS/i.test(ua);
  }

  function popupBounds(sourceView){
    const scr=sourceView.screen||{},availLeft=Number(scr.availLeft)||0,availTop=Number(scr.availTop)||0;
    const availWidth=Math.max(640,Number(scr.availWidth)||1280),availHeight=Math.max(520,Number(scr.availHeight)||800),gap=42;
    const messengerLeft=Number(sourceView.screenX??sourceView.screenLeft)||availLeft,messengerTop=Number(sourceView.screenY??sourceView.screenTop)||availTop;
    const messengerW=Math.max(320,Number(sourceView.outerWidth)||Math.min(520,availWidth*.42)),messengerH=Math.max(420,Number(sourceView.outerHeight)||availHeight*.8);
    const rightStart=Math.min(availLeft+availWidth,messengerLeft+messengerW+gap),rightSpace=Math.max(0,availLeft+availWidth-rightStart),leftSpace=Math.max(0,messengerLeft-gap-availLeft);
    const desiredWidth=Math.min(1280,Math.max(760,Math.round(availWidth*.70))),desiredHeight=Math.min(900,Math.max(620,Math.round(availHeight*.88)));
    const minSideWidth=Math.min(640,Math.max(500,Math.round(availWidth*.34)));
    let width,height,left,top;
    if(Math.max(rightSpace,leftSpace)>=minSideWidth){
      const useRight=rightSpace>=leftSpace,space=useRight?rightSpace:leftSpace;
      width=Math.min(desiredWidth,space);height=Math.min(desiredHeight,availHeight-24);left=useRight?rightStart:messengerLeft-gap-width;
      top=Math.max(availTop+8,Math.min(messengerTop,availTop+availHeight-height-8));
    }else{
      width=Math.min(Math.max(640,Math.round(availWidth*.62)),availWidth-24);height=Math.min(desiredHeight,availHeight-24);
      left=(messengerLeft+messengerW/2)<=(availLeft+availWidth/2)?availLeft+availWidth-width-8:availLeft+8;
      top=Math.max(availTop+8,Math.min(messengerTop,availTop+availHeight-height-8));
    }
    return{width:Math.round(Math.max(500,width)),height:Math.round(Math.max(540,height)),left:Math.round(left),top:Math.round(top)};
  }

  function safePopupName(name){return `MoaruLink_${String(name||"external").replace(/[^a-zA-Z0-9가-힣_-]/g,"_").slice(0,30)}`}

  function openExternal(event,site){
    event?.preventDefault?.();
    const url=site?.url;if(!url)return;
    if(!site.popup||isMobileBrowser()){
      try{window.open(url,"_blank","noopener,noreferrer")}catch(error){console.warn("외부 링크 열기 실패",error)}
      return;
    }
    const sourceView=MiniTalk.UI.Dom.doc()?.defaultView||window,bounds=popupBounds(sourceView);
    const features=`popup=yes,toolbar=no,location=no,menubar=no,status=no,scrollbars=yes,resizable=yes,width=${bounds.width},height=${bounds.height},left=${bounds.left},top=${bounds.top}`;
    let popup=null;
    try{popup=window.open("",safePopupName(site.name),features)}catch{}
    if(!popup){try{window.open(url,"_blank","noopener,noreferrer")}catch{}return}
    const apply=()=>{try{popup.resizeTo(bounds.width,bounds.height);popup.moveTo(bounds.left,bounds.top)}catch{}};
    apply();
    try{popup.opener=null}catch{}
    try{popup.location.replace(url)}catch{try{popup.location.href=url}catch{}}
    setTimeout(apply,80);setTimeout(apply,260);
    try{popup.focus()}catch{}
  }

  const DEFAULT_META={
    "페이스 체인지":{icon:"☺",description:"카메라로 즐기는 얼굴 효과"},
    "동작 인식 게임":{icon:"◇",description:"몸을 움직여 즐기는 동작 인식 게임"}
  };
  function siteCard(s){
    const D=MiniTalk.UI.Dom,meta=DEFAULT_META[s.name]||{};
    const children=[
      D.el("span",{class:"site-link-icon","aria-hidden":"true",text:s.icon||meta.icon||"↗"}),
      D.el("span",{class:"site-link-copy"},[
        D.el("strong",{text:s.name}),
        D.el("small",{text:s.description||meta.description||"새 창으로 열기"})
      ]),
      D.el("span",{class:"site-link-open",text:s.popup?"새 창":"열기","aria-hidden":"true"})
    ];
    if(s.tool){
      return D.el("button",{class:"site-link site-link-card",type:"button",onclick:()=>MiniTalk.Features.Tools?.openTool?.(s.tool)},children);
    }
    return D.el("a",{class:"site-link site-link-card",href:s.url,target:"_blank",rel:"noopener noreferrer","aria-label":`${s.name} 열기`,onclick:event=>openExternal(event,s)},children);
  }

  function group(title,description,sites){
    const D=MiniTalk.UI.Dom;
    if(!sites.length)return null;
    return D.el("section",{class:"links-group"},[
      D.el("div",{class:"links-group-heading"},[
        D.el("strong",{text:title}),
        D.el("small",{text:description})
      ]),
      D.el("div",{class:"site-grid links-grid"},sites.map(siteCard))
    ]);
  }

  function render(host){
    cleanup();
    MiniTalk.UI.Shell.setHeader("관련 링크",[],{back:()=>MiniTalk.Router.go("tools")});
    const D=MiniTalk.UI.Dom,sites=Array.isArray(MiniTalkConfig.sites)?MiniTalkConfig.sites:[];
    const isPlay=s=>s.category==="play"||s.tool==="face-toy"||s.name==="동작 인식 게임";
    const play=sites.filter(isPlay),links=sites.filter(s=>!isPlay(s));
    const view=D.el("section",{class:"view utility-view view-enter links-view"});
    const list=D.el("div",{class:"card-list links-screen"});
    list.append(D.el("section",{class:"links-hero"},[
      D.el("span",{class:"links-hero-mark","aria-hidden":"true",text:"↗"}),
      D.el("div",{class:"links-hero-copy"},[
        D.el("strong",{text:"바로 쓸 수 있는 링크"}),
        D.el("small",{text:"놀이와 자주 쓰는 사이트를 한곳에 모았어요. PC·웨일북용 놀이는 별도 창으로 열려요."})
      ])
    ]));
    const playGroup=group("놀이 · 활동","모아루 옆에서 별도 창으로 즐길 수 있어요",play);
    const linkGroup=group("자주 쓰는 사이트","검색·수업·제작 사이트 바로가기",links);
    if(playGroup)list.append(playGroup);
    if(linkGroup)list.append(linkGroup);
    view.append(list);host.replaceChildren(view);
    MiniTalk.UI.DragScroll?.bind?.(list,{allowInteractive:".site-link-card"});activeList=list;
  }

  return{id:"links",title:"관련 링크",icon:"🔗",nav:false,render,leave:cleanup,_test:{isMobileBrowser,popupBounds,safePopupName}};
})();
MiniTalk.Registry.register(MiniTalk.Features.Links);
