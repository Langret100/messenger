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

  function compressAvatar(file) {
    return new Promise((resolve, reject) => {
      if (!file.type?.startsWith("image/")) return reject(new Error("이미지 파일을 선택하세요."));
      if (file.size > 8 * 1024 * 1024) return reject(new Error("이미지가 너무 큽니다."));

      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          // 고해상도 화면에서도 72px 프로필 사진이 흐려지지 않도록 256px 원본을 보관합니다.
          const size = 256;
          canvas.width = canvas.height = size;
          const context = canvas.getContext("2d");
          const scale = Math.max(size / image.width, size / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.84));
        } catch (error) {
          reject(error);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("이미지를 불러오지 못했습니다."));
      };
      image.src = url;
    });
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
