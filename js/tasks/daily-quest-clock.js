/* 수학·국어 일일 퀘스트가 함께 사용하는 오전 9시 기준 시계입니다. */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.DailyQuestClock = (() => {
  const RESET_HOUR = 9;

  function dateKey(date = new Date()) {
    const questDate = new Date(date);
    if (questDate.getHours() < RESET_HOUR) questDate.setDate(questDate.getDate() - 1);
    return `${questDate.getFullYear()}-${String(questDate.getMonth() + 1).padStart(2, "0")}-${String(questDate.getDate()).padStart(2, "0")}`;
  }

  function nextReset(date = new Date()) {
    const reset = new Date(date);
    reset.setHours(RESET_HOUR, 0, 0, 0);
    if (date.getTime() >= reset.getTime()) reset.setDate(reset.getDate() + 1);
    return reset;
  }

  function remaining(date = new Date()) {
    const milliseconds = Math.max(0, nextReset(date).getTime() - date.getTime());
    const totalMinutes = Math.ceil(milliseconds / 60000);
    return {
      milliseconds,
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60
    };
  }

  function label(date = new Date()) {
    const time = remaining(date);
    return `새 문제까지 ${time.hours}시간 ${String(time.minutes).padStart(2, "0")}분`;
  }

  function banner(subjectLabel) {
    const D = MiniTalk.UI.Dom;
    const text = D.el("strong", { text: label() });
    const element = D.el("div", { class: "quest-reset-countdown", role: "timer", "aria-live": "off" }, [
      D.el("span", { text: `${subjectLabel} 문제 초기화` }),
      text
    ]);

    // 화면에서 사라진 타이머는 스스로 갱신을 중단해 누적 실행을 막습니다.
    const timer = setInterval(() => {
      if (!element.isConnected) return clearInterval(timer);
      text.textContent = label();
    }, 30000);
    return element;
  }

  return { dateKey, nextReset, remaining, label, banner };
})();
