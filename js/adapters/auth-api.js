/* 토리 Apps Script 인증·코인·구매 규격 어댑터입니다. */
MiniTalk.AuthApi = (() => {
  function balanceValue(raw) {
    return (typeof raw === "number" || typeof raw === "string") && String(raw).trim() !== "" && Number.isSafeInteger(Number(raw)) ? Number(raw) : null;
  }
  const errorMessages = {
    NO_REWARD_USER: "보상 시트에서 코인 계정을 찾을 수 없습니다. 관리자에게 계정 확인을 요청해주세요.",
    INVALID_REWARD_COIN: "보상 시트의 코인 값이 올바르지 않습니다. 기존 잔액을 유지합니다.",
    DUPLICATE_REWARD_USER: "보상 시트에 중복 사용자 행이 있습니다. 원장 확인이 필요합니다.",
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
  // 읽기 요청만 자동 재시도합니다. 변경 요청은 기능별 동일 request_id 복구 경로를 사용합니다.
  const READ_MODES = new Set(["login","coin_status","shop_catalog","user_directory","shop_inventory","shop_delivery_list","admin_user_balances","admin_task_list","user_task_list","moa_admin_learning_status","moa_sync"]);
  async function post(payload, timeoutMs = 20000) {
    const body = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => body.set(key, String(value ?? "")));
    const retryable = READ_MODES.has(payload.mode) || (payload.mode === "user_commands" && !payload.ack_ids);
    const startedAt = Date.now(), totalBudgetMs = Math.min(60000, Math.max(1000, Number(timeoutMs || 30000))), deadline = Date.now() + totalBudgetMs;
    let attempt = 0, outcome = "error";
    const timeoutFailure = () => { const error = new Error(`서버 응답이 ${Math.round(totalBudgetMs / 1000)}초를 넘겼습니다. 처리 결과를 다시 확인해주세요.`); error.code = "REQUEST_TIMEOUT"; return error; };
    try {
      for (; attempt < (retryable ? 2 : 1); attempt += 1) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw timeoutFailure();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remaining);
        try {
          const response = await fetch(MiniTalkConfig.sheetUrl, {method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body,signal:controller.signal});
          if (!response.ok) { const error = new Error(`서버 오류 ${response.status}`); error.retryable = [404,429,500,502,503,504].includes(response.status); throw error; }
          const data = await response.json();
          if (!data?.ok) { const error = new Error(data?.message || errorMessages[data?.error] || data?.error || "요청 실패"); error.code = data?.error || "REQUEST_FAILED"; error.data = data; throw error; }
          outcome = "ok"; return data;
        } catch (error) {
          if (controller.signal.aborted || error?.name === "AbortError") throw timeoutFailure();
          if (!retryable || attempt > 0 || !(error instanceof TypeError || error.retryable) || deadline - Date.now() <= 500) throw error;
        } finally { clearTimeout(timer); }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    } finally {
      // 사용자 ID·비밀번호·토큰을 기록하지 않고 모드별 왕복시간만 측정합니다.
      console.info("SHEET_REQUEST", {mode:payload.mode,elapsedMs:Date.now()-startedAt,attempts:attempt+1,outcome});
    }
  }

  return {
    balanceValue,
    async login(username, password) {
      const data = await post({ mode: "login", username, password });
      const coin = data.coin !== undefined ? balanceValue(data.coin) : null;
      return { user_id: data.user_id, username, nickname: data.nickname || username, ...(coin !== null ? { coin } : {}) };
    },
    async signup(username, password, nickname) {
      const data = await post({ mode: "signup", username, password, nickname });
      return { user_id: data.user_id, username, nickname: data.nickname || nickname || username, coin: balanceValue(data.coin), coinAccountCreated: data.coin_account_created === true };
    },
    async coinStatus(user_id) {
      const data = await post({ mode: "coin_status", user_id });
      const raw = data.coin ?? data.balance;
      const amount = balanceValue(raw);
      if (amount === null) {
        const error = new Error("코인 잔액을 확인하지 못했습니다.");
        error.code = "INVALID_COIN_STATUS";
        throw error;
      }
      return Math.floor(amount);
    },
    async economySheetSync({ userId, event }) {
      return post({ mode: "economy_sheet_sync", user_id: userId, event_json: JSON.stringify(event || {}) }, 15000);
    },
    async adminUnlock(userId, adminCode) {
      return post({ mode: "admin_unlock", user_id: userId, admin_code: adminCode }, 30000);
    },
    async shopCatalog() {
      const data = await post({ mode: "shop_catalog" }, 30000);
      return Array.isArray(data.products) ? data.products : [];
    },
    async userDirectory(userId) {
      const data = await post({ mode: "user_directory", user_id: userId }, 30000);
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
      }, 30000);
    },
    async shopDeleteProduct(userId, adminToken, productId) {
      return post({
        mode: "shop_product_delete",
        user_id: userId,
        admin_token: adminToken,
        product_id: productId
      }, 30000);
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
      }, 30000);
    },
    async shopInventory(userId) {
      const data = await post({ mode: "shop_inventory", user_id: userId }, 30000);
      return Array.isArray(data.items) ? data.items : [];
    },
    async shopGift({ userId, nickname, targetId, inventoryId, item, requestId }) {
      return post({ mode: "shop_gift", user_id: userId, nickname, target_user_id: targetId, inventory_id: inventoryId, item_json: JSON.stringify(item || {}), request_id: requestId || "" }, 30000);
    },
    async shopUse({ userId, inventoryId, item }) {
      return post({ mode: "shop_use", user_id: userId, inventory_id: inventoryId, item_json: JSON.stringify(item || {}) }, 30000);
    },
    async shopRequestDelivery({ userId, inventoryId, item, requestId }) {
      return post({ mode: "shop_request_delivery", user_id: userId, inventory_id: inventoryId, item_json: JSON.stringify(item || {}), request_id: requestId || "" }, 30000);
    },
    async shopRequestDeliveryBulk({ userId, inventoryIds, requestId }) {
      return post({ mode: "shop_request_delivery_bulk", user_id: userId, inventory_ids_json: JSON.stringify(inventoryIds || []), request_id: requestId || "" }, 10000);
    },
    async shopDeliveryList(userId, adminToken) {
      const data = await post({ mode: "shop_delivery_list", user_id: userId, admin_token: adminToken }, 30000);
      return Array.isArray(data.deliveries) ? data.deliveries : [];
    },
    async shopDeliveryShipping({ userId, adminToken, ownerId, inventoryId }) {
      return post({ mode: "shop_delivery_shipping", user_id: userId, admin_token: adminToken, owner_id: ownerId, inventory_id: inventoryId }, 30000);
    },
    async shopDeliveryComplete({ userId, adminToken, ownerId, inventoryId }) {
      return post({ mode: "shop_delivery_complete", user_id: userId, admin_token: adminToken, owner_id: ownerId, inventory_id: inventoryId }, 10000);
    },
    async shopDeliveryCompleteBulk({ userId, adminToken, targets }) {
      return post({ mode: "shop_delivery_complete_bulk", user_id: userId, admin_token: adminToken, targets_json: JSON.stringify(targets || []) }, 10000);
    },
    async shopDeliveryCancel({ userId, adminToken, ownerId, inventoryId }) {
      return post({ mode: "shop_delivery_cancel", user_id: userId, admin_token: adminToken, owner_id: ownerId, inventory_id: inventoryId }, 30000);
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
      }, 30000);
    },
    async adminCoinReward({ userId, adminToken, targets, amount, reason, requestId }) {
      // 관리자 대량 코인 변경은 10초를 넘길 수 있으므로 상태조회용 별도 API를 호출하지 않습니다.
      // 호출이 끝날 때까지 관리자 전송 버튼을 잠가 중복 클릭을 막고, 최대 30초까지 원 요청의 응답을 기다립니다.
      return post({
        mode: "admin_coin_reward",
        user_id: userId,
        admin_token: adminToken,
        targets_json: JSON.stringify(targets || []),
        amount,
        reason: reason || "관리자 보상",
        request_id: requestId || ""
      }, 30000);
    },
    async adminUserBalances(userId, adminToken) {
      const data = await post({ mode: "admin_user_balances", user_id: userId, admin_token: adminToken }, 30000);
      return Array.isArray(data.users) ? data.users : [];
    },
    async adminTaskAssign({ userId, adminToken, targets, title, description, rewardCoin, requestId }) {
      return post({ mode: "admin_task_assign", user_id: userId, admin_token: adminToken, targets_json: JSON.stringify(targets || []), title, description, reward_coin: rewardCoin, request_id: requestId || "" }, 30000);
    },
    async adminTaskList(userId, adminToken) {
      const data = await post({ mode: "admin_task_list", user_id: userId, admin_token: adminToken }, 10000);
      return Array.isArray(data.tasks) ? data.tasks : [];
    },
    async adminTaskReview({ userId, adminToken, taskId, action, feedback, firebaseMode = false, firebaseReward = null }) {
      return post({ mode: "admin_task_review", user_id: userId, admin_token: adminToken, task_id: taskId, action, feedback, firebase_mode: firebaseMode ? "1" : "0", firebase_reward_json: JSON.stringify(firebaseReward || {}) }, 30000);
    },
    async adminTaskBulkReview({ userId, adminToken, taskIds, action = "complete", feedback = "", firebaseMode = false, firebaseRewards = null }) {
      return post({ mode: "admin_task_bulk_review", user_id: userId, admin_token: adminToken, task_ids_json: JSON.stringify(taskIds || []), action, feedback, firebase_mode: firebaseMode ? "1" : "0", firebase_rewards_json: JSON.stringify(firebaseRewards || {}) }, 30000);
    },
    async adminTaskBulkDelete({ userId, adminToken, taskIds }) {
      return post({ mode: "admin_task_bulk_delete", user_id: userId, admin_token: adminToken, task_ids_json: JSON.stringify(taskIds || []) }, 30000);
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
      return {
        commands: Array.isArray(data.commands) ? data.commands : [],
        coin: balanceValue(data.coin)
      };
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
