/*
 * 현재 coin.gs의 coin_reward/QUEST_5CLEAR 규격을 사용하는 과목별 일일 보상 모듈입니다.
 * 서버 키를 날짜+과목으로 분리해 수학과 국어가 각각 하루 한 번 보상됩니다.
 */
MiniTalk.Economy = MiniTalk.Economy || {};
MiniTalk.Economy.QuestReward = (() => {
  const SUBJECTS = { math: "수학", korean: "국어" };
  const inFlight = new Map();

  function storageKey(userId, date, subject) {
    return `economy.questReward.${userId}.${date}.${subject}`;
  }

  function acknowledged(userId, date, subject) {
    return MiniTalk.Persistence.get(storageKey(userId, date, subject), null)?.acknowledged === true;
  }

  async function ensure(subject, date) {
    if (!SUBJECTS[subject] || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return { skipped: true };
    const user = MiniTalk.Store.get("user");
    if (!user?.user_id || user.isGuest) return { skipped: true, reason: "guest" };
    const userId = String(user.user_id);
    if (acknowledged(userId, date, subject)) return { skipped: true, reason: "already-acknowledged" };

    const requestKey = `${userId}|${date}|${subject}`;
    if (inFlight.has(requestKey)) return inFlight.get(requestKey);
    const request = postReward(user, subject, date)
      .finally(() => inFlight.delete(requestKey));
    inFlight.set(requestKey, request);
    return request;
  }

  async function postReward(user, subject, date) {
    const body = new URLSearchParams({
      mode: "coin_reward",
      user_id: String(user.user_id),
      reward_type: "QUEST_5CLEAR",
      // 날짜 키에 과목을 붙여 수학·국어의 서버 중복 판정을 분리합니다.
      reward_key: `${date}:${subject}`
    });
    try {
      const response = await fetch(MiniTalkConfig.sheetUrl, { method: "POST", body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (!result || result.ok === false) throw new Error(result?.error || "코인 보상 요청 실패");

      const granted = result.applied !== false && result.granted !== false;
      MiniTalk.Persistence.set(storageKey(String(user.user_id), date, subject), {
        acknowledged: true,
        granted,
        savedAt: Date.now()
      });
      const amount = await MiniTalk.Economy.CoinWallet.refresh(true);
      if (granted) MiniTalk.UI.Shell.toast(`${SUBJECTS[subject]} 퀘스트 완료 · 코인 1개 적립!`);
      MiniTalk.Events.emit("coins:quest-reward", { subject, date, amount, granted });
      return { ok: true, granted, amount };
    } catch (error) {
      console.warn(`${SUBJECTS[subject]} 퀘스트 코인 적립 실패`, error);
      return { ok: false, error };
    }
  }

  MiniTalk.Events.on("quest:subject-complete", detail => {
    if (detail?.subject && detail?.date) ensure(detail.subject, detail.date);
  });

  return { ensure, acknowledged, storageKey };
})();
