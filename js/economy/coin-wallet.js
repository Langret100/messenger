/*
 * 공용 코인 지갑 표시기
 * 서버 잔액을 로컬에 짧게 캐시하되, force=true는 진행 중인 예전 조회가 있어도
 * 그 조회가 끝난 뒤 반드시 새 서버 조회를 한 번 더 수행합니다.
 */
MiniTalk.Economy = MiniTalk.Economy || {};
MiniTalk.Economy.CoinWallet = (() => {
  const CACHE_KEY = "economy.coinSnapshot";
  const CACHE_TTL = 30000;
  let inFlight = null;

  function snapshot() {
    const saved = MiniTalk.Persistence.get(CACHE_KEY, null);
    if (!saved || saved.userId !== MiniTalk.Store.get("user")?.user_id) return null;
    return saved;
  }

  function value() {
    return Math.floor(Number(MiniTalk.Store.get("coins")) || 0);
  }

  function requiresLogin() {
    const user = MiniTalk.Store.get("user");
    return !user?.user_id || user.isGuest === true;
  }

  function setLocal(amount, source = "local") {
    const next = Math.floor(Number(amount) || 0);
    const userId = MiniTalk.Store.get("user")?.user_id || "guest";
    MiniTalk.Store.set("coins", next);
    MiniTalk.Persistence.set(CACHE_KEY, { userId, value: next, source, fetchedAt: Date.now() });
    syncConnectedBadges(next);
    return next;
  }

  function syncConnectedBadges(amount = value()) {
    const doc = MiniTalk.UI.Dom.doc();
    doc?.querySelectorAll?.(".coin-wallet-badge").forEach(button => {
      const count = button.querySelector(".coin-count");
      if (count) update(button, count, amount);
    });
  }

  function startServerRefresh(user, cached) {
    const request = MiniTalk.AuthApi.coinStatus(user.user_id)
      .then(amount => setLocal(amount, "server"))
      .catch(error => {
        console.warn("코인 잔액 조회 실패", error);
        return setLocal(cached?.value || 0, "fallback");
      });

    inFlight = request;
    request.finally(() => {
      if (inFlight === request) inFlight = null;
    });
    return request;
  }

  async function refresh(force = false) {
    const user = MiniTalk.Store.get("user");
    if (!user?.user_id || user.isGuest) return setLocal(0, "guest");

    let cached = snapshot();
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      MiniTalk.Store.set("coins", cached.value);
      return cached.value;
    }

    if (inFlight) {
      if (!force) return inFlight;

      /*
       * 보상/구매 직후 force refresh가 이전에 시작된 잔액 조회 Promise를 그대로
       * 재사용하면, 서버 코인은 증가했는데 화면에는 보상 전 잔액이 남을 수 있습니다.
       * 강제 새로고침은 이전 조회를 기다린 뒤 반드시 새 요청을 보냅니다.
       */
      try { await inFlight; } catch (error) {}
      cached = snapshot();
    }

    return startServerRefresh(user, cached);
  }

  function badge(options = {}) {
    const D = MiniTalk.UI.Dom;
    const loginRequired = requiresLogin();
    const count = D.el("strong", { class: "coin-count", text: loginRequired ? "로그인이 필요해요" : options.header ? String(value()) : `${value()} 코인` });
    const button = D.el("button", {
      class: `coin-wallet-badge${options.header ? " header-coin-badge" : ""}`,
      "data-header": options.header ? "1" : "0",
      type: "button",
      ...(loginRequired ? { disabled: true } : {}),
      title: loginRequired ? "로그인 후 코인을 확인할 수 있어요" : "코인 잔액 새로고침",
      "aria-label": loginRequired ? "로그인이 필요해요" : `보유 코인 ${value()}개. 새로고침`,
      onclick: async () => {
        button.disabled = true;
        const amount = await refresh(true);
        update(button, count, amount);
        button.disabled = false;
      }
    }, [
      D.el("img", { src: "assets/ui/notebook-coin.svg", alt: "" }),
      ...(options.header ? [] : [D.el("span", { text: "보유" })]),
      count
    ]);
    if (!loginRequired) refresh().then(amount => {
      if (button.isConnected) update(button, count, amount);
    });
    return button;
  }

  function update(button, count, amount) {
    if (requiresLogin()) {
      count.textContent = "로그인이 필요해요";
      button.disabled = true;
      button.setAttribute("aria-label", "로그인이 필요해요");
      return;
    }
    count.textContent = button.dataset.header === "1" ? String(amount) : `${amount} 코인`;
    button.setAttribute("aria-label", `보유 코인 ${amount}개. 새로고침`);
  }

  return { value, refresh, setLocal, badge, requiresLogin, syncConnectedBadges };
})();
