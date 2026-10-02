/*
 * 타이머·알람 서비스
 * - 예약 상태를 로컬에 저장합니다.
 * - 알람 시 반복 소리 + 전용 끄기/5분 뒤 다시 알림 화면을 제공합니다.
 */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.TimerAlarm = (() => {
  const TIMER_KEY = "tools.timer";
  const ALARM_KEY = "tools.alarm";
  let timerInterval = null;
  let alarmTimeout = null;

  function modalBody(note) {
    const D = MiniTalk.UI.Dom;
    return D.el("div", { class: "tool-modal-body modal-stack" }, [D.el("p", { class: "muted modal-note", text: note })]);
  }

  function field(label, input) {
    const D = MiniTalk.UI.Dom;
    return D.el("label", { class: "field" }, [D.el("span", { text: label }), input]);
  }

  function timerState(data) {
    const output = MiniTalk.UI.Dom.byId("timerState");
    if (!output || !data) return;
    const secondsLeft = Math.max(0, Math.ceil((data.endAt - Date.now()) / 1000));
    const m = Math.floor(secondsLeft / 60), s = secondsLeft % 60;
    output.textContent = `${data.label}: ${m}:${String(s).padStart(2, "0")} 남음`;
  }

  function startTimer(seconds, label) {
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) throw new Error("1~86400초 사이로 입력하세요.");
    MiniTalk.Tools.Notifications?.primeAudio?.();
    const data = { endAt: Date.now() + seconds * 1000, label };
    MiniTalk.Persistence.set(TIMER_KEY, data);
    scheduleTimer(data);
    timerState(data);
  }

  function scheduleTimer(data) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (data.endAt <= Date.now()) {
        stopTimer(false);
        ring({ label: data.label || "타이머" }, false);
        return;
      }
      timerState(data);
    }, 500);
  }

  function stopTimer(showToast = true) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    MiniTalk.Persistence.remove(TIMER_KEY);
    const output = MiniTalk.UI.Dom.byId("timerState");
    if (output) output.textContent = "";
    if (showToast) MiniTalk.UI.Shell.toast("타이머를 중지했습니다.");
  }

  function openTimer() {
    const D = MiniTalk.UI.Dom;
    const saved = MiniTalk.Persistence.get(TIMER_KEY);
    const body = modalBody("시간이 끝나면 반복 알림음과 화면 안내로 알려드립니다.");
    const seconds = D.el("input", { id: "timerSeconds", type: "number", inputmode: "numeric", min: "1", max: "86400", value: "300" });
    const name = D.el("input", { id: "timerName", value: "타이머", maxlength: "30" });
    const state = D.el("p", { id: "timerState", class: "tool-modal-state muted" });
    const quick = D.el("div", { class: "button-row" }, [60, 300, 600].map(sec => D.el("button", {
      class: "button secondary", type: "button", text: sec === 60 ? "1분" : `${sec / 60}분`, onclick: () => { seconds.value = String(sec); }
    })));
    body.append(
      quick,
      D.el("div", { class: "inline-fields" }, [field("시간(초)", seconds), field("이름", name)]),
      state,
      D.el("div", { class: "button-row" }, [
        D.el("button", { class: "button secondary", type: "button", text: "중지", onclick: () => stopTimer() }),
        D.el("button", { class: "button primary", type: "button", text: "시작", onclick: () => {
          try { startTimer(Number(seconds.value), name.value.trim() || "타이머"); }
          catch (error) { MiniTalk.UI.Shell.toast(error.message); }
        } })
      ])
    );
    MiniTalk.UI.Shell.modal("타이머", body);
    if (saved) timerState(saved);
  }

  function nextClockValue(minutes = 5) {
    const d = new Date(Date.now() + minutes * 60000);
    d.setSeconds(0, 0);
    const rounded = Math.ceil(d.getMinutes() / 5) * 5;
    if (rounded >= 60) { d.setHours(d.getHours() + 1);d.setMinutes(0); }
    else d.setMinutes(rounded);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function targetFromTime(time) {
    if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("시간을 선택하세요.");
    const [hour, minute] = time.split(":").map(Number);
    const now = new Date(), target = new Date();
    target.setHours(hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    return target;
  }

  function setAlarm(time, label) {
    MiniTalk.Tools.Notifications?.primeAudio?.();
    const target = targetFromTime(time);
    const data = { endAt: target.getTime(), label };
    MiniTalk.Persistence.set(ALARM_KEY, data);
    scheduleAlarm(data);
    updateAlarmState(data);
    MiniTalk.UI.Shell.toast(`${formatAlarmTime(target)}에 알람을 설정했습니다.`);
  }

  function setRelativeAlarm(minutes, label) {
    MiniTalk.Tools.Notifications?.primeAudio?.();
    const target = new Date(Date.now() + minutes * 60000);
    const data = { endAt: target.getTime(), label };
    MiniTalk.Persistence.set(ALARM_KEY, data);
    scheduleAlarm(data);
    updateAlarmState(data);
    MiniTalk.UI.Shell.toast(`${minutes}분 뒤 알람을 설정했습니다.`);
  }

  function scheduleAlarm(data) {
    if (alarmTimeout) clearTimeout(alarmTimeout);
    const delay = Math.max(0, data.endAt - Date.now());
    alarmTimeout = setTimeout(() => {
      MiniTalk.Persistence.remove(ALARM_KEY);
      alarmTimeout = null;
      ring(data, true);
    }, delay);
  }

  function formatAlarmTime(date) {
    const now = new Date();
    const tomorrow = new Date(now);tomorrow.setDate(now.getDate() + 1);
    const same = date.toDateString() === now.toDateString();
    const next = date.toDateString() === tomorrow.toDateString();
    const day = same ? "오늘" : next ? "내일" : date.toLocaleDateString();
    return `${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function updateAlarmState(data) {
    const output = MiniTalk.UI.Dom.byId("alarmState");
    if (!output) return;
    output.textContent = data?.endAt ? `설정됨 · ${formatAlarmTime(new Date(data.endAt))} · ${data.label}` : "설정된 알람 없음";
  }

  function clearAlarm(showToast = true) {
    if (alarmTimeout) clearTimeout(alarmTimeout);
    alarmTimeout = null;
    MiniTalk.Persistence.remove(ALARM_KEY);
    MiniTalk.Tools.Notifications?.stopAlarmSound?.();
    updateAlarmState(null);
    if (showToast) MiniTalk.UI.Shell.toast("알람을 해제했습니다.");
  }

  function ring(data, allowSnooze = true) {
    const D = MiniTalk.UI.Dom;
    const label = String(data?.label || "알람").slice(0, 30);
    MiniTalk.Tools.Notifications?.startAlarmSound?.(label);
    const body = D.el("div", { class: "tool-modal-body modal-stack" }, [
      D.el("div", { style: "font-size:42px;text-align:center", text: "⏰" }),
      D.el("h2", { style: "text-align:center;margin:0", text: label }),
      D.el("p", { class: "muted modal-note", style: "text-align:center", text: "알람 시간이 되었어요." })
    ]);
    const stop = D.el("button", { class: "button primary", type: "button", text: "알람 끄기", onclick: () => {
      MiniTalk.Tools.Notifications?.stopAlarmSound?.();
      MiniTalk.UI.Shell.closeModal();
    } });
    const buttons = D.el("div", { class: "button-row" }, [stop]);
    if (allowSnooze) buttons.prepend(D.el("button", { class: "button secondary", type: "button", text: "5분 뒤 다시", onclick: () => {
      MiniTalk.Tools.Notifications?.stopAlarmSound?.();
      setRelativeAlarm(5, label);
      MiniTalk.UI.Shell.closeModal();
    } }));
    body.append(buttons);
    MiniTalk.UI.Shell.modal("알람", body);
  }

  function openAlarm() {
    const D = MiniTalk.UI.Dom;
    const saved = MiniTalk.Persistence.get(ALARM_KEY);
    const body = modalBody("시간을 고르거나 빠른 설정을 누르세요. 알람 소리는 아래에서 바로 테스트할 수 있습니다.");
    const time = D.el("input", { id: "alarmTime", type: "time", value: nextClockValue() });
    const name = D.el("input", { id: "alarmName", value: "알람", maxlength: "30" });
    const state = D.el("p", { id: "alarmState", class: "tool-modal-state muted" });
    const quick = D.el("div", { class: "button-row" }, [10, 30, 60].map(min => D.el("button", {
      class: "button secondary", type: "button", text: min === 60 ? "1시간 뒤" : `${min}분 뒤`, onclick: () => setRelativeAlarm(min, name.value.trim() || "알람")
    })));
    const test = D.el("button", { class: "button secondary", type: "button", text: "🔊 알람 소리 테스트", onclick: async () => {
      const ok = await MiniTalk.Tools.Notifications?.testSound?.();
      MiniTalk.UI.Shell.toast(ok ? "알람 소리가 재생되었습니다." : "소리를 재생하지 못했습니다. 화면을 한 번 누른 뒤 다시 테스트해 주세요.");
    } });
    body.append(
      quick,
      D.el("div", { class: "inline-fields" }, [field("시간", time), field("이름", name)]),
      state,
      test,
      D.el("div", { class: "button-row" }, [
        D.el("button", { class: "button secondary", type: "button", text: "해제", onclick: () => clearAlarm() }),
        D.el("button", { class: "button primary", type: "button", text: "이 시간으로 설정", onclick: () => {
          try { setAlarm(time.value, name.value.trim() || "알람"); }
          catch (error) { MiniTalk.UI.Shell.toast(error.message); }
        } })
      ])
    );
    MiniTalk.UI.Shell.modal("알람", body);
    updateAlarmState(saved);
  }

  function restore() {
    const timer = MiniTalk.Persistence.get(TIMER_KEY);
    if (timer?.endAt > Date.now()) scheduleTimer(timer);
    else if (timer?.endAt) {
      MiniTalk.Persistence.remove(TIMER_KEY);
      setTimeout(() => ring({ label: timer.label || "타이머" }, false), 300);
    }

    const alarm = MiniTalk.Persistence.get(ALARM_KEY);
    if (alarm?.endAt > Date.now()) scheduleAlarm(alarm);
    else if (alarm?.endAt) {
      MiniTalk.Persistence.remove(ALARM_KEY);
      if (Date.now() - alarm.endAt < 15 * 60000) setTimeout(() => ring(alarm, true), 500);
    }
  }

  restore();
  return { openTimer, openAlarm, startTimer, stopTimer, setAlarm, setRelativeAlarm, clearAlarm, restore };
})();
