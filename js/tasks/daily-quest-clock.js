/* 수학·국어 일일 퀘스트가 함께 사용하는 기기 로컬시간 기준 오전 9시 시계입니다. */
MiniTalk.Tasks = MiniTalk.Tasks || {};
MiniTalk.Tasks.DailyQuestClock = (() => {
  const RESET_HOUR = 9;

  function currentDate(date) {
    return date ? new Date(date) : new Date();
  }

  function dateKey(date) {
    const questDate = currentDate(date);
    if (questDate.getHours() < RESET_HOUR) questDate.setDate(questDate.getDate() - 1);
    return `${questDate.getFullYear()}-${String(questDate.getMonth() + 1).padStart(2, "0")}-${String(questDate.getDate()).padStart(2, "0")}`;
  }

  function nextReset(date) {
    const current = currentDate(date);
    const reset = new Date(current);
    reset.setHours(RESET_HOUR, 0, 0, 0);
    if (current.getTime() >= reset.getTime()) reset.setDate(reset.getDate() + 1);
    return reset;
  }

  function remaining(date) {
    const current = currentDate(date);
    const milliseconds = Math.max(0, nextReset(current).getTime() - current.getTime());
    const totalMinutes = Math.ceil(milliseconds / 60000);
    return {
      milliseconds,
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60
    };
  }

  function label(date) {
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

  function weekKey(key=dateKey()) {
    if(typeof key!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(key))return "";
    const [y,m,d]=key.split("-").map(Number),date=new Date(Date.UTC(y,m-1,d));
    date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
    return date.toISOString().slice(0,10);
  }

  // Reserve disjoint retry banks for all seven days. Base sets still advance five slots daily.
  function dayPool(items,key=dateKey()) {
    const monday=weekKey(key),serial=value=>Math.floor(Date.parse(`${value}T00:00:00Z`)/86400000);
    const day=serial(key)-serial(monday),start=serial(monday)*5,n=items.length,out=[];
    if(n<35)throw new Error("주간 문제 풀이 부족합니다.");
    for(let i=0;i<5;i++)out.push(items[((start+day*5+i)%n+n)%n]);
    for(let i=35+day;i<n;i+=7)out.push(items[((start+i)%n+n)%n]);
    return out;
  }

  return { dateKey, weekKey, dayPool, nextReset, remaining, label, banner };
})();
