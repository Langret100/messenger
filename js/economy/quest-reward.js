/*
 * 과목별 일일 퀘스트 보상 모듈
 * - 수학/국어를 날짜+과목 키로 분리해 각 과목 하루 한 번 +1 코인
 * - 서버의 보상로그가 최종 중복 방지 기준
 * - 네트워크/COIN_BUSY는 한 번 재시도하고, 실패는 숨기지 않고 사용자에게 알림
 */
MiniTalk.Economy = MiniTalk.Economy || {};
MiniTalk.Economy.QuestReward = (() => {
  const SUBJECTS = { math: "수학", korean: "국어" };
  const inFlight = new Map();
  const RETRYABLE = new Set(["COIN_BUSY", "COIN_SHEET_TEMPORARY_ERROR"]);

  function storageKey(userId, date, subject) {
    return `economy.questReward.${userId}.${date}.${subject}`;
  }

  function acknowledged(userId, date, subject) {
    return MiniTalk.Persistence.get(storageKey(userId, date, subject), null)?.acknowledged === true;
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function requestReward(user, subject, date) {
    const body = new URLSearchParams({
      mode: "coin_reward",
      user_id: String(user.user_id),
      reward_type: "QUEST_5CLEAR",
      reward_key: `${date}:${subject}`
    });

    const response = await fetch(MiniTalkConfig.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);

    const result = await response.json();
    if (!result || result.ok === false) {
      const error = new Error(result?.error || "COIN_REWARD_FAILED");
      error.code = result?.error || "COIN_REWARD_FAILED";
      error.data = result || null;
      throw error;
    }
    return result;
  }

  async function ensure(subject, date) {
    if (!SUBJECTS[subject] || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
      return { skipped: true, reason: "invalid-request" };
    }

    const user = MiniTalk.Store.get("user");
    if (!user?.user_id || user.isGuest) return { skipped: true, reason: "guest" };

    const userId = String(user.user_id);
    if (acknowledged(userId, date, subject)) {
      /*
       * 다른 화면에서 코인이 바뀌었을 수 있으므로 완료 상태 재진입 시에도
       * 잔액은 서버에서 강제 확인할 수 있게 합니다.
       */
      MiniTalk.Economy.CoinWallet?.refresh?.(true).catch?.(() => {});
      return { skipped: true, reason: "already-acknowledged" };
    }

    const requestKey = `${userId}|${date}|${subject}`;
    if (inFlight.has(requestKey)) return inFlight.get(requestKey);

    const request = postReward(user, subject, date)
      .finally(() => inFlight.delete(requestKey));
    inFlight.set(requestKey, request);
    return request;
  }

  async function postReward(user, subject, date) {
    let result;
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await requestReward(user, subject, date);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        const retryable = attempt === 0 && (
          RETRYABLE.has(error?.code) ||
          /^HTTP_5\d\d$/.test(String(error?.message || "")) ||
          error instanceof TypeError
        );
        if (!retryable) break;
        await wait(450);
      }
    }

    if (lastError) {
      console.warn(`${SUBJECTS[subject]} 퀘스트 코인 적립 실패`, lastError);
      const message = lastError?.code === "NO_REWARD_USER"
        ? "코인 계정이 아직 연결되지 않았어요. 관리자에게 코인 계정 동기화를 요청해주세요."
        : `${SUBJECTS[subject]} 퀘스트는 완료됐지만 코인 적립을 확인하지 못했어요. 잠시 후 과제 화면을 다시 열면 자동으로 재시도해요.`;
      MiniTalk.UI.Shell.toast(message);
      MiniTalk.Events.emit("coins:quest-reward-error", {
        subject,
        date,
        code: lastError?.code || lastError?.message || "COIN_REWARD_FAILED"
      });
      return { ok: false, error: lastError };
    }

    /*
     * applied:false는 서버 보상로그상 이미 지급된 경우입니다.
     * 이 경우도 서버가 최종 상태를 알고 있으므로 로컬에서는 확인 완료로 기록합니다.
     */
    const granted = result.applied !== false && result.granted !== false;
    MiniTalk.Persistence.set(storageKey(String(user.user_id), date, subject), {
      acknowledged: true,
      granted,
      savedAt: Date.now()
    });

    /*
     * 반드시 보상 POST가 끝난 뒤 "새로운" 잔액 조회를 수행합니다.
     * CoinWallet.refresh(true)는 v91 hotfix에서 이전 in-flight 조회를 재사용하지 않습니다.
     */
    const amount = await MiniTalk.Economy.CoinWallet.refresh(true);

    if (granted) {
      MiniTalk.UI.Shell.toast(`${SUBJECTS[subject]} 퀘스트 완료 · 코인 1개 적립!`);
    }
    MiniTalk.Events.emit("coins:quest-reward", { subject, date, amount, granted });
    return { ok: true, granted, amount, applied: result.applied !== false };
  }

  MiniTalk.Events.on("quest:subject-complete", detail => {
    if (detail?.subject && detail?.date) {
      ensure(detail.subject, detail.date);
    }
  });

  return { ensure, acknowledged, storageKey };
})();
