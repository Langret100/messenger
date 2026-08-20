/* 설정 탭 - 앱 화면/세션처럼 자주 바꾸지 않는 항목만 둡니다. */
MiniTalk.Features.Settings=(()=>{
  const CHAT_BG_KEY="chat.background.image";
  function render(host){
    const D=MiniTalk.UI.Dom,user=MiniTalk.Store.get("user")||{},profile=MiniTalk.Store.get("profiles")?.[user.user_id]||{},view=D.el("section",{class:"view utility-view view-enter"}),list=D.el("div",{class:"card-list settings-screen"});
    const account=D.el("section",{class:"settings-card account-summary"},[
      MiniTalk.Tools.ProfileEditor.avatarNode(profile,user.nickname,"settings-avatar"),
      D.el("div",{class:"settings-copy"},[D.el("strong",{text:user.nickname||"사용자"}),D.el("small",{class:"muted",text:user.isGuest?"게스트 계정":user.user_id||""})])
    ]);
    const appearance=D.el("button",{class:"settings-row",type:"button",onclick:()=>MiniTalk.Features.Layout.open()},[D.el("span",{class:"settings-row-icon",text:"✦"}),D.el("span",{class:"settings-row-copy"},[D.el("strong",{text:"화면 설정"}),D.el("small",{class:"muted",text:"테마 · 글자 · 하단 메뉴"})]),D.el("span",{class:"row-arrow",text:"›"})]);
    const background=D.el("button",{class:"settings-row",type:"button",onclick:openChatBackground},[D.el("span",{class:"settings-row-icon",text:"▧"}),D.el("span",{class:"settings-row-copy"},[D.el("strong",{text:"대화방 배경"}),D.el("small",{class:"muted",text:MiniTalk.Persistence.get(CHAT_BG_KEY,null)?"사용자 이미지 적용 중":"기본 배경 사용 중"})]),D.el("span",{class:"row-arrow",text:"›"})]);
    const admin=D.el("button",{class:"settings-row",type:"button",disabled:Boolean(user.isGuest),onclick:()=>MiniTalk.AdminSession.authorized()?MiniTalk.Router.go("admin"):openAdminUnlock()},[D.el("span",{class:"settings-row-icon",text:"◆"}),D.el("span",{class:"settings-row-copy"},[D.el("strong",{text:"관리자 권한"}),D.el("small",{class:"muted",text:user.isGuest?"로그인 계정에서만 이용 가능":MiniTalk.AdminSession.authorized()?`${MiniTalk.AdminSession.role()==="SHOP_MANAGER"?"쇼핑몰 관리자":"전체 관리자"} 인증됨 · 관리 화면 열기`:"관리자/쇼핑몰 관리자 코드로 인증"})]),D.el("span",{class:"row-arrow",text:user.isGuest?"":"›"})]);
    const about=D.el("div",{class:"settings-row static-row"},[D.el("span",{class:"settings-row-icon",text:"i"}),D.el("span",{class:"settings-row-copy"},[D.el("strong",{text:"모아루"}),D.el("small",{class:"muted",text:`버전 ${MiniTalkConfig.version}`})])]);
    const logout=D.el("button",{class:"settings-row danger-row",type:"button",onclick:()=>MiniTalk.Features.Auth.logout()},[D.el("span",{class:"settings-row-icon",text:"↪"}),D.el("span",{class:"settings-row-copy"},[D.el("strong",{text:"로그아웃"}),D.el("small",{class:"muted",text:"현재 계정에서 나갑니다."})])]);
    list.append(account,D.el("section",{class:"settings-group"},[appearance,background,admin,about]),D.el("section",{class:"settings-group"},[logout]));view.append(list);host.replaceChildren(view)
  }
  function openAdminUnlock(){
    const D=MiniTalk.UI.Dom,body=D.el("div",{class:"modal-stack"}),input=D.el("input",{type:"password",maxlength:"80",autocomplete:"off",placeholder:"관리자 또는 쇼핑몰 관리자 코드"}),submit=D.el("button",{class:"button primary",type:"button",text:"권한 인증"});
    submit.onclick=async()=>{submit.disabled=true;try{const role=await MiniTalk.AdminSession.unlock(input.value);MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.renderNav();MiniTalk.UI.Shell.toast(role==="SHOP_MANAGER"?"쇼핑몰 관리자 권한이 활성화되었습니다.":"전체 관리자 권한이 활성화되었습니다.");await MiniTalk.Router.go("admin")}catch(error){MiniTalk.UI.Shell.toast(error.message||"관리자 인증에 실패했습니다.");input.select();submit.disabled=false}};
    input.onkeydown=event=>{if(event.key==="Enter"){event.preventDefault();submit.click()}};
    body.append(D.el("p",{class:"muted modal-note",text:"로그인한 계정에서 관리자 고유 코드를 확인합니다. 코드는 앱에 저장되지 않습니다."}),D.el("label",{class:"field"},[D.el("span",{text:"고유 코드"}),input]),submit);MiniTalk.UI.Shell.modal("관리자 권한",body);setTimeout(()=>input.focus(),30)
  }
  function applyChatBackground(value=MiniTalk.Persistence.get(CHAT_BG_KEY,null)){
    const roots=new Set([document.documentElement,MiniTalk.Store.get("rootDocument")?.documentElement].filter(Boolean));
    for(const root of roots){root.style.setProperty("--chat-bg-image",value?`url("${value}")`:"none");root.classList?.toggle?.("chat-custom-background",!!value)}
  }
  function openChatBackground(){
    const D=MiniTalk.UI.Dom,current=MiniTalk.Persistence.get(CHAT_BG_KEY,null),body=D.el("div",{class:"tool-modal-body modal-stack"}),preview=D.el("div",{class:`chat-bg-preview ${current?"has-image":""}`}),file=D.el("input",{class:"hidden",type:"file",accept:"image/png,image/jpeg,image/webp"});
    if(current)preview.style.backgroundImage=`url("${current}")`;
    preview.append(D.el("span",{text:current?"현재 대화방 배경":"기본 대화방 배경"}));
    const choose=D.el("button",{class:"button secondary",type:"button",text:"이미지 선택"}),reset=D.el("button",{class:"button secondary",type:"button",text:"기본 배경"}),save=D.el("button",{class:"button primary",type:"button",text:"적용"});let next=current;
    choose.onclick=()=>file.click();file.onchange=async()=>{const picked=file.files?.[0];if(!picked)return;choose.disabled=true;try{next=await compressChatBackground(picked);preview.classList.add("has-image");preview.style.backgroundImage=`url("${next}")`;preview.querySelector("span").textContent="선택한 배경 미리보기"}catch(error){MiniTalk.UI.Shell.toast(error.message)}finally{choose.disabled=false}};
    reset.onclick=()=>{next=null;preview.classList.remove("has-image");preview.style.backgroundImage="";preview.querySelector("span").textContent="기본 대화방 배경"};
    save.onclick=()=>{if(next)MiniTalk.Persistence.set(CHAT_BG_KEY,next);else MiniTalk.Persistence.remove(CHAT_BG_KEY);applyChatBackground(next);MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast(next?"대화방 배경을 적용했습니다.":"기본 대화방 배경으로 돌아왔습니다.");if(MiniTalk.Store.get("route")==="settings")render(D.byId("viewHost"))};
    body.append(D.el("p",{class:"muted modal-note",text:"선택한 이미지는 이 기기에만 저장되며 대화방 화면에 맞게 자동 압축됩니다."}),preview,file,D.el("div",{class:"button-row"},[reset,choose]),save);MiniTalk.UI.Shell.modal("대화방 배경",body)
  }
  function compressChatBackground(file){return new Promise((resolve,reject)=>{if(!file.type?.startsWith("image/"))return reject(new Error("PNG, JPG 또는 WebP 이미지를 선택하세요."));if(file.size>8*1024*1024)return reject(new Error("8MB 이하 이미지를 선택하세요."));const url=URL.createObjectURL(file),image=new Image();image.onload=()=>{try{const maxEdge=1024,scale=Math.min(1,maxEdge/Math.max(image.width,image.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);const data=canvas.toDataURL("image/jpeg",.72);URL.revokeObjectURL(url);if(data.length>750000)return reject(new Error("압축 후에도 이미지가 큽니다. 더 작은 이미지를 선택하세요."));resolve(data)}catch(error){URL.revokeObjectURL(url);reject(error)}};image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("이미지를 불러오지 못했습니다."))};image.src=url})}
  applyChatBackground();return{id:"settings",title:"설정",icon:"⚙",render,applyChatBackground,openAdminUnlock};
})();
MiniTalk.Registry.register(MiniTalk.Features.Settings);
