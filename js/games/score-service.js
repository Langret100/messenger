/*
 * 게임 점수 서비스
 * iframe 점수를 로컬 최고 기록에 먼저 보존하고, 로그인 사용자는 토리의 GAS 랭킹 규격에도 전송합니다.
 */
MiniTalk.Games = MiniTalk.Games || {};
MiniTalk.Games.ScoreService = (() => {
  const STORAGE_KEY = "games.localScores";

  function loadLocal() {
    const value = MiniTalk.Persistence.get(STORAGE_KEY, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function recordLocal(gameName, score, user) {
    const all = loadLocal();
    const game = all[gameName] && typeof all[gameName] === "object" ? all[gameName] : {};
    const userId = user?.user_id || "guest";
    const previous = game[userId];
    const normalized = Math.max(0, Math.floor(Number(score) || 0));
    if (!previous || normalized > Number(previous.score || 0)) {
      game[userId] = {
        userId,
        nickname: user?.nickname || user?.username || "게스트",
        score: normalized,
        updatedAt: Date.now()
      };
      all[gameName] = game;
      MiniTalk.Persistence.set(STORAGE_KEY, all);
    }
  }

  function localRanking(gameName) {
    const rows = Object.values(loadLocal()[gameName] || {});
    return rows
      .map(item => ({
        userId: item.userId,
        nickname: item.nickname || "사용자",
        score: Math.max(0, Math.floor(Number(item.score) || 0)),
        local: true
      }))
      .sort((a, b) => b.score - a.score)
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }

  async function submit(gameName, score) {
    const normalized = Math.max(0, Math.floor(Number(score) || 0));
    const user = MiniTalk.Store.get("user");
    if (!gameName || !normalized || !user?.user_id) return false;
    recordLocal(gameName, normalized, user);

    if (user.isGuest) {
      MiniTalk.UI.Shell.toast(`${gameName} ${normalized}점 · 이 기기에 기록`);
      return true;
    }

    try {
      const body = new URLSearchParams({
        mode: "game_update_score",
        game_name: String(gameName),
        user_id: String(user.user_id),
        username: String(user.nickname || user.username || user.user_id),
        score: String(normalized)
      });
      const response = await fetch(MiniTalkConfig.sheetUrl, { method: "POST", body });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await response.json().catch(() => ({}));
      // 주간 TOP3 코인은 게임 요청 시 즉시 지급하지 않고 월요일 오전 9시 서버 트리거에서만 지급합니다.
      MiniTalk.UI.Shell.toast(`${gameName} ${normalized}점 기록`);
      return true;
    } catch (error) {
      console.warn("게임 점수 온라인 전송 실패", error);
      MiniTalk.UI.Shell.toast(`${gameName} ${normalized}점 · 로컬 기록 보관`);
      return false;
    }
  }

  function normalizeRemote(item) {
    return {
      rank: Number(item.rank) || 0,
      userId: String(item.user_id || item.userId || item.id || ""),
      nickname: String(item.username || item.nickname || item.name || "사용자"),
      score: Math.max(0, Math.floor(Number(item.score) || 0)),
      local: false
    };
  }

  function merge(remote, local) {
    const rows = new Map();
    [...remote, ...local].forEach(item => {
      const key = item.userId || `name:${item.nickname}`;
      const previous = rows.get(key);
      if (!previous || item.score > previous.score) rows.set(key, item);
    });
    return [...rows.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, 100)
      .map((item, index) => ({ ...item, rank: index + 1 }));
  }

  async function ranking(gameName) {
    const local = localRanking(gameName);
    try {
      const url = new URL(MiniTalkConfig.sheetUrl);
      url.searchParams.set("mode", "game_ranking");
      url.searchParams.set("game_name", gameName);
      const user = MiniTalk.Store.get("user");
      if (user?.user_id && !user.isGuest) url.searchParams.set("user_id", String(user.user_id));
      url.searchParams.set("t", String(Date.now()));
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      // 랭킹 조회도 읽기 전용입니다. 코인 지급은 월요일 오전 9시 서버 트리거만 담당합니다.
      const list = Array.isArray(json.list) ? json.list : Array.isArray(json.data) ? json.data : [];
      return { rows: merge(list.map(normalizeRemote), local), online: true };
    } catch (error) {
      console.warn("게임 랭킹 불러오기 실패", error);
      return { rows: local, online: false };
    }
  }

  return { submit, ranking, localRanking, recordLocal };
})();
