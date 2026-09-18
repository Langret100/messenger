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

  let sharedNotifyAudio = null, audioPrimed = false;
  function notifyAudio() {
    if (!sharedNotifyAudio) { sharedNotifyAudio = new Audio("assets/sounds/notify.mp3");sharedNotifyAudio.preload = "auto"; }
    return sharedNotifyAudio;
  }
  function primeAudio() {
    if (audioPrimed || mode() !== "sound") return;
    try {
      const audio = notifyAudio(), volume = audio.volume;audio.volume = 0;audio.currentTime = 0;
      const pending = audio.play();
      if (pending?.then) pending.then(() => { audio.pause();audio.currentTime = 0;audio.volume = volume;audioPrimed = true; }).catch(() => { audio.volume = volume; });
    } catch {}
  }
  window.addEventListener?.("pointerdown", primeAudio, { passive: true });
  window.addEventListener?.("keydown", primeAudio, { passive: true });
  function playSound() {
    try {
      const audio = notifyAudio();audio.volume = 1;audio.currentTime = 0;
      const pending = audio.play();
      pending?.catch?.(error => console.warn("알림 소리 재생이 브라우저에 의해 제한되었습니다.", error));
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
      icon: "assets/icons/moaru-app-192.png"
    });
  }

  function showInApp(icon, title, body, route) {
    MiniTalk.UI.Shell.notifyBanner?.({ icon, title, body: String(body || "").slice(0, 120), onClick: route ? () => MiniTalk.Router.go(route) : null });
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
    if (!message) return;
    const senderId = String(message.user_id ?? message.userId ?? "");
    const currentUserId = String(user?.user_id ?? user?.userId ?? "");
    /* 숫자/문자열 타입 차이까지 포함해 자기 메시지는 항상 차단합니다.
       발신자 ID가 없는 옛 요약은 상위 새글 감지 단계에서 이미 제외됩니다. */
    if (senderId && currentUserId && senderId === currentUserId) return;
    const room = MiniTalk.Store.get("rooms")?.[message.roomId], title = room?.title ? `${room.title} · ${message.nickname || "새 메시지"}` : message.nickname || "새 메시지", body = String(message.text || "새 메시지가 도착했어요.").slice(0, 100);
    showInApp("✉", title, body, "chats");
    try {
      if (currentMode === "sound") playSound();
      if (currentMode !== "mute") vibrate(currentMode === "sound" ? [70, 40, 70] : [90]);
      if (currentMode !== "mute") showSystem(title, body, true);
    } catch (error) {
      console.warn("메시지 알림 실패", error);
    }
  }

  /* 선물 수신용: 앱 안에서는 즉시 안내하고, 허용된 경우 시스템 알림도 표시합니다. */
  function notifyGift(item) {
    const currentMode=mode(),sender=item?.giftedByNickname?`${item.giftedByNickname}님이 `:"";
    const body=`${sender}${item?.name||"상품"}을 선물했어요.`;
    showInApp("🎁", "선물이 도착했어요", body, "shopping");
    if(currentMode==="sound")playSound();
    if(currentMode!=="mute"){vibrate([90,50,90]);showSystem("모아루 선물이 도착했어요",body,false)}
  }

  function notifyTask(title, body) {
    const currentMode = mode();
    showInApp("✓", title, body, "tasks");
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") { vibrate([80, 45, 80]);showSystem(title, String(body || "").slice(0, 100), false); }
  }

  function notifyRoomInvite(room) {
    const currentMode = mode(), title = "대화방에 초대됐어요", body = `${room?.title || "새 대화방"}에 바로 참여할 수 있어요.`;
    showInApp("✉", title, body, "chats");
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") { vibrate([90, 45, 90]);showSystem(title, body, false); }
  }

  function notifyCoinReward(amount, reason = "코인 보상", newCoin = null) {
    const coins = Math.trunc(Number(amount) || 0), sign = coins > 0 ? "+" : "−", magnitude = Math.abs(coins), debit = coins < 0;
    // COIN_REWARD/TASK_COMPLETED 명령은 늦게 도착할 수 있으므로 payload.newCoin은
    // 과거 시점의 잔액일 수 있습니다. 알림은 증감 안내만 담당하고 현재 잔액은
    // user_commands 응답의 서버 스냅샷이 동기화합니다.
    const currentMode = mode(), D = MiniTalk.UI.Dom, doc = D.doc(), host = D.byId("overlayHost") || doc.body;
    D.byId("coinRewardCelebration")?.remove();
    const layer = D.el("section", { id: "coinRewardCelebration", class: "coin-reward-celebration", role: "status", "aria-live": "assertive" }, [
      D.el("div", { class: `coin-reward-burst ${debit ? "debit" : "credit"}` }, [
        D.el("span", { class: "coin-reward-rays", text: debit ? "−  −  −" : "✦  ✦  ✦" }),
        D.el("img", { src: "assets/ui/notebook-coin.svg", alt: "코인" }),
        D.el("strong", { text: `${sign}${magnitude}` }),
        D.el("small", { text: String(reason || "코인 보상").slice(0, 80) })
      ])
    ]);
    host.append(layer);
    // 서버 지연과 무관하게 DOM에 붙은 시점부터 연출 시간을 온전히 보장합니다.
    setTimeout(() => { if (layer.isConnected) layer.classList.add("leaving"); }, 2300);
    setTimeout(() => { if (layer.isConnected) layer.remove(); }, 2800);
    MiniTalk.UI.Shell.toast(`🪙 ${sign}${magnitude}`);
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") { vibrate(debit ? [180, 70, 180] : [90, 45, 120, 45, 160]);showSystem("모아루 코인 변경", `${reason} · ${sign}${magnitude}`, false); }
  }

  MiniTalk.Events.on("rt:command", command => {
    if (command?.type !== "COIN_REWARD") return;
    const payload = command.payload || {};
    notifyCoinReward(payload.amount, payload.reason || "관리자 코인 보상", payload.newCoin);
  });

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

  return { mode, setMode, notify, notifyIncoming, notifyGift, notifyTask, notifyRoomInvite, notifyCoinReward, openSettings, permissionLabel };
})();
