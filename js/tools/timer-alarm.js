/*
 * 타이머·알람 서비스
 * 예약 상태와 실행 타이머를 소유합니다. 화면 모듈은 openTimer/openAlarm만 호출합니다.
 */
MiniTalk.Tools = MiniTalk.Tools || {};
MiniTalk.Tools.TimerAlarm = (() => {
  const TIMER_KEY = "tools.timer";
  const ALARM_KEY = "tools.alarm";
  let timerInterval = null;
  let alarmTimeout = null;

  function modalBody(note) {
    const D = MiniTalk.UI.Dom;
    return D.el("div", { class: "tool-modal-body modal-stack" }, [
      D.el("p", { class: "muted modal-note", text: note })
    ]);
  }

  function field(label, input) {
    const D = MiniTalk.UI.Dom;
    return D.el("label", { class: "field" }, [D.el("span", { text: label }), input]);
  }

  function timerState(data) {
    const output = MiniTalk.UI.Dom.byId("timerState");
    if (!output) return;
    const secondsLeft = Math.max(0, Math.ceil((data.endAt - Date.now()) / 1000));
    output.textContent = `${data.label}: ${secondsLeft}초`;
  }

  function startTimer(seconds, label) {
    if (!Number.isFinite(seconds) || seconds < 1 || seconds > 86400) {
      throw new Error("1~86400초 사이로 입력하세요.");
    }
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
        MiniTalk.Tools.Notifications.notify(data.label);
        return;
      }
      timerState(data);
    }, 250);
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
    const body = modalBody("시간이 끝나면 소리와 알림으로 알려드려요.");
    const seconds = D.el("input", {
      id: "timerSeconds",
      type: "number",
      inputmode: "numeric",
      min: "1",
      max: "86400",
      value: "300"
    });
    const name = D.el("input", { id: "timerName", value: "타이머", maxlength: "30" });
    const state = D.el("p", { id: "timerState", class: "tool-modal-state muted" });

    body.append(
      D.el("div", { class: "inline-fields" }, [field("시간(초)", seconds), field("이름", name)]),
      state,
      D.el("div", { class: "button-row" }, [
        D.el("button", { class: "button secondary", type: "button", text: "중지", onclick: () => stopTimer() }),
        D.el("button", {
          class: "button primary",
          type: "button",
          text: "시작",
          onclick: () => {
            try {
              startTimer(Number(seconds.value), name.value.trim() || "타이머");
            } catch (error) {
              MiniTalk.UI.Shell.toast(error.message);
            }
          }
        })
      ])
    );
    MiniTalk.UI.Shell.modal("타이머", body);
    if (saved) timerState(saved);
  }

  function setAlarm(time, label) {
    if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("시간을 선택하세요.");
    const [hour, minute] = time.split(":").map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hour, minute, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const data = { endAt: target.getTime(), label };
    MiniTalk.Persistence.set(ALARM_KEY, data);
    scheduleAlarm(data);
    updateAlarmState(data);
    MiniTalk.UI.Shell.toast(`${target.toLocaleString()}에 설정했습니다.`);
  }

  function scheduleAlarm(data) {
    if (alarmTimeout) clearTimeout(alarmTimeout);
    const delay = Math.max(0, data.endAt - Date.now());
    alarmTimeout = setTimeout(() => {
      MiniTalk.Persistence.remove(ALARM_KEY);
      alarmTimeout = null;
      MiniTalk.Tools.Notifications.notify(data.label);
    }, delay);
  }

  function updateAlarmState(data) {
    const output = MiniTalk.UI.Dom.byId("alarmState");
    if (output) output.textContent = `${new Date(data.endAt).toLocaleString()} · ${data.label}`;
  }

  function clearAlarm(showToast = true) {
    if (alarmTimeout) clearTimeout(alarmTimeout);
    alarmTimeout = null;
    MiniTalk.Persistence.remove(ALARM_KEY);
    const output = MiniTalk.UI.Dom.byId("alarmState");
    if (output) output.textContent = "";
    if (showToast) MiniTalk.UI.Shell.toast("알람을 해제했습니다.");
  }

  function openAlarm() {
    const D = MiniTalk.UI.Dom;
    const saved = MiniTalk.Persistence.get(ALARM_KEY);
    const body = modalBody("설정한 시각까지 앱을 열어 두면 가장 안정적으로 작동해요.");
    const time = D.el("input", { id: "alarmTime", type: "time" });
    const name = D.el("input", { id: "alarmName", value: "알람", maxlength: "30" });

    body.append(
      D.el("div", { class: "inline-fields" }, [field("시간", time), field("이름", name)]),
      D.el("p", { id: "alarmState", class: "tool-modal-state muted" }),
      D.el("div", { class: "button-row" }, [
        D.el("button", { class: "button secondary", type: "button", text: "해제", onclick: () => clearAlarm() }),
        D.el("button", {
          class: "button primary",
          type: "button",
          text: "설정",
          onclick: () => {
            try {
              setAlarm(time.value, name.value.trim() || "알람");
            } catch (error) {
              MiniTalk.UI.Shell.toast(error.message);
            }
          }
        })
      ])
    );
    MiniTalk.UI.Shell.modal("알람", body);
    if (saved) updateAlarmState(saved);
  }

  function restore() {
    const timer = MiniTalk.Persistence.get(TIMER_KEY);
    if (timer?.endAt > Date.now()) scheduleTimer(timer);
    else MiniTalk.Persistence.remove(TIMER_KEY);

    const alarm = MiniTalk.Persistence.get(ALARM_KEY);
    if (alarm?.endAt > Date.now()) scheduleAlarm(alarm);
    else MiniTalk.Persistence.remove(ALARM_KEY);
  }

  restore();
  return { openTimer, openAlarm, startTimer, stopTimer, setAlarm, clearAlarm, restore };
})();
