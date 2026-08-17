/*
 * 알림 서비스
 * 화면(UI), 저장 값, 브라우저 알림 API를 한곳에서 관리합니다.
 * 다른 기능은 Notification/Audio를 직접 호출하지 말고 이 모듈을 사용하세요.
 */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.Notifications = (() => {
  const STORAGE_KEY = "chat.notificationMode";
  const MODES = new Set(["sound", "vibrate", "mute"]);

  function mode() {
    const saved = MiniTalk.Persistence.get(STORAGE_KEY, "sound");
    return MODES.has(saved) ? saved : "sound";
  }

  function setMode(nextMode) {
    const normalized = MODES.has(nextMode) ? nextMode : "sound";
    MiniTalk.Persistence.set(STORAGE_KEY, normalized);
    return normalized;
  }

  function permissionLabel() {
    if (!("Notification" in window)) return "시스템 알림 미지원";
    if (Notification.permission === "granted") return "시스템 알림 허용됨";
    if (Notification.permission === "denied") return "시스템 알림 차단됨";
    return "시스템 알림 권한 허용";
  }

  function playSound() {
    try {
      new Audio("assets/sounds/notify.mp3").play().catch(() => {});
    } catch (error) {
      console.warn("알림 소리 재생 실패", error);
    }
  }

  function vibrate(pattern) {
    try {
      navigator.vibrate?.(pattern);
    } catch (error) {
      console.warn("알림 진동 실패", error);
    }
  }

  function showSystem(title, body, onlyWhenHidden = false) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (onlyWhenHidden && document.visibilityState === "visible") return;
    new Notification(title, {
      body,
      icon: "assets/icons/icon-192.png"
    });
  }

  /* 타이머·알람용: 무음이어도 앱 내부 안내 문구는 표시합니다. */
  function notify(label) {
    const currentMode = mode();
    MiniTalk.UI.Shell.toast(label);
    try {
      if (currentMode === "sound") playSound();
      if (currentMode !== "mute") vibrate([80, 40, 80]);
      if (currentMode !== "mute") showSystem(label);
    } catch (error) {
      console.warn("시스템 알림 표시 실패", error);
    }
  }

  /* 채팅 수신용: 내 메시지와 무음 모드는 초기에 걸러 불필요한 작업을 막습니다. */
  function notifyIncoming(message) {
    const currentMode = mode();
    const user = MiniTalk.Store.get("user");
    if (currentMode === "mute" || !message || message.user_id === user?.user_id) return;
    try {
      if (currentMode === "sound") playSound();
      vibrate(currentMode === "sound" ? [70, 40, 70] : [90]);
      showSystem(
        message.nickname || "모아루",
        String(message.text || "새 메시지").slice(0, 100),
        true
      );
    } catch (error) {
      console.warn("메시지 알림 실패", error);
    }
  }

  /* 선물 수신용: 앱 안에서는 즉시 안내하고, 허용된 경우 시스템 알림도 표시합니다. */
  function notifyGift(item) {
    const currentMode=mode(),sender=item?.giftedByNickname?`${item.giftedByNickname}님이 `:"";
    const body=`${sender}${item?.name||"상품"}을 선물했어요.`;
    MiniTalk.UI.Shell.toast(`🎁 ${body}`);
    if(currentMode==="sound")playSound();
    if(currentMode!=="mute"){vibrate([90,50,90]);showSystem("모아루 선물이 도착했어요",body,false)}
  }

  function openSettings() {
    const D = MiniTalk.UI.Dom;
    const body = D.el("div", { class: "notification-editor modal-stack" });
    const choices = D.el("div", { class: "notification-choices" });

    body.append(D.el("p", {
      class: "muted modal-note",
      text: "새 대화 알림 방식을 선택하세요. 브라우저 알림은 권한이 허용된 경우에만 표시됩니다."
    }));

    [
      ["sound", "🔔", "소리 + 진동"],
      ["vibrate", "📳", "진동만"],
      ["mute", "🔕", "알림 끄기"]
    ].forEach(([value, icon, label]) => {
      const choice = D.el("button", {
        class: `notification-choice ${mode() === value ? "active" : ""}`,
        type: "button",
        "data-mode": value,
        onclick: event => {
          setMode(value);
          D.all(".notification-choice", choices).forEach(button => {
            button.classList.toggle("active", button === event.currentTarget);
          });
        }
      }, [D.el("span", { text: icon }), D.el("strong", { text: label })]);
      choices.append(choice);
    });

    const permission = D.el("button", {
      class: "button secondary",
      type: "button",
      text: permissionLabel(),
      onclick: async event => {
        if (!("Notification" in window)) {
          MiniTalk.UI.Shell.toast("이 브라우저는 시스템 알림을 지원하지 않습니다.");
          return;
        }
        try {
          const result = await Notification.requestPermission();
          event.currentTarget.textContent = permissionLabel();
          MiniTalk.UI.Shell.toast(
            result === "granted" ? "시스템 알림을 허용했습니다." : "시스템 알림 권한이 허용되지 않았습니다."
          );
        } catch (error) {
          MiniTalk.UI.Shell.toast("알림 권한을 요청하지 못했습니다.");
        }
      }
    });

    body.append(
      choices,
      permission,
      D.el("button", {
        class: "button primary",
        type: "button",
        text: "완료",
        onclick: () => MiniTalk.UI.Shell.closeModal()
      })
    );
    MiniTalk.UI.Shell.modal("알림 설정", body);
  }

  return { mode, setMode, notify, notifyIncoming, notifyGift, openSettings, permissionLabel };
})();
