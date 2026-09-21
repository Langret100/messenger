/*
 * 공용 코인 지갑 표시기
 * 서버 잔액을 로컬에 짧게 캐시하되, force=true는 진행 중인 예전 조회가 있어도
 * 그 조회가 끝난 뒤 반드시 새 서버 조회를 한 번 더 수행합니다.
 */
MiniTalk.Economy = MiniTalk.Economy || {};
MiniTalk.Economy.CoinWallet = (() => {
  const CACHE_KEY = "economy.coinSnapshot.v2";
  const CACHE_TTL = 30000;
  let inFlight = null;
  let balanceRevision = 0;
  let ownerId = null;
  let ownerGeneration = 0;
  let refreshQueued = null;
  function ensureOwner() {
    const next = MiniTalk.Store.get("user")?.user_id || "guest";
    if (next === ownerId) return;
    ownerId = next; ownerGeneration += 1; balanceRevision += 1;
    inFlight = null; refreshQueued = null;
    const saved = snapshot();
    MiniTalk.Store.set("coins", saved ? saved.value : null);
  }
  function validAmount(raw) {
    return (typeof raw === "number" || typeof raw === "string") && String(raw).trim() !== "" && Number.isSafeInteger(Number(raw));
  }

  function snapshot() {
    const saved = MiniTalk.Persistence.get(CACHE_KEY, null);
    if (!saved || saved.userId !== MiniTalk.Store.get("user")?.user_id || !validAmount(saved.value)) return null;
    return saved;
  }

  function value() {
    ensureOwner();
    return Math.floor(Number(MiniTalk.Store.get("coins")) || 0);
  }

  function requiresLogin() {
    const user = MiniTalk.Store.get("user");
    return !user?.user_id || user.isGuest === true;
  }

  function applyLocal(amount, source = "local", bumpRevision = true) {
    ensureOwner();
    if (!validAmount(amount)) throw new Error("INVALID_COIN_STATUS");
    const next = Number(amount);
    const userId = MiniTalk.Store.get("user")?.user_id || "guest";
    if (bumpRevision) balanceRevision += 1;
    MiniTalk.Store.set("coins", next);
    MiniTalk.Persistence.set(CACHE_KEY, { userId, value: next, source, fetchedAt: Date.now() });
    syncConnectedBadges(next);
    return next;
  }

  function setLocal(amount, source = "local", expectedUserId) {
    ensureOwner();
    if (expectedUserId !== undefined && expectedUserId !== ownerId) return value();
    // 구매/보상 응답처럼 더 최신인 확정값이 들어오면 그 전에 시작된 coinStatus
    // 요청은 더 이상 화면 잔액을 덮어쓸 수 없다.
    return applyLocal(amount, source, true);
  }

  function syncConnectedBadges(amount = value()) {
    const doc = MiniTalk.UI.Dom.doc();
    doc?.querySelectorAll?.(".coin-wallet-badge").forEach(button => {
      const count = button.querySelector(".coin-count");
      if (count) update(button, count, amount);
    });
  }

  function startServerRefresh(user, cached) {
    const requestRevision = balanceRevision;
    const generation = ownerGeneration;
    const request = (async () => {
      // 실시간 운영 중에는 Firebase의 작은 balance 경로만 먼저 읽습니다.
      // 로그인 응답에서 막 받은 코인값은 Firebase 사용자 최초 생성에만 사용하고,
      // 저장된 과거 캐시로 삭제된 경제 사용자를 되살리지 않습니다.
      if (MiniTalk.Realtime?.getMode?.() === "firebase" && MiniTalk.Economy.Runtime) {
        const amount = await MiniTalk.Economy.Runtime.balance(user.user_id).catch(() => null);
        if (amount !== null) return amount;
      }
      // Firebase 경제 계정이 아직 초기 이전되지 않은 경우에만 Sheets 값을 표시용으로 읽습니다.
      // 브라우저에서 이 값으로 Firebase 사용자를 자동 생성하지 않아, 보상탭에서 삭제된 사용자가 되살아나는 일을 막습니다.
      return MiniTalk.AuthApi.coinStatus(user.user_id);
    })()
      .then(amount => {
        ensureOwner();
        if (generation !== ownerGeneration || user.user_id !== ownerId) return value();
        // 요청이 시작된 뒤 구매/보상 등에서 더 최신 확정 잔액이 반영됐다면
        // 늦게 도착한 예전 조회값은 버리고 현재 값을 유지한다.
        if (requestRevision !== balanceRevision) return value();
        return applyLocal(amount, "server", true);
      })
      .catch(error => {
        ensureOwner();
        if (generation !== ownerGeneration || user.user_id !== ownerId) return value();
        console.warn("코인 잔액 조회 실패", error);
        if (requestRevision !== balanceRevision) return value();
        if (cached) return Math.floor(Number(cached.value) || 0);
        throw error;
      });

    inFlight = request;
    const finish = () => {
      if (inFlight === request) inFlight = null;
    };
    request.then(finish, finish);
    return request;
  }

  async function refresh(force = false) {
    ensureOwner();
    const user = MiniTalk.Store.get("user");
    const generation = ownerGeneration;
    if (!user?.user_id || user.isGuest) return setLocal(0, "guest");

    let cached = snapshot();
    /*
     * 로그인 직후 Store 기본값(0)을 서버 응답까지 그대로 보여주지 않습니다.
     * 이 사용자에게 저장된 마지막 확정 잔액이 있으면 즉시 화면에 복원하고,
     * 서버 조회는 그대로 이어서 최신값으로 교체합니다. 오래된 캐시는 표시용일 뿐
     * force 조회를 생략하는 근거로 사용하지 않습니다.
     */
    if (cached) {
      const cachedValue = Math.floor(Number(cached.value) || 0);
      if (value() !== cachedValue) {
        MiniTalk.Store.set("coins", cachedValue);
        syncConnectedBadges(cachedValue);
      }
    }
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL) return cached.value;

    if (inFlight) {
      if (!force) return inFlight;
      if (refreshQueued) return refreshQueued;
      const waiting = inFlight;
      const queued = waiting.catch(() => {}).then(() => {
        ensureOwner();
        if (generation !== ownerGeneration) return value();
        return startServerRefresh(user, snapshot());
      });
      refreshQueued = queued;
      const finish = () => { if (refreshQueued === queued) refreshQueued = null; };
      queued.then(finish, finish);
      return queued;
    }

    return startServerRefresh(user, cached);
  }

  function badge(options = {}) {
    ensureOwner();
    const D = MiniTalk.UI.Dom;
    const loginRequired = requiresLogin();
    const known = loginRequired ? false : Boolean(snapshot());
    const initialText = loginRequired ? "로그인이 필요해요" : known ? (options.header ? String(value()) : `${value()} 코인`) : "확인 중…";
    const count = D.el("strong", { class: "coin-count", text: initialText });
    const button = D.el("button", {
      class: `coin-wallet-badge${options.header ? " header-coin-badge" : ""}`,
      "data-header": options.header ? "1" : "0",
      type: "button",
      ...(loginRequired ? { disabled: true } : {}),
      title: loginRequired ? "로그인 후 코인을 확인할 수 있어요" : "코인 잔액 새로고침",
      "aria-label": loginRequired ? "로그인이 필요해요" : `보유 코인 ${value()}개. 새로고침`,
      onclick: async () => {
        if (button.dataset.refreshing === "1") return;
        button.dataset.refreshing = "1";
        button.setAttribute("aria-busy", "true");
        try {
          const amount = await refresh(true);
          update(button, count, amount);
        } catch (error) {
          MiniTalk.UI.Shell?.toast?.("코인 잔액을 확인하지 못했습니다.");
        } finally {
          delete button.dataset.refreshing;
          button.removeAttribute("aria-busy");
        }
      }
    }, [
      D.el("img", { src: "assets/ui/notebook-coin.svg", alt: "" }),
      ...(options.header ? [] : [D.el("span", { text: "보유" })]),
      count
    ]);
    if (!loginRequired) refresh().then(amount => {
      if (button.isConnected) update(button, count, amount);
    }).catch(() => {});
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

  function revision() { ensureOwner(); return balanceRevision; }

  function setServerSnapshot(amount, startedRevision, source = "server-sync") {
    ensureOwner();
    // 서버 조회가 시작된 뒤 구매/보상처럼 더 최신인 확정값이 들어왔으면
    // 늦게 도착한 스냅샷은 현재 화면을 덮지 않습니다.
    if (Number(startedRevision) !== balanceRevision) return value();
    return applyLocal(amount, source, true);
  }

  MiniTalk.Events?.on?.("state:user", ensureOwner);

  return { value, refresh, setLocal, setServerSnapshot, revision, badge, requiresLogin, syncConnectedBadges };
})();
