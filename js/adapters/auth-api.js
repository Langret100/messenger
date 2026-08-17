/* 토리 Apps Script 인증·코인·구매 규격 어댑터입니다. */
MiniTalk.AuthApi = (() => {
  const errorMessages = {
    ADMIN_AUTH_FAILED: "관리자 고유 코드가 올바르지 않습니다.",
    ADMIN_CODE_NOT_CONFIGURED: "서버에 관리자 고유 코드가 설정되지 않았습니다.",
    ADMIN_SESSION_EXPIRED: "관리자 인증 시간이 만료되었습니다. 다시 인증해주세요.",
    ADMIN_AUTH_REQUIRED: "관리자 인증이 필요합니다.",
    LOGIN_REQUIRED: "로그인 후 이용할 수 있어요.",
    INSUFFICIENT_COIN: "코인이 부족합니다.",
    PRICE_CHANGED: "상품 가격이 변경되었습니다. 쇼핑 화면을 다시 열어주세요.",
    PRODUCT_CHANGED: "상품 정보가 변경되었습니다. 최신 상품을 확인해주세요.",
    PRODUCT_NOT_AVAILABLE: "현재 구매할 수 없는 상품입니다.",
    SHOP_BUSY: "구매 요청이 많습니다. 잠시 후 다시 시도해주세요.",
    INVALID_PRODUCT_IMAGE: "상품 이미지 형식이 올바르지 않습니다.",
    PRODUCT_IMAGE_TOO_LARGE: "압축된 상품 이미지가 너무 큽니다.",
    PRODUCT_IMAGE_UPLOAD_FAILED: "상품 이미지를 서버에 저장하지 못했습니다."
  };
  async function post(payload) {
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => body.set(key, String(value ?? "")));
    const response = await fetch(MiniTalkConfig.sheetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body
    });
    if (!response.ok) throw new Error(`서버 오류 ${response.status}`);
    const data = await response.json();
    if (!data?.ok) {
      const error = new Error(data?.message || errorMessages[data?.error] || data?.error || "요청 실패");
      error.code = data?.error || "REQUEST_FAILED";
      error.data = data;
      throw error;
    }
    return data;
  }

  return {
    async login(username, password) {
      const data = await post({ mode: "login", username, password });
      return { user_id: data.user_id, username, nickname: data.nickname || username };
    },
    async signup(username, password, nickname) {
      const data = await post({ mode: "signup", username, password, nickname });
      return { user_id: data.user_id, username, nickname: data.nickname || nickname || username };
    },
    async coinStatus(user_id) {
      const data = await post({ mode: "coin_status", user_id });
      return data.coin ?? data.balance ?? 0;
    },
    async adminUnlock(userId, adminCode) {
      return post({ mode: "admin_unlock", user_id: userId, admin_code: adminCode });
    },
    async shopCatalog() {
      const data = await post({ mode: "shop_catalog" });
      return Array.isArray(data.products) ? data.products : [];
    },
    async userDirectory(userId) {
      const data = await post({ mode: "user_directory", user_id: userId });
      return Array.isArray(data.users) ? data.users : [];
    },
    async shopSaveProduct(userId, adminToken, product) {
      return post({
        mode: "shop_product_save",
        user_id: userId,
        admin_token: adminToken,
        product_id: product.id,
        name: product.name,
        price: product.price,
        description: product.description || "",
        image_data: product.imageUrl || ""
      });
    },
    async shopDeleteProduct(userId, adminToken, productId) {
      return post({
        mode: "shop_product_delete",
        user_id: userId,
        admin_token: adminToken,
        product_id: productId
      });
    },
    /*
     * 서버는 상품 ID·가격을 다시 검증하고 코인 차감과 구매 키 중복 검사를
     * 한 트랜잭션으로 처리해야 합니다. 미지원 서버에서는 명확한 오류를 반환합니다.
     */
    async shopPurchase({ userId, product, purchaseKey }) {
      return post({
        mode: "shop_purchase",
        user_id: userId,
        product_id: product.id,
        price: product.price,
        expected_name: product.name,
        expected_description: product.description || "",
        expected_updated_at: product.updatedAt || 0,
        purchase_key: purchaseKey
      });
    },
    async shopInventory(userId) {
      const data = await post({ mode: "shop_inventory", user_id: userId });
      return Array.isArray(data.items) ? data.items : [];
    },
    async shopGift({ userId, nickname, targetId, inventoryId, item }) {
      return post({ mode: "shop_gift", user_id: userId, nickname, target_user_id: targetId, inventory_id: inventoryId, item_json: JSON.stringify(item || {}) });
    },
    async shopUse({ userId, inventoryId, item }) {
      return post({ mode: "shop_use", user_id: userId, inventory_id: inventoryId, item_json: JSON.stringify(item || {}) });
    },
    async adminDispatch({ userId, adminToken, targets, type, payload }) {
      return post({
        mode: "admin_dispatch",
        user_id: userId,
        admin_token: adminToken,
        targets_json: JSON.stringify(targets || []),
        command_type: type,
        payload_json: JSON.stringify(payload || {})
      });
    },
    async userCommands(userId, ackIds = []) {
      const data = await post({ mode: "user_commands", user_id: userId, ack_ids: (ackIds || []).join(",") });
      return Array.isArray(data.commands) ? data.commands : [];
    }
  };
})();
