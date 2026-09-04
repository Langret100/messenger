/* 상품 카탈로그·구매·보관함·선물의 서버 동기화를 UI에서 분리합니다. */
MiniTalk.Shopping = MiniTalk.Shopping || {};
MiniTalk.Shopping.StoreService = (() => {
  const USED_VISIBLE_MS = 7 * 24 * 60 * 60 * 1000;
  const CATALOG_CACHE_KEY = "shop.catalog.cache.v2";
  const objectValue = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  let catalogPromise = null, catalogLoadedAt = 0, inventoryPromise = null, activeUserId = "", inventoryVersion = 0, shopActive = false, inventoryDirty = true;
  const pendingPurchaseKeys = new Map();
  const pendingGiftKeys = new Map();
  const pendingDeliveryKeys = new Map();
  const activeGiftItems = new Set();
  const activeDeliveryItems = new Set();

  function user() { return MiniTalk.Store.get("user") || {}; }
  function requireLogin() { const current=user();if(!current.user_id||current.isGuest)throw new Error("로그인 후 이용할 수 있어요.");return current; }
  function normalizeProduct(product={}) { const rawQuantity=product.quantity??product.stock??null,hasQuantity=rawQuantity!==null&&rawQuantity!==undefined&&String(rawQuantity).trim()!=="",quantity=hasQuantity?Math.max(0,Math.floor(Number(rawQuantity)||0)):null;return { id:String(product.id||""),name:String(product.name||"").trim().slice(0,60),description:String(product.description||"").trim().slice(0,160),imageUrl:String(product.imageUrl||product.image_url||"").trim().slice(0,7200),price:Math.max(1,Math.floor(Number(product.price)||0)),quantity,updatedAt:Number(product.updatedAt)||0 }; }
  function isSoldOut(product){return product?.quantity!==null&&product?.quantity!==undefined&&Number(product.quantity)<=0}
  function patchProductQuantity(productId,quantity){if(quantity===undefined)return;const catalog={...objectValue(MiniTalk.Store.get("shopCatalog"))},current=catalog[productId];if(!current)return;catalog[productId]=normalizeProduct({...current,quantity});writeCatalog(catalog);catalogLoadedAt=Date.now()}
  function normalizeInventory(item={}) { const product=objectValue(MiniTalk.Store.get("shopCatalog"))[item.productId]||{};const status=String(item.deliveryStatus||item.delivery_status||"").trim().toLowerCase();return{...item,id:String(item.id||""),productId:String(item.productId||""),name:item.name||product.name||"상품",description:item.description||product.description||"",imageUrl:item.imageUrl||product.imageUrl||"",price:Number(item.price||product.price)||0,deliveryStatus:["owned","requested","shipping","completed","cancelled"].includes(status)?status:(item.usedAt?"completed":"owned"),deliveryRequestedAt:Number(item.deliveryRequestedAt||item.delivery_requested_at)||0,deliveryCompletedAt:Number(item.deliveryCompletedAt||item.delivery_completed_at)||0,deliveryCancelledAt:Number(item.deliveryCancelledAt||item.delivery_cancelled_at)||0,deliveryHandledBy:String(item.deliveryHandledBy||item.delivery_handled_by||"")}; }

  function writeCatalog(catalog) { const current=objectValue(MiniTalk.Store.get("shopCatalog"));if(sameValue(current,catalog))return false;MiniTalk.Store.set("shopCatalog",catalog);MiniTalk.Persistence.set(CATALOG_CACHE_KEY,catalog);return true; }
  function hydrateCatalogCache() { const cached=objectValue(MiniTalk.Persistence.get(CATALOG_CACHE_KEY,{}));if(Object.keys(cached).length&&!Object.keys(objectValue(MiniTalk.Store.get("shopCatalog"))).length)MiniTalk.Store.set("shopCatalog",cached); }
  hydrateCatalogCache();

  MiniTalk.Events.on("rt:command",command=>{if(!["SHOP_GIFT","SHOP_DELIVERY_SHIPPING","SHOP_DELIVERY_COMPLETED","SHOP_DELIVERY_CANCELLED"].includes(command?.type))return;inventoryDirty=true;refreshInventory(true).catch(error=>console.warn("쇼핑 보관함 갱신 실패",error))});

  // Firebase 호환 보관함과 Apps Script 보관함을 합쳐 기존 구매품을 잃지 않습니다.
  MiniTalk.Events.on("rt:shop-inventory", value=>{
    const currentUser=user(),current=objectValue(MiniTalk.Store.get("shopInventory")),incoming={...objectValue(value)},prefix=`${currentUser.user_id||""}:`;
    // 선물 처리 중에는 늦게 도착한 Firebase 구형 mirror가 이미 숨긴 발신자 상품을 다시 살리지 못하게 합니다.
    activeGiftItems.forEach(opKey=>{if(opKey.startsWith(prefix)){const id=opKey.slice(prefix.length);if(id)delete incoming[id]}});
    const merged={...current,...incoming};if(!sameValue(current,merged))MiniTalk.Store.set("shopInventory",merged)
  });

  function products() { return Object.values(objectValue(MiniTalk.Store.get("shopCatalog"))).map(normalizeProduct).filter(item=>item.id&&item.name&&item.price>0).sort((a,b)=>a.price-b.price||a.name.localeCompare(b.name,"ko")); }
  async function refreshCatalog(force=false) {
    hydrateCatalogCache();
    if(!force&&Date.now()-catalogLoadedAt<30000)return products();
    if(catalogPromise)return catalogPromise;
    catalogPromise=MiniTalk.AuthApi.shopCatalog().then(rows=>{const catalog={};rows.map(normalizeProduct).filter(item=>item.id&&item.name&&item.price>0).forEach(item=>{catalog[item.id]=item});catalogLoadedAt=Date.now();writeCatalog(catalog);return products()}).finally(()=>{catalogPromise=null});
    return catalogPromise;
  }

  function inventoryCacheKey(userId){return`shop.inventory.server.${userId}`}
  function seenGiftKey(userId){return`shop.gifts.seen.${userId}`}
  function publishInventory(rows,current){
    const catalog=objectValue(MiniTalk.Store.get("shopCatalog")),server={};
    rows.map(normalizeInventory).filter(item=>item.id).forEach(item=>{server[item.id]={...item,imageUrl:item.imageUrl||catalog[item.productId]?.imageUrl||""}});
    const local=objectValue(MiniTalk.Store.get("shopInventory")),serverPurchaseKeys=new Set(Object.values(server).map(item=>String(item?.purchaseKey||"")).filter(Boolean)),pending=Object.fromEntries(Object.entries(local).filter(([,item])=>item?.pendingSync&&!serverPurchaseKeys.has(String(item.purchaseKey||""))));
    // 진행 중 배송/선물보다 먼저 시작된 보관함 조회가 늦게 돌아와도 옛 상태로 UI를 되돌리지 않습니다.
    // 배송은 로컬 requested 상태를 우선하고, 선물은 서버 확정 전까지 옛 소유 항목의 재등장을 막습니다.
    Object.entries(local).forEach(([id,item])=>{
      const opKey=`${current.user_id}:${id}`;
      if(activeDeliveryItems.has(opKey)&&item?.deliveryPending)server[id]=item;
    });
    const giftPrefix=`${current.user_id}:`;
    activeGiftItems.forEach(opKey=>{if(opKey.startsWith(giftPrefix)){const id=opKey.slice(giftPrefix.length);if(id)delete server[id]}});
    // Apps Script에 같은 purchaseKey가 확인된 상품은 예전 Realtime 로컬 mirror에서 제거합니다.
    // 서버에 없는 구형 local-only 상품은 건드리지 않아 마이그레이션 전 보유품을 잃지 않습니다.
    MiniTalk.Realtime.pruneShopInventoryMirror?.(current.user_id,[...serverPurchaseKeys]);
    const merged={...pending,...server},previous=objectValue(MiniTalk.Store.get("shopInventory"));if(!sameValue(previous,merged)){MiniTalk.Store.set("shopInventory",merged);MiniTalk.Persistence.set(inventoryCacheKey(current.user_id),merged)}
    const seen=new Set(MiniTalk.Persistence.get(seenGiftKey(current.user_id),[])||[]);let changed=false;
    Object.values(server).filter(item=>item.giftedAt&&!seen.has(item.id)).forEach(item=>{seen.add(item.id);changed=true;MiniTalk.Tools.Notifications?.notifyGift?.(item)});
    if(changed)MiniTalk.Persistence.set(seenGiftKey(current.user_id),[...seen].slice(-300));
    return inventory();
  }
  async function refreshInventory(force=false) {
    const current=user();if(!current.user_id||current.isGuest)return[];
    const currentUserId=String(current.user_id);
    // 로그인 직후 start()보다 보관함 갱신이 먼저 호출되어도 첫 응답을 버리지 않습니다.
    // 다른 계정으로 바뀐 경우에는 이전 계정의 진행 중 응답을 무효화하고 새 캐시로 교체합니다.
    if(activeUserId!==currentUserId){const hadActiveUser=!!activeUserId;inventoryVersion++;inventoryPromise=null;activeUserId=currentUserId;if(hadActiveUser)MiniTalk.Store.set("shopInventory",objectValue(MiniTalk.Persistence.get(inventoryCacheKey(activeUserId),{})))}
    if(!force&&inventoryPromise)return inventoryPromise;
    const version=inventoryVersion,request=MiniTalk.AuthApi.shopInventory(currentUserId).then(rows=>{if(version!==inventoryVersion||activeUserId!==currentUserId)return[];inventoryDirty=false;return publishInventory(rows,current)});
    inventoryPromise=request.finally(()=>{if(version===inventoryVersion)inventoryPromise=null});
    return inventoryPromise;
  }
  function start(current=user()) {
    /* Firebase 상품/피드/방 데이터를 상시 읽지 않는 최적화는 유지합니다.
     * Apps Script 보관함은 기존 안정 동작처럼 15초마다 확인해 선물/사용 상태 누락을 빠르게 복구합니다. */
    hydrateCatalogCache();shopActive=false;inventoryDirty=true;
    const nextUserId=!current.user_id||current.isGuest?"":String(current.user_id);
    if(activeUserId!==nextUserId){inventoryVersion++;inventoryPromise=null;activeUserId=nextUserId;const cached=activeUserId?objectValue(MiniTalk.Persistence.get(inventoryCacheKey(activeUserId),{})):{};MiniTalk.Store.set("shopInventory",cached)}
    if(!activeUserId)return;
    // 로그인 직후에는 저장된 보관함 캐시만 즉시 사용합니다.
    // 실제 서버 보관함은 쇼핑 탭 진입 또는 SHOP_* 실시간 신호에서 갱신해 로그인 요청 경합을 만들지 않습니다.
  }
  async function enter(){
    shopActive=true;const current=user();hydrateCatalogCache();
    const jobs=[refreshCatalog(false).catch(error=>{console.warn("상품 목록을 불러오지 못했습니다.",error);return products()})];
    if(current.user_id&&!current.isGuest&&(inventoryDirty||!Object.keys(objectValue(MiniTalk.Store.get("shopInventory"))).length))jobs.push(refreshInventory(true).then(rows=>{inventoryDirty=false;return rows}).catch(error=>{console.warn("보관함을 불러오지 못했습니다.",error);return inventory()}));
    return Promise.all(jobs)
  }
  function leave(){shopActive=false}

  async function saveProduct(product) { const current=requireLogin(),value=normalizeProduct({...product,id:product?.id||crypto.randomUUID(),updatedAt:Date.now()});if(!value.name||value.price<=0)throw new Error("상품 이름과 가격을 입력하세요.");const result=await MiniTalk.AuthApi.shopSaveProduct(current.user_id,MiniTalk.AdminSession.requireToken("SHOP"),value),saved=normalizeProduct({...value,...(result.product||{}),imageUrl:result.product?.imageUrl||result.product?.image_url||value.imageUrl});writeCatalog({...objectValue(MiniTalk.Store.get("shopCatalog")),[saved.id]:saved});catalogLoadedAt=Date.now();return saved; }
  async function deleteProduct(id) { const current=requireLogin();await MiniTalk.AuthApi.shopDeleteProduct(current.user_id,MiniTalk.AdminSession.requireToken("SHOP"),id);const catalog={...objectValue(MiniTalk.Store.get("shopCatalog"))};delete catalog[id];writeCatalog(catalog);catalogLoadedAt=Date.now(); }
  function inventory(now=Date.now()) { return Object.values(objectValue(MiniTalk.Store.get("shopInventory"))).map(normalizeInventory).filter(item=>!item.usedAt||now-Number(item.usedAt)<USED_VISIBLE_MS).sort((a,b)=>Number(b.createdAt||b.giftedAt||0)-Number(a.createdAt||a.giftedAt||0)); }
  function usedRemainingDays(item,now=Date.now()){return item?.usedAt?Math.max(0,Math.ceil((USED_VISIBLE_MS-(now-Number(item.usedAt)))/86400000)):0}
  function recipients(){return MiniTalk.UserDirectory?.all?.()||[]}
  function isActiveUser(current){const live=user();return Boolean(current?.user_id)&&!live.isGuest&&String(live.user_id||"")===String(current.user_id)}
  function persistInventoryMap(current,items){MiniTalk.Persistence.set(inventoryCacheKey(current.user_id),items);if(isActiveUser(current))MiniTalk.Store.set("shopInventory",items)}
  function putLocalInventory(current,item){if(!item?.id||!isActiveUser(current))return null;const items={...objectValue(MiniTalk.Store.get("shopInventory"))},saved=normalizeInventory(item);items[saved.id]=saved;persistInventoryMap(current,items);return saved}
  function removeLocalInventory(current,id){if(!isActiveUser(current))return;const items={...objectValue(MiniTalk.Store.get("shopInventory"))};if(!Object.prototype.hasOwnProperty.call(items,id))return;delete items[id];persistInventoryMap(current,items)}
  function syncInventoryLater(tasks){Promise.allSettled((tasks||[]).map(task=>Promise.resolve().then(task))).then(results=>{results.forEach(result=>{if(result.status==="rejected")console.warn("쇼핑 보관함 백그라운드 동기화 실패",result.reason)})})}

  async function purchase(product) {
    const current=requireLogin(),item=normalizeProduct(product);if(!item.id||!item.name||!item.price)throw new Error("구매할 상품 정보가 올바르지 않습니다.");
    const pendingKey=`${current.user_id}:${item.id}`,purchaseKey=pendingPurchaseKeys.get(pendingKey)||`${pendingKey}:${crypto.randomUUID()}`;pendingPurchaseKeys.set(pendingKey,purchaseKey);
    let result;
    try {
      // 별도 사전 조회 없이 기존 구매 요청에 화면의 상품 개정 정보를 함께 보냅니다.
      result=await MiniTalk.AuthApi.shopPurchase({userId:current.user_id,product:item,purchaseKey});
      patchProductQuantity(item.id,result.remaining_quantity);
    } catch(error) {
      if(["PRODUCT_CHANGED","PRICE_CHANGED","PRODUCT_NOT_AVAILABLE","PRODUCT_SOLD_OUT"].includes(error?.code)) {
        await refreshCatalog(true).catch(()=>{});
        pendingPurchaseKeys.delete(pendingKey);
        error.productChanged=true;
      }
      throw error;
    }
    const stored=result.item||{productId:item.id,name:item.name,description:item.description,imageUrl:item.imageUrl,price:item.price,purchaseKey,purchasedAt:Date.now(),createdAt:Date.now()};
    if(result.item)putLocalInventory(current,result.item);
    const balance=result.newCoin??result.coin??result.balance;if(balance!=null&&isActiveUser(current))MiniTalk.Economy.CoinWallet.setLocal(balance,"purchase");
    pendingPurchaseKeys.delete(pendingKey);
    if(!isActiveUser(current))return result;
    if(result.inventory_pending||!result.item){
      // 서버 구매는 확정됐지만 보관함 기록만 지연된 경우에는 서버 캐시에 임시 항목을 남겨 화면에서 사라지지 않게 합니다.
      // Realtime fallback 저장소에는 새 구매품을 복제하지 않습니다. 그 저장소는 영구 동기화되지 않아 오래된 상품이 다시 나타날 수 있습니다.
      const pendingItem={...stored,id:`pending-${crypto.randomUUID()}`,pendingSync:true};putLocalInventory(current,pendingItem);
      if(isActiveUser(current))await refreshInventory(true).catch(()=>{});
      if(balance==null&&isActiveUser(current))await MiniTalk.Economy.CoinWallet.refresh(true).catch(()=>{});
      return result;
    }
    // Apps Script 보관함이 권위 저장소입니다. 정상 구매는 이미 반환된 item을 즉시 표시하고 서버 재확인만 뒤에서 수행합니다.
    syncInventoryLater([async()=>{if(isActiveUser(current))await refreshInventory(true)}]);
    if(balance==null&&isActiveUser(current))MiniTalk.Economy.CoinWallet.refresh(true).catch(()=>{});
    return result;
  }
  async function randomPurchase() {
    const current=requireLogin();
    const available=products().filter(product=>!isSoldOut(product));
    if(!available.length)throw new Error("추첨할 상품이 아직 없습니다.");
    const pendingKey=`${current.user_id}:random`,purchaseKey=pendingPurchaseKeys.get(pendingKey)||`${pendingKey}:${crypto.randomUUID()}`;
    pendingPurchaseKeys.set(pendingKey,purchaseKey);
    let result;
    try {
      result=await MiniTalk.AuthApi.shopPurchase({userId:current.user_id,product:null,purchaseKey,randomPurchase:true,price:3});
      if(result.product_id)patchProductQuantity(result.product_id,result.remaining_quantity);
    } catch(error) {
      if(["PRODUCT_NOT_AVAILABLE","NO_RANDOM_PRODUCTS"].includes(error?.code))await refreshCatalog(true).catch(()=>{});
      if(error?.code!=="REQUEST_TIMEOUT")pendingPurchaseKeys.delete(pendingKey);
      throw error;
    }
    const won=normalizeProduct({
      id:result.product_id||result.item?.productId,
      name:result.product_name||result.item?.name,
      description:result.product_description||result.item?.description||"",
      imageUrl:result.product_image_url||result.item?.imageUrl||"",
      price:result.original_price||result.item?.originalPrice||result.item?.price||3,
      updatedAt:result.product_updated_at||0
    });
    const stored=result.item||{productId:won.id,name:won.name,description:won.description,imageUrl:won.imageUrl,price:3,purchaseKey,purchasedAt:Date.now(),createdAt:Date.now()};
    if(result.item)putLocalInventory(current,result.item);
    const balance=result.newCoin??result.coin??result.balance;
    if(balance!=null&&isActiveUser(current))MiniTalk.Economy.CoinWallet.setLocal(balance,"random-purchase");
    pendingPurchaseKeys.delete(pendingKey);
    if(!isActiveUser(current))return {...result,product:won,item:stored};
    if(result.inventory_pending||!result.item){
      const pendingItem={...stored,id:`pending-${crypto.randomUUID()}`,pendingSync:true};putLocalInventory(current,pendingItem);
      if(isActiveUser(current))await refreshInventory(true).catch(()=>{});
      if(balance==null&&isActiveUser(current))await MiniTalk.Economy.CoinWallet.refresh(true).catch(()=>{});
      return {...result,product:won,item:stored};
    }
    syncInventoryLater([async()=>{if(isActiveUser(current))await refreshInventory(true)}]);
    if(balance==null&&isActiveUser(current))MiniTalk.Economy.CoinWallet.refresh(true).catch(()=>{});
    return {...result,product:won,item:stored};
  }
  async function use(id) { const current=requireLogin(),item=inventory().find(row=>row.id===id);if(!item||item.usedAt)throw new Error("사용할 수 없는 상품입니다.");const result=await MiniTalk.AuthApi.shopUse({userId:current.user_id,inventoryId:id,item}),usedAt=Number(result.usedAt)||Date.now();try{await MiniTalk.Realtime.useShopInventory(id,usedAt)}catch(error){console.warn("Firebase 보관함 사용 상태 동기화 실패",error)}await refreshInventory(true);return usedAt; }
  async function requestDelivery(id) {
    const current=requireLogin(),item=inventory().find(row=>row.id===id);
    if(!item)throw new Error("배송 요청할 상품을 찾을 수 없습니다.");
    if(item.usedAt||item.deliveryStatus==="completed")throw new Error("이미 배송이 완료된 상품입니다.");
    if(item.deliveryStatus==="requested"||item.deliveryStatus==="shipping")throw new Error("이미 배송이 진행 중입니다.");
    const pendingKey=`${current.user_id}:${id}`,requestId=pendingDeliveryKeys.get(pendingKey)||crypto.randomUUID(),previous={...item};
    pendingDeliveryKeys.set(pendingKey,requestId);
    activeDeliveryItems.add(pendingKey);
    // 클릭 직후 보관함 카드부터 요청 상태로 바꿔 서버 왕복 시간을 UI 반응시간으로 느끼지 않게 합니다. 실패하면 원래 상태로 되돌립니다.
    // activeDeliveryItems가 진행 중인 동안 늦게 도착한 옛 inventory 응답은 이 상태를 덮어쓸 수 없습니다.
    putLocalInventory(current,{...item,deliveryStatus:"requested",deliveryRequestedAt:Date.now(),deliveryPending:true});
    try {
      const result=await MiniTalk.AuthApi.shopRequestDelivery({userId:current.user_id,inventoryId:id,item,requestId});
      putLocalInventory(current,{...(result.item||item),deliveryStatus:result.deliveryStatus||result.item?.deliveryStatus||"requested",deliveryRequestedAt:Number(result.deliveryRequestedAt||result.item?.deliveryRequestedAt)||Date.now(),deliveryPending:false});
      // 서버 재검증은 화면 응답을 막지 않고 백그라운드에서 수행합니다.
      if(isActiveUser(current))refreshInventory(true).catch(()=>{});
      return result;
    } catch(error) {
      putLocalInventory(current,previous);
      throw error;
    } finally {
      activeDeliveryItems.delete(pendingKey);
      pendingDeliveryKeys.delete(pendingKey);
    }
  }
  async function requestDeliveryBulk(ids) {
    const current=requireLogin(),wanted=[...new Set((Array.isArray(ids)?ids:[]).map(String).filter(Boolean))].slice(0,20);
    if(wanted.length<2)throw new Error("묶음배송할 상품을 2개 이상 선택하세요.");
    const items=inventory(),byId=new Map(items.map(item=>[String(item.id),item])),selected=wanted.map(id=>byId.get(id)).filter(Boolean);
    if(selected.length!==wanted.length)throw new Error("선택한 상품 중 보관함에서 찾을 수 없는 항목이 있습니다.");
    selected.forEach(item=>{if(item.usedAt||item.deliveryStatus==="completed"||item.deliveryStatus==="requested"||item.deliveryStatus==="shipping")throw new Error("이미 배송 중이거나 완료된 상품은 묶음배송에 넣을 수 없습니다.")});
    const previous=new Map(selected.map(item=>[String(item.id),{...item}])),requestId=crypto.randomUUID();
    selected.forEach(item=>{const key=`${current.user_id}:${item.id}`;activeDeliveryItems.add(key);putLocalInventory(current,{...item,deliveryStatus:"requested",deliveryRequestedAt:Date.now(),deliveryPending:true})});
    try {
      const result=await MiniTalk.AuthApi.shopRequestDeliveryBulk({userId:current.user_id,inventoryIds:wanted,requestId});
      const returned=Array.isArray(result.items)?result.items:[];
      returned.forEach(item=>putLocalInventory(current,{...item,deliveryStatus:item.deliveryStatus||"requested",deliveryPending:false}));
      if(isActiveUser(current))refreshInventory(true).catch(()=>{});
      return {...result,count:Number(result.count)||returned.length};
    } catch(error) {
      selected.forEach(item=>putLocalInventory(current,previous.get(String(item.id))));
      throw error;
    } finally {
      selected.forEach(item=>activeDeliveryItems.delete(`${current.user_id}:${item.id}`));
    }
  }
  const DEFINITE_GIFT_FAILURES = new Set(["GIFT_ITEM_NOT_AVAILABLE","GIFT_REQUEST_CONFLICT","INVALID_GIFT_TARGET","LOGIN_REQUIRED","SHOP_BUSY"]);
  const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
  function finishGiftSuccess(current,target,id,pendingKey,itemOpKey){
    pendingGiftKeys.delete(pendingKey);activeGiftItems.delete(itemOpKey);removeLocalInventory(current,id);
    if(isActiveUser(current)){MiniTalk.Realtime.notifyCommandTargets?.([target.user_id]);syncInventoryLater([async()=>{if(!isActiveUser(current))return;await MiniTalk.Realtime.removeShopInventory?.(id,current.user_id);if(isActiveUser(current))await refreshInventory(true)}])}
  }
  async function reconcileGift(current,target,id,item,previous,requestId,pendingKey,itemOpKey){
    await wait(700);
    try {
      await MiniTalk.AuthApi.shopGift({userId:current.user_id,nickname:current.nickname,targetId:target.user_id,inventoryId:id,item,requestId});
      finishGiftSuccess(current,target,id,pendingKey,itemOpKey);
      MiniTalk.Events.emit("shopping:gift-resolved",{status:"sent",targetNickname:target.nickname,itemName:item.name});
      return;
    } catch(error) {
      if(DEFINITE_GIFT_FAILURES.has(String(error?.code||""))){
        activeGiftItems.delete(itemOpKey);putLocalInventory(current,previous);
        MiniTalk.Events.emit("shopping:gift-resolved",{status:"failed",message:error.message||"선물을 보내지 못했습니다."});
        return;
      }
    }
    // 응답 유실 여부는 발신자 서버 보관함을 다시 읽어 최종 소유권으로 판정합니다.
    // 이 확인은 백그라운드에서만 수행하므로 선물창을 추가로 붙잡지 않습니다.
    try {
      const rows=await MiniTalk.AuthApi.shopInventory(current.user_id),stillOwned=rows.some(row=>String(row?.id||"")===String(id));
      activeGiftItems.delete(itemOpKey);
      if(stillOwned){putLocalInventory(current,previous);MiniTalk.Events.emit("shopping:gift-resolved",{status:"failed",message:"선물 전송이 완료되지 않아 상품을 보관함에 돌려놓았습니다."});return}
      finishGiftSuccess(current,target,id,pendingKey,itemOpKey);
      MiniTalk.Events.emit("shopping:gift-resolved",{status:"sent",targetNickname:target.nickname,itemName:item.name});
    } catch(error) {
      // 결과를 모르는 상태에서 예전 상품을 되살리면 실제 전송 완료와 화면이 충돌할 수 있으므로 숨김을 유지합니다.
      // 다음 쇼핑 진입/보관함 갱신 때 Apps Script의 실제 소유 상태로 자동 정리됩니다.
      inventoryDirty=true;
      // 잠시 더 숨김 보호를 유지한 뒤 실제 서버 보관함을 다시 읽습니다. 화면은 기다리지 않습니다.
      setTimeout(()=>{activeGiftItems.delete(itemOpKey);if(isActiveUser(current))refreshInventory(true).catch(()=>{})},5000);
      MiniTalk.Events.emit("shopping:gift-resolved",{status:"pending",message:"선물 처리 결과를 아직 확인 중입니다. 보관함은 서버 상태로 자동 갱신됩니다."});
    }
  }
  async function gift(id,targetId) {
    const current=requireLogin(),item=inventory().find(row=>row.id===id);
    if(!item||item.usedAt||item.deliveryStatus==="completed"||item.deliveryStatus==="requested"||item.deliveryStatus==="shipping")throw new Error("선물할 수 없는 상품입니다.");
    const target=recipients().find(row=>row.user_id===targetId);if(!target)throw new Error("선물할 사용자를 찾을 수 없습니다.");
    const pendingKey=`${current.user_id}:${id}:${target.user_id}`,itemOpKey=`${current.user_id}:${id}`,requestId=pendingGiftKeys.get(pendingKey)||crypto.randomUUID(),previous={...item};pendingGiftKeys.set(pendingKey,requestId);
    activeGiftItems.add(itemOpKey);
    // 선물 버튼을 누른 즉시 보관함에서 감춥니다. 명확한 서버 거절일 때만 즉시 복구합니다.
    // timeout/네트워크 단절은 서버 처리가 끝났을 수도 있으므로 "실패"로 단정하지 않습니다.
    removeLocalInventory(current,id);
    try {
      await MiniTalk.AuthApi.shopGift({userId:current.user_id,nickname:current.nickname,targetId:target.user_id,inventoryId:id,item,requestId});
      finishGiftSuccess(current,target,id,pendingKey,itemOpKey);
      return{targetId:target.user_id,targetNickname:target.nickname,pending:false};
    } catch(error) {
      if(DEFINITE_GIFT_FAILURES.has(String(error?.code||""))){activeGiftItems.delete(itemOpKey);putLocalInventory(current,previous);throw error}
      // 결과가 모호한 오류는 같은 requestId로 백그라운드 재확인해 중복 선물을 막습니다.
      reconcileGift(current,target,id,item,previous,requestId,pendingKey,itemOpKey).catch(()=>{});
      return{targetId:target.user_id,targetNickname:target.nickname,pending:true};
    }
  }

  return{products,refreshCatalog,refreshInventory,start,enter,leave,saveProduct,deleteProduct,inventory,recipients,purchase,randomPurchase,use,requestDelivery,requestDeliveryBulk,gift,normalizeProduct,normalizeInventory,isSoldOut,usedRemainingDays,requireLogin,USED_VISIBLE_MS};
})();
