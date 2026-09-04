/* 토리 Apps Script 인증·코인·구매 규격 어댑터입니다. */
MiniTalk.AuthApi = (() => {
  const errorMessages = {
    ADMIN_AUTH_FAILED: "관리자 고유 코드가 올바르지 않습니다.",
    ADMIN_CODE_NOT_CONFIGURED: "서버에 관리자 고유 코드가 설정되지 않았습니다.",
    ADMIN_SESSION_EXPIRED: "관리자 인증 시간이 만료되었습니다. 다시 인증해주세요.",
    ADMIN_AUTH_REQUIRED: "관리자 인증이 필요합니다.",
    SHOP_MANAGER_PERMISSION_REQUIRED: "쇼핑몰 관리자 권한이 필요합니다.",
    LOGIN_REQUIRED: "로그인 후 이용할 수 있어요.",
    INSUFFICIENT_COIN: "코인이 부족합니다.",
    PRICE_CHANGED: "상품 가격이 변경되었습니다. 쇼핑 화면을 다시 열어주세요.",
    PRODUCT_CHANGED: "상품 정보가 변경되었습니다. 최신 상품을 확인해주세요.",
    PRODUCT_NOT_AVAILABLE: "현재 구매할 수 없는 상품입니다.",
    PRODUCT_SOLD_OUT: "품절된 상품입니다.",
    ITEM_NOT_AVAILABLE: "이 상품의 서버 보관함 정보를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.",
    GIFT_ITEM_NOT_AVAILABLE: "이 상품은 현재 선물할 수 없습니다. 보관함을 다시 확인해주세요.",
    GIFT_REQUEST_CONFLICT: "이전 선물 요청 정보와 현재 대상이 다릅니다. 보관함을 다시 열어주세요.",
    SHOP_BUSY: "구매 요청이 많습니다. 잠시 후 다시 시도해주세요.",
    SHOP_STOCK_UPDATE_FAILED: "재고를 확인하지 못했습니다. 다시 시도해주세요.",
    INVALID_PRODUCT_IMAGE: "상품 이미지 형식이 올바르지 않습니다.",
    PRODUCT_IMAGE_TOO_LARGE: "압축된 상품 이미지가 너무 큽니다.",
    PRODUCT_IMAGE_UPLOAD_FAILED: "상품 이미지를 서버에 저장하지 못했습니다.",
    INVALID_COIN_AMOUNT: "코인 증감 수량이 올바르지 않습니다.",
    COIN_REWARD_FAILED: "코인 보상 처리에 실패했습니다.",
    COIN_REWARD_PENDING: "코인 지급 상태를 확인하고 있습니다. 잠시 후 완료를 다시 눌러주세요.",
    COIN_REWARD_STATE_CONFLICT: "코인 잔액이 다른 작업으로 변경되어 자동 완료하지 못했습니다. 잔액을 확인해주세요.",
    COIN_REQUEST_CONFLICT: "이전 코인 요청과 현재 입력이 다릅니다. 관리자 화면을 다시 열어주세요.",
    COIN_SHEET_TEMPORARY_ERROR: "코인 시트 연결이 일시적으로 불안정합니다. 잠시 후 다시 시도해주세요.",
    NO_TARGETS: "대상 사용자를 선택하세요.",
    INVALID_TASK_TITLE: "과제 제목을 입력하세요.",
    TASK_DESCRIPTION_TOO_LONG: "과제 설명은 1,000자 이하로 입력하세요.",
    TASK_ANSWER_TOO_LONG: "제출 내용은 1,000자 이하로 입력하세요.",
    TASK_ANSWER_REQUIRED: "제출 내용이나 이미지를 입력하세요.",
    INVALID_TASK_IMAGE: "과제 이미지를 다시 첨부해주세요.",
    TASK_NOT_FOUND: "과제를 찾을 수 없습니다.",
    TASK_ALREADY_COMPLETED: "이미 완료된 과제입니다.",
    TASK_NOT_SUBMITTED: "제출된 과제만 검토할 수 있습니다.",
    TASK_FEEDBACK_TOO_LONG: "피드백은 100자 이하로 입력하세요.",
    TASK_FEEDBACK_REQUIRED: "다시 보내려면 피드백을 입력하세요.",
    NO_TASKS_SELECTED: "과제를 선택하세요.",
    TASK_DELETE_CONFLICT: "보상 처리 중인 과제는 삭제할 수 없습니다. 잠시 후 다시 확인해주세요."
  };
  async function post(payload, timeoutMs = 20000) {
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => body.set(key, String(value ?? "")));
    const retryableStatus = status => [404, 429, 500, 502, 503, 504].includes(Number(status));
    // 호출별 timeout 예산 안에서 재시도까지 모두 끝냅니다. 관리자/쇼핑 UI는 각 호출에서 7000ms를 명시합니다.
    const totalBudgetMs = Math.min(60000, Math.max(1000, Number(timeoutMs || 20000))), deadline = Date.now() + totalBudgetMs;
    const maxAttempts = 2;
    const timeoutFailure = () => { const seconds = Math.max(1, Math.round(totalBudgetMs / 1000)); const error = new Error(`서버 응답이 ${seconds}초를 넘겨 요청을 종료했습니다. 잠시 후 상태를 다시 확인해주세요.`);error.code = "REQUEST_TIMEOUT";return error; };
    let lastNetworkError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timeoutFailure();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), Math.max(1, remaining));
      let response;
      try {
        response = await fetch(MiniTalkConfig.sheetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
          body,
          signal: controller.signal
        });
      } catch (error) {
        if (error?.name === "AbortError") {
          const timeoutError = timeoutFailure();
          lastNetworkError = timeoutError;
          throw timeoutError;
        }
        lastNetworkError = error;
        if (attempt === 0 && deadline - Date.now() > 500) { await new Promise(resolve => setTimeout(resolve, Math.min(250, Math.max(0, deadline - Date.now() - 1))));continue; }
        throw error;
      } finally {
        clearTimeout(timer);
      }
      // Apps Script 새 배포 직후/프록시 재연결 때 드물게 발생하는 일시 HTTP 오류는 한 번만 재시도합니다.
      // POST 본문에는 구매/선물/관리자 변경용 request key가 있어 동일 요청 중복은 서버에서 막습니다.
      if (!response.ok && retryableStatus(response.status) && attempt === 0 && deadline - Date.now() > 500) {
        await new Promise(resolve => setTimeout(resolve, Math.min(250, Math.max(0, deadline - Date.now() - 1))));
        continue;
      }
      if (!response.ok) throw new Error(`서버 오류 ${response.status}`);
      let data;
      try { data = await response.json(); }
      catch (error) { throw new Error("서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해주세요."); }
      if (!data?.ok) {
        const error = new Error(data?.message || errorMessages[data?.error] || data?.error || "요청 실패");
        error.code = data?.error || "REQUEST_FAILED";
        error.data = data;
        throw error;
      }
      return data;
    }
    throw lastNetworkError || new Error("서버에 연결하지 못했습니다.");
  }

  return {
    async login(username, password) {
      const data = await post({ mode: "login", username, password });
      return { user_id: data.user_id, username, nickname: data.nickname || username };
    },
    async signup(username, password, nickname) {
      const data = await post({ mode: "signup", username, password, nickname });
      return { user_id: data.user_id, username, nickname: data.nickname || nickname || username, coin: Number(data.coin) || 0, coinAccountCreated: data.coin_account_created === true };
    },
    async coinStatus(user_id) {
      const data = await post({ mode: "coin_status", user_id });
      return data.coin ?? data.balance ?? 0;
    },
    async adminUnlock(userId, adminCode) {
      return post({ mode: "admin_unlock", user_id: userId, admin_code: adminCode }, 7000);
    },
    async shopCatalog() {
      const data = await post({ mode: "shop_catalog" }, 7000);
      return Array.isArray(data.products) ? data.products : [];
    },
    async userDirectory(userId) {
      const data = await post({ mode: "user_directory", user_id: userId }, 7000);
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
        quantity: product.quantity === null || product.quantity === undefined ? "" : product.quantity,
        image_data: product.imageUrl || ""
      }, 7000);
    },
    async shopDeleteProduct(userId, adminToken, productId) {
      return post({
        mode: "shop_product_delete",
        user_id: userId,
        admin_token: adminToken,
        product_id: productId
      }, 7000);
    },
    /*
     * 서버는 상품 ID·가격을 다시 검증하고 코인 차감과 구매 키 중복 검사를
     * 한 트랜잭션으로 처리해야 합니다. 미지원 서버에서는 명확한 오류를 반환합니다.
     */
    async shopPurchase({ userId, product, purchaseKey, randomPurchase = false, price = 0 }) {
      return post({
        mode: "shop_purchase",
        user_id: userId,
        random_purchase: randomPurchase ? "1" : "",
        product_id: product?.id || "",
        price: randomPurchase ? Number(price || 5) : product?.price,
        expected_name: product?.name || "",
        expected_description: product?.description || "",
        expected_updated_at: product?.updatedAt || 0,
        purchase_key: purchaseKey
      }, 7000);
    },
    async shopInventory(userId) {
      const data = await post({ mode: "shop_inventory", user_id: userId }, 7000);
      return Array.isArray(data.items) ? data.items : [];
    },
    async shopGift({ userId, nickname, targetId, inventoryId, item, requestId }) {
      return post({ mode: "shop_gift", user_id: userId, nickname, target_user_id: targetId, inventory_id: inventoryId, item_json: JSON.stringify(item || {}), request_id: requestId || "" }, 7000);
    },
    async shopUse({ userId, inventoryId, item }) {
      return post({ mode: "shop_use", user_id: userId, inventory_id: inventoryId, item_json: JSON.stringify(item || {}) }, 7000);
    },
    async shopRequestDelivery({ userId, inventoryId, item, requestId }) {
      return post({ mode: "shop_request_delivery", user_id: userId, inventory_id: inventoryId, item_json: JSON.stringify(item || {}), request_id: requestId || "" }, 7000);
    },
    async shopRequestDeliveryBulk({ userId, inventoryIds, requestId }) {
      return post({ mode: "shop_request_delivery_bulk", user_id: userId, inventory_ids_json: JSON.stringify(inventoryIds || []), request_id: requestId || "" }, 7000);
    },
    async shopDeliveryList(userId, adminToken) {
      const data = await post({ mode: "shop_delivery_list", user_id: userId, admin_token: adminToken }, 7000);
      return Array.isArray(data.deliveries) ? data.deliveries : [];
    },
    async shopDeliveryShipping({ userId, adminToken, ownerId, inventoryId }) {
      return post({ mode: "shop_delivery_shipping", user_id: userId, admin_token: adminToken, owner_id: ownerId, inventory_id: inventoryId }, 7000);
    },
    async shopDeliveryComplete({ userId, adminToken, ownerId, inventoryId }) {
      return post({ mode: "shop_delivery_complete", user_id: userId, admin_token: adminToken, owner_id: ownerId, inventory_id: inventoryId }, 7000);
    },
    async shopDeliveryCompleteBulk({ userId, adminToken, targets }) {
      return post({ mode: "shop_delivery_complete_bulk", user_id: userId, admin_token: adminToken, targets_json: JSON.stringify(targets || []) }, 7000);
    },
    async shopDeliveryCancel({ userId, adminToken, ownerId, inventoryId }) {
      return post({ mode: "shop_delivery_cancel", user_id: userId, admin_token: adminToken, owner_id: ownerId, inventory_id: inventoryId }, 7000);
    },
    async adminDispatch({ userId, adminToken, targets, type, payload, requestId }) {
      return post({
        mode: "admin_dispatch",
        user_id: userId,
        admin_token: adminToken,
        targets_json: JSON.stringify(targets || []),
        command_type: type,
        payload_json: JSON.stringify(payload || {}),
        request_id: requestId || ""
      }, 7000);
    },
    async adminCoinReward({ userId, adminToken, targets, amount, reason, requestId }) {
      return post({
        mode: "admin_coin_reward",
        user_id: userId,
        admin_token: adminToken,
        targets_json: JSON.stringify(targets || []),
        amount,
        reason: reason || "관리자 보상",
        request_id: requestId || ""
      }, 7000);
    },
    async adminUserBalances(userId, adminToken) {
      const data = await post({ mode: "admin_user_balances", user_id: userId, admin_token: adminToken }, 7000);
      return Array.isArray(data.users) ? data.users : [];
    },
    async adminTaskAssign({ userId, adminToken, targets, title, description, rewardCoin, requestId }) {
      return post({ mode: "admin_task_assign", user_id: userId, admin_token: adminToken, targets_json: JSON.stringify(targets || []), title, description, reward_coin: rewardCoin, request_id: requestId || "" }, 7000);
    },
    async adminTaskList(userId, adminToken) {
      const data = await post({ mode: "admin_task_list", user_id: userId, admin_token: adminToken }, 7000);
      return Array.isArray(data.tasks) ? data.tasks : [];
    },
    async adminTaskReview({ userId, adminToken, taskId, action, feedback }) {
      return post({ mode: "admin_task_review", user_id: userId, admin_token: adminToken, task_id: taskId, action, feedback }, 7000);
    },
    async adminTaskBulkReview({ userId, adminToken, taskIds, action = "complete", feedback = "" }) {
      return post({ mode: "admin_task_bulk_review", user_id: userId, admin_token: adminToken, task_ids_json: JSON.stringify(taskIds || []), action, feedback }, 7000);
    },
    async adminTaskBulkDelete({ userId, adminToken, taskIds }) {
      return post({ mode: "admin_task_bulk_delete", user_id: userId, admin_token: adminToken, task_ids_json: JSON.stringify(taskIds || []) }, 7000);
    },
    async adminMoaLearningStatus(userId, adminToken) {
      return post({ mode: "moa_admin_learning_status", user_id: userId, admin_token: adminToken });
    },
    async adminMoaLearnChats({ userId, adminToken, reset = false, batchLimit = 260, cleanup = false }) {
      return post({ mode: "moa_admin_learn_chats", user_id: userId, admin_token: adminToken, reset: reset ? "1" : "", cleanup: cleanup ? "1" : "", batch_limit: batchLimit }, 45000);
    },
    async userTaskList(userId) {
      const data = await post({ mode: "user_task_list", user_id: userId });
      return Array.isArray(data.tasks) ? data.tasks : [];
    },
    async userTaskSubmit({ userId, taskId, answer, imageData }) {
      return post({ mode: "user_task_submit", user_id: userId, task_id: taskId, answer, image_data: imageData || "" });
    },
    async userCommands(userId, ackIds = []) {
      const data = await post({ mode: "user_commands", user_id: userId, ack_ids: (ackIds || []).join(",") });
      return Array.isArray(data.commands) ? data.commands : [];
    },
    /* MOA_CHAT_INTEGRATION_START
       MOA ownership: personal memory/style stays local.
       Apps Script receives public policy feedback and search requests only. */
    async moaSync(userId, knownVersion = 0, knownCoreVersion = 0) {
      return post({ mode: "moa_sync", user_id: userId, known_version: Number(knownVersion || 0), known_core_version: Number(knownCoreVersion || 0), client_caps: "delta-v1" });
    },
    async moaCommit({ userId, events = [] }) {
      return post({
        mode: "moa_commit",
        user_id: userId,
        events_json: JSON.stringify(events || [])
      });
    },
    async moaSearch({ userId, text, query = "", context = [] }) {
      return post({ mode: "moa_search", user_id: userId, text, query, context_json: JSON.stringify(context || []) });
    }
    /* MOA_CHAT_INTEGRATION_END */
  };
})();
