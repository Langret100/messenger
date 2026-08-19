/* 쇼핑 탭: 관리자 상품 카탈로그와 사용자 보관함을 표시합니다. */
MiniTalk.Features.Shopping = (() => {
  const Service = MiniTalk.Shopping.StoreService;
  let inventoryOpen = false, refreshTimer = 0;

  MiniTalk.Events.on("state:shopCatalog", refreshVisible);
  MiniTalk.Events.on("state:shopInventory", refreshVisible);

  function refreshVisible() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = 0;
      const route = MiniTalk.Store.get("route"), host = MiniTalk.UI.Dom.byId("viewHost");
      if (route === "shopping" && host) patchVisible(host);
    }, 140);
  }

  function patchVisible(host) {
    const D = MiniTalk.UI.Dom, screen = host.querySelector(".shopping-screen"), view = host.querySelector(".shopping-view");
    if (!screen || !view) return render(host, { animate: false, preserveScroll: true, refreshCatalog: false });
    const user = MiniTalk.Store.get("user") || {}, products = Service.products(), owned = user.isGuest ? [] : Service.inventory(), scrollTop = screen.scrollTop;
    screen.querySelector(".shop-market-hero")?.replaceWith(shopHero(products.length, user.isGuest));
    const catalog = screen.querySelector(".shop-product-grid");
    if (catalog) {
      catalog.classList.toggle("is-empty", !products.length);
      catalog.replaceChildren(...(products.length ? products.map(product => productCard(product, user.isGuest)) : [marketEmpty()]));
    }
    const oldPanel = view.querySelector(".shop-inventory-panel");
    if (inventoryOpen) {
      const panel = inventoryPanel(user, owned, () => { inventoryOpen = false;render(host); });
      oldPanel ? oldPanel.replaceWith(panel) : view.insertBefore(panel, view.querySelector(".shop-inventory-fab"));
    } else oldPanel?.remove();
    const button = D.el("button", { class: `shop-inventory-fab${inventoryOpen ? " active" : ""}`, type: "button", "aria-expanded": String(inventoryOpen), "aria-label": inventoryOpen ? "보관함 닫기" : "보관함 열기", onclick: () => { inventoryOpen = !inventoryOpen;render(host); } }, [D.el("small", { text: "보관함" }), owned.length ? D.el("b", { text: String(owned.length) }) : null].filter(Boolean));
    const oldButton = view.querySelector(".shop-inventory-fab");oldButton ? oldButton.replaceWith(button) : view.append(button);
    screen.scrollTop = scrollTop;
  }

  async function render(host, options = {}) {
    const D = MiniTalk.UI.Dom, user = MiniTalk.Store.get("user") || {};
    const previousScroll = options.preserveScroll ? Number(host.querySelector(".shopping-screen")?.scrollTop || 0) : 0;
    if (options.refreshCatalog !== false) await Service.enter();
    MiniTalk.UI.Shell.setHeader("쇼핑", [MiniTalk.Economy.CoinWallet.badge({ header: true })]);
    const view = D.el("section", { class: `view utility-view shopping-view${options.animate === false ? "" : " view-enter"}` });
    const wrap = D.el("div", { class: "card-list shopping-screen" });
    const products = Service.products();
    wrap.append(shopHero(products.length, user.isGuest));
    const catalog = D.el("div", { class: `shop-product-grid${products.length ? "" : " is-empty"}` });
    if (!products.length) catalog.append(marketEmpty());
    products.forEach(product => catalog.append(productCard(product, user.isGuest)));
    wrap.append(catalog);

    const owned = user.isGuest ? [] : Service.inventory();
    const inventoryButton = D.el("button", {
      class: `shop-inventory-fab${inventoryOpen ? " active" : ""}`,
      type: "button",
      "aria-expanded": String(inventoryOpen),
      "aria-label": inventoryOpen ? "보관함 닫기" : "보관함 열기",
      onclick: () => { inventoryOpen = !inventoryOpen; render(host); }
    }, [D.el("small", { text: "보관함" }), owned.length ? D.el("b", { text: String(owned.length) }) : null].filter(Boolean));

    view.append(wrap);
    if (inventoryOpen) view.append(inventoryPanel(user, owned, () => { inventoryOpen = false; render(host); }));
    view.append(inventoryButton);
    host.replaceChildren(view);
    if (previousScroll > 0) wrap.scrollTop = previousScroll;
  }

  function shopHero(count, guest) {
    const D = MiniTalk.UI.Dom;
    return D.el("section", { class: "shop-market-hero" }, [
      D.el("span", { class: "shop-market-mark", text: "◇" }),
      D.el("div", { class: "shop-market-copy" }, [D.el("strong", { text: "미니 상점" }), D.el("small", { text: guest ? "로그인하고 코인으로 상품을 만나보세요" : "모은 코인으로 원하는 상품을 골라보세요" })]),
      D.el("span", { class: "shop-market-count", text: count ? `${count}개 상품` : "준비 중" })
    ]);
  }

  function marketEmpty() {
    const D = MiniTalk.UI.Dom;
    return D.el("section", { class: "shop-market-empty" }, [
      D.el("div", { class: "shop-empty-illustration", "aria-hidden": "true" }, [D.el("span", { text: "◇" }), D.el("i", { text: "+" })]),
      D.el("strong", { text: "상점을 준비하고 있어요" })
    ]);
  }

  function inventoryPanel(user, owned, close) {
    const D = MiniTalk.UI.Dom;
    const panel = D.el("aside", { class: "shop-inventory-panel", "aria-label": "보관함" });
    const closeButton = D.el("button", { class: "icon-button subtle modal-close-button", type: "button", text: "×", "aria-label": "보관함 닫기", onclick: close });
    panel.append(D.el("header", {}, [D.el("div", {}, [D.el("strong", { text: "보관함" }), D.el("small", { class: "muted", text: user.isGuest ? "로그인 후 이용할 수 있어요" : `보관 상품 ${owned.length}개` })]), closeButton]));
    const inventory = D.el("div", { class: "shop-inventory-list" });
    if (!owned.length) inventory.append(empty(user.isGuest ? "로그인이 필요해요" : "보관함이 비어 있어요", user.isGuest ? "로그인하면 구매한 상품을 확인할 수 있어요." : "구매한 상품과 받은 선물이 여기에 모입니다."));
    owned.forEach(item => inventory.append(inventoryCard(item)));
    panel.append(inventory);
    return panel;
  }

  function empty(title, subtitle) {
    const D = MiniTalk.UI.Dom;
    return D.el("div", { class: "empty-state compact-empty" }, [D.el("span", { text: "▤" }), D.el("strong", { text: title }), D.el("small", { class: "muted", text: subtitle })]);
  }


  function coinAmount(value, className="coin-amount") {
    const D = MiniTalk.UI.Dom;
    return D.el("span", { class: className, "aria-label": `${Number(value)||0}코인` }, [
      D.el("img", { src: "assets/ui/notebook-coin.svg", alt: "" }),
      D.el("b", { text: String(Number(value)||0) })
    ]);
  }

  function productCard(product, guest) {
    const D = MiniTalk.UI.Dom;
    return D.el("button", { class: "shop-product-card", type: "button", onclick: () => guest ? MiniTalk.UI.Shell.toast("로그인 후 구매할 수 있어요.") : openPurchase(product) }, [
      product.imageUrl ? D.el("img", { class: "shop-product-image", src: product.imageUrl, alt: "", loading: "lazy" }) : D.el("span", { class: "shop-product-icon", text: "▤" }),
      D.el("span", { class: "shop-product-copy" }, [D.el("strong", { text: product.name }), D.el("small", { class: "muted", text: product.description || "설명 없음" })]),
      coinAmount(product.price, "shop-price coin-amount")
    ]);
  }

  function openPurchase(product) {
    const D = MiniTalk.UI.Dom, body = D.el("div", { class: "modal-stack purchase-confirm" });
    const confirm = D.el("button", { class: "button primary purchase-confirm-button", type: "button" }, [coinAmount(product.price, "coin-amount button-coin"), D.el("span", { text: "으로 구매" })]);
    confirm.onclick = async () => {
      confirm.disabled = true;
      try { await Service.purchase(product); MiniTalk.UI.Shell.closeModal(); MiniTalk.UI.Shell.toast(`${product.name}을(를) 구매했습니다.`); }
      catch (error) {
        if (error.productChanged) {
          MiniTalk.UI.Shell.closeModal();
          refreshVisible();
        } else confirm.disabled = false;
        MiniTalk.UI.Shell.toast(error.message);
      }
    };
    body.append(D.el("div", { class: "purchase-product" }, [product.imageUrl ? D.el("img", { class: "purchase-product-image", src: product.imageUrl, alt: product.name }) : null, D.el("strong", { text: product.name }), D.el("p", { class: "muted", text: product.description || "상품 설명이 없습니다." }), coinAmount(product.price, "coin-amount purchase-price")].filter(Boolean)), D.el("p", { text: "이 상품을 구매하시겠습니까?" }), confirm);
    MiniTalk.UI.Shell.modal("구매 확인", body);
  }

  function inventoryCard(item) {
    const D = MiniTalk.UI.Dom, used = Boolean(item.usedAt);
    const actions = D.el("div", { class: "shop-inventory-actions" });
    if (!used) {
      const giftButton = D.el("button", { class: "button secondary compact-button", type: "button", text: "선물", onclick: () => openGift(item) });
      const useButton = D.el("button", { class: "button primary compact-button", type: "button", text: "사용" });
      useButton.onclick = () => useItem(item, useButton);
      actions.append(giftButton, useButton);
    }
    return D.el("article", { class: `shop-inventory-item${used ? " used" : ""}` }, [
      item.imageUrl ? D.el("img", { class: "shop-inventory-image", src: item.imageUrl, alt: "", loading: "lazy" }) : null,
      D.el("div", { class: "shop-inventory-copy" }, [
        D.el("strong", { text: item.name || "상품" }),
        D.el("small", { class: "muted", text: used ? `사용됨 · ${Service.usedRemainingDays(item)}일 후 사라짐` : item.giftedByNickname ? `${item.giftedByNickname}님이 보낸 선물` : item.description || "사용 가능" })
      ]), actions
    ].filter(Boolean));
  }

  async function useItem(item, button) {
    if (button?.disabled) return;
    if (button) { button.disabled = true;button.textContent = "처리 중"; }
    try { await Service.use(item.id); MiniTalk.UI.Shell.toast(`${item.name}을(를) 사용했습니다.`); }
    catch (error) { MiniTalk.UI.Shell.toast(error.message || "상품을 사용하지 못했습니다.");if (button?.isConnected) { button.disabled = false;button.textContent = "사용"; } }
  }

  async function openGift(item) {
    const D = MiniTalk.UI.Dom, body = D.el("div", { class: "modal-stack" }, [D.el("p", { class: "muted modal-note", text: "가입자 닉네임 명단을 불러오는 중입니다." })]);
    MiniTalk.UI.Shell.modal("선물하기", body);
    try { await MiniTalk.UserDirectory.refresh(); } catch (error) { body.replaceChildren(empty("가입자 명단을 불러오지 못했어요", error.message || "Apps Script 배포 상태를 확인하세요."));return; }
    const users = Service.recipients(), search = D.el("input", { class: "search", placeholder: "닉네임 검색", "aria-label": "선물할 사용자 검색" }), list = D.el("div", { class: "gift-user-list" });
    let selected = "";
    const draw = () => { const q = search.value.trim().toLowerCase(), shown = users.filter(row => row.nickname.toLowerCase().includes(q));list.replaceChildren(...shown.map(row => { const radio = D.el("input", { type: "radio", name: "giftTarget", value: row.user_id, "aria-label": `${row.nickname} 선택` });radio.checked = selected === row.user_id;radio.onchange = () => { selected = row.user_id;draw(); };return D.el("label", { class: `gift-user-option${selected === row.user_id ? " selected" : ""}` }, [D.el("span", { class: "gift-user-avatar", text: row.nickname.slice(0, 1) }), D.el("strong", { text: row.nickname }), radio]); }));if (!shown.length) list.append(empty("검색 결과가 없어요", "다른 닉네임으로 검색해보세요.")); };
    const send = D.el("button", { class: "button primary", type: "button", text: "선물 보내기" });
    send.onclick = async () => { if (!selected) return MiniTalk.UI.Shell.toast("사용자를 선택하세요.");send.disabled = true;try { const result = await Service.gift(item.id, selected);MiniTalk.UI.Shell.closeModal();MiniTalk.UI.Shell.toast(`${result.targetNickname}님에게 선물했습니다.`); } catch (error) { MiniTalk.UI.Shell.toast(error.message);send.disabled = false; } };
    search.oninput = draw;body.replaceChildren(D.el("p", { text: `${item.name}을(를) 누구에게 선물할까요?` }), search, list, send);draw();setTimeout(() => search.focus(), 30);
  }

  function adminPanel(onChanged, context = {}) {
    const D = context.Dom || MiniTalk.UI.Dom, Shell = context.Shell || MiniTalk.UI.Shell, panel = D.el("section", { class: "tool-card admin-shop-panel" });
    if (!Service.products().length) Service.refreshCatalog().then(rows => { if (rows.length) onChanged?.(); }).catch(error => console.warn("상품 목록을 불러오지 못했습니다.", error));
    const add = D.el("button", { class: "button primary compact-button", type: "button", text: "상품 추가", onclick: () => openProductEditor(null, onChanged, { D, Shell }) });
    panel.append(D.el("div", { class: "admin-shop-head" }, [D.el("div", {}, [D.el("strong", { text: "쇼핑 상품 관리" }), D.el("small", { class: "muted", text: "상품 이름·가격·설명을 설정합니다." })]), add]));
    const list = D.el("div", { class: "admin-product-list" });
    const products = Service.products();
    if (!products.length) list.append(empty("등록된 상품이 없어요", "상품 추가 버튼으로 첫 상품을 등록하세요."));
    products.forEach(product => list.append(D.el("article", { class: "admin-product-row" }, [
      product.imageUrl ? D.el("img", { class: "admin-product-image", src: product.imageUrl, alt: "", loading: "lazy" }) : D.el("span", { class: "admin-product-image placeholder", text: "▤" }),
      D.el("div", {}, [D.el("strong", { text: product.name }), D.el("small", { class: "muted admin-product-meta" }, [coinAmount(product.price, "coin-amount inline-coin"), D.el("span", { text: ` · ${product.description || "설명 없음"}` })])]),
      D.el("div", { class: "button-row compact-row" }, [D.el("button", { class: "button secondary compact-button", type: "button", text: "수정", onclick: () => openProductEditor(product, onChanged, { D, Shell }) }), D.el("button", { class: "button secondary compact-button", type: "button", text: "삭제", onclick: () => deleteProduct(product, onChanged, { D, Shell }) })])
    ])));
    panel.append(list);return panel;
  }

  function openProductEditor(product, onChanged, context = {}) {
    const D = context.D || MiniTalk.UI.Dom, Shell = context.Shell || MiniTalk.UI.Shell, body = D.el("div", { class: "modal-stack" });
    body.innerHTML = `<button id="productImagePicker" class="product-image-picker" type="button" aria-label="상품 이미지 촬영 또는 선택"><span>▤</span><strong>상품 이미지</strong><small>눌러서 촬영하거나 선택하세요</small></button><div id="productImageActions" class="product-image-actions hidden"><button id="productCamera" class="button secondary compact-button" type="button">카메라로 촬영</button><button id="productGallery" class="button secondary compact-button" type="button">이미지 선택</button><button id="productImageRemove" class="button text compact-button" type="button">이미지 제거</button></div><input id="productCameraInput" class="hidden" type="file" accept="image/*" capture="environment"><input id="productGalleryInput" class="hidden" type="file" accept="image/png,image/jpeg,image/webp"><p class="muted modal-note">사진은 실제 표시 크기에 맞는 160×120 이미지로 자동 압축됩니다.</p><label class="field">상품 이름<input id="productName" maxlength="60"></label><label class="field">가격<input id="productPrice" type="number" min="1" step="1"></label><label class="field">설명<textarea id="productDescription" maxlength="160"></textarea></label><button id="productSave" class="button primary" type="button">저장</button>`;
    const picker = body.querySelector("#productImagePicker"), actions = body.querySelector("#productImageActions"), cameraInput = body.querySelector("#productCameraInput"), galleryInput = body.querySelector("#productGalleryInput");
    let imageUrl = product?.imageUrl || "", pendingImage = "";
    const updatePreview = value => { picker.style.backgroundImage = value ? `url("${value}")` : "";picker.classList.toggle("has-image", Boolean(value));picker.querySelector("span").textContent = value ? "" : "▤";picker.querySelector("strong").textContent = value ? "이미지 변경" : "상품 이미지"; };
    updatePreview(imageUrl);
    picker.onclick = () => actions.classList.toggle("hidden");
    body.querySelector("#productCamera").onclick = () => cameraInput.click();
    body.querySelector("#productGallery").onclick = () => galleryInput.click();
    body.querySelector("#productImageRemove").onclick = () => { imageUrl = "";pendingImage = "";updatePreview("");actions.classList.add("hidden"); };
    const chooseImage = async input => { const file = input.files?.[0];if (!file) return;actions.classList.add("hidden");picker.disabled = true;try { pendingImage = await compressProductImage(file);updatePreview(pendingImage); } catch (error) { Shell.toast(error.message); } finally { picker.disabled = false;input.value = ""; } };
    cameraInput.onchange = () => chooseImage(cameraInput);galleryInput.onchange = () => chooseImage(galleryInput);
    body.querySelector("#productName").value = product?.name || "";body.querySelector("#productPrice").value = product?.price || "";body.querySelector("#productDescription").value = product?.description || "";
    body.querySelector("#productSave").onclick = async event => { const button = event.currentTarget,name = body.querySelector("#productName").value.trim(),price = body.querySelector("#productPrice").value,description = body.querySelector("#productDescription").value;button.disabled = true;try { if (pendingImage) imageUrl = pendingImage;await Service.saveProduct({ id: product?.id, name, price, description, imageUrl });Shell.closeModal();Shell.toast("상품을 저장했습니다.");onChanged?.(); } catch (error) { Shell.toast(error.message);button.disabled = false; } };
    Shell.modal(product ? "상품 수정" : "상품 추가", body);
  }

  function compressProductImage(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type?.startsWith("image/")) return reject(new Error("사진 또는 이미지 파일을 선택하세요."));
      if (file.size > 12 * 1024 * 1024) return reject(new Error("12MB 이하 이미지를 선택하세요."));
      const objectUrl = URL.createObjectURL(file), image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas"), width = 160, height = 120;
          const sourceRatio = image.width / image.height, targetRatio = width / height;
          let sx = 0, sy = 0, sw = image.width, sh = image.height;
          if (sourceRatio > targetRatio) { sw = image.height * targetRatio; sx = (image.width - sw) / 2; }
          else { sh = image.width / targetRatio; sy = (image.height - sh) / 2; }
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
          let quality = .62, data = canvas.toDataURL("image/webp", quality);
          const type = data.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
          if (type === "image/jpeg") data = canvas.toDataURL(type, quality);
          while (data.length > 6900 && quality > .20) { quality -= .08; data = canvas.toDataURL(type, quality); }
          URL.revokeObjectURL(objectUrl);
          if (data.length > 7200) return reject(new Error("서버 저장 크기에 맞게 사진을 압축하지 못했습니다."));
          resolve(data);
        } catch (error) { URL.revokeObjectURL(objectUrl); reject(error); }
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl);reject(new Error("이미지를 불러오지 못했습니다.")); };
      image.src = objectUrl;
    });
  }

  function deleteProduct(product, onChanged, context = {}) {
    const D = context.D || MiniTalk.UI.Dom, Shell = context.Shell || MiniTalk.UI.Shell, body = D.el("div", { class: "modal-stack" }), remove = D.el("button", { class: "button primary", type: "button", text: "삭제" });
    remove.onclick = async () => { remove.disabled = true;try { await Service.deleteProduct(product.id);Shell.closeModal();Shell.toast("상품을 삭제했습니다.");onChanged?.(); } catch (error) { Shell.toast(error.message);remove.disabled = false; } };
    body.append(D.el("p", { text: `${product.name} 상품을 삭제할까요?` }), D.el("small", { class: "muted", text: "이미 구매한 사용자의 보관함 상품은 유지됩니다." }), remove);Shell.modal("상품 삭제", body);
  }

  function leave(){inventoryOpen=false;clearTimeout(refreshTimer);refreshTimer=0;Service.leave?.()}
  return { id: "shopping", title: "쇼핑", icon: "▤", render, leave, adminPanel };
})();
MiniTalk.Registry.register(MiniTalk.Features.Shopping);
