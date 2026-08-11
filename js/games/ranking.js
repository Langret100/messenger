/* 게임 랭킹 화면. 점수 저장·통신은 ScoreService에 위임합니다. */
MiniTalk.Games = MiniTalk.Games || {};
MiniTalk.Games.Ranking = (() => {
  function open() {
    const D = MiniTalk.UI.Dom;
    const games = MiniTalk.Features.Games.list().filter(game => game.rankingName);
    const body = D.el("div", { class: "game-community-modal modal-stack" });
    const select = D.el("select", { id: "rankingGame", "aria-label": "랭킹 게임 선택" });
    games.forEach(game => select.append(D.el("option", { value: game.rankingName || game.title, text: game.title })));
    const status = D.el("p", { class: "muted community-status", "aria-live": "polite" });
    const list = D.el("div", { class: "ranking-list" });
    const refresh = D.el("button", { class: "button secondary compact-button", type: "button", text: "새로고침" });

    async function load() {
      refresh.disabled = true;
      status.textContent = "랭킹을 불러오는 중...";
      list.replaceChildren();
      try {
        const result = await MiniTalk.Games.ScoreService.ranking(select.value);
        renderRows(list, result.rows);
        status.textContent = result.online ? "토리 온라인 랭킹" : "연결할 수 없어 이 기기의 기록을 표시합니다.";
      } finally {
        refresh.disabled = false;
      }
    }

    select.onchange = load;
    refresh.onclick = load;
    body.append(
      D.el("div", { class: "community-toolbar" }, [select, refresh]),
      status,
      list
    );
    MiniTalk.UI.Shell.modal("게임 랭킹", body);
    load();
  }

  function renderRows(host, rows) {
    const D = MiniTalk.UI.Dom;
    if (!rows.length) {
      host.append(D.el("div", { class: "empty-state compact-empty" }, [
        D.el("span", { text: "♛" }),
        D.el("strong", { text: "아직 기록이 없어요" }),
        D.el("small", { class: "muted", text: "게임을 플레이하면 최고 점수가 표시됩니다." })
      ]));
      return;
    }
    rows.slice(0, 30).forEach(row => {
      const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `${row.rank}`;
      host.append(D.el("article", { class: `ranking-row ${row.local ? "local" : ""}` }, [
        D.el("span", { class: "ranking-position", text: medal }),
        D.el("span", { class: "ranking-player" }, [
          D.el("strong", { text: row.nickname }),
          D.el("small", { class: "muted", text: row.local ? "내 기기 기록" : "온라인 기록" })
        ]),
        D.el("strong", { class: "ranking-score", text: `${row.score}점` })
      ]));
    });
  }

  return { open };
})();
