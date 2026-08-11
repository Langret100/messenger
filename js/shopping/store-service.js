/* 상품 카탈로그·구매·보관함·선물의 데이터 규칙을 UI에서 분리합니다. */
MiniTalk.Shopping = MiniTalk.Shopping || {};
MiniTalk.Shopping.StoreService = (() => {
  const USED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;

  const objectValue = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  MiniTalk.Events.on("rt:shop-inventory", value => MiniTalk.Store.set("shopInventory", objectValue(value)));
  let catalogPromise = null;
  let catalogLoadedAt = 0;

  function user() {
    return MiniTalk.Store.get("user") || {};
  }

  function requireLogin() {
    const current = user();
    if (!current.user_id || current.isGuest) throw new Error("로그인 후 이용할 수 있어요.");
    return current;
  }

  function normalizeProduct(product = {}) {
    return {
      id: String(product.id || ""),
      name: String(product.name || "").trim().slice(0, 60),
      description: String(product.description || "").trim().slice(0, 160),
      // 상품 이미지는 160×120 data URL로 서버에 저장되므로 서버와 같은 크기 제한을 사용합니다.
      imageUrl: String(product.imageUrl || product.image_url || "").trim().slice(0, 7200),
      price: Math.max(1, Math.floor(Number(product.price) || 0)),
      updatedAt: Number(product.updatedAt) || 0
    };
  }

  function products() {
    return Object.values(objectValue(MiniTalk.Store.get("shopCatalog")))
      .map(normalizeProduct)
      .filter(item => item.id && item.name && item.price > 0)
      .sort((a, b) => a.price - b.price || a.name.localeCompare(b.name, "ko"));
  }

  async function refreshCatalog(force = false) {
    if (!force && Date.now() - catalogLoadedAt < 30000) return products();
    if (catalogPromise) return catalogPromise;
    catalogPromise = MiniTalk.AuthApi.shopCatalog().then(rows => {
      const catalog = {};
      rows.map(normalizeProduct).filter(item => item.id && item.name && item.price > 0)
        .forEach(item => { catalog[item.id] = item; });
      catalogLoadedAt = Date.now();
      MiniTalk.Store.set("shopCatalog", catalog);
      return products();
    }).finally(() => { catalogPromise = null; });
    return catalogPromise;
  }

  async function saveProduct(product) {
    const current = requireLogin();
    const value = normalizeProduct({ ...product, id: product?.id || crypto.randomUUID(), updatedAt: Date.now() });
    if (!value.name || value.price <= 0) throw new Error("상품 이름과 가격을 입력하세요.");
    const result = await MiniTalk.AuthApi.shopSaveProduct(current.user_id, MiniTalk.AdminSession.requireToken(), value);
    // 저장 직후 다시 서버를 조회하지 않고 응답을 현재 카탈로그에 즉시 반영합니다.
    const saved = normalizeProduct({ ...value, ...(result.product || {}), imageUrl: result.product?.imageUrl || result.product?.image_url || value.imageUrl });
    const catalog = { ...objectValue(MiniTalk.Store.get("shopCatalog")), [saved.id]: saved };
    catalogLoadedAt = Date.now();
    MiniTalk.Store.set("shopCatalog", catalog);
    return saved;
  }

  async function deleteProduct(id) {
    const current = requireLogin();
    await MiniTalk.AuthApi.shopDeleteProduct(current.user_id, MiniTalk.AdminSession.requireToken(), id);
    const catalog = { ...objectValue(MiniTalk.Store.get("shopCatalog")) };
    delete catalog[id];
    catalogLoadedAt = Date.now();
    MiniTalk.Store.set("shopCatalog", catalog);
  }

  function inventory(now = Date.now()) {
    return Object.values(objectValue(MiniTalk.Store.get("shopInventory")))
      .filter(item => !item.usedAt || now - Number(item.usedAt) < USED_VISIBLE_MS)
      .sort((a, b) => Number(b.createdAt || b.giftedAt || 0) - Number(a.createdAt || a.giftedAt || 0));
  }

  function usedRemainingDays(item, now = Date.now()) {
    if (!item?.usedAt) return 0;
    return Math.max(0, Math.ceil((USED_VISIBLE_MS - (now - Number(item.usedAt))) / 86400000));
  }

  function recipients() {
    const current = user(), rows = new Map();
    const add = entry => {
      const id = String(entry?.user_id || "");
      if (!id || id === current.user_id || id.startsWith("guest-")) return;
      rows.set(id, { user_id: id, nickname: String(entry.nickname || id) });
    };
    Object.values(objectValue(MiniTalk.Store.get("profiles"))).forEach(add);
    Object.values(objectValue(MiniTalk.Store.get("presence"))).forEach(add);
    return [...rows.values()].sort((a, b) => a.nickname.localeCompare(b.nickname, "ko"));
  }

  async function purchase(product) {
    const current = requireLogin(), item = normalizeProduct(product);
    if (!item.id || !item.name || !item.price) throw new Error("구매할 상품 정보가 올바르지 않습니다.");
    // 서버가 실제 잔액과 가격을 원자적으로 검증하므로 구매 전에 잔액을 다시 조회하지 않습니다.
    const purchaseKey = `${current.user_id}:${item.id}:${crypto.randomUUID()}`;
    let result;
    try {
      result = await MiniTalk.AuthApi.shopPurchase({ userId: current.user_id, productId: item.id, price: item.price, purchaseKey });
    } catch (error) {
      throw new Error(error?.message || "구매 서버 기능이 아직 연결되지 않았습니다.");
    }
    await MiniTalk.Realtime.addShopInventory(current.user_id, {
      productId: item.id,
      name: item.name,
      description: item.description,
      imageUrl: item.imageUrl,
      price: item.price,
      purchaseKey,
      purchasedAt: Date.now(),
      createdAt: Date.now()
    });
    const serverBalance = result.newCoin ?? result.coin ?? result.balance;
    if (serverBalance != null) MiniTalk.Economy.CoinWallet.setLocal(serverBalance, "purchase");
    else await MiniTalk.Economy.CoinWallet.refresh(true);
    return result;
  }

  async function use(id) {
    requireLogin();
    const item = inventory().find(row => row.id === id);
    if (!item || item.usedAt) throw new Error("사용할 수 없는 상품입니다.");
    return MiniTalk.Realtime.useShopInventory(id);
  }

  async function gift(id, targetId) {
    requireLogin();
    const item = inventory().find(row => row.id === id);
    if (!item || item.usedAt) throw new Error("선물할 수 없는 상품입니다.");
    const target = recipients().find(row => row.user_id === targetId);
    if (!target) throw new Error("선물할 사용자를 찾을 수 없습니다.");
    return MiniTalk.Realtime.giftShopInventory(id, target.user_id, target.nickname);
  }

  return { products, refreshCatalog, saveProduct, deleteProduct, inventory, recipients, purchase, use, gift, normalizeProduct, usedRemainingDays, requireLogin, USED_VISIBLE_MS };
})();
