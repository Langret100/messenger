/* 프로필 편집: 이미지 축소와 저장 UI를 도구 허브에서 분리합니다. */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.ProfileEditor = (() => {
  function avatarNode(profile, nickname, className) {
    const D = MiniTalk.UI.Dom;
    return D.el("img", {
      class: className,
      src: profile?.avatar || "assets/mascot-avatar.png",
      alt: profile?.avatar ? "프로필" : "기본 프로필"
    });
  }

  const PROFILE_DATA_LIMIT=15*1024;

  async function compressAvatarSource(source) {
    const isFile=typeof File!=="undefined"&&source instanceof File;
    if(isFile&&!source.type?.startsWith("image/"))throw new Error("이미지 파일을 선택하세요.");
    if(isFile&&source.size>8*1024*1024)throw new Error("이미지가 너무 큽니다.");
    const objectUrl=typeof source==="string"?"":URL.createObjectURL(source),url=typeof source==="string"?source:objectUrl,image=new Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("이미지를 불러오지 못했습니다."));image.src=url});
      let size=192;
      for(let pass=0;pass<6;pass++){
        const canvas=document.createElement("canvas");canvas.width=canvas.height=size;
        const context=canvas.getContext("2d",{alpha:false});context.fillStyle="#fff";context.fillRect(0,0,size,size);
        const scale=Math.max(size/image.width,size/image.height),width=image.width*scale,height=image.height*scale;
        context.drawImage(image,(size-width)/2,(size-height)/2,width,height);
        for(const quality of [.78,.68,.58,.48,.4,.32,.26]){
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));if(!blob)continue;
          const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||""));r.onerror=()=>reject(new Error("프로필 이미지를 압축하지 못했습니다."));r.readAsDataURL(blob)});
          if(dataUrl.length<=PROFILE_DATA_LIMIT)return dataUrl;
        }
        size=Math.max(112,Math.round(size*.84));
      }
      throw new Error("프로필 사진을 15KB 이하로 줄이지 못했습니다.");
    }finally{if(objectUrl)URL.revokeObjectURL(objectUrl)}
  }

  async function compressAvatar(file) {
    return compressAvatarSource(file);
  }


  function open(onSaved) {
    const D = MiniTalk.UI.Dom;
    const user = MiniTalk.Store.get("user") || {};
    if (!user.user_id || user.isGuest) {
      MiniTalk.UI.Shell.toast("프로필 수정은 로그인 후 이용할 수 있어요.");
      return false;
    }
    const profile = MiniTalk.Store.get("profiles")?.[user.user_id] || {};
    const body = D.el("div", { class: "profile-editor modal-stack" });
    const preview = avatarNode(profile, user.nickname, "profile-editor-avatar");
    const choose = D.el("button", { class: "button secondary compact-button", type: "button", text: "사진 선택" });
    const file = D.el("input", { type: "file", accept: "image/*", class: "hidden" });
    let nextAvatar = profile.avatar || "";

    preview.id = "profilePreview";
    choose.onclick = () => file.click();
    file.onchange = async () => {
      const picked = file.files?.[0];
      if (!picked) return;
      try {
        nextAvatar = await compressAvatar(picked);
        D.byId("profilePreview")?.replaceWith(D.el("img", {
          id: "profilePreview",
          class: "profile-editor-avatar",
          src: nextAvatar,
          alt: "프로필 미리보기"
        }));
      } catch (error) {
        MiniTalk.UI.Shell.toast(error.message);
      }
    };

    const status = D.el("textarea", {
      id: "profileStatus",
      maxlength: "100",
      placeholder: "상태메시지를 입력하세요"
    });
    status.value = profile.statusMsg || "";
    const save = D.el("button", { class: "button primary", type: "button", text: "저장" });
    save.onclick = async () => {
      save.disabled = true;
      try {
        if(nextAvatar&&nextAvatar.length>PROFILE_DATA_LIMIT)nextAvatar=await compressAvatarSource(nextAvatar);
        await MiniTalk.Realtime.saveProfile({ avatar: nextAvatar, statusMsg: status.value.trim() });
        MiniTalk.UI.Shell.closeModal();
        MiniTalk.UI.Shell.toast("프로필을 저장했습니다.");
        onSaved?.();
      } catch (error) {
        MiniTalk.UI.Shell.toast(error.message || "프로필 저장에 실패했습니다.");
      } finally {
        save.disabled = false;
      }
    };

    body.append(
      D.el("div", { class: "profile-editor-top" }, [
        preview,
        D.el("div", { class: "profile-editor-name" }, [
          D.el("strong", { text: user.nickname || "사용자" }),
          choose,
          file
        ])
      ]),
      D.el("label", { class: "field" }, [D.el("span", { text: "상태메시지" }), status]),
      save
    );
    MiniTalk.UI.Shell.modal("프로필", body, { hostClass: "profile-modal-host", modalClass: "profile-modal" });
    return true;
  }

  return { open, avatarNode, compressAvatar };
})();
