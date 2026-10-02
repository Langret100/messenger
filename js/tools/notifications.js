/*
 * 알림 서비스
 * - 일반 알림/메시지 알림/코인 알림/알람 음원을 한곳에서 관리합니다.
 * - 브라우저 오디오 잠금 해제와 알람 반복 재생도 이 모듈이 담당합니다.
 */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.Notifications = (() => {
  const STORAGE_KEY = "chat.notificationMode";
  const MODES = new Set(["sound", "vibrate", "mute"]);
  let sharedNotifyAudio = null;
  let audioPrimed = false;
  let audioContext = null;
  let alarmTimer = null;
  let alarmStopTimer = null;
  let alarmActive = false;

  function mode() {
    const saved = MiniTalk.Persistence.get(STORAGE_KEY, "sound");
    return MODES.has(saved) ? saved : "sound";
  }

  function setMode(nextMode) {
    const normalized = MODES.has(nextMode) ? nextMode : "sound";
    MiniTalk.Persistence.set(STORAGE_KEY, normalized);
    if (normalized === "sound") primeAudio();
    return normalized;
  }

  function permissionLabel() {
    if (!("Notification" in window)) return "시스템 알림 미지원";
    if (Notification.permission === "granted") return "시스템 알림 허용됨";
    if (Notification.permission === "denied") return "시스템 알림 차단됨";
    return "시스템 알림 권한 허용";
  }

  function notifyAudio() {
    if (!sharedNotifyAudio) {
      sharedNotifyAudio = new Audio("assets/sounds/notify.mp3");
      sharedNotifyAudio.preload = "auto";
      sharedNotifyAudio.playsInline = true;
    }
    return sharedNotifyAudio;
  }

  function ensureAudioContext() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    } catch {}
    return audioContext;
  }

  function fallbackBeep(strong = false) {
    const ctx = ensureAudioContext();
    if (!ctx || ctx.state !== "running") return false;
    try {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(strong ? 0.24 : 0.14, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
      gain.connect(ctx.destination);
      [0, 0.19].forEach((offset, index) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = strong ? (index ? 880 : 660) : (index ? 740 : 620);
        osc.connect(gain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
      return true;
    } catch { return false; }
  }

  function primeAudio() {
    if (mode() !== "sound") return;
    ensureAudioContext();
    if (audioPrimed) return;
    try {
      const audio = notifyAudio();
      const volume = audio.volume;
      audio.volume = 0;
      audio.currentTime = 0;
      const pending = audio.play();
      if (pending?.then) {
        pending.then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = volume;
          audioPrimed = true;
        }).catch(() => { audio.volume = volume; });
      }
    } catch {}
  }

  ["pointerdown", "keydown", "touchstart"].forEach(type => {
    window.addEventListener?.(type, primeAudio, { passive: true });
  });

  async function playSound(strong = false) {
    if (mode() !== "sound") return false;
    primeAudio();
    try {
      const audio = notifyAudio();
      audio.volume = strong ? 1 : 0.92;
      audio.currentTime = 0;
      await audio.play();
      return true;
    } catch (error) {
      const ok = fallbackBeep(strong);
      if (!ok) console.warn("알림 소리 재생이 브라우저에 의해 제한되었습니다.", error);
      return ok;
    }
  }

  function vibrate(pattern) {
    try { navigator.vibrate?.(pattern); }
    catch (error) { console.warn("알림 진동 실패", error); }
  }

  function showSystem(title, body = "", onlyWhenHidden = false, persistent = false) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (onlyWhenHidden && document.visibilityState === "visible") return;
    try {
      new Notification(title, {
        body,
        icon: "assets/icons/moaru-app-192.png",
        tag: persistent ? "moaru-alarm" : undefined,
        renotify: Boolean(persistent),
        requireInteraction: Boolean(persistent)
      });
    } catch (error) { console.warn("시스템 알림 표시 실패", error); }
  }

  function showInApp(icon, title, body, route) {
    MiniTalk.UI.Shell.notifyBanner?.({
      icon,
      title,
      body: String(body || "").slice(0, 120),
      onClick: route ? () => MiniTalk.Router.go(route) : null
    });
  }

  function notify(label) {
    const currentMode = mode();
    MiniTalk.UI.Shell.toast(label);
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") {
      vibrate([80, 40, 80]);
      showSystem(label);
    }
  }

  function stopAlarmSound() {
    alarmActive = false;
    if (alarmTimer) clearInterval(alarmTimer);
    if (alarmStopTimer) clearTimeout(alarmStopTimer);
    alarmTimer = null;
    alarmStopTimer = null;
    try {
      const audio = notifyAudio();
      audio.pause();
      audio.currentTime = 0;
    } catch {}
  }

  function startAlarmSound(label = "알람") {
    stopAlarmSound();
    const currentMode = mode();
    alarmActive = true;
    MiniTalk.UI.Shell.toast(`⏰ ${label}`);
    showInApp("⏰", label, "알람 시간이 되었어요.");
    if (currentMode !== "mute") {
      vibrate([220, 90, 220, 90, 350]);
      showSystem(`⏰ ${label}`, "알람 시간이 되었어요.", false, true);
    }
    if (currentMode === "sound") {
      const ring = () => {
        if (!alarmActive) return;
        playSound(true);
        vibrate([180, 70, 180]);
      };
      ring();
      alarmTimer = setInterval(ring, 2800);
      alarmStopTimer = setTimeout(stopAlarmSound, 60000);
    }
  }

  async function testSound() {
    if (mode() !== "sound") setMode("sound");
    primeAudio();
    const ok = await playSound(true);
    if (ok) vibrate([60]);
    return ok;
  }

  function notifyIncoming(message) {
    const currentMode = mode();
    const user = MiniTalk.Store.get("user");
    if (!message) return;
    const senderId = String(message.user_id ?? message.userId ?? "");
    const currentUserId = String(user?.user_id ?? user?.userId ?? "");
    if (senderId && currentUserId && senderId === currentUserId) return;
    const room = MiniTalk.Store.get("rooms")?.[message.roomId];
    const title = room?.title ? `${room.title} · ${message.nickname || "새 메시지"}` : message.nickname || "새 메시지";
    const body = String(message.text || "새 메시지가 도착했어요.").slice(0, 100);
    showInApp("✉", title, body, "chats");
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") {
      vibrate(currentMode === "sound" ? [70, 40, 70] : [90]);
      showSystem(title, body, true);
    }
  }

  function notifyGift(item) {
    const currentMode = mode();
    const sender = item?.giftedByNickname ? `${item.giftedByNickname}님이 ` : "";
    const body = `${sender}${item?.name || "상품"}을 선물했어요.`;
    showInApp("🎁", "선물이 도착했어요", body, "shopping");
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") { vibrate([90, 50, 90]);showSystem("모아루 선물이 도착했어요", body, false); }
  }

  function notifyTask(title, body) {
    const currentMode = mode();
    showInApp("✓", title, body, "tasks");
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") { vibrate([80, 45, 80]);showSystem(title, String(body || "").slice(0, 100), false); }
  }

  function notifyRoomInvite(room) {
    const currentMode = mode();
    const title = "대화방에 초대됐어요";
    const body = `${room?.title || "새 대화방"}에 바로 참여할 수 있어요.`;
    showInApp("✉", title, body, "chats");
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") { vibrate([90, 45, 90]);showSystem(title, body, false); }
  }

  function notifyCoinReward(amount, reason = "코인 보상", newCoin = null) {
    const coins = Math.trunc(Number(amount) || 0), sign = coins > 0 ? "+" : "−", magnitude = Math.abs(coins), debit = coins < 0;
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
    setTimeout(() => { if (layer.isConnected) layer.classList.add("leaving"); }, 2300);
    setTimeout(() => { if (layer.isConnected) layer.remove(); }, 2800);
    MiniTalk.UI.Shell.toast(`🪙 ${sign}${magnitude}`);
    if (currentMode === "sound") playSound();
    if (currentMode !== "mute") { vibrate(debit ? [180, 70, 180] : [90, 45, 120, 45, 160]);showSystem("모아루 코인 변경", `${reason} · ${sign}${magnitude}`, false); }
  }

  MiniTalk.Events.on("rt:command", command => {
    if (command?.type === "COIN_REWARD") {
      const payload = command.payload || {};
      notifyCoinReward(payload.amount, payload.reason || "관리자 코인 보상", payload.newCoin);
      return;
    }
    if (command?.type === "TASK_COMPLETED") {
      const payload = command.payload || {};
      notifyCoinReward(payload.amount, payload.title ? `${payload.title} 완료 보상` : "과제 완료 보상", payload.newCoin);
    }
  });

  MiniTalk.Events.on("coins:task-reward", detail => {
    if (!detail || Number(detail.amount) <= 0) return;
    notifyCoinReward(detail.amount, detail.reason || "과제 완료 보상", detail.newCoin);
  });

  function openSettings() {
    const D = MiniTalk.UI.Dom;
    const body = D.el("div", { class: "notification-editor modal-stack" });
    const choices = D.el("div", { class: "notification-choices" });

    body.append(D.el("p", {
      class: "muted modal-note",
      text: "알림 방식을 선택하세요. '소리 테스트'로 현재 브라우저에서 실제 재생되는지도 바로 확인할 수 있습니다."
    }));

    [["sound", "🔔", "소리 + 진동"], ["vibrate", "📳", "진동만"], ["mute", "🔕", "알림 끄기"]].forEach(([value, icon, label]) => {
      const choice = D.el("button", {
        class: `notification-choice ${mode() === value ? "active" : ""}`,
        type: "button",
        "data-mode": value,
        onclick: event => {
          setMode(value);
          D.all(".notification-choice", choices).forEach(button => button.classList.toggle("active", button === event.currentTarget));
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
          MiniTalk.UI.Shell.toast(result === "granted" ? "시스템 알림을 허용했습니다." : "시스템 알림 권한이 허용되지 않았습니다.");
        } catch { MiniTalk.UI.Shell.toast("알림 권한을 요청하지 못했습니다."); }
      }
    });

    const test = D.el("button", {
      class: "button secondary",
      type: "button",
      text: "🔊 알림 소리 테스트",
      onclick: async () => {
        const ok = await testSound();
        MiniTalk.UI.Shell.toast(ok ? "알림 소리가 재생되었습니다." : "브라우저가 소리를 막았습니다. 화면을 한 번 누른 뒤 다시 테스트해 주세요.");
      }
    });

    body.append(choices, permission, test, D.el("button", { class: "button primary", type: "button", text: "완료", onclick: () => MiniTalk.UI.Shell.closeModal() }));
    MiniTalk.UI.Shell.modal("알림 설정", body);
  }

  return {
    mode, setMode, notify, notifyIncoming, notifyGift, notifyTask, notifyRoomInvite, notifyCoinReward,
    openSettings, permissionLabel, primeAudio, playSound, testSound, startAlarmSound, stopAlarmSound
  };
})();
